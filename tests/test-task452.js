// ============================================================
// Task 452 — заявка: «В разделе талоны, дни переработки должны
// учитываться при учёте количества дней явки и соответственно
// количества выданных талонов. Есть замечание по учёту талонов,
// у Чиркова в сентябре 2026 года стоят шесть 12 часовых смен, а
// в отчёте они не учлись, в отличии от итогов учёта в табеле
// сдесь необходимо разделятьрабочие дни по талонам, 7,2 и 8 это
// 8 часовые талоны, 12 это 12 часовые талоны.»
//
// Реализация (полностью КЛИЕНТСКАЯ, index.html):
//   • НОВЫЙ _talonsAgg — агрегация месяца ДЛЯ ТАЛОНОВ,
//     ПО-ДНЁВНАЯ классификация: КАЖДАЯ запись = один день; часы
//     дня → категория талона (12 ч и больше → 12-часовой талон,
//     меньше 12 (7,2/8/…) → 8-часовой);
//   • ПЕРЕРАБОТКА — коды «д»/«н» (работа в вых./праздник) —
//     УЧИТЫВАЕТСЯ и в днях явки, и в талонах (в отличие от
//     _totalsAgg табеля, где переработка идёт отдельной строкой
//     и в явки не попадает): часы _overHours (сменному — 12,
//     дневному — из правки ячейки «часы», иначе фолбэк 8);
//   • _talonsRows: авто t12/t8 — из счётчиков дней _talonsAgg,
//     тип работника («сменный»/«дневной») категорию НЕ
//     определяет (замечание: у Чиркова шесть 12-часовых смен не
//     учлись — дневному с 12-часовыми днями теперь 12ч талоны);
//     «Дней явки» строки — дни с часами ВКЛЮЧАЯ переработку;
//   • подсказка страницы переписана (дни месяца + переработка);
//   • печать/правки/итоги/сортировка (Task 447–451) не тронуты.
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
const D = (md) => (NOWY + '-' + md);
// Срез модуля WorkSchedule (имена методов неуникальны в монолите)
const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// ============================================================
// 1. SRC — _talonsAgg: классификация дней + переработка
// ============================================================
describe('Task 452 — SRC: _talonsAgg / _talonsRows', () => {

    test('_talonsAgg: часы дня → категория талона (7,2/8 → 8ч, 12 → 12ч)', () => {
        const fn = stripComments(methodText(WS_SRC, '_talonsAgg'));
        assertTrue(fn.indexOf("if (code === 'д' || code === 'н')") !== -1 &&
                   fn.indexOf('h = this._overHours(e, types);') !== -1,
            'переработка «д»/«н» — часы _overHours (учитывается — заявка)');
        assertTrue(fn.indexOf("h = this._codeHours(code, meta ? meta.name : '');") !== -1,
            'рабочие коды — часы кода (Д/Н = 12, Д8 = 8, Д7,2 = 7,2)');
        assertTrue(fn.indexOf('if (h >= 12) a.t12++; else a.t8++;') !== -1,
            '12 ч и больше — 12ч талон, меньше (7,2/8) — 8ч талон (заявка)');
        assertTrue(fn.indexOf('a.days++;') !== -1,
            'каждый день с часами — день явки (переработка включена)');
        assertTrue(fn.indexOf('{ days: 0, t12: 0, t8: 0 }') !== -1,
            'счётчики строки — days/t12/t8');
        assertTrue(fn.indexOf('if (!tab) continue;') !== -1,
            'записи без табельного пропускаются');
    });

    test('_talonsRows: авто из _talonsAgg, тип работника НЕ определяет категорию', () => {
        const fn = stripComments(methodText(WS_SRC, '_talonsRows'));
        assertTrue(fn.indexOf('this._talonsAgg(eff, this._empTypeMap(this._EMPLOYEES))') !== -1,
            'агрегация — ПО-ДНЁВНАЯ _talonsAgg (не итоги табеля)');
        assertTrue(fn.indexOf('_totalsAgg') === -1,
            'итоги табеля (_totalsAgg) больше не источник талонов');
        assertTrue(fn.indexOf('var days = a ? a.days : 0;') !== -1 &&
                   fn.indexOf('var auto12 = a ? a.t12 : 0;') !== -1 &&
                   fn.indexOf('var auto8 = a ? a.t8 : 0;') !== -1,
            'дни и авто-категории — из счётчиков дней');
        assertTrue(fn.indexOf('is12') === -1 && fn.indexOf("'сменный'") === -1,
            'признака «сменный» в авто-подсчёте больше нет (заявка)');
    });

    test('подсказка страницы: дни месяца + переработка (прежняя — убрана)', () => {
        const fn = methodText(WS_SRC, '_renderTalonsPage');
        assertTrue(fn.indexOf('дни переработки (д/н) учитываются') !== -1,
            'подсказка: дни переработки учитываются');
        assertTrue(fn.indexOf('смена 7,2/8 ч — 8 ч. талон, смена 12 ч — 12 ч. талон') !== -1,
            'подсказка: классификация дней по талонам (заявка)');
        assertTrue(fn.indexOf('по дням явки сменным') === -1,
            'прежняя формулировка «по явкам сменным/дневным» убрана');
    });
});

// ============================================================
// 2. VM — _talonsAgg: классификация записей месяца
// ============================================================
describe('Task 452 — VM: _talonsAgg', () => {

    function aggHost(opts) {
        opts = opts || {};
        return new Function('return ({' +
            methodText(WS_SRC, '_talonsAgg') + ',\n' +
            methodText(WS_SRC, '_empTypeMap') + ',\n' +
            methodText(WS_SRC, '_codeHours') + ',\n' +
            methodText(WS_SRC, '_overHours') + ',\n' +
            methodText(WS_SRC, '_statusMeta') + ',\n' +
            '_STATUS_CODES: ' + JSON.stringify(opts.statusCodes || []) + ',' +
            '});')();
    }

    test('замечание пользователя: дневной с 6× Д — 6 талонов 12ч (учлись!)', () => {
        const h = aggHost();
        const entries = [];
        for (let i = 1; i <= 6; i++) {
            entries.push({ 'дата': D(MM + '-0' + i), 'таб_номер': '100', 'статус': 'Д' });
        }
        const agg = h._talonsAgg(entries,
            h._empTypeMap([{ 'таб_номер': '100', 'тип': 'дневной' }]));
        const a = agg.byTab['100'];
        assertEqual(a.days, 6, 'дней явки — 6');
        assertEqual(a.t12, 6, '12-часовых талонов — 6 (смена 12 ч — заявка)');
        assertEqual(a.t8, 0, '8-часовых — 0');
    });

    test('переработка «д» у дневного — дни и талоны по часам правки', () => {
        const h = aggHost();
        const agg = h._talonsAgg([
            { 'дата': '2026-09-05', 'таб_номер': '100', 'статус': 'д', 'часы': 12 },
            { 'дата': '2026-09-06', 'таб_номер': '100', 'статус': 'д', 'часы': 8 },
            { 'дата': '2026-09-12', 'таб_номер': '100', 'статус': 'д', 'часы': '7,2' }
        ], h._empTypeMap([{ 'таб_номер': '100', 'тип': 'дневной' }]));
        const a = agg.byTab['100'];
        assertEqual(a.days, 3, 'три дня переработки — дни явки (заявка)');
        assertEqual(a.t12, 1, '12 часов — 12ч талон');
        assertEqual(a.t8, 2, '8 и «7,2» (строкой) — 8ч талоны');
    });

    test('переработка без поля «часы» — фолбэк 8 ч → 8ч талон', () => {
        const h = aggHost();
        const agg = h._talonsAgg([
            { 'дата': '2026-09-05', 'таб_номер': '100', 'статус': 'н' }
        ], h._empTypeMap([{ 'таб_номер': '100', 'тип': 'дневной' }]));
        assertEqual(agg.byTab['100'].days, 1, 'день учтён (старые записи)');
        assertEqual(agg.byTab['100'].t8, 1, 'без часов — 8 ч → 8ч талон');
    });

    test('переработка у СМЕННОГО — всегда 12 ч → 12ч талон', () => {
        const h = aggHost();
        const agg = h._talonsAgg([
            { 'дата': '2026-09-05', 'таб_номер': '100', 'статус': 'д', 'часы': 8 }
        ], h._empTypeMap([{ 'таб_номер': '100', 'тип': 'сменный' }]));
        assertEqual(agg.byTab['100'].t12, 1,
            'сменному переработка — 12 ч (часы правки игнорируются)');
    });

    test('«7,2 и 8 это 8 часовые талоны»: Д8/Д7,2 → t8, Д → t12', () => {
        const h = aggHost();
        const agg = h._talonsAgg([
            { 'дата': '2026-09-01', 'таб_номер': '100', 'статус': 'Д8' },
            { 'дата': '2026-09-02', 'таб_номер': '100', 'статус': 'Д7,2' },
            { 'дата': '2026-09-03', 'таб_номер': '100', 'статус': 'Д' }
        ], {});
        const a = agg.byTab['100'];
        assertEqual(a.t8, 2, 'Д8 и Д7,2 — два 8-часовых талона');
        assertEqual(a.t12, 1, 'Д (12 ч) — один 12-часовой');
        assertEqual(a.days, 3, 'дней — 3');
    });

    test('неявки и мероприятия — НЕ дни талонов', () => {
        const h = aggHost();
        const agg = h._talonsAgg([
            { 'дата': '2026-09-01', 'таб_номер': '100', 'статус': 'ОТ' },
            { 'дата': '2026-09-02', 'таб_номер': '100', 'статус': 'Б' },
            { 'дата': '2026-09-03', 'таб_номер': '100', 'статус': 'И' },
            { 'дата': '2026-09-04', 'таб_номер': '100', 'статус': '.' },
            { 'дата': '2026-09-05', 'таб_номер': '100', 'статус': '' }
        ], {});
        const a = agg.byTab['100'];
        assertEqual(a.days, 0, 'ни одного дня явки');
        assertEqual(a.t12 + a.t8, 0, 'талонов нет');
    });

    test('незнакомый код с «NN-час» в имени — часы из имени (10 ч → 8ч)', () => {
        const h = aggHost({ statusCodes: [
            { code: 'ХЗ', name: 'Смена (10-час)', color: '#fff' }] });
        const agg = h._talonsAgg([
            { 'дата': '2026-09-01', 'таб_номер': '100', 'статус': 'ХЗ' }
        ], {});
        assertEqual(agg.byTab['100'].days, 1, 'день учтён');
        assertEqual(agg.byTab['100'].t8, 1, '10 часов (меньше 12) — 8ч талон');
    });
});

// ============================================================
// 3. VM — _talonsRows: модель по дням + расхождение с табелем
// ============================================================
describe('Task 452 — VM: _talonsRows по дням', () => {

    const EMP = [
        { 'таб_номер': '100', 'ФИО': 'Чирков В. А.', 'тип': 'дневной',
          'должность': 'Слесарь КИПиА 5 разряда' },
        { 'таб_номер': '024', 'ФИО': 'Гусев Г. Г.', 'тип': 'сменный',
          'должность': 'Электромонтёр' }
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
            '_year: ' + NOWY + ', _month: ' + NOWM + ',' +
            '_STATUS_CODES: [],' +
            '});')();
    }

    // строка по табельному (алфавитная сортировка перемешивает
    // порядок — ищем по ключу, не по индексу)
    const byTab = function(m, tab) {
        for (let i = 0; i < m.rows.length; i++) {
            if (m.rows[i].tab === tab) return m.rows[i];
        }
        return null;
    };

    // смена Чиркова (замечание пользователя): 6× Д + 2× д(12 ч)
    // + 3× Д8 — дневной с 12-часовыми днями
    const CHIRKOV_ENTRIES = [
        { 'дата': D(MM + '-01'), 'таб_номер': '100', 'статус': 'Д' },
        { 'дата': D(MM + '-02'), 'таб_номер': '100', 'статус': 'Д' },
        { 'дата': D(MM + '-03'), 'таб_номер': '100', 'статус': 'Д' },
        { 'дата': D(MM + '-04'), 'таб_номер': '100', 'статус': 'Д' },
        { 'дата': D(MM + '-05'), 'таб_номер': '100', 'статус': 'Д' },
        { 'дата': D(MM + '-06'), 'таб_номер': '100', 'статус': 'Д' },
        { 'дата': D(MM + '-07'), 'таб_номер': '100', 'статус': 'д', 'часы': 12 },
        { 'дата': D(MM + '-08'), 'таб_номер': '100', 'статус': 'д', 'часы': 12 },
        { 'дата': D(MM + '-09'), 'таб_номер': '100', 'статус': 'Д8' },
        { 'дата': D(MM + '-10'), 'таб_номер': '100', 'статус': 'Д8' },
        { 'дата': D(MM + '-11'), 'таб_номер': '100', 'статус': 'Д8' }
    ];

    test('Чирков-сценарий: авто по дням, переработка в днях явки', () => {
        const h = rowsHost({ entries: CHIRKOV_ENTRIES });
        const m = h._talonsRows();
        const ch = byTab(m, '100');
        assertEqual(ch.days, 11, 'дней явки — 11, ПЕРЕРАБОТКА (2× д) учтена');
        assertEqual(ch.auto12, 8, 'авто 12ч = 8 (шесть Д + два д по 12 ч)');
        assertEqual(ch.auto8, 3, 'авто 8ч = 3 (три Д8)');
        assertEqual(ch.t12, 8, 'талоны 12ч — 8 (смени «учлись» — заявка)');
        assertEqual(ch.t8, 3, 'талоны 8ч — 3');
        assertEqual(m.totals.t12, 8, 'итог 12ч = 8');
        assertEqual(m.totals.t8, 3, 'итог 8ч = 3');
        assertFalse(ch.edited, 'без правок — чистое авто по дням');
    });

    test('правка категории по-прежнему перекрывает авто дней', () => {
        const h = rowsHost({ entries: CHIRKOV_ENTRIES,
            edits: { '100': { t12: 5 } } });
        const m = h._talonsRows();
        const ch = byTab(m, '100');
        assertEqual(ch.t12, 5, 'правка 12ч = 5 (авто было 8)');
        assertTrue(ch.edited12, 'правка 12ч помечена');
        assertFalse(ch.edited8, '8ч — не тронута (авто 3)');
        assertEqual(m.totals.t12, 5, 'итог 12ч = 5 (правка)');
        assertEqual(m.totals.t8, 3, 'итог 8ч = 3 (авто)');
        assertEqual(m.totals.edited, 1, 'одна правка');
    });

    test('в отличие от табеля: _totalsAgg — переработка отдельно, _talonsAgg — в днях', () => {
        const h = new Function('return ({' +
            methodText(WS_SRC, '_talonsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsZero') + ',\n' +
            methodText(WS_SRC, '_empTypeMap') + ',\n' +
            methodText(WS_SRC, '_codeHours') + ',\n' +
            methodText(WS_SRC, '_overHours') + ',\n' +
            methodText(WS_SRC, '_statusMeta') + ',\n' +
            '_STATUS_CODES: [],' +
            '});')();
        const entries = [
            { 'дата': '2026-09-01', 'таб_номер': '100', 'статус': 'Д8' },
            { 'дата': '2026-09-02', 'таб_номер': '100', 'статус': 'д', 'часы': 12 }
        ];
        const types = h._empTypeMap([{ 'таб_номер': '100', 'тип': 'дневной' }]);
        const tt = h._totalsAgg(entries, types).byTab['100'];
        const tl = h._talonsAgg(entries, types).byTab['100'];
        assertEqual(tt.work, 1, 'ТАБЕЛЬ: явка — 1 (переработка НЕ явка)');
        assertEqual(tt.overDays, 1, 'ТАБЕЛЬ: переработка — отдельный счётчик');
        assertEqual(tt.hours, 8, 'ТАБЕЛЬ: часы — 8 (без переработки)');
        assertEqual(tl.days, 2, 'ТАЛОНЫ: дней — 2 (переработка учтена — заявка)');
        assertEqual(tl.t12, 1, 'ТАЛОНЫ: 12 ч переработки — 12ч талон');
        assertEqual(tl.t8, 1, 'ТАЛОНЫ: Д8 — 8ч талон');
    });
});

// ============================================================
// 4. VM — печать: обе группы по дням (без правок)
// ============================================================
describe('Task 452 — VM: печатная форма по дням', () => {

    function printHost(employees, entries, edits) {
        return new Function('return ({' +
            methodText(WS_SRC, '_talonsMonthInfo') + ',\n' +
            methodText(WS_SRC, '_talonsEffectiveEntries') + ',\n' +
            methodText(WS_SRC, '_talonsRows') + ',\n' +
            methodText(WS_SRC, '_talonsAgg') + ',\n' +
            methodText(WS_SRC, '_empTypeMap') + ',\n' +
            methodText(WS_SRC, '_codeHours') + ',\n' +
            methodText(WS_SRC, '_overHours') + ',\n' +
            methodText(WS_SRC, '_statusMeta') + ',\n' +
            methodText(WS_SRC, '_buildTalonsPrintHtml') + ',\n' +
            methodText(WS_SRC, '_talonsColgroup') + ',\n' +
            methodText(WS_SRC, '_talonsTextWidth') + ',\n' +
            methodText(WS_SRC, '_talonsPosition') + ',\n' +
            methodText(WS_SRC, '_talonsSignBlock') + ',\n' +
            '_esc: function(s) { return String(s); },' +
            '_EMPLOYEES: ' + JSON.stringify(employees) + ',' +
            '_ENTRIES: ' + JSON.stringify(entries) + ',' +
            '_PENDING: {},' +
            '_TALONS_EDIT: ' + JSON.stringify(edits || {}) + ',' +
            '_year: ' + NOWY + ', _month: ' + NOWM + ',' +
            '_STATUS_CODES: [],' +
            '});')();
    }

    const CHIRKOV = [
        { 'таб_номер': '100', 'ФИО': 'Чирков В. А.', 'тип': 'дневной',
          'должность': 'Слесарь КИПиА 5 разряда' }
    ];
    const CHIRKOV_ENTRIES = [
        { 'дата': D(MM + '-01'), 'таб_номер': '100', 'статус': 'Д' },
        { 'дата': D(MM + '-02'), 'таб_номер': '100', 'статус': 'Д' },
        { 'дата': D(MM + '-03'), 'таб_номер': '100', 'статус': 'Д' },
        { 'дата': D(MM + '-04'), 'таб_номер': '100', 'статус': 'Д' },
        { 'дата': D(MM + '-05'), 'таб_номер': '100', 'статус': 'Д' },
        { 'дата': D(MM + '-06'), 'таб_номер': '100', 'статус': 'Д' },
        { 'дата': D(MM + '-07'), 'таб_номер': '100', 'статус': 'д', 'часы': 12 },
        { 'дата': D(MM + '-08'), 'таб_номер': '100', 'статус': 'д', 'часы': 12 },
        { 'дата': D(MM + '-09'), 'таб_номер': '100', 'статус': 'Д8' },
        { 'дата': D(MM + '-10'), 'таб_номер': '100', 'статус': 'Д8' },
        { 'дата': D(MM + '-11'), 'таб_номер': '100', 'статус': 'Д8' }
    ];

    test('Чирков в ОБОИХ группах БЕЗ правок: 96 ч / 8 тал. и 24 ч / 3 тал.', () => {
        const h = printHost(CHIRKOV, CHIRKOV_ENTRIES, {});
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        const i12 = html.indexOf('>12 часовые<');
        const i8 = html.indexOf('>8 часовые<');
        assertEqual((html.match(/Чирков В\. А\./g) || []).length, 2,
            'Чирков в отчёте ДВАЖДЫ — авто по дням, без правок (заявка)');
        const i1 = html.indexOf('Чирков В. А.');
        const i2 = html.indexOf('Чирков В. А.', i1 + 1);
        assertTrue(i12 !== -1 && i8 !== -1 && i12 < i8, 'группы по порядку формы');
        assertTrue(i1 > i12 && i1 < i8, 'первое вхождение — в «12 часовых»');
        assertTrue(i2 > i8, 'второе — в «8 часовых»');
        assertTrue(html.indexOf('>96</td>') !== -1, '12-часовые: 8 × 12 = 96 часов');
        assertTrue(html.indexOf('>24</td>') !== -1, '8-часовые: 3 × 8 = 24 часа');
        const i12t = html.indexOf('<td colspan="5" class="wst-t-itog">ИТОГО: 12 часовые</td>');
        const i8t = html.indexOf('<td colspan="5" class="wst-t-itog">8 часовые</td>');
        const v12 = html.indexOf('<td class="wst-t-val">8</td>');
        const v8 = html.indexOf('<td class="wst-t-val">3</td>');
        assertTrue(v12 > i12t && v12 < i8t, 'ИТОГО 12 часовые = 8 (шт.)');
        assertTrue(v8 > i8t, 'ИТОГО 8 часовые = 3 (шт.)');
        assertTrue(html.indexOf('Слесарь по КИП и А</td>') !== -1,
            'должность — формат строгой формы (Task 449/450 не тронуты)');
    });

    test('работник только с днями переработки — группа по часам правки', () => {
        const h = printHost(CHIRKOV, [
            { 'дата': D(MM + '-01'), 'таб_номер': '100', 'статус': 'д', 'часы': 12 },
            { 'дата': D(MM + '-02'), 'таб_номер': '100', 'статус': 'д', 'часы': 12 }
        ], {});
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        const i12 = html.indexOf('>12 часовые<');
        const i8 = html.indexOf('>8 часовые<');
        assertEqual((html.match(/Чирков В\. А\./g) || []).length, 1,
            'одно вхождение (только 12ч)');
        const i1 = html.indexOf('Чирков В. А.');
        assertTrue(i1 > i12 && i1 < i8, 'переработка 12 ч — в «12 часовых»');
        assertTrue(html.indexOf('>24</td>') !== -1, '2 × 12 = 24 часа');
    });

    test('нулевые категории — fallback по типу (регресс Task 451)', () => {
        const h = printHost(CHIRKOV, [], {});
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        const i8 = html.indexOf('>8 часовые<');
        assertEqual((html.match(/Чирков В\. А\./g) || []).length, 1,
            'без записей — одно вхождение (fallback)');
        assertTrue(html.indexOf('Чирков В. А.') > i8,
            'дневной без дней — в «8 часовых» (пустые строки не пропадают)');
    });
});

// ============================================================
// 5. SW — версия кэша
// ============================================================
describe('Task 452 — SW', () => {
    test('SW: кэш поднят до kipia-test-v751 (Task 452)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v751'") !== -1,
            'CACHE_VERSION = kipia-test-v751');
        assertTrue(SW_SRC.indexOf('kipia-test-v752') === -1,
            'kipia-test-v751 не существует');
        assertTrue(SW_SRC.indexOf('Task 452') !== -1,
            'комментарий Task 452 в истории версий');
    });
});
