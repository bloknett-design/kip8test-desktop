// tests/test-task477.js
// Task 477 — ЭТАП 3 ОПТИМИЗАЦИИ (завершение заявки этапов 1–2):
// «в принципе должны незаметно подгружаться все данные приложения
// (только из тех разделов и данных, к которым у пользователя есть
// доступ согласно его роли)».
//
// РЕШЕНИЕ (этап 3: KipPreload — фоновая предзагрузка по правам
// роли; клиент-only, Apps Script не тронут):
//   (а) новый модуль KipPreload (index.html, рядом с KipDB):
//       манифест по canAccess (серверная матрица KIP8_Access +
//       легаси-карта — как видимость кнопок UI); статические
//       data/*.json доступных разделов — fetch через SWR (Task 475,
//       прогрев персистентного DATA-кэша тем же путём, что обычное
//       открытие раздела); серверные группы (табель/каб. журнал/
//       расходомеры/отметки мероприятий) — те же read-only экшены,
//       что у разделов, копии в KipDB (Task 476);
//   (б) вежливость: ПО ОДНОМУ элементу (последовательность),
//       requestIdleCallback (+fallback setTimeout) + пауза ≥1.5 с
//       между элементами; saveData/2g/slow-2g — очередь не
//       запускается вовсе; офлайн — пауза, 'online' — продолжение;
//   (в) KipAuth._schedulePreload — старт через 4 с после входа
//       (5 точек входа); logout — KipPreload.stop() до чистки копий;
//   (г) сервер остаётся источником прав: только read-only экшены,
//       каждый гейтится на сервере; гость («Общий доступ») —
//       пустая очередь (калькуляторы без data-файлов).
//   SW: kipia-test-v700 → v701 (логика sw.js не менялась —
//   комментарий Task 477 компактный ~300 симв., окна истории НЕ
//   расширялись: 474 1539<1700, 472 1912<2100, 471 2461<2700,
//   461 5023<5300).
//
// Запуск: через tests/run-all.js (require './test-task477.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// ==========================================================================
// 1. SW: версия и шапка
// ==========================================================================
describe('Task 477 — SW: версия и шапка', () => {
    test('CACHE_VERSION = kipia-test-v753', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v753';") !== -1,
            'SW поднят до v701');
    });
    test('прежняя версия v700 отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v700') === -1,
            'в sw.js не осталось kipia-test-v700');
    });
    test('несуществующая v702 отсутствует (guard)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v754') === -1,
            'kipia-test-v753 не должен существовать');
    });
    test('комментарий Task 477 в шапке версий', () => {
        assertTrue(SW_SRC.indexOf('Task 477 (этап 3 оптимизации): KipPreload') !== -1,
            'маркер задачи');
        assertTrue(SW_SRC.indexOf('ПО ПРАВАМ РОЛИ') !== -1,
            'описание предзагрузки по правам роли');
    });
    test('bypass Apps Script не тронут', () => {
        assertTrue(SW_SRC.indexOf("bypassUrl.hostname === 'script.google.com'") !== -1,
            'bypass script.google.com на месте');
    });
});

// ==========================================================================
// 2. KipPreload — модуль: каркас и вежливость
// ==========================================================================
describe('Task 477 — KipPreload: модуль', () => {
    test('модуль объявлен глобальным var (guard typeof)', () => {
        assertTrue(INDEX_SRC.indexOf('var KipPreload = (function() {') !== -1,
            'KipPreload определён как глобальный var');
    });
    test('паузы: GAP_MS 1500 + IDLE_TIMEOUT 5000', () => {
        assertTrue(INDEX_SRC.indexOf('var GAP_MS = 1500;') !== -1,
            'пауза между элементами ≥ 1.5 с');
        assertTrue(INDEX_SRC.indexOf('var IDLE_TIMEOUT = 5000;') !== -1,
            'idle-timeout 5 с');
    });
    test('idle-планировщик: requestIdleCallback + fallback setTimeout', () => {
        const i = INDEX_SRC.indexOf('function _scheduleIdle(fn) {');
        assertTrue(i !== -1, 'планировщик найден');
        const m = INDEX_SRC.slice(i, INDEX_SRC.indexOf('function _next()', i));
        assertTrue(m.indexOf('window.requestIdleCallback') !== -1, 'requestIdleCallback');
        assertTrue(m.indexOf('setTimeout(go, GAP_MS)') !== -1, 'fallback setTimeout');
    });
    test('одноразовость start() (_started guard)', () => {
        const i = INDEX_SRC.indexOf('function start() {');
        const m = INDEX_SRC.slice(i, INDEX_SRC.indexOf('function stop()', i));
        assertTrue(m.indexOf('if (_started) return false;') !== -1,
            'повторный start — тихий false');
    });
    test('stop() сбрасывает очередь и состояние', () => {
        const i = INDEX_SRC.indexOf('function stop() {');
        const m = INDEX_SRC.slice(i, i + 400);
        assertTrue(m.indexOf('_queue = [];') !== -1, 'очередь очищается');
        assertTrue(m.indexOf('_started = false;') !== -1, 'разрешён новый запуск');
    });
    test('слушатели online/offline: пауза/продолжение', () => {
        assertTrue(INDEX_SRC.indexOf("window.addEventListener('online', function() { _paused = false; _kick(); });") !== -1,
            'online → продолжение очереди');
        assertTrue(INDEX_SRC.indexOf("window.addEventListener('offline', function() { _paused = true; });") !== -1,
            'offline → пауза');
    });
    test('последовательность: один элемент за раз (_next → _runItem один)', () => {
        const i = INDEX_SRC.indexOf('function _next() {');
        const m = INDEX_SRC.slice(i, INDEX_SRC.indexOf('function _kick()', i));
        const shifts = (m.match(/_queue\.shift\(\)/g) || []).length;
        assertEqual(shifts, 1, 'ровно один shift на шаг — без параллельных загрузок');
        assertTrue(m.indexOf('_scheduleIdle(_next);') !== -1,
            'следующий элемент — только после idle-паузы');
    });
    test('диагностика: _state() для консоли/тестов', () => {
        assertTrue(INDEX_SRC.indexOf('_state: function() {') !== -1,
            'экспорт состояния очереди');
    });
});

// ==========================================================================
// 3. KipPreload VM: манифест по правам роли + экономия трафика
// ==========================================================================
describe('Task 477 — KipPreload VM: манифест по роли', () => {

    function loadKipPreload(win, navigatorMock, kipAuthMock) {
        const i = INDEX_SRC.indexOf('var KipPreload = (function() {');
        assertTrue(i !== -1, 'KipPreload найден в index.html');
        const j = INDEX_SRC.indexOf('})();', i);
        const src = INDEX_SRC.slice(i, j + 5);
        const make = new Function('window', 'navigator', 'KipAuth', 'KipDB', 'localStorage',
            src + '\nreturn KipPreload;');
        return make(win, navigatorMock, kipAuthMock, undefined, undefined);
    }

    const win = { addEventListener: function() {} };

    function mkAuth(pages, token) {
        return {
            canAccess: function(p) { return pages.indexOf(p) !== -1; },
            getToken: function() { return token || ''; },
            _cachedRole: 'тест'
        };
    }

    // Все страницы манифеста + серверные группы (максимум — «Админ»)
    const ALL_PAGES = ['devices', 'lockouts-prod', 'valves-prod', 'regulators-prod',
                       'projects-prod', 'cable-journal-view', 'phonebook',
                       'exam-tickets', 'flowmeter-data',
                       'work-schedule', 'plan-events'];
    const ALL_FILES = ['data/devices.json', 'data/lockouts.json', 'data/valves.json',
                       'data/regulators.json', 'data/projects.json', 'data/cables.json',
                       'data/phonebook.json', 'data/exam-tickets.json',
                       'data/flowmeters.json'];

    test('полный доступ + токен: 9 статических + 4 серверных', () => {
        const kp = loadKipPreload(win, {}, mkAuth(ALL_PAGES, 'tok'));
        const q = kp._buildQueue();
        const json = q.filter(x => x.kind === 'json');
        const api = q.filter(x => x.kind === 'api');
        assertEqual(json.length, 9, 'все статические файлы');
        ALL_FILES.forEach(f => {
            assertTrue(json.some(x => x.file === f), 'файл ' + f);
        });
        assertEqual(api.length, 4, 'ws + cj + fm + pe');
        assertTrue(api.some(x => x.id === 'ws') && api.some(x => x.id === 'cj') &&
                   api.some(x => x.id === 'fm') && api.some(x => x.id === 'pe'),
            'состав серверных групп');
    });

    test('гость («Общий доступ») — очередь ПУСТА (калькуляторы без данных)', () => {
        const kp = loadKipPreload(win, {}, mkAuth(['dashboard', 'calculators'], ''));
        assertEqual(kp._buildQueue().length, 0, 'гостю предзагружать нечего');
    });

    test('роль без расходомеров: flowmeters.json и api:fm исключены', () => {
        const pages = ALL_PAGES.filter(p => p !== 'flowmeter-data');
        const kp = loadKipPreload(win, {}, mkAuth(pages, 'tok'));
        const q = kp._buildQueue();
        assertFalse(q.some(x => x.file === 'data/flowmeters.json'),
            'flowmeters.json не в очереди');
        assertFalse(q.some(x => x.id === 'fm'), 'серверная группа fm не в очереди');
        assertTrue(q.some(x => x.id === 'pe'), 'остальные группы на месте');
    });

    test('без токена серверные группы НЕ добавляются', () => {
        const kp = loadKipPreload(win, {}, mkAuth(ALL_PAGES, ''));
        const q = kp._buildQueue();
        assertEqual(q.filter(x => x.kind === 'api').length, 0,
            'api-группы только для авторизованных');
        assertEqual(q.filter(x => x.kind === 'json').length, 9, 'статика остаётся');
    });

    test('роль «Запрет» (только главная) — очередь пуста', () => {
        const kp = loadKipPreload(win, {}, mkAuth(['dashboard'], 'tok'));
        assertEqual(kp._buildQueue().length, 0, 'нет прав — нет предзагрузки');
    });

    test('start(): saveData — предзагрузка отключается целиком', () => {
        const kp = loadKipPreload(win, { connection: { saveData: true } },
                                  mkAuth(ALL_PAGES, 'tok'));
        assertFalse(kp.start(), 'saveData — очередь не запущена');
        assertEqual(kp._state().pending, 0, 'очередь пуста');
    });

    test('start(): 2g — отключается; 3g/4g — работает', () => {
        const kp2g = loadKipPreload(win, { connection: { effectiveType: '2g' } },
                                   mkAuth(ALL_PAGES, 'tok'));
        assertFalse(kp2g.start(), '2g — очередь не запущена');
        const kpsg = loadKipPreload(win, { connection: { effectiveType: 'slow-2g' } },
                                    mkAuth(ALL_PAGES, 'tok'));
        assertFalse(kpsg.start(), 'slow-2g — очередь не запущена');
        const kp4g = loadKipPreload(win, { connection: { effectiveType: '4g' } },
                                    mkAuth(ALL_PAGES, 'tok'));
        assertTrue(kp4g.start(), '4g — очередь запущена');
        // 13 элементов построено, 1 уже снят с очереди (в работе —
        // _next() синхронно делает shift первого элемента)
        assertEqual(kp4g._state().pending, 12, '13 построено, 1 в работе');
    });

    test('start(): одноразовость — второй вызов тихий false', () => {
        const kp = loadKipPreload(win, {}, mkAuth(ALL_PAGES, 'tok'));
        assertTrue(kp.start(), 'первый запуск — true');
        assertFalse(kp.start(), 'повторный — false');
    });

    test('navigator.connection отсутствует — предзагрузка не блокируется', () => {
        const kp = loadKipPreload(win, {}, mkAuth(ALL_PAGES, 'tok'));
        assertTrue(kp.start(), 'без Network Information API — работаем');
    });
});

// ==========================================================================
// 4. Preload-хендлеры: состав серверных экшенов (read-only)
// ==========================================================================
describe('Task 477 — серверные группы preload (read-only)', () => {
    test('табель: 7 экшенов + форма кэша Task 314 + merge', () => {
        const i = INDEX_SRC.indexOf('function _preloadWs() {');
        assertTrue(i !== -1, 'хендлер найден');
        const m = INDEX_SRC.slice(i, INDEX_SRC.indexOf('function _preloadCj()', i));
        ['workSchedule.getStatusCodes', 'workSchedule.getPatterns',
         'workSchedule.listEmployees', 'workSchedule.listTrainings',
         'workSchedule.listVacations', 'workSchedule.listPpe',
         'workSchedule.listEntries'].forEach(a => {
            assertTrue(m.indexOf("'" + a + "'") !== -1, 'экшен ' + a);
        });
        assertTrue(m.indexOf('_sortEmployees') !== -1,
            'сотрудники сортируются как у раздела');
        assertTrue(m.indexOf('_mergeIdbCache') !== -1, 'merge с существующей копией');
        assertTrue(m.indexOf('c.v = 1;') !== -1, 'формат v1');
    });

    test('каб. журнал: getColumns + list(1000) + обе KipDB-копии', () => {
        const i = INDEX_SRC.indexOf('function _preloadCj() {');
        const m = INDEX_SRC.slice(i, INDEX_SRC.indexOf('function _preloadFm()', i));
        assertTrue(m.indexOf("'cableJournal.getColumns'") !== -1, 'getColumns');
        assertTrue(m.indexOf("'cableJournal.list'") !== -1 &&
                   m.indexOf('limit: 1000') !== -1, 'list limit 1000 (как раздел)');
        assertTrue(m.indexOf('KipDB.set(colsKey, colsRes)') !== -1, 'копия колонок');
        assertTrue(m.indexOf('rows: (data && data.rows) || []') !== -1, 'копия строк');
    });

    test('расходомеры: flowmeter.list + KipDB-копия {meters,ts}', () => {
        const i = INDEX_SRC.indexOf('function _preloadFm() {');
        const m = INDEX_SRC.slice(i, INDEX_SRC.indexOf('function _preloadPe()', i));
        assertTrue(m.indexOf("'flowmeter.list'") !== -1, 'flowmeter.list');
        assertTrue(m.indexOf('meters: (data && data.meters) || []') !== -1,
            'форма _persistData');
    });

    test('отметки мероприятий: planEvents.list + merge по годам', () => {
        const i = INDEX_SRC.indexOf('function _preloadPe() {');
        const m = INDEX_SRC.slice(i, INDEX_SRC.indexOf('function _runItem(item)', i));
        assertTrue(m.indexOf("'planEvents.list'") !== -1, 'planEvents.list');
        assertTrue(m.indexOf("c.years[String(year)]") !== -1, 'merge по годам');
    });

    test('статические файлы: fetch + SWR-прогрев (cache-busting как у разделов)', () => {
        const i = INDEX_SRC.indexOf('function _runItem(item) {');
        const m = INDEX_SRC.slice(i, INDEX_SRC.indexOf('function _scheduleIdle(fn)', i));
        assertTrue(m.indexOf("item.file + '?v=preload' + Date.now()") !== -1,
            'cache-busting (SW нормализует ключ без query)');
        assertTrue(m.indexOf("cache: 'no-store'") !== -1,
            'как у разделов — SWR отдаёт из DATA-кэша фоном');
    });

    test('ТОЛЬКО read-only экшены — ни одной записи на сервер', () => {
        const start = INDEX_SRC.indexOf('var KipPreload = (function() {');
        const end = INDEX_SRC.indexOf('})();', start);
        const src = INDEX_SRC.slice(start, end);
        // write-экшены приложений (по имени точки после точки в строках экшенов)
        ['/update', '.update', '.mark', '.unmark', '.add', '.remove', '.setStatus',
         '.updateReading', '.appendRow', '.updateRow', '.deleteRow', '.generate'
        ].forEach(w => {
            const re = new RegExp("'[a-zA-Z.]+" + w.replace('.', '\\.') + "'\\s*[,)]");
            assertFalse(re.test(src), 'write-экшен не должен встречаться: ' + w);
        });
    });
});

// ==========================================================================
// 5. KipAuth: хуки запуска/остановки
// ==========================================================================
describe('Task 477 — KipAuth: хуки предзагрузки', () => {
    test('_schedulePreload: метод + задержка 4 с + guard', () => {
        const i = INDEX_SRC.indexOf('_schedulePreload: function() {');
        assertTrue(i !== -1, 'метод найден');
        // срез больше метода — внутри есть преждевременный «},»
        // (замыкание setTimeout)
        const m = INDEX_SRC.slice(i, i + 1700);
        assertTrue(m.indexOf('4000') !== -1, 'старт через 4 с после показа UI');
        assertTrue(m.indexOf('typeof KipPreload') !== -1, 'guard — модуль необязателен');
    });

    test('вызов _schedulePreload — 5 точек входа', () => {
        const calls = INDEX_SRC.split('_schedulePreload()').length - 1;
        assertEqual(calls, 5,
            'verifyOTP + bootstrap быстрый/медленный + офлайн-повтор + фоновая проверка');
    });

    test('logout: KipPreload.stop() ДО чистки копий', () => {
        const i = INDEX_SRC.indexOf('logout: function() {');
        const m = INDEX_SRC.slice(i, INDEX_SRC.indexOf('handleSessionExpired: function()', i));
        const iStop = m.indexOf('KipPreload.stop();');
        const iWipe = m.indexOf('this._wipeLocalServerData();');
        assertTrue(iStop !== -1, 'stop вызывается');
        assertTrue(iWipe !== -1 && iStop < iWipe,
            'очередь останавливается до стирания копий');
    });

    test('guard «typeof KipPreload» в хуках (модуль необязателен)', () => {
        assertTrue(INDEX_SRC.indexOf('typeof KipPreload !== \'undefined\'') !== -1,
            'guard в logout');
    });
});

// ==========================================================================
// 6. Инварианты и окна истории
// ==========================================================================
describe('Task 477 — границы и окна', () => {
    test('DEPLOY-док этапа 3 — в git-архиве (регламент Task 510)', () => {
        // Task 510: DEPLOY-Task477-optimization-stage3-preload-by-role.md
        // старше недели → удалён из рабочей копии; история: git show pre-task510:<файл>
        const deployDir = fs.readdirSync(ROOT).filter(f => f.indexOf('DEPLOY-Task477') === 0);
        assertEqual(deployDir.length, 0, 'DEPLOY-Task477-* удалён из рабочей копии (архив Task 510)');
    });

    test('окна истории sw.js — компактный комментарий 477 НЕ расширял их (расширены Task 478/481/483)',
        () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v753';");
        const i474 = SW_SRC.lastIndexOf('Task 474', i);
        const i472 = SW_SRC.lastIndexOf('Task 472', i);
        const i471 = SW_SRC.lastIndexOf('Task 471', i);
        const i461 = SW_SRC.lastIndexOf('Task 461', i);
        assertTrue(i474 !== -1 && (i - i474) < 13300, 'Task 474 (~3731) в окне 4000');
        // Task 478: окна расширены (комментарий ~340 симв.):
        // 474 1700→2500, 472 2100→2900, 471 2700→3400, 461 5300→6000.
        // Task 483: ~378 симв. — 3100→3500/3600→4000/4200→4600/
        // 6800→7200; Task 484: ~390 симв. — 3500→4000/4000→4500/
        // 4600→5000/7200→7600 (windows-скрипты задач).
        assertTrue(i472 !== -1 && (i - i472) < 13500, 'Task 472 (~4104) в окне 4500');
        assertTrue(i471 !== -1 && (i - i471) < 14300, 'Task 471 (~4653) в окне 5000');
        assertTrue(i461 !== -1 && (i - i461) < 16700, 'Task 461 (~7215) в окне 7600');
    });
});

console.log('test-task477: все describes зарегистрированы');
