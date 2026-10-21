// tests/test-task341.js
// Task 341 — заявка пользователя: «нужно реализовать функцию печати
// графика работ». Кнопка «Печать» (ряд 1 тулбара, доступна всем
// уровням доступа — фича ПРОСМОТРА) строит печатный лист
// #wsPrintSheet в <body> (шапка с нормой месяца, шахматка
// эффективных записей с цветами кодов, план отпуска пунктиром,
// переработка точкой, колонки «Дни»/«Часы» — те же счётчики, что
// во вкладке «Итоги учёта», и легенда кодов) и вызывает
// window.print(). Task 343 (заявка: «из печати убери строку итогов
// и миниатюры иконок мероприятий»): итоговая строка УБРАНА
// (бейджи тогда тоже). Task 361 (заявка: «сделай отображение
// на печати значков мероприятий в ячейках шахматки»):
// бейджи мероприятий ВЕРНУТЫ в печать — тесты адаптированы
// (см. test-task343.js / test-task361.js).
//
// Печатная вёрстка — @media print (A4 АЛЬБОМНАЯ, всё приложение
// скрыто через body > *:not(#wsPrintSheet), лист всегда СВЕТЛЫЙ —
// независим от тёмной темы; фон статусных ячеек печатается
// принудительно print-color-adjust: exact). На экране лист
// display:none. Печатается ТЕКУЩИЙ вид табеля (у уровня min
// «Мастер КИПиА» скрыт — _viewEmployees, Task 340).
//
// SW: kipia-test-v754.
//
// Запуск: через tests/run-all.js (require './test-task341.js').

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
// 1. Кнопка «Печать» — HTML тулбара
// ============================================================
describe('Task 341 — кнопка «Печать» в тулбаре', () => {

    test('SRC: кнопка #wsPrintBtn существует с onclick=printGrid', () => {
        const i = INDEX_SRC.indexOf('id="wsPrintBtn"');
        assertTrue(i !== -1, 'кнопка в разметке');
        const around = INDEX_SRC.slice(i - 400, i + 700);
        assertTrue(around.indexOf('WorkSchedule.printGrid()') !== -1,
            'onclick вызывает WorkSchedule.printGrid');
        assertTrue(around.indexOf('>Печать</button>') !== -1,
            'подпись кнопки — «Печать»');
        assertTrue(around.indexOf('ws-print-btn') !== -1,
            'класс ws-print-btn');
    });

    test('SRC: кнопка в ряду 1 (селекты + «Обновить»), до ряда итогов', () => {
        const row1 = INDEX_SRC.indexOf('id="wsSelectsRow"');
        const print = INDEX_SRC.indexOf('id="wsPrintBtn"');
        const refresh = INDEX_SRC.indexOf('id="wsRefreshBtn"');
        const totals = INDEX_SRC.indexOf('id="wsTotalsRow"');
        assertTrue(row1 !== -1 && refresh !== -1 && totals !== -1,
            'якоря рядов на месте');
        assertTrue(print > row1 && print < totals,
            'кнопка внутри ряда 1 (между wsSelectsRow и wsTotalsRow)');
        assertTrue(print > refresh, 'после «Обновить»');
    });

    test('SRC: init() скрывает кнопку только при полном отсутствии прав', () => {
        const init = methodText(WS_CLIENT, 'init');
        const i = init.indexOf("getElementById('wsPrintBtn')");
        assertTrue(i !== -1, 'init знает кнопку');
        const tail = init.slice(i, i + 300);
        assertTrue(tail.indexOf('hidden = (this._viewLevel === null)') !== -1,
            'видна всем уровням (edit/view/min), скрыта только при null');
    });

    test('SRC: _onRoleUpdate обновляет кнопку (heartbeat/смена роли)', () => {
        const upd = methodText(WS_CLIENT, '_onRoleUpdate');
        const i = upd.indexOf("getElementById('wsPrintBtn')");
        assertTrue(i !== -1, '_onRoleUpdate знает кнопку');
        const tail = upd.slice(i, i + 300);
        assertTrue(tail.indexOf('hidden = (newLevel === null)') !== -1,
            'скрыта только при null-уровне');
    });
});

// ============================================================
// 2. Печатный CSS — @media print
// ============================================================
describe('Task 341 — печатный CSS', () => {

    test('SRC: #wsPrintSheet скрыт на экране', () => {
        assertTrue(INDEX_SRC.indexOf('#wsPrintSheet { display: none; }') !== -1,
            'экран: display:none');
    });

    test('SRC: @page A4 альбомная', () => {
        const i = INDEX_SRC.indexOf('@media print');
        assertTrue(i !== -1, 'блок @media print есть');
        const block = INDEX_SRC.slice(i, i + 6000);
        assertTrue(block.indexOf('size: A4 landscape') !== -1,
            'A4 landscape');
        assertTrue(block.indexOf('margin: 8mm') !== -1, 'поля 8mm');
    });

    test('SRC: приложение целиком скрыто, показан только лист', () => {
        const i = INDEX_SRC.indexOf('@media print');
        const block = INDEX_SRC.slice(i, i + 6000);
        assertTrue(block.indexOf('body > *:not(#wsPrintSheet) { display: none !important; }') !== -1,
            'body > *:not(#wsPrintSheet) скрыт');
        assertTrue(block.indexOf('#wsPrintSheet') !== -1 &&
                   block.indexOf('display: block !important') !== -1,
            'лист показан');
    });

    test('SRC: фон статусных ячеек печатается принудительно', () => {
        const i = INDEX_SRC.indexOf('@media print');
        const block = INDEX_SRC.slice(i, i + 6000);
        assertTrue(block.indexOf('print-color-adjust: exact') !== -1,
            'print-color-adjust: exact');
    });

    test('SRC: длинные списки — повтор шапки, строки не рвутся', () => {
        const i = INDEX_SRC.indexOf('@media print');
        const block = INDEX_SRC.slice(i, i + 6000);
        assertTrue(block.indexOf('table-header-group') !== -1,
            'thead повторяется на каждой странице');
        assertTrue(block.indexOf('page-break-inside: avoid') !== -1,
            'строки не рвутся посередине');
    });

    test('SRC: вёрстка листа НЕ зависит от темы приложения', () => {
        const i = INDEX_SRC.indexOf('@media print');
        const block = INDEX_SRC.slice(i, i + 6000);
        // светлые цвета заданы явно (не через var(--...) тем)
        assertTrue(block.indexOf('color: #1b1f24') !== -1,
            'тёмный текст на белом');
        assertFalse(block.indexOf('var(--bg') !== -1,
            'нет переменных тёмной темы в печатных стилях');
    });
});

// ============================================================
// 3. printGrid — VM (моки document/window/KipToast)
// ============================================================
describe('Task 341 — printGrid (VM)', () => {

    function makeDoc() {
        const elements = {};
        const created = [];
        return {
            elements: elements, created: created,
            getElementById: function(id) { return elements[id] || null; },
            createElement: function(tag) {
                const el = { tag: tag, id: '', innerHTML: '',
                             children: [], parentNode: { appendChild: function(c) { el.children.push(c); } } };
                created.push(el);
                return el;
            },
            body: { appendChild: function(el) { elements[el.id] = el; } }
        };
    }

    function hostOf(doc, opts) {
        // хост-объект: printGrid + зависимости (моки/переопределения).
        // Task 430: «Печать» открывает ДИАЛОГ ПРЕДПРОСМОТРА —
        // _openPrintPreview мок-шпион (прямой window.print из
        // printGrid остался только фолбэком без диалога — Task 430)
        const prev = { calls: 0, html: null };
        const win = { printCalls: 0, print: function() { win.printCalls++; } };
        const host = new Function('KipToast', 'window', 'document', 'return ({' +
            methodText(WS_CLIENT, 'printGrid') + '\n' +
            '_viewLevel: ' + JSON.stringify(opts.level) + ',' +
            '_EMPLOYEES: ' + JSON.stringify(opts.employees || []) + ',' +
            '_buildPrintHtml: function(v, a) { return "SHEET_HTML_MARKER"; },' +
            '_viewEmployees: function() { return ' + JSON.stringify(opts.viewEmps || []) + '; },' +
            '_totalsAgg: function() { return ' + JSON.stringify(opts.agg || { byTab: {}, grand: null }) + '; },' +
            '_totalsEffectiveEntries: function() { return []; },' +
            '_empTypeMap: function() { return {}; },' +
            '});')(opts.toast, win, doc);
        // шпион предпросмотра — снаружи new Function (замыкание живо)
        host._openPrintPreview = function(h) {
            prev.calls++;
            prev.html = h;
            return true;
        };
        return { host: host, win: win, prev: prev };
    }

    test('VM: без прав (null) — печати нет, лист не создаётся', () => {
        const doc = makeDoc();
        const r = hostOf(doc, { level: null, employees: [{}], viewEmps: [{}] });
        r.host.printGrid();
        assertEqual(r.win.printCalls, 0, 'window.print не вызван');
        assertEqual(doc.created.length, 0, 'лист не создавался');
    });

    test('VM: пустой график — тост, без печати', () => {
        const toasts = [];
        const doc = makeDoc();
        const r = hostOf(doc, { level: 'view', employees: [],
                                toast: { show: function(m) { toasts.push(m); } } });
        r.host.printGrid();
        assertEqual(r.win.printCalls, 0, 'window.print не вызван');
        assertEqual(toasts.length, 1, 'тост показан');
        assertTrue(toasts[0].indexOf('Нет данных для печати') !== -1,
            'текст тоста про пустой график');
    });

    test('VM: пустой ВИД (фильтр скрыл всех) — тоже без печати', () => {
        const toasts = [];
        const doc = makeDoc();
        const r = hostOf(doc, { level: 'min', employees: [{ 'ФИО': 'X' }],
                                viewEmps: [],
                                toast: { show: function(m) { toasts.push(m); } } });
        r.host.printGrid();
        assertEqual(r.win.printCalls, 0, 'window.print не вызван');
        assertEqual(toasts.length, 1, 'тост показан');
    });

    test('VM: нормальный вызов — лист создаётся, заполняется, открывается предпросмотр (Task 430)', () => {
        const doc = makeDoc();
        const r = hostOf(doc, { level: 'view',
                                employees: [{ 'ФИО': 'Иванов И. И.', 'таб_номер': '017' }],
                                viewEmps: [{ 'ФИО': 'Иванов И. И.', 'таб_номер': '017' }] });
        r.host.printGrid();
        assertEqual(r.win.printCalls, 0,
            'прямой window.print НЕ вызван — печать идёт кнопкой диалога (Task 430)');
        assertEqual(r.prev.calls, 1, 'диалог предпросмотра открыт ровно раз');
        assertEqual(r.prev.html, 'SHEET_HTML_MARKER',
            'в диалог ушёл контент из _buildPrintHtml');
        const sheet = doc.elements['wsPrintSheet'];
        assertTrue(!!sheet, 'лист #wsPrintSheet в body');
        assertEqual(sheet.innerHTML, 'SHEET_HTML_MARKER', 'контент из _buildPrintHtml');
        assertEqual(sheet.id, 'wsPrintSheet', 'id листа');
    });

    test('VM: повторная печать ПЕРЕИСПОЛЬЗУЕТ лист (не плодит копии)', () => {
        const doc = makeDoc();
        const r = hostOf(doc, { level: 'edit',
                                employees: [{ 'ФИО': 'A', 'таб_номер': '1' }],
                                viewEmps: [{ 'ФИО': 'A', 'таб_номер': '1' }] });
        r.host.printGrid();
        r.host.printGrid();
        assertEqual(r.prev.calls, 2, 'предпросмотр открыт дважды');
        assertEqual(doc.created.length, 1, 'лист создан ОДИН раз');
    });
});

// ============================================================
// 4. _printCell — VM (ячейки печатной шахматки)
// ============================================================
describe('Task 341 — _printCell (VM)', () => {

    function cellHost(over) {
        over = over || {};
        return new Function('return ({' +
            methodText(WS_CLIENT, '_printCell') + '\n' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '_statusMeta: function(code) { return ' + JSON.stringify(over.meta || { code: 'Д', color: '#FFE082' }) + '; },' +
            '_calDayOff: function(day) { return ' + JSON.stringify(over.dayOff === undefined ? false : over.dayOff) + '; },' +
            '_vacationAt: function(iso, tab) { return ' + JSON.stringify(over.vac || null) + '; },' +
            '_eventsAt: function(iso, tab) { return ' + JSON.stringify(over.events || []) + '; },' +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')();
    }

    var EMP = { 'таб_номер': '017' };

    test('VM: основной код — inline-фон справочника + текст', () => {
        var td = cellHost()._printCell(2, '2026-09-02', EMP,
                                       { 'статус': 'Д' });
        assertTrue(td.indexOf('>Д</td>') !== -1, 'код в ячейке');
        assertTrue(td.indexOf('background:#FFE082') !== -1,
            'inline-фон цвета справочника');
        assertTrue(td.indexOf('class="wsp-cell"') !== -1, 'базовый класс');
    });

    test('VM: «.» (плановый выходной) — ПУСТАЯ ячейка без фона', () => {
        var td = cellHost()._printCell(3, '2026-09-03', EMP,
                                       { 'статус': '.' });
        assertTrue(td.indexOf('>.</td>') === -1, 'точка не выводится');
        assertTrue(td.indexOf('background:') === -1, 'фона нет');
    });

    test('VM: статус-мероприятие (И) — ПУСТАЯ ячейка БЕЗ бейджа (Task 442)', () => {
        var td = cellHost({ meta: { code: 'И', color: '#B3E5FC' },
                            events: [{ code: 'И', training: 7 }] })
            ._printCell(5, '2026-09-05', EMP, { 'статус': 'И' });
        assertTrue(td.indexOf('>И</td>') === -1, 'большого кода нет');
        assertTrue(td.indexOf('wsp-ev') === -1,
            'бейджа мероприятия НЕТ (Task 442 удалил мини-значки)');
        assertTrue(td.indexOf('background:') === -1,
            'фона нет — ячейка пустая (событие — в списке под таблицей)');
    });

    test('VM: событие в ПУСТОЙ ячейке — бейджей нет (Task 442)', () => {
        var td = cellHost({ events: [{ code: 'И', training: 7 }] })
            ._printCell(6, '2026-09-06', EMP, null);
        assertTrue(td.indexOf('wsp-ev') === -1,
            'бейджей нет — мини-значки удалены (Task 442)');
        assertTrue(td.indexOf('background:') === -1,
            'заливки нет (пустой день без статуса)');
    });

    test('VM: статус-мероприятие БЕЗ строки в «Инструктажах» — ячейка пустая (Task 442)', () => {
        var td = cellHost({ meta: { code: 'ОБ', color: '#D1C4E9' } })
            ._printCell(7, '2026-09-07', EMP, { 'статус': 'ОБ' });
        assertTrue(td.indexOf('wsp-ev') === -1,
            'виртуального бейджа нет (Task 442 удалил значки)');
        assertTrue(td.indexOf('>ОБ<') === -1,
            'код мероприятия в ячейке не печатается');
        assertTrue(td.indexOf('background:') === -1,
            'фона нет — мероприятие раскрывается списком ниже');
    });

    test('VM: план отпуска в пустой ячейке — класс wsp-vac', () => {
        var td = cellHost({ vac: { 'дата_начала': '2026-09-01' } })
            ._printCell(8, '2026-09-08', EMP, null);
        assertTrue(td.indexOf('wsp-vac') !== -1, 'пунктирная рамка');
    });

    test('VM: нерабочий день — БЕЗ заливки, маркер контура (Task 442)', () => {
        var empty = cellHost({ dayOff: true })
            ._printCell(12, '2026-09-12', EMP, null);
        assertTrue(empty.indexOf('wsp-cell-off') !== -1,
            'пустая нерабочая — маркер полосы выходных');
        assertTrue(empty.indexOf('background:') === -1,
            'заливки НЕТ (Task 442: фоном не выделяем)');
        var coded = cellHost({ dayOff: true })
            ._printCell(13, '2026-09-13', EMP, { 'статус': 'Н' });
        assertTrue(coded.indexOf('wsp-cell-off') !== -1,
            'статусная нерабочая — тоже в полосе контура (Task 442)');
        var vac = cellHost({ dayOff: true, vac: {} })
            ._printCell(14, '2026-09-14', EMP, null);
        assertTrue(vac.indexOf('wsp-cell-off') !== -1,
            'план отпуска в выходной — тоже в полосе (Task 442)');
    });

    test('VM: переработка — красная точка', () => {
        var td = cellHost()._printCell(2, '2026-09-02', EMP,
                                       { 'статус': 'д', 'переработка': 1 });
        assertTrue(td.indexOf('wsp-over') !== -1, 'маркер переработки');
        assertTrue(td.indexOf('>д<i') !== -1, 'код на месте (точка следом)');
    });
});

// ============================================================
// 5. _buildPrintHtml — VM (лист целиком)
// ============================================================
describe('Task 341 — _buildPrintHtml (VM)', () => {

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
                { code: 'Н', name: 'Ночь (12-час)', color: '#B0BEC5' },
                { code: '.', name: 'Плановый выходной', color: '#EEF0F2' }]) + ',' +
            '_calDayOff: function(day) { return day % 7 === 0 || day % 7 === 6; },' +
            '_vacationAt: function() { return null; },' +
            '_eventsAt: function() { return []; },' +
            '_statusMeta: function(code) { return { code: code, color: "#FFE082" }; },' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '_printCell: function(day, iso, emp, entry) { return "<td>[" + (entry ? entry.статус : "-") + "]</td>"; },' +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')(opts.pcal);
    }

    var AGG = {
        byTab: { '017': { work: 21, hours: 151.2 },
                 '031': { work: 19, hours: 136.8 } },
        grand: { work: 40, hours: 288, day: 40, night: 0,
                 'ОТ': 0, 'У': 0, 'ОВ': 0, 'Б': 0, 'ПР': 0,
                 over: 0, overDays: 0, other: 0, total: 40 }
    };
    var EMPS = [
        { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' },
        { 'ФИО': 'Сидоров Сидор Сидорович', 'таб_номер': '031' }
    ];

    test('VM: шапка — заголовок, месяц/год, вид (Task 438: 2 строки)', () => {
        var html = sheetHost({ view: 'shift' })._buildPrintHtml(EMPS, AGG);
        assertTrue(html.indexOf('<div class="wsp-title">График работы</div>') !== -1,
            'заголовок листа (Task 438: «График работы»)');
        assertTrue(html.indexOf('Сентябрь 2026') !== -1, 'месяц и год');
        assertTrue(html.indexOf('вид табеля: сменный') !== -1, 'вид табеля');
        assertTrue(html.indexOf('Распечатано:') === -1,
            'штампа «Распечатано» нет (Task 438)');
    });

    test('VM: шапка таблицы — 30 дней сентября с днями недели', () => {
        var html = sheetHost()._buildPrintHtml(EMPS, AGG);
        var m = html.match(/<th class="wsp-day[^"]*">/g);
        assertEqual(m ? m.length : 0, 30, 'сентябрь 2026 = 30 колонок дней');
        assertTrue(html.indexOf('<span>Пн</span>') !== -1 ||
                   html.indexOf('<span>Вт</span>') !== -1,
            'день недели под числом');
        assertTrue(html.indexOf('<th class="wsp-emp" style="width:') !== -1,
            'колонка сотрудника с inline-шириной по тексту (Task 361)');
        assertTrue(html.indexOf('">Работник</th>') !== -1,
            'заголовок колонки работника (Task 385)');
    });

    test('VM: выходные в шапке помечены, дни недели — по календарю', () => {
        // 05.09.2026 — суббота, 06.09.2026 — воскресенье
        var html = sheetHost()._buildPrintHtml(EMPS, AGG);
        var i5 = html.indexOf('>5<span>Сб</span>');
        var i6 = html.indexOf('>6<span>Вс</span>');
        assertTrue(i5 !== -1 && i6 !== -1, '5=Сб, 6=Вс (сентябрь 2026)');
        // пометка выходного класса стоит на колонке субботы
        var before5 = html.lastIndexOf('<th class="wsp-day', i5);
        var th5 = html.slice(before5, i5);
        assertTrue(th5.indexOf('wsp-off') !== -1, 'суббота — класс выходного');
    });

    test('VM: строки сотрудников — ФИО, должность, итоги (Task 438: без «Часов»)', () => {
        var html = sheetHost()._buildPrintHtml(EMPS, AGG);
        assertTrue(html.indexOf('Иванов Иван Иванович') !== -1, 'ФИО сотрудника');
        assertTrue(html.indexOf('смена №1') !== -1,
            'Тип под ФИО (Task 439: только ФИО и Тип)');
        assertTrue(html.indexOf('Слесарь КИПиА') === -1,
            'должности в колонке больше нет (Task 439)');
        assertTrue(html.indexOf('>21</td>') !== -1, 'дни явки 017');
        assertTrue(html.indexOf('>151,2</td>') === -1,
            'часы НЕ печатаются (Task 438: колонка «Часы» удалена)');
        assertTrue(html.indexOf('<th class="wsp-tot">Дни</th>') !== -1,
            'заголовок колонки «Дни»');
        assertTrue(html.indexOf('<th class="wsp-tot">Часы</th>') === -1,
            'колонки «Часы» нет (Task 438)');
    });

    test('VM: итоговой строки НЕТ (Task 343), легенда и пояснения живы (Task 360: коды месяца)', () => {
        // Task 360: перечень кодов — только коды, ПРИСУТСТВУЮЩИЕ в
        // месяце (эффективные записи печатаемых строк), поэтому в
        // фиксуре появляются записи со статусами Д/Н/. — легенда
        // печатает их расшифровки, НЕИСПОЛЬЗОВАННЫЙ код справочника
        // в печать НЕ попадает (см. tests/test-task360.js)
        var entries = {
            '2026-09-02|017': { 'статус': 'Д' },
            '2026-09-03|031': { 'статус': 'Н' },
            '2026-09-04|017': { 'статус': '.' }
        };
        var html = sheetHost({ entries: entries })._buildPrintHtml(EMPS, AGG);
        assertTrue(html.indexOf('wsp-sum') === -1, 'строки «Итого» нет (Task 343)');
        assertTrue(html.indexOf('>40</td>') === -1, 'итога дней нет (grand 40)');
        assertTrue(html.indexOf('>288</td>') === -1, 'итога часов нет (grand 288)');
        // Task 442: легенда кодов УДАЛЕНА — расшифровок на листе нет
        assertTrue(html.indexOf('wsp-legend') === -1,
            'легенды кодов нет (Task 442: столбец удалён)');
        assertTrue(html.indexOf('Д — День (12-час)') === -1,
            'расшифровки кода Д нет');
        assertTrue(html.indexOf('Н — Ночь (12-час)') === -1,
            'расшифровки кода Н нет');
        assertTrue(html.indexOf('wsp-foot') === -1,
            'пояснения внизу удалены (Task 438)');
    });

    test('VM: нормы в шапке НЕТ даже при живом ProdCalendar (Task 438)', () => {
        var pcal = { monthStats: function(y, m) { return { workDays: 22, hours40: 176 }; } };
        var html = sheetHost({ pcal: pcal })._buildPrintHtml(EMPS, AGG);
        assertTrue(html.indexOf('Норма (40-час') === -1,
            'строка нормы удалена из шапки (Task 438)');
        assertTrue(html.indexOf('22 раб. дн.') === -1, 'цифр нормы нет');
    });

    test('VM: ProdCalendar недоступен — лист БЕЗ нормы (не падает)', () => {
        var html = sheetHost({ pcal: undefined })._buildPrintHtml(EMPS, AGG);
        assertTrue(html.indexOf('wsp-title') !== -1, 'лист построен');
        assertTrue(html.indexOf('Норма (40-час') === -1, 'строки нормы нет');
    });

    test('VM: локальная правка перекрывает серверную запись (эффективный вид)', () => {
        var entries = { '2026-09-02|017': { 'статус': 'Д', 'источник': 'авто' } };
        var pending = { '2026-09-02|017': { 'статус': 'ОТ' } };
        var html = sheetHost({ entries: entries, pending: pending })
            ._buildPrintHtml(EMPS, AGG);
        // мок _printCell печатает [статус]
        assertTrue(html.indexOf('[ОТ]') !== -1, 'правка видна в печати');
        var htmlDel = sheetHost({ entries: entries,
                                  pending: { '2026-09-02|017': { __delete: true } } })
            ._buildPrintHtml(EMPS, AGG);
        assertTrue(htmlDel.indexOf('[ОТ]') === -1 && htmlDel.indexOf('[-]') !== -1,
            '__delete — ячейка пустая');
    });

    test('VM: сотрудник БЕЗ записей — пустые итоги, строка не теряется', () => {
        var html = sheetHost()._buildPrintHtml(
            [{ 'ФИО': 'Новый Н. Н.', 'таб_номер': '999' }], AGG);
        assertTrue(html.indexOf('Новый Н. Н.') !== -1, 'строка есть');
        assertTrue(/<td class="wsp-tot"><\/td>/.test(html),
            'итоги пустые (agg нет таб.номера)');
    });
});

// ============================================================
// 6. Service Worker
// ============================================================
describe('Task 341 — Service Worker', () => {

    test('SW: кэш поднят до kipia-test-v754', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v754'") !== -1,
            'CACHE_VERSION = kipia-test-v754 (Task 341 — фронтенд)');
        assertFalse(SW_SRC.indexOf('kipia-test-v755') !== -1,
            'лишний инкремент (v580) не сделан');
    });

    test('SW: в index.html нет захардкоженной версии кэша', () => {
        assertFalse(INDEX_SRC.indexOf('kipia-test-v57') !== -1,
            'клиент не знает номер кэша (версией управляет sw.js)');
    });
});
