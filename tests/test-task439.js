// ============================================================
// Task 439 — заявка (kip8test), три части:
//   1) «В печатном графике блок с кодами размести справа от
//      мероприятий»;
//   2) «в колонке с работниками оставь только ФИО и Тип и сузь
//      этот столбец по размеру самого большого текста в его
//      ячейках»;
//   3) «В мобильной версии, в разделе Табель учёта рабочего
//      времени, убери лишний код "Выходной, плановый выходной
//      день" который старый со знаком "." при выборе в ячейках
//      шахматки».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   ПЕЧАТЬ HTML (SRC+VM):
//   1) колонка работника: под ФИО — ТОЛЬКО Тип (_empTipLine:
//      «смена №1»/«сменный»/«дневной»), должность убрана,
//      метод _posLabel удалён из файла; ширина колонки — по
//      самому большому тексту ячейки (ФИО/Тип/заголовок
//      «Работник»), кламп 12–48mm;
//   2) нижняя секция wsp-bottom — РЯД (flex): мероприятия
//      слева (flex 1 1 auto), коды справа (flex 0 0 92mm,
//      margin-top 0 — общая верхняя линия), зазор 6mm;
//      DOM-порядок секций не изменился (мероприятия, затем
//      коды — внутри обёртки);
//   МОДЕЛЬ/PDF:
//   3) _printModel: строка несёт tip (Тип), поля pos нет;
//   4) _printPdfLayout: мероприятия и коды — РЯДОМ (высота
//      пары = max(evH, cdH), а не сумма): компактный месяц —
//      одна страница; граничный случай, который прежде не
//      влезал (сумма) — теперь влезает (max); события режутся
//      по бюджету строк; codeW/colGap/evW в раскладке;
//   5) _printPdfPaintPage: строка — row.tip; empW меряется по
//      ФИО+Тип+«Работник» (кламп 46–150); «Коды:» рисуются в
//      ПРАВОЙ зоне (codeX), текст мероприятий переносится по
//      словам в пределах левой зоны;
//   EXCEL:
//   6) ячейка A — «ФИО + \n + Тип» (стиль 5 wrapText), ширина
//      столбца A — по самому большому тексту (не фикс. 30);
//      мероприятия — A/B, «Коды:» и коды — в колонке D на тех
//      же строках (справа от мероприятий);
//   ПОПАП/НОРМАЛИЗАЦИЯ (мобильная шахматка):
//   7) _normalizeStatusCodes: «точечные» легаси-коды («.» с
//      пробелами, «·») НЕ попадают в хвост списка (слот
//      «Выходной» с пустым кодом есть всегда);
//   8) _renderCellPopup: строка «.» не рендерится, если есть
//      канонический слот «» (нет дубля «Выходной, плановый
//      выходной день»); справочник только с «.» рендерит
//      «Выходного» из «.» (регресс Task 387);
//   SW: kipia-test-v747 (главный), v664 — следующий не занят.
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

function mockEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// 1. SRC — колонка работника: ФИО + Тип, ширина по тексту
// ============================================================
describe('Task 439 — SRC: колонка «ФИО + Тип»', () => {

    test('SRC: строка работника — Тип (_empTipLine), не должность', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf('this._empTipLine(emp)') !== -1,
            'под ФИО — Тип работника (_empTipLine)');
        assertTrue(b.indexOf('this._posLabel(') === -1,
            'должность (_posLabel) из печатной колонки убрана');
        assertTrue(b.indexOf("'<span class=\"wsp-pos\">' + this._esc(tipLabel)") !== -1,
            'подпись в wsp-pos — tipLabel (Тип)');
    });

    test('SRC: метод _posLabel удалён из файла', () => {
        assertFalse(INDEX_SRC.indexOf('_posLabel: function') !== -1,
            'склеенная подпись «должность + тип» удалена (потребителей нет)');
        assertTrue(INDEX_SRC.indexOf('_empTipLine: function') !== -1,
            'хелпер Типа жив (сетка + печать)');
    });

    test('SRC: ширина колонки — ФИО, Тип и заголовок «Работник», кламп 12–48', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf("_empTipLine(viewEmps[wi])") !== -1,
            'в измерении ширины — Тип печатаемых строк');
        assertTrue(b.indexOf("measureTxt('Работник', '700 11px Arial', 11)") !== -1,
            'заголовок «Работник» тоже меряется (ширина по самому большому тексту)');
        assertTrue(b.indexOf('empWmm < 12') !== -1 && b.indexOf('empWmm > 48') !== -1,
            'кламп 12–48mm (мин снижен с 24mm — Тип короче должности)');
    });

    test('SRC: CSS .wsp-pos — прежняя подпись (8.5px), класс жив', () => {
        const i = INDEX_SRC.indexOf('#wsPrintSheet .wsp-pos {');
        assertTrue(i !== -1, 'правило .wsp-pos есть');
        const r = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(r.indexOf('font-size: 8.5px') !== -1,
            'шрифт Типа 8.5px (как прежняя подпись, Task 361)');
    });

    test('SRC: сетка — прежние три строки ячейки ФИО (регресс 402/403)', () => {
        const g = stripComments(methodText(WS_CLIENT, '_renderGrid'));
        assertTrue(g.indexOf('_empPosLine') !== -1 && g.indexOf('_empTipLine') !== -1,
            'сетка: должность (_empPosLine) + Тип (_empTipLine) — не тронуты');
    });
});

// ============================================================
// 2. SRC/VM — коды СПРАВА от мероприятий (печатный лист)
// ============================================================
describe('Task 439 — SRC: коды справа от мероприятий (CSS/DOM)', () => {

    function ruleBlock(sel) {
        const i = INDEX_SRC.indexOf(sel);
        if (i === -1) return '';
        return INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
    }

    test('CSS: .wsp-bottom — ОДНА колонка (Task 442: кодов нет)', () => {
        const r = ruleBlock('#wsPrintSheet .wsp-bottom {');
        assertTrue(r.indexOf('display: flex') === -1,
            'flex-ряд снят — блока кодов справа больше нет (Task 442)');
        assertTrue(r.indexOf('gap') === -1,
            'зазора между блоками нет (снят вместе с блоком кодов)');
        assertTrue(r.indexOf('margin-top: 2.5mm') !== -1,
            'отступ секции от таблицы жив (Task 364)');
    });

    test('CSS: .wsp-mev — вся ширина, .wsp-legend удалён (Task 442)', () => {
        const mev = ruleBlock('#wsPrintSheet .wsp-mev {');
        assertTrue(mev.indexOf('flex:') === -1 && mev.indexOf('min-width') === -1,
            'мероприятия не ограничены — столбик на всю ширину листа');
        assertTrue(ruleBlock('#wsPrintSheet .wsp-legend {') === '' &&
                   INDEX_SRC.indexOf('#wsPrintSheet .wsp-legend {') === -1,
            'правило .wsp-legend удалено вместе с блоком кодов');
    });

    test('DOM: в обёртке — только мероприятия (Task 442)', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        const iOpen = b.indexOf('<div class="wsp-bottom">');
        const iMev = b.indexOf('<div class="wsp-mev">');
        assertTrue(iOpen !== -1 && iMev !== -1,
            'обёртка и секция мероприятий строятся');
        assertTrue(iOpen < iMev, 'обёртка → мероприятия');
        assertTrue(b.indexOf('wsp-legend') === -1,
            'секции кодов в разметке нет (столбец удалён, Task 442)');
    });
});

// ============================================================
// 3. VM — печатный лист: Тип в колонке, коды рядом с мероприятиями
// ============================================================
describe('Task 439 — VM: печатный лист (колонка + ряд)', () => {

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
            '_empTipLine: function(emp) { return emp && emp[' + JSON.stringify(opts.tipKey || 'тип') + '] === "дневной" ? "дневной" : "смена №1"; },' +
            '_fmtTotalsNum: function(v) { return String(Math.round((v || 0) * 10) / 10).replace(".", ","); },' +
            '_STATUS_CODES: ' + JSON.stringify([
                { code: 'Д', short: 'день 12ч', name: 'День, плановая 12-часовая смена', color: '#FFE082' },
                { code: 'ОТ', short: 'отпуск', name: 'Отпуск, ежегодный основной оплачиваемый отпуск', color: '#ECEFF1' },
                { code: '', short: 'выходной', name: 'Выходной, плановый выходной день', color: '#EEF0F2' }]) + ',' +
            '_TRAININGS: ' + JSON.stringify(opts.trainings || [{
                'тип': 'инструктаж', 'тема': 'Повторный инструктаж',
                'дата_начала': '2026-09-02', 'дата_окончания': '2026-09-02',
                'таб_номер': '017' }]) + ',' +
            '_EMPLOYEES: [{ "ФИО": "Иванов Иван Иванович", "таб_номер": "017" },' +
                        '{ "ФИО": "Сидоров Сидор Сидорович", "таб_номер": "031" }],' +
            '_trainingCodeOf: function(t) { return t === "инструктаж" ? "И" : ""; },' +
            '_instrShortOf: function(t) { return "Повторный инструктаж"; },' +
            '_calDayOff: function(day) { return day % 7 === 0 || day % 6 === 0; },' +
            '_vacationAt: function() { return null; },' +
            '_eventsAt: function() { return []; },' +
            '_statusMeta: function(code) {' +
            '    var m = { "Д": { code: "Д", color: "#FFE082" },' +
            '              "ОТ": { code: "ОТ", color: "#ECEFF1" },' +
            '              "И": { code: "И", color: "#B3E5FC" } };' +
            '    return m[code] || {};' +
            '},' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '_printCell: function(day, iso, emp, entry) { return "<td>[" + (entry ? entry.статус : "-") + "]</td>"; },' +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')({ dayInfo: function() { return null; },
                     monthStats: function() { return null; } });
    }

    const EMPS = [
        { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' },
        { 'ФИО': 'Сидоров Сидор Сидорович', 'таб_номер': '031' }
    ];
    const AGG = { byTab: { '017': { work: 21, overDays: 3 },
                           '031': { work: 19, overDays: 0 } } };

    test('VM: колонка работника — ФИО + Тип, без должности', () => {
        const html = sheetHost()._buildPrintHtml(EMPS, AGG);
        assertTrue(html.indexOf('<span class="wsp-fio">Иванов Иван Иванович</span>') !== -1,
            'ФИО на месте');
        assertTrue(html.indexOf('<span class="wsp-pos">смена №1</span>') !== -1,
            'под ФИО — Тип «смена №1» (не должность)');
        assertTrue(html.indexOf('Слесарь') === -1,
            'должности в печатной колонке нет');
    });

    test('VM: ширина колонки — по самому большому тексту (12–48)', () => {
        const html = sheetHost()._buildPrintHtml(EMPS, AGG);
        const m = html.match(/<th class="wsp-emp" style="width:(\d+(?:\.\d+)?)mm">Работник<\/th>/);
        assertTrue(m !== null, 'inline ширина на месте');
        const w = parseFloat(m[1]);
        assertTrue(w >= 12 && w <= 48, 'в клампе 12–48mm: ' + w);
        // фолбэк Node: самое длинное ФИО «Сидоров Сидор Сидорович»
        // 23 симв × 10.5 × 0.62 = 149.7px = 39.6mm + 3.5 = 43.1 →
        // шаг 0.5mm вверх = 43.5mm — Тип «смена №1» (11.2mm) и
        // заголовок «Работник» (14.4mm) короче
        assertEqual(w, 43.5, 'по самому длинному ФИО печатаемых строк');
    });

    test('VM: в обёртке — только мероприятия (Task 442)', () => {
        const html = sheetHost({ entries: { '2026-09-02|017': { 'статус': 'ОТ' } } })
            ._buildPrintHtml(EMPS, AGG);
        const iOpen = html.indexOf('<div class="wsp-bottom">');
        const iMev = html.indexOf('<div class="wsp-mev">');
        assertTrue(iOpen !== -1 && iMev !== -1,
            'обёртка и секция мероприятий строятся');
        assertTrue(iOpen < iMev, 'мероприятия — первая (и единственная) секция');
        const row = html.slice(iOpen, html.indexOf('</div></div>', iOpen));
        assertTrue(row.indexOf('Мероприятия · сентябрь 2026 · 1') !== -1,
            'заголовок мероприятий на месте');
        assertTrue(row.indexOf('Коды:') === -1,
            'заголовка кодов нет (столбец удалён, Task 442)');
        assertTrue(row.indexOf('ОТ — отпуск') === -1,
            'расшифровок кодов нет');
    });

    test('VM: пустой месяц мероприятий — заглушка, кодов нет', () => {
        const html = sheetHost({ trainings: [],
                                 entries: { '2026-09-02|017': { 'статус': 'ОТ' } } })
            ._buildPrintHtml(EMPS, AGG);
        const iOpen = html.indexOf('<div class="wsp-bottom">');
        const row = html.slice(iOpen, html.indexOf('</div></div>', iOpen));
        assertTrue(row.indexOf('нет мероприятий в этом месяце') !== -1,
            'заглушка мероприятий на месте');
        assertTrue(row.indexOf('Коды:') === -1, 'блока кодов нет (Task 442)');
    });
});

// ============================================================
// 4. VM — _printModel: tip (Тип) в строках
// ============================================================
describe('Task 439 — VM: _printModel (tip)', () => {

    function modelHost(opts) {
        opts = opts || {};
        return new Function('ProdCalendar', 'return ({' +
            methodText(WS_CLIENT, '_printModel') + ',' +
            methodText(WS_CLIENT, '_printEventsData') + ',' +
            '_year: 2026, _month: 9, _view: ' + JSON.stringify(opts.view || 'full') + ',' +
            '_isoDate: function(dt) { return dt.getFullYear() + "-" + ' +
                '(dt.getMonth() < 9 ? "0" : "") + (dt.getMonth() + 1) + "-" + ' +
                '(dt.getDate() < 10 ? "0" : "") + dt.getDate(); },' +
            '_buildEntryIndex: function() { return ' + JSON.stringify(opts.entries || {}) + '; },' +
            '_PENDING: ' + JSON.stringify(opts.pending || {}) + ',' +
            '_empTipLine: function(emp) { return emp[' + JSON.stringify('таб_номер') + '] === "031" ? "дневной" : "смена №1"; },' +
            '_STATUS_CODES: ' + JSON.stringify([
                { code: 'Д', short: 'день 12ч', name: 'День', color: '#FFE082' },
                { code: '', short: 'выходной', name: 'Выходной, плановый выходной день', color: '#EEF0F2' }]) + ',' +
            '_TRAININGS: [],' +
            '_EMPLOYEES: [{ "ФИО": "Иванов Иван Иванович", "таб_номер": "017" },' +
                        '{ "ФИО": "Сидоров Сидор Сидорович", "таб_номер": "031" }],' +
            '_trainingCodeOf: function() { return ""; },' +
            '_instrShortOf: function() { return ""; },' +
            '_vacationAt: function() { return null; },' +
            '_eventsAt: function() { return []; },' +
            '_statusMeta: function(code) { return {}; },' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '});')({ dayInfo: function() { return null; } });
    }

    const EMPS = [
        { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' },
        { 'ФИО': 'Сидоров Сидор Сидорович', 'таб_номер': '031' }
    ];

    test('VM: rows[].tip — Тип строки, поля pos нет', () => {
        const m = modelHost()._printModel(EMPS, null);
        assertEqual(m.rows[0].tip, 'смена №1', 'Тип первой строки');
        assertEqual(m.rows[1].tip, 'дневной', 'Тип второй строки');
        assertTrue(m.rows[0].pos === undefined,
            'поля pos (должность) в модели больше нет');
    });

    test('SRC: _printModel — tip из _empTipLine', () => {
        const b = stripComments(methodText(WS_CLIENT, '_printModel'));
        assertTrue(b.indexOf('tip: String(this._empTipLine(emp)') !== -1,
            'модель несёт Тип (_empTipLine)');
        assertTrue(b.indexOf('_posLabel') === -1, 'должность не читается');
    });
});

// ============================================================
// 5. VM — _printPdfLayout: мероприятия и коды РЯДОМ
// ============================================================
describe('Task 439 — VM: раскладка PDF (коды рядом с мероприятиями)', () => {

    function fakeModel(nRows, nEvents, nCodes) {
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
        const codes = [];
        for (let c = 0; c < nCodes; c++) {
            codes.push({ code: 'К' + c, label: 'код ' + c, color: '#EEEEEE' });
        }
        return { year: 2026, month: 9, view: 'full',
                 days: days, rows: rows, events: events, codes: codes };
    }

    function layoutHost() {
        return new Function('return ({' +
            methodText(WS_CLIENT, '_printPdfLayout') +
            '});')();
    }

    test('VM: компактный месяц — ОДНА страница: таблица + события', () => {
        const lay = layoutHost()._printPdfLayout(fakeModel(10, 3, 4));
        assertEqual(lay.pages.length, 1, 'всё на одной странице');
        const p = lay.pages[0];
        assertEqual(p.events.length, 3, 'события на ней же');
        assertTrue(!p.codes, 'кодов нет (Task 442: столбец удалён)');
    });

    test('VM: ГРАНИЧНЫЙ случай — события влезают под таблицей', () => {
        // A4-альбом: contentH = 595 − 2×23 = 549. Первая страница:
        // шапка 34 + gap 8 + лента 24 → 21 строка. При 22 строках
        // вторая страница: used = 24 + 22 + 8 = 54. 33 события:
        // evH = 18 + 33×13 = 447; 54 + 447 = 501 ≤ 549 — события
        // на последней странице таблицы (кодов больше нет, Task 442)
        const lay = layoutHost()._printPdfLayout(fakeModel(22, 33, 4));
        assertEqual(lay.pages.length, 2, '2 страницы');
        const last = lay.pages[1];
        assertEqual(last.rows.length, 1, 'вторая страница — последняя строка');
        assertEqual(last.events.length, 33, 'все события на ней');
        assertTrue(!last.codes, 'кодов нет (Task 442)');
    });

    test('VM: много событий — режутся по страницам', () => {
        const lay = layoutHost()._printPdfLayout(fakeModel(60, 200, 4));
        const evPages = lay.pages.filter(p => p.events && p.rows.length === 0);
        assertTrue(evPages.length >= 2, '200 событий — несколько страниц');
        const last = lay.pages[lay.pages.length - 1];
        assertTrue(!!last.events, 'последняя страница — мероприятия');
        assertTrue(!last.codes, 'кодов нет (Task 442)');
        let evTotal = 0;
        for (const p of evPages) evTotal += p.events.length;
        assertEqual(evTotal, 200, 'все события распределены без потерь');
    });

    test('VM: тесная страница — события режутся, ничего не теряется', () => {
        // низкая «страница» (H=300): события не влезают под лентой —
        // уходят отдельными страницами (кодов больше нет, Task 442)
        const lay = layoutHost()._printPdfLayout(fakeModel(0, 100, 40), { H: 300 });
        const last = lay.pages[lay.pages.length - 1];
        assertTrue(!!last.events, 'последняя страница — мероприятия');
        let evTotal = 0;
        for (const p of lay.pages) {
            if (p.events) evTotal += p.events.length;
        }
        assertEqual(evTotal, 100, 'все 100 событий распределены');
    });

    test('VM: раскладка — мероприятия на ВСЮ ширину (evW)', () => {
        const lay = layoutHost()._printPdfLayout(fakeModel(2, 1, 2));
        assertTrue(!('codeW' in lay), 'зоны кодов нет (Task 442)');
        assertTrue(!('colGap' in lay), 'зазора мероприятий↔коды нет');
        assertEqual(lay.evW, lay.W - 2 * lay.M,
            'зона мероприятий = вся ширина листа (без вычета кодов)');
    });

    test('VM: пустой месяц (0 строк, 0 событий) — заглушка', () => {
        const lay = layoutHost()._printPdfLayout(fakeModel(0, 0, 2));
        const last = lay.pages[lay.pages.length - 1];
        assertTrue(!!last.events, 'события-заглушка размещены');
        assertTrue(!last.codes, 'кодов нет (Task 442)');
    });
});

// ============================================================
// 6. SRC — _printPdfPaintPage: Тип, ширина, правая зона кодов
// ============================================================
describe('Task 439 — SRC: отрисовка PDF (_printPdfPaintPage)', () => {

    test('SRC: строка работника — row.tip; empW по ФИО+Тип+заголовку', () => {
        const b = stripComments(methodText(WS_CLIENT, '_printPdfPaintPage'));
        assertTrue(b.indexOf('row.tip') !== -1, 'подпись строки — Тип (row.tip)');
        assertTrue(b.indexOf('row.pos') === -1, 'должности (pos) нет');
        assertTrue(b.indexOf("measureText(model.rows[tii].tip || '')") !== -1,
            'Тип меряется для ширины колонки');
        assertTrue(b.indexOf("ctx.measureText('Работник').width") !== -1,
            'заголовок «Работник» меряется');
        assertTrue(b.indexOf('Math.max(46, Math.min(150, maxW + 10))') !== -1,
            'кламп ширины 46–150 pt (мин снижен с 70 — Тип короче)');
    });

    test('SRC: зоны кодов нет, мероприятия — вся ширина (Task 442)', () => {
        const b = stripComments(methodText(WS_CLIENT, '_printPdfPaintPage'));
        assertTrue(b.indexOf('codeX') === -1 && b.indexOf('evZoneW') === -1,
            'геометрии зон кодов (Task 439/440) нет — столбец удалён');
        assertTrue(b.indexOf("'Коды:'") === -1,
            'заголовка «Коды:» в PDF нет');
        assertTrue(b.indexOf('botY') === -1,
            'общей верхней линии пары блоков нет');
        assertTrue(b.indexOf('var evMaxW = x0 + CW - ex;') !== -1 &&
                   b.indexOf('evWords') !== -1,
            'текст мероприятий переносится по словам до края ЛИСТА');
    });
});

// ============================================================
// 7. VM — Excel: работник ФИО+Тип, коды справа от мероприятий
// ============================================================
describe('Task 439 — VM: Excel (Тип в колонке A, коды в колонке D)', () => {

    function tabelHost(opts) {
        opts = opts || {};
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
            '_year: 2026, _month: 9, _view: ' + JSON.stringify(opts.view || 'full') + ',' +
            '_isoDate: function(dt) { return dt.getFullYear() + "-" + ' +
                '(dt.getMonth() < 9 ? "0" : "") + (dt.getMonth() + 1) + "-" + ' +
                '(dt.getDate() < 10 ? "0" : "") + dt.getDate(); },' +
            '_buildEntryIndex: function() { return ' + JSON.stringify(opts.entries || {
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
            '});')(opts.pcal);
    }

    const EMPS = [
        { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' },
        { 'ФИО': 'Сидоров Сидор Сидорович', 'таб_номер': '031' }
    ];
    const AGG = { byTab: { '017': { work: 21, overDays: 3 },
                           '031': { work: 19, overDays: 0 } } };

    test('VM: ячейка A — ФИО + перенос строки + Тип', () => {
        const rows = tabelHost()._wsTabelRows(
            tabelHost()._printModel(EMPS, AGG), {});
        // строка данных: A = «Иванов Иван Иванович\nсмена №1»
        let fioCell = null;
        for (const r of rows) {
            if (r[0] && String(r[0].v).indexOf('Иванов') === 0) {
                fioCell = String(r[0].v); break;
            }
        }
        assertTrue(fioCell !== null, 'строка работника найдена');
        assertEqual(fioCell, 'Иванов Иван Иванович\nсмена №1',
            'ФИО + \\n + Тип в одной ячейке (Task 439)');
    });

    test('VM: блок — только A/B, колонок C/D нет (Task 442)', () => {
        const host = tabelHost();
        const rows = host._wsTabelRows(host._printModel(EMPS, AGG), {});
        // строка-заголовок блока: A = «Мероприятия · …» (одна ячейка)
        let hdr = null;
        for (const r of rows) {
            if (r[0] && String(r[0].v).indexOf('Мероприятия · ') === 0) {
                hdr = r; break;
            }
        }
        assertTrue(hdr !== null, 'заголовок блока мероприятий найден');
        assertEqual(hdr.length, 1, 'заголовок — ОДНА ячейка (без «Коды:»)');
        // первая строка данных блока: A = дата, B = текст — и всё
        const idx = rows.indexOf(hdr);
        const first = rows[idx + 1];
        assertEqual(first[0].v, '02.09', 'дата мероприятия в A');
        assertTrue(String(first[1].v).indexOf('И · Повторный инструктаж') === 0,
            'текст мероприятия в B');
        assertTrue(first.length <= 2, 'правее B ячеек нет (Task 442)');
    });

    test('VM: пустой месяц — заглушка в A, кодов нет', () => {
        const host = tabelHost();
        host._TRAININGS = [];
        const rows = host._wsTabelRows(host._printModel(EMPS, AGG), {});
        let hdr = null;
        for (const r of rows) {
            if (r[0] && String(r[0].v).indexOf('Мероприятия · ') === 0) {
                hdr = r; break;
            }
        }
        const first = rows[rows.indexOf(hdr) + 1];
        assertEqual(first[0].v, 'нет мероприятий в этом месяце',
            'заглушка мероприятий в колонке A');
        assertEqual(hdr.length, 1, 'заголовка «Коды:» нет (Task 442)');
    });

    test('VM: ширина столбца A — по самому большому тексту (не 30)', () => {
        const wb = tabelHost()._buildTabelWorkbook(EMPS, AGG);
        // «Сидоров Сидор Сидорович» = 23 симв (самое длинное ФИО)
        // + 2 = 25 (было фикс. 30)
        const z = parseZip(wb.bytes);
        const sheet = Buffer.from(
            z.files.filter(f => f.name === 'xl/worksheets/sheet1.xml')[0].data)
            .toString('utf8');
        assertTrue(sheet.indexOf('<col min="1" max="1" width="25"') !== -1,
            'ширина A = 25 (по ФИО 23 симв + 2, Task 439)');
        assertTrue(sheet.indexOf('width="30"') === -1,
            'фиксированная ширина 30 убрана');
    });

    test('VM: стиль 5 — wrapText (две строки ячейки A видны)', () => {
        const wb = tabelHost()._buildTabelWorkbook(EMPS, AGG);
        const z = parseZip(wb.bytes);
        const styles = Buffer.from(
            z.files.filter(f => f.name === 'xl/styles.xml')[0].data)
            .toString('utf8');
        assertTrue(styles.indexOf('wrapText="1"') !== -1,
            'стиль ячейки работника переносит строки (wrapText)');
        assertTrue(styles.indexOf('vertical="top"') !== -1,
            'выравнивание по верху (ФИО + Тип)');
        // перенос строки реален в листе
        const sheet = Buffer.from(
            z.files.filter(f => f.name === 'xl/worksheets/sheet1.xml')[0].data)
            .toString('utf8');
        assertTrue(sheet.indexOf('Иванов Иван Иванович\nсмена №1') !== -1,
            'в ячейке A6 — ФИО и Тип двумя строками');
    });

    test('VM: «Коды:» в книге НЕТ (Task 442), мероприятия живы', () => {
        const wb = tabelHost()._buildTabelWorkbook(EMPS, AGG);
        const z = parseZip(wb.bytes);
        const sheet = Buffer.from(
            z.files.filter(f => f.name === 'xl/worksheets/sheet1.xml')[0].data)
            .toString('utf8');
        assertTrue(sheet.indexOf('>Коды:<') === -1,
            'секции «Коды:» в листе нет (столбец удалён, Task 442)');
        assertTrue(sheet.indexOf('Мероприятия · сентябрь 2026 · 1') !== -1,
            'заголовок мероприятий — колонка A');
    });

    function parseZip(bytes) {
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const files = [];
        let pos = 0;
        while (pos + 30 <= bytes.length &&
               dv.getUint32(pos, true) === 0x04034b50) {
            const nameLen = dv.getUint16(pos + 26, true);
            const extraLen = dv.getUint16(pos + 28, true);
            const method = dv.getUint16(pos + 8, true);
            const usize = dv.getUint32(pos + 22, true);
            const name = Buffer.from(
                bytes.slice(pos + 30, pos + 30 + nameLen)).toString('utf8');
            const dataStart = pos + 30 + nameLen + extraLen;
            files.push({ name: name, method: method,
                         data: bytes.slice(dataStart, dataStart + usize) });
            pos = dataStart + usize;
        }
        return { files: files,
                 eocd: dv.getUint32(bytes.length - 22, true) };
    }
});

// ============================================================
// 8. VM — нормализация: «точечные» легаси-коды не дублируются
// ============================================================
describe('Task 439 — VM: _normalizeStatusCodes (дедуп «точек»)', () => {

    function mkHost() {
        const CANON = [
            { code: 'Д8', short: 'день 8ч', name: 'День 8ч', color: '#FFF9C4' },
            { code: 'Д', short: 'день 12ч', name: 'День 12ч', color: '#FFE082' },
            { code: 'ОТ', short: 'отпуск', name: 'Отпуск', color: '#ECEFF1' },
            { code: '', short: 'выходной',
              name: 'Выходной, плановый выходной день', color: '#EEF0F2' },
            { code: 'И', short: 'инструктаж', name: 'Инструктаж', color: '#B3E5FC' }
        ];
        const ctx = { _STATUS_CODES_CANON: CANON, _normalizeStatusCodes: null };
        const vm = require('vm');
        vm.createContext(ctx);
        const src = extractMethod(INDEX_SRC, '_normalizeStatusCodes');
        vm.runInContext(
            'globalThis._normalizeStatusCodes = ({' + src + '})._normalizeStatusCodes;',
            ctx);
        return ctx;
    }

    test('лист с «» и «·» — «·» НЕ попадает в хвост (один «Выходной»)', () => {
        const h = mkHost();
        const out = h._normalizeStatusCodes([
            { code: '', name: 'Выходной', color: '#EEF0F2' },
            { code: '·', name: 'Выходной, плановый выходной день', color: '#CFD8DC' },
            { code: 'Д', name: 'День', color: '#FFE082' }
        ]);
        const dots = out.filter(c => c.code === '·' || c.code === '.');
        assertEqual(dots.length, 0, '«точечных» кодов в итоге нет (дубль убран)');
        assertEqual(out.filter(c => c.code === '').length, 1,
            'ровно один слот «Выходного» (пустой код)');
        assertEqual(out.length, 2, 'Д + «Выходной» — «·»-хвост не построен');
    });

    test('лист с «. » (пробел вокруг точки) — в хвост не попадает', () => {
        const h = mkHost();
        const out = h._normalizeStatusCodes([
            { code: '. ', name: 'Выходной, плановый выходной день', color: '#CFD8DC' },
            { code: 'Д', name: 'День', color: '#FFE082' }
        ]);
        // «. » не совпал с каноном точно → хвост; трим → «.» →
        // легаси-точка, слот «» уже есть — НЕ добавляется
        assertEqual(out.filter(c => c.code === '.').length, 0,
            'голая «.» в хвосте не появляется');
        assertEqual(out.filter(c => c.code === '').length, 1,
            'слот «Выходного» добавлен каноном');
    });

    test('лист только с «.» — слот «» работает (регресс 387)', () => {
        const h = mkHost();
        const out = h._normalizeStatusCodes([
            { code: '.', name: 'Выходной, плановый выходной день', color: '#CFD8DC' },
            { code: 'Д', name: 'День', color: '#FFE082' }
        ]);
        assertEqual(out.filter(c => c.code === '').length, 1,
            'точка раскрыта слотом «Выходного» (как прежде)');
        assertEqual(out.length, 2, 'Д + «Выходной», дублей нет');
    });

    test('лист только с «·» — слот «» добавляется, «·» исчезает', () => {
        const h = mkHost();
        const out = h._normalizeStatusCodes([
            { code: '·', name: 'Выходной, плановый выходной день', color: '#CFD8DC' }
        ]);
        assertEqual(out.filter(c => c.code === '').length, 1,
            'слот «Выходного» есть всегда (канон)');
        assertEqual(out.filter(c => c.code === '·').length, 0,
            '«·»-хвост не построен (лишняя строка не появится)');
    });
});

// ============================================================
// 9. VM — попап ячеек: легаси-«.» скрыт при слоте «»
// ============================================================
describe('Task 439 — VM: _renderCellPopup (дедуп «.»)', () => {

    function popupHost(codes, effStatus) {
        const vm = require('vm');
        const els = {};
        function mkEl() {
            return { value: '', textContent: '', innerHTML: '', hidden: false,
                     style: {}, classList: { add() {}, remove() {},
                                             contains() { return false; } },
                     setAttribute() {}, querySelector() { return null; },
                     offsetWidth: 0 };
        }
        const document = { getElementById: id => (els[id] || (els[id] = mkEl())) };
        const ctx = { document, Math, Date, String, Number,
                      parseInt, parseFloat, isNaN, isFinite };
        vm.createContext(ctx);
        const src = ['_renderCellPopup', '_esc']
            .map(n => extractMethod(INDEX_SRC, n))
            .filter(Boolean).join(',\n');
        vm.runInContext(`
            var WSM = {
                _canEdit: true, _popupCell: null,
                _STATUS_CODES: ${JSON.stringify(codes)},
                _EVENT_CODES: ['И', 'ОБ', 'ПЗ', 'ПР', '*'],
                _EMPLOYEES: [
                    { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'сменный' }
                ],
                _effectiveEntry: function() {
                    return ${JSON.stringify(effStatus || null)};
                },
                _fmtTotalsNum: function(n) { return String(n); },
                _fmtDateRu: function(d) { return String(d); },
                ${src}
            };
            globalThis.__host = { WSM: WSM };
        `, ctx, { filename: 'index.html-WS439' });
        return ctx.__host;
    }

    test('справочник с «» и «.» — строка «.» НЕ рендерится (нет дубля)', () => {
        const h = popupHost([
            { code: 'Д', name: 'День, плановая 12-часовая смена', color: '#FFE082' },
            { code: '', name: 'Выходной, плановый выходной день', color: '#EEF0F2' },
            { code: '.', name: 'Выходной, плановый выходной день', color: '#CFD8DC' }
        ]);
        const html = h.WSM._renderCellPopup('2026-09-06', '017');
        assertEqual((html.match(/Выходной, плановый выходной день/g) || []).length, 1,
            'ровно ОДНА строка «Выходного» (дубль «.» скрыт)');
        assertFalse(html.indexOf("onPopupStatus('.')") !== -1,
            'клика по легаси-«.» в списке нет');
        assertTrue(html.indexOf("onPopupStatus('')") !== -1,
            'клик по каноническому «Выходному» — очистка ячейки');
    });

    test('справочник только с «.» — строка «Выходного» жива (регресс 387)', () => {
        const h = popupHost([
            { code: 'Д', name: 'День, плановая 12-часовая смена', color: '#FFE082' },
            { code: '.', name: 'Выходной, плановый выходной день', color: '#CFD8DC' }
        ]);
        const html = h.WSM._renderCellPopup('2026-09-06', '017');
        assertTrue(html.indexOf('Выходной, плановый выходной день') !== -1,
            'строка «Выходного» рендерится (защитный путь данных)');
        assertTrue(html.indexOf("onPopupStatus('.')") !== -1,
            'клик по «.»-строке — код «.» (как в Task 387)');
    });

    test('легаси-«.» в ячейке подсвечивает слот «» (регресс 387 жив)', () => {
        const h = popupHost([
            { code: 'Д', name: 'День', color: '#FFE082' },
            { code: '', name: 'Выходной, плановый выходной день', color: '#EEF0F2' }
        ], { 'статус': '.', 'источник': 'руч' });
        const html = h.WSM._renderCellPopup('2026-09-06', '017');
        const i = html.indexOf('ws-swatch-dot');
        assertTrue(i !== -1, 'строка «Выходного» со свотчем');
        assertTrue(html.slice(i - 120, i + 400).indexOf('ws-popup-active') !== -1,
            '«.»-ячейка подсвечивает канонический слот «»');
    });
});

// ============================================================
// 10. Service Worker
// ============================================================
describe('Task 439 — Service Worker', () => {

    test('SW: кэш поднят до kipia-test-v747', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v747'") !== -1,
            'CACHE_VERSION = kipia-test-v747 (Task 439 — печать/попап)');
        assertFalse(SW_SRC.indexOf('kipia-test-v748') !== -1,
            'лишний инкремент (v664) не сделан');
    });

    test('SW: в index.html нет захардкоженной версии кэша', () => {
        assertFalse(INDEX_SRC.indexOf('kipia-test-v748') !== -1,
            'клиент не знает номер кэша (версией управляет sw.js)');
    });
});
