// tests/test-task360.js
// Task 360 — заявка пользователя: «В разделе Табель учёта
// рабочего времени, в отображении распечатываемого графика, под
// графиком вначале должен отображаться список мероприятий на
// текущий месяц в один столбик, а под списком, в один столбик
// перечень кодов с их наименованием только которые есть в этом
// месяце» (правка печатной формы — Tasks 341/342/343).
// Печатный лист #wsPrintSheet ПОД шахматкой:
//   • СЕКЦИЯ «Мероприятия · <месяц> <год> · N» — записи листа
//     «Инструктажи», ПЕРЕСЕКАЮЩИЕ открытый месяц (дата_начала..
//     дата_окончания — та же выборка, что в окне «Мероприятия»
//     тулбара, Task 313), сортировка по дате начала, затем по
//     таб. номеру; КАЖДАЯ запись — отдельной строкой (один
//     столбик): точка цвета кода, диапазон дат («02.09»,
//     «02–05.09», «29.08–02.09»), «код · тема · ФИО»; пустой
//     месяц — «нет мероприятий в этом месяце»;
//   • ПОД списком — ПЕРЕЧЕНЬ КОДОВ только этого месяца (один
//     столбик, каждый код отдельной строкой; прежде — весь
//     справочник в одну строку): коды собираются по эффективным
//     записям ПЕЧАТАЕМЫХ строк (локальные правки учитываются,
//     __delete исключается); порядок — справочник
//     _STATUS_CODES; легаси-код вне справочника — в конце без
//     цвета и имени;
//   • классы печати wsp-mev-* — отдельные от бейджей ячеек
//     wsp-ev* (Task 361 вернул бейджи в _printCell; список
//     мероприятий живёт в собственных классах wsp-mev-*,
//     пересечения нет);
//   • CSS @media print: .wsp-mev-item/.wsp-lg — display: block
//     (один столбик) + page-break-inside: avoid.
//
// SW: kipia-test-v736.
//
// Запуск: через tests/run-all.js (require './test-task360.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Срез исходника от начала объекта WorkSchedule (имена методов
// НЕуникальны в файле — извлекаем только из модуля «График работы»)
const WS_START = INDEX_SRC.indexOf('var WorkSchedule = {');
const WS_CLIENT = INDEX_SRC.slice(WS_START, WS_START + 600000);

function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
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
// 1. SRC — секция мероприятий месяца в печатном листе
// ============================================================
describe('Task 360 — SRC: секция мероприятий в печати', () => {

    test('SRC: _buildPrintHtml строит секцию wsp-mev с заголовком «Мероприятия»', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.length > 0, 'метод найден');
        assertTrue(b.indexOf('<div class="wsp-mev">') !== -1,
            'контейнер секции wsp-mev');
        assertTrue(b.indexOf('Мероприятия · ') !== -1,
            'заголовок «Мероприятия · месяц год»');
        assertTrue(b.indexOf('<span class="wsp-mev-item">') !== -1,
            'строка мероприятия wsp-mev-item');
        assertTrue(b.indexOf('wsp-mev-date') !== -1, 'дата диапазона');
        assertTrue(b.indexOf('wsp-mev-text') !== -1, 'текст мероприятия');
    });

    test('SRC: выборка — _TRAININGS, пересечение с месяцем, сортировка', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf('this._TRAININGS || []') !== -1,
            'источник — слой мероприятий _TRAININGS');
        assertTrue(b.indexOf("'дата_начала'") !== -1 &&
                   b.indexOf("'дата_окончания'") !== -1,
            'фильтр по датам начала/окончания');
        assertTrue(b.indexOf('mStart') !== -1 && b.indexOf('mEnd') !== -1,
            'границы месяца');
        assertTrue(b.indexOf('localeCompare') !== -1,
            'сортировка по дате начала/таб. номеру');
        assertTrue(b.indexOf('нет мероприятий в этом месяце') !== -1,
            'пустой месяц — строка-заглушка');
    });

    test('SRC: код и цвет мероприятия — _trainingCodeOf/_statusMeta, ФИО по таб. номеру', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf('this._trainingCodeOf') !== -1,
            'код типа мероприятия');
        assertTrue(b.indexOf('this._statusMeta') !== -1,
            'цвет кода из справочника');
        assertTrue(b.indexOf("'таб. №'") !== -1,
            'фолбэк ФИО — таб. номер');
    });

    test('SRC: классы списка НЕ wsp-ev* (бейджи 361 — в _printCell)', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf('wsp-ev') === -1,
            'префикс wsp-ev не используется в секции мероприятий (бейджи ячеек Task 361 — в _printCell)');
    });

    test('SRC: порядок секций — таблица → обёртка(мероприятия)', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        const iTable = b.indexOf("'</tbody></table>'");
        const iMev = b.indexOf('<div class="wsp-mev">');
        const iFoot = b.indexOf('<div class="wsp-foot">');
        assertTrue(iTable !== -1 && iMev !== -1,
            'таблица и секция мероприятий на месте');
        assertTrue(iFoot === -1, 'сноски wsp-foot нет (Task 438)');
        assertTrue(iTable < iMev, 'мероприятия ПОД графиком');
        // Task 442: перечень кодов УДАЛЁН — секция одна, лист
        // заканчивается списком мероприятий
        assertTrue(b.indexOf('wsp-legend') === -1,
            'легенды кодов нет (Task 442: столбец удалён)');
    });
});

// ============================================================
// 2. SRC — перечень кодов только этого месяца
// ============================================================
describe('Task 360 — SRC: перечень кодов месяца', () => {

    test('SRC: usedCodes и легенда УДАЛЕНЫ (Task 442)', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf('var usedCodes = {}') === -1,
            'карты кодов месяца нет — перечню некуда собираться');
        assertTrue(b.indexOf('var legacy = [];') === -1,
            'легаси-кодов нет');
        assertTrue(b.indexOf('wsp-lg') === -1,
            'записей легенды нет');
    });
});

// ============================================================
// 3. SRC — печатный CSS: один столбик
// ============================================================
describe('Task 360 — печатный CSS (один столбик)', () => {

    // правила Task 360 находятся ДАЛЬШЕ 6000-символьного окна
    // прежних тестов — берём увеличенный срез @media print
    // (Task 361 удлинил блок комментариями/правилами бейджей)
    function printCss() {
        const i = INDEX_SRC.indexOf('@media print');
        // Task 439 удлинил блок (flex-ряд + комментарии) — окно 16000
        return stripComments(INDEX_SRC.slice(i, i + 16000));
    }

    test('SRC: секция .wsp-mev — стили в @media print', () => {
        const block = printCss();
        assertTrue(block.indexOf('#wsPrintSheet .wsp-mev {') !== -1,
            'контейнер секции');
        assertTrue(block.indexOf('#wsPrintSheet .wsp-mev-t {') !== -1,
            'заголовок секции (жирный)');
        assertTrue(block.indexOf('#wsPrintSheet .wsp-mev-item {') !== -1,
            'строка мероприятия');
        assertTrue(block.indexOf('#wsPrintSheet .wsp-mev-item i {') !== -1,
            'точка цвета кода');
        assertTrue(block.indexOf('#wsPrintSheet .wsp-mev-date {') !== -1,
            'дата диапазона');
        assertTrue(block.indexOf('#wsPrintSheet .wsp-mev-none {') !== -1,
            'строка «нет мероприятий»');
    });

    test('SRC: .wsp-mev-item — запись-блок [точка][дата][текст] + без разрыва', () => {
        const block = printCss();
        const i = block.indexOf('#wsPrintSheet .wsp-mev-item {');
        const rule = block.slice(i, block.indexOf('}', i) + 1);
        // Task 433: запись — ГИБКИЙ РЯД: [точка][дата][текст],
        // правая часть (текст) РАСТЯНУТА до конца листа
        // (.wsp-mev-text flex:1), перенос — только когда текст
        // не вмещается в одну строку (прежде display: block
        // Task 360–432)
        assertTrue(rule.indexOf('display: flex') !== -1,
            'запись-«блок» — гибкий ряд [точка][дата][текст] (Task 433)');
        assertTrue(rule.indexOf('page-break-inside: avoid') !== -1,
            'строка не рвётся между страницами');
    });

    test('SRC: правила легенды .wsp-lg/.wsp-legend-* УДАЛЕНЫ (Task 442)', () => {
        const block = printCss();
        assertTrue(block.indexOf('#wsPrintSheet .wsp-lg {') === -1,
            'правила .wsp-lg нет (столбец кодов удалён)');
        assertTrue(block.indexOf('#wsPrintSheet .wsp-legend-t {') === -1,
            'правила заголовка «Коды:» нет');
        assertTrue(block.indexOf('#wsPrintSheet .wsp-legend-cols {') === -1,
            'правила сетки кодов нет');
    });

    test('SRC: точка цвета мероприятия печатается принудительно', () => {
        const block = printCss();
        const i = block.indexOf('#wsPrintSheet .wsp-mev-item i {');
        const rule = block.slice(i, block.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('print-color-adjust: exact') !== -1,
            'print-color-adjust: exact');
    });
});

// ============================================================
// 4. VM — _buildPrintHtml: список мероприятий месяца
// ============================================================
describe('Task 360 — VM: список мероприятий месяца', () => {

    function sheetHost(opts) {
        opts = opts || {};
        return new Function('ProdCalendar', 'return ({' +
            methodText(WS_CLIENT, '_instrShortOf') + '\n' +
            methodText(WS_CLIENT, '_normInstrKey') + '\n' +
            methodText(WS_CLIENT, '_instrShortOf') + '\n' +
            methodText(WS_CLIENT, '_normInstrKey') + '\n' +
            methodText(WS_CLIENT, '_buildPrintHtml') + '\n' +
            '_year: 2026, _month: ' + (opts.month || 9) + ', _view: "full",' +
            '_isoDate: function(dt) { return dt.getFullYear() + "-" + ' +
                '(dt.getMonth() < 9 ? "0" : "") + (dt.getMonth() + 1) + "-" + ' +
                '(dt.getDate() < 10 ? "0" : "") + dt.getDate(); },' +
            '_buildEntryIndex: function() { return ' + JSON.stringify(opts.entries || {}) + '; },' +
            '_PENDING: ' + JSON.stringify(opts.pending || {}) + ',' +
            '_empTipLine: function() { return "смена №1"; },' +
            '_fmtTotalsNum: function(v) { return String(Math.round((v || 0) * 10) / 10).replace(".", ","); },' +
            '_STATUS_CODES: ' + JSON.stringify(opts.codes || [
                { code: 'Д', name: 'День (12-час)', color: '#FFE082' },
                { code: 'Н', name: 'Ночь (12-час)', color: '#B0BEC5' },
                { code: 'И', name: 'Инструктаж', color: '#B3E5FC' },
                { code: '.', name: 'Плановый выходной', color: '#EEF0F2' }]) + ',' +
            '_calDayOff: function(day) { return day % 7 === 0 || day % 7 === 6; },' +
            '_vacationAt: function() { return null; },' +
            '_TRAININGS: ' + JSON.stringify(opts.trainings || []) + ',' +
            '_EMPLOYEES: ' + JSON.stringify(opts.employees || [
                { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' },
                { 'ФИО': 'Сидоров Сидор Сидорович', 'таб_номер': '031' }]) + ',' +
            '_trainingCodeOf: function(t) { ' +
                'return t === "инструктаж" ? "И" : (t === "обучение" ? "ОБ" : ""); },' +
            '_statusMeta: function(code) { ' +
                'var m = { "И": { code: "И", color: "#B3E5FC", name: "Инструктаж" }, ' +
                '"ОБ": { code: "ОБ", color: "#D1C4E9", name: "Обучение" } }; ' +
                'return m[code] || null; },' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '_printCell: function(day, iso, emp, entry) { return "<td>[" + (entry ? entry.статус : "-") + "]</td>"; },' +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')(opts.pcal);
    }

    var EMPS = [
        { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' },
        { 'ФИО': 'Сидоров Сидор Сидорович', 'таб_номер': '031' }
    ];
    var AGG = { byTab: {}, grand: null };

    test('VM: мероприятие месяца — строка с датой, кодом, темой, ФИО', () => {
        var trs = [{ 'таб_номер': '017', 'тип': 'инструктаж',
                     'дата_начала': '2026-09-02', 'тема': 'Повторный инструктаж' }];
        var html = sheetHost({ trainings: trs })._buildPrintHtml(EMPS, AGG);
        var iMev = html.indexOf('<div class="wsp-mev">');
        assertTrue(iMev !== -1, 'секция есть');
        var sec = html.slice(iMev, html.indexOf('</div>', iMev));
        assertTrue(sec.indexOf('Мероприятия · сентябрь 2026 · 1') !== -1,
            'заголовок с месяцем и количеством');
        assertTrue(sec.indexOf('<b class="wsp-mev-date">02.09</b>') !== -1,
            'дата одной записи «02.09»');
        assertTrue(sec.indexOf('И · Повторный инструктаж · Иванов Иван Иванович') !== -1,
            'код · тема · ФИО');
        assertTrue(sec.indexOf('background:#B3E5FC') !== -1,
            'точка цвета кода И');
    });

    test('VM: диапазоны — «02–05.09» и «29.08–02.09» (через границу)', () => {
        var trs = [
            { 'таб_номер': '017', 'тип': 'инструктаж', 'дата_начала': '2026-09-02',
              'дата_окончания': '2026-09-05', 'тема': 'Инструктаж' },
            { 'таб_номер': '031', 'тип': 'инструктаж', 'дата_начала': '2026-08-29',
              'дата_окончания': '2026-09-02', 'тема': 'Приборка' }
        ];
        var html = sheetHost({ trainings: trs })._buildPrintHtml(EMPS, AGG);
        var iMev = html.indexOf('<div class="wsp-mev">');
        var sec = html.slice(iMev, html.indexOf('</div>', iMev));
        assertTrue(sec.indexOf('<b class="wsp-mev-date">02–05.09</b>') !== -1,
            'диапазон в один месяц');
        assertTrue(sec.indexOf('<b class="wsp-mev-date">29.08–02.09</b>') !== -1,
            'диапазон через границу месяца');
    });

    test('VM: пересечение с месяцом — запись августа видна, октября НЕТ', () => {
        var trs = [
            { 'таб_номер': '017', 'тип': 'инструктаж', 'дата_начала': '2026-08-31',
              'дата_окончания': '2026-09-01', 'тема': 'Август' },
            { 'таб_номер': '017', 'тип': 'инструктаж', 'дата_начала': '2026-10-01',
              'тема': 'Октябрь' }
        ];
        var html = sheetHost({ trainings: trs })._buildPrintHtml(EMPS, AGG);
        var iMev = html.indexOf('<div class="wsp-mev">');
        var sec = html.slice(iMev, html.indexOf('</div>', iMev));
        assertTrue(sec.indexOf('Август') !== -1,
            'запись 31.08–01.09, накрывающая сентябрь, видна');
        assertTrue(sec.indexOf('Октябрь') === -1, 'запись вне месяца НЕ попадает');
        assertTrue(sec.indexOf('· 1') !== -1, 'счётчик = 1');
    });

    test('VM: сортировка по дате начала, затем по таб. номеру', () => {
        var trs = [
            { 'таб_номер': '031', 'тип': 'инструктаж', 'дата_начала': '2026-09-10', 'тема': 'B' },
            { 'таб_номер': '017', 'тип': 'инструктаж', 'дата_начала': '2026-09-15', 'тема': 'C' },
            { 'таб_номер': '017', 'тип': 'инструктаж', 'дата_начала': '2026-09-10', 'тема': 'A' }
        ];
        var html = sheetHost({ trainings: trs })._buildPrintHtml(EMPS, AGG);
        var iMev = html.indexOf('<div class="wsp-mev">');
        var sec = html.slice(iMev, html.indexOf('</div>', iMev));
        // поиск по полному тексту строки (одиночные буквы A/B/C
        // ловились бы в hex-цвете точки #B3E5FC)
        var iA = sec.indexOf('И · A ·');
        var iB = sec.indexOf('И · B ·');
        var iC = sec.indexOf('И · C ·');
        assertTrue(iA !== -1 && iB !== -1 && iC !== -1, 'все три строки есть');
        assertTrue(iA < iB, 'одна дата — раньше по таб. номеру (017 «A» до 031 «B»)');
        assertTrue(iB < iC, 'позже дата — ниже (10.09 до 15.09)');
    });

    test('VM: пустой месяц — «нет мероприятий в этом месяце»', () => {
        var html = sheetHost()._buildPrintHtml(EMPS, AGG);
        var iMev = html.indexOf('<div class="wsp-mev">');
        var sec = html.slice(iMev, html.indexOf('</div>', iMev));
        assertTrue(sec.indexOf('нет мероприятий в этом месяце') !== -1,
            'строка-заглушка');
        assertTrue(sec.indexOf('wsp-mev-none') !== -1, 'класс заглушки');
    });

    test('VM: сотрудника нет в _EMPLOYEES — таб. номер; темы нет — имя кода', () => {
        var trs = [{ 'таб_номер': '999', 'тип': 'обучение',
                     'дата_начала': '2026-09-07' }];
        var html = sheetHost({ trainings: trs })._buildPrintHtml(EMPS, AGG);
        var iMev = html.indexOf('<div class="wsp-mev">');
        var sec = html.slice(iMev, html.indexOf('</div>', iMev));
        assertTrue(sec.indexOf('таб. №999') !== -1, 'фолбэк ФИО');
        assertTrue(sec.indexOf('ОБ · Обучение') !== -1,
            'темы нет — имя кода из справочника');
    });

    test('VM: без _TRAININGS/_EMPLOYEES/_trainingCodeOf (старый мок) — не падает', () => {
        var host = new Function('ProdCalendar', 'return ({' +
            methodText(WS_CLIENT, '_instrShortOf') + '\n' +
            methodText(WS_CLIENT, '_normInstrKey') + '\n' +
            methodText(WS_CLIENT, '_instrShortOf') + '\n' +
            methodText(WS_CLIENT, '_normInstrKey') + '\n' +
            methodText(WS_CLIENT, '_buildPrintHtml') + '\n' +
            '_year: 2026, _month: 9, _view: "full",' +
            '_isoDate: function(dt) { return "2026-09-01"; },' +
            '_buildEntryIndex: function() { return {}; },' +
            '_PENDING: {},' +
            '_empTipLine: function() { return ""; },' +
            '_fmtTotalsNum: function(v) { return String(v); },' +
            '_STATUS_CODES: [{ code: "Д", name: "День", color: "#FFE082" }],' +
            '_calDayOff: function() { return false; },' +
            '_vacationAt: function() { return null; },' +
            '_statusMeta: function() { return null; },' +
            '_EVENT_CODES: ["И"],' +
            '_printCell: function() { return "<td></td>"; },' +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')();
        var html = host._buildPrintHtml(EMPS, AGG);
        assertTrue(html.indexOf('wsp-mev') !== -1, 'лист построен с секцией');
        assertTrue(html.indexOf('нет мероприятий в этом месяце') !== -1,
            'пустой список без слоя мероприятий');
    });
});

// ============================================================
// 5. VM — перечень кодов только этого месяца
// ============================================================
describe('Task 360 — VM: перечень кодов месяца', () => {

    function sheetHost(opts) {
        opts = opts || {};
        return new Function('ProdCalendar', 'return ({' +
            methodText(WS_CLIENT, '_instrShortOf') + '\n' +
            methodText(WS_CLIENT, '_normInstrKey') + '\n' +
            methodText(WS_CLIENT, '_instrShortOf') + '\n' +
            methodText(WS_CLIENT, '_normInstrKey') + '\n' +
            methodText(WS_CLIENT, '_buildPrintHtml') + '\n' +
            '_year: 2026, _month: 9, _view: "full",' +
            '_isoDate: function(dt) { return dt.getFullYear() + "-" + ' +
                '(dt.getMonth() < 9 ? "0" : "") + (dt.getMonth() + 1) + "-" + ' +
                '(dt.getDate() < 10 ? "0" : "") + dt.getDate(); },' +
            '_buildEntryIndex: function() { return ' + JSON.stringify(opts.entries || {}) + '; },' +
            '_PENDING: ' + JSON.stringify(opts.pending || {}) + ',' +
            '_empTipLine: function() { return "смена №1"; },' +
            '_fmtTotalsNum: function(v) { return String(Math.round((v || 0) * 10) / 10).replace(".", ","); },' +
            '_STATUS_CODES: ' + JSON.stringify(opts.codes || [
                { code: 'Д', name: 'День (12-час)', color: '#FFE082' },
                { code: 'Н', name: 'Ночь (12-час)', color: '#B0BEC5' },
                { code: 'ОТ', name: 'Отпуск', color: '#ECEFF1' },
                { code: '.', name: 'Плановый выходной', color: '#EEF0F2' }]) + ',' +
            '_calDayOff: function(day) { return day % 7 === 0 || day % 7 === 6; },' +
            '_vacationAt: function() { return null; },' +
            '_TRAININGS: [],' +
            '_EMPLOYEES: [],' +
            '_statusMeta: function() { return null; },' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '_printCell: function(day, iso, emp, entry) { return "<td>[" + (entry ? entry.статус : "-") + "]</td>"; },' +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')();
    }

    var EMPS = [
        { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' },
        { 'ФИО': 'Сидоров Сидор Сидорович', 'таб_номер': '031' }
    ];
    var AGG = { byTab: {}, grand: null };

    // Task 442: легенда кодов удалена — legendSection больше не
    // нужна; проверяем ОТСУТСТВИЕ перечня на листе
    test('VM: перечень кодов на листе НЕТ (Task 442)', () => {
        var entries = {
            '2026-09-02|017': { 'статус': 'Д' },
            '2026-09-03|031': { 'статус': 'Д' },
            '2026-09-04|017': { 'статус': '.' }
        };
        var html = sheetHost({ entries: entries })._buildPrintHtml(EMPS, AGG);
        assertTrue(html.indexOf('wsp-legend') === -1,
            'легенды кодов нет (столбец удалён, Task 442)');
        assertTrue(html.indexOf('Д — День (12-час)') === -1,
            'расшифровки кода Д нет');
        assertTrue(html.indexOf('Коды:') === -1, 'заголовка «Коды:» нет');
        assertTrue(html.indexOf('Мероприятия · ') !== -1,
            'список мероприятий жив (Task 360)');
    });

    test('VM: пустой месяц записей — легенды нет, лист валиден', () => {
        var html = sheetHost()._buildPrintHtml(EMPS, AGG);
        assertTrue(html.indexOf('wsp-legend') === -1,
            'легенды нет и без записей (Task 442)');
        assertTrue(html.indexOf('нет мероприятий в этом месяце') !== -1,
            'заглушка мероприятий жива (Task 360)');
    });

    test('VM: печатаемые строки больше не влияют на перечень (его нет)', () => {
        var entries = {
            '2026-09-02|017': { 'статус': 'Д' },
            '2026-09-03|031': { 'статус': 'Н' }
        };
        var html = sheetHost({ entries: entries })
            ._buildPrintHtml([EMPS[0]], AGG);
        assertTrue(html.indexOf('wsp-legend') === -1,
            'легенды нет при любых записях (Task 442)');
        assertTrue(html.indexOf('Н —') === -1 && html.indexOf('Д — День') === -1,
            'расшифровок кодов на листе нет');
    });
});

// ============================================================
// 6. Регресс — прежние фичи печати живы
// ============================================================
describe('Task 360 — регресс прежних фич печати', () => {

    function sheetHost(opts) {
        opts = opts || {};
        return new Function('ProdCalendar', 'return ({' +
            methodText(WS_CLIENT, '_instrShortOf') + '\n' +
            methodText(WS_CLIENT, '_normInstrKey') + '\n' +
            methodText(WS_CLIENT, '_instrShortOf') + '\n' +
            methodText(WS_CLIENT, '_normInstrKey') + '\n' +
            methodText(WS_CLIENT, '_buildPrintHtml') + '\n' +
            '_year: 2026, _month: 9, _view: "full",' +
            '_isoDate: function(dt) { return dt.getFullYear() + "-" + ' +
                '(dt.getMonth() < 9 ? "0" : "") + (dt.getMonth() + 1) + "-" + ' +
                '(dt.getDate() < 10 ? "0" : "") + dt.getDate(); },' +
            '_buildEntryIndex: function() { return ' + JSON.stringify(opts.entries || {}) + '; },' +
            '_PENDING: ' + JSON.stringify(opts.pending || {}) + ',' +
            '_empTipLine: function() { return "смена №1"; },' +
            '_fmtTotalsNum: function(v) { return String(Math.round((v || 0) * 10) / 10).replace(".", ","); },' +
            '_STATUS_CODES: ' + JSON.stringify(opts.codes || [
                { code: 'Д', name: 'День (12-час)', color: '#FFE082' }]) + ',' +
            '_calDayOff: function(day) { return day % 7 === 0 || day % 7 === 6; },' +
            '_vacationAt: function() { return null; },' +
            '_TRAININGS: [],' +
            '_EMPLOYEES: [],' +
            '_statusMeta: function() { return null; },' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '_printCell: function(day, iso, emp, entry) { return "<td>[" + (entry ? entry.статус : "-") + "]</td>"; },' +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')();
    }

    var EMPS = [{ 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' }];

    test('VM: шапка/дни/итоги/сноска печати не тронуты', () => {
        var agg = { byTab: { '017': { work: 21, hours: 151.2, over: 12, overDays: 1 } },
                    grand: null };
        var html = sheetHost()._buildPrintHtml(EMPS, agg);
        assertTrue(html.indexOf('<div class="wsp-title">График работы</div>') !== -1,
            'заголовок листа (Task 341/438)');
        assertTrue(html.indexOf('<th class="wsp-tot wsp-tot-over">Перераб.<span>дни</span></th>') !== -1,
            'колонка «Перераб.» (Task 342/438: дни)');
        assertTrue(html.indexOf('<td class="wsp-tot wsp-tot-over">1</td>') !== -1,
            'значение переработки — дни (Task 342/438)');
        assertTrue(html.indexOf('<td class="wsp-tot wsp-tot-over">1/12</td>') === -1,
            'старый формат «1/12» не печатается (Task 438)');
        assertTrue(html.indexOf('wsp-sum') === -1, 'итоговой строки нет (Task 343)');
        assertTrue(html.indexOf('wsp-foot') === -1,
            'сноска удалена (Task 438)');
    });
});

// ============================================================
// 7. Service Worker
// ============================================================
describe('Task 360 — Service Worker', () => {

    test('SW: кэш поднят до kipia-test-v736', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v736'") !== -1,
            'CACHE_VERSION = kipia-test-v736 (Task 360 — фронтенд)');
        assertFalse(SW_SRC.indexOf('kipia-test-v737') !== -1,
            'v605 ещё не существует (лишний инкремент)');
    });
});
