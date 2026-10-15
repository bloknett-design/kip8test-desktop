// ============================================================
// Task 454 — заявка: «В отчёте талонов ширину колонки
// "Должность" сделай по ширине большего текста в ней, что бы
// текст был в одну строку, ширину колонки "Ф.И.О" сделай по
// ширине колонки "Должность", а колонку "Роспись о получении"
// сделай уже на величину увеличения колонок "Ф.И.О" и
// "Должность". Высоту строк с работниками оставь шириной в две
// строки текста в них, а текст выравни по вертикали по центру.»
//
// Реализация (ТОЛЬКО печатная вёрстка, index.html):
//   • _talonsTextWidth — canvas-замер самого широкого текста
//     списка (px, Times New Roman); canvas недоступен (моки
//     тестов / экзотические окружения) → null;
//   • _talonsColgroup — ДИНАМИЧЕСКИЙ colgroup: c4 «Должность» =
//     самый широкий текст (значения 11pt и шапка 10.5pt +
//     паддинги/запас), c3 «Ф.И.О.» — ТОЙ ЖЕ шириной (заявка),
//     c7 «Роспись о получении» — width:auto = ОСТАТОК сетки
//     190мм (уже ровно на прирост c3+c4); canvas недоступен —
//     фолбэк-проценты Excel (классы, без инлайн-стилей);
//   • _buildTalonsPrintHtml собирает ОТОБРАЖАЕМЫЕ должности
//     (после _talonsPosition, как в rowsOf) → сетка ЕДИНА для
//     таблицы, ИТОГО и подписей (CG ×3);
//   • строки работников — height 2.5em (ДВЕ строки 11pt × 1.25
//     + паддинги), текст — по вертикали ПО ЦЕНТРУ
//     (vertical-align: middle); экранная страница НЕ тронута.
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function extractMethod(src, name) {
    const start = src.indexOf(name + ': function(');
    if (start === -1) return null;
    const braceStart = src.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    return null;
}

function methodText(src, name) {
    const m = extractMethod(src, name);
    if (m === null) throw new Error('метод не найден: ' + name);
    return m;
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const NOW = new Date();
const NOWY = NOW.getFullYear();
const NOWM = NOW.getMonth() + 1;
const MM = (NOWM < 10 ? '0' + NOWM : '' + NOWM);
const D = (md) => (NOWY + '-' + md);
// Срез модуля WorkSchedule (имена методов неуникальны в монолите)
const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// Значение строковой константы _TALONS_PRINT_CSS (константа
// заканчивается правилом .wst-c7 — как в Tasks 447-452)
const TALONS_CSS_VALUE = new Function('return ({' + (function() {
    const start = WS_SRC.indexOf('_TALONS_PRINT_CSS:');
    const marker = "'#wsPrintSheet.wst-sheet .wst-c7 { width: 22.2%; }',";
    const end = WS_SRC.indexOf(marker, start);
    if (start === -1 || end === -1) throw new Error('_TALONS_PRINT_CSS не найден');
    return WS_SRC.slice(start, end + marker.length);
})() + '})._TALONS_PRINT_CSS;')();

// ============================================================
// 1. SRC — _talonsTextWidth: canvas-замер с защитой
// ============================================================
describe('Task 454 — SRC: _talonsTextWidth', () => {

    test('стражи: без document/canvas/measureText → null (моки не падают)', () => {
        const fn = stripComments(methodText(WS_SRC, '_talonsTextWidth'));
        assertTrue(fn.indexOf("typeof document === 'undefined'") !== -1,
            'нет document → null');
        assertTrue(fn.indexOf("typeof cv.getContext !== 'function'") !== -1,
            'нет getContext → null');
        assertTrue(fn.indexOf("typeof ctx.measureText !== 'function'") !== -1,
            'нет measureText → null');
        const guards = (fn.match(/return null;/g) || []).length;
        assertTrue(guards >= 4, 'null-возвраты на всех стражах (есть: ' + guards + ')');
    });

    test('замер: шрифт Times New Roman, пустые пропускаются, максимум', () => {
        const fn = stripComments(methodText(WS_SRC, '_talonsTextWidth'));
        assertTrue(fn.indexOf("'11pt Times New Roman, Times, serif'") !== -1,
            'шрифт по умолчанию — 11pt Times New Roman');
        assertTrue(fn.indexOf('if (!t) continue;') !== -1,
            'пустые строки пропускаются');
        assertTrue(fn.indexOf('if (w > max) max = w;') !== -1,
            'максимум по списку');
        assertTrue(fn.indexOf('return max;') !== -1,
            'число (не null) при рабочем canvas — даже для пустого списка');
    });
});

// ============================================================
// 2. SRC — _talonsColgroup: динамическая сетка
// ============================================================
describe('Task 454 — SRC: _talonsColgroup', () => {

    test('c3 = c4 = замер + запас (инлайн px), c7 — width:auto (остаток)', () => {
        const fn = stripComments(methodText(WS_SRC, '_talonsColgroup'));
        assertTrue(fn.indexOf("'11pt Times New Roman, Times, serif'") !== -1 &&
                   fn.indexOf("'10.5pt Times New Roman, Times, serif'") !== -1,
            'замер значений (11pt) и шапки «Должность» (10.5pt)');
        assertTrue(fn.indexOf('Math.ceil(Math.max(valW, headW)) + 10') !== -1,
            'ширина = потолок максимума + 10px (паддинги 2×1мм, границы, запас)');
        assertTrue(fn.indexOf("'<col class=\"wst-c3\" style=\"width:' + w + 'px\">'") !== -1,
            'c3 «Ф.И.О.» — инлайн-ширина (заявка: по ширине «Должности»)');
        assertTrue(fn.indexOf("'<col class=\"wst-c4\" style=\"width:' + w + 'px\">'") !== -1,
            'c4 «Должность» — та же величина w (одна строка текста)');
        assertTrue(fn.indexOf("'<col class=\"wst-c7\" style=\"width:auto\"></colgroup>'") !== -1,
            "c7 «Роспись» — width:auto: остаток сетки (уже на прирост c3+c4)");
        assertTrue(fn.indexOf('wst-c1') !== -1 && fn.indexOf('wst-c2') !== -1 &&
                   fn.indexOf('wst-c5') !== -1 && fn.indexOf('wst-c6') !== -1,
            'колонки c1/c2/c5/c6 — не тронуты (проценты Excel)');
    });

    test('фолбэк: canvas недоступен → проценты Excel без инлайн-стилей', () => {
        const fn = stripComments(methodText(WS_SRC, '_talonsColgroup'));
        assertTrue(fn.indexOf('if (valW === null || headW === null) return FALLBACK;') !== -1,
            'нет замера → FALLBACK (классы .wst-c3/.wst-c4/.wst-c7)');
        assertTrue(fn.indexOf('<col class="wst-c3">') !== -1 &&
                   fn.indexOf('<col class="wst-c7">') !== -1,
            'фолбэк-разметка — классы без инлайн-стилей');
        assertTrue(fn.indexOf('vals.indexOf(p) === -1') !== -1,
            'должности-дубликаты (обе группы) на замер не влияют');
    });

    test('ограничители: не уже 12% сетки, «Росписи» остаётся ≥ 8%', () => {
        const fn = stripComments(methodText(WS_SRC, '_talonsColgroup'));
        assertTrue(fn.indexOf('TABLE_PX = 718.4') !== -1,
            'сетка листа 190мм ≈ 718px');
        assertTrue(fn.indexOf('REST = 0.396') !== -1,
            'c1+c2+c5+c6 = 39.6% (проценты Excel)');
        assertTrue(fn.indexOf('TABLE_PX * 0.12') !== -1,
            'минимум c3/c4 — 12% сетки');
        assertTrue(fn.indexOf('TABLE_PX * 0.92') !== -1,
            'максимум c3/c4 — «Росписи» остаётся ≥ 8%');
    });
});

// ============================================================
// 3. SRC — _buildTalonsPrintHtml + CSS строк
// ============================================================
describe('Task 454 — SRC: сбор должностей + CSS', () => {

    test('должности — по ОТОБРАЖАЕМОМУ тексту (после _talonsPosition) → сетка', () => {
        const fn = stripComments(methodText(WS_SRC, '_buildTalonsPrintHtml'));
        assertTrue(fn.indexOf("model.rows[pi].emp['должность']") !== -1 &&
                   fn.indexOf('self._talonsPosition(') !== -1,
            'сбор отображаемых должностей (тот же формат, что в rowsOf)');
        assertTrue(fn.indexOf('self._talonsColgroup(positions)') !== -1,
            'сетка — динамический colgroup');
        assertTrue(fn.indexOf("'<colgroup><col class=\"wst-c1\"><col class=\"wst-c2\">'") === -1,
            'статичный colgroup из _buildTalonsPrintHtml убран');
    });

    test('сетка CG едина для всех трёх таблиц (таблица + ИТОГО + подписи)', () => {
        const fn = stripComments(methodText(WS_SRC, '_buildTalonsPrintHtml'));
        for (const t of ['wst-rep-table', 'wst-tot-table', 'wst-sign-table']) {
            assertTrue(fn.indexOf("'<table class=\"" + t + "\">' + CG") !== -1,
                t + ' использует общую сетку');
        }
    });

    test('строки данных — ДВЕ строки текста, по вертикали по центру', () => {
        const css = TALONS_CSS_VALUE;
        assertTrue(css.indexOf('height: 2.5em;') !== -1,
            'высота 2.5em = 2 × 11pt × 1.25 (было 6мм — одна строка)');
        assertTrue(css.indexOf('height: 6mm;') === -1,
            'прежней высоты 6мм в таблице больше нет');
        assertTrue(css.indexOf('text-align: center; vertical-align: middle; padding: 0.5mm 1mm;') !== -1,
            'содержимое ячеек — по вертикали ПО ЦЕНТРУ (middle)');
        assertTrue(css.indexOf('.wst-r-group td { height: 4.2mm; }') !== -1,
            'ярлыки групп 4.2мм — не тронуты');
        assertTrue(css.indexOf('height: 9mm;') !== -1,
            'шапка таблицы 9мм — не тронута');
    });

    test('фолбэк-проценты c3/c4/c7 остались в CSS (печать без canvas)', () => {
        const css = TALONS_CSS_VALUE;
        assertTrue(css.indexOf('.wst-c3 { width: 18.2%; }') !== -1 &&
                   css.indexOf('.wst-c4 { width: 20%; }') !== -1 &&
                   css.indexOf('.wst-c7 { width: 22.2%; }') !== -1,
            'проценты Excel — фолбэк сетки (как до Task 454)');
    });

    test('экранная страница «Талоны» — сеткой отчёта НЕ тронута (заявка про отчёт)', () => {
        const fn = stripComments(methodText(WS_SRC, '_renderTalonsPage'));
        assertTrue(fn.indexOf('_talonsColgroup') === -1 &&
                   fn.indexOf('_talonsTextWidth') === -1,
            'динамическая сетка — только в печатной форме');
    });
});

// ============================================================
// 4. VM — фолбэк без canvas + динамическая сетка с заглушкой
// ============================================================
describe('Task 454 — VM: colgroup печатной формы', () => {

    function printHost(docStub, employees, entries) {
        return new Function('document', 'return ({' +
            methodText(WS_SRC, '_talonsMonthInfo') + ',\n' +
            methodText(WS_SRC, '_talonsEffectiveEntries') + ',\n' +
            methodText(WS_SRC, '_talonsRows') + ',\n' +
            methodText(WS_SRC, '_talonsAgg') + ',\n' +
            methodText(WS_SRC, '_empTypeMap') + ',\n' +
            methodText(WS_SRC, '_buildTalonsPrintHtml') + ',\n' +
            methodText(WS_SRC, '_talonsColgroup') + ',\n' +
            methodText(WS_SRC, '_talonsTextWidth') + ',\n' +
            methodText(WS_SRC, '_talonsPosition') + ',\n' +
            methodText(WS_SRC, '_talonsSignBlock') + ',\n' +
            '_TALONS_PRINT_CSS: ' + JSON.stringify(TALONS_CSS_VALUE) + ',\n' +
            '_codeHours: function(c) { return ({ "Д": 12, "Н": 12, "Д8": 8 })[c] || 0; },' +
            '_overHours: function() { return 0; },' +
            '_statusMeta: function() { return null; },' +
            '_esc: function(s) { return String(s); },' +
            '_EMPLOYEES: ' + JSON.stringify(employees) + ',' +
            '_ENTRIES: ' + JSON.stringify(entries) + ',' +
            '_PENDING: {}, _TALONS_EDIT: {},' +
            '_year: ' + NOWY + ', _month: ' + NOWM + ',' +
            '_STATUS_CODES: [],' +
            '});')(docStub);
    }

    // документ БЕЗ canvas (как моки Tasks 447-452) — фолбэк
    const NO_CANVAS_DOC = { createElement: function() { return {}; } };
    // canvas-заглушка: ширина текста = число символов × px
    function canvasDoc(px) {
        return { createElement: function(tag) {
            if (tag !== 'canvas') return {};
            return { getContext: function() {
                return { font: '', measureText: function(t) {
                    return { width: String(t).length * px };
                } };
            } };
        } };
    }

    const EMPS = [
        { 'таб_номер': '100', 'ФИО': 'Чирков В. А.', 'тип': 'дневной',
          'должность': 'Слесарь КИПиА 5 разряда' },
        { 'таб_номер': '200', 'ФИО': 'Гусев Г. Г.', 'тип': 'сменный',
          'должность': 'Мастер по КИПиА' }
    ];
    const ENTS = [
        { 'дата': D(MM + '-01'), 'таб_номер': '100', 'статус': 'Д8' },
        { 'дата': D(MM + '-02'), 'таб_номер': '100', 'статус': 'Д' },
        { 'дата': D(MM + '-03'), 'таб_номер': '200', 'статус': 'Д' },
        { 'дата': D(MM + '-04'), 'таб_номер': '200', 'статус': 'Н' }
    ];

    test('без canvas — фолбэк: colgroup без инлайн-стилей, печать цела', () => {
        const h = printHost(NO_CANVAS_DOC, EMPS, ENTS);
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        assertEqual(html.indexOf('style="width:'), -1,
            'инлайн-ширин нет (canvas недоступен)');
        assertTrue(html.indexOf('<col class="wst-c3"><col class="wst-c4">') !== -1,
            'сетка — фолбэк-проценты Excel (классы)');
        assertEqual((html.match(/<colgroup>/g) || []).length, 3,
            'сетка во всех трёх таблицах (таблица/ИТОГО/подписи)');
        assertTrue(html.indexOf('Чирков В. А.') !== -1 &&
                   html.indexOf('Гусев Г. Г.') !== -1,
            'строки работников на месте');
    });

    test('canvas-замер: c3 = c4 = 136px (18 симв. × 7 + 10), c7 — auto', () => {
        const h = printHost(canvasDoc(7), EMPS, ENTS);
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        // «Слесарь по КИП и А» = 18 симв. → 126 + 10 = 136;
        // «Мастер по КИП и А» = 17 симв. → 119; шапка «Должность» = 63
        assertEqual((html.match(/style="width:136px"/g) || []).length, 6,
            'c3 и c4 × 3 таблицы = 6 инлайн-ширин 136px');
        assertEqual((html.match(/wst-c7" style="width:auto"/g) || []).length, 3,
            'c7 — width:auto (остаток) во всех трёх таблицах');
        assertTrue(html.indexOf('<col class="wst-c3"><col class="wst-c4">') === -1,
            'фолбэк-разметки при рабочем canvas нет');
    });

    test('ограничители: гигантский замер → 188px, крошечный → 87px', () => {
        const big = printHost(canvasDoc(20), EMPS, ENTS);
        const htmlBig = big._buildTalonsPrintHtml(big._talonsRows());
        // 18 × 20 = 360 + 10 = 370 → wMax = floor((718.4×0.92 − 718.4×0.396)/2) = 188
        assertEqual((htmlBig.match(/style="width:188px"/g) || []).length, 6,
            'замер зажат сверху — «Росписи» остаётся 8% сетки');
        const tiny = printHost(canvasDoc(1), EMPS, ENTS);
        const htmlTiny = tiny._buildTalonsPrintHtml(tiny._talonsRows());
        // 18 × 1 + 10 = 28 → wMin = ceil(718.4 × 0.12) = 87
        assertEqual((htmlTiny.match(/style="width:87px"/g) || []).length, 6,
            'замер поднят снизу — не уже 12% сетки');
    });

    test('динамическая сетка не ломает форму: маркеры на месте', () => {
        const h = printHost(canvasDoc(7), EMPS, ENTS);
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        for (const part of ['>ОТЧЕТ<', '>12 часовые<', '>8 часовые<',
                            'ИТОГО: 12 часовые', 'class="wst-t-itog">8 часовые<',
                            'Игушов Н.В.', 'Котельникова И.А.', 'Фензель В.П.',
                            '(ф.и.о.)', 'Слесарь по КИП и А',
                            '<td class="wst-r-sign"></td>']) {
            assertTrue(html.indexOf(part) !== -1, 'маркер: ' + part);
        }
    });
});

// ============================================================
// 5. SW — версия кэша
// ============================================================
describe('Task 454 — SW', () => {
    test('SW: кэш поднят до kipia-test-v743 (Task 454)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v743'") !== -1,
            'CACHE_VERSION = kipia-test-v743');
        assertTrue(SW_SRC.indexOf('kipia-test-v744') === -1,
            'kipia-test-v743 не существует');
        assertTrue(SW_SRC.indexOf('Task 454') !== -1,
            'комментарий Task 454 в истории версий');
    });
});
