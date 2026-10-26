// ============================================================
// Task 405 — заявка: «В файле табель_КИП_ИОС необходимо таблицу
// инструктажи разделить на две таблицы. В текущей таблице оставить
// только информацию которая касается проведения инструктажей и
// проверки знаний, а остальные данные, обучение и примечание, нужно
// переместить в новую таблицу под названием "Мероприятия". Тоесть в
// личных картах работников блок мероприятия остаётся и в нём
// отображаются только данные из новой таблицы "Мероприятия", а
// данные из таблицы "Инструктажи" отображать в новом блоке под
// названием "Повторные инструктажи и периодическая проверка знаний"
// на текущий год».
//
// 1) СЕРВЕР (WorkSchedule.gs): лист «Мероприятия» (формат A..H —
//    как «Инструктажи»); listTrainings — ОБЪЕДИНЁННЫЙ список двух
//    листов; addTraining — маршрутизация по типу (инструктаж/
//    проверка_знаний → «Инструктажи», обучение/прогул/примечание →
//    «Мероприятия» с автосозданием листа), id СКВОЗНОЙ по обоим
//    листам; deleteTraining — id ищется в обоих листах;
//    splitTrainingsSheet + trainingsSplitInit — разовый перенос.
// 2) КАРТОЧКА: блок «Мероприятия» = только обучение/примечание/
//    прогул; НОВЫЙ блок «Повторные инструктажи и периодическая
//    проверка знаний · год» = инструктаж/проверка_знаний (строки
//    с ✎/✕, кнопка «+ Инструктаж…»); попап — b1+b2+b3+b5.
// 3) «Общая» сводка: колонка «Мероприятия · год» — только
//    мероприятия; НОВАЯ колонка «Инструктажи · год».
// 4) Форма «Новое мероприятие»: prefillType — тип по умолчанию из
//    кнопки входа («+ Мероприятие…» → обучение, «+ Инструктаж…» →
//    инструктаж).
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');

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
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// ============================================================
// 1. SRC — сервер: разделение таблицы
// ============================================================
describe('Task 405 — SRC: сервер (WorkSchedule.gs)', () => {

    test('константа листа «Мероприятия» + карта типов листа', () => {
        assertTrue(WS_SRC.indexOf("EVENTS_SHEET:       'Мероприятия'") !== -1,
            'константа EVENTS_SHEET = «Мероприятия»');
        const m = WS_SRC.indexOf('TRAINING_EVENTSHEET_TYPES: {');
        const block = WS_SRC.slice(m, WS_SRC.indexOf('}', m) + 1);
        assertTrue(block.indexOf("'обучение'") !== -1 &&
                   block.indexOf("'прогул'") !== -1 &&
                   block.indexOf("'примечание'") !== -1,
            'типы листа «Мероприятия»: обучение/прогул/примечание');
        assertTrue(WS_SRC.indexOf('_trainingsSheetForType: function(tip)') !== -1,
            'хелпер маршрутизации типа → лист');
    });

    test('listTrainings: объединение двух листов', () => {
        const fn = stripComments(methodText(WS_SRC, 'listTrainings'));
        assertTrue(fn.indexOf('this._readTrainingsSheet(sheet, payload)') !== -1,
            'чтение «Инструктажей» через _readTrainingsSheet');
        assertTrue(fn.indexOf("this._getSheet(this.EVENTS_SHEET)") !== -1 &&
                   fn.indexOf('trainings.concat(this._readTrainingsSheet(evSheet, payload))') !== -1,
            'конкатенация с листом «Мероприятия» (листа нет — только «Инструктажи»)');
        assertTrue(WS_SRC.indexOf('_readTrainingsSheet: function(sheet, payload)') !== -1,
            'хелпер чтения одного листа существует');
    });

    test('addTraining: маршрутизация по типу + РАЗДЕЛЬНЫЙ id (Task 427)', () => {
        const fn = stripComments(methodText(WS_SRC, 'addTraining'));
        assertTrue(fn.indexOf('this._trainingsSheetForType(tip)') !== -1,
            'лист записи выбирается по типу');
        assertTrue(fn.indexOf('this._ensureEventsSheet()') !== -1,
            'лист «Мероприятия» создаётся при первой записи');
        assertTrue(fn.indexOf('this._maxTrainingsId(sheet) + 1') !== -1,
            'id — максимум СВОЕГО листа + 1 (заявка Task 427: раздельное нарастание)');
        assertTrue(fn.indexOf('evMaxId') === -1,
            'кросс-максимум по чужому листу удалён (сквозная нумерация Task 405 отменена)');
    });

    test('deleteTraining: id ищется в обоих листах', () => {
        const fn = stripComments(methodText(WS_SRC, 'deleteTraining'));
        assertTrue(fn.indexOf('this.TRAININGS_SHEET, this.EVENTS_SHEET') !== -1,
            'поиск по двум листам');
        assertTrue(fn.indexOf('if (!sheet) continue;') !== -1,
            'отсутствующий лист пропускается');
    });

    test('миграция: splitTrainingsSheet + trainingsSplitInit', () => {
        assertTrue(WS_SRC.indexOf('splitTrainingsSheet: function()') !== -1,
            'метод переноса в WorkSchedule');
        assertTrue(WS_SRC.indexOf('function trainingsSplitInit()') !== -1 &&
                   WS_SRC.indexOf('WorkSchedule.splitTrainingsSheet()') !== -1,
            'top-level функция запуска в редакторе Apps Script');
        const fn = stripComments(methodText(WS_SRC, 'splitTrainingsSheet'));
        assertTrue(fn.indexOf('this._ensureEventsSheet()') !== -1,
            'лист «Мероприятия» создаётся при переносе');
        assertTrue(fn.indexOf("src.deleteRow(move[d].row)") !== -1,
            'перенесённые строки удаляются из «Инструктажей»');
        assertTrue(fn.indexOf('move.length - 1; d >= 0') !== -1,
            'удаление снизу вверх (номера строк не съезжают)');
    });
});

// ============================================================
// 2. SRC — карточка: два блока мероприятий
// ============================================================
describe('Task 405 — SRC: карточка — блоки мероприятий', () => {

    test('хелпер _isInstrType (толерантный к регистру/пробелам)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_isInstrType'));
        assertTrue(fn.indexOf('инструктаж') !== -1 &&
                   fn.indexOf('проверка_знаний') !== -1,
            'инструктажные типы');
        assertTrue(fn.indexOf('toLowerCase') !== -1 &&
                   fn.indexOf('/\\s+/g') !== -1,
            'нормализация регистра и пробелов');
    });

    test('карточка: деление записей по типу (evs/ins)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        const wr = stripComments(methodText(INDEX_SRC, '_wtabYearRecords'));
        assertTrue(wr.indexOf('if (this._isInstrType(r.тип)) ins.push(r);') !== -1 &&
                   wr.indexOf('else evs.push(r);') !== -1,
            'два списка: evs (мероприятия) и ins (инструктажи)');
        assertTrue(fn.indexOf('var evs = wRecsEv.evs, ins = wRecsIn.ins;') !== -1,
            'карточка берёт записи года из _wtabYearRecords (Task 408; Task 435: раздельные годы блоков)');
        assertTrue(fn.indexOf('for (var tk = 0; tk < evs.length; tk++)') !== -1,
            'блок «Мероприятия» строится по evs');
    });

    test('новый блок: заголовок, пустое состояние, кнопка добавления', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf('Повторные инструктажи и периодическая проверка знаний · ') !== -1,
            'заголовок блока с годом');
        assertTrue(fn.indexOf('нет инструктажей и проверок знаний за год') !== -1,
            'пустое состояние');
        assertTrue(fn.indexOf('WorkSchedule.onEmpAddInstruction(') !== -1,
            'кнопка «+ Инструктаж…»');
        assertTrue(fn.indexOf('ws-emp-addins') !== -1,
            'класс-маркер кнопки');
    });

    test('возврат карточки: ПЯТЬ блоков / попап с инструктажами', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf('[b1, b2, b3, b4, b5]') !== -1,
            'asBlocks — массив из 5 блоков');
        assertTrue(fn.indexOf('(b1 + b2 + b3 + b5)') !== -1,
            'попап — профиль+отпуска+мероприятия+инструктажи (без СИЗ)');
    });

    test('панели: Task 406 — мероприятия в 1-ю колонку, инструктажи — 2-я, СИЗ — 3-я', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCardPanels'));
        // bi<3 → colMain (профиль+отпуска+мероприятия), bi===4 →
        // colInstr, else → colPpe (СИЗ) — Task 406
        assertTrue(fn.indexOf('if (bi < 3) colMain += panel;') !== -1 &&
                   fn.indexOf('else if (bi === 4) colInstr += panel;') !== -1,
            'раскладка 5 блоков: мероприятия — под отпусками, инструктажи — 2-я, СИЗ — 3-я');
    });

    test('CSS: перенос длинного заголовка блока', () => {
        const i = INDEX_SRC.indexOf('.ws-wcard .ws-whead-t.ws-whead-wrap {');
        assertTrue(i !== -1, 'правило .ws-whead-wrap существует');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(block.indexOf('white-space: normal') !== -1 &&
                   block.indexOf('overflow: visible') !== -1,
            'заголовок блока переносится, а не эллипсится');
        assertTrue(INDEX_SRC.indexOf('ws-whead-t ws-whead-wrap') !== -1,
            'класс применён в заголовке блока инструктажей');
    });

    test('форма: prefillType — режим/тип по умолчанию из кнопки входа', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'openTrainingForm'));
        assertTrue(fn.indexOf('editTraining, prefillType') !== -1,
            '4-й аргумент prefillType');
        // Task 410: instr-типы → instr-режим (select «Список_И_и_ПЗ»),
        // мероприятие — обучение/прогул/примечание, фолбэк «обучение»
        assertTrue(fn.indexOf('this._trInstrMode = this._isInstrType(preTip);') !== -1,
            'instr-режим из prefillType (Task 410)');
        assertTrue(fn.indexOf("preTip === 'обучение'") !== -1,
            'валидация переданного типа мероприятия');
        const addTr = stripComments(methodText(INDEX_SRC, 'onEmpAddTraining'));
        assertTrue(addTr.indexOf("'обучение'") !== -1,
            '«+ Мероприятие…» — дефолт «обучение»');
        const addIns = stripComments(methodText(INDEX_SRC, 'onEmpAddInstruction'));
        assertTrue(addIns.indexOf("'инструктаж'") !== -1,
            '«+ Инструктаж…» — дефолт «инструктаж»');
    });
});

// ============================================================
// 3. VM — карточка: блоки по типам записей
// ============================================================
describe('Task 405 — VM: карточка и сводка', () => {

    const EMP = [
        { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
          'смена': '', 'должность': 'Слесарь КИПиА 5 разряд', 'комментарий': '',
          'группа_допуска': 'IV', 'дата_приёма': '2024-03-15' },
    ];
    const TRAININGS = [
        { id: 5, 'таб_номер': '2706', 'тип': 'инструктаж',
          'тема': 'Повторный инструктаж по ОТ', 'дата_начала': '2026-02-10',
          'дата_окончания': '2026-02-10' },
        { id: 6, 'таб_номер': '2706', 'тип': 'проверка_знаний',
          'тема': 'Проверка знаний ПТЭ', 'дата_начала': '2026-06-15',
          'дата_окончания': '2026-06-15' },
        { id: 7, 'таб_номер': '2706', 'тип': 'обучение',
          'тема': 'Курс по АСУ ТП', 'дата_начала': '2026-03-02',
          'дата_окончания': '2026-03-05' },
        { id: 8, 'таб_номер': '2706', 'тип': 'примечание',
          'тема': 'Отметка о медосмотре', 'дата_начала': '2026-01-20',
          'дата_окончания': '2026-01-20' },
    ];

    function cardHost(withEdit) {
        return new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
            methodText(INDEX_SRC, '_lastExam1000Date') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            '_canEdit: ' + (withEdit ? 'true' : 'false') + ', _year: 2026, _month: 8,' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_VACATIONS: [],' +
            '_TRAININGS: ' + JSON.stringify(TRAININGS) + ',' +
            '_PPE: [],' +
            '_fmtDateRu: function(d) { d = String(d);' +
            '  var p = d.split("-"); return p.length === 3 ?' +
            '  p[2] + "." + p[1] + "." + p[0] : d; },' +
            '_esc: function(s) { return String(s); },' +
            '_escAttr: function(s) { return String(s); },' +
            '_trainingCodeOf: function(t) {' +
            '  return t === "инструктаж" ? "И" : t === "проверка_знаний" ? "ПЗ" :' +
            '         t === "обучение" ? "ОБ" : "*"; },' +
            '_statusMeta: function(c) { return {}; },' +
            '_vacDaysInYear: function(v, y) { return 0; },' +
            '_vacNetDaysInYear: function(v, y) { return 0; },' +
            '_plural: function(n, f) { return f[2]; }' +
            '});')(mockDoc({}));
    }

    test('блок «Мероприятия» — только обучение/примечание (без инструктажей)', () => {
        const host = cardHost(true);
        const blocks = host._renderWorkerCard('2706', true, true);
        assertEqual(blocks.length, 5, 'ПЯТЬ блоков (Task 405)');
        const b3 = blocks[2];
        assertTrue(b3.indexOf('Мероприятия · 2026') !== -1, 'заголовок блока 3');
        assertTrue(b3.indexOf('Курс по АСУ ТП') !== -1 &&
                   b3.indexOf('Отметка о медосмотре') !== -1,
            'обучение и примечание — в блоке мероприятий');
        assertTrue(b3.indexOf('Повторный инструктаж по ОТ') === -1 &&
                   b3.indexOf('Проверка знаний ПТЭ') === -1,
            'инструктажи/проверки — НЕ в блоке мероприятий');
    });

    test('блок «Повторные инструктажи…» — инструктаж/проверка_знаний', () => {
        const host = cardHost(true);
        const blocks = host._renderWorkerCard('2706', true, true);
        const b5 = blocks[4];
        assertTrue(b5.indexOf('Повторные инструктажи и периодическая проверка знаний · 2026') !== -1,
            'заголовок нового блока с годом');
        assertTrue(b5.indexOf('Повторный инструктаж по ОТ') !== -1 &&
                   b5.indexOf('Проверка знаний ПТЭ') !== -1,
            'инструктаж и проверка знаний — в новом блоке');
        assertTrue(b5.indexOf('Курс по АСУ ТП') === -1,
            'обучение — НЕ в блоке инструктажей');
        assertTrue(b5.indexOf('WorkSchedule.editTraining(5, 1)') !== -1 &&
                   b5.indexOf('WorkSchedule.deleteTraining(5, 1)') !== -1,
            'кнопки ✎/✕ у записей + семейство инструктажей (Task 427)');
        assertTrue(b5.indexOf('WorkSchedule.onEmpAddInstruction(\u00272706\u0027)') !== -1,
            'кнопка «+ Инструктаж…» с таб. № работника');
    });

    test('зритель (withEdit=false): кнопок нет, блоки есть', () => {
        const host = cardHost(false);
        const blocks = host._renderWorkerCard('2706', false, true);
        assertEqual(blocks.length, 5, 'пять блоков и у зрителя');
        const b5 = blocks[4];
        assertTrue(b5.indexOf('Повторный инструктаж по ОТ') !== -1,
            'записи видны');
        assertTrue(b5.indexOf('editTraining') === -1 &&
                   b5.indexOf('onEmpAddInstruction') === -1,
            'кнопок правки/добавления нет');
    });

    test('попап (не asBlocks): b5 после мероприятий, без СИЗ', () => {
        const host = cardHost(false);
        const html = host._renderWorkerCard('2706', false, false);
        const iEv = html.indexOf('Мероприятия · 2026');
        const iIns = html.indexOf('Повторные инструктажи и периодическая проверка знаний · 2026');
        assertTrue(iEv !== -1 && iIns !== -1 && iEv < iIns,
            'попап: мероприятия, затем инструктажи');
        assertTrue(html.indexOf('СИЗ · средства') === -1,
            'попап без СИЗ (Task 403 — регресс)');
    });

    test('_isInstrType: толерантность к регистру/пробелам', () => {
        const host = cardHost(false);
        assertTrue(host._isInstrType('инструктаж') === true, 'инструктаж');
        assertTrue(host._isInstrType('Инструктаж') === true, 'Инструктаж (регистр)');
        assertTrue(host._isInstrType('проверка_знаний') === true, 'проверка_знаний');
        assertTrue(host._isInstrType('Проверка знаний') === true, 'пробел вместо _');
        assertTrue(host._isInstrType('обучение') === false, 'обучение — не инструктаж');
        assertTrue(host._isInstrType('примечание') === false, 'примечание — не инструктаж');
        assertTrue(host._isInstrType('прогул') === false, 'прогул — не инструктаж');
        assertTrue(host._isInstrType('') === false, 'пустой тип');
        assertTrue(host._isInstrType(undefined) === false, 'нет типа');
    });

    test('«Общая» сводка: колонки года удалены; группа допуска с датой (Task 445)', () => {
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_renderWorkersGeneral') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            methodText(INDEX_SRC, '_isMasterKipia') + ',\n' +
            methodText(INDEX_SRC, '_lastExam1000Date') + ',\n' +
            '_year: 2026,' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_TRAININGS: ' + JSON.stringify(TRAININGS) + ',' +
            '_esc: function(s) { return String(s); },' +
            '_escAttr: function(s) { return String(s); },' +
            '_plural: function(n, f) { return f[2]; },' +
            '_fmtDateRu: function(d) { d = String(d);' +
            '  var p = d.split("-"); return p.length === 3 ?' +
            '  p[2] + "." + p[1] + "." + p[0] : d; },' +
            '_vacNetDaysInYear: function(v, y) { return 14; }' +
            '});')(mockDoc({}));
        const html = host._renderWorkersGeneral(EMP.slice());
        // Task 445: колонки «Мероприятия · год»/«Инструктажи · год» УДАЛЕНЫ
        assertTrue(html.indexOf('<th>Мероприятия · 2026</th>') === -1,
            'колонки «Мероприятия · 2026» больше нет (Task 445)');
        assertTrue(html.indexOf('<th>Инструктажи · 2026</th>') === -1,
            'колонки «Инструктажи · 2026» больше нет (Task 445)');
        // Task 445: группа допуска — со датой последней проверки до 1000 В
        // (Галкин: IV; TRAININGS-фикстура не содержит выполненных
        // проверок «до 1000 В» — дата не подставляется)
        const iG = html.indexOf('Галкин Д. Н.');
        const iGRow = html.lastIndexOf('<tr>', iG);
        const row = html.slice(iGRow, html.indexOf('</tr>', iGRow));
        assertTrue(row.indexOf('<td>IV</td>') !== -1,
            'ячейка группы — только знак (нет выполненной проверки до 1000 В)');
        assertEqual((row.match(/<td/g) || []).length, 6,
            'строка — 6 ячеек (Task 445)');
    });
});

// ============================================================
// 4. GAS-VM — сервер: объединение листов, маршрутизация, перенос
// ============================================================
describe('Task 405 — GAS-VM: сервер (моки листов)', () => {

    class MockSheet {
        constructor(rows) { this.rows = rows || []; this.fmtCalls = []; }
        getLastRow() { return this.rows.length; }
        getRange(row, col, numRows, numCols) {
            numRows = numRows || 1; numCols = numCols || 1;
            const self = this;
            return {
                getValues() {
                    const out = [];
                    for (let r = row; r < row + numRows; r++) {
                        const line = [];
                        for (let c = col; c < col + numCols; c++) {
                            const rr = self.rows[r - 1];
                            line.push(rr ? (rr[c - 1] === undefined ? '' : rr[c - 1]) : '');
                        }
                        out.push(line);
                    }
                    return out;
                },
                setValues(vals) {
                    for (let i = 0; i < vals.length; i++) {
                        const r = row + i;
                        while (self.rows.length < r) self.rows.push([]);
                        for (let c = 0; c < vals[i].length; c++) {
                            self.rows[r - 1][col - 1 + c] = vals[i][c];
                        }
                    }
                },
                setValue(v) {
                    while (self.rows.length < row) self.rows.push([]);
                    self.rows[row - 1][col - 1] = v;
                },
                setNumberFormat(fmt) {
                    self.fmtCalls.push({ row, col, fmt });
                },
                setFontWeight() { return this; },
                setBackground() { return this; },
                setFontColor() { return this; }
            };
        }
        deleteRow(r) { this.rows.splice(r - 1, 1); }
        setFrozenRows() {}
    }

    const MOCK_UTILS = {
        findSessionByToken: () => ({ user_id: 1 }),
        findUserById: () => ({ role: 'Админ', email: 'test@example.com' }),
        audit: () => {}
    };

    function loadWS(sheets, insertSheetImpl) {
        const ss = {
            getSheetByName: (n) => sheets[n] || null,
            insertSheet: insertSheetImpl || ((name) => {
                const s = new MockSheet([]);
                sheets[name] = s;
                return s;
            })
        };
        const SpreadsheetApp = { openById: () => ss };
        const factory = new Function('SpreadsheetApp', 'Utils', 'Logger',
            WS_SRC + '\nreturn WorkSchedule;');
        return factory(SpreadsheetApp, MOCK_UTILS, { log: () => {} });
    }

    function baseSheets() {
        return {
            'Инструктажи': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_начала',
                 'дата_окончания', 'длительность_дней', 'комментарий'],
                [1, '017', 'инструктаж', 'Инструктаж по ОТ',
                 new Date(2026, 7, 10), new Date(2026, 7, 10), 1, ''],
                [2, '017', 'обучение', 'Обучение по ПБ',
                 new Date(2026, 7, 12), new Date(2026, 7, 12), 1, ''],
                [3, '023', 'примечание', 'Отметка',
                 new Date(2026, 7, 14), new Date(2026, 7, 14), 1, ''],
                [4, '017', 'проверка_знаний', 'Проверка знаний',
                 new Date(2026, 7, 20), new Date(2026, 7, 20), 1, '']
            ]),
            'Мероприятия': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_начала',
                 'дата_окончания', 'длительность_дней', 'комментарий'],
                [10, '017', 'обучение', 'Курс АСУ ТП',
                 new Date(2026, 7, 5), new Date(2026, 7, 5), 1, 'внешний курс']
            ])
        };
    }

    test('listTrainings: ОБЪЕДИНЁННЫЙ список двух листов', () => {
        const sheets = baseSheets();
        const WS = loadWS(sheets);
        const r = WS.listTrainings({ token: 't', year: 2026, month: 8 });
        assertTrue(r.ok, 'ok');
        assertEqual(r.data.trainings.length, 5,
            '4 строки «Инструктажей» + 1 строка «Мероприятий»');
        const ids = r.data.trainings.map((t) => t.id).sort((a, b) => a - b);
        assertEqual(ids.join(','), '1,2,3,4,10', 'все id двух листов');
        const ext = r.data.trainings.filter((t) => t.id === 10)[0];
        assertEqual(ext.тема, 'Курс АСУ ТП', 'запись листа «Мероприятия» прочитана');
        assertEqual(ext.комментарий, 'внешний курс', 'комментарий прочитан');
    });

    test('listTrainings: листа «Мероприятия» нет — только «Инструктажи»', () => {
        const sheets = baseSheets();
        delete sheets['Мероприятия'];
        const WS = loadWS(sheets);
        const r = WS.listTrainings({ token: 't', year: 2026, month: 8 });
        assertTrue(r.ok, 'ok (лист отсутствует — не ошибка)');
        assertEqual(r.data.trainings.length, 4, 'только «Инструктажи»');
    });

    test('addTraining: инструктаж → «Инструктажи», обучение → «Мероприятия»', () => {
        const sheets = baseSheets();
        const WS = loadWS(sheets);
        const r1 = WS.addTraining({ token: 't', 'таб_номер': '017',
            тип: 'инструктаж', тема: 'Новый повторный', дата_начала: '2026-08-25' });
        assertTrue(r1.ok && r1.data.id === 5,
            'id 5 = max «Инструктажей» (4) + 1 — СВОЯ последовательность листа (Task 427)');
        assertEqual(sheets['Инструктажи'].rows.length, 6,
            'строка добавлена в «Инструктажи» (5+1)');
        assertEqual(sheets['Инструктажи'].rows[5][2], 'инструктаж', 'тип в «Инструктажах»');
        assertEqual(sheets['Мероприятия'].rows.length, 2, '«Мероприятия» не тронуты');

        const r2 = WS.addTraining({ token: 't', 'таб_номер': '017',
            тип: 'обучение', тема: 'Новый курс', дата_начала: '2026-08-26' });
        assertTrue(r2.ok && r2.data.id === 11,
            'id 11 = max «Мероприятий» (10) + 1 — СВОЯ последовательность (Task 427: id «Инструктажей» не мешает)');
        assertEqual(sheets['Мероприятия'].rows.length, 3,
            'строка добавлена в «Мероприятия» (2+1)');
        assertEqual(sheets['Мероприятия'].rows[2][2], 'обучение', 'тип в «Мероприятиях»');
        assertEqual(sheets['Инструктажи'].rows.length, 6, '«Инструктажи» не тронуты');
    });

    test('addTraining: листа «Мероприятия» нет — создаётся', () => {
        const sheets = baseSheets();
        delete sheets['Мероприятия'];
        const WS = loadWS(sheets);
        const r = WS.addTraining({ token: 't', 'таб_номер': '017',
            тип: 'обучение', тема: 'Первое мероприятие', дата_начала: '2026-08-27' });
        assertTrue(r.ok, 'ok');
        assertTrue(!!sheets['Мероприятия'], 'лист «Мероприятия» создан');
        assertEqual(sheets['Мероприятия'].rows.length, 2,
            'заголовок + 1 строка данных');
        assertEqual(sheets['Мероприятия'].rows[1][3], 'Первое мероприятие',
            'данные записаны');
    });

    test('deleteTraining: id ищется в обоих листах', () => {
        const sheets = baseSheets();
        const WS = loadWS(sheets);
        const r1 = WS.deleteTraining({ token: 't', id: 10 });
        assertTrue(r1.ok, 'id из «Мероприятий» удалён');
        assertEqual(sheets['Мероприятия'].rows.length, 1, 'осталась только шапка');
        const r2 = WS.deleteTraining({ token: 't', id: 2 });
        assertTrue(r2.ok, 'id из «Инструктажей» удалён');
        assertEqual(sheets['Инструктажи'].rows.length, 4, '5 строк − 1');
        const r3 = WS.deleteTraining({ token: 't', id: 999 });
        assertFalse(r3.ok, 'несуществующий id — not_found');
    });

    test('splitTrainingsSheet: перенос обучение/прогул/примечание + идемпотентность', () => {
        const sheets = baseSheets();
        // строка-житель «Инструктажей» с неизвестным типом — не переносится
        sheets['Инструктажи'].rows.push(
            [5, '023', 'наряд-допуск', 'Что-то ещё',
             new Date(2026, 7, 22), new Date(2026, 7, 22), 1, '']);
        const WS = loadWS(sheets);
        const r = WS.splitTrainingsSheet();
        assertTrue(r.ok, 'ok');
        assertEqual(r.moved, 2, 'перенесены обучение (id 2) и примечание (id 3)');
        assertEqual(sheets['Мероприятия'].rows.length, 4,
            'шапка + 1 + 2 перенесённых');
        assertEqual(sheets['Инструктажи'].rows.length, 4,
            'шапка + инструктаж + проверка_знаний + неизвестный тип');
        assertEqual(sheets['Инструктажи'].rows[1][2], 'инструктаж',
            'инструктаж остался');
        assertEqual(sheets['Инструктажи'].rows[2][2], 'проверка_знаний',
            'проверка знаний осталась');
        const movedIds = [sheets['Мероприятия'].rows[2][0],
                         sheets['Мероприятия'].rows[3][0]].sort((a, b) => a - b);
        assertEqual(movedIds.join(','), '2,3', 'id при переносе сохранены');
        // идемпотентность
        const r2 = WS.splitTrainingsSheet();
        assertTrue(r2.ok && r2.moved === 0, 'повторный запуск — moved: 0');
        assertEqual(sheets['Инструктажи'].rows.length, 4, 'строки на месте');
        assertEqual(sheets['Мероприятия'].rows.length, 4, 'дубликатов нет');
    });

    test('splitTrainingsSheet: создаёт лист «Мероприятия» с заголовками «Инструктажей»', () => {
        const sheets = baseSheets();
        delete sheets['Мероприятия'];
        const WS = loadWS(sheets);
        const r = WS.splitTrainingsSheet();
        assertTrue(r.ok, 'ok');
        assertEqual(r.moved, 2, 'обучение + примечание перенесены');
        assertEqual(sheets['Мероприятия'].rows[0][1], 'таб_номер',
            'заголовки скопированы из «Инструктажей»');
        assertEqual(sheets['Инструктажи'].rows.length, 3,
            'шапка + инструктаж + проверка (обучение и примечание ушли)');
    });
});

// ============================================================
// 5. SW — версия кэша
// ============================================================
describe('Task 405 — SW: версия кэша', () => {
    test('CACHE_VERSION = kipia-test-v759', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v759'") !== -1,
            'SW v632 (Task 405)');
        assertTrue(SW_SRC.indexOf('kipia-test-v760') === -1,
            'двойной бамп отсутствует');
    });
});
