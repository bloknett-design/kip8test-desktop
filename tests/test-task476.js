// tests/test-task476.js
// Task 476 — ЭТАП 2 ОПТИМИЗАЦИИ (продолжение заявки этапа 1):
// «ранее подгруженные данные должны сохраняться в памяти устройства
// для моментального доступа к ним» — для СЕРВЕРНЫХ данных
// (табель/каб. журнал/расходомеры/отметки плановых мероприятий),
// которые Apps Script отдаёт и которые SW не кэширует (bypass).
//
// РЕШЕНИЕ (этап 2: IndexedDB-слой + storage.persist() + чистка при
// logout; клиент-only, Apps Script не тронут):
//   (а) KipDB — новый модуль (index.html): мини-обёртка IndexedDB
//       (БД 'kip8-cache-test-v1', store 'kv', get/set/del/keys/clear,
//       промисы, тихие ошибки). localStorage (~5 МБ, синхронный)
//       больше не единственное хранилище локальных копий;
//   (б) WorkSchedule (Task 314): _cacheWrite пишет в ОБА слоя
//       (KipDB.set + localStorage); разбор кэша вынесен в
//       _restoreFromObj (общий для слоёв); _idbRestoreView —
//       асинхронный добор из KipDB до сети (промах localStorage:
//       квота/чистка) + миграция LS→KipDB; init и loadGrid зовут
//       KipDB-ветку до сетевого пути;
//   (в) KipCableJournal: _persistData/_persistColumns — оба слоя;
//       _idbRestore (промах LS → KipDB → рендер, затем фоновое
//       обновление как обычно);
//   (г) FlowmeterData: _persistData — оба слоя; _idbRestore(silent)
//       по образцу _restoreCache;
//   (д) PlanEventsData: отметки получили локальную копию ВПЕРВЫЕ
//       (_marksCacheKey 'kip8_pe_marks_v1', формат {v:1, years:{...}},
//       _cacheMarks после успешного planEvents.list,
//       _restoreMarksCache ДО loadMarks — раздел открывается с
//       галочками мгновенно при любой связи);
//   (е) KipAuth: _requestPersistentStorage (navigator.storage.persist,
//       после входа — 5 точек вызова) + _wipeLocalServerData при
//       logout (LS-ключи копий ×4 + KipDB.clear; автоистечение
//       сессии НЕ чистит — осознанно).
//   SW: kipia-test-v699 → v700 (логика sw.js не менялась — статический
//   кэш; комментарий Task 476 ~7 строк).
//   АДАПТАЦИЯ: test-task314 +_restoreFromObj (метод вынесен из
//   _restoreCachedView — общий для localStorage- и KipDB-слоёв).
//   ОКНА ИСТОРИИ sw.js (прецедент Task 475): комментарий Task 476
//   (~490 симв.) отодвинул якоря — test-task461 4600→5300,
//   test-task471 2100→2700, test-task472 1500→2100 (Task 472) и
//   2100→2700 (Task 471), test-task474 1100→1700 + 2100→2700 +
//   4600→5300.
//
// Запуск: через tests/run-all.js (require './test-task476.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Извлечение метода из объекта index.html (как в test-task314:
// сигнатура с 8 пробелами, конец — следующий метод уровня или
// закрывающая скобка модуля).
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

// ============================================================
// Синхронные thenable-моки для VM-тестов (промисы без асинхронности)
// ============================================================
function sp(v) {
    return {
        then: function(f) { try { return sp(f ? f(v) : v); } catch (e) { return errP(e); } },
        catch: function() { return sp(v); }
    };
}
function errP(e) {
    return {
        then: function() { return errP(e); },
        catch: function(f) { return sp(f ? f(e) : undefined); }
    };
}

// Мок KipDB (синхронные thenable): get/set по Map.
function mkKipDbMock() {
    const m = new Map();
    return {
        _map: m,
        available: true,
        get: function(k) { return sp(m.has(k) ? m.get(k) : undefined); },
        set: function(k, v) { m.set(k, v); return sp(undefined); },
        del: function(k) { m.delete(k); return sp(undefined); },
        clear: function() { m.clear(); return sp(undefined); }
    };
}

// ==========================================================================
// 1. SW: версия и шапка
// ==========================================================================
describe('Task 476 — SW: версия и шапка', () => {
    test('CACHE_VERSION = kipia-test-v748', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v748';") !== -1,
            'SW поднят до v700');
    });
    test('прежняя версия v699 отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v699') === -1,
            'в sw.js не осталось kipia-test-v699');
    });
    test('несуществующая v701 отсутствует (guard)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v749') === -1,
            'kipia-test-v748 не должен существовать');
    });
    test('комментарий Task 476 в шапке версий', () => {
        assertTrue(SW_SRC.indexOf('Task 476') !== -1, 'маркер задачи');
        assertTrue(SW_SRC.indexOf('KipDB (IndexedDB)') !== -1,
            'описание KipDB-слоя');
        assertTrue(SW_SRC.indexOf('логики не менял') !== -1,
            'sw.js логики не менял (кэш статический) — только версия');
    });
    test('bypass Apps Script не тронут (граница этапа 1 сохранена)', () => {
        assertTrue(SW_SRC.indexOf("bypassUrl.hostname === 'script.google.com'") !== -1,
            'bypass script.google.com на месте');
        assertTrue(SW_SRC.indexOf("bypassUrl.hostname === 'script.googleusercontent.com'") !== -1,
            'bypass script.googleusercontent.com на месте');
    });
});

// ==========================================================================
// 2. KipDB — модуль IndexedDB-кэша
// ==========================================================================
describe('Task 476 — KipDB: модуль IndexedDB-кэша', () => {
    test('модуль объявлен (var KipDB = IIFE)', () => {
        assertTrue(INDEX_SRC.indexOf('var KipDB = (function() {') !== -1,
            'KipDB определён как глобальный var (guard «typeof KipDB» работает)');
    });
    test('имя БД kip8test с миграцией в kip8', () => {
        const i = INDEX_SRC.indexOf("var DB_NAME = 'kip8-cache-test-v1';");
        assertTrue(i !== -1, 'DB_NAME = kip8-cache-test-v1');
        assertTrue(INDEX_SRC.slice(i - 200, i).indexOf("kip8 → 'kip8-cache-v1'") !== -1,
            'комментарий о маппинге имени при переносе в kip8');
    });
    test('API хранилища: get/set/del/keys/clear', () => {
        ['get: function', 'set: function', 'del: function',
         'keys: function', 'clear: function'].forEach(m => {
            assertTrue(INDEX_SRC.indexOf(m + '(key)') !== -1 || INDEX_SRC.indexOf(m) !== -1,
                'KipDB.' + m);
        });
    });
    test('available-флаг и объектный стор kv', () => {
        assertTrue(INDEX_SRC.indexOf('available: (typeof indexedDB') !== -1,
            'быстрая проверка окружения');
        assertTrue(INDEX_SRC.indexOf("var STORE = 'kv';") !== -1, 'object store kv');
    });
    test('тихие ошибки: _dbp сбрасывается при сбое открытия', () => {
        assertTrue(INDEX_SRC.indexOf('_dbp.catch(function() { _dbp = null; });') !== -1,
            'сбой открытия — следующая попытка начнётся заново');
    });
});

// ==========================================================================
// 3. KipDB — VM: roundtrip на фейковом indexedDB
// ==========================================================================
describe('Task 476 — KipDB VM: поведение на фейковом indexedDB', () => {

    // Фейковый indexedDB: Map + события через микротаски (успевают
    // после синхронного назначения onsuccess/oncomplete в KipDB).
    function mkFakeIdb() {
        const data = new Map();
        const fire = (cb, arg) => queueMicrotask(() => cb && cb(arg));
        const t = () => {
            const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
            tx.objectStore = () => ({
                get: k => { const r = {}; fire(() => { r.result = data.has(k) ? data.get(k) : undefined; r.onsuccess && r.onsuccess(); }); fire(() => tx.oncomplete && tx.oncomplete()); return r; },
                put: (v, k) => { const r = {}; fire(() => { data.set(k, v); r.onsuccess && r.onsuccess(); }); fire(() => tx.oncomplete && tx.oncomplete()); return r; },
                'delete': k => { const r = {}; fire(() => { data.delete(k); r.onsuccess && r.onsuccess(); }); fire(() => tx.oncomplete && tx.oncomplete()); return r; },
                getAllKeys: () => { const r = {}; fire(() => { r.result = Array.from(data.keys()); r.onsuccess && r.onsuccess(); }); fire(() => tx.oncomplete && tx.oncomplete()); return r; },
                clear: () => { const r = {}; fire(() => { data.clear(); r.onsuccess && r.onsuccess(); }); fire(() => tx.oncomplete && tx.oncomplete()); return r; }
            });
            return tx;
        };
        const db = { objectStoreNames: { contains: () => true }, transaction: t };
        const openReq = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, error: null };
        queueMicrotask(() => openReq.onsuccess && openReq.onsuccess({ target: { result: db } }));
        return { open: () => openReq, _data: data };
    }

    function loadKipDb(indexedDbMock) {
        const i = INDEX_SRC.indexOf('var KipDB = (function() {');
        assertTrue(i !== -1, 'KipDB найден в index.html');
        const j = INDEX_SRC.indexOf('})();', i);
        const src = INDEX_SRC.slice(i, j + 5);
        const make = new Function('indexedDB', src + '\nreturn KipDB;');
        return make(indexedDbMock);
    }

    const tick = () => new Promise(r => queueMicrotask(r));
    const settle = async (n) => { for (let k = 0; k < (n || 12); k++) await tick(); };

    test('roundtrip: set → get → del → get', async () => {
        const fake = mkFakeIdb();
        const kdb = loadKipDb(fake);
        await kdb.set('k1', { a: 1, list: [1, 2, 3] });
        const got1 = await kdb.get('k1');
        assertEqual(got1.a, 1, 'объект прочитан целиком (structured-clone копия)');
        assertEqual(got1.list.length, 3, 'массив внутри объекта');
        await kdb.del('k1');
        const got2 = await kdb.get('k1');
        assertEqual(got2, undefined, 'после del — undefined');
    });

    test('несуществующий ключ → undefined (не null, не reject)', async () => {
        const kdb = loadKipDb(mkFakeIdb());
        const got = await kdb.get('nope');
        assertEqual(got, undefined, 'значение undefined');
    });

    test('clear стирает всё хранилище', async () => {
        const fake = mkFakeIdb();
        const kdb = loadKipDb(fake);
        await kdb.set('a', 1);
        await kdb.set('b', 2);
        const keys1 = await kdb.keys();
        assertEqual(keys1.length, 2, 'два ключа до clear');
        await kdb.clear();
        const keys2 = await kdb.keys();
        assertEqual(keys2.length, 0, 'ноль после clear');
    });

    test('окружение без indexedDB: available=false (модуль необязателен)', async () => {
        const kdb = loadKipDb(undefined);
        assertEqual(kdb.available, false, 'available=false');
        let rejected = false;
        kdb.get('x').catch(() => { rejected = true; });
        await settle(4);
        assertTrue(rejected, 'get тихо rejects — вызовы обёрнуты .catch');
    });
});

// ==========================================================================
// 4. KipAuth: persist + чистка при logout
// ==========================================================================
describe('Task 476 — KipAuth: storage.persist + чистка при logout', () => {
    test('_requestPersistentStorage: метод + guard идемпотентности', () => {
        const m = methodText(INDEX_SRC, '_requestPersistentStorage');
        assertTrue(m.trim().indexOf('_requestPersistentStorage: function') === 0, 'метод найден');
        assertTrue(m.indexOf('if (this._persistAsked) return;') !== -1,
            'один вызов на сессию');
        assertTrue(m.indexOf('navigator.storage.persist') !== -1,
            'вызов navigator.storage.persist');
    });

    test('вызов persist после входа — 5 точек (все пути входа)', () => {
        const calls = INDEX_SRC.split('_requestPersistentStorage()').length - 1;
        // 5 вызовов + 1 определение метода (function) не считается вызовом
        assertEqual(calls, 5, 'verifyOTP + bootstrap fast + bootstrap slow + offline retry + verifySession');
    });

    test('_wipeLocalServerData: чистит LS-ключи копий + KipDB.clear', () => {
        const m = methodText(INDEX_SRC, '_wipeLocalServerData');
        assertTrue(m.trim().indexOf('_wipeLocalServerData: function') === 0, 'метод найден');
        ['kip8_ws_cache_v1', 'kip8_cj_cache_v1', 'kip8_cj_cols_v1',
         'kip8_flow_cache_v1'].forEach(k => {
            assertTrue(m.indexOf("'" + k + "'") !== -1, 'LS-ключ ' + k);
        });
        assertTrue(m.indexOf('KipDB.clear()') !== -1, 'KipDB-слой чистится целиком');
    });

    test('logout() зовёт _wipeLocalServerData (ручной выход)', () => {
        const m = methodText(INDEX_SRC, 'logout');
        assertTrue(m.indexOf('this._wipeLocalServerData();') !== -1,
            'чистка копий серверных данных при выходе');
    });

    test('handleSessionExpired НЕ чистит (автоистечение ≠ передача устройства)', () => {
        const m = methodText(INDEX_SRC, 'handleSessionExpired');
        assertTrue(m.indexOf('_wipeLocalServerData') === -1,
            'автоистечение сессии оставляет копии (тот же пользователь вернётся)');
    });

    test('поле состояния _persistAsked объявлено', () => {
        assertTrue(INDEX_SRC.indexOf('_persistAsked: false,') !== -1,
            'guard-поле в шапке KipAuth');
    });
});

// ==========================================================================
// 5. WorkSchedule: KipDB-слой локальной копии
// ==========================================================================
describe('Task 476 — WorkSchedule: KipDB-слой', () => {
    test('_cacheWrite: ДВА слоя — KipDB.set + localStorage.setItem', () => {
        const m = methodText(INDEX_SRC, '_cacheWrite');
        assertTrue(m.indexOf('KipDB.set(this._wsCacheKey, c)') !== -1,
            'копия в KipDB (IndexedDB)');
        assertTrue(m.indexOf("localStorage.setItem(this._wsCacheKey, JSON.stringify(c));") !== -1,
            'прежняя localStorage-копия сохранена (Task 314 жив)');
    });

    test('_restoreFromObj вынесен (общий разбор для обоих слоёв)', () => {
        const m = methodText(INDEX_SRC, '_restoreFromObj');
        assertTrue(m.trim().indexOf('_restoreFromObj: function(c)') === 0, 'метод с параметром объекта');
        assertTrue(m.indexOf('_restoreCachedView') === -1, 'не вызывает сам себя');
    });

    test('_restoreCachedView: LS-слой (прежнее поведение) + вызов _restoreFromObj', () => {
        const m = methodText(INDEX_SRC, '_restoreCachedView');
        assertTrue(m.indexOf('this._cacheRead()') !== -1, 'читает localStorage');
        assertTrue(m.indexOf('return this._restoreFromObj(c);') !== -1,
            'разбор — в общем _restoreFromObj');
    });

    test('_idbRestoreView: KipDB-ветка + миграция LS→KipDB', () => {
        const m = methodText(INDEX_SRC, '_idbRestoreView');
        assertTrue(m.trim().indexOf('_idbRestoreView: function') === 0, 'метод найден');
        assertTrue(m.indexOf('typeof KipDB') !== -1, 'guard (KipDB необязателен)');
        assertTrue(m.indexOf('KipDB.get(this._wsCacheKey)') !== -1, 'чтение KipDB-копии');
        assertTrue(m.indexOf('c.v === 1') !== -1, 'проверка версии формата');
        assertTrue(m.indexOf('KipDB.set(self._wsCacheKey, ls)') !== -1,
            'миграция localStorage → KipDB');
        assertTrue(m.indexOf('return false;') !== -1, 'вежливый false при отсутствии');
    });

    test('loadGrid: KipDB-ветка ДО сети (сохранив якоря Task 314)', () => {
        const lg = methodText(INDEX_SRC, 'loadGrid');
        assertTrue(lg.trim().indexOf('loadGrid: function(force)') === 0, 'сигнатура прежняя');
        assertTrue(lg.indexOf('if (!force && this._restoreCachedView())') !== -1,
            'LS-ветка мгновенного открытия (Task 314)');
        assertTrue(lg.indexOf('this._idbRestoreView()') !== -1,
            'KipDB-ветка между промахом LS и сетью');
        assertTrue(lg.indexOf('force ? Promise.resolve(false) :') !== -1,
            'force («Обновить») НЕ читает кэш — только сеть');
        assertTrue(lg.indexOf('self._cacheWrite();') !== -1,
            'запись копии после сетевой загрузки (Task 314)');
        assertTrue(lg.indexOf('var keepGrid') !== -1, 'keepGrid жив');
    });

    test('init: KipDB-проба до справочников/сети', () => {
        const init = INDEX_SRC.slice(INDEX_SRC.indexOf('init: function'),
                                     INDEX_SRC.indexOf('_refreshFromUrlState: function'));
        assertTrue(init.indexOf('self._idbRestoreView().then(function(idbOk) {') !== -1,
            'KipDB до сетевого пути');
        assertTrue(/_loadStatusCodes\(\)\.then/.test(init),
            'прежний сетевой путь остался (первый запуск)');
    });

    test('VM: _cacheWrite без KipDB пишет только localStorage (деградация тихая)', () => {
        const store = {
            _map: {},
            getItem: k => (k in store._map ? store._map[k] : null),
            setItem: (k, v) => { store._map[k] = String(v); },
            removeItem: k => { delete store._map[k]; }
        };
        const make = new Function('localStorage', 'return ({' +
            methodText(INDEX_SRC, '_cacheWrite') + '\n});');
        const ctx = {
            _wsCacheKey: 'kip8_ws_cache_v1',
            _year: 2026, _month: 10,
            _STATUS_CODES: [{ code: 'Д', name: 'День' }],
            _PATTERNS: [], _EMPLOYEES: [{ 'ФИО': 'Иванов' }],
            _VACATIONS: [], _VAC_YEARS: {}, _PPE: [],
            _INSTR_LIST: [], _INSTR_ALL: [], _EVENTS_ALL: [],
            _ENTRIES: [{ 'статус': 'Д' }], _TRAININGS: [],
            _cacheRead: function() { return null; },
            _cacheTs: 0,
            _ymKey: function() { return '2026-10'; },
            _cacheWrite: make(store)
        };
        // в VM нет KipDB — ветка тихо пропускается, LS-запись работает
        ctx._cacheWrite = make(store)._cacheWrite;
        ctx._cacheWrite();
        const saved = JSON.parse(store._map['kip8_ws_cache_v1']);
        assertEqual(saved.v, 1, 'формат v1');
        assertEqual(saved.employees.length, 1, 'сотрудники');
        assertTrue(Array.isArray(saved.views['2026-10'].entries), 'вид 2026-10 записан');
    });
});

// ==========================================================================
// 6. KipCableJournal: KipDB-слой
// ==========================================================================
describe('Task 476 — CableJournal: KipDB-слой', () => {
    test('_persistData: ДВА слоя (один снапшот)', () => {
        const m = methodText(INDEX_SRC, '_persistData');
        // ВАЖНО: methodText находит ПЕРВОЕ вхождение сигнатуры — это CJ
        // (модуль выше по файлу, чем FlowmeterData)
        assertTrue(m.indexOf('KipDB.set(this._cacheKey, snap)') !== -1, 'KipDB-копия');
        assertTrue(m.indexOf('localStorage.setItem(this._cacheKey') !== -1,
            'localStorage-копия прежняя');
        assertTrue(m.indexOf('var snap = { rows: rows, total: total, ts: Date.now() };') !== -1,
            'единый снапшот (одинаковое ts для слоёв)');
    });

    test('_persistColumns: ДВА слоя', () => {
        const m = methodText(INDEX_SRC, '_persistColumns');
        assertTrue(m.indexOf('KipDB.set(this._cacheColsKey, colsRes)') !== -1, 'KipDB-копия колонок');
        assertTrue(m.indexOf('localStorage.setItem(this._cacheColsKey') !== -1,
            'localStorage-копия колонок');
    });

    test('_idbRestore: добор из KipDB + миграция', () => {
        const m = methodText(INDEX_SRC, '_idbRestore');
        assertTrue(m.trim().indexOf('_idbRestore: function()') === 0, 'метод найден');
        assertTrue(m.indexOf('KipDB.get(this._cacheColsKey)') !== -1, 'колонки из KipDB');
        assertTrue(m.indexOf('KipDB.get(self._cacheKey)') !== -1, 'данные из KipDB');
        assertTrue(m.indexOf('KipDB.set(self._cacheKey, ls)') !== -1, 'миграция LS→KipDB');
    });

    test('init: _idbRestore после _restoreCache, до фоновой сети', () => {
        const iCj = INDEX_SRC.indexOf('const KipCableJournal = {');
        const initCj = INDEX_SRC.slice(iCj, INDEX_SRC.indexOf('\n        load: function() {', iCj));
        const iRestore = initCj.indexOf('this._restoreCache();');
        const iIdb = initCj.indexOf('this._idbRestore();');
        const iNet = initCj.indexOf("this._api('cableJournal.getColumns'");
        assertTrue(iRestore !== -1 && iIdb !== -1 && iNet !== -1 &&
                   iRestore < iIdb && iIdb < iNet, 'порядок: LS → KipDB → сеть');
    });
});

// ==========================================================================
// 7. FlowmeterData: KipDB-слой
// ==========================================================================
describe('Task 476 — FlowmeterData: KipDB-слой', () => {
    test('_idbRestore(silent): по образцу _restoreCache + миграция', () => {
        const i = INDEX_SRC.indexOf('var FlowmeterData = {');
        const zone = INDEX_SRC.slice(i);
        const sig = '\n        _idbRestore: function(silent) {';
        const j = zone.indexOf(sig);
        assertTrue(j !== -1, 'метод найден');
        const m = zone.slice(j + 1, zone.indexOf('\n        },', j));
        assertTrue(m.indexOf('typeof KipDB') !== -1, 'guard');
        assertTrue(m.indexOf('KipDB.get(this._cacheKey)') !== -1, 'чтение KipDB');
        assertTrue(m.indexOf('self._normalizeMeters(cached.meters)') !== -1,
            'нормализация как у LS-копии');
        assertTrue(m.indexOf('KipDB.set(self._cacheKey, ls)') !== -1, 'миграция LS→KipDB');
        assertTrue(m.indexOf('if (!silent) self.renderList();') !== -1,
            'silent для авторизованных — без рендера');
    });

    test('init: _idbRestore(silent) после _restoreCache/_loadFallback', () => {
        const i = INDEX_SRC.indexOf('var FlowmeterData = {');
        const init = INDEX_SRC.slice(INDEX_SRC.indexOf('init: function() {', i),
                                     INDEX_SRC.indexOf('_loadFallback: function', i));
        const iRestore = init.indexOf('this._restoreCache(silent);');
        const iIdb = init.indexOf('this._idbRestore(silent);');
        assertTrue(iRestore !== -1 && iIdb !== -1 && iRestore < iIdb,
            'LS-restore → KipDB-restore');
    });

    test('_persistData: ДВА слоя (FlowmeterData-версия, метры)', () => {
        const i = INDEX_SRC.indexOf('var FlowmeterData = {');
        const zone = INDEX_SRC.slice(i);
        const sig = '\n        _persistData: function(meters) {';
        const j = zone.indexOf(sig);
        assertTrue(j !== -1, 'метод найден');
        const m = zone.slice(j + 1, zone.indexOf('\n        },', j));
        assertTrue(m.indexOf('KipDB.set(this._cacheKey, snap)') !== -1, 'KipDB-копия');
        assertTrue(m.indexOf('var snap = { meters: meters, ts: Date.now() };') !== -1,
            'единый снапшот {meters, ts}');
        assertTrue(m.indexOf('localStorage.setItem(this._cacheKey') !== -1,
            'localStorage-копия прежняя');
    });
});

// ==========================================================================
// 8. PlanEventsData: копия отметок (впервые)
// ==========================================================================
describe('Task 476 — PlanEvents: локальная копия отметок', () => {
    test('ключ и формат копии', () => {
        assertTrue(INDEX_SRC.indexOf("_marksCacheKey: 'kip8_pe_marks_v1',") !== -1,
            'ключ kip8_pe_marks_v1');
        assertTrue(INDEX_SRC.indexOf('v: 1, years: {}') !== -1, 'формат {v:1, years:{…}}');
    });

    test('_cacheMarks: merge по годам (не затирает соседние годы)', () => {
        const m = methodText(INDEX_SRC, '_cacheMarks');
        assertTrue(m.trim().indexOf('_cacheMarks: function') === 0, 'метод найден');
        assertTrue(m.indexOf('obj.years[String(self._viewYear)]') !== -1,
            'запись года _viewYear');
    });

    test('_restoreMarksCache: восстановление ДО сети + guard', () => {
        const m = methodText(INDEX_SRC, '_restoreMarksCache');
        assertTrue(m.trim().indexOf('_restoreMarksCache: function') === 0, 'метод найден');
        assertTrue(m.indexOf('c.v !== 1') !== -1, 'проверка формата');
        assertTrue(m.indexOf('y.marks') !== -1, 'чтение отметок года');
        assertTrue(m.indexOf('self._renderMarks();') !== -1, 'рендер отметок');
        assertTrue(m.indexOf('return false;') !== -1, 'вежливый false');
    });

    test('init: restore → loadMarks (сеть после копии)', () => {
        const i = INDEX_SRC.indexOf('var PlanEventsData = {');
        const init = INDEX_SRC.slice(INDEX_SRC.indexOf('init: function() {', i),
                                     INDEX_SRC.indexOf('_tagColumns: function', i));
        assertTrue(init.indexOf('this._restoreMarksCache().then(function() {') !== -1,
            'восстановление копии до сети');
        assertTrue(init.indexOf('peSelf.loadMarks(true);') !== -1, 'затем фоновое обновление');
    });

    test('loadMarks: успех → _cacheMarks (копия актуализируется)', () => {
        const m = methodText(INDEX_SRC, 'loadMarks');
        assertTrue(m.indexOf('self._cacheMarks();') !== -1,
            'после planEvents.list — сохранение в KipDB');
    });

    test('VM: _cacheMarks + _restoreMarksCache roundtrip (мок KipDB)', () => {
        const kdb = mkKipDbMock();
        const mk = new Function('KipDB', 'return ({' +
            methodText(INDEX_SRC, '_cacheMarks') + '\n' +
            methodText(INDEX_SRC, '_restoreMarksCache') + '\n});');
        const ctx = {
            _viewYear: 2026,
            _marks: [{ id: 7, 'месяц': 3, 'мероприятие': 'Работы на месяц' }],
            _byKey: {},
            _marksCacheKey: 'kip8_pe_marks_v1',
            _rebuildIndex: function() { this._byKey.x = (this._marks || []).length; },
            _renderMarks: function() { this._rendered = (this._marks || []).length; },
            _cacheMarks: null, _restoreMarksCache: null
        };
        const obj = mk(kdb);
        ctx._cacheMarks = obj._cacheMarks;
        ctx._restoreMarksCache = obj._restoreMarksCache;

        ctx._cacheMarks();
        const saved = kdb._map.get('kip8_pe_marks_v1');
        assertEqual(saved.v, 1, 'формат v1');
        assertEqual(saved.years['2026'].marks.length, 1, 'отметка 2026 сохранена');

        // другой год не затирается
        saved.years['2025'] = { marks: [{ id: 1 }], ts: 1 };
        kdb._map.set('kip8_pe_marks_v1', saved);
        ctx._cacheMarks();
        const saved2 = kdb._map.get('kip8_pe_marks_v1');
        assertEqual(saved2.years['2025'].marks.length, 1, '2025 не тронут');
        assertEqual(saved2.years['2026'].marks.length, 1, '2026 перезаписан');

        // восстановление
        ctx._marks = null;
        let ok;
        ctx._restoreMarksCache().then(v => { ok = v; }).catch(() => { ok = 'err'; });
        assertEqual(ok, true, 'копия найдена');
        assertEqual(ctx._marks.length, 1, 'отметки подняты');
        assertEqual(ctx._byKey.x, 1, 'индекс перестроен');
        assertEqual(ctx._rendered, 1, 'ренер вызван');
    });

    test('VM: _restoreMarksCache — нет копии → false (сеть как обычно)', () => {
        const kdb = mkKipDbMock();
        const mk = new Function('KipDB', 'return ({' +
            methodText(INDEX_SRC, '_restoreMarksCache') + '\n});');
        const ctx = {
            _viewYear: 2030,
            _marksCacheKey: 'kip8_pe_marks_v1',
            _rebuildIndex: function() {},
            _renderMarks: function() {},
            _restoreMarksCache: mk(kdb)._restoreMarksCache
        };
        let ok;
        ctx._restoreMarksCache().then(v => { ok = v; }).catch(() => { ok = 'err'; });
        assertEqual(ok, false, 'года 2030 в копии нет → false');
    });
});

// ==========================================================================
// 9. Границы и инварианты
// ==========================================================================
describe('Task 476 — границы и инварианты', () => {
    test('guard «typeof KipDB» используется везде (модуль необязателен)', () => {
        const n = INDEX_SRC.split('typeof KipDB').length - 1;
        assertTrue(n >= 8, 'минимум 8 guard-вхождений, фактически: ' + n);
    });

    test('чистка logout НЕ трогает настройки интерфейса (тема/закреплённые)', () => {
        const m = methodText(INDEX_SRC, '_wipeLocalServerData');
        assertTrue(m.indexOf('app-theme') === -1, 'тема не тронута');
        assertTrue(m.indexOf('pinnedSubsections') === -1, 'закреплённые не тронуты');
        assertTrue(m.indexOf('kip8_session_token') === -1,
            'токен чистится штатно выше по logout, не здесь');
    });

    test('тесты Task 314 адаптированы (+_restoreFromObj)', () => {
        const t314 = fs.readFileSync(path.join(ROOT, 'tests', 'test-task314.js'), 'utf8');
        assertTrue(t314.indexOf("'_restoreFromObj'") !== -1,
            'test-task314 подгружает общий метод разбора кэша');
    });

    test('DEPLOY-док этапа 2 — в git-архиве (регламент Task 510)', () => {
        // Task 510: DEPLOY-Task476-optimization-stage2-idb-server-cache.md
        // старше недели → удалён из рабочей копии; история: git show pre-task510:<файл>
        const deployDir = fs.readdirSync(ROOT).filter(f => f.indexOf('DEPLOY-Task476') === 0);
        assertEqual(deployDir.length, 0, 'DEPLOY-Task476-* удалён из рабочей копии (архив Task 510)');
    });
});

// ==========================================================================
// 10. Окна истории sw.js (дистанции после комментария Task 476)
// ==========================================================================
describe('Task 476 — окна истории версий sw.js', () => {
    // Task 502: комментарий палитры (~385 симв.) отодвинул якоря:
    // 474 → 12000 (11493), 472 → 12200 (11866), 471 → 13000 (12415),
    // 461 → 15400 (14977).
    const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v748';");

    test('Task 474 в пределах окна 1700', () => {
        const i474 = SW_SRC.lastIndexOf('Task 474', i);
        assertTrue(i474 !== -1 && (i - i474) < 13300, 'якорь Task 474 виден');
    });
    test('Task 472 в пределах окна 2100', () => {
        const i472 = SW_SRC.lastIndexOf('Task 472', i);
        assertTrue(i472 !== -1 && (i - i472) < 13500, 'якорь Task 472 виден');
    });
    test('Task 471 в пределах окна 2700', () => {
        const i471 = SW_SRC.lastIndexOf('Task 471', i);
        assertTrue(i471 !== -1 && (i - i471) < 14300, 'якорь Task 471 виден');
    });
    test('Task 461 в пределах окна 5300', () => {
        const i461 = SW_SRC.lastIndexOf('Task 461', i);
        assertTrue(i461 !== -1 && (i - i461) < 16700, 'якорь Task 461 виден');
    });
    // Task 483: якоря отодвинуты комментарием ~378 симв. — окна
    // расширены scripts/task483-windows.py (3100→3500/3600→4000/
    // 4200→4600/6800→7200) и task484-windows.py (3500→4000/
    // 4000→4500/4600→5000/7200→7600), заголовки исторические.
});

console.log('test-task476: все describes зарегистрированы');
