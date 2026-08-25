// ============================================================
// ТАБЛИЦА ПРИБОРОВ — модуль ТОЛЬКО десктопного приложения (Electron)
// Task 148: кнопка «Таблица» на странице «Приборы по производствам»
// (в шапке, справа от поля поиска). Переключает вид списка:
// карточки  <->  табличный вид (по образцу Excel / Google Таблиц).
//
// Возможности (начальная версия,       Task 148):
//   - табличный вид всех колонок данных приборов (23 колонки),
//     горизонтальная прокрутка;
//   - закреплённые: шапка таблицы + колонки «№» и «Наименование»;
//   - сортировка по любой колонке (клик по заголовку, asc/desc);
//   - чередование строк (зебра), подсветка строки при наведении;
//   - клик по ячейке столбца «№» — карточка прибора (detail-панель);
//   - поле «Поиск…» фильтрует строки таблицы (общий механизм);
//   - подсказки (title) с полным текстом обрезанных ячеек;
//   - состояние (карточки/таблица) запоминается в localStorage.
// Task 163:
//   - счётчик «Показано приборов: N» и кнопка «Экспорт CSV» перенесены
//     в шапку страницы, справа от кнопки «Таблица» (группа в один ряд);
//   - таблица занимает всю свободную площадь без отступов от краёв
//     (fitTableHeight подгоняет высоту; resize и detail-панель учтены).
// Task 165:
//   - точные совпадения поискового запроса подсвечиваются жёлтым
//     фоном <mark> в ячейках таблицы (по словам запроса, как в списках).
// Task 168:
//   - фильтры по колонкам (как в Excel): выпадающий список уникальных
//     значений в заголовке, мультивыбор чекбоксами, живое применение;
//   - изменение ширины колонок мышью (граница заголовка), ширины
//     сохраняются в localStorage;
//   - навигация с клавиатуры: стрелки — по строкам, Enter — открыть
//     карточку, Home/End — в начало/конец списка;
//   - виртуальный скролл: рендерится только видимое окно строк
//     (+ буфер) — быстрая прокрутка на слабых машинах.
// Task 169:
//   - статистика по колонке: правый клик по заголовку — панель
//     «Количество по значениям» (значения + счётчики + % + бары);
//   - метки строк по условиям: «Дата старше N лет» (янтарная полоса)
//     и «В гр. ППР: Нет» (красная полоса) — тонкие цветные метки
//     слева у строки; условия настраиваются кнопкой ⚑ в шапке.
// Task 172:
//   - правая разделительная рамка столбца «№» чуть жирнее остальных;
//   - кнопка «Сбросить все фильтры» (воронка с крестом) в шапке,
//     слева от «Метки строк»: янтарная + счётчик установленных
//     фильтров, клик — сброс всех фильтров по колонкам разом;
//   - карточка прибора открывается ТОЛЬКО кликом по ячейкам
//     столбца «№» (клик по другим ячейкам лишь выделяет строку).
//
// Модуль самодостаточен; зависимости — глобальные: devData,
// devRenderSorted, devOpenDetail, KipAuth. Загружается loader'ом
// в index.html при IS_ELECTRON (Task 147/148) — мобильная PWA
// не содержит и не загружает этот файл.
// ============================================================
(function () {
    'use strict';

    // ---------- Состояние ----------
    var tableMode = false;                    // текущий вид: false=карточки, true=таблица
    var sortState = { key: null, dir: 1 };    // сортировка: { key: поле, dir: 1|−1 }
    var lastDevices = [];                     // приборы последней конвертации (для пересортировки)
    // Task 168: фильтры по колонкам — key -> массив выбранных значений
    var colFilters = {};
    // Task 168: ширины колонок (сохраняются в localStorage)
    var colWidths = {};
    try {
        var _savedW = localStorage.getItem('devTableColWidths');
        if (_savedW) colWidths = JSON.parse(_savedW) || {};
    } catch (e) {}
    // Task 168: строки после фильтров+сортировки (навигация/экспорт)
    var currentRows = [];
    // Task 168: клавиатурный фокус (индекс строки в currentRows)
    var focusIndex = -1;
    // Task 168: виртуальный скролл
    var rowH = 31;          // высота строки (замеряется после первого рендера)
    var VBUF = 14;          // буфер строк сверху/снизу видимого окна
    var _rowHMeasured = false;
    // Task 169: метки строк по условиям (подсветка слева)
    // oldDate: «Дата» старше N лет — янтарная полоса
    // noPPR: «В гр. ППР» = «Нет» — красная полоса
    // (в данных «В гр. ППР» только «Есть»/«Нет» — «пусто» трактуем как «Нет»)
    var marksCfg = { oldDate: { on: false, years: 5 }, noPPR: { on: false } };
    try {
        var _savedM = localStorage.getItem('devTableMarks');
        if (_savedM) {
            var _m = JSON.parse(_savedM);
            if (_m && typeof _m === 'object') {
                if (_m.oldDate) marksCfg.oldDate = { on: !!_m.oldDate.on, years: Math.max(1, parseInt(_m.oldDate.years, 10) || 5) };
                if (_m.noPPR) marksCfg.noPPR = { on: !!_m.noPPR.on };
            }
        }
    } catch (e) {}

    // Восстановить сохранённое состояние вида
    try { tableMode = localStorage.getItem('devTableMode') === '1'; } catch (e) {}

    // ---------- Утилиты ----------
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ---------- Task 165: подсветка точных совпадений в ячейках ----------
    // Подсвечивает <mark> каждое слово запроса (нормализация: lowercase,
    // ё->е, только буквы/цифры — как devMark в index.html).
    function markCell(val, query) {
        var text = String(val == null ? '' : val);
        if (!query) return esc(text);
        var words = String(query).trim().split(/\s+/).filter(Boolean);
        if (!words.length) return esc(text);
        var patterns = [];
        words.forEach(function (w) {
            var n = w.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/gi, '');
            if (!n) return;
            // ВАЖНО: сначала экранируем спецсимволы, ПОТОМ «е» -> [её]
            // (иначе скобки класса тоже экранируются и матчят буквальный текст)
            n = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            n = n.replace(/е/g, '[её]');
            patterns.push(n);
        });
        if (!patterns.length) return esc(text);
        var regex;
        try { regex = new RegExp('(' + patterns.join('|') + ')', 'gi'); }
        catch (e) { return esc(text); }
        var result = '';
        var lastIdx = 0;
        var m;
        while ((m = regex.exec(text)) !== null) {
            if (m[0].length === 0) { regex.lastIndex++; continue; }
            result += esc(text.slice(lastIdx, m.index));
            result += '<mark>' + esc(m[0]) + '</mark>';
            lastIdx = m.index + m[0].length;
        }
        result += esc(text.slice(lastIdx));
        return result;
    }

    // Текущий поисковый запрос со страницы «Приборы по производствам»
    // (общее поле #devProdSearchInput — тот же запрос, что фильтрует карточки)
    function currentSearchQuery() {
        try {
            var el = document.getElementById('devProdSearchInput');
            return el ? String(el.value || '').trim() : '';
        } catch (e) { return ''; }
    }

    // ---------- Колонки таблицы ----------
    // width — начальная ширина; sticky — закрепить слева.
    var COLUMNS = [
        { key: '__num__',  label: '№',          width: 48,  sticky: 1, sortable: false },
        { key: 'Наименование',                  label: 'Наименование',      width: 240 },
        { key: 'Тип',                           label: 'Тип',               width: 130 },
        { key: '№ прибора',                     label: '№ прибора',         width: 95 },
        { key: 'Предел измерения',              label: 'Предел измерения',  width: 150 },
        { key: 'Погрешность',                   label: 'Погрешность',       width: 110 },
        { key: 'Место установки',               label: 'Место установки',   width: 150 },
        { key: 'Производство',                  label: 'Производство',      width: 130 },
        { key: 'Оборудование',                  label: 'Оборудование',      width: 140 },
        { key: 'Параметр',                      label: 'Параметр',          width: 140 },
        { key: 'Место расположения',            label: 'Место расположения', width: 140 },
        { key: 'Позиция',                       label: 'Позиция',           width: 80 },
        { key: '№ проекта',                     label: '№ проекта',         width: 85 },
        { key: '№ СБС',                         label: '№ СБС',             width: 80 },
        { key: '№ САР',                         label: '№ САР',             width: 80 },
        { key: 'В перечне',                     label: 'В перечне',         width: 90 },
        { key: 'В гр. ППР',                     label: 'В гр. ППР',         width: 90 },
        { key: 'Технические характеристики',    label: 'Тех. характеристики', width: 230 },
        { key: 'Примечания',                    label: 'Примечания',        width: 160 },
        { key: 'Замечания',                     label: 'Замечания',         width: 160, restricted: true },
        { key: 'Дата',                          label: 'Дата',              width: 85 },
        { key: 'Вид ремонта',                   label: 'Вид ремонта',       width: 110 },
        { key: 'Период ремонта',                label: 'Период ремонта',    width: 105 }
    ];

    // Колонки с учётом ограничений роли (фильтр 4 скрывает «Замечания»)
    function activeColumns() {
        var restricted = false;
        try {
            restricted = (typeof KipAuth !== 'undefined' && KipAuth._hasRestrictedKipIos && KipAuth._hasRestrictedKipIos());
        } catch (e) {}
        return COLUMNS.filter(function (c) { return !(restricted && c.restricted); });
    }

    // ---------- CSS ----------
    var css = [
        '/* ===== Task 148: Таблица приборов (только десктоп) ===== */',
        /* Task 163: группа в шапке; Task 175: в табличном виде — два ряда:
           кнопки сверху (верхняя половина бара), счётчик под ними */
        '.dev-table-header-group {',
        '  position: absolute; top: 50%; right: 8px; transform: translateY(-50%);',
        '  display: flex; align-items: center; gap: 8px; z-index: 2;',
        '}',
        '.dev-table-header-group.table-active {',
        '  top: 4px; transform: none;',
        '  flex-direction: column; align-items: flex-end; gap: 3px;',
        '}',
        /* Task 175: ряд кнопок [Таблица][сброс][метки][CSV] — единая высота 28px */
        '.dev-table-btn-row { display: flex; align-items: center; gap: 8px; }',
        '.dev-table-toggle-btn {',
        '  position: relative;  /* Task 166: якорь для полосы-разделителя */',
        /* Task 175: единая высота кнопок бара — 28px */
        '  height: 28px; box-sizing: border-box; padding: 0 12px; min-width: 76px;',
        '  border: 1px solid rgba(74,143,199,0.35); border-radius: 8px;',
        '  background: rgba(74,143,199,0.10); color: #6aa6e0;',
        '  font-size: 13px; font-weight: 600; font-family: inherit;',
        '  cursor: pointer; white-space: nowrap; transition: all 0.15s;',
        '}',
        /* Task 166: вертикальная полоса между лупой поиска и «Таблица» —
           по образцу разделителя вкладок верхнего бара
           (.desktop-top-bar-divider: 1px x 24px, var(--border-color)).
           Полоса — псевдоэлемент кнопки «Таблица», стоит по центру 8px-зазора
           до лупы; работает и в карточном, и в табличном виде (зазор везде 8px) */
        '.dev-table-toggle-btn::before {',
        '  content: \'\';',
        '  position: absolute;',
        '  left: -4.5px;   /* центр 8px-зазора между лупой и кнопкой */',
        '  top: 50%;',
        '  transform: translateY(-50%);',
        '  width: 1px;',
        '  height: 24px;',
        '  background: var(--border-color, rgba(74,143,199,0.25));',
        '  pointer-events: none;',
        '}',
        /* Task 175: в табличном виде кнопки подняты в верхнюю половину бара —
           полоса центрируется по ГРУППЕ (группа — position: absolute,
           якорит ::before), оставаясь напротив лупы; полоса самой
           кнопки «Таблица» в этом режиме отключается */
        '.dev-table-header-group.table-active::before {',
        '  content: \'\';',
        '  position: absolute;',
        '  left: -4.5px;',
        '  top: 50%;',
        '  transform: translateY(-50%);',
        '  width: 1px;',
        '  height: 24px;',
        '  background: var(--border-color, rgba(74,143,199,0.25));',
        '  pointer-events: none;',
        '}',
        '.dev-table-header-group.table-active .dev-table-toggle-btn::before { display: none; }',
        '.dev-table-toggle-btn:hover { background: rgba(74,143,199,0.18); border-color: rgba(74,143,199,0.5); }',
        '.dev-table-toggle-btn.active {',
        '  background: rgba(74,143,199,0.25); border-color: rgba(74,143,199,0.65); color: #9ec6ec;',
        '}',
        '.dev-table-toggle-btn:active { transform: scale(0.96); }',
        '[data-theme="light"] .dev-table-toggle-btn { background: rgba(74,143,199,0.08); color: #3a6ea5; border-color: rgba(58,110,165,0.35); }',
        '[data-theme="light"] .dev-table-toggle-btn.active { background: rgba(74,143,199,0.2); color: #2a5885; }',
        /* Поиск сдвигается левее кнопки (только на странице «по производствам») */
        '#page-devices-prod .page-inline-header:has(.dev-table-toggle-btn) .dev-header-search { right: 92px; }',
        /* Task 163: в табличном виде лупа и поле поиска — левее всей группы
           (ширина группы транслируется в CSS-переменную --devt-group-w) */
        '#page-devices-prod .page-inline-header:has(.dev-table-header-group.table-active) .dev-search-toggle-btn {',
        '  right: var(--devt-group-w, 360px);',
        '}',
        '#page-devices-prod .page-inline-header:has(.dev-table-header-group.table-active) .dev-header-search {',
        '  right: var(--devt-group-w, 360px);',
        '}',
        /* Task 166: и в КАРТОЧНОМ виде лупа — на том же расстоянии от группы
           (правило перекрывает статичное right: 92px из Task 149 специфичностью:
           :has(.dev-table-header-group:not(.table-active)) > :has(.dev-table-toggle-btn)).
           Зазор лупа→«Таблица» становится единым 8px в обоих режимах —
           полоса-разделитель ::before всегда по центру зазора */
        '#page-devices-prod .page-inline-header:has(.dev-table-header-group:not(.table-active)) .dev-search-toggle-btn {',
        '  right: var(--devt-group-w, 92px);',
        '}',
        '#page-devices-prod .page-inline-header:has(.dev-table-header-group:not(.table-active)) .dev-header-search {',
        '  right: var(--devt-group-w, 92px);',
        '}',

        '/* Контейнер таблицы — собственная прокрутка, как лист Excel.',
        '   Task 163: на всю свободную площадь, без отступов от краёв */',
        '.dev-table-wrap {',
        '  margin: 0; border: none; border-radius: 0;',
        '  overflow: auto; background: rgba(22,28,38,0.96);',
        '  height: calc(100vh - 132px); /* стартовое значение, уточняет fitTableHeight() */',
        '}',
        '[data-theme="light"] .dev-table-wrap { background: #ffffff; }',
        '/* Task 163: в табличном виде — без нижнего паддинга страницы (таблица до низа) */',
        '#page-devices-prod.dev-table-full { padding-bottom: 0 !important; }',
        /* Task 168: table-layout fixed — ширины колонок задаются точно
           (как в Excel). ВАЖНО: при min-width:100% без width Chromium
           трактует таблицу как width:100% и перераспределяет колонки
           пропорционально — поэтому таблице задаётся ЯВНАЯ ширина = сумме
           колонок (см. buildTableHtml / ресайз); min-width:100% остаётся
           для заполнения контейнера при узкой таблице */
        '.dev-table { table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: 12.5px; min-width: 100%; }',
        '.dev-table th {',
        '  position: sticky; top: 0; z-index: 3;',
        '  background: #233043; color: #c8d6e8; font-weight: 600; text-align: left;',
        '  padding: 8px 10px; white-space: nowrap; user-select: none;',
        '  border-right: 1px solid rgba(255,255,255,0.07);',
        '  border-bottom: 2px solid rgba(74,143,199,0.45);',
        '  cursor: pointer;',
        '}',
        '.dev-table th:hover { background: #2a3a52; }',
        '.dev-table th.dev-table-col-sorted-asc, .dev-table th.dev-table-col-sorted-desc { color: #8fc1ee; }',
        '.dev-table .dev-table-sort-icon { display: inline-block; margin-left: 4px; opacity: 0.55; font-size: 10px; }',
        '.dev-table td {',
        '  padding: 5px 10px; color: #b6c2d4; white-space: nowrap;',
        '  border-right: 1px solid rgba(255,255,255,0.045);',
        '  border-bottom: 1px solid rgba(255,255,255,0.045);',
        '  max-width: 340px; overflow: hidden; text-overflow: ellipsis;',
        '}',
        '.dev-table td { user-select: text; -webkit-user-select: text; }',
        '.dev-table tbody tr { background: transparent; }',
        '.dev-table tbody tr:nth-child(even) { background: rgba(255,255,255,0.025); }',
        '.dev-table tbody tr:hover { background: rgba(74,143,199,0.10); }',
        '.dev-table tbody tr.dev-table-row-selected { background: rgba(74,143,199,0.16) !important; }',
        /* Закреплённые колонки: Task 171 — только «№» */
        /* Task 171: закреплена ТОЛЬКО колонка «№» (sticky-2 «Наименование» —
           откреплена по запросу); остальные колонки прокручиваются */
        '.dev-table .dev-table-sticky-1 { position: sticky; left: 0; z-index: 2; background: #1a2331; }',
        '.dev-table tbody tr:nth-child(even) .dev-table-sticky-1 { background: #1f2937; }',
        '.dev-table tbody tr:hover .dev-table-sticky-1 { background: #243246; }',
        '.dev-table thead .dev-table-sticky-1 { z-index: 4; background: #233043; }',
        '.dev-table thead .dev-table-sticky-1:hover { background: #2a3a52; }',
        /* Светлая тема */
        '[data-theme="light"] .dev-table th { background: #e8edf4; color: #33465e; border-right-color: rgba(0,0,0,0.07); }',
        '[data-theme="light"] .dev-table th:hover { background: #dde5f0; }',
        '[data-theme="light"] .dev-table td { color: #2c3a4c; border-right-color: rgba(0,0,0,0.05); border-bottom-color: rgba(0,0,0,0.05); }',
        '[data-theme="light"] .dev-table tbody tr:nth-child(even) { background: rgba(0,0,0,0.025); }',
        '[data-theme="light"] .dev-table tbody tr:hover { background: rgba(74,143,199,0.10); }',
        '[data-theme="light"] .dev-table .dev-table-sticky-1 { background: #ffffff; }',
        '[data-theme="light"] .dev-table tbody tr:nth-child(even) .dev-table-sticky-1 { background: #f6f8fb; }',
        '[data-theme="light"] .dev-table tbody tr:hover .dev-table-sticky-1 { background: #eaf1f9; }',
        '[data-theme="light"] .dev-table thead .dev-table-sticky-1 { background: #e8edf4; }',
        /* Task 172: правая разделительная рамка столбца «№» — чуть жирнее
           остальных (2px, в тон линии под шапкой таблицы) */
        '.dev-table th.dev-table-col-num { border-right: 2px solid rgba(74,143,199,0.50); }',
        '.dev-table td.dev-table-col-num { border-right: 2px solid rgba(74,143,199,0.38); }',
        '[data-theme="light"] .dev-table th.dev-table-col-num { border-right-color: rgba(58,110,165,0.45); }',
        '[data-theme="light"] .dev-table td.dev-table-col-num { border-right-color: rgba(58,110,165,0.35); }',
        /* Task 172: клик по ячейке «№» открывает карточку — курсор-рука */
        '.dev-table tbody td.dev-table-col-num { cursor: pointer; }',
        /* Task 163: счётчик приборов и «Экспорт CSV» — в шапке, справа от «Таблица».
           Видны только в табличном виде (класс .table-active на группе). */
        '.dev-table-header-group .dev-table-count,',
        '.dev-table-header-group .dev-table-csv-btn { display: none; }',
        '.dev-table-header-group.table-active .dev-table-count { display: inline-block; }',
        '.dev-table-header-group.table-active .dev-table-csv-btn { display: inline-block; }',
        '.dev-table-count {',
        /* Task 175: счётчик — под рядом кнопок, компактнее */
        '  font-size: 11.5px; font-weight: 600; white-space: nowrap; line-height: 1.2; text-align: right;',
        '  color: var(--text-secondary, rgba(255,255,255,0.55));',
        '}',
        '[data-theme="light"] .dev-table-count { color: rgba(20,20,19,0.6); }',
        '.dev-table-csv-btn {',
        /* Task 175: единая высота 28px */
        '  height: 28px; box-sizing: border-box; padding: 0 12px; border: 1px solid rgba(74,143,199,0.35); border-radius: 7px;',
        '  background: rgba(74,143,199,0.10); color: #6aa6e0; font-size: 12px; font-weight: 600;',
        '  font-family: inherit; cursor: pointer; transition: all 0.15s;',
        '}',
        '.dev-table-csv-btn:hover { background: rgba(74,143,199,0.2); }',
        '[data-theme="light"] .dev-table-csv-btn { background: rgba(74,143,199,0.08); color: #3a6ea5; }',
        /* Task 165: жёлтая подсветка точных совпадений в ячейках таблицы */
        '.dev-table td mark { background: #ffd60a; color: #1a1a1a; padding: 0 1px; border-radius: 2px; }',
        /* ===== Task 168: фильтры по колонкам (как в Excel) ===== */
        /* Task 171: отступ под квадратную кнопку фильтра справа */
        '.dev-table th { padding-right: 18px; }',
        /* Task 171: кнопка фильтра — квадрат справа во всю высоту шапки,
           без отступов от краёв (th position:sticky — якорит absolute) */
        '.dev-table-filter-btn {',
        '  position: absolute; top: 0; right: 0; bottom: 0;',
        '  width: 18px;',
        '  display: flex; align-items: center; justify-content: center;',
        '  font-size: 9px; line-height: 1;',
        /* Task 174: кнопка фильтра выделена ярче — насыщенный голубой
           вместо тускло-серого полупрозрачного */
        '  color: #7db9f5; cursor: pointer; user-select: none;',
        '}',
        /* Task 174: hover и активный фильтр — тоже ярче (синяя/янтарная плашка) */
        '.dev-table-filter-btn:hover { color: #d5e9fd; background: rgba(125,185,245,0.22); }',
        '.dev-table-filter-btn.has-filter { color: #ffd60a; background: rgba(255,214,10,0.22); }',
        '[data-theme="light"] .dev-table-filter-btn { color: #3a6ea5; }',
        '[data-theme="light"] .dev-table-filter-btn:hover { color: #1b5aa6; background: rgba(58,110,165,0.13); }',
        '[data-theme="light"] .dev-table-filter-btn.has-filter { color: #c77e00; background: rgba(199,126,0,0.16); }',
        '.dev-table-filter-dd {',
        '  position: fixed; z-index: 1000; min-width: 250px; max-width: 330px;',
        '  background: #1a2331; border: 1px solid rgba(74,143,199,0.4); border-radius: 8px;',
        '  box-shadow: 0 8px 24px rgba(0,0,0,0.45); font-size: 12.5px; color: #c8d6e8;',
        '  font-family: inherit; overflow: hidden;',
        '}',
        '.dev-table-filter-dd .dtf-head { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }',
        '.dev-table-filter-dd .dtf-search { flex: 1; min-width: 0; padding: 4px 8px; border: 1px solid rgba(106,141,181,0.4); border-radius: 6px; background: #0f1622; color: #e0e6f0; font-size: 12px; font-family: inherit; outline: none; }',
        '.dev-table-filter-dd .dtf-close { padding: 2px 7px; border: none; background: transparent; color: #8ab4e0; cursor: pointer; font-size: 13px; line-height: 1; border-radius: 4px; }',
        '.dev-table-filter-dd .dtf-close:hover { background: rgba(74,143,199,0.15); }',
        '.dev-table-filter-dd .dtf-list { max-height: 280px; overflow-y: auto; padding: 4px 0; }',
        /* Task 171: строка «Выделить всё» — визуально отделена от значений */
        '.dev-table-filter-dd label.dtf-all { border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 4px; padding-bottom: 6px; }',
        '[data-theme="light"] .dev-table-filter-dd label.dtf-all { border-bottom-color: rgba(0,0,0,0.08); }',
        '.dev-table-filter-dd label.dtf-item { display: flex; align-items: center; gap: 8px; padding: 4px 12px; cursor: pointer; white-space: nowrap; }',
        '.dev-table-filter-dd label.dtf-item:hover { background: rgba(74,143,199,0.10); }',
        '.dev-table-filter-dd label.dtf-item input { accent-color: #6aa6e0; flex-shrink: 0; }',
        '.dev-table-filter-dd .dtf-item-text { flex: 1; overflow: hidden; text-overflow: ellipsis; max-width: 215px; }',
        '.dev-table-filter-dd .dtf-count { color: rgba(200,214,232,0.45); font-size: 11px; flex-shrink: 0; }',
        '.dev-table-filter-dd .dtf-foot { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-top: 1px solid rgba(255,255,255,0.08); }',
        '.dev-table-filter-dd .dtf-reset { border: none; background: transparent; color: #e08080; font-size: 12px; cursor: pointer; padding: 3px 8px; border-radius: 4px; font-family: inherit; }',
        '.dev-table-filter-dd .dtf-reset:hover { background: rgba(224,128,128,0.12); }',
        '.dev-table-filter-dd .dtf-status { color: rgba(200,214,232,0.5); font-size: 11px; }',
        '[data-theme="light"] .dev-table-filter-dd { background: #ffffff; border-color: rgba(58,110,165,0.35); color: #2c3a4c; box-shadow: 0 8px 24px rgba(0,0,0,0.18); }',
        '[data-theme="light"] .dev-table-filter-dd .dtf-search { background: #f4f7fa; color: #1a1a1a; border-color: rgba(58,110,165,0.3); }',
        '[data-theme="light"] .dev-table-filter-dd label.dtf-item:hover { background: rgba(74,143,199,0.08); }',
        /* ===== Task 168: ручка изменения ширины колонки ===== */
        '.dev-table th .dev-table-resize-grip {',
        '  position: absolute; top: 0; right: 0; width: 7px; height: 100%;',
        '  cursor: col-resize; z-index: 5;',
        '}',
        '.dev-table th .dev-table-resize-grip:hover, .dev-table th .dev-table-resize-grip.dragging { background: rgba(74,143,199,0.35); }',
        /* ===== Task 168: строка в фокусе клавиатурной навигации ===== */
        '.dev-table tbody tr.dev-table-row-focused > td { background: rgba(74,143,199,0.12) !important; }',
        '.dev-table tbody tr.dev-table-row-focused > td.dev-table-sticky-1 { background: #23405e !important; }',
        '[data-theme="light"] .dev-table tbody tr.dev-table-row-focused > td { background: rgba(74,143,199,0.10) !important; }',
        '[data-theme="light"] .dev-table tbody tr.dev-table-row-focused > td.dev-table-sticky-1 { background: #dcebf8 !important; }',
        /* ===== Task 168: спейсеры виртуального скролла ===== */
        '.dev-table tbody tr.dev-table-vspacer > td { padding: 0 !important; border: none !important; background: transparent !important; }',
        /* ===== Task 169: панель статистики по колонке ===== */
        '.dev-table-stats-dd {',
        '  position: fixed; z-index: 1000; width: 380px;',
        '  background: #1a2331; border: 1px solid rgba(74,143,199,0.4); border-radius: 8px;',
        '  box-shadow: 0 8px 24px rgba(0,0,0,0.45); font-size: 12.5px; color: #c8d6e8;',
        '  font-family: inherit; overflow: hidden;',
        '}',
        '.dev-table-stats-dd .dts-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }',
        '.dev-table-stats-dd .dts-title { flex: 1; font-weight: 600; color: #8fc1ee; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
        '.dev-table-stats-dd .dts-close { padding: 2px 7px; border: none; background: transparent; color: #8ab4e0; cursor: pointer; font-size: 13px; line-height: 1; border-radius: 4px; }',
        '.dev-table-stats-dd .dts-close:hover { background: rgba(74,143,199,0.15); }',
        '.dev-table-stats-dd .dts-sub { padding: 6px 12px 4px; color: rgba(200,214,232,0.55); font-size: 11.5px; border-bottom: 1px solid rgba(255,255,255,0.06); }',
        '.dev-table-stats-dd .dts-list { max-height: 340px; overflow-y: auto; padding: 4px 0; }',
        '.dev-table-stats-dd .dts-row { display: flex; align-items: center; gap: 8px; padding: 3px 12px; cursor: pointer; }',
        '.dev-table-stats-dd .dts-row:hover { background: rgba(74,143,199,0.10); }',
        '.dev-table-stats-dd .dts-val { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
        '.dev-table-stats-dd .dts-count { font-weight: 700; color: #e0e6f0; flex-shrink: 0; }',
        '.dev-table-stats-dd .dts-pct { color: rgba(200,214,232,0.45); width: 40px; text-align: right; flex-shrink: 0; font-size: 11px; }',
        '.dev-table-stats-dd .dts-bar-wrap { width: 90px; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; flex-shrink: 0; overflow: hidden; }',
        /* Task 170 (багфикс): display:block — span по умолчанию inline, width
           игнорируется и бары не рендерились (был виден только фон-трек) */
        '.dev-table-stats-dd .dts-bar { display: block; height: 100%; background: linear-gradient(90deg, #6aa6e0, #8fc1ee); border-radius: 3px; }',
        '.dev-table-stats-dd .dts-expand { display: block; width: 100%; padding: 6px; border: none; border-top: 1px solid rgba(255,255,255,0.08); background: transparent; color: #8ab4e0; font-size: 12px; cursor: pointer; font-family: inherit; }',
        '.dev-table-stats-dd .dts-expand:hover { background: rgba(74,143,199,0.10); }',
        '.dev-table-stats-dd .dts-hint { padding: 4px 12px 6px; color: rgba(200,214,232,0.4); font-size: 10.5px; }',
        '[data-theme="light"] .dev-table-stats-dd { background: #ffffff; border-color: rgba(58,110,165,0.35); color: #2c3a4c; box-shadow: 0 8px 24px rgba(0,0,0,0.18); }',
        '[data-theme="light"] .dev-table-stats-dd .dts-title { color: #2a5885; }',
        '[data-theme="light"] .dev-table-stats-dd .dts-sub { color: rgba(51,70,94,0.6); }',
        '[data-theme="light"] .dev-table-stats-dd .dts-row:hover { background: rgba(74,143,199,0.08); }',
        '[data-theme="light"] .dev-table-stats-dd .dts-count { color: #1a1a1a; }',
        '[data-theme="light"] .dev-table-stats-dd .dts-pct { color: rgba(51,70,94,0.55); }',
        '[data-theme="light"] .dev-table-stats-dd .dts-bar-wrap { background: rgba(0,0,0,0.07); }',
        /* ===== Task 169: метки строк по условиям — цветные полосы слева ===== */
        '.dev-table tbody tr.dev-mark-old > td:first-child { box-shadow: inset 4px 0 0 #e0a030; }',
        '.dev-table tbody tr.dev-mark-noppr > td:first-child { box-shadow: inset 4px 0 0 #e05360; }',
        '.dev-table tbody tr.dev-mark-old.dev-mark-noppr > td:first-child { box-shadow: inset 8px 0 0 #e0a030, inset 4px 0 0 #e05360; }',
        /* ===== Task 172: кнопка «Сбросить все фильтры» (воронка с ✕) ===== */
        '.dev-table-header-group .dev-table-clear-btn { display: none; }',
        '.dev-table-header-group.table-active .dev-table-clear-btn { display: inline-flex; }',
        '.dev-table-clear-btn {',
        /* Task 175: квадратная кнопка 28x28 (единая высота бара) */
        '  align-items: center; justify-content: center; gap: 3px;',
        '  width: 28px; height: 28px; padding: 0; box-sizing: border-box;',
        '  border: 1px solid rgba(74,143,199,0.35); border-radius: 7px;',
        '  background: rgba(74,143,199,0.10); color: #6aa6e0; font-size: 13px; line-height: 1;',
        '  font-family: inherit; cursor: pointer; transition: all 0.15s;',
        '}',
        '.dev-table-clear-btn:hover { background: rgba(74,143,199,0.2); }',
        /* При установленных фильтрах — янтарная (как кнопка фильтра колонки) */
        '.dev-table-clear-btn.has-filters { border-color: #e0a030; color: #e0a030; background: rgba(224,160,48,0.10); }',
        '.dev-table-clear-btn svg { display: block; flex-shrink: 0; }',
        '.dev-table-clear-btn .dev-table-clear-count { font-size: 11px; font-weight: 700; }',
        /* Task 175: пустой бейдж не занимает место в квадратной кнопке */
        '.dev-table-clear-btn .dev-table-clear-count:empty { display: none; }',
        '[data-theme="light"] .dev-table-clear-btn { background: rgba(74,143,199,0.08); color: #3a6ea5; }',
        '[data-theme="light"] .dev-table-clear-btn.has-filters { border-color: #b8860b; color: #b8860b; background: rgba(184,134,11,0.08); }',
        /* ===== Task 169: кнопка «Метки строк» (⚑) в шапке ===== */
        '.dev-table-header-group .dev-table-marks-btn { display: none; }',
        '.dev-table-header-group.table-active .dev-table-marks-btn { display: inline-flex; }',
        '.dev-table-marks-btn {',
        /* Task 175: квадратная кнопка 28x28 (единая высота бара) */
        '  display: inline-flex; align-items: center; justify-content: center;',
        '  width: 28px; height: 28px; padding: 0; box-sizing: border-box;',
        '  border: 1px solid rgba(74,143,199,0.35); border-radius: 7px;',
        '  background: rgba(74,143,199,0.10); color: #6aa6e0; font-size: 14px; line-height: 1;',
        '  font-family: inherit; cursor: pointer; transition: all 0.15s;',
        '}',
        '.dev-table-marks-btn:hover { background: rgba(74,143,199,0.2); }',
        '.dev-table-marks-btn.has-marks { border-color: #e0a030; color: #e0a030; background: rgba(224,160,48,0.10); }',
        '[data-theme="light"] .dev-table-marks-btn { background: rgba(74,143,199,0.08); color: #3a6ea5; }',
        '[data-theme="light"] .dev-table-marks-btn.has-marks { border-color: #b8860b; color: #b8860b; background: rgba(184,134,11,0.08); }',
        '.dev-table-marks-dd {',
        '  position: fixed; z-index: 1000; width: 300px;',
        '  background: #1a2331; border: 1px solid rgba(74,143,199,0.4); border-radius: 8px;',
        '  box-shadow: 0 8px 24px rgba(0,0,0,0.45); font-size: 12.5px; color: #c8d6e8;',
        '  font-family: inherit; overflow: hidden;',
        '}',
        '.dev-table-marks-dd .dms-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }',
        '.dev-table-marks-dd .dms-title { flex: 1; font-weight: 600; color: #8fc1ee; }',
        '.dev-table-marks-dd .dms-close { padding: 2px 7px; border: none; background: transparent; color: #8ab4e0; cursor: pointer; font-size: 13px; line-height: 1; border-radius: 4px; }',
        '.dev-table-marks-dd .dms-close:hover { background: rgba(74,143,199,0.15); }',
        '.dev-table-marks-dd .dms-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; }',
        '.dev-table-marks-dd .dms-item label { display: flex; align-items: center; gap: 8px; flex: 1; cursor: pointer; }',
        '.dev-table-marks-dd .dms-item input[type="checkbox"] { accent-color: #6aa6e0; }',
        '.dev-table-marks-dd .dms-years { width: 48px; padding: 3px 6px; border: 1px solid rgba(106,141,181,0.4); border-radius: 5px; background: #0f1622; color: #e0e6f0; font-size: 12px; font-family: inherit; text-align: center; outline: none; }',
        '.dev-table-marks-dd .dms-swatch { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }',
        '.dev-table-marks-dd .dms-hint { padding: 4px 12px 8px; color: rgba(200,214,232,0.4); font-size: 10.5px; }',
        '[data-theme="light"] .dev-table-marks-dd { background: #ffffff; border-color: rgba(58,110,165,0.35); color: #2c3a4c; box-shadow: 0 8px 24px rgba(0,0,0,0.18); }',
        '[data-theme="light"] .dev-table-marks-dd .dms-title { color: #2a5885; }',
        '[data-theme="light"] .dev-table-marks-dd .dms-years { background: #f4f7fa; color: #1a1a1a; border-color: rgba(58,110,165,0.3); }'
    ].join('\n');

    var styleEl = document.createElement('style');
    styleEl.id = 'devTableDesktopCss';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    // ---------- Кнопка «Таблица» + счётчик + CSV в шапке страницы (Task 163) ----------
    function ensureButton() {
        var header = document.querySelector('#page-devices-prod .page-inline-header');
        if (!header || document.getElementById('devTableToggleBtn')) return;
        // Task 163: группа в шапке; Task 175: два ряда — ряд кнопок
        // [Таблица][сброс][метки][CSV] в верхней половине бара,
        // счётчик «Показано приборов: N» — под ними (CSS .table-active)
        var group = document.createElement('div');
        group.id = 'devTableHeaderGroup';
        group.className = 'dev-table-header-group' + (tableMode ? ' table-active' : '');

        var btnRow = document.createElement('div');
        btnRow.className = 'dev-table-btn-row';
        group.appendChild(btnRow);

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'devTableToggleBtn';
        btn.className = 'dev-table-toggle-btn' + (tableMode ? ' active' : '');
        btn.textContent = 'Таблица';
        btn.title = 'Переключить вид: карточки / таблица (Excel-подобный вид)';
        btn.addEventListener('click', function () {
            tableMode = !tableMode;
            try { localStorage.setItem('devTableMode', tableMode ? '1' : '0'); } catch (e) {}
            btn.classList.toggle('active', tableMode);
            // Task 163: группа и страница синхронизируют видимость счётчика/CSV и паддинг
            group.classList.toggle('table-active', tableMode);
            var page = document.getElementById('page-devices-prod');
            if (page) page.classList.toggle('dev-table-full', tableMode);
            updateHeaderGroup();
            // Task 168: при переключении вида закрыть выпадающий фильтр; Task 169: и остальные панели
            closePanels();
            // Перезапустить рендер: патч devRenderSorted сам применит вид
            if (typeof window.devRenderSorted === 'function') window.devRenderSorted('prod');
        });
        btnRow.appendChild(btn);

        // Task 163: счётчик приборов (заполняется в buildTableHtml);
        // Task 175: стоит в группе ПОД рядом кнопок
        var count = document.createElement('span');
        count.id = 'devTableCount';
        count.className = 'dev-table-count';
        group.appendChild(count);

        // Task 172: кнопка «Сбросить все фильтры» (воронка с ✕) — слева
        // от «Метки строк»; янтарная + счётчик при установленных фильтрах
        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.id = 'devTableClearFiltersBtn';
        clearBtn.className = 'dev-table-clear-btn';
        clearBtn.title = 'Сбросить все фильтры по колонкам';
        clearBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">' +
            '<path d="M1.5 2.5h13l-5 5.5v5l-3 1.5v-6.5z" fill="currentColor"/>' +
            '<path d="M3.8 3.8l8.4 8.4M12.2 3.8l-8.4 8.4" stroke="#e05360" stroke-width="1.8" stroke-linecap="round"/>' +
            '</svg><span class="dev-table-clear-count"></span>';
        clearBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            resetAllColumnFilters();
        });
        btnRow.appendChild(clearBtn);

        // Task 169: кнопка «Метки строк» (⚑) — подсветка по условиям
        var marksBtn = document.createElement('button');
        marksBtn.type = 'button';
        marksBtn.id = 'devTableMarksBtn';
        marksBtn.className = 'dev-table-marks-btn' + ((marksCfg.oldDate.on || marksCfg.noPPR.on) ? ' has-marks' : '');
        marksBtn.textContent = '\u2691';
        marksBtn.title = 'Метки строк: подсветка приборов по условиям (дата / ППР)';
        marksBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleMarksDropdown(marksBtn);
        });
        btnRow.appendChild(marksBtn);

        // Task 163: кнопка экспорта CSV (клик — делегированный обработчик ниже)
        var csvBtn = document.createElement('button');
        csvBtn.type = 'button';
        csvBtn.id = 'devTableCsvBtn';
        csvBtn.className = 'dev-table-csv-btn';
        csvBtn.textContent = 'Экспорт CSV';
        csvBtn.title = 'Скачать показанные приборы в CSV (открывается в Excel)';
        btnRow.appendChild(csvBtn);

        header.appendChild(group);
    }

    // ---------- Task 163/166/167: обновить счётчик в шапке и ширину группы ----------
    // count — число показанных приборов (если задано); ширина группы
    // транслируется в CSS-переменную --devt-group-w — от неё сдвигаются
    // лупа и поле поиска (см. CSS выше), наездов на группу нет.
    // Task 166: переменная ставится ВСЕГДА (не только в табличном виде) —
    // зазор лупа→«Таблица» единый 8px в обоих режимах, полоса-разделитель
    // стоит по центру зазора.
    // Task 167 (багфикс): при скрытой странице (display:none, напр. на
    // старте приложения активен дашборд) group.offsetWidth === 0 —
    // переменную НЕ ставим: иначе лупа съезжает на кнопку «Таблица»
    // (регрессия Task 166). Пересчёт — при первом рендере страницы
    // (патч devRenderSorted ниже вызывает эту функцию).
    function updateHeaderGroup(count, total) {
        var counter = document.getElementById('devTableCount');
        if (counter && typeof count === 'number') {
            // Task 168: при активных фильтрах — «N из M» (как в Excel)
            counter.textContent = (typeof total === 'number' && total !== count)
                ? ('Показано приборов: ' + count + ' из ' + total)
                : ('Показано приборов: ' + count);
            counter.title = sortState.key
                ? ('Сортировка: ' + colLabel(sortState.key) + (sortState.dir === 1 ? ' ▲' : ' ▼'))
                : 'Табличный вид приборов';
        }
        var group = document.getElementById('devTableHeaderGroup');
        var header = document.querySelector('#page-devices-prod .page-inline-header');
        if (group && header) {
            var w = group.offsetWidth;
            if (w > 0) {   // Task 167: скрытая страница даёт 0 — не трогаем переменную
                header.style.setProperty('--devt-group-w', (w + 16) + 'px');
            }
        }
    }

    // ---------- Task 163: подогнать высоту таблицы под свободную площадь ----------
    // Таблица занимает всё место от своего верха до низа окна (без отступов).
    // Верх считается через offsetTop внутри страницы + позиция самой страницы —
    // стабильно и при скролле, и при открытии/закрытии detail-панели.
    function fitTableHeight() {
        if (!tableMode) return;
        var page = document.getElementById('page-devices-prod');
        var wrap = page ? page.querySelector('.dev-table-wrap') : null;
        if (!page || !wrap) return;
        var top = Math.round(page.getBoundingClientRect().top + wrap.offsetTop);
        if (top >= 0) wrap.style.height = 'calc(100vh - ' + top + 'px)';
    }

    // ---------- Патч devRenderSorted ----------
    // Оригинал рендерит карточки (со всеми фильтрами: поиск, проект, СБС,
    // САР, фильтр 4); затем, если включён табличный вид — карточки
    // конвертируются в таблицу (порядок и состав строк = виду карточек).
    var origDevRenderSorted = window.devRenderSorted;
    window.devRenderSorted = function (mode) {
        origDevRenderSorted.apply(window, arguments);
        if (mode === 'prod') {
            // Task 167: пересчёт ширины группы при каждом рендере страницы —
            // на первом открытии (страница стала видимой) переменная
            // --devt-group-w получит корректное значение
            updateHeaderGroup();
            // Task 168/169: при выходе из табличного вида закрыть всплывающие панели
            if (!tableMode) closePanels();
        }
        if (mode === 'prod' && tableMode) {
            convertListToTable();
        }
    };

    // ---------- Конвертация списка -> таблица ----------
    function convertListToTable() {
        var listEl = document.getElementById('devProdList');
        if (!listEl) return;
        var cards = listEl.querySelectorAll('.dev-card[data-dev-id]');
        if (cards.length === 0) return; // «Загрузка…» или «Ничего не найдено» — не трогаем

        // Индекс приборов по ID (одно прохождение по данным)
        var byId = {};
        if (typeof devData !== 'undefined' && devData && devData.devices) {
            devData.devices.forEach(function (d) { byId[String(d['ID'])] = d; });
        }
        // Приборы в порядке карточек (группировка по производствам сохранена)
        lastDevices = [];
        cards.forEach(function (card) {
            var dev = byId[String(card.getAttribute('data-dev-id'))];
            if (dev) lastDevices.push(dev);
        });

        listEl.innerHTML = buildTableHtml(lastDevices);
        afterTableRendered();
        focusIndex = -1;
        renderRows();
        // Task 163: таблица — на всю свободную площадь
        fitTableHeight();
    }

    // ---------- Task 168: пересборка таблицы с сохранением прокрутки ----------
    // (сортировка/фильтры не сбрасывают позицию просмотра)
    function rebuildTable() {
        var listEl = document.getElementById('devProdList');
        if (!listEl || !lastDevices.length) return;
        var wrap = listEl.querySelector('.dev-table-wrap');
        var st = wrap ? wrap.scrollTop : 0;
        listEl.innerHTML = buildTableHtml(lastDevices);
        afterTableRendered();
        var wrap2 = listEl.querySelector('.dev-table-wrap');
        if (wrap2) wrap2.scrollTop = st;
        renderRows();
        fitTableHeight();
    }

    // ---------- Построение таблицы ----------
    // Task 168: ширина колонки — сохранённая пользователем или дефолт
    function getColWidth(col) {
        var w = colWidths[col.key];
        return (typeof w === 'number' && w >= 40) ? w : (col.width || 120);
    }

    function buildTableHtml(devices) {
        var cols = activeColumns();
        // Task 168: колоночные фильтры -> сортировка -> currentRows
        var rows = applyColumnFilters(devices.slice());
        if (sortState.key) {
            var k = sortState.key, dir = sortState.dir;
            rows.sort(function (a, b) {
                var va = String(a[k] == null ? '' : a[k]).toLowerCase();
                var vb = String(b[k] == null ? '' : b[k]).toLowerCase();
                if (va < vb) return -1 * dir;
                if (va > vb) return 1 * dir;
                return 0;
            });
        }
        currentRows = rows;

        var html = '<div class="dev-table-wrap" tabindex="0">';
        // Task 172: состояние кнопки «Сбросить все фильтры» — ДО
        // updateHeaderGroup: счётчик на кнопке меняет ширину группы,
        // а updateHeaderGroup её замеряет (--devt-group-w для лупы)
        updateClearFiltersBtn();
        // Task 163: счётчик — в шапке; Task 168: «N из M» при активных фильтрах
        updateHeaderGroup(rows.length, devices.length);
        // Task 165: текущий запрос — для подсветки совпадений в ячейках
        var query = currentSearchQuery();
        // Task 168: явная ширина таблицы = сумме колонок (fixed-layout:
        // без явного width Chromium сжимает колонки до ширины контейнера)
        var sumWidth = 0;
        cols.forEach(function (c) { sumWidth += getColWidth(c); });
        html += '<table class="dev-table" style="width:' + sumWidth + 'px"><thead><tr>';
        cols.forEach(function (col) {
            var cls = 'dev-table-th';
            if (col.sticky) cls += ' dev-table-sticky-' + col.sticky;
            // Task 172: маркер колонки «№» — жирная рамка справа
            if (col.key === '__num__') cls += ' dev-table-col-num';
            if (sortState.key === col.key) cls += (sortState.dir === 1 ? ' dev-table-col-sorted-asc' : ' dev-table-col-sorted-desc');
            var icon = '';
            if (col.sortable !== false) {
                icon = sortState.key === col.key
                    ? (sortState.dir === 1 ? '<span class="dev-table-sort-icon">▲</span>' : '<span class="dev-table-sort-icon">▼</span>')
                    : '<span class="dev-table-sort-icon">⇅</span>';
            }
            // Task 168: кнопка фильтра в заголовке (кроме порядкового №)
            var filterBtn = '';
            if (col.key !== '__num__') {
                var hasF = Array.isArray(colFilters[col.key]);
                filterBtn = '<span class="dev-table-filter-btn' + (hasF ? ' has-filter' : '') +
                    '" data-filter-key="' + esc(col.key) + '" title="Фильтр по колонке">▾</span>';
            }
            // Task 168: ручка изменения ширины на правом краю заголовка
            var grip = '<span class="dev-table-resize-grip" data-resize-key="' + esc(col.key) +
                '" title="Потяните, чтобы изменить ширину колонки"></span>';
            // Task 171: sticky-2 откреплена — left-сдвиг больше не нужен
            var style = 'width:' + getColWidth(col) + 'px;';
            html += '<th class="' + cls + '"' + (col.sortable !== false ? ' data-sort-key="' + esc(col.key) + '"' : '') +
                    ' style="' + style + '"' +
                    ' title="' + esc(col.label) + '">' + esc(col.label) + icon + filterBtn + grip + '</th>';
        });
        html += '</tr></thead><tbody></tbody></table></div>';
        // Task 168: тело заполняется виртуально (renderRows) — только видимое окно
        return html;
    }

    function colLabel(key) {
        for (var i = 0; i < COLUMNS.length; i++) {
            if (COLUMNS[i].key === key) return COLUMNS[i].label;
        }
        return key;
    }

    // ---------- Делегированные события таблицы ----------
    document.addEventListener('click', function (e) {
        // Task 168: кнопка фильтра в заголовке — открыть выпадающий список
        var fbtn = e.target.closest ? e.target.closest('.dev-table-filter-btn') : null;
        if (fbtn) {
            e.stopPropagation();
            toggleFilterDropdown(fbtn);
            return;
        }
        // Task 168: клик вне выпадающего фильтра — закрыть его
        if (ddEl && !ddEl.contains(e.target)) closeFilterDropdown();
        // Task 169: клик вне панелей статистики/меток — закрыть их
        if (statsEl && !statsEl.contains(e.target)) closeStatsPanel();
        if (marksEl && !marksEl.contains(e.target)) closeMarksDropdown();
        // Сортировка: клик по заголовку колонки (не сразу после перетаскивания границы)
        var th = (!_suppressSort && e.target.closest) ? e.target.closest('.dev-table th[data-sort-key]') : null;
        if (th) {
            var key = th.getAttribute('data-sort-key');
            if (sortState.key === key) {
                sortState.dir = -sortState.dir;
            } else {
                sortState.key = key;
                sortState.dir = 1;
            }
            rebuildTable();   // Task 168: с сохранением прокрутки
            return;
        }
        // Клик по строке: выделить её и синхронизировать клавиатурный
        // фокус; карточка прибора (detail-панель) открывается ТОЛЬКО
        // по ячейкам столбца «№» (Task 172)
        var row = e.target.closest ? e.target.closest('.dev-table-row') : null;
        if (row && row.getAttribute('data-dev-id')) {
            // Task 168: синхронизировать клавиатурный фокус с кликнутой строкой
            var ri = parseInt(row.getAttribute('data-row-index'), 10);
            if (!isNaN(ri)) focusIndex = ri;
            // фокус на контейнер — стрелки работают сразу после клика
            var wrapEl = row.closest('.dev-table-wrap');
            if (wrapEl) try { wrapEl.focus({ preventScroll: true }); } catch (err) { wrapEl.focus(); }
            document.querySelectorAll('.dev-table-row.dev-table-row-selected').forEach(function (r) {
                r.classList.remove('dev-table-row-selected');
            });
            row.classList.add('dev-table-row-selected');
            // Task 172: карточка — только по клику на ячейку столбца «№»
            var numTd = e.target.closest ? e.target.closest('td.dev-table-col-num') : null;
            if (numTd && numTd.closest('.dev-table-row') === row &&
                typeof window.devOpenDetail === 'function') {
                window.devOpenDetail(row.getAttribute('data-dev-id'));
            }
            return;
        }
        // Экспорт CSV
        if (e.target && e.target.id === 'devTableCsvBtn') {
            exportCsv();
        }
    });
    // Task 168: Escape закрывает выпадающий фильтр; Task 169: и остальные панели
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (ddEl) closeFilterDropdown();
            if (statsEl) closeStatsPanel();
            if (marksEl) closeMarksDropdown();
        }
    });

    // ---------- Экспорт CSV ----------
    function exportCsv() {
        // Task 168: экспорт — с учётом фильтров и сортировки (что видно, то и в файле)
        var rows = currentRows.length ? currentRows : lastDevices;
        if (!rows.length) return;
        var cols = activeColumns();
        // BOM — чтобы Excel корректно открыл UTF-8; разделитель «;» (русская локаль)
        var lines = ['\uFEFF' + cols.map(function (c) { return csvCell(c.label); }).join(';')];
        rows.forEach(function (dev) {
            lines.push(cols.map(function (c) {
                return csvCell(c.key === '__num__' ? '' : String(dev[c.key] == null ? '' : dev[c.key]));
            }).join(';'));
        });
        var blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'pribory-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function csvCell(v) {
        v = String(v);
        if (v.indexOf(';') !== -1 || v.indexOf('"') !== -1 || v.indexOf('\n') !== -1) {
            return '"' + v.replace(/"/g, '""') + '"';
        }
        return v;
    }

    // ============================================================
    // Task 168: ФИЛЬТРЫ ПО КОЛОНКАМ (как в Excel)
    // ============================================================
    var ddEl = null;   // открытый выпадающий список фильтра
    var ddKey = null;  // ключ колонки открытого фильтра

    // Применить колоночные фильтры к массиву приборов
    function applyColumnFilters(rows) {
        var keys = Object.keys(colFilters).filter(function (k) { return Array.isArray(colFilters[k]); });
        if (!keys.length) return rows;
        return rows.filter(function (d) {
            for (var i = 0; i < keys.length; i++) {
                var v = String(d[keys[i]] == null ? '' : d[keys[i]]).trim();
                if (colFilters[keys[i]].indexOf(v) === -1) return false;
            }
            return true;
        });
    }

    // ---------- Task 172: сброс ВСЕХ колоночных фильтров разом ----------
    function activeFilterCount() {
        return Object.keys(colFilters).filter(function (k) { return Array.isArray(colFilters[k]); }).length;
    }

    // Состояние кнопки «Сбросить все фильтры»: янтарная подсветка
    // и счётчик установленных фильтров (число колонок)
    function updateClearFiltersBtn() {
        var btn = document.getElementById('devTableClearFiltersBtn');
        if (!btn) return;
        var n = activeFilterCount();
        btn.classList.toggle('has-filters', n > 0);
        btn.title = n > 0
            ? 'Сбросить все фильтры по колонкам (установлено: ' + n + ')'
            : 'Сбросить все фильтры по колонкам';
        var badge = btn.querySelector('.dev-table-clear-count');
        if (badge) badge.textContent = n > 0 ? String(n) : '';
    }

    function resetAllColumnFilters() {
        var had = activeFilterCount() > 0;
        colFilters = {};
        closePanels();
        if (had && lastDevices.length) {
            rebuildTable();   // пересборка обновит кнопку, счётчик приборов и строки
        } else {
            updateClearFiltersBtn();
        }
    }

    function closeFilterDropdown() {
        if (ddEl) { ddEl.remove(); ddEl = null; }
        ddKey = null;
    }

    function toggleFilterDropdown(btn) {
        var key = btn.getAttribute('data-filter-key');
        if (ddEl && ddKey === key) { closeFilterDropdown(); return; }
        closeFilterDropdown();
        ddKey = key;
        ddEl = buildFilterDropdown(key);
        document.body.appendChild(ddEl);
        positionFilterDropdown(ddEl, btn);
        var search = ddEl.querySelector('.dtf-search');
        if (search) setTimeout(function () { try { search.focus(); } catch (err) {} }, 30);
    }

    // Построить выпадающий список уникальных значений колонки.
    // Список значений — по НЕотфильтрованному набору (lastDevices),
    // чтобы комбинировать фильтры нескольких колонок (Excel-поведение).
    function buildFilterDropdown(key) {
        var counts = {};
        lastDevices.forEach(function (d) {
            var v = String(d[key] == null ? '' : d[key]).trim();
            counts[v] = (counts[v] || 0) + 1;
        });
        var vals = Object.keys(counts).sort(function (a, b) {
            var la = a.toLowerCase(), lb = b.toLowerCase();
            return la < lb ? -1 : (la > lb ? 1 : 0);
        });
        var selected = Array.isArray(colFilters[key]) ? colFilters[key] : null;

        // Состояние чекбоксов (все отмечены, если фильтра нет)
        var checkedSet = {};
        vals.forEach(function (v) { checkedSet[v] = !selected || selected.indexOf(v) !== -1; });

        var dd = document.createElement('div');
        dd.className = 'dev-table-filter-dd';

        // Шапка: поиск по значениям + закрыть
        var head = document.createElement('div');
        head.className = 'dtf-head';
        var search = document.createElement('input');
        search.type = 'search';
        search.className = 'dtf-search';
        search.placeholder = 'Поиск значения…';
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'dtf-close';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Закрыть';
        closeBtn.addEventListener('click', closeFilterDropdown);
        head.appendChild(search);
        head.appendChild(closeBtn);

        // Список значений с чекбоксами и счётчиками
        var list = document.createElement('div');
        list.className = 'dtf-list';

        // Подвал: статус + сброс
        var foot = document.createElement('div');
        foot.className = 'dtf-foot';
        var status = document.createElement('span');
        status.className = 'dtf-status';
        var resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'dtf-reset';
        resetBtn.textContent = 'Сбросить фильтр';
        resetBtn.addEventListener('click', function () {
            delete colFilters[key];
            closeFilterDropdown();
            rebuildTable();
        });
        foot.appendChild(status);
        foot.appendChild(resetBtn);

        dd.appendChild(head);
        dd.appendChild(list);
        dd.appendChild(foot);

        function chosenCount() {
            var n = 0;
            vals.forEach(function (v) { if (checkedSet[v]) n++; });
            return n;
        }
        function updateStatus() {
            status.textContent = 'Выбрано: ' + chosenCount() + ' из ' + vals.length;
        }
        function applyFilter() {
            var chosen = vals.filter(function (v) { return checkedSet[v]; });
            if (chosen.length === vals.length) delete colFilters[key];   // все — фильтра нет
            else colFilters[key] = chosen;
            rebuildTable();   // живое применение (прокрутка сохраняется)
        }

        function renderList() {
            var q = (search.value || '').trim().toLowerCase();
            list.innerHTML = '';
            // Task 171: «Выделить всё» — управляет всеми значениями
            // (в т.ч. отфильтрованными поиском); состояние: галочка — все
            // выбраны, квадрат (indeterminate) — выбрана часть
            var visibleVals = vals.filter(function (v) {
                var label = v === '' ? '(пусто)' : v;
                return !q || label.toLowerCase().indexOf(q) !== -1;
            });
            var allRow = document.createElement('label');
            allRow.className = 'dtf-item dtf-all';
            var allCb = document.createElement('input');
            allCb.type = 'checkbox';
            var nChosen = 0;
            visibleVals.forEach(function (v) { if (checkedSet[v]) nChosen++; });
            allCb.checked = visibleVals.length > 0 && nChosen === visibleVals.length;
            allCb.indeterminate = nChosen > 0 && nChosen < visibleVals.length;
            allCb.addEventListener('change', function () {
                visibleVals.forEach(function (v) { checkedSet[v] = allCb.checked; });
                applyFilter();
                renderList();
                updateStatus();
            });
            var allText = document.createElement('span');
            allText.className = 'dtf-item-text';
            allText.style.fontWeight = '600';
            allText.textContent = 'Выделить всё' + (q ? ' (' + visibleVals.length + ')' : '');
            var allCount = document.createElement('span');
            allCount.className = 'dtf-count';
            allCount.textContent = nChosen + '/' + visibleVals.length;
            allRow.appendChild(allCb);
            allRow.appendChild(allText);
            allRow.appendChild(allCount);
            list.appendChild(allRow);
            vals.forEach(function (v) {
                var label = v === '' ? '(пусто)' : v;
                if (q && label.toLowerCase().indexOf(q) === -1) return;
                var lab = document.createElement('label');
                lab.className = 'dtf-item';
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = !!checkedSet[v];
                cb.addEventListener('change', function () {
                    checkedSet[v] = cb.checked;
                    applyFilter();
                    updateStatus();
                    // Task 171: синхронизировать состояние «Выделить всё»
                    // (без полного ре-рендера списка)
                    var n = 0;
                    visibleVals.forEach(function (vv) { if (checkedSet[vv]) n++; });
                    allCb.checked = visibleVals.length > 0 && n === visibleVals.length;
                    allCb.indeterminate = n > 0 && n < visibleVals.length;
                    allCount.textContent = n + '/' + visibleVals.length;
                });
                var text = document.createElement('span');
                text.className = 'dtf-item-text';
                text.textContent = label;
                text.title = label;
                var cnt = document.createElement('span');
                cnt.className = 'dtf-count';
                cnt.textContent = counts[v];
                lab.appendChild(cb);
                lab.appendChild(text);
                lab.appendChild(cnt);
                list.appendChild(lab);
            });
            if (!list.children.length) {
                var empty = document.createElement('div');
                empty.className = 'dtf-item';
                empty.style.color = 'rgba(200,214,232,0.45)';
                empty.textContent = 'Нет подходящих значений';
                list.appendChild(empty);
            }
        }

        search.addEventListener('input', renderList);
        renderList();
        updateStatus();
        return dd;
    }

    function positionFilterDropdown(dd, btn) {
        var r = btn.getBoundingClientRect();
        dd.style.visibility = 'hidden';
        var dw = dd.offsetWidth || 260, dh = dd.offsetHeight || 320;
        var left = Math.min(window.innerWidth - dw - 8, Math.max(8, r.left));
        var top = r.bottom + 4;
        if (top + dh > window.innerHeight - 8) top = Math.max(8, r.top - dh - 4);
        dd.style.left = left + 'px';
        dd.style.top = top + 'px';
        dd.style.visibility = '';
    }

    // ============================================================
    // Task 168: ВИРТУАЛЬНЫЙ СКРОЛЛ
    // ============================================================
    function rowHtml(dev, i, cols, query) {
        var html = '<tr class="dev-table-row' + (i === focusIndex ? ' dev-table-row-focused' : '') +
            rowMarkClasses(dev) +   // Task 169: цветные метки по условиям
            '" data-dev-id="' + esc(String(dev['ID'])) + '" data-row-index="' + i + '">';
        cols.forEach(function (col) {
            var val = (col.key === '__num__') ? String(i + 1) : String(dev[col.key] == null ? '' : dev[col.key]);
            var cls = 'dev-table-td' + (col.sticky ? ' dev-table-sticky-' + col.sticky : '');
            // Task 172: маркер колонки «№» — по её ячейкам открывается карточка
            if (col.key === '__num__') cls += ' dev-table-col-num';
            // Task 165: подсветка совпадений (кроме колонки № — порядковый номер)
            var cellHtml = (col.key === '__num__') ? esc(val) : markCell(val, query);
            html += '<td class="' + cls + '" title="' + esc(val) + '">' + cellHtml + '</td>';
        });
        html += '</tr>';
        return html;
    }

    function spacerHtml(h, colspan) {
        return '<tr class="dev-table-vspacer"><td colspan="' + colspan + '" style="height:' + Math.round(h) + 'px"></td></tr>';
    }

    // Отрисовать только видимое окно строк (+ буфер) с спейсерами сверху/снизу
    function renderRows() {
        var listEl = document.getElementById('devProdList');
        var wrap = listEl ? listEl.querySelector('.dev-table-wrap') : null;
        var tbody = wrap ? wrap.querySelector('.dev-table tbody') : null;
        if (!wrap || !tbody) return;
        var cols = activeColumns();
        var N = currentRows.length;
        var query = currentSearchQuery();
        if (N === 0) {
            tbody.innerHTML = '<tr><td class="dev-table-td" colspan="' + cols.length +
                '" style="text-align:center;padding:28px 12px;color:rgba(200,214,232,0.55)">Ничего не найдено — измените поиск или фильтры</td></tr>';
            return;
        }
        var st = wrap.scrollTop;
        var vh = wrap.clientHeight || 600;
        var first = Math.max(0, Math.floor(st / rowH) - VBUF);
        var last = Math.min(N, first + Math.ceil(vh / rowH) + VBUF * 2);
        var html = '';
        if (first > 0) html += spacerHtml(first * rowH, cols.length);
        for (var i = first; i < last; i++) {
            html += rowHtml(currentRows[i], i, cols, query);
        }
        if (last < N) html += spacerHtml((N - last) * rowH, cols.length);
        tbody.innerHTML = html;
        // Однократный замер фактической высоты строки (после стилей/шрифтов)
        if (!_rowHMeasured) {
            var tr = tbody.querySelector('tr.dev-table-row');
            if (tr) {
                var h = tr.getBoundingClientRect().height;
                if (h > 10 && Math.abs(h - rowH) > 0.5) {
                    rowH = h;
                    renderRows();   // перерендер с точной высотой
                    return;
                }
                _rowHMeasured = true;
            }
        }
    }

    // rAF-троттлинг пересборки при прокрутке
    var _scrollRaf = false;
    function onVirtualScroll() {
        if (_scrollRaf) return;
        _scrollRaf = true;
        requestAnimationFrame(function () { _scrollRaf = false; renderRows(); });
    }

    // ============================================================
    // Task 168: НАВИГАЦИЯ С КЛАВИАТУРЫ
    // ============================================================
    function onTableKeyDown(e) {
        var N = currentRows.length;
        if (!N) return;
        var key = e.key;
        var old = focusIndex;
        if (key === 'ArrowDown') {
            focusIndex = Math.min(N - 1, (focusIndex < 0 ? -1 : focusIndex) + 1);
        } else if (key === 'ArrowUp') {
            focusIndex = Math.max(0, (focusIndex < 0 ? 1 : focusIndex) - 1);
        } else if (key === 'Home') {
            focusIndex = 0;
        } else if (key === 'End') {
            focusIndex = N - 1;
        } else if (key === 'Enter') {
            // Открыть карточку прибора из строки в фокусе
            if (focusIndex >= 0 && currentRows[focusIndex] && typeof window.devOpenDetail === 'function') {
                window.devOpenDetail(String(currentRows[focusIndex]['ID']));
            }
            e.preventDefault();
            return;
        } else {
            return;   // остальные клавиши — стандартное поведение
        }
        e.preventDefault();   // стрелки не скроллят страницу (скролл — наш, виртуальный)
        if (focusIndex !== old) ensureFocusedVisible();
    }

    // Прокрутить контейнер так, чтобы строка в фокусе была видна, и перерисовать окно
    function ensureFocusedVisible() {
        var listEl = document.getElementById('devProdList');
        var wrap = listEl ? listEl.querySelector('.dev-table-wrap') : null;
        if (!wrap) return;
        if (focusIndex >= 0) {
            var top = focusIndex * rowH;
            var bottom = top + rowH;
            if (top < wrap.scrollTop) wrap.scrollTop = top;
            else if (bottom > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = bottom - wrap.clientHeight;
        }
        renderRows();
    }

    // ============================================================
    // Task 168: ИЗМЕНЕНИЕ ШИРИНЫ КОЛОНОК МЫШЬЮ
    // ============================================================
    var _resize = null;          // активное перетаскивание границы
    var _suppressSort = false;   // клик после перетаскивания не должен сортировать

    function onResizePointerDown(e) {
        var grip = e.target.closest ? e.target.closest('.dev-table-resize-grip') : null;
        if (!grip) return;
        var key = grip.getAttribute('data-resize-key');
        var th = grip.closest('th');
        if (!key || !th) return;
        _resize = { key: key, th: th, startX: e.clientX, startW: th.getBoundingClientRect().width, grip: grip };
        grip.classList.add('dragging');
        try { grip.setPointerCapture(e.pointerId); } catch (err) {}
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        _suppressSort = true;
        e.preventDefault();
        e.stopPropagation();
    }

    document.addEventListener('pointermove', function (e) {
        if (!_resize) return;
        // Минимальная ширина 40px (максимал не нужен — горизонтальный скролл)
        var w = Math.max(40, Math.round(_resize.startW + (e.clientX - _resize.startX)));
        _resize.th.style.width = w + 'px';
        colWidths[_resize.key] = w;
        // Task 168: пересчитать ЯВНУЮ ширину таблицы (fixed-layout требует
        // точного width = сумме колонок, иначе колонки сожмутся)
        var table = _resize.th.closest('table');
        if (table) {
            var sum = 0;
            activeColumns().forEach(function (c) { sum += getColWidth(c); });
            table.style.width = sum + 'px';
        }
    });

    document.addEventListener('pointerup', function () {
        if (!_resize) return;
        _resize.grip.classList.remove('dragging');
        _resize = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        saveColWidths();
        // Снять блокировку сортировки чуть позже клика (click идёт за pointerup)
        setTimeout(function () { _suppressSort = false; }, 60);
    });

    function saveColWidths() {
        try { localStorage.setItem('devTableColWidths', JSON.stringify(colWidths)); } catch (e) {}
    }

    // Подключить события к свежесозданному контейнеру таблицы
    // (innerHTML-пересборка создаёт новый .dev-table-wrap)
    function afterTableRendered() {
        var listEl = document.getElementById('devProdList');
        var wrap = listEl ? listEl.querySelector('.dev-table-wrap') : null;
        if (!wrap) return;
        wrap.addEventListener('scroll', onVirtualScroll);
        wrap.addEventListener('keydown', onTableKeyDown);
        wrap.addEventListener('pointerdown', onResizePointerDown);
        // Task 169: правый клик по заголовку — статистика по колонке
        wrap.addEventListener('contextmenu', onHeaderContextMenu);
    }

    // ============================================================
    // Task 169: СТАТИСТИКА ПО КОЛОНКЕ (правый клик по заголовку)
    // ============================================================
    var statsEl = null;   // открытая панель статистики

    function closeStatsPanel() {
        if (statsEl) { statsEl.remove(); statsEl = null; }
    }

    // Правый клик по заголовку колонки -> «Количество по значениям».
    // Статистика считается по currentRows — с учётом поиска и фильтров
    // (что вижу — о том и статистика).
    function onHeaderContextMenu(e) {
        var th = e.target.closest ? e.target.closest('th') : null;
        if (!th) return;
        var key = th.getAttribute('data-sort-key');
        if (!key) return;   // колонка № — не интересна
        e.preventDefault();
        openStatsPanel(key, th);
    }

    function openStatsPanel(key, anchorEl) {
        closePanels();
        // Подсчёт значений по текущему (отфильтрованному) набору
        var counts = {};
        var total = currentRows.length;
        currentRows.forEach(function (d) {
            var v = String(d[key] == null ? '' : d[key]).trim();
            counts[v] = (counts[v] || 0) + 1;
        });
        var entries = Object.keys(counts).map(function (v) { return [v, counts[v]]; });
        entries.sort(function (a, b) { return b[1] - a[1]; });
        var maxCount = entries.length ? entries[0][1] : 1;
        var TOP = 15;

        var dd = document.createElement('div');
        dd.className = 'dev-table-stats-dd';

        // Шапка: «Статистика: {колонка}» + закрыть
        var head = document.createElement('div');
        head.className = 'dts-head';
        var title = document.createElement('div');
        title.className = 'dts-title';
        title.textContent = 'Количество по значениям: ' + colLabel(key);
        title.title = title.textContent;
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'dts-close';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Закрыть';
        closeBtn.addEventListener('click', closeStatsPanel);
        head.appendChild(title);
        head.appendChild(closeBtn);

        // Подзаголовок: N приборов · M значений (по текущему набору)
        var sub = document.createElement('div');
        sub.className = 'dts-sub';
        sub.textContent = total + ' ' + (total === 1 ? 'прибор' : 'приборов') +
            ' · ' + entries.length + ' ' + (entries.length === 1 ? 'значение' : 'значений') +
            (total !== lastDevices.length ? ' · с учётом фильтров' : '');

        // Список: значение + счётчик + % + бар
        var list = document.createElement('div');
        list.className = 'dts-list';

        function addRow(val, cnt) {
            var row = document.createElement('div');
            row.className = 'dts-row';
            row.title = 'Клик — показать только это значение (фильтр)';
            var valEl = document.createElement('span');
            valEl.className = 'dts-val';
            valEl.textContent = val === '' ? '(пусто)' : val;
            var cntEl = document.createElement('span');
            cntEl.className = 'dts-count';
            cntEl.textContent = cnt;
            var pctEl = document.createElement('span');
            pctEl.className = 'dts-pct';
            pctEl.textContent = total ? (Math.round(cnt / total * 1000) / 10) + '%' : '0%';
            var barWrap = document.createElement('span');
            barWrap.className = 'dts-bar-wrap';
            var bar = document.createElement('span');
            bar.className = 'dts-bar';
            bar.style.width = Math.max(2, Math.round(cnt / maxCount * 100)) + '%';
            barWrap.appendChild(bar);
            row.appendChild(valEl);
            row.appendChild(cntEl);
            row.appendChild(pctEl);
            row.appendChild(barWrap);
            // Клик по значению — применить фильтр по нему (drill-down, как в Excel)
            row.addEventListener('click', function () {
                var cur = Array.isArray(colFilters[key]) ? colFilters[key] : null;
                if (cur && cur.length === 1 && cur[0] === val) delete colFilters[key];   // повторный клик — сброс
                else colFilters[key] = [val];
                closeStatsPanel();
                rebuildTable();
            });
            list.appendChild(row);
        }

        entries.slice(0, TOP).forEach(function (en) { addRow(en[0], en[1]); });

        dd.appendChild(head);
        dd.appendChild(sub);
        dd.appendChild(list);

        // «Показать все N значений»
        // Task 170 (багфикс): stopPropagation — раньше expand.remove() внутри
        // обработчика отсоединял кнопку ДО всплытия клика до document-слушателя,
        // statsEl.contains(e.target) становился false (узел уже вне DOM) и панель
        // закрывалась сразу после клика — кнопка «не срабатывала»
        if (entries.length > TOP) {
            var expand = document.createElement('button');
            expand.type = 'button';
            expand.className = 'dts-expand';
            expand.textContent = 'Показать все ' + entries.length + ' значений';
            expand.addEventListener('click', function (e) {
                e.stopPropagation();   // не давать document-обработчику закрыть панель
                list.innerHTML = '';
                entries.forEach(function (en) { addRow(en[0], en[1]); });
                expand.remove();
            });
            dd.appendChild(expand);
        }

        var hint = document.createElement('div');
        hint.className = 'dts-hint';
        hint.textContent = 'Клик по значению — фильтровать по нему';
        dd.appendChild(hint);

        statsEl = dd;
        document.body.appendChild(dd);
        // Позиционирование под заголовком (не вылезая за экран)
        dd.style.visibility = 'hidden';
        var r = anchorEl.getBoundingClientRect();
        var dw = dd.offsetWidth || 380, dh = dd.offsetHeight || 320;
        var left = Math.min(window.innerWidth - dw - 8, Math.max(8, r.left));
        var top = r.bottom + 4;
        if (top + dh > window.innerHeight - 8) top = Math.max(8, r.top - dh - 4);
        dd.style.left = left + 'px';
        dd.style.top = top + 'px';
        dd.style.visibility = '';
    }

    // ============================================================
    // Task 169: МЕТКИ СТРОК ПО УСЛОВИЯМ
    // ============================================================
    var marksEl = null;   // открытая панель настроек меток

    // «Дата» старше N лет (формат данных: YYYY-MM-DD или пусто)
    function isOldDate(v, years) {
        var s = String(v == null ? '' : v).trim();
        if (!s) return false;
        var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return false;
        var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
        if (isNaN(d.getTime())) return false;
        var limit = new Date();
        limit.setFullYear(limit.getFullYear() - years);
        return d < limit;
    }

    // Классы меток для строки (янтарная — старая дата, красная — вне ППР)
    function rowMarkClasses(dev) {
        var cls = '';
        if (marksCfg.oldDate.on && isOldDate(dev['Дата'], marksCfg.oldDate.years)) cls += ' dev-mark-old';
        if (marksCfg.noPPR.on && String(dev['В гр. ППР'] || '').trim().toLowerCase() === 'нет') cls += ' dev-mark-noppr';
        return cls;
    }

    function saveMarksCfg() {
        try { localStorage.setItem('devTableMarks', JSON.stringify(marksCfg)); } catch (e) {}
        // Подсветка кнопки ⚑, если хоть одно условие активно
        var btn = document.getElementById('devTableMarksBtn');
        if (btn) btn.classList.toggle('has-marks', marksCfg.oldDate.on || marksCfg.noPPR.on);
    }

    function closeMarksDropdown() {
        if (marksEl) { marksEl.remove(); marksEl = null; }
    }

    function toggleMarksDropdown(anchorBtn) {
        if (marksEl) { closeMarksDropdown(); return; }
        closePanels();

        var dd = document.createElement('div');
        dd.className = 'dev-table-marks-dd';

        var head = document.createElement('div');
        head.className = 'dms-head';
        var title = document.createElement('div');
        title.className = 'dms-title';
        title.textContent = 'Метки строк';
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'dms-close';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Закрыть';
        closeBtn.addEventListener('click', closeMarksDropdown);
        head.appendChild(title);
        head.appendChild(closeBtn);

        function applyAndRerender() {
            saveMarksCfg();
            renderRows();   // метки меняют только классы строк — пересборки не нужно
        }

        // Условие 1: «Дата» старше N лет — янтарная полоса
        var item1 = document.createElement('div');
        item1.className = 'dms-item';
        var lab1 = document.createElement('label');
        var cb1 = document.createElement('input');
        cb1.type = 'checkbox';
        cb1.checked = marksCfg.oldDate.on;
        var sw1 = document.createElement('span');
        sw1.className = 'dms-swatch';
        sw1.style.background = '#e0a030';
        var t1 = document.createElement('span');
        t1.textContent = '«Дата» старше';
        lab1.appendChild(cb1);
        lab1.appendChild(sw1);
        lab1.appendChild(t1);
        var yearsInput = document.createElement('input');
        yearsInput.type = 'number';
        yearsInput.className = 'dms-years';
        yearsInput.min = '1';
        yearsInput.max = '50';
        yearsInput.value = String(marksCfg.oldDate.years);
        var t1b = document.createElement('span');
        t1b.textContent = 'лет';
        cb1.addEventListener('change', function () { marksCfg.oldDate.on = cb1.checked; applyAndRerender(); });
        yearsInput.addEventListener('change', function () {
            var v = Math.max(1, Math.min(50, parseInt(yearsInput.value, 10) || 5));
            yearsInput.value = String(v);
            marksCfg.oldDate.years = v;
            applyAndRerender();
        });
        item1.appendChild(lab1);
        item1.appendChild(yearsInput);
        item1.appendChild(t1b);

        // Условие 2: «В гр. ППР» = Нет — красная полоса
        var item2 = document.createElement('div');
        item2.className = 'dms-item';
        var lab2 = document.createElement('label');
        var cb2 = document.createElement('input');
        cb2.type = 'checkbox';
        cb2.checked = marksCfg.noPPR.on;
        var sw2 = document.createElement('span');
        sw2.className = 'dms-swatch';
        sw2.style.background = '#e05360';
        var t2 = document.createElement('span');
        t2.textContent = '«В гр. ППР» — Нет';
        lab2.appendChild(cb2);
        lab2.appendChild(sw2);
        lab2.appendChild(t2);
        cb2.addEventListener('change', function () { marksCfg.noPPR.on = cb2.checked; applyAndRerender(); });
        item2.appendChild(lab2);

        var hint = document.createElement('div');
        hint.className = 'dms-hint';
        hint.textContent = 'Метки — тонкие цветные полосы слева у строки прибора';

        dd.appendChild(head);
        dd.appendChild(item1);
        dd.appendChild(item2);
        dd.appendChild(hint);

        marksEl = dd;
        document.body.appendChild(dd);
        // Позиционирование под кнопкой ⚑
        dd.style.visibility = 'hidden';
        var r = anchorBtn.getBoundingClientRect();
        var dw = dd.offsetWidth || 300, dh = dd.offsetHeight || 200;
        var left = Math.min(window.innerWidth - dw - 8, Math.max(8, r.left));
        var top = r.bottom + 4;
        if (top + dh > window.innerHeight - 8) top = Math.max(8, r.top - dh - 4);
        dd.style.left = left + 'px';
        dd.style.top = top + 'px';
        dd.style.visibility = '';
    }

    // Закрыть все всплывающие панели модуля
    function closePanels() {
        closeFilterDropdown();
        closeStatsPanel();
        closeMarksDropdown();
    }

    // ---------- Инициализация ----------
    ensureButton();
    // Task 168/169: закрывать всплывающие панели при уходе со страницы приборов
    (function () {
        var origNav = window.navigateTo;
        if (typeof origNav === 'function') {
            window.navigateTo = function () {
                closePanels();
                return origNav.apply(window, arguments);
            };
        }
    })();
    // Task 163: синхронизировать класс страницы и счётчик с сохранённым видом
    (function () {
        var page = document.getElementById('page-devices-prod');
        if (page && tableMode) page.classList.add('dev-table-full');
        updateHeaderGroup();
    })();
    // Task 163: пересчёт высоты при resize и при открытии/закрытии detail-панели
    // (шапка страницы скрывается — верх таблицы меняется)
    window.addEventListener('resize', fitTableHeight);
    (function () {
        var dp = document.getElementById('detailPanel');
        if (dp && typeof MutationObserver !== 'undefined') {
            new MutationObserver(fitTableHeight).observe(dp, { attributes: true, attributeFilter: ['class'] });
        }
    })();
    // Если включён табличный вид и список уже отрендерен (модуль загрузился
    // после первого рендера) — конвертировать сейчас
    if (tableMode) {
        var listEl = document.getElementById('devProdList');
        if (listEl && listEl.querySelectorAll('.dev-card[data-dev-id]').length > 0) {
            convertListToTable();
        }
    }
})();
