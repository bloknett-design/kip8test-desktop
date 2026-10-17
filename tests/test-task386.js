// tests/test-task386.js
// Task 386 — заявка пользователя (3 части, доработка Task 385):
//   1) «Кнопку легенда переименуй словом по проще, к примеру
//      "Обозначения"… и окно должно выезжать в сокращённом виде
//      обозначений, а при нажатии на значок с шевроном - шире и
//      с подробным наименованием кодов, а в мобильной версии
//      переход на отдельную страницу» — кнопка «Обозначения»;
//      шторка ДЕСКТОП: узкий вид 190px (коды без наименований) →
//      шеврон #wsLgChv → широкий min(400px, 45vw) (наименования +
//      пояснения, класс ws-lg-wide, анимация width); МОБАЙЛ —
//      страница #page-ws-legend (паттерн итогов Task 334), оверлей
//      удалён; ширины ЯВНЫЕ (_legendWidthPx — фикс латентного бага
//      Task 385: flex-сжатие inner до min-content ~186px);
//   2) «В шапке столбцов работников переименуй "Работник +" в
//      "Работники" и убери функцию кнопки, просто надпись, кнопка
//      теперь только в баре» — th-заголовок — надпись;
//   3) «На странице работники переименуй кнопку "+" в "Добавить
//      работника"» — текстовая кнопка создания.
//
// Запуск: через tests/run-all.js (require './test-task386.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function extractMethod(src, name) {
    const start = src.indexOf(name + ': function(');
    if (start === -1) return null;
    const braceStart = src.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    return null;
}

function methodText(src, name) {
    const m = extractMethod(src, name);
    return m ? String(m) : '';
}

function mkEl() {
    return {
        value: '', textContent: '', innerHTML: '',
        readOnly: false, hidden: false, disabled: false,
        style: {},
        classList: { add() {}, remove() {}, contains() { return false; } },
        setAttribute() {}, focus() {},
        querySelector() { return null; },
        getBoundingClientRect() { return { width: 400 }; },
        offsetWidth: 0,
    };
}

// ============================================================
// 1. HTML/CSS: кнопка, шторка двух видов, мобильная страница
// ============================================================
describe('Task 386 — HTML: «Обозначения» (кнопка/два вида/страница)', () => {

    test('HTML: кнопка «Обозначения» (ряд 2) — прежний id/onclick', () => {
        const iBtn = INDEX_SRC.indexOf('id="wsLegendBtn"');
        assertTrue(iBtn !== -1, 'кнопка #wsLegendBtn жива');
        const chunk = INDEX_SRC.slice(iBtn - 300, iBtn + 200);
        assertTrue(chunk.indexOf('WorkSchedule.toggleLegend()') !== -1,
            'onclick → toggleLegend (механика прежняя)');
        assertTrue(chunk.indexOf('>Обозначения</button>') !== -1,
            'текст «Обозначения» (Task 386: «словом попроще»)');
        assertTrue(INDEX_SRC.indexOf('>Легенда</button>') === -1,
            'текста «Легенда» на кнопке больше нет');
    });

    test('HTML: шторка — шеврон #wsLgChv на левом крае', () => {
        const iChv = INDEX_SRC.indexOf('id="wsLgChv"');
        assertTrue(iChv !== -1, 'значок-шеврон #wsLgChv существует');
        const chunk = INDEX_SRC.slice(iChv - 300, iChv + 400);
        assertTrue(chunk.indexOf('WorkSchedule.toggleLegendWide()') !== -1,
            'onclick → toggleLegendWide (разворот шире)');
        assertTrue(chunk.indexOf(' hidden') !== -1,
            'скрыт до открытия шторки');
        assertTrue(chunk.indexOf('aria-pressed="false"') !== -1,
            'aria-pressed — состояние вида (узкий)');
        assertTrue(chunk.indexOf('aria-label="Показать подробные наименования кодов"') !== -1,
            'aria-подпись: подробные наименования');
        assertTrue(chunk.indexOf('class="ws-lg-chv"') !== -1, 'класс ws-lg-chv');
        // шеврон — между бортиком и inner (позиция как у итогов)
        const iDrawer = INDEX_SRC.indexOf('id="wsLegendDrawer"');
        const iInner = INDEX_SRC.indexOf('class="ws-legend-inner"');
        assertTrue(iDrawer < iChv && iChv < iInner,
            'шеврон внутри шторки, до внутренней панели');
    });

    test('HTML: заголовок шторки — «Обозначения»', () => {
        const iHead = INDEX_SRC.indexOf('class="ws-lg-head"');
        assertTrue(iHead !== -1, 'заголовок шторки жив');
        const chunk = INDEX_SRC.slice(iHead, iHead + 200);
        assertTrue(chunk.indexOf('>Обозначения</div>') !== -1,
            'текст «Обозначения» (прежде «Сокращения в шахматке»)');
        assertTrue(INDEX_SRC.indexOf('Сокращения в шахматке') === -1,
            'старый заголовок убран');
    });

    test('CSS: inner — flex:none + 230px (Task 388: краткие обозначения)', () => {
        const iCss = INDEX_SRC.indexOf('.ws-legend-inner {');
        assertTrue(iCss !== -1, 'правило .ws-legend-inner есть');
        const chunk = INDEX_SRC.slice(iCss, iCss + 400);
        assertTrue(chunk.indexOf('flex: none') !== -1,
            'flex: none — inner НЕ сжимается flex-сжатием');
        assertTrue(chunk.indexOf('width: 230px') !== -1,
            'краткий вид — 230px (Task 388: коды + краткие обозначения)');
        assertTrue(chunk.indexOf('transition: width 0.28s ease') !== -1,
            'плавное расширение (transition width)');
    });

    test('CSS: широкий вид — min(500px, 45vw) классом ws-lg-wide (Task 387)', () => {
        const iCss = INDEX_SRC.indexOf(
            '.ws-legend-drawer.ws-lg-wide .ws-legend-inner {');
        assertTrue(iCss !== -1, 'правило широкого вида есть');
        const chunk = INDEX_SRC.slice(iCss, iCss + 300);
        assertTrue(chunk.indexOf('width: min(500px, 45vw)') !== -1,
            'широкая панель — до 500px (Task 387, было 400px)');
    });

    test('CSS: наименования/пояснения — только развёрнутый вид', () => {
        const iName = INDEX_SRC.indexOf('.ws-lg-name {');
        assertTrue(iName !== -1, 'правило .ws-lg-name есть');
        const chunk = INDEX_SRC.slice(iName, iName + 300);
        assertTrue(chunk.indexOf('display: none') !== -1,
            'по умолчанию (узкая шторка) наименования скрыты');
        assertTrue(INDEX_SRC.indexOf(
            '.ws-legend-drawer.ws-lg-wide .ws-lg-name { display: block; }') !== -1,
            'широкий вид показывает наименования');
        assertTrue(INDEX_SRC.indexOf('.ws-lg-notesec { display: none; }') !== -1,
            'блок пояснений скрыт в узком виде');
        assertTrue(INDEX_SRC.indexOf(
            '.ws-legend-drawer.ws-lg-wide .ws-lg-notesec { display: block; }') !== -1,
            'широкий вид показывает пояснения');
    });

    test('CSS: drawer — width в transition (анимация смены вида)', () => {
        const iCss = INDEX_SRC.indexOf('.ws-legend-drawer {');
        assertTrue(iCss !== -1, 'правило .ws-legend-drawer есть');
        const chunk = INDEX_SRC.slice(iCss, iCss + 400);
        assertTrue(chunk.indexOf(
            'transition: margin-right 0.28s ease, width 0.28s ease') !== -1,
            'margin (открытие) + width (узкий⇄широкий) анимируются');
    });

    test('CSS: шеврон ws-lg-chv — край, разворот на 180°', () => {
        const iCss = INDEX_SRC.indexOf('.ws-lg-chv {');
        assertTrue(iCss !== -1, 'правило .ws-lg-chv есть');
        const chunk = INDEX_SRC.slice(iCss, iCss + 600);
        assertTrue(chunk.indexOf('left: 0') !== -1 && chunk.indexOf('top: 50%') !== -1,
            'позиция — левый край, по вертикали центр (как ws-tt-chv)');
        assertTrue(chunk.indexOf('width: 11px') !== -1 && chunk.indexOf('height: 48px') !== -1,
            'габариты как у шеврона итогов (Task 331)');
        assertTrue(INDEX_SRC.indexOf(
            '.ws-lg-chv[aria-pressed="true"] svg { transform: rotate(180deg); }') !== -1,
            'развёрнутый вид доворачивает шеврон на 180°');
        assertTrue(INDEX_SRC.indexOf('.ws-lg-chv[hidden] { display: none; }') !== -1,
            'скрытый шеврон не участвует в раскладке/фокусе');
    });

    test('CSS: мобильного оверлея НЕТ — шторка гасится, страница живёт', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-legend-drawer { display: none; }') !== -1,
            'в мобильной media шторка display: none (Task 386)');
        assertTrue(INDEX_SRC.indexOf('ws-legend-open') === -1,
            'класс ws-legend-open полностью удалён (оверлей не вернулся)');
        assertTrue(INDEX_SRC.indexOf(
            '#page-work-schedule.ws-legend-open .ws-legend-drawer') === -1,
            'старое transform-правило удалено');
        assertTrue(INDEX_SRC.indexOf('.ws-lg-page-body') !== -1,
            'CSS тела мобильной страницы есть');
        assertTrue(INDEX_SRC.indexOf(
            '.ws-lg-page-body .ws-lg-name { display: block; }') !== -1,
            'страница всегда показывает наименования');
        assertTrue(INDEX_SRC.indexOf(
            '.ws-lg-page-body .ws-lg-notesec { display: block; }') !== -1,
            'страница всегда показывает пояснения');
    });

    test('HTML: мобильная страница #page-ws-legend (после «Работники»)', () => {
        const iWork = INDEX_SRC.indexOf('id="page-ws-workers"');
        const iPage = INDEX_SRC.indexOf('id="page-ws-legend"');
        assertTrue(iWork !== -1 && iPage !== -1 && iWork < iPage,
            'страница «Обозначения» идёт после «Работники»');
        const chunk = INDEX_SRC.slice(iPage, iPage + 700);
        assertTrue(chunk.indexOf('class="page-content"') !== -1,
            'обычная страница приложения');
        assertTrue(chunk.indexOf('page-inline-header-chevron') !== -1 &&
                   chunk.indexOf('chevronTap()') !== -1,
            'шапка с многострелочным шевроном «Назад»');
        assertTrue(chunk.indexOf('>Обозначения</div>') !== -1,
            'заголовок страницы «Обозначения»');
        assertTrue(chunk.indexOf('id="wsLgPageBody"') !== -1,
            'тело контента #wsLgPageBody');
    });

    test('карты страниц: родитель/метка/доступ + хук navigateTo', () => {
        assertTrue(INDEX_SRC.indexOf("'ws-legend':                'work-schedule'") !== -1,
            'PAGE_PARENTS: дочь табеля (крошки)');
        assertTrue(INDEX_SRC.indexOf("'ws-legend':                'Обозначения'") !== -1,
            'PAGE_LABELS: «Обозначения»');
        assertTrue(INDEX_SRC.indexOf(
            "_WORK_SCHEDULE_PAGES: ['work-schedule', 'ws-totals', 'ws-workers', 'ws-legend', 'ws-talons']") !== -1,
            '_WORK_SCHEDULE_PAGES: доступ наследует табель (всем уровням)');
        const iHook = INDEX_SRC.indexOf("if (page === 'ws-legend')");
        assertTrue(iHook !== -1, 'хук navigateTo(ws-legend) есть');
        const chunk = INDEX_SRC.slice(iHook, iHook + 300);
        assertTrue(chunk.indexOf('WorkSchedule.onLegendPageOpen') !== -1,
            'хук зовёт onLegendPageOpen (паттерн ws-workers)');
    });
});

// ============================================================
// 2. HTML/CSS: шапка сетки «Работники» + кнопка «Добавить работника»
// ============================================================
describe('Task 386 — HTML: шапка «Работники» + «Добавить работника»', () => {

    test('HTML: заголовок шапки сетки — надпись «Работники»', () => {
        const i = INDEX_SRC.indexOf('class="ws-emp-head-txt"');
        assertTrue(i !== -1, 'span.ws-emp-head-txt жив (сужение Task 335)');
        const chunk = INDEX_SRC.slice(i - 160, i + 200);
        assertTrue(chunk.indexOf('data-full="Работники"') !== -1,
            'data-full «Работники» (переименован из «Работник +»)');
        assertTrue(chunk.indexOf('data-s4="Рабо"') !== -1,
            'сужение — «Рабо» (прежний span-обмен)');
        assertTrue(chunk.indexOf('onclick=') === -1,
            'у заголовка НЕТ onclick (функция кнопки снята по заявке)');
        assertTrue(chunk.indexOf('ws-emp-head-plus') === -1,
            'плюсика-индикатора нет');
    });

    test('SRC: в _renderGrid нет гейта-класса заголовка', () => {
        const grid = INDEX_SRC.slice(INDEX_SRC.indexOf('_renderGrid: function'),
                                     INDEX_SRC.indexOf('_fitGrid: function'));
        assertTrue(grid.indexOf("this._canEdit ? ' ws-emp-head-add' : ''") === -1,
            'класс ws-emp-head-add больше не вешается');
        assertTrue(grid.indexOf('WorkSchedule.openWorkersPage()"') === -1,
            'клика-перехода у заголовка нет (только кнопка в баре)');
        assertTrue(grid.indexOf('<th class="ws-emp-col">') !== -1,
            'заголовок — простой th');
    });

    test('CSS: правила кнопки-заголовка УДАЛЕНЫ', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-grid thead th.ws-emp-col.ws-emp-head-add') === -1,
            'селектор ws-emp-head-add (курсор/hover) удалён');
        assertTrue(INDEX_SRC.indexOf('.ws-emp-head-plus {') === -1,
            'правило плюсика удалено');
        assertTrue(INDEX_SRC.indexOf(
            '.ws-grid.ws-narrow thead th.ws-emp-col .ws-emp-head-plus') === -1,
            'правило скрытия плюсика в суженном виде удалено');
    });

    test('HTML: кнопка «Добавить работника» на странице «Работники»', () => {
        const iBtn = INDEX_SRC.indexOf('id="wsWorkersAddBtn"');
        assertTrue(iBtn !== -1, 'кнопка жива');
        const chunk = INDEX_SRC.slice(iBtn - 100, iBtn + 300);
        assertTrue(chunk.indexOf('>Добавить работника</button>') !== -1,
            'текст «Добавить работника» (прежде значок «+»)');
        assertTrue(chunk.indexOf('WorkSchedule.openEmployeeForm()') !== -1,
            'onclick → openEmployeeForm (шторка создания)');
        assertTrue(chunk.indexOf('aria-label="Добавить работника"') !== -1,
            'aria-подпись');
    });

    test('CSS: ws-workers-add — текстовая кнопка', () => {
        const iCss = INDEX_SRC.indexOf('.ws-workers-add {');
        assertTrue(iCss !== -1, 'правило живо');
        const chunk = INDEX_SRC.slice(iCss, iCss + 400);
        assertTrue(chunk.indexOf('height: 34px') !== -1,
            'высота — прежние 34px');
        assertTrue(chunk.indexOf('padding: 0 14px') !== -1,
            'авто-ширина с паддингами (не фиксированные 34px; Task 391 — акцентная кнопка)');
        assertTrue(chunk.indexOf('white-space: nowrap') !== -1,
            'текст без переносов');
        assertTrue(chunk.indexOf('width: 34px') === -1,
            'фиксированная ширина значка удалена');
    });

    test('SRC: пустое состояние — «Добавить работника»', () => {
        // Task 389: подсказка переозвучена — кнопка на «Общей» вкладке
        assertTrue(INDEX_SRC.indexOf(
            'Нет активных работников — добавьте первого кнопкой «Добавить работника».') !== -1,
            'подсказка озвучивает кнопку «Общей» вкладки');
        assertTrue(INDEX_SRC.indexOf(
            'Добавьте первого кнопкой «Добавить работника» в шапке страницы.') === -1,
            'старая подсказка про шапку страницы убрана (Task 389)');
        assertTrue(INDEX_SRC.indexOf('Добавьте их кнопкой «+» в шапке страницы.') === -1,
            'старая подсказка про «+» убрана');
    });
});

// ============================================================
// 3. SRC: механика двух видов + мобильная страница
// ============================================================
describe('Task 386 — SRC: механика', () => {

    test('toggleLegend — мобильная ветка: страница, не шторка', () => {
        const fn = methodText(INDEX_SRC, 'toggleLegend');
        assertTrue(fn.indexOf("!window.matchMedia('(min-width: 1024px)').matches") !== -1,
            'ветвление по matchMedia (как toggleTotals Task 334)');
        assertTrue(fn.indexOf("navigateTo('ws-legend')") !== -1,
            'мобайл → переход на страницу ws-legend');
        const iNav = fn.indexOf("navigateTo('ws-legend')");
        const iSet = fn.indexOf('this._setLegend(!this._legendOpen)');
        assertTrue(iNav !== -1 && iSet !== -1 && iNav < iSet,
            'return на мобильном — до _setLegend (шторку не трогаем)');
    });

    test('toggleLegendWide — гейт + инверсия вида', () => {
        const fn = methodText(INDEX_SRC, 'toggleLegendWide');
        assertTrue(fn.indexOf('if (!this._legendOpen) return;') !== -1,
            'гейт: работает только при открытой шторке');
        assertTrue(fn.indexOf('this._legendWide = !this._legendWide;') !== -1,
            'инверсия вида (узкий ⇄ широкий)');
        assertTrue(fn.indexOf('this._applyLegendWide();') !== -1,
            'применение через _applyLegendWide');
    });

    test('_applyLegendWide — класс/aria/слот-ширина', () => {
        const fn = methodText(INDEX_SRC, '_applyLegendWide');
        assertTrue(fn.indexOf("classList.add('ws-lg-wide')") !== -1 &&
                   fn.indexOf("classList.remove('ws-lg-wide')") !== -1,
            'класс ws-lg-wide на шторке (CSS показывает наименования)');
        assertTrue(fn.indexOf("aria-pressed") !== -1,
            'aria-pressed значка-шеврона');
        assertTrue(fn.indexOf('Только коды (свернуть наименования)') !== -1 &&
                   fn.indexOf('Показать подробные наименования кодов') !== -1,
            'aria-label меняется по направлению');
        assertTrue(fn.indexOf('drawer.style.width = this._legendWidthPx()') !== -1,
            'слот-ширина drawer — под целевую ширину вида');
        assertTrue(fn.indexOf('this._fitGrid()') !== -1,
            'сетка перегоняется под новую ширину');
    });

    test('_legendWidthPx — явные ширины (узкий 190 / широкий кап)', () => {
        const fn = methodText(INDEX_SRC, '_legendWidthPx');
        assertTrue(fn.indexOf('230') !== -1, 'краткий вид — 230px (Task 388)');
        assertTrue(fn.indexOf('Math.min(500') !== -1 && fn.indexOf('0.45') !== -1,
            'широкий — min(500px, 45vw) (согласовано с CSS; Task 387: 500px)');
        assertTrue(fn.indexOf('Math.max(230') !== -1,
            'широкий не уже 230px (Task 388)');
    });

    test('_setLegend — шеврон/вид/явная ширина', () => {
        const fn = methodText(INDEX_SRC, '_setLegend');
        assertTrue(fn.indexOf("getElementById('wsLgChv')") !== -1,
            'шеврон находится по id');
        assertTrue(fn.indexOf('chv.hidden = !open') !== -1,
            'шеврон показывается вместе со шторкой');
        assertTrue(fn.indexOf('if (open) this._applyLegendWide();') !== -1,
            'вид применяется при открытии (пережитый _legendWide)');
        assertTrue(fn.indexOf('var w = this._legendWidthPx();') !== -1,
            'ширина маржи — из _legendWidthPx (не замер inner)');
        assertTrue(fn.indexOf('.ws-legend-inner') === -1,
            'замер inner удалён (flex-сжатие больше не ловится)');
    });

    test('_legendHtml — общий контент шторки и страницы', () => {
        const fn = methodText(INDEX_SRC, '_legendHtml');
        assertTrue(fn.indexOf('return html;') !== -1, 'возвращает HTML (не пишет в DOM)');
        assertTrue(fn.indexOf('this._STATUS_CODES') !== -1 &&
                   fn.indexOf('this._EVENT_CODES') !== -1,
            'коды — из живого справочника, секции дней/мероприятий');
        assertTrue(fn.indexOf('ws-lg-notesec') !== -1,
            'пояснения — в свёртываемом блоке (Task 386)');
        // шторка и страница рендерят ОДНО И ТО ЖЕ
        const sheet = methodText(INDEX_SRC, '_renderLegendSheet');
        assertTrue(sheet.indexOf('this._legendHtml()') !== -1,
            '_renderLegendSheet → _legendHtml (тело #wsLegendBody)');
        const page = methodText(INDEX_SRC, 'onLegendPageOpen');
        assertTrue(page.indexOf('wsLgPageBody') !== -1 &&
                   page.indexOf('this._legendHtml()') !== -1,
            'onLegendPageOpen → _legendHtml (тело #wsLgPageBody)');
    });

    test('Esc закрывает шторку «Обозначения» (десктоп)', () => {
        const i = INDEX_SRC.indexOf("Task 309 → 417: попап карточки сотрудника удалён");
        assertTrue(i !== -1, 'якорь обработчика табеля найден');
        const chunk = INDEX_SRC.slice(i, i + 900);
        assertTrue(chunk.indexOf('selfOnce._legendOpen') !== -1 &&
                   chunk.indexOf('selfOnce._setLegend(false)') !== -1,
            'Esc → _setLegend(false)');
    });

    test('SW: кэш поднят до kipia-test-v750', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v750'") !== -1,
            'CACHE_VERSION = kipia-test-v750 (Task 386 — фронтенд менялся)');
        assertFalse(SW_SRC.indexOf('kipia-test-v751') !== -1,
            'v615 ещё не существует (guard)');
    });
});

// ============================================================
// 4. VM: функциональные проверки
// ============================================================
describe('Task 386 — VM: шторка/страница', () => {

    const HOST_METHODS = [
        '_setLegend', 'toggleLegend', '_renderLegendSheet',
        '_legendHtml', 'onLegendPageOpen', '_legendWidthPx',
        'toggleLegendWide', '_applyLegendWide', '_esc',
    ];

    function makeHost(desktop, vw) {
        const els = {};
        let navTo = [];
        let ttToggles = 0;
        const document = {
            getElementById: id => (els[id] || (els[id] = mkEl())),
        };
        const win = { matchMedia: () => ({ matches: !!desktop }) };
        if (vw) win.innerWidth = vw;
        const ctx = {
            document,
            window: win,
            Math, Date, String, Number, parseInt, parseFloat, isNaN, isFinite,
            Promise, setTimeout: () => 0,
        };
        vm.createContext(ctx);
        const src = HOST_METHODS.map(n => extractMethod(INDEX_SRC, n))
            .filter(Boolean).join(',\n');
        vm.runInContext(`
            var WSM = {
                _legendOpen: false, _totalsOpen: false, _legendWide: false,
                _STATUS_CODES: [
                    {code:'Д',  name:'День (12-час)',  color:'#FFE082'},
                    {code:'Н',  name:'Ночь (12-час)',  color:'#B0BEC5'},
                    {code:'ОТ', name:'Отпуск ежегодный основной', color:'#ECEFF1'},
                    {code:'И',  name:'Инструктаж',     color:'#B3E5FC'},
                ],
                _EVENT_CODES: ['И', 'ПЗ'],
                toggleTotals: function() { __ttToggles++; this._totalsOpen = false; },
                _fitGrid: function() {},
                ${src}
            };
            globalThis.__host = {
                WSM: WSM,
                els: function() { return els; },
                nav: function() { return __nav; },
                ttToggles: function() { return __ttToggles; },
            };
            var __nav = [];
            var __ttToggles = 0;
            function navigateTo(page) { __nav.push(page); }
        `, ctx, { filename: 'index.html-WS386' });
        // vars-хосты для моков (глобал VM: метод els() видит его)
        ctx.els = els;
        return ctx.__host;
    }

    test('VM: toggleLegend мобайл → страница ws-legend (шторку не трогает)', () => {
        const h = makeHost(false);   // мобайл
        h.WSM.toggleLegend();
        assertEqual(JSON.stringify(h.nav()), JSON.stringify(['ws-legend']),
            'navigateTo(ws-legend)');
        assertEqual(h.WSM._legendOpen, false,
            'флаг шторки не ставится (мобильного оверлея нет)');
        assertEqual(h.els().wsLegendDrawer, undefined,
            'шторка даже не запрашивалась (DOM не трогается)');
    });

    test('VM: toggleLegend десктоп → _setLegend (шторка)', () => {
        const h = makeHost(true);    // десктоп
        h.WSM.toggleLegend();
        assertEqual(JSON.stringify(h.nav()), JSON.stringify([]),
            'на десктопе перехода на страницу нет');
        assertEqual(h.WSM._legendOpen, true, 'шторка открылась');
    });

    test('VM: _setLegend — открытие кратким видом (230px, Task 388)', () => {
        const h = makeHost(true);
        h.WSM._setLegend(true);
        const drawer = h.els().wsLegendDrawer;
        assertEqual(drawer.style.width, '230px', 'слот — краткий вид');
        assertEqual(drawer.style.marginRight, '0px', 'выехала (маржа 0)');
        assertEqual(h.els().wsLgChv.hidden, false, 'шеврон показан');
        h.WSM._setLegend(false);
        assertEqual(drawer.style.marginRight, '-230px',
            'закрытие — за край на ширину вида');
        assertEqual(h.els().wsLgChv.hidden, true, 'шеврон скрыт');
    });

    test('VM: toggleLegendWide — разворот/сворачивание (класс+aria+слот)', () => {
        const h = makeHost(true);
        // гейт: закрытая шторка — клики игнорируются
        h.WSM.toggleLegendWide();
        assertEqual(h.WSM._legendWide, false, 'гейт: закрыта — вид не меняется');
        // открыли узкой
        h.WSM._setLegend(true);
        // подменяем шеврон на записывающий мок
        const chvCalls = [];
        const chv = mkEl();
        chv.setAttribute = (k, v) => { chvCalls.push([k, v]); };
        h.els().wsLgChv = chv;
        // разворот шире
        h.WSM.toggleLegendWide();
        assertEqual(h.WSM._legendWide, true, 'вид — широкий');
        assertEqual(h.els().wsLegendDrawer.style.width, '500px',
            'слот — 500px (min(500, 45vw от 1280); Task 387)');
        assertTrue(chvCalls.some(c => c[0] === 'aria-pressed' && c[1] === 'true'),
            'aria-pressed=true у шеврона');
        assertTrue(chvCalls.some(c => c[0] === 'aria-label' &&
                   String(c[1]).indexOf('Только коды') !== -1),
            'aria-label «Только коды (свернуть)»');
        // обратно к кодам
        h.WSM.toggleLegendWide();
        assertEqual(h.WSM._legendWide, false, 'вид — снова узкий');
        assertEqual(h.els().wsLegendDrawer.style.width, '230px', 'слот — 230px (Task 388)');
        assertTrue(chvCalls.some(c => c[0] === 'aria-label' &&
                   String(c[1]).indexOf('Показать подробные') !== -1),
            'aria-label «Показать подробные наименования»');
    });

    test('VM: класс ws-lg-wide вешается/снимается на шторку', () => {
        const h = makeHost(true);
        const applied = [];
        const drawer = mkEl();
        drawer.classList = {
            add(c) { applied.push(['+', c]); },
            remove(c) { applied.push(['-', c]); },
            contains(c) { return false; },
        };
        h.els().wsLegendDrawer = drawer;
        h.WSM._setLegend(true);
        h.WSM.toggleLegendWide();
        h.WSM.toggleLegendWide();
        // открытие узким видом тоже применяет _applyLegendWide
        // (снимает класс — гарантирует узкий вид после «широкого»
        // закрытия в другой сессии), затем add/remove при разворотах
        assertEqual(JSON.stringify(applied),
            JSON.stringify([['-', 'ws-lg-wide'], ['+', 'ws-lg-wide'], ['-', 'ws-lg-wide']]),
            'снятие при открытии узким, add в широком, снятие при сворачивании');
    });

    test('VM: _legendWidthPx — капы (230 / 500 / 45vw; Task 388)', () => {
        const h = makeHost(true);            // vw не задан → 1280 fallback
        assertEqual(h.WSM._legendWidthPx(), 230, 'краткий — 230px (Task 388)');
        h.WSM._legendWide = true;
        assertEqual(h.WSM._legendWidthPx(), 500, 'широкий @1280 — 500px (Task 387)');
        // узкий экран: 45vw < 500
        const h2 = makeHost(true, 700);
        h2.WSM._legendWide = true;
        assertEqual(h2.WSM._legendWidthPx(), 315, 'широкий @700 — 45vw = 315px');
    });

    test('VM: повторное открытие помнит развёрнутый вид', () => {
        const h = makeHost(true);
        h.WSM._setLegend(true);
        h.WSM.toggleLegendWide();            // широкий
        h.WSM._setLegend(false);             // закрыли
        assertEqual(h.WSM._legendWide, true, 'вид сохранён (в памяти сессии)');
        h.WSM._setLegend(true);              // открыли снова
        assertEqual(h.els().wsLegendDrawer.style.width, '500px',
            'открылась сразу ШИРОКОЙ (пережитый вид; Task 387: 500px)');
    });

    test('VM: _legendHtml/_renderLegendSheet — контент шторки', () => {
        const h = makeHost(true);
        h.WSM._setLegend(true);
        const body = h.els().wsLegendBody.innerHTML;
        assertTrue(body.indexOf('Коды дней (Т-12/Т-13)') !== -1, 'секция дней');
        assertTrue(body.indexOf('Коды мероприятий') !== -1, 'секция мероприятий');
        assertTrue(body.indexOf('Отпуск ежегодный основной') !== -1,
            'наименование кода ОТ (в HTML всегда; вид решает CSS)');
        assertTrue(body.indexOf('ws-lg-notesec') !== -1,
            'пояснения — в notesec-блоке');
        assertTrue(body.indexOf('ws-lg-swatch') !== -1, 'свотчи');
        assertTrue(body.indexOf('#FFE082') !== -1, 'живой цвет Д');
    });

    test('VM: onLegendPageOpen — контент мобильной страницы', () => {
        const h = makeHost(false);
        h.WSM.onLegendPageOpen();
        const body = h.els().wsLgPageBody.innerHTML;
        assertTrue(body.indexOf('Коды дней (Т-12/Т-13)') !== -1, 'секция дней');
        assertTrue(body.indexOf('Ночь (12-час)') !== -1, 'наименования на странице');
        assertTrue(body.indexOf('Обозначения в шахматке') !== -1, 'пояснения');
        // Task 387: пояснение праздников в отпусках УДАЛЕНО; живы
        // бейдж смены/«сегодня»/«красная рамка… (пример - 24*)»
        assertTrue(body.indexOf('(пример - 24*)') !== -1, 'сокращённый предпраздничный');
        assertFalse(body.indexOf('ст. 120 ТК РФ') !== -1, 'пояснение праздников удалено (Task 387)');
        // шторку страница не трогает (элемент даже не запрашивался)
        assertEqual(h.els().wsLegendDrawer, undefined,
            'десктоп-шторка не трогается со страницы');
    });

    test('VM: toggleLegend — взаимоисключение с итогами живо', () => {
        const h = makeHost(true);
        h.WSM._totalsOpen = true;
        h.WSM.toggleLegend();
        assertEqual(h.ttToggles(), 1, 'открытые итоги закрыты');
        assertEqual(h.WSM._legendOpen, true, 'шторка открылась');
    });
});
