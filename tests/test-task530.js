// tests/test-task530.js
// Task 530 — доработка LCD-окна «пейджер» в баре крошек Табеля.
// Заявка: «Рамки экрана сделай с эффектом выступа - бордюрчик, и в
//   светлой теме сделай светлым цветом. Цифры секунд перемести
//   справа от минут и меньше шрифтом, а точки мигать не должны.
//   Данные размести в одну линию, после времени - день недели и
//   затем дату. «призрачная» сетка не должна быть видна. Примыкание
//   рамок сверху и снизу к краям бара сделай вплотную и саму рамку
//   прямоугольную с прямыми углами без скруглений. Добавь
//   отображение погоды в Кемерово из источника https://meteoinfo.ru/
//   с иконкой отображающей погоду. Длину окна по горизонтали можешь
//   сделать больше на сколько это необходимо но всегда фиксированной.
//   Подключи вывод реальных сообщений. И самое главное, внимательно
//   проверь размеры квадратных пикселей должны быть одинаковые и
//   сетка пикселей ровная, перепроверь и сделай ровно.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC HTML/CSS — эффект выступа, светлый бордюр светлой темы,
//      прямые углы, вплотную к бару, эллипсис заголовка, «--»-слот.
//   B. SRC JS — заявочные пункты: нет мигания (нет %2-логики),
//      нет призраков (нет ghost), секунды малым шрифтом справа,
//      одна строка (X_TIME < X_SEC < X_DAY < X_DATE < X_ICON),
//      погода (meteoinfo.ru → getWeather), реальные сообщения
//      (_feedBuild из данных Табеля), фиксированная длина (размер
//      канваса = COLS×pitch, не зависит от данных).
//   C. VM — компоновка одной строки, иконки погоды, температура
//      (+3°/-12°/0°/--), очередь реальных сообщений и её цикл,
//      загрузка погоды (кэш/сеть/сбой), ровная сетка при разных DPR.
//   D. СЕРВЕР — WorkSchedule.gs getWeather (кэш 30 мин, тихий
//      фолбэк), _parseMeteoinfo на РЕАЛЬНОМ HTML meteoinfo.ru
//      (фикстура страницы Кемерово), роутинг в Code.gs.
//   E. SW — kipia-test-v744 (Task 531).
//
// АДАПТАЦИЯ Task 531: компоновка приведена к ОБЩЕЙ НИЖНЕЙ ЛИНИИ ряда
//   12 (секунды 8..12, текст 6..12, иконка 5..12), день недели
//   центрируется в зоне [X_DAY..DAY_ZONE_B], двоеточие — центр
//   между часами и минутами; длительность «пейджера» — из настроек
//   (_feedMsMs). Детали новых фич — в test-task531.js.
//
// Запуск: через tests/run-all.js (require './test-task530.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');
const CODE_GS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'Code.gs'), 'utf8');

// Реальная таблица наблюдений meteoinfo.ru, Кемерово (15.10.2026
// 13:00 местного): снята со страницы https://meteoinfo.ru/pogoda/
// russia/kemerovo-area/kemerovo — фикстура парсера «как есть»
const FIXTURE_KEMEROVO = '<table border="0" style="width:100%"><tr><td colspan="2" align="right"  style="border-bottom: 1px solid #D3D3D3;" >15 октября, 13:00&nbsp;(время местное)</td></tr><tr><td  align="right" width="60%"  style="border-bottom: 1px solid #D3D3D3;" >Атмосферное давление на уровне станции, <nobr>мм рт.ст.</td><td width="40%"  style="border-bottom: 1px solid #D3D3D3;"  align="center">759</td></tr><tr><td width="60%"  style="border-bottom: 1px solid #D3D3D3;"  align="right">Температура воздуха, &deg;C</td><td width="40%"  style="border-bottom: 1px solid #D3D3D3;"  align="center">3</td></tr><tr><td width="60%"  style="border-bottom: 1px solid #D3D3D3;"  align="right">Относительная влажность, %</td><td width="40%"  style="border-bottom: 1px solid #D3D3D3;"  align="center">68.1</td></tr><tr><td width="60%"  style="border-bottom: 1px solid #D3D3D3;"  align="right"></td><td width="40%"  style="border-bottom: 1px solid #D3D3D3;"  align="center">Количество облаков не изменилось</td></tr><tr><td width="60%"  style="border-bottom: 1px solid #D3D3D3;"  align="right">Направление ветра</td><td width="40%"  style="border-bottom: 1px solid #D3D3D3;"  align="center">северо-западный</td></tr><tr><td width="60%"  style="border-bottom: 1px solid #D3D3D3;"  align="right">Средняя скорость ветра, м/с</td><td width="40%"  style="border-bottom: 1px solid #D3D3D3;"  align="center">4</td></tr><tr><td width="60%"  style="border-bottom: 1px solid #D3D3D3;"  align="right">Балл общей облачности</td><td width="40%"  style="border-bottom: 1px solid #D3D3D3;"  align="center">7</td></tr><tr><td width="60%"  style="border-bottom: 1px solid #D3D3D3;"  align="right">Горизонтальная видимость, км</td><td width="40%"  style="border-bottom: 1px solid #D3D3D3;"  align="center">10</td></tr></table>';

// ============================================================
// Утилиты (как в test-task529.js, плюс серверная песочница)
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

// VM-песочница клиента
function lcdSandbox(opts) {
    opts = opts || {};
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
            addEventListener: function () {},
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
        }
    };
    if (opts.kipAuth) sb.KipAuth = opts.kipAuth;
    vm.createContext(sb);
    vm.runInContext(lcdModule(), sb);
    return sb;
}

// Канвас + рамка (мок DOM для draw)
function canvasMock(hostRect, paddings) {
    const rects = [];
    const ctx = {
        fillStyle: '', shadowColor: '', shadowBlur: 0,
        fillRect: function (x, y, w, h) { rects.push([x, y, w, h]); }
    };
    const cv = { width: 0, height: 0, style: {}, getContext: function () { return ctx; } };
    const host = { getBoundingClientRect: function () { return hostRect; } };
    Object.defineProperty(cv, 'parentElement', { value: host });
    const p = Object.assign({ paddingTop: '1px', paddingBottom: '1px',
        borderTopWidth: '1px', borderBottomWidth: '1px' }, paddings || {});
    const gcs = function () {
        return {
            getPropertyValue: function (n) {
                if (p[n] !== undefined) return p[n];
                return ({ '--ws-lcd-bg': '#0e1a13', '--ws-lcd-seg': '#93e6a4',
                          '--ws-lcd-glow': 'none' })[n] || '';
            }
        };
    };
    return { cv: cv, host: host, ctx: ctx, rects: rects, gcs: gcs };
}

// VM-песочница СЕРВЕРА (WorkSchedule.gs) с моками Apps Script
function wsSandbox(mocks) {
    mocks = mocks || {};
    const sb = {
        CacheService: mocks.CacheService,
        UrlFetchApp: mocks.UrlFetchApp,
        rmRequirePerm: undefined
    };
    vm.createContext(sb);
    vm.runInContext(WS_GS_SRC, sb);
    // авторизация отключается тестом напрямую (_requireRead подменён)
    return sb;
}

// ============================================================
// A. SRC HTML/CSS — заявка Task 530
// ============================================================
describe('Task 530 A: SRC — рамка-выступ, прямые углы, светлая тема', () => {

    test('эффект ВЫСТУПА: светлый блик сверху + тень снизу (бордюрчик)', () => {
        const css = cssBlock();
        const i = css.indexOf('.ws-lcd {');
        const blk = css.slice(i, css.indexOf('}', i));
        assertTrue(blk.indexOf('inset 0 1px 0 rgba(255, 255, 255, 0.16)') !== -1,
            'верхний край залит светом — панель приподнята');
        assertTrue(blk.indexOf('inset 0 -1px 0 rgba(0, 0, 0, 0.5)') !== -1,
            'нижний край в тени');
        assertTrue(css.indexOf('ЭФФЕКТОМ ВЫСТУПА') !== -1, 'комментарий объясняет эффект');
    });

    test('светлая тема — СВЕТЛЫЙ бордюрчик (заявка: «светлым цветом»)', () => {
        const css = cssBlock();
        const i = css.indexOf('[data-theme="light"] .ws-lcd {');
        const blk = css.slice(i, css.indexOf('}', i));
        assertTrue(blk.indexOf('background: #e7e2d5') !== -1, 'светлый корпус #e7e2d5');
        assertTrue(blk.indexOf('inset 0 1px 0 rgba(255, 255, 255, 0.9)') !== -1,
            'светлый блик выступа в светлой теме');
    });

    test('прямые углы БЕЗ скруглений: рамка и экран border-radius: 0', () => {
        const css = cssBlock();
        let n = 0, idx = -1;
        while ((idx = css.indexOf('border-radius: 0', idx + 1)) !== -1) n++;
        assertTrue(n >= 2, 'border-radius: 0 минимум у рамки и экрана: ' + n);
        const iFrame = css.indexOf('.ws-lcd {');
        const blkFrame = css.slice(iFrame, css.indexOf('}', iFrame));
        assertTrue(blkFrame.indexOf('border-radius: 0') !== -1, 'рамка прямоугольная');
        const iScr = css.indexOf('.ws-lcd-screen {');
        const blkScr = css.slice(iScr, css.indexOf('}', iScr));
        assertTrue(blkScr.indexOf('border-radius: 0') !== -1, 'экран прямоугольный');
        assertFalse(css.indexOf('border-radius: 9px') !== -1, 'старое скругление 9px удалено');
        assertFalse(css.indexOf('border-radius: 4px') !== -1, 'старое скругление 4px удалено');
    });

    test('вплотную к краям бара: align-self: stretch + height: 100%', () => {
        const css = cssBlock();
        const i = css.indexOf('#page-work-schedule .page-inline-header .ws-lcd-wrap');
        const blk = css.slice(i, css.indexOf('}', i));
        assertTrue(blk.indexOf('align-self: stretch') !== -1, 'обёртка растянута на высоту бара');
        const j = css.indexOf('.ws-lcd {');
        const blkFrame = css.slice(j, css.indexOf('}', j));
        assertTrue(blkFrame.indexOf('height: 100%') !== -1, 'рамка на всю высоту бара');
    });

    test('«призрачная» сетка полностью УДАЛЕНА (нет --ws-lcd-ghost)', () => {
        const css = cssBlock();
        assertFalse(css.indexOf('--ws-lcd-ghost') !== -1, 'переменная ghost удалена из CSS');
        const m = lcdModule();
        assertFalse(m.indexOf('--ws-lcd-ghost') !== -1, 'ghost удалён из JS-отрисовки');
        assertFalse(m.indexOf('призрак') !== -1 || m.indexOf('призрач') !== -1 &&
            m.indexOf('НЕ рисуется') === -1, 'нет рендера выключенных сегментов');
    });

    test('заголовок бара: эллипсис при узком окне (нет наезда на LCD)', () => {
        const css = cssBlock();
        assertTrue(css.indexOf(':has(.ws-lcd-wrap) .page-inline-header-title') !== -1,
            'правило :has(.ws-lcd-wrap) для заголовка');
        const i = css.indexOf(':has(.ws-lcd-wrap) .page-inline-header-title');
        const blk = css.slice(i, css.indexOf('}', i));
        assertTrue(blk.indexOf('text-overflow: ellipsis') !== -1, 'ellipsis');
        assertTrue(blk.indexOf('white-space: nowrap') !== -1, 'nowrap');
    });

});

// ============================================================
// B. SRC JS — заявочные пункты компоновки и логики
// ============================================================
describe('Task 530 B: SRC JS — одна строка, секунды, погода, сообщения', () => {

    test('двоеточие НЕ мигает: в модуле НЕТ логики «% 2» у секунд', () => {
        const m = lcdModule();
        assertFalse(m.indexOf('getSeconds() % 2') !== -1,
            'мигание двоеточия (чёт/нечёт секунда) удалено');
        assertFalse(m.indexOf('двоеточие мигает') !== -1, 'комментарий про мигание удалён');
        assertTrue(m.indexOf('НЕ мигает') !== -1, 'документация: двоеточие горит постоянно');
    });

    test('секунды — малым шрифтом 3×5 СПРАВА от минут (FONTSMALL + X_SEC)', () => {
        const sb = lcdSandbox();
        assertTrue(sb.WsLcdClock.FONTSMALL !== undefined, 'FONTSMALL 3×5 определён');
        const m = lcdModule();
        assertTrue(m.indexOf('FONTSMALL[ss.charAt(i)]') !== -1, 'секунды рисуются FONTSMALL');
        assertTrue(sb.WsLcdClock.X_SEC > 33 && sb.WsLcdClock.X_SEC < 44,
            'X_SEC=35 — правее минут (время занимает 1..32)');
    });

    test('одна строка: время → секунды → день → дата → погода (X_* возрастают)', () => {
        const sb = lcdSandbox();
        const X = sb.WsLcdClock;
        assertTrue(X.X_TIME < X.X_SEC, 'время левее секунд');
        assertTrue(X.X_SEC < X.X_DAY, 'секунды левее дня недели (заявка: после времени — день)');
        assertTrue(X.X_DAY < X.X_DATE, 'день недели левее даты (заявка: затем дату)');
        assertTrue(X.X_DATE < X.X_ICON, 'погода — в конце строки');
        assertTrue(X.X_ICON + 8 <= X.R_TEMP, 'иконка 8×8 левее температуры');
        assertEqual(X.COLS, 205, 'матрица 205 колонок');
    });

    test('погодные иконки 8×8: 7 типов, каждая 8 строк по 8 бит', () => {
        const sb = lcdSandbox();
        const names = ['sun', 'suncloud', 'cloud', 'rain', 'snow', 'storm', 'fog'];
        names.forEach(function (n) {
            const ic = sb.WsLcdClock._wIcons[n];
            assertTrue(Array.isArray(ic), 'иконка ' + n + ' есть');
            assertEqual(ic.length, 8, n + ': 8 строк');
            ic.forEach(function (row) {
                assertTrue(typeof row === 'number' && row >= 0 && row <= 255,
                    n + ': ряд ' + row + ' — 8 бит');
            });
        });
    });

    test('погода из meteoinfo.ru: клиент зовёт workSchedule.getWeather', () => {
        const m = lcdModule();
        assertTrue(m.indexOf("KipAuth.api('workSchedule.getWeather'") !== -1,
            'запрос эндпоинта workSchedule.getWeather');
        assertTrue(m.indexOf('meteoinfo.ru') !== -1, 'источник задокументирован');
        assertTrue(m.indexOf('_applyWeather: function') !== -1, '_applyWeather');
        assertTrue(m.indexOf('_mapWeatherIcon: function') !== -1, '_mapWeatherIcon');
        assertTrue(m.indexOf('_weatherSchedule: function') !== -1, '_weatherSchedule');
    });

    test('РЕАЛЬНЫЕ сообщения: _feedBuild из данных Табеля + цикл в _tick', () => {
        const m = lcdModule();
        assertTrue(m.indexOf('_feedBuild: function') !== -1, '_feedBuild определён');
        assertTrue(m.indexOf('_TRAININGS') !== -1, 'мероприятия Табеля — источник');
        assertTrue(m.indexOf('_VACATIONS') !== -1, 'отпуска Табеля — источник');
        assertTrue(m.indexOf('_EMPLOYEES') !== -1, 'справочник ФИО — источник');
        assertTrue(m.indexOf('FEED_INT') !== -1 && m.indexOf('FEED_MS') !== -1,
            'параметры цикла «пейджера»');
        assertTrue(m.indexOf("showMessage(txt, undefined, this._feedMsMs())") !== -1,
            'тик показывает реальное сообщение через showMessage (Task 531: длительность из настроек)');
    });

});

// ============================================================
// C. VM — компоновка, погода, лента сообщений, ровная сетка
// ============================================================
describe('Task 530 C-1: VM — одна строка данных', () => {

    test('время крупно в зоне строк 4..12; верх/низ экрана ПУСТЫ', () => {
        const sb = lcdSandbox();
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 7));
        let r0 = 0, r16 = 0;
        for (let c = 0; c < 205; c++) { r0 += g[0][c]; r16 += g[16][c]; }
        assertEqual(r0, 0, 'ряд 0 пуст (данные по центру, не сверху)');
        assertEqual(r16, 0, 'ряд 16 пуст');
        assertEqual(g[4][3], 1, '«1» времени начинается с ряда 4');
        assertEqual(g[12][5], 1, '«1» времени доходит до ряда 12');
    });

    test('секунды «56» малым шрифтом на X_SEC=35, ряды 8..12 (Task 531: по нижней линии)', () => {
        const sb = lcdSandbox();
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 56));
        // «5» малым: ряд 8 → 0b111 → колонки 35,36,37 (Task 531: низ = ряд 12
        // — общая нижняя линия с крупными цифрами времени)
        assertEqual(g[8][35], 1, '«5»: верхняя перекладина (левая)');
        assertEqual(g[8][37], 1, '«5»: верхняя перекладина (правая)');
        assertEqual(g[12][35], 1, '«5»: нижняя перекладина (ряд 12 — общая нижняя линия)');
        assertEqual(g[7][35], 0, 'над секундами пусто (шрифт 5 строк)');
        assertEqual(g[13][35], 0, 'под секундами пусто (ниже общей нижней линии)');
        // вторая цифра «6» на x=39: 0b111 ряд 8 → колонки 39..41
        assertEqual(g[8][39], 1, '«6» секунд на позиции 39');
        // слева от секунд (колонка 42..43) пусто — зазор до дня недели
        assertEqual(g[8][42], 0, 'зазор между секундами и днём недели');
        assertEqual(g[8][43], 0, 'зазор 2 колонки');
    });

    test('день недели ПОНЕДЕЛЬНИК (полное слово) — центр зоны, ряды 6..12', () => {
        const sb = lcdSandbox();
        // 19.10.2026 — понедельник; слово шириной 65 = вся зона [44..108]
        // → центрирование даёт dx=44 (симметричные зазоры 2/2 до секунд и даты)
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 19, 10, 0, 0));
        // «П» = 11111 ряд 0 глифа → матрица ряд 6, колонки 44..48 (Task 531:
        // ряды 6..12 — общая нижняя линия)
        assertEqual(g[6][44], 1, '«П»: верхняя перекладина (левая)');
        assertEqual(g[6][48], 1, '«П»: верхняя перекладина (правая)');
        assertEqual(g[12][44], 1, '«П»: левая ножка до низа (общая нижняя линия)');
        assertEqual(g[12][46], 0, '«П»: середина пуста');
        // слово длинное (11 символов → колонки 44..102), зазор до даты
        let lit = 0;
        for (let c = 44; c <= 108; c++) if (g[8][c]) lit++;
        assertTrue(lit > 0, 'ПОНЕДЕЛЬНИК реально нарисован в слоте дня');
    });

    test('дата «15.10.2026» на X_DATE=111 (ряды 6..12), погода-прочерк справа', () => {
        const sb = lcdSandbox();
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 0));
        // «1» даты: глиф 00100 → колонка 111+2=113, ряд 6 (Task 531: ряды 6..12)
        assertEqual(g[6][113], 1, '«1» даты на X_DATE+2');
        assertEqual(g[6][111], 0, 'слева от «1» даты пусто');
        // без погоды — прочерк «--»: ряд 9 (середина глифа «-» = ряд 3 глифа,
        // верх текста теперь ряд 6)
        // «-» = [0,0,0,01110,0,0,0] → ряд 6+3=9, колонки 194..196 и 200..202
        assertEqual(g[9][194], 1, 'прочерк погоды (первый «-») нарисован');
        assertEqual(g[9][200], 1, 'прочерк погоды (второй «-») нарисован');
        assertEqual(g[9][204], 0, 'правее прочерка пусто (прижат к краю)');
    });

    test('иконка погоды 8×8 на X_ICON=172, ряды 5..12 (Task 531: общая нижняя линия)', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._applyWeather({ temp: -12, phenomenon: 'Слабый снег',
                                      cloud: 8 });
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 0));
        // snow: r0=0b00111000 → колонки 174,175,176; r7=0b01010101 → 173,175,177,179
        assertEqual(g[5][174], 1, 'облако иконки снега: ряд 5');
        assertEqual(g[5][176], 1, 'облако иконки снега: ряд 5 (правая часть)');
        assertEqual(g[12][173], 1, 'снежинка-крестик: ряд 12 (низ иконки = общая нижняя линия)');
        assertEqual(g[12][179], 1, 'снежинка-крестик: ряд 12 (правый край)');
        // температура «-12°»: 4 глифа, прижата вправо: последний глиф «°»
        // в колонках 200..204? «°» = [00110,01001,00110,0,0,0,0] → ряды 6..8,
        // колонки 200+1=201,202 (первый) и 202,203 — «°» рисуется x=199+1..; проверим хвост
        let rightmost = -1;
        for (let c = 180; c < 205; c++) if (g[8][c]) rightmost = Math.max(rightmost, c);
        assertTrue(rightmost > 195 && rightmost <= 203,
            'температура прижата к правому краю (крайний сегмент: ' + rightmost + ')');
    });

});

describe('Task 530 C-2: VM — погода: форматы и иконки', () => {

    test('_applyWeather: +3° / -12° / 0° формат температуры', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._applyWeather({ temp: 3, cloud: 7 });
        assertEqual(sb.WsLcdClock._weather.tempTxt, '+3°', 'положительная — со знаком «+»');
        sb.WsLcdClock._applyWeather({ temp: -12, cloud: 8 });
        assertEqual(sb.WsLcdClock._weather.tempTxt, '-12°', 'отрицательная — с минусом');
        sb.WsLcdClock._applyWeather({ temp: 0, cloud: 0 });
        assertEqual(sb.WsLcdClock._weather.tempTxt, '0°', 'ноль — без знака');
        sb.WsLcdClock._applyWeather({ temp: 2.6, cloud: 7 });
        assertEqual(sb.WsLcdClock._weather.tempTxt, '+3°', 'дробная округляется');
        sb.WsLcdClock._applyWeather({ temp: null });
        assertEqual(sb.WsLcdClock._weather.tempTxt, '--', 'нет данных — прочерк');
    });

    test('_mapWeatherIcon: явления → иконки (гроза/снег/дождь/туман)', () => {
        const sb = lcdSandbox();
        const map = sb.WsLcdClock._mapWeatherIcon.bind(sb.WsLcdClock);
        assertEqual(map({ phenomenon: 'Гроза с ливнем' }), 'storm', 'гроза');
        assertEqual(map({ phenomenon: 'Слабый снег' }), 'snow', 'снег');
        assertEqual(map({ phenomenon: 'Метель, умеренная' }), 'snow', 'метель');
        assertEqual(map({ phenomenon: 'Дождь' }), 'rain', 'дождь');
        assertEqual(map({ phenomenon: 'Морось' }), 'rain', 'морось → дождь');
        assertEqual(map({ phenomenon: 'Туман' }), 'fog', 'туман');
        assertEqual(map({ phenomenon: 'Дымка' }), 'fog', 'дымка → туман');
    });

    test('_mapWeatherIcon: балл облачности 0..10 → sun/suncloud/cloud', () => {
        const sb = lcdSandbox();
        const map = sb.WsLcdClock._mapWeatherIcon.bind(sb.WsLcdClock);
        assertEqual(map({ phenomenon: 'Количество облаков не изменилось', cloud: 0 }), 'sun',
            'балл 0..2 — ясно');
        assertEqual(map({ phenomenon: 'Количество облаков не изменилось', cloud: 2 }), 'sun',
            'балл 2 — ясно');
        assertEqual(map({ phenomenon: 'Количество облаков не изменилось', cloud: 3 }), 'suncloud',
            'балл 3..7 — переменная');
        assertEqual(map({ phenomenon: 'Количество облаков не изменилось', cloud: 7 }), 'suncloud',
            'балл 7 — переменная');
        assertEqual(map({ phenomenon: 'Количество облаков не изменилось', cloud: 8 }), 'cloud',
            'балл 8..10 — облачно');
        assertEqual(map({ phenomenon: 'Количество облаков не изменилось', cloud: 10 }), 'cloud',
            'балл 10 — пасмурно');
        assertEqual(map({ phenomenon: null, cloud: null }), null, 'нет данных — без иконки');
    });

    test('_loadWeather: мгновенный показ из localStorage-кэша, сеть НЕ зовётся', () => {
        let apiCalls = 0;
        const sb = lcdSandbox({
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () { apiCalls++; return Promise.resolve({ temp: 9 }); }
            }
        });
        sb.localStorage._s['kip8_ws_weather_v1'] =
            JSON.stringify({ data: { temp: 7, cloud: 2 }, ts: Date.now() });
        sb.WsLcdClock._loadWeather(false);
        assertEqual(sb.WsLcdClock._weather.tempTxt, '+7°', 'кэш применён мгновенно');
        assertEqual(apiCalls, 0, 'свежий кэш — сеть не дёргается');
    });

    test('_loadWeather: несвежий кэш → сеть, результат сохранён в localStorage', () => {
        const sb = lcdSandbox({
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () { return Promise.resolve({ temp: -8, cloud: 10 }); }
            }
        });
        sb.localStorage._s['kip8_ws_weather_v1'] =
            JSON.stringify({ data: { temp: 7 }, ts: Date.now() - 2 * 3600000 });
        sb.WsLcdClock._loadWeather(false);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(sb.WsLcdClock._weather.tempTxt, '-8°', 'свежие данные с сети');
                const c = JSON.parse(sb.localStorage._s['kip8_ws_weather_v1']);
                assertEqual(c.data.temp, -8, 'результат записан в localStorage');
                resolve();
            }, 20);
        });
    });

    test('_loadWeather: сбой сети/старый сервер — тихо, без ошибок', () => {
        const sb = lcdSandbox({
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () { return Promise.reject(new Error('unknown_action')); }
            }
        });
        sb.WsLcdClock._loadWeather(true);
        return new Promise(function (resolve) {
            setTimeout(function () {
                assertEqual(sb.WsLcdClock._weather, null, 'погода не установлена (тихий сбой)');
                resolve();
            }, 20);
        });
    });

});

describe('Task 530 C-3: VM — РЕАЛЬНЫЕ сообщения из данных Табеля', () => {

    // общий мок WorkSchedule с данными (на window — как в браузере:
    // top-level var WorkSchedule == window.WorkSchedule)
    function wsDataSandbox(overrides) {
        const sb = lcdSandbox();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const iso = function (d) {
            return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) +
                   '-' + ('0' + d.getDate()).slice(-2);
        };
        const tomorrow = new Date(today.getTime() + 86400000);
        const after = new Date(today.getTime() + 2 * 86400000);
        sb.window.WorkSchedule = {
            _EMPLOYEES: [
                { 'таб_номер': '0871', 'ФИО': 'Иванов И. И.' },
                { 'таб_номер': '1204', 'ФИО': 'Петров П. П.' }
            ],
            _TRAININGS: [
                // сегодня — инструктаж
                { 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Охрана труда',
                  'дата_начала': iso(today), 'дата_окончания': iso(today) },
                // завтра — обучение
                { 'таб_номер': '1204', 'тип': 'обучение', 'тема': 'КипиА',
                  'дата_начала': iso(tomorrow), 'дата_окончания': iso(tomorrow) },
                // послезавтра — НЕ попадает
                { 'таб_номер': '0871', 'тип': 'проверка_знаний', 'тема': 'Электробезопасность',
                  'дата_начала': iso(after), 'дата_окончания': iso(after) },
                // мусорная дата — пропускается
                { 'таб_номер': '1204', 'тип': 'обучение', 'тема': 'Хлам',
                  'дата_начала': null, 'дата_окончания': null }
            ],
            _VACATIONS: [
                // активный отпуск
                { 'таб_номер': '0871', 'дата_начала': iso(new Date(today.getTime() - 3 * 86400000)),
                  'дата_окончания': iso(new Date(today.getTime() + 10 * 86400000)) },
                // будущий — не активен
                { 'таб_номер': '1204', 'дата_начала': iso(new Date(today.getTime() + 20 * 86400000)),
                  'дата_окончания': iso(new Date(today.getTime() + 30 * 86400000)) }
            ]
        };
        if (overrides) overrides(sb);
        return sb;
    }

    test('_feedBuild: мероприятие сегодня + завтра + активный отпуск', () => {
        const sb = wsDataSandbox();
        const feed = sb.WsLcdClock._feedBuild();
        assertEqual(feed.length, 3, 'три реальных сообщения: ' + JSON.stringify(feed));
        assertTrue(feed[0].indexOf('СЕГОДНЯ инструктаж: Охрана труда - Иванов И. И.') === 0,
            'сегодняшнее мероприятие: ' + feed[0]);
        assertTrue(feed[1].indexOf('ЗАВТРА обучение: КипиА - Петров П. П.') === 0,
            'завтрашнее мероприятие: ' + feed[1]);
        assertTrue(feed[2].indexOf('ОТПУСК: Иванов И. И. ') === 0,
            'активный отпуск: ' + feed[2]);
        // послезавтра и мусор не попали
        feed.forEach(function (f) {
            assertFalse(f.indexOf('Электробезопасность') !== -1, 'послезавтра — вне ленты');
            assertFalse(f.indexOf('Хлам') !== -1, 'мусорная дата — вне ленты');
            assertFalse(f.indexOf('Петров') !== -1 && f.indexOf('ОТПУСК') !== -1,
                'будущий отпуск — вне ленты');
        });
    });

    test('_feedBuild: пустой WorkSchedule / нет данных → пустая очередь', () => {
        const sb = lcdSandbox();
        assertEqual(sb.WsLcdClock._feedBuild().length, 0, 'нет WorkSchedule — пусто');
        const sb2 = lcdSandbox();
        sb2.WorkSchedule = { _TRAININGS: [], _VACATIONS: [], _EMPLOYEES: [] };
        assertEqual(sb2.WsLcdClock._feedBuild().length, 0, 'пустые массивы — пусто');
    });

    test('_isoD: разбор YYYY-MM-DD и мусора', () => {
        const sb = lcdSandbox();
        const d = sb.WsLcdClock._isoD('2026-10-15');
        assertEqual(d.getFullYear(), 2026, 'год');
        assertEqual(d.getMonth(), 9, 'месяц (октябрь = 9)');
        assertEqual(d.getDate(), 15, 'день');
        assertEqual(sb.WsLcdClock._isoD(null), null, 'null → null');
        assertEqual(sb.WsLcdClock._isoD('мусор'), null, 'мусор → null');
    });

    test('_tick: очередь строится, первый «пейджер» — через FEED_DELAY', () => {
        const sb = wsDataSandbox();
        sb.WsLcdClock._timer = 1;              // «страница открыта»
        sb.WsLcdClock._tick();
        assertEqual(sb.WsLcdClock._feed.length, 3, 'очередь построена из реальных данных');
        assertTrue(sb.WsLcdClock._feedAt > Date.now() + 10000, 'первый пейджер отложен');
        assertEqual(sb.WsLcdClock._msg, null, 'сообщение сразу НЕ показывается');
        // досрочно «наступаем» на момент показа
        sb.WsLcdClock._feedAt = Date.now() - 1;
        sb.WsLcdClock._lastSec = -1;
        sb.WsLcdClock._tick();
        assertTrue(sb.WsLcdClock._msg !== null, 'пейджер показан');
        assertTrue(sb.WsLcdClock._msg.pages[0][0].indexOf('СЕГОДНЯ') === 0,
            'первое сообщение — «СЕГОДНЯ…»');
        assertTrue(sb.WsLcdClock._feedAt > Date.now(), 'следующий пейджер через FEED_INT');
    });

    test('_tick: во время сообщения очередь НЕ дёргается (показ не прерывается)', () => {
        const sb = wsDataSandbox();
        sb.WsLcdClock._timer = 1;
        sb.WsLcdClock._msg = { pages: [['ВНЕШНЕЕ', 'СООБЩЕНИЕ']], idx: 0,
                               until: Date.now() + 5000, nextFlip: Date.now() + 99999 };
        const feedAtBefore = sb.WsLcdClock._feedAt;
        sb.WsLcdClock._tick();
        assertEqual(sb.WsLcdClock._msg.pages[0][0], 'ВНЕШНЕЕ', 'сообщение продолжает показ');
        assertEqual(sb.WsLcdClock._feedAt, feedAtBefore, 'очередь не тронута во время показа');
    });

});

describe('Task 530 C-4: VM — РОВНАЯ СЕТКА (главное заявки)', () => {

    test('draw: pitch ЦЕЛЫЙ, канвас кратен матрице, CSS = device/dpr', () => {
        const mk = canvasMock({ width: 640, height: 56 });
        const sb = lcdSandbox({
            dpr: 2,
            getElementById: function (id) { return id === 'wsLcdCanvas' ? mk.cv : null; },
            getComputedStyle: mk.gcs
        });
        sb.WsLcdClock._grid = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 0));
        sb.WsLcdClock.draw();
        const p = sb.WsLcdClock._pitch;
        assertTrue(Number.isInteger(p) && p >= 2, 'pitch целый device-пиксель: ' + p);
        assertEqual(mk.cv.width, 205 * p, 'ширина канваса = 205×pitch');
        assertEqual(mk.cv.height, 17 * p, 'высота канваса = 17×pitch');
        assertEqual(mk.cv.style.width, String(205 * p / 2) + 'px', 'CSS-ширина = device/dpr');
        assertEqual(mk.cv.style.height, String(17 * p / 2) + 'px', 'CSS-высота = device/dpr');
    });

    test('draw: все сегменты ОДИНАКОВОГО размера в решётке pitch (любой DPR)', () => {
        [1, 1.25, 1.5, 2, 2.5, 3].forEach(function (dpr) {
            const mk = canvasMock({ width: 700, height: 56 });
            const sb = lcdSandbox({
                dpr: dpr,
                getElementById: function (id) { return id === 'wsLcdCanvas' ? mk.cv : null; },
                getComputedStyle: mk.gcs
            });
            sb.WsLcdClock._grid = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 0));
            sb.WsLcdClock.draw();
            const p = sb.WsLcdClock._pitch;
            assertTrue(Number.isInteger(p), 'DPR ' + dpr + ': pitch целый (' + p + ')');
            const segs = mk.rects.slice(1);        // [0] — фон
            let badSize = 0, badGrid = 0;
            segs.forEach(function (rc) {
                if (rc[2] !== segs[0][2] || rc[3] !== segs[0][2]) badSize++;
                if (rc[0] % p !== 0 || rc[1] % p !== 0) badGrid++;
            });
            assertEqual(badSize, 0, 'DPR ' + dpr + ': все сегменты одинаковы (' + badSize + ')');
            assertEqual(badGrid, 0, 'DPR ' + dpr + ': все на кратных pitch позициях');
        });
    });

    test('draw: сторона сегмента = min(pitch-1, round(pitch*0.78)) — квадраты с зазором', () => {
        const mk = canvasMock({ width: 700, height: 56 });
        const sb = lcdSandbox({
            dpr: 2,
            getElementById: function (id) { return id === 'wsLcdCanvas' ? mk.cv : null; },
            getComputedStyle: mk.gcs
        });
        sb.WsLcdClock._grid = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 0));
        sb.WsLcdClock.draw();
        const p = sb.WsLcdClock._pitch;
        const side = Math.min(p - 1, Math.round(p * 0.78));
        assertEqual(mk.rects[1][2], side, 'сторона сегмента по формуле');
        assertEqual(mk.rects[1][3], side, 'сегмент КВАДРАТНЫЙ (ширина = высота)');
        assertTrue(side >= 1 && side < p, 'зазор между сегментами ≥ 1 device-пиксель');
    });

    test('draw: ДЛИНА ОКНА ФИКСИРОВАНА — размер не зависит от данных', () => {
        // два РАЗНЫХ экрана (часы и сообщение «пейджер»)
        const mk = canvasMock({ width: 700, height: 56 });
        const sb = lcdSandbox({
            dpr: 2,
            getElementById: function (id) { return id === 'wsLcdCanvas' ? mk.cv : null; },
            getComputedStyle: mk.gcs
        });
        sb.WsLcdClock._grid = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 0));
        sb.WsLcdClock.draw();
        const w1 = mk.cv.width, h1 = mk.cv.height, cw1 = mk.cv.style.width;
        sb.WsLcdClock._msg = { pages: [['ОЧЕНЬ ДЛИННОЕ СООБЩЕНИЕ ПЕЙДЖЕРА', 'ВТОРАЯ СТРОКА']], idx: 0 };
        sb.WsLcdClock._grid = sb.WsLcdClock._composeMsg();
        sb.WsLcdClock.draw();
        assertEqual(mk.cv.width, w1, 'ширина канваса не изменилась');
        assertEqual(mk.cv.height, h1, 'высота канваса не изменилась');
        assertEqual(mk.cv.style.width, cw1, 'CSS-ширина не изменилась');
    });

    test('draw: разных высотах бара — pitch подстраивается (2/3/6 при 34/52/104)', () => {
        [
            { rect: { width: 640, height: 36 }, dpr: 1, expect: 2 },   // 32/17 → 2? нет: 36-4=32 → floor(32/17)=1 → min 2
            { rect: { width: 640, height: 56 }, dpr: 1, expect: 3 },   // 52/17 → 3
            { rect: { width: 640, height: 56 }, dpr: 2, expect: 6 }    // 104/17 → 6
        ].forEach(function (cfg) {
            const mk = canvasMock(cfg.rect);
            const sb = lcdSandbox({
                dpr: cfg.dpr,
                getElementById: function (id) { return id === 'wsLcdCanvas' ? mk.cv : null; },
                getComputedStyle: mk.gcs
            });
            sb.WsLcdClock._grid = sb.WsLcdClock._composeDefault(new Date());
            sb.WsLcdClock.draw();
            const note = 'бар ' + cfg.rect.height + 'px @DPR' + cfg.dpr;
            if (cfg.expect === 2) {
                assertTrue(sb.WsLcdClock._pitch >= 2, note + ': минимум pitch 2');
            } else {
                assertEqual(sb.WsLcdClock._pitch, cfg.expect, note + ': pitch ' + cfg.expect);
            }
        });
    });

    test('start/stop: погода грузится на старте, таймер погоды чистится на стопе', () => {
        let loaded = 0;
        const sb = lcdSandbox({
            kipAuth: {
                getToken: function () { return 'tok'; },
                api: function () { loaded++; return Promise.resolve({ temp: 5, cloud: 1 }); }
            }
        });
        sb.WsLcdClock._timer = null;
        sb.WsLcdClock.start();
        assertEqual(loaded, 1, '_loadWeather вызван из start()');
        sb.WsLcdClock._weatherTimer = 12345;
        sb.WsLcdClock.stop();
        assertEqual(sb.WsLcdClock._weatherTimer, null, 'таймер погоды очищен');
        assertEqual(sb.WsLcdClock._feedAt, 0, 'пауза пейджера сброшена');
    });

});

// ============================================================
// D. СЕРВЕР — getWeather + _parseMeteoinfo (реальный HTML)
// ============================================================
describe('Task 530 D: Сервер — getWeather (meteoinfo.ru, кэш 30 мин)', () => {

    test('WorkSchedule.gs: getWeather и _parseMeteoinfo определены', () => {
        assertTrue(WS_GS_SRC.indexOf('getWeather: function') !== -1, 'getWeather');
        assertTrue(WS_GS_SRC.indexOf('_parseMeteoinfo: function') !== -1, '_parseMeteoinfo');
        assertTrue(WS_GS_SRC.indexOf('meteoinfo.ru/pogoda/russia/kemerovo-area/kemerovo') !== -1,
            'URL страницы погоды Кемерово');
        assertTrue(WS_GS_SRC.indexOf('ws_weather_kemerovo_v1') !== -1, 'ключ кэша');
        assertTrue(WS_GS_SRC.indexOf('1800') !== -1, 'кэш скрипта 1800 с (30 мин)');
    });

    test('Code.gs: роутинг workSchedule.getWeather', () => {
        assertTrue(CODE_GS_SRC.indexOf("case 'workSchedule.getWeather':") !== -1,
            'кейс маршрута');
        assertTrue(CODE_GS_SRC.indexOf('WorkSchedule.getWeather(payload)') !== -1,
            'вызов в doPost');
    });

    test('_parseMeteoinfo: РЕАЛЬНАЯ таблица Кемерово — все поля', () => {
        const sb = wsSandbox();
        const d = sb.WorkSchedule._parseMeteoinfo(FIXTURE_KEMEROVO);
        assertEqual(d.temp, 3, 'температура 3°C');
        assertEqual(d.cloud, 7, 'балл облачности 7');
        assertEqual(d.wind, 4, 'ветер 4 м/с');
        assertEqual(d.windDir, 'северо-западный', 'направление ветра');
        assertEqual(d.humidity, 68.1, 'влажность 68.1%');
        assertEqual(d.pressure, 759, 'давление 759 мм рт.ст.');
        assertEqual(d.obsLocal, '15 октября, 13:00', 'время наблюдения');
        assertEqual(d.phenomenon, 'Количество облаков не изменилось', 'строка явления');
        assertEqual(d.source, 'meteoinfo.ru', 'источник');
    });

    test('_parseMeteoinfo: дробная/отрицательная температура и мусор', () => {
        const sb = wsSandbox();
        const html = FIXTURE_KEMEROVO
            .replace('>3</td>', '>-11.5</td>');
        const d = sb.WorkSchedule._parseMeteoinfo(html);
        assertEqual(d.temp, -11.5, 'отрицательная дробная температура');
        assertEqual(sb.WorkSchedule._parseMeteoinfo('<html>мусор</html>'), null,
            'чужой HTML → null');
        assertEqual(sb.WorkSchedule._parseMeteoinfo(''), null, 'пусто → null');
    });

    test('getWeather: кэш скриптаhit — сеть НЕ зовётся', () => {
        let fetches = 0;
        const cached = { temp: 5, cloud: 3, source: 'meteoinfo.ru' };
        const sb = wsSandbox({
            CacheService: {
                getScriptCache: function () {
                    return {
                        get: function (k) { return k === 'ws_weather_kemerovo_v1' ? JSON.stringify(cached) : null; },
                        put: function () {}
                    };
                }
            },
            UrlFetchApp: {
                fetch: function () { fetches++; throw new Error('не должен зваться'); }
            }
        });
        sb.WorkSchedule._requireRead = function () { return { user: {} }; };
        const r = sb.WorkSchedule.getWeather({ token: 't' });
        assertEqual(r.ok, true, 'ok');
        assertEqual(r.data.temp, 5, 'данные из кэша');
        assertEqual(fetches, 0, 'сеть не тронута');
    });

    test('getWeather: сеть → парсинг → кэш put(1800)', () => {
        const puts = [];
        const sb = wsSandbox({
            CacheService: {
                getScriptCache: function () {
                    return {
                        get: function () { return null; },
                        put: function (k, v, ttl) { puts.push([k, ttl]); }
                    };
                }
            },
            UrlFetchApp: {
                fetch: function (url, opts) {
                    assertEqual(url, 'https://meteoinfo.ru/pogoda/russia/kemerovo-area/kemerovo',
                        'URL meteoinfo.ru Кемерово');
                    assertTrue(opts.muteHttpExceptions, 'muteHttpExceptions');
                    return { getResponseCode: function () { return 200; },
                             getContentText: function () { return FIXTURE_KEMEROVO; } };
                }
            }
        });
        sb.WorkSchedule._requireRead = function () { return { user: {} }; };
        const r = sb.WorkSchedule.getWeather({ token: 't' });
        assertEqual(r.ok, true, 'ok');
        assertEqual(r.data.temp, 3, 'температура распарсена с meteoinfo.ru');
        assertEqual(r.data.cloud, 7, 'облачность распарсена');
        assertEqual(puts.length, 1, 'результат положен в кэш');
        assertEqual(puts[0][0], 'ws_weather_kemerovo_v1', 'ключ кэша');
        assertEqual(puts[0][1], 1800, 'TTL 30 минут');
    });

    test('getWeather: сбой сети — тихий weather_unavailable (НЕ ошибка)', () => {
        const sb = wsSandbox({
            CacheService: {
                getScriptCache: function () {
                    return { get: function () { return null; }, put: function () {} };
                }
            },
            UrlFetchApp: {
                fetch: function () { throw new Error('network down'); }
            }
        });
        sb.WorkSchedule._requireRead = function () { return { user: {} }; };
        const r = sb.WorkSchedule.getWeather({ token: 't' });
        assertEqual(r.ok, true, 'ok даже при сбое (тихий ответ)');
        assertEqual(r.data.temp, null, 'temp null');
        assertEqual(r.data.note, 'weather_unavailable', 'пометка недоступности');
    });

    test('getWeather: HTTP 500 — тоже тихий фолбэк', () => {
        const sb = wsSandbox({
            CacheService: {
                getScriptCache: function () {
                    return { get: function () { return null; }, put: function () {} };
                }
            },
            UrlFetchApp: {
                fetch: function () { return { getResponseCode: function () { return 500; },
                                             getContentText: function () { return 'err'; } }; }
            }
        });
        sb.WorkSchedule._requireRead = function () { return { user: {} }; };
        const r = sb.WorkSchedule.getWeather({ token: 't' });
        assertEqual(r.data.temp, null, 'temp null при HTTP 500');
    });

    test('getWeather: нет авторизации — ошибка сессии', () => {
        const sb = wsSandbox();
        sb.WorkSchedule._requireRead = function () {
            return { error: { ok: false, error: 'no_session' } };
        };
        const r = sb.WorkSchedule.getWeather({ token: 'bad' });
        assertEqual(r.ok, false, 'не ok');
        assertEqual(r.error, 'no_session', 'ошибка авторизации пробрасывается');
    });

});

// ============================================================
// E. SW — версия кэша
// ============================================================
describe('Task 530 — SW: версия кэша', () => {

    test('sw.js: CACHE_VERSION = kipia-test-v744', () => {
        const m = SW_SRC.match(/const CACHE_VERSION = '(kipia-test-v\d+)'/);
        assertTrue(m !== null, 'CACHE_VERSION найден');
        assertEqual(m[1], 'kipia-test-v744', 'SW поднят до v744 (Task 531)');
        assertTrue(m[1] !== 'kipia-test-v743', 'старая версия v743 не осталась');
    });

});
