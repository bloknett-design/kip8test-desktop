// tests/test-task353.js
// Task 353 — UI удаления пользователя в админ-панели.
//
// Серверная функция готова с Task 351 (роут adminDeleteUser, гейт
// admin.panel, Utils.gs Admin.deleteUser: замок, сессии по user_id
// ИЛИ email, OTP по email, строка users последней, гарды «нельзя
// себя»/«последнего админа», аудит ADMIN_DELETE_USER, ответ
// { ok, deleted, sessionsRemoved, otpsRemoved }). Задача 353 —
// только КЛИЕНТ: кнопка «Удалить» в карточке юзера + модалка
// подтверждения.
//
// Реализация:
//   • renderUsers: кнопка .admin-delete-btn в .admin-item-actions;
//     СВОЙ аккаунт — disabled (title-подсказка), чужой —
//     onclick → KipAdmin.openDeleteUser(id).
//   • Модалка #deleteUserOverlay (.delete-user-*): email цели —
//     textContent (XSS-безопасно), кнопки «Отмена»/«Удалить»,
//     слот ошибки #deleteUserError.
//   • confirmDeleteUser: _api('adminDeleteUser', {userId}) → тост с
//     числом снесённых сессий → закрытие + loadUsers/loadSessions;
//     ошибка — В МОДАЛКЕ (гарды сервера на русском), кнопка
//     возвращается в рабочее состояние.
//   • Фильтр журнала: опция ADMIN_DELETE_USER.
//
// SW: kipia-test-v742.
//
// Запуск: через tests/run-all.js (require './test-task353.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// ============================================================
// Извлечение KipAdmin из index.html (по образцу test-task346.js)
// ============================================================
function extractObject(name) {
    const START = INDEX_SRC.indexOf('const ' + name + ' = {');
    if (START === -1) return '';
    const END = INDEX_SRC.indexOf('\n    };', START);
    return INDEX_SRC.slice(START, END + 6) + '\n' + name + ';';
}

const KIPADMIN_SRC = extractObject('KipAdmin');

// ============================================================
// Мок DOM: элементы по id (модалка + списки админки)
// ============================================================
function makeEl() {
    return {
        textContent: '',
        innerHTML: '',
        value: '',
        disabled: false,
        _classes: {},
        classList: {
            add: function (c) { this._owner._classes[c] = true; },
            remove: function (c) { delete this._owner._classes[c]; },
            contains: function (c) { return !!this._owner._classes[c]; },
            _owner: null
        }
    };
}

function wire(owner) {
    owner.classList._owner = owner;
    return owner;
}

function adminSandbox(elements, cachedEmail) {
    const toasts = [];
    const sandbox = {
        console: { log: function () {}, warn: function () {}, error: function () {} },
        showToast: function (msg) { toasts.push(String(msg)); },
        setTimeout: function () { return 0; },
        setInterval: function () { return 0; },
        clearInterval: function () {},
        // renderUsers: isSelf смотрит в KipAuth._cachedEmail
        // (typeof-гард не нужен: объект всегда есть в песочнице)
        KipAuth: { _cachedEmail: cachedEmail || null },
        document: {
            getElementById: function (id) {
                return elements[id] !== undefined ? elements[id] : null;
            }
        }
    };
    sandbox.__toasts = toasts;
    return sandbox;
}

// ============================================================
// 1. SRC-гарды — разметка/вёрстка
// ============================================================
describe('Task 353 — SRC: разметка и стили', () => {

    test('SRC: модалка #deleteUserOverlay есть в разметке', () => {
        assertTrue(INDEX_SRC.indexOf('id="deleteUserOverlay"') !== -1,
            'оверлей модалки в HTML');
        assertTrue(INDEX_SRC.indexOf('class="delete-user-modal"') !== -1,
            'каркас модалки в HTML');
    });

    test('SRC: элементы модалки — email/кнопки/ошибка', () => {
        ['deleteUserEmail', 'deleteUserBtn', 'deleteUserError'].forEach(function (id) {
            assertTrue(INDEX_SRC.indexOf('id="' + id + '"') !== -1,
                'элемент #' + id);
        });
        assertTrue(INDEX_SRC.indexOf('class="delete-user-cancel"') !== -1,
            'кнопка «Отмена»');
        assertTrue(INDEX_SRC.indexOf('class="delete-user-confirm"') !== -1,
            'кнопка «Удалить»');
    });

    test('SRC: кнопки модалки привязаны к KipAdmin', () => {
        assertTrue(INDEX_SRC.indexOf('onclick="KipAdmin.confirmDeleteUser()"') !== -1,
            'confirmDeleteUser на кнопке');
        const cancels = INDEX_SRC.split('KipAdmin.closeDeleteUser()').length - 1;
        assertTrue(cancels >= 3,
            'closeDeleteUser: фон + крестик + Отмена (факт: ' + cancels + ')');
    });

    test('SRC: CSS-классы delete-user-*/admin-delete-btn определены', () => {
        ['.delete-user-overlay', '.delete-user-modal', '.delete-user-title',
         '.delete-user-email', '.delete-user-warn', '.delete-user-note',
         '.delete-user-btns', '.delete-user-cancel', '.delete-user-confirm',
         '.delete-user-error'].forEach(function (cls) {
            assertTrue(INDEX_SRC.indexOf(cls + ' {') !== -1,
                'CSS ' + cls);
        });
        assertTrue(INDEX_SRC.indexOf('.admin-delete-btn {') !== -1,
            'CSS .admin-delete-btn');
        assertTrue(INDEX_SRC.indexOf('.admin-delete-btn:disabled {') !== -1,
            'CSS disabled-состояние кнопки удаления');
        // Тёмная + светлая темы
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .delete-user-modal') !== -1,
            'светлая тема модалки');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .admin-delete-btn') !== -1,
            'светлая тема кнопки');
    });

    test('SRC: опция ADMIN_DELETE_USER в фильтре журнала', () => {
        assertTrue(INDEX_SRC.indexOf('value="ADMIN_DELETE_USER"') !== -1,
            '<option> для удаления пользователя');
    });
});

// ============================================================
// 2. SRC-гарды — логика KipAdmin
// ============================================================
describe('Task 353 — SRC: логика KipAdmin', () => {

    test('SRC: методы удаления определены в KipAdmin', () => {
        ['openDeleteUser', 'closeDeleteUser', 'confirmDeleteUser'].forEach(function (m) {
            assertTrue(KIPADMIN_SRC.indexOf(m + ': function') !== -1,
                m + ' в KipAdmin');
        });
        assertTrue(KIPADMIN_SRC.indexOf('_deleteTarget: null') !== -1,
            'поле _deleteTarget');
    });

    test('SRC: клиент вызывает adminDeleteUser с userId', () => {
        const i = KIPADMIN_SRC.indexOf("api('adminDeleteUser'");
        assertTrue(i !== -1, 'вызов _api adminDeleteUser');
        const around = KIPADMIN_SRC.slice(i, i + 120);
        assertTrue(around.indexOf('userId') !== -1, 'payload userId');
    });

    test('SRC: email цели — textContent, НЕ innerHTML (XSS)', () => {
        const i = KIPADMIN_SRC.indexOf('openDeleteUser: function');
        const body = KIPADMIN_SRC.slice(i, KIPADMIN_SRC.indexOf('closeDeleteUser: function'));
        assertTrue(body.indexOf('emailEl.textContent') !== -1,
            'textContent для email');
        assertTrue(body.indexOf('innerHTML') === -1,
            'innerHTML в openDeleteUser не используется');
    });

    test('SRC: renderUsers — кнопка удаления в действиях карточки', () => {
        const i = KIPADMIN_SRC.indexOf('admin-item-actions');
        assertTrue(i !== -1, 'блок действий найден');
        const around = KIPADMIN_SRC.slice(i - 700, i + 200);
        assertTrue(around.indexOf('admin-delete-btn') !== -1,
            'класс кнопки удаления');
        assertTrue(around.indexOf('openDeleteUser(') !== -1,
            'onclick → openDeleteUser');
    });

    test('SRC: renderUsers — гард «свой аккаунт» по KipAuth._cachedEmail', () => {
        const i = KIPADMIN_SRC.indexOf('const isSelf');
        assertTrue(i !== -1, 'вычисление isSelf');
        const around = KIPADMIN_SRC.slice(i, i + 300);
        assertTrue(around.indexOf('KipAuth._cachedEmail') !== -1,
            'сверка с текущим email');
        assertTrue(around.indexOf('disabled') !== -1,
            'disabled для своего аккаунта');
    });

    test('SRC: ошибка удаления показывается в модалке', () => {
        const i = KIPADMIN_SRC.indexOf('confirmDeleteUser: function');
        const body = KIPADMIN_SRC.slice(i, KIPADMIN_SRC.indexOf('_formatDate: function', i));
        const catchAt = body.indexOf('.catch(function(err)');
        assertTrue(catchAt !== -1, 'catch-ветка есть');
        const catchBody = body.slice(catchAt, catchAt + 500);
        assertTrue(catchBody.indexOf('errEl.textContent') !== -1,
            'текст ошибки в #deleteUserError');
        assertTrue(catchBody.indexOf('btn.disabled = false') !== -1,
            'кнопка возвращается в рабочее состояние');
    });

    test('SRC: после успеха — обновление users и sessions', () => {
        const i = KIPADMIN_SRC.indexOf('confirmDeleteUser: function');
        const body = KIPADMIN_SRC.slice(i, KIPADMIN_SRC.indexOf('_formatDate: function', i));
        const thenAt = body.indexOf('.then(function(res)');
        const thenBody = body.slice(thenAt, body.indexOf('.catch('));
        assertTrue(thenBody.indexOf('self.loadUsers()') !== -1,
            'loadUsers после удаления');
        assertTrue(thenBody.indexOf('self.loadSessions()') !== -1,
            'loadSessions после удаления');
    });

    test('SRC: SW-версия kipia-test-v742 (бамп Task 353)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v742'") !== -1,
            'sw.js на v583');
    });

    test('SRC: guard — нет двойного бампа (v584 не существует)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v743') === -1,
            'v584 в sw.js не должно быть');
        assertTrue(INDEX_SRC.indexOf('kipia-test-v743') === -1,
            'v584 в index.html не должно быть');
    });
});

// ============================================================
// 3. VM — модалка: открытие/закрытие/устаревший список
// ============================================================
describe('Task 353 — VM: openDeleteUser / closeDeleteUser', () => {

    test('VM: открытие — email, активный оверлей, цель', () => {
        const emailEl = wire(makeEl());
        const errEl = wire(makeEl());
        const btn = wire(makeEl());
        const overlay = wire(makeEl());
        const sb = adminSandbox({
            deleteUserEmail: emailEl, deleteUserError: errEl,
            deleteUserBtn: btn, deleteUserOverlay: overlay
        });
        const KipAdmin = vm.runInNewContext(KIPADMIN_SRC, sb);
        KipAdmin._users = [
            { id: 3, email: 'victim@x.ru', role: 'Общий доступ', login_status: 'вход не выполнен' },
            { id: 7, email: 'a@x.ru', role: 'Админ', login_status: 'вход выполнен' }
        ];
        KipAdmin.openDeleteUser(3);
        assertEqual(emailEl.textContent, 'victim@x.ru', 'email цели через textContent');
        assertTrue(overlay._classes.active, 'оверлей .active');
        assertEqual(KipAdmin._deleteTarget.userId, 3, 'цель — userId 3');
        assertEqual(KipAdmin._deleteTarget.email, 'victim@x.ru', 'цель — email');
        assertFalse(btn.disabled, 'кнопка активна при открытии');
    });

    test('VM: открытие сбрасывает прошлое состояние кнопки/ошибки', () => {
        const emailEl = wire(makeEl());
        const errEl = wire(makeEl());
        const btn = wire(makeEl());
        const overlay = wire(makeEl());
        const sb = adminSandbox({
            deleteUserEmail: emailEl, deleteUserError: errEl,
            deleteUserBtn: btn, deleteUserOverlay: overlay
        });
        const KipAdmin = vm.runInNewContext(KIPADMIN_SRC, sb);
        // Имитируем прошлое состояние: ошибка + disabled + «Удаление…»
        errEl.textContent = 'Нельзя удалить последнего админа';
        btn.disabled = true;
        btn.textContent = 'Удаление…';
        KipAdmin._users = [{ id: 5, email: 'b@x.ru', role: 'КИП ИОС' }];
        KipAdmin.openDeleteUser(5);
        assertEqual(errEl.textContent, '', 'прошлая ошибка стёрта');
        assertFalse(btn.disabled, 'кнопка снова активна');
        assertEqual(btn.textContent, 'Удалить', 'надпись восстановлена');
    });

    test('VM: устаревший список (юзера нет) — модалка не открывается', () => {
        const overlay = wire(makeEl());
        const sb = adminSandbox({ deleteUserOverlay: overlay });
        const KipAdmin = vm.runInNewContext(KIPADMIN_SRC, sb);
        KipAdmin._users = [{ id: 1, email: 'a@x.ru', role: 'Админ' }];
        KipAdmin.openDeleteUser(999); // уже удалён с другого устройства
        assertFalse(overlay._classes.active, 'оверлей НЕ активирован');
        assertEqual(KipAdmin._deleteTarget, null, 'цель не выставлена');
    });

    test('VM: closeDeleteUser снимает active и чистит цель', () => {
        const emailEl = wire(makeEl());
        const overlay = wire(makeEl());
        const sb = adminSandbox({
            deleteUserEmail: emailEl, deleteUserOverlay: overlay
        });
        const KipAdmin = vm.runInNewContext(KIPADMIN_SRC, sb);
        KipAdmin._users = [{ id: 4, email: 'c@x.ru', role: 'ИТР8' }];
        KipAdmin.openDeleteUser(4);
        assertTrue(overlay._classes.active, 'был активен');
        KipAdmin.closeDeleteUser();
        assertFalse(overlay._classes.active, 'закрыт');
        assertEqual(KipAdmin._deleteTarget, null, 'цель сброшена');
    });
});

// ============================================================
// 4. VM — confirmDeleteUser: успех / ошибка / без цели
// ============================================================
describe('Task 353 — VM: confirmDeleteUser', () => {

    function modalSandbox(apiImpl) {
        const emailEl = wire(makeEl());
        const errEl = wire(makeEl());
        const btn = wire(makeEl());
        const overlay = wire(makeEl());
        const sb = adminSandbox({
            deleteUserEmail: emailEl, deleteUserError: errEl,
            deleteUserBtn: btn, deleteUserOverlay: overlay
        });
        const KipAdmin = vm.runInNewContext(KIPADMIN_SRC, sb);
        const calls = [];
        KipAdmin._api = apiImpl;
        KipAdmin.loadUsers = function () { calls.push('loadUsers'); };
        KipAdmin.loadSessions = function () { calls.push('loadSessions'); };
        return { KipAdmin: KipAdmin, emailEl: emailEl, errEl: errEl,
                 btn: btn, overlay: overlay, toasts: sb.__toasts, calls: calls };
    }

    test('VM: успех — тост с сессиями, закрытие, перезагрузка списков', () => {
        let sent = null;
        const m = modalSandbox(function (action, payload) {
            sent = { action: action, payload: payload };
            return Promise.resolve({ ok: true, deleted: true,
                                     sessionsRemoved: 2, otpsRemoved: 1 });
        });
        m.KipAdmin._users = [{ id: 9, email: 'd@x.ru', role: 'Общий доступ' }];
        m.KipAdmin.openDeleteUser(9);
        m.KipAdmin.confirmDeleteUser();
        // Promise-callbacks отложены — прогоняем микротаски
        return Promise.resolve().then(function () {}).then(function () {
            assertEqual(sent.action, 'adminDeleteUser', 'вызван правильный роут');
            assertEqual(sent.payload.userId, 9, 'userId передан');
            assertEqual(sent.payload.token, undefined, 'токен добавит реальный _api (здесь замокан)');
            assertTrue(m.toasts.length === 1, 'ровно один тост');
            assertTrue(m.toasts[0].indexOf('d@x.ru') !== -1, 'email в тосте');
            assertTrue(m.toasts[0].indexOf('2') !== -1, 'число сессий в тосте');
            assertFalse(m.overlay._classes.active, 'модалка закрыта');
            assertEqual(m.KipAdmin._deleteTarget, null, 'цель сброшена');
            assertTrue(m.calls.indexOf('loadUsers') !== -1, 'loadUsers вызван');
            assertTrue(m.calls.indexOf('loadSessions') !== -1, 'loadSessions вызван');
            assertEqual(m.errEl.textContent, '', 'ошибки нет');
        });
    });

    test('VM: ошибка сервера — текст в модалке, кнопка жива, списки НЕ дёргаются', () => {
        const m = modalSandbox(function () {
            return Promise.reject(new Error('Нельзя удалить последнего админа'));
        });
        m.KipAdmin._users = [{ id: 1, email: 'last@x.ru', role: 'Админ' }];
        m.KipAdmin.openDeleteUser(1);
        m.KipAdmin.confirmDeleteUser();
        return Promise.resolve().then(function () {}).then(function () {
            assertEqual(m.errEl.textContent, 'Нельзя удалить последнего админа',
                'ошибка в #deleteUserError');
            assertTrue(m.overlay._classes.active, 'модалка осталась открыта');
            assertFalse(m.btn.disabled, 'кнопка снова активна');
            assertEqual(m.btn.textContent, 'Удалить', 'надпись восстановлена');
            assertEqual(m.calls.length, 0, 'loadUsers/loadSessions не вызывались');
            assertEqual(m.toasts.length, 0, 'тоста нет (ошибка — в модалке)');
            assertEqual(m.KipAdmin._deleteTarget.email, 'last@x.ru',
                'цель сохранена для повторной попытки');
        });
    });

    test('VM: ответ БЕЗ sessionsRemoved (старый сервер) — тост без деталей', () => {
        const m = modalSandbox(function () {
            return Promise.resolve({ ok: true });
        });
        m.KipAdmin._users = [{ id: 2, email: 'e@x.ru', role: 'КИП8' }];
        m.KipAdmin.openDeleteUser(2);
        m.KipAdmin.confirmDeleteUser();
        return Promise.resolve().then(function () {}).then(function () {
            assertTrue(m.toasts.length === 1, 'тост есть');
            assertTrue(m.toasts[0].indexOf('сессий') === -1,
                'без «сессий закрыто» при отсутствии поля');
            assertFalse(m.overlay._classes.active, 'модалка закрыта');
        });
    });

    test('VM: confirm без открытой модалки — no-op', () => {
        let apiCalled = false;
        const m = modalSandbox(function () { apiCalled = true; return Promise.resolve({}); });
        m.KipAdmin._deleteTarget = null; // модалку не открывали
        m.KipAdmin.confirmDeleteUser();
        return Promise.resolve().then(function () {}).then(function () {
            assertFalse(apiCalled, 'сервер не дёргался');
        });
    });

    test('VM: кнопка блокируется на время запроса (защита от даблклика)', () => {
        let resolveApi;
        const m = modalSandbox(function () {
            return new Promise(function (res) { resolveApi = res; });
        });
        m.KipAdmin._users = [{ id: 8, email: 'f@x.ru', role: 'ИТР ИОС' }];
        m.KipAdmin.openDeleteUser(8);
        m.KipAdmin.confirmDeleteUser();
        // до разрешения промиса кнопка заблокирована
        assertTrue(m.btn.disabled, 'кнопка disabled во время запроса');
        assertEqual(m.btn.textContent, 'Удаление…', 'надпись «Удаление…»');
        resolveApi({ ok: true, deleted: true, sessionsRemoved: 0 });
        return Promise.resolve().then(function () {}).then(function () {
            assertFalse(m.overlay._classes.active, 'модалка закрыта после успеха');
            // Контракт сброса кнопки: при СЛЕДУЮЩЕМ открытии модалки
            // (ошибка могла остаться от прошлой попытки) openDeleteUser
            // восстанавливает enabled + «Удалить» — пользователь не
            // увидит зависшую «Удаление…».
            m.KipAdmin.openDeleteUser(8);
            assertFalse(m.btn.disabled, 'при повторном открытии кнопка сброшена');
            assertEqual(m.btn.textContent, 'Удалить', 'надпись восстановлена');
        });
    });
});

// ============================================================
// 5. VM — renderUsers: кнопка в карточках, свой аккаунт disabled
// ============================================================
describe('Task 353 — VM: renderUsers', () => {

    function renderUsersWith(cachedEmail, users) {
        const listEl = wire(makeEl());
        const searchEl = wire(makeEl()); // value: '' — без поиска
        const sb = adminSandbox({
            adminUsersList: listEl, adminUserSearch: searchEl
        }, cachedEmail);
        const KipAdmin = vm.runInNewContext(KIPADMIN_SRC, sb);
        KipAdmin._users = users;
        KipAdmin.renderUsers();
        return listEl.innerHTML;
    }

    test('VM: кнопка «Удалить» есть в каждой карточке', () => {
        const html = renderUsersWith('admin@x.ru', [
            { id: 1, email: 'admin@x.ru', role: 'Админ', login_status: 'вход выполнен', last_login: null },
            { id: 2, email: 'u2@x.ru', role: 'КИП ИОС', login_status: 'вход не выполнен', last_login: null }
        ]);
        assertEqual(html.split('admin-delete-btn').length - 1, 2,
            'две кнопки удаления (по числу юзеров)');
    });

    test('VM: свой аккаунт — disabled без onclick', () => {
        const html = renderUsersWith('admin@x.ru', [
            { id: 1, email: 'admin@x.ru', role: 'Админ', login_status: 'вход выполнен', last_login: null },
            { id: 2, email: 'u2@x.ru', role: 'КИП ИОС', login_status: 'вход не выполнен', last_login: null }
        ]);
        // Свою карточку вырезаем по email (сортировка: Админ первым)
        const selfChunk = html.slice(html.indexOf('admin@x.ru'), html.indexOf('u2@x.ru'));
        assertTrue(selfChunk.indexOf('disabled') !== -1,
            'своя карточка: кнопка disabled');
        assertTrue(selfChunk.indexOf('title="Нельзя удалить собственный аккаунт"') !== -1,
            'подсказка в title');
        assertTrue(selfChunk.indexOf('openDeleteUser') === -1,
            'в своей карточке onclick НЕ вешается');
    });

    test('VM: чужой аккаунт — onclick openDeleteUser(id)', () => {
        const html = renderUsersWith('admin@x.ru', [
            { id: 5, email: 'other@x.ru', role: 'КИП8', login_status: 'вход не выполнен', last_login: null }
        ]);
        assertTrue(html.indexOf('KipAdmin.openDeleteUser(5)') !== -1,
            'onclick с правильным id');
        assertTrue(html.indexOf('disabled') === -1, 'кнопка активна');
    });

    test('VM: сравнение email регистронезависимо', () => {
        const html = renderUsersWith('Admin@X.RU', [
            { id: 1, email: 'admin@x.ru', role: 'Админ', login_status: 'вход не выполнен', last_login: null }
        ]);
        assertTrue(html.indexOf('disabled') !== -1,
            'разный регистр — всё равно своя карточка');
    });

    test('VM: _cachedEmail неизвестен — кнопки активны (гард на сервере)', () => {
        const html = renderUsersWith(null, [
            { id: 1, email: 'admin@x.ru', role: 'Админ', login_status: 'вход не выполнен', last_login: null }
        ]);
        assertTrue(html.indexOf('openDeleteUser(1)') !== -1,
            'без кэша email кнопка работает — сервер всё равно запретит');
    });
});
