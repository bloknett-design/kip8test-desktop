// ============================================================
// Task 421 — заявка (kip8test): «Нужно подправить логику
// автоматического формирования новых записей инструктажей.
// При выполнении общего инструктажа должно формироваться две
// записи, общий через 6 месяцев и 9-ОГЭ через три месяца от
// даты выполненного общего инструктажа. При выполнении 9-ОГЭ
// не должна формироваться новая запись, а только фиксация его
// выполнения. Получается, что 9-ОГЭ зависимый от общего».
//
// ПРОВЕРКИ:
//   СЕРВЕР WorkSchedule.gs:
//   1) правило (0) ЦИКЛ Task 420 (отметка РЕБЁНКА → создание
//      РОДИТЕЛЯ на дата + N ребёнка) УДАЛЕНО; правило (1) —
//      только для пунктов БЕЗ «в составе» (per > 0 && !parentItem);
//   2) отметка 9-ОГЭ (встроенная связь, столбец, имена
//      пользователя) — created/updated ПУСТЫЕ, только фиксация
//      выполнения (F=1, G пересчитан), строки листа не растут;
//   3) регресс 419/420: отметка ОБЩЕГО → ОБЕ записи (9-ОГЭ +3
//      мес, общий +6 мес) + покрытие незавершённых детей;
//   4) полный цикл: отметка 9-ОГЭ ничего не создаёт, цикл
//      живёт выполнением ОБЩЕГО (следующий 9-ОГЭ — от нового
//      общего);
//   5) независимые пункты (ПЗ 12 мес; неразрешающийся столбец
//      «в составе» у не-9-ОГЭ) — собственный срок создаётся;
//   КЛИЕНТ index.html:
//   6) toggleTrainingDone: пустой created — тост «Отмечено
//      выполнение» (без «новые сроки»), пулы не растут;
//   7) SW kipia-test-v761.
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
describe('Task 421 — SRC: сервер (WorkSchedule.gs)', () => {

    test('_autoCreateNextTrainings: цикл (0) удалён, (1) — без «в составе»', () => {
        const fn = stripComments(methodText(WS_SRC, '_autoCreateNextTrainings'));
        assertTrue(fn.indexOf('parentItem && !children.length') === -1,
            'правило (0) ЦИКЛ Task 420 удалено — ребёнок не создаёт родителя');
        assertTrue(fn.indexOf('parentItem.название, pParent, values') === -1,
            'запись РОДИТЕЛЯ из отметки ребёнка удалена');
        assertTrue(fn.indexOf('per > 0 && !parentItem') !== -1,
            'правило (1): собственный срок — только у пункта БЕЗ «в составе»');
        assertTrue(fn.indexOf('зависимый пункт — автосоздания нет') !== -1,
            'note: причина отсутствия автосоздания у зависимого пункта');
        // правила (2)/(3) — на месте (регресс 419/420)
        assertTrue(fn.indexOf("this._sameInstrName(items[j]['в составе'], tema)") !== -1,
            'правило (2): дети отмеченного пункта живы');
        assertTrue(fn.indexOf('cd.getTime() > provDate.getTime()') !== -1,
            'правило (3): покрытие незавершённых детей живо');
    });

    test('setTrainingDone: автосоздание только при выполнении, note в аудите', () => {
        const fn = stripComments(methodText(WS_SRC, 'setTrainingDone'));
        assertTrue(fn.indexOf('if (done === 1)') !== -1,
            'автосоздание ТОЛЬКО при отметке (1)');
        assertTrue(fn.indexOf('this._autoCreateNextTrainings(sheet, rowData)') !== -1,
            'вызов автосоздания');
        assertTrue(fn.indexOf('autoNote') !== -1,
            'разбор автосоздания — в аудит');
        assertTrue(fn.indexOf('created: created') !== -1 &&
                    fn.indexOf('updated: updated') !== -1,
            'ответ несёт created/updated');
    });
});

// ============================================================
// 2. GAS-VM — сервер (моки листов)
// ============================================================
describe('Task 421 — GAS-VM: зависимый 9-ОГЭ', () => {

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
    // фактические имена пользователя (заявка 420) — без «№»/столбца
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

    function doneSheets(listSheets, rows) {
        const s = listSheets();
        s['Инструктажи'] = new MockSheet([[
            'id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
            'выполнение', 'просрочен', 'комментарий'
        ]].concat(rows || []));
        return s;
    }

    test('СЦЕНАРИЙ ЗАЯВКИ: отметка общего → ОБЕ записи (9-ОГЭ +3, общий +6)', () => {
        const sheets = doneSheets(listSheets, [
            [20, '017', 'инструктаж', T_COMMON,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertTrue(r.ok, 'ok');
        assertEqual(r.data.created.length, 2, 'созданы ОБЕ записи (регресс 420)');
        const ogChild = r.data.created.filter(x => x.тема === T_OGE)[0];
        const otNext = r.data.created.filter(x => x.тема === T_COMMON)[0];
        assertEqual(ogChild.дата_проведения, '2026-12-01',
            '9-ОГЭ через 3 месяца от даты выполненного общего');
        assertEqual(otNext.дата_проведения, '2027-03-01',
            'общий через 6 месяцев от даты выполненного общего');
    });

    test('СЦЕНАРИЙ ЗАЯВКИ: отметка 9-ОГЭ — только фиксация, записей НЕТ', () => {
        const sheets = doneSheets(listSheets, [
            [21, '017', 'инструктаж', T_OGE,
             new Date(2026, 11, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 21, 'выполнение': 1 });
        assertTrue(r.ok, 'ok');
        assertEqual(r.data.выполнение, 1, 'фиксация выполнения записана');
        assertEqual(r.data.просрочен, 0, 'выполненный — не просрочен');
        assertEqual(r.data.created.length, 0,
            'новая запись НЕ формируется (заявка 421)');
        assertEqual(r.data.updated.length, 0, 'покрытия нет');
        assertEqual(sheets['Инструктажи'].rows.length, 2,
            'строки листа не растут — ни 9-ОГЭ, ни общий');
        assertEqual(sheets['Инструктажи'].rows[1][5], 1,
            'F отмеченной строки = 1');
    });

    test('имена пользователя (без столбца, сигнатуры): отметка 9-ОГЭ — без автосоздания', () => {
        const sheets = doneSheets(userSheets, [
            [21, '017', 'инструктаж', U_OGE,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        // связь строится нестрого (Task 420) — пункт зависимый
        const list = WS._readInstrListSheet();
        assertEqual(list.filter(x => x.название === U_OGE)[0]['в составе'], U_OT,
            'связь 9-ОГЭ → общий построена');
        const r = WS.setTrainingDone({ token: 't', id: 21, 'выполнение': 1 });
        assertEqual(r.data.created.length, 0,
            'зависимость устойчива к фактическим названиям листа');
        assertEqual(sheets['Инструктажи'].rows.length, 2, 'строки не растут');
    });

    test('снятие отметки 9-ОГЭ — ничего не происходит', () => {
        const sheets = doneSheets(listSheets, [
            [21, '017', 'инструктаж', T_OGE,
             new Date(2026, 11, 1), 1, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 21, 'выполнение': 0 });
        assertEqual(r.data.выполнение, 0, 'отметка снята');
        assertEqual(r.data.created.length, 0, 'создания нет');
        assertEqual(r.data.updated.length, 0, 'покрытия нет');
        assertEqual(sheets['Инструктажи'].rows.length, 2, 'лист не изменился');
    });

    test('ПОЛНЫЙ ЦИКЛ: 9-ОГЭ ничего не создаёт, цикл живёт общим', () => {
        const sheets = doneSheets(listSheets, [
            [20, '017', 'инструктаж', T_COMMON,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);

        // шаг 1: общий 01.09.2026 → 9-ОГЭ 01.12.2026 + общий 01.03.2027
        const r1 = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r1.data.created.length, 2, 'шаг 1: две записи');
        const oge1 = r1.data.created.filter(x => x.тема === T_OGE)[0];
        const ot1 = r1.data.created.filter(x => x.тема === T_COMMON)[0];
        assertEqual(oge1.дата_проведения, '2026-12-01', 'шаг 1: 9-ОГЭ 01.12.2026');
        assertEqual(ot1.дата_проведения, '2027-03-01', 'шаг 1: общий 01.03.2027');

        // шаг 2: отметка 9-ОГЭ 01.12.2026 — только фиксация
        const r2 = WS.setTrainingDone(
            { token: 't', id: oge1.id, 'выполнение': 1 });
        assertEqual(r2.data.created.length, 0,
            'шаг 2: 9-ОГЭ зависимый — ничего не создано');
        assertEqual(sheets['Инструктажи'].rows.length, 4,
            'шаг 2: строк по-прежнему 1 заголовок + 3 записи');

        // шаг 3: общий 01.03.2027 → 9-ОГЭ 01.06.2027 + общий 01.09.2027
        const r3 = WS.setTrainingDone(
            { token: 't', id: ot1.id, 'выполнение': 1 });
        assertEqual(r3.data.created.length, 2,
            'шаг 3: следующий виток цикла создан РОДИТЕЛЕМ');
        const oge2 = r3.data.created.filter(x => x.тема === T_OGE)[0];
        const ot2 = r3.data.created.filter(x => x.тема === T_COMMON)[0];
        assertEqual(oge2.дата_проведения, '2027-06-01',
            'шаг 3: 9-ОГЭ 01.06.2027 (01.03 + 3 мес)');
        assertEqual(ot2.дата_проведения, '2027-09-01',
            'шаг 3: общий 01.09.2027 (01.03 + 6 мес) — «по кругу из года в год»');
        // старый выполненный 9-ОГЭ не тронут повторно
        const fOld = sheets['Инструктажи'].rows[2][5];
        assertEqual(fOld, 1, 'отметка 9-ОГЭ шага 2 не сброшена');
    });

    test('покрытие: незавершённый 9-ОГЭ до общего — отмечается с ним (регресс 419)', () => {
        const sheets = doneSheets(listSheets, [
            [15, '017', 'инструктаж', T_OGE,
             new Date(2026, 2, 1), 0, 1, ''],
            [20, '017', 'инструктаж', T_COMMON,
             new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r.data.updated.length, 1, 'старый 9-ОГЭ покрыт');
        assertEqual(r.data.updated[0].id, 15, 'id покрытой записи');
        assertEqual(r.data.created.length, 2, 'новые сроки созданы');
    });

    test('независимый пункт (ПЗ, 12 мес): собственный срок создаётся', () => {
        const sheets = doneSheets(listSheets, [
            [30, '023', 'проверка_знаний', T_PKZ,
             new Date(2026, 2, 10), 0, 1, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 30, 'выполнение': 1 });
        assertEqual(r.data.created.length, 1, 'правило (1) живо для пунктов без связи');
        assertEqual(r.data.created[0].дата_проведения, '2027-03-10',
            '10.03.2026 + 12 мес');
    });

    test('неразрешающийся «в составе» у не-9-ОГЭ: пункт остаётся независимым', () => {
        const X = 'Какой-то особый инструктаж';
        const sheets = {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание', 'в составе'],
                [T_COMMON, 'инструктаж', 6, '', ''],
                [T_OGE, 'инструктаж', 3, '', ''],
                [X, 'инструктаж', 6, '', 'Несуществующий пункт (опечатка)']
            ]),
            'Инструктажи': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
                 'выполнение', 'просрочен', 'комментарий'],
                [31, '017', 'инструктаж', X,
                 new Date(2026, 8, 1), 0, 0, '']
            ])
        };
        const WS = loadWS(sheets);
        const list = WS._readInstrListSheet();
        assertEqual(list.filter(x => x.название === X)[0]['в составе'],
            'Несуществующий пункт (опечатка)',
            'значение столбца сохранено (замещение — только для 9-ОГЭ)');
        const r = WS.setTrainingDone({ token: 't', id: 31, 'выполнение': 1 });
        assertEqual(r.data.created.length, 1,
            'связь не разрешается → пункт независимый, свой срок создаётся');
        assertEqual(r.data.created[0].тема, X, 'запись того же пункта');
        assertEqual(r.data.created[0].дата_проведения, '2027-03-01',
            '01.09.2026 + 6 мес');
    });
});

// ============================================================
// 3. VM — клиент: toggleTrainingDone (пустой created)
// ============================================================
describe('Task 421 — VM: toggleTrainingDone — 9-ОГЭ без автосоздания', () => {

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
            _TRAININGS: [rec],
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

    test('пустой created: тост «Отмечено выполнение», пулы не растут', async () => {
        const rec = { id: 21, 'таб_номер': '017', тип: 'инструктаж',
                      тема: 'Повторный инструктаж по инструкции № 9-ОГЭ',
                      дата_начала: '2026-12-01', выполнение: 0, просрочен: 0 };
        const ctx = makeCtx(rec, {
            id: 21, выполнение: 1, просрочен: 0,
            // srvVer актуального сервера (Task 427) — предупреждения в тосте нет
            srvVer: '427',
            created: [], updated: [], skipped: []
        });
        let shown = null;
        global.KipToast = { show: function(t) { shown = t; } };
        try {
            await loadToggle().call(ctx, 21);
        } finally {
            delete global.KipToast;
        }
        assertEqual(shown, 'Отмечено выполнение',
            'тост фиксации — без «новые сроки»');
        assertEqual(ctx._INSTR_ALL.length, 1, 'пул карточки не растёт');
        assertEqual(ctx._TRAININGS.length, 1, 'годовой срез не растёт');
        assertEqual(rec.выполнение, 1, 'отметка обновлена во всех копиях');
        assertEqual(ctx.__calls.renders, 1, 'карточка перерисована');
        assertEqual(ctx.__calls.api[0].action,
            'workSchedule.setTrainingDone', 'вызов API');
        assertEqual(ctx.__calls.api[0].payload['выполнение'], 1,
            'направление — отметка (1)');
    });

    test('клиент готов к created от старого сервера (нет поля)', async () => {
        const rec = { id: 21, тип: 'инструктаж', выполнение: 0, просрочен: 1,
                      дата_начала: '2026-06-01' };
        const ctx = makeCtx(rec, { id: 21, выполнение: 1, просрочен: 0 });
        let shown = null;
        global.KipToast = { show: function(t) { shown = t; } };
        try {
            await loadToggle().call(ctx, 21);
        } finally {
            delete global.KipToast;
        }
        // Task 422: старый Apps Script (нет srvVer) — тост фиксации
        // + предупреждение обновить WorkSchedule.gs (не ошибка)
        assertTrue(shown !== null &&
                    shown.indexOf('Отмечено выполнение') === 0,
            'тост начинается с фиксации: ' + shown);
        assertTrue(shown.indexOf('старой версии') !== -1,
            'предупреждение о старом сервере: ' + shown);
        assertEqual(ctx._INSTR_ALL.length, 1, 'пулы не растут');
    });
});

// ============================================================
// 4. SW — версия кэша
// ============================================================
describe('Task 421 — SW: версия кэша', () => {
    test('CACHE_VERSION = kipia-test-v761', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v761'") !== -1,
            'SW v648 (Task 421)');
        assertTrue(SW_SRC.indexOf('kipia-test-v762') === -1,
            'двойной бамп отсутствует');
    });
});
