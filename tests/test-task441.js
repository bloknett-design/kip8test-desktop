// ============================================================
// Task 441 — заявка (kip8test):
//   «Во всех трёх представлениях печати коды сделай в один
//    столбец. Переноси все изменения в боевой репозиторий kip8».
//   (Перенос партии 438–441 в kip8 — см. worklog/DEPLOY репо kip8.)
//
// Task 442 (заявка: «убери … столбец с кодами»): ЛЕГЕНДА КОДОВ
// УДАЛЕНА из всех трёх представлений печати. Исторические тесты
// Task 441 («один столбец») переработаны под новую реальность:
// проверяется, что столбца/блока кодов БОЛЬШЕ НЕТ ни в HTML,
// ни в PDF, ни в Excel, а «Мероприятия» остались на всю ширину.
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

// ============================================================
// 1. SRC — HTML-печать: легенда кодов УДАЛЕНА (Task 442)
// ============================================================
describe('Task 441/442 — SRC: печать HTML (столбец кодов удалён)', () => {

    test('CSS: правила легенды .wsp-legend* сняты (Task 442)', () => {
        assertTrue(ruleBlock('#wsPrintSheet .wsp-legend-cols {') === '' &&
                   INDEX_SRC.indexOf('#wsPrintSheet .wsp-legend {') === -1 &&
                   INDEX_SRC.indexOf('#wsPrintSheet .wsp-legend-t {') === -1,
            'правила .wsp-legend/.wsp-legend-t/.wsp-legend-cols удалены');
        assertTrue(INDEX_SRC.indexOf('#wsPrintSheet .wsp-lg {') === -1 &&
                   INDEX_SRC.indexOf('#wsPrintSheet .wsp-lg i {') === -1,
            'правила записи кода .wsp-lg/.wsp-lg i удалены');
    });

    test('JS: разметки легенды в _buildPrintHtml НЕТ', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertFalse(b.indexOf('wsp-legend') !== -1,
            'блок wsp-legend не строится (столбец кодов удалён, Task 442)');
        assertFalse(b.indexOf('Коды:') !== -1,
            'заголовка «Коды:» нет');
        assertFalse(b.indexOf('wsp-lg') !== -1,
            'записей-кодов wsp-lg нет');
        assertFalse(b.indexOf('usedCodes') !== -1,
            'сбор usedCodes снят — перечню кодов больше некуда идти');
        assertTrue(b.indexOf('Мероприятия · ') !== -1,
            'список мероприятий жив (Task 360)');
    });

    test('CSS: .wsp-bottom — ОДНА колонка на всю ширину (Task 442)', () => {
        const r = ruleBlock('#wsPrintSheet .wsp-bottom {');
        assertTrue(r !== '', 'правило обёртки живо');
        assertFalse(r.indexOf('display: flex') !== -1,
            'flex-ряд снят — кодов справа больше нет');
        assertFalse(r.indexOf('gap') !== -1,
            'зазор между блоками снят вместе с блоком кодов');
        const m = ruleBlock('#wsPrintSheet .wsp-mev {');
        assertFalse(m.indexOf('flex:') !== -1 || m.indexOf('min-width') !== -1,
            'столбик мероприятий не ограничен — вся ширина листа');
    });
});

// ============================================================
// 2. SRC — PDF: зона кодов удалена, мероприятия — вся ширина
// ============================================================
describe('Task 441/442 — SRC: PDF (зона кодов удалена)', () => {

    test('_printPdfLayout: codeW/colGap/страницы-коды сняты', () => {
        const b = stripComments(methodText(WS_CLIENT, '_printPdfLayout'));
        assertFalse(b.indexOf('codeW') !== -1,
            'ширины зоны кодов нет (Task 442: столбец удалён)');
        assertFalse(b.indexOf('colGap') !== -1,
            'зазора мероприятий↔коды нет (Task 440 снят Task 442)');
        assertFalse(b.indexOf('codes') !== -1,
            'страницы больше не несут коды');
        assertFalse(b.indexOf('cdH') !== -1 && b.indexOf('Math.max(evH') !== -1,
            'пары блоков max(evH, cdH) нет');
        assertTrue(b.indexOf('var evW = W - 2 * M;') !== -1,
            'мероприятия — ВСЯ ширина листа (без вычета зоны кодов)');
    });

    test('_printPdfPaintPage: page.codes/код-зоны удалены', () => {
        const b = stripComments(methodText(WS_CLIENT, '_printPdfPaintPage'));
        assertFalse(b.indexOf('page.codes') !== -1,
            'отрисовки кодов нет (Task 442)');
        assertFalse(b.indexOf('evZoneW') !== -1 || b.indexOf('codeX') !== -1,
            'геометрии зон (Task 439/440) нет');
        assertFalse(b.indexOf("fillText('Коды:'") !== -1,
            'заголовка «Коды:» в PDF нет');
        assertTrue(b.indexOf('var evMaxW = x0 + CW - ex;') !== -1,
            'перенос текста мероприятий — до правого края ЛИСТА');
    });

    test('SRC: бейджи и заливка выходных в PDF сняты (Task 442)', () => {
        const b = stripComments(methodText(WS_CLIENT, '_printPdfPaintPage'));
        assertFalse(b.indexOf('cell.events') !== -1,
            'бейджи мероприятий в ячейках не рисуются');
        assertFalse(b.indexOf('#e2e8ec') !== -1,
            'серой заливки нерабочих дней нет');
        assertFalse(b.indexOf('#dfe5e9') !== -1,
            'заливки выходных в шапке нет');
        assertTrue(b.indexOf("ctx.font = (day.off ? '700 ' : '') + '7px Arial';") !== -1,
            'число выходного дня — ЖИРНОЕ (обычные — обычные)');
        assertTrue(b.indexOf('ctx.lineWidth = 1.4;') !== -1,
            'толстый контур полос выходных (strokeRect)');
    });
});

// ============================================================
// 3. VM — раскладка PDF: страницы без кодов
// ============================================================
describe('Task 441/442 — VM: раскладка PDF (без кодов)', () => {

    function fakeModel(nRows, nEvents) {
        const days = [];
        for (let d = 1; d <= 30; d++) {
            days.push({ d: d, dow: 'Пн', off: false, feast: false, short: false });
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
            methodText(WS_CLIENT, '_printPdfLayout') +
            '});')();
    }

    test('VM: обычный месяц — одна страница, кодов на ней нет', () => {
        const lay = layoutHost()._printPdfLayout(fakeModel(10, 3));
        assertEqual(lay.pages.length, 1, 'всё на одной странице');
        assertEqual(lay.pages[0].events.length, 3, 'события на странице');
        assertTrue(!('codes' in lay.pages[0]) || !lay.pages[0].codes,
            'страница больше не несёт коды (Task 442)');
    });

    test('VM: 22 строки + 33 события — 2 страницы, последняя — события', () => {
        // 22 строки → 2 страницы; 33 события не влезают под таблицу —
        // уезжают своей страницей; кодов нигде нет
        const lay = layoutHost()._printPdfLayout(fakeModel(22, 33));
        assertTrue(lay.pages.length >= 2, 'таблица + страница событий');
        const last = lay.pages[lay.pages.length - 1];
        assertTrue(!!last.events, 'последняя страница — мероприятия');
        for (let p = 0; p < lay.pages.length; p++) {
            assertTrue(!lay.pages[p].codes,
                'страница ' + (p + 1) + ' без кодов (Task 442)');
        }
    });

    test('VM: пустой месяц (0 строк, 0 событий) — заглушка, не падает', () => {
        const lay = layoutHost()._printPdfLayout(fakeModel(0, 0));
        assertTrue(lay.pages.length >= 1, 'страница есть');
        const last = lay.pages[lay.pages.length - 1];
        assertTrue(!!last.events, 'страница-заглушка мероприятий');
    });
});

// ============================================================
// 4. VM — Excel: столбца кодов D нет
// ============================================================
describe('Task 441/442 — VM: Excel (столбец кодов удалён)', () => {

    function tabelHost() {
        return new Function('ProdCalendar', 'return ({' +
            methodText(WS_CLIENT, '_printModel') + ',' +
            methodText(WS_CLIENT, '_printEventsData') + ',' +
            methodText(WS_CLIENT, '_wsTabelStyleMap') + ',' +
            methodText(WS_CLIENT, '_wsTabelStylesXml') + ',' +
            methodText(WS_CLIENT, '_wsTabelRows') + ',' +
            methodText(WS_CLIENT, '_wsTabelSheetXml') + ',' +
            methodText(WS_CLIENT, '_buildTabelWorkbook') + ',' +
            methodText(WS_CLIENT, '_wsXlsZip') + ',' +
            methodText(WS_CLIENT, '_wsXlsBytes') + ',' +
            methodText(WS_CLIENT, '_wsXlsCrc32') + ',' +
            methodText(WS_CLIENT, '_wsXlsColName') + ',' +
            methodText(WS_CLIENT, '_wsXlsEsc') + ',' +
            methodText(WS_CLIENT, '_wsXlsDocProps') + ',' +
            '_year: 2026, _month: 9, _view: "full",' +
            '_isoDate: function(dt) { return dt.getFullYear() + "-" + ' +
                '(dt.getMonth() < 9 ? "0" : "") + (dt.getMonth() + 1) + "-" + ' +
                '(dt.getDate() < 10 ? "0" : "") + dt.getDate(); },' +
            '_buildEntryIndex: function() { return ' + JSON.stringify({
                '2026-09-02|017': { 'статус': 'ОТ' },
                '2026-09-03|031': { 'статус': 'Д' },
                '2026-09-04|017': { 'статус': '.' }
            }) + '; },' +
            '_PENDING: {},' +
            '_empTipLine: function(emp) { return emp && emp["таб_номер"] === "031" ? "дневной" : "смена №1"; },' +
            '_STATUS_CODES: ' + JSON.stringify([
                { code: 'Д', short: 'день 12ч', name: 'День, плановая 12-часовая смена', color: '#FFE082' },
                { code: 'ОТ', short: 'отпуск', name: 'Отпуск, ежегодный основной оплачиваемый отпуск', color: '#ECEFF1' },
                { code: '', short: 'выходной', name: 'Выходной, плановый выходной день', color: '#EEF0F2' }]) + ',' +
            '_TRAININGS: [{ "тип": "инструктаж", "тема": "Повторный инструктаж по охране труда",' +
            '  "дата_начала": "2026-09-02", "дата_окончания": "2026-09-02", "таб_номер": "017" }],' +
            '_EMPLOYEES: [{ "ФИО": "Иванов Иван Иванович", "таб_номер": "017" },' +
                        '{ "ФИО": "Сидоров Сидор Сидорович", "таб_номер": "031" }],' +
            '_trainingCodeOf: function(t) { return t === "инструктаж" ? "И" : ""; },' +
            '_instrShortOf: function(t) { return "Повторный инструктаж"; },' +
            '_calDayOff: function(day) { return day % 7 === 0 || day % 7 === 6; },' +
            '_vacationAt: function() { return null; },' +
            '_eventsAt: function() { return []; },' +
            '_statusMeta: function(code) {' +
            '    var m = { "Д": { code: "Д", color: "#FFE082" },' +
            '              "ОТ": { code: "ОТ", color: "#ECEFF1" },' +
            '              "И": { code: "И", color: "#B3E5FC" } };' +
            '    return m[code] || {};' +
            '},' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '});')({ dayInfo: function() { return null; } });
    }

    const EMPS = [
        { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' },
        { 'ФИО': 'Сидоров Сидор Сидорович', 'таб_номер': '031' }
    ];
    const AGG = { byTab: { '017': { work: 21, overDays: 3 },
                           '031': { work: 19, overDays: 0 } } };

    test('VM: блок под сеткой — только A/B, колонок C/D нет', () => {
        const host = tabelHost();
        const m = host._printModel(EMPS, AGG);
        const rows = host._wsTabelRows(m, {});
        let hdrIdx = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] && String(rows[i][0].v).indexOf('Мероприятия · ') === 0) {
                hdrIdx = i; break;
            }
        }
        assertTrue(hdrIdx !== -1, 'заголовок блока найден');
        assertEqual(rows[hdrIdx].length, 1,
            'заголовок — ОДНА ячейка (без «Коды:» в D)');
        for (let i = hdrIdx + 1; i < rows.length; i++) {
            assertTrue(rows[i].length <= 2,
                'строка блока — не шире 2 колонок (A–B), было: ' + rows[i].length);
            for (let c = 2; c < rows[i].length; c++) {
                assertTrue(!rows[i][c], 'правее B ячеек нет');
            }
        }
        assertTrue(!('codes' in m), 'модель печати не несет codes (Task 442)');
    });

    test('SRC: _wsTabelRows — кодов/«Коды:» нет в коде метода', () => {
        const b = stripComments(methodText(WS_CLIENT, '_wsTabelRows'));
        assertFalse(b.indexOf('Коды:') !== -1,
            'заголовка «Коды:» нет (Task 442)');
        assertFalse(b.indexOf('codeLines') !== -1,
            'строк кодов нет');
    });
});

// ============================================================
// 5. SW — версия кэша
// ============================================================
describe('Task 441 — SW: версия kipia-test-v754', () => {
    test('CACHE_VERSION = kipia-test-v754, прежней v665 нет', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v754'") !== -1,
            'CACHE_VERSION = kipia-test-v754');
        assertFalse(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v665'") !== -1,
            'v665 как активная версия больше не существует');
    });
});
