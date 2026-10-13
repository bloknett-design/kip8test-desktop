// tests/test-task378.js
// Task 378 — заявки пользователя:
//   «Фон пустых ячеек сделай #FFFFFF. В ячейках итогов учёта, там где
//    нуль, сделать просто пустыми, и разделительные полосы ячеект
//    сделай как в основной шахматке. При включённом подсвечивании
//    перекрестья, сделай также подсвечивание строк при наведении
//    указателя мышки на ячейку с фамилией сотрудника и на ячейки
//    итогов учёта, подсветку перекрестья сделай такой же яркости как
//    подсветку текущего дня. Так же в окнах мероприятий и норм,
//    расположенных в баре с кнопками, убери боковую полосу прокрутки
//    (останется только свайпом или колёсиком мыши, или кнопками
//    вверх-вниз на клавиатуре), а вместо неё, в правом нижнем углу
//    окон размести значок для полного раскрытия окна со смещением его
//    нижней части в низ по количеству текста в окне, значок должен
//    менять контрастность если он не активен.»
//
// ЧТО ПРОВЕРЯЕТСЯ (после Task 381 — «фон итогов верни как был до
//     белого»): ячейки значений итогов — ПРОЗРАЧНЫЕ (правила
//     #FFFFFF/#eef0f2+#141413 Task 378 УДАЛЕНЫ), зебра строк
//     ВОССТАНОВЛЕНА (Task 322), тёмные цветные колонки — базовая
//     палитра; линии = шахматка: значения rgba(0,0,0,0.30) /
//     rgb(10,15,23), шапка сталь rgba(140,158,188,0.55)/
//     rgb(83,96,117), «Сотрудник» rgba(105,130,160,0.55)/
//     rgb(64,80,102) — остаются от Task 378.
//   JS итоги: нули месячной таблицы — ПУСТЫЕ ячейки (VM).
//   CSS перекрестье: строка/столбец 0.30/0.22 = «сегодня» (0.30/0.22),
//     пересечение 0.34/0.26, ФИО-ячейка 0.30/0.22, шапка hover-col
//     0.40/0.26 = «сегодня», sel-col 0.44/0.30; строка шторки итогов
//     0.30/0.22.
//   JS перекрестье: делегирование ловит td.ws-cell, td.ws-emp-col
//     (ФИО — строка без столбца); слушатели на #wsTtBody/
//     #wsTtPageBody (ячейки итогов → _rowHover, архив .ws-tt-arch
//     мимо, гейт _crossOn).
//   CSS/HTML окна бара: полоса прокрутки скрыта (scrollbar-width:
//     none + ::-webkit-scrollbar display:none, оба окна), tabindex="0"
//     (клавиатурный скролл), значок .ws-bar-exp: absolute правый
//     нижний угол, opacity 0.45 не активен / 1 при hover/focus/.on,
//     шеврон rotate(180deg), transition высоты окон.
//   JS окна: _barExpSync (создание значка, видимость по переполнению
//     95px+2, пересчёт высоты в раскрытом состоянии под НОВЫЙ текст,
//     свёртывание при исчезновении переполнения), _barExpToggle
//     (раскрытие = scrollHeight, свёртывание = 95px), вызовы после
//     рендеров (мероприятия/нормы), toggleMobPanel/ресайз/fonts.ready.
//   SW: kipia-test-v731.
//
// Запуск: через tests/run-all.js (require './test-task378.js').

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
// 1. CSS: итоги учёта — фоны/линии как в основной шахматке
// ============================================================
describe('Task 378 — итоги: ячейки #FFFFFF, линии шахматки', () => {

    test('Task 381: ячейки значений — БЕЗ фона (как до белого)', () => {
        // «Фон итогов верни как был до белого»: правила Task 378
        // (#FFFFFF светлая / #eef0f2+brightness+#141413 тёмная)
        // удалены — ячейки прозрачные, сквозь них фон панели + зебра
        const bl = ruleBlock('[data-theme="light"] .ws-tt-table tbody td.ws-tt-num {');
        assertTrue(bl === null,
            'светлая: правила фона ячеек итогов больше нет (прозрачные)');
        const bd = ruleBlock('[data-theme="dark"] .ws-tt-table tbody td.ws-tt-num {');
        assertTrue(bd === null,
            'тёмная: правила фона/цвета/фильтра ячеек итогов нет');
    });

    test('линии: базовые th/td — цвет дней шахматки', () => {
        const b = ruleBlock('.ws-tt-table th,\n    .ws-tt-table td {');
        assertTrue(b !== null && /border-bottom:\s*1px solid rgba\(0, 0, 0, 0\.30\)/.test(b) &&
                   /border-right:\s*1px solid rgba\(0, 0, 0, 0\.30\)/.test(b),
            'тёмная: rgba(0,0,0,0.30) — цвет ячеек дней сетки');
        const l = ruleBlock('[data-theme="light"] .ws-tt-table th,\n    [data-theme="light"] .ws-tt-table td {');
        assertTrue(l !== null && /rgb\(10, 15, 23\)/.test(l),
            'светлая: rgb(10,15,23) — непрозрачный цвет дней (Task 377)');
    });

    test('линии: шапка — сталь, как шапка сетки', () => {
        const b = ruleBlock('.ws-tt-table thead th {');
        assertTrue(b !== null && /rgba\(140, 158, 188, 0\.55\)/.test(b),
            'тёмная шапка: rgba(140,158,188,0.55)');
        const l = ruleBlock('[data-theme="light"] .ws-tt-table thead th {');
        assertTrue(l !== null && /rgb\(83, 96, 117\)/.test(l),
            'светлая шапка: rgb(83,96,117) (Task 377)');
    });

    test('линии: колонка «Сотрудник» — сталь ФИО сетки', () => {
        const b = ruleBlock('.ws-tt-table tbody td.ws-tt-emp {');
        assertTrue(b !== null && /rgba\(105, 130, 160, 0\.55\)/.test(b),
            'тёмная: rgba(105,130,160,0.55)');
        const l = ruleBlock('[data-theme="light"] .ws-tt-table tbody td.ws-tt-emp {');
        assertTrue(l !== null && /rgb\(64, 80, 102\)/.test(l),
            'светлая: rgb(64,80,102)');
    });

    test('Task 381: зебра строк итогов ВОССТАНОВЛЕНА (как до белого)', () => {
        const z = ruleBlock('.ws-tt-table tbody tr:nth-child(even) {');
        assertTrue(z !== null && /rgba\(255, 255, 255, 0\.09\)/.test(z),
            'тёмная: чётные строки заметно светлее (Task 322)');
        const zl = ruleBlock('[data-theme="light"] .ws-tt-table tbody tr:nth-child(even) {');
        assertTrue(zl !== null && /rgba\(0, 0, 0, 0\.07\)/.test(zl),
            'светлая: чётные строки чуть темнее (Task 322)');
    });

    test('Task 381: тёмные цветные колонки — базовая палитра (как до белого)', () => {
        // переопределения Task 378 ([data-theme="dark"] Часы/Переработка
        // палитрой светлой) удалены — работают базовые правила
        assertFalse(/\[data-theme="dark"\] \.ws-tt-table td\.ws-tt-hours\s*\{/.test(INDEX_SRC),
            'тёмного переопределения «Часов» больше нет');
        assertFalse(/\[data-theme="dark"\] \.ws-tt-table td\.ws-tt-over\s*\{/.test(INDEX_SRC),
            'тёмного переопределения «Переработки» больше нет');
        const h = INDEX_SRC.match(/\n    \.ws-tt-table td\.ws-tt-hours\s*\{[^}]*\}/);
        assertTrue(!!h && h[0].indexOf('#4ac771') !== -1,
            'Часы: базовый зелёный тёмной темы (#4ac771)');
        const o = INDEX_SRC.match(/\n    \.ws-tt-table td\.ws-tt-over\s*\{[^}]*\}/);
        assertTrue(!!o && o[0].indexOf('#e0a23c') !== -1,
            'Переработка: базовый янтарный тёмной темы (#e0a23c)');
    });

    test('строка шторки итогов — яркость «сегодня»', () => {
        const b = ruleBlock('.ws-tt-table tbody tr.ws-hover-row td {');
        assertTrue(b !== null && /rgba\(74, 143, 199, 0\.30\)/.test(b),
            'тёмная: 0.30 = «сегодня»');
        const l = ruleBlock('[data-theme="light"] .ws-tt-table tbody tr.ws-hover-row td {');
        assertTrue(l !== null && /rgba\(42, 93, 143, 0\.22\)/.test(l),
            'светлая: 0.22 = «сегодня»');
    });
});

// ============================================================
// 2. CSS: перекрестье = яркость «сегодня» (шапка + сел)
// ============================================================
describe('Task 378 — перекрестье: яркость = «сегодня»', () => {

    test('шапка: hover-col 0.40/0.26 (= «сегодня»), sel-col 0.44/0.30', () => {
        const h = ruleBlock('.ws-grid thead th.ws-day-col.ws-hover-col {');
        assertTrue(h !== null && /rgba\(74, 143, 199, 0\.40\)/.test(h),
            'тёмная hover-col: 0.40 = today-col');
        const s = ruleBlock('.ws-grid thead th.ws-day-col.ws-sel-col {');
        assertTrue(s !== null && /rgba\(74, 143, 199, 0\.44\)/.test(s),
            'тёмная sel-col: 0.44 (выбранный насыщеннее)');
        const lh = ruleBlock('[data-theme="light"] .ws-grid thead th.ws-day-col.ws-hover-col {');
        assertTrue(lh !== null && /rgba\(42, 93, 143, 0\.26\)/.test(lh),
            'светлая hover-col: 0.26 = today-col');
        const ls = ruleBlock('[data-theme="light"] .ws-grid thead th.ws-day-col.ws-sel-col {');
        assertTrue(ls !== null && /rgba\(42, 93, 143, 0\.30\)/.test(ls),
            'светлая sel-col: 0.30 (выбранный насыщеннее)');
    });

    test('тело: столбец/строка/выбор = 0.30 (тёмная), 0.22 (светлая)', () => {
        const h = ruleBlock('.ws-grid tbody td.ws-cell.ws-hover {');
        assertTrue(h !== null && /rgba\(74, 143, 199, 0\.30\)/.test(h), 'тёмный столбец 0.30');
        const r = ruleBlock('.ws-grid tbody tr.ws-hover-row td.ws-cell {');
        assertTrue(r !== null && /rgba\(74, 143, 199, 0\.30\)/.test(r), 'тёмная строка 0.30');
        const e = ruleBlock('.ws-grid tbody tr.ws-hover-row td.ws-emp-col {');
        assertTrue(e !== null && /rgba\(74, 143, 199, 0\.30\)/.test(e), 'тёмная ФИО 0.30');
        const lr = ruleBlock('[data-theme="light"] .ws-grid tbody tr.ws-hover-row td.ws-cell {');
        assertTrue(lr !== null && /rgba\(42, 93, 143, 0\.22\)/.test(lr), 'светлая строка 0.22');
        const le = ruleBlock('[data-theme="light"] .ws-grid tbody tr.ws-hover-row td.ws-emp-col {');
        assertTrue(le !== null && /rgba\(42, 93, 143, 0\.22\)/.test(le), 'светлая ФИО 0.22');
    });

    test('пересечения: 0.34/0.26, строка+сегодня 0.34/0.26, тройное 0.36/0.28', () => {
        const x = ruleBlock('.ws-grid tbody tr.ws-hover-row td.ws-cell.ws-hover {');
        assertTrue(x !== null && /rgba\(74, 143, 199, 0\.34\)/.test(x), 'пересечение 0.34');
        const rt = ruleBlock('.ws-grid tbody tr.ws-hover-row td.ws-cell.ws-today {');
        assertTrue(rt !== null && /rgba\(74, 143, 199, 0\.34\)/.test(rt), 'строка+сегодня 0.34');
        const rt3 = ruleBlock('.ws-grid tbody tr.ws-hover-row td.ws-cell.ws-today.ws-hover {');
        assertTrue(rt3 !== null && /rgba\(74, 143, 199, 0\.36\)/.test(rt3), 'тройное 0.36');
        const lx = ruleBlock('[data-theme="light"] .ws-grid tbody tr.ws-hover-row td.ws-cell.ws-hover {');
        assertTrue(lx !== null && /rgba\(42, 93, 143, 0\.26\)/.test(lx), 'светлое пересечение 0.26');
        const lrt = ruleBlock('[data-theme="light"] .ws-grid tbody tr.ws-hover-row td.ws-cell.ws-today {');
        assertTrue(lrt !== null && /rgba\(42, 93, 143, 0\.26\)/.test(lrt), 'светлая строка+сегодня 0.26');
        const lrt3 = ruleBlock('[data-theme="light"] .ws-grid tbody tr.ws-hover-row td.ws-cell.ws-today.ws-hover {');
        assertTrue(lrt3 !== null && /rgba\(42, 93, 143, 0\.28\)/.test(lrt3), 'светлое тройное 0.28');
    });
});

// ============================================================
// 3. JS: перекрестье — ФИО и ячейки итогов
// ============================================================
describe('Task 378 — JS: подсветка строк с ФИО и итогов', () => {

    test('делегирование сетки ловит и ячейку ФИО', () => {
        const init = methodText(WS_SRC, 'init');
        assertTrue(init.indexOf("e.target.closest('td.ws-cell, td.ws-emp-col')") !== -1,
            'mouseover: closest(td.ws-cell, td.ws-emp-col)');
        assertTrue(init.indexOf("to.closest('td.ws-cell, td.ws-emp-col')") !== -1,
            'mouseout: тот же состав');
        assertTrue(init.indexOf("td.classList.contains('ws-cell')") !== -1,
            'ФИО → день не определён (строка без столбца)');
    });

    test('слушатели на телах итогов (шторка + мобильная страница)', () => {
        const init = methodText(WS_SRC, 'init');
        assertTrue(init.indexOf("getElementById('wsTtBody')") !== -1 &&
                   init.indexOf("getElementById('wsTtPageBody')") !== -1,
            'оба тела: #wsTtBody и #wsTtPageBody');
        const iOver = init.indexOf("ttBody.addEventListener('mouseover'");
        const iOut = init.indexOf("ttBody.addEventListener('mouseout'");
        assertTrue(iOver !== -1 && iOut !== -1, 'mouseover + mouseout на теле итогов');
        assertTrue(init.indexOf("e.target.closest('tbody td')") !== -1,
            'ячейка итогов — closest(tbody td)');
        assertTrue(init.indexOf("self._rowHover(ri);") !== -1,
            'наведение на итоги → _rowHover (строка сетки И итогов)');
        assertTrue(init.indexOf("classList.contains('ws-tt-arch')") !== -1,
            'архивная таблица года — мимо (строки ≠ сетке)');
    });

    test('гейт перекрестья действует и на итоги', () => {
        const init = methodText(WS_SRC, 'init');
        const iBody = init.indexOf("ttBody.addEventListener('mouseover'");
        const chunk = init.slice(iBody, iBody + 400);
        assertTrue(chunk.indexOf('self._crossOn === false') !== -1,
            'выключенное перекрестье не подсвечивает итоги');
    });
});

// ============================================================
// 4. HTML/CSS: окна бара — без полосы прокрутки + значок
// ============================================================
describe('Task 378 — окна бара: без полосы, значок раскрытия', () => {

    test('полоса прокрутки скрыта в обоих окнах (оба движка)', () => {
        const ev = INDEX_SRC.match(/\.ws-events-panel \{[^}]*scrollbar-width:\s*none[^}]*\}/);
        assertTrue(!!ev && /-ms-overflow-style:\s*none/.test(ev[0]),
            'мероприятия: Firefox/IE — полосы нет (правило Task 378)');
        const cal = INDEX_SRC.match(/\.ws-cal-panel \{[^}]*scrollbar-width:\s*none[^}]*\}/);
        assertTrue(!!cal && /-ms-overflow-style:\s*none/.test(cal[0]),
            'нормы: Firefox/IE — полосы нет');
        const wk = INDEX_SRC.match(/\.ws-events-panel::-webkit-scrollbar,\s*\n\s*\.ws-cal-panel::-webkit-scrollbar\s*\{[^}]*display:\s*none[^}]*\}/);
        assertTrue(!!wk, 'Chromium: ::-webkit-scrollbar display:none (оба окна)');
        // скролл ОСТАЛСЯ (колесо/свайп/клавиши): overflow-y: auto жив
        const evBase = INDEX_SRC.match(/\.ws-events-panel \{[^}]*overflow-y:\s*auto[^}]*\}/);
        assertTrue(!!evBase, 'скролл-контейнер жив (полосу только СКРЫЛИ)');
    });

    test('tabindex: окна фокусируемы — клавиатурный скролл ↑↓', () => {
        assertTrue(INDEX_SRC.indexOf('id="wsEventsPanel" class="ws-events-panel" hidden tabindex="0"') !== -1,
            'окно мероприятий: tabindex="0"');
        assertTrue(INDEX_SRC.indexOf('id="wsCalPanel" class="ws-cal-panel" hidden tabindex="0"') !== -1,
            'окно норм: tabindex="0"');
    });

    test('значок .ws-bar-exp: правый ВЕРХНИЙ угол, контраст по активности (Task 388)', () => {
        const b = ruleBlock('.ws-bar-exp {');
        assertTrue(b !== null && /position:\s*absolute/.test(b), 'absolute');
        assertTrue(b !== null && /right:\s*2px/.test(b) && /top:\s*2px/.test(b),
            'правый ВЕРХНИЙ угол окна (Task 388: прежде нижний; Task 465: 2px+рамка = 3px от края)');
        assertTrue(b !== null && /opacity:\s*0\.45/.test(b),
            'НЕ активен — приглушён контрастом (0.45)');
        const hov = INDEX_SRC.match(/\.ws-bar-exp:hover,\s*\n\s*\.ws-bar-exp:focus-visible\s*\{[^}]*opacity:\s*1[^}]*\}/);
        assertTrue(!!hov, 'наведение/фокус — полная контрастность');
        const on = INDEX_SRC.match(/\.ws-bar-exp\.on\s*\{[^}]*opacity:\s*1[^}]*\}/);
        assertTrue(!!on, 'раскрытое состояние (.on) — контрастно');
        const rot = INDEX_SRC.match(/\.ws-bar-exp\.on svg\s*\{[^}]*rotate\(180deg\)[^}]*\}/);
        assertTrue(!!rot, 'шеврон поворачивается на 180°');
    });

    test('плавное раскрытие: transition высоты обоих окон', () => {
        const ev = INDEX_SRC.match(/\.ws-events-panel \{[^}]*transition:\s*height[^}]*\}/);
        assertTrue(!!ev, 'мероприятия: transition height');
        const cal = INDEX_SRC.match(/\.ws-cal-panel \{[^}]*transition:\s*height[^}]*\}/);
        assertTrue(!!cal, 'нормы: transition height');
        // якорь значка — position: relative на обоих окнах
        const pr = INDEX_SRC.match(/\.ws-events-panel \{[^}]*position:\s*relative[^}]*\}/);
        const pc = INDEX_SRC.match(/\.ws-cal-panel \{[^}]*position:\s*relative[^}]*\}/);
        assertTrue(!!pr && !!pc, 'position: relative — якорь значка');
    });
});

// ============================================================
// 5. JS: _barExpSync/_barExpToggle — логика значка (VM)
// ============================================================
describe('Task 378 — VM: значок раскрытия окон', () => {

    const METHODS = ['_barExpSync', '_barExpToggle'];
    const texts = METHODS.map(n => methodText(WS_SRC, n));
    assertTrue(texts.every(t => t.length > 0), 'методы _barExp* найдены');

    function loadHost() {
        return new Function('document',
            'return ({' + texts.join('\n') + '\n});')(mockDoc({}));
    }

    test('создание значка + видимость при переполнении', () => {
        const host = loadHost();
        const el = mkPanel(250);
        host._barExpSync(el);
        const btn = el._btn();
        assertTrue(!!btn, 'значок создан (кнопка .ws-bar-exp)');
        assertEqual(btn.className, 'ws-bar-exp', 'класс значка');
        assertTrue(btn.style.display === '', 'значок ВИДЕН (текст не влезает)');
        assertFalse(btn.classList.contains('on'), 'не активен (свёрнуто)');
        assertTrue(btn.onclick !== null && typeof btn.onclick === 'function',
            'клик назначен');
        // повторный sync — значок НЕ дублируется
        host._barExpSync(el);
        assertEqual(el._btn(), btn, 'повторный sync не создаёт второй значок');
    });

    test('без переполнения значок скрыт', () => {
        const host = loadHost();
        const el = mkPanel(80);   // < 97 = 95px + допуск
        host._barExpSync(el);
        assertEqual(el._btn().style.display, 'none', 'текст влез — значок спрятан');
    });

    test('клик: раскрытие = scrollHeight, повторный = 95px', () => {
        const host = loadHost();
        const el = mkPanel(250);
        host._barExpSync(el);
        host._barExpToggle(el);
        assertTrue(el._cls.indexOf('ws-bar-open') !== -1, 'класс ws-bar-open');
        assertEqual(el.style.height, '250px',
            'низ смещается вниз по количеству текста (250px)');
        assertTrue(el._btn().classList.contains('on'), 'значок активен (контраст)');
        host._barExpToggle(el);
        assertFalse(el._cls.indexOf('ws-bar-open') !== -1, 'класс снят');
        assertEqual(el.style.height, '', 'высота возвращена (CSS 95px)');
        assertFalse(el._btn().classList.contains('on'), 'значок снова приглушён');
    });

    test('раскрытое окно + НОВЫЙ текст — низ следует за объёмом', () => {
        const host = loadHost();
        const el = mkPanel(250);
        host._barExpSync(el);
        host._barExpToggle(el);
        assertEqual(el.style.height, '250px', 'раскрыто на 250px');
        el.scrollHeight = 310;      // перерисовка с бОльшим текстом
        host._barExpSync(el);
        assertEqual(el.style.height, '310px', 'низ уехал на 310px (по тексту)');
        el.scrollHeight = 80;       // текст перестал переполнять
        host._barExpSync(el);
        assertFalse(el._cls.indexOf('ws-bar-open') !== -1,
            'переполнения нет — окно свернулось само');
        assertEqual(el._btn().style.display, 'none', 'значок спрятан');
    });
});

// ============================================================
// 6. JS: нули итогов → пустые ячейки (VM)
// ============================================================
describe('Task 378 — VM: нули итогов — пустые ячейки', () => {

    test('_renderTotalsMonth: 0 → пусто, ненулевые — на месте', () => {
        const els = {
            wsTtBody: { innerHTML: '', minWidth: null,
                        querySelector: function() {
                            return { style: { minWidth: '' } };
                        } },
            wsTtWarn: { textContent: '', hidden: true, attrs: {},
                        setAttribute: function(k, v) { this.attrs[k] = v; } }
        };
        const MONTH_METHODS = ['_codeHours', '_totalsZero', '_totalsAgg', '_statusMeta',
                               '_empTypeMap', '_overHours', '_totalsEffectiveEntries',
                               '_fmtTotalsNum', '_esc', '_setTtWarn', '_renderTotalsMonth'];
        const host = new Function('document', 'return ({' +
            MONTH_METHODS.map(function(n) { return methodText(WS_SRC, n); }).join('\n') +
            '\n' +
            '_totalsExtra: false,' +
            '_year: 2026, _month: 9,' +
            '_applyTtHeadVar: function() { return false; },' +
            '_fitGrid: function() {},' +
            '_syncTotalsRows: function() {},' +
            '_hoverRow: null,' +
            '_EMPLOYEES: [' +
            "  { 'таб_номер': '0871', 'ФИО': 'Иванов И.И.', 'тип': 'сменный' }," +
            "  { 'таб_номер': '023', 'ФИО': 'Петров П.П.', 'тип': 'дневной' }" +
            '],' +
            // у Иванова Д 03.09 (явки 1, часы 12), у Петрова — пусто
            "_ENTRIES: [ { 'дата': '2026-09-03', 'таб_номер': '0871', 'статус': 'Д', 'источник': 'авто' } ]," +
            '_PENDING: {},' +
            '_STATUS_CODES: [] });')(mockDoc(els));
        host._renderTotalsMonth();
        const h = els.wsTtBody.innerHTML;
        // Иванов: ненулевые значения остаются
        const ivanov = h.slice(h.indexOf('Иванов И.И.'), h.indexOf('Петров П.П.'));
        assertTrue(/<td class="ws-tt-num">1<\/td>/.test(ivanov), 'явки 1 — на месте');
        assertTrue(/ws-tt-hours[^>]*>12<\/td>/.test(ivanov), 'часы 12 — на месте');
        // НОЛИ — ПУСТЫЕ: ни одного ">0<" в ячейках значений
        assertFalse(/>0<\/td>/.test(h), 'нулей в ячейках итогов НЕТ (пусто)');
        // Петров: все нули → пустые ячейки
        const petrov = h.slice(h.indexOf('Петров П.П.'));
        assertTrue(/<td class="ws-tt-num"><\/td>/.test(petrov),
            'пустая ячейка вместо нуля');
        assertFalse(/>0</.test(petrov), 'у Петрова нет нулей');
    });

    test('SRC: ветка пустого значения в рендере', () => {
        const m = methodText(WS_SRC, '_renderTotalsMonth');
        assertTrue(m.indexOf('var txt = v') !== -1 &&
                   m.indexOf("''") !== -1,
            'нулевое значение → пустая строка');
    });
});

// ============================================================
// 7. JS: вызовы _barExp* из рендеров и внешних событий
// ============================================================
describe('Task 378 — вызовы значка после рендеров/событий', () => {

    test('_renderMonthEventsPanel завершается пересчётом значка', () => {
        const m = methodText(WS_SRC, '_renderMonthEventsPanel');
        assertTrue(m.indexOf('this._barExpSync(el);') !== -1,
            'после innerHTML окна мероприятий — _barExpSync');
    });

    test('ProdCalendar.renderPanel зовёт WorkSchedule._barExpSync', () => {
        const PC = INDEX_SRC.slice(INDEX_SRC.indexOf('var ProdCalendar = {'));
        const m = methodText(PC, 'renderPanel');
        assertTrue(m.indexOf('WorkSchedule._barExpSync(el)') !== -1,
            'окно норм — тот же значок (метод WorkSchedule)');
    });

    test('toggleMobPanel: показ окна чипом — пересчёт', () => {
        const m = methodText(WS_SRC, 'toggleMobPanel');
        assertTrue(m.indexOf('this._barExpSyncAll()') !== -1,
            'после показа окна — _barExpSyncAll');
    });

    test('ресайз и загрузка шрифта — пересчёт значков', () => {
        const afr = methodText(WS_SRC, '_attachFitResize');
        assertTrue(/window\.addEventListener\('resize'[\s\S]{0,500}self\._barExpSyncAll\(\)/.test(afr),
            'resize → _barExpSyncAll (в _attachFitResize)');
        const init = methodText(WS_SRC, 'init');
        assertTrue(/fonts\.ready\.then\([\s\S]{0,600}_barExpSyncAll/.test(init),
            'fonts.ready → _barExpSyncAll');
    });

    test('_barExpSyncAll: оба окна бара', () => {
        const m = methodText(WS_SRC, '_barExpSyncAll');
        assertTrue(m.indexOf("'wsEventsPanel'") !== -1 &&
                   m.indexOf("'wsCalPanel'") !== -1,
            'мероприятия + нормы');
    });
});

// ============================================================
// 8. SW-версия
// ============================================================
describe('Task 378 — SW и регресс', () => {

    test('SW: kipia-test-v731', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v731'") !== -1,
            'версия кэша kipia-test-v731');
        assertFalse(SW_SRC.indexOf('kipia-test-v732') !== -1,
            'двойного бампа нет');
    });

    test('регресс: зебра КОЛОНКИ ФИО сетки жива (своя фича)', () => {
        const b = ruleBlock('.ws-grid tbody tr:nth-child(even) td.ws-emp-col {');
        assertTrue(b !== null && /linear-gradient/.test(b),
            'зебра ФИО шахматки не тронута (Task 329)');
    });

    test('регресс: календарные попапы и окна не сломаны', () => {
        // прежние высоты/скролл-контейнеры живы (полосу только скрыли)
        const mq = INDEX_SRC.match(/@media \(min-width: 1024px\) \{[\s\S]*?\.ws-events-panel,\s*\n\s*\.ws-cal-panel \{[\s\S]*?\}/);
        assertTrue(!!mq && mq[0].indexOf('height: 95px') !== -1,
            'десктопные окна: 95px на месте');
        assertTrue(INDEX_SRC.indexOf('.ws-events-panel[hidden] { display: none; }') !== -1,
            'скрытие окон до данных живо');
    });
});
