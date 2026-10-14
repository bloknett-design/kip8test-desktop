// ============================================================
// Task 435 — заявка (kip8test): «В картах работников, при
// переключении года в блоке инструктажей, автоматически
// переключается год в блоке мероприятий, и наоборот то же самое.
// Эти блоки не должны влиять друг на друга».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   КЛИЕНТ (SRC):
//   1) два РАЗДЕЛЬНЫХ хранилища года: _wtabYear (мероприятия,
//      fam 0) и _wtabYearInstr (инструктажи, fam 1);
//   2) сигнатуры с fam: _wtabYearOf(tabNo, fam),
//      _wtabYearMin(tabNo, fam), _wtabYearShift(tabNo, delta, fam),
//      _wtabYearNav(tabNo, year, fam);
//   3) карточка: wYearEv/wYearIn — два года, две выборки
//      _wtabYearRecords, шапки b3 (fam 0) и b5 (fam 1) со своими
//      навигаторами;
//   4) клик навигатора fam 1 — третий аргумент (, 1); fam 0 —
//      прежняя сигнатура без третьего аргумента (совместимость);
//   5) _wtabYearMin: fam 1 — только записи инструктажей, fam 0 —
//      только мероприятия, fam не задан — все записи (попап).
//   VM (клиент):
//   6) _wtabYearOf — раздельные хранилища (fam 0/1/legacy);
//   7) _wtabYearShift — смена года ТОЛЬКО своего блока, второй
//      блок сохраняет год; перерисовка страницы вызывается;
//   8) _wtabYearMin — границы по СВОИМ записям раздела;
//   9) _wtabYearNav — третий аргумент клика у fam 1, границы
//      стрелок по своему разделу;
//  10) _renderWorkerCard (asBlocks) — годы блоков НЕ зависят друг
//      от друга: мероприятия 2025 (fam 0) + инструктажи 2023
//      (fam 1) одновременно, записи каждого блока — своего года;
//      попап (не asBlocks) — год шахматки у обоих блоков.
//   SW: kipia-test-v734 (главный), v660 — прежней нет.
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
    if (m === null) throw new Error('метод не найден: ' + name);
    return m;
}

function stripComments(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:'"\\/])\/\/[^\n]*/g, '$1');
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

const NOWY = new Date().getFullYear();
const TAB = '2706';

// ============================================================
// 1. SRC — маркеры правки
// ============================================================
describe('Task 435 — SRC: раздельные годы блоков карточки', () => {

    test('состояние: ДВА хранилища года (_wtabYear + _wtabYearInstr)', () => {
        assertTrue(INDEX_SRC.indexOf('_wtabYear: {},') !== -1,
            'хранилище мероприятий (_wtabYear) на месте');
        assertTrue(INDEX_SRC.indexOf('_wtabYearInstr: {},') !== -1,
            'НОВОЕ хранилище инструктажей (_wtabYearInstr)');
    });

    test('_wtabYearOf: fam 1 → _wtabYearInstr, fam 0 → _wtabYear', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_wtabYearOf'));
        assertTrue(fn.indexOf('_wtabYearOf: function(tabNo, fam)') !== -1,
            'сигнатура с fam');
        assertTrue(fn.indexOf("var store = (fam === 1) ? this._wtabYearInstr") !== -1 &&
                   fn.indexOf("(fam === 2) ? this._wtabYearVac : this._wtabYear;") !== -1,
            'fam 1 — инструктажи, fam 2 — отпуска (Task 440), fam 0/не задан — мероприятия');
    });

    test('_wtabYearShift: fam 1 — только _wtabYearInstr', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_wtabYearShift'));
        assertTrue(fn.indexOf('_wtabYearShift: function(tabNo, delta, fam)') !== -1,
            'сигнатура с fam');
        assertTrue(fn.indexOf("var store = (fam === 1) ? '_wtabYearInstr'") !== -1 &&
                   fn.indexOf("(fam === 2) ? '_wtabYearVac' : '_wtabYear';") !== -1,
            'смена года пишет ТОЛЬКО в своё хранилище (fam 2 — отпуска, Task 440)');
        assertTrue(fn.indexOf('this._wtabYearOf(tabNo, fam)') !== -1,
            'год и границы — по своему семейству');
    });

    test('_wtabYearNav: fam 1 — клик с третьим аргументом, fam 0 — прежний', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_wtabYearNav'));
        assertTrue(fn.indexOf('_wtabYearNav: function(tabNo, year, fam)') !== -1,
            'сигнатура с fam');
        assertTrue(fn.indexOf("var famArg = (fam === 1 || fam === 2) ? ', ' + fam : '';") !== -1,
            'третий аргумент — у навигаторов инструктажей (1) и отпусков (2, Task 440)');
        assertTrue(fn.indexOf("+ famArg + ')\">‹</span>'") !== -1,
            'левая стрелка передаёт famArg');
        assertTrue(fn.indexOf("+ famArg + ')\">›</span>'") !== -1,
            'правая стрелка передаёт famArg');
        assertTrue(fn.indexOf('this._wtabYearMin(tabNo, fam)') !== -1,
            'минимум навигатора — по своему разделу');
    });

    test('_wtabYearMin: fam-фильтр записей по разделу', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_wtabYearMin'));
        assertTrue(fn.indexOf('_wtabYearMin: function(tabNo, fam)') !== -1,
            'сигнатура с fam');
        assertTrue(fn.indexOf('var famFilter = (fam === 0 || fam === 1);') !== -1 &&
                   fn.indexOf('(this._isInstrType(arr[i].тип) !== wantInstr)') !== -1,
            'fam 1 — только инструктажи, fam 0 — только мероприятия');
    });

    test('карточка: ДВА года + ДВЕ выборки записей', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf("var wYearEv = asBlocks ? this._wtabYearOf(tabNo, 0) : this._year;") !== -1 &&
                   fn.indexOf("var wYearIn = asBlocks ? this._wtabYearOf(tabNo, 1) : this._year;") !== -1,
            'годы блоков — раздельные выборы работника');
        assertTrue(fn.indexOf('var wRecsEv = this._wtabYearRecords(tabNo, wYearEv);') !== -1 &&
                   fn.indexOf('var wRecsIn = this._wtabYearRecords(tabNo, wYearIn);') !== -1 &&
                   fn.indexOf('var evs = wRecsEv.evs, ins = wRecsIn.ins;') !== -1,
            'записи каждого блока — своя выборка своего года');
    });

    test('карточка: шапки b3 (fam 0) и b5 (fam 1) — свои навигаторы', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf('wYearEv + this._wtabYearNav(tabNo, wYearEv, 0)') !== -1,
            'шапка «Мероприятия · год» — навигатор fam 0');
        assertTrue(fn.indexOf('wYearIn + this._wtabYearNav(tabNo, wYearIn, 1)') !== -1,
            'шапка «Повторные инструктажи… · год» — навигатор fam 1');
        assertFalse(fn.indexOf('wYear + this._wtabYearNav(tabNo, wYear)') !== -1,
            'общий год блоков (баг «переключаются вместе») убран');
    });
});

// ============================================================
// 2. VM — годовые методы
// ============================================================
function yearHost(stores) {
    const INSTR_ALL = [
        { id: 50, 'таб_номер': TAB, 'тип': 'инструктаж', 'тема': 'Охрана труда',
          'дата_начала': (NOWY - 3) + '-05-10', 'дата_окончания': (NOWY - 3) + '-05-10' },
        { id: 51, 'таб_номер': TAB, 'тип': 'проверка_знаний', 'тема': 'ЭБ до 1000 В',
          'дата_начала': (NOWY - 1) + '-03-15', 'дата_окончания': (NOWY - 1) + '-03-15' },
    ];
    const EVENTS_ALL = [
        { id: 60, 'таб_номер': TAB, 'тип': 'обучение', 'тема': 'Курс АСУ ТП',
          'дата_начала': (NOWY - 1) + '-06-15', 'дата_окончания': (NOWY - 1) + '-06-15' },
        { id: 61, 'таб_номер': TAB, 'тип': 'примечание', 'тема': 'Перенос',
          'дата_начала': NOWY + '-02-01', 'дата_окончания': NOWY + '-02-01' },
    ];
    return new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearShift') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
        methodText(INDEX_SRC, '_isInstrType') + ',\n' +
        '_esc: function(s) { return String(s); },' +
        '_renderWorkersPage: function() { this.__rendered = (this.__rendered || 0) + 1; },' +
        '_wtabYear: ' + JSON.stringify((stores && stores.ev) || {}) + ',' +
        '_wtabYearInstr: ' + JSON.stringify((stores && stores.in) || {}) + ',' +
        '_year: ' + NOWY + ',' +
        '_INSTR_ALL: ' + JSON.stringify(INSTR_ALL) + ',' +
        '_EVENTS_ALL: ' + JSON.stringify(EVENTS_ALL) + ',' +
        '_TRAININGS: []' +
        '});')(mockDoc({}));
}

describe('Task 435 — VM: _wtabYearOf / _wtabYearShift (раздельные годы)', () => {

    test('_wtabYearOf: fam 0 и fam 1 — РАЗНЫЕ хранилища', () => {
        const host = yearHost({ ev: {}, in: {} });
        assertEqual(NOWY, host._wtabYearOf(TAB, 0), 'fam 0: не выбран — год табеля');
        assertEqual(NOWY, host._wtabYearOf(TAB, 1), 'fam 1: не выбран — год табеля');
        host._wtabYear[TAB] = NOWY - 1;
        host._wtabYearInstr[TAB] = NOWY - 2;
        assertEqual(NOWY - 1, host._wtabYearOf(TAB, 0), 'fam 0: выбран свой год');
        assertEqual(NOWY - 2, host._wtabYearOf(TAB, 1), 'fam 1: выбран СВОЙ год');
        assertEqual(NOWY - 1, host._wtabYearOf(TAB), 'fam не задан — хранилище мероприятий (legacy)');
    });

    test('_wtabYearShift fam 1: меняет ТОЛЬКО год инструктажей', () => {
        const host = yearHost({ ev: {}, in: {} });
        host._wtabYearShift(TAB, -1, 1);
        assertEqual(NOWY - 1, host._wtabYearInstr[TAB],
            'год инструктажей уменьшился');
        assertEqual(undefined, host._wtabYear[TAB],
            'год мероприятий НЕ тронут (блоки независимы)');
        assertEqual(1, host.__rendered, 'страница перерисована');
    });

    test('_wtabYearShift fam 0: меняет ТОЛЬКО год мероприятий', () => {
        const host = yearHost({ ev: {}, in: {} });
        host._wtabYearShift(TAB, -1, 0);
        assertEqual(NOWY - 1, host._wtabYear[TAB],
            'год мероприятий уменьшился');
        assertEqual(undefined, host._wtabYearInstr[TAB],
            'год инструктажей НЕ тронут');
    });

    test('_wtabYearShift без fam (legacy): меняет год мероприятий', () => {
        const host = yearHost({ ev: {}, in: {} });
        host._wtabYearShift(TAB, -1);
        assertEqual(NOWY - 1, host._wtabYear[TAB], 'год мероприятий');
        assertEqual(undefined, host._wtabYearInstr[TAB], 'инструктажи не тронуты');
    });

    test('возврат к году табеля снимает персональный выбор своего блока', () => {
        const host = yearHost({ ev: {}, in: { } });
        host._wtabYear[TAB] = NOWY - 1;
        host._wtabYearInstr[TAB] = NOWY - 1;
        host._wtabYearShift(TAB, 1, 1);
        assertEqual(undefined, host._wtabYearInstr[TAB],
            'fam 1: год табеля — выбор снят');
        assertEqual(NOWY - 1, host._wtabYear[TAB],
            'fam 0: выбор мероприятий сохранён');
    });

    test('границы fam: кламп по записям СВОЕГО раздела', () => {
        const host = yearHost({ ev: {}, in: {} });
        // инструктажи с (NOWY-3), мероприятия с (NOWY-1)
        host._wtabYearShift(TAB, -10, 1);
        assertEqual(NOWY - 3, host._wtabYearInstr[TAB],
            'fam 1: не раньше первой записи инструктажей');
        const host2 = yearHost({ ev: {}, in: {} });
        host2._wtabYearShift(TAB, -10, 0);
        assertEqual(NOWY - 1, host2._wtabYear[TAB],
            'fam 0: не раньше первой записи мероприятий (инструктажи не мешают)');
    });
});

describe('Task 435 — VM: _wtabYearMin (границы по разделу)', () => {

    test('fam 1 — самый ранний год ИНСТРУКТАЖА; fam 0 — мероприятия', () => {
        const host = yearHost({ ev: {}, in: {} });
        assertEqual(NOWY - 3, host._wtabYearMin(TAB, 1),
            'fam 1: инструкции с позапрошлого... года');
        assertEqual(NOWY - 1, host._wtabYearMin(TAB, 0),
            'fam 0: мероприятия на год позже');
        assertEqual(NOWY - 3, host._wtabYearMin(TAB),
            'fam не задан — по всем записям (legacy-поведение)');
    });

    test('нет записей раздела — год шахматки', () => {
        const host = yearHost({ ev: {}, in: {} });
        assertEqual(NOWY, host._wtabYearMin('999', 1), 'fam 1: чужих записей нет');
        assertEqual(NOWY, host._wtabYearMin('999', 0), 'fam 0: чужих записей нет');
    });
});

describe('Task 435 — VM: _wtabYearNav (клики и границы)', () => {

    test('fam 1: клик передаёт третий аргумент 1', () => {
        const host = yearHost({ ev: {}, in: {} });
        // середина диапазона (мин инструктажей NOWY-3, макс NOWY) — ОБЕ стрелки живы
        const nav = host._wtabYearNav(TAB, NOWY - 1, 1);
        assertTrue(nav.indexOf("_wtabYearShift('" + TAB + "', -1, 1)") !== -1,
            'клик «назад» — с третьим аргументом');
        assertTrue(nav.indexOf("_wtabYearShift('" + TAB + "', 1, 1)") !== -1,
            'клик «вперёд» — с третьим аргументом');
    });

    test('fam 0 и без fam: прежняя сигнатура клика (без третьего аргумента)', () => {
        const host = yearHost({ ev: {}, in: {} });
        // на текущем году (макс) жива стрелка «назад», на минимуме мероприятий (NOWY-1) — «вперёд»
        const nav0a = host._wtabYearNav(TAB, NOWY, 0);
        assertTrue(nav0a.indexOf("_wtabYearShift('" + TAB + "', -1)") !== -1,
            'fam 0: клик «назад» — прежняя сигнатура');
        const nav0b = host._wtabYearNav(TAB, NOWY - 1, 0);
        assertTrue(nav0b.indexOf("_wtabYearShift('" + TAB + "', 1)") !== -1,
            'fam 0: клик «вперёд» — прежняя сигнатура');
        assertFalse(nav0a.indexOf(", -1, 1)") !== -1 || nav0b.indexOf(", 1, 1)") !== -1,
            'fam 0: третьего аргумента НЕТ');
        const navUa = host._wtabYearNav(TAB, NOWY);
        assertTrue(navUa.indexOf("_wtabYearShift('" + TAB + "', -1)") !== -1,
            'fam не задан: прежние клики (legacy)');
    });

    test('границы стрелок — по записям СВОЕГО раздела', () => {
        const host = yearHost({ ev: {}, in: {} });
        const loI = host._wtabYearNav(TAB, NOWY - 3, 1);
        assertTrue(loI.indexOf('ws-ynav-off">‹') !== -1,
            'fam 1 на минимуме инструктажей (' + (NOWY - 3) + '): стрелка «назад» погашена');
        const midI = host._wtabYearNav(TAB, NOWY - 2, 1);
        assertTrue(midI.indexOf('ws-ynav-btn') !== -1 && midI.indexOf('ws-ynav-off">‹') === -1,
            'fam 1 в (' + (NOWY - 2) + '): стрелка «назад» жива — инструкции есть и раньше');
        const midE = host._wtabYearNav(TAB, NOWY - 2, 0);
        assertTrue(midE.indexOf('ws-ynav-off">‹') !== -1,
            'fam 0 в (' + (NOWY - 2) + '): стрелка «назад» ПОГАШЕНА — мероприятия начинаются с ' + (NOWY - 1) + ' (инструктажи не мешают)');
    });
});

// ============================================================
// 3. VM — карточка: блоки показывают КАЖДЫЙ СВОЙ год
// ============================================================
function cardHost(stores) {
    const EMP = [
        { 'таб_номер': TAB, 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
          'смена': '', 'должность': 'Мастер КИПиА', 'комментарий': '',
          'дата_приёма': '2007-03-06' },
    ];
    const INSTR_ALL = [
        { id: 50, 'таб_номер': TAB, 'тип': 'инструктаж', 'тема': 'Охрана труда',
          'дата_начала': (NOWY - 3) + '-05-10', 'дата_окончания': (NOWY - 3) + '-05-10' },
    ];
    const EVENTS_ALL = [
        { id: 60, 'таб_номер': TAB, 'тип': 'обучение', 'тема': 'Курс АСУ ТП',
          'дата_начала': (NOWY - 1) + '-06-15', 'дата_окончания': (NOWY - 1) + '-06-15' },
    ];
    return new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
        methodText(INDEX_SRC, '_isInstrType') + ',\n' +
        '_canEdit: true,' +
        '_year: ' + NOWY + ', _month: 8,' +
        '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
        '_VACATIONS: [],' +
        '_TRAININGS: [],' +
        '_PPE: [],' +
        '_wtabYear: ' + JSON.stringify((stores && stores.ev) || {}) + ',' +
        '_wtabYearInstr: ' + JSON.stringify((stores && stores.in) || {}) + ',' +
        '_INSTR_ALL: ' + JSON.stringify(INSTR_ALL) + ',' +
        '_EVENTS_ALL: ' + JSON.stringify(EVENTS_ALL) + ',' +
        '_fmtDateRu: function(d) { d = String(d);' +
        '  var p = d.split("-"); return p.length === 3 ?' +
        '  p[2] + "." + p[1] + "." + p[0] : d; },' +
        '_esc: function(s) { return String(s); },' +
        '_escAttr: function(s) { return String(s); },' +
        '_trainingCodeOf: function(t) { return "И"; },' +
        '_statusMeta: function(c) { return {}; },' +
        '_plural: function(n, f) { return f[2]; }' +
        '});')(mockDoc({}));
}

describe('Task 435 — VM: карточка — блоки не влияют друг на друга', () => {

    test('asBlocks: мероприятия ' + (NOWY - 1) + ' + инструктажи ' + (NOWY - 3) + ' ОДНОВРЕМЕННО', () => {
        const host = cardHost({ ev: {}, in: {} });
        host._wtabYear[TAB] = NOWY - 1;
        host._wtabYearInstr[TAB] = NOWY - 3;
        const blocks = host._renderWorkerCard(TAB, true, true);
        const b3 = blocks[2], b5 = blocks[4];
        // блок мероприятий — СВОЙ год и СВОИ записи
        assertTrue(b3.indexOf('Мероприятия · ' + (NOWY - 1)) !== -1,
            'шапка мероприятий — год fam 0');
        assertTrue(b3.indexOf('Курс АСУ ТП') !== -1,
            'запись мероприятия ' + (NOWY - 1) + ' года показана');
        assertFalse(b3.indexOf('Мероприятия · ' + (NOWY - 3)) !== -1,
            'год инструктажей на блок мероприятий НЕ влияет');
        assertFalse(b3.indexOf('Охрана труда') !== -1,
            'записи инструктажей в блоке мероприятий НЕТ');
        // блок инструктажей — СВОЙ год и СВОИ записи
        assertTrue(b5.indexOf('Повторные инструктажи и периодическая проверка знаний · ' + (NOWY - 3)) !== -1,
            'шапка инструктажей — год fam 1');
        assertTrue(b5.indexOf('Охрана труда') !== -1,
            'запись инструктажа ' + (NOWY - 3) + ' года показана');
        assertFalse(b5.indexOf('Курс АСУ ТП') !== -1,
            'записи мероприятий в блоке инструктажей НЕТ');
    });

    test('asBlocks: годы блоков по умолчанию — год табеля (как прежде)', () => {
        const host = cardHost({ ev: {}, in: {} });
        const blocks = host._renderWorkerCard(TAB, true, true);
        assertTrue(blocks[2].indexOf('Мероприятия · ' + NOWY) !== -1,
            'шапка мероприятий — год табеля');
        assertTrue(blocks[4].indexOf('Повторные инструктажи и периодическая проверка знаний · ' + NOWY) !== -1,
            'шапка инструктажей — год табеля');
    });

    test('asBlocks: навигаторы блоков — разные клики (fam 0 / fam 1)', () => {
        const host = cardHost({ ev: {}, in: {} });
        const blocks = host._renderWorkerCard(TAB, true, true);
        assertTrue(blocks[2].indexOf("_wtabYearShift('" + TAB + "', -1)") !== -1,
            'блок мероприятий: клик без третьего аргумента');
        assertFalse(blocks[2].indexOf(", -1, 1)") !== -1,
            'блок мероприятий: fam-аргумента НЕТ');
        assertTrue(blocks[4].indexOf("_wtabYearShift('" + TAB + "', -1, 1)") !== -1,
            'блок инструктажей: клик с третьим аргументом 1');
    });

    test('попап (не asBlocks): оба блока — год шахматки', () => {
        const host = cardHost({ ev: {}, in: {} });
        host._wtabYear[TAB] = NOWY - 1;
        host._wtabYearInstr[TAB] = NOWY - 3;
        const html = host._renderWorkerCard(TAB, true);
        assertTrue(html.indexOf('Мероприятия · ' + NOWY) !== -1,
            'попап: мероприятия — год шахматки');
        assertTrue(html.indexOf('Повторные инструктажи и периодическая проверка знаний · ' + NOWY) !== -1,
            'попап: инструктажи — год шахматки');
        assertTrue(html.indexOf('_wtabYearShift') === -1,
            'попап: навигаторов года нет (как прежде)');
    });
});

// ============================================================
// 4. SW — версия кэша
// ============================================================
describe('Task 435 — SW: версия kipia-test-v734', () => {
    test('CACHE_VERSION = kipia-test-v734, прежней v660 нет', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v734'") !== -1,
            'CACHE_VERSION = kipia-test-v734');
        assertFalse(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v660'") !== -1,
            'v660 как активная версия больше не существует');
    });
});
