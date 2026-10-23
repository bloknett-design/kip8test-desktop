// tests/test-task536.js
// Task 536 — удаление НЕРАБОЧЕЙ серверной погоды.
// Заявка: «Через сервер погода не загружается, работает только через
//   wttr.in (напрямую из браузера), поэтому убери из кода
//   WorkSchedule.gs не рабочие строки кода связанные с погодой.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC СЕРВЕР — WorkSchedule.gs: getWeather/_parseMeteoinfo/
//      _parseOpenMeteo/authorizeWeather УДАЛЕНЫ (нет ни кодовых форм,
//      ни URL источников, ни кэша погоды); Code.gs: роутинг
//      workSchedule.getWeather УДАЛЁН с заметкой Task 536;
//      производственный календарь legalic НЕ тронут (заявка была
//      про погоду, не про весь UrlFetchApp).
//   B. SRC КЛИЕНТ — в index.html НЕТ серверного канала погоды:
//      ни вызова KipAuth.api('workSchedule.getWeather'), ни
//      подсказок authorizeWeather/appsscript.json/oauthScopes;
//      цепочка = open-meteo → wttr.in (двухканальная); заголовки
//      комментариев документируют удаление (Task 536).
//   C. VM ЦЕПОЧКА — успех open-meteo (сервер не звался); сбой OM →
//      wttr успех (сервер не звался); оба сбой → why=network,
//      причины обоих каналов, KipAuth.api НЕ вызывается вовсе;
//      отсутствие fetch в среде — тихий отказ без ошибок.
//   D. VM ПАНЕЛЬ — успех (канал/источник/наблюдение); сбой:
//      «Прямые запросы open-meteo/wttr.in не прошли» + dnote
//      (причины обоих каналов) + обещание повтора; «ещё не
//      опрошено»; НЕТ подсказок сервера.
//   E. SW — kipia-test-v757, нет забегания вперёд (v750).
//
// Запуск: через tests/run-all.js (require './test-task536.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');
const CODE_GS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'Code.gs'), 'utf8');

// ============================================================
// Утилиты (как в test-task530..535.js)
// ============================================================
function lcdModule() {
    const i = INDEX_SRC.indexOf('var WsLcdClock = {');
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('// WorkSchedule — модуль «График работы» (Task 201)', i);
    if (j === -1) return null;
    return INDEX_SRC.slice(i, j);
}

// VM-песочница клиента (fetch-мок с маршрутизацией по хосту)
function lcdSandbox(opts) {
    opts = opts || {};
    const docListeners = {};
    const sb = {
        setInterval: function () { return 1; },
        clearInterval: function () {},
        setTimeout: opts.setTimeout || function () { return 1; },
        clearTimeout: function () {},
        localStorage: {
            _s: {},
            getItem: function (k) { return (k in this._s) ? this._s[k] : null; },
            setItem: function (k, v) { this._s[k] = String(v); },
            removeItem: function (k) { delete this._s[k]; }
        },
        document: {
            addEventListener: function (type, fn) {
                (docListeners[type] = docListeners[type] || []).push(fn);
            },
            createElement: function () { return { value: '', textContent: '' }; },
            getElementById: opts.getElementById || function () { return null; },
            documentElement: {}
        },
        window: {
            addEventListener: function () {},
            devicePixelRatio: opts.dpr || 2,
            getComputedStyle: opts.getComputedStyle || function () {
                return { getPropertyValue: function (n) {
                    return ({ '--ws-lcd-bg': '#0e1a13', '--ws-lcd-seg': '#93e6a4',
                              '--ws-lcd-glow': 'none' })[n] || '';
                } };
            }
        },
        _docListeners: docListeners
    };
    if (opts.fetch) sb.fetch = opts.fetch;
    if (opts.kipAuth) sb.KipAuth = opts.kipAuth;
    vm.createContext(sb);
    vm.runInContext(lcdModule(), sb);
    return sb;
}

// моки элементов попапа (настройки информера)
function popupMocks() {
    const els = {
        wsLcdCal: { hidden: true, innerHTML: '', id: 'wsLcdCal' },
        wsLcdSet: { hidden: true, innerHTML: '', id: 'wsLcdSet' },
        wsLcdClock: { setAttribute: function () {} },
        wsLcdGear: { setAttribute: function (k, v) { this[k] = v; } }
    };
    return {
        els: els,
        getElementById: function (id) { return els[id] || null; }
    };
}

// ответ open-meteo (как в test-task532/533/534.js)
const OM_JSON = JSON.stringify({
    latitude: 55.36, longitude: 86.02, timezone: 'Asia/Novokuznetsk',
    current_units: {},
    current: {
        time: '2026-10-16T07:00', interval: 900,
        temperature_2m: -1.6, relative_humidity_2m: 73,
        surface_pressure: 1018.1, weather_code: 3,
        wind_speed_10m: 2.55, wind_direction_10m: 271
    }
});

// ответ wttr.in (format=j1&lang=ru — РЕАЛЬНЫЙ формат, Кемерово)
const WTTR_JSON = JSON.stringify({
    current_condition: [{
        temp_C: '-2', FeelsLikeC: '-6', cloudcover: '100',
        humidity: '83', observation_time: '01:51 AM',
        pressure: '1035', weatherDesc: [{ value: 'Overcast ' }],
        lang_ru: [{ value: 'Пасмурно' }],
        winddirDegree: '253', windspeedKmph: '11'
    }]
});

// fetch-мок с маршрутизацией по хосту и режимами каналов
// modes: { om: 'ok'|'fail'|'http', wttr: 'ok'|'fail'|'http' }
function routeFetch(modes, calls) {
    calls = calls || { om: 0, wttr: 0 };
    return function (url) {
        if (String(url).indexOf('open-meteo.com') !== -1) {
            calls.om++;
            if (modes.om === 'fail') {
                return Promise.reject(new Error('Failed to fetch'));
            }
            if (modes.om === 'http') {
                return Promise.resolve({ ok: false, status: 503,
                    text: function () { return Promise.resolve(''); } });
            }
            return Promise.resolve({ ok: true,
                text: function () { return Promise.resolve(OM_JSON); } });
        }
        if (String(url).indexOf('wttr.in') !== -1) {
            calls.wttr++;
            if (modes.wttr === 'fail') {
                return Promise.reject(new Error('Failed to fetch'));
            }
            if (modes.wttr === 'http') {
                return Promise.resolve({ ok: false, status: 502,
                    text: function () { return Promise.resolve(''); } });
            }
            return Promise.resolve({ ok: true,
                text: function () { return Promise.resolve(WTTR_JSON); } });
        }
        return Promise.reject(new Error('unexpected_url'));
    };
}

// ============================================================
// A. SRC СЕРВЕР — серверная погода УДАЛЕНА
// ============================================================
describe('Task 536 A: SRC — WorkSchedule.gs/Code.gs: серверной погоды НЕТ', () => {

    test('WorkSchedule.gs: НЕТ ни одной функции серверной погоды', () => {
        assertTrue(WS_GS_SRC.indexOf('getWeather: function') === -1,
            'getWeather удалён (заявка: «через сервер не загружается»)');
        assertTrue(WS_GS_SRC.indexOf('_parseMeteoinfo: function') === -1,
            '_parseMeteoinfo удалён');
        assertTrue(WS_GS_SRC.indexOf('_parseOpenMeteo: function') === -1,
            '_parseOpenMeteo удалён (парсер живёт в КЛИЕНТЕ index.html)');
        assertTrue(WS_GS_SRC.indexOf('function authorizeWeather()') === -1,
            'authorizeWeather удалена (авторизовать больше нечего)');
    });

    test('WorkSchedule.gs: НЕТ URL источников погоды и кэша', () => {
        assertTrue(WS_GS_SRC.indexOf('meteoinfo.ru/pogoda/russia/kemerovo-area/kemerovo') === -1,
            'meteoinfo.ru не запрашивается');
        assertTrue(WS_GS_SRC.indexOf('api.open-meteo.com') === -1,
            'open-meteo.com не запрашивается с сервера');
        // заметки Task 536 упоминают wttr.in ТЕКСТОМ (историческая
        // справка) — кодовых URL быть не должно
        assertTrue(WS_GS_SRC.indexOf('https://wttr.in') === -1,
            'wttr.in — ТОЛЬКО клиентский канал, URL на сервере отсутствует');
        assertTrue(WS_GS_SRC.indexOf('ws_weather_kemerovo_v1') === -1,
            'кэш погоды скрипта удалён');
        assertTrue(WS_GS_SRC.indexOf('ws_weather') === -1,
            'никаких погодных ключей кэша не осталось');
    });

    test('WorkSchedule.gs: заметки Task 536 документируют удаление', () => {
        assertTrue(WS_GS_SRC.indexOf('Task 536') !== -1,
            'заметка Task 536 есть');
        assertTrue(WS_GS_SRC.indexOf('СЕРВЕРНАЯ ПОГОДА УДАЛЕНА') !== -1,
            'формулировка «СЕРВЕРНАЯ ПОГОДА УДАЛЕНА» — сразу видно причину');
        assertTrue(WS_GS_SRC.indexOf('напрямую из браузера') !== -1,
            'подсказка: погода идёт напрямую из браузера');
    });

    test('WorkSchedule.gs: шапка-индекс эндпоинтов БЕЗ getWeather', () => {
        const head = WS_GS_SRC.slice(0, WS_GS_SRC.indexOf('getPatterns'));
        assertTrue(head.indexOf('workSchedule.getWeather') === -1,
            'строка эндпоинта getWeather удалена из индекса шапки');
        assertTrue(head.indexOf('authorizeWeather') === -1,
            'упоминание authorizeWeather удалено из шапки');
    });

    test('Code.gs: роутинг workSchedule.getWeather УДАЛЁН', () => {
        assertTrue(CODE_GS_SRC.indexOf("case 'workSchedule.getWeather':") === -1,
            'кейс маршрута удалён');
        assertTrue(CODE_GS_SRC.indexOf('WorkSchedule.getWeather(payload)') === -1,
            'вызов в doPost удалён');
        assertTrue(CODE_GS_SRC.indexOf('Task 536') !== -1,
            'заметка Task 536 объясняет удаление на месте роутинга');
    });

    test('WorkSchedule.gs: legalic-календарь НЕ тронут (это НЕ погода)', () => {
        // единственное законное место UrlFetchApp в файле — _getProdCal
        assertTrue(WS_GS_SRC.indexOf('_getProdCal: function') !== -1,
            '_getProdCal на месте');
        assertTrue(WS_GS_SRC.indexOf('_LEGALIC_URL') !== -1, 'legalic URL на месте');
        assertTrue(WS_GS_SRC.indexOf('ws_prodcal_') !== -1, 'кэш prodcal на месте');
    });

});

// ============================================================
// B. SRC КЛИЕНТ — только прямые каналы, серверного кода НЕТ
// ============================================================
describe('Task 536 B: SRC — клиент: только open-meteo → wttr.in', () => {

    test('клиент НЕ содержит вызова серверного эндпоинта погоды', () => {
        const m = lcdModule();
        assertTrue(m.indexOf("KipAuth.api('workSchedule.getWeather'") === -1,
            'вызов KipAuth.api удалён из WsLcdClock');
        assertTrue(INDEX_SRC.indexOf("KipAuth.api('workSchedule.getWeather'") === -1,
            'вызов удалён из ВСЕГО index.html');
    });

    test('клиент НЕ содержит подсказок серверной авторизации', () => {
        const m = lcdModule();
        assertTrue(m.indexOf('authorizeWeather') === -1,
            'authorizeWeather не упоминается в WsLcdClock');
        assertTrue(m.indexOf('appsscript.json') === -1,
            'манифест appsscript.json не упоминается');
        assertTrue(m.indexOf('oauthScopes') === -1,
            'массив oauthScopes не упоминается');
        // примечание: script.external_request упоминается только в
        // КОММЕНТАРИЯХ-заметках Task 536 (историческая причина) — это не
        // подсказка пользователю; проверяем отсутствие ПОДСКАЗОЧНЫХ фраз
        assertTrue(m.indexOf('добавьте область') === -1,
            'инструкции «добавьте область» больше нет');
        assertTrue(m.indexOf('запустите authorizeWeather') === -1,
            'инструкции запуска authorizeWeather больше нет');
    });

    test('клиент: НЕТ серверной ветки в _weatherOk', () => {
        const m = lcdModule();
        const iOk = m.indexOf('_weatherOk: function');
        const okChunk = m.slice(iOk, m.indexOf('_loadWeather: function', iOk));
        assertTrue(okChunk.indexOf("via === 'server'") === -1,
            'ветка via === \'server\' удалена');
        assertTrue(okChunk.indexOf('через Apps Script') === -1,
            'пометка «через Apps Script» удалена');
        assertTrue(okChunk.indexOf("via === 'direct' || via === 'wttr'") !== -1,
            'прямые каналы помечаются «напрямую из браузера» (как прежде)');
    });

    test('клиент: НЕТ серверного резерва в _loadWeather', () => {
        const m = lcdModule();
        const lw = m.indexOf('_loadWeather: function');
        const lwChunk = m.slice(lw, m.indexOf('_weatherNow: function', lw));
        assertTrue(lwChunk.indexOf('KipAuth') === -1,
            'в _loadWeather НЕТ обращений к KipAuth (сервер не звался бы)');
        assertTrue(lwChunk.indexOf('canServer') === -1,
            'проверка canServer удалена');
        assertTrue(lwChunk.indexOf("why: 'no-endpoint'") === -1,
            'состояние no-endpoint удалено (эндпоинта больше нет)');
        assertTrue(lwChunk.indexOf("why: 'server'") === -1,
            'состояние server удалено');
        assertTrue(lwChunk.indexOf("why: 'network'") !== -1,
            'сбой обоих каналов → why=network (Task 536)');
        assertTrue(lwChunk.indexOf('wttr: wmsg') !== -1,
            'причина wttr-сбоя сохраняется в diag');
    });

    test('клиент: порядок каналов open-meteo → wttr.in (два, не три)', () => {
        const m = lcdModule();
        const lw = m.indexOf('_loadWeather: function');
        const lwChunk = m.slice(lw, m.indexOf('_weatherNow: function', lw));
        const iOm = lwChunk.indexOf('_fetchWeatherDirect()');
        const iWttr = lwChunk.indexOf('_fetchWttr()');
        assertTrue(iOm !== -1 && iWttr !== -1, 'оба прямых канала есть');
        assertTrue(iOm < iWttr, 'open-meteo ПЕРВЫМ, wttr — резерв');
        // серверного третьего канала нет — двухканальная цепочка
        assertTrue(lwChunk.indexOf('_fetchWeatherDirect()') ===
                   lwChunk.lastIndexOf('_fetchWeatherDirect()'),
            'прямой канал вызывается один раз');
    });

    test('клиент: статусы панели БЕЗ серверных веток', () => {
        const m = lcdModule();
        const i = m.indexOf('var wd = this._weatherDiag;');
        const chunk = m.slice(i, m.indexOf("'<div class=\"ws-lcd-set-wstat\"", i));
        assertTrue(chunk.indexOf("why === 'no-endpoint'") === -1,
            'ветка no-endpoint удалена');
        assertTrue(chunk.indexOf("why === 'server'") === -1,
            'ветка server удалена');
        assertTrue(chunk.indexOf("why === 'network'") === -1,
            'Task 536: любая неудача опроса — единая ветка сбоя');
        assertTrue(chunk.indexOf('wd.ok') !== -1,
            'ветка успеха осталась');
        assertTrue(chunk.indexOf('Прямые запросы open-meteo/wttr.in не прошли') !== -1,
            'формулировка сбоя прямых каналов');
        assertTrue(chunk.indexOf('Ещё не опрошено') !== -1,
            'состояние «ещё не опрошено» осталось');
    });

    test('клиент: комментарии документируют удаление (Task 536)', () => {
        const m = lcdModule();
        assertTrue(m.indexOf('Task 536') !== -1,
            'комментарий Task 536 в модуле WsLcdClock');
        const lw = m.indexOf('_loadWeather: function');
        const lwHead = m.slice(m.lastIndexOf('// загрузка:', lw),
                                m.indexOf('_loadWeather: function', m.lastIndexOf('// загрузка:', lw)));
        assertTrue(lwHead.indexOf('серверного резерва НЕТ') !== -1,
            'заголовок _loadWeather: «серверного резерва НЕТ»');
    });

});

// ============================================================
// C. VM ЦЕПОЧКА — двухканальная погода без сервера
// ============================================================
describe('Task 536 C: VM — цепочка open-meteo → wttr.in (без сервера)', () => {

    test('успех open-meteo: канал direct, сервер НЕ звался', () => {
        const calls = { om: 0, wttr: 0 };
        let apiCalls = 0;
        const sb = lcdSandbox({
            fetch: routeFetch({ om: 'ok', wttr: 'fail' }, calls),
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () { apiCalls++; return Promise.resolve({ temp: 99 }); }
            }
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(calls.om, 1, 'open-meteo звался первым');
                assertEqual(calls.wttr, 0, 'wttr НЕ звался (успех первым каналом)');
                assertEqual(apiCalls, 0, 'KipAuth.api НЕ звался (Task 536)');
                assertEqual(sb.WsLcdClock._weatherDiag.ok, true, 'diag ok');
                assertEqual(sb.WsLcdClock._weatherDiag.via, 'direct', 'канал — direct');
                assertEqual(sb.WsLcdClock._weather.tempTxt, '-2°',
                    'экран: −1.6 округляется до −2');
                resolve();
            }, 20);
        });
    });

    test('сбой open-meteo → wttr успех: канал wttr, сервер НЕ звался', () => {
        const calls = { om: 0, wttr: 0 };
        let apiCalls = 0;
        const sb = lcdSandbox({
            fetch: routeFetch({ om: 'fail', wttr: 'ok' }, calls),
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () { apiCalls++; return Promise.resolve({ temp: 99 }); }
            }
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(calls.om, 1, 'open-meteo пробован первым');
                assertEqual(calls.wttr, 1, 'wttr.in подключился вторым');
                assertEqual(apiCalls, 0, 'сервер НЕ звался (заявка: только wttr.in)');
                assertEqual(sb.WsLcdClock._weatherDiag.via, 'wttr', 'канал — wttr');
                assertEqual(sb.WsLcdClock._weatherDiag.source,
                    'wttr.in (напрямую из браузера)', 'источник помечен каналом');
                assertEqual(sb.WsLcdClock._weather.tempTxt, '-2°', 'экран: −2° (wttr)');
                const c = JSON.parse(sb.localStorage._s['kip8_ws_weather_v1']);
                assertEqual(c.data.temp, -2, 'кэш записан с ответом wttr.in');
                resolve();
            }, 20);
        });
    });

    test('оба канала пали → why=network, причины обоих, тихий «--»', () => {
        let apiCalls = 0;
        const sb = lcdSandbox({
            fetch: routeFetch({ om: 'fail', wttr: 'fail' }),
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () { apiCalls++; return Promise.resolve({ temp: -12 }); }
            }
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(apiCalls, 0, 'KipAuth.api НЕ звался — резерва нет (Task 536)');
                assertEqual(sb.WsLcdClock._weatherDiag.ok, false, 'не ok');
                assertEqual(sb.WsLcdClock._weatherDiag.why, 'network', 'сетевая причина');
                assertEqual(sb.WsLcdClock._weatherDiag.direct, 'Failed to fetch',
                    'сбой open-meteo сохранён');
                assertEqual(sb.WsLcdClock._weatherDiag.wttr, 'Failed to fetch',
                    'сбой wttr.in сохранён');
                assertEqual(sb.WsLcdClock._weather, null, 'экран: тихий прочерк');
                resolve();
            }, 20);
        });
    });

    test('HTTP-сбои различимы по каналам (503/502)', () => {
        const sb = lcdSandbox({
            fetch: routeFetch({ om: 'http', wttr: 'http' })
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(sb.WsLcdClock._weatherDiag.direct, 'http_503',
                    'open-meteo: http_503');
                assertEqual(sb.WsLcdClock._weatherDiag.wttr, 'http_502',
                    'wttr.in: http_502');
                resolve();
            }, 20);
        });
    });

    test('нет fetch в среде — тихий отказ, никаких исключений', () => {
        // старые среды без fetch: оба канала тихо отказывают (no_fetch)
        const sb = lcdSandbox({});       // БЕЗ fetch и БЕЗ KipAuth
        let threw = false;
        try { sb.WsLcdClock._loadWeather(true); }
        catch (e) { threw = true; }
        assertFalse(threw, 'синхронного исключения нет');
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(sb.WsLcdClock._weather, null, 'погода не установлена');
                assertEqual(sb.WsLcdClock._weatherDiag.why, 'network',
                    'тихая диагностика no_fetch');
                assertEqual(sb.WsLcdClock._weatherDiag.direct, 'no_fetch',
                    'причина open-meteo — нет fetch');
                assertEqual(sb.WsLcdClock._weatherDiag.wttr, 'no_fetch',
                    'причина wttr — нет fetch');
                resolve();
            }, 20);
        });
    });

    test('успех перерисовывает ОТКРЫТУЮ панель настроек', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({
            getElementById: pm.getElementById,
            fetch: routeFetch({ om: 'ok' })
        });
        sb.WsLcdClock._setOpen = true;
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertTrue(pm.els.wsLcdSet.innerHTML.indexOf(
                    'Есть данные: -2° — open-meteo.com (напрямую из браузера)') !== -1,
                    'панель обновлена по факту ответа');
                resolve();
            }, 20);
        });
    });

});

// ============================================================
// D. VM ПАНЕЛЬ — статусы без серверных подсказок
// ============================================================
describe('Task 536 D: VM — панель настроек (статусы погоды)', () => {

    test('успех — источник/канал/наблюдение', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        sb.WsLcdClock._weatherDiag = { ok: true, txt: '-1°', via: 'wttr',
            source: 'wttr.in (напрямую из браузера)', obs: '10:39' };
        sb.WsLcdClock._renderSettings();
        assertTrue(pm.els.wsLcdSet.innerHTML.indexOf(
            'Есть данные: -1° — wttr.in (напрямую из браузера) (набл. 10:39)') !== -1,
            'статус как в заявке пользователя: «Есть данные: -1° — wttr.in»');
    });

    test('сбой — формулировка прямых каналов + dnote + повтор', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        sb.WsLcdClock._weatherDiag = { ok: false, why: 'network',
            direct: 'Failed to fetch', wttr: 'Failed to fetch' };
        sb.WsLcdClock._renderSettings();
        const html = pm.els.wsLcdSet.innerHTML;
        assertTrue(html.indexOf('Прямые запросы open-meteo/wttr.in не прошли') !== -1,
            'формулировка сбоя');
        assertTrue(html.indexOf(
            '(прямой запрос: open-meteo: Failed to fetch; wttr.in: Failed to fetch)') !== -1,
            'причины ОБЕИХ каналов в dnote');
        assertTrue(html.indexOf('Повтор — по расписанию или кнопкой ниже') !== -1,
            'обещание повтора');
        assertTrue(html.indexOf('ws-lcd-set-wstat warn') !== -1, 'варнинг-стиль');
    });

    test('сбой БЕЗ diag-полей — тоже варнинг (устойчивость)', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        sb.WsLcdClock._weatherDiag = { ok: false };   // минимальный/чужой diag
        sb.WsLcdClock._renderSettings();
        const html = pm.els.wsLcdSet.innerHTML;
        assertTrue(html.indexOf('Прямые запросы open-meteo/wttr.in не прошли') !== -1,
            'любой сбойный diag — единая ветка сбоя (не «ещё не опрошено»)');
        assertTrue(html.indexOf('ws-lcd-set-wstat warn') !== -1, 'варнинг-стиль');
    });

    test('null diag — «ещё не опрошено» (muted)', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        sb.WsLcdClock._weatherDiag = null;
        sb.WsLcdClock._renderSettings();
        const html = pm.els.wsLcdSet.innerHTML;
        assertTrue(html.indexOf('Ещё не опрошено') !== -1, 'статус ожидания');
        assertTrue(html.indexOf('ws-lcd-set-wstat muted') !== -1, 'muted-стиль');
    });

    test('НЕТ подсказок сервера ни в одном статусе', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        const diags = [
            { ok: true, txt: '-1°', source: 'wttr.in (напрямую из браузера)', obs: '10:39' },
            { ok: false, why: 'network', direct: 'x', wttr: 'y' },
            { ok: false, why: 'server', diag: 'нет разрешения UrlFetchApp' },
            null
        ];
        diags.forEach(function (d) {
            sb.WsLcdClock._weatherDiag = d;
            sb.WsLcdClock._renderSettings();
            const html = pm.els.wsLcdSet.innerHTML;
            assertTrue(html.indexOf('authorizeWeather') === -1,
                'authorizeWeather не упоминается');
            assertTrue(html.indexOf('appsscript.json') === -1,
                'манифест не упоминается');
            assertTrue(html.indexOf('oauthScopes') === -1, 'oauthScopes нет');
            assertTrue(html.indexOf('сервер не знает эндпоинт') === -1,
                'подсказка «сервер не знает эндпоинт» удалена');
        });
    });

});

// ============================================================
// E. SW — версия кеша
// ============================================================
describe('Task 536 E: SW — версия кеша', () => {

    test('SW: kipia-test-v757, забегания вперёд нет (v750)', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v757'") !== -1,
            'CACHE_VERSION = kipia-test-v757');
        assertTrue(SW_SRC.indexOf('kipia-test-v758') === -1, 'v750 не появилась');
        assertTrue(SW_SRC.indexOf('kipia-test-v748') === -1, 'v748 убрана');
    });

});
