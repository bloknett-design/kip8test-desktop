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
// ============================================================
(function () {
    'use strict';

    // ---------- 1. CSS ----------
    var css = "    /* ======================== \u0413\u0420\u0410\u0424\u0418\u041a\u0418 \u041a\u0418\u041f \u0418\u041e\u0421 ======================== */\n    .charts-tabs {\n        display: flex;\n        gap: 0;\n        border-bottom: 1px solid var(--border-color);\n        background: var(--card-bg);\n        position: sticky;\n        top: 56px;\n        z-index: 5;\n        overflow-x: auto;\n        -webkit-overflow-scrolling: touch;\n    }\n    .charts-tab {\n        flex: 1;\n        min-width: 0;\n        padding: 10px 6px;\n        border: none;\n        background: transparent;\n        color: var(--text-secondary);\n        font-size: 13px;\n        font-weight: 500;\n        cursor: pointer;\n        white-space: nowrap;\n        position: relative;\n        transition: color 0.2s;\n    }\n    .charts-tab::after {\n        content: '';\n        position: absolute;\n        left: 0; right: 0; bottom: 0;\n        height: 2px;\n        background: transparent;\n        border-radius: 1px;\n        transition: background 0.2s;\n    }\n    .charts-tab-active {\n        color: #3aa288;\n        font-weight: 600;\n    }\n    .charts-tab-active::after {\n        background: #3aa288;\n    }\n    .charts-content {\n        padding: 12px 14px 24px;\n    }\n    .charts-loading {\n        text-align: center;\n        padding: 40px 20px;\n        color: var(--text-secondary);\n        font-size: 13px;\n    }\n    /* \u041a\u0430\u0440\u0442\u043e\u0447\u043a\u0430 \u0433\u0440\u0430\u0444\u0438\u043a\u0430 */\n    .chart-card {\n        background: var(--card-bg);\n        border: 1px solid var(--card-border);\n        border-radius: 10px;\n        margin-bottom: 14px;\n        overflow: hidden;\n    }\n    .chart-card-title {\n        padding: 10px 14px 6px;\n        font-size: 13px;\n        font-weight: 600;\n        color: var(--text-primary);\n    }\n    .chart-card-body {\n        padding: 6px 14px 12px;\n    }\n    /* \u0413\u043e\u0440\u0438\u0437\u043e\u043d\u0442\u0430\u043b\u044c\u043d\u0430\u044f \u0441\u0442\u043e\u043b\u0431\u0447\u0430\u0442\u0430\u044f \u0434\u0438\u0430\u0433\u0440\u0430\u043c\u043c\u0430 (CSS-\u0431\u0430\u0440\u044b) */\n    .chart-bar-row {\n        display: flex;\n        align-items: center;\n        margin-bottom: 6px;\n    }\n    .chart-bar-label {\n        flex: 0 0 auto;\n        max-width: 45%;\n        font-size: 11px;\n        color: var(--text-secondary);\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n        padding-right: 8px;\n    }\n    .chart-bar-track {\n        flex: 1;\n        height: 16px;\n        background: rgba(255,255,255,0.06);\n        border-radius: 3px;\n        overflow: hidden;\n        position: relative;\n    }\n    .chart-bar-fill {\n        height: 100%;\n        border-radius: 3px;\n        transition: width 0.4s ease;\n        min-width: 2px;\n    }\n    .chart-bar-value {\n        flex: 0 0 auto;\n        width: 36px;\n        text-align: right;\n        font-size: 11px;\n        font-weight: 600;\n        color: var(--text-primary);\n        padding-left: 6px;\n    }\n    /* \u0421\u0432\u043e\u0434\u043d\u0430\u044f \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0430 \u0441\u043e \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u043e\u0439 */\n    .chart-stats-grid {\n        display: grid;\n        grid-template-columns: 1fr 1fr;\n        gap: 8px;\n        margin-bottom: 14px;\n    }\n    .chart-stat-card {\n        background: var(--card-bg);\n        border: 1px solid var(--card-border);\n        border-radius: 8px;\n        padding: 10px 12px;\n        text-align: center;\n    }\n    .chart-stat-value {\n        font-size: 22px;\n        font-weight: 700;\n        color: #3aa288;\n        line-height: 1.2;\n    }\n    .chart-stat-label {\n        font-size: 11px;\n        color: var(--text-secondary);\n        margin-top: 2px;\n    }\n    /* \u0421\u0432\u0435\u0442\u043b\u0430\u044f \u0442\u0435\u043c\u0430 */\n    [data-theme=\"light\"] .charts-tab-active { color: #2e8a72; }\n    [data-theme=\"light\"] .charts-tab-active::after { background: #2e8a72; }\n    [data-theme=\"light\"] .chart-bar-track { background: rgba(0,0,0,0.06); }\n    [data-theme=\"light\"] .chart-stat-card { background: #fafaf8; border-color: rgba(0,0,0,0.08); }\n    [data-theme=\"light\"] .chart-stat-value { color: #2e8a72; }\n    [data-theme=\"light\"] .chart-card { background: #fafaf8; border-color: rgba(0,0,0,0.08); }";
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

                // Конфигурация разделов
        _SECTIONS: {
            devices: {
                jsonFile: 'data/devices.json',
                arrayKey: 'devices',
                groupField: 'Наименование',
                prodField: 'Место установки',
                typeField: 'Тип',
                label: 'Приборы',
                color: '#4a8fc7',
                colorLight: 'rgba(74,143,199,0.35)'
            },
            lockouts: {
                jsonFile: 'data/lockouts.json',
                arrayKey: 'lockouts',
                groupField: 'Параметр',
                prodField: 'Производство',
                label: 'Блокировки',
                color: '#b85a7a',
                colorLight: 'rgba(184,90,122,0.35)'
            },
            valves: {
                jsonFile: 'data/valves.json',
                arrayKey: 'valves',
                groupField: 'Тип, пропускная характеристика',
                prodField: 'Производство',
                label: 'Клапана',
                color: '#4a8a8c',
                colorLight: 'rgba(74,138,140,0.35)'
            },
            regulators: {
                jsonFile: 'data/regulators.json',
                arrayKey: 'regulators',
                groupField: 'Параметр',
                prodField: 'Производство',
                label: 'Регуляторы',
                color: '#7e5ab8',
                colorLight: 'rgba(126,90,184,0.35)'
            }
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

        // Основной рендер контента
        _renderContent: function(tab, items) {
            var container = document.getElementById('chartsContent');
            if (!container) return;

            var sec = this._SECTIONS[tab];
            var html = '';

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
                    html += this._renderDevicesPPR(ppr,
                        tab === 'devices' ? 'ПРИБОРОВ' : 'БЛОКИРОВОК');
                } else {
                    // ppr_chart отсутствует (устаревший кэш данных или
                    // синк с gid= одного листа) — понятное сообщение
                    html += '<div class="chart-card"><div class="ppr-tc-empty-note">' +
                        'Данные графика ППР по ' + (tab === 'devices' ? 'приборам' : 'блокировкам') + ' появятся после обновления перечня ' +
                        'КИП ИОС (синхронизация с таблицей). Обновите страницу или ' +
                        'повторите позже.</div></div>';
                }
                container.innerHTML = html;
                return;
            }

            // 1. Сводная статистика
            var totalItems = items.length;
            var groupField = sec.groupField;
            var prodField = sec.prodField;

            // Группировка по groupField
            var groups = {};
            var prods = {};
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var gVal = (item[groupField] || '').toString().trim();
                if (gVal) groups[gVal] = (groups[gVal] || 0) + 1;
                var pVal = (item[prodField] || '').toString().trim();
                if (pVal) prods[pVal] = (prods[pVal] || 0) + 1;
            }
            var groupCount = Object.keys(groups).length;
            var prodCount = Object.keys(prods).length;

            // Для приборов — ещё по типу
            var typeCount = 0;
            if (sec.typeField) {
                var types = {};
                for (var i = 0; i < items.length; i++) {
                    var tVal = (items[i][sec.typeField] || '').toString().trim();
                    if (tVal) types[tVal] = (types[tVal] || 0) + 1;
                }
                typeCount = Object.keys(types).length;
            }

            // Сводная сетка
            html += '<div class="chart-stats-grid">';
            html += '<div class="chart-stat-card"><div class="chart-stat-value">' + totalItems + '</div><div class="chart-stat-label">Всего ' + sec.label.toLowerCase() + '</div></div>';
            html += '<div class="chart-stat-card"><div class="chart-stat-value">' + prodCount + '</div><div class="chart-stat-label">Производств</div></div>';
            html += '<div class="chart-stat-card"><div class="chart-stat-value">' + groupCount + '</div><div class="chart-stat-label">Уникальных ' + this._groupLabel(tab) + '</div></div>';
            if (sec.typeField) {
                html += '<div class="chart-stat-card"><div class="chart-stat-value">' + typeCount + '</div><div class="chart-stat-label">Уникальных типов</div></div>';
            } else {
                html += '<div class="chart-stat-card"><div class="chart-stat-value">' + this._avgPerProd(items, prodField) + '</div><div class="chart-stat-label">Среднее на пр-во</div></div>';
            }
            html += '</div>';

            // 2. График: Топ-10 по groupField
            var sortedGroups = Object.keys(groups).map(function(k) { return {name: k, count: groups[k]}; });
            sortedGroups.sort(function(a, b) { return b.count - a.count; });
            html += this._renderBarChart(
                'Топ-10 по ' + this._groupLabel(tab),
                sortedGroups.slice(0, 10),
                sec.color
            );

            // 3. График: Топ-10 производств
            var sortedProds = Object.keys(prods).map(function(k) { return {name: k, count: prods[k]}; });
            sortedProds.sort(function(a, b) { return b.count - a.count; });
            html += this._renderBarChart(
                'Топ-10 производств',
                sortedProds.slice(0, 10),
                sec.color
            );

            // 4. Для приборов — ещё и по типу
            if (sec.typeField) {
                var types = {};
                for (var i = 0; i < items.length; i++) {
                    var tVal = (items[i][sec.typeField] || '').toString().trim();
                    if (tVal) types[tVal] = (types[tVal] || 0) + 1;
                }
                var sortedTypes = Object.keys(types).map(function(k) { return {name: k, count: types[k]}; });
                sortedTypes.sort(function(a, b) { return b.count - a.count; });
                html += this._renderBarChart(
                    'Топ-10 типов приборов',
                    sortedTypes.slice(0, 10),
                    sec.color
                );
            }

            container.innerHTML = html;
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

            var html = '<div class="chart-card ppr-tc-card">';

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

        // Название группировки для заголовка
        _groupLabel: function(tab) {
            switch (tab) {
                case 'devices': return 'наименований';
                case 'lockouts': return 'параметров';
                case 'valves': return 'типов клапанов';
                case 'regulators': return 'параметров';
                default: return 'групп';
            }
        },

        // Среднее количество на производство
        _avgPerProd: function(items, prodField) {
            var prods = {};
            for (var i = 0; i < items.length; i++) {
                var p = (items[i][prodField] || '').toString().trim();
                if (p) prods[p] = (prods[p] || 0) + 1;
            }
            var keys = Object.keys(prods);
            if (keys.length === 0) return '0';
            var sum = 0;
            for (var i = 0; i < keys.length; i++) sum += prods[keys[i]];
            return (sum / keys.length).toFixed(1);
        },

        // Рендер горизонтальной столбчатой диаграммы
        _renderBarChart: function(title, data, color) {
            if (!data || data.length === 0) return '';
            var maxVal = data[0].count;
            if (maxVal === 0) maxVal = 1;

            var html = '<div class="chart-card">';
            html += '<div class="chart-card-title">' + this._escHtml(title) + '</div>';
            html += '<div class="chart-card-body">';

            for (var i = 0; i < data.length; i++) {
                var d = data[i];
                var pct = Math.round((d.count / maxVal) * 100);
                html += '<div class="chart-bar-row">';
                html += '<div class="chart-bar-label" title="' + this._escHtml(d.name) + '">' + this._escHtml(d.name) + '</div>';
                html += '<div class="chart-bar-track"><div class="chart-bar-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>';
                html += '<div class="chart-bar-value">' + d.count + '</div>';
                html += '</div>';
            }

            html += '</div></div>';
            return html;
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
