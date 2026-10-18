// ============================================================
// Task 424 — заявка (kip8test): «Теперь необходимо проработать
// блок Мероприятия. В мероприятиях должны выбираться из списка
// обучение/прогул/примечание, и также вся информация должна
// архивироваться в архиве. Для этих целей нужно создать листы в
// файле табель_КИП_ИОС, и проверить функционал данного блока
// приложения на соответствие».
//
// СОСТОЯНИЕ БЛОКА (реализовано ранее):
//   • форма «Новое мероприятие» — select «Тип» РОВНО с тремя
//     пунктами обучение/прогул/примечание (Task 306/410);
//   • маршрутизация по типу: события → лист «Мероприятия»,
//     автосоздание листа первой записью (Task 405/413);
//   • архив: лист «Мероприятия» хранит записи ПОСТОЯННО, eventsAll
//     читает ВСЕ записи без фильтра года, карточка работника
//     листает годы стрелками «‹ год ›» (Task 408).
//
// НОВОЕ (Task 424):
//   • СЕРВЕР WorkSchedule.gs — eventsInit: разовая инициализация
//     ЛИСТА «Мероприятия» в файле табель_КИП_ИОС из редактора
//     Apps Script (как instrListInit): создаёт «Мероприятия»
//     (прежде́ний формат A..H — постоянный архив блока);
//     идемпотентно; существующий лист НЕ перезаписывается.
//   • Task 425 (заявка: «инструктажи менять не нужно, для
//     мероприятий — свои отдельные страницы, блоки не должны
//     влиять друг на друга»): eventsInit переработан — лист
//     «Инструктажи» НЕ создаётся и НЕ трогается, перенос строк
//     из него НЕ выполняется; сверка — ниже (1/2/4).
//
// ПРОВЕРКИ:
//   СЕРВЕР:
//   1) ГЛАВНЫЙ: пустая таблица → eventsInit создаёт ТОЛЬКО
//      «Мероприятия» с каноническими заголовками; «Инструктажи»
//      НЕ создаётся (Task 425);
//   2) существующие листы → 'existing', заголовки/строки НЕ
//      тронуты (пользовательские переименования выживают);
//   4) повторный запуск — идемпотентен;
//   5) listTrainings: eventsAll читает ВСЕ записи листа
//      «Мероприятия» (архив без фильтра года).
//   КЛИЕНТ (соответствие блока заявке):
//   6) select #wsTrType — РОВНО обучение/прогул/примечание;
//   7) _wtabYearRecords — события архивного года из _EVENTS_ALL
//      (стрелки «‹ год ›» показывают прошлое).
//   SW: kipia-test-v751.
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');

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

// сравнение массивов (assertEqual хелпера — только примитивы)
function assertArrayEqual(actual, expected, message) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) {
        throw new Error((message || 'массивы различаются') +
            ': ожидалось ' + e + ', получено ' + a);
    }
}

// ============================================================
// 1. SRC — сервер: eventsInit
// ============================================================
describe('Task 424 — SRC: сервер eventsInit (WorkSchedule.gs)', () => {

    test('ГЛАВНЫЙ (Task 425): метод eventsInit — ТОЛЬКО «Мероприятия», «Инструктажи» не трогает', () => {
        const fn = stripComments(methodText(WS_SRC, 'eventsInit'));
        assertTrue(fn.indexOf('_ensureEventsSheet') !== -1,
            '«Мероприятия» — через _ensureEventsSheet (Task 405)');
        assertTrue(fn.indexOf("sheets[this.EVENTS_SHEET] = evSheet ? 'existing' : 'created'") !== -1,
            'отчёт: существующий лист не перезаписывается');
        assertTrue(fn.indexOf('_ensureTrainingsSheet') === -1,
            '«Инструктажи» НЕ создаётся (заявка Task 425: инструктажи менять не нужно)');
        assertTrue(fn.indexOf('splitTrainingsSheet') === -1,
            'перенос строк из «Инструктажей» НЕ выполняется (блоки независимы)');
        assertTrue(fn.indexOf('this.TRAININGS_SHEET') === -1,
            'никаких обращений к листу «Инструктажи»');
        assertTrue(fn.indexOf('moved') === -1 && fn.indexOf('split') === -1,
            'в отчёте нет перенесённых строк');
    });

    test('wrapper-функция eventsInit() для редактора Apps Script', () => {
        assertTrue(/^function eventsInit\(\) \{/m.test(WS_SRC),
            'выбирается в выпадающем списке функций редактора');
        assertTrue(WS_SRC.indexOf('function eventsInit() {\n  var r = WorkSchedule.eventsInit();') !== -1,
            'вызывает метод + лог результата');
    });

    test('аудит инициализации', () => {
        assertTrue(WS_SRC.indexOf('WORKSCHEDULE_EVENTS_INIT') !== -1,
            'событие аудита WORKSCHEDULE_EVENTS_INIT');
    });

    test('регресс 405/413: маршрутизация и автосоздание не тронуты', () => {
        const add = stripComments(methodText(WS_SRC, 'addTraining'));
        assertTrue(add.indexOf('_ensureEventsSheet') !== -1 &&
                   add.indexOf('_ensureTrainingsSheet') !== -1,
            'addTraining по-прежнему создаёт лист при отсутствии');
        assertTrue(WS_SRC.indexOf("EVENTS_SHEET:       'Мероприятия'") !== -1,
            'имя листа «Мероприятия» прежнее');
    });
});

// ============================================================
// 2. SRC — клиент: соответствие блока заявке
// ============================================================
describe('Task 424 — SRC: клиент (index.html) — соответствие заявке', () => {

    test('select «Тип» — РОВНО обучение/прогул/примечание', () => {
        const i = INDEX_SRC.indexOf('<select id="wsTrType"');
        assertTrue(i !== -1, 'select #wsTrType на месте');
        const end = INDEX_SRC.indexOf('</select>', i);
        const sel = INDEX_SRC.slice(i, end);
        const opts = sel.match(/<option value="[^"]*">/g) || [];
        assertEqual(opts.length, 3,
            'ровно три пункта: ' + JSON.stringify(opts));
        assertTrue(sel.indexOf('<option value="обучение">обучение</option>') !== -1 &&
                   sel.indexOf('<option value="прогул">прогул</option>') !== -1 &&
                   sel.indexOf('<option value="примечание">примечание</option>') !== -1,
            'значения списка — обучение/прогул/примечание');
        assertFalse(/value="инструктаж"/.test(sel),
            'инструктаж в списке мероприятий НЕТ (Task 410)');
        assertFalse(/value="проверка_знаний"/.test(sel),
            'проверка знаний в списке мероприятий НЕТ');
    });

    test('архив: пулы событий и навигация по годам на месте', () => {
        assertTrue(INDEX_SRC.indexOf('_EVENTS_ALL') !== -1,
            'пул eventsAll (Task 408)');
        assertTrue(INDEX_SRC.indexOf("'Мероприятия · '") !== -1,
            'заголовок блока «Мероприятия · ‹год›»');
        assertTrue(methodText(INDEX_SRC, '_wtabYearRecords')
            .indexOf('this._EVENTS_ALL || []') !== -1,
            'записи года блока читаются из eventsAll (все годы)');
    });
});

// ============================================================
// 3. GAS-VM — сервер: события eventsInit на моках листов
// ============================================================
describe('Task 424 — GAS-VM: eventsInit', () => {

    class MockSheet {
        constructor(rows) { this.rows = rows || []; this.writeCount = 0; }
        getLastRow() { return this.rows.length; }
        getLastColumn() {
            let m = 0;
            for (const r of this.rows) m = Math.max(m, r.length);
            return m || 1;
        }
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
                getValue() {
                    const rr = self.rows[row - 1];
                    return rr ? (rr[col - 1] === undefined ? '' : rr[col - 1]) : '';
                },
                setValues(vals) {
                    self.writeCount++;
                    for (let i = 0; i < vals.length; i++) {
                        const r = row + i;
                        while (self.rows.length < r) self.rows.push([]);
                        for (let c = 0; c < vals[i].length; c++) {
                            self.rows[r - 1][col - 1 + c] = vals[i][c];
                        }
                    }
                },
                setValue(v) {
                    self.writeCount++;
                    while (self.rows.length < row) self.rows.push([]);
                    self.rows[row - 1][col - 1] = v;
                },
                clearContent() {
                    self.writeCount++;
                    for (let r = row; r < row + numRows; r++) {
                        const rr = self.rows[r - 1];
                        if (!rr) continue;
                        for (let c = col; c < col + numCols; c++) rr[c - 1] = '';
                    }
                },
                setNumberFormat() { return this; },
                setFontWeight() { return this; },
                setBackground() { return this; },
                setFontColor() { return this; }
            };
        }
        deleteRow(r) { this.rows.splice(r - 1, 1); }
        setFrozenRows() { this.frozen = true; }
    }

    const MOCK_UTILS = {
        findSessionByToken: () => ({ user_id: 1 }),
        findUserById: () => ({ role: 'Админ', email: 'test@example.com' }),
        audit: () => {}
    };

    function loadWS(sheets) {
        const ss = {
            getSheetByName: (n) => sheets[n] || null,
            insertSheet: (name) => {
                const s = new MockSheet([]);
                sheets[name] = s;
                return s;
            }
        };
        const SpreadsheetApp = { openById: () => ss };
        const factory = new Function('SpreadsheetApp', 'Utils', 'Logger',
            WS_SRC + '\nreturn WorkSchedule;');
        return factory(SpreadsheetApp, MOCK_UTILS, { log: () => {} });
    }

    const TR_HEAD = ['id', 'таб_номер', 'тип', 'тема',
                     'дата_проведения', 'выполнение', 'просрочен',
                     'комментарий'];
    const EV_HEAD = ['id', 'таб_номер', 'тип', 'тема', 'дата_начала',
                     'дата_окончания', 'длительность_дней', 'комментарий'];

    test('ГЛАВНЫЙ (Task 425): пустая таблица → создан ТОЛЬКО «Мероприятия», «Инструктажи» НЕ создан', () => {
        const sheets = { 'Сотрудники': new MockSheet([]) };
        const WS = loadWS(sheets);
        const r = WS.eventsInit();
        assertTrue(r.ok, 'ok');
        assertEqual(r.sheets['Мероприятия'], 'created',
            '«Мероприятия» создан');
        assertEqual(r.sheets['Инструктажи'], undefined,
            'в отчёте «Инструктажей» НЕТ — не трогается');
        assertArrayEqual(Object.keys(r.sheets), ['Мероприятия'],
            'в отчёте РОВНО один лист');
        assertEqual(sheets['Инструктажи'], undefined,
            'физически лист «Инструктажи» НЕ создан (инструктажи менять не нужно)');
        assertArrayEqual(sheets['Мероприятия'].rows[0].slice(0, 8), EV_HEAD,
            'заголовки «Мероприятий» — прежний формат');
        assertTrue(sheets['Мероприятия'].frozen,
            'строка заголовков закреплена');
    });

    test('существующие листы — НЕ перезаписываются (existing)', () => {
        const customTr = ['id', 'таб_номер', 'тип', 'тема', 'СВОЙ СТОЛБЕЦ'];
        const customEv = ['мой', 'набор', 'столбцов'];
        const sheets = {
            'Инструктажи': new MockSheet([customTr, [1, '017', 'инструктаж', 'ОТ', 'x']]),
            'Мероприятия': new MockSheet([customEv])
        };
        const WS = loadWS(sheets);
        const r = WS.eventsInit();
        assertEqual(r.sheets['Мероприятия'], 'existing',
            'лист уже есть — отчёт existing');
        assertEqual(r.sheets['Инструктажи'], undefined,
            '«Инструктажи» в отчёте НЕТ (Task 425 — не трогается)');
        assertEqual(sheets['Инструктажи'].rows[0], customTr,
            'пользовательские заголовки «Инструктажей» НЕ тронуты');
        assertEqual(sheets['Инструктажи'].rows[1][3], 'ОТ',
            'строки «Инструктажей» НЕ тронуты');
        assertEqual(sheets['Мероприятия'].rows[0], customEv,
            'заголовки «Мероприятий» НЕ перезаписаны');
    });

    test('повторный запуск — идемпотентен (existing, лишних строк нет)', () => {
        const sheets = { 'Инструктажи': new MockSheet([TR_HEAD]) };
        const WS = loadWS(sheets);
        WS.eventsInit();
        const r2 = WS.eventsInit();
        assertEqual(r2.sheets['Мероприятия'], 'existing');
        assertEqual(sheets['Мероприятия'].rows.length, 1,
            'лишних строк не появилось');
    });

    test('без «Инструктажей» → «Мероприятия» создаётся, «Инструктажи» НЕ появляется', () => {
        const sheets = { 'Сотрудники': new MockSheet([]) };
        const WS = loadWS(sheets);
        delete sheets['Инструктажи']; // гарантия отсутствия
        const r = WS.eventsInit();
        assertTrue(r.ok, 'инициализация не падает');
        assertTrue(sheets['Мероприятия'], '«Мероприятия» создан');
        assertEqual(sheets['Инструктажи'], undefined,
            '«Инструктажи» НЕ создан — блоки независимы (Task 425)');
    });
});

// ============================================================
// 4. GAS-VM — архив: eventsAll читает ВСЕ записи «Мероприятий»
// ============================================================
describe('Task 424 — GAS-VM: архив мероприятий (eventsAll)', () => {

    // мок-лист — как в блоке 3
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
                }
            };
        }
    }

    const MOCK_UTILS = {
        findSessionByToken: () => ({ user_id: 1 }),
        findUserById: () => ({ role: 'Админ', email: 't@e.com' }),
        audit: () => {}
    };

    function loadWS(sheets) {
        const ss = { getSheetByName: (n) => sheets[n] || null,
                     insertSheet: (n) => (sheets[n] = new MockSheet([])) };
        const factory = new Function('SpreadsheetApp', 'Utils', 'Logger',
            WS_SRC + '\nreturn WorkSchedule;');
        return factory({ openById: () => ss }, MOCK_UTILS, { log: () => {} });
    }

    test('eventsAll — ВСЕ годы записей листа «Мероприятия» (архив)', () => {
        const sheets = {
            'Инструктажи': new MockSheet([]),
            'Мероприятия': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_начала',
                 'дата_окончания', 'длительность_дней', 'комментарий'],
                [5, '017', 'обучение', 'ОТ 2024', new Date(2024, 2, 10), new Date(2024, 2, 10), 1, ''],
                [6, '017', 'прогул', 'Прогул 2025', new Date(2025, 5, 1), new Date(2025, 5, 1), 1, ''],
                [7, '017', 'примечание', 'Прим. 2026', new Date(2026, 0, 20), new Date(2026, 0, 20), 1, '']
            ])
        };
        const WS = loadWS(sheets);
        const r = WS.listTrainings({ token: 't', year: 2026 });
        assertTrue(r.ok);
        assertEqual(r.data.eventsAll.length, 3,
            'записи 2024/2025/2026 — ВСЕ, без фильтра года (архив)');
        assertEqual(r.data.trainings.length, 1,
            'годовой срез 2026 — только пересечение (для бейджей/печати)');
    });
});

// ============================================================
// 5. VM — клиент: архивный год блока «Мероприятия»
// ============================================================
describe('Task 424 — VM: _wtabYearRecords — события архивного года', () => {

    test('2025: события из _EVENTS_ALL попадают в evs, инструктажи — в ins', () => {
        const host = new Function('return ({' +
            methodText(INDEX_SRC, '_wtabYearRecords') + ',' +
            methodText(INDEX_SRC, '_isInstrType') + ',' +
            '_INSTR_ALL: [], _EVENTS_ALL: [], _TRAININGS: []});')();
        host._EVENTS_ALL = [
            { id: 50, 'таб_номер': '017', тип: 'обучение',
              тема: 'ОТ 2025', дата_начала: '2025-03-10', дата_окончания: '2025-03-10' },
            { id: 51, 'таб_номер': '018', тип: 'прогул',
              тема: 'Прогул', дата_начала: '2026-04-01', дата_окончания: '2026-04-01' },
            { id: 52, 'таб_номер': '017', тип: 'примечание',
              тема: 'Прим', дата_начала: '2026-07-05', дата_окончания: '2026-07-05' }
        ];
        host._INSTR_ALL = [
            { id: 60, 'таб_номер': '017', тип: 'инструктаж',
              тема: 'ОТ', дата_начала: '2025-06-01', дата_окончания: '2025-06-01' }
        ];
        const r = host._wtabYearRecords('017', 2025);
        assertEqual(r.evs.length, 1, 'событие 2025 года работника 017');
        assertEqual(r.evs[0].id, 50, 'именно архивная запись eventsAll');
        assertEqual(r.ins.length, 1, 'инструктаж 2025 — в ins');
        const r26 = host._wtabYearRecords('018', 2026);
        assertEqual(r26.evs.length, 1, 'запись ДРУГОГО работника не смешалась');
    });
});

// ============================================================
// 6. SW — версия кэша
// ============================================================
describe('Task 424 — SW: версия кэша', () => {
    test('CACHE_VERSION = kipia-test-v751', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v751'") !== -1,
            'SW v651 (Task 424)');
        assertTrue(SW_SRC.indexOf('kipia-test-v752') === -1,
            'двойной бамп отсутствует');
    });
});
