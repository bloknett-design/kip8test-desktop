// ============================================================
// Task 422 — заявка (kip8test): «Проверь, при выполнении общего
// инструктажа, 9-ОГЭ +3 мес не создаётся».
//
// ДИАГНОЗ (воспроизведено на GAS-VM до правок):
//   • «хвостовая» запись общего в окне (дата; дата+3] подавляла
//     создание 9-ОГЭ (проверка hasInWindow(tema, …) в правиле 2) —
//     после тестов правила (0) Task 420 в листе оставались общие,
//     навсегда блокировавшие 9-ОГЭ;
//   • дубль 9-ОГЭ в окне молча пропускался (без объяснения);
//   • старый Apps Script (419: строгие имена/связь) даёт «только
//     общий +6» — клиент не мог отличить старый сервер.
//
// ПРОВЕРКИ:
//   СЕРВЕР WorkSchedule.gs:
//   1) правило (2): окно ребёнка проверяется ТОЛЬКО по записям
//      самого ребёнка — запись РОДИТЕЛЯ в окне больше НЕ подавляет
//      создание 9-ОГЭ (заявка: «при выполнении общего — ДВЕ
//      записи»); настоящий дубль ребёнка — по-прежнему пропускается;
//   2) skipped[] — дети без новой записи с ПРИЧИНОЙ (дубликат
//      «уже запланирован на ДД.ММ.ГГГГ» / периодичность / ошибка
//      записи — per-child try/catch, остальные дети не роняются);
//   3) ответ setTrainingDone: srvVer '422' + autoNote (разбор
//      пункт/родитель/дети/решения) + skipped; ошибка
//      автосоздания — в autoNote ответа (не молчание);
//   4) регресс 419/420/421: обе записи, полный цикл, покрытие,
//      фиксация 9-ОГЭ без автосоздания, имена пользователя;
//   КЛИЕНТ index.html:
//   5) тост: новые сроки + пропущенные дети с причиной;
//   6) старый сервер (нет srvVer) — предупреждение в тосте;
//   7) autoNote — в консоль (F12); ошибка автосоздания — ⚠ в тосте;
//   8) SW kipia-test-v741.
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
describe('Task 422 — SRC: сервер (WorkSchedule.gs)', () => {

    test('правило (2): запись родителя в окне ребёнка НЕ подавляет создание', () => {
        const fn = stripComments(methodText(WS_SRC, '_autoCreateNextTrainings'));
        assertTrue(fn.indexOf('!hasInWindow(tema, provDate, chDate)') === -1,
            'проверка окна по РОДИТЕЛЮ в правиле (2) удалена — «хвостовой» общий ' +
            'в окне (дата; дата+3] больше не блокирует 9-ОГЭ');
        assertTrue(fn.indexOf('!hit') !== -1 &&
                    fn.indexOf('hasInWindow(ch.название, provDate, chDate)') !== -1,
            'окно ребёнка проверяется ТОЛЬКО по записям самого ребёнка (дубль)');
    });

    test('skipped: дети без новой записи — с причиной', () => {
        const fn = stripComments(methodText(WS_SRC, '_autoCreateNextTrainings'));
        assertTrue(fn.indexOf('var skipped = [];') !== -1,
            'массив skipped заведён');
        assertTrue(fn.indexOf('уже запланирован на ') !== -1,
            'причина-дубликат с датой ДД.ММ.ГГГГ');
        assertTrue(fn.indexOf('периодичность не задана') !== -1,
            'причина пустой периодичности');
        assertTrue(fn.indexOf('ошибка создания (') !== -1,
            'причина ошибки записи (per-child try/catch)');
        assertTrue(fn.indexOf('return { created: created, updated: updated, skipped: skipped,') !== -1,
            'skipped возвращается из автосоздания');
    });

    test('setTrainingDone: srvVer/autoNote/skipped в ответе; ошибка — в autoNote', () => {
        const fn = stripComments(methodText(WS_SRC, 'setTrainingDone'));
        assertTrue(fn.indexOf("srvVer: '427'") !== -1,
            'версия сервера автосоздания — в ответе (клиент отличает старый Apps Script); Task 426: День шахтёра не праздник');
        assertTrue(fn.indexOf('autoNote: autoNote') !== -1,
            'разбор автосоздания — в ответе (консоль клиента)');
        assertTrue(fn.indexOf('skipped: skipped') !== -1,
            'пропущенные дети — в ответе (тост клиента)');
        assertTrue(fn.indexOf("autoNote = 'ОШИБКА автосоздания: ' + e") !== -1,
            'ошибка автосоздания — в autoNote ответа, не молчание');
    });

    test('регресс 421: правило (0) по-прежнему удалено', () => {
        const fn = stripComments(methodText(WS_SRC, '_autoCreateNextTrainings'));
        assertTrue(fn.indexOf('per > 0 && !parentItem') !== -1,
            'правило (1): только пункт БЕЗ «в составе»');
        assertTrue(fn.indexOf('parentItem && !children.length') === -1,
            'правило (0) ЦИКЛ Task 420 не вернулся');
    });
});

// ============================================================
// 2. GAS-VM — сервер (моки листов)
// ============================================================
describe('Task 422 — GAS-VM: «9-ОГЭ +3 не создаётся»', () => {

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

    // Лист, падающий при ДОБАВЛЕНИИ строки (row > текущего lastRow):
    // симулирует квоту/защиту листа — правило (2) не должно ронять
    // уже созданный общий и саму отметку
    class ThrowingAppendSheet extends MockSheet {
        getRange(row, col, numRows, numCols) {
            const base = super.getRange(row, col, numRows, numCols);
            const self = this;
            if (row > self.rows.length) {
                return {
                    getValues: base.getValues,
                    getValue: base.getValue,
                    setValues() {
                        throw new Error('append forbidden (mock)');
                    },
                    setValue() {
                        throw new Error('append forbidden (mock)');
                    },
                    setNumberFormat() { return this; }
                };
            }
            return base;
        }
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

    function listSheets() {
        return {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание', 'сокращение'],
                [T_COMMON, 'инструктаж', 6, '', 'раб. инстр. ОТ'],
                [T_OGE, 'инструктаж', 3, '', '9-ОГЭ'],
                [T_PKZ, 'проверка_знаний', 12, '', '']
            ])
        };
    }

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

    function doneSheets(listFn, rows) {
        const s = listFn();
        s['Инструктажи'] = new MockSheet([[
            'id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
            'выполнение', 'просрочен', 'комментарий'
        ]].concat(rows || []));
        return s;
    }

    test('ЧИСТЫЙ: отметка общего → ОБЕ записи + srvVer + autoNote + пустой skipped', () => {
        const sheets = doneSheets(listSheets, [
            [20, '017', 'инструктаж', T_COMMON,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertTrue(r.ok, 'ok');
        assertEqual(r.data.srvVer, '427', 'версия сервера в ответе');
        assertEqual(r.data.created.length, 2, 'созданы ОБЕ записи');
        assertEqual(r.data.skipped.length, 0, 'пропусков нет');
        assertTrue(String(r.data.autoNote).indexOf('дети=' + T_OGE) !== -1,
            'autoNote: дети найдены');
        assertTrue(String(r.data.autoNote).indexOf('9-ОГЭ → 01.12.2026') !== -1,
            'autoNote: решение по ребёнку с датой');
    });

    test('ГЛАВНЫЙ ФИКС: «хвостовой» общий в окне (X; X+3] НЕ блокирует 9-ОГЭ', () => {
        const sheets = doneSheets(listSheets, [
            [20, '017', 'инструктаж', T_COMMON,
             new Date(2026, 8, 1), 0, 0, ''],
            // общий 15.11.2026 внутри (01.09; 01.12] — напр., хвост
            // правила (0) Task 420 или ручной ввод
            [30, '017', 'инструктаж', T_COMMON,
             new Date(2026, 10, 15), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        const ogChild = r.data.created.filter(x => x.тема === T_OGE)[0];
        assertTrue(ogChild, '9-ОГЭ +3 мес СОЗДАН, несмотря на общий в окне');
        assertEqual(ogChild.дата_проведения, '2026-12-01',
            '9-ОГЭ через 3 месяца от даты выполненного общего');
        // общий +6 НЕ дублируется: в окне (01.09; 01.03.27] есть общий
        // 15.11 — цикл продолжится его выполнением
        const otNext = r.data.created.filter(x => x.тема === T_COMMON)[0];
        assertFalse(otNext,
            'общий +6 не создаётся — общий 15.11 уже продолжает цикл (антидубль)');
        assertEqual(r.data.skipped.length, 0,
            'пропусков по ребёнку нет — запись создана');
    });

    test('дубль 9-ОГЭ в окне: НЕ создаётся, ПРИЧИНА — в skipped (тост клиента)', () => {
        const sheets = doneSheets(listSheets, [
            [20, '017', 'инструктаж', T_COMMON,
             new Date(2026, 8, 1), 0, 0, ''],
            // 9-ОГЭ 20.11.2026 уже запланирован внутри (01.09; 01.12]
            [31, '017', 'инструктаж', T_OGE,
             new Date(2026, 10, 20), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r.data.created.length, 1, 'создан только общий +6');
        assertEqual(r.data.created[0].тема, T_COMMON, 'новый срок общего');
        assertEqual(r.data.skipped.length, 1, 'ребёнок — в skipped с причиной');
        assertEqual(r.data.skipped[0].тема, '9-ОГЭ',
            'тема — сокращение пункта (столбец E), не полное название');
        assertEqual(r.data.skipped[0].причина, 'уже запланирован на 20.11.2026',
            'причина-дубликат с датой ДД.ММ.ГГГГ');
    });

    test('периодичность ребёнка не задана → skipped «периодичность не задана»', () => {
        const X = 'Инструктаж по особому регламенту';
        const sheets = {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание', 'сокращение'],
                [T_COMMON, 'инструктаж', 6, '', ''],
                [X, 'инструктаж', '—', '', 'особый']
            ]),
            'Инструктажи': new MockSheet([[
                'id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
                'выполнение', 'просрочен', 'комментарий'
            ], [20, '017', 'инструктаж', T_COMMON,
                new Date(2026, 8, 1), 0, 0, '']])
        };
        // «в составе» столбца нет — связь только у встроенного 9-ОГЭ;
        // для ребёнка X связь задаём столбцом… заголовка нет → независимый.
        // Добавляем столбец «в составе»:
        sheets['Список_И_и_ПЗ'].rows[0].push('в составе');
        sheets['Список_И_и_ПЗ'].rows[1].push('');
        sheets['Список_И_и_ПЗ'].rows[2].push(T_COMMON);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r.data.created.length, 1, 'общий +6 создан');
        assertEqual(r.data.skipped.length, 1, 'ребёнок без периодичности — skipped');
        assertEqual(r.data.skipped[0].причина, 'периодичность не задана',
            'причина пустой/текстовой периодичности');
    });

    test('ошибка записи (лист не принимает строки): отметка жива, ОШИБКА — в autoNote', () => {
        const s = listSheets();
        s['Инструктажи'] = new ThrowingAppendSheet([[
            'id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
            'выполнение', 'просрочен', 'комментарий'
        ], [20, '017', 'инструктаж', T_COMMON,
            new Date(2026, 8, 1), 0, 0, '']]);
        const WS = loadWS(s);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        // любое добавление (общий/9-ОГЭ) падает → внешний catch:
        // autoNote = ОШИБКА, но отметка (F/G) уже записана, ответ ок
        assertTrue(r.ok, 'отметка не сломана');
        assertTrue(String(r.data.autoNote)
            .indexOf('ОШИБКА автосоздания') === 0,
            'ошибка автосоздания — в autoNote ответа (не молчание)');
        assertEqual(s['Инструктажи'].rows[1][5], 1,
            'отметка выполнения записана в лист');
        assertEqual(s['Инструктажи'].rows.length, 2,
            'строк не добавлено');
    });

    test('ошибка записи ТОЛЬКО ребёнка: 9-ОГЭ не роняет общий +6 (per-child catch)', () => {
        const sheets = doneSheets(listSheets, [
            [20, '017', 'инструктаж', T_COMMON,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        // строка общего добавится как row 3 (после заголовка и
        // отмечаемой); ребёнок — row 4: на нём и падаем
        const orig = MockSheet.prototype.getRange;
        sheets['Инструктажи'].getRange = function(row, col, numRows, numCols) {
            const base = orig.call(this, row, col, numRows, numCols);
            if (row === 4) {
                return {
                    getValues: base.getValues,
                    getValue: base.getValue,
                    setValues() { throw new Error('mock write failure'); },
                    setValue() { throw new Error('mock write failure'); },
                    setNumberFormat() { return this; }
                };
            }
            return base;
        };
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r.data.created.length, 1,
            'общий +6 создан до сбоя ребёнка (правило 1 идёт первым)');
        assertEqual(r.data.created[0].тема, T_COMMON, 'это общий');
        assertEqual(r.data.skipped.length, 1, 'ребёнок — в skipped');
        assertTrue(String(r.data.skipped[0].причина)
            .indexOf('ошибка создания') === 0,
            'причина — ошибка записи: ' + r.data.skipped[0].причина);
        assertTrue(String(r.data.autoNote).indexOf('9-ОГЭ: ошибка') !== -1,
            'разбор в autoNote');
    });

    test('регресс 421: отметка 9-ОГЭ — только фиксация, srvVer в ответе', () => {
        const sheets = doneSheets(listSheets, [
            [21, '017', 'инструктаж', T_OGE,
             new Date(2026, 11, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 21, 'выполнение': 1 });
        assertEqual(r.data.created.length, 0, 'записей НЕТ (зависимый пункт)');
        assertEqual(r.data.skipped.length, 0, 'пропусков нет');
        assertEqual(r.data.srvVer, '427', 'версия сервера в ответе');
        assertTrue(String(r.data.autoNote)
            .indexOf('Task 421: зависимый пункт') !== -1,
            'причина отсутствия автосоздания — в разборе');
    });

    test('регресс 421: ПОЛНЫЙ ЦИКЛ — обе записи на каждом витке', () => {
        const sheets = doneSheets(listSheets, [
            [20, '017', 'инструктаж', T_COMMON,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r1 = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r1.data.created.length, 2, 'шаг 1: ОБЕ записи');
        const oge1 = r1.data.created.filter(x => x.тема === T_OGE)[0];
        const ot1 = r1.data.created.filter(x => x.тема === T_COMMON)[0];
        const r2 = WS.setTrainingDone(
            { token: 't', id: oge1.id, 'выполнение': 1 });
        assertEqual(r2.data.created.length, 0, 'шаг 2: 9-ОГЭ — фиксация');
        const r3 = WS.setTrainingDone(
            { token: 't', id: ot1.id, 'выполнение': 1 });
        assertEqual(r3.data.created.length, 2, 'шаг 3: следующий виток');
        const oge2 = r3.data.created.filter(x => x.тема === T_OGE)[0];
        assertEqual(oge2.дата_проведения, '2027-06-01', '9-ОГЭ 01.06.2027');
    });

    test('регресс 420: имена пользователя — обе записи (связь нестрогая)', () => {
        const sheets = doneSheets(userSheets, [
            [20, '017', 'инструктаж', U_OT,
             new Date(2026, 8, 16), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r.data.created.length, 2,
            'имена пользователя без «в составе» — ОБЕ записи');
        assertEqual(r.data.created.filter(x => x.тема === U_OGE)[0]
            .дата_проведения, '2026-12-16', '9-ОГЭ 16.12.2026');
        assertEqual(r.data.created.filter(x => x.тема === U_OT)[0]
            .дата_проведения, '2027-03-16', 'общий 16.03.2027');
    });

    test('«в составе» ребёнка указывает на ДРУГОЙ пункт: только общий (дети=- в разборе)', () => {
        const sheets = {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание', 'сокращение', 'в составе'],
                [U_OT, 'инструктаж', 6, '', '', ''],
                ['Общий инструктаж', 'инструктаж', 6, '', '', ''],
                [U_OGE, 'инструктаж', 3, '', '9-ОГЭ', 'Общий инструктаж']
            ]),
            'Инструктажи': new MockSheet([[
                'id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
                'выполнение', 'просрочен', 'комментарий'
            ], [20, '017', 'инструктаж', U_OT,
                new Date(2026, 8, 1), 0, 0, '']])
        };
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r.data.created.length, 1,
            'отмечен пункт, чьим ребёнком 9-ОГЭ не является (документировано)');
        assertTrue(String(r.data.autoNote).indexOf('дети=-') !== -1,
            'разбор показывает: дети не найдены — виден в консоли клиента');
    });
});

// ============================================================
// 3. VM — клиент: toggleTrainingDone (диагностика в тосте)
// ============================================================
describe('Task 422 — VM: toggleTrainingDone — диагностика', () => {

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

    test('новые сроки + пропущенный ребёнок: тост несёт ПРИЧИНУ', async () => {
        const rec = JSON.parse(JSON.stringify(REC));
        const ctx = makeCtx(rec, {
            id: 20, выполнение: 1, просрочен: 0, srvVer: '427',
            autoNote: 'пункт=… родитель=- дети=…',
            created: [{ id: 60, тема: '…общий…', дата_начала: '2027-03-01' }],
            updated: [],
            skipped: [{ тема: '9-ОГЭ',
                        причина: 'уже запланирован на 20.11.2026' }]
        });
        const r = await withToasts(async () => {
            await loadToggle().call(ctx, 20);
        });
        assertTrue(r.shown.indexOf('новые сроки: 01.03.2027') !== -1,
            'даты созданных — в тосте');
        assertTrue(r.shown.indexOf('9-ОГЭ — уже запланирован на 20.11.2026') !== -1,
            'пропущенный ребёнок — с причиной: ' + r.shown);
        assertTrue(r.shown.indexOf('старой версии') === -1,
            'srvVer есть — предупреждения нет');
        assertEqual(r.logs.length, 1, 'autoNote — в консоль');
        assertTrue(String(r.logs[0][1]).indexOf('пункт=') !== -1,
            'разбор автосоздания залогирован');
    });

    test('СТАРЫЙ СЕРВЕР (нет srvVer): предупреждение в тосте', async () => {
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
            'клиент отличает старый Apps Script: ' + r.shown);
        assertTrue(r.shown.indexOf('новую версию развёртывания') !== -1,
            'подсказка — что делать');
    });

    test('ошибка автосоздания: ⚠ в тосте, отметка применена', async () => {
        const rec = JSON.parse(JSON.stringify(REC));
        const ctx = makeCtx(rec, {
            id: 20, выполнение: 1, просрочен: 0, srvVer: '427',
            autoNote: 'ОШИБКА автосоздания: mock write failure',
            created: [], updated: [], skipped: []
        });
        const r = await withToasts(async () => {
            await loadToggle().call(ctx, 20);
        });
        assertTrue(r.shown.indexOf('Автосоздание не завершено') !== -1,
            'сбой не молчит: ' + r.shown);
        assertEqual(rec.выполнение, 1, 'отметка всё равно применена');
    });

    test('снятие отметки: прежний тост, без предупреждений', async () => {
        const rec = JSON.parse(JSON.stringify(REC));
        rec.выполнение = 1;
        const ctx = makeCtx(rec, {
            id: 20, выполнение: 0, просрочен: 0
        });
        const r = await withToasts(async () => {
            await loadToggle().call(ctx, 20);
        });
        assertEqual(r.shown, 'Отметка о выполнении снята',
            'снятие — без диагностики автосоздания');
    });

    test('регресс 421: пустой created — тост «Отмечено выполнение»', async () => {
        const rec = JSON.parse(JSON.stringify(REC));
        rec.тема = 'Повторный инструктаж по инструкции № 9-ОГЭ';
        const ctx = makeCtx(rec, {
            id: 20, выполнение: 1, просрочен: 0, srvVer: '427',
            autoNote: 'пункт=… ; Task 421: зависимый пункт — автосоздания нет',
            created: [], updated: [], skipped: []
        });
        const r = await withToasts(async () => {
            await loadToggle().call(ctx, 20);
        });
        assertEqual(r.shown, 'Отмечено выполнение',
            'фиксация 9-ОГЭ — прежний тост (нет пропусков/предупреждений)');
    });
});

// ============================================================
// 4. SW — версия кэша
// ============================================================
describe('Task 422 — SW: версия кэша', () => {
    test('CACHE_VERSION = kipia-test-v741', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v741'") !== -1,
            'SW v649 (Task 422)');
        assertTrue(SW_SRC.indexOf('kipia-test-v742') === -1,
            'двойной бамп отсутствует');
    });
});
