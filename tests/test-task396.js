// ============================================================
// Task 396 — заявка (3 части):
//  (1) «В блоках карт работников, цвет фона чередующихся строк
//      сделай зеброй» — класс ws-row-alt на ВТОРЫХ строках
//      каждого блока (профиль/отпуска/мероприятия/СИЗ), только
//      у блоков-окон (asBlocks); попап шахматки — без зебры;
//  (2) «В блоке профиля, кнопки правки данных и увольнения
//      оформи в виде компактных кнопок и перемести в верхний
//      правый угол блока, также сделай с кнопками в остальных
//      блоках» — .ws-wbtn (26px) в .ws-whead-a шапки блока:
//      «Правка данных…»/«Уволить…» (профиль), «+ Отпуск…»,
//      «+ Мероприятие…», «+ СИЗ…» (свои блоки); контракты
//      onclick и классы-маркеры прежние; легаси-строки внизу
//      блока остаются для вида БЕЗ asBlocks (гейт
//      withEdit && !asBlocks — попап-совместимый путь);
//  (3) «В верхних строках оглавления блоков, шрифт сделай
//      немного больше и ярче, и выдели другим фоном» —
//      шапка-полоса .ws-whead на всю ширину окна (отрицательные
//      поля гасят паддинг панели): тёмная #1E2B42 / светлая
//      #E4E0D3 (как .ws-wgen-head Task 390); ФИО 16px/700 без
//      капса (ws-whead-name), секции 13px/700 капс; цвет —
//      первичный (было: 15px/600 и 12px/600 вторичный).
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

// ============================================================
// 1. SRC — JS: шапки .ws-whead + компактные кнопки + зебра
// ============================================================
describe('Task 396 — SRC: шапки блоков с кнопками в углу', () => {

    test('b1: .ws-whead + кнопки «Правка данных…»/«Уволить…» (asBlocks)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf("'<div class=\"ws-whead\"><div class=\"ws-whead-t ws-whead-name\">'") !== -1,
            'шапка профиля — полоса .ws-whead с заголовком ФИО');
        assertTrue(fn.indexOf('<div class="ws-whead-a">\' + b1Acts') !== -1,
            'кнопки действий — в ПРАВОМ углу шапки (ws-whead-a)');
        assertTrue(fn.indexOf('class="ws-wbtn ws-emp-editdata"') !== -1,
            '«Правка данных…» — компактная кнопка .ws-wbtn');
        assertTrue(fn.indexOf('class="ws-wbtn ws-wbtn-danger ws-emp-dismiss"') !== -1,
            '«Уволить…» — компактная кнопка .ws-wbtn-danger');
        assertTrue(fn.indexOf("WorkSchedule.openEmpEditForm(\\'") !== -1 &&
                   fn.indexOf("WorkSchedule.openDismissForm(\\'") !== -1,
            'контракты onclick прежние (openEmpEditForm/openDismissForm)');
        assertTrue(fn.indexOf('Правка данных…</button>') !== -1 &&
                   fn.indexOf('Уволить…</button>') !== -1,
            'тексты кнопок (button, не строка div)');
    });

    test('b2/b3/b4: «+ Отпуск…»/«+ Мероприятие…»/«+ СИЗ…» — кнопки в шапках', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf('class="ws-wbtn ws-emp-addvac"') !== -1,
            '«+ Отпуск…» — кнопка в шапке блока отпусков');
        assertTrue(fn.indexOf('class="ws-wbtn ws-emp-addtr"') !== -1,
            '«+ Мероприятие…» — кнопка в шапке блока мероприятий');
        assertTrue(fn.indexOf('class="ws-wbtn ws-emp-addppe"') !== -1,
            '«+ СИЗ…» — кнопка в шапке блока СИЗ');
        assertTrue(fn.indexOf("WorkSchedule.onEmpAddVacation(\\'") !== -1 &&
                   fn.indexOf("WorkSchedule.onEmpAddTraining(\\'") !== -1 &&
                   fn.indexOf("WorkSchedule.onEmpAddPpe(\\'") !== -1,
            'контракты onclick прежние');
        assertTrue(fn.indexOf('+ Отпуск…</button>') !== -1 &&
                   fn.indexOf('+ Мероприятие…</button>') !== -1 &&
                   fn.indexOf('+ СИЗ…</button>') !== -1,
            'тексты кнопок');
        // шапки секций — заголовок СЛЕВА, кнопка СПРАВА (whead-t до whead-a)
        const iVac = fn.indexOf("'<div class=\"ws-whead\"><div class=\"ws-whead-t\">Отпуска · '");
        const iVacBtn = fn.indexOf('ws-emp-addvac');
        assertTrue(iVac !== -1 && iVac < iVacBtn,
            'заголовок «Отпуска · год» — до кнопки (слева от неё)');
    });

    test('легаси-строки действий — гейт withEdit && !asBlocks (попап-путь)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertEqual(fn.split('if (withEdit && !asBlocks) {').length - 1, 6,
            'шесть легаси-строк (Правка/Уволить/+Отпуск/+Мероприятие/'
            + '+Инструктаж/+СИЗ) — только БЕЗ asBlocks (Task 405)');
        assertTrue(fn.indexOf('ws-popup-row ws-popup-more ws-emp-editdata') !== -1 &&
                   fn.indexOf('ws-popup-row ws-popup-more ws-emp-addvac') !== -1,
            'легаси-разметка строк сохранена (совместимость попапа)');
        assertTrue(fn.indexOf('if (withEdit) {') !== -1,
            'гейт withEdit жив (сборка кнопок b1Acts)');
    });

    test('зебра: класс ws-row-alt — вторые строки, только asBlocks', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf('((asBlocks && fRow % 2 === 1) ? \' ws-row-alt\' : \'\')') !== -1,
            'поля профиля — по счётчику РЕНДЕРЯЩИХСЯ строк (fRow)');
        assertTrue(fn.indexOf('((asBlocks && vk % 2 === 1) ? \' ws-row-alt\' : \'\')') !== -1,
            'строки отпусков (vk)');
        assertTrue(fn.indexOf('((asBlocks && tk % 2 === 1) ? \' ws-row-alt\' : \'\')') !== -1,
            'строки мероприятий (tk)');
        assertTrue(fn.indexOf('((asBlocks && pk % 2 === 1) ? \' ws-row-alt\' : \'\')') !== -1,
            'записи СИЗ (pk)');
        assertTrue(fn.indexOf('fRow++;') !== -1, 'счётчик полей инкрементируется');
    });
});

// ============================================================
// 2. SRC — CSS: шапка .ws-whead / кнопки .ws-wbtn / зебра
// ============================================================
describe('Task 396 — SRC: CSS шапок, кнопок и зебры', () => {

    test('.ws-whead — полоса на всю ширину с ДРУГИМ фоном (тёмная)', () => {
        const r = ruleBlock('.ws-wcard .ws-whead {');
        assertTrue(r !== null, 'правило живо');
        assertTrue(r.indexOf('background: #1E2B42;') !== -1,
            'фон ДРУГОЙ — как выделенная шапка сводки .ws-wgen-head (Task 390)');
        assertTrue(r.indexOf('margin: -14px -16px 10px;') !== -1,
            'полоса НА ВСЮ ШИРИНУ окна (отрицательные поля гасят паддинг панели)');
        assertTrue(r.indexOf('border-radius: 8px 8px 0 0;') !== -1,
            'верхние углы скруглены (внутренний радиус панели)');
        assertTrue(r.indexOf('display: flex;') !== -1 &&
                   r.indexOf('justify-content: space-between;') !== -1,
            'заголовок слева, кнопки справа');
        assertTrue(r.indexOf('flex-wrap: wrap;') !== -1,
            'на узком экране кнопки переносятся ниже');
    });

    test('.ws-whead — светлая тема', () => {
        const r = ruleBlock('[data-theme="light"] .ws-wcard .ws-whead {');
        assertTrue(r !== null && r.indexOf('background: #E4E0D3;') !== -1,
            'тёплый тон шапки сводки светлой темы (Task 390)');
    });

    test('заголовок: КРУПНЕЕ и ЯРЧЕ (16px ФИО / 13px секции, 700, первичный)', () => {
        const t = ruleBlock('.ws-wcard .ws-whead-t {');
        assertTrue(t !== null && t.indexOf('font-size: 13px;') !== -1,
            'секции — 13px (было 12px)');
        assertTrue(t.indexOf('font-weight: 700;') !== -1, 'жирность 700 (было 600)');
        assertTrue(t.indexOf('color: var(--text-primary, #e0e0e0);') !== -1,
            'цвет ПЕРВИЧНЫЙ (было вторичный 0.45)');
        const n = ruleBlock('.ws-wcard .ws-whead-t.ws-whead-name {');
        assertTrue(n !== null && n.indexOf('font-size: 16px;') !== -1,
            'ФИО — 16px (было 15px)');
        assertTrue(n.indexOf('text-transform: none;') !== -1,
            'ФИО — без капса (секции — капс)');
        const a = ruleBlock('.ws-wcard .ws-whead-a {');
        assertTrue(a !== null && a.indexOf('margin-left: auto;') !== -1,
            'кнопки прижаты ВПРАВО (и при переносе на свою строку)');
    });

    test('.ws-wbtn — компактная кнопка в стиле сайта', () => {
        const r = ruleBlock('.ws-wbtn {');
        assertTrue(r !== null, 'правило живо');
        assertTrue(r.indexOf('height: 26px;') !== -1, 'компактная высота 26px');
        assertTrue(r.indexOf('font-size: 12px;') !== -1, 'шрифт 12px');
        assertTrue(r.indexOf('background: var(--accent-blue, #4a8fc7);') !== -1,
            'акцент сайта: тёмная СИНИЙ, светлая ОРАНЖЕВЫЙ (как «Добавить работника» Task 391)');
        assertTrue(r.indexOf('color: #fff;') !== -1, 'белый текст');
        const d = ruleBlock('.ws-wbtn.ws-wbtn-danger {');
        assertTrue(d !== null && d.indexOf('background: #ef5350;') !== -1,
            '«Уволить…» — красная (тёмная)');
        const dl = INDEX_SRC.indexOf('[data-theme="light"] .ws-wbtn.ws-wbtn-danger {');
        assertTrue(dl !== -1 && INDEX_SRC.slice(dl, dl + 200).indexOf('#c62828;') !== -1,
            'красная светлая (#c62828)');
    });

    test('зебра строк — чередующийся фон (обе темы)', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-wcard .ws-emp-field.ws-row-alt,') !== -1 &&
                   INDEX_SRC.indexOf('.ws-wcard .ws-popup-row.ws-row-alt,') !== -1 &&
                   INDEX_SRC.indexOf('.ws-wcard .ws-ppe-item.ws-row-alt {') !== -1,
            'правила зебры для всех трёх типов строк');
        const i = INDEX_SRC.indexOf('.ws-wcard .ws-emp-field.ws-row-alt,');
        const seg = INDEX_SRC.slice(i, i + 400);
        assertTrue(seg.indexOf('background: rgba(255, 255, 255, 0.045);') !== -1,
            'тёмная — светлый тинт (как зебра сводной таблицы «Общей»)');
        const il = INDEX_SRC.indexOf('[data-theme="light"] .ws-wcard .ws-emp-field.ws-row-alt,');
        const segl = INDEX_SRC.slice(il, il + 400);
        assertTrue(il !== -1 && segl.indexOf('background: rgba(0, 0, 0, 0.05);') !== -1,
            'светлая — тёмный тинт');
        // Task 432 (заявка: «убери фон зебры строк в виде рамки, и
        // размести строки на всю ширину в блоке, зеброй без рамок
        // и отступов»): строки — во всю ширину окна (margin: 0 -16px
        // гасит паддинг панели), вертикальный ритм 5px, боковой
        // паддинг 16px держит текст на линии панели; «пилюли» сняты
        const f = ruleBlock('.ws-wcard .ws-emp-field {');
        assertTrue(f.indexOf('padding: 5px 16px;') !== -1, 'поля — вертикаль 5px (Task 432)');
        assertTrue(f.indexOf('margin: 0 -16px;') !== -1, 'поля — во всю ширину окна');
        const row = ruleBlock('.ws-wcard .ws-popup-row {');
        assertTrue(row.indexOf('padding: 5px 16px;') !== -1, 'строки — вертикаль 5px');
        assertTrue(row.indexOf('margin: 0 -16px;') !== -1, 'строки — во всю ширину окна');
        const ppe = ruleBlock('.ws-wcard .ws-ppe-item {');
        assertTrue(ppe.indexOf('padding: 5px 16px;') !== -1, 'СИЗ — вертикаль 5px');
        assertTrue(ppe.indexOf('margin: 0 -16px;') !== -1, 'СИЗ — во всю ширину окна');
        // Task 432: скругление «пилюли» СНЯТО — зебра без рамок
        const iR = INDEX_SRC.indexOf('.ws-wcard .ws-emp-field,\n' +
            '    .ws-wcard .ws-popup-row,');
        const rR = INDEX_SRC.slice(iR, INDEX_SRC.indexOf('}', iR));
        assertTrue(iR !== -1 && rR.indexOf('border-radius: 0') !== -1,
            'скругление снято — border-radius: 0 (Task 432)');
    });

    test('SW поднят до kipia-test-v742', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v742'") !== -1,
            'SW kipia-test-v742');
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v623'") === -1,
            'прежней v623 нет');
    });
});

// ============================================================
// 3. VM — карточка: шапки/кнопки/зебра у блоков; легаси и попап
// ============================================================
function cardHost(withEdit) {
    const EMP = [
        { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
          'смена': '', 'должность': 'Мастер КИПиА', 'комментарий': '',
          'группа_допуска': 'IV', 'дата_приёма': '2024-03-15' },
        { 'таб_номер': '0377', 'ФИО': 'Первов С. А.', 'тип': 'сменный',
          'смена': 1, 'должность': 'Слесарь КИПиА', 'комментарий': '',
          'дата_приёма': '2025-01-20' },
    ];
    const VAC = [
        { id: 21, 'таб_номер': '2706', 'часть': 1,
          'дата_начала': '2026-05-11', 'дата_окончания': '2026-05-24', 'комментарий': '' },
        { id: 22, 'таб_номер': '2706', 'часть': 2,
          'дата_начала': '2026-08-03', 'дата_окончания': '2026-08-16', 'комментарий': '' },
        { id: 23, 'таб_номер': '2706', 'часть': 2,
          'дата_начала': '2026-11-02', 'дата_окончания': '2026-11-15', 'комментарий': 'зимняя' },
    ];
    const TR = [
        { id: 31, 'таб_номер': '2706', 'тип': 'инструктаж', 'тема': 'Охрана труда',
          'дата_начала': '2026-03-10', 'дата_окончания': '2026-03-10' },
        { id: 32, 'таб_номер': '2706', 'тип': 'обучение', 'тема': 'Пожарная безопасность',
          'дата_начала': '2026-05-20', 'дата_окончания': '2026-05-20' },
        { id: 33, 'таб_номер': '2706', 'тип': 'инструктаж', 'тема': 'Первая помощь',
          'дата_начала': '2026-09-15', 'дата_окончания': '2026-09-15' },
        { id: 34, 'таб_номер': '2706', 'тип': 'проверка знаний', 'тема': 'Экзамен',
          'дата_начала': '2026-10-01', 'дата_окончания': '2026-10-01' },
    ];
    const PPE = [
        { id: 1, 'таб_номер': '2706', наименование: 'Каска защитная',
          дата_выдачи: '2026-09-17', срок_годности: '1 год',
          дата_окончания: '2027-09-17', примечание: '' },
        { id: 2, 'таб_номер': '2706', наименование: 'Очки закрытые',
          дата_выдачи: '', срок_годности: 'До износа',
          дата_окончания: 'До износа', примечание: '' },
        { id: 3, 'таб_номер': '2706', наименование: 'Ботинки',
          дата_выдачи: '2025-09-05', срок_годности: '2 года',
          дата_окончания: '2027-09-05', примечание: '' },
    ];
    const host = new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
        methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
        methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
        methodText(INDEX_SRC, '_lastExam1000Date') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
        methodText(INDEX_SRC, '_isInstrType') + ',\n' +
        '_canEdit: ' + JSON.stringify(!!withEdit) + ',' +
        '_year: 2026, _month: 8,' +
        '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
        '_VACATIONS: ' + JSON.stringify(VAC) + ',' +
        '_TRAININGS: ' + JSON.stringify(TR) + ',' +
        '_PPE: ' + JSON.stringify(PPE) + ',' +
        '_fmtDateRu: function(d) { d = String(d);' +
        '  var p = d.split("-"); return p.length === 3 ?' +
        '  p[2] + "." + p[1] + "." + p[0] : d; },' +
        '_esc: function(s) { return String(s); },' +
        '_escAttr: function(s) { return String(s); },' +
        '_trainingCodeOf: function(t) { return "И"; },' +
        '_statusMeta: function(c) { return {}; },' +
        '_vacDaysInYear: function(v, y) { return 10; },' +
        '_vacNetDaysInYear: function(v, y) { return 10; },' +
        '_plural: function(n, f) { return f[2]; }' +
        '});')(mockDoc({}));
    return host;
}

describe('Task 396 — VM: блоки-окна (asBlocks) — шапки и кнопки', () => {

    test('четыре блока — каждый с шапкой .ws-whead', () => {
        const h = cardHost(true);
        const blocks = h._renderWorkerCard('2706', true, true);
        assertEqual(blocks.length, 5, 'массив 5 блоков (Task 393 + 405)');
        blocks.forEach(function(b, i) {
            assertTrue(b.indexOf('<div class="ws-whead">') === 0,
                'блок ' + (i + 1) + ' НАЧИНАЕТСЯ с шапки-полосы .ws-whead');
        });
        assertTrue(blocks[0].indexOf('ws-whead-name') !== -1 &&
                   blocks[0].indexOf('Галкин Д. Н. · таб. №2706') !== -1,
            'шапка профиля — ФИО · таб. № (16px класс)');
        assertTrue(blocks[1].indexOf('Отпуска · 2026') !== -1, 'шапка отпусков');
        assertTrue(blocks[2].indexOf('Мероприятия · 2026') !== -1, 'шапка мероприятий');
        assertTrue(blocks[3].indexOf('СИЗ · средства индивидуальной защиты') !== -1, 'шапка СИЗ');
        assertTrue(
            blocks[4].indexOf('Повторные инструктажи и периодическая проверка знаний · 2026') !== -1,
            'Task 405: шапка блока повторных инструктажей');
        assertTrue(blocks[4].indexOf('ws-whead-wrap') !== -1,
            'Task 405: длинный заголовок — с классом переноса');
    });

    test('кнопки — В ВЕРХНЕМ ПРАВОМ УГЛУ шапок (до контента блока)', () => {
        const h = cardHost(true);
        const blocks = h._renderWorkerCard('2706', true, true);
        // b1: «Правка данных…»/«Уволить…» — в шапке, ДО полей профиля
        const iEdit = blocks[0].indexOf('ws-emp-editdata');
        const iField = blocks[0].indexOf('ws-emp-field');
        const iDismiss = blocks[0].indexOf('ws-emp-dismiss');
        assertTrue(iEdit !== -1 && iField !== -1 && iEdit < iField,
            '«Правка данных…» — в шапке (выше полей профиля)');
        assertTrue(iDismiss !== -1 && iDismiss < iField,
            '«Уволить…» — тоже в шапке');
        assertTrue(blocks[0].indexOf('ws-popup-more') === -1,
            'строк-действий ВНИЗУ блока профиля больше НЕТ');
        assertTrue(blocks[0].indexOf('<button type="button" class="ws-wbtn ws-emp-editdata"') !== -1 &&
                   blocks[0].indexOf('WorkSchedule.openEmpEditForm(\'2706\')') !== -1,
            'кнопка-элемент с прежним onclick');
        assertTrue(blocks[0].indexOf('class="ws-wbtn ws-wbtn-danger ws-emp-dismiss"') !== -1 &&
                   blocks[0].indexOf('WorkSchedule.openDismissForm(\'2706\')') !== -1,
            '«Уволить…» — красная компактная кнопка');
        // b2/b3/b4: «+ …» — в шапках, до строк
        assertTrue(blocks[1].indexOf('class="ws-wbtn ws-emp-addvac"') !== -1 &&
                   blocks[1].indexOf('WorkSchedule.onEmpAddVacation(\'2706\')') !== -1 &&
                   blocks[1].indexOf('ws-emp-addvac') < blocks[1].indexOf('Часть 1'),
            '«+ Отпуск…» — в шапке блока отпусков (выше строк периодов)');
        assertTrue(blocks[2].indexOf('class="ws-wbtn ws-emp-addtr"') !== -1 &&
                   blocks[2].indexOf('WorkSchedule.onEmpAddTraining(\'2706\')') !== -1,
            '«+ Мероприятие…» — в шапке блока мероприятий');
        assertTrue(blocks[3].indexOf('class="ws-wbtn ws-emp-addppe"') !== -1 &&
                   blocks[3].indexOf('WorkSchedule.onEmpAddPpe(\'2706\')') !== -1,
            '«+ СИЗ…» — в шапке блока СИЗ');
        assertTrue(blocks[4].indexOf('class="ws-wbtn ws-emp-addins"') !== -1 &&
                   blocks[4].indexOf("WorkSchedule.onEmpAddInstruction('2706')") !== -1,
            'Task 405: «+ Инструктаж…» — в шапке блока инструктажей');
        assertEqual((blocks.join('').match(/class="ws-wbtn/g) || []).length, 6,
            'всего 6 компактных кнопок (2+1+1+1+1)');
    });

    test('зебра: вторые строки блоков — ws-row-alt', () => {
        const h = cardHost(true);
        const blocks = h._renderWorkerCard('2706', true, true);
        // b1: 4 поля (Режим/Должность/Группа допуска/Дата приёма —
        // Task 402 добавил «Группу допуска» после «Должности»;
        // Комментарий пуст — скрыт)
        assertEqual((blocks[0].match(/class="ws-emp-field/g) || []).length, 4,
            'поля профиля: 4 строки (Task 402: + Группа допуска)');
        assertEqual((blocks[0].match(/ws-emp-field ws-row-alt/g) || []).length, 2,
            'чередование: Должность (2-я) и Дата приёма (4-я) — alt');
        assertTrue(blocks[0].indexOf('"ws-emp-k">Режим работы') !== -1 &&
                   blocks[0].indexOf('ws-emp-field ws-row-alt"><span class="ws-emp-k">Должность') !== -1,
            'именно ВТОРАЯ строка — Должность');
        assertTrue(blocks[0].indexOf('"ws-emp-k">Группа допуска') !== -1 &&
                   blocks[0].indexOf('ws-emp-v">IV') !== -1,
            'Task 402: строка «Группа допуска» со значением IV');
        assertTrue(blocks[0].indexOf('"ws-emp-k">Должность') <
                   blocks[0].indexOf('"ws-emp-k">Группа допуска') &&
                   blocks[0].indexOf('"ws-emp-k">Группа допуска') <
                   blocks[0].indexOf('"ws-emp-k">Дата приёма'),
            'Task 402: Группа допуска — ПОСЛЕ Должности (до Даты приёма)');
        // b2: 3 периода → 1 alt; Task 433: строки отпусков несут
        // класс ws-emp-vac (плотный слот «Часть N»)
        assertEqual((blocks[1].match(/ws-emp-field ws-emp-vac/g) || []).length, 3,
            'отпуска: все строки — ws-emp-vac (Task 433)');
        assertEqual((blocks[1].match(/ws-emp-field ws-emp-vac ws-row-alt/g) || []).length, 1,
            'отпуска: вторая строка — alt');
        // Task 405: b3 — только обучение (1 запись) → 0 alt
        assertEqual((blocks[2].match(/ws-popup-event ws-row-alt/g) || []).length, 0,
            'мероприятия: одна запись — без зебры');
        assertTrue(blocks[2].indexOf('Пожарная безопасность') !== -1,
            'b3: обучение — в мероприятиях (Task 405)');
        // Task 405: b5 — 3 инструктажа → 1 alt (вторая строка)
        assertEqual((blocks[4].match(/ws-popup-event ws-row-alt/g) || []).length, 1,
            'инструктажи: вторая строка — alt');
        assertTrue(blocks[4].indexOf('Охрана труда') !== -1 &&
                   blocks[4].indexOf('Первая помощь') !== -1 &&
                   blocks[4].indexOf('Экзамен') !== -1,
            'b5: инструктажи и проверка знаний (с пробелом!) — в блоке 5');
        // b4: 3 СИЗ → 1 alt
        assertEqual((blocks[3].match(/ws-ppe-item ws-row-alt/g) || []).length, 1,
            'СИЗ: вторая запись — alt');
    });

    test('зритель (withEdit=false): шапки и зебра БЕЗ кнопок', () => {
        const h = cardHost(false);
        const blocks = h._renderWorkerCard('2706', false, true);
        assertEqual(blocks.length, 5, 'блоки рендерятся (Task 405: 5)');
        blocks.forEach(function(b) {
            assertTrue(b.indexOf('ws-wbtn') === -1, 'кнопок действий НЕТ у зрителя');
        });
        assertTrue(blocks[0].indexOf('ws-whead') !== -1 &&
                   blocks[4].indexOf('ws-popup-event ws-row-alt') !== -1,
            'шапки-оглавления и ЗЕБРА — видны всем (зебра теперь в b5)');
    });

    test('легаси-вызов (без asBlocks): прежние строки внизу, БЕЗ whead/зебры', () => {
        const h = cardHost(true);
        const html = h._renderWorkerCard('2706', true);
        // Task 403: «+ СИЗ…» из попапа убран — действий четыре
        assertTrue(html.indexOf('ws-popup-row ws-popup-more ws-emp-editdata') !== -1 &&
                   html.indexOf('ws-popup-row ws-popup-more ws-emp-dismiss') !== -1 &&
                   html.indexOf('ws-popup-row ws-popup-more ws-emp-addvac') !== -1 &&
                   html.indexOf('ws-popup-row ws-popup-more ws-emp-addtr') !== -1 &&
                   html.indexOf('ws-popup-row ws-popup-more ws-emp-addins') !== -1,
            'пять строк-действий — прежний вид (+ «+ Инструктаж…», Task 405)');
        assertTrue(html.indexOf('ws-emp-addppe') === -1,
            '«+ СИЗ…» в попапе НЕТ (Task 403 — СИЗ только на странице)');
        assertTrue(html.indexOf('ws-whead') === -1 &&
                   html.indexOf('ws-wbtn') === -1 &&
                   html.indexOf('ws-row-alt') === -1,
            'без asBlocks — НЕТ шапок-полос/кнопок/зебры');
        assertTrue(html.indexOf('Правка данных…</div>') !== -1,
            'легаси-текст строки (div, не button)');
    });

    test('попап шахматки (withEdit=false, без asBlocks) — прежний вид', () => {
        const h = cardHost(false);
        const html = h._renderWorkerCard('2706', false);
        assertTrue(html.indexOf('<div class="ws-popup-title">Галкин Д. Н.') !== -1,
            'шапка ФИО — прежний .ws-popup-title');
        assertTrue(html.indexOf('<div class="ws-popup-sec">Отпуска · 2026') !== -1,
            'секции отпусков/мероприятий — прежние .ws-popup-sec');
        assertTrue(
            html.indexOf('Повторные инструктажи и периодическая проверка знаний · 2026') !== -1,
            'Task 405: секция инструктажей — в попапе (после мероприятий)');
        // Task 403 (заявка): данные СИЗ из попапа УБРАНЫ
        assertTrue(html.indexOf('СИЗ') === -1,
            'секции СИЗ в попапе НЕТ (только на странице «Работники»)');
        assertTrue(html.indexOf('ws-whead') === -1 && html.indexOf('ws-row-alt') === -1,
            'попап — БЕЗ зебры и шапок-полос (компактная типографика)');
    });
});

// ============================================================
// 4. VM — страница «Работники»: панели с шапками/кнопками/зеброй
// ============================================================
function pageHost() {
    const els = { wsWorkersBody: mkEl() };
    const nav = [];
    const EMPLOYEES = [
        { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
          'смена': '', 'должность': 'Мастер КИПиА', 'комментарий': '',
          'группа_допуска': 'IV', 'дата_приёма': '2024-03-15' },
    ];
    const host = new Function('document', 'navigateTo', 'return ({' +
        methodText(INDEX_SRC, '_renderWorkersPage') + ',\n' +
        methodText(INDEX_SRC, '_renderWorkersGeneral') + ',\n' +
        methodText(INDEX_SRC, 'selectWorkersTab') + ',\n' +
        methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
        methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
        methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
        methodText(INDEX_SRC, '_lastExam1000Date') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
        methodText(INDEX_SRC, '_renderWorkerCardPanels') + ',\n' +
        methodText(INDEX_SRC, '_isInstrType') + ',\n' +
        '_workersTab: "general",' +
        '_canEdit: true, _viewLevel: "edit",' +
        '_isMasterKipia: function(e) { return String(e["должность"] || "").indexOf("Мастер") !== -1; },' +
        '_year: 2026, _month: 8,' +
        '_EMPLOYEES: ' + JSON.stringify(EMPLOYEES) + ',' +
        '_VACATIONS: [],' +
        '_TRAININGS: [],' +
        '_PPE: ' + JSON.stringify([
            { id: 1, 'таб_номер': '2706', наименование: 'Каска защитная',
              дата_выдачи: '2026-09-17', срок_годности: '1 год',
              дата_окончания: '2027-09-17', примечание: '' },
            { id: 2, 'таб_номер': '2706', наименование: 'Очки закрытые',
              дата_выдачи: '', срок_годности: 'До износа',
              дата_окончания: 'До износа', примечание: '' },
        ]) + ',' +
        '_fmtDateRu: function(d) { d = String(d);' +
        '  var p = d.split("-"); return p.length === 3 ?' +
        '  p[2] + "." + p[1] + "." + p[0] : d; },' +
        '_esc: function(s) { return String(s); },' +
        '_escAttr: function(s) { return String(s); },' +
        '_trainingCodeOf: function(t) { return "И"; },' +
        '_statusMeta: function(c) { return {}; },' +
        '_vacDaysInYear: function(v, y) { return 0; },' +
        '_vacNetDaysInYear: function(v, y) { return 0; },' +
        '_plural: function(n, f) { return f[2]; }' +
        '});')(mockDoc(els), function(p) { nav.push(p); });
    return { host: host, els: els, nav: nav };
}

describe('Task 396 — VM: страница «Работники»', () => {

    test('вкладка работника: 4 шапки .ws-whead + 5 кнопок + зебра', () => {
        const t = pageHost();
        t.host._renderWorkersPage();
        t.host.selectWorkersTab('2706');
        const body = t.els.wsWorkersBody.innerHTML;
        assertEqual((body.match(/<div class="ws-whead">/g) || []).length, 5,
            'пять блоков-окон — каждый с шапкой-полосой (Task 405)');
        assertEqual((body.match(/class="ws-wbtn/g) || []).length, 6,
            '6 компактных кнопок (2 в профиле + 4 «+ …»)');
        assertTrue(body.indexOf('ws-wbtn ws-emp-editdata') !== -1 &&
                   body.indexOf('ws-wbtn-danger') !== -1,
            'кнопки правки/увольнения — в шапке профиля');
        // 2 СИЗ → вторая строка с зеброй
        assertTrue(body.indexOf('ws-ppe-item ws-row-alt') !== -1,
            'зебра на странице (вторая запись СИЗ)');
    });
});

describe('Task 396 — SW и отсутствие регрессов', () => {

    test('SW: v624 — ассерт присутствия, v625 — guard отсутствия', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v742') !== -1,
            'SW kipia-test-v742');
        assertTrue(SW_SRC.indexOf('kipia-test-v743') === -1,
            'v625 ещё не существует (guard)');
    });

    test('попап шахматки: _renderEmpPopup — прежний вызов без asBlocks', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderEmpPopup'));
        assertTrue(fn.indexOf('this._renderWorkerCard(tabNo, false)') !== -1,
            'попап — без asBlocks (компактный вид, Task 393)');
    });
});
