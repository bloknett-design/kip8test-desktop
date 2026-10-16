// ============================================================
// Task 391 — заявка (3 части, доработка «Общей» вкладки
// «Работники»):
//   1) ПЕРЕДЕЛКА строк шапки на формат В СКОБКАХ:
//      «Работников по штату 14 (2 мастера, 7 дневных, 5 сменных).»
//      и ниже строчкой «Работников на текущий момент (N) ((N)
//      мастера, (N) дневных, (N) сменных).» — N = автоподсчёт
//      по категориям; ведущее число в скобках — СУММА категорий;
//   2) шрифт строк — НЕМНОГО БОЛЬШЕ и ЯРЧЕ (14px / 600 / 0.95
//      вместо 12px / 0.75);
//   3) кнопка «Добавить работника» — В СТИЛЕ САЙТА: акцентная
//      var(--accent-blue) — тёмная тема СИНИЙ #4a8fc7, светлая
//      ОРАНЖЕВЫЙ #C6613F, белый текст.
//
// Заявка: «Переделай "Работников по штату 14: 2 мастера; 7 дневных;
// 5 сменных. Работников на текущий момент: 2 мастера; 5 дневных;
// 5 сменных." на "Работников по штату 14 (2 мастера, 7 дневных,
// 5 сменных). Работников на текущий момент (N) ((N) мастера, (N)
// дневных, (N) сменных).", и шрифт сделай немного больше и ярче,
// кнопку "Добавить работника" в стиле сайта (оранжевый-светлая
// тема, синий-тёмная тема).»
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

// 6 работников: 2 МАСТЕРА (должность), 2 дневных, 2 сменных →
// строка: «Работников на текущий момент (6) (2 мастера, 2 дневных,
// 2 сменных).»
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

// ============================================================
// 1. SRC — формулировки строк шапки (формат в скобках)
// ============================================================
describe('Task 391 — SRC: строки шапки — формат в скобках', () => {

    test('«Работников по штату 14 (2 мастера, 7 дневных, 5 сменных).»', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        assertTrue(fn.indexOf('Работников по штату 14 ') !== -1,
            'штат без двоеточия (заявка Task 391)');
        assertTrue(fn.indexOf('(2 мастера, 7 дневных, 5 сменных).') !== -1,
            'скобки + запятые: 2 мастера, 7 дневных, 5 сменных');
        assertTrue(fn.indexOf('ws-wgen-staff') !== -1, 'класс строки штата жив');
    });

    test('«Работников на текущий момент (N) ((N) мастера, (N) дневных, (N) сменных).»', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        assertTrue(fn.indexOf('Работников на текущий момент ') !== -1,
            'текущий момент без двоеточия (заявка Task 391)');
        assertTrue(fn.indexOf('var totalN = masterN + dayN + shiftN;') !== -1,
            'ведущее (N) — СУММА категорий');
        assertTrue(fn.indexOf("totalN + ' ('") !== -1,
            'Task 392: ведущее число БЕЗ скобок, разбивка — в скобках');
        assertTrue(fn.indexOf('masterN + \' \' + this._plural(masterN') !== -1 &&
                   fn.indexOf('dayN + \' \' + this._plural(dayN') !== -1 &&
                   fn.indexOf('shiftN + \' \' + this._plural(shiftN') !== -1,
            'автоподсчёт категорий с склонениями (_plural) жив (Task 390)');
        assertTrue(fn.indexOf("').</span>'") !== -1,
            'строка завершается скобкой и точкой');
    });

    test('СТАРЫЕ формулировки удалены', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        assertTrue(fn.indexOf('Работников по штату 14: ') === -1,
            'двоеточие после «14» удалено');
        assertTrue(fn.indexOf('Работников на текущий момент: ') === -1,
            'двоеточие после «момент» удалено');
        assertTrue(fn.indexOf('2 мастера; 7 дневных; 5 сменных.') === -1,
            'точки с запятой в разбивке удалены');
        const src = INDEX_SRC;
        assertTrue(src.indexOf('2 мастера; 7 дневных; 5 сменных.') === -1,
            'старая структура отсутствует в index.html целиком');
    });
});

// ============================================================
// 2. SRC — CSS: шрифт крупнее и ярче; акцентная кнопка
// ============================================================
describe('Task 391 — SRC: CSS — шрифт строк и кнопка в стиле сайта', () => {

    test('.ws-wgen-staff — 14px / 600 / 0.95 (крупнее и ярче)', () => {
        const b = ruleBlock('.ws-wgen-staff {');
        assertTrue(b !== null, 'правило живо');
        assertTrue(b.indexOf('font-size: 14px;') !== -1,
            'было 12px → стало 14px (немного больше)');
        assertTrue(b.indexOf('font-weight: 600;') !== -1,
            'полужирный — ярче');
        assertTrue(b.indexOf('opacity: 0.95;') !== -1,
            'было 0.75 → стало 0.95 (ярче)');
        assertFalse(b.indexOf('font-size: 12px') !== -1,
            'старый мелкий кегль удалён');
    });

    test('.ws-workers-count — 14px / 600 / 0.95 (крупнее и ярче)', () => {
        const b = ruleBlock('.ws-workers-count {');
        assertTrue(b !== null, 'правило живо');
        assertTrue(b.indexOf('font-size: 14px;') !== -1,
            'было 12px → стало 14px (немного больше)');
        assertTrue(b.indexOf('font-weight: 600;') !== -1,
            'полужирный — ярче');
        assertTrue(b.indexOf('opacity: 0.95;') !== -1,
            'было 0.75 → стало 0.95 (ярче)');
        assertTrue(b.indexOf('margin: 0;') !== -1,
            'инвариант Task 389: отступы у контейнера (шапка сводки)');
    });

    test('.ws-workers-add — акцент var(--accent-blue), белый текст', () => {
        const b = ruleBlock('.ws-workers-add {');
        assertTrue(b !== null, 'правило живо');
        assertTrue(b.indexOf('background: var(--accent-blue, #4a8fc7);') !== -1,
            'фон — акцент сайта var(--accent-blue) с фолбэком #4a8fc7');
        assertTrue(b.indexOf('color: #fff;') !== -1,
            'белый текст на акцентном фоне');
        assertTrue(b.indexOf('border: 1px solid transparent;') !== -1,
            'нейтральная рамка заменена прозрачной');
        assertTrue(b.indexOf('height: 34px;') !== -1,
            'инвариант Task 386: высота 34px');
        assertFalse(b.indexOf('rgba(255,255,255,0.06)') !== -1,
            'нейтральный полупрозрачный фон удалён');
        assertFalse(b.indexOf('color: inherit;') !== -1,
            'наследуемый цвет текста удалён');
    });

    test('подсветка кнопки — фильтром яркости, светлых оверрайдов НЕТ', () => {
        const h = ruleBlock('.ws-workers-add:hover {');
        assertTrue(h !== null && h.indexOf('filter: brightness(1.12);') !== -1,
            'hover — фильтр яркости (работает поверх акцентного фона)');
        const a = ruleBlock('.ws-workers-add:active {');
        assertTrue(a !== null && a.indexOf('filter: brightness(0.9);') !== -1,
            'active — фильтр яркости');
        assertFalse(INDEX_SRC.indexOf('[data-theme="light"] .ws-workers-add {') !== -1,
            'светлый оверрайд кнопки удалён — тему держит var(--accent-blue)');
    });

    test('стиль сайта: тёмная — СИНИЙ, светлая — ОРАНЖЕВЫЙ', () => {
        // :root (тёмная тема по умолчанию) — синий акцент
        const root = INDEX_SRC.match(/:root \{[^}]*\}/);
        assertTrue(root !== null && root[0].indexOf('--accent-blue: #4a8fc7;') !== -1,
            'тёмная тема: --accent-blue #4a8fc7 (синий)');
        // [data-theme="light"] — оранжевый акцент
        const light = INDEX_SRC.match(/\[data-theme="light"\] \{[^}]*\}/);
        assertTrue(light !== null && light[0].indexOf('--accent-blue: #C6613F;') !== -1,
            'светлая тема: --accent-blue #C6613F (оранжевый)');
        // кнопка пьёт ИМЕННО переменную — цвет следует за темой
        const b = ruleBlock('.ws-workers-add {');
        assertTrue(b !== null && b.indexOf('var(--accent-blue, #4a8fc7)') !== -1,
            'кнопка следует теме через var(--accent-blue)');
    });

    test('SW: kipia-test-v749', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v749'") !== -1,
            'SWVersion bumped');
        assertTrue(SW_SRC.indexOf('kipia-test-v750') === -1,
            'двойного бампа не было');
    });
});

// ============================================================
// 3. VM — функциональные проверки формата строк
// ============================================================
describe('Task 391 — VM: строки шапки — формат и автоподсчёт', () => {

    test('VM: «(6) (2 мастера, 2 дневных, 2 сменных).» — итог = сумма', () => {
        const t = workersHost(true);
        t.host._renderWorkersPage();
        const body = t.els.wsWorkersBody.innerHTML;
        assertTrue(body.indexOf('Работников на текущий момент 6 (2 мастера, 2 дневных, 2 сменных).') !== -1,
            'ведущее 6 = 2+2+2, разбивка в скобках через запятую');
    });

    test('VM: строка штата — константа в новом формате', () => {
        const t = workersHost(true);
        const html = t.host._renderWorkersGeneral(t.host._EMPLOYEES);
        assertTrue(html.indexOf('Работников по штату 14 (2 мастера, 7 дневных, 5 сменных).') !== -1,
            '«Работников по штату 14 (2 мастера, 7 дневных, 5 сменных).»');
    });

    test('VM: арифметика строки — ведущее число = сумма разбивки', () => {
        const t = workersHost(true, [
            { 'таб_номер': '201', 'ФИО': 'Аа', 'тип': 'сменный', 'смена': 1,
              'должность': 'Слесарь КИПиА', 'комментарий': '', 'дата_приёма': '' },
            { 'таб_номер': '202', 'ФИО': 'Бб', 'тип': 'дневной', 'смена': '',
              'должность': 'Инженер', 'комментарий': '', 'дата_приёма': '' },
            { 'таб_номер': '203', 'ФИО': 'Вв', 'тип': 'дневной', 'смена': '',
              'должность': 'Мастер КИПиА', 'комментарий': '', 'дата_приёма': '' },
            { 'таб_номер': '204', 'ФИО': 'Гг', 'тип': 'сменный', 'смена': 2,
              'должность': 'Электрик', 'комментарий': '', 'дата_приёма': '' },
        ]);
        const html = t.host._renderWorkersGeneral(t.host._EMPLOYEES);
        // Вв — «Мастер КИПиА» по ДОЛЖНОСТИ при типе «дневной» →
        // считается мастером, из дневных исключён (Task 390 инвариант)
        assertTrue(html.indexOf('Работников на текущий момент 4 (1 мастер, 1 дневной, 2 сменных).') !== -1,
            '(4) = 1+1+2 — мастер по должности, дневные/сменные по типу');
    });

    test('VM: пустой список — нули в новом формате', () => {
        const t = workersHost(true, []);
        const html = t.host._renderWorkersGeneral([]);
        assertTrue(html.indexOf('Работников на текущий момент 0 (0 мастеров, 0 дневных, 0 сменных).') !== -1,
            '«(0) (0 мастеров, 0 дневных, 0 сменных)»');
    });

    test('VM: порядок — штат ПЕРВОЙ строчкой, текущий ниже', () => {
        const t = workersHost(true);
        const html = t.host._renderWorkersGeneral(t.host._EMPLOYEES);
        const iStaff = html.indexOf('Работников по штату 14');
        const iCur = html.indexOf('Работников на текущий момент');
        assertTrue(iStaff !== -1 && iCur !== -1, 'обе строки есть');
        assertTrue(iStaff < iCur, 'штат выше, текущий ниже строчкой');
    });

    test('VM: зритель — кнопки НЕТ, строки в новом формате есть', () => {
        const t = workersHost(false);
        t.host._renderWorkersPage();
        const body = t.els.wsWorkersBody.innerHTML;
        assertTrue(body.indexOf('ws-workers-add') === -1,
            'кнопки у зрителя нет (_canEdit-гейт)');
        assertTrue(body.indexOf('Работников по штату 14 (2 мастера, 7 дневных, 5 сменных).') !== -1 &&
                   body.indexOf('Работников на текущий момент 6') !== -1,
            'обе строки доступны всем');
    });

    test('VM: кнопка — прежний контракт (id/onclick/aria)', () => {
        const t = workersHost(true);
        const html = t.host._renderWorkersGeneral(t.host._EMPLOYEES);
        assertTrue(html.indexOf('id="wsWorkersAddBtn"') !== -1,
            'id сохранён (браузер-чеки и JS-контракты)');
        assertTrue(html.indexOf('WorkSchedule.openEmployeeForm()') !== -1,
            'onclick — шторка создания работника');
        assertTrue(html.indexOf('aria-label="Добавить работника"') !== -1,
            'aria-подпись жива');
    });
});
