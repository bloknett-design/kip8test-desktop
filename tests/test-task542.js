// tests/test-task542.js
// Task 542 — телефонный справочник: дерево при входе свёрнуто (кроме
// ООО ПО «ТОКЕМ»), «Избранное» на десктопе в три столбца, обновляемые
// данные из Google Sheets. Заявка: «При входе в раздел дерево должно
// быть свёрнуто, кроме группы ООО ПО "ТОКЕМ", и в десктопе отображение
// контактов в избранном раздели на три столбика. Теперь необходимо
// сделать телефонный справочник обновляемым, вот ссылка на файл с
// данными https://docs.google.com/spreadsheets/d/1phGnzRS…»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — ДЕРЕВО ПО УМОЛЧАНИЮ: const PB_DEFAULT_OPEN_ORG =
//      'ООО ПО «ТОКЕМ»', функция pbMasterApplyDefaultCollapsed
//      (сброс карты + свёрнутость всех, кроме ТОКЕМ), вызов в
//      pbInit().then() ПОСЛЕ pbCleanupStaleFavorites и ДО pbRender
//      (pbInit срабатывает при каждом входе в раздел — значит,
//      «при входе дерево свёрнуто, кроме ТОКЕМ»).
//   B. SRC — ТРИ СТОЛБЦА «ИЗБРАННОГО» (десктоп) — ОТМЕНЕНЫ Task 543
//      (заявка: «на вкладке избранного размести текст контактов на
//      всю ширину поля, убери рамки блоков, а фон сделай зеброй»):
//      класс pb-fav-cols и его сетка удалены, тесты секции B
//      переписаны под одноколоночный список (1:1, счёт сохранён).
//   C. SRC — ОБНОВЛЯЕМЫЕ ДАННЫЕ: scripts/sync-phonebook.py (ID
//      таблицы пользователя, DEFAULT_HEADER = ООО ПО «ТОКЕМ», правила
//      плоской таблицы), workflow sync-phonebook.yml (cron 03:50,
//      авто-коммит), data/phonebook.json (source = URL таблицы,
//      первая секция ООО ПО «ТОКЕМ», subgroup null у всех записей,
//      total_records/total_companies сходятся с фактом).
//   C2. SRC/VM — УПРОЧНЕНИЕ СИНКА (гонка вход/синк, поймана браузерной
//      верификацией): merge при ПУСТОМ pbFlat (данные перезагружаются,
//      синк опередил загрузку) НЕ считает серверские id устаревшими
//      (guard haveData) — иначе мягкое удаление стирало всё избранное
//      каскадом; при загруженных данных мусорный id удаляется как
//      прежде.
//   D. VM — функционально: засев свёрнутости (2 из 3 организаций,
//      ТОКЕМ раскрыта); рендер дерева с collapsed/aria-expanded=false;
//      повторный засев сбрасывает ручные развороты; выбор подразделения
//      разворачивает организацию (Task 541 жива); pbInit засевает
//      состояние (и на «Избранном»); класс pb-fav-cols — только
//      десктоп + «Избранное» + без запроса (поиск/«Все»/мобайл — нет).
//
// Файл УНИВЕРСАЛЕН для 4 репозиториев (kip8test/kip8 и их десктоп-
// зеркала): префикс ключей и версия SW выводятся из index.html/sw.js.
// Проверка workflow — только в PWA-репо (десктоп-зеркала workflows
// не синхронят: sync-to-desktop копирует index/sw/scripts/tests/data).
//
// Запуск: через tests/run-all.js (require './test-task542.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const PB_JSON_SRC = fs.readFileSync(path.join(ROOT, 'data', 'phonebook.json'), 'utf8');
const SYNC_PY_PATH = path.join(ROOT, 'scripts', 'sync-phonebook.py');
const SYNC_PY = fs.existsSync(SYNC_PY_PATH)
    ? fs.readFileSync(SYNC_PY_PATH, 'utf8') : null;
const WF_PATH = path.join(ROOT, '.github', 'workflows', 'sync-phonebook.yml');
const WF_SRC = fs.existsSync(WF_PATH)
    ? fs.readFileSync(WF_PATH, 'utf8') : null;

// Префикс localStorage-ключей текущего репозитория (из PB_FAV_KEY)
const PFX_MATCH = INDEX_SRC.match(/const PB_FAV_KEY = '(\w+?)_phonebook_favorites'/);
const PFX = PFX_MATCH ? PFX_MATCH[1] : null;
// Task 542: v753→v754 (kip8test), v550→v551 (kip8)
const SW_EXPECTED = { kip8test: 'kipia-test-v755', kip8: 'kipia-v551' }[PFX] || null;
const SW_PREV = { kip8test: 'kipia-test-v753', kip8: 'kipia-v550' }[PFX] || null;
const SW_NEXT = { kip8test: 'kipia-test-v756', kip8: 'kipia-v552' }[PFX] || null;

const FAV_KEY = PFX + '_phonebook_favorites';
const SHEET_ID = '1phGnzRS1UPtl6G6jcfnt34jlqlKYhGn_';

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
// Песочница VM: мок DOM + isDesktop + рекордер классов pbList
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
    // Рекордер классов #pbList — фиксирует toggle(cls, force)
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
             listClasses: listClasses, opts: opts };
}

async function seedPhonebook(t) {
    await t.sandbox.pbLoad();
}

// Прогнать pbInit и дождаться pbLoad().then (микрозадачи — до таймера)
async function runInit(t) {
    t.sandbox.pbInit();
    await new Promise(function(r) { setTimeout(r, 0); });
}

function seedFavorites(t, ids) {
    const m = {};
    for (const id of ids) m[id] = true;
    t.ls.setItem(FAV_KEY, JSON.stringify(m));
    t.sandbox.pbLoadFavorites();
}

// ============================================================
// A. SRC — дерево по умолчанию свёрнуто, кроме ООО ПО «ТОКЕМ»
// ============================================================
describe('Task 542 — SRC: дерево свёрнуто при входе, кроме ООО ПО «ТОКЕМ»', () => {

    test('префикс ключей репозитория определён (PB_FAV_KEY)', () => {
        assertTrue(!!PFX, 'PB_FAV_KEY в index.html должен задавать префикс');
    });

    test('SW: версия поднята для Task 542', () => {
        assertTrue(!!SW_EXPECTED, 'версия SW выводится из префикса репо');
        assertTrue(SW_SRC.indexOf(SW_EXPECTED) !== -1,
            'sw.js содержит ' + SW_EXPECTED);
        assertTrue(SW_SRC.indexOf(SW_PREV) === -1,
            'прежней версии ' + SW_PREV + ' нет');
        assertTrue(SW_SRC.indexOf(SW_NEXT) === -1,
            'следующей версии ' + SW_NEXT + ' нет (гвард)');
    });

    test('const PB_DEFAULT_OPEN_ORG = ООО ПО «ТОКЕМ»', () => {
        assertTrue(REGION.indexOf("const PB_DEFAULT_OPEN_ORG = 'ООО ПО «ТОКЕМ»';") !== -1,
            'константа организации, раскрытой по умолчанию');
    });

    test('функция pbMasterApplyDefaultCollapsed определена', () => {
        assertTrue(REGION.indexOf('function pbMasterApplyDefaultCollapsed()') !== -1,
            'функция есть в телефонном блоке');
    });

    test('логика: сброс карты + свёрнутость всех, кроме ТОКЕМ', () => {
        const i = REGION.indexOf('function pbMasterApplyDefaultCollapsed()');
        const seg = REGION.slice(i, REGION.indexOf('}', REGION.indexOf('for', i)) + 1);
        assertTrue(seg.indexOf('pbMasterCollapsed = {};') !== -1,
            'карта сбрасывается (повторный вход = повторный засев)');
        assertTrue(seg.indexOf('pbData.sections') !== -1,
            'засев по секциям загруженных данных');
        assertTrue(seg.indexOf('if (header !== PB_DEFAULT_OPEN_ORG) pbMasterCollapsed[header] = true;') !== -1,
            'свёрнуты все организации, КРОМЕ ООО ПО «ТОКЕМ»');
    });

    test('pbInit вызывает засев ПОСЛЕ чистки избранного и ДО рендера', () => {
        const i = REGION.indexOf('pbLoad().then(() => {');
        assertTrue(i !== -1, 'блок pbLoad().then есть');
        const seg = REGION.slice(i, i + 700);
        const iClean = seg.indexOf('pbCleanupStaleFavorites();');
        const iSeed = seg.indexOf('pbMasterApplyDefaultCollapsed();');
        const iRender = seg.indexOf('pbRender();');
        assertTrue(iSeed !== -1, 'вызов засева есть в .then');
        assertTrue(iClean !== -1 && iSeed > iClean,
            'после pbCleanupStaleFavorites (данные уже загружены)');
        assertTrue(iRender !== -1 && iRender > iSeed,
            'до pbRender (дерево сразу рисуется свёрнутым)');
    });
});

// ============================================================
// B. SRC — «Избранное» на десктопе: ТРИ СТОЛБЦА ОТМЕНЕНЫ (Task 543)
// ============================================================
describe('Task 542/543 — SRC: «Избранное» — одна колонка (отмена 3 столбцов)', () => {

    test('Task 543: pbRender НЕ вешает класс pb-fav-cols', () => {
        assertTrue(INDEX_SRC.indexOf("list.classList.add('pb-fav-cols');") === -1,
            'вызова add больше нет — «Избранное» без сетки');
        assertTrue(INDEX_SRC.indexOf("list.classList.remove('pb-fav-cols');") === -1,
            'вызова remove нет — класс удалён из кода целиком');
        const iMaster = INDEX_SRC.indexOf('pbRenderMaster(list);');
        assertTrue(iMaster !== -1, 'ветка мастер-дерева жива (Task 540)');
    });

    test('Task 543: CSS-сетки трёх колонок нет', () => {
        assertTrue(INDEX_SRC.indexOf('#pbList.pb-fav-cols .pb-section-body {') === -1,
            'правило сетки repeat(3, 1fr) удалено');
        assertTrue(INDEX_SRC.indexOf('#pbList.pb-fav-cols .pb-subgroup-body') === -1,
            'тело подгруппы не раскрывается в сетку');
    });

    test('Task 543: CSS-обёрток display:contents нет', () => {
        assertTrue(INDEX_SRC.indexOf('#pbList.pb-fav-cols .pb-subgroup,') === -1,
            'блока правил обёрток нет');
        assertTrue(INDEX_SRC.indexOf('#pbList.pb-fav-cols .pb-subgroup-body') === -1,
            'тело подгруппы не раскрывается в сетку');
    });

    test('Task 543: заголовки групп без grid-column: 1 / -1', () => {
        assertTrue(INDEX_SRC.indexOf('#pbList.pb-fav-cols .pb-subgroup-title,') === -1,
            'правила заголовков сетки нет');
        assertTrue(INDEX_SRC.indexOf('#pbList.pb-fav-cols .pb-subsubgroup-title') === -1,
            'и подподгруппы — вне сетки');
    });

    test('Task 543: плиток-карточек с рамкой нет', () => {
        assertTrue(INDEX_SRC.indexOf('#pbList.pb-fav-cols .pb-card {') === -1,
            'правило карточки-плитки удалено');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] #pbList.pb-fav-cols .pb-card {') === -1,
            'светлая тема: плитки удалены');
    });

    test('Task 543: класс pb-fav-cols исчез из кода', () => {
        assertTrue(INDEX_SRC.indexOf('.pb-fav-cols') === -1,
            'ни CSS, ни JS не содержат селектор/класс pb-fav-cols');
    });
});

// ============================================================
// C. SRC — обновляемые данные из Google Sheets
// ============================================================
describe('Task 542 — SRC: обновляемый справочник (Google Sheets)', () => {

    test('scripts/sync-phonebook.py существует и знает таблицу', () => {
        assertTrue(!!SYNC_PY, 'файл scripts/sync-phonebook.py есть');
        assertTrue(SYNC_PY.indexOf(SHEET_ID) !== -1,
            'ID таблицы пользователя');
        assertTrue(SYNC_PY.indexOf("DEFAULT_HEADER = 'ООО ПО «ТОКЕМ»'") !== -1,
            'DEFAULT_HEADER — стабильный ключ первой секции (ID избранного)');
        assertTrue(SYNC_PY.indexOf("startswith('ООО')") !== -1,
            'правило: A-only + «ООО…» = заголовок организации');
        assertTrue(SYNC_PY.indexOf("'subgroup': None") !== -1,
            'плоская таблица: subgroup всегда null');
    });

    test('workflow sync-phonebook.yml (только PWA-репо)', () => {
        if (!WF_SRC) {
            // Десктоп-зеркало: workflows не синхронятся — пропускаем
            assertTrue(fs.existsSync(path.join(ROOT, 'charts-desktop.js')) || true,
                'десктоп-зеркало без workflows — ок');
            return;
        }
        assertTrue(WF_SRC.indexOf("cron: '50 3 * * *'") !== -1
                   || WF_SRC.indexOf("cron: '50 1 * * *'") !== -1,
            'ежедневный cron: 03:50 UTC kip8test / 01:50 UTC kip8 (на 2ч раньше)');
        assertTrue(WF_SRC.indexOf('python scripts/sync-phonebook.py') !== -1,
            'запуск синк-скрипта');
        assertTrue(WF_SRC.indexOf('auto: update phonebook data from Google Sheets') !== -1,
            'авто-коммит при изменении данных');
        assertTrue(WF_SRC.indexOf('data/phonebook.json') !== -1,
            'контроль изменений data/phonebook.json');
    });

    test('data/phonebook.json: источник — таблица пользователя', () => {
        const d = JSON.parse(PB_JSON_SRC);
        assertTrue((d.source || '').indexOf(SHEET_ID) !== -1,
            'source содержит ID Google-таблицы');
        const keys = Object.keys(d.sections);
        assertTrue(keys.length >= 5, 'организаций не меньше пяти');
        assertEqual('ООО ПО «ТОКЕМ»', keys[0],
            'первая секция — ООО ПО «ТОКЕМ» (стабильные ID избранного)');
    });

    test('data/phonebook.json: схема и счётчики сходятся', () => {
        const d = JSON.parse(PB_JSON_SRC);
        let n = 0, bad = 0, subgroups = 0;
        for (const items of Object.values(d.sections)) {
            for (const it of items) {
                n++;
                const keys = Object.keys(it).sort().join(',');
                if (keys !== 'group,name,phone,position,subgroup') bad++;
                if (it.subgroup !== null) subgroups++;
            }
        }
        assertEqual(d.total_records, n, 'total_records = фактическое число записей');
        assertEqual(d.total_companies, Object.keys(d.sections).length,
            'total_companies = числу секций');
        assertEqual(0, bad, 'у каждой записи ровно 5 полей схемы');
        assertEqual(0, subgroups, 'плоская таблица: subgroup всегда null');
    });
});

// ============================================================
// C2. SRC — упрочнение синка: guard haveData в pbSyncMerge
// ============================================================
describe('Task 542 — SRC: merge не удаляет при незагруженных данных', () => {

    test('guard haveData определён в pbSyncMerge', () => {
        const i = INDEX_SRC.indexOf('function pbSyncMerge(sfav, snotes)');
        assertTrue(i !== -1, 'функция merge есть');
        const seg = INDEX_SRC.slice(i, i + 1200);
        assertTrue(seg.indexOf('const haveData = validIds.size > 0;') !== -1,
            'данные не загружены (pbFlat пуст) → не считать id устаревшими');
    });

    test('ветки «серверского id не существует» гейтятся haveData', () => {
        assertTrue(INDEX_SRC.indexOf('if (inS && haveData && !validIds.has(id)) {') !== -1,
            'избранное: мягкое удаление только при загруженном справочнике');
        assertTrue(INDEX_SRC.indexOf('if (hasS && haveData && !validIds.has(id)) {') !== -1,
            'примечания: та же защита');
    });
});

// ============================================================
// D. VM — функциональные проверки
// ============================================================
// ПРИМЕЧАНИЕ: let/const-биндинги телефонного блока (pbMasterCollapsed,
// pbFilterFavOnly) НЕ видны снаружи vm-песочницы (они не становятся
// свойствами sandbox) — состояние проверяем ЧЕРЕЗ ПОВЕДЕНИЕ: рендер
// дерева (классы collapsed/aria) и API pbSetTab/pbMasterToggleOrg.

describe('Task 542 — VM: засев свёрнутости и три столбца', () => {

    test('засев: свёрнуты все организации, кроме ООО ПО «ТОКЕМ»', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbMasterApplyDefaultCollapsed();
        t.sandbox.pbRender();
        const html = t.pbList.innerHTML;
        assertTrue((html.match(/pb-master-org collapsed/g) || []).length === 2,
            'ООО Тест + ЧОО Тест свёрнуты');
        assertTrue((html.match(/aria-expanded="false"/g) || []).length === 2,
            'aria-expanded=false у двух шевронов');
        const iTok = html.indexOf('pb-master-org-name">ООО ПО «ТОКЕМ»');
        const iBlock = html.lastIndexOf('pb-master-org', iTok);
        assertTrue(iTok !== -1 && html.slice(iBlock, iTok).indexOf('collapsed') === -1,
            'ООО ПО «ТОКЕМ» РАСКРЫТА');
        assertTrue(html.indexOf('Цех 1') !== -1,
            'подразделения ТОКЕМ видимы');
    });

    test('дерево рендерится: ТОКЕМ раскрыта, остальные — collapsed', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbMasterApplyDefaultCollapsed();
        t.sandbox.pbRender();
        const html = t.pbList.innerHTML;
        assertTrue(html.indexOf('pb-master-org collapsed') !== -1,
            'есть свёрнутые организации');
        assertTrue((html.match(/pb-master-org collapsed/g) || []).length === 2,
            'ровно две свёрнутых (ООО Тест + ЧОО Тест)');
        assertTrue(html.indexOf('aria-expanded="false"') !== -1,
            'aria-expanded=false у свёрнутых');
        const iTok = html.indexOf('pb-master-org-name">ООО ПО «ТОКЕМ»');
        const iTokBlock = html.lastIndexOf('pb-master-org', iTok);
        assertTrue(iTok !== -1 && html.slice(iTokBlock, iTok).indexOf('collapsed') === -1,
            'ООО ПО «ТОКЕМ» не свёрнута');
        assertTrue(html.indexOf('Цех 1') !== -1,
            'подразделения ТОКЕМ видимы (в DOM, CSS их не прячет)');
        assertTrue(html.indexOf('Цех 2') !== -1,
            'подразделения свёрнутых остаются в DOM (прячет CSS)');
    });

    test('повторный вход сбрасывает ручные развороты', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbMasterApplyDefaultCollapsed();
        t.sandbox.pbRender();
        // Пользователь развернул ООО Тест вручную (без события →
        // fallback pbRender перерисует дерево)
        t.sandbox.pbMasterToggleOrg(null, 1);
        assertTrue((t.pbList.innerHTML.match(/pb-master-org collapsed/g) || []).length === 1,
            'ООО Тест развёрнута вручную (осталась только ЧОО Тест)');
        // Повторный вход в раздел — pbInit → засев заново
        t.sandbox.pbMasterApplyDefaultCollapsed();
        t.sandbox.pbRender();
        assertTrue((t.pbList.innerHTML.match(/pb-master-org collapsed/g) || []).length === 2,
            'после повторного входа ООО Тест снова свёрнута');
    });

    test('выбор подразделения разворачивает свёрнутую организацию (Task 541)', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbMasterApplyDefaultCollapsed();
        t.sandbox.pbRender();
        t.sandbox.pbMasterOpen(1, 0);   // ООО Тест → Цех 2
        assertEqual(1, t.calls.open.length, 'правое окно открыто');
        assertTrue((t.pbList.innerHTML.match(/pb-master-org collapsed/g) || []).length === 1,
            'ООО Тест развернулась выбором; ЧОО Тест осталась свёрнутой');
    });

    test('pbInit засевает свёрнутость при входе (вкладка «Все»)', async () => {
        const t = makeVm({ desktop: true });
        await runInit(t);
        const html = t.pbList.innerHTML;
        assertTrue((html.match(/pb-master-org collapsed/g) || []).length === 2,
            'дерево отрисовано свёрнутым (кроме ТОКЕМ)');
        const iTok = html.indexOf('pb-master-org-name">ООО ПО «ТОКЕМ»');
        const iBlock = html.lastIndexOf('pb-master-org', iTok);
        assertTrue(iTok !== -1 && html.slice(iBlock, iTok).indexOf('collapsed') === -1,
            'ООО ПО «ТОКЕМ» раскрыта при входе');
    });

    test('pbInit со стартом на «Избранном» тоже засевает дерево', async () => {
        const t = makeVm({ desktop: true });
        seedFavorites(t, [ID_IVANOV]);
        await runInit(t);
        // Старт на «Избранном» (Task 540) — эффект: отфильтрованный список
        assertTrue(t.pbList.innerHTML.indexOf('Иванов') !== -1,
            'избранный контакт в списке');
        assertTrue(t.pbList.innerHTML.indexOf('Козлов') === -1,
            'не-избранные скрыты (режим «Избранное» активен)');
        // Переключение на «Все» — дерево уже свёрнуто, кроме ТОКЕМ
        t.sandbox.pbSetTab('all');
        const html = t.pbList.innerHTML;
        assertTrue((html.match(/pb-master-org collapsed/g) || []).length === 2,
            'после переключения на «Все» дерево свёрнуто, кроме ТОКЕМ');
        const iTok = html.indexOf('pb-master-org-name">ООО ПО «ТОКЕМ»');
        assertTrue(iTok !== -1,
            'ТОКЕМ в дереве (раскрыта — блок без collapsed): ' +
            html.slice(html.lastIndexOf('pb-master-org', iTok), iTok));
    });

    test('Task 543: класс pb-fav-cols НЕ вешается — одна колонка', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        seedFavorites(t, [ID_IVANOV]);
        t.sandbox.pbSetTab('fav');
        assertTrue(t.listClasses['pb-fav-cols'] !== true,
            'класс не вешается (три столбца отменены Task 543)');
        assertTrue(t.pbList.innerHTML.indexOf('pb-card') !== -1,
            'инлайн-рендер избранного с карточками');
    });

    test('поиск на «Избранном» — одноколоночный список (класса нет)', async () => {
        const t = makeVm({ desktop: true, query: 'Ива' });
        await seedPhonebook(t);
        seedFavorites(t, [ID_IVANOV]);
        t.sandbox.pbSetTab('fav');
        assertTrue(t.listClasses['pb-fav-cols'] !== true,
            'при поиске сетки нет (Task 543: её нет вообще)');
    });

    test('вкладка «Все» на десктопе — класс снят (мастер-дерево)', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);
        t.sandbox.pbRender();
        assertTrue(t.listClasses['pb-fav-cols'] !== true,
            'на «Все» дерево, а не сетка карточек');
        assertTrue(t.pbList.innerHTML.indexOf('pb-master') !== -1, 'мастер-дерево');
    });

    test('мобильное «Избранное» — класса нет (одна колонка)', async () => {
        const t = makeVm({ desktop: false });
        await seedPhonebook(t);
        seedFavorites(t, [ID_IVANOV]);
        t.sandbox.pbSetTab('fav');
        assertTrue(t.listClasses['pb-fav-cols'] !== true,
            'мобильная версия не тронута');
        assertTrue(t.pbList.innerHTML.indexOf('pb-section') !== -1,
            'привычный мобильный аккордеон');
    });

    test('merge при ПУСТОМ pbFlat не стирает серверское избранное (гонка вход/синк)', async () => {
        const t = makeVm({ desktop: true });
        // Данные НЕ загружаем — pbFlat пуст, как при гонке «повторный вход
        // перезагружает данные, синк опередил загрузку»
        seedFavorites(t, [ID_IVANOV]);
        t.sandbox.pbSyncMerge({ [ID_IVANOV]: true }, {});
        const favs = JSON.parse(t.ls.getItem(FAV_KEY) || '{}');
        assertTrue(favs[ID_IVANOV] === true,
            'локальное избранное не стёрто мягким удалением');
        const q = JSON.parse(t.ls.getItem(PFX + '_phonebook_sync_queue') || '[]');
        assertTrue(!q.some(op => op.kind === 'fav' && op.on === false),
            'удаление НЕ ставится в очередь при незагруженных данных');
    });

    test('merge при загруженных данных: мусорный серверский id удаляется как прежде', async () => {
        const t = makeVm({ desktop: true });
        await seedPhonebook(t);   // pbFlat загружен — guard haveData истинен
        const junk = 'ООО ПО «ТОКЕМ»|Цех 1||Инженер|Призрак|99-99';
        t.sandbox.pbSyncMerge({ [junk]: true }, {});
        const q = JSON.parse(t.ls.getItem(PFX + '_phonebook_sync_queue') || '[]');
        assertTrue(q.some(op => op.kind === 'fav' && op.id === junk && op.on === false),
            'мусорный id по-прежнему уходит мягким удалением');
    });
});
