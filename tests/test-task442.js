// ============================================================
// Task 442 — заявка (kip8test):
//   «На распечатываемом графике работы убери мини значки
//    мероприятий в шахматке и столбец с кодами, и внешний контур
//    линий выходных календарных дней в шахматке сделай толще,
//    а выделять их фоном не нужно, и даты выходных жирнее».
//
// ЧТО ПРОВЕРЯЕТСЯ (все три представления печати):
//   HTML (SRC+VM):
//   1) бейджи мероприятий .wsp-ev* в ячейках УДАЛЕНЫ (правила CSS
//      и разметка _printCell); статус-мероприятия — ПУСТЫЕ ячейки;
//   2) легенда кодов (столбец .wsp-legend/.wsp-lg, Tasks 360–441)
//      УДАЛЕНА: CSS, разметка, usedCodes; «Мероприятия» — одни,
//      на всю ширину листа (flex-ряд/зазор 10px сняты);
//   3) выходные: заливки НЕТ (wsp-off/wsp-cell-off без background),
//      вместо неё ТОЛСТЫЙ внешний контур полосы выходных:
//      шапка — верх (border-top 2px) + края (wsp-off-edge-l/r),
//      тело — бока + низ последней строки (wsp-off-edge-b);
//      полоса = подряд идущие выходные (Сб+Вс — один контур);
//   4) числа выходных в шапке — ЖИРНЫЕ (день недели — обычный);
//   PDF (SRC+VM):
//   5) зоны кодов нет (codeW/colGap/страницы-коды), мероприятия —
//      вся ширина (evW = W − 2M); бейджи/заливки выходных не
//      рисуются; числа выходных — жирные (700), обычные — 400;
//      контур полос — strokeRect ×2 толщины сетки;
//   Excel (SRC+VM):
//   6) столбца кодов D и «Коды:» нет; числа выходных — ЖИРНЫЕ
//      (s=1), обычные дни — НЕ жирные (новый стиль regDate);
//      полосы выходных — MEDIUM-внешний контур (13 границ, шапка
//      T/TL/TR/TLR, дни недели L/R/LR, тело L/R/LR/B/BL/BR/BLR,
//      обычные + цветные), карта стилей _wsTabelStyleMap;
//   SW: kipia-test-v753.
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

const WS_START = INDEX_SRC.indexOf('var WorkSchedule = {');
const WS_CLIENT = INDEX_SRC.slice(WS_START, WS_START + 800000);

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

function stripComments(src) {
    return String(src)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]*\/\/.*$/gm, '');
}

function ruleBlock(sel) {
    const i = INDEX_SRC.indexOf(sel);
    if (i === -1) return '';
    return INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
}

function mockEsc(s) { return String(s); }

// ============================================================
// 1. SRC — HTML-печать: бейджи и столбец кодов удалены
// ============================================================
describe('Task 442 — SRC: печать HTML (значки и коды удалены)', () => {

    test('CSS: бейджей .wsp-ev* нет; правила удалены', () => {
        assertTrue(ruleBlock('#wsPrintSheet .wsp-ev-wrap {') === '' &&
                   ruleBlock('#wsPrintSheet .wsp-ev {') === '',
            'правила бейджей сняты (мини-значки удалены)');
        assertTrue(INDEX_SRC.indexOf('.wsp-ev.wsp-ev-plan') === -1,
            'пунктирного плана тоже нет');
    });

    test('JS: _printCell — без бейджей, без _eventsAt', () => {
        const c = stripComments(methodText(WS_CLIENT, '_printCell'));
        assertTrue(c.indexOf('wsp-ev') === -1, 'разметки бейджей нет');
        assertTrue(c.indexOf('_eventsAt') === -1, 'события не запрашиваются');
        assertTrue(c.indexOf('events.concat') === -1, 'виртуального бейджа нет');
    });

    test('CSS+JS: легенда кодов удалена; мероприятия — одни', () => {
        assertTrue(ruleBlock('#wsPrintSheet .wsp-legend {') === '' &&
                   ruleBlock('#wsPrintSheet .wsp-legend-t {') === '' &&
                   ruleBlock('#wsPrintSheet .wsp-legend-cols {') === '' &&
                   ruleBlock('#wsPrintSheet .wsp-lg {') === '',
            'правила легенды удалены (столбец кодов снят)');
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf('wsp-legend') === -1 && b.indexOf('wsp-lg') === -1,
            'разметки легенды нет');
        assertTrue(b.indexOf('usedCodes') === -1, 'usedCodes не собирается');
        assertTrue(b.indexOf('Коды:') === -1, 'заголовка «Коды:» нет');
        // правило целиком (с комментарием) — проверяем БЕЗ комментария
        const bot = stripComments(ruleBlock('#wsPrintSheet .wsp-bottom {'));
        assertTrue(bot.indexOf('flex') === -1 && bot.indexOf('gap') === -1,
            'flex-ряд и зазор 10px сняты вместе с блоком кодов');
    });
});

// ============================================================
// 2. SRC — HTML-печать: контур выходных + жирные даты
// ============================================================
describe('Task 442 — SRC: печать HTML (контур выходных)', () => {

    test('CSS: шапка — выходной БЕЗ заливки, число ЖИРНОЕ, верх 2px', () => {
        const r = ruleBlock('#wsPrintSheet .wsp-day.wsp-off {');
        assertTrue(r !== '', 'правило выходного дня есть');
        assertTrue(r.indexOf('background') === -1,
            'заливки выходных в шапке НЕТ (Task 442)');
        assertTrue(r.indexOf('font-weight: 700') !== -1,
            'число выходного дня — ЖИРНОЕ');
        assertTrue(r.indexOf('border-top: 2px solid #8f99a3') !== -1,
            'толстая линия — верх контура полосы');
        const s = ruleBlock('#wsPrintSheet .wsp-day.wsp-off span {');
        assertTrue(s.indexOf('font-weight: 400') !== -1,
            'день недели под числом — обычный');
        assertTrue(INDEX_SRC.indexOf('#wsPrintSheet .wsp-day.wsp-off { background: #dfe5e9; }') === -1,
            'прежняя серая заливка шапки удалена');
    });

    test('CSS: края полосы в шапке — wsp-off-edge-l/r (2px)', () => {
        const l = ruleBlock('#wsPrintSheet .wsp-day.wsp-off-edge-l {');
        const r = ruleBlock('#wsPrintSheet .wsp-day.wsp-off-edge-r {');
        assertTrue(l.indexOf('border-left: 2px solid #8f99a3') !== -1,
            'левый край полосы — толстый');
        assertTrue(r.indexOf('border-right: 2px solid #8f99a3') !== -1,
            'правый край полосы — толстый');
    });

    test('CSS: тело — серой заливки нет, контурные края !important', () => {
        assertTrue(INDEX_SRC.indexOf('.wsp-cell.wsp-cell-off { background: #e2e8ec !important; }') === -1,
            'прежняя серая заливка ячеек удалена');
        const l = ruleBlock('#wsPrintSheet .wsp-cell.wsp-cell-off.wsp-off-edge-l {');
        const r = ruleBlock('#wsPrintSheet .wsp-cell.wsp-cell-off.wsp-off-edge-r {');
        const b = ruleBlock('#wsPrintSheet .wsp-cell.wsp-cell-off.wsp-off-edge-b {');
        assertTrue(l.indexOf('border-left: 2px solid #8f99a3 !important') !== -1 &&
                   r.indexOf('border-right: 2px solid #8f99a3 !important') !== -1 &&
                   b.indexOf('border-bottom: 2px solid #8f99a3 !important') !== -1,
            'бока/низ контура — толстые, выше пунктира плана отпуска');
    });

    test('JS: шапка собирает offArr и края полосы по соседям', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf('var offArr = []') !== -1,
            'флаги нерабочих дней собираются заранее');
        assertTrue(b.indexOf("wsp-off-edge-l' : ''") !== -1 &&
                   b.indexOf("wsp-off-edge-r' : ''") !== -1,
            'края полосы ставятся в th выходных');
        assertTrue(b.indexOf('ei === viewEmps.length - 1') !== -1,
            'последняя строка получает флаг (низ контура)');
    });
});

// ============================================================
// 3. SRC — PDF и Excel
// ============================================================
describe('Task 442 — SRC: PDF (зоны кодов нет, контур, даты)', () => {

    test('_printPdfLayout: мероприятий — вся ширина, кодов нет', () => {
        const l = stripComments(methodText(WS_CLIENT, '_printPdfLayout'));
        assertTrue(l.indexOf('var evW = W - 2 * M;') !== -1,
            'evW = вся ширина листа (зона кодов не вычитается)');
        assertTrue(l.indexOf('codeW') === -1 && l.indexOf('colGap') === -1,
            'геометрии зоны кодов нет');
        assertTrue(l.indexOf('codes') === -1, 'страницы не несут коды');
    });

    test('_printPdfPaintPage: даты/контур/без бейджей и заливок', () => {
        const p = stripComments(methodText(WS_CLIENT, '_printPdfPaintPage'));
        assertTrue(p.indexOf("(day.off ? '700 ' : '') + '7px Arial'") !== -1,
            'число выходного — ЖИРНОЕ, будни — обычные');
        assertTrue(p.indexOf('#dfe5e9') === -1 && p.indexOf('#e2e8ec') === -1,
            'заливок выходных (шапка/тело) нет');
        assertTrue(p.indexOf('cell.events') === -1, 'бейджи не рисуются');
        assertTrue(p.indexOf('ctx.lineWidth = 1.4;') !== -1 &&
                   p.indexOf('ctx.strokeRect(') !== -1,
            'толстый контур полос выходных (strokeRect)');
        assertTrue(p.indexOf("ctx.strokeStyle = '#8f99a3';") !== -1,
            'цвет контура — как рамки HTML-печати');
        assertTrue(p.indexOf('var evMaxW = x0 + CW - ex;') !== -1,
            'перенос мероприятий — до края листа');
    });

    test('_printModel: поле codes/usedCodes/events-бейджей нет', () => {
        const m = stripComments(methodText(WS_CLIENT, '_printModel'));
        assertTrue(m.indexOf('_printCodesData') === -1,
            'перечень кодов не строится (метод удалён)');
        assertTrue(m.indexOf('usedCodes') === -1, 'usedCodes нет');
        assertTrue(m.indexOf('events: badges') === -1,
            'бейджей в клетках модели нет');
        assertTrue(extractMethod(WS_CLIENT, '_printCodesData') === null,
            'метод _printCodesData удалён из объекта');
    });
});

describe('Task 442 — SRC: Excel (столбца кодов нет, контур, даты)', () => {

    test('_wsTabelStyleMap — карта индексов (единая)', () => {
        const m = stripComments(methodText(WS_CLIENT, '_wsTabelStyleMap'));
        assertTrue(m.indexOf('coloredBase = 7') !== -1,
            'база цветных — 7 (indent-стили 7/8 сняты)');
        assertTrue(m.indexOf('headC = coloredBase + nColors') !== -1 &&
                   m.indexOf('dowsC = headC + 4') !== -1 &&
                   m.indexOf('bodyC = dowsC + 3') !== -1 &&
                   m.indexOf('colC = bodyC + 7') !== -1 &&
                   m.indexOf('regDate = colC + 7 * nColors') !== -1,
            'порядок: цветные → шапка T/TL/TR/TLR → дни L/R/LR → ' +
            'тело L/R/LR/B/BL/BR/BLR → цветные-контуры → regDate');
    });

    test('_wsTabelRows: контуры, жирные выходные, без кодов', () => {
        const r = stripComments(methodText(WS_CLIENT, '_wsTabelRows'));
        assertTrue(r.indexOf('stMap.headC + edge') !== -1,
            'число выходного — стиль шапки с контуром (жирное)');
        assertTrue(r.indexOf('stMap.regDate') !== -1,
            'обычные дни — новый НЕ жирный стиль');
        assertTrue(r.indexOf('stMap.bodyC + (combo - 1)') !== -1 &&
                   r.indexOf('stMap.colC + colorIdx[col] * 7 + (combo - 1)') !== -1,
            'контурные стили тела: обычные и цветные');
        assertTrue(r.indexOf("'Коды:'") === -1 && r.indexOf('codeLines') === -1,
            'столбца кодов D нет');
    });

    test('_wsTabelStylesXml: 7 шрифтов, 13 границ, medium-контур', () => {
        const st = stripComments(methodText(WS_CLIENT, '_wsTabelStylesXml'));
        assertTrue(st.indexOf('FF8F99A3') !== -1,
            'medium-границы цвета контура печати');
        assertTrue(st.indexOf('style="medium"') !== -1,
            'medium-стили границ строятся');
        assertTrue(st.indexOf('indent="1"') === -1,
            'indent-стилей кодов нет');
        assertTrue(st.indexOf('fontId="6"') !== -1,
            'шрифт НЕ жирных белых чисел дат (fontId 6)');
    });
});

// ============================================================
// 4. VM — _printCell: контур полосы выходных
// ============================================================
describe('Task 442 — VM: _printCell (контур выходных)', () => {

    function cellHost(offDays) {
        // offDays — множество дней месяца, помеченных выходными
        const offs = {};
        for (const d of (offDays || [])) offs[d] = true;
        return new Function('return ({' +
            methodText(WS_CLIENT, '_printCell') + ',' +
            '_year: 2026, _month: 9,' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '_statusMeta: function(code) { return { code: code, color: "#FFE082" }; },' +
            '_calDayOff: function(day) { return !!' + JSON.stringify(offs) + '[day]; },' +
            '_vacationAt: function() { return null; },' +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')();
    }

    const EMP = { 'таб_номер': '017' };

    test('полоса Сб+Вс: край-л у субботы, край-р у воскресенья', () => {
        // выходные 5 и 6 (суббота+воскресенье подряд)
        const h = cellHost([5, 6]);
        const sat = h._printCell(5, '2026-09-05', EMP, null);
        const sun = h._printCell(6, '2026-09-06', EMP, null);
        assertTrue(sat.indexOf('wsp-cell-off wsp-off-edge-l') !== -1 &&
                   sat.indexOf('wsp-off-edge-r') === -1,
            'суббота — ЛЕВЫЙ край полосы (правого нет)');
        assertTrue(sun.indexOf('wsp-off-edge-r') !== -1 &&
                   sun.indexOf('wsp-off-edge-l') === -1,
            'воскресенье — ПРАВЫЙ край полосы');
        assertTrue(sat.indexOf('wsp-off-edge-b') === -1 &&
                   sun.indexOf('wsp-off-edge-b') === -1,
            'низа нет — строка не последняя');
        assertTrue(sat.indexOf('background:') === -1,
            'фона у выходного НЕТ (только контур)');
    });

    test('одиночный выходной — оба края на нём', () => {
        const h = cellHost([12]);
        const td = h._printCell(12, '2026-09-12', EMP, null);
        assertTrue(td.indexOf('wsp-off-edge-l') !== -1 &&
                   td.indexOf('wsp-off-edge-r') !== -1,
            'одиночный выходной — полоса из одного дня, оба края');
    });

    test('внутри полосы краёв нет; последняя строка — низ', () => {
        const h = cellHost([5, 6, 7]);
        const mid = h._printCell(6, '2026-09-06', EMP, null);
        assertTrue(mid.indexOf('wsp-cell-off') !== -1 &&
                   mid.indexOf('wsp-off-edge-l') === -1 &&
                   mid.indexOf('wsp-off-edge-r') === -1,
            'средний день полосы — без краёв (thin внутри контура)');
        const last = h._printCell(6, '2026-09-06', EMP, null, true);
        assertTrue(last.indexOf('wsp-off-edge-b') !== -1,
            'isLastRow — нижняя толстая линия контура');
        const first = h._printCell(5, '2026-09-05', EMP, null, true);
        assertTrue(first.indexOf('wsp-off-edge-l') !== -1 &&
                   first.indexOf('wsp-off-edge-b') !== -1,
            'первый день полосы в последней строке — край + низ');
    });

    test('статусная ячейка в полосе — свой цвет + маркер контура', () => {
        const h = cellHost([5, 6]);
        const td = h._printCell(5, '2026-09-05', EMP, { 'статус': 'Н' });
        assertTrue(td.indexOf('background:#FFE082') !== -1,
            'цвет статуса сохранён (фон кода — не выделение выходного)');
        assertTrue(td.indexOf('wsp-cell-off wsp-off-edge-l') !== -1,
            'ячейка в полосе — в контуре (Task 442: маркер у ВСЕХ)');
    });

    test('статус-мероприятие — ПУСТАЯ ячейка без бейджа', () => {
        const h = cellHost([]);
        const td = h._printCell(9, '2026-09-09', EMP, { 'статус': 'И' });
        assertTrue(td.indexOf('>И<') === -1 && td.indexOf('wsp-ev') === -1,
            'ни кода, ни значка (мероприятие — списком под таблицей)');
        assertTrue(td.indexOf('background:') === -1, 'фона нет');
    });
});

// ============================================================
// 5. VM — _buildPrintHtml: шапка и тело листа
// ============================================================
describe('Task 442 — VM: печатный лист (шапка/контур/секции)', () => {

    function sheetHost(opts) {
        opts = opts || {};
        return new Function('ProdCalendar', 'return ({' +
            methodText(WS_CLIENT, '_buildPrintHtml') + ',\n' +
            '_year: 2026, _month: 9, _view: ' + JSON.stringify(opts.view || 'full') + ',' +
            '_isoDate: function(dt) { return dt.getFullYear() + "-" + ' +
                '(dt.getMonth() < 9 ? "0" : "") + (dt.getMonth() + 1) + "-" + ' +
                '(dt.getDate() < 10 ? "0" : "") + dt.getDate(); },' +
            '_buildEntryIndex: function() { return ' + JSON.stringify(opts.entries || {}) + '; },' +
            '_PENDING: ' + JSON.stringify(opts.pending || {}) + ',' +
            '_empTipLine: function() { return "смена №1"; },' +
            '_STATUS_CODES: ' + JSON.stringify([
                { code: 'Д', short: 'день 12ч', name: 'День, плановая 12-часовая смена', color: '#FFE082' },
                { code: 'ОТ', short: 'отпуск', name: 'Отпуск', color: '#ECEFF1' }]) + ',' +
            '_TRAININGS: ' + JSON.stringify(opts.trainings || []) + ',' +
            '_EMPLOYEES: [{ "ФИО": "Иванов Иван Иванович", "таб_номер": "017" }],' +
            '_trainingCodeOf: function(t) { return t === "инструктаж" ? "И" : ""; },' +
            '_instrShortOf: function(t) { return "Повторный инструктаж"; },' +
            '_calDayOff: function(day) { var dw = new Date(2026, 8, day).getDay(); return dw === 0 || dw === 6; },' +
            '_vacationAt: function() { return null; },' +
            '_eventsAt: function() { return []; },' +
            '_statusMeta: function(code) { return { code: code, color: "#FFE082" }; },' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            (opts.realPrintCell ? methodText(WS_CLIENT, '_printCell') + ',' :
                '_printCell: function(day, iso, emp, entry, isLast) { ' +
                'return "<td data-day=" + day + " data-last=" + ' +
                '(isLast ? 1 : 0) + ">[" + (entry ? entry.статус : "-") + ' +
                '"]</td>"; },') +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')({ dayInfo: function() { return null; } });
    }

    const EMPS = [{ 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' }];
    const AGG = { byTab: { '017': { work: 21, overDays: 0 } } };

    test('шапка: суббота 05.09 — край-л полосы, воскресенье 06.09 — край-р', () => {
        // сентябрь 2026: 1-е — вторник; выходные полосы 5–6, 12–13…
        const html = sheetHost()._buildPrintHtml(EMPS, AGG);
        const th5 = html.slice(html.lastIndexOf('<th class="wsp-day', html.indexOf('>5<span>Сб</span>')),
                               html.indexOf('>5<span>Сб</span>'));
        assertTrue(th5.indexOf('wsp-off') !== -1 && th5.indexOf('wsp-off-edge-l') !== -1,
            'суббота 5-е — класс выходного + ЛЕВЫЙ край полосы');
        const th6 = html.slice(html.lastIndexOf('<th class="wsp-day', html.indexOf('>6<span>Вс</span>')),
                               html.indexOf('>6<span>Вс</span>'));
        assertTrue(th6.indexOf('wsp-off-edge-r') !== -1 && th6.indexOf('wsp-off-edge-l') === -1,
            'воскресенье 6-е — ПРАВЫЙ край полосы');
        const th12 = html.slice(html.lastIndexOf('<th class="wsp-day', html.indexOf('>12<span>Сб</span>')),
                                html.indexOf('>12<span>Сб</span>'));
        const th13 = html.slice(html.lastIndexOf('<th class="wsp-day', html.indexOf('>13<span>Вс</span>')),
                                html.indexOf('>13<span>Вс</span>'));
        assertTrue(th12.indexOf('wsp-off-edge-l') !== -1 &&
                   th13.indexOf('wsp-off-edge-r') !== -1,
            'вторая полоса 12–13 — та же схема краёв');
        const th4 = html.slice(html.lastIndexOf('<th class="wsp-day', html.indexOf('>4<span>Пт</span>')),
                               html.indexOf('>4<span>Пт</span>'));
        assertTrue(th4.indexOf('wsp-off') === -1,
            'пятница 4-е — рабочий день, без классов выходного');
    });

    test('тело: последняя строка несёт низ контура (isLastRow)', () => {
        const html = sheetHost({ realPrintCell: true })._buildPrintHtml(EMPS, AGG);
        // единственная строка — последняя: ячейки выходных 5/6/12/13
        // несут wsp-cell-off и wsp-off-edge-b
        const m = html.match(/class="wsp-cell wsp-cell-off[^"]*"/g) || [];
        assertTrue(m.length >= 8, 'клеток полос выходных достаточно: ' + m.length);
        let withBottom = 0;
        for (const cls of m) { if (cls.indexOf('wsp-off-edge-b') !== -1) withBottom++; }
        assertEqual(withBottom, m.length,
            'ВСЕ клетки выходных в последней строке — с нижней линией');
        const sat = (html.match(/class="wsp-cell wsp-cell-off wsp-off-edge-l[^"]*"/g) || [])[0];
        assertTrue(!!sat && sat.indexOf('wsp-off-edge-b') !== -1,
            'суббота: край-л + низ (угол контура)');
    });

    test('бейджей и легенды на листе нет, мероприятия живы', () => {
        const html = sheetHost({ realPrintCell: true,
                                 trainings: [{ 'тип': 'инструктаж', 'тема': 'Повторный инструктаж',
                                               'дата_начала': '2026-09-02', 'дата_окончания': '2026-09-02',
                                               'таб_номер': '017' }] })
            ._buildPrintHtml(EMPS, AGG);
        assertTrue(html.indexOf('wsp-ev') === -1, 'бейджей нет');
        assertTrue(html.indexOf('wsp-legend') === -1 && html.indexOf('Коды:') === -1,
            'легенды кодов нет');
        assertTrue(html.indexOf('Мероприятия · сентябрь 2026 · 1') !== -1,
            'список мероприятий с счётчиком жив');
        assertTrue(html.indexOf('wsp-mev-item') !== -1,
            'записи мероприятий живы');
    });
});

// ============================================================
// 6. VM — PDF-раскладка: без кодов
// ============================================================
describe('Task 442 — VM: раскладка PDF (без кодов)', () => {

    function fakeModel(nRows, nEvents, offDays) {
        const days = [];
        for (let d = 1; d <= 30; d++) {
            days.push({ d: d, dow: 'Пн', off: offDays && offDays.indexOf(d) !== -1,
                        feast: false, short: false });
        }
        const rows = [];
        for (let r = 0; r < nRows; r++) {
            rows.push({ fio: 'Работник №' + (r + 1), tip: '', tab: String(r),
                        cells: [], inAgg: true, work: 21, overDays: 0 });
        }
        const events = [];
        for (let e = 0; e < nEvents; e++) {
            events.push({ range: '0' + ((e % 9) + 1) + '.09',
                          text: 'Событие ' + (e + 1), code: 'И', color: '#B3E5FC' });
        }
        return { year: 2026, month: 9, view: 'full',
                 days: days, rows: rows, events: events };
    }

    function layoutHost() {
        return new Function('return ({' +
            methodText(WS_CLIENT, '_printPdfLayout') + '});')();
    }

    test('обычный месяц — 1 страница, без кодов, evW = вся ширина', () => {
        const lay = layoutHost()._printPdfLayout(fakeModel(10, 3, [5, 6]));
        assertEqual(lay.pages.length, 1, 'одна страница');
        assertTrue(!lay.pages[0].codes, 'кодов на странице нет');
        assertEqual(lay.evW, lay.W - 2 * lay.M,
            'зона мероприятий = лист без полей (зоны кодов нет)');
        assertTrue(!('codeW' in lay) && !('colGap' in lay),
            'геометрия зоны кодов не возвращается');
    });

    test('выходные не влияют на пагинацию (контур — отрисовка)', () => {
        const lay = layoutHost()._printPdfLayout(fakeModel(30, 0, [5, 6, 12, 13]));
        let total = 0;
        for (const p of lay.pages) total += p.rows.length;
        assertEqual(total, 30, 'все строки распределены');
        for (const p of lay.pages) {
            assertTrue(!p.codes, 'кодов нигде нет');
        }
    });
});

// ============================================================
// 7. VM — Excel: контуры, жирные даты, без кодов
// ============================================================
describe('Task 442 — VM: Excel (контур выходных + regDate)', () => {

    function tabelHost() {
        return new Function('return ({' +
            methodText(WS_CLIENT, '_wsTabelStyleMap') + ',' +
            methodText(WS_CLIENT, '_wsTabelStylesXml') + ',' +
            methodText(WS_CLIENT, '_wsTabelRows') +
            '});')();
    }

    // 5 дней; выходные — 3 (Сб) и 4 (Вс); 1 строка (последняя)
    const MODEL = {
        view: 'full', month: 9, year: 2026,
        days: [{ d: 1, dow: 'Вт', off: false, short: false },
               { d: 2, dow: 'Ср', off: false, short: false },
               { d: 3, dow: 'Сб', off: true, short: false },
               { d: 4, dow: 'Вс', off: true, short: false },
               { d: 5, dow: 'Пн', off: false, short: false }],
        rows: [{ fio: 'Иванов И. И.', tip: 'смена №1', inAgg: true,
                 work: 3, overDays: 0,
                 cells: [{ status: 'Д', color: '#FFE082' },
                         { status: '', color: '' },
                         { status: 'ОТ', color: '#ECEFF1' },
                         { status: '', color: '' },
                         { status: 'Д', color: '#FFE082' }] }],
        events: [{ range: '01.09', text: 'Плановое обслуживание', color: '#B3E5FC' }]
    };

    test('карта стилей: цветные/контуры/regDate — арифметика', () => {
        const h = tabelHost();
        const st = h._wsTabelStyleMap(1);
        assertEqual(st.coloredBase, 7, 'база цветных — 7');
        assertEqual(st.headC, 8, 'шапка T/TL/TR/TLR — 8..11');
        assertEqual(st.dowsC, 12, 'дни недели L/R/LR — 12..14');
        assertEqual(st.bodyC, 15, 'тело L/R/LR/B/BL/BR/BLR — 15..21');
        assertEqual(st.colC, 22, 'цветные-контуры — 22..28');
        assertEqual(st.regDate, 29, 'обычные (не жирные) даты — 29');
    });

    test('строки: шапка — жирные выходные с контуром, будни — regDate', () => {
        // 2 цвета в colorIdx → карта: coloredBase 7, headC 9,
        // dowsC 13, bodyC 16, colC 23, regDate 37
        const rows = tabelHost()._wsTabelRows(MODEL, { FFE082: 0, ECEFF1: 1 });
        // строки: 1 заголовок, 2 подзаголовок, 3 пусто, 4 числа, 5 дни нед, 6 данные
        const head = rows[3], dows = rows[4], data = rows[5];
        assertEqual(head[1].s, 37, '1-е (будень) — regDate (НЕ жирное)');
        assertEqual(head[2].s, 37, '2-е (будень) — regDate');
        assertEqual(head[3].s, 10, '3-е (Сб, ЛЕВЫЙ край полосы 3–4) — headC+1 (TL)');
        assertEqual(head[4].s, 11, '4-е (Вс, ПРАВЫЙ край полосы) — headC+2 (TR)');
        assertEqual(head[6].s, 1, '«Дни» — прежняя жирная шапка s=1');
        assertEqual(head[7].s, 1, '«Перераб.» — прежняя жирная шапка s=1');
        assertEqual(dows[3].s, 13, 'день недели Сб — dowsC (L)');
        assertEqual(dows[1].s, 6, 'день недели будня — прежний s=6');
        // тело: последняя строка (единственная) — низ контура
        assertEqual(data[1].s, 7, 'Д (будень, цвет) — coloredBase+0');
        assertEqual(data[3].s, 34,
            'ОТ (Сб, левый край, последняя строка) — colC+1*7+4 (BL)');
        assertEqual(data[4].s, 21,
            'пустая Вс (правый край+низ) — bodyC+5 (BR)');
        assertEqual(data[5].s, 7, 'Д (будень, цвет) — цветной без контура');
    });

    test('styles.xml: counts, medium-контур, шрифт regDate', () => {
        const xml = tabelHost()._wsTabelStylesXml(['FFE082', 'ECEFF1']);
        assertEqual(xml.split('indent="1"').length - 1, 0, 'indent-стилей нет');
        assertTrue(xml.indexOf('<fonts count="7">') !== -1, '7 шрифтов');
        assertTrue(xml.indexOf('<borders count="13">') !== -1, '13 границ');
        assertTrue(xml.indexOf('<cellXfs count="38">') !== -1,
            'cellXfs = 22 + 8×2 = 38 (карта стилей)');
        assertTrue(xml.indexOf('FF8F99A3') !== -1, 'medium-цвет контура');
        const med = xml.split('style="medium"').length - 1;
        assertEqual(med, 20, 'medium-сторон: 11 комбинаций контура (границы общие)');
    });

    test('нижний блок — только A/B (столбца D нет)', () => {
        const rows = tabelHost()._wsTabelRows(MODEL, {});
        let hdr = null;
        for (const r of rows) {
            if (r[0] && String(r[0].v).indexOf('Мероприятия · ') === 0) hdr = r;
        }
        assertTrue(!!hdr, 'заголовок блока найден');
        assertEqual(hdr.length, 1, 'одна ячейка (без «Коды:»)');
        const first = rows[rows.indexOf(hdr) + 1];
        assertEqual(first.length, 2, 'A (дата) + B (текст) — и всё');
        assertEqual(first[0].v, '01.09', 'дата в A');
    });
});

// ============================================================
// 8. SW — версия кэша
// ============================================================
describe('Task 442 — SW: версия kipia-test-v753', () => {
    test('CACHE_VERSION = kipia-test-v753, прежней v665 нет', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v753'") !== -1,
            'CACHE_VERSION = kipia-test-v753');
        assertFalse(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v665'") !== -1,
            'v665 как активная версия больше не существует');
    });
});
