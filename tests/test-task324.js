// tests/test-task324.js
// Task 324 — по заявке пользователя: «нужно отредактировать кнопки,
// кнопки "Сформировать", "Сохранить (N)", "Отменить" расположить
// в нижней части бара в один ряд. Вертикальный бар-ручку справа
// убрать в виде кнопки "Итоги учёта" в бар с кнопками во вторую
// строку кнопок. Кнопки "Месяц" и "Год" итогов учёта разместить
// справа от кнопки "Итоги учёта", пояснительный текст в шапке
// шторки итогов "сентябрь 2026 г. · норма: 22 раб. дн · 176 ч
// (40-час) · включая несохранённые правки (N)" убрать. Текст
// оглавлений в шапке шторки итогов разместить в одни строки.
// Так же сделать нижнюю горизонтальную полосу прокрутки в шторке
// итогов учёта».
// Task 325 (актуализация): «кнопки “Сформировать”, “Сохранить
// (N)”, “Отменить” разместить в ТРЕТЬЕЙ строке ПОД кнопками
// “Итоги учёта”, “Месяц” и “Год” (ряд 2 — итоги, ряд 3 —
// действия); ✕ в шапке шторки УБРАТЬ (закрытие — только кнопкой
// тулбара); в таблице итогов — ТОНКИЕ ВЕРТИКАЛЬНЫЕ ЛИНИИ
// разделения ячеек».
//
// ЧТО ПРОВЕРЯЕТСЯ (после Task 325):
//   HTML: ряд 2 #wsTotalsRow — «Итоги учёта» → «Месяц» → «Год»
//   (кнопка — aria-pressed переключатель); ряд 3 #wsActionsRow —
//   «Сформировать» → «Сохранить» → «Отменить» (заявка: действия —
//   третьей строкой ПОД итогами); разделитель .ws-tb-sep удалён;
//   вертикальный бар-ручка (wsTotalsBar/wsTotalsChev) удалён;
//   шапка шторки .ws-tt-head = ⚠ + «Обновить» (✕ удалён, Task 325);
//   инфо-строка #wsTtInfo удалена.
//   CSS: кнопка .ws-totals-btn (+ aria-pressed синяя, светлая
//   тема); .ws-tb-sep УДАЛЁН; ТРИ ряда × calc((95px − 6px)/3);
//   шторка свёрнута margin-right: -50% (десктоп) / translateX(100%)
//   (мобайл); .ws-tt-head[hidden] { display: none } (пустая шапка
//   прячется, Task 325); .ws-tt-warn; вкладки .ws-tt-tab в тулбаре
//   (рост 34px/100%); полоса прокрутки ВНИЗУ ШТОРКИ видимая (webkit
//   height 12px, Firefox thin); оглавления th — white-space:
//   nowrap (одной строкой); ТОНКИЕ ВЕРТИКАЛЬНЫЕ ЛИНИИ ячеек —
//   border-right у th/td, последняя колонка — без линии, светлая
//   тема (Task 325).
//   VM: toggleTotals — кнопка aria-pressed, без шеврона;
//   setTotalsTab — открывает ЗАКРЫТУЮ шторку; _updateSaveBtn —
//   ряд НЕ скрывается; init — только genBtn; _setTtWarn (пусто →
//   скрыта, текст → показана + title); рендеры без инфо-строки;
//   _applyTtHeadVar — зона = .ws-tt-head + thead, ПЕРЕД замером
//   актуализирует вид шапки (_updateTtHead, Task 325);
//   _updateTtHead — сжимает пустую шапку до 16px-филлера (⚠ и
//   «Обновить» скрыты — выравнивание строк сохраняется).
//   SW: kipia-test-v732.
//
// Запуск: через tests/run-all.js (require './test-task324.js').

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
// 1. HTML: ряды 2/3 кнопок тулбара (Task 325)
// ============================================================
describe('Task 324→325 — HTML: ряды кнопок итогов и действий', () => {

    const ws = INDEX_SRC.slice(INDEX_SRC.indexOf('id="page-work-schedule"'),
                                INDEX_SRC.indexOf('id="wsGridWrap"'));

    test('HTML: #wsActionsRow — «Сформировать»/«Сохранить»/«Отменить» В ОДНОМ ряду (ряд 3)', () => {
        const iTot = ws.indexOf('id="wsTotalsRow"');
        const iRow = ws.indexOf('id="wsActionsRow"');
        const iGen = ws.indexOf('id="wsGenerateBtn"');
        const iSave = ws.indexOf('id="wsSaveBtn"');
        const iCancel = ws.indexOf('id="wsCancelBtn"');
        assertTrue(iRow !== -1, 'ряд действий есть (Task 325)');
        assertTrue(iGen !== -1 && iSave !== -1 && iCancel !== -1, 'все три кнопки есть');
        assertTrue(iRow < iGen && iGen < iSave && iSave < iCancel,
            'ПОРЯДОК заявки: Сформировать → Сохранить → Отменить — один ряд');
        assertTrue(iTot !== -1 && iTot < iRow,
            'ряд 3 — ПОД рядом 2 итогов (заявка Task 325)');
        const row = ws.slice(iRow - 220, iRow + 400);
        assertTrue(row.indexOf('class="ws-toolbar-row ws-actions-row"') !== -1,
            'ряд — класс .ws-toolbar-row .ws-actions-row');
        assertFalse(row.indexOf('class="ws-tb-sep"') !== -1,
            'разделителя-ЭЛЕМЕНТА в ряду НЕТ (блоки в разных рядах, Task 325)');
        // «Сохранить» — текст «(N)» ставит JS (_updateSaveBtn)
        const m = methodText(WS_CLIENT, '_updateSaveBtn');
        assertTrue(m.indexOf("'Сохранить (' + n + ')'") !== -1,
            'текст «Сохранить (N)» со счётчиком правок');
    });

    test('HTML: кнопка «Итоги учёта» — в ряду 2, переключатель', () => {
        const iTot = ws.indexOf('id="wsTotalsRow"');
        const iBtn = ws.indexOf('id="wsTotalsBtn"');
        assertTrue(iBtn !== -1, 'кнопка есть');
        assertTrue(iTot !== -1 && iTot < iBtn, 'кнопка — в ряду 2 итогов');
        const chunk = ws.slice(iBtn, iBtn + 500);
        assertTrue(chunk.indexOf('WorkSchedule.toggleTotals()') !== -1, 'клик — toggleTotals');
        assertTrue(chunk.indexOf('aria-pressed="false"') !== -1,
            'начальное состояние — переключатель (aria-pressed)');
        assertTrue(chunk.indexOf('Итоги учёта') !== -1, 'подпись кнопки');
        assertTrue(chunk.indexOf('ws-totals-btn') !== -1, 'класс ws-totals-btn');
    });

    test('HTML: «Месяц»/«Год» — СПРАВА от «Итоги учёта», в том же ряду 2', () => {
        const iBtn = ws.indexOf('id="wsTotalsBtn"');
        const iM = ws.indexOf('id="wsTtTabMonth"');
        const iY = ws.indexOf('id="wsTtTabYear"');
        const iTot = ws.indexOf('id="wsTotalsRow"');
        const iAct = ws.indexOf('id="wsActionsRow"');
        assertTrue(iBtn !== -1 && iM !== -1 && iY !== -1, 'кнопка и вкладки есть');
        assertTrue(iBtn < iM && iM < iY, 'вкладки СПРАВА от «Итоги учёта» (заявка)');
        assertTrue(iTot < iM && iM < iAct, 'вкладки — В РЯДУ 2, до ряда 3 действий');
        const chunk = ws.slice(iM, iY + 300);
        assertTrue(chunk.indexOf("WorkSchedule.setTotalsTab('month')") !== -1, 'клик Месяц');
        assertTrue(chunk.indexOf("WorkSchedule.setTotalsTab('year')") !== -1, 'клик Год');
        assertFalse(INDEX_SRC.indexOf('class="ws-tb-sep"') !== -1,
            'разделитель .ws-tb-sep УДАЛЁН (Task 325)');
    });

    test('HTML: ряды тулбара и вертикальная ручка', () => {
        assertTrue(INDEX_SRC.indexOf('id="wsActionsRow"') !== -1,
            'ряд 3 действий ЕСТЬ (Task 325: действия — третьей строкой)');
        assertFalse(INDEX_SRC.indexOf('id="wsGenerateRow"') !== -1,
            'ряд генерации (.ws-generate-row) удалён');
        assertFalse(INDEX_SRC.indexOf('id="wsTotalsBar"') !== -1,
            'вертикальный бар-ручка удалён (заявка)');
        assertFalse(INDEX_SRC.indexOf('id="wsTotalsChev"') !== -1,
            'шеврон ручки удалён');
        assertFalse(INDEX_SRC.indexOf('ws-totals-vbar') !== -1,
            'класс вертикальной ручки удалён');
    });

    test('HTML: шапка шторки — только ⚠, БЕЗ ✕/инфо/«Обновить» (Task 324 → 332)', () => {
        const iPanel = INDEX_SRC.indexOf('id="wsTotalsPanel"');
        const chunk = INDEX_SRC.slice(iPanel, iPanel + 3200);
        assertTrue(chunk.indexOf('class="ws-tt-head"') !== -1, 'шапка .ws-tt-head');
        assertFalse(chunk.indexOf('id="wsTtClose"') !== -1,
            'кнопка ✕ УДАЛЕНА (заявка Task 325)');
        assertTrue(chunk.indexOf('id="wsTtWarn"') !== -1, 'аварийная строка ⚠');
        // Task 332 (заявка): кнопка «Обновить» из шапки УДАЛЕНА —
        // годовые данные обновляет кнопка «Обновить» тулбара
        assertFalse(chunk.indexOf('id="wsTtRefresh"') !== -1,
            'кнопка «Обновить» шапки удалена (Task 332)');
        assertFalse(chunk.indexOf('id="wsTtInfo"') !== -1,
            'пояснительный текст шапки УДАЛЁН (заявка)');
        assertFalse(chunk.indexOf('ws-tt-tabs') !== -1,
            'строка вкладок из шапки удалена (вкладки — в тулбаре)');
        assertFalse(chunk.indexOf('id="wsTtTabMonth"') !== -1,
            'вкладок в шапке шторки нет');
        // Task 327 → 329 (заявка): кнопка «Ещё» из шапки УДАЛЕНА —
        // функционал на значке-ШЕВРОНЕ левого края шторки (#wsTtChv,
        // Task 329), ДО панели (сестринский элемент)
        assertFalse(chunk.indexOf('id="wsTtMore"') !== -1,
            'кнопка «Ещё» из шапки удалена (Task 329)');
        const iDrawer = INDEX_SRC.indexOf('id="wsTotalsDrawer"');
        const dChunk = INDEX_SRC.slice(iDrawer, iDrawer + 3200);
        assertTrue(dChunk.indexOf('id="wsTtChv"') !== -1,
            'значок-шеврон #wsTtChv на левом краю (Task 329)');
        assertTrue(dChunk.indexOf('toggleTotalsExtra()') !== -1,
            'шеврон несёт функционал «Ещё» (toggleTotalsExtra)');
        assertTrue(dChunk.indexOf('ws-tt-edge') !== -1,
            'декоративный бортик .ws-tt-edge левого края (Task 329)');
        assertTrue(dChunk.indexOf('ws-tt-chv') !== -1,
            'класс кнопки-шеврона .ws-tt-chv');
        // Task 327 (заявка): бордюрчик внизу шторки
        assertTrue(chunk.indexOf('ws-tt-foot') !== -1,
            'бордюрчик .ws-tt-foot после тела (Task 327)');
    });
});

// ============================================================
// 2. CSS: кнопка, разделитель, два ряда, шторка, полоса прокрутки
// ============================================================
describe('Task 324 — CSS: кнопки и геометрия', () => {

    test('CSS: .ws-totals-btn — стиль + «нажатое» состояние', () => {
        const m = INDEX_SRC.match(/\.ws-totals-btn\s*\{[^}]*\}/);
        assertTrue(!!m, 'правило кнопки');
        assertTrue(m[0].indexOf('cursor: pointer') !== -1, 'курсор-палец');
        assertTrue(m[0].indexOf('font-weight: 600') !== -1, 'кнопка-действие');
        assertTrue(/\.ws-totals-btn\[aria-pressed="true"\]\s*\{[^}]*rgba\(74,\s*143,\s*199,\s*0\.32\)/.test(INDEX_SRC),
            'aria-pressed=true — синяя заливка');
        assertTrue(/\[data-theme="light"\] \.ws-totals-btn\s*\{[^}]*rgba\(240,\s*240,\s*240,\s*0\.95\)/.test(INDEX_SRC),
            'светлая тема кнопки');
    });

    test('CSS: .ws-tb-sep — разделитель УДАЛЁН (Task 325)', () => {
        assertFalse(/\.ws-tb-sep\s*\{/.test(INDEX_SRC),
            'правило разделителя удалено (блоки в разных рядах)');
        assertFalse(/\.ws-bottom-row \.ws-tb-sep/.test(INDEX_SRC),
            'десктопное правило разделителя удалено');
        assertFalse(INDEX_SRC.indexOf('class="ws-tb-sep"') !== -1,
            'сам элемент .ws-tb-sep из разметки удалён');
    });

    test('CSS: ТРИ ряда колонки кнопок — calc((95px − 6px)/3) (Task 325)', () => {
        assertTrue(/\.ws-toolbar-main\s*\{[^}]*height:\s*95px/.test(INDEX_SRC),
            'колонка — ровно высота окон (95px, как Task 317)');
        const m = INDEX_SRC.match(/@media \(min-width: 1024px\)\s*\{[\s\S]*?\.ws-toolbar-row\s*\{[^}]*calc\(\(95px - 6px\) \/ 3\)[^}]*\}/);
        assertTrue(!!m, 'ряд = (95 − 6px)/3 — ТРИ ряда, два зазора 3px');
        assertFalse(INDEX_SRC.indexOf('calc((95px - 3px) / 2)') !== -1,
            'формула двух рядов удалена');
    });

    test('CSS: вкладки «Месяц»/«Год» — общий рост кнопок тулбара', () => {
        const m = INDEX_SRC.match(/\.ws-month-sel, \.ws-year-sel, \.ws-generate-btn, \.ws-save-btn,\n\s*\.ws-refresh-btn, \.ws-totals-btn, \.ws-tt-tab\s*\{[^}]*height:\s*32px/);
        assertTrue(!!m, 'единая высота 32px с вкладками итогов (Task 328 — кнопки меньше)');
        const d = INDEX_SRC.match(/@media \(min-width: 1024px\)\s*\{[\s\S]*?\.ws-month-sel[^}]*height:\s*100%/);
        assertTrue(!!d, 'десктоп: во всю высоту ряда');
    });

    test('CSS: шторка свёрнута — ПОЛНОСТЬЮ за краем (ручки нет)', () => {
        const d = INDEX_SRC.match(/@media \(min-width: 1024px\)\s*\{[\s\S]*?\.ws-tt-drawer\s*\{[^}]*\}/);
        assertTrue(!!d && d[0].indexOf('margin-right: -50%') !== -1,
            'десктоп: margin-right: -50% — торчать нечему');
        assertFalse(INDEX_SRC.indexOf('calc(-50% + 28px)') !== -1,
            'выступ 28px под бар-ручку удалён');
        const m = INDEX_SRC.match(/\.ws-tt-drawer\s*\{[^}]*position:\s*fixed[^}]*\}/);
        assertTrue(!!m && m[0].indexOf('transform: translateX(100%)') !== -1,
            'мобайл: свёрнута — за экраном');
        const w = INDEX_SRC.match(/\.ws-tt-close\s*\{[^}]*width:\s*44px/);
        assertFalse(!!w, 'правила ✕ 44px больше нет (Task 325: ✕ удалён)');
    });

    test('CSS: шапка шторки — [hidden] при пустоте / .ws-tt-warn (Task 325 → 331)', () => {
        const head = INDEX_SRC.match(/\.ws-tt-head\s*\{[^}]*min-height:\s*28px[^}]*\}/);
        assertTrue(!!head, 'компактная шапка (28px)');
        // Task 331 (заявка: «высота шапки столбцов шторки — по высоте
        // шапки сетки»): ПУСТАЯ шапка ПРЯЧЕТСЯ ЦЕЛИКОМ — 16px-филлер
        // ws-tt-head-empty УДАЛЁН; шапка таблицы итогов (38px) занимает
        // всю зону шапки сетки
        assertFalse(/\.ws-tt-head\.ws-tt-head-empty/.test(INDEX_SRC),
            '16px-филлер удалён (Task 331)');
        assertTrue(/\.ws-tt-head\[hidden\]\s*\{\s*display:\s*none/.test(INDEX_SRC),
            'пустая шапка скрыта целиком ([hidden], Task 331)');
        assertFalse(/\.ws-tt-close\s*\{/.test(INDEX_SRC),
            'правило .ws-tt-close удалено (✕ удалён по заявке)');
        const warn = INDEX_SRC.match(/\.ws-tt-warn\s*\{[^}]*\}/);
        assertTrue(!!warn && warn[0].indexOf('#e0a23c') !== -1,
            '⚠ — янтарная (аварийная)');
        assertTrue(INDEX_SRC.indexOf('.ws-tt-warn[hidden] { display: none; }') !== -1,
            'пустая ⚠ скрыта');
    });

    test('CSS: ТОНКИЕ ВЕРТИКАЛЬНЫЕ ЛИНИИ ячеек таблицы итогов (Task 325)', () => {
        const m = INDEX_SRC.match(/\.ws-tt-table th,\n\s*\.ws-tt-table td\s*\{[^}]*\}/);
        assertTrue(!!m, 'правило th/td таблицы итогов');
        assertTrue(!!m && m[0].indexOf('border-right: 1px solid') !== -1,
            'тонкая вертикальная линия между ячейками');
        assertTrue(!!m && m[0].indexOf('border-bottom: 1px solid') !== -1,
            'горизонтальные линии — как прежде');
        const last = INDEX_SRC.match(/\.ws-tt-table th:last-child,\n\s*\.ws-tt-table td:last-child\s*\{[^}]*\}/);
        assertTrue(!!last && last[0].indexOf('border-right: none') !== -1,
            'последняя колонка — без линии (таблица не обводится справа)');
        const light = INDEX_SRC.match(/\[data-theme="light"\] \.ws-tt-table th,\n\s*\[data-theme="light"\] \.ws-tt-table td\s*\{[^}]*\}/);
        assertTrue(!!light && light[0].indexOf('border-right-color') !== -1,
            'светлая тема — вертикальные линии тоже');
    });

    test('CSS: Task 331 — БЕЗ полос прокрутки в шторке, ползунок ПОД бордюром', () => {
        // Task 331 (заявка: «не должно быть полосок вертикальной
        // прокрутки в шторке»; «полоску горизонтальной прокрутки
        // сделай ПОД нижним бордюром, как под шахматкой табеля»):
        // ВСЕ нативные полосы тела скрыты (Firefox thin рисовал
        // вертикальную и, съедая ширину, горизонтальную);
        // горизонтальная прокрутка — КАСТОМНЫЙ #wsTtHbar ПОД .ws-tt-foot
        const b = INDEX_SRC.match(/\.ws-tt-body\s*\{[^}]*\}/);
        assertTrue(!!b && b[0].indexOf('scrollbar-width: none') !== -1,
            'Firefox: все нативные полосы скрыты (Task 331)');
        assertFalse(!!b && b[0].indexOf('scrollbar-color') !== -1,
            'нативная раскраска полос удалена (Task 331)');
        const sb = INDEX_SRC.match(/\.ws-tt-body::-webkit-scrollbar\s*\{[^}]*\}/);
        assertTrue(!!sb && sb[0].indexOf('display: none') !== -1,
            'webkit: все нативные полосы скрыты (Task 331)');
        assertFalse(/\.ws-tt-body::-webkit-scrollbar-thumb/.test(INDEX_SRC),
            'нативный бегунок шторки удалён (Task 331)');
        assertTrue(/id="wsTtHbar" aria-hidden="true"><div class="ws-hbar-thumb"/.test(INDEX_SRC),
            'кастомный ползунок #wsTtHbar ПОД .ws-tt-foot');
        const footPos = INDEX_SRC.match(/<div class="ws-tt-foot" aria-hidden="true"><\/div>\n\s*<div class="ws-tt-hbar" id="wsTtHbar"/);
        assertTrue(!!footPos,
            'ползунок стоит СТРОГО ПОСЛЕ бордюрчика .ws-tt-foot');
    });

    test('CSS: оглавления — ПЕРЕНОС на 2 строки при необходимости (Task 327)', () => {
        // Task 327 (заявка: «текст заголовков сделай в две строки
        // для компактности, при необходимости») — свёрнуто правило
        // Task 324 «одной строкой»: узкие равные столбцы требуют
        // переноса; у года месяцы — по-прежнему одной строкой
        const th = INDEX_SRC.match(/\.ws-tt-table th\s*\{[^}]*\}/);
        assertTrue(!!th && th[0].indexOf('white-space: normal') !== -1,
            'слова шапки переносятся (заявка Task 327)');
        assertTrue(th[0].indexOf('overflow-wrap: break-word') !== -1,
            'разрыв длинных слов шапки');
        const thY = INDEX_SRC.match(/\.ws-tt-table\.ws-tt-year th\s*\{[^}]*\}/);
        assertTrue(!!thY && thY[0].indexOf('white-space: nowrap') !== -1,
            'год: заголовки-месяцы одной строкой');
    });
});

// ============================================================
// 3. VM: toggleTotals / setTotalsTab / _updateSaveBtn / init
// ============================================================
describe('Task 324 — VM: переключатели', () => {

    function makeToggleHost() {
        const calls = { render: 0, fit: 0, sync: 0 };
        const btn = { attrs: {}, setAttribute: function(k, v) { this.attrs[k] = v; } };
        const panel = { hidden: true };
        const page = {
            classList: {
                state: {},
                toggle: function(c, o) { this.state[c] = o; },
                add: function() { for (var i = 0; i < arguments.length; i++) this.state[arguments[i]] = true; },
                remove: function() { for (var i = 0; i < arguments.length; i++) this.state[arguments[i]] = false; },
                contains: function(c) { return !!this.state[c]; }
            },
            style: { props: {}, setProperty: function(k, v) { this.props[k] = v; },
                     getPropertyValue: function(k) { return this.props[k] || ''; },
                     removeProperty: function(k) { delete this.props[k]; } }
        };
        // Task 327: новые шаги toggleTotals/setTotalsTab — вкладки
        // появляются при открытии (_updateTtTabsVisible) и «Ещё»
        const host = wsHost(['toggleTotals', 'setTotalsTab', '_ttCloseCleanup',
                             '_updateTtTabsVisible', '_updateTtChv'],
            { _totalsOpen: false, _totalsTab: 'month', _totalsExtra: false },
            mockDoc({ wsTotalsBtn: btn, wsTotalsPanel: panel,
                      'page-work-schedule': page,
                      wsTtTabMonth: { hidden: true, classList: { state: {}, toggle: function(c, o) { this.state[c] = o; } } },
                      wsTtTabYear: { hidden: true, classList: { state: {}, toggle: function(c, o) { this.state[c] = o; } } },
                      wsTtChv: { hidden: true, attrs: {}, setAttribute: function(k, v) { this.attrs[k] = v; }, classList: { state: {}, toggle: function(c, o) { this.state[c] = o; } } },
                      wsTtRefresh: { hidden: false } }));
        host._renderTotals = function() { calls.render++; };
        host._fitGrid = function() { calls.fit++; };
        host._applyTtHeadVar = function() { return false; };
        host._syncTotalsRows = function() { calls.sync++; };
        return { host: host, btn: btn, panel: panel, page: page, calls: calls };
    }

    test('toggleTotals: кнопка тулбара aria-pressed, БЕЗ шеврона', () => {
        const t = makeToggleHost();
        t.host.toggleTotals();
        assertEqual(t.btn.attrs['aria-pressed'], 'true', 'открыта — кнопка нажата');
        assertEqual(t.panel.hidden, false, 'панель показана');
        assertEqual(t.page.classList.state['ws-tt-open'], true, 'ws-tt-open');
        assertEqual(t.calls.render, 1, 'итоги отрисованы');
        t.host.toggleTotals();
        assertEqual(t.btn.attrs['aria-pressed'], 'false', 'закрыта — кнопка отпущена');
        // шеврона в методе нет вообще (ручка удалена)
        const txt = methodText(WS_CLIENT, 'toggleTotals');
        assertFalse(txt.indexOf('wsTotalsChev') !== -1, 'шеврон не упоминается');
        assertFalse(txt.indexOf('chev') !== -1, 'переменной шеврона нет');
        assertTrue(txt.indexOf("getElementById('wsTotalsBtn')") !== -1,
            'управляется КНОПКА тулбара');
        assertFalse(txt.indexOf('aria-expanded') !== -1,
            'прежний aria-expanded ручки не пишется');
    });

    test('setTotalsTab: клик по вкладке ЗАКРЫТОЙ шторки — открывает её', () => {
        const t = makeToggleHost();
        assertEqual(t.host._totalsOpen, false, 'шторка закрыта');
        t.host.setTotalsTab('year');
        assertEqual(t.host._totalsTab, 'year', 'вкладка = год');
        assertEqual(t.host._totalsOpen, true, 'шторка ОТКРЫТА кликом вкладки');
        assertEqual(t.page.classList.state['ws-tt-open'], true, 'класс открытой шторки');
        assertEqual(t.calls.render, 1, 'итоги отрисованы (через toggleTotals)');
    });

    test('setTotalsTab: открытая шторка — просто перерисовка', () => {
        const t = makeToggleHost();
        t.host._totalsOpen = true;
        t.host.setTotalsTab('month');
        assertEqual(t.calls.render, 1, 'один рендер, без повторного toggle');
        assertEqual(t.host._totalsOpen, true, 'осталась открытой');
    });

    test('_updateSaveBtn: ряд НЕ скрывается — только кнопки', () => {
        const m = methodText(WS_CLIENT, '_updateSaveBtn');
        assertTrue(m.indexOf("btn.hidden = !show;") !== -1, '«Сохранить» — по правкам');
        assertTrue(m.indexOf("cancelBtn.hidden = !show;") !== -1, '«Отменить» — по правкам');
        assertFalse(m.indexOf('row.hidden') !== -1,
            'скрытия РЯДА нет — в нижнем ряду всегда кнопки итогов (заявка)');
        // VM: ряд и не ищется
        const btn = { hidden: false, textContent: '' };
        const cancel = { hidden: false };
        const host = wsHost(['_updateSaveBtn'], { _canEdit: true, _PENDING: {} },
            mockDoc({ wsSaveBtn: btn, wsCancelBtn: cancel }));
        host._updateSaveBtn();
        assertEqual(btn.hidden, true, 'без правок «Сохранить» скрыта');
        assertEqual(cancel.hidden, true, 'без правок «Отменить» скрыта');
        host._PENDING = { a: 1 };
        host._updateSaveBtn();
        assertEqual(btn.hidden, false, 'с правками — видна');
        assertEqual(btn.textContent, 'Сохранить (1)', 'текст «Сохранить (N)»');
    });

    test('init: «Сформировать» — по праву записи, рядов не трогает', () => {
        const init = INDEX_SRC.slice(INDEX_SRC.indexOf('init: function'),
                                     INDEX_SRC.indexOf('_refreshFromUrlState: function'));
        assertTrue(init.indexOf('genBtn.hidden = !this._canEdit;') !== -1,
            'кнопка — по праву записи');
        assertFalse(init.indexOf('wsGenerateRow') !== -1, 'ряда генерации нет');
        assertFalse(init.indexOf('wsActionsRow') !== -1, 'ряда действий нет');
    });

    test('JS: закрытие — ТОЛЬКО кнопка тулбара (✕ удалён, Task 325)', () => {
        assertFalse(INDEX_SRC.indexOf('id="wsTtClose"') !== -1,
            '✕ шапки шторки УДАЛЁН (заявка Task 325)');
        const iBtn = INDEX_SRC.indexOf('id="wsTotalsBtn"');
        const bChunk = INDEX_SRC.slice(iBtn, iBtn + 300);
        assertTrue(bChunk.indexOf('WorkSchedule.toggleTotals()') !== -1,
            'кнопка тулбара вызывает toggleTotals — единственный переключатель');
    });

    test('_updateTtHead: пустая шапка — ПРЯЧЕТСЯ ЦЕЛИКОМ (Task 325 → 331 → 332)', () => {
        const head = { hidden: false };
        const warn = { hidden: true };
        const panel = { querySelector: function(sel) {
            return sel === '.ws-tt-head' ? head : null;
        } };
        const host = wsHost(['_updateTtHead'], {},
            mockDoc({ wsTotalsPanel: panel, wsTtWarn: warn }));
        host._updateTtHead();
        assertEqual(head.hidden, true,
            '⚠ скрыт — шапка ПРЯЧЕТСЯ ([hidden] → display:none; Task 332: кнопки «Обновить» больше нет)');
        warn.hidden = false;  // сбой года — ⚠ виден
        host._updateTtHead();
        assertEqual(head.hidden, false,
            'есть ⚠ — шапка обычная');
        const m = methodText(WS_CLIENT, '_updateTtHead');
        assertFalse(m.indexOf('wsTtRefresh') !== -1,
            'Task 332: кнопка «Обновить» из логики шапки удалена');
        const mv = methodText(WS_CLIENT, '_applyTtHeadVar');
        assertTrue(mv.indexOf('this._updateTtHead();') !== -1,
            '_applyTtHeadVar актуализирует шапку ДО замера высоты');
    });
});

// ============================================================
// 4. VM: _setTtWarn + рендеры без инфо-строки
// ============================================================
describe('Task 324 — VM: ⚠ шапки и рендеры', () => {

    test('_setTtWarn: пусто — скрыта; текст — показана + title', () => {
        const el = { textContent: '', hidden: false, attrs: {},
                     setAttribute: function(k, v) { this.attrs[k] = v; } };
        const host = wsHost(['_setTtWarn'], {}, mockDoc({ wsTtWarn: el }));
        host._setTtWarn('');
        assertEqual(el.hidden, true, 'пустая ⚠ скрыта');
        assertEqual(el.textContent, '', 'текст пуст');
        host._setTtWarn('⚠ не загружено месяцев: 2 — нажмите «Обновить»');
        assertEqual(el.hidden, false, '⚠ показана');
        assertEqual(el.textContent.indexOf('не загружено месяцев: 2') !== -1, true,
            'текст предупреждения');
        assertEqual(el.attrs['title'], el.textContent, 'полный текст — в тултипе');
        host._setTtWarn();
        assertEqual(el.hidden, true, 'undefined — тоже скрыта');
    });

    test('_renderTotalsMonth: инфо НЕ пишется, ⚠ гасится', () => {
        const els = { wsTtBody: { innerHTML: '', querySelector: function() { return null; } },
                      wsTtWarn: { textContent: 'старое ⚠', hidden: false, attrs: {},
                                  setAttribute: function(k, v) { this.attrs[k] = v; } } };
        const host = wsHost(['_codeHours', '_totalsZero', '_totalsAgg', '_statusMeta',
                             '_empTypeMap', '_overHours', '_totalsEffectiveEntries',
                             '_fmtTotalsNum', '_esc', '_setTtWarn', '_renderTotalsMonth'], {
            _year: 2026, _month: 9,
            _applyTtHeadVar: function() { return false; },
            _fitGrid: function() {},
            _syncTotalsRows: function() {},
            _EMPLOYEES: [ { 'таб_номер': '0871', 'ФИО': 'Иванов И.И.' } ],
            _ENTRIES: [ { 'дата': '2026-09-01', 'таб_номер': '0871', 'статус': 'Д' } ],
            _PENDING: {},
            _STATUS_CODES: [ { code: 'Д', name: 'День (12-час)' } ]
        }, mockDoc(els));
        host._renderTotalsMonth();
        assertEqual(els.wsTtWarn.hidden, true, '⚠ погашена на месяце');
        assertEqual(els.wsTtWarn.textContent, '', 'текст очищен');
        const m = methodText(WS_CLIENT, '_renderTotalsMonth');
        assertFalse(m.indexOf('wsTtInfo') !== -1, 'инфо-строка не пишется');
        assertFalse(m.indexOf('normа') !== -1 && m.indexOf('норма: ') !== -1,
            'норма календаря в шапку не пишется');
        assertFalse(m.indexOf('несохранённые правки') !== -1,
            'пометка о правках в шапку не пишется');
        assertTrue(m.indexOf("this._setTtWarn('');") !== -1, 'рендер гасит ⚠');
    });

    test('_renderTotalsYearTable: сбои года — ⚠ в шапке, не инфо', () => {
        const els = { wsTtBody: { innerHTML: '', querySelector: function() { return null; } },
                      wsTtWarn: { textContent: '', hidden: true, attrs: {},
                                  setAttribute: function(k, v) { this.attrs[k] = v; } } };
        const md = {
            year: 2026, ts: Date.now(), failed: 3,
            months: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [],
                      9: [], 10: [], 11: [], 12: [] },
            employees: []
        };
        const host = wsHost(['_codeHours', '_totalsZero', '_totalsAgg', '_statusMeta',
                             '_empTypeMap', '_overHours', '_fmtTotalsNum', '_esc',
                             '_sortEmployees', '_setTtWarn', '_renderTotalsYearTable'], {
            _year: 2026, _month: 9,
            _applyTtHeadVar: function() { return false; },
            _fitGrid: function() {},
            _syncTotalsRows: function() {},
            _EMPLOYEES: [ { 'таб_номер': '0871', 'ФИО': 'Иванов И.И.' } ],
            _STATUS_CODES: [],
            _YEAR_DATA: md
        }, mockDoc(els));
        host._renderTotalsYearTable();
        assertEqual(els.wsTtWarn.hidden, false, '⚠ показана при сбоях');
        assertTrue(els.wsTtWarn.textContent.indexOf('не загружено месяцев: 3') !== -1,
            'счётчик сбойных месяцев');
        assertTrue(els.wsTtWarn.textContent.indexOf('справочник не загружен') !== -1,
            'нет справочника — тоже предупреждение');
        const m = methodText(WS_CLIENT, '_renderTotalsYearTable');
        assertFalse(m.indexOf('wsTtInfo') !== -1, 'инфо-строка не пишется');
        assertFalse(m.indexOf('infoEl') !== -1, 'элемент инфо-строки не ищется');
        assertFalse(m.indexOf("var info = this._year") !== -1,
            'пояснение формата («N г. · явки/часы…») удалено (заявка)');
    });

    test('_applyTtHeadVar: зона = ШАПКА ШТОРКИ (.ws-tt-head) + thead', () => {
        const page = {
            style: { props: {}, setProperty: function(k, v) { this.props[k] = v; },
                     getPropertyValue: function(k) { return this.props[k] || ''; },
                     removeProperty: function(k) { delete this.props[k]; } }
        };
        const panel = {
            getBoundingClientRect: function() { return { height: 300 }; },
            querySelector: function(sel) {
                if (sel === '.ws-tt-head') {
                    return { getBoundingClientRect: function() { return { height: 26.5 }; } };
                }
                if (sel === '.ws-tt-table thead') {
                    return { getBoundingClientRect: function() { return { height: 31.2 }; } };
                }
                return null;
            }
        };
        const host = wsHost(['_applyTtHeadVar', '_updateTtHead'], { _totalsOpen: true },
            mockDoc({ 'page-work-schedule': page, wsTotalsPanel: panel,
                      wsTtWarn: { hidden: true }, wsTtRefresh: { hidden: false } }));
        assertEqual(host._applyTtHeadVar(), true, 'высота изменилась');
        assertEqual(page.style.props['--ws-tt-head-h'], '58px',
            'ceil(26,5 + 31,2) = 58px — шапка шторки + шапка таблицы');
        const m = methodText(WS_CLIENT, '_applyTtHeadVar');
        assertTrue(m.indexOf("querySelector('.ws-tt-head')") !== -1,
            'зона меряется по .ws-tt-head (вкладок в шапке нет)');
        assertFalse(m.indexOf('ws-tt-tabs') !== -1, 'строка вкладок не ищется');
    });
});

// ============================================================
// 5. Интеграция: _renderGrid/_fitGrid не тронуты + SW
// ============================================================
describe('Task 324 — интеграция и SW', () => {

    test('JS: _renderGrid по-прежнему обновляет итоги живьём', () => {
        const rg = methodText(WS_CLIENT, '_renderGrid');
        assertTrue(rg.indexOf('this._renderTotalsIfOpen();') !== -1,
            'правки ячеек видны в итогах сразу');
    });

    test('JS: _fitGrid — бюджет = область − шапка (Task 331)', () => {
        const fg = methodText(WS_CLIENT, '_fitGrid');
        assertTrue(fg.indexOf('var budget = avail - headH;') !== -1,
            'полоса/зона ползунка ВНЕ контейнера — не вычитаются (Task 331)');
        assertFalse(fg.indexOf('ttFootH') !== -1,
            'резерва tfoot больше нет (Task 327/331)');
        assertTrue(fg.indexOf('syncTT();') !== -1, 'строки итогов синхронизируются');
    });

    test('SW: версия кэша kipia-test-v732 (Task 324)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v732'") !== -1,
            'CACHE_VERSION = kipia-test-v732');
        assertFalse(SW_SRC.indexOf('kipia-test-v733') !== -1,
            'v566 не существует (один инкремент на Task 326)');
    });
});
