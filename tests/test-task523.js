// tests/test-task523.js
// Task 523: «Нужно что бы время начала и окончания тоже сохранялись
// и отображались в колонках листа «Записи_графика» (Google Sheets).
// Для кода "н" — ночь в выходной сделай такой же функционал как для
// кода "д" — день в выходной».
//
// ЧТО ПРОВЕРЯЕТСЯ (четырьмя слоями):
//   Слой 1 — SRC сервера (WorkSchedule.gs): структура листа L/M
//     задокументирована; хелпер _wsTimeOrNull; listEntries читает 13
//     колонок и возвращает времена; setManualEntry — парность,
//     валидация «чч:мм», ПЕРЕСЧЁТ часов из пары (единый источник
//     K/L/M), запись L/M текстом с форматом '@', совместимость со
//     старым клиентом (undefined → не трогаем).
//   Слой 2 — VM сервера (Node + мок-таблицы): insert/update с
//     временами (д и н СИММЕТРИЧНО), полночь, пересчёт часов,
//     ошибки (25:00 / 7:3 / одно поле / совпадение / <0,5 ч),
//     чистка null, не-д/н, listEntries-нормализация (строка/Date).
//   Слой 3 — SRC клиента (index.html): applyDnHours передаёт времена;
//     _applyCellStatus кладёт их в _PENDING; saveAll шлёт в payload;
//     submitCellForm переносит времена при неизменных часах;
//     _renderDnHoursForm префиллится сохранёнными временами;
//     _dnDayInfoAt/_renderDnDayInfo показывают «07:30–15:30 · 7,2 ч».
//   Слой 4 — VM клиента: префилл точной парой (раунд-трип),
//     _applyCellStatus с временами, рендер с временами/полночь/
//     только часы/не указано.
//   SW: kipia-test-v759.
//
// Запуск: через tests/run-all.js (require './test-task523.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');
const WS_CLIENT = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// Вырезка метода (как в test-task322/521/522.js)
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
function methodFn(src, name, document) {
    const text = methodText(src, name).replace(/,\s*$/, '');
    const body = text.replace(new RegExp('^ {8}' + name + ': '), '');
    return new Function('document', 'return (' + body + ')')(document || null);
}
function wsHost(methodNames, extra, document) {
    const host = Object.assign({}, extra);
    methodNames.forEach(function(n) {
        host[n] = methodFn(WS_CLIENT, n, document || null);
    });
    return host;
}
function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// ============================================================
// 1. SRC: сервер — структура листа, чтение, запись времён
// ============================================================
describe('Task 523 — SRC: сервер (WorkSchedule.gs)', () => {
    test('SRC: структура листа — колонки L/M задокументированы', () => {
        assertTrue(WS_GS_SRC.indexOf('//   L: время_начала (Task 523') !== -1,
            'колонка L описана в шапке структуры');
        assertTrue(WS_GS_SRC.indexOf('//   M: время_окончания (Task 523') !== -1,
            'колонка M описана в шапке структуры');
        assertTrue(WS_GS_SRC.indexOf('заголовок «время_начала»') !== -1,
            'подсказка заголовка L1 (данные пишутся и без него)');
    });

    test('SRC: хелпер _wsTimeOrNull — нормализация «чч:мм»', () => {
        assertTrue(WS_GS_SRC.indexOf('_wsTimeOrNull: function') !== -1,
            'хелпер определён');
        const t = WS_GS_SRC.slice(WS_GS_SRC.indexOf('_wsTimeOrNull: function'));
        assertTrue(t.indexOf('instanceof Date') !== -1,
            'Date-ячейки (ручной ввод в лист) нормализуются');
        assertTrue(t.indexOf('hh > 23') !== -1,
            'граница часов 0..23');
    });

    test('SRC: listEntries — 13 колонок и поля времён', () => {
        assertTrue(WS_GS_SRC.indexOf('lastRow - 1, 13') !== -1,
            'читаются колонки A..M');
        const li = WS_GS_SRC.slice(WS_GS_SRC.indexOf('listEntries: function'));
        assertTrue(li.indexOf("время_начала:    this._wsTimeOrNull(r[11])") !== -1,
            'L → время_начала записи');
        assertTrue(li.indexOf("время_окончания: this._wsTimeOrNull(r[12])") !== -1,
            'M → время_окончания записи');
    });

    test('SRC: setManualEntry — парность и валидация времён', () => {
        const sm = WS_GS_SRC.slice(WS_GS_SRC.indexOf('setManualEntry: function'));
        assertTrue(sm.indexOf("payload['время_начала'] !== undefined") !== -1,
            'семантика undefined (старый клиент) — как у часов');
        assertTrue(sm.indexOf('укажите ОБА времени') !== -1,
            'половина пары — ошибка');
        assertTrue(sm.indexOf('(ожидалось чч:мм, например 7:30 и 15:30)') !== -1,
            'негодное время — понятная ошибка');
        assertTrue(sm.indexOf('время окончания совпадает с временем начала') !== -1,
            'совпадение начала/окончания — ошибка (как клиент Task 521)');
    });

    test('SRC: setManualEntry — часы ПЕРЕСЧИТЫВАЮТСЯ из пары времён', () => {
        const sm = WS_GS_SRC.slice(WS_GS_SRC.indexOf('setManualEntry: function'));
        assertTrue(sm.indexOf('diffMin += 24 * 60') !== -1,
            'окончание раньше начала — через полночь (+24 ч)');
        assertTrue(sm.indexOf('часы = derivedH;') !== -1,
            'единый источник K/L/M — часы из времён');
        assertTrue(sm.indexOf("status !== 'д' && status !== 'н'") !== -1,
            'не-д/н — времена принудительно чистятся');
    });

    test('SRC: запись L/M — текст с форматом «@», оба пути', () => {
        const sm = WS_GS_SRC.slice(WS_GS_SRC.indexOf('setManualEntry: function'));
        assertTrue(sm.indexOf('getRange(foundRow, 12).setNumberFormat(\'@\')') !== -1,
            'L: формат «@» ДО записи (урок Task 304 — Sheets разбирает «07:30»)');
        assertTrue(sm.indexOf('getRange(foundRow, 13).setNumberFormat(\'@\')') !== -1,
            'M: формат «@» ДО записи');
        assertTrue(sm.indexOf('], [2, 12, 13]);') !== -1,
            'вставка новой строки — текстовые колонки 2/12/13');
    });

    test('SRC: аудит и ответ несут времена', () => {
        const sm = WS_GS_SRC.slice(WS_GS_SRC.indexOf('setManualEntry: function'));
        assertTrue(sm.indexOf("', ' + время_начала + '–' + время_окончания") !== -1,
            'аудит: «(7,2 ч, 07:30–15:30)»');
        assertTrue(sm.indexOf('время_начала: (время_начала === undefined') !== -1,
            'ответ API возвращает время_начала');
    });
});

// ============================================================
// 2. VM: сервер — симуляция setManualEntry/listEntries
// ============================================================
class MockSheet {
    constructor(rows) { this.rows = rows || []; this.fmt = []; }
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
            setValue(v) {
                while (self.rows.length < row) self.rows.push([]);
                self.rows[row - 1][col - 1] = v;
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
            setNumberFormat(f) { self.fmt.push({ row: row, col: col, fmt: f }); }
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
    const factory = new Function('SpreadsheetApp', 'Utils', WS_GS_SRC + '\nreturn WorkSchedule;');
    return factory(SpreadsheetApp, MOCK_UTILS);
}
function baseSheets(entryRows) {
    return {
        'Коды_статусов': new MockSheet([['код'], ['д'], ['н'], ['ОТ']]),
        'Записи_графика': new MockSheet([[
            'дата', 'таб', 'статус', 'переработка', 'праздник', 'источник',
            'обновлён', 'замещает', 'инструкция', 'комментарий', 'часы',
            'время_начала', 'время_окончания'
        ]].concat(entryRows || []))
    };
}
const PAYLOAD_BASE = { token: 'tok', 'переработка': 0, 'замещает': null, 'комментарий': '' };

function setEntry(sheets, payload) {
    return loadWS(sheets).setManualEntry(Object.assign({}, PAYLOAD_BASE, payload));
}
function listEntries(sheets) {
    return loadWS(sheets).listEntries({ token: 'tok', year: 2026, month: 10 });
}

describe('Task 523 — VM: сервер setManualEntry (день «д»)', () => {
    test('вставка с временами: K=8, L/M текстом «07:30»/«15:30»', () => {
        const sh = baseSheets();
        const res = setEntry(sh, { date: '2026-10-11', 'таб_номер': '023', 'статус': 'д',
            'часы': 8, 'время_начала': '07:30', 'время_окончания': '15:30' });
        assertEqual(res.ok, true, 'запись принята');
        const row = sh['Записи_графика'].rows[1];
        assertEqual(row[10], 8, 'K: часы');
        assertEqual(row[11], '07:30', 'L: время_начала');
        assertEqual(row[12], '15:30', 'M: время_окончания');
        assertEqual(res.data.время_начала, '07:30', 'ответ несёт время_начала');
        assertEqual(res.data.часы, 8, 'ответ несёт часы');
    });

    test('нормализация «7:30» → «07:30» при записи', () => {
        const sh = baseSheets();
        const res = setEntry(sh, { date: '2026-10-11', 'таб_номер': '023', 'статус': 'д',
            'время_начала': '7:30', 'время_окончания': '16:05' });
        assertEqual(res.ok, true, 'одинарный час принят');
        assertEqual(sh['Записи_графика'].rows[1][11], '07:30', 'L дополнен нулём');
        assertEqual(sh['Записи_графика'].rows[1][12], '16:05', 'M как есть');
    });

    test('обновление существующей записи с временами', () => {
        const sh = baseSheets([[new Date(2026, 9, 11), '023', 'д', 1, 0, 'авто',
            new Date(), '', '', '', 7.2, '08:00', '15:12']]);
        const res = setEntry(sh, { date: '2026-10-11', 'таб_номер': '023', 'статус': 'д',
            'часы': 9, 'время_начала': '09:00', 'время_окончания': '17:30' });
        assertEqual(res.ok, true, 'обновление принято');
        const row = sh['Записи_графика'].rows[1];
        assertEqual(row[10], 8.5, 'K: пересчитано из пары (не 9!)');
        assertEqual(row[11], '09:00', 'L обновлён');
        assertEqual(row[12], '17:30', 'M обновлён');
    });

    test('часы пересчитываются из времён — клиентское payload.часы игнорируется', () => {
        const sh = baseSheets();
        setEntry(sh, { date: '2026-10-11', 'таб_номер': '023', 'статус': 'д',
            'часы': 5, 'время_начала': '07:30', 'время_окончания': '15:30' });
        assertEqual(sh['Записи_графика'].rows[1][10], 8,
            'K = 8 (окончание − начало), а не присланные 5 — K/L/M не расходятся');
    });

    test('СТАРЫЙ клиент (без полей времён) — L/M НЕ ТРАГАЮТСЯ', () => {
        const sh = baseSheets([[new Date(2026, 9, 11), '023', 'д', 1, 0, 'руч',
            new Date(), '', '', '', 7.2, '08:00', '15:12']]);
        const res = setEntry(sh, { date: '2026-10-11', 'таб_номер': '023', 'статус': 'д',
            'часы': 6 });
        assertEqual(res.ok, true, 'старый клиент принят');
        const row = sh['Записи_графика'].rows[1];
        assertEqual(row[10], 6, 'K обновлён (как прежде)');
        assertEqual(row[11], '08:00', 'L не тронут (undefined)');
        assertEqual(row[12], '15:12', 'M не тронут (undefined)');
    });

    test('чистка: null + null → K/L/M пустые', () => {
        const sh = baseSheets([[new Date(2026, 9, 11), '023', 'д', 1, 0, 'руч',
            new Date(), '', '', '', 7.2, '08:00', '15:12']]);
        const res = setEntry(sh, { date: '2026-10-11', 'таб_номер': '023', 'статус': 'ОТ',
            'часы': null, 'время_начала': null, 'время_окончания': null });
        assertEqual(res.ok, true, 'смена статуса принята');
        const row = sh['Записи_графика'].rows[1];
        assertEqual(row[10], null, 'K очищен');
        assertEqual(row[11], null, 'L очищен');
        assertEqual(row[12], null, 'M очищен');
    });

    test('не-д/н с временами — времена принудительно чистятся', () => {
        const sh = baseSheets();
        const res = setEntry(sh, { date: '2026-10-12', 'таб_номер': '023', 'статус': 'ОТ',
            'время_начала': '08:00', 'время_окончания': '15:00' });
        assertEqual(res.ok, true, 'принято без ошибки');
        const row = sh['Записи_графика'].rows[1];
        assertEqual(row[11], null, 'L пуст (времена не имеют смысла у ОТ)');
        assertEqual(row[12], null, 'M пуст');
    });
});

describe('Task 523 — VM: сервер — код «н» (симметрия «д», полночь)', () => {
    test('«н» 19:30–07:30 — через полночь: K=12, L/M сохранены', () => {
        const sh = baseSheets();
        const res = setEntry(sh, { date: '2026-10-11', 'таб_номер': '023', 'статус': 'н',
            'часы': 12, 'время_начала': '19:30', 'время_окончания': '07:30' });
        assertEqual(res.ok, true, 'ночная запись принята');
        const row = sh['Записи_графика'].rows[1];
        assertEqual(row[10], 12, 'K: 12 ч (полночь +24 ч)');
        assertEqual(row[11], '19:30', 'L: 19:30');
        assertEqual(row[12], '07:30', 'M: 07:30');
    });

    test('«н» 16:00–01:00 — через полночь: K=9', () => {
        const sh = baseSheets();
        setEntry(sh, { date: '2026-10-12', 'таб_номер': '023', 'статус': 'н',
            'время_начала': '16:00', 'время_окончания': '01:00' });
        assertEqual(sh['Записи_графика'].rows[1][10], 9, '9 ч — как малая форма Task 521');
    });

    test('«н» без времён (сменный путь) — L/M пустые, часы живут', () => {
        const sh = baseSheets();
        const res = setEntry(sh, { date: '2026-10-13', 'таб_номер': '017', 'статус': 'н',
            'часы': null });
        assertEqual(res.ok, true, 'сменный формат (только часы: null) принят');
        const row = sh['Записи_графика'].rows[1];
        assertEqual(row[11], null, 'L пуст');
        assertEqual(row[12], null, 'M пуст');
    });
});

describe('Task 523 — VM: сервер — ошибки валидации времён', () => {
    const bad = [
        ['25:00', '15:30', 'часы > 23'],
        ['07:3', '15:30', 'минуты одной цифрой'],
        ['7:30', '15:3', 'окончание негодное'],
        ['с утра', '15:30', 'не время']
    ];
    bad.forEach(function(pair) {
        test('invalid_время: ' + pair[2], () => {
            const sh = baseSheets();
            const res = setEntry(sh, { date: '2026-10-11', 'таб_номер': '023', 'статус': 'д',
                'время_начала': pair[0], 'время_окончания': pair[1] });
            assertFalse(res.ok, 'отказ');
            assertTrue(String(res.error).indexOf('invalid_время') === 0,
                'код ошибки invalid_время');
            assertEqual(sh['Записи_графика'].rows.length, 1,
                'строка НЕ вставлена (валидируется до записи)');
        });
    });

    test('одно поле без другого — ошибка (строгая пара)', () => {
        const sh = baseSheets();
        const res = setEntry(sh, { date: '2026-10-11', 'таб_номер': '023', 'статус': 'д',
            'время_начала': '08:00' });
        assertFalse(res.ok, 'отказ');
        assertTrue(String(res.error).indexOf('ОБА времени') !== -1,
            'подсказка про оба поля');
    });

    test('начало = окончание — ошибка (как клиент Task 521)', () => {
        const sh = baseSheets();
        const res = setEntry(sh, { date: '2026-10-11', 'таб_номер': '023', 'статус': 'д',
            'время_начала': '08:00', 'время_окончания': '08:00' });
        assertFalse(res.ok, 'отказ');
        assertTrue(String(res.error).indexOf('совпадает') !== -1, 'текст про совпадение');
    });

    test('меньше 0,5 ч — ошибка (серверный диапазон часов)', () => {
        const sh = baseSheets();
        const res = setEntry(sh, { date: '2026-10-11', 'таб_номер': '023', 'статус': 'д',
            'время_начала': '07:00', 'время_окончания': '07:20' });
        assertFalse(res.ok, 'отказ');
        assertTrue(String(res.error).indexOf('0,5–24') !== -1, 'диапазон в тексте');
    });
});

describe('Task 523 — VM: сервер listEntries — нормализация времён', () => {
    test('строки «7:30» → «07:30»; Date-ячейки → «чч:мм»; мусор → null', () => {
        const sh = baseSheets([
            [new Date(2026, 9, 11), '023', 'д', 1, 0, 'руч', new Date(), '', '', '',
             7.2, '7:30', '15:12'],
            [new Date(2026, 9, 12), '023', 'н', 1, 0, 'руч', new Date(), '', '', '',
             12, new Date(1899, 11, 30, 19, 30), new Date(1899, 11, 30, 7, 30)],
            [new Date(2026, 9, 13), '023', 'д', 1, 0, 'руч', new Date(), '', '', '',
             8, 'мусор', '']
        ]);
        const res = listEntries(sh);
        assertEqual(res.ok, true, 'чтение прошло');
        assertEqual(res.data.entries.length, 3, 'три записи месяца');
        assertEqual(res.data.entries[0]['время_начала'], '07:30',
            'строка «7:30» нормализована');
        assertEqual(res.data.entries[0]['время_окончания'], '15:12', 'окончание как есть');
        assertEqual(res.data.entries[1]['время_начала'], '19:30',
            'Date-ячейка (ручной ввод в лист) → «19:30»');
        assertEqual(res.data.entries[1]['время_окончания'], '07:30', 'Date → «07:30»');
        assertEqual(res.data.entries[2]['время_начала'], null, 'мусор → null');
        assertEqual(res.data.entries[2]['время_окончания'], null, 'пусто → null');
    });
});

// ============================================================
// 3. SRC: клиент — цепочка времен до payload и в попап
// ============================================================
describe('Task 523 — SRC: клиент (index.html)', () => {
    test('SRC: applyDnHours передаёт ОБА времени в _applyCellStatus', () => {
        const m = methodText(WS_CLIENT, 'applyDnHours');
        assertTrue(m.indexOf('this._applyCellStatus(date, tabNo, code, val,') !== -1,
            'вызов расширен временем начала');
        assertTrue(m.indexOf("startEl ? String(startEl.value || '') : ''") !== -1,
            'значение поля начала летит в правку');
        assertTrue(m.indexOf("endEl ? String(endEl.value || '') : ''") !== -1,
            'значение поля окончания летит в правку');
    });

    test('SRC: _applyCellStatus — поля времён в _PENDING', () => {
        const m = methodText(WS_CLIENT, '_applyCellStatus');
        assertTrue(m.indexOf('function(isoDate, tabNo, code, hours, время_начала, время_окончания)') !== -1,
            'сигнатура расширена');
        assertTrue(m.indexOf("'время_начала': dnTimes['время_начала']") !== -1,
            'правка несёт время_начала');
        assertTrue(m.indexOf("(typeof время_начала === 'string' && время_начала)") !== -1,
            'пара строго «чч:мм»-строками');
        assertTrue(m.indexOf("'время_начала': null") !== -1,
            'чистка времён (смена статуса/надгробие)');
    });

    test('SRC: saveAll — payload несёт время_начала/время_окончания', () => {
        const m = methodText(WS_CLIENT, 'saveAll');
        assertTrue(m.indexOf("payload['время_начала']") !== -1,
            'поле время_начала в payload');
        assertTrue(m.indexOf("payload['время_окончания']") !== -1,
            'поле время_окончания в payload');
    });

    test('SRC: submitCellForm — перенос времён при неизменных часах', () => {
        const m = methodText(WS_CLIENT, 'submitCellForm');
        assertTrue(m.indexOf('keepTimes') !== -1,
            'гвард переноса (часы не менялись)');
        assertTrue(m.indexOf("effEntry['время_начала']") !== -1,
            'времена берутся из эффективной записи шита');
        assertTrue(m.indexOf("'время_начала': times['время_начала']") !== -1,
            'правка шита несёт времена');
    });

    test('SRC: _renderDnHoursForm — префилл сохранённой парой', () => {
        const m = methodText(WS_CLIENT, '_renderDnHoursForm');
        assertTrue(m.indexOf("eff['время_начала']") !== -1,
            'сохранённые времена читаются из записи');
        assertTrue(m.indexOf('sSaved !== null && eSaved !== null') !== -1,
            'префилл ТОЧНОЙ парой (раунд-трип, без дрейфа часов)');
    });

    test('SRC: _dnDayInfoAt/_renderDnDayInfo — времена в справке', () => {
        const p = methodText(WS_CLIENT, '_dnDayInfoAt');
        assertTrue(p.indexOf("'время_начала': ts") !== -1,
            'предикат возвращает времена');
        assertTrue(p.indexOf('if (!(ts && te)) { ts = null; te = null; }') !== -1,
            'половина пары = данных нет');
        const r = methodText(WS_CLIENT, '_renderDnDayInfo');
        assertTrue(r.indexOf("'–' +") !== -1,
            'диапазон «начало–окончание» в строке времени');
        assertTrue(r.indexOf('(через полночь)') !== -1,
            'пометка ночной работы (окончание ≤ начала)');
        assertTrue(r.indexOf("' · ' + this._fmtTotalsNum") !== -1,
            'часы рядом с диапазоном: «07:30–15:30 · 7,2 ч»');
    });

    test('SRC: времена в кодах «д» И «н» — симметрия (заявка)', () => {
        const f = methodText(WS_CLIENT, '_renderDnHoursForm');
        assertTrue(f.indexOf("(code === 'н') ? 19 * 60 + 30 : 7 * 60 + 30") !== -1,
            'префилл обоих кодов: «д» 7:30 / «н» 19:30');
        const gate = methodText(WS_CLIENT, 'onPopupStatus');
        assertTrue(gate.indexOf("code === 'д' || code === 'н'") !== -1,
            'гейт формы — оба кода');
    });
});

// ============================================================
// 4. VM: клиент — префилл, правка, рендер секции
// ============================================================
describe('Task 523 — VM: малая форма — префилл из сохранённых времён', () => {

    const popupEl = { innerHTML: '' };
    const startMock = { value: '', focus: function() {} };
    const endMock = { value: '', focus: function() {} };
    const calcMock = { textContent: '' };
    const STATUS_CODES = [
        { code: 'д', name: 'День в вых./праздник', color: '#FFD54F' },
        { code: 'н', name: 'Ночь в вых./праздник', color: '#78909C' }
    ];

    function makeFormHost(effEntry) {
        const applied = [];
        const host = wsHost(['_renderDnHoursForm', 'dnHoursRecalc', 'applyDnHours',
                              'dnHoursBack', '_dnParseTime', '_dnMinutesToHHMM',
                              '_statusMeta', '_esc', '_escAttr', '_fmtTotalsNum'], {
            _popupCell: { date: '2026-10-10', 'таб_номер': '023' },
            _EMPLOYEES: [{ 'таб_номер': '023', 'тип': 'дневной', 'ФИО': 'Петров П.П.' }],
            _STATUS_CODES: STATUS_CODES,
            _effectiveEntry: function() { return effEntry; },
            _applyCellStatus: function(d, t, c, h, vs, ve) {
                applied.push({ c: c, h: h, vs: vs, ve: ve });
            },
            closeCellPopup: function() { popupEl.innerHTML = ''; },
            _renderGrid: function() {},
            _updateSaveBtn: function() {},
            _renderCellPopup: function() { return 'CODES-LIST'; }
        }, mockDoc({ wsCellPopup: popupEl, wsDnStart: startMock,
                     wsDnEnd: endMock, wsDnCalc: calcMock }));
        host.__applied = applied;
        return host;
    }

    test('запись с парой 08:00–15:12 → префилл ТОЧНОЙ парой', () => {
        const host = makeFormHost({ 'статус': 'д', 'часы': 7.2,
            'время_начала': '08:00', 'время_окончания': '15:12' });
        host._renderDnHoursForm('д', '2026-10-10', '023');
        const h = popupEl.innerHTML;
        assertTrue(h.indexOf('value="08:00"') !== -1,
            'начало — сохранённое (раунд-трип)');
        assertTrue(h.indexOf('value="15:12"') !== -1,
            'окончание — сохранённое (не 14:42 из округлённых 7,2 ч!)');
    });

    test('запись БЕЗ времён → прежний префилл из часов (Task 521)', () => {
        const host = makeFormHost({ 'статус': 'д', 'часы': 7.2 });
        host._renderDnHoursForm('д', '2026-10-10', '023');
        const h = popupEl.innerHTML;
        assertTrue(h.indexOf('value="07:30"') !== -1, 'начало — канон 7:30');
        assertTrue(h.indexOf('value="14:42"') !== -1, 'окончание — 7:30 + 7,2 ч');
    });

    test('«н» с парой 19:30–07:30 → префилл ночной парой', () => {
        const host = makeFormHost({ 'статус': 'н', 'часы': 12,
            'время_начала': '19:30', 'время_окончания': '07:30' });
        host._renderDnHoursForm('н', '2026-10-10', '023');
        const h = popupEl.innerHTML;
        assertTrue(h.indexOf('value="19:30"') !== -1, 'начало 19:30');
        assertTrue(h.indexOf('value="07:30"') !== -1, 'окончание 07:30');
        assertTrue(h.indexOf('Переработка: 12 ч (через полночь)') !== -1,
            'живой расчёт знает про полночь');
    });

    test('половина пары (только начало) → фолбэк на часы', () => {
        const host = makeFormHost({ 'статус': 'д', 'часы': 8,
            'время_начала': '09:15' });
        host._renderDnHoursForm('д', '2026-10-10', '023');
        const h = popupEl.innerHTML;
        assertTrue(h.indexOf('value="07:30"') !== -1 && h.indexOf('value="15:30"') !== -1,
            'дефолт 7:30–15:30 (пара неполная — данных нет)');
    });

    test('applyDnHours: 08:00–15:12 → правка с парой и часами 7,2', () => {
        const host = makeFormHost(null);
        host._renderDnHoursForm('д', '2026-10-10', '023');
        startMock.value = '08:00';
        endMock.value = '15:12';
        host.applyDnHours('д');
        const a = host.__applied[0];
        assertEqual(a.c, 'д', 'код');
        assertEqual(a.h, 7.2, 'часы');
        assertEqual(a.vs, '08:00', 'время_начала в правке');
        assertEqual(a.ve, '15:12', 'время_окончания в правке');
    });
});

describe('Task 523 — VM: _applyCellStatus/_dnDayInfoAt/_renderDnDayInfo', () => {

    const CODES = [
        { code: 'д', color: '#FFD54F', name: 'День, плановая продолжительность работы в выходные и нерабочие праздничные дни' },
        { code: 'н', color: '#78909C', name: 'Ночь, плановая продолжительность работы в выходные и нерабочие праздничные дни' }
    ];
    const DAY_EMP = { 'таб_номер': 23, 'ФИО': 'Петров Пётр Петрович', 'тип': 'дневной' };

    function loadInfoHost(entries, pending) {
        const host = wsHost(['_dnDayInfoAt', '_renderDnDayInfo', '_effectiveEntry',
                             '_serverEntry', '_esc', '_fmtTotalsNum', '_statusMeta',
                             '_dnParseTime', '_dnMinutesToHHMM'], {});
        host._EMPLOYEES = [DAY_EMP];
        host._ENTRIES = entries || [];
        host._PENDING = pending || {};
        host._STATUS_CODES = CODES;
        return host;
    }
    function loadApplyHost() {
        const host = wsHost(['_applyCellStatus', '_serverEntry', '_autoDnIsKey',
                             '_autoDnUnmark'], {});
        host._ENTRIES = [];
        host._PENDING = {};
        return host;
    }

    test('_applyCellStatus «д» с парой → _PENDING несёт времена', () => {
        const host = loadApplyHost();
        host._applyCellStatus('2026-10-10', '023', 'д', 7.2, '07:30', '15:12');
        const p = host._PENDING['2026-10-10|023'];
        assertEqual(p['часы'], 7.2, 'часы');
        assertEqual(p['время_начала'], '07:30', 'время_начала');
        assertEqual(p['время_окончания'], '15:12', 'время_окончания');
    });

    test('_applyCellStatus «н» с ночной парой — симметрия «д»', () => {
        const host = loadApplyHost();
        host._applyCellStatus('2026-10-10', '023', 'н', 12, '19:30', '07:30');
        const p = host._PENDING['2026-10-10|023'];
        assertEqual(p['время_начала'], '19:30', 'начало ночной');
        assertEqual(p['время_окончания'], '07:30', 'окончание утреннее');
    });

    test('_applyCellStatus без времён (сменный/старый хост) → null-поля', () => {
        const host = loadApplyHost();
        host._applyCellStatus('2026-10-10', '017', 'д', undefined);
        const p = host._PENDING['2026-10-10|017'];
        assertEqual(p['часы'], null, 'часов нет');
        assertEqual(p['время_начала'], null, 'времён нет');
        assertEqual(p['время_окончания'], null, 'времён нет');
    });

    test('_dnDayInfoAt: запись с парой → времена в объекте справки', () => {
        const host = loadInfoHost([
            { 'дата': '2026-10-10', 'таб_номер': 23, 'статус': 'д', 'часы': 7.2,
              'время_начала': '07:30', 'время_окончания': '15:12' }]);
        const info = host._dnDayInfoAt('2026-10-10', 23);
        assertEqual(info['время_начала'], '07:30', 'начало из L');
        assertEqual(info['время_окончания'], '15:12', 'окончание из M');
        assertEqual(info['часы'], 7.2, 'часы из K');
    });

    test('_dnDayInfoAt: половина пары/мусор → оба null', () => {
        const host = loadInfoHost([
            { 'дата': '2026-10-10', 'таб_номер': 23, 'статус': 'д', 'часы': 8,
              'время_начала': '09:15' },
            { 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д', 'часы': 8,
              'время_начала': 'мусор', 'время_окончания': '15:00' }]);
        assertEqual(host._dnDayInfoAt('2026-10-10', 23)['время_начала'], null,
            'только начало — пары нет');
        assertEqual(host._dnDayInfoAt('2026-10-10', 23)['время_окончания'], null,
            'и окончание null');
        assertEqual(host._dnDayInfoAt('2026-10-11', 23)['время_начала'], null,
            'мусор игнорируется');
    });

    test('_renderDnDayInfo: «Время работы: 07:30–15:12 · 7,2 ч»', () => {
        const host = loadInfoHost([
            { 'дата': '2026-10-10', 'таб_номер': 23, 'статус': 'д', 'часы': 7.2,
              'время_начала': '07:30', 'время_окончания': '15:12' }]);
        const html = host._renderDnDayInfo('2026-10-10', 23);
        assertTrue(html.indexOf('Время работы: 07:30–15:12 · 7,2 ч') !== -1,
            'диапазон + часы (день)');
        assertFalse(html.indexOf('ws-dn-info-empty') !== -1, 'не «пустой» вариант');
    });

    test('_renderDnDayInfo «н»: 19:30–07:30 · 12 ч (через полночь)', () => {
        const host = loadInfoHost([
            { 'дата': '2026-10-10', 'таб_номер': 23, 'статус': 'н', 'часы': 12,
              'время_начала': '19:30', 'время_окончания': '07:30' }]);
        const html = host._renderDnDayInfo('2026-10-10', 23);
        assertTrue(html.indexOf('Время работы: 19:30–07:30 · 12 ч (через полночь)') !== -1,
            'ночь: диапазон, часы, полночь (симметрия малой формы)');
    });

    test('_renderDnDayInfo: только часы (без времён) — прежний формат', () => {
        const host = loadInfoHost([
            { 'дата': '2026-10-10', 'таб_номер': 23, 'статус': 'д', 'часы': 7.2 }]);
        const html = host._renderDnDayInfo('2026-10-10', 23);
        assertTrue(html.indexOf('Время работы: 7,2 ч') !== -1,
            'легаси-запись Task 322 без L/M');
    });

    test('_renderDnDayInfo: пусто → курсив «не указано» (регресс 522)', () => {
        const host = loadInfoHost([
            { 'дата': '2026-10-10', 'таб_номер': 23, 'статус': 'д' }]);
        const html = host._renderDnDayInfo('2026-10-10', 23);
        assertTrue(html.indexOf('Время работы: не указано') !== -1, 'прочерк');
        assertTrue(html.indexOf('ws-dn-info-empty') !== -1, 'курсив-класс');
    });
});

// ============================================================
// 5. SW: версия кэша
// ============================================================
describe('Task 523 — SW: версия кэша', () => {
    test('SW: кэш поднят до kipia-test-v759 (Task 523)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v759') !== -1,
            'SW несёт версию kipia-test-v759');
        assertTrue(SW_SRC.indexOf('kipia-test-v735') === -1,
            'прошлая версия вычищена');
    });
});
