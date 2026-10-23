// ============================================================
// Task 397 — заявка: «Примени общее правило к приложению, если у
// пользователя, согласно его роли, нет доступа к определённому
// разделу, то кнопка данного раздела не должна отображаться».
//
// Обобщение правила Task 395 (кнопка «Работники» по матрице) на
// ВСЁ приложение:
//   · УНИВЕРСАЛЬНЫЙ проход в _applyRoleToUI: любой элемент с
//     onclick="navigateTo('страница')" (кроме хлебных крошек
//     .breadcrumb-link — контекстная навигация) виден ⟺ его
//     пропустит сам navigateTo (canAccess);
//   · карта JS_NAV_TARGETS — кнопки с onclick через
//     addEventListener (входы КИП ИОС, «Графики»);
//   · «Инженерные калькуляторы» нижнего бара — прежде «видна
//     всегда», у роли без calc.view вела на «Нет доступа»;
//   · композит docs|library|kip-ios (нижний бар + вкладка
//     «Документация» десктопа) упрощён до docs — кнопка видна
//     ⟺ переход возможен;
//   · нижний бар скрыт целиком, если ОБЕ кнопки скрыты («Запрет»).
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function extractMethod(src, name) {
    const start = src.indexOf(name + ': function(');
    if (start === -1) return null;
    const braceStart = src.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    return null;
}

function methodText(src, name) {
    const m = extractMethod(src, name);
    return m ? String(m) : '';
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// ============================================================
// 1. SRC — универсальный проход общего правила
// ============================================================
describe('Task 397 — SRC: универсальный проход', () => {

    test('проход по ВСЕМ элементам с onclick navigateTo', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_applyRoleToUI'));
        assertTrue(fn.indexOf("document.querySelectorAll('[onclick*=\"navigateTo(\"]')") !== -1,
            'селектор [onclick*="navigateTo("] жив');
        assertTrue(fn.indexOf("el.style.display = self.canAccess(m[1]) ? '' : 'none';") !== -1,
            'гейт = canAccess (тот же, что в navigateTo)');
    });

    test('хлебные крошки .breadcrumb-link — исключение (контекстная навигация)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_applyRoleToUI'));
        assertTrue(fn.indexOf("el.classList.contains('breadcrumb-link')") !== -1,
            'breadcrumb-link пропускается');
    });

    test('проход идёт ПЕРВЫМ — до спец-логики сайдбара/меню', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_applyRoleToUI'));
        const iUniversal = fn.indexOf('[onclick*="navigateTo("]');
        const iSidebar = fn.indexOf("querySelectorAll('.sidebar-item')");
        const iMenu = fn.indexOf("querySelectorAll('.menu-btn')");
        assertTrue(iUniversal !== -1 && iSidebar !== -1 && iMenu !== -1,
            'все три прохода живы');
        assertTrue(iUniversal < iSidebar && iUniversal < iMenu,
            'универсальный проход — первый (спец-скрытия фильтра 4/графиков не перебиваются)');
    });

    test('карта JS_NAV_TARGETS — кнопки с addEventListener-onclick', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_applyRoleToUI'));
        const targets = [
            ['devicesEntryBtn:', "'devices-prod'"],
            ['lockoutsEntryBtn:', "'lockouts-prod'"],
            ['valvesEntryBtn:', "'valves-prod'"],
            ['regulatorsEntryBtn:', "'regulators-prod'"],
            ['projectsEntryBtn:', "'projects-prod'"],
            ['cablesEntryBtn:', "'cable-journal-edit'"],
            ['plan114EntryBtn:', "'plan-114'"],
            ['chartsEntryBtn:', "'charts'"]
        ];
        targets.forEach(function(pair) {
            assertTrue(fn.indexOf(pair[0]) !== -1 && fn.indexOf(pair[1]) !== -1,
                'карта содержит ' + pair[0] + ' → ' + pair[1]);
        });
        assertTrue(fn.indexOf('self.canAccess(JS_NAV_TARGETS[id])') !== -1,
            'гейт карты = canAccess');
    });
});

// ============================================================
// 2. SRC — нижний бар + вкладка «Документация» десктопа
// ============================================================
describe('Task 397 — SRC: нижний бар и вкладка docs', () => {

    test('«Инженерные калькуляторы» нижнего бара — гейт по доступу', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_applyRoleToUI'));
        assertTrue(fn.indexOf(
            "'.dashboard-bottom-btn:not(.dashboard-bottom-btn-docs)'") !== -1,
            'селектор кнопки калькуляторов жив');
        assertTrue(fn.indexOf(
            "(isAll || allowed.indexOf('calculators') !== -1) ? '' : 'none'") !== -1,
            'нет calc.view — кнопка НЕ отображается (прежде «видна всегда»)');
    });

    test('композит docs|library|kip-ios упрощён до docs (2 места)', () => {
        // прежний композит больше не существует нигде
        assertFalse(INDEX_SRC.indexOf(
            "|| allowed.indexOf('docs') !== -1\n" +
            "                    || allowed.indexOf('library') !== -1\n" +
            "                    || allowed.indexOf('kip-ios') !== -1;") !== -1,
            'нижний бар: композит снят');
        assertFalse(INDEX_SRC.indexOf(
            "|| allowed.indexOf('docs') !== -1\n" +
            "                        || allowed.indexOf('library') !== -1\n" +
            "                        || allowed.indexOf('kip-ios') !== -1;") !== -1,
            'вкладка десктопа: композит снят');
        // новая форма: hasDocsAccess = isAll || docs
        const fn = stripComments(methodText(INDEX_SRC, '_applyRoleToUI'));
        assertTrue(fn.indexOf("const hasDocsAccess = isAll || allowed.indexOf('docs') !== -1;") !== -1,
            'нижний бар: hasDocsAccess = isAll || docs');
        assertTrue(fn.indexOf("tabAllowed = isAll || allowed.indexOf('docs') !== -1;") !== -1,
            'вкладка десктопа: tabAllowed = isAll || docs');
    });

    test('нижний бар скрыт целиком, если ОБЕ кнопки скрыты', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_applyRoleToUI'));
        assertTrue(fn.indexOf("getElementById('dashboardBottomBar')") !== -1,
            'бар запрашивается');
        assertTrue(fn.indexOf("bottomBarEl.style.display = anyBarBtnVisible ? '' : 'none';") !== -1,
            'бар скрыт без видимых кнопок');
    });
});

// ============================================================
// 3. VM — _applyRoleToUI на мок-DOM: правило по ролям
// ============================================================
function mkEl(cfg) {
    cfg = cfg || {};
    const cls = cfg.cls || [];
    return {
        style: {},
        textContent: '',
        getAttribute: function(k) {
            if (k === 'onclick') return cfg.onclick || '';
            if (k === 'data-page') return cfg.dataPage || null;
            if (k === 'data-requires') return cfg.dataRequires || null;
            return null;
        },
        classList: {
            contains: function(c) { return cls.indexOf(c) !== -1; },
            add: function() {}, remove: function() {}, toggle: function() {}
        },
        closest: function() { return null; },
        querySelector: function() { return null; },
        querySelectorAll: function(sel) {
            if (sel === '.sidebar-item') return cfg.items || [];
            if (sel === '.menu-btn') return cfg.menuBtns || [];
            if (sel === '.dashboard-bottom-btn') return cfg.bottomBtns || [];
            if (sel === '.pinned-item-cell') return [];
            return [];
        },
        previousElementSibling: null,
        nextElementSibling: null
    };
}

// Мок-DOM: навигационные элементы главной/сайдбара/бара/вкладок
function mockDoc(byIdExtra) {
    const calcBottom = mkEl({ onclick: "navigateTo('calculators')" });
    const docsBottom = mkEl({ cls: ['dashboard-bottom-btn', 'dashboard-bottom-btn-docs'],
                              onclick: "navigateTo('docs')" });
    const bottomBar = mkEl({ bottomBtns: [calcBottom, docsBottom] });
    const bc1 = mkEl({ cls: ['breadcrumb-link'], onclick: "navigateTo('dashboard')" });
    const bc2 = mkEl({ cls: ['breadcrumb-link'], onclick: "navigateTo('docs')" });
    const sbConverter = mkEl({ onclick: "navigateTo('converter'); toggleSidebar();" });
    const sbTickets = mkEl({ onclick: "navigateTo('tickets-4'); toggleSidebar();" });
    const sbWork = mkEl({ id: 'sidebarWorkScheduleBtn',
                          onclick: "navigateTo('work-schedule'); toggleSidebar();" });
    const mbCalc = mkEl({ onclick: "navigateTo('calc-kipa')" });
    const mbKipIos = mkEl({ onclick: "navigateTo('kip-ios')" });
    const mbFlow = mkEl({ id: 'flowmeterMenuBtn', onclick: "navigateTo('flowmeter-data')" });
    const mbWs = mkEl({ id: 'workScheduleMenuBtn', onclick: "navigateTo('work-schedule')" });
    const tabCalc = mkEl({ dataPage: 'calculators', onclick: "navigateTo('calculators')" });
    const tabDocs = mkEl({ dataPage: 'docs', onclick: "navigateTo('docs')" });
    const msBtn = mkEl({ onclick: "navigateTo('minesweeper')" });
    const pbBtn = mkEl({ onclick: "navigateTo('phonebook')" });
    const adminBtn = mkEl({ id: 'sidebarAdminBtn', onclick: "navigateTo('admin')" });
    const logoutBtn = mkEl({});
    const wnMobile = mkEl({ onclick: "navigateTo('whats-new')" });
    const wnDesktop = mkEl({ onclick: "navigateTo('whats-new')" });
    const devBtn = mkEl({ id: 'devicesEntryBtn' });
    const lockBtn = mkEl({});
    const cableBtn = mkEl({});
    const chartsBtn = mkEl({});
    const group = mkEl({ items: [sbConverter, sbTickets, sbWork] });

    const navEls = [calcBottom, docsBottom, bc1, bc2, sbConverter, sbTickets,
                    sbWork, mbCalc, mbKipIos, mbFlow, mbWs, tabCalc, tabDocs,
                    msBtn, pbBtn, adminBtn, wnMobile, wnDesktop];
    const byId = Object.assign({
        dashboardBottomBar: bottomBar,
        sidebarAdminBtn: adminBtn,
        sidebarLogoutBtn: logoutBtn,
        mobileWhatsNewBtn: wnMobile,
        desktopWhatsNewBtn: wnDesktop,
        minesweeperBtn: msBtn,
        phonebookBtn: pbBtn,
        flowmeterMenuBtn: mbFlow,
        workScheduleMenuBtn: mbWs,
        devicesEntryBtn: devBtn,
        lockoutsEntryBtn: lockBtn,
        cablesEntryBtn: cableBtn,
        chartsEntryBtn: chartsBtn
    }, byIdExtra || {});

    const doc = {
        querySelectorAll: function(sel) {
            if (sel === '.sidebar-item') return [sbConverter, sbTickets, sbWork, adminBtn];
            if (sel === '.sidebar-group') return [group];
            if (sel === '[onclick*="navigateTo("]') return navEls;
            if (sel === '.menu-btn') return [mbCalc, mbKipIos, mbFlow, mbWs];
            if (sel === '.desktop-top-bar-tab') return [tabCalc, tabDocs];
            if (sel === '.desktop-top-bar-divider') return [];
            if (sel === '.menu-btn-row') return [];
            if (sel === '.subsection-cell, .dev-swipe-cell') return [];
            if (sel === '.pinned-item-cell') return [];
            if (sel === '.pb-section') return [];
            return [];
        },
        querySelector: function(sel) {
            if (sel === '.dashboard-bottom-btn-docs') return docsBottom;
            if (sel === '.dashboard-bottom-btn:not(.dashboard-bottom-btn-docs)') return calcBottom;
            return null;
        },
        getElementById: function(id) { return byId[id] || null; }
    };
    return { doc: doc, els: { calcBottom: calcBottom, docsBottom: docsBottom,
                              bottomBar: bottomBar, bc1: bc1, bc2: bc2,
                              sbConverter: sbConverter, sbTickets: sbTickets,
                              sbWork: sbWork, mbCalc: mbCalc, mbKipIos: mbKipIos,
                              mbFlow: mbFlow, mbWs: mbWs, tabCalc: tabCalc,
                              tabDocs: tabDocs, msBtn: msBtn, adminBtn: adminBtn,
                              wnMobile: wnMobile, devBtn: devBtn,
                              chartsBtn: chartsBtn } };
}

const VM_ROLE_ACCESS = {
    'Запрет': ['dashboard'],
    'Общий доступ': ['dashboard', 'calculators', 'converter', 'calc-kipa'],
    'КИП8': ['dashboard', 'calculators', 'calc-kipa', 'docs', 'library',
             'tickets-4', 'minesweeper', 'whats-new'],
    'КИП ИОС': ['dashboard', 'calculators', 'docs', 'kip-ios', 'devices-prod',
                'plan-114', 'device-favorites', 'whats-new'],
    'Админ': ['*']
};

function vmHost(role) {
    const md = mockDoc();
    const host = new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_applyRoleToUI') + ',\n' +
        methodText(INDEX_SRC, 'canAccess') + ',\n' +
        methodText(INDEX_SRC, '_hasRestrictedKipIos') + ',\n' +
        '_cachedRole: ' + JSON.stringify(role) + ',' +
        'ROLE_ACCESS: ' + JSON.stringify(VM_ROLE_ACCESS) +
        '});')(md.doc);
    return { host: host, md: md };
}

describe('Task 397 — VM: общее правило по ролям', () => {

    test('«Запрет» — ВСЕ кнопки разделов скрыты, бар скрыт, крошки не тронуты', () => {
        const t = vmHost('Запрет');
        t.host._applyRoleToUI();
        assertEqual(t.md.els.calcBottom.style.display, 'none',
            '«Инженерные калькуляторы» — скрыта (прежде «видна всегда» → «Нет доступа»)');
        assertEqual(t.md.els.docsBottom.style.display, 'none',
            '«Документация» — скрыта');
        assertEqual(t.md.els.bottomBar.style.display, 'none',
            'нижний бар скрыт целиком (обе кнопки недоступны)');
        assertEqual(t.md.els.bc1.style.display, undefined,
            'крошка «Главная» не тронута (исключение)');
        assertEqual(t.md.els.bc2.style.display, undefined,
            'крошка «Документация» не тронута');
        assertEqual(t.md.els.sbConverter.style.display, 'none',
            'сайдбар «Конвертер единиц» — скрыт');
        assertEqual(t.md.els.mbCalc.style.display, 'none',
            'меню «КИП и А» — скрыто');
        assertEqual(t.md.els.tabCalc.style.display, 'none',
            'вкладка «Инженерные калькуляторы» — скрыта');
        assertEqual(t.md.els.tabDocs.style.display, 'none',
            'вкладка «Документация» — скрыта');
        assertEqual(t.md.els.msBtn.style.display, 'none',
            '«Сапёр» — скрыт');
        assertEqual(t.md.els.adminBtn.style.display, 'none',
            '«Админ-панель» — скрыта (не Админ)');
        assertEqual(t.md.els.wnMobile.style.display, 'none',
            '«Что нового» — скрыто');
        assertEqual(t.md.els.devBtn.style.display, 'none',
            'карта JS: «Приборы» — скрыта');
        assertEqual(t.md.els.chartsBtn.style.display, 'none',
            'карта JS: «Графики» — скрыта (нет права + не Electron)');
    });

    test('«Общий доступ» — калькуляторы ВИДНЫ, документация скрыта, бар виден', () => {
        const t = vmHost('Общий доступ');
        t.host._applyRoleToUI();
        assertEqual(t.md.els.calcBottom.style.display, '',
            '«Инженерные калькуляторы» — видна (calc.view есть)');
        assertEqual(t.md.els.docsBottom.style.display, 'none',
            '«Документация» — скрыта (нет доступа)');
        assertEqual(t.md.els.bottomBar.style.display, '',
            'бар виден (одна кнопка жива)');
        assertEqual(t.md.els.sbConverter.style.display, '',
            'сайдбар «Конвертер единиц» — виден');
        assertEqual(t.md.els.sbTickets.style.display, 'none',
            'сайдбар «Билеты» — скрыт');
        assertEqual(t.md.els.mbKipIos.style.display, 'none',
            'меню «КИП ИОС» — скрыто');
    });

    test('«КИП8» — билиотека/билеты/секретные видны, КИП ИОС/расходомеры/табель скрыты', () => {
        const t = vmHost('КИП8');
        t.host._applyRoleToUI();
        assertEqual(t.md.els.calcBottom.style.display, '', 'калькуляторы — видна');
        assertEqual(t.md.els.docsBottom.style.display, '', 'документация — видна (docs в allowed)');
        assertEqual(t.md.els.bottomBar.style.display, '', 'бар виден');
        assertEqual(t.md.els.sbTickets.style.display, '', 'сайдбар «Билеты» — виден');
        assertEqual(t.md.els.mbKipIos.style.display, 'none', 'меню «КИП ИОС» — скрыто');
        assertEqual(t.md.els.mbFlow.style.display, 'none', '«Расходомеры» — скрыты');
        assertEqual(t.md.els.mbWs.style.display, 'none', '«Табель» — скрыт');
        assertEqual(t.md.els.msBtn.style.display, '', '«Сапёр» — виден (secret.view)');
        assertEqual(t.md.els.wnMobile.style.display, '', '«Что нового» — видно');
    });

    test('«КИП ИОС» — разделы КИП ИОС видны (карта JS: «Приборы»)', () => {
        const t = vmHost('КИП ИОС');
        t.host._applyRoleToUI();
        assertEqual(t.md.els.mbKipIos.style.display, '', 'меню «КИП ИОС» — видно');
        assertEqual(t.md.els.devBtn.style.display, '',
            'карта JS: «Приборы» — видна (kipios)');
        assertEqual(t.md.els.mbFlow.style.display, 'none', '«Расходомеры» — скрыты (нет права)');
        assertEqual(t.md.els.sbTickets.style.display, 'none', 'билеты — скрыты (нет library)');
    });

    test('«Админ» — всё видно', () => {
        const t = vmHost('Админ');
        t.host._applyRoleToUI();
        assertEqual(t.md.els.calcBottom.style.display, '', 'калькуляторы — видна');
        assertEqual(t.md.els.docsBottom.style.display, '', 'документация — видна');
        assertEqual(t.md.els.bottomBar.style.display, '', 'бар виден');
        assertEqual(t.md.els.adminBtn.style.display, '', '«Админ-панель» — видна');
        assertEqual(t.md.els.mbWs.style.display, '', '«Табель» — виден');
        assertEqual(t.md.els.devBtn.style.display, '', 'карта JS: «Приборы» — видна');
    });

    test('смена роли: симметричный проход ВОССТАНАВЛИВАЕТ кнопки', () => {
        const t = vmHost('Запрет');
        t.host._applyRoleToUI();
        assertEqual(t.md.els.calcBottom.style.display, 'none', 'Запрет: калькуляторы скрыты');
        // роль сменилась — _applyRoleToUI вызывается повторно (как в _fetchMyAccess)
        t.host._cachedRole = 'Общий доступ';
        t.host._applyRoleToUI();
        assertEqual(t.md.els.calcBottom.style.display, '',
            'Общий доступ: калькуляторы ВОССТАНОВЛЕНЫ');
        assertEqual(t.md.els.docsBottom.style.display, 'none', 'документация всё ещё скрыта');
        // и обратно в Запрет
        t.host._cachedRole = 'Запрет';
        t.host._applyRoleToUI();
        assertEqual(t.md.els.calcBottom.style.display, 'none', 'Запрет: снова скрыты');
        assertEqual(t.md.els.bottomBar.style.display, 'none', 'бар снова скрыт');
    });
});

// ============================================================
// 4. SW-кэш поднят (фронтенд менялся)
// ============================================================
describe('Task 397 — SW-кэш', () => {
    test('SW поднят до v625 (Task 397 — фронтенд менялся)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v757') !== -1,
            'sw.js: CACHE_VERSION kipia-test-v757');
        assertTrue(SW_SRC.indexOf('kipia-test-v758') === -1,
            'двойного бампа нет (v626 не существует)');
    });
});
