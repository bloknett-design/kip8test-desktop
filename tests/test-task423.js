// ============================================================
// Task 423 — заявка (kip8test): «9-ОГЭ создалось через 6 месяцев
// а не через 3».
//
// ДИАГНОЗ (правило 2 _autoCreateNextTrainings):
//   • запись ребёнка создаётся на «дата общего + период
//     9-ОГЭ из «Список_И_и_ПЗ»»; в живом листе пользователя в
//     строке 9-ОГЭ стоит «6» — скопировано с родителя (формулировка
//     заявки 419: «9-ОГЭ включён в Повторный инструктаж по рабочим
//     инструкциям ОТ (6 месяцев)»);
//   • встроенная связь Task 420 дефолтирует только ПУСТУЮ ячейку
//     («периодичность не задана» → 3); заполненная «6» побеждала
//     → 9-ОГЭ +6 мес. Все тесты 419..422 использовали период 3 или
//     пусто — вариант живого листа не покрывался.
//
// ФИКС:
//   • СЕРВЕР WorkSchedule.gs (_readInstrListSheet): эффективная
//     связь 9-ОГЭ — встроенный общий → период ребёнка = 3 мес
//     ЭТАЛОНА заявки 419 («период 3 месяца»), значение листа НЕ
//     главнее (как опечатки «в составе» в Task 420); связь на
//     ДРУГОЙ пункт листа — период из листа (не форсируем);
//     srvVer '423' (клиент отличает сервер до фикса);
//   • КЛИЕНТ index.html (_normalizeInstrList — дубль логики):
//     «след. срок» 9-ОГЭ = дата общего + 3 мес при любом значении
//     листа; toggleTrainingDone предупреждает о старом Apps
//     Script не только без srvVer, но и при srvVer < 423.
//
// ПРОВЕРКИ:
//   СЕРВЕР:
//   1) ГЛАВНЫЙ: живой лист с «6» у 9-ОГЭ (без «в составе» и с
//      разрешающимся столбцом) — отметка общего → 9-ОГЭ +3 мес,
//      общий +6 мес; autoNote несёт дату +3;
//   2) эталонный лист (период 3) и пустая ячейка — поведение
//      прежнее (регресс 419/420);
//   3) «в составе» на ДРУГОЙ пункт — период из листа (не форс);
//   4) «хвостовой» общий в окне (регресс 422) + период 6 в листе —
//      9-ОГЭ всё равно +3; общий +6 не дублируется;
//   5) регресс 421: отметка 9-ОГЭ — только фиксация; srvVer '423';
//   КЛИЕНТ:
//   6) _normalizeInstrList: «6» у 9-ОГЭ → 3 (связь с общим);
//      связь на другой пункт — период не тронут;
//   7) «след. срок» 9-ОГЭ = общий + 3 мес (не +6);
//   8) тост: сервер '422' → предупреждение «старой версии»
//      (srvVer < 423); '423' → без предупреждения;
//   9) SW kipia-test-v744.
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

function propArrayText(src, name) {
    const start = src.indexOf(name + ': [');
    if (start === -1) throw new Error('свойство не найдено: ' + name);
    const open = src.indexOf('[', start);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '[') depth++;
        else if (src[i] === ']') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    throw new Error('массив не закрыт: ' + name);
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// ============================================================
// 1. SRC — сервер
// ============================================================
describe('Task 423 — SRC: сервер (WorkSchedule.gs)', () => {

    test('форс периода 3 при связи 9-ОГЭ → общий (значение листа НЕ главнее)', () => {
        const fn = stripComments(methodText(WS_SRC, '_readInstrListSheet'));
        assertEqual(fn.split('периодичность = 3;').length - 1, 2,
            'два присвоения: форс при встроенной связи + прежний дефолт пустой');
        const guard = fn.indexOf(
            "String(out[childIdx]['в составе'] || '').trim(),");
        assertTrue(guard !== -1,
            'условие — эффективная связь ребёнка');
        const near = fn.slice(guard, guard + 400);
        assertTrue(near.indexOf('out[parentIdx].название') !== -1 &&
                   near.indexOf('периодичность = 3;') !== -1,
            'сравнение со встроенным родителем → период 3');
    });

    test('srvVer 427 — версия сервера в ответе', () => {
        const fn = stripComments(methodText(WS_SRC, 'setTrainingDone'));
        assertTrue(fn.indexOf("srvVer: '427'") !== -1,
            'клиент отличает сервер Task 427+ (раздельные последовательности id), Task 423+ (период 9-ОГЭ = 3 мес) и Task 426 (День шахтёра не праздник)');
    });

    test('регресс 421/422: правило (0) удалено, окно ребёнка — по себе', () => {
        const fn = stripComments(methodText(WS_SRC, '_autoCreateNextTrainings'));
        assertTrue(fn.indexOf('per > 0 && !parentItem') !== -1,
            'правило (1): только пункт БЕЗ «в составе»');
        assertTrue(fn.indexOf('parentItem && !children.length') === -1,
            'правило (0) ЦИКЛ Task 420 не вернулся');
        assertTrue(fn.indexOf('hasInWindow(ch.название, provDate, chDate)') !== -1,
            'Task 422: окно ребёнка проверяется по записям самого ребёнка');
    });
});

// ============================================================
// 2. SRC — клиент
// ============================================================
describe('Task 423 — SRC: клиент (index.html)', () => {

    test('_normalizeInstrList: период 9-ОГЭ при связи с общим = 3', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_normalizeInstrList'));
        assertEqual(fn.split('периодичность = 3;').length - 1, 2,
            'форс при связи + прежний дефолт пустой (дубль логики сервера)');
        const guard = fn.indexOf(
            "sameK(String(items[chI]['в составе'] || '')");
        assertTrue(guard !== -1 &&
                   fn.slice(guard, guard + 300)
                      .indexOf('items[pI].название') !== -1,
            'условие — эффективная связь со встроенным родителем');
    });

    test('toggleTrainingDone: предупреждение при srvVer < 427 (граница поднята Task 427)', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'toggleTrainingDone'));
        assertTrue(fn.indexOf('parseInt(d.srvVer, 10) < 427') !== -1,
            'сервер 426 и старше (сквозная нумерация id, период 9-ОГЭ из листа) — предупреждение; историческая граница 423 поглощена');
        assertTrue(fn.indexOf('!d.srvVer') !== -1,
            'совсем старый сервер (без поля) — тоже предупреждение');
    });
});

// ============================================================
// 3. GAS-VM — сервер (моки листов)
// ============================================================
describe('Task 423 — GAS-VM: «9-ОГЭ +6 вместо +3»', () => {

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
    const U_OT = 'Повторный инструктаж по рабочим инструкциям ОТ';
    const U_OGE = 'Инструктаж по инструкции 9-ОГЭ';
    const T_OTHER = 'Особый повторный инструктаж цеха';

    // живой лист заявки: у 9-ОГЭ период «6» — скопирован с родителя
    // («9-ОГЭ включён в Повторный инструктаж … (6 месяцев)»);
    // withColumn: false — столбца «в составе» нет; true — F = имя
    // родителя (разрешается — как ячейка F3 из instrListInit)
    function liveSixSheets(withColumn) {
        const headers = ['название', 'вид', 'периодичность',
                         'основание', 'сокращение'];
        const rows = [
            [U_OT, 'инструктаж', 6, '', 'Инстр. ОТ'],
            [U_OGE, 'инструктаж', 6, '', '9-ОГЭ'],
            [T_PKZ, 'проверка_знаний', 12, '', '']
        ];
        if (withColumn) {
            headers.push('в составе');
            rows[0].push('');
            rows[1].push(U_OT);
            rows[2].push('');
        }
        return {
            'Список_И_и_ПЗ': new MockSheet([headers].concat(rows))
        };
    }

    function etalonSheets() {
        return {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание', 'сокращение'],
                [T_COMMON, 'инструктаж', 6, '', 'раб. инстр. ОТ'],
                [T_OGE, 'инструктаж', 3, '', '9-ОГЭ'],
                [T_PKZ, 'проверка_знаний', 12, '', '']
            ])
        };
    }

    function withTrainings(listFn, rows) {
        const s = listFn();
        s['Инструктажи'] = new MockSheet([[
            'id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
            'выполнение', 'просрочен', 'комментарий'
        ]].concat(rows || []));
        return s;
    }

    test('ГЛАВНЫЙ ФИКС: «6» у 9-ОГЭ (без «в составе») → отметка общего: 9-ОГЭ +3, общий +6', () => {
        const sheets = withTrainings(() => liveSixSheets(false), [
            [20, '017', 'инструктаж', U_OT,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertTrue(r.ok, 'ok');
        assertEqual(r.data.srvVer, '427', 'версия сервера Task 427');
        assertEqual(r.data.created.length, 2, 'созданы ОБЕ записи');
        assertEqual(r.data.created.filter(x => x.тема === U_OGE)[0]
            .дата_проведения, '2026-12-01',
            '9-ОГЭ РОВНО через 3 месяца — НЕ через 6 (значение листа не главнее)');
        assertEqual(r.data.created.filter(x => x.тема === U_OT)[0]
            .дата_проведения, '2027-03-01', 'общий — через 6 месяцев');
        assertTrue(String(r.data.autoNote).indexOf('9-ОГЭ → 01.12.2026') !== -1,
            'разбор в autoNote несёт дату +3');
        assertEqual(r.data.skipped.length, 0, 'пропусков нет');
    });

    test('ГЛАВНЫЙ ФИКС: «6» у 9-ОГЭ + столбец «в составе» = родитель → всё равно +3', () => {
        const sheets = withTrainings(() => liveSixSheets(true), [
            [20, '017', 'инструктаж', U_OT,
             new Date(2026, 8, 16), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r.data.created.filter(x => x.тема === U_OGE)[0]
            .дата_проведения, '2026-12-16',
            'разрешающийся столбец (F3) — период всё равно 3 мес эталона');
    });

    test('«6» у 9-ОГЭ: «хвостовой» общий в окне не блокирует, срок всё равно +3 (регресс 422)', () => {
        const sheets = withTrainings(() => liveSixSheets(false), [
            [20, '017', 'инструктаж', U_OT,
             new Date(2026, 8, 1), 0, 0, ''],
            // общий 15.11.2026 внутри (01.09; 01.12]
            [30, '017', 'инструктаж', U_OT,
             new Date(2026, 10, 15), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        const ogChild = r.data.created.filter(x => x.тема === U_OGE)[0];
        assertTrue(ogChild, '9-ОГЭ создан (запись родителя в окне не подавляет)');
        assertEqual(ogChild.дата_проведения, '2026-12-01',
            'срок +3 мес — форс эталона при «хвостовом» общем');
        assertFalse(r.data.created.filter(x => x.тема === U_OT)[0],
            'общий +6 не дублируется — хвост продолжает цикл');
    });

    test('регресс эталона: лист с периодом 3 — прежние обе записи', () => {
        const sheets = withTrainings(etalonSheets, [
            [20, '017', 'инструктаж', T_COMMON,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r.data.created.length, 2, 'обе записи');
        assertEqual(r.data.created.filter(x => x.тема === T_OGE)[0]
            .дата_проведения, '2026-12-01', '9-ОГЭ +3 (период листа = эталон)');
    });

    test('регресс 420: пустая периодичность 9-ОГЭ — 3 мес', () => {
        const sheets = {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание', 'сокращение'],
                [U_OT, 'инструктаж', 6, '', ''],
                [U_OGE, 'инструктаж', '', '', '9-ОГЭ'],
                [T_PKZ, 'проверка_знаний', 12, '', '']
            ]),
            'Инструктажи': new MockSheet([[
                'id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
                'выполнение', 'просрочен', 'комментарий'
            ], [20, '017', 'инструктаж', U_OT,
                new Date(2026, 8, 1), 0, 0, '']])
        };
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r.data.created.filter(x => x.тема === U_OGE)[0]
            .дата_проведения, '2026-12-01',
            'пустая ячейка — дефолт 3 (поведение Task 420 сохранено)');
    });

    test('«в составе» на ДРУГОЙ пункт: период из листа (форса нет)', () => {
        const sheets = {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание',
                 'сокращение', 'в составе'],
                [U_OT, 'инструктаж', 6, '', '', ''],
                [T_OTHER, 'инструктаж', 6, '', 'особый', ''],
                [U_OGE, 'инструктаж', 6, '', '9-ОГЭ', T_OTHER]
            ]),
            'Инструктажи': new MockSheet([[
                'id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
                'выполнение', 'просрочен', 'комментарий'
            ], [25, '017', 'инструктаж', T_OTHER,
                new Date(2026, 8, 1), 0, 0, '']])
        };
        const WS = loadWS(sheets);
        // нормализация: связь 9-ОГЭ → T_OTHER сохраняется, период 6
        const items = WS._readInstrListSheet();
        const og = items.filter(x => x.название === U_OGE)[0];
        assertEqual(og['в составе'], T_OTHER,
            'столбец главнее — связан с другим пунктом');
        assertEqual(og.периодичность, 6,
            'форс 3 НЕ применяется к связи с другим пунктом');
        // отметка T_OTHER → 9-ОГЭ на +6 (период из листа)
        const r = WS.setTrainingDone({ token: 't', id: 25, 'выполнение': 1 });
        assertEqual(r.data.created.filter(x => x.тема === U_OGE)[0]
            .дата_проведения, '2027-03-01',
            'ребёнок другого пункта — период листа (осознанная связь)');
    });

    test('регресс 421: отметка 9-ОГЭ — только фиксация, srvVer 423', () => {
        const sheets = withTrainings(() => liveSixSheets(false), [
            [21, '017', 'инструктаж', U_OGE,
             new Date(2026, 11, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 21, 'выполнение': 1 });
        assertEqual(r.data.created.length, 0, 'записей НЕТ (зависимый пункт)');
        assertEqual(r.data.srvVer, '427', 'версия сервера в ответе');
        assertTrue(String(r.data.autoNote)
            .indexOf('Task 421: зависимый пункт') !== -1,
            'причина отсутствия автосоздания — в разборе');
    });
});

// ============================================================
// 4. VM — клиент: _normalizeInstrList (период живого листа)
// ============================================================
describe('Task 423 — VM: _normalizeInstrList — период 9-ОГЭ', () => {

    const NO_CONSOLE = function() {};
    const host = new Function('console', 'return ({' +
        propArrayText(INDEX_SRC, '_INSTR_CANON') + ',' +
        methodText(INDEX_SRC, '_normalizeInstrList') + '});')(NO_CONSOLE);

    const U_OT = 'Повторный инструктаж по рабочим инструкциям ОТ';
    const U_OGE = 'Инструктаж по инструкции 9-ОГЭ';

    test('живой лист «6» у 9-ОГЭ → период 3 (связь с общим построена)', () => {
        const r = host._normalizeInstrList([
            { название: U_OT, вид: 'инструктаж', периодичность: 6, основание: '' },
            { название: U_OGE, вид: 'инструктаж', периодичность: 6, основание: '' }
        ]);
        const og = r.filter(x => x.название === U_OGE)[0];
        assertEqual(og['в составе'], U_OT, 'связь = название пункта листа');
        assertEqual(og.периодичность, 3,
            'период 3 мес ЭТАЛОНА — «след. срок» не уедет на +6');
    });

    test('связь с ДРУГИМ пунктом — период листа не тронут', () => {
        const other = 'Особый повторный инструктаж цеха';
        const r = host._normalizeInstrList([
            { название: U_OT, вид: 'инструктаж', периодичность: 6, основание: '' },
            { название: other, вид: 'инструктаж', периодичность: 6, основание: '' },
            { название: U_OGE, вид: 'инструктаж', периодичность: 6,
              основание: '', 'в составе': other }
        ]);
        const og = r.filter(x => x.название === U_OGE)[0];
        assertEqual(og['в составе'], other, 'столбец сохранён');
        assertEqual(og.периодичность, 6,
            'форс 3 — только для встроенной связи 9-ОГЭ → общий');
    });

    test('регресс 420: пустая периодичность → 3', () => {
        const r = host._normalizeInstrList([
            { название: U_OT, вид: 'инструктаж', периодичность: 6, основание: '' },
            { название: U_OGE, вид: 'инструктаж', периодичность: '', основание: '' }
        ]);
        assertEqual(r.filter(x => x.название === U_OGE)[0].периодичность, 3,
            'пустая ячейка — дефолт 3 (прежнее поведение)');
    });
});

// ============================================================
// 5. VM — клиент: «след. срок» 9-ОГЭ при «6» в листе
// ============================================================
describe('Task 423 — VM: «след. срок» 9-ОГЭ (период 6 в живом листе)', () => {

    const U_OT = 'Повторный инструктаж по рабочим инструкциям ОТ';
    const U_OGE = 'Инструктаж по инструкции 9-ОГЭ';

    function loadSection() {
        return new Function('console', 'return ({' +
            methodText(INDEX_SRC, '_renderInstrSection') + ',' +
            methodText(INDEX_SRC, '_normInstrKey') + ',' +
            methodText(INDEX_SRC, '_normInstrKind') + ',' +
            methodText(INDEX_SRC, '_addMonthsIso') + ',' +
            methodText(INDEX_SRC, '_instrShortOf') + ',' +
            methodText(INDEX_SRC, '_fmtPeriodRu') + ',' +
            methodText(INDEX_SRC, '_isoDate') + ',' +
            methodText(INDEX_SRC, '_isInstrType') + ',' +
            methodText(INDEX_SRC, '_normalizeInstrList') + ',' +
            propArrayText(INDEX_SRC, '_INSTR_CANON') + ',' +
            '_fmtDateRu: function(d) { var p = String(d).split("-");' +
            '  return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(d); },' +
            '_esc: function(s) { return String(s); },' +
            '_trainingCodeOf: function(t) { return t === "проверка_знаний" ? "ПЗ" : "И"; },' +
            '_statusMeta: function(c) { return { code: c, color: "#123456", name: c }; },' +
            '_INSTR_LIST: [], _INSTR_ALL: []});')(function() {});
    }

    test('след. срок 9-ОГЭ = общий + 3 мес (не +6 от значения листа)', () => {
        const host = loadSection();
        // живой лист: у 9-ОГЭ «6» — как в заявке
        host._INSTR_LIST = host._normalizeInstrList([
            { название: U_OT, вид: 'инструктаж', периодичность: 6, основание: '' },
            { название: U_OGE, вид: 'инструктаж', периодичность: 6, основание: '' }
        ]);
        host._INSTR_ALL = [
            { id: 1, 'таб_номер': '017', тип: 'инструктаж', тема: U_OGE,
              дата_начала: '2025-06-01', дата_окончания: '2025-06-01' },
            { id: 2, 'таб_номер': '017', тип: 'инструктаж', тема: U_OT,
              дата_начала: '2026-09-01', дата_окончания: '2026-09-01' }
        ];
        const html = host._renderInstrSection([], '017', false, false,
            host._INSTR_LIST, 2026);
        const iOge = html.indexOf('9-ОГЭ');
        const seg = iOge !== -1
            ? html.slice(iOge, html.indexOf('ws-il-head', iOge + 10)) : '';
        assertTrue(seg.indexOf('01.12.2026') !== -1,
            'след. срок 9-ОГЭ — от общего +3 мес: 01.12.2026 [' +
            seg.slice(0, 200) + ']');
        assertTrue(seg.indexOf('01.03.2027') === -1,
            'срок НЕ от «6» листа (01.03.2027 — это +6 от общего)');
    });
});

// ============================================================
// 6. VM — клиент: toggleTrainingDone (версия сервера)
// ============================================================
describe('Task 423 — VM: toggleTrainingDone — srvVer < 427', () => {

    function loadToggle() {
        const m = extractMethod(INDEX_SRC, 'toggleTrainingDone');
        if (!m) throw new Error('toggleTrainingDone не найден');
        return new Function('return ({' + m + '}).toggleTrainingDone;')();
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
            _TRAININGS: [rec],
            _INSTR_ALL: [rec],
            _EVENTS_ALL: [],
            __calls: { api: [], renders: 0, logs: [] },
            _api: function(action, payload) {
                ctx.__calls.api.push({ action: action, payload: payload });
                return Promise.resolve({ data: respData });
            },
            _renderWorkersIfOpen: function() { ctx.__calls.renders++; },
            _isoDate: function() { return '2026-09-26'; },
            _fmtDateRu: function(iso) {
                return String(iso || '').split('-').reverse().join('.');
            },
            _apiErrText: function(e) { return e && e.message; }
        };
        return ctx;
    }

    async function withToasts(fn) {
        let shown = null;
        const logs = [];
        const origLog = console.log;
        global.KipToast = { show: function(t) { shown = t; } };
        console.log = function() {
            logs.push(Array.prototype.slice.call(arguments));
        };
        try {
            await fn();
        } finally {
            delete global.KipToast;
            console.log = origLog;
        }
        return { shown: shown, logs: logs };
    }

    const REC = { id: 20, 'таб_номер': '017', тип: 'инструктаж',
                  тема: 'Повторный инструктаж по рабочим инструкциям ОТ',
                  дата_начала: '2026-09-01', выполнение: 0, просрочен: 0 };

    test('сервер 422 (период 9-ОГЭ из листа): предупреждение в тосте', async () => {
        const rec = JSON.parse(JSON.stringify(REC));
        const ctx = makeCtx(rec, {
            id: 20, выполнение: 1, просрочен: 0, srvVer: '422',
            autoNote: 'пункт=… родитель=- дети=…',
            created: [{ id: 60, тема: '…9-ОГЭ…', дата_начала: '2027-03-01' }],
            updated: [], skipped: []
        });
        const r = await withToasts(async () => {
            await loadToggle().call(ctx, 20);
        });
        assertTrue(r.shown.indexOf('новые сроки') !== -1,
            'отметка применена: ' + r.shown);
        assertTrue(r.shown.indexOf('старой версии') !== -1,
            'srvVer 422 < 427 — предупреждение о старом Apps Script: ' + r.shown);
    });

    test('сервер 427: без предупреждения', async () => {
        const rec = JSON.parse(JSON.stringify(REC));
        const ctx = makeCtx(rec, {
            id: 20, выполнение: 1, просрочен: 0, srvVer: '427',
            autoNote: 'пункт=… родитель=- дети=…',
            created: [
                { id: 60, тема: '…9-ОГЭ…', дата_начала: '2026-12-01' },
                { id: 61, тема: '…общий…', дата_начала: '2027-03-01' }
            ],
            updated: [], skipped: []
        });
        const r = await withToasts(async () => {
            await loadToggle().call(ctx, 20);
        });
        assertTrue(r.shown.indexOf('новые сроки: 01.12.2026, 01.03.2027') !== -1,
            'тост несёт ОБЕ даты (9-ОГЭ +3, общий +6): ' + r.shown);
        assertTrue(r.shown.indexOf('старой версии') === -1,
            'srvVer 427 — предупреждения нет');
    });

    test('совсем старый сервер (нет srvVer): предупреждение (регресс 422)', async () => {
        const rec = JSON.parse(JSON.stringify(REC));
        const ctx = makeCtx(rec, {
            id: 20, выполнение: 1, просрочен: 0,
            created: [{ id: 60, тема: '…', дата_начала: '2027-03-01' }],
            updated: []
        });
        const r = await withToasts(async () => {
            await loadToggle().call(ctx, 20);
        });
        assertTrue(r.shown.indexOf('старой версии') !== -1,
            'нет поля — предупреждение на месте: ' + r.shown);
    });
});

// ============================================================
// 7. SW — версия кэша
// ============================================================
describe('Task 423 — SW: версия кэша', () => {
    test('CACHE_VERSION = kipia-test-v744', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v744'") !== -1,
            'SW v650 (Task 423)');
        assertTrue(SW_SRC.indexOf('kipia-test-v745') === -1,
            'двойной бамп отсутствует');
    });
});
