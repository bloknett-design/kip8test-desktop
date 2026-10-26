// ============================================================
// Task 393 — заявка: «В картах работников нужно сделать шрифт
// текста больше, и разбить карты работников на четыре блока:
// профиль (Галкин Д. Н. · таб. №2706 / Режим работы / Должность /
// Дата приёма / Правка данных… / Уволить…), Отпуска · 2026,
// Мероприятия · Сентябрь 2026, СИЗ · средства индивидуальной
// защиты».
//
// Реализация: _renderWorkerCard(tabNo, withEdit, asBlocks) собирает
// ЧЕТЫРЕ блока (b1 профиль+действия, b2 отпуска, b3 мероприятия,
// b4 СИЗ); asBlocks=true — массив (страница «Работники» оборачивает
// каждый блок ОТДЕЛЬНЫМ окном .ws-wcard — _renderWorkerCardPanels),
// без флага — склеенная строка (попап шахматки — прежний вид).
// Шрифт крупнее — каскадом .ws-wcard … (попап не задет).
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
    return m ? String(m) : '';
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function ruleBlock(sel) {
    const i = INDEX_SRC.indexOf(sel);
    if (i === -1) return null;
    const end = INDEX_SRC.indexOf('\n    }', i);
    return end === -1 ? null : INDEX_SRC.slice(i, end + 7);
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

function mkEl() {
    return {
        style: {}, attrs: {}, hidden: false, innerHTML: '',
        value: '', textContent: '',
        classList: { add: function() {}, remove: function() {},
                     contains: function() { return false; },
                     toggle: function() {} },
        setAttribute: function(k, v) { this.attrs[k] = v; },
        getBoundingClientRect: function() { return { width: 0, height: 0,
                                                     left: 0, right: 0,
                                                     top: 0, bottom: 0 }; },
        querySelector: function() { return null; },
        querySelectorAll: function() { return []; },
        addEventListener: function() {},
        focus: function() {},
        appendChild: function() {},
    };
}

// ============================================================
// 1. SRC — структура: 4 блока + панели + вызов страницы
// ============================================================
describe('Task 393 — SRC: четыре блока карточки', () => {

    test('_renderWorkerCard — сигнатура с asBlocks и возврат массива', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf('function(tabNo, withEdit, asBlocks)') !== -1,
            'третий параметр asBlocks');
        assertTrue(
            fn.indexOf('return asBlocks ? [b1, b2, b3, b4, b5] : (b1 + b2 + b3 + b5);') !== -1,
            'массив 5 блоков / склеенная строка (Task 403: попап БЕЗ СИЗ; '
            + 'Task 405: +b5 «Повторные инструктажи»)');
        assertTrue(fn.indexOf('return asBlocks ? [miss] : miss;') !== -1,
            '«не найден» — тоже массив в режиме блоков');
    });

    test('блоки b1–b4: профиль / отпуска / мероприятия / СИЗ', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf("'<div class=\"ws-whead\"><div class=\"ws-whead-t ws-whead-name\">'") !== -1,
            'b1 — шапка ФИО · таб. № (Task 396: полоса .ws-whead у блоков-окон)');
        assertTrue(fn.indexOf("'<div class=\"ws-popup-title\">'") !== -1,
            'b1 — легаси-ветка попапа: прежний .ws-popup-title');
        assertTrue(fn.indexOf("'<div class=\"ws-popup-sec\">Отпуска · '") !== -1,
            'b2 — отпуска года (легаси-ветка попапа)');
        assertTrue(fn.indexOf("'<div class=\"ws-popup-sec\">Мероприятия · '") !== -1,
            'b3 — мероприятия (легаси-ветка попапа)');
        assertTrue(fn.indexOf("'<div class=\"ws-popup-sec\">СИЗ · средства индивидуальной защиты</div>'") !== -1,
            'b4 — СИЗ (легаси-ветка попапа)');
        // «Правка данных…»/«Уволить…» — в b1 (панель профиля)
        const iEdit = fn.indexOf('ws-emp-editdata');
        const iDis = fn.indexOf('ws-emp-dismiss');
        assertTrue(iEdit !== -1 && iDis !== -1, 'строки действий живы');
        assertTrue(fn.indexOf('b1 +=') < fn.indexOf('var b2 ='), 'действия — в блоке b1');
    });

    test('_renderWorkerCardPanels — каждое блок-окно .ws-wcard', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCardPanels'));
        assertTrue(fn.indexOf('_renderWorkerCard(tabNo, withEdit, true)') !== -1,
            'панели зовут карточку в режиме asBlocks');
        assertTrue(fn.indexOf("'<div class=\"ws-wcard\">' + blocks[bi] + '</div>'") !== -1,
            'каждый блок — отдельное окно .ws-wcard');
    });

    test('_renderWorkersPage — вызывает панели, НЕ прямой рендер', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersPage'));
        assertTrue(fn.indexOf('this._renderWorkerCardPanels(empTabNo, withEdit)') !== -1,
            'тело вкладки работника — панели блоков');
        assertTrue(fn.indexOf('this._renderWorkerCard(empTabNo, withEdit)') === -1,
            'прямой вызов карточки убран');
    });

    test('попап шахматки — прежний сплошной рендер', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderEmpPopup'));
        assertTrue(fn.indexOf('this._renderWorkerCard(tabNo, false)') !== -1,
            'попап — без asBlocks (склеенная строка, компактный вид)');
    });
});

// ============================================================
// 2. CSS — шрифт крупнее (каскад .ws-wcard), попап не задет
// ============================================================
describe('Task 393 — CSS: шрифт карточки страницы крупнее', () => {

    test('шапка панели (ФИО) — 15px', () => {
        const r = ruleBlock('.ws-wcard .ws-popup-title {');
        assertTrue(r !== null, 'правило живо');
        assertTrue(r.indexOf('font-size: 15px;') !== -1, 'шрифт шапки 15px');
    });

    test('поля профиля — 14px, метка шире', () => {
        const r = ruleBlock('.ws-wcard .ws-emp-field {');
        assertTrue(r !== null && r.indexOf('font-size: 14px;') !== -1,
            'поля 14px');
        const k = ruleBlock('.ws-wcard .ws-emp-field .ws-emp-k {');
        // Task 433 (заявка: расстояние название→содержание — как
        // код→содержание у мероприятий): слот ПЛОТНЫЙ по самой
        // длинной строке профиля («Группа допуска»), прежде 128px
        assertTrue(k !== null && k.indexOf('min-width: 110px;') !== -1,
            'метка min-width 110px (Task 433: плотный слот)');
    });

    test('заголовок блока (ws-popup-sec) — 12px с подчёркиванием', () => {
        const r = ruleBlock('.ws-wcard .ws-popup-sec {');
        assertTrue(r !== null && r.indexOf('font-size: 12px;') !== -1,
            'заголовок блока 12px');
        assertTrue(r.indexOf('border-bottom: 1px solid') !== -1,
            'заголовок-шапка блока с нижней линией');
        assertTrue(r.indexOf('border-top: none;') !== -1,
            'верхней линии нет (панель сама с рамкой)');
    });

    test('строки-действия и записи СИЗ — 14px', () => {
        const row = ruleBlock('.ws-wcard .ws-popup-row {');
        assertTrue(row !== null && row.indexOf('font-size: 14px;') !== -1,
            '«Правка данных…»/«Уволить…»/«+ …» — 14px');
        const ppe = ruleBlock('.ws-wcard .ws-ppe-item {');
        assertTrue(ppe !== null && ppe.indexOf('font-size: 14px;') !== -1,
            'записи СИЗ 14px');
        const meta = ruleBlock('.ws-wcard .ws-ppe-meta {');
        // Task 444: мета дат/сроков в карточке — 13px, крупнее
        // (прежде 12.5px); «до …» — 1.15em ≈ 15px цветная
        assertTrue(meta !== null && meta.indexOf('font-size: 13px;') !== -1,
            'мета-строка СИЗ 13px (Task 444)');
    });

    test('стек панелей: зазор между окнами, у последнего — 0', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-wtab-body .ws-wcard { margin-bottom: 5px; }') !== -1,
            'зазор между блоками-окнами (Task 428: 5px)');
        assertTrue(INDEX_SRC.indexOf('.ws-wtab-body .ws-wcard:last-child { margin-bottom: 0; }') !== -1,
            'последнее окно без нижнего зазора');
    });

    test('Task 417: попап карточки у сетки удалён (CSS)', () => {
        assertFalse(INDEX_SRC.indexOf('.ws-cell-popup.ws-emp-popup {') !== -1,
            'габариты попапа удалены вместе с окном');
        // новые правила шрифта — ТОЛЬКО каскад .ws-wcard (страница),
        // селекторов попапа в них нет
        assertTrue(INDEX_SRC.indexOf('.ws-wcard .ws-cell-popup') === -1 &&
                   INDEX_SRC.indexOf('.ws-wcard #wsEmpPopup') === -1,
            'каскад .ws-wcard не цепляет удалённый попап');
    });
});

// ============================================================
// 3. VM — карточка: строка (попап) и массив блоков (страница)
// ============================================================
function cardHost(withEdit, ppe) {
    const EMP = [
        { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
          'смена': '', 'должность': 'Мастер КИПиА', 'комментарий': '',
          'дата_приёма': '2007-03-06' },
        { 'таб_номер': '0377', 'ФИО': 'Первов С. А.', 'тип': 'сменный',
          'смена': 1, 'должность': 'Слесарь КИПиА', 'комментарий': '',
          'дата_приёма': '2025-01-20' },
    ];
    const host = new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
        methodText(INDEX_SRC, '_renderWorkerCardPanels') + ',\n' +
        methodText(INDEX_SRC, '_isInstrType') + ',\n' +
        '_canEdit: ' + JSON.stringify(!!withEdit) + ',' +
        '_year: 2026, _month: 9,' +
        '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
        '_VACATIONS: [],' +
        '_TRAININGS: [],' +
        '_PPE: ' + JSON.stringify(ppe || []) + ',' +
        '_fmtDateRu: function(d) { d = String(d);' +
        '  var p = d.split("-"); return p.length === 3 ?' +
        '  p[2] + "." + p[1] + "." + p[0] : d; },' +
        '_esc: function(s) { return String(s); },' +
        '_escAttr: function(s) { return String(s); },' +
        '_trainingCodeOf: function(t) { return "И"; },' +
        '_statusMeta: function(c) { return {}; },' +
        '_vacDaysInYear: function(v, y) { return 0; },' +
        '_vacNetDaysInYear: function(v, y) { return 0; },' +
        '_plural: function(n, f) { return f[2]; }' +
        '});')(mockDoc({}));
    return host;
}

describe('Task 393 — VM: _renderWorkerCard строка и блоки', () => {

    const PPE = [
        { id: 1, 'таб_номер': '2706', наименование: 'Костюм для защиты от растворов кислот и щелочей',
          дата_выдачи: '2026-09-17', срок_годности: '1 год',
          дата_окончания: '2027-09-17', примечание: '' },
        { id: 2, 'таб_номер': '2706', наименование: 'Каска защитная',
          дата_выдачи: '', срок_годности: '2 года',
          дата_окончания: '', примечание: 'До износа' },
    ];

    test('без asBlocks — СТРОКА, порядок секций прежний', () => {
        const host = cardHost(true, PPE);
        const html = host._renderWorkerCard('2706', true);
        assertEqual(typeof html, 'string', 'попап получает строку');
        const i1 = html.indexOf('Галкин Д. Н.');
        const i2 = html.indexOf('Отпуска · 2026');
        const i3 = html.indexOf('Мероприятия · 2026');
        assertTrue(i1 !== -1 && i2 !== -1 && i3 !== -1,
            'секции профиля/отпусков/мероприятий в строке');
        assertTrue(i1 < i2 && i2 < i3, 'порядок: профиль → отпуска → мероприятия');
        // Task 403 (заявка): данные СИЗ из попапа УБРАНЫ
        assertTrue(html.indexOf('СИЗ · средства индивидуальной защиты') === -1,
            'секции СИЗ в попапе НЕТ (только страница «Работники»)');
    });

    test('asBlocks — МАССИВ из 4 блоков', () => {
        const host = cardHost(true, PPE);
        const blocks = host._renderWorkerCard('2706', true, true);
        assertTrue(Array.isArray(blocks), 'массив');
        assertEqual(blocks.length, 5,
            'ровно 5 блоков (Task 405: + повторные инструктажи)');
    });

    test('блок 1 — профиль + действия (БЕЗ чужих секций)', () => {
        const host = cardHost(true, PPE);
        const b = host._renderWorkerCard('2706', true, true)[0];
        assertTrue(b.indexOf('Галкин Д. Н.') !== -1 && b.indexOf('таб. №2706') !== -1,
            'шапка ФИО · таб. №');
        assertTrue(b.indexOf('Режим работы') !== -1 && b.indexOf('дневной') !== -1,
            'режим работы');
        assertTrue(b.indexOf('Должность') !== -1 && b.indexOf('Мастер КИПиА') !== -1,
            'должность');
        assertTrue(b.indexOf('Дата приёма') !== -1 && b.indexOf('06.03.2007') !== -1,
            'дата приёма (ru)');
        assertTrue(b.indexOf('Правка данных…') !== -1, '«Правка данных…» в блоке 1');
        assertTrue(b.indexOf('Уволить…') !== -1, '«Уволить…» в блоке 1');
        assertTrue(b.indexOf('Отпуска · ') === -1 && b.indexOf('Мероприятия · ') === -1 &&
                   b.indexOf('СИЗ · ') === -1,
            'чужие секции НЕ попадают в блок профиля');
    });

    test('блок 2 — отпуска года со строкой добавления', () => {
        const host = cardHost(true, PPE);
        const b = host._renderWorkerCard('2706', true, true)[1];
        assertTrue(b.indexOf('Отпуска · 2026') !== -1, 'заголовок блока');
        assertTrue(b.indexOf('нет запланированных периодов') !== -1, 'пустое состояние');
        assertTrue(b.indexOf('+ Отпуск…') !== -1, '«+ Отпуск…» в блоке 2');
        assertTrue(b.indexOf('Мероприятия') === -1 && b.indexOf('СИЗ') === -1,
            'изоляция блока');
    });

    test('блок 3 — мероприятия года (Task 394)', () => {
        const host = cardHost(true, PPE);
        const b = host._renderWorkerCard('2706', true, true)[2];
        assertTrue(b.indexOf('Мероприятия · 2026') !== -1, 'заголовок блока (год, Task 394)');
        assertTrue(b.indexOf('нет мероприятий за год') !== -1, 'пустое состояние (год)');
        assertTrue(b.indexOf('+ Мероприятие…') !== -1, '«+ Мероприятие…» в блоке 3');
    });

    test('блок 4 — СИЗ с записями и «+ СИЗ…»', () => {
        const host = cardHost(true, PPE);
        const b = host._renderWorkerCard('2706', true, true)[3];
        assertTrue(b.indexOf('СИЗ · средства индивидуальной защиты') !== -1, 'заголовок блока');
        assertTrue(b.indexOf('Костюм для защиты от растворов кислот и щелочей') !== -1,
            'наименование записи');
        assertTrue(b.indexOf('выдано 17.09.2026') !== -1, 'дата выдачи (ru)');
        assertTrue(b.indexOf('Каска защитная') !== -1, 'вторая запись');
        assertTrue(b.indexOf('+ СИЗ…') !== -1, '«+ СИЗ…» в блоке 4');
    });

    test('блок 5 — повторные инструктажи года (Task 405)', () => {
        const host = cardHost(true, PPE);
        const b = host._renderWorkerCard('2706', true, true)[4];
        assertTrue(
            b.indexOf('Повторные инструктажи и периодическая проверка знаний · 2026') !== -1,
            'заголовок нового блока');
        assertTrue(b.indexOf('нет инструктажей и проверок знаний за год') !== -1,
            'пустое состояние');
        assertTrue(b.indexOf('+ Инструктаж…') !== -1, '«+ Инструктаж…» в блоке 5');
        assertTrue(b.indexOf("WorkSchedule.onEmpAddInstruction('2706')") !== -1,
            'контракт onclick кнопки');
    });

    test('зритель — блоки без элементов правки', () => {
        const host = cardHost(false, PPE);
        const blocks = host._renderWorkerCard('2706', false, true);
        assertEqual(blocks.length, 5, '5 блоков и у зрителя');
        const all = blocks.join('');
        assertTrue(all.indexOf('Правка данных…') === -1 &&
                   all.indexOf('Уволить…') === -1 &&
                   all.indexOf('+ Отпуск…') === -1 &&
                   all.indexOf('+ Мероприятие…') === -1 &&
                   all.indexOf('+ СИЗ…') === -1 &&
                   all.indexOf('+ Инструктаж…') === -1,
            'без права записи — блоки без действий');
    });

    test('«не найден» — один блок и в строке, и в массиве', () => {
        const host = cardHost(true, []);
        assertEqual(typeof host._renderWorkerCard('9999', true), 'string',
            'строка — как прежде');
        const blocks = host._renderWorkerCard('9999', true, true);
        assertTrue(Array.isArray(blocks) && blocks.length === 1, 'массив из 1 блока');
        assertTrue(blocks[0].indexOf('— не найден') !== -1, 'сообщение живо');
    });
});

// ============================================================
// 4. VM — _renderWorkerCardPanels и страница «Работники»
// ============================================================
function pageHost(canEdit, ppe) {
    const els = { wsWorkersBody: mkEl() };
    const EMPLOYEES = [
        { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
          'смена': '', 'должность': 'Мастер КИПиА', 'комментарий': '',
          'дата_приёма': '2007-03-06' },
        { 'таб_номер': '0377', 'ФИО': 'Первов С. А.', 'тип': 'сменный',
          'смена': 1, 'должность': 'Слесарь КИПиА', 'комментарий': '',
          'дата_приёма': '2025-01-20' },
    ];
    const host = new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_renderWorkersPage') + ',\n' +
        methodText(INDEX_SRC, '_renderWorkersGeneral') + ',\n' +
        methodText(INDEX_SRC, 'selectWorkersTab') + ',\n' +
        methodText(INDEX_SRC, '_isMasterKipia') + ',\n' +
        methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
        methodText(INDEX_SRC, '_renderWorkerCardPanels') + ',\n' +
        methodText(INDEX_SRC, '_isInstrType') + ',\n' +
        '_workersTab: "general",' +
        '_canEdit: ' + JSON.stringify(!!canEdit) + ',' +
        '_year: 2026, _month: 9,' +
        '_EMPLOYEES: ' + JSON.stringify(EMPLOYEES) + ',' +
        '_VACATIONS: [],' +
        '_TRAININGS: [],' +
        '_PPE: ' + JSON.stringify(ppe || []) + ',' +
        '_fmtDateRu: function(d) { d = String(d);' +
        '  var p = d.split("-"); return p.length === 3 ?' +
        '  p[2] + "." + p[1] + "." + p[0] : d; },' +
        '_esc: function(s) { return String(s); },' +
        '_escAttr: function(s) { return String(s); },' +
        '_trainingCodeOf: function(t) { return "И"; },' +
        '_statusMeta: function(c) { return {}; },' +
        '_vacDaysInYear: function(v, y) { return 0; },' +
        '_vacNetDaysInYear: function(v, y) { return 0; },' +
        '_plural: function(n, f) { return f[2]; }' +
        '});')(mockDoc(els));
    return { host: host, els: els };
}

describe('Task 393 — VM: страница «Работники» — 4 окна', () => {

    test('_renderWorkerCardPanels — 4 обёртки .ws-wcard по порядку', () => {
        const host = pageHost(true).host;
        const html = host._renderWorkerCardPanels('2706', true);
        assertEqual((html.match(/class="ws-wcard"/g) || []).length, 5,
            'ровно пять окон-панелей');
        const i1 = html.indexOf('Галкин Д. Н.');
        const i2 = html.indexOf('Отпуска · 2026');
        const i3 = html.indexOf('Мероприятия · 2026');
        const i4 = html.indexOf('СИЗ · средства индивидуальной защиты');
        const i5 = html.indexOf(
            'Повторные инструктажи и периодическая проверка знаний · 2026');
        assertTrue(i1 !== -1 && i2 !== -1 && i3 !== -1 && i4 !== -1 &&
                   i5 !== -1, 'блоки на месте');
        // Task 406: мероприятия — ПОД отпусками (1-я колонка),
        // инструктажи — вторая колонка, СИЗ — третья
        assertTrue(i1 < i2 && i2 < i3 && i3 < i5 && i5 < i4,
            'порядок: профиль → отпуска → мероприятия → инструктажи → СИЗ');
    });

    test('вкладка работника — 4 окна, действия в своей панели', () => {
        const t = pageHost(true);
        t.host._renderWorkersPage();
        t.host.selectWorkersTab('2706');
        const body = t.els.wsWorkersBody.innerHTML;
        assertEqual((body.match(/class="ws-wcard"/g) || []).length, 5,
            'тело вкладки — пять блоков-окон (Task 405)');
        assertTrue(body.indexOf('ws-emp-editdata') !== -1, '«Правка данных…» жив');
        assertTrue(body.indexOf('ws-emp-addppe') !== -1, '«+ СИЗ…» жив');
    });

    test('зритель — 4 окна без элементов правки', () => {
        const t = pageHost(false);
        t.host._renderWorkersPage();
        t.host.selectWorkersTab('2706');
        const body = t.els.wsWorkersBody.innerHTML;
        assertEqual((body.match(/class="ws-wcard"/g) || []).length, 5,
            'пять окон и у зрителя');
        assertTrue(body.indexOf('ws-emp-editdata') === -1 &&
                   body.indexOf('ws-emp-dismiss') === -1 &&
                   body.indexOf('ws-emp-addvac') === -1 &&
                   body.indexOf('ws-emp-addtr') === -1 &&
                   body.indexOf('ws-emp-addppe') === -1,
            'без права записи — окна без действий');
    });

    test('«Общая» вкладка — БЕЗ окон карточек (не задета)', () => {
        const t = pageHost(true);
        t.host._renderWorkersPage();
        const body = t.els.wsWorkersBody.innerHTML;
        assertEqual((body.match(/class="ws-wcard"/g) || []).length, 0,
            'на «Общей» панелей карточки нет');
        assertTrue(body.indexOf('ws-wgen') !== -1, 'сводка жива');
    });
});

// ============================================================
// 5. SW — версия поднята
// ============================================================
describe('Task 393 — SW', () => {

    test('SW: kipia-test-v758', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v758'") !== -1,
            'SWVersion bumped');
        assertTrue(SW_SRC.indexOf('kipia-test-v759') === -1,
            'двойного бампа не было');
    });
});
