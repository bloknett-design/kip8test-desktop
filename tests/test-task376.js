// tests/test-task376.js
// Task 376 — заявка пользователя: «при вводе новых данных расходов, в
// последнем расходомере №12 введённые новые данные записались на сервер
// в hozraschet_meters, а в архиве на hozraschet_archive не записались,
// в чём может быть причина, проверь».
//
// ДИАГНОЗ: updateReading пишет meters БЕЗ замка и только потом вызывает
// appendToArchive под Utils.withLock (tryLock 10 c); при вводе всех 12
// расходомеров подряд / параллельных beacon-доставках ПОСЛЕДНИЙ в
// очереди на единственный замок скрипта (№12) упирался в таймаут →
// server_busy → ошибка глоталась как «non-critical» → ok:true → строка
// архива терялась при записанном meters, клиент удалял запись из outbox.
// Усилитель: дедуп _flushOutbox сверялся только с meters.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — сервер FlowmeterArchive.gs: appendToArchive — цикл ретраев
//      (10 c + 4 c + 4 c, пауза 1 c), переброс после последней неудачи,
//      дедуп/appendRow внутри замка не тронуты.
//   B. SRC — сервер Flowmeter.gs: updateReading при сбое архива честно
//      возвращает archive_write_failed (meters уже записан — ячейки
//      пишутся ДО архива); _writePeriodEntry — стабильный код.
//   C. SRC — клиент: archive_write_failed не «окончательный отказ»;
//      ветки в _sendUpdateReading/_submitPeriodEntry; day-дедуп флаша
//      подтверждает доставку по АРХИВУ; finish планирует ретрай.
//   D. VM — сервер FlowmeterArchive.gs: замок занят один раз → ретрай
//      дописывает строку; занят всегда → переброс после 3 попыток;
//      appendRow падает один раз → ретрай; дубль — не ошибка; листа нет
//      — тихий пропуск.
//   E. VM — сервер Flowmeter.gs updateReading: архив падает → ok:false
//      archive_write_failed ПРИ записанном meters; архив ок → ok:true.
//   F. VM — клиент: дедуп day «meters совпал, архива нет» (дыра №12) →
//      запись отправляется повторно; «meters + архив» → не отправляется;
//      _sendUpdateReading при archive_write_failed — запись в outbox,
//      тост, ретрай; finish планирует ретрай при остатке.
//   G. SW v605 (guard v606).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const ARCHIVE_GS = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'FlowmeterArchive.gs'), 'utf8');
const FLOWMETER_GS = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'Flowmeter.gs'), 'utf8');

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

// ============================================================
// A. SRC — сервер FlowmeterArchive.gs: ретраи записи
// ============================================================
describe('Task 376 — SRC: FlowmeterArchive.gs (ретраи appendToArchive)', () => {

    test('цикл ретраев: 3 попытки 10c+4c+4c, пауза 1 c, переброс', () => {
        const m = extractMethod(ARCHIVE_GS, 'appendToArchive');
        assertTrue(m !== null, 'appendToArchive извлечён');
        assertTrue(m.indexOf('var attempts = [10000, 4000, 4000];') !== -1,
            'таймауты попыток: 10 c + 4 c + 4 c');
        assertTrue(m.indexOf('Utilities.sleep(1000)') !== -1,
            'пауза 1 c между попытками');
        assertTrue(m.indexOf('throw lastErr;') !== -1,
            'после последней неудачи исключение ПЕРЕБРАСЫВАЕТСЯ (не глотается)');
        assertTrue(m.indexOf('lastErr = null;') !== -1 &&
                   m.indexOf('break;') !== -1,
            'успешная попытка завершает цикл');
        assertTrue(m.indexOf('Task 376') !== -1, 'маркер Task 376');
    });

    test('дедуп и appendRow — внутри замка, структура не тронута', () => {
        const m = extractMethod(ARCHIVE_GS, 'appendToArchive');
        const lock = m.indexOf('Utils.withLock(function() {');
        const dedup = m.indexOf('_isDuplicateArchiveRow(sheet');
        const append = m.indexOf('sheet.appendRow([');
        assertTrue(lock !== -1 && dedup > lock && append > dedup,
            'дедуп → appendRow внутри withLock (Task 366 цел)');
        assertTrue(m.indexOf('return false;') !== -1 &&
                   m.indexOf('return true;') !== -1,
            'семантика false=дубль / true=записано сохранена');
    });

    test('«дубль» — НЕ ошибка: переброс только по lastErr', () => {
        const m = extractMethod(ARCHIVE_GS, 'appendToArchive');
        const throwIdx = m.indexOf('if (lastErr) {');
        assertTrue(throwIdx !== -1, 'переброс под условием lastErr');
        // единственное упоминание «non-critical» — историческая справка
        // в комментарии (что РАНЬШЕ ошибка глоталась); кодового глотания нет:
        // каждый catch либо ретраит, либо перебрасывает
        const ncCount = (m.match(/non-critical/g) || []).length;
        assertEqual(ncCount, 1, 'упоминание только в комментарии-диагнозе');
    });
});

// ============================================================
// B. SRC — сервер Flowmeter.gs: честный ответ
// ============================================================
describe('Task 376 — SRC: Flowmeter.gs (archive_write_failed)', () => {

    test('updateReading: meters пишутся ДО архива, сбой архива — честный отказ', () => {
        const m = extractMethod(FLOWMETER_GS, 'updateReading');
        assertTrue(m !== null, 'updateReading извлечён');
        // meters-записи раньше вызова appendToArchive
        const metersWrite = m.indexOf('sheet.getRange(rowNum, 6).setValue(prevVal);');
        const archCall = m.indexOf('FlowmeterArchive.appendToArchive(');
        assertTrue(metersWrite !== -1 && archCall !== -1 && metersWrite < archCall,
            'meters-ячейки записываются ДО попытки архива');
        assertTrue(m.indexOf("error: 'archive_write_failed'") !== -1,
            'ok:false c кодом archive_write_failed');
        assertTrue(m.indexOf('Archive write failed (non-critical)') === -1,
            'глотание внешней ошибки архива убрано');
        assertTrue(m.indexOf('Archive edit-in-place failed (non-critical)') !== -1,
            'edit-in-place fallback остался «non-critical» (это не потеря — ветка дописывает строку ниже)');
        assertTrue(m.indexOf('будет отправлена повторно автоматически') !== -1,
            'message объясняет автоматический повтор');
    });

    test('_writePeriodEntry: стабильный код той же ошибки', () => {
        const m = extractMethod(FLOWMETER_GS, '_writePeriodEntry');
        assertTrue(m !== null, '_writePeriodEntry извлечён');
        assertTrue(m.indexOf("error: 'archive_write_failed'") !== -1,
            'периодическая запись: код archive_write_failed');
        assertTrue(m.indexOf('повторно автоматически') !== -1,
            'message про автоматический повтор');
    });
});

// ============================================================
// C. SRC — клиент index.html
// ============================================================
describe('Task 376 — SRC: клиент (archive_write_failed + дедуп по архиву)', () => {

    test('_outboxIsPermanentError: archive_write_failed — НЕ окончательный', () => {
        const m = extractMethod(INDEX_SRC, '_outboxIsPermanentError');
        assertTrue(m !== null, 'метод извлечён');
        assertTrue(m.indexOf('/archive_write_failed/i') !== -1,
            'код освобождён от «окончательного отказа» (ретрай позже)');
        const busy = m.indexOf('/server_busy/i');
        const awf = m.indexOf('/archive_write_failed/i');
        const ret = m.indexOf('return true;');
        assertTrue(busy !== -1 && awf !== -1 && ret !== -1 &&
                   busy < awf && awf < ret,
            'проверка стоит до return true (вместе с server_busy)');
    });

    test('_sendUpdateReading: ветка archive_write_failed до permanent-удаления', () => {
        const m = extractMethod(INDEX_SRC, '_sendUpdateReading');
        assertTrue(m !== null, 'метод извлечён');
        const awf = m.indexOf('/archive_write_failed/i.test(');
        const perm = m.indexOf('self._outboxIsPermanentError(err)');
        assertTrue(awf !== -1 && perm !== -1 && awf < perm,
            'ветка проверяется РАНЬШЕ удаления «окончательного отказа»');
        const upd = m.indexOf("state: 'retry'");
        const sched = m.indexOf('self._scheduleOutboxRetry();');
        assertTrue(upd !== -1 && sched !== -1 && sched > awf,
            'запись остаётся в outbox + ретрай-таймер');
        assertTrue(m.indexOf('отправим повторно автоматически') !== -1,
            'честный тост');
        const ret = m.indexOf('return;', awf);
        assertTrue(ret !== -1 && ret < perm, 'ветка завершает обработку');
    });

    test('_submitPeriodEntry: archive_write_failed не удаляет запись', () => {
        const m = extractMethod(INDEX_SRC, '_submitPeriodEntry');
        assertTrue(m !== null, 'метод извлечён');
        const awf = m.indexOf("err._kind === 'SERVER' &&");
        const srv = m.indexOf("err._kind === 'SERVER') {");
        const awfTest = m.indexOf('/archive_write_failed/i.test(msg)');
        assertTrue(awf !== -1 && awfTest !== -1 &&
                   awfTest > awf && awfTest < awf + 120,
            'archive_write_failed — условие ПЕРВОЙ SERVER-ветки');
        assertTrue(srv !== -1 && awf < srv,
            'ветка раньше общего SERVER-удаления (запись не удаляется)');
        assertTrue(m.indexOf('отправим повторно автоматически') !== -1,
            'тост про автоматический повтор');
    });

    test('_flushOutbox: day-дедуп подтверждает доставку по АРХИВУ', () => {
        const m = extractMethod(INDEX_SRC, '_flushOutbox');
        assertTrue(m !== null, 'метод извлечён');
        assertTrue(m.indexOf('candidates.push({ e: e, id:') !== -1,
            'meters-совпадение — только кандидат');
        assertTrue(m.indexOf("'flowmeter.archive'") !== -1,
            'запрос архива для подтверждения');
        assertTrue(m.indexOf('rec.entryType') !== -1 &&
                   m.indexOf('rec.dateCurr') !== -1 &&
                   m.indexOf('rec.curr') !== -1,
            'ключ подтверждения: entryType + dateCurr + curr');
        assertTrue(m.indexOf('_outboxRemove(c.e.cid);') !== -1,
            'удаление из outbox — только после подтверждения архивом');
        assertTrue(m.indexOf('Task 376') !== -1, 'маркер Task 376');
    });

    test('_flushOutbox finish: ретрай-таймер при остатке записей', () => {
        const m = extractMethod(INDEX_SRC, '_flushOutbox');
        const fin = m.indexOf('var finish = function(sent)');
        const zone = m.slice(fin, m.indexOf('entries = this._outboxCollapseDuplicates'));
        assertTrue(zone.indexOf('_scheduleOutboxRetry()') !== -1,
            'finish сам планирует ретрай');
        assertTrue(zone.indexOf('try {') !== -1,
            'вызов под защитой (не ломает промис-цепочку)');
    });
});

// ============================================================
// D. VM — сервер FlowmeterArchive.gs (мок-лист + мок замка)
// ============================================================
function sheetMock(rows, opts) {
    const o = opts || {};
    const calls = { appendRow: 0, withLock: 0, sleep: 0 };
    const sheet = {
        getLastRow: function () { return rows.length + 1; },
        appendRow: function (arr) {
            calls.appendRow++;
            if (o.appendRowFail === calls.appendRow) throw new Error('Quota exceeded');
            rows.push(arr.slice());
        },
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
                }
            };
        }
    };
    return { sheet, calls, rows };
}

function archiveVM(rows, opts) {
    const o = opts || {};
    const mock = sheetMock(rows, o);
    const lockFailTimes = o.lockFailTimes || 0;   // сколько ПЕРВЫХ захватов замка падают
    const ctx = {
        Date: Date, Math: Math,
        parseInt: parseInt, parseFloat: parseFloat, String: String,
        Logger: { log: function (m) { (ctx.__logs = ctx.__logs || []).push(String(m)); } },
        Utilities: { sleep: function () { mock.calls.sleep++; } },
        Flowmeter: {
            _clientToDateObj: function (val) {
                if (!val) return null;
                const m = String(val).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                return m ? new Date(+m[3], +m[1] - 1, +m[2]) : null;
            }
        },
        Utils: {
            withLock: function (fn, timeoutMs) {
                mock.calls.withLock++;
                mock.calls.lastTimeout = timeoutMs;
                if (mock.calls.withLock <= lockFailTimes) {
                    throw new Error('server_busy: попробуйте ещё раз через несколько секунд');
                }
                return fn();
            }
        }
    };
    vm.createContext(ctx);
    const obj = vm.runInContext('(function(){' + ARCHIVE_GS + '; return FlowmeterArchive;})()', ctx);
    obj._getSheet = function () { return o.noSheet ? null : mock.sheet; };
    return { obj, mock, ctx };
}

describe('Task 376 — VM сервер: ретраи appendToArchive', () => {

    test('замок занят ОДИН раз (очередь) → вторая попытка дописывает строку', () => {
        const rows = [];
        const a = archiveVM(rows, { lockFailTimes: 1 });
        let threw = false;
        try {
            a.obj.appendToArchive(12, 'Хозрасчёт №12', 100, 150, '9/8/2026', '9/9/2026',
                null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        } catch (e) { threw = true; }
        assertFalse(threw, 'транзиент очереди поглощён ретраем');
        assertEqual(rows.length, 1, 'строка архива дописана (сценарий №12 закрыт)');
        assertEqual(a.mock.calls.withLock, 2, 'замок брался дважды');
        assertEqual(a.mock.calls.sleep, 1, 'пауза 1 c между попытками');
        assertEqual(a.mock.calls.lastTimeout, 4000, 'вторая попытка — таймаут 4 c');
    });

    test('замок занят ВСЕГДА → переброс после 3 попыток (не глотается)', () => {
        const rows = [];
        const a = archiveVM(rows, { lockFailTimes: 99 });
        let msg = '';
        try {
            a.obj.appendToArchive(12, 'Х', 1, 2, '9/8/2026', '9/9/2026',
                null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        } catch (e) { msg = String(e.message); }
        assertTrue(msg.indexOf('server_busy') !== -1,
            'исключение переброшено вызывающему (updateReading ответит честно)');
        assertEqual(rows.length, 0, 'строка не потеряна молча');
        assertEqual(a.mock.calls.withLock, 3, 'ровно 3 попытки: 10 c + 4 c + 4 c');
        assertEqual(a.mock.calls.sleep, 2, 'паузы между тремя попытками');
        assertTrue(a.ctx.__logs.some(l => l.indexOf('1/3') !== -1) &&
                   a.ctx.__logs.some(l => l.indexOf('2/3') !== -1) &&
                   a.ctx.__logs.some(l => l.indexOf('3/3') !== -1),
            'каждая неудача залогирована с номером попытки');
    });

    test('appendRow падает один раз (квота) → ретрай дописывает', () => {
        const rows = [];
        const a = archiveVM(rows, { appendRowFail: 1 });
        let threw = false;
        try {
            a.obj.appendToArchive(3, 'Х', 1, 2, '9/8/2026', '9/9/2026',
                null, null, 'т', 'Еженедельно', 'Админ', 'И', '', '', 'сутки');
        } catch (e) { threw = true; }
        assertFalse(threw, 'квотная ошибка поглощена ретраем');
        assertEqual(rows.length, 1, 'строка дописана со второй попытки');
        assertEqual(a.mock.calls.appendRow, 2, 'appendRow вызывался дважды');
    });

    test('дубль (правила Task 366/375) — НЕ ошибка, замок один на вызов', () => {
        const rows = [];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 100, 150, '9/8/2026', '9/9/2026',
            null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        a.obj.appendToArchive(2, 'Х', 100, 150, '9/8/2026', '9/9/2026',
            null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows.length, 1, 'повтор доставки строки не создал');
        assertEqual(a.mock.calls.withLock, 2, 'по одному замку на вызов (без ретраев)');
    });

    test('листа архива нет — тихий пропуск ( прежнее поведение)', () => {
        const a = archiveVM([], { noSheet: true });
        let threw = false;
        try {
            a.obj.appendToArchive(2, 'Х', 1, 2, '9/8/2026', '9/9/2026',
                null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        } catch (e) { threw = true; }
        assertFalse(threw, 'отсутствие листа — не ошибка ввода (конфигурация)');
    });
});

// ============================================================
// E. VM — сервер Flowmeter.gs updateReading
// ============================================================
function flowmeterVM(opts) {
    const o = opts || {};
    const cells = {};                        // 'row,col' -> value (meters)
    const calls = { append: 0, audit: 0 };
    const metersSheet = {
        getLastRow: function () { return 13; },
        getRange: function (row, col) {
            return {
                getValue: function () { return cells[row + ',' + col] || ''; },
                setValue: function (v) { cells[row + ',' + col] = v; }
            };
        }
    };
    const FlowmeterArchive = {
        appendToArchive: function () {
            calls.append++;
            if (o.archiveFail) throw new Error('server_busy: попробуйте ещё раз');
            return true;
        },
        updateLatestReading: function () { return false; },
        updateLatestComment: function () { return false; },
        getRecentAllMeters: function () { return []; }
    };
    const ctx = {
        Date: Date, Math: Math,
        parseInt: parseInt, parseFloat: parseFloat, String: String,
        Logger: { log: function (m) { (ctx.__logs = ctx.__logs || []).push(String(m)); } },
        SpreadsheetApp: {
            openById: function () {
                return {
                    getSheetByName: function (name) {
                        return name === 'hozraschet_meters' ? metersSheet : null;
                    }
                };
            }
        },
        Utils: {
            findSessionByToken: function () { return { user_id: 1 }; },
            findUserById: function () { return { email: 'a@b.c', role: 'Админ', name: 'А' }; },
            audit: function () { calls.audit++; }
        },
        ValidationRules: {
            getRulesForMeter: function () { return null; },
            compute: function () { return { hardBlock: false, detail: '' }; },
            WRONG_METER_PARAMS: { LOOKBACK_DAYS: 7 }
        },
        FlowmeterArchive: FlowmeterArchive
    };
    vm.createContext(ctx);
    const obj = vm.runInContext('(function(){' + FLOWMETER_GS + '; return Flowmeter;})()', ctx);
    return { obj, cells, calls, ctx };
}

describe('Task 376 — VM сервер: updateReading (meters vs архив)', () => {

    test('архив падает → ok:false archive_write_failed ПРИ записанном meters', () => {
        const f = flowmeterVM({ archiveFail: true });
        const res = f.obj.updateReading({
            token: 'tok', id: 12, prev: 100, curr: 150,
            datePrev: '9/8/2026', dateCurr: '9/9/2026', temp: null, isEdit: false
        });
        assertFalse(res.ok, 'честный отказ (не ok:true с потерянным архивом)');
        assertEqual(res.error, 'archive_write_failed', 'стабильный код ошибки');
        assertTrue(String(res.message).indexOf('повторно') !== -1,
            'message про автоматический повтор');
        // meters-ячейки УЖЕ записаны (id=12 → строка 13): F=6 prev, G=7 curr,
        // M=13 email, N=14 timestamp — сценарий заявки: «в meters записались»
        assertEqual(f.cells['13,6'], 100, 'meters F (prev) записан');
        assertEqual(f.cells['13,7'], 150, 'meters G (curr) записан');
        assertEqual(f.cells['13,13'], 'a@b.c', 'meters M (кто внёс) записан');
        assertTrue(f.cells['13,14'] instanceof Date, 'meters N (timestamp) записан');
        assertEqual(f.calls.append, 1, 'appendToArchive вызывался (упал)');
    });

    test('архив ок → ok:true, строка архива создана', () => {
        const f = flowmeterVM({});
        const res = f.obj.updateReading({
            token: 'tok', id: 12, prev: 100, curr: 150,
            datePrev: '9/8/2026', dateCurr: '9/9/2026', temp: null, isEdit: false
        });
        assertTrue(res.ok, 'обычный ввод успешен');
        assertEqual(f.calls.append, 1, 'строка архива записана');
        assertEqual(f.cells['13,7'], 150, 'meters обновлён');
    });

    test('_writePeriodEntry: архив падает → archive_write_failed, meters не тронут', () => {
        const f = flowmeterVM({ archiveFail: true });
        const before = JSON.stringify(f.cells);
        const res = f.obj.updateReading({
            token: 'tok', id: 1, prev: 0, curr: 500,
            datePrev: '8/1/2026', dateCurr: '8/31/2026',
            temp: null, entryType: 'месяц', isEdit: false
        });
        assertFalse(res.ok, 'периодическая запись без архива — неуспех');
        assertEqual(res.error, 'archive_write_failed',
            'стабильный код (клиент оставит в outbox и доставит повторно)');
        assertEqual(JSON.stringify(f.cells), before,
            'meters-строка периодической записью не тронута (Task 286 цел)');
    });
});

// ============================================================
// F. VM — клиент: дедуп по архиву + повторная доставка
// ============================================================
function mockStorage() {
    const store = {};
    return {
        getItem: function (k) { return (k in store) ? store[k] : null; },
        setItem: function (k, v) { store[k] = String(v); },
        removeItem: function (k) { delete store[k]; }
    };
}

function flushMixin(apiRoutes) {
    const names = ['_outboxLoad', '_outboxSave', '_outboxAdd', '_outboxRemove',
                   '_outboxUpdate', '_outboxCount', '_outboxIsPermanentError',
                   '_sendOutboxEntry', '_flushOutbox', '_reshowAnomalyModal',
                   '_outboxFlushBeacons', '_outboxCollapseDuplicates'];
    const parts = names.map(n => extractMethod(INDEX_SRC, n)).filter(Boolean);
    if (parts.length !== names.length) return null;
    const toasts = [];
    const calls = [];
    const ctx = {
        localStorage: mockStorage(),
        JSON, Math, Date, console, Object, Promise,
        document: { getElementById: () => null, visibilityState: 'visible' },
        KipToast: { show: function (t) { toasts.push(String(t)); } },
        KipAuth: { getToken: () => 'tok', sendBeacon: () => true }
    };
    vm.createContext(ctx);
    vm.runInContext('var M = { _OUTBOX_KEY: ' + JSON.stringify('kip8_flow_outbox_v1') +
                    ', ' + parts.join(',') + ' };', ctx);
    ctx.M._api = function (action, payload) {
        calls.push({ action: action, payload: payload });
        const h = apiRoutes[action];
        if (!h) return Promise.reject({ _kind: 'SERVER', message: 'Unknown action: ' + action });
        return h(payload);
    };
    ctx.M._METERS = [];
    ctx.M._showAnomalyModal = function () {};
    ctx.M.__toasts = toasts;
    ctx.M.__calls = calls;
    ctx.M.__sched = 0;
    ctx.M._scheduleOutboxRetry = function () { ctx.M.__sched++; };
    return ctx.M;
}

describe('Task 376 — VM клиент: дедуп day подтверждается архивом', () => {

    test('ДЫРА №12: meters совпал, архива НЕТ → запись отправляется повторно', async () => {
        // Серверное состояние после старого бага: meters содержит новые
        // показания, но строка архива потеряна
        const M = flushMixin({
            'flowmeter.list': () => Promise.resolve({
                meters: [{ id: 12, dateCurr: '9/9/2026', curr: 150 }]
            }),
            'flowmeter.archive': () => Promise.resolve({ records: [] }),
            'flowmeter.updateReading': () => Promise.resolve({})
        });
        M._outboxAdd({
            cid: 'hole', kind: 'day', state: 'retry',
            payload: { id: 12, prev: 100, curr: 150, dateCurr: '9/9/2026', isEdit: false }
        });
        const n = await M._flushOutbox('init');
        assertEqual(n, 1, 'запись доставлена повторно (дыра закрыта)');
        assertEqual(M._outboxCount(), 0, 'после подтверждённой доставки журнал пуст');
        const upd = M.__calls.filter(c => c.action === 'flowmeter.updateReading');
        assertEqual(upd.length, 1, 'updateReading вызван (meters идемпотентно перезаписан)');
        const arch = M.__calls.filter(c => c.action === 'flowmeter.archive');
        assertEqual(arch.length, 1, 'дедуп сверился с архивом перед отправкой');
    });

    test('meters совпал И архив содержит строку → повтор НЕ отправляется', async () => {
        const M = flushMixin({
            'flowmeter.list': () => Promise.resolve({
                meters: [{ id: 2, dateCurr: '9/9/2026', curr: 95 }]
            }),
            'flowmeter.archive': () => Promise.resolve({
                records: [{ entryType: 'сутки', dateCurr: '9/9/2026', curr: 95 }]
            }),
            'flowmeter.updateReading': () => Promise.resolve({})
        });
        M._outboxAdd({
            cid: 'ok', kind: 'day', state: 'retry',
            payload: { id: 2, curr: 95, dateCurr: '9/9/2026', isEdit: false }
        });
        const n = await M._flushOutbox('init');
        assertEqual(n, 0, 'доставлено ранее — дубль не создаётся');
        assertEqual(M._outboxCount(), 0, 'запись вычищена как доставленная');
        const upd = M.__calls.filter(c => c.action === 'flowmeter.updateReading');
        assertEqual(upd.length, 0, 'сервер не дёргается повторно');
    });

    test('архивная строка с ДРУГИМ curr — не подтверждение (доставка идёт)', async () => {
        const M = flushMixin({
            'flowmeter.list': () => Promise.resolve({
                meters: [{ id: 2, dateCurr: '9/9/2026', curr: 95 }]
            }),
            'flowmeter.archive': () => Promise.resolve({
                records: [{ entryType: 'сутки', dateCurr: '9/9/2026', curr: 90 }]
            }),
            'flowmeter.updateReading': () => Promise.resolve({})
        });
        M._outboxAdd({
            cid: 'diff', kind: 'day', state: 'retry',
            payload: { id: 2, curr: 95, dateCurr: '9/9/2026', isEdit: false }
        });
        const n = await M._flushOutbox('init');
        assertEqual(n, 1, 'строка с другим curr не считается подтверждением');
        assertEqual(M._outboxCount(), 0, 'после фактической доставки пусто');
    });

    test('period-запись в day-очереди: другой entryType — не подтверждение', async () => {
        // страховка: day-дедуп подтверждает только 'сутки'
        const M = flushMixin({
            'flowmeter.list': () => Promise.resolve({
                meters: [{ id: 1, dateCurr: '8/31/2026', curr: 500 }]
            }),
            'flowmeter.archive': () => Promise.resolve({
                records: [{ entryType: 'месяц', dateCurr: '8/31/2026', curr: 500 }]
            }),
            'flowmeter.updateReading': () => Promise.resolve({})
        });
        M._outboxAdd({
            cid: 'daym', kind: 'day', state: 'retry',
            payload: { id: 1, prev: 0, curr: 500, dateCurr: '8/31/2026', isEdit: false }
        });
        const n = await M._flushOutbox('init');
        assertEqual(n, 1, 'месячная строка не подтверждает суточную запись');
    });
});

describe('Task 376 — VM клиент: обработка archive_write_failed', () => {

    test('_outboxIsPermanentError: archive_write_failed → false (ретрай)', () => {
        const names = ['_outboxIsPermanentError'];
        const parts = names.map(n => extractMethod(INDEX_SRC, n)).join(',');
        const ctx = { console, String };
        vm.createContext(ctx);
        vm.runInContext('var M = { ' + parts + ' };', ctx);
        assertFalse(ctx.M._outboxIsPermanentError(
            { _kind: 'SERVER', message: 'archive_write_failed' }),
            'не окончательный отказ');
        assertTrue(ctx.M._outboxIsPermanentError(
            { _kind: 'SERVER', message: 'edit_window_expired' }),
            'окно правки — по-прежнему окончательный');
    });

    test('_sendUpdateReading: запись в outbox добавлена до проверки', async () => {
        // тот же сценарий, но через публичный _outboxAdd (порядок как в submitInput)
        const names = ['_outboxLoad', '_outboxSave', '_outboxAdd', '_outboxRemove',
                       '_outboxUpdate', '_outboxCount', '_outboxIsPermanentError',
                       '_scheduleOutboxRetry', '_sendUpdateReading'];
        const parts = names.map(n => extractMethod(INDEX_SRC, n)).filter(Boolean).join(',');
        const toasts = [];
        const ctx = {
            localStorage: mockStorage(), JSON, Math, Date, console, Object, Promise,
            setTimeout: function (fn) { fn(); },
            KipToast: { show: function (t) { toasts.push(String(t)); } }
        };
        vm.createContext(ctx);
        vm.runInContext('var M = { _OUTBOX_KEY: ' + JSON.stringify('kip8_flow_outbox_v1') +
                        ', ' + parts + ' };', ctx);
        ctx.M.__sched = 0;
        ctx.M._scheduleOutboxRetry = function () { ctx.M.__sched++; };
        ctx.M.__loads = 0;
        ctx.M.load = function () { ctx.M.__loads++; };
        ctx.M._api = function () {
            return Promise.reject({ _kind: 'SERVER', message: 'archive_write_failed' });
        };
        ctx.M._outboxAdd({
            cid: 'awf2', kind: 'day', state: 'pending',
            payload: { id: 12, prev: 100, curr: 150, dateCurr: '9/9/2026', isEdit: false }
        });
        await ctx.M._sendUpdateReading(
            { id: 12, prev: 100, curr: 150, dateCurr: '9/9/2026' }, false, 'awf2');
        assertEqual(ctx.M._outboxCount(), 1, 'запись в outbox (ждёт повторной доставки)');
        assertEqual(ctx.M._outboxLoad()[0].state, 'retry', 'состояние retry');
        assertTrue(ctx.M.__sched >= 1, 'ретрай запланирован');
    });

    test('flush с NETWORK-сбоем планирует ретрай сам (finish)', async () => {
        const M = flushMixin({
            'flowmeter.list': () => Promise.resolve({ meters: [] }),
            'flowmeter.updateReading': () =>
                Promise.reject({ _kind: 'NETWORK', message: 'NETWORK_ERROR' })
        });
        M._outboxAdd({
            cid: 'net', kind: 'day', state: 'retry',
            payload: { id: 2, curr: 95, dateCurr: '9/9/2026', isEdit: false }
        });
        await M._flushOutbox('retry');
        assertEqual(M._outboxCount(), 1, 'запись осталась (сеть)');
        assertEqual(M.__sched, 1,
            'finish сам запланировал ретрай-таймер (раньше ждал только online/visible)');
    });
});

// ============================================================
// G. SW
// ============================================================
describe('Task 376 — SW', () => {
    test('SW поднят до v605 (guard v606)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v755'") !== -1,
            'CACHE_VERSION = kipia-test-v755');
        assertTrue(SW_SRC.indexOf('kipia-test-v756') === -1,
            'guard-версии v606 в sw.js нет');
    });
});
