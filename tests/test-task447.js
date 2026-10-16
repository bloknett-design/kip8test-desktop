// ============================================================
// Task 447 — заявка: «В разделе Табель учёта рабочего времени, в
// баре с кнопками добавь кнопку "Талоны", для перехода на страницу
// формирования отчёта по талонам питания выданным работникам на
// текущий месяц. Строгая форма отчёта приложена в файле excel
// (изначально файл не дошёл — форма была собрана по стандарту;
// Task 448 привёл печатную вёрстку СТРОГО к присланному листу
// «Отчет»), печатать отчёт необходимо строго по ней. Предварительно
// формируется отчёт о количестве выданных талонов работникам на
// текущий месяц в соответствии с количеством дней явки работников
// по итогам учёта в шахматке табеля, и с возможностью ручной
// правки количества талонов перед печатью отчёта. Архив данного
// раздела не нужен, отображение кнопки, доступ к разделу и
// внесение правок доступны только пользователем с доступом в
// файле KIP8_Access, в таблице matrix, с галочкой в
// workschedule.edit (График работы — внесение).»
//
// Реализация (полностью КЛИЕНТСКАЯ, index.html):
//   • кнопка «Талоны» #wsTalonsBtn (ряд 1, рядом с «Работники») —
//     ТОЛЬКО уровню edit (workschedule.edit): init/_onRoleUpdate;
//   • страница #page-ws-talons (+ PAGE_PARENTS/PAGE_LABELS/хук
//     navigateTo/_WORK_SCHEDULE_PAGES): гейт — не-редакторов
//     возвращает в табель;
//   • явки — дни с рабочими часами ВКЛЮЧАЯ ПЕРЕРАБОТКУ («д»/«н»)
//     (_talonsAgg, Task 452) по ЭФФЕКТИВНЫМ записям месяца
//     (серверные + _PENDING, фильтр по YYYY-MM); талоны — ПО
//     ДНЯМ: 7,2/8 ч → 8ч, 12 ч → 12ч (Task 452), ручная правка —
//     карта _TALONS_EDIT (память сессии, архив не нужен);
//   • месяц отчёта — МЕСЯЦ ОТКРЫТОЙ ШАХМАТКИ (Task 455;
//     подтяжка _talonsFetchMonth и кэш _TALONS_CACHE удалены,
//     записи — всегда живая сетка);
//   • печать строго по форме: #wsPrintSheet.wst-sheet + инжект
//     @page A4 portrait (перекрывает альбомную графика) +
//     предпросмотр (Только «Печать»/«Отмена», без PDF/Excel).
// ============================================================

const fs = require('fs');
const path = require('path');
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
    if (m === null) throw new Error('метод не найден: ' + name);
    return m;
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const NOW = new Date();
const NOWY = NOW.getFullYear();
const NOWM = NOW.getMonth() + 1;
const MM = (NOWM < 10 ? '0' + NOWM : '' + NOWM);
// Срез модуля WorkSchedule (имена init/_esc и пр. неуникальны в
// монолите — извлекаем методы только из модуля табеля)
const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// Значение строковой константы _TALONS_PRINT_CSS (НЕ функция —
// вычисляем конкатенацию фрагментов из исходника; Task 448:
// константа заканчивается правилом сетки .wst-c7)
const TALONS_CSS_VALUE = new Function('return ({' + (function() {
    const start = WS_SRC.indexOf('_TALONS_PRINT_CSS:');
    const marker = "'#wsPrintSheet.wst-sheet .wst-c7 { width: 22.2%; }',";
    const end = WS_SRC.indexOf(marker, start);
    if (start === -1 || end === -1) throw new Error('_TALONS_PRINT_CSS не найден');
    return WS_SRC.slice(start, end + marker.length);
})() + '})._TALONS_PRINT_CSS;')();

const MONTH_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
                     'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const D = (md) => (NOWY + '-' + md);

// ============================================================
// 1. SRC — кнопка, страница, навигация, права
// ============================================================
describe('Task 447 — SRC: кнопка/страница/навигация', () => {

    test('кнопка «Талоны» — ряд 1 тулбара, рядом с «Работники», скрыта по умолчанию', () => {
        const iBtn = INDEX_SRC.indexOf('id="wsTalonsBtn"');
        assertTrue(iBtn !== -1, 'кнопка #wsTalonsBtn есть');
        const iWorkers = INDEX_SRC.indexOf('id="wsWorkersBtn"');
        const iSelectsRow = INDEX_SRC.indexOf('id="wsSelectsRow"');
        assertTrue(iSelectsRow !== -1 && iWorkers !== -1 &&
                   iWorkers < iBtn,
            'кнопка после «Работники» (ряд 1)');
        const seg = INDEX_SRC.slice(iBtn, iBtn + 700);
        assertTrue(seg.indexOf('hidden') !== -1,
            'hidden в разметке — видимость решает init/_onRoleUpdate');
        assertTrue(seg.indexOf('onclick="WorkSchedule.openTalonsPage()"') !== -1,
            'клик — openTalonsPage');
        assertTrue(seg.indexOf('ws-refresh-btn ws-talons-btn') !== -1,
            'стиль — как у кнопок ряда 1');
    });

    test('страница #page-ws-talons: шапка «Талоны» + тело', () => {
        const iPage = INDEX_SRC.indexOf('id="page-ws-talons"');
        assertTrue(iPage !== -1, 'страница есть');
        const seg = INDEX_SRC.slice(iPage, iPage + 900);
        assertTrue(seg.indexOf('page-inline-header-title">Талоны<') !== -1,
            'заголовок страницы — «Талоны»');
        assertTrue(seg.indexOf('id="wsTalonsBody"') !== -1 &&
                   seg.indexOf('ws-talons-body') !== -1,
            'тело страницы #wsTalonsBody');
    });

    test('регистрация навигации: PAGE_PARENTS / PAGE_LABELS / хук navigateTo', () => {
        assertTrue(INDEX_SRC.indexOf("'ws-talons':                'work-schedule',") !== -1,
            'PAGE_PARENTS: дочь табеля');
        assertTrue(INDEX_SRC.indexOf("'ws-talons':                'Талоны',") !== -1,
            'PAGE_LABELS: метка «Талоны»');
        const iHook = INDEX_SRC.indexOf("if (page === 'ws-talons')");
        assertTrue(iHook !== -1, 'хук navigateTo есть');
        const seg = INDEX_SRC.slice(iHook, iHook + 250);
        assertTrue(seg.indexOf('onTalonsPageOpen') !== -1,
            'хук зовёт onTalonsPageOpen');
    });

    test('_WORK_SCHEDULE_PAGES: ws-talons в группе прав табеля', () => {
        assertTrue(INDEX_SRC.indexOf(
            "_WORK_SCHEDULE_PAGES: ['work-schedule', 'ws-totals', 'ws-workers', 'ws-legend', 'ws-talons'],") !== -1,
            'страница в списке прав раздела (edit даёт группу целиком)');
    });

    test('видимость кнопки — ТОЛЬКО уровню edit (init + _onRoleUpdate)', () => {
        const initFn = methodText(WS_SRC, 'init');
        const iInit = initFn.indexOf('talonsBtnInit');
        assertTrue(iInit !== -1, 'init обрабатывает кнопку');
        const seg = initFn.slice(iInit, iInit + 220);
        assertTrue(seg.indexOf("talonsBtnInit.hidden = (this._viewLevel !== 'edit')") !== -1,
            'init: скрыта всем, кроме edit');
        const roleFn = methodText(WS_SRC, '_onRoleUpdate');
        const iRole = roleFn.indexOf('talonsBtn');
        assertTrue(iRole !== -1, '_onRoleUpdate обрабатывает кнопку');
        const seg2 = roleFn.slice(iRole, seg ? iRole + 200 : 200);
        assertTrue(seg2.indexOf("talonsBtn.hidden = (newLevel !== 'edit')") !== -1,
            '_onRoleUpdate: скрыта всем, кроме edit');
    });

    test('гейты: openTalonsPage (toast) / onTalonsPageOpen (redirect)', () => {
        const open = stripComments(methodText(WS_SRC, 'openTalonsPage'));
        assertTrue(open.indexOf("this._viewLevel !== 'edit'") !== -1,
            'openTalonsPage: гейт edit');
        assertTrue(open.indexOf('Раздел «Талоны» доступен только с правом') !== -1,
            'openTalonsPage: тост-пояснение');
        const onOpen = stripComments(methodText(WS_SRC, 'onTalonsPageOpen'));
        assertTrue(onOpen.indexOf("this._viewLevel !== 'edit'") !== -1 &&
                   onOpen.indexOf("navigateTo('work-schedule')") !== -1,
            'onTalonsPageOpen: не-редактора — назад в табель (прямой URL)');
        assertTrue(onOpen.indexOf('this.init()') !== -1,
            'onTalonsPageOpen: deep link — первая инициализация модуля');
    });
});

// ============================================================
// 2. SRC — модель отчёта и правки
// ============================================================
describe('Task 447 — SRC: модель/правки', () => {

    test('_talonsRows: источник месяца + предзаполнение по явкам', () => {
        const fn = stripComments(methodText(WS_SRC, '_talonsRows'));
        assertTrue(fn.indexOf('var entries = this._ENTRIES;') !== -1,
            'записи — ВСЕГДА живая сетка (Task 455: месяц отчёта = месяцу шахматки)');
        assertTrue(fn.indexOf('this._TALONS_CACHE') === -1,
            'кэш подтянутого месяца удалён (Task 455 — не нужен)');
        assertTrue(fn.indexOf('ready') === -1,
            'мёртвое поле ready убрано из модели (Task 455)');
        assertTrue(fn.indexOf('var days = a ? a.days : 0;') !== -1,
            'дни явки — счётчик дней _talonsAgg (с переработкой — Task 452)');
        assertTrue(fn.indexOf('var agg = this._talonsAgg(eff,') !== -1,
            'агрегация — ПО-ДНЁВНАЯ классификация (_talonsAgg, Task 452)');
        assertTrue(fn.indexOf('var auto12 = a ? a.t12 : 0;') !== -1 &&
                   fn.indexOf('var auto8 = a ? a.t8 : 0;') !== -1,
            'авто: 12/8ч талоны — по часам дней (7,2/8 → 8ч, 12 → 12ч; Task 452)');
        assertTrue(fn.indexOf('is12') === -1,
            'тип работника категорию больше НЕ определяет (Task 452)');
        assertTrue(fn.indexOf('edit.t12 !== undefined && edit.t12 !== auto12') !== -1 &&
                   fn.indexOf('edit.t8 !== undefined && edit.t8 !== auto8') !== -1,
            'правка категории перекрывает авто (категории независимы — Task 451)');
        assertTrue(fn.indexOf("localeCompare(famOf(b), 'ru')") !== -1,
            'сортировка по алфавиту фамилий (Task 451)');
    });

    test('_talonsEffectiveEntries: правки _PENDING с фильтром месяца', () => {
        const fn = stripComments(methodText(WS_SRC, '_talonsEffectiveEntries'));
        assertTrue(fn.indexOf('p.__delete') !== -1,
            'запланированное удаление исключает день');
        assertTrue(fn.indexOf("indexOf(ym) !== 0") !== -1,
            'правки ЧУЖОГО месяца в отчёт не попадают (префикс YYYY-MM-)');
        assertTrue(fn.indexOf("'источник': 'руч'") !== -1,
            'новая правка дня без записи — добавляется как «руч»');
    });

    test('onTalonsInput: живая правка категории без ре-рендера', () => {
        const fn = stripComments(methodText(WS_SRC, 'onTalonsInput'));
        assertTrue(fn.indexOf("cat !== 't12' && cat !== 't8'") !== -1,
            'категория поля — t12 | t8 (Task 451: две колонки талонов)');
        assertTrue(fn.indexOf('val === auto') !== -1 &&
                   fn.indexOf('delete cur[cat];') !== -1 &&
                   fn.indexOf('delete this._TALONS_EDIT[tab];') !== -1,
            'значение РАВНОЕ авто снимает правку; пустой объект — ключ целиком');
        assertTrue(fn.indexOf('!isFinite(val) || val < 0') !== -1 &&
                   fn.indexOf('val = 0') !== -1,
            'некорректное/отрицательное — 0');
        assertTrue(fn.indexOf('_talonsUpdateTotals') !== -1 &&
                   fn.indexOf('_renderTalonsPage') === -1,
            'итоги — точечно, полного ре-рендера НЕТ (фокус не теряется)');
    });

    test('архив не нужен: правки в памяти сессии, НЕ localStorage', () => {
        const block = INDEX_SRC.slice(INDEX_SRC.indexOf('_TALONS_EDIT: {}'),
                                      INDEX_SRC.indexOf('_TALONS_EDIT: {}') + 40000);
        const talonsSeg = block.slice(0, block.indexOf('printTalonsReport'));
        assertTrue(talonsSeg.indexOf('localStorage') === -1,
            'раздел не пишет в localStorage (архив не нужен по заявке)');
        const reset = stripComments(methodText(WS_SRC, 'talonsResetEdits'));
        assertTrue(reset.indexOf("this._TALONS_EDIT = {}") !== -1,
            'сброс правок — чистая карта');
    });
});

// ============================================================
// 3. SRC — печать строго по форме
// ============================================================
describe('Task 447 — SRC: печать по форме', () => {

    test('printTalonsReport: лист + класс wst-sheet + инжект книжной @page', () => {
        const fn = stripComments(methodText(WS_SRC, 'printTalonsReport'));
        assertTrue(fn.indexOf("this._viewLevel !== 'edit'") !== -1,
            'гейт уровня');
        assertTrue(fn.indexOf("sheet.className = 'wst-sheet'") !== -1,
            'лист #wsPrintSheet получает класс отчёта');
        assertTrue(fn.indexOf('_talonsInjectPrintStyle') !== -1,
            'инжект-стиль книжной ориентации');
        assertTrue(fn.indexOf('_openTalonsPreview') !== -1 &&
                   fn.indexOf('if (!opened) window.print()') !== -1,
            'предпросмотр + фолбэк печать сразу');
    });

    test('printGrid снимает класс отчёта (печать графика — базовые правила)', () => {
        const fn = stripComments(methodText(WS_SRC, 'printGrid'));
        assertTrue(fn.indexOf("sheet.className = '';") !== -1,
            'сброс wst-sheet перед сборкой графика');
    });

    test('_openPrintPreview закрывает предпросмотр талонов (ориентации не смешиваются)', () => {
        const fn = stripComments(methodText(WS_SRC, '_openPrintPreview'));
        assertTrue(fn.indexOf('_closeTalonsPreview') !== -1,
            'диалоги взаимоисключающие');
    });

    test('_renderGrid: хук _renderTalonsIfOpen', () => {
        const fn = stripComments(methodText(WS_SRC, '_renderGrid'));
        assertTrue(fn.indexOf('this._renderTalonsIfOpen()') !== -1,
            'открытая страница «Талоны» обновляется с данными сетки');
    });

    test('инжект-стиль: @page A4 PORTRAIT перекрывает альбомную графика', () => {
        const fn = stripComments(methodText(WS_SRC, '_talonsInjectPrintStyle'));
        assertTrue(fn.indexOf('@page { size: A4 portrait; margin: 12mm 10mm; }') !== -1,
            'книжная ориентация + поля');
        assertTrue(fn.indexOf("getElementById('wsTalonsPrintStyle')") !== -1,
            'идемпотентен (один style-элемент)');
        assertTrue(fn.indexOf('this._TALONS_PRINT_CSS') !== -1,
            'правила формы — из константы');
        const rm = stripComments(methodText(WS_SRC, '_talonsRemovePrintStyle'));
        assertTrue(rm.indexOf("removeChild") !== -1,
            'снятие инжекта (печать графика снова альбомная)');
    });

    test('_buildTalonsPrintHtml: строгая структура формы (Task 448 — по Excel)', () => {
        const fn = methodText(WS_SRC, '_buildTalonsPrintHtml');
        for (const part of ['Наименование предприятия ООО ПО "Токем"',
                            '>ОТЧЕТ<',
                            'на выдачу талонов Л.П.П. (лечебно-профилактическое питание) за ',
                            'Цех № 8 пр-во ИОС', '№<br>п/п', 'Табельный номер',
                            'Ф.И.О.', 'Должность',
                            'Кол-во отработан-ных часов',
                            'Кол-во выданных талонов', 'Роспись о получении',
                            '12 часовые', '8 часовые', 'ИТОГО:', '(шт.)',
                            'Рук. подразделения', 'Игушов Н.В.',
                            'С табелем сверено:', 'Котельникова И.А.',
                            '(подпись материально-ответственного лица)',
                            'Руководитель СОТ и ПБ', 'Фензель В.П.',
                            '(подпись)']) {
            assertTrue(fn.indexOf(part) !== -1, 'форма содержит: ' + part);
        }
        assertTrue(fn.indexOf('wst-rep-table') !== -1 &&
                   fn.indexOf('table-header-group') === -1,
            'таблица формы (повтор шапки — в CSS-константе)');
        // старая вёрстка (до Task 448) полностью ушла
        for (const gone of ['Отчёт составил:', '(расшифровка)',
                            'wst-rep-period', 'Дней явки', 'wst-r-num']) {
            assertTrue(fn.indexOf(gone) === -1, 'старого блока нет: ' + gone);
        }
    });

    test('_TALONS_PRINT_CSS: Times New Roman, рамки, повтор шапки', () => {
        const fn = TALONS_CSS_VALUE;
        assertTrue(fn.indexOf('Times New Roman') !== -1,
            'строгий шрифт — Times New Roman');
        assertTrue(fn.indexOf('border: 1px solid #000') !== -1,
            'рамки таблицы — чёткие чёрные');
        assertTrue(fn.indexOf('table-header-group') !== -1 &&
                   fn.indexOf('page-break-inside: avoid') !== -1,
            'многостраничность: повтор шапки, строки не рвутся');
        assertTrue(fn.indexOf('.wst-rep-title') !== -1 &&
                   fn.indexOf('.wst-rep-org') !== -1 &&
                   fn.indexOf('.wst-rep-dept') !== -1,
            'шапка формы: предприятие + заголовок + цех (Task 448)');
        assertTrue(fn.indexOf('.wst-rep-period') === -1,
            'старого класса периода больше нет');
    });

    test('_buildTalonsFileHtml: standalone-документ КНИЖНОГО листа', () => {
        const fn = methodText(WS_SRC, '_buildTalonsFileHtml');
        assertTrue(fn.indexOf('@page { size: A4 portrait; margin: 12mm 10mm; }') !== -1,
            '@page портрет');
        assertTrue(fn.indexOf('width: 190mm') !== -1,
            'лист 190мм (A4 минус поля)');
        assertTrue(fn.indexOf('<div id="wsPrintSheet" class="wst-sheet">') !== -1,
            'тот же каркас, что печать');
        assertTrue(fn.indexOf('Times New Roman') !== -1,
            'шрифт формы');
    });

    test('предпросмотр талонов: только «Печать»/«Отмена» (форма строгая)', () => {
        const fn = stripComments(methodText(WS_SRC, '_openTalonsPreview'));
        assertTrue(fn.indexOf('wspprev-print') !== -1 &&
                   fn.indexOf('wspprev-cancel') !== -1,
            'кнопки «Печать» и «Отмена»');
        assertTrue(fn.indexOf('wspprev-pdf') === -1 &&
                   fn.indexOf('wspprev-xlsx') === -1,
            'БЕЗ «Сохранить PDF/Excel» (не форма графика)');
        assertTrue(fn.indexOf('A4 · книжная') !== -1,
            'подсказка ориентации');
        assertTrue(fn.indexOf('wst-prev-frame') !== -1,
            'книжный лист предпросмотра');
        assertTrue(fn.indexOf('window.print()') !== -1,
            'печать — основного документа');
        const close = stripComments(methodText(WS_SRC, '_closeTalonsPreview'));
        assertTrue(close.indexOf('_talonsRemovePrintStyle') !== -1,
            'закрытие снимает инжект книжной @page');
    });
});

// ============================================================
// 4. VM — модель отчёта
// ============================================================
describe('Task 447 — VM: _talonsMonthInfo / _talonsEffectiveEntries', () => {

    function baseHost(extra) {
        return new Function('return ({' +
            methodText(WS_SRC, '_talonsMonthInfo') + ',\n' +
            methodText(WS_SRC, '_talonsEffectiveEntries') + ',\n' +
            '_PENDING: {},' +
            '});')();
    }

    test('_talonsMonthInfo: МЕСЯЦ ШАХМАТКИ; без сетки — текущий (Task 455)', () => {
        const h = baseHost();
        // сетка не инициализирована (deep link до init) — фолбэк
        const mi0 = h._talonsMonthInfo();
        assertEqual(mi0.y, NOWY, 'фолбэк: год — текущий');
        assertEqual(mi0.m, NOWM, 'фолбэк: месяц — текущий');
        assertEqual(mi0.name, MONTH_NAMES[NOWM - 1],
            'фолбэк: имя месяца (нижний регистр)');
        // сетка на ПРОШЛОМ месяце — отчёт следует за ней
        const pm = (NOWM > 1) ? (NOWM - 1) : 12;
        const pmY = (NOWM > 1) ? NOWY : NOWY - 1;
        h._year = pmY; h._month = pm;
        const mi = h._talonsMonthInfo();
        assertEqual(mi.y, pmY, 'год — месяц сетки (переход года)');
        assertEqual(mi.m, pm, 'месяц — месяц сетки');
        assertEqual(mi.name, MONTH_NAMES[pm - 1], 'имя — месяц сетки');
    });

    test('правки _PENDING накладываются, __delete исключает день', () => {
        const h = baseHost();
        h._PENDING = {};
        h._PENDING[D(MM + '-05') + '|017'] = { 'статус': 'Д8' };
        h._PENDING[D(MM + '-06') + '|031'] = { '__delete': true };
        const entries = [
            { 'дата': D(MM + '-01'), 'таб_номер': '017', 'статус': 'Н' },
            { 'дата': D(MM + '-06'), 'таб_номер': '031', 'статус': 'Д' },
            { 'дата': D(MM + '-07'), 'таб_номер': '031', 'статус': 'ОТ' }
        ];
        const out = h._talonsEffectiveEntries(entries, NOWY, NOWM);
        assertEqual(out.length, 3,
            'правка дня легла поверх записи, __delete убрал запись, третья жива');
        const patched = out.filter(function(e) {
            return e['таб_номер'] === '017' && e['дата'] === D(MM + '-05');
        });
        assertEqual(patched.length, 1, 'правка дня добавлена (записи не было)');
        assertEqual(patched[0]['статус'], 'Д8', 'правка дня со статусом Д8');
        assertEqual(out.filter(function(e) { return e['таб_номер'] === '031'; }).length, 1,
            'день 031 с __delete исключён');
    });

    test('правки ЧУЖОГО месяца не попадают; новая правка дня без записи — «руч»', () => {
        const h = baseHost();
        h._PENDING = {};
        // правка прошлого месяца (тот же год) — мимо
        const pm = (NOWM > 1) ? (NOWM - 1) : 12;
        const pmY = (NOWM > 1) ? NOWY : NOWY - 1;
        const pmM = (pm < 10 ? '0' + pm : '' + pm);
        h._PENDING[pmY + '-' + pmM + '-05|017'] = { 'статус': 'Д' };
        // правка текущего месяца без записи — добавляется
        h._PENDING[D(MM + '-09') + '|031'] = { 'статус': 'Д8' };
        const out = h._talonsEffectiveEntries(
            [{ 'дата': D(MM + '-01'), 'таб_номер': '017', 'статус': 'Н' }], NOWY, NOWM);
        assertEqual(out.length, 2, 'своя запись + добавленная правка (чужой месяц мимо)');
        assertEqual(out[1]['таб_номер'], '031', 'добавленная правка — работник 031');
        assertEqual(out[1]['источник'], 'руч', 'источник — «руч»');
    });
});

describe('Task 447 — VM: _talonsRows', () => {

    const EMP = [
        { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
          'должность': 'Слесарь КИПиА' },
        { 'таб_номер': '031', 'ФИО': 'Сидоров С. С.', 'тип': 'сменный', 'смена': 3,
          'должность': 'Электромонтёр' }
    ];

    function rowsHost(opts) {
        opts = opts || {};
        return new Function('return ({' +
            methodText(WS_SRC, '_talonsMonthInfo') + ',\n' +
            methodText(WS_SRC, '_talonsEffectiveEntries') + ',\n' +
            methodText(WS_SRC, '_talonsRows') + ',\n' +
            methodText(WS_SRC, '_talonsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsZero') + ',\n' +
            methodText(WS_SRC, '_empTypeMap') + ',\n' +
            methodText(WS_SRC, '_codeHours') + ',\n' +
            methodText(WS_SRC, '_overHours') + ',\n' +
            methodText(WS_SRC, '_statusMeta') + ',\n' +
            '_EMPLOYEES: ' + JSON.stringify(opts.employees || EMP) + ',' +
            '_ENTRIES: ' + JSON.stringify(opts.entries || []) + ',' +
            '_PENDING: ' + JSON.stringify(opts.pending || {}) + ',' +
            '_TALONS_EDIT: ' + JSON.stringify(opts.edits || {}) + ',' +
            '_year: ' + (opts.year !== undefined ? opts.year : 'null') + ',' +
            '_month: ' + (opts.month !== undefined ? opts.month : 'null') + ',' +
            '_STATUS_CODES: [],' +
            '});')();
    }

    test('сетка на текущем месяце: талоны предзаполнены по явкам (12/8 раздельно)', () => {
        const entries = [
            { 'дата': D(MM + '-01'), 'таб_номер': '017', 'статус': 'Д8' },
            { 'дата': D(MM + '-02'), 'таб_номер': '017', 'статус': 'Д8' },
            { 'дата': D(MM + '-03'), 'таб_номер': '017', 'статус': 'ОТ' },
            { 'дата': D(MM + '-04'), 'таб_номер': '031', 'статус': 'Н' }
        ];
        const h = rowsHost({ entries: entries, year: NOWY, month: NOWM });
        const m = h._talonsRows();
        assertEqual(m.rows.length, 2, 'строка на каждого работника');
        // порядок — ПО АЛФАВИТУ фамилий (Иванов < Сидоров)
        assertEqual(m.rows[0].emp['ФИО'], 'Иванов И. И.', 'первый — Иванов (алфавит)');
        const iv = m.rows[0];
        assertEqual(iv.days, 2, 'Иванов: 2 явки (Д8×2; ОТ — не явка)');
        assertEqual(iv.t8, 2, 'дневной: 8ч талоны = явкам (Task 451)');
        assertEqual(iv.t12, 0, 'дневной: 12ч талоны — авто 0 (Task 451)');
        assertFalse(iv.edited, 'без правки');
        const sid = m.rows[1];
        assertEqual(sid.days, 1, 'Сидоров: 1 явка (Н)');
        assertEqual(sid.t12, 1, 'сменный: 12ч талоны = явкам (Task 451)');
        assertEqual(sid.t8, 0, 'сменный: 8ч талоны — авто 0 (Task 451)');
        assertEqual(m.totals.t12, 1, 'итого 12ч талонов — отдельно (Task 451)');
        assertEqual(m.totals.t8, 2, 'итого 8ч талонов — отдельно (Task 451)');
        assertEqual(m.totals.edited, 0, 'правок нет');
    });

    test('несохранённые правки ячеек учитываются (как в итогах учёта)', () => {
        const h = rowsHost({ entries: [
            { 'дата': D(MM + '-01'), 'таб_номер': '017', 'статус': 'ОТ' }
        ], year: NOWY, month: NOWM,
            pending: (function() { const p = {};
                p[D(MM + '-01') + '|017'] = { 'статус': 'Д8' }; return p; })() });
        const m = h._talonsRows();
        assertEqual(m.rows[0].days, 1,
            'правка ячейки поверх записи: день стал явкой');
    });

    test('ручная правка талонов перекрывает авто категории, правки — в итогах', () => {
        const h = rowsHost({ entries: [
            { 'дата': D(MM + '-01'), 'таб_номер': '017', 'статус': 'Д8' },
            { 'дата': D(MM + '-02'), 'таб_номер': '017', 'статус': 'Д8' },
            { 'дата': D(MM + '-03'), 'таб_номер': '017', 'статус': 'Д8' },
            { 'дата': D(MM + '-01'), 'таб_номер': '031', 'статус': 'Н' }
        ], year: NOWY, month: NOWM, edits: { '017': { t8: 5 } } });
        const m = h._talonsRows();
        const iv = m.rows[0];
        assertEqual(iv.days, 3, 'явок — 3');
        assertEqual(iv.t8, 5, 'правка: 5 8ч-талонов у дневного (Task 451)');
        assertTrue(iv.edited, 'строка помечена правленной');
        assertEqual(m.totals.t12, 1, 'итого 12ч: 1 (Сидоров по явкам)');
        assertEqual(m.totals.t8, 5, 'итого 8ч: 5 (правка Иванова)');
        assertEqual(m.totals.edited, 1, 'одна правка');
    });

    test('другой месяц сетки: отчёт по НЕМУ из живых записей (Task 455)', () => {
        // сетка на ПРОШЛОМ месяце с записями — модель строится по
        // записям СЕТКИ (кэш/подтяжка удалены, ready в модели нет)
        const pm = (NOWM > 1) ? (NOWM - 1) : 12;
        const pmY = (NOWM > 1) ? NOWY : NOWY - 1;
        const pmm = (pm < 10 ? '0' + pm : '' + pm);
        const h = rowsHost({ year: pmY, month: pm, entries: [
            { 'дата': pmY + '-' + pmm + '-01', 'таб_номер': '017', 'статус': 'Д' }
        ] });
        const m = h._talonsRows();
        assertEqual(m.month.y, pmY, 'модель: год — месяц сетки');
        assertEqual(m.month.m, pm, 'модель: месяц — месяц сетки');
        assertEqual(m.rows[0].days, 1, 'явка из записей сетки (1 день)');
        assertEqual(m.rows[0].t12, 1,
            'смена 12 ч — 12ч талон даже у дневного (Task 452)');
        assertEqual(m.rows[0].t8, 0, '8ч талоны — 0 (день 12-часовой)');
    });

    test('работник без записей — 0 явок, строка в отчёте', () => {
        const h = rowsHost({ entries: [], year: NOWY, month: NOWM });
        const m = h._talonsRows();
        assertEqual(m.rows.length, 2, 'обе строки в отчёте');
        assertEqual(m.rows[0].days, 0, 'явок 0 (месяц не сформирован)');
        assertEqual(m.rows[0].t8, 0, '8ч талонов 0 (дневной, авто)');
        assertEqual(m.rows[0].t12, 0, '12ч талонов 0 (авто)');
    });
});

// ============================================================
// 5. VM — правка input / сброс / обновление
// ============================================================
describe('Task 447 — VM: onTalonsInput / talonsResetEdits', () => {

    function inputHost(toast) {
        const el = {
            _v: '', _cls: 'wst-count',
            get value() { return this._v; },
            set value(x) { this._v = x; },
            get className() { return this._cls; },
            set className(x) { this._cls = x; },
            getAttribute: function(k) {
                if (k === 'data-tab') return '017';
                // Task 451: категория + авто-количество (дневной,
                // 3 явки — авто 8ч = 3, соответствует модели хоста)
                if (k === 'data-cat') return 't8';
                if (k === 'data-auto') return '3';
                return null;
            },
            parentNode: null
        };
        const badge = { textContent: '', className: 'wst-diff', hidden: true };
        el.parentNode = { querySelector: function(sel) {
            return (sel === '.wst-diff') ? badge : null;
        } };
        const dom = {
            _vals: {},
            getElementById: function(id) {
                if (!this._vals.hasOwnProperty(id)) {
                    this._vals[id] = { textContent: '', hidden: false };
                }
                return this._vals[id];
            }
        };
        const h = new Function('KipToast', 'document', 'return ({' +
            methodText(WS_SRC, '_talonsMonthInfo') + ',\n' +
            methodText(WS_SRC, '_talonsEffectiveEntries') + ',\n' +
            methodText(WS_SRC, '_talonsRows') + ',\n' +
            methodText(WS_SRC, '_talonsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsZero') + ',\n' +
            methodText(WS_SRC, '_empTypeMap') + ',\n' +
            methodText(WS_SRC, 'onTalonsInput') + ',\n' +
            methodText(WS_SRC, '_talonsUpdateTotals') + ',\n' +
            methodText(WS_SRC, 'talonsResetEdits') + ',\n' +
            methodText(WS_SRC, '_renderTalonsPage') + ',\n' +
            '_codeHours: function() { return 0; },' +
            '_overHours: function() { return 0; },' +
            '_statusMeta: function() { return null; },' +
            '_esc: function(s) { return String(s); },' +
            "_escAttr: function(s) { return String(s); }," +
            '_apiErrText: function(e) { return String(e); },' +
            '_EMPLOYEES: [{ "таб_номер": "017", "ФИО": "Иванов И. И.", "тип": "дневной", "должность": "Слесарь" }],' +
            '_ENTRIES: ' + JSON.stringify([
                { 'дата': NOWY + '-' + MM + '-01', 'таб_номер': '017', 'статус': 'Д8' },
                { 'дата': NOWY + '-' + MM + '-02', 'таб_номер': '017', 'статус': 'Д8' },
                { 'дата': NOWY + '-' + MM + '-03', 'таб_номер': '017', 'статус': 'Д8' }]) + ',' +
            '_PENDING: {},' +
            '_TALONS_EDIT: {},' +
            '_year: ' + NOWY + ', _month: ' + NOWM + ',' +
            '_viewLevel: "edit", _canEdit: true,' +
            '_STATUS_CODES: [],' +
            '});')(toast, dom);
        h._el = el;
        h._badge = badge;
        h._dom = dom;
        return h;
    }

    test('правка ≠ авто: карта категории + класс + бейдж разницы', () => {
        const h = inputHost(undefined);
        h._el._v = '7';
        h.onTalonsInput(h._el);
        assertEqual(h._TALONS_EDIT['017'].t8, 7, 'правка сохранена в категории t8');
        assertEqual(h._el.className, 'wst-count wst-count-edited',
            'поле подсвечено как правленное');
        assertEqual(h._badge.textContent, '+4', 'бейдж: +4 к авто 3');
        assertEqual(h._badge.className, 'wst-diff wst-diff-up', 'больше — зелёный');
        assertFalse(h._badge.hidden, 'бейдж виден');
    });

    test('правка МЕНЬШЕ авто: бейдж отрицательный', () => {
        const h = inputHost(undefined);
        h._el._v = '1';
        h.onTalonsInput(h._el);
        assertEqual(h._TALONS_EDIT['017'].t8, 1, 'правка 1 в категории t8');
        assertEqual(h._badge.textContent, '-2', 'бейдж: −2');
        assertEqual(h._badge.className, 'wst-diff wst-diff-down', 'меньше — оранжево-красный');
    });

    test('значение = авто: правка снимается, бейдж скрыт', () => {
        const h = inputHost(undefined);
        h._TALONS_EDIT['017'] = { t8: 9 };
        h._el._v = '3';
        h.onTalonsInput(h._el);
        assertFalse(Object.prototype.hasOwnProperty.call(h._TALONS_EDIT, '017'),
            'правка снята (пустой объект — ключ целиком, авто-подсчёт)');
        assertEqual(h._el.className, 'wst-count', 'подсветка снята');
        assertTrue(h._badge.hidden, 'бейдж скрыт');
    });

    test('снятие одной категории НЕ трогает вторую (обе правки независимы)', () => {
        const h = inputHost(undefined);
        h._TALONS_EDIT['017'] = { t12: 2, t8: 9 };
        h._el._v = '3'; // t8 = авто 3 → правка t8 снята, t12 жива
        h.onTalonsInput(h._el);
        assertEqual(h._TALONS_EDIT['017'].t12, 2,
            'правка t12 сохранена при снятии t8');
        assertFalse(Object.prototype.hasOwnProperty.call(h._TALONS_EDIT['017'], 't8'),
            'поле t8 снято');
    });

    test('некорректное/отрицательное значение — 0', () => {
        const h = inputHost(undefined);
        h._el._v = '-5';
        h.onTalonsInput(h._el);
        assertEqual(h._TALONS_EDIT['017'].t8, 0, 'отрицательное — 0');
        h._el._v = 'abc';
        h.onTalonsInput(h._el);
        assertEqual(h._TALONS_EDIT['017'].t8, 0, 'не-число — 0');
    });

    test('итоги страницы пересчитаны точечно (чипы 12/8 + строка Итого)', () => {
        const h = inputHost(undefined);
        h._el._v = '7';
        h.onTalonsInput(h._el);
        // у Иванова авто 8ч = 3 явкам → правка 7: итог 8ч = 7, 12ч = 0
        assertEqual(h._dom._vals['wstTotalT8'].textContent, '7',
            'итого 8ч талонов обновлено');
        assertEqual(h._dom._vals['wstTotalT8Chip'].textContent, '7',
            'чип шапки 8ч обновлён');
        assertEqual(h._dom._vals['wstTotalT12Chip'].textContent, '0',
            'чип шапки 12ч — отдельно (Task 451)');
        assertEqual(h._dom._vals['wstEditCount'].textContent, '1',
            'счётчик правок обновлён');
        assertFalse(h._dom._vals['wstChipEdit'].hidden, 'чип правок виден');
        assertFalse(h._dom._vals['wstResetBtn'].hidden, 'кнопка «Сбросить правки» видна');
    });

    test('talonsResetEdits: чистая карта + перерисовка + тост', () => {
        const toasts = [];
        const toast = { show: function(m) { toasts.push(m); } };
        const h = inputHost(toast);
        h._TALONS_EDIT['017'] = { t8: 9 };
        h._renderCalls = 0;
        // подменяем рендер счётчиком (в хосте он реальный — считаем
        // вызовы обёрткой)
        const realRender = h._renderTalonsPage.bind(h);
        h._renderTalonsPage = function() { h._renderCalls++; };
        h.talonsResetEdits();
        assertEqual(JSON.stringify(h._TALONS_EDIT), '{}', 'карта чистая');
        assertEqual(h._renderCalls, 1, 'страница перерисована');
        assertEqual(toasts.length, 1, 'тост показан');
        realRender(); // безопасно (мок-DOM тихо)
    });
});

// ============================================================
// 6. VM — рендер страницы / гейты (мок-DOM)
// ============================================================
describe('Task 447 — VM: _renderTalonsPage / onTalonsPageOpen', () => {

    function pageDom(active) {
        const elements = {};
        function makeEl(tag) {
            const el = {
                tag: tag, id: '', className: '', innerHTML: '',
                children: [], style: {}, attrs: {},
                classList: {
                    contains: function(c) {
                        return String(el.className).split(/\s+/).indexOf(c) !== -1;
                    },
                    toggle: function() {}
                },
                addEventListener: function() {},
                removeEventListener: function() {},
                setAttribute: function(k, v) { el.attrs[k] = v; },
                appendChild: function(c) { el.children.push(c); return c; },
                querySelector: function() { return null; }
            };
            return el;
        }
        const body = makeEl('div');
        body.id = 'wsTalonsBody';
        elements['wsTalonsBody'] = body;
        const page = makeEl('div');
        page.className = active ? 'page-content active' : 'page-content';
        elements['page-ws-talons'] = page;
        return {
            document: {
                createElement: makeEl,
                getElementById: function(id) { return elements[id] || null; }
            },
            body: body,
            elements: elements
        };
    }

    function pageHost(dom, nav, opts) {
        opts = opts || {};
        return new Function('KipToast', 'window', 'document', 'navigateTo', 'return ({' +
            methodText(WS_SRC, '_talonsMonthInfo') + ',\n' +
            methodText(WS_SRC, '_talonsEffectiveEntries') + ',\n' +
            methodText(WS_SRC, '_talonsRows') + ',\n' +
            methodText(WS_SRC, '_talonsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsZero') + ',\n' +
            methodText(WS_SRC, '_empTypeMap') + ',\n' +
            methodText(WS_SRC, '_renderTalonsPage') + ',\n' +
            methodText(WS_SRC, '_renderTalonsIfOpen') + ',\n' +
            methodText(WS_SRC, 'onTalonsPageOpen') + ',\n' +
            methodText(WS_SRC, 'openTalonsPage') + ',\n' +
            methodText(WS_SRC, 'talonsRefresh') + ',\n' +
            '_codeHours: function(c) { return ({ "Д": 12, "Н": 12, "Д8": 8 })[c] || 0; },' +
            '_overHours: function() { return 0; },' +
            '_statusMeta: function() { return null; },' +
            '_esc: function(s) { return String(s); },' +
            "_escAttr: function(s) { return String(s); }," +
            '_apiErrText: function(e) { return String(e); },' +
            '_api: function(a, p) { return Promise.resolve({ entries: [] }); },' +
            'refreshData: function() { this._refreshCalls = (this._refreshCalls || 0) + 1; },' +
            'init: function() { this._initCalls = (this._initCalls || 0) + 1; this._viewLevel = "edit"; },' +
            '_EMPLOYEES: ' + JSON.stringify(opts.employees || [
                { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
                  'должность': 'Слесарь КИПиА' }]) + ',' +
            '_ENTRIES: ' + JSON.stringify(opts.entries || [
                { 'дата': NOWY + '-' + MM + '-01', 'таб_номер': '017', 'статус': 'Д8' },
                { 'дата': NOWY + '-' + MM + '-02', 'таб_номер': '017', 'статус': 'Д8' }]) + ',' +
            '_PENDING: {}, _TALONS_EDIT: {},' +
            '_year: ' + (opts.year !== undefined ? opts.year : NOWY) + ',' +
            '_month: ' + (opts.month !== undefined ? opts.month : NOWM) + ',' +
            '_viewLevel: ' + JSON.stringify(opts.viewLevel !== undefined ? opts.viewLevel : 'edit') + ',' +
            '_canEdit: ' + (opts.viewLevel === 'edit') + ',' +
            '_initialized: ' + (opts.initialized !== undefined ? opts.initialized : true) + ',' +
            '_talonsGridReady: ' + (opts.gridReady !== undefined ? opts.gridReady : true) + ',' +
            '_STATUS_CODES: [],' +
            '});')(undefined, { addEventListener: function() {} },
                   dom.document, nav);
    }

    test('edit: шапка + таблица + два input (12/8) + итого; талоны = явкам', () => {
        const dom = pageDom(true);
        const h = pageHost(dom, null, {});
        h._renderTalonsPage();
        const html = dom.body.innerHTML;
        assertTrue(html.indexOf('Отчёт по талонам питания — ') !== -1,
            'шапка отчёта');
        assertTrue(html.indexOf(MONTH_NAMES[NOWM - 1]) !== -1,
            'месяц сетки в шапке (Task 455 — сетка задаёт месяц)');
        assertTrue(html.indexOf('Дней явки') !== -1,
            'колонка дней явки осталась (источник авто-подсчёта)');
        assertTrue(html.indexOf('Выдано 12 ч. талонов') !== -1 &&
                   html.indexOf('Выдано 8 ч. талонов') !== -1 &&
                   html.indexOf('>Выдано талонов<') === -1,
            'две колонки талонов — 12/8 раздельно (Task 451), общей больше нет');
        assertTrue(html.indexOf('type="number"') !== -1 &&
                   html.indexOf('oninput="WorkSchedule.onTalonsInput(this)"') !== -1,
            'правка талонов — input');
        assertTrue(html.indexOf('data-cat="t12"') !== -1 &&
                   html.indexOf('data-cat="t8"') !== -1,
            'каждый input знает категорию (data-cat, Task 451)');
        assertTrue(html.indexOf('value="2"') !== -1,
            'талонов предзаполнено по 2 явкам');
        assertTrue(html.indexOf('Итого') !== -1, 'строка Итого');
        assertTrue(html.indexOf('wstTotalT12') !== -1 &&
                   html.indexOf('wstTotalT8') !== -1 &&
                   html.indexOf('wstTotalDays') === -1 &&
                   html.indexOf('wstTotalTalonsChip') === -1,
            'итоги 12/8 раздельно; общий итог дней явки не показывается (Task 451)');
        assertTrue(html.indexOf('wst-print-btn') !== -1 &&
                   html.indexOf('Печать отчёта') !== -1 &&
                   html.indexOf('Обновить данные') !== -1 &&
                   html.indexOf('Сбросить правки') !== -1,
            'кнопки действий');
    });

    test('view/min: пустое тело (страница недоступна)', () => {
        const dom = pageDom(true);
        const h = pageHost(dom, null, { viewLevel: 'view' });
        h._renderTalonsPage();
        assertEqual(dom.body.innerHTML, '', 'не-редактору — пусто');
    });

    test('работников нет (сетка отрисовывалась) — честное пустое состояние', () => {
        const dom = pageDom(true);
        const h = pageHost(dom, null, { employees: [], entries: [] });
        h._talonsGridReady = true;
        h._renderTalonsPage();
        assertTrue(dom.body.innerHTML.indexOf('Нет активных работников') !== -1,
            'пустое состояние');
    });

    test('данные в полёте (сетка не отрисовывалась) — «Загрузка…»', () => {
        const dom = pageDom(true);
        // deep link: сетка ещё не отрисовывалась — справочник пуст
        const h = pageHost(dom, null, { employees: [], entries: [], gridReady: false });
        h._renderTalonsPage();
        assertTrue(dom.body.innerHTML.indexOf('flow-loading') !== -1,
            'индикатор загрузки');
    });

    test('другой месяц сетки — отчёт сразу из живых записей (Task 455)', () => {
        const dom = pageDom(true);
        const pm = (NOWM > 1) ? (NOWM - 1) : 12;
        const pmY = (NOWM > 1) ? NOWY : NOWY - 1;
        const pmm = (pm < 10 ? '0' + pm : '' + pm);
        const pmName = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
                        'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь',
                        'декабрь'][pm - 1];
        const h = pageHost(dom, null, {
            year: pmY, month: pm,
            entries: [{ 'дата': pmY + '-' + pmm + '-01',
                        'таб_номер': '017', 'статус': 'Д' }]
        });
        let apiCalls = [];
        h._api = function(a, p) {
            apiCalls.push([a, p]);
            return Promise.resolve({ entries: [] });
        };
        h._renderTalonsPage();
        assertEqual(apiCalls.length, 0,
            'подтяжки месяца НЕТ — записи уже в сетке (Task 455)');
        assertTrue(dom.body.innerHTML.indexOf('flow-loading') === -1,
            'загрузки нет — отчёт готов сразу');
        assertTrue(dom.body.innerHTML.indexOf(pmName) !== -1,
            'шапка — месяц сетки');
        assertTrue(dom.body.innerHTML.indexOf('value="1"') !== -1,
            'талон = 1 явке (Д — 12 ч, 1 день)');
    });

    test('onTalonsPageOpen: не-редактора возвращает в табель', () => {
        const dom = pageDom(true);
        const nav = [];
        const h = pageHost(dom, function(p) { nav.push(p); }, { viewLevel: 'view' });
        h.onTalonsPageOpen();
        assertEqual(JSON.stringify(nav), '["work-schedule"]',
            'redirect на табель');
        assertEqual(dom.body.innerHTML, '', 'страница не рендерилась');
    });

    test('onTalonsPageOpen: deep link — init + загрузка, рендер после сетки', () => {
        const dom = pageDom(true);
        const h = pageHost(dom, null, { initialized: false, gridReady: false });
        h._initialized = false;
        h.onTalonsPageOpen();
        assertEqual(h._initCalls, 1, 'init вызван (уровень посчитан)');
        assertTrue(dom.body.innerHTML.indexOf('flow-loading') !== -1,
            'индикатор до первой отрисовки сетки');
        // сетка отрисовалась → хук перерисует страницу
        h._renderTalonsIfOpen();
        assertTrue(dom.body.innerHTML.indexOf('Отчёт по талонам питания') !== -1,
            'после данных — отчёт');
    });

    test('openTalonsPage: гейт edit + тост; edit — навигация + рендер', () => {
        const toasts = [];
        const toast = { show: function(m) { toasts.push(m); } };
        const dom = pageDom(true);
        const nav = [];
        const h1 = new Function('KipToast', 'document', 'navigateTo', 'return ({' +
            methodText(WS_SRC, 'openTalonsPage') + ',\n' +
            methodText(WS_SRC, '_renderTalonsPage') + ',\n' +
            '_viewLevel: "view",' +
            '});')(toast, dom.document, function(p) { nav.push(p); });
        h1.openTalonsPage();
        assertEqual(nav.length, 0, 'навигации нет');
        assertEqual(toasts.length, 1, 'тост-пояснение');
        const h2 = pageHost(dom, function(p) { nav.push(p); }, { viewLevel: 'edit' });
        h2.openTalonsPage();
        assertEqual(nav[nav.length - 1], 'ws-talons', 'навигация на страницу');
        assertTrue(dom.body.innerHTML.indexOf('Отчёт по талонам питания') !== -1,
            'страница отрендерена');
    });

    test('talonsRefresh: ВСЕГДА refreshData — месяц отчёта = месяцу сетки (Task 455)', () => {
        const dom = pageDom(true);
        const h = pageHost(dom, null, {});
        h.talonsRefresh();
        assertEqual(h._refreshCalls, 1, 'перечитали данные сетки');
        // сетка на другом месяце — ТОЖЕ refreshData (кэша больше нет)
        h._year = NOWY; h._month = 1;
        h.talonsRefresh();
        assertEqual(h._refreshCalls, 2, 'другой месяц — снова refreshData');
    });
});

// ============================================================
// 7. VM — печать (лист + инжект + предпросмотр, мок-DOM)
// ============================================================
describe('Task 447 — VM: печать отчёта', () => {

    function printDom() {
        const elements = {};
        const reg = function(el) { if (el.id) elements[el.id] = el; };
        function makeEl(tag) {
            const el = {
                tag: tag, id: '', className: '', innerHTML: '',
                children: [], style: {}, attrs: {}, listeners: {},
                parentNode: null, srcdoc: '', contentDocument: null,
                addEventListener: function(type, fn) {
                    (el.listeners[type] = el.listeners[type] || []).push(fn);
                },
                removeEventListener: function(type, fn) {
                    el.listeners[type] = (el.listeners[type] || [])
                        .filter(f => f !== fn);
                },
                dispatch: function(type, ev) {
                    (el.listeners[type] || []).slice().forEach(fn => fn(ev || {}));
                },
                setAttribute: function(k, v) { el.attrs[k] = v; },
                appendChild: function(c) {
                    c.parentNode = el;
                    el.children.push(c);
                    reg(c);
                    return c;
                },
                removeChild: function(c) {
                    el.children = el.children.filter(x => x !== c);
                    if (elements[c.id] === c) delete elements[c.id];
                },
                querySelector: function(sel) {
                    const cls = sel.replace(/^\./, '');
                    const find = function(root) {
                        for (let i = 0; i < root.children.length; i++) {
                            const ch = root.children[i];
                            if (String(ch.className || '')
                                    .split(/\s+/).indexOf(cls) !== -1) return ch;
                            const r = find(ch);
                            if (r) return r;
                        }
                        return null;
                    };
                    const found = find(el);
                    if (found) return found;
                    if (!el._qcache) el._qcache = {};
                    if (!el._qcache[cls]) el._qcache[cls] = makeEl('button');
                    return el._qcache[cls];
                }
            };
            return el;
        }
        const body = makeEl('body');
        const head = makeEl('head');
        return {
            document: {
                createElement: makeEl,
                getElementById: function(id) { return elements[id] || null; },
                body: body,
                head: head
            },
            elements: elements,
            body: body,
            head: head
        };
    }

    function printHost(dom, win, opts) {
        opts = opts || {};
        return new Function('KipToast', 'window', 'document', 'return ({' +
            methodText(WS_SRC, '_talonsMonthInfo') + ',\n' +
            methodText(WS_SRC, '_talonsEffectiveEntries') + ',\n' +
            methodText(WS_SRC, '_talonsRows') + ',\n' +
            methodText(WS_SRC, '_talonsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsZero') + ',\n' +
            methodText(WS_SRC, '_empTypeMap') + ',\n' +
            methodText(WS_SRC, 'printTalonsReport') + ',\n' +
            methodText(WS_SRC, '_buildTalonsPrintHtml') + ',\n' +
            methodText(WS_SRC, '_talonsColgroup') + ',\n' +
            methodText(WS_SRC, '_talonsTextWidth') + ',\n' +
            methodText(WS_SRC, '_talonsPosition') + ',\n' +
            methodText(WS_SRC, '_talonsSignBlock') + ',\n' +
            methodText(WS_SRC, '_buildTalonsFileHtml') + ',\n' +
            methodText(WS_SRC, '_talonsInjectPrintStyle') + ',\n' +
            methodText(WS_SRC, '_talonsRemovePrintStyle') + ',\n' +
            methodText(WS_SRC, '_openTalonsPreview') + ',\n' +
            methodText(WS_SRC, '_closeTalonsPreview') + ',\n' +
            methodText(WS_SRC, '_talonsPrevFit') + ',\n' +
            '_TALONS_PRINT_CSS: ' + JSON.stringify(TALONS_CSS_VALUE) + ',\n' +
            '_codeHours: function(c) { return ({ "Д": 12, "Н": 12, "Д8": 8 })[c] || 0; },' +
            '_overHours: function() { return 0; },' +
            '_statusMeta: function() { return null; },' +
            '_esc: function(s) { return String(s); },' +
            "_escAttr: function(s) { return String(s); }," +
            '_closePrintPreview: function() {},' +
            '_EMPLOYEES: [{ "таб_номер": "017", "ФИО": "Иванов И. И.", "тип": "дневной", "должность": "Слесарь КИПиА" }],' +
            '_ENTRIES: ' + JSON.stringify([{ 'дата': NOWY + '-' + MM + '-01', 'таб_номер': '017', 'статус': 'Д8' },
                { 'дата': NOWY + '-' + MM + '-02', 'таб_номер': '017', 'статус': 'Д8' }]) + ',' +
            '_PENDING: {}, _TALONS_EDIT: {},' +
            '_year: ' + NOWY + ', _month: ' + NOWM + ',' +
            '_viewLevel: ' + JSON.stringify(opts.viewLevel !== undefined ? opts.viewLevel : 'edit') + ',' +
            '_canEdit: true, _initialized: true, _talonsGridReady: true,' +
            '_STATUS_CODES: [],' +
            '});')(undefined, win, dom.document);
    }

    test('лист: класс wst-sheet + строгая форма; инжект @page портрет', () => {
        const dom = printDom();
        const win = { printCalls: 0, print: function() { win.printCalls++; },
                      addEventListener: function() {}, removeEventListener: function() {} };
        const h = printHost(dom, win, {});
        // предпросмотр вернёт false (iframe без DOM-обвязки не соберём —
        // подменяем), тогда сработает фолбэк window.print
        h._openTalonsPreview = function() { return false; };
        h.printTalonsReport();
        const sheet = dom.elements['wsPrintSheet'];
        assertTrue(!!sheet, 'лист создан в body');
        assertEqual(sheet.className, 'wst-sheet', 'класс отчёта');
        assertTrue(sheet.innerHTML.indexOf('ОТЧЕТ') !== -1 &&
                   sheet.innerHTML.indexOf('на выдачу талонов Л.П.П.') !== -1,
            'форма отчёта в листе (строгая форма Task 448)');
        const st = dom.elements['wsTalonsPrintStyle'];
        assertTrue(!!st, 'инжект-стиль в head');
        assertTrue(st.textContent.indexOf('@page { size: A4 portrait; margin: 12mm 10mm; }') !== -1,
            '@page КНИЖНАЯ');
        assertTrue(st.textContent.indexOf('#wsPrintSheet.wst-sheet') !== -1,
            'правила листа отчёта');
        assertEqual(win.printCalls, 1, 'фолбэк: печать сразу');
    });

    test('гейты печати: не-редактор / нет данных — лист не трогается', () => {
        const dom = printDom();
        const win = { printCalls: 0, print: function() { win.printCalls++; },
                      addEventListener: function() {}, removeEventListener: function() {} };
        const h = printHost(dom, win, { viewLevel: 'view' });
        h.printTalonsReport();
        assertEqual(win.printCalls, 0, 'view — тишина');
        assertFalse(!!dom.elements['wsPrintSheet'], 'лист не создан');
        // Task 455: guard готовности удалён (записи всегда живые) —
        // «нет данных» = нет работников
        const h2 = printHost(dom, win, {});
        h2._EMPLOYEES = []; h2._ENTRIES = [];
        h2.printTalonsReport();
        assertFalse(!!dom.elements['wsPrintSheet'],
            'работников нет — листа нет (тост «Нет работников для отчёта»)');
    });

    test('_buildTalonsPrintHtml: группы 12/8, часы, итого (шт.), подписи', () => {
        const h = printHost(printDom(), { print: function() {} }, {});
        const model = h._talonsRows();
        model.totals = { t12: 3, t8: 2, edited: 1 };
        // Сидоров — СМЕННЫЙ: попадает в группу «12 часовые»,
        // Иванов (дневной) — в «8 часовые»
        model.rows.push({ emp: { 'ФИО': 'Сидоров С. С.', 'тип': 'сменный',
                                 'должность': 'Электрик' },
                          tab: '031', days: 1, t12: 3, t8: 0,
                          auto12: 1, auto8: 0,
                          edited12: true, edited8: false, edited: true });
        const html = h._buildTalonsPrintHtml(model);
        assertTrue(html.indexOf('за ' + MONTH_NAMES[NOWM - 1] + ' ' + NOWY + ' г.') !== -1,
            'период: месяц сетки и год');
        assertTrue(html.indexOf('Иванов И. И.') !== -1 &&
                   html.indexOf('Сидоров С. С.') !== -1,
            'ФИО работников');
        assertTrue(html.indexOf('Слесарь по КИП и А') !== -1 &&
                   html.indexOf('Электрик') !== -1,
            'должности (КИПиА → по КИП и А — формат формы; прочие — как есть)');
        assertTrue(html.indexOf('wst-rep-table') !== -1, 'таблица формы');
        // группы: «12 часовые» идёт РАНЬШЕ «8 часовых», в «12» —
        // только Сидоров (№1), в «8» — Иванов (№2, сквозная нумерация)
        const i12 = html.indexOf('12 часовые');
        const i8 = html.indexOf('8 часовые');
        assertTrue(i12 !== -1 && i8 !== -1 && i12 < i8,
            'группы «12 часовые» → «8 часовые» по порядку формы');
        // часы: Сидоров 3 талона × 12 = 36; Иванов (Д8+Н = 2 явки) × 8 = 16
        assertTrue(html.indexOf('>36</td>') !== -1 &&
                   html.indexOf('>16</td>') !== -1,
            'часы = талоны × 12/8 (формула листа)');
        const iSid = html.indexOf('Сидоров С. С.');
        const iIvan = html.indexOf('Иванов И. И.');
        assertTrue(iSid !== -1 && iIvan !== -1 && iSid < iIvan,
            'сменный — выше в таблице (группа «12 часовые» первая)');
        assertTrue(html.indexOf('<td class="wst-r-n">1</td>') !== -1 &&
                   html.indexOf('<td class="wst-r-n">2</td>') !== -1,
            'сквозная нумерация 1, 2');
        // ИТОГО по группам: 12 часовые — 3 (шт.), 8 часовые — 2 (шт.)
        assertTrue(html.indexOf('wst-t-val') !== -1 &&
                   html.indexOf('>3</td><td class="wst-t-unit">(шт.)</td>') !== -1 &&
                   html.indexOf('>2</td><td class="wst-t-unit">(шт.)</td>') !== -1,
            'ИТОГО: суммы талонов по группам в (шт.)');
        assertTrue(html.indexOf('ИТОГО:') !== -1,
            'метка ИТОГО есть');
        // подписи строго по форме
        for (const part of ['Рук. подразделения', 'Игушов Н.В.',
                            'С табелем сверено:', 'Котельникова И.А.',
                            '(подпись материально-ответственного лица)',
                            'Руководитель СОТ и ПБ', 'Фензель В.П.',
                            '_________________']) {
            assertTrue(html.indexOf(part) !== -1, 'подписи: ' + part);
        }
        assertTrue(html.indexOf('Отчёт составил:') === -1 &&
                   html.indexOf('Дата:') === -1,
            'старого подписного блока больше нет');
    });

    test('_buildTalonsFileHtml: standalone-документ предпросмотра', () => {
        const h = printHost(printDom(), { print: function() {} }, {});
        const html = h._buildTalonsFileHtml('<div class="wst-rep">X</div>');
        assertTrue(html.indexOf('<!DOCTYPE html>') === 0, 'doctype');
        assertTrue(html.indexOf('@page { size: A4 portrait; margin: 12mm 10mm; }') !== -1,
            '@page портрет');
        assertTrue(html.indexOf('width: 190mm') !== -1, 'книжный лист 190мм');
        assertTrue(html.indexOf('<div id="wsPrintSheet" class="wst-sheet">') !== -1,
            'каркас листа');
        assertTrue(html.indexOf('Times New Roman') !== -1, 'шрифт формы');
        assertTrue(html.indexOf('.wst-rep-table') !== -1, 'правила формы подключены');
        assertTrue(html.indexOf('Отчёт по талонам питания') !== -1,
            'title документа');
    });

    test('предпросмотр: оверлей + iframe srcdoc + только Печать/Отмена', () => {
        const dom = printDom();
        const win = { printCalls: 0, print: function() { win.printCalls++; },
                      addEventListener: function() {}, removeEventListener: function() {} };
        const h = printHost(dom, win, {});
        const model = h._talonsRows();
        const opened = h._openTalonsPreview(model);
        assertTrue(opened, 'диалог открылся');
        const overlay = dom.elements['wsTalonsPrevModal'];
        assertTrue(!!overlay, 'оверлей в body');
        assertEqual(overlay.className, 'wspprev-overlay', 'вёрстка Task 430');
        // iframe в дереве
        const dlg = overlay.children[0];
        const bodyEl = dlg.children[1];
        const paper = bodyEl.children[0];
        const frame = paper.children[0];
        assertEqual(frame.className, 'wspprev-frame wst-prev-frame',
            'книжный iframe');
        assertTrue(frame.srcdoc.indexOf('Отчёт по талонам питания') !== -1,
            'srcdoc — standalone-документ отчёта');
        // футер: Печать + Отмена + подсказка, БЕЗ pdf/xlsx
        const foot = dlg.children[2];
        assertTrue(foot.innerHTML.indexOf('wspprev-print') !== -1 &&
                   foot.innerHTML.indexOf('wspprev-cancel') !== -1,
            'кнопки Печать/Отмена');
        assertTrue(foot.innerHTML.indexOf('A4 · книжная') !== -1,
            'подсказка книжной ориентации');
        assertTrue(foot.innerHTML.indexOf('wspprev-pdf') === -1 &&
                   foot.innerHTML.indexOf('wspprev-xlsx') === -1,
            'PDF/Excel-кнопок НЕТ (форма строгая)');
        // печать — window.print основного документа
        const printBtn = foot.querySelector('.wspprev-print');
        printBtn.dispatch('click');
        assertEqual(win.printCalls, 1, 'Печать — window.print()');
    });

    test('закрытие предпросмотра: оверлей удалён, инжект-стиль снят', () => {
        const dom = printDom();
        const win = { printCalls: 0, print: function() {},
                      addEventListener: function() {}, removeEventListener: function() {} };
        const h = printHost(dom, win, {});
        h._openTalonsPreview(h._talonsRows());
        h._talonsInjectPrintStyle();
        assertTrue(!!dom.elements['wsTalonsPrevModal'], 'диалог открыт');
        assertTrue(!!dom.elements['wsTalonsPrintStyle'], 'стиль инжектирован');
        h._closeTalonsPreview();
        assertFalse(!!dom.elements['wsTalonsPrevModal'], 'оверлей удалён');
        assertFalse(!!dom.elements['wsTalonsPrintStyle'], 'инжект снят');
        // повторное закрытие — тихо (идемпотентность)
        h._closeTalonsPreview();
    });
});

// ============================================================
// 8. SW — версия кэша
// ============================================================
describe('Task 447 — SW', () => {
    test('SW: кэш поднят до kipia-test-v749 (Task 447)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v749'") !== -1,
            'CACHE_VERSION = kipia-test-v749');
        assertTrue(SW_SRC.indexOf('kipia-test-v750') === -1,
            'kipia-test-v749 не существует');
        assertTrue(SW_SRC.indexOf('Task 447') !== -1,
            'комментарий Task 447 в истории версий');
    });
});
