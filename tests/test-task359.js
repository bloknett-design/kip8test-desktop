// tests/test-task359.js
// Task 359 — два замечания пользователя по разделу расходомеров:
//
//   1. «Красный цвет показаний по периодам сделай ярче, а шрифт
//      немного больше, чтобы лучше привлекал внимание» —
//      .flow-summary-val-due: #e74c3c/#c0392b → #ff5c47/#e8230a,
//      16px/700 → 18px/800.
//
//   2. «При вводе очередных показаний и после записи их на сервер,
//      при необходимости отредактировать значение, создаётся НОВАЯ
//      запись, а не редактирование ранее введённого расхода —
//      по условию в течение часа» — правка в окне 1 ч теперь
//      обновляет архивную запись НА МЕСТЕ (FlowmeterArchive.
//      updateLatestReading), комментарий meters.O не сбрасывается,
//      «Хронология показаний» не обрастает дублями за одну дату.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. CSS (index.html): новые яркие цвета, укрупнённый шрифт,
//      зелёный базовый не тронут, маркер Task 359 в комментарии.
//   B. Сервер FlowmeterArchive.gs: updateLatestReading — SRC-гарды
//      (сигнатура, пропуск агрегатов, окно свежести, защита P) + VM:
//      правка на месте свежей суточной строки; пропуск записей
//      «неделя/месяц»; отказ при устаревшей строке/без метки/пустом
//      архиве; комментарий P — не стирается пустым, пишется непустым;
//      пересчёт consumption/daysBetween; запись колонок C–Q.
//   C. Сервер Flowmeter.gs: isEdit-ветка — VM-прогон updateReading
//      с моками листов: правка → updateLatestReading, appendToArchive
//      НЕ вызывается, meters.O (комментарий) не сбрасывается;
//      новый ввод → appendToArchive (comment='') + миграция meters.O;
//      фолбэк правки (архив вернул false) → appendToArchive
//      с комментарием записи.
//   D. Аудит: пометка «(правка в окне 1 ч)».
//   E. node --check обоих .gs (через временные .js-копии).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const { execSync } = require('child_process');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FLOWMETER_GS = fs.readFileSync(path.join(ROOT, 'scripts', 'Flowmeter.gs'), 'utf8');
const ARCHIVE_GS = fs.readFileSync(path.join(ROOT, 'scripts', 'FlowmeterArchive.gs'), 'utf8');

// ============================================================
// A. CSS — яркий красный + крупный шрифт
// ============================================================
describe('Task 359 — CSS: красный ярче, шрифт крупнее', () => {

    test('Тёмная тема: #ff5c47 + 18px + 800', () => {
        assertTrue(INDEX_SRC.indexOf('.flow-summary-val.flow-summary-val-due {') !== -1,
            'блок правила due существует');
        const block = INDEX_SRC.slice(
            INDEX_SRC.indexOf('.flow-summary-val.flow-summary-val-due {'),
            INDEX_SRC.indexOf('}', INDEX_SRC.indexOf('.flow-summary-val.flow-summary-val-due {')));
        assertTrue(block.indexOf('#ff5c47') !== -1,
            'цвет ярче: #e74c3c → #ff5c47');
        assertTrue(block.indexOf('font-size: 18px;') !== -1,
            'шрифт крупнее: 16px → 18px');
        assertTrue(block.indexOf('font-weight: 800;') !== -1,
            'жирнее: 700 → 800');
    });

    test('Светлая тема: #e8230a + 18px + 800', () => {
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] .flow-summary-val.flow-summary-val-due { color: #e8230a; font-size: 18px; font-weight: 800; }'
            ) !== -1, 'светлая тема — яркий #e8230a, 18px, 800');
    });

    test('Зелёный базовый не тронут (обычные показания)', () => {
        assertTrue(INDEX_SRC.indexOf(
            '.flow-summary-val { font-size: 16px; font-weight: 700; color: #5ab870; }'
            ) !== -1, 'зелёный 16px/700 остаётся базовым');
    });

    test('Старые приглушённые красные убраны', () => {
        assertTrue(INDEX_SRC.indexOf('flow-summary-val-due { color: #e74c3c;') === -1,
            '#e74c3c не остался');
        assertTrue(INDEX_SRC.indexOf('flow-summary-val-due { color: #c0392b;') === -1,
            '#c0392b не остался');
    });

    test('Комментарий CSS содержит маркер Task 359', () => {
        const i = INDEX_SRC.indexOf('Task 348: «пора вводить новые данные»');
        assertTrue(i !== -1, 'комментарий Task 348 на месте');
        const chunk = INDEX_SRC.slice(i, i + 900);
        assertTrue(chunk.indexOf('Task 359') !== -1,
            'заметка Task 359 о яркости/шрифте в комментарии CSS');
    });
});

// ============================================================
// B1. FlowmeterArchive.gs — SRC-гарды
// ============================================================
describe('Task 359 — SRC: FlowmeterArchive.updateLatestReading', () => {

    test('Функция определена с полной сигнатурой (13 параметров)', () => {
        assertTrue(ARCHIVE_GS.indexOf(
            'updateLatestReading: function(meterId, prev, curr, datePrev, dateCurr, temp, gcal, unit, period, role, name, comment, anomaly)'
            ) !== -1, 'сигнатура зеркалит appendToArchive минус entryType');
    });

    test('Агрегаты «неделя/месяц» пропускаются при поиске', () => {
        assertTrue(ARCHIVE_GS.indexOf(
            "if (etRaw === 'неделя' || etRaw === 'месяц') continue;   // агрегаты — не та запись"
            ) !== -1, 'записи «за период» — другие логические записи');
    });

    test('Окно свежести строки — 1 час, зеркалит updateReading', () => {
        assertTrue(ARCHIVE_GS.indexOf('if (elapsedMin > 60) return false;') !== -1,
            'устаревшая строка не правится');
        assertTrue(ARCHIVE_GS.indexOf('if (!(ts instanceof Date)) return false;') !== -1,
            'нет метки времени — не правим');
    });

    test('P (comment) не стирается пустым значением', () => {
        assertTrue(ARCHIVE_GS.indexOf(
            "if (String(comment || '') !== '') {"
            ) !== -1, 'пустой комментарий не затирает существующий P');
        assertTrue(ARCHIVE_GS.indexOf(
            'sheet.getRange(rowToUpdate, 16).setValue(String(comment));'
            ) !== -1, 'непустой комментарий пишется в P=16');
    });

    test('Идентичность записи не трогается (A/B/R)', () => {
        // пишем C(3)–Q(17), кроме P(16) условно; A(1)/B(2)/R(18) — нет
        const fn = ARCHIVE_GS.slice(
            ARCHIVE_GS.indexOf('updateLatestReading: function'),
            ARCHIVE_GS.indexOf('updateLatestComment'));
        assertTrue(fn.indexOf('rowToUpdate, 1)') === -1, 'колонка A не пишется');
        assertTrue(fn.indexOf('rowToUpdate, 2)') === -1, 'колонка B не пишется');
        assertTrue(fn.indexOf('rowToUpdate, 18)') === -1, 'колонка R не пишется');
        assertTrue(fn.indexOf('rowToUpdate, 3).setValue') !== -1, 'C: prev пишется');
        assertTrue(fn.indexOf('rowToUpdate, 17).setValue') !== -1, 'Q: anomaly пишется');
    });
});

// ============================================================
// B2. FlowmeterArchive.gs — VM: updateLatestReading на мок-листе
// ============================================================

// Мок листа архива: rows[i] = строка ДАННЫХ (индекс 0 = строка 2).
// Поддерживает блок-чтение (getRange(row, 1, n, 18).getValues) и
// точечную запись (getRange(row, col).setValue / .getValue).
function archiveSheetMock(rows) {
    const writes = [];
    const sheet = {
        getLastRow: function () { return rows.length + 1; },
        appendRow: function (arr) { rows.push(arr.slice()); },
        getRange: function (row, col, numRows, numCols) {
            const r = row - 2;
            return {
                getValues: function () {
                    const out = [];
                    for (let i = 0; i < (numRows || 1); i++) {
                        out.push((rows[r + i] || []).slice());
                    }
                    return out;
                },
                getValue: function () { return (rows[r] || [])[col - 1]; },
                setValue: function (v) {
                    if (!rows[r]) rows[r] = new Array(18).fill('');
                    rows[r][col - 1] = v;
                    writes.push({ row: row, col: col, val: v });
                }
            };
        }
    };
    return { sheet: sheet, writes: writes, rows: rows };
}

// Дата ВНУТРИ VM-контекста (main-realm Date прокинут в ctx —
// instanceof Date в VM-коде видит наши даты).
// Flowmeter-заглушка: архиву нужен только _clientToDateObj.
function archiveVM(rows) {
    const mock = archiveSheetMock(rows);
    const ctx = {
        Date: Date,                       // один realm для instanceof
        Math: Math, parseInt: parseInt, parseFloat: parseFloat, String: String,
        Logger: { log: function () {} },
        Flowmeter: {
            _clientToDateObj: function (val) {
                if (!val) return null;
                var s = String(val).trim();
                var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                if (m) {
                    var d = new Date(+m[3], +m[1] - 1, +m[2]);
                    if (!isNaN(d.getTime())) return d;
                }
                return null;
            }
        }
    };
    vm.createContext(ctx);
    const obj = vm.runInContext(
        '(function(){' + ARCHIVE_GS + '; return FlowmeterArchive;})()', ctx);
    obj._getSheet = function () { return mock.sheet; };
    return { obj: obj, mock: mock, ctx: ctx };
}

// Свежая суточная строка (timestamp = «сейчас минус 10 минут»)
function freshDailyRow(minutesAgo, entryType, opts) {
    const o = opts || {};
    const ts = new Date(Date.now() - (minutesAgo || 10) * 60000);
    const row = new Array(18).fill('');
    row[0] = 2;                                   // A: meterId
    row[1] = 'Хозрасчёт №2';                      // B: hoz
    row[2] = 100;                                 // C: prev
    row[3] = 110;                                 // D: curr
    row[4] = 10;                                  // E: consumption
    row[14] = ts;                                 // O: timestamp
    row[17] = entryType || '';                    // R: entryType
    if (o.comment !== undefined) row[15] = o.comment;   // P
    return row;
}

describe('Task 359 — VM: updateLatestReading (правка на месте)', () => {

    test('Свежая суточная строка обновляется, НЕ создаётся новая', () => {
        // rows[i] = строка листа (i+2), поиск с конца:
        //  rows[3] — агрегат id=3 «месяц» → пропуск;
        //  rows[2] — целевая: последняя суточная id=2 (10 мин назад);
        //  rows[1] — агрегат id=9 «неделя» → пропуск;
        //  rows[0] — более старая суточная id=2 (30 мин назад) — не трогать.
        const rows = [
            [2, 'Хозрасчёт №2', 90, 100, 10, '', '', 1, 'т', '', '', 'Ежедневно', '', '', new Date(Date.now() - 30 * 60000), 'старый комм', '', ''],
            [9, 'Хозрасчёт №9', 5, 7, 2, '', '', 0, 'т', '', '', 'Ежедневно', '', '', new Date(Date.now() - 5 * 60000), '', '', 'неделя'],
            freshDailyRow(10),
            [3, 'Хозрасчёт №3', 1, 2, 1, '', '', 0, 'т', '', '', 'Ежедневно', '', '', new Date(Date.now() - 5 * 60000), '', '', 'месяц']
        ];
        const before = rows.length;
        const vmr = archiveVM(rows);
        const res = vmr.obj.updateLatestReading(2, 100, 115, '9/9/2026', '9/10/2026', 55.5, 1.2, 'т', 'Ежедневно', 'КИП ИОС', 'Иванов И.', '', 'JUMP_HIGH: x');
        assertTrue(res === true, 'строка найдена и обновлена');
        assertEqual(rows.length, before, 'новых строк НЕ добавлено');
        const target = rows[2];                  // последняя суточная id=2
        assertEqual(target[3], 115, 'D: curr = новое значение');
        assertEqual(target[2], 100, 'C: prev');
        assertEqual(target[4], 15, 'E: consumption = 115-100');
        assertEqual(target[7], 1, 'H: daysBetween = 1');
        assertEqual(target[9], 55.5, 'J: temp');
        assertEqual(target[10], 1.2, 'K: gcal');
        assertEqual(target[13], 'Иванов И.', 'N: modName');
        assertEqual(target[16], 'JUMP_HIGH: x', 'Q: anomaly');
        assertTrue(target[14] instanceof Date, 'O: метка правки (Date)');
        assertTrue(Date.now() - target[14].getTime() < 5000, 'O: время = сейчас');
        // соседние строки не тронуты
        assertEqual(rows[0][3], 100, 'старая суточная id=2 не тронута');
        assertEqual(rows[0][15], 'старый комм', 'её комментарий не тронут');
        assertEqual(rows[1][3], 7, 'агрегат id=9 не тронут');
        assertEqual(rows[3][3], 2, 'агрегат id=3 не тронут');
    });

    test('Агрегат «за период» поверх суточной — правится суточная под ним', () => {
        const rows = [
            new Array(18).fill(''),
            freshDailyRow(10),
            [2, 'Хозрасчёт №2', 20, 50, 30, '', '', 7, 'т', '', '', 'Ежедневно', '', '', new Date(Date.now() - 2 * 60000), '', '', 'неделя']
        ];
        const vmr = archiveVM(rows);
        const res = vmr.obj.updateLatestReading(2, 100, 120, '9/9/2026', '9/10/2026', null, null, 'т', 'Ежедневно', 'r', 'n', '', '');
        assertTrue(res === true, 'правится суточная, агрегат пропущен');
        assertEqual(rows[1][3], 120, 'суточная D обновлена');
        assertEqual(rows[2][3], 50, 'агрегат D не тронут');
    });

    test('Строка старше 1 часа — false (не подменять чужую запись)', () => {
        const rows = [
            new Array(18).fill(''),
            freshDailyRow(75)                     // 1ч15м назад
        ];
        const vmr = archiveVM(rows);
        const res = vmr.obj.updateLatestReading(2, 100, 115, '9/9/2026', '9/10/2026', null, null, 'т', 'Ежедневно', 'r', 'n', '', '');
        assertFalse(res, 'устаревшая строка не правится');
        assertEqual(rows[1][3], 110, 'значение не изменилось');
    });

    test('Ровно в окне (59 минут) — правится', () => {
        const rows = [new Array(18).fill(''), freshDailyRow(59)];
        const vmr = archiveVM(rows);
        assertTrue(vmr.obj.updateLatestReading(2, 100, 115, '9/9/2026', '9/10/2026', null, null, 'т', 'Ежедневно', 'r', 'n', '', '') === true,
            '59 мин < 60 — ок');
    });

    test('Нет метки времени (legacy) — false', () => {
        const row = freshDailyRow(10);
        row[14] = '';
        const rows = [new Array(18).fill(''), row];
        const vmr = archiveVM(rows);
        assertFalse(vmr.obj.updateLatestReading(2, 100, 115, '9/9/2026', '9/10/2026', null, null, 'т', 'Ежедневно', 'r', 'n', '', ''),
            'без timestamp не правим');
    });

    test('Нет записей для meterId — false', () => {
        const rows = [new Array(18).fill(''), freshDailyRow(10)];
        const vmr = archiveVM(rows);
        assertFalse(vmr.obj.updateLatestReading(5, 1, 2, '9/9/2026', '9/10/2026', null, null, 'т', 'Ежедневно', 'r', 'n', '', ''),
            'нет суточных записей id=5');
    });

    test('Пустой архив — false', () => {
        const vmr = archiveVM([new Array(18).fill('')]);
        assertFalse(vmr.obj.updateLatestReading(2, 1, 2, '9/9/2026', '9/10/2026', null, null, 'т', 'Ежедневно', 'r', 'n', '', ''),
            'только заголовок');
    });

    test('Комментарий: пустой не стирает P, непустой пишет', () => {
        // (а) пустой — P сохраняется
        const rowsA = [new Array(18).fill(''), freshDailyRow(10, '', { comment: 'был ввод вручную' })];
        const vmA = archiveVM(rowsA);
        vmA.obj.updateLatestReading(2, 100, 115, '9/9/2026', '9/10/2026', null, null, 'т', 'Ежедневно', 'r', 'n', '', '');
        assertEqual(rowsA[1][15], 'был ввод вручную', 'P не стёрт пустым comment');
        // (б) непустой — P обновляется (восстановление после сбоя)
        const rowsB = [new Array(18).fill(''), freshDailyRow(10, '', { comment: '' })];
        const vmB = archiveVM(rowsB);
        vmB.obj.updateLatestReading(2, 100, 115, '9/9/2026', '9/10/2026', null, null, 'т', 'Ежедневно', 'r', 'n', 'комментарий автора', '');
        assertEqual(rowsB[1][15], 'комментарий автора', 'P восстановлен');
    });

    test('temp/gcal пустые — в ячейки пишется пусто', () => {
        const rows = [new Array(18).fill(''), freshDailyRow(10)];
        const vmr = archiveVM(rows);
        vmr.obj.updateLatestReading(2, 100, 115, '9/9/2026', '9/10/2026', null, null, 'т', 'Ежедневно', 'r', 'n', '', '');
        assertEqual(rows[1][9], '', 'J: temp пусто');
        assertEqual(rows[1][10], '', 'K: gcal пусто');
    });

    test('Даты: строки M/D/YYYY → Date objects', () => {
        const rows = [new Array(18).fill(''), freshDailyRow(10)];
        const vmr = archiveVM(rows);
        vmr.obj.updateLatestReading(2, 100, 115, '9/9/2026', '9/10/2026', null, null, 'т', 'Ежедневно', 'r', 'n', '', '');
        assertTrue(rows[1][5] instanceof Date, 'F: datePrev — Date');
        assertTrue(rows[1][6] instanceof Date, 'G: dateCurr — Date');
        assertEqual(rows[1][5].getFullYear(), 2026, 'год datePrev');
        assertEqual(rows[1][6].getDate(), 10, 'день dateCurr');
    });
});

// ============================================================
// C. Flowmeter.gs — VM: updateReading isEdit-ветка
// ============================================================

// Мок meters-листа: строка 1 — заголовки, rowNum = id + 1
// (rows[rowNum - 1] = строка данных id).
function metersSheetMock(id, o) {
    const opts = o || {};
    const rows = [];
    rows[0] = new Array(17).fill('');            // заголовок
    for (let i = 1; i <= 12; i++) rows[i] = new Array(17).fill('');
    const rowNum = id + 1;
    const row = rows[rowNum - 1];
    row[0] = id;                                  // A
    row[1] = 'Хозрасчёт №' + id;                  // B
    row[2] = 'Расход пара';                       // C
    row[7] = 'т';                                 // H: unit
    row[10] = opts.period || 'Ежедневно';         // K
    row[11] = opts.modRole || 'КИП ИОС';          // L
    row[12] = opts.modEmail || 'u@x.ru';          // M: modName (email, Task 108)
    row[13] = opts.fresh ? new Date(Date.now() - 10 * 60000)
             : (opts.modTs || new Date(2026, 0, 1)); // N: modTimestamp
    if (opts.comment !== undefined) row[14] = opts.comment;  // O
    row[16] = '';                                 // Q: allowNegative
    const writes = [];
    const sheet = {
        getLastRow: function () { return rows.length; },
        getRange: function (row2, col, nr, nc) {
            const r = row2 - 1;
            return {
                getValue: function () { return (rows[r] || [])[col - 1]; },
                setValue: function (v) {
                    rows[r][col - 1] = v;
                    writes.push({ row: row2, col: col, val: v });
                }
            };
        }
    };
    return { sheet: sheet, rows: rows, writes: writes, rowNum: rowNum };
}

// Загрузка Flowmeter.gs в VM с моками зависимостей.
// archiveCalls — записи вызовов FlowmeterArchive-мока.
function flowmeterVM(meters, archiveCalls, opts) {
    const o = opts || {};
    const ctx = {
        Date: Date, Math: Math, parseInt: parseInt, parseFloat: parseFloat,
        String: String, Array: Array, isNaN: isNaN,
        Logger: { log: function () {} },
        Utils: {
            audit: function (email, action, ip, ua, details) {
                archiveCalls.audits.push({ action: action, details: String(details) });
            },
            findSessionByToken: function () { return { user_id: 7 }; },
            findUserById: function () { return null; }
        },
        rmRequirePerm: function (token, perm) {
            return o.denyPerm
                ? { ok: false, error: 'нет прав' }
                : { ok: true, user: o.user || { email: 'u@x.ru', role: 'КИП ИОС', name: 'Иванов И.' } };
        },
        ValidationRules: {
            getRulesForMeter: function () { return null; },
            compute: function () { return { hardBlock: null, detail: '' }; },
            WRONG_METER_PARAMS: { LOOKBACK_DAYS: 7 }
        },
        SpreadsheetApp: {
            openById: function () {
                return { getSheetByName: function () { return null; } };  // нет архива → lastArchiveRecord=null
            }
        },
        FlowmeterArchive: {
            appendToArchive: function () {
                archiveCalls.append.push(Array.prototype.slice.call(arguments));
            },
            updateLatestReading: function () {
                archiveCalls.updateLatest.push(Array.prototype.slice.call(arguments));
                return o.updateLatestResult !== undefined ? o.updateLatestResult : true;
            },
            updateLatestComment: function () {
                archiveCalls.updateComment.push(Array.prototype.slice.call(arguments));
            },
            getRecentAllMeters: function () { return null; }
        }
    };
    vm.createContext(ctx);
    const obj = vm.runInContext('(function(){' + FLOWMETER_GS + '; return Flowmeter;})()', ctx);
    obj._getSheet = function () { return meters.sheet; };
    obj._requireEdit = function () {
        return o.denyPerm
            ? { error: { ok: false, error: 'нет прав' } }
            : { user: (o.user || { email: 'u@x.ru', role: 'КИП ИОС', name: 'Иванов И.' }) };
    };
    return { obj: obj, ctx: ctx };
}

function newArchiveCalls() {
    return { append: [], updateLatest: [], updateComment: [], audits: [] };
}

describe('Task 359 — VM: updateReading, ветка isEdit', () => {

    test('Правка: архив обновляется НА МЕСТЕ, appendToArchive НЕ вызывается', () => {
        const meters = metersSheetMock(2, { fresh: true, comment: 'введено по телефону' });
        const calls = newArchiveCalls();
        const vmr = flowmeterVM(meters, calls);
        const res = vmr.obj.updateReading({
            token: 'tok', id: 2, prev: 100, curr: 115,
            datePrev: '9/9/2026', dateCurr: '9/10/2026', temp: 55, gcal: 1.5,
            isEdit: true
        });
        assertEqual(res.ok, true, 'ответ ok');
        assertEqual(calls.updateLatest.length, 1, 'updateLatestReading вызван 1 раз');
        assertEqual(calls.append.length, 0, 'appendToArchive НЕ вызывается при правке');
        const args = calls.updateLatest[0];
        assertEqual(args[0], 2, 'meterId');
        assertEqual(args[1], 100, 'prev');
        assertEqual(args[2], 115, 'curr');
        assertEqual(args[7], 'т', 'unit');
        assertEqual(args[12], '', 'anomaly detail');
    });

    test('Правка: комментарий meters.O сохраняется (не сбрасывается)', () => {
        const meters = metersSheetMock(2, { fresh: true, comment: 'введено по телефону' });
        const calls = newArchiveCalls();
        const vmr = flowmeterVM(meters, calls);
        vmr.obj.updateReading({
            token: 'tok', id: 2, prev: 100, curr: 115,
            datePrev: '9/9/2026', dateCurr: '9/10/2026',
            isEdit: true
        });
        assertEqual(meters.rows[meters.rowNum - 1][14], 'введено по телефону',
            'O не сброшен при правке');
        assertEqual(calls.updateComment.length, 0,
            'миграция updateLatestComment не зовётся при правке');
        // и комментарий передан в updateLatestReading
        assertEqual(calls.updateLatest[0][11], 'введено по телефону',
            'комментарий передан в обновление archive.P');
    });

    test('Правка: meters-строка обновляется (F/G/N), M = email', () => {
        const meters = metersSheetMock(2, { fresh: true });
        const calls = newArchiveCalls();
        const vmr = flowmeterVM(meters, calls);
        vmr.obj.updateReading({
            token: 'tok', id: 2, prev: 100, curr: 115,
            datePrev: '9/9/2026', dateCurr: '9/10/2026', temp: 55,
            isEdit: true
        });
        const row = meters.rows[meters.rowNum - 1];
        assertEqual(row[5], 100, 'F: prev');
        assertEqual(row[6], 115, 'G: curr');
        assertEqual(row[8], 55, 'I: temp');
        assertEqual(row[12], 'u@x.ru', 'M: email (Task 108)');
        assertTrue(row[13] instanceof Date, 'N: modTimestamp обновлён');
    });

    test('Фолбэк правки: updateLatestReading=false → append с комментарием записи', () => {
        const meters = metersSheetMock(2, { fresh: true, comment: 'комментарий ввода' });
        const calls = newArchiveCalls();
        const vmr = flowmeterVM(meters, calls, { updateLatestResult: false });
        vmr.obj.updateReading({
            token: 'tok', id: 2, prev: 100, curr: 115,
            datePrev: '9/9/2026', dateCurr: '9/10/2026',
            isEdit: true
        });
        assertEqual(calls.updateLatest.length, 1, 'попытка на месте была');
        assertEqual(calls.append.length, 1, 'фолбэк: appendToArchive вызван');
        assertEqual(calls.append[0][12], 'комментарий ввода',
            'комментарий перенесён в P новой строки (не потерян)');
        assertEqual(calls.append[0][14], 'сутки', 'entryType = сутки');
    });

    test('Новый ввод: appendToArchive как прежде + миграция комментария', () => {
        const meters = metersSheetMock(2, { comment: 'старый комментарий' });
        const calls = newArchiveCalls();
        const vmr = flowmeterVM(meters, calls);
        vmr.obj.updateReading({
            token: 'tok', id: 2, prev: 100, curr: 115,
            datePrev: '9/9/2026', dateCurr: '9/10/2026'
        });
        assertEqual(calls.updateLatest.length, 0, 'updateLatestReading не зовётся');
        assertEqual(calls.append.length, 1, 'appendToArchive — новая строка');
        assertEqual(calls.append[0][12], '', 'новая запись — comment пуст (Task 237)');
        assertEqual(calls.updateComment.length, 1, 'миграция старого комментария');
        assertEqual(meters.rows[meters.rowNum - 1][14], '', 'meters.O сброшен (новый ввод)');
    });

    test('Аудит: пометка «(правка в окне 1 ч)» только при isEdit', () => {
        const metersA = metersSheetMock(2, { fresh: true });
        const callsA = newArchiveCalls();
        flowmeterVM(metersA, callsA).obj.updateReading({
            token: 'tok', id: 2, prev: 100, curr: 115,
            datePrev: '9/9/2026', dateCurr: '9/10/2026', isEdit: true
        });
        assertTrue(callsA.audits[0].details.indexOf('(правка в окне 1 ч)') !== -1,
            'аудит правки помечен');

        const metersB = metersSheetMock(2, {});
        const callsB = newArchiveCalls();
        flowmeterVM(metersB, callsB).obj.updateReading({
            token: 'tok', id: 2, prev: 100, curr: 115,
            datePrev: '9/9/2026', dateCurr: '9/10/2026'
        });
        assertTrue(callsB.audits[0].details.indexOf('(правка') === -1,
            'новый ввод — без пометки');
    });

    test('Серверные проверки окна правки не сломаны (не тот пользователь)', () => {
        const meters = metersSheetMock(2, { fresh: true });
        const calls = newArchiveCalls();
        const vmr = flowmeterVM(meters, calls);
        const res = vmr.obj.updateReading({
            token: 'tok', id: 2, prev: 100, curr: 115,
            datePrev: '9/9/2026', dateCurr: '9/10/2026',
            isEdit: true
        });
        // modEmail в моке = u@x.ru, пользователь тоже u@x.ru — должно пройти
        assertEqual(res.ok, true, 'тот же пользователь — правка разрешена');

        const meters2 = metersSheetMock(2, { fresh: true, modEmail: 'other@x.ru' });
        const calls2 = newArchiveCalls();
        const vmr2 = flowmeterVM(meters2, calls2);
        const res2 = vmr2.obj.updateReading({
            token: 'tok', id: 2, prev: 100, curr: 115,
            datePrev: '9/9/2026', dateCurr: '9/10/2026',
            isEdit: true
        });
        assertEqual(res2.ok, false, 'чужой ввод — отказ');
        assertEqual(res2.error, 'not_your_input', 'код ошибки not_your_input');
        assertEqual(calls2.append.length, 0, 'ничего не записано');
    });

    test('Окно 1 ч истекло — правка отвергнута (как прежде)', () => {
        const meters = metersSheetMock(2, { modTs: new Date(Date.now() - 75 * 60000) });
        const calls = newArchiveCalls();
        const vmr = flowmeterVM(meters, calls);
        const res = vmr.obj.updateReading({
            token: 'tok', id: 2, prev: 100, curr: 115,
            datePrev: '9/9/2026', dateCurr: '9/10/2026',
            isEdit: true
        });
        assertEqual(res.ok, false, 'просрочено');
        assertEqual(res.error, 'edit_window_expired', 'код ошибки');
    });
});

// ============================================================
// D. SRC-гарды Flowmeter.gs (статика)
// ============================================================
describe('Task 359 — SRC: Flowmeter.gs, ветка правки', () => {

    test('Миграция комментария только для НОВОГО ввода', () => {
        assertTrue(FLOWMETER_GS.indexOf(
            "if (!payload.isEdit && oldCommentForArchive !== '') {"
            ) !== -1, 'guard !payload.isEdit на блоке миграции+сброса O');
    });

    test('Вызов updateLatestReading в архивной ветке', () => {
        assertTrue(FLOWMETER_GS.indexOf(
            'archived = FlowmeterArchive.updateLatestReading('
            ) !== -1, 'правка → обновление на месте');
        assertTrue(FLOWMETER_GS.indexOf('if (!archived) {') !== -1,
            'фолбэк на appendToArchive');
    });

    test('Фолбэк: комментарий записи не теряется', () => {
        assertTrue(FLOWMETER_GS.indexOf(
            "payload.isEdit ? oldCommentForArchive : ''"
            ) !== -1, 'append при фолбэке несёт комментарий meters.O');
    });

    test('Аудит помечает правку', () => {
        assertTrue(FLOWMETER_GS.indexOf(
            "(payload.isEdit ? ' (правка в окне 1 ч)' : '')"
            ) !== -1, 'пометка в деталях аудита');
    });

    test('Документация метода описывает поведение Task 359', () => {
        const i = FLOWMETER_GS.indexOf('Task 359: правка в окне 1 часа');
        assertTrue(i !== -1, 'заметка Task 359 в док-комментарии updateReading');
    });
});

// ============================================================
// E. node --check (.gs → временная .js-копия)
// ============================================================
describe('Task 359 — синтаксис .gs файлов', () => {

    test('node --check: Flowmeter.gs и FlowmeterArchive.gs', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't359-'));
        try {
            const fm = path.join(tmp, 'Flowmeter.js');
            const fa = path.join(tmp, 'FlowmeterArchive.js');
            fs.writeFileSync(fm, FLOWMETER_GS);
            fs.writeFileSync(fa, ARCHIVE_GS);
            execSync('node --check ' + JSON.stringify(fm), { stdio: 'pipe' });
            execSync('node --check ' + JSON.stringify(fa), { stdio: 'pipe' });
            assertTrue(true, 'оба файла синтаксически валидны');
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });
});
