// ============================================================
// Task 455 — заявка: «В разделе талоны, данные формирования
// отчёта должны быть в зависимости от того, на какой месяц
// открыта шахматка табеля».
//
// Реализация (полностью КЛИЕНТСКАЯ, index.html):
//   • _talonsMonthInfo — месяц отчёта = МЕСЯЦ ОТКРЫТОЙ ШАХМАТКИ
//     (this._year/_month — селекты месяца/года тулбара табеля);
//     сетка не инициализирована (deep link до init) — текущий
//     календарный (init открывает его же);
//   • _talonsRows — записи ВСЕГДА живая сетка _ENTRIES: кэш
//     _TALONS_CACHE, подтяжка _talonsFetchMonth и флаг
//     _talonsLoading УДАЛЕНЫ (отдельные запросы месяца не нужны);
//     мёртвое поле ready убрано из модели;
//   • экранная страница (шапка/подзаголовок), печать и
//     предпросмотр — месяц сетки (model.month);
//   • «Обновить данные» — ВСЕГДА refreshData сетки (месяц отчёта
//     = месяцу сетки, сравнение месяцев и сброс кэша удалены);
//   • мёртвый guard «Данные месяца ещё загружаются» печати
//     удалён (записи всегда живые).
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
const MONTH_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
                     'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
// прошлый/будущий месяцы с корректным переходом года
const PM = (NOWM > 1) ? NOWM - 1 : 12;            // прошлый месяц
const PMY = (NOWM > 1) ? NOWY : NOWY - 1;
const PMM = (PM < 10 ? '0' + PM : '' + PM);
const NM = (NOWM < 12) ? NOWM + 1 : 1;            // будущий месяц
const NMY = (NOWM < 12) ? NOWY : NOWY + 1;
const NMM = (NM < 10 ? '0' + NM : '' + NM);
const MM = (NOWM < 10 ? '0' + NOWM : '' + NOWM);

// Срез модуля WorkSchedule (имена методов неуникальны в монолите)
const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// ============================================================
// 1. SRC — месяц отчёта = месяц открытой шахматки
// ============================================================
describe('Task 455 — SRC: _talonsMonthInfo', () => {

    test('месяц отчёта — СЕЛЕКТЫ СЕТКИ (this._year/_month), фолбэк — текущий', () => {
        const fn = methodText(WS_SRC, '_talonsMonthInfo');
        assertTrue(fn.indexOf('var y = this._year, m = this._month;') !== -1,
            'месяц/год — из состояния шахматки');
        assertTrue(fn.indexOf('if (!y || !m)') !== -1 &&
                   fn.indexOf('var now = new Date()') !== -1,
            'сетка не инициализирована — текущий календарный (deep link до init)');
        // комментарий-ссылка на заявку — НАД методом (в тело не входит)
        const idx = WS_SRC.indexOf('_talonsMonthInfo: function(');
        assertTrue(WS_SRC.slice(Math.max(0, idx - 600), idx)
                       .indexOf('Task 455') !== -1,
            'комментарий-ссылка на заявку Task 455');
    });

    test('кэш/подтяжка/флаг загрузки УДАЛЕНЫ (упоминание — только в комментарии)', () => {
        // единственное упоминание — комментарий-документация поля
        // _talonsGridReady («кэш _TALONS_CACHE и подтяжка
        // _talonsFetchMonth УДАЛЕНЫ»)
        assertEqual(WS_SRC.split('_TALONS_CACHE').length - 1, 1,
            '_TALONS_CACHE: только комментарий-документация');
        assertEqual(WS_SRC.split('_talonsFetchMonth').length - 1, 1,
            '_talonsFetchMonth: только комментарий-документация');
        assertEqual(WS_SRC.indexOf('_talonsLoading'), -1,
            '_talonsLoading удалён полностью');
    });
});

describe('Task 455 — SRC: _talonsRows / _renderTalonsPage / talonsRefresh / печать', () => {

    test('_talonsRows: записи — ВСЕГДА живая сетка, модель без ready', () => {
        const fn = stripComments(methodText(WS_SRC, '_talonsRows'));
        assertTrue(fn.indexOf('var entries = this._ENTRIES;') !== -1,
            'записи — живая сетка (месяц отчёта = месяцу шахматки)');
        assertTrue(fn.indexOf('this._year === mi.y') === -1,
            'сравнение месяцев сетки/отчёта удалено (тавтология)');
        assertTrue(fn.indexOf('month: mi') !== -1,
            'модель несёт месяц (шапка/печать/предпросмотр)');
        assertTrue(fn.indexOf('ready') === -1,
            'мёртвое поле ready убрано из модели');
    });

    test('_renderTalonsPage: подзаголовок — «за месяц, открытый в шахматке»', () => {
        const fn = methodText(WS_SRC, '_renderTalonsPage');
        assertTrue(fn.indexOf('за месяц, открытый в шахматке табеля') !== -1,
            'подзаголовок объясняет источник месяца (Task 455)');
        assertTrue(fn.indexOf('за текущий месяц') === -1,
            'старой формулировки нет');
        assertTrue(fn.indexOf('_talonsFetchMonth') === -1,
            'подтяжки месяца из рендера нет');
    });

    test('talonsRefresh: ВСЕГДА refreshData — без сравнения месяцев и кэша', () => {
        const fn = stripComments(methodText(WS_SRC, 'talonsRefresh'));
        assertTrue(fn.indexOf("typeof this.refreshData === 'function'") !== -1 &&
                   fn.indexOf('this.refreshData();') !== -1,
            'перечитать сетку (её месяц и есть месяц отчёта)');
        assertTrue(fn.indexOf('this._year') === -1 &&
                   fn.indexOf('_TALONS_CACHE') === -1,
            'ветки сравнения месяцев и сброса кэша удалены');
    });

    test('printTalonsReport: мёртвый guard готовности удалён', () => {
        const fn = stripComments(methodText(WS_SRC, 'printTalonsReport'));
        assertTrue(fn.indexOf('model.ready') === -1,
            'guard «Данные месяца ещё загружаются» удалён (записи всегда живые)');
        assertTrue(fn.indexOf('Нет работников для отчёта') !== -1,
            'живой guard пустого списка остался');
    });
});

// ============================================================
// 2. VM — _talonsMonthInfo: месяц сетки + фолбэк
// ============================================================
describe('Task 455 — VM: _talonsMonthInfo', () => {

    const host = () => new Function('return ({' +
        methodText(WS_SRC, '_talonsMonthInfo') + ',\n' +
        '});')();

    test('сетка не инициализирована — текущий календарный (фолбэк)', () => {
        const h = host();
        const mi = h._talonsMonthInfo();
        assertEqual(mi.y, NOWY, 'фолбэк: год — текущий');
        assertEqual(mi.m, NOWM, 'фолбэк: месяц — текущий');
        assertEqual(mi.name, MONTH_NAMES[NOWM - 1], 'фолбэк: имя месяца (нижний регистр)');
    });

    test('сетка на ПРОШЛОМ месяце — отчёт следует за ней', () => {
        const h = host();
        h._year = PMY; h._month = PM;
        const mi = h._talonsMonthInfo();
        assertEqual(mi.y, PMY, 'год — месяц сетки (с переходом года, если январь)');
        assertEqual(mi.m, PM, 'месяц — месяц сетки');
        assertEqual(mi.name, MONTH_NAMES[PM - 1], 'имя — месяц сетки');
    });

    test('сетка на БУДУЩЕМ месяце — отчёт следует за ней', () => {
        const h = host();
        h._year = NMY; h._month = NM;
        const mi = h._talonsMonthInfo();
        assertEqual(mi.y, NMY, 'год — будущий месяц сетки');
        assertEqual(mi.m, NM, 'месяц — будущий месяц сетки');
        assertEqual(mi.name, MONTH_NAMES[NM - 1], 'имя — будущий месяц');
    });

    test('январь (m=1) — валидный месяц сетки (не falsy)', () => {
        const h = host();
        h._year = 2025; h._month = 1;
        const mi = h._talonsMonthInfo();
        assertEqual(mi.y, 2025, 'январь: год сетки');
        assertEqual(mi.m, 1, 'январь: месяц 1 НЕ отброшен фолбэком');
        assertEqual(mi.name, 'январь', 'январь: имя');
    });
});

// ============================================================
// 3. VM — _talonsRows: живые записи месяца сетки
// ============================================================
describe('Task 455 — VM: _talonsRows (месяц сетки)', () => {

    const EMP = [
        { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
          'должность': 'Слесарь КИПиА' },
        { 'таб_номер': '031', 'ФИО': 'Сидоров С. С.', 'тип': 'сменный',
          'должность': 'Электрик' }
    ];

    function rowsHost(opts) {
        opts = opts || {};
        return new Function('return ({' +
            methodText(WS_SRC, '_talonsMonthInfo') + ',\n' +
            methodText(WS_SRC, '_talonsEffectiveEntries') + ',\n' +
            methodText(WS_SRC, '_talonsRows') + ',\n' +
            methodText(WS_SRC, '_talonsAgg') + ',\n' +
            methodText(WS_SRC, '_empTypeMap') + ',\n' +
            methodText(WS_SRC, '_codeHours') + ',\n' +
            methodText(WS_SRC, '_overHours') + ',\n' +
            methodText(WS_SRC, '_statusMeta') + ',\n' +
            '_EMPLOYEES: ' + JSON.stringify(opts.employees || EMP) + ',' +
            '_ENTRIES: ' + JSON.stringify(opts.entries || []) + ',' +
            '_PENDING: ' + JSON.stringify(opts.pending || {}) + ',' +
            '_TALONS_EDIT: ' + JSON.stringify(opts.edits || {}) + ',' +
            '_year: ' + (opts.year !== undefined ? opts.year : PMY) + ',' +
            '_month: ' + (opts.month !== undefined ? opts.month : PM) + ',' +
            '_STATUS_CODES: [],' +
            '});')();
    }

    test('сетка на прошлом месяце: модель НЕСЁТ его, строки — по записям сетки', () => {
        const entries = [
            { 'дата': PMY + '-' + PMM + '-02', 'таб_номер': '017', 'статус': 'Д8' },
            { 'дата': PMY + '-' + PMM + '-03', 'таб_номер': '017', 'статус': 'Д8' },
            { 'дата': PMY + '-' + PMM + '-04', 'таб_номер': '031', 'статус': 'Д' }
        ];
        const h = rowsHost({ entries: entries });
        const m = h._talonsRows();
        assertEqual(m.month.y, PMY, 'модель: год месяца сетки');
        assertEqual(m.month.m, PM, 'модель: месяц сетки');
        assertEqual(m.month.name, MONTH_NAMES[PM - 1], 'модель: имя месяца сетки');
        assertFalse(Object.prototype.hasOwnProperty.call(m, 'ready'),
            'поля ready в модели больше нет');
        const iv = m.rows[0]; // Иванов < Сидоров по алфавиту
        assertEqual(iv.days, 2, 'Иванов: 2 явки Д8 прошлого месяца');
        assertEqual(iv.t8, 2, 'Иванов: 8ч талоны = явкам (Task 452: 8 ч → 8ч)');
        const sid = m.rows[1];
        assertEqual(sid.days, 1, 'Сидоров: 1 явка Д');
        assertEqual(sid.t12, 1, 'Сидоров: 12ч талон (12 ч → 12ч, Task 452)');
        assertEqual(m.totals.t12, 1, 'итого 12ч — по записям месяца сетки');
        assertEqual(m.totals.t8, 2, 'итого 8ч — по записям месяца сетки');
    });

    test('правки _PENDING ТЕКУЩЕГО месяца в отчёт прошлого НЕ попадают', () => {
        const pend = {};
        // правка дня ТЕКУЩЕГО месяца (без записи) — мимо отчёта
        pend[NOWY + '-' + MM + '-05|017'] = { 'статус': 'Д8' };
        // правка дня МЕСЯЦА СЕТКИ (без записи) — учитывается
        pend[PMY + '-' + PMM + '-05|031'] = { 'статус': 'Д8' };
        const h = rowsHost({
            entries: [{ 'дата': PMY + '-' + PMM + '-02', 'таб_номер': '017',
                        'статус': 'Д8' }],
            pending: pend
        });
        const m = h._talonsRows();
        const iv = m.rows[0];
        const sid = m.rows[1];
        assertEqual(iv.days, 1, 'Иванов: только запись месяца сетки (правка текущего — мимо)');
        assertEqual(sid.days, 1, 'Сидоров: правка дня месяца сетки учтена');
        assertEqual(sid.t8, 1, 'Сидоров: Д8 → 8ч талон из правки');
    });

    test('строки по ВСЕМ работникам, правки талонов живут поверх месяца сетки', () => {
        const h = rowsHost({
            entries: [{ 'дата': PMY + '-' + PMM + '-02', 'таб_номер': '017',
                        'статус': 'Д8' }],
            edits: { '017': { t8: 5 } }
        });
        const m = h._talonsRows();
        assertEqual(m.rows.length, 2, 'строка на каждого работника (0 явок — тоже)');
        assertEqual(m.rows[0].t8, 5, 'правка категории перекрывает авто (Task 451)');
        assertTrue(m.rows[0].edited, 'строка помечена правленной');
        assertEqual(m.totals.edited, 1, 'правка в итогах');
    });
});

// ============================================================
// 4. VM — talonsRefresh: всегда refreshData
// ============================================================
describe('Task 455 — VM: talonsRefresh', () => {

    const refreshHost = () => new Function('return ({' +
        methodText(WS_SRC, 'talonsRefresh') + ',\n' +
        '_renderTalonsPage: function() { this._renderCalls = (this._renderCalls || 0) + 1; },' +
        'refreshData: function() { this._refreshCalls = (this._refreshCalls || 0) + 1; },' +
        '_year: ' + NOWY + ', _month: ' + NOWM + ',' +
        '});')();

    test('текущий месяц сетки — refreshData', () => {
        const h = refreshHost();
        h.talonsRefresh();
        assertEqual(h._refreshCalls, 1, 'перечитали сетку');
        assertEqual(h._renderCalls || 0, 0, 'прямой ре-рендер не нужен');
    });

    test('другой месяц сетки — ТОЖЕ refreshData (кэша больше нет)', () => {
        const h = refreshHost();
        h._year = PMY; h._month = PM;
        h.talonsRefresh();
        assertEqual(h._refreshCalls, 1,
            'месяц отчёта = месяцу сетки — снова refreshData, БЕЗ сброса кэша');
        assertEqual(h._renderCalls || 0, 0, 'прямой ре-рендер не нужен');
    });

    test('без refreshData (тестовый хост) — прямой ре-рендер страницы', () => {
        const h = new Function('return ({' +
            methodText(WS_SRC, 'talonsRefresh') + ',\n' +
            '_renderTalonsPage: function() { this._renderCalls = (this._renderCalls || 0) + 1; },' +
            '});')();
        h.talonsRefresh();
        assertEqual(h._renderCalls, 1, 'фолбэк — ре-рендер');
    });
});

// ============================================================
// 5. VM — рендер и печать: месяц сетки в шапке/форме
// ============================================================
describe('Task 455 — VM: _renderTalonsPage / печать (месяц сетки)', () => {

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

    function pageHost() {
        const elements = {};
        const body = makeEl('div');
        body.id = 'wsTalonsBody';
        elements['wsTalonsBody'] = body;
        const doc = {
            createElement: makeEl,
            getElementById: function(id) { return elements[id] || null; }
        };
        const h = new Function('document', 'return ({' +
            methodText(WS_SRC, '_talonsMonthInfo') + ',\n' +
            methodText(WS_SRC, '_talonsEffectiveEntries') + ',\n' +
            methodText(WS_SRC, '_talonsRows') + ',\n' +
            methodText(WS_SRC, '_talonsAgg') + ',\n' +
            methodText(WS_SRC, '_empTypeMap') + ',\n' +
            methodText(WS_SRC, '_renderTalonsPage') + ',\n' +
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
            '_TALONS_PRINT_CSS: ".wst-rep-table {}",' +
            '_codeHours: function(c) { return ({ "Д": 12, "Н": 12, "Д8": 8 })[c] || 0; },' +
            '_overHours: function() { return 0; },' +
            '_statusMeta: function() { return null; },' +
            '_esc: function(s) { return String(s); },' +
            "_escAttr: function(s) { return String(s); }," +
            '_closePrintPreview: function() {},' +
            '_EMPLOYEES: [{ "таб_номер": "017", "ФИО": "Иванов И. И.", "тип": "дневной", "должность": "Слесарь КИПиА" }],' +
            '_ENTRIES: ' + JSON.stringify([
                { 'дата': PMY + '-' + PMM + '-02', 'таб_номер': '017', 'статус': 'Д8' },
                { 'дата': PMY + '-' + PMM + '-03', 'таб_номер': '017', 'статус': 'Д' },
                { 'дата': PMY + '-' + PMM + '-04', 'таб_номер': '017', 'статус': 'Д8' }]) + ',' +
            '_PENDING: {}, _TALONS_EDIT: {},' +
            '_year: ' + PMY + ', _month: ' + PM + ',' +
            '_viewLevel: "edit", _canEdit: true,' +
            '_initialized: true, _talonsGridReady: true,' +
            '_STATUS_CODES: [],' +
            '});')(doc);
        return { h: h, doc: doc, body: body, elements: elements };
    }

    test('экранная страница: шапка и данные — месяц сетки (прошлый)', () => {
        const t = pageHost();
        t.h._renderTalonsPage();
        const html = t.body.innerHTML;
        assertTrue(html.indexOf('Отчёт по талонам питания — ' +
                    MONTH_NAMES[PM - 1] + ' ' + PMY + ' г.') !== -1,
            'шапка — месяц ОТКРЫТОЙ шахматки, не текущий');
        assertTrue(html.indexOf('за месяц, открытый в шахматке табеля') !== -1,
            'подзаголовок поясняет источник месяца');
        assertTrue(html.indexOf('flow-loading') === -1,
            'никакой загрузки — записи сетки уже живые');
        assertTrue(html.indexOf('value="1"') !== -1 &&
                   html.indexOf('value="2"') !== -1,
            'талоны по явкам месяца сетки (Д → 1×12ч, Д8×2 → 2×8ч)');
    });

    test('печать: строгая форма — «за <месяц сетки> <год сетки> г.»', () => {
        const t = pageHost();
        const model = t.h._talonsRows();
        const html = t.h._buildTalonsPrintHtml(model);
        assertTrue(html.indexOf('за ' + MONTH_NAMES[PM - 1] + ' ' + PMY + ' г.') !== -1,
            'период формы — месяц открытой шахматки');
        assertTrue(html.indexOf('за ' + MONTH_NAMES[NOWM - 1]) === -1,
            'текущий месяц в форме НЕ упомянут (сетка на другом)');
        assertTrue(html.indexOf('>16</td>') !== -1 &&
                   html.indexOf('>12</td>') !== -1,
            'часы = талоны × 12/8 по записям месяца сетки (2×8 + 1×12)');
    });

    test('standalone-документ предпросмотра: title — месяц сетки', () => {
        const t = pageHost();
        const html = t.h._buildTalonsFileHtml('<div class="wst-rep">X</div>');
        assertTrue(html.indexOf(MONTH_NAMES[PM - 1] + ' ' + PMY) !== -1,
            '<title> — месяц сетки');
    });
});

// ============================================================
// 6. SW — версия кэша
// ============================================================
describe('Task 455 — SW', () => {
    test('SW: кэш поднят до kipia-test-v757 (Task 455)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v757'") !== -1,
            'CACHE_VERSION = kipia-test-v757');
        assertTrue(SW_SRC.indexOf('kipia-test-v758') === -1,
            'kipia-test-v757 не существует');
        assertTrue(SW_SRC.indexOf('Task 455') !== -1,
            'комментарий Task 455 в истории версий');
    });
});
