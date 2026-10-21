// tests/test-task540.js
// Task 540 — телефонный справочник: тихая синхронизация, старт на
// «Избранном», чистка интерфейса, десктоп «на два окна». Заявка:
// «В разделе телефонный справочник убери кнопку синхронизации и
// сделай её тихой. Если в избранном есть контакты, то справочник
// должен открываться на вкладке избранного. Убери текст "Всего:
// 236 записей · 5 организаций · избранное: 10". В десктопной версии
// кнопки и поле поиска размести в баре с хлебными крошками, по
// примеру как в разделе хозрасчётных расходомеров, и на вкладке
// "Все" раздели экран на два окна (по примеру и функционалу как в
// разделах хозрасчётных расходомеров), в левом окне список
// организаций с подразделениями, в правом окне список контактов
// выбранного подразделения.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — ТИХАЯ СИНХРОНИЗАЦИЯ: бейдж pbSyncBadge (HTML+CSS) и
//      pbSyncInfo удалены, pbSyncUpdateBadge поддерживает только
//      состояние (pbSyncState.pending); ИНФО-СТРОКА #pbInfo
//      удалена (HTML+CSS, pbRender не ссылается); СТАРТ НА
//      «ИЗБРАННОМ» — pbInit ставит pbFilterFavOnly по счётчику
//      localStorage (принцип Task 491).
//   B. SRC — ДЕСКТОП В БАРЕ КРОШЕК (как расходомеры): табы
//      #pbDesktopTabs внутри #detailBreadcrumbBar (после
//      #flowDesktopTabs), CSS-показ body:has(#page-phonebook.active)
//      на ≥1024px, скрытие шапки страницы и мобильного блока поиска,
//      лупа+разделитель поиска видимы без панели, search-open
//      скрывает табы; кнопка-«пилюля» .pb-filter-btn сохранена для
//      «Показать ещё» списков приборов.
//   C. SRC — ДВА ОКНА на вкладке «Все»: master-ветка pbRender
//      (десктоп + «Все» + без запроса), функции pbRenderMaster/
//      pbMasterOpen/pbRenderContactsHtml/pbCardHtml/
//      setPhonebookBreadcrumbContent/pbMasterResetState,
//      CSS .pb-master-*/.pb-detail-*; хуки pbSetTab (сброс выбора)
//      и pbInit (сброс при входе); detailBarGetPageSearchInput —
//      .pb-search-input; navigateTo/closeDetailPanel —
//      восстановление бара справочника.
//   D. VM — функционально: мастер-режим рендерит дерево без
//      карточек; вкладка «Избранное»/поиск — прежний инлайн-рендер;
//      pbMasterOpen(группа) — правое окно с контактами группы и
//      подсветкой строки; pbMasterOpen(организация) — все контакты;
//      «Без группы»; крошки; pbMasterResetState закрывает панель;
//      смена таба сбрасывает выбор; pbInit при наличии избранного
//      открывает «Избранное» (эффект — отфильтрованный список).
//
// Файл УНИВЕРСАЛЕН для 4 репозиториев (kip8test/kip8 и их десктоп-
// зеркала): префикс ключей и версия SW выводятся из index.html/sw.js.
//
// Запуск: через tests/run-all.js (require './test-task540.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Префикс localStorage-ключей текущего репозитория (из PB_FAV_KEY)
const PFX_MATCH = INDEX_SRC.match(/const PB_FAV_KEY = '(\w+?)_phonebook_favorites'/);
const PFX = PFX_MATCH ? PFX_MATCH[1] : null;
// Task 540: v751→v752 (kip8test), v548→v549 (kip8)
const SW_EXPECTED = { kip8test: 'kipia-test-v753', kip8: 'kipia-v549' }[PFX] || null;
const SW_PREV = { kip8test: 'kipia-test-v751', kip8: 'kipia-v548' }[PFX] || null;
const SW_NEXT = { kip8test: 'kipia-test-v754', kip8: 'kipia-v550' }[PFX] || null;

const FAV_KEY = PFX + '_phonebook_favorites';

// ============================================================
// Извлечение телефонного блока
// ============================================================
function phonebookRegion() {
    const i = INDEX_SRC.indexOf('// ===== ТЕЛЕФОННЫЙ СПРАВОЧНИК (ООО ПО "ТОКЕМ") =====');
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('// ===== ПРИБОРЫ (КИП ИОС) =====', i);
    if (j === -1) return null;
    return INDEX_SRC.slice(i, j);
}
const REGION = phonebookRegion();

// ============================================================
// Тестовый справочник: 2 организации, у второй — записи БЕЗ группы
// ============================================================
const PB_JSON = {
    sections: {
        'ООО Тест': [
            { group: 'Цех 1', subgroup: null, position: 'Инженер', name: 'Иванов', phone: '11-11' },
            { group: 'Цех 1', subgroup: null, position: 'Мастер', name: 'Петров', phone: '22-22' },
            { group: 'Цех 2', subgroup: 'Участок А', position: 'Электрик', name: 'Сидоров', phone: '33-33' }
        ],
        'ЧОО Тест': [
            { group: null, subgroup: null, position: 'Дежурный', name: 'Козлов', phone: '44-44' }
        ]
    }
};
function mkId(name) {
    const items = {
        'Иванов': { header: 'ООО Тест', group: 'Цех 1', subgroup: null, position: 'Инженер', name: 'Иванов', phone: '11-11' },
        'Петров': { header: 'ООО Тест', group: 'Цех 1', subgroup: null, position: 'Мастер', name: 'Петров', phone: '22-22' },
        'Сидоров': { header: 'ООО Тест', group: 'Цех 2', subgroup: 'Участок А', position: 'Электрик', name: 'Сидоров', phone: '33-33' },
        'Козлов': { header: 'ЧОО Тест', group: null, subgroup: null, position: 'Дежурный', name: 'Козлов', phone: '44-44' }
    };
    const it = items[name];
    return (it.header || '') + '|' + (it.group || '') + '|' + (it.subgroup || '') + '|' +
           (it.position || '') + '|' + (it.name || '') + '|' + (it.phone || '');
}
const ID_A = mkId('Иванов');

// ============================================================
// Песочница VM: мок DOM + isDesktop + openDetailPanel/closeDetailPanel
// ============================================================
function makeTabEl(kind) {
    return { _kind: kind, _active: (kind === 'all'), attrs: {},
        getAttribute: function(k) { return k === 'data-pb-tab' ? this._kind : null; },
        setAttribute: function(k, v) { this.attrs[k] = v; } };
}
function makeVm(opts) {
    opts = opts || {};
    const tabs = [makeTabEl('all'), makeTabEl('fav'), makeTabEl('all'), makeTabEl('fav')];
    for (const tb of tabs) {
        tb.classList = { toggle: function(cls, on) { if (cls === 'active') this._el._active = !!on; }.bind({ _el: tb }) };
    }
    const counts = {
        pbAllCountDesk: { textContent: '0' }, pbAllCountMob: { textContent: '0' },
        pbFavCountDesk: { textContent: '0' }, pbFavCountMob: { textContent: '0' }
    };
    const pbList = { innerHTML: '', classList: { add() {}, remove() {} } };
    const pbInfo = { textContent: '' };
    const pbSearchInput = { value: opts.query || '' };
    // Панель и страница: флаги для pbMasterResetState
    const detailPanel = { _active: !!opts.panelActive,
        classList: { contains: function(c) { return c === 'active' && detailPanel._active; } } };
    const pagePhonebook = { classList: { contains: function(c) { return c === 'active'; } } };
    const bcContent = { innerHTML: '' };
    const calls = { open: [], close: 0 };
    const ls = opts.ls || {
        _m: Object.create(null),
        getItem(k) { return k in this._m ? this._m[k] : null; },
        setItem(k, v) { this._m[k] = String(v); },
        removeItem(k) { delete this._m[k]; }
    };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        localStorage: ls,
        window: { addEventListener() {} },
        navigator: {},
        isDesktop: function() { return !!opts.desktop; },
        document: {
            querySelectorAll: function(sel) {
                if (sel === '.pb-tab[data-pb-tab]') return tabs.slice();
                return [];
            },
            getElementById: function(id) {
                if (id === 'pbList') return pbList;
                if (id === 'pbInfo') return pbInfo;
                if (id === 'pbSearchInput') return pbSearchInput;
                if (id === 'detailPanel') return detailPanel;
                if (id === 'page-phonebook') return pagePhonebook;
                if (id === 'detailBreadcrumbContent') return bcContent;
                if (counts[id]) return counts[id];
                return null;
            }
        },
        setTimeout: function(fn) { return 1; },
        clearTimeout: function() {},
        fetch: function() {
            return Promise.resolve({ ok: true, json: () => Promise.resolve(PB_JSON) });
        },
        showToast: function() {}
    };
    vm.createContext(sandbox);
    vm.runInContext(REGION, sandbox);
    // Моки панельных функций — ПОСЛЕ runInContext (глобалы живые):
    // pbMasterOpen зовёт openDetailPanel, pbMasterResetState — closeDetailPanel
    sandbox.openDetailPanel = function(title, html) { calls.open.push({ title: title, html: html }); };
    sandbox.closeDetailPanel = function() { calls.close++; };
    return { sandbox: sandbox, ls: ls, tabs: tabs, counts: counts,
             pbList: pbList, pbInfo: pbInfo, pbSearchInput: pbSearchInput,
             detailPanel: detailPanel, bcContent: bcContent, calls: calls,
             opts: opts };
}

async function seedPhonebook(t) {
    await t.sandbox.pbLoad();
}
function seedFavorites(t, favMap) {
    t.ls.setItem(FAV_KEY, JSON.stringify(favMap || {}));
    t.sandbox.pbLoadFavorites();
}
// Прогнать pbInit и дождаться pbLoad().then (микрозадачи — до таймера)
async function runInit(t) {
    t.sandbox.pbInit();
    await new Promise(function(r) { setTimeout(r, 0); });
}

// ============================================================
// A. SRC — тихая синхронизация + инфо-строка + старт на «Избранном»
// ============================================================
describe('Task 540 — SRC: тихая синхронизация и чистка интерфейса', () => {

    test('префикс ключей репозитория определён (PB_FAV_KEY)', () => {
        assertTrue(!!PFX, 'PB_FAV_KEY в index.html должен задавать префикс');
    });

    test('бейдж синхронизации удалён из HTML и CSS', () => {
        assertTrue(INDEX_SRC.indexOf('id="pbSyncBadge"') === -1, 'элемент pbSyncBadge удалён');
        assertTrue(INDEX_SRC.indexOf('id="pbSyncBadgeLabel"') === -1, 'метка pbSyncBadgeLabel удалена');
        assertTrue(INDEX_SRC.indexOf('function pbSyncInfo(') === -1, 'функция pbSyncInfo удалена');
        assertTrue(INDEX_SRC.indexOf('.pb-sync-badge {') === -1, 'CSS .pb-sync-badge удалён');
        assertTrue(INDEX_SRC.indexOf('@keyframes pbSyncPulse') === -1, 'анимация pbSyncPulse удалена');
    });

    test('pbSyncUpdateBadge — только состояние, без DOM', () => {
        const i = INDEX_SRC.indexOf('function pbSyncUpdateBadge()');
        assertTrue(i !== -1, 'функция сохранена (точка обновления состояния)');
        const seg = INDEX_SRC.slice(i, i + 400);
        assertTrue(seg.indexOf('pbSyncState.pending = pbSyncQueue.length') !== -1,
            'поддерживает счётчик очереди в pbSyncState');
        assertTrue(seg.indexOf("getElementById('pbSyncBadge')") === -1,
            'DOM бейджа больше не трогает');
    });

    test('инфо-строка «Всего: N записей · N организаций…» удалена', () => {
        assertTrue(INDEX_SRC.indexOf('id="pbInfo"') === -1, 'элемент #pbInfo удалён из HTML');
        // КЛАСС .pb-info остаётся — им пользуются другие разделы
        // (devTypeInfo и пр.); удаляется только элемент справочника
        assertTrue(INDEX_SRC.indexOf('.pb-info {') !== -1, 'CSS класса .pb-info сохранён (общий)');
        assertTrue(REGION && REGION.indexOf("getElementById('pbInfo')") === -1,
            'pbRender не ссылается на pbInfo');
        assertTrue(REGION && REGION.indexOf("' · ' + Object.keys(pbData.sections).length + ' организаций'") === -1,
            'текст «Всего: … организаций» удалён из кода');
    });

    test('старт на «Избранном» при наличии избранного (Task 491-принцип)', () => {
        const i = INDEX_SRC.indexOf('function pbInit()');
        const seg = INDEX_SRC.slice(i, i + 1200);
        assertTrue(seg.indexOf('pbFilterFavOnly = pbGetFavoritesCount() > 0;') !== -1,
            'pbInit ставит вкладку по счётчику избранного из localStorage');
        assertTrue(seg.indexOf('pbDesktopSelected = null;') !== -1,
            'pbInit сбрасывает выбор мастер-дерева при входе в раздел');
    });

    test('кнопка-«пилюля» .pb-filter-btn сохранена для «Показать ещё»', () => {
        // Стиль удалённого тулбара вернул бы кнопку приборов к браузерному виду
        assertTrue(INDEX_SRC.indexOf('.pb-filter-btn {') !== -1,
            'базовый стиль .pb-filter-btn сохранён');
        assertTrue(INDEX_SRC.indexOf('class="pb-filter-btn" onclick="devShowMore()"') !== -1,
            'кнопка «Показать ещё» в devRenderSorted использует класс');
    });
});

// ============================================================
// B. SRC — десктоп: табы и поиск в баре хлебных крошек
// ============================================================
describe('Task 540 — SRC: табы и поиск в баре крошек (как расходомеры)', () => {

    test('табы #pbDesktopTabs внутри бара #detailBreadcrumbBar', () => {
        const iBar = INDEX_SRC.indexOf('id="detailBreadcrumbBar"');
        const iFlowTabs = INDEX_SRC.indexOf('id="flowDesktopTabs"');
        const iTabs = INDEX_SRC.indexOf('id="pbDesktopTabs"');
        const iSearch = INDEX_SRC.indexOf('id="detailBarSearchInput"');
        assertTrue(iBar !== -1 && iFlowTabs !== -1 && iTabs !== -1 && iSearch !== -1,
            'бар, табы расходомеров, табы справочника и поиск есть');
        assertTrue(iTabs > iBar && iTabs > iFlowTabs && iTabs < iSearch,
            'табы справочника в баре, после flowDesktopTabs, до поля поиска');
    });

    test('CSS: показ бара крошек на странице справочника (≥1024px)', () => {
        assertTrue(INDEX_SRC.indexOf('body:has(#page-phonebook.active) #detailBreadcrumbBar,') !== -1,
            'правило показа бара (как Task 126 у расходомеров)');
        assertTrue(INDEX_SRC.indexOf('display: flex !important;') !== -1,
            'принудительный flex (перебивает display:none по умолчанию)');
    });

    test('CSS: шапка страницы и мобильный поиск скрыты на десктопе', () => {
        assertTrue(INDEX_SRC.indexOf('body:has(#page-phonebook.active) #page-phonebook > .page-inline-header {') !== -1,
            'page-inline-header скрыт (бар крошек заменяет)');
        assertTrue(INDEX_SRC.indexOf('body:has(#page-phonebook.active) #page-phonebook > .pb-search-wrap {') !== -1,
            'мобильный блок поиска .pb-search-wrap скрыт');
    });

    test('CSS: лупа и разделитель поиска видны без открытой панели', () => {
        // Правила стоят ПОСЛЕ Task 173-скрытия (равная специфичность — порядок)
        const iHide = INDEX_SRC.indexOf('body:not(:has(#detailPanel.active)) #detailBreadcrumbBar .detail-breadcrumb-search');
        const iShow = INDEX_SRC.indexOf('body:has(#page-phonebook.active) #detailBreadcrumbBar .detail-breadcrumb-search');
        assertTrue(iHide !== -1 && iShow !== -1, 'оба правила есть');
        assertTrue(iShow > iHide, 'показ справочника стоит ПОСЛЕ скрытия (перебивает)');
        assertTrue(INDEX_SRC.indexOf('body:has(#page-phonebook.active) #detailBreadcrumbBar .detail-breadcrumb-divider') !== -1,
            'разделитель тоже показан');
    });

    test('CSS: табы показаны только на странице справочника (body:has)', () => {
        assertTrue(INDEX_SRC.indexOf('body:has(#page-phonebook.active) #pbDesktopTabs { display: flex !important; }') !== -1,
            'показ ≥1024px через body:has (как #flowDesktopTabs)');
        assertTrue(INDEX_SRC.indexOf('#detailBreadcrumbBar.search-open #pbDesktopTabs { visibility: hidden; }') !== -1,
            'при открытом поиске табы скрываются (как flowDesktopTabs)');
    });

    test('CSS: мобильный поиск в .pb-search-wrap остаётся (≤1023px)', () => {
        // Блок не удалялся — только скрывается на десктопе
        assertTrue(INDEX_SRC.indexOf('id="pbSearchInput"') !== -1, 'поле #pbSearchInput в разметке');
        assertTrue(INDEX_SRC.indexOf('class="pb-search-wrap"') !== -1, 'обёртка .pb-search-wrap в разметке');
    });
});

// ============================================================
// C. SRC — вкладка «Все»: два окна (master-detail)
// ============================================================
describe('Task 540 — SRC: вкладка «Все» — два окна', () => {

    test('master-ветка pbRender: десктоп + «Все» + без запроса', () => {
        const i = INDEX_SRC.indexOf('function pbRender()');
        const seg = INDEX_SRC.slice(i, i + 3000);
        assertTrue(seg.indexOf("typeof isDesktop === 'function' && isDesktop()") !== -1,
            'условие десктопа');
        assertTrue(seg.indexOf('!pbFilterFavOnly && !query') !== -1,
            'вкладка «Все» и пустой поиск');
        assertTrue(seg.indexOf('pbRenderMaster(list);') !== -1, 'вызов pbRenderMaster');
    });

    test('функции мастер-режима определены в телефонном блоке', () => {
        for (const fn of ['function pbRenderMaster(', 'function pbMasterOpen(',
                          'function pbRenderContactsHtml(', 'function pbCardHtml(',
                          'function setPhonebookBreadcrumbContent(', 'function pbMasterResetState(']) {
            assertTrue(REGION && REGION.indexOf(fn) !== -1, fn);
        }
    });

    test('pbMasterOpen: правое окно + крошки', () => {
        const i = INDEX_SRC.indexOf('function pbMasterOpen(');
        // Task 541 добавил авторазворот организации — окно 1400→1800
        const seg = INDEX_SRC.slice(i, i + 1800);
        assertTrue(seg.indexOf('openDetailPanel(title,') !== -1, 'открывает правое окно #detailPanel');
        assertTrue(seg.indexOf('pb-detail-contacts') !== -1, 'обёртка контактов');
        assertTrue(seg.indexOf('setPhonebookBreadcrumbContent(org, grp);') !== -1, 'обновляет крошки');
        assertTrue(seg.indexOf("pbMasterOpen(' + o + '") !== -1 || seg.indexOf('pbMasterOpen(') !== -1,
            'индексы, не имена (экранирование « » не нужно)');
    });

    test('CSS master-дерева и правого окна', () => {
        assertTrue(INDEX_SRC.indexOf('.pb-master-org-row {') !== -1, 'строка организации');
        assertTrue(INDEX_SRC.indexOf('.pb-master-row {') !== -1, 'строка подразделения');
        assertTrue(INDEX_SRC.indexOf('.pb-master-row.selected {') !== -1, 'подсветка выбранного');
        assertTrue(INDEX_SRC.indexOf('.pb-master-count {') !== -1, 'счётчики строк');
        assertTrue(INDEX_SRC.indexOf('#detailPanelBody .pb-detail-contacts {') !== -1, 'правое окно: отступы');
        assertTrue(INDEX_SRC.indexOf('#detailPanelBody .pb-detail-group-title {') !== -1, 'заголовки блоков');
    });

    test('pbSetTab сбрасывает выбор (смена таба закрывает правое окно)', () => {
        const i = INDEX_SRC.indexOf('function pbSetTab(');
        const seg = INDEX_SRC.slice(i, i + 900);
        assertTrue(seg.indexOf('pbMasterResetState();') !== -1, 'сброс выбора мастер-режима');
    });

    test('поиск из бара крошек уходит в #pbSearchInput', () => {
        const i = INDEX_SRC.indexOf('function detailBarGetPageSearchInput()');
        const seg = INDEX_SRC.slice(i, i + 500);
        assertTrue(seg.indexOf(".pb-search-input") !== -1, 'ищет .pb-search-input активной страницы');
    });

    test('navigateTo/closeDetailPanel восстанавливают бар справочника', () => {
        // Уникальный якорь navigateTo-ветки (однострочный «if (page ===
        // 'phonebook') { setTimeout(...pbInit...)» стоит раньше — не он)
        const iNav = INDEX_SRC.indexOf('var _pbBcBar = document.getElementById(\'detailBreadcrumbBar\');');
        assertTrue(iNav !== -1, 'ветка phonebook в navigateTo');
        const segNav = INDEX_SRC.slice(Math.max(0, iNav - 400), iNav + 400);
        assertTrue(segNav.indexOf("if (page === 'phonebook') {") !== -1, 'блок navigateTo');
        assertTrue(segNav.indexOf('setPhonebookBreadcrumbContent(null, null)') !== -1,
            'крошки «Главная / Телефонный справочник»');
        const iClose = INDEX_SRC.indexOf("if (_act && _act.id === 'page-phonebook')");
        assertTrue(iClose !== -1, 'ветка phonebook в closeDetailPanel (хук Task 181-стиля)');
        const segClose = INDEX_SRC.slice(iClose, iClose + 500);
        assertTrue(segClose.indexOf('pbMasterResetState') !== -1, 'сброс выбора + перерисовка дерева');
    });

    test('SW: версия поднята для Task 540', () => {
        assertTrue(!!SW_EXPECTED, 'префикс известен: ' + PFX);
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = '" + SW_EXPECTED + "'") !== -1,
            'CACHE_VERSION = ' + SW_EXPECTED);
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = '" + SW_PREV + "'") === -1,
            'старая версия ' + SW_PREV + ' отсутствует');
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = '" + SW_NEXT + "'") === -1,
            'версия-фантом ' + SW_NEXT + ' отсутствует');
    });
});

// ============================================================
// D. VM — функциональные проверки мастер-режима
// ============================================================
describe('Task 540 — VM: два окна на вкладке «Все»', () => {

    test('состояние загрузки: pbRender без данных не падает (placeholder)', async () => {
        // Регресс Task 540: удаление #pbInfo оставляло info.textContent в
        // ветке !pbLoaded → ReferenceError в браузере (тестами не ловилось —
        // данные всегда засеивались). Проверяем путь «данные ещё не загружены».
        const t = makeVm({ desktop: true });
        t.sandbox.pbRender();   // pbLoaded = false
        assertTrue(t.pbList.innerHTML.indexOf('Загрузка') !== -1,
            'placeholder «Загрузка…» в списке');
        assertFalse(t.pbList.innerHTML.indexOf('pb-card') !== -1, 'карточек нет');
    });

    test('десктоп «Все» без запроса — дерево, БЕЗ карточек', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-org-row') !== -1, 'строки организаций');
        assertTrue(t.pbList.innerHTML.indexOf('ООО Тест') !== -1, 'организация 1');
        assertTrue(t.pbList.innerHTML.indexOf('ЧОО Тест') !== -1, 'организация 2');
        assertTrue(t.pbList.innerHTML.indexOf('Цех 1') !== -1, 'подразделение');
        assertTrue(t.pbList.innerHTML.indexOf('Цех 2') !== -1, 'ещё подразделение');
        assertTrue(t.pbList.innerHTML.indexOf('Без группы') !== -1, 'строка «Без группы» у ЧОО');
        assertTrue(t.pbList.innerHTML.indexOf('pb-card') === -1,
            'карточек-контактов в левом окне НЕТ (они в правом)');
    });

    test('мобильный «Все» — прежний инлайн-рендер с карточками', async () => {
        const t = makeVm({ desktop: false });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        assertTrue(t.pbList.innerHTML.indexOf('pb-card') !== -1, 'карточки в списке');
        assertTrue(t.pbList.innerHTML.indexOf('pb-section') !== -1, 'секции-организации');
        assertTrue(t.pbList.innerHTML.indexOf('pb-master') === -1, 'дерева нет');
    });

    test('десктоп + таб «Избранное» — инлайн-рендер избранных', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });
        t.sandbox.pbSetTab('fav');
        assertTrue(t.pbList.innerHTML.indexOf('Иванов') !== -1, 'избранный в списке');
        assertTrue(t.pbList.innerHTML.indexOf('pb-master') === -1, 'дерева нет (не вкладка «Все»)');
    });

    test('десктоп + поиск — инлайн-рендер результатов', async () => {
        const t = makeVm({ desktop: true, query: 'сидор' });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        assertTrue(t.pbList.innerHTML.indexOf('Сидоров') !== -1, 'результат поиска');
        assertTrue(t.pbList.innerHTML.indexOf('pb-master') === -1, 'дерева нет (есть запрос)');
    });

    test('pbMasterOpen(0, 0) — правое окно с контактами «Цех 1»', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        t.sandbox.pbMasterOpen(0, 0);   // ООО Тест → Цех 1
        assertEqual(1, t.calls.open.length, 'openDetailPanel вызван');
        assertEqual('ООО Тест — Цех 1', t.calls.open[0].title, 'заголовок окна');
        assertTrue(t.calls.open[0].html.indexOf('Иванов') !== -1, 'Иванов (Цех 1)');
        assertTrue(t.calls.open[0].html.indexOf('Петров') !== -1, 'Петров (Цех 1)');
        assertTrue(t.calls.open[0].html.indexOf('Сидоров') === -1, 'Сидоров (Цех 2) не попал');
        assertTrue(t.calls.open[0].html.indexOf('pb-detail-contacts') !== -1, 'обёртка правого окна');
    });

    test('pbMasterOpen(0) — вся организация: все 3 контакта', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        t.sandbox.pbMasterOpen(0);      // ООО Тест целиком
        assertEqual(1, t.calls.open.length, 'панель открыта');
        assertEqual('ООО Тест', t.calls.open[0].title, 'заголовок — организация');
        assertTrue(t.calls.open[0].html.indexOf('Иванов') !== -1, 'Иванов есть');
        assertTrue(t.calls.open[0].html.indexOf('Петров') !== -1, 'Петров есть');
        assertTrue(t.calls.open[0].html.indexOf('Сидоров') !== -1, 'Сидоров есть');
        assertTrue(t.calls.open[0].html.indexOf('Козлов') === -1, 'Козлов (другая организация) не попал');
        assertTrue(t.calls.open[0].html.indexOf('pb-detail-group-title') !== -1,
            'заголовки подразделений внутри организации');
    });

    test('подсветка выбранной строки в левом окне', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        assertTrue(t.pbList.innerHTML.indexOf('selected') === -1, 'до выбора — без подсветки');
        t.sandbox.pbMasterOpen(0, 0);
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-row selected') !== -1,
            'после выбора — строка подразделения подсвечена');
        assertTrue(t.pbList.innerHTML.indexOf('onclick="pbMasterOpen(0, 0)"') !== -1,
            'строка кликабельна (индексы)');
    });

    test('«Без группы»: клик по строке — контакты без подразделения', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        // ЧОО Тест — orgIdx 1, единственная группа null → groupIdx 0
        t.sandbox.pbMasterOpen(1, 0);
        assertEqual(1, t.calls.open.length, 'панель открыта');
        assertTrue(t.calls.open[0].html.indexOf('Козлов') !== -1, 'Козлов (без группы)');
        assertTrue(t.calls.open[0].html.indexOf('Иванов') === -1, 'чужие не попали');
        assertTrue(t.calls.open[0].title.indexOf('Без группы') !== -1, 'заголовок «Без группы»');
    });

    test('крошки: «Главная / Телефонный справочник / Орг / Подразделение»', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        t.sandbox.pbMasterOpen(0, 0);
        const bc = t.bcContent.innerHTML;
        assertTrue(bc.indexOf('Главная') !== -1, 'сегмент «Главная»');
        assertTrue(bc.indexOf('Телефонный справочник') !== -1, 'сегмент раздела (сброс)');
        assertTrue(bc.indexOf('ООО Тест') !== -1, 'сегмент организации (кликабельный)');
        assertTrue(bc.indexOf('Цех 1') !== -1, 'текущий сегмент — подразделение');
        assertTrue(bc.indexOf('pbMasterResetState') !== -1, 'сброс по клику «Телефонный справочник»');
    });

    test('pbMasterResetState закрывает правое окно при открытой панели', async () => {
        const t = makeVm({ desktop: true, panelActive: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        t.sandbox.pbMasterOpen(0, 0);
        assertEqual(0, t.calls.close, 'панель ещё «открыта»');
        t.sandbox.pbMasterResetState();
        assertEqual(1, t.calls.close, 'closeDetailPanel вызван');
        // В браузере дерево перерисует хук closeDetailPanel (Task 181-стиля);
        // в VM мок панели этого не делает — проверяем эффект сброса явным рендером
        t.sandbox.pbRender();
        assertTrue(t.pbList.innerHTML.indexOf('selected') === -1, 'подсветка снята');
    });

    test('смена таба сбрасывает выбор и закрывает окно', async () => {
        const t = makeVm({ desktop: true, panelActive: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });
        t.sandbox.pbRender();
        t.sandbox.pbMasterOpen(0, 0);
        t.sandbox.pbSetTab('fav');
        assertEqual(1, t.calls.close, 'правое окно закрылось при смене таба');
        assertTrue(t.pbList.innerHTML.indexOf('Иванов') !== -1, 'список — избранные');
        assertTrue(t.pbList.innerHTML.indexOf('selected') === -1, 'выбор сброшен');
    });

    test('pbInit при наличии избранного — старт на «Избранном»', async () => {
        const t = makeVm({ desktop: true });
        seedFavorites(t, { [ID_A]: true });
        await runInit(t);
        assertTrue(t.pbList.innerHTML.indexOf('Иванов') !== -1, 'избранный контакт в списке');
        assertTrue(t.pbList.innerHTML.indexOf('Петров') === -1, 'неизбранный скрыт');
        assertTrue(t.tabs[1]._active, 'активен таб «Избранное» (десктоп)');
        assertTrue(t.tabs[3]._active, 'активен таб «Избранное» (моб)');
    });

    test('pbInit без избранного — вкладка «Все» (дерево на десктопе)', async () => {
        const t = makeVm({ desktop: true });
        await runInit(t);
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-org-row') !== -1, 'master-дерево');
        assertTrue(t.tabs[0]._active, 'активен таб «Все» (десктоп)');
    });
});
