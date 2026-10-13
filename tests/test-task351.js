// tests/test-task351.js
// Task 351 — Admin.deleteUser + кэш чтений на выполнение + listLogs-хвост
// + устойчивый getConfig (аудит после Task 349, пункты 3, 4, 6 + listLogs).
//
// Проверяются:
//   1. Admin.deleteUser — замок, гарды (не найден / нельзя себя / нельзя
//      последнего админа), удаление сессий (user_id ИЛИ email — легаси
//      Task 37), OTP по email, строка users последней, аудит
//      ADMIN_DELETE_USER; роут adminDeleteUser в Code.gs + гейт admin.panel.
//   2. Кэш чтений: _rowsCache, beginExecution (doPost/hourlyCleanup в
//      Code.gs), инвалидация при записях (appendRow/deleteRow/setCell),
//      slice-копия (сортировка ответа не портит кэш).
//   3. listLogs читает ХВОСТ audit_log (Utils.getLastRows) вместо всего
//      листа; лимит-кламп 500; сортировка хвоста по убыванию.
//   4. getConfig с числовым дефолтом: '' / 'abc' / '-5' / '0' → дефолт
//      + warn; '30 дней' / ' 30 ' / 30 → 30; строковый дефолт — passthrough.
//
// Запуск: через tests/run-all.js (require './test-task351.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual, assertThrows } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const UTILS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Utils.gs'), 'utf8');
const CODE_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Code.gs'), 'utf8');
const SESSIONS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Sessions.gs'), 'utf8');

// ============================================================
// Извлечение функции из .gs по маркеру (по образцу test-task350.js)
// ============================================================
function extractFn(src, marker) {
    const START = src.indexOf(marker);
    if (START === -1) return '';
    const FN = src.indexOf('function', START);
    let depth = 0;
    let i = src.indexOf('{', START);
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(FN, i + 1);
}

const GET_ROWS_FN = extractFn(UTILS_SRC, 'getRows: function');
const GET_LAST_ROWS_FN = extractFn(UTILS_SRC, 'getLastRows: function');
const BEGIN_EXEC_FN = extractFn(UTILS_SRC, 'beginExecution: function');
const INVALIDATE_FN = extractFn(UTILS_SRC, 'invalidateCache: function');
const APPEND_ROW_FN = extractFn(UTILS_SRC, 'appendRow: function');
const DELETE_ROW_FN = extractFn(UTILS_SRC, 'deleteRow: function');
const SET_CELL_FN = extractFn(UTILS_SRC, 'setCell: function');
const GET_CONFIG_FN = extractFn(UTILS_SRC, 'getConfig: function');
const DELETE_USER_FN = extractFn(UTILS_SRC, 'deleteUser: function');
const LIST_LOGS_FN = extractFn(UTILS_SRC, 'listLogs: function');
const UPDATE_USER_STATUS_FN = extractFn(UTILS_SRC, 'updateUserStatus: function');
const MARK_OTP_USED_FN = extractFn(UTILS_SRC, 'markOtpUsed: function');
const INCREMENT_OTP_FN = extractFn(UTILS_SRC, 'incrementOtpAttempts: function');

// Убрать строки-комментарии — SRC-ассерты смотрят только на живой код.
function stripCommentLines(src) {
    return src.split('\n').filter(function (l) {
        return !/^\s*(\*|\/\/)/.test(l);
    }).join('\n');
}

const UTILS_CODE = stripCommentLines(UTILS_SRC);

// Прогон функции с ВРЕМЕННЫМИ глобалами (по образцу test-task350.js):
// даты main-realm остаются instanceof Date, Utils/SpreadsheetApp подменяются.
function runWithGlobals(globals, code, thisArg, args) {
    const saved = {};
    const keys = Object.keys(globals);
    keys.forEach(function (k) { saved[k] = globalThis[k]; globalThis[k] = globals[k]; });
    try {
        const fn = vm.runInThisContext('(' + code + ')');
        return fn.apply(thisArg || null, args || []);
    } finally {
        keys.forEach(function (k) {
            if (saved[k] === undefined) delete globalThis[k];
            else globalThis[k] = saved[k];
        });
    }
}

// ============================================================
// 1. SRC: Admin.deleteUser — гард-структура
// ============================================================
describe('Task 351 — SRC: Admin.deleteUser', () => {

    test('SRC: deleteUser существует и работает под Utils.withLock', () => {
        assertTrue(DELETE_USER_FN.length > 0, 'функция извлечена (deleteUser: function)');
        assertTrue(DELETE_USER_FN.indexOf('Utils.withLock') !== -1,
            'вся операция под замком (паттерн resetLogin Task 348)');
    });

    test('SRC: гард «пользователь не найден» — контролируемая ошибка', () => {
        assertTrue(DELETE_USER_FN.indexOf("throw new Error('User not found')") !== -1,
            'fail-safe вместо падения');
    });

    test('SRC: гард «нельзя удалить себя»', () => {
        const g = DELETE_USER_FN.indexOf('Number(user.ID) === Number(admin.ID)');
        assertTrue(g !== -1, 'сравнение ID админа и жертвы');
        assertTrue(DELETE_USER_FN.indexOf('собственный аккаунт') !== -1,
            'понятное сообщение');
    });

    test('SRC: гард «нельзя удалить последнего админа»', () => {
        assertTrue(DELETE_USER_FN.indexOf("user.role === 'Админ'") !== -1,
            'гард только для админской роли жертвы');
        assertTrue(DELETE_USER_FN.indexOf('otherAdmins === 0') !== -1,
            'счётчик других админов');
    });

    test('SRC: сессии — с конца, по user_id ИЛИ email (легаси Task 37)', () => {
        assertTrue(DELETE_USER_FN.indexOf('sessions.length - 1') !== -1,
            'итерация с конца (deleteRow сдвигает номера)');
        const byId = DELETE_USER_FN.indexOf('Number(s.user_id) === Number(userId)');
        const byEmail = DELETE_USER_FN.indexOf('String(s.email || \'\').toLowerCase() === targetEmail');
        assertTrue(byId !== -1 && byEmail !== -1,
            'совпадение по ID и по email (пустой user_id у легаси-строк)');
    });

    test('SRC: OTP-коды жертвы удаляются по email (дыра «удалил → пересоздал → вошёл по старому коду»)', () => {
        const otpLoop = DELETE_USER_FN.indexOf("Utils.getRows('otp_codes')");
        assertTrue(otpLoop !== -1, 'читает otp_codes');
        assertTrue(DELETE_USER_FN.indexOf("Utils.deleteRow('otp_codes', otps[i].row)") !== -1,
            'удаляет строки OTP');
    });

    test('SRC: строка users удаётся последней; аудит ADMIN_DELETE_USER', () => {
        const delUsers = DELETE_USER_FN.indexOf("Utils.deleteRow('users', user.row)");
        const delOtp = DELETE_USER_FN.indexOf("Utils.deleteRow('otp_codes'");
        const delSess = DELETE_USER_FN.indexOf("Utils.deleteRow('sessions'");
        assertTrue(delUsers !== -1 && delOtp !== -1 && delSess !== -1,
            'все три листа затрагиваются');
        assertTrue(delSess < delOtp && delOtp < delUsers,
            'порядок: sessions → otp_codes → users');
        assertTrue(DELETE_USER_FN.indexOf("'ADMIN_DELETE_USER'") !== -1,
            'событие аудита');
    });
});

// ============================================================
// 2. SRC: кэш чтений — Utils.gs + Code.gs + Sessions.gs
// ============================================================
describe('Task 351 — SRC: кэш чтений на выполнение', () => {

    test('SRC: Utils._rowsCache + beginExecution + invalidateCache существуют', () => {
        assertTrue(UTILS_SRC.indexOf('_rowsCache') !== -1, 'поле кэша');
        assertTrue(BEGIN_EXEC_FN.length > 0, 'beginExecution: function');
        assertTrue(INVALIDATE_FN.length > 0, 'invalidateCache: function');
    });

    test('SRC: getRows отдаёт кэш копией (slice) — сортировки не портят кэш', () => {
        const code = stripCommentLines(GET_ROWS_FN);
        assertTrue(code.indexOf('this._rowsCache[name].slice()') !== -1,
            'возврат КОПИИ массива из кэша');
        assertTrue(code.indexOf('this._rowsCache[name] = rows') !== -1,
            'заполнение кэша после чтения');
    });

    test('SRC: ВСЕ мутации Utils сбрасывают кэш (invalidateCache)', () => {
        [APPEND_ROW_FN, DELETE_ROW_FN, SET_CELL_FN, UPDATE_USER_STATUS_FN,
         MARK_OTP_USED_FN, INCREMENT_OTP_FN].forEach(function (fn, i) {
            assertTrue(fn.indexOf('invalidateCache(') !== -1,
                'мутация #' + (i + 1) + 'сбрасывает кэш листа');
        });
    });

    test('SRC: Code.gs — doPost и hourlyCleanup сбрасывают кэш на старте', () => {
        const doPostFn = extractFn(CODE_SRC, 'function doPost');
        const hcFn = extractFn(CODE_SRC, 'function hourlyCleanup');
        assertTrue(doPostFn.indexOf('Utils.beginExecution()') !== -1,
            'doPost: beginExecution до разбора action');
        assertTrue(hcFn.indexOf('Utils.beginExecution()') !== -1,
            'hourlyCleanup: beginExecution (крон — отдельное выполнение)');
    });

    test('SRC: Code.gs — роут adminDeleteUser + гейт admin.panel', () => {
        assertTrue(CODE_SRC.indexOf("case 'adminDeleteUser':") !== -1,
            'кейс в роутере');
        assertTrue(CODE_SRC.indexOf('Admin.deleteUser(payload.token, payload.userId)') !== -1,
            'вызов Admin.deleteUser с параметрами');
        assertTrue(CODE_SRC.indexOf("'adminDeleteUser':    'admin.panel'") !== -1,
            'гейт прав: admin.panel (как у остальных админ-действий)');
    });

    test('SRC: Sessions.gs — heartbeat и getCurrentUser пишут через Utils.setCell', () => {
        const hbFn = extractFn(SESSIONS_SRC, 'heartbeat: function');
        const gcuFn = extractFn(SESSIONS_SRC, 'getCurrentUser: function');
        assertTrue(hbFn.indexOf("Utils.setCell('sessions', session.row, 6") !== -1,
            'heartbeat: last_heartbeat (F) через setCell — сброс кэша');
        assertTrue(gcuFn.indexOf("Utils.setCell('sessions', session.row, 4") !== -1,
            'getCurrentUser: role-снапшот (D) через setCell — сброс кэша');
    });
});

// ============================================================
// 3. SRC: listLogs-хвост + getConfig
// ============================================================
describe('Task 351 — SRC: listLogs-хвост и getConfig', () => {

    test('SRC: listLogs читает хвост (getLastRows), НЕ весь лист', () => {
        const code = stripCommentLines(LIST_LOGS_FN);
        assertTrue(code.indexOf("Utils.getLastRows('audit_log', limit)") !== -1,
            'чтение хвоста limit строк');
        assertTrue(code.indexOf("Utils.getRows('audit_log')") === -1,
            'полное чтение audit_log больше НЕ выполняется');
    });

    test('SRC: getLastRows существует — заголовки r4 + хвост', () => {
        const code = stripCommentLines(GET_LAST_ROWS_FN);
        assertTrue(code.indexOf('getRange(4, 1, 1, lastCol)') !== -1,
            'заголовки читаются отдельным маленьким диапазоном (r4)');
        assertTrue(code.indexOf('lastRow - take + 1') !== -1,
            'чтение стартует с последней минус take строки');
    });

    test('SRC: getConfig — числовой дефолт включает устойчивый парсинг', () => {
        const code = stripCommentLines(GET_CONFIG_FN);
        assertTrue(code.indexOf("typeof defaultValue === 'number'") !== -1,
            'ветка числового дефолта');
        assertTrue(code.indexOf('isNaN(n) || n < 1') !== -1,
            'мусор/отрицательные/ноль → дефолт');
        assertTrue(code.indexOf('console.warn') !== -1,
            'предупреждение в лог (не тихий подмен)');
    });
});

// ============================================================
// 4. VM: кэш getRows — мок SpreadsheetApp с подсчётом чтений
// ============================================================
describe('Task 351 — VM: кэш getRows', () => {

    // Мок-лист: data[0] = физическая r4 (заголовки), data[i] = r4+i.
    // Считает getValues-чтения (state.readCount) и вызовы getRange.
    function makeSheetMock(headers, rows) {
        const state = { readCount: 0, rangeCalls: [] };
        const data = [headers].concat(rows.map(function (r) { return r.slice(); }));
        const sheet = {
            getLastRow: function () { return 4 + data.length - 1; },
            getLastColumn: function () { return headers.length; },
            getRange: function (row, col, numRows, numCols) {
                state.rangeCalls.push({ row: row, col: col, numRows: numRows, numCols: numCols });
                return {
                    getValues: function () {
                        state.readCount++;
                        const out = [];
                        for (let r = row; r < row + numRows; r++) {
                            const dr = data[r - 4] || [];
                            const line = [];
                            for (let c = col; c < col + numCols; c++) line.push(dr[c - 1]);
                            out.push(line);
                        }
                        return out;
                    },
                    setValue: function (v) {
                        const dr = data[row - 4] = data[row - 4] || [];
                        dr[col - 1] = v;
                    }
                };
            },
            appendRow: function (values) { data.push(values.slice()); },
            deleteRow: function (row) { data.splice(row - 4, 1); }
        };
        return { sheet: sheet, state: state, data: data };
    }

    // Собранный из извлечённых функций мини-Utils + мок SpreadsheetApp
    function makeUtilsEnv(headers, rows) {
        const sm = makeSheetMock(headers, rows);
        const sheets = { users: sm.sheet };
        const ssMock = { getActiveSpreadsheet: function () { return { getSheetByName: function (n) { return sheets[n]; } }; } };
        const utils = {
            _sheetCache: {},
            _rowsCache: {},
            getSheet: vm.runInThisContext('(' + extractFn(UTILS_SRC, 'getSheet: function') + ')'),
            beginExecution: vm.runInThisContext('(' + BEGIN_EXEC_FN + ')'),
            invalidateCache: vm.runInThisContext('(' + INVALIDATE_FN + ')')
        };
        utils.getRows = vm.runInThisContext('(' + GET_ROWS_FN + ')');
        utils.appendRow = vm.runInThisContext('(' + APPEND_ROW_FN + ')');
        utils.deleteRow = vm.runInThisContext('(' + DELETE_ROW_FN + ')');
        utils.setCell = vm.runInThisContext('(' + SET_CELL_FN + ')');
        return { utils: utils, ssMock: ssMock, state: sm.state, data: sm.data, sm: sm };
    }

    function withSpreadsheet(env, fn) {
        const saved = globalThis.SpreadsheetApp;
        globalThis.SpreadsheetApp = env.ssMock;
        try { return fn(); } finally { globalThis.SpreadsheetApp = saved; }
    }

    const USERS_HEADERS = ['ID', 'email', 'role', 'login_status', 'last_login'];
    const USERS_ROWS = [
        [1, 'a@x.io', 'Админ', 'вход выполнен', ''],
        [2, 'b@x.io', 'КИП8', 'вход не выполнен', ''],
        [3, 'c@x.io', 'Общий доступ', 'вход не выполнен', '']
    ];

    test('VM: повторное getRows того же листа = ОДНО чтение API', () => {
        const env = makeUtilsEnv(USERS_HEADERS, USERS_ROWS);
        withSpreadsheet(env, function () {
            const r1 = env.utils.getRows('users');
            const r2 = env.utils.getRows('users');
            assertEqual(1, env.state.readCount, 'getValues вызван ОДИН раз (второй — из кэша)');
            assertEqual(3, r1.length, 'первое чтение: 3 юзера');
            assertEqual(3, r2.length, 'второе чтение: те же 3 юзера');
            assertEqual('b@x.io', r2[1].email, 'данные совпадают');
        });
    });

    test('VM: appendRow сбрасывает кэш — следующее чтение видит новую строку', () => {
        const env = makeUtilsEnv(USERS_HEADERS, USERS_ROWS);
        withSpreadsheet(env, function () {
            env.utils.getRows('users');
            env.utils.appendRow('users', [4, 'd@x.io', 'КИП8', 'вход не выполнен', '']);
            assertEqual(1, env.state.readCount, 'после appendRow кэш сброшен');
            const rows = env.utils.getRows('users');
            assertEqual(2, env.state.readCount, 'перечитал лист (getValues №2)');
            assertEqual(4, rows.length, 'новая строка видна');
            assertEqual('d@x.io', rows[3].email, 'email новой строки');
            assertEqual(8, rows[3].row, 'row новой строки = r8');
        });
    });

    test('VM: setCell и deleteRow тоже сбрасывают кэш', () => {
        const env = makeUtilsEnv(USERS_HEADERS, USERS_ROWS);
        withSpreadsheet(env, function () {
            env.utils.getRows('users');
            env.utils.setCell('users', 6, 4, 'вход выполнен');
            let rows = env.utils.getRows('users');
            assertEqual('вход выполнен', rows[1].login_status, 'setCell виден после перечитa');
            assertEqual(2, env.state.readCount, 'setCell сбросил кэш → перечит');
            env.utils.deleteRow('users', 5);
            rows = env.utils.getRows('users');
            assertEqual(3, env.state.readCount, 'deleteRow сбросил кэш → перечит');
            assertEqual(2, rows.length, 'строка удалена');
            assertEqual('b@x.io', rows[0].email, 'остальные целы');
        });
    });

    test('VM: beginExecution сбрасывает кэш (новое выполнение — новый снапшот)', () => {
        const env = makeUtilsEnv(USERS_HEADERS, USERS_ROWS);
        withSpreadsheet(env, function () {
            env.utils.getRows('users');
            // «Другая выполнение» поменяло данные напрямую в листе
            env.data.push([4, 'd@x.io', 'КИП8', 'вход не выполнен', '']);
            // БЕЗ сброса — старый снапшот (это и есть опасность переиспользования)
            assertEqual(3, env.utils.getRows('users').length, 'без beginExecution — устаревший кэш');
            env.utils.beginExecution();
            assertEqual(4, env.utils.getRows('users').length, 'после beginExecution — свежие данные');
            assertEqual(2, env.state.readCount, 'сброс привёл к перечитa');
        });
    });

    test('VM: сортировка возвращённого массива НЕ портит кэш (slice)', () => {
        const env = makeUtilsEnv(USERS_HEADERS, USERS_ROWS);
        withSpreadsheet(env, function () {
            const rows = env.utils.getRows('users');
            rows.sort(function (a, b) { return b.ID - a.ID; }); // мутируем копию
            assertEqual(3, rows[0].ID, 'копия отсортирована по убыванию');
            const fresh = env.utils.getRows('users');
            assertEqual(1, fresh[0].ID, 'кэш не затронут — порядок прежний');
        });
    });
});

// ============================================================
// 5. VM: getLastRows — хвост листа вместо полного чтения
// ============================================================
describe('Task 351 — VM: getLastRows (хвост)', () => {

    function makeTailEnv(nRows) {
        const headers = ['timestamp', 'email', 'action', 'ip', 'user_agent', 'details'];
        const rows = [];
        for (let i = 0; i < nRows; i++) {
            rows.push([new Date(Date.now() - (nRows - i) * 60000), 'u' + i + '@x.io', 'E' + i, '', '', 'd' + i]);
        }
        const lastRow = 4 + nRows;
        const state = { rangeCalls: [] };
        const sheet = {
            getLastRow: function () { return lastRow; },
            getLastColumn: function () { return headers.length; },
            getRange: function (row, col, numRows, numCols) {
                state.rangeCalls.push({ row: row, numRows: numRows });
                return {
                    getValues: function () {
                        if (row === 4 && numRows === 1) return [headers];
                        const out = [];
                        for (let r = row; r < row + numRows; r++) {
                            out.push(rows[r - 5].slice());
                        }
                        return out;
                    }
                };
            }
        };
        const utils = { getSheet: function (n) { return n === 'audit_log' ? sheet : null; } };
        return { utils: utils, state: state, rows: rows };
    }

    test('VM: getLastRows читает ТОЛЬКО хвост (диапазон от lastRow-take+1)', () => {
        const env = makeTailEnv(1000);
        const fn = vm.runInThisContext('(' + GET_LAST_ROWS_FN + ')');
        const rows = fn.call(env.utils, 'audit_log', 100);
        assertEqual(2, env.state.rangeCalls.length, 'ровно два чтения: заголовки + хвост');
        assertEqual(100, rows.length, 'сто строк хвоста');
        // физические строки 905..1004 (lastRow=1004, take=100)
        assertEqual(905, env.state.rangeCalls[1].row, 'чтение стартует с r905, НЕ с r4');
        assertEqual(100, env.state.rangeCalls[1].numRows, 'размер чтения = limit');
        assertEqual(905, rows[0].row, 'row первого объекта — реальный номер строки');
        assertEqual(1004, rows[99].row, 'row последнего — низ листа');
        // последние события внизу: у хвоста email свежее
        assertEqual('u999@x.io', rows[99].email, 'в хвост попадают ПОСЛЕДНИЕ строки');
    });

    test('VM: count больше данных — отдаются все строки', () => {
        const env = makeTailEnv(7);
        const fn = vm.runInThisContext('(' + GET_LAST_ROWS_FN + ')');
        const rows = fn.call(env.utils, 'audit_log', 500);
        assertEqual(7, rows.length, 'всего 7 строк — все возвращены');
    });

    test('VM: count < 1 / пустой лист — пустой ответ без падения', () => {
        const env = makeTailEnv(3);
        const fn = vm.runInThisContext('(' + GET_LAST_ROWS_FN + ')');
        assertEqual(0, fn.call(env.utils, 'audit_log', 0).length, 'count=0 → []');
        assertEqual(0, fn.call(env.utils, 'audit_log', -5).length, 'count<0 → []');
        assertEqual(0, fn.call(env.utils, 'unknown_sheet', 10).length, 'листа нет → []');
    });
});

// ============================================================
// 6. VM: listLogs — хвост + сортировка + лимит-кламп
// ============================================================
describe('Task 351 — VM: listLogs', () => {

    test('VM: сортировка по убыванию timestamp, формат полей прежний, лимит-кламп 500', () => {
        const t1 = new Date(Date.now() - 300000);
        const t2 = new Date(Date.now() - 200000);
        const t3 = new Date(Date.now() - 100000);
        let asked = null;
        const UtilsMock = {
            getLastRows: function (name, limit) {
                asked = { name: name, limit: limit };
                // «свежее внизу», но с выбитой из порядка строкой (страховка-сорт)
                return [
                    { row: 10, timestamp: t2, email: 'b@x.io', action: 'A2', ip: '', details: 'd2' },
                    { row: 11, timestamp: t3, email: 'c@x.io', action: 'A3', ip: '', details: 'd3' },
                    { row: 12, timestamp: t1, email: 'a@x.io', action: 'A1', ip: '', details: 'd1' }
                ];
            }
        };
        const thisArg = { _requireAdmin: function () { return {}; } };
        const res = runWithGlobals({ Utils: UtilsMock }, LIST_LOGS_FN, thisArg, ['tok', 1000]);
        assertEqual('audit_log', asked.name, 'лист — audit_log');
        assertEqual(500, asked.limit, 'кламп: 1000 → 500');
        assertEqual(3, res.length, 'все строки хвоста');
        assertEqual('c@x.io', res[0].email, 'новейший первым (сортировка работает)');
        assertEqual('a@x.io', res[2].email, 'старейший последним');
        assertEqual('A3', res[0].action, 'поле action на месте');
        assertEqual('d3', res[0].details, 'поле details на месте');
        assertEqual(t3, res[0].timestamp, 'поле timestamp на месте');
    });

    test('VM: _requireAdmin отклоняет не-админа ДО чтения листа', () => {
        const UtilsMock = {
            getLastRows: function () { throw new Error('не должен читаться'); }
        };
        const thisArg = { _requireAdmin: function () { throw new Error('Forbidden: admin role required'); } };
        assertThrows(function () {
            runWithGlobals({ Utils: UtilsMock }, LIST_LOGS_FN, thisArg, ['tok', 100]);
        }, 'не-админ не получает логи');
    });
});

// ============================================================
// 7. VM: getConfig — устойчивый числовой парсинг
// ============================================================
describe('Task 351 — VM: getConfig (устойчивость)', () => {

    function runGetConfig(configRows, key, def) {
        const fn = vm.runInThisContext('(' + GET_CONFIG_FN + ')');
        const thisArg = { getRows: function (name) { return name === 'config' ? configRows : []; } };
        const warns = [];
        const savedWarn = console.warn;
        console.warn = function (msg) { warns.push(String(msg)); };
        try {
            const val = fn.call(thisArg, key, def);
            return { val: val, warns: warns };
        } finally {
            console.warn = savedWarn;
        }
    }

    const cases = [
        // [ключ, значение в листе, дефолт, ожидание, warns?]
        ['STALE_SESSION_DAYS', '', 30, 30, true,  'пустое значение → дефолт (было: 0 → снос всех сессий)'],
        ['STALE_SESSION_DAYS', 'abc', 30, 30, true, 'мусор → дефолт'],
        ['STALE_SESSION_DAYS', '-5', 30, 30, true, 'отрицательное → дефолт'],
        ['STALE_SESSION_DAYS', '0', 30, 30, true, 'ноль дней → дефолт (0 = снос всего)'],
        ['AUDIT_LOG_RETENTION_DAYS', 0, 90, 90, true, 'числовой 0 → дефолт'],
        ['OTP_CODE_LENGTH', '6', 6, 6, false, 'строка-число парсится'],
        ['OTP_TTL_MINUTES', 10, 10, 10, false, 'число проходит'],
        ['STALE_SESSION_DAYS', ' 30 ', 30, 30, false, 'пробелы триммятся'],
        ['STALE_SESSION_DAYS', '30 дней', 30, 30, false, 'мягкий parseInt: «30 дней» → 30'],
        ['MAX_OTP_ATTEMPTS', '5x', 5, 5, false, '«5x» → 5 (parseInt)'],
        ['SESSION_TOKEN_LENGTH', 33, 32, 33, false, 'нестандартное валидное число — как записано']
    ];
    cases.forEach(function (c) {
        test('VM: ' + c[0] + ' = ' + JSON.stringify(c[1]) + ' → ' + c[3] + ' (' + c[5] + ')', () => {
            const rows = [{ key: c[0], value: c[1] }];
            const r = runGetConfig(rows, c[0], c[2]);
            assertEqual(c[3], r.val, c[5]);
            assertEqual(c[4] ? 1 : 0, r.warns.length, c[4] ? 'мусор логируется warn-ом' : 'валидное — без warn');
        });
    });

    test('VM: строковый дефолт — прежнее поведение (passthrough)', () => {
        const rows = [{ key: 'SUPPORT_REPLY_TO', value: 'support@x.io' }];
        const r = runGetConfig(rows, 'SUPPORT_REPLY_TO', '');
        assertEqual('support@x.io', r.val, 'строка как есть');
        assertEqual(0, r.warns.length, 'warn не пишется');
    });

    test('VM: строковый дефолт, числоподобная строка — как раньше число', () => {
        const rows = [{ key: 'SOME_STR_KEY', value: '123' }];
        const r = runGetConfig(rows, 'SOME_STR_KEY', 'fallback');
        assertEqual(123, r.val, 'строковый ключ + «123» → 123 (регрессии нет)');
    });

    test('VM: ключа нет — дефолт без warn', () => {
        const r = runGetConfig([], 'STALE_SESSION_DAYS', 30);
        assertEqual(30, r.val, 'ключ отсутствует → дефолт');
        assertEqual(0, r.warns.length, 'не ругается на отсутствующий ключ');
    });
});

// ============================================================
// 8. VM: deleteUser — полный прогон на мок-листах
// ============================================================
describe('Task 351 — VM: deleteUser', () => {

    function makeEnv(users, sessions, otps) {
        const calls = { audits: [], deletedSessions: [], deletedOtps: [], deletedUsers: [] };
        const env = {
            users: users, sessions: sessions, otps: otps, calls: calls,
            Utils: {
                withLock: function (fn) { return fn(); },
                findUserById: function (id) {
                    return env.users.filter(function (u) { return Number(u.ID) === Number(id); })[0] || null;
                },
                getRows: function (name) {
                    const src = name === 'users' ? env.users : (name === 'sessions' ? env.sessions : env.otps);
                    return src.map(function (r) { return Object.assign({}, r); });
                },
                deleteRow: function (sheet, row) {
                    if (sheet === 'sessions') {
                        calls.deletedSessions.push(row);
                        env.sessions = env.sessions.filter(function (s) { return s.row !== row; });
                    } else if (sheet === 'otp_codes') {
                        calls.deletedOtps.push(row);
                        env.otps = env.otps.filter(function (o) { return o.row !== row; });
                    } else if (sheet === 'users') {
                        calls.deletedUsers.push(row);
                        env.users = env.users.filter(function (u) { return u.row !== row; });
                    }
                },
                audit: function (email, action, ip, ua, details) {
                    calls.audits.push({ email: email, action: action, details: details });
                }
            }
        };
        return env;
    }

    const ADMIN = { ID: 1, email: 'admin@x.io', role: 'Админ', login_status: 'вход выполнен', row: 5 };
    const VICTIM = { ID: 7, email: 'victim@x.io', role: 'КИП8', login_status: 'вход выполнен', row: 6 };
    const OTHER = { ID: 9, email: 'other@x.io', role: 'КИП8', login_status: 'вход не выполнен', row: 7 };

    function runDeleteUser(env, admin, userId) {
        const thisArg = { _requireAdmin: function () { return admin; } };
        return runWithGlobals({ Utils: env.Utils, console: { warn: function () {} } },
            DELETE_USER_FN, thisArg, ['admintoken', userId]);
    }

    test('VM: happy path — сессии (в т.ч. легаси по email), OTP и юзер удалены; чужие целы', () => {
        const sessions = [
            { row: 5, user_id: 7, email: 'victim@x.io', role: 'КИП8' },       // по user_id
            { row: 6, user_id: '', email: 'victim@x.io', role: 'КИП8' },      // легаси Task 37 (пустой user_id)
            { row: 7, user_id: 9, email: 'other@x.io', role: 'КИП8' },        // ЧУЖАЯ — цел
            { row: 8, user_id: 7, email: 'victim@x.io', role: 'КИП8' }        // по user_id
        ];
        const otps = [
            { row: 5, email: 'victim@x.io', code: '123456' },
            { row: 6, email: 'other@x.io', code: '654321' }
        ];
        const env = makeEnv([ADMIN, VICTIM, OTHER], sessions, otps);
        const res = runDeleteUser(env, ADMIN, 7);

        assertTrue(res.ok, 'ok: true');
        assertEqual('victim@x.io', res.deleted, 'email удалённого в ответе');
        assertEqual(3, res.sessionsRemoved, 'три сессии жертвы (включая легаси по email)');
        assertEqual(1, res.otpsRemoved, 'одна OTP-строка жертвы');
        assertEqual(1, env.sessions.length, 'чужая сессия цела');
        assertEqual('other@x.io', env.sessions[0].email, 'осталась сессия другого юзера');
        assertEqual(1, env.otps.length, 'чужой OTP цел');
        assertEqual(2, env.users.length, 'админ и другой юзер целы');
        assertEqual(6, env.calls.deletedUsers[0], 'удалена строка users r6 (жертва)');
        // порядок удалений: sessions → otp_codes → users
        assertTrue(env.calls.deletedSessions.length > 0 && env.calls.deletedOtps.length > 0,
            'удаления во всех трёх листах');
        // аудит
        assertEqual('ADMIN_DELETE_USER', env.calls.audits[0].action, 'событие аудита');
        assertEqual('admin@x.io', env.calls.audits[0].email, 'кто удалил');
        assertTrue(env.calls.audits[0].details.indexOf('victim@x.io') !== -1,
            'email жертвы в деталях');
    });

    test('VM: юзер не найден — «User not found», ничего не удалено', () => {
        const env = makeEnv([ADMIN, VICTIM], [], []);
        let err = null;
        try { runDeleteUser(env, ADMIN, 999); } catch (e) { err = e; }
        assertTrue(err !== null, 'брошено исключение');
        assertEqual('User not found', err.message, 'понятное сообщение');
        assertEqual(2, env.users.length, 'users не тронуты');
        assertEqual(0, env.calls.audits.length, 'аудита нет');
    });

    test('VM: самоудаление запрещено', () => {
        const env = makeEnv([ADMIN, VICTIM], [{ row: 5, user_id: 1, email: 'admin@x.io' }], []);
        let err = null;
        try { runDeleteUser(env, ADMIN, 1); } catch (e) { err = e; }
        assertTrue(err !== null, 'брошено исключение');
        assertEqual('Нельзя удалить собственный аккаунт', err.message, 'гард «нельзя себя»');
        assertEqual(2, env.users.length, 'удалений нет');
        assertEqual(1, env.sessions.length, 'сессии не тронуты');
    });

    test('VM: последнего админа удалить нельзя (жертва — единственная админ-строка)', () => {
        // Гард — защита на сломанном инварианте: вызывающий админ по какой-то
        // причине НЕ представлен строкой в users (удалён параллельно / ручной
        // вызов), а жертва — единственная строка с ролью «Админ».
        // В нормальном флоу (вызывающий в users) otherAdmins ≥ 1 всегда.
        const onlyAdminRow = { ID: 2, email: 'admin2@x.io', role: 'Админ', login_status: 'вход выполнен', row: 6 };
        const plainUser = { ID: 9, email: 'other@x.io', role: 'КИП8', login_status: 'вход не выполнен', row: 7 };
        const env = makeEnv([onlyAdminRow, plainUser], [], []);
        let err = null;
        try { runDeleteUser(env, ADMIN, 2); } catch (e) { err = e; }
        assertTrue(err !== null, 'брошено исключение');
        assertEqual('Нельзя удалить последнего администратора', err.message, 'гард последнего админа');
        assertEqual(2, env.users.length, 'никто не удалён');
    });

    test('VM: НЕ последнего админа удалить можно (вызывающий — второй админ)', () => {
        // row УНИКАЛЬНЫЙ (8) — не совпадает с VICTIM.row (6): мок-фильтр
        // удаляет по номеру строки, дубликаты исказили бы счёт
        const secondAdmin = { ID: 2, email: 'admin2@x.io', role: 'Админ', login_status: 'вход выполнен', row: 8 };
        const env = makeEnv([ADMIN, secondAdmin, VICTIM], [], []);
        const res = runDeleteUser(env, ADMIN, 2);
        assertTrue(res.ok, 'второй админ удалён (первый остался)');
        assertEqual(2, env.users.length, 'остались админ-инициатор и жертва-не-админ');
        assertEqual(8, env.calls.deletedUsers[0], 'удалена строка r8 (secondAdmin)');
    });

    test('VM: письмо-детали аудита содержат счётчики', () => {
        const env = makeEnv([ADMIN, VICTIM],
            [{ row: 5, user_id: 7, email: 'victim@x.io' }], []);
        runDeleteUser(env, ADMIN, 7);
        const d = env.calls.audits[0].details;
        assertTrue(d.indexOf('1 session(s)') !== -1, 'число сессий в деталях');
        assertTrue(d.indexOf('0 otp row(s)') !== -1, 'число OTP в деталях');
    });
});
