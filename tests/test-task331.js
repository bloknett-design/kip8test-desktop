// tests/test-task331.js
// Task 331 — заявка пользователя:
//   «При открытии шторки итогов учёта, не должно быть полосок
//    вертикальной прокрутки в шторке и в шахматке табеля. Кнопку
//    с шевроном в шторке сделай в два раза уже по ширине и
//    прозрачней, левый бордюрчик сделай полосой как между сменными
//    и дневными сотрудниками в шахматке. В шторке полоску
//    горизонтальной прокрутки сделай под нижним бордюром, как под
//    шахматкой табеля, но при неполном открытии шторки, шторка
//    должна открываться достаточно для того чтобы вся информация
//    в столиках её таблицы просматривалась, и не должно быть при
//    этом нижней горизонтальной полоски прокрутки. Высота шапки
//    названия столбцов в таблице шторки должна выравниваться по
//    высоте шапки шахматки табеля. В названиях столбцов Явки и
//    Переработка, в скобках подпиши что количества в днях. Текст
//    в шапке таблицы шторки и в ячейках значений выровни по
//    центру. Уровень нижнего бордюра шорки должен всегда
//    выравниваться по бордюру шахматки табеля.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   БЕЗ ПОЛОСОК ВЕРТИКАЛЬНОЙ ПРОКРУТКИ: нативные полосы скрыты во
//     всех движках в ОБОИХ контейнерах — .ws-tt-body (scrollbar-width:
//     none + ::-webkit-scrollbar display:none; прежние thin/12px-правила
//     удалены) и .ws-grid-wrap (базовое скрытие; gridwide-правила
//     thin/webkit-ползунка удалены — Firefox рисовал тонкую ВЕРТИКАЛЬНУЮ
//     полоску и в сетке, и в шторке, а съедая ширину тела шторки —
//     ещё и горизонтальную при свёрнутых столбцах).
//   КАСТОМНЫЕ ПОЛЗУНКИ: .ws-grid-hbar (у шахматки — только в широком
//     режиме) и .ws-tt-hbar (у шторки) — дорожка+бегунок .ws-hbar-thumb,
//     зона 12px зарезервирована ВСЕГДА (без переполнения пустая —
//     «при неполном открытии… не должно быть нижней полоски»),
//     появляются только при переполнении (.on); перетаскивание —
//     pointer capture; JS _attachHbars/_hbarSync/_hbarSyncAll
//     (init → _attachHbars, _fitGrid → syncTT → _hbarSyncAll).
//   ШЕВРОН: в ДВА РАЗА УЖЕ (22→11px) и ПРОЗРАЧНЕЕ (0.92→0.55,
//     светлая 0.94→0.6), svg компактный 7×12; высота прежняя 48px.
//   ЛЕВЫЙ БОРДЮРЧИК: ПОЛОСА 2px как разделитель сменных/дневных
//     сетки (.ws-grid tbody tr.ws-group-first: #4a8fc7 тёмная /
//     #6e8ba4 светлая).
//   ГЕОМЕТРИЯ КОЛОНОК: обе колонки рабочей области собраны одинаково
//     [скролл-зона][бордюрчик 5px][зона ползунка 12px] — нижние
//     бордюры ВСЕГДА на одном уровне: сетка — в .ws-grid-col
//     (#wsGridCol: #wsGridWrap + СТАТИЧНЫЙ #wsGridFoot + #wsGridHbar;
//     рендер сетки полосу больше не создаёт), панель шторки — БЕЗ
//     рамок (border: none, прежние 1px сверху/снизу сняты), шапка
//     без филлера + .ws-tt-foot + #wsTtHbar ПОД ней.
//   ШАПКА СТОЛБЦОВ = ШАПКЕ СЕТКИ: пустая шапка шторки ПРЯЧЕТСЯ
//     ([hidden] → display:none, филлер ws-tt-head-empty удалён),
//     thead th height: 38px (природная высота 2-строчной шапки
//     сетки Task 256), vertical-align: middle; сетка в gridwide —
//     var(--ws-tt-head-h, 38px) (фолбэк 56px → 38px).
//   ПОДПИСИ «(ДНИ)»: «Явки (дни)»/«Переработка (дни)» (месяц),
//     «Перераб. (дни)» (год); столбцы расширены (TT_COL_W/CSS:
//     44/42/80 — «вся информация просматривалась, без полоски»).
//   ЦЕНТР: .ws-tt-table th/td — text-align: center (прежде вправо;
//     колонка «Сотрудник» — по-прежнему слева своими правилами),
//     годовая таблица — тоже по центру.
//   SW: kipia-test-v733.
//
// Запуск: через tests/run-all.js (require './test-task331.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_CLIENT = INDEX_SRC;

function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

function methodFn(src, name) {
    const txt = methodText(src, name);
    assertTrue(txt.length > 0, 'метод найден: ' + name);
    const obj = new Function('return ({' + txt + '\n});')();
    return obj[name];
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// ============================================================
// 1. CSS: БЕЗ полосок вертикальной прокрутки (оба контейнера)
// ============================================================
describe('Task 331 — CSS: нет полосок вертикальной прокрутки', () => {

    test('CSS: .ws-tt-body — ВСЕ нативные полосы скрыты (оба движка)', () => {
        const b = INDEX_SRC.match(/\.ws-tt-body\s*\{[^}]*\}/);
        assertTrue(!!b, 'правило .ws-tt-body');
        assertTrue(!!b && b[0].indexOf('scrollbar-width: none') !== -1,
            'Firefox: полосы скрыты (прежде thin — вертикальная полоска)');
        assertTrue(!!b && b[0].indexOf('scrollbar-color') === -1,
            'нативная раскраска полос удалена');
        const sb = INDEX_SRC.match(/\.ws-tt-body::-webkit-scrollbar\s*\{[^}]*\}/);
        assertTrue(!!sb, 'webkit-правило');
        assertTrue(!!sb && sb[0].indexOf('display: none') !== -1,
            'Chromium: полосы скрыты (прежде height 12px — горизонтальная)');
        assertFalse(/\.ws-tt-body::-webkit-scrollbar-thumb/.test(INDEX_SRC),
            'нативного бегунка шторки нет (кастомный #wsTtHbar вместо него)');
        assertFalse(/\[data-theme="light"\] \.ws-tt-body::-webkit-scrollbar/.test(INDEX_SRC),
            'нативные track/thumb-правила светлой темы удалены');
    });

    test('CSS: .ws-grid-wrap — скрытие полос действует и в широком режиме', () => {
        // базовое скрытие (Task 257) не тронуто
        assertTrue(/\.ws-grid-wrap\s*\{[^}]*scrollbar-width:\s*none/.test(INDEX_SRC),
            'базовое scrollbar-width: none');
        assertTrue(/\.ws-grid-wrap::-webkit-scrollbar\s*\{[^}]*display:\s*none/.test(INDEX_SRC),
            'базовое webkit-скрытие');
        // gridwide-правила видимых полос УДАЛЕНЫ (Task 331: Firefox thin
        // рисовал тонкую ВЕРТИКАЛЬНУЮ полоску и в шахматке)
        assertFalse(/#page-work-schedule\.ws-tt-gridwide \.ws-grid-wrap\s*\{[^}]*scrollbar-width:\s*thin/.test(INDEX_SRC),
            'gridwide thin-полоса удалена');
        assertFalse(/#page-work-schedule\.ws-tt-gridwide \.ws-grid-wrap::-webkit-scrollbar\b/.test(INDEX_SRC),
            'gridwide webkit-ползунок удалён');
        // прежний паддинг-снизу контейнера убран (зону ползунка занял
        // статичный #wsGridHbar ВНЕ контейнера)
        assertFalse(/\.ws-grid-wrap\s*\{[^}]*padding:\s*0 0 12px 0/.test(INDEX_SRC),
            'паддинг-снизу 12px удалён (зона ползунка — вне контейнера)');
    });
});

// ============================================================
// 2. CSS: кастомные ползунки под нижними бордюрами
// ============================================================
describe('Task 331 — CSS: кастомные ползунки .ws-grid-hbar/.ws-tt-hbar', () => {

    test('CSS: зона ползунка 12px зарезервирована ВСЕГДА (обе колонки)', () => {
        const m = INDEX_SRC.match(/\.ws-grid-hbar,\s*\n\s*\.ws-tt-hbar\s*\{[^}]*\}/);
        assertTrue(!!m, 'общее правило .ws-grid-hbar + .ws-tt-hbar');
        assertTrue(!!m && m[0].indexOf('height: 12px') !== -1,
            'высота 12px — уровень прежнего нативного ползунка');
        assertTrue(!!m && m[0].indexOf('flex: none') !== -1,
            'в потоке колонки (не скроллится)');
        // без переполнения бегунок скрыт — «полоски прокрутки нет»
        const t = INDEX_SRC.match(/\.ws-grid-hbar \.ws-hbar-thumb,\s*\n\s*\.ws-tt-hbar \.ws-hbar-thumb\s*\{[^}]*\}/);
        assertTrue(!!t && t[0].indexOf('display: none') !== -1,
            'без переполнения зона ПУСТАЯ (бегунок скрыт)');
        const on = INDEX_SRC.match(/\.ws-grid-hbar\.on,\s*\n\s*\.ws-tt-hbar\.on\s*\{[^}]*\}/);
        assertTrue(!!on && on[0].indexOf('background: rgba(255, 255, 255, 0.05)') !== -1,
            'при переполнении — дорожка (как прежний нативный ползунок)');
        const thumb = INDEX_SRC.match(/\.ws-grid-hbar\.on \.ws-hbar-thumb,\s*\n\s*\.ws-tt-hbar\.on \.ws-hbar-thumb\s*\{[^}]*\}/);
        assertTrue(!!thumb, 'правило бегунка .on');
        assertTrue(!!thumb && thumb[0].indexOf('display: block') !== -1,
            'бегунок появляется при переполнении');
        assertTrue(!!thumb && thumb[0].indexOf('background: #4a8fc7') !== -1,
            'бегунок синий (цвет прежнего ползунка)');
        assertTrue(!!thumb && thumb[0].indexOf('border-radius: 6px') !== -1,
            'бегунок скруглён');
        assertTrue(!!thumb && thumb[0].indexOf('touch-action: none') !== -1,
            'перетаскивание пальцем (touch-action)');
        assertTrue(!!thumb && thumb[0].indexOf('min-width: 24px') !== -1,
            'минимальная ширина бегунка');
    });

    test('CSS: светлая тема ползунков', () => {
        assertTrue(/\[data-theme="light"\] \.ws-grid-hbar\.on,\s*\n\s*\[data-theme="light"\] \.ws-tt-hbar\.on\s*\{[^}]*rgba\(0,\s*0,\s*0,\s*0\.08\)/.test(INDEX_SRC),
            'дорожка светлой темы');
        assertTrue(/\[data-theme="light"\] \.ws-grid-hbar\.on \.ws-hbar-thumb,\s*\n\s*\[data-theme="light"\] \.ws-tt-hbar\.on \.ws-hbar-thumb\s*\{[^}]*#6e8ba4/.test(INDEX_SRC),
            'бегунок светлой темы (#6e8ba4)');
    });

    test('HTML: колонка сетки = [контейнер][статичный бордюрчик][ползунок]', () => {
        const iCol = INDEX_SRC.indexOf('id="wsGridCol"');
        assertTrue(iCol !== -1, 'колонка #wsGridCol есть');
        const chunk = INDEX_SRC.slice(iCol, iCol + 2000);
        const iWrap = chunk.indexOf('id="wsGridWrap"');
        const iFoot = chunk.indexOf('id="wsGridFoot"');
        const iHbar = chunk.indexOf('id="wsGridHbar"');
        assertTrue(iWrap !== -1 && iFoot !== -1 && iHbar !== -1,
            'контейнер + #wsGridFoot + #wsGridHbar в колонке');
        assertTrue(iWrap < iFoot && iFoot < iHbar,
            'порядок: скролл-зона → бордюрчик → ползунок (бордюрчик МЕЖДУ)');
        // ползунок шторки — СТРОГО ПОСЛЕ .ws-tt-foot (под бордюром)
        const iPf = INDEX_SRC.indexOf('<div class="ws-tt-foot" aria-hidden="true"></div>');
        const iTtH = INDEX_SRC.indexOf('id="wsTtHbar"');
        assertTrue(iPf !== -1 && iTtH !== -1 && iPf < iTtH,
            '#wsTtHbar ПОД .ws-tt-foot («полоска под нижним бордюром»)');
    });
});

// ============================================================
// 3. CSS: шеврон уже и прозрачнее; полоса левого края
// ============================================================
describe('Task 331 — CSS: шеврон 11px/прозрачнее, полоса 2px', () => {

    test('CSS: шеврон — В ДВА РАЗА УЖЕ и ПРОЗРАЧНЕЕ', () => {
        const m = INDEX_SRC.match(/\.ws-tt-chv\s*\{[^}]*\}/);
        assertTrue(!!m, 'правило .ws-tt-chv');
        assertTrue(!!m && m[0].indexOf('width: 11px') !== -1,
            'ширина 11px (прежде 22px — вдвое уже, заявка)');
        assertTrue(!!m && m[0].indexOf('rgba(21, 32, 47, 0.55)') !== -1,
            'заливка прозрачнее: 0.55 (прежде 0.92)');
        assertTrue(!!m && /height:\s*48px/.test(m[0]), 'высота прежняя (48px)');
        const l = INDEX_SRC.match(/\[data-theme="light"\] \.ws-tt-chv\s*\{[^}]*\}/);
        assertTrue(!!l && l[0].indexOf('rgba(226, 232, 239, 0.6)') !== -1,
            'светлая: 0.6 (прежде 0.94)');
    });

    test('HTML: svg-шеврон компактный 7×12 (под узкую кнопку)', () => {
        const i = INDEX_SRC.indexOf('id="wsTtChv"');
        const btn = INDEX_SRC.slice(i, INDEX_SRC.indexOf('</button>', i));
        assertTrue(/<svg width="7" height="12" viewBox="0 0 7 12"/.test(btn),
            'svg 7×12 (прежде 14×14 — не влезал в 11px)');
    });

    test('CSS: левый бордюрчик — ПОЛОСА как разделитель групп сетки', () => {
        const m = INDEX_SRC.match(/\.ws-tt-edge\s*\{[^}]*\}/);
        assertTrue(!!m && m[0].indexOf('width: 2px') !== -1,
            '2px (как .ws-grid tr.ws-group-first border-top: 2px)');
        assertTrue(!!m && m[0].indexOf('#4a8fc7') !== -1,
            'цвет разделителя (тёмная тема)');
        assertFalse(!!m && m[0].indexOf('#35648f') !== -1,
            'прежний стальной bevel-фон удалён');
        const l = INDEX_SRC.match(/\[data-theme="light"\] \.ws-tt-edge\s*\{[^}]*\}/);
        assertTrue(!!l && l[0].indexOf('#6e8ba4') !== -1,
            'светлая — как разделитель сетки (#6e8ba4)');
        // эталон: разделитель групп в шахматке — те же цвета
        assertTrue(/\.ws-grid tbody tr\.ws-group-first td\s*\{[^}]*border-top:\s*2px solid #4a8fc7/.test(INDEX_SRC),
            'разделитель сетки 2px #4a8fc7 (тот же цвет)');
        assertTrue(/\[data-theme="light"\] \.ws-grid tbody tr\.ws-group-first td\s*\{[^}]*#6e8ba4/.test(INDEX_SRC),
            'разделитель сетки светлый #6e8ba4');
    });
});

// ============================================================
// 4. CSS: шапка столбцов = шапка сетки; центр; подписи «(дни)»
// ============================================================
describe('Task 331 — CSS: шапка столбцов по высоте шапки сетки, центр', () => {

    test('CSS: thead th шторки — 38px (= шапка сетки), центр полосы', () => {
        const th = INDEX_SRC.match(/\.ws-tt-table th\s*\{[^}]*\}/);
        assertTrue(!!th, 'правило th');
        assertTrue(!!th && th[0].indexOf('height: 38px') !== -1,
            'высота 38px — шапка сетки (Task 256: 14+11+12 ≈ 37,5)');
        assertTrue(!!th && th[0].indexOf('vertical-align: middle') !== -1,
            'текст по центру полосы (прежде bottom)');
        assertTrue(!!th && th[0].indexOf('text-align: center') !== -1,
            'заголовки по центру (заявка)');
    });

    test('CSS: пустая шапка шторки ПРЯЧЕТСЯ (филлер удалён)', () => {
        assertFalse(/\.ws-tt-head\.ws-tt-head-empty/.test(INDEX_SRC),
            'правило 16px-филлера удалено');
        assertTrue(/\.ws-tt-head\[hidden\]\s*\{\s*display:\s*none/.test(INDEX_SRC),
            'пустая шапка — display: none (шапка таблицы от самого верха)');
        const h = INDEX_SRC.match(/\.ws-tt-head\s*\{[^}]*\}/);
        assertTrue(!!h && h[0].indexOf('flex: none') !== -1,
            'шапка — flex: none (не сжимает тело)');
    });

    test('CSS: сетка в gridwide — фолбэк 38px (прежде 56px)', () => {
        assertTrue(/#page-work-schedule\.ws-tt-gridwide \.ws-grid thead th\s*\{[^}]*var\(--ws-tt-head-h,\s*38px\)/.test(INDEX_SRC),
            'фолбэк переменной — природная высота шапки сетки');
    });

    test('CSS: текст в шапке и ячейках значений — ПО ЦЕНТРУ', () => {
        const m = INDEX_SRC.match(/\.ws-tt-table th,\s*\n\s*\.ws-tt-table td\s*\{[^}]*\}/);
        assertTrue(!!m, 'правило th/td');
        assertTrue(!!m && m[0].indexOf('text-align: center') !== -1,
            'значения по центру (прежде right, заявка)');
        const y = INDEX_SRC.match(/\.ws-tt-table\.ws-tt-year th\s*\{[^}]*\}/);
        assertTrue(!!y && y[0].indexOf('text-align: center') !== -1,
            'годовая таблица — заголовки тоже по центру');
        // колонка «Сотрудник» — по-прежнему слева (не значение)
        const e = INDEX_SRC.match(/\.ws-tt-table th\.ws-tt-emp,\s*\n\s*\.ws-tt-table td\.ws-tt-emp\s*\{[^}]*\}/);
        assertTrue(!!e && e[0].indexOf('text-align: left') !== -1,
            'колонка «Сотрудник» — слева (имена, не значения)');
    });

    test('CSS: панель шторки БЕЗ рамок — стык 1:1 с колонкой сетки', () => {
        const p = INDEX_SRC.match(/\.ws-totals-panel\s*\{[^}]*\}/);
        assertTrue(!!p && p[0].indexOf('border: none') !== -1,
            'рамки сняты (прежде 1px сверху/снизу — перекос уровня бордюра)');
    });

    test('JS: подписи «(дни)» и расширенные столбцы (TT_COL_W)', () => {
        const m = methodText(WS_CLIENT, '_renderTotalsMonth');
        assertTrue(m.indexOf("name: 'Явки (дни)'") !== -1,
            'заголовок «Явки (дни)» (заявка: в скобках — в днях)');
        assertTrue(m.indexOf("name: 'Переработка (дни)'") !== -1,
            'заголовок «Переработка (дни)»');
        assertTrue(m.indexOf('TT_COL_W = { work: 44, hours: 42, over: 80,') !== -1,
            'ширины 44/42/80 (прежде 36/38/56 — «вся информация видна, без полоски»)');
        // CSS-дубль тех же ширин
        assertTrue(/th\.ws-tt-c-work\s*\{\s*width:\s*44px/.test(INDEX_SRC), 'CSS ws-tt-c-work 44px');
        assertTrue(/th\.ws-tt-c-hours\s*\{\s*width:\s*42px/.test(INDEX_SRC), 'CSS ws-tt-c-hours 42px');
        assertTrue(/th\.ws-tt-c-over\s*\{\s*width:\s*80px/.test(INDEX_SRC), 'CSS ws-tt-c-over 80px');
        // год: «Перераб. (дни)»
        const y = methodText(WS_CLIENT, '_renderTotalsYearTable');
        assertTrue(y.indexOf('Перераб. (дни)') !== -1,
            'годовая колонка «Перераб. (дни)»');
    });
});

// ============================================================
// 5. JS: контроллер ползунков (_attachHbars/_hbarSync/_hbarSyncAll)
// ============================================================
describe('Task 331 — JS: контроллер кастомных ползунков', () => {

    test('JS: методы контроллера + init', () => {
        assertTrue(INDEX_SRC.indexOf('_attachHbars: function') !== -1,
            'метод _attachHbars');
        assertTrue(INDEX_SRC.indexOf('_hbarSync: function') !== -1,
            'метод _hbarSync');
        assertTrue(INDEX_SRC.indexOf('_hbarSyncAll: function') !== -1,
            'метод _hbarSyncAll');
        assertTrue(INDEX_SRC.indexOf('this._attachHbars();') !== -1,
            'init вешает ползунки (однократно, вместе с resize-наблюдателем)');
        const pairs = methodText(WS_CLIENT, '_attachHbars');
        assertTrue(pairs.indexOf("getElementById('wsGridHbar')") !== -1 &&
            pairs.indexOf("getElementById('wsGridWrap')") !== -1,
            'пара ползунка сетки (#wsGridHbar ↔ #wsGridWrap)');
        assertTrue(pairs.indexOf("getElementById('wsTtHbar')") !== -1,
            'пара ползунка шторки (#wsTtHbar ↔ #wsTtBody)');
        assertTrue(pairs.indexOf('ws-tt-gridwide') !== -1,
            'гейт сетки: только широкий режим (gridwide + десктоп)');
        assertTrue(pairs.indexOf('setPointerCapture') !== -1,
            'перетаскивание — pointer capture');
        assertTrue(pairs.indexOf('pointerup') !== -1 && pairs.indexOf('pointercancel') !== -1,
            'окончание перетаскивания');
        assertTrue(pairs.indexOf("window.addEventListener('resize'") !== -1,
            'ресайз окна актуализирует ползунки');
    });

    test('JS: _fitGrid актуализирует ползунки (syncTT)', () => {
        const fg = methodText(WS_CLIENT, '_fitGrid');
        assertTrue(fg.indexOf('self._hbarSyncAll') !== -1,
            'syncTT вызывает _hbarSyncAll (все подгонки — и ползунки)');
    });

    test('JS: рендеры итогов заканчиваются актуализацией ползунков', () => {
        const rm = methodText(WS_CLIENT, '_renderTotalsMonth');
        assertTrue(rm.indexOf('this._hbarSyncAll') !== -1,
            '_renderTotalsMonth → _hbarSyncAll (ширина шторки сменилась)');
        const ry = methodText(WS_CLIENT, '_renderTotalsYearTable');
        assertTrue(ry.indexOf('this._hbarSyncAll') !== -1,
            '_renderTotalsYearTable → _hbarSyncAll');
        const tt = methodText(WS_CLIENT, 'toggleTotals');
        assertTrue(tt.indexOf('this._hbarSyncAll') !== -1,
            'toggleTotals → _hbarSyncAll (открытие/закрытие)');
    });

    test('VM: _hbarSync — включение/выключение и геометрия бегунка', () => {
        const fn = methodFn(WS_CLIENT, '_hbarSync');
        // мок: переполнение есть, гейт активен
        const thumb = { style: {} };
        const bar = { classList: { state: {}, toggle: function(c, on) { this.state[c] = on; },
                                   contains: function(c) { return !!this.state[c]; } },
                      clientWidth: 100 };
        const el = { scrollWidth: 400, clientWidth: 100, scrollLeft: 60 };
        fn.call(null, { bar: bar, el: el, thumb: thumb,
                        gate: function() { return true; } });
        assertEqual(bar.classList.state['on'], true, 'переполнение → .on (дорожка+бегунок)');
        assertEqual(thumb.style.width, '25px',
            'бегунок = max(24, 100×(100/400)) = 25px');
        // позиция: trackMax = 100−25 = 75; прокручено 60/300 = 0,2 → 15px
        assertEqual(thumb.style.left, '15px',
            'позиция бегунка = доля прокрутки (15px)');
        // прокрутка в конец — бегунок у правого края
        el.scrollLeft = 300;
        fn.call(null, { bar: bar, el: el, thumb: thumb,
                        gate: function() { return true; } });
        assertEqual(thumb.style.left, '75px', 'прокрутка в конец → бегунок справа (75px)');
        // без переполнения — выключен, зона пустая
        el.scrollWidth = 100;
        fn.call(null, { bar: bar, el: el, thumb: thumb,
                        gate: function() { return true; } });
        assertEqual(bar.classList.state['on'], false, 'нет переполнения → зона ПУСТАЯ');
        assertEqual(thumb.style.width, '0px', 'бегунок скрыт');
        // гейт неактивен (сетка не в широком режиме) — выключен
        el.scrollWidth = 400;
        fn.call(null, { bar: bar, el: el, thumb: thumb,
                        gate: function() { return false; } });
        assertEqual(bar.classList.state['on'], false, 'гейт закрыт → ползунка нет');
    });

    test('VM: _hbarSyncAll — обновляет все пары', () => {
        const fn = methodFn(WS_CLIENT, '_hbarSyncAll');
        var calls = 0;
        var host = { _HBARS: [1, 2, 3],
                     _hbarSync: function(p) { calls++; } };
        fn.call(host);
        assertEqual(calls, 3, 'все три пары обновлены');
        var calls2 = 0;
        fn.call({ _hbarSync: function() { calls2++; } });
        assertEqual(calls2, 0, 'нет пар (_HBARS пуст) — тишина');
    });

    test('VM: _updateTtHead — пустая шапка ПРЯЧЕТСЯ ([hidden]; Task 332: без «Обновить»)', () => {
        const fn = methodFn(WS_CLIENT, '_updateTtHead');
        const head = { hidden: false };
        const panel = { querySelector: function() { return head; } };
        global.document = mockDoc({
            wsTotalsPanel: panel,
            wsTtWarn: { hidden: true }
        });
        try {
            // Task 332: кнопки «Обновить» шапки больше нет — пустая
            // шапка = только скрытый ⚠ → шапка спрятана ЦЕЛИКОМ
            fn.call({});
            assertEqual(head.hidden, true,
                'без ⚠ — шапка скрыта: шапка столбцов = шапке сетки');
            global.document = mockDoc({
                wsTotalsPanel: panel,
                wsTtWarn: { hidden: false }
            });
            fn.call({});
            assertEqual(head.hidden, false, 'год (⚠ сбоев) — шапка видна');
        } finally {
            delete global.document;
        }
    });
});

// ============================================================
// 6. Геометрия колонок: статичный бордюрчик сетки
// ============================================================
describe('Task 331 — JS: статичный бордюрчик сетки (уровень всегда)', () => {

    test('JS: _renderGrid НЕ рендерит полосу в контейнер', () => {
        const rg = methodText(WS_CLIENT, '_renderGrid');
        assertFalse(rg.indexOf("html += '<div class=\"ws-grid-foot\"") !== -1,
            'полоса не создаётся рендером (она статична #wsGridFoot)');
    });

    test('JS: _fitGrid — бюджет без полосы/ползунка (вне контейнера)', () => {
        const fg = methodText(WS_CLIENT, '_fitGrid');
        assertTrue(fg.indexOf('var budget = avail - headH;') !== -1,
            'бюджет = область − шапка (полоса+ползунок вне контейнера)');
        assertFalse(fg.indexOf('var foot = wrap.querySelector') !== -1,
            'полоса в контейнере не ищется');
    });

    test('HTML: #wsGridFoot/#wsGridHbar — статичные в #wsGridCol', () => {
        const iCol = INDEX_SRC.indexOf('id="wsGridCol"');
        const iFoot = INDEX_SRC.indexOf('id="wsGridFoot"');
        const iHbar = INDEX_SRC.indexOf('id="wsGridHbar"');
        assertTrue(iCol !== -1 && iFoot !== -1 && iHbar !== -1,
            'все элементы колонки объявлены');
        const wsOpen = INDEX_SRC.indexOf('<div id="wsWsBody"');
        assertTrue(wsOpen < iCol, 'колонка внутри рабочей области');
    });
});

// ============================================================
// 7. SW: версия кэша
// ============================================================
describe('Task 331 — SW: версия кэша', () => {
    test('SW: кэш поднят до kipia-test-v733', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v733'") !== -1,
            'CACHE_VERSION = kipia-test-v733');
        assertFalse(SW_SRC.indexOf('kipia-test-v734') !== -1,
            'v571 не существует (один инкремент на Task 331)');
    });
});
