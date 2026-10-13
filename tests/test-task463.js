// tests/test-task463.js
// Task 463 — заявка пользователя: «Продолжим работу над новым разделом
// "Плановые мероприятия". Суть раздела в том, чтобы ежемесячно
// отмечать выполнение перечисленных в таблице мероприятий, с функцией
// архива в новом файле https://docs.google.com/spreadsheets/d/1uX8Bz6...
// Отметки делает пользователь в таблице плана мероприятий путём
// нажатия на ячейку напротив мероприятия за выбранный месяц, при
// этом, после подтверждения данного действия, в ячейке вместо
// тусклого крестика появляется значок галочки зелёного цвета, и эта
// информация, с указанием наименования мероприятия и даты его
// выполнения, сохраняется в архив файла Мероприятия_КИП_ИОС.»
//
// РЕШЕНИЕ:
//   клиент (index.html): НОВЫЙ модуль PlanEventsData — init при
//   открытии страницы (тусклые крестики в 96 ячейках + загрузка
//   отметок года planEvents.list), клик по ячейке месяца → диалог
//   подтверждения (наименование + месяц + дата выполнения, input
//   type=date, по умолчанию сегодня) → planEvents.mark → ЗЕЛЁНАЯ
//   галочка (pe-m-done) вместо крестика + title с датой; кнопка
//   «Обновить» в шапке (peRefreshBtn); ошибка сети/сервера → тост,
//   ячейка остаётся крестиком;
//   сервер (scripts/PlanEvents.gs + case в Code.gs): list/mark,
//   доступ — право plan.events (Task 462), ИДЕМПОТЕНТНОСТЬ mark
//   (запись (год, месяц, мероприятие) уже есть → already: true);
//   архив — лист «Архив» файла Мероприятия_КИП_ИОС (создаётся
//   одноразовым PlanEventsInit.gs: id, дата_выполнения, мероприятие,
//   год, месяц, email, время_отметки);
//   SW: kipia-test-v731.
//
// АДАПТАЦИЯ Task 464 (правка/снятие отметок + мобайл): подсказка
//   peHint УДАЛЕНА (заявка); кнопка подтверждения «Подтвердить»
//   (была «Отметить»), «Отмена» подкрашена красным (pe-cancel-red);
//   отмеченная ячейка → диалог правки _editDialog (не тост); новые
//   тесты поведения — tests/test-task464.js.
//
// Запуск: через tests/run-all.js (require './test-task463.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'PlanEvents.gs'), 'utf8');
const INIT_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'PlanEventsInit.gs'), 'utf8');
const CODE_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Code.gs'), 'utf8');

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

// Блок модуля PlanEventsData (методы с частыми именами — init,
// refresh — ищутся ТОЛЬКО внутри модуля, не по всему index.html)
const PE_MODULE_SRC = (function() {
    const a = INDEX_SRC.indexOf('var PlanEventsData = {');
    const b = INDEX_SRC.indexOf('var WorkSchedule = {');
    return (a !== -1 && b !== -1 && b > a) ? INDEX_SRC.slice(a, b) : '';
})();

function methodText(src, name) {
    const m = extractMethod(src, name);
    return m ? String(m) : '';
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// VM-хост модуля PlanEventsData: реальные методы + контролируемое
// состояние (без DOM — только чистые функции)
function makeHost(state) {
    return new Function(
        'return ({' + methodText(PE_MODULE_SRC, '_key') + ',' +
        methodText(PE_MODULE_SRC, '_todayIso') + ',' +
        methodText(PE_MODULE_SRC, '_ruDate') + ',' +
        methodText(PE_MODULE_SRC, '_rebuildIndex') + ',' +
        'YEAR: 2026,' +
        'MONTHS: ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"],' +
        '_marks: ' + JSON.stringify(state.marks || []) + ',' +
        '_byKey: {}' +
        '});'
    )();
}

// ============================================================
// 1. SRC — HTML страницы (кнопка обновления, подсказка, id таблицы)
// ============================================================
describe('Task 463 — SRC: HTML страницы plan-events', () => {

    test('кнопка «Обновить» в шапке (peRefreshBtn + refresh)', () => {
        assertTrue(INDEX_SRC.indexOf('id="peRefreshBtn"') !== -1,
            'кнопка определена');
        assertTrue(INDEX_SRC.indexOf('onclick="PlanEventsData.refresh()"') !== -1,
            'onclick вызывает PlanEventsData.refresh()');
        assertTrue(INDEX_SRC.indexOf('aria-label="Обновить отметки"') !== -1,
            'aria-label кнопки');
    });

    test('кнопка — ВНУТРИ шапки страницы plan-events', () => {
        const pageStart = INDEX_SRC.indexOf('<div id="page-plan-events" class="page-content">');
        const tableStart = INDEX_SRC.indexOf('<table class="pe-table" id="peTable">');
        const btn = INDEX_SRC.indexOf('id="peRefreshBtn"');
        assertTrue(pageStart !== -1 && btn > pageStart && btn < tableStart,
            'кнопка между началом страницы и таблицей');
    });

    test('подсказка над таблицей УДАЛЕНА (Task 464)', () => {
        assertTrue(INDEX_SRC.indexOf('peHint') === -1,
            'элемент peHint удалён');
        assertTrue(INDEX_SRC.indexOf('class="pe-hint"') === -1,
            'класс pe-hint удалён');
        assertTrue(INDEX_SRC.indexOf('Нажмите на ячейку месяца') === -1,
            'текст подсказки удалён');
    });

    test('таблица имеет id="peTable"', () => {
        assertTrue(INDEX_SRC.indexOf('<table class="pe-table" id="peTable">') !== -1,
            'таблица адресуема для делегированного клика');
    });

    test('разметка ячеек месяцев не тронута (10 мероприятий × 12)', () => {
        // Task 470: 8 → 10 строк мероприятий (новые «Работы на следующий
        // месяц» и «Работы на месяц»), 96 → 120 пустых ячеек
        assertEqual(120, INDEX_SRC.split('<td class="pe-m"></td>').length - 1,
            'пустых ячеек месяцев в разметке');
    });
});

// ============================================================
// 2. SRC — CSS: тусклый крест / зелёная галочка / hover / busy
// ============================================================
describe('Task 463 — SRC: CSS отметок', () => {

    test('тусклый крестик — приглушённый цвет', () => {
        assertTrue(INDEX_SRC.indexOf('.pe-ic-cross {') !== -1,
            'класс крестика');
        const i = INDEX_SRC.indexOf('.pe-ic-cross {');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(block.indexOf('opacity') !== -1,
            'приглушение opacity в правиле');
    });

    test('зелёная галочка — цвет задаён явно (тёмная/светлая темы)', () => {
        assertTrue(INDEX_SRC.indexOf('.pe-m-done .pe-ic-check { stroke: #43a047; }') !== -1,
            'зелёный галочки в тёмной теме');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .pe-m-done .pe-ic-check { stroke: #2e7d32; }') !== -1,
            'зелёный галочки в светлой теме');
    });

    test('hover ячейки — специфичность ВЫШЕ зебры строк', () => {
        assertTrue(INDEX_SRC.indexOf('.pe-table td.pe-m:hover') !== -1,
            '.pe-table td.pe-m:hover (0-2-2 > .pe-row:nth-child(even) td 0-2-1)');
    });

    test('busy-состояние блокирует повторные клики', () => {
        const i = INDEX_SRC.indexOf('td.pe-m.pe-m-busy');
        assertTrue(i !== -1, 'класс busy определён');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(block.indexOf('pointer-events: none') !== -1,
            'pointer-events: none');
    });

    test('SVG-знаки: polyline галочки / line крестика', () => {
        assertTrue(INDEX_SRC.indexOf('pe-ic-check" viewBox="0 0 24 24"') !== -1,
            'SVG галочки (polyline)');
        assertTrue(INDEX_SRC.indexOf('pe-ic-cross" viewBox="0 0 24 24"') !== -1,
            'SVG крестика (две line)');
        const cross = INDEX_SRC.slice(INDEX_SRC.indexOf('pe-ic-cross"'), INDEX_SRC.indexOf('pe-ic-cross"') + 220);
        assertEqual(2, (cross.match(/<line /g) || []).length,
            'крестик из двух линий');
    });

    test('анимация вращения кнопки «Обновить»', () => {
        assertTrue(INDEX_SRC.indexOf('@keyframes peRefreshSpin') !== -1,
            'peRefreshSpin');
        assertTrue(INDEX_SRC.indexOf('.pe-refresh-btn.pe-refreshing svg') !== -1,
            'класс pe-refreshing');
    });

    test('поле даты диалога: подпись + стили', () => {
        assertTrue(INDEX_SRC.indexOf('.pe-dialog-label') !== -1,
            'подпись «Дата выполнения»');
        assertTrue(INDEX_SRC.indexOf('.pe-dialog-date') !== -1,
            'стили поля даты');
    });
});

// ============================================================
// 3. SRC — модуль PlanEventsData
// ============================================================
describe('Task 463 — SRC: модуль PlanEventsData', () => {

    test('модуль определён перед WorkSchedule, комментарий Task 463', () => {
        const m = INDEX_SRC.indexOf('var PlanEventsData = {');
        const ws = INDEX_SRC.indexOf('var WorkSchedule = {');
        assertTrue(m !== -1 && ws !== -1 && m < ws,
            'модуль перед WorkSchedule');
        const above = INDEX_SRC.slice(Math.max(0, m - 1500), m);
        assertTrue(above.indexOf('Task 463') !== -1, 'комментарий Task 463');
        assertTrue(above.indexOf('Мероприятия_КИП_ИОС') !== -1,
            'упомянут файл архива');
        assertTrue(above.indexOf('planEvents.mark') !== -1 &&
                   above.indexOf('planEvents.list') !== -1,
            'задокументированы эндпоинты');
    });

    test('константы: YEAR=2026, MONTHS — 12 полных названий', () => {
        assertTrue(INDEX_SRC.indexOf('YEAR: 2026,') !== -1, 'YEAR: 2026');
        const i = INDEX_SRC.indexOf('MONTHS: [');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf(']', i) + 1);
        ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль',
         'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'].forEach(function(mn) {
            assertTrue(block.indexOf(mn) !== -1, 'месяц в MONTHS: ' + mn);
        });
        assertEqual(12, (block.match(/'/g) || []).length / 2, 'ровно 12 месяцев');
    });

    test('init: построение крестиков + делегированный клик + loadMarks', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, 'init'));
        assertTrue(fn.indexOf("getElementById('peTable')") !== -1,
            'находит таблицу');
        assertTrue(fn.indexOf('addEventListener(\'click\'') !== -1,
            'делегированный клик на таблицу');
        assertTrue(fn.indexOf('_buildCells') !== -1, 'строит крестики');
        assertTrue(fn.indexOf('loadMarks(true)') !== -1,
            'автозагрузка отметок (silent)');
        assertTrue(fn.indexOf('closest(\'td.pe-m\')') !== -1,
            'клик адресуется к ячейке месяца');
    });

    test('_setCell: галочка + title с датой / крестик', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, '_setCell'));
        assertTrue(fn.indexOf('pe-m-done') !== -1, 'класс выполнено');
        assertTrue(fn.indexOf("setAttribute('title'") !== -1,
            'title с датой');
        assertTrue(fn.indexOf('Выполнено ') !== -1, 'подпись title');
        assertTrue(fn.indexOf('pe-ic-check') !== -1, 'SVG галочки');
        assertTrue(fn.indexOf('pe-ic-cross') !== -1, 'SVG крестика');
        assertTrue(fn.indexOf('removeAttribute') !== -1,
            'снятие title у крестика');
    });

    test('_cellClick: отмеченная ячейка → диалог правки (Task 464), НЕ mark', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, '_cellClick'));
        assertTrue(fn.indexOf('_editDialog') !== -1,
            'отмеченная → диалог правки _editDialog');
        assertTrue(fn.indexOf('_unmarkCell') !== -1,
            'ветка снятия отметки');
        assertTrue(fn.indexOf('_saveDate') !== -1,
            'ветка правки даты');
        assertTrue(fn.indexOf('_confirmDialog') !== -1,
            'пустая ячейка → диалог');
    });

    test('_confirmDialog: диалог kip-dialog с input type=date', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, '_confirmDialog'));
        assertTrue(fn.indexOf('_kipDialogOverlay()') !== -1,
            'на базе общего оверлея диалогов');
        assertTrue(fn.indexOf('type="date"') !== -1, 'поле даты');
        assertTrue(fn.indexOf('id="peDialogDate"') !== -1, 'id поля');
        assertTrue(fn.indexOf('_todayIso()') !== -1,
            'по умолчанию — сегодня');
        assertTrue(fn.indexOf('Подтвердить') !== -1,
            'кнопка «Подтвердить» (Task 464: была «Отметить»)');
        assertTrue(fn.indexOf('pe-cancel-red') !== -1,
            '«Отмена» подкрашена красным (Task 464)');
        assertTrue(fn.indexOf('Отмена') !== -1, 'кнопка «Отмена»');
        assertTrue(fn.indexOf('MONTHS[month - 1]') !== -1,
            'месяц в подписи из MONTHS');
    });

    test('_confirmDialog: валидация даты', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, '_confirmDialog'));
        assertTrue(/\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(fn),
            'проверка формата yyyy-mm-dd');
        assertTrue(fn.indexOf('Укажите дату выполнения') !== -1,
            'тост при пустой дате');
    });

    test('_markCell: payload {token, year, month, event, date} + busy', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, '_markCell'));
        assertTrue(fn.indexOf("api('planEvents.mark'") !== -1,
            'вызов planEvents.mark');
        ['token', 'year: this._viewYear', 'month: info.month',
         'event: info.event', 'date: date'].forEach(function(frag) {
            assertTrue(fn.indexOf(frag) !== -1, 'в payload: ' + frag);
        });
        assertTrue(fn.indexOf('pe-m-busy') !== -1, 'busy на время запроса');
        assertTrue(fn.indexOf('_rebuildIndex') !== -1,
            'перестройка индекса после ответа');
        assertTrue(fn.indexOf('_setCell') !== -1, 'перерисовка ячейки');
        assertTrue(fn.indexOf('already') !== -1,
            'реакция на идемпотентный ответ сервера');
        assertTrue(fn.indexOf('Не удалось отметить') !== -1,
            'тост при ошибке');
    });

    test('loadMarks: planEvents.list + тихая деградация', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, 'loadMarks'));
        assertTrue(fn.indexOf("api('planEvents.list'") !== -1,
            'вызов planEvents.list');
        assertTrue(fn.indexOf('year: this._viewYear') !== -1, 'год плана');
        assertTrue(fn.indexOf('silent') !== -1, 'режим silent');
        assertTrue(fn.indexOf('console.warn') !== -1,
            'ошибка — в консоль (молча при автозагрузке)');
        assertTrue(fn.indexOf('_renderMarks') !== -1, 'перерисовка');
    });

    test('refresh: кнопка «Обновить» — list + тост результата', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, 'refresh'));
        assertTrue(fn.indexOf("api('planEvents.list'") !== -1,
            'вызов planEvents.list');
        assertTrue(fn.indexOf('Отметки обновлены') !== -1, 'тост успеха');
        assertTrue(fn.indexOf('pe-refreshing') !== -1, 'анимация кнопки');
        assertTrue(fn.indexOf('peRefreshBtn') !== -1, 'кнопка по id');
    });

    test('navigateTo: хук plan-events → PlanEventsData.init()', () => {
        const i = INDEX_SRC.indexOf("if (page === 'plan-events') {");
        assertTrue(i !== -1, 'хук есть');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(block.indexOf('PlanEventsData.init()') !== -1,
            'вызов init при открытии страницы');
    });
});

// ============================================================
// 4. VM — чистые функции модуля
// ============================================================
describe('Task 463 — VM: ключи/даты/индекс', () => {

    test('_key: год|месяц|мероприятие', () => {
        const host = makeHost({ marks: [] });
        assertEqual('2026|2|Проверка огнетушителей',
            host._key(2026, 2, 'Проверка огнетушителей'));
        assertEqual('2025|12|X', host._key(2025, 12, 'X'));
    });

    test('_todayIso: локальная дата yyyy-mm-dd (без UTC-сдвига)', () => {
        const host = makeHost({ marks: [] });
        const iso = host._todayIso();
        assertTrue(/^\d{4}-\d{2}-\d{2}$/.test(iso), 'формат: ' + iso);
        const d = new Date();
        const expect = d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
        assertEqual(expect, iso, 'совпадает с локальной датой');
    });

    test('_ruDate: yyyy-mm-dd → dd.mm.yyyy', () => {
        const host = makeHost({ marks: [] });
        assertEqual('05.02.2026', host._ruDate('2026-02-05'));
        assertEqual('31.12.2026', host._ruDate('2026-12-31'));
        assertEqual('', host._ruDate(''));
        assertEqual('битая', host._ruDate('битая'), 'непарсируемая — как есть');
    });

    test('_rebuildIndex: последняя запись главнее (дубли)', () => {
        const host = makeHost({ marks: [
            { id: 1, 'дата_выполнения': '2026-02-01', 'мероприятие': 'Проверка огнетушителей', 'год': 2026, 'месяц': 2 },
            { id: 2, 'дата_выполнения': '2026-02-07', 'мероприятие': 'Проверка огнетушителей', 'год': 2026, 'месяц': 2 },
            { id: 3, 'дата_выполнения': '2026-03-09', 'мероприятие': 'Отчёт по талонам', 'год': 2026, 'месяц': 3 }
        ] });
        host._rebuildIndex();
        assertEqual('2026-02-07',
            host._byKey[host._key(2026, 2, 'Проверка огнетушителей')]['дата_выполнения'],
            'дубль: взята ПОСЛЕДНЯЯ запись');
        assertEqual('2026-03-09',
            host._byKey[host._key(2026, 3, 'Отчёт по талонам')]['дата_выполнения'],
            'обычная запись проиндексирована');
    });

    test('_rebuildIndex: битые записи пропускаются', () => {
        const host = makeHost({ marks: [
            null,
            { id: 4, 'мероприятие': '', 'год': 2026, 'месяц': 5 },
            { id: 5, 'дата_выполнения': '2026-05-01', 'мероприятие': 'Отчёт по графику ППР', 'год': 2026, 'месяц': 5 }
        ] });
        host._rebuildIndex();
        const keys = Object.keys(host._byKey);
        assertEqual(1, keys.length, 'только валидная запись в индексе');
    });
});

// ============================================================
// 5. SRC — серверный эталон PlanEvents.gs
// ============================================================
describe('Task 463 — SRC: сервер PlanEvents.gs', () => {

    test('файл с шапкой Task 463 и ID таблицы Мероприятия_КИП_ИОС', () => {
        assertTrue(GS_SRC.indexOf('Task 463') !== -1, 'маркер задачи');
        assertTrue(GS_SRC.indexOf('1uX8Bz6FBS9HniZfWQnHeeyccTwwjwyvpPFWyFkIclCs') !== -1,
            'SPREADSHEET_ID нового файла');
        assertTrue(GS_SRC.indexOf("ARCHIVE_SHEET: 'Архив'") !== -1,
            'лист «Архив»');
    });

    test('list: доступ plan.events + фильтр по году', () => {
        const fn = stripComments(methodText(GS_SRC, 'list'));
        assertTrue(fn.indexOf("_requireAccess") !== -1, 'гейт доступа');
        assertTrue(fn.indexOf("payload.year") !== -1, 'фильтр года');
        assertTrue(fn.indexOf('_rowToMark') !== -1, 'парсер строк');
        assertTrue(fn.indexOf('marks') !== -1, 'возврат marks');
    });

    test('mark: валидация всех полей', () => {
        const fn = stripComments(methodText(GS_SRC, 'mark'));
        ['invalid_year', 'invalid_month', 'invalid_event', 'invalid_date'].forEach(function(code) {
            assertTrue(fn.indexOf(code) !== -1, 'код ошибки: ' + code);
        });
        assertTrue(fn.indexOf('year < 2000') !== -1, 'диапазон года');
        assertTrue(fn.indexOf('month < 1') !== -1, 'диапазон месяца');
    });

    test('mark: ИДЕМПОТЕНТНОСТЬ — дубль не создаётся', () => {
        const fn = stripComments(methodText(GS_SRC, 'mark'));
        assertTrue(fn.indexOf('already: true') !== -1,
            'ответ already при существующей записи');
        assertTrue(fn.indexOf('PLAN_EVENTS_MARK_IDEMPOTENT') !== -1,
            'аудит идемпотентного вызова');
        // appendRow идёт ПОСЛЕ цикла поиска дубля
        assertTrue(fn.indexOf('appendRow') > fn.indexOf('already: true'),
            'appendRow только если дубля нет');
    });

    test('mark: строка архива — 7 колонок (id, дата, мероприятие, год, месяц, email, время)', () => {
        const fn = stripComments(methodText(GS_SRC, 'mark'));
        const i = fn.indexOf('var row = [');
        const row = fn.slice(i, fn.indexOf(']', i) + 1);
        assertEqual(7, (row.match(/,/g) || []).length + 1,
            '7 значений в строке архива');
        assertTrue(row.indexOf('_isoNow()') !== -1, 'время отметки');
        assertTrue(row.indexOf('user.email') !== -1, 'email автора');
    });

    test('_requireAccess: rmRequirePerm plan.events, fail-closed', () => {
        const fn = stripComments(methodText(GS_SRC, '_requireAccess'));
        assertTrue(fn.indexOf("rmRequirePerm") !== -1, 'через RoleMatrixGate');
        assertTrue(fn.indexOf("'plan.events'") !== -1, 'право plan.events');
        assertTrue(fn.indexOf('access_denied') !== -1,
            'нет гейта → отказ всем (fail-closed)');
    });

    test('_normDate: Date-объект / yyyy-mm-dd / dd.mm.yyyy', () => {
        const fn = stripComments(methodText(GS_SRC, '_normDate'));
        assertTrue(fn.indexOf('[object Date]') !== -1, 'Date-объект');
        assertTrue(fn.indexOf('Utilities.formatDate') !== -1,
            'формат дат Apps Script');
        // dd.mm.yyyy → yyyy-mm-dd (ручное заполнение листа)
        assertTrue(fn.indexOf('\\\\d') !== -1 || fn.indexOf('\\d') !== -1,
            'regex-ветки');
    });

    test('_rowToMark: битые строки → null (молча)', () => {
        const fn = stripComments(methodText(GS_SRC, '_rowToMark'));
        assertTrue(fn.indexOf('return null') !== -1, 'битые пропускаются');
    });

    test('аудит отметок в audit_log', () => {
        assertTrue(GS_SRC.indexOf("Utils.audit") !== -1, 'Utils.audit есть');
        assertTrue(GS_SRC.indexOf("'PLAN_EVENTS_MARK'") !== -1,
            'код PLAN_EVENTS_MARK');
    });
});

// ============================================================
// 6. SRC — init-скрипт PlanEventsInit.gs
// ============================================================
describe('Task 463 — SRC: PlanEventsInit.gs (одноразовый)', () => {

    test('заголовки листа «Архив» — 7 колонок', () => {
        const i = INIT_SRC.indexOf('PE_HEADERS = [');
        const block = INIT_SRC.slice(i, INIT_SRC.indexOf(']', i) + 1);
        ['id', 'дата_выполнения', 'мероприятие', 'год', 'месяц', 'email',
         'время_отметки'].forEach(function(h) {
            assertTrue(block.indexOf("'" + h + "'") !== -1, 'столбец: ' + h);
        });
    });

    test('идемпотентность: существующий лист не перезаписывается', () => {
        const fn = INIT_SRC.slice(INIT_SRC.indexOf('function planEventsDeploy'),
                                  INIT_SRC.indexOf('function planEventsStatus'));
        assertTrue(fn.indexOf('уже существует') !== -1,
            'пропуск при существующем листе');
        assertTrue(fn.indexOf('insertSheet') !== -1, 'создание листа');
        assertTrue(fn.indexOf('return false') !== -1,
            'false — лист уже был');
    });

    test('даты текстом: формат @ на колонки B и G (паттерн Task 304)', () => {
        const fn = INIT_SRC.slice(INIT_SRC.indexOf('function planEventsDeploy'),
                                  INIT_SRC.indexOf('function planEventsStatus'));
        assertTrue(fn.indexOf("getRange('B2:B').setNumberFormat('@')") !== -1,
            'колонка B — текст');
        assertTrue(fn.indexOf("getRange('G2:G').setNumberFormat('@')") !== -1,
            'колонка G — текст');
    });

    test('тот же ID файла, что в PlanEvents.gs', () => {
        assertTrue(INIT_SRC.indexOf('1uX8Bz6FBS9HniZfWQnHeeyccTwwjwyvpPFWyFkIclCs') !== -1,
            'PE_SPREADSHEET_ID совпадает');
    });

    test('диагностика planEventsStatus ничего не меняет', () => {
        const fn = INIT_SRC.slice(INIT_SRC.indexOf('function planEventsStatus'));
        assertTrue(fn.indexOf('Logger.log') !== -1, 'только лог');
        assertFalse(fn.indexOf('setValues') !== -1 && fn.indexOf('PE_HEADERS') !== -1 && fn.indexOf('insertSheet') !== -1,
            'нет записей в статусе');
    });
});

// ============================================================
// 7. SRC — маршрутизация Code.gs
// ============================================================
describe('Task 463 — SRC: Code.gs маршрутизация', () => {

    test('case planEvents.list / planEvents.mark перед default', () => {
        assertTrue(CODE_SRC.indexOf("case 'planEvents.list':") !== -1,
            'case list');
        assertTrue(CODE_SRC.indexOf("case 'planEvents.mark':") !== -1,
            'case mark');
        const iList = CODE_SRC.indexOf("case 'planEvents.list':");
        const iDefault = CODE_SRC.indexOf('default:');
        assertTrue(iList !== -1 && iDefault !== -1 && iList < iDefault,
            'case до default');
        assertTrue(CODE_SRC.indexOf('PlanEvents.list(payload)') !== -1 &&
                   CODE_SRC.indexOf('PlanEvents.mark(payload)') !== -1,
            'вызовы модуля');
    });

    test('упоминание модуля в шапке Code.gs', () => {
        // Task 464: шапка дополнена — 'PlanEvents (Task 463/464)'
        assertTrue(CODE_SRC.indexOf('PlanEvents (Task 463') !== -1,
            'документация сигнатур дополнена');
    });
});

// ============================================================
// 8. SW: версия кэша
// ============================================================
describe('Task 463 — SW: версия кэша', () => {

    test('CACHE_VERSION = kipia-test-v731', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v731';") !== -1,
            'текущая версия v688 (бамп Task 464)');
    });

    test('v687 в sw.js отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v687') === -1,
            'версии до Task 464 нет');
    });

    test('комментарий Task 463 с файлом архива', () => {
        assertTrue(SW_SRC.indexOf('Task 463') !== -1, 'маркер задачи');
        assertTrue(SW_SRC.indexOf('Мероприятия_КИП_ИОС') !== -1,
            'упомянут файл архива');
        assertTrue(SW_SRC.indexOf('PlanEvents.gs') !== -1,
            'упомянут серверный модуль');
    });
});

console.log('test-task463: все describes зарегистрированы');
