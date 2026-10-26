// tests/test-task541.js
// Task 541 — телефонный справочник: организации и подразделения
// крупнее и ярче, сворачиваемые организации (десктоп, левое окно),
// счётчики рядом с разделами списка. Заявка: «Цвет текста Орг и
// подразделений с делай по больше и ярче, сделай организации с
// возможностью сворачиваться, а в десктопной версии счётчики
// количества расположи рядом с разделами списка.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — ТИПОГРАФИКА мастер-дерева: организация 16px/700
//      #a9d2f7 (светлая #1d5a99), подразделение 14.5px ярче (обе
//      темы), выбранное подразделение ярче (#9ecbf2/#1d5a99, 700),
//      пилюли-счётчики 22×20px #b7dcfa (рядом с каждой строкой),
//      заголовки групп правого окна 13.5px rgba(190,220,250,0.85),
//      счётчик группы 11px #8fc3f0.
//   B. SRC — СКОУП мобильного усиления: #pbList .pb-section-title
//      16px #ecb35e (светлая #a06a1a), #pbList .pb-subgroup-title
//      13.5px #94c4f4; БАЗОВЫЙ общий стиль .pb-section-title не
//      тронут (14px — приборы/замки/клапаны не задеты).
//   C. SRC — СВОРАЧИВАНИЕ: CSS .pb-master-org-toggle (шеврон,
//      rotate 90°/0°), .pb-master-org.collapsed .pb-master-row
//      display:none; JS — pbMasterCollapsed (ключ header), рендер
//      класса collapsed + кнопки с aria-expanded/aria-label,
//      pbMasterToggleOrg (stopPropagation, класс на месте без
//      перерисовки, fallback pbRender), pbMasterOpen разворачивает
//      выбранную организацию.
//   D. VM — функционально: дерево с шевронами и счётчиками;
//      toggle без события сворачивает/разворачивает (класс в
//      разметке); toggle с событием меняет состояние БЕЗ перерисовки
//      (класс на контейнере); подразделения остаются в DOM (прячет
//      CSS); выбор строки разворачивает организацию + открывает
//      правое окно; мобильный рендер — без шевронов (аккордеон
//      секций, как прежде); aria-expanded отражает состояние.
//
// Файл УНИВЕРСАЛЕН для 4 репозиториев (kip8test/kip8 и их десктоп-
// зеркала): префикс ключей и версия SW выводятся из index.html/sw.js.
//
// Запуск: через tests/run-all.js (require './test-task541.js').

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
// Task 541: v752→v753 (kip8test), v549→v550 (kip8)
const SW_EXPECTED = { kip8test: 'kipia-test-v759', kip8: 'kipia-v550' }[PFX] || null;
const SW_PREV = { kip8test: 'kipia-test-v752', kip8: 'kipia-v549' }[PFX] || null;
const SW_NEXT = { kip8test: 'kipia-test-v760', kip8: 'kipia-v551' }[PFX] || null;

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
// (как test-task540.js — общий каркас мастер-режима)
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
    sandbox.openDetailPanel = function(title, html) { calls.open.push({ title: title, html: html }); };
    sandbox.closeDetailPanel = function() { calls.close++; };
    return { sandbox: sandbox, ls: ls, tabs: tabs, counts: counts,
             pbList: pbList, pbSearchInput: pbSearchInput,
             detailPanel: detailPanel, bcContent: bcContent, calls: calls,
             opts: opts };
}

async function seedPhonebook(t) {
    await t.sandbox.pbLoad();
}

// ============================================================
// A. SRC — типографика мастер-дерева (крупнее и ярче)
// ============================================================
describe('Task 541 — SRC: организации и подразделения крупнее и ярче', () => {

    test('префикс ключей репозитория определён (PB_FAV_KEY)', () => {
        assertTrue(!!PFX, 'PB_FAV_KEY в index.html должен задавать префикс');
    });

    test('организация в левом окне — 16px/700, яркий синий (обе темы)', () => {
        const i = INDEX_SRC.indexOf('.pb-master-org-row {');
        assertTrue(i !== -1, 'правило .pb-master-org-row есть');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf('font-size: 16px; font-weight: 700;') !== -1,
            '16px и жирность 700');
        assertTrue(seg.indexOf('color: #a9d2f7;') !== -1, 'яркий светло-синий (тёмная тема)');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .pb-master-org-row { color: #1d5a99; }') !== -1,
            'светлая тема — насыщенный синий');
    });

    test('подразделение в левом окне — 14.5px, ярче (обе темы)', () => {
        const i = INDEX_SRC.indexOf('.pb-master-row {');
        assertTrue(i !== -1, 'правило .pb-master-row есть');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf('font-size: 14.5px;') !== -1, 'было 13px → 14.5px');
        assertTrue(seg.indexOf('color: rgba(255,255,255,0.82);') !== -1,
            'тёмная тема: 0.55 → 0.82 (ярче)');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .pb-master-row { color: rgba(20,20,19,0.85); }') !== -1,
            'светлая тема явно ярче');
    });

    test('выбранное подразделение — ярче и жирнее', () => {
        const i = INDEX_SRC.indexOf('.pb-master-row.selected {');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf('color: #9ecbf2;') !== -1, 'яркий синий вместо #6aa6e0');
        assertTrue(seg.indexOf('font-weight: 700;') !== -1, 'жирность 700');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .pb-master-row.selected { color: #1d5a99; }') !== -1,
            'светлая тема ярче');
    });

    test('счётчики рядом с разделами — крупнее и ярче (обе темы)', () => {
        const i = INDEX_SRC.indexOf('.pb-master-count {');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf('min-width: 22px; height: 20px;') !== -1,
            'было 17×17 → 22×20 (крупнее)');
        assertTrue(seg.indexOf('color: #b7dcfa;') !== -1, 'яркий текст вместо 55% белого');
        assertTrue(seg.indexOf('background: rgba(106,166,224,0.22);') !== -1,
            'синяя подложка вместо серой');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .pb-master-count { background: rgba(42,93,143,0.14); color: #2a5d8f; }') !== -1,
            'светлая тема');
    });

    test('заголовки подразделений в правом окне — крупнее и ярче', () => {
        const i = INDEX_SRC.indexOf('#detailPanelBody .pb-detail-group-title {');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf('font-size: 13.5px;') !== -1, 'было 12px → 13.5px');
        assertTrue(seg.indexOf('color: rgba(190,220,250,0.85);') !== -1,
            'было 45% белого → яркий голубой');
        const j = INDEX_SRC.indexOf('#detailPanelBody .pb-detail-group-count {');
        const seg2 = INDEX_SRC.slice(j, INDEX_SRC.indexOf('}', j) + 1);
        assertTrue(seg2.indexOf('font-size: 11px;') !== -1, 'счётчик группы 10→11px');
        assertTrue(seg2.indexOf('color: #8fc3f0;') !== -1, 'счётчик группы ярче');
    });
});

// ============================================================
// B. SRC — скоуп мобильного усиления (#pbList)
// ============================================================
describe('Task 541 — SRC: мобильный список — скоуп #pbList', () => {

    test('#pbList .pb-section-title — 16px, яркий золотой', () => {
        assertTrue(INDEX_SRC.indexOf('#pbList .pb-section-title { font-size: 16px; color: #ecb35e; }') !== -1,
            'организация 16px #ecb35e (было 14px #c7964a)');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] #pbList .pb-section-title { color: #a06a1a; }') !== -1,
            'светлая тема — насыщенный янтарный');
    });

    test('#pbList .pb-subgroup-title — 13.5px, яркий синий', () => {
        assertTrue(INDEX_SRC.indexOf('#pbList .pb-subgroup-title { font-size: 13.5px; color: #94c4f4; }') !== -1,
            'подразделение 13.5px #94c4f4 (было 12px)');
        assertTrue(INDEX_SRC.indexOf('#pbList .pb-subgroup.expanded .pb-subgroup-title { color: #b4d9f9; }') !== -1,
            'раскрытое подразделение — ещё ярче');
    });

    test('счётчики мобильных секций/подгрупп ярче', () => {
        assertTrue(INDEX_SRC.indexOf('#pbList .pb-section-title-count { font-size: 13px; font-weight: 700; color: rgba(236,179,94,0.95); }') !== -1,
            'счётчик организации 12→13px, 0.6→0.95');
        assertTrue(INDEX_SRC.indexOf('#pbList .pb-subgroup-count { font-size: 12px; font-weight: 600; color: rgba(148,196,244,0.9); }') !== -1,
            'счётчик подразделения 11→12px, 0.5→0.9');
    });

    test('базовый общий стиль .pb-section-title НЕ тронут (приборы/замки)', () => {
        // .pb-section-title — общий класс (приборы, замки, клапаны,
        // регуляторы); усиление только в скоупе #pbList справочника
        const i = INDEX_SRC.indexOf('.pb-section-title {');
        assertTrue(i !== -1, 'базовое правило на месте');
        const seg = INDEX_SRC.slice(i, i + 200);
        assertTrue(seg.indexOf('font-size: 14px; font-weight: 700;') !== -1,
            'базовый размер 14px сохранён — другие разделы не задеты');
        assertTrue(seg.indexOf('color: #c7964a;') !== -1,
            'базовый золотой сохранён');
    });
});

// ============================================================
// C. SRC — сворачивание организаций (CSS + JS)
// ============================================================
describe('Task 541 — SRC: сворачиваемые организации', () => {

    test('CSS: шеврон + скрытие подразделений свёрнутой организации', () => {
        assertTrue(INDEX_SRC.indexOf('.pb-master-org-toggle {') !== -1,
            'кнопка-шеврон есть');
        assertTrue(INDEX_SRC.indexOf('.pb-master-org.collapsed .pb-master-row { display: none; }') !== -1,
            'свёрнутая организация прячет подразделения');
        assertTrue(INDEX_SRC.indexOf('.pb-master-org.collapsed .pb-master-org-toggle svg { transform: rotate(0deg); }') !== -1,
            'стрелка свёрнутой — вправо (rotate 0)');
        const i = INDEX_SRC.indexOf('.pb-master-org-toggle svg {');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf('transform: rotate(90deg);') !== -1,
            'раскрытая — стрелка вниз (rotate 90)');
    });

    test('JS: состояние pbMasterCollapsed (ключ — header)', () => {
        assertTrue(INDEX_SRC.indexOf('let pbMasterCollapsed = {};') !== -1,
            'объявление состояния');
    });

    test('JS: pbRenderMaster — класс collapsed + кнопка с aria', () => {
        const i = INDEX_SRC.indexOf('function pbRenderMaster(');
        const seg = INDEX_SRC.slice(i, i + 2600);
        assertTrue(seg.indexOf("pbMasterCollapsed[org.header] === true") !== -1,
            'проверка свёрнутости по header');
        assertTrue(seg.indexOf("'<div class=\"pb-master-org' + (orgCollapsed ? ' collapsed' : '') + '\">'") !== -1,
            'класс collapsed на контейнере организации');
        assertTrue(seg.indexOf('class="pb-master-org-toggle"') !== -1, 'кнопка-шеврон в разметке');
        assertTrue(seg.indexOf("aria-expanded=\"' + (!orgCollapsed) + '\"") !== -1,
            'aria-expanded отражает состояние');
        assertTrue(seg.indexOf('pbMasterToggleOrg(event, ') !== -1, 'обработчик клика по шеврону');
    });

    test('JS: pbMasterToggleOrg — stopPropagation, класс на месте, fallback', () => {
        const i = INDEX_SRC.indexOf('function pbMasterToggleOrg(');
        assertTrue(i !== -1, 'функция есть');
        const seg = INDEX_SRC.slice(i, i + 1700);
        assertTrue(seg.indexOf('ev.stopPropagation();') !== -1,
            'глушит всплытие (строка организации не открывает правое окно)');
        assertTrue(seg.indexOf("container.classList.toggle('collapsed', willCollapse);") !== -1,
            'переключение класса на месте (без перерисовки)');
        assertTrue(seg.indexOf('pbRender();') !== -1, 'fallback — полный рендер');
        assertTrue(seg.indexOf("delete pbMasterCollapsed[org.header];") !== -1,
            'разворот очищает состояние');
    });

    test('JS: pbMasterOpen разворачивает выбранную организацию', () => {
        const i = INDEX_SRC.indexOf('function pbMasterOpen(');
        const seg = INDEX_SRC.slice(i, i + 900);
        assertTrue(seg.indexOf('if (pbMasterCollapsed[org.header] === true) delete pbMasterCollapsed[org.header];') !== -1,
            'выбор строки разворачивает организацию');
    });

    test('SW: версия поднята для Task 541', () => {
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
// D. VM — функциональные проверки сворачивания
// ============================================================
describe('Task 541 — VM: сворачивание организаций в левом окне', () => {

    test('дерево: шевроны у организаций, счётчики рядом, все раскрыты', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        const html = t.pbList.innerHTML;
        assertTrue(html.indexOf('pb-master-org-toggle') !== -1, 'кнопки-шевроны есть');
        assertTrue(html.indexOf('aria-expanded="true"') !== -1, 'по умолчанию раскрыто');
        assertTrue(html.indexOf('pb-master-org collapsed') === -1, 'ничего не свёрнуто');
        // Счётчики рядом с разделами списка
        assertTrue(html.indexOf('<span class="pb-master-count">3</span>') !== -1,
            'счётчик ООО Тест (3 контакта)');
        assertTrue(html.indexOf('<span class="pb-master-count">1</span>') !== -1,
            'счётчик ЧОО Тест (1 контакт)');
        assertTrue(html.indexOf('<span class="pb-master-count">2</span>') !== -1,
            'счётчик подразделения «Цех 1» (2 контакта)');
        const iName = html.indexOf('pb-master-org-name">ООО Тест');
        const iCount = html.indexOf('<span class="pb-master-count">3</span>');
        assertTrue(iName !== -1 && iCount > iName, 'счётчик рядом с названием (после него)');
    });

    test('toggle без события: сворачивает организацию (класс в разметке)', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        t.sandbox.pbMasterToggleOrg(null, 0);   // свернуть ООО Тест
        const html = t.pbList.innerHTML;
        assertTrue(html.indexOf('pb-master-org collapsed') !== -1, 'ООО Тест свёрнута');
        assertTrue(html.indexOf('aria-expanded="false"') !== -1, 'aria-expanded=false у шеврона');
        assertTrue(html.indexOf('Цех 1') !== -1,
            'подразделения остаются в DOM (прячет CSS display:none)');
        // Вторая организация не затронута
        const iChoo = html.indexOf('pb-master-org-name">ЧОО Тест');
        const iCollapsed = html.indexOf('pb-master-org collapsed');
        assertTrue(iChoo > iCollapsed, 'ЧОО Тест после свёрнутой — сама не свёрнута');
    });

    test('toggle дважды: разворачивает обратно', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        t.sandbox.pbMasterToggleOrg(null, 0);   // свернуть
        t.sandbox.pbMasterToggleOrg(null, 0);   // развернуть
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-org collapsed') === -1,
            'состояние вернулось к раскрытому');
        assertTrue(t.pbList.innerHTML.indexOf('aria-expanded="true"') !== -1,
            'aria-expanded=true');
    });

    test('toggle с событием: класс на контейнере, БЕЗ перерисовки', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        // Мок DOM: контейнер с classList.toggle + querySelector
        const container = {
            _collapsed: false,
            classList: { toggle: function(cls, on) { if (cls === 'collapsed') container._collapsed = !!on; } },
            querySelector: function() { return { setAttribute: function() {} }; }
        };
        let stopped = false;
        const ev = {
            stopPropagation: function() { stopped = true; },
            preventDefault: function() {},
            target: { closest: function(sel) { return sel === '.pb-master-org' ? container : null; } }
        };
        t.sandbox.pbMasterToggleOrg(ev, 0);
        assertTrue(stopped, 'всплытие остановлено (строка не откроет правое окно)');
        assertTrue(container._collapsed === true, 'класс переключён на контейнере');
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-org collapsed') === -1,
            'перерисовки не было (innerHTML не менялся)');
        // Состояние учтено при следующем рендере
        t.sandbox.pbRender();
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-org collapsed') !== -1,
            'после рендера организация свёрнута (состояние сохранено)');
    });

    test('выбор подразделения разворачивает свёрнутую организацию', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        t.sandbox.pbMasterToggleOrg(null, 0);   // свернуть ООО Тест
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-org collapsed') !== -1);
        t.sandbox.pbMasterOpen(0, 0);           // выбрать Цех 1
        assertEqual(1, t.calls.open.length, 'правое окно открыто');
        assertEqual('ООО Тест — Цех 1', t.calls.open[0].title, 'заголовок окна');
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-org collapsed') === -1,
            'организация развернулась (выбранное подразделение видно)');
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-row pb-master-row-even selected') !== -1,
            'строка подразделения подсвечена (зебра Task 544 + selected)');
    });

    test('свёрнутая одна организация не разворачивается выбором другой', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        t.sandbox.pbMasterToggleOrg(null, 0);   // свернуть ООО Тест
        t.sandbox.pbMasterOpen(1, 0);           // выбрать «Без группы» ЧОО Тест
        assertEqual(1, t.calls.open.length, 'правое окно открыто');
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-org collapsed') !== -1,
            'ООО Тест осталась свёрнутой (не выбирали)');
    });

    test('мобильный рендер — без шевронов (аккордеон секций, как прежде)', async () => {
        const t = makeVm({ desktop: false });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-org-toggle') === -1,
            'шевронов нет (инлайн-рендер)');
        assertTrue(t.pbList.innerHTML.indexOf('pb-section') !== -1,
            'секции-организации на месте (сворачивание уже было)');
    });

    test('после pbMasterResetState свёрнутость сохраняется (предпочтение вида)', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        t.sandbox.pbMasterToggleOrg(null, 0);   // свернуть ООО Тест
        t.sandbox.pbMasterOpen(0, 0);           // выбор разворачивает
        t.sandbox.pbMasterToggleOrg(null, 0);   // снова свернуть
        t.sandbox.pbMasterResetState();         // сброс выбора (панель закрыта)
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-org collapsed') !== -1,
            'свёрнутость пережила сброс выбора');
        assertTrue(t.pbList.innerHTML.indexOf('pb-master-row-even selected') === -1,
            'выбор сброшен (зебра-классы остаются, подсветки нет)');
    });
});
