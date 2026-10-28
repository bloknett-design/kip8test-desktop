// tests/test-task333.js
// Task 333 — заявка пользователя:
//   «В шторке итогов учёта, цвет фона шапки сделай как в шапке шахматки
//    табеля, разделительную горизонтальную полосу между ячейками учёта
//    сменных и дневных сотрудников сделай как в шахматке табеля между
//    ячейками сменных и дневных сотрудников. Перекрёстная подсветка
//    строк и столбцов ячеек табеля так же должна распространяться на
//    строки с ячейками в шторке итогов учёта. Кнопку переключения вида
//    подпиши "Вид". Архив в годовой таблице всё же нужен, обновление
//    данных только общей кнопкой "Обновить" тулбара. Разделительная
//    полоса между столбцом ФИО и ячейками шахматки должна быть со
//    стороны ячеек сотрудников, что бы при прокрутки шахматки она
//    не уходила.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   CSS шапка шторки: .ws-tt-table th — #1e293b (= шапка сетки,
//     Task 330), светлая — #bfcad5; ЯЧЕЙКА «Сотрудник» в ШАПКЕ
//     (thead th.ws-tt-emp) — тоже цвет шапки (#1e293b/#bfcad5),
//     НЕ фон тела #0e1621/#e9e7de.
//   CSS разделитель групп шторки: .ws-tt-table tbody tr.ws-group-first
//     td — border-top: 2px solid #4a8fc7 (светлая #6e8ba4) — как
//     tr.ws-group-first сетки (Task 259).
//   CSS подсветка строк шторки: .ws-tt-table tbody tr.ws-hover-row td —
//     inset-заливка rgba(74,143,199,0.10) (светлая rgba(42,93,143,
//     0.06)) — тот же приём/цвета, что у строки сетки (Task 319).
//   CSS ПОЛОСА ФИО: ::after у sticky-ячеек (thead th.ws-emp-col +
//     tbody td.ws-emp-col) — left: 100% (СО СТОРОНЫ ЯЧЕЕК), width 2px,
//     background #4a8fc7/#6e8ba4, pointer-events: none; прежний
//     border-right 2px (уезжал при прокрутке в border-collapse)
//     УДАЛЁН.
//   JS _rowClass: класс ws-hover-row ставится и на строку СЕТКИ, и на
//     строку ШТОРКИ с тем же индексом (в #wsTtBody); за пределами
//     числа строк — тихо.
//   JS _renderTotalsMonth: строке первого ДНЕВНОГО после сменных —
//     класс ws-group-first; штамп ws-hover-row из _hoverRow.
//   JS _renderTotalsYearTable: ГЛАВНАЯ таблица — шапка с «Сотрудником»
//     (десктоп CSS прячет .ws-tt-year:not(.ws-tt-arch)), штамп
//     ws-group-first/ws-hover-row; АРХИВ — ОТДЕЛЬНЫЙ БЛОК: подпись
//     .ws-tt-arch-cap «Архив» + таблица .ws-tt-arch (годовой
//     справочник минус активные, СВОЯ колонка «Сотрудник» на любом
//     экране); обновление — ТОЛЬКО кнопкой «Обновить» тулбара
//     (своей кнопки нет, kip8_ws_view/cross — прежние).
//   HTML: #wsViewBtn — ПОДПИСЬ «Вид» (span.ws-view-label после
//     иконок); CSS .ws-view-btn — width: auto + паддинги (не
//     квадрат-иконка), .ws-view-label — 13px/600.
//   SW: kipia-test-v761.
//
// Запуск: через tests/run-all.js (require './test-task333.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function ruleBlock(cssPart) {
    const needle = '\n    ' + cssPart;
    const i = INDEX_SRC.indexOf(needle);
    if (i === -1) return '';
    const rest = INDEX_SRC.slice(i + 1);
    const m = rest.match(/\n    \}/);
    return m ? rest.slice(0, m.index) : '';
}

// правило ВНУТРИ @media-блока — отступ 8 пробелов
function ruleBlockMedia(cssPart) {
    const needle = '\n        ' + cssPart;
    const i = INDEX_SRC.indexOf(needle);
    if (i === -1) return '';
    const rest = INDEX_SRC.slice(i + 1);
    const m = rest.match(/\n        \}/);
    return m ? rest.slice(0, m.index) : '';
}

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

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

function mkRow() {
    const cls = [];
    return {
        classes: cls,
        classList: {
            toggle: function(c, on) {
                const i = cls.indexOf(c);
                if (on && i === -1) cls.push(c);
                if (!on && i !== -1) cls.splice(i, 1);
            }
        }
    };
}

// ============================================================
// 1. CSS: шапка шторки = шапка шахматки
// ============================================================
describe('Task 333 — шапка шторки: цвет как у шапки сетки', () => {

    test('тёмная: .ws-tt-table th — background: #1e293b (как сетка)', () => {
        const block = ruleBlock('.ws-tt-table th {');
        assertTrue(block.length > 0, 'правило .ws-tt-table th найдено');
        assertTrue(/background:\s*#1e293b/.test(block),
            'фон шапки таблицы итогов — #1e293b (Task 330: шапка сетки)');
        assertFalse(/#131c28/.test(block), 'прежний #131c28 убран');
    });

    test('светлая: .ws-tt-table th — background: #bfcad5', () => {
        const block = ruleBlock('[data-theme="light"] .ws-tt-table th {');
        assertTrue(block.length > 0, 'светлое правило найдено');
        assertTrue(/background:\s*#bfcad5/.test(block),
            'светлая шапка шторки — #bfcad5 (= шапка сетки)');
        assertFalse(/#efede5/.test(block), 'прежний #efede5 убран');
    });

    test('ячейка «Сотрудник» В ШАПКЕ (thead th.ws-tt-emp) — цвет шапки', () => {
        const block = ruleBlock('.ws-tt-table thead th.ws-tt-emp {');
        assertTrue(block.length > 0, 'правило thead th.ws-tt-emp найдено');
        assertTrue(/background:\s*#1e293b/.test(block),
            'шапочная ячейка — #1e293b, НЕ фон тела #0e1621');
        const light = ruleBlock('[data-theme="light"] .ws-tt-table thead th.ws-tt-emp {');
        assertTrue(light.length > 0, 'светлое правило найдено');
        assertTrue(/background:\s*#bfcad5/.test(light),
            'светлая шапочная ячейка — #bfcad5');
    });
});

// ============================================================
// 2. CSS: разделитель групп в шторке — как в шахматке
// ============================================================
describe('Task 333 — разделитель сменных/дневных в шторке', () => {

    test('тёмная: .ws-tt-table tr.ws-group-first td — 2px #4a8fc7', () => {
        const block = ruleBlock('.ws-tt-table tbody tr.ws-group-first td {');
        assertTrue(block.length > 0, 'правило найдено');
        assertTrue(/border-top:\s*2px solid #4a8fc7/.test(block),
            'полоса 2px #4a8fc7 — как в шахматке (Task 259)');
    });

    test('светлая: 2px #6e8ba4', () => {
        const block = ruleBlock('[data-theme="light"] .ws-tt-table tbody tr.ws-group-first td {');
        assertTrue(block.length > 0, 'светлое правило найдено');
        assertTrue(/border-top:\s*2px solid #6e8ba4/.test(block),
            'светлая полоса 2px #6e8ba4');
    });
});

// ============================================================
// 3. CSS + JS: перекрёстная подсветка — строки шторки
// ============================================================
describe('Task 333 — подсветка строк шторки', () => {

    test('CSS: .ws-tt-table tr.ws-hover-row td — inset-заливка', () => {
        const block = ruleBlock('.ws-tt-table tbody tr.ws-hover-row td {');
        assertTrue(block.length > 0, 'правило найдено');
        assertTrue(/box-shadow:\s*inset 0 0 0 999px rgba\(74, 143, 199, 0\.30\)/.test(block),
            'тёмная — тот же тинт, что у строки сетки (Task 378: 0.30 = «сегодня»)');
        const light = ruleBlock('[data-theme="light"] .ws-tt-table tbody tr.ws-hover-row td {');
        assertTrue(light.length > 0, 'светлое правило найдено');
        assertTrue(/rgba\(42, 93, 143, 0\.22\)/.test(light),
            'светлая — тот же тинт, что у строки сетки (Task 378: 0.22 = «сегодня»)');
    });

    test('JS: _rowClass — класс ставится и в сетке, и в шторке', () => {
        const gridRows = [mkRow(), mkRow(), mkRow()];
        const ttRows = [mkRow(), mkRow(), mkRow()];
        const els = {
            wsGridWrap: {
                querySelectorAll: function(sel) {
                    return (sel === 'tbody tr') ? gridRows : [];
                }
            },
            wsTtBody: {
                querySelectorAll: function(sel) {
                    return (sel === '.ws-tt-table tbody tr') ? ttRows : [];
                }
            }
        };
        const host = new Function('document', 'return ({' +
            methodText(WS_CLIENT, '_rowClass') + '\n});')(mockDoc(els));
        host._rowClass(1, true);
        assertEqual(JSON.stringify(gridRows[1].classes),
            JSON.stringify(['ws-hover-row']), 'строка сетки 1 подсвечена');
        assertEqual(JSON.stringify(ttRows[1].classes),
            JSON.stringify(['ws-hover-row']), 'строка ШТОРКИ 1 подсвечена (заявка)');
        assertEqual(JSON.stringify(gridRows[0].classes),
            JSON.stringify([]), 'соседняя строка сетки чиста');
        host._rowClass(1, false);
        assertEqual(JSON.stringify(ttRows[1].classes), JSON.stringify([]),
            'снятие подсветки — в обеих таблицах');
    });

    test('JS: _rowClass — за пределами строк шторки тихо (архив года)', () => {
        const gridRows = [mkRow(), mkRow()];
        const ttRows = [mkRow()];   // в шторке МЕНЬШЕ строк
        const els = {
            wsGridWrap: {
                querySelectorAll: function(sel) {
                    return (sel === 'tbody tr') ? gridRows : [];
                }
            },
            wsTtBody: {
                querySelectorAll: function(sel) {
                    return (sel === '.ws-tt-table tbody tr') ? ttRows : [];
                }
            }
        };
        const host = new Function('document', 'return ({' +
            methodText(WS_CLIENT, '_rowClass') + '\n});')(mockDoc(els));
        host._rowClass(1, true);   // строки шторки нет — не падать
        assertEqual(JSON.stringify(gridRows[1].classes),
            JSON.stringify(['ws-hover-row']), 'строка сетки всё равно подсвечена');
    });

    test('JS: _renderTotalsMonth — штамп ws-group-first + ws-hover-row', () => {
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
            MONTH_METHODS.map(function(n) { return methodText(WS_CLIENT, n); }).join('\n') +
            '\n' +
            '_totalsExtra: false,' +
            '_year: 2026, _month: 9,' +
            '_applyTtHeadVar: function() { return false; },' +
            '_fitGrid: function() {},' +
            '_syncTotalsRows: function() {},' +
            '_hoverRow: 1,' +
            '_EMPLOYEES: [' +
            "  { 'таб_номер': '0871', 'ФИО': 'Иванов И.И.', 'тип': 'сменный' }," +
            "  { 'таб_номер': '023', 'ФИО': 'Петров П.П.', 'тип': 'дневной' }," +
            "  { 'таб_номер': '045', 'ФИО': 'Сидоров С.С.', 'тип': 'дневной' }" +
            '],' +
            '_ENTRIES: [],' +
            '_PENDING: {},' +
            '_STATUS_CODES: [] });')(mockDoc(els));
        host._renderTotalsMonth();
        const h = els.wsTtBody.innerHTML;
        // первая дневная (Петров) — разделитель; вторая дневная (Сидоров) — НЕТ
        const petrov = h.indexOf('Петров П.П.');
        const sidorov = h.indexOf('Сидоров С.С.');
        assertTrue(h.indexOf('ws-group-first') !== -1,
            'класс ws-group-first рендерится');
        assertTrue(/<tr class="[^"]*ws-hover-row[^"]*">/.test(h),
            'строка 1 (Петров) — штамп ws-hover-row из _hoverRow');
        const groupFirstRows = h.match(/<tr class="ws-group-first[^"]*"/g) || [];
        assertEqual(groupFirstRows.length, 1,
            'ровно ОДНА строка-разделитель (первый дневной)');
        assertTrue(petrov !== -1 && sidorov !== -1, 'обе строки рендерятся');
    });
});

// ============================================================
// 4. CSS: полоса ФИО — ::after со стороны ячеек (не уезжает)
// ============================================================
describe('Task 333 — полоса между ФИО и ячейками: ::after sticky', () => {

    test('тёмная: ::after — right: 0, 2px, #4a8fc7 (у ячейки ФИО)', () => {
        const block = ruleBlock('.ws-grid thead th.ws-emp-col::after,');
        assertTrue(block.length > 0, 'правило ::after найдено');
        assertTrue(/right:\s*0/.test(block),
            'полоса — ПРИНАДЛЕЖИТ ЯЧЕЙКАМ СОТРУДНИКОВ (right: 0, правый край ФИО)');
        assertTrue(/left:\s*auto/.test(block) || !/left:/.test(block),
            'left НЕ задаётся (за padding-box — clipped overflow: hidden)');
        assertTrue(/width:\s*2px/.test(block), 'толщина 2px');
        assertTrue(/background:\s*#4a8fc7/.test(block), 'цвет #4a8fc7');
        assertTrue(/pointer-events:\s*none/.test(block),
            'кликам не мешает (pointer-events: none)');
        assertTrue(/position:\s*absolute/.test(block),
            'псевдоэлемент абсолютный — anchored к sticky-ячейке');
    });

    test('светлая: ::after — #6e8ba4', () => {
        const block = ruleBlock('[data-theme="light"] .ws-grid thead th.ws-emp-col::after,');
        assertTrue(block.length > 0, 'светлое правило найдено');
        assertTrue(/background:\s*#6e8ba4/.test(block), 'цвет #6e8ba4');
    });

    test('прежний border-right 2px у emp-col УДАЛЁН (уезжал при прокрутке)', () => {
        const m = INDEX_SRC.match(/\.ws-grid (?:thead th|tbody td)\.ws-emp-col,\s*\n\s*\.ws-grid (?:thead th|tbody td)\.ws-emp-col \{[^}]*\}/g) || [];
        m.forEach(function(rule) {
            assertFalse(/border-right:\s*2px/.test(rule),
                'правило без border-right 2px: ' + rule.slice(0, 80));
        });
        assertFalse(/\.ws-grid thead th\.ws-emp-col,\s*\n\s*\.ws-grid tbody td\.ws-emp-col \{[^}]*border-right:\s*2px solid #4a8fc7/.test(INDEX_SRC),
            'Task 332-варианта (border-right 2px) больше нет');
    });
});

// ============================================================
// 5. Годовая таблица: архив блоком + имена + штампы
// ============================================================
describe('Task 333 — год: архив блоком, обновление тулбаром', () => {

    const YEAR_METHODS = ['_codeHours', '_totalsZero', '_totalsAgg', '_statusMeta',
                          '_empTypeMap', '_overHours',
                          '_fmtTotalsNum', '_esc', '_sortEmployees',
                          '_setTtWarn', '_renderTotalsYearTable'];

    function makeYearHost(yearData, employees) {
        const els = {
            wsTtBody: { innerHTML: '', querySelector: function() { return null; } },
            wsTtWarn: { textContent: '', hidden: true, attrs: {},
                        setAttribute: function(k, v) { this.attrs[k] = v; } }
        };
        const host = new Function('document', 'return ({' +
            YEAR_METHODS.map(function(n) { return methodText(WS_CLIENT, n); }).join('\n') +
            '\n' +
            '_year: 2026, _month: 9,' +
            '_applyTtHeadVar: function() { return false; },' +
            '_fitGrid: function() {},' +
            '_syncTotalsRows: function() {},' +
            '_EMPLOYEES: ' + JSON.stringify(employees || []) + ',' +
            '_hoverRow: 0,' +
            '_STATUS_CODES: [],' +
            '_YEAR_DATA: ' + JSON.stringify(yearData) + ' });')(mockDoc(els));
        return { host: host, els: els };
    }

    test('архив — ОТДЕЛЬНЫЙ БЛОК: подпись + таблица ws-tt-arch + имена', () => {
        const md = {
            year: 2026, ts: Date.now(), failed: 0,
            months: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [],
                      9: [], 10: [], 11: [], 12: [] },
            employees: [
                { 'таб_номер': '017', 'ФИО': 'Иванов И.И.' },
                { 'таб_номер': '900', 'ФИО': 'Архивный А.А.', 'в_архиве': 1 }
            ]
        };
        const t = makeYearHost(md, [{ 'таб_номер': '017', 'ФИО': 'Иванов И.И.' }]);
        t.host._renderTotalsYearTable();
        const h = t.els.wsTtBody.innerHTML;
        assertTrue(h.indexOf('<div class="ws-tt-arch-cap">Архив</div>') !== -1,
            'подпись «Архив» под основной таблицей');
        assertTrue(h.indexOf('ws-tt-year ws-tt-arch') !== -1,
            'таблица архива — класс ws-tt-arch (колонка «Сотрудник» на любом экране)');
        assertTrue(h.indexOf('Архивный А.А.') !== -1,
            'архивный сотрудник — в блоке архива');
        // главная таблица — ПЕРВАЯ в DOM (строки = строки сетки)
        assertTrue(h.indexOf('<table class="ws-tt-table ws-tt-year">') !== -1 &&
            h.indexOf('<table class="ws-tt-table ws-tt-year">') <
            h.indexOf('ws-tt-arch-cap'),
            'главная таблица — до блока архива');
        // Task 335: шапка «Сотрудник» — span.ws-tt-emp-head («Сотр» при сужении);
        // обе таблицы (главная + архив) содержат по одному такому span
        assertTrue((h.match(/<th class="ws-tt-emp" rowspan="2"><span class="ws-tt-emp-head"/g) || []).length === 2,
            'шапки «Сотрудник» — у главной (мобайл) и у архива (Task 401: rowspan=2 — шапка двухстрочная)');
    });

    test('год: штамп ws-group-first и ws-hover-row в главной таблице', () => {
        const md = {
            year: 2026, ts: Date.now(), failed: 0,
            months: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [],
                      9: [], 10: [], 11: [], 12: [] },
            employees: []
        };
        const t = makeYearHost(md, [
            { 'таб_номер': '017', 'ФИО': 'Иванов И.И.', 'тип': 'сменный' },
            { 'таб_номер': '023', 'ФИО': 'Петров П.П.', 'тип': 'дневной' }
        ]);
        t.host._renderTotalsYearTable();
        const h = t.els.wsTtBody.innerHTML;
        const gf = h.match(/<tr class="ws-group-first">/g) || [];
        assertEqual(gf.length, 1, 'первый дневной — разделитель в году');
        assertTrue(h.indexOf('<tr class="ws-hover-row">') !== -1,
            'строка 0 — штамп ws-hover-row (подсветка шторки)');
    });

    test('год: БЕЗ архива — блока нет; БЕЗ сотрудников — пусто', () => {
        const md = {
            year: 2026, ts: Date.now(), failed: 0,
            months: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [],
                      9: [], 10: [], 11: [], 12: [] },
            employees: [{ 'таб_номер': '017', 'ФИО': 'Иванов И.И.' }]
        };
        const t = makeYearHost(md, [{ 'таб_номер': '017', 'ФИО': 'Иванов И.И.' }]);
        t.host._renderTotalsYearTable();
        const h = t.els.wsTtBody.innerHTML;
        assertFalse(h.indexOf('ws-tt-arch') !== -1,
            'архива нет в справочнике — блока нет');
        // пусто везде
        const t2 = makeYearHost({ year: 2026, ts: Date.now(), failed: 0,
            months: {}, employees: [] }, []);
        t2.host._renderTotalsYearTable();
        assertTrue(t2.els.wsTtBody.innerHTML.indexOf('Нет работников') !== -1,
            'нет ни активных, ни архива — пустое состояние (Task 385: работники)');
    });

    test('CSS: десктоп прячет «Сотрудника» ТОЛЬКО у главной таблицы года', () => {
        const block = ruleBlockMedia('.ws-tt-table.ws-tt-year:not(.ws-tt-arch) th.ws-tt-emp,');
        assertTrue(block.length > 0, 'правило :not(.ws-tt-arch) найдено');
        assertTrue(/display:\s*none/.test(block), 'десктоп: главная — скрыта');
        assertFalse(INDEX_SRC.indexOf('.ws-tt-arch th.ws-tt-emp') !== -1 ||
                    INDEX_SRC.indexOf('.ws-tt-arch td.ws-tt-emp') !== -1,
            'таблицу архива НЕ прячем (имена на любом экране)');
        const cap = ruleBlock('.ws-tt-arch-cap {');
        assertTrue(cap.length > 0 && /font-weight:\s*700/.test(cap),
            'подпись блока архива (.ws-tt-arch-cap) есть');
    });

    test('обновление — ТОЛЬКО кнопкой «Обновить» тулбара', () => {
        const txt = methodText(WS_CLIENT, '_renderTotalsYearTable');
        assertTrue(txt.indexOf('wsTtRefresh') === -1,
            'своей кнопки «Обновить» в годовой таблице нет (Task 332)');
        const setTab = methodText(WS_CLIENT, 'setTotalsTab');
        assertTrue(setTab.indexOf('wsTtRefresh') === -1,
            'setTotalsTab кнопку «Обновить» не трогает');
        assertFalse(INDEX_SRC.indexOf('id="wsTtRefresh"') !== -1,
            'HTML: #wsTtRefresh отсутствует');
    });
});

// ============================================================
// 6. HTML/CSS: кнопка вида — подпись «Вид»
// ============================================================
describe('Task 333 — кнопка вида: подпись «Вид»', () => {

    test('HTML: span.ws-view-label «Вид» внутри #wsViewBtn', () => {
        const iBtn = INDEX_SRC.indexOf('id="wsViewBtn"');
        const iEnd = INDEX_SRC.indexOf('</button>', iBtn);
        const chunk = INDEX_SRC.slice(iBtn, iEnd);
        assertTrue(chunk.indexOf('<span class="ws-view-label">Вид</span>') !== -1,
            'подпись «Вид» в кнопке');
        // Task 334 (заявка: «без значков, просто „Вид“»): иконки
        // wsViewIconFull/Shift/Day УДАЛЕНЫ из кнопки
        assertFalse(chunk.indexOf('wsViewIconFull') !== -1,
            'иконки видов удалены (Task 334 — только текст «Вид»)');
        assertFalse(chunk.indexOf('<svg') !== -1,
            'в кнопке вида НЕТ svg-значков (Task 334)');
    });

    test('CSS: .ws-view-btn — width auto + паддинги (не квадрат-иконка)', () => {
        const block = ruleBlock('.ws-view-btn {');
        assertTrue(block.length > 0, 'правило .ws-view-btn найдено');
        assertTrue(/width:\s*auto/.test(block), 'ширина по содержимому');
        assertTrue(/padding:\s*0 9px/.test(block), 'паддинги как у текстовых кнопок');
        const label = ruleBlock('.ws-view-btn .ws-view-label {');
        assertTrue(label.length > 0, 'правило .ws-view-label найдено');
        assertTrue(/font-size:\s*13px/.test(label), 'шрифт 13px');
        assertTrue(/font-weight:\s*600/.test(label), 'жирность 600');
    });

    test('CSS: десктоп-медиа — width auto (перебивает 34px иконки)', () => {
        // в @media (min-width: 1024px) блоке бара
        const m = INDEX_SRC.match(/@media \(min-width: 1024px\) \{[\s\S]*?\.ws-view-btn \{[^}]*\}/);
        assertTrue(!!m, 'десктоп-правило .ws-view-btn найдено');
        assertTrue(/width:\s*auto/.test(m[0]), 'десктоп: ширина по содержимому');
    });
});

// ============================================================
// 7. SW: версия кэша
// ============================================================
describe('Task 333 — SW: версия кэша', () => {

    test('SW: кэш поднят до kipia-test-v761 (Task 333)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v761') !== -1,
            'в sw.js — kipia-test-v761');
        assertFalse(SW_SRC.indexOf('kipia-test-v762') !== -1,
            'лишний инкремент (v577) не сделан');
    });
});
