// ============================================================
// Task 392 — заявка (2 части):
//   1) строка «Общей» вкладки «Работники»: ведущее число ТЕКУ-
//      ЩЕГО момента — БЕЗ СКОБОК: «Работников на текущий момент
//      12 (2 мастера, 5 дневных, 5 сменных).»;
//   2) НОВЫЙ раздел «СИЗ» — средства индивидуальной защиты: лист
//      «СИЗ» файла табель_КИП_ИОС (образец — «Таблица СИЗ
//      работникам КИП ИОС.xlsx», перечень — Приказ Минтруда
//      России от 29.10.2021 N767н), редактирование из приложения
//      в личных данных каждого работника + добавление/удаление
//      СИЗ. Дата окончания срока годности заполняется АВТОМАТИ-
//      ЧЕСКИ (дата выдачи + срок годности).
//
// Заявка: «"Работников на текущий момент (12) (2 мастера, 5
// дневных, 5 сменных)." — 12 без скобок. Нужно добавить новые
// данные каждому работнику, в файл табель_КИП_ИОС добавить новый
// лист "СИЗ" с таблицей данных по средствам индивидуальной защиты
// (СИЗ), пример таблицы и перечень СИЗ приложены в файле, должна
// быть возможность редактирования данных из приложения в личных
// данных каждого работника и добавление и удаление СИЗ.»
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts/WorkSchedule.gs'), 'utf8');
const CODE_GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts/Code.gs'), 'utf8');
const PPE_INIT_SRC = fs.readFileSync(path.join(ROOT, 'scripts/PPEInit.gs'), 'utf8');

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

function ruleBlock(sel) {
    const i = INDEX_SRC.indexOf(sel);
    if (i === -1) return null;
    const end = INDEX_SRC.indexOf('\n    }', i);
    return end === -1 ? null : INDEX_SRC.slice(i, end + 7);
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

function mkEl() {
    return {
        style: {}, attrs: {}, hidden: false, innerHTML: '',
        value: '', textContent: '',
        classList: { add: function() {}, remove: function() {},
                     contains: function() { return false; },
                     toggle: function() {} },
        setAttribute: function(k, v) { this.attrs[k] = v; },
        getBoundingClientRect: function() { return { width: 0, height: 0,
                                                     left: 0, right: 0,
                                                     top: 0, bottom: 0 }; },
        querySelector: function() { return null; },
        querySelectorAll: function() { return []; },
        addEventListener: function() {},
        focus: function() {},
        appendChild: function() {},
    };
}

function pluralRu(n, forms) {
    return forms[(n % 10 === 1 && n % 100 !== 11) ? 0 :
        (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2];
}

// ============================================================
// 1. SRC — строка текущего момента: ведущее число БЕЗ СКОБОК
// ============================================================
describe('Task 392 — SRC: ведущее число без скобок', () => {

    test('«Работников на текущий момент N (…)» — N без скобок', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        assertTrue(fn.indexOf('Работников на текущий момент ') !== -1,
            'формулировка жива');
        assertTrue(fn.indexOf("totalN + ' ('") !== -1,
            'ведущее число БЕЗ СКОБОК, сразу скобка разбивки');
        assertTrue(fn.indexOf('var totalN = masterN + dayN + shiftN;') !== -1,
            'ведущее число — СУММА категорий (инвариант Task 391)');
    });

    test('СТАРЫЙ формат «(N) (…)» удалён', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        assertTrue(fn.indexOf("'(' + totalN + ') ('") === -1,
            'скобки вокруг итога удалены (заявка: «12 без скобок»)');
    });
});

// ============================================================
// 2. SRC — СИЗ: шторка формы (HTML)
// ============================================================
describe('Task 392 — SRC: шторка «СИЗ» (HTML)', () => {

    test('каркас шторки: overlay/sheet/title/submit/cancel', () => {
        assertTrue(INDEX_SRC.indexOf('id="wsPpeOverlay"') !== -1, 'оверлей жив');
        assertTrue(INDEX_SRC.indexOf('id="wsPpeSheet"') !== -1, 'шторка жива');
        assertTrue(INDEX_SRC.indexOf('id="wsPpeSheetTitle"') !== -1, 'заголовок (режимы)');
        assertTrue(INDEX_SRC.indexOf('id="wsPpeSubmitBtn"') !== -1, 'кнопка submit (Добавить/Сохранить)');
        assertTrue(INDEX_SRC.indexOf('WorkSchedule.closePpeForm()') !== -1, 'отмена/закрытие');
    });

    test('поля: работник/наименование/дата выдачи/срок/примечание', () => {
        assertTrue(INDEX_SRC.indexOf('id="wsPpeTabNo"') !== -1, 'select работника');
        assertTrue(INDEX_SRC.indexOf('id="wsPpeName"') !== -1, 'наименование СИЗ');
        assertTrue(INDEX_SRC.indexOf('id="wsPpeIssued"') !== -1, 'дата выдачи');
        assertTrue(INDEX_SRC.indexOf('id="wsPpeTerm"') !== -1, 'срок годности');
        assertTrue(INDEX_SRC.indexOf('id="wsPpeComment"') !== -1, 'примечание');
    });

    test('наименование — datalist со стандартным перечнем (8 позиций образца)', () => {
        const dlStart = INDEX_SRC.indexOf('<datalist id="wsPpeNameList">');
        assertTrue(dlStart !== -1, 'datalist жив');
        const dlEnd = INDEX_SRC.indexOf('</datalist>', dlStart);
        const dl = INDEX_SRC.slice(dlStart, dlEnd);
        const items = ['Костюм для защиты от растворов кислот и щелочей',
            'Ботинки', 'Белье нательное', 'Куртка утеплённая',
            'Каска защитная', 'Подшлемник', 'Противогаз', 'Очки закрытые'];
        for (const it of items) {
            assertTrue(dl.indexOf('value="' + it + '"') !== -1,
                'позиция перечня: ' + it);
        }
    });

    test('срок годности — фиксированные опции образца + «До износа»', () => {
        const i = INDEX_SRC.indexOf('id="wsPpeTerm"');
        const end = INDEX_SRC.indexOf('</select>', i);
        const sel = INDEX_SRC.slice(i, end);
        for (const t of ['— не указан —', '6 мес.', '1 год', '1,5 года',
                         '2 года', '3 года', 'До износа']) {
            assertTrue(sel.indexOf('>' + t + '<') !== -1, 'опция: ' + t);
        }
    });

    test('строка авто-даты окончания + подсказка Приказа 767н', () => {
        assertTrue(INDEX_SRC.indexOf('id="wsPpeExpiryInfo"') !== -1,
            'строка авто-даты окончания');
        const i = INDEX_SRC.indexOf('id="wsPpeExpiryInfo"');
        assertTrue(INDEX_SRC.indexOf('N767н', i) !== -1 &&
                   INDEX_SRC.indexOf('N767н', i) - i < 1400,
            'подсказка про Приказ Минтруда 767н рядом со шторкой');
        assertTrue(INDEX_SRC.indexOf('WorkSchedule.onPpeFormInput()') !== -1,
            'пересчёт подсказки на изменении полей');
    });
});

// ============================================================
// 3. SRC — СИЗ: карточка работника (секция) + CSS
// ============================================================
describe('Task 392 — SRC: секция СИЗ в карточке + CSS', () => {

    test('секция СИЗ в _renderWorkerCard', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf('СИЗ · средства индивидуальной защиты') !== -1,
            'заголовок секции');
        assertTrue(fn.indexOf('ws-ppe-item') !== -1, 'запись СИЗ (класс)');
        assertTrue(fn.indexOf('ws-ppe-name') !== -1, 'наименование записи');
        assertTrue(fn.indexOf('ws-ppe-meta') !== -1, 'мета-строка (выдано/срок/до)');
        assertTrue(fn.indexOf('нет выданных СИЗ') !== -1, 'пустое состояние');
    });

    test('кнопки ✎/✕ (editPpe/deletePpe) и «+ СИЗ…» (onEmpAddPpe)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf('WorkSchedule.editPpe(') !== -1, '✎ — правка записи');
        assertTrue(fn.indexOf('WorkSchedule.deletePpe(') !== -1, '✕ — удаление записи');
        assertTrue(fn.indexOf('ws-emp-addppe') !== -1, 'класс строки «+ СИЗ…»');
        assertTrue(fn.indexOf('WorkSchedule.onEmpAddPpe(') !== -1,
            '«+ СИЗ…» с префиллом работника карточки');
        assertTrue(fn.indexOf('(this._PPE || []).length') !== -1,
            'защитный доступ к _PPE (харнессы без поля)');
    });

    test('CSS: .ws-ppe-item/.ws-ppe-name/.ws-ppe-meta/.ws-ppe-form-info', () => {
        const item = ruleBlock('.ws-ppe-item {');
        assertTrue(item !== null && item.indexOf('display: flex;') !== -1,
            '.ws-ppe-item — flex (имя + кнопки ✎/✕)');
        const name = ruleBlock('.ws-ppe-name {');
        assertTrue(name !== null && name.indexOf('overflow-wrap: break-word;') !== -1,
            '.ws-ppe-name — перенос длинных наименований');
        const meta = ruleBlock('.ws-ppe-meta {');
        // Task 444: мета-строка дат/сроков — ЯРКАЯ (primary) и крупнее
        // (прежде — тусклая secondary 10.5px; заявка: «текст с датами
        // и сроками — нормальный яркий, лучше читаемый»)
        assertTrue(meta !== null && meta.indexOf('font-size: 11.5px;') !== -1,
            '.ws-ppe-meta — мета-строка 11.5px (Task 444)');
        const info = ruleBlock('.ws-ppe-form-info {');
        assertTrue(info !== null && info.indexOf('font-size: 13px;') !== -1 &&
                   info.indexOf('font-weight: 600;') !== -1,
            '.ws-ppe-form-info — строка авто-даты (как ws-vac-form-info)');
        assertTrue(ruleBlock('[data-theme="light"] .ws-ppe-name {') !== null,
            'светлая тема — наименование');
    });
});

// ============================================================
// 4. SRC — СИЗ: загрузка/кэш + сервер + PPEInit
// ============================================================
describe('Task 392 — SRC: загрузка, кэш, сервер, PPEInit.gs', () => {

    test('загрузчик _loadPpe: listPpe + тихий catch', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_loadPpe'));
        assertTrue(fn.indexOf("'workSchedule.listPpe'") !== -1, 'эндпоинт listPpe');
        assertTrue(fn.indexOf('data.ppe || []') !== -1, 'список из data.ppe');
        assertTrue(fn.indexOf('.catch(function() {') !== -1 &&
                   fn.indexOf('self._PPE = [];') !== -1,
            'сбой (нет листа/эндпоинта) НЕ ломает шахматку');
    });

    test('loadGrid грузит СИЗ вместе со справочниками', () => {
        // Task 476: сетевой путь loadGrid вложен в .then(idbTry) — self.
        const fn = stripComments(methodText(INDEX_SRC, 'loadGrid'));
        assertTrue(fn.indexOf('self._loadPpe()') !== -1, '_loadPpe() в Promise.all');
    });

    test('кэш Task 314: c.ppe пишется и восстанавливается', () => {
        const w = stripComments(methodText(INDEX_SRC, '_cacheWrite'));
        assertTrue(w.indexOf('c.ppe = this._PPE;') !== -1, 'запись c.ppe');
        // Task 476: разбор объекта кэша вынесен в _restoreFromObj.
        const r = stripComments(methodText(INDEX_SRC, '_restoreFromObj'));
        assertTrue(r.indexOf('Array.isArray(c.ppe) ? c.ppe : []') !== -1,
            'восстановление: старый кэш без ppe → пустой список');
    });

    test('WorkSchedule.gs: PPE_SHEET + 4 эндпоинта + хелперы', () => {
        assertTrue(WS_GS_SRC.indexOf("PPE_SHEET:          'СИЗ'") !== -1,
            'константа PPE_SHEET');
        for (const m of ['listPpe', 'addPpe', 'updatePpe', 'deletePpe']) {
            assertTrue(WS_GS_SRC.indexOf(m + ': function(payload)') !== -1,
                'метод ' + m);
        }
        for (const h of ['_ppeLookupEmployee', '_ppeTermMonths', '_ppeExpiry']) {
            assertTrue(WS_GS_SRC.indexOf(h + ': function(') !== -1, 'хелпер ' + h);
        }
        assertTrue(WS_GS_SRC.indexOf('WORKSCHEDULE_ADD_PPE') !== -1 &&
                   WS_GS_SRC.indexOf('WORKSCHEDULE_UPDATE_PPE') !== -1 &&
                   WS_GS_SRC.indexOf('WORKSCHEDULE_DELETE_PPE') !== -1,
            'аудит трёх операций');
    });

    test('WorkSchedule.gs: дата окончания АВТО (базовая дата + срок, кламп дня; Task 443 — приоритет изготовления)', () => {
        const fn = methodText(WS_GS_SRC, '_ppeExpiry');
        assertTrue(fn.indexOf("_ppeTermMonths(term)") !== -1, 'срок → месяцы');
        assertTrue(fn.indexOf("baseDate.getMonth() + months") !== -1,
            'месяцы прибавляются к базовой дате (Task 443: изготовление в приоритете, иначе выдача)');
        assertTrue(fn.indexOf("new Date(y, mo + 1, 0).getDate()") !== -1,
            'кламп дня к длине целевого месяца');
        assertTrue(fn.indexOf("return 'До износа';") !== -1, '«До износа» — строкой');
        const add = stripComments(methodText(WS_GS_SRC, 'addPpe'));
        assertTrue(add.indexOf('var base = manufactured || issued;') !== -1 &&
                   add.indexOf('this._ppeExpiry(base, term)') !== -1,
            'addPpe считает дату окончания автоматически (база — изготовление/выдача)');
        const upd = stripComments(methodText(WS_GS_SRC, 'updatePpe'));
        assertTrue(upd.indexOf('var base = manufactured || issued;') !== -1 &&
                   upd.indexOf('this._ppeExpiry(base, term)') !== -1,
            'updatePpe пересчитывает дату окончания (база — изготовление/выдача)');
    });

    test('WorkSchedule.gs: колонки-копии работник/должность (C/D)', () => {
        const add = stripComments(methodText(WS_GS_SRC, 'addPpe'));
        assertTrue(add.indexOf('emp.fio, emp.position') !== -1,
            'addPpe пишет ФИО/должность из справочника');
        assertTrue(add.indexOf('_ppeLookupEmployee') !== -1, 'поиск работника');
        assertTrue(add.indexOf('not_found_таб_номер') !== -1,
            'неизвестный таб. № → ошибка');
    });

    test('Code.gs: 4 case СИЗ', () => {
        for (const c of ['workSchedule.listPpe', 'workSchedule.addPpe',
                         'workSchedule.updatePpe', 'workSchedule.deletePpe']) {
            assertTrue(CODE_GS_SRC.indexOf("case '" + c + "':") !== -1,
                'case ' + c);
        }
    });

    test('PPEInit.gs: создание листа + предзаполнение перечня', () => {
        assertTrue(PPE_INIT_SRC.indexOf("PPE_SHEET_NAME = 'СИЗ'") !== -1,
            'имя листа');
        for (const f of ['function ppeDeployAll()', 'function ppeCreateSheet()',
                         'function ppePrefillStandard()', 'function ppeStatus()']) {
            assertTrue(PPE_INIT_SRC.indexOf(f) !== -1, 'функция ' + f);
        }
        const items = ['Костюм для защиты от растворов кислот и щелочей',
            'Ботинки', 'Белье нательное', 'Куртка утеплённая', 'Каска защитная',
            'Подшлемник', 'Противогаз', 'Очки закрытые'];
        for (const it of items) {
            assertTrue(PPE_INIT_SRC.indexOf("name: '" + it + "'") !== -1,
                'позиция перечня: ' + it);
        }
        assertTrue(PPE_INIT_SRC.indexOf("term: '1 год'") !== -1 &&
                   PPE_INIT_SRC.indexOf("term: '1,5 года'") !== -1 &&
                   PPE_INIT_SRC.indexOf("term: '2 года'") !== -1 &&
                   PPE_INIT_SRC.indexOf("term: 'До износа'") !== -1,
            'сроки образца: 1 год / 1,5 года / 2 года / До износа');
        assertTrue(PPE_INIT_SRC.indexOf("note: 'До износа'") !== -1,
            'примечание «До износа» (куртка/каска — как в образце)');
        assertTrue(PPE_INIT_SRC.indexOf('N767н') !== -1, 'Приказ Минтруда 767н');
        assertTrue(PPE_INIT_SRC.indexOf('setNumberFormat') !== -1,
            'таб_№ — текстовый формат (Task 304)');
    });

    test('SW: kipia-test-v742', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v742'") !== -1,
            'SWVersion bumped');
        assertTrue(SW_SRC.indexOf('kipia-test-v743') === -1,
            'двойного бампа не было');
    });
});

// ============================================================
// 5. VM — строка текущего момента: «6 (2 мастера, 2 дневных,
//    2 сменных).» — итог без скобок
// ============================================================
function workersHost(canEdit, employees) {
    const els = { wsWorkersBody: mkEl() };
    const EMPLOYEES = employees !== undefined ? employees : [
        { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'сменный',
          'смена': 1, 'должность': 'Слесарь КИПиА', 'комментарий': '',
          'дата_приёма': '2024-03-15' },
        { 'таб_номер': '023', 'ФИО': 'Петров П. П.', 'тип': 'дневной',
          'смена': '', 'должность': 'Инженер КИПиА', 'комментарий': '',
          'дата_приёма': '2025-01-20' },
        { 'таб_номер': '045', 'ФИО': 'Сидорова А. А.', 'тип': 'сменный',
          'смена': 2, 'должность': 'Электрик КИПиА', 'комментарий': '',
          'дата_приёма': '2023-06-01' },
        { 'таб_номер': '100', 'ФИО': 'Кузнецов К. К.', 'тип': 'сменный',
          'смена': '', 'должность': 'Мастер КИПиА', 'комментарий': '',
          'дата_приёма': '2022-04-01' },
        { 'таб_номер': '101', 'ФИО': 'Васильев В. В.', 'тип': 'дневной',
          'смена': '', 'должность': 'Мастер КИПиА см.1', 'комментарий': '',
          'дата_приёма': '2021-09-01' },
        { 'таб_номер': '102', 'ФИО': 'Николаева Н. Н.', 'тип': 'дневной',
          'смена': '', 'должность': 'Инженер КИПиА', 'комментарий': '',
          'дата_приёма': '2024-11-01' },
    ];
    const host = new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_renderWorkersPage') + ',\n' +
        methodText(INDEX_SRC, '_renderWorkersGeneral') + ',\n' +
        methodText(INDEX_SRC, 'selectWorkersTab') + ',\n' +
        methodText(INDEX_SRC, '_isMasterKipia') + ',\n' +
        '_workersTab: "general",' +
        '_canEdit: ' + JSON.stringify(!!canEdit) + ',' +
        '_year: 2026, _month: 6,' +
        '_EMPLOYEES: ' + JSON.stringify(EMPLOYEES) + ',' +
        '_VACATIONS: [],' +
        '_TRAININGS: [],' +
        '_renderWorkerCard: function(tabNo, withEdit) {' +
        '  return "CARD:" + tabNo + ":" + (withEdit ? "edit" : "view"); },' +
        // Task 393: страница «Работники» рендерит ПАНЕЛИ блоков карточки
        '_renderWorkerCardPanels: function(tabNo, withEdit) {' +
        '  return \'<div class="ws-wcard">CARD:\' + tabNo + \':\' + (withEdit ? "edit" : "view") + \'</div>\'; },' +
        '_vacNetDaysInYear: function(v, y) { return 0; },' +
        '_plural: ' + pluralRu + ',' +
        '_fmtDateRu: function(d) { return String(d); },' +
        '_esc: function(s) { return String(s); },' +
        '_escAttr: function(s) { return String(s); }' +
        '});')(mockDoc(els));
    return { host: host, els: els };
}

describe('Task 392 — VM: строка текущего момента без скобок', () => {

    test('VM: «Работников на текущий момент 6 (2 мастера, 2 дневных, 2 сменных).»', () => {
        const t = workersHost(true);
        t.host._renderWorkersPage();
        const body = t.els.wsWorkersBody.innerHTML;
        assertTrue(body.indexOf('Работников на текущий момент 6 (2 мастера, 2 дневных, 2 сменных).') !== -1,
            'ведущее 6 = 2+2+2 БЕЗ СКОБОК, разбивка в скобках');
        assertTrue(body.indexOf('Работников на текущий момент (6)') === -1,
            'старый формат «(6) (…)» отсутствует');
    });

    test('VM: пустой список — «0 (0 мастеров, 0 дневных, 0 сменных).»', () => {
        const t = workersHost(true, []);
        const html = t.host._renderWorkersGeneral([]);
        assertTrue(html.indexOf('Работников на текущий момент 0 (0 мастеров, 0 дневных, 0 сменных).') !== -1,
            'нули без скобок вокруг итога');
    });

    test('VM: штат (константа) не изменился', () => {
        const t = workersHost(true);
        const html = t.host._renderWorkersGeneral(t.host._EMPLOYEES);
        assertTrue(html.indexOf('Работников по штату 14 (2 мастера, 7 дневных, 5 сменных).') !== -1,
            'инвариант Task 391');
    });
});

// ============================================================
// 6. VM — карточка работника: секция СИЗ
// ============================================================
function cardHost(withEdit, ppe, employees) {
    const EMP = employees !== undefined ? employees : [
        { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
          'смена': '', 'должность': 'Мастер КИПиА', 'комментарий': '',
          'дата_приёма': '2024-03-15' },
        { 'таб_номер': '0377', 'ФИО': 'Первов С. А.', 'тип': 'сменный',
          'смена': 1, 'должность': 'Слесарь КИПиА', 'комментарий': '',
          'дата_приёма': '2025-01-20' },
    ];
    const host = new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
        '_canEdit: ' + JSON.stringify(!!withEdit) + ',' +
        '_year: 2026, _month: 8,' +
        '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
        '_VACATIONS: [],' +
        '_TRAININGS: [],' +
        '_PPE: ' + JSON.stringify(ppe || []) + ',' +
        '_fmtDateRu: function(d) { d = String(d);' +
        '  var p = d.split("-"); return p.length === 3 ?' +
        '  p[2] + "." + p[1] + "." + p[0] : d; },' +
        '_esc: function(s) { return String(s); },' +
        '_escAttr: function(s) { return String(s); },' +
        '_trainingCodeOf: function(t) { return "И"; },' +
        '_statusMeta: function(c) { return {}; }' +
        '});')(mockDoc({}));
    return host;
}

describe('Task 392 — VM: секция СИЗ в карточке работника', () => {

    const PPE = [
        { id: 1, 'таб_номер': '2706', наименование: 'Костюм для защиты от растворов кислот и щелочей',
          дата_выдачи: '2026-08-17', срок_годности: '1 год',
          дата_окончания: '2027-08-17', примечание: '' },
        { id: 2, 'таб_номер': '2706', наименование: 'Куртка утеплённая',
          дата_выдачи: '', срок_годности: '2 года',
          дата_окончания: '', примечание: 'До износа' },
        { id: 3, 'таб_номер': '2706', наименование: 'Очки закрытые',
          дата_выдачи: '', срок_годности: 'До износа',
          дата_окончания: 'До износа', примечание: '' },
        { id: 4, 'таб_номер': '0377', наименование: 'Ботинки',
          дата_выдачи: '2026-08-17', срок_годности: '1,5 года',
          дата_окончания: '2028-02-17', примечание: '' },
    ];

    test('записи работника с мета-строкой (выдано/срок/до)', () => {
        const host = cardHost(true, PPE);
        // Task 403: СИЗ — только страница «Работники» (asBlocks)
        const html = host._renderWorkerCard('2706', true, true)[3];
        assertTrue(html.indexOf('СИЗ · средства индивидуальной защиты') !== -1,
            'заголовок секции');
        assertTrue(html.indexOf('Костюм для защиты от растворов кислот и щелочей') !== -1,
            'наименование записи');
        assertTrue(html.indexOf('выдано 17.08.2026') !== -1, 'дата выдачи (ru)');
        assertTrue(html.indexOf('срок 1 год') !== -1, 'срок годности');
        assertTrue(html.indexOf('до 17.08.2027') !== -1, 'авто-дата окончания');
        // только записи ЭТОГО работника
        assertTrue(html.indexOf('Ботинки') === -1, 'чужие записи не попадают');
    });

    test('не выдано / До износа / примечание', () => {
        const host = cardHost(true, PPE);
        const html = host._renderWorkerCard('2706', true, true)[3];
        assertTrue(html.indexOf('не выдано') !== -1, 'без даты выдачи — «не выдано»');
        assertTrue(html.indexOf('срок 2 года') !== -1, 'срок без даты');
        assertTrue(html.indexOf('срок До износа') !== -1, 'срок «До износа»');
        assertTrue(html.indexOf('«До износа»') !== -1, 'примечание в кавычках');
    });

    test('кнопки ✎/✕ у записей с id — только редакторам', () => {
        const host = cardHost(true, PPE);
        const html = host._renderWorkerCard('2706', true, true)[3];
        assertTrue(html.indexOf('WorkSchedule.editPpe(1)') !== -1, '✎ запись 1');
        assertTrue(html.indexOf('WorkSchedule.deletePpe(3)') !== -1, '✕ запись 3');
        assertTrue(html.indexOf('ws-emp-addppe') !== -1, '«+ СИЗ…»');
        assertTrue(html.indexOf('WorkSchedule.onEmpAddPpe(\'2706\')') !== -1,
            'префилл работника в «+ СИЗ…»');
    });

    test('зритель — без кнопок, записи видны', () => {
        const host = cardHost(true, PPE);
        const html = host._renderWorkerCard('2706', false, true)[3];
        assertTrue(html.indexOf('СИЗ · средства индивидуальной защиты') !== -1,
            'секция видна зрителю');
        assertTrue(html.indexOf('editPpe') === -1 && html.indexOf('deletePpe') === -1 &&
                   html.indexOf('ws-emp-addppe') === -1,
            'кнопок правки/добавления нет');
    });

    test('пустой список СИЗ — «нет выданных СИЗ»', () => {
        const host = cardHost(true, []);
        const html = host._renderWorkerCard('2706', true, true)[3];
        assertTrue(html.indexOf('нет выданных СИЗ') !== -1, 'пустое состояние');
        assertTrue(html.indexOf('ws-emp-addppe') !== -1, '«+ СИЗ…» жив у редактора');
    });

    test('запись БЕЗ id (ручная строка листа) — без кнопок', () => {
        const host = cardHost(true, [
            { id: null, 'таб_номер': '2706', наименование: 'Перчатки',
              дата_выдачи: '', срок_годности: '', дата_окончания: '', примечание: '' },
        ]);
        const html = host._renderWorkerCard('2706', true, true)[3];
        assertTrue(html.indexOf('Перчатки') !== -1, 'запись видна');
        assertTrue(html.indexOf('editPpe(') === -1 && html.indexOf('deletePpe(') === -1,
            'без id — не правится (как отпуска Task 279)');
    });
});

// ============================================================
// 7. VM — клиентская логика: сроки, авто-дата, шторка, submit
// ============================================================
function ppeHost(ppe) {
    const els = {};
    const toasts = [];
    const calls = [];
    const loadGrid = [];
    const closed = { cell: 0, emp: 0 };
    const document = { getElementById: id => (els[id] || (els[id] = mkEl())) };
    const ctx = {
        document, Math, Date, String, Number, parseInt, parseFloat, isNaN,
        isFinite, Promise,
        setTimeout: () => 0,
        KipToast: { show: m => toasts.push(String(m)) },
        kipConfirm: () => Promise.resolve(true),
    };
    vm.createContext(ctx);
    const methods = [
        'onEmpAddPpe', 'editPpe', 'openPpeForm', 'closePpeForm',
        'onPpeFormInput', 'submitPpeForm', 'deletePpe', '_doDeletePpe',
        '_ppeTermMonths', '_ppeExpiry', '_fillPpeNameOptions',
        '_esc', '_escAttr', '_apiErrText', '_isoDate', '_fmtDateRu',
        '_parseIsoLocal',
    ];
    const src = methods.map(n => extractMethod(INDEX_SRC, n))
        .filter(Boolean).join(',\n');
    vm.runInContext(`
        var WSM = {
            _canEdit: true,
            _EMPLOYEES: [
                { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
                  'должность': 'Мастер КИПиА' },
                { 'таб_номер': '0377', 'ФИО': 'Первов С. А.', 'тип': 'сменный',
                  'должность': 'Слесарь КИПиА' },
            ],
            _PPE: ${JSON.stringify(ppe || [])},
            _ppeEditId: null,
            _api: function(action, payload) {
                __calls.push({ action: action, payload: payload });
                return Promise.resolve({ ok: true });
            },
            loadGrid: function(force) { __loadGrid.push(force); },
            closeCellPopup: function() { __closed.cell++; },
            closeEmpPopup: function() { __closed.emp++; },
            ${src}
        };
        globalThis.__api = {
            WSM: WSM,
            els: function() { return els; },
            setEl: function(id, v) { var el = document.getElementById(id); el.value = v; return el; },
            calls: function() { return __calls; },
            toasts: function() { return toasts; },
            loadGrid: function() { return __loadGrid; },
            closed: function() { return __closed; },
        };
    `.replace(/__calls/g, 'calls').replace(/__loadGrid/g, 'loadGrid')
       .replace(/__closed/g, 'closed').replace(/__api/g, 'api'),
       ctx, { filename: 'WSM-392' });
    // vars-хосты для моков (глобалы VM: замыкания кода выше видят их)
    ctx.calls = calls;
    ctx.loadGrid = loadGrid;
    ctx.closed = closed;
    ctx.els = els;
    ctx.toasts = toasts;
    return ctx.api;
}

describe('Task 392 — VM: _ppeTermMonths / _ppeExpiry (образец файла)', () => {

    test('сроки образца → месяцы', () => {
        const api = ppeHost();
        assertEqual(api.WSM._ppeTermMonths('1 год'), 12, '«1 год» → 12');
        assertEqual(api.WSM._ppeTermMonths('1,5 года'), 18, '«1,5 года» → 18');
        assertEqual(api.WSM._ppeTermMonths('2 года'), 24, '«2 года» → 24');
        assertEqual(api.WSM._ppeTermMonths('3 года'), 36, '«3 года» → 36');
        assertEqual(api.WSM._ppeTermMonths('6 мес.'), 6, '«6 мес.» → 6');
        assertEqual(api.WSM._ppeTermMonths('До износа'), -1, '«До износа» → маркер');
        assertEqual(api.WSM._ppeTermMonths(''), null, 'пусто → null');
        assertEqual(api.WSM._ppeTermMonths('случайный текст'), null, 'незнакомый → null');
    });

    test('авто-дата окончания: выдача + срок (образец)', () => {
        const api = ppeHost();
        assertEqual(api.WSM._ppeExpiry('2026-08-17', '1 год'), '2027-08-17',
            '17.08.2026 + 1 год (Галкин, костюм)');
        assertEqual(api.WSM._ppeExpiry('2026-08-17', '1,5 года'), '2028-02-17',
            '17.08.2026 + 1,5 года (ботинки)');
        assertEqual(api.WSM._ppeExpiry('2026-08-17', '2 года'), '2028-08-17', '+ 2 года');
        assertEqual(api.WSM._ppeExpiry('2026-08-31', '6 мес.'), '2027-02-28',
            'кламп: 31.08 + 6 мес → 28.02 (не 3 марта)');
        assertEqual(api.WSM._ppeExpiry('2028-08-31', '6 мес.'), '2029-02-28',
            'кламп невисокосного 2029');
        assertEqual(api.WSM._ppeExpiry('', '1 год'), null, 'без даты → null');
        assertEqual(api.WSM._ppeExpiry('2026-08-17', ''), null, 'без срока → null');
        assertEqual(api.WSM._ppeExpiry('2026-08-17', 'До износа'), 'До износа',
            '«До износа» → строка (очки закрытые)');
    });
});

describe('Task 392 — VM: шторка СИЗ (создание/правка/подсказка)', () => {

    const PPE = [
        { id: 7, 'таб_номер': '2706', наименование: 'Костюм для защиты от растворов кислот и щелочей',
          дата_выдачи: '2026-08-17', срок_годности: '1 год',
          дата_окончания: '2027-08-17', примечание: '' },
    ];

    test('openPpeForm: режим создания — заголовок/кнопка/фокусе нет полей', () => {
        const api = ppeHost(PPE);
        api.WSM.openPpeForm('2706');
        const els = api.els();
        assertEqual(els.wsPpeSheetTitle.textContent, 'Новое СИЗ', 'заголовок');
        assertEqual(els.wsPpeSubmitBtn.textContent, 'Добавить', 'кнопка');
        assertEqual(els.wsPpeTabNo.value, '2706', 'префилл работника');
        assertEqual(api.WSM._ppeEditId, null, 'режим создания');
    });

    test('openPpeForm(edit): префилл записи, «Правка СИЗ»/«Сохранить»', () => {
        const api = ppeHost(PPE);
        api.WSM.openPpeForm('2706', PPE[0]);
        const els = api.els();
        assertEqual(api.WSM._ppeEditId, 7, 'id правки');
        assertEqual(els.wsPpeSheetTitle.textContent, 'Правка СИЗ', 'заголовок');
        assertEqual(els.wsPpeSubmitBtn.textContent, 'Сохранить', 'кнопка');
        assertEqual(els.wsPpeName.value, 'Костюм для защиты от растворов кислот и щелочей',
            'наименование');
        assertEqual(els.wsPpeIssued.value, '2026-08-17', 'дата выдачи');
        assertEqual(els.wsPpeTerm.value, '1 год', 'срок');
    });

    test('onPpeFormInput: авто-дата окончания в подсказке', () => {
        const api = ppeHost(PPE);
        api.WSM.openPpeForm('2706');
        api.setEl('wsPpeIssued', '2026-08-17');
        api.setEl('wsPpeTerm', '1 год');
        api.WSM.onPpeFormInput();
        const txt = api.els().wsPpeExpiryInfo.textContent;
        assertTrue(txt.indexOf('17.08.2027') !== -1, 'дата окончания в подсказке: ' + txt);
        assertTrue(txt.indexOf('автоматически') !== -1, 'пометка «автоматически»');
        // «До износа»
        api.setEl('wsPpeTerm', 'До износа');
        api.WSM.onPpeFormInput();
        assertEqual(api.els().wsPpeExpiryInfo.textContent,
            'Дата окончания срока годности: До износа', '«До износа»');
        // без данных
        api.setEl('wsPpeIssued', '');
        api.setEl('wsPpeTerm', '');
        api.WSM.onPpeFormInput();
        assertEqual(api.els().wsPpeExpiryInfo.textContent,
            'Дата окончания срока годности: —', 'нет данных — прочерк');
    });

    test('submitPpeForm (создание): addPpe с полным payload', async () => {
        const api = ppeHost(PPE);
        api.WSM.openPpeForm('2706');
        const els = api.els();
        els.wsPpeName.value = 'Каска защитная';
        els.wsPpeIssued.value = '2026-09-01';
        els.wsPpeTerm.value = '2 года';
        els.wsPpeComment.value = 'До износа';
        api.WSM.submitPpeForm();
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        const add = api.calls().filter(c => c.action === 'workSchedule.addPpe');
        assertEqual(add.length, 1, 'вызов addPpe');
        assertEqual(add[0].payload['таб_номер'], '2706', 'таб_номер');
        assertEqual(add[0].payload.наименование, 'Каска защитная', 'наименование');
        assertEqual(add[0].payload.дата_выдачи, '2026-09-01', 'дата выдачи');
        assertEqual(add[0].payload.срок_годности, '2 года', 'срок');
        assertEqual(add[0].payload.примечание, 'До износа', 'примечание');
        assertEqual(api.loadGrid().length, 1, 'loadGrid(true)');
        assertTrue(api.toasts().join(' ').indexOf('СИЗ добавлено работнику') !== -1,
            'тост успеха');
    });

    test('submitPpeForm (правка): updatePpe с id', async () => {
        const api = ppeHost(PPE);
        api.WSM.openPpeForm('2706', PPE[0]);
        api.els().wsPpeName.value = 'Костюм для защиты от растворов кислот и щелочей';
        api.els().wsPpeIssued.value = '2026-08-20';
        api.els().wsPpeTerm.value = '1 год';
        api.WSM.submitPpeForm();
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        const upd = api.calls().filter(c => c.action === 'workSchedule.updatePpe');
        assertEqual(upd.length, 1, 'вызов updatePpe');
        assertEqual(upd[0].payload.id, 7, 'id записи');
        assertEqual(upd[0].payload.дата_выдачи, '2026-08-20', 'новая дата выдачи');
        assertEqual(api.calls().filter(c => c.action === 'workSchedule.addPpe').length, 0,
            'addPpe не зовётся в правке');
        assertTrue(api.toasts().join(' ').indexOf('Запись СИЗ обновлена') !== -1,
            'тост успеха');
    });

    test('submitPpeForm: валидация — без работника/наименования', () => {
        const api = ppeHost(PPE);
        api.WSM.openPpeForm();
        api.els().wsPpeTabNo.value = '';
        api.els().wsPpeName.value = 'Каска';
        api.WSM.submitPpeForm();
        assertEqual(api.calls().length, 0, 'без работника — на сервер не ушло');
        assertTrue(api.toasts().join(' ').indexOf('Выберите работника') !== -1, 'тост');
        api.toasts().length = 0;
        api.els().wsPpeTabNo.value = '2706';
        api.els().wsPpeName.value = '   ';
        api.WSM.submitPpeForm();
        assertEqual(api.calls().length, 0, 'без наименования — на сервер не ушло');
        assertTrue(api.toasts().join(' ').indexOf('наименование') !== -1, 'тост');
    });

    test('editPpe/deletePpe: попапы закрыты, правильные действия', async () => {
        const api = ppeHost(PPE);
        api.WSM.editPpe(7);
        assertEqual(api.WSM._ppeEditId, 7, 'правка найденной записи');
        assertEqual(api.closed().emp, 1, 'карточка закрыта');
        api.WSM.closePpeForm();
        api.WSM.deletePpe(7);
        assertEqual(api.closed().cell, 2, 'попап ячейки закрыт (правка + удаление)');
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        const del = api.calls().filter(c => c.action === 'workSchedule.deletePpe');
        assertEqual(del.length, 1, 'вызов deletePpe');
        assertEqual(del[0].payload.id, 7, 'id');
        assertEqual(api.loadGrid().length, 1, 'loadGrid(true)');
        assertTrue(api.toasts().join(' ').indexOf('Запись СИЗ удалена') !== -1, 'тост');
    });

    test('editPpe: не найден → тост, форма не открылась', () => {
        const api = ppeHost(PPE);
        api.WSM.editPpe(999);
        assertEqual(api.WSM._ppeEditId, null, 'режим не включён');
        assertTrue(api.toasts().join(' ').indexOf('не найдена') !== -1, 'тост');
    });

    test('onEmpAddPpe: карточка закрыта, форма с префиллом', () => {
        const api = ppeHost(PPE);
        api.WSM.onEmpAddPpe('0377');
        assertEqual(api.closed().emp, 1, 'карточка закрыта');
        assertEqual(api.els().wsPpeTabNo.value, '0377', 'префилл работника');
    });
});

// ============================================================
// 8. VM — сервер: listPpe / addPpe / updatePpe / deletePpe
// ============================================================
function mkSheet(rows) {
    const data = rows.map(r => r.slice());
    const writes = [];
    const formats = [];
    function getRange(row, col, numRows, numCols) {
        numRows = numRows || 1; numCols = numCols || 1;
        return {
            getValues() {
                const out = [];
                for (let i = 0; i < numRows; i++) {
                    const line = [];
                    for (let j = 0; j < numCols; j++) {
                        line.push((data[row - 1 + i] || [])[col - 1 + j] !== undefined
                            ? (data[row - 1 + i] || [])[col - 1 + j] : '');
                    }
                    out.push(line);
                }
                return out;
            },
            getValue() { return ((data[row - 1] || [])[col - 1] !== undefined ? (data[row - 1] || [])[col - 1] : ''); },
            setValues(v) {
                writes.push({ row, col, numRows, numCols, v });
                for (let i = 0; i < numRows; i++) {
                    for (let j = 0; j < numCols; j++) {
                        if (!data[row - 1 + i]) data[row - 1 + i] = [];
                        data[row - 1 + i][col - 1 + j] = v[i][j];
                    }
                }
            },
            setValue(v) {
                writes.push({ row, col, numRows: 1, numCols: 1, v: [[v]] });
                if (!data[row - 1]) data[row - 1] = [];
                data[row - 1][col - 1] = v;
            },
            setNumberFormat(f) { formats.push({ row, col, f }); },
        };
    }
    return {
        getLastRow() { return data.length; },
        getRange,
        deleteRow(r) { data.splice(r - 1, 1); },
        _data: data, _writes: writes, _formats: formats,
    };
}

function makePpeServer() {
    const audits = [];
    const sheets = {};
    const ctx = {
        Math, Date, String, Number, parseInt, parseFloat, isNaN,
        Utils: { audit: (email, code) => { audits.push(code); } },
    };
    vm.createContext(ctx);
    const methods = ['_parseIsoDate', '_parseSheetDate', '_safeDate', '_toIsoDate',
                     '_appendRowKeepText', 'listPpe', 'addPpe', 'updatePpe',
                     'deletePpe', '_ppeLookupEmployee', '_ppeTermMonths',
                     '_ppeExpiry', '_ppeHasManufactureCol',
                     // Task 489-adapt: _ppeLookupEmployee идёт через карту
                     '_employeesColMap', '_wsShortFio', '_wsNameInitial', '_wsFullFio'];
    const src = methods.map(n => extractMethod(WS_GS_SRC, n)).filter(Boolean).join(',\n');
    vm.runInContext(`
        var WSS = {
            EMPLOYEES_SHEET: 'Сотрудники',
            VACATIONS_SHEET: 'Отпуска',
            PPE_SHEET: 'СИЗ',
            _requireRead: function(token) { return { user: { email: 't@t' } }; },
            _requireWrite: function(token) { return { user: { email: 't@t' } }; },
            _getSheet: function(name) { return sheetsAccess[name] || null; },
            ${src}
        };
        globalThis.__api = {
            WSS: WSS,
            setSheet: function(name, rows) { sheetsAccess[name] = mkSheetHost(rows); return sheetsAccess[name]; },
            audits: function() { return audits; },
        };
    `.replace(/sheetsAccess/g, 'sheetsHost').replace(/mkSheetHost/g, 'mkSheet')
       .replace(/auditsHost/g, 'audits'), ctx, { filename: 'WorkSchedule.gs-392' });
    ctx.sheetsHost = sheets;
    ctx.mkSheet = mkSheet;
    ctx.audits = audits;
    return ctx.__api;
}

describe('Task 392 — VM сервер: listPpe', () => {

    function ppeSheet() {
        // Task 443: столбец G «дата_изготовления» (10 столбцов)
        return [
            ['id', 'таб_номер', 'работник', 'должность', 'наименование_СИЗ',
             'дата_выдачи', 'дата_изготовления', 'срок_годности',
             'дата_окончания', 'примечание'],
            [1, '2706', 'Галкин Д. Н.', 'Мастер КИПиА',
             'Костюм для защиты от растворов кислот и щелочей',
             new Date(2026, 7, 17), '', '1 год', new Date(2027, 7, 17), ''],
            [2, '2706', 'Галкин Д. Н.', 'Мастер КИПиА', 'Очки закрытые',
             '', '', 'До износа', 'До износа', ''],
            [3, '0377', 'Первов С. А.', 'Слесарь КИПиА', 'Ботинки',
             '2026-08-17', '2025-02-15', '1,5 года', '2028-02-17', ''],
            ['', '', '', '', '', '', '', '', '', ''],  // пустой стилевой хвост
        ];
    }

    test('чтение: ISO-даты, текстовые даты, «До износа» строкой, пропуск пустых', () => {
        const api = makePpeServer();
        api.setSheet('СИЗ', ppeSheet());
        const res = api.WSS.listPpe({ token: 't' });
        assertEqual(res.ok, true, 'успех');
        const ppe = res.data.ppe;
        assertEqual(ppe.length, 3, '3 записи (пустая строка пропущена)');
        assertEqual(ppe[0].дата_выдачи, '2026-08-17', 'Date → ISO');
        assertEqual(ppe[0].дата_окончания, '2027-08-17', 'окончание Date → ISO');
        assertEqual(ppe[1].дата_окончания, 'До износа', '«До износа» строкой');
        assertEqual(ppe[2].дата_выдачи, '2026-08-17', 'текстовая дата распарсена');
        assertEqual(ppe[2].дата_окончания, '2028-02-17', 'текстовое окончание');
        // Task 443: дата изготовления читается (текстовая — парсится,
        // пустая — пустая строка)
        assertEqual(ppe[2].дата_изготовления, '2025-02-15', 'дата изготовления (текст → ISO)');
        assertEqual(ppe[0].дата_изготовления, '', 'без даты изготовления — пусто');
        assertEqual(ppe[0].наименование, 'Костюм для защиты от растворов кислот и щелочей',
            'наименование');
    });

    test('листа нет → sheet_not_found (клиент молча пустеет)', () => {
        const api = makePpeServer();
        const res = api.WSS.listPpe({ token: 't' });
        assertEqual(res.ok, false, 'отказ');
        assertEqual(res.error, 'sheet_not_found: СИЗ', 'код');
    });
});

describe('Task 392 — VM сервер: addPpe', () => {

    function empSheet() {
        return [
            ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон', 'старт', 'приём', 'увол', 'архив', 'должность', 'комментарий'],
            ['2706', 'Галкин Д. Н.', 'дневной', '', '', '', new Date(2024, 2, 15), '', 0, 'Мастер КИПиА', ''],
        ];
    }
    function ppeEmpty() {
        // Task 443: шапка новой структуры (G — дата изготовления)
        return [['id', 'таб_номер', 'работник', 'должность', 'наименование_СИЗ',
                 'дата_выдачи', 'дата_изготовления', 'срок_годности',
                 'дата_окончания', 'примечание']];
    }

    test('happy-path: id, копии C/D, авто-дата окончания, текстовый B', () => {
        const api = makePpeServer();
        const emp = api.setSheet('Сотрудники', empSheet());
        const sheet = api.setSheet('СИЗ', ppeEmpty());
        const res = api.WSS.addPpe({
            token: 't', 'таб_номер': '2706',
            наименование: 'Костюм для защиты от растворов кислот и щелочей',
            дата_выдачи: '2026-08-17', срок_годности: '1 год', примечание: '',
        });
        assertEqual(res.ok, true, 'успех');
        assertEqual(res.data.id, 1, 'id = max+1');
        const row = sheet._data[1];
        assertEqual(row[1], '2706', 'B: таб_№');
        assertEqual(row[2], 'Галкин Д. Н.', 'C: работник (копия из справочника)');
        assertEqual(row[3], 'Мастер КИПиА', 'D: должность (копия)');
        assertEqual(row[4], 'Костюм для защиты от растворов кислот и щелочей', 'E: наименование');
        assertEqual(row[5].getTime(), new Date(2026, 7, 17).getTime(), 'F: дата выдачи');
        assertTrue(row[6] === null || row[6] === '',
            'G: без даты изготовления — пусто (Task 443)');
        assertEqual(row[7], '1 год', 'H: срок (Task 443: сместился из G)');
        assertEqual(row[8].getTime(), new Date(2027, 7, 17).getTime(),
            'I: АВТО-дата окончания = выдача + 1 год (без изготовления)');
        assertEqual(row[9], '', 'J: примечание (Task 443: сместилось из I)');
        assertTrue(sheet._formats.some(f => f.col === 2 && f.f === '@'),
            'B — текстовый формат (Task 304)');
        assertTrue(api.audits().indexOf('WORKSCHEDULE_ADD_PPE') !== -1, 'аудит');
    });

    test('«До износа» → дата окончания строкой; без даты — пусто', () => {
        const api = makePpeServer();
        api.setSheet('Сотрудники', empSheet());
        const sheet = api.setSheet('СИЗ', ppeEmpty());
        api.WSS.addPpe({ token: 't', 'таб_номер': '2706',
            наименование: 'Очки закрытые', срок_годности: 'До износа' });
        assertEqual(sheet._data[1][8], 'До износа', 'I = «До износа» (текст; Task 443)');
        api.WSS.addPpe({ token: 't', 'таб_номер': '2706',
            наименование: 'Ботинки', срок_годности: '1,5 года' });
        assertTrue(sheet._data[2][5] === null || sheet._data[2][5] === '',
            'F: не выдано — пусто');
        assertTrue(sheet._data[2][8] === null || sheet._data[2][8] === '',
            'I: без даты — пусто');
        assertEqual(sheet._data[2][0], 2, 'id инкрементится');
    });

    test('валидации: неизвестный таб.№, пустое наименование, нет листа', () => {
        const api = makePpeServer();
        api.setSheet('Сотрудники', empSheet());
        api.setSheet('СИЗ', ppeEmpty());
        assertEqual(api.WSS.addPpe({ token: 't', 'таб_номер': '0001',
            наименование: 'X' }).error, 'not_found_таб_номер', 'нет работника');
        assertEqual(api.WSS.addPpe({ token: 't', 'таб_номер': '2706',
            наименование: '   ' }).error, 'invalid_наименование', 'нет наименования');
        const api2 = makePpeServer();
        api2.setSheet('Сотрудники', empSheet());
        assertEqual(api2.WSS.addPpe({ token: 't', 'таб_номер': '2706',
            наименование: 'X' }).error, 'sheet_not_found: СИЗ', 'нет листа СИЗ');
    });
});

describe('Task 392 — VM сервер: updatePpe / deletePpe', () => {

    function empSheet() {
        return [
            ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон', 'старт', 'приём', 'увол', 'архив', 'должность', 'комментарий'],
            ['2706', 'Галкин Д. Н.', 'дневной', '', '', '', new Date(2024, 2, 15), '', 0, 'Мастер КИПиА', ''],
        ];
    }
    function ppeSheet() {
        // Task 443: шапка новой структуры (G — дата изготовления)
        return [
            ['id', 'таб_номер', 'работник', 'должность', 'наименование_СИЗ',
             'дата_выдачи', 'дата_изготовления', 'срок_годности',
             'дата_окончания', 'примечание'],
            [5, '2706', 'Галкин Д. Н.', 'Мастер КИПиА (стар.)', 'Каска защитная',
             new Date(2025, 0, 10), '', '2 года', new Date(2027, 0, 10), 'До износа'],
            [6, '2706', 'Галкин Д. Н.', 'Мастер КИПиА', 'Подшлемник',
             '', '', '', '', ''],
        ];
    }

    test('updatePpe: B..J по id, копии освежены, дата пересчитана', () => {
        const api = makePpeServer();
        api.setSheet('Сотрудники', empSheet());
        const sheet = api.setSheet('СИЗ', ppeSheet());
        const res = api.WSS.updatePpe({
            token: 't', id: 5, 'таб_номер': '2706',
            наименование: 'Каска защитная',
            дата_выдачи: '2026-09-01', срок_годности: '1 год',
            примечание: 'новая выдача',
        });
        assertEqual(res.ok, true, 'успех');
        const row = sheet._data[1];
        assertEqual(row[0], 5, 'A: id не меняется');
        assertEqual(row[3], 'Мастер КИПиА', 'D: должность освежена из справочника');
        assertEqual(row[5].getTime(), new Date(2026, 8, 1).getTime(), 'F: новая дата выдачи');
        assertTrue(row[6] === null || row[6] === '',
            'G: дата изготовления пустая (Task 443)');
        assertEqual(row[7], '1 год', 'H: новый срок (Task 443: сместился из G)');
        assertEqual(row[8].getTime(), new Date(2027, 8, 1).getTime(),
            'I: АВТО-дата пересчитана (Task 443: сместилась из H)');
        assertEqual(row[9], 'новая выдача', 'J: примечание (Task 443: сместилось из I)');
        assertEqual(sheet._data[2][4], 'Подшлемник', 'чужая строка не тронута');
        assertTrue(sheet._formats.some(f => f.row === 2 && f.col === 2 && f.f === '@'),
            'B — текстовый формат при правке');
        assertTrue(api.audits().indexOf('WORKSCHEDULE_UPDATE_PPE') !== -1, 'аудит');
    });

    test('updatePpe: не найден id / работник', () => {
        const api = makePpeServer();
        api.setSheet('Сотрудники', empSheet());
        api.setSheet('СИЗ', ppeSheet());
        assertEqual(api.WSS.updatePpe({ token: 't', id: 999, 'таб_номер': '2706',
            наименование: 'X' }).error, 'not_found', 'нет строки');
        assertEqual(api.WSS.updatePpe({ token: 't', id: 5, 'таб_номер': '0001',
            наименование: 'X' }).error, 'not_found_таб_номер', 'нет работника');
    });

    test('deletePpe: строка удалена по id, аудит', () => {
        const api = makePpeServer();
        api.setSheet('Сотрудники', empSheet());
        const sheet = api.setSheet('СИЗ', ppeSheet());
        const res = api.WSS.deletePpe({ token: 't', id: 5 });
        assertEqual(res.ok, true, 'успех');
        assertEqual(sheet._data.length, 2, 'строка удалена (осталась шапка + 1)');
        assertEqual(sheet._data[1][0], 6, 'удалена именно id=5');
        assertTrue(api.audits().indexOf('WORKSCHEDULE_DELETE_PPE') !== -1, 'аудит');
        assertEqual(api.WSS.deletePpe({ token: 't', id: 999 }).error, 'not_found',
            'несуществующий id');
    });
});
