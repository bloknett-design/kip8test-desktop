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
//   - клик по строке — карточка прибора (detail-панель);
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
        { key: 'Наименование',                  label: 'Наименование',      width: 240, sticky: 2 },
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
        /* Task 163: группа в шапке — [Таблица][счётчик][Экспорт CSV], единый ряд */
        '.dev-table-header-group {',
        '  position: absolute; top: 50%; right: 8px; transform: translateY(-50%);',
        '  display: flex; align-items: center; gap: 8px; z-index: 2;',
        '}',
        '.dev-table-toggle-btn {',
        '  position: relative;  /* Task 166: якорь для полосы-разделителя */',
        '  padding: 6px 12px; min-width: 76px;',
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
        '.dev-table { border-collapse: separate; border-spacing: 0; font-size: 12.5px; min-width: 100%; }',
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
        /* Закреплённые колонки: № (48px) и Наименование (240px) */
        '.dev-table .dev-table-sticky-1 { position: sticky; left: 0; z-index: 2; background: #1a2331; }',
        '.dev-table .dev-table-sticky-2 { position: sticky; left: 48px; z-index: 2; background: #1a2331; }',
        '.dev-table tbody tr:nth-child(even) .dev-table-sticky-1,',
        '.dev-table tbody tr:nth-child(even) .dev-table-sticky-2 { background: #1f2937; }',
        '.dev-table tbody tr:hover .dev-table-sticky-1,',
        '.dev-table tbody tr:hover .dev-table-sticky-2 { background: #243246; }',
        '.dev-table thead .dev-table-sticky-1, .dev-table thead .dev-table-sticky-2 { z-index: 4; background: #233043; }',
        '.dev-table thead .dev-table-sticky-1:hover, .dev-table thead .dev-table-sticky-2:hover { background: #2a3a52; }',
        '.dev-table .dev-table-sticky-2, .dev-table thead th:nth-child(2) { box-shadow: 1px 0 0 rgba(255,255,255,0.09); }',
        /* Светлая тема */
        '[data-theme="light"] .dev-table th { background: #e8edf4; color: #33465e; border-right-color: rgba(0,0,0,0.07); }',
        '[data-theme="light"] .dev-table th:hover { background: #dde5f0; }',
        '[data-theme="light"] .dev-table td { color: #2c3a4c; border-right-color: rgba(0,0,0,0.05); border-bottom-color: rgba(0,0,0,0.05); }',
        '[data-theme="light"] .dev-table tbody tr:nth-child(even) { background: rgba(0,0,0,0.025); }',
        '[data-theme="light"] .dev-table tbody tr:hover { background: rgba(74,143,199,0.10); }',
        '[data-theme="light"] .dev-table .dev-table-sticky-1, [data-theme="light"] .dev-table .dev-table-sticky-2 { background: #ffffff; }',
        '[data-theme="light"] .dev-table tbody tr:nth-child(even) .dev-table-sticky-1,',
        '[data-theme="light"] .dev-table tbody tr:nth-child(even) .dev-table-sticky-2 { background: #f6f8fb; }',
        '[data-theme="light"] .dev-table tbody tr:hover .dev-table-sticky-1,',
        '[data-theme="light"] .dev-table tbody tr:hover .dev-table-sticky-2 { background: #eaf1f9; }',
        '[data-theme="light"] .dev-table thead .dev-table-sticky-1, [data-theme="light"] .dev-table thead .dev-table-sticky-2 { background: #e8edf4; }',
        /* Task 163: счётчик приборов и «Экспорт CSV» — в шапке, справа от «Таблица».
           Видны только в табличном виде (класс .table-active на группе). */
        '.dev-table-header-group .dev-table-count,',
        '.dev-table-header-group .dev-table-csv-btn { display: none; }',
        '.dev-table-header-group.table-active .dev-table-count { display: inline-block; }',
        '.dev-table-header-group.table-active .dev-table-csv-btn { display: inline-block; }',
        '.dev-table-count {',
        '  font-size: 12.5px; font-weight: 600; white-space: nowrap;',
        '  color: var(--text-secondary, rgba(255,255,255,0.55));',
        '}',
        '[data-theme="light"] .dev-table-count { color: rgba(20,20,19,0.6); }',
        '.dev-table-csv-btn {',
        '  padding: 5px 12px; border: 1px solid rgba(74,143,199,0.35); border-radius: 7px;',
        '  background: rgba(74,143,199,0.10); color: #6aa6e0; font-size: 12px; font-weight: 600;',
        '  font-family: inherit; cursor: pointer; transition: all 0.15s;',
        '}',
        '.dev-table-csv-btn:hover { background: rgba(74,143,199,0.2); }',
        '[data-theme="light"] .dev-table-csv-btn { background: rgba(74,143,199,0.08); color: #3a6ea5; }',
        /* Task 165: жёлтая подсветка точных совпадений в ячейках таблицы */
        '.dev-table td mark { background: #ffd60a; color: #1a1a1a; padding: 0 1px; border-radius: 2px; }'
    ].join('\n');

    var styleEl = document.createElement('style');
    styleEl.id = 'devTableDesktopCss';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    // ---------- Кнопка «Таблица» + счётчик + CSV в шапке страницы (Task 163) ----------
    function ensureButton() {
        var header = document.querySelector('#page-devices-prod .page-inline-header');
        if (!header || document.getElementById('devTableToggleBtn')) return;
        // Task 163: группа [Таблица][Показано приборов: N][Экспорт CSV] — один ряд в шапке
        var group = document.createElement('div');
        group.id = 'devTableHeaderGroup';
        group.className = 'dev-table-header-group' + (tableMode ? ' table-active' : '');

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
            // Перезапустить рендер: патч devRenderSorted сам применит вид
            if (typeof window.devRenderSorted === 'function') window.devRenderSorted('prod');
        });
        group.appendChild(btn);

        // Task 163: счётчик приборов (заполняется в buildTableHtml)
        var count = document.createElement('span');
        count.id = 'devTableCount';
        count.className = 'dev-table-count';
        group.appendChild(count);

        // Task 163: кнопка экспорта CSV (клик — делегированный обработчик ниже)
        var csvBtn = document.createElement('button');
        csvBtn.type = 'button';
        csvBtn.id = 'devTableCsvBtn';
        csvBtn.className = 'dev-table-csv-btn';
        csvBtn.textContent = 'Экспорт CSV';
        csvBtn.title = 'Скачать показанные приборы в CSV (открывается в Excel)';
        group.appendChild(csvBtn);

        header.appendChild(group);
    }

    // ---------- Task 163/166: обновить счётчик в шапке и ширину группы ----------
    // count — число показанных приборов (если задано); ширина группы
    // транслируется в CSS-переменную --devt-group-w — от неё сдвигаются
    // лупа и поле поиска (см. CSS выше), наездов на группу нет.
    // Task 166: переменная ставится ВСЕГДА (не только в табличном виде) —
    // зазор лупа→«Таблица» единый 8px в обоих режимах, полоса-разделитель
    // стоит по центру зазора.
    function updateHeaderGroup(count) {
        var counter = document.getElementById('devTableCount');
        if (counter && typeof count === 'number') {
            counter.textContent = 'Показано приборов: ' + count;
            counter.title = sortState.key
                ? ('Сортировка: ' + colLabel(sortState.key) + (sortState.dir === 1 ? ' ▲' : ' ▼'))
                : 'Табличный вид приборов';
        }
        var group = document.getElementById('devTableHeaderGroup');
        var header = document.querySelector('#page-devices-prod .page-inline-header');
        if (group && header) {
            header.style.setProperty('--devt-group-w', (group.offsetWidth + 16) + 'px');
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
        // Task 163: таблица — на всю свободную площадь
        fitTableHeight();
    }

    // ---------- Построение таблицы ----------
    function buildTableHtml(devices) {
        var cols = activeColumns();
        var rows = devices.slice();
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

        var html = '<div class="dev-table-wrap">';
        // Task 163: счётчик и «Экспорт CSV» — в шапке (updateHeaderGroup),
        // тулбар над таблицей удалён — таблица начинается сразу с шапки колонок
        updateHeaderGroup(rows.length);
        // Task 165: текущий запрос — для подсветки совпадений в ячейках
        var query = currentSearchQuery();
        html += '<table class="dev-table"><thead><tr>';
        cols.forEach(function (col) {
            var cls = 'dev-table-th';
            if (col.sticky) cls += ' dev-table-sticky-' + col.sticky;
            if (sortState.key === col.key) cls += (sortState.dir === 1 ? ' dev-table-col-sorted-asc' : ' dev-table-col-sorted-desc');
            var icon = '';
            if (col.sortable !== false) {
                icon = sortState.key === col.key
                    ? (sortState.dir === 1 ? '<span class="dev-table-sort-icon">▲</span>' : '<span class="dev-table-sort-icon">▼</span>')
                    : '<span class="dev-table-sort-icon">⇅</span>';
            }
            html += '<th class="' + cls + '"' + (col.sortable !== false ? ' data-sort-key="' + esc(col.key) + '"' : '') +
                    (col.width ? ' style="width:' + col.width + 'px;' + (col.sticky === 2 ? 'left:48px;' : '') + '"' : '') +
                    ' title="' + esc(col.label) + '">' + esc(col.label) + icon + '</th>';
        });
        html += '</tr></thead><tbody>';
        rows.forEach(function (dev, i) {
            html += '<tr class="dev-table-row" data-dev-id="' + esc(String(dev['ID'])) + '">';
            cols.forEach(function (col) {
                var val = (col.key === '__num__') ? String(i + 1) : String(dev[col.key] == null ? '' : dev[col.key]);
                var cls = 'dev-table-td' + (col.sticky ? ' dev-table-sticky-' + col.sticky : '');
                // Task 165: подсветка совпадений (кроме колонки № — это порядковый номер)
                var cellHtml = (col.key === '__num__') ? esc(val) : markCell(val, query);
                html += '<td class="' + cls + '" title="' + esc(val) + '">' + cellHtml + '</td>';
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';
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
        // Сортировка: клик по заголовку колонки
        var th = e.target.closest ? e.target.closest('.dev-table th[data-sort-key]') : null;
        if (th) {
            var key = th.getAttribute('data-sort-key');
            if (sortState.key === key) {
                sortState.dir = -sortState.dir;
            } else {
                sortState.key = key;
                sortState.dir = 1;
            }
            var listEl = document.getElementById('devProdList');
            if (listEl && lastDevices.length) {
                listEl.innerHTML = buildTableHtml(lastDevices);
                fitTableHeight();   // Task 163: высота под свободную площадь
            }
            return;
        }
        // Клик по строке — открыть карточку прибора (detail-панель)
        var row = e.target.closest ? e.target.closest('.dev-table-row') : null;
        if (row && row.getAttribute('data-dev-id')) {
            document.querySelectorAll('.dev-table-row.dev-table-row-selected').forEach(function (r) {
                r.classList.remove('dev-table-row-selected');
            });
            row.classList.add('dev-table-row-selected');
            if (typeof window.devOpenDetail === 'function') {
                window.devOpenDetail(row.getAttribute('data-dev-id'));
            }
            return;
        }
        // Экспорт CSV
        if (e.target && e.target.id === 'devTableCsvBtn') {
            exportCsv();
        }
    });

    // ---------- Экспорт CSV ----------
    function exportCsv() {
        if (!lastDevices.length) return;
        var cols = activeColumns();
        // BOM — чтобы Excel корректно открыл UTF-8; разделитель «;» (русская локаль)
        var lines = ['\uFEFF' + cols.map(function (c) { return csvCell(c.label); }).join(';')];
        lastDevices.forEach(function (dev) {
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

    // ---------- Инициализация ----------
    ensureButton();
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
