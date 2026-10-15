// tests/test-task320.js
// Task 320 — по заявке пользователя:
//   1) «В выпадающем списке выбора года должно быть три года, до и
//      после текущего» — 7 пунктов (±3), было −1…+2.
//   2) «При добавлении нового сотрудника, не зависимо от времени
//      начала цикла, шахматка его рабочих дней должна строиться с
//      установленной даты, но с учётом выходных и праздничных
//      нерабочих дней (только для дневного, не касается сменного
//      персонала), то есть допустим если старт цикла 04.09.2026, то
//      05-06.09.2026 должны быть пустыми выходными, а дальше с
//      понедельника новой недели должна формироваться шахматка 5/2,
//      до 04.09.2026 пустые дни».
//
// РЕАЛИЗАЦИЯ (киент + сервер):
//   Клиент: год ±3; подсказка в шторке «Новый сотрудник» (тип
//   «дневной»); _plannedShiftAt — паритет с сервером (до старта '',
//   «дневной» цикл 7 — по дням недели Пн=1..Вс=7); тосты генерации
//   «убрано N лишних смен» (removedShift).
//   Сервер (WorkSchedule.gs): generateMonth шаг 3 — дни ДО старт_цикла
//   пусты (обоим типам; раньше цикл «разматывался» назад отрицательным
//   остатком); «дневной» — КАЛЕНДАРНЫЙ режим: Сб/Вс и праздничные
//   нерабочие дни пустые, шаблон 5/2 (цикл 7) ложится на неделю
//   (Пн=1..Вс=7); «сменный» — цикл от старта, календарь не важен.
//   Производственный календарь: legalic (UrlFetchApp + кэш
//   CacheService 6 ч) с фолбэком Сб/Вс + ст. 112 (Task 426: День
//   шахтёра НЕ праздник — наложение удалён).
//   Сверка 4.7: устаревшие авто-смены (до старта / нерабочие дни
//   дневного) — удаляются, счётчик removedShift, ручные не трогаются.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   Клиент: init — 7 пунктов года ±3 (VM на мок-DOM); старый диапазон
//   −1..+2 отсутствует; #wsEmpCalHint + hidden + текст + CSS (обе
//   темы); onEmpTypeChange — показ/скрытие подсказки (VM);
//   _plannedShiftAt — до старта '', дневной цикл 7 (Пт=5, Сб=6, Вс=7,
//   Пн=1), дневной цикл ≠ 7 — циклом, сменный — цикл от старта;
//   тосты — removedShift/totalRemovedShift.
//   Сервер: пример пользователя ТОЧНО (сентябрь 2026, старт 04.09);
//   смена счётчиков/удалений сверкой 4.7 (авто до старта удалена,
//   ручная до старта жива, авто-«ОТ» не тронута, сменный на Сб/Вс
//   жив); сменный цикл 4 от старта (05.09 Сб = Н — выходные не
//   гейтятся); прочий тип («оператор») — циклом; legalic-мок —
//   перенесённый выходной 09.03.2026 пусто (фолбэк — рабочая),
//   праздник 08.03 пусто в обоих; рабочая суббота 26.09 — код дня 6
//   шаблона, обычные субботы пустые; кэш CacheService — сеть дёргается
//   один раз; День шахтёра 30.08 — обычное воскресенье, рабочий
//   перенос на него НЕ перекрывается (Task 426); праздник
//   04.11.2026 пусто (фолбэк), 05.11 рабочая; исключение UrlFetchApp —
//   фолбэк; без UrlFetchApp — фолбэк; месяц ДО старта — ноль записей;
//   идемпотентность повторной генерации.
//   SW: kipia-test-v742 (Task 321 — бамп партии; в Task 320 был v559).
//
// Запуск: через tests/run-all.js (require './test-task320.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
// WorkSchedule (клиент) — срез от «var WorkSchedule = {» (init —
// НЕуникальное имя, приём Task 316)
const WS_CLIENT = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// Вырезка метода: «имя: function» (отступ 8) → закрывающая скобка
// метода (включительно; вложенные блоки — глубже 8 пробелов)
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        \},|\n    \};/);
    const end = m ? m.index + m[0].length : rest.length;
    return rest.slice(0, end);
}

// Метод → исполняемая функция (для VM-тестов; хвостовая запятая
// срезается; document — в скоупе, методы клиента его используют)
function methodFn(src, name) {
    const text = methodText(src, name).replace(/,\s*$/, '');
    const body = text.replace(new RegExp('^ {8}' + name + ': '), '');
    return new Function('document', 'return (' + body + ')');
}

function iso(dt) {
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' +
           String(dt.getDate()).padStart(2, '0');
}

// ============================================================
// 1. Клиент: список выбора года — ровно ТРИ года (Task 321
//    уточнил заявку: «один год до текущего, один после»);
//    Task 320 делал ±3 — 7 пунктов, избыточно
// ============================================================
describe('Task 320/321 — год в селекте: РОВНО три пункта (−1/текущий/+1)', () => {

    test('JS: init — цикл от this._year - 1 до this._year + 1 (Task 321)', () => {
        const init = methodText(WS_CLIENT, 'init');
        assertTrue(init.indexOf('for (var y = this._year - 1; y <= this._year + 1; y++)') !== -1,
            'цикл годов: один до текущего, текущий, один после (Task 321)');
        assertFalse(init.indexOf('for (var y = this._year - 3; y <= this._year + 3; y++)') !== -1,
            'диапазон ±3 (Task 320) удалён — избыточен');
        assertFalse(init.indexOf('this._year - 1; y <= this._year + 2') !== -1,
            'старый диапазон −1…+2 тоже отсутствует');
    });

    test('VM: init наполняет select 3 пунктами 2025..2027 (год 2026)', () => {
        const init = methodText(WS_CLIENT, 'init');
        const from = init.indexOf('var monthSel = document.getElementById');
        const to = init.indexOf('var role = null');
        assertTrue(from !== -1 && to !== -1 && to > from, 'блок выбора месяца/года найден');
        const block = init.slice(from, to);
        const fn = new Function('document', block);
        const monthSel = { innerHTML: '' };
        const yearSel = { innerHTML: '' };
        const ctx = { _year: 2026, _month: 9 };
        fn.call(ctx, {
            getElementById: function(id) {
                if (id === 'wsMonthSel') return monthSel;
                if (id === 'wsYearSel') return yearSel;
                return null;
            }
        });
        const opts = yearSel.innerHTML.match(/<option/g) || [];
        assertEqual(opts.length, 3, 'три пункта: один до + текущий + один после (Task 321)');
        assertTrue(yearSel.innerHTML.indexOf('value="2025"') !== -1,
            'первый — 2025 (2026 − 1)');
        assertTrue(yearSel.innerHTML.indexOf('value="2026"') !== -1,
            'текущий — 2026');
        assertTrue(yearSel.innerHTML.indexOf('value="2027"') !== -1,
            'последний — 2027 (2026 + 1)');
        assertFalse(yearSel.innerHTML.indexOf('value="2023"') !== -1,
            '2023 (±3) больше нет');
        assertFalse(yearSel.innerHTML.indexOf('value="2029"') !== -1,
            '2029 (±3) больше нет');
        assertTrue(/value="2026"[^>]*selected/.test(yearSel.innerHTML),
            'текущий год выбран');
        const mOpts = monthSel.innerHTML.match(/<option/g) || [];
        assertEqual(mOpts.length, 12, 'месяцы не тронуты (12 пунктов)');
    });
});

// ============================================================
// 2. Клиент: подсказка календарного режима в шторке сотрудника
// ============================================================
describe('Task 320 — подсказка «дневной» в шторке нового сотрудника', () => {

    test('HTML: #wsEmpCalHint с текстом про 5/2 и выходные', () => {
        assertTrue(INDEX_SRC.indexOf('id="wsEmpCalHint"') !== -1,
            'элемент подсказки есть');
        assertTrue(INDEX_SRC.indexOf('wsEmpCalHint" hidden') !== -1,
            'по умолчанию скрыт (тип по умолчанию — сменный)');
        const i = INDEX_SRC.indexOf('id="wsEmpCalHint"');
        const chunk = INDEX_SRC.slice(i, i + 400);
        assertTrue(chunk.indexOf('пн–пт') !== -1, 'упомянуты рабочие дни пн–пт');
        assertTrue(chunk.indexOf('праздничные нерабочие дни') !== -1,
            'упомянуты праздничные нерабочие дни');
    });

    test('JS: onEmpTypeChange переключает hidden подсказки', () => {
        const m = methodText(WS_CLIENT, 'onEmpTypeChange');
        assertTrue(m.indexOf("getElementById('wsEmpCalHint')") !== -1,
            'находит подсказку');
        assertTrue(m.indexOf("calHint.hidden = (typeSel.value !== 'дневной')") !== -1,
            'скрыта для всего, кроме «дневной»');
    });

    test('VM: onEmpTypeChange — показ для дневного, скрытие для сменного', () => {
        const mk = methodFn(WS_CLIENT, 'onEmpTypeChange');
        const els = {
            wsEmpType: { value: 'дневной' },
            wsEmpShiftGroup: { style: {} },
            wsEmpShift: { value: '2' },
            wsEmpCalHint: { hidden: true }
        };
        const doc = { getElementById: (id) => els[id] || null };
        const fn = mk(doc);
        fn.call({}, doc);
        assertEqual(els.wsEmpCalHint.hidden, false, 'дневной → подсказка видна');
        assertEqual(els.wsEmpShift.value, '', 'смена сброшена для дневного');

        els.wsEmpType.value = 'сменный';
        els.wsEmpCalHint.hidden = false;
        fn.call({}, doc);
        assertEqual(els.wsEmpCalHint.hidden, true, 'сменный → подсказка скрыта');
    });

    test('CSS: .ws-emp-cal-hint + светлая тема', () => {
        assertTrue(/\.ws-emp-cal-hint\s*\{[^}]*font-size:\s*12\.5px/.test(INDEX_SRC),
            'правило .ws-emp-cal-hint (компактный текст)');
        assertTrue(/\[data-theme="light"\]\s*\.ws-emp-cal-hint\s*\{[^}]*color:\s*#777/.test(INDEX_SRC),
            'светлая тема подсказки');
    });
});

// ============================================================
// 3. Клиент: _plannedShiftAt — паритет с сервером
// ============================================================
describe('Task 320 — _plannedShiftAt: до старта пусто, дневной по неделе', () => {

    const PATTERNS = [
        { id: 1, cycle: 7, days: [
            { day: 1, status: 'Д8' }, { day: 2, status: 'Д8' }, { day: 3, status: 'Д8' },
            { day: 4, status: 'Д8' }, { day: 5, status: 'Д7,2' },
            { day: 6, status: '' }, { day: 7, status: '' } ] },
        { id: 2, cycle: 4, days: [
            { day: 1, status: 'Д' }, { day: 2, status: 'Н' },
            { day: 3, status: '' }, { day: 4, status: '' } ] },
        { id: 3, cycle: 5, days: [
            { day: 1, status: 'Д' }, { day: 2, status: 'Н' }, { day: 3, status: '' },
            { day: 4, status: '' }, { day: 5, status: '' } ] }
    ];

    function plannedAt(emp, isoDate) {
        const host = {
            _PATTERNS: PATTERNS,
            _parseIsoLocal: function(s) {
                const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
                return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
            }
        };
        const fn = methodFn(WS_CLIENT, '_plannedShiftAt')(null);   // document не используется
        return fn.call(host, isoDate, emp);
    }

    test('до даты старта цикла — плановой смены нет (обоим типам)', () => {
        assertEqual(plannedAt({ 'шаблон_ротации': 1, 'старт_цикла': '2026-09-04', 'тип': 'дневной' },
            '2026-09-03'), '', 'дневной: 03.09 до старта — пусто');
        assertEqual(plannedAt({ 'шаблон_ротации': 2, 'старт_цикла': '2026-09-04', 'тип': 'сменный' },
            '2026-09-03'), '', 'сменный: 03.09 до старта — пусто');
    });

    test('дневной, цикл 7: шаблон ложится на календарную неделю', () => {
        const emp = { 'шаблон_ротации': 1, 'старт_цикла': '2026-09-04', 'тип': 'дневной' };
        // 04.09.2026 — ПЯТНИЦА (пример пользователя): день 5 шаблона
        assertEqual(plannedAt(emp, '2026-09-04'), 'Д7,2', '04.09 пятница — день 5');
        assertEqual(plannedAt(emp, '2026-09-05'), '', '05.09 суббота — день 6 (выходной)');
        assertEqual(plannedAt(emp, '2026-09-06'), '', '06.09 воскресенье — день 7');
        assertEqual(plannedAt(emp, '2026-09-07'), 'Д8', '07.09 понедельник — день 1');
        assertEqual(plannedAt(emp, '2026-09-11'), 'Д7,2', '11.09 пятница — день 5');
        assertEqual(plannedAt(emp, '2026-09-12'), '', '12.09 суббота — пусто');
    });

    test('дневной, цикл ≠ 7: арифметика цикла от старта', () => {
        const emp = { 'шаблон_ротации': 3, 'старт_цикла': '2026-09-04', 'тип': 'дневной' };
        assertEqual(plannedAt(emp, '2026-09-04'), 'Д', 'день старта — день цикла 1');
        assertEqual(plannedAt(emp, '2026-09-05'), 'Н', 'день цикла 2 (календарь не участвует)');
    });

    test('сменный: цикл от старта, выходные не учитываются', () => {
        const emp = { 'шаблон_ротации': 2, 'старт_цикла': '2026-09-04', 'тип': 'сменный' };
        assertEqual(plannedAt(emp, '2026-09-04'), 'Д', '04.09 (пт) — день 1');
        assertEqual(plannedAt(emp, '2026-09-05'), 'Н', '05.09 (сб) — день 2: сменный работает');
        assertEqual(plannedAt(emp, '2026-09-06'), '', '06.09 (вс) — день 3 (выходной цикла)');
        assertEqual(plannedAt(emp, '2026-09-08'), 'Д', '08.09 — день 1 нового цикла');
    });
});

// ============================================================
// 4. Клиент: тосты генерации — «убрано N лишних смен»
// ============================================================
describe('Task 320 — тосты «Сформировать»: счётчик лишних смен', () => {

    test('JS: _doGenerateMonth — removedShift в тосте', () => {
        const m = methodText(WS_CLIENT, '_doGenerateMonth');
        assertTrue(m.indexOf('(data && data.removedShift) || 0') !== -1,
            'читает removedShift ответа');
        assertTrue(m.indexOf("', убрано ' + removedShift + ' лишних смен'") !== -1,
            'фраза тоста');
    });

    test('JS: _doGenerateYear — сумма removedShift в итоговом тосте', () => {
        const m = methodText(WS_CLIENT, '_doGenerateYear');
        assertTrue(m.indexOf('var totalRemovedShift = 0;') !== -1, 'аккумулятор');
        assertTrue(m.indexOf('(data && data.removedShift) || 0') !== -1,
            'суммирование по месяцам');
        assertTrue(m.indexOf("', убрано ' + totalRemovedShift +") !== -1,
            'итоговый тост');
    });
});

// ============================================================
// 5. Сервер: мок-инфраструктура Apps Script
// ============================================================
class MockSheet {
    constructor(rows) { this.rows = rows || []; }
    getLastRow() { return this.rows.length; }
    getRange(row, col, numRows, numCols) {
        numRows = numRows || 1; numCols = numCols || 1;
        const self = this;
        return {
            getValues() {
                const out = [];
                for (let r = row; r < row + numRows; r++) {
                    const line = [];
                    for (let c = col; c < col + numCols; c++) {
                        const rr = self.rows[r - 1];
                        line.push(rr ? (rr[c - 1] === undefined ? '' : rr[c - 1]) : '');
                    }
                    out.push(line);
                }
                return out;
            },
            setValues(vals) {
                for (let i = 0; i < vals.length; i++) {
                    const r = row + i;
                    while (self.rows.length < r) self.rows.push([]);
                    for (let c = 0; c < vals[i].length; c++) {
                        self.rows[r - 1][col - 1 + c] = vals[i][c];
                    }
                }
            },
            setValue(v) {
                while (self.rows.length < row) self.rows.push([]);
                self.rows[row - 1][col - 1] = v;
            },
            setNumberFormat() {}
        };
    }
    deleteRow(r) { this.rows.splice(r - 1, 1); }
    appendRow(arr) { this.rows.push(arr.slice()); }
}

const MOCK_UTILS = {
    findSessionByToken: () => ({ user_id: 1 }),
    findUserById: () => ({ role: 'Админ', email: 'test@example.com' }),
    audit: () => {}
};

// UrlFetchApp/CacheService — ПАРАМЕТРЫ фабрики (внутри .gs typeof
// проверяет их: undefined → фолбэк; мок → legalic)
function loadWS(sheets, urlFetchApp, cacheService) {
    const ss = { getSheetByName: (n) => sheets[n] || null };
    const factory = new Function('SpreadsheetApp', 'Utils', 'UrlFetchApp', 'CacheService',
        WS_GS_SRC + '\nreturn WorkSchedule;');
    return factory({ openById: () => ss }, MOCK_UTILS, urlFetchApp, cacheService);
}

// Шаблоны: 1 = 5/2 (дневной), 2 = сутки через двое (сменный)
function mkSheets(empRow, extraEntries, extraPatternDays) {
    const patternDays = extraPatternDays || [
        [1, 1, 'Д8'], [1, 2, 'Д8'], [1, 3, 'Д8'], [1, 4, 'Д8'],
        [1, 5, 'Д7,2'], [1, 6, ''], [1, 7, '']
    ];
    return {
        'Сотрудники': new MockSheet([
            ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон', 'старт_цикла', 'приём', 'увольнение', 'архив', 'должность', 'комментарий'],
            empRow
        ]),
        'Шаблоны_ротации': new MockSheet([
            ['id', 'name', 'cycle', 'desc'],
            [1, 'Пять/два 5/2', 7, ''],
            [2, 'Сутки через двое', 4, '']
        ]),
        'Дни_цикла': new MockSheet([
            ['pattern_id', 'day', 'status'],
            ...patternDays,
            [2, 1, 'Д'], [2, 2, 'Н'], [2, 3, ''], [2, 4, '']
        ]),
        'Инструктажи': new MockSheet([['id', 'таб', 'тип', 'тема', 'начало', 'конец', 'дней', 'комментарий']]),
        'Записи_графика': new MockSheet([
            ['дата', 'таб', 'статус', 'переработка', 'праздник', 'источник', 'обновлён', 'замещает', 'инструкция', 'комментарий'],
            ...(extraEntries || [])
        ]),
        'Отпуска': new MockSheet([['id', 'таб_номер', 'часть', 'дата_начала', 'дата_окончания', 'комментарий']])
    };
}

function entriesOf(sheets, tabNo) {
    return sheets['Записи_графика'].rows.slice(1)
        .filter(r => String(r[1]).trim() === tabNo)
        .map(r => ({ iso: iso(r[0]), s: String(r[2]).trim(), src: String(r[5]).trim() }));
}

function entryAt(sheets, tabNo, dateIso) {
    return entriesOf(sheets, tabNo).find(e => e.iso === dateIso) || null;
}

// legalic-мок: ВСЕ дни года с типами (WEEKEND по Сб/Вс + спецдни)
function legalicDays(year, specials) {
    const sp = specials || {};
    const days = [];
    let dt = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    while (dt < end) {
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        const mmdd = mm + dd;
        let type = 'WORKING';
        if (dt.getDay() === 0 || dt.getDay() === 6) type = 'WEEKEND';
        if (sp[mmdd]) type = sp[mmdd];
        days.push({ date: year + '-' + mm + '-' + dd, type: type });
        dt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1);
    }
    return days;
}

// ============================================================
// 6. Сервер: пример пользователя — дневной 5/2, старт 04.09.2026
// ============================================================
describe('Task 320 — сервер: шахматка дневного с установленной даты', () => {

    test('сентябрь 2026, старт 04.09 (пример заявки): до старта пусто, 05-06 выходные, с понедельника 5/2', () => {
        const sheets = mkSheets(['017', 'Иванов И.И.', 'дневной', '', 1, new Date(2026, 8, 4), '', '', 0, '', '']);
        const WS = loadWS(sheets, undefined, undefined);   // фолбэк-календарь
        const res = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertTrue(res.ok, 'generateMonth ок');
        const e = entriesOf(sheets, '017');
        assertEqual(e.length, 19, '19 рабочих дней (21 пн-пт минус… = 04 + 4 полные недели)');
        // до 04.09 — пусто
        for (const d of ['2026-09-01', '2026-09-02', '2026-09-03']) {
            assertEqual(entryAt(sheets, '017', d), null, d + ' до старта — пусто');
        }
        // 04.09 (пятница) — рабочая, день 5 шаблона
        const d04 = entryAt(sheets, '017', '2026-09-04');
        assertTrue(d04 && d04.s === 'Д7,2', '04.09 пятница — Д7,2 (день 5 шаблона)');
        // 05-06 — пустые выходные (заявка: «должны быть пустыми выходными»)
        assertEqual(entryAt(sheets, '017', '2026-09-05'), null, '05.09 суббота — пусто');
        assertEqual(entryAt(sheets, '017', '2026-09-06'), null, '06.09 воскресенье — пусто');
        // с понедельника — шахматка 5/2
        assertEqual(entryAt(sheets, '017', '2026-09-07').s, 'Д8', '07.09 пн — Д8');
        assertEqual(entryAt(sheets, '017', '2026-09-08').s, 'Д8', '08.09 вт — Д8');
        assertEqual(entryAt(sheets, '017', '2026-09-09').s, 'Д8', '09.09 ср — Д8');
        assertEqual(entryAt(sheets, '017', '2026-09-10').s, 'Д8', '10.09 чт — Д8');
        assertEqual(entryAt(sheets, '017', '2026-09-11').s, 'Д7,2', '11.09 пт — Д7,2');
        assertEqual(entryAt(sheets, '017', '2026-09-12'), null, '12.09 сб — пусто');
        assertEqual(entryAt(sheets, '017', '2026-09-13'), null, '13.09 вс — пусто');
        assertEqual(entryAt(sheets, '017', '2026-09-30').s, 'Д8', '30.09 ср — Д8');
        // источник авто
        assertEqual(d04.src, 'авто', 'запись авто (генерация)');
        assertEqual(res.data.removedShift, 0, 'лишних смен нет');
    });

    test('месяц ДО даты старта — ноль записей, generateMonth не падает', () => {
        const sheets = mkSheets(['017', 'Иванов И.И.', 'дневной', '', 1, new Date(2026, 8, 4), '', '', 0, '', '']);
        const WS = loadWS(sheets, undefined, undefined);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 8 });
        assertTrue(res.ok, 'август (до старта) — ок');
        assertEqual(entriesOf(sheets, '017').length, 0, 'записей нет');
    });

    test('сменный: цикл от старта, выходные НЕ гейтятся (заявка: «не касается сменного»)', () => {
        const sheets = mkSheets(['023', 'Петров П.П.', 'сменный', 1, 2, new Date(2026, 8, 4), '', '', 0, '', '']);
        const WS = loadWS(sheets, undefined, undefined);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertTrue(res.ok, 'ок');
        assertEqual(entryAt(sheets, '023', '2026-09-03'), null, 'до старта — пусто (и сменному)');
        assertEqual(entryAt(sheets, '023', '2026-09-04').s, 'Д', '04.09 (пт) — день 1');
        assertEqual(entryAt(sheets, '023', '2026-09-05').s, 'Н', '05.09 (сб) — день 2: сменный работает выходные');
        assertEqual(entryAt(sheets, '023', '2026-09-06'), null, '06.09 (вс) — день 3 цикла (выходной)');
        assertEqual(entryAt(sheets, '023', '2026-09-07'), null, '07.09 (пн) — день 4 цикла (выходной)');
        assertEqual(entryAt(sheets, '023', '2026-09-08').s, 'Д', '08.09 — новый цикл, день 1');
    });

    test('прочий тип («оператор», легаси-данные) — цикл, как сменный', () => {
        const sheets = mkSheets(['017', 'Иванов И.И.', 'оператор', '', 2, new Date(2026, 8, 4), '', '', 0, '', '']);
        const WS = loadWS(sheets, undefined, undefined);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertTrue(res.ok, 'ок');
        assertEqual(entryAt(sheets, '017', '2026-09-05').s, 'Н',
            'тип не «дневной» — календарный режим не включается');
    });

    test('дневной, цикл ≠ 7: цикл от старта + календарный гейт выходных', () => {
        // цикл 4 (сутки через двое), тип дневной: до старта пусто,
        // выходные отсеяны календарём, позиции цикла считают
        // КАЛЕНДАРНЫЕ дни от старта (выходные «сгорают» в позициях)
        const sheets = mkSheets(['017', 'Иванов И.И.', 'дневной', '', 2, new Date(2026, 8, 4), '', '', 0, '', '']);
        const WS = loadWS(sheets, undefined, undefined);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertTrue(res.ok, 'ок');
        assertEqual(entryAt(sheets, '017', '2026-09-04').s, 'Д', '04.09 (пт) — день 1');
        assertEqual(entryAt(sheets, '017', '2026-09-05'), null, '05.09 сб — пусто (календарный гейт)');
        assertEqual(entryAt(sheets, '017', '2026-09-06'), null, '06.09 вс — пусто');
        assertEqual(entryAt(sheets, '017', '2026-09-07'), null, '07.09 (пн) — день 4 цикла (выходной шаблона)');
        assertEqual(entryAt(sheets, '017', '2026-09-08').s, 'Д', '08.09 — новый цикл (4 календарных дня от старта), день 1');
        assertEqual(entryAt(sheets, '017', '2026-09-09').s, 'Н', '09.09 — день 2');
    });
});

// ============================================================
// 7. Сервер: производственный календарь (legalic / фолбэк)
// ============================================================
describe('Task 320 — сервер: производственный календарь', () => {

    test('legalic: перенесённый выходной 09.03.2026 (пн) — пусто; фолбэк — рабочий', () => {
        // март 2026: 08.03 (вс) праздник, 09.03 (пн) — перенесённый выходной
        const days = legalicDays(2026, { '0308': 'PUBLIC_HOLIDAY', '0309': 'TRANSFERRED_DAY_OFF' });
        const ufa = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ version: { versionId: 'x' }, days }) }) };

        const sh1 = mkSheets(['017', 'И.', 'дневной', '', 1, new Date(2026, 2, 2), '', '', 0, '', '']);
        const WS1 = loadWS(sh1, ufa, undefined);
        const res1 = WS1.generateMonth({ token: 't', year: 2026, month: 3 });
        assertTrue(res1.ok, 'ок');
        assertEqual(entryAt(sh1, '017', '2026-03-09'), null, 'legalic: 09.03 перенесённый выходной — пусто');
        assertEqual(entryAt(sh1, '017', '2026-03-08'), null, '08.03 праздник (вс) — пусто');
        assertEqual(entryAt(sh1, '017', '2026-03-10').s, 'Д8', '10.03 вт — рабочий');

        // фолбэк (без UrlFetchApp): переносов нет — 09.03 рабочий
        const sh2 = mkSheets(['017', 'И.', 'дневной', '', 1, new Date(2026, 2, 2), '', '', 0, '', '']);
        const WS2 = loadWS(sh2, undefined, undefined);
        WS2.generateMonth({ token: 't', year: 2026, month: 3 });
        assertEqual(entryAt(sh2, '017', '2026-03-09').s, 'Д8',
            'фолбэк: 09.03 — рабочий (переносов нет, документировано)');
        assertEqual(entryAt(sh2, '017', '2026-03-08'), null, '08.03 — праздник ст. 112 и в фолбэке');
    });

    test('фолбэк: праздник 04.11.2026 (ср) — пусто, 05.11 (чт) — рабочий', () => {
        const sheets = mkSheets(['017', 'И.', 'дневной', '', 1, new Date(2026, 10, 2), '', '', 0, '', '']);
        const WS = loadWS(sheets, undefined, undefined);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 11 });
        assertTrue(res.ok, 'ок');
        assertEqual(entryAt(sheets, '017', '2026-11-04'), null, '04.11 — День народного единства — пусто');
        assertEqual(entryAt(sheets, '017', '2026-11-05').s, 'Д8', '05.11 — рабочий');
    });

    test('День шахтёра 30.08.2026 — обычное воскресенье, НЕ праздник (Task 426)', () => {
        // фолбэк: 30.08 — воскресенье, нерабочий ПО ДНЮ НЕДЕЛИ
        // (карта праздников его НЕ содержит)
        const WSfb = loadWS(mkSheets(['017', 'И.', 'дневной', '', 1, new Date(2026, 7, 1), '', '', 0, '', '']),
            undefined, undefined);
        const calFb = WSfb._getProdCal(2026);
        assertTrue(!calFb.off['0830'],
            'фолбэк: 30.08 НЕ в карте праздников (выходной — по воскресенью)');
        const dAug30 = new Date(2026, 7, 30);
        assertTrue(WSfb._isNonWorkingDay(dAug30, calFb),
            'фолбэк: 30.08 нерабочий — как воскресенье');
        // legalic: 30.08 WEEKEND — нерабочий как обычное воскресенье
        const ufa = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ version: { versionId: 'x' }, days: legalicDays(2026) }) }) };
        const WSleg = loadWS(mkSheets(['017', 'И.', 'дневной', '', 1, new Date(2026, 7, 1), '', '', 0, '', '']),
            ufa, undefined);
        const calLeg = WSleg._getProdCal(2026);
        assertEqual(calLeg.off['0830'], 1, 'legalic: 30.08 (воскресенье) нерабочий');
        assertEqual(calLeg.full, true, 'legalic — полная карта');
    });

    test('Task 426: рабочий перенос на 30.08 НЕ перекрывается Днём шахтёра', () => {
        // раньше региональный оверлей возвращал бы этому воскресенью
        // выходной; заявка Task 426: день не гос. праздник — федеральный
        // календарь главнее
        const days = legalicDays(2026, { '0830': 'TRANSFERRED_WORKING' });
        const ufa = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ version: { versionId: 'x' }, days }) }) };
        const WS = loadWS(mkSheets(['017', 'И.', 'дневной', '', 1, new Date(2026, 7, 1), '', '', 0, '', '']),
            ufa, undefined);
        const cal = WS._getProdCal(2026);
        assertTrue(!cal.off['0830'],
            '30.08 РАБОЧИЙ (перенос) — наложения праздника нет');
        assertFalse(WS._isNonWorkingDay(new Date(2026, 7, 30), cal),
            'генерация поставит смену в последнее воскресенье августа');
    });

    test('legalic: рабочая суббота 26.09 — код дня 6 шаблона, обычные субботы пустые', () => {
        const days = legalicDays(2026, { '0926': 'TRANSFERRED_WORKING' });
        const ufa = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ version: { versionId: 'x' }, days }) }) };
        // шаблон с кодом «д» в субботу (день 6) — покажется ТОЛЬКО на рабочих субботах
        const sheets = mkSheets(['017', 'И.', 'дневной', '', 1, new Date(2026, 8, 1), '', '', 0, '', ''],
            null,
            [[1, 1, 'Д8'], [1, 2, 'Д8'], [1, 3, 'Д8'], [1, 4, 'Д8'],
             [1, 5, 'Д7,2'], [1, 6, 'д'], [1, 7, '']]);
        const WS = loadWS(sheets, ufa, undefined);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertTrue(res.ok, 'ок');
        const saturdays = entriesOf(sheets, '017').filter(e => new Date(e.iso).getDay() === 6);
        assertEqual(saturdays.length, 1, 'только одна суббота с записью');
        assertEqual(saturdays[0].iso, '2026-09-26', 'рабочая суббота 26.09');
        assertEqual(saturdays[0].s, 'д', 'код дня 6 шаблона (день в вых./праздник)');
    });

    test('UrlFetchApp бросает исключение → тихий фолбэк (генерация не падает)', () => {
        const ufa = { fetch: () => { throw new Error('net down'); } };
        const sheets = mkSheets(['017', 'И.', 'дневной', '', 1, new Date(2026, 10, 2), '', '', 0, '', '']);
        const WS = loadWS(sheets, ufa, undefined);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 11 });
        assertTrue(res.ok, 'сбой сети не валит генерацию');
        assertEqual(entryAt(sheets, '017', '2026-11-04'), null, 'праздник 04.11 учтён фолбэком');
        const cal = WS._getProdCal(2026);
        assertEqual(cal.full, false, 'календарь — фолбэк');
    });

    test('кэш CacheService: сеть дёргается один раз, второй вызов — из кэша', () => {
        const days = legalicDays(2026);
        let fetches = 0;
        const ufa = { fetch: () => { fetches++; return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ version: { versionId: 'x' }, days }) }; } };
        const store = {};
        let gets = 0, puts = 0;
        // CacheService Apps Script: getScriptCache() → { get, put }
        const scriptCache = {
            get: (k) => { gets++; return store[k] || null; },
            put: (k, v) => { puts++; store[k] = v; }
        };
        const cacheService = { getScriptCache: () => scriptCache };
        const sheets = mkSheets(['017', 'И.', 'дневной', '', 1, new Date(2026, 8, 4), '', '', 0, '', '']);
        const WS = loadWS(sheets, ufa, cacheService);
        WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertEqual(fetches, 1, 'первый вызов — запрос в сеть');
        assertEqual(puts, 1, 'ответ закэширован');
        // НОВОЕ выполнение (новая фабрика — как следующий месяц года):
        // память _prodCalMem не переживает, кэш скрипта — да
        const sheets2 = mkSheets(['017', 'И.', 'дневной', '', 1, new Date(2026, 8, 4), '', '', 0, '', '']);
        const WS2 = loadWS(sheets2, ufa, cacheService);
        WS2.generateMonth({ token: 't', year: 2026, month: 10 });
        assertEqual(fetches, 1, 'повторное выполнение — из кэша, без сети');
        assertEqual(gets, 2, 'обращения к кэшу зафиксированы');
    });
});

// ============================================================
// 8. Сервер: сверка 4.7 — устаревшие авто-смены
// ============================================================
describe('Task 320 — сервер: сверка авто-смен с новыми правилами', () => {

    test('авто до старта удалена (removedShift), ручная до старта жива, авто-«ОТ» не тронута', () => {
        const sheets = mkSheets(
            ['023', 'Петров П.П.', 'сменный', 1, 2, new Date(2026, 8, 4), '', '', 0, '', ''],
            [
                // устаревшая авто-смена ДО старта (старая генерация «разматывала» цикл назад)
                [new Date(2026, 8, 2), '023', 'Н', 0, 0, 'авто', new Date(), '', null, ''],
                // ручная правка ДО старта — приоритет ручной, не трогаем
                [new Date(2026, 8, 3), '023', 'Б', 0, 0, 'руч', new Date(), '', null, ''],
                // авто-«ОТ» до старта, покрытая отпуском — слой 4.5, сверка не трогает
                [new Date(2026, 8, 1), '023', 'ОТ', 0, 0, 'авто', new Date(), '', null, '']
            ]);
        // отпуск 31.08–01.09: покрывает ТОЛЬКО «ОТ»-строку 01.09 —
        // строка 02.09 (до старта, не в отпуске) должна уйти сверкой 4.7
        sheets['Отпуска'].rows.push([1, '023', 1, new Date(2026, 7, 31), new Date(2026, 8, 1), '']);
        const WS = loadWS(sheets, undefined, undefined);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertTrue(res.ok, 'ок');
        assertEqual(res.data.removedShift, 1, 'removedShift = 1 (авто-«Н» 02.09 до старта)');
        assertEqual(entryAt(sheets, '023', '2026-09-02'), null, 'авто-смена до старта удалена');
        const manual = entryAt(sheets, '023', '2026-09-03');
        assertTrue(manual && manual.s === 'Б' && manual.src === 'руч',
            'ручная правка до старта — жива (приоритет ручной)');
        const ot = entryAt(sheets, '023', '2026-09-01');
        assertTrue(ot && ot.s === 'ОТ', 'авто-«ОТ» (отпуск покрывает) — не тронута сверкой');
        // повтор — идемпотентность
        const res2 = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertEqual(res2.data.generated, 0, 'повтор: ничего не вставлено');
        assertEqual(res2.data.removedShift, 0, 'повтор: нечего убирать');
    });

    test('дневной: авто-смена на субботе (старая генерация) удалена, на празднике — тоже', () => {
        const sheets = mkSheets(
            ['017', 'Иванов И.И.', 'дневной', '', 1, new Date(2026, 8, 4), '', '', 0, '', ''],
            [
                // старая генерация поставила Д8 на субботу 05.09 и воскресенье 06.09
                [new Date(2026, 8, 5), '017', 'Д8', 0, 0, 'авто', new Date(), '', null, ''],
                [new Date(2026, 8, 6), '017', 'Д8', 0, 0, 'авто', new Date(), '', null, '']
            ]);
        const WS = loadWS(sheets, undefined, undefined);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertEqual(res.data.removedShift, 2, 'обе авто-смены на выходных удалены');
        assertEqual(entryAt(sheets, '017', '2026-09-05'), null, '05.09 сб — пусто');
        assertEqual(entryAt(sheets, '017', '2026-09-06'), null, '06.09 вс — пусто');
    });

    test('сверка не трогает сменного на выходных и сотрудников без шаблона', () => {
        const sheets = mkSheets(
            ['023', 'Петров П.П.', 'сменный', 1, 2, new Date(2026, 8, 4), '', '', 0, '', ''],
            [
                // сменный работает субботу 05.09 — законная смена
                [new Date(2026, 8, 5), '023', 'Н', 0, 0, 'авто', new Date(), '', null, '']
            ]);
        // второй сотрудник без шаблона с авто-записью (легаси) — сверка не владеет его планом
        sheets['Сотрудники'].rows.push(['099', 'Без Шаблона', 'сменный', '', '', '', '', '', 0, '', '']);
        sheets['Записи_графика'].rows.push(
            [new Date(2026, 8, 2), '099', 'Д', 0, 0, 'авто', new Date(), '', null, '']);
        const WS = loadWS(sheets, undefined, undefined);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertEqual(res.data.removedShift, 0, 'ничего лишнего не убрано');
        assertTrue(entryAt(sheets, '023', '2026-09-05') !== null, 'сменный на субботе — жив');
        assertTrue(entryAt(sheets, '099', '2026-09-02') !== null, 'без шаблона — не тронут');
    });

    test('счётчик removedShift в ответе и аудите', () => {
        const resIdx = WS_GS_SRC.indexOf('removedShift:      removedShift');
        assertTrue(resIdx !== -1, 'поле removedShift в data ответа');
        assertTrue(WS_GS_SRC.indexOf("', убрано смен вне правил ' + removedShift") !== -1,
            'счётчик в строке аудита');
    });
});

// ============================================================
// 9. Сервер: структура календаря (инварианты кода)
// ============================================================
describe('Task 320 — сервер: код календаря/генерации', () => {

    test('JS: _getProdCal/_isNonWorkingDay определены, _minersDayMmdd удалён (Task 426)', () => {
        for (const name of ['_getProdCal', '_isNonWorkingDay', '_mmdd']) {
            assertTrue(WS_GS_SRC.indexOf(name + ': function') !== -1, name + ' есть');
        }
        assertTrue(WS_GS_SRC.indexOf('_minersDayMmdd: function') === -1,
            'расчёт Дня шахтёра удалён из сервера (Task 426)');
        assertTrue(WS_GS_SRC.indexOf('_LEGALIC_URL') !== -1, 'URL legalic (как у клиента)');
        assertTrue(WS_GS_SRC.indexOf('CacheService.getScriptCache().put(') !== -1,
            'кэш скрипта 6 ч');
    });

    test('JS: _FIXED_HOLIDAYS — ст. 112 (8 + 6 дат)', () => {
        const m = WS_GS_SRC.match(/_FIXED_HOLIDAYS:\s*\{([\s\S]*?)\}/);
        assertTrue(m !== null, 'карта фиксированных праздников');
        const keys = m[1].match(/'(\d{4})'/g) || [];
        assertEqual(keys.length, 14, '14 дат: 01-08.01 + 23.02 + 08.03 + 01.05 + 09.05 + 12.06 + 04.11');
    });

    test('JS: шаг 3 — гейт старта и календарный режим', () => {
        const gen = WS_GS_SRC.slice(WS_GS_SRC.indexOf('generateMonth: function'));
        const step3 = gen.slice(0, gen.indexOf('// 4. (Task 303)'));
        assertTrue(step3.indexOf('if (dt.getTime() < startDate.getTime()) continue;') !== -1,
            'дни до старта пропускаются');
        assertTrue(step3.indexOf("var isDayWorker = String(emp.тип || '').trim() === 'дневной';") !== -1,
            'календарный режим — только тип «дневной»');
        assertTrue(step3.indexOf('this._isNonWorkingDay(dt, prodCal)') !== -1,
            'гейт нерабочих дней');
        assertTrue(step3.indexOf('dayOfCycle = (dw === 0) ? 7 : dw;') !== -1,
            'цикл 7: Пн=1..Вс=7 (по дням недели)');
    });

    test('JS: сверка 4.7 — после 4.6, до записи в лист', () => {
        const i47 = WS_GS_SRC.indexOf('// 4.7 (Task 320)');
        const i46 = WS_GS_SRC.indexOf('// 4.6 (Task 303) Сверка');
        const i5 = WS_GS_SRC.indexOf('// 5. Запись в лист');
        assertTrue(i46 !== -1 && i47 > i46, '4.7 после 4.6');
        assertTrue(i5 !== -1 && i47 < i5, '4.7 до записи в лист');
    });

    test('JS: паритет клиента и сервера — формулы совпадают', () => {
        // до старта: сервер continue, клиент return ''
        assertTrue(WS_GS_SRC.indexOf('if (dt.getTime() < startDate.getTime()) continue;') !== -1,
            'сервер: гейт старта');
        const client = methodText(WS_CLIENT, '_plannedShiftAt');
        assertTrue(client.indexOf('if (diffDays < 0) return \'\';') !== -1,
            'клиент: до старта — пусто');
        assertTrue(client.indexOf("pat.cycle === 7") !== -1 && client.indexOf('(dow === 0) ? 7 : dow') !== -1,
            'клиент: дневной цикл 7 — по дням недели');
    });
});

// ============================================================
// 10. SW
// ============================================================
describe('Task 320 — SW: версия кэша', () => {
    // Task 321: версия поднята дальше (v560) — здесь проверяем, что
    // минимум Task 320 (v559 → v560 в своё время) был сделан и что
    // v559 больше не существует
    test('SW: инкремент Task 320 состоялся (v559 ушел)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v742'") !== -1,
            'CACHE_VERSION = kipia-test-v742 (актуальная, Task 321)');
        assertFalse(SW_SRC.indexOf("kipia-test-v559") !== -1,
            'v559 больше не существует');
    });
});
