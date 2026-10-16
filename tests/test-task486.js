// tests/test-task486.js
// Task 486 — заявка пользователя: «В разделе "Табель учёта
// рабочего времени", помимо ручного обновления, сделай тихое
// обновление данных при открытии приложения».
//
// РЕШЕНИЕ (клиент-only, Apps Script не тронут):
//   (а) WorkSchedule.silentRefresh() — новый метод: те же 7
//       read-only экшенов, что «Обновить»/KipPreload._preloadWs;
//       свежие данные — в ОБА слоя локальной копии Task 314
//       (localStorage + KipDB, merge v1, лимит 12 видов);
//       открытый раздел тихо перерисовывается (_restoreFromObj +
//       _renderGrid, сброс _YEAR_DATA/_VAC_YEARS как loadGrid(true))
//       — НО не посреди ручного «Обновить» (_refreshing) и не с
//       открытым попапом ячейки (#wsCellPopup.active); _PENDING —
//       слой поверх записей, НЕ затирается (семантика «Обновить»);
//       fetched-вид != открытому — пишется только копия;
//       троттлинг 5 минут (_silentTs; пустая копия после logout —
//       обновление и внутри окна); _silentBusy — защита от
//       параллельного запуска; сбой — ТИХИЙ (console.warn, без
//       тоста/экрана — по заявке «тихое»);
//   (б) KipAuth._schedulePreload (ВСЕ 5 путей старта: вход OTP,
//       быстрый/медленный bootstrap, возврат связи, фоновая
//       проверка сессии) — тем же таймером 4 с после показа UI
//       зовёт silentRefresh; права — canAccess('work-schedule');
//   (в) _wipeLocalServerData (logout): сброс _silentTs — после
//       чистки копий повторный вход качает обязательно;
//   (г) KipPreload._preloadWs: свежая _silentTs или идущее
//       _silentBusy — пропускает свой ws-элемент (дубль сети не
//       нужен; тихий сбой silentRefresh — метка не ставилась —
//       _preloadWs остаётся ретраем-фолбэком, Task 477).
//   SW: kipia-test-v749 (логика SW НЕ менялась; кэши не тронуты).
//
// АДАПТАЦИИ под Task 486 (модуль WorkSchedule вырос на ~8.7КБ):
//   test-task337/338/341/342/343/360/361/362 — WS_CLIENT срез
//   500000 → 600000 (onCellClick уехал: 496815+8714=505529);
//   test-task477 — срез _schedulePreload 700 → 1700 (литерал
//   4000 отодвинут вставкой хука на ~1505);
//   окна истории sw.js расширены scripts/task486-windows.py
//   (483/484 1500→2100; 480 2600→3200; 481 2500/2600/3200 →
//   3200/3200/4100; 478/479 3200→4100; 473 5100→5600; 472
//   5300/5900→5900/6500; 471 5900→6500; 461 8500→9100; якоря
//   474/472/471/461 → 5300/5900/6500/9100; каскады 475/481/482
//   синхронизированы).
//
// Запуск: через tests/run-all.js (require './test-task486.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Извлечение метода из объекта index.html (сигнатура с 8 пробелами,
// конец — следующий метод уровня; включает хвостовые комментарии —
// для source-ассертов безвредно, для VM-запуска отрезаем по
// закрывающей скобке метода).
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

// ==========================================================================
// 1. SW: версия v710 + комментарий Task 486
// ==========================================================================
describe('Task 486: SW — версия и кэши', () => {
    test('CACHE_VERSION = kipia-test-v749', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v749';") !== -1,
            'версия поднята');
    });

    test('v709 в sw.js отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v709') === -1, 'старой версии нет');
    });

    test('v711 в sw.js отсутствует (лишний инкремент не сделан)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v750') === -1);
    });

    test('комментарий Task 486 в шапке версий (окно 1500)', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v749';");
        // Task 502: окно 6900 → 7300 (якорь 7061); синхро 481/482/484 — каскад.
        const ctx = SW_SRC.slice(Math.max(0, i - 8600), i);
        assertTrue(ctx.indexOf('Task 486') !== -1, 'маркер задачи');
        assertTrue(ctx.indexOf('ТИХОЕ обновление') !== -1, 'сущность заявки');
        assertTrue(ctx.indexOf('silentRefresh') !== -1, 'имя метода');
        assertTrue(ctx.indexOf('Табель') !== -1, 'раздел');
        assertTrue(ctx.indexOf('Логика SW не менялась') !== -1, 'логика не менялась');
    });

    test('персистентные кэши НЕ инкрементированы', () => {
        assertTrue(SW_SRC.indexOf('kipia-images-test-v3') !== -1, 'IMAGE_CACHE v3');
        assertTrue(SW_SRC.indexOf('kipia-data-test-v1') !== -1, 'DATA_CACHE v1');
    });
});

// ==========================================================================
// 2. WorkSchedule.silentRefresh — исходник
// ==========================================================================
describe('Task 486 — silentRefresh: структура (исходник)', () => {
    const M = methodText(INDEX_SRC, 'silentRefresh');

    test('метод объявлен в WorkSchedule (после refreshData)', () => {
        assertTrue(M.trim().indexOf('silentRefresh: function()') === 0,
            'сигнатура метода');
        const iRefresh = INDEX_SRC.indexOf('refreshData: function() {');
        const iSilent = INDEX_SRC.indexOf('silentRefresh: function() {');
        assertTrue(iRefresh !== -1 && iSilent > iRefresh,
            'метод рядом с refreshData (логическая связка)');
    });

    test('те же 7 read-only экшенов, что «Обновить»/_preloadWs', () => {
        ['workSchedule.getStatusCodes', 'workSchedule.getPatterns',
         'workSchedule.listEmployees', 'workSchedule.listTrainings',
         'workSchedule.listVacations', 'workSchedule.listPpe',
         'workSchedule.listEntries'].forEach(a => {
            assertTrue(M.indexOf(a) !== -1, 'экшен ' + a);
        });
        // записи месяца — с параметрами года/месяца (текущий вид)
        assertTrue(M.indexOf("listEntries', { year: year, month: month }") !== -1,
            'listEntries по году/месяцу fetched-вида');
    });

    test('пишет ОБА слоя копии (KipDB + localStorage)', () => {
        assertTrue(M.indexOf('KipDB.set(self._wsCacheKey, c)') !== -1,
            'KipDB-слой');
        assertTrue(M.indexOf("localStorage.setItem(self._wsCacheKey, JSON.stringify(c))") !== -1,
            'LS-слой (его читает _restoreCachedView при открытии)');
    });

    test('merge с существующей копией + лимит 12 видов', () => {
        assertTrue(M.indexOf('self._cacheRead()') !== -1,
            'чтение существующей копии');
        assertTrue(M.indexOf('c.v !== 1') !== -1, 'формат v1');
        assertTrue(M.indexOf('keys.length > 12') !== -1,
            'лимит 12 видов — как у _cacheWrite (квота LS)');
    });

    test('год/месяц — открытый вид или текущая дата', () => {
        assertTrue(M.indexOf('var year = this._year, month = this._month;') !== -1,
            'открытый вид раздела');
        assertTrue(M.indexOf('d.getFullYear()') !== -1 &&
                   M.indexOf('d.getMonth() + 1') !== -1,
            'фолбэк текущей даты (раздел не открывали)');
    });

    test('сотрудники сортируются как у раздела', () => {
        assertTrue(M.indexOf('self._sortEmployees(employees)') !== -1,
            '_sortEmployees (restore не пересортирует)');
    });

    test('троттлинг 5 минут + пустая копия после logout', () => {
        assertTrue(M.indexOf('5 * 60 * 1000') !== -1, 'окно 5 минут');
        assertTrue(M.indexOf('this._cacheRead()') !== -1,
            'пустая копия (logout) — обновление и внутри окна');
    });

    test('защита от параллельного запуска (_silentBusy)', () => {
        assertTrue(M.indexOf('if (this._silentBusy) return') !== -1,
            'входной гвард');
        assertTrue(M.indexOf('self._silentBusy = false;') !== -1,
            'сброс в финальном then (в т.ч. после сбоя)');
    });

    test('живой раздел: подъём состояния + перерисовка + сброс годовых кэшей', () => {
        assertTrue(M.indexOf('self._restoreFromObj(c)') !== -1,
            'подъём состояния (общий разбор формата v1)');
        assertTrue(M.indexOf('self._renderGrid()') !== -1, 'перерисовка сетки');
        assertTrue(M.indexOf('self._updateCalChip()') !== -1, 'чип норм месяца');
        assertTrue(M.indexOf('self._updateCacheStamp()') !== -1,
            'штамп «данные от …»');
        assertTrue(M.indexOf('self._YEAR_DATA = null;') !== -1 &&
                   M.indexOf('self._VAC_YEARS = {};') !== -1,
            'сброс годового кэша итогов/пула отпусков — как loadGrid(true)');
    });

    test('не мешает ручному «Обновить» и попапу ячейки', () => {
        assertTrue(M.indexOf('!self._refreshing') !== -1,
            'ручное обновление идёт — экран не трогаем');
        assertTrue(M.indexOf("getElementById('wsCellPopup')") !== -1 &&
                   M.indexOf("classList.contains('active')") !== -1,
            'попап ячейки открыт — только копия');
        assertTrue(M.indexOf("getElementById('wsGridWrap')") !== -1,
            'сетка жива (раздел действительно открыт)');
        assertTrue(M.indexOf('self._year === year && self._month === month') !== -1,
            'fetched-вид совпадает с открытым');
    });

    test('_PENDING не затирается (слой поверх записей)', () => {
        assertTrue(M.indexOf('_PENDING') !== -1 &&
                   M.indexOf('_PENDING = {}') === -1,
            'правки пользователя живут поверх свежих записей (как у «Обновить»)');
    });

    test('сбой — ТИХИЙ: console.warn без тоста/экрана', () => {
        const iCatch = M.indexOf('.catch(function(err) {');
        assertTrue(iCatch !== -1, 'catch-ветка есть');
        const tail = M.slice(iCatch, M.indexOf('}).then(function(ok)'));
        assertTrue(tail.indexOf('console.warn') !== -1, 'console.warn');
        assertTrue(tail.indexOf('KipToast') === -1,
            'без тоста — «тихое» по заявке');
        assertTrue(M.indexOf('return false;') !== -1, 'промис резолвится false');
    });

    test('состояние: поля _silentTs/_silentBusy в модуле', () => {
        const i = INDEX_SRC.indexOf('var WorkSchedule = {');
        const head = INDEX_SRC.slice(i, i + 60000);
        assertTrue(head.indexOf('_silentTs: 0,') !== -1, '_silentTs объявлен');
        assertTrue(head.indexOf('_silentBusy: false,') !== -1, '_silentBusy объявлен');
        assertTrue(head.indexOf('Task 486: ТИХОЕ обновление при открытии') !== -1,
            'комментарий-легенда у полей');
    });
});

// ==========================================================================
// 3. KipAuth: хук при открытии приложения + сброс при logout
// ==========================================================================
describe('Task 486 — KipAuth: хук открытия приложения', () => {
    test('_schedulePreload: тихое обновление тем же таймером 4 с', () => {
        const m = methodText(INDEX_SRC, '_schedulePreload');
        assertTrue(m.indexOf('WorkSchedule.silentRefresh()') !== -1,
            'вызов метода');
        assertTrue(m.indexOf('4000') !== -1, 'тот же таймер, что KipPreload');
        assertTrue(m.indexOf("KipAuth.canAccess('work-schedule')") !== -1,
            'права — canAccess (серверная матрица + легаси-карта)');
        assertTrue(m.indexOf('typeof WorkSchedule.silentRefresh') !== -1,
            'guard — метод необязателен (VM/старые срезы)');
    });

    test('5 точек входа _schedulePreload не изменились', () => {
        const calls = INDEX_SRC.split('_schedulePreload()').length - 1;
        assertEqual(calls, 5,
            'вход OTP + bootstrap быстрый/медленный + офлайн-повтор + фоновая проверка');
    });

    test('_wipeLocalServerData: сброс метки тихого обновления', () => {
        const m = methodText(INDEX_SRC, '_wipeLocalServerData');
        assertTrue(m.indexOf('WorkSchedule._silentTs = 0') !== -1,
            'после чистки копий повторный вход качает обязательно');
    });

    test('logout: KipPreload.stop() до wipe — не тронут (Task 476/477 живы)', () => {
        const i = INDEX_SRC.indexOf('logout: function() {');
        const m = INDEX_SRC.slice(i, INDEX_SRC.indexOf('handleSessionExpired: function()', i));
        const iStop = m.indexOf('KipPreload.stop();');
        const iWipe = m.indexOf('this._wipeLocalServerData();');
        assertTrue(iStop !== -1 && iWipe !== -1 && iStop < iWipe,
            'очередь останавливается до стирания копий и сброса метки');
    });
});

// ==========================================================================
// 4. KipPreload._preloadWs: координация (дубль сети не нужен)
// ==========================================================================
describe('Task 486 — KipPreload._preloadWs: координация', () => {
    test('свежая метка/идущее обновление — ws-элемент пропускается', () => {
        const i = INDEX_SRC.indexOf('function _preloadWs() {');
        const m = INDEX_SRC.slice(i, INDEX_SRC.indexOf('function _preloadCj()'));
        assertTrue(m.indexOf('WorkSchedule._silentBusy') !== -1,
            'идущее тихое обновление — пропуск');
        assertTrue(m.indexOf('WorkSchedule._silentTs') !== -1 &&
                   m.indexOf('5 * 60 * 1000') !== -1,
            'свежая метка (5 мин) — пропуск');
        assertTrue(m.indexOf('return Promise.resolve(true);') !== -1,
            'пропуск = успех (данные уже свежи в копии)');
        // комментарий координации — над функцией: ищем в исходнике
        assertTrue(INDEX_SRC.indexOf('ретраем-фолбэком') !== -1,
            'тихий сбой silentRefresh — сюда приходит ретрай (Task 477 жив)');
    });

    test('VM: _silentBusy → пропуск без сети', async () => {
        const i = INDEX_SRC.indexOf('function _preloadWs() {');
        const src = INDEX_SRC.slice(i, INDEX_SRC.indexOf('function _preloadCj()'));
        const make = new Function('_api', '_mergeIdbCache', 'WorkSchedule',
            src + '\nreturn _preloadWs;');
        let apiCalls = 0;
        const api = function() { apiCalls++; return Promise.resolve({}); };
        const merge = function() { return Promise.resolve(true); };
        const fn = make(api, merge, { _silentBusy: true });
        const ok = await fn();
        assertEqual(ok, true, 'успех без запросов');
        assertEqual(apiCalls, 0, 'сеть не дёргается — тихое обновление идёт');
    });

    test('VM: свежая _silentTs → пропуск; устаревшая → сеть', async () => {
        const i = INDEX_SRC.indexOf('function _preloadWs() {');
        const src = INDEX_SRC.slice(i, INDEX_SRC.indexOf('function _preloadCj()'));
        const make = new Function('_api', '_mergeIdbCache', 'WorkSchedule',
            src + '\nreturn _preloadWs;');
        let apiCalls = 0;
        const api = function() {
            apiCalls++;
            return Promise.resolve({ codes: [], patterns: [], employees: [],
                trainings: [], instrList: [], instrAll: [], eventsAll: [],
                vacations: [], ppe: [], entries: [] });
        };
        const merge = function() { return Promise.resolve(true); };
        const WS_KEY = { _wsCacheKey: 'kip8_ws_cache_v1' };
        const fresh = make(api, merge,
            Object.assign({ _silentTs: Date.now() }, WS_KEY));
        assertEqual(await fresh(), true, 'свежая метка — успех');
        assertEqual(apiCalls, 0, 'без сети');
        const stale = make(api, merge,
            Object.assign({ _silentTs: Date.now() - 10 * 60 * 1000 }, WS_KEY));
        await stale();
        assertEqual(apiCalls, 7, 'устаревшая — ретрай-фолбэк (7 экшенов)');
    });

    test('VM: WorkSchedule нет (старый харнесс) — прежнее поведение', async () => {
        const i = INDEX_SRC.indexOf('function _preloadWs() {');
        const src = INDEX_SRC.slice(i, INDEX_SRC.indexOf('function _preloadCj()'));
        const make = new Function('_api', '_mergeIdbCache', 'WorkSchedule',
            src + '\nreturn _preloadWs;');
        let apiCalls = 0;
        const api = function() {
            apiCalls++;
            return Promise.resolve({ codes: [], patterns: [], employees: [],
                trainings: [], instrList: [], instrAll: [], eventsAll: [],
                vacations: [], ppe: [], entries: [] });
        };
        const merge = function() { return Promise.resolve(true); };
        const fn = make(api, merge, undefined); // guard typeof
        await fn();
        assertEqual(apiCalls, 7, 'модуля нет — Task 477 работает как прежде');
    });
});

// ==========================================================================
// 5. VM: silentRefresh — поведение целиком
// ==========================================================================
describe('Task 486 — VM: silentRefresh', () => {

    // метод из исходника: вырезаем по закрывающей скобке уровня метода
    // (methodText включает хвостовые комментарии следующего блока)
    function mkSilentFn(KipDB, ls, document, consoleMock) {
        const m = methodText(INDEX_SRC, 'silentRefresh');
        const cut = m.indexOf('\n        },') + '\n        },'.length;
        const fnSrc = m.slice(0, cut).trim()
            .replace(/^silentRefresh:\s*/, '').replace(/,\s*$/, '');
        const make = new Function('KipDB', 'localStorage', 'document', 'console',
            'return (' + fnSrc + ');');
        return make(KipDB, ls, document, consoleMock);
    }

    const RESULTS = {
        'workSchedule.getStatusCodes': { codes: [{ code: 'Д', name: 'День' }] },
        'workSchedule.getPatterns': { patterns: [{ имя: 'см 1' }] },
        'workSchedule.listEmployees': { employees: [{ таб_номер: 1, фио: 'А' }] },
        'workSchedule.listTrainings': { trainings: [{ id: 1 }],
            instrList: [{ название: 'Инструктаж' }], instrAll: [], eventsAll: [] },
        'workSchedule.listVacations': { vacations: [{ id: 9 }] },
        'workSchedule.listPpe': { ppe: [{ id: 3 }] },
        'workSchedule.listEntries': { entries: [{ дата: '2026-10-05', таб_номер: 1 }] }
    };

    function mkEnv(opts) {
        opts = opts || {};
        const ls = new Map();
        const lsMock = {
            getItem: k => (ls.has(k) ? ls.get(k) : null),
            setItem: (k, v) => { ls.set(k, v); },
            removeItem: k => { ls.delete(k); }
        };
        if (opts.seedCache) ls.set('kip8_ws_cache_v1', JSON.stringify(opts.seedCache));
        const kdb = new Map();
        const kdbMock = {
            set: (k, v) => { kdb.set(k, v); return Promise.resolve(); },
            get: k => Promise.resolve(kdb.has(k) ? kdb.get(k) : undefined)
        };
        const doc = {
            getElementById: function(id) {
                if (id === 'wsGridWrap') return opts.gridWrap === false ? null : {};
                if (id === 'wsCellPopup') return opts.popup ? { classList: {
                    contains: () => true } } : null;
                return null;
            }
        };
        const consoleMock = { warn: function() { (opts.warns = opts.warns || []).push(
            Array.prototype.slice.call(arguments).join(' ')); } };
        const calls = [];
        const api = function(action, payload) {
            calls.push([action, payload]);
            if (opts.fail) return Promise.reject(new Error(opts.fail));
            return Promise.resolve(RESULTS[action]);
        };
        const track = { renders: 0, restored: 0, chips: 0, stamps: 0 };
        const inst = {
            _wsCacheKey: 'kip8_ws_cache_v1',
            _silentTs: opts.silentTs || 0,
            _silentBusy: opts.silentBusy || false,
            _initialized: opts.initialized !== false,
            _viewLevel: opts.viewLevel !== undefined ? opts.viewLevel : 'view',
            _year: opts.year !== undefined ? opts.year : 2026,
            _month: opts.month !== undefined ? opts.month : 10,
            _refreshing: opts.refreshing || false,
            _PENDING: { '2026-10-05|1': { статус: 'ОТ' } },
            _YEAR_DATA: { year: 2026 },
            _VAC_YEARS: { 2026: [1] },
            _cacheTs: 0,
            _api: api,
            _sortEmployees: function(l) { return l; },
            _cacheRead: function() {
                try {
                    const r = lsMock.getItem(this._wsCacheKey);
                    return r ? JSON.parse(r) : null;
                } catch (e) { return null; }
            },
            _restoreFromObj: function(c) { track.restored++; return true; },
            _renderGrid: function() { track.renders++; },
            _updateCalChip: function() { track.chips++; },
            _updateCacheStamp: function() { track.stamps++; }
        };
        inst.silentRefresh = mkSilentFn(kdbMock, lsMock, doc, consoleMock);
        return { inst, ls, kdb, calls, track, opts };
    }

    test('живой раздел: 7 экшенов, ОБА слоя, подъём и перерисовка', async () => {
        const e = mkEnv();
        const ok = await e.inst.silentRefresh();
        assertEqual(ok, true, 'успех');
        assertEqual(e.calls.length, 7, 'те же 7 экшенов, что «Обновить»');
        assertEqual(e.calls[0][0], 'workSchedule.getStatusCodes', 'справочник кодов');
        assertEqual(e.calls[6][0], 'workSchedule.listEntries', 'записи месяца');
        // параметры года/месяца — открытый вид
        assertEqual(e.calls[6][1].year, 2026, 'год открытого вида');
        assertEqual(e.calls[6][1].month, 10, 'месяц открытого вида');
        // ОБА слоя копии
        assertTrue(e.ls.has('kip8_ws_cache_v1'), 'localStorage-слой записан');
        assertTrue(e.kdb.has('kip8_ws_cache_v1'), 'KipDB-слой записан');
        const c = JSON.parse(e.ls.get('kip8_ws_cache_v1'));
        assertEqual(c.v, 1, 'формат v1');
        assertEqual(c.codes.length, 1, 'справочник кодов в копии');
        assertEqual(c.employees.length, 1, 'сотрудники в копии');
        assertEqual(c.instrList.length, 1, 'шаблон инструктажей');
        assertTrue(c.views['2026-10'], 'вид год-месяц в копии');
        assertEqual(c.views['2026-10'].entries.length, 1, 'записи вида');
        assertEqual(c.views['2026-10'].trainings.length, 1, 'мероприятия вида');
        assertTrue(c.views['2026-10'].ts > 0, 'штамп времени вида');
        // живое применение
        assertEqual(e.track.restored, 1, 'состояние поднято');
        assertEqual(e.track.renders, 1, 'сетка перерисована');
        assertEqual(e.track.chips, 1, 'чип норм обновлён');
        assertEqual(e.track.stamps, 1, 'штамп «данные от …» обновлён');
        assertEqual(e.inst._YEAR_DATA, null, 'годовой кэш итогов сброшен');
        assertEqual(JSON.stringify(e.inst._VAC_YEARS), '{}', 'пул отпусков сброшен');
        // _PENDING живы (слой поверх записей)
        assertTrue(e.inst._PENDING['2026-10-05|1'] !== undefined,
            'несохранённые правки не затёрты');
        // метки метода
        assertTrue(e.inst._silentTs > 0, '_silentTs поставлен');
        assertEqual(e.inst._silentBusy, false, '_silentBusy сброшен');
    });

    test('merge: чужие виды/годы в копии сохраняются', async () => {
        const seed = { v: 1, codes: [{ code: 'Д' }], patterns: [], employees: [],
            vacations: { '2025': [{ id: 1 }] }, ppe: [], instrList: [],
            instrAll: [], eventsAll: [],
            views: { '2026-09': { entries: [{ x: 1 }], trainings: [], ts: 1 } } };
        const e = mkEnv({ seedCache: seed });
        await e.inst.silentRefresh();
        const c = JSON.parse(e.ls.get('kip8_ws_cache_v1'));
        assertTrue(c.views['2026-09'], 'прошлый вид не тронут');
        assertEqual(c.vacations['2025'].length, 1, 'прошлый год отпусков не тронут');
        assertTrue(c.views['2026-10'], 'новый вид добавлен');
        assertEqual(c.vacations['2026'].length, 1, 'год fetched-вида обновлён');
    });

    test('раздел не открыт (нет прав/вида): только копия, экран не трогаем', async () => {
        const e = mkEnv({ viewLevel: null, gridWrap: false, year: null, month: null });
        const ok = await e.inst.silentRefresh();
        assertEqual(ok, true, 'копия обновлена');
        assertEqual(e.calls.length, 7, 'экшены — текущая дата (раздел не открывали)');
        assertTrue(e.ls.has('kip8_ws_cache_v1'), 'копия записана');
        assertEqual(e.track.renders, 0, 'перерисовки нет');
        assertEqual(e.track.restored, 0, 'состояние не поднимается');
    });

    test('троттлинг 5 минут: свежая метка + НЕ пустая копия → тишина', async () => {
        const e = mkEnv({ silentTs: Date.now(),
            seedCache: { v: 1, codes: [], patterns: [], employees: [],
                vacations: {}, ppe: [], instrList: [], instrAll: [],
                eventsAll: [], views: {} } });
        const ok = await e.inst.silentRefresh();
        assertEqual(ok, false, 'тихо пропущено');
        assertEqual(e.calls.length, 0, 'сеть не дёргается');
    });

    test('троттлинг, но копия ПУСТА (logout) → обновляем и внутри окна', async () => {
        const e = mkEnv({ silentTs: Date.now() }); // копии нет
        const ok = await e.inst.silentRefresh();
        assertEqual(ok, true, 'после чистки копий качаем обязательно');
        assertEqual(e.calls.length, 7, 'экшены выполнены');
    });

    test('параллельный запуск (_silentBusy) — второй тихий false', async () => {
        const e = mkEnv({ silentBusy: true });
        const ok = await e.inst.silentRefresh();
        assertEqual(ok, false, 'не дёргаем сеть повторно');
        assertEqual(e.calls.length, 0, 'без запросов');
    });

    test('попап ячейки открыт: копия пишется, экран НЕ перерисовывается', async () => {
        const e = mkEnv({ popup: true });
        const ok = await e.inst.silentRefresh();
        assertEqual(ok, true, 'данные свежи');
        assertTrue(e.ls.has('kip8_ws_cache_v1'), 'копия записана');
        assertEqual(e.track.renders, 0, 'попап не сносим');
        assertEqual(e.track.restored, 0, 'состояние не трогаем');
    });

    test('ручное «Обновить» идёт (_refreshing): копия без перерисовки', async () => {
        const e = mkEnv({ refreshing: true });
        await e.inst.silentRefresh();
        assertTrue(e.ls.has('kip8_ws_cache_v1'), 'копия записана');
        assertEqual(e.track.renders, 0, 'ручное обновление не конкурирует');
    });

    test('fetched-вид != открытому: копия для fetched-вида, экран не трогаем', async () => {
        // раздел открыли ПОКА обновление летит: fetched взял текущую
        // дату (вид не был открыт), пользователь открыл ДРУГОЙ месяц
        const e = mkEnv({ year: null, month: null });
        const p = e.inst.silentRefresh();
        e.inst._year = 2025; e.inst._month = 8;
        const ok = await p;
        assertEqual(ok, true, 'копия обновлена');
        const c = JSON.parse(e.ls.get('kip8_ws_cache_v1'));
        const ym = Object.keys(c.views)[0];
        assertTrue(ym !== '2025-08', 'в копии fetched-вид (текущая дата), не открытый');
        assertEqual(e.track.renders, 0, 'вид не совпал — экран не трогаем');
        assertEqual(e.track.restored, 0, 'состояние не поднимается');
    });

    test('сбой API: тихий false, console.warn, метка НЕ ставится', async () => {
        const e = mkEnv({ fail: 'NETWORK_ERROR: HTTP 500' });
        const ok = await e.inst.silentRefresh();
        assertEqual(ok, false, 'сбой — false');
        assertEqual((e.opts.warns || []).length, 1, 'console.warn один раз');
        assertTrue((e.opts.warns[0] || '').indexOf('тихий сбой') !== -1,
            'маркер тихого сбоя');
        assertEqual(e.inst._silentTs, 0,
            'метка не ставилась — KipPreload._preloadWs сделает ретрай');
        assertEqual(e.inst._silentBusy, false, 'флаг занятости снят');
        assertFalse(e.ls.has('kip8_ws_cache_v1'), 'копию не трогали');
    });

    test('после успешного прогона повтор — троттлится (копия есть)', async () => {
        const e = mkEnv();
        await e.inst.silentRefresh();
        const ok2 = await e.inst.silentRefresh();
        assertEqual(ok2, false, 'второй запуск внутри окна 5 минут');
        assertEqual(e.calls.length, 7, 'сеть не дёргается повторно');
    });
});

// ==========================================================================
// 6. Адаптации под Task 486 (рост модуля + окна истории)
// ==========================================================================
describe('Task 486 — адаптации срезов/окон', () => {
    test('WS_CLIENT 500000 → 600000 (модуль вырос, onCellClick уехал)', () => {
        ['test-task337.js', 'test-task338.js', 'test-task341.js',
         'test-task342.js', 'test-task343.js', 'test-task360.js',
         'test-task361.js', 'test-task362.js'].forEach(f => {
            const s = fs.readFileSync(path.join(ROOT, 'tests', f), 'utf8');
            assertTrue(s.indexOf('WS_START + 600000') !== -1,
                f + ': срез 600000');
            assertTrue(s.indexOf('WS_START + 500000') === -1,
                f + ': старой границы нет');
        });
    });

    test('test-task477: срез _schedulePreload расширен до 1700', () => {
        const s = fs.readFileSync(path.join(ROOT, 'tests', 'test-task477.js'), 'utf8');
        assertTrue(s.indexOf('INDEX_SRC.slice(i, i + 1700)') !== -1,
            'литерал 4000 в методе на ~1505 — срез 1700');
    });

    test('окна истории sw.js — новые литералы синхронизированы', () => {
        const s475 = fs.readFileSync(path.join(ROOT, 'tests', 'test-task475.js'), 'utf8');
        assertTrue(s475.indexOf("'i - 17000'") !== -1, 'каскад 475: 461 → 14000 (Task 498; Task 505: +700; Task 508: +700)');
        const s481 = fs.readFileSync(path.join(ROOT, 'tests', 'test-task481.js'), 'utf8');
        assertTrue(s481.indexOf("'i - 13300'") !== -1, 'каскад 481: 474 → 11200 (Task 498; Task 505: +700)');
        const s482 = fs.readFileSync(path.join(ROOT, 'tests', 'test-task482.js'), 'utf8');
        assertTrue(s482.indexOf("'i - 11600'") !== -1, 'каскад 482: 478/479 → 8900 (Task 498; Task 505: +700)');
        const s484 = fs.readFileSync(path.join(ROOT, 'tests', 'test-task484.js'), 'utf8');
        // Task 487: комментарий ~569 симв. отодвинул якорь Task 484
        // (2248) — окно расширено 2100 → 2500 (каскад task487-bump-sw)
        // Task 490: комментарий ~480 симв. — окно 3900 → 4500
        // (якорь Task 484 @4232; каскад task490-bump-sw)
        assertTrue(s484.indexOf('i - 9600') !== -1, '484: собственное окно (Task 487/490/491/495/498; Task 505: +700)');
    });
});

console.log('test-task486: все describes зарегистрированы');
