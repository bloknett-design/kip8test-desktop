// tests/test-task364.js
// Task 364 — заявка пользователя: «Красные линии вокруг ГРУППЫ
// ячеек выходных сделай 2px и по меньше яркости. Коды под
// графиком на печати размести в столбик справа от столбика
// мероприятий»:
//   • РАМКА-ГРУППА выходных (Task 363): 3px #e53935 → 2px #e57373
//     — та же рамка вокруг столбцов группы (верх-тень/бока/низ),
//     тоньше и бледнее; кнопка увольнения .ws-dismiss-submit
//     (#e53935) НЕ тронута;
//   • ПЕЧАТЬ: мероприятия и коды — ДВЕ КОЛОНКИ одного ряда под
//     таблицей (обёртка .wsp-bottom, flex: мероприятия слева,
//     коды справа, max-width 44%), сноска wsp-foot — ниже
//     обёртки на всю ширину; каждая запись/код — отдельной
//     строкой своего столбика (как в Task 360).
//
// SW: kipia-test-v753.
//
// Запуск: через tests/run-all.js (require './test-task364.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

const WS_START = INDEX_SRC.indexOf('var WorkSchedule = {');
const WS_CLIENT = INDEX_SRC.slice(WS_START, WS_START + 520000);

function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
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

function cssRule(src, selector) {
    const i = src.indexOf(selector + ' {');
    if (i === -1) return '';
    return src.slice(i, src.indexOf('}', i) + 1);
}

// ============================================================
// 1. SRC — рамка-группа 2px #e57373 (Task 364)
// ============================================================
describe('Task 364 — SRC: рамка выходных 2px #e57373', () => {

    function wgrpBlock() {
        const i = INDEX_SRC.indexOf('.ws-grid thead th.ws-day-col.ws-wgrp {');
        const j = INDEX_SRC.indexOf('/* === Task 260', i);
        return INDEX_SRC.slice(i, j);
    }

    test('SRC: в правилах wgrp нет 3px и яркого #e53935', () => {
        const b = wgrpBlock();
        assertEqual(b.indexOf('3px'), -1, 'толщина 3px убрана из рамки');
        assertEqual(b.indexOf('#e53935'), -1, 'яркий красный убран из рамки');
        assertTrue(b.indexOf('2px') !== -1, 'толщина 2px в правилах');
        assertTrue(b.indexOf('#e57373') !== -1, 'спокойный красный #e57373');
    });

    test('SRC: все 6 линий рамки — 2px #e57373', () => {
        const b = wgrpBlock();
        assertEqual(b.split('2px solid #e57373').length - 1, 5,
            '5 сплошных границ (бока th/td + низ) по 2px #e57373');
        assertTrue(b.indexOf('inset 0 2px 0 0 #e57373') !== -1,
            'верх — внутренняя тень 2px #e57373');
    });

    test('SRC: кнопка увольнения .ws-dismiss-submit сохраняет #e53935', () => {
        const r = cssRule(INDEX_SRC, '.ws-dismiss-submit');
        assertTrue(r.indexOf('#e53935') !== -1,
            'кнопка увольнения НЕ перекрашена (регресс)');
    });
});

// ============================================================
// 2. SRC — печать: обёртка wsp-bottom (коды справа)
// ============================================================
describe('Task 364 — SRC: wsp-bottom на печати', () => {

    test('SRC: CSS .wsp-bottom — РЯД: мероприятия слева, коды справа (Task 439)', () => {
        const r = cssRule(INDEX_SRC, '#wsPrintSheet .wsp-bottom');
        assertTrue(r !== '', 'правило обёртки есть');
        // Task 442: ряд Task 439/440 снят — блока кодов справа
        // больше нет; обёртка — простой блок с отступом от таблицы
        assertTrue(r.indexOf('display: flex') === -1,
            'flex-ряда НЕТ (Task 442: кодов справа больше нет)');
        assertTrue(r.indexOf('gap') === -1,
            'зазора между блоками нет (снят с рядом)');
        assertTrue(r.indexOf('flow-root') === -1,
            'флоат-обёртки Task 432 не вернулась');
        assertTrue(r.indexOf('margin-top: 2.5mm') !== -1,
            'отступ от таблицы на обёртке жив');
    });

    test('SRC: CSS .wsp-mev — НЕ ограничен, вся ширина (Task 442)', () => {
        const r = cssRule(INDEX_SRC, '#wsPrintSheet .wsp-mev');
        // Task 442: кодов справа нет — столбик мероприятий занимает
        // всю ширину листа (ограничения зоны Tasks 439/440 сняты)
        assertTrue(r.indexOf('flex:') === -1,
            'flex-ограничений нет (кодов справа больше нет)');
        assertTrue(r.indexOf('min-width') === -1,
            'усадка зоны снята');
        assertTrue(r.indexOf('margin-top: 0') !== -1,
            'личный отступ сверху снят (отступ — на обёртке)');
        assertTrue(r.indexOf('font-size: 11px') !== -1,
            'шрифт Task 361 (11px) сохранён');
    });

    test('SRC: CSS .wsp-legend — правило УДАЛЕНО (Task 442)', () => {
        const r = cssRule(INDEX_SRC, '#wsPrintSheet .wsp-legend');
        assertTrue(r === '',
            'правила .wsp-legend нет — блок кодов удалён (Task 442)');
    });

    test('SRC: JS — обёртка содержит только мероприятия (Task 442)', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        const iOpen = b.indexOf('<div class="wsp-bottom">');
        const iMev = b.indexOf('<div class="wsp-mev">');
        const iFoot = b.indexOf('<div class="wsp-foot">');
        assertTrue(iOpen !== -1, 'обёртка wsp-bottom строится');
        assertTrue(iOpen < iMev, 'открытие обёртки до мероприятий');
        assertTrue(b.indexOf('wsp-legend') === -1,
            'секции кодов нет (Task 442)');
        assertTrue(iFoot === -1, 'сноски нет (Task 438)');
    });

    test('SRC: JS — закрытие обёртки ПОСЛЕ мероприятий (Task 442)', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        const iMev = b.indexOf('<div class="wsp-mev">');
        // Task 442: секция одна — после её закрытия обёртка
        // закрывается тем же оператором ряда
        const iClose1 = b.indexOf("html += '</div>';", iMev);
        assertTrue(iClose1 !== -1, 'закрытие после мероприятий есть');
        assertTrue(iClose1 > iMev, 'закрытие после секции');
    });
});

// ============================================================
// 3. VM — печатный лист: структура ряда мероприятий|кодов
// ============================================================
// Хост из Task 362 (вид + «Инструктажи»), проверяем только
// структуру обёртки
function sheetHost(opts) {
    opts = opts || {};
    return new Function('ProdCalendar', 'return ({' +
        methodText(WS_CLIENT, '_instrShortOf') + '\n' +
            methodText(WS_CLIENT, '_normInstrKey') + '\n' +
            methodText(WS_CLIENT, '_instrShortOf') + '\n' +
            methodText(WS_CLIENT, '_normInstrKey') + '\n' +
            methodText(WS_CLIENT, '_buildPrintHtml') + '\n' +
        '_year: 2026, _month: 9, ' +
        '_view: ' + JSON.stringify(opts.view || 'full') + ',' +
        '_isoDate: function(dt) { return dt.getFullYear() + "-" + ' +
            '(dt.getMonth() < 9 ? "0" : "") + (dt.getMonth() + 1) + "-" + ' +
            '(dt.getDate() < 10 ? "0" : "") + dt.getDate(); },' +
        '_buildEntryIndex: function() { return ' + JSON.stringify(opts.entries || {}) + '; },' +
        '_PENDING: {},' +
        '_empTipLine: function() { return "смена №1"; },' +
        '_fmtTotalsNum: function(v) { return String(Math.round((v || 0) * 10) / 10).replace(".", ","); },' +
        '_STATUS_CODES: ' + JSON.stringify([
            { code: 'Д', name: 'День (12-час)', color: '#FFE082' },
            { code: 'И', name: 'Инструктаж', color: '#B3E5FC' },
            { code: 'ПЗ', name: 'Проверка знаний', color: '#FFCDD2' }]) + ',' +
        '_calDayOff: function(day) { return day % 7 === 0 || day % 7 === 6; },' +
        '_vacationAt: function() { return null; },' +
        '_TRAININGS: ' + JSON.stringify(opts.trainings || [
            { 'таб_номер': '017', 'тип': 'инструктаж',
              'дата_начала': '2026-09-07', 'тема': 'Повторный инструктаж' },
            { 'таб_номер': '023', 'тип': 'проверка_знаний',
              'дата_начала': '2026-09-15', 'дата_окончания': '2026-09-16',
              'тема': 'Проверка знаний промбезопасности' }]) + ',' +
        '_EMPLOYEES: ' + JSON.stringify([
            { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' },
            { 'ФИО': 'Петров Пётр Петрович', 'таб_номер': '023' }]) + ',' +
        '_trainingCodeOf: function(t) { ' +
            'return t === "инструктаж" ? "И" : (t === "проверка_знаний" ? "ПЗ" : ""); },' +
        '_statusMeta: function(code) { ' +
            'var m = { "Д": { code: "Д", color: "#FFE082", name: "День (12-час)" }, ' +
            '"И": { code: "И", color: "#B3E5FC", name: "Инструктаж" }, ' +
            '"ПЗ": { code: "ПЗ", color: "#FFCDD2", name: "Проверка знаний" } }; ' +
            'return m[code] || null; },' +
        '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
        '_printCell: function() { return "<td></td>"; },' +
        '_esc: ' + mockEsc.toString() + ',' +
        '});')();
}

var EMPS = [
    { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' },
    { 'ФИО': 'Петров Пётр Петрович', 'таб_номер': '023' }
];
var AGG = { byTab: {}, grand: null };

describe('Task 364 — VM: ряд мероприятий|кодов в печати', () => {

    test('VM: обёртка содержит только мероприятия (Task 442)', () => {
        var html = sheetHost()._buildPrintHtml(EMPS, AGG);
        var iOpen = html.indexOf('<div class="wsp-bottom">');
        var iMev = html.indexOf('<div class="wsp-mev">');
        var iClose = html.indexOf('</div></div>', iOpen);
        var iFoot = html.indexOf('<div class="wsp-foot">');
        assertTrue(iOpen !== -1, 'обёртка wsp-bottom в листе');
        assertTrue(iOpen < iMev, 'мероприятия внутри обёртки');
        assertTrue(iClose !== -1 && iClose > iMev, 'обёртка закрыта после мероприятий');
        assertTrue(html.indexOf('wsp-legend') === -1,
            'секции кодов НЕТ (Task 442)');
        assertTrue(iFoot === -1, 'сноски нет (Task 438)');
    });

    test('VM: регресс 362 — ПЗ в списке мероприятий (без перечня)', () => {
        var html = sheetHost({ view: 'day' })._buildPrintHtml([EMPS[1]], AGG);
        var iOpen = html.indexOf('<div class="wsp-bottom">');
        var iClose = html.indexOf('</div></div>', iOpen);
        var row = html.slice(iOpen, iClose);
        assertTrue(row.indexOf('ПЗ · Проверка знаний промбезопасности') !== -1,
            'мероприятие ПЗ — в списке (без расшифровки-перечня)');
        assertTrue(row.indexOf('Мероприятия · сентябрь 2026 · 1') !== -1,
            'заголовок мероприятий (вид: дневной)');
    });

    test('VM: пустой месяц — заглушка, кодов нет (Task 442)', () => {
        var html = sheetHost({ trainings: [] })._buildPrintHtml(EMPS, AGG);
        var iOpen = html.indexOf('<div class="wsp-bottom">');
        var iClose = html.indexOf('</div></div>', iOpen);
        var row = html.slice(iOpen, iClose);
        assertTrue(row.indexOf('нет мероприятий в этом месяце') !== -1,
            'заглушка мероприятий на месте');
        assertTrue(row.indexOf('Коды:') === -1, 'заголовка кодов нет (Task 442)');
    });
});

// ============================================================
// 4. SW — версия кеша
// ============================================================
describe('Task 364 — SW: версия кеша', () => {
    test('SW: CACHE_VERSION = kipia-test-v753', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v753'") !== -1,
            'SW поднят до v659 (рамка 2px + коды строкой под мероприятиями — Task 433)');
    });
});
