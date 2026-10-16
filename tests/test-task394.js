// ============================================================
// Task 394 — заявка (3 части):
//  (1) «В десктопном представлении, блок отпусков переместить
//      справа от блока профиля, а блок СИЗ разместить под ним,
//      все четыре блока разместить равномерно по горизонтали на
//      весь экран» — сетка 2×2 (обёртка .ws-wgrid2, ≥1024px),
//      кап ширины 1020px снят;
//  (2) «В картах работников мероприятия указывать на весь год» —
//      _loadTrainings без month (сервер отдаёт ГОД), блок 3
//      карточки — «Мероприятия · ГОД», колонка «Общей» вкладки —
//      тоже год;
//  (3) «В табеле учёта рабочего времени, в окне мероприятий на
//      текущий месяц так же указывать информацию по СИЗ на текущий
//      месяц, и по отпускам (если отпуск попадает частично на два
//      месяца, то информация по нему должна отображаться в окне
//      мероприятий обоих месяцев)» — секции «Отпуска» (пересечение
//      с месяцем) и «СИЗ» (дата_окончания в месяце) в
//      _renderMonthEventsPanel.
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
// 1. SRC — загрузка года, карточка, «Общая», обёртка сетки
// ============================================================
describe('Task 394 — SRC: мероприятия на весь год', () => {

    test('_loadTrainings — ГОД без month (сервер отдаёт год)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_loadTrainings'));
        assertTrue(fn.indexOf("listTrainings', { year: this._year }") !== -1,
            'payload только год');
        assertFalse(fn.indexOf('month: this._month') !== -1,
            'месяц из запроса убран');
    });

    test('карточка: блок 3 — «Мероприятия · ГОД», пустое — «за год»', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf("Мероприятия · ' +") !== -1 &&
                   fn.indexOf('wYearEv + this._wtabYearNav(tabNo, wYearEv, 0)') !== -1,
            'заголовок блока — год + навигатор (Task 408; Task 435: fam 0)');
        assertTrue(fn.indexOf('нет мероприятий за год') !== -1,
            'пустое состояние — «нет мероприятий за год»');
        assertFalse(fn.indexOf('monthNames') !== -1,
            'monthNames карточке больше не нужен');
        // защита от смешанных данных: сверка пересечения с годом
        // (Task 408: фильтр переехал в _wtabYearRecords)
        const wr = stripComments(methodText(INDEX_SRC, '_wtabYearRecords'));
        assertTrue(wr.indexOf("yS = year + '-01-01'") !== -1 &&
                   wr.indexOf("yE = year + '-12-31'") !== -1,
            'границы года для фильтра записей');
        assertTrue(wr.indexOf('if (e < yS || s > yE) continue;') !== -1,
            'записи вне года не показываются');
    });

    test('«Общая» вкладка — колонок «· ГОД» НЕТ (удалены, Task 445)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        assertTrue(fn.indexOf("'<th>Мероприятия · ' + this._year + '</th>'") === -1,
            'колонка «Мероприятия · год» удалена (Task 445)');
        assertTrue(fn.indexOf("'<th>Инструктажи · ' + this._year + '</th>'") === -1,
            'колонка «Инструктажи · год» удалена (Task 445)');
        assertTrue(fn.indexOf("'<th>Отпуск · ' + this._year + '</th>'") === -1,
            'колонка «Отпуск · год» удалена (Task 445)');
        assertFalse(fn.indexOf('monthNames') !== -1,
            'monthNames сводке больше не нужен');
    });

    test('_renderWorkersPage — обёртка .ws-wgrid2 вокруг панелей', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersPage'));
        assertTrue(fn.indexOf("contentHtml = '<div class=\"ws-wgrid2\">' +") !== -1,
            'панели блоков — в обёртке сетки');
        assertTrue(fn.indexOf('this._renderWorkerCardPanels(empTabNo, withEdit)') !== -1,
            'вызов панелей жив (Task 393)');
        // «Общая» — без сетки
        const gi = fn.indexOf("'<div class=\"ws-wgen\">'");
        const wi = fn.indexOf("'<div class=\"ws-wgrid2\">'");
        assertTrue(gi !== -1 && wi !== -1, 'обе ветки рендера живы');
    });
});

// ============================================================
// 2. SRC — CSS: сетка 2×2, весь экран, плашки/точки секций
// ============================================================
describe('Task 394 — SRC: CSS сетки и окна мероприятий', () => {

    test('десктоп ≥1024px — .ws-wgrid2: ДВЕ колонки flex (Task 395)', () => {
        const re = /@media \(min-width: 1024px\) \{\s*\.ws-wgrid2 \{[^}]*?display: flex;[^}]*?gap: 5px;[^}]*?align-items: flex-start;\s*\}\s*\.ws-wgrid2 \.ws-wcol \{[^}]*?flex: 1 1 0;[^}]*?min-width: 0;[^}]*?margin-bottom: 0;\s*\}/;
        assertTrue(re.test(INDEX_SRC),
            'Task 395: две равные flex-колонки; правая (СИЗ) сверху — не тянется (Task 428: зазор 5px)');
    });

    test('мобильный стек жив: зазор margin-bottom у панелей', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-wtab-body .ws-wcard { margin-bottom: 5px; }') !== -1,
            'базовый зазор стека (≤1023px) сохранён (Task 428: 5px)');
        assertTrue(INDEX_SRC.indexOf('.ws-wtab-body .ws-wcard:last-child { margin-bottom: 0; }') !== -1,
            'последнее окно без зазора');
    });

    test('страница «Работники» — НА ВЕСЬ ЭКРАН (кап 1020px снят)', () => {
        const r = ruleBlock('.ws-workers-body {');
        assertTrue(r !== null, 'правило живо');
        assertFalse(r.indexOf('max-width: 1020px') !== -1,
            'кап 1020px (Task 388) снят — блоки на весь экран');
    });

    test('окно мероприятий: плашка секции «СИЗ» (отпуска убраны — Task 404)', () => {
        const ppe = ruleBlock('.ws-ep-cap-ppe {');
        assertTrue(ppe !== null, 'плашка секции СИЗ жива');
        assertTrue(ruleBlock('.ws-ep-cap-vac {') === null,
            'плашка секции «Отпуска» УДАЛЕНА (Task 404)');
        assertFalse(INDEX_SRC.indexOf('.ws-ep-dot-vac') !== -1,
            'точки отпуска больше нет');
        assertTrue(INDEX_SRC.indexOf('.ws-ep-dot-ppe { background: #f0a830; }') !== -1,
            'точка СИЗ — янтарная');
        const re = /\[data-theme="light"\] \.ws-ep-cap-ppe \{[^}]*?color: #000;[^}]*?\}/;
        assertTrue(re.test(INDEX_SRC),
            'светлая тема: текст плашки — чёрный (Task 330)');
    });

    test('_renderMonthEventsPanel — секция СИЗ (отпуска убраны — Task 404)', () => {
        const m = methodText(INDEX_SRC, '_renderMonthEventsPanel');
        assertFalse(m.indexOf('vacList') !== -1,
            'сборки отпусков больше НЕТ (заявка Task 404)');
        assertFalse(m.indexOf('Отпуска · ') !== -1,
            'заголовка секции «Отпуска» нет');
        assertFalse(m.indexOf('ws-ep-dot-vac') !== -1, 'точки отпусков нет');
        assertTrue(m.indexOf('this._PPE || []') !== -1,
            'защитный доступ к СИЗ');
        assertTrue(m.indexOf('pExpIso < mStart || pExpIso > mEnd') !== -1,
            'СИЗ — дата_окончания ВНУТРИ месяца');
        assertTrue(m.indexOf("pExpIso === 'До износа'") !== -1,
            '«До износа» — без даты, не показывается');
        assertTrue(m.indexOf('СИЗ · ') !== -1,
            'заголовок секции СИЗ');
        assertTrue(m.indexOf('ws-ep-dot-ppe') !== -1,
            'точка секции СИЗ');
        assertTrue(m.indexOf("this._esc(String(ppz['наименование'] || '') +") !== -1,
            'текст строки секции: наименование · ФИО (Task 520 — без префикса «СИЗ · »)');
        // Task 520: жирная дата «до дд.мм» и префикс «СИЗ · » убраны;
        // мм.гггг красным — только в НОВОЙ группе просрочки
        assertFalse(m.indexOf("'СИЗ · ' + String") !== -1,
            'префикса «СИЗ · » в строках СИЗ больше НЕТ (Task 520)');
        assertFalse(m.indexOf("'<b class=\"ws-ep-date\">до ' +") !== -1,
            'даты «до дд.мм» в строках СИЗ больше НЕТ (Task 520)');
        assertTrue(m.indexOf('pExpIso !== selIso') !== -1,
            'режим выбранного дня: СИЗ — истекающие ровно в день');
        assertTrue(m.indexOf('ppeList.length') !== -1,
            'счётчик секции');
    });
});

// ============================================================
// 3. VM — карточка: мероприятия за год
// ============================================================
function cardHost(trainings, vacs) {
    const EMP = [
        { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
          'смена': '', 'должность': 'Мастер КИПиА', 'комментарий': '',
          'дата_приёма': '2007-03-06' },
        { 'таб_номер': '0377', 'ФИО': 'Первов С. А.', 'тип': 'сменный',
          'смена': 1, 'должность': 'Слесарь КИПиА', 'комментарий': '',
          'дата_приёма': '2025-01-20' },
    ];
    const host = new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
        methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
        methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
        methodText(INDEX_SRC, '_renderWorkerCardPanels') + ',\n' +
        methodText(INDEX_SRC, '_isInstrType') + ',\n' +
        '_canEdit: true,' +
        '_year: 2026, _month: 9,' +
        '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
        '_VACATIONS: ' + JSON.stringify(vacs || []) + ',' +
        '_TRAININGS: ' + JSON.stringify(trainings || []) + ',' +
        '_PPE: [],' +
        '_fmtDateRu: function(d) { d = String(d);' +
        '  var p = d.split("-"); return p.length === 3 ?' +
        '  p[2] + "." + p[1] + "." + p[0] : d; },' +
        '_esc: function(s) { return String(s); },' +
        '_escAttr: function(s) { return String(s); },' +
        '_trainingCodeOf: function(t) { return "И"; },' +
        '_statusMeta: function(c) { return {}; },' +
        '_vacDaysInYear: function(v, y) { return 14; },' +
        '_vacNetDaysInYear: function(v, y) { return 14; },' +
        '_plural: function(n, f) { return f[2]; }' +
        '});')(mockDoc({}));
    return host;
}

describe('Task 394 — VM: карточка — мероприятия за весь год', () => {

    const TRS = [
        { id: 41, 'таб_номер': '2706', 'тип': 'инструктаж', 'тема': 'Февральский',
          'дата_начала': '2026-02-03', 'дата_окончания': '2026-02-05' },
        { id: 42, 'таб_номер': '2706', 'тип': 'обучение', 'тема': 'Июньское',
          'дата_начала': '2026-06-15', 'дата_окончания': '2026-06-15' },
        { id: 43, 'таб_номер': '2706', 'тип': 'инструктаж', 'тема': 'Сентябрьское',
          'дата_начала': '2026-09-07', 'дата_окончания': '2026-09-07' },
        // вне года шахматки — НЕ показывается
        { id: 44, 'таб_номер': '2706', 'тип': 'инструктаж', 'тема': 'Прошлый год',
          'дата_начала': '2025-09-07', 'дата_окончания': '2025-09-07' },
        // чужой работник — НЕ показывается
        { id: 45, 'таб_номер': '0377', 'тип': 'инструктаж', 'тема': 'Чужое',
          'дата_начала': '2026-09-08', 'дата_окончания': '2026-09-08' },
        // пересекает границу года (конец в 2026) — показывается
        { id: 46, 'таб_номер': '2706', 'тип': 'инструктаж', 'тема': 'Через Новый год',
          'дата_начала': '2025-12-30', 'дата_окончания': '2026-01-03' },
    ];

    test('блок 3 — «Мероприятия · 2026»: только НЕ-инструктажи (Task 405)', () => {
        const host = cardHost(TRS);
        const b = host._renderWorkerCard('2706', true, true)[2];
        assertTrue(b.indexOf('Мероприятия · 2026') !== -1,
            'заголовок — год (не месяц)');
        // Task 405: в блоке мероприятий — только обучение/примечание/
        // прогул (новая таблица «Мероприятия»)
        assertTrue(b.indexOf('Июньское') !== -1,
            'обучение года показано в мероприятиях');
        ['Февральский', 'Сентябрьское', 'Через Новый год']
            .forEach(t => assertFalse(b.indexOf(t) !== -1,
                'инструктаж НЕ в мероприятиях: ' + t));
        assertFalse(b.indexOf('Прошлый год') !== -1,
            'запись вне года не показывается');
        assertFalse(b.indexOf('Чужое') !== -1,
            'чужой работник не показывается');
        assertFalse(b.indexOf('нет мероприятий за год') !== -1,
            'пустого состояния нет');
    });

    test('блок 5 — повторные инструктажи года (Task 405)', () => {
        const host = cardHost(TRS);
        const b = host._renderWorkerCard('2706', true, true)[4];
        assertTrue(
            b.indexOf('Повторные инструктажи и периодическая проверка знаний · 2026') !== -1,
            'заголовок нового блока (таблица «Инструктажи»)');
        ['Февральский', 'Сентябрьское', 'Через Новый год']
            .forEach(t => assertTrue(b.indexOf(t) !== -1,
                'инструктаж года показан: ' + t));
        assertFalse(b.indexOf('Июньское') !== -1,
            'обучение НЕ в инструктажах');
        assertFalse(b.indexOf('Прошлый год') !== -1,
            'вне года — не показывается');
        assertFalse(b.indexOf('Чужое') !== -1,
            'чужой работник — не показывается');
    });

    test('порядок записей года — по дате начала', () => {
        const host = cardHost(TRS);
        // Task 405: три инструктажа года — в блоке 5
        const b = host._renderWorkerCard('2706', true, true)[4];
        const i1 = b.indexOf('Через Новый год');
        const i2 = b.indexOf('Февральский');
        const i3 = b.indexOf('Сентябрьское');
        assertTrue(i1 < i2 && i2 < i3,
            'хронология инструктажей года: декабрь→февраль→сентябрь');
    });

    test('пустой год — «нет мероприятий за год»', () => {
        const host = cardHost([]);
        const b = host._renderWorkerCard('2706', true, true)[2];
        assertTrue(b.indexOf('Мероприятия · 2026') !== -1, 'заголовок года');
        assertTrue(b.indexOf('нет мероприятий за год') !== -1, 'пустое состояние');
    });

    test('попап шахматки — та же секция года (склеенная строка)', () => {
        const host = cardHost(TRS);
        const html = host._renderWorkerCard('2706', false);
        assertEqual(typeof html, 'string', 'попап — строка');
        assertTrue(html.indexOf('Мероприятия · 2026') !== -1,
            'секция года и в попапе');
        assertTrue(html.indexOf('Июньское') !== -1,
            'записи месяцев года в попапе (обучение — в мероприятиях)');
        // Task 405: инструктажи — своя секция в попапе
        assertTrue(
            html.indexOf('Повторные инструктажи и периодическая проверка знаний · 2026') !== -1,
            'секция инструктажей и в попапе');
        assertTrue(html.indexOf('Февральский') !== -1 &&
                   html.indexOf('Сентябрьское') !== -1,
            'инструктажи разных месяцев года в попапе');
    });
});

// ============================================================
// 4. VM — страница «Работники»: обёртка сетки + «Общая» (год)
// ============================================================
function pageHost(trainings) {
    const els = { wsWorkersBody: mkEl() };
    const EMPLOYEES = [
        { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
          'смена': '', 'должность': 'Мастер КИПиА', 'комментарий': '',
          'дата_приёма': '2007-03-06' },
        { 'таб_номер': '0377', 'ФИО': 'Первов С. А.', 'тип': 'сменный',
          'смена': 1, 'должность': 'Слесарь КИПиА', 'комментарий': '',
          'дата_приёма': '2025-01-20' },
    ];
    const host = new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_renderWorkersPage') + ',\n' +
        methodText(INDEX_SRC, '_renderWorkersGeneral') + ',\n' +
        methodText(INDEX_SRC, 'selectWorkersTab') + ',\n' +
        methodText(INDEX_SRC, '_isMasterKipia') + ',\n' +
        methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
        methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
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
        '_canEdit: true,' +
        '_year: 2026, _month: 9,' +
        '_EMPLOYEES: ' + JSON.stringify(EMPLOYEES) + ',' +
        '_VACATIONS: [],' +
        '_TRAININGS: ' + JSON.stringify(trainings || []) + ',' +
        '_PPE: [],' +
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
        '});')(mockDoc(els));
    return { host: host, els: els };
}

describe('Task 394 — VM: страница «Работники» — сетка и сводка', () => {

    test('вкладка работника — обёртка .ws-wgrid2 с 4 панелями', () => {
        const t = pageHost([]);
        t.host._renderWorkersPage();
        t.host.selectWorkersTab('2706');
        const body = t.els.wsWorkersBody.innerHTML;
        assertTrue(body.indexOf('<div class="ws-wgrid2">') !== -1,
            'панели — в обёртке сетки 2×2');
        assertEqual((body.match(/class="ws-wcard"/g) || []).length, 5,
            'в обёртке — ровно пять блоков-окон (Task 405)');
        // порядок блоков в DOM: профиль → отпуска → мероприятия →
        // инструктажи → СИЗ (Task 406)
        const i1 = body.indexOf('Галкин Д. Н.');
        const i2 = body.indexOf('Отпуска · 2026');
        const i3 = body.indexOf('Мероприятия · 2026');
        const i4 = body.indexOf('СИЗ · средства индивидуальной защиты');
        const i5 = body.indexOf(
            'Повторные инструктажи и периодическая проверка знаний · 2026');
        assertTrue(i1 !== -1 && i2 !== -1 && i3 !== -1 && i4 !== -1 &&
                   i5 !== -1 && i1 < i2 && i2 < i3 && i3 < i5 && i5 < i4,
            'DOM-порядок = раскладка (Task 406): профиль|отпуска|'
            + 'мероприятия / инструктажи / СИЗ');
    });

    test('«Общая» вкладка — БЕЗ обёртки сетки, колонка «Мероприятия · год»', () => {
        const trs = [
            { id: 41, 'таб_номер': '2706', 'тип': 'инструктаж', 'тема': 'А',
              'дата_начала': '2026-02-03', 'дата_окончания': '2026-02-03' },
            { id: 42, 'таб_номер': '2706', 'тип': 'обучение', 'тема': 'Б',
              'дата_начала': '2026-06-15', 'дата_окончания': '2026-06-15' },
            { id: 43, 'таб_номер': '2706', 'тип': 'инструктаж', 'тема': 'В',
              'дата_начала': '2026-09-07', 'дата_окончания': '2026-09-07' },
            { id: 44, 'таб_номер': '0377', 'тип': 'инструктаж', 'тема': 'Г',
              'дата_начала': '2026-09-08', 'дата_окончания': '2026-09-08' },
        ];
        const t = pageHost(trs);
        t.host._renderWorkersPage();
        const body = t.els.wsWorkersBody.innerHTML;
        assertFalse(body.indexOf('ws-wgrid2') !== -1,
            '«Общая» — без сетки карточки');
        // Task 445: колонки года «Мероприятия»/«Инструктажи» УДАЛЕНЫ
        assertTrue(body.indexOf('<th>Мероприятия · 2026</th>') === -1,
            'колонки «Мероприятия · 2026» больше нет (Task 445)');
        assertTrue(body.indexOf('<th>Инструктажи · 2026</th>') === -1,
            'колонки «Инструктажи · 2026» больше нет (Task 445)');
        // строка работника — РОВНО шесть ячеек (счётчики годовЫХ
        // записей не рендерятся)
        const i27 = body.indexOf('<tr><td>2706</td>');
        const row27 = body.slice(i27, body.indexOf('</tr>', i27));
        assertEqual((row27.match(/<td/g) || []).length, 6,
            'шесть ячеек: таб/ФИО/режим/должность/группа/приём (Task 445)');
    });
});

// ============================================================
// 5. VM — окно мероприятий месяца: отпуска + СИЗ
// ============================================================
function panelHost(opts) {
    const el = { innerHTML: '', hidden: true };
    const document = { getElementById: function(id) {
        return id === 'wsEventsPanel' ? el : null;
    }};
    const texts = ['_instrShortOf', '_normInstrKey',
                   '_renderMonthEventsPanel', '_trainingCodeOf', '_statusMeta']
        .map(n => methodText(INDEX_SRC, n));
    const make = new Function('localStorage', 'document', 'confirm',
                              'KipToast', 'kipConfirm',
        'return ({' + texts.join(',\n') + ',\n' +
        '_year: ' + (opts.year || 2026) + ', _month: ' + (opts.month || 9) + ',' +
        '_selDay: ' + (opts.selDay === undefined ? 'null' : opts.selDay) + ',' +
        '_TRAININGS: ' + JSON.stringify(opts.trainings || []) + ',' +
        '_VACATIONS: ' + JSON.stringify(opts.vacations || []) + ',' +
        '_PPE: ' + JSON.stringify(opts.ppe || []) + ',' +
        '_EMPLOYEES: ' + JSON.stringify(opts.employees || [
            { 'таб_номер': '0871', 'ФИО': 'Иванов Иван Иванович' }]) + ',' +
        '_STATUS_CODES: [],' +
        '_esc: function(s){ return String(s == null ? "" : s); },' +
        '_escAttr: function(s){ return String(s == null ? "" : s); },' +
        '_isoDate: function(dt){ var m=(""+(dt.getMonth()+1)).padStart(2,"0"); var d=(""+dt.getDate()).padStart(2,"0"); return dt.getFullYear()+"-"+m+"-"+d; }, _barExpSync: function() {},' +
        '});');
    const ctx = make(null, document, null, null, null);
    ctx._renderMonthEventsPanel();
    return el;
}

describe('Task 394 → 404 — VM: окно мероприятий — отпуска НЕ показываются', () => {

    // отпуск ЧАСТИЧНО на два месяца: 29.09–02.10
    const VAC2M = [
        { id: 21, 'таб_номер': '0871', 'часть': 1,
          'дата_начала': '2026-09-29', 'дата_окончания': '2026-10-02',
          'комментарий': '' },
    ];

    test('отпуск в месяце — секции «Отпуска» НЕТ (заявка Task 404)', () => {
        const el = panelHost({ month: 9, vacations: VAC2M });
        assertFalse(el.innerHTML.indexOf('Отпуска · ') !== -1,
            'секция «Отпуска» удалена из окна мероприятий');
        assertFalse(el.innerHTML.indexOf('Отпуск · Иванов Иван Иванович') !== -1,
            'строк отпусков нет');
        assertFalse(el.innerHTML.indexOf('ws-ep-dot-vac') !== -1,
            'точек отпусков нет');
        assertFalse(el.innerHTML.indexOf('29.09–02.10') !== -1,
            'диапазонов отпусков нет');
    });

    test('октябрь — тоже без отпусков; выбранный день, накрытый отпуском — тоже', () => {
        const el10 = panelHost({ month: 10, vacations: VAC2M });
        assertFalse(el10.innerHTML.indexOf('Отпуска · ') !== -1,
            'секции «Отпуска» нет и в следующем месяце');
        const vac = [
            { id: 22, 'таб_номер': '0871', 'часть': 1,
              'дата_начала': '2026-09-02', 'дата_окончания': '2026-09-05',
              'комментарий': '' },
        ];
        const el3 = panelHost({ month: 9, selDay: 3, vacations: vac });
        assertFalse(el3.innerHTML.indexOf('Отпуска · ') !== -1,
            'день 3 накрыт отпуском 02–05.09 — но секции нет (Task 404)');
    });
});

describe('Task 394 — VM: окно мероприятий — СИЗ', () => {

    const PPE = [
        { id: 1, 'таб_номер': '0871', 'наименование': 'Каска защитная',
          'дата_выдачи': '2025-09-17', 'срок_годности': '1 год',
          'дата_окончания': '2026-09-17', 'примечание': '' },
        { id: 2, 'таб_номер': '0871', 'наименование': 'Очки закрытые',
          'дата_выдачи': '', 'срок_годности': 'До износа',
          'дата_окончания': 'До износа', 'примечание': '' },
        { id: 3, 'таб_номер': '0871', 'наименование': 'Ботинки',
          'дата_выдачи': '2024-10-05', 'срок_годности': '2 года',
          'дата_окончания': '2026-10-05', 'примечание': '' },
    ];

    test('СИЗ с датой окончания в месяце — секция «СИЗ» (формат Task 520)', () => {
        const el = panelHost({ month: 9, ppe: PPE });
        assertTrue(el.innerHTML.indexOf('СИЗ · сентябрь 2026 · 1') !== -1,
            'секция «СИЗ» с месяцем и счётчиком');
        // Task 520: строка — «наименование · ФИО», БЕЗ «до дд.мм» и
        // БЕЗ префикса «СИЗ · » (просроченная каска дополнительно
        // попадает в новую группу — формат ниже в test-task520.js)
        assertTrue(el.innerHTML.indexOf('Каска защитная · Иванов Иван Иванович') !== -1,
            'текст: наименование · ФИО (Task 520)');
        assertFalse(el.innerHTML.indexOf('до 17.09') !== -1,
            'жирной даты «до 17.09» больше нет (Task 520)');
        assertFalse(el.innerHTML.indexOf('СИЗ · Каска') !== -1,
            'префикса «СИЗ · » в строке больше нет (Task 520)');
        assertTrue(el.innerHTML.indexOf('ws-ep-dot-ppe') !== -1,
            'точка СИЗ');
    });

    test('«До износа» и чужой месяц — не показываются (динамич. даты)', () => {
        // Task 520: новая группа «Просроченная выдача СИЗ» видна в
        // ЛЮБОМ месяце («за всё время») — фиксированные прошедшие
        // даты (сентябрь/октябрь 2026) стали бы «просроченными» и
        // ломали assertFalse. Приём Task 380: даты относительно
        // «сегодня» — «чужой месяц» = СЛЕДУЮЩИЙ (всегда будущий,
        // никогда не просрочен), открытый = текущий
        const NOW = new Date();
        const Y = NOW.getFullYear(), M = NOW.getMonth() + 1;
        const NX = (M === 12) ? { y: Y + 1, m: 1 } : { y: Y, m: M + 1 };
        const pad = function(n) { return (n < 10 ? '0' : '') + n; };
        const iso = function(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); };
        const monthsNom = ['январь','февраль','март','апрель','май','июнь',
                           'июль','август','сентябрь','октябрь','ноябрь','декабрь'];
        const ppe = [
            { id: 1, 'таб_номер': '0871', 'наименование': 'Каска защитная',
              'дата_выдачи': '2025-09-17', 'срок_годности': '1 год',
              'дата_окончания': iso(Y, M, 17), 'примечание': '' },
            { id: 2, 'таб_номер': '0871', 'наименование': 'Очки закрытые',
              'дата_выдачи': '', 'срок_годности': 'До износа',
              'дата_окончания': 'До износа', 'примечание': '' },
            { id: 3, 'таб_номер': '0871', 'наименование': 'Ботинки',
              'дата_выдачи': '2024-10-05', 'срок_годности': '2 года',
              'дата_окончания': iso(NX.y, NX.m, 5), 'примечание': '' },
        ];
        const el = panelHost({ year: Y, month: M, ppe: ppe });
        assertFalse(el.innerHTML.indexOf('Очки закрытые') !== -1,
            '«До износа» — без даты окончания, скрыто');
        assertFalse(el.innerHTML.indexOf('Ботинки') !== -1,
            'окончание в следующем месяце — в текущем скрыто (и не просрочено)');
        const elN = panelHost({ year: NX.y, month: NX.m, ppe: ppe });
        assertTrue(elN.innerHTML.indexOf(
            'СИЗ · ' + monthsNom[NX.m - 1] + ' ' + NX.y + ' · 1') !== -1,
            'следующий месяц — ботинки видны');
        assertTrue(elN.innerHTML.indexOf('Ботинки · Иванов Иван Иванович') !== -1,
            'формат строки: наименование · ФИО (Task 520)');
    });

    test('выбранный день — СИЗ, истекающие РОВНО в день', () => {
        // Task 520: фикстуры — СЛЕДУЮЩИЙ месяц (всегда будущий, не
        // просрочен): прошедшая каска ломала бы assertFalse ниже —
        // группа «Просроченная выдача СИЗ» не зависит от дня
        const NOW = new Date();
        const Y = NOW.getFullYear(), M = NOW.getMonth() + 1;
        const NX = (M === 12) ? { y: Y + 1, m: 1 } : { y: Y, m: M + 1 };
        const pad = function(n) { return (n < 10 ? '0' : '') + n; };
        const ppe = [{ 'таб_номер': '0871', 'наименование': 'Каска защитная',
                       'дата_окончания': NX.y + '-' + pad(NX.m) + '-17' }];
        const el5 = panelHost({ year: NX.y, month: NX.m, selDay: 17, ppe: ppe });
        assertTrue(el5.innerHTML.indexOf('СИЗ · 17.' + pad(NX.m) + ' · 1') !== -1,
            'день 17 = дата окончания каски');
        const el6 = panelHost({ year: NX.y, month: NX.m, selDay: 18, ppe: ppe });
        assertFalse(el6.innerHTML.indexOf('СИЗ · ') !== -1,
            'другой день — секция СИЗ скрыта (просрочки нет — будущее)');
    });

    test('прошедшие — класс ws-ep-past (динамические даты)', () => {
        // инвариант при любой дате запуска (приём Task 380):
        // «весь месяц» не прошедший; «первый день» — прошедший
        // iff 1-е число < сегодня
        const NOW = new Date();
        const Y = NOW.getFullYear(), M = NOW.getMonth() + 1;
        const pad = function(n) { return (n < 10 ? '0' : '') + n; };
        const iso = function(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); };
        const DIM = new Date(Y, M, 0).getDate();
        const vac = [
            { 'таб_номер': '0871', 'дата_начала': iso(Y, M, 1),
              'дата_окончания': iso(Y, M, DIM) },
            { 'таб_номер': '0871', 'дата_начала': iso(Y, M, 1),
              'дата_окончания': iso(Y, M, 1) },
        ];
        const ppe = [
            { 'таб_номер': '0871', 'наименование': 'Каска',
              'дата_окончания': iso(Y, M, DIM) },
            { 'таб_номер': '0871', 'наименование': 'Ботинки',
              'дата_окончания': iso(Y, M, 1) },
        ];
        const el = panelHost({ year: Y, month: M, vacations: vac, ppe: ppe });
        // «1-е число» — прошедшее iff 1-е < сегодня (в этом же месяце)
        const expPast = iso(Y, M, 1) < iso(Y, M, NOW.getDate());
        // Task 404: отпуска НЕ показываются — в окне только 2 строки
        // СИЗ; прошедшая из них — «1-го числа» iff 1-е < сегодня.
        // Task 520: БЕЗ ws-ep-past в новой группе просрочки (даты там
        // КРАСНЫЕ, не «выцветают») — nPast не меняется
        const nPast = (el.innerHTML.match(/ws-ep-past/g) || []).length;
        assertEqual(nPast, expPast ? 1 : 0,
            'классов ws-ep-past столько, сколько СИЗ с прошедшей датой (группа просрочки Task 520 — без past)');
        // Task 520: просроченная «1-го числа» ОСТАЁТСЯ в секции месяца
        // И попадает в группу «Просроченная выдача СИЗ» (+1 строка)
        assertEqual((el.innerHTML.match(/<span class="ws-ep-item/g) || []).length,
            expPast ? 3 : 2,
            'строки: 2 СИЗ месяца (+1 копия в группе просрочки iff просрочена — Task 520)');
        assertEqual(el.innerHTML.indexOf('Просроченная выдача СИЗ · 1') !== -1,
            expPast,
            'группа «Просроченная выдача СИЗ» — iff есть просроченная (Task 520)');
    });
});

describe('Task 394 — VM: окно мероприятий — порядок секций', () => {

    test('порядок: Мероприятия → СИЗ (отпуска убраны — Task 404)', () => {
        const el = panelHost({
            month: 9,
            trainings: [{ 'таб_номер': '0871', 'тип': 'инструктаж',
                          'тема': 'Повторный', 'дата_начала': '2026-09-05',
                          'дата_окончания': '2026-09-05' }],
            vacations: [{ 'таб_номер': '0871', 'дата_начала': '2026-09-10',
                          'дата_окончания': '2026-09-20' }],
            ppe: [{ 'таб_номер': '0871', 'наименование': 'Каска защитная',
                    'дата_окончания': '2026-09-25' }],
        });
        const iEv = el.innerHTML.indexOf('Мероприятия · сентябрь 2026');
        const iPpe = el.innerHTML.indexOf('СИЗ · сентябрь 2026');
        assertTrue(iEv !== -1 && iPpe !== -1, 'обе секции');
        assertTrue(iEv < iPpe, 'порядок: мероприятия → СИЗ');
        assertFalse(el.innerHTML.indexOf('Отпуска · сентябрь 2026') !== -1,
            'секции «Отпуска» нет (Task 404)');
    });

    test('мероприятия месяца — прежний вид (заголовок/счётчик)', () => {
        const el = panelHost({
            month: 9,
            trainings: [{ 'таб_номер': '0871', 'тип': 'инструктаж',
                          'тема': 'Повторный', 'дата_начала': '2026-09-05',
                          'дата_окончания': '2026-09-05' }],
        });
        assertTrue(el.innerHTML.indexOf('Мероприятия · сентябрь 2026 · 1') !== -1,
            'заголовок мероприятий не изменился (Task 315)');
        assertFalse(el.innerHTML.indexOf('Отпуска · ') !== -1,
            'отпусков нет — секция скрыта');
        assertFalse(el.innerHTML.indexOf('СИЗ · ') !== -1,
            'СИЗ нет — секция скрыта');
    });
});

// ============================================================
// 6. SW — версия поднята
// ============================================================
describe('Task 394 — SW', () => {

    test('SW: kipia-test-v745', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v745'") !== -1,
            'SWVersion bumped');
        assertTrue(SW_SRC.indexOf('kipia-test-v746') === -1,
            'двойного бампа не было');
    });
});
