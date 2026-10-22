// tests/test-task355.js
// Task 355 — шахматка табеля учёта рабочего времени, косметика по заявке:
//   «В шахматке табеля учёта рабочего времени в нерабочих выходных и
//    праздничных ячейках уберь точку по центру. Разделительные линии
//    ячеек в шахматке оставь тонкими но сделай по ярче (чернее), так же
//    в шапке шахматки (в днях месяца). Розовый цвет ячеек выходных и
//    праздничных дней сделай немного постельнее и бледнее (не таким
//    ярким).»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   SRC (index.html):
//     — _renderCell: в НЕРАБОЧИХ днях (dayOff) точка «·» НЕ выводится
//       (Task 356 углубил: «·» убрана и на рабочих днях — тернарник
//       свёлся к (vacPlan ? 'ОТ' : '')); планы «ОТ» — прежние;
//     — розовый выходных #f7d9e3 → #f8e2e9 в ОБОИХ темах (тёмная —
//       Task 319 берёт цвет светлой), старого цвета в файле НЕТ;
//     — линии тела: светлая тема 8% → 30% чёрного; тёмная —
//       ws-cell 30% чёрного (как светлой) + ФИО-колонка стале-синяя 55%;
//     — шапка (дни месяца): ПОЛНЫЙ 1px-бордюр без верхней рамки
//       (border-top: 0 — высота шапки не меняется, Task 331 не тронут),
//       темы красят border-color ярче; правая граница «Сотрудник +»
//       остаётся ПРОЗРАЧНОЙ в обеих темах (Task 336, полоса ::after);
//     — sw.js: CACHE_VERSION = kipia-test-v756 (+ guard v586).
//   VM (_renderCell, моки как в test-task314.js):
//     — dayOff=true: пустая ячейка БЕЗ «·» (классы ws-weekend /
//       ws-status-empty на месте), «.»-код — тоже без «·» (ws-dot-code
//       остаётся), статус-мероприятие «И» — без «·», бейдж есть;
//     — dayOff=true: план отпуска «ОТ» показывается, смена «Д» —
//       код + inline-фон (правка не задевает заполненные ячейки);
//     — dayOff=false: «.» и пустая — БЕЗ «·» (Task 356: пустой центр
//       у ячеек без кодов — как у нерабочих после Task 355).
//
// Запуск: через tests/run-all.js (require './test-task355.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Вырезка метода WorkSchedule: «имя: function» (отступ 8 пробелов)
// → следующий метод ТОГО ЖЕ уровня (паттерн test-task314.js).
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

function loadMethod(name, localStorage, document) {
    const text = methodText(INDEX_SRC, name);
    assertTrue(text.indexOf(name + ': function') !== -1,
        'метод ' + name + ' найден в index.html');
    const make = new Function('localStorage', 'document', 'return ({' + text + '\n});');
    return make(localStorage, document)[name];
}

// ------------------------------------------------------------
// SRC: точка «·» в нерабочих днях
// ------------------------------------------------------------
describe('Task 355 — SRC: «·» убрана из нерабочих ячеек', () => {
    test('_renderCell: центр ячейки — код/«ОТ»/ПУСТО (тернарник Task 356)', () => {
        const cell = methodText(INDEX_SRC, '_renderCell');
        // Task 356: «·» убрана и в пустых ячейках рабочих дней —
        // прежний тернарник (vacPlan ? 'ОТ' : (dayOff ? '' : '·'))
        // свёлся к (vacPlan ? 'ОТ' : '')
        assertTrue(cell.indexOf("(showMainCode ? status : (vacPlan ? 'ОТ' : ''))") !== -1,
            'контент ячейки: код статуса | «ОТ» плана | пусто');
        assertTrue(cell.indexOf("(dayOff ? '' : '·')") === -1,
            'старый тернарник dayOff-точки удалён (Task 356)');
    });

    test('_renderCell: комментарий-маркер Task 355 у контента', () => {
        const cell = methodText(INDEX_SRC, '_renderCell');
        assertTrue(cell.indexOf('Task 355 (заявка): в НЕРАБОЧИХ днях') !== -1,
            'комментарий Task 355 в _renderCell');
    });
});

// ------------------------------------------------------------
// SRC: розовый выходных — пастельнее
// ------------------------------------------------------------
describe('Task 355 — SRC: пастельный розовый (теперь — праздники, Task 363)', () => {
    test('розовый #f8e2e9 жив: база ws-feast.ws-status-empty', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-grid tbody td.ws-cell.ws-feast.ws-status-empty {\n        background: #f8e2e9;') !== -1,
            'базовое правило ws-feast.ws-status-empty с #f8e2e9 (Task 363: розовый — только праздники)');
    });

    test('розовый #f8e2e9 жив: светлая тема ws-feast.ws-status-empty', () => {
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ws-grid tbody td.ws-cell.ws-feast.ws-status-empty {\n        background: #f8e2e9;') !== -1,
            'правило светлой темы с #f8e2e9 (перекрывает «.»-правило)');
    });

    test('прежнего яркого #f7d9e3 в ПРАВИЛАХ больше НЕТ (только в комментариях замены)', () => {
        assertEqual(INDEX_SRC.indexOf('background: #f7d9e3'), -1,
            'ни одно CSS-правило не использует прежний #f7d9e3');
    });
});

// ------------------------------------------------------------
// SRC: разделительные линии — тонкие, но ярче
// ------------------------------------------------------------
describe('Task 355 — SRC: линии ячеек и шапки ярче (тонкие 1px)', () => {
    test('светлая тема: тело — border-color стале-синий (Task 377: как в тёмной)', () => {
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ws-grid tbody td {\n        border-color: rgb(64, 80, 102);\n    }') !== -1,
            'правило светлой темы: rgb(64,80,102) (Task 377: цвет тёмной темы, было rgba(0,0,0,0.30))');
        // прежнее блеклое правило удалено (в контексте ws-grid)
        const faint = '[data-theme="light"] .ws-grid tbody td {\n        border-color: rgba(0, 0, 0, 0.08);';
        assertEqual(INDEX_SRC.indexOf(faint), -1, 'блеклое 8%-правило отсутствует');
    });

    test('тёмная тема: тело — ws-cell 30% чёрного (дни светлые, Task 319)', () => {
        assertTrue(INDEX_SRC.indexOf('[data-theme="dark"] .ws-grid tbody td.ws-cell {\n        border-color: rgba(0, 0, 0, 0.30);\n    }') !== -1,
            'ws-cell: rgba(0,0,0,0.30)');
    });

    test('тёмная тема: тело — ФИО-колонка стале-синяя 55%', () => {
        assertTrue(INDEX_SRC.indexOf('[data-theme="dark"] .ws-grid tbody td {\n        border-color: rgba(105, 130, 160, 0.55);\n    }') !== -1,
            'общий td: rgba(105,130,160,0.55)');
    });

    test('тёмные границы стоят ДО красной рамки-группы (красная жива)', () => {
        const iDark = INDEX_SRC.indexOf('[data-theme="dark"] .ws-grid tbody td.ws-cell {\n        border-color: rgba(0, 0, 0, 0.30);');
        const iRed = INDEX_SRC.indexOf('.ws-grid tbody td.ws-cell.ws-wgrp-first {');
        assertTrue(iDark !== -1 && iRed !== -1 && iDark < iRed,
            'правило Task 355 раньше .ws-wgrp-* (равная специфичность, Task 363)');
    });

    test('шапка: полный 1px-бордюр БЕЗ верхней рамки (вертикали между днями)', () => {
        // базовое правило .ws-grid thead th {...} — внутри него комментарий
        // Task 330 (фон #1e293b), поэтому проверяем регэкспом: открывающая
        // скобка → (комментарии/декларации без }) → полный бордюр →
        // border-top: 0 → закрывающая. Первое совпадение с бордюром —
        // именно базовое правило (у грид-вайда Task 331 бордюра нет)
        const re = /\.ws-grid thead th \{[^}]*border: 1px solid var\(--card-border, rgba\(255,255,255,0\.08\)\);[^}]*border-top: 0;[^}]*\}/;
        assertTrue(re.test(INDEX_SRC),
            'базовый полный бордюр thead th + border-top: 0');
    });

    test('шапка: светлая тема — border-color стале-голубой (Task 377)', () => {
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ws-grid thead th {\n        background: #bfcad5;\n        color: #333;\n        border-color: rgb(83, 96, 117);\n    }') !== -1,
            'светлая шапка: rgb(83,96,117) — цвет тёмной темы (было rgba(0,0,0,0.30))');
    });

    test('шапка: тёмная тема — border-color стале-голубой 55%', () => {
        assertTrue(INDEX_SRC.indexOf('[data-theme="dark"] .ws-grid thead th {\n        border-color: rgba(140, 158, 188, 0.55);\n    }') !== -1,
            'тёмная шапка: rgba(140,158,188,0.55)');
    });

    test('шапка: правая граница «Сотрудник +» ПРОЗРАЧНА в обеих темах (Task 336 жив)', () => {
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ws-grid thead th.ws-emp-col,\n    [data-theme="dark"] .ws-grid thead th.ws-emp-col {\n        border-right: 1px solid transparent;\n    }') !== -1,
            'гвард прозрачности поверх тематических border-color');
    });
});

// ------------------------------------------------------------
// VM: _renderCell — точка в нерабочих днях
// ------------------------------------------------------------
describe('Task 355 — VM: _renderCell (нерабочие дни без «·»)', () => {

    const CODES = [
        { code: 'Д',  name: 'День',    color: '#FFE082' },
        { code: 'ОТ', name: 'Отпуск',  color: '#ECEFF1' },
        { code: '.',  name: 'Плановый выходной день', color: '#EEF0F2' },
        { code: 'И',  name: 'Инструктаж', color: '#B3E5FC' }
    ];

    function mkRenderCtx(dayOff, eventsMap, vacMap) {
        const ctx = {
            _year: 2026, _month: 9, _todayIso: null, _canEdit: true,
            _STATUS_CODES: CODES,
            _EVENT_CODES: ['И', 'ОБ', 'ПЗ', 'ПР', '*'],
            _ABSENCE_CODES: ['ОТ', 'У', 'ОВ', 'Б', 'ПР'],
            _VAC_CODES: ['ОТ', 'У'],
            _eventsAt: function (iso, tab) { return eventsMap[iso] || []; },
            _vacationAt: function (iso, tab) { return vacMap && vacMap[iso] || null; },
            _plannedShiftAt: function () { return null; },
            _statusMeta: function (code) {
                for (var i = 0; i < CODES.length; i++) {
                    if (CODES[i].code === code) return CODES[i];
                }
                return null;
            },
            _calDayOff: function () { return dayOff; },
            _esc: function (s) { return String(s); }
        };
        ctx._renderCell = loadMethod('_renderCell', null, null);
        return ctx;
    }

    const EMP = { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'сменный' };

    function cellHtml(ctx, entry, eventsMap, vacMap) {
        return ctx._renderCell(5, '2026-09-05', EMP, entry, false);
    }

    // главный текст ячейки — до первого дочернего span (бейджи не в счёт)
    function mainText(html) {
        const m = html.match(/onclick="WorkSchedule\.onCellClick[^"]*"[^>]*>([^<]*)</);
        return m ? m[1] : null;
    }

    test('нерабочий день, ПУСТАЯ ячейка — «·» НЕТ, классы ws-weekend/ws-status-empty', () => {
        const ctx = mkRenderCtx(true, {}, null);
        const html = cellHtml(ctx, null);
        assertEqual(mainText(html), '', 'главный текст пуст');
        assertTrue(html.indexOf('·') === -1, 'символа «·» в ячейке нет вообще');
        assertTrue(html.indexOf('ws-weekend') !== -1, 'класс ws-weekend (розовый фон)');
        assertTrue(html.indexOf('ws-status-empty') !== -1, 'вид пустой ячейки');
    });

    test('нерабочий день, код «.» — точка НЕ показывается, ws-dot-code остаётся', () => {
        const ctx = mkRenderCtx(true, {}, null);
        const html = cellHtml(ctx, { 'статус': '.', 'источник': 'авто', 'переработка': 0 });
        assertEqual(mainText(html), '', 'главный текст пуст (точка убрана)');
        assertTrue(html.indexOf('ws-dot-code') !== -1, 'маркер ws-dot-code для попапа/тестов жив');
    });

    test('нерабочий день, статус-мероприятие «И» — без «·», бейдж есть', () => {
        const ctx = mkRenderCtx(true, { '2026-09-05': [{ code: 'И', training: { id: 1 } }] }, null);
        const html = cellHtml(ctx, { 'статус': 'И', 'источник': 'авто', 'переработка': 0 });
        assertEqual(mainText(html), '', 'главный текст пуст');
        assertTrue(/<span class="ws-ev-badge"[^>]*>И<\/span>/.test(html), 'бейдж «И» на месте');
    });

    test('нерабочий день, план отпуска — «ОТ» показывается (НЕ пустой)', () => {
        const ctx = mkRenderCtx(true, {}, { '2026-09-05': { 'таб_номер': '017' } });
        const html = cellHtml(ctx, null);
        assertTrue(html.indexOf('>ОТ') !== -1, 'код плана «ОТ» — прежний вид');
        assertTrue(html.indexOf('ws-vac-plan') !== -1, 'пунктирная рамка плана');
    });

    test('нерабочий день, смена «д» — код + inline-фон (заполненные не тронуты)', () => {
        const ctx = mkRenderCtx(true, {}, null);
        const html = cellHtml(ctx, { 'статус': 'Д', 'источник': 'авто', 'переработка': 0 });
        assertTrue(/>Д</.test(html), 'код смены — основной');
        assertTrue(/style="background:#FFE082;"/.test(html), 'inline-фон смены');
    });

    test('РАБОЧИЙ день, «.» — БЕЗ точки (Task 356: чистый центр)', () => {
        const ctx = mkRenderCtx(false, {}, null);
        const html = cellHtml(ctx, { 'статус': '.', 'источник': 'авто', 'переработка': 0 });
        assertEqual(mainText(html), '', '«·» в рабочем дне больше НЕ выводится (Task 356)');
        assertTrue(html.indexOf('·') === -1, 'символа «·» в ячейке нет вообще');
        assertTrue(html.indexOf('ws-dot-code') !== -1, 'маркер ws-dot-code жив');
    });

    test('РАБОЧИЙ день, пустая — БЕЗ точки (Task 356)', () => {
        const ctx = mkRenderCtx(false, {}, null);
        const html = cellHtml(ctx, null);
        assertEqual(mainText(html), '', '«·» в пустой рабочей ячейке больше нет (Task 356)');
        assertTrue(html.indexOf('·') === -1, 'символа «·» в ячейке нет вообще');
        assertTrue(html.indexOf('ws-weekend') === -1, 'класса ws-weekend нет');
    });
});

// ------------------------------------------------------------
// Service Worker
// ------------------------------------------------------------
describe('Task 355 — Service Worker', () => {
    test('SW: версия кэша kipia-test-v756', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v756'") !== -1,
            'CACHE_VERSION в sw.js = kipia-test-v756');
    });

    test('SW: двойной бамп не случился (v585 не существует)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v757') === -1,
            'в sw.js нет kipia-test-v756');
    });
});
