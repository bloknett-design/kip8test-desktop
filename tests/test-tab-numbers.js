// tests/test-tab-numbers.js
// Task 304: таб_№ хранится ТЕКСТОМ во всех листах — ведущие нули
// («0871») не должны превращаться в число 871 при записи.
//
// КОНТЕКСТ (баг из живой таблицы 03.09.2026): приложение добавляло
// инструктаж таб 0871, в листе «Инструктажи» оказывалось ЧИСЛО 871
// (Google Sheets трактует записываемые appendRow/setValues значения
// по USER_ENTERED-семантике — числоподобные строки становятся
// числами). Таб переставал сопоставляться со справочником
// «Сотрудники» (там текст «0871»): бейдж мероприятия молча
// пропадал, генерация не проставляла строки.
//
// ЧТО ПРОВЕРЯЕТСЯ (двумя слоями):
//   Слой 1 — СИМУЛЯЦИЯ сервера (WorkSchedule.gs + мок-таблицы):
//     A. addTraining: таб «0871» — строка, ячейке B ставится «@»
//     B. addTraining: таб без нулей — тоже текст + «@» (защита от
//        «General»-ячеек: формат ставится всегда)
//     C. addTraining → listTrainings: таб читается обратно «0871»
//     D. addVacation: «0871» в «Отпуска» — текст + «@»
//     E. addEmployee: «0871» в «Сотрудники» (колонка A) — текст + «@»
//     F. setManualEntry (вставка): «0871» — текст + «@»
//     G. setManualEntry (обновление): перед setValue — «@» на ячейку
//     H. generateMonth: вставленные строки — таб строками, колонке B
//        всего диапазона вставки — «@»
//     I. generateMonth warnings: мероприятие с таб не из справочника
//     K. generateMonth warnings: отпуск с усечённым таб («17» без
//        ведущего нуля) — предупреждение
//     L. generateMonth: чистые данные → warnings = []
//     M. TabNumbersFix.gs (симуляция мок-таблиц): «871» (число) в
//        «Инструктажи» → найдено, перезаписано «0871» текстом
//     N. TabNumbersFix.gs: идемпотентность — повторный запуск ничего
//        не меняет; tabNumbersStatus() ничего не пишет
//   Слой 2 — статические инварианты:
//     • в WorkSchedule.gs не осталось вызовов .appendRow( — все
//       записи идут через _appendRowKeepText (формат «@» ДО записи)
//     • generateMonth: setNumberFormat('@') колонки B — ДО setValues
//     • index.html: warnings в тостах «Сформировать» (месяц/год),
//       маркер «⚠ нет в справочнике» в списке мероприятий
//     • SW-кэш поднят до v543; TabNumbersFix.gs на месте
//
// Запуск: через tests/run-all.js (require './test-tab-numbers.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

const WS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const FIX_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'TabNumbersFix.gs'), 'utf8');

// ============================================================
// Мок-инфраструктура Apps Script (как в test-work-events.js)
// ВАЖНО: мок НЕ эмулирует USER_ENTERED-конверсию реального Sheets
// («0871» → 871) — она и есть источник бага. Мок протоколирует
// вызовы setNumberFormat: тесты проверяют, что код СТАВИТ «@»
// таб-ячейкам (в реальном Sheets это гарантирует текст).
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
            setNumberFormat(fmt) {
                self.fmtCalls.push({ row: row, col: col,
                                     numRows: numRows, numCols: numCols, fmt: fmt });
            }
        };
    }
    deleteRow(r) { this.rows.splice(r - 1, 1); }
    appendRow(arr) { this.rows.push(arr.slice()); }
    getMaxRows() { return Math.max(this.rows.length, 100); }  // для TabNumbersFix
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

// Стенд: сотрудник 017, шаблон 1 cycle 4 (Д/Н/—/—), старт 01.01.2026.
// Август 2026: 10.08 — плановая «Н» (день цикла 2), 11.08 — выходной.
function baseSheets() {
    return {
        'Сотрудники': new MockSheet([
            ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон', 'старт_цикла', 'приём', 'увольнение', 'архив', 'должность', 'комментарий'],
            ['017', 'Иванов И.И.', 'оператор', '', 1, new Date(2026, 0, 1), '', '', 0, '', '']
        ]),
        'Коды_статусов': new MockSheet([
            ['код', 'название', 'цвет'],
            ['Д', 'День', '#FFE082'],
            ['Н', 'Ночь', '#B0BEC5'],
            ['И', 'Инструктаж', '#B3E5FC'],
            ['ОТ', 'Отпуск', '#ECEFF1'],
            ['Б', 'Больничный', '#F8BBD0']
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

// Был ли вызов setNumberFormat('@') на ячейку (row, col)
function hasFmt(sheet, row, col) {
    return sheet.fmtCalls.some((c) => c.row === row && c.col === col && c.fmt === '@');
}

// ============================================================
// Слой 1: симуляция записи таб_№ текстом
// ============================================================
describe('Task 304 — симуляция: таб_№ пишется текстом', () => {

    test('A: addTraining — «0871» строкой, ячейке B ставится «@»', () => {
        const sheets = baseSheets();
        const WS = loadWS(sheets);
        const r = WS.addTraining({ token: 't', 'таб_номер': '0871',
            тип: 'инструктаж', тема: 'Повторный инструктаж по ОТ и ПБ',
            дата_начала: '2026-08-10' });
        assertTrue(r.ok, 'addTraining вернул ok');
        const row = sheets['Инструктажи'].rows[1];
        assertEqual(row[1], '0871', 'таб в B — «0871»');
        assertTrue(typeof row[1] === 'string', 'тип значения — строка (не число)');
        assertTrue(hasFmt(sheets['Инструктажи'], 2, 2), 'формат «@» выставлен ячейке B2');
        assertEqual(row[0], 1, 'id (A) — число 1');
        assertTrue(typeof row[0] === 'number', 'id остаётся числом');
    });

    test('B: addTraining — таб без нулей тоже текстом + «@» (защита от General-ячеек)', () => {
        const sheets = baseSheets();
        const WS = loadWS(sheets);
        const r = WS.addTraining({ token: 't', 'таб_номер': '2741',
            тип: 'проверка_знаний', тема: 'До 1000 В',
            дата_начала: '2026-08-10' });
        assertTrue(r.ok, 'addTraining вернул ok');
        const row = sheets['Инструктажи'].rows[1];
        assertEqual(row[1], '2741', 'таб в B — «2741»');
        assertTrue(typeof row[1] === 'string', 'тип значения — строка');
        assertTrue(hasFmt(sheets['Инструктажи'], 2, 2), 'формат «@» выставлен и без ведущих нулей');
    });

    test('C: addTraining → listTrainings — таб читается обратно «0871»', () => {
        const sheets = baseSheets();
        const WS = loadWS(sheets);
        WS.addTraining({ token: 't', 'таб_номер': '0871',
            тип: 'инструктаж', тема: 'Повторный', дата_начала: '2026-08-10' });
        const lr = WS.listTrainings({ token: 't', year: 2026, month: 8 });
        assertTrue(lr.ok, 'listTrainings вернул ok');
        assertEqual(lr.data.trainings.length, 1, 'одна запись');
        assertEqual(lr.data.trainings[0]['таб_номер'], '0871', 'таб_номер — «0871»');
    });

    test('D: addVacation — «0871» в «Отпуска» строкой + «@»', () => {
        const sheets = baseSheets();
        const WS = loadWS(sheets);
        const r = WS.addVacation({ token: 't', 'таб_номер': '0871', часть: 1,
            дата_начала: '2026-08-11', дата_окончания: '2026-08-11' });
        assertTrue(r.ok, 'addVacation вернул ok');
        const row = sheets['Отпуска'].rows[1];
        assertEqual(row[1], '0871', 'таб в B — «0871»');
        assertTrue(typeof row[1] === 'string', 'тип значения — строка');
        assertTrue(hasFmt(sheets['Отпуска'], 2, 2), 'формат «@» выставлен ячейке B2');
    });

    test('E: addEmployee — «0871» в «Сотрудники» (колонка A) строкой + «@»', () => {
        const sheets = baseSheets();
        const WS = loadWS(sheets);
        const r = WS.addEmployee({ token: 't', 'таб_номер': '0871',
            ФИО: 'Романов Д. А.', тип: 'дневной' });
        assertTrue(r.ok, 'addEmployee вернул ok');
        const row = sheets['Сотрудники'].rows[2];   // 3-я строка (после 017)
        assertEqual(row[0], '0871', 'таб в A — «0871»');
        assertTrue(typeof row[0] === 'string', 'тип значения — строка');
        assertTrue(hasFmt(sheets['Сотрудники'], 3, 1), 'формат «@» выставлен ячейке A3');
    });

    test('F: setManualEntry (вставка) — «0871» строкой + «@»', () => {
        const sheets = baseSheets();
        const WS = loadWS(sheets);
        const r = WS.setManualEntry({ token: 't', date: '2026-08-15',
            'таб_номер': '0871', статус: 'Б' });
        assertTrue(r.ok, 'setManualEntry вернул ok');
        const row = sheets['Записи_графика'].rows[1];
        assertEqual(row[1], '0871', 'таб в B — «0871»');
        assertTrue(typeof row[1] === 'string', 'тип значения — строка');
        assertTrue(hasFmt(sheets['Записи_графика'], 2, 2), 'формат «@» выставлен ячейке B2');
    });

    test('G: setManualEntry (обновление) — «@» на ячейку B до setValue', () => {
        const sheets = baseSheets();
        sheets['Записи_графика'].rows.push(
            [new Date(2026, 7, 15), '017', 'Д', 0, 0, 'руч', new Date(), '', null, '']);
        const WS = loadWS(sheets);
        const r = WS.setManualEntry({ token: 't', date: '2026-08-15',
            'таб_номер': '017', статус: 'Н' });
        assertTrue(r.ok, 'setManualEntry (обновление) вернул ok');
        const row = sheets['Записи_графика'].rows[1];
        assertEqual(row[2], 'Н', 'статус обновлён');
        assertEqual(row[1], '017', 'таб не изменился');
        assertTrue(typeof row[1] === 'string', 'таб остался строкой');
        assertTrue(hasFmt(sheets['Записи_графика'], 2, 2), 'формат «@» выставлен обновляемой ячейке B2');
    });

    test('H: generateMonth — вставка строк: таб строками, «@» на колонку B диапазона', () => {
        const sheets = baseSheets();
        const WS = loadWS(sheets);
        const r = WS.generateMonth({ token: 't', year: 2026, month: 8 });
        assertTrue(r.ok, 'generateMonth вернул ok');
        const entries = sheets['Записи_графика'].rows.slice(1);
        assertTrue(entries.length >= 1, 'есть вставленные строки (10.08 — «Н»)');
        for (let i = 0; i < entries.length; i++) {
            assertTrue(typeof entries[i][1] === 'string',
                'таб строки ' + (i + 2) + ' — строка: «' + entries[i][1] + '»');
        }
        // диапазон вставки: {row: 2, col: 2, numRows: N, numCols: 1, fmt: '@'}
        const insertCount = r.data.generated;
        const call = sheets['Записи_графика'].fmtCalls.find((c) =>
            c.col === 2 && c.fmt === '@' && c.numRows === insertCount && c.numCols === 1);
        assertTrue(!!call, 'setNumberFormat("@") вызван для всего диапазона вставки колонки B');
        assertEqual(call && call.row, 2, 'диапазон начинается со строки 2 (первая строка данных)');
    });

    test('I: generateMonth warnings — мероприятие с таб не из справочника', () => {
        const sheets = baseSheets();
        sheets['Инструктажи'].rows.push(
            [1, '9999', 'инструктаж', 'X', new Date(2026, 7, 10), new Date(2026, 7, 10), 1, '']);
        const WS = loadWS(sheets);
        const r = WS.generateMonth({ token: 't', year: 2026, month: 8 });
        assertTrue(r.ok, 'generateMonth вернул ok');
        assertTrue(Array.isArray(r.data.warnings), 'warnings — массив');
        assertEqual(r.data.warnings.length, 1, 'одно предупреждение');
        assertTrue(r.data.warnings[0].indexOf('9999') !== -1,
            'в тексте есть таб «9999»: ' + r.data.warnings[0]);
        assertTrue(r.data.warnings[0].indexOf('Мероприятие') !== -1,
            'помечено как мероприятие');
    });

    test('K: generateMonth warnings — отпуск с усечённым таб «17» (ноль потерян)', () => {
        const sheets = baseSheets();
        sheets['Отпуска'].rows.push(
            [1, '17', 1, new Date(2026, 7, 11), new Date(2026, 7, 11), '']);
        const WS = loadWS(sheets);
        const r = WS.generateMonth({ token: 't', year: 2026, month: 8 });
        assertTrue(r.ok, 'generateMonth вернул ok');
        assertEqual(r.data.warnings.length, 1, 'одно предупреждение');
        assertTrue(r.data.warnings[0].indexOf('«17»') !== -1,
            'в тексте есть таб «17»: ' + r.data.warnings[0]);
        assertTrue(r.data.warnings[0].indexOf('Отпуск') !== -1,
            'помечено как отпуск');
    });

    test('L: generateMonth — чистые данные → warnings пустой', () => {
        const sheets = baseSheets();
        // мероприятие таб 017 (есть в справочнике) на сменном дне 10.08
        sheets['Инструктажи'].rows.push(
            [1, '017', 'инструктаж', 'Повторный', new Date(2026, 7, 10), new Date(2026, 7, 10), 1, '']);
        const WS = loadWS(sheets);
        const r = WS.generateMonth({ token: 't', year: 2026, month: 8 });
        assertTrue(r.ok, 'generateMonth вернул ok');
        assertEqual(r.data.warnings.length, 0, 'предупреждений нет');
    });
});

// Загрузка TabNumbersFix.gs как модуля (мок SpreadsheetApp + Logger)
function loadFix(sheets, logs) {
    const ss = { getSheetByName: (n) => sheets[n] || null };
    const SpreadsheetApp = { openById: () => ss };
    const Logger = { log: (m) => logs.push(String(m)) };
    const factory = new Function('SpreadsheetApp', 'Logger',
        FIX_SRC + '\nreturn { fixTabNumbers: fixTabNumbers, tabNumbersStatus: tabNumbersStatus };');
    return factory(SpreadsheetApp, Logger);
}

// ============================================================
// Слой 1б: симуляция TabNumbersFix.gs (починка живых данных)
// Сценарий — как в реальной таблице 03.09.2026: в «Сотрудниках»
// 0871/2741 (текст), в «Инструктажи» запись приложения с ЧИСЛОМ 871
// (баг до Task 304), в «Записи_графика» — таб числом 2741, и
// неизвестный таб 9999 (править вручную).
// ============================================================
describe('Task 304 — симуляция TabNumbersFix.gs', () => {

    function fixSheets() {
        return {
            'Сотрудники': new MockSheet([
                ['таб_номер', 'ФИО'],
                ['0871', 'Романов Д. А.'],
                ['2741', 'Хадасевич А. С.']
            ]),
            'Инструктажи': new MockSheet([
                ['id', 'таб_№', 'тип', 'тема', 'начало', 'конец', 'дней', 'комментарий'],
                [4, 871, 'инструктаж', 'Повторный', new Date(2026, 8, 30), new Date(2026, 8, 30), 1, ''],
                [9, '9999', 'инструктаж', 'X', new Date(2026, 8, 1), new Date(2026, 8, 1), 1, '']
            ]),
            'Отпуска': new MockSheet([
                ['id', 'таб_номер', 'часть', 'дата_начала', 'дата_окончания', 'комментарий'],
                [1, '2741', 2, new Date(2026, 8, 1), new Date(2026, 8, 21), '']
            ]),
            'Записи_графика': new MockSheet([
                ['дата', 'таб_№', 'статус', 'переработка', 'праздник', 'источник', 'обновлён', 'замещает', 'инструкция', 'комментарий'],
                [new Date(2026, 8, 3), 2741, 'ОТ', 0, 0, 'авто', new Date(), '', null, '']
            ])
        };
    }

    test('M: fixTabNumbers — «871» перезаписан текстом «0871», число → текст', () => {
        const sheets = fixSheets();
        const logs = [];
        const FIX = loadFix(sheets, logs);
        const r = FIX.fixTabNumbers();
        // «871» → «0871» (pad) + 2741-число → текст (type) = 2 исправления
        assertEqual(r.fixed, 2, 'исправлено 2 ячейки: ' + JSON.stringify(r));
        assertEqual(r.unknown, 1, 'неизвестный таб 9999 — только журнал');
        const tr = sheets['Инструктажи'].rows[1];
        assertEqual(tr[1], '0871', 'Инструктажи B2 = «0871»');
        assertTrue(typeof tr[1] === 'string', 'значение — строка');
        assertEqual(tr[0], 4, 'id не тронут');
        assertEqual(tr[2], 'инструктаж', 'тип не тронут');
        const en = sheets['Записи_графика'].rows[1];
        assertEqual(en[1], '2741', 'Записи_графика B2 = «2741» текстом');
        assertTrue(typeof en[1] === 'string', 'значение — строка');
        // перезапись — через «@»-формат ячейки (как в WorkSchedule.gs)
        assertTrue(hasFmt(sheets['Инструктажи'], 2, 2), 'формат «@» на B2 при починке');
        // колонки таб_№ переведены в текстовый формат целиком
        assertTrue(sheets['Инструктажи'].fmtCalls.some((c) =>
            c.col === 2 && c.fmt === '@' && c.numRows >= 99), 'колонка B «Инструктажи» — текст');
        // самопроверка: 0 оставшихся проблем
        assertEqual(r.remaining, 0, 'после починки проблем не осталось');
    });

    test('N: идемпотентность — повторный запуск ничего не чинит', () => {
        const sheets = fixSheets();
        const logs = [];
        const FIX = loadFix(sheets, logs);
        FIX.fixTabNumbers();          // первый прогон чинит
        const before = JSON.stringify(sheets['Инструктажи'].rows);
        const r2 = FIX.fixTabNumbers();   // повторный
        assertEqual(r2.fixed, 0, 'нечего исправлять');
        assertEqual(r2.remaining, 0, 'проблем нет');
        assertEqual(JSON.stringify(sheets['Инструктажи'].rows), before,
            'данные не изменены повторным запуском');
    });

    test('N2: tabNumbersStatus — только диагностика, ничего не пишет', () => {
        const sheets = fixSheets();
        const logs = [];
        const FIX = loadFix(sheets, logs);
        const before = JSON.stringify(sheets['Инструктажи'].rows);
        const scan = FIX.tabNumbersStatus();
        assertTrue(scan.ok, 'скан прошёл');
        assertEqual(scan.problems.length, 3, 'pad + type + unknown');
        assertEqual(JSON.stringify(sheets['Инструктажи'].rows), before,
            'данные не тронуты диагностикой');
        assertEqual(sheets['Инструктажи'].fmtCalls.length, 0,
            'форматы не ставились');
    });
});

// ============================================================
// Слой 2: статические инварианты клиента/сервера
// ============================================================
describe('Task 304 — статические инварианты', () => {

    test('WorkSchedule.gs: вызовов .appendRow( больше нет', () => {
        assertTrue(WS_SRC.indexOf('.appendRow(') === -1,
            'все записи в листы идут через _appendRowKeepText (формат «@» до значения)');
    });

    test('WorkSchedule.gs: _appendRowKeepText вызывается из CRUD-функций', () => {
        const uses = WS_SRC.split('this._appendRowKeepText(').length - 1;
        assertEqual(uses, 8, 'addEmployee + addTraining ×2 (Task 418: формат done/legacy) + addVacation + setManualEntry + addPpe (Task 392) + splitTrainingsSheet (Task 405) + _appendTrainingRow (Task 419: автосоздание новых сроков)');
    });

    test('WorkSchedule.gs: generateMonth — «@» колонки B ДО setValues(toInsert)', () => {
        const fmtIdx = WS_SRC.indexOf(
            "entriesSheet.getRange(lastRow + 1, 2, insertCount, 1).setNumberFormat('@')");
        const valIdx = WS_SRC.indexOf('targetRange.setValues(toInsert)');
        assertTrue(fmtIdx !== -1, 'setNumberFormat("@") для диапазона вставки есть');
        assertTrue(valIdx !== -1, 'setValues(toInsert) есть');
        assertTrue(fmtIdx < valIdx, 'формат выставляется ДО записи значений');
    });

    test('index.html: warnings показываются в тосте «Сформировать месяц»', () => {
        assertTrue(INDEX_SRC.indexOf('data.warnings') !== -1, 'data.warnings читается');
        assertTrue(INDEX_SRC.indexOf('genWarns') !== -1, 'переменная тоста месяца');
    });

    test('index.html: warnings копятся в тосте «Сформировать год»', () => {
        assertTrue(INDEX_SRC.indexOf('totalWarns') !== -1, 'накопитель за 12 месяцев');
    });

    test('index.html: маркер «⚠ нет в справочнике» в списке мероприятий', () => {
        assertTrue(INDEX_SRC.indexOf('ws-tr-warn') !== -1, 'CSS-класс ws-tr-warn');
        assertTrue(INDEX_SRC.indexOf('нет в справочнике') !== -1, 'текст маркера');
    });

    test('SW: версия кэша kipia-test-v749 (Task 304 — клиент менялся)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v749'") !== -1,
            'CACHE_VERSION = kipia-test-v749');
    });

    test('TabNumbersFix.gs: функции починки/диагностики на месте', () => {
        assertTrue(FIX_SRC.indexOf('function fixTabNumbers()') !== -1, 'fixTabNumbers()');
        assertTrue(FIX_SRC.indexOf('function tabNumbersStatus()') !== -1, 'tabNumbersStatus()');
        assertTrue(FIX_SRC.indexOf('TN_SPREADSHEET_ID') !== -1, 'ID целевой таблицы');
        // формат ставится ДО перезаписи значения (иначе «0871» снова
        // станет числом — тот же приём, что в WorkSchedule.gs)
        const fIdx = FIX_SRC.indexOf("cell.setNumberFormat('@')");
        const sIdx = FIX_SRC.indexOf('cell.setValue(p.target)');
        assertTrue(fIdx !== -1 && sIdx !== -1, 'обе операции есть');
        assertTrue(fIdx < sIdx, 'формат «@» — ДО setValue');
    });
});
