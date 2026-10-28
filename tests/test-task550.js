// tests/test-task550.js
// Task 550 — итоги учёта: столбец «Отпуск (ОТ)» считает «чистые»
// дни — нерабочие праздничные дни ст. 112 НЕ входят в число дней
// отпуска (ст. 120 ТК РФ). Заявка пользователя:
//   «В разделе Табель учёта рабочего времени при расчёте в итогах
//    учёта количества дней отпуска, официальные праздничные дни,
//    которые не учитываются в отпуске, не должны учитываться в
//    данном расчёте».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   SRC (index.html):
//     — _entryIsHoliday: дата записи (ISO) → _parseIsoLocal →
//       _vacIsHoliday (Task 310 — ProdCalendar.dayInfo, фолбэк
//       ст. 112) — общий источник с «чистыми» днями шторки отпуска;
//     — _totalsAgg: «ОТ» на праздник НЕ увеличивает счётчик
//       «Отпуск (ОТ)» (var otHol), total++ остаётся (день табеля);
//       вычет ТОЛЬКО для «ОТ» («У»/«Б»/«ОВ» — календарные дни,
//       ст. 173/174 ТК РФ);
//     — typeof-оговорка: старые VM-харнессы без _entryIsHoliday
//       (Task 321+) — прежний подсчёт всеми календарными днями;
//     — тултип столбца «Отпуск (ОТ)» — правило ст. 112/ст. 120;
//     — комментарий вкладки «Месяц» — метка Task 550.
//   VM (функционально, ProdCalendar — мок праздников ст. 112):
//     — _entryIsHoliday: праздники → true; обычный день, обычная
//       суббота (выходные в отпуск ВХОДЯТ) → false; мусор → false;
//     — весь май «ОТ» (31 день): 01.05+09.05 праздники → 29;
//     — 01–08 января «ОТ» → 0 (все 8 дней — праздники ст. 112);
//     — суббота «ОТ» → считается; «У»/«Б»/«ОВ» на празднике →
//       считаются (вычет только у ежегодного отпуска);
//     — «Д» на празднике — явка (вычет не задевает рабочие коды);
//     — смешанный месяц: все счётчики + grand-суммы;
//     — без ProdCalendar — мягкая деградация (все 31 считаются);
//     — старый харнесс без _entryIsHoliday (+ProdCalendar) —
//       обратная совместимость (Task 321/322).
//   Санитар:
//     — заявка-цитата в исходнике;
//     — сервер WorkSchedule.gs НЕ менялся (КЛИЕНТ-ONLY — записи
//       «ОТ» в сетке остаются на всех календарных днях периода,
//       вычет только в счётчике итогов).
//
// Запуск: через tests/run-all.js (require './test-task550.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual, assertApprox } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');
const WS_CLIENT = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// Вырезка метода объекта WorkSchedule (баланс фигурных скобок) —
// как в test-task310.js
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

// Вырезка тела функции: от сигнатуры до следующего «имя: function»
// (для SRC-ассертов по тексту метода)
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        \},|\n    \};/);
    const end = m ? m.index + m[0].length : rest.length;
    let text = rest.slice(0, end);
    text = text.replace(/\n\s{4}\};\s*$/, '');
    return text;
}

// ============================================================
// VM-харнесс: методы итогов Task 550 + ProdCalendar-мок
// ============================================================
// Праздники ст. 112 ТК РФ (карта _FIXED_TITLES: 1–8 января, 23.02,
// 08.03, 01.05, 09.05, 12.06, 04.11). Выходные Сб/Вс в моке НЕ
// праздничные — как в реальном ProdCalendar (holiday ≠ off).
const HOL_MMDD = ['0101', '0102', '0103', '0104', '0105', '0106',
                  '0107', '0108', '0223', '0308', '0501', '0509',
                  '0612', '1104'];
const HOL_SET = {};
HOL_MMDD.forEach(function(mmdd) { HOL_SET[mmdd] = true; });

function mmddOf(y, m, d) {
    return String(m).padStart(2, '0') + String(d).padStart(2, '0');
}

// Хост из реальных методов index.html; withProdCalendar — мок в
// контексте; методNames позволяет собрать «старый харнесс» без
// _entryIsHoliday (обратная совместимость Task 321/322)
function makeHost(methodNames, withProdCalendar) {
    const names = methodNames || ['_entryIsHoliday', '_parseIsoLocal',
                                  '_vacIsHoliday', '_totalsAgg',
                                  '_totalsZero', '_codeHours', '_overHours'];
    const src = names.map(function(n) { return extractMethod(WS_CLIENT, n); })
                     .filter(Boolean).join(',\n');
    const ctx = { Math: Math, Date: Date, String: String, Number: Number,
                  parseInt: parseInt, isNaN: isNaN };
    if (withProdCalendar) {
        ctx.ProdCalendar = {
            dayInfo: function(y, m, d) {
                return { holiday: !!HOL_SET[mmddOf(y, m, d)] };
            }
        };
    }
    vm.createContext(ctx);
    vm.runInContext('var WSMixin = { ' + src + ',' +
                    ' _statusMeta: function(code) { return null; } };', ctx,
        { filename: 'index.html-WS-totals' });
    return ctx.WSMixin;
}

const HOST_PC = makeHost(null, true);       // полный хост + ProdCalendar
const HOST_NO_PC = makeHost(null, false);   // без ProdCalendar — деградация
const HOST_OLD = makeHost(['_totalsAgg', '_totalsZero', '_codeHours',
                           '_overHours'], true); // старый харнесс Task 321+

// Сотрудник «весь май в отпуске»: 31 запись «ОТ» (01–31.05.2026)
function mayOtAll(tab) {
    const out = [];
    for (var d = 1; d <= 31; d++) {
        out.push({ 'дата': '2026-05-' + (d < 10 ? '0' + d : d),
                   'таб_номер': tab, 'статус': 'ОТ' });
    }
    return out;
}

// Сотрудник «01–08 января в отпуске»: 8 записей «ОТ» (все праздники)
function janOt18(tab) {
    const out = [];
    for (var d = 1; d <= 8; d++) {
        out.push({ 'дата': '2026-01-0' + d,
                   'таб_номер': tab, 'статус': 'ОТ' });
    }
    return out;
}

// ============================================================
// 1. SRC: метод _entryIsHoliday
// ============================================================
describe('Task 550 — SRC: _entryIsHoliday (запись × праздник)', () => {
    test('SRC: _entryIsHoliday объявлен — ISO → _parseIsoLocal → _vacIsHoliday', () => {
        const i = WS_CLIENT.indexOf('_entryIsHoliday: function');
        assertTrue(i !== -1, 'метод есть');
        // окно: комментарий над методом + тело метода
        const chunk = WS_CLIENT.slice(Math.max(0, i - 1600), i + 900);
        assertTrue(chunk.indexOf('Task 550') !== -1, 'метка задачи в комментарии');
        assertTrue(chunk.indexOf('_parseIsoLocal') !== -1, 'разбор ISO-даты записи');
        assertTrue(chunk.indexOf('_vacIsHoliday') !== -1,
            'общий источник с «чистыми» днями шторки (Task 310)');
        assertTrue(chunk.indexOf("entry['дата']") !== -1, 'дата читается из записи');
        assertTrue(chunk.indexOf('if (!entry) return false') !== -1,
            'без записи — false');
        assertTrue(chunk.indexOf('if (!dt) return false') !== -1,
            'кривая/пустая дата — false (мягкая деградация)');
    });

    test('SRC: комментарий — ProdCalendar.dayInfo с фолбэком ст. 112', () => {
        const i = WS_CLIENT.indexOf('_entryIsHoliday: function');
        assertTrue(i !== -1, 'метод есть');
        const head = WS_CLIENT.slice(Math.max(0, i - 1600), i);
        assertTrue(head.indexOf('ProdCalendar.dayInfo') !== -1,
            'источник праздников — производственный календарь');
        assertTrue(head.indexOf('фиксированные даты ст. 112') !== -1,
            'фолбэк на даты ст. 112');
        assertTrue(head.indexOf('одну цифру') !== -1,
            'итоги сходятся с шторкой отпуска');
    });
});

// ============================================================
// 2. SRC: _totalsAgg — вычет праздничных «ОТ»
// ============================================================
describe('Task 550 — SRC: _totalsAgg — вычет праздников из «Отпуск (ОТ)»', () => {
    test('SRC: ветка Task 550 — «ОТ» × _entryIsHoliday', () => {
        const t = methodText(WS_CLIENT, '_totalsAgg');
        assertTrue(t.indexOf('Task 550') !== -1, 'метка задачи в комментарии');
        assertTrue(t.indexOf('var otHol') !== -1, 'флаг праздничного «ОТ»');
        assertTrue(t.indexOf("code === 'ОТ'") !== -1, 'вычет только для «ОТ»');
        assertTrue(t.indexOf('this._entryIsHoliday(e)') !== -1,
            'проверка записи на праздник');
        assertTrue(t.indexOf('if (!otHol) a[code]++;') !== -1,
            'непраздничный «ОТ» считается как прежде');
    });

    test('SRC: typeof-оговорка — совместимость старых VM-харнессов', () => {
        const t = methodText(WS_CLIENT, '_totalsAgg');
        assertTrue(t.indexOf('typeof this._entryIsHoliday === \'function\'') !== -1,
            'вызов только при наличии метода (Task 321/322 харнессы)');
        // Заявка Task 549-паттерн: фолбэк-среды — прежнее поведение
        assertTrue(t.indexOf('прежний подсчёт') !== -1,
            'комментарий про прежний подсчёт без метода');
    });

    test('SRC: total++ остаётся для всех записей (праздник — день табеля)', () => {
        const t = methodText(WS_CLIENT, '_totalsAgg');
        const first = t.indexOf('a.total++;');
        const last = t.lastIndexOf('a.total++;');
        assertTrue(first !== -1, 'total++ есть (ветка д/н)');
        assertTrue(last > first, 'total++ есть в общем хвосте цикла');
        assertTrue(last > t.indexOf('if (!otHol)'),
            'общий total++ ПОСЛЕ ветки «ОТ»: праздничный день остаётся днём табеля');
    });

    test('SRC: вычет ТОЛЬКО «ОТ» — «У»/«Б»/«ОВ»/«ПР» не тронуты', () => {
        const t = methodText(WS_CLIENT, '_totalsAgg');
        const callIdx = t.indexOf('this._entryIsHoliday(e)');
        assertTrue(callIdx !== -1, 'вызов есть');
        // единственный вызов _entryIsHoliday — рядом с code === 'ОТ'
        assertEqual(t.indexOf('this._entryIsHoliday(e)'), t.lastIndexOf('this._entryIsHoliday(e)'),
            'вызов _entryIsHoliday в методе один');
        // «У» — уч. отпуск в календарных днях (ст. 173/174), праздники входят
        assertTrue(t.indexOf('справкой-вызовом') !== -1,
            'комментарий: «У» — без вычета');
    });

    test('SRC: комментарий вкладки «Месяц» — метка Task 550', () => {
        const i = WS_CLIENT.indexOf('_renderTotalsMonth: function');
        assertTrue(i !== -1, 'метод есть');
        const head = WS_CLIENT.slice(Math.max(0, i - 1800), i);
        assertTrue(head.indexOf('Task 550') !== -1, 'метка задачи в шапке');
        assertTrue(head.indexOf('ст. 120') !== -1, 'ссылка на ст. 120 ТК РФ');
        assertTrue(head.indexOf('БЕЗ вычета') !== -1,
            '«У»/«Б»/«ОВ» — в календарных днях без вычета');
    });

    test('SRC: тултип столбца «Отпуск (ОТ)» — правило ст. 112/ст. 120', () => {
        const i = WS_CLIENT.indexOf("key: 'ОТ'");
        assertTrue(i !== -1, 'столбец «ОТ» есть');
        const chunk = WS_CLIENT.slice(i, i + 400);
        assertTrue(chunk.indexOf('title:') !== -1, 'тултип столбца задан');
        assertTrue(chunk.indexOf('ст. 120 ТК РФ') !== -1,
            'подсказка называет статью');
        assertTrue(chunk.indexOf('нерабочих праздничных дней') !== -1,
            'подсказка объясняет вычет');
    });

    test('SRC: _vacIsHoliday не изменён (Task 310 — ProdCalendar × ст. 112)', () => {
        const t = methodText(WS_CLIENT, '_vacIsHoliday');
        assertTrue(t.indexOf('ProdCalendar !== \'undefined\'') !== -1,
            'мягкая деградация без ProdCalendar');
        assertTrue(t.indexOf('info.holiday') !== -1, 'флаг holiday дня');
        assertFalse(t.indexOf('Task 550') !== -1, 'метод Task 310 не переписан');
    });
});

// ============================================================
// 3. VM: _entryIsHoliday
// ============================================================
describe('Task 550 — VM: _entryIsHoliday', () => {
    test('VM: праздники ст. 112 → true', () => {
        assertTrue(HOST_PC._entryIsHoliday({ 'дата': '2026-01-01' }), '01.01');
        assertTrue(HOST_PC._entryIsHoliday({ 'дата': '2026-01-08' }), '08.01');
        assertTrue(HOST_PC._entryIsHoliday({ 'дата': '2026-02-23' }), '23.02');
        assertTrue(HOST_PC._entryIsHoliday({ 'дата': '2026-03-08' }), '08.03');
        assertTrue(HOST_PC._entryIsHoliday({ 'дата': '2026-05-01' }), '01.05');
        assertTrue(HOST_PC._entryIsHoliday({ 'дата': '2026-05-09' }), '09.05');
        assertTrue(HOST_PC._entryIsHoliday({ 'дата': '2026-06-12' }), '12.06');
        assertTrue(HOST_PC._entryIsHoliday({ 'дата': '2026-11-04' }), '04.11');
    });

    test('VM: обычный день/суббота/перенос — false (выходные в отпуск входят)', () => {
        assertFalse(HOST_PC._entryIsHoliday({ 'дата': '2026-05-05' }),
            'рабочий вторник 05.05');
        assertFalse(HOST_PC._entryIsHoliday({ 'дата': '2026-05-16' }),
            'обычная суббота 16.05 — выходной, НЕ праздник');
        assertFalse(HOST_PC._entryIsHoliday({ 'дата': '2026-05-17' }),
            'воскресенье — выходной, НЕ праздник');
        assertFalse(HOST_PC._entryIsHoliday({ 'дата': '2026-08-30' }),
            'последнее воскресенье августа — День шахтёра НЕ гос. праздник (Task 426)');
    });

    test('VM: мусор — false (мягкая деградация)', () => {
        assertFalse(HOST_PC._entryIsHoliday(null), 'нет записи');
        assertFalse(HOST_PC._entryIsHoliday({}), 'нет даты');
        assertFalse(HOST_PC._entryIsHoliday({ 'дата': '' }), 'пустая дата');
        assertFalse(HOST_PC._entryIsHoliday({ 'дата': '05.2026' }), 'кривой формат');
        assertFalse(HOST_PC._entryIsHoliday({ 'дата': '01-05-2026' }), 'не ISO');
    });

    test('VM: без ProdCalendar — false (итоги считают все дни)', () => {
        assertFalse(HOST_NO_PC._entryIsHoliday({ 'дата': '2026-05-01' }),
            'праздник без календаря — не распознан');
    });
});

// ============================================================
// 4. VM: _totalsAgg — вычет праздников из «Отпуск (ОТ)»
// ============================================================
describe('Task 550 — VM: _totalsAgg — «чистые» дни отпуска', () => {
    test('VM: весь май «ОТ» (31) — 01.05+09.05 вычтены → 29, total 31', () => {
        const agg = HOST_PC._totalsAgg(mayOtAll('017'), {});
        assertEqual(agg.byTab['017']['ОТ'], 29, '«Отпуск (ОТ)»: 31 − 2 праздника');
        assertEqual(agg.byTab['017'].total, 31,
            'total: все записи — день табеля остаётся (сетка: «ОТ» на всём периоде)');
        assertEqual(agg.grand['ОТ'], 29, 'grand: 29');
    });

    test('VM: 01–08 января «ОТ» — все 8 дней праздники → 0, total 8', () => {
        const agg = HOST_PC._totalsAgg(janOt18('017'), {});
        assertEqual(agg.byTab['017']['ОТ'], 0, '«Отпуск (ОТ)»: 8 − 8 праздников');
        assertEqual(agg.byTab['017'].total, 8, 'total: записи на месте');
        assertEqual(agg.grand['ОТ'], 0, 'grand: 0');
    });

    test('VM: суббота «ОТ» — считается (выходные в отпуск входят)', () => {
        const entries = [
            { 'дата': '2026-05-16', 'таб_номер': '017', 'статус': 'ОТ' },
            { 'дата': '2026-05-17', 'таб_номер': '017', 'статус': 'ОТ' }
        ];
        const agg = HOST_PC._totalsAgg(entries, {});
        assertEqual(agg.byTab['017']['ОТ'], 2, 'сб 16.05 + вс 17.05 — оба дня отпуска');
    });

    test('VM: «У» на празднике — считается (уч. отпуск в календарных днях)', () => {
        const entries = [
            { 'дата': '2026-05-01', 'таб_номер': '041', 'статус': 'У' },
            { 'дата': '2026-05-04', 'таб_номер': '041', 'статус': 'У' }
        ];
        const agg = HOST_PC._totalsAgg(entries, {});
        assertEqual(agg.byTab['041']['У'], 2, '«Уч. отпуск (У)»: праздники входят');
        assertEqual(agg.byTab['041']['ОТ'], 0, 'счётчик «ОТ» не задет');
    });

    test('VM: «Б»/«ОВ» на празднике — считаются (без вычета)', () => {
        const entries = [
            { 'дата': '2026-05-01', 'таб_номер': '0871', 'статус': 'Б' },
            { 'дата': '2026-05-09', 'таб_номер': '0871', 'статус': 'ОВ' }
        ];
        const agg = HOST_PC._totalsAgg(entries, {});
        assertEqual(agg.byTab['0871']['Б'], 1, 'больничный 01.05 считается');
        assertEqual(agg.byTab['0871']['ОВ'], 1, 'отгул 09.05 считается');
    });

    test('VM: «Д» на празднике 09.05 — явка (вычет не задевает рабочие коды)', () => {
        const entries = [
            { 'дата': '2026-05-09', 'таб_номер': '023', 'статус': 'Д' }
        ];
        const agg = HOST_PC._totalsAgg(entries, { '023': 'сменный' });
        assertEqual(agg.byTab['023'].work, 1, 'явка на празднике — работа');
        assertEqual(agg.byTab['023'].day, 1, 'дневная смена');
        assertApprox(agg.byTab['023'].hours, 12, 1e-9, '12 часов');
        assertEqual(agg.byTab['023']['ОТ'], 0, 'счётчик отпуска пуст');
    });

    test('VM: смешанный месяц — все счётчики и grand-суммы', () => {
        const entries = [
            { 'дата': '2026-05-12', 'таб_номер': '023', 'статус': 'Д' },
            { 'дата': '2026-05-13', 'таб_номер': '023', 'статус': 'Н' },
            { 'дата': '2026-05-16', 'таб_номер': '023', 'статус': 'д' },
            { 'дата': '2026-05-01', 'таб_номер': '023', 'статус': 'ОТ' },
            { 'дата': '2026-05-05', 'таб_номер': '017', 'статус': 'ОТ' },
            { 'дата': '2026-05-01', 'таб_номер': '041', 'статус': 'У' },
            { 'дата': '2026-05-04', 'таб_номер': '041', 'статус': 'У' },
            { 'дата': '2026-05-01', 'таб_номер': '0871', 'статус': 'Б' },
            { 'дата': '2026-05-09', 'таб_номер': '0871', 'статус': 'ОВ' }
        ];
        const agg = HOST_PC._totalsAgg(entries, { '023': 'сменный' });
        const a23 = agg.byTab['023'];
        assertEqual(a23.work, 2, '023: явки Д+Н');
        assertEqual(a23.day, 1, '023: дневная Д');
        assertEqual(a23.night, 1, '023: ночная Н');
        assertApprox(a23.hours, 24, 1e-9, '023: часы 12+12');
        assertEqual(a23.overDays, 1, '023: день переработки (д 16.05)');
        assertApprox(a23.over, 12, 1e-9, '023: 12 ч переработки');
        assertEqual(a23['ОТ'], 0, '023: «ОТ» 01.05 — праздник, не считается');
        assertEqual(a23.total, 4, '023: 4 записи');
        assertEqual(agg.byTab['017']['ОТ'], 1, '017: «ОТ» 05.05 — обычный день');
        assertEqual(agg.byTab['041']['У'], 2, '041: 2 дня уч. отпуска');
        assertEqual(agg.byTab['0871']['Б'], 1, '0871: больничный');
        assertEqual(agg.byTab['0871']['ОВ'], 1, '0871: отгул');
        assertEqual(agg.grand['ОТ'], 1, 'grand «ОТ»: только 05.05');
        assertEqual(agg.grand['У'], 2, 'grand «У»: 2');
        assertEqual(agg.grand['Б'], 1, 'grand «Б»: 1');
        assertEqual(agg.grand['ОВ'], 1, 'grand «ОВ»: 1');
        assertEqual(agg.grand.total, 9, 'grand total: все 9 записей');
    });

    test('VM: без ProdCalendar — весь май «ОТ» считается (31)', () => {
        const agg = HOST_NO_PC._totalsAgg(mayOtAll('017'), {});
        assertEqual(agg.byTab['017']['ОТ'], 31,
            'мягкая деградация: без календаря праздники не вычитаются');
    });

    test('VM: старый харнесс без _entryIsHoliday — «ОТ» на празднике считается', () => {
        // Task 321/322 хосты собирались ДО Task 550: метода в хосте
        // нет, typeof-оговорка — прежний подсчёт всеми днями
        const entries = [
            { 'дата': '2026-05-01', 'таб_номер': '017', 'статус': 'ОТ' },
            { 'дата': '2026-05-05', 'таб_номер': '017', 'статус': 'ОТ' }
        ];
        const agg = HOST_OLD._totalsAgg(entries, {});
        assertEqual(agg.byTab['017']['ОТ'], 2,
            'обратная совместимость: 01.05 посчитан (метода нет — вычета нет)');
    });

    test('VM: два сотрудника — вычет у каждого своего (017 май, 041 январь)', () => {
        const entries = mayOtAll('017').concat(janOt18('041'));
        const agg = HOST_PC._totalsAgg(entries, {});
        assertEqual(agg.byTab['017']['ОТ'], 29, '017: май 31 − 2');
        assertEqual(agg.byTab['041']['ОТ'], 0, '041: январь 8 − 8');
        assertEqual(agg.grand['ОТ'], 29, 'grand: 29+0');
        assertEqual(agg.grand.total, 39, 'grand total: 31+8 записей');
    });
});

// ============================================================
// 5. Санитар
// ============================================================
describe('Task 550 — санитар', () => {
    test('санитар: заявка-цитата в исходнике', () => {
        assertTrue(INDEX_SRC.indexOf('количества дней отпуска официальные праздничные') !== -1,
            'цитата заявки в комментарии Task 550');
        assertTrue(INDEX_SRC.indexOf('ст. 120 ТК РФ') !== -1, 'ссылка на ст. 120');
    });

    test('санитар: сервер WorkSchedule.gs НЕ менялся (КЛИЕНТ-ONLY)', () => {
        assertTrue(WS_GS_SRC.indexOf('Task 550') === -1,
            'сервер без правок Task 550 — серверного деплоя НЕТ');
        assertTrue(WS_GS_SRC.indexOf('включая Сб/Вс') !== -1,
            'сервер по-прежнему ставит «ОТ» на все календарные дни периода (сетка)');
    });
});
