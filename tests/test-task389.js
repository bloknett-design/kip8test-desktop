// ============================================================
// Task 389 — 4 части заявки:
//   1) окно «Мероприятия»: общий фон за прошедшими — как раньше
//      (как выше за оглавлением окна) → .ws-ep-past = transparent;
//   2) страница «Работники»: кнопка «Добавить работника» — с бара
//      (шапки страницы) на «Общую» вкладку;
//   3) «Общая» вкладка: «на текущий момент N работников
//      (автоматический подсчёт), по штату 14, из которых 2 мастера,
//      5 сменных и 7 дневных»;
//   4) фон ярлыков и окон вкладов — НЕ прозрачный (сплошной),
//      ярлыки и окна — с левого края (margin: 0, не 0 auto).
//
// Заявка: «В окне мероприятий, цвет общего фона за мероприятиями с
// прошедшими датами сделай как раньше был общий фон (как сейчас
// общий фон выше за оглавлением окна). На странице "Работники",
// кнопку "Добавить работника" перенеси с бара на общую вкладку
// работников, и в общей вкладке допиши информацию что, на текущий
// момент 12 работников (автоматический подсчёт), по штату 14 из
// которых 2 мастера, 5 сменных и 7 дневных. Фон ярлыков и окон
// вкладок сделай не прозрачным, и расположи их с левого края.»
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

// Русские склонения (как в живом приложении) — «3 работника»,
// «0 работников», «1 работник»
function pluralRu(n, forms) {
    return forms[(n % 10 === 1 && n % 100 !== 11) ? 0 :
        (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2];
}

function workersHost(canEdit, employees) {
    const els = { wsWorkersBody: mkEl() };
    const EMPLOYEES = employees !== undefined ? employees : [
        { 'таб_номер': '0955', 'ФИО': 'Петров П. П.', 'тип': 'дневной',
          'смена': '', 'должность': 'Инженер КИПиА', 'комментарий': '',
          'дата_приёма': '2025-09-01' },
        { 'таб_номер': '0871', 'ФИО': 'Иванов И. И.', 'тип': 'сменный',
          'смена': 2, 'должность': 'Слесарь КИПиА', 'комментарий': 'осн.',
          'дата_приёма': '2024-05-01' },
        { 'таб_номер': '0300', 'ФИО': 'Аистов А. А.', 'тип': 'сменный',
          'смена': 1, 'должность': 'Электрик', 'комментарий': '',
          'дата_приёма': '2023-02-11' },
    ];
    const host = new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_renderWorkersPage') + ',\n' +
        methodText(INDEX_SRC, '_renderWorkersGeneral') + ',\n' +
        methodText(INDEX_SRC, 'selectWorkersTab') + ',\n' +
        // Task 390: шапка «Общей» вкладки считает мастеров
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
// 1. SRC — окно «Мероприятия»: прошедшие — общий фон окна
// ============================================================
describe('Task 389 — SRC: окно «Мероприятия» — прошедшие = общий фон', () => {

    test('.ws-ep-past: ПРОЗРАЧНЫЙ — общий фон окна (обе темы)', () => {
        assertTrue(/\.ws-ep-item\.ws-ep-past \{[^}]*background:\s*transparent;[^}]*\}/.test(INDEX_SRC),
            'тёмная: transparent — виден общий фон окна var(--bg-tertiary)');
        assertTrue(/\[data-theme="light"\] \.ws-ep-item\.ws-ep-past \{[^}]*background:\s*transparent;[^}]*\}/.test(INDEX_SRC),
            'светлая: transparent');
    });

    test('«светлее окна» Task 380/381 для прошедших ОТМЕНЕНО', () => {
        assertFalse(/\.ws-ep-item\.ws-ep-past \{[^}]*rgba\(255, 255, 255, 0\.12\)/.test(INDEX_SRC),
            'тёмная: rgba(255,255,255,0.12) больше НЕ у прошедших');
        assertFalse(/\[data-theme="light"\] \.ws-ep-item\.ws-ep-past \{[^}]*rgba\(255, 255, 255, 0\.55\)/.test(INDEX_SRC),
            'светлая: rgba(255,255,255,0.55) больше НЕ у прошедших');
    });

    test('текущие/будущие — ТЕМНЕЕ окна как прежде (не тронуты)', () => {
        assertTrue(/\.ws-ep-item \{[^{}]*padding:\s*3px 10px;[^{}]*margin:\s*0 -10px;[^{}]*background:\s*rgba\(0, 0, 0, 0\.45\);[^{}]*\}/.test(INDEX_SRC),
            'тёмная база: rgba(0,0,0,0.45)');
        assertTrue(/\[data-theme="light"\] \.ws-ep-item \{[^}]*background:\s*rgba\(0, 0, 0, 0\.12\);[^}]*\}/.test(INDEX_SRC),
            'светлая база: rgba(0,0,0,0.12)');
    });

    test('класс .ws-ep-past и каскад живы (граница зон на стыке)', () => {
        assertTrue(INDEX_SRC.indexOf("(eIso && eIso < todayIso) ? ' ws-ep-past' : ''") !== -1,
            'JS ставит класс прошедшим (граница — «сегодня»)');
        const iBase = INDEX_SRC.indexOf('.ws-ep-item {\n        padding: 3px 10px;');
        const iPast = INDEX_SRC.indexOf('.ws-ep-item.ws-ep-past {');
        const iLight = INDEX_SRC.indexOf('[data-theme="light"] .ws-ep-item {\n');
        const iLightPast = INDEX_SRC.indexOf('[data-theme="light"] .ws-ep-item.ws-ep-past {');
        assertTrue(iBase !== -1 && iPast !== -1 && iLight !== -1 && iLightPast !== -1,
            'все 4 правила на месте');
        assertTrue(iBase < iPast && iPast < iLight && iLight < iLightPast,
            'порядок каскада сохранён (Task 380/381)');
    });

    test('комментарий Task 389 у правил окна мероприятий', () => {
        const i = INDEX_SRC.indexOf('Task 389 (заявка: «в окне мероприятий');
        assertTrue(i !== -1, 'комментарий-обоснование есть');
        const chunk = INDEX_SRC.slice(i, i + 900);
        assertTrue(chunk.indexOf('общий фон выше за оглавлением окна') !== -1,
            'ссылка на формулировку заявки');
    });
});

// ============================================================
// 2. SRC — страница «Работники»: кнопка на «Общей» вкладке
// ============================================================
describe('Task 389 — SRC: кнопка «Добавить работника» — на «Общей» вкладке', () => {

    test('HTML: в шапке страницы кнопки НЕТ', () => {
        const iPage = INDEX_SRC.indexOf('id="page-ws-workers"');
        assertTrue(iPage !== -1, 'страница жива');
        const chunk = INDEX_SRC.slice(iPage, iPage + 700);
        assertTrue(chunk.indexOf('page-inline-header-title">Работники') !== -1,
            'заголовок «Работники» жив');
        assertTrue(chunk.indexOf('id="wsWorkersAddBtn"') === -1,
            'кнопки добавления в шапке страницы НЕТ (Task 389)');
        assertTrue(chunk.indexOf('ws-workers-add') === -1,
            'класса кнопки в шапке НЕТ');
    });

    test('_renderWorkersGeneral: кнопка рендерится (id сохранён)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        assertTrue(fn.indexOf('id="wsWorkersAddBtn"') !== -1,
            'id wsWorkersAddBtn сохранён (перенос из шапки)');
        assertTrue(fn.indexOf('WorkSchedule.openEmployeeForm()') !== -1,
            'onclick → шторка создания');
        assertTrue(fn.indexOf('aria-label="Добавить работника"') !== -1,
            'aria-подпись');
        assertTrue(fn.indexOf('>Добавить работника</button>') !== -1,
            'текст «Добавить работника»');
        assertTrue(fn.indexOf('this._canEdit') !== -1,
            'кнопка — только у редакторов (_canEdit)');
    });

    test('_renderWorkersPage: пустой список НЕ прерывает рендер', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersPage'));
        assertTrue(fn.indexOf('this._EMPLOYEES.length') === -1,
            'ранний выход для пустого списка удалён');
        assertTrue(fn.indexOf('(this._EMPLOYEES || [])') !== -1,
            'список — защитное (this._EMPLOYEES || [])');
        assertTrue(fn.indexOf('ws-wgen') !== -1,
            'тело «Общей» — панель .ws-wgen');
        assertFalse(fn.indexOf("'<div class=\"ws-tt-empty\">Нет активных работников. '") !== -1,
            'старый ранний выход (с текстом про шапку) удалён');
    });

    test('пустое состояние — текст про кнопку вкладки', () => {
        assertTrue(INDEX_SRC.indexOf(
            'Нет активных работников — добавьте первого кнопкой «Добавить работника».') !== -1,
            'подсказка без слов «в шапке страницы»');
    });
});

// ============================================================
// 3. SRC — «Общая» вкладка: численность (авто) + штат
// ============================================================
describe('Task 389 — SRC: численность и штат в шапке сводки', () => {

    test('«Работников на текущий момент: …» — АВТОПОДСЧЁТ ПО КАТЕГОРИЯМ (Task 390)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        assertTrue(fn.indexOf('Работников на текущий момент ') !== -1,
            'формулировка «Работников на текущий момент» (Task 390/391)');
        assertTrue(fn.indexOf('this._isMasterKipia(cEmp)') !== -1,
            'мастера — по должности «Мастер КИПиА» (_isMasterKipia)');
        assertTrue(fn.indexOf("['мастер', 'мастера', 'мастеров']") !== -1 &&
                   fn.indexOf("['дневной', 'дневных', 'дневных']") !== -1 &&
                   fn.indexOf("['сменный', 'сменных', 'сменных']") !== -1,
            'склонения категорий через _plural');
        assertTrue(fn.indexOf('На текущий момент:') === -1 &&
                   fn.indexOf('(автоматический подсчёт)') === -1,
            'старые формулировки удалены');
    });

    test('«Работников по штату 14: 2 мастера; 7 дневных; 5 сменных.» (Task 390)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        assertTrue(fn.indexOf('Работников по штату 14 ') !== -1,
            'константа штата: 14, формат в скобках (Task 391)');
        assertTrue(fn.indexOf('2 мастера, 7 дневных, 5 сменных).') !== -1,
            'структура: 2 мастера / 7 дневных / 5 сменных (Task 391)');
        assertTrue(fn.indexOf('ws-wgen-staff') !== -1,
            'класс строки штата');
        assertTrue(fn.indexOf('ws-wgen-info') !== -1,
            'инфо-блок шапки сводки');
        assertTrue(fn.indexOf('ws-workers-count') !== -1,
            'счётчик — прежний класс (стили живы)');
        assertTrue(fn.indexOf('По штату: 14, из которых') === -1,
            'старая формулировка удалена');
    });
});

// ============================================================
// 4. SRC — CSS: сплошные фоны + левый край
// ============================================================
describe('Task 389 — SRC: CSS — фоны НЕ прозрачные, левый край', () => {

    test('.ws-workers-body: с ЛЕВОГО КРАЯ (margin: 0)', () => {
        const b = ruleBlock('.ws-workers-body {');
        assertTrue(b !== null, 'правило живо');
        assertTrue(b.indexOf('margin: 0;') !== -1, 'margin: 0 (левый край)');
        assertTrue(b.indexOf('margin: 0 auto') === -1,
            'центрирование (0 auto) убрано');
    });

    test('.ws-wtab: СПЛОШНОЙ фон неактивного ярлыка', () => {
        const b = ruleBlock('.ws-wtab {');
        assertTrue(b !== null, 'правило живо');
        // Task 431: фон — как блоки карт (#243349, раньше тёплый
        // #4B4E46 Task 390)
        assertTrue(b.indexOf('background: #243349;') !== -1,
            'тёмная (Task 431): фон блоков карт #243349');
        assertFalse(/background:\s*rgba\(/.test(b),
            'в правиле .ws-wtab нет полупрозрачных фонов');
    });

    test('.ws-wtab:hover: сплошной светлее', () => {
        const b = ruleBlock('.ws-wtab:hover {');
        assertTrue(b !== null && b.indexOf('background: #2A3A53;') !== -1,
            'тёмная (Task 431): #2A3A53 — шаг светлее блоков карт');
    });

    test('светлая тема: ярлыки сплошные', () => {
        const b = INDEX_SRC.match(/\[data-theme="light"\] \.ws-wtab \{[^}]*\}/);
        assertTrue(b !== null && b[0].indexOf('background: #E4E0D3;') !== -1,
            'светлая: сплошной #E4E0D3');
        const h = INDEX_SRC.match(/\[data-theme="light"\] \.ws-wtab:hover \{[^}]*\}/);
        assertTrue(h !== null && h[0].indexOf('background: #DBD6C8') !== -1,
            'светлая: hover — сплошной #DBD6C8');
    });

    test('.ws-wgen: панель-ОКНО «Общей» вкладки — сплошной фон', () => {
        const b = ruleBlock('.ws-wgen {');
        assertTrue(b !== null, 'правило .ws-wgen есть');
        assertTrue(b.indexOf('background: var(--bg-tertiary, #0e1621);') !== -1,
            'сплошной var(--bg-tertiary) — как .ws-wcard');
        assertTrue(b.indexOf('border-radius: 10px;') !== -1,
            'панель с рамкой/радиусом как карточка');
        const l = INDEX_SRC.match(/\[data-theme="light"\] \.ws-wgen \{[^}]*\}/);
        assertTrue(l !== null && l[0].indexOf('background: var(--bg-tertiary') !== -1,
            'светлая: сплошной');
    });

    test('.ws-wgen-head: flex — инфо слева, кнопка справа', () => {
        const b = ruleBlock('.ws-wgen-head {');
        assertTrue(b !== null, 'правило живо');
        assertTrue(b.indexOf('display: flex;') !== -1 &&
                   b.indexOf('justify-content: space-between;') !== -1,
            'инфо и кнопка по краям');
        assertTrue(b.indexOf('flex-wrap: wrap;') !== -1,
            'перенос на узких экранах');
        assertTrue(INDEX_SRC.indexOf('.ws-wgen-info {') !== -1 &&
                   INDEX_SRC.indexOf('.ws-wgen-staff {') !== -1,
            'инфо-блок и строка штата');
    });

    test('.ws-workers-count: margin 0 (живёт в шапке сводки)', () => {
        const b = ruleBlock('.ws-workers-count {');
        assertTrue(b !== null && b.indexOf('margin: 0;') !== -1,
            'внешние отступы ушли контейнеру .ws-wgen-head');
    });

    test('SW: kipia-test-v743', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v743'") !== -1,
            'SWVersion bumped');
    });
});

// ============================================================
// 5. VM — функциональные проверки
// ============================================================
describe('Task 389 — VM: «Общая» вкладка', () => {

    test('VM: численность (автоподсчёт) + штат + кнопка у редактора', () => {
        const t = workersHost(true);
        t.host._renderWorkersPage();
        const body = t.els.wsWorkersBody.innerHTML;
        assertTrue(body.indexOf('Работников на текущий момент 3 (0 мастеров, 1 дневной, 2 сменных).') !== -1,
            'автоподсчёт (Task 391): (3) (0 мастеров, 1 дневной, 2 сменных)');
        assertTrue(body.indexOf('Работников по штату 14 (2 мастера, 7 дневных, 5 сменных).') !== -1,
            'штат: 14 = 2 мастера + 7 дневных + 5 сменных (Task 391)');
        assertTrue(body.indexOf('id="wsWorkersAddBtn"') !== -1,
            'кнопка «Добавить работника» — НА «Общей» вкладке');
        assertTrue(body.indexOf('WorkSchedule.openEmployeeForm()') !== -1,
            'onclick кнопки — шторка создания');
        assertTrue(body.indexOf('ws-wgen-head') !== -1 &&
                   body.indexOf('ws-wgen-info') !== -1,
            'шапка сводки: инфо-блок + кнопка');
    });

    test('VM: зритель — кнопки НЕТ, информация есть', () => {
        const t = workersHost(false);
        t.host._renderWorkersPage();
        const body = t.els.wsWorkersBody.innerHTML;
        assertTrue(body.indexOf('ws-workers-add') === -1,
            'кнопки «Добавить работника» у зрителя НЕТ (_canEdit-гейт)');
        assertTrue(body.indexOf('Работников на текущий момент') !== -1 &&
                   body.indexOf('Работников по штату 14') !== -1,
            'информация доступна всем');
    });

    test('VM: пустой список — «Общая» вкладка с кнопкой и подсказкой', () => {
        const t = workersHost(true, []);
        t.host._renderWorkersPage();
        const body = t.els.wsWorkersBody.innerHTML;
        assertTrue(body.indexOf('ws-workers-layout') !== -1,
            'раскладка вкладок рендерится (раннего выхода НЕТ)');
        assertEqual((body.match(/role="tab"/g) || []).length, 1,
            'один ярлык — «Общая»');
        assertTrue(body.indexOf('Работников на текущий момент 0 (0 мастеров, 0 дневных, 0 сменных).') !== -1,
            'автоподсчёт нуля (Task 391)');
        assertTrue(body.indexOf('Нет активных работников — добавьте первого кнопкой «Добавить работника».') !== -1,
            'подсказка пустого состояния');
        assertTrue(body.indexOf('id="wsWorkersAddBtn"') !== -1,
            'кнопка доступна и без работников');
    });

    test('VM: вкладка работника — карточка; «Общая» — панель .ws-wgen', () => {
        const t = workersHost(true);
        t.host.selectWorkersTab('0871');
        const body = t.els.wsWorkersBody.innerHTML;
        assertTrue(body.indexOf('CARD:0871:edit') !== -1, 'карточка работника');
        assertTrue(body.indexOf('<div class="ws-wgen">') === -1,
            'панель «Общей» не рендерится на вкладке работника');
        t.host.selectWorkersTab('general');
        const body2 = t.els.wsWorkersBody.innerHTML;
        assertTrue(body2.indexOf('<div class="ws-wgen">') !== -1,
            'возврат на «Общую» — панель-окно сводки');
        assertTrue(body2.indexOf('CARD:') === -1, 'карточки нет');
    });

    test('VM: _renderWorkersGeneral напрямую — автоподсчёт по списку', () => {
        const t = workersHost(true);
        const two = t.host._EMPLOYEES.slice(0, 2);
        const html = t.host._renderWorkersGeneral(two);
        assertTrue(html.indexOf('Работников на текущий момент 2 (0 мастеров, 1 дневной, 1 сменный).') !== -1,
            'категории переданного списка: (2) (0 мастеров, 1 дневной, 1 сменный) (Task 391)');
        assertTrue(html.indexOf('ws-wgen-table') !== -1, 'таблица сводки жива');
        const t2 = workersHost(false);
        const html2 = t2.host._renderWorkersGeneral([]);
        assertTrue(html2.indexOf('ws-workers-add') === -1,
            'зритель: кнопки нет и при прямом вызове');
        assertTrue(html2.indexOf('ws-wgen-table') === -1,
            'пустой список — без таблицы');
    });
});
