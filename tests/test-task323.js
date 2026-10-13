// tests/test-task323.js
// Task 323 — по заявке пользователя: «Перенеси бар итоги учёта в
// правую часть экрана сбоку и текст названия в баре расположи по
// вертикали, при открытии он должен выдвигаться справа налево на
// половину рабочей области, а внизу шахматки графика при этом
// появляется ползунок для перемещения шахматки по горизонтали —
// для удобства контроля по шахматке расчётов итога. С этим учётом
// строки итогов будут располагаться ровно по строкам работников в
// шахматке, и поэтому список работников в панели итога учёта
// можно убрать».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   HTML: рабочая область #wsWsBody (сетка слева + шторка
//   #wsTotalsDrawer справа); вертикальный бар #wsTotalsBar
//   (класс ws-totals-vbar, текст «Итоги учёта» / «дни и часы»
//   вертикально, шеврон ◂/▸); панель внутри шторки.
//   CSS: вертикальный текст (writing-mode: vertical-rl); шторка
//   50% с отрицательным margin-right (свёрнута — торчит бар) и
//   анимацией; ws-tt-open → margin 0; широкий режим сетки
//   (ws-tt-gridwide): max-content + ВИДИМЫЙ ползунок (12px,
//   webkit + Firefox), шапка по --ws-tt-head-h, ФИО sticky-left;
//   мобильная шторка fixed 86vw/transform, тап-зона 44px;
//   tfoot итоговой строки sticky-bottom; колонка «Сотрудник»
//   скрыта на десктопе в месяце (не в году); скроллбар панели
//   скрыт (синхронный скролл).
//   VM: toggleTotals (панель/aria/шеврон/классы ws-tt-open +
//   ws-tt-gridwide, рендер→var→fit→sync; закрытие — панель
//   сразу hidden, gridwide держится, таймер → _ttCloseCleanup);
//   _ttCloseCleanup (gridwide снят, переменная удалена, fitGrid);
//   _ttIsWide (класс + ≥1024px); _applyTtHeadVar (tabs+thead →
//   --ws-tt-head-h, повторно без изменения); _syncTotalsRows
//   (высоты строк сетки копируются в панель, лишние строки
//   очищаются, scrollTop панели = сетке, эхо-флаг);
//   _attachTotalsSync (слушатели scroll сетки и панели, эхо);
//   _fitGrid: бюджет − tfoot панели (широкий режим), avail по
//   clientHeight (ползунок), syncTT в конце; рендеры: tfoot
//   «Итого», БЕЗ .ws-tt-scroll, ws-tt-year (год), год: активные
//   по порядку сетки + архив ниже; инфо в title.
//   SW: kipia-test-v731.
//
// Запуск: через tests/run-all.js (require './test-task323.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const WS_CLIENT = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        \},|\n    \};/);
    const end = m ? m.index + m[0].length : rest.length;
    let text = rest.slice(0, end);
    text = text.replace(/\n\s{4}\};\s*$/, '');
    return text;
}
function methodFn(src, name, document) {
    const text = methodText(src, name).replace(/,\s*$/, '');
    const body = text.replace(new RegExp('^ {8}' + name + ': '), '');
    return new Function('document', 'return (' + body + ')')(document || null);
}
function wsHost(methodNames, extra, document) {
    const host = Object.assign({}, extra);
    methodNames.forEach(function(n) {
        host[n] = methodFn(WS_CLIENT, n, document || null);
    });
    return host;
}
function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// ============================================================
// 1. HTML: рабочая область + шторка + вертикальный бар
// ============================================================
describe('Task 323 — HTML: боковая шторка и вертикальный бар', () => {
    test('HTML: #wsWsBody — рабочая область (сетка + шторка)', () => {
        const iBody = INDEX_SRC.indexOf('id="wsWsBody"');
        assertTrue(iBody !== -1, 'контейнер рабочей области есть');
        const iGrid = INDEX_SRC.indexOf('id="wsGridWrap"');
        const iDrawer = INDEX_SRC.indexOf('id="wsTotalsDrawer"');
        assertTrue(iGrid !== -1 && iDrawer !== -1, 'сетка и шторка есть');
        assertTrue(iBody < iGrid && iGrid < iDrawer,
            'сетка слева, шторка справа — внутри рабочей области');
    });

    test('HTML: Task 324 — шторка = панель (бар-ручка УДАЛЁН)', () => {
        const iDrawer = INDEX_SRC.indexOf('id="wsTotalsDrawer"');
        const iPanel = INDEX_SRC.indexOf('id="wsTotalsPanel"');
        assertTrue(iDrawer !== -1, 'шторка есть');
        assertTrue(iDrawer < iPanel,
            'панель — содержимое шторки (ручки-бара больше нет, Task 324)');
        const chunk = INDEX_SRC.slice(iDrawer, iDrawer + 1800);
        assertTrue(chunk.indexOf('class="ws-tt-drawer"') !== -1, 'класс шторки');
        // Task 324: вертикальный бар-ручка удалён — открывает кнопка тулбара
        assertFalse(chunk.indexOf('class="ws-totals-vbar"') !== -1,
            'вертикальный бар удалён из шторки (заявка Task 324)');
        assertFalse(chunk.indexOf('ws-tt-vwrap') !== -1,
            'обёртка вертикальных надписей удалена');
    });

    test('HTML: Task 324 → 325 — открытие/закрытие кнопкой тулбара (✕ удалён)', () => {
        const i = INDEX_SRC.indexOf('id="wsTotalsBtn"');
        const chunk = INDEX_SRC.slice(i, i + 900);
        assertTrue(chunk.indexOf('WorkSchedule.toggleTotals()') !== -1,
            'кнопка «Итоги учёта» — toggleTotals');
        assertTrue(chunk.indexOf('aria-pressed') !== -1,
            'кнопка — переключатель (aria-pressed)');
        // Task 325: ✕ шапки удалён — кнопка тулбара ЕДИНСТВЕННЫЙ переключатель
        assertFalse(INDEX_SRC.indexOf('id="wsTtClose"') !== -1,
            '✕ шапки удалён (заявка Task 325)');
        assertFalse(INDEX_SRC.indexOf('id="wsTotalsChev"') !== -1,
            'шеврон ручки удалён');
        assertFalse(INDEX_SRC.indexOf('◂') !== -1,
            'глиф ручки удалён');
    });
});

// ============================================================
// 2. CSS: вертикальный текст, шторка, ползунок, мобильная
// ============================================================
describe('Task 323 — CSS: шторка, шапка, ползунок', () => {
    test('CSS: Task 324 → 325 → 331 — шапка шторки (.ws-tt-head) вместо строки вкладок', () => {
        const head = INDEX_SRC.match(/\.ws-tt-head\s*\{[^}]*min-height:\s*28px[^}]*\}/);
        assertTrue(!!head, 'правило шапки шторки (базовая зона 28px)');
        // Task 325: ✕ удалён — правило .ws-tt-close удалено;
        // Task 331 (заявка: «высота шапки столбцов шторки — по высоте
        // шапки сетки»): ПУСТАЯ шапка (месяц: без ⚠/«Обновить»)
        // ПРЯЧЕТСЯ ЦЕЛИКОМ — 16px-филлер УДАЛЁН, шапка таблицы итогов
        // (38px) одна занимает зону шапки сетки
        assertFalse(/\.ws-tt-close\s*\{/.test(INDEX_SRC),
            'правило ✕ удалено (Task 325)');
        assertFalse(/\.ws-tt-head\.ws-tt-head-empty/.test(INDEX_SRC),
            '16px-филлер удалён (Task 331: пустая шапка — display:none)');
        assertTrue(/\.ws-tt-head\[hidden\]\s*\{\s*display:\s*none/.test(INDEX_SRC),
            'пустая шапка прячется целиком ([hidden], Task 331)');
        assertFalse(INDEX_SRC.indexOf('ws-totals-bar-cap') !== -1,
            'вертикальные надписи ручки удалены');
        assertFalse(INDEX_SRC.indexOf('writing-mode: vertical-rl') !== -1,
            'вертикальный текст ручки удалён (ручки больше нет)');
    });

    test('CSS: шторка — ширина по столбцам, JS-маржа (Task 323→324→329)', () => {
        // Task 492 (адаптация): в шапке CSS появилось новое @media
        // (min-width: 1024px) (ts-bottom-bar — датчики температуры),
        // и прежний regex «от ПЕРВОГО @media в файле до .ws-tt-drawer»
        // стал захватывать лишний CSS (width: 50% из чужих правил).
        // Теперь блок ищется от самого .ws-tt-drawer НАЗАД до ближайшего
        // @media (min-width: 1024px) — это тот же блок, что и прежде.
        const iTt = INDEX_SRC.indexOf('.ws-tt-drawer {');
        const iMedia = INDEX_SRC.lastIndexOf('@media (min-width: 1024px)', iTt);
        assertTrue(iTt !== -1 && iMedia !== -1, 'десктопное правило шторки');
        const d = [INDEX_SRC.slice(iMedia, INDEX_SRC.indexOf('}', iTt) + 1)];
        // Task 329 (заявка): ширина — РОВНО ПО СТОЛБЦАМ таблицы (JS
        // _fitTtDrawer в px), не половина области; кап 60%
        assertTrue(d[0].indexOf('max-width: 60%') !== -1,
            'кап 60% — длинные таблицы прокруткой');
        assertTrue(d[0].indexOf('transition: margin-right 0.28s ease') !== -1,
            'анимация выдвижения справа налево (маржа — JS в px)');
        assertFalse(d[0].indexOf('width: 50%') !== -1,
            'фиксированной ширины 50% больше нет (Task 329)');
        const open = INDEX_SRC.match(/#page-work-schedule\.ws-tt-open \.ws-tt-drawer\s*\{[^}]*\}/);
        assertFalse(!!open && open[0].indexOf('margin-right: 0') !== -1,
            'правила маржи у ws-tt-open больше нет — маржа инлайновая (JS)');
        assertTrue(/#page-work-schedule\.ws-tt-open \.ws-tt-drawer\s*\{[^}]*transform:\s*none/.test(INDEX_SRC),
            'мобильное правило (transform) осталось');
        // JS-геометрия: парковка −ширина/анимация к 0 в toggleTotals
        assertTrue(INDEX_SRC.indexOf("drawer.style.marginRight = (-w0) + 'px';") !== -1,
            'открытие: старт за краем (−ширина)');
        assertTrue(INDEX_SRC.indexOf("drawer.style.marginRight = '0px';") !== -1,
            'открытие: маржа к 0');
        assertTrue(INDEX_SRC.indexOf("drawer.style.marginRight = (-w1) + 'px';") !== -1,
            'закрытие: маржа = −ширина');
    });

    test('CSS: сетка НЕ скрывается, рабочая область — строка', () => {
        assertFalse(/#page-work-schedule\.ws-tt-open \.ws-grid-wrap\s*\{[^}]*display:\s*none/.test(INDEX_SRC),
            'шахматка остаётся видимой рядом с шторкой');
        const row = INDEX_SRC.match(/\.ws-body\s*\{[^}]*flex-direction:\s*row[^}]*\}/);
        assertTrue(!!row, 'рабочая область — flex-строка (сетка|шторка)');
        assertTrue(row[0].indexOf('overflow: hidden') !== -1,
            'хвост свёрнутой шторки обрезается');
    });

    test('CSS: ПОЛЗУНОК внизу шахматки — КАСТОМНЫЙ, под бордюром (Task 331)', () => {
        // Task 331 (заявка: «не должно быть полосок вертикальной
        // прокрутки… в шахматке»): нативные полосы контейнера скрыты
        // (Firefox thin давал вертикальную полоску), ползунок —
        // КАСТОМНЫЙ #wsGridHbar в зоне 12px ПОД бордюром .ws-grid-foot
        assertFalse(/#page-work-schedule\.ws-tt-gridwide \.ws-grid-wrap::-webkit-scrollbar\s*\{[^}]*height:\s*12px/.test(INDEX_SRC),
            'нативный webkit-ползунок gridwide удалён (Task 331)');
        assertFalse(/#page-work-schedule\.ws-tt-gridwide \.ws-grid-wrap\s*\{[^}]*scrollbar-width:\s*thin/.test(INDEX_SRC),
            'нативная thin-полоса gridwide удалена (Task 331)');
        assertTrue(/\.ws-grid-hbar[\s\S]{0,80}height:\s*12px/.test(INDEX_SRC),
            'зона ползунка 12px (Task 331)');
        assertTrue(/\.ws-grid-hbar\.on[\s\S]{0,150}background:\s*rgba\(255,\s*255,\s*255,\s*0\.05\)/.test(INDEX_SRC),
            'дорожка окрашена (как прежний нативный ползунок)');
        assertTrue(/\.ws-grid-hbar\.on \.ws-hbar-thumb,[\s\S]*?\.ws-tt-hbar\.on \.ws-hbar-thumb\s*\{[^}]*border-radius:\s*6px/.test(INDEX_SRC),
            'бегунок скруглён');
        assertTrue(/id="wsGridHbar" aria-hidden="true"><div class="ws-hbar-thumb"/.test(INDEX_SRC),
            'ползунок #wsGridHbar в разметке колонки сетки');
        assertTrue(/\[data-theme="light"\] \.ws-grid-hbar\.on \.ws-hbar-thumb/.test(INDEX_SRC),
            'ползунок в светлой теме');
    });

    test('CSS: сетка в широком режиме — природная ширина, ФИО sticky', () => {
        const g = INDEX_SRC.match(/#page-work-schedule\.ws-tt-gridwide \.ws-grid\s*\{[^}]*\}/);
        assertTrue(!!g && g[0].indexOf('width: max-content') !== -1,
            'таблица природной ширины (31 день не сжимается в пол-экрана)');
        assertTrue(!!g && g[0].indexOf('table-layout: auto') !== -1,
            'авто-раскладка колонок');
        const day = INDEX_SRC.match(/#page-work-schedule\.ws-tt-gridwide \.ws-grid thead th\.ws-day-col\s*\{[^}]*\}/);
        assertTrue(!!day && day[0].indexOf('min-width: 30px') !== -1,
            'минимальная ширина дня (читаемые ячейки)');
        const emp = INDEX_SRC.match(/#page-work-schedule\.ws-tt-gridwide \.ws-grid tbody td\.ws-emp-col\s*\{[^}]*\}/);
        assertTrue(!!emp && emp[0].indexOf('position: sticky') !== -1 &&
            emp[0].indexOf('left: 0') !== -1,
            'колонка ФИО прилипла к левому краю (видна при прокрутке)');
        assertTrue(!!emp && emp[0].indexOf('background') !== -1,
            'ФИО — непрозрачный фон (не просвечивает прокрутка)');
        const th = INDEX_SRC.match(/#page-work-schedule\.ws-tt-gridwide \.ws-grid thead th\s*\{[^}]*\}/);
        assertTrue(!!th && th[0].indexOf('var(--ws-tt-head-h, 38px)') !== -1,
            'шапка сетки — высота заголовочной зоны панели (выравнивание строк)');
        assertTrue(!!th && th[0].indexOf('vertical-align: middle') !== -1,
            'даты центрированы в высокой шапке');
    });

    test('CSS: Task 324 → 331 — панель: ползунок КАСТОМНЫЙ под бордюром', () => {
        const b = INDEX_SRC.match(/\.ws-tt-body\s*\{[^}]*\}/);
        assertTrue(!!b && b[0].indexOf('overflow: auto') !== -1, 'скролл-контейнер');
        // Task 331 (заявка: «не должно быть полосок вертикальной
        // прокрутки в шторке»; «полоску горизонтальной прокрутки —
        // ПОД нижним бордюром, как под шахматкой»): ВСЕ нативные
        // полосы тела скрыты в обоих движках; горизонтальная
        // прокрутка — КАСТОМНЫМ ползунком #wsTtHbar ПОД .ws-tt-foot
        assertTrue(b[0].indexOf('scrollbar-width: none') !== -1,
            'Firefox: все нативные полосы скрыты (Task 331)');
        const sb = INDEX_SRC.match(/\.ws-tt-body::-webkit-scrollbar\s*\{[^}]*\}/);
        assertTrue(!!sb && sb[0].indexOf('display: none') !== -1,
            'webkit: все нативные полосы скрыты (Task 331)');
        assertFalse(/\.ws-tt-body::-webkit-scrollbar-thumb/.test(INDEX_SRC),
            'нативного бегунка шторки больше нет');
        assertTrue(/id="wsTtHbar" aria-hidden="true"><div class="ws-hbar-thumb"/.test(INDEX_SRC),
            'кастомный ползунок #wsTtHbar ПОД .ws-tt-foot (Task 331)');
        // Task 327 (заявка): заголовки — в ДВЕ строки при необходимости
        // (свёрнуто Task 324 «одной строкой» — узкие равные столбцы
        // требуют переноса; у года месяцы — по-прежнему одной строкой)
        const th = INDEX_SRC.match(/\.ws-tt-table th\s*\{[^}]*\}/);
        assertTrue(!!th && th[0].indexOf('white-space: normal') !== -1,
            'заголовки переносятся (заявка Task 327)');
        const thY = INDEX_SRC.match(/\.ws-tt-table\.ws-tt-year th\s*\{[^}]*\}/);
        assertTrue(!!thY && thY[0].indexOf('white-space: nowrap') !== -1,
            'год: месяцы одной строкой');
        // Task 327 (заявка): tfoot итоговой строки УДАЛЁН — низ панели
        // закрывает бордюрчик .ws-tt-foot (как у шахматки)
        assertFalse(/tfoot tr\.ws-tt-total/.test(INDEX_SRC),
            'прилипающий tfoot удалён (заявка Task 327)');
        const foot = INDEX_SRC.match(/\.ws-tt-foot\s*\{[^}]*height:\s*5px[^}]*\}/);
        assertTrue(!!foot && foot[0].indexOf('#35648f') !== -1,
            'бордюрчик .ws-tt-foot 5px внизу шторки');
    });

    test('CSS: колонка «Сотрудник» — месяц скрыт на десктопе, год/мобайл видны', () => {
        const m = INDEX_SRC.match(/@media \(min-width: 1024px\)\s*\{[\s\S]*?\.ws-tt-table:not\(\.ws-tt-year\) th\.ws-tt-emp,\s*\.ws-tt-table:not\(\.ws-tt-year\) td\.ws-tt-emp\s*\{[^}]*display:\s*none[^}]*\}/);
        assertTrue(!!m, 'месяц на десктопе: колонка скрыта — строки по строкам сетки');
        // мобайл: колонка остаётся — мобильный блок таблицы итогов
        // (компактные ячейки; Task 325: кап 150px СНЯТ — ширина по самому
        // широкому ФИО, БЕЗ display:none)
        const mob = INDEX_SRC.match(/@media \(max-width: 1023px\)\s*\{\s*\.ws-tt-table th, \.ws-tt-table td \{ padding: 5px 8px; \}\s*\}/);
        assertTrue(!!mob, 'мобильные правила таблицы итогов есть');
        assertFalse(mob[0].indexOf('display: none') !== -1,
            'мобайл: список сотрудников НЕ скрыт (строки не совпадают с сеткой)');
        assertFalse(mob[0].indexOf('max-width: 150px') !== -1,
            'Task 325: кап 150px снят — колонка по самому широкому тексту');
    });

    test('CSS: мобильная шторка — fixed, 86vw, transform (Task 324 → 325)', () => {
        const m = INDEX_SRC.match(/\.ws-tt-drawer\s*\{[^}]*position:\s*fixed[^}]*\}/);
        assertTrue(!!m, 'мобильное правило шторки (fixed-оверлей)');
        assertTrue(m[0].indexOf('min(86vw, 560px)') !== -1, 'ширина ~86vw');
        assertTrue(m[0].indexOf('transform: translateX(100%)') !== -1,
            'Task 324: свёрнута — ПОЛНОСТЬЮ за экраном (ручки нет)');
        assertTrue(m[0].indexOf('z-index: 75') !== -1, 'под окнами/барами приложения');
        // Task 325: ✕ удалён — на мобиле закрывает та же кнопка тулбара
        assertFalse(/\.ws-tt-close\s*\{[^}]*width:\s*44px/.test(INDEX_SRC),
            'тап-зона ✕ 44px удалена вместе с кнопкой');
        const open = INDEX_SRC.match(/#page-work-schedule\.ws-tt-open \.ws-tt-drawer\s*\{[^}]*transform:\s*none/);
        assertTrue(!!open, 'мобайл: открыта — без сдвига');
    });
});

// ============================================================
// 3. VM: toggleTotals / _ttCloseCleanup / _ttIsWide
// ============================================================
describe('Task 323 — VM: переключение шторки', () => {
    function makeHost() {
        const calls = { render: 0, fit: 0, sync: 0, cleanup: 0, varSet: 0 };
        // Task 324: переключатель — КНОПКА ТУЛБАРА (aria-pressed)
        const btn = {
            attrs: {},
            setAttribute: function(k, v) { this.attrs[k] = v; }
        };
        const panel = { hidden: true };
        const page = {
            classList: {
                state: {},
                toggle: function(c, o) { this.state[c] = o; },
                add: function() { for (var i = 0; i < arguments.length; i++) this.state[arguments[i]] = true; },
                remove: function() { for (var i = 0; i < arguments.length; i++) this.state[arguments[i]] = false; },
                contains: function(c) { return !!this.state[c]; }
            },
            style: {
                props: {},
                setProperty: function(k, v) { this.props[k] = v; },
                getPropertyValue: function(k) { return this.props[k] || ''; },
                removeProperty: function(k) { delete this.props[k]; }
            }
        };
        // Task 327: toggleTotals зовёт _updateTtTabsVisible (вкладки
        // появляются при открытии) и _updateTtChv («Ещё»)
        const host = wsHost(['toggleTotals', '_ttCloseCleanup', '_ttIsWide',
                             '_updateTtTabsVisible', '_updateTtChv'],
            { _totalsOpen: false, _totalsTab: 'month', _totalsExtra: false },
            mockDoc({ wsTotalsBtn: btn, wsTotalsPanel: panel,
                      'page-work-schedule': page }));
        host._renderTotals = function() { calls.render++; };
        host._fitGrid = function() { calls.fit++; };
        host._applyTtHeadVar = function() { calls.varSet++; return false; };
        host._syncTotalsRows = function() { calls.sync++; };
        return { host: host, btn: btn, panel: panel, page: page, calls: calls };
    }

    test('toggleTotals: открыть — панель, aria-pressed, ДВА класса, рендер', () => {
        const t = makeHost();
        t.host.toggleTotals();
        assertEqual(t.panel.hidden, false, 'панель показана');
        assertEqual(t.btn.attrs['aria-pressed'], 'true',
            'кнопка тулбара «нажата» (aria-pressed)');
        assertEqual(t.page.classList.state['ws-tt-open'], true, 'ws-tt-open');
        assertEqual(t.page.classList.state['ws-tt-gridwide'], true,
            'ws-tt-gridwide — сетка в широком режиме (ползунок)');
        assertEqual(t.calls.render, 1, 'итоги отрисованы');
        assertEqual(t.calls.varSet, 1, 'высота заголовочной зоны применена');
        assertEqual(t.calls.fit, 1, 'строки пересчитаны');
        assertEqual(t.calls.sync, 1, 'строки итогов синхронизированы');
    });

    test('toggleTotals: закрыть — шторка едет С КОНТЕНТОМ (Task 329), gridwide держится', () => {
        const t = makeHost();
        t.host.toggleTotals();
        t.host.toggleTotals();
        // Task 329: панель прячется ПОСЛЕ анимации (_ttCloseCleanup,
        // 320 мс) — шторка уезжает С КОНТЕНТОМ, не пустой
        assertEqual(t.panel.hidden, false, 'панель едет с контентом (Task 329)');
        assertEqual(t.btn.attrs['aria-pressed'], 'false', 'кнопка «отпущена»');
        assertEqual(t.page.classList.state['ws-tt-open'], false, 'шторка свёрнута');
        assertEqual(t.page.classList.state['ws-tt-gridwide'], true,
            'широкий режим держится до конца анимации (320 мс)');
        t.host._ttCloseCleanup();
        assertEqual(t.panel.hidden, true, 'после уборки панель спрятана');
        assertEqual(t.calls.fit >= 2, true, 'fitGrid при закрытии');
    });

    test('_ttCloseCleanup: снимает gridwide, чистит переменную, пересчёт', () => {
        const t = makeHost();
        t.host.toggleTotals();
        t.host.toggleTotals();
        const fits = t.calls.fit;
        t.host._ttCloseCleanup();
        assertEqual(t.page.classList.state['ws-tt-gridwide'], false,
            'широкий режим снят');
        assertEqual(t.page.style.props['--ws-tt-head-h'], undefined,
            'переменная высоты шапки удалена');
        assertEqual(t.calls.fit, fits + 1, 'строки пересчитаны после уборки');
        // повторная уборка безопасна (после таймера)
        t.host._ttCloseCleanup();
        assertEqual(t.calls.fit, fits + 2, 'повторная уборка тоже пересчитывает');
    });

    test('_ttCloseCleanup: при открытой шторке — ничего не делает', () => {
        const t = makeHost();
        t.host.toggleTotals();
        t.host._ttCloseCleanup();
        assertEqual(t.page.classList.state['ws-tt-gridwide'], true,
            'открытая шторка — режим не снят');
        assertEqual(t.calls.fit, 1, 'лишнего пересчёта нет');
    });

    test('_ttIsWide: класс gridwide + десктоп (matchMedia)', () => {
        const t = makeHost();
        assertEqual(t.host._ttIsWide(), false, 'класса нет — false');
        t.page.classList.state['ws-tt-gridwide'] = true;
        // мок window: десктоп — true, мобильный — false
        const savedWindow = global.window;
        global.window = { matchMedia: function(q) { return { matches: true }; } };
        assertEqual(t.host._ttIsWide(), true, 'десктоп + класс — true');
        global.window = { matchMedia: function(q) { return { matches: false }; } };
        assertEqual(t.host._ttIsWide(), false, 'мобильный вид — false');
        global.window = {};   // без matchMedia
        assertEqual(t.host._ttIsWide(), false, 'без matchMedia — false');
        if (savedWindow === undefined) delete global.window;
        else global.window = savedWindow;
    });
});

// ============================================================
// 4. VM: _applyTtHeadVar — высота заголовочной зоны
// ============================================================
describe('Task 323 — VM: _applyTtHeadVar', () => {
    function makeHost(tabsH, theadH, curVar) {
        const page = {
            style: {
                props: curVar ? { '--ws-tt-head-h': curVar } : {},
                setProperty: function(k, v) { this.props[k] = v; },
                getPropertyValue: function(k) { return this.props[k] || ''; },
                removeProperty: function(k) { delete this.props[k]; }
            }
        };
        const panel = {
            getBoundingClientRect: function() { return { height: 300 }; },
            querySelector: function(sel) {
                if (sel === '.ws-tt-head') {
                    return { getBoundingClientRect: function() { return { height: tabsH }; } };
                }
                if (sel === '.ws-tt-table thead') {
                    return { getBoundingClientRect: function() { return { height: theadH }; } };
                }
                return null;
            }
        };
        const host = wsHost(['_applyTtHeadVar', '_updateTtHead'], { _totalsOpen: true },
            mockDoc({ 'page-work-schedule': page, wsTotalsPanel: panel,
                      wsTtWarn: { hidden: true }, wsTtRefresh: { hidden: false } }));
        return { host: host, page: page };
    }

    test('зона = вкладки + шапка таблицы → переменная целым числом', () => {
        const t = makeHost(26.4, 31.2, '');
        const changed = t.host._applyTtHeadVar();
        assertEqual(changed, true, 'первое применение — изменено');
        assertEqual(t.page.style.props['--ws-tt-head-h'], '58px',
            'ceil(26,4 + 31,2) = 58px');
    });

    test('та же высота — НЕ изменилось (без лишнего пересчёта)', () => {
        const t = makeHost(26, 32, '58px');
        assertEqual(t.host._applyTtHeadVar(), false, 'высота та же');
    });

    test('закрытая шторка / нет таблицы — без изменения', () => {
        const t = makeHost(26, 32, '');
        t.host._totalsOpen = false;
        assertEqual(t.host._applyTtHeadVar(), false, 'закрыто — нет');
        const panel = { querySelector: function() { return null; } };
        const host2 = wsHost(['_applyTtHeadVar', '_updateTtHead'], { _totalsOpen: true },
            mockDoc({ wsTotalsPanel: panel, 'page-work-schedule': t.page,
                      wsTtWarn: { hidden: true }, wsTtRefresh: { hidden: false } }));
        assertEqual(host2._applyTtHeadVar(), false, 'нет шапки — нет');
    });
});

// ============================================================
// 5. VM: _syncTotalsRows — строки итогов по строкам сетки
// ============================================================
describe('Task 323 — VM: _syncTotalsRows', () => {
    function makeDom(gHeights, tCount) {
        const gRows = gHeights.map(function(h) {
            return { getBoundingClientRect: function() { return { height: h }; }, style: {} };
        });
        const tRows = [];
        for (var i = 0; i < tCount; i++) tRows.push({ style: { height: 'не трогать ' + i } });
        const gridTable = { querySelectorAll: function(sel) { return sel === 'tbody tr' ? gRows : []; } };
        const ttTable = { querySelectorAll: function(sel) { return sel === 'tbody tr' ? tRows : []; } };
        const gridWrap = { scrollTop: 33, querySelector: function() { return gridTable; } };
        const body = { scrollTop: 0, querySelector: function() { return ttTable; } };
        return { gridWrap: gridWrap, body: body, gRows: gRows, tRows: tRows };
    }

    test('высоты строк сетки копируются в строки итогов (ceil)', () => {
        const d = makeDom([40.2, 39.8, 41], 3);
        const host = wsHost(['_syncTotalsRows'], { _totalsOpen: true, _ttEchoP: false },
            mockDoc({ wsGridWrap: d.gridWrap, wsTtBody: d.body }));
        host._ttEchoG = false;
        host._syncTotalsRows();
        assertEqual(d.tRows[0].style.height, '41px', 'ceil(40,2) = 41');
        assertEqual(d.tRows[1].style.height, '40px', 'ceil(39,8) = 40');
        assertEqual(d.tRows[2].style.height, '41px', '41 без изменения');
        assertEqual(d.body.scrollTop, 33, 'скролл панели = скроллу сетки');
    });

    test('лишние строки панели (год: архив) — высота сброшена', () => {
        const d = makeDom([40], 3);
        const host = wsHost(['_syncTotalsRows'], { _totalsOpen: true, _ttEchoP: false },
            mockDoc({ wsGridWrap: d.gridWrap, wsTtBody: d.body }));
        host._ttEchoG = false;
        host._syncTotalsRows();
        assertEqual(d.tRows[0].style.height, '40px', 'первая строка — по сетке');
        assertEqual(d.tRows[1].style.height, '', 'вторая (без пары) — природная');
        assertEqual(d.tRows[2].style.height, '', 'третья (без пары) — природная');
    });

    test('нулевая высота (скрытая страница) — высота не ставится', () => {
        const d = makeDom([0], 1);
        const host = wsHost(['_syncTotalsRows'], { _totalsOpen: true, _ttEchoP: false },
            mockDoc({ wsGridWrap: d.gridWrap, wsTtBody: d.body }));
        host._ttEchoG = false;
        host._syncTotalsRows();
        assertEqual(d.tRows[0].style.height, '', '0px — высота очищена');
    });

    test('эхо-флаг панели — сетку не дёргаем (панель ведёт)', () => {
        const d = makeDom([40], 1);
        const host = wsHost(['_syncTotalsRows'], { _totalsOpen: true, _ttEchoP: true },
            mockDoc({ wsGridWrap: d.gridWrap, wsTtBody: d.body }));
        host._syncTotalsRows();
        assertEqual(d.tRows[0].style.height, '40px', 'высоты всё равно скопированы');
        assertEqual(d.body.scrollTop, 0, 'скролл НЕ навязан (эхо)');
    });

    test('закрытая шторка / нет таблиц — выход без ошибок', () => {
        const d = makeDom([40], 1);
        const host = wsHost(['_syncTotalsRows'], { _totalsOpen: false },
            mockDoc({ wsGridWrap: d.gridWrap, wsTtBody: d.body }));
        host._syncTotalsRows();
        assertEqual(d.tRows[0].style.height, 'не трогать 0', 'ничего не менялось');
        const host2 = wsHost(['_syncTotalsRows'], { _totalsOpen: true },
            mockDoc({ wsGridWrap: null, wsTtBody: null }));
        host2._syncTotalsRows();   // не падает
    });
});

// ============================================================
// 6. VM: _attachTotalsSync — синхронизация скролла
// ============================================================
describe('Task 323 — VM: синхронизация скролла сетка ⇄ панель', () => {
    function makeScrollPair() {
        const events = { grid: [], panel: [] };
        const gridWrap = {
            scrollTop: 0,
            addEventListener: function(type, fn) { events.grid.push(fn); }
        };
        const body = {
            scrollTop: 0,
            addEventListener: function(type, fn) { events.panel.push(fn); }
        };
        const host = wsHost(['_attachTotalsSync'], { _totalsOpen: true },
            mockDoc({ wsGridWrap: gridWrap, wsTtBody: body }));
        host._attachTotalsSync();
        host._attachTotalsSync();   // второй вызов — один набор слушателей
        return { host: host, gridWrap: gridWrap, body: body, events: events };
    }

    test('слушатели на оба контейнера, ровно по одному', () => {
        const t = makeScrollPair();
        assertEqual(t.events.grid.length, 1, 'один слушатель сетки');
        assertEqual(t.events.panel.length, 1, 'один слушатель панели');
    });

    test('скролл сетки тянет панель (эхо глушится)', () => {
        const t = makeScrollPair();
        t.gridWrap.scrollTop = 50;
        t.events.grid[0]();
        assertEqual(t.body.scrollTop, 50, 'панель подвинулась к сетке');
        // событие панели (эхо нашего присвоения) НЕ тянет сетку
        t.events.panel[0]();
        assertEqual(t.gridWrap.scrollTop, 50, 'сетка не изменилась (эхо)');
    });

    test('скролл панели тянет сетку (обратная синхронизация)', () => {
        const t = makeScrollPair();
        t.body.scrollTop = 77;
        t.events.panel[0]();
        assertEqual(t.gridWrap.scrollTop, 77, 'сетка подвинулась к панели');
        t.events.grid[0]();
        assertEqual(t.body.scrollTop, 77, 'панель не изменилась (эхо)');
    });

    test('закрытая шторка — скроллы не синхронизируются', () => {
        const t = makeScrollPair();
        t.host._totalsOpen = false;
        t.gridWrap.scrollTop = 90;
        t.events.grid[0]();
        assertEqual(t.body.scrollTop, 0, 'панель не тронута');
    });
});

// ============================================================
// 7. VM: _fitGrid — бюджет с итоговой строкой и ползунком
// ============================================================
describe('Task 323 — VM: _fitGrid учитывает шторку', () => {
    test('JS: бюджет = область − шапка (полоса/ползунок вне контейнера, Task 331)', () => {
        const txt = methodText(WS_CLIENT, '_fitGrid');
        assertTrue(txt.indexOf('var budget = avail - headH;') !== -1,
            'формула бюджета: только шапка — полоса и зона ползунка ' +
            'СТАТИЧНЫЕ, вне контейнера (Task 331)');
        // Task 327 (заявка): итоговой строки нет — резерв не ищется
        assertFalse(txt.indexOf("querySelector('#wsTtBody .ws-tt-total')") !== -1,
            'высота tfoot больше не читается (строки Итого нет)');
        assertFalse(txt.indexOf('var foot = wrap.querySelector') !== -1,
            'полоса больше не ищется в контейнере (она статична)');
    });

    test('JS: avail — из rect контейнера (нативные полосы скрыты, Task 331)', () => {
        const txt = methodText(WS_CLIENT, '_fitGrid');
        assertTrue(txt.indexOf('var avail = Math.floor(wrap.getBoundingClientRect().height + 0.25);') !== -1,
            'высота области — из реальной геометрии контейнера');
        assertFalse(txt.indexOf('var chH = wrap.clientHeight;') !== -1,
            'поправка clientHeight удалена: нативных полос нет — ' +
            'clientHeight = padding-коробка (Task 331)');
    });

    test('JS: подгонка завершается синхронизацией строк итогов', () => {
        const txt = methodText(WS_CLIENT, '_fitGrid');
        assertTrue(txt.indexOf('syncTT();') !== -1, 'syncTT вызывается');
        assertTrue(txt.indexOf('_syncTotalsRows') !== -1, 'строки копируются');
        assertTrue(txt.indexOf('_ttIsWide') !== -1, 'только в широком режиме');
    });
});

// ============================================================
// 8. VM: рендеры — tfoot, без обёртки, класс года, порядок строк
// ============================================================
describe('Task 323 — VM: структура таблиц итогов', () => {
    const RENDER_STUBS = {
        _applyTtHeadVar: function() { return false; },
        _fitGrid: function() {},
        _syncTotalsRows: function() {}
    };

    function makeMonthHost() {
        // Task 324: инфо-строка удалена — ⚠ шапки (пустая на месяце)
        const els = { wsTtBody: { innerHTML: '', querySelector: function() { return null; } },
                      wsTtWarn: { textContent: '', hidden: true, attrs: {},
                                  setAttribute: function(k, v) { this.attrs[k] = v; } } };
        const host = wsHost(['_codeHours', '_totalsZero', '_totalsAgg', '_statusMeta',
                             '_empTypeMap', '_overHours', '_totalsEffectiveEntries',
                             '_fmtTotalsNum', '_esc', '_setTtWarn', '_renderTotalsMonth'],
            Object.assign({
                _year: 2026, _month: 9,
                _EMPLOYEES: [
                    { 'таб_номер': '0871', 'ФИО': 'Иванов И.И.', 'тип': 'сменный' }
                ],
                _ENTRIES: [
                    { 'дата': '2026-09-01', 'таб_номер': '0871', 'статус': 'Д' }
                ],
                _PENDING: {},
                _STATUS_CODES: [ { code: 'Д', name: 'День (12-час)' } ]
            }, RENDER_STUBS), mockDoc(els));
        return { host: host, els: els };
    }

    test('месяц: БЕЗ обёртки .ws-tt-scroll, таблица прямо в #wsTtBody', () => {
        const t = makeMonthHost();
        t.host._renderTotalsMonth();
        const h = t.els.wsTtBody.innerHTML;
        assertTrue(h.indexOf('<table class="ws-tt-table">') !== -1, 'таблица без обёртки');
        assertFalse(h.indexOf('ws-tt-scroll') !== -1, 'обёртка .ws-tt-scroll удалена');
    });

    test('месяц: НЕТ итоговой строки (Task 327 — заявка)', () => {
        const t = makeMonthHost();
        t.host._renderTotalsMonth();
        const h = t.els.wsTtBody.innerHTML;
        // Task 327 (заявка: «убери строку общего количества»): tfoot
        // «Итого по подразделению» НЕ рендерится — таблицу снизу
        // закрывает бордюрчик .ws-tt-foot панели
        assertFalse(h.indexOf('<tfoot>') !== -1, 'tfoot не рендерится');
        assertFalse(h.indexOf('Итого по подразделению') !== -1, 'подписи итога нет');
        assertFalse(h.indexOf('ws-tt-total') !== -1, 'класса итоговой строки нет');
        assertTrue(h.indexOf('</tbody></table>') !== -1, 'таблица закрывается после tbody');
    });

    test('месяц: колонка «Сотрудник» рендерится (скрывает CSS на десктопе)', () => {
        const t = makeMonthHost();
        t.host._renderTotalsMonth();
        const h = t.els.wsTtBody.innerHTML;
        // Task 335: текст шапки — в span.ws-tt-emp-head (обмен
        // «Сотрудник»→«Сотр» при сужении)
        assertTrue(h.indexOf('<th class="ws-tt-emp"><span class="ws-tt-emp-head"') !== -1 &&
            h.indexOf('data-full="Работник"') !== -1,
            'заголовок колонки в разметке (мобайл/год; Task 385: работник)');
        assertTrue(h.indexOf('Иванов И.И.') !== -1, 'ФИО в строке (мобайл)');
    });

    test('месяц: Task 324 — инфо-строка удалена, ⚠ пуст', () => {
        const t = makeMonthHost();
        t.host._renderTotalsMonth();
        assertEqual(t.els.wsTtWarn.textContent, '', '⚠ пуст (инфо удалена по заявке)');
        assertEqual(t.els.wsTtWarn.hidden, true, '⚠ скрыта');
        const txt = methodText(WS_CLIENT, '_renderTotalsMonth');
        assertTrue(txt.indexOf("_setTtWarn('')") !== -1,
            'рендер месяца гасит ⚠ (аварий на месяце нет)');
        assertFalse(txt.indexOf('wsTtInfo') !== -1,
            'инфо-строка больше не пишется');
    });

    test('год: таблица с классом ws-tt-year (колонка сотрудника видна)', () => {
        const els = { wsTtBody: { innerHTML: '', querySelector: function() { return null; } },
                      wsTtWarn: { textContent: '', hidden: true, attrs: {},
                                  setAttribute: function(k, v) { this.attrs[k] = v; } } };
        const md = {
            year: 2026, ts: Date.now(), failed: 0,
            months: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [],
                      9: [ { 'дата': '2026-09-01', 'таб_номер': '0871', 'статус': 'Д' } ],
                      10: [], 11: [], 12: [] },
            employees: [ { 'таб_номер': '0871', 'ФИО': 'Иванов И.И.' } ]
        };
        const host = wsHost(['_codeHours', '_totalsZero', '_totalsAgg', '_statusMeta',
                             '_empTypeMap', '_overHours', '_fmtTotalsNum', '_esc',
                             '_sortEmployees', '_setTtWarn', '_renderTotalsYearTable'],
            Object.assign({ _year: 2026, _month: 9,
                _EMPLOYEES: [ { 'таб_номер': '0871', 'ФИО': 'Иванов И.И.' } ],
                _STATUS_CODES: [ { code: 'Д', name: 'День (12-час)' } ],
                _YEAR_DATA: md }, RENDER_STUBS), mockDoc(els));
        host._renderTotalsYearTable();
        const h = els.wsTtBody.innerHTML;
        assertTrue(h.indexOf('<table class="ws-tt-table ws-tt-year">') !== -1,
            'класс ws-tt-year — колонка сотрудника на десктопе видна');
        // Task 327 (заявка): итоговой строки в годе больше нет
        assertFalse(h.indexOf('<tfoot>') !== -1, 'год: tfoot не рендерится (заявка)');
        assertTrue(h.indexOf('</tbody></table>') !== -1, 'год: таблица закрывается после tbody');
    });

    test('год: активные — строками сетки, АРХИВ — блоком ниже (Task 323 → 332 → 333)', () => {
        const els = { wsTtBody: { innerHTML: '', querySelector: function() { return null; } },
                      wsTtWarn: { textContent: '', hidden: true, attrs: {},
                                  setAttribute: function(k, v) { this.attrs[k] = v; } } };
        const md = {
            year: 2026, ts: Date.now(), failed: 0,
            months: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [],
                      9: [], 10: [], 11: [], 12: [] },
            employees: [
                { 'таб_номер': '099', 'ФИО': 'Сидоров С.С.', 'в_архиве': 1 },
                { 'таб_номер': '023', 'ФИО': 'Петров П.П.' }
            ]
        };
        const host = wsHost(['_codeHours', '_totalsZero', '_totalsAgg', '_statusMeta',
                             '_empTypeMap', '_overHours', '_fmtTotalsNum', '_esc',
                             '_sortEmployees', '_setTtWarn', '_renderTotalsYearTable'],
            Object.assign({ _year: 2026, _month: 9,
                // сетка: Петров (023) — первая строка
                _EMPLOYEES: [ { 'таб_номер': '023', 'ФИО': 'Петров П.П.' } ],
                _STATUS_CODES: [], _YEAR_DATA: md }, RENDER_STUBS), mockDoc(els));
        host._renderTotalsYearTable();
        const h = els.wsTtBody.innerHTML;
        // Task 333 (заявка: «Архив в годовой таблице всё же нужен»):
        // активный Петров — в ГЛАВНОЙ таблице (строки года = строки
        // сетки, колонка «Сотрудник» — мобайл, десктоп — стик-ФИО
        // сетки, CSS .ws-tt-year:not(.ws-tt-arch)); архивный Сидоров
        // — ОТДЕЛЬНЫМ БЛОКОМ «Архив» (.ws-tt-arch — своя колонка
        // «Сотрудник» на любом экране, в сетке архивных строк нет)
        assertEqual((h.match(/<tr>/g) || []).length, 6,
            '6 <tr>: шапка+подстрока+Петров (главная) + шапка+подстрока+Сидоров (архив) — Task 401');
        assertTrue(h.indexOf('ws-tt-arch-cap') !== -1 && h.indexOf('>Архив</div>') !== -1,
            'подпись «Архив» под таблицей (Task 333)');
        assertTrue(h.indexOf('ws-tt-year ws-tt-arch') !== -1,
            'таблица архива — класс ws-tt-arch (Task 333)');
        assertTrue(h.indexOf('Сидоров С.С.') !== -1,
            'архивный Сидоров — в блоке архива (Task 333)');
        assertTrue(h.indexOf('Петров П.П.') !== -1,
            'активный Петров — строка главной таблицы (Task 333)');
    });
});

// ============================================================
// 9. Инициализация и интеграция
// ============================================================
describe('Task 323 — интеграция', () => {
    test('JS: init вешает синхронизацию скролла', () => {
        const txt = methodText(WS_CLIENT, 'init');
        assertTrue(txt.indexOf('this._attachTotalsSync();') !== -1,
            'слушатели скролла вешаются при старте');
    });

    test('JS: рендер сетки ведёт к пересчёту и синхронизации (fitGrid)', () => {
        const rg = methodText(WS_CLIENT, '_renderGrid');
        assertTrue(rg.indexOf('this._fitGrid();') !== -1, 'сетка подгоняется');
        assertTrue(rg.indexOf('this._renderTotalsIfOpen();') !== -1,
            'итоги перерисовываются вместе с сеткой');
    });

    test('JS: оба рендера итогов завершаются var+fit+sync', () => {
        const m = methodText(WS_CLIENT, '_renderTotalsMonth');
        assertTrue(m.indexOf('if (this._applyTtHeadVar()) this._fitGrid();') !== -1,
            'месяц: изменилась высота зоны — пересчёт');
        assertTrue(m.indexOf('this._syncTotalsRows();') !== -1, 'месяц: синхронизация');
        const y = methodText(WS_CLIENT, '_renderTotalsYearTable');
        assertTrue(y.indexOf('if (this._applyTtHeadVar()) this._fitGrid();') !== -1,
            'год: пересчёт при изменении зоны');
        assertTrue(y.indexOf('this._syncTotalsRows();') !== -1, 'год: синхронизация');
    });

    test('JS: бочка с таймером чистится при повторном открытии', () => {
        const txt = methodText(WS_CLIENT, 'toggleTotals');
        assertTrue(txt.indexOf('clearTimeout(this._ttWideTimer)') !== -1,
            'таймер уборки сбрасывается при новом открытии');
    });
});

// ============================================================
// 10. SW: версия кэша
// ============================================================
describe('Task 323 — SW: версия кэша', () => {
    test('SW: кэш поднят до kipia-test-v731 (Task 323)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v731'") !== -1,
            'CACHE_VERSION = kipia-test-v731');
        assertFalse(SW_SRC.indexOf('kipia-test-v732') !== -1,
            'v566 не существует (один инкремент на Task 326)');
    });
});
