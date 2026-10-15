// tests/test-task337.js
// Task 337 — заявка пользователя: «я установил для роли "КИП ИОС
// дежурный" доступ "График работы — просмотр", а у него показываются
// кнопки "Сформировать" и "Вид" и также доступно редактирование и
// внесение данных, хотя этого не должно быть по условиям доступа».
//
// ПРИЧИНА: клиентский WorkSchedule._canEdit считался по ЖЁСТКОМУ
// списку _WRITE_ROLES (роль «КИП ИОС дежурный» была вписана «на
// всякий случай»), а СЕРВЕРНАЯ матрица KIP8_Access (право
// workschedule.edit) при этом права дежурному не даёт — клиент
// показывал редакторский UI, который сервер потом отклонял.
//
// ФИКС (клиент, kip8test):
//   1) НОВЫЙ _computeCanEdit(role): как у расходомеров (Task 296) —
//      приоритет серверной матрице: KipAuth._serverPerm
//      ('workschedule.edit'): true/false (found) → строго по
//      чекбоксу; null (матрица недоступна) → легаси-список
//      _WRITE_ROLES, из которого «КИП ИОС дежурный» ИСКЛЮЧЁН.
//   2) init()/_onRoleUpdate считают _canEdit через _computeCanEdit
//      и, кроме «Сформировать», прячут кнопку «Вид» (#wsViewBtn):
//      переключение видов — редакторский инструмент.
//   3) _initView/_onRoleUpdate: зритель — ВСЕГДА полный вид
//      (сохранённый kip8_ws_view_v1 не применяется); замок
//      «КИП ИОС дежурный» — только если роль при этом редактор
//      матрицы.
//   4) cycleView: программный guard — зритель не переключает вид.
//   Сервер шлюзит каждый запрос rmRequirePerm('workschedule.edit')
//   — как и прежде; клиентский фикс синхронизирует UX с матрицей.
//   SW: kipia-test-v743.
//
// Запуск: через tests/run-all.js (require './test-task337.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Срез исходника от начала объекта WorkSchedule: имя _computeCanEdit
// НЕ уникально в файле (у каб. журнала свой editRoles-вариант) — методы
// извлекаем только из области модуля «График работы»
const WS_START = INDEX_SRC.indexOf('var WorkSchedule = {');
const WS_CLIENT = INDEX_SRC.slice(WS_START, WS_START + 600000);
// Task 486: срез 500000→600000 — модуль вырос (silentRefresh
// ~8.7КБ), onCellClick уехал за прежнюю границу

function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// Мок KipAuth с серверной картой прав
function mockKipAuth(perms) {
    return { _serverPerm: function(id) {
        return Object.prototype.hasOwnProperty.call(perms, id)
            ? perms[id] : null;
    } };
}

// ============================================================
// 1. Право записи — из матрицы KIP8_Access
// ============================================================
describe('Task 337 — право записи workschedule.edit из матрицы', () => {

    test('SRC: _WRITE_ROLES НЕ содержит «КИП ИОС дежурный»', () => {
        const m = INDEX_SRC.match(/_WRITE_ROLES:\s*\[([^\]]*)\]/);
        assertTrue(!!m, 'список _WRITE_ROLES найден');
        assertFalse(m[1].indexOf('дежурный') !== -1,
            'легаси-список не содержит «КИП ИОС дежурный» (право решает матрица)');
        assertTrue(m[1].indexOf('КИП ИОС') !== -1,
            '«КИП ИОС» остался (легаси-запас)');
    });

    test('VM: _computeCanEdit — матрица найдена → строго по чекбоксу', () => {
        const host = new Function('KipAuth', 'return ({' +
            methodText(WS_CLIENT, '_computeCanEdit') + '\n' +
            methodText(WS_CLIENT, '_computeViewLevel') + '\n});');
        // Дежурный, матрица: workschedule.edit НЕТ (только просмотр)
        assertFalse(host(mockKipAuth({ 'workschedule.edit': false }))._computeCanEdit('КИП ИОС дежурный'),
            'зритель «КИП ИОС дежурный» (edit=false) — НЕ редактор');
        // Та же матрица, роль «КИП ИОС» — чекбокса тоже нет
        assertFalse(host(mockKipAuth({ 'workschedule.edit': false }))._computeCanEdit('КИП ИОС'),
            '«КИП ИОС» при снятом чекбоксе — не редактор');
        // Чекбокс стоит: роль не важна (зрительством список ролей не решает)
        assertTrue(host(mockKipAuth({ 'workschedule.edit': true }))._computeCanEdit('КИП ИОС дежурный'),
            'галочка workschedule.edit=✓ у роли «КИП ИОС дежурный» — редактор');
        // Админ при живой матрице — по чекбоксу (сервер админу даёт все права)
        assertTrue(host(mockKipAuth({ 'workschedule.edit': true }))._computeCanEdit('Админ'),
            'админ при чекбоксе ✓ — редактор');
    });

    test('VM: _computeCanEdit — матрица недоступна → легаси-список', () => {
        const host = new Function('KipAuth', 'return ({' +
            methodText(WS_CLIENT, '_computeCanEdit') + '\n' +
            methodText(WS_CLIENT, '_computeViewLevel') + '\n' +
            '_WRITE_ROLES: [\'КИП ИОС\', \'КИП ИОС pro\', \'Админ\'],' +
            '});');
        // null = getMyAccess не получен (старый сервер/сеть)
        const noMatrix = mockKipAuth({});
        assertFalse(host(noMatrix)._computeCanEdit('КИП ИОС дежурный'),
            'старый сервер: дежурный — НЕ редактор (исключён из легаси-списка)');
        assertTrue(host(noMatrix)._computeCanEdit('КИП ИОС'),
            'старый сервер: «КИП ИОС» — редактор (легаси)');
        assertTrue(host(noMatrix)._computeCanEdit('КИП ИОС pro'),
            'старый сервер: «КИП ИОС pro» — редактор (легаси)');
        assertTrue(host(noMatrix)._computeCanEdit('Админ'),
            'старый сервер: админ — редактор (легаси-запас)');
    });

    test('VM: _computeCanEdit — KipAuth не загружен → легаси-список', () => {
        const host = new Function('KipAuth', 'return ({' +
            methodText(WS_CLIENT, '_computeCanEdit') + '\n' +
            methodText(WS_CLIENT, '_computeViewLevel') + '\n' +
            '_WRITE_ROLES: [\'КИП ИОС\', \'КИП ИОС pro\', \'Админ\'],' +
            '});');
        assertTrue(host(undefined)._computeCanEdit('КИП ИОС'),
            'KipAuth не загружен → легаси: «КИП ИОС» — редактор');
        assertFalse(host(undefined)._computeCanEdit('КИП ИОС дежурный'),
            'KipAuth не загружен → легаси: дежурный — НЕ редактор');
        assertFalse(host({ noPerm: true })._computeCanEdit('КИП ИОС дежурный'),
            'KipAuth без _serverPerm → легаси: дежурный — НЕ редактор');
    });

    test('VM: _computeCanEdit — роль не задана', () => {
        // Task 340: живая матрица говорит правами ПОЛЬЗОВАТЕЛЯ (карта
        // получена по его токену) — роль не важна; пустая роль влияет
        // только на легаси-ветку (не редактор)
        const host = new Function('KipAuth', 'return ({' +
            methodText(WS_CLIENT, '_computeCanEdit') + '\n' +
            methodText(WS_CLIENT, '_computeViewLevel') + '\n' +
            '_WRITE_ROLES: [\'КИП ИОС\'],' +
            '});');
        assertTrue(host(mockKipAuth({ 'workschedule.edit': true }))._computeCanEdit(''),
            'матрица edit=✓ — редактор даже без роли (Task 340)');
        assertFalse(host(mockKipAuth({}))._computeCanEdit(''),
            'легаси: пустая роль — не редактор');
        assertFalse(host(mockKipAuth({}))._computeCanEdit(null),
            'легаси: null-роль — не редактор');
        assertFalse(host(mockKipAuth({}))._computeCanEdit(undefined),
            'легаси: undefined-роль — не редактор');
    });
});

// ============================================================
// 2. Кнопки «Сформировать» и «Вид» — только редакторам
// ============================================================
describe('Task 337 — кнопки «Сформировать»/«Вид» по праву записи', () => {

    test('SRC: init() прячет ОБЕ кнопки по _canEdit', () => {
        // вычисление права — УНИКАЛЬНАЯ строка init(); окно от неё до
        // конца init-функции (кнопки — в этом же окне, правки Task 337)
        const i = INDEX_SRC.indexOf('this._viewLevel = this._computeViewLevel(role);');
        assertTrue(i !== -1, 'init: уровень считается при старте (Task 340)');
        const init = INDEX_SRC.slice(i, INDEX_SRC.indexOf('this._attachFitResize()', i));
        assertTrue(init.indexOf("genBtn.hidden = !this._canEdit;") !== -1,
            'init: «Сформировать» скрыт зрителям');
        assertTrue(init.indexOf("viewBtn.hidden = (this._viewLevel === null);") !== -1,
            'init: «Вид» виден всем уровням (Task 340 — просмотр)');
    });

    test('SRC: _onRoleUpdate прячет ОБЕ кнопки + замок с учётом права', () => {
        const fn = methodText(WS_CLIENT, '_onRoleUpdate');
        assertTrue(fn.indexOf('this._computeViewLevel(role)') !== -1,
            '_onRoleUpdate: уровень через _computeViewLevel (Task 340)');
        assertTrue(fn.indexOf('this._canEdit = newCanEdit;') !== -1,
            '_onRoleUpdate: право актуализируется (идемпотентно)');
        assertTrue(fn.indexOf("genBtn.hidden = !newCanEdit;") !== -1,
            '_onRoleUpdate: «Сформировать» скрыт зрителям');
        assertTrue(fn.indexOf("roleViewBtn.hidden = (newLevel === null);") !== -1,
            '_onRoleUpdate: «Вид» скрыт только без прав (Task 340)');
        assertTrue(fn.indexOf("(role === 'КИП ИОС дежурный') && newCanEdit") !== -1,
            'замок дежурного — только если роль редактор матрицы');
        assertTrue(fn.indexOf('var changed =') !== -1,
            'идемпотентность: вид/сетка — только при реальном изменении');
    });

    test('VM: _onRoleUpdate — зритель-«дежурный» (edit=✗): кнопки спрятаны', () => {
        const els = {
            wsGenerateBtn: { hidden: false },
            wsViewBtn: { hidden: false }
        };
        const host = new Function('document', 'localStorage', 'return ({' +
            methodText(WS_CLIENT, '_onRoleUpdate') + '\n' +
            '_initialized: true,' +
            '_canEdit: true,' +
            '_viewLocked: true,' +  // как будто замок стоял (Task 332)
            '_view: \'shift\',' +
            '_viewLevel: \'edit\',' +
            '_computeViewLevel: function() { return \'view\'; },' +
            '_applyView: function(o) { this._applied = o; }' +
            '});')(mockDoc(els), { getItem: function() { return 'day'; } });
        host._onRoleUpdate('КИП ИОС дежурный');
        assertTrue(els.wsGenerateBtn.hidden === true, '«Сформировать» скрыта');
        assertTrue(els.wsViewBtn.hidden === false, '«Вид» видна (Task 340 — просмотр)');
        assertFalse(host._viewLocked === true, 'замок снят (роль — не редактор)');
        assertEqual(host._view, 'day', 'сохранённый вид зрителя применяется (Task 340)');
        assertEqual(host._applied.rerender, true, 'сетка перерисована');
    });

    test('VM: _onRoleUpdate — редактор «КИП ИОС» (edit=✓): кнопки видны', () => {
        const els = {
            wsGenerateBtn: { hidden: true },
            wsViewBtn: { hidden: true }
        };
        const host = new Function('document', 'localStorage', 'return ({' +
            methodText(WS_CLIENT, '_onRoleUpdate') + '\n' +
            '_initialized: true,' +
            '_canEdit: false,' +
            '_viewLevel: \'view\',' +
            '_viewLocked: false,' +
            '_view: \'full\',' +
            '_computeViewLevel: function() { return \'edit\'; },' +
            '_applyView: function(o) { this._applied = o; }' +
            '});')(mockDoc(els), { getItem: function() { return 'shift'; } });
        host._onRoleUpdate('КИП ИОС');
        assertFalse(els.wsGenerateBtn.hidden === true, '«Сформировать» видна');
        assertFalse(els.wsViewBtn.hidden === true, '«Вид» видна');
        assertEqual(host._view, 'shift', 'сохранённый вид применён');
    });

    test('SRC: cycleView — программный guard для зрителя', () => {
        const fn = methodText(WS_CLIENT, 'cycleView');
        assertTrue(fn.indexOf('if (this._viewLevel === null) return;') !== -1,
            'без прав вид не переключается (даже программно)');
    });

    test('VM: cycleView — прав нет: вид не меняется, тоста нет', () => {
        const toasts = [];
        const host = new Function('KipToast', 'localStorage', 'return ({' +
            methodText(WS_CLIENT, 'cycleView') + '\n' +
            '_viewLevel: null,' +
            '_viewLocked: false,' +
            '_view: \'full\',' +
            '_applyView: function() { this._appliedCount = (this._appliedCount || 0) + 1; }' +
            '});')({ show: function(m) { toasts.push(m); } },
            { setItem: function() {} });
        host.cycleView();
        assertEqual(host._view, 'full', 'вид остался полный');
        assertEqual(host._appliedCount, undefined, '_applyView не вызван');
        assertEqual(toasts.length, 0, 'тост не показан (прав нет — тихо)');
    });
});

// ============================================================
// 3. Вид табеля у зрителя — сменный (Task 338: шахматка дневных
// и «Итоги учёта» зрителю не видны)
// ============================================================
describe('Task 337/338 — зритель всегда на сменном виде', () => {

    test('VM: _initView — зритель-«дежурный» (view, сохранён day) → day', () => {
        const host = new Function('localStorage', 'return ({' +
            methodText(WS_CLIENT, '_initView') + '\n' +
            '_computeViewLevel: function() { return \'view\'; },' +
            '_applyView: function() { this._applied = true; }' +
            '});')({ getItem: function() { return 'day'; } });
        host._initView('КИП ИОС дежурный');
        assertEqual(host._view, 'day', 'зритель — сохранённый вид (Task 340)');
        assertFalse(host._viewLocked === true, 'замка нет (роль не редактор)');
        assertTrue(host._applied === true, '_applyView вызван');
    });

    test('VM: _initView — редактор «КИП ИОС дежурный» (edit=✓) → shift, замок', () => {
        const host = new Function('localStorage', 'return ({' +
            methodText(WS_CLIENT, '_initView') + '\n' +
            '_computeViewLevel: function() { return \'edit\'; },' +
            '_applyView: function() {}' +
            '});')({ getItem: function() { return 'full'; } });
        host._initView('КИП ИОС дежурный');
        assertEqual(host._view, 'shift', 'редактор-дежурный — сменный (замок Task 332)');
        assertTrue(host._viewLocked === true, 'замок стоит');
    });

    test('VM: _initView — обычный редактор: сохранённый вид применяется', () => {
        const host = new Function('localStorage', 'return ({' +
            methodText(WS_CLIENT, '_initView') + '\n' +
            '_computeViewLevel: function() { return \'edit\'; },' +
            '_applyView: function() {}' +
            '});')({ getItem: function() { return 'day'; } });
        host._initView('КИП ИОС');
        assertEqual(host._view, 'day', 'сохранённый дневной вид применён');
        assertFalse(host._viewLocked === true, 'замка нет');
    });

    test('VM: _initView — зритель «ИТР8 pro»: сохранённый day применяется', () => {
        const host = new Function('localStorage', 'return ({' +
            methodText(WS_CLIENT, '_initView') + '\n' +
            '_computeViewLevel: function() { return \'view\'; },' +
            '_applyView: function() {}' +
            '});')({ getItem: function() { return 'day'; } });
        host._initView('ИТР8 pro');
        assertEqual(host._view, 'day', 'зритель — сохранённый вид (не заперт)');
    });
});

// ============================================================
// 4. Остальная правка осталась гейченной _canEdit (не разболтано)
// ============================================================
describe('Task 337 — регресс-гейты правки', () => {

    test('SRC: клик по ячейке — зритель получает только окно мероприятий', () => {
        const fn = methodText(WS_CLIENT, 'onCellClick');
        assertTrue(fn.indexOf('if (!this._canEdit) {') !== -1 &&
                   fn.indexOf('_openEventsOnlyPopup') !== -1,
            'окно кодов — только редакторам (Task 319 жив)');
    });

    test('SRC: заголовок шапки — надпись (гейт снят, Task 386)', () => {
        assertTrue(INDEX_SRC.indexOf("this._canEdit ? ' ws-emp-head-add' : ''") === -1,
            'кнопки-заголовка нет; право решает кнопка «Работники» в баре');
    });

    test('SRC: серверный гейт работает по workschedule.edit (не тронут)', () => {
        // WorkSchedule.gs — серверная часть (в scripts/, эталон деплоя)
        const wsGs = path.join(ROOT, 'scripts', 'WorkSchedule.gs');
        if (fs.existsSync(wsGs)) {
            const gs = fs.readFileSync(wsGs, 'utf8');
            assertTrue(gs.indexOf("rmRequirePerm(token, 'workschedule.edit'") !== -1,
                'сервер шлюзит запись по workschedule.edit (Task 295)');
        }
    });
});

// ============================================================
// 5. Service Worker
// ============================================================
describe('Task 337 — Service Worker', () => {

    test('SW: кэш поднят до kipia-test-v743', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v743'") !== -1,
            'CACHE_VERSION = kipia-test-v743 (Task 337 — только фронтенд)');
        assertFalse(SW_SRC.indexOf('kipia-test-v744') !== -1,
            'лишний инкремент (v577) не сделан');
    });

    test('SW: в index.html нет захардкоженной версии кэша', () => {
        assertFalse(INDEX_SRC.indexOf('kipia-test-v57') !== -1,
            'клиент не знает номер кэша (версией управляет sw.js)');
    });
});
