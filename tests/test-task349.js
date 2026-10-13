// tests/test-task349.js
// Task 349 — чистка мёртвого IP-кода + унификация SESSION_* + updateRole.
//
// Контекст (2026-09-09, заявка пользователя, 3 пункта одним деплоем):
//   1. IP-лимиты — МЁРТВЫЙ код (вариант А — удалить): Apps Script в
//      doPost не видит IP/User-Agent клиента, getClientIp() и
//      getClientUserAgent() всегда возвращали '', пер-IP ветка «20
//      неудач/час с одного IP» в sendOTP не срабатывала НИКОГДА (её
//      счётчик countRecentAuditLogsByIp имел guard «if (!ip) return 0»
//      и всегда возвращал 0). Удалены хелперы из Utils.gs + ветка из
//      Auth.gs; сигнатура Utils.audit(…) НЕ менялась (40+ вызовов),
//      3-й/4-й аргументы теперь буквально ''.
//   2. Унификация имён SESSION_*: событие сироты в heartbeat
//      SESSION_ORPHAN_REMOVED → SESSION_CLEANUP_ORPHAN — ленивый путь
//      и крон-путь (cleanupExpiredSessions) пишут одно имя, все
//      сессионные события под префиксом SESSION_CLEANUP_*. Старые
//      записи audit_log НЕ переписываются. STALE_SESSION_DAYS не менялся.
//   3. updateRole: замок (была последняя мутация БЕЗ Utils.withLock),
//      синхрон role-снапшота sessions!D сразу при смене (раньше висел
//      старой ролью до ближайшего запроса жертвы — мог быть никогда)
//      и МГНОВЕННАЯ выгонка при «Запрет»: удалить все сессии юзера +
//      сброс login_status (как resetLogin), не ждать его запроса.
//
// Проверки: SRC-гарды (источник содержит/не содержит паттерны),
// VM-прогоны audit (сигнатура 5 аргументов, 6 колонок) и updateRole
// (мок-лист users/sessions, мок withLock, Запрет/обычная/ошибки).
//
// Запуск: через tests/run-all.js (require './test-task349.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual, assertThrows } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const UTILS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Utils.gs'), 'utf8');
const SESSIONS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Sessions.gs'), 'utf8');
const AUTH_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Auth.gs'), 'utf8');

// ============================================================
// Извлечение функции из .gs по маркеру (по образцу test-task348.js)
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

const AUDIT_FN = extractFn(UTILS_SRC, 'audit: function(email');
const CLEANUP_EXPIRED_FN = extractFn(UTILS_SRC, 'cleanupExpiredSessions: function');
const CLEANUP_STALE_FN = extractFn(UTILS_SRC, 'cleanupStaleSessions: function');
const UPDATE_ROLE_FN = extractFn(UTILS_SRC, 'updateRole: function');
const SEND_OTP_FN = extractFn(AUTH_SRC, 'sendOTP: function');
const HEARTBEAT_FN = extractFn(SESSIONS_SRC, 'heartbeat: function');

// Убрать строки-комментарии (JSDoc «* …», «// …») — живой код без
// документации; URL в строках НЕ на начале строки, не задеваются.
function stripCommentLines(src) {
    return src.split('\n').filter(function (l) {
        return !/^\s*(\*|\/\/)/.test(l);
    }).join('\n');
}

// ============================================================
// 1. SRC: мёртвый IP-код удалён, живые лимиты сохранены
// ============================================================
describe('Task 349 — SRC: мёртвый IP-код удалён', () => {

    test('SRC: Utils.getClientIp / getClientUserAgent / countRecentAuditLogsByIp больше не определены', () => {
        assertTrue(UTILS_SRC.indexOf('getClientIp: function') === -1,
            'определение getClientIp удалено');
        assertTrue(UTILS_SRC.indexOf('getClientUserAgent: function') === -1,
            'определение getClientUserAgent удалено');
        assertTrue(UTILS_SRC.indexOf('countRecentAuditLogsByIp: function') === -1,
            'определение countRecentAuditLogsByIp удалено');
    });

    test('SRC: живых ВЫЗОВОВ удалённых хелперов нет во всех .gs (только комментарии-некрологи)', () => {
        [UTILS_SRC, SESSIONS_SRC, AUTH_SRC].forEach((src, i) => {
            assertTrue(src.indexOf('Utils.getClientIp(') === -1,
                'вызов Utils.getClientIp в файле #' + (i + 1) + ' отсутствует');
            assertTrue(src.indexOf('Utils.getClientUserAgent(') === -1,
                'вызов Utils.getClientUserAgent в файле #' + (i + 1) + ' отсутствует');
            assertTrue(src.indexOf('Utils.countRecentAuditLogsByIp(') === -1,
                'вызов Utils.countRecentAuditLogsByIp в файле #' + (i + 1) + ' отсутствует');
        });
    });

    test('SRC: пер-IP ветка sendOTP удалена (RATE_LIMIT_FAILED_PER_IP исчез из проекта)', () => {
        assertTrue(SEND_OTP_FN.indexOf('RATE_LIMIT_FAILED_PER_IP') === -1,
            'конфиг-ключ мёртвого лимита не используется');
        assertTrue(UTILS_SRC.indexOf('RATE_LIMIT_FAILED_PER_IP') === -1,
            'ключ не упоминается и в Utils.gs');
        assertTrue(SEND_OTP_FN.indexOf('countRecentAuditLogsByIp') === -1,
            'пер-IP счётчик в sendOTP отсутствует');
    });

    test('SRC: ЖИВОЙ глобальный лимит 100 OTP/час сохранён', () => {
        assertTrue(SEND_OTP_FN.indexOf('RATE_LIMIT_OTP_PER_HOUR') !== -1,
            'глобальный лимит на месте');
        assertTrue(SEND_OTP_FN.indexOf('countRecentAuditLogs(') !== -1,
            'живой счётчик событий (глобальный) используется');
        assertTrue(SEND_OTP_FN.indexOf('RATE_LIMIT_HIT') !== -1,
            'аудит-событие при превышении сохранено');
    });

    test('SRC: Utils.audit сигнатура НЕ менялась — 5 аргументов (email, action, ip, ua, details)', () => {
        // 40+ вызовов по всем файлам: смена сигнатуры = разбить всё.
        assertTrue(UTILS_SRC.indexOf('audit: function(email, action, ip, userAgent, details)') !== -1,
            'сигнатура прежняя');
        assertTrue(AUDIT_FN.indexOf('appendRow') !== -1,
            'аудит по-прежнему пишет в audit_log');
    });

    test('SRC: в Auth.gs больше нет локальных ip/ua в sendOTP и verifyOTP', () => {
        assertTrue(SEND_OTP_FN.indexOf('const ip =') === -1 && SEND_OTP_FN.indexOf('const ua =') === -1,
            'локальные переменные ip/ua в sendOTP удалены');
        const VERIFY = extractFn(AUTH_SRC, 'verifyOTP: function');
        assertTrue(VERIFY.indexOf('const ip =') === -1 && VERIFY.indexOf('const ua =') === -1,
            'локальные переменные ip/ua в verifyOTP удалены');
    });

    test('SRC: все вызовы Utils.audit в Auth.gs передают пустые ip/ua', () => {
        // Живой вызов с непустой 3-й/4-й переменной выглядел бы как
        // «Utils.audit(email, action, ip,» — ищем паттерн с переменной.
        // Комментарии убраны: в шапке файла упоминание сигнатуры
        // «Utils.audit(email, action, ip, ua, details)» — это док, не код.
        const withVar = stripCommentLines(AUTH_SRC).match(/Utils\.audit\([^)]*,\s*(ip|ua)\s*,/g);
        assertTrue(withVar === null,
            'вызовов с переменными ip/ua больше нет: ' + (withVar ? JSON.stringify(withVar) : 'null'));
    });
});

// ============================================================
// 2. SRC: унификация имён SESSION_CLEANUP_*
// ============================================================
describe('Task 349 — SRC: унификация SESSION_CLEANUP_*', () => {

    test('SRC: heartbeat пишет SESSION_CLEANUP_ORPHAN (было SESSION_ORPHAN_REMOVED)', () => {
        assertTrue(HEARTBEAT_FN.indexOf("'SESSION_CLEANUP_ORPHAN'") !== -1,
            'новое имя события сироты в heartbeat');
    });

    test('SRC: живой строки SESSION_ORPHAN_REMOVED больше нет (в кавычках — только живые вызовы)', () => {
        assertTrue(SESSIONS_SRC.indexOf("'SESSION_ORPHAN_REMOVED'") === -1,
            'Sessions.gs не содержит строковый литерал старого имени');
        assertTrue(UTILS_SRC.indexOf("'SESSION_ORPHAN_REMOVED'") === -1,
            'Utils.gs не содержит строковый литерал старого имени');
        assertTrue(AUTH_SRC.indexOf("'SESSION_ORPHAN_REMOVED'") === -1,
            'Auth.gs не содержит строковый литерал старого имени');
    });

    test('SRC: крон-путь cleanupExpiredSessions пишет то же имя SESSION_CLEANUP_ORPHAN', () => {
        assertTrue(CLEANUP_EXPIRED_FN.indexOf("'SESSION_CLEANUP_ORPHAN'") !== -1,
            'ленивый путь (heartbeat) и крон-путь едины');
    });

    test('SRC: весь префикс SESSION_CLEANUP_* — три события (ORPHAN, STALE) под одним префиксом', () => {
        assertTrue(CLEANUP_STALE_FN.indexOf("'SESSION_CLEANUP_STALE'") !== -1,
            'SESSION_CLEANUP_STALE (Task 347) не задет');
        const allNames = (SESSIONS_SRC + UTILS_SRC).match(/'SESSION_CLEANUP_[A-Z_]+'/g) || [];
        const unique = Array.from(new Set(allNames));
        assertEqual(JSON.stringify(unique.sort()),
            JSON.stringify(["'SESSION_CLEANUP_ORPHAN'", "'SESSION_CLEANUP_STALE'"]),
            'ровно два имени семейства SESSION_CLEANUP_*: ' + JSON.stringify(unique));
    });
});

// ============================================================
// 3. SRC: updateRole — замок + снапшот + мгновенная выгонка
// ============================================================
describe('Task 349 — SRC: updateRole — замок, снапшот, выгонка', () => {

    test('SRC: Admin.updateRole обёрнут в Utils.withLock', () => {
        assertTrue(UPDATE_ROLE_FN.indexOf('Utils.withLock') !== -1,
            'updateRole под замком (была последняя мутация без замка)');
    });

    test('SRC: поиск юзера и валидация роли ВНУТРИ замка (прочитанное снаружи устаревает)', () => {
        const lockIdx = UPDATE_ROLE_FN.indexOf('Utils.withLock');
        assertTrue(lockIdx !== -1 &&
            UPDATE_ROLE_FN.indexOf('Utils.findUserById', lockIdx) !== -1,
            'findUserById вызывается после входа в замок');
        assertTrue(lockIdx !== -1 &&
            UPDATE_ROLE_FN.indexOf('getAllowedRoles', lockIdx) !== -1,
            'валидация роли после входа в замок');
    });

    test('SRC: users!C записывается (col 3, как раньше)', () => {
        // Task 351: прямая запись переведена на Utils.setCell (сброс кэша
        // чтений) — ассерт проверяет тот же лист/строку/столбец.
        assertTrue(UPDATE_ROLE_FN.indexOf("Utils.setCell('users', user.row, 3, newRole)") !== -1,
            'запись новой роли в лист users (столбец C)');
    });

    test('SRC: обычная роль — role-снапшот sessions!D обновляется (col 4)', () => {
        // Task 351: через Utils.setCell (сброс кэша чтений)
        assertTrue(UPDATE_ROLE_FN.indexOf("Utils.setCell('sessions', sessions[i].row, 4, newRole)") !== -1,
            'синхрон снапшота в живых сессиях юзера');
    });

    test('SRC: «Запрет» — цикл удаления сессий юзера С КОНЦА (deleteRow сдвигает номера)', () => {
        const zapret = UPDATE_ROLE_FN.slice(UPDATE_ROLE_FN.indexOf("newRole === 'Запрет'"));
        assertTrue(zapret.indexOf('sessions.length - 1') !== -1,
            'итерация с конца перед deleteRow (паттерн resetLogin)');
        assertTrue(zapret.indexOf("Utils.deleteRow('sessions'") !== -1,
            'удаление строк сессий');
    });

    test('SRC: «Запрет» — сброс login_status при evicted > 0', () => {
        const zapret = UPDATE_ROLE_FN.slice(UPDATE_ROLE_FN.indexOf("newRole === 'Запрет'"));
        assertTrue(zapret.indexOf('evicted > 0') !== -1,
            'сброс статуса только когда сессии реально были');
        assertTrue(zapret.indexOf("updateUserStatus(user.row, 'вход не выполнен'") !== -1,
            'сброс login_status как в resetLogin');
    });

    test('SRC: событие FORCE_LOGOUT_ROLE (имя существующее, новых типов аудита нет)', () => {
        assertTrue(UPDATE_ROLE_FN.indexOf("'FORCE_LOGOUT_ROLE'") !== -1,
            'выгонка логируется существующим событием');
        assertTrue(UPDATE_ROLE_FN.indexOf("'ADMIN_UPDATE_ROLE'") !== -1,
            'аудит админ-действия сохранён');
    });

    test('SRC: возвращает { ok, evicted } для вызывающего кода/тестов', () => {
        assertTrue(UPDATE_ROLE_FN.indexOf('evicted: evicted') !== -1,
            'число вытесненных сессий в ответе');
    });
});

// ============================================================
// 4. VM: Utils.audit — поведение не изменилось
// ============================================================
describe('Task 349 — VM: Utils.audit', () => {

    test('VM: audit пишет 6 колонок; ip/ua проходят как есть (пустые — пустыми)', () => {
        let captured = null;
        const sb = { appendRow: function (sheet, arr) { captured = { sheet: sheet, arr: arr }; } };
        const fn = vm.runInNewContext('(' + AUDIT_FN + ')', sb);
        fn.call(sb, 'user@x.io', 'LOGIN_SUCCESS', '', '', 'Session created');
        assertEqual(captured.sheet, 'audit_log', 'лист audit_log');
        assertEqual(captured.arr.length, 6, 'шесть колонок: timestamp, email, action, ip, ua, details');
        assertEqual(captured.arr[1], 'user@x.io', 'email на своём месте (1-й аргумент)');
        assertEqual(captured.arr[2], 'LOGIN_SUCCESS', 'action');
        assertEqual(captured.arr[3], '', 'ip пустой');
        assertEqual(captured.arr[4], '', 'user_agent пустой');
        assertEqual(captured.arr[5], 'Session created', 'details');
        // vm-контекст — другой realm, instanceof Date внешнего Node
        // не сработает; сверяем тег объекта.
        assertEqual(Object.prototype.toString.call(captured.arr[0]), '[object Date]',
            'timestamp — Date (кросс-realm проверка по тегу)');
    });

    test('VM: audit с falsy-аргументами — || "" защищает от undefined', () => {
        let captured = null;
        const sb = { appendRow: function (sheet, arr) { captured = arr; } };
        const fn = vm.runInNewContext('(' + AUDIT_FN + ')', sb);
        fn.call(sb, null, null, null, null, null);
        assertEqual(captured[1], '', 'null email → пустая строка');
        assertEqual(captured[2], '', 'null action → пустая строка');
    });
});

// ============================================================
// 5. VM: updateRole — полный прогон на мок-листе
// ============================================================
describe('Task 349 — VM: updateRole на мок-листе', () => {

    // Мок: Utils (withLock синхронный, с подсчётом), листы users/sessions
    // как массивы объектов с полем row. deleteRow РЕАЛЬНО удаляет из
    // массива — симулирует сдвиг номеров строк живого листа.
    function makeEnv() {
        const calls = {
            withLock: 0, setCells: [], deleted: [], audits: [], statusResets: []
        };
        const env = {
            users: [], sessions: [], calls: calls,
            Utils: {
                withLock: function (fn) { calls.withLock++; return fn(); },
                findUserById: function (id) {
                    return env.users.filter(function (u) { return Number(u.ID) === Number(id); })[0] || null;
                },
                getAllowedRoles: function () {
                    return ['Запрет', 'Общий доступ', 'КИП8', 'Админ'];
                },
                getSheet: function (name) {
                    return {
                        getRange: function (row, col) {
                            return { setValue: function (v) { calls.setCells.push({ sheet: name, row: row, col: col, v: v }); } };
                        }
                    };
                },
                // Task 351: updateRole пишет через Utils.setCell (сброс кэша
                // чтений) — мок пишет в тот же calls.setCells
                setCell: function (sheet, row, col, v) {
                    calls.setCells.push({ sheet: sheet, row: row, col: col, v: v });
                },
                getRows: function (name) {
                    return env.sessions.map(function (s) { return Object.assign({}, s); });
                },
                deleteRow: function (sheet, row) {
                    calls.deleted.push(row);
                    env.sessions = env.sessions.filter(function (s) { return s.row !== row; });
                },
                updateUserStatus: function (row, status) {
                    calls.statusResets.push({ row: row, status: status });
                    const u = env.users.filter(function (x) { return x.row === row; })[0];
                    if (u) u.login_status = status;
                },
                audit: function (email, action, ip, ua, details) {
                    calls.audits.push({ email: email, action: action, details: details });
                }
            }
        };
        return env;
    }

    // users: заголовки r4, данные с r5 (как в живом листе).
    // user 7 — жертва (2 сессии), user 8 — посторонний (1 сессия,
    // НЕ должна быть тронута). user_id в сессиях — СТРОКОЙ: проверяем
    // Number()-приведение (живой лист отдаёт строки).
    function seed(env) {
        env.users = [
            { ID: 7, email: 'victim@x.io', role: 'Общий доступ', login_status: 'вход выполнен', last_login: new Date(0), row: 5 },
            { ID: 8, email: 'other@x.io', role: 'КИП8', login_status: 'вход выполнен', last_login: new Date(0), row: 6 }
        ];
        env.sessions = [
            { session_token: 'tok7a', user_id: '7', email: 'victim@x.io', role: 'Общий доступ', row: 5 },
            { session_token: 'tok8', user_id: '8', email: 'other@x.io', role: 'КИП8', row: 6 },
            { session_token: 'tok7b', user_id: '7', email: 'victim@x.io', role: 'Общий доступ', row: 7 }
        ];
    }

    const ADMIN = { email: 'admin@x.io' };

    function runUpdateRole(env, userId, newRole) {
        const fn = vm.runInNewContext('(' + UPDATE_ROLE_FN + ')', {
            Utils: env.Utils,
            console: { warn: function () {}, error: function () {} }
        });
        const adminHolder = { _requireAdmin: function (t) { return ADMIN; } };
        return fn.call(adminHolder, 'admintoken', userId, newRole);
    }

    test('VM: обычная роль — снапшоты sessions!D обновлены ТОЛЬКО у юзера, evicted=0, статус жив', () => {
        const env = makeEnv();
        seed(env);
        const res = runUpdateRole(env, 7, 'КИП8');
        assertEqual(res.ok, true, 'ok');
        assertEqual(res.evicted, 0, 'никого не выгнали');
        assertEqual(env.calls.withLock, 1, 'замок взят один раз');
        // users!C: role записана
        assertTrue(env.calls.setCells.some(function (c) { return c.sheet === 'users' && c.row === 5 && c.col === 3 && c.v === 'КИП8'; }),
            'users!C5 = КИП8');
        // sessions!D: обе сессии юзера 7 обновлены, сессия юзера 8 НЕ тронута
        const sessUpdates = env.calls.setCells.filter(function (c) { return c.sheet === 'sessions'; });
        assertEqual(sessUpdates.length, 2, 'ровно 2 обновления снапшота');
        assertTrue(sessUpdates.every(function (c) { return c.col === 4 && c.v === 'КИП8'; }),
            'обновление role-колонки D у обеих сессий');
        assertTrue(sessUpdates.some(function (c) { return c.row === 5; }) && sessUpdates.some(function (c) { return c.row === 7; }),
            'обновлены строки 5 и 7 (юзер 7)');
        assertFalse(sessUpdates.some(function (c) { return c.row === 6; }),
            'строка 6 (чужой юзер) не тронута');
        assertEqual(env.calls.deleted.length, 0, 'ничего не удалено');
        assertEqual(env.calls.statusResets.length, 0, 'login_status жив');
        assertEqual(env.sessions.length, 3, 'все 3 сессии на месте');
        assertTrue(env.calls.audits.some(function (a) { return a.action === 'ADMIN_UPDATE_ROLE' && a.details.indexOf('Общий доступ') !== -1 && a.details.indexOf('КИП8') !== -1; }),
            'аудит смены роли со старой→новой');
        assertFalse(env.calls.audits.some(function (a) { return a.action === 'FORCE_LOGOUT_ROLE'; }),
            'без FORCE_LOGOUT_ROLE');
    });

    test('VM: снапшот НЕ перезаписывается, если роль в сессии уже актуальна', () => {
        const env = makeEnv();
        seed(env);
        env.sessions[0].role = 'КИП8'; // сессия уже с целевой ролью
        runUpdateRole(env, 7, 'КИП8');
        const sessUpdates = env.calls.setCells.filter(function (c) { return c.sheet === 'sessions'; });
        assertEqual(sessUpdates.length, 1, 'обновлена только строка с устаревшей ролью (r7)');
        assertEqual(sessUpdates[0].row, 7, 'строка 7');
    });

    test('VM: «Запрет» — ВСЕ сессии юзера удалены мгновенно, чужие целы, статус сброшен', () => {
        const env = makeEnv();
        seed(env);
        const res = runUpdateRole(env, 7, 'Запрет');
        assertEqual(res.evicted, 2, 'выгнаны обе сессии юзера 7');
        assertEqual(env.sessions.length, 1, 'осталась только чужая сессия');
        assertEqual(env.sessions[0].session_token, 'tok8', 'сессия юзера 8 жива');
        assertEqual(env.users[0].login_status.indexOf('вход не'), 0, 'login_status жертвы сброшен');
        assertEqual(env.calls.statusResets.length, 1, 'сброс статуса один раз');
        assertEqual(env.users[1].login_status, 'вход выполнен', 'статус постороннего не тронут');
        assertEqual(env.calls.deleted.length, 2, 'два deleteRow');
        // users!C записана ДО выгонки — роль в users = Запрет
        assertTrue(env.calls.setCells.some(function (c) { return c.sheet === 'users' && c.v === 'Запрет'; }),
            'users!C = Запрет');
        // снапшоты sessions!D при Запрете НЕ пишутся (строк больше нет)
        assertEqual(env.calls.setCells.filter(function (c) { return c.sheet === 'sessions'; }).length, 0,
            'при Запрете снапшоты не обновляются');
        // аудит: ADMIN_UPDATE_ROLE + FORCE_LOGOUT_ROLE
        assertTrue(env.calls.audits.some(function (a) { return a.action === 'ADMIN_UPDATE_ROLE' && a.details.indexOf('evict: 2') !== -1; }),
            'в аудите указано число вытесненных');
        assertTrue(env.calls.audits.some(function (a) { return a.action === 'FORCE_LOGOUT_ROLE' && a.email === 'victim@x.io'; }),
            'FORCE_LOGOUT_ROLE от имени жертвы');
    });

    test('VM: «Запрет» офлайн-юзеру (сессий нет) — статус не трогаем, без FORCE_LOGOUT_ROLE', () => {
        const env = makeEnv();
        seed(env);
        env.sessions = [env.sessions[1]]; // юзер 7 без сессий
        env.users[0].login_status = 'вход не выполнен';
        const res = runUpdateRole(env, 7, 'Запрет');
        assertEqual(res.evicted, 0, 'выгонять некого');
        assertEqual(env.calls.statusResets.length, 0, 'login_status не сбрасывается (он и так сброшен)');
        assertFalse(env.calls.audits.some(function (a) { return a.action === 'FORCE_LOGOUT_ROLE'; }),
            'без ложной выгонки в аудите');
        assertEqual(env.sessions.length, 1, 'чужая сессия не тронута');
    });

    test('VM: Number-приведение user_id — строка "7" матчится с числом 7', () => {
        const env = makeEnv();
        seed(env);
        env.sessions[0].user_id = ' 7 '; // живой лист может отдать с пробелом
        const res = runUpdateRole(env, 7, 'Запрет');
        // Number(' 7 ') === 7 — пробельные края приводятся
        assertEqual(res.evicted, 2, 'строковый user_id с пробелами распознан');
    });

    test('VM: недопустимая роль — Invalid role, users!C НЕ записана', () => {
        const env = makeEnv();
        seed(env);
        let msg = '';
        try { runUpdateRole(env, 7, 'Суперадмин'); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('Invalid role') !== -1, 'ошибка: ' + msg);
        assertEqual(env.calls.setCells.length, 0, 'в таблицы ничего не записано');
        assertEqual(env.sessions.length, 3, 'сессии целы');
    });

    test('VM: юзер не найден — User not found (чтение внутри замка)', () => {
        const env = makeEnv();
        seed(env);
        let msg = '';
        try { runUpdateRole(env, 99, 'Запрет'); } catch (e) { msg = String(e.message || e); }
        assertTrue(msg.indexOf('User not found') !== -1, 'ошибка: ' + msg);
        assertEqual(env.calls.withLock, 1, 'замок был взят (и снят — мок синхронный)');
        assertEqual(env.sessions.length, 3, 'сессии целы');
    });
});
