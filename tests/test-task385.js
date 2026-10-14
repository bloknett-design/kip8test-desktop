// tests/test-task385.js
// Task 385 — заявка пользователя (три части):
//   1) «В баре с кнопками добавь кнопку при нажатии на которую
//      справа будет выезжать окно с подробным описанием всех
//      сокращений в шахматке табеля, по такому же принципу, как это
//      реализовано с окном итогов учёта» — кнопка «Легенда» (ряд 2),
//      шторка #wsLegendDrawer (десктоп margin-right / мобайл
//      fixed), контент — коды дней Т-12/Т-13 + коды мероприятий из
//      «Коды_статусов» + обозначения; взаимоисключающая с итогами.
//   2) «В разделе Табель учёта рабочего времени, переименуй все
//      упоминания слова сотрудник на слово работник (в том числе в
//      разных склонениях)» — видимые строки UI (шапки, шторки,
//      тосты, подтверждения, печать, подсказки).
//   3) «У пользователей, у которых есть доступ к редактированию
//      данных в табеле, при открытии информации о сотруднике, в
//      окне с информацией убери все кнопки связанные с
//      редактированием и внесением данных, а вместо них, в баре с
//      кнопками, добавь кнопку для перехода на страницу с полными
//      карточками работников, где будет возможность внесения и
//      редактирования данных по каждому работнику, и в том числе
//      добавление мероприятий» — карточка шахматки read-only для
//      ВСЕХ; кнопка «Работники» (ряд 1, редакторам) + заголовок
//      «Работник +» → страница #page-ws-workers с полными
//      карточками (_renderWorkerCard withEdit).
//
// Запуск: через tests/run-all.js (require './test-task385.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Извлечение метода объекта (баланс фигурных скобок) — паттерн
// test-task384.js
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
// 1. HTML: кнопки, шторка легенды, страница «Работники», шторки
// ============================================================
describe('Task 385 — HTML: легенда/страница/переименование', () => {

    test('HTML: кнопка «Обозначения» в ряду 2 (после вкладки «Год»)', () => {
        const iYear = INDEX_SRC.indexOf('id="wsTtTabYear"');
        const iLeg = INDEX_SRC.indexOf('id="wsLegendBtn"');
        assertTrue(iYear !== -1 && iLeg !== -1 && iYear < iLeg,
            'кнопка «Обозначения» после вкладок итогов');
        const chunk = INDEX_SRC.slice(iLeg - 200, iLeg + 400);
        assertTrue(chunk.indexOf('WorkSchedule.toggleLegend()') !== -1,
            'onclick → toggleLegend');
        assertTrue(chunk.indexOf('aria-pressed="false"') !== -1,
            'кнопка-переключатель (aria-pressed)');
        assertTrue(chunk.indexOf('>Обозначения</button>') !== -1,
            'текст «Обозначения» (Task 386: «словом попроще»)');
    });

    test('HTML: кнопка «Работники» в ряду 1 (после «Печать», hidden)', () => {
        const iPrint = INDEX_SRC.indexOf('id="wsPrintBtn"');
        const iWork = INDEX_SRC.indexOf('id="wsWorkersBtn"');
        assertTrue(iPrint !== -1 && iWork !== -1 && iPrint < iWork,
            'кнопка «Работники» после «Печать» (ряд 1)');
        const chunk = INDEX_SRC.slice(iWork - 100, iWork + 900);
        assertTrue(chunk.indexOf('WorkSchedule.openWorkersPage()') !== -1,
            'onclick → openWorkersPage');
        assertTrue(chunk.indexOf(' hidden') !== -1,
            'скрыта по умолчанию (показ — _onRoleUpdate по _canEdit)');
        assertTrue(chunk.indexOf('>Работники</button>') !== -1,
            'текст «Работники»');
    });

    test('HTML: шторка «Обозначения» — структура + шеврон (Task 386)', () => {
        const iDrawer = INDEX_SRC.indexOf('id="wsTotalsDrawer"');
        const iLegend = INDEX_SRC.indexOf('id="wsLegendDrawer"');
        assertTrue(iDrawer !== -1 && iLegend !== -1 && iDrawer < iLegend,
            'шторка легенды рядом с итогами (общая рабочая область)');
        const chunk = INDEX_SRC.slice(iLegend - 100, iLegend + 1500);
        assertTrue(chunk.indexOf('ws-legend-drawer') !== -1, 'класс ws-legend-drawer');
        assertTrue(chunk.indexOf('ws-legend-inner') !== -1, 'внутренняя панель');
        assertTrue(chunk.indexOf('id="wsLegendBody"') !== -1, 'тело контента #wsLegendBody');
        assertTrue(chunk.indexOf('ws-lg-edge') !== -1, 'левый бортик');
        assertTrue(chunk.indexOf('>Обозначения</div>') !== -1,
            'заголовок шторки «Обозначения» (Task 386)');
        assertTrue(chunk.indexOf('id="wsLgChv"') !== -1 &&
                   chunk.indexOf('toggleLegendWide()') !== -1,
            'значок-шеврон на левом крае — разворот шире (Task 386)');
        assertTrue(chunk.indexOf('aria-label="Показать подробные наименования кодов"') !== -1,
            'aria-подпись шеврона');
    });

    test('HTML: CSS шторки — десктоп margin+width; мобайл — страница', () => {
        const iCss = INDEX_SRC.indexOf('.ws-legend-drawer {');
        assertTrue(iCss !== -1, 'CSS-блок .ws-legend-drawer есть');
        const chunk = INDEX_SRC.slice(iCss, iCss + 700);
        assertTrue(chunk.indexOf('transition: margin-right 0.28s ease, width 0.28s ease') !== -1,
            'десктоп: margin + width-анимация (Task 386: два вида)');
        assertTrue(INDEX_SRC.indexOf('.ws-legend-drawer { display: none; }') !== -1,
            'мобайл: шторка гасится (Task 386 — отдельная страница ws-legend)');
        assertTrue(INDEX_SRC.indexOf('ws-legend-open') === -1,
            'класс ws-legend-open удалён (мобильного оверлея нет)');
        assertTrue(INDEX_SRC.indexOf('.ws-lg-page-body') !== -1,
            'CSS тела мобильной страницы «Обозначения»');
    });

    test('HTML: страница «Работники» — шапка/кнопка «+»/тело', () => {
        const iPage = INDEX_SRC.indexOf('id="page-ws-workers"');
        assertTrue(iPage !== -1, 'страница #page-ws-workers существует');
        const chunk = INDEX_SRC.slice(iPage, iPage + 900);
        assertTrue(chunk.indexOf('>Работники</div>') !== -1, 'заголовок «Работники»');
        // Task 389: кнопка «Добавить работника» ПЕРЕНЕСЕНА из шапки
        // страницы на «Общую» вкладку (рендерит _renderWorkersGeneral)
        assertTrue(chunk.indexOf('id="wsWorkersAddBtn"') === -1,
            'кнопки добавления в шапке страницы НЕТ (Task 389)');
        assertTrue(INDEX_SRC.indexOf('WorkSchedule.openEmployeeForm()') !== -1,
            'кнопка → шторка создания (openEmployeeForm)');
        assertTrue(INDEX_SRC.indexOf('>Добавить работника</button>') !== -1,
            'текст «Добавить работника» (Task 386: прежде значок «+»)');
        assertTrue(chunk.indexOf('id="wsWorkersBody"') !== -1, 'тело #wsWorkersBody');
        assertTrue(INDEX_SRC.indexOf('aria-label="Добавить работника"') !== -1,
            'aria-подпись кнопки');
    });

    test('HTML: переименование — карточка и шторки', () => {
        // Task 417: попап карточки шахматки удалён — aria-подпись
        // ушла вместе с окном; карточки живут на странице «Работники»
        assertFalse(INDEX_SRC.indexOf('id="wsEmpPopup"') !== -1,
            'попап карточки удалён (Task 417)');
        assertTrue(INDEX_SRC.indexOf('id="wsEmpSheetTitle">Новый работник<') !== -1,
            'шторка создания: «Новый работник»');
        assertTrue(INDEX_SRC.indexOf('Увольнение работника</div>') !== -1,
            'шторка увольнения: «Увольнение работника»');
        assertTrue(INDEX_SRC.indexOf('<label class="flow-input-label">Работник</label>') !== -1,
            'лейбл «Работник» в шторке увольнения');
        assertTrue(INDEX_SRC.indexOf('Работник уйдёт из графика — строка останется в архиве справочника') !== -1,
            'пояснение шторки увольнения');
    });

    test('HTML: подсказки вида/обновления — «работники»', () => {
        assertTrue(INDEX_SRC.indexOf('Обновить данные графика с сервера: работники, записи') !== -1,
            'подсказка «Обновить»');
        assertTrue(INDEX_SRC.indexOf('Итоги учёта доступны в любом виде') !== -1,
            'подсказка «Вид» (Task 388: итоги в любом виде)');
    });

    test('SW: кэш поднят до kipia-test-v738', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v738'") !== -1,
            'CACHE_VERSION = kipia-test-v738 (Task 385 — фронтенд менялся)');
        assertFalse(SW_SRC.indexOf('kipia-test-v739') !== -1,
            'v614 ещё не существует (guard)');
    });
});

// ============================================================
// 2. SRC: страница «Работники» + карточка read-only
// ============================================================
describe('Task 385 — SRC: страница «Работники»', () => {

    test('_renderEmpPopup — обёртка ТОЛЬКО ЧТЕНИЯ', () => {
        const fn = methodText(INDEX_SRC, '_renderEmpPopup');
        assertTrue(fn.indexOf('_renderWorkerCard(tabNo, false)') !== -1,
            'попап шахматки зовёт _renderWorkerCard с withEdit=false');
        assertTrue(fn.indexOf('if (this._canEdit)') === -1 &&
                   fn.indexOf('ws-emp-editdata') === -1 &&
                   fn.indexOf('ws-emp-dismiss') === -1 &&
                   fn.indexOf('ws-emp-addvac') === -1 &&
                   fn.indexOf('ws-emp-addtr') === -1,
            'в обёртке нет НИ ОДНОГО элемента правки (заявка: убрать все кнопки)');
    });

    test('_renderWorkerCard — гейты withEdit (4 блока правки)', () => {
        const fn = methodText(INDEX_SRC, '_renderWorkerCard');
        const cnt = fn.split('if (withEdit').length - 1;
        assertTrue(cnt >= 4,
            'гейт withEdit у «Правка данных…»/«Уволить…»/«+ Отпуск…»/«+ Мероприятие…» (найдено ' + cnt + ')');
        assertTrue(fn.indexOf('if (withEdit && vId)') !== -1, '✎/✕ отпусков — withEdit && vId');
        assertTrue(fn.indexOf('if (withEdit && trId)') !== -1, '✎/✕ мероприятий — withEdit && trId');
        assertTrue(fn.indexOf('Правка данных работника: ФИО, режим, должность…') !== -1,
            'тултип «Правка данных работника»');
    });

    test('openWorkersPage — гейт + navigateTo + рендер', () => {
        const fn = methodText(INDEX_SRC, 'openWorkersPage');
        assertTrue(fn.indexOf("if (lvl !== 'edit' && lvl !== 'view') return;") !== -1,
            'Task 395: гейт edit/view (null/min — мимо; зритель — пускается)');
        assertTrue(fn.indexOf("navigateTo('ws-workers')") !== -1,
            'переход на страницу ws-workers');
        assertTrue(fn.indexOf('this._renderWorkersPage();') !== -1,
            'рендер карточек при переходе');
    });

    test('_renderWorkersPage — вкладки: Общая + по фамильно (Task 388)', () => {
        const fn = methodText(INDEX_SRC, '_renderWorkersPage');
        assertTrue(fn.indexOf('localeCompare') !== -1 &&
                   fn.indexOf("'ru'") !== -1,
            'сортировка по ФИО (фамильно по алфавиту; Task 388)');
        assertTrue(fn.indexOf('ws-workers-layout') !== -1, 'раскладка вкладки+тело');
        assertTrue(fn.indexOf('ws-wtabs') !== -1, 'колонка ярлыков-вкладок');
        assertTrue(fn.indexOf('ws-wtab-general') !== -1, 'ярлык «Общая» первый');
        assertTrue(fn.indexOf('selectWorkersTab') !== -1, 'клики по ярлыкам');
        assertTrue(fn.indexOf('_renderWorkerCardPanels') !== -1,
            'обёртка карточки — панели .ws-wcard (Task 393)');
        assertTrue(fn.indexOf('_renderWorkerCardPanels(empTabNo, withEdit)') !== -1,
            'карточка — панели блоков с withEdit (Task 393)');
        assertTrue(fn.indexOf('_renderWorkersGeneral(list)') !== -1,
            '«Общая» вкладка — сводная таблица');
        // Task 389: текст пустого состояния переехал в
        // _renderWorkersGeneral (ранний выход из _renderWorkersPage удалён)
        assertTrue(INDEX_SRC.indexOf('Нет активных работников') !== -1,
            'пустое состояние живо (в «Общей» вкладке)');
        const gen = methodText(INDEX_SRC, '_renderWorkersGeneral');
        // Task 390: счётчик — категории с собственными склонениями
        assertTrue(gen.indexOf("['мастер', 'мастера', 'мастеров']") !== -1,
            'склонения счётчика категорий (в «Общей»; Task 390)');
    });

    test('_renderWorkersIfOpen — обновление вместе с сеткой', () => {
        const fn = methodText(INDEX_SRC, '_renderWorkersIfOpen');
        assertTrue(fn.indexOf("page-ws-workers") !== -1, 'ищет страницу');
        assertTrue(fn.indexOf("contains('active')") !== -1, 'проверяет активность');
        const grid = INDEX_SRC.slice(INDEX_SRC.indexOf('_renderGrid: function'),
                                      INDEX_SRC.indexOf('_fitGrid: function'));
        assertTrue(grid.indexOf('_renderWorkersIfOpen') !== -1,
            'вызов из хвоста _renderGrid (правки/перезагрузка обновляют карточки)');
    });

    test('onWorkersPageOpen — хук navigateTo', () => {
        const fn = methodText(INDEX_SRC, 'onWorkersPageOpen');
        assertTrue(fn.indexOf('this._renderWorkersPage();') !== -1,
            'рендер при активации страницы (прямой заход по URL)');
        const nav = INDEX_SRC.indexOf("if (page === 'ws-workers')");
        assertTrue(nav !== -1, 'хук в navigateTo');
        assertTrue(INDEX_SRC.indexOf("WorkSchedule.onWorkersPageOpen") !== -1,
            'вызов хука');
    });

    test('страница в картах доступа/крошек', () => {
        assertTrue(INDEX_SRC.indexOf(
            "_WORK_SCHEDULE_PAGES: ['work-schedule', 'ws-totals', 'ws-workers', 'ws-legend', 'ws-talons']") !== -1,
            '_WORK_SCHEDULE_PAGES + ws-workers + ws-legend (права наследует табель)');
        assertTrue(INDEX_SRC.indexOf("'ws-workers':               'work-schedule'") !== -1,
            'PAGE_PARENTS: дочь табеля');
        assertTrue(INDEX_SRC.indexOf("'ws-workers':               'Работники'") !== -1,
            'PAGE_LABELS: «Работники»');
    });

    test('_onRoleUpdate — кнопка «Работники»: скрыта для null/min (Task 395)', () => {
        const i = INDEX_SRC.indexOf("_onRoleUpdate: function");
        const chunk = INDEX_SRC.slice(i, i + 2000);
        assertTrue(chunk.indexOf("wsWorkersBtn") !== -1 &&
                   chunk.indexOf("(newLevel === null || newLevel === 'min')") !== -1,
            'Task 395: кнопка НЕ отображается без прав (null) и при ограниченном просмотре (min)');
    });

    test('шапка сетки — «Работники»: ПРОСТО надпись (Task 386)', () => {
        const grid = INDEX_SRC.slice(INDEX_SRC.indexOf('_renderGrid: function'),
                                      INDEX_SRC.indexOf('_fitGrid: function'));
        assertTrue(grid.indexOf('data-full="Работники" data-s4="Рабо">Работники</span>') !== -1,
            'заголовок «Работники» (сужение — «Рабо»)');
        assertTrue(grid.indexOf("this._canEdit ? ' ws-emp-head-add' : ''") === -1 &&
                   grid.indexOf('onclick="WorkSchedule.openWorkersPage()"') === -1 &&
                   grid.indexOf('<i class="ws-emp-head-plus">') === -1,
            'функции кнопки у заголовка НЕТ — переход только кнопкой в баре');
    });
});

// ============================================================
// 3. SRC: легенда — механика и контент
// ============================================================
describe('Task 385 — SRC: шторка «Легенда»', () => {

    test('toggleLegend — взаимоисключение с итогами', () => {
        const fn = methodText(INDEX_SRC, 'toggleLegend');
        assertTrue(fn.indexOf('if (this._totalsOpen) this.toggleTotals();') !== -1,
            'открытые итоги закрываются ПОЛНЫМ путём toggleTotals');
        assertTrue(fn.indexOf('this._setLegend(!this._legendOpen)') !== -1,
            'переключение через _setLegend (без рекурсии)');
    });

    test('toggleTotals — закрыть легенду НАПРЯМУЮ', () => {
        const fn = methodText(INDEX_SRC, 'toggleTotals');
        assertTrue(fn.indexOf('this._setLegend(false)') !== -1,
            'открытие итогов закрывает легенду _setLegend(false)');
        assertTrue(fn.indexOf('this.toggleLegend()') === -1,
            'БЕЗ вызова toggleLegend (иначе взаимная рекурсия)');
    });

    test('_setLegend — aria/маржа/явная ширина (десктоп и мобайл)', () => {
        const fn = methodText(INDEX_SRC, '_setLegend');
        assertTrue(fn.indexOf("aria-pressed") !== -1, 'aria-pressed кнопки');
        assertTrue(fn.indexOf("matchMedia('(min-width: 1024px)')") !== -1,
            'десктоп/мобайл ветвление (как toggleTotals)');
        assertTrue(fn.indexOf('marginRight') !== -1, 'margin-механика выезда (как итоги)');
        assertTrue(fn.indexOf('_legendWidthPx()') !== -1,
            'ширина слота — ЯВНАЯ (flex-сжатие inner больше не ловится)');
        assertTrue(fn.indexOf('_applyLegendWide()') !== -1,
            'вид (узкий/широкий) применяется при открытии');
        assertTrue(fn.indexOf('ws-legend-open') === -1,
            'класс ws-legend-open удалён (Task 386: мобайл — страница)');
        assertTrue(fn.indexOf('void drawer.offsetWidth') !== -1,
            'синхронный reflow перед анимацией (как итоги)');
        assertTrue(fn.indexOf('this._fitGrid()') !== -1, 'сетка перегоняется под шторку');
    });

    test('_legendHtml — секции и динамические коды', () => {
        // Task 386: контент вынесен в _legendHtml (шторка и мобильная
        // страница рендерят одно и то же)
        const fn = methodText(INDEX_SRC, '_legendHtml');
        assertTrue(fn.indexOf('Коды дней (Т-12/Т-13)') !== -1, 'секция кодов дней');
        assertTrue(fn.indexOf('Коды мероприятий') !== -1, 'секция кодов мероприятий');
        assertTrue(fn.indexOf('Обозначения в шахматке') !== -1, 'секция обозначений');
        assertTrue(fn.indexOf('ws-lg-notesec') !== -1,
            'пояснения — в свёртываемом блоке .ws-lg-notesec (Task 386)');
        assertTrue(fn.indexOf('this._STATUS_CODES') !== -1,
            'коды — из справочника «Коды_статусов» (живой состав)');
        assertTrue(fn.indexOf('this._EVENT_CODES') !== -1,
            'разделение: коды-мероприятия отдельной секцией');
        assertTrue(fn.indexOf('ws-lg-swatch') !== -1, 'свотчи цветов ячеек');
        assertTrue(fn.indexOf('Справочник кодов ещё не загружен') !== -1,
            'пустое состояние до загрузки справочника');
        // Task 387: пояснение «Код мероприятия… ПОВЕРХ плановой смены
        // (Д/Н)» УДАЛЕНО; бейдж плановой смены — живое пояснение
        assertTrue(fn.indexOf('плановая смена по циклу') !== -1,
            'пояснение про бейдж плановой смены');
        assertFalse(fn.indexOf('ПОВЕРХ плановой смены') !== -1,
            'пояснение «код мероприятия поверх смены» удалено (Task 387)');
        assertTrue(fn.indexOf('сегодняшняя дата') !== -1, 'пояснение «сегодня»');
        // Task 387: пояснение праздников в отпусках УДАЛЕНО; живо
        // переозвученное «Красная рамка… (пример - 24*)»
        assertTrue(fn.indexOf('(пример - 24*)') !== -1, 'сокращённый предпраздничный');
        assertFalse(fn.indexOf('ст. 120 ТК РФ') !== -1, 'пояснение праздников удалено (Task 387)');
    });

    test('Esc закрывает легенду', () => {
        // якорь — комментарий Task 309 у Обработчика табеля (первое
        // вхождение "ev.key === 'Escape'" в файле — чужой модуль)
        const i = INDEX_SRC.indexOf("Task 309 → 417: попап карточки сотрудника удалён");
        assertTrue(i !== -1, 'якорь обработчика табеля найден');
        const chunk = INDEX_SRC.slice(i, i + 900);
        assertTrue(chunk.indexOf("ev.key === 'Escape'") !== -1,
            'обработчик Esc в табеле');
        assertTrue(chunk.indexOf('selfOnce._legendOpen') !== -1 &&
                   chunk.indexOf('selfOnce._setLegend(false)') !== -1,
            'Esc → _setLegend(false) (рядом с закрытием попапов)');
    });

    test('могильник Task 252 жив: СТАРАЯ легенда не вернулась', () => {
        assertTrue(INDEX_SRC.indexOf('id="wsLegend"') === -1,
            'старый контейнер #wsLegend не существует');
        assertTrue(INDEX_SRC.indexOf('_renderLegend: function') === -1 &&
                   INDEX_SRC.indexOf('this._renderLegend()') === -1,
            'старый метод _renderLegend не вернулся (новый — _renderLegendSheet)');
    });
});

// ============================================================
// 4. SRC: переименование «сотрудник» → «работник» (видимые строки)
// ============================================================
describe('Task 385 — SRC: переименование видимых строк', () => {

    test('тосты и сообщения', () => {
        ["'Работник не найден'", "'Данные работника обновлены'",
         "'Работник добавлен'", "'Работник уволен и убран из графика'",
         "'Выберите работника'", "'Новый работник'", "'Правка работника'"]
            .forEach(t => assertTrue(INDEX_SRC.indexOf(t) !== -1, 'тост: ' + t));
        assertTrue(INDEX_SRC.indexOf("'Сотрудник не найден'") === -1, 'старый тост убран');
        assertTrue(INDEX_SRC.indexOf("'Данные сотрудника обновлены'") === -1, 'старый тост убран');
        assertTrue(INDEX_SRC.indexOf("'Выберите сотрудника'") === -1, 'старый тост убран');
    });

    test('подтверждение увольнения', () => {
        assertTrue(INDEX_SRC.indexOf("Работник уйдёт из ") !== -1, 'confirm: «Работник уйдёт»');
        assertTrue(INDEX_SRC.indexOf('в архиве справочника') !== -1, 'архив');
        assertTrue(INDEX_SRC.indexOf('Сотрудник уйдёт из ') === -1, 'старый текст убран');
    });

    test('шапки итогов (×3) и пустые состояния', () => {
        assertEqual((INDEX_SRC.match(/data-full="Работник" data-s4="Рабо"/g) || []).length, 3,
            '3 шапки итогов: месяц/год/архив');
        assertEqual((INDEX_SRC.match(/data-full="Работники" data-s4="Рабо"/g) || []).length, 1,
            'шапка СЕТКИ — «Работники» (Task 386: «Работник +» → надпись)');
        assertTrue(INDEX_SRC.indexOf('Нет активных работников.') !== -1, 'пустое: месяц');
        assertTrue(INDEX_SRC.indexOf('Нет работников.') !== -1, 'пустое: год');
        assertTrue(INDEX_SRC.indexOf('Нет активных сотрудников.') === -1, 'старое убрано');
    });

    test('печать — «Работник» в шапке таблицы', () => {
        assertTrue(INDEX_SRC.indexOf('mm">Работник</th>') !== -1, 'печатная шапка');
        assertTrue(INDEX_SRC.indexOf('mm">Сотрудник</th>') === -1, 'старая убрана');
    });

    test('пустое состояние сетки указывает страницу «Работники»', () => {
        assertTrue(INDEX_SRC.indexOf('Нет активных работников. Добавьте их на странице «Работники».') !== -1,
            'подсказка ведёт на новую страницу');
        assertTrue(INDEX_SRC.indexOf('Нет активных сотрудников. Добавьте их на странице «Сотрудники».') === -1,
            'старая подсказка убрана');
    });
});

// ============================================================
// 5. VM: функциональные проверки (клиент)
// ============================================================
describe('Task 385 — VM: карточка/страница/легенда', () => {

    const HOST_METHODS = [
        '_renderEmpPopup', '_renderWorkerCard', '_renderWorkerCardPanels',
        '_renderWorkersPage',
        '_renderWorkersGeneral', 'selectWorkersTab', '_escAttr',
        '_renderWorkersIfOpen', 'openWorkersPage', 'onWorkersPageOpen',
        '_setLegend', 'toggleLegend', '_renderLegendSheet',
        // Task 386: два вида шторки + мобильная страница
        '_legendHtml', 'onLegendPageOpen', '_legendWidthPx',
        'toggleLegendWide', '_applyLegendWide',
        // хелперы карточки (праздники отпусков, метакоды, ISO)
        '_sortEmployees', '_esc', '_plural', '_fmtDateRu',
        '_trainingCodeOf', '_statusMeta',
        '_instrShortOf', '_normInstrKey',
        // Task 405: деление записей по типу (мероприятия/инструктажи)
        '_isInstrType',
        // Task 408: год блоков карточки (стрелки ‹год›); Task 440:
        // максимум по записям + диапазон отпусков (fam 2)
        '_wtabYearOf', '_wtabYearMin', '_wtabYearNav',
        '_wtabYearRecords', '_wtabYearMax', '_vacYearRange',
        '_vacDaysInYear', '_vacNetDaysInYear', '_vacIsHoliday',
        '_vacSplitDays', '_parseIsoLocal',
        // Task 390: подсчёт мастеров в шапке «Общей» вкладки
        '_isMasterKipia',
    ];

    function makeHost(desktop) {
        const els = {};
        const toasts = [];
        let ttToggles = 0;
        let navTo = [];
        const document = {
            getElementById: id => (els[id] || (els[id] = mkEl())),
        };
        const ctx = {
            document,
            window: { matchMedia: () => ({ matches: !!desktop }) },
            Math, Date, String, Number, parseInt, parseFloat, isNaN, isFinite,
            Promise, setTimeout: () => 0,
            KipToast: { show: m => toasts.push(String(m)) },
        };
        vm.createContext(ctx);
        const src = HOST_METHODS.map(n => extractMethod(INDEX_SRC, n))
            .filter(Boolean).join(',\n');
        vm.runInContext(`
            var WSM = {
                _canEdit: true,
                _legendOpen: false, _totalsOpen: false,
                _STATUS_CODES: [
                    {code:'Д',  name:'День (12-час)',  color:'#FFE082'},
                    {code:'Н',  name:'Ночь (12-час)',  color:'#B0BEC5'},
                    {code:'ОТ', name:'Отпуск ежегодный основной', color:'#ECEFF1'},
                    {code:'И',  name:'Инструктаж',     color:'#B3E5FC'},
                    {code:'ПЗ', name:'Проверка знаний', color:'#FFCDD2'},
                ],
                _EVENT_CODES: ['И', 'ОБ', 'ПЗ', 'ПР', '*'],
                _EMPLOYEES: [
                    { 'таб_номер': '0955', 'ФИО': 'Петров П. П.', 'тип': 'дневной',
                      'смена': null, 'должность': 'Инженер', 'комментарий': '',
                      'дата_приёма': '2025-09-01' },
                    { 'таб_номер': '0871', 'ФИО': 'Иванов И. И.', 'тип': 'сменный',
                      'смена': 2, 'должность': 'Слесарь КИПиА', 'комментарий': 'осн.',
                      'дата_приёма': '2024-05-01' },
                ],
                _VACATIONS: [
                    { id: 21, 'таб_номер': '0871', 'часть': 1,
                      'дата_начала': '2026-06-01', 'дата_окончания': '2026-06-10',
                      'комментарий': 'лето' },
                ],
                _TRAININGS: [
                    { id: 31, 'таб_номер': '0871', 'тип': 'инструктаж',
                      'тема': 'ОТ', 'дата_начала': '2026-06-05',
                      'дата_окончания': '2026-06-05' },
                ],
                _year: 2026, _month: 6,
                toggleTotals: function() { __ttToggles++; this._totalsOpen = false; },
                _fitGrid: function() {},
                ${src}
            };
            globalThis.__host = {
                WSM: WSM,
                els: function() { return els; },
                nav: function() { return __nav; },
                ttToggles: function() { return __ttToggles; },
                toasts: function() { return toasts; },
                setNav: function(f) { __navFn = f; },
            };
            var __nav = [];
            var __navFn = null;
            var __ttToggles = 0;
            // navigateTo-мок (глобал замыкания)
            function navigateTo(page) { __nav.push(page); if (__navFn) __navFn(page); }
        `, ctx, { filename: 'index.html-WS385' });
        // vars-хосты для моков (глобалы VM: замыкания кода выше видят их)
        ctx.els = els;
        ctx.toasts = toasts;
        ctx.__ttToggles = 0;
        return ctx.__host;
    }

    test('VM: _renderWorkerCard(false) — карточка шахматки БЕЗ правки', () => {
        const h = makeHost();
        const html = h.WSM._renderWorkerCard('0871', false);
        assertTrue(html.indexOf('Иванов И. И. · таб. №0871') !== -1, 'шапка ФИО');
        assertTrue(html.indexOf('Отпуска · 2026') !== -1, 'секция отпусков');
        assertTrue(html.indexOf('Мероприятия · ') !== -1, 'секция мероприятий');
        // НИ ОДНОЙ кнопки правки (заявка)
        ['ws-emp-editdata', 'ws-emp-dismiss', 'ws-emp-addvac', 'ws-emp-addtr',
         'ws-popup-act'].forEach(cls =>
            assertTrue(html.indexOf(cls) === -1, 'нет элемента правки: ' + cls));
    });

    test('VM: _renderWorkerCard(true) — полная карточка со всей правкой', () => {
        const h = makeHost();
        const html = h.WSM._renderWorkerCard('0871', true);
        assertTrue(html.indexOf('ws-emp-editdata') !== -1, '«Правка данных…»');
        assertTrue(html.indexOf('Правка данных…</div>') !== -1, 'текст строки');
        assertTrue(html.indexOf('ws-emp-dismiss') !== -1, '«Уволить…»');
        assertTrue(html.indexOf('Уволить…</div>') !== -1, 'текст');
        assertTrue(html.indexOf('ws-emp-addvac') !== -1, '«+ Отпуск…»');
        assertTrue(html.indexOf('ws-emp-addtr') !== -1, '«+ Мероприятие…»');
        assertTrue(html.indexOf('WorkSchedule.editVacation(21)') !== -1, '✎ отпуска');
        assertTrue(html.indexOf('WorkSchedule.deleteVacation(21)') !== -1, '✕ отпуска');
        assertTrue(html.indexOf('WorkSchedule.editTraining(31, 1)') !== -1, '✎ инструктажа + семейство (Task 427)');
        assertTrue(html.indexOf('WorkSchedule.deleteTraining(31, 1)') !== -1, '✕ инструктажа + семейство (Task 427)');
        // порядок: «Правка данных…» ВЫШЕ «Уволить…»
        assertTrue(html.indexOf('ws-emp-editdata') < html.indexOf('ws-emp-dismiss'),
            '«Правка данных…» выше «Уволить…»');
    });

    test('VM: _renderEmpPopup — обёртка читает без правки', () => {
        const h = makeHost();
        const html = h.WSM._renderEmpPopup('0871');
        assertTrue(html.indexOf('Иванов И. И.') !== -1, 'данные есть');
        assertTrue(html.indexOf('ws-emp-editdata') === -1, 'кнопок правки НЕТ');
    });

    test('VM: _renderWorkersPage — вкладки: Общая + фамильный алфавит (Task 388)', () => {
        const h = makeHost();
        h.WSM._renderWorkersPage();
        const body = h.els().wsWorkersBody.innerHTML;
        // вкладки-ярлыки: «Общая» + работники ПО ФАМИЛЬНО ПО АЛФАВИТУ
        assertTrue(body.indexOf('ws-workers-layout') !== -1, 'раскладка вкладок');
        assertEqual((body.match(/role="tab"/g) || []).length, 3,
            'три ярлыка: «Общая» + двое работников');
        assertTrue(body.indexOf('ws-wtab-general active') !== -1,
            '«Общая» активна по умолчанию');
        // ПО ФАМИЛЬНО ПО АЛФАВИТУ: Иванов выше Петрова (не по сменам!)
        assertTrue(body.indexOf('Иванов И. И.') < body.indexOf('Петров П. П.'),
            'фамильный алфавит (Task 388)');
        // «Общая» вкладка — сводная таблица + счётчик
        assertTrue(body.indexOf('ws-wgen-table') !== -1, 'сводная таблица');
        assertTrue(body.indexOf('ws-workers-count') !== -1, 'счётчик работников');
        // клик по ярлыку — карточка с кнопками правки (редактор)
        h.WSM.selectWorkersTab('0871');
        const body2 = h.els().wsWorkersBody.innerHTML;
        assertEqual((body2.match(/ws-wcard/g) || []).length, 5,
            'карточка выбранного — ПЯТЬ блоков-окон (Task 393 + Task 405)');
        assertTrue(body2.indexOf('ws-emp-editdata') !== -1,
            'кнопки правки в карточке (withEdit=true у редактора)');
        // выбор живёт между перерисовками
        h.WSM._renderWorkersPage();
        assertTrue(h.els().wsWorkersBody.innerHTML.indexOf('ws-wcard') !== -1,
            'вкладка сохраняется при перерисовке');
    });

    test('VM: _renderWorkersPage — зритель без кнопок (Task 388)', () => {
        const h = makeHost();
        h.WSM._canEdit = false;
        h.WSM.selectWorkersTab('0871');
        const body = h.els().wsWorkersBody.innerHTML;
        assertTrue(body.indexOf('ws-wcard') !== -1, 'карточка есть');
        assertTrue(body.indexOf('ws-emp-editdata') === -1 &&
                   body.indexOf('ws-emp-addvac') === -1,
            'без права записи — карточка без кнопок');
    });

    test('VM: openWorkersPage — гейт/переход/рендер', () => {
        const h = makeHost();
        h.WSM.openWorkersPage();
        assertEqual(JSON.stringify(h.nav()), JSON.stringify(['ws-workers']),
            'navigateTo(ws-workers)');
        assertTrue(h.els().wsWorkersBody.innerHTML.indexOf('ws-workers-layout') !== -1,
            'страница отрендерена (вкладки, Task 388)');
        assertTrue(h.els().wsWorkersBody.innerHTML.indexOf('ws-wgen-table') !== -1,
            '«Общая» вкладка — сводка по всем работникам');
        // Task 395: ЗРИТЕЛЬ (view) — теперь пускается (кнопка видна
        // уровням edit/view; страница — read-only, без кнопок правки)
        const h2 = makeHost();
        h2.WSM._canEdit = false;
        h2.WSM.openWorkersPage();
        assertEqual(JSON.stringify(h2.nav()), JSON.stringify(['ws-workers']),
            'Task 395: зритель (view) переходит на страницу');
        // min (ограниченный просмотр) и null (нет доступа) — мимо
        const h3 = makeHost();
        h3.WSM._viewLevel = 'min';
        h3.WSM.openWorkersPage();
        assertEqual(JSON.stringify(h3.nav()), JSON.stringify([]),
            'Task 395: min — перехода нет (кнопка скрыта)');
        const h4 = makeHost();
        h4.WSM._viewLevel = null;
        h4.WSM.openWorkersPage();
        assertEqual(JSON.stringify(h4.nav()), JSON.stringify([]),
            'Task 395: null (нет доступа) — перехода нет');
    });

    test('VM: _renderWorkersIfOpen — только активная страница', () => {
        const h = makeHost();
        // страница НЕ активна (мок contains=false) — тело ещё пустое
        h.els()['wsWorkersBody'] = mkEl();
        h.WSM._renderWorkersIfOpen();
        assertEqual(h.els().wsWorkersBody.innerHTML, '', 'не активна — рендера нет');
    });

    test('VM: _renderLegendSheet — секции из справочника', () => {
        const h = makeHost();
        h.WSM._renderLegendSheet();
        const body = h.els().wsLegendBody.innerHTML;
        assertTrue(body.indexOf('Коды дней (Т-12/Т-13)') !== -1, 'секция дней');
        assertTrue(body.indexOf('Коды мероприятий') !== -1, 'секция мероприятий');
        assertTrue(body.indexOf('Обозначения в шахматке') !== -1, 'секция обозначений');
        // коды дней: Д/Н/ОТ (не мероприятия)
        assertTrue(body.indexOf('День (12-час)') !== -1, 'код Д с именем');
        assertTrue(body.indexOf('Отпуск ежегодный основной') !== -1, 'код ОТ');
        // мероприятия: И/ПЗ — отдельной секцией
        const iDays = body.indexOf('Коды дней');
        const iEv = body.indexOf('Коды мероприятий');
        const iInstr = body.indexOf('>Инструктаж<');
        assertTrue(iEv !== -1 && iInstr > iEv, 'И — в секции мероприятий');
        assertTrue(body.indexOf('ws-lg-swatch') !== -1, 'свотчи цветов');
        assertTrue(body.indexOf('#FFE082') !== -1, 'цвет Д из справочника');
    });

    test('VM: toggleLegend — взаимоисключение с итогами', () => {
        // Task 386: десктоп-хост — на «мобайле» toggleLegend уходит
        // на страницу ws-legend (не тогглит шторку)
        const h = makeHost(true);
        h.WSM._totalsOpen = true;
        h.WSM.toggleLegend();
        assertEqual(h.ttToggles(), 1, 'открытые итоги закрыты через toggleTotals');
        assertEqual(h.WSM._legendOpen, true, 'легенда открылась');
        // итоги закрыты — повторный вызов НЕ дёргает toggleTotals
        h.WSM.toggleLegend();
        assertEqual(h.ttToggles(), 1, 'второй тап — без toggleTotals');
        assertEqual(h.WSM._legendOpen, false, 'легенда закрылась');
    });

    test('VM: _setLegend — aria/маржа/ширина/шеврон (десктоп)', () => {
        const h = makeHost(true);   // десктоп
        const drawn = { calls: [] };
        const btn = mkEl();
        btn.setAttribute = (k, v) => { drawn.calls.push([k, v]); };
        const drawer = mkEl();
        const chv = mkEl();
        h.els().wsLegendBtn = btn;
        h.els().wsLegendDrawer = drawer;
        h.els().wsLgChv = chv;
        h.WSM._setLegend(true);
        assertEqual(h.WSM._legendOpen, true, 'флаг');
        assertEqual(drawn.calls[0][0], 'aria-pressed', 'aria-pressed ставится');
        assertEqual(drawn.calls[0][1], 'true', 'aria-pressed=true');
        assertEqual(chv.hidden, false, 'шеврон показан вместе со шторкой');
        assertEqual(drawer.style.width, '230px', 'слот — краткий вид (230px, Task 388)');
        assertEqual(drawer.style.marginRight, '0px', 'маржа 0 (панель выехала)');
        h.WSM._setLegend(false);
        assertEqual(drawer.style.marginRight, '-230px', 'уехала за край (−ширина вида)');
        assertEqual(chv.hidden, true, 'шеврон скрыт при закрытии');
    });

    test('VM: _setLegend — мобайл: transform, БЕЗ маржи', () => {
        const h = makeHost(false);  // мобайл
        h.els().wsLegendDrawer = mkEl();
        const drawer = h.els().wsLegendDrawer;
        h.WSM._setLegend(true);
        assertEqual(drawer.style.marginRight, '', 'мобайл: маржи нет (transform CSS)');
        assertEqual(h.WSM._legendOpen, true, 'открыта');
    });
});
