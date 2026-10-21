// ============================================================
// Task 419 — заявка: «У инструктажа по инструкции 9-ОГЭ есть
// особенность формирования даты проведения, период 3 месяца, но
// инструктаж по этой инструкции включён в Повторный инструктаж по
// рабочим инструкциям ОТ, который проводится с периодичностью 6
// месяцев, следовательно после проведения повторного инструктажа по
// рабочим инструкциям ОТ, подразумевается, что инструктаж по
// инструкции 9-ОГЭ тоже пройден, поэтому при проведении повторного
// инструктажа по рабочим инструкциям ОТ, фиксируется только он, а по
// 9-ОГЭ уже какбы входит в его состав. Поэтому через 3 месяца после
// даты проведения повторного инструктажа по рабочим инструкциям ОТ
// должен проводится инструктаж только по 9-ОГЭ, а ещё после 3
// месяцев сново общий инструктаж по всем инструкциям ОТ, включая
// 9-ОГЭ, и так по кругу из года в год. Так же необходимо, что бы при
// отметки проведения инструктажей или проверки знаний, автоматически
// формировалась новая запись в таблице "Инструктажи" с новым сроком
// проведения, в зависимости от периодичности в таблице
// "Список_И_и_ПЗ"».
//
// 1) СЕРВЕР (WorkSchedule.gs):
//    - «в составе» — столбец «Списка_И_и_ПЗ» (заголовки-синонимы) +
//      ВСТРОЕННАЯ связь 9-ОГЭ → общий (INSTR_DEFAULT_PARENT,
//      применяется при пустом столбце);
//    - _normKey/_addMonthsDate/_instrTypeOfItem — хелперы;
//    - setTrainingDone (выполнение=1) → _autoCreateNextTrainings:
//      (1) новый срок отмеченного пункта дата+N (окно (дата; дата+N]
//      свободно от записей пункта И родителя); (2) дети — записи на
//      дата+N(ребёнка) (общий → 9-ОГЭ через 3 мес + следующий общий
//      через 6 мес — чередование «по кругу»); (3) ПОКРЫТИЕ:
//      незавершённые записи детей с датой <= даты родителя
//      отмечаются выполненными (updated);
//      ⚠ Task 421: (1) — только для пунктов БЕЗ «в составе»;
//      отметка ребёнка (9-ОГЭ) ничего не создаёт — фиксация;
//    - created/updated — в ответе эндпоинта (клиент — в пулы без
//      перезагрузки);
//    - instrListInit: заголовок F «в составе» + связь 9-ОГЭ в пустую
//      F3 (данные E/F не затираются).
// 2) КЛИЕНТ (index.html): toggleTrainingDone — created →
//    _INSTR_ALL/_TRAININGS (год табеля), updated — отметки по id,
//    тост с датами новых сроков; «след. срок» пункта-ребёнка — от
//    ПОСЛЕДНЕГО события (запись пункта ИЛИ родителя: после общего
//    9-ОГЭ = +3 мес); канон _INSTR_CANON несёт «в составе».
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

// ============================================================
// 1. SRC — сервер
// ============================================================
describe('Task 419 — SRC: сервер (WorkSchedule.gs)', () => {

    test('INSTR_DEFAULT_PARENT: встроенная связь 9-ОГЭ → общий', () => {
        assertTrue(WS_SRC.indexOf('INSTR_DEFAULT_PARENT') !== -1,
            'константа объявлена');
        const dp = WS_SRC.match(
            /INSTR_DEFAULT_PARENT:\s*\{\s*child:\s*'([^']+)',\s*parent:\s*'([^']+)'/);
        assertTrue(dp !== null, 'структура child/parent');
        assertEqual(dp[1], 'Повторный инструктаж по инструкции № 9-ОГЭ',
            'ребёнок — 9-ОГЭ');
        assertEqual(dp[2], 'Повторный инструктаж по рабочим инструкциям ОТ',
            'родитель — общий инструктаж');
    });

    test('_normKey: регистр/пробелы/«ё» не важны', () => {
        const fn = new Function('return ({' + methodText(WS_SRC, '_normKey') + '})._normKey;')();
        assertEqual(fn('Ёлка  ПО  Реке'), 'елка по реке', 'регистр+ё+пробелы');
        assertEqual(fn('  Повторный инструктаж № 9-ОГЭ '), 'повторный инструктаж № 9-огэ',
            'обрезка и регистр');
        assertEqual(fn(null), '', 'null → пусто');
        assertEqual(fn(undefined), '', 'undefined → пусто');
    });

    test('_addMonthsDate: кламп к концу месяца', () => {
        const fn = new Function('return ({' + methodText(WS_SRC, '_addMonthsDate') + '})._addMonthsDate;')();
        const iso = d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
        assertEqual(iso(fn(new Date(2026, 0, 31), 1)), '2026-2-28',
            '31.01 + 1 мес → 28.02 (2026 не високосный)');
        assertEqual(iso(fn(new Date(2026, 10, 30), 3)), '2027-2-28',
            '30.11 + 3 мес → 28.02');
        assertEqual(iso(fn(new Date(2026, 4, 15), 3)), '2026-8-15',
            '15.05 + 3 мес → 15.08');
        assertEqual(iso(fn(new Date(2025, 11, 31), 2)), '2026-2-28',
            '31.12 + 2 мес → 28.02');
        assertEqual(fn(new Date(2026, 4, 15), 0), null, '0 мес → null (разовый)');
        assertEqual(fn('не дата', 3), null, 'не Date → null');
    });

    test('_instrTypeOfItem: вид пункта → тип записи', () => {
        const fn = new Function('return ({' + methodText(WS_SRC, '_instrTypeOfItem') + '})._instrTypeOfItem;')();
        assertEqual(fn({ вид: 'проверка_знаний' }, 'инструктаж'), 'проверка_знаний',
            'вид пункта');
        assertEqual(fn({ вид: 'Инструктаж ' }, 'проверка_знаний'), 'инструктаж',
            'толерантно к написанию');
        assertEqual(fn({ вид: '' }, 'проверка_знаний'), 'проверка_знаний',
            'пустой вид → тип отмеченной записи');
        assertEqual(fn(null, 'инструктаж'), 'инструктаж', 'нет пункта → фолбэк');
    });

    test('_readInstrListSheet: столбец «в составе» + встроенная связь', () => {
        const fn = stripComments(methodText(WS_SRC, '_readInstrListSheet'));
        assertTrue(fn.indexOf("'в составе', 'входит в', 'включён в', 'включен в'") !== -1,
            'заголовки-синонимы столбца');
        assertTrue(fn.indexOf("'в составе':") !== -1,
            'пункты несут поле «в составе»');
        assertTrue(fn.indexOf('INSTR_DEFAULT_PARENT') !== -1,
            'встроенная связь применяется при пустом столбце');
    });

    test('setTrainingDone: автосоздание при отметке выполнения', () => {
        const fn = stripComments(methodText(WS_SRC, 'setTrainingDone'));
        assertTrue(fn.indexOf('if (done === 1)') !== -1,
            'автосоздание ТОЛЬКО при отметке (1), не при снятии');
        assertTrue(fn.indexOf('this._autoCreateNextTrainings(sheet, rowData)') !== -1,
            'вызов автосоздания со строкой записи');
        assertTrue(fn.indexOf('created: created') !== -1 &&
                    fn.indexOf('updated: updated') !== -1,
            'ответ несёт created/updated — клиент обновляет пулы');
        assertTrue(fn.indexOf('WORKSCHEDULE_TRAINING_AUTOCREATE_ERROR') !== -1,
            'ошибка автосоздания НЕ ломает отметку (try/catch + аудит)');
    });

    test('_autoCreateNextTrainings: правила окон и покрытия', () => {
        const fn = stripComments(methodText(WS_SRC, '_autoCreateNextTrainings'));
        // (1) окно (дата; дата + N] — открытый старт, закрытый конец
        assertTrue(fn.indexOf('rd.getTime() > winStart.getTime()') !== -1 &&
                    fn.indexOf('rd.getTime() <= winEnd.getTime()') !== -1,
            'окно строго (дата; дата + N]');
        // родитель в окне → отдельная запись ребёнка не нужна
        assertTrue(fn.indexOf('parentKey && hasInWindow(parentKey') !== -1,
            'запись родителя в окне покрывает пункт');
        // (2) дети — дата родителя + N(ребёнка); Task 420: нестрогое
        // сравнение (сигнатуры) вместо точного ключа
        assertTrue(fn.indexOf("this._sameInstrName(items[j]['в составе'], tema)") !== -1,
            'дети = пункты со «в составе» = отмеченный (нестрого)');
        // (3) покрытие: дата ребёнка <= даты родителя, выполнение = 0
        assertTrue(fn.indexOf('cd.getTime() > provDate.getTime()') !== -1 &&
                    fn.indexOf('parseInt(cv[5], 10) === 1') !== -1,
            'покрытие незавершённых записей детей');
        assertTrue(fn.indexOf('_readInstrListSheet()') !== -1,
            'периодичность — из «Списка_И_и_ПЗ»');
        assertTrue(fn.indexOf('this._maxTrainingsId(sheet)') !== -1,
            'id — нумерация ТОЛЬКО листа «Инструктажей» (Task 427: раздельная)');
        assertTrue(fn.indexOf('this._maxTrainingsId(this._getSheet(this.EVENTS_SHEET))') === -1,
            'кросс-максимум «Мероприятий» удалён (заявка Task 427)');
    });

    test('_appendTrainingRow: строка done-формата + запись в снимок', () => {
        const fn = stripComments(methodText(WS_SRC, '_appendTrainingRow'));
        assertTrue(fn.indexOf('this._appendRowKeepText(sheet,') !== -1 &&
                    fn.indexOf("[2]") !== -1,
            'запись через _appendRowKeepText (таб_номер — текст)');
        assertTrue(fn.indexOf("'дата_проведения':") !== -1 &&
                    fn.indexOf("'выполнение':") !== -1 &&
                    fn.indexOf("'просрочен':") !== -1,
            'запись в форме _readTrainingsSheet (клиент — в пулы)');
        assertTrue(fn.indexOf('values.push(') !== -1,
            'строка дописывается в снимок листа (повторные окна видят)');
    });

    test('instrListInit: заголовок F «в составе», связь 9-ОГЭ в пустую F3', () => {
        const fn = stripComments(methodText(WS_SRC, 'instrListInit'));
        assertTrue(fn.indexOf("'сокращение', 'в составе'") !== -1,
            'шесть заголовков A..F');
        assertEqual((fn.match(/dataCols = 4;/g) || []).length > 0, true,
            'эталонные строки — по-прежнему A..D');
        assertTrue(fn.indexOf('getRange(3, 6).getValue()') !== -1 &&
                    fn.indexOf('getRange(3, 6).setValue(') !== -1,
            'F3 читается и пишется');
        assertTrue(fn.indexOf("if (!String(f9 || '').trim())") !== -1,
            'запись ТОЛЬКО в пустую ячейку (пользовательское значение главнее)');
        assertTrue(fn.indexOf("'Повторный инструктаж по рабочим инструкциям ОТ'") !== -1,
            'значение связи — название родителя');
    });
});

// ============================================================
// 2. SRC — клиент
// ============================================================
describe('Task 419 — SRC: клиент (index.html)', () => {

    test('_INSTR_CANON: пункт 9-ОГЭ несёт «в составе»', () => {
        const canon = new Function('return ({' +
            INDEX_SRC.match(/_INSTR_CANON: \[([\s\S]*?)\],\n/s)[0] + '});')()._INSTR_CANON;
        const og = canon.filter(function(x) {
            return x.название === 'Повторный инструктаж по инструкции № 9-ОГЭ';
        })[0];
        assertTrue(og && og['в составе'] === 'Повторный инструктаж по рабочим инструкциям ОТ',
            'связь 9-ОГЭ → общий во встроенном эталоне');
    });

    test('_normalizeInstrList: канон сохраняет «в составе»', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_normalizeInstrList'));
        assertTrue(fn.indexOf("'в составе': x['в составе'] || ''") !== -1,
            'поле пробрасывается в фолбэк-копию канона');
    });

    test('toggleTrainingDone: created → пулы, updated — отметки, тост со сроками', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'toggleTrainingDone'));
        assertTrue(fn.indexOf('Array.isArray(d.created)') !== -1,
            'created из ответа сервера (старый сервер — пусто)');
        assertTrue(fn.indexOf('self._INSTR_ALL.push(nr)') !== -1,
            'новые записи — в архивный пул карточки');
        assertTrue(fn.indexOf('if (nY === curYear) self._TRAININGS.push(nr)') !== -1,
            'год даты = году табеля — и в годовой срез (бейджи/печать)');
        assertTrue(fn.indexOf('Array.isArray(d.updated)') !== -1,
            'updated — покрытые записи детей');
        assertTrue(fn.indexOf('новые сроки: ') !== -1,
            'тост перечисляет даты созданных записей');
        assertTrue(fn.indexOf("'Отметка о выполнении снята'") !== -1,
            'снятие отметки — прежний тост (записи не создаются)');
    });

    test('_renderInstrSection: «последний» — пункт ИЛИ родитель «в составе»', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderInstrSection'));
        assertTrue(fn.indexOf('relKeys = [gKey]') !== -1 &&
                    fn.indexOf("this._normInstrKey(gItem['в составе'])") !== -1,
            'родитель добавляется к ключам «последнего» события');
        // Task 420: сравнение записей с ключами — нестрогое
        assertTrue(fn.indexOf('_sigRel') !== -1 &&
                    fn.indexOf('liHit') !== -1,
            'тема сравнивается норм-ключом ИЛИ сигнатурой');
    });
});

// ============================================================
// 3. GAS-VM — сервер (моки листов)
// ============================================================
describe('Task 419 — GAS-VM: автосоздание новых сроков', () => {

    class MockSheet {
        constructor(rows) { this.rows = rows || []; this.writeCount = 0; }
        getLastRow() { return this.rows.length; }
        getLastColumn() {
            let m = 0;
            for (const r of this.rows) m = Math.max(m, r.length);
            return m || 1;
        }
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
                getValue() {
                    const rr = self.rows[row - 1];
                    return rr ? (rr[col - 1] === undefined ? '' : rr[col - 1]) : '';
                },
                setValues(vals) {
                    self.writeCount++;
                    for (let i = 0; i < vals.length; i++) {
                        const r = row + i;
                        while (self.rows.length < r) self.rows.push([]);
                        for (let c = 0; c < vals[i].length; c++) {
                            self.rows[r - 1][col - 1 + c] = vals[i][c];
                        }
                    }
                },
                setValue(v) {
                    self.writeCount++;
                    while (self.rows.length < row) self.rows.push([]);
                    self.rows[row - 1][col - 1] = v;
                },
                clearContent() {
                    self.writeCount++;
                    for (let r = row; r < row + numRows; r++) {
                        const rr = self.rows[r - 1];
                        if (!rr) continue;
                        for (let c = col; c < col + numCols; c++) rr[c - 1] = '';
                    }
                },
                setNumberFormat() { return this; },
                setFontWeight() { return this; },
                setBackground() { return this; },
                setFontColor() { return this; }
            };
        }
        deleteRow(r) { this.rows.splice(r - 1, 1); }
        setFrozenRows() { this.frozen = true; }
    }

    const MOCK_UTILS = {
        findSessionByToken: () => ({ user_id: 1 }),
        findUserById: () => ({ role: 'Админ', email: 'test@example.com' }),
        audit: () => {}
    };

    function loadWS(sheets) {
        const ss = {
            getSheetByName: (n) => sheets[n] || null,
            insertSheet: (name) => {
                const s = new MockSheet([]);
                sheets[name] = s;
                return s;
            }
        };
        const SpreadsheetApp = { openById: () => ss };
        const factory = new Function('SpreadsheetApp', 'Utils', 'Logger',
            WS_SRC + '\nreturn WorkSchedule;');
        return factory(SpreadsheetApp, MOCK_UTILS, { log: () => {} });
    }

    const T_COMMON = 'Повторный инструктаж по рабочим инструкциям ОТ';
    const T_OGE = 'Повторный инструктаж по инструкции № 9-ОГЭ';
    const T_PKZ = 'Периодическая проверка знаний на допуск к самостоятельной работе';

    // «Список_И_и_ПЗ» БЕЗ столбца «в составе» — встроенная связь 9-ОГЭ
    function listSheets() {
        return {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание', 'сокращение'],
                [T_COMMON, 'инструктаж', 6, '', 'раб. инстр. ОТ'],
                [T_OGE, 'инструктаж', 3, '', '9-ОГЭ'],
                [T_PKZ, 'проверка_знаний', 12, '', ''],
                ['Разовый вводный', 'инструктаж', '', '', '']
            ])
        };
    }

    function doneSheets(rows) {
        const s = listSheets();
        s['Инструктажи'] = new MockSheet([[
            'id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
            'выполнение', 'просрочен', 'комментарий'
        ]].concat(rows || []));
        return s;
    }

    test('встроенная связь 9-ОГЭ: _readInstrListSheet без столбца', () => {
        const WS = loadWS(listSheets());
        const list = WS._readInstrListSheet();
        const og = list.filter(x => x.название === T_OGE)[0];
        assertEqual(og['в составе'], T_COMMON,
            'пустого столбца нет — связь встроенная');
        const cm = list.filter(x => x.название === T_COMMON)[0];
        assertEqual(cm['в составе'], '', 'у родителя связи нет');
    });

    test('столбец «в составе» главнее встроенной связи (синоним «входит в»)', () => {
        const s = listSheets();
        s['Список_И_и_ПЗ'] = new MockSheet([
            ['название', 'вид', 'периодичность', 'основание', 'сокращение', 'входит в'],
            [T_COMMON, 'инструктаж', 6, '', '', ''],
            [T_OGE, 'инструктаж', 3, '', '', 'Другой пункт'],
            ['Другой пункт', 'инструктаж', 6, '', '', '']
        ]);
        const WS = loadWS(s);
        const list = WS._readInstrListSheet();
        const og = list.filter(x => x.название === T_OGE)[0];
        assertEqual(og['в составе'], 'Другой пункт',
            'заполненный столбец переопределяет встроенную связь');
    });

    test('отметка ОБЩЕГО: создаются 9-ОГЭ (+3 мес) и общий (+6 мес)', () => {
        const sheets = doneSheets([
            [20, '017', 'инструктаж', T_COMMON,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertTrue(r.ok, 'ok');
        assertEqual(r.data.выполнение, 1, 'отметка записана');
        assertEqual(r.data.created.length, 2, 'созданы ОБЕ записи');
        const ogNext = r.data.created.filter(x => x.тема === T_COMMON)[0];
        const ogChild = r.data.created.filter(x => x.тема === T_OGE)[0];
        assertEqual(ogNext.дата_проведения, '2027-03-01',
            'следующий общий: 01.09.2026 + 6 мес');
        assertEqual(ogChild.дата_проведения, '2026-12-01',
            'самостоятельный 9-ОГЭ: 01.09.2026 + 3 мес (заявка)');
        assertEqual(ogChild.выполнение, 0, 'новая запись — без отметки');
        assertEqual(ogChild.просрочен, 0, 'будущая дата — не просрочена');
        assertEqual(ogChild.длительность_дней, 1, 'однодневная (бейджи живы)');
        // строки в листе: +2, id — СВОЕЙ последовательности листа (Task 427)
        const t = sheets['Инструктажи'];
        assertEqual(t.rows.length, 4, '1 заголовок + 1 исходная + 2 новых');
        assertEqual(t.rows[2][0], 21, 'id первой новой строки');
        assertEqual(t.rows[3][0], 22, 'id второй новой строки');
        assertEqual(String(t.rows[2][1]), '017', 'таб_номер текстом');
    });

    test('отметка ОБЩЕГО дважды: дубликатов нет (окно занято)', () => {
        const sheets = doneSheets([
            [20, '017', 'инструктаж', T_COMMON,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        const r2 = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r2.data.created.length, 0,
            'повторная отметка ничего не создаёт');
        assertEqual(sheets['Инструктажи'].rows.length, 4,
            'строки не дублируются');
    });

    test('отметка 9-ОГЭ при будущем общем: записей нет (зависимый, Task 421)', () => {
        const sheets = doneSheets([
            // самостоятельный 9-ОГЭ за 3 мес до будущего общего
            [21, '017', 'инструктаж', T_OGE,
             new Date(2026, 8, 1), 0, 0, ''],
            // будущий общий (создан при прошлой отметке общего)
            [22, '017', 'инструктаж', T_COMMON,
             new Date(2026, 11, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 21, 'выполнение': 1 });
        assertEqual(r.data.created.length, 0,
            'зависимый пункт: автосоздания нет — цикл ведёт общий 01.12.2026');
        assertEqual(sheets['Инструктажи'].rows.length, 3,
            'новых строк нет — чередование 3/6 мес по кругу');
    });

    test('отметка 9-ОГЭ (зависимый пункт): НИЧЕГО не создаётся — только фиксация (Task 421)', () => {
        const sheets = doneSheets([
            [21, '017', 'инструктаж', T_OGE,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 21, 'выполнение': 1 });
        assertEqual(r.data.выполнение, 1, 'отметка выполнения записана');
        assertEqual(r.data.created.length, 0,
            'зависимый пункт ничего не создаёт (ЦИКЛ Task 420 удалён)');
        assertEqual(r.data.updated.length, 0, 'покрывать нечего');
        assertEqual(sheets['Инструктажи'].rows.length, 2,
            'новых строк нет — общий НЕ создаётся, даже когда его нет в окне');
        assertEqual(sheets['Инструктажи'].rows[1][5], 1,
            'F отмеченной строки = 1 (фиксация выполнения)');
        assertEqual(sheets['Инструктажи'].rows[1][6], 0,
            'G: выполненный — не просрочен');
    });

    test('отметка ПЗ (12 мес, без связи): создаётся одна запись +12 мес', () => {
        const sheets = doneSheets([
            [30, '023', 'проверка_знаний', T_PKZ,
             new Date(2026, 2, 10), 0, 1, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 30, 'выполнение': 1 });
        assertEqual(r.data.created.length, 1, 'новый срок проверки знаний');
        assertEqual(r.data.created[0].дата_проведения, '2027-03-10',
            '10.03.2026 + 12 мес');
        assertEqual(r.data.created[0].тип, 'проверка_знаний',
            'тип — из отмеченной записи');
    });

    test('тема вне «Списка_И_и_ПЗ»: ничего не создаётся', () => {
        const sheets = doneSheets([
            [40, '017', 'инструктаж', 'Вводный инструктаж на участке',
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 40, 'выполнение': 1 });
        assertEqual(r.data.created.length, 0, 'периодичности нет');
        assertEqual(r.data.updated.length, 0, 'покрывать нечего');
    });

    test('разовый пункт (периодичность пусто): записей нет', () => {
        const sheets = doneSheets([
            [41, '017', 'инструктаж', 'Разовый вводный',
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 41, 'выполнение': 1 });
        assertEqual(r.data.created.length, 0, 'разовый — срок не считается');
    });

    test('ПОКРЫТИЕ: незавершённый 9-ОГЭ до даты общего отмечается вместе с ним', () => {
        const sheets = doneSheets([
            // просроченный самостоятельный 9-ОГЭ (март, отметки нет)
            [15, '017', 'инструктаж', T_OGE,
             new Date(2026, 2, 1), 0, 1, ''],
            // общий, отмечается сейчас (сентябрь)
            [20, '017', 'инструктаж', T_COMMON,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r.data.updated.length, 1, 'запись 9-ОГЭ покрыта');
        assertEqual(r.data.updated[0].id, 15, 'id покрытой записи');
        assertEqual(r.data.updated[0].выполнение, 1, 'выполнение = 1');
        assertEqual(r.data.updated[0].просрочен, 0, 'покрыта → не просрочена');
        // лист: F у строки 15 = 1
        const row15 = sheets['Инструктажи'].rows[1];
        assertEqual(row15[5], 1, 'столбец F листа = 1');
        // и созданы следующие сроки (9-ОГЭ +3, общий +6)
        assertEqual(r.data.created.length, 2, 'новые сроки созданы');
    });

    test('покрытие НЕ трогает будущие записи детей и чужих работников', () => {
        const sheets = doneSheets([
            // будущий 9-ОГЭ другого работника — вне покрытия
            [16, '023', 'инструктаж', T_OGE,
             new Date(2026, 11, 1), 0, 0, ''],
            [20, '017', 'инструктаж', T_COMMON,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        const u16 = r.data.updated.filter(u => u.id === 16)[0];
        assertFalse(!!u16, 'будущая запись другого работника не тронута');
        const t16 = sheets['Инструктажи'].rows[1];
        assertEqual(t16[5], 0, 'F записи 16 не менялась');
    });

    test('снятие отметки: ничего не создаётся и не удаляется', () => {
        const sheets = doneSheets([
            [20, '017', 'инструктаж', T_COMMON,
             new Date(2026, 8, 1), 1, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 0 });
        assertEqual(r.data.выполнение, 0, 'отметка снята');
        assertEqual(r.data.created.length, 0, 'создания нет');
        assertEqual(r.data.updated.length, 0, 'покрытия нет');
        assertEqual(sheets['Инструктажи'].rows.length, 2,
            'лист не изменился');
    });

    test('кламп конца месяца: общий 30.11 → 9-ОГЭ 28.02 (правило 2)', () => {
        const sheets = doneSheets([
            [21, '017', 'инструктаж', T_COMMON,
             new Date(2026, 10, 30), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 21, 'выполнение': 1 });
        assertEqual(r.data.created.length, 2, 'созданы обе записи');
        const ogChild = r.data.created.filter(x => x.тема === T_OGE)[0];
        assertEqual(ogChild.дата_проведения, '2027-02-28',
            '30.11.2026 + 3 мес → 28.02.2027 (кламп конца месяца)');
        const otNext = r.data.created.filter(x => x.тема === T_COMMON)[0];
        assertEqual(otNext.дата_проведения, '2027-05-30',
            '30.11.2026 + 6 мес → 30.05.2027');
    });

    test('просроченный новый срок: отметка старой записи даёт прошедшую дату', () => {
        const sheets = doneSheets([
            [30, '023', 'проверка_знаний', T_PKZ,
             new Date(2024, 2, 10), 0, 1, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 30, 'выполнение': 1 });
        // 10.03.2024 + 12 мес = 10.03.2025 — уже прошло → просрочен 1
        assertEqual(r.data.created[0].дата_проведения, '2025-03-10',
            'новый срок от даты записи');
        assertEqual(r.data.created[0].просрочен, 1,
            'прошедший срок без отметки → просрочен (виден в карточке)');
    });

    test('id РАЗДЕЛЬНЫЕ с «Мероприятиями» (Task 427)', () => {
        const sheets = doneSheets([
            [20, '017', 'инструктаж', T_COMMON,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        sheets['Мероприятия'] = new MockSheet([
            ['id', 'таб_номер', 'тип', 'тема', 'дата_начала',
             'дата_окончания', 'длительность_дней', 'комментарий'],
            [99, '017', 'обучение', 'Курс', new Date(2026, 7, 5),
             new Date(2026, 7, 5), 1, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r.data.created[0].id, 21,
            'id 21 = max «Инструктажей» (20) + 1 — max «Мероприятий» (99) НЕ мешает (Task 427)');
        assertEqual(r.data.created[1].id, 22,
            'id 22 — следующий в СВОЕЙ последовательности листа');
    });

    test('instrListInit: F3 — связь 9-ОГЭ (в пустую ячейку)', () => {
        const sheets = listSheets();
        sheets['Список_И_и_ПЗ'] = new MockSheet([[]]);
        const WS = loadWS(sheets);
        const r = WS.instrListInit();
        assertTrue(r.ok && r.rows === 5, 'эталон записан');
        const s = sheets['Список_И_и_ПЗ'];
        assertEqual(s.rows[0][5], 'в составе', 'заголовок F');
        assertEqual(s.rows[2][5], T_COMMON,
            'F3 (строка 9-ОГЭ) — название родителя');
        // повторный запуск: пользовательское значение F не затирается
        s.rows[2][5] = 'Своё значение';
        WS.instrListInit();
        assertEqual(s.rows[2][5], 'Своё значение',
            'пользовательская связь главнее эталонной');
    });
});

// ============================================================
// 4. VM — клиент: toggleTrainingDone (created/updated)
// ============================================================
describe('Task 419 — VM: toggleTrainingDone — новые сроки в пулы', () => {

    function loadToggle() {
        const m = extractMethod(INDEX_SRC, 'toggleTrainingDone');
        if (!m) throw new Error('toggleTrainingDone не найден');
        return new Function('return ({' + m + '}).toggleTrainingDone;')();
    }

    function isoToday() {
        const n = new Date();
        return n.getFullYear() + '-' +
            (n.getMonth() + 1 < 10 ? '0' + (n.getMonth() + 1) : String(n.getMonth() + 1)) +
            '-' + (n.getDate() < 10 ? '0' + n.getDate() : String(n.getDate()));
    }

    function makeCtx(rec, respData) {
        const ctx = {
            _canEdit: true,
            _isInstrType: function(тип) {
                var t = String(тип || '').trim().toLowerCase()
                           .replace(/\s+/g, '_');
                return t === 'инструктаж' || t === 'проверка_знаний';
            },
            _year: 2026,
            _TRAININGS: [],
            _INSTR_ALL: [rec],
            _EVENTS_ALL: [],
            __calls: { api: [], renders: 0 },
            _api: function(action, payload) {
                ctx.__calls.api.push({ action: action, payload: payload });
                return Promise.resolve({ data: respData });
            },
            _renderWorkersIfOpen: function() { ctx.__calls.renders++; },
            _isoDate: function() { return isoToday(); },
            _fmtDateRu: function(iso) {
                return String(iso || '').split('-').reverse().join('.');
            },
            _apiErrText: function(e) { return e && e.message; }
        };
        return ctx;
    }

    test('created: записи кладутся в _INSTR_ALL, год табеля — и в _TRAININGS', async () => {
        const rec = { id: 20, 'таб_номер': '017', тип: 'инструктаж',
                      тема: 'Повторный инструктаж по рабочим инструкциям ОТ',
                      дата_начала: '2026-09-01', выполнение: 0, просрочен: 0 };
        const ctx = makeCtx(rec, {
            id: 20, выполнение: 1, просрочен: 0,
            created: [
                { id: 21, 'таб_номер': '017', тип: 'инструктаж',
                  тема: 'Повторный инструктаж по инструкции № 9-ОГЭ',
                  дата_начала: '2026-12-01', дата_проведения: '2026-12-01',
                  выполнение: 0, просрочен: 0 },
                { id: 22, 'таб_номер': '017', тип: 'инструктаж',
                  тема: 'Повторный инструктаж по рабочим инструкциям ОТ',
                  дата_начала: '2027-03-01', дата_проведения: '2027-03-01',
                  выполнение: 0, просрочен: 0 }
            ],
            updated: []
        });
        await loadToggle().call(ctx, 20);
        assertEqual(ctx._INSTR_ALL.length, 3,
            '_INSTR_ALL: исходная + 2 новые (карточка без перезагрузки)');
        assertEqual(ctx._TRAININGS.length, 1,
            'год 2026 — только запись 9-ОГЭ 12/2026; общий 03/2027 вне среза');
        assertEqual(ctx._TRAININGS[0].id, 21, 'в срезе — 9-ОГЭ');
        assertEqual(ctx.__calls.renders, 1, 'карточка перерисована');
    });

    test('updated: покрытая запись ребёнка получает отметку по id', async () => {
        const rec = { id: 20, тип: 'инструктаж', выполнение: 0, просрочен: 0, дата_начала: '2026-09-01' };
        const child = { id: 15, тип: 'инструктаж', выполнение: 0, просрочен: 1, дата_начала: '2026-03-01' };
        const ctx = makeCtx(rec, {
            id: 20, выполнение: 1, просрочен: 0, created: [],
            updated: [{ id: 15, выполнение: 1, просрочен: 0 }]
        });
        ctx._INSTR_ALL.push(child);
        await loadToggle().call(ctx, 20);
        assertEqual(child.выполнение, 1, 'покрытая запись отмечена');
        assertEqual(child.просрочен, 0, 'просроченность снята');
    });

    test('тост перечисляет новые сроки', async () => {
        const rec = { id: 20, тип: 'инструктаж', выполнение: 0, просрочен: 0, дата_начала: '2026-09-01' };
        const ctx = makeCtx(rec, {
            id: 20, выполнение: 1, просрочен: 0, updated: [],
            created: [
                { id: 21, дата_начала: '2026-12-01' },
                { id: 22, дата_начала: '2027-03-01' }
            ]
        });
        let shown = null;
        global.KipToast = { show: function(t) { shown = t; } };
        try {
            await loadToggle().call(ctx, 20);
        } finally {
            delete global.KipToast;
        }
        assertTrue(shown !== null && shown.indexOf('новые сроки') !== -1,
            'тост о новых сроках: ' + shown);
        assertTrue(shown.indexOf('01.12.2026') !== -1 &&
                    shown.indexOf('01.03.2027') !== -1,
            'даты созданных записей в тосте');
    });

    test('старый сервер (нет created): тост + предупреждение Task 422, пулы не растут', async () => {
        const rec = { id: 5, тип: 'инструктаж', выполнение: 0, просрочен: 1, дата_начала: '2026-01-15' };
        const ctx = makeCtx(rec, { id: 5, выполнение: 1, просрочен: 0 });
        let shown = null;
        global.KipToast = { show: function(t) { shown = t; } };
        try {
            await loadToggle().call(ctx, 5);
        } finally {
            delete global.KipToast;
        }
        assertEqual(ctx._INSTR_ALL.length, 1, 'новых записей нет');
        // Task 422: старый Apps Script (нет srvVer) — к тосту
        // добавляется предупреждение (логика 419..421 не соответствует
        // репозиторию — «создался только общий» на живых данных)
        assertTrue(shown !== null &&
                    shown.indexOf('Отмечено выполнение') === 0,
            'тост начинается с фиксации: ' + shown);
        assertTrue(shown.indexOf('старой версии') !== -1,
            'предупреждение о старом сервере: ' + shown);
    });
});

// ============================================================
// 5. VM — клиент: «след. срок» пункта-ребёнка от родителя
// ============================================================
describe('Task 419 — VM: «след. срок» 9-ОГЭ от последнего события', () => {

    const T_COMMON = 'Повторный инструктаж по рабочим инструкциям ОТ';
    const T_OGE = 'Повторный инструктаж по инструкции № 9-ОГЭ';

    function loadSection() {
        // хост по образцу sectionHost теста 407: тонкие заглушки
        // вместо тяжёлых методов состояния
        return new Function('console', 'return ({' +
            methodText(INDEX_SRC, '_renderInstrSection') + ',' +
            methodText(INDEX_SRC, '_normInstrKey') + ',' +
            methodText(INDEX_SRC, '_normInstrKind') + ',' +
            methodText(INDEX_SRC, '_addMonthsIso') + ',' +
            methodText(INDEX_SRC, '_instrShortOf') + ',' +
            methodText(INDEX_SRC, '_fmtPeriodRu') + ',' +
            methodText(INDEX_SRC, '_isoDate') + ',' +
            methodText(INDEX_SRC, '_isInstrType') + ',' +
            '_fmtDateRu: function(d) { var p = String(d).split("-");' +
            '  return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(d); },' +
            '_esc: function(s) { return String(s); },' +
            '_trainingCodeOf: function(t) { return t === "проверка_знаний" ? "ПЗ" : "И"; },' +
            '_statusMeta: function(c) { return { code: c, color: "#123456", name: c }; },' +
            '_INSTR_LIST: [], _INSTR_ALL: []});')(function() {});
    }

    test('после общего инструктажа срок 9-ОГЭ = +3 мес (не от старой записи)', () => {
        const host = loadSection();
        host._INSTR_LIST = [
            { название: T_COMMON, вид: 'инструктаж', периодичность: 6, основание: '' },
            { название: T_OGE, вид: 'инструктаж', периодичность: 3, основание: '',
              'в составе': T_COMMON }
        ];
        // давний самостоятельный 9-ОГЭ (год назад) и НЕДАВНИЙ общий
        host._INSTR_ALL = [
            { id: 1, 'таб_номер': '017', тип: 'инструктаж', тема: T_OGE,
              дата_начала: '2025-06-01', дата_окончания: '2025-06-01' },
            { id: 2, 'таб_номер': '017', тип: 'инструктаж', тема: T_COMMON,
              дата_начала: '2026-09-01', дата_окончания: '2026-09-01' }
        ];
        const html = host._renderInstrSection([], '017', false, false,
            host._INSTR_LIST, 2026);
        // срок 9-ОГЭ: последний общий 01.09.2026 + 3 мес = 01.12.2026
        // (наивный расчёт от записи 9-ОГЭ дал бы 01.09.2025 — просрочено)
        assertTrue(html.indexOf('01.12.2026') !== -1,
            'след. срок 9-ОГЭ — от общего (+3 мес): 01.12.2026');
        const ogPart = html.slice(html.indexOf('9-ОГЭ'));
        assertTrue(ogPart.indexOf('01.12.2026') !== -1 &&
                    ogPart.indexOf('01.09.2025') === -1,
            'именно в группе 9-ОГЭ, без старой просроченной даты');
    });

    test('у пункта без «в составе» срок — от собственной записи', () => {
        const host = loadSection();
        host._INSTR_LIST = [
            { название: T_COMMON, вид: 'инструктаж', периодичность: 6, основание: '' },
            { название: T_OGE, вид: 'инструктаж', периодичность: 3, основание: '' }
        ];
        host._INSTR_ALL = [
            { id: 2, 'таб_номер': '017', тип: 'инструктаж', тема: T_COMMON,
              дата_начала: '2026-09-01', дата_окончания: '2026-09-01' }
        ];
        const html = host._renderInstrSection([], '017', false, false,
            host._INSTR_LIST, 2026);
        // нет связи — «последний» 9-ОГЭ = общий НЕ считается его событием:
        // группа скрыта (попап: пункты без записей не показываются)
        assertTrue(html.indexOf('9-ОГЭ') === -1,
            'без «в составе» записи родителя пункт не поглощает');
    });
});

// ============================================================
// 6. SW — версия кэша
// ============================================================
describe('Task 419 — SW: версия кэша', () => {
    test('CACHE_VERSION = kipia-test-v753', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v753'") !== -1,
            'SW v646 (Task 419)');
        assertTrue(SW_SRC.indexOf('kipia-test-v754') === -1,
            'двойной бамп отсутствует');
    });
});
