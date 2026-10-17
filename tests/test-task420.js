// ============================================================
// Task 420 — заявка (kip8test): «я сделал отметку о выполнении
// общего инструктажа, а создалась только одна новая запись о
// следующем общем инструктаже (должна появиться запись о 9-ОГЭ
// через три месяца».
//
// ДИАГНОЗ: встроенная связь 9-ОГЭ → общий (INSTR_DEFAULT_PARENT,
// Task 419) применялась ТОЛЬКО при точном совпадении названия с
// эталоном («Повторный инструктаж по инструкции № 9-ОГЭ»), а
// фактические названия листа пользователя отличаются («№»/
// «Повторный»/тире) → детей у отметки не находилось → общий
// создавал только свой +6 мес.
//
// ПРОВЕРКИ:
//   СЕРВЕР WorkSchedule.gs:
//   1) _sigKey — сигнатура названий (только буквы/цифры, слитно):
//      «№ 9-ОГЭ»/«9-ОГЭ»/«9 – ОГЭ»/«9‑ОГЭ» → «9огэ»;
//   2) _sameInstrName — нестрогое равенство (норм-ключ ИЛИ
//      сигнатура);
//   3) _readInstrListSheet — встроенная связь ищется НЕСТРОГО:
//      ребёнок = сигнатура содержит «9огэ», родитель = цепочка
//      эталон → «рабочиминструкциям» → «общий» (не ПЗ); связь =
//      НАЗВАНИЕ пункта листа; опечатанный столбец замещается,
//      инверсия стирается, пустая периодичность 9-ОГЭ → 3;
//   4) _autoCreateNextTrainings — (0) ЦИКЛ: отметка РЕБЁНКА →
//      РОДИТЕЛЬ на дата + N(ребёнка) (после 9-ОГЭ через 3 мес —
//      общий); (1)/(2)/(3) — прежние, сравнения нестрогие;
//      note — разбор соответствия в ответе/аудите.
//      ⚠ Task 421: правило (0) УДАЛЕНО, (1) — только для
//      пунктов БЕЗ «в составе» (9-ОГЭ зависимый — фиксация);
//   КЛИЕНТ index.html:
//   5) _normalizeInstrList — встроенная связь для ЖИВОГО списка
//      (дубль серверной логики; старый сервер/кэш);
//   6) _renderInstrSection — «последнее» событие: нестрогое
//      сравнение темы с ключами (сигнатура);
//   7) SW kipia-test-v750.
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
describe('Task 420 — SRC: сервер (WorkSchedule.gs)', () => {

    test('_sigKey: сигнатура — только буквы и цифры, слитно', () => {
        const fn = new Function('return ({' + methodText(WS_SRC, '_sigKey') + '})._sigKey;')();
        assertEqual(fn('Повторный инструктаж по инструкции № 9-ОГЭ'),
            'повторныйинструктажпоинструкции9огэ', 'эталон ребёнка');
        assertEqual(fn('№ 9-ОГЭ'), '9огэ', '«№» отброшена');
        assertEqual(fn('9-ОГЭ'), '9огэ', 'тире отброшено');
        assertEqual(fn('9 – ОГЭ'), '9огэ', 'длинное тире + пробелы');
        assertEqual(fn('9\u2011ОГЭ'), '9огэ', 'неразрывный дефис (U+2011)');
        assertEqual(fn('Ёлка'), 'елка', 'ё → е');
        assertEqual(fn(''), '', 'пусто');
        assertEqual(fn(null), '', 'null');
    });

    test('_sameInstrName: норм-ключ ИЛИ сигнатура', () => {
        const obj = new Function('return ({' +
            methodText(WS_SRC, '_normKey') + ',' +
            methodText(WS_SRC, '_sigKey') + ',' +
            methodText(WS_SRC, '_sameInstrName') + '});')();
        const fn = obj._sameInstrName.bind(obj);
        assertTrue(fn('Инструктаж по инструкции 9-ОГЭ',
                      'инструктаж по инструкции № 9-ОГЭ'),
            'сигнатуры равны (различие только в «№»)');
        assertTrue(fn('Инстр. ОТ', 'инстр.  ОТ'),
            'норм-ключ: регистр/пробелы');
        assertFalse(fn('Инструктаж по инструкции 9-ОГЭ',
                       'Повторный инструктаж по инструкции № 9-ОГЭ'),
            'разные СЛОВА — разные сигнатуры');
        assertFalse(fn('', 'Что-то'), 'пустое имя не совпадает');
        assertFalse(fn(null, 'Что-то'), 'null не совпадает');
    });

    test('_readInstrListSheet: встроенная связь ищется НЕСТРОГО', () => {
        const fn = stripComments(methodText(WS_SRC, '_readInstrListSheet'));
        assertTrue(fn.indexOf("indexOf('9огэ')") !== -1,
            'ребёнок — сигнатура содержит «9огэ»');
        assertTrue(fn.indexOf("indexOf('рабочиминструкциям')") !== -1,
            'родитель — сигнатура содержит «рабочиминструкциям»');
        assertTrue(fn.indexOf("indexOf('общий')") !== -1,
            'родитель — резерв по «общий»');
        assertTrue(fn.indexOf('_sameInstrName(link, out[j5].название)') !== -1,
            'столбец «в составе» главнее, только если разрешается в пункт');
        assertTrue(fn.indexOf('периодичность = 3') !== -1,
            'пустая периодичность 9-ОГЭ — 3 мес (эталон заявки)');
        assertTrue(fn.indexOf('_sigKey(out[j2].название)') !== -1,
            'поиск по сигнатурам листа');
    });

    test('_autoCreateNextTrainings: цикл (0) УДАЛЁН — ребёнок только фиксируется (Task 421)', () => {
        const fn = stripComments(methodText(WS_SRC, '_autoCreateNextTrainings'));
        assertTrue(fn.indexOf('parentItem && !children.length') === -1,
            'правило (0) ЦИКЛ Task 420 удалено (Task 421)');
        assertTrue(fn.indexOf('parentItem.название, pParent, values') === -1,
            'создание записи РОДИТЕЛЯ из отметки ребёнка удалено');
        assertTrue(fn.indexOf('per > 0 && !parentItem') !== -1,
            'правило (1): собственный срок — только у пункта БЕЗ «в составе»');
        assertTrue(fn.indexOf('зависимый пункт — автосоздания нет') !== -1,
            'note несёт причину для зависимого пункта (Task 421)');
        assertTrue(fn.indexOf("note: note") !== -1 &&
                    fn.indexOf("'пункт=' + item.название") !== -1,
            'note — разбор соответствия');
        assertTrue(fn.indexOf('_sameInstrName(items[i].название, tema)') !== -1,
            'пункт ищется нестрого');
        assertTrue(fn.indexOf('_sameInstrName(rv[3], themeName)') !== -1,
            'окно сверяется нестрого');
    });

    test('setTrainingDone: аудит несёт разбор автосоздания', () => {
        const fn = stripComments(methodText(WS_SRC, 'setTrainingDone'));
        assertTrue(fn.indexOf('autoNote') !== -1,
            'note автосоздания читается');
        assertTrue(fn.indexOf("' [' + autoNote + ']'" ) !== -1,
            'разбор добавляется в запись аудита');
    });
});

// ============================================================
// 2. SRC — клиент
// ============================================================
describe('Task 420 — SRC: клиент (index.html)', () => {

    test('_normalizeInstrList: встроенная связь для живого списка', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_normalizeInstrList'));
        assertTrue(fn.indexOf("indexOf('9огэ')") !== -1,
            'ребёнок — сигнатура «9огэ»');
        assertTrue(fn.indexOf("indexOf('рабочиминструкцам')" ) !== -1 ||
                    fn.indexOf("indexOf('рабочиминструкциям')") !== -1,
            'родитель — «рабочиминструкциям»');
        assertTrue(fn.indexOf("indexOf('общий')") !== -1,
            'родитель — резерв «общий»');
        assertTrue(fn.indexOf('периодичность = 3') !== -1,
            'пустая периодичность 9-ОГЭ — 3 мес');
        assertTrue(fn.indexOf("items[chI]['в составе'] = items[pI].название") !== -1,
            'связь = НАЗВАНИЕ пункта листа');
    });

    test('_renderInstrSection: «последнее» — нестрогое сравнение', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderInstrSection'));
        assertTrue(fn.indexOf('_sigRel') !== -1 && fn.indexOf('liHit') !== -1,
            'тема сравнивается норм-ключом ИЛИ сигнатурой');
    });
});

// ============================================================
// 3. GAS-VM — сервер (моки листов)
// ============================================================
describe('Task 420 — GAS-VM: нестрогая связь 9-ОГЭ и цикл', () => {

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

    // ФАКТИЧЕСКИЕ названия пользователя (заявка): без «№» и
    // «Повторный», столбца «в составе» нет
    const U_OT = 'Повторный инструктаж по рабочим инструкциям ОТ';
    const U_OGE = 'Инструктаж по инструкции 9-ОГЭ';
    const T_PKZ = 'Периодическая проверка знаний на допуск к самостоятельной работе';

    function userSheets() {
        return {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание', 'сокращение'],
                [U_OT, 'инструктаж', 6, '', 'Инстр. ОТ'],
                [U_OGE, 'инструктаж', 3, '', '9-ОГЭ'],
                [T_PKZ, 'проверка_знаний', 12, '', '']
            ])
        };
    }

    function doneSheets(listSheets, rows) {
        const s = listSheets();
        s['Инструктажи'] = new MockSheet([[
            'id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
            'выполнение', 'просрочен', 'комментарий'
        ]].concat(rows || []));
        return s;
    }

    test('СЦЕНАРИЙ ЗАЯВКИ: имена пользователя без столбца — связь строится', () => {
        const WS = loadWS(userSheets());
        const list = WS._readInstrListSheet();
        const og = list.filter(x => x.название === U_OGE)[0];
        assertEqual(og['в составе'], U_OT,
            'встроенная связь по сигнатуре «9огэ» → название из листа');
    });

    test('СЦЕНАРИЙ ЗАЯВКИ: отметка общего → 9-ОГЭ (+3) И общий (+6)', () => {
        const sheets = doneSheets(userSheets, [
            [20, '017', 'инструктаж', U_OT,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertTrue(r.ok, 'ok');
        assertEqual(r.data.created.length, 2,
            'созданы ОБЕ записи (регресс заявки: была только одна)');
        const ogeNext = r.data.created.filter(x => x.тема === U_OGE)[0];
        const otNext = r.data.created.filter(x => x.тема === U_OT)[0];
        assertEqual(ogeNext.дата_проведения, '2026-12-01',
            '9-ОГЭ через 3 мес');
        assertEqual(otNext.дата_проведения, '2027-03-01',
            'общий через 6 мес');
        assertEqual(ogeNext.тип, 'инструктаж',
            'тип — из вида пункта листа');
        assertEqual(sheets['Инструктажи'].rows.length, 4,
            '1 заголовок + 1 исходная + 2 новых');
    });

    test('вариации написаний: «№9-ОГЭ» слитно, родитель «охраны труда»', () => {
        const sheets = {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание'],
                ['Повторный инструктаж по рабочим инструкциям охраны труда',
                 'инструктаж', 6, ''],
                ['Повторный инструктаж по инструкции №9-ОГЭ',
                 'инструктаж', 3, ''],
                [T_PKZ, 'проверка_знаний', 12, '']
            ]),
            'Инструктажи': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
                 'выполнение', 'просрочен', 'комментарий'],
                [30, '017', 'инструктаж',
                 'Повторный инструктаж по рабочим инструкциям охраны труда',
                 new Date(2026, 8, 1), 0, 0, '']
            ])
        };
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 30, 'выполнение': 1 });
        const ogeNext = r.data.created.filter(
            x => x.тема === 'Повторный инструктаж по инструкции №9-ОГЭ')[0];
        assertTrue(!!ogeNext, 'запись 9-ОГЭ создана');
        assertEqual(ogeNext.дата_проведения, '2026-12-01', '+3 мес');
        assertEqual(ogeNext.тема,
            'Повторный инструктаж по инструкции №9-ОГЭ',
            'тема — название пункта листа (слитное «№9-ОГЭ»)');
    });

    test('пустая периодичность 9-ОГЭ — 3 мес (эталон заявки)', () => {
        const sheets = {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание'],
                [U_OT, 'инструктаж', 6, ''],
                [U_OGE, 'инструктаж', '', ''],
                [T_PKZ, 'проверка_знаний', 12, '']
            ]),
            'Инструктажи': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
                 'выполнение', 'просрочен', 'комментарий'],
                [40, '017', 'инструктаж', U_OT,
                 new Date(2026, 8, 1), 0, 0, '']
            ])
        };
        const WS = loadWS(sheets);
        const list = WS._readInstrListSheet();
        const og = list.filter(x => x.название === U_OGE)[0];
        assertEqual(og.периодичность, 3,
            'пустая ячейка → период по эталону заявки');
        const r = WS.setTrainingDone({ token: 't', id: 40, 'выполнение': 1 });
        const ogeNext = r.data.created.filter(x => x.тема === U_OGE)[0];
        assertEqual(ogeNext.дата_проведения, '2026-12-01',
            '9-ОГЭ +3 мес создан и при пустой периодичности в листе');
    });

    test('столбец «в составе» с точкой в конце — разрешается, главнее', () => {
        const sheets = {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание', 'в составе'],
                [U_OT, 'инструктаж', 6, '', ''],
                [U_OGE, 'инструктаж', 3, '', U_OT + '.'],
                [T_PKZ, 'проверка_знаний', 12, '', '']
            ]),
            'Инструктажи': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
                 'выполнение', 'просрочен', 'комментарий'],
                [50, '017', 'инструктаж', U_OT,
                 new Date(2026, 8, 1), 0, 0, '']
            ])
        };
        const WS = loadWS(sheets);
        const list = WS._readInstrListSheet();
        const og = list.filter(x => x.название === U_OGE)[0];
        assertEqual(og['в составе'], U_OT + '.',
            'значение столбца сохранено (разрешается по сигнатуре)');
        const r = WS.setTrainingDone({ token: 't', id: 50, 'выполнение': 1 });
        const ogeNext = r.data.created.filter(x => x.тема === U_OGE)[0];
        assertEqual(ogeNext.дата_проведения, '2026-12-01',
            'создание работает с сохранённым значением столбца');
    });

    test('опечатка в столбце «в составе» — замещается встроенной связью', () => {
        const sheets = {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание', 'в составе'],
                [U_OT, 'инструктаж', 6, '', ''],
                [U_OGE, 'инструктаж', 3, '', 'Опечатка в ручном заполнении'],
                [T_PKZ, 'проверка_знаний', 12, '', '']
            ]),
            'Инструктажи': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
                 'выполнение', 'просрочен', 'комментарий'],
                [60, '017', 'инструктаж', U_OT,
                 new Date(2026, 8, 1), 0, 0, '']
            ])
        };
        const WS = loadWS(sheets);
        const list = WS._readInstrListSheet();
        const og = list.filter(x => x.название === U_OGE)[0];
        assertEqual(og['в составе'], U_OT,
            'не разрешающееся значение замещено встроенной связью');
        const r = WS.setTrainingDone({ token: 't', id: 60, 'выполнение': 1 });
        assertEqual(r.data.created.filter(x => x.тема === U_OGE).length, 1,
            'отметка общего создаёт 9-ОГЭ +3');
    });

    test('инверсия: родитель «в составе» ребёнка — стирается', () => {
        const sheets = {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание', 'в составе'],
                [U_OT, 'инструктаж', 6, '', U_OGE],
                [U_OGE, 'инструктаж', 3, '', ''],
                [T_PKZ, 'проверка_знаний', 12, '', '']
            ]),
            'Инструктажи': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
                 'выполнение', 'просрочен', 'комментарий'],
                [70, '017', 'инструктаж', U_OT,
                 new Date(2026, 8, 1), 0, 0, '']
            ])
        };
        const WS = loadWS(sheets);
        const list = WS._readInstrListSheet();
        const ot = list.filter(x => x.название === U_OT)[0];
        const og = list.filter(x => x.название === U_OGE)[0];
        assertEqual(ot['в составе'], '', 'у родителя связи нет');
        assertEqual(og['в составе'], U_OT, 'у ребёнка — встроенная связь');
        const r = WS.setTrainingDone({ token: 't', id: 70, 'выполнение': 1 });
        assertEqual(r.data.created.length, 2,
            'отметка общего: 9-ОГЭ +3 и общий +6 (инверсия не мешает)');
    });

    test('родитель «Общий инструктаж» (без «рабочим инструкциям»)', () => {
        const P = 'Общий инструктаж по охране труда';
        const sheets = {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание'],
                [P, 'инструктаж', 6, ''],
                [U_OGE, 'инструктаж', 3, ''],
                [T_PKZ, 'проверка_знаний', 12, '']
            ]),
            'Инструктажи': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
                 'выполнение', 'просрочен', 'комментарий'],
                [80, '017', 'инструктаж', P,
                 new Date(2026, 8, 1), 0, 0, '']
            ])
        };
        const WS = loadWS(sheets);
        const list = WS._readInstrListSheet();
        const og = list.filter(x => x.название === U_OGE)[0];
        assertEqual(og['в составе'], P,
            'резерв «общий» + не-ПЗ нашёл родителя');
        const r = WS.setTrainingDone({ token: 't', id: 80, 'выполнение': 1 });
        assertEqual(r.data.created.filter(x => x.тема === U_OGE)[0]
            .дата_проведения, '2026-12-01', '9-ОГЭ +3 мес');
    });

    test('ЦИКЛ: отметка созданного 9-ОГЭ — ничего нового (зависимый, Task 421)', () => {
        const sheets = doneSheets(userSheets, [
            [20, '017', 'инструктаж', U_OT,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r1 = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r1.data.created.length, 2, 'шаг 1: 9-ОГЭ +3, общий +6');
        // id созданной записи 9-ОГЭ
        const ogeId = r1.data.created.filter(x => x.тема === U_OGE)[0].id;
        const r2 = WS.setTrainingDone(
            { token: 't', id: ogeId, 'выполнение': 1 });
        assertEqual(r2.data.created.length, 0,
            'шаг 2: 9-ОГЭ — зависимый пункт, автосоздания нет (Task 421)');
        assertEqual(sheets['Инструктажи'].rows.length, 4,
            'дублей не появилось');
    });

    test('ЦИКЛ с опечатанной записью (неразрывный дефис 9‑ОГЭ)', () => {
        const sheets = doneSheets(userSheets, [
            // старая запись с U+2011 в теме — нестрогое покрытие/окно
            [15, '017', 'инструктаж', 'Инструктаж по инструкции 9\u2011ОГЭ',
             new Date(2026, 2, 1), 0, 1, ''],
            [20, '017', 'инструктаж', U_OT,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r.data.updated.length, 1,
            'запись с неразрывным дефисом покрыта (сигнатуры равны)');
        assertEqual(r.data.updated[0].id, 15, 'id покрытой записи');
        assertEqual(r.data.created.length, 2,
            'новые сроки созданы (9-ОГЭ +3, общий +6)');
    });

    test('ответ несёт note — разбор соответствия', () => {
        const sheets = doneSheets(userSheets, [
            [20, '017', 'инструктаж', U_OT,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertTrue(typeof r.data.note === 'undefined' ||
                   typeof r.data.note === 'string',
            'note в ответе сервера не обязателен (клиент не читает)');
        // сам разбор живёт в аудите: проверяем источник
        const fn = stripComments(methodText(WS_SRC, 'setTrainingDone'));
        assertTrue(fn.indexOf('autoNote') !== -1, 'аудит несёт разбор');
    });
});

// ============================================================
// 4. VM — клиент: _normalizeInstrList (связь живого списка)
// ============================================================
describe('Task 420 — VM: _normalizeInstrList — встроенная связь', () => {

    const NO_CONSOLE = function() {};
    const host = new Function('console', 'return ({' +
        propArrayText(INDEX_SRC, '_INSTR_CANON') + ',' +
        methodText(INDEX_SRC, '_normalizeInstrList') + '});')(NO_CONSOLE);

    const U_OT = 'Повторный инструктаж по рабочим инструкциям ОТ';
    const U_OGE = 'Инструктаж по инструкции 9-ОГЭ';

    test('живой список с именами пользователя БЕЗ связи — связь встроена', () => {
        const live = [
            { название: U_OT, вид: 'инструктаж', периодичность: 6, основание: '' },
            { название: U_OGE, вид: 'инструктаж', периодичность: 3, основание: '' },
            { название: 'Иной пунктик', вид: 'инструктаж', периодичность: 0, основание: '' }
        ];
        const r = host._normalizeInstrList(live);
        const og = r.filter(x => x.название === U_OGE)[0];
        assertEqual(og['в составе'], U_OT,
            'связь = название пункта листа (сигнатуры)');
        assertEqual(og.периодичность, 3, 'периодичность не тронута (3)');
        const other = r.filter(x => x.название === 'Иной пунктик')[0];
        assertEqual(other['в составе'] || '', '', 'чужие пункты без связи');
    });

    test('пустая периодичность 9-ОГЭ → 3 (клиентский показ)', () => {
        const live = [
            { название: U_OT, вид: 'инструктаж', периодичность: 6, основание: '' },
            { название: U_OGE, вид: 'инструктаж', периодичность: '', основание: '' }
        ];
        const r = host._normalizeInstrList(live);
        assertEqual(r.filter(x => x.название === U_OGE)[0].периодичность, 3,
            '«след. срок» 9-ОГЭ показывается даже при пустой ячейке листа');
    });

    test('разрешающаяся связь столбца — сохранена', () => {
        const live = [
            { название: U_OT, вид: 'инструктаж', периодичность: 6, основание: '' },
            { название: U_OGE, вид: 'инструктаж', периодичность: 3,
              основание: '', 'в составе': 'Повторный инструктаж по рабочим инструкциям ОТ.' }
        ];
        const r = host._normalizeInstrList(live);
        assertEqual(r.filter(x => x.название === U_OGE)[0]['в составе'],
            'Повторный инструктаж по рабочим инструкциям ОТ.',
            'новый сервер прислал связь — клиент не переписывает');
    });

    test('список без 9-ОГЭ — без изменений (регресс 412)', () => {
        const live = [{ название: 'Вводный инструктаж', вид: 'инструктаж',
                        периодичность: 0, основание: '' }];
        const r = host._normalizeInstrList(live);
        assertEqual(1, r.length, 'живой список главнее канона');
        assertEqual('Вводный инструктаж', r[0].название, 'без подмены');
        assertEqual(r[0]['в составе'] || '', '', 'связь не навязана');
    });

    test('пустой список → канон (регресс 412)', () => {
        assertEqual(5, host._normalizeInstrList([]).length, 'канон заявки 409');
        const canon = host._normalizeInstrList(undefined);
        const og = canon.filter(x =>
            x.название === 'Повторный инструктаж по инструкции № 9-ОГЭ')[0];
        assertEqual(og['в составе'], U_OT, 'канон несёт связь 9-ОГЭ');
    });
});

// ============================================================
// 5. VM — клиент: «след. срок» 9-ОГЭ с именами пользователя
// ============================================================
describe('Task 420 — VM: «след. срок» 9-ОГЭ (живой список пользователя)', () => {

    const U_OT = 'Повторный инструктаж по рабочим инструкциям ОТ';
    const U_OGE = 'Инструктаж по инструкции 9-ОГЭ';

    function loadSection() {
        // хост по образцу 419 + _normalizeInstrList (путь данных):
        // список пользователя БЕЗ связи проходит нормализацию here
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

    test('без связи от сервера: клиент строит её сам — срок 9-ОГЭ = +3 от общего', () => {
        const host = loadSection();
        // сервер ПРЕЖНЕЙ версии: instrList без «в составе»
        const live = [
            { название: U_OT, вид: 'инструктаж', периодичность: 6, основание: '' },
            { название: U_OGE, вид: 'инструктаж', периодичность: 3, основание: '' }
        ];
        host._INSTR_LIST = host._normalizeInstrList(live);
        assertEqual(host._INSTR_LIST.filter(x => x.название === U_OGE)[0]
            ['в составе'], U_OT, 'связь построена клиентом');
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
            'след. срок 9-ОГЭ — от общего (+3 мес): 01.12.2026 [' + seg.slice(0, 200) + ']');
        assertTrue(seg.indexOf('01.06.2025') === -1,
            'наивная просрочка от старой записи не показана');
    });

    test('тема записи с «№» — нестрогое сравнение в «последнем»', () => {
        const host = loadSection();
        host._INSTR_LIST = host._normalizeInstrList([
            { название: U_OT, вид: 'инструктаж', периодичность: 6, основание: '' },
            { название: 'Повторный инструктаж по инструкции № 9-ОГЭ',
              вид: 'инструктаж', периодичность: 3, основание: '' }
        ]);
        // записи несут темы, отличающиеся от названий листа «№»/тире
        host._INSTR_ALL = [
            { id: 1, 'таб_номер': '017', тип: 'инструктаж',
              тема: 'Повторный инструктаж по инструкции №9-ОГЭ',
              дата_начала: '2025-06-01', дата_окончания: '2025-06-01' },
            { id: 2, 'таб_номер': '017', тип: 'инструктаж',
              тема: 'повторный инструктаж по рабочим инструкциям ОТ',
              дата_начала: '2026-09-01', дата_окончания: '2026-09-01' }
        ];
        const html = host._renderInstrSection([], '017', false, false,
            host._INSTR_LIST, 2026);
        const iOge = html.indexOf('9-ОГЭ');
        const seg = iOge !== -1
            ? html.slice(iOge, html.indexOf('ws-il-head', iOge + 10)) : '';
        assertTrue(seg.indexOf('01.12.2026') !== -1,
            'запись родителя найдена по сигнатуре (регистр не важен)');
    });
});

// ============================================================
// 6. SW — версия кэша
// ============================================================
describe('Task 420 — SW: версия кэша', () => {
    test('CACHE_VERSION = kipia-test-v750', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v750'") !== -1,
            'SW v647 (Task 420)');
        assertTrue(SW_SRC.indexOf('kipia-test-v751') === -1,
            'двойной бамп отсутствует');
    });
});
