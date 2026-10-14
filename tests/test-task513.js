// tests/test-task513.js
// Task 513 — заявка пользователя: «Подтверждаю уборку» (по аудиту
// Task 512 — «Проверь код приложения на наличие ошибок и мёртвого
// кода»). УДАЛЕНИЕ мёртвого кода, найденного аудитом, с учётом
// верификации ссылок (тесты/desktop-репо):
//
// ЧТО УДАЛЕНО (index.html, −488 строк):
//   • остатки удалённых фич «Приборы/Арматура/Регуляторы/Замки/
//     Проекты» (dev*, valve*, regulator*, lock*, project(s)*:
//     ForceRefresh/GetLastUpdateDate/ScrollToGroup/фильтр типа);
//   • калькуляторы погрешностей: calcErrorGOST, getOimlMpe,
//     toggleErrorClassFields, validateNonNegativeField;
//   • OTP-автозаполнение setupOtpInputs (IIFE), refreshAppData,
//     KipAuth.getCurrentUser-обёртка (приложение зовёт
//     api('getCurrentUser') напрямую), handleBackButton,
//     toggleSearch (пробрасывал клик), _fmtDateTime, devPlural,
//     isTablet, ticketRenderDetailInPanel.
// ЧТО УДАЛЕНО (scripts/*.gs, −443 строки):
//   • ОПАСНЫЙ GAS-дубликат setupTriggers из Utils.gs (удалял ВСЕ
//     триггеры проекта; канон — Code.gs, только hourlyCleanup);
//   • 8 мёртвых функций: _colLetter, flowmeterCleanupCommentMetadata,
//     flowmeterFixDates, roleMatrixHasPermission,
//     roleMatrixGetAccessForEmail (superseded RoleMatrixGate), sdpDebug,
//     statusCodesDeployAll, statusCodesStatus.
// ЧТО СОХРАНЕНО (верификация аудита — ложные кандидаты):
//   • 8 «мёртвых» методов, вызываемых тестами: _renderEmpPopup,
//     _sourceLabel, _state, _vacDays, _vacNetDays, _wsFullFio,
//     KipDB.del, WorkSchedule.reloadTotals;
//   • openLibraryViewer (защитный стаб), 7 backend- и 5 frontend-
//     test-only функций, роуты, guarded-остатки id.
// SW: kipia-test-v738 (v730 → v731: менялся index.html).
//
// Запуск: через tests/run-all.js (require './test-task513.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function gsSrc(name) {
    return fs.readFileSync(path.join(ROOT, 'scripts', name), 'utf8');
}

const DEAD_FRONTEND = {
    'Приборы (dev*)': [
        'devPlural', 'devScrollToGroup', 'devShowMoreSorted',
        'devToggleTypeFilter', 'devUpdateFilterButton'
    ],
    'Арматура/регуляторы/замки/проекты': [
        'valveForceRefresh', 'valveGetLastUpdateDate', 'valveScrollToGroup',
        'regulatorForceRefresh', 'regulatorGetLastUpdateDate',
        'regulatorScrollToGroup',
        'lockForceRefresh', 'lockGetLastUpdateDate', 'lockScrollToGroup',
        'projectGetLastUpdateDate', 'projectsForceRefresh',
        'projectsScrollToGroup'
    ],
    'Калькуляторы погрешностей': [
        'calcErrorGOST', 'getOimlMpe',
        'toggleErrorClassFields', 'validateNonNegativeField'
    ],
    'OTP/авторизация/прочее': [
        'refreshAppData', 'handleBackButton',
        'toggleSearch', '_fmtDateTime', 'isTablet',
        'ticketRenderDetailInPanel'
    ]
};

const DEAD_BACKEND = {
    'RoleMatrixInit.gs': ['_colLetter'],
    'Flowmeter.gs': ['flowmeterCleanupCommentMetadata'],
    'FlowmeterInit.gs': ['flowmeterFixDates'],
    'RoleMatrix.gs': ['roleMatrixHasPermission', 'roleMatrixGetAccessForEmail'],
    'SessionsDevicePolicy.gs': ['sdpDebug'],
    'StatusCodesInit.gs': ['statusCodesDeployAll', 'statusCodesStatus']
};

// ------------------------------------------------------------
// 1. Фронтенд: мёртвый код удалён и не возвращается
// ------------------------------------------------------------
describe('Task 513 — index.html: мёртвые функции удалены', () => {
    // word-границы: имена-подстроки живых функций (getOimlMpe внутри
    // getOimlMpeR60) не должны давать ложных срабатываний
    function absent(src, name) {
        return !new RegExp('\\b' + name + '\\b').test(src);
    }

    Object.keys(DEAD_FRONTEND).forEach((group) => {
        test('удалены: ' + group, () => {
            DEAD_FRONTEND[group].forEach((name) => {
                assertTrue(absent(INDEX_SRC, name),
                    name + ' не должен встречаться в index.html');
            });
        });
    });

    test('setupOtpInputs-IIFE ЖИВ (самовыполняется, не мёртвый код)', () => {
        // КАМЕНЬ аудита Task 512: IIFE не имеет вызовов, но исполняется
        // при загрузке — навешивает input/keydown/paste на otp1–otp6,
        // Enter на #authEmail и #createUserEmail. Удаление ломает вход.
        const i = INDEX_SRC.indexOf('(function setupOtpInputs() {');
        assertTrue(i !== -1,
            'IIFE setupOtpInputs должен жить в index.html');
        const tail = INDEX_SRC.slice(i, i + 3000);
        assertTrue(tail.indexOf("getElementById('otp' + (i+2))") !== -1 ||
                   tail.indexOf("otp' + (i+2)") !== -1,
            'автопереход между OTP-полями жив');
        assertTrue(tail.indexOf('authEmail') !== -1,
            'Enter на поле email жив');
    });

    test('KipAuth.getCurrentUser-обёртка удалена (api-вызов жив)', () => {
        assertFalse(/getCurrentUser\s*:\s*function/.test(INDEX_SRC),
            'метод-обёртка getCurrentUser: function удалён');
        assertTrue(INDEX_SRC.indexOf("api('getCurrentUser'") !== -1,
            "прямой вызов api('getCurrentUser') жив");
    });

    test('живые методы, вызываемые тестами, не задеты', () => {
        [
            '_renderEmpPopup: function',   // test-task417: обёртка для тестов
            '_sourceLabel: function',      // test-prod-calendar: подпись источника
            '_state: function() {',        // test-task477: диагностика
            '_vacDays: function',          // test-work-schedule
            '_vacNetDays: function',       // test-task310
            '_wsFullFio: function',        // test-task489 + WorkSchedule.gs
            'reloadTotals: function',      // test-task321 (сброс кэша года)
            'del: function(key)'           // test-task476 (KipDB.del)
        ].forEach((sig) => {
            assertTrue(INDEX_SRC.indexOf(sig) !== -1,
                'метод «' + sig + '» должен остаться (используется тестами)');
        });
    });
});

// ------------------------------------------------------------
// 2. Бэкенд: мёртвые функции и GAS-дубликат setupTriggers
// ------------------------------------------------------------
describe('Task 513 — scripts/*.gs: мёртвые функции удалены', () => {
    function absentGs(src, name) {
        return !new RegExp('\\b' + name + '\\b').test(src);
    }

    Object.keys(DEAD_BACKEND).forEach((file) => {
        test(file + ': мёртвые функции отсутствуют', () => {
            const src = gsSrc(file);
            DEAD_BACKEND[file].forEach((name) => {
                assertTrue(absentGs(src, name),
                    name + ' не должен встречаться в ' + file);
            });
        });
    });

    test('setupTriggers: канон ОДИН, в Code.gs (GAS-override устранён)', () => {
        const code = gsSrc('Code.gs');
        const utils = gsSrc('Utils.gs');
        assertTrue(/^function\s+setupTriggers\s*\(/m.test(code),
            'канон setupTriggers жив в Code.gs');
        assertTrue(utils.indexOf('setupTriggers') === -1,
            'копия setupTriggers удалена из Utils.gs');
        // канон удаляет только hourlyCleanup-триггеры (не все проектные)
        const body = code.slice(code.indexOf('function setupTriggers'));
        assertTrue(
            body.indexOf("getHandlerFunction() === 'hourlyCleanup'") !== -1,
            'канон фильтрует только hourlyCleanup');
    });

    test('Utils.gs beginExecution: упоминание sdpDebug убрано', () => {
        const utils = gsSrc('Utils.gs');
        assertTrue(utils.indexOf('sdpDebug') === -1,
            'sdpDebug не должен упоминаться в Utils.gs');
        assertTrue(utils.indexOf('beginExecution: function') !== -1,
            'beginExecution жив');
    });
});

// ------------------------------------------------------------
// 3. Service Worker: версия поднята (index.html менялся)
// ------------------------------------------------------------
describe('Task 513 — SW: кэш поднят до kipia-test-v738', () => {
    test("CACHE_VERSION = 'kipia-test-v738'", () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v738'") !== -1,
            'CACHE_VERSION = kipia-test-v738 (Task 513 — уборка мёртвого кода)');
    });
    test('kipia-test-v739 не существует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v739') === -1,
            'kipia-test-v739 не существует (двойной бамп)');
    });
});
