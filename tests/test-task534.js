// tests/test-task534.js
// Task 534 — LCD-информер Табеля: погода — ДВА прямых канала (open-meteo
//   → wttr.in → сервер), подсказка authorizeWeather при «нет разрешения
//   UrlFetchApp»; календарь: строки головы ПО ЛЕВОМУ КРАЮ, подписи
//   «Год»/«Месяц» УБРАНЫ, шрифт строки месяца немного мельче года.
// Заявка: «Погода не работает "Источники не дали данных (прямой
//   запрос: Failed to fetch); сервер: meteoinfo:exception:У вас нет
//   разрешения на вызов функции "UrlFetchApp.fetch". Т; open-meteo:
//   exception:У вас нет разрешения…". В календаре, кнопки с годом
//   выравняй по левому краю, надписи "Год" и "Месяц" убери, шрифт в
//   кнопках месяца сделай немного меньше чем в годе.»
// Адаптация Task 536 (заявка: «через сервер погода не загружается»):
//   серверный резерв и подсказки authorizeWeather УДАЛЕНЫ — остались
//   только прямые каналы open-meteo → wttr.in.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — второй прямой канал wttr.in (WT_URL, _parseWttr,
//      _fetchWttr), порядок каналов в _loadWeather (open-meteo →
//      wttr; сервер УДАЛЁН — Task 536), календарь без подписей +
//      левое выравнивание + шрифт, WorkSchedule.gs: серверная погода
//      УДАЛЕНА, SW kipia-test-v756.
//   B. VM ПОГОДА — _parseWttr (поля/lang_ru/EN-слова/cloudcover/
//      AM-PM → +7/мусор); цепочка: успех open-meteo → wttr НЕ звётся;
//      сбой open-meteo → wttr успех; оба сбой → why=network, сервер
//      НЕ звётся (Task 536); панель: успех wttr, dnote с обоими
//      каналами, БЕЗ подсказок сервера.
//   C. VM КАЛЕНДАРЬ — подписей нет, порядок год → месяц → сетка,
//      4 стрелки, «Сегодня» в строке месяца, 12 опций, _calSetMonth.
//   D. SW — kipia-test-v756, нет забегания вперёд (v748).
//
// Запуск: через tests/run-all.js (require './test-task534.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');

// ============================================================
// Утилиты (как в test-task530/531/532/533.js)
// ============================================================
function lcdModule() {
    const i = INDEX_SRC.indexOf('var WsLcdClock = {');
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('// WorkSchedule — модуль «График работы» (Task 201)', i);
    if (j === -1) return null;
    return INDEX_SRC.slice(i, j);
}

function cssBlock() {
    const i = INDEX_SRC.indexOf('/* === Task 529');
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('/* Task 315: строка 1 бара', i);
    return INDEX_SRC.slice(i, j === -1 ? INDEX_SRC.length : j);
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

// моки элементов попапа (календарь + настройки + кнопки)
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

// ответ open-meteo (как в test-task532/533.js)
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
        temp_C: '-2', FeelsLikeC: '-6', temp_F: '28',
        cloudcover: '100', humidity: '83',
        observation_time: '01:51 AM',
        precipMM: '0.0', pressure: '1035', pressureInches: '30.6',
        uvIndex: '0', visibility: '8', weatherCode: '116',
        weatherDesc: [{ value: 'Overcast ' }],
        lang_ru: [{ value: 'Пасмурно' }],
        winddir16Point: 'WSW', winddirDegree: '253',
        windspeedKmph: '11', windspeedMiles: '7'
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

const MN = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
            'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

// ============================================================
// A. SRC — второй канал wttr.in, подсказка, календарь, сервер
// ============================================================
describe('Task 534 A: SRC — wttr.in, подсказка authorizeWeather, календарь', () => {

    test('SRC: WT_URL — wttr.in (j1 + русская локализация) в КЛИЕНТЕ', () => {
        const m = lcdModule();
        assertTrue(m.indexOf("WT_URL: 'https://wttr.in/Kemerovo?format=j1&lang=ru'") !== -1,
            'константа WT_URL объявлена (Кемерово, j1, lang=ru)');
    });

    test('SRC: клиентский парсер _parseWttr (источник/м/с/гПа→мм)', () => {
        const m = lcdModule();
        assertTrue(m.indexOf('_parseWttr: function') !== -1, 'парсер есть');
        assertTrue(m.indexOf("source: 'wttr.in'") !== -1, 'источник подписан');
        const i = m.indexOf('_parseWttr: function');
        const chunk = m.slice(i, m.indexOf('_fetchWeatherDirect', i));
        assertTrue(chunk.indexOf('/ 3.6') !== -1, 'км/ч → м/с (÷3.6)');
        assertTrue(chunk.indexOf('/ 1.33322') !== -1, 'гПа → мм рт.ст.');
        assertTrue(chunk.indexOf('% 12 +') !== -1, 'AM/PM → 24 ч');
    });

    test('SRC: _fetchWttr — fetch(WT_URL) напрямую, no_fetch в старых средах', () => {
        const m = lcdModule();
        const i = m.indexOf('_fetchWttr: function');
        assertTrue(i !== -1, '_fetchWttr определён');
        const chunk = m.slice(i, m.indexOf('},', i) + 2);
        assertTrue(chunk.indexOf('fetch(this.WT_URL') !== -1,
            'запрос идёт НАПРЯМУЮ (fetch), не через KipAuth.api');
        assertTrue(chunk.indexOf('no_fetch') !== -1, 'нет fetch — тихий отказ');
        assertTrue(chunk.indexOf('_parseWttr') !== -1, 'разбор ответа');
    });

    test('SRC: порядок каналов _loadWeather — open-meteo → wttr.in (сервер удалён — Task 536)', () => {
        const m = lcdModule();
        const lw = m.indexOf('_loadWeather: function');
        const lwChunk = m.slice(lw, m.indexOf('_weatherNow: function', lw));
        const iOm = lwChunk.indexOf('_fetchWeatherDirect()');
        const iWttr = lwChunk.indexOf('_fetchWttr()');
        assertTrue(iOm !== -1 && iWttr !== -1, 'оба прямых канала есть');
        assertTrue(iOm < iWttr,
            'open-meteo ПЕРВЫМ → wttr.in ВТОРЫМ (резерв)');
        assertTrue(lwChunk.indexOf("KipAuth.api('workSchedule.getWeather'") === -1,
            'серверного канала НЕТ (Task 536: «через сервер не загружается»)');
    });

    test('SRC: _weatherOk помечает wttr «напрямую из браузера»', () => {
        const m = lcdModule();
        const iOk = m.indexOf('_weatherOk: function');
        const okChunk = m.slice(iOk, m.indexOf('_loadWeather: function', iOk));
        assertTrue(okChunk.indexOf("via === 'direct' || via === 'wttr'") !== -1,
            'wttr — прямой канал (как direct)');
        assertTrue(okChunk.indexOf('напрямую из браузера') !== -1, 'пометка канала');
        assertTrue(okChunk.indexOf('через Apps Script') === -1,
            'серверной пометки больше НЕТ (Task 536)');
    });

    test('SRC: dnote в статусе собирает ОБА прямых канала', () => {
        const m = lcdModule();
        const i = m.indexOf('var wd = this._weatherDiag;');
        const chunk = m.slice(i, m.indexOf("'<div class=\"ws-lcd-set-wstat'", i));
        assertTrue(chunk.indexOf("'open-meteo: ' + wd.direct") !== -1,
            'причина open-meteo выводится');
        assertTrue(chunk.indexOf("'wttr.in: ' + wd.wttr") !== -1,
            'причина wttr.in выводится');
    });

    test('SRC: подсказки authorizeWeather УДАЛЕНЫ из панели (Task 536)', () => {
        const m = lcdModule();
        const i = m.indexOf('var wd = this._weatherDiag;');
        const chunk = m.slice(i, m.indexOf("'<div class=\"ws-lcd-set-wstat'", i));
        assertTrue(chunk.indexOf('нет разрешения|UrlFetchApp') === -1,
            'распознавание ошибки авторизации сервера удалено (сервера нет)');
        assertTrue(chunk.indexOf('authorizeWeather()') === -1,
            'подсказки про authorizeWeather больше НЕТ');
        assertTrue(chunk.indexOf('oauthScopes') === -1,
            'подсказки про манифест appsscript.json больше НЕТ');
    });

    test('SRC: календарь — подписей «Год»/«Месяц» НЕТ (рендер и CSS)', () => {
        const m = lcdModule();
        const i = m.indexOf('_renderCal: function');
        const chunk = m.slice(i, m.indexOf('_calPick', i));
        assertTrue(chunk.indexOf('ws-lcd-cal-yearlbl') === -1 &&
                   chunk.indexOf('ws-lcd-cal-monthlbl') === -1,
            'спаны подписей не генерируются');
        const css = cssBlock();
        assertTrue(css.indexOf('.ws-lcd-cal-yearlbl') === -1 &&
                   css.indexOf('.ws-lcd-cal-monthlbl') === -1,
            'CSS-правила подписей удалены');
    });

    test('SRC: строки года И месяца — ПО ЛЕВОМУ КРАЮ (justify-content)', () => {
        const css = cssBlock();
        const iY = css.indexOf('.ws-lcd-cal-year {');
        const yChunk = css.slice(iY, css.indexOf('}', iY) + 1);
        assertTrue(yChunk.indexOf('justify-content: flex-start') !== -1,
            'строка года — слева (заявка: «по левому краю»)');
        const iM = css.indexOf('.ws-lcd-cal-month {');
        const mChunk = css.slice(iM, css.indexOf('}', iM) + 1);
        assertTrue(mChunk.indexOf('justify-content: flex-start') !== -1,
            'строка месяца — тоже слева (единый левый край)');
    });

    test('SRC: шрифт строки месяца — немного мельче года', () => {
        const css = cssBlock();
        // селект года 13px (база), селект месяца 12px
        const iSel = css.indexOf('.ws-lcd-cal-year select, .ws-lcd-cal-month select {');
        const selChunk = css.slice(iSel, css.indexOf('}', iSel) + 1);
        assertTrue(selChunk.indexOf('font-size: 13px') !== -1, 'база селектов 13px');
        const iM = css.indexOf('.ws-lcd-cal-month select { font-size: 12px; }');
        assertTrue(iM !== -1, 'селект месяца — 12px < 13px');
        // стрелки месяца 15px < 16px; «Сегодня» 12px < 13px
        assertTrue(css.indexOf('.ws-lcd-cal-month .ws-lcd-cal-nav { font-size: 15px; }') !== -1,
            'стрелки месяца — 15px (году осталось 16px)');
        assertTrue(css.indexOf('.ws-lcd-cal-month .ws-lcd-cal-today { font-size: 12px; }') !== -1,
            '«Сегодня» в строке месяца — 12px');
    });

    test('SRC: WorkSchedule.gs — authorizeWeather УДАЛЕНА (Task 536)', () => {
        assertTrue(/^function authorizeWeather\(\) \{/m.test(WS_GS_SRC) === false,
            'топ-уровневая функция удалена (серверных запросов погоды больше нет)');
        assertTrue(WS_GS_SRC.indexOf('meteoinfo.ru/pogoda/russia/kemerovo-area/kemerovo') === -1,
            'meteoinfo.ru больше НЕ пробуется с сервера');
        assertTrue(WS_GS_SRC.indexOf('api.open-meteo.com/v1/forecast') === -1,
            'open-meteo.com больше НЕ пробуется с сервера');
        assertTrue(WS_GS_SRC.indexOf('Task 536') !== -1,
            'заметка Task 536 объясняет удаление');
    });

    test('SRC: WorkSchedule.gs — diag-исключения погоды УДАЛЕНЫ (Task 536)', () => {
        // было slice(0, 90) у meteoinfo/open-meteo попыток — вместе с getWeather
        assertTrue(WS_GS_SRC.indexOf('e).slice(0, 90)') === -1, 'срез 90 (meteoinfo) удалён');
        assertTrue(WS_GS_SRC.indexOf('e4).slice(0, 90)') === -1, 'срез 90 (open-meteo) удалён');
        assertTrue(WS_GS_SRC.indexOf('var tries') === -1,
            'накопитель diag-попыток удалён вместе с getWeather');
    });

});

// ============================================================
// B-1. VM — клиентский _parseWttr
// ============================================================
describe('Task 534 B-1: VM — _parseWttr', () => {

    test('полный JSON (lang_ru) — все поля', () => {
        const sb = lcdSandbox();
        const d = sb.WsLcdClock._parseWttr(WTTR_JSON);
        assertTrue(!!d, 'данные разобраны');
        assertEqual(d.temp, -2, 'температура');
        assertEqual(d.phenomenon, 'Пасмурно', 'явление — русское из lang_ru');
        assertEqual(d.cloud, 10, 'балл облачности (cloudcover 100%)');
        assertEqual(d.wind, 3.1, 'ветер м/с (11 км/ч ÷ 3.6 = 3.1)');
        assertEqual(d.windDir, 'З', 'румб (253° → Запад)');
        assertEqual(d.pressure, 776, 'давление мм рт.ст. (1035 гПа)');
        assertEqual(d.humidity, 83, 'влажность');
        assertEqual(d.obsLocal, '08:51', 'наблюдение UTC 01:51 → местное 08:51');
        assertEqual(d.source, 'wttr.in', 'источник');
    });

    test('EN-описания без lang_ru → русские явления', () => {
        const sb = lcdSandbox();
        const mk = function (desc) {
            return JSON.stringify({ current_condition: [{
                temp_C: '1', weatherDesc: [{ value: desc }],
                cloudcover: '0', observation_time: '06:00 AM'
            }] });
        };
        assertEqual(sb.WsLcdClock._parseWttr(mk('Sunny')).phenomenon, 'Ясно', 'Sunny');
        assertEqual(sb.WsLcdClock._parseWttr(mk('Partly cloudy')).phenomenon,
            'Переменная облачность', 'Partly cloudy');
        assertEqual(sb.WsLcdClock._parseWttr(mk('Overcast')).phenomenon, 'Пасмурно', 'Overcast');
        assertEqual(sb.WsLcdClock._parseWttr(mk('Light snow')).phenomenon, 'Снег', 'Light snow');
        assertEqual(sb.WsLcdClock._parseWttr(mk('Moderate rain')).phenomenon, 'Дождь', 'rain');
        assertEqual(sb.WsLcdClock._parseWttr(mk('Patchy light drizzle')).phenomenon, 'Морось', 'drizzle');
        assertEqual(sb.WsLcdClock._parseWttr(mk('Mist')).phenomenon, 'Туман', 'Mist');
        assertEqual(sb.WsLcdClock._parseWttr(mk('Thundery outbreaks in nearby')).phenomenon,
            'Гроза', 'thunder');
    });

    test('cloudcover % → балл 0..10 (авторитетнее описания)', () => {
        const sb = lcdSandbox();
        const mk = function (pct) {
            return JSON.stringify({ current_condition: [{
                temp_C: '0', weatherDesc: [{ value: 'Sunny' }],
                cloudcover: String(pct), observation_time: '06:00 AM'
            }] });
        };
        assertEqual(sb.WsLcdClock._parseWttr(mk(0)).cloud, 0, '0% → 0');
        assertEqual(sb.WsLcdClock._parseWttr(mk(30)).cloud, 3, '30% → 3');
        assertEqual(sb.WsLcdClock._parseWttr(mk(55)).cloud, 6, '55% → 6');
        assertEqual(sb.WsLcdClock._parseWttr(mk(100)).cloud, 10, '100% → 10');
        // без cloudcover — балл из EN-описания
        const noC = JSON.stringify({ current_condition: [{
            temp_C: '0', weatherDesc: [{ value: 'Sunny' }],
            observation_time: '06:00 AM' }] });
        assertEqual(sb.WsLcdClock._parseWttr(noC).cloud, 0, 'нет cloudcover → Sunny = 0');
    });

    test('observation_time AM/PM → местное (+7), граничные случаи', () => {
        const sb = lcdSandbox();
        const mk = function (t) {
            return JSON.stringify({ current_condition: [{
                temp_C: '0', weatherDesc: [{ value: 'Clear' }],
                cloudcover: '0', observation_time: t }] });
        };
        assertEqual(sb.WsLcdClock._parseWttr(mk('01:51 AM')).obsLocal, '08:51', '01:51 AM');
        assertEqual(sb.WsLcdClock._parseWttr(mk('11:30 PM')).obsLocal, '06:30', '11:30 PM → +7 через полночь');
        assertEqual(sb.WsLcdClock._parseWttr(mk('12:05 AM')).obsLocal, '07:05', '12:05 AM (полночь)');
        assertEqual(sb.WsLcdClock._parseWttr(mk('12:40 PM')).obsLocal, '19:40', '12:40 PM (полдень)');
        assertEqual(sb.WsLcdClock._parseWttr(mk('нет времени')).obsLocal, null, 'мусор → null');
    });

    test('мусор / нет температуры → null (тихий отказ)', () => {
        const sb = lcdSandbox();
        assertEqual(sb.WsLcdClock._parseWttr('не json'), null, 'мусор');
        assertEqual(sb.WsLcdClock._parseWttr('{}'), null, 'пустой объект');
        assertEqual(sb.WsLcdClock._parseWttr(
            JSON.stringify({ current_condition: [{ weatherDesc: [] }] })), null,
            'нет temp_C');
        assertEqual(sb.WsLcdClock._parseWttr(''), null, 'пустая строка');
    });

});

// ============================================================
// B-2. VM — цепочка каналов в _loadWeather
// ============================================================
describe('Task 534 B-2: VM — цепочка open-meteo → wttr.in → сервер', () => {

    test('успех open-meteo → wttr.in НЕ зовётся (лишний канал не дёргается)', () => {
        const calls = { om: 0, wttr: 0 };
        let apiCalls = 0;
        const sb = lcdSandbox({
            fetch: routeFetch({ om: 'ok' }, calls),
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () { apiCalls++; return Promise.resolve({ temp: 5 }); }
            }
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(calls.om, 1, 'open-meteo опрошен');
                assertEqual(calls.wttr, 0, 'wttr.in НЕ звался (успех первым каналом)');
                assertEqual(apiCalls, 0, 'сервер НЕ звался');
                assertEqual(sb.WsLcdClock._weatherDiag.via, 'direct', 'канал — direct');
                resolve();
            }, 20);
        });
    });

    test('сбой open-meteo → успех wttr.in: сервер НЕ звался, канал wttr', () => {
        const calls = { om: 0, wttr: 0 };
        let apiCalls = 0;
        const sb = lcdSandbox({
            fetch: routeFetch({ om: 'fail', wttr: 'ok' }, calls),
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () { apiCalls++; return Promise.resolve({ temp: 5 }); }
            }
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(calls.om, 1, 'open-meteo пробован первым');
                assertEqual(calls.wttr, 1, 'wttr.in подключился вторым');
                assertEqual(apiCalls, 0, 'сервер НЕ звался (заявка: без скрипта)');
                assertEqual(sb.WsLcdClock._weatherDiag.ok, true, 'diag ok');
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

    test('wttr.in БЕЗ авторизации — погода не требует токен', () => {
        const calls = { om: 0, wttr: 0 };
        const sb = lcdSandbox({
            fetch: routeFetch({ om: 'fail', wttr: 'ok' }, calls)
            // KipAuth НЕ задан — как у неавторизованного пользователя
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(sb.WsLcdClock._weatherDiag.ok, true, 'diag ok без токена');
                assertEqual(sb.WsLcdClock._weatherDiag.via, 'wttr', 'канал — wttr');
                resolve();
            }, 20);
        });
    });

    test('HTTP-сбои обоих каналов без авторизации — diag network с ОБЕИМИ причинами', () => {
        const sb = lcdSandbox({
            fetch: routeFetch({ om: 'http', wttr: 'http' })
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(sb.WsLcdClock._weatherDiag.ok, false, 'не ok');
                assertEqual(sb.WsLcdClock._weatherDiag.why, 'network', 'сетевая причина');
                assertEqual(sb.WsLcdClock._weatherDiag.direct, 'http_503',
                    'open-meteo: http_503');
                assertEqual(sb.WsLcdClock._weatherDiag.wttr, 'http_502',
                    'wttr.in: http_502 (разные коды — каналы различимы)');
                resolve();
            }, 20);
        });
    });

    test('оба канала пали → why=network, сервер НЕ звался (Task 536)', () => {
        const calls = { om: 0, wttr: 0 };
        let apiCalls = 0;
        const sb = lcdSandbox({
            fetch: routeFetch({ om: 'fail', wttr: 'fail' }, calls),
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () {
                    apiCalls++;
                    return Promise.resolve({ temp: -12, cloud: 9,
                                             source: 'meteoinfo.ru',
                                             obsLocal: '16 октября, 04:00' });
                }
            }
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(apiCalls, 0,
                    'серверный резерв УДАЛЁН — KipAuth.api не зовётся (Task 536)');
                assertEqual(sb.WsLcdClock._weatherDiag.ok, false, 'не ok');
                assertEqual(sb.WsLcdClock._weatherDiag.why, 'network',
                    'любая неудача = network (сервера нет)');
                assertEqual(sb.WsLcdClock._weatherDiag.direct, 'Failed to fetch',
                    'сбой open-meteo сохранён');
                assertEqual(sb.WsLcdClock._weatherDiag.wttr, 'Failed to fetch',
                    'сбой wttr.in сохранён');
                assertEqual(sb.WsLcdClock._weather, null, 'экран: тихий «--»');
                resolve();
            }, 20);
        });
    });

});

// ============================================================
// B-3. VM — панель настроек: статусы с wttr и подсказкой
// ============================================================
describe('Task 534 B-3: VM — статусы панели (два канала + подсказка)', () => {

    test('успех через wttr.in — статус с каналом', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        sb.WsLcdClock._weatherDiag = { ok: true, txt: '-2°', via: 'wttr',
            source: 'wttr.in (напрямую из браузера)', obs: '08:51' };
        sb.WsLcdClock._renderSettings();
        assertTrue(pm.els.wsLcdSet.innerHTML.indexOf(
            'Есть данные: -2° — wttr.in (напрямую из браузера) (набл. 08:51)') !== -1,
            'статус успеха с каналом wttr');
    });

    test('diag сбоя — НЕТ подсказок authorizeWeather/манифеста, dnote оба канала (Task 536)', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        sb.WsLcdClock._weatherDiag = {
            ok: false, why: 'network',
            direct: 'Failed to fetch', wttr: 'Failed to fetch'
        };
        sb.WsLcdClock._renderSettings();
        const html = pm.els.wsLcdSet.innerHTML;
        assertTrue(html.indexOf('(прямой запрос: open-meteo: Failed to fetch; ' +
                               'wttr.in: Failed to fetch)') !== -1,
            'dnote с причинами ОБЕИХ прямых каналов');
        assertTrue(html.indexOf('Прямые запросы open-meteo/wttr.in не прошли') !== -1,
            'формулировка сбоя прямых каналов');
        assertTrue(html.indexOf('authorizeWeather()') === -1,
            'подсказки authorizeWeather НЕТ (сервер удалён — Task 536)');
        assertTrue(html.indexOf('appsscript.json') === -1,
            'подсказки про манифест НЕТ');
        assertTrue(html.indexOf('Повтор — по расписанию или кнопкой ниже') !== -1,
            'обещание повтора');
        assertTrue(html.indexOf('ws-lcd-set-wstat warn') !== -1, 'варнинг-стиль');
    });

    test('diag БЕЗ причин — обычный статус сбоя, без сервера', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        sb.WsLcdClock._weatherDiag = {
            ok: false, why: 'server',
            direct: 'http_503', wttr: 'http_502'
        };
        sb.WsLcdClock._renderSettings();
        const html = pm.els.wsLcdSet.innerHTML;
        assertTrue(html.indexOf('Прямые запросы open-meteo/wttr.in не прошли') !== -1,
            'любой сбойный diag — формулировка прямых каналов (legacy why тоже)');
        assertTrue(html.indexOf('authorizeWeather()') === -1,
            'лишняя подсказка не показывается');
        assertTrue(html.indexOf('(прямой запрос: open-meteo: http_503; ' +
                               'wttr.in: http_502)') !== -1,
            'причины обоих каналов различимы');
    });

});

// ============================================================
// C. VM КАЛЕНДАРЬ — без подписей, левый край, регресс навигации
// ============================================================
describe('Task 534 C: VM — календарь (подписи убраны, навигация жива)', () => {

    function openCal(sb) {
        sb.WsLcdClock._calY = 0; sb.WsLcdClock._calM = 0;
        sb.WsLcdClock.toggleCal(true);
    }

    test('подписей «Год»/«Месяц» в разметке НЕТ, порядок сохранён', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        const html = pm.els.wsLcdCal.innerHTML;
        assertTrue(html.indexOf('ws-lcd-cal-yearlbl') === -1 &&
                   html.indexOf('ws-lcd-cal-monthlbl') === -1,
            'спаны подписей не рендерятся (заявка: «убери»)');
        assertTrue(html.indexOf('>Год<') === -1 && html.indexOf('>Месяц<') === -1,
            'текста подписей нет');
        const iYear = html.indexOf('ws-lcd-cal-year');
        const iMonth = html.indexOf('ws-lcd-cal-month');
        const iGrid = html.indexOf('ws-lcd-cal-grid');
        assertTrue(iYear !== -1 && iMonth !== -1 && iGrid !== -1, 'структура цела');
        assertTrue(iYear < iMonth && iMonth < iGrid, 'год → месяц → сетка');
    });

    test('навигация цела: 4 стрелки + «Сегодня» + селект месяца', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        const html = pm.els.wsLcdCal.innerHTML;
        assertEqual((html.match(/_calYearNav\(-1\)/g) || []).length, 1, '‹ год');
        assertEqual((html.match(/_calYearNav\(1\)/g) || []).length, 1, '› год');
        assertEqual((html.match(/_calNav\(-1\)/g) || []).length, 1, '‹ месяц');
        assertEqual((html.match(/_calNav\(1\)/g) || []).length, 1, '› месяц');
        const monthSel = html.match(/<select onchange="WsLcdClock\._calSetMonth\(\+this\.value\)" aria-label="Месяц">([\s\S]*?)<\/select>/);
        assertTrue(!!monthSel, 'селект месяца на месте');
        assertEqual((monthSel[1].match(/<option/g) || []).length, 12, '12 опций');
        const iMonth = html.indexOf('ws-lcd-cal-month');
        const iToday = html.indexOf('ws-lcd-cal-today');
        assertTrue(iToday > iMonth, '«Сегодня» в строке месяца');
    });

    test('_calSetMonth/стрелки работают (регресс Task 533)', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        sb.WsLcdClock._calSetMonth(3);
        assertEqual(sb.WsLcdClock._calM, 3, 'селект месяца применяет март');
        sb.WsLcdClock._calY = 2026; sb.WsLcdClock._calM = 12;
        sb.WsLcdClock._renderCal();
        sb.WsLcdClock._calNav(1);            // декабрь 2026 → январь 2027
        assertEqual(sb.WsLcdClock._calY, 2027, 'перенос года');
        assertEqual(sb.WsLcdClock._calM, 1, 'перенос месяца');
        assertTrue(pm.els.wsLcdCal.innerHTML.indexOf('value="2027" selected') !== -1,
            'селект года синхронизирован');
        sb.WsLcdClock._calToday();
        assertEqual(sb.WsLcdClock._calY, new Date().getFullYear(), '«Сегодня»: год');
        assertEqual(sb.WsLcdClock._calM, new Date().getMonth() + 1, '«Сегодня»: месяц');
    });

});

// ============================================================
// D. SW — версия кэша
// ============================================================
describe('Task 534 D: SW — версия кэша', () => {

    test('sw.js: CACHE_VERSION = kipia-test-v756', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v756'");
        assertTrue(i !== -1, 'версия v747 (Task 534: wttr.in + календарь)');
    });

    test('sw.js: нет забегания вперёд (v748 не должно быть)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v757') === -1,
            'v748 в sw.js отсутствует (гварды живут только в тестах)');
    });

    test('index.html: версия согласована (v747 в этом тесте)', () => {
        const t534 = fs.readFileSync(path.join(__dirname, 'test-task534.js'), 'utf8');
        assertTrue(t534.indexOf('kipia-test-v756') !== -1, 'этот тест знает v747');
        const dir = fs.readdirSync(path.join(__dirname));
        assertTrue(dir.indexOf('test-task534.js') !== -1, 'файл на месте');
    });

});
