// tests/test-task533.js
// Task 533 — LCD-информер Табеля: погода НАПРЯМУЮ из браузера
//   (open-meteo.com, без Apps Script), шестерёнка ВНУТРИ информера,
//   календарь: ГОД СВЕРХУ, МЕСЯЦ ПОД ГОДОМ (у месяца — селект +
//   стрелки, как у года).
// Заявка: «Погода не отображается, может рассмотреть способ
//   получения данных погоды не через скрипт? Кнопку со значком
//   шестерёнки расположи внутри информера. В календаре поменяй
//   местами отображения и селекторы года и месяца (год сверху,
//   месяц под годом), и у месяца сделай как у года селект +
//   стрелки.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — прямой канал погоды в клиенте (OM_URL, fetch,
//      _parseOpenMeteo/_fetchWeatherDirect, резерв сервера),
//      шестерёнка-оверлей (SVG 13×13 в зоне 20×20), календарь
//      год→месяц, SW kipia-test-v746.
//   B. VM ПОГОДА — _parseOpenMeteo (поля/WMO/мусор); _loadWeather:
//      прямой успех (сервер НЕ звётся, канал в diag), успех БЕЗ
//      авторизации, прямой сбой → резерв сервера (успех/без данных/
//      Unknown action/сеть), свежий кэш — сеть не дёргается,
//      _weatherNow форс, скрытая погода.
//   C. VM КАЛЕНДАРЬ — год ПЕРВОЙ строкой, месяц ПОД годом;
//      селект месяца (12 опций, текущий выбран, синхронизация
//      при ‹ › и переносе декабрь→январь, «Сегодня» в строке
//      месяца); _calSetMonth: применение + мусор.
//   D. VM ШЕСТЕРЁНКА — клик-семантика (настройки отдельно).
//   E. SW — kipia-test-v746, нет забегания вперёд (v747).
//
// Запуск: через tests/run-all.js (require './test-task533.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ============================================================
// Утилиты (как в test-task530/531/532.js)
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

function htmlLcdBlock() {
    const i = INDEX_SRC.indexOf('<div id="wsLcdWrap"');
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('</div>\n            </div>', i);
    return INDEX_SRC.slice(i, j === -1 ? i + 2000 : j);
}

// VM-песочница клиента (Task 533: + мок fetch для прямого канала)
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

// ответ open-meteo (тот же формат, что в test-task532.js — сервер)
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

// мок успешного fetch (Response-подобный: ok + text())
function omFetchOk() {
    return function () {
        return Promise.resolve({ ok: true, text: function () { return Promise.resolve(OM_JSON); } });
    };
}

const MN = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
            'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

// ============================================================
// A. SRC — прямой канал погоды, шестерёнка-оверлей, календарь
// ============================================================
describe('Task 533 A: SRC — погода напрямую, шестерёнка внутри, календарь', () => {

    test('SRC: OM_URL — open-meteo.com в КЛИЕНТЕ (те же параметры, что у сервера)', () => {
        const m = lcdModule();
        assertTrue(m.indexOf("OM_URL: 'https://api.open-meteo.com/v1/forecast'") !== -1,
            'константа OM_URL объявлена');
        assertTrue(m.indexOf('latitude=55.35') !== -1 &&
                   m.indexOf('longitude=86.08') !== -1, 'координаты Кемерово');
        assertTrue(m.indexOf('wind_speed_unit=ms') !== -1, 'ветер в м/с');
        assertTrue(m.indexOf('timezone=Asia%2FNovokuznetsk') !== -1, 'часовой пояс');
    });

    test('SRC: прямой запрос fetch() БЕЗ Apps Script + резерв сервера', () => {
        const m = lcdModule();
        const i = m.indexOf('_fetchWeatherDirect: function');
        assertTrue(i !== -1, '_fetchWeatherDirect определён');
        const chunk = m.slice(i, m.indexOf('},', i) + 2);
        assertTrue(chunk.indexOf('fetch(this.OM_URL') !== -1,
            'запрос идёт НАПРЯМУЮ (fetch), не через KipAuth.api');
        assertTrue(chunk.indexOf('no_fetch') !== -1,
            'нет fetch в среде — тихий отказ (для старых сред)');
        // _loadWeather: прямой канал ПЕРВЫМ, сервер — в catch (резерв)
        const lw = m.indexOf('_loadWeather: function');
        const lwChunk = m.slice(lw, m.indexOf('_weatherNow: function', lw));
        const iDirect = lwChunk.indexOf('_fetchWeatherDirect()');
        const iServer = lwChunk.indexOf("KipAuth.api('workSchedule.getWeather'");
        assertTrue(iDirect !== -1 && iServer !== -1, 'оба канала есть');
        assertTrue(iDirect < iServer, 'прямой канал — ПЕРВЫМ, сервер — резерв');
    });

    test('SRC: клиентский парсер _parseOpenMeteo (двойник серверного)', () => {
        const m = lcdModule();
        assertTrue(m.indexOf('_parseOpenMeteo: function') !== -1,
            'парсер есть в КЛИЕНТЕ');
        assertTrue(m.indexOf("source: 'open-meteo.com'") !== -1, 'источник подписан');
        // румбы и гПа→мм рт.ст. — как на сервере
        const i = m.indexOf('_parseOpenMeteo: function');
        const chunk = m.slice(i, m.indexOf('_fetchWeatherDirect', i));
        assertTrue(chunk.indexOf("DIRS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ']") !== -1,
            'румбы направления ветра');
        assertTrue(chunk.indexOf('/ 1.33322') !== -1, 'гПа → мм рт.ст.');
    });

    test('SRC: шестерёнка — ВНУТРИ информера (оверлей, SVG 13×13, зона 20×20)', () => {
        const html = htmlLcdBlock();
        const css = cssBlock();
        assertTrue(/<svg viewBox="0 0 24 24" width="13" height="13"/.test(html),
            'SVG-значок 13×13 (компактный, на стекле)');
        const i = css.indexOf('.ws-lcd-gear {');
        const chunk = css.slice(i, css.indexOf('}', i) + 1);
        assertTrue(chunk.indexOf('position: absolute') !== -1, 'оверлей поверх экрана');
        assertTrue(chunk.indexOf('width: 20px') !== -1 && chunk.indexOf('height: 20px') !== -1,
            'зона клика 20×20');
        assertTrue(chunk.indexOf('z-index: 5') !== -1, 'выше канваса, ниже попапов');
        assertTrue(chunk.indexOf('opacity: 0.55') !== -1, 'приглушена в покое (не мешает строке)');
        assertTrue(chunk.indexOf('background: transparent') !== -1, 'без фона-корпуса');
    });

    test('SRC: календарь — ГОД СВЕРХУ, МЕСЯЦ ПОД ГОДОМ (рендер в этом порядке)', () => {
        const m = lcdModule();
        const i = m.indexOf('_renderCal: function');
        const chunk = m.slice(i, m.indexOf('_calPick', i));
        const iYear = chunk.indexOf('ws-lcd-cal-year');
        const iMonth = chunk.indexOf('ws-lcd-cal-month');
        assertTrue(iYear !== -1 && iMonth !== -1, 'обе строки генерируются');
        assertTrue(iYear < iMonth, 'год рендерится ПЕРВЫМ (сверху), месяц — ПОД ним');
        assertTrue(chunk.indexOf('_calSetMonth(+this.value)') !== -1,
            'у месяца — селект (как у года)');
        assertTrue(chunk.indexOf('_calNav(-1)') !== -1 && chunk.indexOf('_calNav(1)') !== -1,
            'стрелки ‹ › у месяца');
        assertTrue(chunk.indexOf('>Месяц</span>') !== -1, 'подпись «Месяц»');
        assertTrue(chunk.indexOf('ws-lcd-cal-today') !== -1, '«Сегодня» в строке месяца');
    });

    test('SRC: CSS строк месяца .ws-lcd-cal-month (обе темы)', () => {
        const css = cssBlock();
        assertTrue(css.indexOf('.ws-lcd-cal-month {') !== -1, 'блок строки месяца');
        assertTrue(css.indexOf('.ws-lcd-cal-month select') !== -1, 'селект месяца');
        assertTrue(css.indexOf('.ws-lcd-cal-monthlbl') !== -1, 'подпись «Месяц»');
        assertTrue(css.indexOf('[data-theme="light"] .ws-lcd-cal-month select') !== -1,
            'светлая тема селекта месяца');
        // старые классы головы удалены
        assertTrue(css.indexOf('.ws-lcd-cal-head {') === -1, '.ws-lcd-cal-head удалён');
        assertTrue(css.indexOf('.ws-lcd-cal-title {') === -1, '.ws-lcd-cal-title удалён');
    });

    test('SRC: диагностика погоды упоминает ПРЯМОЙ канал (open-meteo)', () => {
        const m = lcdModule();
        // канал пишется в _weatherOk (source + via)
        const iOk = m.indexOf('_weatherOk: function');
        const okChunk = m.slice(iOk, m.indexOf('_loadWeather: function', iOk));
        assertTrue(okChunk.indexOf('напрямую из браузера') !== -1,
            'успех помечает канал «напрямую из браузера»');
        assertTrue(okChunk.indexOf('через Apps Script') !== -1,
            'резерв помечает канал «через Apps Script»');
        // формулировка прямого сбоя — в статусе панели (_renderSettings)
        const i = m.indexOf('var wd = this._weatherDiag;');
        const chunk = m.slice(i, m.indexOf("'<div class=\"ws-lcd-set-wstat'", i));
        assertTrue(chunk.indexOf('Прямой запрос open-meteo не прошёл') !== -1,
            'no-endpoint объясняет прямой сбой');
        assertTrue(chunk.indexOf('прямой запрос: ') !== -1,
            'причина прямого сбоя выводится в статус');
    });

});

// ============================================================
// B. VM ПОГОДА — прямой канал + резерв
// ============================================================
describe('Task 533 B-1: VM — клиентский _parseOpenMeteo', () => {

    test('полный JSON — все поля (температура/облачность/румб/давление)', () => {
        const sb = lcdSandbox();
        const d = sb.WsLcdClock._parseOpenMeteo(OM_JSON);
        assertTrue(!!d, 'данные разобраны');
        assertEqual(d.temp, -1.6, 'температура');
        assertEqual(d.phenomenon, 'Пасмурно', 'явление (код 3)');
        assertEqual(d.cloud, 8, 'балл облачности');
        assertEqual(d.windDir, 'З', 'румб (271° → Запад)');
        assertEqual(d.wind, 2.55, 'ветер м/с');
        assertEqual(d.pressure, 764, 'давление мм рт.ст. (1018.1 гПа)');
        assertEqual(d.humidity, 73, 'влажность');
        assertEqual(d.obsLocal, '2026-10-16 07:00', 'местное время наблюдения');
        assertEqual(d.source, 'open-meteo.com', 'источник');
    });

    test('WMO-коды → явление/облачность (иконки клиента работают)', () => {
        const sb = lcdSandbox();
        const mk = function (code) {
            return JSON.stringify({ current: {
                time: '2026-10-16T07:00', temperature_2m: 1,
                weather_code: code } });
        };
        assertEqual(sb.WsLcdClock._parseOpenMeteo(mk(0)).phenomenon, 'Ясно', 'код 0');
        assertEqual(sb.WsLcdClock._parseOpenMeteo(mk(0)).cloud, 0, 'код 0 — балл 0');
        assertEqual(sb.WsLcdClock._parseOpenMeteo(mk(61)).phenomenon, 'Дождь', 'код 61');
        assertEqual(sb.WsLcdClock._parseOpenMeteo(mk(71)).phenomenon, 'Снег', 'код 71');
        assertEqual(sb.WsLcdClock._parseOpenMeteo(mk(45)).phenomenon, 'Туман', 'код 45');
        assertEqual(sb.WsLcdClock._parseOpenMeteo(mk(95)).phenomenon, 'Гроза', 'код 95');
        assertEqual(sb.WsLcdClock._parseOpenMeteo(mk(999)).phenomenon, 'Гроза',
            'код 999 ≥ 95 — гроза (как на сервере)');
        assertEqual(sb.WsLcdClock._parseOpenMeteo(mk(4)).phenomenon, 'Пасмурно',
            'код без ветки (4) — пасмурно по умолчанию');
    });

    test('мусор / нет температуры → null (тихий отказ)', () => {
        const sb = lcdSandbox();
        assertEqual(sb.WsLcdClock._parseOpenMeteo('не json'), null, 'мусор');
        assertEqual(sb.WsLcdClock._parseOpenMeteo('{}'), null, 'пустой объект');
        assertEqual(sb.WsLcdClock._parseOpenMeteo(
            JSON.stringify({ current: { weather_code: 3 } })), null,
            'нет temperature_2m');
        assertEqual(sb.WsLcdClock._parseOpenMeteo(''), null, 'пустая строка');
    });

});

describe('Task 533 B-2: VM — _loadWeather: ПРЯМОЙ канал из браузера', () => {

    test('успех НАПРЯМУЮ: сервер НЕ зовётся, канал в diag, кэш записан', () => {
        let apiCalls = 0, fetchCalls = 0;
        const sb = lcdSandbox({
            fetch: function (url) {
                fetchCalls++;
                assertEqual(url, sb.WsLcdClock.OM_URL, 'URL — OM_URL (open-meteo)');
                return Promise.resolve({
                    ok: true, text: function () { return Promise.resolve(OM_JSON); }
                });
            },
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () { apiCalls++; return Promise.resolve({ temp: 5 }); }
            }
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(fetchCalls, 1, 'прямой запрос выполнен');
                assertEqual(apiCalls, 0, 'Apps Script НЕ зовётся (заявка: не через скрипт)');
                assertEqual(sb.WsLcdClock._weatherDiag.ok, true, 'diag ok');
                assertEqual(sb.WsLcdClock._weatherDiag.via, 'direct', 'канал — direct');
                assertEqual(sb.WsLcdClock._weatherDiag.source,
                    'open-meteo.com (напрямую из браузера)', 'источник помечен каналом');
                assertEqual(sb.WsLcdClock._weather.tempTxt, '-2°', 'экран: −2°');
                const c = JSON.parse(sb.localStorage._s['kip8_ws_weather_v1']);
                assertEqual(c.data.temp, -1.6, 'кэш записан с прямым ответом');
                resolve();
            }, 20);
        });
    });

    test('успешный прямой опрос БЕЗ авторизации (погода не требует токен)', () => {
        let fetchCalls = 0;
        const sb = lcdSandbox({
            fetch: function () { fetchCalls++; return omFetchOk()(); }
            // KipAuth НЕ задан — как у неавторизованного пользователя
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(fetchCalls, 1, 'прямой запрос шёл без токена');
                assertEqual(sb.WsLcdClock._weatherDiag.ok, true, 'diag ok');
                assertEqual(sb.WsLcdClock._weatherDiag.via, 'direct', 'канал — direct');
                resolve();
            }, 20);
        });
    });

    test('прямой HTTP-сбой без авторизации — diag network с причиной', () => {
        const sb = lcdSandbox({
            fetch: function () {
                return Promise.resolve({ ok: false, status: 503,
                                         text: function () { return Promise.resolve(''); } });
            }
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(sb.WsLcdClock._weatherDiag.ok, false, 'не ok');
                assertEqual(sb.WsLcdClock._weatherDiag.why, 'network', 'сетевая причина');
                assertEqual(sb.WsLcdClock._weatherDiag.direct, 'http_503',
                    'причина прямого сбоя сохранена');
                assertEqual(sb.WsLcdClock._weather, null, 'экран не тронут (тихо)');
                resolve();
            }, 20);
        });
    });

    test('свежий кэш — сеть НЕ дёргается (ни fetch, ни сервер)', () => {
        let fetchCalls = 0, apiCalls = 0;
        const sb = lcdSandbox({
            fetch: function () { fetchCalls++; return omFetchOk()(); },
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () { apiCalls++; return Promise.resolve({ temp: 5 }); }
            }
        });
        sb.localStorage._s['kip8_ws_weather_v1'] =
            JSON.stringify({ data: { temp: 7, cloud: 2 }, ts: Date.now() });
        sb.WsLcdClock._loadWeather(false);
        assertEqual(sb.WsLcdClock._weather.tempTxt, '+7°', 'кэш применён мгновенно');
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(fetchCalls, 0, 'fetch не звался');
                assertEqual(apiCalls, 0, 'сервер не звался');
                resolve();
            }, 20);
        });
    });

    test('скрытая погода (настройка) — сеть вообще не дёргается', () => {
        let fetchCalls = 0;
        const sb = lcdSandbox({ fetch: function () { fetchCalls++; return omFetchOk()(); } });
        sb.localStorage._s['kip8_ws_lcd_set_v1'] = JSON.stringify({ weather: false });
        sb.WsLcdClock._settings = null;               // сбросить кэш настроек
        sb.WsLcdClock._loadWeather(true);
        assertEqual(fetchCalls, 0, 'fetch не звался при скрытой погоде');
    });

    test('_weatherNow: форс — прямой запрос даже при свежем кэше', () => {
        let fetchCalls = 0;
        const sb = lcdSandbox({ fetch: function () { fetchCalls++; return omFetchOk()(); } });
        sb.localStorage._s['kip8_ws_weather_v1'] =
            JSON.stringify({ data: { temp: 7 }, ts: Date.now() });
        sb.WsLcdClock._weatherNow();
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(fetchCalls, 1, 'форс-опрос дёрнул прямую сеть');
                assertEqual(sb.WsLcdClock._weatherDiag.via, 'direct', 'канал — direct');
                resolve();
            }, 20);
        });
    });

});

describe('Task 533 B-3: VM — резерв сервера при сбое прямого канала', () => {

    const fetchFail = function () {
        return Promise.reject(new Error('Failed to fetch'));
    };

    test('прямой сбой → сервер ответил данными: канал server в diag', () => {
        let apiCalls = 0;
        const sb = lcdSandbox({
            fetch: fetchFail,
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
                assertEqual(apiCalls, 1, 'резерв (сервер) вызван');
                assertEqual(sb.WsLcdClock._weatherDiag.ok, true, 'diag ok');
                assertEqual(sb.WsLcdClock._weatherDiag.via, 'server', 'канал — server');
                assertEqual(sb.WsLcdClock._weatherDiag.source,
                    'meteoinfo.ru (через Apps Script)', 'источник + канал резерва');
                assertEqual(sb.WsLcdClock._weather.tempTxt, '-12°', 'экран: −12°');
                resolve();
            }, 20);
        });
    });

    test('прямой сбой → сервер БЕЗ данных: why=server, видны обе попытки', () => {
        const sb = lcdSandbox({
            fetch: fetchFail,
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () {
                    return Promise.resolve({ temp: null, note: 'weather_unavailable',
                                             diag: 'meteoinfo:http_403; open-meteo:http_503' });
                }
            }
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(sb.WsLcdClock._weatherDiag.why, 'server', 'причина — источники');
                assertEqual(sb.WsLcdClock._weatherDiag.direct, 'Failed to fetch',
                    'прямой сбой сохранён в diag');
                assertEqual(sb.WsLcdClock._weatherDiag.diag,
                    'meteoinfo:http_403; open-meteo:http_503', 'строка попыток сервера');
                resolve();
            }, 20);
        });
    });

    test('прямой сбой → Unknown action: why=no-endpoint + прямой сбой', () => {
        const sb = lcdSandbox({
            fetch: fetchFail,
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () {
                    return Promise.reject(new Error('Unknown action: workSchedule.getWeather'));
                }
            }
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(sb.WsLcdClock._weatherDiag.why, 'no-endpoint', 'эндпоинта нет');
                assertEqual(sb.WsLcdClock._weatherDiag.direct, 'Failed to fetch',
                    'прямой сбой тоже зафиксирован');
                resolve();
            }, 20);
        });
    });

    test('прямой сбой + сбой сервера: why=network с обеими причинами', () => {
        const sb = lcdSandbox({
            fetch: fetchFail,
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () { return Promise.reject(new Error('NETWORK_ERROR: HTTP 500')); }
            }
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(sb.WsLcdClock._weatherDiag.why, 'network', 'сетевая причина');
                assertEqual(sb.WsLcdClock._weatherDiag.direct, 'Failed to fetch',
                    'прямой сбой');
                assertEqual(sb.WsLcdClock._weatherDiag.note, 'NETWORK_ERROR: HTTP 500',
                    'сбой сервера');
                resolve();
            }, 20);
        });
    });

    test('панель настроек: статусы нового формата (прямой канал/резерв)', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        // успех напрямую
        sb.WsLcdClock._weatherDiag = { ok: true, txt: '-2°', via: 'direct',
            source: 'open-meteo.com (напрямую из браузера)',
            obs: '2026-10-16 07:00' };
        sb.WsLcdClock._renderSettings();
        assertTrue(pm.els.wsLcdSet.innerHTML.indexOf(
            'Есть данные: -2° — open-meteo.com (напрямую из браузера)') !== -1,
            'статус успеха с каналом');
        // no-endpoint упоминает прямой сбой
        sb.WsLcdClock._weatherDiag = { ok: false, why: 'no-endpoint',
                                       direct: 'Failed to fetch' };
        sb.WsLcdClock._renderSettings();
        const html = pm.els.wsLcdSet.innerHTML;
        assertTrue(html.indexOf('Прямой запрос open-meteo не прошёл') !== -1,
            'формулировка прямого сбоя');
        assertTrue(html.indexOf('(прямой запрос: Failed to fetch)') !== -1,
            'причина прямого сбоя в статусе');
        assertTrue(html.indexOf('ws-lcd-set-wstat warn') !== -1, 'варнинг-стиль');
    });

});

// ============================================================
// C. VM КАЛЕНДАРЬ — год сверху, месяц под годом
// ============================================================
describe('Task 533 C: VM — календарь: год СВЕРХУ, месяц ПОД годом', () => {

    function openCal(sb) {
        sb.WsLcdClock._calY = 0; sb.WsLcdClock._calM = 0;
        sb.WsLcdClock.toggleCal(true);
    }

    test('порядок строк: ГОД — ПЕРВЫЙ, МЕСЯЦ — ВТОРОЙ (заявка)', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        const html = pm.els.wsLcdCal.innerHTML;
        const iYear = html.indexOf('ws-lcd-cal-year');
        const iMonth = html.indexOf('ws-lcd-cal-month');
        const iGrid = html.indexOf('ws-lcd-cal-grid');
        assertTrue(iYear !== -1 && iMonth !== -1 && iGrid !== -1, 'все блоки есть');
        assertTrue(iYear < iMonth && iMonth < iGrid,
            'год → месяц → сетка (ровно как в заявке)');
    });

    test('селект месяца: 12 опций, текущий месяц выбран', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        const html = pm.els.wsLcdCal.innerHTML;
        const monthSel = html.match(/<select onchange="WsLcdClock\._calSetMonth\(\+this\.value\)" aria-label="Месяц">([\s\S]*?)<\/select>/);
        assertTrue(!!monthSel, 'селект месяца найден');
        const opts = monthSel[1].match(/<option/g) || [];
        assertEqual(opts.length, 12, 'ровно 12 опций');
        const cur = new Date().getMonth() + 1;
        assertTrue(monthSel[1].indexOf('value="' + cur + '" selected') !== -1,
            'текущий месяц (' + MN[cur - 1] + ') выбран');
        assertTrue(monthSel[1].indexOf('>' + MN[0] + '<') !== -1 &&
                   monthSel[1].indexOf('>' + MN[11] + '<') !== -1,
            'Январь..Декабрь в списке');
    });

    test('_calSetMonth(3): месяц применяется, селект синхронизируется', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        sb.WsLcdClock._calSetMonth(3);
        assertEqual(sb.WsLcdClock._calM, 3, 'месяц — март');
        assertTrue(pm.els.wsLcdCal.innerHTML.indexOf('value="3" selected') !== -1,
            'селект показывает Март');
    });

    test('_calSetMonth: мусор игнорируется (0/13/NaN)', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._calY = 2026;
        sb.WsLcdClock._calM = 10;
        sb.WsLcdClock._calSetMonth(0);
        assertEqual(sb.WsLcdClock._calM, 10, '0 игнорирован');
        sb.WsLcdClock._calSetMonth(13);
        assertEqual(sb.WsLcdClock._calM, 10, '13 игнорирован');
        sb.WsLcdClock._calSetMonth(NaN);
        assertEqual(sb.WsLcdClock._calM, 10, 'NaN игнорирован');
    });

    test('стрелки ‹ › месяца синхронизируют селект (в т.ч. декабрь→январь)', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        sb.WsLcdClock._calY = 2026;
        sb.WsLcdClock._calM = 12;
        sb.WsLcdClock._renderCal();
        sb.WsLcdClock._calNav(1);            // декабрь 2026 → январь 2027
        assertEqual(sb.WsLcdClock._calY, 2027, 'год перешёл в 2027');
        assertEqual(sb.WsLcdClock._calM, 1, 'месяц — январь');
        const html = pm.els.wsLcdCal.innerHTML;
        assertTrue(html.indexOf('value="2027" selected') !== -1, 'селект года: 2027');
        assertTrue(html.indexOf('value="1" selected') !== -1, 'селект месяца: Январь');
    });

    test('4 кнопки навигации: ‹ › по ГОДАМ + ‹ › по МЕСЯЦАМ', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        const html = pm.els.wsLcdCal.innerHTML;
        assertEqual((html.match(/_calYearNav\(-1\)/g) || []).length, 1, '‹ год');
        assertEqual((html.match(/_calYearNav\(1\)/g) || []).length, 1, '› год');
        assertEqual((html.match(/_calNav\(-1\)/g) || []).length, 1, '‹ месяц');
        assertEqual((html.match(/_calNav\(1\)/g) || []).length, 1, '› месяц');
    });

    test('«Сегодня» — в строке МЕСЯЦА; возвращает текущие месяц и год', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        const html = pm.els.wsLcdCal.innerHTML;
        const iMonth = html.indexOf('ws-lcd-cal-month');
        const iToday = html.indexOf('ws-lcd-cal-today');
        const iGrid = html.indexOf('ws-lcd-cal-grid');
        assertTrue(iToday > iMonth && iToday < iGrid, '«Сегодня» внутри строки месяца');
        sb.WsLcdClock._calY = 1999;
        sb.WsLcdClock._calM = 1;
        sb.WsLcdClock._calToday();
        assertEqual(sb.WsLcdClock._calY, new Date().getFullYear(), 'год — текущий');
        assertEqual(sb.WsLcdClock._calM, new Date().getMonth() + 1, 'месяц — текущий');
    });

});

// ============================================================
// D. VM ШЕСТЕРЁНКА — клик-семантика сохранена (Task 532)
// ============================================================
describe('Task 533 D: VM — шестерёнка внутри: клик-семантика', () => {

    test('onGearClick → ТОЛЬКО настройки (календарь не трогает)', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        sb.WsLcdClock.onGearClick({});
        assertEqual(pm.els.wsLcdSet.hidden, false, 'настройки открыты');
        assertEqual(pm.els.wsLcdCal.hidden, true, 'календарь НЕ тронут');
        assertEqual(pm.els.wsLcdGear['aria-expanded'], 'true', 'aria-expanded');
    });

    test('onClockClick → ТОЛЬКО календарь (настройки не трогает)', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        sb.WsLcdClock.onClockClick({});
        assertEqual(pm.els.wsLcdCal.hidden, false, 'календарь открыт');
        assertEqual(pm.els.wsLcdSet.hidden, true, 'настройки НЕ тронуты');
    });

});

// ============================================================
// E. SW — версия кэша
// ============================================================
describe('Task 533 E: SW — версия кэша', () => {

    test('sw.js: CACHE_VERSION = kipia-test-v746', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v746'");
        assertTrue(i !== -1, 'версия v746 (Task 533: погода/шестерёнка/календарь)');
    });

    test('sw.js: нет забегания вперёд (v747 не должно быть)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v747') === -1,
            'v747 в sw.js отсутствует (гварды живут только в тестах)');
    });

    test('index.html: версия промта/кэша согласована (v746 в тестах)', () => {
        // ассерты текущей версии расставлены бампом по всем тестам
        const dir = fs.readdirSync(path.join(__dirname));
        const t533 = fs.readFileSync(path.join(__dirname, 'test-task533.js'), 'utf8');
        assertTrue(t533.indexOf('kipia-test-v746') !== -1, 'этот тест знает v746');
        assertTrue(dir.indexOf('test-task533.js') !== -1, 'файл на месте');
    });

});
