// tests/test-task531.js
// Task 531 — доработка LCD-информера Табеля.
// Заявка: «Экран с эффектом утопленного. Секунды смести вниз ровно
//   по нижней линии остального текста, а две точки выравни по
//   середине между часами и минутами. День недели выравни ровно
//   между циферблатом часов и датой. При нажатии на экран информера,
//   сделай слева от блока календаря блок с настройками информера
//   (настройка отображения, частота вывода информации и на своё
//   усмотрение что нибудь ещё полезное). Есть баг - при переключении
//   месяцов в календаре информера, календарь закрывается, и ещё при
//   открытоых шторках итогов учёта или обозначений на календарь
//   накладывается вертикальная полоса.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC HTML/CSS — экран-утопленник (рамка-выступ сохранена),
//      панель настроек #wsLcdSet слева от календаря, z-фикс шторок
//      (:has(#wsLcdCal:not([hidden])) → z 20).
//   B. SRC JS — composedPath-фикс бага закрытия календаря, настройки
//      (_SET_KEY/_SET_DEF/_setGet/_setSave/_renderSettings/_setChange/
//      _setReset/_setTest), центрирование дня, двоеточие x−1,
//      гейтинг блоков настройками, динамические интервалы.
//   C. VM — общая нижняя линия (ряд 12), двоеточие в центре
//      (колонки 16..17), день центрирован (СРЕДА/ПОНЕДЕЛЬНИК/без
//      секунд), скрытие блоков настройками, живое применение
//      _setChange, фильтрация источников, persistence localStorage,
//      регрессия бага календаря (composedPath), toggleCal открывает
//      ОБА блока, _renderSettings разметка.
//   D. SW — kipia-test-v747.
//
// Запуск: через tests/run-all.js (require './test-task531.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ============================================================
// Утилиты (как в test-task530.js)
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

// VM-песочница клиента (с ЗАХВАТОМ document-обработчиков для бага 1)
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

// элементы попапа (мок): календарь + настройки + кнопка
function popupMocks() {
    const els = {
        wsLcdCal: { hidden: true, innerHTML: '', id: 'wsLcdCal' },
        wsLcdSet: { hidden: true, innerHTML: '', id: 'wsLcdSet' },
        wsLcdClock: { setAttribute: function () {} }
    };
    return {
        els: els,
        getElementById: function (id) { return els[id] || null; }
    };
}

// ============================================================
// A. SRC HTML/CSS
// ============================================================
describe('Task 531 A: SRC — экран-утопленник, настройки, z-фикс', () => {

    test('экран УТОПЛЕН: тень-«колодец» сверху + светлая кромка снизу (обе темы)', () => {
        const css = cssBlock();
        assertTrue(css.indexOf('inset 0 2px 3px rgba(0, 0, 0, 0.5)') !== -1,
            'тёмная тема: глубокая тень сверху экрана');
        assertTrue(css.indexOf('inset 0 -1px 0 rgba(255, 255, 255, 0.07)') !== -1,
            'тёмная тема: светлая кромка нижнего края');
        assertTrue(css.indexOf('inset 0 2px 3px rgba(60, 70, 60, 0.42)') !== -1,
            'светлая тема: тень-колодец');
        assertTrue(css.indexOf('inset 0 -1px 0 rgba(255, 255, 255, 0.6)') !== -1,
            'светлая тема: кромка');
    });

    test('рамка-ВЫСТУП сохранена (бордюрчик Task 530 не тронут)', () => {
        const css = cssBlock();
        assertTrue(css.indexOf('inset 0 1px 0 rgba(255, 255, 255, 0.16)') !== -1,
            'блик верхнего края рамки (выступ) на месте');
        assertTrue(css.indexOf('.ws-lcd:hover') !== -1, 'hover-состояние рамки на месте');
    });

    test('HTML: #wsLcdSet внутри #wsLcdWrap; ШЕСТЕРЁНКА #wsLcdGear (Task 532); aria', () => {
        const html = htmlLcdBlock();
        assertTrue(html.indexOf('id="wsLcdCal"') !== -1, 'календарь в блоке');
        const iCal = html.indexOf('id="wsLcdCal"');
        const iSet = html.indexOf('id="wsLcdSet"');
        assertTrue(iSet > iCal, 'настройки идут ПОСЛЕ календаря (оба в обёртке)');
        // Task 532: шестерёнка — правый верхний угол, отдельная кнопка
        const iClock = html.indexOf('id="wsLcdClock"');
        const iGear = html.indexOf('id="wsLcdGear"');
        assertTrue(iGear !== -1, 'кнопка-шестерёнка есть');
        assertTrue(iGear > iClock && iGear < iCal, 'шестерёнка между окном и календарём (правый верх)');
        assertTrue(/id="wsLcdGear"[^>]*aria-label="Настройки информера"/.test(html),
            'aria-label шестерёнки');
        assertTrue(html.indexOf("onclick=\"WsLcdClock.onGearClick(event)\"") !== -1,
            'клик шестерёнки — onGearClick');
        assertTrue(html.indexOf('открыть календарь') !== -1,
            'aria-label ОКНА упоминает только календарь (Task 532)');
        assertTrue(html.indexOf('открыть календарь и настройки') === -1,
            'старая формулировка «календарь и настройки» удалена');
    });

    test('CSS: панель настроек — под ШЕСТЕРЁНКОЙ (right: 0), при открытом календаре — СЛЕВА (Task 532)', () => {
        const css = cssBlock();
        const i = css.indexOf('.ws-lcd-set {');
        assertTrue(i !== -1, 'блок .ws-lcd-set объявлен');
        const chunk = css.slice(i, css.indexOf('}', i) + 1);
        assertTrue(chunk.indexOf('right: 0') !== -1,
            'по умолчанию — у правого края (под шестерёнкой)');
        assertTrue(chunk.indexOf('z-index: 9461') !== -1, 'z-index 9461 (рядом с календарём)');
        const j = css.indexOf('.ws-lcd-wrap:has(#wsLcdCal:not([hidden])) .ws-lcd-set');
        assertTrue(j !== -1, 'правило смещения при открытом календаре есть');
        const shift = css.slice(j, css.indexOf('}', j) + 1);
        assertTrue(shift.indexOf('right: 330px') !== -1,
            'при открытом календаре — левее него (322 + 8)');
        const ih = css.indexOf('.ws-lcd-set[hidden]');
        assertTrue(ih !== -1 && css.slice(ih, css.indexOf('}', ih)).indexOf('display: none') !== -1,
            '[hidden] прячет панель');
        assertTrue(css.indexOf('[data-theme="light"] .ws-lcd-set {') !== -1,
            'светлая тема панели');
    });

    test('CSS: БАГ-фикс полосы шторок — шапка z 20 при открытом попапе', () => {
        const css = cssBlock();
        const i = css.indexOf('#contentArea > #page-work-schedule:has(#wsLcdCal:not([hidden])) > .page-inline-header');
        assertTrue(i !== -1, 'правило :has(#wsLcdCal:not([hidden])) есть');
        const chunk = css.slice(i, css.indexOf('}', i) + 1);
        assertTrue(chunk.indexOf('z-index: 20') !== -1, 'z-index: 20 (выше бортика 5 и шеврона 6)');
        const at = css.lastIndexOf('@media (min-width: 1024px)', i);
        assertTrue(at !== -1 && at > css.indexOf('.ws-lcd-set {'),
            'правило внутри десктопного media-запроса');
    });

});

// ============================================================
// B. SRC JS — баг-фиксы и настройки
// ============================================================
describe('Task 531 B: SRC JS — composedPath, настройки, компоновка', () => {

    test('БАГ 1: клик-закрывалка проверяет composedPath() (снимок пути)', () => {
        const m = lcdModule();
        assertTrue(m.indexOf('ev.composedPath()') !== -1,
            'composedPath() вызывается в обработчике document click');
        assertTrue(m.indexOf("ev.path || []") !== -1, 'fallback на ev.path');
        assertTrue(m.indexOf("t.closest('#wsLcdWrap')") !== -1,
            'fallback на closest сохранён');
        // регрессионный комментарий описывает причину бага
        assertTrue(m.indexOf('ОТДЕЛЁН') !== -1 || m.indexOf('отделён') !== -1,
            'причина бага задокументирована');
    });

    test('настройки: ключ localStorage, умолчания, API-методы', () => {
        const m = lcdModule();
        assertTrue(m.indexOf("_SET_KEY: 'kip8_ws_lcd_set_v1'") !== -1, 'ключ хранения');
        assertTrue(m.indexOf('_SET_DEF: {') !== -1, 'умолчания _SET_DEF');
        ['_setGet', '_setSave', '_renderSettings', '_setChange', '_setReset', '_setTest']
            .forEach(function (fn) {
                assertTrue(m.indexOf(fn + ': function') !== -1, fn + ' определён');
            });
        ['sec:', 'day:', 'weather:', 'feed:', 'feedInt:', 'feedMs:', 'srcTr:', 'srcVac:', 'wthrMin:']
            .forEach(function (k) {
                assertTrue(m.indexOf(k) !== -1, 'поле настроек ' + k);
            });
    });

    test('двоеточие — ЦЕНТР между часами и минутами (ячейка на 1 левее)', () => {
        const m = lcdModule();
        const i = m.indexOf("if (ch === ':') {");
        assertTrue(i !== -1, 'ветка двоеточия в цикле времени');
        const chunk = m.slice(i, m.indexOf('}', m.indexOf('x - 1', i)) + 1);
        assertTrue(chunk.indexOf('x - 1') !== -1, 'глиф рисуется на x−1');
    });

    test('день недели — ЦЕНТР зоны (Math.floor центрирование)', () => {
        const m = lcdModule();
        assertTrue(m.indexOf('DAY_ZONE_B: 108') !== -1, 'константа DAY_ZONE_B');
        assertTrue(m.indexOf('Math.floor((b - a + 1 - w) / 2)') !== -1,
            'формула центрирования слова в зоне');
    });

    test('гейтинг блоков настройками в _composeDefault', () => {
        const m = lcdModule();
        assertTrue(m.indexOf('if (st.sec) {') !== -1, 'секунды — по настройке');
        assertTrue(m.indexOf('if (st.day) {') !== -1, 'день недели — по настройке');
        assertTrue(m.indexOf('if (st.weather) {') !== -1, 'погода — по настройке');
    });

    test('цикл «пейджера» — из настроек (частота/длительность/гейтинг)', () => {
        const m = lcdModule();
        assertTrue(m.indexOf('st.feed && (!this._feedBuilt') !== -1,
            'очередь строится только при включённых сообщениях');
        assertTrue(m.indexOf('this._feedIntMs()') !== -1, 'частота через _feedIntMs()');
        assertTrue(m.indexOf('this._feedMsMs()') !== -1, 'длительность через _feedMsMs()');
        assertTrue(m.indexOf('this._weatherMs()') !== -1, 'период погоды через _weatherMs()');
    });

    test('источники «пейджера» фильтруются настройками', () => {
        const m = lcdModule();
        assertTrue(m.indexOf('if (st.srcTr) {') !== -1, 'инструктажи — по настройке');
        assertTrue(m.indexOf('if (st.srcVac) {') !== -1, 'отпуска — по настройке');
    });

    test('КЛИК-СЕМАНТИКА (Task 532): окно — ТОЛЬКО календарь, шестерёнка — ТОЛЬКО настройки', () => {
        const m = lcdModule();
        assertTrue(m.indexOf('onGearClick: function') !== -1, 'onGearClick определён');
        assertTrue(m.indexOf('toggleSet: function') !== -1, 'toggleSet определён');
        assertTrue(m.indexOf("document.getElementById('wsLcdGear')") !== -1,
            'toggleSet берёт #wsLcdGear (aria-expanded)');
        assertTrue(m.indexOf('_setOpen: false') !== -1, 'состояние _setOpen есть');
        // toggleCal БОЛЬШЕ не трогает настройки — только календарь
        const iCal = m.indexOf('toggleCal: function');
        const iCalEnd = m.indexOf('},', m.indexOf('aria-expanded', iCal));
        const calBody = m.slice(iCal, iCalEnd);
        assertTrue(calBody.indexOf('wsLcdSet') === -1,
            'toggleCal не упоминает #wsLcdSet');
        // закрытие по клику вне/Ec — ОБА попапа
        assertTrue(m.indexOf('self.toggleCal(false);') !== -1 &&
                    m.indexOf('self.toggleSet(false);') !== -1,
            'внешний клик/Ec закрывают оба');
        assertTrue(m.indexOf('if (this._setOpen) this.toggleSet(false);') !== -1,
            'stop() закрывает настройки');
    });

});

// ============================================================
// C. VM — компоновка и настройки
// ============================================================
describe('Task 531 C-1: VM — общая нижняя линия и центрирование', () => {

    test('нижняя линия ЕДИНА: ряд 12 горит у всех блоков, ряд 13 пуст', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._applyWeather({ temp: -12, phenomenon: 'Слабый снег', cloud: 8 });
        // четверг 15.10.2026, 14:56:07 — есть ВСЕ блоки
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 7));
        assertEqual(g[12][35], 1, 'секунды: низ на ряду 12');
        assertEqual(g[12][5], 1, 'время: низ на ряду 12');
        assertEqual(g[12][113], 1, 'дата: низ на ряду 12');
        assertEqual(g[12][173], 1, 'иконка погоды: низ на ряду 12');
        // день ЧЕТВЕРГ центрирован (зона [44..108], w=41 → dx=56):
        // в зоне дня на ряду 12 есть горящие сегменты (низ «Ч»/«Е»/…)
        let dayBottom = 0;
        for (let c = 56; c <= 96; c++) dayBottom += g[12][c];
        assertTrue(dayBottom > 0, 'день недели: низ на ряду 12');
        let row13 = 0;
        for (let c = 0; c < 205; c++) row13 += g[13][c];
        assertEqual(row13, 0, 'ряд 13 полностью пуст — ниже нижней линии ничего нет');
    });

    test('секунды — «ровно по нижней линии»: ряды 8..12, выше/ниже пусто', () => {
        const sb = lcdSandbox();
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 56));
        assertEqual(g[8][35], 1, 'верх «5» на ряду 8');
        assertEqual(g[12][35], 1, 'низ «5» на ряду 12 (общая линия)');
        assertEqual(g[7][35], 0, 'над секундами пусто');
        assertEqual(g[13][35], 0, 'под секундами пусто');
    });

    test('двоеточие — ПОСЕРЕДИНЕ между часами и минутами (колонки 16..17)', () => {
        const sb = lcdSandbox();
        // «14:56»: ячейка двоеточия — кол. 14..19, светятся ТОЛЬКО 16..17
        // (симметричные зазоры 2/2 внутри ячейки: 14..15 и 18..19 чисты
        // при ЛЮБЫХ цифрах — границы глифов часов/минут не пересекаются)
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 0));
        assertEqual(g[6][16], 1, 'верхняя точка: колонка 16');
        assertEqual(g[6][17], 1, 'верхняя точка: колонка 17');
        assertEqual(g[9][16], 1, 'нижняя точка: колонка 16');
        assertEqual(g[9][17], 1, 'нижняя точка: колонка 17');
        // симметрия зазоров ВНУТРИ ячейки двоеточия: 14..15 и 18..19 пусты
        let left = 0, right = 0;
        for (let r = 4; r <= 12; r++) {
            for (let c = 14; c <= 15; c++) left += g[r][c];
            for (let c = 18; c <= 19; c++) right += g[r][c];
        }
        assertEqual(left, 0, 'часы → двоеточие: зазор 2 колонки чист');
        assertEqual(right, 0, 'двоеточие → минуты: зазор 2 колонки чист');
        assertEqual(left, right, 'зазоры СИММЕТРИЧНЫ — двоеточие в центре');
        // вертикально точки тоже по центру цифр (ряды 6..10, центр 8)
        assertEqual(g[8][16], 0, 'между точками (ряд 8) пусто');
    });

    test('день недели — ЦЕНТР между циферблатом и датой (СРЕДА)', () => {
        const sb = lcdSandbox();
        // среда 21.10.2026: СРЕДА w=29, зона [44..108] → dx = 44+18 = 62
        // («С» верхний ряд 01110 — первый светящийся столбец 63)
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 21, 10, 0, 0));
        assertEqual(g[6][63], 1, '«С»: верхняя перекладина с колонки 63 (ячейка 62)');
        assertEqual(g[6][61], 0, 'слева от ячейки «С» пусто');
        assertEqual(g[6][91], 0, 'справа от слова (СРЕДА до кол. 90) пусто');
        // симметрия зазоров: слева 42..61 (20 кол.), справа 91..110 (20 кол.)
        let left = 0, right = 0;
        for (let r = 6; r <= 12; r++) {
            for (let c = 42; c <= 61; c++) left += g[r][c];
            for (let c = 91; c <= 110; c++) right += g[r][c];
        }
        assertEqual(left, 0, 'зазор циферблат → СРЕДА чист');
        assertEqual(right, 0, 'зазор СРЕДА → дата чист');
        assertEqual(left, right, 'зазоры равны — слово ровно в центре зоны');
    });

    test('длинное слово (ПОНЕДЕЛЬНИК) центрируется в зону без наезда', () => {
        const sb = lcdSandbox();
        // понедельник 19.10.2026: w=65 = ширина зоны → dx=44
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 19, 10, 0, 0));
        assertEqual(g[6][44], 1, '«П» на колонке 44');
        assertEqual(g[6][43], 0, 'не наезжает на секунды');
        assertEqual(g[6][109], 0, 'не наезжает на дату (справа чисто)');
        assertEqual(g[6][110], 0, 'зазор до даты (кол. 111) чист');
    });

    test('без секунд день центрируется по ЦИФЕРБЛАТУ (зона шире)', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._setChange('sec', false);
        // понедельник 19.10.2026: циферблат без секунд кончается на 34,
        // зона [35..108], w=65 → dx = 35+4 = 39 («П» верх — колонки 39..43)
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 19, 10, 0, 0));
        assertEqual(g[6][39], 1, '«П» на колонке 39 (центр от циферблата без секунд)');
        assertEqual(g[6][38], 0, 'левее пусто');
        // секунд нет: зона секунд (35..38) полностью пуста во всех рядах
        let secZone = 0;
        for (let r = 0; r < 17; r++)
            for (let c = 35; c <= 38; c++) secZone += g[r][c];
        assertEqual(secZone, 0, 'зона секунд пуста (секунды скрыты)');
        // симметрия зазоров вокруг слова: 33..38 (6) и 104..110 (7) — чисты
        let left = 0, right = 0;
        for (let r = 6; r <= 12; r++) {
            for (let c = 33; c <= 38; c++) left += g[r][c];
            for (let c = 104; c <= 110; c++) right += g[r][c];
        }
        assertEqual(left, 0, 'зазор время → ПОНЕДЕЛЬНИК чист');
        assertEqual(right, 0, 'зазор ПОНЕДЕЛЬНИК → дата чист');
    });

});

describe('Task 531 C-2: VM — настройки: применение и хранение', () => {

    test('_setGet: умолчания при пустом/битом/неполном хранилище', () => {
        const sb = lcdSandbox();
        const s = sb.WsLcdClock._setGet();
        assertEqual(s.sec, true, 'sec по умолчанию');
        assertEqual(s.feedInt, 90, 'feedInt по умолчанию');
        // битый JSON
        sb.localStorage.setItem('kip8_ws_lcd_set_v1', '{мусор');
        sb.WsLcdClock._settings = null;
        const s2 = sb.WsLcdClock._setGet();
        assertEqual(s2.wthrMin, 30, 'битый JSON → умолчания');
        // неполный объект + недопустимые числа
        sb.localStorage.setItem('kip8_ws_lcd_set_v1',
            '{"sec":false,"feedInt":999,"feedMs":"x"}');
        sb.WsLcdClock._settings = null;
        const s3 = sb.WsLcdClock._setGet();
        assertEqual(s3.sec, false, 'валидное значение сохранено');
        assertEqual(s3.feedInt, 90, 'недопустимое число → умолчание');
        assertEqual(s3.feedMs, 8, 'нечисловое значение → умолчание');
    });

    test('_setChange: сохранение в localStorage + немедленное применение', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._setChange('feedInt', 300);
        assertEqual(sb.WsLcdClock._setGet().feedInt, 300, 'значение в кэше настроек');
        assertTrue(sb.localStorage.getItem('kip8_ws_lcd_set_v1').indexOf('"feedInt":300') !== -1,
            'записано в localStorage');
        assertEqual(sb.WsLcdClock._feedIntMs(), 300000, '_feedIntMs: 300 сек → 300000 мс');
        assertEqual(sb.WsLcdClock._feedAt, 0, 'расписание «пейджеров» перепланировано');
    });

    test('динамические интервалы: _feedMsMs/_weatherMs из настроек', () => {
        const sb = lcdSandbox();
        assertEqual(sb.WsLcdClock._feedMsMs(), 8000, 'по умолчанию 8 сек');
        assertEqual(sb.WsLcdClock._weatherMs(), 1800000, 'по умолчанию 30 мин');
        sb.WsLcdClock._setChange('feedMs', 15);
        sb.WsLcdClock._setChange('wthrMin', 60);
        assertEqual(sb.WsLcdClock._feedMsMs(), 15000, '15 сек из настроек');
        assertEqual(sb.WsLcdClock._weatherMs(), 3600000, '60 мин из настроек');
    });

    test('скрытие блоков: секунды/день/погода гаснут на экране', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._applyWeather({ temp: -12, phenomenon: 'Слабый снег', cloud: 8 });
        const before = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 7));
        // погода реально нарисована до выключения
        let wBefore = 0;
        for (let r = 0; r < 17; r++)
            for (let c = 171; c < 205; c++) wBefore += before[r][c];
        assertTrue(wBefore > 0, 'до выключения погода нарисована');
        sb.WsLcdClock._setChange('sec', false);
        sb.WsLcdClock._setChange('day', false);
        sb.WsLcdClock._setChange('weather', false);
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 7));
        let secZone = 0, dayZone = 0, wZone = 0;
        for (let r = 0; r < 17; r++) {
            for (let c = 35; c <= 43; c++) secZone += g[r][c];
            for (let c = 44; c <= 110; c++) dayZone += g[r][c];
            for (let c = 171; c < 205; c++) wZone += g[r][c];
        }
        assertEqual(secZone, 0, 'секунды скрыты — зона пуста');
        assertEqual(dayZone, 0, 'день недели скрыт — зона пуста');
        assertEqual(wZone, 0, 'погода скрыта — иконки и температуры нет');
        // время и дата остались
        assertEqual(g[4][3], 1, 'время на месте');
        assertEqual(g[6][113], 1, 'дата на месте');
    });

    test('_tick: сообщения выключены — «пейджер» НЕ показывается', () => {
        const sb = lcdSandbox();
        sb.window.WorkSchedule = {
            _EMPLOYEES: [], _TRAININGS: [], _VACATIONS: []
        };
        sb.WsLcdClock._timer = 1;
        sb.WsLcdClock._setChange('feed', false);
        sb.WsLcdClock._feed = ['ТЕСТ'];
        sb.WsLcdClock._feedAt = Date.now() - 1;
        sb.WsLcdClock._tick();
        assertEqual(sb.WsLcdClock._msg, null, 'при выключенных сообщениях показа нет');
        // включаем — очередь перестроится и покажет
        sb.WsLcdClock._setChange('feed', true);
        sb.WsLcdClock._feed = ['ТЕСТ'];
        sb.WsLcdClock._feedAt = Date.now() - 1;
        sb.WsLcdClock._tick();
        assertTrue(sb.WsLcdClock._msg !== null, 'после включения «пейджер» показан');
    });

    test('_feedBuild: источники фильтруются настройками', () => {
        const sb = lcdSandbox();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const iso = function (d) {
            return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) +
                   '-' + ('0' + d.getDate()).slice(-2);
        };
        sb.window.WorkSchedule = {
            _EMPLOYEES: [{ 'таб_номер': '1', 'ФИО': 'Иванов И. И.' }],
            _TRAININGS: [{ 'таб_номер': '1', 'тип': 'инструктаж', 'тема': 'ОТ',
                           'дата_начала': iso(today), 'дата_окончания': iso(today) }],
            _VACATIONS: [{ 'таб_номер': '1',
                           'дата_начала': iso(new Date(today.getTime() - 86400000)),
                           'дата_окончания': iso(new Date(today.getTime() + 86400000)) }]
        };
        assertEqual(sb.WsLcdClock._feedBuild().length, 2, 'оба источника по умолчанию');
        sb.WsLcdClock._setChange('srcVac', false);
        const onlyTr = sb.WsLcdClock._feedBuild();
        assertEqual(onlyTr.length, 1, 'отпуска выключены');
        assertTrue(onlyTr[0].indexOf('СЕГОДНЯ') === 0, 'остался инструктаж');
        sb.WsLcdClock._setChange('srcTr', false);
        assertEqual(sb.WsLcdClock._feedBuild().length, 0, 'оба источника выключены');
    });

    test('_setReset: возврат к умолчаниям и очистка хранилища', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._setChange('feedInt', 300);
        sb.WsLcdClock._setChange('sec', false);
        sb.WsLcdClock._setReset();
        assertEqual(sb.localStorage.getItem('kip8_ws_lcd_set_v1'), null,
            'ключ хранилища удалён');
        assertEqual(sb.WsLcdClock._setGet().feedInt, 90, 'частота снова 90 сек');
        assertEqual(sb.WsLcdClock._setGet().sec, true, 'секунды снова включены');
    });

    test('_setTest: показывает тестовое сообщение', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._setTest();
        assertTrue(sb.WsLcdClock._msg !== null, 'сообщение показано');
        assertTrue(sb.WsLcdClock._msg.pages[0][0].indexOf('ТЕСТ') === 0,
            'текст начинается с «ТЕСТ»');
    });

});

describe('Task 531 C-3: VM — панель настроек и календарь', () => {

    test('_renderSettings: разметка панели со всеми пунктами', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        sb.WsLcdClock._renderSettings();
        const html = pm.els.wsLcdSet.innerHTML;
        assertTrue(html.indexOf('Настройки информера') !== -1, 'заголовок');
        // секция «Отображение»
        ['Секунды', 'День недели', 'Погода Кемерово'].forEach(function (t) {
            assertTrue(html.indexOf(t) !== -1, 'пункт «' + t + '»');
        });
        // частота/длительность/источники
        assertTrue(html.indexOf('Частота') !== -1, 'частота сообщений');
        assertTrue(html.indexOf('Показ') !== -1, 'длительность показа');
        assertTrue(html.indexOf('Инструктажи и мероприятия') !== -1, 'источник: инструктажи');
        assertTrue(html.indexOf('Отпуска') !== -1, 'источник: отпуска');
        assertTrue(html.indexOf('Обновление') !== -1, 'период погоды');
        // значения по умолчанию отмечены
        assertTrue(html.indexOf('value="90" selected') !== -1, 'частота 90 сек выбрана');
        assertTrue(html.indexOf('value="30" selected') !== -1, 'погода 30 мин выбрана');
        // кнопки
        assertTrue(html.indexOf('Тест сообщения') !== -1, 'кнопка «Тест сообщения»');
        assertTrue(html.indexOf('>Сброс</button>') !== -1, 'кнопка «Сброс»');
        // изменённое состояние отражается при перерисовке
        sb.WsLcdClock._setChange('sec', false);
        sb.WsLcdClock._renderSettings();
        const html2 = pm.els.wsLcdSet.innerHTML;
        const iSec = html2.indexOf('Секунды');
        const before = html2.lastIndexOf('checkbox', iSec);
        assertTrue(html2.slice(before, before + 20).indexOf('checked') === -1,
            'выключенные секунды — чекбокс без checked');
    });

    test('Task 532: toggleCal — ТОЛЬКО календарь; toggleSet — ТОЛЬКО настройки; оба независимо', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        sb.WsLcdClock.toggleCal(true);
        assertEqual(pm.els.wsLcdCal.hidden, false, 'календарь открыт');
        assertEqual(pm.els.wsLcdSet.hidden, true, 'настройки НЕ тронуты (заявка: только календарь)');
        assertTrue(pm.els.wsLcdCal.innerHTML.indexOf('ws-lcd-cal-grid') !== -1,
            'календарь отрендерен');
        sb.WsLcdClock.toggleSet(true);
        assertEqual(pm.els.wsLcdSet.hidden, false, 'настройки открыты отдельно');
        assertTrue(pm.els.wsLcdSet.innerHTML.indexOf('Настройки информера') !== -1,
            'панель настроек отрендерена');
        sb.WsLcdClock.toggleCal(false);
        assertEqual(pm.els.wsLcdCal.hidden, true, 'календарь закрыт');
        assertEqual(pm.els.wsLcdSet.hidden, false, 'настройки остаются открытыми');
        sb.WsLcdClock.toggleSet(false);
        assertEqual(pm.els.wsLcdSet.hidden, true, 'настройки закрыты');
        // повторное открытие с уже открытым — рендер без дёрганья
        sb.WsLcdClock.toggleSet(true);
        sb.WsLcdClock.toggleSet(true);
        assertEqual(pm.els.wsLcdSet.hidden, false, 'идемпотентно');
    });

    test('РЕГРЕССИЯ БАГА 1: клик по кнопке месяца НЕ закрывает календарь', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        // init() регистрирует document-обработчик — берём его
        sb.WsLcdClock.init();
        const clickHandlers = sb._docListeners['click'];
        assertEqual(clickHandlers.length, 1, 'document click handler зарегистрирован');
        sb.WsLcdClock.toggleCal(true);
        // клик по «‹»: onclick-_calNav перерисовывает innerHTML ДО всплытия;
        // эмулируем: СНАЧАЛА перерисовка (кнопка «отсоединена»), затем клик
        sb.WsLcdClock._calNav(-1);
        const detachedBtn = {
            // ближайшая ЖИВАЯ цепочка родителей оборвана — closest не находит
            closest: function () { return null; }
        };
        const pathThroughWrap = [
            detachedBtn, {}, pm.els.wsLcdCal,
            { id: 'wsLcdWrap' }, sb.document, sb.window
        ];
        clickHandlers.forEach(function (h) {
            h({ target: detachedBtn, composedPath: function () { return pathThroughWrap; } });
        });
        assertEqual(sb.WsLcdClock._calOpen, true,
            'календарь ОТКРЫТ: composedPath нашёл wsLcdWrap (баг 1 исправлен)');
        // клик мимо (путь БЕЗ wsLcdWrap и closest=null) — закрывает
        clickHandlers.forEach(function (h) {
            h({ target: { closest: function () { return null; } },
                composedPath: function () { return [sb.document]; } });
        });
        assertEqual(sb.WsLcdClock._calOpen, false, 'клик мимо — закрыл');
    });

    test('РЕГРЕССИЯ БАГА 1 (fallback): без composedPath живой closest работает', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        sb.WsLcdClock.init();
        const clickHandlers = sb._docListeners['click'];
        sb.WsLcdClock.toggleCal(true);
        // старый браузер: composedPath отсутствует, target ЕЩЁ в DOM
        clickHandlers.forEach(function (h) {
            h({ target: { closest: function () { return { id: 'wsLcdWrap' }; } } });
        });
        assertEqual(sb.WsLcdClock._calOpen, true, 'closest-ветка: клик внутри — не закрыл');
    });

});

// ============================================================
// D. SW — версия кэша
// ============================================================
describe('Task 531 — SW: версия кэша', () => {

    test('sw.js: CACHE_VERSION = kipia-test-v747', () => {
        const m = SW_SRC.match(/const CACHE_VERSION = '(kipia-test-v\d+)'/);
        assertTrue(m !== null, 'CACHE_VERSION найден');
        assertEqual(m[1], 'kipia-test-v747',
            'SW поднят до kipia-test-v747 (index.html менялся — Task 531)');
        assertTrue(m[1] !== 'kipia-test-v743',
            'старая версия kipia-test-v743 не осталась');
    });

});
