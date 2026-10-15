// tests/test-task497.js
// Task 497 (баг-репорт): «В разделе хозрасчётных расходомеров, при
//   первом после входа в приложение открытие страницы, появляется
//   надпись "Нет избранных расходомеров Перейдите во вкладку «Все»
//   и нажмите ☆ на карточке", но в нижней кнопке избранного в
//   счётчике показывает количество добавленных в избранное
//   расходомеров, значит в избранном есть добавленные расходомеры,
//   поправь этот баг, что бы если в избранном есть расходомеры, то
//   они сразу бы отображались до подгрузки данных с сервера.»
//
// ДИАГНОЗ: FlowmeterData.init() (Task 491 — автотаб «Избранные»)
// рендерил список с ПУСТЫМ _METERS → renderList() показывал заглушку
// «Нет избранных расходомеров» на fav-вкладке РАНЬШЕ проверки
// _loadState; _restoreCache(silent=true) заполнял _METERS из кэша
// МОЛЧА (без рендера) → до ответа API висела вводящая в заблуждение
// заглушка, хотя счётчик #flowFavCount (localStorage) показывал число.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — init(): блок Task 497 после _restoreCache(silent) и ДО
//      _loadFallback — мгновенный renderList() при silent + вкладка
//      «Избранные» + FlowFav.count()>0 + _METERS заполнен из кэша.
//   B. SRC — renderList(): порядок заглушек — hasFav497/favEmpty497;
//      «Нет избранных…» только при ДЕЙСТВИТЕЛЬНО пустом избранном
//      (или данные загружены, а избранных в них нет); в loading/
//      error при наличии избранного — «Загрузка данных…» / «Нет
//      связи с сервером». HTML заглушек не менялся.
//   C. VM — init() (реальный исходник): авторизован + избранное +
//      кэш → renderList вызывается ДВАЖДЫ: [0 метров, 12 метров] —
//      избранное отрисовано ДО ответа сервера (load — заглушка);
//      без кэша / без избранного / не та вкладка — второго рендера
//      НЕТ; гость — второй рендер из самого _restoreCache(false).
//   D. VM — renderList() (реальный исходник): fav+избранное+loading
//      → «Загрузка данных…» (НЕ «Нет избранных»); fav+избранное+
//      error → «Нет связи с сервером»; fav БЕЗ избранного → «Нет
//      избранных расходомеров» (как прежде); all+loading → «Загрузка
//      данных…», all+loaded → «Нет данных» (не тронуто).
//   E. SW v721 (guard v722; v720 в sw.js отсутствует) + комментарий
//      Task 497.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ---------------------------------------------------------------
// Извлечение исходников (баланс скобок), как в test-task491/496
// ---------------------------------------------------------------

// function-декларация по имени
function grabFn(name) {
    const start = INDEX_SRC.indexOf('function ' + name + '(');
    if (start === -1) return null;
    const braceStart = INDEX_SRC.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < INDEX_SRC.length; i++) {
        if (INDEX_SRC[i] === '{') depth++;
        else if (INDEX_SRC[i] === '}') {
            depth--;
            if (depth === 0) return INDEX_SRC.slice(start, i + 1);
        }
    }
    return null;
}

// Метод объектного литерала: якорь (уникальный текст внутри метода) →
// назад до «name: function(» → вперёд балансом фигурных скобок.
function grabMethodByAnchor(name, anchor) {
    const a = INDEX_SRC.indexOf(anchor);
    if (a === -1) return null;
    const m = INDEX_SRC.lastIndexOf(name + ': function(', a);
    if (m === -1) return null;
    const b = INDEX_SRC.indexOf('{', m);
    let depth = 0;
    for (let i = b; i < INDEX_SRC.length; i++) {
        if (INDEX_SRC[i] === '{') depth++;
        else if (INDEX_SRC[i] === '}') {
            depth--;
            if (depth === 0) return INDEX_SRC.slice(m, i + 1);
        }
    }
    return null;
}

// Метод от его собственной декларации (вперёд балансом)
function grabMethodFromDecl(decl) {
    const m = INDEX_SRC.indexOf(decl);
    if (m === -1) return null;
    const b = INDEX_SRC.indexOf('{', m);
    let depth = 0;
    for (let i = b; i < INDEX_SRC.length; i++) {
        if (INDEX_SRC[i] === '{') depth++;
        else if (INDEX_SRC[i] === '}') {
            depth--;
            if (depth === 0) return INDEX_SRC.slice(m, i + 1);
        }
    }
    return null;
}

// var-объект «var FlowFav={...};» (баланс скобок, с «;»)
function grabFlowFav() {
    const start = INDEX_SRC.indexOf('var FlowFav = {');
    if (start === -1) return null;
    const braceStart = INDEX_SRC.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < INDEX_SRC.length; i++) {
        if (INDEX_SRC[i] === '{') depth++;
        else if (INDEX_SRC[i] === '}') {
            depth--;
            if (depth === 0) return INDEX_SRC.slice(start, i + 2); // с «;»
        }
    }
    return null;
}

// Методы FlowmeterData (якоря уникальны в index.html)
function grabInit() {
    return grabMethodByAnchor('init', 'var targetTab491');
}
function grabRenderList() {
    return grabMethodByAnchor('renderList', '// Заглушка для пустого списка');
}

// ---------------------------------------------------------------
// VM-песочница (как test-task491: псевдо-DOM + localStorage)
// ---------------------------------------------------------------
function makeStorage() {
    const store = {};
    return {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
    };
}

function makeVm497(token) {
    const els = {};
    const mkEl = () => ({ value: '', style: {}, innerHTML: '', textContent: '' });
    const document = {
        getElementById: id => (els[id] || (els[id] = mkEl())),
        querySelectorAll: () => []
    };
    const ctx = {
        document,
        localStorage: makeStorage(),
        KipAuth: { getToken: () => token },
        console: { error: () => {}, log: () => {} },
        setTimeout: () => 0
    };
    vm.createContext(ctx);
    vm.runInContext(grabFlowFav(), ctx);
    return ctx;
}

// Собрать FlowmeterData-харнесс: реальные init/_restoreList/_normalize
// + шпионы-заглушки остальных зависимостей
function buildFlowData(ctx, opts) {
    const renderCalls = [];
    let insideRestore = false;

    const fd = {
        _cacheKey: 'kip8_flow_cache_v1',
        _activeTab: 'all',
        _loadState: 'idle',
        _METERS: [],
        _loaded: false,
        renderList: function () {
            renderCalls.push({ meters: this._METERS.length, fromRestore: insideRestore });
        },
        _loadFallback: function () {},
        _idbRestore: function () {},
        _loadRulesCacheFromStorage: function () {},
        _startOverdueTimer: function () {},
        _ensureOutboxWatchers: function () {},
        _flushOutbox: function () {},
        load: function () { this._loadCalls = (this._loadCalls || 0) + 1; }
    };

    // реальные методы (компилируются в VM-контексте)
    // ВАЖНО: «_restoreCache: function» в index.html ДВАЖДЫ (KipCableJournal
    // раньше по файлу) — извлекаем экземпляр FlowmeterData по уникальному
    // якорю «this._normalizeMeters(cached.meters)» из его тела.
    const initSrc = grabInit();
    const restoreSrc = grabMethodByAnchor('_restoreCache', 'this._normalizeMeters(cached.meters)');
    const normSrc = grabMethodFromDecl('_normalizeMeters: function');
    assertTrue(initSrc && restoreSrc && normSrc, 'исходники методов извлечены');
    const initFn = vm.runInContext('(' + initSrc.slice(initSrc.indexOf('function')) + ')', ctx);
    const restoreFn = vm.runInContext('(' + restoreSrc.slice(restoreSrc.indexOf('function')) + ')', ctx);
    const normFn = vm.runInContext('(' + normSrc.slice(normSrc.indexOf('function')) + ')', ctx);

    fd._normalizeMeters = normFn;
    fd._restoreCache = function (silent) {
        insideRestore = true;
        try { return restoreFn.call(this, silent); }
        finally { insideRestore = false; }
    };
    fd._initFn = initFn;
    fd._renderCalls = renderCalls;
    return fd;
}

// Данные кэша (2 расходомера, идентификаторы 1 и 3 — в избранном)
const CACHE_METERS = {
    meters: [
        { id: 1, hoz: 'Хозрасчёт №1', param: 'Расход пара', datePrev: '8/20/2026',
          dateCurr: '8/20/2026', prev: 90.11, curr: 91.11, unit: 'т',
          temp: null, gcal: 60.46, period: 'Ежедневно' },
        { id: 3, hoz: 'Хозрасчёт №3', param: 'Расход воды', datePrev: '8/20/2026',
          dateCurr: '8/20/2026', prev: 10.5, curr: 11.5, unit: 'т',
          temp: 20.1, gcal: 5.46, period: 'Еженедельно' }
    ],
    ts: 1760000000000
};

function seedFav(ctx, ids) {
    const data = {};
    ids.forEach(id => { data[String(id)] = '2026-10-01T00:00:00.000Z'; });
    ctx.localStorage.setItem('kip8_flow_fav_v1', JSON.stringify(data));
    ctx.localStorage.setItem('kip8_flow_fav_order_v1', JSON.stringify(ids.map(String)));
}

// ================================================================
// A. SRC — init(): мгновенный рендер избранного из кэша
// ================================================================
describe('Task 497 — SRC: init() показывает избранное до сервера', () => {

    test('блок Task 497 стоит ПОСЛЕ _restoreCache(silent) и ДО _loadFallback', () => {
        const initSrc = grabInit();
        assertTrue(initSrc !== null, 'init() FlowmeterData извлечён');
        const iRestore = initSrc.indexOf('this._restoreCache(silent);');
        const iBlock = initSrc.indexOf('Task 497 (баг-репорт)');
        const iFallback = initSrc.indexOf('this._loadFallback(silent);');
        assertTrue(iRestore !== -1 && iBlock !== -1 && iFallback !== -1,
            'все три маркера есть');
        assertTrue(iRestore < iBlock && iBlock < iFallback,
            'рендер избранного — после восстановления кэша, до fallback');
    });

    test('условие: silent + вкладка fav + FlowFav.count()>0 + _METERS не пуст', () => {
        const initSrc = grabInit();
        assertTrue(initSrc.indexOf("this._activeTab === 'fav'") !== -1,
            'проверка вкладки «Избранные»');
        assertTrue(initSrc.indexOf('FlowFav.count() > 0') !== -1,
            'проверка наличия избранного');
        assertTrue(initSrc.indexOf('this._METERS.length > 0') !== -1,
            'проверка заполненного кэша');
        assertTrue(initSrc.indexOf('if (silent &&') !== -1,
            'мгновенный рендер только для тихого (авторизованного) пути');
    });

    test('рендер: this.renderList() внутри блока Task 497', () => {
        const initSrc = grabInit();
        const iBlock = initSrc.indexOf('Task 497 (баг-репорт)');
        const iCond = initSrc.indexOf('if (silent &&', iBlock);
        const iRender = initSrc.indexOf('this.renderList();', iCond);
        const iEnd = initSrc.indexOf('this._loadFallback(silent);', iBlock);
        assertTrue(iCond !== -1 && iRender !== -1 && iEnd !== -1 &&
                   iCond < iRender && iRender < iEnd,
            'renderList() вызывается внутри условия до _loadFallback');
    });

    test('первый renderList() (шаг 1) и кэш-логика не тронуты', () => {
        const initSrc = grabInit();
        // порядок прежний: рендер «Загрузка…» → тихое заполнение → load()
        const iRender1 = initSrc.indexOf('this.renderList();');
        const iRestore = initSrc.indexOf('this._restoreCache(silent);');
        const iLoad = initSrc.indexOf('this.load();');
        assertTrue(iRender1 < iRestore && iRestore < iLoad,
            'порядок init: renderList → restoreCache → load');
        assertEqual(initSrc.split('this.renderList();').length - 1, 2,
            'ровно ДВА вызова renderList в init (шаг 1 + Task 497)');
        assertTrue(initSrc.indexOf('this._loadState = token ? \'loading\' : \'idle\';') !== -1,
            'установка _loadState не изменена (Task 238)');
    });
});

// ================================================================
// B. SRC — renderList(): порядок заглушек
// ================================================================
describe('Task 497 — SRC: renderList() — порядок заглушек', () => {

    test('переменные hasFav497 / favEmpty497 объявлены', () => {
        const rl = grabRenderList();
        assertTrue(rl !== null, 'renderList() FlowmeterData извлечён');
        assertTrue(rl.indexOf('var hasFav497 =') !== -1, 'hasFav497 есть');
        assertTrue(rl.indexOf('var favEmpty497 = isFavTab &&') !== -1, 'favEmpty497 есть');
        assertTrue(rl.indexOf("this._loadState === 'loading'") !== -1,
            'учёт состояния загрузки');
        assertTrue(rl.indexOf("this._loadState === 'error'") !== -1,
            'учёт состояния ошибки');
    });

    test('заглушка «Нет избранных…» — только через favEmpty497', () => {
        const rl = grabRenderList();
        // Регион заглушки: от объявления favEmpty497 до конца fav-подсказки
        const iVar = rl.indexOf('var favEmpty497 = isFavTab &&');
        const iHint = rl.indexOf('flow-empty-fav-hint');
        assertTrue(iVar !== -1 && iHint !== -1, 'маркеры региона заглушки есть');
        const stub = rl.slice(iVar, iHint + 40);
        assertFalse(stub.indexOf('if (isFavTab) {') !== -1,
            'в регионе заглушки нет голого «if (isFavTab)»');
        assertTrue(rl.indexOf('if (favEmpty497) {') !== -1,
            'условие заглушки — favEmpty497');
        // единственный оставшийся «if (isFavTab)» в renderList —
        // drag-and-drop избранного в конце метода (Task 119, не заглушка)
        const iDrag = rl.indexOf('if (isFavTab) {');
        if (iDrag !== -1) {
            const tail = rl.slice(iDrag, iDrag + 200);
            assertTrue(tail.indexOf('_attachDragHandlers') !== -1,
                'оставшийся isFavTab — drag-and-drop (Task 119), не заглушка');
        }
    });

    test('HTML заглушек не менялся (тексты прежние)', () => {
        const rl = grabRenderList();
        assertTrue(rl.indexOf('Нет избранных расходомеров') !== -1,
            'текст «Нет избранных расходомеров» на месте');
        assertTrue(rl.indexOf('flow-empty-fav-hint') !== -1,
            'подсказка «Перейдите во вкладку «Все»…» на месте');
        assertTrue(rl.indexOf('flow-loading-dots') !== -1,
            '«Загрузка данных…» с анимацией на месте');
        assertTrue(rl.indexOf('Нет связи с сервером') !== -1,
            '«Нет связи с сервером» на месте');
        assertTrue(rl.indexOf('admin-empty">Нет данных') !== -1,
            '«Нет данных» на месте');
    });

    test('границы заявки: карточки/счётчики/детали не тронуты', () => {
        const rl = grabRenderList();
        // основные элементы рендера карточек живы
        for (const chunk of [
            'this._updateTabCounts()',
            'this._getVisibleMeters()',
            'this._calcOverdueSig()',
            'flow-card-fav-btn',
            'FlowmeterData.toggleFav(',
            'FlowmeterData.openDetail('
        ]) {
            assertTrue(rl.indexOf(chunk) !== -1, 'renderList содержит: ' + chunk);
        }
    });
});

// ================================================================
// C. VM — init(): рендер избранного ДО ответа сервера
// ================================================================
describe('Task 497 — VM: init() рендерит избранное из кэша сразу', () => {

    test('авторизован + избранное + кэш → рендер [0, 2] ДО сервера', () => {
        const ctx = makeVm497('tok-497-a');
        seedFav(ctx, [1, 3]);
        ctx.localStorage.setItem('kip8_flow_cache_v1', JSON.stringify(CACHE_METERS));
        const fd = buildFlowData(ctx, {});
        fd._initFn.call(fd);
        // Шаг 1: renderList с ПУСТЫМ _METERS («Загрузка…»);
        // Task 497: renderList с кэшем (2 расходомера) — ДО load().
        assertEqual(fd._renderCalls.length, 2,
            'ровно два рендера: «Загрузка…» + мгновенное избранное');
        assertEqual(fd._renderCalls[0].meters, 0, 'первый рендер — пустой список');
        assertEqual(fd._renderCalls[1].meters, 2,
            'второй рендер — избранное из кэша (2 карточки)');
        assertFalse(fd._renderCalls[1].fromRestore,
            'второй рендер — из блока Task 497, не из _restoreCache');
        assertEqual(fd._loadCalls, 1, 'load() запущен (сервер в полёте)');
        assertEqual(fd._METERS.length, 2, '_METERS заполнен кэшем');
    });

    test('авторизован + избранное + НЕТ кэша → мгновенного рендера НЕТ', () => {
        const ctx = makeVm497('tok-497-b');
        seedFav(ctx, [1, 3]);
        // кэш не сеем — localStorage пуст
        const fd = buildFlowData(ctx, {});
        fd._initFn.call(fd);
        assertEqual(fd._renderCalls.length, 1,
            'только шаг 1 («Загрузка данных…», не «Нет избранных»)');
        assertEqual(fd._renderCalls[0].meters, 0, 'список пуст — данных нет');
    });

    test('авторизован БЕЗ избранного (вкладка «Все») → тихий путь прежний', () => {
        const ctx = makeVm497('tok-497-c');
        // FlowFav не сеем — вкладка останется «Все» (Task 491)
        ctx.localStorage.setItem('kip8_flow_cache_v1', JSON.stringify(CACHE_METERS));
        const fd = buildFlowData(ctx, {});
        fd._initFn.call(fd);
        assertEqual(fd._renderCalls.length, 1,
            'только шаг 1 — «Все» рендерится после ответа API (как прежде)');
        assertEqual(fd._activeTab, 'all', 'вкладка «Все» (Task 491)');
        assertEqual(fd._METERS.length, 2, 'кэш заполнен молча (как прежде)');
    });

    test('гость + избранное + кэш → рендер из _restoreCache(false)', () => {
        const ctx = makeVm497(null);
        seedFav(ctx, [1, 3]);
        ctx.localStorage.setItem('kip8_flow_cache_v1', JSON.stringify(CACHE_METERS));
        const fd = buildFlowData(ctx, {});
        fd._initFn.call(fd);
        assertEqual(fd._renderCalls.length, 2, 'два рендера и для гостя');
        assertTrue(fd._renderCalls[1].fromRestore,
            'второй рендер — из самого _restoreCache(false) (прогрессивный путь)');
        assertEqual(fd._renderCalls[1].meters, 2, 'избранное из кэша');
    });

    test('кэш битый (не JSON) + избранное → не падает, рендер один', () => {
        const ctx = makeVm497('tok-497-e');
        seedFav(ctx, [1, 3]);
        ctx.localStorage.setItem('kip8_flow_cache_v1', '{битый json!!!');
        const fd = buildFlowData(ctx, {});
        let ok = true;
        try { fd._initFn.call(fd); } catch (e) { ok = false; }
        assertTrue(ok, 'init не бросает исключение на битом кэше');
        assertEqual(fd._renderCalls.length, 1, 'только шаг 1 («Загрузка…»)');
    });
});

// ================================================================
// D. VM — renderList(): правильные заглушки по состояниям
// ================================================================
describe('Task 497 — VM: renderList() заглушки по состояниям', () => {

    function runRender(ctx, tab, state) {
        const container = { innerHTML: '' };
        ctx.document.getElementById = id => (id === 'flowList' ? container : { innerHTML: '' });
        const fd = {
            _activeTab: tab,
            _loadState: state,
            _METERS: [],
            _loaded: false,
            _updateTabCounts: function () {},
            _getVisibleMeters: function () { return this._METERS; },
            _calcOverdueSig: function () { return ''; }
        };
        const rlSrc = grabRenderList();
        const fn = vm.runInContext('(' + rlSrc.slice(rlSrc.indexOf('function')) + ')', ctx);
        fn.call(fd);
        return container.innerHTML;
    }

    test('fav + избранное есть + loading → «Загрузка…», НЕ «Нет избранных»', () => {
        const ctx = makeVm497(null);
        seedFav(ctx, [1, 3]);
        const html = runRender(ctx, 'fav', 'loading');
        assertTrue(html.indexOf('flow-loading') !== -1,
            'показана «Загрузка данных…»');
        assertFalse(html.indexOf('Нет избранных расходомеров') !== -1,
            '«Нет избранных расходомеров» НЕ показана (фикс бага)');
    });

    test('fav + избранное есть + error → «Нет связи», НЕ «Нет избранных»', () => {
        const ctx = makeVm497(null);
        seedFav(ctx, [1, 3]);
        const html = runRender(ctx, 'fav', 'error');
        assertTrue(html.indexOf('Нет связи с сервером') !== -1,
            'показана «Нет связи с сервером»');
        assertFalse(html.indexOf('Нет избранных расходомеров') !== -1,
            '«Нет избранных расходомеров» НЕ показана');
    });

    test('fav + избранного НЕТ + loading → «Нет избранных…» (как прежде)', () => {
        const ctx = makeVm497(null);
        const html = runRender(ctx, 'fav', 'loading');
        assertTrue(html.indexOf('Нет избранных расходомеров') !== -1,
            'заглушка «Нет избранных» при пустом FlowFav сохранена');
        assertTrue(html.indexOf('Перейдите во вкладку') !== -1,
            'подсказка «Перейдите во вкладку «Все»…» сохранена');
    });

    test('fav + избранное есть + loaded (пустой список) → «Нет избранных…»', () => {
        const ctx = makeVm497(null);
        seedFav(ctx, [1, 3]);
        const html = runRender(ctx, 'fav', 'loaded');
        assertTrue(html.indexOf('Нет избранных расходомеров') !== -1,
            'данные загружены, избранных в них нет — подсказка (как прежде)');
    });

    test('all + loading → «Загрузка…»; all + loaded → «Нет данных» (не тронуто)', () => {
        const ctx = makeVm497(null);
        const h1 = runRender(ctx, 'all', 'loading');
        assertTrue(h1.indexOf('flow-loading') !== -1, '«Все»: «Загрузка данных…»');
        const h2 = runRender(ctx, 'all', 'loaded');
        assertTrue(h2.indexOf('Нет данных') !== -1, '«Все»: «Нет данных»');
        assertFalse(h2.indexOf('Нет избранных') !== -1, '«Все»: не fav-заглушка');
    });
});

// ================================================================
// E. SW: версия кеша v721
// ================================================================
describe('Task 497 — SW: версия кеша v721', () => {

    test('SW: CACHE_VERSION = kipia-test-v743, один инкремент', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v743';") !== -1,
            'CACHE_VERSION = kipia-test-v743');
        assertFalse(SW_SRC.indexOf('kipia-test-v720') !== -1,
            'v720 в sw.js отсутствует (ровно один инкремент)');
        assertFalse(SW_SRC.indexOf('kipia-test-v744') !== -1,
            'v722 не существует (guard)');
    });

    test('SW: комментарий Task 497 в шапке версий', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v743';");
        // Task 499: комментарий плейсхолдеров диапазонов (~430 симв.)
        // отодвинул Task 497 до ~1043 — окно 900 → 1300.
        // Task 502: окно 2100 → 2400 (якорь 2251).
        const ctx = SW_SRC.slice(Math.max(0, i - 3700), i);
        assertTrue(ctx.indexOf('Task 497') !== -1, 'маркер задачи');
        assertTrue(ctx.indexOf('Расходомеры хозрасчётные') !== -1,
            'упоминание раздела');
        assertTrue(ctx.indexOf('Нет избранных') !== -1,
            'упоминание заглушки избранного');
    });
});

console.log('test-task497: все describes зарегистрированы');
