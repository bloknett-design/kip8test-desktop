// tests/test-task559.js
// Task 559 — телефонный справочник: вкладка «Избранное» на десктопе —
// ДВА ОКНА, как у вкладки «Все». Заявка: «В телефонном справочнике,
// на вкладке избранного отображение сделай как во вкладке "Все",
// группы в одном окне, а телефоны при выборе группы во втором окне.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — ветка pbRender: десктоп + БЕЗ запроса — обе вкладки
//      рисуют дерево («Все» — pbRenderMaster, «Избранное» —
//      pbRenderFavMaster); функции pbFavoritesFlat /
//      pbFavMasterBuildIndex / pbRenderFavMaster / pbFavMasterOpen /
//      pbFavMasterToggleOrg; индекс — только организации/подразделения
//      С избранными, счётчики — по избранным; выбор — ПО ИМЕНАМ
//      {header[, group]} + валидация опустевших (сброс выбора и
//      закрытие правого окна); крошки — opts {openFn, orgIdx}
//      (по умолчанию — прежние pbMasterOpen/pbDesktopSelected);
//      pbMasterResetState/pbInit сбрасывают pbFavSelected;
//      pbToggleFavorite в мастер-режиме «Избранного» убирает карточку
//      из правого окна НА МЕСТЕ (без переоткрытия панели); SW v768.
//   B. VM — дерево по избранным (организации без избранного скрыты,
//      счётчики по избранным, зебра строк); правое окно: избранные
//      группы/организации (блоки по подразделениям); «Без группы»;
//      подсветка выбора; крошки с pbFavMasterOpen; снятие ★ —
//      карточка уходит на месте, опустевшая группа закрывает окно,
//      чужая группа выбор не трогает; добавление ★ достраивает дерево;
//      смена таба сбрасывает выбор; старт раздела при наличии
//      избранного — дерево; мобильный и поиск — прежний инлайн-рендер;
//      сворачивание организаций — общее состояние с «Все»; гварды
//      индексов; пустое избранное — подсказка.
//
// Файл УНИВЕРСАЛЕН для 4 репозиториев (kip8test/kip8 и их десктоп-
// зеркала): префикс ключей и версия SW выводятся из index.html/sw.js.
//
// Запуск: через tests/run-all.js (require './test-task559.js').

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
// Task 559: v767→v768 (kip8test); порт в kip8 — v564→v565
const SW_EXPECTED = { kip8test: 'kipia-test-v768', kip8: 'kipia-v565' }[PFX] || null;
const SW_PREV = { kip8test: 'kipia-test-v767', kip8: 'kipia-v564' }[PFX] || null;
const SW_NEXT = { kip8test: 'kipia-test-v769', kip8: 'kipia-v566' }[PFX] || null;

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
// Тестовый справочник (как test-task540): 2 организации,
// у второй — записи БЕЗ группы
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
const ID_P = mkId('Петров');
const ID_S = mkId('Сидоров');
const ID_K = mkId('Козлов');

// ============================================================
// Песочница VM: мок DOM + isDesktop + openDetailPanel/closeDetailPanel
// (харнесс test-task540 — Task 559 расширяет его деревом «Избранного»)
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
    // Моки панельных функций — ПОСЛЕ runInContext (глобалы живые)
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
// Включить вкладку «Избранное» через pbSetTab — побочные сбросы
// (pbExpandedSections, pbMasterResetState) штатны; ПРЯМОЕ
// t.sandbox.pbFilterFavOnly = true НЕ работает — let в VM-регионе
// лексическая, снаружи контекста не видна (урок Task 559)
function favTab(t) {
    t.sandbox.pbSetTab('fav');
}
// Прогнать pbInit и дождаться pbLoad().then (микрозадачи — до таймера)
async function runInit(t) {
    t.sandbox.pbInit();
    await new Promise(function(r) { setTimeout(r, 0); });
}

// ============================================================
// A. SRC — вкладка «Избранное»: два окна (как «Все»)
// ============================================================
describe('Task 559 — SRC: вкладка «Избранное» — два окна', () => {

    test('префикс ключей репозитория определён (PB_FAV_KEY)', () => {
        assertTrue(!!PFX, 'PB_FAV_KEY в index.html должен задавать префикс');
    });

    test('master-ветка pbRender: десктоп + без запроса — ОБЕ вкладки', () => {
        const i = INDEX_SRC.indexOf('function pbRender()');
        const seg = INDEX_SRC.slice(i, i + 3200);
        assertTrue(seg.indexOf("typeof isDesktop === 'function' && isDesktop() && !query") !== -1,
            'условие: десктоп и пустой поиск (без pbFilterFavOnly — таб выбирает дерево)');
        assertTrue(seg.indexOf('pbRenderFavMaster(list);') !== -1,
            'вкладка «Избранное» — своё дерево pbRenderFavMaster');
        assertTrue(seg.indexOf('pbRenderMaster(list);') !== -1,
            'вкладка «Все» — прежнее дерево pbRenderMaster');
    });

    test('функции мастер-режима «Избранного» определены в телефонном блоке', () => {
        for (const fn of ['function pbFavoritesFlat(', 'function pbFavMasterBuildIndex(',
                          'function pbRenderFavMaster(', 'function pbFavMasterOpen(',
                          'function pbFavMasterToggleOrg(']) {
            assertTrue(REGION && REGION.indexOf(fn) !== -1, fn);
        }
    });

    test('pbFavMasterBuildIndex: только организации с избранными, счётчики по избранным', () => {
        const i = INDEX_SRC.indexOf('function pbFavMasterBuildIndex(');
        const seg = INDEX_SRC.slice(i, i + 2200);
        assertTrue(seg.indexOf('const favs = pbFavoritesFlat();') !== -1,
            'индекс строится по избранным (pbFavoritesFlat)');
        assertTrue(seg.indexOf('if (items.length === 0) continue;') !== -1,
            'организации без избранного пропускаются');
        assertTrue(seg.indexOf('count: items.length') !== -1,
            'счётчик организации — число избранных');
        assertTrue(seg.indexOf('groups: order.map(g => ({ name: g, count: byGroup[g] }))') !== -1,
            'подразделения со счётчиками избранных');
    });

    test('выбор — ПО ИМЕНАМ + валидация опустевших группы/организации', () => {
        const iOpen = INDEX_SRC.indexOf('function pbFavMasterOpen(');
        const segOpen = INDEX_SRC.slice(iOpen, iOpen + 2400);
        assertTrue(segOpen.indexOf('{ header: org.header, group: grp.name }') !== -1,
            'выбор подразделения — имена (header + group)');
        assertTrue(segOpen.indexOf('{ header: org.header }') !== -1,
            'выбор организации — только header');
        const iB = INDEX_SRC.indexOf('function pbFavMasterBuildIndex(');
        const segB = INDEX_SRC.slice(iB, iB + 2200);
        assertTrue(segB.indexOf("pbFavMasterIndex.find(o => o.header === sel.header)") !== -1,
            'валидация организации по имени (индексы плывут при опустении)');
        assertTrue(segB.indexOf("('group' in sel)") !== -1,
            'различие «организация целиком» vs «подразделение»');
        assertTrue(segB.indexOf('org.groups.some(g => g.name === sel.group)') !== -1,
            'валидация подразделения по имени');
        assertTrue(segB.indexOf('pbFavSelected = null;') !== -1 &&
                   segB.indexOf('closeDetailPanel();') !== -1,
            'опустевший выбор сбрасывается и закрывает правое окно');
    });

    test('pbRenderFavMaster: разметка как у «Все», клики — pbFavMasterOpen', () => {
        const i = INDEX_SRC.indexOf('function pbRenderFavMaster(');
        const seg = INDEX_SRC.slice(i, i + 3000);
        assertTrue(seg.indexOf('onclick="pbFavMasterOpen(') !== -1,
            'строки дерева открывают правое окно избранного');
        assertTrue(seg.indexOf('pbFavMasterToggleOrg(event, ') !== -1,
            'шеврон сворачивания — свой обработчик (индекс pbFavMasterIndex)');
        assertTrue(seg.indexOf('pb-master-row-even') !== -1 &&
                   seg.indexOf('pb-master-row-odd') !== -1,
            'зебра строк-подразделений (Task 544) — общая с «Все»');
        assertTrue(seg.indexOf('Нет избранных контактов') !== -1,
            'пустое избранное — подсказка в левом окне');
        assertTrue(seg.indexOf('pb-master-count') !== -1,
            'счётчики-пилюли (Tasks 541/544) — общие');
    });

    test('крошки: opts {openFn, orgIdx} — дерево «Избранного»', () => {
        const i = INDEX_SRC.indexOf('function setPhonebookBreadcrumbContent(');
        const seg = INDEX_SRC.slice(i, i + 1400);
        assertTrue(seg.indexOf('function setPhonebookBreadcrumbContent(org, grp, opts)') !== -1,
            'третий аргумент opts');
        assertTrue(seg.indexOf("var openFn = (opts && opts.openFn) ? opts.openFn : 'pbMasterOpen';") !== -1,
            'по умолчанию — pbMasterOpen (прошлое поведение «Все» живо)');
        assertTrue(seg.indexOf('(opts && typeof opts.orgIdx === \'number\')') !== -1,
            'opts.orgIdx — индекс СВОЕГО дерева (по умолчанию pbDesktopSelected)');
        assertTrue(seg.indexOf("onclick=\"' + openFn + '(' + orgIdx + ')\"") !== -1,
            'сегмент организации вызывает openFn');
        const iOpen = INDEX_SRC.indexOf('function pbFavMasterOpen(');
        const segOpen = INDEX_SRC.slice(iOpen, iOpen + 2400);
        assertTrue(segOpen.indexOf("{ openFn: 'pbFavMasterOpen', orgIdx: orgIdx }") !== -1,
            'pbFavMasterOpen передаёт свои крошки');
    });

    test('сброс выбора: pbMasterResetState и pbInit', () => {
        const iR = INDEX_SRC.indexOf('function pbMasterResetState(');
        const segR = INDEX_SRC.slice(iR, iR + 700);
        assertTrue(segR.indexOf('pbFavSelected = null;') !== -1,
            'pbMasterResetState сбрасывает выбор «Избранного» (смена таба/крошка/✕)');
        const iI = INDEX_SRC.indexOf('function pbInit()');
        const segI = INDEX_SRC.slice(iI, iI + 1600);
        assertTrue(segI.indexOf('pbFavSelected = null;') !== -1,
            'pbInit сбрасывает выбор при входе в раздел');
    });

    test('pbToggleFavorite: карточка уходит из правого окна НА МЕСТЕ', () => {
        const i = INDEX_SRC.indexOf('function pbToggleFavorite(');
        // Task 559: функция выросла (удаление карточки на месте) — окно 2400
        const seg = INDEX_SRC.slice(i, i + 2400);
        assertTrue(seg.indexOf('pbSyncEnqueueFav(id, pbFavorites[id] === true)') !== -1,
            'хук синхронизации (Task 538) жив');
        assertTrue(seg.indexOf("isDesktop() && !favQ") !== -1,
            'хирургическое удаление — только мастер-режим «Избранного» (десктоп, без запроса)');
        assertTrue(seg.indexOf('favCard.parentNode.removeChild(favCard)') !== -1,
            'карточка удаляется из панели БЕЗ переоткрытия (прокрутка не сбрасывается)');
        assertTrue(seg.indexOf('pbRender();') !== -1,
            'левое дерево/счётчики обновляет pbRender');
    });

    test('SW: версия поднята для Task 559', () => {
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
// B. VM — функциональные проверки мастер-режима «Избранного»
// ============================================================
describe('Task 559 — VM: два окна на вкладке «Избранное»', () => {

    test('десктоп «Избранное»: дерево по избранным, карточек в левом окне нет', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true, [ID_K]: true });
        favTab(t);
        const html = t.pbList.innerHTML;
        assertTrue(html.indexOf('pb-master-org-row') !== -1, 'строки организаций');
        assertTrue(html.indexOf('ООО Тест') !== -1, 'организация с избранным');
        assertTrue(html.indexOf('ЧОО Тест') !== -1, 'вторая организация с избранным');
        assertTrue(html.indexOf('Цех 2') === -1, 'подразделение без избранного скрыто');
        assertTrue(html.indexOf('Иванов') === -1, 'карточек-контактов в левом окне НЕТ (они в правом)');
        assertTrue(html.indexOf('pb-card') === -1, 'карточек нет');
    });

    test('организация без избранного НЕ показывается', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });   // только ООО Тест / Цех 1
        favTab(t);
        assertTrue(t.pbList.innerHTML.indexOf('ООО Тест') !== -1, 'ООО Тест в дереве');
        assertTrue(t.pbList.innerHTML.indexOf('ЧОО Тест') === -1, 'ЧОО Тест скрыта (нет избранного)');
    });

    test('счётчики дерева — по избранным', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true, [ID_P]: true, [ID_S]: true, [ID_K]: true });
        favTab(t);
        const html = t.pbList.innerHTML;
        assertEqual(5, (html.match(/pb-master-count/g) || []).length,
            '2 организации + 3 подразделения (Цех 1, Цех 2, Без группы)');
        assertTrue(html.indexOf('pb-master-org-name">ООО Тест</span><span class="pb-master-count">3</span>') !== -1,
            'ООО Тест — 3 избранных');
        assertTrue(html.indexOf('pb-master-row-name">Цех 1</span><span class="pb-master-count">2</span>') !== -1,
            'Цех 1 — 2 избранных');
        assertTrue(html.indexOf('pb-master-row-name">Цех 2</span><span class="pb-master-count">1</span>') !== -1,
            'Цех 2 — 1 избранный');
    });

    test('pbFavMasterOpen(0, 0) — правое окно: избранные «Цех 1»', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true, [ID_P]: true, [ID_K]: true });
        favTab(t);
        t.sandbox.pbFavMasterOpen(0, 0);
        assertEqual(1, t.calls.open.length, 'правое окно открыто');
        assertEqual('ООО Тест — Цех 1', t.calls.open[0].title, 'заголовок окна');
        assertTrue(t.calls.open[0].html.indexOf('Иванов') !== -1, 'Иванов (избранный)');
        assertTrue(t.calls.open[0].html.indexOf('Петров') !== -1, 'Петров (избранный)');
        assertTrue(t.calls.open[0].html.indexOf('Сидоров') === -1, 'Сидоров (Цех 2, НЕ избранный) не попал');
        assertTrue(t.calls.open[0].html.indexOf('Козлов') === -1, 'Козлов (другая организация) не попал');
        assertTrue(t.calls.open[0].html.indexOf('pb-detail-contacts') !== -1, 'обёртка правого окна');
    });

    test('pbFavMasterOpen(0) — вся организация: избранные по блокам подразделений', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true, [ID_S]: true });
        favTab(t);
        t.sandbox.pbFavMasterOpen(0);
        assertEqual(1, t.calls.open.length, 'панель открыта');
        assertEqual('ООО Тест', t.calls.open[0].title, 'заголовок — организация');
        assertTrue(t.calls.open[0].html.indexOf('Иванов') !== -1, 'Иванов (Цех 1)');
        assertTrue(t.calls.open[0].html.indexOf('Сидоров') !== -1, 'Сидоров (Цех 2)');
        assertTrue(t.calls.open[0].html.indexOf('Петров') === -1, 'Петров (не избранный) не попал');
        assertTrue(t.calls.open[0].html.indexOf('pb-detail-group-title">Цех 1') !== -1,
            'заголовок блока «Цех 1»');
        assertTrue(t.calls.open[0].html.indexOf('pb-detail-group-title">Цех 2') !== -1,
            'заголовок блока «Цех 2»');
    });

    test('подсветка выбранной строки + onclick-индексы', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true, [ID_S]: true });
        favTab(t);
        assertTrue(t.pbList.innerHTML.indexOf('selected') === -1, 'до выбора — без подсветки');
        t.sandbox.pbFavMasterOpen(0, 0);
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-row pb-master-row-even selected') !== -1,
            'после выбора — строка подразделения подсвечена (зебра Task 544 + selected)');
        assertTrue(t.pbList.innerHTML.indexOf('onclick="pbFavMasterOpen(0, 0)"') !== -1,
            'строка кликабельна (индексы, как у «Все»)');
    });

    test('выбор организации целиком — подсвечена строка организации', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });
        favTab(t);
        t.sandbox.pbFavMasterOpen(0);
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-org-row selected') !== -1,
            'орг-строка подсвечена');
    });

    test('«Без группы»: избранные без подразделения', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_K]: true });
        favTab(t);
        assertTrue(t.pbList.innerHTML.indexOf('Без группы') !== -1, 'строка «Без группы» в дереве');
        // ЧОО Тест — orgIdx 0 (единственная с избранными), группа null → groupIdx 0
        t.sandbox.pbFavMasterOpen(0, 0);
        assertEqual(1, t.calls.open.length, 'панель открыта');
        assertTrue(t.calls.open[0].html.indexOf('Козлов') !== -1, 'Козлов (без группы)');
        assertTrue(t.calls.open[0].html.indexOf('Иванов') === -1, 'чужие не попали');
        assertEqual('ЧОО Тест — Без группы', t.calls.open[0].title, 'заголовок «Без группы»');
    });

    test('крошки: сегмент организации вызывает pbFavMasterOpen', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });
        favTab(t);
        t.sandbox.pbFavMasterOpen(0, 0);
        const bc = t.bcContent.innerHTML;
        assertTrue(bc.indexOf('Главная') !== -1, 'сегмент «Главная»');
        assertTrue(bc.indexOf('Документация') !== -1, 'хаб «Документация» (Task 543)');
        assertTrue(bc.indexOf('Телефонный справочник') !== -1, 'сегмент раздела (сброс)');
        assertTrue(bc.indexOf('ООО Тест') !== -1, 'сегмент организации');
        assertTrue(bc.indexOf('Цех 1') !== -1, 'текущий сегмент — подразделение');
        assertTrue(bc.indexOf('pbFavMasterOpen(0)') !== -1,
            'клик по организации — СВОЯ функция дерева «Избранного»');
    });

    test('снятие ★ (последняя в выбранной группе) — окно закрыто, строка исчезла', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true, [ID_S]: true });
        favTab(t);
        // Правое окно «открыто» (в реальном браузере панель активирует
        // openDetailPanel; мок этого не делает — поднимаем флаг сами)
        t.detailPanel._active = true;
        t.sandbox.pbFavMasterOpen(0, 1);   // Цех 2 (Сидоров)
        assertEqual('ООО Тест — Цех 2', t.calls.open[0].title, 'открыт Цех 2');
        assertEqual(0, t.calls.close, 'окно ещё открыто');
        // Снимаем Сидорова с ★ (последний в Цех 2)
        seedFavorites(t, { [ID_A]: true });
        t.sandbox.pbRender();
        assertEqual(1, t.calls.close, 'опустевшая группа — правое окно закрыто');
        assertTrue(t.pbList.innerHTML.indexOf('Цех 2') === -1, 'строка «Цех 2» исчезла из дерева');
        assertTrue(t.pbList.innerHTML.indexOf('selected') === -1, 'выбор сброшен');
    });

    test('снятие ★ в ДРУГОЙ группе — выбор жив, окно открыто', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true, [ID_P]: true, [ID_S]: true });
        favTab(t);
        t.detailPanel._active = true;
        t.sandbox.pbFavMasterOpen(0, 0);   // Цех 1 (Иванов + Петров)
        // Снимаем Сидорова (Цех 2 — не выбранная группа)
        seedFavorites(t, { [ID_A]: true, [ID_P]: true });
        t.sandbox.pbRender();
        assertEqual(0, t.calls.close, 'окно НЕ закрыто (выбранная группа жива)');
        assertTrue(t.pbList.innerHTML.indexOf('selected') !== -1, 'подсветка выбора жива');
        assertTrue(t.pbList.innerHTML.indexOf('Цех 2') === -1, 'опустевшая строка исчезла');
        assertTrue(t.pbList.innerHTML.indexOf('Цех 1') !== -1, 'выбранная строка в дереве');
    });

    test('pbToggleFavorite: карточка уходит из правого окна НА МЕСТЕ', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true, [ID_P]: true });
        favTab(t);
        t.sandbox.pbFavMasterOpen(0, 0);   // Цех 1: Иванов + Петров
        assertEqual(1, t.calls.open.length, 'панель открыта (единственный open)');
        // Клик ★ у Иванова (мок кнопки/карточки)
        const removed = [];
        const cardMock = {
            getAttribute: function(k) { return k === 'data-id' ? ID_A : null; },
            parentNode: { removeChild: function(c) { removed.push(c); } }
        };
        const btnMock = {
            closest: function(sel) { return sel === '.pb-card' ? cardMock : null; },
            classList: { add: function() {}, remove: function() {} },
            setAttribute: function() {},
            querySelector: function() { return { setAttribute: function() {} }; }
        };
        t.sandbox.pbToggleFavorite(btnMock, null);
        assertEqual(1, removed.length, 'карточка Иванова удалена из панели на месте');
        assertEqual(1, t.calls.open.length, 'панель НЕ переоткрывалась (прокрутка сохранена)');
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-row-name">Цех 1</span><span class="pb-master-count">1</span>') !== -1,
            'левое дерево: счётчик Цех 1 уменьшился до 1');
        assertTrue(t.pbList.innerHTML.indexOf('Цех 2') === -1, 'пустых строк не появилось');
    });

    test('добавление ★ достраивает дерево (другая организация появляется)', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });
        favTab(t);
        assertTrue(t.pbList.innerHTML.indexOf('ЧОО Тест') === -1, 'до: ЧОО Тест скрыта');
        seedFavorites(t, { [ID_A]: true, [ID_K]: true });
        t.sandbox.pbRender();
        assertTrue(t.pbList.innerHTML.indexOf('ЧОО Тест') !== -1, 'после: ЧОО Тест в дереве');
        assertTrue(t.pbList.innerHTML.indexOf('Без группы') !== -1, 'строка «Без группы» появилась');
        assertEqual('2', t.counts.pbFavCountDesk.textContent, 'счётчик таба «Избранное» = 2');
    });

    test('смена таба fav → all: дерево «Все», выбор сброшен', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });
        t.sandbox.pbSetTab('fav');
        t.sandbox.pbFavMasterOpen(0, 0);
        t.sandbox.pbSetTab('all');
        const html = t.pbList.innerHTML;
        assertTrue(html.indexOf('ЧОО Тест') !== -1, 'дерево «Все» — ВСЕ организации');
        assertTrue(html.indexOf('Цех 2') !== -1, 'дерево «Все» — все подразделения');
        assertTrue(html.indexOf('selected') === -1, 'выбор сброшен');
    });

    test('старт раздела при наличии избранного — дерево «Избранного»', async () => {
        const t = makeVm({ desktop: true });
        seedFavorites(t, { [ID_A]: true });
        await runInit(t);
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-org-row') !== -1,
            'раздел открылся на «Избранном» — дерево (Task 540 старт жив)');
        assertTrue(t.pbList.innerHTML.indexOf('Иванов') === -1,
            'карточек в левом окне нет (они в правом)');
        assertTrue(t.tabs[1]._active, 'активен таб «Избранное» (десктоп)');
        assertTrue(t.tabs[3]._active, 'активен таб «Избранное» (моб)');
    });

    test('мобильное «Избранное» — прежний инлайн-рендер (не менялся)', async () => {
        const t = makeVm({ desktop: false });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });
        t.sandbox.pbSetTab('fav');
        assertTrue(t.pbList.innerHTML.indexOf('Иванов') !== -1, 'карточка избранного в списке');
        assertTrue(t.pbList.innerHTML.indexOf('pb-card') !== -1, 'инлайн-карточки');
        assertTrue(t.pbList.innerHTML.indexOf('pb-master') === -1, 'дерева на мобильном нет');
    });

    test('поиск на «Избранном» — инлайн-рендер результатов', async () => {
        const t = makeVm({ desktop: true, query: 'иван' });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true, [ID_P]: true });
        t.sandbox.pbRender();
        assertTrue(t.pbList.innerHTML.indexOf('Иванов') !== -1, 'результат поиска');
        assertTrue(t.pbList.innerHTML.indexOf('Петров') === -1, 'не совпавший скрыт');
        assertTrue(t.pbList.innerHTML.indexOf('pb-card') !== -1, 'инлайн-карточки');
        assertTrue(t.pbList.innerHTML.indexOf('pb-master') === -1, 'дерева при запросе нет');
    });

    test('пустое избранное — подсказка в левом окне', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbSetTab('fav');
        assertTrue(t.pbList.innerHTML.indexOf('Нет избранных контактов') !== -1,
            'подсказка «Нет избранных контактов»');
        assertTrue(t.pbList.innerHTML.indexOf('pb-master') === -1, 'дерева нет');
    });

    test('сворачивание организаций — общее состояние с «Все»', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });
        favTab(t);
        assertTrue(t.pbList.innerHTML.indexOf('collapsed') === -1, 'до: организации раскрыты');
        t.sandbox.pbFavMasterToggleOrg(null, 0);   // свернуть ООО Тест (без события)
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-org collapsed') !== -1,
            'ООО Тест свёрнута в дереве «Избранного»');
        t.sandbox.pbSetTab('all');
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-org collapsed') !== -1,
            'свёрнутость пережила смену вкладки (общее pbMasterCollapsed, Task 541)');
        assertTrue(t.pbList.innerHTML.indexOf('ЧОО Тест') !== -1, 'дерево «Все» рисуется');
    });

    test('зебра строк-подразделений в дереве «Избранного»', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true, [ID_S]: true });
        favTab(t);
        const html = t.pbList.innerHTML;
        assertTrue(html.indexOf('pb-master-row-even') !== -1, 'чётная строка (Цех 1)');
        assertTrue(html.indexOf('pb-master-row-odd') !== -1, 'нечётная строка (Цех 2)');
    });

    test('гварды pbFavMasterOpen: неверные индексы — окно не открывается', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });
        favTab(t);
        t.sandbox.pbFavMasterOpen(99);
        t.sandbox.pbFavMasterOpen(-1);
        t.sandbox.pbFavMasterOpen(0, 99);
        assertEqual(0, t.calls.open.length, 'панель не открывалась');
    });
});
