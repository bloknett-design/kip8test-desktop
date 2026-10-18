// tests/test-task346.js
// Task 346 — политика сессий «1 моб + 1 десктоп» на одну почту.
// Заявка (2026-09-08): «у пользователей должна быть возможность с одной
// почты заходить и параллельно работать в двух приложениях, в мобильном
// и десктопном. Чтобы при входе, допустим, в мобильное приложение, затем
// он мог с этой же почтой войти в десктопное приложение и при этом не
// было запрета с формулировкой, что пользователь уже вошел. Но не
// больше двух входов с одной почты, и только один вход в мобильное
// приложение, а другой вход с этой же почты в десктопное приложение.»
//
// Диагноз до задачи: сервер создавал сессию на КАЖДЫЙ вход без
// ограничений (снапшот KIP8_Access 2026-09-08: 41 строка sessions, у
// одного email — 12) и НЕ различал тип устройства (колонки device нет).
//
// Реализация:
//   КЛИЕНТ: KipAuth._detectDeviceType() ('mobile' — мобильный UA,
//   'desktop' — Electron/ПК); verifyOTP шлёт payload.device; при
//   ответе evicted>0 — тост «Прежний вход в … приложении … завершён»;
//   админ-панель — бейдж «моб»/«десктоп» у сессий. Старый сервер поле
//   игнорирует — обратная совместимость.
//   СЕРВЕР (Apps Script, НЕ в репо — справочник): scripts/
//   SessionsDevicePolicy.gs + DEPLOY-Task346-sessions-device-policy.md:
//   колонка device листа sessions + вытеснение прежней сессии ТОГО ЖЕ
//   типа (инвариант ≤1 mobile + ≤1 desktop; вход в «другое» приложение
//   всегда разрешён, никаких «уже вошли»).
//
// SW: kipia-test-v751.
//
// Фикс logout (2026-09-08, по живому Sessions.gs, прислан пользователем):
// logout безусловно сбрасывал login_status ПОЛЬЗОВАТЕЛЯ → heartbeat
// параллельного устройства (моб+десктоп, каждые 5 мин) видел «вход не
// выполнен» → session_expired → выход из моба выкидывал десктоп. Патч:
// сброс ТОЛЬКО при отсутствии других сессий (_userHasOtherSession,
// сопоставление по user_id ИЛИ email, fail-safe) + getCurrentUser
// userId: user.ID (Task 37: раньше user.id → undefined). Справочник:
// scripts/Sessions.gs + DEPLOY-Task346-sessions-logout-fix.md.
//
// Запуск: через tests/run-all.js (require './test-task346.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// ============================================================
// Извлечение модулей (KipAuth / KipAdmin) из index.html
// ============================================================
function extractObject(name) {
    const START = INDEX_SRC.indexOf('const ' + name + ' = {');
    if (START === -1) return '';
    const END = INDEX_SRC.indexOf('\n    };', START);
    return INDEX_SRC.slice(START, END + 6) + '\n' + name + ';';
}

const KIPAUTH_SRC = extractObject('KipAuth');
const KIPADMIN_SRC = extractObject('KipAdmin');

// Мок localStorage (как test-task344)
function mockStorage() {
    const store = {};
    return {
        store: store,
        getItem: function (k) {
            return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
        },
        setItem: function (k, v) { store[k] = String(v); },
        removeItem: function (k) { delete store[k]; }
    };
}

// Sandbox для KipAuth: window/navigator/localStorage/showToast + счётчик тостов
function authSandbox(ua, isElectron) {
    const toasts = [];
    const storage = mockStorage();
    const sandbox = {
        localStorage: storage,
        console: { log: function () {}, warn: function () {}, error: function () {} },
        showToast: function (msg) { toasts.push(String(msg)); },
        setTimeout: function () { return 0; },
        setInterval: function () { return 0; },
        clearInterval: function () {},
        navigator: { userAgent: ua || '' },
        document: {
            getElementById: function () {
                return { value: '', classList: { add: function () {}, remove: function () {} },
                         disabled: false, innerHTML: '', focus: function () {} };
            }
        }
    };
    sandbox.window = sandbox;
    if (isElectron) sandbox.__isElectron = true;
    sandbox.__toasts = toasts;
    sandbox.__storage = storage;
    return sandbox;
}

// ============================================================
// 1. _detectDeviceType — классификация устройства
// ============================================================
describe('Task 346 — KipAuth._detectDeviceType', () => {

    test('SRC: метод _detectDeviceType определён в KipAuth', () => {
        assertTrue(KIPAUTH_SRC.indexOf('_detectDeviceType: function') !== -1,
            'метод в модуле KipAuth');
    });

    test('VM: Electron-десктоп → desktop (флаг __isElectron)', () => {
        const sb = authSandbox('Mozilla/5.0 (Linux; Android 13) Mobile', true);
        const KipAuth = vm.runInNewContext(KIPAUTH_SRC, sb);
        assertEqual(KipAuth._detectDeviceType(), 'desktop',
            '__isElectron=true даже с мобильным UA (флаг приоритетнее)');
    });

    test('VM: Android UA → mobile', () => {
        const sb = authSandbox('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Mobile Safari/537.36', false);
        const KipAuth = vm.runInNewContext(KIPAUTH_SRC, sb);
        assertEqual(KipAuth._detectDeviceType(), 'mobile', 'Android PWA/браузер');
    });

    test('VM: iPhone UA → mobile', () => {
        const sb = authSandbox('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', false);
        const KipAuth = vm.runInNewContext(KIPAUTH_SRC, sb);
        assertEqual(KipAuth._detectDeviceType(), 'mobile', 'iOS PWA/браузер');
    });

    test('VM: iPad UA → mobile', () => {
        const sb = authSandbox('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', false);
        const KipAuth = vm.runInNewContext(KIPAUTH_SRC, sb);
        assertEqual(KipAuth._detectDeviceType(), 'mobile', 'iPad');
    });

    test('VM: десктопный Chrome (Windows) → desktop', () => {
        const sb = authSandbox('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36', false);
        const KipAuth = vm.runInNewContext(KIPAUTH_SRC, sb);
        assertEqual(KipAuth._detectDeviceType(), 'desktop', 'браузер на ПК');
    });

    test('VM: пустой navigator.userAgent → desktop (fail-safe)', () => {
        const sb = authSandbox('', false);
        const KipAuth = vm.runInNewContext(KIPAUTH_SRC, sb);
        assertEqual(KipAuth._detectDeviceType(), 'desktop', 'нет UA — десктоп по умолчанию');
    });
});

// ============================================================
// 2. verifyOTP — device в payload + тост evicted
// ============================================================
describe('Task 346 — verifyOTP: device в payload, тост evicted', () => {

    test('SRC: payload verifyOTP содержит device: deviceType', () => {
        const i = KIPAUTH_SRC.indexOf("api('verifyOTP'");
        assertTrue(i !== -1, 'вызов api verifyOTP найден');
        const around = KIPAUTH_SRC.slice(i - 200, i + 200);
        assertTrue(around.indexOf('device: deviceType') !== -1,
            'поле device в payload');
        assertTrue(around.indexOf('this._detectDeviceType()') !== -1,
            'тип берётся из _detectDeviceType()');
    });

    test('SRC: ответ с evicted → тост о закрытии прежнего входа', () => {
        const i = KIPAUTH_SRC.indexOf('data.evicted');
        assertTrue(i !== -1, 'обработка evicted есть');
        const around = KIPAUTH_SRC.slice(i - 100, i + 500);
        assertTrue(around.indexOf('showToast') !== -1, 'тост показывается');
        assertTrue(around.indexOf('мобильном') !== -1
            && around.indexOf('десктопном') !== -1,
            'формулировка зависит от типа устройства');
        assertTrue(around.indexOf("deviceType === 'mobile'") !== -1,
            'тип вытесненной сессии — текущий deviceType');
    });

    test('VM: мобильный UA — api получает device=mobile; evicted=1 → тост; токен сохранён', () => {
        const sb = authSandbox('Mozilla/5.0 (Linux; Android 13) Mobile', false);
        const KipAuth = vm.runInNewContext(KIPAUTH_SRC, sb);

        // Мок api: запоминаем payload, возвращаем успех с evicted
        let captured = null;
        KipAuth.api = function (action, payload) {
            captured = { action: action, payload: payload };
            return Promise.resolve({ token: 't346-mob', role: 'Админ',
                userId: 3, email: 'user@test.local', evicted: 1 });
        };
        // Заглушки методов флоу входа (после успешного verify)
        let hidden = 0, beats = 0;
        KipAuth._hideLoginScreen = function () { hidden++; };
        KipAuth._startHeartbeat = function () { beats++; };
        KipAuth._updateSidebarUserInfo = function () {};
        KipAuth._applyRoleToUI = function () {};
        KipAuth._fetchMyAccess = function () {};

        KipAuth._pendingEmail = 'user@test.local';
        // OTP-поля: DOM-мок возвращает value='1' для otp1..otp6
        // (код 111111).
        sb.document.getElementById = function (id) {
            if (/^otp[1-6]$/.test(id)) {
                return { value: '1', classList: { add: function () {}, remove: function () {} },
                         disabled: false, innerHTML: '', focus: function () {} };
            }
            return { value: '', classList: { add: function () {}, remove: function () {} },
                     disabled: false, innerHTML: '', focus: function () {} };
        };

        // verifyOTP() не возвращает промис (цепочка .then внутри без
        // return — штатный код): вызываем и ждём ЦЕПЬ МИКРОТАСКОВ
        // (макротаймеры трогать нельзя — в очереди Node остаются
        // таймеры других VM-тестов с неполными DOM-моками).
        KipAuth.verifyOTP();
        var _ticks = 0;
        function _tick() {
            _ticks++;
            return _ticks < 8 ? Promise.resolve().then(_tick) : Promise.resolve();
        }
        return _tick().then(function () {
            assertEqual(captured && captured.action, 'verifyOTP', 'action');
            assertEqual(captured && captured.payload.device, 'mobile',
                'payload.device = mobile (мобильный UA)');
            assertEqual(captured.payload.email, 'user@test.local', 'email в payload');
            assertEqual(captured.payload.code, '111111', 'код из OTP-полей');
            assertEqual(sb.__storage.store['kip8_session_token'], 't346-mob',
                'токен сохранён');
            assertEqual(hidden, 1, 'экран входа скрыт');
            assertEqual(beats, 1, 'heartbeat запущен');
            assertEqual(sb.__toasts.length, 1, 'показан 1 тост (evicted=1)');
            assertTrue(sb.__toasts[0].indexOf('мобильном') !== -1,
                'тост про мобильное приложение');
            assertTrue(sb.__toasts[0].indexOf('завершён') !== -1,
                'формулировка о завершении прежнего входа');
            });
    });

    test('VM: десктопный UA — device=desktop; СТАРЫЙ сервер без evicted → тоста нет', () => {
        const sb = authSandbox('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126', false);
        const KipAuth = vm.runInNewContext(KIPAUTH_SRC, sb);

        let captured = null;
        KipAuth.api = function (action, payload) {
            captured = { action: action, payload: payload };
            // Старый сервер: поле evicted НЕ возвращает
            return Promise.resolve({ token: 't346-desk', role: 'Админ',
                userId: 3, email: 'user@test.local' });
        };
        KipAuth._hideLoginScreen = function () {};
        KipAuth._startHeartbeat = function () {};
        KipAuth._updateSidebarUserInfo = function () {};
        KipAuth._applyRoleToUI = function () {};
        KipAuth._fetchMyAccess = function () {};

        KipAuth._pendingEmail = 'user@test.local';
        sb.document.getElementById = function (id) {
            if (/^otp[1-6]$/.test(id)) {
                return { value: '2', classList: { add: function () {}, remove: function () {} },
                         disabled: false, innerHTML: '', focus: function () {} };
            }
            return { value: '', classList: { add: function () {}, remove: function () {} },
                     disabled: false, innerHTML: '', focus: function () {} };
        };

        // См. предыдущий тест: verifyOTP не возвращает промис; ждём
        // микротасками, без макротаймеров.
        KipAuth.verifyOTP();
        var _ticks2 = 0;
        function _tick2() {
            _ticks2++;
            return _ticks2 < 8 ? Promise.resolve().then(_tick2) : Promise.resolve();
        }
        return _tick2().then(function () {
            assertEqual(captured.payload.device, 'desktop',
                'payload.device = desktop (UA ПК)');
            assertEqual(sb.__toasts.length, 0,
                'тоста НЕТ — обратная совместимость со старым сервером');
            assertEqual(sb.__storage.store['kip8_session_token'], 't346-desk',
                'вход выполнен, токен сохранён');
            });
    });
});

// ============================================================
// 3. Админ-панель — бейдж устройства у сессий
// ============================================================
describe('Task 346 — админ-панель: бейдж «моб»/«десктоп»', () => {

    test('SRC: CSS-класс admin-badge-device (тёмная + светлая темы)', () => {
        assertTrue(INDEX_SRC.indexOf('.admin-badge-device {') !== -1,
            'тёмная тема');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .admin-badge-device') !== -1,
            'светлая тема');
    });

    test('SRC: renderSessions рендерит бейдж по s.device', () => {
        const i = KIPADMIN_SRC.indexOf('admin-badge-device');
        assertTrue(i !== -1, 'бейдж в renderSessions');
        const around = KIPADMIN_SRC.slice(i - 300, i + 300);
        assertTrue(around.indexOf("s.device === 'mobile'") !== -1
            && around.indexOf("s.device === 'desktop'") !== -1,
            'бейдж только для mobile/desktop');
        assertTrue(around.indexOf('моб') !== -1 && around.indexOf('десктоп') !== -1,
            'подписи бейджей');
    });

    test('VM: renderSessions — бейджи по device, у легаси-сессий нет', () => {
        const sb = authSandbox('', false);
        const KipAdmin = vm.runInNewContext(KIPADMIN_SRC, sb);

        KipAdmin._sessions = [
            { email: 'a@x.ru', role: 'Админ', token: 'tokA',
              created_at: '2026-09-08 10:00:00', last_heartbeat: '2026-09-08 11:00:00',
              device: 'mobile' },
            { email: 'b@x.ru', role: 'КИП ИОС', token: 'tokB',
              created_at: '2026-09-08 10:00:00', last_heartbeat: '2026-09-08 11:00:00',
              device: 'desktop' },
            { email: 'c@x.ru', role: 'КИП ИОС', token: 'tokC',
              created_at: '2026-09-08 10:00:00', last_heartbeat: '2026-09-08 11:00:00' },
            { email: 'd@x.ru', role: 'КИП ИОС', token: 'tokD',
              created_at: '2026-09-08 10:00:00', last_heartbeat: '2026-09-08 11:00:00',
              device: 'телефон' }
        ];
        let html = '';
        sb.document.getElementById = function (id) {
            if (id === 'adminSessionsList') {
                return { set innerHTML(v) { html = v; }, get innerHTML() { return html; } };
            }
            if (id === 'adminSessionSearch') return { value: '' };
            return { value: '' };
        };

        KipAdmin.renderSessions();

        const items = html.split('admin-item-email').length - 1;
        assertEqual(items, 4, 'все 4 сессии отрендерены');
        assertEqual(html.split('admin-badge-device').length - 1, 2,
            'ровно 2 бейджа устройства (mobile + desktop)');
        assertTrue(/>\s*моб\s*</.test(html.replace('admin-badge-device', '')),
            'бейдж «моб» у mobile-сессии');
        assertTrue(/>\s*десктоп\s*</.test(html.replace('admin-badge-device', '')),
            'бейдж «десктоп» у desktop-сессии');
        // легаси-сессии (без device / мусорное значение) — без бейджа
        const rows = html.split('<div class="admin-item">').slice(1);
        assertEqual((rows[2].indexOf('admin-badge-device') === -1), true,
            'сессия без device — без бейджа');
        assertEqual((rows[3].indexOf('admin-badge-device') === -1), true,
            'мусорный device («телефон») — без бейджа');
    });
});

// ============================================================
// 4. Серверный справочник (Apps Script, в репо — референс)
// ============================================================
describe('Task 346 — серверный справочник SessionsDevicePolicy.gs', () => {

    test('ФАЙЛ: scripts/SessionsDevicePolicy.gs существует', () => {
        assertTrue(fs.existsSync(path.join(ROOT, 'scripts', 'SessionsDevicePolicy.gs')),
            'справочник в репо');
    });

    test('ФАЙЛ: DEPLOY-инструкция в git-архиве (регламент Task 510)', () => {
        // Task 510: DEPLOY-доки старше недели удалены из рабочей копии.
        // История: git show pre-task510:scripts/DEPLOY-Task346-sessions-device-policy.md
        assertTrue(!fs.existsSync(path.join(ROOT, 'scripts', 'DEPLOY-Task346-sessions-device-policy.md')),
            'DEPLOY старше недели удалён из рабочей копии (архив Task 510)');
    });

    test('ФАЙЛ: патченный Auth.gs существует (справочник живого сервера)', () => {
        assertTrue(fs.existsSync(path.join(ROOT, 'scripts', 'Auth.gs')),
            'scripts/Auth.gs — патч Task 346 для живого Auth.gs');
    });

    test('AUTH: блокировки «уже выполнен вход» удалены (заявка: без запретов)', () => {
        const auth = fs.readFileSync(path.join(ROOT, 'scripts', 'Auth.gs'), 'utf8');
        assertTrue(auth.indexOf('LOGIN_BLOCKED_DUPLICATE') === -1,
            'audit-событие блокировки убрано из Auth.gs');
        assertTrue(auth.indexOf("throw new Error('С этого аккаунта") === -1,
            'throw «С этого аккаунта уже выполнен вход…» убран (в комментариях упоминание допустимо)');
    });

    test('AUTH: verifyOTP принимает payload; политика с guard; evicted в ответе', () => {
        const auth = fs.readFileSync(path.join(ROOT, 'scripts', 'Auth.gs'), 'utf8');
        assertTrue(auth.indexOf('verifyOTP: function(rawEmail, code, payload)') !== -1,
            'сигнатура с 3-м аргументом payload');
        assertTrue(auth.indexOf("typeof sdpApplyDevicePolicy === 'function'") !== -1,
            'guard: без SessionsDevicePolicy.gs вход не падает');
        assertTrue(auth.indexOf('sdpApplyDevicePolicy(email, t346device, session.token)') !== -1,
            'вызов политики после создания сессии');
        assertTrue(auth.indexOf('evicted: t346evicted') !== -1,
            'evicted в ответе для тоста');
    });

    test('AUTH: самосинхронизация login_status сохранена (без throw)', () => {
        const auth = fs.readFileSync(path.join(ROOT, 'scripts', 'Auth.gs'), 'utf8');
        assertTrue(auth.indexOf('LOGIN_STATUS_AUTO_RESET') !== -1,
            'авто-сброс устаревшего login_status остался');
        assertTrue(auth.indexOf('&& !Utils.userHasActiveSession') !== -1,
            'сброс только при отсутствии активных сессий');
    });

    test('DEPLOY: правка роутера зафиксирована в справочнике Code.gs (архив Task 510)', () => {
        // Task 510: сама инструкция в git-архиве (pre-task510);
        // регрессионная суть (payload в роутере) остаётся под контролем в Code.gs.
        const code = fs.readFileSync(path.join(ROOT, 'scripts', 'Code.gs'), 'utf8');
        assertTrue(code.indexOf('Auth.verifyOTP(payload.email, payload.code, payload)') !== -1,
            'справочник Code.gs передаёт payload в Auth.verifyOTP');
    });

    test('CODE.GS: справочник роутера содержит правку Task 346 (payload)', () => {
        const code = fs.readFileSync(path.join(ROOT, 'scripts', 'Code.gs'), 'utf8');
        assertTrue(code.indexOf('Auth.verifyOTP(payload.email, payload.code, payload)') !== -1,
            'справочник Code.gs передаёт payload в Auth.verifyOTP (иначе политика неактивна)');
        assertTrue(code.indexOf('Auth.verifyOTP(payload.email, payload.code);') === -1,
            'старая строка без payload не осталась');
    });

    test('ФАЙЛ: политика — fail-open, вытеснение того же device, инвариант', () => {
        const gs = fs.readFileSync(path.join(ROOT, 'scripts', 'SessionsDevicePolicy.gs'), 'utf8');
        assertTrue(gs.indexOf('function sdpApplyDevicePolicy') !== -1,
            'функция политики');
        assertTrue(gs.indexOf('FAIL-OPEN') !== -1,
            'ошибка политики не блокирует вход');
        assertTrue(gs.indexOf('rowsToEvict') !== -1, 'вытеснение старых сессий');
        assertTrue(gs.indexOf("SDP_DEVICES = { 'mobile': true, 'desktop': true }") !== -1,
            'только mobile/desktop; старые клиенты пропускаются');
        assertTrue(gs.indexOf('deleteRow') !== -1, 'удаление вытесненных строк');
        assertTrue(gs.indexOf('unsupported_device') !== -1,
            'payload без device → политика пропущена (легаси)');
    });
});

// ============================================================
// 4b. Фикс logout (Sessions.gs) — Task 346, продолжение заявки
// ============================================================
const SESSIONS_GS = path.join(ROOT, 'scripts', 'Sessions.gs');
const SESSIONS_GS_SRC = fs.readFileSync(SESSIONS_GS, 'utf8');

// Мок окружения Apps Script для VM: Utils + лист sessions
// (структура живого листа: r1–r3 описание, r4 заголовки, r5+ данные).
function sessionsSandbox(rows, user) {
    const calls = { deleted: [], statusUpdates: [], audits: [] };
    const sheet = {
        getDataRange: function () {
            return { getValues: function () { return rows; } };
        }
    };
    const Utils = {
        findSessionByToken: function (tok) {
            for (let r = 0; r < rows.length; r++) {
                if (String((rows[r] || [])[0] || '') === String(tok)) {
                    return { token: tok, row: r + 1, user_id: rows[r][1],
                             email: rows[r][2], role: rows[r][3] };
                }
            }
            return null;
        },
        deleteRow: function (name, row) {
            calls.deleted.push(row);
            rows.splice(row - 1, 1);
        },
        findUserById: function () {
            return user ? { ID: user.ID, email: user.email, role: user.role,
                login_status: user.login_status, row: user.row,
                last_login: user.last_login } : null;
        },
        updateUserStatus: function (row, status, lastLogin) {
            calls.statusUpdates.push(status);
        },
        audit: function (email, action, ip, ua, details) {
            calls.audits.push({ email: email, action: action, details: String(details) });
        },
        getSheet: function (name) { return sheet; },
        // Task 348: Sessions.gs теперь берёт Utils.withLock — в VM-тестах
        // замок прокидывается (критическая секция выполняется сразу);
        // сам замок тестируется в test-task348.js с моком LockService.
        withLock: function (fn, timeoutMs) { return fn(); }
    };
    const sb = {
        Utils: Utils,
        console: { log: function () {}, warn: function () {}, error: function () {} }
    };
    sb.__calls = calls;
    return sb;
}

function sessionsSheet(withDesktop, withLegacy) {
    const d = new Date(2026, 8, 8, 12, 0, 0);
    const rows = [
        ['Лист активных сессий (справочно)', '', '', '', '', '', ''],
        ['', '', '', '', '', '', ''],
        ['', '', '', '', '', '', ''],
        ['session_token', 'user_id', 'email', 'role', 'created_at', 'last_heartbeat', 'device'],
        ['mob-token', 7, 'u@x.ru', 'КИП ИОС', d, d, 'mobile']
    ];
    if (withDesktop) {
        rows.push(['desk-token', 7, 'u@x.ru', 'КИП ИОС', d, d, 'desktop']);
    }
    if (withLegacy) {
        rows.push(['legacy-token', '', 'u@x.ru', 'КИП ИОС', d, d, '']);
    }
    return rows;
}

const T346_USER = { ID: 7, email: 'u@x.ru', role: 'КИП ИОС',
    login_status: 'вход выполнен', row: 2, last_login: new Date(2026, 8, 8) };

describe('Task 346 — фикс logout в Sessions.gs (параллельные сессии)', () => {

    test('ФАЙЛ: справочник scripts/Sessions.gs существует (живой код + патч)', () => {
        assertTrue(fs.existsSync(SESSIONS_GS), 'справочник в репо');
    });

    test('SRC: logout сбрасывает login_status ТОЛЬКО без других сессий', () => {
        assertTrue(SESSIONS_GS_SRC.indexOf('_userHasOtherSession: function') !== -1,
            'приватный helper в объекте Sessions');
        assertTrue(SESSIONS_GS_SRC.indexOf('if (!Sessions._userHasOtherSession(session.user_id, session.email))') !== -1,
            'сброс login_status под условием «других сессий нет»');
        // Task 348: тело logout теперь внутри Utils.withLock — отступ +2;
        // проверяем без привязки к точному отступу (regex)
        const re = new RegExp("updateUserStatus\\(user\\.row, 'вход не выполнен', user\\.last_login\\);\\s*\\}\\s*else\\s*\\{");
        assertTrue(re.test(SESSIONS_GS_SRC),
            'ветка else: при живой параллельной сессии статус не трогаем');
    });

    test('SRC: getCurrentUser возвращает user.ID (Task 37), не user.id', () => {
        assertTrue(SESSIONS_GS_SRC.indexOf('userId: user.ID') !== -1,
            'заглавные ID (заголовок листа users — «ID»)');
        assertTrue(SESSIONS_GS_SRC.indexOf('userId: user.id') === -1,
            'строчные user.id (баг → undefined) убраны');
    });

    test('SRC: helper — fail-safe и сопоставление по user_id ИЛИ email', () => {
        assertTrue(SESSIONS_GS_SRC.indexOf('targetEmail') !== -1,
            'совпадение по email (страховка от пустых user_id, баг Task 37)');
        assertTrue(SESSIONS_GS_SRC.indexOf('return false; // других сессий нет — можно сбрасывать login_status') !== -1,
            'false = других сессий нет (сброс разрешён)');
        assertTrue(SESSIONS_GS_SRC.indexOf('ошибка — статус НЕ сбрасываем (fail-safe)') !== -1,
            'catch: ошибка чтения листа → true → статус не сбрасывается');
    });

    test('DEPLOY: фикс logout в git-архиве, суть живёт в Sessions.gs (архив Task 510)', () => {
        // Task 510: DEPLOY-Task346-sessions-logout-fix.md в git-архиве (pre-task510);
        // суть фикса (_userHasOtherSession, user.ID) остаётся в scripts/Sessions.gs.
        const gs = fs.readFileSync(path.join(ROOT, 'scripts', 'Sessions.gs'), 'utf8');
        assertTrue(gs.indexOf('_userHasOtherSession') !== -1,
            'точечная правка logout в справочнике Sessions.gs');
        assertTrue(gs.indexOf('user.ID') !== -1,
            'бонус-фикс getCurrentUser (user.ID) в справочнике');
    });

    test('VM: logout из моба при живом десктопе — login_status НЕ сбрасывается', () => {
        const sb = sessionsSandbox(sessionsSheet(true), T346_USER);
        const Sessions = vm.runInNewContext(SESSIONS_GS_SRC + '\nSessions;', sb);
        const res = Sessions.logout('mob-token');
        assertEqual(res.ok, true, 'logout успешен');
        assertEqual(sb.__calls.deleted.length, 1, 'удалена ровно 1 строка (моб)');
        assertEqual(sb.__calls.statusUpdates.length, 0,
            'login_status НЕ сбрасывался — параллельная десктоп-сессия жива');
        assertEqual(sb.__calls.audits.length, 1, 'audit LOGOUT записан');
        assertTrue(sb.__calls.audits[0].details.indexOf('another session stays active') !== -1,
            'audit помечает параллельный режим');
    });

    test('VM: logout последней сессии — login_status сбрасывается (прежнее поведение)', () => {
        const sb = sessionsSandbox(sessionsSheet(false), T346_USER);
        const Sessions = vm.runInNewContext(SESSIONS_GS_SRC + '\nSessions;', sb);
        Sessions.logout('mob-token');
        assertEqual(sb.__calls.deleted.length, 1, 'строка сессии удалена');
        assertEqual(sb.__calls.statusUpdates.length, 1, 'login_status сброшен');
        assertEqual(sb.__calls.statusUpdates[0], 'вход не выполнен', 'значение статуса');
        assertEqual(sb.__calls.audits[0].details, 'User logged out',
            'обычный audit LOGOUT (без пометки parallel)');
    });

    test('VM: getCurrentUser возвращает userId = user.ID (не undefined)', () => {
        const sb = sessionsSandbox(sessionsSheet(true), T346_USER);
        const Sessions = vm.runInNewContext(SESSIONS_GS_SRC + '\nSessions;', sb);
        const res = Sessions.getCurrentUser('mob-token');
        assertEqual(res.userId, 7, 'userId = ID пользователя (заглавные)');
        assertEqual(res.email, 'u@x.ru', 'email');
        assertEqual(res.role, 'КИП ИОС', 'role');
    });

    test('VM: fail-safe — ошибка чтения листа → статус НЕ сбрасывается', () => {
        const sb = sessionsSandbox(sessionsSheet(false), T346_USER);
        sb.Utils.getSheet = function () { throw new Error('sheet read failed'); };
        const Sessions = vm.runInNewContext(SESSIONS_GS_SRC + '\nSessions;', sb);
        const res = Sessions.logout('mob-token');
        assertEqual(res.ok, true, 'logout не упал');
        assertEqual(sb.__calls.statusUpdates.length, 0,
            'fail-safe: при ошибке статус не сбрасывается (рассинхрон починит Auth.sendOTP)');
    });

    test('VM: легаси-строка с пустым user_id совпадает по email — статус не сбрасывается', () => {
        const sb = sessionsSandbox(sessionsSheet(false, true), T346_USER);
        const Sessions = vm.runInNewContext(SESSIONS_GS_SRC + '\nSessions;', sb);
        Sessions.logout('mob-token');
        assertEqual(sb.__calls.statusUpdates.length, 0,
            'легаси-сессия той же почты (user_id пуст) удерживает login_status');
    });
});

// ============================================================
// 5. SW — бамп инвалидации кэша
// ============================================================
describe('Task 346 — SW-бамп', () => {

    test("SW: CACHE_VERSION = 'kipia-test-v751'", () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v751'") !== -1,
            'v582 установлен');
        assertFalse(SW_SRC.indexOf('kipia-test-v752') !== -1,
            'v581 не остался (двойной бамп?)');
    });
});
