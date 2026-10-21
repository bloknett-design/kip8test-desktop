// tests/test-task366.js
// Task 366: расходомеры — 2 заявки пользователя:
//   1) баннер недоставленных показаний: «замени на более информативное
//      и просто читаемое сообщение и без иконки» — текст с НОМЕРАМИ
//      расходомеров (№2, №4; у одного несколько записей — «№2 ×2»),
//      грамматика ед./мн., иконка ⟳ убрана.
//      Task 367 (заявка «упростим ещё»): баннер убран ВООБЩЕ — вместо
//      него жёлто-оранжевый цвет ЗНАЧЕНИЙ карточек
//      (.flow-summary-val-pending в renderList, приоритет над красным);
//   2) «при однократном вводе значения расхода… строка в таблице
//      hozraschet_archive иногда дублируется (иногда один раз,
//      иногда несколько раз подряд)» — сервер (FlowmeterArchive.gs):
//      appendToArchive под Utils.withLock (атомарность «прочитал
//      хвост → дописал», Task 348) + дедуп по ключу meterId+prev+
//      curr+dateCurr+entryType в последних 50 строках; повторная
//      доставка того же payload (ретрай outbox / beacon рядом с
//      fetch / два окна приложения) строку НЕ создаёт. Клиентский
//      довесок: server_busy (таймаут замка) — повторяемая ошибка,
//      запись outbox не удаляется.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC: баннер удалён полностью (Task 367) — нет класса/CSS/
//      хелпера; server_busy повторяем; сервер — withLock вокруг дедупа+
//      appendRow, хелпер без вложенного замка, ключи A/C/D/G/R,
//      окно 50 строк, fallback «сбой проверки = не дубль»;
//      Flowmeter.gs вызывающие не менялись.
//   B. VM: _outboxIsPermanentError (server_busy повторяем, прежняя
//      классификация не сломана).
//   C. VM сервер: дедуп на мок-листе — повтор payload не дописывает
//      строку; расхождения ключа (curr/date/entryType/prev/метро)
//      дописывают; дедуп сквозь чужие строки; пустой лист; сбой
//      getLastRow → запись всё равно идёт; server_busy из withLock
//      пробрасывается (вызывающий решает); замок вызывается ровно
//      один раз на запись; окно 50 строк.
//   D. SW v595 (guard v596).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const ARCHIVE_GS = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'FlowmeterArchive.gs'), 'utf8');
const FLOWMETER_GS = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'Flowmeter.gs'), 'utf8');

// ============================================================
// Извлечение метода из index.html (балансировка скобок)
// ============================================================
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
// A. SRC — клиент
// ============================================================
describe('Task 366/367 — SRC: баннер удалён (заявка «упростим ещё»)', () => {

    test('Иконка убрана: нет .flow-outbox-ico и символа ⟳ в рендере', () => {
        assertTrue(INDEX_SRC.indexOf('.flow-outbox-ico') === -1,
            'CSS-правило иконки удалено');
        const rl = INDEX_SRC.indexOf('renderList: function');
        const zone = INDEX_SRC.slice(rl, rl + 8000);
        assertTrue(zone.indexOf('⟳') === -1, 'символ ⟳ не рендерится');
        assertTrue(zone.indexOf('flow-outbox-ico') === -1, 'класс иконки не используется');
    });

    test('Старый текст «Показаний ждут отправки: N» из рендера убран', () => {
        assertTrue(INDEX_SRC.indexOf("'Показаний ждут отправки'") === -1 &&
                   INDEX_SRC.indexOf("'Показаний ждут отправки: '") === -1,
            'рендер не содержит старый текст');
    });

    test('Task 367: баннера нет — ни класса, ни CSS, ни хелпера', () => {
        assertTrue(INDEX_SRC.indexOf('flow-outbox-banner') === -1,
            'класс/блок баннера удалён из рендера');
        assertTrue(INDEX_SRC.indexOf('.flow-outbox-banner {') === -1,
            'CSS-правило баннера удалено');
        assertTrue(INDEX_SRC.indexOf('_outboxBannerText: function') === -1,
            'хелпер _outboxBannerText удалён');
        assertTrue(INDEX_SRC.indexOf('this._outboxBannerText(') === -1,
            'вызовов хелпера не осталось');
        assertTrue(INDEX_SRC.indexOf('не отправлены — отправятся на сервер') === -1,
            'текст баннера не рендерится');
    });

    test('Task 367: вместо баннера — жёлто-оранжевые значения', () => {
        const rl = extractMethod(INDEX_SRC, 'renderList');
        assertTrue(rl.indexOf('pendingIds') !== -1,
            'renderList собирает номера недоставленных расходомеров');
        assertTrue(rl.indexOf('this._outboxLoad()') !== -1,
            'записи outbox читаются');
        assertTrue(rl.indexOf('flow-summary-val-pending') !== -1,
            'класс pending присваивается значению');
        assertTrue(INDEX_SRC.indexOf('.flow-summary-val.flow-summary-val-pending {') !== -1,
            'CSS-правило pending есть');
    });

    test('server_busy — повторяемая ошибка outbox (замок архива)', () => {
        const m = extractMethod(INDEX_SRC, '_outboxIsPermanentError');
        assertTrue(m.indexOf("if (/server_busy/i.test(msg)) return false;") !== -1,
            'server_busy не удаляет запись из outbox');
    });
});

// ============================================================
// A. SRC — сервер (FlowmeterArchive.gs)
// ============================================================
describe('Task 366 — SRC: сервер, дедуп архива под замком', () => {

    test('appendToArchive: запись под Utils.withLock', () => {
        const i = ARCHIVE_GS.indexOf('appendToArchive: function');
        const j = ARCHIVE_GS.indexOf('},', i);
        const fn = ARCHIVE_GS.slice(i, j);
        assertTrue(fn.indexOf('Utils.withLock(function() {') !== -1,
            'дедуп+appendRow выполняются под замком (Task 348)');
        assertTrue(fn.indexOf('self._isDuplicateArchiveRow(sheet, meterId, prev, curr, dateCurr, entryType)') !== -1,
            'проверка дубля внутри замка');
        assertTrue(fn.indexOf('sheet.appendRow([') !== -1, 'appendRow внутри замка');
        assertTrue(fn.indexOf('var self = this;') !== -1, 'self для замыкания');
        // порядок: замок ДО проверки и ДО записи
        const li = fn.indexOf('Utils.withLock(function() {');
        const di = fn.indexOf('self._isDuplicateArchiveRow(');
        const ai = fn.indexOf('sheet.appendRow([');
        assertTrue(li !== -1 && di > li && ai > li, 'замок охватывает проверку и запись');
    });

    test('Хелпер _isDuplicateArchiveRow: ключ A/C/D/G/R, окно 50 строк', () => {
        const i = ARCHIVE_GS.indexOf('_isDuplicateArchiveRow: function');
        const j = ARCHIVE_GS.indexOf('_normEntryType', i) === -1
            ? ARCHIVE_GS.indexOf('appendToArchive: function')
            : ARCHIVE_GS.indexOf('},', i);
        const fn = ARCHIVE_GS.slice(i, j);
        assertTrue(fn.indexOf('row[0]') !== -1, 'A: meterId');
        assertTrue(fn.indexOf('row[2]') !== -1, 'C: prev');
        assertTrue(fn.indexOf('row[3]') !== -1, 'D: curr');
        assertTrue(fn.indexOf('row[6]') !== -1, 'G: dateCurr');
        assertTrue(fn.indexOf('row[17]') !== -1, 'R: entryType');
        assertTrue(fn.indexOf('Math.min(50,') !== -1, 'окно сканирования — 50 строк');
        assertTrue(fn.indexOf('return false') !== -1, 'нет совпадения — не дубль');
    });

    test('Хелпер НЕ берёт замок сам (реентерабельность запрещена)', () => {
        const i = ARCHIVE_GS.indexOf('_isDuplicateArchiveRow: function');
        const j = ARCHIVE_GS.indexOf('appendToArchive: function');
        const fn = ARCHIVE_GS.slice(i, j);
        assertTrue(fn.indexOf('withLock') === -1, 'внутри хелпера нет withLock');
    });

    test('Сбой проверки = «не дубль» (лучше дубль, чем дыра)', () => {
        const i = ARCHIVE_GS.indexOf('_isDuplicateArchiveRow: function');
        const j = ARCHIVE_GS.indexOf('appendToArchive: function');
        const fn = ARCHIVE_GS.slice(i, j);
        const ci = fn.indexOf('catch (e)');
        assertTrue(ci !== -1, 'try/catch есть');
        assertTrue(fn.indexOf('append anyway') !== -1, 'комментарий политики');
        const tail = fn.slice(ci);
        assertTrue(tail.indexOf('return false') !== -1, 'ошибка проверки → false → запись');
    });

    test('_normEntryType: legacy-пусто = сутки', () => {
        const i = ARCHIVE_GS.indexOf('_normEntryType: function');
        const fn = ARCHIVE_GS.slice(i, ARCHIVE_GS.indexOf('},', i) + 2);
        assertTrue(fn.indexOf("'' || s === 'сутки'") !== -1 ||
                   fn.indexOf("s === '' || s === 'сутки'") !== -1,
            'пусто и сутки — один ключ');
    });

    test('Дубль логируется понятной строкой', () => {
        assertTrue(ARCHIVE_GS.indexOf("Archive (Task 366): дубль пропущен") !== -1,
            'лог пропуска дубля');
    });

    test('Flowmeter.gs: вызывающие appendToArchive не менялись', () => {
        assertEqual(FLOWMETER_GS.split('FlowmeterArchive.appendToArchive(').length - 1, 2,
            '2 вызова (суточный ввод + период)');
        assertTrue(FLOWMETER_GS.indexOf('withLock') === -1,
            'замок только в appendToArchive (вне Flowmeter.gs)');
    });

    test('Utils.withLock в Utils.gs не менялся (Task 348)', () => {
        const utils = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'Utils.gs'), 'utf8');
        assertTrue(utils.indexOf('withLock: function(fn, timeoutMs)') !== -1,
            'сигнатура прежняя');
    });
});

// ============================================================
// B. VM — клиент: _outboxIsPermanentError
// ============================================================
let PM = null;
try {
    const ctx = {};
    vm.createContext(ctx);
    const parts = ['_outboxIsPermanentError']
        .map(n => extractMethod(INDEX_SRC, n)).filter(Boolean);
    if (parts.length === 1) {
        vm.runInContext('var M = { ' + parts.join(',') + ' };', ctx);
        PM = ctx.M;
    }
} catch (e) { /* ниже упадут с причиной */ }

describe('Task 366 — VM: server_busy повторяем (запись не теряется)', () => {

    test('Метод извлечён', () => {
        assertTrue(PM !== null && typeof PM._outboxIsPermanentError === 'function',
            '_outboxIsPermanentError из index.html');
    });

    test('server_busy (замок архива занят) — НЕ окончательная ошибка', () => {
        assertFalse(PM._outboxIsPermanentError({ _kind: 'SERVER', message: 'server_busy: попробуйте ещё раз через несколько секунд' }),
            'ретрай позже');
    });

    test('Прежняя классификация не сломана', () => {
        assertTrue(PM._outboxIsPermanentError({ _kind: 'SERVER', message: 'edit_window_expired' }),
            'окно правки — окончательно');
        assertFalse(PM._outboxIsPermanentError({ _kind: 'NETWORK', message: 'fetch failed' }),
            'сеть — повторяемо');
        assertFalse(PM._outboxIsPermanentError({ _kind: 'SERVER', message: 'session_expired' }),
            'сессия — лечится входом');
        assertFalse(PM._outboxIsPermanentError({ _kind: 'SERVER', message: 'Unknown action: foo' }),
            'старый сервер — лечится апгрейдом');
    });
});

// ============================================================
// C. VM — сервер: дедуп appendToArchive на мок-листе
// ============================================================
// Мок листа: rows[i] = строка ДАННЫХ (индекс 0 = строка 2 листа).
function sheetMock(rows) {
    const calls = { appendRow: 0, withLock: 0, dedupFalse: 0 };
    const sheet = {
        getLastRow: function () { return rows.length + 1; },
        appendRow: function (arr) { calls.appendRow++; rows.push(arr.slice()); },
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
    const mock = sheetMock(rows);
    const lockBehavior = o.lockBehavior || 'pass';
    const ctx = {
        Date: Date, Math: Math,
        parseInt: parseInt, parseFloat: parseFloat, String: String,
        Logger: { log: function (m) { (ctx.__logs = ctx.__logs || []).push(String(m)); } },
        Utilities: { sleep: function () { /* Task 376: пауза между ретраями */ } },
        Flowmeter: {
            _clientToDateObj: function (val) {
                if (!val) return null;
                const m = String(val).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                return m ? new Date(+m[3], +m[1] - 1, +m[2]) : null;
            }
        },
        Utils: {
            withLock: function (fn) {
                mock.calls.withLock++;
                if (lockBehavior === 'busy') throw new Error('server_busy: попробуйте ещё раз через несколько секунд');
                return fn();
            }
        }
    };
    vm.createContext(ctx);
    const obj = vm.runInContext('(function(){' + ARCHIVE_GS + '; return FlowmeterArchive;})()', ctx);
    obj._getSheet = function () { return mock.sheet; };
    if (o.throwingSheet) obj._getSheet = o.throwingSheet;
    return { obj, mock, ctx };
}

// Строка-«уже записанное показание» №2 за 9/9 (G — Date).
function archRow(id, prev, curr, day, entryType) {
    const row = new Array(18).fill('');
    row[0] = id;
    row[2] = prev;
    row[3] = curr;
    row[6] = day;                    // G: dateCurr (Date)
    row[14] = new Date();            // O: timestamp
    row[17] = entryType || '';       // R
    return row;
}

const D = (y, m, d) => new Date(y, m - 1, d);

describe('Task 366 — VM сервер: повтор не дописывает строку', () => {

    test('Первая запись дописывается', () => {
        const rows = [];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Хозрасчёт №2', 383291, 383400, '9/8/2026', '9/9/2026', null, null, 'м³', 'Ежедневно', 'Админ', 'Иванов', '', '', 'сутки');
        assertEqual(rows.length, 1, 'строка добавлена');
        assertEqual(rows[0][0], 2, 'A: meterId');
        assertEqual(mock0(a).appendRow, 1, 'appendRow вызван 1 раз');
    });

    function mock0(a) { return a.mock.calls; }

    test('Повтор ТОГО ЖЕ payload — дубль НЕ дописывается', () => {
        const rows = [];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Хозрасчёт №2', 383291, 383400, '9/8/2026', '9/9/2026', null, null, 'м³', 'Ежедневно', 'Админ', 'Иванов', '', '', 'сутки');
        a.obj.appendToArchive(2, 'Хозрасчёт №2', 383291, 383400, '9/8/2026', '9/9/2026', null, null, 'м³', 'Ежедневно', 'Админ', 'Петров', 'комм', 'JUMP_HIGH: x', 'сутки');
        assertEqual(rows.length, 1, 'вторая доставка строку НЕ создала');
        assertTrue(a.ctx.__logs.some(l => l.indexOf('дубль пропущен') !== -1),
            'дубль залогирован');
    });

    test('Замок вызывается ровно один раз на appendToArchive', () => {
        const rows = [];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 1, 2, '9/8/2026', '9/9/2026', null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        a.obj.appendToArchive(2, 'Х', 1, 2, '9/8/2026', '9/9/2026', null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(a.mock.calls.withLock, 2, 'по одному замку на вызов');
        assertEqual(a.mock.calls.appendRow, 1, 'записана только первая');
    });

    test('Дубль сквозь чужие строки между повтором и концом', () => {
        const rows = [
            archRow(2, 383291, 383400, D(2026, 9, 9), 'сутки'),
            archRow(9, 5, 7, D(2026, 9, 9), 'сутки'),
            archRow(3, 1, 2, D(2026, 9, 9), 'месяц')
        ];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Хозрасчёт №2', 383291, 383400, '9/8/2026', '9/9/2026', null, null, 'м³', 'Ежедневно', 'Админ', 'Иванов', '', '', 'сутки');
        assertEqual(rows.length, 3, 'дубль среди хвоста найден, строка не добавлена');
    });
});

describe('Task 366 — VM сервер: разные показания НЕ считаются дублем', () => {

    test('Другое curr — новая строка', () => {
        const rows = [archRow(2, 383291, 383400, D(2026, 9, 9), 'сутки')];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 383291, 383500, '9/8/2026', '9/9/2026', null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows.length, 2, 'новое значение расходится ключом D');
    });

    test('Другое prev — новая строка', () => {
        // Task 375: правило «окно 1 часа» считает свежий повтор значения
        // (другой prev, тот же curr+дата) дублем; исходный смысл теста —
        // «расхождение prev дописывает строку» — сохранён для записи
        // СТАРШЕ часа (вне окна правки). Свежий случай — в test-task375.
        const rows = [archRow(2, 383291, 383400, D(2026, 9, 9), 'сутки')];
        rows[0][14] = new Date(Date.now() - 2 * 60 * 60 * 1000);   // O: 2 ч назад
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 383400, 383400, '9/8/2026', '9/9/2026', null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows.length, 2, 'расхождение ключа C (запись старше 1 ч)');
    });

    test('Другая дата — новая строка', () => {
        const rows = [archRow(2, 383400, 383500, D(2026, 9, 9), 'сутки')];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 383400, 383500, '9/9/2026', '9/10/2026', null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows.length, 2, 'расхождение ключа G');
    });

    test('Другой entryType (месяц vs сутки) — новая строка', () => {
        const rows = [archRow(2, 0, 500, D(2026, 8, 31), 'сутки')];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 0, 500, '8/1/2026', '8/31/2026', null, null, 'т', 'Ежемесячно', 'Админ', 'И', '', '', 'месяц');
        assertEqual(rows.length, 2, 'расхождение ключа R');
    });

    test('Другой расходомер — новая строка', () => {
        const rows = [archRow(2, 383291, 383400, D(2026, 9, 9), 'сутки')];
        const a = archiveVM(rows);
        a.obj.appendToArchive(4, 'Х', 383291, 383400, '9/8/2026', '9/9/2026', null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows.length, 2, 'расхождение ключа A');
    });

    test('legacy-строка без R (сутки) vs новый ввод сутки — ключ совпадает', () => {
        const rows = [archRow(2, 383291, 383400, D(2026, 9, 9), '')];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 383291, 383400, '9/8/2026', '9/9/2026', null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows.length, 1, 'пусто в R трактуется как сутки — дубль распознан');
    });

    test('Дубль за пределами окна 50 строк — записывается (документированный предел)', () => {
        const rows = [archRow(2, 383291, 383400, D(2026, 9, 9), 'сутки')];  // оригинал №2
        for (let i = 0; i < 55; i++) {
            rows.push(archRow(9, i, i + 1, D(2026, 9, 9), 'сутки'));  // шум других поверх
        }
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 383291, 383400, '9/8/2026', '9/9/2026', null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows.length, 57, 'оригинал глубже 50 строк — дубль не найден, записан');
        a.obj.appendToArchive(2, 'Х', 383291, 383400, '9/8/2026', '9/9/2026', null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows.length, 57, 'следующий дубль уже в окне — пойман');
    });
});

describe('Task 366 — VM сервер: устойчивость', () => {

    test('Пустой лист — запись работает (lastRow < DATA_START_ROW)', () => {
        const rows = [];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 1, 2, '9/8/2026', '9/9/2026', null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows.length, 1, 'архив пуст → дедуп не мешает');
    });

    test('Сбой проверки (getLastRow падает) — запись всё равно идёт', () => {
        const rows = [];
        const a = archiveVM(rows);
        const boom = {
            getLastRow: function () { throw new Error('sheet glitch'); },
            appendRow: function (arr) { rows.push(arr.slice()); },
            getRange: function () { throw new Error('nope'); }
        };
        a.obj._getSheet = function () { return boom; };
        let threw = false;
        try {
            a.obj.appendToArchive(2, 'Х', 1, 2, '9/8/2026', '9/9/2026', null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        } catch (e) { threw = true; }
        assertFalse(threw, 'сбой проверки не пробрасывается');
        assertEqual(rows.length, 1, 'лучше редкий дубль, чем потерянная запись');
    });

    test('server_busy из withLock пробрасывается вызывающему', () => {
        const rows = [];
        const a = archiveVM(rows, { lockBehavior: 'busy' });
        let msg = '';
        try {
            a.obj.appendToArchive(2, 'Х', 1, 2, '9/8/2026', '9/9/2026', null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        } catch (e) { msg = String(e.message); }
        assertTrue(msg.indexOf('server_busy') !== -1,
            'клиентская сторона классифицирует как повторяемую (тест выше)');
        assertEqual(rows.length, 0, 'при таймауте замка строка не потеряна молча');
        // Task 376: ретраи — замок берётся 3 раза (10 c + 4 c + 4 c),
        // только после последней неудачи исключение уходит вызывающему
        assertEqual(a.mock.calls.withLock, 3,
            'три попытки перед перебросом (транзиент очереди поглощается)');
    });

    test('Неразборчивая дата — не дубль (запись идёт)', () => {
        const rows = [archRow(2, 383291, 383400, D(2026, 9, 9), 'сутки')];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 383291, 383400, 'хлам', 'не-дата', null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows.length, 2, 'дубль не подтвердить — записываем');
    });
});

// ============================================================
// D. SW
// ============================================================
describe('Task 366 — SW кэш', () => {

    test('SW: CACHE_VERSION = kipia-test-v754', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v754'") !== -1,
            'версия кэша поднята до v595');
    });

    test('SW: нет v594 (старая) и нет v596 (двойной бамп)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v594') === -1, 'старая версия не осталась');
        assertTrue(SW_SRC.indexOf('kipia-test-v755') === -1, 'двойного бампа не было');
    });
});
