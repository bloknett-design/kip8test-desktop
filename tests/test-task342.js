// tests/test-task342.js
// Task 342 — заявка пользователя: «добавь колонку переработок»
// (к печатной форме графика работ — Task 341). Колонка «Перераб.»
// в печатной шахматке: ДНИ/ЧАСЫ переработки кодов д/н («д»/«н» —
// работа в выходные/праздники; _totalsAgg: over/overDays — те же
// счётчики, что во вкладке «Итоги учёта»):
//   • формат значения — «дни/часы» («3/36» — 3 дня, 36 часов),
//     как годовая вкладка «Итогов»; часы с запятой — _fmtTotalsNum;
//   • нулевая переработка — «—»; сотрудника нет в agg — пусто;
//   • шапка — двухстрочный заголовок «Перераб./дни-ч» (класс
//     wsp-tot-over, ширина 12mm — чуть шире «Дни»/«Часы»);
//   • сноска wsp-foot поясняет формат (раньше писала «переработка
//     учтена в приложении» — теперь колонка прямо в листе).
// Task 343 (заявка: «из печати убери строку итогов»): итоговая
// строка «Итого» (grand) УБРАНА из печати — grand-тесты 342
// удалены, колонка «Перераб.» остаётся в построчных итогах.
// Счётчики переработки УЖЕ были в agg (Task 322) — новая только
// печатная колонка; сетка/«Итоги учёта» на экране не менялись.
//
// SW: kipia-test-v738.
//
// Запуск: через tests/run-all.js (require './test-task342.js').

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

// Простейший эскейп для моков (поведение = WorkSchedule._esc)
function mockEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// 1. SRC — CSS и разметка колонки
// ============================================================
describe('Task 342 — CSS колонки «Перераб.»', () => {

    test('SRC: правило .wsp-tot-over (ширина 12mm, Task 438)', () => {
        const i = INDEX_SRC.indexOf('#wsPrintSheet .wsp-tot.wsp-tot-over');
        assertTrue(i !== -1, 'правило ширины wsp-tot-over есть');
        const block = INDEX_SRC.slice(i, i + 200);
        assertTrue(block.indexOf('width: 12mm') !== -1,
            'ширина 12mm (Task 438: в колонке только дни, было 14mm)');
    });

    test('SRC: подпись заголовка «дни» — мелкий блок, как дни недели', () => {
        const i = INDEX_SRC.indexOf('#wsPrintSheet .wsp-tot-over span');
        assertTrue(i !== -1, 'стиль подписи есть');
        const block = INDEX_SRC.slice(i, i + 200);
        assertTrue(block.indexOf('display: block') !== -1 &&
                   block.indexOf('font-size: 7.5px') !== -1,
            'блочная подпись 7.5px (Task 361; как wsp-day span)');
    });

    test('SRC: базовая колонка «Дни» не тронута (10mm, Task 361)', () => {
        assertTrue(INDEX_SRC.indexOf(
            '#wsPrintSheet .wsp-tot { width: 10mm; font-weight: 700; }') !== -1,
            'wsp-tot 10mm на месте (Task 361: 9→10mm под шрифт 11px)');
    });
});

describe('Task 342 — разметка _buildPrintHtml (SRC)', () => {

    test('SRC: шапка — 2 колонки итогов, «Перераб.» с подписью «дни»', () => {
        const b = methodText(WS_CLIENT, '_buildPrintHtml');
        assertTrue(b.indexOf('<th class="wsp-tot">Дни</th>') !== -1, 'Дни');
        assertTrue(b.indexOf('<th class="wsp-tot">Часы</th>') === -1,
            'Часы удалены (Task 438)');
        assertTrue(b.indexOf('wsp-tot-over">Перераб.<span>дни</span></th>') !== -1,
            '«Перераб.» + подпись «дни» (Task 438)');
    });

    test('SRC: строка сотрудника — ячейка wsp-tot-over из agg (только дни)', () => {
        const b = methodText(WS_CLIENT, '_buildPrintHtml');
        const i = b.indexOf("'<td class=\"wsp-tot wsp-tot-over\">'");
        assertTrue(i !== -1, 'ячейка колонки в строках');
        const tail = b.slice(i, i + 300);
        assertTrue(tail.indexOf('a.overDays') !== -1,
            'значение — дни переработки (overDays, Task 438)');
        assertTrue(tail.indexOf("a.overDays + '/'") === -1,
            'склейка «дни/часы» удалена (Task 438)');
        assertTrue(tail.indexOf('_fmtTotalsNum') === -1,
            'форматирование часов не используется (Task 438)');
    });

    test('SRC: сноски wsp-foot больше нет (Task 438)', () => {
        const b = methodText(WS_CLIENT, '_buildPrintHtml');
        assertFalse(b.indexOf('<div class="wsp-foot">') !== -1,
            'сноска удалена целиком (Task 438)');
        assertFalse(b.indexOf('«Перераб.» — дни/часы переработки') !== -1,
            'пояснение формата вместе со сноской убрано');
        assertFalse(b.indexOf('учтена в приложении («Итоги учёта»') !== -1,
            'старая отсылка удалена');
    });
});

// ============================================================
// 2. VM — _buildPrintHtml: значения колонки
// ============================================================
describe('Task 342 — _buildPrintHtml (VM): значения «Перераб.»', () => {

    function sheetHost(opts) {
        opts = opts || {};
        return new Function('ProdCalendar', 'return ({' +
            methodText(WS_CLIENT, '_buildPrintHtml') + '\n' +
            '_year: 2026, _month: 9, _view: ' + JSON.stringify(opts.view || 'full') + ',' +
            '_isoDate: function(dt) { return dt.getFullYear() + "-" + ' +
                '(dt.getMonth() < 9 ? "0" : "") + (dt.getMonth() + 1) + "-" + ' +
                '(dt.getDate() < 10 ? "0" : "") + dt.getDate(); },' +
            '_buildEntryIndex: function() { return ' + JSON.stringify(opts.entries || {}) + '; },' +
            '_PENDING: ' + JSON.stringify(opts.pending || {}) + ',' +
            '_empTipLine: function() { return "смена №1"; },' +
            '_fmtTotalsNum: function(v) { return String(Math.round((v || 0) * 10) / 10).replace(".", ","); },' +
            '_STATUS_CODES: ' + JSON.stringify(opts.codes || [
                { code: 'Д', name: 'День (12-час)', color: '#FFE082' },
                { code: 'д', name: 'Переработка (день)', color: '#FFCCBC' }]) + ',' +
            '_calDayOff: function(day) { return day % 7 === 0 || day % 7 === 6; },' +
            '_vacationAt: function() { return null; },' +
            '_eventsAt: function() { return []; },' +
            '_statusMeta: function(code) { return { code: code, color: "#FFE082" }; },' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '_printCell: function(day, iso, emp, entry) { return "<td>[" + (entry ? entry.статус : "-") + "]</td>"; },' +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')(opts.pcal);
    }

    var EMPS = [
        { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' },
        { 'ФИО': 'Сидоров Сидор Сидорович', 'таб_номер': '031' },
        { 'ФИО': 'Новый Н. Н.', 'таб_номер': '999' }
    ];

    test('VM: переработка — только дни («3»)', () => {
        var agg = {
            byTab: { '017': { work: 21, hours: 151.2, over: 36, overDays: 3 },
                     '031': { work: 19, hours: 136.8, over: 0, overDays: 0 } },
            grand: { work: 40, hours: 288, over: 36, overDays: 3 }
        };
        var html = sheetHost()._buildPrintHtml(EMPS, agg);
        assertTrue(html.indexOf('<td class="wsp-tot wsp-tot-over">3</td>') !== -1,
            'значение «3» — только дни (Task 438)');
        assertTrue(html.indexOf('<td class="wsp-tot wsp-tot-over">3/36</td>') === -1,
            'старый формат «3/36» не печатается');
    });

    test('VM: переработка без часов — целые дни («2»)', () => {
        var agg = {
            byTab: { '017': { work: 21, hours: 151.2, over: 16.5, overDays: 2 } },
            grand: { work: 21, hours: 151.2, over: 16.5, overDays: 2 }
        };
        var html = sheetHost()._buildPrintHtml([EMPS[0]], agg);
        assertTrue(html.indexOf('<td class="wsp-tot wsp-tot-over">2</td>') !== -1,
            'значение «2» — дни; часы (16,5) не печатаются (Task 438)');
    });

    test('VM: нулевая переработка — «—» (как годовая вкладка)', () => {
        var agg = {
            byTab: { '031': { work: 19, hours: 136.8, over: 0, overDays: 0 } },
            grand: { work: 19, hours: 136.8, over: 0, overDays: 0 }
        };
        var html = sheetHost()._buildPrintHtml([EMPS[1]], agg);
        assertTrue(html.indexOf('<td class="wsp-tot wsp-tot-over">—</td>') !== -1,
            'ноль — прочерк');
    });

    test('VM: agg БЕЗ полей over/overDays (старый мок) — «—», не падает', () => {
        var agg = { byTab: { '017': { work: 21, hours: 151.2 } },
                    grand: { work: 21, hours: 151.2 } };
        var html = sheetHost()._buildPrintHtml([EMPS[0]], agg);
        assertTrue(html.indexOf('<td class="wsp-tot wsp-tot-over">—</td>') !== -1,
            'undefined overDays → «—»');
    });

    test('VM: сотрудника нет в agg — ПУСТАЯ ячейка (как «Дни»/«Часы»)', () => {
        var agg = { byTab: {}, grand: null };
        var html = sheetHost()._buildPrintHtml([EMPS[2]], agg);
        assertTrue(html.indexOf('<td class="wsp-tot wsp-tot-over"></td>') !== -1,
            'пустая ячейка без прочерка');
    });

    test('VM: сноски wsp-foot нет (Task 438)', () => {
        var agg = { byTab: {}, grand: null };
        var html = sheetHost()._buildPrintHtml([EMPS[2]], agg);
        assertTrue(html.indexOf('wsp-foot') === -1,
            'сноска внизу листа удалена (Task 438)');
    });
});

// ============================================================
// 3. Service Worker
// ============================================================
describe('Task 342 — Service Worker', () => {

    test('SW: кэш поднят до kipia-test-v738', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v738'") !== -1,
            'CACHE_VERSION = kipia-test-v738 (Task 342 — фронтенд)');
        assertFalse(SW_SRC.indexOf('kipia-test-v739') !== -1,
            'лишний инкремент (v581) не сделан');
    });

    test('SW: в index.html нет захардкоженной версии кэша', () => {
        assertFalse(INDEX_SRC.indexOf('kipia-test-v738') !== -1,
            'клиент не знает номер кэша (версией управляет sw.js)');
    });
});
