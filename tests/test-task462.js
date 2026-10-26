// tests/test-task462.js
// Task 462 — заявка пользователя: «Продолжим работу над новым разделом
// "Плановые мероприятия". Во первых необходимо реализовать доступ
// пользователей к данному разделу, в файле KIP8_Access, в таблице
// matrix нужно добавить новый столбец для определения доступа к
// данному разделу. После реализации и проверки определения доступа,
// дам команду для переноса изменений в боевой kip8.»
//
// РЕШЕНИЕ:
//   матрица (сервер): НОВАЯ колонка plan.events в листе matrix
//   таблицы KIP8_Access — добавляется одноразовым идемпотентным
//   скриптом scripts/RoleMatrixTask462Init.gs (галочки по умолчанию
//   = текущий доступ Task 460: kipios.view || kipios.restricted ||
//   flowmeter.view, Админ — всегда; серверу ничего не менять —
//   RoleMatrix.gs читает колонки динамически);
//   клиент: СВОЯ группа _PLAN_EVENTS_PAGES (раньше plan-events
//   следовал за _KIP_IOS_PAGES / docs-ios), уровни легаси-карты с
//   PLAN_EVENTS (ИТР ТОКЕМ / КИП8 pro / КИП ИОС / КИП ИОС+расходомеры),
//   _applyServerAccess: _drop(_PLAN_EVENTS_PAGES) + perm('plan.events');
//   ПЕРЕХОДНЫЙ фоллбек: матрица получена (found), но колонки plan.events
//   в ней ещё нет (скрипт не запущен) → прежнее поведение Task 460
//   (за КИП ИОС / расходомерами), чтобы никто не потерял доступ;
//   found=false → fail-closed (как у всех матричных групп).
//   SW: kipia-test-v760.
//
// Запуск: через tests/run-all.js (require './test-task462.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const INIT_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'RoleMatrixTask462Init.gs'), 'utf8');

// ============================================================
// Извлечение метода _applyServerAccess из KipAuth (для VM-тестов)
// ============================================================
const KA_START = INDEX_SRC.indexOf('const KipAuth = {');
const KA_SRC = INDEX_SRC.slice(KA_START, KA_START + 250000);
const METHOD_SIG = '_applyServerAccess: function';
const M_START = KA_SRC.indexOf(METHOD_SIG);
const M_END = KA_SRC.indexOf('\n        /**', M_START); // конец метода (след. док-комментарий)
if (KA_START === -1 || M_START === -1 || M_END === -1) {
    throw new Error('test-task462: не найден метод _applyServerAccess в index.html');
}
const METHOD_SRC = KA_SRC.slice(M_START, M_END);          // «..., },» — с хвостовой запятой

// Мок-хост KipAuth: реальный метод + контролируемое состояние.
// base — легаси-список страниц роли (снимок _accessBase).
function makeHost(role, base, serverAccess) {
    return new Function(
        'return ({' + METHOD_SRC +
        '_cachedRole: ' + JSON.stringify(role) + ',' +
        '_accessBase: {"' + role + '": ' + JSON.stringify(base) + '},' +
        'ROLE_ACCESS: {"' + role + '": ' + JSON.stringify(base.slice()) + '},' +
        '_serverAccess: ' + (serverAccess === null ? 'null' : JSON.stringify(serverAccess)) + ',' +
        "_CALC_PAGES: ['calc']," +
        "_LIBRARY_PAGES: ['docs']," +
        "_KIP_IOS_PAGES: ['kip-ios', 'docs-ios']," +
        '_SECRET_PAGES: [],' +
        "_WHATS_NEW_PAGES: ['whats-new']," +
        '_CHARTS_PAGES: [],' +
        "_FLOWMETER_PAGES: ['flowmeter-data']," +
        '_WORK_SCHEDULE_PAGES: [],' +
        "_PLAN_EVENTS_PAGES: ['plan-events']" +
        '});'
    )();
}

// Легаси-список роли «КИП ИОС» (LVL_KIP_IOS: BASE+CALC+LIB+KIP_IOS+
// SECRET+WHATS_NEW+PLAN_EVENTS — план-эвентс был в базовой карте)
const KIP_IOS_BASE = ['dashboard', 'calc', 'docs', 'kip-ios', 'docs-ios',
                      'whats-new', 'plan-events'];
// Легаси-список «КИП8 pro» (LVL_KIP8_PRO: без КИП ИОС, docs-ios +
// PLAN_EVENTS после Task 462)
const KIP8_PRO_BASE = ['dashboard', 'calc', 'docs', 'flowmeter-data',
                       'docs-ios', 'plan-events'];

function hasPage(host, role, page) {
    return host.ROLE_ACCESS[role].indexOf(page) !== -1;
}

// ============================================================
// 1. SRC — группа доступа plan-events
// ============================================================
describe('Task 462 — SRC: группа _PLAN_EVENTS_PAGES', () => {

    test('константа _PLAN_EVENTS_PAGES = [plan-events] (рядом с _KIP_IOS_PAGES)', () => {
        const idx = INDEX_SRC.indexOf("_PLAN_EVENTS_PAGES: ['plan-events'],");
        assertTrue(idx !== -1, 'определение группы');
        const kIdx = INDEX_SRC.indexOf('_KIP_IOS_PAGES:');
        assertTrue(idx > kIdx, 'группа определена ПОСЛЕ _KIP_IOS_PAGES');
    });

    test('_KIP_IOS_PAGES больше НЕ содержит plan-events', () => {
        const idx = INDEX_SRC.indexOf('_KIP_IOS_PAGES:');
        const end = INDEX_SRC.indexOf('_PLAN_EVENTS_PAGES:');
        const block = INDEX_SRC.slice(idx, end);
        assertTrue(block.indexOf("'plan-events'") === -1,
            'plan-events не в массиве _KIP_IOS_PAGES');
    });

    test('комментарий группы ссылается на право и init-скрипт', () => {
        const idx = INDEX_SRC.indexOf('_PLAN_EVENTS_PAGES:');
        const around = INDEX_SRC.slice(Math.max(0, idx - 700), idx + 60);
        assertTrue(around.indexOf('plan.events') !== -1, 'упоминание права plan.events');
        assertTrue(around.indexOf('RoleMatrixTask462Init.gs') !== -1,
            'ссылка на init-скрипт');
    });

    test('init(): константа PLAN_EVENTS', () => {
        assertTrue(INDEX_SRC.indexOf("const PLAN_EVENTS = this._PLAN_EVENTS_PAGES; // Task 462") !== -1,
            'const PLAN_EVENTS рядом с FLOWMETER/CHARTS/WORK_SCHEDULE');
    });

    test('уровни легаси-карты включают PLAN_EVENTS (4 уровня)', () => {
        assertTrue(INDEX_SRC.indexOf("WHATS_NEW, PLAN_EVENTS);") !== -1,
            'LVL_ITR_TOKEM + PLAN_EVENTS');
        assertTrue(INDEX_SRC.indexOf("FLOWMETER, PLAN_EVENTS, ['docs-ios']);") !== -1,
            'LVL_KIP8_PRO: PLAN_EVENTS + docs-ios');
        // LVL_KIP_IOS и LVL_KIP_IOS_WITH_FLOW — одна и та же хвостовая
        // форма «SECRET, WHATS_NEW, PLAN_EVENTS);» встречается дважды
        const n = INDEX_SRC.split("SECRET, WHATS_NEW, PLAN_EVENTS);").length - 1;
        assertEqual(n, 2, 'LVL_KIP_IOS + LVL_KIP_IOS_WITH_FLOW (2 вхождения)');
    });
});

// ============================================================
// 2. SRC — _applyServerAccess
// ============================================================
describe('Task 462 — SRC: _applyServerAccess', () => {

    test('дроп группы перед пересборкой', () => {
        assertTrue(INDEX_SRC.indexOf("_drop(this._PLAN_EVENTS_PAGES); // Task 462") !== -1,
            '_drop(_PLAN_EVENTS_PAGES) в списке дропов');
    });

    test('flowmeter-ветка добавляет ТОЛЬКО docs-ios', () => {
        assertTrue(INDEX_SRC.indexOf("if (!kipios) _add(['docs-ios']);") !== -1,
            'план-эвентс больше не следует за хабом');
        assertTrue(INDEX_SRC.indexOf("['docs-ios', 'plan-events']") === -1,
            'старой пары docs-ios+plan-events нет');
    });

    test('детектор колонки plan.events в матрице (hasOwnProperty)', () => {
        assertTrue(INDEX_SRC.indexOf(
            "Object.prototype.hasOwnProperty.call(acc.permissions, 'plan.events')") !== -1,
            'различает «колонки нет» и «галка снята»');
    });

    test('доступ строго по праву при наличии колонки', () => {
        assertTrue(INDEX_SRC.indexOf("if (perm('plan.events')) _add(this._PLAN_EVENTS_PAGES);") !== -1,
            '_add по perm(plan.events)');
    });

    test('переходный фоллбек (колонки нет) — прежнее поведение Task 460', () => {
        assertTrue(INDEX_SRC.indexOf(
            "if (kipios || perm('flowmeter.view')) _add(this._PLAN_EVENTS_PAGES);") !== -1,
            'за КИП ИОС / расходомерами до запуска init-скрипта');
    });

    test('документация прав в шапке метода дополнена plan.events', () => {
        const idx = INDEX_SRC.indexOf('_applyServerAccess: function');
        const head = INDEX_SRC.slice(Math.max(0, idx - 1600), idx);
        assertTrue(head.indexOf("plan.events            → «Плановые мероприятия»") !== -1,
            'строка соответствия право → группа');
    });
});

// ============================================================
// 3. VM — _applyServerAccess (реальный метод + мок-состояние)
// ============================================================
describe('Task 462 — VM: доступ по праву plan.events', () => {

    test('колонка есть, галка ✓ + kipios.view ✓ → раздел виден', () => {
        const host = makeHost('КИП ИОС', KIP_IOS_BASE,
            { found: true, permissions: { 'kipios.view': true, 'plan.events': true } });
        host._applyServerAccess();
        assertTrue(hasPage(host, 'КИП ИОС', 'plan-events'),
            'plan-events в списке роли');
    });

    test('колонка есть, галка ✗ (при kipios.view ✓) → раздел СКРЫТ', () => {
        const host = makeHost('КИП ИОС', KIP_IOS_BASE,
            { found: true, permissions: { 'kipios.view': true, 'plan.events': false } });
        host._applyServerAccess();
        assertFalse(hasPage(host, 'КИП ИОС', 'plan-events'),
            'снятие галочки убирает раздел — главное поведение Task 462');
        // регрессия пересборки: остальное на месте
        assertTrue(hasPage(host, 'КИП ИОС', 'kip-ios'), 'КИП ИОС остался');
        assertTrue(hasPage(host, 'КИП ИОС', 'docs-ios'), 'хаб остался');
        assertFalse(hasPage(host, 'КИП ИОС', 'calc'), 'калькуляторы сняты (нет права)');
        assertFalse(hasPage(host, 'КИП ИОС', 'whats-new'), 'что нового снято (нет права)');
        assertTrue(hasPage(host, 'КИП ИОС', 'dashboard'), 'главная всегда с ролью');
    });

    test('колонка есть, галка ✓, КИП ИОС ✗ → право самодостаточно', () => {
        const host = makeHost('КИП8', ['dashboard', 'calc', 'docs', 'plan-events'],
            { found: true, permissions: { 'calc.view': true, 'plan.events': true } });
        host._applyServerAccess();
        assertTrue(hasPage(host, 'КИП8', 'plan-events'),
            'раздел есть и без доступа к КИП ИОС');
        assertFalse(hasPage(host, 'КИП8', 'docs-ios'), 'хаба нет (нет расходомеров)');
    });

    test('ПЕРЕХОДНЫЙ: колонки нет, kipios.view ✓ → раздел виден (Task 460)', () => {
        const host = makeHost('КИП ИОС', KIP_IOS_BASE,
            { found: true, permissions: { 'kipios.view': true } });
        host._applyServerAccess();
        assertTrue(hasPage(host, 'КИП ИОС', 'plan-events'),
            'до запуска init-скрипта никто не теряет раздел');
    });

    test('ПЕРЕХОДНЫЙ: колонки нет, flowmeter.view ✓ (КИП8 pro) → виден', () => {
        const host = makeHost('КИП8 pro', KIP8_PRO_BASE,
            { found: true, permissions: { 'flowmeter.view': true, 'calc.view': true } });
        host._applyServerAccess();
        assertTrue(hasPage(host, 'КИП8 pro', 'plan-events'),
            'фоллбек Task 460 для КИП8 pro');
        assertTrue(hasPage(host, 'КИП8 pro', 'docs-ios'), 'хаб по расходомерам');
    });

    test('ПЕРЕХОДНЫЙ: колонки нет, прав нет → раздел скрыт', () => {
        const host = makeHost('КИП8', ['dashboard', 'calc', 'plan-events'],
            { found: true, permissions: { 'calc.view': true } });
        host._applyServerAccess();
        assertFalse(hasPage(host, 'КИП8', 'plan-events'),
            'без КИП ИОС/расходомеров раздела нет');
    });

    test('колонка есть, галка ✗, flowmeter.view ✓ (КИП8 pro) → скрыт, хаб ОСТАЛСЯ', () => {
        const host = makeHost('КИП8 pro', KIP8_PRO_BASE,
            { found: true, permissions: { 'flowmeter.view': true, 'plan.events': false } });
        host._applyServerAccess();
        assertFalse(hasPage(host, 'КИП8 pro', 'plan-events'),
            'право снято — раздела нет');
        assertTrue(hasPage(host, 'КИП8 pro', 'docs-ios'),
            'хаб «Документация ИОС» не пострадал');
        assertTrue(hasPage(host, 'КИП8 pro', 'flowmeter-data'), 'расходомеры на месте');
    });

    test('found=false (роли нет в матрице) → fail-closed', () => {
        const host = makeHost('КИП ИОС', KIP_IOS_BASE,
            { found: false, permissions: {} });
        host._applyServerAccess();
        assertFalse(hasPage(host, 'КИП ИОС', 'plan-events'),
            'план-эвентс снят, как все матричные группы');
        assertFalse(hasPage(host, 'КИП ИОС', 'kip-ios'), 'КИП ИОС снят');
    });

    test('_serverAccess=null → fail-closed по группам', () => {
        const host = makeHost('КИП ИОС', KIP_IOS_BASE, null);
        host._applyServerAccess();
        assertFalse(hasPage(host, 'КИП ИОС', 'plan-events'),
            'карта не получена — матричные группы сняты');
    });

    test('Админ (base "*") — метод не трогает список', () => {
        const host = makeHost('Админ', ['*'],
            { found: true, permissions: { 'kipios.view': true } });
        host._applyServerAccess();
        assertEqual(host.ROLE_ACCESS['Админ'].length, 1, 'админ как был');
        assertEqual(host.ROLE_ACCESS['Админ'][0], '*', 'звёздочка на месте');
    });

    test('незнакомая роль в _accessBase → метод молча выходит', () => {
        const host = makeHost('Гость', ['dashboard'], null);
        host._applyServerAccess();
        assertEqual(host.ROLE_ACCESS['Гость'][0], 'dashboard', 'список не тронут');
    });
});

// ============================================================
// 4. SRC — init-скрипт RoleMatrixTask462Init.gs
// ============================================================
describe('Task 462 — SRC: RoleMatrixTask462Init.gs (матрица)', () => {

    test('файл существует и содержит точку входа', () => {
        assertTrue(INIT_SRC.indexOf('function task462AddPlanEventsPermission()') !== -1,
            'функция для запуска в Apps Script');
        assertTrue(INIT_SRC.indexOf("TASK462_SPREADSHEET_ID = '1TmmNZLUArWH38F6NX0gMGar8LMNMQomm_FaGZv9osyk'") !== -1,
            'та же таблица KIP8_Access, что в RoleMatrix.gs');
    });

    test('право: perm_id plan.events + название «Плановые мероприятия»', () => {
        assertEqual(INIT_SRC.indexOf("TASK462_PERM_ID   = 'plan.events'") !== -1, true,
            'perm_id');
        assertEqual(INIT_SRC.indexOf("TASK462_PERM_NAME = 'Плановые мероприятия'") !== -1, true,
            'название для r5');
    });

    test('галочки по умолчанию = текущий доступ (Task 460)', () => {
        const idx = INIT_SRC.indexOf('TASK462_SOURCE_PERMS');
        const block = INIT_SRC.slice(idx, idx + 200);
        assertTrue(block.indexOf("'kipios.view'") !== -1, 'источник kipios.view');
        assertTrue(block.indexOf("'kipios.restricted'") !== -1, 'источник kipios.restricted');
        assertTrue(block.indexOf("'flowmeter.view'") !== -1, 'источник flowmeter.view');
        assertTrue(INIT_SRC.indexOf('var val = isAdmin || sources.length > 0;') !== -1,
            'формула: админ ИЛИ любое из прав-источников');
    });

    test('идемпотентность: существующая колонка не трогается', () => {
        assertTrue(INIT_SRC.indexOf('галочки НЕ тронуты') !== -1,
            'повторный запуск не меняет настроенный доступ');
        assertTrue(INIT_SRC.indexOf('var colCreated = false;') !== -1,
            'галочки ставятся только при создании колонки');
    });

    test('колонка ставится ПОСЛЕДНЕЙ правой (как Task 340)', () => {
        assertTrue(INIT_SRC.indexOf('insertColumnAfter(lastPermCol)') !== -1,
            'вставка после последнего права');
        assertTrue(INIT_SRC.indexOf('requireCheckbox().setAllowInvalid(false)') !== -1,
            'data validation — чекбоксы');
    });

    test('permissions: строка-справочник + метка A3 + сброс кэша', () => {
        assertTrue(INIT_SRC.indexOf("'КИП ИОС',") !== -1, 'группа права в справочнике');
        assertTrue(INIT_SRC.indexOf('Task 462: +plan.events') !== -1, 'метка в matrix!A3');
        assertTrue(INIT_SRC.indexOf('roleMatrixInvalidateCache();') !== -1,
            'сброс кэша матрицы');
    });
});

// ============================================================
// 5. SW
// ============================================================
describe('Task 462 — SW', () => {

    test("CACHE_VERSION = 'kipia-test-v760' + комментарий Task 462", () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v760';") !== -1,
            'версия поднята до v686');
        assertTrue(SW_SRC.indexOf('kipia-test-v685') === -1,
            'старой версии v685 нет');
        assertTrue(SW_SRC.indexOf('Task 462') !== -1, 'комментарий Task 462 в истории');
        assertTrue(SW_SRC.indexOf('plan.events') !== -1,
            'в комментарии — право plan.events');
    });
});
