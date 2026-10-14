// tests/test-vacation-shift.js
// Task 305: «отпуск в приоритете, плановая смена — рядом» — бейдж
// плановой смены (Д/Н/Д8/Д7,2) на днях отпуска у работников с шаблоном
// ротации, в формате мероприятия (Task 303).
//
// СЦЕНАРИЙ (заявка пользователя): при автоматическом формировании
// шахматки по «Дни_цикла» и «Отпуска» у работников «сменный» код
// отпуска отображается В ПРИОРИТЕТЕ (основной код ячейки), а плановые
// смены день (Д) и ночь (Н) — бейджем в правом нижнем углу ячейки,
// в формате мероприятия.
//
// АРХИТЕКТУРА: сервер уже ставит отпуск выше смены (generateMonth,
// шаг 4.5, приоритет «ручная > отпуск > плановая смена > мероприятие»)
// — в Записи_графика пишется ТОЛЬКО код отпуска. Плановая смена дня
// НЕ хранится — клиент ВЫЧИСЛЯЕТ её по циклу (_plannedShiftAt — тот же
// алгоритм, что шаг 3 generateMonth) и рендерит бейдж. Схема листов
// и Apps Script НЕ меняются.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   Слой 1 — ПАРИТЕТ+СИМУЛЯЦИЯ: реальный generateMonth на мок-таблицах
//     (стенд 017, шаблон cycle 5 «Д/Н/вых×3», старт 01.01.2026):
//     A. паритет: без отпуска статус каждого дня месяца в
//        Записи_графика === вычислению клиента _plannedShiftAt
//        (алгоритмы сервера и клиента совпадают день в день)
//     B. отпуск 05–16.09: все 12 дней = «ОТ» (приоритет отпуска);
//        клиент на сменных днях отпуска (08,09,13,14) возвращает
//        Д/Н — данные бейджа; на цикловых выходных (05–07,10–12,15,16)
//        бейджа нет ('')
//     C. смены вне отпуска (03,04,18,19) сохранены кодами Д/Н —
//        бейдж на них не нужен (код уже основной)
//     D. идемпотентность повторной генерации (состояние стабильно)
//     E.edge: _plannedShiftAt — без шаблона/без старта/неизвестный id
//        шаблона/день до старта цикла (Task 320: до старта — пусто,
//        шахматка строится с установленной даты)/день
//        цикла без строки в Дни_цикла → '' (ячейка без бейджа)
//   Слой 2 — статические инварианты клиента (рендер бейджа в
//     _renderCell, формат мероприятия, тултип, loadGrid, CSS) и
//     сервера (приоритет 4.5 не тронут), SW v544.
//
// Запуск: через tests/run-all.js (require './test-vacation-shift.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

const WS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ============================================================
// Мок-инфраструктура Apps Script (как в test-work-events.js)
// ============================================================
class MockSheet {
    constructor(rows) {
        this.rows = rows || [];
    }
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
            setNumberFormat(fmt) { /* протокол не нужен: таб-столбцы не меняются */ }
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

function loadWS(sheets) {
    const ss = { getSheetByName: (n) => sheets[n] || null };
    const SpreadsheetApp = { openById: () => ss };
    const factory = new Function('SpreadsheetApp', 'Utils', WS_SRC + '\nreturn WorkSchedule;');
    return factory(SpreadsheetApp, MOCK_UTILS);
}

// Стенд: 017 «сменный», шаблон 1 (cycle 5: Д/Н/вых/вых/вых — как живой
// лист «Дни_цикла»), старт цикла 01.01.2026. Сентябрь 2026 по циклу:
// 01,02=вых; 03=Д; 04=Н; 05–07=вых; 08=Д; 09=Н; 10–12=вых; 13=Д; 14=Н;
// 15–17=вых; 18=Д; 19=Н; 20–22=вых; 23=Д; 24=Н; 25–27=вых; 28=Д; 29=Н;
// 30=вых.
function baseSheets() {
    return {
        'Сотрудники': new MockSheet([
            ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон', 'старт_цикла', 'приём', 'увольнение', 'архив', 'должность', 'комментарий'],
            ['017', 'Иванов И.И.', 'сменный', 1, 1, new Date(2026, 0, 1), '', '', 0, '', '']
        ]),
        'Шаблоны_ротации': new MockSheet([
            ['id', 'name', 'cycle', 'desc'],
            [1, 'Сутки через трое', 5, '']
        ]),
        'Дни_цикла': new MockSheet([
            ['pattern_id', 'day', 'status'],
            [1, 1, 'Д'], [1, 2, 'Н'], [1, 3, ''], [1, 4, ''], [1, 5, '']
        ]),
        'Инструктажи': new MockSheet([
            ['id', 'таб', 'тип', 'тема', 'начало', 'конец', 'дней', 'комментарий']
        ]),
        'Записи_графика': new MockSheet([
            ['дата', 'таб', 'статус', 'переработка', 'праздник', 'источник', 'обновлён', 'замещает', 'инструкция', 'комментарий']
        ]),
        'Отпуска': new MockSheet([
            ['id', 'таб_номер', 'часть', 'дата_начала', 'дата_окончания', 'комментарий']
        ])
    };
}

function entryAt(sheet, tabNo, dateIso) {
    for (let i = 1; i < sheet.rows.length; i++) {
        const r = sheet.rows[i];
        if (iso(r[0]) === dateIso && String(r[1]).trim() === tabNo) {
            return { s: r[2], src: r[5] };
        }
    }
    return null;
}
function iso(dt) {
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' +
           String(dt.getDate()).padStart(2, '0');
}

// ============================================================
// Извлечение РЕАЛЬНЫХ клиентских функций из index.html
// (проверяется именно тот код, что работает в браузере)
// ============================================================
const FN_MATCH = INDEX_SRC.match(/_plannedShiftAt: function\(isoDate, emp\) \{([\s\S]*?)\n        \}/);
const PARSE_MATCH = INDEX_SRC.match(/_parseIsoLocal: function\(iso\) \{([\s\S]*?)\n        \}/);

// Контекст клиента: шаблоны как их возвращает getPatterns
function makeClient(patterns) {
    const ctx = {
        _PATTERNS: patterns || [],
        _parseIsoLocal: new Function('iso', PARSE_MATCH[1])
    };
    ctx._plannedShiftAt = new Function('isoDate', 'emp', FN_MATCH[1]);
    return ctx;
}

const CLIENT_PATTERNS = [{
    id: 1, name: 'Сутки через трое', cycle: 5, description: '',
    days: [
        { day: 1, status: 'Д' }, { day: 2, status: 'Н' },
        { day: 3, status: '' }, { day: 4, status: '' }, { day: 5, status: '' }
    ]
}];
const CLIENT_EMP = {
    'таб_номер': '017', 'ФИО': 'Иванов И.И.', 'тип': 'сменный',
    'шаблон_ротации': 1, 'старт_цикла': '2026-01-01'
};

// ============================================================
// Слой 1: симуляция generateMonth + паритет с клиентом
// ============================================================
describe('Task 305 — симуляция: отпуск в приоритете, смена — бейдж', () => {

    test('A: ПАРИТЕТ сервер↔клиент — все дни месяца (без отпуска)', () => {
        const sheets = baseSheets();
        const WS = loadWS(sheets);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertTrue(res.ok, 'generateMonth вернул ok');

        const client = makeClient(CLIENT_PATTERNS);
        const daysInMonth = new Date(2026, 9, 0).getDate();
        let checked = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const isoD = '2026-09-' + String(d).padStart(2, '0');
            const planned = client._plannedShiftAt.call(client, isoD, CLIENT_EMP);
            const cell = entryAt(sheets['Записи_графика'], '017', isoD);
            if (planned === '') {
                assertEqual(cell, null,
                    isoD + ': цикловой выходной — записи нет (бейджа тоже)');
            } else {
                assertTrue(!!cell, isoD + ': запись смены есть');
                assertEqual(cell.s, planned,
                    isoD + ': статус записи === плановой смене клиента');
            }
            checked++;
        }
        assertEqual(checked, 30, 'проверены все 30 дней сентября');
    });

    test('B: отпуск 05–16.09 — все дни «ОТ», сменные дни дают данные бейджа', () => {
        const sheets = baseSheets();
        sheets['Отпуска'].rows.push(
            [1, '017', 2, new Date(2026, 8, 5), new Date(2026, 8, 16), '']);

        const WS = loadWS(sheets);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertTrue(res.ok);

        const client = makeClient(CLIENT_PATTERNS);

        // все 12 дней отпуска — «ОТ» (приоритет отпуска над сменой)
        for (let d = 5; d <= 16; d++) {
            const isoD = '2026-09-' + String(d).padStart(2, '0');
            const cell = entryAt(sheets['Записи_графика'], '017', isoD);
            assertTrue(!!cell, isoD + ': день отпуска записан');
            assertEqual(cell.s, 'ОТ', isoD + ': код отпуска в приоритете');
        }

        // сменные дни ПОД отпуском: запись «ОТ», клиент видит Д/Н (бейдж)
        const badgeDays = { 8: 'Д', 9: 'Н', 13: 'Д', 14: 'Н' };
        for (const d in badgeDays) {
            const isoD = '2026-09-' + String(d).padStart(2, '0');
            const planned = client._plannedShiftAt.call(client, isoD, CLIENT_EMP);
            assertEqual(planned, badgeDays[d],
                isoD + ': плановая смена для бейджа — ' + badgeDays[d]);
        }

        // цикловые выходные в отпуске — бейджа нет
        const noBadge = [5, 6, 7, 10, 11, 12, 15, 16];
        for (let i = 0; i < noBadge.length; i++) {
            const isoD = '2026-09-' + String(noBadge[i]).padStart(2, '0');
            const planned = client._plannedShiftAt.call(client, isoD, CLIENT_EMP);
            assertEqual(planned, '', isoD + ': выходной по циклу — бейджа нет');
        }
    });

    test('C: смены вне отпуска сохранены кодами (бейдж не нужен)', () => {
        const sheets = baseSheets();
        sheets['Отпуска'].rows.push(
            [1, '017', 2, new Date(2026, 8, 5), new Date(2026, 8, 16), '']);
        loadWS(sheets).generateMonth({ token: 't', year: 2026, month: 9 });

        assertEqual(entryAt(sheets['Записи_графика'], '017', '2026-09-03').s, 'Д',
            '03.09 — смена до отпуска');
        assertEqual(entryAt(sheets['Записи_графика'], '017', '2026-09-04').s, 'Н',
            '04.09 — смена до отпуска');
        assertEqual(entryAt(sheets['Записи_графика'], '017', '2026-09-18').s, 'Д',
            '18.09 — смена после отпуска');
        assertEqual(entryAt(sheets['Записи_графика'], '017', '2026-09-19').s, 'Н',
            '19.09 — смена после отпуска');
    });

    test('D: повторная генерация идемпотентна (данные стабильны)', () => {
        const sheets = baseSheets();
        sheets['Отпуска'].rows.push(
            [1, '017', 2, new Date(2026, 8, 5), new Date(2026, 8, 16), '']);
        loadWS(sheets).generateMonth({ token: 't', year: 2026, month: 9 });
        const rowsAfter1 = sheets['Записи_графика'].rows.length;
        loadWS(sheets).generateMonth({ token: 't', year: 2026, month: 9 });
        assertEqual(sheets['Записи_графика'].rows.length, rowsAfter1,
            'число строк не изменилось');
        assertEqual(entryAt(sheets['Записи_графика'], '017', '2026-09-08').s, 'ОТ',
            '«ОТ» на месте (день смены Д под отпуском)');
    });

    test('E: ручная правка на дне отпуска не тронута генерацией', () => {
        const sheets = baseSheets();
        sheets['Отпуска'].rows.push(
            [1, '017', 2, new Date(2026, 8, 5), new Date(2026, 8, 16), '']);
        // осознанная ручная правка на сменном дне внутри отпуска
        sheets['Записи_графика'].rows.push(
            [new Date(2026, 8, 8), '017', 'Б', 0, 0, 'руч', new Date(), '', null, '']);
        loadWS(sheets).generateMonth({ token: 't', year: 2026, month: 9 });
        const cell = entryAt(sheets['Записи_графика'], '017', '2026-09-08');
        assertEqual(cell.s, 'Б', 'ручная правка приоритетнее отпуска');
        assertEqual(cell.src, 'руч', 'источник — руч');
    });
});

describe('Task 305 — _plannedShiftAt: граничные случаи', () => {

    test('нет шаблона/нет старта/неизвестный шаблон → бейджа нет', () => {
        const client = makeClient(CLIENT_PATTERNS);
        assertEqual(client._plannedShiftAt.call(client, '2026-09-08',
            { 'шаблон_ротации': null, 'старт_цикла': '2026-01-01' }), '',
            'нет шаблона_ротации');
        assertEqual(client._plannedShiftAt.call(client, '2026-09-08',
            { 'шаблон_ротации': 1, 'старт_цикла': null }), '',
            'нет старт_цикла');
        assertEqual(client._plannedShiftAt.call(client, '2026-09-08',
            { 'шаблон_ротации': 99, 'старт_цикла': '2026-01-01' }), '',
            'шаблона нет в _PATTERNS');
        assertEqual(client._plannedShiftAt.call(client, '2026-09-08', null), '',
            'сотрудник не задан');
        assertEqual(client._plannedShiftAt.call(client, '2026-09-08', {}), '',
            'пустой сотрудник');
    });

    test('шаблоны не загружены (сбой getPatterns) → бейджей нет', () => {
        const client = makeClient([]);   // _PATTERNS = []
        assertEqual(client._plannedShiftAt.call(client, '2026-09-08', CLIENT_EMP), '',
            'пустой _PATTERNS — деградация без ошибки');
    });

    test('день ДО старта цикла (отрицательный diff) — плановой смены НЕТ (Task 320)', () => {
        // старт 10.09, проверяем 01.09: до даты старта плановой смены
        // нет — шахматка строится с установленной даты (заявка
        // Task 320: «до 04.09.2026 пустые дни»); день старта — день
        // цикла 1
        const client = makeClient(CLIENT_PATTERNS);
        const emp = { 'шаблон_ротации': 1, 'старт_цикла': '2026-09-10' };
        assertEqual(client._plannedShiftAt.call(client, '2026-09-01', emp), '',
            'Task 320: до старта цикла — пусто (без бейджа)');
        assertEqual(client._plannedShiftAt.call(client, '2026-09-10', emp), 'Д',
            'день старта — день цикла 1');
    });

    test('день цикла без строки в «Дни_цикла» → пусто', () => {
        const brokenPatterns = [{
            id: 1, name: 'X', cycle: 5, description: '',
            days: [{ day: 1, status: 'Д' }]   // строки 2–5 отсутствуют
        }];
        const client = makeClient(brokenPatterns);
        assertEqual(client._plannedShiftAt.call(client, '2026-09-04', CLIENT_EMP), '',
            'нет строки дня 2 — бейджа нет');
        assertEqual(client._plannedShiftAt.call(client, '2026-09-03', CLIENT_EMP), 'Д',
            'день 1 найден');
    });
});

// ============================================================
// Слой 2: статические инварианты клиента и сервера
// ============================================================
describe('Task 305 — клиент: рендер бейджа плановой смены', () => {

    test('JS: семейство отпусков _VAC_CODES (ОТ/У — без Б/ОВ/ПР)', () => {
        assertTrue(INDEX_SRC.indexOf("_VAC_CODES: ['ОТ', 'У']") !== -1,
            '_VAC_CODES объявлен: отпуск ежегодный + учебный');
    });

    test('JS: условие бейджа — только «сменный» + отпуск/план «Отпуска»', () => {
        assertTrue(INDEX_SRC.indexOf(
            "var empIsShift = String(emp['тип'] || '').trim() === 'сменный';") !== -1,
            'Task 306: фильтр по типу — бейдж только у сменных');
        assertTrue(INDEX_SRC.indexOf(
            'var vacMain = empIsShift &&') !== -1,
            'vacMain: условие типа в составе (дневные — без бейджа)');
        assertTrue(INDEX_SRC.indexOf(
            "((status && this._VAC_CODES.indexOf(status) >= 0) ||") !== -1,
            'vacMain: запись/правка с кодом отпуска');
        assertTrue(INDEX_SRC.indexOf("(!status && !!vacPlan));") !== -1,
            'vacMain: пустая ячейка внутри плана отпуска');
    });

    test('JS: бейдж в формате мероприятия (ws-ev-badge ws-ev-shift)', () => {
        assertTrue(INDEX_SRC.indexOf(
            '<span class="ws-ev-badge ws-ev-shift"') !== -1,
            'чип смены — класс бейджа мероприятия + семантический ws-ev-shift');
        assertTrue(INDEX_SRC.indexOf(
            "(shMeta.color ? ' style=\"background:' + shMeta.color") !== -1,
            'цвет чипа — из справочника кодов');
    });

    test('JS: контейнер .ws-ev-wrap — правый нижний угол, без наложения', () => {
        assertTrue(INDEX_SRC.indexOf('if (shiftChip && !evHtml) {') !== -1,
            'страховка: чип смены только при пустом слое мероприятий');
        assertTrue(INDEX_SRC.indexOf(
            "shiftWrap = '<span class=\"ws-ev-wrap\">' + shiftChip + '</span>';") !== -1,
            'тот же позиционный контейнер, что у мероприятий');
        assertTrue(INDEX_SRC.indexOf('evHtml + shiftWrap') !== -1,
            'бейдж в составе HTML ячейки');
    });

    test('JS: Task 311 — тултип смены убран; бейдж смены в ячейке жив', () => {
        // Task 311: пояснительные тултипы с ячеек шахматки убраны;
        // плановая смена дня отпуска остаётся бейджем в ячейке
        // (ws-ev-badge ws-ev-shift, код смены)
        assertFalse(INDEX_SRC.indexOf(
            "titleParts.push('по циклу (Дни_цикла): ' + shiftName);") !== -1,
            'строка тултипа с полным названием смены удалена (Task 311)');
        assertFalse(INDEX_SRC.indexOf('var shiftName =') !== -1,
            'переменная shiftName не собирается (тултипа нет)');
        assertTrue(INDEX_SRC.indexOf('ws-ev-shift') !== -1,
            'бейдж плановой смены (ws-ev-shift) в ячейке жив');
    });

    test('JS: loadGrid подгружает шаблоны ротации (свежий цикл)', () => {
        // Task 314: окно расширено — у loadGrid(force) появились
        // кэш-ветки до Promise.all; Task 476: сетевой путь вложен в
        // .then(idbTry) — this. → self. внутри замыкания, окно
        // 2600 → 3600 (KipDB-ветка ~600 симв.).
        const lg = INDEX_SRC.slice(INDEX_SRC.indexOf('loadGrid: function'),
                                    INDEX_SRC.indexOf('loadGrid: function') + 3600);
        assertTrue(lg.indexOf('self._loadPatterns(),') !== -1,
            '_loadPatterns в Promise.all сетки');
        assertTrue(lg.indexOf('_loadVacations()') !== -1,
            'план отпусков остался в наборе загрузки');
    });

    test('CSS: семантический хук .ws-ev-shift у бейджа', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-grid tbody td.ws-cell .ws-ev-badge.ws-ev-shift') !== -1,
            'правило-маркер переиспользования формата мероприятия');
    });
});

describe('Task 305 — сервер: приоритет отпуска не тронут (без правок GS)', () => {

    test('WorkSchedule.gs: приоритет «ручная > отпуск > смена > мероприятие»', () => {
        assertTrue(WS_SRC.indexOf('ручная правка > отпуск > плановая смена >') !== -1,
            'шапка приоритета на месте');
    });

    test('WorkSchedule.gs: шаг 4.5 перекрывает авто-смену кодом «ОТ»', () => {
        assertTrue(WS_SRC.indexOf("{ rowIndex: exV._rowIndex, status: 'ОТ', instruction_id: null }") !== -1,
            'обновление авто-записи на «ОТ» (смена под отпуском)');
        assertTrue(WS_SRC.indexOf("rv[2] = 'ОТ';") !== -1,
            'замена в toInsert (строка шага 3)');
    });

    test('SW: версия кэша kipia-test-v739 (Task 305 — клиент менялся)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v739'") !== -1,
            'CACHE_VERSION = kipia-test-v739');
    });
});
