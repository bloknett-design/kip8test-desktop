// tests/test-task379.js
// Task 379 — заявки пользователя:
//   1) «переделай, фон пустых ячеек #FFFFFF — ячейки значений не в
//      шторке итогов, а в шахматке табеля» — #FFFFFF из Task 378
//      относился к ШАХМАТКЕ: светлая тема — фон ПУСТЫХ ячеек значений
//      сетки (.ws-cell), «.»-ячейки и свотча «.» в попапе —
//      #eef0f2 → #FFFFFF. Тёмная тема НЕ тронута (Task 319:
//      #eef0f2 + brightness(0.88)); итоги учёта Task 378 (#FFFFFF,
//      линии шахматки, без нулей) остаются — фон шахматки и итогов
//      теперь совпадает.
//   2) «Окна „Мероприятия“ и „Нормы“ в баре, при раскрытии должны
//      смещаться вниз по верх бара, не увеличивая его в размере» —
//      раскрытое окно = ОВЕРЛЕЙ: низ уезжает вниз ПОВЕРХ ряда 2/3
//      бара и шахматки, ГАБАРИТ БАРА НЕ РАСТЁТ: прирост высоты
//      компенсируется отрицательным margin-bottom = 95 − scrollHeight
//      (_barExpSync/_barExpToggle), height и margin-bottom
//      анимируются СИНХРОННО (сумма всегда 95px — раскладка не
//      дёргается); CSS .ws-bar-open: z-index 55 (над sticky-шапкой
//      сетки z2, под шапкой приложения z60/шторкой z75/навом z100)
//      + тень «парения» (тёмная 0.38 / светлая 0.22).
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   CSS шахматка: [light] .ws-cell → #FFFFFF; [light] .ws-cell.ws-dot-code
//     → #FFFFFF; [light] .ws-popup-swatch.ws-swatch-dot → #FFFFFF;
//     [dark] .ws-cell → #eef0f2 + brightness(0.88) НЕ тронут; база
//     .ws-cell → var(--bg-primary) НЕ тронута; праздники #f8e2e9 живы.
//   CSS окна: transition height+margin-bottom (оба окна); .ws-bar-open
//     (оба окна) z-index 55 + box-shadow; светлая тема — своя тень;
//     десктопные 95px на месте.
//   JS (SRC): _barExpSync/_barExpToggle ставят marginBottom =
//     (95 - scrollHeight)+'px' при раскрытии и сбрасывают при
//     сворачивании (по 1 вхождению формулы/сброса на метод).
//   JS (VM): клик — высота 250px + маржа -155px (габарит бара 95px);
//     повторный — обе сброшены; НОВЫЙ текст в раскрытом — 310px +
//     -215px; исчезновение переполнения — авто-сворачивание, маржа
//     сброшена; значок .on при раскрытии.
//   SW: kipia-test-v734 (guard v609).
//   Регресс: итоги Task 378 (#FFFFFF светлой) живы; тёмные тоталы
//     #eef0f2 живы; зебра ФИО сетки жива.
//
// Запуск: через tests/run-all.js (require './test-task379.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Вырезка метода WorkSchedule: «имя: function» (отступ 8 пробелов)
// → следующий метод ТОГО ЖЕ уровня.
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

function mockDoc(els) {
    return {
        getElementById: function(id) { return els[id] || null; },
        createElement: function(tag) { return mkBtn(); }
    };
}

function mkBtn() {
    const cls = [];
    return {
        tagName: 'BUTTON', style: {}, type: '', className: '',
        innerHTML: '', attrs: {}, onclick: null,
        classList: {
            toggle: function(c, on) {
                const i = cls.indexOf(c);
                if (on === undefined) on = i === -1;
                if (on && i === -1) cls.push(c);
                if (!on && i !== -1) cls.splice(i, 1);
            },
            contains: function(c) { return cls.indexOf(c) !== -1; }
        },
        setAttribute: function(k, v) { this.attrs[k] = v; }
    };
}

function mkPanel(scrollH) {
    const cls = [];
    let btn = null;
    const el = {
        scrollHeight: scrollH,
        clientHeight: 95,
        scrollTop: 0,
        listeners: {},
        style: {},
        classList: {
            contains: function(c) { return cls.indexOf(c) !== -1; },
            toggle: function(c, on) {
                const i = cls.indexOf(c);
                if (on === undefined) on = i === -1;
                if (on && i === -1) cls.push(c);
                if (!on && i !== -1) cls.splice(i, 1);
            },
            add: function(c) { if (cls.indexOf(c) === -1) cls.push(c); },
            remove: function(c) {
                const i = cls.indexOf(c);
                if (i !== -1) cls.splice(i, 1);
            }
        },
        querySelector: function(sel) {
            return (sel === '.ws-bar-exp' && btn) ? btn : null;
        },
        appendChild: function(node) { btn = node; },
        addEventListener: function(type, fn) {
            (this.listeners[type] = this.listeners[type] || []).push(fn);
        }
    };
    el._btn = function() { return btn; };
    el._cls = cls;
    return el;
}

// ============================================================
// 1. CSS: шахматка — ПУСТЫЕ ячейки значений светлой темы #FFFFFF
// ============================================================
describe('Task 379 — шахматка: пустые ячейки светлой темы #FFFFFF', () => {

    test('светлая: фон ПУСТЫХ ячеек значений — #FFFFFF', () => {
        const re = /\[data-theme="light"\] \.ws-grid tbody td\.ws-cell \{[^}]*background:\s*#FFFFFF;[^}]*\}/;
        assertTrue(re.test(INDEX_SRC),
            'фон пустых ячеек шахматки (светлая) — #FFFFFF (было #eef0f2)');
        assertFalse(/\[data-theme="light"\] \.ws-grid tbody td\.ws-cell \{[^}]*background:\s*#eef0f2;[^}]*\}/.test(INDEX_SRC),
            'старого #eef0f2 у пустых ячеек светлой темы больше нет');
    });

    test('светлая: «.»-ячейка = пустая (#FFFFFF)', () => {
        const re = /\[data-theme="light"\] \.ws-grid tbody td\.ws-cell\.ws-dot-code \{[^}]*background:\s*#FFFFFF;[^}]*\}/;
        assertTrue(re.test(INDEX_SRC),
            '«.»-ячейка светлой темы — #FFFFFF (совпадает с пустой)');
    });

    test('светлая: свотч «.» в попапе — #FFFFFF (предпросмотр пустой)', () => {
        const re = /\[data-theme="light"\] \.ws-popup-swatch\.ws-swatch-dot \{[^}]*background:\s*#FFFFFF;[^}]*\}/;
        assertTrue(re.test(INDEX_SRC),
            'свотч «.» показывает пустую ячейку светлой темы (#FFFFFF)');
    });

    test('тёмная тема шахматки НЕ тронута (Task 319)', () => {
        const re = /\[data-theme="dark"\] \.ws-grid tbody td\.ws-cell \{[^}]*background:\s*#eef0f2;[^}]*color:\s*#141413;[^}]*filter:\s*brightness\(0\.88\);[^}]*\}/s;
        assertTrue(re.test(INDEX_SRC),
            'тёмная: пустые #eef0f2 + brightness(0.88) — как прежде');
        const sw = /\[data-theme="dark"\] \.ws-popup-swatch\.ws-swatch-dot \{[^}]*background:\s*#eef0f2;[^}]*\}/;
        assertTrue(sw.test(INDEX_SRC), 'тёмный свотч «.» — #eef0f2 (как прежде)');
    });

    test('база и праздники НЕ тронуты', () => {
        assertTrue(/\.ws-grid tbody td\.ws-cell \{[^}]*background:\s*var\(--bg-primary,\s*#1a2233\);[^}]*\}/s.test(INDEX_SRC),
            'база .ws-cell — var(--bg-primary) (правка только в светлой теме)');
        const feast = /\[data-theme="light"\] \.ws-grid tbody td\.ws-cell\.ws-feast\.ws-status-empty \{[^}]*background:\s*#f8e2e9;[^}]*\}/;
        assertTrue(feast.test(INDEX_SRC),
            'праздники светлой темы — розовые #f8e2e9 (Task 363, не тронуты)');
    });
});

// ============================================================
// 2. CSS: окна бара — раскрытие ОВЕРЛЕЕМ, габарит бара неизменен
// ============================================================
describe('Task 379 — окна бара: оверлей, бар не растёт', () => {

    test('transition height + margin-bottom — СИНХРОННО (оба окна)', () => {
        const ev = INDEX_SRC.match(/\.ws-events-panel \{[^}]*transition:\s*height 0\.18s ease,\s*margin-bottom 0\.18s ease;[^}]*\}/s);
        assertTrue(!!ev, 'мероприятия: transition height + margin-bottom');
        const cal = INDEX_SRC.match(/\.ws-cal-panel \{[^}]*transition:\s*height 0\.18s ease,\s*margin-bottom 0\.18s ease;[^}]*\}/s);
        assertTrue(!!cal, 'нормы: transition height + margin-bottom');
    });

    test('.ws-bar-open: z-index 55 + тень (оба окна)', () => {
        const re = /\.ws-events-panel\.ws-bar-open,\s*\n\s*\.ws-cal-panel\.ws-bar-open \{[^}]*z-index:\s*55;[^}]*box-shadow:\s*0 14px 30px rgba\(0,\s*0,\s*0,\s*0\.38\);[^}]*\}/s;
        assertTrue(re.test(INDEX_SRC),
            'раскрытое окно — оверлей (z-index 55, тень 0.38)');
        const light = /\[data-theme="light"\] \.ws-events-panel\.ws-bar-open,\s*\n\s*\[data-theme="light"\] \.ws-cal-panel\.ws-bar-open \{[^}]*box-shadow:\s*0 14px 30px rgba\(0,\s*0,\s*0,\s*0\.22\);[^}]*\}/s;
        assertTrue(light.test(INDEX_SRC),
            'светлая тема — тень мягче (0.22)');
    });

    test('z-index 55 — между шапкой сетки и шапкой приложения', () => {
        // сетка thead sticky z-index: 2 (окно ПОВЕРХ), шапка приложения
        // z-index: 60, шторка итогов z 75, нижний нав z 100 (окно ПОД)
        const th = /\.ws-grid thead th \{[^}]*position:\s*sticky;[^}]*z-index:\s*2;[^}]*\}/s;
        assertTrue(th.test(INDEX_SRC), 'sticky-шапка сетки — z 2 (ниже окна)');
        assertTrue(INDEX_SRC.indexOf('z-index: 60') !== -1, 'шапка приложения — z 60 (выше окна)');
    });

    test('десктопные окна: 95px на месте (габарит бара)', () => {
        const mq = INDEX_SRC.match(/@media \(min-width: 1024px\) \{[\s\S]*?\.ws-events-panel,\s*\n\s*\.ws-cal-panel \{[\s\S]*?\}/);
        assertTrue(!!mq && mq[0].indexOf('height: 95px') !== -1,
            'компактная высота окон бара — 95px (как прежде)');
    });
});

// ============================================================
// 3. JS (SRC): компенсация margin-bottom в _barExp*
// ============================================================
describe('Task 379 — SRC: _barExp* компенсируют габарит бара', () => {

    test('_barExpSync: формула (95 - hOpen) и сброс', () => {
        // Task 482: раскрытие КАПАЕТСЯ по низу экрана (_barExpMaxH)
        // — высота в формуле теперь переменная hOpen (капнутая);
        // без метода (старые VM-харнессы) hOpen = scrollHeight —
        // прежняя семантика, габарит бара 95px сохранён
        const m = methodText(WS_SRC, '_barExpSync');
        assertTrue(m.length > 0, 'метод _barExpSync найден');
        const f = (m.match(/\(95 - hOpen\) \+ 'px'/g) || []).length;
        assertEqual(f, 1, 'формула маржи — ровно 1 раз');
        const r = (m.match(/el\.style\.marginBottom = '';/g) || []).length;
        assertEqual(r, 1, 'сброс маржи при сворачивании — ровно 1 раз');
    });

    test('_barExpToggle: формула (95 - hOpen) и сброс', () => {
        const m = methodText(WS_SRC, '_barExpToggle');
        assertTrue(m.length > 0, 'метод _barExpToggle найден');
        const f = (m.match(/\(95 - hOpen\) \+ 'px'/g) || []).length;
        assertEqual(f, 1, 'формула маржи — ровно 1 раз');
        const r = (m.match(/el\.style\.marginBottom = '';/g) || []).length;
        assertEqual(r, 1, 'сброс маржи при закрытии — ровно 1 раз');
    });

    test('Task 482: оба метода подключают КАП высоты (гвард typeof)', () => {
        const s = methodText(WS_SRC, '_barExpSync');
        const t = methodText(WS_SRC, '_barExpToggle');
        [s, t].forEach(function(m, idx) {
            assertTrue(m.indexOf(
                "typeof this._barExpMaxH === 'function'") !== -1,
                'метод ' + (idx ? '_barExpToggle' : '_barExpSync') +
                ' зовёт _barExpMaxH с гвардом');
        });
        // габарит бара: высота + |маржа| = 95px и с капом —
        // проверено в VM-секции test-task482.js (§5)
    });
});

// ============================================================
// 4. JS (VM): высота + маржа = 95px в любой момент
// ============================================================
describe('Task 379 — VM: габарит бара всегда 95px', () => {

    const METHODS = ['_barExpSync', '_barExpToggle'];
    const texts = METHODS.map(n => methodText(WS_SRC, n));
    assertTrue(texts.every(t => t.length > 0), 'методы _barExp* найдены');

    function loadHost() {
        return new Function('document',
            'return ({' + texts.join('\n') + '\n});')(mockDoc({}));
    }

    test('клик: 250px + маржа -155px (сумма 95px)', () => {
        const host = loadHost();
        const el = mkPanel(250);
        host._barExpSync(el);
        host._barExpToggle(el);
        assertTrue(el._cls.indexOf('ws-bar-open') !== -1, 'класс ws-bar-open');
        assertEqual(el.style.height, '250px', 'высота = весь текст (250px)');
        assertEqual(el.style.marginBottom, '-155px',
            'маржа 95-250 = -155px — окно в строке бара занимает 95px');
        assertTrue(el._btn().classList.contains('on'), 'значок активен');
    });

    test('повторный клик: высота и маржа сброшены', () => {
        const host = loadHost();
        const el = mkPanel(250);
        host._barExpSync(el);
        host._barExpToggle(el);
        host._barExpToggle(el);
        assertFalse(el._cls.indexOf('ws-bar-open') !== -1, 'класс снят');
        assertEqual(el.style.height, '', 'высота возвращена (CSS 95px)');
        assertEqual(el.style.marginBottom, '', 'маржа сброшена (габарит бара)');
    });

    test('раскрытое окно + НОВЫЙ текст: маржа следует за высотой', () => {
        const host = loadHost();
        const el = mkPanel(250);
        host._barExpSync(el);
        host._barExpToggle(el);
        el.scrollHeight = 310;      // перерисовка с бОльшим текстом
        host._barExpSync(el);
        assertEqual(el.style.height, '310px', 'низ уехал на 310px (по тексту)');
        assertEqual(el.style.marginBottom, '-215px', 'маржа 95-310 = -215px');
        el.scrollHeight = 80;       // текст перестал переполнять
        host._barExpSync(el);
        assertFalse(el._cls.indexOf('ws-bar-open') !== -1,
            'переполнения нет — окно свернулось само');
        assertEqual(el.style.marginBottom, '', 'маржа сброшена при авто-сворачивании');
    });
});

// ============================================================
// 5. SW и регресс
// ============================================================
describe('Task 379 — SW и регресс', () => {

    test('SW: kipia-test-v734', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v734'") !== -1,
            'версия кэша kipia-test-v734');
        assertFalse(SW_SRC.indexOf('kipia-test-v735') !== -1,
            'двойного бампа нет');
    });

    test('регресс: итоги Task 381 — БЕЗ фона (вернули как до белого)', () => {
        // Заявка Task 381: «фон итогов верни как был до белого» —
        // правила #FFFFFF/#eef0f2 Task 378 удалены; ячейки прозрачные
        assertFalse(/\[data-theme="light"\] \.ws-tt-table tbody td\.ws-tt-num \{[^}]*background:\s*#FFFFFF;[^}]*\}/.test(INDEX_SRC),
            'правила #FFFFFF ячеек итогов больше нет (Task 381)');
        assertFalse(/\[data-theme="dark"\] \.ws-tt-table tbody td\.ws-tt-num \{[^}]*background:\s*#eef0f2;[^}]*\}/.test(INDEX_SRC),
            'правила #eef0f2 тёмных итогов больше нет (Task 381)');
        // шахматка Task 379 (#FFFFFF) жива — её не трогали
        const re = /\[data-theme="light"\] \.ws-grid tbody td\.ws-cell \{[^}]*background:\s*#FFFFFF;[^}]*\}/;
        assertTrue(re.test(INDEX_SRC),
            'пустые ячейки ШАХМАТКИ светлой темы — по-прежнему #FFFFFF');
    });

    test('регресс: зебра КОЛОНКИ ФИО сетки жива', () => {
        const b = INDEX_SRC.match(/\.ws-grid tbody tr:nth-child\(even\) td\.ws-emp-col \{[^}]*linear-gradient[^}]*\}/s);
        assertTrue(!!b, 'зебра ФИО шахматки не тронута (Task 329)');
    });
});
