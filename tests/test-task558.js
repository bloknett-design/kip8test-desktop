// tests/test-task558.js
// Task 558 — заявка: «При автоматическом формировании шахматки у
// сменного персонала, на расставление подменных смен за отпускника,
// мероприятия в ячейках не должны влиять на определённую логику
// определения подменных дней для остальных сменных работников.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   SRC (index.html, WorkSchedule):
//     — НОВЫЙ хелпер _isDnEventCode: «мероприятия» = И/ОБ/ПЗ (true),
//       ПР (прогул — отсутствие _ABSENCE_CODES) и «*» (неплановые
//       случаи, аварийные работы) — false, смены/отпуска/пусто — false;
//     — _autoDnPlan: (a) dayCat — запись-мероприятие НЕ задаёт
//       категорию дня (день считается по циклу, как если бы записи
//       не было: авто → отпуск → старт → плановая смена);
//       (b) кандидат — запись-мероприятие НЕ занимает ячейку;
//       (c) гвард typeof isEv — старые VM-харнессы без метода
//       ведут себя прежним образом;
//     — _autoDnMaterialize: правка «д»/«н» допускается ПОВЕРХ
//       серверной записи-мероприятия (как ручной ввод поверх
//       бейджа); ПР/«*»/отсутствия — по-прежнему не трогаются;
//     — комментарий правил Task 456 дополнен правилом Task 558;
//   VM: сосед-мероприятие (И/ОБ/ПЗ в соседнем дне кандидата) НЕ
//       ломает примыкание — подмена ставится; Б/ПР/«*» соседом —
//       по-прежнему блокируют;
//   VM: мероприятие в ДНЕ кандидата — день подмены определяется
//       как без него («д» назначается кандидату); ПР/«*» в дне
//       кандидата — ячейка занята, назначения нет;
//   VM: материализация поверх записи И — правка _PENDING с
//       __autoDn + реестр; поверх Б — пропуск (added=0);
//   VM: идемпотентность — материализованная «д» поверх И (правка
//       _PENDING) закрывает день покрытием, ячейка занята —
//       повторный план не переназначает и не дублирует;
//   SW: kipia-test-v769, прежней v766 нет;
//   Санитар: сервер WorkSchedule.gs НЕ менялся (КЛИЕНТ-Only);
//     tests/run-all.js подключает test-task558.js.
//
// Запуск: через tests/run-all.js (require './test-task558.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');
const RUN_ALL_SRC = fs.readFileSync(path.join(ROOT, 'tests', 'run-all.js'), 'utf8');
const WS_CLIENT = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

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

// ============================================================
// 1. SRC — хелпер _isDnEventCode
// ============================================================
describe('Task 558 — SRC: хелпер _isDnEventCode', () => {

    test('метод существует, комментарий-заявка над ним', () => {
        const idx = WS_CLIENT.indexOf('_isDnEventCode: function(');
        assertTrue(idx !== -1, 'метод _isDnEventCode определён');
        const chunk = WS_CLIENT.slice(Math.max(0, idx - 2200), idx);
        assertTrue(chunk.indexOf('Task 558') !== -1,
            'метка задачи в комментарии над хелпером');
        assertTrue(chunk.indexOf('мероприятия в ячейках не должны влиять') !== -1,
            'заявка процитирована');
    });

    test('«мероприятия» — ТОЛЬКО И/ОБ/ПЗ', () => {
        const h = new Function('return ({' +
            methodText(WS_CLIENT, '_isDnEventCode') +
            '});')();
        assertTrue(h._isDnEventCode('И') === true, 'И — мероприятие');
        assertTrue(h._isDnEventCode('ОБ') === true, 'ОБ — мероприятие');
        assertTrue(h._isDnEventCode('ПЗ') === true, 'ПЗ — мероприятие');
        assertFalse(h._isDnEventCode('ПР'), 'ПР (прогул) — НЕ мероприятие (отсутствие)');
        assertFalse(h._isDnEventCode('*'), '«*» (неплановые случаи) — НЕ мероприятие');
    });

    test('смены/отпуска/отсутствия/пусто — НЕ мероприятия', () => {
        const h = new Function('return ({' +
            methodText(WS_CLIENT, '_isDnEventCode') +
            '});')();
        assertFalse(h._isDnEventCode('Д'), 'Д — смена');
        assertFalse(h._isDnEventCode('Н'), 'Н — смена');
        assertFalse(h._isDnEventCode('д'), 'д — работа в выходной');
        assertFalse(h._isDnEventCode('н'), 'н — работа в выходной');
        assertFalse(h._isDnEventCode('Д8'), 'Д8 — смена');
        assertFalse(h._isDnEventCode('ОТ'), 'ОТ — отпуск');
        assertFalse(h._isDnEventCode('Б'), 'Б — больничный');
        assertFalse(h._isDnEventCode(''), 'пусто — выходной');
        assertFalse(h._isDnEventCode('.'), '«.» — надгробие выходного');
    });
});

// ============================================================
// 2. SRC — _autoDnPlan: три точки снятия влияния
// ============================================================
describe('Task 558 — SRC: _autoDnPlan (мероприятия не влияют)', () => {

    test('dayCat: запись-мероприятие НЕ задаёт категорию дня', () => {
        const fn = methodText(WS_CLIENT, '_autoDnPlan');
        assertTrue(fn.indexOf("if (rec && !isEv(String(rec['статус'] || ''))) {") !== -1,
            'день считается по записи только для НЕ-мероприятия');
        const iDayCat = fn.indexOf('function dayCat(emp, iso)');
        const chunk = fn.slice(iDayCat, iDayCat + 1400);
        assertTrue(chunk.indexOf('Task 558') !== -1,
            'комментарий Task 558 у dayCat');
        // порядок слоёв после записи-мероприятия: авто → отпуск →
        // старт → плановая смена цикла (как если бы записи не было)
        assertTrue(chunk.indexOf('catOf(self._plannedShiftAt(iso, emp) || \'\')') !== -1,
            'фолбэк — плановая смена цикла');
    });

    test('кандидат: запись-мероприятие НЕ занимает ячейку', () => {
        const fn = methodText(WS_CLIENT, '_autoDnPlan');
        assertTrue(fn.indexOf('var recB = recIdx[keyB];') !== -1 &&
                   fn.indexOf("if ((recB && !isEv(String(recB['статус'] || ''))) ||") !== -1,
            'занятость ячейки — только для НЕ-мероприятий');
        const iCand = fn.indexOf('var recB = recIdx[keyB];');
        const chunk = fn.slice(Math.max(0, iCand - 700), iCand + 200);
        assertTrue(chunk.indexOf('Task 558') !== -1,
            'комментарий Task 558 у проверки кандидата');
    });

    test('гвард typeof isEv — старые VM-харнессы без метода', () => {
        const fn = methodText(WS_CLIENT, '_autoDnPlan');
        assertTrue(fn.indexOf('var isEv = (typeof this._isDnEventCode === \'function\')') !== -1,
            'гвард typeof у объявления isEv');
        assertTrue(fn.indexOf('function() { return false; }') !== -1,
            'фолбэк false — прежнее поведение (мероприятие = x, ячейка занята)');
    });

    test('комментарий правил Task 456 дополнен правилом 558', () => {
        const i = WS_CLIENT.indexOf('_autoDnPlan: function(');
        const chunk = WS_CLIENT.slice(Math.max(0, i - 4000), i);
        assertTrue(chunk.indexOf('МЕРОПРИЯТИЕ (И/ОБ/ПЗ) соседом НЕ влияет') !== -1,
            'правило примыкания: мероприятие соседом не блокирует');
        assertTrue(chunk.indexOf('кандидатом БЫВАЕТ') !== -1,
            'правило кандидата: ячейка с мероприятием — кандидат');
    });
});

// ============================================================
// 3. SRC — _autoDnMaterialize: правка поверх мероприятия
// ============================================================
describe('Task 558 — SRC: _autoDnMaterialize (поверх мероприятия)', () => {

    test('серверная запись-мероприятие НЕ отсекает правку', () => {
        const fn = methodText(WS_CLIENT, '_autoDnMaterialize');
        assertTrue(fn.indexOf("var isEv = (typeof this._isDnEventCode === 'function')") !== -1,
            'гвард typeof у isEv материализации');
        assertTrue(fn.indexOf('var srvRec = (typeof this._serverEntry === \'function\')') !== -1,
            'серверная запись читается в переменную');
        assertTrue(fn.indexOf("!(isEv && isEv(String(srvRec['статус'] || '')))") !== -1,
            'скип только для НЕ-мероприятия (ПР/«*»/отсутствия)');
    });

    test('комментарий Task 558 над циклом материализации', () => {
        const fn = methodText(WS_CLIENT, '_autoDnMaterialize');
        const i = fn.indexOf('var isEv = (typeof this._isDnEventCode');
        const chunk = fn.slice(Math.max(0, i - 900), i);
        assertTrue(chunk.indexOf('Task 558') !== -1 &&
                   chunk.indexOf('ручной ввод «д»/«н» поверх бейджа') !== -1,
            'комментарий объясняет природу правки поверх мероприятия');
    });
});

// ============================================================
// 4. VM — сосед-мероприятие НЕ ломает примыкание
// ============================================================
// Октябрь 2026, два сменных (старты 2026-10-01):
//   01 Отпускников: цикл 2 «Д В» → смены Д — нечётные дни;
//   02 Белов: цикл 4 «В В Д Д» → рабочие 3,4,7,8,11,12,…;
//      выходные 1,2,5,6,9,10,13,14,17,18,21,22,25,26,29,30.
// Отпуск 01 — весь октябрь (план листа «Отпуска»).
// Кандидатные дни 02 (выходной + примыкание «рабочая Д» +
// выходной): 5,9,13,17,21,25,29 — «д» 02; день 1 — сосед
// до старта (сентябрь — tsOf < startTs → 'x') — не ставится.
// Соседи дня 5: день 4 (рабочая «Д») и день 6 (выходной):
// запись в дне 6 — прежний блокер примыкания (Task 456
// «день отсутствия или мероприятие соседом НЕ бывает»).
// ============================================================
describe('Task 558 — VM: сосед-мероприятие не блокирует примыкание', () => {

    const PAT_A = { id: 'p2a', cycle: 2, days: [
        { day: 1, status: 'Д' }, { day: 2, status: '' } ] };
    const PAT_B = { id: 'p4b', cycle: 4, days: [
        { day: 1, status: '' }, { day: 2, status: '' },
        { day: 3, status: 'Д' }, { day: 4, status: 'Д' } ] };
    const EMPS = [
        { 'таб_номер': '01', 'ФИО': 'Отпускников О. О.', 'тип': 'сменный',
          'шаблон_ротации': 'p2a', 'старт_цикла': '2026-10-01' },
        { 'таб_номер': '02', 'ФИО': 'Белов Б. Б.', 'тип': 'сменный',
          'шаблон_ротации': 'p4b', 'старт_цикла': '2026-10-01' }
    ];
    const BASE_DAYS = ['2026-10-05', '2026-10-09', '2026-10-13',
        '2026-10-17', '2026-10-21', '2026-10-25', '2026-10-29'];

    function host(entries) {
        return new Function('return ({' +
            methodText(WS_CLIENT, '_autoDnPlan') + ',' +
            methodText(WS_CLIENT, '_isDnEventCode') + ',' +
            methodText(WS_CLIENT, '_plannedShiftAt') + ',' +
            methodText(WS_CLIENT, '_totalsEffectiveEntries') + ',' +
            methodText(WS_CLIENT, '_vacationAt') + ',' +
            methodText(WS_CLIENT, '_parseIsoLocal') + ',' +
            methodText(WS_CLIENT, '_isoDate') + ',' +
            '_EMPLOYEES: ' + JSON.stringify(EMPS) + ',' +
            '_ENTRIES: ' + JSON.stringify(entries || []) + ',' +
            '_PENDING: {},' +
            '_VACATIONS: ' + JSON.stringify([
                { 'таб_номер': '01', 'дата_начала': '2026-10-01',
                  'дата_окончания': '2026-10-31' }]) + ',' +
            '_VAC_CODES: ' + JSON.stringify(['ОТ', 'У']) + ',' +
            '_PATTERNS: ' + JSON.stringify([PAT_A, PAT_B]) + ',' +
            '_year: 2026, _month: 10,' +
            '});')();
    }

    test('база: 7 назначений «д» 02 (день 5…29), день 1 — до старта', () => {
        const plan = host()._autoDnPlan();
        assertEqual(Object.keys(plan).length, 7,
            'ровно 7 назначений');
        for (const d of BASE_DAYS) {
            assertEqual(plan[d + '|02'], 'д',
                'день ' + d + ' — «д» 02');
        }
    });

    test('сосед-мероприятие И (день 6) — примыкание живо, «д» 05 стоит', () => {
        const plan = host([
            { 'дата': '2026-10-06', 'таб_номер': '02',
              'статус': 'И', 'источник': 'авто' }
        ])._autoDnPlan();
        assertEqual(plan['2026-10-05|02'], 'д',
            'Task 558: мероприятие соседом НЕ блокирует — «д» 05');
        assertEqual(Object.keys(plan).length, 7,
            'все 7 назначений на месте');
    });

    test('сосед-мероприятия ОБ и ПЗ — примыкание живо', () => {
        const planOB = host([
            { 'дата': '2026-10-06', 'таб_номер': '02',
              'статус': 'ОБ', 'источник': 'авто' }
        ])._autoDnPlan();
        assertEqual(planOB['2026-10-05|02'], 'д', 'ОБ соседом — не блокирует');
        const planPZ = host([
            { 'дата': '2026-10-06', 'таб_номер': '02',
              'статус': 'ПЗ', 'источник': 'авто' }
        ])._autoDnPlan();
        assertEqual(planPZ['2026-10-05|02'], 'д', 'ПЗ соседом — не блокирует');
    });

    test('сосед-отсутствие Б — прежний блокер примыкания', () => {
        const plan = host([
            { 'дата': '2026-10-06', 'таб_номер': '02',
              'статус': 'Б', 'источник': 'авто' }
        ])._autoDnPlan();
        assertEqual(plan['2026-10-05|02'], undefined,
            'день отсутствия соседом — правило не выполнено (Task 456 жив)');
        assertEqual(Object.keys(plan).length, 6,
            'остальные 6 назначений живы');
    });

    test('сосед-прогул ПР и «*» — прежние блокеры', () => {
        const planPR = host([
            { 'дата': '2026-10-06', 'таб_номер': '02',
              'статус': 'ПР', 'источник': 'авто' }
        ])._autoDnPlan();
        assertEqual(planPR['2026-10-05|02'], undefined,
            'ПР (прогул — отсутствие) соседом блокирует');
        const planStar = host([
            { 'дата': '2026-10-06', 'таб_номер': '02',
              'статус': '*', 'источник': 'авто' }
        ])._autoDnPlan();
        assertEqual(planStar['2026-10-05|02'], undefined,
            '«*» (неплановые случаи) соседом блокирует');
    });
});

// ============================================================
// 5. VM — мероприятие в ДНЕ кандидата
// ============================================================
describe('Task 558 — VM: мероприятие в дне кандидата', () => {

    const PAT_A = { id: 'p2a', cycle: 2, days: [
        { day: 1, status: 'Д' }, { day: 2, status: '' } ] };
    const PAT_B = { id: 'p4b', cycle: 4, days: [
        { day: 1, status: '' }, { day: 2, status: '' },
        { day: 3, status: 'Д' }, { day: 4, status: 'Д' } ] };
    const EMPS = [
        { 'таб_номер': '01', 'ФИО': 'Отпускников О. О.', 'тип': 'сменный',
          'шаблон_ротации': 'p2a', 'старт_цикла': '2026-10-01' },
        { 'таб_номер': '02', 'ФИО': 'Белов Б. Б.', 'тип': 'сменный',
          'шаблон_ротации': 'p4b', 'старт_цикла': '2026-10-01' }
    ];

    function host(entries, pending) {
        return new Function('return ({' +
            methodText(WS_CLIENT, '_autoDnPlan') + ',' +
            methodText(WS_CLIENT, '_isDnEventCode') + ',' +
            methodText(WS_CLIENT, '_plannedShiftAt') + ',' +
            methodText(WS_CLIENT, '_totalsEffectiveEntries') + ',' +
            methodText(WS_CLIENT, '_vacationAt') + ',' +
            methodText(WS_CLIENT, '_parseIsoLocal') + ',' +
            methodText(WS_CLIENT, '_isoDate') + ',' +
            '_EMPLOYEES: ' + JSON.stringify(EMPS) + ',' +
            '_ENTRIES: ' + JSON.stringify(entries || []) + ',' +
            '_PENDING: ' + JSON.stringify(pending || {}) + ',' +
            '_VACATIONS: ' + JSON.stringify([
                { 'таб_номер': '01', 'дата_начала': '2026-10-01',
                  'дата_окончания': '2026-10-31' }]) + ',' +
            '_VAC_CODES: ' + JSON.stringify(['ОТ', 'У']) + ',' +
            '_PATTERNS: ' + JSON.stringify([PAT_A, PAT_B]) + ',' +
            '_year: 2026, _month: 10,' +
            '});')();
    }

    test('мероприятие И в планово-выходном дне 5 — «д» назначается', () => {
        const plan = host([
            { 'дата': '2026-10-05', 'таб_номер': '02',
              'статус': 'И', 'источник': 'авто' }
        ])._autoDnPlan();
        assertEqual(plan['2026-10-05|02'], 'д',
            'Task 558: мероприятие в ячейке кандидата — день подмены определяется как без него');
        // сосед 6-го — выходной, сосед 4-го — рабочая «Д»: примыкание живо
        assertEqual(Object.keys(plan).length, 7,
            'полный набор назначений (5,9,13,17,21,25,29)');
    });

    test('мероприятие ОБ в дне кандидата — «д» назначается', () => {
        const plan = host([
            { 'дата': '2026-10-09', 'таб_номер': '02',
              'статус': 'ОБ', 'источник': 'авто' }
        ])._autoDnPlan();
        assertEqual(plan['2026-10-09|02'], 'д',
            'ОБ в дне кандидата — назначение есть');
    });

    test('мероприятие И на СМЕННОМ дне по циклу — не кандидат', () => {
        // день 3: у 02 плановая рабочая «Д» (цикл) — мероприятие
        // поверх не делает день выходным: dayCat → 'day'
        const plan = host([
            { 'дата': '2026-10-03', 'таб_номер': '02',
              'статус': 'И', 'источник': 'авто' }
        ])._autoDnPlan();
        assertEqual(plan['2026-10-03|02'], undefined,
            'смена по циклу — не выходной, подмены нет');
    });

    test('ПР в дне кандидата — ячейка занята прогулом', () => {
        const plan = host([
            { 'дата': '2026-10-05', 'таб_номер': '02',
              'статус': 'ПР', 'источник': 'авто' }
        ])._autoDnPlan();
        assertEqual(plan['2026-10-05|02'], undefined,
            'прогул занимает ячейку — подмена не ставится');
        assertEqual(Object.keys(plan).length, 6,
            'остальные назначения живы');
    });

    test('«*» в дне кандидата — ячейка занята', () => {
        const plan = host([
            { 'дата': '2026-10-05', 'таб_номер': '02',
              'статус': '*', 'источник': 'авто' }
        ])._autoDnPlan();
        assertEqual(plan['2026-10-05|02'], undefined,
            '«*» (аварийные работы и пр.) занимает ячейку');
    });
});

// ============================================================
// 6. VM — материализация поверх записи-мероприятия
// ============================================================
describe('Task 558 — VM: _autoDnMaterialize поверх мероприятия', () => {

    function host(opts) {
        opts = opts || {};
        return new Function('return ({' +
            methodText(WS_CLIENT, '_autoDnMaterialize') + ',' +
            methodText(WS_CLIENT, '_isDnEventCode') + ',' +
            methodText(WS_CLIENT, '_autoDnKeysSave') + ',' +
            methodText(WS_CLIENT, '_serverEntry') + ',' +
            '_canEdit: ' + (opts.canEdit !== undefined ? opts.canEdit : true) + ',' +
            '_AUTO_DN: ' + JSON.stringify(opts.plan !== undefined
                ? opts.plan : { '2026-10-05|02': 'д' }) + ',' +
            '_PENDING: ' + JSON.stringify(opts.pending || {}) + ',' +
            '_AUTO_DN_KEYS: ' + JSON.stringify(opts.keys || {}) + ',' +
            '_ENTRIES: ' + JSON.stringify(opts.entries !== undefined
                ? opts.entries
                : [{ 'дата': '2026-10-05', 'таб_номер': '02',
                     'статус': 'И', 'источник': 'авто' }]) + ',' +
            '_year: 2026, _month: 10,' +
            '});')();
    }

    test('план поверх записи И — правка создана, как ручной ввод', () => {
        const h = host({});
        assertEqual(h._autoDnMaterialize(), 1,
            'ячейка с мероприятием И материализована');
        assertEqual(h._PENDING['2026-10-05|02']['статус'], 'д',
            'правка «д» поверх записи И');
        assertEqual(h._PENDING['2026-10-05|02']['__autoDn'], true,
            'флаг материализации Task 547');
        assertEqual(h._PENDING['2026-10-05|02']['переработка'], 0,
            'поля ручного ввода');
        assertEqual(h._AUTO_DN_KEYS['2026-10']['2026-10-05|02'], 1,
            'ключ в реестре месяца');
    });

    test('план поверх записи ПЗ — правка создана', () => {
        const h = host({
            entries: [{ 'дата': '2026-10-05', 'таб_номер': '02',
                         'статус': 'ПЗ', 'источник': 'авто' }]
        });
        assertEqual(h._autoDnMaterialize(), 1, 'ПЗ — тоже мероприятие');
        assertEqual(h._PENDING['2026-10-05|02']['статус'], 'д', 'правка «д»');
    });

    test('план поверх записи Б — правка НЕ создана', () => {
        const h = host({
            entries: [{ 'дата': '2026-10-05', 'таб_номер': '02',
                         'статус': 'Б', 'источник': 'авто' }]
        });
        assertEqual(h._autoDnMaterialize(), 0,
            'день отсутствия — ячейка занята, правки нет');
        assertEqual(h._PENDING['2026-10-05|02'], undefined,
            'правка не создана');
    });

    test('план поверх ПР/«*» — правки нет', () => {
        const hPR = host({
            entries: [{ 'дата': '2026-10-05', 'таб_номер': '02',
                         'статус': 'ПР', 'источник': 'авто' }]
        });
        assertEqual(hPR._autoDnMaterialize(), 0, 'ПР — не трогается');
        const hStar = host({
            entries: [{ 'дата': '2026-10-05', 'таб_номер': '02',
                         'статус': '*', 'источник': 'авто' }]
        });
        assertEqual(hStar._autoDnMaterialize(), 0, '«*» — не трогается');
    });

    test('идемпотентность: повторный вызов — 0', () => {
        const h = host({});
        assertEqual(h._autoDnMaterialize(), 1, 'первый проход — 1');
        assertEqual(h._autoDnMaterialize(), 0, 'повторный — 0');
    });
});

// ============================================================
// 7. VM — идемпотентность плана: правка поверх И закрывает день
// ============================================================
describe('Task 558 — VM: план после материализации (идемпотентность)', () => {

    const PAT_A = { id: 'p2a', cycle: 2, days: [
        { day: 1, status: 'Д' }, { day: 2, status: '' } ] };
    const PAT_B = { id: 'p4b', cycle: 4, days: [
        { day: 1, status: '' }, { day: 2, status: '' },
        { day: 3, status: 'Д' }, { day: 4, status: 'Д' } ] };
    const EMPS = [
        { 'таб_номер': '01', 'ФИО': 'Отпускников О. О.', 'тип': 'сменный',
          'шаблон_ротации': 'p2a', 'старт_цикла': '2026-10-01' },
        { 'таб_номер': '02', 'ФИО': 'Белов Б. Б.', 'тип': 'сменный',
          'шаблон_ротации': 'p4b', 'старт_цикла': '2026-10-01' }
    ];

    function host(entries, pending) {
        return new Function('return ({' +
            methodText(WS_CLIENT, '_autoDnPlan') + ',' +
            methodText(WS_CLIENT, '_isDnEventCode') + ',' +
            methodText(WS_CLIENT, '_plannedShiftAt') + ',' +
            methodText(WS_CLIENT, '_totalsEffectiveEntries') + ',' +
            methodText(WS_CLIENT, '_vacationAt') + ',' +
            methodText(WS_CLIENT, '_parseIsoLocal') + ',' +
            methodText(WS_CLIENT, '_isoDate') + ',' +
            '_EMPLOYEES: ' + JSON.stringify(EMPS) + ',' +
            '_ENTRIES: ' + JSON.stringify(entries || []) + ',' +
            '_PENDING: ' + JSON.stringify(pending || {}) + ',' +
            '_VACATIONS: ' + JSON.stringify([
                { 'таб_номер': '01', 'дата_начала': '2026-10-01',
                  'дата_окончания': '2026-10-31' }]) + ',' +
            '_VAC_CODES: ' + JSON.stringify(['ОТ', 'У']) + ',' +
            '_PATTERNS: ' + JSON.stringify([PAT_A, PAT_B]) + ',' +
            '_year: 2026, _month: 10,' +
            '});')();
    }

    test('материализованная «д» поверх И — повторный план не дублирует', () => {
        // запись И в дне 5 + материализованная правка «д» поверх:
        // эффективная запись — «д» (правка главнее), ячейка занята,
        // покрытие дня закрывает тип «Д» — назначений в день 5 нет
        const plan = host(
            [{ 'дата': '2026-10-05', 'таб_номер': '02',
               'статус': 'И', 'источник': 'авто' }],
            { '2026-10-05|02': { 'статус': 'д', 'переработка': 0,
                                 '__autoDn': true } }
        )._autoDnPlan();
        assertEqual(plan['2026-10-05|02'], undefined,
            'эффективная «д» закрывает день — повторного назначения нет');
        // остальные дни (9,13,17,21,25,29) — как прежде
        assertEqual(Object.keys(plan).length, 6,
            'ровно 6 назначений остальных дней');
        assertEqual(plan['2026-10-09|02'], 'д', 'день 9 жив');
    });
});

// ============================================================
// 8. SW + санитар
// ============================================================
describe('Task 558 — SW и санитар', () => {

    test('SW: CACHE_VERSION = kipia-test-v769, прежней v766 нет', () => {
        assertTrue(SW_SRC.indexOf("'kipia-test-v769'") !== -1,
            'новая версия SW v767');
        assertEqual(SW_SRC.indexOf("'kipia-test-v766'"), -1,
            'старой версии v766 не осталось');
    });

    test('СЕРВЕР НЕ менялся (КЛИЕНТ-Only, общий Apps Script srvVer 554)', () => {
        assertEqual(WS_GS_SRC.indexOf('Task 558'), -1,
            'WorkSchedule.gs без изменений Task 558');
    });

    test('run-all.js подключает test-task558.js', () => {
        assertTrue(RUN_ALL_SRC.indexOf("require('./test-task558.js')") !== -1,
            'новый тест в общем прогоне');
    });
});
