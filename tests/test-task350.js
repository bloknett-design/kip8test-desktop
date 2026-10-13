// tests/test-task350.js
// Task 350 — замки на ПОСЛЕДНИЕ мутации без Utils.withLock + батч-удаления.
//
// Контекст (2026-09-09, аудит после Task 349, пункты 1+2 одним деплоем):
//   1. Гонки, не закрытые Task 348:
//      a) крон-чистки cleanupExpiredSessions / cleanupExpiredOtpCodes /
//         cleanupOldAuditLogs работали БЕЗ замка параллельно запросам
//         юзеров (heartbeat/logout/deleteRow) — чужое удаление между
//         чтением и deleteRow сдвигает номера строк → крон удалял ЧУЖУЮ
//         строку;
//      b) в verifyOTP поиск OTP/истечение/инкремент попыток шли ДО замка:
//         otp.row из внешнего чтения мог устареть (чистка otp_codes), а
//         ДВОЙНОЙ submit одного кода — оба запроса читали «unused» ДО
//         замка, второй входил после первого и создавал ВТОРУЮ сессию
//         (дыра, которую замок Task 348 не перекрывал);
//      c) в sendOTP кулдаун-чек и appendRow('otp_codes') были без замка:
//         два ОДНОВРЕМЕННЫХ запроса кода оба проходили кулдаун по ещё
//         не записанной строке (TOCTOU) → 2 письма и 2 строки за 60 сек.
//   2. Производительность чисток: audit_log (90 дней) и otp_codes —
//      append-only → просроченное = сплошной блок СВЕРХУ → один
//      deleteRows(5, N) вместо deleteRow на каждую строку (сотни
//      API-вызовов → один; лимит 6 мин триггера). cleanupExpiredSessions
//      читает users ОДИН раз (было findUserById на каждую строку = O(n²)).
//
// Проверки: SRC-гарды + VM-прогоны (мок-листы, мок-замок с подсчётом):
// батч-удаления, страховочный проход, двойной submit, кулдаун под
// замком, MailApp вне замка, ошибки попыток/истечения/Запрета.
//
// Запуск: через tests/run-all.js (require './test-task350.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const UTILS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Utils.gs'), 'utf8');
const AUTH_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Auth.gs'), 'utf8');

// ============================================================
// Извлечение функции из .gs по маркеру (по образцу test-task348/349.js)
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

const CLEANUP_EXPIRED_FN = extractFn(UTILS_SRC, 'cleanupExpiredSessions: function');
const CLEANUP_OTP_FN = extractFn(UTILS_SRC, 'cleanupExpiredOtpCodes: function');
const CLEANUP_LOGS_FN = extractFn(UTILS_SRC, 'cleanupOldAuditLogs: function');
const INCREMENT_FN = extractFn(UTILS_SRC, 'incrementOtpAttempts: function');
const SEND_OTP_FN = extractFn(AUTH_SRC, 'sendOTP: function');
const VERIFY_OTP_FN = extractFn(AUTH_SRC, 'verifyOTP: function');

// Убрать строки-комментарии (JSDoc «* …», «// …») — SRC-ассерты должны
// смотреть ТОЛЬКО на живой код: комментарии Task 350 упоминают имена
// удаляемых хелперов (некрологи) и старые паттерны (по образцу 349).
function stripCommentLines(src) {
    return src.split('\n').filter(function (l) {
        return !/^\s*(\*|\/\/)/.test(l);
    }).join('\n');
}

const CLEANUP_EXPIRED_CODE = stripCommentLines(CLEANUP_EXPIRED_FN);
const CLEANUP_OTP_CODE = stripCommentLines(CLEANUP_OTP_FN);
const CLEANUP_LOGS_CODE = stripCommentLines(CLEANUP_LOGS_FN);
const SEND_OTP_CODE = stripCommentLines(SEND_OTP_FN);
const VERIFY_OTP_CODE = stripCommentLines(VERIFY_OTP_FN);

// ============================================================
// Прогон функции с ВРЕМЕННЫМИ глобалами через runInThisContext:
// даты main-realm остаются instanceof Date (в runInNewContext это
// ломается — чужой realm), а Utils/Sessions/MailApp подменяются.
// ============================================================
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
// 1. SRC: три крон-чистки под замком
// ============================================================
describe('Task 350 — SRC: крон-чистки под Utils.withLock', () => {

    test('SRC: cleanupExpiredSessions обёрнут в withLock (таймаут 30 сек)', () => {
        assertTrue(CLEANUP_EXPIRED_FN.indexOf('Utils.withLock') !== -1,
            'чистка сирот под замком (крон бежит параллельно запросам юзеров)');
        assertTrue(CLEANUP_EXPIRED_FN.indexOf('30000') !== -1,
            'увеличенный таймаут для большого листа');
    });

    test('SRC: cleanupExpiredOtpCodes обёрнут в withLock (таймаут 30 сек)', () => {
        assertTrue(CLEANUP_OTP_FN.indexOf('Utils.withLock') !== -1,
            'чистка OTP под замком');
        assertTrue(CLEANUP_OTP_FN.indexOf('30000') !== -1, 'таймаут 30 сек');
    });

    test('SRC: cleanupOldAuditLogs обёрнут в withLock (таймаут 30 сек)', () => {
        assertTrue(CLEANUP_LOGS_FN.indexOf('Utils.withLock') !== -1,
            'чистка логов под замком');
        assertTrue(CLEANUP_LOGS_FN.indexOf('30000') !== -1, 'таймаут 30 сек');
    });

    test('SRC: cleanupExpiredSessions читает users ОДИН раз (без findUserById в цикле)', () => {
        assertTrue(CLEANUP_EXPIRED_CODE.indexOf("this.getRows('users')") !== -1,
            'один getRows(users) с индексом живых ID');
        assertTrue(CLEANUP_EXPIRED_CODE.indexOf('findUserById') === -1,
            'findUserById больше НЕ вызывается (было O(n²) перечитов листа)');
    });

    test('SRC: чистки возвращают число удалённых строк', () => {
        [CLEANUP_EXPIRED_FN, CLEANUP_OTP_FN, CLEANUP_LOGS_FN].forEach(function (fn, i) {
            assertTrue(fn.indexOf('return removed') !== -1,
                'чистка #' + (i + 1) + ' возвращает removed');
        });
    });
});

// ============================================================
// 2. SRC: батч-удаления deleteRows(5, N)
// ============================================================
describe('Task 350 — SRC: батч-удаления чисток', () => {

    test('SRC: cleanupExpiredOtpCodes — один deleteRows(5, N) + страховка с конца', () => {
        // Task 351: батч через Utils.deleteRows (сброс кэша чтений) —
        // тот же вызов deleteRows(5, prefix), но хелпером
        assertTrue(CLEANUP_OTP_FN.indexOf("this.deleteRows('otp_codes', 5, prefix)") !== -1,
            'сплошной верхний блок срезается одним вызовом');
        assertTrue(CLEANUP_OTP_FN.indexOf('rows[i].row - prefix') !== -1,
            'страховочный проход учитывает сдвиг номеров после батча');
    });

    test('SRC: cleanupOldAuditLogs — один deleteRows(5, N) + страховка с конца', () => {
        // Task 351: батч через Utils.deleteRows (сброс кэша чтений)
        assertTrue(CLEANUP_LOGS_FN.indexOf("this.deleteRows('audit_log', 5, prefix)") !== -1,
            'батч-срез просроченного блока логов');
        assertTrue(CLEANUP_LOGS_FN.indexOf('rows[i].row - prefix') !== -1,
            'страховка для выбившихся из хронологии строк');
    });

    test('SRC: incrementOtpAttempts возвращает НОВОЕ значение счётчика', () => {
        assertTrue(INCREMENT_FN.indexOf('return next') !== -1,
            'возвращает next = cur + 1 (verifyOTP считает попытки из атомарного инкремента)');
    });
});

// ============================================================
// 3. SRC: verifyOTP — пере-чтение OTP внутри замка
// ============================================================
describe('Task 350 — SRC: verifyOTP — всё под одним замком', () => {

    test('SRC: поиск OTP (getActiveOtpForEmail) — ТОЛЬКО внутри замка', () => {
        const lockIdx = VERIFY_OTP_CODE.indexOf('Utils.withLock(function()');
        assertTrue(lockIdx !== -1, 'замок есть');
        const first = VERIFY_OTP_CODE.indexOf('getActiveOtpForEmail');
        assertTrue(first > lockIdx,
            'getActiveOtpForEmail вызывается после входа в замок (пере-чтение)');
        // вторая дыра Task 348: otp читался ДО замка → двойной submit
    });

    test('SRC: инкремент попыток — внутри замка, otp.attempts читается ТОЛЬКО под замком', () => {
        // Task 350: счётчик больше НЕ читается из внешнего (до-замкового)
        // чтения — гонка теряла инкременты. Task 352 добавил чтение
        // otp.attempts в guard дешёвого отказа — оно идёт ПОД замком из
        // свеже-прочитанной строки, что паттерну 350 не противоречит.
        const lockIdx = VERIFY_OTP_CODE.indexOf('Utils.withLock(function()');
        const attemptsReadIdx = VERIFY_OTP_CODE.indexOf('otp.attempts');
        assertTrue(attemptsReadIdx > lockIdx,
            'чтение счётчика только ПОД замком (внешнего чтения нет)');
        assertTrue(VERIFY_OTP_CODE.indexOf('Utils.incrementOtpAttempts') > lockIdx,
            'инкремент внутри замка');
    });

    test('SRC: гард удаления юзера внутри замка (null-прочтение ≠ TypeError)', () => {
        assertTrue(VERIFY_OTP_CODE.indexOf('User deleted during verification') !== -1,
            'юзер, удалённый между пред-проверкой и замком, обрабатывается явно');
    });

    test('SRC: аудит успешного входа — внутри замка (appendRow не сдвигает чужие строки)', () => {
        const lockIdx = VERIFY_OTP_CODE.indexOf('Utils.withLock(function()');
        assertTrue(VERIFY_OTP_CODE.indexOf("'LOGIN_SUCCESS'") > lockIdx,
            'LOGIN_SUCCESS пишется внутри замка');
        assertTrue(VERIFY_OTP_CODE.indexOf("'OTP_VERIFIED'") > lockIdx,
            'OTP_VERIFIED пишется внутри замка');
    });
});

// ============================================================
// 4. SRC: sendOTP — кулдаун и appendRow под замком
// ============================================================
describe('Task 350 — SRC: sendOTP — секция мутаций под замком', () => {

    test('SRC: кулдаун и запись OTP — ВНУТРИ замка (Task 352: email-блок удалён)', () => {
        const lockIdx = SEND_OTP_CODE.indexOf('Utils.withLock(function()');
        assertTrue(lockIdx !== -1, 'замок есть');
        assertTrue(SEND_OTP_CODE.indexOf('countRecentOtpFails') === -1,
            'Task 352: email-блок sendOTP удалён (мягкий DoS закрыт)');
        assertTrue(SEND_OTP_CODE.indexOf('getLastOtpForEmail') > lockIdx,
            'кулдаун проверяется внутри замка');
        assertTrue(SEND_OTP_CODE.indexOf("appendRow('otp_codes'") > lockIdx,
            'запись OTP внутри замка (TOCTOU кулдауна закрыт)');
    });

    test('SRC: письмо отправляется ПОСЛЕ секции замка', () => {
        const appendIdx = SEND_OTP_CODE.indexOf("appendRow('otp_codes'");
        const lockEnd = SEND_OTP_CODE.indexOf('});', appendIdx);
        const mailIdx = SEND_OTP_CODE.indexOf('MailApp.sendEmail');
        assertTrue(lockEnd !== -1 && mailIdx > lockEnd,
            'MailApp.sendEmail за пределами критической секции');
    });
});

// ============================================================
// 5. VM: чистки на мок-листах
// ============================================================
describe('Task 350 — VM: батч-чистка audit_log', () => {

    function makeCleanupEnv() {
        const calls = {
            withLock: 0, timeouts: [], batchDeletes: [], rowDeletes: [],
            audits: [], findUserById: 0
        };
        const env = {
            sheets: { audit_log: [], otp_codes: [], sessions: [], users: [] },
            calls: calls
        };
        env.mockUtils = {
            withLock: function (fn, timeout) {
                calls.withLock++; calls.timeouts.push(timeout);
                return fn();
            },
            getRows: function (name) {
                return env.sheets[name].map(function (r) { return Object.assign({}, r); });
            },
            getSheet: function (name) {
                return {
                    deleteRows: function (row, n) {
                        calls.batchDeletes.push({ sheet: name, row: row, n: n });
                        env.sheets[name].splice(row - 5, n);
                    }
                };
            },
            // Task 351: чистки режут батчем через Utils.deleteRows
            // (обёртка со сбросом кэша чтений) — мок дублирует логику
            // getSheet().deleteRows в тот же calls.batchDeletes
            deleteRows: function (name, row, n) {
                calls.batchDeletes.push({ sheet: name, row: row, n: n });
                env.sheets[name].splice(row - 5, n);
            },
            deleteRow: function (name, row) {
                calls.rowDeletes.push({ sheet: name, row: row });
                // ПОЗИЦИОННО (как реальный Sheet): строка R = индекс R - 5.
                // Поле .row в env остаётся СТАРЫМ после батча — реальные
                // номера живут в позициях массива, поля не пересчитываются.
                env.sheets[name].splice(row - 5, 1);
            },
            audit: function (email, action) { calls.audits.push(action); },
            getConfig: function (key, def) { return def; },
            findUserById: function () { calls.findUserById++; return null; }
        };
        return env;
    }

    function runCleanup(env, code) {
        return runWithGlobals({ Utils: env.mockUtils, console: { log: function () {} } },
            code, env.mockUtils, []);
    }

    const OLD = function () { return new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); };
    const FRESH = function () { return new Date(); };

    test('VM: сплошной блок просроченных сверху — ОДИН deleteRows, без deleteRow', () => {
        const env = makeCleanupEnv();
        env.sheets.audit_log = [
            { row: 5, timestamp: OLD() }, { row: 6, timestamp: OLD() }, { row: 7, timestamp: OLD() },
            { row: 8, timestamp: FRESH() }, { row: 9, timestamp: FRESH() }
        ];
        const removed = runCleanup(env, CLEANUP_LOGS_FN);
        assertEqual(3, removed, 'удалено 3 строки');
        assertEqual(1, env.calls.batchDeletes.length, 'ровно один батч-вызов');
        assertEqual(5, env.calls.batchDeletes[0].row, 'срез начинается с r5');
        assertEqual(3, env.calls.batchDeletes[0].n, 'срезаны 3 строки');
        assertEqual(0, env.calls.rowDeletes.length, 'последовательных deleteRow НЕТ');
        assertEqual(2, env.sheets.audit_log.length, 'осталось 2 свежие строки');
        assertEqual(1, env.calls.withLock, 'замок взят');
        assertEqual(30000, env.calls.timeouts[0], 'таймаут 30 сек');
    });

    test('VM: строка выбилась из хронологии — батч + страховочный проход с конц', () => {
        const env = makeCleanupEnv();
        // r5 старая, r6 СВЕЖАЯ (вставлена руками), r7 старая — не хронология
        env.sheets.audit_log = [
            { row: 5, timestamp: OLD() },
            { row: 6, timestamp: FRESH() },
            { row: 7, timestamp: OLD() }
        ];
        const removed = runCleanup(env, CLEANUP_LOGS_FN);
        assertEqual(2, removed, 'удалены обе старые строки');
        assertEqual(1, env.calls.batchDeletes.length, 'батч срезал верхнюю старую');
        assertEqual(1, env.calls.batchDeletes[0].n, 'батч = 1 строка');
        assertEqual(1, env.calls.rowDeletes.length, 'нижняя старая — страховочным deleteRow');
        // номер после батча: r7 сдвинулась на r6 (row - prefix = 7 - 1)
        assertEqual(6, env.calls.rowDeletes[0].row, 'сдвиг номера учтён (7 - 1)');
        assertEqual(1, env.sheets.audit_log.length, 'осталась только свежая');
        assertEqual(6, env.sheets.audit_log[0].row, 'номер строки актуален');
    });

    test('VM: пустой лист — ноль вызовов, ноль удалений', () => {
        const env = makeCleanupEnv();
        const removed = runCleanup(env, CLEANUP_LOGS_FN);
        assertEqual(0, removed, 'ничего не удалено');
        assertEqual(0, env.calls.batchDeletes.length, 'батчей нет');
        assertEqual(0, env.calls.rowDeletes.length, 'deleteRow нет');
        assertEqual(1, env.calls.withLock, 'замок всё равно взят (единый вход)');
    });

    test('VM: cleanupExpiredOtpCodes — батч по expires_at', () => {
        const env = makeCleanupEnv();
        env.sheets.otp_codes = [
            { row: 5, expires_at: OLD() }, { row: 6, expires_at: OLD() },
            { row: 7, expires_at: new Date(Date.now() + 3600 * 1000) }
        ];
        const removed = runCleanup(env, CLEANUP_OTP_FN);
        assertEqual(2, removed, 'удалены 2 истёкших кода');
        assertEqual(1, env.calls.batchDeletes.length, 'один батч');
        assertEqual(2, env.calls.batchDeletes[0].n, 'срезано 2');
        assertEqual(0, env.calls.rowDeletes.length, 'deleteRow нет');
        assertEqual(1, env.sheets.otp_codes.length, 'живой код остался');
    });

    test('VM: cleanupExpiredSessions — сироты удалены, живые целы, users читается ОДИН раз', () => {
        const env = makeCleanupEnv();
        env.sheets.users = [
            { ID: 7, row: 5 }, { ID: 8, row: 6 }
        ];
        env.sheets.sessions = [
            { row: 5, user_id: 7, email: 'a@x.io' },
            { row: 6, user_id: '8', email: 'b@x.io' },   // строковый ID — Number-приведение
            { row: 7, user_id: 99, email: 'gone@x.io' }, // сирота (юзер удалён)
            { row: 8, user_id: '', email: 'legacy@x.io' } // легаси без user_id — сирота
        ];
        const removed = runCleanup(env, CLEANUP_EXPIRED_FN);
        assertEqual(2, removed, 'удалены 2 строки-сироты');
        assertEqual(2, env.sheets.sessions.length, 'живые сессии целы');
        assertTrue(env.sheets.sessions.some(function (s) { return s.user_id === 7; }) &&
            env.sheets.sessions.some(function (s) { return s.user_id === '8'; }),
            'юзеры 7 и 8 остались');
        assertEqual(2, env.calls.audits.filter(function (a) { return a === 'SESSION_CLEANUP_ORPHAN'; }).length,
            'аудит по каждой удалённой');
        assertEqual(0, env.calls.findUserById, 'findUserById НЕ вызывался ни разу (индекс вместо цикла)');
        assertEqual(1, env.calls.withLock, 'замок взят');
    });
});

// ============================================================
// 6. VM: verifyOTP — двойной submit и ошибки
// ============================================================
describe('Task 350 — VM: verifyOTP', () => {

    function makeAuthEnv() {
        const calls = {
            withLock: 0, lockHeld: 0, sessions: [], audits: [],
            markUsed: [], increments: [], statusUpdates: [], sdp: []
        };
        const env = {
            users: [{
                ID: 7, email: 'u@x.io', role: 'КИП8',
                login_status: 'вход не выполнен', last_login: '', row: 5
            }],
            otpRows: [{
                row: 5, email: 'u@x.io', code: '123456', used: false,
                attempts: 0,
                expires_at: new Date(Date.now() + 10 * 60 * 1000),
                created_at: new Date()
            }],
            calls: calls,
            findUserByEmailSeq: null
        };
        const mockUtils = {
            normalizeEmail: function (raw) {
                const s = String(raw || '').toLowerCase().trim();
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
            },
            findUserByEmail: function (email) {
                if (env.findUserByEmailSeq) { return env.findUserByEmailSeq.shift() || null; }
                return env.users.filter(function (u) { return u.email === email; })[0] || null;
            },
            getActiveOtpForEmail: function (email) {
                const rows = env.otpRows.filter(function (r) {
                    return String(r.email) === String(email)
                        && r.used !== true && String(r.used).toUpperCase() !== 'TRUE';
                });
                return rows.length ? rows[rows.length - 1] : null;
            },
            markOtpUsed: function (row) {
                calls.markUsed.push(row);
                const r = env.otpRows.filter(function (x) { return x.row === row; })[0];
                if (r) r.used = true;
            },
            incrementOtpAttempts: function (row) {
                const r = env.otpRows.filter(function (x) { return x.row === row; })[0];
                if (r) r.attempts++;
                const v = r ? r.attempts : 1;
                calls.increments.push(v);
                return v;
            },
            getConfig: function (key, def) { return def; },
            withLock: function (fn) {
                calls.withLock++; calls.lockHeld++;
                try { return fn(); } finally { calls.lockHeld--; }
            },
            userHasActiveSession: function (id) {
                return calls.sessions.some(function (s) { return Number(s.user_id) === Number(id); });
            },
            updateUserStatus: function (row, status, lastLogin) {
                calls.statusUpdates.push({ row: row, status: status });
                const u = env.users.filter(function (x) { return x.row === row; })[0];
                if (u) u.login_status = status;
            },
            audit: function (email, action, ip, ua, details) {
                calls.audits.push({ email: email, action: action, details: details || '', lockHeld: calls.lockHeld });
            }
        };
        const mockSessions = {
            createSession: function (user) {
                const tok = 'tok' + (calls.sessions.length + 1);
                calls.sessions.push({ token: tok, user_id: user.ID, email: user.email, role: user.role });
                return { token: tok, userId: user.ID, email: user.email, role: user.role, createdAt: new Date() };
            }
        };
        env.globals = {
            Utils: mockUtils,
            Sessions: mockSessions,
            sdpApplyDevicePolicy: function (email, device, token) {
                calls.sdp.push({ email: email, device: device, token: token });
                return { applied: true, evicted: 0 };
            },
            console: { warn: function () {}, error: function () {} }
        };
        return env;
    }

    function runVerify(env, codeArg, payload) {
        return runWithGlobals(env.globals, VERIFY_OTP_FN, null,
            ['u@x.io', codeArg, payload || {}]);
    }

    test('VM: счастливый путь — токен, статус, аудит внутри замка', () => {
        const env = makeAuthEnv();
        const res = runVerify(env, '123456');
        assertEqual('tok1', res.token, 'токен новой сессии');
        assertEqual('КИП8', res.role, 'роль');
        assertEqual(7, res.userId, 'userId ЗАГЛАВНЫМИ (Task 37)');
        assertEqual('u@x.io', res.email, 'email');
        assertEqual(0, res.evicted, 'никого не вытеснили');
        assertEqual(1, env.calls.sessions.length, 'создана ОДНА сессия');
        assertEqual(1, env.calls.withLock, 'замок взят один раз');
        // login_status обновлён на «вход выполнен»
        assertEqual('вход выполнен', env.users[0].login_status, 'статус входа');
        // OTP помечен использованным
        assertEqual(true, env.otpRows[0].used, 'код помечен used');
        // аудиты OTP_VERIFIED + LOGIN_SUCCESS, оба ВНУТРИ замка
        const verified = env.calls.audits.filter(function (a) { return a.action === 'OTP_VERIFIED'; })[0];
        const success = env.calls.audits.filter(function (a) { return a.action === 'LOGIN_SUCCESS'; })[0];
        assertTrue(!!verified && !!success, 'оба аудита записаны');
        assertEqual(1, verified.lockHeld, 'OTP_VERIFIED внутри замка');
        assertEqual(1, success.lockHeld, 'LOGIN_SUCCESS внутри замка');
        // политика устройства получила токен новой сессии
        assertEqual(1, env.calls.sdp.length, 'политика применена');
        assertEqual('tok1', env.calls.sdp[0].token, 'политика видит новый токен');
    });

    test('VM: ДВОЙНОЙ SUBMIT — второй вход с тем же кодом отклонён, сессия ОДНА', () => {
        // Ключевая регрессия Task 350: замок Task 348 читал otp ДО замка —
        // оба параллельных запроса видели «unused», второй входил после
        // первого и создавал ВТОРУЮ сессию с одного кода.
        const env = makeAuthEnv();
        const res1 = runVerify(env, '123456');
        assertEqual('tok1', res1.token, 'первый вход успешен');
        let msg = '';
        try { runVerify(env, '123456'); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('Код не найден') !== -1, 'второй submit отклонён: ' + msg);
        assertEqual(1, env.calls.sessions.length, 'сессия по-прежнему ОДНА');
    });

    test('VM: неверный код — инкремент попыток, «Осталось попыток: 4»', () => {
        const env = makeAuthEnv();
        let msg = '';
        try { runVerify(env, '000000'); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('Осталось попыток: 4') !== -1, 'сообщение с остатком: ' + msg);
        assertEqual(1, env.otpRows[0].attempts, 'счётчик попыток = 1');
        assertEqual(0, env.calls.markUsed.length, 'код НЕ помечен used (можно ввести верный)');
        assertEqual(0, env.calls.sessions.length, 'сессия не создана');
        assertTrue(env.calls.audits.some(function (a) { return a.details.indexOf('attempt 1/5') !== -1; }),
            'аудит с попыткой 1/5');
    });

    test('VM: пятая неудача — «Превышен лимит попыток», счётчик 5', () => {
        const env = makeAuthEnv();
        env.otpRows[0].attempts = 4;
        let msg = '';
        try { runVerify(env, '000000'); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('Превышен лимит') !== -1, 'блокировка после лимита: ' + msg);
        assertEqual(5, env.otpRows[0].attempts, 'счётчик 5');
    });

    test('VM: истёкший код — «Код истёк», помечен used', () => {
        const env = makeAuthEnv();
        env.otpRows[0].expires_at = new Date(Date.now() - 60 * 1000);
        let msg = '';
        try { runVerify(env, '123456'); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('Код истёк') !== -1, 'истечение: ' + msg);
        assertEqual(true, env.otpRows[0].used, 'просроченный код помечен used');
        assertEqual(0, env.calls.sessions.length, 'сессия не создана');
    });

    test('VM: роль «Запрет» — «Доступ запрещён», сессия не создаётся', () => {
        const env = makeAuthEnv();
        env.users[0].role = 'Запрет';
        let msg = '';
        try { runVerify(env, '123456'); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('Доступ запрещён') !== -1, 'запрет по роли: ' + msg);
        assertEqual(0, env.calls.sessions.length, 'сессия не создана');
        assertEqual(true, env.otpRows[0].used, 'код потрачен (как и раньше)');
        assertTrue(env.calls.audits.some(function (a) { return a.action === 'LOGIN_BLOCKED_ROLE'; }),
            'аудит LOGIN_BLOCKED_ROLE');
    });

    test('VM: юзер удалён между пред-проверкой и замком — явная ошибка, НЕ TypeError', () => {
        const env = makeAuthEnv();
        // первый findUserByEmail (пред-проверка) — юзер есть;
        // второй (внутри замка) — null (юзер удалён параллельно)
        env.findUserByEmailSeq = [env.users[0], null];
        let msg = '';
        try { runVerify(env, '123456'); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('Неверный код') !== -1, 'штатная ошибка: ' + msg);
        assertEqual(0, env.calls.sessions.length, 'сессия не создана');
        assertTrue(env.calls.audits.some(function (a) { return a.details.indexOf('User deleted during verification') !== -1; }),
            'аудит удаления');
    });

    test('VM: юзер не найден (пред-проверка) — замок НЕ берётся', () => {
        const env = makeAuthEnv();
        env.users = [];
        let msg = '';
        try { runVerify(env, '123456'); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('Неверный код') !== -1, 'то же сообщение, что и для неверного кода');
        assertEqual(0, env.calls.withLock, 'замок не потрачен');
        assertEqual(0, env.calls.sessions.length, 'сессий нет');
    });

    test('VM: самосинхронизация внутри замка — «вход выполнен» без сессий сбрасывается', () => {
        const env = makeAuthEnv();
        env.users[0].login_status = 'вход выполнен';
        // сессий в env.calls.sessions нет → userHasActiveSession false
        const res = runVerify(env, '123456');
        assertEqual('tok1', res.token, 'вход после самосинхронизации успешен');
        const reset = env.calls.statusUpdates.filter(function (s) { return s.status === 'вход не выполнен'; });
        assertEqual(1, reset.length, 'статус сброшен перед входом');
        assertTrue(env.calls.audits.some(function (a) { return a.action === 'LOGIN_STATUS_AUTO_RESET' && a.lockHeld === 1; }),
            'аудит сброса ВНУТРИ замка');
        assertEqual('вход выполнен', env.users[0].login_status, 'итоговый статус — вход выполнен');
    });
});

// ============================================================
// 7. VM: sendOTP — кулдаун под замком, письмо вне замка
// ============================================================
describe('Task 350 — VM: sendOTP', () => {

    function makeSendEnv() {
        const calls = {
            withLock: 0, lockHeld: 0, mails: [], appended: [], audits: [],
            statusUpdates: [], lastOtpLookups: [], failCounts: []
        };
        const env = {
            users: [{ ID: 7, email: 'u@x.io', role: 'КИП8', login_status: 'вход не выполнен', row: 5 }],
            otpRows: [],
            lastOtp: null,
            failsCount: 0,
            globalCount: 0,
            calls: calls,
            findUserByEmailSeq: null
        };
        const mockUtils = {
            normalizeEmail: function (raw) {
                const s = String(raw || '').toLowerCase().trim();
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
            },
            countRecentAuditLogs: function () { return env.globalCount; },
            getConfig: function (key, def) { return def; },
            findUserByEmail: function (email) {
                if (env.findUserByEmailSeq) { return env.findUserByEmailSeq.shift() || null; }
                return env.users.filter(function (u) { return u.email === email; })[0] || null;
            },
            userHasActiveSession: function () { return false; },
            updateUserStatus: function (row, status) { calls.statusUpdates.push({ row: row, status: status }); },
            countRecentOtpFails: function (email, minutes) {
                calls.failCounts.push({ minutes: minutes, lockHeld: calls.lockHeld });
                return env.failsCount;
            },
            getLastOtpForEmail: function (email) {
                calls.lastOtpLookups.push({ lockHeld: calls.lockHeld });
                return env.lastOtp;
            },
            generateNumericCode: function () { return '654321'; },
            appendRow: function (sheet, arr) {
                calls.appended.push({ sheet: sheet, arr: arr, lockHeld: calls.lockHeld });
                if (sheet === 'otp_codes') env.otpRows.push({ arr: arr });
            },
            audit: function (email, action, ip, ua, details) {
                calls.audits.push({ email: email, action: action, details: details || '' });
            },
            withLock: function (fn) {
                calls.withLock++; calls.lockHeld++;
                try { return fn(); } finally { calls.lockHeld--; }
            }
        };
        env.globals = {
            Utils: mockUtils,
            MailApp: {
                sendEmail: function (to, subj, body, opts) {
                    calls.mails.push({ to: to, subj: subj, lockHeld: calls.lockHeld });
                }
            },
            Utilities: { formatDate: function () { return '01.01.2026 00:00:00 GMT'; } },
            Session: { getScriptTimeZone: function () { return 'GMT'; } },
            console: { error: function () {}, log: function () {}, warn: function () {} }
        };
        return env;
    }

    function runSend(env) {
        return runWithGlobals(env.globals, SEND_OTP_FN, null, ['u@x.io']);
    }

    test('VM: код запрошен — письмо ВНЕ замка, строка OTP ВНУТРИ замка', () => {
        const env = makeSendEnv();
        const res = runSend(env);
        assertEqual(true, res.sent, 'успешный ответ');
        assertEqual(1, env.calls.mails.length, 'письмо отправлено');
        assertEqual(0, env.calls.mails[0].lockHeld, 'MailApp.sendEmail вызван ВНЕ замка');
        assertEqual(1, env.calls.appended.length, 'строка OTP записана');
        assertEqual(1, env.calls.appended[0].lockHeld, 'appendRow ВНУТРИ замка (кулдаун атомарен)');
        assertEqual(1, env.calls.lastOtpLookups.length, 'кулдаун проверен');
        assertEqual(1, env.calls.lastOtpLookups[0].lockHeld, 'кулдаун-чек ВНУТРИ замка (TOCTOU закрыт)');
        assertEqual(6, env.calls.appended[0].arr.length, '6 колонок otp_codes');
        assertEqual('u@x.io', env.calls.appended[0].arr[0], 'email');
        assertEqual('654321', env.calls.appended[0].arr[1], 'код');
        assertEqual(1, env.calls.withLock, 'замок взят один раз');
        assertTrue(env.calls.audits.some(function (a) { return a.action === 'OTP_REQUESTED'; }),
            'аудит OTP_REQUESTED');
    });

    test('VM: кулдаун — «Подождите», НИ письма, НИ строки OTP', () => {
        const env = makeSendEnv();
        env.lastOtp = { created_at: new Date(Date.now() - 10 * 1000) }; // 10 сек назад
        let msg = '';
        try { runSend(env); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('Подождите') !== -1, 'кулдаун сработал: ' + msg);
        assertEqual(0, env.calls.appended.length, 'строка OTP НЕ записана');
        assertEqual(0, env.calls.mails.length, 'письмо НЕ отправлено');
        assertEqual(1, env.calls.withLock, 'замок взят (кулдаун внутри него)');
    });

    test('VM: Task 352 — блок по неудачам УДАЛЁН: sendOTP работает при 5+ OTP_FAILED', () => {
        // ДО фикса: 5 мусорных verifyOTP от атакующего → счётчик по email
        // → «Слишком много неудачных попыток» → жертва НЕ могла получить
        // код 30 мин (продлеваемо). ПОСЛЕ: sendOTP не смотрит на неудачи —
        // защиту делают кулдаун + MAX_OTP_ATTEMPTS на код (не по email).
        const env = makeSendEnv();
        env.failsCount = 5; // раньше блокировало
        const res = runSend(env);
        assertEqual(true, res.sent, 'код отправлен — блок по email удалён (анти-DoS)');
        assertEqual(1, env.calls.mails.length, 'письмо ушло');
        assertEqual(1, env.calls.appended.length, 'строка OTP записана');
        assertEqual(0, env.calls.failCounts.length, 'countRecentOtpFails больше НЕ вызывается');
    });

    test('VM: несуществующий email — «код отправлен» без письма (защита от перебора)', () => {
        const env = makeSendEnv();
        env.users = [];
        const res = runSend(env);
        assertEqual(true, res.sent, 'публичный ответ — успех');
        assertEqual(0, env.calls.mails.length, 'письма нет');
        assertEqual(0, env.calls.appended.length, 'строки нет');
        assertEqual(0, env.calls.withLock, 'замок не берётся');
        assertTrue(env.calls.audits.some(function (a) { return a.action === 'OTP_REQUESTED_NOT_FOUND'; }),
            'аудит перебора');
    });

    test('VM: юзер удалён между пред-проверкой и замком — тихий «успех», без письма', () => {
        const env = makeSendEnv();
        env.findUserByEmailSeq = [env.users[0], null];
        const res = runSend(env);
        assertEqual(true, res.sent, 'публичный ответ не выдаёт удаление');
        assertEqual(0, env.calls.mails.length, 'письма нет');
        assertEqual(0, env.calls.appended.length, 'строки нет');
        assertEqual(1, env.calls.withLock, 'замок был взят');
        assertTrue(env.calls.audits.some(function (a) { return a.details.indexOf('User deleted during OTP request') !== -1; }),
            'аудит удаления');
    });
});
