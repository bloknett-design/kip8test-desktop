// tests/test-task539.js
// Task 539 — телефонный справочник: табы «Все / Избранное» —
// мобильный нижний бар и десктопные табы. Заявка: «в мобильной
// версии сделай в нижней части кнопки "Избранное" и "Все", как в
// разделах расходомерах или в датчиках температуры, и в десктопной
// версии то же в стиле десктопа на два экрана (разделы и
// содержание)».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — HTML: нижний бар #pbBottomBar (сиблинг страницы, две
//      кнопки .pb-tab[data-pb-tab] со счётчиками), десктопные табы
//      #pbDesktopTabs — с Task 540 в баре хлебных крошек
//      #detailBreadcrumbBar (как #flowDesktopTabs расходомеров),
//      СТАРАЯ кнопка «Только избранные» (id pbFilterFav /
//      onclick pbToggleFavFilter) УДАЛЕНА.
//   B. SRC — CSS: .pb-bottom-bar (fixed, grid 1fr 1fr, показ
//      body:has(#page-phonebook.active), скрытие ≥1024px),
//      .pb-desktop-tabs (показ ≥1024px), светлые темы, отступ
//      .pb-list на мобильном, разделитель ::before.
//   C. SRC — JS: pbSetTab (валидация all|fav, сброс раскрытых
//      секций), pbUpdateTabs (синхронизация .pb-tab[data-pb-tab]
//      разом + счётчики 4 id), вызовы из pbRender и
//      pbToggleFavorite, УДАЛЕНЫ pbToggleFavFilter/
//      pbUpdateFilterButton (кодовая форма).
//   D. VM — функционально: переключение таба «Избранное»
//      фильтрует список (только избранные контакты), «Все»
//      возвращает полный список, повторный клик по активному
//      табу/мусорный аргумент ничего не меняют, счётчики
//      корректны (все/избранные), aria-selected обновляется,
//      пустое избранное → подсказка «Нет избранных контактов».
//
// Файл УНИВЕРСАЛЕН для 4 репозиториев (kip8test/kip8 и их десктоп-
// зеркала): префикс ключей и ожидаемая версия SW выводятся из
// index.html/sw.js самого репозитория.
//
// Запуск: через tests/run-all.js (require './test-task539.js').

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
// Ожидаемая версия SW по префиксу (Task 539: v750→v751, v547→v548)
const SW_EXPECTED = { kip8test: 'kipia-test-v760', kip8: 'kipia-v548' }[PFX] || null;
const SW_PREV = { kip8test: 'kipia-test-v750', kip8: 'kipia-v547' }[PFX] || null;

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
// Тестовый справочник (phonebook.json) и id контактов
// ============================================================
const PB_JSON = {
    sections: {
        'ООО Тест': [
            { group: 'Цех 1', subgroup: null, position: 'Инженер', name: 'Иванов', phone: '11-11' },
            { group: 'Цех 1', subgroup: null, position: 'Мастер', name: 'Петров', phone: '22-22' },
            { group: 'Цех 2', subgroup: 'Участок А', position: 'Электрик', name: 'Сидоров', phone: '33-33' }
        ]
    }
};
function mkId(name) {
    const items = {
        'Иванов': { header: 'ООО Тест', group: 'Цех 1', subgroup: null, position: 'Инженер', name: 'Иванов', phone: '11-11' },
        'Петров': { header: 'ООО Тест', group: 'Цех 1', subgroup: null, position: 'Мастер', name: 'Петров', phone: '22-22' },
        'Сидоров': { header: 'ООО Тест', group: 'Цех 2', subgroup: 'Участок А', position: 'Электрик', name: 'Сидоров', phone: '33-33' }
    };
    const it = items[name];
    return (it.header || '') + '|' + (it.group || '') + '|' + (it.subgroup || '') + '|' +
           (it.position || '') + '|' + (it.name || '') + '|' + (it.phone || '');
}
const ID_A = mkId('Иванов');

// ============================================================
// Песочница VM — с моком DOM под табы Task 539
// ============================================================
// pbFilterFavOnly — let-переменная модульного уровня (на глобале
// её нет): состояние проверяем через ЭФФЕКТ — отфильтрованный
// список (innerHTML мока #pbList) и активные классы табов.
function makeTabEl(kind) {
    return {
        _kind: kind,
        _active: (kind === 'all'),
        attrs: {},
        getAttribute: function(k) { return k === 'data-pb-tab' ? this._kind : null; },
        setAttribute: function(k, v) { this.attrs[k] = v; },
        classList: {
            toggle: function(cls, on) {
                if (cls === 'active') this._el._active = !!on;
            }.bind({ _el: null })
        }
    };
}
function makeVm(opts) {
    opts = opts || {};
    // табы: 2 десктопных + 2 мобильных (все .pb-tab[data-pb-tab])
    const tabs = [makeTabEl('all'), makeTabEl('fav'),
                  makeTabEl('all'), makeTabEl('fav')];
    // классы-моки привязать к своим элементам
    for (const tb of tabs) {
        tb.classList = {
            toggle: function(cls, on) {
                if (cls === 'active') this._el._active = !!on;
            }.bind({ _el: tb })
        };
    }
    const counts = {
        pbAllCountDesk: { textContent: '0' },
        pbAllCountMob: { textContent: '0' },
        pbFavCountDesk: { textContent: '0' },
        pbFavCountMob: { textContent: '0' }
    };
    const pbList = { innerHTML: '', classList: { add() {}, remove() {} } };
    const pbInfo = { textContent: '' };
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
        document: {
            querySelectorAll: function(sel) {
                if (sel === '.pb-tab[data-pb-tab]') return tabs.slice();
                return [];
            },
            getElementById: function(id) {
                if (id === 'pbList') return pbList;
                if (id === 'pbInfo') return pbInfo;
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
    return { sandbox: sandbox, ls: ls, tabs: tabs, counts: counts,
             pbList: pbList, pbInfo: pbInfo };
}

async function seedPhonebook(t) {
    await t.sandbox.pbLoad();
}
function seedFavorites(t, favMap) {
    t.ls.setItem(FAV_KEY, JSON.stringify(favMap || {}));
    t.sandbox.pbLoadFavorites();
}
// индекс таба по (вид, kind): view 'desk'|'mob'
function tab(t, view, kind) {
    return t.tabs[view === 'desk' ? (kind === 'all' ? 0 : 1) : (kind === 'all' ? 2 : 3)];
}

// ============================================================
// A. SRC — HTML
// ============================================================
describe('Task 539 — SRC: HTML табов и нижнего бара', () => {

    test('префикс ключей репозитория определён (PB_FAV_KEY)', () => {
        assertTrue(!!PFX, 'PB_FAV_KEY в index.html должен задавать префикс');
    });

    test('нижний бар #pbBottomBar — сиблинг #page-phonebook', () => {
        const iPage = INDEX_SRC.indexOf('id="page-phonebook"');
        const iBar = INDEX_SRC.indexOf('id="pbBottomBar"');
        assertTrue(iPage !== -1 && iBar !== -1, 'оба элемента есть');
        assertTrue(iBar > iPage, 'бар после страницы (сиблинг, как #tsBottomBar)');
        // закрывающий </div> страницы стоит между ними
        const between = INDEX_SRC.slice(iPage, iBar);
        assertTrue(between.indexOf('id="pbList"') !== -1,
            'бар вне страницы (после #pbList и закрытия страницы)');
    });

    test('нижний бар: две кнопки «Все» и «Избранное» со счётчиками', () => {
        const iBar = INDEX_SRC.indexOf('id="pbBottomBar"');
        const seg = INDEX_SRC.slice(iBar, iBar + 1600);
        assertTrue(seg.indexOf('data-pb-tab="all"') !== -1, 'таб Все');
        assertTrue(seg.indexOf('data-pb-tab="fav"') !== -1, 'таб Избранное');
        assertTrue(seg.indexOf('onclick="pbSetTab(\'all\')"') !== -1, 'клик Все → pbSetTab');
        assertTrue(seg.indexOf('onclick="pbSetTab(\'fav\')"') !== -1, 'клик Избранное → pbSetTab');
        assertTrue(seg.indexOf('id="pbAllCountMob"') !== -1, 'счётчик Все (моб)');
        assertTrue(seg.indexOf('id="pbFavCountMob"') !== -1, 'счётчик Избранное (моб)');
        assertTrue(seg.indexOf('role="tablist"') !== -1, 'role tablist');
        assertTrue(seg.indexOf('aria-selected') !== -1, 'aria-selected на табах');
        assertTrue(seg.indexOf('>Все <') !== -1, 'надпись «Все»');
        assertTrue(seg.indexOf('>Избранное <') !== -1, 'надпись «Избранное»');
    });

    test('десктопные табы #pbDesktopTabs в баре крошек (Task 540)', () => {
        // Task 540: табы переехали из тулбара .pb-toolbar (удалён) в бар
        // хлебных крошек #detailBreadcrumbBar — после #flowDesktopTabs
        const iBar = INDEX_SRC.indexOf('id="detailBreadcrumbBar"');
        const iFlowTabs = INDEX_SRC.indexOf('id="flowDesktopTabs"');
        const iTabs = INDEX_SRC.indexOf('id="pbDesktopTabs"');
        const iSearch = INDEX_SRC.indexOf('id="detailBarSearchInput"');
        assertTrue(iBar !== -1 && iFlowTabs !== -1 && iTabs !== -1 && iSearch !== -1,
            'бар, табы расходомеров, табы справочника и поиск есть');
        assertTrue(iTabs > iBar && iTabs > iFlowTabs && iTabs < iSearch,
            'табы справочника внутри бара, после flowDesktopTabs, до поиска');
        assertTrue(INDEX_SRC.indexOf('class="pb-toolbar"') === -1,
            'тулбар .pb-toolbar удалён из HTML');
        const seg = INDEX_SRC.slice(iTabs, iTabs + 800);
        assertTrue(seg.indexOf('data-pb-tab="all"') !== -1, 'таб Все');
        assertTrue(seg.indexOf('data-pb-tab="fav"') !== -1, 'таб Избранное');
        assertTrue(seg.indexOf('id="pbAllCountDesk"') !== -1, 'счётчик Все (десктоп)');
        assertTrue(seg.indexOf('id="pbFavCountDesk"') !== -1, 'счётчик Избранное (десктоп)');
        assertTrue(seg.indexOf('onclick="pbSetTab(\'all\')"') !== -1, 'клик Все');
        assertTrue(seg.indexOf('onclick="pbSetTab(\'fav\')"') !== -1, 'клик Избранное');
    });

    test('СТАРАЯ кнопка «Только избранные» удалена со страницы', () => {
        assertTrue(INDEX_SRC.indexOf('id="pbFilterFav"') === -1,
            'элемент pbFilterFav отсутствует');
        assertTrue(INDEX_SRC.indexOf('id="pbFilterFavLabel"') === -1,
            'метка pbFilterFavLabel отсутствует');
        assertTrue(INDEX_SRC.indexOf('onclick="pbToggleFavFilter()"') === -1,
            'обработчик pbToggleFavFilter из HTML удалён');
    });

    test('маркер Task 539 в HTML нижнего бара', () => {
        const iBar = INDEX_SRC.indexOf('id="pbBottomBar"');
        const before = INDEX_SRC.slice(Math.max(0, iBar - 900), iBar);
        assertTrue(before.indexOf('Task 539') !== -1,
            'комментарий-заметка Task 539 перед баром (история правки)');
    });
});

// ============================================================
// B. SRC — CSS
// ============================================================
describe('Task 539 — SRC: CSS табов и нижнего бара', () => {

    test('.pb-bottom-bar: fixed внизу, две равные колонки', () => {
        assertTrue(INDEX_SRC.indexOf('.pb-bottom-bar { position: fixed; bottom: 0;') !== -1,
            'fixed внизу экрана');
        assertTrue(INDEX_SRC.indexOf('grid-template-columns: 1fr 1fr;') !== -1,
            'две равные кнопки');
    });

    test('показ нижнего бара только на странице справочника', () => {
        assertTrue(INDEX_SRC.indexOf('body:has(#page-phonebook.active) .pb-bottom-bar { display: grid; }') !== -1,
            'body:has(#page-phonebook.active) → display: grid');
    });

    test('скрытие нижнего бара на десктопе (≥1024px)', () => {
        assertTrue(INDEX_SRC.indexOf('@media (min-width: 1024px) { body:has(#page-phonebook.active) .pb-bottom-bar { display: none !important; } }') !== -1,
            'media ≥1024px → display: none !important');
    });

    test('разделитель по центру нижнего бара (::before)', () => {
        assertTrue(INDEX_SRC.indexOf('.pb-bottom-bar::before') !== -1,
            'разделитель ::before');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .pb-bottom-bar::before') !== -1,
            'светлая тема разделителя');
    });

    test('кнопки нижнего бара — крупный мобильный размер', () => {
        assertTrue(INDEX_SRC.indexOf('#pbBottomBar .pb-tab {') !== -1,
            'стиль кнопок бара');
        assertTrue(INDEX_SRC.indexOf('min-height: 56px;') !== -1,
            'высота 56px как у расходомеров/датчиков');
        assertTrue(INDEX_SRC.indexOf('font-size: 17px;') !== -1,
            'шрифт 17px');
        assertTrue(INDEX_SRC.indexOf('env(safe-area-inset-bottom') !== -1,
            'safe-area-inset-bottom');
    });

    test('светлая тема нижнего бара', () => {
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] #pbBottomBar .pb-tab {') !== -1,
            'светлая тема кнопок');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] #pbBottomBar .pb-tab.active {') !== -1,
            'светлая тема активного таба');
    });

    test('десктопные табы: показ ≥1024px, компактный размер', () => {
        assertTrue(INDEX_SRC.indexOf('.pb-desktop-tabs {') !== -1, 'базовый стиль');
        // Task 540: показ — через body:has (как #flowDesktopTabs), табы в баре крошек
        assertTrue(INDEX_SRC.indexOf('body:has(#page-phonebook.active) #pbDesktopTabs { display: flex !important; }') !== -1,
            'показ на десктопе только на странице справочника');
        assertTrue(INDEX_SRC.indexOf('.pb-desktop-tabs .pb-tab {') !== -1,
            'компактные кнопки таба');
        assertTrue(INDEX_SRC.indexOf('.pb-desktop-tabs .pb-tab.active {') !== -1,
            'активное состояние');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .pb-desktop-tabs .pb-tab.active {') !== -1,
            'светлая тема активного таба');
    });

    test('отступ списка на мобильном — бар не накрывает карточки', () => {
        assertTrue(INDEX_SRC.indexOf('@media (max-width: 1023px) { body:has(#page-phonebook.active) .pb-list { padding-bottom: 96px; } }') !== -1,
            'padding-bottom: 96px у .pb-list на ≤1023px');
    });

    test('базовые .pb-tab и .pb-tab-count определены', () => {
        assertTrue(INDEX_SRC.indexOf('.pb-tab {') !== -1, 'базовый .pb-tab');
        assertTrue(INDEX_SRC.indexOf('.pb-tab-count {') !== -1, 'базовый .pb-tab-count');
        assertTrue(INDEX_SRC.indexOf('.pb-tab.active .pb-tab-count {') !== -1,
            'счётчик активного таба');
    });
});

// ============================================================
// C. SRC — JS
// ============================================================
describe('Task 539 — SRC: JS pbSetTab / pbUpdateTabs', () => {

    test('функции определены в телефонном блоке', () => {
        assertTrue(REGION && REGION.indexOf('function pbSetTab(') !== -1, 'pbSetTab');
        assertTrue(REGION && REGION.indexOf('function pbUpdateTabs(') !== -1, 'pbUpdateTabs');
    });

    test('СТАРЫЕ функции удалены (кодовая форма)', () => {
        assertTrue(INDEX_SRC.indexOf('function pbToggleFavFilter(') === -1,
            'pbToggleFavFilter удалена');
        assertTrue(INDEX_SRC.indexOf('function pbUpdateFilterButton(') === -1,
            'pbUpdateFilterButton удалена');
    });

    test('pbSetTab: валидация аргумента all|fav', () => {
        const i = INDEX_SRC.indexOf('function pbSetTab(');
        const seg = INDEX_SRC.slice(i, i + 700);
        assertTrue(seg.indexOf("if (tab !== 'all' && tab !== 'fav') return;") !== -1,
            'мусорный аргумент игнорируется');
    });

    test('pbSetTab: сброс раскрытых секций при переключении', () => {
        const i = INDEX_SRC.indexOf('function pbSetTab(');
        const seg = INDEX_SRC.slice(i, i + 900);
        assertTrue(seg.indexOf('pbExpandedSections = {};') !== -1,
            'как прежде в pbToggleFavFilter — в режиме фильтра секции раскрыты автоматически');
    });

    test('pbUpdateTabs: синхронизация всех .pb-tab[data-pb-tab] разом', () => {
        const i = INDEX_SRC.indexOf('function pbUpdateTabs(');
        const seg = INDEX_SRC.slice(i, i + 1200);
        assertTrue(seg.indexOf("querySelectorAll('.pb-tab[data-pb-tab]')") !== -1,
            'выборка всех табов (десктоп + мобильный бар)');
        assertTrue(seg.indexOf("b.getAttribute('data-pb-tab') === 'fav'") !== -1,
            'активность по data-pb-tab');
        assertTrue(seg.indexOf("classList.toggle('active'") !== -1,
            'переключение active');
        assertTrue(seg.indexOf("setAttribute('aria-selected'") !== -1,
            'aria-selected');
    });

    test('pbUpdateTabs: счётчики 4 id (десктоп + моб, все + избранные)', () => {
        const i = INDEX_SRC.indexOf('function pbUpdateTabs(');
        const seg = INDEX_SRC.slice(i, i + 1600);
        for (const id of ['pbAllCountDesk', 'pbAllCountMob',
                          'pbFavCountDesk', 'pbFavCountMob']) {
            assertTrue(seg.indexOf("'" + id + "'") !== -1, 'счётчик ' + id);
        }
        assertTrue(seg.indexOf('pbFlat.length') !== -1, 'всего контактов');
        assertTrue(seg.indexOf('pbGetFavoritesCount()') !== -1, 'избранных');
    });

    test('pbRender вызывает pbUpdateTabs (раньше — pbUpdateFilterButton)', () => {
        const i = INDEX_SRC.indexOf('function pbRender()');
        const seg = INDEX_SRC.slice(i, i + 600);
        assertTrue(seg.indexOf('pbUpdateTabs();') !== -1,
            'табы и счётчики обновляются при каждом рендере');
    });

    test('pbToggleFavorite вызывает pbUpdateTabs', () => {
        const i = INDEX_SRC.indexOf('function pbToggleFavorite(');
        const seg = INDEX_SRC.slice(i, i + 1500);
        assertTrue(seg.indexOf('pbUpdateTabs();') !== -1,
            'счётчик «Избранное» живо реагирует на звезду');
    });

    test('SW: версия поднята для Task 539', () => {
        assertTrue(!!SW_EXPECTED, 'префикс известен: ' + PFX);
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = '" + SW_EXPECTED + "'") !== -1,
            'CACHE_VERSION = ' + SW_EXPECTED);
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = '" + SW_PREV + "'") === -1,
            'старая версия ' + SW_PREV + ' отсутствует');
    });
});

// ============================================================
// D. VM — функциональные проверки
// ============================================================
describe('Task 539 — VM: переключение табов фильтрует список', () => {

    test('таб «Избранное»: список показывает только избранных', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });
        t.sandbox.pbRender();
        assertTrue(t.pbList.innerHTML.indexOf('Иванов') !== -1, 'исходно: Иванов есть');
        assertTrue(t.pbList.innerHTML.indexOf('Петров') !== -1, 'исходно: Петров есть');

        t.sandbox.pbSetTab('fav');
        assertTrue(t.pbList.innerHTML.indexOf('Иванов') !== -1,
            'после таба «Избранное»: Иванов (избранный) остался');
        assertTrue(t.pbList.innerHTML.indexOf('Петров') === -1,
            'Петров (не избранный) скрыт');
        assertTrue(t.pbList.innerHTML.indexOf('Сидоров') === -1,
            'Сидоров (не избранный) скрыт');
    });

    test('Task 540: инфо-строка удалена — счётчики в табах', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });
        t.sandbox.pbSetTab('fav');
        assertEqual('', t.pbInfo.textContent,
            'инфо-строка «Всего: … / Избранные: …» больше не пишется (Task 540)');
        assertTrue(INDEX_SRC.indexOf('id="pbInfo"') === -1,
            'элемент #pbInfo удалён из HTML');
    });

    test('таб «Все» возвращает полный список', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });
        t.sandbox.pbSetTab('fav');
        t.sandbox.pbSetTab('all');
        assertTrue(t.pbList.innerHTML.indexOf('Иванов') !== -1, 'Иванов вернулся');
        assertTrue(t.pbList.innerHTML.indexOf('Петров') !== -1, 'Петров вернулся');
        assertTrue(t.pbList.innerHTML.indexOf('Сидоров') !== -1, 'Сидоров вернулся');
    });

    test('пустое избранное + таб «Избранное» → подсказка', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        t.sandbox.pbSetTab('fav');
        assertTrue(t.pbList.innerHTML.indexOf('Нет избранных контактов') !== -1,
            'подсказка «Нет избранных контактов» (пежний текст сохранён)');
    });

    test('мусорный аргумент игнорируется (состояние не меняется)', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });
        t.sandbox.pbSetTab('fav');       // включён режим избранного
        t.sandbox.pbSetTab('junk');      // мусор — игнор
        t.sandbox.pbSetTab(undefined);   // undefined — игнор
        assertTrue(t.pbList.innerHTML.indexOf('Петров') === -1,
            'режим «Избранное» не сброшен');
        assertTrue(t.pbList.innerHTML.indexOf('Иванов') !== -1,
            'избранный на месте');
    });

    test('повторный клик по активному табу — без изменений', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });
        t.sandbox.pbSetTab('fav');
        t.sandbox.pbSetTab('fav');       // тот же таб
        assertTrue(t.pbList.innerHTML.indexOf('Иванов') !== -1, 'Иванов есть');
        assertTrue(t.pbList.innerHTML.indexOf('Петров') === -1, 'фильтр держится');
    });

    test('счётчики табов: все = 3, избранное = 1 (десктоп и моб)', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });
        t.sandbox.pbUpdateTabs();
        assertEqual('3', t.counts.pbAllCountDesk.textContent, 'Все (десктоп)');
        assertEqual('3', t.counts.pbAllCountMob.textContent, 'Все (моб)');
        assertEqual('1', t.counts.pbFavCountDesk.textContent, 'Избранное (десктоп)');
        assertEqual('1', t.counts.pbFavCountMob.textContent, 'Избранное (моб)');
    });

    test('активность и aria-selected синхронны на всех 4 табах', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedFavorites(t, { [ID_A]: true });
        t.sandbox.pbSetTab('fav');
        assertFalse(tab(t, 'desk', 'all')._active, 'десктоп «Все» не активен');
        assertTrue(tab(t, 'desk', 'fav')._active, 'десктоп «Избранное» активен');
        assertFalse(tab(t, 'mob', 'all')._active, 'моб «Все» не активен');
        assertTrue(tab(t, 'mob', 'fav')._active, 'моб «Избранное» активен');
        assertEqual('true', tab(t, 'desk', 'fav').attrs['aria-selected'],
            'aria-selected=true на активном');
        assertEqual('false', tab(t, 'mob', 'all').attrs['aria-selected'],
            'aria-selected=false на неактивном');

        t.sandbox.pbSetTab('all');
        assertTrue(tab(t, 'desk', 'all')._active, 'десктоп «Все» снова активен');
        assertFalse(tab(t, 'mob', 'fav')._active, 'моб «Избранное» снят');
    });

    test('счётчик «Избранное» обновляется через pbRender после звезды', async () => {
        // имитация правки избранного: карта обновлена → pbRender → счётчики
        const t = makeVm();
        await seedPhonebook(t);
        seedFavorites(t, {});
        t.sandbox.pbRender();
        assertEqual('0', t.counts.pbFavCountDesk.textContent, 'избранных 0');
        seedFavorites(t, { [ID_A]: true });
        t.sandbox.pbRender();
        assertEqual('1', t.counts.pbFavCountDesk.textContent,
            'после добавления звезды счётчик = 1 (без ручного pbUpdateTabs)');
    });
});
