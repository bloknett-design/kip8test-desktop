// ============================================================
// Task 438 — заявка (kip8test): «В разделе Табель учёта рабочего
// времени при выводе на печать список кодов должен отображаться
// в сокращённом виде, формат верхнего текста "График работы —
// табель учёта рабочего времени / Сентябрь 2026 г. · вид табеля:
// полный / Норма… / Распечатано…" переделай на формат "График
// работы / Сентябрь 2026 г. · вид табеля: полный", нижний текст
// "* — сокращённый предпраздничный…" убери, колонку в таблице
// "Часы" убери, в колонке "Перераб." должны быть указаны только
// дни. Так же сделай возможность сохранения в файл вместо html
// в PDF и Excel».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   КЛИЕНТ (SRC):
//   1) шапка печати — заголовок «График работы» + одна строка
//      месяц/год · вид; строки нормы (wsp-meta) и штампа
//      «Распечатано» (wsp-printed) не строятся, CSS-правила
//      удалены;
//   2) сноска wsp-foot («* — сокращённый предпраздничный…») не
//      строится, CSS-правило удалено;
//   3) колонка «Часы» удалена (шапка + ячейки строк), в
//      «Перераб.» — только дни (overDays), подпись «дни» (не
//      «дни/ч»), ширина wsp-tot-over 12mm;
//   4) перечень кодов — сокращённый: после кода short
//      (codes[ci].short || codes[ci].name);
//   5) диалог предпросмотра: кнопки «Сохранить PDF»
//      (wspprev-pdf) и «Сохранить Excel» (wspprev-xlsx) вместо
//      «Сохранить в файл» (wspprev-save и _savePrintFile
//      удалены);
//   6) новые методы: _printModel, _printEventsData,
//      _printCodesData, _printPdfLayout, _buildPdfDocument,
//      _printPdfPaintPage, _wsDataUrlBytes, _savePrintPdf,
//      _wsTabelStylesXml, _wsTabelRows, _wsTabelSheetXml,
//      _buildTabelWorkbook, _savePrintXlsx.
//   VM (клиент):
//   7) _buildPrintHtml: шапка из двух строк, без нормы/штампа/
//      сноски/«Часов», «Перераб.» = «3» (не «3/36»), легенда —
//      сокращённая (short) с фолбэком name;
//   8) _printModel: дни месяца, эффективные записи с локальными
//      правками/__delete, цвета/точка/бейджи, итоги строк
//      (inAgg/work/overDays);
//   9) _printEventsData: пересечение месяца, фильтр видов, дедуп
//      сортировка по дате/таб., «код · сокращение · ФИО»;
//  10) _printCodesData: порядок справочника, short, «.» — слот
//      «Выходной», коды мероприятий учтены, легаси — в конец;
//  11) _printPdfLayout: пагинация строк (лента дней на каждой
//      странице, шапка — только на первой), мероприятия+коды на
//      последней странице или отдельными;
//  12) _buildPdfDocument: %PDF-1.4, /DCTDecode passthrough,
//      по странице на JPEG, MediaBox 842×595, xref-смещения
//      корректны (startxref → 'xref', объект 1 по своей записи);
//  13) _buildTabelWorkbook: имя График_работы_‹Месяц›_‹год›.xlsx,
//      лист «Табель», шапка 2 строки, без «Часы», мероприятия,
//      коды сокращённые, цветные заливки в styles.xml, freeze
//      xSplit=1/ySplit=5;
//  14) _savePrintPdf/_savePrintXlsx: скачивание (mime/имя) +
//      тост; сбой генерации — тост об ошибке, без скачивания.
//   SW: kipia-test-v742 (главный), v663 — следующий не занят.
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Срез исходника от начала объекта WorkSchedule (имена методов
// НЕуникальны в файле — извлекаем только из модуля «График работы»)
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

// Убирает комментарии (/* */ и //) — ассерты SRC проверяют КОД
function stripComments(src) {
    return String(src)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]*\/\/.*$/gm, '');
}

// Простейший эскейп для моков (поведение = WorkSchedule._esc)
function mockEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// 1. SRC — шапка печати, сноска, колонки, легенда
// ============================================================
describe('Task 438 — SRC: печатная форма', () => {

    test('SRC: заголовок листа — «График работы» (без приписки)', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf("'<div class=\"wsp-title\">График работы</div>'") !== -1,
            'заголовок — две строки: только «График работы»');
        assertTrue(b.indexOf('табель учёта рабочего времени') === -1,
            'приписка «— табель учёта рабочего времени» убрана из заголовка');
    });

    test('SRC: строки нормы и «Распечатано» не строятся', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf("'<div class=\"wsp-meta\">'") === -1,
            'строка нормы (wsp-meta) не строится');
        assertTrue(b.indexOf("'<div class=\"wsp-printed\">'") === -1,
            'штамп «Распечатано» (wsp-printed) не строится');
        assertTrue(b.indexOf('Распечатано:') === -1,
            'текста «Распечатано:» в печатной форме нет');
        assertTrue(b.indexOf('Норма (40-час') === -1,
            'норма месяца в шапке больше не вычисляется');
    });

    test('SRC: CSS-правила нормы/штампа/сноски удалены', () => {
        assertTrue(INDEX_SRC.indexOf('#wsPrintSheet .wsp-meta {') === -1,
            'правило .wsp-meta удалено из print-CSS');
        assertTrue(INDEX_SRC.indexOf('#wsPrintSheet .wsp-printed {') === -1,
            'правило .wsp-printed удалено из print-CSS');
        assertTrue(INDEX_SRC.indexOf('#wsPrintSheet .wsp-foot {') === -1,
            'правило .wsp-foot удалено из print-CSS');
    });

    test('SRC: сноска wsp-foot не строится', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf('<div class="wsp-foot">') === -1,
            'сноска «* — сокращённый предпраздничный…» не строится');
        assertTrue(INDEX_SRC.indexOf('* — сокращённый предпраздничный рабочий день') === -1,
            'текст сноски удалён из файла');
    });

    test('SRC: колонка «Часы» удалена, «Перераб.» — только дни', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf('<th class="wsp-tot">Часы</th>') === -1,
            'колонка «Часы» в шапке таблицы удалена');
        assertTrue(b.indexOf('a.hours') === -1,
            'часы (agg hours) больше не печатаются в строках');
        assertTrue(b.indexOf('Перераб.<span>дни</span></th>') !== -1,
            'заголовок «Перераб.» с подписью «дни» (не «дни/ч»)');
        const i = b.indexOf("'<td class=\"wsp-tot wsp-tot-over\">'");
        assertTrue(i !== -1, 'ячейка переработки в строках');
        const tail = b.slice(i, i + 300);
        assertTrue(tail.indexOf('a.overDays') !== -1,
            'значение — только дни (overDays)');
        assertTrue(tail.indexOf("a.overDays + '/'") === -1,
            'склейка «дни/часы» удалена (Task 438)');
        assertTrue(tail.indexOf('_fmtTotalsNum') === -1,
            'форматирование часов не используется');
    });

    test('SRC: CSS ширины колонок итогов (wsp-tot-over 12mm)', () => {
        const i = INDEX_SRC.indexOf('#wsPrintSheet .wsp-tot.wsp-tot-over');
        assertTrue(i !== -1, 'правило wsp-tot-over есть');
        const block = INDEX_SRC.slice(i, i + 200);
        assertTrue(block.indexOf('width: 12mm') !== -1,
            'ширина 12mm (было 14mm под «дни/часы»)');
    });

    test('SRC: перечень кодов — УДАЛЁН из печати (Task 442)', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf('var lgShort =') === -1,
            'цикла легенды (lgShort) больше нет — столбец кодов удалён');
        assertTrue(b.indexOf('wsp-legend') === -1,
            'блока кодов в разметке нет');
        assertTrue(b.indexOf('wsp-lg') === -1,
            'записей кодов нет');
    });

    test('SRC: диалог — «Сохранить PDF» и «Сохранить Excel»', () => {
        const b = stripComments(methodText(WS_CLIENT, '_openPrintPreview'));
        assertTrue(b.indexOf('wspprev-pdf') !== -1, 'кнопка wspprev-pdf');
        assertTrue(b.indexOf('wspprev-xlsx') !== -1, 'кнопка wspprev-xlsx');
        assertTrue(b.indexOf('Сохранить PDF') !== -1, 'текст «Сохранить PDF»');
        assertTrue(b.indexOf('Сохранить Excel') !== -1, 'текст «Сохранить Excel»');
        assertTrue(b.indexOf('wspprev-save') === -1,
            'кнопка «Сохранить в файл» (HTML) удалена');
        assertTrue(b.indexOf('Сохранить в файл') === -1,
            'текст «Сохранить в файл» удалён');
        assertTrue(b.indexOf('_savePrintPdf') !== -1, 'обработчик PDF');
        assertTrue(b.indexOf('_savePrintXlsx') !== -1, 'обработчик Excel');
        // контекст выгрузок из printGrid
        assertTrue(b.indexOf('ctx.viewEmps') !== -1,
            'данные выгрузок — из контекста ctx (viewEmps)');
    });

    test('SRC: _savePrintFile (HTML) удалён, новые методы на месте', () => {
        assertTrue(extractMethod(WS_CLIENT, '_savePrintFile') === null,
            'метод _savePrintFile удалён');
        assertTrue(extractMethod(WS_CLIENT, '_printCodesData') === null,
            'Task 442: метод _printCodesData удалён (столбца кодов нет)');
        for (const m of ['_printModel', '_printEventsData',
                         '_printPdfLayout', '_buildPdfDocument',
                         '_printPdfPaintPage', '_wsDataUrlBytes',
                         '_savePrintPdf', '_wsTabelStylesXml', '_wsTabelRows',
                         '_wsTabelSheetXml', '_buildTabelWorkbook',
                         '_savePrintXlsx']) {
            assertTrue(extractMethod(WS_CLIENT, m) !== null,
                'метод ' + m + ' определён');
        }
    });

    test('SRC: printGrid передаёт контекст в диалог', () => {
        const b = stripComments(methodText(WS_CLIENT, 'printGrid'));
        const i = b.indexOf('_openPrintPreview(html, {');
        assertTrue(i !== -1, 'вызов с контекстом {viewEmps, agg}');
        const tail = b.slice(i, i + 120);
        assertTrue(tail.indexOf('viewEmps: viewEmps') !== -1 &&
                   tail.indexOf('agg: agg') !== -1,
            'контекст несёт печатаемые строки и итоги');
    });

    test('SRC: CSS кнопок диалога (wspprev-pdf/xlsx)', () => {
        assertTrue(INDEX_SRC.indexOf('.wspprev-pdf,') !== -1,
            'правило .wspprev-pdf есть');
        assertTrue(INDEX_SRC.indexOf('.wspprev-xlsx,') !== -1,
            'правило .wspprev-xlsx есть');
        assertTrue(INDEX_SRC.indexOf('.wspprev-save,') === -1,
            'правило .wspprev-save удалено');
    });

    test('SRC: PDF — JPEG passthrough (DCTDecode), Excel — заливки', () => {
        const pdf = stripComments(methodText(WS_CLIENT, '_buildPdfDocument'));
        assertTrue(pdf.indexOf('/DCTDecode') !== -1,
            'JPEG вставляется в PDF как есть (DCTDecode)');
        assertTrue(pdf.indexOf('/MediaBox') !== -1, 'страница с MediaBox');
        assertTrue(pdf.indexOf('xref') !== -1, 'таблица xref строится');
        const st = stripComments(methodText(WS_CLIENT, '_wsTabelStylesXml'));
        assertTrue(st.indexOf('patternType="solid"') !== -1,
            'динамические заливки цветов кодов в styles.xml');
        const sh = stripComments(methodText(WS_CLIENT, '_wsTabelSheetXml'));
        assertTrue(sh.indexOf('xSplit="1"') !== -1,
            'закрепление столбца работника (xSplit=1)');
    });
});

// ============================================================
// 2. VM — _buildPrintHtml: новый формат печатной формы
// ============================================================
describe('Task 438 — VM: _buildPrintHtml (формат листа)', () => {

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
            '_fmtTotalsNum: function(v) { return String(Math.round((v || 0) * 10) / 10).replace(".", ","); },' +
            '_STATUS_CODES: ' + JSON.stringify(opts.codes || [
                { code: 'Д', short: 'день 12ч', name: 'День, плановая 12-часовая смена', color: '#FFE082' },
                { code: 'Н', short: 'ночь 12ч', name: 'Ночь, плановая 12-часовая смена', color: '#B0BEC5' },
                { code: 'ОТ', short: 'отпуск', name: 'Отпуск, ежегодный основной оплачиваемый отпуск', color: '#ECEFF1' },
                { code: '', short: 'выходной', name: 'Выходной, плановый выходной день', color: '#EEF0F2' }]) + ',' +
            '_TRAININGS: ' + JSON.stringify(opts.trainings || []) + ',' +
            '_EMPLOYEES: [{ "ФИО": "Иванов Иван Иванович", "таб_номер": "017" },' +
                        '{ "ФИО": "Сидоров Сидор Сидорович", "таб_номер": "031" }],' +
            '_trainingCodeOf: function(t) { return t === "инструктаж" ? "И" : ""; },' +
            '_instrShortOf: function(t) { return "Повторный инструктаж"; },' +
            '_calDayOff: function(day) { return day % 7 === 0 || day % 7 === 6; },' +
            '_vacationAt: function() { return null; },' +
            '_eventsAt: function() { return []; },' +
            '_statusMeta: function(code) {' +
            '    var m = { "Д": { code: "Д", color: "#FFE082" },' +
            '              "Н": { code: "Н", color: "#B0BEC5" },' +
            '              "ОТ": { code: "ОТ", color: "#ECEFF1" },' +
            '              "И": { code: "И", color: "#B3E5FC" } };' +
            '    return m[code] || {};' +
            '},' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '_printCell: function(day, iso, emp, entry) { return "<td>[" + (entry ? entry.статус : "-") + "]</td>"; },' +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')(opts.pcal);
    }

    const EMPS = [
        { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' },
        { 'ФИО': 'Сидоров Сидор Сидорович', 'таб_номер': '031' }
    ];
    const AGG = {
        byTab: { '017': { work: 21, hours: 151.2, over: 36, overDays: 3 },
                 '031': { work: 19, hours: 136.8, over: 0, overDays: 0 } },
        grand: { work: 40, hours: 288, over: 36, overDays: 3 }
    };

    test('VM: шапка — ровно две строки, без нормы и штампа', () => {
        const html = sheetHost()._buildPrintHtml(EMPS, AGG);
        assertTrue(html.indexOf('<div class="wsp-title">График работы</div>') !== -1,
            'заголовок «График работы»');
        assertTrue(html.indexOf('Сентябрь 2026') !== -1, 'месяц и год');
        assertTrue(html.indexOf('вид табеля: полный') !== -1, 'вид табеля');
        assertTrue(html.indexOf('Распечатано:') === -1, 'штампа «Распечатано» нет');
        assertTrue(html.indexOf('Норма (40-час') === -1, 'строки нормы нет');
        assertTrue(html.indexOf('wsp-meta') === -1 && html.indexOf('wsp-printed') === -1,
            'классов meta/printed в листе нет');
    });

    test('VM: норма НЕ появляется даже при живом ProdCalendar', () => {
        const pcal = { monthStats: function() { return { workDays: 22, hours40: 176 }; },
                       dayInfo: function() { return null; } };
        const html = sheetHost({ pcal: pcal })._buildPrintHtml(EMPS, AGG);
        assertTrue(html.indexOf('Норма (40-час') === -1,
            'норма из календаря в шапку больше не подставляется (Task 438)');
        assertTrue(html.indexOf('22 раб. дн.') === -1, 'цифр нормы нет');
    });

    test('VM: сноски wsp-foot нет, колонки «Часы» нет', () => {
        const html = sheetHost()._buildPrintHtml(EMPS, AGG);
        assertTrue(html.indexOf('wsp-foot') === -1, 'сноски внизу нет');
        assertTrue(html.indexOf('сокращённый предпраздничный') === -1,
            'текста сноски нет');
        assertTrue(html.indexOf('<th class="wsp-tot">Часы</th>') === -1,
            'колонки «Часы» нет');
        assertTrue(html.indexOf('>151,2</td>') === -1 && html.indexOf('>136,8</td>') === -1,
            'часы в строках не печатаются');
    });

    test('VM: «Перераб.» — только дни («3», ноль — «—»)', () => {
        const html = sheetHost()._buildPrintHtml(EMPS, AGG);
        assertTrue(html.indexOf('<th class="wsp-tot wsp-tot-over">Перераб.<span>дни</span></th>') !== -1,
            'заголовок «Перераб.» с подписью «дни»');
        assertTrue(html.indexOf('<td class="wsp-tot wsp-tot-over">3</td>') !== -1,
            'переработка 017 — только дни («3»)');
        assertTrue(html.indexOf('<td class="wsp-tot wsp-tot-over">3/36</td>') === -1,
            'старый формат «3/36» не печатается');
        assertTrue(html.indexOf('<td class="wsp-tot wsp-tot-over">—</td>') !== -1,
            'нулевая переработка — «—»');
        assertTrue(html.indexOf('<td class="wsp-tot">21</td>') !== -1,
            'дни явки на месте');
    });

    test('VM: перечень кодов в HTML — УДАЛЁН (Task 442)', () => {
        const entries = {
            '2026-09-02|017': { 'статус': 'ОТ' },
            '2026-09-03|031': { 'статус': 'Д' }
        };
        const html = sheetHost({ entries: entries })._buildPrintHtml(EMPS, AGG);
        assertTrue(html.indexOf('ОТ — отпуск') === -1,
            'строк легенды кодов нет (столбец удалён)');
        assertTrue(html.indexOf('Д — день 12ч') === -1,
            'код Д не расшифровывается на листе');
        assertTrue(html.indexOf('wsp-legend') === -1 &&
                   html.indexOf('wsp-lg') === -1,
            'разметки легенды нет вовсе');
        // «Мероприятия» живы (Task 360) — секция без блока кодов
        assertTrue(html.indexOf('Мероприятия · сентябрь 2026') !== -1,
            'список мероприятий остался (без кодов справа)');
    });
});

// ============================================================
// 3. VM — _printModel / _printEventsData / _printCodesData
// ============================================================
describe('Task 438 — VM: модель печатной формы (_printModel)', () => {

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
            '_empTipLine: function() { return "смена №1"; },' +
            '_STATUS_CODES: ' + JSON.stringify(opts.codes || [
                { code: 'Д', short: 'день 12ч', name: 'День, плановая 12-часовая смена', color: '#FFE082' },
                { code: 'Н', short: 'ночь 12ч', name: 'Ночь, плановая 12-часовая смена', color: '#B0BEC5' },
                { code: 'ОТ', short: 'отпуск', name: 'Отпуск, ежегодный основной оплачиваемый отпуск', color: '#ECEFF1' },
                { code: '', short: 'выходной', name: 'Выходной, плановый выходной день', color: '#EEF0F2' }]) + ',' +
            '_TRAININGS: ' + JSON.stringify(opts.trainings || [
                { 'тип': 'инструктаж', 'тема': 'Повторный инструктаж по охране труда',
                  'дата_начала': '2026-09-02', 'дата_окончания': '2026-09-02',
                  'таб_номер': '017' },
                { 'тип': 'обучение', 'тема': 'Обучение по промбезопасности',
                  'дата_начала': '2026-09-10', 'дата_окончания': '2026-09-12',
                  'таб_номер': '031' },
                { 'тип': 'инструктаж', 'тема': 'Чужой месяц',
                  'дата_начала': '2026-10-05', 'дата_окончания': '2026-10-05',
                  'таб_номер': '017' }]) + ',' +
            '_EMPLOYEES: [{ "ФИО": "Иванов Иван Иванович", "таб_номер": "017" },' +
                        '{ "ФИО": "Сидоров Сидор Сидорович", "таб_номер": "031" }],' +
            '_trainingCodeOf: function(t) {' +
            '    return t === "инструктаж" ? "И" : (t === "обучение" ? "ОБ" : ""); },' +
            '_instrShortOf: function(t) { return t === "Повторный инструктаж по охране труда"' +
            '        ? "Повторный инструктаж" : ""; },' +
            '_calDayOff: function(day) { return day % 7 === 0 || day % 7 === 6; },' +
            '_vacationAt: function() { return null; },' +
            '_eventsAt: function() { return []; },' +
            '_statusMeta: function(code) {' +
            '    var m = { "Д": { code: "Д", color: "#FFE082" },' +
            '              "Н": { code: "Н", color: "#B0BEC5" },' +
            '              "ОТ": { code: "ОТ", color: "#ECEFF1" },' +
            '              "И": { code: "И", color: "#B3E5FC" },' +
            '              "ОБ": { code: "ОБ", color: "#D1C4E9" } };' +
            '    return m[code] || {};' +
            '},' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '});')(opts.pcal);
    }

    const EMPS = [
        { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' },
        { 'ФИО': 'Сидоров Сидор Сидорович', 'таб_номер': '031' }
    ];
    const AGG = {
        byTab: { '017': { work: 21, hours: 151.2, over: 36, overDays: 3 },
                 '031': { work: 19, hours: 136.8, over: 0, overDays: 0 } }
    };
    const ENTRIES = {
        '2026-09-02|017': { 'статус': 'Д' },
        '2026-09-03|031': { 'статус': 'Н' },
        '2026-09-04|017': { 'статус': '.' }
    };
    const PENDING = {
        '2026-09-02|017': { 'статус': 'ОТ' },
        '2026-09-03|031': { __delete: true }
    };

    test('VM: дни месяца — 30, выходные/будни по календарю', () => {
        const m = modelHost()._printModel(EMPS, AGG);
        assertEqual(m.days.length, 30, 'сентябрь 2026 — 30 дней');
        assertEqual(m.days[0].d, 1, 'первый день');
        assertEqual(m.days[0].dow, 'Вт', '01.09.2026 — вторник');
        assertEqual(m.days[4].dow, 'Сб', '05.09.2026 — суббота');
        assertTrue(m.days[4].off === true, 'суббота — выходной');
        assertTrue(m.days[0].off === false, 'вторник — рабочий');
    });

    test('VM: эффективные записи — правка перекрывает, __delete пустит', () => {
        const m = modelHost({ entries: ENTRIES, pending: PENDING })
            ._printModel(EMPS, AGG);
        assertEqual(m.rows.length, 2, 'строки печатаемого вида');
        assertEqual(m.rows[0].cells.length, 30, '30 ячеек в строке');
        // 02.09 | 017: Д перекрыт правкой ОТ
        assertEqual(m.rows[0].cells[1].status, 'ОТ', 'локальная правка видна');
        assertEqual(m.rows[0].cells[1].color, '#ECEFF1', 'цвет эффективного кода');
        // 03.09 | 031: запись удалена правкой — ячейка пустая
        assertEqual(m.rows[1].cells[2].status, '', '__delete — пустая ячейка');
        // 04.09 | 017: «.» — выходной (без кода-символа)
        assertEqual(m.rows[0].cells[3].status, '', '«.» — не код-символ');
        // итоги строк: дни/переработка-дни
        assertTrue(m.rows[0].inAgg === true, '017 в агрегате');
        assertEqual(m.rows[0].work, 21, 'дни явки 017');
        assertEqual(m.rows[0].overDays, 3, 'переработка 017 — 3 дня');
        assertEqual(m.rows[1].overDays, 0, 'переработка 031 — 0');
    });

    test('VM: usedCodes — поле УДАЛЕНО из модели (Task 442)', () => {
        const m = modelHost({ entries: ENTRIES, pending: PENDING })
            ._printModel(EMPS, AGG);
        assertTrue(!('usedCodes' in m),
            'модель печати не собирает коды — столбца кодов нет');
    });

    test('VM: события месяца — выборка/сортировка/текст', () => {
        const host = modelHost();
        const evs = host._printEventsData(EMPS);
        assertEqual(evs.length, 2, 'запись чужого месяца отфильтрована');
        assertEqual(evs[0].range, '02.09', 'однодневное — «02.09»');
        assertEqual(evs[0].code, 'И', 'код инструктажа');
        assertEqual(evs[0].text,
            'И · Повторный инструктаж · Иванов Иван Иванович',
            'текст: код · сокращение · ФИО');
        assertEqual(evs[1].range, '10–12.09', 'диапазон в одном месяце');
        assertEqual(evs[1].code, 'ОБ', 'код обучения');
        assertTrue(evs[1].text.indexOf('Сидоров Сидор Сидорович') !== -1,
            'ФИО второго сотрудника');
        // вид «сменный» — только печатаемые строки (017 в EMPS[0..1])
        const evs2 = modelHost({ view: 'shift' })._printEventsData(EMPS);
        assertEqual(evs2.length, 2, 'оба таб. номера в печатаемых — обе записи');
        const evs3 = modelHost({ view: 'shift' })
            ._printEventsData([EMPS[0]]);
        assertEqual(evs3.length, 1, 'фильтр вида: только строки печати');
    });

    test('VM: codes — поле УДАЛЕНО из модели (Task 442)', () => {
        const m = modelHost({ entries: ENTRIES, pending: PENDING })
            ._printModel(EMPS, AGG);
        assertTrue(!('codes' in m),
            'перечень кодов не строится — столбца кодов нет');
    });

    test('VM: события без «Инструктажей» — пустой массив, не падает', () => {
        const m = modelHost({ trainings: [] })._printModel(EMPS, AGG);
        assertEqual(m.events.length, 0, 'событий нет');
        assertTrue(!('codes' in m), 'кодов месяца нет (поле удалено)');
    });
});

// ============================================================
// 4. VM — _printPdfLayout: пагинация страниц PDF
// ============================================================
describe('Task 438 — VM: раскладка страниц PDF (_printPdfLayout)', () => {

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

    test('VM: компактный месяц — ОДНА страница со всем', () => {
        const lay = layoutHost()._printPdfLayout(fakeModel(10, 3, 4));
        assertEqual(lay.pages.length, 1, '10 строк + события — одна страница');
        const p = lay.pages[0];
        assertTrue(p.first === true, 'первая страница помечена');
        assertEqual(p.rows.length, 10, 'все строки на ней');
        assertEqual(p.events.length, 3, 'события на ней же');
        assertTrue(!p.codes, 'кодов на странице нет (Task 442)');
        assertEqual(lay.W, 842, 'A4 альбомная — ширина 842 pt');
        assertEqual(lay.H, 595, 'высота 595 pt');
    });

    test('VM: длинный месяц — таблица режется по строкам', () => {
        const lay = layoutHost()._printPdfLayout(fakeModel(60, 3, 4));
        assertTrue(lay.pages.length >= 2, '60 строк — несколько страниц');
        let total = 0, firstSeen = false;
        for (const p of lay.pages) total += p.rows.length;
        assertEqual(total, 60, 'все 60 строк распределены без потерь');
        for (const p of lay.pages) {
            if (p.rows.length) { firstSeen = firstSeen || p.first; }
        }
        assertTrue(firstSeen, 'флаг первой страницы выставлен');
        // все страницы с таблицей получают свою порцию строк
        const tablePages = lay.pages.filter(p => p.rows.length > 0);
        assertTrue(tablePages.length >= 2, 'таблица занимает минимум 2 страницы');
        // последняя страница несёт события (или они отдельными)
        const last = lay.pages[lay.pages.length - 1];
        assertTrue(!!last.events, 'события — на последней странице');
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
        assertEqual(evTotal, 200, 'все события распределены');
    });

    test('VM: пустой месяц (0 строк) — не падает, события живут', () => {
        const lay = layoutHost()._printPdfLayout(fakeModel(0, 0, 2));
        assertTrue(lay.pages.length >= 1, 'страницы есть');
        const last = lay.pages[lay.pages.length - 1];
        assertTrue(!!last.events, 'события (пустой список) размещены');
    });
});

// ============================================================
// 5. VM — _buildPdfDocument: структура PDF
// ============================================================
describe('Task 438 — VM: сборка PDF (_buildPdfDocument)', () => {

    function pdfHost() {
        return new Function('return ({' +
            methodText(WS_CLIENT, '_buildPdfDocument') + ',' +
            methodText(WS_CLIENT, '_wsXlsBytes') +
            '});')();
    }

    function fakeJpeg(marker) {
        return { bytes: new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, marker,
                                        0x00, 0x11, 0x22, 0x33, 0xFF, 0xD9]),
                 w: 1684, h: 1190 };
    }

    test('VM: каркас %PDF / Catalog / Pages / xref', () => {
        const out = pdfHost()._buildPdfDocument([fakeJpeg(1)], 842, 595);
        const txt = Buffer.from(out).toString('latin1');
        assertTrue(txt.indexOf('%PDF-1.4') === 0, 'заголовок %PDF-1.4');
        assertTrue(txt.indexOf('/Type /Catalog') !== -1, 'каталог');
        assertTrue(txt.indexOf('/Type /Pages') !== -1, 'дерево страниц');
        assertTrue(txt.indexOf('/Root 1 0 R') !== -1, 'trailer ссылается на корень');
        assertTrue(txt.indexOf('%%EOF') !== -1, 'файл завершён');
    });

    test('VM: DCTDecode passthrough — JPEG-байты вставлены как есть', () => {
        const out = pdfHost()._buildPdfDocument([fakeJpeg(0x42)], 842, 595);
        const txt = Buffer.from(out).toString('latin1');
        assertEqual(txt.split('/DCTDecode').length - 1, 1,
            'фильтр DCTDecode на каждый JPEG');
        assertTrue(txt.indexOf('/Width 1684') !== -1 &&
                   txt.indexOf('/Height 1190') !== -1,
            'размер растра из canvas');
        // маркерный байт JPEG пережил вставку без перекодировки
        const seq = String.fromCharCode(0xFF, 0xD8, 0xFF, 0xE0, 0x42);
        assertTrue(txt.indexOf(seq) !== -1, 'сигнатура JPEG вставлена дословно');
    });

    test('VM: две страницы — 2 Page/2 Image/2 Contents, MediaBox', () => {
        const out = pdfHost()._buildPdfDocument(
            [fakeJpeg(1), fakeJpeg(2)], 842, 595);
        const txt = Buffer.from(out).toString('latin1');
        assertEqual(txt.split('/Type /Page ').length - 1, 2,
            'два Page-объекта (не путать с /Pages)');
        assertEqual(txt.split('/Subtype /Image').length - 1, 2, 'два изображения');
        assertEqual(txt.split('/Count 2').length - 1, 1, 'Pages /Count 2');
        assertEqual(txt.split('MediaBox [0 0 842 595]').length - 1, 2,
            'MediaBox A4-альбомная на каждой странице');
    });

    test('VM: xref корректен — startxref указывает на xref, объект 1 на месте', () => {
        const out = pdfHost()._buildPdfDocument([fakeJpeg(1)], 842, 595);
        const txt = Buffer.from(out).toString('latin1');
        const m = txt.match(/startxref\n(\d+)\n%%EOF/);
        assertTrue(!!m, 'startxref найден');
        const xrefPos = parseInt(m[1], 10);
        assertEqual(txt.slice(xrefPos, xrefPos + 4), 'xref',
            'смещение указывает на таблицу xref');
        // первая запись xref (после заглушки 0) — смещение объекта 1:
        // [0]='xref', [1]='0 N', [2]='...65535 f', [3]=объект 1
        const x2 = txt.indexOf('00000 n \n', xrefPos);
        const entry = txt.slice(xrefPos, x2);
        const off1 = parseInt(entry.split('\n')[3].slice(0, 10), 10);
        assertEqual(txt.slice(off1, off1 + 7), '1 0 obj',
            'объект 1 находится по своей xref-записи');
    });

    test('VM: пустой список страниц — валидный документ без Page', () => {
        const out = pdfHost()._buildPdfDocument([], 842, 595);
        const txt = Buffer.from(out).toString('latin1');
        assertEqual(txt.split('/Type /Page ').length - 1, 0, 'страниц нет');
        assertTrue(txt.indexOf('/Count 0') !== -1, 'Count 0');
    });
});

// ============================================================
// 6. VM — Excel: _buildTabelWorkbook + стили + лист
// ============================================================
describe('Task 438 — VM: книга Excel (_buildTabelWorkbook)', () => {

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
            '_empTipLine: function() { return "смена №1"; },' +
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

    const EMPS = [
        { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' },
        { 'ФИО': 'Сидоров Сидор Сидорович', 'таб_номер': '031' }
    ];
    const AGG = {
        byTab: { '017': { work: 21, hours: 151.2, over: 36, overDays: 3 },
                 '031': { work: 19, hours: 136.8, over: 0, overDays: 0 } }
    };

    test('VM: книга — имя, лист «Табель», stored-zip консистентен', () => {
        const wb = tabelHost()._buildTabelWorkbook(EMPS, AGG);
        assertEqual(wb.name, 'График_работы_Сентябрь_2026.xlsx',
            'имя файла книги');
        const z = parseZip(wb.bytes);
        assertEqual(z.eocd, 0x06054b50, 'EOCD в хвосте (валидный zip)');
        const names = z.files.map(f => f.name);
        for (const need of ['[Content_Types].xml', '_rels/.rels',
                            'xl/workbook.xml', 'xl/_rels/workbook.xml.rels',
                            'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
            assertTrue(names.indexOf(need) !== -1, 'часть книги: ' + need);
        }
        for (const f of z.files) {
            assertEqual(f.method, 0, 'метод stored: ' + f.name);
        }
        const wbXml = Buffer.from(
            z.files.filter(f => f.name === 'xl/workbook.xml')[0].data)
            .toString('utf8');
        assertTrue(wbXml.indexOf('<sheet name="Табель"') !== -1,
            'лист называется «Табель»');
    });

    test('VM: лист — шапка 2 строки, без «Часы», Перераб. — дни', () => {
        const wb = tabelHost()._buildTabelWorkbook(EMPS, AGG);
        const z = parseZip(wb.bytes);
        const sheet = Buffer.from(
            z.files.filter(f => f.name === 'xl/worksheets/sheet1.xml')[0].data)
            .toString('utf8');
        assertTrue(sheet.indexOf('>График работы<') !== -1, 'строка 1: «График работы»');
        assertTrue(sheet.indexOf('сентябрь 2026 г. · вид табеля: полный') !== -1,
            'строка 2: месяц/год · вид табеля');
        assertTrue(sheet.indexOf('Норма (40-час') === -1, 'нормы в книге нет');
        assertTrue(sheet.indexOf('Распечатано') === -1, 'штампа в книге нет');
        assertTrue(sheet.indexOf('>Работник<') !== -1, 'заголовок колонки работника');
        assertTrue(sheet.indexOf('>Дни<') !== -1, 'колонка «Дни»');
        assertTrue(sheet.indexOf('>Перераб.<') !== -1, 'колонка «Перераб.»');
        assertTrue(sheet.indexOf('>Часы<') === -1, 'колонки «Часы» НЕТ');
        assertTrue(sheet.indexOf('<v>21</v>') !== -1, 'дни явки 017');
        assertTrue(sheet.indexOf('<v>3</v>') !== -1, 'переработка 017 — 3 (дни)');
        assertTrue(sheet.indexOf('151,2') === -1 && sheet.indexOf('136,8') === -1,
            'часы в книге не выгружаются');
        assertTrue(sheet.indexOf('>—<') !== -1, 'нулевая переработка — «—»');
    });

    test('VM: лист — ячейки кодов с цветами, дни недели, закрепление', () => {
        const wb = tabelHost()._buildTabelWorkbook(EMPS, AGG);
        const z = parseZip(wb.bytes);
        const sheet = Buffer.from(
            z.files.filter(f => f.name === 'xl/worksheets/sheet1.xml')[0].data)
            .toString('utf8');
        // ячейка ОТ (02.09, 017) — inline-строка с заливкой (стиль 7+)
        assertTrue(sheet.indexOf('t="inlineStr"') !== -1, 'строки inlineStr');
        assertTrue(/<c r="B6" s="5"\/>/.test(sheet) ||
                   sheet.indexOf('Иванов Иван Иванович') !== -1,
            'ФИО в первой строке данных');
        assertTrue(sheet.indexOf('xSplit="1" ySplit="5"') !== -1,
            'закрепление: столбец A + шапка/дни (B6)');
        assertTrue(sheet.indexOf('<t>Пн</t>') !== -1 ||
                   sheet.indexOf('<t>Вт</t>') !== -1,
            'строка дней недели под числами');
        // styles: заливка синяя шапки + заливка ОТ (#ECEFF1)
        const styles = Buffer.from(
            z.files.filter(f => f.name === 'xl/styles.xml')[0].data)
            .toString('utf8');
        assertTrue(styles.indexOf('FF4472C4') !== -1, 'шапка — синяя заливка');
        assertTrue(styles.indexOf('FFECEFF1') !== -1,
            'цвет кода ОТ — динамическая заливка');
        assertTrue(styles.indexOf('FFE082') !== -1,
            'цвет кода Д — заливка тоже');
    });

    test('VM: лист — мероприятия и коды (сокращённые)', () => {
        const wb = tabelHost()._buildTabelWorkbook(EMPS, AGG);
        const z = parseZip(wb.bytes);
        const sheet = Buffer.from(
            z.files.filter(f => f.name === 'xl/worksheets/sheet1.xml')[0].data)
            .toString('utf8');
        assertTrue(sheet.indexOf('Мероприятия · сентябрь 2026 · 1') !== -1,
            'секция мероприятий с счётчиком');
        assertTrue(sheet.indexOf('02.09') !== -1, 'дата мероприятия');
        assertTrue(sheet.indexOf('И · Повторный инструктаж · Иванов Иван Иванович') !== -1,
            'текст события: код · сокращение · ФИО');
        // Task 442: столбец кодов удалён — секция «Коды:» НЕ выгружается
        assertTrue(sheet.indexOf('>Коды:<') === -1, 'секции «Коды:» нет');
        assertTrue(sheet.indexOf('Д — день 12ч') === -1,
            'расшифровок кодов в книге нет');
        assertTrue(sheet.indexOf('ОТ — отпуск') === -1,
            'расшифровки ОТ нет');
    });

    test('VM: пустой месяц мероприятий — строка-заглушка', () => {
        const host = tabelHost();
        host._TRAININGS = [];
        const wb = host._buildTabelWorkbook(EMPS, AGG);
        const z = parseZip(wb.bytes);
        const sheet = Buffer.from(
            z.files.filter(f => f.name === 'xl/worksheets/sheet1.xml')[0].data)
            .toString('utf8');
        assertTrue(sheet.indexOf('нет мероприятий в этом месяце') !== -1,
            'пустой месяц — заглушка (как в печати)');
    });
});

// ============================================================
// 7. VM — сохранение PDF/Excel (моки скачивания и тостов)
// ============================================================
describe('Task 438 — VM: кнопки «Сохранить PDF» / «Сохранить Excel»', () => {

    function pdfSaveHost(paintStub) {
        const dl = { calls: [] };
        const toasts = [];
        const KipToast = { show: function(m) { toasts.push(m); } };
        const host = new Function('KipToast', 'return ({' +
            methodText(WS_CLIENT, '_savePrintPdf') + ',' +
            methodText(WS_CLIENT, '_printPdfLayout') + ',' +
            methodText(WS_CLIENT, '_buildPdfDocument') + ',' +
            methodText(WS_CLIENT, '_wsXlsBytes') + ',' +
            '_month: 9, _year: 2026,' +
            '_printModel: function() {' +
            '    return { year: 2026, month: 9, view: "full",' +
            '             days: [{ d: 1, dow: "Вт", off: false }],' +
            '             rows: [{ fio: "Иванов И. И.", tip: "", tab: "017",' +
            '                      cells: [], inAgg: true, work: 21,' +
            '                      overDays: 3 }],' +
            '             events: [], codes: [] };' +
            '},' +
            '_printPdfPaintPage: ' + paintStub.toString() + ',' +
            '});')(KipToast);
        host._wsDownload = function(b, m, n) {
            dl.calls.push({ m: m, n: n, size: b.length });
            return true;
        };
        return { host: host, dl: dl, toasts: toasts };
    }

    test('VM: _savePrintPdf — файл .pdf в загрузки + тост', () => {
        const paint = function() {
            return { bytes: new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1]),
                     w: 1684, h: 1190 };
        };
        const t = pdfSaveHost(paint);
        t.host._savePrintPdf([], null);
        assertEqual(t.dl.calls.length, 1, 'файл отдан в загрузки');
        assertEqual(t.dl.calls[0].n, 'График_работы_Сентябрь_2026.pdf',
            'имя PDF-файла');
        assertEqual(t.dl.calls[0].m, 'application/pdf', 'mime PDF');
        assertTrue(t.dl.calls[0].size > 100,
            'тело PDF не пустое (каркас + JPEG)');
        assertEqual(t.toasts.length, 1, 'тост показан');
        assertTrue(t.toasts[0].indexOf('График сохранён') !== -1,
            'текст тоста об успехе');
    });

    test('VM: _savePrintPdf — отрисовка не удалась → тост об ошибке', () => {
        const t = pdfSaveHost(function() { return null; });
        t.host._savePrintPdf([], null);
        assertEqual(t.dl.calls.length, 0, 'скачивания НЕТ');
        assertEqual(t.toasts.length, 1, 'тост показан');
        assertTrue(t.toasts[0].indexOf('Не удалось сохранить PDF') !== -1,
            'текст тоста об ошибке');
    });

    function xlsxSaveHost(wbStub) {
        const dl = { calls: [] };
        const toasts = [];
        const KipToast = { show: function(m) { toasts.push(m); } };
        const host = new Function('KipToast', 'return ({' +
            methodText(WS_CLIENT, '_savePrintXlsx') + ',' +
            '_buildTabelWorkbook: ' + wbStub.toString() + ',' +
            '});')(KipToast);
        host._wsDownload = function(b, m, n) {
            dl.calls.push({ m: m, n: n });
            return true;
        };
        return { host: host, dl: dl, toasts: toasts };
    }

    test('VM: _savePrintXlsx — книга .xlsx в загрузки + тост', () => {
        const t = xlsxSaveHost(function() {
            return { name: 'График_работы_Сентябрь_2026.xlsx',
                     bytes: new Uint8Array([1, 2, 3]),
                     counts: { rows: 2, events: 0, codes: 3, colors: 3 } };
        });
        t.host._savePrintXlsx([], null);
        assertEqual(t.dl.calls.length, 1, 'файл отдан в загрузки');
        assertEqual(t.dl.calls[0].n, 'График_работы_Сентябрь_2026.xlsx',
            'имя Excel-файла');
        assertEqual(t.dl.calls[0].m,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'mime xlsx');
        assertTrue(t.toasts[0].indexOf('График сохранён') !== -1,
            'тост об успехе');
    });

    test('VM: _savePrintXlsx — генерация упала → тост об ошибке', () => {
        const t = xlsxSaveHost(function() { throw new Error('boom'); });
        t.host._savePrintXlsx([], null);
        assertEqual(t.dl.calls.length, 0, 'скачивания НЕТ');
        assertTrue(t.toasts[0].indexOf('Не удалось сохранить Excel') !== -1,
            'текст тоста об ошибке');
    });
});

// ============================================================
// 8. Service Worker
// ============================================================
describe('Task 438 — Service Worker', () => {

    test('SW: кэш поднят до kipia-test-v742', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v742'") !== -1,
            'CACHE_VERSION = kipia-test-v742 (Task 438 — печать/PDF/Excel)');
        assertFalse(SW_SRC.indexOf('kipia-test-v743') !== -1,
            'лишний инкремент (v663) не сделан');
    });

    test('SW: в index.html нет захардкоженной версии кэша', () => {
        assertFalse(INDEX_SRC.indexOf('kipia-test-v743') !== -1,
            'клиент не знает номер кэша (версией управляет sw.js)');
    });
});
