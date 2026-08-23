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
// ============================================================
(function () {
    'use strict';

    // ---------- 1. CSS ----------
    var css = "    /* ======================== \u0413\u0420\u0410\u0424\u0418\u041a\u0418 \u041a\u0418\u041f \u0418\u041e\u0421 ======================== */\n    .charts-tabs {\n        display: flex;\n        gap: 0;\n        border-bottom: 1px solid var(--border-color);\n        background: var(--card-bg);\n        position: sticky;\n        top: 56px;\n        z-index: 5;\n        overflow-x: auto;\n        -webkit-overflow-scrolling: touch;\n    }\n    .charts-tab {\n        flex: 1;\n        min-width: 0;\n        padding: 10px 6px;\n        border: none;\n        background: transparent;\n        color: var(--text-secondary);\n        font-size: 13px;\n        font-weight: 500;\n        cursor: pointer;\n        white-space: nowrap;\n        position: relative;\n        transition: color 0.2s;\n    }\n    .charts-tab::after {\n        content: '';\n        position: absolute;\n        left: 0; right: 0; bottom: 0;\n        height: 2px;\n        background: transparent;\n        border-radius: 1px;\n        transition: background 0.2s;\n    }\n    .charts-tab-active {\n        color: #3aa288;\n        font-weight: 600;\n    }\n    .charts-tab-active::after {\n        background: #3aa288;\n    }\n    .charts-content {\n        padding: 12px 14px 24px;\n    }\n    .charts-loading {\n        text-align: center;\n        padding: 40px 20px;\n        color: var(--text-secondary);\n        font-size: 13px;\n    }\n    /* \u041a\u0430\u0440\u0442\u043e\u0447\u043a\u0430 \u0433\u0440\u0430\u0444\u0438\u043a\u0430 */\n    .chart-card {\n        background: var(--card-bg);\n        border: 1px solid var(--card-border);\n        border-radius: 10px;\n        margin-bottom: 14px;\n        overflow: hidden;\n    }\n    .chart-card-title {\n        padding: 10px 14px 6px;\n        font-size: 13px;\n        font-weight: 600;\n        color: var(--text-primary);\n    }\n    .chart-card-body {\n        padding: 6px 14px 12px;\n    }\n    /* \u0413\u043e\u0440\u0438\u0437\u043e\u043d\u0442\u0430\u043b\u044c\u043d\u0430\u044f \u0441\u0442\u043e\u043b\u0431\u0447\u0430\u0442\u0430\u044f \u0434\u0438\u0430\u0433\u0440\u0430\u043c\u043c\u0430 (CSS-\u0431\u0430\u0440\u044b) */\n    .chart-bar-row {\n        display: flex;\n        align-items: center;\n        margin-bottom: 6px;\n    }\n    .chart-bar-label {\n        flex: 0 0 auto;\n        max-width: 45%;\n        font-size: 11px;\n        color: var(--text-secondary);\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n        padding-right: 8px;\n    }\n    .chart-bar-track {\n        flex: 1;\n        height: 16px;\n        background: rgba(255,255,255,0.06);\n        border-radius: 3px;\n        overflow: hidden;\n        position: relative;\n    }\n    .chart-bar-fill {\n        height: 100%;\n        border-radius: 3px;\n        transition: width 0.4s ease;\n        min-width: 2px;\n    }\n    .chart-bar-value {\n        flex: 0 0 auto;\n        width: 36px;\n        text-align: right;\n        font-size: 11px;\n        font-weight: 600;\n        color: var(--text-primary);\n        padding-left: 6px;\n    }\n    /* \u0421\u0432\u043e\u0434\u043d\u0430\u044f \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0430 \u0441\u043e \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u043e\u0439 */\n    .chart-stats-grid {\n        display: grid;\n        grid-template-columns: 1fr 1fr;\n        gap: 8px;\n        margin-bottom: 14px;\n    }\n    .chart-stat-card {\n        background: var(--card-bg);\n        border: 1px solid var(--card-border);\n        border-radius: 8px;\n        padding: 10px 12px;\n        text-align: center;\n    }\n    .chart-stat-value {\n        font-size: 22px;\n        font-weight: 700;\n        color: #3aa288;\n        line-height: 1.2;\n    }\n    .chart-stat-label {\n        font-size: 11px;\n        color: var(--text-secondary);\n        margin-top: 2px;\n    }\n    /* \u0421\u0432\u0435\u0442\u043b\u0430\u044f \u0442\u0435\u043c\u0430 */\n    [data-theme=\"light\"] .charts-tab-active { color: #2e8a72; }\n    [data-theme=\"light\"] .charts-tab-active::after { background: #2e8a72; }\n    [data-theme=\"light\"] .chart-bar-track { background: rgba(0,0,0,0.06); }\n    [data-theme=\"light\"] .chart-stat-card { background: #fafaf8; border-color: rgba(0,0,0,0.08); }\n    [data-theme=\"light\"] .chart-stat-value { color: #2e8a72; }\n    [data-theme=\"light\"] .chart-card { background: #fafaf8; border-color: rgba(0,0,0,0.08); }\n\n    /* ======================== \u0413\u0420\u0410\u0424\u0418\u041a \u041f\u041f\u0420 \u2014 \u0432\u0435\u0440\u0442\u0438\u043a\u0430\u043b\u044c\u043d\u0430\u044f \u0433\u0438\u0441\u0442\u043e\u0433\u0440\u0430\u043c\u043c\u0430 ======================== */\n    .ppr-chart-card {\n        margin-bottom: 16px;\n    }\n    .ppr-chart-header {\n        padding: 12px 14px 8px;\n    }\n    .ppr-chart-title {\n        font-size: 14px;\n        font-weight: 600;\n        color: var(--text-primary);\n        margin-bottom: 8px;\n    }\n    .ppr-legend {\n        display: flex;\n        flex-wrap: wrap;\n        gap: 10px;\n    }\n    .ppr-legend-item {\n        display: flex;\n        align-items: center;\n        gap: 4px;\n    }\n    .ppr-legend-dot {\n        width: 10px;\n        height: 10px;\n        border-radius: 2px;\n        flex-shrink: 0;\n    }\n    .ppr-legend-code {\n        font-size: 11px;\n        font-weight: 700;\n        color: var(--text-primary);\n    }\n    .ppr-legend-name {\n        font-size: 11px;\n        color: var(--text-secondary);\n    }\n    .ppr-chart-body {\n        padding: 4px 14px 12px;\n    }\n    .ppr-chart-area {\n        display: flex;\n        position: relative;\n    }\n    .ppr-y-axis {\n        display: flex;\n        flex-direction: column;\n        justify-content: space-between;\n        padding-right: 6px;\n        flex-shrink: 0;\n        width: 30px;\n    }\n    .ppr-y-label {\n        font-size: 9px;\n        color: var(--text-secondary);\n        text-align: right;\n        line-height: 1;\n    }\n    .ppr-chart-grid {\n        flex: 1;\n        display: flex;\n        position: relative;\n        height: 180px;\n        border-left: 1px solid var(--border-color);\n        border-bottom: 1px solid var(--border-color);\n    }\n    .ppr-grid-line {\n        position: absolute;\n        left: 0;\n        right: 0;\n        height: 1px;\n        background: var(--border-color);\n        opacity: 0.5;\n    }\n    .ppr-month-group {\n        flex: 1;\n        display: flex;\n        flex-direction: column;\n        justify-content: flex-end;\n        align-items: center;\n        position: relative;\n        min-width: 0;\n    }\n    .ppr-bars-row {\n        display: flex;\n        gap: 2px;\n        width: 100%;\n        justify-content: center;\n        align-items: flex-end;\n        flex: 1;\n        padding: 0 1px;\n    }\n    .ppr-bar-cell {\n        flex: 1;\n        display: flex;\n        align-items: flex-end;\n        justify-content: center;\n        max-width: 14px;\n    }\n    .ppr-bar {\n        width: 100%;\n        border-radius: 2px 2px 0 0;\n        position: relative;\n        min-height: 2px;\n        transition: height 0.3s ease;\n    }\n    .ppr-bar-val {\n        position: absolute;\n        top: -14px;\n        left: 50%;\n        transform: translateX(-50%);\n        font-size: 8px;\n        font-weight: 600;\n        color: var(--text-primary);\n        white-space: nowrap;\n        pointer-events: none;\n    }\n    .ppr-month-label {\n        font-size: 9px;\n        font-weight: 500;\n        color: var(--text-secondary);\n        padding-top: 4px;\n        text-align: center;\n        flex-shrink: 0;\n    }\n    /* \u0421\u0442\u0440\u043e\u043a\u0430 \u0438\u0442\u043e\u0433\u043e\u0432 \u043f\u043e\u0434 \u0433\u0440\u0430\u0444\u0438\u043a\u043e\u043c \u041f\u041f\u0420 */\n    .ppr-totals-row {\n        display: flex;\n        align-items: center;\n        gap: 12px;\n        padding: 8px 0 0;\n        border-top: 1px solid var(--border-color);\n        margin-top: 6px;\n        flex-wrap: wrap;\n    }\n    .ppr-totals-label {\n        font-size: 11px;\n        font-weight: 700;\n        color: var(--text-primary);\n        flex-shrink: 0;\n    }\n    .ppr-totals-item {\n        display: flex;\n        align-items: center;\n        gap: 4px;\n    }\n    .ppr-totals-value {\n        font-size: 12px;\n        font-weight: 700;\n        color: var(--text-primary);\n    }\n    [data-theme=\"light\"] .ppr-totals-row {\n        border-top-color: rgba(0,0,0,0.1);\n    }\n    /* \u0421\u0432\u0435\u0442\u043b\u0430\u044f \u0442\u0435\u043c\u0430 \u0434\u043b\u044f \u041f\u041f\u0420 */\n    [data-theme=\"light\"] .ppr-chart-grid {\n        border-left-color: rgba(0,0,0,0.12);\n        border-bottom-color: rgba(0,0,0,0.12);\n    }\n    [data-theme=\"light\"] .ppr-grid-line {\n        background: rgba(0,0,0,0.08);\n    }\n";
    var styleEl = document.createElement('style');
    styleEl.id = 'chartsDesktopCss';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

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

        // Данные ППР на текущий год (2026) — Приборы
        // 3 серии: Калибровка (K), Поверка (П), Тех.обслуж. (ТО)
        // Источник: «Перечень КИП ИОС рабочий.xlsx» → лист «Диаграмма приборов»
        // Формулы: COUNTIF(Приборы[<месяц>], <код вида обслуживания>)
        _PPR_DEVICES: {
            title: 'Количество приборов по графику ППР по месяцам на 2026 год',
            series: [
                { name: 'Калибровка', code: 'К', color: '#4a90d9', values: [13, 33, 30, 45, 24, 28, 33, 34, 48, 16, 34, 35] },
                { name: 'Поверка', code: 'П', color: '#e07040', values: [12, 12, 4, 15, 0, 4, 6, 10, 4, 6, 1, 12] },
                { name: 'Тех. обслуж.', code: 'ТО', color: '#5ab870', values: [353, 354, 500, 320, 374, 496, 333, 353, 481, 358, 362, 485] }
            ]
        },

        // Данные ППР на текущий год (2026) — Блокировки (Схемы)
        // 2 серии: Кан.ремонт (Кр), Тех.обслуж. (ТО)
        _PPR_LOCKOUTS: {
            title: 'График ППР — Схемы на 2026 год',
            series: [
                { name: 'Кан. ремонт', code: 'Кр', color: '#4a90d9', values: [58, 49, 26, 31, 13, 38, 33, 34, 74, 23, 49, 98] },
                { name: 'Тех. обслуж.', code: 'ТО', color: '#5ab870', values: [87, 96, 210, 114, 132, 198, 112, 111, 162, 122, 96, 138] }
            ]
        },

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

            // Для вкладки Приборы — диаграмма ППР не зависит от JSON-данных
            if (tab === 'devices') {
                this._renderContent(tab, []);
                return;
            }

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

            // Для вкладки Приборы — только диаграмма ППР (как в Excel)
            if (tab === 'devices') {
                html += this._renderPPRChart(this._PPR_DEVICES);
                container.innerHTML = html;
                return;
            }

            // 0. График ППР (если есть для данного раздела)
            if (tab === 'lockouts') {
                html += this._renderPPRChart(this._PPR_LOCKOUTS);
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
        // Рендер графика ППР — группированная вертикальная гистограмма
        // (как в Excel: clustered column chart с легендой и итогами)
        // ============================================================
        _renderPPRChart: function(pprData) {
            var series = pprData.series;
            var numSeries = series.length;
            var numMonths = 12;

            // Найти максимальное значение для масштаба оси Y
            var maxVal = 0;
            for (var s = 0; s < numSeries; s++) {
                for (var m = 0; m < numMonths; m++) {
                    if (series[s].values[m] > maxVal) maxVal = series[s].values[m];
                }
            }
            if (maxVal === 0) maxVal = 1;

            // Округлить maxVal вверх до красивого числа
            var niceMax = this._niceMax(maxVal);

            // Ось Y: 5 делений
            var ySteps = 5;
            var yStepVal = niceMax / ySteps;

            var html = '<div class="chart-card ppr-chart-card">';
            html += '<div class="ppr-chart-header">';
            html += '<div class="ppr-chart-title">' + this._escHtml(pprData.title) + '</div>';
            // Легенда
            html += '<div class="ppr-legend">';
            for (var s = 0; s < numSeries; s++) {
                html += '<div class="ppr-legend-item">';
                html += '<span class="ppr-legend-dot" style="background:' + series[s].color + ';"></span>';
                html += '<span class="ppr-legend-code">' + this._escHtml(series[s].code) + '</span>';
                html += '<span class="ppr-legend-name">' + this._escHtml(series[s].name) + '</span>';
                html += '</div>';
            }
            html += '</div>';
            html += '</div>';

            // Тело графика
            html += '<div class="ppr-chart-body">';

            // Оси + область графика
            html += '<div class="ppr-chart-area">';

            // Ось Y (метки слева)
            html += '<div class="ppr-y-axis">';
            for (var i = ySteps; i >= 0; i--) {
                var yVal = Math.round(yStepVal * i);
                html += '<div class="ppr-y-label">' + yVal + '</div>';
            }
            html += '</div>';

            // Сетка + столбцы
            html += '<div class="ppr-chart-grid">';

            // Горизонтальные линии сетки
            for (var i = 0; i <= ySteps; i++) {
                var bottomPct = (i / ySteps) * 100;
                html += '<div class="ppr-grid-line" style="bottom:' + bottomPct + '%;"></div>';
            }

            // Группы столбцов по месяцам
            for (var m = 0; m < numMonths; m++) {
                html += '<div class="ppr-month-group">';

                // Столбцы серий
                html += '<div class="ppr-bars-row">';
                for (var s = 0; s < numSeries; s++) {
                    var val = series[s].values[m];
                    var heightPct = (val / niceMax) * 100;
                    html += '<div class="ppr-bar-cell">';
                    if (val > 0) {
                        html += '<div class="ppr-bar" style="height:' + heightPct + '%;background:' + series[s].color + ';" title="' + this._escHtml(series[s].name) + ': ' + val + '">';
                        // Значение над столбцом (показываем если достаточно высокий)
                        if (heightPct > 8) {
                            html += '<span class="ppr-bar-val">' + val + '</span>';
                        }
                        html += '</div>';
                    }
                    html += '</div>';
                }
                html += '</div>';

                // Метка месяца
                html += '<div class="ppr-month-label">' + this._MONTHS_ROMAN[m] + '</div>';
                html += '</div>';
            }

            html += '</div>'; // .ppr-chart-grid
            html += '</div>'; // .ppr-chart-area

            // Строка итогов (сумма по каждой серии)
            html += '<div class="ppr-totals-row">';
            html += '<div class="ppr-totals-label">Итого:</div>';
            for (var s = 0; s < numSeries; s++) {
                var total = 0;
                for (var m = 0; m < numMonths; m++) total += series[s].values[m];
                html += '<div class="ppr-totals-item">';
                html += '<span class="ppr-legend-dot" style="background:' + series[s].color + ';"></span>';
                html += '<span class="ppr-legend-code">' + this._escHtml(series[s].code) + '</span>';
                html += '<span class="ppr-totals-value">' + total + '</span>';
                html += '</div>';
            }
            html += '</div>';

            html += '</div>'; // .ppr-chart-body
            html += '</div>'; // .chart-card

            return html;
        },

        // Красивое округление максимума для оси Y
        _niceMax: function(val) {
            if (val <= 0) return 10;
            var mag = Math.pow(10, Math.floor(Math.log10(val)));
            var norm = val / mag;
            var nice;
            if (norm <= 1) nice = 1;
            else if (norm <= 2) nice = 2;
            else if (norm <= 5) nice = 5;
            else nice = 10;
            return nice * mag;
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
