// tests/test-task347.js
// Task 347 — Utils.cleanupStaleSessions(): автосчистка «заброшенных»
// строк листа sessions (last_heartbeat старше STALE_SESSION_DAYS дней,
// по умолчанию 30; вызов из hourlyCleanup в Code.gs).
//
// Контекст (2026-09-08, прод): после фикса Task 346 последний logout
// всё ещё не сбрасывал login_status — в листе sessions скопилось 37
// строк-сирот (входы без выхода; старый logout их не удалял; чистки
// трогали только сессии УДАЛЁННЫХ пользователей). Фикс Task 346 честно
// видел «другую сессию» и берёг статус. Пользователь вычистил строки
// руками (тест пройден), эта функция не даёт мусору копиться снова.
// Семантика НЕ «истечение по времени» (заявка: сессии бессрочные):
// живое устройство бьёт heartbeat каждые 5 минут; строка, молчавшая
// месяц, — удалённое приложение/очищенный браузер.
//
// Справочник scripts/Utils.gs теперь в репо (жил только в Apps Script):
// живой файл, прислан 2026-09-08 (включая встроенные Admin и
// setupTriggers) + cleanupStaleSessions.
//
// Запуск: через tests/run-all.js (require './test-task347.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const UTILS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Utils.gs'), 'utf8');
const CODE_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Code.gs'), 'utf8');

// ============================================================
// Извлечение cleanupStaleSessions из Utils.gs (для VM с моком this)
// ============================================================
function extractCleanupFn(src) {
    const START = src.indexOf('cleanupStaleSessions: function');
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
const CLEANUP_FN = extractCleanupFn(UTILS_SRC);

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);

// Мок this=Utils: getRows/deleteRow/audit/config/поиск пользователей.
// deleteRow реально удаляет строку из живого массива (как лист).
function cleanupSandbox(rows, users, staleDays) {
    const deleted = [];
    const audits = [];
    const statusUpdates = [];
    const live = rows.slice();
    const mock = {
        __deleted: deleted,
        __audits: audits,
        __statusUpdates: statusUpdates,
        __live: live,
        getConfig: function (key, def) {
            return key === 'STALE_SESSION_DAYS' ? (staleDays === undefined ? 30 : staleDays) : def;
        },
        getRows: function () { return live.slice(); },
        deleteRow: function (name, rowNum) {
            deleted.push({ name: name, row: rowNum });
            const idx = live.findIndex(function (r) { return r.row === rowNum; });
            if (idx !== -1) live.splice(idx, 1);
        },
        audit: function (email, action, ip, ua, details) {
            audits.push({ email: email, action: action, details: details });
        },
        userHasActiveSession: function (uid) {
            return live.some(function (r) { return Number(r.user_id) === Number(uid); });
        },
        findUserById: function (uid) {
            return users.find(function (u) { return Number(u.ID) === Number(uid); }) || null;
        },
        updateUserStatus: function (rowNum, status, lastLogin) {
            statusUpdates.push({ row: rowNum, status: status, lastLogin: lastLogin });
        }
    };
    // runInThisContext (НЕ runInNewContext): instanceof Date внутри функции
    // должен видеть ДЕЙСТВИТЕЛЬНЫЙ конструктор Date — в отдельном vm-контексте
    // main-realm-даты не проходят instanceof и все строки кажутся «молчаливыми».
    mock.cleanupStaleSessions = vm.runInThisContext('(' + CLEANUP_FN + ')');
    return mock;
}

// Task 348: cleanupStaleSessions выполняется под Utils.withLock —
// компилируется через runInThisContext, значит Utils ищется в глобале
// основного контекста. Замок прокидываем (критическая секция выполняется
// сразу); сам замок тестируется в test-task348.js с моком LockService.
// Стрелочная функция внутри cleanupStaleSessions захватывает this (= mock)
// лексически — на passthrough это не влияет.
global.Utils = global.Utils || {};
global.Utils.withLock = global.Utils.withLock || function (fn, timeoutMs) { return fn(); };

// ============================================================
// 1. SRC-гарды справочников
// ============================================================
describe('Task 347 — SRC: справочники в репо', () => {

    test('SRC: scripts/Utils.gs существует (справочник жил только в Apps Script)', () => {
        assertTrue(UTILS_SRC.length > 1000, 'Utils.gs прочитан, размер разумный');
        assertTrue(UTILS_SRC.indexOf('const Utils = {') !== -1, 'объект Utils определён');
    });

    test('SRC: Utils.cleanupStaleSessions определён в Utils.gs', () => {
        assertTrue(CLEANUP_FN.length > 100,
            'функция извлечена из справочника (для VM-тестов ниже)');
    });

    test('SRC: Code.gs вызывает Utils.cleanupStaleSessions() в hourlyCleanup', () => {
        const i = CODE_SRC.indexOf('function hourlyCleanup()');
        assertTrue(i !== -1, 'hourlyCleanup есть в Code.gs');
        const body = CODE_SRC.slice(i, CODE_SRC.indexOf('}', i));
        assertTrue(body.indexOf('Utils.cleanupStaleSessions()') !== -1,
            'вызов добавлен в hourlyCleanup');
    });

    test('SRC: порог читается из config (STALE_SESSION_DAYS, дефолт 30)', () => {
        assertTrue(UTILS_SRC.indexOf("getConfig('STALE_SESSION_DAYS', 30)") !== -1,
            'getConfig с ключом и дефолтом');
    });

    test('SRC: событие аудита SESSION_CLEANUP_STALE', () => {
        assertTrue(UTILS_SRC.indexOf("'SESSION_CLEANUP_STALE'") !== -1,
            'событие удаления заброшенной строки');
        assertTrue(UTILS_SRC.indexOf("'LOGIN_STATUS_AUTO_RESET'") !== -1,
            'событие сброса статуса (как в Auth.sendOTP самосинхронизации)');
    });

    test('SRC: updateUserStatus вызывается с user.row (Task 37/346: rowNum, НЕ ID)', () => {
        assertTrue(UTILS_SRC.indexOf('this.updateUserStatus(user.row,') !== -1,
            'первый аргумент — номер строки (user.row)');
    });
});

// ============================================================
// 2. VM-тесты поведения
// ============================================================
describe('Task 347 — VM: cleanupStaleSessions', () => {

    // Строки: r5 старая (40 дн, юзер 7), r6 живая (юзер 7), r7 старая (35 дн, юзер 8),
    // r8 легаси без user_id (60 дн), r9 невалидный last_heartbeat (юзер 9).
    function baseRows() {
        return [
            { row: 5, session_token: 'A', user_id: 7, email: 'a@x.com', last_heartbeat: daysAgo(40) },
            { row: 6, session_token: 'B', user_id: 7, email: 'a@x.com', last_heartbeat: new Date() },
            { row: 7, session_token: 'C', user_id: 8, email: 'b@x.com', last_heartbeat: daysAgo(35) },
            { row: 8, session_token: 'D', user_id: '', email: 'legacy@x.com', last_heartbeat: daysAgo(60) },
            { row: 9, session_token: 'E', user_id: 9, email: 'e@x.com', last_heartbeat: '' }
        ];
    }
    const baseUsers = [
        { row: 12, ID: 7, email: 'a@x.com', login_status: 'вход выполнен' },
        { row: 13, ID: 8, email: 'b@x.com', login_status: 'вход выполнен' },
        { row: 14, ID: 9, email: 'e@x.com', login_status: 'вход не выполнен' }
    ];

    test('VM: старые строки удалены, живая осталась', () => {
        const m = cleanupSandbox(baseRows(), baseUsers);
        const removed = m.cleanupStaleSessions();
        assertEqual(removed, 4, 'удалены r5 (40 дн), r7 (35 дн), r8 (60 дн), r9 (невалидный hb)');
        assertEqual(m.__live.length, 1, 'осталась только живая r6');
        assertEqual(m.__live[0].session_token, 'B', 'живая сессия юзера 7 не тронута');
    });

    test('VM: удаление с конца — номера строк по убыванию (нумерация листа не сбивается)', () => {
        const m = cleanupSandbox(baseRows(), baseUsers);
        m.cleanupStaleSessions();
        const rows = m.__deleted.map(function (d) { return d.row; });
        assertEqual(rows.join(','), '9,8,7,5', 'r9 → r8 → r7 → r5 (по убыванию)');
        assertTrue(m.__deleted.every(function (d) { return d.name === 'sessions'; }),
            'удаление из листа sessions');
    });

    test('VM: у юзера 7 осталась живая сессия → статус НЕ сбрасывается', () => {
        const m = cleanupSandbox(baseRows(), baseUsers);
        m.cleanupStaleSessions();
        const reset7 = m.__statusUpdates.filter(function (u) { return u.row === 12; });
        assertEqual(reset7.length, 0, 'login_status юзера 7 не тронут (сессия B жива)');
    });

    test('VM: у юзера 8 сессий не осталось → статус сброшен + LOGIN_STATUS_AUTO_RESET', () => {
        const m = cleanupSandbox(baseRows(), baseUsers);
        m.cleanupStaleSessions();
        const reset8 = m.__statusUpdates.filter(function (u) { return u.row === 13; });
        assertEqual(reset8.length, 1, 'ровно один сброс для юзера 8');
        assertEqual(reset8[0].status, 'вход не выполнен', 'сброшен в «вход не выполнен»');
        const auto = m.__audits.filter(function (a) { return a.action === 'LOGIN_STATUS_AUTO_RESET'; });
        assertEqual(auto.length, 1, 'событие LOGIN_STATUS_AUTO_RESET записано');
        assertEqual(auto[0].email, 'b@x.com', 'в аудите email пользователя, а не пустой');
    });

    test('VM: юзер уже «вход не выполнен» → статус не перезаписывается', () => {
        const m = cleanupSandbox(baseRows(), baseUsers);
        m.cleanupStaleSessions();
        const reset9 = m.__statusUpdates.filter(function (u) { return u.row === 14; });
        assertEqual(reset9.length, 0, 'юзер 9 (уже не выполнен) — лишних записей нет');
    });

    test('VM: легаси-строка без user_id удалена, но статус её юзера не трогается', () => {
        const rows = [
            { row: 5, session_token: 'D', user_id: '', email: 'legacy@x.com', last_heartbeat: daysAgo(60) }
        ];
        const users = [{ row: 11, ID: 42, email: 'legacy@x.com', login_status: 'вход выполнен' }];
        const m = cleanupSandbox(rows, users);
        const removed = m.cleanupStaleSessions();
        assertEqual(removed, 1, 'легаси-строка удалена');
        assertEqual(m.__statusUpdates.length, 0,
            'статус не сброшен — рассинхрон починит самосинхронизация Auth.sendOTP');
    });

    test('VM: пустой last_heartbeat = 0 → строка считается молчаливой и удаляется', () => {
        const rows = [
            { row: 5, session_token: 'E', user_id: 9, email: 'e@x.com', last_heartbeat: '' }
        ];
        const m = cleanupSandbox(rows, baseUsers);
        const removed = m.cleanupStaleSessions();
        assertEqual(removed, 1, 'строка с невалидным last_heartbeat удалена');
    });

    test('VM: audit SESSION_CLEANUP_STALE — по записи на строку, с email сессии', () => {
        const m = cleanupSandbox(baseRows(), baseUsers);
        m.cleanupStaleSessions();
        const stale = m.__audits.filter(function (a) { return a.action === 'SESSION_CLEANUP_STALE'; });
        assertEqual(stale.length, 4, 'по одному событию на удалённую строку');
        assertTrue(stale.some(function (a) { return a.email === 'legacy@x.com'; }),
            'email берётся из строки сессии (даже легаси без user_id)');
        assertTrue(stale.some(function (a) {
            return String(a.details).indexOf('30 days') !== -1;
        }), 'в деталях — порог в днях');
    });

    test('VM: порог из config — STALE_SESSION_DAYS=90: строка 40 дней НЕ удаляется', () => {
        const m = cleanupSandbox(baseRows(), baseUsers, 90);
        const removed = m.cleanupStaleSessions();
        // 40 и 35 дней < 90 → остаются; легаси 60 дней < 90 → остаётся;
        // невалидный hb (0) → всё равно молчаливая → удаляется.
        assertEqual(removed, 1, 'удалён только невалидный last_heartbeat');
        assertEqual(m.__live.length, 4, 'остальные 4 строки живы при пороге 90');
    });

    test('VM: все сессии живые → ничего не удаляется, статусы не трогаются', () => {
        const rows = [
            { row: 5, session_token: 'A', user_id: 7, email: 'a@x.com', last_heartbeat: new Date() },
            { row: 6, session_token: 'B', user_id: 8, email: 'b@x.com', last_heartbeat: daysAgo(1) }
        ];
        const m = cleanupSandbox(rows, baseUsers);
        const removed = m.cleanupStaleSessions();
        assertEqual(removed, 0, 'ничего не удалено');
        assertEqual(m.__audits.length, 0, 'аудит пуст');
        assertEqual(m.__statusUpdates.length, 0, 'статусы не тронуты');
    });
});
