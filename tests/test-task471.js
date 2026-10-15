// tests/test-task471.js
// Task 471 — заявка пользователя: «В таблице плановых мероприятий,
// помимо текущего года в оглавлении таблицы, сделай кнопку просмотра
// предыдущих годов, и если есть архив за предыдущие года, тогда кнопка
// переключения годов, расположенная слева от текущего года, будет
// активна. Так же нужно в файле Мероприятия_КИП_ИОС создать страницу
// "Работы на месяц", куда должны записываться данные по работам на
// определённый месяц. Работы должны вноситься пользователем, при
// нажатии на ячейку "Работы на следующий месяц", расположенной в
// таблице плановых мероприятий, вместо окна с описанием раздела в
// данном окне должен появиться интерфейс ввода работ на следующий
// месяц. При нажатии на ячейку Мероприятия - снова появляется
// описание раздела. А при нажатии на ячейку "Работы на месяц", в
// правом окне появится перечень работ на текущий месяц, с
// возможностью отмечать полного или частичного выполнения, или не
// выполнения, что тоже должно записываться в архив на лист "Работы
// на месяц". Получается, правое окно будет динамичным, в зависимости
// от выбранного мероприятия. Месяцы в шапке таблицы мероприятий
// должны быть кликабельны и определять за какой месяц будет
// появляться информация в правом окне раздела плановых
// мероприятий.»
//
// КОНТЕКСТ: таблица Task 460 (10 мероприятий/3 группы), отметки
// Task 463/464 (год/месяц/наименование из DOM, архив — лист
// «Архив» файла Мероприятия_КИП_ИОС), раскладка Task 468 (таблица
// влево + окно справа), описание Task 469, строки работ Task 470.
// РЕШЕНИЕ (клиент + СЕРВЕР PlanEvents.gs):
//   1) шапка «N год» — кнопка «◀» слева (pePrevYearBtn, стартово
//      disabled; JS активирует после planEvents.years, если в
//      архиве есть предыдущие годы), клик — к ближайшему младшему
//      году архива, при исчерпании — возврат к текущему году;
//   2) месяцы шапки кликабельны → _setSelMonth (подсветка
//      pe-mo-sel; мобайл-селектор синхронен);
//   3) правое окно динамичное: #peDescView (описание) /
//      #peWorksView (PlanWorksData): «Работы на следующий месяц» —
//      ввод (planWorks.add/remove), «Работы на месяц» — перечень с
//      отметкой полного/частичного/невыполнения (planWorks.setStatus
//      → лист «Работы на месяц»), «Мероприятия» (шапка) — описание;
//   4) сервер: planEvents.years + planWorks.list/add/remove/
//      setStatus (лист «Работы на месяц», создаёт PlanWorksInit.gs).
//   SW: kipia-test-v742.
//
// Запуск: через tests/run-all.js (require './test-task471.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'PlanEvents.gs'), 'utf8');
const INITW_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'PlanWorksInit.gs'), 'utf8');
const CODE_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Code.gs'), 'utf8');

// Секция страницы «Плановые мероприятия»
function peSection() {
    const start = INDEX_SRC.indexOf('<div id="page-plan-events" class="page-content">');
    if (start === -1) return null;
    return INDEX_SRC.slice(start, start + 45000);
}

// Блок модуля PlanEventsData (до var WorkSchedule — модуль
// PlanWorksData живёт МЕЖДУ ними)
function peModuleSrc() {
    const a = INDEX_SRC.indexOf('var PlanEventsData = {');
    const b = INDEX_SRC.indexOf('var WorkSchedule = {');
    return (a !== -1 && b !== -1 && b > a) ? INDEX_SRC.slice(a, b) : '';
}

// Блок модуля PlanWorksData
function pwModuleSrc() {
    const a = INDEX_SRC.indexOf('var PlanWorksData = {');
    const b = INDEX_SRC.indexOf('var WorkSchedule = {');
    return (a !== -1 && b !== -1 && b > a) ? INDEX_SRC.slice(a, b) : '';
}

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

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// Метод модуля как ФУНКЦИЯ (для .call с контролируемым this)
function methodFn(src, name) {
    const m = extractMethod(src, name);
    if (!m) return null;
    return new Function('return (' + m.slice(m.indexOf('function')) + ');')();
}

// ============================================================
// 1. SRC — кнопка предыдущего года в оглавлении таблицы
// ============================================================
describe('Task 471 — SRC: кнопка просмотра предыдущих годов', () => {

    test('шапка года: кнопка СЛЕВА от подписи «2026 год»', () => {
        const page = peSection();
        assertTrue(page !== null, 'страница найдена');
        const th = page.indexOf('<th class="pe-th-year" colspan="12"><button type="button" id="pePrevYearBtn"');
        assertTrue(th !== -1, 'th.pe-th-year открывается кнопкой pePrevYearBtn');
        const btnEnd = page.indexOf('</button>', th);
        const lbl = page.indexOf('<span id="peYearLabel">2026 год</span>', th);
        assertTrue(btnEnd !== -1 && lbl > btnEnd,
            'кнопка расположена СЛЕВА от подписи года (заявка)');
    });

    test('кнопка стартово НЕАКТИВНА (disabled) — до загрузки годов', () => {
        const page = peSection();
        const th = page.indexOf('<th class="pe-th-year" colspan="12"><button type="button" id="pePrevYearBtn"');
        const btnTag = page.slice(page.indexOf('<button', th), page.indexOf('>', page.indexOf('<button', th)) + 1);
        assertTrue(btnTag.indexOf(' disabled') !== -1,
            'нет архива — кнопка неактивна (fail-safe до planEvents.years)');
    });

    test('кнопка — доступная кнопка (aria-label + svg-шеврон)', () => {
        const page = peSection();
        assertTrue(page.indexOf('aria-label="Предыдущий год"') !== -1,
            'aria-label «Предыдущий год»');
        const i = page.indexOf('id="pePrevYearBtn"');
        const svg = page.indexOf('<polyline points="15 18 9 12 15 6"/>', i);
        assertTrue(svg !== -1 && svg < page.indexOf('</button>', i),
            'шеврон «◀» внутри кнопки');
    });

    test('CSS: .pe-year-btn + неактивное состояние (disabled)', () => {
        assertTrue(INDEX_SRC.indexOf('.pe-year-btn {') !== -1,
            'правило .pe-year-btn');
        const b = INDEX_SRC.slice(INDEX_SRC.indexOf('.pe-year-btn:disabled {'),
                                  INDEX_SRC.indexOf('}', INDEX_SRC.indexOf('.pe-year-btn:disabled {')) + 1);
        assertTrue(b.indexOf('opacity') !== -1 && b.indexOf('cursor: default') !== -1,
            'disabled — тусклая и некликабельная (нет архива)');
    });

    test('текст «2026 год» один — в #peYearLabel (JS переключает)', () => {
        const page = peSection();
        assertEqual((page.match(/2026 год/g) || []).length, 1,
            'подпись года одна — span#peYearLabel');
    });
});

// ============================================================
// 2. SRC — JS PlanEventsData: годы архива + выбранный месяц
// ============================================================
describe('Task 471 — SRC: JS — переключение годов', () => {

    test('состояние: _viewYear / _years / _selMonth', () => {
        const m = peModuleSrc();
        assertTrue(m.indexOf('_viewYear: 2026,') !== -1, '_viewYear (отображаемый год)');
        assertTrue(m.indexOf('_years: [],') !== -1, '_years (годы архива)');
        assertTrue(m.indexOf('_selMonth: null,') !== -1, '_selMonth (выбранный месяц)');
    });

    test('_loadYears: planEvents.years + тихая деградация', () => {
        const fn = stripComments(extractMethod(peModuleSrc(), '_loadYears'));
        assertTrue(fn.indexOf("api('planEvents.years'") !== -1,
            'вызов planEvents.years');
        assertTrue(fn.indexOf('console.warn') !== -1,
            'старый сервер — молча (кнопка не активируется)');
        assertTrue(fn.indexOf('_updateYearUi') !== -1, 'обновление кнопки');
    });

    test('_updateYearUi: подпись года + disabled кнопки', () => {
        const fn = stripComments(extractMethod(peModuleSrc(), '_updateYearUi'));
        assertTrue(fn.indexOf("getElementById('peYearLabel')") !== -1,
            'подпись #peYearLabel');
        assertTrue(fn.indexOf("getElementById('pePrevYearBtn')") !== -1,
            'кнопка #pePrevYearBtn');
        assertTrue(fn.indexOf('btn.disabled = !this._hasPrevYear()') !== -1,
            'disabled ← !_hasPrevYear (активна только при архиве)');
    });

    test('_hasPrevYear: год плана без архива — false', () => {
        const host = new Function('return ({YEAR: 2026, _viewYear: 2026,' +
            ' _years: [2026]});')();
        const fn = methodFn(peModuleSrc(), '_hasPrevYear');
        assertFalse(fn.call(host), 'текущий год + архив только текущего — некуда');
        host._years = [2024, 2026];
        assertTrue(fn.call(host), 'есть 2024 — есть куда');
        host._viewYear = 2025;
        assertTrue(fn.call(host), 'показан не текущий год — можно вернуться');
    });

    test('_switchYear: к БЛИЖАЙШЕМУ младшему; исчерпание — текущий', () => {
        const host = new Function('return ({YEAR: 2026, _viewYear: 2026,' +
            ' _years: [2024, 2025], calls: 0,' +
            ' loadMarks: function() { this.calls++; },' +
            ' _updateYearUi: function() {} });')();
        const fn = methodFn(peModuleSrc(), '_switchYear');
        fn.call(host);
        assertEqual(host._viewYear, 2025, '2026 → ближайший младший 2025');
        fn.call(host);
        assertEqual(host._viewYear, 2024, '2025 → 2024');
        fn.call(host);
        assertEqual(host._viewYear, 2026, '2024 (младших нет) → возврат к текущему');
        assertEqual(host.calls, 3, 'каждое переключение перезагружает отметки');
    });

    test('_switchYear: год без младших лет архива — без действия', () => {
        const host = new Function('return ({YEAR: 2026, _viewYear: 2026,' +
            ' _years: [2026], calls: 0,' +
            ' loadMarks: function() { this.calls++; },' +
            ' _updateYearUi: function() {} });')();
        const fn = methodFn(peModuleSrc(), '_switchYear');
        fn.call(host);
        assertEqual(host._viewYear, 2026, 'остался на текущем году');
        assertEqual(host.calls, 0, 'перезагрузки не было');
    });

    test('отметки используют ОТОБРАЖАЕМЫЙ год (_viewYear)', () => {
        const m = peModuleSrc();
        assertTrue(m.indexOf('year: this._viewYear') !== -1,
            'payload года — this._viewYear');
        assertFalse(stripComments(m).indexOf('year: this.YEAR') !== -1,
            'жёсткого года плана в payload больше нет');
        assertTrue(m.indexOf("this._key(this._viewYear, month, event)") !== -1,
            '_cellInfo ищет отметку по _viewYear');
    });
});

// ============================================================
// 3. SRC — кликабельные месяцы шапки + «Мероприятия»
// ============================================================
describe('Task 471 — SRC: кликабельная шапка таблицы', () => {

    test('клик по месяцу шапки → _setSelMonth (выбор месяца окна)', () => {
        const m = peModuleSrc();
        const init = stripComments(extractMethod(m, 'init'));
        assertTrue(init.indexOf("t.closest('tr.pe-head-months th')") !== -1,
            'ветка клика по месяцу шапки');
        assertTrue(init.indexOf('self._setSelMonth(mi)') !== -1,
            'выбор месяца правого окна');
        assertTrue(init.indexOf("Array.prototype.indexOf.call(ths, thM) + 1") !== -1,
            'индекс месяца = позиция th в строке шапки');
    });

    test('клик по «Мероприятия» (шапка) → описание раздела', () => {
        const init = stripComments(extractMethod(peModuleSrc(), 'init'));
        assertTrue(init.indexOf("t.closest('th.pe-th-name')") !== -1,
            'ветка клика по «Мероприятия»');
        assertTrue(init.indexOf('PlanWorksData.showDesc()') !== -1,
            'возврат к описанию раздела (заявка)');
    });

    test('клик по наименованию мероприятия → динамичное окно', () => {
        const init = stripComments(extractMethod(peModuleSrc(), 'init'));
        assertTrue(init.indexOf("t.closest('td.pe-name')") !== -1,
            'ветка клика по td.pe-name');
        assertTrue(init.indexOf('PlanWorksData.onNameClick(nameTd)') !== -1,
            'маршрутизация по наименованию (PlanWorksData)');
    });

    test('ячейки отметок — ПЕРВАЯ ветка (Task 463 жив)', () => {
        const init = stripComments(extractMethod(peModuleSrc(), 'init'));
        const iM = init.indexOf("t.closest('td.pe-m')");
        const iN = init.indexOf("t.closest('td.pe-name')");
        assertTrue(iM !== -1 && iN > iM,
            'td.pe-m проверяется раньше наименований — отметки не сломаны');
    });

    test('_setSelMonth: подсветка + мобайл-селектор + правое окно', () => {
        const fn = stripComments(extractMethod(peModuleSrc(), '_setSelMonth'));
        assertTrue(fn.indexOf("classList.toggle('pe-mo-sel'") !== -1,
            'подсветка выбранного месяца в шапке');
        assertTrue(fn.indexOf("getElementById('peMonthSel')") !== -1,
            'синхронизация мобайл-селектора');
        assertTrue(fn.indexOf('PlanWorksData.onMonthChanged()') !== -1,
            'правое окно перерисовывается под новый месяц');
    });

    test('_tagWorkRows: кликабельные строки работ (класс из DOM)', () => {
        const fn = stripComments(extractMethod(peModuleSrc(), '_tagWorkRows'));
        assertTrue(fn.indexOf("querySelectorAll('tbody tr.pe-row td.pe-name')") !== -1,
            'наименования читаются из DOM');
        assertTrue(fn.indexOf("'Работы на следующий месяц'") !== -1 &&
                   fn.indexOf("'Работы на месяц'") !== -1,
            'кликабельны ровно две строки работ');
        assertTrue(fn.indexOf("classList.add('pe-name-click')") !== -1,
            'класс pe-name-click (курсор + hover в CSS)');
    });

    test('CSS: месяцы шапки + «Мероприятия» кликабельны; выбранный месяц подсвечен', () => {
        // ВТОРОЕ правило .pe-head-months th — Task 471 (первое — шрифт
        // 12px из Task 460): ищем блок с курсором
        assertTrue(INDEX_SRC.indexOf('.pe-head-months th {\n        cursor: pointer;') !== -1,
            'правило Task 471: месяцы шапки — курсор-рука');
        assertTrue(INDEX_SRC.indexOf('.pe-head-months th.pe-mo-sel {') !== -1,
            'подсветка выбранного месяца (pe-mo-sel)');
        assertTrue(INDEX_SRC.indexOf('th.pe-th-name:hover') !== -1,
            'hover у «Мероприятия»');
        assertTrue(INDEX_SRC.indexOf('td.pe-name.pe-name-click:hover') !== -1,
            'hover у кликабельных наименований работ');
    });
});

// ============================================================
// 4. SRC — динамичное правое окно
// ============================================================
describe('Task 471 — SRC: динамичное правое окно', () => {

    test('aside: #peDescView (описание) + #peWorksView (работы, hidden)', () => {
        const page = peSection();
        const a = page.indexOf('<aside class="pe-desc-card" aria-label="Описание раздела">');
        assertTrue(a !== -1, 'aside окна на месте (Task 468)');
        const d = page.indexOf('<div id="peDescView" class="pe-desc-view">', a);
        const w = page.indexOf('<div id="peWorksView" class="pe-works-view" hidden></div>', a);
        const e = page.indexOf('</aside>', a);
        assertTrue(d !== -1 && d < e, 'вид описания #peDescView внутри aside');
        assertTrue(w !== -1 && w > d && w < e, 'вид работ #peWorksView после описания');
    });

    test('описание Task 469 — внутри #peDescView, порядок блоков цел', () => {
        const page = peSection();
        const d = page.indexOf('<div id="peDescView" class="pe-desc-view">');
        const block = page.slice(d, page.indexOf('</div>', page.indexOf('pe-desc-list')) + 6);
        const t = block.indexOf('pe-desc-title');
        const l = block.indexOf('pe-desc-lead');
        const s = block.indexOf('pe-desc-sub');
        const u = block.indexOf('pe-desc-list');
        assertTrue(t !== -1 && l > t && s > l && u > s,
            'title → lead → sub → list (Task 468/469 живы)');
        assertTrue(block.indexOf('Периодические работы на участке КИП ИОС') !== -1,
            'лид Task 469 на месте');
    });

    test('окно описания ровно одно (Task 468/469 не размножены)', () => {
        const htmlStart = INDEX_SRC.indexOf('</head>');
        const html = INDEX_SRC.slice(htmlStart);
        assertEqual((html.match(/pe-desc-card/g) || []).length, 1,
            'pe-desc-card один — в «Плановых мероприятиях»');
    });

    test('модуль PlanWorksData: каркас (режимы + цель)', () => {
        const m = pwModuleSrc();
        assertTrue(m.indexOf('var PlanWorksData = {') !== -1, 'модуль объявлен');
        assertTrue(m.indexOf("_mode: 'desc'") !== -1, 'вид по умолчанию — описание');
        assertTrue(m.indexOf("showNext: function()") !== -1 &&
                   m.indexOf("showMonth: function()") !== -1 &&
                   m.indexOf("showDesc: function()") !== -1,
            'переключение видов desc/next/month');
        assertTrue(m.indexOf('_target: function()') !== -1,
            'целевая пара (год, месяц) вида');
    });

    test('_target: «следующий месяц» — декабрь → январь СЛЕДУЮЩЕГО года', () => {
        const fn = methodFn(pwModuleSrc(), '_target');
        // _target читает глобальный PlanEventsData (как в файле)
        global.PlanEventsData = { _viewYear: 2026, _selMonth: 10 };
        let r = fn.call({ _mode: 'next' });
        assertEqual(r.year, 2026, 'октябрь+1 → ноябрь 2026 (год)');
        assertEqual(r.month, 11, 'октябрь+1 → ноябрь (месяц)');
        global.PlanEventsData = { _viewYear: 2026, _selMonth: 12 };
        r = fn.call({ _mode: 'next' });
        assertEqual(r.year, 2027, 'декабрь+1 → январь СЛЕДУЮЩЕГО года');
        assertEqual(r.month, 1, 'декабрь+1 → январь');
        r = fn.call({ _mode: 'month' });
        assertEqual(r.year, 2026, 'вид «на месяц» — выбранный год');
        assertEqual(r.month, 12, 'вид «на месяц» — выбранный месяц');
        delete global.PlanEventsData;
    });

    test('onNameClick: маршрутизация двух строк работ', () => {
        const fn = stripComments(extractMethod(pwModuleSrc(), 'onNameClick'));
        assertTrue(fn.indexOf("'Работы на следующий месяц'") !== -1 &&
                   fn.indexOf('this.showNext()') !== -1,
            '«Работы на следующий месяц» → ввод работ');
        assertTrue(fn.indexOf("'Работы на месяц'") !== -1 &&
                   fn.indexOf('this.showMonth()') !== -1,
            '«Работы на месяц» → перечень с отметками');
    });

    test('_render: вид ввода — форма (input + «Добавить»)', () => {
        const fn = stripComments(extractMethod(pwModuleSrc(), '_render'));
        assertTrue(fn.indexOf('pe-works-form') !== -1, 'форма ввода');
        assertTrue(fn.indexOf('id="peWorkInput"') !== -1, 'поле описания работы');
        assertTrue(fn.indexOf('id="peWorkAddBtn"') !== -1, 'кнопка «Добавить»');
        assertTrue(fn.indexOf('Работы на следующий месяц') !== -1,
            'заголовок вида ввода');
        assertTrue(fn.indexOf('Работы на месяц') !== -1,
            'заголовок вида перечня');
    });

    test('_render: скрытие описания при виде работ (hidden)', () => {
        const fn = stripComments(extractMethod(pwModuleSrc(), '_render'));
        assertTrue(fn.indexOf("dv.hidden = true") !== -1,
            'описание скрывается (peDescView)');
        assertTrue(fn.indexOf("wv.hidden = false") !== -1,
            'вид работ показывается (peWorksView)');
        assertTrue(fn.indexOf("wv.hidden = true") !== -1,
            'возврат к описанию скрывает работы');
    });

    test('_setStatus: planWorks.setStatus + дата сегодня + бейдж', () => {
        const fn = stripComments(extractMethod(pwModuleSrc(), '_setStatus'));
        assertTrue(fn.indexOf("api('planWorks.setStatus'") !== -1,
            'вызов planWorks.setStatus');
        assertTrue(fn.indexOf('status: status') !== -1, 'статус в payload');
        assertTrue(fn.indexOf('_todayIso') !== -1, 'дата отметки — сегодня');
        assertTrue(fn.indexOf('PlanEventsData._ruDate') !== -1 ||
                   extractMethod(pwModuleSrc(), '_listHtml').indexOf('PlanEventsData._ruDate') !== -1,
            'дата статуса — в русской нотации (бейдж)');
    });

    test('статусы: Выполнено / Частично / Не выполнено (3 кнопки)', () => {
        const m = pwModuleSrc();
        const li = extractMethod(m, '_listHtml');
        assertTrue(li.indexOf("_stBtn(w, 'выполнено', 'Выполнено')") !== -1 &&
                   li.indexOf("_stBtn(w, 'частично', 'Частично')") !== -1 &&
                   li.indexOf("_stBtn(w, 'не выполнено', 'Не выполнено')") !== -1,
            'три кнопки отметки — по заявке');
        const lb = extractMethod(m, '_stLabel');
        assertTrue(lb.indexOf("'Выполнено'") !== -1 &&
                   lb.indexOf("'Выполнено частично'") !== -1 &&
                   lb.indexOf("'Не выполнено'") !== -1,
            'человекочитаемые статусы');
        const cl = extractMethod(m, '_stClass');
        assertTrue(cl.indexOf('st-done') !== -1 && cl.indexOf('st-partial') !== -1 &&
                   cl.indexOf('st-fail') !== -1,
            'цвета: зелёный/жёлтый/красный');
    });

    test('_add / _remove: ввод и удаление работ (planWorks.add/remove)', () => {
        const add = stripComments(extractMethod(pwModuleSrc(), '_add'));
        assertTrue(add.indexOf("api('planWorks.add'") !== -1, 'planWorks.add');
        assertTrue(add.indexOf('work: val') !== -1, 'текст работы в payload');
        const rm = stripComments(extractMethod(pwModuleSrc(), '_remove'));
        assertTrue(rm.indexOf("api('planWorks.remove'") !== -1, 'planWorks.remove');
        assertTrue(rm.indexOf('id: id') !== -1, 'id работы в payload');
        assertTrue(extractMethod(pwModuleSrc(), '_bindView').indexOf('.pe-work-del') !== -1,
            'кнопка «×» у работы в виде ввода');
    });

    test('_load: планWorks.list + защита от гонок (цель сверяется)', () => {
        const fn = stripComments(extractMethod(pwModuleSrc(), '_load'));
        assertTrue(fn.indexOf("api('planWorks.list'") !== -1, 'planWorks.list');
        assertTrue(fn.indexOf('year: t.year') !== -1 && fn.indexOf('month: t.month') !== -1,
            'целевые год/месяц в payload');
        assertTrue(fn.indexOf('cur.year !== t.year || cur.month !== t.month') !== -1,
            'устаревший ответ не применяется (смена месяца/года)');
        assertTrue(fn.indexOf('Unknown action') !== -1,
            'старый сервер без planWorks.* — понятное сообщение');
    });

    test('обновление месяца/года перезагружает вид работ', () => {
        const m = pwModuleSrc();
        assertTrue(m.indexOf('onMonthChanged: function()') !== -1 &&
                   m.indexOf('onViewYearChanged: function()') !== -1 &&
                   m.indexOf('reloadIfOpen: function()') !== -1,
            'хуки смены месяца/года/«Обновить»');
        const init = stripComments(extractMethod(peModuleSrc(), 'init'));
        assertTrue(init.indexOf('PlanWorksData.resetView()') !== -1,
            'открытие страницы — вид-описание (сброс)');
    });

    test('кнопка «Обновить» подтягивает и годы, и работы', () => {
        const fn = stripComments(extractMethod(peModuleSrc(), 'refresh'));
        assertTrue(fn.indexOf('self._loadYears()') !== -1,
            'годы архива обновляются');
        assertTrue(fn.indexOf('PlanWorksData.reloadIfOpen()') !== -1,
            'открытый вид работ обновляется');
    });

    test('CSS: окно работ — форма/перечень/кнопки/бейджи + светлая тема', () => {
        ['.pe-works-input {', '.pe-works-add-btn {', '.pe-works-list {',
         '.pe-work-item {', '.pe-work-st-btn {', '.pe-work-status {',
         '.pe-works-empty {'].forEach(function(sel) {
            assertTrue(INDEX_SRC.indexOf(sel) !== -1, 'правило ' + sel);
        });
        assertTrue(INDEX_SRC.indexOf('.pe-work-st-btn.st-sel[data-st="выполнено"]') !== -1 &&
                   INDEX_SRC.indexOf('.pe-work-st-btn.st-sel[data-st="частично"]') !== -1 &&
                   INDEX_SRC.indexOf('.pe-work-st-btn.st-sel[data-st="не выполнено"]') !== -1,
            'подсветка выбранного статуса (3 цвета)');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .pe-work-item {') !== -1 &&
                   INDEX_SRC.indexOf('[data-theme="light"] .pe-works-input {') !== -1,
            'светлая тема окна работ');
    });
});

// ============================================================
// 5. SRC — сервер: PlanEvents.gs + Code.gs + PlanWorksInit.gs
// ============================================================
describe('Task 471 — SRC: сервер (Apps Script)', () => {

    test('PlanEvents.gs: лист «Работы на месяц» + статусы + версия 471', () => {
        assertTrue(GS_SRC.indexOf("WORKS_SHEET: 'Работы на месяц'") !== -1,
            'константа WORKS_SHEET');
        assertTrue(GS_SRC.indexOf("WORKS_STATUSES: ['выполнено', 'частично', 'не выполнено']") !== -1,
            'допустимые статусы (полное/частичное/невыполнение)');
        assertTrue(GS_SRC.indexOf("SRV_VER: '471'") !== -1, 'SRV_VER: 471');
    });

    test('PlanEvents.gs: years — годы архива для кнопки', () => {
        const fn = extractMethod(GS_SRC, 'years');
        assertTrue(fn !== null, 'функция years');
        assertTrue(fn.indexOf('getRange(2, 4') !== -1,
            'колонка D (год) листа «Архив»');
        assertTrue(fn.indexOf('sort') !== -1, 'сортировка по возрастанию');
    });

    test('PlanEvents.gs: planWorks.* — 4 эндпоинта', () => {
        assertTrue(extractMethod(GS_SRC, 'listWorks') !== null, 'listWorks');
        assertTrue(extractMethod(GS_SRC, 'addWork') !== null, 'addWork');
        assertTrue(extractMethod(GS_SRC, 'removeWork') !== null, 'removeWork');
        assertTrue(extractMethod(GS_SRC, 'setWorkStatus') !== null, 'setWorkStatus');
        const add = extractMethod(GS_SRC, 'addWork');
        assertTrue(add.indexOf('appendRow') !== -1, 'добавление — строка листа');
        assertTrue(add.indexOf('maxId + 1') !== -1, 'автоинкремент id');
        const st = extractMethod(GS_SRC, 'setWorkStatus');
        assertTrue(st.indexOf('WORKS_STATUSES.indexOf(status)') !== -1,
            'валидация статуса');
        assertTrue(st.indexOf('hitRows') !== -1, 'правка строк по id');
    });

    test('PlanEvents.gs: идемпотентность remove + мягкий парсинг строк', () => {
        const rm = extractMethod(GS_SRC, 'removeWork');
        assertTrue(rm.indexOf('removed > 0') !== -1,
            'работы нет → removed: false (не ошибка)');
        const rw = extractMethod(GS_SRC, '_rowToWork');
        assertTrue(rw.indexOf('return null') !== -1, 'битые строки — null');
        assertTrue(GS_SRC.indexOf('_getWorksSheet: function()') !== -1,
            'хелпер листа работ');
    });

    test('PlanWorksInit.gs: создание листа «Работы на месяц» (8 колонок)', () => {
        assertTrue(INITW_SRC.indexOf("PW_SHEET_NAME = 'Работы на месяц'") !== -1,
            'имя листа');
        assertTrue(INITW_SRC.indexOf('function planWorksDeploy()') !== -1,
            'planWorksDeploy — создаёт лист');
        assertTrue(INITW_SRC.indexOf('function planWorksStatus()') !== -1,
            'planWorksStatus — диагностика');
        assertTrue(INITW_SRC.indexOf("['id', 'год', 'месяц', 'работа', 'статус',\n                  'дата_статуса', 'email', 'время_изменения']") !== -1,
            '8 заголовков листа');
        assertTrue(INITW_SRC.indexOf("setNumberFormat('@')") !== -1,
            'текстовый формат дат/работ (паттерн Task 304)');
        assertTrue(INITW_SRC.indexOf('уже существует — не трогаю') !== -1,
            'идемпотентность: существующий лист не перезаписывается');
    });

    test('Code.gs: маршрутизация — 5 новых case', () => {
        ["case 'planEvents.years':", "case 'planWorks.list':",
         "case 'planWorks.add':", "case 'planWorks.remove':",
         "case 'planWorks.setStatus':"].forEach(function(c) {
            assertTrue(CODE_SRC.indexOf(c) !== -1, 'роут ' + c);
        });
        assertTrue(CODE_SRC.indexOf('PlanEvents.years(payload)') !== -1 &&
                   CODE_SRC.indexOf('PlanEvents.listWorks(payload)') !== -1 &&
                   CODE_SRC.indexOf('PlanEvents.addWork(payload)') !== -1 &&
                   CODE_SRC.indexOf('PlanEvents.removeWork(payload)') !== -1 &&
                   CODE_SRC.indexOf('PlanEvents.setWorkStatus(payload)') !== -1,
            'вызовы PlanEvents.*');
    });

    test('доступ — то же право plan.events (Task 462)', () => {
        const lw = extractMethod(GS_SRC, 'listWorks');
        assertTrue(lw.indexOf('this._requireAccess(payload.token)') !== -1,
            'шлюз права в каждом эндпоинте работ');
        const aw = extractMethod(GS_SRC, 'addWork');
        assertTrue(aw.indexOf('this._requireAccess(payload.token)') !== -1,
            'шлюз в addWork');
    });
});

// ============================================================
// 6. SW — версия кэша + комментарий партии
// ============================================================
describe('Task 471 — SW: версия кэша', () => {

    test("CACHE_VERSION = kipia-test-v742", () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v742';") !== -1,
            'SW поднят до kipia-test-v742 (Task 471)');
    });

    test('версия до партии (v694) отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v694') === -1,
            'в sw.js не осталось kipia-test-v694');
    });

    test('комментарий Task 471 в шапке версий sw.js', () => {
        const i = SW_SRC.indexOf('kipia-test-v742');
        // Task 473: окно 900 → 1020; Task 474: 1020 → 1300 —
        // комментарий Task 474 (3 строки о карточке прибора) отодвинул
        // начало комментария Task 471 (~1157 символов).
        // Task 499: окно 11200 → 12000 — комментарий плейсхолдеров
        // диапазонов (~430 симв.) отодвинул Task 471 до ~11207.
        // Task 501: окно 12000 → 13000 — комментарий электротехники/
        // геометрии (~380 симв.) отодвинул Task 471 до ~12008.
                // Task 508: окно 13700 → 14400 — комментарий архива
        // Кабельного журнала (~160 симв.) отодвинул Task 471.
const ctx = SW_SRC.slice(Math.max(0, i - 14400), i);
        // Task 478: окно 2700 → 3400 — комментарий ППР-индикации
        // (~340 симв.) отодвинул Task 471 до ~2800.
        // Task 481: окно 3400 → 4200 — комментарий «ТО = только год»
        // отодвинул Task 471 до ~3560.
        // Task 476: окно 2100 → 2700 — комментарий этапа 2
        // (KipDB, ~490 симв.) отодвинул Task 471 до ~2170.
        // Task 475: окно 1300 → 2100 — комментарий этапа 1 оптимизации
        // (~9 строк) отодвинул начало комментария Task 471 (~1738 симв.).
        assertTrue(ctx.indexOf('Task 471') !== -1, 'упоминание Task 471');
        assertTrue(ctx.indexOf('Работы на месяц') !== -1,
            'описание: лист «Работы на месяц»');
    });
});
