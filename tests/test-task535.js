// tests/test-task535.js
// Task 535 — LCD-информер Табеля: глиф «Я» с левой ножкой; день
//   недели и блок погоды смещены правее (зазор дата→погода при
//   короткой температуре 2→7 колонок); календарь — селекты года/
//   месяца ВЫРОВНЕНЫ ПО ВЫСОТЕ с кнопками (30px); светлая тема —
//   ЯРКИЕ стрелки и «Сегодня»; сервер authorizeWeather — полный URL
//   разрешения + подсказка про манифест appsscript.json (до Task 536).
// Заявка: «В окне информера смести немного правее день недели и
//   дату, чтобы погода не примыкала слишком близко к дате, и буква
//   "Я" в дне недели написана без левой ножки, исправь. Выравни по
//   высоте все кнопки года и месяца в календаре, и в светлой теме
//   стрелки в кнопках и надпись Сегодня сделай поярче (сейчас бледные
//   и плохо видно).» + «authorizeWeather результат FAIL … Требуемые
//   разрешения: https://w — …» (обрезка на 90 символах).
// Адаптация Task 536 (заявка: «через сервер погода не загружается»):
//   серверная погода УДАЛЕНА — подсказки манифеста/authorizeWeather
//   больше НЕ проверяются (их нет в коде), геометрия — как была.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — глиф «Я» (ножка), X_DAY=52/зона+9/dxMax, динамическая
//      иконка погоды (tStart−2−8 + кламп X_ICON), CSS высоты и
//      светлой темы, WorkSchedule.gs — серверная погода УДАЛЕНА
//      (Task 536), SW kipia-test-v749.
//   B. VM ГЛИФ — FONT5['Я'] бит-в-бит, ножка диагональю, зеркало R.
//   C. VM ГЕОМЕТРИЯ — ПЯТНИЦА dx=60 (было 56), СРЕДА dx=66 (было 62),
//      ПОНЕДЕЛЬНИК прежний слот 44 (dxMax), без секунд 43; дата
//      X_DATE=111 нетронута; погода «-1°»: иконка 177 (НЕ 172),
//      зазор 170..176 ЧИСТ (не примыкает), температура 187..203;
//      «-12°»: иконка 172 (регресс нет), «--» прежний прочерк.
//   D. VM ПАНЕЛЬ — подсказок сервера НЕТ (Task 536): без
//      appsscript.json/oauthScopes/authorizeWeather.
//   E. SW — kipia-test-v749, нет забегания вперёд (v749).
//
// Запуск: через tests/run-all.js (require './test-task535.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');

// ============================================================
// Утилиты (как в test-task530..534.js)
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
    vm.createContext(sb);
    vm.runInContext(lcdModule(), sb);
    return sb;
}

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

// подсветка колонок ряда r диапазона [a..b]
function rowLit(g, r, a, b) {
    let n = 0;
    for (let c = a; c <= b; c++) n += (g[r][c] ? 1 : 0);
    return n;
}

// ============================================================
// A. SRC — глиф, компоновка, CSS, сервер, SW
// ============================================================
describe('Task 535 A: SRC — «Я», смещение правее, высоты, светлая тема', () => {

    test('SRC: глиф «Я» — левая ножка (ряды 4-6 диагональ)', () => {
        const m = lcdModule();
        assertTrue(m.indexOf(
            "'Я': [0b01111, 0b10001, 0b10001, 0b01111, 0b00101, 0b01001, 0b10001]"
        ) !== -1, 'новый глиф «Я» с ножкой (зеркально R)');
    });

    test('SRC: X_DAY=52 — зона дня смещена ПРАВЕЕ (было 44)', () => {
        const m = lcdModule();
        assertTrue(m.indexOf('X_DAY: 52') !== -1,
            'константа X_DAY обновлена (Task 535)');
        assertTrue(m.indexOf('X_DAY: 44') === -1, 'старое значение убрано');
    });

    test('SRC: зона дня в _composeDefault — clockEnd + 9 (было +1)', () => {
        const m = lcdModule();
        const i = m.indexOf('_composeDefault: function');
        const chunk = m.slice(i, m.indexOf('_composeMsg: function', i));
        assertTrue(chunk.indexOf('clockEnd + 9') !== -1,
            'зона начинается на 9 колонок правее конца циферблата');
    });

    test('SRC: dxMax — слово не ближе 2 колонок к дате (ПОНЕДЕЛЬНИК)', () => {
        const m = lcdModule();
        const i = m.indexOf('_composeDefault: function');
        const chunk = m.slice(i, m.indexOf('_composeMsg: function', i));
        assertTrue(chunk.indexOf('this.X_DATE - 2 - w') !== -1,
            'кламп dxMax = X_DATE − 2 − w есть');
    });

    test('SRC: блок погоды — иконка ВПЛОТНУЮ к температуре (динамически)', () => {
        const m = lcdModule();
        const i = m.indexOf('_composeDefault: function');
        const chunk = m.slice(i, m.indexOf('_composeMsg: function', i));
        assertTrue(chunk.indexOf('tStart - 2 - 8') !== -1,
            'иконка = левый край температуры − 2 − 8');
        assertTrue(chunk.indexOf('if (iconX < this.X_ICON) iconX = this.X_ICON') !== -1,
            'кламп: длинная «-12°» — иконка не левее X_ICON');
    });

    test('SRC: дата X_DATE=111 НЕ тронута (компоновка стабильна)', () => {
        const m = lcdModule();
        assertTrue(m.indexOf('X_DATE: 111') !== -1, 'X_DATE остался 111');
        assertTrue(m.indexOf('R_TEMP: 203') !== -1, 'R_TEMP остался 203');
    });

    test('SRC: селекты года/месяца — ВЫСОТА как у кнопок (30px)', () => {
        const css = cssBlock();
        const i = css.indexOf('.ws-lcd-cal-year select, .ws-lcd-cal-month select {');
        const chunk = css.slice(i, css.indexOf('}', css.indexOf('min-height', i)) + 1);
        assertTrue(chunk.indexOf('min-height: 30px') !== -1,
            'селекты min-height 30px (заявка: «выравни по высоте все кнопки»)');
        assertTrue(chunk.indexOf('box-sizing: border-box') !== -1,
            'box-sizing: border-box — паддинги не раздувают высоту');
    });

    test('SRC: светлая тема — ЯРКИЕ стрелки и «Сегодня» (#141413 на #fff)', () => {
        const css = cssBlock();
        const i = css.indexOf('[data-theme="light"] .ws-lcd-cal-nav,');
        assertTrue(i !== -1, 'light-оверрайд нав/сегодня объявлен');
        const chunk = css.slice(i, css.indexOf('}', i) + 1);
        assertTrue(chunk.indexOf('color: #141413') !== -1,
            'тёмный контрастный текст (было бледное rgba(200,215,230,.9))');
        assertTrue(chunk.indexOf('background: #fff') !== -1, 'белая подложка');
    });

    test('SRC: светлая тема — hover стрелок/«Сегодня» контрастный', () => {
        const css = cssBlock();
        const i = css.indexOf('[data-theme="light"] .ws-lcd-cal-nav:hover,');
        assertTrue(i !== -1, 'hover-оверрайд есть');
        const chunk = css.slice(i, css.indexOf('}', i) + 1);
        assertTrue(chunk.indexOf('color: #0d1822') !== -1, 'hover — ещё темнее');
    });

    test('SRC: клиентские подсказки сервера УДАЛЕНЫ (Task 536)', () => {
        const m = lcdModule();
        const i = m.indexOf('var wd = this._weatherDiag;');
        const chunk = m.slice(i, m.indexOf("'<div class=\"ws-lcd-set-wstat\"", i));
        assertTrue(chunk.indexOf('appsscript.json') === -1,
            'подсказки про манифест больше НЕТ (серверной погоды нет — Task 536)');
        assertTrue(chunk.indexOf('oauthScopes') === -1,
            'подсказки про массив oauthScopes больше НЕТ');
        assertTrue(chunk.indexOf('authorizeWeather') === -1,
            'упоминаний authorizeWeather больше НЕТ во всём клиенте');
        assertTrue(chunk.indexOf('Task 536') !== -1,
            'новый комментарий объясняет: только прямые каналы');
    });

    test('SRC: WorkSchedule.gs — authorizeWeather УДАЛЕНА (Task 536)', () => {
        assertTrue(WS_GS_SRC.indexOf('function authorizeWeather()') === -1,
            'функция удалена — серверных запросов погоды больше нет');
        assertTrue(WS_GS_SRC.indexOf('slice(0, 220)') === -1,
            'хвост 220 удалён вместе с функцией');
        assertTrue(WS_GS_SRC.indexOf(
            "var SCOPE = 'https://www.googleapis.com/auth/script.external_request'") === -1,
            'SCOPE-константа удалена');
    });

    test('SRC: WorkSchedule.gs — инструкция/ЛЕЧЕНИЕ/манифест УДАЛЕНЫ (Task 536)', () => {
        assertTrue(WS_GS_SRC.indexOf(
            'ЕСЛИ ШАГ 3 НЕ ПОЯВИЛСЯ, А ОШИБКА ПОВТОРЯЕТСЯ') === -1,
            'инструкция авторизации удалена (авторизовать больше нечего)');
        assertTrue(WS_GS_SRC.indexOf('ЛЕЧЕНИЕ') === -1,
            'маркер подсказки удалён');
        assertTrue(WS_GS_SRC.indexOf('oauthScopes БЕЗ script.external_request') === -1,
            'диагноз из заявки Task 535 больше не нужен');
    });

    test('SRC: diag getWeather — срезы 90 УДАЛЕНЫ (вместе с эндпоинтом)', () => {
        assertTrue(WS_GS_SRC.indexOf('e).slice(0, 90)') === -1,
            'meteoinfo diag 90 удалён (Task 536)');
        assertTrue(WS_GS_SRC.indexOf('e4).slice(0, 90)') === -1,
            'open-meteo diag 90 удалён (Task 536)');
    });

});

// ============================================================
// B. VM — глиф «Я»: биты, ножка, зеркало R
// ============================================================
describe('Task 535 B: VM — глиф «Я» (левая ножка)', () => {

    test('FONT5[«Я»] — новый узор бит-в-бит', () => {
        const sb = lcdSandbox();
        assertEqual(sb.WsLcdClock.FONT5['Я'].join(','),
            [0b01111, 0b10001, 0b10001, 0b01111, 0b00101, 0b01001, 0b10001].join(','),
            'узор Я = чаша + левая ножка');
    });

    test('ножка — ДИАГОНАЛЬ вниз-влево (ряды 4→5→6: кол. 2→1→0)', () => {
        const sb = lcdSandbox();
        const ya = sb.WsLcdClock.FONT5['Я'];
        assertEqual(ya[4], 0b00101, 'ряд 4: колонки 2 и 4');
        assertEqual(ya[5], 0b01001, 'ряд 5: колонки 1 и 4');
        assertEqual(ya[6], 0b10001, 'ряд 6: колонки 0 и 4 (ножка дошла до края)');
        assertTrue(!!(ya[6] & 0b10000), 'левый нижний пиксель ГОРИТ (было пусто)');
    });

    test('«Я» — точное зеркало латинской R (ноги симметричны)', () => {
        const sb = lcdSandbox();
        const ya = sb.WsLcdClock.FONT5['Я'];
        const r = sb.WsLcdClock.FONT5['R'];
        function rev(b) {
            let o = 0;
            for (let c = 0; c < 5; c++) if (b & (1 << c)) o |= 1 << (4 - c);
            return o;
        }
        for (let row = 0; row < 7; row++) {
            assertEqual(ya[row], rev(r[row]), 'ряд ' + row + ' — зеркало R');
        }
    });

});

// ============================================================
// C. VM ГЕОМЕТРИЯ — день недели правее, погода не примыкает
// ============================================================
describe('Task 535 C: VM — компоновка (день/погода правее, зазоры)', () => {

    test('ПЯТНИЦА 16.10.2026 — слово на 60 (было 56): смещено ПРАВЕЕ', () => {
        const sb = lcdSandbox();
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 16, 10, 39, 0));
        assertEqual(g[6][60], 1, '«П» начинается на колонке 60 (верхняя перекладина)');
        assertEqual(g[6][56], 0, 'старая позиция (56) теперь пуста');
        assertEqual(g[6][64], 1, '«П» перекладина до колонки 64');
    });

    test('СРЕДА 21.10.2026 — слово на 66 (было 62), зазоры чисты', () => {
        const sb = lcdSandbox();
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 21, 10, 0, 0));
        assertEqual(g[6][67], 1, '«С»: верхняя перекладина с колонки 67 (ячейка 66)');
        assertEqual(g[6][63], 0, 'старый центр (63) пуст — слово уехало правее');
        // зазоры: слева 42..65, справа 95..110 — чисты (слово 66..94)
        let left = 0, right = 0;
        for (let r = 6; r <= 12; r++) {
            left += rowLit(g, r, 42, 65);
            right += rowLit(g, r, 95, 110);
        }
        assertEqual(left, 0, 'зазор циферблат → СРЕДА чист');
        assertEqual(right, 0, 'зазор СРЕДА → дата чист');
    });

    test('ПОНЕДЕЛЬНИК 19.10.2026 — прежний слот 44 (dxMax, без наезда)', () => {
        const sb = lcdSandbox();
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 19, 10, 0, 0));
        assertEqual(g[6][44], 1, '«П» на колонке 44 (как было)');
        assertEqual(g[6][43], 0, 'не наезжает на секунды');
        assertEqual(g[6][109], 0, 'не наезжает на дату');
        assertEqual(g[6][110], 0, 'зазор до даты чист');
    });

    test('без секунд ПОНЕДЕЛЬНИК — «П» на 43 (зона тоже правее)', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._setChange('sec', false);
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 19, 10, 0, 0));
        assertEqual(g[6][43], 1, '«П» на колонке 43 (было 39)');
        assertEqual(g[6][39], 0, 'старая позиция пуста');
    });

    test('дата «16.10.2026» — X_DATE=111 нетронут (ряды 6..12)', () => {
        const sb = lcdSandbox();
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 16, 10, 39, 0));
        assertEqual(g[6][113], 1, '«1» даты на X_DATE+2');
        assertEqual(g[6][111], 0, 'слева от даты пусто');
    });

    test('погода «-1°»: иконка на 177 (НЕ 172) — блок прижат к правому краю', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._applyWeather({ temp: -1, phenomenon: 'Слабый снег',
                                      cloud: 8 });
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 16, 10, 39, 0));
        // snow: r0=0b00111000 → колонки iconX+2..iconX+4
        assertEqual(g[5][179], 1, 'облако иконки: колонка 179 (иконка с 177)');
        assertEqual(g[5][181], 1, 'облако иконки: колонка 181');
        assertEqual(g[5][174], 0, 'старая позиция иконки (172..179) теперь пуста');
        assertEqual(g[12][178], 1, 'снежинка-крестик: ряд 12 (низ = общая линия)');
        assertEqual(g[12][184], 1, 'снежинка-крестик: правый край иконки (184)');
    });

    test('погода «-1°»: зазор дата→иконка 170..176 ЧИСТ (не примыкает)', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._applyWeather({ temp: -1, phenomenon: 'Слабый снег',
                                      cloud: 8 });
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 16, 10, 39, 0));
        // дата кончается на 169; иконка начинается на 177 → 7 колонок воздуха
        let gap = 0;
        for (let r = 5; r <= 12; r++) gap += rowLit(g, r, 170, 176);
        assertEqual(gap, 0, 'семь колонок между датой и погодой — чисто');
        // и зазор иконка→температура (185..186) — ровно 2 колонки
        let gap2 = 0;
        for (let r = 5; r <= 12; r++) gap2 += rowLit(g, r, 185, 186);
        assertEqual(gap2, 0, 'иконка вплотную к температуре (2 колонки)');
    });

    test('погода «-1°»: температура 187..203, «°» у правого края', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._applyWeather({ temp: -1, phenomenon: 'Слабый снег',
                                      cloud: 8 });
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 16, 10, 39, 0));
        // «-1°» = 3 глифа: '-' на 187 (ряд 9: кол. 188..190), «°» на 199
        // (ряды 6..8: кол. 200..203; крайняя 203 — ряд 7, глиф-ряд 1 = 0b01001)
        assertEqual(g[9][189], 1, 'минус температуры на ряду 9');
        assertEqual(g[6][201], 1, '«°» верхний ряд — колонка 201');
        assertEqual(g[7][203], 1, 'правый край температуры (203) на ряду 7');
    });

    test('погода «+5°»: тот же динамический сдвиг (177)', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._applyWeather({ temp: 5, phenomenon: 'Пасмурно',
                                      cloud: 10 });
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 16, 10, 39, 0));
        // cloud: r0=0b00000000? первый горящий ряд облака — ниже; проверим
        // фактический диапазон колонок блока погоды
        let minX = 999;
        for (let r = 0; r < 17; r++)
            for (let c = 170; c < 205; c++)
                if (g[r][c] && c < minX) minX = c;
        assertEqual(minX, 177, 'блок погоды (иконка) начинается с 177');
    });

    test('погода «-12°»: иконка 172 (кламп) — регресса НЕТ', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._applyWeather({ temp: -12, phenomenon: 'Слабый снег',
                                      cloud: 8 });
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 16, 10, 39, 0));
        assertEqual(g[5][174], 1, 'облако иконки: колонка 174 (иконка с 172)');
        assertEqual(g[12][179], 1, 'снежинка: правый край иконки (179)');
        // температура 181..203 — прижата вправо, как раньше
        // («°» глиф-ряд 1 = 0b01001 → экран ряд 7, кол. 203)
        assertEqual(g[7][203], 1, 'правый край температуры 203');
    });

    test('погода «--» (нет данных): прочерк у правого края, как прежде', () => {
        const sb = lcdSandbox();
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 16, 10, 39, 0));
        assertEqual(g[9][194], 1, 'прочерк (первый «-») нарисован');
        assertEqual(g[9][200], 1, 'прочерк (второй «-») нарисован');
        assertEqual(g[9][204], 0, 'правее прочерка пусто');
    });

    test('погода скрыта настройкой — правая часть пуста', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._applyWeather({ temp: -1, phenomenon: 'Слабый снег',
                                      cloud: 8 });
        sb.WsLcdClock._setChange('weather', false);
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 16, 10, 39, 0));
        let wZone = 0;
        for (let r = 0; r < 17; r++) wZone += rowLit(g, r, 170, 204);
        assertEqual(wZone, 0, 'иконки и температуры нет');
    });

});

// ============================================================
// D. VM — панель настроек: подсказка про манифест
// ============================================================
describe('Task 535 D: VM — панель (подсказок сервера НЕТ — Task 536)', () => {

    test('diag сбоя — БЕЗ манифеста/области/authorizeWeather', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        sb.WsLcdClock._weatherDiag = {
            ok: false, why: 'network',
            direct: 'Failed to fetch', wttr: 'Failed to fetch'
        };
        sb.WsLcdClock._renderSettings();
        const html = pm.els.wsLcdSet.innerHTML;
        assertTrue(html.indexOf('appsscript.json') === -1,
            'манифест НЕ упоминается (сервер удалён — Task 536)');
        assertTrue(html.indexOf('script.external_request') === -1,
            'область НЕ упоминается');
        assertTrue(html.indexOf('oauthScopes') === -1,
            'массив oauthScopes НЕ упоминается');
        assertTrue(html.indexOf('authorizeWeather') === -1,
            'authorizeWeather НЕ упоминается');
        assertTrue(html.indexOf('Прямые запросы open-meteo/wttr.in не прошли') !== -1,
            'статус объясняет сбой прямых каналов');
        assertTrue(html.indexOf('ws-lcd-set-wstat warn') !== -1, 'варнинг-стиль');
    });

    test('diag БЕЗ причин — тоже без подсказок сервера', () => {
        const pm = popupMocks();
        const sb = lcdSandbox({ getElementById: pm.getElementById });
        sb.WsLcdClock._weatherDiag = {
            ok: false, why: 'server',
            direct: 'http_503', wttr: 'http_502',
            diag: 'meteoinfo:http_403; open-meteo:http_503'
        };
        sb.WsLcdClock._renderSettings();
        const html = pm.els.wsLcdSet.innerHTML;
        assertTrue(html.indexOf('appsscript.json') === -1,
            'лишняя подсказка про манифест не показывается');
        assertTrue(html.indexOf('(прямой запрос: open-meteo: http_503; ' +
                               'wttr.in: http_502)') !== -1,
            'причины обоих каналов различимы (legacy diag тоже рендерится)');
    });

});

// ============================================================
// E. SW — версия кеша
// ============================================================
describe('Task 535 E: SW — версия кеша', () => {

    test('SW: kipia-test-v749, забегания вперёд нет (v749)', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v749'") !== -1,
            'CACHE_VERSION = kipia-test-v749');
        assertTrue(SW_SRC.indexOf('kipia-test-v750') === -1, 'v749 не появилась');
        assertTrue(SW_SRC.indexOf('kipia-test-v747') === -1, 'v747 убрана');
    });

});

