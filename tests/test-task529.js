// tests/test-task529.js
// Task 529: «В десктопной версии, в разделе Табель учёта рабочего
//   времени, в баре с хлебными крошками, справа сделай окно с рамками
//   и эффектом вдавливания с показаниями текущего времени и датой, с
//   возможностью открытия календаря по месяцам. Сделай в стиле как на
//   приложенном фото, только из квадратных сегментов в поле окна с
//   разрешением к примеру 10х60 или лучше выбери сам оптимальное
//   разрешение пикселей экрана с заделом что на этом экране могут
//   выводиться сообщения в две строки (по типу как раньше было на
//   пейджерах).»
//
// ЧТО ПРОВЕРЯЕТСЯ (пятью слоями):
//   Слой 1 — SRC HTML: #wsLcdWrap (кнопка #wsLcdClock с canvas
//     #wsLcdCanvas 96×17 + #wsLcdCal hidden) внутри бара крошек
//     #page-work-schedule, ПОСЛЕ заголовка; aria-атрибуты; onclick.
//   Слой 2 — SRC CSS: .ws-lcd-wrap скрыт <1024px, ≥1024px — flex
//     справа (margin-left:auto); «вдавливание» — inset-тени корпуса и
//     экрана; пропорция экрана 96/17; image-rendering: pixelated;
//     темы (тёмная «подсветка» / светлая «как на фото») через
//     --ws-lcd-*; календарь — absolute, z-index 9460, hidden.
//   Слой 3 — SRC JS: var WsLcdClock — COLS=96/ROWS=17 (задел: 2
//     строки 5×7); шрифты FONT5 (кириллица+латиница+цифры+знаки,
//     7 строк × 5 бит) и FONTBIG (6×9); _DAYS; хук navigateTo
//     (start при заходе / stop при уходе); слушатель 'ws-lcd-message'.
//   Слой 4 — VM: _composeDefault — крупные цифры в верхней зоне,
//     дата справа, день недели и секунды в нижней строке, разделительная
//     строка 9 пуста; двоеточие мигает (чёт/нечет секунда); сообщение
//     «пейджер» — две строки на местах 1..7/9..15, одна — по центру;
//     _splitPages — перенос по словам ≤16 символов, сверхдлинное слово
//     кусками, страницы по 2 строки; _tick — возврат к часам после
//     таймаута и листание страниц; draw — 96×17 сегментов (призраки +
//     включённые), размер canvas в device-пикселях; _calPick — селекты
//     месяца/года + WorkSchedule.onMonthChange.
//   Слой 5 — SW: kipia-test-v742.
//
// Запуск: через tests/run-all.js (require './test-task529.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ============================================================
// Утилиты
// ============================================================
// Блок HTML бара крошек Табеля (от #page-work-schedule до тулбара)
function headerBlock() {
    const i = INDEX_SRC.indexOf('id="page-work-schedule"');
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('<div class="ws-toolbar">', i);
    return INDEX_SRC.slice(i, j === -1 ? INDEX_SRC.length : j);
}

// CSS-блок Task 529 (от баннера LCD до комментария Task 315)
function cssBlock() {
    const i = INDEX_SRC.indexOf('/* === Task 529: LCD-часы');
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('/* Task 315: строка 1 бара', i);
    return INDEX_SRC.slice(i, j === -1 ? INDEX_SRC.length : j);
}

// Модуль WsLcdClock целиком (до баннера WorkSchedule)
function lcdModule() {
    const i = INDEX_SRC.indexOf('var WsLcdClock = {');
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('// WorkSchedule — модуль «График работы» (Task 201)', i);
    if (j === -1) return null;
    return INDEX_SRC.slice(i, j);
}

// VM-песочница с модулем и моками DOM/таймеров
function lcdSandbox(docOverrides) {
    const sb = {
        setInterval: function () { return 1; },
        clearInterval: function () {},
        document: {
            addEventListener: function () {},
            createElement: function () { return { value: '', textContent: '' }; },
            getElementById: function () { return null; },
            documentElement: {}
        },
        window: {
            addEventListener: function () {},
            devicePixelRatio: 2,
            getComputedStyle: function () {
                return { getPropertyValue: function (n) {
                    return ({ '--ws-lcd-bg': '#0e1a13', '--ws-lcd-seg': '#93e6a4',
                              '--ws-lcd-ghost': 'rgba(1,2,3,0.1)',
                              '--ws-lcd-glow': 'rgba(1,2,3,0.4)' })[n] || '';
                } };
            }
        }
    };
    if (docOverrides) {
        Object.keys(docOverrides).forEach(function (k) {
            sb.document[k] = docOverrides[k];
        });
    }
    vm.createContext(sb);
    vm.runInContext(lcdModule(), sb);
    return sb;
}

// ============================================================
// 1. SRC HTML — окно в баре крошек Табеля
// ============================================================
describe('Task 529 A: HTML — LCD-окно в баре крошек Табеля', () => {

    test('виджет #wsLcdWrap внутри #page-work-schedule, ПОСЛЕ заголовка бара', () => {
        const h = headerBlock();
        assertTrue(h !== null, 'блок страницы Табеля найден');
        const iTitle = h.indexOf('page-inline-header-title">Табель учёта рабочего времени');
        const iWrap = h.indexOf('id="wsLcdWrap"');
        assertTrue(iTitle !== -1, 'заголовок «Табель учёта рабочего времени» на месте');
        assertTrue(iWrap !== -1, '#wsLcdWrap в баре крошек');
        assertTrue(iTitle < iWrap, 'окно — СПРАВА (после заголовка)');
        assertTrue(h.indexOf('class="ws-lcd-wrap"') !== -1, 'класс .ws-lcd-wrap');
    });

    test('кнопка #wsLcdClock с canvas #wsLcdCanvas 96×17, onclick открывает календарь', () => {
        const h = headerBlock();
        assertTrue(h.indexOf('id="wsLcdClock"') !== -1, 'кнопка #wsLcdClock');
        assertTrue(h.indexOf('<canvas id="wsLcdCanvas"') !== -1, 'canvas #wsLcdCanvas');
        assertTrue(h.indexOf('width="96"') !== -1 && h.indexOf('height="17"') !== -1,
            'атрибуты canvas — разрешение матрицы 96×17');
        assertTrue(h.indexOf('onclick="WsLcdClock.onClockClick(event)"') !== -1,
            'onclick → WsLcdClock.onClockClick');
    });

    test('календарь #wsLcdCal внутри обёртки, по умолчанию hidden', () => {
        const h = headerBlock();
        const iCal = h.indexOf('id="wsLcdCal"');
        assertTrue(iCal !== -1, '#wsLcdCal в обёртке');
        assertTrue(h.indexOf('class="ws-lcd-cal" hidden') !== -1, 'скрыт по умолчанию');
    });

    test('aria-атрибуты кнопки (haspopup/expanded/label)', () => {
        const h = headerBlock();
        assertTrue(h.indexOf('aria-haspopup="true"') !== -1, 'aria-haspopup');
        assertTrue(h.indexOf('aria-expanded="false"') !== -1, 'aria-expanded');
        assertTrue(h.indexOf('aria-label="Часы и дата') !== -1, 'aria-label с описанием');
    });

    test('заголовок бара не изменён (регресс title из test-work-schedule)', () => {
        const h = headerBlock();
        assertTrue(h.indexOf('<div class="page-inline-header-title">Табель учёта рабочего времени</div>') !== -1,
            'title — прежний полный текст');
    });

    test('canvas помечен aria-hidden (декоративная матрица)', () => {
        const h = headerBlock();
        assertTrue(h.indexOf('aria-hidden="true"') !== -1, 'aria-hidden у canvas');
    });

});

// ============================================================
// 2. SRC CSS — вдавливание, десктоп ≥1024px, темы, календарь
// ============================================================
describe('Task 529 B: CSS — рамки, вдавливание, темы, календарь', () => {

    test('мобильная база: .ws-lcd-wrap скрыт (display: none)', () => {
        const css = cssBlock();
        assertTrue(css !== null, 'CSS-блок Task 529 найден');
        assertTrue(css.indexOf('.ws-lcd-wrap { display: none; }') !== -1,
            'окно скрыто <1024px (только десктоп по заявке)');
    });

    test('десктоп ≥1024px: flex справа в баре (margin-left: auto)', () => {
        const css = cssBlock();
        assertTrue(css.indexOf('@media (min-width: 1024px)') !== -1, 'брейкпоинт 1024px');
        assertTrue(css.indexOf('#page-work-schedule .page-inline-header .ws-lcd-wrap') !== -1,
            'правило привязано к бару Табеля');
        assertTrue(css.indexOf('margin-left: auto') !== -1, 'прижатие к правому краю');
        assertTrue(css.indexOf('display: flex') !== -1, 'flex-компоновка');
    });

    test('эффект вдавливания: inset-тени корпуса (.ws-lcd)', () => {
        const css = cssBlock();
        const i = css.indexOf('.ws-lcd {');
        const blk = css.slice(i, css.indexOf('}', i));
        assertTrue(blk.indexOf('inset 0 1px 0') !== -1, 'блик верхнего бортика внутрь');
        assertTrue(blk.indexOf('inset 0 -1px 2px') !== -1, 'тень нижнего края внутрь');
        assertTrue(blk.indexOf('0 1px 3px rgba(0, 0, 0, 0.45)') !== -1, 'внешняя тень «утопленности»');
        assertTrue(blk.indexOf('border:') !== -1 && blk.indexOf('border-radius: 9px') !== -1,
            'рамка корпуса со скруглением');
    });

    test('экран: пропорция 96/17, pixelated, глубокая внутренняя тень', () => {
        const css = cssBlock();
        const i = css.indexOf('.ws-lcd-screen {');
        const blk = css.slice(i, css.indexOf('}', i));
        assertTrue(blk.indexOf('width: calc(40px * 96 / 17)') !== -1,
            'ширина из пропорции матрицы 96×17');
        assertTrue(blk.indexOf('height: 40px') !== -1, 'высота экрана 40px');
        assertTrue(blk.indexOf('image-rendering: pixelated') !== -1, 'чёткие квадраты сегментов');
        assertTrue(blk.indexOf('inset 0 2px 5px') !== -1, 'экран утоплен в корпус');
    });

    test('цвета через --ws-lcd-*: тёмная тема — «подсветка»', () => {
        const css = cssBlock();
        ['--ws-lcd-bg', '--ws-lcd-seg', '--ws-lcd-ghost', '--ws-lcd-glow'].forEach(function (v) {
            assertTrue(css.indexOf(v) !== -1, 'переменная ' + v + ' объявлена');
        });
        assertTrue(css.indexOf('--ws-lcd-seg: #93e6a4') !== -1, 'зелёные сегменты тёмной темы');
    });

    test('светлая тема: серо-зелёный ЖК + тёмные символы (как на фото)', () => {
        const css = cssBlock();
        const i = css.indexOf('[data-theme="light"] .ws-lcd {');
        assertTrue(i !== -1, 'оверрайд светлой темы есть');
        const blk = css.slice(i, css.indexOf('}', i));
        assertTrue(blk.indexOf('--ws-lcd-bg: #ccd6c5') !== -1, 'серо-зелёный фон ЖК');
        assertTrue(blk.indexOf('--ws-lcd-seg: #232e38') !== -1, 'тёмные символы');
        assertTrue(css.indexOf('background: #2a2f35') !== -1, 'тёмный пластиковый корпус');
    });

    test('календарь: absolute у правого края, z-index 9460, [hidden]', () => {
        const css = cssBlock();
        const i = css.indexOf('.ws-lcd-cal {');
        const blk = css.slice(i, css.indexOf('}', i));
        assertTrue(blk.indexOf('position: absolute') !== -1, 'выпадает из потока');
        assertTrue(blk.indexOf('top: calc(100% + 10px)') !== -1, 'под окном');
        assertTrue(blk.indexOf('z-index: 9460') !== -1, 'выше info-окон ws-* (9450)');
        assertTrue(css.indexOf('.ws-lcd-cal[hidden] { display: none; }') !== -1, 'скрытие через hidden');
    });

});

// ============================================================
// 3. SRC JS — модуль, шрифты, хук navigateTo, API сообщений
// ============================================================
describe('Task 529 C: JS — модуль WsLcdClock и хук navigateTo', () => {

    test('var WsLcdClock определён; COLS=96, ROWS=17 (задел: 2 строки 5×7)', () => {
        const m = lcdModule();
        assertTrue(m !== null, 'модуль найден в index.html');
        const sb = lcdSandbox();
        assertEqual(sb.WsLcdClock.COLS, 96, 'COLS = 96 (16 символов 5×7 в строке)');
        assertEqual(sb.WsLcdClock.ROWS, 17, 'ROWS = 17 (7+1+7 две строки + запас)');
        assertTrue(sb.WsLcdClock.PAGE_MS > 0, 'PAGE_MS задан');
    });

    test('FONT5: полная кириллица А..Я (без Ё, 32 глифа)', () => {
        const sb = lcdSandbox();
        const letters = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
        let missing = [];
        for (const ch of letters) {
            if (!sb.WsLcdClock.FONT5[ch]) missing.push(ch);
        }
        assertEqual(missing.length, 0, 'все 32 буквы на месте: ' + missing.join(','));
    });

    test('FONT5: латиница A..Z, цифры 0..9, знаки . : - / пробел', () => {
        const sb = lcdSandbox();
        for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.:-/ ') {
            assertTrue(!!sb.WsLcdClock.FONT5[ch], 'глиф «' + ch + '» есть');
        }
    });

    test('FONT5: каждый глиф — 7 строк по 5 бит (0..31)', () => {
        const sb = lcdSandbox();
        let bad = [];
        Object.keys(sb.WsLcdClock.FONT5).forEach(function (ch) {
            const g = sb.WsLcdClock.FONT5[ch];
            if (!Array.isArray(g) || g.length !== 7) { bad.push(ch + ':строк ' + g.length); return; }
            g.forEach(function (row) {
                if (typeof row !== 'number' || row < 0 || row > 31 || Math.floor(row) !== row) {
                    bad.push(ch + ':ряд ' + row);
                }
            });
        });
        assertEqual(bad.length, 0, 'все глифы валидны: ' + bad.slice(0, 5).join('; '));
    });

    test('FONTBIG: цифры 0..9 и «:», каждый глиф 9 строк по 6 бит', () => {
        const sb = lcdSandbox();
        let bad = [];
        for (const ch of '0123456789:') {
            const g = sb.WsLcdClock.FONTBIG[ch];
            if (!g) { bad.push(ch + ':нет'); continue; }
            if (g.length !== 9) { bad.push(ch + ':строк ' + g.length); continue; }
            g.forEach(function (row) {
                if (typeof row !== 'number' || row < 0 || row > 63) bad.push(ch + ':ряд ' + row);
            });
        }
        assertEqual(bad.length, 0, 'крупный шрифт валиден: ' + bad.join('; '));
    });

    test('_DAYS: 7 полных названий дней, Пн=0', () => {
        const sb = lcdSandbox();
        assertEqual(sb.WsLcdClock._DAYS.length, 7, 'семь дней');
        assertEqual(sb.WsLcdClock._DAYS[0], 'ПОНЕДЕЛЬНИК', 'Пн первый');
        assertEqual(sb.WsLcdClock._DAYS[6], 'ВОСКРЕСЕНЬЕ', 'Вс последний');
    });

    test('хук navigateTo: старт на Табеле, стоп при уходе (паттерн ws-totals)', () => {
        const iHook = INDEX_SRC.indexOf("if (page === 'work-schedule')");
        assertTrue(iHook !== -1, 'хук work-schedule на месте');
        const seg = INDEX_SRC.slice(iHook, iHook + 900);
        assertTrue(seg.indexOf('WsLcdClock.start()') !== -1, 'start() при заходе');
        assertTrue(seg.indexOf('WsLcdClock.stop()') !== -1, 'stop() при уходе (else if)');
        assertTrue(seg.indexOf('WsLcdClock._timer') !== -1, 'стоп только если таймер жив');
    });

    test('API сообщений «пейджер»: showMessage + слушатель ws-lcd-message', () => {
        const m = lcdModule();
        assertTrue(m.indexOf('showMessage: function') !== -1, 'showMessage определён');
        assertTrue(m.indexOf("addEventListener('ws-lcd-message'") !== -1,
            'слушатель события ws-lcd-message (внешний API)');
        assertTrue(m.indexOf('_splitPages: function') !== -1, 'разбивка длинного текста');
    });

    test('календарь: _calNav/_calToday/_calPick/_renderCal определены', () => {
        const m = lcdModule();
        ['_calNav', '_calToday', '_calPick', '_renderCal', 'toggleCal', 'onClockClick']
            .forEach(function (fn) {
                assertTrue(m.indexOf(fn + ': function') !== -1, fn + ' определён');
            });
    });

});

// ============================================================
// 4. VM — компоновка экрана, мигание, сообщения, отрисовка, календарь
// ============================================================
describe('Task 529 D: VM — экран 96×17, пейджер, отрисовка', () => {

    test('_composeDefault: крупные цифры в верхней зоне («1» в 14:56)', () => {
        const sb = lcdSandbox();
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 0));
        // «1» на позиции x=1: ряд 0 — 001100 → колонки 3..4
        assertEqual(g[0][3], 1, 'левый сегмент верха «1»');
        assertEqual(g[0][4], 1, 'правый сегмент верха «1»');
        assertEqual(g[0][1], 0, 'пусто слева от «1»');
        assertEqual(g[8][4], 1, '«1» доходит до низа верхней зоны (ряд 8)');
    });

    test('_composeDefault: дата справа в верхней зоне (15.10.2026)', () => {
        const sb = lcdSandbox();
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 0));
        // дата «15.10.2026» — 59 колонок, конец на 93; «1» ряд 1 → 00100 → col 37
        assertEqual(g[1][37], 1, 'первая колонка «1» даты');
        assertEqual(g[1][36], 0, 'слева от даты пусто');
        let lit = 0;
        for (let c = 35; c <= 93; c++) if (g[1][c]) lit++;
        assertTrue(lit >= 3, 'дата реально нарисована (ряд 1, правая зона)');
    });

    test('_composeDefault: день недели и секунды в нижней строке, ряд 9 пуст', () => {
        const sb = lcdSandbox();
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 0));
        // 15.10.2026 — ЧЕТВЕРГ: «Ч» ряд 10 → 10001 → колонки 1 и 5
        assertEqual(g[10][1], 1, '«Ч»: левая ножка');
        assertEqual(g[10][5], 1, '«Ч»: правая ножка');
        assertEqual(g[10][3], 0, '«Ч»: середина пуста');
        // секунды «00» справа: первый «0» на col 83, ряд 10 → 01110 → cols 84..86
        assertEqual(g[10][84], 1, 'секунды в нижней строке справа');
        let row9 = 0;
        for (let c = 0; c < 96; c++) row9 += g[9][c];
        assertEqual(row9, 0, 'разделительный ряд 9 пуст (две зоны экрана)');
    });

    test('двоеточие мигает: чётная секунда горит, нечётная — нет', () => {
        const sb = lcdSandbox();
        const even = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 0));
        const odd  = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 1));
        // «14:56»: двоеточие после «4» (x=15), точки в колонках 17..18, ряды 2..3 и 5..6
        assertEqual(even[2][17], 1, 'чёт: верхняя точка горит');
        assertEqual(even[3][18], 1, 'чёт: верхняя точка (правая)');
        assertEqual(odd[2][17], 0, 'нечёт: точка погашена');
        assertEqual(odd[3][18], 0, 'нечёт: точка погашена (правая)');
        // сами цифры не мигают
        assertEqual(odd[0][3], 1, 'цифра «1» горит всегда');
    });

    test('общее число сегментов разумное (~200..600), зоны сбалансированы', () => {
        const sb = lcdSandbox();
        const g = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 0));
        let lit = 0, top = 0, bottom = 0;
        for (let r = 0; r < 17; r++) for (let c = 0; c < 96; c++) {
            if (g[r][c]) { lit++; if (r < 9) top++; else bottom++; }
        }
        assertTrue(lit >= 200 && lit <= 600, 'всего сегментов: ' + lit);
        assertTrue(top > 0 && bottom > 0, 'обе зоны заполнены: верх ' + top + '/низ ' + bottom);
    });

    test('_composeMsg: две строки на рядах 1..7 и 9..15', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._msg = { pages: [['ДАННЫЕ', 'ОБНОВЛЕНЫ']], idx: 0 };
        const g = sb.WsLcdClock._composeMsg();
        // «Д» ряд 1 → 11111 → колонки 1..5
        assertEqual(g[1][1], 1, 'первая строка начинается с ряда 1');
        assertEqual(g[9][2], 1, 'вторая строка — с ряда 9 («О»: верх 01110 → колонка 2)');
        // между строками (ряд 8) пусто
        let row8 = 0;
        for (let c = 0; c < 96; c++) row8 += g[8][c];
        assertEqual(row8, 0, 'между строками пустой ряд');
    });

    test('_composeMsg: одна строка — по центру (ряд 5)', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._msg = { pages: [['ДАННЫЕ ОБНОВЛЕНЫ', '']], idx: 0 };
        const g = sb.WsLcdClock._composeMsg();
        assertEqual(g[5][1], 1, 'строка начинается с ряда 5');
        assertEqual(g[1][1], 0, 'ряд 1 пуст');
    });

    test('_splitPages: перенос по словам ≤16 символов, страницы по 2 строки', () => {
        const sb = lcdSandbox();
        const pages = sb.WsLcdClock._splitPages('ТЕМПЕРАТУРА В ПОМЕЩЕНИИ В НОРМЕ');
        assertEqual(pages.length, 2, 'две страницы');
        assertEqual(pages[0][0], 'ТЕМПЕРАТУРА В', 'строка 1 страницы 1');
        assertEqual(pages[0][1], 'ПОМЕЩЕНИИ В', 'строка 2 страницы 1');
        assertEqual(pages[1][0], 'НОРМЕ', 'хвост на странице 2');
        pages.forEach(function (p) {
            p.forEach(function (line) { assertTrue(line.length <= 16, 'строка ≤16: «' + line + '»'); });
        });
    });

    test('_splitPages: сверхдлинное слово режется кусками по 16', () => {
        const sb = lcdSandbox();
        const pages = sb.WsLcdClock._splitPages('ЭЛЕКТРООБОРУДОВАНИЕ ПРОВЕРЕНО');
        assertEqual(pages[0][0], 'ЭЛЕКТРООБОРУДОВА', 'кусок ровно 16 символов');
        assertEqual(pages[0][1], 'НИЕ ПРОВЕРЕНО', 'остаток слова склеен со следующим');
        assertEqual(pages.length, 1, 'вся фраза на одной странице');
    });

    test('_splitPages: пустой текст → пустой список', () => {
        const sb = lcdSandbox();
        assertEqual(sb.WsLcdClock._splitPages('').length, 0, 'пусто');
        assertEqual(sb.WsLcdClock._splitPages('   ').length, 0, 'только пробелы');
    });

    test('showMessage: две строки — одна страница, until в будущем', () => {
        const sb = lcdSandbox();
        const t0 = Date.now();
        sb.WsLcdClock.showMessage('ДАННЫЕ', 'ОБНОВЛЕНЫ', 5000);
        assertEqual(sb.WsLcdClock._msg.pages.length, 1, 'одна страница');
        assertEqual(sb.WsLcdClock._msg.pages[0][0], 'ДАННЫЕ', 'строка 1');
        assertEqual(sb.WsLcdClock._msg.pages[0][1], 'ОБНОВЛЕНЫ', 'строка 2');
        assertTrue(sb.WsLcdClock._msg.until > t0 + 4000, 'until ≈ now+5000');
    });

    test('_tick: после таймаута сообщения — возврат к часам', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._msg = {
            pages: [['A', 'B']], idx: 0,
            until: Date.now() - 1, nextFlip: Date.now() + 99999
        };
        sb.WsLcdClock._lastSec = -1;
        sb.WsLcdClock._tick();
        assertEqual(sb.WsLcdClock._msg, null, 'сообщение сброшено');
        assertTrue(sb.WsLcdClock._grid !== null, 'экран перерисован часами');
        // верхняя зона снова с крупными цифрами
        assertEqual(sb.WsLcdClock._grid[0][3], 1, 'крупные цифры на месте');
    });

    test('_tick: листание страниц длинного сообщения', () => {
        const sb = lcdSandbox();
        sb.WsLcdClock._msg = {
            pages: [['A', 'B'], ['C', 'D']], idx: 0,
            until: Date.now() + 60000, nextFlip: Date.now() - 1
        };
        sb.WsLcdClock._lastSec = -1;
        sb.WsLcdClock._tick();
        assertEqual(sb.WsLcdClock._msg.idx, 1, 'страница сменилась на вторую');
        assertTrue(sb.WsLcdClock._msg.nextFlip > Date.now(), 'nextFlip перевён');
    });

    test('draw: 96×17 сегментов (призраки + включённые), canvas в device-пикселях', () => {
        let fillRects = 0;
        const ctx = {
            fillStyle: '', shadowColor: '', shadowBlur: 0,
            fillRect: function () { fillRects++; }
        };
        const cv = {
            width: 0, height: 0,
            getBoundingClientRect: function () { return { width: 300, height: 53 }; },
            getContext: function () { return ctx; }
        };
        const sb = lcdSandbox({
            getElementById: function (id) { return id === 'wsLcdCanvas' ? cv : null; }
        });
        sb.WsLcdClock._grid = sb.WsLcdClock._composeDefault(new Date(2026, 9, 15, 14, 56, 0));
        sb.WsLcdClock.draw();
        // 1 заливка фона + каждая ячейка матрицы ровно один раз
        assertEqual(fillRects, 96 * 17 + 1, 'фон + каждая ячейка матрицы: ' + fillRects);
        assertEqual(cv.width, 600, 'ширина canvas = CSS×DPR (300×2)');
        assertEqual(cv.height, 106, 'высота canvas = CSS×DPR (53×2)');
    });

    test('draw: скрытое окно (display:none) не рисует', () => {
        const cv = {
            width: 10, height: 10,
            getBoundingClientRect: function () { return { width: 0, height: 0 }; },
            getContext: function () { throw new Error('не должен вызываться'); }
        };
        const sb = lcdSandbox({
            getElementById: function (id) { return id === 'wsLcdCanvas' ? cv : null; }
        });
        sb.WsLcdClock._grid = sb.WsLcdClock._composeDefault(new Date());
        sb.WsLcdClock.draw();   // не должен бросить
        assertEqual(cv.width, 10, 'canvas не тронут');
    });

    test('_calPick: селекты месяца/года + WorkSchedule.onMonthChange', () => {
        let picked = null;
        const monthSel = { value: '10' };
        const yearSel = {
            value: '2025',
            querySelector: function () { return { value: '2025' }; },
            appendChild: function () {},
            querySelectorAll: function () { return []; }
        };
        const sb = lcdSandbox({
            getElementById: function (id) {
                if (id === 'wsMonthSel') return monthSel;
                if (id === 'wsYearSel') return yearSel;
                if (id === 'wsLcdCal') return { hidden: false, innerHTML: '' };
                if (id === 'wsLcdClock') return { setAttribute: function () {} };
                return null;
            }
        });
        sb.WorkSchedule = { onMonthChange: function () { picked = true; } };
        sb.WsLcdClock._calOpen = true;
        sb.WsLcdClock._calPick(2026, 10, 15);
        assertEqual(monthSel.value, '10', 'месяц установлен в селект');
        assertEqual(yearSel.value, '2026', 'год установлен в селект');
        assertEqual(picked, true, 'WorkSchedule.onMonthChange вызван');
        assertEqual(sb.WsLcdClock._calOpen, false, 'календарь закрыт');
    });

});

// ============================================================
// 5. SW — версия кэша
// ============================================================
describe('Task 529 — SW: версия кэша', () => {

    test('sw.js: CACHE_VERSION = kipia-test-v742', () => {
        const m = SW_SRC.match(/const CACHE_VERSION = '(kipia-test-v\d+)'/);
        assertTrue(m !== null, 'CACHE_VERSION найден в sw.js');
        assertEqual(m[1], 'kipia-test-v742',
            'SW поднят до kipia-test-v742 (index.html менялся — Task 529)');
        assertTrue(m[1] !== 'kipia-test-v741',
            'старая версия kipia-test-v741 не осталась');
    });

});

