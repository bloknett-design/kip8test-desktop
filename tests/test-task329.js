// tests/test-task329.js
// Task 329 — ИТОГИ УЧЁТА: заявка пользователя:
//   «В шторке итогов учёта убери кнопку "Ещё", на внутренней стороне
//    левого края шторки по середине размести кнопку-значок со стрелкой
//    шеврона и сделай на нём функционал кнопки "Ещё", а по левому краю
//    шторки сделай небольшой декоративный бортик. Теперь шторка итогов
//    учёта должна выдвигаться ровно по размеру столбцов таблицы,
//    поэтому ширину столбцов сделай уже, по размеру их заглавий в две
//    строки. Данные столбца переработки показывай не в часах а в днях.
//    В столбце сотрудников сделай фон зебру, как в шторке итогов
//    учёта.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   HTML: #wsTtMore из шапки УДАЛЁН; в шторке ДО панели — бортик
//     .ws-tt-edge и кнопка-значок #wsTtChv (svg-шеврон, onclick
//     toggleTotalsExtra, hidden по умолчанию, aria-pressed/aria-label);
//     шапка .ws-tt-head — только ⚠/«Обновить».
//   CSS: .ws-tt-edge — 5px стальной bevel по левому краю (обе темы);
//     .ws-tt-chv — absolute у левого края, top 50% (середина), z 6,
//     активная — синий тинт + rotate(180deg) шеврона, [hidden];
//     шторка — БЕЗ фиксированной ширины 50% и CSS-маржи -50% (ширину
//     ставит JS _fitTtDrawer по таблице, парковка/анимация маржи —
//     JS в px), кап max-width 60%; месячная таблица (десктоп) —
//     width: auto + ЯВНЫЕ узкие ширины th.ws-tt-c-* (по заголовкам в
//     2 строки), годовая — max-content; ЗЕБРА колонки сотрудников
//     шахматки — как строки шторки (тёмная 9% / светлая 7%, включая
//     gridwide-режим; hover — сплошной фон).
//   JS/VM: _fitTtDrawer (ширина = таблица, мобайл — сброс инлайна,
//     пусто — 240); toggleTotals — парковка −ширина → reflow →
//     маржа 0 (открытие) и −ширина (закрытие); _ttCloseCleanup
//     прячет панель ПОСЛЕ анимации; _renderTotalsMonth — классы
//     ширин ws-tt-c-*, ПЕРЕРАБОТКА В ДНЯХ (overDays), часы — в
//     тултипе; _renderTotalsYearTable — сумма дней; min-width только
//     на мобайле; пересечение брейкпоинта — сброс/перезамер.
//   SW: kipia-test-v751.
//
// Запуск: через tests/run-all.js (require './test-task329.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_CLIENT = INDEX_SRC;

function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

function methodFn(src, name) {
    const txt = methodText(src, name);
    assertTrue(txt.length > 0, 'метод найден: ' + name);
    const obj = new Function('return ({' + txt + '\n});')();
    return obj[name];
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// ============================================================
// 1. HTML: шеврон на левом краю, бортик, шапка без «Ещё»
// ============================================================
describe('Task 329 — HTML: левый край шторки', () => {

    test('HTML: кнопка «Ещё» из шапки УДАЛЕНА, значок-шеврон на краю', () => {
        const iDrawer = INDEX_SRC.indexOf('id="wsTotalsDrawer"');
        assertTrue(iDrawer !== -1, 'шторка есть');
        const chunk = INDEX_SRC.slice(iDrawer, iDrawer + 4000);
        // «Ещё» (#wsTtMore) больше нет нигде
        assertFalse(INDEX_SRC.indexOf('id="wsTtMore"') !== -1,
            'кнопка #wsTtMore удалена из разметки (заявка)');
        // шеврон — ДО панели: по внутренней стороне левого края
        const iChv = chunk.indexOf('id="wsTtChv"');
        const iPanel = chunk.indexOf('id="wsTotalsPanel"');
        assertTrue(iChv !== -1, 'значок-шеврон #wsTtChv есть');
        assertTrue(iPanel !== -1 && iChv < iPanel,
            'шеврон до панели — на левом краю, не в шапке');
        const btn = chunk.slice(iChv, chunk.indexOf('</button>', iChv));
        assertTrue(btn.indexOf('toggleTotalsExtra()') !== -1,
            'функционал «Ещё»: onclick → toggleTotalsExtra');
        assertTrue(/\shidden\b/.test(btn), 'скрыт по умолчанию');
        assertTrue(btn.indexOf('<svg') !== -1, 'иконка — svg-стрелка');
        assertTrue(btn.indexOf('aria-pressed') !== -1, 'aria-pressed (состояние)');
        assertTrue(btn.indexOf('aria-label') !== -1, 'aria-label (подпись)');
        // в шапке — только ⌠ (Task 332: кнопка «Обновить» удалена)
        const iHead = chunk.indexOf('class="ws-tt-head"');
        const headChunk = chunk.slice(iHead, chunk.indexOf('</div>', iHead) + 6);
        assertTrue(headChunk.indexOf('id="wsTtWarn"') !== -1, '⌠ в шапке');
        assertFalse(headChunk.indexOf('id="wsTtRefresh"') !== -1,
            '«Обновить» из шапки удалён (Task 332)');
        assertTrue(headChunk.indexOf('wsTtChv') === -1, 'шеврона в шапке нет');
    });

    test('HTML: декоративный БОРТИК .ws-tt-edge по левому краю', () => {
        const iDrawer = INDEX_SRC.indexOf('id="wsTotalsDrawer"');
        const chunk = INDEX_SRC.slice(iDrawer, iDrawer + 4000);
        const iEdge = chunk.indexOf('class="ws-tt-edge"');
        assertTrue(iEdge !== -1, 'бортик .ws-tt-edge есть');
        assertTrue(iEdge < chunk.indexOf('id="wsTotalsPanel"'),
            'бортик на левом краю (до панели)');
        const edge = chunk.slice(iEdge, chunk.indexOf('>', iEdge));
        assertTrue(edge.indexOf('aria-hidden') !== -1, 'декоративный (aria-hidden)');
    });
});

// ============================================================
// 2. CSS: бортик, шеврон, геометрия шторки, узкие столбцы, зебра
// ============================================================
describe('Task 329 — CSS: левый край, ширина по столбцам, зебра', () => {

    test('CSS: .ws-tt-edge — ПОЛОСА 2px как разделитель групп сетки (Task 331)', () => {
        const m = INDEX_SRC.match(/\.ws-tt-edge\s*\{[^}]*\}/);
        assertTrue(!!m, 'правило .ws-tt-edge');
        // Task 331 (заявка: «левый бордюрчик — полосой, как между
        // сменными и дневными сотрудниками в шахматке»): 2px сплошная
        // #4a8fc7 / светлая #6e8ba4 (прежде стальной bevel 5px)
        assertTrue(!!m && m[0].indexOf('width: 2px') !== -1,
            'тонкая ПОЛОСА: 2px (как tr.ws-group-first сетки)');
        assertTrue(!!m && /left:\s*0/.test(m[0]) && /top:\s*0/.test(m[0]) && /bottom:\s*0/.test(m[0]),
            'во всю высоту левого края');
        assertTrue(!!m && m[0].indexOf('#4a8fc7') !== -1,
            'цвет разделителя групп сетки (тёмная)');
        assertTrue(!!m && m[0].indexOf('pointer-events: none') !== -1,
            'мышь не перехватывает (декоративный)');
        const l = INDEX_SRC.match(/\[data-theme="light"\] \.ws-tt-edge\s*\{[^}]*\}/);
        assertTrue(!!l && l[0].indexOf('#6e8ba4') !== -1,
            'светлая тема — как разделитель сетки');
    });

    test('CSS: .ws-tt-chv — у левого края, по середине, активная', () => {
        const m = INDEX_SRC.match(/\.ws-tt-chv\s*\{[^}]*\}/);
        assertTrue(!!m, 'правило .ws-tt-chv');
        assertTrue(!!m && /position:\s*absolute/.test(m[0]) && /left:\s*0/.test(m[0]),
            'у левого края (absolute, left 0)');
        assertTrue(!!m && /top:\s*50%/.test(m[0]) && /translateY\(-50%\)/.test(m[0]),
            'по середине высоты края');
        assertTrue(!!m && /z-index:\s*6/.test(m[0]), 'поверх таблицы (z 6)');
        assertTrue(!!m && /border-left:\s*none/.test(m[0]), 'примыкает к бортику');
        // Task 331 (заявка): В ДВА РАЗА УЖЕ (22→11px) и ПРОЗРАЧНЕЕ
        // (0.92→0.55 — просвечивает накрытая ячейка данных)
        assertTrue(!!m && m[0].indexOf('width: 11px') !== -1,
            'кнопка вдвое уже: 11px (Task 331)');
        assertTrue(!!m && m[0].indexOf('rgba(21, 32, 47, 0.55)') !== -1,
            'полупрозрачная заливка 0.55 (Task 331)');
        assertTrue(!!m && /height:\s*48px/.test(m[0]), 'высота прежняя (48px)');
        assertTrue(/\.ws-tt-chv\.on\s*\{[^}]*rgba\(74,\s*143,\s*199/.test(INDEX_SRC),
            'активная — синий тинт');
        assertTrue(/\.ws-tt-chv\.on svg\s*\{[^}]*rotate\(180deg\)/.test(INDEX_SRC),
            'шеврон разворачивается на 180°');
        assertTrue(/\.ws-tt-chv\[hidden\]\s*\{\s*display:\s*none/.test(INDEX_SRC),
            'скрытие [hidden]');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ws-tt-chv') !== -1,
            'светлая тема');
        assertFalse(/\.ws-tt-more\s*\{/.test(INDEX_SRC), 'стилей .ws-tt-more больше нет');
    });

    test('CSS: шторка — РОВНО ПО СТОЛБЦАМ (JS), не пол-области', () => {
        // прежняя модель (50% + CSS-маржа -50%) удалена
        assertFalse(/\.ws-tt-drawer\s*\{[^}]*width:\s*50%/.test(INDEX_SRC),
            'фиксированной ширины 50% нет');
        assertFalse(/\.ws-tt-drawer\s*\{[^}]*margin-right:\s*-50%/.test(INDEX_SRC),
            'CSS-парковки -50% нет (маржа — JS в px)');
        const d = INDEX_SRC.match(/@media \(min-width: 1024px\)\s*\{[\s\S]*?\.ws-tt-drawer\s*\{[^}]*\}/);
        assertTrue(!!d, 'десктопное правило шторки');
        assertTrue(!!d && d[0].indexOf('max-width: 60%') !== -1,
            'кап 60%: длинные таблицы — прокруткой ползунка');
        assertTrue(!!d && d[0].indexOf('width: 0') !== -1,
            'до первого открытия — 0 (панель скрыта)');
        assertTrue(!!d && /position:\s*relative/.test(d[0]),
            'position: relative — якорь бортика/шеврона');
        assertTrue(!!d && d[0].indexOf('transition: margin-right 0.28s ease') !== -1,
            'анимация выдвижения — маржа (инлайн JS)');
        assertFalse(/#page-work-schedule\.ws-tt-open \.ws-tt-drawer\s*\{[^}]*margin-right:\s*0/.test(INDEX_SRC),
            'правила маржи у ws-tt-open нет — владеет JS');
        // JS-геометрия в toggleTotals: парковка → reflow → 0
        const tt = methodText(WS_CLIENT, 'toggleTotals');
        assertTrue(tt.indexOf("drawer.style.marginRight = (-w0) + 'px';") !== -1,
            'открытие: старт за краем (−ширина)');
        assertTrue(tt.indexOf('void drawer.offsetWidth;') !== -1,
            'фиксация стартовой позиции (reflow)');
        assertTrue(tt.indexOf("drawer.style.marginRight = '0px';") !== -1,
            'открытие: анимация маржи к 0');
        assertTrue(tt.indexOf("drawer.style.marginRight = (-w1) + 'px';") !== -1,
            'закрытие: маржа = −ширина (уезжает с контентом)');
    });

    test('CSS: столбцы УЗКИЕ — по заголовкам в 2 строки (десктоп)', () => {
        const m = INDEX_SRC.match(/@media \(min-width: 1024px\)\s*\{[\s\S]*?\.ws-tt-table:not\(\.ws-tt-year\)\s*\{\s*width:\s*auto;?\s*\}/);
        assertTrue(!!m, 'месяц (десктоп): width: auto — сумма явных ширин');
        const y = INDEX_SRC.match(/@media \(min-width: 1024px\)\s*\{[\s\S]*?\.ws-tt-table\.ws-tt-year\s*\{\s*width:\s*max-content;?\s*\}/);
        assertTrue(!!y, 'год (десктоп): width: max-content');
        // явные узкие ширины всех 11 столбцов
        ['work', 'hours', 'over', 'ov', 'b', 'ot', 'u', 'pr', 'day', 'night', 'other']
            .forEach(function(k) {
                const r = new RegExp('\\.ws-tt-table:not\\(\\.ws-tt-year\\) th\\.ws-tt-c-' + k + '\\s*\\{[^}]*width:\\s*\\d+px');
                assertTrue(r.test(INDEX_SRC), 'ширина столбца ws-tt-c-' + k);
            });
        // заголовки — в 2 строки (правила Task 327 сохранены)
        assertTrue(/\.ws-tt-table th\s*\{[^}]*white-space:\s*normal/.test(INDEX_SRC),
            'перенос заголовков сохранён');
        // мобильная таблица — прежняя раскладка (100%, fixed);
        // Task 382-адаптация: ФИО — var(--ws-tt-emp-w, 42%)
        // (изначальная ширина по тексту, как в «Году»)
        assertTrue(/\.ws-tt-table:not\(\.ws-tt-year\) th\.ws-tt-emp[\s\S]*?width:\s*var\(--ws-tt-emp-w,\s*42%\)/.test(INDEX_SRC),
            'мобайл: ФИО var(--ws-tt-emp-w, 42%) (правило сохранено, Task 382)');
    });

    test('CSS: ЗЕБРА колонки сотрудников — как в шторке итогов', () => {
        const z = INDEX_SRC.match(/\.ws-grid tbody tr:nth-child\(even\) td\.ws-emp-col\s*\{[^}]*\}/);
        assertTrue(!!z, 'правило зебры колонки ФИО');
        assertTrue(!!z && z[0].indexOf('linear-gradient(rgba(255, 255, 255, 0.09)') !== -1,
            'тёмная: 9% (как зебра строк шторки)');
        const zl = INDEX_SRC.match(/\[data-theme="light"\] \.ws-grid tbody tr:nth-child\(even\) td\.ws-emp-col\s*\{[^}]*\}/);
        assertTrue(!!zl && zl[0].indexOf('rgba(0, 0, 0, 0.07)') !== -1,
            'светлая: 7% (как шторка)');
        // градиент ПОВЕРХ непрозрачного фона (колонка sticky)
        assertTrue(!!z && /background-image:\s*linear-gradient/.test(z[0]),
            'полоса — background-image (стикер-фон остаётся непрозрачным)');
        // в широком режиме (шторка открыта) — тот же приём поверх фона
        const zg = INDEX_SRC.match(/#page-work-schedule\.ws-tt-gridwide \.ws-grid tbody tr:nth-child\(even\) td\.ws-emp-col\s*\{[^}]*\}/);
        assertTrue(!!zg && zg[0].indexOf('rgba(255, 255, 255, 0.09)') !== -1,
            'gridwide: зебра поверх усиленного фона');
        const zgl = INDEX_SRC.match(/\[data-theme="light"\] #page-work-schedule\.ws-tt-gridwide \.ws-grid[\s\S]{0,80}tr:nth-child\(even\) td\.ws-emp-col\s*\{[^}]*\}/);
        assertTrue(!!zgl && zgl[0].indexOf('rgba(0, 0, 0, 0.07)') !== -1,
            'gridwide светлая: 7%');
        // Task 417: hover ФИО удалён вместе с попапом карточки —
        // зебра чётных строк живёт без оверрайдов
        assertFalse(INDEX_SRC.indexOf('.ws-grid tbody tr:nth-child(even) td.ws-emp-col:hover') !== -1,
            'оверрайд зебры для hover удалён (Task 417)');
    });
});

// ============================================================
// 3. VM: _fitTtDrawer — ширина шторки по таблице
// ============================================================
describe('Task 329 — VM: _fitTtDrawer', () => {

    const drawer = () => ({ style: { width: 'старое', marginRight: 'старое' } });

    test('VM: десктоп — ширина = фактическая ширина таблицы (ceil)', () => {
        const fn = methodFn(WS_CLIENT, '_fitTtDrawer');
        const d = drawer();
        const table = { getBoundingClientRect: function() { return { width: 142.4 }; } };
        const body = { querySelector: function() { return table; } };
        global.window = { matchMedia: function() { return { matches: true }; } };
        global.document = mockDoc({ wsTotalsDrawer: d, wsTotalsPanel: { hidden: false },
                                    wsTtBody: body });
        try {
            fn.call({});
            assertEqual(d.style.width, '143px', 'ширина = ceil(факт таблицы)');
            assertEqual(d.style.marginRight, 'старое', 'маржу не трогает (её владеет toggleTotals)');
        } finally {
            delete global.window;
            delete global.document;
        }
    });

    test('VM: мобайл — инлайновые размеры сбрасываются', () => {
        const fn = methodFn(WS_CLIENT, '_fitTtDrawer');
        const d = drawer();
        // window не определён (VM без окна) → мобайл
        global.document = mockDoc({ wsTotalsDrawer: d, wsTotalsPanel: { hidden: false } });
        try {
            fn.call({});
            assertEqual(d.style.width, '', 'ширина очищена (CSS 86vw)');
            assertEqual(d.style.marginRight, '', 'маржа очищена');
        } finally {
            delete global.document;
        }
    });

    test('VM: панель скрыта → нет операций; пусто — 240px', () => {
        const fn = methodFn(WS_CLIENT, '_fitTtDrawer');
        // панель скрыта: ничего не делает
        const d = drawer();
        global.document = mockDoc({ wsTotalsDrawer: d, wsTotalsPanel: { hidden: true } });
        fn.call({});
        assertEqual(d.style.width, 'старое', 'панель скрыта — без изменений');
        // таблицы нет (пустое состояние) — минимум 240px
        const d2 = drawer();
        global.document = mockDoc({ wsTotalsDrawer: d2, wsTotalsPanel: { hidden: false },
                                    wsTtBody: { querySelector: function() { return null; } } });
        global.window = { matchMedia: function() { return { matches: true }; } };
        try {
            fn.call({});
            assertEqual(d2.style.width, '240px', 'пустое состояние — минимум');
        } finally {
            delete global.window;
            delete global.document;
        }
    });
});

// ============================================================
// 4. VM: закрытие с контентом; рендер — дни переработки
// ============================================================
describe('Task 329 — VM: закрытие и рендер', () => {

    test('VM: _ttCloseCleanup прячет панель ПОСЛЕ анимации', () => {
        const fn = methodFn(WS_CLIENT, '_ttCloseCleanup');
        const panel = { hidden: false };
        const page = {
            classList: { state: {}, remove: function(c) { this.state[c] = false; } },
            style: { props: {}, removeProperty: function(k) { delete this.props[k]; } }
        };
        const fit = { n: 0 };
        global.document = mockDoc({ wsTotalsPanel: panel, 'page-work-schedule': page });
        const host = { _totalsOpen: false, _ttWideTimer: 1, _fitGrid: function() { fit.n++; } };
        try {
            fn.call(host);
            assertEqual(panel.hidden, true, 'панель спрятана уборкой');
            assertEqual(page.classList.state['ws-tt-gridwide'], false, 'широкий режим снят');
            assertEqual(fit.n, 1, 'строки пересчитаны');
            // открытая шторка — уборка ничего не делает
            const panel2 = { hidden: false };
            global.document = mockDoc({ wsTotalsPanel: panel2, 'page-work-schedule': page });
            fn.call({ _totalsOpen: true, _fitGrid: function() {} });
            assertEqual(panel2.hidden, false, 'открыта — панель не тронута');
        } finally {
            delete global.document;
        }
    });

    test('VM: _renderTotalsMonth — классы ширин + ПЕРЕРАБОТКА В ДНЯХ', () => {
        const fn = methodFn(WS_CLIENT, '_renderTotalsMonth');
        const body = { innerHTML: '', querySelector: function() { return null; } };
        global.document = mockDoc({ wsTtBody: body,
            wsTtWarn: { textContent: '', hidden: true } });
        const host = {
            _year: 2026, _month: 9, _totalsExtra: false,
            _EMPLOYEES: [
                { 'таб_номер': '0871', 'ФИО': 'Иванов И.И.', 'тип': 'сменный' },
                { 'таб_номер': '023', 'ФИО': 'Петров П.П.', 'тип': 'дневной' }
            ],
            _ENTRIES: [
                { 'дата': '2026-09-01', 'таб_номер': '0871', 'статус': 'Д' },
                { 'дата': '2026-09-05', 'таб_номер': '0871', 'статус': 'д' },
                { 'дата': '2026-09-05', 'таб_номер': '0871', 'статус': 'н' },
                { 'дата': '2026-09-06', 'таб_номер': '023', 'статус': 'д', 'часы': 7.2 }
            ],
            _PENDING: {},
            _STATUS_CODES: [
                { code: 'Д', name: 'День (12-час)', color: '#c' },
                { code: 'д', name: 'День в вых./праздник', color: '#c' },
                { code: 'н', name: 'Ночь в вых./праздник', color: '#c' }
            ],
            _setTtWarn: function() {},
            _totalsEffectiveEntries: function() { return this._ENTRIES; },
            _empTypeMap: function(l) {
                const m = {}; l.forEach(function(e) { m[e['таб_номер']] = e['тип']; });
                return m;
            },
            _applyTtHeadVar: function() { return false; },
            _fitGrid: function() {},
            _syncTotalsRows: function() {},
            _fitTtDrawer: function() {},
            _esc: function(s) { return String(s); },
            _fmtTotalsNum: function(v) {
                return String(Math.round((v || 0) * 10) / 10).replace('.', ',');
            },
            _statusMeta: function() { return null; },
            _codeHours: function() { return 0; },
            _overHours: function() { return 12; },
            _totalsZero: function() {
                return { work: 0, day: 0, night: 0, hours: 0,
                         'ОТ': 0, 'У': 0, 'ОВ': 0, 'Б': 0, 'ПР': 0,
                         over: 0, overDays: 0, other: 0, total: 0 };
            },
            _totalsAgg: function(entries, types) {
                var byTab = {};
                var zero = host._totalsZero;
                entries.forEach(function(e) {
                    var t = String(e['таб_номер']);
                    var a = byTab[t] || (byTab[t] = zero());
                    if (e['статус'] === 'д' || e['статус'] === 'н') {
                        a.overDays++;
                        a.over += (types[t] === 'сменный') ? 12 : (e['часы'] || 8);
                    } else {
                        a.work++; a.hours += 12;
                    }
                });
                return { byTab: byTab, grand: zero() };
            }
        };
        try {
            fn.call(host);
        } finally {
            delete global.document;
        }
        const h = body.innerHTML;
        // классы ширин на th (Task 329); Task 331: подписи «(дни)»
        assertTrue(h.indexOf('<th class="ws-tt-c-work">Явки (дни)</th>') !== -1, 'th: класс ws-tt-c-work');
        assertTrue(h.indexOf('<th class="ws-tt-c-hours">Часы</th>') !== -1, 'th: класс ws-tt-c-hours');
        assertTrue(h.indexOf('<th class="ws-tt-c-over">Переработка (дни)</th>') !== -1, 'th: класс ws-tt-c-over');
        // ПЕРЕРАБОТКА В ДНЯХ: Иванов 2 (д+н), Петров 1 (д)
        const overs = h.match(/ws-tt-over[^>]*>\d+<\/td>/g) || [];
        assertEqual(overs.length, 2, 'по ячейке переработки на сотрудника');
        assertTrue(overs[0].indexOf('>2<') !== -1, 'Иванов: 2 дня (д+н)');
        assertTrue(overs[1].indexOf('>1<') !== -1, 'Петров: 1 день (д)');
        // ЧАСЫ — в тултипе: Иванов 24 (2×12 сменный), Петров 7,2
        assertTrue(h.indexOf('часов переработки: 24') !== -1,
            'тултип: часы Иванова (2×12)');
        assertTrue(h.indexOf('часов переработки: 7,2') !== -1,
            'тултип: часы Петрова (7,2)');
        assertFalse(/ws-tt-over[^>]*>24<\/td>/.test(h), 'часов в значении нет');
        // рендер позвал _fitTtDrawer (ширина шторки по столбцам)
        var fitCalls = 0;
        host._fitTtDrawer = function() { fitCalls++; };
        global.document = mockDoc({ wsTtBody: body, wsTtWarn: { textContent: '', hidden: true } });
        try { fn.call(host); } finally { delete global.document; }
        assertEqual(fitCalls, 1, '_renderTotalsMonth → _fitTtDrawer');
    });

    test('VM: _renderTotalsMonth — мин-ширина «Ещё» ТОЛЬКО на мобайле', () => {
        const m = methodText(WS_CLIENT, '_renderTotalsMonth');
        // мин-ширина ставится при !isDesktop (мобайл: развёрнутые
        // столбцы шире оверлея — прокрутка); на десктопе — пустая строка
        assertTrue(m.indexOf('if (table && !isDesktop)') !== -1,
            'мин-ширина — условие «только мобайл»');
        assertTrue(m.indexOf("table.style.minWidth = '';") !== -1,
            'десктоп: мин-ширина сбрасывается (ширина = столбцы)');
    });

    test('VM: _renderTotalsMonth — ЯВНАЯ ширина таблицы (сумма столбцов)', () => {
        const m = methodText(WS_CLIENT, '_renderTotalsMonth');
        // Task 329: fixed-раскладка с width:auto в контейнере нулевой
        // ширины — КРУГОВАЯ зависимость (столбцы сжимались в
        // мин-контент); JS ставит явные px: инлайн th + ширина таблицы
        assertTrue(m.indexOf('TT_COL_W') !== -1, 'карта явных ширин столбцов');
        assertTrue(m.indexOf("table.style.width = tw + 'px';") !== -1,
            'ширина таблицы = сумма столбцов (явный px)');
        assertTrue(m.indexOf("ths[wc + 1].style.width = wv + 'px';") !== -1,
            'инлайновые ширины th (дубль CSS — работает без стилей)');
        assertTrue(m.indexOf("table.style.width = '';") !== -1,
            'мобайл: инлайн-ширина сбрасывается (100% оверлея)');
    });

    test('VM: _renderTotalsYearTable — годовая переработка В ДНЯХ', () => {
        const m = methodText(WS_CLIENT, '_renderTotalsYearTable');
        assertTrue(m.indexOf('(sumOverDays || \'—\')') !== -1,
            'значение — sumOverDays (дни)');
        assertTrue(m.indexOf('часов переработки: ') !== -1,
            'часы — в тултипе');
        assertTrue(m.indexOf('дни переработки за год — коды д/н') !== -1,
            'заголовок колонки: «дни»');
        assertFalse(m.indexOf('title="дней переработки: ') !== -1,
            'прежнего тултипа «дней:» нет');
    });

    test('JS: пересечение брейкпоинта — сброс/перерендер шторки', () => {
        const m = methodText(WS_CLIENT, '_attachFitResize');
        assertTrue(m.indexOf('onMqTT') !== -1,
            'mq-listener геометрии шторки в _attachFitResize');
        assertTrue(m.indexOf("drawer.style.width = '';") !== -1,
            'уход в мобайл: инлайн-ширина сбрасывается');
        assertTrue(m.indexOf("drawer.style.marginRight = '0px';") !== -1,
            'возврат в десктоп (открыта): маржа 0');
        assertTrue(m.indexOf('self._renderTotals();') !== -1,
            'возврат в десктоп: полный перерендер (ширины пересчитаются)');
    });
});

// ============================================================
// 5. SW: версия кэша
// ============================================================
describe('Task 329 — SW: версия кэша', () => {

    test('SW: кэш поднят до kipia-test-v751 (Task 329)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v751') !== -1,
            'CACHE_VERSION = kipia-test-v751');
        assertFalse(SW_SRC.indexOf('kipia-test-v751-OLD') !== -1,
            'старой версии v567 нет');
    });
});
