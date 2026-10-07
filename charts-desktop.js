// ============================================================
// ГРАФИКИ КИП ИОС — модуль ТОЛЬКО десктопного приложения (Electron)
// Task 147: полностью вынесен из index.html, чтобы мобильная PWA
// не содержала кода графиков. Загружается динамически loader'ом
// в index.html при IS_ELECTRON (User-Agent, Task 131).
//
// Состав (самодостаточен; зависимости: глобальные navigateTo,
// KipAuth, CSS-переменные :root):
//   1. CSS графиков (инъекция <style> в head)
//   2. Страница page-charts (инъекция div в DOM)
//   3. Кнопка «Графики» на КИП ИОС (chartsEntryBtn, инъекция)
//   4. Модуль KipCharts
// После инъекции — повторный _applyRoleToUI (кнопка могла
// появиться после первого прохода фильтрации ролей).
//
// Task 473: ППР «Приборы» — КОРЕНЬ «не отображает зрительно»: у
// .ppr-bars-row было align-items:flex-end — ячейки не растягивались
// на высоту ряда, height:% столбца разрешался против auto-высоты и
// схлопывался в min-height:2px (ВСЕ столбцы 2px). Теперь stretch.
// Плюс: значение над КАЖДЫМ столбцом (количество приборов на каждый
// месяц видно прямо на диаграмме, включая «0» пустых месяцев —
// подпись у основания) + ВСПОМОГАТЕЛЬНАЯ ПРАВАЯ ОСЬ для малых серий
// (максимум серии <= 25% от общего максимума: К 13–48 и П 0–15 при
// ТО 320–500): столбцы малых серий масштабируются по своей оси и
// зрительно различимы по месяцам; в легенде малые серии помечены
// «(правая ось)»; сверху графика добавлен запас под подписи
// (padding-top 16px).
//
// Task 483: ППР «Приборы» — НОВЫЙ ВИД «как в Excel» (заявка: «оформ-
// ление и предоставление информации сделай по примеру как на
// приложенном скрину»): ТАБЛИЦА СВЕРХУ (шапка «Вид обслуживания» +
// «Количество ПРИБОРОВ по графику ППР по месяцам на <год> год»,
// месяцы I–XII с пастельными заливками листа «Диаграммы», строки
// К/П/ТО с бейджами-кодами и оттенками строк) + ДИАГРАММА СНИЗУ
// (сгруппированные столбцы К/П/ТО, выровненные по колонкам таблицы
// — общая сетка, значения над каждым столбцом, осей/легенды/титула
// НЕТ — как на листе «Диаграммы»; ТО — горизонтальная штриховка).
// ДАННЫЕ БОЛЬШЕ НЕ Зашиты: _PPR_DEVICES УДАЛЁН (корень жалобы —
// зашитые числа расходились с файлом); счётчики считает sync-devices.py
// (ppr_chart в data/devices.json): метка месяца I..XII == «К»/«П»/«ТО»
// (точное совпадение, как COUNTIF; «К*» НЕ считается) И столбец
// «Наличие в ППР» == «Есть» (заявка: «если «Нет» — не учитываются»;
// РЕЗУЛЬТАТ ОТЛИЧАЕТСЯ от листа «Диаграммы», где COUNTIF считает
// ВСЕ строки, включая «Нет»: К 350 без изм., П 86→84, ТО 4703→2977).
// Вкладка «Приборы» теперь грузит devices.json (единый путь
// _renderTab/_loadData).
//
// Task 484: ППР «Блокировки» — ТОТ ЖЕ вид «как в Excel», что
// «Приборы» (заявка: «убери всё лишнее и сделай так же оформление
// и подсчёт, как во вкладке "Приборы"»): вкладка «Блокировки»
// рендерит ТАБЛИЦУ+ДИАГРАММУ _renderDevicesPPR (титул «Количество
// БЛОКИРОВОК …», серии Кр/ТО) из блока ppr_chart в
// data/lockouts.json — его считает sync-lockouts.py по исходному
// листу «Блокировки»: метка месяца I..XII == «Кр»/«ТО»
// (регистронезависимо, как COUNTIF) И «Наличие в перечне и в ППР»
// == «Есть» (тот же фильтр заявки; «Нет»/пусто — мимо).
// ЛИШНЕЕ УДАЛЕНО: старый рендерер _renderPPRChart (гистограмма с
// осями/легендой/правой осью, Task 473/483) + заШитые счётчики
// _PPR_LOCKOUTS (расходились с файлом: было Кр 526/ТО 1578, в файле
// с фильтром Кр 503/ТО 1509) + их CSS (ppr-chart-*, ppr-bar-*,
// ppr-y-*, ppr-totals-*) и _niceMax; сводная статистика и
// Топ-10 вкладки «Блокировки» — как у «Приборов», НЕ рендерятся.
//
// Task 485: (а) «Блокировки»: расшифровка серии «Кр» — «Кап.
// ремонт» (в 484 была опечатка «Кан.»; правка в sync-lockouts.py
// и data/lockouts.json). (б) Вкладки «Клапана»
// и «Регуляторы» — НОВЫЕ КРУГОВЫЕ диаграммы (SVG) в том же
// оформлении, что «Приборы»/«Блокировки»: белая «документная»
// карточка .ppr-tc-card + палитра Excel accent1-6 и их +40%
// (сектора от 12 часов по часовой, как Excel). СТАРАЯ сводная
// статистика и Топ-10 бары (по группе/производству) со их CSS
// УДАЛЕНЫ (заявка: «убери текущие графики и подсчёты, и сделай
// новые (круговые)»). Клапана: по типам (Отсечные — «Тип,
// пропускная характеристика» содержит «Отс»; Регулирующие —
// «Рег»/«рег»; Дисковые затворы — столбец «Тип запорной части.
// Материал затвора/ корпуса» содержит «Затвор дисковый»;
// остальные — «Клапана»), по Ду (DN), футированные. Регуляторы:
// по производствам, по устройствам («Устроиство регулятора или
// ручного управления»), по параметрам — унификация по регули-
// руемой величине (температура/давление/уровень/расход/концен-
// трация/частота на ЧП/ручное управление/прочие).
// ============================================================
(function () {
    'use strict';

    // ---------- 1. CSS ----------
    var css = "    /* ======================== \u0413\u0420\u0410\u0424\u0418\u041a\u0418 \u041a\u0418\u041f \u0418\u041e\u0421 ======================== */\n    .charts-tabs {\n        display: flex;\n        gap: 0;\n        border-bottom: 1px solid var(--border-color);\n        background: var(--card-bg);\n        position: sticky;\n        top: 56px;\n        z-index: 5;\n        overflow-x: auto;\n        -webkit-overflow-scrolling: touch;\n    }\n    .charts-tab {\n        flex: 1;\n        min-width: 0;\n        padding: 10px 6px;\n        border: none;\n        background: transparent;\n        color: var(--text-secondary);\n        font-size: 13px;\n        font-weight: 500;\n        cursor: pointer;\n        white-space: nowrap;\n        position: relative;\n        transition: color 0.2s;\n    }\n    .charts-tab::after {\n        content: '';\n        position: absolute;\n        left: 0; right: 0; bottom: 0;\n        height: 2px;\n        background: transparent;\n        border-radius: 1px;\n        transition: background 0.2s;\n    }\n    .charts-tab-active {\n        color: #3aa288;\n        font-weight: 600;\n    }\n    .charts-tab-active::after {\n        background: #3aa288;\n    }\n    .charts-content {\n        padding: 12px 14px 24px;\n    }\n    .charts-loading {\n        text-align: center;\n        padding: 40px 20px;\n        color: var(--text-secondary);\n        font-size: 13px;\n    }\n    /* \u0421\u0432\u0435\u0442\u043b\u0430\u044f \u0442\u0435\u043c\u0430 */\n    [data-theme=\"light\"] .charts-tab-active { color: #2e8a72; }\n    [data-theme=\"light\"] .charts-tab-active::after { background: #2e8a72; }\n";
    var styleEl = document.createElement('style');
    styleEl.id = 'chartsDesktopCss';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    // ---------- 1a. CSS Task 483: ППР «Приборы» — таблица + диаграмма ----------
    // Вид-фрагмент листа «Диаграммы» книги «Перечень КИП ИОС рабочий.xlsx»:
    // БЕЛАЯ «документная» карточка в обеих темах (пастели Excel читаются
    // только на белом); сетка таблицы — через gap:1px + фон линий;
    // диаграмма ниже — ТА ЖЕ сетка (столбцы выровнены по колонкам
    // таблицы), палитра accent1/2/3 темы книги, штриховка ТО.
    var css483 = [
        '/* ===== Task 483: ППР «Приборы» — таблица + диаграмма «как в Excel» ===== */',
        '.ppr-tc-card {',
        '    background: #ffffff;',
        '    border: 1px solid rgba(0,0,0,0.35);',
        '    border-radius: 8px;',
        '    margin-bottom: 16px;',
        '    padding: 10px 8px 8px;',
        '}',
        '[data-theme="light"] .ppr-tc-card { background: #ffffff; border-color: rgba(0,0,0,0.28); }',
        '.ppr-tc-table {',
        '    display: grid;',
        '    grid-template-columns: minmax(104px, 1.45fr) 40px repeat(12, minmax(30px, 1fr));',
        '    gap: 1px;',
        '    background: #9a9a9a; /* цвет линий сетки (gap) */',
        '    border: 1px solid #7f7f7f;',
        '}',
        '.ppr-tc-table > div {',
        '    background: #ffffff;',
        '    display: flex;',
        '    align-items: center;',
        '    justify-content: center;',
        '    text-align: center;',
        '    font-size: 12px;',
        '    color: #111111;',
        '    padding: 4px 2px;',
        '    box-sizing: border-box;',
        '    min-height: 26px;',
        '}',
        '.ppr-tc-vo {',
        '    grid-column: 1 / 3;',
        '    grid-row: 1 / 3;',
        '    font-weight: 600;',
        '    font-size: 11.5px;',
        '}',
        '.ppr-tc-title {',
        '    grid-column: 3 / 15;',
        '    font-weight: 600;',
        '    font-size: 12.5px;',
        '    padding: 6px 4px;',
        '}',
        '.ppr-tc-m { font-weight: 700; font-size: 11px; }',
        '.ppr-tc-table .ppr-tc-m-pink { background: #FFB9B9; }',
        '.ppr-tc-table .ppr-tc-m-gold { background: #FFDB69; }',
        '.ppr-tc-name { justify-content: flex-start; text-align: left; padding-left: 10px; }',
        '.ppr-tc-badge { font-weight: 700; }',
        '.ppr-tc-table .ppr-tc-badge-k  { background: #8DB4E2; }',
        '.ppr-tc-table .ppr-tc-badge-p  { background: #D99694; }',
        '.ppr-tc-table .ppr-tc-badge-to { background: #C3D69B; }',
        '.ppr-tc-table .ppr-tc-r-k  { background: #DBEEF4; }',
        '.ppr-tc-table .ppr-tc-r-p  { background: #FDEADA; }',
        '.ppr-tc-table .ppr-tc-r-to { background: #EBF1DE; }',
        '.ppr-tc-v { font-variant-numeric: tabular-nums; }',
        '/* Диаграмма — та же сетка (выравнивание по колонкам таблицы) */',
        '.ppr-tc-chart {',
        '    display: grid;',
        '    grid-template-columns: minmax(104px, 1.45fr) 40px repeat(12, minmax(30px, 1fr));',
        '    gap: 1px;',
        '    margin-top: 2px;',
        '    min-height: 216px;',
        '    /* прозрачная рамка = рамке таблицы: контент-боксы сеток',
        '       совпадают побитово — столбцы диаграммы стоят ровно под',
        '       колонками месяцев таблицы */',
        '    border: 1px solid transparent;',
        '}',
        '.ppr-tc-chart-empty { grid-column: 1 / 3; }',
        '.ppr-tc-g {',
        '    position: relative;',
        '    display: flex;',
        '    border-bottom: 1px solid rgba(0,0,0,0.45);',
        '    border-left: 1px solid rgba(0,0,0,0.10);',
        '}',
        '.ppr-tc-bars {',
        '    position: relative;',
        '    flex: 1;',
        '    display: flex;',
        '    align-items: stretch; /* Task 473: ячейки растягиваются на высоту */',
        '    justify-content: center;',
        '    gap: 2px;',
        '    padding: 16px 1px 0; /* запас под подписи значений (Task 473) */',
        '    box-sizing: border-box;',
        '}',
        '.ppr-tc-bcell {',
        '    flex: 1;',
        '    max-width: 17px;',
        '    position: relative;',
        '    display: flex;',
        '    align-items: flex-end; /* низ столбца прижат к основанию */',
        '    justify-content: center;',
        '}',
        '.ppr-tc-bar {',
        '    width: 100%;',
        '    min-height: 2px;',
        '    position: relative;',
        '    border: 1px solid rgba(0,0,0,0.22);',
        '    border-radius: 1px 1px 0 0;',
        '    box-sizing: border-box;',
        '}',
        '.ppr-tc-hatch {',
        '    background: repeating-linear-gradient(to bottom, #A3AF7F 0px, #A3AF7F 3px, #C4D695 3px, #C4D695 6px);',
        '}',
        '.ppr-tc-val {',
        '    position: absolute;',
        '    top: -13px;',
        '    left: 50%;',
        '    transform: translateX(-50%);',
        '    font-size: 9px;',
        '    font-weight: 600;',
        '    color: #222222;',
        '    white-space: nowrap;',
        '    pointer-events: none;',
        '}',
        '.ppr-tc-val-zero {',
        '    position: absolute;',
        '    bottom: 1px;',
        '    left: 50%;',
        '    transform: translateX(-50%);',
        '    font-size: 9px;',
        '    font-weight: 600;',
        '    color: #666666;',
        '    white-space: nowrap;',
        '    pointer-events: none;',
        '}',
        '.ppr-tc-empty-note {',
        '    padding: 18px 14px;',
        '    font-size: 13px;',
        '    color: var(--text-secondary);',
        '    text-align: center;',
        '}'
    ].join('\n');
    var styleEl483 = document.createElement('style');
    styleEl483.id = 'chartsDesktopCss483';
    styleEl483.textContent = css483;
    document.head.appendChild(styleEl483);

    // ---------- 1b. CSS Task 485: круговые диаграммы ----------
    // «Клапана»/«Регуляторы»: та же «документная» белая карточка
    // .ppr-tc-card (Task 483/484), титул по центру; пирог — SVG
    // (сектора path-дугами, белые разделители 1px), проценты у
    // крупных секторов (>= 5.5%) снаружи; легенда справа — сетка:
    // свотч палитры + название + количество + процент.
    var css485 = [
        '/* ===== Task 485: круговые диаграммы «Клапана»/«Регуляторы» ===== */',
        '.pc-title {',
        '    font-weight: 600;',
        '    font-size: 12.5px;',
        '    color: #111111;',
        '    text-align: center;',
        '    padding: 2px 6px 8px;',
        '}',
        '.pc-body {',
        '    display: flex;',
        '    align-items: center;',
        '    flex-wrap: wrap;',
        '    gap: 4px 6px;',
        '    padding: 0 2px 2px;',
        '}',
        '.pc-svg {',
        '    flex: 0 0 244px;',
        '    width: 244px;',
        '    max-width: 100%;',
        '    height: auto;',
        '    display: block;',
        '}',
        '.pc-legend {',
        '    flex: 1 1 230px;',
        '    min-width: 205px;',
        '    display: grid;',
        '    grid-template-columns: repeat(auto-fill, minmax(184px, 1fr));',
        '    gap: 3px 10px;',
        '    align-content: start;',
        '}',
        '.pc-li {',
        '    display: flex;',
        '    align-items: center;',
        '    gap: 5px;',
        '    font-size: 11px;',
        '    color: #111111;',
        '    min-width: 0;',
        '}',
        '.pc-swatch {',
        '    flex: 0 0 auto;',
        '    width: 10px;',
        '    height: 10px;',
        '    border: 1px solid rgba(0,0,0,0.28);',
        '    box-sizing: border-box;',
        '}',
        '.pc-name {',
        '    flex: 1 1 auto;',
        '    min-width: 0;',
        '    overflow: hidden;',
        '    text-overflow: ellipsis;',
        '    white-space: nowrap;',
        '    text-align: left;',
        '}',
        '.pc-cnt {',
        '    flex: 0 0 auto;',
        '    font-weight: 700;',
        '    font-variant-numeric: tabular-nums;',
        '}',
        '.pc-pct {',
        '    flex: 0 0 auto;',
        '    width: 38px;',
        '    text-align: right;',
        '    color: #555555;',
        '    font-variant-numeric: tabular-nums;',
        '}',
        '.pc-slice-lbl {',
        '    font-size: 10px;',
        '    font-weight: 600;',
        '    fill: #111111;',
        '    pointer-events: none;',
        '}'
    ].join('\n');
    var styleEl485 = document.createElement('style');
    styleEl485.id = 'chartsDesktopCss485';
    styleEl485.textContent = css485;
    document.head.appendChild(styleEl485);

    // ---------- 2. Страница page-charts ----------
    var pageWrap = document.createElement('div');
    pageWrap.innerHTML = "        <div id=\"page-charts\" class=\"page-content\">\n            <div class=\"page-inline-header\"><div class=\"page-inline-header-chevron\" onclick=\"chevronTap()\" aria-label=\"\u041d\u0430\u0437\u0430\u0434 / \u0413\u043b\u0430\u0432\u043d\u0430\u044f\"></div><div class=\"page-inline-header-title\">\u0413\u0440\u0430\u0444\u0438\u043a\u0438 \u041a\u0418\u041f \u0418\u041e\u0421</div></div>\n            <!-- \u0412\u043a\u043b\u0430\u0434\u043a\u0438 -->\n            <div class=\"charts-tabs\">\n                <button class=\"charts-tab charts-tab-active\" data-chart-tab=\"devices\" onclick=\"KipCharts.switchTab('devices')\">\u041f\u0440\u0438\u0431\u043e\u0440\u044b</button>\n                <button class=\"charts-tab\" data-chart-tab=\"lockouts\" onclick=\"KipCharts.switchTab('lockouts')\">\u0411\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u043a\u0438</button>\n                <button class=\"charts-tab\" data-chart-tab=\"valves\" onclick=\"KipCharts.switchTab('valves')\">\u041a\u043b\u0430\u043f\u0430\u043d\u0430</button>\n                <button class=\"charts-tab\" data-chart-tab=\"regulators\" onclick=\"KipCharts.switchTab('regulators')\">\u0420\u0435\u0433\u0443\u043b\u044f\u0442\u043e\u0440\u044b</button>\n            </div>\n            <!-- \u0421\u043e\u0434\u0435\u0440\u0436\u0438\u043c\u043e\u0435 \u0432\u043a\u043b\u0430\u0434\u043a\u0438 -->\n            <div id=\"chartsContent\" class=\"charts-content\">\n                <div class=\"charts-loading\">\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026</div>\n            </div>\n        </div>\n";
    var pageEl = pageWrap.firstElementChild;
    // Вставить перед page-calc-kipa (как было в index.html)
    var anchorPage = document.getElementById('page-calc-kipa');
    if (anchorPage && anchorPage.parentNode) {
        anchorPage.parentNode.insertBefore(pageEl, anchorPage);
    } else {
        document.body.appendChild(pageEl);
    }

    // ---------- 3. Кнопка «Графики» на странице КИП ИОС ----------
    var btnWrap = document.createElement('div');
    btnWrap.innerHTML = "                    <div class=\"menu-btn\" id=\"chartsEntryBtn\" style=\"border-color:rgba(58,162,136,0.35);\"><div class=\"menu-btn-text\"><div class=\"menu-btn-label\" style=\"color:#3aa288;\">\u0413\u0440\u0430\u0444\u0438\u043a\u0438</div><div class=\"menu-btn-sublabel\">\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430 \u041a\u0418\u041f \u0418\u041e\u0421</div></div><button type=\"button\" class=\"menu-btn-overflow\" aria-label=\"\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044f\" onclick=\"event.stopPropagation(); openPinSheet('charts')\"><svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"5\" r=\"1.6\"/><circle cx=\"12\" cy=\"12\" r=\"1.6\"/><circle cx=\"12\" cy=\"19\" r=\"1.6\"/></svg></button><i class=\"menu-btn-arrow\" style=\"color:rgba(58,162,136,0.4);\">\u203a</i></div>";
    var btnEl = btnWrap.firstElementChild;
    if (btnEl) {
        var row = document.querySelector('#page-kip-ios .kip-ios-block .menu-btn-row');
        if (row) row.appendChild(btnEl);
    }

    // ---------- 4. Модуль KipCharts ----------

    // KipCharts — Графики и статистика КИП ИОС
    // ============================================================
    window.KipCharts = {

        _currentTab: 'devices',   // активная вкладка
        _cache: {},               // кэш загруженных данных {devices: [...], lockouts: [...], ...}

        // Месяцы года (римские)
        _MONTHS_ROMAN: ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'],

        // Task 483: ППР «Приборы» — оформление серий (палитра листа
        // «Диаграммы» книги: бейджи и оттенки строк — accent1/2/3 +80%
        // (стандартная палитра Excel), столбцы — accent1/2/3, штриховка
        // ТО — полосы тех же тонов). Суффиксы классов — латиницей.
        _PPR_TC_STYLES: {
            'К':  { suffix: 'k',  bar: '#4F81BD', badge: '#8DB4E2', row: '#DBEEF4' },
            'П':  { suffix: 'p',  bar: '#C0504D', badge: '#D99694', row: '#FDEADA' },
            'ТО': { suffix: 'to', bar: '#9BBB59', badge: '#C3D69B', row: '#EBF1DE' },
            // Task 484: «Кр» (капитальный ремонт блокировок) — та же
            // ветка accent1 (синий), что «К» приборов; штриховки НЕТ
            'Кр': { suffix: 'k',  bar: '#4F81BD', badge: '#8DB4E2', row: '#DBEEF4' }
        },

        // Task 483: пастельные заливки шапки месяцев — как на листе
        // «Диаграммы» (I/V/IX/XII — розовый #FFB9B9, VI-VIII —
        // золотой #FFDB69, остальные — без заливки).
        _PPR_TC_MONTH_CLS: ['pink','','','','pink','gold','gold','gold','pink','','','pink'],

        // Task 483: блок ppr_chart из data/devices.json (считает
        // sync-devices.py по листу «Приборы»: метки месяцев I..XII ==
        // К/П/ТО И «Наличие в ППР» == «Есть»). Заполняется в
        // _loadData('devices'); рендер — _renderDevicesPPR.
        _pprChart: null,

        // Task 484: блок ppr_chart из data/lockouts.json (считает
        // sync-lockouts.py по листу «Блокировки»: метки месяцев
        // I..XII == Кр/ТО И «Наличие в перечне и в ППР» == «Есть» —
        // тот же подсчёт, что у приборов). Заполняется в
        // _loadData('lockouts'); рендер — _renderDevicesPPR.
        _pprChartLockouts: null,

        // Конфигурация разделов (Task 485: только источники данных —
        // поля groupField/prodField/typeField/color старых Топ-10
        // баров удалены вместе с ними; вкладки «Клапана»/
        // «Регуляторы» рендерят круговые диаграммы из этих же
        // массивов)
        _SECTIONS: {
            devices:    { jsonFile: 'data/devices.json',    arrayKey: 'devices',    label: 'Приборы' },
            lockouts:   { jsonFile: 'data/lockouts.json',   arrayKey: 'lockouts',   label: 'Блокировки' },
            valves:     { jsonFile: 'data/valves.json',     arrayKey: 'valves',     label: 'Клапана' },
            regulators: { jsonFile: 'data/regulators.json', arrayKey: 'regulators', label: 'Регуляторы' }
        },

        // Переключение вкладки
        switchTab: function(tab) {
            if (!this._SECTIONS[tab]) return;
            this._currentTab = tab;
            // Обновить UI вкладок
            var tabs = document.querySelectorAll('.charts-tab');
            for (var i = 0; i < tabs.length; i++) {
                var t = tabs[i];
                if (t.getAttribute('data-chart-tab') === tab) {
                    t.classList.add('charts-tab-active');
                } else {
                    t.classList.remove('charts-tab-active');
                }
            }
            this._renderTab(tab);
        },

        // Загрузка данных раздела
        _loadData: function(section, callback) {
            if (this._cache[section]) {
                callback(this._cache[section]);
                return;
            }
            var sec = this._SECTIONS[section];
            var ts = Date.now();
            fetch(sec.jsonFile + '?v=' + ts, {cache: 'no-store'})
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    var items = data[sec.arrayKey] || [];
                    KipCharts._cache[section] = items;
                    // Task 483: для приборов — захватить блок ppr_chart
                    // (месячные счётчики К/П/ТО с фильтром «Наличие в ППР»
                    // = «Есть», считает sync-devices.py по листу «Приборы»)
                    if (section === 'devices' && data.ppr_chart) {
                        KipCharts._pprChart = data.ppr_chart;
                    }
                    // Task 484: для блокировок — тот же блок ppr_chart
                    // (счётчики Кр/ТО с фильтром «Наличие в перечне и
                    // в ППР» = «Есть», считает sync-lockouts.py по листу
                    // «Блокировки»)
                    if (section === 'lockouts' && data.ppr_chart) {
                        KipCharts._pprChartLockouts = data.ppr_chart;
                    }
                    callback(items);
                })
                .catch(function() {
                    // Fallback — показать пустой массив
                    KipCharts._cache[section] = [];
                    callback([]);
                });
        },

        // Рендер вкладки
        _renderTab: function(tab) {
            var container = document.getElementById('chartsContent');
            if (!container) return;

            // Task 483: вкладка «Приборы» идёт общим путём — грузит
            // devices.json (диаграмме ППР нужны счётчики ppr_chart;
            // раньше данные были заШиты и загрузка не требовалась)
            container.innerHTML = '<div class="charts-loading">Загрузка…</div>';
            this._loadData(tab, function(items) {
                KipCharts._renderContent(tab, items);
            });
        },

        // Основной рендер контента — ДИСПЕТЧЕР вкладок (Task 485):
        // «Приборы»/«Блокировки» — таблица + диаграмма ППР «как в
        // Excel» из блока ppr_chart (Task 483/484); «Клапана»/
        // «Регуляторы» — КРУГОВЫЕ диаграммы из массивов данных
        // (Task 485; заявка: «убери текущие графики и подсчёты, и
        // сделай новые (круговые)»). Старая сводная статистика и
        // Топ-10 бары (по группе/производству) УДАЛЕНЫ — не
        // рендерятся ни для одной вкладки.
        _renderContent: function(tab, items) {
            var container = document.getElementById('chartsContent');
            if (!container) return;

            // Для вкладок Приборы/Блокировки — таблица + диаграмма
            // ППР «как в Excel» из блока ppr_chart (Task 483 —
            // приборы: sync-devices.py по листу «Приборы», фильтр
            // «Наличие в ППР» = «Есть»; Task 484 — блокировки:
            // sync-lockouts.py по листу «Блокировки», фильтр «Наличие
            // в перечне и в ППР» = «Есть»; тот же вид и подсчёт)
            if (tab === 'devices' || tab === 'lockouts') {
                var ppr = tab === 'devices' ? this._pprChart
                                            : this._pprChartLockouts;
                if (ppr && ppr.series && ppr.series.length) {
                    container.innerHTML = this._renderDevicesPPR(ppr,
                        tab === 'devices' ? 'ПРИБОРОВ' : 'БЛОКИРОВОК');
                } else {
                    // ppr_chart отсутствует (устаревший кэш данных или
                    // синк с gid= одного листа) — понятное сообщение
                    container.innerHTML = '<div class="ppr-tc-card"><div class="ppr-tc-empty-note">' +
                        'Данные графика ППР по ' + (tab === 'devices' ? 'приборам' : 'блокировкам') + ' появятся после обновления перечня ' +
                        'КИП ИОС (синхронизация с таблицей). Обновите страницу или ' +
                        'повторите позже.</div></div>';
                }
                return;
            }

            // Task 485: Клапана/Регуляторы — круговые диаграммы
            if (tab === 'valves' || tab === 'regulators') {
                if (!items || !items.length) {
                    container.innerHTML = '<div class="ppr-tc-card"><div class="ppr-tc-empty-note">' +
                        'Данные по ' + (tab === 'valves' ? 'клапанам' : 'регуляторам') +
                        ' появятся после синхронизации с таблицей. Обновите страницу или ' +
                        'повторите позже.</div></div>';
                    return;
                }
                container.innerHTML = tab === 'valves'
                    ? this._renderValvesPies(items)
                    : this._renderRegulatorsPies(items);
                return;
            }
        },

        // ============================================================
        // Task 483: ППР «Приборы» — ТАБЛИЦА + ДИАГРАММА «как в Excel»
        // (вид-фрагмент листа «Диаграммы» книги «Перечень КИП ИОС
        // рабочий.xlsx», сверено со скрином пользователя):
        //  — ТАБЛИЦА: шапка «Вид обслуживания» (2 строки × 2 колонки,
        //    объединена как A1:B2) + титул «Количество ПРИБОРОВ по
        //    графику ППР по месяцам на <год> год» (C1:N1); месяцы
        //    I–XII жирным с пастельными заливками (I/V/IX/XII —
        //    #FFB9B9, VI-VIII — #FFDB69); строки К/П/ТО: бейдж-код
        //    (accent +40%) + название + 12 значений (строка —
        //    оттенок accent +80%);
        //  — ДИАГРАММА под таблицей: СГРУППИРОВАННЫЕ столбцы К/П/ТО
        //    (accent1/2/3: #4F81BD/#C0504D/#9BBB59, у ТО — горизон-
        //    тальная штриховка, как на листе), выровнены по колонкам
        //    таблицы (ОБЩАЯ CSS-сетка), значения над КАЖДЫМ столбцом
        //    (0 — подпись у основания, прецедент Task 473), осей,
        //    легенды и титула диаграммы НЕТ (месяцы задаёт таблица
        //    сверху) — всё как на листе «Диаграммы».
        // Данные — ppr_chart (см. _loadData): counts НЕ заШиты.
        // Task 484: noun — существительное титула («ПРИБОРОВ» у
        // приборов, «БЛОКИРОВОК» у блокировок; по умолчанию —
        // «ПРИБОРОВ», обратная совместимость моков тестов 483).
        // ============================================================
        _renderDevicesPPR: function(ppr, noun) {
            var styles = this._PPR_TC_STYLES;
            var mCls = this._PPR_TC_MONTH_CLS;
            var FALLBACK = { suffix: 'x', bar: '#9e9e9e', badge: '#e0e0e0', row: '#f5f5f5' };

            // Серии (код/название/значения) + оформление по коду
            var series = [];
            for (var i = 0; i < ppr.series.length; i++) {
                var s = ppr.series[i];
                if (!s || !s.values || s.values.length !== 12) continue;
                var st = styles[s.code] || FALLBACK;
                series.push({ code: s.code, name: s.name || s.code, values: s.values, st: st });
            }
            var year = ppr.year || new Date().getFullYear();
            var title = 'Количество ' + (noun || 'ПРИБОРОВ') + ' по графику ППР по месяцам на ' + year + ' год';

            // ЕДИНАЯ шкала всех серий (как в Excel; оси нет, но высоты
            // пропорциональны значениям). Максимум по всем сериям.
            var maxVal = 1;
            for (var i = 0; i < series.length; i++) {
                for (var m = 0; m < 12; m++) {
                    var v = series[i].values[m];
                    if (typeof v === 'number' && v > maxVal) maxVal = v;
                }
            }

            var html = '<div class="ppr-tc-card">';

            // ---------- ТАБЛИЦА ----------
            html += '<div class="ppr-tc-table">';
            // Шапка: «Вид обслуживания» (строки 1-2, колонки 1-2) + титул
            html += '<div class="ppr-tc-vo">Вид обслуживания</div>';
            html += '<div class="ppr-tc-title">' + this._escHtml(title) + '</div>';
            for (var m = 0; m < 12; m++) {
                var cls = 'ppr-tc-m' + (mCls[m] ? ' ppr-tc-m-' + mCls[m] : '');
                html += '<div class="' + cls + '">' + this._MONTHS_ROMAN[m] + '</div>';
            }
            // Строки данных: бейдж + название + 12 значений
            for (var i = 0; i < series.length; i++) {
                var sr = series[i];
                html += '<div class="ppr-tc-name ppr-tc-r-' + sr.st.suffix + '">' + this._escHtml(sr.name) + '</div>';
                html += '<div class="ppr-tc-badge ppr-tc-badge-' + sr.st.suffix + '">' + this._escHtml(sr.code) + '</div>';
                for (var m = 0; m < 12; m++) {
                    var val = sr.values[m];
                    var num = (typeof val === 'number' && isFinite(val)) ? val : 0;
                    html += '<div class="ppr-tc-v ppr-tc-r-' + sr.st.suffix + '">' + num + '</div>';
                }
            }
            html += '</div>';

            // ---------- ДИАГРАММА (та же сетка — выравнивание по месяцам) ----------
            html += '<div class="ppr-tc-chart">';
            html += '<div class="ppr-tc-chart-empty"></div>';
            for (var m = 0; m < 12; m++) {
                html += '<div class="ppr-tc-g">';
                html += '<div class="ppr-tc-bars">';
                for (var i = 0; i < series.length; i++) {
                    var sr = series[i];
                    var val = sr.values[m];
                    var num = (typeof val === 'number' && isFinite(val)) ? val : 0;
                    var barCls = 'ppr-tc-bar' + (sr.code === 'ТО' ? ' ppr-tc-hatch' : '');
                    var styleAttr = 'height:' + ((num / maxVal) * 100) + '%;' +
                        (sr.code !== 'ТО' ? 'background:' + sr.st.bar + ';' : '');
                    html += '<div class="ppr-tc-bcell">';
                    if (num > 0) {
                        html += '<div class="' + barCls + '" style="' + styleAttr + '"' +
                            ' title="' + this._escHtml(sr.name) + ' (' + this._escHtml(sr.code) + '), ' +
                            this._MONTHS_ROMAN[m] + ': ' + num + '">';
                        html += '<span class="ppr-tc-val">' + num + '</span>';
                        html += '</div>';
                    } else {
                        // Нулевой месяц — подпись «0» у основания (Task 473)
                        html += '<span class="ppr-tc-val-zero">0</span>';
                    }
                    html += '</div>';
                }
                html += '</div>';
                html += '</div>';
            }
            html += '</div>';

            html += '</div>'; // .ppr-tc-card
            return html;
        },

        // ============================================================
        // Task 485: КРУГОВЫЕ диаграммы (SVG) — вкладки «Клапана» и
        // «Регуляторы». Оформление — как у «Приборов»/«Блокировок»
        // (Task 483/484): белая «документная» карточка .ppr-tc-card,
        // палитра Excel — accent1-6 темы книги + их осветлённые +40%
        // (дальше цикл повторяется, как раскраска серий Excel).
        // Пирог: сектора от 12 часов ПО ЧАСОВОЙ стрелке (как Excel),
        // тонкие белые разделители; у секторов >= 5.5% — процентная
        // подпись снаружи (как dLbls; меньшие слишком плотно садятся
        // друг на друга на многокомпонентных пирогах — их данные
        // полностью в легенде; 5.5% = >= 20 град. = >= 33px дуги
        // между соседними подписями). Серия с count 0 — только строка
        // легенды (заявка: «…остальные как просто "Клапана" тоже
        // сколько»); единственный ненулевой сектор — <circle> (дуга
        // с совпавшими концами не рисуется).
        // ============================================================

        // Палитра Excel: accent1-6 + осветлённые +40% (бейджи 483)
        _PC_PALETTE: [
            '#4F81BD', '#C0504D', '#9BBB59', '#8064A2', '#4BACC6', '#F79646',
            '#8DB4E2', '#D99694', '#C3D69B', '#B1A0C7', '#92CDDC', '#FDC08A'
        ],

        // Процент: >= 10% — целым, меньше — одним знаком (Excel-стиль)
        _pcPct: function(part, total) {
            if (!total) return '0%';
            var v = part * 100 / total;
            return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + '%';
        },

        // Карточка с круговой диаграммой: title + SVG-пирог + легенда.
        // rows = [{name, count}] — порядок rows = порядок секторов и
        // строк легенды; count 0 — строка легенды без сектора.
        _renderPieCard: function(title, rows) {
            if (!rows || !rows.length) return '';
            var total = 0, i;
            for (i = 0; i < rows.length; i++) {
                var c0 = rows[i].count;
                if (typeof c0 === 'number' && c0 > 0) total += c0;
            }
            if (!total) return '';

            var PAL = this._PC_PALETTE;
            var html = '<div class="ppr-tc-card">';
            html += '<div class="pc-title">' + this._escHtml(title) + '</div>';
            html += '<div class="pc-body">';

            // ---------- SVG-пирог ----------
            var CX = 130, CY = 125, R = 82;
            var svg = '<svg class="pc-svg" viewBox="0 0 260 250" role="img" aria-label="' +
                this._escHtml(title) + '">';
            var nonzero = [];
            for (i = 0; i < rows.length; i++) {
                if (rows[i].count > 0) nonzero.push(rows[i]);
            }
            if (nonzero.length === 1) {
                // единственный сектор — сплошной круг
                svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R +
                    '" fill="' + PAL[0] + '" stroke="#ffffff" stroke-width="1">' +
                    '<title>' + this._escHtml(nonzero[0].name) + ': ' + nonzero[0].count +
                    ' (' + this._pcPct(nonzero[0].count, total) + ')</title></circle>';
            } else {
                var a0 = -Math.PI / 2; // 12 часов
                for (i = 0; i < rows.length; i++) {
                    var cnt = rows[i].count;
                    if (!cnt || cnt < 0) continue;
                    var frac = cnt / total;
                    var aStart = a0;
                    var a1 = a0 + frac * 2 * Math.PI;
                    var x0 = (CX + R * Math.cos(aStart)).toFixed(2);
                    var y0 = (CY + R * Math.sin(aStart)).toFixed(2);
                    var x1 = (CX + R * Math.cos(a1)).toFixed(2);
                    var y1 = (CY + R * Math.sin(a1)).toFixed(2);
                    var large = (frac > 0.5) ? 1 : 0;
                    svg += '<path d="M' + CX + ',' + CY + ' L' + x0 + ',' + y0 +
                        ' A' + R + ',' + R + ' 0 ' + large + ' 1 ' + x1 + ',' + y1 +
                        ' Z" fill="' + PAL[i % PAL.length] +
                        '" stroke="#ffffff" stroke-width="1">' +
                        '<title>' + this._escHtml(rows[i].name) + ': ' + cnt +
                        ' (' + this._pcPct(cnt, total) + ')</title></path>';
                    // процентная подпись снаружи у секторов >= 5.5%
                    if (frac >= 0.055) {
                        var mid = (aStart + a1) / 2;
                        var lr = R + 13;
                        var lx = (CX + lr * Math.cos(mid)).toFixed(1);
                        var ly = (CY + lr * Math.sin(mid)).toFixed(1);
                        var cosM = Math.cos(mid);
                        var anch = (cosM > 0.25) ? 'start'
                                 : ((cosM < -0.25) ? 'end' : 'middle');
                        svg += '<text class="pc-slice-lbl" x="' + lx + '" y="' + ly +
                            '" text-anchor="' + anch + '" dominant-baseline="middle">' +
                            this._pcPct(cnt, total) + '</text>';
                    }
                    a0 = a1;
                }
            }
            svg += '</svg>';
            html += svg;

            // ---------- ЛЕГЕНДА ----------
            html += '<div class="pc-legend">';
            for (i = 0; i < rows.length; i++) {
                var cnt = rows[i].count || 0;
                html += '<div class="pc-li" title="' + this._escHtml(rows[i].name) + ': ' + cnt + '">';
                html += '<span class="pc-swatch" style="background:' + PAL[i % PAL.length] + ';"></span>';
                html += '<span class="pc-name">' + this._escHtml(rows[i].name) + '</span>';
                html += '<span class="pc-cnt">' + cnt + '</span>';
                html += '<span class="pc-pct">' + this._pcPct(cnt, total) + '</span>';
                html += '</div>';
            }
            html += '</div>';

            html += '</div>'; // .pc-body
            html += '</div>'; // .ppr-tc-card
            return html;
        },

        // Счётчик по полю: [{name, count}] — по убыванию количества,
        // при равенстве — по алфавиту названий (стабильно)
        _countByField: function(items, field) {
            var map = {}, i;
            for (i = 0; i < items.length; i++) {
                var v = (items[i][field] || '').toString().trim();
                if (!v) continue;
                map[v] = (map[v] || 0) + 1;
            }
            var keys = Object.keys(map);
            keys.sort(function(a, b) {
                return (map[b] - map[a]) || (a < b ? -1 : (a > b ? 1 : 0));
            });
            var rows = [];
            for (i = 0; i < keys.length; i++) {
                rows.push({ name: keys[i], count: map[keys[i]] });
            }
            return rows;
        },

        // Поля листа «Клапана_app» (написания заголовков — как в
        // файле; «Устроиство» с «и» — написание листа «Регуляторы»)
        _V_TYPE_FIELD: 'Тип, пропускная характеристика',
        _V_ZAP_FIELD: 'Тип запорной части. Материал затвора/ корпуса',
        _V_DN_FIELD: 'DN (мм)',

        // Task 485: вкладка «Клапана» — три круговые диаграммы:
        //  1) ПО ТИПАМ (порядок проверки — «Клапана» (прочие) всегда
        //     последняя): Дисковые затворы — столбец «Тип запорной
        //     части…» содержит «Затвор дисковый» (заявка считает их
        //     ОТДЕЛЬНОЙ категорией по этому столбцу: у всех 28
        //     дисковых «Тип, пропускная характеристика» =
        //     «Запорно-рег.» — поэтому проверяются ПЕРВЫМИ, иначе
        //     категория «Регулирующие» вырезала бы их и они не
        //     считались бы отдельной строкой); Отсечные — «Тип…»
        //     содержит «Отс»; Регулирующие — содержит «Рег» или «рег»
        //     (регистронезависимо, как в заявке); прочие — «Клапана»
        //     (в текущем файле 0: каждая строка либо «Отс.», либо с
        //     «рег»; строка легенды выводится и при 0 — «тоже
        //     сколько»);
        //  2) ПО ДУ: значение «DN (мм)» как в файле («?»/пусто —
        //     «Ду не указан»); сортировка по количеству, при
        //     равенстве — по первому числу значения («Ду не указан»
        //     — последним);
        //  3) ФУТИРОВАННЫЕ: «футирован»/«футерован» в столбце
        //     запорной части (все — мембранные с фторопластом).
        _renderValvesPies: function(items) {
            var types = [
                { name: 'Отсечные', count: 0 },
                { name: 'Регулирующие', count: 0 },
                { name: 'Дисковые затворы', count: 0 },
                { name: 'Клапана', count: 0 }
            ];
            var dnMap = {};
            var fut = 0, plain = 0;
            var i;
            for (i = 0; i < items.length; i++) {
                var it = items[i];
                var tip = (it[this._V_TYPE_FIELD] || '').toString().toLowerCase();
                var zap = (it[this._V_ZAP_FIELD] || '').toString().toLowerCase();
                if (zap.indexOf('дисков') !== -1) types[2].count++;
                else if (tip.indexOf('отс') !== -1) types[0].count++;
                else if (tip.indexOf('рег') !== -1) types[1].count++;
                else types[3].count++;

                var dn = (it[this._V_DN_FIELD] || '').toString().trim();
                var dnKey = (!dn || dn === '?') ? 'Ду не указан' : ('Ду ' + dn);
                dnMap[dnKey] = (dnMap[dnKey] || 0) + 1;

                if (zap.indexOf('футирован') !== -1 || zap.indexOf('футерован') !== -1) fut++;
                else plain++;
            }

            var dnNum = function(k) {
                var m = k.match(/\d+/);
                return m ? parseInt(m[0], 10) : 1e9;
            };
            var dnKeys = Object.keys(dnMap);
            dnKeys.sort(function(a, b) {
                return (dnMap[b] - dnMap[a]) || (dnNum(a) - dnNum(b));
            });
            var dnRows = [];
            for (i = 0; i < dnKeys.length; i++) {
                dnRows.push({ name: dnKeys[i], count: dnMap[dnKeys[i]] });
            }

            return this._renderPieCard('Количество КЛАПАНОВ по типам', types) +
                this._renderPieCard('Количество КЛАПАНОВ по Ду', dnRows) +
                this._renderPieCard('Количество футированных КЛАПАНОВ', [
                    { name: 'Футированные', count: fut },
                    { name: 'Не футированные', count: plain }
                ]);
        },

        // Поля листа «Регуляторы_app» («Устроиство» — написание файла)
        _R_PROD_FIELD: 'Производство',
        _R_UST_FIELD: 'Устроиство регулятора или ручного управления',
        _R_PAR_FIELD: 'Параметр',

        // Task 485: унификация «Параметра» по РЕГУЛИРУЕМОЙ ВЕЛИЧИНЕ
        // (заявка: «температура, давление, уровень, расход,
        // концентрация, ручное управление, частота на частотных
        // преобразователях ЧП и так далее») — первое совпавшее
        // правило (регистронезависимо; опечатки листа учтены:
        // «Давыление» ~ давление, «Уровнень» ~ уровень):
        //   Температура  «температур…» / TIC
        //   Давление     «давлени…»/«давылен…»
        //   Уровень      «уровен…»/«уровн…»
        //   Расход       «расход…» / FIRC / «Дозировка…» (дозирование = расход)
        //   Концентрация «концентрац…»
        //   Частота (ЧП) «частот…» / «ЧП»
        //   Ручное упр.  «ручн…»
        //   Прочие       дискретные операции (подача/слив/отсекатели/
        //                обогрев/пульсация/подключение и т.п.)
        _REG_PARAM_RULES: [
            { name: 'Температура', rx: /температур|\btic\b/i },
            { name: 'Давление', rx: /давлени|давылен/i },
            { name: 'Уровень', rx: /уровен|уровн/i },
            { name: 'Расход', rx: /расход|\bfirc\b|дозировк/i },
            { name: 'Концентрация', rx: /концентрац/i },
            { name: 'Частота (ЧП)', rx: /частот|чп/i },
            { name: 'Ручное управление', rx: /ручн/i }
        ],

        _classifyRegParam: function(s) {
            var v = (s || '').toString();
            var rules = this._REG_PARAM_RULES;
            for (var i = 0; i < rules.length; i++) {
                if (rules[i].rx.test(v)) return rules[i].name;
            }
            return 'Прочие';
        },

        // Task 485: вкладка «Регуляторы» — три круговые диаграммы
        // (производства / устройства / параметры-величины). Порядок
        // секторов «Параметров» — порядок правил, «Прочие» — последним.
        _renderRegulatorsPies: function(items) {
            var prodRows = this._countByField(items, this._R_PROD_FIELD);
            var ustRows = this._countByField(items, this._R_UST_FIELD);

            var parMap = {};
            var i;
            for (i = 0; i < items.length; i++) {
                var cat = this._classifyRegParam(items[i][this._R_PAR_FIELD]);
                parMap[cat] = (parMap[cat] || 0) + 1;
            }
            var parRows = [];
            for (i = 0; i < this._REG_PARAM_RULES.length; i++) {
                var nm = this._REG_PARAM_RULES[i].name;
                if (parMap[nm]) parRows.push({ name: nm, count: parMap[nm] });
            }
            if (parMap['Прочие']) parRows.push({ name: 'Прочие', count: parMap['Прочие'] });

            return this._renderPieCard('Количество РЕГУЛЯТОРОВ по производствам', prodRows) +
                this._renderPieCard('Количество РЕГУЛЯТОРОВ по устройствам (регулятора или ручного управления)', ustRows) +
                this._renderPieCard('Количество РЕГУЛЯТОРОВ по параметрам (регулируемой величине)', parRows);
        },

        // HTML-экранирование
        _escHtml: function(str) {
            if (str === null || str === undefined) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        },

        // Инициализация кнопки входа (вызывается при загрузке КИП ИОС)
        initEntryButton: function() {
            var btn = document.getElementById('chartsEntryBtn');
            if (!btn) return;
            btn.onclick = function() { navigateTo('charts'); };
        },

        // Обновление подзаголовка кнопки
        updateEntrySublabel: function() {
            var btn = document.getElementById('chartsEntryBtn');
            if (!btn) return;
            var sub = btn.querySelector('.menu-btn-sublabel');
            if (!sub) return;
            // Показать общее количество записей во всех 4 разделах
            var total = 0;
            var sections = ['devices', 'lockouts', 'valves', 'regulators'];
            for (var i = 0; i < sections.length; i++) {
                if (this._cache[sections[i]]) {
                    total += this._cache[sections[i]].length;
                }
            }
            if (total > 0) {
                sub.textContent = total + ' записей КИП ИОС';
            }
        },

        // Открытие страницы (вызывается из navigateTo)
        onPageOpen: function() {
            this.switchTab(this._currentTab);
        }
    };

    // ---------- 5. Повторная фильтрация ролей ----------
    // Кнопка и страница инъектированы ПОСЛЕ первого _applyRoleToUI —
    // применяем правила доступа заново (видимость кнопки по роли).
    if (typeof KipAuth !== 'undefined' && KipAuth._applyRoleToUI) {
        try { KipAuth._applyRoleToUI(); } catch (e) {}
    }
})();
