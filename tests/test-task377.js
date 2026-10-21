// tests/test-task377.js
// Task 377 — шахматка табеля учёта рабочего времени, две заявки:
//   1) «В шахматке Табель учёта рабочего времени, выделение текущего
//      дня сделай посильнее» — усиление подсветки столбца «сегодня»:
//      заливки ячеек 0.16→0.30 (тёмная) / 0.10→0.22 (светлая), шапка
//      0.20→0.40 / 0.13→0.26 + жирное число, акцентная полоса 2px
//      (::after под датой, без конфликта с рамкой выходных ws-wgrp),
//      составные правила «сегодня+hover/sel» — усиление НЕ гаснет
//      при наведении/выборе столбца (классы ставятся в DOM без
//      перерисовки, поздние равные правила перекрыли бы box-shadow).
//   2) «В светлой теме, разделительные полосы ячеек шахматки такого
//      же цвета, как в тёмной теме» — в тёмной теме полосы рендерятся
//      практически чёрными rgb(9,15,23) (rgba(0,0,0,0.30) ложится на
//      тёмный стол-фон: filter-изоляция ячеек Task 319 не пускает их
//      светлый фон под collapsed-границу), в светлой тот же rgba давал
//      бледно-серые rgb(167,166,160) линии. Светлой теме — НЕПРОЗРАЧНЫЕ
//      цвета тёмной темы: дни rgb(10,15,23), ФИО rgb(64,80,102),
//      шапка rgb(83,96,117); правило дней стоит ДО красной рамки
//      выходных ws-wgrp (Task 363) — красные 2px побеждают порядком.
//
// ЧТО ПРОВЕРЯЕТСЯ (статические инварианты клиента):
//   Усиление «сегодня»:
//     — тёмная: td 0.30 (+manual), row+today 0.32 (+manual), шапка
//       градиент 0.40 + font-weight 700, составные td-правила
//       today+hover 0.30 / today+sel 0.34 / row+today+hover 0.34 /
//       row+today+sel 0.36 (+manual), составные правила ШАПКИ
//       today-col+hover-col 0.40 / +sel-col 0.44;
//     — светлая: td 0.22, row+today 0.24, шапка 0.26 + 700,
//       составные 0.22/0.26/0.26/0.28, шапка 0.26/0.30;
//     — ПОЛОСА ::after: 2px, absolute, bottom 0, левый/правый 0,
//       фон — акцент темы (var(--accent-blue)/#2a5d8f);
//     — ПОРЯДОК: составные td-правила ПОЗЖЕ базовых ws-hover/ws-sel
//       (иначе гасили бы), составные правила шапки — позже ws-sel-col;
//     — регресс: ws-wgrp box-shadow (красный верх) не тронут, базовые
//       ws-hover/ws-sel значения не изменились (0.16/0.24 тёмная).
//   Полосы светлой темы:
//     — [light] td.ws-cell: rgb(10,15,23); [light] td: rgb(64,80,102);
//       [light] thead th: rgb(83,96,117) (фон #bfcad5 сохранён);
//     — правило дней СТОИТ ДО .ws-wgrp-first (равная специфичность
//       (0,3,2) — красная рамка побеждает порядком, как в тёмной);
//     — тёмная тема НЕ тронута: rgba(0,0,0,0.30)/rgba(105,130,160,0.55)
//       /rgba(140,158,188,0.55) живы.
//   SW: kipia-test-v754 (+ guard v607).
//
// Запуск: через tests/run-all.js (require './test-task377.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

function ruleBlock(selector) {
    const i = INDEX_SRC.indexOf(selector);
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('{', i);
    const k = INDEX_SRC.indexOf('}', j);
    return INDEX_SRC.slice(j + 1, k);
}

describe('Task 377 — усиление подсветки «сегодня» (тёмная тема)', () => {

    test('ячейки столбца: заливка 0.30 (было 0.16)', () => {
        const b = ruleBlock('.ws-grid tbody td.ws-cell.ws-today {');
        assertTrue(b !== null && /inset 0 0 0 999px rgba\(74, 143, 199, 0\.30\)/.test(b),
            'td.ws-today: inset 999px rgba(74,143,199,0.30)');
    });

    test('«сегодня + ручная запись»: составная тень 0.30 + рамка', () => {
        const b = ruleBlock('.ws-grid tbody td.ws-cell.ws-today.ws-source-manual {');
        assertTrue(b !== null &&
                   /rgba\(74, 143, 199, 0\.30\),\s*\n\s*inset 0 0 0 1\.5px rgba\(255,255,255,0\.5\)/.test(b),
            'заливка 0.30 + рамка ручной записи');
    });

    test('строка наведения + «сегодня»: 0.34 (Task 378: строка 0.30)', () => {
        const b = ruleBlock('.ws-grid tbody tr.ws-hover-row td.ws-cell.ws-today {');
        assertTrue(b !== null && /rgba\(74, 143, 199, 0\.34\)/.test(b),
            'row+today: 0.34');
        const bm = ruleBlock('.ws-grid tbody tr.ws-hover-row td.ws-cell.ws-today.ws-source-manual {');
        assertTrue(bm !== null && /rgba\(74, 143, 199, 0\.34\),/.test(bm),
            'row+today+manual: 0.34 + рамка');
    });

    test('шапка: градиент 0.40 (было 0.20) + жирное число', () => {
        const b = ruleBlock('.ws-grid thead th.ws-day-col.ws-today-col {');
        assertTrue(b !== null &&
                   /linear-gradient\(rgba\(74, 143, 199, 0\.40\), rgba\(74, 143, 199, 0\.40\)\)/.test(b),
            'today-col: градиент 0.40');
        assertTrue(b !== null && /font-weight:\s*700/.test(b),
            'число даты — жирное (font-weight: 700)');
        assertTrue(b !== null && /color:\s*var\(--accent-blue,\s*#4a8fc7\)/.test(b),
            'число — акцентом (регресс Task 313)');
    });

    test('шапка: составные «сегодня + hover/sel» — не гаснут', () => {
        const bh = ruleBlock('.ws-grid thead th.ws-day-col.ws-today-col.ws-hover-col {');
        assertTrue(bh !== null &&
                   /linear-gradient\(rgba\(74, 143, 199, 0\.40\), rgba\(74, 143, 199, 0\.40\)\)/.test(bh),
            'today+hover-col: 0.40 (не 0.20)');
        const bs = ruleBlock('.ws-grid thead th.ws-day-col.ws-today-col.ws-sel-col {');
        assertTrue(bs !== null &&
                   /linear-gradient\(rgba\(74, 143, 199, 0\.44\), rgba\(74, 143, 199, 0\.44\)\)/.test(bs),
            'today+sel-col: 0.44 (выбор чуть насыщеннее)');
        // порядок: составные правила ПОЗЖЕ базового ws-sel-col
        const iSel = INDEX_SRC.indexOf('.ws-grid thead th.ws-day-col.ws-sel-col {');
        const iComp = INDEX_SRC.indexOf('.ws-grid thead th.ws-day-col.ws-today-col.ws-hover-col {');
        assertTrue(iSel !== -1 && iComp !== -1 && iSel < iComp,
            'составное правило шапки стоит после ws-sel-col (побеждает)');
    });

    test('тело: составные «сегодня + hover/sel» — не гаснут', () => {
        const b1 = ruleBlock('.ws-grid tbody td.ws-cell.ws-today.ws-hover {');
        assertTrue(b1 !== null && /rgba\(74, 143, 199, 0\.34\)/.test(b1),
            'today+hover: 0.34 (Task 378: пересечение насыщеннее «сегодня» 0.30)');
        const b2 = ruleBlock('.ws-grid tbody td.ws-cell.ws-today.ws-sel {');
        assertTrue(b2 !== null && /rgba\(74, 143, 199, 0\.34\)/.test(b2),
            'today+sel: 0.34');
        const b3 = ruleBlock('.ws-grid tbody tr.ws-hover-row td.ws-cell.ws-today.ws-hover {');
        assertTrue(b3 !== null && /rgba\(74, 143, 199, 0\.36\)/.test(b3),
            'row+today+hover: 0.36');
        const b4 = ruleBlock('.ws-grid tbody tr.ws-hover-row td.ws-cell.ws-today.ws-sel {');
        assertTrue(b4 !== null && /rgba\(74, 143, 199, 0\.36\)/.test(b4),
            'row+today+sel: 0.36');
        // составные с ручной записью — рамка не затёрта
        const bm = ruleBlock('.ws-grid tbody td.ws-cell.ws-today.ws-sel.ws-source-manual {');
        assertTrue(bm !== null &&
                   /rgba\(74, 143, 199, 0\.34\),\s*\n\s*inset 0 0 0 1\.5px rgba\(255,255,255,0\.5\)/.test(bm),
            'today+sel+manual: составная тень');
        // порядок: составные ПОЗЖЕ базовых ws-hover/ws-sel
        const iHover = INDEX_SRC.indexOf('.ws-grid tbody td.ws-cell.ws-hover {');
        const iComp = INDEX_SRC.indexOf('.ws-grid tbody td.ws-cell.ws-today.ws-hover {');
        assertTrue(iHover !== -1 && iComp !== -1 && iHover < iComp,
            'составное правило тела стоит после базового ws-hover');
    });

    test('полоса ::after 2px под датой (акцент, без layout-сдвига)', () => {
        const b = ruleBlock('.ws-grid thead th.ws-day-col.ws-today-col::after {');
        assertTrue(b !== null, 'правило ::after существует');
        assertTrue(/content:\s*''/.test(b), "content: ''");
        assertTrue(/position:\s*absolute/.test(b), 'position: absolute (th sticky — предок)');
        assertTrue(/height:\s*2px/.test(b), 'высота 2px');
        assertTrue(/bottom:\s*0/.test(b) && /left:\s*0/.test(b) && /right:\s*0/.test(b),
            'прижата к низу на всю ширину th');
        assertTrue(/background:\s*var\(--accent-blue,\s*#4a8fc7\)/.test(b),
            'фон — акцент темы');
        // красная рамка выходных не тронута (другое свойство: box-shadow TOP)
        const w = ruleBlock('.ws-grid thead th.ws-day-col.ws-wgrp {');
        assertTrue(w !== null && /inset 0 2px 0 0 #e57373/.test(w),
            'ws-wgrp: красный верх жив (Task 363)');
    });

    test('Task 378: базовые hover/sel/строка = яркость «сегодня»', () => {
        const h = ruleBlock('.ws-grid tbody td.ws-cell.ws-hover {');
        assertTrue(h !== null && /rgba\(74, 143, 199, 0\.30\)/.test(h),
            'ws-hover: 0.30 (Task 378: = «сегодня», было 0.16)');
        const s = ruleBlock('.ws-grid tbody td.ws-cell.ws-sel {');
        assertTrue(s !== null && /rgba\(74, 143, 199, 0\.30\)/.test(s),
            'ws-sel: 0.30 (Task 378: паритет, было 0.24)');
        const r = ruleBlock('.ws-grid tbody tr.ws-hover-row td.ws-cell {');
        assertTrue(r !== null && /rgba\(74, 143, 199, 0\.30\)/.test(r),
            'row: 0.30 (Task 378: = «сегодня», было 0.10)');
    });
});

describe('Task 377 — усиление подсветки «сегодня» (светлая тема)', () => {

    test('ячейки: 0.22 (было 0.10) + составные', () => {
        const b = ruleBlock('[data-theme="light"] .ws-grid tbody td.ws-cell.ws-today {');
        assertTrue(b !== null && /rgba\(42, 93, 143, 0\.22\)/.test(b),
            'светлые td.ws-today: 0.22');
        const bm = ruleBlock('[data-theme="light"] .ws-grid tbody td.ws-cell.ws-today.ws-source-manual {');
        assertTrue(bm !== null && /rgba\(42, 93, 143, 0\.22\),/.test(bm),
            'сегодня+manual: 0.22 + рамка');
    });

    test('строка наведения + «сегодня»: 0.26 (Task 378: строка 0.22)', () => {
        const b = ruleBlock('[data-theme="light"] .ws-grid tbody tr.ws-hover-row td.ws-cell.ws-today {');
        assertTrue(b !== null && /rgba\(42, 93, 143, 0\.26\)/.test(b),
            'row+today (светлая): 0.26');
    });

    test('шапка: 0.26 (было 0.13) + жирное число', () => {
        const b = ruleBlock('[data-theme="light"] .ws-grid thead th.ws-day-col.ws-today-col {');
        assertTrue(b !== null &&
                   /linear-gradient\(rgba\(42, 93, 143, 0\.26\), rgba\(42, 93, 143, 0\.26\)\)/.test(b),
            'светлая шапка today-col: 0.26');
        assertTrue(b !== null && /font-weight:\s*700/.test(b), 'жирное число');
    });

    test('составные правила + полоса ::after (светлая)', () => {
        const b1 = ruleBlock('[data-theme="light"] .ws-grid tbody td.ws-cell.ws-today.ws-hover {');
        assertTrue(b1 !== null && /rgba\(42, 93, 143, 0\.26\)/.test(b1), 'today+hover: 0.26 (Task 378)');
        const b2 = ruleBlock('[data-theme="light"] .ws-grid tbody td.ws-cell.ws-today.ws-sel {');
        assertTrue(b2 !== null && /rgba\(42, 93, 143, 0\.26\)/.test(b2), 'today+sel: 0.26');
        const b3 = ruleBlock('[data-theme="light"] .ws-grid tbody tr.ws-hover-row td.ws-cell.ws-today.ws-hover {');
        assertTrue(b3 !== null && /rgba\(42, 93, 143, 0\.28\)/.test(b3), 'row+today+hover: 0.28 (Task 378)');
        const b4 = ruleBlock('[data-theme="light"] .ws-grid tbody tr.ws-hover-row td.ws-cell.ws-today.ws-sel {');
        assertTrue(b4 !== null && /rgba\(42, 93, 143, 0\.28\)/.test(b4), 'row+today+sel: 0.28');
        const bh = ruleBlock('[data-theme="light"] .ws-grid thead th.ws-day-col.ws-today-col.ws-hover-col {');
        assertTrue(bh !== null && /rgba\(42, 93, 143, 0\.26\)/.test(bh), 'шапка today+hover: 0.26');
        const bs = ruleBlock('[data-theme="light"] .ws-grid thead th.ws-day-col.ws-today-col.ws-sel-col {');
        assertTrue(bs !== null && /rgba\(42, 93, 143, 0\.30\)/.test(bs), 'шапка today+sel: 0.30');
        const ba = ruleBlock('[data-theme="light"] .ws-grid thead th.ws-day-col.ws-today-col::after {');
        assertTrue(ba !== null && /background:\s*#2a5d8f/.test(ba),
            'полоса ::after — тёмно-синий акцент светлой темы');
    });
});

describe('Task 377 — полосы ячеек светлой темы = цвет тёмной темы', () => {

    test('дни: непрозрачный rgb(10,15,23) — цвет полос тёмной темы', () => {
        const i = INDEX_SRC.indexOf('[data-theme="light"] .ws-grid tbody td.ws-cell {');
        assertTrue(i !== -1, 'правило светлой темы для дней существует');
        const b = ruleBlock('[data-theme="light"] .ws-grid tbody td.ws-cell {');
        assertTrue(/border-color:\s*rgb\(10, 15, 23\)/.test(b),
            'дни: rgb(10,15,23) (= тёмная: rgba(0,0,0,0.30) над тёмным стол-фоном)');
    });

    test('дни: правило стоит ДО красной рамки ws-wgrp (красная побеждает)', () => {
        const iLight = INDEX_SRC.indexOf('[data-theme="light"] .ws-grid tbody td.ws-cell {\n        border-color: rgb(10, 15, 23);');
        const iRed = INDEX_SRC.indexOf('.ws-grid tbody td.ws-cell.ws-wgrp-first {');
        assertTrue(iLight !== -1 && iRed !== -1 && iLight < iRed,
            'rgb(10,15,23) раньше ws-wgrp-first (равная специфичность — порядок решает)');
    });

    test('ФИО/прочие td: стале-синий rgb(64,80,102) (как колонка ФИО в тёмной)', () => {
        // селектор встречается и в комментариях (wgrp) — ищем правило
        // на начале строки с переводом строки после скобки
        const i = INDEX_SRC.indexOf('\n    [data-theme="light"] .ws-grid tbody td {\n');
        assertTrue(i !== -1, 'правило светлой темы td найдено (не комментарий)');
        const b = INDEX_SRC.slice(i, i + 200);
        assertTrue(/border-color:\s*rgb\(64, 80, 102\)/.test(b),
            'ФИО: rgb(64,80,102) — горизонтальный разделитель строк непрерывен по цвету с днями');
        // старое правило Task 355 (30% чёрного) полностью ушло
        assertEqual(INDEX_SRC.indexOf('[data-theme="light"] .ws-grid tbody td {\n        border-color: rgba(0, 0, 0, 0.30);'), -1,
            'прежнее rgba(0,0,0,0.30) в правиле светлой темы отсутствует');
    });

    test('шапка: стале-голубой rgb(83,96,117) — цвет линий шапки тёмной темы', () => {
        const b = ruleBlock('[data-theme="light"] .ws-grid thead th {');
        assertTrue(b !== null && /background:\s*#bfcad5/.test(b),
            'фон светлой шапки сохранён (#bfcad5, Task 330)');
        assertTrue(b !== null && /border-color:\s*rgb\(83, 96, 117\)/.test(b),
            'линии шапки: rgb(83,96,117) (= тёмная: rgba(140,158,188,0.55) над #1e293b)');
        assertEqual(INDEX_SRC.indexOf('border-color: rgba(0, 0, 0, 0.30);\n    }\n    [data-theme="light"] .ws-grid {'), -1,
            'прежние 30% чёрного в шапке светлой темы отсутствуют');
    });

    test('тёмная тема НЕ тронута (полосы как были)', () => {
        const d1 = INDEX_SRC.indexOf('[data-theme="dark"] .ws-grid tbody td.ws-cell {\n        border-color: rgba(0, 0, 0, 0.30);');
        const d2 = INDEX_SRC.indexOf('[data-theme="dark"] .ws-grid tbody td {\n        border-color: rgba(105, 130, 160, 0.55);');
        const d3 = INDEX_SRC.indexOf('[data-theme="dark"] .ws-grid thead th {\n        border-color: rgba(140, 158, 188, 0.55);');
        assertTrue(d1 !== -1 && d2 !== -1 && d3 !== -1,
            'тёмная тройка правил границ жива (дни/ФИО/шапка)');
    });
});

describe('Task 377 — Service Worker', () => {
    test('SW: версия кэша kipia-test-v754', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v754'") !== -1,
            'CACHE_VERSION в sw.js = kipia-test-v754');
    });

    test('SW: двойной бамп не случился (v607 не существует)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v755') === -1,
            'в sw.js нет kipia-test-v754');
    });
});
