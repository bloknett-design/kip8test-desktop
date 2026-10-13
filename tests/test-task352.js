// tests/test-task352.js
// Task 352 — закрытие мягкого DoS по email (аудит п.5).
//
// АТАКА (до фикса): знающий email жертвы шлёт 5 мусорных verifyOTP →
// 5 строк OTP_FAILED в audit_log → countRecentOtpFails блокировал
// sendOTP жертвы на 30 мин — и продлевал блок до бесконечности
// (счётчик писался по EMAIL, т.е. контролировался атакующим).
// ЛЕЧЕНИЕ: email-блок sendOTP удалён (счётчик больше не существует);
// неверные попытки не сжигают код — верный код принимается ВСЕГДА,
// пока не истёк/не used; после MAX_OTP_ATTEMPTS неверные сабмиты
// отклоняются ДЁШЕВО (без инкремента и аудита — спам не раздувает листы).
//
// Проверки: SRC-гарды (нет мёртвого счётчика/ключа, дешёвый отказ до
// инкремента, защита кулдаун/глобальный лимит/MAX_OTP_ATTEMPTS на месте)
// + VM-прогоны: ПОЛНЫЙ сценарий атаки (5 мусорных → 6-й дёшево → верный
// код жертвы РАБОТАЕТ), sendOTP при «прошлых неудачах», строковые
// attempts из листа, undefined attempts.
//
// Запуск: через tests/run-all.js (require './test-task352.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const UTILS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Utils.gs'), 'utf8');
const AUTH_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Auth.gs'), 'utf8');

// Извлечение функции из .gs по маркеру (по образцу test-task350.js)
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

const SEND_OTP_FN = extractFn(AUTH_SRC, 'sendOTP: function');
const VERIFY_OTP_FN = extractFn(AUTH_SRC, 'verifyOTP: function');

// Комментарии в сторону: SRC-ассерты смотрят ТОЛЬКО на живой код
// (некрологи Task 352 в комментариях упоминают удаляемые имена).
function stripCommentLines(src) {
    return src.split('\n').filter(function (l) {
        return !/^\s*(\*|\/\/)/.test(l);
    }).join('\n');
}

const SEND_OTP_CODE = stripCommentLines(SEND_OTP_FN);
const VERIFY_OTP_CODE = stripCommentLines(VERIFY_OTP_FN);
const AUTH_LIVE = stripCommentLines(AUTH_SRC);
const UTILS_LIVE = stripCommentLines(UTILS_SRC);

// Прогон функции с ВРЕМЕННЫМИ глобалами (main-realm — instanceof Date жив)
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
// 1. SRC: DoS-вектор удалён, защита на месте
// ============================================================
describe('Task 352 — SRC: email-блок удалён, защита сохранена', () => {

    test('SRC: в живом коде Auth.gs нет email-счётчика неудач и его ключей', () => {
        assertTrue(AUTH_LIVE.indexOf('countRecentOtpFails') === -1,
            'счётчик неудач по email больше не вызывается');
        assertTrue(AUTH_LIVE.indexOf('OTP_BLOCKED') === -1,
            'событие OTP_BLOCKED больше не пишется');
        assertTrue(AUTH_LIVE.indexOf('OTP_BLOCK_MINUTES') === -1,
            'ключ OTP_BLOCK_MINUTES больше не читается');
    });

    test('SRC: Utils.gs — countRecentOtpFails удалён (мёртвый после фикса)', () => {
        assertTrue(UTILS_LIVE.indexOf('countRecentOtpFails: function') === -1,
            'определение удалено из живого кода');
        assertTrue(UTILS_SRC.indexOf('Task 352: countRecentOtpFails') !== -1,
            'некролог-комментарий на месте (по прецеденту Task 349)');
    });

    test('SRC: verifyOTP — дешёвый отказ ДО инкремента попыток', () => {
        const guardIdx = VERIFY_OTP_CODE.indexOf('otp.attempts');
        const incIdx = VERIFY_OTP_CODE.indexOf('Utils.incrementOtpAttempts');
        assertTrue(guardIdx !== -1 && incIdx !== -1, 'оба механизма есть');
        assertTrue(guardIdx < incIdx,
            'проверка «лимит уже исчерпан» идёт РАНЬШЕ инкремента (дешёвый отказ)');
        assertTrue(VERIFY_OTP_CODE.indexOf('Запросите новый') !== -1,
            'сообщение ведёт к рабочему пути (запрос нового кода)');
    });

    test('SRC: verifyOTP — попытки НЕ сжигают код (верный код не ограничен лимитом)', () => {
        // Лимит проверяется ТОЛЬКО в ветке несовпадения кода: guard внутри
        // if (otp.code !== code), а пометка used для верного кода — ПОСЛЕ
        // этой ветки (первый markOtpUsed в файле — ветка истечения, ищем
        // второе вхождение — за пределами ветки несовпадения).
        const mismatchIdx = VERIFY_OTP_CODE.indexOf('String(otp.code) !== String(code)');
        const guardIdx = VERIFY_OTP_CODE.indexOf('otp.attempts');
        const markUsedAfterMismatch = VERIFY_OTP_CODE.indexOf('Utils.markOtpUsed(otp.row)', mismatchIdx);
        const lockIdx = VERIFY_OTP_CODE.indexOf('Utils.withLock(function()');
        assertTrue(mismatchIdx !== -1, 'ветка несовпадения есть');
        assertTrue(guardIdx > mismatchIdx, 'guard живёт ВНУТРИ ветки неверного кода');
        assertTrue(markUsedAfterMismatch !== -1,
            'верный код помечается used ПОСЛЕ ветки несовпадения');
        assertTrue(lockIdx !== -1 && guardIdx > lockIdx,
            'проверка под замком (Task 350 не сломан)');
        assertTrue(VERIFY_OTP_CODE.indexOf('Осталось попыток') !== -1,
            'сообщение с остатком попыток сохранено');
    });

    test('SRC: sendOTP — защита, которую атакующий НЕ контролирует, на месте', () => {
        assertTrue(SEND_OTP_CODE.indexOf('countRecentAuditLogs') !== -1,
            'глобальный лимит 100 OTP/час остался');
        assertTrue(SEND_OTP_CODE.indexOf('RATE_LIMIT_OTP_PER_HOUR') !== -1,
            'ключ глобального лимита читается');
        assertTrue(SEND_OTP_CODE.indexOf('getLastOtpForEmail') !== -1,
            'кулдаун 60 сек остался');
        assertTrue(SEND_OTP_CODE.indexOf('OTP_RESEND_COOLDOWN_SECONDS') !== -1,
            'ключ кулдауна читается');
        assertTrue(SEND_OTP_CODE.indexOf('appendRow(\'otp_codes\'') !== -1,
            'запись кода осталась');
    });

    test('SRC: verifyOTP — MAX_OTP_ATTEMPTS по-прежнему читается (брутфорс-защита)', () => {
        assertTrue(VERIFY_OTP_CODE.indexOf('MAX_OTP_ATTEMPTS') !== -1,
            'лимит попыток на код сохранён');
    });
});

// ============================================================
// 2. VM: verifyOTP — поведение лимита попыток
// ============================================================
describe('Task 352 — VM: verifyOTP (мок-листы)', () => {

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
                // Как реальный хелпер: parseInt(cell.getValue() || '0', 10)
                // — undefined/строка/NaN приводятся к числу
                const r = env.otpRows.filter(function (x) { return x.row === row; })[0];
                if (r) r.attempts = (parseInt(r.attempts || '0', 10) || 0) + 1;
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

    test('VM: ПЕРВАЯ неудача — инкремент, аудит, «Осталось попыток: 4»', () => {
        const env = makeAuthEnv();
        let msg = '';
        try { runVerify(env, '000000'); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('Осталось попыток: 4') !== -1, 'сообщение: ' + msg);
        assertEqual(1, env.otpRows[0].attempts, 'счётчик = 1');
        assertEqual(1, env.calls.increments.length, 'инкремент выполнен');
        assertTrue(env.calls.audits.some(function (a) {
            return a.action === 'OTP_FAILED' && a.details.indexOf('attempt 1/5') !== -1;
        }), 'аудит attempt 1/5');
        assertFalse(env.otpRows[0].used, 'код НЕ сгорел');
    });

    test('VM: ПЯТАЯ неудача — «Превышен лимит», счётчик 5, аудит есть', () => {
        const env = makeAuthEnv();
        env.otpRows[0].attempts = 4;
        let msg = '';
        try { runVerify(env, '000000'); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('Превышен лимит') !== -1, 'лимит: ' + msg);
        assertTrue(msg.indexOf('Запросите новый') !== -1, 'подсказка запросить новый');
        assertEqual(5, env.otpRows[0].attempts, 'счётчик 5');
        assertTrue(env.calls.audits.some(function (a) {
            return a.details.indexOf('attempt 5/5') !== -1;
        }), 'аудит attempt 5/5');
    });

    test('VM: ШЕСТАЯ+ неудача — ДЁШЕВЫЙ отказ: без инкремента и без аудита', () => {
        const env = makeAuthEnv();
        env.otpRows[0].attempts = 5;
        let msg = '';
        try { runVerify(env, '000000'); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('Превышен лимит') !== -1, 'отказ: ' + msg);
        assertEqual(0, env.calls.increments.length, 'инкремент НЕ вызван (спам не раздувает счётчик)');
        assertEqual(0, env.calls.audits.length, 'строка аудита НЕ пишется (спам не раздувает audit_log)');
        assertEqual(5, env.otpRows[0].attempts, 'счётчик не тронут');
        assertEqual(1, env.calls.withLock, 'замок взят (сериализация сохранена)');
    });

    test('VM: ГЛАВНЫЙ АНТИ-DoS — верный код жертвы РАБОТАЕТ после 5 неудач атакующего', () => {
        // Атакующий выжал лимит мусорными кодами. Жертва вводит СВОЙ
        // верный код из письма → вход выполняется: лимит попыток живёт
        // только в ветке несовпадения кода.
        const env = makeAuthEnv();
        env.otpRows[0].attempts = 5;
        const res = runVerify(env, '123456');
        assertEqual('tok1', res.token, 'вход успешен');
        assertEqual(7, res.userId, 'userId');
        assertEqual(1, env.calls.sessions.length, 'сессия создана');
        assertEqual(true, env.otpRows[0].used, 'код помечен used');
        assertEqual(0, env.calls.increments.length, 'инкрементов не было (верный код)');
    });

    test('VM: ПОЛНЫЙ сценарий атаки — 5 мусорных → 6-й дёшево → жертва входит', () => {
        const env = makeAuthEnv();
        // Атакующий: 5 мусорных submit
        let wrongMsgs = 0;
        for (let i = 0; i < 5; i++) {
            try { runVerify(env, '999000'); } catch (e) { if (String(e.message).indexOf('Неверный код') !== -1) wrongMsgs++; }
        }
        assertEqual(5, wrongMsgs, 'пять отказов');
        assertEqual(5, env.otpRows[0].attempts, 'счётчик выжат до 5');
        assertEqual(5, env.calls.audits.length, 'ровно 5 строк аудита (по одной на попытку)');
        // 6-й мусорный — дешёвый
        const auditsBefore = env.calls.audits.length;
        try { runVerify(env, '999000'); } catch (e) { /* ожидаем отказ */ }
        assertEqual(5, env.otpRows[0].attempts, 'счётчик не двинулся');
        assertEqual(auditsBefore, env.calls.audits.length, 'новых строк аудита НЕТ');
        // Жертва вводит верный код → вход
        const res = runVerify(env, '123456');
        assertEqual('tok1', res.token, 'жертва вошла своим кодом');
        assertEqual(1, env.calls.sessions.length, 'сессия ОДНА');
        assertEqual(true, env.otpRows[0].used, 'код использован');
    });

    test('VM: attempts пришёл СТРОКОЙ из листа («5») — Number-приведение в guard', () => {
        const env = makeAuthEnv();
        env.otpRows[0].attempts = '5';
        let msg = '';
        try { runVerify(env, '000000'); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('Превышен лимит') !== -1, 'строчный счётчик распознан: ' + msg);
        assertEqual(0, env.calls.increments.length, 'дешёвый отказ — инкремента нет');
    });

    test('VM: attempts undefined — считается нулём (первая попытка)', () => {
        const env = makeAuthEnv();
        delete env.otpRows[0].attempts;
        let msg = '';
        try { runVerify(env, '000000'); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('Осталось попыток: 4') !== -1, 'undefined → попытка 1: ' + msg);
        assertEqual(1, env.otpRows[0].attempts, 'счётчик стал 1');
    });
});

// ============================================================
// 3. VM: sendOTP — работает «под атакой»
// ============================================================
describe('Task 352 — VM: sendOTP без email-блока', () => {

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
            // Мок-счётчик оставлен НАРОЧНО: 352-й sendOTP его НЕ вызывает —
            // ноль вызовов доказывает, что email-блока больше нет.
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

    test('VM: sendOTP под атакой (счётчик неудач «залит») — код ВСЁ РАВНО выдаётся', () => {
        // До фикса env.failsCount=5 означал «Слишком много неудачных
        // попыток» и жертва сидела без кода 30 минут. Теперь лимита нет.
        const env = makeSendEnv();
        env.failsCount = 999;
        const res = runSend(env);
        assertEqual(true, res.sent, 'код отправлен');
        assertEqual(1, env.calls.mails.length, 'письмо ушло');
        assertEqual(1, env.calls.appended.length, 'строка OTP записана');
        assertEqual(0, env.calls.failCounts.length, 'email-счётчик НЕ вызывался');
    });

    test('VM: глобальный лимит 100 OTP/час — НЕ тронут (защита от спама выдач)', () => {
        const env = makeSendEnv();
        env.globalCount = 100;
        let msg = '';
        try { runSend(env); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('Слишком много запросов') !== -1, 'глобальный лимит жив: ' + msg);
        assertEqual(0, env.calls.appended.length, 'строки нет');
        assertEqual(0, env.calls.mails.length, 'письма нет');
        assertTrue(env.calls.audits.some(function (a) { return a.action === 'RATE_LIMIT_HIT'; }),
            'аудит лимита');
    });

    test('VM: кулдаун 60 сек — НЕ тронут (анти-спам выдач)', () => {
        const env = makeSendEnv();
        env.lastOtp = { created_at: new Date(Date.now() - 10 * 1000) };
        let msg = '';
        try { runSend(env); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('Подождите') !== -1, 'кулдаун жив: ' + msg);
        assertEqual(0, env.calls.appended.length, 'строки нет');
        assertEqual(0, env.calls.mails.length, 'письма нет');
        assertEqual(1, env.calls.withLock, 'кулдаун проверяется под замком (Task 350 жив)');
    });
});
