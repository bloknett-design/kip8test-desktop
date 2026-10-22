// tests/test-task381.js
// Task 381 — заявки пользователя:
//   1) «Фон итогов верни как был до белого» — фон ячеек итогов учёта
//      (td.ws-tt-num таблиц месяца/года) — ПРОЗРАЧНЫЙ, как до белого:
//      правила Task 378 ([light] #FFFFFF; [dark] #eef0f2+#141413+
//      brightness(0.88); [dark] Часы #1d7a37 / Переработка #a06a13)
//      УДАЛЕНЫ; ЗЕБРА чётных строк Task 322 ВОССТАНОВЛЕНА (0.09/0.07);
//      линии шахматки, нули → пустые и яркость перекрестья Task 378
//      остаются.
//   2) «При прокрутке текста в свёрнутых окнах мероприятий и норм,
//      значки раскрытия должны оставаться на месте» — значок
//      .ws-bar-exp ПРИКОЛОТ к видимой нижней грани: translateY(
//      el.scrollTop) на каждый scroll (слушатель — ОДИН раз, флаг
//      _barExpPin на элементе окна) + при каждом _barExpSync (значок
//      (пере)создаётся после рендеров — transform восстанавливается).
//   3) «Окно „Мероприятия“ — не каждая строка мероприятия должна
//      иметь фоновую „плашку“ во всю ширину окна, цвет зависит от
//      даты, а общий фон всего пространства окна на уровне данного
//      текста должен быть закрашен соответствующим цветом» — НЕ плашки
//      по строкам, а ОБЩИЙ ФОН окна: строка до КРАЁВ окна (padding
//      3px 10px + margin 0 -10px), соседние строки СКЛЕИВАЮТСЯ
//      (.ws-events-panel gap: 0; .ws-ep-item + .ws-ep-item margin-top:
//      0; .ws-events-panel > * + * margin-top: 3px — заголовок/значок
//      как прежде); тинты Task 380 НЕ тронуты; окно «Нормы» НЕ тронуто.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   CSS итоги: правила фона ячеек ОТСУТСТВУЮТ (обе темы); зебра
//     восстановлена (0.09/0.07); тёмные переопределения цветных
//     колонок отсутствуют; базовые Часы #4ac771 / Переработка
//     #e0a23c живы; линии Task 378 и перекрестье 0.30/0.22 живы
//     (регресс); панель итогов светлая #e9e7de жива (регресс);
//     шахматка #FFFFFF Task 379 жива (регресс).
//   SRC значки: _barExpSync — флаг _barExpPin, el.addEventListener(
//     'scroll', …), btn.style.transform = translateY(el.scrollTop).
//   VM значки: слушатель вешается 1 раз (повторный sync не дублирует);
//     scroll → transform = translateY(N) на ТЕКУЩЕМ значке (после
//     «перерисовки» — на новом); transform ставится и самим sync;
//     раскрытие/габарит бара Task 379 не сломаны (высота + маржа).
//   CSS мероприятия: gap: 0 у .ws-events-panel ПОСЛЕ правил Task 380;
//     > * + * 3px; .ws-ep-item + .ws-ep-item margin-top: 0; строка
//     3px 10px / 0 -10px; тинты 0.45/0.12/0.12/0.55 на месте; окно
//     «Нормы» БЕЗ gap: 0 (не тронуто).
//   SW: kipia-test-v756 (guard v611).
//
// Запуск: через tests/run-all.js (require './test-task381.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function ruleBlock(cssPart) {
    const needle = '\n    ' + cssPart;
    const i = INDEX_SRC.indexOf(needle);
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('\n    }', i);
    return INDEX_SRC.slice(i, j !== -1 ? j + 6 : i + 400);
}

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

// ============================================================
// 1. CSS: итоги — фон как до белого (заявка 1)
// ============================================================
describe('Task 381 — CSS: итоги без белого фона, зебра', () => {

    test('правила фона ячеек значений УДАЛЕНЫ (обе темы)', () => {
        const bl = ruleBlock('[data-theme="light"] .ws-tt-table tbody td.ws-tt-num {');
        assertTrue(bl === null, 'светлая: правила фона #FFFFFF нет');
        const bd = ruleBlock('[data-theme="dark"] .ws-tt-table tbody td.ws-tt-num {');
        assertTrue(bd === null, 'тёмная: правила #eef0f2/#141413/brightness нет');
    });

    test('тёмные переопределения цветных колонок УДАЛЕНЫ', () => {
        assertFalse(/\[data-theme="dark"\] \.ws-tt-table td\.ws-tt-hours\s*\{/.test(INDEX_SRC),
            '[data-theme="dark"] Часов нет');
        assertFalse(/\[data-theme="dark"\] \.ws-tt-table td\.ws-tt-over\s*\{/.test(INDEX_SRC),
            '[data-theme="dark"] Переработки нет');
    });

    test('зебра чётных строк ВОССТАНОВЛЕНА (значения Task 322)', () => {
        const z = ruleBlock('.ws-tt-table tbody tr:nth-child(even) {');
        assertTrue(z !== null && /rgba\(255, 255, 255, 0\.09\)/.test(z),
            'тёмная: чётные строки светлее (0.09)');
        const zl = ruleBlock('[data-theme="light"] .ws-tt-table tbody tr:nth-child(even) {');
        assertTrue(zl !== null && /rgba\(0, 0, 0, 0\.07\)/.test(zl),
            'светлая: чётные строки темнее (0.07)');
    });

    test('регресс: базовые цвета «Часов»/«Переработки» живы', () => {
        const h = INDEX_SRC.match(/\n    \.ws-tt-table td\.ws-tt-hours\s*\{[^}]*\}/);
        assertTrue(!!h && h[0].indexOf('#4ac771') !== -1,
            'Часы: зелёный тёмной темы (#4ac771)');
        const o = INDEX_SRC.match(/\n    \.ws-tt-table td\.ws-tt-over\s*\{[^}]*\}/);
        assertTrue(!!o && o[0].indexOf('#e0a23c') !== -1,
            'Переработка: янтарный тёмной темы (#e0a23c)');
    });

    test('регресс: линии шахматки Task 378 у итогов живы', () => {
        const b = ruleBlock('.ws-tt-table th,\n    .ws-tt-table td {');
        assertTrue(b !== null && /rgba\(0, 0, 0, 0\.30\)/.test(b),
            'тёмная база линий — 0.30 (Task 378)');
        const l = ruleBlock('[data-theme="light"] .ws-tt-table th,\n    [data-theme="light"] .ws-tt-table td {');
        assertTrue(l !== null && /rgb\(10, 15, 23\)/.test(l),
            'светлая база линий — rgb(10,15,23) (Task 378)');
    });

    test('регресс: перекрестье итогов 0.30/0.22 и панель #e9e7de живы', () => {
        const b = ruleBlock('.ws-tt-table tbody tr.ws-hover-row td {');
        assertTrue(b !== null && /rgba\(74, 143, 199, 0\.30\)/.test(b),
            'строка шторки — 0.30 (Task 378)');
        const l = ruleBlock('[data-theme="light"] .ws-tt-table tbody tr.ws-hover-row td {');
        assertTrue(l !== null && /rgba\(42, 93, 143, 0\.22\)/.test(l),
            'светлая строка шторки — 0.22 (Task 378)');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ws-totals-panel') !== -1 &&
                   /background:\s*#e9e7de/.test(
                       INDEX_SRC.slice(INDEX_SRC.indexOf('[data-theme="light"] .ws-totals-panel'),
                                       INDEX_SRC.indexOf('[data-theme="light"] .ws-totals-panel') + 200)),
            'панель итогов светлой темы — #e9e7de (сквозь прозрачные ячейки)');
    });

    test('регресс: шахматка Task 379 (#FFFFFF) не тронута', () => {
        const re = /\[data-theme="light"\] \.ws-grid tbody td\.ws-cell \{[^}]*background:\s*#FFFFFF;[^}]*\}/;
        assertTrue(re.test(INDEX_SRC), 'пустые ячейки шахматки светлой темы — #FFFFFF');
    });
});

// ============================================================
// 2. SRC + VM: значок раскрытия приколот при прокрутке (заявка 2)
// ============================================================
describe('Task 381 — SRC: прикол значка _barExpSync', () => {

    test('флаг _barExpPin + слушатель scroll + translateY', () => {
        const m = methodText(WS_SRC, '_barExpSync');
        assertTrue(m.length > 0, 'метод найден');
        assertTrue(m.indexOf('if (!el._barExpPin)') !== -1,
            'флаг-гейт: слушатель вешается один раз');
        assertTrue(m.indexOf("el.addEventListener('scroll'") !== -1,
            "слушатель scroll на элементе окна");
        // Task 465: transform теперь в переменной tNow (прикол ставится
        // ОБОИМ значкам окна мероприятий — раскрытие и печать)
        assertTrue(m.indexOf("var tNow = 'translateY(' + el.scrollTop + 'px)';") !== -1,
            'transform ставится при каждом sync ((пере)создание значков)');
        assertTrue(m.indexOf("'translateY(' + el.scrollTop + 'px)'") !== -1,
            'компенсация прокрутки — translateY(scrollTop)');
        assertTrue(m.indexOf("el.querySelector('.ws-bar-print')") !== -1,
            'Task 465: прикол и значка печати');
    });

    test('значок остаётся absolute в правом ВЕРХНЕМ углу (Task 388; Task 465: 3px от края)', () => {
        const b = ruleBlock('.ws-bar-exp {');
        assertTrue(b !== null && /position:\s*absolute/.test(b) &&
                   /right:\s*2px/.test(b) && /top:\s*2px/.test(b),
            'правый ВЕРХНИЙ угол, absolute (Task 388: верх при раскрытии не двигается; Task 465: 2px + 1px рамка = 3px от края окна)');
    });
});

describe('Task 381 — VM: значок при прокрутке', () => {

    const METHODS = ['_barExpSync', '_barExpToggle'];
    const texts = METHODS.map(n => methodText(WS_SRC, n));
    assertTrue(texts.every(t => t.length > 0), 'методы _barExp* найдены');

    function loadHost() {
        return new Function('document',
            'return ({' + texts.join('\n') + '\n});')({
                getElementById: function() { return null; },
                createElement: function() { return mkBtn(); }
            });
    }

    function mkBtn() {
        const cls = [];
        return {
            tagName: 'BUTTON', style: {}, type: '', className: '',
            innerHTML: '', attrs: {}, onclick: null,
            classList: {
                contains: function(c) { return cls.indexOf(c) !== -1; },
                add: function(c) { if (cls.indexOf(c) === -1) cls.push(c); },
                remove: function(c) {
                    const i = cls.indexOf(c);
                    if (i !== -1) cls.splice(i, 1);
                },
                toggle: function(c, on) {
                    const i = cls.indexOf(c);
                    if (on === undefined) on = i === -1;
                    if (on && i === -1) cls.push(c);
                    if (!on && i !== -1) cls.splice(i, 1);
                }
            },
            setAttribute: function(k, v) { this.attrs[k] = v; }
        };
    }

    function mkPanel(scrollH) {
        const cls = [];
        let btn = null;
        const listeners = {};
        const el = {
            scrollHeight: scrollH,
            clientHeight: 95,
            scrollTop: 0,
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
                (listeners[type] = listeners[type] || []).push(fn);
            }
        };
        el._btn = function() { return btn; };
        el._fireScroll = function() {
            (listeners.scroll || []).forEach(function(fn) { fn(); });
        };
        el._nScroll = function() { return (listeners.scroll || []).length; };
        el._cls = cls;
        return el;
    }

    test('слушатель scroll — ровно ОДИН (sync сколько угодно)', () => {
        const host = loadHost();
        const el = mkPanel(250);
        host._barExpSync(el);
        assertEqual(el._nScroll(), 1, 'после первого sync — 1 слушатель');
        host._barExpSync(el);
        host._barExpSync(el);
        assertEqual(el._nScroll(), 1, 'повторные sync слушатель не дублируют');
        assertEqual(el._btn().style.transform, 'translateY(0px)',
            'scrollTop=0 — transform нулевой');
    });

    test('scroll → transform = translateY(N) на текущем значке', () => {
        const host = loadHost();
        const el = mkPanel(400);
        host._barExpSync(el);
        el.scrollTop = 120;
        el._fireScroll();
        assertEqual(el._btn().style.transform, 'translateY(120px)',
            'значок скомпенсировал прокрутку 120px');
        el.scrollTop = 305;      // почти конец (400-95)
        el._fireScroll();
        assertEqual(el._btn().style.transform, 'translateY(305px)',
            'значок на месте и у конца прокрутки');
    });

    test('«перерисовка»: значок пересоздан — sync восстанавливает transform', () => {
        const host = loadHost();
        const el = mkPanel(400);
        host._barExpSync(el);
        el.scrollTop = 88;
        el._fireScroll();
        assertEqual(el._btn().style.transform, 'translateY(88px)',
            'до перерисовки — компенсация стоит');
        // innerHTML заменён: старый значок УНИЧТОЖЕН (querySelector →
        // null), appendChild кладёт НОВЫЙ (пустой style) — sync
        // обязан поставить transform с ТЕКУЩИМ scrollTop
        let fresh = null;
        el.querySelector = function(sel) {
            return (sel === '.ws-bar-exp' && fresh) ? fresh : null;
        };
        el.appendChild = function(node) { fresh = node; };
        host._barExpSync(el);
        assertTrue(!!fresh, 'значок создан заново');
        assertEqual(fresh.style.transform, 'translateY(88px)',
            'новый значок родился с актуальной компенсацией');
    });

    test('регресс: раскрытие/габарит бара Task 379 не сломаны', () => {
        const host = loadHost();
        const el = mkPanel(250);
        host._barExpSync(el);
        host._barExpToggle(el);
        assertEqual(el.style.height, '250px', 'высота = scrollHeight');
        assertEqual(el.style.marginBottom, '-155px', 'маржа 95 − 250 (бар 95px)');
        host._barExpToggle(el);
        assertEqual(el.style.height, '', 'свёрнуто: высота из CSS (95px)');
        assertEqual(el.style.marginBottom, '', 'маржа сброшена');
    });
});

// ============================================================
// 3. CSS: мероприятия — общий фон окна вместо плашек (заявка 3)
// ============================================================
describe('Task 381 — CSS: общий фон окна мероприятий', () => {

    test('.ws-events-panel: gap 0 — правило ПОСЛЕ тинтов Task 380', () => {
        const iGap = INDEX_SRC.indexOf('.ws-events-panel { gap: 0; }');
        const iLast = INDEX_SRC.indexOf('[data-theme="light"] .ws-ep-item.ws-ep-past {');
        assertTrue(iGap !== -1, 'правило gap: 0 есть');
        assertTrue(iLast !== -1 && iGap > iLast,
            'правило ПОСЛЕ последнего тинта — побеждает базовый gap: 3px (Task 315)');
        // базовое правило Task 315 не переписано — gap там остался
        const base = INDEX_SRC.match(/\.ws-events-panel \{[^}]*gap:\s*3px[^}]*\}/);
        assertTrue(!!base, 'базовое правило окна (Task 315) не тронуто');
    });

    test('склейка строк: > * + * 3px, соседние .ws-ep-item — 0', () => {
        const a = ruleBlock('.ws-events-panel > * + * {');
        assertTrue(a !== null && /margin-top:\s*3px/.test(a),
            'заголовок/«нет мероприятий»/значок — отступ 3px сверху');
        const m = ruleBlock('.ws-events-panel .ws-ep-item + .ws-ep-item {');
        assertTrue(m !== null && /margin-top:\s*0/.test(m),
            'соседние строки мероприятий склеены (margin-top: 0)');
    });

    test('строка до КРАЁВ окна: padding 3px 10px / margin 0 -10px', () => {
        const b = INDEX_SRC.match(/\.ws-ep-item \{[^{}]*padding:\s*3px 10px;[^{}]*margin:\s*0 -10px;[^{}]*background:\s*rgba\(0, 0, 0, 0\.45\);[^{}]*\}/);
        assertTrue(!!b, 'строка расходится до краёв (паддинги окна 10px погашены)');
    });

    test('регресс: тинты Task 380 — текущие/будущие живы; прошедшие — Task 389 transparent', () => {
        assertTrue(/\.ws-ep-item\.ws-ep-past \{[^}]*background:\s*transparent;/.test(INDEX_SRC),
            'прошедшие тёмная — transparent (Task 389: общий фон окна)');
        assertTrue(/\[data-theme="light"\] \.ws-ep-item \{[^}]*rgba\(0, 0, 0, 0\.12\)/.test(INDEX_SRC),
            'текущие светлая — 0.12');
        assertTrue(/\[data-theme="light"\] \.ws-ep-item\.ws-ep-past \{[^}]*background:\s*transparent;/.test(INDEX_SRC),
            'прошедшие светлая — transparent (Task 389)');
    });

    test('окно «Нормы» НЕ тронуто (свои gap-ы, без склейки)', () => {
        const cal = INDEX_SRC.match(/\.ws-cal-panel \{[^}]*gap:\s*0[^}]*\}/);
        assertFalse(!!cal, 'у .ws-cal-panel нет gap: 0');
        assertFalse(/\.ws-cal-panel > \*\s*\+\s*\*/.test(INDEX_SRC),
            'правил склейки для норм нет');
        assertFalse(/\.ws-cal-panel \.ws-ep-item/.test(INDEX_SRC),
            'строк мероприятий в нормах нет');
    });
});

// ============================================================
// 4. SW
// ============================================================
describe('Task 381 — SW', () => {

    test('SW: kipia-test-v756', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v756'") !== -1,
            'версия кэша kipia-test-v756');
        assertFalse(SW_SRC.indexOf('kipia-test-v757') !== -1,
            'двойного бампа нет');
    });
});
