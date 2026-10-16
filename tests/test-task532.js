// tests/test-task532.js
// Task 532 — LCD-информер Табеля: шестерёнка с настройками, календарь
//   с выбором года, диагностика погоды, аудит кириллицы FONT5.
// Заявка: «Обновил в Apps Script два файла (WorkSchedule.gs, Code.gs),
//   а погода не отображается, хотя всё остальное работает. И ещё
//   сделай в правом верхнем углу информера значок шестерёнки при
//   нажатии на который должен появляться блок с настройками
//   информера, а по нажатию на само окно информера должен открываться
//   только календарь, и в календаре нужно сделать выбор года. И
//   проверь в информере некоторые буквы не соответствуют кирилице.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC HTML/CSS — шестерёнка #wsLcdGear (правый верхний угол,
//      SVG-иконка, состояния), панель настроек под шестерёнкой со
//      смещением при открытом календаре, выбор года в календаре,
//      диагностика погоды, z-фикс для ОБОИХ попапов.
//   B. SRC JS — КИРИЛЛИЦА FONT5: Ь≠Е, Ё с точками, Ч с полной
//      перекладиной, Д арка+ножки, Л пик, З/Э/Ы/Ю, « » – — …,
//      №→N; клик-семантика (onGearClick/toggleSet/_setOpen).
//   C. VM — календарь: селект года (±10, синхронизация при навигации,
//      расширение диапазона, _calSetYear/_calYearNav/«Сегодня»,
//      сетка месяца); погода: _weatherDiag (ok/server/no-endpoint/
//      network), панель с «Обновить сейчас», _weatherNow.
//   D. СЕРВЕР — getWeather v2: UA-заголовки, резерв open-meteo,
//      _parseOpenMeteo (WMO-коды, румбы, давление), diag-цепочка
//      попыток, кэш 1800.
//   E. SW — kipia-test-v747.
//
// Запуск: через tests/run-all.js (require './test-task532.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');

// ============================================================
// Утилиты (как в test-task530/531.js)
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

// VM-песочница клиента
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
        wsLcdGear: { setAttribute: function (k, v) { this['aria-' + k] = v; } }
    };
    return {
        els: els,
        getElementById: function (id) { return els[id] || null; }
    };
}

// VM-песочница СЕРВЕРА (WorkSchedule.gs)
function wsSandbox(mocks) {
    mocks = mocks || {};
    const sb = {
        CacheService: mocks.CacheService,
        UrlFetchApp: mocks.UrlFetchApp
    };
    vm.createContext(sb);
    vm.runInContext(WS_GS_SRC, sb);
    sb.WorkSchedule._requireRead = function () { return { user: {} }; };
    return sb;
}

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

const noCache = function () {
    return { getScriptCache: function () { return { get: function () { return null; },
                                                    put: function () {} }; } };
};

// ============================================================
// A. SRC HTML/CSS — шестерёнка, позиции, выбор года, диагностика
// ============================================================
describe('Task 532 A: SRC — шестерёнка, календарь с годом, диагностика', () => {

    test('HTML: шестерёнка #wsLcdGear — В ПРАВОМ ВЕРХНЕМ УГЛУ (в обёртке, после окна)', () => {
        const html = htmlLcdBlock();
        const iClock = html.indexOf('id="wsLcdClock"');
        const iGear = html.indexOf('id="wsLcdGear"');
        const iCal = html.indexOf('id="wsLcdCal"');
        assertTrue(iClock !== -1 && iGear !== -1, 'кнопка-шестерёнка есть');
        assertTrue(iGear > iClock && iGear < iCal, 'шестерёнка ПОСЛЕ окна, ДО календаря');
        assertTrue(/id="wsLcdGear"[^>]*class="ws-lcd-gear"/.test(html), 'класс ws-lcd-gear');
        assertTrue(html.indexOf('<svg viewBox="0 0 24 24"') !== -1, 'SVG-иконка шестерёнки');
        assertTrue(/aria-label="Настройки информера"/.test(html), 'aria-label');
    });

    test('CSS: .ws-lcd-gear — ВНУТРИ информера (оверлей на стекле, Task 533)', () => {
        const css = cssBlock();
        const i = css.indexOf('.ws-lcd-gear {');
        assertTrue(i !== -1, 'блок .ws-lcd-gear объявлен');
        const chunk = css.slice(i, css.indexOf('}', i) + 1);
        assertTrue(chunk.indexOf('position: absolute') !== -1,
            'оверлей ПОВЕРХ экрана (absolute, не в потоке)');
        assertTrue(chunk.indexOf('top: 2px') !== -1 && chunk.indexOf('right: 4px') !== -1,
            'правый верхний угол стекла');
        assertTrue(chunk.indexOf('background: transparent') !== -1,
            'фона-корпуса НЕТ — значок «на стекле»');
        assertTrue(chunk.indexOf('var(--ws-lcd-seg') !== -1,
            'цвет сегментов матрицы');
        assertTrue(css.indexOf('.ws-lcd-gear[aria-expanded="true"]') !== -1,
            'состояние «нажата» при открытых настройках');
        assertTrue(css.indexOf('[data-theme="light"] .ws-lcd-gear') !== -1, 'светлая тема');
    });

    test('CSS: обёртка — БЕЗ зазора (Task 533: шестерёнка абсолютная, в потоке только рамка)', () => {
        const css = cssBlock();
        const i = css.indexOf('#page-work-schedule .page-inline-header .ws-lcd-wrap {');
        const chunk = css.slice(i, css.indexOf('}', i) + 1);
        assertTrue(chunk.indexOf('gap: 5px') === -1,
            'зазор рамка↔шестерёнка удалён (шестерёнка на стекле)');
    });

    test('CSS: настройки — right: 0 (под шестерёнкой), при открытом календаре right: 330px', () => {
        const css = cssBlock();
        const i = css.indexOf('.ws-lcd-set {');
        const chunk = css.slice(i, css.indexOf('}', i) + 1);
        assertTrue(chunk.indexOf('right: 0') !== -1, 'по умолчанию у правого края');
        const j = css.indexOf('.ws-lcd-wrap:has(#wsLcdCal:not([hidden])) .ws-lcd-set');
        assertTrue(j !== -1, 'правило смещения есть');
        assertTrue(css.slice(j, css.indexOf('}', j) + 1).indexOf('right: 330px') !== -1,
            'смещение левее календаря');
    });

    test('CSS: ВЫБОР ГОДА — строка .ws-lcd-cal-year + селект (обе темы)', () => {
        const css = cssBlock();
        assertTrue(css.indexOf('.ws-lcd-cal-year {') !== -1, 'блок строки года');
        assertTrue(css.indexOf('.ws-lcd-cal-year select') !== -1, 'селект года');
        assertTrue(css.indexOf('[data-theme="light"] .ws-lcd-cal-year select') !== -1,
            'светлая тема селекта');
    });

    test('CSS: диагностика погоды — .ws-lcd-set-wstat (+warn/muted) и кнопка', () => {
        const css = cssBlock();
        assertTrue(css.indexOf('.ws-lcd-set-wstat {') !== -1, 'строка статуса');
        assertTrue(css.indexOf('.ws-lcd-set-wstat.warn') !== -1, 'варнинг-состояние');
        assertTrue(css.indexOf('.ws-lcd-set-wstat.muted') !== -1, 'приглушённое состояние');
        assertTrue(css.indexOf('.ws-lcd-set-wbtn') !== -1, 'кнопка «Обновить сейчас»');
    });

    test('CSS: z-фикс шторок — срабатывает для КАЛЕНДАРЯ и НАСТРОЕК', () => {
        const css = cssBlock();
        const i = css.indexOf('@media (min-width: 1024px) {', css.indexOf('Task 531 (БАГ)'));
        const chunk = css.slice(i, css.indexOf('}', css.indexOf('z-index: 20', i)) + 1);
        assertTrue(chunk.indexOf('#wsLcdCal:not([hidden])') !== -1, 'гвард календаря');
        assertTrue(chunk.indexOf('#wsLcdSet:not([hidden])') !== -1, 'гвард настроек');
    });

});

// ============================================================
// B. SRC JS — кириллица FONT5 + клик-семантика
// ============================================================
describe('Task 532 B: SRC — кириллица FONT5 (заявка: буквы не соответствуют)', () => {

    test('Ь ≠ Е: стем + ВЫСОКАЯ чаша (ряды 1 и 6 — перекладины чаши)', () => {
        const sb = lcdSandbox();
        const soft = sb.WsLcdClock.FONT5['Ь'];
        const e = sb.WsLcdClock.FONT5['Е'];
        assertTrue(JSON.stringify(soft) !== JSON.stringify(e), 'Ь ≠ Е (главный баг)');
        assertEqual(soft[0], 0b10000, 'ряд 0 — голый стем (не перекладина Е)');
        assertEqual(soft[1], 0b11110, 'верх чаши — со 2-й строки');
        assertEqual(soft[6], 0b11110, 'низ чаши');
    });

    test('Ё — две точки над Е (ряд 0 = 01010), тело — сжатое Е', () => {
        const sb = lcdSandbox();
        const yo = sb.WsLcdClock.FONT5['Ё'];
        const e = sb.WsLcdClock.FONT5['Е'];
        assertTrue(!!yo, 'глиф Ё есть (раньше — ПРОПУСК, буква исчезала)');
        assertEqual(yo.length, 7, '7 строк');
        assertEqual(yo[0], 0b01010, 'две точки сверху');
        assertEqual(yo[1], e[0], 'под точками — верх Е');
        assertEqual(yo[6], e[6], 'низ Ё = низ Е');
    });

    test('Ч — перекладина ПОЛНАЯ (доведена до левого стема)', () => {
        const sb = lcdSandbox();
        assertEqual(sb.WsLcdClock.FONT5['Ч'][3], 0b11111,
            'ряд 3 = 11111 (раньше 01111 — разрыв, читалось как «4»)');
    });

    test('Д — арка сверху + стемы + «ножки» (не замкнутая коробка)', () => {
        const sb = lcdSandbox();
        const de = sb.WsLcdClock.FONT5['Д'];
        assertEqual(de[0], 0b01110, 'верх — арка (не 11111)');
        assertEqual(de[6], 0b11011, 'низ — ножки ##.## (не 11111)');
        assertEqual(de[1], 0b10001, 'стемы');
    });

    test('Л — симметричный пик (не читается как П)', () => {
        const sb = lcdSandbox();
        const el = sb.WsLcdClock.FONT5['Л'];
        assertEqual(el[0], 0b00110, 'узкий пик из 2 колонок');
        assertEqual(el[1], 0b01001, 'ноги');
    });

    test('З — гладкая «3» (без левого стема сверху)', () => {
        const sb = lcdSandbox();
        const ze = sb.WsLcdClock.FONT5['З'];
        assertEqual(ze[0], 0b01111, 'верхняя перекладина');
        assertEqual(ze[1], 0b00001, 'правый стем (левого НЕТ — не «9»)');
    });

    test('Э — средняя черта от левого края; Ы/Ю — обновлённые формы', () => {
        const sb = lcdSandbox();
        assertEqual(sb.WsLcdClock.FONT5['Э'][3], 0b11111, 'Э: полная средняя черта');
        assertEqual(sb.WsLcdClock.FONT5['Э'][1], 0b00001, 'Э: без угловых точек слева');
        const y = sb.WsLcdClock.FONT5['Ы'];
        assertEqual(y[0], 0b10100, 'Ы: стемы без чаши в ряду 0');
        assertEqual(y[6], 0b10111, 'Ы: низ чаши Ь');
        assertEqual(sb.WsLcdClock.FONT5['Ю'][0], 0b10110, 'Ю: симметричная чаша');
    });

    test('« » – — … — глифы есть (раньше исчезали из сообщений)', () => {
        const sb = lcdSandbox();
        for (const ch of ['«', '»', '–', '—', '…']) {
            const g = sb.WsLcdClock.FONT5[ch];
            assertTrue(Array.isArray(g) && g.length === 7, 'глиф «' + ch + '» (7 строк)');
        }
        assertEqual(sb.WsLcdClock.FONT5['—'][3], 0b11111, 'эм-тире во всю ширину');
    });

    test('_blit5: «№» → «N» (глифа номера нет — буква не исчезает)', () => {
        const sb = lcdSandbox();
        const g = sb.WsLcdClock._blankGrid();
        sb.WsLcdClock._blit5(g, '№5', 0, 1);
        // «N» — латинский глиф, колонки 1..5 ряда 0
        assertEqual(g[0][1], 1, 'N нарисован (не пропуск)');
        assertEqual(g[0][6], 0, 'между N и 5 — зазор');
    });

    test('_blit5: «ё» рисуется как Ё (регистронезависимо)', () => {
        const sb = lcdSandbox();
        const g = sb.WsLcdClock._blankGrid();
        sb.WsLcdClock._blit5(g, 'ёлка', 0, 1);
        // Ё: ряд 0 — точки в колонках 2 и 4 (left=1 + смещение 1)
        assertEqual(g[0][2], 1, 'точка Ё №1');
        assertEqual(g[0][4], 1, 'точка Ё №2');
        assertEqual(g[0][1], 0, 'между точками пусто');
    });

    test('дни недели содержат исправленные буквы — Д/Л/Ь/Ч на месте', () => {
        const sb = lcdSandbox();
        for (const w of ['ПОНЕДЕЛЬНИК', 'СРЕДА', 'ЧЕТВЕРГ', 'ВОСКРЕСЕНЬЕ']) {
            for (const ch of w) {
                assertTrue(!!sb.WsLcdClock.FONT5[ch], 'буква «' + ch + '» в «' + w + '»');
            }
        }
    });

});

// ============================================================
// C. VM — календарь с выбором года + диагностика погоды
// ============================================================
describe('Task 532 C-1: VM — календарь: ВЫБОР ГОДА', () => {

    function openCal(sb) {
        sb.WsLcdClock._calY = 0; sb.WsLcdClock._calM = 0;
        sb.WsLcdClock.toggleCal(true);
    }

    test('строка года: селект + шаг ‹ › (подпись «Год» убрана Task 534)', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        const html = pm.els.wsLcdCal.innerHTML;
        assertTrue(html.indexOf('ws-lcd-cal-year') !== -1, 'строка года есть');
        assertTrue(html.indexOf('_calSetYear(+this.value)') !== -1, 'селект — _calSetYear');
        assertTrue(html.indexOf('_calYearNav(-1)') !== -1 &&
                   html.indexOf('_calYearNav(1)') !== -1, 'шаги ‹ › по годам');
        // Task 534 (заявка): надписи «Год»/«Месяц» УБРАНЫ
        assertTrue(html.indexOf('>Год</span>') === -1 &&
                   html.indexOf('ws-lcd-cal-yearlbl') === -1,
            'подпись «Год» убрана (Task 534)');
    });

    test('селект года: текущий год выбран; диапазон ±10', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        const y = new Date().getFullYear();
        const html = pm.els.wsLcdCal.innerHTML;
        assertTrue(html.indexOf('value="' + y + '" selected') !== -1,
            'текущий год ' + y + ' выбран');
        assertTrue(html.indexOf('value="' + (y - 10) + '"') !== -1, 'минус 10 лет в списке');
        assertTrue(html.indexOf('value="' + (y + 10) + '"') !== -1, 'плюс 10 лет в списке');
    });

    test('_calYearNav(1): год меняется, селект синхронизируется', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        const y = new Date().getFullYear();
        sb.WsLcdClock._calYearNav(1);
        assertEqual(sb.WsLcdClock._calY, y + 1, 'год +1');
        assertTrue(pm.els.wsLcdCal.innerHTML.indexOf('value="' + (y + 1) + '" selected') !== -1,
            'селект показывает ' + (y + 1));
    });

    test('месяц — СЕЛЕКТ в строке ПОД годом (Task 533), год — ПЕРВОЙ строкой', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        const html = pm.els.wsLcdCal.innerHTML;
        const y = new Date().getFullYear();
        const MN = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        const m = MN[new Date().getMonth()];
        // Task 533: ГОД — сверху, МЕСЯЦ — под годом (заявка)
        const iYear = html.indexOf('ws-lcd-cal-year');
        const iMonth = html.indexOf('ws-lcd-cal-month');
        assertTrue(iYear !== -1 && iMonth !== -1, 'обе строки есть');
        assertTrue(iYear < iMonth, 'год — ПЕРВОЙ строкой, месяц — ПОД ним');
        // месяц — СЕЛЕКТ (как у года), а не заголовок
        assertTrue(html.indexOf('_calSetMonth(+this.value)') !== -1,
            'селект месяца — _calSetMonth');
        const sel = html.match(/<option value="(\d+)" selected>[А-Яа-яё]+<\/option>/);
        assertTrue(!!sel, 'выбранный месяц есть в селекте');
        assertEqual(sel[1], String(new Date().getMonth() + 1),
            'текущий месяц ' + m + ' выбран');
        // старого заголовка-«титула» больше нет
        assertTrue(html.indexOf('ws-lcd-cal-title') === -1,
            'заголовок-титул удалён (месяц — селект)');
    });

    test('декабрь→январь: навигация месяцев меняет год и селект', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        sb.WsLcdClock._calY = 2026;
        sb.WsLcdClock._calM = 12;
        sb.WsLcdClock._calNav(1);           // декабрь 2026 → январь 2027
        assertEqual(sb.WsLcdClock._calY, 2027, 'год перешёл в 2027');
        assertEqual(sb.WsLcdClock._calM, 1, 'месяц — январь');
        assertTrue(pm.els.wsLcdCal.innerHTML.indexOf('value="2027" selected') !== -1,
            'селект синхронизирован с 2027');
        sb.WsLcdClock._calNav(-1);          // назад — декабрь 2026
        assertEqual(sb.WsLcdClock._calY, 2026, 'назад в 2026');
    });

    test('_calSetYear(2030): год из селекта применяется', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        sb.WsLcdClock._calSetYear(2030);
        assertEqual(sb.WsLcdClock._calY, 2030, 'год установлен');
        assertTrue(pm.els.wsLcdCal.innerHTML.indexOf('value="2030" selected') !== -1,
            'год 2030 добавлен в список и выбран');
    });

    test('_calSetYear: мусор игнорируется (год не меняется)', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._calY = 2026;
        sb.WsLcdClock._calSetYear(NaN);
        assertEqual(sb.WsLcdClock._calY, 2026, 'NaN игнорирован');
        sb.WsLcdClock._calSetYear(0);
        assertEqual(sb.WsLcdClock._calY, 2026, '0 игнорирован');
    });

    test('«Сегодня»: возвращает текущие месяц и год', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        sb.WsLcdClock._calY = 1999;
        sb.WsLcdClock._calM = 1;
        sb.WsLcdClock._calToday();
        assertEqual(sb.WsLcdClock._calY, new Date().getFullYear(), 'год — текущий');
        assertEqual(sb.WsLcdClock._calM, new Date().getMonth() + 1, 'месяц — текущий');
    });

    test('сетка октября 2026: 1 октября — четверг, 31 день', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        openCal(sb);
        sb.WsLcdClock._calY = 2026;
        sb.WsLcdClock._calM = 10;
        sb.WsLcdClock._renderCal();
        const html = pm.els.wsLcdCal.innerHTML;
        assertTrue(html.indexOf('aria-label="31 Октябрь 2026"') !== -1, '31-е число есть');
        // 1 окт 2026 (четверг): lead = 3 → перед ней 28..30 сентября
        assertTrue(html.indexOf('aria-label="30 Сентябрь 2026"') !== -1, 'хвост сентября');
        assertTrue(html.indexOf('aria-label="1 Ноябрь 2026"') !== -1, 'начало ноября');
    });

});

describe('Task 532 C-2: VM — диагностика погоды в настройках', () => {

    test('_applyWeather: фиксирует _weatherDiag (temp/источник/наблюдение)', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._applyWeather({ temp: -0.7, source: 'meteoinfo.ru',
                                      obsLocal: '16 октября, 04:00' });
        assertEqual(sb.WsLcdClock._weatherDiag.ok, true, 'ok');
        assertEqual(sb.WsLcdClock._weatherDiag.txt, '-1°', 'температура');
        assertEqual(sb.WsLcdClock._weatherDiag.source, 'meteoinfo.ru', 'источник');
        assertEqual(sb.WsLcdClock._weatherDiag.obs, '16 октября, 04:00', 'наблюдение');
    });

    test('_loadWeather: успех (резерв через сервер) — diag ok + запись кэша', () => {
        const sb = lcdSandbox({
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () {
                    return Promise.resolve({ temp: 9, cloud: 1,
                                             source: 'open-meteo.com', obsLocal: '2026-10-16 07:00' });
                }
            }
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(sb.WsLcdClock._weatherDiag.ok, true, 'diag ok');
                assertEqual(sb.WsLcdClock._weatherDiag.source,
                    'open-meteo.com (через Apps Script)',
                    'источник помечен каналом (Task 533: прямой канал недоступен в VM)');
                const c = JSON.parse(sb.localStorage._s['kip8_ws_weather_v1']);
                assertEqual(c.data.temp, 9, 'кэш записан');
                resolve();
            }, 20);
        });
    });

    test('_loadWeather: сервер ответил БЕЗ данных — diag server + строка попыток', () => {
        const sb = lcdSandbox({
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
                assertEqual(sb.WsLcdClock._weatherDiag.ok, false, 'не ok');
                assertEqual(sb.WsLcdClock._weatherDiag.why, 'server', 'причина — сервер/источники');
                assertEqual(sb.WsLcdClock._weatherDiag.diag,
                    'meteoinfo:http_403; open-meteo:http_503', 'строка попыток сохранена');
                resolve();
            }, 20);
        });
    });

    test('_loadWeather: Unknown action — подсказка про развёртывание Apps Script', () => {
        const sb = lcdSandbox({
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
                assertEqual(sb.WsLcdClock._weatherDiag.why, 'no-endpoint',
                    'эндпоинта нет — обновите развёртывание');
                resolve();
            }, 20);
        });
    });

    test('_loadWeather: сетевой сбой — diag network', () => {
        const sb = lcdSandbox({
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () { return Promise.reject(new Error('NETWORK_ERROR: Failed to fetch')); }
            }
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(sb.WsLcdClock._weatherDiag.why, 'network', 'сетевая причина');
                resolve();
            }, 20);
        });
    });

    test('_renderSettings: статус погоды + кнопка «Обновить сейчас»', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        sb.WsLcdClock._renderSettings();
        let html = pm.els.wsLcdSet.innerHTML;
        assertTrue(html.indexOf('ws-lcd-set-wstat') !== -1, 'строка статуса есть');
        assertTrue(html.indexOf('Ещё не опрошено') !== -1, 'нет данных — «ещё не опрошено»');
        assertTrue(html.indexOf('Обновить сейчас') !== -1, 'кнопка форс-опроса');
        assertTrue(html.indexOf('_weatherNow()') !== -1, 'onclick — _weatherNow');

        sb.WsLcdClock._weatherDiag = { ok: true, txt: '-1°', source: 'meteoinfo.ru',
                                       obs: '16 октября, 04:00' };
        sb.WsLcdClock._renderSettings();
        html = pm.els.wsLcdSet.innerHTML;
        assertTrue(html.indexOf('Есть данные: -1° — meteoinfo.ru') !== -1, 'успешный статус');

        sb.WsLcdClock._weatherDiag = { ok: false, why: 'no-endpoint' };
        sb.WsLcdClock._renderSettings();
        html = pm.els.wsLcdSet.innerHTML;
        assertTrue(html.indexOf('ws-lcd-set-wstat warn') !== -1, 'варнинг-стиль');
        assertTrue(html.indexOf('обновите') !== -1, 'подсказка про Apps Script');
    });

    test('_weatherNow: форс-опрос (сеть дёргается даже при свежем кэше)', () => {
        let calls = 0;
        const sb = lcdSandbox({
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () { calls++; return Promise.resolve({ temp: 5 }); }
            }
        });
        sb.localStorage._s['kip8_ws_weather_v1'] =
            JSON.stringify({ data: { temp: 7 }, ts: Date.now() });
        sb.WsLcdClock._weatherNow();
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(calls, 1, 'сеть вызвана несмотря на свежий кэш');
                resolve();
            }, 20);
        });
    });

    test('ответ погоды перерисовывает ОТКРЫТУЮ панель настроек', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({
            getElementById: pm.getElementById,
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () { return Promise.resolve({ temp: 12, source: 'meteoinfo.ru' }); }
            }
        });
        sb.WsLcdClock._setOpen = true;
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertTrue(pm.els.wsLcdSet.innerHTML.indexOf('Есть данные: +12°') !== -1,
                    'панель обновлена по факту ответа');
                resolve();
            }, 20);
        });
    });

});

// ============================================================
// D. СЕРВЕР — getWeather v2 (заголовки + резерв + диагностика)
// ============================================================
describe('Task 532 D: Сервер — getWeather v2 (open-meteo резерв, diag)', () => {

    test('SRC: браузерные заголовки + URL обоих источников', () => {
        assertTrue(WS_GS_SRC.indexOf("'User-Agent': 'Mozilla/5.0") !== -1,
            'User-Agent как у браузера');
        assertTrue(WS_GS_SRC.indexOf("'Accept-Language': 'ru-RU") !== -1, 'Accept-Language');
        assertTrue(WS_GS_SRC.indexOf('meteoinfo.ru/pogoda/russia/kemerovo-area/kemerovo') !== -1,
            'основной источник meteoinfo.ru');
        assertTrue(WS_GS_SRC.indexOf('api.open-meteo.com/v1/forecast') !== -1,
            'резервный open-meteo.com');
        assertTrue(WS_GS_SRC.indexOf('timezone=Asia%2FNovokuznetsk') !== -1,
            'местное время наблюдения (Кемерово UTC+7)');
        assertTrue(WS_GS_SRC.indexOf('wind_speed_unit=ms') !== -1, 'ветер в м/с');
        assertTrue(WS_GS_SRC.indexOf('_parseOpenMeteo: function') !== -1, 'парсер open-meteo');
    });

    test('_parseOpenMeteo: полный JSON — все поля', () => {
        const sb = wsSandbox({});
        const d = sb.WorkSchedule._parseOpenMeteo(OM_JSON);
        assertEqual(d.temp, -1.6, 'температура');
        assertEqual(d.cloud, 8, 'балл облачности (код 3 → 8)');
        assertEqual(d.phenomenon, 'Пасмурно', 'явление');
        assertEqual(d.wind, 2.55, 'ветер м/с');
        assertEqual(d.windDir, 'З', 'румб 271° → З');
        assertEqual(d.pressure, 764, '1018.1 гПа → 764 мм рт.ст.');
        assertEqual(d.humidity, 73, 'влажность');
        assertEqual(d.obsLocal, '2026-10-16 07:00', 'местное время');
        assertEqual(d.source, 'open-meteo.com', 'источник');
    });

    test('_parseOpenMeteo: WMO-коды → явление/облачность для иконок клиента', () => {
        const sb = wsSandbox({});
        const mk = function (code) {
            return JSON.stringify({ current: { temperature_2m: 1, weather_code: code,
                                               time: '2026-10-16T07:00' } });
        };
        assertEqual(sb.WorkSchedule._parseOpenMeteo(mk(0)).cloud, 0, 'ясно → 0');
        assertEqual(sb.WorkSchedule._parseOpenMeteo(mk(61)).phenomenon, 'Дождь', 'ливень-код');
        assertEqual(sb.WorkSchedule._parseOpenMeteo(mk(71)).phenomenon, 'Снег', 'снег-код');
        assertEqual(sb.WorkSchedule._parseOpenMeteo(mk(95)).phenomenon, 'Гроза', 'гроза-код');
        assertEqual(sb.WorkSchedule._parseOpenMeteo(mk(45)).phenomenon, 'Туман', 'туман-код');
        assertEqual(sb.WorkSchedule._parseOpenMeteo(mk(51)).phenomenon, 'Морось', 'морось-код');
    });

    test('_parseOpenMeteo: мусор/нет температуры → null', () => {
        const sb = wsSandbox({});
        assertEqual(sb.WorkSchedule._parseOpenMeteo('не json'), null, 'не JSON');
        assertEqual(sb.WorkSchedule._parseOpenMeteo('{}'), null, 'нет current');
        assertEqual(sb.WorkSchedule._parseOpenMeteo(
            JSON.stringify({ current: {} })), null, 'пустой current');
    });

    test('getWeather: meteoinfo 403 → РЕЗЕРВ open-meteo (обе попытки в diag)', () => {
        const urls = [];
        const sb = wsSandbox({
            CacheService: noCache(),
            UrlFetchApp: { fetch: function (u) {
                urls.push(u.split('?')[0]);
                if (u.indexOf('meteoinfo') !== -1) {
                    return { getResponseCode: function () { return 403; },
                             getContentText: function () { return 'x'; } };
                }
                return { getResponseCode: function () { return 200; },
                         getContentText: function () { return OM_JSON; } };
            } }
        });
        const r = sb.WorkSchedule.getWeather({ token: 't' });
        assertEqual(r.ok, true, 'ok');
        assertEqual(r.data.temp, -1.6, 'температура из open-meteo');
        assertEqual(r.data.source, 'open-meteo.com', 'источник — резерв');
        assertTrue(r.data.diag.indexOf('meteoinfo:http_403') !== -1, 'diag: 403 основного');
        assertTrue(r.data.diag.indexOf('open-meteo:http_200') !== -1, 'diag: 200 резерва');
        assertEqual(urls.length, 2, 'звали ОБА источника');
    });

    test('getWeather: meteoinfo 200-мусор → parse_empty + резерв', () => {
        const sb = wsSandbox({
            CacheService: noCache(),
            UrlFetchApp: { fetch: function (u) {
                if (u.indexOf('meteoinfo') !== -1) {
                    return { getResponseCode: function () { return 200; },
                             getContentText: function () { return '<html>перевёрстка</html>'; } };
                }
                return { getResponseCode: function () { return 200; },
                         getContentText: function () { return OM_JSON; } };
            } }
        });
        const r = sb.WorkSchedule.getWeather({ token: 't' });
        assertEqual(r.data.source, 'open-meteo.com', 'резерв сработал');
        assertTrue(r.data.diag.indexOf('meteoinfo:parse_empty') !== -1,
            'diag: parse_empty у основного');
    });

    test('getWeather: ОБА источника упали — тихо + diag с причинами', () => {
        const sb = wsSandbox({
            CacheService: noCache(),
            UrlFetchApp: { fetch: function (u) {
                if (u.indexOf('meteoinfo') !== -1) throw new Error('время вышло');
                return { getResponseCode: function () { return 503; },
                         getContentText: function () { return '{"error":true}'; } };
            } }
        });
        const r = sb.WorkSchedule.getWeather({ token: 't' });
        assertEqual(r.ok, true, 'ok даже при полном сбое');
        assertEqual(r.data.temp, null, 'temp null');
        assertEqual(r.data.note, 'weather_unavailable', 'пометка недоступности');
        assertTrue(r.data.diag.indexOf('meteoinfo:exception') !== -1, 'исключение основного');
        assertTrue(r.data.diag.indexOf('open-meteo:http_503') !== -1, '503 резерва');
    });

    test('getWeather: успех — кэш put(1800) и diag в данных', () => {
        const puts = [];
        const sb = wsSandbox({
            CacheService: { getScriptCache: function () {
                return { get: function () { return null; },
                         put: function (k, v, ttl) { puts.push([k, ttl, v]); } };
            } },
            UrlFetchApp: { fetch: function (u) {
                return { getResponseCode: function () { return 200; },
                         getContentText: function () { return OM_JSON; } };
            } }
        });
        const r = sb.WorkSchedule.getWeather({ token: 't' });
        assertEqual(puts.length, 1, 'результат положен в кэш');
        assertEqual(puts[0][0], 'ws_weather_kemerovo_v1', 'ключ кэша');
        assertEqual(puts[0][1], 1800, 'TTL 30 минут');
        assertTrue(r.data.diag.indexOf('open-meteo:http_200') !== -1, 'diag в успешном ответе');
        assertEqual(JSON.parse(puts[0][2]).temp, -1.6, 'в кэше — распарсенные данные');
    });

    test('getWeather: кэш-hit — сеть НЕ зовётся (регрессия)', () => {
        let fetches = 0;
        const sb = wsSandbox({
            CacheService: { getScriptCache: function () {
                return { get: function () { return JSON.stringify({ temp: 5, source: 'meteoinfo.ru' }); },
                         put: function () {} };
            } },
            UrlFetchApp: { fetch: function () { fetches++; throw new Error('не должен зваться'); } }
        });
        const r = sb.WorkSchedule.getWeather({ token: 't' });
        assertEqual(r.data.temp, 5, 'из кэша');
        assertEqual(fetches, 0, 'сеть не тронута');
    });

});

// ============================================================
// E. SW — версия кэша
// ============================================================
describe('Task 532 — SW: версия кэша', () => {

    test('sw.js: CACHE_VERSION = kipia-test-v747', () => {
        const m = SW_SRC.match(/const CACHE_VERSION = '(kipia-test-v\d+)'/);
        assertTrue(m !== null, 'CACHE_VERSION найден');
        assertEqual(m[1], 'kipia-test-v747', 'SW поднят до v745 (Task 532)');
        assertTrue(m[1] !== 'kipia-test-v744', 'старая версия v744 не осталась');
    });

    test('sw.js: нет забегания вперёд (v746 не должно быть)', () => {
        assertFalse(SW_SRC.indexOf('kipia-test-v748') !== -1,
            'двойной бамп не сделан');
    });

});
