// tests/test-task321.js
// Task 321 — по заявке пользователя (три части):
//   1) «Список выбора года в общем количестве из трёх лет, один год
//      до текущего года, один год после текущего» — РОВНО три пункта
//      (Task 320 делал ±3 — 7 пунктов, избыточно).
//   2) «Переименуй раздел "График работы" в "Табель учёта рабочего
//      времени"» — 5 мест UI: кнопка на странице «Документация ИОС»,
//      заголовок страницы, метка крошек PAGE_LABELS, реестр
//      закреплений SUBSECTIONS, пункт сайдбара. Идентификаторы
//      (work-schedule) и права («График работы — просмотр» в
//      RoleMatrix) НЕ менялись — переименованы только надписи.
//   3) «Добавь учёт дней и рабочего времени по итогам месяца и года,
//      так чтобы они не мешали работе с месячным графиком» —
//      сворачиваемая секция «Итоги учёта»: Task 323 — БОКОВАЯ
//      ШТОРКА СПРАВА от шахматки (вертикальный бар-ручка у правого
//      края рабочей области, раскрытие — справа налево на половину
//      области); вкладки «Месяц» (дни/часы/смены/неявки по каждому
//      сотруднику — эффективный вид сетки: записи + несохранённые
//      правки) и «Год» (12 месяцев «явки/часы» + годовые суммы;
//      12 запросов listEntries + справочник с архивом; кэш в памяти).
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   Год: init-цикл −1..+1 (VM: 3 пункта 2025..2027, selected 2026).
//   Переименование: 5 мест содержат новую строку, старая из видимых
//   мест исчезла (заголовок страницы, кнопка меню, PAGE_LABELS,
//   SUBSECTIONS, сайдбар); в_архиве-пометка и права не тронуты.
//   Итоги HTML: Task 324 — кнопка-переключатель «Итоги учёта»
//   #wsGridWrap внутри #page-work-schedule; #wsTotalsPanel hidden
//   по умолчанию; вкладки/инфо/«Обновить»/тело.
//   Итоги CSS: бар (flex/cursor/hover/focus), панель (max-height
//   46vh + overflow-y + [hidden]), вкладка active, светлая тема,
//   мобильная тач-зона, таблица (sticky th, ws-tt-total).
//   Итоги JS (VM): _codeHours (карта кодов + фолбэк «NN-час» из
//   названия, дробные с запятой); _totalsZero; _totalsAgg (явки/
//   дневные/ночные/часы/семейства/прочие/total + общий итог);
//   _totalsEffectiveEntries (правка поверх записи, __delete,
//   новый день); toggleTotals (hidden/aria/класс/_renderTotals/
//   _fitGrid); setTotalsTab (классы/«Обновить» только год);
//   reloadTotals (сброс кэша года); _renderTotalsIfOpen;
//   _renderTotalsMonth (строки/значения/«Итого»/формат «43,2»/
//   норма ProdCalendar/несохранённые правки/пусто);
//   _loadYearData (12 listEntries + listEmployees includeArchived,
//   months 1..12, failed при сбоях месяцев, кэш при повторе);
//   _renderTotalsYear (лоадер/ошибка); _renderTotalsYearTable
//   (12 колонок, «д/ч», суммы, «архив», failed-инфо);
//   loadGrid(force) сбрасывает _YEAR_DATA + синхронизация месяца.
//   SW: kipia-test-v561.
//
// Запуск: через tests/run-all.js (require './test-task321.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const WS_CLIENT = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// Вырезка метода: «имя: function» (отступ 8) → закрывающая скобка
// метода (включительно; вложенные блоки — глубже 8 пробелов)
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        \},|\n    \};/);
    const end = m ? m.index + m[0].length : rest.length;
    return rest.slice(0, end);
}

// Метод → исполняемая функция (хвостовая запятая срезается;
// document — в замыкании, мок-DOM передаётся здесь)
function methodFn(src, name, document) {
    const text = methodText(src, name).replace(/,\s*$/, '');
    const body = text.replace(new RegExp('^ {8}' + name + ': '), '');
    return new Function('document', 'return (' + body + ')')(document || null);
}

// Хост с методами WorkSchedule (VM): извлечённые методы + поля extra
function wsHost(methodNames, extra, document) {
    const host = Object.assign({}, extra);
    methodNames.forEach(function(n) {
        host[n] = methodFn(WS_CLIENT, n, document);
    });
    return host;
}

// Мок-DOM: getElementById по словарю
function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// ============================================================
// 1. Год: ровно три пункта (−1 / текущий / +1)
// ============================================================
describe('Task 321 — год в селекте: РОВНО три года', () => {

    test('JS: init — цикл this._year - 1 … this._year + 1', () => {
        const init = methodText(WS_CLIENT, 'init');
        assertTrue(init.indexOf('for (var y = this._year - 1; y <= this._year + 1; y++)') !== -1,
            'цикл годов: один до текущего, текущий, один после');
        assertFalse(init.indexOf('this._year - 3') !== -1,
            'диапазон ±3 (Task 320) удалён');
        assertTrue(init.indexOf('Task 321 (заявка уточнена)') !== -1,
            'комментарий-метка Task 321 у блока года');
    });

    test('VM: init наполняет select 3 пунктами 2025..2027 (год 2026)', () => {
        const init = methodText(WS_CLIENT, 'init');
        const from = init.indexOf('var monthSel = document.getElementById');
        const to = init.indexOf('var role = null');
        assertTrue(from !== -1 && to !== -1 && to > from, 'блок выбора месяца/года найден');
        const fn = new Function('document', init.slice(from, to));
        const yearSel = { innerHTML: '' };
        const monthSel = { innerHTML: '' };
        fn.call({ _year: 2026, _month: 9 }, mockDoc({
            wsMonthSel: monthSel,
            wsYearSel: yearSel
        }));
        const opts = yearSel.innerHTML.match(/<option/g) || [];
        assertEqual(opts.length, 3, 'три пункта: 2025, 2026, 2027');
        assertTrue(yearSel.innerHTML.indexOf('value="2025"') !== -1, '2025 есть');
        assertTrue(yearSel.innerHTML.indexOf('value="2026"') !== -1, '2026 есть');
        assertTrue(yearSel.innerHTML.indexOf('value="2027"') !== -1, '2027 есть');
        assertFalse(yearSel.innerHTML.indexOf('value="2024"') !== -1, '2024 нет');
        assertFalse(yearSel.innerHTML.indexOf('value="2028"') !== -1, '2028 нет');
        assertTrue(/value="2026"[^>]*selected/.test(yearSel.innerHTML),
            'текущий год выбран');
    });
});

// ============================================================
// 2. Переименование раздела «График работы» → «Табель учёта
//    рабочего времени» (5 мест UI; id/права не тронуты)
// ============================================================
describe('Task 321 — раздел переименован в «Табель учёта рабочего времени»', () => {

    test('HTML: заголовок страницы — новое имя, старого нет', () => {
        assertTrue(INDEX_SRC.indexOf('<div class="page-inline-header-title">Табель учёта рабочего времени</div>') !== -1,
            'page-inline-header-title = «Табель учёта рабочего времени»');
        assertFalse(INDEX_SRC.indexOf('<div class="page-inline-header-title">График работы</div>') !== -1,
            'заголовка «График работы» больше нет');
    });

    test('HTML: кнопка раздела на page-docs-ios — новая метка, субметка прежняя', () => {
        const i = INDEX_SRC.indexOf('id="workScheduleMenuBtn"');
        assertTrue(i !== -1, 'кнопка workScheduleMenuBtn есть');
        const chunk = INDEX_SRC.slice(i, i + 700);
        // Task 493: кнопка переименована короче — «Табель учёта»
        assertTrue(chunk.indexOf('<div class="menu-btn-label">Табель учёта</div>') !== -1,
            'menu-btn-label — «Табель учёта» (Task 493, короче)');
        assertTrue(chunk.indexOf('Шахматка сменного и дневного персонала') !== -1,
            'субметка не изменилась');
    });

    test('JS: PAGE_LABELS и SUBSECTIONS — новые метки', () => {
        assertTrue(/'work-schedule':\s+'Табель учёта рабочего времени'/.test(INDEX_SRC),
            'PAGE_LABELS: новая метка');
        assertTrue(/'work-schedule':\s*\{ label: 'Табель учёта'/.test(INDEX_SRC),
            'SUBSECTIONS: метка «Табель учёта» (Task 493 — закрепление на главной)');
    });

    test('HTML: сайдбар — новая надпись у sidebarWorkScheduleBtn', () => {
        // Первое вхождение id — в КОММЕНТАРИИ над пунктом; ищем сам div
        const i = INDEX_SRC.indexOf('id="sidebarWorkScheduleBtn" onclick');
        assertTrue(i !== -1, 'sidebarWorkScheduleBtn (div) есть');
        const chunk = INDEX_SRC.slice(i, i + 400);
        assertTrue(chunk.indexOf('Табель учёта рабочего времени') !== -1,
            'пункт сайдбара — новое имя');
        assertTrue(chunk.indexOf('navigateTo(\'work-schedule\')') !== -1,
            'переход не изменился (id не тронут)');
    });

    test('id страницы/кнопок и права НЕ переименовывались', () => {
        assertTrue(INDEX_SRC.indexOf('id="page-work-schedule"') !== -1,
            'id страницы прежний');
        assertTrue(INDEX_SRC.indexOf("navigateTo('work-schedule')") !== -1,
            'навигация по прежнему id');
        // Право «График работы — просмотр» живёт в RoleMatrix (сервер) —
        // клиентские проверки права не переименовывались
        assertTrue(INDEX_SRC.indexOf("_READ_ROLES") !== -1 || INDEX_SRC.indexOf("_WRITE_ROLES") !== -1,
            'ролевые списки клиента не тронуты');
    });
});

// ============================================================
// 3. HTML панели итогов
// ============================================================
describe('Task 321 — HTML: боковая шторка итогов справа от шахматки', () => {

    test('HTML: Task 324 — кнопка «Итоги учёта» в НИЖНЕМ ряду кнопок тулбара', () => {
        const i = INDEX_SRC.indexOf('id="wsTotalsBtn"');
        assertTrue(i !== -1, 'кнопка есть');
        const chunk = INDEX_SRC.slice(i, i + 900);
        assertTrue(chunk.indexOf('WorkSchedule.toggleTotals()') !== -1,
            'клик — toggleTotals');
        assertTrue(chunk.indexOf('aria-pressed') !== -1, 'aria-pressed (переключатель)');
        assertTrue(chunk.indexOf('Итоги учёта') !== -1, 'название кнопки');
        // Task 324: вертикальная ручка УДАЛЕНА — ручки больше нет
        assertFalse(INDEX_SRC.indexOf('id="wsTotalsBar"') !== -1,
            'вертикальный бар-ручка (Task 323) удалён');
        assertFalse(INDEX_SRC.indexOf('id="wsTotalsChev"') !== -1,
            'шеврон ручки удалён');
    });

    test('HTML: #wsTotalsPanel скрыт по умолчанию; шапка — ⚠/Обновить (Task 324 → 325)', () => {
        const i = INDEX_SRC.indexOf('id="wsTotalsPanel"');
        assertTrue(i !== -1, 'панель есть');
        const chunk = INDEX_SRC.slice(i, i + 3200);
        assertTrue(chunk.indexOf('hidden') !== -1, 'панель скрыта по умолчанию');
        // Task 325: ✕ из шапки УДАЛЁН — закрытие только кнопкой тулбара
        assertFalse(chunk.indexOf('id="wsTtClose"') !== -1,
            'кнопка ✕ удалена (заявка Task 325)');
        assertFalse(chunk.indexOf('ws-tt-close') !== -1,
            'класс ✕ удалён');
        assertTrue(chunk.indexOf('id="wsTtWarn"') !== -1, 'аварийная строка ⚠');
        // Task 332 (заявка): кнопка «Обновить» из шапки УДАЛЕНА —
        // годовые данные обновляет кнопка «Обновить» тулбара
        assertFalse(chunk.indexOf('id="wsTtRefresh"') !== -1,
            'кнопка «Обновить» шапки удалена (Task 332)');
        assertFalse(chunk.indexOf('WorkSchedule.reloadTotals()') !== -1,
            'клик-обработчик удалён (Task 332)');
        assertTrue(chunk.indexOf('id="wsTtBody"') !== -1, 'тело таблиц');
        // Task 327 → 329 (заявка): кнопка «Ещё» из шапки УДАЛЕНА —
        // функционал на значке-ШЕВРОНЕ левого края (#wsTtChv)
        assertFalse(chunk.indexOf('id="wsTtMore"') !== -1,
            'кнопка «Ещё» из шапки удалена (Task 329: шеврон на краю)');
        assertTrue(chunk.indexOf('ws-tt-foot') !== -1, 'бордюрчик .ws-tt-foot (Task 327)');
        // Task 324: вкладки ПЕРЕЕХАЛИ в тулбар, инфо-строка УДАЛЕНА
        assertFalse(chunk.indexOf('id="wsTtInfo"') !== -1,
            'пояснительная инфо-строка удалена из шапки (заявка)');
        assertFalse(chunk.indexOf('ws-tt-tabs') !== -1,
            'строка вкладок из шапки удалена (вкладки — в тулбаре)');
    });

    test('HTML: Task 324 → 325 — вкладки «Месяц»/«Год» в ряду 2 итогов, действия — ряд 3', () => {
        const iBtn = INDEX_SRC.indexOf('id="wsTotalsBtn"');
        const iM = INDEX_SRC.indexOf('id="wsTtTabMonth"');
        const iY = INDEX_SRC.indexOf('id="wsTtTabYear"');
        assertTrue(iBtn !== -1 && iM !== -1 && iY !== -1, 'кнопка и вкладки есть');
        assertTrue(iBtn < iM && iM < iY,
            'вкладки СПРАВА от кнопки «Итоги учёта» (один ряд, заявка)');
        const iTot = INDEX_SRC.indexOf('id="wsTotalsRow"');
        const iAct = INDEX_SRC.indexOf('id="wsActionsRow"');
        const iGen = INDEX_SRC.indexOf('id="wsGenerateBtn"');
        const iSave = INDEX_SRC.indexOf('id="wsSaveBtn"');
        const iCancel = INDEX_SRC.indexOf('id="wsCancelBtn"');
        assertTrue(iTot !== -1 && iTot < iBtn && iY < iAct,
            'ряд 2 — Итоги учёта/Месяц/Год (Task 325)');
        assertTrue(iAct !== -1 && iAct < iGen && iGen < iSave && iSave < iCancel,
            'ряд 3 (НИЖНИЙ): Сформировать → Сохранить → Отменить — ПОД итогами (заявка Task 325)');
        assertTrue(INDEX_SRC.indexOf("WorkSchedule.setTotalsTab('month')") !== -1, 'клик Месяц');
        assertTrue(INDEX_SRC.indexOf("WorkSchedule.setTotalsTab('year')") !== -1, 'клик Год');
    });

    test('HTML: шторка в рабочей области — сетка СЛЕВА, итоги СПРАВА (Task 323)', () => {
        const iBody = INDEX_SRC.indexOf('id="wsWsBody"');
        const iGrid = INDEX_SRC.indexOf('id="wsGridWrap"');
        const iDrawer = INDEX_SRC.indexOf('id="wsTotalsDrawer"');
        const iPanel = INDEX_SRC.indexOf('id="wsTotalsPanel"');
        assertTrue(iBody !== -1, 'рабочая область #wsWsBody есть');
        assertTrue(iBody < iGrid, 'сетка внутри рабочей области');
        assertTrue(iGrid < iDrawer && iDrawer < iPanel,
            'шторка (панель) идёт ПОСЛЕ контейнера сетки — справа');
        const nextBody = INDEX_SRC.indexOf('class="page-content"', iPanel + 100);
        assertTrue(nextBody === -1 || nextBody > iPanel, 'шторка внутри страницы табеля');
    });
});

// ============================================================
// 4. CSS панели итогов
// ============================================================
describe('Task 321 — CSS: итоги в тёмной и светлой теме', () => {

    test('CSS: Task 324 — кнопка «Итоги учёта» в тулбаре, ручка удалена', () => {
        const m = INDEX_SRC.match(/\.ws-totals-btn\s*\{[^}]*\}/);
        assertTrue(!!m, 'правило кнопки есть');
        assertTrue(m[0].indexOf('cursor: pointer') !== -1, 'курсор-палец');
        assertTrue(m[0].indexOf('font-weight: 600') !== -1, 'жирная кнопка-действие');
        assertTrue(/\.ws-totals-btn\[aria-pressed="true"\]\s*\{[^}]*rgba\(74,\s*143,\s*199,\s*0\.32\)/.test(INDEX_SRC),
            'открытое состояние — синяя заливка (нажатый переключатель)');
        assertFalse(INDEX_SRC.indexOf('ws-totals-vbar') !== -1,
            'правила вертикальной ручки удалены (Task 324)');
        assertFalse(/\.ws-totals-bar\s*\{/.test(INDEX_SRC),
            'прежнего горизонтального бара больше нет');
    });

    test('CSS: шторка — ширина по столбцам, JS-маржа, анимация (Task 323→324→329)', () => {
        // Task 329 (заявка): ширина — РОВНО ПО СТОЛБЦАМ таблицы (JS
        // _fitTtDrawer в px), НЕ половина области; свёрнута — парковка
        // margin-right = −ширина ТОЖЕ JS (проценты не умеют «минус
        // собственная ширина»), открытие анимирует маржу к 0
        assertFalse(/\.ws-tt-drawer\s*\{[^}]*width:\s*50%/.test(INDEX_SRC),
            'фиксированной ширины 50% больше нет (Task 329)');
        assertFalse(/\.ws-tt-drawer\s*\{[^}]*margin-right:\s*-50%/.test(INDEX_SRC),
            'CSS-парковки -50% больше нет — маржа владеет JS');
        const dr = INDEX_SRC.match(/\.ws-tt-drawer\s*\{[^}]*transition:[^}]*margin-right[^}]*\}/);
        assertTrue(!!dr, 'анимация выдвижения (transition margin-right)');
        const cap = INDEX_SRC.match(/\.ws-tt-drawer\s*\{[^}]*max-width:\s*60%[^}]*\}/);
        assertTrue(!!cap, 'кап max-width 60% — длинные таблицы прокруткой');
        assertFalse(/#page-work-schedule\.ws-tt-open \.ws-tt-drawer\s*\{[^}]*margin-right:\s*0/.test(INDEX_SRC),
            'класс ws-tt-open маржу НЕ ставит (инлайн JS, Task 329)');
        assertTrue(/\.ws-body\s*\{[^}]*flex-direction:\s*row/.test(INDEX_SRC),
            'рабочая область — строка: сетка + шторка');
        assertTrue(/\.ws-totals-panel\[hidden\]\s*\{\s*display:\s*none/.test(INDEX_SRC),
            'атрибут hidden скрывает панель');
        assertFalse(INDEX_SRC.indexOf('max-height: 46vh') !== -1,
            'кап 46vh (Task 321) удалён');
        assertFalse(/#page-work-schedule\.ws-tt-open \.ws-grid-wrap\s*\{[^}]*display:\s*none/.test(INDEX_SRC),
            'Task 323: сетка НЕ скрывается — итоги рядом с шахматкой');
        // Task 329: JS-геометрия — парковка/анимация маржи в toggleTotals
        // Task 334: мобильная ветка страницы итогов удлинила начало
        // toggleTotals — окно поиска расширено
        const tt = INDEX_SRC.match(/toggleTotals: function\(\)[\s\S]{0,4000}?marginRight/);
        assertTrue(!!tt && INDEX_SRC.indexOf("drawer.style.marginRight = (-w0) + 'px';") !== -1,
            'открытие: парковка −ширина, затем маржа 0 (JS)');
        assertTrue(INDEX_SRC.indexOf("drawer.style.marginRight = (-w1) + 'px';") !== -1,
            'закрытие: маржа = −ширина (уезжает с контентом)');
        assertTrue(INDEX_SRC.indexOf('void drawer.offsetWidth;') !== -1,
            'фиксация стартовой позиции синхронным reflow');
    });

    test('CSS: широкий режим сетки — ползунок КАСТОМНЫЙ под бордюром (Task 323 → 331)', () => {
        // Task 331 (заявка: «не должно быть полосок вертикальной прокрутки
        // в шахматке»): нативные полосы контейнера скрыты и в широком
        // режиме (прежде Firefox scrollbar-width: thin рисовал тонкую
        // ВЕРТИКАЛЬНУЮ полоску) — ползунок внизу шахматки теперь
        // КАСТОМНЫЙ .ws-grid-hbar (зона 12px ПОД бордюром .ws-grid-foot)
        assertFalse(/#page-work-schedule\.ws-tt-gridwide \.ws-grid-wrap\s*\{[^}]*scrollbar-width:\s*thin/.test(INDEX_SRC),
            'нативная тонкая полоса из gridwide-правила УДАЛЕНА (Task 331)');
        assertFalse(/#page-work-schedule\.ws-tt-gridwide \.ws-grid-wrap::-webkit-scrollbar-thumb/.test(INDEX_SRC),
            'нативный webkit-ползунок УДАЛЁН (Task 331)');
        const hb = INDEX_SRC.match(/\.ws-grid-hbar,\n\s*\.ws-tt-hbar\s*\{[^}]*\}/);
        assertTrue(!!hb && hb[0].indexOf('height: 12px') !== -1,
            'зона ползунка 12px (.ws-grid-hbar + .ws-tt-hbar, Task 331)');
        assertTrue(/\.ws-grid-hbar\.on[\s\S]{0,120}\.ws-hbar-thumb[\s\S]{0,200}display:\s*block/.test(INDEX_SRC),
            'кастомный бегунок .ws-hbar-thumb появляется при переполнении');
        assertTrue(/\.ws-grid-col\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/.test(INDEX_SRC),
            'колонка сетки: [контейнер][бордюр][ползунок] (Task 331)');
        const g = INDEX_SRC.match(/#page-work-schedule\.ws-tt-gridwide \.ws-grid\s*\{[^}]*\}/);
        assertTrue(!!g && g[0].indexOf('width: max-content') !== -1,
            'таблица — природной ширины (дни не сжимаются)');
        assertTrue(/#page-work-schedule\.ws-tt-gridwide \.ws-grid thead th\s*\{[^}]*var\(--ws-tt-head-h,\s*38px\)/.test(INDEX_SRC),
            'шапка сетки — по высоте заголовочной зоны панели');
        assertTrue(/#page-work-schedule\.ws-tt-gridwide \.ws-grid tbody td\.ws-emp-col\s*\{[^}]*position:\s*sticky[^}]*left:\s*0/.test(INDEX_SRC),
            'колонка ФИО прилипает к левому краю при прокрутке');
    });

    test('CSS: вкладка active зелёная, «Обновить» — синий тинт', () => {
        assertTrue(/\.ws-tt-tab\.active\s*\{[^}]*#4ac771/.test(INDEX_SRC),
            'активная вкладка зелёная (как заголовок мероприятий)');
        assertTrue(/\[data-theme="light"\]\s*\.ws-tt-tab\.active\s*\{[^}]*#1d7a37/.test(INDEX_SRC),
            'светлая тема вкладки');
        // Task 332 (заявка): кнопка «Обновить» шапки удалена —
        // CSS-правил .ws-tt-refresh больше нет
        assertFalse(/\.ws-tt-refresh\s*\{/.test(INDEX_SRC),
            'CSS кнопки «Обновить» удалён (Task 332)');
    });

    test('CSS: светлая тема панели и кнопки итогов (Task 324)', () => {
        assertTrue(/\[data-theme="light"\]\s*\.ws-totals-panel\s*\{[^}]*#e9e7de/.test(INDEX_SRC),
            'фон панели в светлой теме (как окно мероприятий)');
        assertTrue(/\[data-theme="light"\]\s*\.ws-totals-btn\s*\{[^}]*rgba\(240,\s*240,\s*240,\s*0\.95\)/.test(INDEX_SRC),
            'кнопка «Итоги учёта» в светлой теме (вместо бара, Task 324)');
    });

    test('CSS: таблица итогов — sticky шапка, часы зелёные, зебра (Task 327: без Итого)', () => {
        assertTrue(/\.ws-tt-table th\s*\{[^}]*position:\s*sticky/.test(INDEX_SRC),
            'шапка таблицы липнет при скролле');
        // Task 327 (заявка): итоговая строка УДАЛЕНА — CSS-правил
        // .ws-tt-total больше нет (упоминание — только в комментариях)
        assertFalse(/\.ws-tt-total\s*(td|tr)?\s*\{/.test(INDEX_SRC),
            'CSS-правила итоговой строки удалены (заявка Task 327)');
        assertFalse(/tfoot tr\.ws-tt-total/.test(INDEX_SRC),
            'прилипающий tfoot итоговой строки удалён');
        assertTrue(/\.ws-tt-table td\.ws-tt-hours\s*\{[^}]*#4ac771/.test(INDEX_SRC),
            'часы выделены зелёным');
        // Task 381 (заявка: «фон итогов верни как был до белого»):
        // зебра строк итогов ВОССТАНОВЛЕНА, ячейки значений прозрачные
        assertTrue(/\.ws-tt-table tbody tr:nth-child\(even\)\s*\{[^}]*background/.test(INDEX_SRC),
            'зебра строк итогов восстановлена (Task 381)');
        assertFalse(/\[data-theme="light"\] \.ws-tt-table tbody td\.ws-tt-num\s*\{[^}]*#FFFFFF/.test(INDEX_SRC),
            'правила фона ячеек значений нет (Task 381: прозрачные)');
    });

    test('CSS: мобильная шторка — fixed-оверлей (Task 323 → 325: ✕ удалён)', () => {
        const m = INDEX_SRC.match(/@media \(max-width: 1023px\)\s*\{[\s\S]*?\.ws-tt-drawer\s*\{[^}]*position:\s*fixed[^}]*\}/);
        assertTrue(!!m, 'шторка — fixed-оверлей (место у сетки не отбирает)');
        // Task 325: ✕ шапки удалён — закрытие на мобиле кнопкой тулбара
        assertFalse(/\.ws-tt-close\s*\{[^}]*width:\s*44px/.test(INDEX_SRC),
            'тап-зона ✕ 44px удалена вместе с кнопкой (Task 325)');
        const tr = INDEX_SRC.match(/\.ws-tt-drawer\s*\{[^}]*transform:\s*translateX\(100%\)/);
        assertTrue(!!tr, 'мобайл: свёрнута — ПОЛНОСТЬЮ за экраном (Task 324: ручки нет)');
    });
});

// ============================================================
// 5. VM: _codeHours — карта кодов и фолбэк по названию
// ============================================================
describe('Task 321 — _codeHours: часы кодов статусов', () => {

    const fn = methodFn(WS_CLIENT, '_codeHours');

    test('карта рабочих кодов: Д/Н=12, Д8=8, Д7,2=7,2; д/н — 0 (переработка)', () => {
        assertEqual(fn.call({}, 'Д'), 12, 'Д → 12');
        assertEqual(fn.call({}, 'Н'), 12, 'Н → 12');
        // Task 322: строчные д/н — НЕ рабочее время (переработка —
        // отдельная ветка _totalsAgg, не карта часов)
        assertEqual(fn.call({}, 'д'), 0, 'д — переработка, не часы явки');
        assertEqual(fn.call({}, 'н'), 0, 'н — переработка, не часы явки');
        assertEqual(fn.call({}, 'Д8'), 8, 'Д8 → 8');
        assertEqual(fn.call({}, 'Д7,2'), 7.2, 'Д7,2 → 7,2');
    });

    test('неявки/пустые — 0 часов', () => {
        assertEqual(fn.call({}, 'ОТ'), 0, 'ОТ → 0');
        assertEqual(fn.call({}, 'Б'), 0, 'Б → 0');
        assertEqual(fn.call({}, 'И'), 0, 'И → 0');
        assertEqual(fn.call({}, '.'), 0, '· → 0');
        assertEqual(fn.call({}, ''), 0, 'пусто → 0');
    });

    test('фолбэк: часы из названия «NN-час» (вкл. дробные с запятой)', () => {
        assertEqual(fn.call({}, 'С', 'Смена (10-час)'), 10,
            'незнакомый код, 10-час в названии → 10');
        assertEqual(fn.call({}, 'Х', 'День 7,2-час (пятница)'), 7.2,
            'дробные с запятой в названии → 7,2');
        assertEqual(fn.call({}, 'Х', 'Отпуск ежегодный'), 0,
            'название без часов → 0');
    });
});

// ============================================================
// 6. VM: _totalsAgg — агрегация записей
// ============================================================
describe('Task 321 — _totalsAgg: счётчики по сотрудникам', () => {

    const host = wsHost(['_codeHours', '_totalsZero', '_totalsAgg', '_statusMeta',
                         '_empTypeMap', '_overHours'],
        { _STATUS_CODES: [
            { code: 'Д', name: 'День (12-час, 7:30–19:30)', color: '#FFE082' },
            { code: 'Д8', name: 'День 8-час (7:30–16:30)', color: '#FFF9C4' },
            { code: 'Д7,2', name: 'День 7,2-час (пятн./предпраздн.)', color: '#FFF9C4' },
            { code: 'Н', name: 'Ночь (12-час, 19:30–7:30)', color: '#B0BEC5' },
            { code: 'ОТ', name: 'Отпуск ежегодный основной', color: '#ECEFF1' },
            { code: 'Б', name: 'Больничный', color: '#F8BBD0' },
            { code: 'И', name: 'Инструктаж', color: '#B3E5FC' }
        ] });

    test('явки/дневные/ночные/часы + неявки + прочие + total', () => {
        const entries = [
            { 'дата': '2026-09-01', 'таб_номер': '0871', 'статус': 'Д' },
            { 'дата': '2026-09-02', 'таб_номер': '0871', 'статус': 'Д8' },
            { 'дата': '2026-09-03', 'таб_номер': '0871', 'статус': 'Н' },
            { 'дата': '2026-09-04', 'таб_номер': '0871', 'статус': 'Д7,2' },
            { 'дата': '2026-09-05', 'таб_номер': '0871', 'статус': 'ОТ' },
            { 'дата': '2026-09-06', 'таб_номер': '0871', 'статус': 'ОТ' },
            { 'дата': '2026-09-07', 'таб_номер': '0871', 'статус': 'Б' },
            { 'дата': '2026-09-08', 'таб_номер': '0871', 'статус': 'И' },
            { 'дата': '2026-09-09', 'таб_номер': '0871', 'статус': '.' }
        ];
        const agg = host._totalsAgg(entries, {});
        const a = agg.byTab['0871'];
        assertEqual(a.work, 4, 'явки: Д+Д8+Н+Д7,2');
        assertEqual(a.day, 3, 'дневные смены: Д, Д8, Д7,2');
        assertEqual(a.night, 1, 'ночные: Н');
        // 12 + 8 + 12 + 7.2 = 39.2
        assertTrue(Math.abs(a.hours - 39.2) < 1e-9, 'часы: 39,2');
        assertEqual(a['ОТ'], 2, 'отпуск 2 дня');
        assertEqual(a['Б'], 1, 'больничный 1 день');
        assertEqual(a.other, 2, 'прочие: И + «·»');
        assertEqual(a.total, 9, 'всего записей');
    });

    test('Task 322: д/н — ПЕРЕРАБОТКА (сменный 12, дневной — часы правки/фолбэк 8)', () => {
        const types = host._empTypeMap([
            { 'таб_номер': '0871', 'тип': 'сменный' },
            { 'таб_номер': '023', 'тип': 'дневной' },
            { 'таб_номер': '077', 'тип': '' }
        ]);
        const entries = [
            // сменный: д и н — по 12
            { 'дата': '2026-09-05', 'таб_номер': '0871', 'статус': 'д' },
            { 'дата': '2026-09-06', 'таб_номер': '0871', 'статус': 'н' },
            // дневной: д с указанными часами 7,2 и без часов (фолбэк 8)
            { 'дата': '2026-09-05', 'таб_номер': '023', 'статус': 'д', 'часы': 7.2 },
            { 'дата': '2026-09-07', 'таб_номер': '023', 'статус': 'н' },
            // без типа: фолбэк как у дневного
            { 'дата': '2026-09-05', 'таб_номер': '077', 'статус': 'д', 'часы': 4 }
        ];
        const agg = host._totalsAgg(entries, types);
        const a = agg.byTab['0871'];
        assertEqual(a.work, 0, 'сменный: д/н не явки');
        assertEqual(a.hours, 0, 'сменный: д/н не рабочие часы');
        assertEqual(a.day, 0, 'д не дневная смена');
        assertEqual(a.night, 0, 'н не ночная смена');
        assertEqual(a.overDays, 2, 'сменный: 2 дня переработки');
        assertTrue(Math.abs(a.over - 24) < 1e-9, 'сменный: 12+12=24 ч переработки');
        assertEqual(a.total, 2, 'записи считаются в Всего');

        const b = agg.byTab['023'];
        assertEqual(b.overDays, 2, 'дневной: 2 дня переработки');
        assertTrue(Math.abs(b.over - 15.2) < 1e-9, 'дневной: 7,2+8=15,2 ч');

        const c = agg.byTab['077'];
        assertEqual(c.overDays, 1, 'без типа: день переработки');
        assertTrue(Math.abs(c.over - 4) < 1e-9, 'без типа: по указанным часам 4');

        assertEqual(agg.grand.overDays, 5, 'итого: 5 дней переработки');
        assertTrue(Math.abs(agg.grand.over - 43.2) < 1e-9, 'итого: 43,2 ч');
    });

    test('grand — суммы по всем сотрудникам; пустые записи игнорируются', () => {
        const entries = [
            { 'дата': '2026-09-01', 'таб_номер': '0871', 'статус': 'Д' },
            { 'дата': '2026-09-01', 'таб_номер': '023', 'статус': 'Н' },
            { 'дата': '2026-09-01', 'таб_номер': '', 'статус': 'Д' },
            { 'дата': '2026-09-02', 'таб_номер': '0871', 'статус': 'ОТ' }
        ];
        const agg = host._totalsAgg(entries, {});
        assertEqual(agg.grand.work, 2, 'общие явки: 0871 + 023');
        assertEqual(agg.grand.night, 1, 'общие ночные: 023');
        assertEqual(agg.grand['ОТ'], 1, 'общий отпуск');
        assertEqual(agg.grand.total, 3, 'запись без таб_номера не считается');
        assertTrue(Object.keys(agg.byTab).indexOf('') === -1,
            'пустой таб не создаёт строку');
    });

    test('_totalsZero — форма счётчика (вкл. переработка Task 322)', () => {
        const z = host._totalsZero();
        ['work', 'day', 'night', 'hours', 'ОТ', 'У', 'ОВ', 'Б', 'ПР',
         'over', 'overDays', 'other', 'total']
            .forEach(function(k) {
                assertEqual(z[k], 0, 'поле ' + k + ' = 0');
            });
    });
});

// ============================================================
// 7. VM: _totalsEffectiveEntries — записи + несохранённые правки
// ============================================================
describe('Task 321 — _totalsEffectiveEntries: как ячейки сетки', () => {

    const host = wsHost(['_totalsEffectiveEntries'], {
        _ENTRIES: [
            { 'дата': '2026-09-01', 'таб_номер': '0871', 'статус': 'Д', 'источник': 'авто' },
            { 'дата': '2026-09-02', 'таб_номер': '0871', 'статус': 'Д', 'источник': 'авто' }
        ],
        _PENDING: {
            // правка поверх существующей записи
            '2026-09-02|0871': { 'статус': 'Б' },
            // запланированное удаление
            '2026-09-01|0871': { '__delete': true },
            // правка дня, которого в записях нет
            '2026-09-05|023': { 'статус': 'Д' }
        }
    });

    test('правка перекрывает, __delete исключает, новый день добавляется', () => {
        const out = host._totalsEffectiveEntries();
        assertEqual(out.length, 2, 'осталось 2 записи: 02.09 (правка) + 05.09 (новая)');
        const byKey = {};
        out.forEach(function(e) { byKey[e['дата'] + '|' + e['таб_номер']] = e; });
        assertTrue(!!byKey['2026-09-02|0871'], '02.09 жива (правка)');
        assertEqual(byKey['2026-09-02|0871']['статус'], 'Б', '02.09 — статус Б из правки');
        assertTrue(!byKey['2026-09-01|0871'], '01.09 удалена (__delete)');
        assertTrue(!!byKey['2026-09-05|023'], '05.09 добавлена (новый день)');
        assertEqual(byKey['2026-09-05|023']['таб_номер'], '023', 'новый день — таб 023');
    });
});

// ============================================================
// 8. VM: toggleTotals / setTotalsTab / reloadTotals / _renderTotalsIfOpen
// ============================================================
describe('Task 321 — панель: переключатели', () => {

    function makeToggleHost() {
        const calls = { render: 0, fit: 0, open: 0, sync: 0 };
        const panel = { hidden: true };
        // Task 323: страница табеля — классы ws-tt-open (шторка
        // выдвинута) и ws-tt-gridwide (широкий режим сетки)
        const page = {
            classList: {
                state: {},
                toggle: function(cls, on) { this.state[cls] = on; },
                add: function() { for (var i = 0; i < arguments.length; i++) this.state[arguments[i]] = true; },
                remove: function() { for (var i = 0; i < arguments.length; i++) this.state[arguments[i]] = false; },
                contains: function(cls) { return !!this.state[cls]; }
            },
            style: { props: {}, setProperty: function(k, v) { this.props[k] = v; },
                     getPropertyValue: function(k) { return this.props[k] || ''; },
                     removeProperty: function(k) { delete this.props[k]; } }
        };
        // Task 324: переключателем стала КНОПКА ТУЛБАРА (aria-pressed);
        // шеврона и ручки больше нет
        const btn = { attrs: {}, setAttribute: function(k, v) { this.attrs[k] = v; } };
        // Task 327: toggleTotals/setTotalsTab зовут _updateTtTabsVisible
        // (вкладки появляются при открытии) и _updateTtChv («Ещё»)
        const host = wsHost(['toggleTotals', 'setTotalsTab', 'reloadTotals',
                             '_renderTotals', '_renderTotalsIfOpen',
                             '_ttCloseCleanup', '_updateTtTabsVisible',
                             '_updateTtChv'],
            { _totalsOpen: false, _totalsTab: 'month', _totalsExtra: false,
              _YEAR_DATA: { year: 2026 } },
            mockDoc({ wsTotalsBtn: btn, wsTotalsPanel: panel,
                      'page-work-schedule': page,
                      wsTtTabMonth: { hidden: true, classList: { state: {}, toggle: function(c, o) { this.state[c] = o; } } },
                      wsTtTabYear: { hidden: true, classList: { state: {}, toggle: function(c, o) { this.state[c] = o; } } },
                      wsTtChv: { hidden: true, attrs: {}, setAttribute: function(k, v) { this.attrs[k] = v; }, classList: { state: {}, toggle: function(c, o) { this.state[c] = o; } } },
                      wsTtRefresh: { hidden: false } }));
        host._renderTotals = function() { calls.render++; };
        host._fitGrid = function() { calls.fit++; };
        host._renderTotalsMonth = function() { calls.render++; };
        host._renderTotalsYear = function() {};
        // Task 323: новые шаги toggleTotals — заглушки
        host._applyTtHeadVar = function() { return false; };
        host._syncTotalsRows = function() { calls.sync++; };
        return { host: host, btn: btn, panel: panel, page: page, calls: calls };
    }

    test('toggleTotals: открыть → панель видна, aria true, классы, fitGrid', () => {
        const t = makeToggleHost();
        t.host.toggleTotals();
        assertEqual(t.panel.hidden, false, 'панель открылась');
        assertEqual(t.btn.attrs['aria-pressed'], 'true', 'aria-pressed=true (кнопка тулбара)');
        // Task 323: классы вида на странице — шторка выдвинута + широкий
        // режим сетки (ползунок прокрутки внизу шахматки)
        assertEqual(t.page.classList.state['ws-tt-open'], true,
            'класс ws-tt-open на странице табеля');
        assertEqual(t.page.classList.state['ws-tt-gridwide'], true,
            'класс ws-tt-gridwide — сетка в широком режиме');
        assertEqual(t.calls.render, 1, 'итоги отрисованы');
        assertEqual(t.calls.fit, 1, 'строки сетки пересчитаны (_fitGrid)');
        assertEqual(t.calls.sync, 1, 'строки итогов синхронизированы');
        // закрыть
        t.host.toggleTotals();
        // Task 329: панель прячется ПОСЛЕ анимации (шторка уезжает
        // С КОНТЕНТОМ, уборка _ttCloseCleanup по таймеру 320 мс)
        assertEqual(t.panel.hidden, false, 'панель едет с контентом (Task 329)');
        assertEqual(t.btn.attrs['aria-pressed'], 'false', 'aria-pressed=false');
        assertEqual(t.page.classList.state['ws-tt-open'], false,
            'класс шторки снят — она уехала вправо');
        // сетка держит широкий режим до конца анимации (снимает
        // отложенная уборка _ttCloseCleanup)
        assertEqual(t.page.classList.state['ws-tt-gridwide'], true,
            'широкий режим держится во время анимации закрытия');
        t.host._ttCloseCleanup();
        assertEqual(t.page.classList.state['ws-tt-gridwide'], false,
            'после уборки — сетка в обычном виде');
        assertEqual(t.panel.hidden, true, 'панель спрятана уборкой (Task 329)');
        assertEqual(t.calls.fit >= 2, true, 'fitGrid и при закрытии');
    });

    test('setTotalsTab: год — активна вкладка года, «Обновить» видна', () => {
        const t = makeToggleHost();
        t.host._totalsOpen = true;
        t.host.setTotalsTab('year');
        assertEqual(t.host._totalsTab, 'year', 'вкладка = год');
        const refresh = mockDoc().getElementById; // (не используется)
        t.host.setTotalsTab('month');
        assertEqual(t.host._totalsTab, 'month', 'возврат на месяц');
    });

    test('setTotalsTab: «Обновить» из шапки УДАЛЁН (Task 332), вкладки живут', () => {
        // Task 332 (заявка): кнопка «Обновить» шапки шторки удалена —
        // годовые данные обновляет кнопка «Обновить» тулбара
        // (loadGrid(true) сбрасывает _YEAR_DATA, Task 321);
        // setTotalsTab больше НЕ управляет никакой кнопкой обновления
        assertFalse(INDEX_SRC.indexOf('id="wsTtRefresh"') !== -1,
            'кнопки #wsTtRefresh нет в HTML');
        const methodSrc = methodText(WS_CLIENT, 'setTotalsTab');
        assertFalse(methodSrc.indexOf('wsTtRefresh') !== -1,
            'setTotalsTab не читает wsTtRefresh (Task 332)');
        const monthTab = { hidden: false, classList: { state: {}, toggle: function(c, o) { this.state[c] = o; } } };
        const yearTab = { hidden: false, classList: { state: {}, toggle: function(c, o) { this.state[c] = o; } } };
        const host = wsHost(['setTotalsTab', '_updateTtTabsVisible', '_updateTtChv'],
            { _totalsTab: 'month', _totalsOpen: true, _totalsExtra: false },
            mockDoc({ wsTtTabMonth: monthTab, wsTtTabYear: yearTab,
                      wsTtChv: { hidden: false, attrs: {}, setAttribute: function(k, v) { this.attrs[k] = v; }, classList: { state: {}, toggle: function() {} } } }));
        host._renderTotals = function() {};
        host.setTotalsTab('year');
        assertEqual(host._totalsTab, 'year', 'вкладка года активна');
        assertEqual(yearTab.classList.state.active, true, 'год — active');
        assertEqual(monthTab.classList.state.active, false, 'месяц — не active');
    });

    test('reloadTotals: годовой кэш сбрасывается, перерисовка', () => {
        const calls = { render: 0 };
        const host = wsHost(['reloadTotals', '_renderTotals'],
            { _totalsOpen: true, _totalsTab: 'year', _YEAR_DATA: { year: 2026 } });
        host._renderTotals = function() { calls.render++; };
        host.reloadTotals();
        assertEqual(host._YEAR_DATA, null, 'кэш года сброшен');
        assertEqual(calls.render, 1, 'итоги перерисованы');
    });

    test('_renderTotalsIfOpen: закрытая панель не рендерится', () => {
        const calls = { render: 0 };
        const host = wsHost(['_renderTotalsIfOpen', '_renderTotals'], { _totalsOpen: false });
        host._renderTotals = function() { calls.render++; };
        host._renderTotalsIfOpen();
        assertEqual(calls.render, 0, 'панель закрыта — рендера нет');
        host._totalsOpen = true;
        host._renderTotalsIfOpen();
        assertEqual(calls.render, 1, 'панель открыта — рендер есть');
    });

    test('JS: _renderGrid вызывает _renderTotalsIfOpen (живое обновление)', () => {
        const rg = methodText(WS_CLIENT, '_renderGrid');
        assertTrue(rg.indexOf('this._renderTotalsIfOpen();') !== -1,
            'перерисовка сетки обновляет и итоги (правки/«Обновить»)');
    });

    test('JS: loadGrid(force) сбрасывает годовой кэш и синхронизирует месяц', () => {
        const lg = methodText(WS_CLIENT, 'loadGrid');
        // Task 440: force сбрасывает и кэш года, и пул соседних
        // годов отпусков (навигация блока «Отпуска»)
        assertTrue(lg.indexOf('this._YEAR_DATA = null;') !== -1 &&
                   lg.indexOf('this._VAC_YEARS = {};') !== -1,
            'принудительное обновление сбрасывает кэш года и пул годов отпусков');
        assertTrue(lg.indexOf('_YEAR_DATA.months[self._month] = self._ENTRIES') !== -1,
            'свежий месяц попадает в годовой кэш без новой сети');
    });
});

// ============================================================
// 9. VM: _renderTotalsMonth — таблица месяца
// ============================================================
describe('Task 321 — _renderTotalsMonth: таблица месяца', () => {

    const MONTH_METHODS = ['_codeHours', '_totalsZero', '_totalsAgg', '_statusMeta',
                           '_empTypeMap', '_overHours',
                           '_totalsEffectiveEntries', '_fmtTotalsNum', '_esc',
                           '_setTtWarn', '_renderTotalsMonth'];

    function makeMonthHost(extra) {
        const els = {
            // Task 327: рендер месяца зовёт body.querySelector (min-width)
            wsTtBody: { innerHTML: '', querySelector: function() { return null; } },
            // Task 324: инфо-строка wsTtInfo УДАЛЕНА — вместо неё
            // аварийная строка ⚠ шапки (пустая на месяце)
            wsTtWarn: { textContent: '', hidden: true, attrs: {},
                        setAttribute: function(k, v) { this.attrs[k] = v; } }
        };
        const host = wsHost(MONTH_METHODS, Object.assign({
            _year: 2026,
            _month: 9,
            // Task 323: рендер звёт _applyTtHeadVar/_fitGrid/_syncTotalsRows
            _applyTtHeadVar: function() { return false; },
            _fitGrid: function() {},
            _syncTotalsRows: function() {},
            _EMPLOYEES: [
                { 'таб_номер': '0871', 'ФИО': 'Иванов И.И.', 'тип': 'сменный' },
                { 'таб_номер': '023', 'ФИО': 'Петров П.П.', 'тип': 'дневной' }
            ],
            _ENTRIES: [
                { 'дата': '2026-09-01', 'таб_номер': '0871', 'статус': 'Д' },
                { 'дата': '2026-09-02', 'таб_номер': '0871', 'статус': 'Н' },
                { 'дата': '2026-09-03', 'таб_номер': '023', 'статус': 'Д8' },
                { 'дата': '2026-09-04', 'таб_номер': '023', 'статус': 'Д8' }
            ],
            _PENDING: {},
            _STATUS_CODES: [
                { code: 'Д', name: 'День (12-час, 7:30–19:30)', color: '#FFE082' },
                { code: 'Д8', name: 'День 8-час (7:30–16:30)', color: '#FFF9C4' },
                { code: 'Н', name: 'Ночь (12-час, 19:30–7:30)', color: '#B0BEC5' }
            ]
        }, extra || {}), mockDoc(els));
        return { host: host, els: els };
    }

    test('таблица: строки сотрудников, значения, итог, формат часов, СЛОВА в шапке', () => {
        const t = makeMonthHost();
        t.host._renderTotalsMonth();
        const h = t.els.wsTtBody.innerHTML;
        assertTrue(h.indexOf('ws-tt-table') !== -1, 'таблица итогов');
        assertTrue(h.indexOf('Иванов И.И.') !== -1, 'строка Иванова');
        assertTrue(h.indexOf('Петров П.П.') !== -1, 'строка Петрова');
        assertTrue(h.indexOf('ws-tt-tabno') !== -1 && h.indexOf('0871') !== -1,
            'табельный номер в строке');
        assertTrue(h.indexOf('>24</td>') !== -1, 'часы Иванова: 12+12=24');
        assertTrue(h.indexOf('>16</td>') !== -1, 'часы Петрова: 8+8=16');
        // Task 327 (заявка): строки Итого и столбца «Всего» НЕТ
        assertFalse(h.indexOf('Итого по подразделению') !== -1, 'строки Итого нет (заявка)');
        assertFalse(h.indexOf('ws-tt-total') !== -1, 'класса итоговой строки нет');
        assertFalse(h.indexOf('<th>Всего</th>') !== -1, 'столбца «Всего» нет (заявка)');
        assertFalse(h.indexOf('<tfoot>') !== -1, 'tfoot не рендерится (заявка)');
        // Task 327 (заявка): ОСНОВНЫЕ столбцы — Явки, Часы,
        // Переработка (порядок задан), доп. — скрыты до шеврона;
        // Task 329: у th — класс ШИРИНЫ ws-tt-c-* (узкие столбцы)
        const iY = h.indexOf('<th class="ws-tt-c-work">Явки (дни)</th>');
        const iCh = h.indexOf('<th class="ws-tt-c-hours">Часы</th>');
        const iP = h.indexOf('<th class="ws-tt-c-over">Переработка (дни)</th>');
        assertTrue(iY !== -1 && iCh !== -1 && iP !== -1 &&
                   iY < iCh && iCh < iP,
            'основные: Явки → Часы → Переработка (порядок — заявка, классы ширин Task 329)');
        // дополнительные столбцы скрыты (шеврон левого края)
        assertFalse(h.indexOf('<th class="ws-tt-c-day">День (Д)</th>') !== -1, 'День (Д) скрыт до шеврона');
        assertFalse(h.indexOf('<th class="ws-tt-c-ov">Отгул (ОВ)</th>') !== -1, 'Отгул (ОВ) скрыт до шеврона');
        assertTrue(h.indexOf('ws-tt-over') !== -1, 'класс колонки переработки');
    });

    test('таблица: д/н — колонка переработки В ДНЯХ (Task 329), часы в тултипе', () => {
        const t = makeMonthHost({
            _ENTRIES: [
                { 'дата': '2026-09-01', 'таб_номер': '0871', 'статус': 'Д' },
                { 'дата': '2026-09-05', 'таб_номер': '0871', 'статус': 'д' },
                { 'дата': '2026-09-03', 'таб_номер': '023', 'статус': 'Д8' },
                { 'дата': '2026-09-06', 'таб_номер': '023', 'статус': 'д', 'часы': 7.2 }
            ]
        });
        t.host._renderTotalsMonth();
        const h = t.els.wsTtBody.innerHTML;
        // Иванов (сменный): явки 1 (Д), часы 12, переработка 1 день (д)
        // Петров (дневной): явки 1 (Д8), часы 8, переработка 1 день (д)
        assertTrue(h.indexOf('ws-tt-over') !== -1, 'колонка переработки есть');
        // Task 329 (заявка: «не в часах, а в ДНЯХ»): значение — дни
        // (по 1 у обоих), ЧАСЫ — в тултипе ячейки
        assertTrue(h.indexOf('часов переработки: 12') !== -1,
            'тултип с ЧАСАМИ переработки (сменный 12)');
        assertTrue(h.indexOf('часов переработки: 7,2') !== -1,
            'тултип с часами дневного 7,2');
        assertTrue(/ws-tt-over[^>]*>1<\/td>/.test(h),
            'значение — ДНИ: по 1 дню у обоих');
        assertFalse(/ws-tt-over[^>]*>12<\/td>/.test(h),
            'часов в ЗНАЧЕНИИ переработки больше нет (заявка Task 329)');
        assertFalse(/ws-tt-over[^>]*>7,2<\/td>/.test(h),
            'дробных часов в значении переработки нет');
        // Task 327: итоговой строки нет — только строки сотрудников
        assertFalse(h.indexOf('>19,2</td>') !== -1, 'итоговой строки нет (заявка)');
    });

    test('Task 324: пояснительная инфо-строка УДАЛЕНА — ⚠ пуст', () => {
        // мок ProdCalendar в глобальной области видимости VM: даже при
        // наличии календаря и правок инфо в шапку НЕ пишется (заявка)
        global.ProdCalendar = {
            monthStats: function(y, m) {
                return { workDays: 22, hours40: 176 };
            }
        };
        try {
            const t = makeMonthHost({ _PENDING: { '2026-09-05|0871': { 'статус': 'Б' } } });
            t.host._renderTotalsMonth();
            assertEqual(t.els.wsTtWarn.textContent, '', '⚠ пуст — инфо удалена (заявка)');
            assertEqual(t.els.wsTtWarn.hidden, true, '⚠ скрыта на месяце');
            assertFalse(INDEX_SRC.indexOf('id="wsTtInfo"') !== -1,
                'элемент #wsTtInfo удалён из HTML');
            assertFalse(methodText(WS_CLIENT, '_renderTotalsMonth').indexOf('wsTtInfo') !== -1,
                'рендер месяца не пишет инфо-строку');
        } finally {
            delete global.ProdCalendar;
        }
    });

    test('рендер без ProdCalendar/инфо — не падает, таблица строится', () => {
        const t = makeMonthHost();
        t.host._renderTotalsMonth();
        assertEqual(t.els.wsTtWarn.textContent, '', '⚠ пуст');
        assertTrue(t.els.wsTtBody.innerHTML.indexOf('ws-tt-table') !== -1,
            'таблица построена');
    });

    test('нет сотрудников — понятное пустое сообщение', () => {
        const t = makeMonthHost({ _EMPLOYEES: [] });
        t.host._renderTotalsMonth();
        assertTrue(t.els.wsTtBody.innerHTML.indexOf('Нет активных работников') !== -1,
            'пустое состояние (Task 385: работники)');
    });

    test('_fmtTotalsNum: запятая вместо точки', () => {
        const fn = methodFn(WS_CLIENT, '_fmtTotalsNum');
        assertEqual(fn.call({}, 39.2), '39,2', 'дробные — запятая');
        assertEqual(fn.call({}, 132), '132', 'целые без дробной части');
        assertEqual(fn.call({}, 0), '0', 'ноль');
    });
});

// ============================================================
// 10. VM: год — загрузка и таблица
// ============================================================
describe('Task 321 — год: _loadYearData / _renderTotalsYear / таблица', () => {

    const YEAR_METHODS = ['_codeHours', '_totalsZero', '_totalsAgg', '_statusMeta',
                          '_empTypeMap', '_overHours',
                          '_fmtTotalsNum', '_esc', '_sortEmployees',
                          '_loadYearData', '_renderTotalsYear', '_setTtWarn',
                          '_renderTotalsYearTable'];

    function makeYearHost(apiMock, yearData) {
        const els = {
            wsTtBody: { innerHTML: '', querySelector: function() { return null; } },
            // Task 324: инфо-строка удалена — аварийная строка ⚠
            wsTtWarn: { textContent: '', hidden: true, attrs: {},
                        setAttribute: function(k, v) { this.attrs[k] = v; } }
        };
        const host = wsHost(YEAR_METHODS, Object.assign({
            _year: 2026,
            _month: 9,
            // Task 323: рендер звёт _applyTtHeadVar/_fitGrid/_syncTotalsRows
            _applyTtHeadVar: function() { return false; },
            _fitGrid: function() {},
            _syncTotalsRows: function() {},
            _EMPLOYEES: [{ 'таб_номер': '0871', 'ФИО': 'Иванов И.И.' }],
            _STATUS_CODES: [
                { code: 'Д', name: 'День (12-час)', color: '#FFE082' },
                { code: 'Н', name: 'Ночь (12-час)', color: '#B0BEC5' }
            ],
            _api: apiMock
        }, yearData || {}), mockDoc(els));
        return { host: host, els: els };
    }

    function apiMockOk(entriesPerMonth) {
        const calls = { entries: 0, employees: 0, entryMonths: [] };
        return {
            calls: calls,
            fn: function(action, payload) {
                if (action === 'workSchedule.listEntries') {
                    calls.entries++;
                    calls.entryMonths.push(payload.month);
                    return Promise.resolve({ entries: entriesPerMonth[payload.month] || [] });
                }
                if (action === 'workSchedule.listEmployees') {
                    calls.employees++;
                    assertEqual(payload.includeArchived, true,
                        'годовой итог — справочник с архивом');
                    return Promise.resolve({ employees: [
                        { 'таб_номер': '0871', 'ФИО': 'Иванов И.И.' },
                        { 'таб_номер': '055', 'ФИО': 'Сидоров С.С.', 'в_архиве': 1 }
                    ] });
                }
                return Promise.reject(new Error('unexpected ' + action));
            }
        };
    }

    test('_loadYearData: 12 listEntries + 1 listEmployees, кэш, months 1..12', async () => {
        const api = apiMockOk({});
        const t = makeYearHost(api.fn);
        const data = await t.host._loadYearData(2026);
        assertEqual(api.calls.entries, 12, '12 запросов записей');
        assertEqual(api.calls.employees, 1, '1 запрос справочника');
        for (var m = 1; m <= 12; m++) {
            assertTrue(Array.isArray(data.months[m]), 'месяц ' + m + ' — массив');
        }
        assertEqual(data.year, 2026, 'год в кэше');
        assertEqual(data.failed, 0, 'сбоев нет');
        assertEqual(t.host._YEAR_DATA, data, 'кэш записан в _YEAR_DATA');
    });

    test('_loadYearData: сбой месяца — failed, месяц пустой, промис не падает', async () => {
        const calls = { n: 0 };
        const api = {
            fn: function(action, payload) {
                if (action === 'workSchedule.listEntries') {
                    calls.n++;
                    // сентябрь (текущий месяц) и март — «сбой сети»
                    if (payload.month === 3 || payload.month === 9) {
                        return Promise.reject(new Error('net'));
                    }
                    return Promise.resolve({ entries: [] });
                }
                return Promise.resolve({ employees: [] });
            }
        };
        const t = makeYearHost(api.fn);
        const data = await t.host._loadYearData(2026);
        assertEqual(data.failed, 2, 'два месяца не загрузились');
        assertEqual(data.months[3].length, 0, 'март — пустой список');
        assertEqual(data.months[9].length, 0, 'сентябрь — пустой список');
    });

    test('_renderTotalsYear без данных: лоадер, загрузка, затем таблица', async () => {
        const api = apiMockOk({
            1: [ { 'дата': '2026-01-05', 'таб_номер': '0871', 'статус': 'Д' } ],
            9: [ { 'дата': '2026-09-01', 'таб_номер': '0871', 'статус': 'Н' },
                 { 'дата': '2026-09-02', 'таб_номер': '0871', 'статус': 'Д' } ]
        });
        const t = makeYearHost(api.fn, { _YEAR_DATA: null });
        t.host._renderTotalsYear();
        assertTrue(t.els.wsTtBody.innerHTML.indexOf('Загрузка данных за 2026') !== -1,
            'лоадер показан');
        await new Promise(function(r) { setTimeout(r, 0); });
        const h = t.els.wsTtBody.innerHTML;
        assertTrue(h.indexOf('ws-tt-table') !== -1, 'таблица года построена');
        assertTrue(h.indexOf('1/12') !== -1, 'январь: 1 день/12 часов');
        assertTrue(h.indexOf('2/24') !== -1, 'сентябрь: 2 дня/24 часа');
        // Task 327 (заявка): итоговой строки в годе больше нет
        assertFalse(h.indexOf('Итого по подразделению') !== -1,
            'итоговой строки нет (заявка Task 327)');
    });

    test('_renderTotalsYearTable: 12 колонок, архив, суммы, формат д/ч', () => {
        const md = {
            year: 2026, ts: Date.now(), failed: 0,
            months: { 1: [ { 'дата': '2026-01-05', 'таб_номер': '0871', 'статус': 'Д' } ],
                      2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [],
                      9: [ { 'дата': '2026-09-01', 'таб_номер': '0871', 'статус': 'Н' } ],
                      10: [], 11: [], 12: [] },
            employees: [
                { 'таб_номер': '0871', 'ФИО': 'Иванов И.И.' },
                { 'таб_номер': '055', 'ФИО': 'Сидоров С.С.', 'в_архиве': 1 }
            ]
        };
        const t = makeYearHost(null, { _YEAR_DATA: md });
        t.host._renderTotalsYearTable();
        const h = t.els.wsTtBody.innerHTML;
        // 12 колонок месяцев в шапке
        ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']
            .forEach(function(abbr) {
                assertTrue(h.indexOf('<th>' + abbr + '</th>') !== -1,
                    'колонка ' + abbr);
            });
        assertTrue(h.indexOf('1/12') !== -1, 'январь Иванова: 1/12');
        assertTrue(h.indexOf('1/12') !== -1 && h.indexOf('—') !== -1,
            'пустые месяцы — прочерк');
        // Task 333 (заявка: «Архив в годовой таблице всё же нужен»):
        // ГЛАВНАЯ таблица — снова с колонкой «Сотрудник» (мобайл;
        // десктоп CSS прячет .ws-tt-year:not(.ws-tt-arch)), активный
        // Иванов — строкой сетки; АРХИВ — ОТДЕЛЬНЫМ БЛОКОМ ПОД
        // таблицей: подпись .ws-tt-arch-cap + таблица .ws-tt-arch
        // (Сидоров, своя колонка «Сотрудник» на любом экране)
        // Task 335: текст шапки — в span.ws-tt-emp-head («Сотр» при сужении)
        assertTrue(h.indexOf('<th class="ws-tt-emp" rowspan="2"><span class="ws-tt-emp-head"') !== -1 &&
            h.indexOf('data-full="Работник"') !== -1,
            'главная таблица: шапка с «Работником» (Task 333, мобайл; Task 385: работник; Task 401: rowspan=2)');
        assertTrue(h.indexOf('Иванов И.И.') !== -1,
            'активный Иванов — строка главной таблицы (Task 333)');
        assertTrue(h.indexOf('ws-tt-arch-cap') !== -1 && h.indexOf('>Архив</div>') !== -1,
            'подпись «Архив» под таблицей (Task 333)');
        assertTrue(h.indexOf('ws-tt-year ws-tt-arch') !== -1,
            'таблица архива — класс ws-tt-arch (Task 333)');
        assertTrue(h.indexOf('Сидоров С.С.') !== -1,
            'архивный Сидоров — в блоке архива (Task 333)');
        assertEqual((h.match(/<tr>/g) || []).length, 6,
            '6 <tr>: шапка+подстрока+Иванов (главная) + шапка+подстрока+Сидоров (архив) — Task 401');
        assertTrue(h.indexOf('<th class="ws-tt-sum ws-tt-sum-edge" rowspan="2">Дней</th>') !== -1 &&
            h.indexOf('<th class="ws-tt-sum" rowspan="2">Часов</th>') !== -1,
            'годовые суммы: колонки Дней/Часов (Task 401: rowspan=2 + итоговый фон)');
        assertTrue(h.indexOf('<th class="ws-tt-sum" rowspan="2" title="дни переработки за год — коды д/н">Перераб. (дни)</th>') !== -1,
            'Task 322 → 329 → 331: годовая колонка Перераб. (дни, тултип; Task 401: класс+rowspan)');
        // Task 324: пояснительная инфо («N г. · явки/часы…») УДАЛЕНА
        assertEqual(t.els.wsTtWarn.textContent, '', '⚠ пуст — без сбоев');
        assertEqual(t.els.wsTtWarn.hidden, true, '⚠ скрыта');
    });

    test('_renderTotalsYearTable: годовая ПЕРЕРАБОТКА д/н В ДНЯХ (Task 322 → 329)', () => {
        const md = {
            year: 2026, ts: Date.now(), failed: 0,
            months: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [],
                      9: [ { 'дата': '2026-09-05', 'таб_номер': '0871', 'статус': 'д' } ],
                      10: [], 11: [], 12: [] },
            employees: [
                { 'таб_номер': '0871', 'ФИО': 'Иванов И.И.', 'тип': 'сменный' }
            ]
        };
        const t = makeYearHost(null, { _YEAR_DATA: md });
        t.host._renderTotalsYearTable();
        const h = t.els.wsTtBody.innerHTML;
        assertTrue(h.indexOf('ws-tt-over') !== -1, 'колонка переработки');
        // Task 329 (заявка): годовая переработка — в ДНЯХ (1),
        // часы (сменный 12) — в тултипе ячейки
        assertTrue(/ws-tt-over[^>]*>1<\/td>/.test(h), 'годовая переработка: 1 день');
        assertTrue(h.indexOf('часов переработки: 12') !== -1, 'часы — в тултипе');
        assertFalse(h.indexOf('>12</td>') !== -1, 'часов в значении нет (заявка)');
    });

    test('_renderTotalsYearTable: failed-месяцы — ⚠ в шапке (Task 324)', () => {
        const md = {
            year: 2026, ts: Date.now(), failed: 2,
            months: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [],
                      9: [], 10: [], 11: [], 12: [] },
            employees: [{ 'таб_номер': '0871', 'ФИО': 'Иванов И.И.' }]
        };
        const t = makeYearHost(null, { _YEAR_DATA: md });
        t.host._renderTotalsYearTable();
        assertTrue(t.els.wsTtWarn.textContent.indexOf('не загружено месяцев: 2') !== -1,
            'предупреждение о неполных данных');
        assertEqual(t.els.wsTtWarn.hidden, false, '⚠ показана');
        assertEqual(t.els.wsTtWarn.attrs['title'], t.els.wsTtWarn.textContent,
            'полный текст — в тултипе');
    });

    test('_renderTotalsYear: год кэша ≠ текущий — загрузка заново', async () => {
        const api = apiMockOk({});
        const t = makeYearHost(api.fn, { _YEAR_DATA: { year: 2025, months: {}, employees: [] } });
        t.host._renderTotalsYear();
        assertTrue(t.els.wsTtBody.innerHTML.indexOf('Загрузка') !== -1,
            'кэш другого года — перезагрузка');
        await new Promise(function(r) { setTimeout(r, 0); });
        assertEqual(t.host._YEAR_DATA.year, 2026, 'кэш заменён на 2026');
    });
});

// ============================================================
// 11. SW: версия кэша
// ============================================================
describe('Task 321 — SW: версия кэша', () => {
    test('SW: кэш поднят до kipia-test-v735 (Task 323)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v735'") !== -1,
            'CACHE_VERSION = kipia-test-v735');
        assertFalse(SW_SRC.indexOf('kipia-test-v736') !== -1,
            'v561 не существует (один инкремент на Task 321)');
    });
});
