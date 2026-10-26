// tests/test-task362.js
// Task 362 — заявка пользователя: «при печати сменного графика,
// мероприятия должны быть указанны только для сменных сотрудников,
// так же при печати графика дневного персонала. и не отобразилось
// наименование кода проверки знаний ПЗ, хотя он есть в мероприятиях
// у дневного сотрудника» (правка печатной формы — Tasks
// 341/342/343/360/361):
//   • СПИСОК МЕРОПРИЯТИЙ ПОД ШАХМАТКОЙ в видах «сменный»/«дневной» —
//     только сотрудники ПЕЧАТАЕМЫХ строк (viewTabs из viewEmps —
//     как строки шахматки: фильтр вида + скрытие «Мастер КИПиА»
//     у min); ровно те, чьи бейджи напечатаны в ячейках. Полный
//     вид — БЕЗ фильтра, как в окне «Мероприятия» тулбара
//     (регресс Task 360);
//   • ПЕРЕЧЕНЬ КОДОВ месяца пополняется кодами мероприятий из
//     списка (И/ОБ/ПЗ/ПР/*): у дневного персонала мероприятие
//     живёт только в «Инструктажах», записи сетки нет, а бейдж в
//     ячейке печати ставится — «ПЗ — Проверка знаний» обязан
//     печататься (баг из заявки); сноска листа ссылается на
//     перечень выше.
//
// SW: kipia-test-v759.
//
// Запуск: через tests/run-all.js (require './test-task362.js').

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

// Убирает комментарии — ассерты SRC проверяют КОД
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
// 1. SRC — фильтр мероприятий по виду табеля
// ============================================================
describe('Task 362 — SRC: мероприятия только печатаемого вида', () => {

    test('SRC: viewTabs строится по печатаемым строкам (viewEmps)', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.length > 0, 'метод найден');
        assertTrue(b.indexOf('var viewTabs = {}') !== -1,
            'набор таб. номеров печатаемых строк');
        assertTrue(b.indexOf("viewTabs[viewEmps[vi]['таб_номер']] = true") !== -1,
            'заполнение из viewEmps');
    });

    test('SRC: фильтр включён только в видах «сменный»/«дневной»', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf("var evByView = (this._view === 'shift' || this._view === 'day');") !== -1,
            'фильтр — только shift/day (полный вид без фильтра, регресс 360)');
        assertTrue(b.indexOf("if (evByView && !viewTabs[tr['таб_номер']]) continue;") !== -1,
            'запись чужого вида пропускается');
    });

    test('SRC: пометка кодов мероприятий в usedCodes УДАЛЕНА (Task 442)', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf('usedCodes[evCd] = true') === -1,
            'сбора usedCodes нет — перечня кодов больше нет');
        // код типа по-прежнему читается для ТЕКСТА строки списка
        assertTrue(b.indexOf('_trainingCodeOf(ev[\'тип\'])') !== -1,
            'код типа живёт в тексте мероприятий (список ниже таблицы)');
    });
});

// ============================================================
// 2. VM — хост печатного листа с настраиваемым видом
// ============================================================
// Сотрудники: 017 Иванов (сменный), 023 Петров (дневной) — как
// viewEmps передаётся срез, который вернул бы _viewEmployees
function sheetHost(opts) {
    opts = opts || {};
    return new Function('ProdCalendar', 'return ({' +
        methodText(WS_CLIENT, '_instrShortOf') + '\n' +
            methodText(WS_CLIENT, '_normInstrKey') + '\n' +
            methodText(WS_CLIENT, '_instrShortOf') + '\n' +
            methodText(WS_CLIENT, '_normInstrKey') + '\n' +
            methodText(WS_CLIENT, '_buildPrintHtml') + '\n' +
        '_year: 2026, _month: ' + (opts.month || 9) + ', ' +
        '_view: ' + JSON.stringify(opts.view || 'full') + ',' +
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
            { code: 'Д8', name: 'День 8-час', color: '#FFF9C4' },
            { code: 'И', name: 'Инструктаж', color: '#B3E5FC' },
            { code: 'ОБ', name: 'Обучение', color: '#D1C4E9' },
            { code: 'ПЗ', name: 'Проверка знаний', color: '#FFCDD2' }]) + ',' +
        '_calDayOff: function(day) { return day % 7 === 0 || day % 7 === 6; },' +
        '_vacationAt: function() { return null; },' +
        '_TRAININGS: ' + JSON.stringify(opts.trainings || []) + ',' +
        '_EMPLOYEES: ' + JSON.stringify(opts.employees || [
            { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' },
            { 'ФИО': 'Петров Пётр Петрович', 'таб_номер': '023' }]) + ',' +
        '_trainingCodeOf: function(t) { ' +
            'return t === "инструктаж" ? "И" : (t === "обучение" ? "ОБ" : ' +
            '(t === "проверка_знаний" ? "ПЗ" : (t === "прогул" ? "ПР" : ' +
            '(t === "примечание" ? "*" : "")))); },' +
        '_statusMeta: function(code) { ' +
            'var m = { "Д": { code: "Д", color: "#FFE082", name: "День (12-час)" }, ' +
            '"Н": { code: "Н", color: "#B0BEC5", name: "Ночь (12-час)" }, ' +
            '"Д8": { code: "Д8", color: "#FFF9C4", name: "День 8-час" }, ' +
            '"И": { code: "И", color: "#B3E5FC", name: "Инструктаж" }, ' +
            '"ОБ": { code: "ОБ", color: "#D1C4E9", name: "Обучение" }, ' +
            '"ПЗ": { code: "ПЗ", color: "#FFCDD2", name: "Проверка знаний" } }; ' +
            'return m[code] || null; },' +
        '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
        '_printCell: function(day, iso, emp, entry) { return "<td>[" + (entry ? entry.статус : "-") + "]</td>"; },' +
        '_esc: ' + mockEsc.toString() + ',' +
        '});')(opts.pcal);
}

var EMPS = [
    { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' },
    { 'ФИО': 'Петров Пётр Петрович', 'таб_номер': '023' }
];
var AGG = { byTab: {}, grand: null };

// записи «Инструктажей»: И у сменного 017 (07.09), ОБ и ПЗ у
// дневного 023 (02.09 и 15–16.09); ПЗ в СЕТКЕ отсутствует —
// ровно баг из заявки (наименование не печаталось)
var TRAININGS = [
    { 'таб_номер': '017', 'тип': 'инструктаж',
      'дата_начала': '2026-09-07', 'тема': 'Повторный инструктаж по охране труда' },
    { 'таб_номер': '023', 'тип': 'обучение',
      'дата_начала': '2026-09-02', 'тема': 'Обучение по новому оборудованию' },
    { 'таб_номер': '023', 'тип': 'проверка_знаний',
      'дата_начала': '2026-09-15', 'дата_окончания': '2026-09-16',
      'тема': 'Проверка знаний промбезопасности' }
];

function mevSection(html) {
    var i = html.indexOf('<div class="wsp-mev">');
    return html.slice(i, html.indexOf('</div>', i));
}

function legendSection(html) {
    var i = html.indexOf('<div class="wsp-legend">');
    return html.slice(i, html.indexOf('</div>', i));
}

// ============================================================
// 3. VM — список мероприятий: сменный/дневной/полный виды
// ============================================================
describe('Task 362 — VM: список мероприятий по виду табеля', () => {

    test('VM: сменный вид — только мероприятия сменного (017)', () => {
        var html = sheetHost({ view: 'shift', trainings: TRAININGS })
            ._buildPrintHtml([EMPS[0]], AGG);
        var sec = mevSection(html);
        assertTrue(sec.indexOf('Мероприятия · сентябрь 2026 · 1') !== -1,
            'счётчик отфильтрованного списка = 1');
        assertTrue(sec.indexOf('И · Повторный инструктаж по охране труда · Иванов Иван Иванович') !== -1,
            'мероприятие сменного сотрудника на месте');
        assertTrue(sec.indexOf('Петров') === -1,
            'дневной сотрудник в сменном виде НЕ печатается');
        assertTrue(sec.indexOf('Обучение по новому оборудованию') === -1 &&
                   sec.indexOf('Проверка знаний промбезопасности') === -1,
            'мероприятия дневного сотрудника НЕ печатаются');
        assertTrue(sec.indexOf('15–16.09') === -1, 'диапазон ПЗ не в сменном виде');
    });

    test('VM: дневной вид — только мероприятия дневного (023)', () => {
        var html = sheetHost({ view: 'day', trainings: TRAININGS })
            ._buildPrintHtml([EMPS[1]], AGG);
        var sec = mevSection(html);
        assertTrue(sec.indexOf('Мероприятия · сентябрь 2026 · 2') !== -1,
            'счётчик = 2 (ОБ + ПЗ дневного)');
        assertTrue(sec.indexOf('ОБ · Обучение по новому оборудованию · Петров Пётр Петрович') !== -1,
            'обучение дневного');
        assertTrue(sec.indexOf('ПЗ · Проверка знаний промбезопасности · Петров Пётр Петрович') !== -1,
            'проверка знаний дневного');
        assertTrue(sec.indexOf('Иванов') === -1,
            'сменный сотрудник в дневном виде НЕ печатается');
        assertTrue(sec.indexOf('Повторный инструктаж') === -1,
            'мероприятие сменного НЕ печатается');
        // вид в шапке листа — как всегда (Task 341)
        assertTrue(html.indexOf('вид табеля: дневной') !== -1,
            'шапка листа помечает вид (регресс 341)');
    });

    test('VM: полный вид — БЕЗ фильтра, все 3 записи (регресс 360)', () => {
        var html = sheetHost({ view: 'full', trainings: TRAININGS })
            ._buildPrintHtml(EMPS, AGG);
        var sec = mevSection(html);
        assertTrue(sec.indexOf('Мероприятия · сентябрь 2026 · 3') !== -1,
            'полный вид — счётчик = 3');
        assertTrue(sec.indexOf('Повторный инструктаж') !== -1 &&
                   sec.indexOf('Обучение по новому оборудованию') !== -1 &&
                   sec.indexOf('Проверка знаний промбезопасности') !== -1,
            'все записи месяца на месте (как окно «Мероприятия»)');
    });

    test('VM: смена вида не роняет заглушку пустого месяца', () => {
        var html = sheetHost({ view: 'day', trainings: TRAININGS })
            ._buildPrintHtml([EMPS[1]], AGG);
        var sec = mevSection(html);
        assertTrue(sec.indexOf('нет мероприятий в этом месяце') === -1,
            'у дневного есть записи — заглушки нет');
        var html2 = sheetHost({ view: 'day', trainings: [] })
            ._buildPrintHtml([EMPS[1]], AGG);
        var sec2 = mevSection(html2);
        assertTrue(sec2.indexOf('нет мероприятий в этом месяце') !== -1,
            'пустой список вида — заглушка жива (регресс 360)');
    });

    test('VM: событие чужого таб. номера (удалённый сотрудник) в виде — скрыто', () => {
        var trs = TRAININGS.concat([
            { 'таб_номер': '999', 'тип': 'инструктаж',
              'дата_начала': '2026-09-20', 'тема': 'Чужой' }]);
        var html = sheetHost({ view: 'shift', trainings: trs })
            ._buildPrintHtml([EMPS[0]], AGG);
        var sec = mevSection(html);
        assertTrue(sec.indexOf('таб. №999') === -1,
            'запись непечатаемого сотрудника в сменном виде НЕ попадает');
        assertTrue(sec.indexOf('Чужой') === -1, 'тема тоже скрыта');
        // полный вид — по-прежнему показывает (регресс 360)
        var htmlF = sheetHost({ view: 'full', trainings: trs })
            ._buildPrintHtml(EMPS, AGG);
        assertTrue(mevSection(htmlF).indexOf('таб. №999') !== -1,
            'полный вид — запись удалённого видна (фолбэк таб. номера)');
    });

    test('VM: месяц по-прежнему фильтруется (запись октября скрыта)', () => {
        var trs = [
            { 'таб_номер': '017', 'тип': 'инструктаж',
              'дата_начала': '2026-10-01', 'тема': 'Октябрь' }];
        var html = sheetHost({ view: 'shift', trainings: trs })
            ._buildPrintHtml([EMPS[0]], AGG);
        var sec = mevSection(html);
        assertTrue(sec.indexOf('Октябрь') === -1,
            'запись вне месяца НЕ попадает (регресс 360)');
        assertTrue(sec.indexOf('нет мероприятий в этом месяце') !== -1,
            'месяц пуст — заглушка');
    });
});

// ============================================================
// 4. VM — перечень кодов: коды мероприятий из списка месяца
// ============================================================
describe('Task 362 — VM: перечень кодов месяца', () => {

    // сетка: у сменного Д+Н, у дневного Д8; ПЗ в сетке НЕТ
    var ENTRIES = {
        '2026-09-02|017': { 'статус': 'Д' },
        '2026-09-03|017': { 'статус': 'Н' },
        '2026-09-10|023': { 'статус': 'Д8' }
    };

    test('VM: перечень кодов месяца УДАЛЁН (Task 442)', () => {
        // прежде: коды мероприятий/сетки попадали в перечень;
        // теперь перечня нет вовсе — при любых записях
        var html = sheetHost({ view: 'day', trainings: TRAININGS, entries: ENTRIES })
            ._buildPrintHtml([EMPS[1]], AGG);
        assertTrue(html.indexOf('wsp-legend') === -1,
            'легенды кодов нет (Task 442: столбец удалён)');
        assertTrue(html.indexOf('ПЗ — Проверка знаний') === -1,
            'расшифровки ПЗ нет');
        assertTrue(html.indexOf('Д8 — День 8-час') === -1,
            'расшифровки Д8 нет');
        // список мероприятий при этом жив и несёт коди в тексте
        var sec = mevSection(html);
        assertTrue(sec.indexOf('ПЗ · Проверка знаний промбезопасности') !== -1,
            'мероприятие ПЗ — в списке под таблицей');
    });

    test('VM: сменный вид — легенды нет, мероприятия живы (Task 442)', () => {
        var html = sheetHost({ view: 'shift', trainings: TRAININGS, entries: ENTRIES })
            ._buildPrintHtml([EMPS[0]], AGG);
        assertTrue(html.indexOf('wsp-legend') === -1, 'легенды нет');
        var sec = mevSection(html);
        assertTrue(sec.indexOf('И · Повторный инструктаж') !== -1,
            'мероприятие сменного на месте');
    });

    test('VM: полный вид — легенды нет (Task 442)', () => {
        var html = sheetHost({ view: 'full', trainings: TRAININGS, entries: ENTRIES })
            ._buildPrintHtml(EMPS, AGG);
        assertTrue(html.indexOf('wsp-legend') === -1,
            'полный вид: перечня кодов тоже нет');
        assertTrue(html.indexOf('Коды:') === -1, 'заголовка нет');
    });

    test('VM: неизвестный тип мероприятия — строка без кода (Task 442)', () => {
        var trs = [
            { 'таб_номер': '023', 'тип': 'иное',
              'дата_начала': '2026-09-12', 'тема': 'Встреча' }];
        var html = sheetHost({ view: 'day', trainings: trs, entries: ENTRIES })
            ._buildPrintHtml([EMPS[1]], AGG);
        var sec = mevSection(html);
        assertTrue(sec.indexOf('Встреча · Петров Пётр Петрович') !== -1,
            'строка без кода печатается (тема · ФИО)');
        assertTrue(html.indexOf('wsp-legend') === -1,
            'легенды нет — «добавлять» код некуда (Task 442)');
    });

    test('VM: статус-мероприятие сетки — пустая ячейка без бейджа (Task 442)', () => {
        // запись сетки И у дневного БЕЗ строки в «Инструктажах» —
        // ячейка пустая: ни кода, ни значка (Task 442)
        var entries = { '2026-09-10|023': { 'статус': 'ПЗ' } };
        var html = sheetHost({ view: 'day', trainings: [], entries: entries })
            ._buildPrintHtml([EMPS[1]], AGG);
        assertTrue(html.indexOf('wsp-ev') === -1,
            'бейджей в печати нет (Task 442)');
        assertTrue(html.indexOf('wsp-legend') === -1,
            'перечня кодов нет');
    });
});

// ============================================================
// 5. VM — регресс: прежние фичи печати живы
// ============================================================
describe('Task 362 — VM: регресс прежних фич печати', () => {

    test('VM: шапка/таблица/секции/сноска — всё на месте (сменный вид)', () => {
        var html = sheetHost({ view: 'shift', trainings: TRAININGS })
            ._buildPrintHtml([EMPS[0]], AGG);
        assertTrue(html.indexOf('<div class="wsp-title">График работы</div>') !== -1,
            'заголовок листа (Task 341/438)');
        assertTrue(html.indexOf('вид табеля: сменный') !== -1,
            'шапка помечает вид (Task 341)');
        assertTrue(html.indexOf('<table class="wsp-grid">') !== -1, 'таблица');
        assertTrue(html.indexOf('<div class="wsp-mev">') !== -1,
            'секция мероприятий (Task 360)');
        assertTrue(html.indexOf('<div class="wsp-legend">') === -1,
            'перечня кодов НЕТ (Task 442)');
        assertTrue(html.indexOf('wsp-sum') === -1, 'итоговой строки нет (Task 343)');
        assertTrue(html.indexOf('wsp-foot') === -1,
            'сноски нет (Task 438)');
    });

    test('VM: структура строки мероприятия не изменилась (дата/точка/текст)', () => {
        var html = sheetHost({ view: 'shift', trainings: TRAININGS })
            ._buildPrintHtml([EMPS[0]], AGG);
        var sec = mevSection(html);
        assertTrue(sec.indexOf('<b class="wsp-mev-date">07.09</b>') !== -1,
            'дата записи (Task 360)');
        assertTrue(sec.indexOf('background:#B3E5FC') !== -1,
            'точка цвета кода И (Task 360)');
        assertTrue(sec.indexOf('<span class="wsp-mev-text">') !== -1,
            'текст строки (Task 360)');
    });
});

// ============================================================
// 6. Service Worker
// ============================================================
describe('Task 362 — Service Worker', () => {

    test('SW: кэш поднят до kipia-test-v759', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v759'") !== -1,
            'CACHE_VERSION = kipia-test-v759 (Task 362 — фронтенд)');
        assertFalse(SW_SRC.indexOf('kipia-test-v760') !== -1,
            'v605 ещё не существует (лишний инкремент)');
    });

    test('SW: в index.html нет захардкоженной версии кэша', () => {
        assertFalse(INDEX_SRC.indexOf('kipia-test-v59') !== -1,
            'клиент не знает номер кэша (версией управляет sw.js)');
    });
});
