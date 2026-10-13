// tests/test-work-events.js
// Task 303: «два значения в одной ячейке» — слой мероприятий (И/ОБ/ПЗ).
//
// СЦЕНАРИЙ: у работника в рабочий день инструктаж или проверка знаний —
// ячейка показывает код смены + бейдж мероприятия. Смена — основной код
// (Записи_графика), мероприятие — слой из листа «Инструктажи» (клиент
// рендерит бейдж, связка — колонка I). Код И/ОБ/ПЗ в Записи_графика
// попадает только на день БЕЗ плановой смены (мероприятие в выходной).
//
// ЧТО ПРОВЕРЯЕТСЯ (двумя слоями):
//   Слой 1 — СИМУЛЯЦИЯ сервера: WorkSchedule.gs загружается в Node с
//   мок-таблицами (SpreadsheetApp/Utils инъекцией), generateMonth
//   прогоняется по-настоящему:
//     A. инструктаж на сменном дне → смена НЕ затёрта, FK=id (toInsert)
//     B. мероприятие на дне БЕЗ смены → вставлена строка И/ОБ/ПЗ
//     C. отпуск перекрывает день с мероприятием → «ОТ» (приоритет)
//     D. регенерация после удаления мероприятия → строка снята (шаг 4.6)
//     E. старая И-строка на сменном дне (генерация до Task 303) →
//        смена восстановлена, FK очищен (шаг 4.6)
//     F. ручная И-строка сверков не трогается (приоритет ручной правки)
//     G. два мероприятия в один день (И + ПЗ) → смена сохранена
//     H. тип мероприятия изменён (инструктаж → обучение) на дне без
//        смены → строка «И» обновлена в «ОБ»
//     I. счётчики ответа: trainingDays / eventGenerated / eventRestored /
//        eventRemoved
//     K. идемпотентность: повторный прогон без изменений данных —
//        вторая генерация ничего не вставляет и не обновляет
//   Слой 2 — статические инварианты клиента/сервера (рендер бейджа,
//   попап «Мероприятия в этот день», быстрое добавление, шаг 4.6).
//
// Запуск: через tests/run-all.js (require './test-work-events.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

const WS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// ============================================================
// Мок-инфраструктура Apps Script (как в test-vacations-generate.js)
// ============================================================
class MockSheet {
    constructor(rows) {
        this.rows = rows || [];   // включая строку 1 (шапка)
        this.fmtCalls = [];       // Task 304: вызовы setNumberFormat
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
            // Task 304: реальный Sheets применяет формат к ячейке;
            // мок только протоколирует вызов — тесты проверяют,
            // что таб-ячейкам ставится '@' ДО записи значения
            setNumberFormat(fmt) {
                self.fmtCalls.push({ row: row, col: col,
                                     numRows: numRows, numCols: numCols, fmt: fmt });
            }
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

// Загрузка WorkSchedule.gs как модуля с инъекцией глобалов
function loadWS(sheets) {
    const ss = { getSheetByName: (n) => sheets[n] || null };
    const SpreadsheetApp = { openById: () => ss };
    const factory = new Function('SpreadsheetApp', 'Utils', WS_SRC + '\nreturn WorkSchedule;');
    return factory(SpreadsheetApp, MOCK_UTILS);
}

// Стенд: 017, шаблон cycle 4 (Д/Н/—/—), старт цикла 01.01.2026.
// Август 2026: 10.08 — плановая «Н» (день цикла 2), 11.08 — выходной.
function baseSheets() {
    return {
        'Сотрудники': new MockSheet([
            ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон', 'старт_цикла', 'приём', 'увольнение', 'архив', 'должность', 'комментарий'],
            ['017', 'Иванов И.И.', 'оператор', '', 1, new Date(2026, 0, 1), '', '', 0, '', '']
        ]),
        'Шаблоны_ротации': new MockSheet([
            ['id', 'name', 'cycle', 'desc'],
            [1, 'Сутки через двое', 4, '']
        ]),
        'Дни_цикла': new MockSheet([
            ['pattern_id', 'day', 'status'],
            [1, 1, 'Д'], [1, 2, 'Н'], [1, 3, ''], [1, 4, '']
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
            return { s: r[2], instr: r[8], src: r[5] };
        }
    }
    return null;
}
function iso(dt) {
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' +
           String(dt.getDate()).padStart(2, '0');
}

// ============================================================
// Слой 1: симуляция generateMonth (слой мероприятий)
// ============================================================
describe('Task 303 — симуляция generateMonth: слой мероприятий', () => {

    test('A: инструктаж на сменном дне — смена НЕ затёрта, FK проставлен', () => {
        const sheets = baseSheets();
        sheets['Инструктажи'].rows.push(
            [1, '017', 'инструктаж', 'Повторный инструктаж по ОТ и ПБ',
             new Date(2026, 7, 10), new Date(2026, 7, 10), 1, '']);

        const WS = loadWS(sheets);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 8 });
        assertTrue(res.ok, 'generateMonth вернул ok');

        const cell = entryAt(sheets['Записи_графика'], '017', '2026-08-10');
        assertTrue(!!cell, 'строка 10.08 есть');
        assertEqual(cell.s, 'Н', 'Task 303: плановая смена «Н» сохранена (не «И»)');
        assertEqual(cell.instr, 1, 'связка инструкция=1 (колонка I)');
        assertEqual(cell.src, 'авто', 'источник — авто');
        assertEqual(res.data.eventGenerated, 0, 'строк И/ОБ/ПЗ не вставлялось');
        assertEqual(res.data.trainingDays, 1, 'день покрыт мероприятием (бейдж)');
    });

    test('B: мероприятие на дне БЕЗ смены — вставлена строка кода', () => {
        const sheets = baseSheets();
        sheets['Инструктажи'].rows.push(
            [2, '017', 'проверка_знаний', 'Допуск до 1000В',
             new Date(2026, 7, 11), new Date(2026, 7, 11), 1, '']);

        const WS = loadWS(sheets);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 8 });
        assertTrue(res.ok);

        const cell = entryAt(sheets['Записи_графика'], '017', '2026-08-11');
        assertTrue(!!cell, 'строка 11.08 вставлена');
        assertEqual(cell.s, 'ПЗ', 'код мероприятия — ПЗ (день без смены)');
        assertEqual(cell.instr, 2, 'связка инструкция=2');
        assertEqual(res.data.eventGenerated, 1, 'eventGenerated=1');
    });

    test('C: отпуск перекрывает день с мероприятием — «ОТ»', () => {
        const sheets = baseSheets();
        sheets['Инструктажи'].rows.push(
            [1, '017', 'инструктаж', 'Повторный инструктаж',
             new Date(2026, 7, 10), new Date(2026, 7, 10), 1, '']);
        sheets['Отпуска'].rows.push(
            [1, '017', 1, new Date(2026, 7, 10), new Date(2026, 7, 12), '']);

        const WS = loadWS(sheets);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 8 });
        assertTrue(res.ok);

        const cell = entryAt(sheets['Записи_графика'], '017', '2026-08-10');
        assertEqual(cell.s, 'ОТ', 'приоритет: отпуск > смена/мероприятие');
    });

    test('D: регенерация после удаления мероприятия — строка снята (4.6)', () => {
        const sheets = baseSheets();
        sheets['Инструктажи'].rows.push(
            [2, '017', 'проверка_знаний', 'Допуск до 1000В',
             new Date(2026, 7, 11), new Date(2026, 7, 11), 1, '']);
        loadWS(sheets).generateMonth({ token: 't', year: 2026, month: 8 });
        const cell1 = entryAt(sheets['Записи_графика'], '017', '2026-08-11');
        assertEqual(cell1.s, 'ПЗ', 'первая генерация вставила ПЗ');

        // мероприятие удалено из листа «Инструктажи»
        sheets['Инструктажи'].rows.pop();
        const res = loadWS(sheets).generateMonth({ token: 't', year: 2026, month: 8 });
        const cell2 = entryAt(sheets['Записи_графика'], '017', '2026-08-11');
        assertEqual(cell2, null, 'Task 303 (4.6): устаревшая строка ПЗ удалена');
        assertEqual(res.data.eventRemoved, 1, 'eventRemoved=1');
    });

    test('E: старая И-строка на сменном дне — смена восстановлена (4.6)', () => {
        const sheets = baseSheets();
        // генерация ДО Task 303 затирала смену кодом мероприятия
        sheets['Записи_графика'].rows.push(
            [new Date(2026, 7, 10), '017', 'И', 0, 0, 'авто', new Date(), '', 9, '']);

        const WS = loadWS(sheets);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 8 });

        const cell = entryAt(sheets['Записи_графика'], '017', '2026-08-10');
        assertEqual(cell.s, 'Н', 'смена «Н» восстановлена из-под «И»');
        assertEqual(cell.instr, null, 'связка с удалённым мероприятием очищена');
        assertEqual(res.data.eventRestored, 1, 'eventRestored=1');
    });

    test('F: ручная И-строка сверков не трогается', () => {
        const sheets = baseSheets();
        sheets['Записи_графика'].rows.push(
            [new Date(2026, 7, 10), '017', 'И', 0, 0, 'руч', new Date(), '', null, 'осознанная правка']);

        const WS = loadWS(sheets);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 8 });

        const cell = entryAt(sheets['Записи_графика'], '017', '2026-08-10');
        assertEqual(cell.s, 'И', 'ручная «И» сохранена (приоритет ручной правки)');
        assertEqual(cell.src, 'руч', 'источник — руч');
        assertEqual(res.data.eventRestored, 0, 'восстановлений нет');
        assertEqual(res.data.eventRemoved, 0, 'удалений нет');
    });

    test('G: два мероприятия в один день (И + ПЗ) — смена сохранена', () => {
        const sheets = baseSheets();
        sheets['Инструктажи'].rows.push(
            [1, '017', 'инструктаж', 'Инструктаж ОТ', new Date(2026, 7, 10), new Date(2026, 7, 10), 1, ''],
            [2, '017', 'проверка_знаний', 'ПЗ до 1000В', new Date(2026, 7, 10), new Date(2026, 7, 10), 1, '']);

        const WS = loadWS(sheets);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 8 });

        const cell = entryAt(sheets['Записи_графика'], '017', '2026-08-10');
        assertEqual(cell.s, 'Н', 'смена «Н» — оба мероприятия бейджами на клиенте');
        assertEqual(res.data.trainingDays, 1, 'trainingDays — уникальные дни (1, не 2)');
        // связка (колонка I) — одно FK: последнее прошедшее сверку
        assertTrue(cell.instr === 1 || cell.instr === 2,
            'связка с одним из мероприятий: ' + cell.instr);
    });

    test('H: тип мероприятия изменён — строка обновлена «И» → «ОБ»', () => {
        const sheets = baseSheets();
        // день без смены, прошлая генерация поставила «И»
        sheets['Инструктажи'].rows.push(
            [7, '017', 'обучение', 'Обучение по ОТ и ПБ',
             new Date(2026, 7, 11), new Date(2026, 7, 11), 1, '']);
        sheets['Записи_графика'].rows.push(
            [new Date(2026, 7, 11), '017', 'И', 0, 0, 'авто', new Date(), '', 7, '']);

        const WS = loadWS(sheets);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 8 });

        const cell = entryAt(sheets['Записи_графика'], '017', '2026-08-11');
        assertEqual(cell.s, 'ОБ', 'код приведён к типу мероприятия (обучение)');
        assertEqual(cell.instr, 7, 'связка сохранена');
    });

    test('I: счётчики в ответе generateMonth', () => {
        const sheets = baseSheets();
        sheets['Инструктажи'].rows.push(
            [1, '017', 'инструктаж', 'Инструктаж ОТ', new Date(2026, 7, 10), new Date(2026, 7, 10), 1, '']);
        const res = loadWS(sheets).generateMonth({ token: 't', year: 2026, month: 8 });
        ['trainingDays', 'eventGenerated', 'eventRestored', 'eventRemoved']
            .forEach(k => {
                assertTrue(k in res.data, 'счётчик ' + k + ' в ответе');
            });
    });

    test('K: идемпотентность — повторный прогон без правок', () => {
        const sheets = baseSheets();
        sheets['Инструктажи'].rows.push(
            [1, '017', 'инструктаж', 'Инструктаж ОТ', new Date(2026, 7, 10), new Date(2026, 7, 10), 1, '']);
        const WS = loadWS(sheets);
        WS.generateMonth({ token: 't', year: 2026, month: 8 });
        const snapshot = (sh) => JSON.stringify(sh['Записи_графика'].rows.slice(1).map(
            r => [iso(r[0]), r[1], r[2], r[8]]));
        const rowsAfter1 = snapshot(sheets);

        const res2 = WS.generateMonth({ token: 't', year: 2026, month: 8 });
        const rowsAfter2 = snapshot(sheets);
        assertEqual(rowsAfter1, rowsAfter2, 'данные не изменились');
        assertEqual(res2.data.eventGenerated, 0, 'второй прогон: вставок мероприятий нет');
        assertEqual(res2.data.eventRestored, 0, 'второй прогон: восстановлений нет');
        assertEqual(res2.data.eventRemoved, 0, 'второй прогон: удалений нет');
    });
});

// ============================================================
// Слой 2: статические инварианты клиента и сервера
// ============================================================
describe('Task 303 — клиент: бейдж мероприятия в ячейке', () => {

    test('JS: слой мероприятий — константы кодов', () => {
        assertTrue(INDEX_SRC.indexOf("_EVENT_CODES: ['И', 'ОБ', 'ПЗ', 'ПР', '*']") !== -1,
            '_EVENT_CODES объявлен (Task 306: + ПР и *)');
        assertTrue(INDEX_SRC.indexOf("_ABSENCE_CODES: ['ОТ', 'У', 'ОВ', 'Б', 'ПР']") !== -1,
            '_ABSENCE_CODES объявлен (Task 314: бейджи видны и на днях отсутствия — константа-справочник)');
    });

    test('JS: хелперы слоя — _eventsAt / _trainingCodeOf / _statusMeta', () => {
        assertTrue(INDEX_SRC.indexOf('_eventsAt: function') !== -1);
        assertTrue(INDEX_SRC.indexOf('_trainingCodeOf: function') !== -1);
        assertTrue(INDEX_SRC.indexOf('_statusMeta: function') !== -1);
    });

    test('JS: _renderCell рендерит бейдж (ws-ev-wrap / ws-ev-badge / ws-has-events)', () => {
        assertTrue(INDEX_SRC.indexOf('ws-ev-wrap') !== -1, 'контейнер бейджей');
        assertTrue(INDEX_SRC.indexOf('ws-ev-badge') !== -1, 'чип бейджа');
        assertTrue(INDEX_SRC.indexOf("classes.push('ws-has-events')") !== -1,
            'класс ячейки с мероприятиями');
        // Task 314: статус-мероприятие (И/ОБ/ПЗ/ПР/* как основной код
        // от generateMonth) рисуется ТОЛЬКО бейджем — виртуальное
        // событие из статуса, если записи в «Инструктажи» нет
        assertTrue(INDEX_SRC.indexOf('events = events.concat([{ code: status, training: null }]);') !== -1,
            'виртуальный бейдж из статуса-мероприятия (событие удалено — день не «слепнет»)');
        // Task 388 (заявка: «цвет фона миниатюр всегда должен
        // соответствовать установленному»): пунктирные удалены
        assertTrue(INDEX_SRC.indexOf('ws-ev-pending') === -1,
            'пунктирных бейджей больше нет (Task 388: фон всегда цвет кода)');
    });

    test('JS: бейдж на пустой ячейке — СПЛОШНОЙ с цветом кода (Task 388)', () => {
        assertFalse(INDEX_SRC.indexOf('ws-ev-pending') !== -1,
            'пунктирного бейджа-подсказки больше нет (Task 388)');
        // Task 311: пояснительный тултип убран — подсказка
        // «заполнится при Сформировать» больше не в title
        assertFalse(INDEX_SRC.indexOf('заполнится кодом «') !== -1,
            'тултип «заполнится кодом … при Сформировать» удалён (Task 311)');
    });

    test('CSS: бейдж — правый нижний угол, тёмный текст, обе темы', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-grid tbody td.ws-cell .ws-ev-wrap') !== -1,
            'позиционирование контейнера бейджей');
        assertTrue(INDEX_SRC.indexOf('.ws-grid tbody td.ws-cell .ws-ev-badge') !== -1,
            'стиль чипа бейджа');
        // Task 388: правила ws-ev-pending удалены (пунктирных бейджей нет)
        assertFalse(INDEX_SRC.indexOf('.ws-ev-badge.ws-ev-pending') !== -1,
            'правил пунктирного бейджа больше нет (Task 388)');
    });

    test('JS: Task 311 — тултип мероприятий убран; тема — в окне мероприятий', () => {
        // Task 311: пояснительные тултипы с ячеек убраны; мероприятия
        // с темой показывает окно «Мероприятия в этот день» (Task 313:
        // отдельное окно НАД окном кодов, _renderEventsPopup)
        assertFalse(/titleParts\.push\(\(evtMeta\.name/.test(INDEX_SRC),
            'строка тултипа мероприятия удалена');
        const popupPart = INDEX_SRC.slice(
            INDEX_SRC.indexOf('_renderCellPopup: function'),
            INDEX_SRC.indexOf('_openCellPopup: function'));
        assertTrue(popupPart.indexOf('deT.тема') !== -1,
            'тема мероприятия — в окне «Мероприятия в этот день»');
    });
});

describe('Task 303 — клиент: попап ячейки и быстрое добавление', () => {

    test('JS: окно «Мероприятия в этот день» (Task 313 — отдельное окно)', () => {
        assertTrue(INDEX_SRC.indexOf('Мероприятия в этот день') !== -1, 'заголовок окна');
        assertTrue(INDEX_SRC.indexOf('ws-popup-event') !== -1, 'класс справочной строки');
    });

    test('JS: «+ Мероприятие…» — быстрое добавление из попапа', () => {
        assertTrue(INDEX_SRC.indexOf('onPopupAddEvent') !== -1, 'обработчик onPopupAddEvent');
        assertTrue(INDEX_SRC.indexOf('+ Мероприятие…') !== -1, 'строка добавления в попапе');
    });

    test('JS: openTrainingForm принимает префилл (сотрудник + дата)', () => {
        // Task 309: третий параметр editTraining — режим правки;
        // префилл сотрудника/даты остался (быстрое добавление Task 303)
        assertTrue(INDEX_SRC.indexOf('openTrainingForm: function(prefillTab, prefillDate, editTraining, prefillType)') !== -1,
            'сигнатура с параметрами префилла + правки (Task 405: +prefillType — тип по умолчанию из кнопки входа)');
        // Task 411: список фамилий убран — работник карточки входа
        // отображается статичной строкой «ФИО · таб. №»
        assertTrue(INDEX_SRC.indexOf("empDiv.textContent = emp['ФИО'] + ' · таб. №' + emp['таб_номер'];") !== -1,
            'сотрудник карточки — статичная строка формы (Task 411)');
        assertTrue(INDEX_SRC.indexOf('var today = prefillDate || this._isoDate(new Date());') !== -1,
            'дата ячейки подставляется (фолбэк — сегодня)');
        // Task 309: режим правки — префилл значений записи + заголовок
        assertTrue(INDEX_SRC.indexOf("sheetTitle.textContent = this._trInstrMode") !== -1 &&
                   INDEX_SRC.indexOf("'Правка мероприятия'") !== -1,
            'режим правки меняет заголовок шторки (Task 410 — тернарник)');
        assertTrue(INDEX_SRC.indexOf("submitBtn.textContent = 'Сохранить'") !== -1,
            'режим правки меняет подпись кнопки');
    });

    test('JS: после addTraining/deleteTraining шахматка перезагружается', () => {
        const addPart = INDEX_SRC.slice(INDEX_SRC.indexOf('workSchedule.addTraining'));
        // Task 314: loadGrid(true) — после правок только сеть
        assertTrue(addPart.indexOf('self.loadGrid(true);') !== -1,
            'addTraining → loadGrid(true) (бейдж появляется сразу)');
        const delPart = INDEX_SRC.slice(INDEX_SRC.indexOf('_doDeleteTraining: function'));
        assertTrue(delPart.indexOf('self.loadGrid(true);') !== -1,
            'deleteTraining → loadGrid(true) (бейдж исчезает сразу)');
    });
});

describe('Task 303 — сервер: генерация со слоем мероприятий', () => {

    test('_isEventStatusCode: И/ОБ/ПЗ/ПР/* — true, остальное — false', () => {
        assertTrue(WS_SRC.indexOf('_isEventStatusCode: function') !== -1);
        ['И', 'ОБ', 'ПЗ', 'ПР'].forEach(c => {
            assertTrue(WS_SRC.indexOf("status === '" + c + "'") !== -1,
                'код ' + c + ' в проверке');
        });
        assertTrue(WS_SRC.indexOf("status === '*'") !== -1,
            'код * в проверке (Task 306)');
    });

    test('generateMonth: плановая карта plannedStatus (шаги 3/4/4.6)', () => {
        assertTrue(WS_SRC.indexOf('var plannedStatus = {}') !== -1,
            'карта плановых смен');
        assertTrue(WS_SRC.indexOf('plannedStatus[key2] = status;') !== -1,
            'план фиксируется независимо от записей');
    });

    test('generateMonth: шаг 4.6 — сверка устаревших строк мероприятий', () => {
        assertTrue(WS_SRC.indexOf('4.6 (Task 303)') !== -1, 'шаг 4.6 существует');
        assertTrue(WS_SRC.indexOf('eventRestored') !== -1, 'счётчик восстановлений');
        assertTrue(WS_SRC.indexOf('eventRemoved') !== -1, 'счётчик удалений');
    });

    test('generateMonth: смена НЕ затирается мероприятием (ветка planned)', () => {
        // код больше не должен содержать безусловную замену статуса
        // авто-записи на код мероприятия
        const oldUnconditional = /\/\/ авто-запись → обновить на код инструктажа \+ инструкция=id/;
        assertFalse(oldUnconditional.test(WS_SRC), 'старый комментарий (затирание) убран');
        assertTrue(WS_SRC.indexOf('status: needRestore ? planned : existingEntry.статус') !== -1,
            'восстановление смены вместо затирания');
    });

    test('generateMonth: вставка И/ОБ/ПЗ только на день без смены', () => {
        const m = WS_SRC.match(/Нет записи и нет плановой смены → вставить строку[\s\S]{0,300}/);
        assertTrue(!!m, 'комментарий ветки вставки');
        assertTrue(m[0].indexOf('мероприятия') !== -1);
    });

    test('Приоритет статуса дня — новый порядок в шапке файла', () => {
        assertTrue(WS_SRC.indexOf('ручная правка > отпуск > плановая смена >') !== -1,
            'ручная > отпуск > смена > мероприятие');
    });

    test('Ответ generateMonth: счётчики слоя мероприятий', () => {
        assertTrue(WS_SRC.indexOf('trainingDays:      trainingDays') !== -1);
        assertTrue(WS_SRC.indexOf('eventGenerated:    eventGenerated') !== -1);
        assertTrue(WS_SRC.indexOf('eventRestored:     eventRestored') !== -1);
        assertTrue(WS_SRC.indexOf('eventRemoved:      eventRemoved') !== -1);
    });
});
