// tests/test-task538.js
// Task 538 — клиентская синхронизация избранного/примечаний
// телефонного справочника: localStorage ↔ серверный архив
// (Task 537 PhonebookArchive.gs, Google Таблица «Телефонный
// справочник — Архив пользователей»). Заявка: «сделай клиентскую
// интеграцию — синхронизацию избранного/примечаний из localStorage
// в архив (данные будут переноситься между устройствами по email)».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — модуль PbSync в index.html (ключи base/queue с
//      префиксом репозитория; Task 540: бейдж pbSyncBadge УДАЛЁН —
//      синхронизация тихая, статус живёт в pbSyncState), хуки
//      pbInit/pbToggleFavorite/pbEditNote/
//      pbCleanupStaleFavorites, вызовы phonebook.getMyData/
//      setFavorite/setNote, ретрай по 'online', bump SW.
//   B. VM СЛИЯНИЕ (3-way merge по base-снимку):
//      первое знакомство (объединение), серверное удаление
//      выигрывает у локального бездействия, локальное удаление
//      у серверного хранения, локальная новинка — в очередь,
//      серверская — на клиент; примечания: серверская правка при
//      неизменном локальном, локальная правка при неизменном
//      серверном, конфликт двух правок — локальный вариант;
//      серверские id вне текущего phonebook.json не поднимаются
//      и уходят в архив мягким удалением.
//   C. VM ОЧЕРЕДЬ — коалесценция по (kind+id), персистентность в
//      localStorage (перезагрузка страницы).
//   D. VM PUSH — happy path (две операции, base зафиксирован),
//      сетевой сбой (очередь цела, pending), Unknown action
//      (oldServer, off), no_session (off), invalid_note
//      (операция выброшена, остальные ждут), пустая очередь.
//   E. VM PULL (pbSyncStart) — happy path с последующим push,
//      сервер недоступен, Unknown action → oldServer и отказ
//      накапливать очередь, no_session.
//   F. VM ОЧИСТКА — pbSyncDropStale: устаревшие, успевшие
//      синхронизироваться, удаляются и на сервере; локальный
//      мусор без синхронизации сервер не дёргает.
//   G. VM ДОСТУП/БЕЙДЖ/ИНФО — pbSyncAvailable (без токена, без
//      права), бейдж-тексты, тап-детализация с email, ретрай
//      очереди по событию 'online'.
//
// Файл УНИВЕРСАЛЕН для 4 репозиториев (kip8test/kip8 и их десктоп-
// зеркала): префикс ключей и ожидаемая версия SW выводятся из
// index.html/sw.js самого репозитория.
//
// Запуск: через tests/run-all.js (require './test-task538.js').

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
// Ожидаемая версия SW по префиксу (Task 538: v749→v750, v546→v547)
const SW_EXPECTED = { kip8test: 'kipia-test-v758', kip8: 'kipia-v547' }[PFX] || null;
const SW_PREV = { kip8test: 'kipia-test-v749', kip8: 'kipia-v546' }[PFX] || null;

const FAV_KEY = PFX + '_phonebook_favorites';
const NOTES_KEY = PFX + '_phonebook_notes';
const BASE_KEY = PFX + '_phonebook_sync_base';
const QUEUE_KEY = PFX + '_phonebook_sync_queue';

// Порядок ключей JSON не важен — нормализация с сортировкой
function norm(v) {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
        const o = {};
        Object.keys(v).sort().forEach(function(k) { o[k] = norm(v[k]); });
        return o;
    }
    return v;
}
function assertDeepEqual(actual, expected, message) {
    assertEqual(JSON.stringify(norm(actual)), JSON.stringify(norm(expected)), message);
}

// ============================================================
// Извлечение телефонного блока (включая модуль PbSync Task 538)
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
const ID_B = mkId('Петров');
const ID_C = mkId('Сидоров');
const ID_STALE = 'ООО Прошлый|||Директор|Старый|99-99';

// ============================================================
// Песочница VM
// ============================================================
// ВАЖНО: pbFavorites/pbNotes/pbFlat — let-переменные модульного
// уровня, на глобальном объекте контекста их НЕТ. Доступ — только
// через функции: посев localStorage + pbLoad*(), чтение —
// pbSave*() + разбор localStorage.
function makeLS() {
    const m = Object.create(null);
    return {
        getItem: k => (k in m ? m[k] : null),
        setItem: (k, v) => { m[k] = String(v); },
        removeItem: k => { delete m[k]; },
        _map: m
    };
}

// tick — макрозадача: гарантированно сливает очередь микрозадач VM
function tick() { return new Promise(r => setTimeout(r, 0)); }
async function ticks(n) { for (let i = 0; i < (n || 3); i++) await tick(); }

function makeVm(opts) {
    opts = opts || {};
    const ls = opts.ls || makeLS();
    const calls = { api: [], toasts: [], timers: [], online: null };
    const apiImpl = opts.apiImpl || function() { return Promise.resolve({}); };
    const badgeEl = { className: '', title: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    const labelEl = { textContent: '' };
    const docMap = { pbSyncBadge: badgeEl, pbSyncBadgeLabel: labelEl };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        localStorage: ls,
        window: {
            addEventListener: function(ev, fn) { if (ev === 'online') calls.online = fn; }
        },
        navigator: {},
        document: {
            getElementById: function(id) { return docMap[id] || null; }
        },
        setTimeout: function(fn) { calls.timers.push(fn); return calls.timers.length; },
        clearTimeout: function() {},
        fetch: function() {
            return Promise.resolve({ ok: true, json: () => Promise.resolve(PB_JSON) });
        },
        showToast: function(msg) { calls.toasts.push(String(msg)); },
        KipAuth: {
            getToken: function() { return opts.token === undefined ? 'tok-1' : (opts.token || ''); },
            canAccess: function() { return opts.canAccess === undefined ? true : opts.canAccess; },
            _cachedEmail: opts.email || 'tester@tokem.local',
            api: function(action, payload) {
                calls.api.push({ action: action, payload: payload });
                return apiImpl(action, payload, calls);
            }
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(REGION, sandbox);
    return { sandbox: sandbox, ls: ls, calls: calls, badgeEl: badgeEl, labelEl: labelEl };
}

// Загрузить тестовый справочник в VM (pbFlat готов для merge/entry)
async function seedPhonebook(t) {
    await t.sandbox.pbLoad();
}

// Посев локального состояния (как будто пользователь правил здесь)
function seedLocal(t, favMap, noteMap) {
    if (favMap) t.ls.setItem(FAV_KEY, JSON.stringify(favMap));
    if (noteMap) t.ls.setItem(NOTES_KEY, JSON.stringify(noteMap));
    t.sandbox.pbLoadFavorites();
    t.sandbox.pbLoadNotes();
}
// Посев base-снимка (последнее согласованное с сервером состояние)
function seedBase(t, favMap, noteMap) {
    t.ls.setItem(BASE_KEY, JSON.stringify({
        favorites: favMap || {}, notes: noteMap || {}
    }));
}

// Прочитать карты из localStorage песочницы
function readJson(t, key) {
    const raw = t.ls.getItem(key);
    return raw ? JSON.parse(raw) : null;
}

// ============================================================
// A. SRC — статические проверки index.html / sw.js
// ============================================================
describe('Task 538 — SRC: модуль PbSync в index.html', () => {

    test('префикс ключей репозитория определён (PB_FAV_KEY)', () => {
        assertTrue(!!PFX, 'PB_FAV_KEY в index.html должен задавать префикс');
    });

    test('модуль PbSync с маркерами Task 538 внутри телефонного блока', () => {
        assertTrue(INDEX_SRC.indexOf('// ===== Phonebook Sync (Task 538)') !== -1,
            'маркер начала модуля');
        assertTrue(REGION && REGION.indexOf('// ===== Phonebook Sync (Task 538)') !== -1,
            'модуль внутри телефонного блока (для VM-тестов)');
        assertTrue(REGION && REGION.indexOf('function pbSyncStart(') !== -1, 'pbSyncStart');
        assertTrue(REGION && REGION.indexOf('function pbSyncMerge(') !== -1, 'pbSyncMerge');
        assertTrue(REGION && REGION.indexOf('function pbSyncFlush(') !== -1, 'pbSyncFlush');
        assertTrue(REGION && REGION.indexOf('function pbSyncApplyPushed(') !== -1, 'pbSyncApplyPushed');
    });

    test('ключи base/queue с префиксом репозитория', () => {
        assertTrue(INDEX_SRC.indexOf("PB_SYNC_BASE_KEY = '" + PFX + "_phonebook_sync_base'") !== -1,
            'PB_SYNC_BASE_KEY');
        assertTrue(INDEX_SRC.indexOf("PB_SYNC_QUEUE_KEY = '" + PFX + "_phonebook_sync_queue'") !== -1,
            'PB_SYNC_QUEUE_KEY');
    });

    test('лимит очереди и коалесценция задекларированы', () => {
        assertTrue(INDEX_SRC.indexOf('PB_SYNC_QUEUE_MAX') !== -1, 'лимит очереди');
        assertTrue(INDEX_SRC.indexOf('pbSyncQueue[i].kind === op.kind && pbSyncQueue[i].id === op.id') !== -1,
            'коалесценция по (kind+id)');
    });

    test('серверные действия phonebook.* в клиенте', () => {
        assertTrue(INDEX_SRC.indexOf("'phonebook.getMyData'") !== -1, 'getMyData');
        assertTrue(INDEX_SRC.indexOf("'phonebook.setFavorite'") !== -1, 'setFavorite');
        assertTrue(INDEX_SRC.indexOf("'phonebook.setNote'") !== -1, 'setNote');
    });

    test('Task 540: бейдж синхронизации УДАЛЁН — синхронизация тихая', () => {
        assertTrue(INDEX_SRC.indexOf('id="pbSyncBadge"') === -1, 'элемент pbSyncBadge отсутствует');
        assertTrue(INDEX_SRC.indexOf('id="pbSyncBadgeLabel"') === -1, 'метка pbSyncBadgeLabel отсутствует');
        assertTrue(INDEX_SRC.indexOf('onclick="pbSyncInfo()"') === -1, 'тап-обработчик pbSyncInfo отсутствует');
        assertTrue(INDEX_SRC.indexOf('function pbSyncInfo(') === -1, 'функция pbSyncInfo удалена');
    });

    test('Task 540: CSS бейджа удалён, состояние — в pbSyncState', () => {
        assertTrue(INDEX_SRC.indexOf('.pb-sync-badge {') === -1, 'базовый стиль удалён');
        assertTrue(INDEX_SRC.indexOf('.pb-sync-badge.sync-ok') === -1, 'sync-ok удалён');
        assertTrue(INDEX_SRC.indexOf('@keyframes pbSyncPulse') === -1, 'анимация pbSyncPulse удалена');
        assertTrue(INDEX_SRC.indexOf('pbSyncState.pending = pbSyncQueue.length') !== -1,
            'pbSyncUpdateBadge поддерживает счётчик очереди в состоянии');
    });

    test('хук pbInit → pbSyncStart', () => {
        const i = INDEX_SRC.indexOf('function pbInit()');
        assertTrue(i !== -1, 'pbInit');
        // Task 540: pbInit вырос (старт на «Избранном» + сброс выбора) — окно 1600
        const seg = INDEX_SRC.slice(i, i + 1600);
        assertTrue(seg.indexOf('pbCleanupStaleFavorites();') !== -1, 'очистка на месте');
        assertTrue(seg.indexOf('pbSyncStart();') !== -1, 'старт синхронизации после рендера');
    });

    test('хук pbToggleFavorite → pbSyncEnqueueFav', () => {
        const i = INDEX_SRC.indexOf('function pbToggleFavorite(');
        const seg = INDEX_SRC.slice(i, i + 1400);
        assertTrue(seg.indexOf('pbSyncEnqueueFav(id, pbFavorites[id] === true)') !== -1,
            'новое состояние звезды уходит в очередь');
    });

    test('хук pbEditNote → pbSyncEnqueueNote', () => {
        const i = INDEX_SRC.indexOf('function pbEditNote(');
        const seg = INDEX_SRC.slice(i, i + 1400);
        assertTrue(seg.indexOf('pbSyncEnqueueNote(id, trimmed)') !== -1,
            'примечание (пустое = удаление) уходит в очередь');
    });

    test('очистка устаревших интегрирована с синхронизацией', () => {
        assertTrue(INDEX_SRC.indexOf('function pbSyncDropStale(') !== -1, 'pbSyncDropStale');
        assertTrue(INDEX_SRC.indexOf('pbSyncDropStale(favIds, noteIds)') !== -1,
            'вызов из pbCleanupStaleFavorites');
        assertTrue(INDEX_SRC.indexOf('favIds: [], noteIds: []') !== -1,
            'очистка возвращает списки удалённых id');
    });

    test('ретрай по событию online', () => {
        assertTrue(INDEX_SRC.indexOf("window.addEventListener('online'") !== -1,
            'обработчик online');
    });

    test('деградация на localStorage (клиент без google.script.run)', () => {
        // Синхронизация — только через KipAuth.api (fetch Apps Script
        // с токеном); прямых вызовов google.script.run в клиенте нет
        assertTrue(INDEX_SRC.indexOf('google.script.run') === -1,
            'клиент работает через fetch Apps Script, не google.script.run');
    });

    test('SW: версия поднята для Task 538', () => {
        assertTrue(!!SW_EXPECTED, 'префикс известен: ' + PFX);
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = '" + SW_EXPECTED + "'") !== -1,
            'CACHE_VERSION = ' + SW_EXPECTED);
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = '" + SW_PREV + "'") === -1,
            'старая версия ' + SW_PREV + ' отсутствует');
    });
});

// ============================================================
// B. VM — слияние (3-way merge)
// ============================================================
describe('Task 538 — VM: слияние избранного', () => {

    test('первое знакомство: объединение локального и серверного', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedLocal(t, { [ID_A]: true }, {});
        const changed = t.sandbox.pbSyncMerge({ [ID_B]: true }, {});
        t.sandbox.pbSaveFavorites();
        t.sandbox.pbSaveNotes();
        t.sandbox.pbSyncSaveBase();
        assertTrue(changed === true, 'серверное избранное появилось локально');
        assertDeepEqual(readJson(t, FAV_KEY), { [ID_A]: true, [ID_B]: true },
            'объединение: и локальное, и серверное');
        assertDeepEqual(readJson(t, BASE_KEY).favorites, { [ID_B]: true },
            'в base — только серверное (локальное ещё не отправлено)');
        const q = readJson(t, QUEUE_KEY);
        assertEqual(q.length, 1, 'локальная новинка уходит в очередь');
        assertEqual(q[0].kind, 'fav', 'kind');
        assertEqual(q[0].id, ID_A, 'id');
        assertEqual(q[0].on, true, 'on=true');
        assertDeepEqual(q[0].entry, { header: 'ООО Тест', group: 'Цех 1', subgroup: '',
            position: 'Инженер', name: 'Иванов', phone: '11-11' }, 'снимок entry из pbFlat');
    });

    test('серверное удаление выигрывает у локального бездействия', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedBase(t, { [ID_A]: true }, {});
        seedLocal(t, { [ID_A]: true }, {});            // с прошлой синхронизации не трогали
        const changed = t.sandbox.pbSyncMerge({}, {}); // сервер: удалено
        t.sandbox.pbSaveFavorites();
        t.sandbox.pbSaveNotes();
        t.sandbox.pbSyncSaveBase();
        assertTrue(changed === true, 'локальное состояние изменилось');
        assertDeepEqual(readJson(t, FAV_KEY), {}, 'удаление с сервера подхватилось');
        assertDeepEqual(readJson(t, BASE_KEY).favorites, {}, 'base согласован: записи нет');
        assertEqual((readJson(t, QUEUE_KEY) || []).length, 0,
            'в очередь ничего не ставится (локально не добавляли)');
    });

    test('локальное удаление выигрывает у серверного хранения', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedBase(t, { [ID_A]: true }, {});
        seedLocal(t, {}, {});                          // локально пусто = удалили здесь
        const changed = t.sandbox.pbSyncMerge({ [ID_A]: true }, {});
        t.sandbox.pbSaveFavorites();
        t.sandbox.pbSaveNotes();
        t.sandbox.pbSyncSaveBase();
        assertTrue(changed !== true, 'локально и так пусто');
        assertDeepEqual(readJson(t, FAV_KEY), {}, 'не воскресло');
        assertDeepEqual(readJson(t, BASE_KEY).favorites, { [ID_A]: true },
            'base держит до подтверждения push (защита от воскрешения при сбое сети)');
        const q = readJson(t, QUEUE_KEY);
        assertEqual(q.length, 1, 'удаление уходит на сервер');
        assertEqual(q[0].on, false, 'on=false');
    });

    test('серверное добавление попадает на клиент без очереди', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedLocal(t, {}, {});
        const changed = t.sandbox.pbSyncMerge({ [ID_C]: true }, {});
        t.sandbox.pbSaveFavorites();
        t.sandbox.pbSaveNotes();
        t.sandbox.pbSyncSaveBase();
        assertTrue(changed === true, 'данные появились локально');
        assertDeepEqual(readJson(t, FAV_KEY), { [ID_C]: true }, 'серверское избранное поднято');
        assertDeepEqual(readJson(t, BASE_KEY).favorites, { [ID_C]: true }, 'base согласован');
        assertEqual((readJson(t, QUEUE_KEY) || []).length, 0, 'очередь пуста');
    });

    test('серверский устаревший id не поднимается — в архив уходит удаление', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedLocal(t, { [ID_STALE]: true }, {});        // и локально завалялось
        const changed = t.sandbox.pbSyncMerge({ [ID_STALE]: true }, {});
        t.sandbox.pbSaveFavorites();
        t.sandbox.pbSaveNotes();
        t.sandbox.pbSyncSaveBase();
        assertTrue(changed === true, 'устаревшее убрано из локального');
        assertDeepEqual(readJson(t, FAV_KEY), {}, 'локально чисто');
        const q = readJson(t, QUEUE_KEY);
        assertEqual(q.length, 1, 'мягкое удаление уходит на сервер');
        assertEqual(q[0].id, ID_STALE, 'id');
        assertEqual(q[0].on, false, 'on=false');
    });
});

describe('Task 538 — VM: слияние примечаний', () => {

    test('серверная правка подхватывается при неизменном локальном', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedBase(t, {}, { [ID_A]: 'старый' });
        seedLocal(t, {}, { [ID_A]: 'старый' });
        const changed = t.sandbox.pbSyncMerge({}, { [ID_A]: 'новый' });
        t.sandbox.pbSaveFavorites();
        t.sandbox.pbSaveNotes();
        t.sandbox.pbSyncSaveBase();
        assertTrue(changed === true, 'текст обновился');
        assertDeepEqual(readJson(t, NOTES_KEY), { [ID_A]: 'новый' }, 'серверный текст');
        assertDeepEqual(readJson(t, BASE_KEY).notes, { [ID_A]: 'новый' }, 'base согласован');
        assertEqual((readJson(t, QUEUE_KEY) || []).length, 0, 'очередь пуста');
    });

    test('локальная правка уходит на сервер при неизменном сервере', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedBase(t, {}, { [ID_A]: 'сервер' });
        seedLocal(t, {}, { [ID_A]: 'локально' });      // правили здесь
        const changed = t.sandbox.pbSyncMerge({}, { [ID_A]: 'сервер' });
        t.sandbox.pbSaveFavorites();
        t.sandbox.pbSaveNotes();
        t.sandbox.pbSyncSaveBase();
        assertTrue(changed !== true, 'локально и так актуально');
        assertDeepEqual(readJson(t, NOTES_KEY), { [ID_A]: 'локально' }, 'локальный текст сохранён');
        assertDeepEqual(readJson(t, BASE_KEY).notes, { [ID_A]: 'сервер' },
            'base ждёт подтверждения push');
        const q = readJson(t, QUEUE_KEY);
        assertEqual(q.length, 1, 'правка в очереди');
        assertEqual(q[0].text, 'локально', 'text');
    });

    test('конфликт двух правок — остаётся локальный вариант', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedBase(t, {}, { [ID_A]: 'база' });
        seedLocal(t, {}, { [ID_A]: 'тут' });           // правили на этом устройстве
        const changed = t.sandbox.pbSyncMerge({}, { [ID_A]: 'там' });   // правили и там
        t.sandbox.pbSaveFavorites();
        t.sandbox.pbSaveNotes();
        t.sandbox.pbSyncSaveBase();
        assertTrue(changed !== true, 'локальный вариант на месте');
        assertDeepEqual(readJson(t, NOTES_KEY), { [ID_A]: 'тут' }, 'локальный текст');
        assertEqual(t.sandbox.pbSyncGetState().conflicts, 1, 'конфликт посчитан');
        assertEqual(t.calls.toasts.length, 1, 'пользователь уведомлён о конфликте');
        const q = readJson(t, QUEUE_KEY);
        assertEqual(q.length, 1, 'локальный вариант уезжает на сервер');
        assertEqual(q[0].text, 'тут', 'text');
    });

    test('серверное удаление примечания при неизменном локальном', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedBase(t, {}, { [ID_B]: 'текст' });
        seedLocal(t, {}, { [ID_B]: 'текст' });
        const changed = t.sandbox.pbSyncMerge({}, {});
        t.sandbox.pbSaveFavorites();
        t.sandbox.pbSaveNotes();
        t.sandbox.pbSyncSaveBase();
        assertTrue(changed === true, 'локально удалено');
        assertDeepEqual(readJson(t, NOTES_KEY), {}, 'примечания нет');
        assertDeepEqual(readJson(t, BASE_KEY).notes, {}, 'base согласован');
        assertEqual((readJson(t, QUEUE_KEY) || []).length, 0, 'очередь пуста');
    });

    test('локальное удаление примечания уезжает на сервер', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedBase(t, {}, { [ID_B]: 'текст' });
        seedLocal(t, {}, {});                          // локально пусто = удалили здесь
        const changed = t.sandbox.pbSyncMerge({}, { [ID_B]: 'текст' });
        t.sandbox.pbSaveFavorites();
        t.sandbox.pbSaveNotes();
        t.sandbox.pbSyncSaveBase();
        assertTrue(changed !== true, 'локально и так пусто');
        assertDeepEqual(readJson(t, NOTES_KEY), {}, 'не воскресло');
        const q = readJson(t, QUEUE_KEY);
        assertEqual(q.length, 1, 'удаление в очереди');
        assertEqual(q[0].text, '', 'пустой текст = удаление');
    });

    test('серверское примечание к устаревшему id — удаление в архив', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedLocal(t, {}, {});
        const changed = t.sandbox.pbSyncMerge({}, { [ID_STALE]: 'осиротевшее' });
        t.sandbox.pbSaveFavorites();
        t.sandbox.pbSaveNotes();
        t.sandbox.pbSyncSaveBase();
        assertTrue(changed !== true, 'локально не появилось');
        assertDeepEqual(readJson(t, NOTES_KEY), {}, 'локально чисто');
        const q = readJson(t, QUEUE_KEY);
        assertEqual(q.length, 1, 'в архив — мягкое удаление');
        assertEqual(q[0].id, ID_STALE, 'id');
        assertEqual(q[0].text, '', 'пустой текст');
    });
});

// ============================================================
// C. VM — очередь исходящих
// ============================================================
describe('Task 538 — VM: очередь исходящих операций', () => {

    test('коалесценция: поздняя правка затирает раннюю по (kind+id)', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        t.sandbox.pbSyncEnqueueFav(ID_A, true);
        t.sandbox.pbSyncEnqueueFav(ID_A, false);       // передумали
        t.sandbox.pbSyncEnqueueFav(ID_A, true);        // и снова передумали
        const q = readJson(t, QUEUE_KEY);
        assertEqual(q.length, 1, 'одна операция на контакт');
        assertEqual(q[0].on, true, 'победила последняя правка');
        assertEqual(t.calls.timers.length, 1, 'дебаунс-таймер не плодится');
    });

    test('коалесценция не смешивает типы и контакты', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        t.sandbox.pbSyncEnqueueFav(ID_A, true);
        t.sandbox.pbSyncEnqueueNote(ID_A, 'заметка');
        t.sandbox.pbSyncEnqueueFav(ID_B, true);
        const q = readJson(t, QUEUE_KEY);
        assertEqual(q.length, 3, 'три независимые операции');
    });

    test('очередь переживает перезагрузку (localStorage)', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        t.sandbox.pbSyncEnqueueNote(ID_A, 'текст');
        // Новая песочница с тем же localStorage — как новая вкладка
        const t2 = makeVm({ ls: t.ls });
        const q = readJson(t2, QUEUE_KEY);
        assertEqual(q.length, 1, 'операция восстановлена');
        assertEqual(q[0].text, 'текст', 'текст цел');
        assertTrue(t2.calls.online !== null, 'online-обработчик зарегистрирован');
    });
});

// ============================================================
// D. VM — выталкивание очереди
// ============================================================
describe('Task 538 — VM: выталкивание очереди (push)', () => {

    test('happy path: две операции, base зафиксирован, очередь пуста', async () => {
        const t = makeVm({
            apiImpl: function(action) {
                if (action === 'phonebook.getMyData') {
                    return Promise.resolve({ srvVer: '537', favorites: {}, notes: {} });
                }
                return Promise.resolve({ id: 'x', ok: true });
            }
        });
        await seedPhonebook(t);
        t.sandbox.pbSyncEnqueueFav(ID_A, true);
        t.sandbox.pbSyncEnqueueNote(ID_B, 'примечание');
        t.sandbox.pbSyncFlush();
        await ticks(4);
        assertEqual(readJson(t, QUEUE_KEY).length, 0, 'очередь пуста');
        assertEqual(t.calls.api.length, 2, 'два серверных вызова');
        assertEqual(t.calls.api[0].action, 'phonebook.setFavorite', 'первый — избранное');
        assertEqual(t.calls.api[0].payload.token, 'tok-1', 'токен приложен');
        assertEqual(t.calls.api[0].payload.on, true, 'on');
        assertEqual(t.calls.api[0].payload.entry.name, 'Иванов', 'снимок entry');
        assertEqual(t.calls.api[1].action, 'phonebook.setNote', 'второй — примечание');
        assertEqual(t.calls.api[1].payload.text, 'примечание', 'текст');
        const base = readJson(t, BASE_KEY);
        assertDeepEqual(base.favorites, { [ID_A]: true }, 'base: избранное');
        assertDeepEqual(base.notes, { [ID_B]: 'примечание' }, 'base: примечание');
        assertEqual(t.sandbox.pbSyncGetState().mode, 'ok', 'режим ok');
    });

    test('сетевой сбой: очередь цела, режим pending', async () => {
        const t = makeVm({
            apiImpl: function() {
                return Promise.reject(new Error('NETWORK_ERROR: Failed to fetch'));
            }
        });
        await seedPhonebook(t);
        t.sandbox.pbSyncEnqueueFav(ID_A, true);
        t.sandbox.pbSyncEnqueueNote(ID_B, 'текст');
        t.sandbox.pbSyncFlush();
        await ticks(4);
        assertEqual(readJson(t, QUEUE_KEY).length, 2, 'очередь не потеряна');
        assertEqual(t.sandbox.pbSyncGetState().mode, 'pending', 'режим pending');
    });

    test('Unknown action: старый сервер — тихий локальный режим', async () => {
        const t = makeVm({
            apiImpl: function() {
                return Promise.reject(new Error('Unknown action: phonebook.setFavorite'));
            }
        });
        await seedPhonebook(t);
        t.sandbox.pbSyncEnqueueFav(ID_A, true);
        t.sandbox.pbSyncFlush();
        await ticks(4);
        assertEqual(t.sandbox.pbSyncGetState().oldServer, true, 'флаг старого сервера');
        assertEqual(t.sandbox.pbSyncGetState().mode, 'off', 'режим off');
        // После флага очередь не накапливается
        const before = readJson(t, QUEUE_KEY).length;
        t.sandbox.pbSyncEnqueueFav(ID_B, true);
        assertEqual(readJson(t, QUEUE_KEY).length, before, 'очередь не растёт на старом сервере');
    });

    test('no_session: локальный режим, очередь ждёт повторного входа', async () => {
        const t = makeVm({
            apiImpl: function() {
                return Promise.reject(new Error('no_session'));
            }
        });
        await seedPhonebook(t);
        t.sandbox.pbSyncEnqueueFav(ID_A, true);
        t.sandbox.pbSyncFlush();
        await ticks(4);
        assertEqual(t.sandbox.pbSyncGetState().mode, 'off', 'режим off');
        assertEqual(readJson(t, QUEUE_KEY).length, 1, 'очередь сохранена для повтора');
    });

    test('invalid_note: операция выброшена, остальные продолжат', async () => {
        const t = makeVm({
            apiImpl: function(action, payload) {
                if (payload.id === ID_A) {
                    const e = new Error('invalid_note');
                    e.serverMessage = 'Примечание длиннее 500 символов';
                    return Promise.reject(e);
                }
                return Promise.resolve({});
            }
        });
        await seedPhonebook(t);
        t.sandbox.pbSyncEnqueueNote(ID_A, 'слишком длинное');
        t.sandbox.pbSyncEnqueueNote(ID_B, 'нормальное');
        t.sandbox.pbSyncFlush();
        await ticks(4);
        const q = readJson(t, QUEUE_KEY);
        assertEqual(q.length, 1, 'осталась только жизнеспособная операция');
        assertEqual(q[0].id, ID_B, 'это ID_B');
        assertEqual(t.calls.toasts.length, 1, 'пользователь предупреждён тостом');
    });

    test('пустая очередь — сервер не дёргается', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        t.sandbox.pbSyncFlush();
        await ticks(2);
        assertEqual(t.calls.api.length, 0, 'вызовов нет');
    });
});

// ============================================================
// E. VM — pbSyncStart (pull + merge + flush)
// ============================================================
describe('Task 538 — VM: получение данных (pull)', () => {

    test('happy path: серверные данные подняты, локальные отправлены', async () => {
        const t = makeVm({
            apiImpl: function(action, payload) {
                if (action === 'phonebook.getMyData') {
                    return Promise.resolve({ srvVer: '537',
                        favorites: { [ID_C]: true }, notes: { [ID_C]: 'из архива' } });
                }
                return Promise.resolve({});
            }
        });
        await seedPhonebook(t);
        seedLocal(t, { [ID_A]: true }, {});
        t.sandbox.pbSyncStart();
        await ticks(5);
        assertEqual(t.calls.api[0].action, 'phonebook.getMyData', 'сначала pull');
        assertEqual(t.calls.api[0].payload.token, 'tok-1', 'токен приложен');
        assertDeepEqual(readJson(t, FAV_KEY), { [ID_A]: true, [ID_C]: true }, 'объединение');
        assertDeepEqual(readJson(t, NOTES_KEY), { [ID_C]: 'из архива' }, 'серверное примечание');
        assertEqual(readJson(t, QUEUE_KEY).length, 0, 'локальная новинка отправлена');
        assertEqual(t.calls.api.length, 2, 'pull + один push');
        assertEqual(t.calls.api[1].action, 'phonebook.setFavorite', 'push избранного');
        const base = readJson(t, BASE_KEY);
        assertDeepEqual(base.favorites, { [ID_A]: true, [ID_C]: true }, 'base после полного цикла');
        assertEqual(t.sandbox.pbSyncGetState().mode, 'ok', 'режим ok');
    });

    test('сервер недоступен: локальные данные нетронуты', async () => {
        const t = makeVm({
            apiImpl: function() {
                return Promise.reject(new Error('NETWORK_ERROR: HTTP 500'));
            }
        });
        await seedPhonebook(t);
        seedLocal(t, { [ID_A]: true }, {});
        t.sandbox.pbSyncStart();
        await ticks(4);
        assertDeepEqual(readJson(t, FAV_KEY), { [ID_A]: true }, 'локальное не тронуто');
        assertEqual(t.sandbox.pbSyncGetState().mode, 'error', 'режим error (очередь пуста)');
    });

    test('Unknown action при pull: старый сервер, локальный режим', async () => {
        const t = makeVm({
            apiImpl: function() {
                return Promise.reject(new Error('Unknown action: phonebook.getMyData'));
            }
        });
        await seedPhonebook(t);
        t.sandbox.pbSyncStart();
        await ticks(4);
        assertEqual(t.sandbox.pbSyncGetState().oldServer, true, 'флаг старого сервера');
        assertEqual(t.sandbox.pbSyncGetState().mode, 'off', 'режим off');
    });

    test('no_session при pull: режим off', async () => {
        const t = makeVm({
            apiImpl: function() {
                return Promise.reject(new Error('session_expired'));
            }
        });
        await seedPhonebook(t);
        t.sandbox.pbSyncStart();
        await ticks(4);
        assertEqual(t.sandbox.pbSyncGetState().mode, 'off', 'режим off');
    });
});

// ============================================================
// F. VM — очистка устаревших записей
// ============================================================
describe('Task 538 — VM: очистка устаревших + сервер', () => {

    test('устаревшие синхронизированные записи удаляются и на сервере', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedBase(t, { [ID_STALE]: true, [ID_A]: true }, { [ID_STALE]: 'старое' });
        seedLocal(t, { [ID_STALE]: true, [ID_A]: true }, { [ID_STALE]: 'старое' });
        const res = t.sandbox.pbCleanupStaleFavorites();
        assertEqual(res.fav, 1, 'удалено одно избранное');
        assertEqual(res.notes, 1, 'удалено одно примечание');
        assertDeepEqual(res.favIds, [ID_STALE], 'id возвращён списком');
        assertDeepEqual(readJson(t, FAV_KEY), { [ID_A]: true }, 'валидное цело');
        const q = readJson(t, QUEUE_KEY);
        assertEqual(q.length, 2, 'устаревшее уходит на сервер (фав + примечание)');
        assertEqual(q[0].kind, 'fav', 'первое — избранное');
        assertEqual(q[0].id, ID_STALE, 'id');
        assertEqual(q[0].on, false, 'on=false');
        assertEqual(q[1].kind, 'note', 'второе — примечание');
        assertEqual(q[1].text, '', 'пустой текст = удаление');
    });

    test('локальный мусор БЕЗ синхронизации — сервер не дёргается', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        seedLocal(t, { [ID_STALE]: true }, {});
        const res = t.sandbox.pbCleanupStaleFavorites();
        assertEqual(res.fav, 1, 'локально убрано');
        assertDeepEqual(readJson(t, FAV_KEY), {}, 'чисто');
        assertEqual((readJson(t, QUEUE_KEY) || []).length, 0,
            'в base его не было — на сервер не шлём');
    });
});

// ============================================================
// G. VM — доступность, бейдж, тап-детализация
// ============================================================
describe('Task 538 — VM: доступность и бейдж', () => {

    test('без входа (нет токена) — синхронизация недоступна', async () => {
        const t = makeVm({ token: '' });
        await seedPhonebook(t);
        assertFalse(t.sandbox.pbSyncAvailable(), 'доступа нет');
        assertTrue(t.sandbox.pbSyncGetState().reason.indexOf('Войдите') !== -1,
            'подсказка про вход');
    });

    test('без права на раздел — недоступно, fail-closed', async () => {
        const t = makeVm({ canAccess: false });
        await seedPhonebook(t);
        assertFalse(t.sandbox.pbSyncAvailable(), 'доступа нет');
        assertTrue(t.sandbox.pbSyncGetState().reason.indexOf('прав') !== -1,
            'подсказка про право');
    });

    test('Task 540: тихая синхронизация — режимы в pbSyncState, очередь в pending', async () => {
        const t = makeVm();
        await seedPhonebook(t);
        t.sandbox.pbSyncSetMode('busy');
        assertEqual('busy', t.sandbox.pbSyncGetState().mode, 'режим busy');
        t.sandbox.pbSyncSetMode('ok');
        assertEqual('ok', t.sandbox.pbSyncGetState().mode, 'режим ok');
        // pending перекрывает ok: очередь не пуста — счётчик в состоянии
        t.sandbox.pbSyncEnqueueFav(ID_A, true);
        assertEqual(1, t.sandbox.pbSyncGetState().pending, 'pending = 1 при очереди из 1');
        t.sandbox.pbSyncEnqueueFav(ID_A, false);
        assertEqual(1, t.sandbox.pbSyncGetState().pending, 'коалесценция — очередь из 1');
    });

    test('online: возвращение сети планирует ретрай очереди', async () => {
        const t = makeVm({
            apiImpl: function() {
                return Promise.reject(new Error('NETWORK_ERROR: Failed to fetch'));
            }
        });
        await seedPhonebook(t);
        t.sandbox.pbSyncEnqueueFav(ID_A, true);        // дебаунс-таймер запланирован
        // Прожечь дебаунс (1.5с «прошли»): сброс таймера + неудачный
        // push — очередь остаётся ждать сети
        t.calls.timers.splice(0).forEach(function(fn) { fn(); });
        await ticks(2);
        assertEqual(readJson(t, QUEUE_KEY).length, 1, 'очередь сохранилась после сбоя');
        assertEqual(t.sandbox.pbSyncGetState().mode, 'pending', 'режим pending');
        // Сеть вернулась — ретрай запланирован
        assertEqual(t.calls.timers.length, 0, 'новых таймеров нет');
        t.calls.online();
        assertEqual(t.calls.timers.length, 1, 'ретрай запланирован');
    });
});
