// ============================================================
// Task 399 — заявка: «Установи ещё одно условие, если у
// пользователя нет доступа к просмотру информации мастеров в
// табеле учёта, то и в окне мероприятий не должно быть информации
// мастеров (мероприятия, отпуска, СИЗ)».
//
// «Нет доступа к информации мастеров» = уровень «min»
// (workschedule.view.min, ограниченный просмотр): с Task 340 в
// шахматке у min скрыты работники «Мастер КИПиА» (фильтр
// _viewEmployees по _isMasterKipia). Task 399 синхронизирует
// ОКНО МЕРОПРИЯТИЙ месяца (#wsEventsPanel, Task 315→394):
// у min записи мастеров исключаются из ВСЕХ трёх секций —
// мероприятия/отпуска/СИЗ; edit/view видят всё (мастера в сетке
// видны); счётчики секций и пустые состояния — после фильтра.
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
    return m ? String(m) : '';
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// ============================================================
// 1. SRC — фильтр мастеров в _renderMonthEventsPanel
// ============================================================
describe('Task 399 — SRC: окно мероприятий — фильтр мастеров у min', () => {

    test('уровень min включает скрытие записей мастеров', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderMonthEventsPanel'));
        assertTrue(fn.indexOf("hideMasters = (this._viewLevel === 'min')") !== -1,
            'скрытие — только у уровня «min» (как фильтр сетки Task 340)');
        assertTrue(fn.indexOf('this._isMasterKipia(') !== -1,
            'признак мастера — тот же _isMasterKipia, что у сетки');
        assertTrue(fn.indexOf('masterTabs[') !== -1,
            'индекс таб. номеров мастеров');
    });

    test('фильтр в ОБОИХ секциях — мероприятия/СИЗ (отпуска убраны, Task 404)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderMonthEventsPanel'));
        assertTrue(fn.indexOf("masterTabs[t['таб_номер']]") !== -1,
            'секция «Мероприятия» — записи мастеров пропускаются');
        assertFalse(fn.indexOf("masterTabs[vRec['таб_номер']]") !== -1,
            'секции «Отпуска» больше нет (Task 404) — фильтр удалён вместе с ней');
        assertTrue(fn.indexOf("masterTabs[pRec['таб_номер']]") !== -1,
            'секция «СИЗ» — СИЗ мастеров пропускаются');
    });

    test('фильтр ДО проверок месяца/дня — действует и в режиме дня', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderMonthEventsPanel'));
        const iFilt = fn.indexOf("masterTabs[t['таб_номер']]");
        const iMonth = fn.indexOf("if (e < mStart || s > mEnd) continue;");
        const iSel = fn.indexOf('if (selIso && (s > selIso || e < selIso)) continue;');
        assertTrue(iFilt !== -1 && iMonth !== -1 && iSel !== -1,
            'все три проверки живы');
        assertTrue(iFilt < iMonth && iFilt < iSel,
            'мастер отсеивается раньше месяца/выбранного дня');
    });

    test('индекс мастеров строится по ПОЛНОМУ списку _EMPLOYEES', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderMonthEventsPanel'));
        // emps = this._EMPLOYEES || [] (общий с fioIdx); фильтр сетки
        // (_viewEmployees) в окне НЕ используется — данные полные
        assertTrue(fn.indexOf('emps = this._EMPLOYEES || []') !== -1,
            'источник индекса — полный справочник (не вид сетки)');
        assertFalse(fn.indexOf('_viewEmployees(') !== -1,
            'окно не зависит от вида табеля (полный/сменный/дневной)');
    });
});

// ============================================================
// 2. VM — окно мероприятий: записи мастеров у min
// ============================================================
function panelHost(opts) {
    const el = { innerHTML: '', hidden: true };
    const document = { getElementById: function(id) {
        return id === 'wsEventsPanel' ? el : null;
    }};
    const texts = ['_instrShortOf', '_normInstrKey',
                   '_renderMonthEventsPanel', '_trainingCodeOf',
                   '_statusMeta', '_isMasterKipia']
        .map(n => methodText(INDEX_SRC, n));
    const make = new Function('localStorage', 'document', 'confirm',
                              'KipToast', 'kipConfirm',
        'return ({' + texts.join(',\n') + ',\n' +
        '_viewLevel: ' + (opts.viewLevel === undefined
            ? 'undefined' : ("'" + opts.viewLevel + "'")) + ',' +
        '_year: ' + (opts.year || 2026) + ', _month: ' + (opts.month || 9) + ',' +
        '_selDay: ' + (opts.selDay === undefined ? 'null' : opts.selDay) + ',' +
        '_TRAININGS: ' + JSON.stringify(opts.trainings || []) + ',' +
        '_VACATIONS: ' + JSON.stringify(opts.vacations || []) + ',' +
        '_PPE: ' + JSON.stringify(opts.ppe || []) + ',' +
        '_EMPLOYEES: ' + JSON.stringify(opts.employees) + ',' +
        '_STATUS_CODES: [],' +
        '_esc: function(s){ return String(s == null ? "" : s); },' +
        '_escAttr: function(s){ return String(s == null ? "" : s); },' +
        '_isoDate: function(dt){ var m=(""+(dt.getMonth()+1)).padStart(2,"0"); var d=(""+dt.getDate()).padStart(2,"0"); return dt.getFullYear()+"-"+m+"-"+d; }, _barExpSync: function() {},' +
        '});');
    const ctx = make(null, document, null, null, null);
    ctx._renderMonthEventsPanel();
    return el;
}

// Справочник: ГАЛКИН — «Мастер КИПиА» (мастер, скрыт у min),
// ПЕРВОВ — «Слесарь КИПиА» (не мастер); 9999 — вне справочника
const EMPS = [
    { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
      'смена': '', 'должность': 'Мастер КИПиА', 'комментарий': '',
      'дата_приёма': '2007-03-06' },
    { 'таб_номер': '0377', 'ФИО': 'Первов С. А.', 'тип': 'сменный',
      'смена': 1, 'должность': 'Слесарь КИПиА', 'комментарий': '',
      'дата_приёма': '2025-01-20' },
    { 'таб_номер': '9999', 'ФИО': 'Сторонний Человек', 'тип': 'дневной',
      'смена': '', 'должность': 'Электрик', 'комментарий': '',
      'дата_приёма': '2024-02-01' },
];

const TRS = [
    { id: 41, 'таб_номер': '2706', 'тип': 'инструктаж', 'тема': 'Мастерское',
      'дата_начала': '2026-09-07', 'дата_окончания': '2026-09-07' },
    { id: 42, 'таб_номер': '0377', 'тип': 'инструктаж', 'тема': 'Слесарное',
      'дата_начала': '2026-09-08', 'дата_окончания': '2026-09-08' },
];

const VACS = [
    { id: 21, 'таб_номер': '2706', 'часть': 1,
      'дата_начала': '2026-09-01', 'дата_окончания': '2026-09-14',
      'комментарий': '' },
    { id: 22, 'таб_номер': '0377', 'часть': 1,
      'дата_начала': '2026-09-15', 'дата_окончания': '2026-09-20',
      'комментарий': '' },
];

const PPES = [
    { id: 31, 'таб_номер': '2706', 'наименование': 'Каска',
      'дата_окончания': '2026-09-12', 'ед': 'шт' },
    { id: 32, 'таб_номер': '0377', 'наименование': 'Перчатки',
      'дата_окончания': '2026-09-05', 'ед': 'шт' },
];

describe('Task 399 — VM: min — записей мастеров в окне НЕТ', () => {

    test('все секции: мастер скрыт, не-мастер показан (отпусков нет — Task 404)', () => {
        const el = panelHost({ viewLevel: 'min', employees: EMPS,
            trainings: TRS, vacations: VACS, ppe: PPES });
        const html = el.innerHTML;
        assertFalse(html.indexOf('Галкин') !== -1,
            'ФИО мастера не показывается (мероприятия/СИЗ)');
        assertFalse(html.indexOf('Мастерское') !== -1,
            'мероприятие мастера скрыто');
        assertFalse(html.indexOf('Каска') !== -1, 'СИЗ мастера скрыто');
        assertTrue(html.indexOf('Слесарное') !== -1,
            'мероприятие не-мастера показано');
        assertFalse(html.indexOf('Отпуск · Первов С. А.') !== -1,
            'отпусков в окне больше НЕТ (Task 404)');
        assertTrue(html.indexOf('Перчатки') !== -1, 'СИЗ не-мастера показано');
    });

    test('счётчики секций — БЕЗ мастеров', () => {
        const el = panelHost({ viewLevel: 'min', employees: EMPS,
            trainings: TRS, vacations: VACS, ppe: PPES });
        const html = el.innerHTML;
        assertTrue(html.indexOf('Мероприятия · сентябрь 2026 · 1') !== -1,
            'мероприятий — 1 (мастерское не в счёте)');
        assertFalse(html.indexOf('Отпуска · сентябрь 2026 · 1') !== -1,
            'секции отпусков нет (Task 404)');
        assertTrue(html.indexOf('СИЗ · сентябрь 2026 · 1') !== -1,
            'СИЗ — 1');
    });

    test('запись с таб. номером БЕЗ сотрудника — мастером не считается', () => {
        const trs = [
            { id: 51, 'таб_номер': '7777', 'тип': 'инструктаж',
              'тема': 'Вне справочника',
              'дата_начала': '2026-09-09', 'дата_окончания': '2026-09-09' },
        ];
        const el = panelHost({ viewLevel: 'min', employees: EMPS,
            trainings: trs, vacations: [], ppe: [] });
        assertTrue(el.innerHTML.indexOf('Вне справочника') !== -1,
            'неопознанный работник не отфильтрован (как прежде)');
    });

    test('режим выбранного дня: мастер скрыт и в дне', () => {
        // оба мероприятия 07/08.09; выбираем день 7 — только мастерское
        const el = panelHost({ viewLevel: 'min', employees: EMPS,
            trainings: TRS, vacations: VACS, ppe: PPES, selDay: 7 });
        const html = el.innerHTML;
        assertFalse(html.indexOf('Галкин') !== -1,
            'в дне 7 только мастерские записи — окно пусто от мастеров');
        assertTrue(html.indexOf('нет мероприятий в этот день') !== -1,
            'пустое состояние дня после фильтра');
    });

    test('только мастерские записи — счётчик 0, «нет мероприятий»', () => {
        const el = panelHost({ viewLevel: 'min', employees: EMPS,
            trainings: [TRS[0]], vacations: [VACS[0]], ppe: [PPES[0]] });
        const html = el.innerHTML;
        assertTrue(html.indexOf('нет мероприятий в этом месяце') !== -1,
            'мероприятия — пустое состояние (мастер отфильтрован)');
        assertFalse(html.indexOf('Отпуска · ') !== -1,
            'секция отпусков скрыта (пуста после фильтра)');
        assertFalse(html.indexOf('СИЗ · ') !== -1,
            'секция СИЗ скрыта (пуста после фильтра)');
    });
});

describe('Task 399 — VM: edit/view/легаси — окно ПОЛНОЕ', () => {

    test('уровень view — мастера показываются (в сетке они видны)', () => {
        const el = panelHost({ viewLevel: 'view', employees: EMPS,
            trainings: TRS, vacations: VACS, ppe: PPES });
        const html = el.innerHTML;
        assertTrue(html.indexOf('Галкин') !== -1,
            'ФИО мастера показывается у view');
        assertTrue(html.indexOf('Мероприятия · сентябрь 2026 · 2') !== -1 &&
                   html.indexOf('СИЗ · сентябрь 2026 · 2') !== -1,
            'счётчики полные (по 2)');
        assertFalse(html.indexOf('Отпуска · сентябрь 2026 · 2') !== -1,
            'секции отпусков нет (Task 404)');
    });

    test('уровень edit — мастера показываются', () => {
        const el = panelHost({ viewLevel: 'edit', employees: EMPS,
            trainings: TRS, vacations: VACS, ppe: PPES });
        assertTrue(el.innerHTML.indexOf('Мастерское') !== -1 &&
                   el.innerHTML.indexOf('Каска') !== -1,
            'записи мастера видны редактору');
    });

    test('легаси без уровня (undefined) — ничего не фильтруется', () => {
        const el = panelHost({ employees: EMPS,
            trainings: TRS, vacations: VACS, ppe: PPES });
        const html = el.innerHTML;
        assertTrue(html.indexOf('Мастерское') !== -1 &&
                   html.indexOf('Галкин') !== -1,
            'харнесс без _viewLevel показывает всё (защитный доступ)');
    });
});

// ============================================================
// 3. SRC — SW-версия задачи
// ============================================================
describe('Task 399 — SRC: сервис-воркер', () => {

    test('sw.js: CACHE_VERSION kipia-test-v745', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v745'") !== -1,
            'бамп v626 -> v627 (клиентский фикс раздаётся из кэша SW)');
    });

    test('sw.js: v628 НЕ существует (guard от двойного бампа)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v746') === -1,
            'v628 отсутствует — следующая задача');
    });
});
