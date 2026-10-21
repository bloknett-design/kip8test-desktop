// ============================================================
// Task 395 — заявка (3 части):
//  (1) «Пользователи, у которых нет доступа к разделу Табель
//      учёта рабочего времени или ограниченный просмотр, согласно
//      матрице доступа ролей, кнопка "Работники" не должна
//      отображаться» — кнопка скрыта уровням null (нет доступа) и
//      min (ограниченный просмотр); edit/view — видна (у view
//      карточки без правки);
//  (2) «В картах работников, цвет фона блоков карточек сделай
//      чтобы он не сливался с общим фоном окна, и рамки блоков
//      сделай по толще и по ярче (стиле выступающего вверх
//      бордюрчика)» — фон панелей светлее фона страницы (обе
//      темы), рамка 2px ярче + светлая верхняя кромка + тень
//      снизу («приподнятое» окно);
//  (3) «В десктопе, блок отпуска размести под блоком профиля,
//      блок мероприятия под блоком отпуска, блок СИЗ перемести
//      в верхнюю правую часть экрана» — ДВЕ колонки: левая
//      .ws-wcol (профиль → отпуска → мероприятия), правая
//      .ws-wcol-ppe (СИЗ сверху, не тянется по высоте).
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
// 1. SRC — JS: кнопка «Работники» по матрице доступа ролей
// ============================================================
describe('Task 395 — SRC: кнопка «Работники» — матрица доступа', () => {

    test('init — кнопка скрыта для null и min (edit/view — видна)', () => {
        const i = INDEX_SRC.indexOf('workersBtnInit = document');
        assertTrue(i !== -1, 'строка init жива');
        const chunk = INDEX_SRC.slice(i, i + 400);
        assertTrue(chunk.indexOf(
            "workersBtnInit.hidden =\n                (this._viewLevel === null || this._viewLevel === 'min')") !== -1,
            'hidden = null || min (Task 385 скрывал только по _canEdit)');
        assertFalse(chunk.indexOf('workersBtnInit.hidden = !this._canEdit') !== -1,
            'прежний гейт _canEdit снят');
    });

    test('_onRoleUpdate — поздняя роль: тот же гейт null/min', () => {
        const i = INDEX_SRC.indexOf('workersBtn = document');
        assertTrue(i !== -1, 'строка _onRoleUpdate жива');
        const chunk = INDEX_SRC.slice(i, i + 400);
        assertTrue(chunk.indexOf(
            "workersBtn.hidden =\n                (newLevel === null || newLevel === 'min')") !== -1,
            'роль пришла позже init — кнопка скрыта для null/min');
    });

    test('openWorkersPage — гейт ЗЕРКАЛЕН кнопке (edit/view)', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'openWorkersPage'));
        assertTrue(fn.indexOf("if (lvl !== 'edit' && lvl !== 'view') return;") !== -1,
            'edit/view — пускаются (зритель видит карточки read-only)');
        assertTrue(fn.indexOf('this._viewLevel === undefined') !== -1 &&
                   fn.indexOf("this._canEdit ? 'edit' : 'view'") !== -1,
            'легаси-запас: уровень не посчитан — производная от _canEdit');
    });

    test('_renderWorkersPage — прямой URL: null/min — пустое тело', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersPage'));
        assertTrue(fn.indexOf("if (lvl !== 'edit' && lvl !== 'view') { body.innerHTML = ''; return; }") !== -1,
            'без прав страница не рендерится (кнопка — единственный вход)');
    });
});

// ============================================================
// 2. SRC — CSS: фон не сливается + рамка «выступающего бордюрчика»
// ============================================================
describe('Task 395 — SRC: CSS панелей .ws-wcard', () => {

    test('тёмная: фон СВЕТЛЕЕ фона страницы (не сливается)', () => {
        const r = ruleBlock('.ws-wcard {');
        assertTrue(r !== null, 'правило живо');
        assertTrue(r.indexOf('background: #243349;') !== -1,
            'сплошной #243349 — светлее фона страницы #1a2233');
        assertFalse(r.indexOf('var(--bg-tertiary, #0e1621)') !== -1,
            'прежний тёмный фон (#0e1621 — ТЕМНЕЕ фона, сливался) снят');
    });

    test('тёмная: рамка 2px ЯРЧЕ + светлая верхняя кромка + тень', () => {
        const r = ruleBlock('.ws-wcard {');
        assertTrue(r.indexOf('border: 2px solid rgba(116, 162, 214, 0.42);') !== -1,
            'толще (2px, было 1px) и ярче (синий 0.42, было 0.08)');
        assertTrue(r.indexOf('border-top-color: rgba(152, 196, 240, 0.7);') !== -1,
            'верхняя кромка СВЕТЛЕЕ боков — «выступающий вверх бордюрчик»');
        assertTrue(r.indexOf('box-shadow: 0 3px 0 rgba(0, 0, 0, 0.24);') !== -1,
            'тень снизу — окно приподнято над страницей');
    });

    test('светлая: БЕЛАЯ панель + рамка темнее + блик сверху', () => {
        const r = ruleBlock('[data-theme="light"] .ws-wcard {');
        assertTrue(r !== null, 'правило живо');
        assertTrue(r.indexOf('background: #ffffff;') !== -1,
            'белая панель поверх кремового фона страницы #FAF9F5');
        assertTrue(r.indexOf('border-color: rgba(20, 20, 19, 0.42);') !== -1,
            'рамка толще/темнее (было 0.1)');
        assertTrue(r.indexOf('border-top-color: rgba(255, 255, 255, 0.95);') !== -1,
            'верхняя кромка светлая — блик «света сверху»');
        assertTrue(r.indexOf('box-shadow: 0 3px 0 rgba(20, 20, 19, 0.14);') !== -1,
            'тень снизу — «приподнятый» стиль, как в тёмной');
    });
});

// ============================================================
// 3. SRC — колонки: СИЗ в верхней правой части экрана
// ============================================================
describe('Task 395 — SRC: колонки карточки (десктоп)', () => {

    test('_renderWorkerCardPanels — ТРИ колонки: main / инструктажи / СИЗ', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCardPanels'));
        // Task 406: мероприятия — в ПЕРВУЮ колонку (под отпусками),
        // инструктажи — ВТОРАЯ (.ws-wcol-instr), СИЗ — ТРЕТЬЯ (.ws-wcol-ppe)
        assertTrue(fn.indexOf('if (bi < 3) colMain += panel;') !== -1,
            'блоки 1–3 (профиль/отпуска/мероприятия) — в колонку main');
        assertTrue(fn.indexOf('else if (bi === 4) colInstr += panel;') !== -1,
            'блок 5 (инструктажи) — во ВТОРУЮ колонку .ws-wcol-instr');
        assertTrue(fn.indexOf('else colPpe += panel;') !== -1,
            'блок 4 (СИЗ) — в ТРЕТЬЮ колонку .ws-wcol-ppe');
        assertTrue(fn.indexOf("'<div class=\"ws-wcol ws-wcol-ppe\">' + colPpe + '</div>'") !== -1,
            'третья колонка .ws-wcol-ppe (СИЗ — СПРАВА от инструктажей)');
        assertFalse(fn.indexOf("'ws-wgrid2'") !== -1,
            'обёртку сетки задаёт _renderWorkersPage (не панели)');
    });

    test('десктоп ≥1024px — ТРИ равные колонки (в одну линию, Task 404)', () => {
        const m = INDEX_SRC.match(/@media \(min-width: 1024px\) \{\s*\.ws-wgrid2 \{[^}]*?\}\s*\.ws-wgrid2 \.ws-wcol \{[^}]*?\}\s*\}/);
        assertTrue(m !== null, 'блок медиаправил жив');
        assertTrue(m[0].indexOf('display: flex;') !== -1 &&
                   m[0].indexOf('gap: 5px;') !== -1,
            'flex-раскладка с зазором 5px (Task 428)');
        assertTrue(m[0].indexOf('align-items: flex-start;') !== -1,
            'колонки НЕ тянутся по высоте друг друга');
        assertTrue(m[0].indexOf('flex: 1 1 0;') !== -1,
            'колонки РАВНЫЕ (1 1 0 — три блока в одну линию на всю ширину)');
    });

    test('мобайл — стек: колонки без раскладки, зазор между ними', () => {
        const base = INDEX_SRC.indexOf('.ws-wgrid2 .ws-wcol { margin-bottom: 5px; }');
        assertTrue(base !== -1,
            'зазор между колонками в стеке (Task 428: 5px)');
        assertTrue(INDEX_SRC.indexOf('.ws-wgrid2 .ws-wcol:last-child { margin-bottom: 0; }') !== -1,
            'последняя колонка без зазора');
        // вне @media ≥1024px (мобильный стек) — панелям базовый зазор
        const r = ruleBlock('.ws-wcard {');
        assertTrue(r.indexOf('margin-bottom: 5px;') !== -1,
            'зазор панелей внутри колонок жив (Task 393; Task 428: 5px)');
    });
});

// ============================================================
// 4. VM — панели: колонки; гейты страницы по уровням
// ============================================================
function pageHost(opts) {
    opts = opts || {};
    const els = { wsWorkersBody: mkEl() };
    const nav = [];
    const EMPLOYEES = [
        { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
          'смена': '', 'должность': 'Мастер КИПиА', 'комментарий': '',
          'дата_приёма': '2007-03-06' },
    ];
    const PPE = [
        { id: 1, 'таб_номер': '2706', наименование: 'Каска защитная',
          дата_выдачи: '2026-09-17', срок_годности: '1 год',
          дата_окончания: '2027-09-17', примечание: '' },
    ];
    const host = new Function('document', 'navigateTo', 'return ({' +
        methodText(INDEX_SRC, '_renderWorkersPage') + ',\n' +
        methodText(INDEX_SRC, '_renderWorkersGeneral') + ',\n' +
        methodText(INDEX_SRC, 'selectWorkersTab') + ',\n' +
        methodText(INDEX_SRC, '_isMasterKipia') + ',\n' +
        methodText(INDEX_SRC, 'openWorkersPage') + ',\n' +
        methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
        methodText(INDEX_SRC, '_renderWorkerCardPanels') + ',\n' +
        methodText(INDEX_SRC, '_isInstrType') + ',\n' +
        '_workersTab: "general",' +
        '_canEdit: ' + (opts.canEdit === undefined ? true : !!opts.canEdit) + ',' +
        (opts.viewLevel === undefined ? '' :
            ('_viewLevel: ' + JSON.stringify(opts.viewLevel) + ',')) +
        '_year: 2026, _month: 9,' +
        '_EMPLOYEES: ' + JSON.stringify(EMPLOYEES) + ',' +
        '_VACATIONS: [],' +
        '_TRAININGS: [],' +
        '_PPE: ' + JSON.stringify(PPE) + ',' +
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

describe('Task 395 — VM: панели-колонки карточки', () => {

    test('колонки: 1 — профиль+отпуска+мероприятия; 2 — инструктажи; 3 — СИЗ (Task 406)', () => {
        const t = pageHost({ canEdit: true });
        const html = t.host._renderWorkerCardPanels('2706', true);
        const iL = html.indexOf('<div class="ws-wcol">');
        const iI = html.indexOf('<div class="ws-wcol ws-wcol-instr">');
        const iP = html.indexOf('<div class="ws-wcol ws-wcol-ppe">');
        assertTrue(iL !== -1 && iI !== -1 && iP !== -1 && iL < iI && iI < iP,
            'ТРИ колонки: main → инструктажи → СИЗ (Task 406)');
        const mainPart = html.slice(iL, iI);
        const insPart = html.slice(iI, iP);
        const ppePart = html.slice(iP);
        assertEqual((mainPart.match(/class="ws-wcard"/g) || []).length, 3,
            'колонка 1 — 3 окна (профиль + отпуска + мероприятия, Task 406)');
        assertEqual((insPart.match(/class="ws-wcard"/g) || []).length, 1,
            'колонка 2 — 1 окно (повторные инструктажи)');
        assertEqual((ppePart.match(/class="ws-wcard"/g) || []).length, 1,
            'колонка 3 — 1 окно (СИЗ)');
        assertTrue(insPart.indexOf(
            'Повторные инструктажи и периодическая проверка знаний · 2026') !== -1,
            'Task 406: инструктажи — ВТОРАЯ колонка');
        assertTrue(ppePart.indexOf('СИЗ · средства индивидуальной защиты') !== -1,
            'СИЗ — в 3-й колонке (СПРАВА от инструктажей)');
        assertTrue(ppePart.indexOf('Каска защитная') !== -1,
            'запись СИЗ — в 3-й колонке');
        const i1 = mainPart.indexOf('Галкин Д. Н.');
        const i2 = mainPart.indexOf('Отпуска · 2026');
        const i3 = mainPart.indexOf('Мероприятия · 2026');
        assertTrue(i1 !== -1 && i2 !== -1 && i3 !== -1 &&
                   i1 < i2 && i2 < i3,
            'порядок колонки 1: профиль → отпуска → мероприятия');
        assertTrue(mainPart.indexOf('СИЗ · средства') === -1 &&
                   mainPart.indexOf('Повторные инструктажи') === -1,
            'в колонке 1 — без СИЗ и инструктажей');
    });

    test('страница — панели в обёртке .ws-wgrid2 (вкладка работника)', () => {
        const t = pageHost({ canEdit: true });
        t.host._renderWorkersPage();
        t.host.selectWorkersTab('2706');
        const body = t.els.wsWorkersBody.innerHTML;
        assertTrue(body.indexOf('<div class="ws-wgrid2">') !== -1,
            'обёртка .ws-wgrid2 жива (Task 394)');
        assertTrue(body.indexOf('<div class="ws-wcol ws-wcol-instr">') !== -1,
            'вторая колонка (инструктажи) — на странице (Task 406)');
        assertTrue(body.indexOf('<div class="ws-wcol ws-wcol-ppe">') !== -1,
            'третья колонка (СИЗ) — на странице (Task 406)');
        assertEqual((body.match(/class="ws-wcard"/g) || []).length, 5,
            'всего пять блоков-окон (Task 405)');
    });
});

describe('Task 395 — VM: гейты страницы по матрице', () => {

    test('edit — переход + рендер с кнопками правки', () => {
        const t = pageHost({ canEdit: true, viewLevel: 'edit' });
        t.host.openWorkersPage();
        assertEqual(JSON.stringify(t.nav), JSON.stringify(['ws-workers']),
            'navigateTo(ws-workers)');
        t.host.selectWorkersTab('2706');
        const body = t.els.wsWorkersBody.innerHTML;
        assertTrue(body.indexOf('Правка данных…') !== -1,
            'редактор — с кнопками правки');
    });

    test('view (зритель) — переход + рендер БЕЗ кнопок правки', () => {
        const t = pageHost({ canEdit: false, viewLevel: 'view' });
        t.host.openWorkersPage();
        assertEqual(JSON.stringify(t.nav), JSON.stringify(['ws-workers']),
            'Task 395: зритель ПУСКАЕТСЯ (кнопка видна уровню view)');
        t.host.selectWorkersTab('2706');
        const body = t.els.wsWorkersBody.innerHTML;
        assertTrue(body.indexOf('Галкин Д. Н.') !== -1,
            'карточка рендерится');
        assertTrue(body.indexOf('Правка данных…') === -1 &&
                   body.indexOf('+ Отпуск…') === -1 &&
                   body.indexOf('+ СИЗ…') === -1,
            'read-only: без кнопок правки');
    });

    test('min (ограниченный просмотр) — перехода НЕТ, тело пустое', () => {
        const t = pageHost({ canEdit: false, viewLevel: 'min' });
        t.host.openWorkersPage();
        assertEqual(JSON.stringify(t.nav), JSON.stringify([]),
            'кнопка скрыта — переход не выполняется');
        t.host._renderWorkersPage();
        assertEqual(t.els.wsWorkersBody.innerHTML, '',
            'прямой URL: тело пустое (не рендерится)');
    });

    test('null (нет доступа к разделу) — перехода НЕТ, тело пустое', () => {
        const t = pageHost({ canEdit: false, viewLevel: null });
        t.host.openWorkersPage();
        assertEqual(JSON.stringify(t.nav), JSON.stringify([]),
            'переход не выполняется');
        t.host._renderWorkersPage();
        assertEqual(t.els.wsWorkersBody.innerHTML, '',
            'прямой URL: тело пустое');
    });

    test('легаси: уровень не посчитан (undefined) — производная _canEdit', () => {
        // редактор без _viewLevel (старый кэш/хост) — пускается
        const t1 = pageHost({ canEdit: true });
        t1.host.openWorkersPage();
        assertEqual(JSON.stringify(t1.nav), JSON.stringify(['ws-workers']),
            'undefined + _canEdit → edit: переход есть');
        // не-редактор без _viewLevel — как зритель: пускается
        const t2 = pageHost({ canEdit: false });
        t2.host.openWorkersPage();
        assertEqual(JSON.stringify(t2.nav), JSON.stringify(['ws-workers']),
            'undefined + !_canEdit → view: переход есть (как прежде)');
    });
});

// ============================================================
// 5. SW-кэш поднят (фронтенд менялся)
// ============================================================
describe('Task 395 — SW-кэш', () => {
    test('SW поднят до v623 (Task 395 — фронтенд менялся)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v752') !== -1,
            'sw.js: CACHE_VERSION kipia-test-v752');
        assertTrue(SW_SRC.indexOf('kipia-test-v753') === -1,
            'двойного бампа нет (v624 не существует)');
    });
});
