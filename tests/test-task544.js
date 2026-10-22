// tests/test-task544.js
// Task 544 — телефонный справочник: списки подразделений — ЗЕБРА (та же,
// что у карточек контактов Task 543: мобильный аккордеон — заголовки
// подгрупп pb-subrow-even/odd, десктоп-дерево — строки pb-master-row-even/
// odd, перезапуск внутри каждой организации); ВСЕ счётчики — на ОДНОМ
// расстоянии «по самому дальнему» (пилюли .pb-master-count прижаты к
// правому краю блока, ширина которого = самой длинной строке Task 543;
// счётчики заголовков правого окна — к правому краю строки; мобильный
// аккордеон: счётчики организаций на 32px — на одном расстоянии со
// счётчиками подразделений); КНОПКА телефонного справочника — цветовое
// оформление как в разделе «Документация» (золотой акцент rgba(199,150,74):
// рамка/подпись/стрелка; синий акцент Task 543 отменён и у закреплённого
// ярлыка на главной).
//
// Заявка: «Списки подразделений тоже сделай зеброй и все счётчики
// расположи на одном расстоянии по самому дальнему. Цветовое оформление
// кнопки телефонного справочника должно быть таким же как в разделе
// Документация.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — ЦВЕТ КНОПКИ: кнопка phonebookDocsBtn — золотые рамка/
//      подпись/стрелка «Документации», синих инлайнов Task 543 нет;
//      renderPinnedItems красит категорию 'phonebook' как «Документацию»
//      (isDocs включает phonebook), синяя ветка isPhonebook удалена;
//      SUBSECTIONS-запись phonebook жива (закрепление на главной).
//   B. SRC — ЗЕБРА ПОДРАЗДЕЛЕНИЙ: CSS .pb-master-row-even/odd (обе темы) +
//      #pbList .pb-subgroup-title.pb-subrow-even/odd (обе темы) +
//      компенсация тап-подсветки; JS: pbRenderMaster вешает зебра-классы
//      строк, pbRender — зебра-классы заголовков подгрупп (subIndex,
//      перезапуск внутри организации).
//   C. SRC — СЧЁТЧИКИ ОДНОЙ КОЛОНКОЙ: .pb-master-count margin-left:auto;
//      #detailPanelBody .pb-detail-group-count margin-left:auto;
//      #pbList .pb-section-title padding-right:32px (счётчики организаций
//      на одном расстоянии с подгруппами); гвард: имена без flex:1.
//   D. VM — РЕНДЕР: мастер-дерево — чередование зебра-классов строк
//      (per-org) + выбранная строка «зебра + selected» + HTML-смежность
//      «имя → счётчик» (Task 543 жива); мобильный список — зебра-классы
//      подгрупп и карточек; «Избранное» — подгруппы с зебра-классами;
//      правое окно — заголовки групп со счётчиками.
//
// Файл УНИВЕРСАЛЕН для 4 репозиториев (kip8test/kip8 и десктоп-зеркала):
// префикс ключей и версия SW выводятся из index.html/sw.js.
//
// Запуск: через tests/run-all.js (require './test-task544.js').

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
// Task 544: v755→v756 (kip8test), v552→v553 (kip8)
const SW_EXPECTED = { kip8test: 'kipia-test-v756', kip8: 'kipia-v553' }[PFX] || null;
const SW_PREV = { kip8test: 'kipia-test-v755', kip8: 'kipia-v552' }[PFX] || null;
const SW_NEXT = { kip8test: 'kipia-test-v757', kip8: 'kipia-v554' }[PFX] || null;

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
// Тестовый справочник: 2 организации; у ООО ПО «ТОКЕМ» ДВА
// подразделения (Цех 1 — 2 контакта, Цех 2 — 1) — виден перезапуск
// зебры и чередование строк; у ЧОО Тест — «Без группы» (1 контакт)
// ============================================================
const PB_JSON = {
    sections: {
        'ООО ПО «ТОКЕМ»': [
            { group: 'Цех 1', subgroup: null, position: 'Инженер', name: 'Иванов', phone: '11-11' },
            { group: 'Цех 1', subgroup: null, position: 'Мастер', name: 'Петров', phone: '22-22' },
            { group: 'Цех 2', subgroup: null, position: 'Электрик', name: 'Сидоров', phone: '33-33' }
        ],
        'ЧОО Тест': [
            { group: null, subgroup: null, position: 'Дежурный', name: 'Козлов', phone: '44-44' }
        ]
    }
};
const ID_IVANOV = 'ООО ПО «ТОКЕМ»|Цех 1||Инженер|Иванов|11-11';

// ============================================================
// Песочница VM (как test-task543.js — мок DOM + isDesktop)
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
        tb.classList = { toggle: function(cls, on) { if (cls === 'active') tb._active = !!on; } };
    }
    const counts = {
        pbAllCountDesk: { textContent: '0' }, pbAllCountMob: { textContent: '0' },
        pbFavCountDesk: { textContent: '0' }, pbFavCountMob: { textContent: '0' }
    };
    const listClasses = {};
    const pbList = {
        innerHTML: '',
        classList: {
            add: function(c) { listClasses[c] = true; },
            remove: function(c) { delete listClasses[c]; },
            toggle: function(c, force) {
                if (typeof force === 'boolean') listClasses[c] = force;
                else listClasses[c] = !listClasses[c];
            },
            contains: function(c) { return !!listClasses[c]; }
        }
    };
    const pbSearchInput = { value: opts.query || '' };
    const detailPanel = { _active: !!opts.panelActive,
        classList: { contains: function(c) { return c === 'active' && detailPanel._active; } } };
    const pagePhonebook = { classList: { contains: function(c) { return c === 'active'; } } };
    const bcContent = { innerHTML: '' };
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
    sandbox.openDetailPanel = function(title, html) {};
    sandbox.closeDetailPanel = function() {};
    return { sandbox: sandbox, ls: ls, tabs: tabs, counts: counts,
             pbList: pbList, pbSearchInput: pbSearchInput,
             detailPanel: detailPanel, bcContent: bcContent,
             listClasses: listClasses, opts: opts };
}

async function seedPhonebook(t) {
    await t.sandbox.pbLoad();
}

function seedFavorites(t, ids) {
    const m = {};
    for (const id of ids) m[id] = true;
    t.ls.setItem(FAV_KEY, JSON.stringify(m));
    t.sandbox.pbLoadFavorites();
}

// ============================================================
// A. SRC — кнопка: цвет как в разделе «Документация»
// ============================================================
describe('Task 544 — SRC: кнопка справочника — цвет «Документации»', () => {

    test('префикс ключей репозитория определён (PB_FAV_KEY)', () => {
        assertTrue(!!PFX, 'PB_FAV_KEY в index.html должен задавать префикс');
    });

    test('SW: версия поднята для Task 544', () => {
        assertTrue(!!SW_EXPECTED, 'версия SW выводится из префикса репо');
        assertTrue(SW_SRC.indexOf(SW_EXPECTED) !== -1,
            'sw.js содержит ' + SW_EXPECTED);
        assertTrue(SW_SRC.indexOf(SW_PREV) === -1,
            'прежней версии ' + SW_PREV + ' нет');
        assertTrue(SW_SRC.indexOf(SW_NEXT) === -1,
            'следующей версии ' + SW_NEXT + ' нет (гвард)');
    });

    test('кнопка phonebookDocsBtn — золотая рамка «Документации»', () => {
        const i = INDEX_SRC.indexOf('id="phonebookDocsBtn"');
        assertTrue(i !== -1, 'кнопка есть');
        const lineStart = INDEX_SRC.lastIndexOf('\n', i) + 1;
        const lineEnd = INDEX_SRC.indexOf('\n', i);
        const seg = INDEX_SRC.slice(lineStart, lineEnd);
        assertTrue(seg.indexOf('border-color:rgba(199,150,74,0.35);') !== -1,
            'рамка — как у «Экзаменационных билетов»/«Библиотеки КИП и А»');
    });

    test('кнопка: подпись и стрелка — золотые', () => {
        const i = INDEX_SRC.indexOf('id="phonebookDocsBtn"');
        const lineStart = INDEX_SRC.lastIndexOf('\n', i) + 1;
        const lineEnd = INDEX_SRC.indexOf('\n', i);
        const seg = INDEX_SRC.slice(lineStart, lineEnd);
        assertTrue(seg.indexOf('color:#c7964a;') !== -1,
            'подпись «Телефонный справочник» — золотая (#c7964a)');
        assertTrue(seg.indexOf('color:rgba(199,150,74,0.4);') !== -1,
            'стрелка — золотая');
    });

    test('кнопка: синий акцент Task 543 исчез', () => {
        const i = INDEX_SRC.indexOf('id="phonebookDocsBtn"');
        const lineStart = INDEX_SRC.lastIndexOf('\n', i) + 1;
        const lineEnd = INDEX_SRC.indexOf('\n', i);
        const seg = INDEX_SRC.slice(lineStart, lineEnd);
        assertTrue(seg.indexOf('74,143,199') === -1,
            'синих инлайнов в кнопке больше нет');
        assertTrue(seg.indexOf('#6aa6e0') === -1, 'синей подписи нет');
    });

    test('renderPinnedItems: категория phonebook — золотой акцент «Документации»', () => {
        const i = INDEX_SRC.indexOf(
            "const isDocs = s.category === 'docs' || s.category === 'phonebook';");
        assertTrue(i !== -1, 'категория phonebook красится как «Документация»');
        const seg = INDEX_SRC.slice(i, i + 400);
        assertTrue(seg.indexOf("'border-color:rgba(199,150,74,0.35);'") !== -1,
            'золотая рамка закреплённого ярлыка справочника');
        assertTrue(seg.indexOf("'color:#c7964a;'") !== -1, 'золотая подпись');
        assertTrue(seg.indexOf("'color:rgba(199,150,74,0.4);'") !== -1,
            'золотая стрелка');
    });

    test('renderPinnedItems: синяя ветка isPhonebook удалена', () => {
        assertTrue(INDEX_SRC.indexOf("const isPhonebook = s.category === 'phonebook';") === -1,
            'ветки Task 543 нет — пин красится золотым «Документации»');
    });

    test('SUBSECTIONS: ключ phonebook жив (закрепление на главной)', () => {
        const i = INDEX_SRC.indexOf("'phonebook':     { label: 'Телефонный справочник'");
        assertTrue(i !== -1, 'запись реестра есть');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf("target: 'phonebook'") !== -1, 'цель навигации');
        assertTrue(seg.indexOf("category: 'phonebook'") !== -1,
            'категория phonebook (золотой акцент закреплённого ярлыка)');
    });
});

// ============================================================
// B. SRC — зебра списков подразделений
// ============================================================
describe('Task 544 — SRC: зебра списков подразделений', () => {

    test('CSS: зебра строк мастер-дерева (.pb-master-row-even/odd)', () => {
        const i = INDEX_SRC.indexOf('.pb-master-row-even { background: rgba(40, 50, 65, 0.96); }');
        assertTrue(i !== -1, 'чётная строка дерева');
        assertTrue(INDEX_SRC.indexOf('.pb-master-row-odd  { background: rgba(55, 68, 85, 0.96); }') !== -1,
            'нечётная строка дерева');
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] .pb-master-row-even { background: rgba(252, 248, 240, 0.97); }') !== -1,
            'светлая тема: чётная');
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] .pb-master-row-odd  { background: rgba(220, 213, 200, 0.94); }') !== -1,
            'светлая тема: нечётная');
    });

    test('CSS: зебра заголовков подгрупп (#pbList .pb-subrow-*)', () => {
        assertTrue(INDEX_SRC.indexOf(
            '#pbList .pb-subgroup-title.pb-subrow-even { background: rgba(40, 50, 65, 0.96); }') !== -1,
            'чётный заголовок подгруппы (скоуп #pbList — приборы не тронуты)');
        assertTrue(INDEX_SRC.indexOf(
            '#pbList .pb-subgroup-title.pb-subrow-odd  { background: rgba(55, 68, 85, 0.96); }') !== -1,
            'нечётный заголовок подгруппы');
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] #pbList .pb-subgroup-title.pb-subrow-even { background: rgba(252, 248, 240, 0.97); }') !== -1,
            'светлая тема: чётная');
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] #pbList .pb-subgroup-title.pb-subrow-odd  { background: rgba(220, 213, 200, 0.94); }') !== -1,
            'светлая тема: нечётная');
    });

    test('CSS: тап-подсветка зебра-строк компенсирована', () => {
        const i = INDEX_SRC.indexOf('#pbList .pb-subgroup-title.pb-subrow-even:active,');
        assertTrue(i !== -1, 'явное правило :active есть');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', INDEX_SRC.indexOf('}', i) + 1) + 1);
        assertTrue(seg.indexOf('rgba(106, 166, 224, 0.2)') !== -1,
            'подсветка тапа видна поверх зебры (тёмная)');
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] #pbList .pb-subgroup-title.pb-subrow-even:active,') !== -1,
            'светлая тема: компенсация тоже');
    });

    test('CSS: подсветка selected/hover ПОВЕРХ зебры мастер-строк', () => {
        const i = INDEX_SRC.indexOf('.pb-master-row-even:hover, .pb-master-row-odd:hover {');
        assertTrue(i !== -1, 'hover компенсирован');
        const j = INDEX_SRC.indexOf('.pb-master-row-even.selected, .pb-master-row-odd.selected {');
        assertTrue(j !== -1,
            'выделение выбранной строки видно поверх зебры (светлая тема: зебра (0,2,0) гасила .selected)');
        const seg = INDEX_SRC.slice(j, INDEX_SRC.indexOf('}', j) + 1);
        assertTrue(seg.indexOf('rgba(74, 143, 199, 0.14)') !== -1,
            'фон выбранной строки — каноничный .selected');
    });

    test('JS: pbRenderMaster вешает зебра-классы строк', () => {
        const i = INDEX_SRC.indexOf("const rowZebra = (g % 2 === 0) ? ' pb-master-row-even' : ' pb-master-row-odd';");
        assertTrue(i !== -1, 'зебра-класс выбирается по индексу подразделения');
        const j = INDEX_SRC.indexOf("'<div class=\"pb-master-row' + rowZebra + (gSel ? ' selected' : '')");
        assertTrue(j !== -1, 'класс попадает в разметку строки ДО selected');
    });

    test('CSS: длинные названия подгрупп не выталкивают счётчик', () => {
        const i = INDEX_SRC.indexOf('#pbList .pb-subgroup-title-text {');
        assertTrue(i !== -1, 'правило сжатия текста есть');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', INDEX_SRC.indexOf('}', i) + 1) + 1);
        assertTrue(seg.indexOf('flex: 1;') !== -1 && seg.indexOf('text-overflow: ellipsis;') !== -1,
            'текст с ellipsis — пилюля всегда видна на своём месте (VLM-находка)');
    });

    test('JS: pbRender вешает зебра-классы заголовков подгрупп', () => {
        const i = INDEX_SRC.indexOf(
            "'<div class=\"pb-subgroup-title' + (subIndex % 2 === 0 ? ' pb-subrow-even' : ' pb-subrow-odd')");
        assertTrue(i !== -1, 'зебра-класс заголовка подгруппы');
        const j = INDEX_SRC.indexOf('let subIndex = 0;');
        assertTrue(j !== -1, 'счётчик подгрупп объявлен (перезапуск per-org)');
    });
});

// ============================================================
// C. SRC — счётчики одной колонкой («по самому дальнему»)
// ============================================================
describe('Task 544 — SRC: счётчики — одной колонкой', () => {

    test('.pb-master-count: margin-left:auto — пилюли у правого края', () => {
        const i = INDEX_SRC.indexOf('.pb-master-count {');
        assertTrue(i !== -1, 'правило есть');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf('margin-left: auto;') !== -1,
            'счётчики прижаты к правому краю — на одном расстоянии «по самому дальнему»');
    });

    test('.pb-detail-group-count: к правому краю строки заголовка', () => {
        const i = INDEX_SRC.indexOf('#detailPanelBody .pb-detail-group-count {');
        assertTrue(i !== -1, 'правило есть');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf('margin-left: auto;') !== -1,
            'счётчики заголовков правого окна — тоже единой колонкой');
    });

    test('#pbList .pb-section-title: 32px — счётчики организаций на одном расстоянии', () => {
        const i = INDEX_SRC.indexOf('#pbList .pb-section-title { padding-right: 32px; }');
        assertTrue(i !== -1,
            'паддинг организаций = паддингу подгрупп (32px) — счётчики в одной колонке');
    });

    test('гвард: имена строк не растягиваются (flex:1 нет)', () => {
        const i = INDEX_SRC.indexOf('.pb-master-row-name {');
        assertTrue(i !== -1, 'правило есть');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf('flex: 0 1 auto;') !== -1,
            'ширина блока = самой длинной строке (Task 543 жива)');
        assertTrue(seg.indexOf('flex: 1') === -1, 'имя не растягивается');
    });
});

// ============================================================
// D. VM — рендер: зебра подразделений + счётчики
// ============================================================
describe('Task 544 — VM: рендер справочника', () => {

    test('мастер-дерево: чередование зебра-классов строк (per-org)', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        const html = t.pbList.innerHTML;
        const even = (html.match(/pb-master-row-even/g) || []).length;
        const odd = (html.match(/pb-master-row-odd/g) || []).length;
        assertEqual(even, 2, 'чётных строк (Цех 1 + «Без группы»)');
        assertEqual(odd, 1, 'нечётных строк (Цех 2)');
        assertTrue(html.indexOf('class="pb-master-row pb-master-row-even"') !== -1,
            'класс сразу после базового (первая строка организации)');
    });

    test('мастер-дерево: выбранная строка — зебра + selected вместе', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();          // строит pbMasterIndex
        t.sandbox.pbMasterOpen(0, 1);   // Цех 2 (odd) → selected
        const html = t.pbList.innerHTML;
        assertTrue(html.indexOf('pb-master-row pb-master-row-odd selected') !== -1,
            'выделение не смахивает зебру (CSS: .selected (0,2,0) > зебра (0,1,0))');
    });

    test('мастер-дерево: счётчик после имени (HTML-смежность Task 543)', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        const html = t.pbList.innerHTML;
        assertTrue(html.indexOf('pb-master-row-name">Цех 1</span><span class="pb-master-count">2</span>') !== -1,
            'имя → счётчик (выравнивание — CSS margin-left:auto)');
    });

    test('мобильный список: подгруппы с зебра-классами (чередование)', async () => {
        const t = makeVm({ desktop: false });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        const html = t.pbList.innerHTML;
        assertTrue(html.indexOf('pb-subgroup-title pb-subrow-even') !== -1,
            'Цех 1 — чётная строка-подразделение');
        assertTrue(html.indexOf('pb-subgroup-title pb-subrow-odd') !== -1,
            'Цех 2 — нечётная (зебра чередуется внутри организации)');
    });

    test('мобильный список: зебра карточек жива (Task 543)', async () => {
        const t = makeVm({ desktop: false });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        const html = t.pbList.innerHTML;
        const even = (html.match(/pb-card-even/g) || []).length;
        const odd = (html.match(/pb-card-odd/g) || []).length;
        assertTrue(even > 0 && odd > 0, 'карточки продолжают зебриться');
    });

    test('«Избранное»: подгруппы с зебра-классами (forceExpand)', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, [ID_IVANOV]);
        t.sandbox.pbSetTab('fav');
        const html = t.pbList.innerHTML;
        assertTrue(html.indexOf('pb-subgroup-title pb-subrow-even') !== -1,
            'зебра строк-подразделений и в режиме избранных');
    });

    test('правое окно: заголовки групп со счётчиками', async () => {
        const t = makeVm({ desktop: true });
        const opened = [];
        t.sandbox.openDetailPanel = function(title, html) { opened.push(html); };
        await seedPhonebook(t);
        t.sandbox.pbRender();          // мастер-дерево (вкладка «Все»)
        t.sandbox.pbMasterOpen(0);     // вся организация ООО ПО «ТОКЕМ»
        assertEqual(opened.length, 1, 'правое окно открыто');
        const html = opened[0];
        assertTrue(html.indexOf('pb-detail-group-title') !== -1, 'заголовки подразделений');
        assertTrue(html.indexOf('<span class="pb-detail-group-count">2</span>') !== -1,
            'счётчик Цех 1 (выравнивание — margin-left:auto)');
        assertTrue(html.indexOf('<span class="pb-detail-group-count">1</span>') !== -1,
            'счётчик Цех 2');
    });
});
