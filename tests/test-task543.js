// tests/test-task543.js
// Task 543 — телефонный справочник: кнопка раздела НЕ секретная (доступ —
// как у «Билетов» и «Библиотеки КИП и А»: library.view матрицы KIP8_Access,
// телефонный справочник в _LIBRARY_PAGES; остальным ролям скрыта полностью;
// кнопка — в разделе «Документация», закрепление на главной), «Избранное» —
// текст на всю ширину поля без рамок, фон зеброй (зебра и на «Все»);
// десктоп «Все» — ширина блоков строк по максимальному тексту, счётчики
// рядом с названиями разделов и подразделений.
//
// Заявка: «Кнопку раздела телефонного справочника сделай доступной (не
// секретной) для тех пользователей, у которых есть доступ к разделам Билеты
// и Библиотека КИП и А, согласно таблице в матрице доступа ролей, для
// остальных ролей полностью скрытой, и размести её в разделе Документация,
// с возможностью добавления на главный экран. Так же в телефонном
// справочнике, на вкладке избранного размести текст контактов на всю ширину
// поля, убери рамки блоков, а фон сделай зеброй, так же зеброй на вкладке
// Все. В десктопной версии, на вкладке Все, ширину блоков строк сделай по
// максимальному тексту и счётчики количества расположи рядом с названиями
// разделов и подразделов подразделений.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — ДОСТУП: _SECRET_PAGES = ['minesweeper'] (справочник убран),
//      _LIBRARY_PAGES содержит 'phonebook' (право library.view = доступ
//      к «Билетам» и «Библиотеке КИП и А»); пересборка матрицы: комментарий
//      secret.view → «Сапёр»; кнопка на странице «Документация»
//      (id=phonebookDocsBtn + openPinSheet('phonebook')); SUBSECTIONS
//      содержит 'phonebook' (закрепление на главной + свайп-обёртка);
//      renderPinnedItems красит категорию 'phonebook' золотым
//      «Документации» (Task 544: цвет кнопки — как в разделе
//      «Документация»; синий акцент Task 543 отменён); на главной
//      НЕТ id=phonebookBtn; SECRET_BUTTON_IDS = ['minesweeperBtn'];
//      _applyRoleToUI не управляет phonebookBtn; PAGE_PARENTS → 'docs'.
//   B. SRC — ЗЕБРА БЕЗ РАМОК: #pbList — сплошное поле (фон), .pb-section/
//      .pb-subgroup внутри #pbList без рамок/отступов/плашек; .pb-card без
//      border-bottom (строки разделяет зебра); зебра-цвета карточек живы;
//      класс pb-fav-cols исчез из кода (CSS+JS).
//   C. SRC — ДЕСКТОП «ВСЕ»: .pb-master inline-flex (shrink-wrap — ширина
//      блоков строк по максимальному тексту); .pb-master-org-name и
//      .pb-master-row-name без flex:1 (счётчики рядом с названиями).
//   D. VM — рендер: «Избранное» на десктопе — без pb-fav-cols, карточки с
//      зебра-классами (even/odd чередуются); мастер-дерево: счётчик сразу
//      после имени организации и подразделения (HTML-смежность);
//      мобильный список — карточки с зеброй; pbRenderContactsHtml —
//      сквозная зебра правого окна.
//
// Файл УНИВЕРСАЛЕН для 4 репозиториев (kip8test/kip8 и десктоп-зеркала):
// префикс ключей и версия SW выводятся из index.html/sw.js.
//
// Запуск: через tests/run-all.js (require './test-task543.js').

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
// Task 543: v754→v755 (kip8test), v551→v552 (kip8)
const SW_EXPECTED = { kip8test: 'kipia-test-v759', kip8: 'kipia-v552' }[PFX] || null;
const SW_PREV = { kip8test: 'kipia-test-v754', kip8: 'kipia-v551' }[PFX] || null;
const SW_NEXT = { kip8test: 'kipia-test-v760', kip8: 'kipia-v553' }[PFX] || null;

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
// Тестовый справочник: 3 организации, ООО ПО «ТОКЕМ» — первая
// ============================================================
const PB_JSON = {
    sections: {
        'ООО ПО «ТОКЕМ»': [
            { group: 'Цех 1', subgroup: null, position: 'Инженер', name: 'Иванов', phone: '11-11' },
            { group: 'Цех 1', subgroup: null, position: 'Мастер', name: 'Петров', phone: '22-22' }
        ],
        'ООО Тест': [
            { group: 'Цех 2', subgroup: null, position: 'Электрик', name: 'Сидоров', phone: '33-33' }
        ],
        'ЧОО Тест': [
            { group: null, subgroup: null, position: 'Дежурный', name: 'Козлов', phone: '44-44' }
        ]
    }
};
const ID_IVANOV = 'ООО ПО «ТОКЕМ»|Цех 1||Инженер|Иванов|11-11';

// ============================================================
// Песочница VM (как test-task542.js — мок DOM + isDesktop)
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
// A. SRC — доступ к разделу по матрице (library.view)
// ============================================================
describe('Task 543 — SRC: кнопка раздела — не секретная (library.view)', () => {

    test('префикс ключей репозитория определён (PB_FAV_KEY)', () => {
        assertTrue(!!PFX, 'PB_FAV_KEY в index.html должен задавать префикс');
    });

    test('SW: версия поднята для Task 543', () => {
        assertTrue(!!SW_EXPECTED, 'версия SW выводится из префикса репо');
        assertTrue(SW_SRC.indexOf(SW_EXPECTED) !== -1,
            'sw.js содержит ' + SW_EXPECTED);
        assertTrue(SW_SRC.indexOf(SW_PREV) === -1,
            'прежней версии ' + SW_PREV + ' нет');
        assertTrue(SW_SRC.indexOf(SW_NEXT) === -1,
            'следующей версии ' + SW_NEXT + ' нет (гвард)');
    });

    test('_SECRET_PAGES — только «Сапёр» (справочник убран)', () => {
        assertTrue(INDEX_SRC.indexOf("_SECRET_PAGES: ['minesweeper'],") !== -1,
            'массив секретных страниц — только minesweeper');
        const i = INDEX_SRC.indexOf('_SECRET_PAGES: [');
        const line = INDEX_SRC.slice(i, INDEX_SRC.indexOf(']', i) + 1);
        assertTrue(line.indexOf('phonebook') === -1,
            'справочник больше не секретный');
    });

    test('_LIBRARY_PAGES содержит phonebook (доступ = library.view)', () => {
        const i = INDEX_SRC.indexOf('_LIBRARY_PAGES: [');
        assertTrue(i !== -1, 'массив определён');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf(']', i) + 1);
        assertTrue(seg.indexOf("'phonebook'") !== -1,
            'phonebook в библиотечной группе — как «Билеты» и «Библиотека КИП и А»');
        assertTrue(seg.indexOf("'exam-tickets'") !== -1 &&
                    seg.indexOf("'library'") !== -1,
            'билеты и библиотека в той же группе');
    });

    test('пересборка матрицы: secret.view → «Сапёр», library.view + справочник', () => {
        assertTrue(INDEX_SRC.indexOf('secret.view            → «Сапёр»') !== -1,
            'комментарий пересборки: secret.view даёт только сапёра');
        const i = INDEX_SRC.indexOf('library.view           → библиотека');
        assertTrue(i !== -1, 'комментарий library.view есть');
        const seg = INDEX_SRC.slice(i, i + 220);
        assertTrue(seg.indexOf('Телефонный справочник') !== -1,
            'library.view включает телефонный справочник (Task 543)');
    });

    test('кнопка раздела — на странице «Документация»', () => {
        const iDocs = INDEX_SRC.indexOf('id="page-docs"');
        assertTrue(iDocs !== -1, 'страница Документация есть');
        const iBtn = INDEX_SRC.indexOf('id="phonebookDocsBtn"');
        assertTrue(iBtn !== -1, 'кнопка phonebookDocsBtn есть');
        // Кнопка должна быть внутри страницы «Документация» (до следующей страницы)
        const iNext = INDEX_SRC.indexOf('class="page-content"', iDocs + 20);
        assertTrue(iBtn > iDocs && (iNext === -1 || iBtn < iNext),
            'кнопка внутри page-docs');
        // Строка кнопки целиком (до конца строки — внутри есть вложенные </div>)
        const lineStart = INDEX_SRC.lastIndexOf('\n', iBtn) + 1;
        const lineEnd = INDEX_SRC.indexOf('\n', iBtn);
        const seg = INDEX_SRC.slice(lineStart, lineEnd);
        assertTrue(seg.indexOf("navigateTo('phonebook')") !== -1, 'навигация в справочник');
        assertTrue(seg.indexOf("openPinSheet('phonebook')") !== -1,
            'кнопка «…» — закрепление на главной');
        assertTrue(seg.indexOf('Телефонный справочник') !== -1, 'подпись кнопки');
    });

    test('SUBSECTIONS: ключ phonebook — закрепление на главной', () => {
        const i = INDEX_SRC.indexOf("'phonebook':     { label: 'Телефонный справочник'");
        assertTrue(i !== -1, 'запись реестра есть');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf("target: 'phonebook'") !== -1, 'цель навигации');
        assertTrue(seg.indexOf("category: 'phonebook'") !== -1,
            'категория phonebook (закреплённый ярлык — золотой акцент «Документации», Task 544)');
    });

    test('renderPinnedItems: категория phonebook — золотой акцент «Документации» (Task 544)', () => {
        const i = INDEX_SRC.indexOf(
            "const isDocs = s.category === 'docs' || s.category === 'phonebook';");
        assertTrue(i !== -1, 'категория phonebook красится как «Документация»');
        const seg = INDEX_SRC.slice(i, i + 400);
        assertTrue(seg.indexOf("'border-color:rgba(199,150,74,0.35);'") !== -1,
            'золотая рамка закреплённого ярлыка справочника');
        assertTrue(seg.indexOf("'color:#c7964a;'") !== -1, 'золотая подпись');
        assertTrue(INDEX_SRC.indexOf("const isPhonebook = s.category === 'phonebook';") === -1,
            'синяя ветка Task 543 удалена (Task 544: цвет — как в «Документации»)');
    });

    test('на главной НЕТ кнопки phonebookBtn (секретной больше нет)', () => {
        assertTrue(INDEX_SRC.indexOf('id="phonebookBtn"') === -1,
            'элемент phonebookBtn удалён из дашборда');
        assertTrue(INDEX_SRC.indexOf("SECRET_BUTTON_IDS = ['minesweeperBtn'];") !== -1,
            'жест двойного тапа открывает только «Сапёр»');
    });

    test('_applyRoleToUI не управляет phonebookBtn', () => {
        assertTrue(INDEX_SRC.indexOf("getElementById('phonebookBtn')") === -1,
            'обращений к phonebookBtn нет');
        assertTrue(INDEX_SRC.indexOf("getElementById('minesweeperBtn')") !== -1,
            '«Сапёр» по-прежнему скрывается по доступу');
    });

    test('PAGE_PARENTS: справочник — подраздел «Документации»', () => {
        const i = INDEX_SRC.indexOf("'phonebook':        'docs',");
        assertTrue(i !== -1, 'родитель справочника — хаб «Документация»');
    });
});

// ============================================================
// B. SRC — «Избранное»/«Все»: зебра без рамок, текст на всю ширину
// ============================================================
describe('Task 543 — SRC: текст на всю ширину, без рамок, зебра', () => {

    test('#pbList — сплошное поле (фон, клетчатый паттерн не просвечивает)', () => {
        const i = INDEX_SRC.indexOf('#pbList {');
        assertTrue(i !== -1, 'правило поля есть');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf('background: rgba(28, 34, 46, 0.94);') !== -1,
            'тёмная тема: фон поля');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] #pbList { background: rgba(255, 252, 245, 0.96); }') !== -1,
            'светлая тема: фон поля');
    });

    test('#pbList .pb-section — без рамки/плашки (текст на всю ширину)', () => {
        const i = INDEX_SRC.indexOf('#pbList .pb-section {');
        assertTrue(i !== -1, 'правило есть');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf('margin: 0;') !== -1, 'без боковых отступов');
        assertTrue(seg.indexOf('border: none;') !== -1, 'без рамки');
        assertTrue(seg.indexOf('border-radius: 0;') !== -1, 'без скругления плашки');
        assertTrue(seg.indexOf('background: transparent;') !== -1, 'без плашки');
    });

    test('#pbList .pb-subgroup — без рамки/плашки', () => {
        const i = INDEX_SRC.indexOf('#pbList .pb-subgroup {');
        assertTrue(i !== -1, 'правило есть');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf('margin: 0;') !== -1, 'без отступов');
        assertTrue(seg.indexOf('border: none;') !== -1, 'без рамки');
        assertTrue(seg.indexOf('background: transparent;') !== -1, 'без плашки');
        assertTrue(INDEX_SRC.indexOf('#pbList .pb-subgroup:first-child { border-top: none; }') !== -1,
            'первая подгруппа без верхней черты');
    });

    test('.pb-card — разделители убраны (строки разделяет зебра)', () => {
        const i = INDEX_SRC.indexOf('.pb-card {');
        assertTrue(i !== -1, 'правило карточки есть');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf('border-bottom') === -1, 'бордюр-разделитель убран');
        assertTrue(INDEX_SRC.indexOf('.pb-card:last-child { border-bottom: none; }') === -1,
            'хвостовое правило разделителя удалено');
    });

    test('зебра-цвета карточек живы (обе темы)', () => {
        assertTrue(INDEX_SRC.indexOf('.pb-card-even {') !== -1, 'чётная строка');
        assertTrue(INDEX_SRC.indexOf('.pb-card-odd {') !== -1, 'нечётная строка');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .pb-card-even {') !== -1,
            'светлая тема: чётная');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .pb-card-odd {') !== -1,
            'светлая тема: нечётная');
    });

    test('класс pb-fav-cols исчез из кода (CSS + JS)', () => {
        assertTrue(INDEX_SRC.indexOf('.pb-fav-cols') === -1,
            'ни селекторов, ни строк класса');
    });
});

// ============================================================
// C. SRC — десктоп «Все»: ширина по максимальному тексту + счётчики
// ============================================================
describe('Task 543 — SRC: десктоп «Все» — ширина строк и счётчики', () => {

    test('.pb-master — inline-flex (shrink-wrap по максимальному тексту)', () => {
        const i = INDEX_SRC.indexOf('.pb-master {');
        assertTrue(i !== -1, 'правило есть');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf('display: inline-flex;') !== -1,
            'дерево не растянуто на всё окно — ширина по контенту');
        assertTrue(seg.indexOf('flex-direction: column;') !== -1, 'колонка строк');
        assertTrue(seg.indexOf('max-width: 100%;') !== -1, 'страховка от сверхдлинных названий');
    });

    test('.pb-master-org-name — без flex:1 (счётчик рядом с названием)', () => {
        const i = INDEX_SRC.indexOf('.pb-master-org-name {');
        assertTrue(i !== -1, 'правило есть');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf('flex: 0 1 auto;') !== -1,
            'имя не растягивается — пилюля счётчика прижата к тексту');
        assertTrue(seg.indexOf('flex: 1') === -1, 'старого flex:1 нет');
    });

    test('.pb-master-row-name — без flex:1 (счётчик рядом)', () => {
        const i = INDEX_SRC.indexOf('.pb-master-row-name {');
        assertTrue(i !== -1, 'правило есть');
        const seg = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(seg.indexOf('flex: 0 1 auto;') !== -1, 'подразделение — как организация');
        assertTrue(seg.indexOf('flex: 1') === -1, 'старого flex:1 нет');
    });
});

// ============================================================
// D. VM — рендер: одна колонка, зебра, счётчики рядом с названиями
// ============================================================
describe('Task 543 — VM: рендер справочника', () => {

    test('«Избранное» на десктопе — без pb-fav-cols, карточки в одну колонку', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, [ID_IVANOV]);
        t.sandbox.pbSetTab('fav');
        assertTrue(t.listClasses['pb-fav-cols'] !== true,
            'класс сетки не вешается (три столбца отменены)');
        assertTrue(t.pbList.innerHTML.indexOf('pb-card') !== -1,
            'карточки отрисованы инлайн (одноколоночно)');
    });

    test('«Избранное» — зебра-классы у карточек чередуются', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, [ID_IVANOV]);
        t.sandbox.pbSetTab('fav');
        const html = t.pbList.innerHTML;
        const even = (html.match(/pb-card-even/g) || []).length;
        const odd = (html.match(/pb-card-odd/g) || []).length;
        assertEqual(even, 1, 'чётных карточек');
        assertEqual(odd, 0, 'нечётных карточек (один избранный)');
    });

    test('«Все» — зебра-классы у карточек мобильного списка', async () => {
        const t = makeVm({ desktop: false });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        const html = t.pbList.innerHTML;
        const even = (html.match(/pb-card-even/g) || []).length;
        const odd = (html.match(/pb-card-odd/g) || []).length;
        assertTrue(even > 0 && odd > 0, 'зебра чередуется в списке «Все»');
    });

    test('мастер-дерево: счётчик сразу после имени ОРГАНИЗАЦИИ', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        const html = t.pbList.innerHTML;
        assertTrue(html.indexOf('pb-master-org-name">ООО ПО «ТОКЕМ»</span><span class="pb-master-count">') !== -1,
            'HTML-смежность: имя организации → сразу счётчик (без растяжения)');
        assertTrue(html.indexOf('pb-master-org-name">ЧОО Тест</span><span class="pb-master-count">') !== -1,
            'и у короткого названия счётчик прижат к тексту');
    });

    test('мастер-дерево: счётчик сразу после имени ПОДРАЗДЕЛЕНИЯ', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        const html = t.pbList.innerHTML;
        assertTrue(html.indexOf('pb-master-row-name">Цех 1</span><span class="pb-master-count">2</span>') !== -1,
            'HTML-смежность: подразделение → счётчик количества рядом');
        assertTrue(html.indexOf('pb-master-row-name">Цех 2</span><span class="pb-master-count">1</span>') !== -1,
            'и во второй организации');
    });

    test('крошки: «Главная / Документация / Телефонный справочник / …»', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        t.sandbox.pbMasterOpen(0, 0);
        const bc = t.bcContent.innerHTML;
        assertTrue(bc.indexOf('Документация') !== -1,
            'сегмент «Документация» — раздел живёт в этом хабе (Task 543)');
        assertTrue(bc.indexOf("navigateTo('docs')") !== -1,
            'клик по «Документации» ведёт на страницу хаба');
        assertTrue(bc.indexOf('Телефонный справочник') !== -1,
            'сегмент раздела (сброс выбора)');
        assertTrue(bc.indexOf('ООО ПО «ТОКЕМ»') !== -1, 'сегмент организации');
        assertTrue(bc.indexOf('Цех 1') !== -1, 'текущий сегмент — подразделение');
    });

    test('правое окно: зебра сквозная (контакты организации)', async () => {
        const t = makeVm({ desktop: true });
        const opened = [];
        t.sandbox.openDetailPanel = function(title, html) { opened.push(html); };
        await seedPhonebook(t);
        t.sandbox.pbRender();          // мастер-дерево (вкладка «Все»)
        t.sandbox.pbMasterOpen(0);     // организация ООО ПО «ТОКЕМ» → правое окно
        assertEqual(opened.length, 1, 'правое окно открыто');
        const html = opened[0];
        const even = (html.match(/pb-card-even/g) || []).length;
        const odd = (html.match(/pb-card-odd/g) || []).length;
        assertEqual(even, 1, 'чётных в организации');
        assertEqual(odd, 1, 'нечётных в организации (сквозная зебра по окну)');
    });
});
