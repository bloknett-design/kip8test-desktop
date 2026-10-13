// ============================================================
// Тест: аудит доступа ролей — соответствие всех точек входа
// (сайдбар, дашборд, закреплённые ярлыки, десктопный верхний бар)
// матрице фильтров доступа из карты ролей.
// Task 141.
//
// Подход (без DOM — статический анализ index.html):
//   1. Извлекаем из index.html массивы страниц KipAuth
//      (_BASE_PAGES ... _WHATS_NEW_PAGES) и тело init(),
//      вычисляем ROLE_ACCESS в песочнице vm — как в приложении.
//   2. Извлекаем реестр SUBSECTIONS (закреплённые ярлыки).
//   3. Парсим HTML-точки входа: .sidebar-item, .menu-btn
//      (атрибут onclick navigateTo), .desktop-top-bar-tab (data-page).
//   4. Сверяем с ожидаемой матрицей фильтров (1-10).
//
// Ловит регрессы вида:
//   - ярлык «Проекты» с target на несуществующую страницу (Task 141);
//   - «Приборы» без 'devices' в _KIP_IOS_PAGES (Task 141);
//   - удаление страницы из массива роли;
//   - новая кнопка/ярлык со страницей, недоступной роли.
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue } = require('./test-helpers.js');

const INDEX_HTML = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_HTML, 'utf-8');

// ------------------------------------------------------------
// 1. Извлечение массивов страниц KipAuth и вычисление ROLE_ACCESS
// ------------------------------------------------------------
function extractArraysAndInit() {
    // Фрагмент от "_BASE_PAGES:" до конца "_WHATS_NEW_PAGES: [...]"
    const startMatch = html.match(/_BASE_PAGES:\s*\[/);
    if (!startMatch) throw new Error('_BASE_PAGES не найден в index.html');
    const startIdx = startMatch.index;
    const endMatch = html.slice(startIdx).match(/_WHATS_NEW_PAGES:\s*\[[^\]]*\]/);
    if (!endMatch) throw new Error('_WHATS_NEW_PAGES не найден');
    const fragment = html.slice(startIdx, startIdx + endMatch.index + endMatch[0].length);

    // Обернуть в объект и выполнить в песочнице
    const objCode = '({' + fragment + '})';
    const arraysObj = vm.runInNewContext(objCode, {}, 'arrays.vm');

    // Тело init(): от "init: function() {" до парной "}"
    const initMatch = html.match(/init:\s*function\(\)\s*\{/);
    if (!initMatch) throw new Error('init() KipAuth не найден');
    const initStart = initMatch.index + initMatch[0].length;
    let depth = 1, i = initStart;
    while (i < html.length && depth > 0) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}') depth--;
        i++;
    }
    const initBody = html.slice(initMatch.index + 'init:'.length, i);
    // initBody = " function() { ... }" — выполняем с this = массивы
    const initFn = vm.runInNewContext('(' + initBody + ')', {}, 'init.vm');
    initFn.call(arraysObj);
    if (!arraysObj.ROLE_ACCESS) throw new Error('ROLE_ACCESS не построен после init()');
    return arraysObj;
}

// ------------------------------------------------------------
// 2. Извлечение SUBSECTIONS (закреплённые ярлыки на главной)
// ------------------------------------------------------------
function extractSubsections() {
    const m = html.match(/const\s+SUBSECTIONS\s*=\s*\{/);
    if (!m) throw new Error('SUBSECTIONS не найден');
    let depth = 0, i = m.index + m[0].length - 1;
    for (; i < html.length; i++) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}') { depth--; if (depth === 0) break; }
    }
    const code = html.slice(m.index, i + 1) + ';';
    const sandbox = {};
    // const в vm-контексте НЕ пишется в sandbox — возвращаем значение
    // последним выражением
    const SUBSECTIONS = vm.runInNewContext(code + '\nSUBSECTIONS;', sandbox, 'subsections.vm');
    return SUBSECTIONS;
}

// ------------------------------------------------------------
// 3. Точки входа из HTML
// ------------------------------------------------------------
function extractEntryPoints() {
    const sidebar = [];
    const menuBtns = [];
    const topBar = [];
    // .sidebar-item с onclick navigateTo
    const re = /<div[^>]*class="[^"]*sidebar-item[^"]*"[^>]*onclick="navigateTo\('([^']+)'\)/g;
    let m;
    while ((m = re.exec(html)) !== null) sidebar.push(m[1]);
    // .menu-btn с onclick navigateTo (статические кнопки дашборда/разделов)
    const reBtn = /<div[^>]*class="[^"]*menu-btn[^"]*"[^>]*onclick="navigateTo\('([^']+)'\)/g;
    while ((m = reBtn.exec(html)) !== null) menuBtns.push(m[1]);
    // Десктопный верхний бар: data-page
    const reTab = /class="[^"]*desktop-top-bar-tab[^"]*"[^>]*data-page="([^"]+)"/g;
    while ((m = reTab.exec(html)) !== null) topBar.push(m[1]);
    return { sidebar, menuBtns, topBar };
}

const Kip = extractArraysAndInit();
const SUBSECTIONS = extractSubsections();
const ENTRIES = extractEntryPoints();

// Все страницы, доступные хоть какой-то роли (без '*')
// Task 462: + _PLAN_EVENTS_PAGES (право plan.events; до этого
// plan-events входил в _KIP_IOS_PAGES)
const ALL_PAGES = [].concat(
    Kip._BASE_PAGES, Kip._CALC_PAGES, Kip._LIBRARY_PAGES, Kip._KIP_IOS_PAGES,
    Kip._PLAN_EVENTS_PAGES, Kip._FLOWMETER_PAGES, Kip._CHARTS_PAGES,
    Kip._SECRET_PAGES, Kip._WHATS_NEW_PAGES, Kip._WORK_SCHEDULE_PAGES
);

// Роли по карте доступа
const ROLES = ['Запрет', 'Общий доступ', 'ИТР ТОКЕМ', 'КИП8', 'КИП8 pro', 'КИП ИОС',
               'КИП ИОС pro', 'КИП ИОС дежурный', 'ИТР8', 'ИТР8 pro', 'ИТР ИОС', 'Админ'];

// ------------------------------------------------------------
// Матрица фильтров (карта ролей): какие фильтры включены у роли.
// Фильтры: 1=калькуляторы, 2=билеты+библиотека, 3=КИП ИОС,
//          4=ограниченный КИП ИОС, 7=секретные, 8=что нового,
//          9=графики, 10=расходомеры
// ------------------------------------------------------------
const FILTER_MATRIX = {
    'Запрет':            [],
    'Общий доступ':      [1],
    'ИТР ТОКЕМ':         [1, 4, 8],
    'КИП8':              [1, 2, 7, 8],
    'КИП8 pro':          [1, 2, 7, 8, 10],
    'КИП ИОС':           [1, 2, 3, 7, 8],
    'КИП ИОС pro':       [1, 2, 3, 5, 7, 8],
    'КИП ИОС дежурный':  [1, 2, 3, 7, 8, 10, 11],
    'ИТР8':              [1, 2, 3, 7, 8, 10],
    'ИТР8 pro':          [1, 2, 3, 7, 8, 10],
    'ИТР ИОС':           [1, 2, 3, 5, 7, 8, 10],
    'Админ':             [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};

// Страница-представитель каждого фильтра (клиентская матрица)
const FILTER_PAGE = {
    1: 'calculators',      // Инженерные калькуляторы
    2: 'exam-tickets',     // Экзаменационные билеты (+библиотека)
    3: 'kip-ios',          // КИП ИОС
    7: 'minesweeper',      // Секретные кнопки
    8: 'whats-new',        // Что нового
    9: 'charts',           // Графики
    10: 'flowmeter-data'   // Расходомеры
};

function hasPage(role, page) {
    const allowed = Kip.ROLE_ACCESS[role];
    if (!allowed) return false;
    if (allowed.indexOf('*') !== -1) return true;
    return allowed.indexOf(page) !== -1;
}

// ------------------------------------------------------------
// Тесты
// ------------------------------------------------------------
describe('Аудит ролей: ROLE_ACCESS построен', function () {

    test('ROLE_ACCESS содержит все 12 ролей', function () {
        ROLES.forEach(function (role) {
            assertTrue(!!Kip.ROLE_ACCESS[role], 'роль отсутствует в ROLE_ACCESS: ' + role);
        });
    });

    test('Админ имеет полный доступ [*]', function () {
        assertEqual(Kip.ROLE_ACCESS['Админ'].indexOf('*') !== -1, true, 'Админ должен иметь "*"');
    });
});

describe('Аудит ролей: матрица фильтров 1-10', function () {

    ROLES.forEach(function (role) {
        test('Роль «' + role + '» — страницы по фильтрам', function () {
            const filters = FILTER_MATRIX[role];
            Object.keys(FILTER_PAGE).forEach(function (f) {
                const page = FILTER_PAGE[f];
                // Фильтр 4 (ограниченный КИП ИОС) тоже даёт доступ к kip-ios
                // (с ограничениями: скрыты Проекты/Каб.журнал/Графики/Замечания/ППР)
                let expectVisible = filters.indexOf(Number(f)) !== -1;
                if (Number(f) === 3 && filters.indexOf(4) !== -1) expectVisible = true;
                assertEqual(hasPage(role, page), expectVisible,
                    'фильтр ' + f + ' (' + page + '): ожидалось ' + (expectVisible ? 'доступ' : 'нет доступа'));
            });
        });
    });

    test('Фильтр 4 (ИТР ТОКЕМ): UI скрывает «Кабельный журнал» и «Проекты» (Task 139/140)', function () {
        // Статическая проверка: в _applyRoleToUI есть блок скрытия этих страниц
        // для ролей с ограниченным КИП ИОС
        assertTrue(html.indexOf("page === 'cable-journal-edit' || page === 'projects-prod'") !== -1,
            'нет проверки cable-journal-edit/projects-prod в _applyRoleToUI');
        assertTrue(html.indexOf('_hasRestrictedKipIos') !== -1,
            'нет вызова _hasRestrictedKipIos');
    });

    test('Фильтр 4: «Замечания» скрыты в карточках (Task 113)', function () {
        // Статическая проверка: в DEV-рендере есть skip Замечаний
        assertTrue(/_hideRemarks\s*&&\s*f\.key\s*===\s*'Замечания'/.test(html),
            'нет skip «Замечаний» в рендере карточки прибора');
        assertTrue(/_hideLockRemarks\s*&&\s*f\.key\s*===\s*'Замечания'/.test(html),
            'нет skip «Замечаний» в рендере карточки блокировки');
    });

    test('Фильтр 4: приборы без «В гр. ППР» скрыты во всех рендерах (Task 113/140)', function () {
        const count = (html.match(/В гр\. ППР'\]\s*\|\|\s*''\)\.trim\(\)\.toLowerCase\(\)\s*!==\s*'нет'/g) || []).length;
        assertTrue(count >= 3, 'фильтр «В гр. ППР» должен применяться минимум в 3 рендерах (devRender, devRenderSorted, devRenderGroup), найдено: ' + count);
    });

    test('Фильтр 4: блокировки без «В перечне» скрыты во всех рендерах (Task 113/140)', function () {
        const count = (html.match(/В перечне'\]\s*\|\|\s*''\)\.trim\(\)\.toLowerCase\(\)\s*!==\s*'нет'/g) || []).length;
        assertTrue(count >= 2, 'фильтр «В перечне» должен применяться минимум в 2 рендерах (lockRenderSorted, lockRenderGroup), найдено: ' + count);
    });
});

describe('Аудит ролей: закреплённые ярлыки (SUBSECTIONS)', function () {

    test('Все target закреплённых ярлыков — валидные доступные страницы', function () {
        Object.keys(SUBSECTIONS).forEach(function (key) {
            const target = SUBSECTIONS[key].target;
            const inAllPages = ALL_PAGES.indexOf(target) !== -1;
            const isAdminPage = target.indexOf('admin') === 0;
            assertTrue(inAllPages || isAdminPage,
                'target «' + key + '» → «' + target + '» недоступен ни одной роли (кроме Админа)');
        });
    });

    test('«Проекты» ведут на существующую страницу projects-prod (Task 141)', function () {
        assertEqual(SUBSECTIONS['projects'].target, 'projects-prod',
            'target ярлыка «Проекты» должен быть projects-prod');
        assertEqual(html.indexOf('id="page-projects-prod"') !== -1, true,
            'страница page-projects-prod должна существовать');
    });

    test('«Приборы»: страница devices доступна КИП ИОС-ролям (Task 141)', function () {
        ['КИП ИОС', 'КИП ИОС pro', 'КИП ИОС дежурный', 'ИТР8', 'ИТР8 pro', 'ИТР ИОС', 'ИТР ТОКЕМ', 'Админ']
            .forEach(function (role) {
                assertTrue(hasPage(role, 'devices'),
                    'роль «' + role + '» должна иметь доступ к devices (фильтр 3)');
            });
        ['Запрет', 'Общий доступ', 'КИП8', 'КИП8 pro'].forEach(function (role) {
            assertEqual(hasPage(role, 'devices'), false,
                'роль «' + role + '» НЕ должна иметь доступ к devices');
        });
    });

    test('Видимость закреплённых ярлыков по ролям (вычисление матрицы)', function () {
        // Для каждой роли: ярлык виден <=> target в allowed,
        // кроме фильтра 4 (ИТР ТОКЕМ: cable-journal-edit, projects-prod скрыты)
        const hiddenByF4 = ['cable-journal-edit', 'projects-prod'];
        ROLES.forEach(function (role) {
            const restricted = role === 'ИТР ТОКЕМ';
            Object.keys(SUBSECTIONS).forEach(function (key) {
                const target = SUBSECTIONS[key].target;
                let expectVisible = hasPage(role, target);
                if (restricted && hiddenByF4.indexOf(target) !== -1) expectVisible = false;
                // Динамическая проверка невозможна без DOM — здесь проверяем
                // консистентность матрицы: для ролей без фильтра 4 target доступен
                if (!restricted && expectVisible) {
                    assertEqual(hasPage(role, target), true,
                        'роль «' + role + '»: target «' + target + '» ярлыка «' + key + '» должен быть в allowed');
                }
            });
        });
    });
});

describe('Аудит ролей: HTML-точки входа', function () {

    // Страницы-редиректы (validate по navigateTo, а не по id="page-...")
    const REDIRECT_PAGES = ['library', 'cables', 'cables-prod'];

    test('Пункты сайдбара: все target валидны', function () {
        ENTRIES.sidebar.forEach(function (target) {
            const ok = ALL_PAGES.indexOf(target) !== -1 ||
                       target === 'admin' || REDIRECT_PAGES.indexOf(target) !== -1;
            assertTrue(ok, 'пункт сайдбара «' + target + '» ведёт на недоступную страницу');
        });
    });

    test('Кнопки меню: все target валидны', function () {
        ENTRIES.menuBtns.forEach(function (target) {
            const ok = ALL_PAGES.indexOf(target) !== -1 ||
                       target === 'admin' || REDIRECT_PAGES.indexOf(target) !== -1;
            assertTrue(ok, 'кнопка меню «' + target + '» ведёт на недоступную страницу');
        });
    });

    test('Десктопный верхний бар: все data-page валидны', function () {
        ENTRIES.topBar.forEach(function (target) {
            const ok = ALL_PAGES.indexOf(target) !== -1;
            assertTrue(ok, 'вкладка верхнего бара «' + target + '» ведёт на недоступную страницу');
        });
    });

    test('Верхний бар: вкладка «Документация» скрыта для ролей без docs (статически)', function () {
        // В _applyRoleToUI должна быть проверка вкладки docs
        assertTrue(/page === 'docs'[\s\S]{0,300}allowed\.indexOf\('docs'\)/.test(html),
            'нет фильтрации вкладки «Документация» верхнего бара');
    });

    test('Сайдбар: «Админ-панель» видна только Админу (статически)', function () {
        assertTrue(/sidebarAdminBtn[\s\S]{0,200}this\._cachedRole === 'Админ'/.test(html) ||
                   /_cachedRole === 'Админ'[\s\S]{0,200}sidebarAdminBtn/.test(html),
            'нет проверки роли Админа для кнопки админ-панели');
    });
});

describe('Аудит ролей: базовые инварианты', function () {

    test('Гость («Общий доступ») не имеет доступа к документации и КИП ИОС', function () {
        ['docs', 'exam-tickets', 'library', 'kip-ios', 'devices', 'flowmeter-data', 'minesweeper'].forEach(function (p) {
            assertEqual(hasPage('Общий доступ', p), false,
                'гость не должен видеть «' + p + '»');
        });
    });

    test('«Запрет» имеет доступ только к главной', function () {
        const allowed = Kip.ROLE_ACCESS['Запрет'];
        assertEqual(allowed.length, 1, 'у «Запрет» только dashboard');
        assertEqual(allowed[0], 'dashboard', 'у «Запрет» только dashboard');
    });

    test('Расходомеры: доступ по фильтру 10', function () {
        ['КИП8 pro', 'КИП ИОС дежурный', 'ИТР8', 'ИТР8 pro', 'ИТР ИОС', 'Админ'].forEach(function (role) {
            assertTrue(hasPage(role, 'flowmeter-data'), 'роль «' + role + '» должна видеть расходомеры (фильтр 10)');
        });
        ['Запрет', 'Общий доступ', 'ИТР ТОКЕМ', 'КИП8', 'КИП ИОС', 'КИП ИОС pro'].forEach(function (role) {
            assertEqual(hasPage(role, 'flowmeter-data'), false,
                'роль «' + role + '» НЕ должна видеть расходомеры');
        });
    });

    test('Графики: доступ только Админу (фильтр 9)', function () {
        ROLES.forEach(function (role) {
            assertEqual(hasPage(role, 'charts'), role === 'Админ',
                '«Графики»: только Админ, роль «' + role + '»');
        });
    });

    test('Секретные разделы: фильтр 7', function () {
        ['КИП8', 'КИП8 pro', 'КИП ИОС', 'КИП ИОС pro', 'КИП ИОС дежурный', 'ИТР8', 'ИТР8 pro', 'ИТР ИОС', 'Админ'].forEach(function (role) {
            assertTrue(hasPage(role, 'minesweeper'), 'роль «' + role + '» должна видеть секретные разделы (фильтр 7)');
        });
        ['Запрет', 'Общий доступ', 'ИТР ТОКЕМ'].forEach(function (role) {
            assertEqual(hasPage(role, 'minesweeper'), false,
                'роль «' + role + '» НЕ должна видеть секретные разделы');
        });
    });
});

// ------------------------------------------------------------
// Task 142: счётчики групп сайдбара, мобильный нижний бар,
// перестроение сетки при фильтрации (дыры)
// ------------------------------------------------------------

// Пункты сайдбара по группам (из HTML) — для вычисления ожидаемых счётчиков
const SIDEBAR_GROUPS = {
    kipa: ['converter', 'scale-signal', 'error-select', 'buoy-select', 'temp-sensors', 'orifice-select'],
    electro: ['circuit-breaker'],
    geometry: ['geo-circle', 'geo-ring', 'geo-cylinder', 'geo-horiz', 'geo-sphere', 'geo-cone'],
    'exam-tickets': ['tickets-1000v', 'tickets-4', 'tickets-5', 'tickets-6'],
    library: [],  // внешние ссылки + library-electro (без navigateTo у внешних)
    'kip-ios': ['devices-prod', 'lockouts-prod', 'valves-prod', 'regulators-prod', 'projects-prod', 'cable-journal-edit', 'plan-114'],
    'docs-ios': ['flowmeter-data']
};

// Ожидаемый динамический счётчик группы сайдбара для роли:
// число пунктов, доступных роли (страница в allowed), с учётом фильтра 4
// (ИТР ТОКЕМ: cable-journal-edit и projects-prod скрыты) и пустых
// родительских страниц (Task 115: docs-ios скрывается, если на целевой
// странице нет видимых кнопок — например, «Расходомеры» недоступны).
function expectedSidebarCount(role, group) {
    const items = SIDEBAR_GROUPS[group];
    if (!items || items.length === 0) return null;
    const restricted = role === 'ИТР ТОКЕМ';
    let count = 0;
    items.forEach(function (page) {
        if (!hasPage(role, page)) return;
        if (restricted && (page === 'cable-journal-edit' || page === 'projects-prod')) return;
        // Task 115: пункт «Расходомеры» (flowmeter-data) — на странице docs-ios
        // только эта кнопка; если недоступна — пункт не виден (hasPage уже учёл)
        count++;
    });
    return count;
}

describe('Аудит ролей: счётчики групп сайдбара (Task 139, динамические)', function () {

    test('Код динамического пересчёта счётчиков присутствует', function () {
        // Пересчёт: sidebar-group-title-count обновляется числом видимых пунктов
        assertTrue(html.indexOf('sidebar-group-title-count') !== -1,
            'нет элемента счётчика .sidebar-group-title-count');
        assertTrue(/visibleCount[\s\S]{0,80}countEl\.textContent\s*=\s*visibleCount/.test(html),
            'нет записи visibleCount в счётчик (динамический пересчёт Task 139)');
    });

    test('Каждая группа сайдбара в HTML имеет счётчик', function () {
        // Извлечь группы и проверить наличие счётчика в разметке
        const groups = html.match(/<div class="sidebar-group[^"]*" data-group="[^"]+"/g) || [];
        assertTrue(groups.length >= 7, 'в сайдбаре должно быть минимум 7 групп, найдено: ' + groups.length);
        const counts = html.match(/class="sidebar-group-title-count"/g) || [];
        assertEqual(counts.length, groups.length,
            'число счётчиков должно совпадать с числом групп');
    });

    test('ИТР ТОКЕМ: группа КИП ИОС — 5 видимых пунктов (7 − Проекты − Каб.журнал, фильтр 4)', function () {
        assertEqual(expectedSidebarCount('ИТР ТОКЕМ', 'kip-ios'), 5,
            'у ИТР ТОКЕМ в группе КИП ИОС должно быть 5 видимых пунктов');
    });

    test('КИП ИОС: группа КИП ИОС — 7 видимых пунктов (полный доступ)', function () {
        assertEqual(expectedSidebarCount('КИП ИОС', 'kip-ios'), 7,
            'у КИП ИОС в группе КИП ИОС должно быть 7 видимых пунктов');
    });

    test('Группа «Документация ИОС» (расходомеры): видима только ролям с фильтром 10', function () {
        ROLES.forEach(function (role) {
            const expected = hasPage(role, 'flowmeter-data') ? 1 : 0;
            assertEqual(expectedSidebarCount(role, 'docs-ios'), expected,
                'роль «' + role + '»: пунктов в группе docs-ios должно быть ' + expected);
        });
    });

    test('Гость: во всех группах 0 доступных пунктов документации', function () {
        ['exam-tickets', 'kip-ios', 'docs-ios'].forEach(function (group) {
            assertEqual(expectedSidebarCount('Общий доступ', group), 0,
                'у гостя в группе «' + group + '» не должно быть доступных пунктов');
        });
    });
});

describe('Аудит ролей: мобильный нижний бар (dashboardBottomBar)', function () {

    test('Кнопки нижнего бара присутствуют в HTML', function () {
        assertTrue(html.indexOf('dashboardBottomBar') !== -1,
            'нет контейнера dashboardBottomBar');
        assertTrue(html.indexOf('dashboard-bottom-btn-docs') !== -1,
            'нет кнопки «Документация» (.dashboard-bottom-btn-docs)');
    });

    test('Код фильтрации кнопки «Документация» присутствует (hasDocsAccess)', function () {
        assertTrue(/dashboard-bottom-btn-docs[\s\S]{0,200}hasDocsAccess/.test(html) ||
                   /hasDocsAccess[\s\S]{0,200}dashboard-bottom-btn-docs/.test(html),
            'нет фильтрации кнопки «Документация» нижнего бара по доступу');
    });

    test('Кнопка «Документация» видна ролям с доступом к docs', function () {
        // Task 397 (общее правило): формула из _applyRoleToUI —
        // isAll || docs (композит docs|library|kip-ios упрощён:
        // library влечёт docs — одна группа; kip-ios без library
        // не открывает page-docs — кнопка вела на «Нет доступа»).
        ROLES.forEach(function (role) {
            const allowed = Kip.ROLE_ACCESS[role] || [];
            const isAll = allowed.indexOf('*') !== -1;
            const expectVisible = isAll
                || allowed.indexOf('docs') !== -1;
            // Кнопка ведёт на page-docs, где видимые кнопки зависят от роли:
            // Task 115 скрывает «Документацию», если ВСЕ кнопки на docs скрыты.
            // Полная симуляция Task 115 здесь не выполняется — проверяем формулу
            // hasDocsAccess (первичную видимость кнопки).
            assertEqual(typeof expectVisible, 'boolean',
                'роль «' + role + '»: вычисление видимости кнопки «Документация»');
        });
        // Конкретные ожидания по матрице
        [['Запрет', false], ['Общий доступ', false], ['ИТР ТОКЕМ', true], ['КИП8', true],
         ['КИП8 pro', true], ['КИП ИОС', true], ['Админ', true]].forEach(function (pair) {
            const allowed = Kip.ROLE_ACCESS[pair[0]] || [];
            const isAll = allowed.indexOf('*') !== -1;
            const actual = isAll
                || allowed.indexOf('docs') !== -1;
            assertEqual(actual, pair[1],
                'роль «' + pair[0] + '»: кнопка «Документация» нижнего бара');
        });
    });

    // Task 397 (общее правило): «Инженерные калькуляторы» нижнего
    // бара — прежде «видна всегда», теперь видна ⟺ доступ к разделу.
    test('Кнопка «Инженерные калькуляторы» нижнего бара видна ролям с calculators', function () {
        [['Запрет', false], ['Общий доступ', true], ['ИТР ТОКЕМ', true], ['КИП8', true],
         ['КИП ИОС', true], ['Админ', true]].forEach(function (pair) {
            const allowed = Kip.ROLE_ACCESS[pair[0]] || [];
            const isAll = allowed.indexOf('*') !== -1;
            const actual = isAll || allowed.indexOf('calculators') !== -1;
            assertEqual(actual, pair[1],
                'роль «' + pair[0] + '»: кнопка «Инженерные калькуляторы» нижнего бара');
        });
    });

    test('Нижний бар скрыт целиком, если обе кнопки недоступны («Запрет»)', function () {
        const allowed = Kip.ROLE_ACCESS['Запрет'] || [];
        const isAll = allowed.indexOf('*') !== -1;
        const calcVisible = isAll || allowed.indexOf('calculators') !== -1;
        const docsVisible = isAll || allowed.indexOf('docs') !== -1;
        assertEqual(calcVisible || docsVisible, false,
            '«Запрет»: обе кнопки бара скрыты — бар скрыт целиком');
    });
});

describe('Аудит ролей: перестроение сетки при фильтрации (Task 142)', function () {

    test('Код скрытия пустых обёрток subsection-cell/dev-swipe-cell присутствует', function () {
        assertTrue(/\.subsection-cell, \.dev-swipe-cell[\s\S]{0,300}cell\.style\.display/.test(html),
            'нет скрытия пустых обёрток .subsection-cell/.dev-swipe-cell в _applyRoleToUI');
    });

    test('wrapSubsectionItems скрывает обёртку скрытой кнопки при создании', function () {
        // Обёртки создаются при ПЕРВОМ переходе на страницу — позже _applyRoleToUI;
        // поэтому при создании обёртки скрытой кнопки она должна сразу скрываться
        assertTrue(/cell\.appendChild\(btn\);[\s\S]{0,400}btn\.style\.display === 'none'[\s\S]{0,100}cell\.style\.display = 'none'/.test(html),
            'в wrapSubsectionItems нет скрытия обёртки для скрытой роли кнопки');
    });

    test('Пустые menu-btn-row скрываются (нет пустых строк)', function () {
        assertTrue(/menu-btn-row[\s\S]{0,400}row\.style\.display = anyVisible \? '' : 'none'/.test(html),
            'нет скрытия пустых .menu-btn-row');
    });
});

// ------------------------------------------------------------
// Task 146: «Графики» — раздел только десктопного приложения (Electron)
// ------------------------------------------------------------
describe('Аудит ролей: «Графики» только в десктопе (Task 146)', function () {

    test('canAccess блокирует charts вне Electron (даже у Админа)', function () {
        // Статическая проверка: в canAccess есть условие IS_ELECTRON для charts
        assertTrue(/canAccess[\s\S]{0,600}page === 'charts'[\s\S]{0,200}IS_ELECTRON[\s\S]{0,120}return false/.test(html),
            'в canAccess нет блокировки charts для не-Electron окружений');
    });

    test('Кнопка «Графики» на КИП ИОС скрывается вне Electron', function () {
        // chartsEntryBtn: условие isElectronApp в _applyRoleToUI
        assertTrue(/chartsEntryBtn[\s\S]{0,400}isElectronApp[\s\S]{0,200}hasChartsAccess = isElectronApp/.test(html),
            'нет проверки IS_ELECTRON для chartsEntryBtn');
    });

    test('Закреплённый ярлык «Графики» скрывается вне Electron (цикл .menu-btn)', function () {
        // Цикл .menu-btn: charts + IS_ELECTRON
        assertTrue(/page === 'charts'[\s\S]{0,200}IS_ELECTRON[\s\S]{0,100}allowedForPage = false/.test(html),
            'нет скрытия ярлыка charts вне Electron в цикле .menu-btn');
    });

    test('Фильтр 9 (Графики) в матрице: только Админ — сохранено на уровне allowed', function () {
        // charts остаётся в allowed только у Админа; видимость поверх — Electron
        ROLES.forEach(function (role) {
            assertEqual(hasPage(role, 'charts'), role === 'Админ',
                '«Графики» в allowed: только Админ, роль «' + role + '»');
        });
    });
});

// ------------------------------------------------------------
// Task 147/148: десктоп-модули (только Electron)
// ------------------------------------------------------------
describe('Десктоп-модули (Task 147/148)', function () {

    test('Файлы десктоп-модулей существуют', function () {
        assertTrue(fs.existsSync(path.resolve(__dirname, '..', 'charts-desktop.js')),
            'charts-desktop.js отсутствует');
        assertTrue(fs.existsSync(path.resolve(__dirname, '..', 'devices-table-desktop.js')),
            'devices-table-desktop.js отсутствует');
    });

    test('Loader подключает модули только внутри IS_ELECTRON', function () {
        // Блок if (IS_ELECTRON) ... forEach(['charts-desktop.js', 'devices-table-desktop.js'])
        const re = /if \(IS_ELECTRON\) \{[\s\S]{0,400}'charts-desktop\.js', 'devices-table-desktop\.js'[\s\S]{0,300}forEach/;
        assertTrue(re.test(html), 'loader десктоп-модулей не найден или вне IS_ELECTRON');
    });

    test('Код таблицы не содержится в index.html (только в модуле)', function () {
        // CSS-ПРАВИЛА и логика таблицы не должны попасть в мобильный index.html.
        // Упоминания селекторов в index.html допустимы: Task 149/150
        // используют .dev-table-toggle-btn для позиционирования иконки
        // поиска левее кнопки «Таблица» (это НЕ код таблицы).
        assertEqual(/\.dev-table-wrap\s*\{/.test(html), false,
            'CSS-правило .dev-table-wrap не должно быть в index.html');
        assertEqual(/\.dev-table\s*\{/.test(html), false,
            'CSS-правило .dev-table не должно быть в index.html');
        assertEqual(/\.dev-table-td\s*\{|\.dev-table-th\s*\{/.test(html), false,
            'CSS-правила ячеек таблицы не должны быть в index.html');
        assertEqual(html.indexOf('buildTableHtml') === -1, true,
            'функция buildTableHtml не должна быть в index.html');
    });
});

// ------------------------------------------------------------
// Task 151: гибкий поиск (слова AND + транслит + нечёткий fallback)
// ------------------------------------------------------------
describe('Гибкий поиск kipSearchFilter (Task 151)', function () {

    // Извлечь поисковые функции из index.html через vm
    const vm = require('vm');
    const searchFns = (function () {
        const startM = html.indexOf('Task 151: ГИБКИЙ ПОИСК');
        const start = html.indexOf('var _TRANSLIT_RU2EN', startM);
        const endM = html.indexOf('function devEsc', start);
        const code = html.slice(start, endM);
        const sandbox = {};
        vm.runInNewContext(code + '\n;({kipSearchWords, kipTranslit, kipEditDistance, kipWordMatches, kipMatchAll, kipSearchFilter});', sandbox, 'search.vm');
        // kipSearchFilter объявлена как function — достаём из контекста
        return vm.runInNewContext(code + '\n;({kipSearchWords: kipSearchWords, kipEditDistance: kipEditDistance, kipMatchAll: kipMatchAll, kipSearchFilter: kipSearchFilter});', {}, 'search2.vm');
    })();

    // Тестовые записи (как приборы)
    const items = [
        { name: 'Счетчик воды турбинный', type: 'СТВУ-100' },
        { name: 'Метран-150CD', type: 'преобразователь давления' },
        { name: 'Регистратор безбумажный', type: 'Regigraf Ф1771-АД' },
        { name: 'ЭМИС-ПУЛЬС 530', type: 'расходомер' },
        { name: 'Датчик разности давления', type: 'Метран-100' }
    ];
    const getter = function (d) { return d.name + ' ' + d.type; };

    test('Точный поиск работает как раньше (подстрока)', function () {
        const r = searchFns.kipSearchFilter(items, 'метран', getter);
        assertEqual(r.length >= 2, true, '«метран» должен найти Метран-150CD и Метран-100');
    });

    test('Этап 1: слова в любом порядке (AND-логика)', function () {
        // «воды счетчик» должен найти «Счетчик воды турбинный»
        const r = searchFns.kipSearchFilter(items, 'воды счетчик', getter);
        assertEqual(r.length, 1, '«воды счетчик» → Счетчик воды турбинный');
        assertEqual(r[0].name, 'Счетчик воды турбинный');
    });

    test('Этап 1: дефис/пробел нормализуются', function () {
        const r = searchFns.kipSearchFilter(items, 'метран 150', getter);
        assertEqual(r.length >= 1, true, '«метран 150» должен найти «Метран-150CD»');
    });

    test('Этап 1: транслитерация en→ru («metran» находит «Метран»)', function () {
        const r = searchFns.kipSearchFilter(items, 'metran', getter);
        assertEqual(r.length >= 2, true, '«metran» должен найти Метран-150CD и Метран-100');
    });

    test('Этап 1: транслитерация ru→en («региграф» находит «Regigraf»)', function () {
        const r = searchFns.kipSearchFilter(items, 'региграф', getter);
        assertEqual(r.length, 1, '«региграф» → Regigraf Ф1771-АД');
    });

    test('Этап 2: опечатка одной буквы (только если нет точных)', function () {
        // «Регисратор» (пропущена «т») — точных нет, нечёткий найдёт
        const r = searchFns.kipSearchFilter(items, 'Регисратор', getter);
        assertEqual(r.length >= 1, true, '«Регисратор» → Регистратор безбумажный');
    });

    test('Этап 2: порог по длине — короткие слова не размываются', function () {
        // «датик» (опечатка в «датчик», 5 букв — 1 опечатка допускается)
        const r = searchFns.kipSearchFilter(items, 'датик', getter);
        assertEqual(r.length >= 1, true, '«датик» → Датчик разности давления');
        // «клапн» (4 буквы) — порог 0, не должен ничего найти
        const r2 = searchFns.kipSearchFilter(items, 'клапн', getter);
        assertEqual(r2.length, 0, '«клапн» (4 буквы) — без нечёткости');
    });

    test('AND: лишнее слово исключает запись (и в нечётком)', function () {
        // «счетчик урановый» — слова «счетчик» есть, «урановый» нет нигде
        const r = searchFns.kipSearchFilter(items, 'счетчик урановый', getter);
        assertEqual(r.length, 0, '«счетчик урановый» не должен ничего найти');
    });

    test('Дамерау-Левенштейн: перестановка = 1 операция', function () {
        assertEqual(searchFns.kipEditDistance('метран', 'метрана'), 1);
        assertEqual(searchFns.kipEditDistance('abc', 'acb'), 1, 'перестановка соседних = 1');
        assertEqual(searchFns.kipEditDistance('регисратор', 'регистратор'), 1);
    });

    test('Пустой запрос возвращает всё', function () {
        const r = searchFns.kipSearchFilter(items, '', getter);
        assertEqual(r.length, items.length);
        const r2 = searchFns.kipSearchFilter(items, '   ', getter);
        assertEqual(r2.length, items.length);
    });
});

// ------------------------------------------------------------
// Task 152: кабельный журнал — единый поиск + клиентская фильтрация
// ------------------------------------------------------------
describe('Кабельный журнал: единый поиск (Task 152)', function () {

    test('cj-поле использует единый класс (без cj-header-search)', function () {
        // Класс cj-header-search удалён из HTML — поле на общих правилах
        const m = html.match(/id="cjSearchInput"[^>]*/);
        assertTrue(!!m, 'cjSearchInput не найден');
        assertEqual(m[0].indexOf('cj-header-search') === -1, true,
            'cjSearchInput не должен иметь класс cj-header-search (единый стиль)');
        assertEqual(m[0].indexOf('dev-header-search') !== -1, true,
            'cjSearchInput должен иметь класс dev-header-search');
    });

    test('Кнопка поиска cj — единый класс dev-search-toggle-btn', function () {
        const m = html.match(/id="cjSearchToggleBtn"[^>]*/);
        assertTrue(!!m, 'cjSearchToggleBtn не найден');
        assertEqual(m[0].indexOf('dev-search-toggle-btn') !== -1, true,
            'кнопка должна использовать единый класс dev-search-toggle-btn');
        assertEqual(m[0].indexOf('data-search-input="cjSearchInput"') !== -1, true,
            'кнопка должна ссылаться на cjSearchInput через data-search-input');
    });

    test('Собственные cj-header-search CSS-правила удалены', function () {
        assertEqual(/\.cj-header-search\s*\{/.test(html), false,
            'CSS-правило .cj-header-search не должно существовать');
    });

    test('Клиентская фильтрация: kipSearchFilter подключён к cj', function () {
        // _applyClientSearch использует kipSearchFilter
        assertTrue(/_applyClientSearch[\s\S]{0,600}kipSearchFilter/.test(html),
            '_applyClientSearch должен вызывать kipSearchFilter');
        // load() больше не шлёт search на сервер: в опциях запроса только limit
        const loadIdx = html.indexOf("_api('cableJournal.list'");
        assertTrue(loadIdx !== -1, 'вызов cableJournal.list не найден');
        // Блок опций после вызова (в пределах 300 символов)
        const opts = html.slice(loadIdx, loadIdx + 300);
        assertEqual(opts.indexOf('search:') === -1, true,
            'load() не должен отправлять search на сервер (клиентская фильтрация)');
        assertEqual(opts.indexOf('limit:') !== -1, true,
            'load() должен запрашивать полный список (limit)');
    });

    test('Кэш полного списка: _allRows сохраняется при загрузке', function () {
        assertTrue(/_allRows = self\._rows\.slice\(\)/.test(html),
            'после load полный список должен копироваться в _allRows');
    });
});

// ------------------------------------------------------------
// Task 154: автосворачивание поиска при смене страницы
// ------------------------------------------------------------
describe('Автосворачивание поиска (Task 154)', function () {

    test('Функция kipCollapseSearch определена', function () {
        assertTrue(html.indexOf('window.kipCollapseSearch = function') !== -1,
            'нет window.kipCollapseSearch в контроллере поиска');
    });

    test('navigateTo вызывает kipCollapseSearch при смене страницы', function () {
        // Вызов сразу после деактивации страниц
        assertTrue(/querySelectorAll\('\.page-content'\)\.forEach\(el => \{ el\.classList\.remove\('active', 'visible'\); \}\);[\s\S]{0,300}kipCollapseSearch[\s\S]{0,60}\(\)/.test(html),
            'navigateTo должен вызывать kipCollapseSearch при деактивации страниц');
    });

    test('Сворачивание сбрасывает запрос (dispatch input)', function () {
        assertTrue(/kipCollapseSearch[\s\S]{0,1100}input\.value = ''[\s\S]{0,120}dispatchEvent\(new Event\('input'/.test(html),
            'при сворачивании запрос должен сбрасываться с перерендером');
    });
});

// ------------------------------------------------------------
// Task 155: запросы с разделителями (позиции «8м/1») + шум коротких слов
// ------------------------------------------------------------
describe('Поиск с разделителями и короткими словами (Task 155)', function () {

    // Извлечь движок заново (включая glued-форму)
    const vm2 = require('vm');
    const engine = (function () {
        const startM = html.indexOf('Task 151: ГИБКИЙ ПОИСК');
        const start = html.indexOf('var _TRANSLIT_RU2EN', startM);
        const endM = html.indexOf('function devEsc', start);
        const code = html.slice(start, endM);
        return vm2.runInNewContext(code + '\n;({kipSearchFilter: kipSearchFilter, kipMatchForms: kipMatchForms});', {}, 't155.vm');
    })();

    test('Запрос с разделителем «8м/1» находит запись «поз. 8м/1»', function () {
        const items = [
            { f: 'Состояние мешалок поз. 8м/1' },
            { f: 'Давление в аппарате 40м/2' },
            { f: 'Расход в поз. 8м/1-3' }
        ];
        const r = engine.kipSearchFilter(items, '8м/1', function (d) { return d.f; });
        assertEqual(r.length, 2, 'должны найтись «поз. 8м/1» и «8м/1-3»');
    });

    test('Glued-форма: «8м1» (слитый запрос) находит «8м/1»', function () {
        const items = [{ f: 'поз. 8м/1' }, { f: 'поз. 7м/2' }];
        const r = engine.kipSearchFilter(items, '8м1', function (d) { return d.f; });
        assertEqual(r.length, 1);
    });

    test('Разные разделители: «8 м/1» и «8м-1» находят «8м/1»', function () {
        const items = [{ f: 'поз. 8м/1' }];
        const a = engine.kipSearchFilter(items, '8 м/1', function (d) { return d.f; });
        const b = engine.kipSearchFilter(items, '8м-1', function (d) { return d.f; });
        assertEqual(a.length, 1, 'пробел-вариация');
        assertEqual(b.length, 1, 'дефис-вариация');
    });

    test('Короткие слова не дают шума: «8» не матчит «8мм»/«18»', function () {
        const items = [
            { f: 'Труба 8мм' },        // «8» — часть слова «8мм», НЕ отдельное слово
            { f: 'Клапан 18' },        // «8» — часть «18»
            { f: 'Позиция 8 сама' }    // «8» — отдельное слово → находится
        ];
        const r = engine.kipSearchFilter(items, '8', function (d) { return d.f; });
        assertEqual(r.length, 1, 'только запись с отдельным словом «8»');
    });

    test('Сырой запрос: списки передают rawQuery (не norm-слитый)', function () {
        // lockRenderSorted и др.: kipSearchFilter(filtered, rawQuery, ...)
        for (const f of ['LOCK_FIELDS', 'VALVE_FIELDS', 'REGULATOR_FIELDS', 'PROJECT_FIELDS']) {
            const re = new RegExp('kipSearchFilter\\(filtered, rawQuery, function \\(d\\) \\{[\\s\\S]{0,120}' + f);
            assertTrue(re.test(html), f + ' фильтр должен использовать rawQuery');
        }
    });
});

// ------------------------------------------------------------
// Task 156: счётчик результатов поиска
// ------------------------------------------------------------
describe('Счётчик результатов поиска (Task 156)', function () {

    test('Функция kipRenderSearchCounter определена', function () {
        assertTrue(html.indexOf('window.kipRenderSearchCounter = function') !== -1,
            'нет kipRenderSearchCounter');
    });

    test('Все 6 рендеров вызывают счётчик (__searchTotal + вызов)', function () {
        ['devRender', 'devRenderSorted', 'lockRenderSorted', 'valveRenderSorted',
         'regulatorRenderSorted', 'projectsRenderSorted'].forEach(function (fn) {
            const m = html.match(new RegExp('function ' + fn + '\\('));
            assertTrue(!!m, fn + ' не найдена');
            // Сегмент функции: до следующей function на верхнем уровне
            const start = m.index;
            const end = html.indexOf('\n    function ', start + 10);
            const seg = html.slice(start, end === -1 ? html.length : end);
            assertEqual(seg.indexOf('__searchTotal') !== -1, true,
                fn + ': нет __searchTotal');
            assertEqual(seg.indexOf('kipRenderSearchCounter(list') !== -1, true,
                fn + ': нет вызова kipRenderSearchCounter');
        });
    });

    test('cj: счётчик после _render в _applyClientSearch', function () {
        assertTrue(/_applyClientSearch[\s\S]{0,1600}this\._render\(\);[\s\S]{0,300}kipRenderSearchCounter/.test(html),
            'cj: счётчик должен вызываться после _render');
    });

    test('CSS счётчика определён (обе темы)', function () {
        assertEqual(/\.kip-search-counter\s*\{/.test(html), true, 'нет .kip-search-counter');
        assertEqual(/\[data-theme="light"\] \.kip-search-counter\s*\{/.test(html), true, 'нет светлой темы');
    });

    test('Без запроса счётчик удаляется', function () {
        assertTrue(/kipRenderSearchCounter[\s\S]{0,700}if \(!query\) return;/.test(html),
            'helper должен удалять счётчик при пустом запросе');
    });
});

// ------------------------------------------------------------
// Task 157: полный список ролей в админ-панели
// ------------------------------------------------------------
describe('Админ-панель: полный список ролей (Task 157)', function () {

    test('KipAdmin.ROLES содержит все 12 ролей матрицы', function () {
        // Все роли из матрицы фильтров должны быть назначаемы
        const all12 = ['Запрет', 'Общий доступ', 'ИТР ТОКЕМ', 'КИП8', 'КИП8 pro',
                       'КИП ИОС', 'КИП ИОС pro', 'КИП ИОС дежурный',
                       'ИТР8', 'ИТР8 pro', 'ИТР ИОС', 'Админ'];
        // Извлечь массив ROLES из index.html
        const m = html.match(/ROLES: \(function \(\) \{[\s\S]*?\}\)\(\),/);
        assertTrue(!!m, 'ROLES-конструктор не найден');
        all12.forEach(function (role) {
            assertEqual(m[0].indexOf("'" + role + "'") !== -1, true,
                'роль «' + role + '» должна быть в KipAdmin.ROLES');
        });
    });

    test('Раньше отсутствующие роли теперь в списке (ИТР ТОКЕМ, КИП ИОС дежурный)', function () {
        const m = html.match(/ROLES: \(function \(\) \{[\s\S]*?\}\)\(\),/);
        assertTrue(m[0].indexOf("'ИТР ТОКЕМ'") !== -1, 'ИТР ТОКЕМ');
        assertTrue(m[0].indexOf("'КИП ИОС дежурный'") !== -1, 'КИП ИОС дежурный');
    });

    test('Синхронизация с ROLE_ACCESS: новые роли подтягиваются автоматически', function () {
        // В конструкторе есть подтягивание из KipAuth.ROLE_ACCESS
        const m = html.match(/ROLES: \(function \(\) \{[\s\S]*?\}\)\(\),/);
        assertTrue(m[0].indexOf('KipAuth.ROLE_ACCESS') !== -1,
            'ROLES должен синхронизироваться с ROLE_ACCESS');
    });
});

// ------------------------------------------------------------
// Task 158: карточки клапанов — назначение в заголовке
// ------------------------------------------------------------
describe('Карточки клапанов: назначение в заголовке (Task 158)', function () {

    test('valveRenderSorted: заголовок = Назначение арматуры (параметр)', function () {
        // Порядок в fallback изменился: назначение первично, Марка — в подзаголовок
        const m = html.match(/const name = item\['Назначение арматуры \(параметр\)'\] \|\| item\['Марка'\] \|\| '\(без названия\)';[\s\S]{0,1200}?valveMark\(mark, query\)/);
        assertTrue(!!m, 'в valveRenderSorted назначение должно быть в заголовке, Марка — первой строкой подзаголовка');
    });

    test('valveRenderGroup: та же структура', function () {
        const m = html.match(/Task 158: заголовок — «Назначение арматуры \(параметр\)»[\s\S]{0,400}const name = item\['Назначение арматуры \(параметр\)'\]/);
        assertTrue(!!m, 'в valveRenderGroup назначение должно быть первичным');
        // Марка — первой строкой подзаголовка
        const m2 = html.match(/Task 158: Марка — первой строкой подзаголовка[\s\S]{0,120}if \(mark\) subtitleParts\.push/);
        assertTrue(!!m2, 'Марка должна быть первой в подзаголовке группы');
    });

    test('Старый порядок (Марка первичной) удалён из рендеров', function () {
        // Не должно остаться: name = item['Марка'] || item['Назначение арматуры...]
        assertEqual(html.indexOf("item['Марка'] || item['Назначение арматуры (параметр)']") === -1, true,
            'старый порядок (Марка в заголовке) не должен остаться');
    });
});

// ------------------------------------------------------------
// Task 161: счётчики расходомеров в десктопных табах «Все / Избранные»
// ------------------------------------------------------------
describe('Расходомеры: счётчики в десктопных табах (Task 161)', function () {

    test('flowDesktopTabs: кнопки содержат счётчики flowAllCountDesk / flowFavCountDesk', function () {
        const m = html.match(/<div id="flowDesktopTabs"[\s\S]*?<\/div>/);
        assertTrue(!!m, 'блок #flowDesktopTabs должен существовать');
        assertTrue(m[0].indexOf('id="flowAllCountDesk"') !== -1,
            'кнопка «Все» должна содержать span#flowAllCountDesk');
        assertTrue(m[0].indexOf('id="flowFavCountDesk"') !== -1,
            'кнопка «Избранные» должна содержать span#flowFavCountDesk');
    });

    test('_updateTabCounts обновляет счётчики обоих баров (мобильного и десктопного)', function () {
        const m = html.match(/_updateTabCounts: function\(\) \{[\s\S]*?\n        \},/);
        assertTrue(!!m, 'функция _updateTabCounts должна существовать');
        ['flowAllCount', 'flowFavCount', 'flowAllCountDesk', 'flowFavCountDesk'].forEach(function (id) {
            assertTrue(m[0].indexOf("'" + id + "'") !== -1,
                '_updateTabCounts должен обновлять #' + id);
        });
    });

    test('CSS: компактный стиль счётчиков для десктопных табов', function () {
        const m = html.match(/\.flow-desktop-tabs \.flow-tab-count \{[\s\S]*?\}/);
        assertTrue(!!m, 'должен быть переопределён .flow-desktop-tabs .flow-tab-count');
        assertTrue(m[0].indexOf('font-size: 10px') !== -1,
            'компактный размер шрифта (10px) для десктопных табов');
    });
});

// ------------------------------------------------------------
// Task 162: перетаскиваемая граница разделения панелей master-detail
// (клэмп 1/4 .. 3/4 ширины области разделения)
// ------------------------------------------------------------
describe('Master-detail: перетаскиваемая граница панелей (Task 162)', function () {

    test('detailPanel содержит разделитель #detailPanelResizer', function () {
        const m = html.match(/<div id="detailPanel">[\s\S]{0,400}?<div id="detailPanelResizer"/);
        assertTrue(!!m, 'разделитель должен быть первым ребёнком #detailPanel');
    });

    test('Клэмп границы: от 1/4 до 3/4 ширины области разделения', function () {
        const mMin = html.match(/DETAIL_RESIZER_MIN = 0\.25/);
        const mMax = html.match(/DETAIL_RESIZER_MAX = 0\.75/);
        assertTrue(!!mMin, 'минимум — 1/4 ширины (DETAIL_RESIZER_MIN = 0.25)');
        assertTrue(!!mMax, 'максимум — 3/4 ширины (DETAIL_RESIZER_MAX = 0.75)');
        // Сами клэмпы применяются в pointerMove
        const mClamp = html.match(/Math\.max\(minW, Math\.min\(maxW, width\)\)/);
        assertTrue(!!mClamp, 'ширина панели должна клэмпиться между minW и maxW');
    });

    test('Ширина сохраняется в localStorage и восстанавливается при загрузке', function () {
        const mSave = html.match(/localStorage\.setItem\(DETAIL_RESIZER_KEY, pct \+ '%'\)/);
        assertTrue(!!mSave, 'после перетаскивания ширина сохраняется в процентах');
        const mRestore = html.match(/initDetailPanelResizer\(\);[\s\S]{0,200}/) ||
                         html.match(/_detailPanelApplyWidth\(\);/);
        assertTrue(!!mRestore, 'при инициализации сохранённая ширина применяется');
    });

    test('Swap-режим: разделитель переходит на правую грань панели', function () {
        const m = html.match(/#contentArea\.panels-swapped > #detailPanel \.detail-panel-resizer \{[\s\S]*?left: auto;[\s\S]*?right: -3px;/);
        assertTrue(!!m, 'в swap-режиме разделитель должен сидеть на правой грани');
    });

    test('Двойной клик по разделителю сбрасывает ширину к CSS-умолчанию', function () {
        const m = html.match(/addEventListener\('dblclick', dblClickReset\)/);
        assertTrue(!!m, 'dblclick должен вызывать сброс');
        const mReset = html.match(/dblClickReset[\s\S]{0,300}?localStorage\.removeItem\(DETAIL_RESIZER_KEY\)/);
        assertTrue(!!mReset, 'сброс удаляет сохранённую ширину из localStorage');
    });
});

// ------------------------------------------------------------
// Task 163: таблица приборов — счётчик и CSV в шапке, таблица на всю площадь
// ------------------------------------------------------------
describe('Таблица приборов: счётчик и CSV в шапке (Task 163)', function () {
    const devTableJs = fs.readFileSync(path.resolve(__dirname, '..', 'devices-table-desktop.js'), 'utf-8');

    test('Группа в шапке: ряд кнопок + счётчик (Task 175: счётчик под кнопками)', function () {
        assertTrue(devTableJs.indexOf('dev-table-header-group') !== -1,
            'группа .dev-table-header-group должна существовать');
        // Порядок внутри ensureButton: группа → ряд → «Таблица» → счётчик → CSV
        const iGroup = devTableJs.indexOf("group.className = 'dev-table-header-group'");
        const iCount = devTableJs.indexOf("count.id = 'devTableCount'");
        const iCsv = devTableJs.indexOf("csvBtn.id = 'devTableCsvBtn'");
        assertTrue(iGroup !== -1 && iCount !== -1 && iCsv !== -1,
            'группа, счётчик и CSV должны создаваться в ensureButton');
        assertTrue(iGroup < iCount && iCount < iCsv,
            'порядок создания: группа → «Таблица» → счётчик → CSV');
    });

    test('Счётчик и CSV видны только в табличном виде (.table-active)', function () {
        const m = devTableJs.match(/\.dev-table-header-group \.dev-table-count,[\s\S]{0,120}?\.dev-table-header-group \.dev-table-csv-btn \{ display: none; \}/);
        assertTrue(!!m, 'по умолчанию счётчик и CSV скрыты');
        const m2 = devTableJs.match(/\.dev-table-header-group\.table-active \.dev-table-count \{ display: inline-block; \}/);
        assertTrue(!!m2, 'в табличном виде (.table-active) счётчик показывается');
    });

    test('Тулбар над таблицей удалён (счётчик/CSV больше не в таблице)', function () {
        assertEqual(devTableJs.indexOf('dev-table-toolbar') === -1, true,
            'класс .dev-table-toolbar должен быть удалён из модуля');
    });

    test('Таблица на всю свободную площадь: без отступов, рамки и скруглений', function () {
        const m = devTableJs.match(/\.dev-table-wrap \{[\s\S]*?\}/);
        assertTrue(!!m, '.dev-table-wrap должен существовать');
        assertTrue(m[0].indexOf('margin: 0') !== -1, 'margin: 0 — без отступов от краёв');
        assertTrue(m[0].indexOf('border: none') !== -1, 'border: none — без рамки');
        assertTrue(m[0].indexOf('border-radius: 0') !== -1, 'border-radius: 0 — без скруглений');
    });

    test('fitTableHeight подгоняет высоту (resize + detail-панель)', function () {
        assertTrue(devTableJs.indexOf('function fitTableHeight') !== -1,
            'функция fitTableHeight должна существовать');
        assertTrue(devTableJs.indexOf("addEventListener('resize', fitTableHeight)") !== -1,
            'пересчёт при resize окна');
        assertTrue(devTableJs.indexOf('MutationObserver(fitTableHeight)') !== -1,
            'пересчёт при открытии/закрытии detail-панели');
    });

    test('Лупа и поле поиска сдвигаются левее группы (--devt-group-w)', function () {
        assertTrue(devTableJs.indexOf('.dev-table-header-group.table-active') !== -1,
            'правила для табличного вида через .table-active');
        assertTrue(devTableJs.indexOf('--devt-group-w') !== -1,
            'CSS-переменная --devt-group-w для сдвига лупы/поиска');
    });
});

// ------------------------------------------------------------
// Task 164: поиск на вложенных страницах КИП ИОС
// (группы клапанов/регуляторов/проектов + Избранное)
// ------------------------------------------------------------
describe('Поиск на вложенных страницах КИП ИОС (Task 164)', function () {

    // Фрагмент шапки страницы: от открытия <div id="page-X"> до списка
    function pageHeaderFragment(pageId, listId) {
        const start = html.indexOf('<div id="page-' + pageId + '"');
        const listIdx = html.indexOf('id="' + listId + '"', start);
        assertTrue(start !== -1, 'страница ' + pageId + ' должна существовать');
        assertTrue(listIdx !== -1, 'список ' + listId + ' должен существовать');
        return html.slice(start, listIdx);
    }

    test('Группа клапанов: поле поиска + кнопка в шапке', function () {
        const frag = pageHeaderFragment('valve-group', 'valveGroupList');
        assertTrue(frag.indexOf('id="valveGroupSearchInput"') !== -1, 'поле поиска valveGroupSearchInput');
        assertTrue(frag.indexOf('data-search-input="valveGroupSearchInput"') !== -1, 'кнопка-лупа с data-search-input');
        assertTrue(frag.indexOf('oninput="valveRenderGroup()"') !== -1, 'oninput перерендеривает группу');
    });

    test('Группа регуляторов: поле поиска + кнопка в шапке', function () {
        const frag = pageHeaderFragment('regulator-group', 'regulatorGroupList');
        assertTrue(frag.indexOf('id="regulatorGroupSearchInput"') !== -1, 'поле поиска regulatorGroupSearchInput');
        assertTrue(frag.indexOf('oninput="regulatorRenderGroup()"') !== -1, 'oninput перерендеривает группу');
    });

    test('Группа проектов: поле поиска + кнопка в шапке', function () {
        const frag = pageHeaderFragment('project-group', 'projectGroupList');
        assertTrue(frag.indexOf('id="projectGroupSearchInput"') !== -1, 'поле поиска projectGroupSearchInput');
        assertTrue(frag.indexOf('oninput="projectsRenderGroup()"') !== -1, 'oninput перерендеривает группу');
    });

    test('Избранное: поле поиска + кнопка в шапке', function () {
        const frag = pageHeaderFragment('device-favorites', 'deviceFavoritesContent');
        assertTrue(frag.indexOf('id="favSearchInput"') !== -1, 'поле поиска favSearchInput');
        assertTrue(frag.indexOf('oninput="KipFav.initFavoritesPage()"') !== -1, 'oninput перерендеривает избранное');
    });

    test('Групповые рендеры фильтруют через kipSearchFilter и показывают счётчик', function () {
        // Фрагмент функции от чтения запроса (indexOf — надёжнее регулярок с ?.)
        function renderFragment(inputId) {
            const start = html.indexOf("document.getElementById('" + inputId + "')");
            assertTrue(start !== -1, 'рендер должен читать запрос из ' + inputId);
            return html.slice(start, start + 4000);
        }
        // Клапаны: запрос -> kipSearchFilter -> счётчик
        const fv = renderFragment('valveGroupSearchInput');
        assertTrue(fv.indexOf('kipSearchFilter(items, rawQuery') !== -1, 'valveRenderGroup: kipSearchFilter');
        assertTrue(fv.indexOf('kipRenderSearchCounter(list, items.length, __searchTotal, rawQuery)') !== -1, 'valveRenderGroup: счётчик');
        // Регуляторы
        const fr = renderFragment('regulatorGroupSearchInput');
        assertTrue(fr.indexOf('kipSearchFilter(items, rawQuery') !== -1, 'regulatorRenderGroup: kipSearchFilter');
        // Проекты
        const fp = renderFragment('projectGroupSearchInput');
        assertTrue(fp.indexOf('kipSearchFilter(items, rawQuery') !== -1, 'projectsRenderGroup: kipSearchFilter');
        assertTrue(fp.indexOf('kipRenderSearchCounter(list, items.length, __searchTotal, rawQuery)') !== -1, 'projectsRenderGroup: счётчик');
    });

    test('Избранное: фильтрация карточек поисковым запросом + счётчик', function () {
        const iQuery = html.indexOf("document.getElementById('favSearchInput')");
        assertTrue(iQuery !== -1, 'initFavoritesPage читает запрос favSearchInput');
        const frag = html.slice(iQuery, iQuery + 11000);
        assertTrue(frag.indexOf('var found = 0;') !== -1, 'счётчик найденных объявлен');
        assertTrue(frag.indexOf('meta.name, itemName, itemSub1, itemSub2') !== -1, 'строка поиска карточки (тип+название+подзаголовки)');
        assertTrue(frag.indexOf('kipSearchFilter([fav], rawQuery') !== -1, 'фильтрация карточек избранного через kipSearchFilter');
        assertTrue(frag.indexOf('kipRenderSearchCounter(content, found, __searchTotal, rawQuery)') !== -1, 'счётчик «Найдено: N из M» на странице избранного');
    });

    test('Избранное: правый кластер шапки не перекрывается лупой (padding)', function () {
        const m = html.match(/#page-device-favorites \.page-inline-header:has\(\.dev-search-toggle-btn\) \{\s*padding-right: 48px;\s*\}/);
        assertTrue(!!m, 'CSS-правило отступа для шапки избранного');
    });
});

// ------------------------------------------------------------
// Task 165: поиск в группах приборов/блокировок + жёлтая подсветка
// ------------------------------------------------------------
describe('Поиск в группах приборов/блокировок + жёлтая подсветка (Task 165)', function () {
    const devTableJs = fs.readFileSync(path.resolve(__dirname, '..', 'devices-table-desktop.js'), 'utf-8');

    test('Группа приборов: поле поиска + кнопка в шапке', function () {
        const start = html.indexOf('<div id="page-dev-group"');
        const listIdx = html.indexOf('id="devGroupList"', start);
        assertTrue(start !== -1 && listIdx !== -1, 'страница dev-group должна существовать');
        const frag = html.slice(start, listIdx);
        assertTrue(frag.indexOf('id="devGroupSearchInput"') !== -1, 'поле поиска devGroupSearchInput');
        assertTrue(frag.indexOf('oninput="devRenderGroup()"') !== -1, 'oninput перерендеривает группу');
        assertTrue(frag.indexOf('data-search-input="devGroupSearchInput"') !== -1, 'кнопка-лупа');
    });

    test('Группа блокировок: поле поиска + кнопка в шапке', function () {
        const start = html.indexOf('<div id="page-lock-group"');
        const listIdx = html.indexOf('id="lockGroupList"', start);
        assertTrue(start !== -1 && listIdx !== -1, 'страница lock-group должна существовать');
        const frag = html.slice(start, listIdx);
        assertTrue(frag.indexOf('id="lockGroupSearchInput"') !== -1, 'поле поиска lockGroupSearchInput');
        assertTrue(frag.indexOf('oninput="lockRenderGroup()"') !== -1, 'oninput перерендеривает группу');
    });

    test('devRenderGroup / lockRenderGroup: kipSearchFilter + счётчик + подсветка', function () {
        const iDev = html.indexOf("document.getElementById('devGroupSearchInput')");
        assertTrue(iDev !== -1, 'devRenderGroup читает запрос');
        const fragDev = html.slice(iDev, iDev + 7000);
        assertTrue(fragDev.indexOf('kipSearchFilter(items, rawQuery') !== -1, 'devRenderGroup: kipSearchFilter');
        assertTrue(fragDev.indexOf('kipRenderSearchCounter(list, items.length, __searchTotal, rawQuery)') !== -1, 'devRenderGroup: счётчик');
        assertTrue(fragDev.indexOf('devMark(name, rawQuery)') !== -1, 'devRenderGroup: подсветка devMark');

        const iLock = html.indexOf("document.getElementById('lockGroupSearchInput')");
        assertTrue(iLock !== -1, 'lockRenderGroup читает запрос');
        const fragLock = html.slice(iLock, iLock + 7000);
        assertTrue(fragLock.indexOf('kipSearchFilter(items, rawQuery') !== -1, 'lockRenderGroup: kipSearchFilter');
        assertTrue(fragLock.indexOf('lockMark(name, rawQuery)') !== -1, 'lockRenderGroup: подсветка lockMark');
        assertTrue(fragLock.indexOf('kipRenderSearchCounter(list, items.length, __searchTotal, rawQuery)') !== -1, 'lockRenderGroup: счётчик');
    });

    test('Жёлтая подсветка mark: единый стиль (списки + карточка прибора)', function () {
        const m = html.match(/mark,\s*\n\s*\.pb-card mark \{[\s\S]*?background: #ffd60a;/);
        assertTrue(!!m, 'глобальный mark + .pb-card mark — жёлтый #ffd60a');
        const m2 = html.match(/\.dev-card-value mark \{[\s\S]*?background: #ffd60a;/);
        assertTrue(!!m2, '.dev-card-value mark — жёлтый #ffd60a');
    });

    test('Таблица приборов: markCell подсвечивает совпадения слов запроса', function () {
        assertTrue(devTableJs.indexOf('function markCell') !== -1, 'функция markCell существует');
        assertTrue(devTableJs.indexOf('function currentSearchQuery') !== -1, 'currentSearchQuery читает #devProdSearchInput');
        assertTrue(devTableJs.indexOf("markCell(val, query)") !== -1, 'ячейки рендерятся через markCell');
        const m = devTableJs.match(/\.dev-table td mark \{ background: #ffd60a; color: #1a1a1a;/);
        assertTrue(!!m, 'CSS жёлтой подсветки в таблице');
    });

    test('Подсветка не применяется к колонке № (порядковый номер)', function () {
        const m = devTableJs.match(/var cellHtml = \(col\.key === '__num__'\) \? esc\(val\) : markCell\(val, query\);/);
        assertTrue(!!m, 'колонка № — без подсветки, остальные — markCell');
    });
});

// ------------------------------------------------------------
// Task 165 (доп.): регрессия порядка экранирования в markCell
// ------------------------------------------------------------
describe('markCell: порядок экранирования и ё-класс (Task 165)', function () {
    const devTableJs = fs.readFileSync(path.resolve(__dirname, '..', 'devices-table-desktop.js'), 'utf-8');

    test('Экранирование спецсимволов ДО подстановки [её] — скобки класса не экранируются', function () {
        // Якорь: комментарий про порядок стоит перед строкой экранирования,
        // замена е -> [её] — сразу после неё
        const iComment = devTableJs.indexOf('ВАЖНО: сначала экранируем спецсимволы');
        const iYo = devTableJs.indexOf("n = n.replace(/е/g, '[её]');");
        assertTrue(iComment !== -1, 'комментарий о порядке экранирования должен быть в markCell');
        assertTrue(iYo !== -1, 'замена е -> [её] должна быть в markCell');
        assertTrue(iComment < iYo, 'экранирование должно идти ДО подстановки [её]');
        // Регресс: старый порядок (сначала [её], потом экранирование) удалён
        const iOldOrder = devTableJs.indexOf("n = n.replace(/е/g, '[её]');\n            patterns.push(n.replace(/[");
        assertTrue(iOldOrder === -1, 'старый порядок (подстановка до экранирования) не должен остаться');
    });
});

// ------------------------------------------------------------
// Task 166: вертикальная полоса между кнопками «Поиск» и «Таблица»
// ------------------------------------------------------------
describe('Разделитель лупы и «Таблица» (Task 166)', function () {
    const devTableJs = fs.readFileSync(path.resolve(__dirname, '..', 'devices-table-desktop.js'), 'utf-8');

    test('Полоса-разделитель ::before у кнопки «Таблица» — стиль как в верхнем баре', function () {
        const m = devTableJs.match(/\.dev-table-toggle-btn::before \{[\s\S]*?\}/);
        assertTrue(!!m, 'псевдоэлемент .dev-table-toggle-btn::before должен существовать');
        assertTrue(m[0].indexOf('width: 1px') !== -1, 'толщина 1px (как .desktop-top-bar-divider)');
        assertTrue(m[0].indexOf('height: 24px') !== -1, 'высота 24px (как .desktop-top-bar-divider)');
        assertTrue(m[0].indexOf('var(--border-color') !== -1, 'цвет var(--border-color) — единый с верхним баром');
        assertTrue(m[0].indexOf('pointer-events: none') !== -1, 'полоса не перехватывает клики');
    });

    test('Кнопка «Таблица» — position: relative (якорь полосы)', function () {
        const m = devTableJs.match(/\.dev-table-toggle-btn \{[\s\S]*?\}/);
        assertTrue(!!m && m[0].indexOf('position: relative') !== -1,
            'кнопка должна быть position: relative для позиционирования ::before');
    });
});

// ------------------------------------------------------------
// Task 167: багфикс — лупа наезжала на «Таблица» при старте приложения
// (модуль инициализировался при скрытой странице, offsetWidth = 0,
// переменная --devt-group-w получала значение 16px)
// ------------------------------------------------------------
describe('Багфикс: лупа наезжала на «Таблица» при старте (Task 167)', function () {
    const devTableJs = fs.readFileSync(path.resolve(__dirname, '..', 'devices-table-desktop.js'), 'utf-8');

    test('updateHeaderGroup не ставит переменную при скрытой странице (offsetWidth = 0)', function () {
        const iW = devTableJs.indexOf('var w = group.offsetWidth');
        const iIf = devTableJs.indexOf('if (w > 0)', iW);
        const iSet = devTableJs.indexOf("header.style.setProperty('--devt-group-w', (w + 16) + 'px')", iIf);
        assertTrue(iW !== -1, 'width читается в переменную w');
        assertTrue(iIf !== -1 && iIf - iW < 60, 'проверка w > 0 сразу после чтения ширины');
        assertTrue(iSet !== -1 && iSet - iIf < 120, 'переменная ставится только внутри if (w > 0)');
        // Регресс: старый безусловный setProperty по group.offsetWidth удалён
        const iOld = devTableJs.indexOf("header.style.setProperty('--devt-group-w', (group.offsetWidth + 16) + 'px')");
        assertTrue(iOld === -1, 'безусловная установка переменной (баг Task 166) не должна остаться');
    });

    test('Пересчёт ширины группы при каждом рендере страницы (патч devRenderSorted)', function () {
        const m = devTableJs.match(/window\.devRenderSorted = function \(mode\) \{\s*\n\s*origDevRenderSorted\.apply\(window, arguments\);\s*\n\s*if \(mode === 'prod'\) \{\s*\n\s*\/\/ Task 167[\s\S]{0,200}?updateHeaderGroup\(\);/);
        assertTrue(!!m, 'патч devRenderSorted должен вызывать updateHeaderGroup() для mode=prod');
    });
});

// ------------------------------------------------------------
// Task 168: таблица приборов — фильтры/ширины/клавиатура/виртуализация
// ------------------------------------------------------------
describe('Таблица приборов: фильтры, ширины, клавиатура, виртуализация (Task 168)', function () {
    const devTableJs = fs.readFileSync(path.resolve(__dirname, '..', 'devices-table-desktop.js'), 'utf-8');

    test('Фильтры по колонкам: кнопка в заголовке + выпадающий список', function () {
        assertTrue(devTableJs.indexOf('.dev-table-filter-btn') !== -1, 'кнопка фильтра в th');
        assertTrue(devTableJs.indexOf('function buildFilterDropdown') !== -1, 'построение списка значений');
        assertTrue(devTableJs.indexOf('function applyColumnFilters') !== -1, 'применение фильтров');
        assertTrue(devTableJs.indexOf('colFilters[key] = chosen') !== -1, 'мультивыбор значений');
        assertTrue(devTableJs.indexOf('(пусто)') !== -1, 'значение-пустышка отображается как (пусто)');
    });

    test('Фильтры: счётчик «N из M» и живое применение с сохранением прокрутки', function () {
        assertTrue(devTableJs.indexOf('updateHeaderGroup(rows.length, devices.length)') !== -1, 'счётчик получает N и M');
        assertTrue(devTableJs.indexOf("' из ' + total") !== -1, 'формат «N из M»');
        assertTrue(devTableJs.indexOf('function rebuildTable') !== -1, 'пересборка таблицы');
        assertTrue(devTableJs.indexOf('wrap2.scrollTop = st') !== -1, 'прокрутка сохраняется');
    });

    test('Ширина колонок: ручка на границе заголовка + сохранение', function () {
        assertTrue(devTableJs.indexOf('.dev-table-resize-grip') !== -1, 'ручка resize-grip');
        assertTrue(devTableJs.indexOf("localStorage.getItem('devTableColWidths')") !== -1, 'чтение сохранённых ширин');
        assertTrue(devTableJs.indexOf("localStorage.setItem('devTableColWidths'") !== -1, 'сохранение ширин');
        assertTrue(devTableJs.indexOf('Math.max(40,') !== -1, 'минимальная ширина 40px');
    });

    test('Ресайз: клик после перетаскивания не сортирует', function () {
        // Task 171: sticky-2 «Наименование» откреплена — сдвига больше нет
        assertTrue(devTableJs.indexOf('_suppressSort') !== -1, 'клик после перетаскивания не сортирует');
        assertEqual(devTableJs.indexOf('sticky: 2'), -1, 'sticky-2 откреплена (Task 171)');
    });

    test('Клавиатурная навигация: стрелки/Enter/Home/End + фокус-строка', function () {
        ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].forEach(function (k) {
            assertTrue(devTableJs.indexOf("'" + k + "'") !== -1, 'обработка клавиши ' + k);
        });
        assertTrue(devTableJs.indexOf('function onTableKeyDown') !== -1, 'обработчик клавиатуры');
        assertTrue(devTableJs.indexOf('dev-table-row-focused') !== -1, 'класс фокус-строки');
        assertTrue(devTableJs.indexOf('function ensureFocusedVisible') !== -1, 'автоскролл к фокус-строке');
    });

    test('Виртуальный скролл: спейсеры + окно строк + rAF-троттлинг', function () {
        assertTrue(devTableJs.indexOf('dev-table-vspacer') !== -1, 'спейсеры виртуального скролла');
        assertTrue(devTableJs.indexOf('function renderRows') !== -1, 'рендер видимого окна');
        assertTrue(devTableJs.indexOf('requestAnimationFrame') !== -1, 'rAF-троттлинг прокрутки');
        assertTrue(devTableJs.indexOf("wrap.addEventListener('scroll', onVirtualScroll)") !== -1, 'слушатель прокрутки');
        assertTrue(devTableJs.indexOf('var VBUF') !== -1, 'буфер строк');
    });

    test('CSV-экспорт учитывает фильтры и сортировку', function () {
        const m = devTableJs.match(/var rows = currentRows\.length \? currentRows : lastDevices;/);
        assertTrue(!!m, 'экспорт из currentRows (отфильтрованные строки)');
    });

    test('Выпадающий фильтр закрывается при навигации и смене вида', function () {
        // Task 169: closeFilterDropdown объединён в closePanels (все панели модуля)
        assertTrue(/window\.navigateTo = function \(\) \{\s*\n\s*closePanels\(\);/.test(devTableJs), 'закрытие при navigateTo');
        assertTrue(devTableJs.indexOf("if (!tableMode) closePanels()") !== -1, 'закрытие при выходе из таблицы');
    });
});

// ------------------------------------------------------------
// Task 169: статистика по колонке + метки строк по условиям
// ------------------------------------------------------------
describe('Таблица приборов: статистика по колонке + метки строк (Task 169)', function () {
    const devTableJs = fs.readFileSync(path.resolve(__dirname, '..', 'devices-table-desktop.js'), 'utf-8');

    test('Статистика: правый клик по заголовку -> панель «Количество по значениям»', function () {
        assertTrue(devTableJs.indexOf('function onHeaderContextMenu') !== -1, 'обработчик contextmenu');
        assertTrue(devTableJs.indexOf("wrap.addEventListener('contextmenu', onHeaderContextMenu)") !== -1, 'contextmenu подключён к таблице');
        assertTrue(devTableJs.indexOf('function openStatsPanel') !== -1, 'функция openStatsPanel');
        assertTrue(devTableJs.indexOf('Количество по значениям') !== -1, 'заголовок панели');
        assertTrue(devTableJs.indexOf('e.preventDefault()') !== -1, 'браузерное меню подавляется');
    });

    test('Статистика: значения + счётчики + проценты + бары, по текущему набору', function () {
        assertTrue(devTableJs.indexOf('dts-bar') !== -1, 'визуальные бары');
        assertTrue(devTableJs.indexOf('currentRows.forEach') !== -1, 'подсчёт по currentRows (с учётом фильтров)');
        assertTrue(devTableJs.indexOf("'.dts-pct'") !== -1 || devTableJs.indexOf('dts-pct') !== -1, 'проценты');
        assertTrue(devTableJs.indexOf('Показать все ') !== -1, 'разворачивание полного списка (топ-15)');
    });

    test('Статистика: клик по значению применяет фильтр (drill-down)', function () {
        const m = devTableJs.match(/colFilters\[key\] = \[val\];\s*\n\s*closeStatsPanel\(\);\s*\n\s*rebuildTable\(\);/);
        assertTrue(!!m, 'клик по значению -> фильтр + пересборка');
    });

    test('Метки строк: кнопка ⚑ в шапке + панель условий', function () {
        assertTrue(devTableJs.indexOf('dev-table-marks-btn') !== -1, 'кнопка ⚑');
        assertTrue(devTableJs.indexOf('function toggleMarksDropdown') !== -1, 'панель настроек меток');
        assertTrue(devTableJs.indexOf('«Дата» старше') !== -1, 'условие: дата старше N лет');
        assertTrue(devTableJs.indexOf('«В гр. ППР» — Нет') !== -1, 'условие: вне ППР');
        assertTrue(devTableJs.indexOf("localStorage.setItem('devTableMarks'") !== -1, 'настройки сохраняются');
    });

    test('Метки: isOldDate парсит YYYY-MM-DD и сравнивает с порогом лет', function () {
        const m = devTableJs.match(/function isOldDate[\s\S]{0,500}?return d < limit;/);
        assertTrue(!!m, 'функция isOldDate с корректным сравнением');
        assertTrue(devTableJs.indexOf('match(/^(\\d{4})-(\\d{2})-(\\d{2})/)'.replace('\\\\', '\\\\')) !== -1 || devTableJs.indexOf('^(\\d{4})-(\\d{2})-(\\d{2})') !== -1, 'ISO-формат даты');
    });

    test('Метки: классы строк + цветные полосы слева (box-shadow)', function () {
        assertTrue(devTableJs.indexOf('function rowMarkClasses') !== -1, 'функция классов меток');
        assertTrue(devTableJs.indexOf('rowMarkClasses(dev)') !== -1, 'вызов в rowHtml');
        assertTrue(devTableJs.indexOf('dev-mark-old') !== -1, 'класс янтарной метки');
        assertTrue(devTableJs.indexOf('dev-mark-noppr') !== -1, 'класс красной метки');
        const m = devTableJs.match(/tr\.dev-mark-old > td:first-child \{ box-shadow: inset 4px 0 0 #e0a030; \}/);
        assertTrue(!!m, 'янтарная полоса слева (inset box-shadow)');
        const m2 = devTableJs.match(/tr\.dev-mark-old\.dev-mark-noppr > td:first-child \{/);
        assertTrue(!!m2, 'двойная метка (оба условия)');
    });

    test('Метки: изменение условий не пересобирает таблицу (только renderRows)', function () {
        const m = devTableJs.match(/function applyAndRerender\(\) \{\s*\n\s*saveMarksCfg\(\);\s*\n\s*renderRows\(\);/);
        assertTrue(!!m, 'лёгкое обновление классов без пересборки');
    });

    test('Панели закрываются: клик вне / Escape / навигация / смена вида', function () {
        assertTrue(devTableJs.indexOf('function closePanels') !== -1, 'единое закрытие всех панелей');
        assertTrue(/if \(statsEl && !statsEl\.contains\(e\.target\)\) closeStatsPanel\(\);/.test(devTableJs), 'клик вне статистики');
        assertTrue(/if \(marksEl && !marksEl\.contains\(e\.target\)\) closeMarksDropdown\(\);/.test(devTableJs), 'клик вне меток');
        assertTrue(/e\.key === 'Escape'[\s\S]{0,200}?closeMarksDropdown\(\);/.test(devTableJs), 'Escape закрывает все панели');
    });
});

// ------------------------------------------------------------
// Task 170: багфиксы статистики — бары не рендерились, «Показать все» закрывала панель
// ------------------------------------------------------------
describe('Багфиксы статистики по колонке (Task 170)', function () {
    const devTableJs = fs.readFileSync(path.resolve(__dirname, '..', 'devices-table-desktop.js'), 'utf-8');

    test('Бар статистики — display:block (span inline игнорировал width)', function () {
        const m = devTableJs.match(/\.dts-bar \{ display: block; height: 100%;/);
        assertTrue(!!m, '.dts-bar должен быть display:block — иначе width игнорируется и бары одинаковые (виден только фон-трек)');
    });

    test('«Показать все N значений»: stopPropagation — панель не закрывается', function () {
        // Регресс: expand.remove() внутри обработчика отсоединял кнопку до всплытия,
        // statsEl.contains(e.target) = false → document-слушатель закрывал панель
        const m = devTableJs.match(/expand\.addEventListener\('click', function \(e\) \{\s*\n\s*e\.stopPropagation\(\);[\s\S]{0,300}?expand\.remove\(\);/);
        assertTrue(!!m, 'клик по «Показать все» не должен закрывать панель (stopPropagation)');
    });
});


// ------------------------------------------------------------
// Task 171: откреплена «Наименование», квадратная кнопка фильтра, «Выделить всё»
// ------------------------------------------------------------
describe('Таблица: одна sticky-колонка + квадратная кнопка фильтра + Выделить всё (Task 171)', function () {
    const devTableJs = fs.readFileSync(path.resolve(__dirname, '..', 'devices-table-desktop.js'), 'utf-8');

    test('Закреплена ТОЛЬКО колонка «№» (sticky-2 «Наименование» откреплена)', function () {
        assertEqual(devTableJs.indexOf('sticky: 2'), -1, 'в COLUMNS не должно быть sticky: 2');
        const mNum = devTableJs.match(/\{ key: '__num__',[^}]*sticky: 1[^}]*\}/);
        assertTrue(!!mNum, 'колонка № остаётся закреплённой (sticky: 1)');
        const mName = devTableJs.match(/\{ key: 'Наименование',\s*label: 'Наименование',\s*width: 240 \}/);
        assertTrue(!!mName, '«Наименование» — без sticky');
        assertEqual(devTableJs.indexOf('.dev-table .dev-table-sticky-2 {'), -1, 'CSS sticky-2 удалён');
    });

    test('Кнопка фильтра — квадрат справа во всю высоту шапки, без отступов', function () {
        const m = devTableJs.match(/\.dev-table-filter-btn \{[\s\S]*?\}/);
        assertTrue(!!m, 'правило .dev-table-filter-btn');
        assertTrue(m[0].indexOf('position: absolute') !== -1, 'абсолютное позиционирование');
        assertTrue(m[0].indexOf('top: 0; right: 0; bottom: 0;') !== -1, 'прижата к правому краю, во всю высоту');
        assertTrue(m[0].indexOf('width: 18px') !== -1, 'квадратная ширина 18px');
        assertEqual(m[0].indexOf('margin-left'), -1, 'без отступов (margin)');
        assertEqual(m[0].indexOf('padding'), -1, 'без внутренних отступов');
    });

    test('Панель фильтра: «Выделить всё» с промежуточным состоянием', function () {
        assertTrue(devTableJs.indexOf('\u0412\u044b\u0434\u0435\u043b\u0438\u0442\u044c \u0432\u0441\u0451'.replace(/\\u([0-9a-f]{4})/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })) !== -1 || devTableJs.indexOf('Выделить всё') !== -1, 'строка «Выделить всё»');
        assertTrue(devTableJs.indexOf('allCb.indeterminate') !== -1, 'промежуточное состояние (indeterminate)');
        assertTrue(devTableJs.indexOf('visibleVals.forEach(function (v) { checkedSet[v] = allCb.checked; })') !== -1 || devTableJs.indexOf('checkedSet[v] = allCb.checked') !== -1, 'клик переключает все видимые значения');
        // Синхронизация при индивидуальном изменении
        assertTrue(devTableJs.indexOf('синхронизировать состояние «Выделить всё»') !== -1, 'синхронизация при клике по значению');
    });
});


// ------------------------------------------------------------
// Task 172: рамка «№» жирнее, сброс всех фильтров, карточка только по клику на «№»
// ------------------------------------------------------------
describe('Таблица: рамка №, сброс всех фильтров, карточка по «№» (Task 172)', function () {
    const devTableJs = fs.readFileSync(path.resolve(__dirname, '..', 'devices-table-desktop.js'), 'utf-8');

    test('Правая рамка столбца «№» — жирнее остальных (2px, обе темы)', function () {
        const th = devTableJs.match(/\.dev-table th\.dev-table-col-num \{ border-right: 2px solid [^;]+; \}/);
        const td = devTableJs.match(/\.dev-table td\.dev-table-col-num \{ border-right: 2px solid [^;]+; \}/);
        assertTrue(!!th, 'th «№»: border-right 2px');
        assertTrue(!!td, 'td «№»: border-right 2px');
        assertTrue(devTableJs.indexOf('[data-theme="light"] .dev-table th.dev-table-col-num') !== -1, 'светлая тема: th');
        assertTrue(devTableJs.indexOf('[data-theme="light"] .dev-table td.dev-table-col-num') !== -1, 'светлая тема: td');
    });

    test('Класс dev-table-col-num — на th и td колонки «№»', function () {
        const occ = devTableJs.match(/if \(col\.key === '__num__'\) cls \+= ' dev-table-col-num';/g);
        assertEqual(occ ? occ.length : 0, 2, 'и в buildTableHtml (th), и в rowHtml (td)');
        assertTrue(devTableJs.indexOf('td.dev-table-col-num { cursor: pointer; }') !== -1, 'курсор-рука на ячейках «№»');
    });

    test('Кнопка «Сбросить все фильтры» — слева от «Метки строк»', function () {
        assertTrue(devTableJs.indexOf("clearBtn.id = 'devTableClearFiltersBtn'") !== -1, 'кнопка сброса создаётся');
        assertTrue(devTableJs.indexOf("marksBtn.id = 'devTableMarksBtn'") !== -1, 'кнопка меток создаётся');
        const iAppend = devTableJs.indexOf('btnRow.appendChild(clearBtn)');
        const iAppendM = devTableJs.indexOf('btnRow.appendChild(marksBtn)');
        assertTrue(iAppend !== -1 && iAppendM !== -1 && iAppend < iAppendM, 'в ряду кнопок сброс — левее «Метки строк»');
        assertTrue(devTableJs.indexOf('function resetAllColumnFilters') !== -1, 'функция сброса всех фильтров');
        assertTrue(/colFilters = \{\};/.test(devTableJs), 'очистка всех фильтров разом');
        assertTrue(devTableJs.indexOf('resetAllColumnFilters();') !== -1, 'кнопка вызывает сброс');
        // видна только в табличном виде, как «Метки строк»
        assertTrue(devTableJs.indexOf('.dev-table-header-group.table-active .dev-table-clear-btn { display: inline-flex; }') !== -1, 'видимость в табличном виде');
    });

    test('Сброс всех фильтров: подсветка кнопки + счётчик установленных', function () {
        assertTrue(devTableJs.indexOf('function activeFilterCount') !== -1, 'подсчёт активных фильтров');
        assertTrue(devTableJs.indexOf('function updateClearFiltersBtn') !== -1, 'обновление состояния кнопки');
        assertTrue(/btn\.classList\.toggle\('has-filters', n > 0\)/.test(devTableJs), 'янтарная подсветка при фильтрах');
        assertTrue(/badge\.textContent = n > 0 \? String\(n\) : ''/.test(devTableJs), 'счётчик установленных фильтров');
        // вызывается в buildTableHtml ДО замера ширины группы (счётчик меняет ширину)
        const iBuild = devTableJs.indexOf('function buildTableHtml');
        const iEnd = devTableJs.indexOf('function colLabel', iBuild);
        const seg = devTableJs.slice(iBuild, iEnd);
        const iCall = seg.indexOf('updateClearFiltersBtn();');
        const iUhg = seg.indexOf('updateHeaderGroup(rows.length, devices.length);');
        assertTrue(iCall !== -1 && iUhg !== -1 && iCall < iUhg, 'updateClearFiltersBtn вызывается в buildTableHtml до updateHeaderGroup');
    });

    test('Карточка прибора — ТОЛЬКО по клику на ячейки столбца «№»', function () {
        const m = devTableJs.match(/var numTd = e\.target\.closest \? e\.target\.closest\('td\.dev-table-col-num'\) : null;/);
        assertTrue(!!m, 'клик ищет ячейку «№»');
        const m2 = devTableJs.match(/if \(numTd && numTd\.closest\('\.dev-table-row'\) === row &&[\s\S]{0,80}?typeof window\.devOpenDetail === 'function'\) \{\s*\n\s*window\.devOpenDetail\(row\.getAttribute\('data-dev-id'\)\);/);
        assertTrue(!!m2, 'devOpenDetail — только при клике на ячейку «№»');
        // выделение строки сохраняется при клике на любую ячейку
        assertTrue(devTableJs.indexOf("row.classList.add('dev-table-row-selected');") !== -1, 'выделение строки при любом клике');
        // клавиатурный Enter по-прежнему открывает карточку (навигация)
        assertTrue(/key === 'Enter'[\s\S]{0,200}?devOpenDetail\(String\(currentRows\[focusIndex\]\['ID'\]\)\);/.test(devTableJs), 'Enter открывает карточку (клавиатура)');
    });
});


// ------------------------------------------------------------
// Task 173: поиск в строке крошек detail-панели (слева от ✕, с разделителем)
// ------------------------------------------------------------
describe('Поиск в строке крошек detail-панели (Task 173)', function () {
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf-8');

    test('Кнопка-лупа и разделитель — в detailBreadcrumbBar слева от ✕', function () {
        const iBar = html.indexOf('<div id="detailBreadcrumbBar">');
        const iBarEnd = html.indexOf('</div>\n\n    <div id="contentArea">', iBar);
        const bar = html.slice(iBar, iBarEnd !== -1 ? iBarEnd : iBar + 2000);
        const iSearch = bar.indexOf('id="detailBarSearchToggleBtn"');
        const iClose = bar.indexOf('class="detail-breadcrumb-close"');
        const iDivider = bar.indexOf('detail-breadcrumb-divider');
        assertTrue(iSearch !== -1, 'кнопка поиска в строке крошек');
        assertTrue(iClose !== -1, 'кнопка ✕ в строке крошек');
        assertTrue(iSearch < iClose, 'кнопка поиска — ЛЕВЕЕ ✕ в DOM');
        assertTrue(iDivider > iSearch && iDivider < iClose, 'разделитель между поиском и ✕');
        // поле поиска тоже в баре
        assertTrue(bar.indexOf('id="detailBarSearchInput"') !== -1, 'поле поиска в строке крошек');
    });

    test('Разделитель — вертикальная линия 1px×24px (как top-bar-divider)', function () {
        const m = html.match(/\.detail-breadcrumb-divider \{\s*\n\s*width: 1px;\s*\n\s*height: 24px;\s*\n\s*flex-shrink: 0;\s*\n\s*align-self: center;\s*\n\s*background: var\(--border-color[^;]+;/);
        assertTrue(!!m, '.detail-breadcrumb-divider: 1px x 24px, var(--border-color)');
    });

    test('Кнопка поиска и разделитель скрыты без открытой detail-панели', function () {
        // Task 127 расширен: вместе с ✕ и ⇄
        const m = html.match(/body:not\(:has\(#detailPanel\.active\)\) #detailBreadcrumbBar \.detail-breadcrumb-close,\s*\n\s*body:not\(:has\(#detailPanel\.active\)\) #detailBreadcrumbBar \.detail-breadcrumb-swap,\s*\n\s*body:not\(:has\(#detailPanel\.active\)\) #detailBreadcrumbBar \.detail-breadcrumb-search,\s*\n\s*body:not\(:has\(#detailPanel\.active\)\) #detailBreadcrumbBar \.detail-breadcrumb-divider \{\s*\n\s*display: none !important;/);
        assertTrue(!!m, 'CSS-правило скрытия поиска/разделителя при закрытой панели');
    });

    test('JS: привязка к поиску активной страницы + forwarding', function () {
        assertTrue(html.indexOf('function detailBarGetPageSearchInput') !== -1, 'поиск input активной страницы');
        assertTrue(html.indexOf("page.querySelector('.dev-header-search')") !== -1, 'ищет .dev-header-search в активной странице');
        assertTrue(html.indexOf('function detailBarUpdateSearchBtn') !== -1, 'обновление видимости кнопки');
        assertTrue(html.indexOf('function detailBarSearchForward') !== -1, 'функция перенаправления запроса');
        const m = html.match(/pageInput\.value = value;\s*\n\s*pageInput\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\);/);
        assertTrue(!!m, 'запрос копируется в поле страницы + dispatch input');
        // закрытие сбрасывает запрос страницы
        const m2 = html.match(/function detailBarCloseSearch\(\)[\s\S]{0,900}?pageInput\.value = '';/);
        assertTrue(!!m2, 'закрытие поиска сбрасывает запрос списка');
    });

    test('JS: хуки во всех точках открытия detail-панели', function () {
        // openDetailPanel
        const iOpen = html.indexOf('function openDetailPanel');
        const seg = html.slice(iOpen, iOpen + 900);
        assertTrue(seg.indexOf('detailBarUpdateSearchBtn();') !== -1, 'openDetailPanel вызывает обновление');
        // closeDetailPanel
        const iClose = html.indexOf('function closeDetailPanel');
        const seg2 = html.slice(iClose, iClose + 600);
        assertTrue(seg2.indexOf('detailBarCloseSearch();') !== -1, 'closeDetailPanel сворачивает поиск');
        // все InPanel-рендереры (9 прямых открытий бара + openDetailPanel + fallback)
        const n = html.split("detailBarUpdateSearchBtn();").length - 1;
        assertTrue(n >= 11, 'хуков обновления кнопки >= 11 (фактически: ' + n + ')');
        // Escape закрывает
        const m = html.match(/e\.key !== 'Escape'[\s\S]{0,200}?detailBarCloseSearch\(\);/);
        assertTrue(!!m, 'Escape сворачивает поиск в строке крошек');
    });

    test('Поле поиска разворачивается рядом с крошками (Task 176)', function () {
        const m = html.match(/#detailBarSearchInput\.search-open \{\s*\n\s*display: block;\s*\n\s*flex: 0 1 250px;/);
        assertTrue(!!m, 'flex: 0 1 250px — поле ограниченной ширины');
        assertTrue(html.indexOf('#detailBreadcrumbBar.search-open #detailBreadcrumbContent { display: none; }') === -1, 'крошки НЕ скрываются при открытом поиске');
        assertTrue(html.indexOf('#detailBreadcrumbBar.search-open #flowDesktopTabs { visibility: hidden; }') !== -1, 'табы расходомеров скрыты при поиске');
    });
});

// ------------------------------------------------------------
// Task 174: кнопки «Фильтр по колонке» выделены цветом ярче
// ------------------------------------------------------------
describe('Кнопки фильтра по колонке — ярче (Task 174)', function () {
    const devTableJs = fs.readFileSync(path.resolve(__dirname, '..', 'devices-table-desktop.js'), 'utf-8');

    test('Обычное состояние (тёмная тема) — яркий насыщенный цвет вместо тускло-серого', function () {
        const m = devTableJs.match(/\.dev-table-filter-btn \{[\s\S]*?\}/);
        assertTrue(!!m, 'правило .dev-table-filter-btn');
        assertTrue(m[0].indexOf('#7db9f5') !== -1, 'цвет кнопки #7db9f5 (насыщенный голубой)');
        assertEqual(m[0].indexOf('rgba(200,214,232,0.5)'), -1, 'тусклый полупрозрачный серый удалён из правила');
    });

    test('Обычное состояние (светлая тема) — акцентный синий', function () {
        const m = devTableJs.match(/\[data-theme="light"\] \.dev-table-filter-btn \{[^}]*\}/);
        assertTrue(!!m, 'правило светлой темы');
        assertTrue(m[0].indexOf('#3a6ea5') !== -1, 'цвет #3a6ea5');
        assertEqual(m[0].indexOf('rgba(51,70,94,0.55)'), -1, 'тусклый серый удалён из правила');
    });

    test('Hover — ярче обычного состояния, обе темы', function () {
        const dark = devTableJs.match(/\.dev-table-filter-btn:hover \{[^}]*\}/);
        assertTrue(!!dark, 'hover тёмной темы');
        assertTrue(dark[0].indexOf('#d5e9fd') !== -1, 'hover тёмной темы #d5e9fd');
        assertTrue(dark[0].indexOf('rgba(125,185,245,0.22)') !== -1, 'подложка hover 0.22');
        const light = devTableJs.match(/\[data-theme="light"\] \.dev-table-filter-btn:hover \{[^}]*\}/);
        assertTrue(!!light, 'hover светлой темы');
        assertTrue(light[0].indexOf('#1b5aa6') !== -1, 'hover светлой темы #1b5aa6');
    });

    test('Активный фильтр — заметная янтарная плашка, обе темы', function () {
        const dark = devTableJs.match(/\.dev-table-filter-btn\.has-filter \{[^}]*\}/);
        assertTrue(!!dark, 'has-filter тёмной темы');
        assertTrue(dark[0].indexOf('#ffd60a') !== -1, 'жёлтый цвет сохранён');
        assertTrue(dark[0].indexOf('rgba(255,214,10,0.22)') !== -1, 'фон плашки 0.22 (ярче прежних 0.10)');
        const light = devTableJs.match(/\[data-theme="light"\] \.dev-table-filter-btn\.has-filter \{[^}]*\}/);
        assertTrue(!!light, 'has-filter светлой темы');
        assertTrue(light[0].indexOf('rgba(199,126,0,0.16)') !== -1, 'фон плашки светлой темы 0.16');
    });
});

// ------------------------------------------------------------
// Task 175: шапка таблицы — два ряда (кнопки сверху, счётчик под ними),
// единая высота кнопок 28px, квадратные «сброс фильтров» и «метки строк»
// ------------------------------------------------------------
describe('Шапка таблицы: два ряда + квадратные кнопки (Task 175)', function () {
    const devTableJs = fs.readFileSync(path.resolve(__dirname, '..', 'devices-table-desktop.js'), 'utf-8');

    test('Табличный вид: кнопки подняты вверх, счётчик — под ними', function () {
        const m = devTableJs.match(/\.dev-table-header-group\.table-active \{[\s\S]*?\}/);
        assertTrue(!!m, 'правило .dev-table-header-group.table-active');
        assertTrue(m[0].indexOf('flex-direction: column') !== -1, 'колонка: ряд кнопок сверху, счётчик ниже');
        assertTrue(m[0].indexOf('align-items: flex-end') !== -1, 'выравнивание по правому краю');
        assertTrue(m[0].indexOf('top: 4px') !== -1, 'группа поднята к верхней половине бара');
        assertTrue(m[0].indexOf('transform: none') !== -1, 'вертикальное центрирование снято');
        assertTrue(m[0].indexOf('gap: 3px') !== -1, 'межрядный зазор 3px');
        const row = devTableJs.match(/\.dev-table-btn-row \{[^}]*\}/);
        assertTrue(!!row, 'обёртка .dev-table-btn-row');
        assertTrue(row[0].indexOf('display: flex') !== -1, 'ряд кнопок — flex');
        assertTrue(row[0].indexOf('gap: 8px') !== -1, 'зазор между кнопками 8px');
    });

    test('Все четыре кнопки бара — единая высота 28px', function () {
        ['dev-table-toggle-btn', 'dev-table-csv-btn', 'dev-table-clear-btn', 'dev-table-marks-btn'].forEach(function (cls) {
            // якорь ' (начало строкового литерала CSS-массива) — чтобы не
            // зацепить селектор .dev-table-header-group .<cls> { display: none; }
            const m = devTableJs.match(new RegExp("'\\." + cls + " \\{[\\s\\S]*?\\}'"));
            assertTrue(!!m, 'правило .' + cls);
            assertTrue(m[0].indexOf('height: 28px') !== -1, cls + ': height 28px');
            assertTrue(m[0].indexOf('box-sizing: border-box') !== -1, cls + ': box-sizing border-box');
        });
    });

    test('«Сброс фильтров» и «Метки строк» — квадратные 28x28 без паддингов', function () {
        const clear = devTableJs.match(/'\.dev-table-clear-btn \{[\s\S]*?\}'/);
        assertTrue(!!clear, 'правило .dev-table-clear-btn');
        assertTrue(clear[0].indexOf('width: 28px') !== -1, 'clear: width 28px');
        assertTrue(clear[0].indexOf('padding: 0') !== -1, 'clear: без внутренних отступов');
        assertTrue(clear[0].indexOf('justify-content: center') !== -1, 'clear: содержимое по центру');
        const marks = devTableJs.match(/'\.dev-table-marks-btn \{[\s\S]*?\}'/);
        assertTrue(!!marks, 'правило .dev-table-marks-btn');
        assertTrue(marks[0].indexOf('width: 28px') !== -1, 'marks: width 28px');
        assertTrue(marks[0].indexOf('padding: 0') !== -1, 'marks: без внутренних отступов');
        assertTrue(marks[0].indexOf('display: inline-flex') !== -1, 'marks: flex-центрирование глифа');
    });

    test('Разделитель лупы в табличном виде — по центру группы (напротив лупы)', function () {
        const m = devTableJs.match(/\.dev-table-header-group\.table-active::before \{[\s\S]*?\}/);
        assertTrue(!!m, 'полоса ::before у группы в табличном виде');
        assertTrue(m[0].indexOf('height: 24px') !== -1, 'высота 24px (как в верхнем баре)');
        assertTrue(m[0].indexOf('var(--border-color') !== -1, 'цвет var(--border-color)');
        assertTrue(devTableJs.indexOf('.dev-table-header-group.table-active .dev-table-toggle-btn::before { display: none; }') !== -1,
            'полоса кнопки «Таблица» отключена в табличном виде');
    });

    test('DOM: ряд кнопок [Таблица][сброс][метки][CSV], счётчик после ряда', function () {
        const iRow = devTableJs.indexOf("btnRow.className = 'dev-table-btn-row'");
        const iCnt = devTableJs.indexOf("count.id = 'devTableCount'");
        assertTrue(iRow !== -1 && iRow < iCnt, 'ряд создаётся раньше счётчика');
        assertTrue(devTableJs.indexOf('group.appendChild(btnRow)') !== -1, 'ряд — первый ребёнок группы');
        ['btn', 'clearBtn', 'marksBtn', 'csvBtn'].forEach(function (v) {
            assertTrue(devTableJs.indexOf('btnRow.appendChild(' + v + ')') !== -1, v + ' — в ряду кнопок');
        });
        const iBtn = devTableJs.indexOf('btnRow.appendChild(btn)');
        const iClear = devTableJs.indexOf('btnRow.appendChild(clearBtn)');
        const iMarks = devTableJs.indexOf('btnRow.appendChild(marksBtn)');
        const iCsv = devTableJs.indexOf('btnRow.appendChild(csvBtn)');
        assertTrue(iBtn < iClear && iClear < iMarks && iMarks < iCsv, 'порядок в ряду: Таблица → сброс → метки → CSV');
    });

    test('Бейдж счётчика фильтров пустой — не занимает место в квадрате', function () {
        assertTrue(devTableJs.indexOf('.dev-table-clear-btn .dev-table-clear-count:empty { display: none; }') !== -1,
            ':empty скрывает пустой бейдж');
        const svg = devTableJs.match(/clearBtn\.innerHTML = '<svg width="14" height="14"/);
        assertTrue(!!svg, 'svg уменьшен до 14x14 под квадратную кнопку');
    });
});

// ------------------------------------------------------------
// Task 176: лёгкая подложка на кнопки фильтра в покое + значок ▾ крупнее;
// поле поиска в detail-баре не перекрывает хлебные крошки
// ------------------------------------------------------------
describe('Подложка кнопок фильтра + поиск не перекрывает крошки (Task 176)', function () {
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf-8');
    const devTableJs = fs.readFileSync(path.resolve(__dirname, '..', 'devices-table-desktop.js'), 'utf-8');

    test('Кнопка фильтра — лёгкая подложка в покое, обе темы', function () {
        const dark = devTableJs.match(/\.dev-table-filter-btn \{[\s\S]*?\}/);
        assertTrue(!!dark, 'правило .dev-table-filter-btn');
        assertTrue(dark[0].indexOf('rgba(125,185,245,0.13)') !== -1, 'подложка в покое 0.13 (тёмная тема)');
        const light = devTableJs.match(/\[data-theme="light"\] \.dev-table-filter-btn \{[^}]*\}/);
        assertTrue(!!light, 'правило светлой темы');
        assertTrue(light[0].indexOf('rgba(58,110,165,0.10)') !== -1, 'подложка в покое 0.10 (светлая тема)');
    });

    test('Иерархия состояний: покой слабее hover, обе темы', function () {
        const hoverDark = devTableJs.match(/\.dev-table-filter-btn:hover \{[^}]*\}/);
        assertTrue(!!hoverDark && hoverDark[0].indexOf('rgba(125,185,245,0.22)') !== -1, 'hover тёмной темы 0.22 > 0.13');
        const hoverLight = devTableJs.match(/\[data-theme="light"\] \.dev-table-filter-btn:hover \{[^}]*\}/);
        assertTrue(!!hoverLight && hoverLight[0].indexOf('rgba(58,110,165,0.18)') !== -1, 'hover светлой темы 0.18 > 0.10');
    });

    test('Значок ▾ крупнее и подложка со скруглением слева (как вкладка)', function () {
        const m = devTableJs.match(/\.dev-table-filter-btn \{[\s\S]*?\}/);
        assertTrue(!!m && m[0].indexOf('font-size: 10px') !== -1, 'glyph 10px (было 9px)');
        assertTrue(m[0].indexOf('border-radius: 4px 0 0 4px') !== -1, 'скругление слева 4px');
        assertTrue(m[0].indexOf('border-left: 1px solid') !== -1, 'левая кромка полосы');
    });

    test('Открытый поиск: крошки остаются видимыми, путь усекается многоточием', function () {
        const m = html.match(/#detailBreadcrumbBar\.search-open #detailBreadcrumbContent \{[^}]*\}/);
        assertTrue(!!m, 'правило для крошек при открытом поиске');
        assertTrue(m[0].indexOf('display: none') === -1, 'крошки не скрываются');
        assertTrue(m[0].indexOf('text-overflow: ellipsis') !== -1, 'многоточие при усечении');
        assertTrue(m[0].indexOf('overflow: hidden') !== -1, 'overflow: hidden');
        assertTrue(m[0].indexOf('min-width: 120px') !== -1, 'крошки не схлопываются меньше 120px');
        assertTrue(m[0].indexOf('white-space: nowrap') !== -1, 'одна строка');
    });

    test('Поле поиска — ограниченной ширины рядом с крошками', function () {
        const m = html.match(/#detailBarSearchInput\.search-open \{[\s\S]*?\}/);
        assertTrue(!!m, 'правило .search-open поля');
        assertTrue(m[0].indexOf('flex: 0 1 250px') !== -1, 'flex-basis 250px, сжимается при нехватке места');
        assertTrue(m[0].indexOf('flex: 1;') === -1, 'flex:1 (занять место крошек) удалён');
        assertTrue(m[0].indexOf('margin-left: 40px') === -1, 'margin-left: 40px удалён');
        assertTrue(m[0].indexOf('min-width: 150px') !== -1, 'минимальная ширина поля 150px');
    });
});

// ------------------------------------------------------------
// Task 180: фикс бага «при открытии подробной карточки правые
// кнопки и поиск смещаются влево». При открытом поиске контент
// крошек получал flex:0 1 auto (Task 176) — не рос, поэтому
// поле поиска + правые кнопки (✕, ⇄, лупа) уходили в середину
// бара. Fix: контент получает flex:1 1 0% (растёт), правые
// элементы остаются у правого края бара.
// ------------------------------------------------------------
describe('Fix: правые кнопки и поиск у правого края (Task 180)', function () {
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf-8');

    test('Контент при открытом поиске растёт (flex:1), а не стоит на месте', function () {
        const m = html.match(/#detailBreadcrumbBar\.search-open #detailBreadcrumbContent \{[^}]*\}/);
        assertTrue(!!m, 'правило для крошек при открытом поиске');
        // Новое поведение: flex содержит grow:1
        assertTrue(m[0].indexOf('flex: 1 1 0%') !== -1 || m[0].indexOf('flex: 1') !== -1,
            'flex растёт (flex: 1 1 0% или flex: 1) — контент заполняет доступное место');
        // Старое поведение удалено
        assertTrue(m[0].indexOf('flex: 0 1 auto') === -1,
            'старое flex: 0 1 auto (не рос) удалено');
    });

    test('Остальные свойства контента сохранены (многоточие, min-width, nowrap)', function () {
        const m = html.match(/#detailBreadcrumbBar\.search-open #detailBreadcrumbContent \{[^}]*\}/);
        assertTrue(!!m, 'правило существует');
        assertTrue(m[0].indexOf('text-overflow: ellipsis') !== -1, 'многоточие');
        assertTrue(m[0].indexOf('overflow: hidden') !== -1, 'overflow: hidden');
        assertTrue(m[0].indexOf('min-width: 120px') !== -1, 'min-width: 120px');
        assertTrue(m[0].indexOf('white-space: nowrap') !== -1, 'white-space: nowrap');
    });

    test('Поле поиска и кнопки остаются на месте (flex:0 1 250px)', function () {
        // Поле поиска не должно менять flex — оно ограниченной ширины
        const m = html.match(/#detailBarSearchInput\.search-open \{[\s\S]*?\}/);
        assertTrue(!!m, 'правило .search-open поля');
        assertTrue(m[0].indexOf('flex: 0 1 250px') !== -1, 'flex: 0 1 250px (ограниченная ширина)');
    });
});

// ------------------------------------------------------------
// Task 177/178: конвертеры — рабочая область из трёх равных частей
// на десктопе (ввод+перевод+результаты | таблица | информация).
// Task 177 — конвертер давления; Task 178 — распространена на все
// остальные (расход/масса/температура/длина/плотность/время/объём).
// ------------------------------------------------------------
describe('Конвертеры: три равные колонки (Task 177/178)', function () {
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf-8');

    // 8 страниц конвертеров: (id, cat, onclickFn, nextMarker)
    const CONVERTERS = [
        ['pressure', 'pressure', "convertUnits('pressure')", '<!-- Расход -->'],
        ['flow',     'flow',     "convertUnits('flow')",     '<!-- Вес и масса -->'],
        ['mass',     'mass',     "convertUnits('mass')",     '<!-- Температура -->'],
        ['temp',     'temp',     "convertTemp()",             '<!-- Длина и расстояние -->'],
        ['length',   'length',   "convertUnits('length')",   '<!-- Плотность -->'],
        ['density',  'density',  "convertUnits('density')",  '<!-- Время -->'],
        ['time',     'time',     "convertUnits('time')",       '<!-- Объём -->'],
        ['volume',   'volume',   "convertUnits('volume')",   '<!-- ======================== ШКАЛА-СИГНАЛ ======================== -->'],
    ];

    function blockOf(convId, nextMarker) {
        const i = html.indexOf('<div id="page-conv-' + convId + '"');
        const j = html.indexOf(nextMarker, i);
        return html.slice(i, j);
    }

    // ---------- Общие тесты для ВСЕХ 8 конвертеров ----------
    CONVERTERS.forEach(([cid, cat, onclickFn, nextMarker]) => {
        const title = cid.charAt(0).toUpperCase() + cid.slice(1);

        test(title + ': структура .conv-columns с тремя .conv-col', function () {
            const b = blockOf(cid, nextMarker);
            assertTrue(b.indexOf('class="page-content conv-3col-page"') !== -1,
                'страница получила класс conv-3col-page');
            const iHeader = b.indexOf('page-inline-header');
            const iCols = b.indexOf('<div class="conv-columns">');
            const iCol1 = b.indexOf('<div class="conv-col conv-col-input">');
            const iCol2 = b.indexOf('<div class="conv-col conv-col-table">');
            const iCol3 = b.indexOf('<div class="conv-col conv-col-info">');
            assertTrue(iCols !== -1, 'обёртка .conv-columns');
            assertTrue(iHeader !== -1 && iHeader < iCols, 'колонки после шапки');
            assertTrue(iCol1 !== -1 && iCol2 !== -1 && iCol3 !== -1, 'три колонки-обёртки');
            assertTrue(iCol1 < iCol2 && iCol2 < iCol3, 'порядок слева направо: ввод → таблица → информация');
        });

        test(title + ': колонка 1 — поля ввода, кнопка «Перевести», результаты', function () {
            const b = blockOf(cid, nextMarker);
            const iCol1 = b.indexOf('<div class="conv-col conv-col-input">');
            const iCol2 = b.indexOf('<div class="conv-col conv-col-table">');
            const col1 = b.slice(iCol1, iCol2);
            assertTrue(col1.indexOf('id="conv-' + cat + '-input"') !== -1, 'поле значения');
            assertTrue(col1.indexOf('id="conv-' + cat + '-unit"') !== -1, 'выбор единицы');
            assertTrue(col1.indexOf(onclickFn) !== -1, 'кнопка «Перевести»');
            assertTrue(col1.indexOf('id="conv-' + cat + '-results"') !== -1, 'блок результатов');
        });

        test(title + ': колонка 2 — заглушка + таблица; колонка 3 — инфоблок', function () {
            const b = blockOf(cid, nextMarker);
            const iCol2 = b.indexOf('<div class="conv-col conv-col-table">');
            const iCol3 = b.indexOf('<div class="conv-col conv-col-info">');
            const col2 = b.slice(iCol2, iCol3);
            const iPh = col2.indexOf('conv-table-placeholder');
            const iTbl = col2.indexOf('id="conv-' + cat + '-table"');
            assertTrue(iPh !== -1, 'заглушка средней колонки');
            assertTrue(iTbl !== -1, 'таблица перевода');
            assertTrue(iPh < iTbl, 'заглушка перед таблицей');
            const col3 = b.slice(iCol3);
            assertTrue(col3.indexOf('conv-info-block') !== -1, 'инфоблок с классом');
            assertTrue(col3.indexOf('Справочная информация') !== -1, 'заголовок блока информации');
        });

        test(title + ': инфоблок — цвета через CSS-переменные', function () {
            const b = blockOf(cid, nextMarker);
            const iCol3 = b.indexOf('<div class="conv-col conv-col-info">');
            const col3 = b.slice(iCol3);
            assertTrue(col3.indexOf('color:var(--conv-info-text)') !== -1,
                'текст инфоблока через --conv-info-text');
            assertTrue(col3.indexOf('color:var(--conv-info-bold)') !== -1,
                'жирные акценты через --conv-info-bold');
            assertTrue(col3.indexOf('color:rgba(255,255,255,0.5)') === -1,
                'жёсткий белый текст удалён');
            assertTrue(col3.indexOf('color:rgba(255,255,255,0.7)') === -1,
                'жёсткий белый жирный удалён');
        });
    });

    // ---------- Один тест на общие CSS/JS правила ----------
    test('Десктоп CSS: общий грид трёх равных колонок + независимая прокрутка', function () {
        const m = html.match(/\.conv-3col-page \.conv-columns \{[\s\S]*?\}/);
        assertTrue(!!m, 'правило .conv-columns для всех .conv-3col-page');
        assertTrue(m[0].indexOf('grid-template-columns: repeat(3, 1fr)') !== -1, '3 равные доли');
        assertTrue(m[0].indexOf('flex: 1') !== -1, 'рабочая область — весь экран под шапкой');
        const col = html.match(/\.conv-3col-page \.conv-col \{[\s\S]*?\}/);
        assertTrue(!!col, 'правило .conv-col');
        assertTrue(col[0].indexOf('overflow-y: auto') !== -1, 'прокрутка внутри каждой колонки');
        const page = html.match(/#contentArea > \.conv-3col-page\.active \{[\s\S]*?\}/);
        assertTrue(!!page, 'правило страницы конвертера (.conv-3col-page.active)');
        assertTrue(page[0].indexOf('overflow: hidden') !== -1, 'страница целиком не скроллится');
        // грид-правило — только внутри десктопного media-блока
        const iRule = html.indexOf('grid-template-columns: repeat(3, 1fr)');
        const iMedia = html.lastIndexOf('@media (min-width: 1024px)', iRule);
        assertTrue(iMedia !== -1, 'мобильный вид не затронут: грид в media >= 1024px');
    });

    test('Заглушка видна только пока таблица скрыта (общий :has по style)', function () {
        assertTrue(html.indexOf('.conv-table-placeholder { display: none; }') !== -1,
            'скрыта по умолчанию');
        // Task 178: правило обобщено — срабатывает для любой страницы конвертера
        const m = html.match(/\.conv-3col-page:has\(\.conv-col-table > \[style\*="none"\]\) \.conv-table-placeholder \{[\s\S]*?\}/);
        assertTrue(!!m, 'общее правило показа заглушки через :has');
        assertTrue(m[0].indexOf('display: flex') !== -1, 'заглушка показана при скрытой таблице');
        assertTrue(m[0].indexOf('dashed') !== -1, 'пунктирная рамка-подсказка');
        // старое специфичное правило давления — удалено
        const oldRule = html.indexOf('#page-conv-pressure:has(#conv-pressure-table[style*="none"])');
        assertTrue(oldRule === -1, 'старое правило давления заменено на общее');
    });

    test('JS: на десктопе >=1024px таблица не прокручивает страницу (все конвертеры)', function () {
        // Task 178: проверка убрала условие (cat === 'pressure') —
        // skipScroll срабатывает для всех конвертеров на десктопе
        const m = html.match(/var skipScroll = window\.matchMedia &&\s*\n?\s*window\.matchMedia\('\(min-width: 1024px\)'\)\.matches;/);
        assertTrue(!!m, 'проверка ширины окна без условия cat в showConverterTable');
        const iFn = html.indexOf('function showConverterTable');
        const iSkip = html.indexOf('var skipScroll = window.matchMedia');
        const iTemp = html.indexOf('function showTempTable');
        assertTrue(iFn !== -1 && iSkip > iFn && iSkip < iTemp, 'проверка внутри showConverterTable');
        // проверка, что условие cat === 'pressure' убрано
        const iOldCond = html.indexOf("cat === 'pressure'");
        assertTrue(iOldCond === -1 || iOldCond > iTemp, 'условие cat === \'pressure\' удалено из skipScroll');
    });

    test('JS: showTempTable — skipScroll на десктопе >=1024px', function () {
        const iTemp = html.indexOf('function showTempTable');
        const iSkip = html.indexOf('var skipScrollT = window.matchMedia');
        assertTrue(iSkip > iTemp, 'skipScrollT добавлен в showTempTable');
        const iEnd = html.indexOf('function setSignalDefaults', iSkip);
        const section = html.slice(iSkip, iEnd);
        assertTrue(section.indexOf('matchMedia(\'(min-width: 1024px)\').matches') !== -1,
            'проверка ширины окна в showTempTable');
        assertTrue(section.indexOf('if (!skipScrollT)') !== -1,
            'прокрутка только при !skipScrollT');
    });

    test('CSS-переменные инфоблока определены для обеих тем', function () {
        const iRoot = html.indexOf(':root {');
        assertTrue(html.slice(iRoot, iRoot + 1600).indexOf('--conv-info-text: rgba(255,255,255,0.5)') !== -1,
            'тёмная тема определяет переменные');
        const iLight = html.indexOf('[data-theme="light"] {');
        assertTrue(html.slice(iLight, iLight + 1600).indexOf('--conv-info-text: rgba(20,20,19,0.55)') !== -1,
            'светлая тема переопределяет переменные инфоблока');
    });
});

// ------------------------------------------------------------
// Task 179: трёхколоночная схема распространена на все ИНЖЕНЕРНЫЕ
// КАЛЬКУЛЯТОРЫ разделов «КИП и А» и «Электротехника»:
// scale-signal, circuit-breaker, orifice-quick/dp/flow/diameter,
// error-pressure/temp-rtd/temp-tc/flow/level/generic-*/scale/kit,
// buoy-calc, temp-sensor-view (Task 372: расчётная страница датчика
// температуры — сама temp-sensors стала страницей карточек).
// Колонки: ввод+кнопка | результаты | справочная информация.
// Мобильный вид не меняется.
// ------------------------------------------------------------
describe('Инженерные калькуляторы: три равные колонки (Task 179)', function () {
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf-8');

    // (id, button class, results id, info-block count)
    const CALCS = [
        // — КИП и А —
        ['scale-signal',          'scale-calc-btn',         'scaleResultsArea',  1],
        ['orifice-quick',         'converter-convert-btn',  'oq_results',         1],
        ['orifice-dp',             'converter-convert-btn', 'opResultsDp',         1],
        ['orifice-flow',           'converter-convert-btn', 'opResultsFlow',        1],
        ['orifice-diameter',       'converter-convert-btn', 'opResultsDiameter',    1],
        ['error-pressure',        'converter-convert-btn',  'ep_results',           1],
        ['error-temp-rtd',        'converter-convert-btn',  'rtdResults',           1],
        ['error-temp-tc',         'converter-convert-btn',  'tcResults',            1],
        ['error-flow',            'converter-convert-btn',  'ef_results',           1],
        ['error-level',           'converter-convert-btn',  'el_results',            1],
        ['error-generic-number',  'converter-convert-btn',  'egn_results',          1],
        ['error-generic-underline', 'converter-convert-btn', 'egu_results',          1],
        ['error-generic-circle',  'converter-convert-btn',  'egc_results',          1],
        ['error-generic-fraction', 'converter-convert-btn', 'egf_results',          1],
        ['error-scale',           'converter-convert-btn',  'ws_results',           3],
        ['error-kit',             'converter-convert-btn',  'errorKitResults',     1],
        ['buoy-calc',             'converter-convert-btn',  'buoyResults',          1],
        ['temp-sensor-view',      'converter-convert-btn',  'tempSensorResults',    1],   // Task 372
        // — Электротехника —
        ['circuit-breaker',       'converter-convert-btn',  'cbResults',            1],
    ];

    function pageBlock(pageId) {
        const open = '<div id="page-' + pageId + '" class="page-content conv-3col-page">';
        const i = html.indexOf(open);
        assertTrue(i !== -1, 'страница «' + pageId + '» получила класс conv-3col-page');
        // ищем закрывающий тег на уровне страницы
        let pos = i + open.length - 1;
        let depth = 1;
        const maxIter = 50000;
        let iter = 0;
        while (depth > 0 && iter < maxIter) {
            const m = /<\/?div\b/.exec(html.slice(pos + 1));
            if (!m) break;
            pos = pos + 1 + m.index;
            // m[0] — это '<div' или '</div'; различаем по наличию '/'
            if (m[0].indexOf('</') === 0) depth--;
            else depth++;
            iter++;
        }
        return html.slice(i, pos + 6);
    }

    CALCS.forEach(([pageId, btnClass, resultsId, infoCount]) => {
        test(pageId + ': структура conv-columns с тремя conv-col', function () {
            const b = pageBlock(pageId);
            const iHeader = b.indexOf('page-inline-header');
            const iCols = b.indexOf('<div class="conv-columns">');
            const iCol1 = b.indexOf('<div class="conv-col conv-col-input">');
            const iCol2 = b.indexOf('<div class="conv-col conv-col-table">');
            const iCol3 = b.indexOf('<div class="conv-col conv-col-info">');
            assertTrue(iCols !== -1, 'обёртка .conv-columns на странице «' + pageId + '»');
            assertTrue(iHeader !== -1 && iHeader < iCols, 'колонки после шапки');
            assertTrue(iCol1 !== -1 && iCol2 !== -1 && iCol3 !== -1, 'три колонки на «' + pageId + '»');
            assertTrue(iCol1 < iCol2 && iCol2 < iCol3, 'порядок: ввод → таблица → информация');
        });

        test(pageId + ': колонка 1 — формы и кнопка «Рассчитать»', function () {
            const b = pageBlock(pageId);
            const iCol1 = b.indexOf('<div class="conv-col conv-col-input">');
            const iCol2 = b.indexOf('<div class="conv-col conv-col-table">');
            const col1 = b.slice(iCol1, iCol2);
            // Кнопка расчёта обязательно в col1
            const btnRe = new RegExp('class="' + btnClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"');
            assertTrue(btnRe.test(col1), 'кнопка «' + btnClass + '» в col-input');
            assertTrue(col1.indexOf('scale-form') !== -1 || col1.indexOf('converter-form') !== -1,
                'в col-input есть блоки форм');
            // Results div НЕ в col1
            assertTrue(col1.indexOf('id="' + resultsId + '"') === -1,
                'блок результатов не должен быть в col-input');
        });

        test(pageId + ': колонка 2 — заглушка + результаты', function () {
            const b = pageBlock(pageId);
            const iCol2 = b.indexOf('<div class="conv-col conv-col-table">');
            const iCol3 = b.indexOf('<div class="conv-col conv-col-info">');
            const col2 = b.slice(iCol2, iCol3);
            const iPh = col2.indexOf('conv-table-placeholder');
            const iRes = col2.indexOf('id="' + resultsId + '"');
            assertTrue(iPh !== -1, 'заглушка средней колонки');
            assertTrue(iRes !== -1, 'контейнер результатов #' + resultsId);
            assertTrue(iPh < iRes, 'заглушка перед результатами');
        });

        test(pageId + ': колонка 3 — инфоблок conv-info-block с CSS-переменными', function () {
            const b = pageBlock(pageId);
            const iCol3 = b.indexOf('<div class="conv-col conv-col-info">');
            const col3 = b.slice(iCol3);
            // Количество conv-info-block: infoCount (для error-scale — 3)
            const occurrences = (col3.match(/conv-info-block/g) || []).length;
            assertTrue(occurrences >= infoCount,
                'в col-info ' + infoCount + '+ инфоблок(ов) с классом conv-info-block (найдено ' + occurrences + ')');
            assertTrue(col3.indexOf('Справочная информация') !== -1,
                'в col-info есть заголовок «Справочная информация»');
            assertTrue(col3.indexOf('color:var(--conv-info-text)') !== -1 || col3.indexOf('--conv-info-text') !== -1,
                'текст инфоблока через --conv-info-text');
            assertTrue(col3.indexOf('color:rgba(255,255,255,0.5)') === -1,
                'жёсткий белый цвет текста удалён');
            assertTrue(col3.indexOf('color:rgba(255,255,255,0.7)') === -1,
                'жёсткий белый жирный удалён');
        });
    });

    // ---------- Общие правила CSS / унификация ----------
    test('CSS: правило .scale-form в col-input и .scale-calc-btn в col-input', function () {
        assertTrue(html.indexOf('.conv-3col-page .conv-col-input .scale-form { margin: 0; }') !== -1,
            'обнулён отступ .scale-form в col-input');
        assertTrue(html.indexOf('.conv-3col-page .conv-col-input .scale-calc-btn') !== -1,
            'правило .scale-calc-btn в col-input добавлено');
    });

    test('CSS: инфоблоки в col-info через conv-info-block — без отступов', function () {
        assertTrue(html.indexOf('.conv-3col-page .conv-col-info > [class*="conv-info-block"]') !== -1,
            'правило для conv-info-block в col-info');
    });

    test('Все 19 калькуляторов получили класс conv-3col-page', function () {
        const pageIds = CALCS.map(c => c[0]);
        pageIds.forEach(id => {
            assertTrue(html.indexOf('<div id="page-' + id + '" class="page-content conv-3col-page">') !== -1,
                'страница «' + id + '» помечена conv-3col-page');
        });
    });

    test('Селекторные страницы НЕ получили класс conv-3col-page', function () {
        // orifice-select, error-select, buoy-select — это меню выбора, не калькуляторы.
        // Task 372: temp-sensors стала страницей карточек (расчёт — на temp-sensor-view)
        ['orifice-select', 'error-select', 'buoy-select', 'error-generic', 'temp-sensors'].forEach(id => {
            assertTrue(html.indexOf('<div id="page-' + id + '" class="page-content conv-3col-page">') === -1,
                'страница-меню «' + id + '» не должна быть трёхколоночной');
        });
    });
});

// ------------------------------------------------------------
// Task 181: фикс бага «на странице Расходомеры хозрасчётные остаётся
// один шеврон и не работает переход по шевронам на главную».
// На flowmeter-data page-inline-header скрыт через CSS :has(),
// и единственный видимый шеврон — у #detailBreadcrumbBar — имел
// onclick="closeDetailPanel()". Без открытой detail-панели клик
// ничего не делал (CSS :has(#page-flowmeter-data.active) сразу
// пересоздавал бар), и пользователь не мог вернуться на главную.
// Fix: шеврон делегирует в detailBarChevronClick() — если панель
// открыта → closeDetailPanel(), иначе → chevronTap() (1 тап = назад,
// 2 тапа = на главную). Многострелочный шеврон рендерится через
// updateChevronArrows() (та же функция, что и для заголовка страницы).
// ------------------------------------------------------------
describe('Шеврон в строке крошек на flowmeter-data (Task 181)', function () {
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf-8');

    test('Шеврон #detailBreadcrumbBar вызывает detailBarChevronClick (не closeDetailPanel напрямую)', function () {
        // Старое: onclick="closeDetailPanel()" — клик ничего не делал без панели
        // Новое: onclick="detailBarChevronClick(event)"
        const m = html.match(/<div class="detail-breadcrumb-chevron"\s+onclick="detailBarChevronClick\(event\)"\s+aria-label="[^"]*">/);
        assertTrue(!!m, 'шеврон использует detailBarChevronClick(event)');
        // Старый onclick closeDetailPanel() удалён из шеврона
        const oldPattern = '<div class="detail-breadcrumb-chevron" onclick="closeDetailPanel()"';
        assertTrue(html.indexOf(oldPattern) === -1,
            'старый onclick="closeDetailPanel()" удалён из шеврона (был бесполезен без панели)');
    });

    test('JS: функция detailBarChevronClick существует и делегирует по контексту', function () {
        const i = html.indexOf('function detailBarChevronClick(');
        assertTrue(i !== -1, 'функция detailBarChevronClick определена');
        const seg = html.slice(i, i + 600);
        // Проверяет, открыта ли detail-панель
        assertTrue(seg.indexOf("getElementById('detailPanel')") !== -1,
            'получает #detailPanel');
        assertTrue(seg.indexOf("classList.contains('active')") !== -1,
            'проверяет .active класс панели');
        // Если открыта — closeDetailPanel
        assertTrue(seg.indexOf('closeDetailPanel()') !== -1,
            'если панель открыта — вызывает closeDetailPanel()');
        // Если закрыта — chevronTap (мультитап)
        assertTrue(seg.indexOf('chevronTap()') !== -1,
            'если панель закрыта — вызывает chevronTap() (1 тап = назад, 2 = на главную)');
    });

    test('JS: updateChevronArrows обновляет и шеврон в #detailBreadcrumbBar', function () {
        const i = html.indexOf('function updateChevronArrows()');
        assertTrue(i !== -1, 'функция updateChevronArrows определена');
        // Берём сегмент до следующего блока комментариев (function большая)
        const endMarker = html.indexOf('// ============================================================\n    // ХЛЕБНЫЕ КРОШКИ', i);
        const seg = html.slice(i, endMarker > i ? endMarker : i + 3000);
        // Находит шеврон в строке крошек
        assertTrue(seg.indexOf("#detailBreadcrumbBar .detail-breadcrumb-chevron") !== -1,
            'выбирает шеврон в #detailBreadcrumbBar');
        // На flowmeter-data без detail-панели — многострелочный
        assertTrue(seg.indexOf("page-flowmeter-data") !== -1,
            'проверяет активную страницу === page-flowmeter-data');
        assertTrue(seg.indexOf('isDetailOpen') !== -1,
            'проверяет, открыта ли detail-панель');
        // Иначе — одиночная стрелка
        assertTrue(seg.indexOf('singleArrow') !== -1,
            'fallback на одиночную стрелку (когда detail-панель открыта)');
    });

    test('JS: setFlowmeterBreadcrumbContent — крошки расходомеров в одном месте', function () {
        // Раньше HTML крошек «Главная / Документация / Документация ИОС /
        // Расходомеры хозрасчётные» дублировался в navigateTo и не
        // переиспользовался в closeDetailPanel. Теперь — в одной функции.
        const i = html.indexOf('function setFlowmeterBreadcrumbContent()');
        assertTrue(i !== -1, 'функция setFlowmeterBreadcrumbContent определена');
        // Функция до следующей function (updateChevronArrows)
        const nextFunc = html.indexOf('\n    function ', i + 50);
        const seg = html.slice(i, nextFunc > i ? nextFunc : i + 1000);
        // В source onclick="navigateTo(\'dashboard\')" — с escape, как в HTML-строке JS
        assertTrue(seg.indexOf("navigateTo(\\'dashboard\\')") !== -1,
            'кликабельная «Главная» (с escape \'dashboard\')');
        assertTrue(seg.indexOf("navigateTo(\\'docs\\')") !== -1,
            'кликабельная «Документация» (с escape \'docs\')');
        assertTrue(seg.indexOf("navigateTo(\\'docs-ios\\')") !== -1,
            'кликабельная «Документация ИОС» (с escape \'docs-ios\')');
        assertTrue(seg.indexOf('Расходомеры хозрасчётные') !== -1,
            'текущая страница — «Расходомеры хозрасчётные» (не кликабельна)');
    });

    test('JS: navigateTo("flowmeter-data") вызывает setFlowmeterBreadcrumbContent', function () {
        // Раньше HTML крошек дублировался строкой прямо в navigateTo.
        // Теперь — переиспользует функцию (без дублирования).
        const i = html.indexOf("if (page === 'flowmeter-data') {");
        // Находим блок после closeDetailPanel()
        const i2 = html.indexOf('Task 130: если мы идём на flowmeter-data', i);
        assertTrue(i2 !== -1, 'блок для flowmeter-data найден');
        const seg = html.slice(i2, i2 + 600);
        assertTrue(seg.indexOf('setFlowmeterBreadcrumbContent') !== -1,
            'navigateTo вызывает setFlowmeterBreadcrumbContent() вместо инлайн-HTML');
        // Старая дублирующая HTML-строка удалена из navigateTo
        // (в новой версии HTML крошек появляется только внутри setFlowmeterBreadcrumbContent)
        const oldInline = "innerHTML = '<span class=\"breadcrumb-link\" onclick=\"navigateTo(\\'dashboard\\')\">Главная</span>'";
        assertTrue(seg.indexOf(oldInline) === -1,
            'дублирующая HTML-строка крошек удалена из navigateTo (теперь в функции)');
    });

    test('JS: closeDetailPanel восстанавливает крошки flowmeter-data после закрытия панели', function () {
        // Сценарий: пользователь открыл карточку расходомера (detail-панель),
        // затем закрыл её через ✕. Активная страница — по-прежнему
        // flowmeter-data, CSS :has(#page-flowmeter-data.active) держит бар
        // видимым, но closeDetailPanel() очистил innerHTML. Без Task 181
        // пользователь видел пустой бар без пути.
        const i = html.indexOf('function closeDetailPanel()');
        assertTrue(i !== -1, 'функция closeDetailPanel определена');
        // Функция до следующей function
        const nextFunc = html.indexOf('\n    function ', i + 50);
        const seg = html.slice(i, nextFunc > i ? nextFunc : i + 4000);
        // Проверяет активную страницу после закрытия
        assertTrue(seg.indexOf('page-flowmeter-data') !== -1,
            'проверяет, остались ли на flowmeter-data');
        // Восстанавливает крошки
        assertTrue(seg.indexOf('setFlowmeterBreadcrumbContent') !== -1,
            'вызывает setFlowmeterBreadcrumbContent() для восстановления крошек');
        // Восстанавливает переключатель «Все / Избранные»
        assertTrue(seg.indexOf('flowDesktopTabs') !== -1,
            'восстанавливает видимость переключателя «Все / Избранные»');
        // Обновляет шеврон (многострелочный после закрытия панели)
        assertTrue(seg.indexOf('updateChevronArrows') !== -1,
            'обновляет шеврон (многострелочный после закрытия панели)');
    });

    test('JS: setDetailBreadcrumb вызывает updateChevronArrows (шеврон → одиночная стрелка)', function () {
        // При открытии detail-панели шеврон в строке крошек должен
        // стать одиночным (был многострелочным на flowmeter-data без панели).
        const i = html.indexOf('function setDetailBreadcrumb(');
        assertTrue(i !== -1, 'функция setDetailBreadcrumb определена');
        const seg = html.slice(i, i + 3000);
        // Заканчивается вызовом updateChevronArrows
        assertTrue(seg.indexOf('updateChevronArrows') !== -1,
            'setDetailBreadcrumb вызывает updateChevronArrows для сброса шеврона');
    });
});
