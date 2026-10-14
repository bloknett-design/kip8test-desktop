// ============================================================
// Task 390 — заявка (5 частей, доработка «Общей» вкладки
// «Работники»):
//   1) убрать «Сводка по всем работникам: сменных — N, дневных — N.
//      Полная карточка каждого работника — на его вкладке.»;
//   2) «Работников по штату 14: 2 мастера; 7 дневных; 5 сменных.»
//      (константа) и ниже строчкой «Работников на текущий момент:
//      (N) мастера; (N) дневных; (N) сменных.» — АВТОПОДСЧЁТ ПО
//      КАТЕГОРИЯМ (мастера — должность «Мастер КИПиА», дневные/
//      сменные — по типу БЕЗ мастеров);
//   3) ВЫДЕЛЕННЫЙ фон шапки с надписями и кнопкой «Добавить
//      работника»;
//   4) ярлыки ПРИМЫКАЮТ к окну вкладок (padding-right убран);
//   5) тёмная тема: ярлыки светлее и тёплым тоном ближе к светлой
//      теме (#4B4E46/#575A50/#63665B) — не сливаются с фоном
//      страницы #1a2233.
//
// Заявка: «В разделе Табель учёта рабочего времени / Работники, на
// общей вкладке убери "Сводка по всем работникам: сменных — 5,
// дневных — 7. Полная карточка каждого работника — на его вкладке.",
// переделай "На текущий момент: 12 работников (автоматический
// подсчёт). По штату: 14, из которых 2 мастера, 5 сменных и 7
// дневных." на "Работников по штату 14: 2 мастера; 7 дневных;
// 5 сменных." и ниже строчкой "Работников на текущий момент: (N)
// мастера; (N) дневных; (N) сменных.", и выдели фон шапки с этими
// надписями и кнопкой добавить работника. Ярлыки должны примыкать
// к окну вкладок. В тёмной теме сделать цвета ярлыков с вкладками
// более светлее и другими по цвету ближе к светлой теме, чтобы они
// не сливались зрительно с общим фоном страницы.»
// ============================================================

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
    };
}

function pluralRu(n, forms) {
    return forms[(n % 10 === 1 && n % 100 !== 11) ? 0 :
        (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2];
}

// 6 работников: 2 МАСТЕРА (должность «Мастер КИПиА» — типы разные,
// чтобы доказать ИСКЛЮЧЕНИЕ мастеров из сменных/дневных), 2 дневных,
// 2 сменных → шапка: «2 мастера; 2 дневных; 2 сменных»
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
        // мастера: тип «сменный»/«дневной» — но считаются МАСТЕРАМИ,
        // в сменные/дневные НЕ попадают (категории не пересекаются)
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

// ============================================================
// 1-2. SRC — строки шапки: штат (константа) + текущий (авто)
// ============================================================
describe('Task 390 — SRC: шапка «Общей» вкладки — строки', () => {

    test('«Работников по штату 14 (2 мастера, 7 дневных, 5 сменных).» (Task 391)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        assertTrue(fn.indexOf('Работников по штату 14 ') !== -1,
            'формулировка штата без двоеточия (заявка Task 391)');
        assertTrue(fn.indexOf('(2 мастера, 7 дневных, 5 сменных).') !== -1,
            'структура В СКОБКАХ: 2 мастера, 7 дневных, 5 сменных');
        assertTrue(fn.indexOf('Работников по штату 14: ') === -1,
            'старое «14:» с двоеточием удалено (Task 391)');
        assertTrue(fn.indexOf('2 мастера; 7 дневных') === -1,
            'старые точки с запятой удалены (Task 391)');
        assertTrue(fn.indexOf('ws-wgen-staff') !== -1, 'класс строки штата');
    });

    test('«Работников на текущий момент (N) (…)» — АВТОПОДСЧЁТ ПО КАТЕГОРИЯМ (Task 391)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        assertTrue(fn.indexOf('Работников на текущий момент ') !== -1,
            'формулировка без двоеточия (заявка Task 391)');
        assertTrue(fn.indexOf('var totalN = masterN + dayN + shiftN;') !== -1,
            'ведущее число в скобках — СУММА категорий (Task 391)');
        assertTrue(fn.indexOf("totalN + ' ('") !== -1,
            'Task 392: ведущее число БЕЗ СКОБОК, разбивка — в скобках');
        assertTrue(fn.indexOf('Работников на текущий момент: ') === -1,
            'старое «момент:» с двоеточием удалено (Task 391)');
        assertTrue(fn.indexOf('masterN') !== -1 &&
                   fn.indexOf('dayN') !== -1 && fn.indexOf('shiftN') !== -1,
            'три счётчика: мастера/дневные/сменные');
        assertTrue(fn.indexOf('this._isMasterKipia(cEmp)') !== -1,
            'мастера — по должности «Мастер КИПиА» (_isMasterKipia)');
        assertTrue(fn.indexOf("['мастер', 'мастера', 'мастеров']") !== -1 &&
                   fn.indexOf("['дневной', 'дневных', 'дневных']") !== -1 &&
                   fn.indexOf("['сменный', 'сменных', 'сменных']") !== -1,
            'склонения категорий через _plural');
    });

    test('категории НЕ пересекаются: мастер исключается из типов', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        const iM = fn.indexOf('this._isMasterKipia(cEmp)');
        const iS = fn.indexOf("cTip === 'сменный'");
        const iD = fn.indexOf("cTip === 'дневной'");
        assertTrue(iM !== -1 && iS !== -1 && iD !== -1,
            'все три ветки счётчика живы');
        assertTrue(iM < iS && iM < iD,
            'мастер проверяется ПЕРВЫМ — else if у типов (мастер не попадает в сменные/дневные)');
    });

    test('порядок строк: штат ПЕРВЫЙ, текущий момент — НИЖЕ строчкой', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        const iStaff = fn.indexOf('ws-wgen-staff">Работников по штату');
        const iCur = fn.indexOf('ws-workers-count">Работников на текущий момент');
        assertTrue(iStaff !== -1 && iCur !== -1, 'обе строки живы');
        assertTrue(iStaff < iCur, 'штат — выше, текущий — ниже (заявка)');
    });

    test('старые формулировки и сноска УДАЛЕНЫ', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        assertTrue(fn.indexOf('На текущий момент:') === -1,
            'старое «На текущий момент:» удалено');
        assertTrue(fn.indexOf('(автоматический подсчёт)') === -1,
            'пометка «(автоматический подсчёт)» удалена');
        assertTrue(fn.indexOf('По штату: 14, из которых') === -1,
            'старое «По штату: 14, из которых…» удалено');
        assertTrue(fn.indexOf('Сводка по всем работникам') === -1,
            'сноска «Сводка по всем работникам…» удалена из метода');
        assertTrue(fn.indexOf('Полная карточка каждого работника') === -1,
            'хвост сноски удалён');
        assertTrue(INDEX_SRC.indexOf('ws-wgen-note') === -1,
            'класс сноски исчез из index.html целиком (CSS+JS)');
    });
});

// ============================================================
// 3-5. SRC — CSS: выделенная шапка, примыкание, светлые ярлыки
// ============================================================
describe('Task 390 — SRC: CSS — шапка/примыкание/цвета ярлыков', () => {

    test('.ws-wgen-head: ВЫДЕЛЕННЫЙ фон шапки (тёмная)', () => {
        const b = ruleBlock('.ws-wgen-head {');
        assertTrue(b !== null, 'правило живо');
        assertTrue(b.indexOf('background: #1E2B42;') !== -1,
            'шапка выделена сплошным #1E2B42 (светлее панели окна)');
        assertTrue(b.indexOf('border: 1px solid') !== -1 &&
                   b.indexOf('border-radius: 8px;') !== -1,
            'рамка + радиус — шапка как отдельная плашка');
        assertTrue(b.indexOf('padding: 10px 12px;') !== -1,
            'внутренние отступы плашки');
    });

    test('.ws-wgen-head: ВЫДЕЛЕННЫЙ фон (светлая)', () => {
        const m = INDEX_SRC.match(/\[data-theme="light"\] \.ws-wgen-head \{[^}]*\}/);
        assertTrue(m !== null, 'правило светлой темы есть');
        assertTrue(m[0].indexOf('background: #E4E0D3;') !== -1,
            'светлая: тёплый #E4E0D3 — темнее панели окна');
    });

    test('.ws-wtabs: зазор до окна вкладок — gap раскладки (Task 428)', () => {
        const i = INDEX_SRC.indexOf('.ws-wtabs {');
        assertTrue(i !== -1, 'правило живо');
        const chunk = INDEX_SRC.slice(i, INDEX_SRC.indexOf('\n    }', i) + 7);
        assertTrue(chunk.indexOf('padding-right: 10px') === -1,
            'щель справа (padding-right: 10px) убрана');
        assertTrue(chunk.indexOf('padding-right') === -1,
            'в базовом правиле .ws-wtabs вообще нет padding-right');
        const a = ruleBlock('.ws-wtab.active {');
        // Task 428: пристыковка снята — ярлыки закруглены со всех
        // сторон, зазор до окна — gap 5px раскладки .ws-workers-layout
        assertTrue(a !== null && a.indexOf('margin-right: -1px') === -1,
            'Task 428: активный ярлык НЕ пристыкован (радиус справа)');
        const l = ruleBlock('.ws-workers-layout {');
        assertTrue(l !== null && l.indexOf('gap: 5px;') !== -1,
            'Task 428: зазор ярлыки→окно = 5px');
    });

    test('.ws-wtab: тёмная — фон КАК У БЛОКОВ КАРТ (Task 431)', () => {
        const b = ruleBlock('.ws-wtab {');
        assertTrue(b !== null, 'правило живо');
        // Task 431 (заявка: «в тёмной теме фон ярлыков работников
        // сделай как фон в блоках карт работников»): тёплый тон
        // Task 390 (#4B4E46) заменён фоном блоков карт #243349
        assertTrue(b.indexOf('background: #243349;') !== -1,
            'неактивный — фон блоков карт #243349 (.ws-wcard, Task 395)');
        assertTrue(b.indexOf('color: rgba(255, 255, 255, 0.78);') !== -1,
            'текст ярче под светлый фон');
        assertFalse(b.indexOf('var(--bg-primary') !== -1,
            'больше НЕ фон страницы — не сливается с общим фоном');
        assertFalse(b.indexOf('#4B4E46') !== -1,
            'тёплый тон Task 390 снят');
    });

    test('тёмная: hover и active — светлее неактивного', () => {
        const h = ruleBlock('.ws-wtab:hover {');
        assertTrue(h !== null && h.indexOf('background: #2A3A53;') !== -1,
            'hover — шаг светлее #2A3A53 (семейство блоков карт)');
        const a = ruleBlock('.ws-wtab.active {');
        assertTrue(a !== null && a.indexOf('background: #31445F;') !== -1,
            'активный — самый светлый #31445F (как активные вкладки браузеров)');
        assertFalse(a.indexOf('var(--bg-tertiary') !== -1,
            'активный больше НЕ тёмный цвет окна');
    });

    test('светлая тема ярлыков — БЕЗ ИЗМЕНЕНИЙ', () => {
        const b = INDEX_SRC.match(/\[data-theme="light"\] \.ws-wtab \{[^}]*\}/);
        assertTrue(b !== null && b[0].indexOf('background: #E4E0D3;') !== -1,
            'светлая: неактивный #E4E0D3');
        const h = INDEX_SRC.match(/\[data-theme="light"\] \.ws-wtab:hover \{[^}]*\}/);
        assertTrue(h !== null && h[0].indexOf('background: #DBD6C8') !== -1,
            'светлая: hover #DBD6C8');
        const a = INDEX_SRC.match(/\[data-theme="light"\] \.ws-wtab\.active \{[^}]*\}/);
        assertTrue(a !== null && a[0].indexOf('background: var(--bg-tertiary') !== -1,
            'светлая: активный — как окно вкладки');
    });

    test('SW: kipia-test-v737', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v737'") !== -1,
            'SWVersion bumped');
        assertTrue(SW_SRC.indexOf('kipia-test-v738') === -1,
            'двойного бампа не было');
    });
});

// ============================================================
// VM — функциональные проверки
// ============================================================
describe('Task 390 — VM: «Общая» вкладка — категории', () => {

    test('VM: «2 мастера; 2 дневных; 2 сменных» — мастера исключены из типов', () => {
        const t = workersHost(true);
        t.host._renderWorkersPage();
        const body = t.els.wsWorkersBody.innerHTML;
        assertTrue(body.indexOf('Работников на текущий момент 6 (2 мастера, 2 дневных, 2 сменных).') !== -1,
            '2 мастера + 2 дневных + 2 сменных, итог 6 в скобках (Task 391)');
    });

    test('VM: строка штата — константа', () => {
        const t = workersHost(true);
        t.host._renderWorkersPage();
        const body = t.els.wsWorkersBody.innerHTML;
        assertTrue(body.indexOf('Работников по штату 14 (2 мастера, 7 дневных, 5 сменных).') !== -1,
            '«Работников по штату 14 (2 мастера, 7 дневных, 5 сменных).» (Task 391)');
    });

    test('VM: порядок — штат ПЕРВОЙ строчкой, текущий ниже', () => {
        const t = workersHost(true);
        const html = t.host._renderWorkersGeneral(t.host._EMPLOYEES);
        const iStaff = html.indexOf('Работников по штату 14');
        const iCur = html.indexOf('Работников на текущий момент');
        assertTrue(iStaff !== -1 && iCur !== -1, 'обе строки есть');
        assertTrue(iStaff < iCur, 'штат выше, текущий ниже строчкой');
    });

    test('VM: сноска «Сводка по всем работникам…» НЕ рендерится', () => {
        const t = workersHost(true);
        const html = t.host._renderWorkersGeneral(t.host._EMPLOYEES);
        assertTrue(html.indexOf('Сводка по всем работникам') === -1,
            'сноски нет (заявка)');
        assertTrue(html.indexOf('ws-wgen-note') === -1,
            'класс сноски не рендерится');
        assertTrue(html.indexOf('Полная карточка каждого работника') === -1,
            'хвост сноски не рендерится');
    });

    test('VM: шапка — структура (выделенная шапка + кнопка)', () => {
        const t = workersHost(true);
        t.host._renderWorkersPage();
        const body = t.els.wsWorkersBody.innerHTML;
        assertTrue(body.indexOf('ws-wgen-head') !== -1 &&
                   body.indexOf('ws-wgen-info') !== -1,
            'шапка сводки жива');
        assertTrue(body.indexOf('id="wsWorkersAddBtn"') !== -1,
            'кнопка «Добавить работника» в шапке (рядом с надписями)');
        const headIdx = body.indexOf('ws-wgen-head');
        const btnIdx = body.indexOf('id="wsWorkersAddBtn"');
        const staffIdx = body.indexOf('Работников по штату');
        assertTrue(headIdx < staffIdx && headIdx < btnIdx,
            'надписи и кнопка — ВНУТРИ выделенной шапки');
    });

    test('VM: пустой список — нули с правильными склонениями', () => {
        const t = workersHost(true, []);
        const html = t.host._renderWorkersGeneral([]);
        assertTrue(html.indexOf('Работников на текущий момент 0 (0 мастеров, 0 дневных, 0 сменных).') !== -1,
            '«(0) (0 мастеров, 0 дневных, 0 сменных)» (Task 391)');
    });

    test('VM: склонения 1 — «1 мастер; 1 дневной; 1 сменный»', () => {
        const t = workersHost(true, [
            { 'таб_номер': '201', 'ФИО': 'Одинцов О. О.', 'тип': 'сменный',
              'смена': 1, 'должность': 'Слесарь КИПиА', 'комментарий': '',
              'дата_приёма': '2024-01-01' },
            { 'таб_номер': '202', 'ФИО': 'Единов Е. Е.', 'тип': 'дневной',
              'смена': '', 'должность': 'Инженер', 'комментарий': '',
              'дата_приёма': '2024-02-01' },
            { 'таб_номер': '203', 'ФИО': 'Мастеров М. М.', 'тип': 'дневной',
              'смена': '', 'должность': 'Мастер КИПиА', 'комментарий': '',
              'дата_приёма': '2024-03-01' },
        ]);
        const html = t.host._renderWorkersGeneral(t.host._EMPLOYEES);
        assertTrue(html.indexOf('Работников на текущий момент 3 (1 мастер, 1 дневной, 1 сменный).') !== -1,
            'единственное число всех категорий; итог 3 в скобках (Task 391)');
    });

    test('VM: _isMasterKipia — толерантные варианты должности', () => {
        const t = workersHost(true, [
            { 'таб_номер': '301', 'ФИО': 'Аа', 'тип': 'дневной', 'смена': '',
              'должность': 'мастер кипиа', 'комментарий': '', 'дата_приёма': '' },
            { 'таб_номер': '302', 'ФИО': 'Бб', 'тип': 'сменный', 'смена': 1,
              'должность': '  Мастер КИПиА  ', 'комментарий': '', 'дата_приёма': '' },
            { 'таб_номер': '303', 'ФИО': 'Вв', 'тип': 'сменный', 'смена': 2,
              'должность': 'Слесарь КИПиА', 'комментарий': '', 'дата_приёма': '' },
        ]);
        const html = t.host._renderWorkersGeneral(t.host._EMPLOYEES);
        assertTrue(html.indexOf('Работников на текущий момент 3 (2 мастера, 0 дневных, 1 сменный).') !== -1,
            'нижний регистр/пробелы — мастера; «Слесарь КИПиА» — сменный; итог 3 (Task 391)');
    });

    test('VM: зритель — кнопки НЕТ, строки шапки есть', () => {
        const t = workersHost(false);
        t.host._renderWorkersPage();
        const body = t.els.wsWorkersBody.innerHTML;
        assertTrue(body.indexOf('ws-workers-add') === -1,
            'кнопки у зрителя нет (_canEdit-гейт)');
        assertTrue(body.indexOf('Работников по штату 14') !== -1 &&
                   body.indexOf('Работников на текущий момент') !== -1,
            'обе строки доступны всем');
    });

    test('VM: сводная таблица жива (регресс 388)', () => {
        const t = workersHost(true);
        const html = t.host._renderWorkersGeneral(t.host._EMPLOYEES);
        assertTrue(html.indexOf('ws-wgen-table') !== -1, 'таблица сводки');
        assertTrue(html.indexOf('Таб. №') !== -1 && html.indexOf('ФИО') !== -1,
            'колонки живы');
        ['Иванов И. И.', 'Кузнецов К. К.', 'Васильев В. В.'].forEach(n =>
            assertTrue(html.indexOf(n) !== -1, 'в сводке есть «' + n + '»'));
    });
});
