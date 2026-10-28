// tests/test-task375.js
// Task 375 — две заявки пользователя:
//   1) Печать табеля: «столбец со списком кодов расположить справа от
//      столбца списка мероприятий на расстоянии 10px» — gap ряда
//      wsp-bottom 5mm → 10px (расположение кодов справа — Task 364,
//      менялось ТОЛЬКО расстояние).
//   2) Расходомеры хозрасчётные: «при внесении новых данных иногда они
//      автоматически дублируются, нужно сделать больше упор в сторону
//      исключения случайных автоматических дублирований новых записей
//      по разным причинам (в момент ввода данных и в первый час после
//      ввода данных, когда доступно редактирование)».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — печать: gap 10px в #wsPrintSheet .wsp-bottom; 5mm в правиле
//      больше нет; маркер Task 375 в комментарии.
//   B. SRC — клиентские анти-дубли:
//      №1 кулдаун «Сохранить» (2.5 c, _inputAcceptedAt, openInput
//         сбрасывает, флаг ставится при принятии в обеих ветках);
//      №2/№3 _isDuplicateReadingInput (meters + outbox, isEdit мимо);
//      №4 _outboxCollapseDuplicates вызывается из _flushOutbox ДО
//         серверных дедупов.
//   C. VM — клиент: _isDuplicateReadingInput (совпадение/расхождение
//      curr/date, isEdit, нормализация типов, outbox-запись);
//      _outboxCollapseDuplicates (двойной сдвиг prev свёрнут, разные
//      даты/значения сохранены, сутки vs месяц, порядок старейший
//      первым, _outboxRemove вызван).
//   D. VM — сервер (FlowmeterArchive.gs, мок-лист): правило «окно
//      1 часа» — свежая строка того же meterId+curr+dateCurr+
//      entryType с ДРУГИМ prev = дубль; старше часа — не дубль;
//      расхождения curr/date/entryType — не дубль; точный ключ
//      (правило 1 Task 366) работает при любом возрасте строки.
//   E. SW v604 (guard v605).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const ARCHIVE_GS = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'FlowmeterArchive.gs'), 'utf8');

// ============================================================
// Извлечение метода из index.html / .gs (балансировка скобок)
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

function cssRule(src, sel) {
    const i = src.indexOf(sel + ' {');
    if (i === -1) return '';
    const j = src.indexOf('}', i);
    return src.slice(i, j + 1);
}

// ============================================================
// A. SRC — печать: зазор 10px
// ============================================================
describe('Task 375 — SRC: печать табеля, коды справа на 10px', () => {

    test('CSS печать — зазор кодов снят (Task 433: вертикальная секция)', () => {
        // Task 433 (заявка: «расположение кодов в печати верни
        // обратно…»): зазор 10px Task 375 между столбиками и флоат
        // Task 432 СНЯТЫ — коды вернулись исходной строкой-абзацем
        // ПОД списком мероприятий (вертикальная секция), зазор
        // между секциями — margin-top 2.5mm
        const r = cssRule(INDEX_SRC, '#wsPrintSheet .wsp-bottom');
        assertTrue(r !== '', 'правило обёртки есть');
        assertTrue(r.indexOf('display: flow-root') === -1,
            'флоат-обёртка Task 432 снята');
        assertTrue(r.indexOf('gap: 5mm') === -1,
            'прежний 5mm убран из правила');
        // Task 442: блок кодов удалён — зазора между блоками и
        // самого ряда больше нет (зазор 10px Tasks 375/440 снят
        // вместе с правым блоком)
        assertTrue(r.indexOf('gap') === -1,
            'зазора между блоками нет — блока кодов больше нет (Task 442)');
        const leg = cssRule(INDEX_SRC, '#wsPrintSheet .wsp-legend');
        assertTrue(leg === '',
            'правила .wsp-legend нет (столбец кодов удалён, Task 442)');
        assertTrue(r.indexOf('margin-top: 2.5mm') !== -1,
            'отступ от таблицы на обёртке не тронут');
    });

    test('CSS-комментарий: маркер Task 375 у wsp-bottom', () => {
        const i = INDEX_SRC.indexOf('#wsPrintSheet .wsp-bottom');
        // Task 432: над правилом добавился комментарий нового ряда —
        // окно поиска расширено (1200 → 1800), исторические маркеры
        // Task 360/361/364/375/431 в слоистом комментарии выше — живы
        const zone = INDEX_SRC.slice(Math.max(0, i - 1800), i);
        assertTrue(zone.indexOf('Task 375') !== -1, 'комментарий дополнен Task 375');
        assertTrue(zone.indexOf('ровно 10px') !== -1, 'задокументировано «ровно 10px»');
    });

    test('«gap: 5mm» больше нигде в печати не встречается', () => {
        // единственное историческое упоминание 5mm — само правило,
        // оно заменено; проверяем полный print-блок (от @media print
        // до следующей секции CSS — Task 438: якорь .wsp-foot
        // удалён вместе со сноской)
        const z = INDEX_SRC.indexOf('@media print');
        const z2 = INDEX_SRC.indexOf('/* Task 317', z);
        const printCss = INDEX_SRC.slice(z, z2 !== -1 ? z2 : z + 20000);
        assertTrue(printCss.indexOf('gap: 5mm') === -1,
            'в print-блоке не осталось зазора 5mm');
    });
});

// ============================================================
// B. SRC — клиентские анти-дубли
// ============================================================
describe('Task 375 — SRC: анти-дубли ввода (клиент)', () => {

    test('№1: кулдаун повторного «Сохранить» в submitInput', () => {
        const m = extractMethod(INDEX_SRC, 'submitInput');
        assertTrue(m !== null, 'submitInput извлечён');
        assertTrue(m.indexOf('this._inputAcceptedAt &&') !== -1,
            'флаг кулдауна проверяется');
        assertTrue(m.indexOf('(Date.now() - this._inputAcceptedAt) < 2500') !== -1,
            'окно 2.5 c');
        // кулдаун — после валидации числа, до ветки «месяц»
        const cool = m.indexOf('(Date.now() - this._inputAcceptedAt) < 2500');
        const month = m.indexOf("this._inputEntryType === 'месяц'");
        assertTrue(cool !== -1 && month !== -1 && cool < month,
            'кулдаун срабатывает и для суточной, и для месячной ветки');
    });

    test('№1: флаг ставится при ПРИНЯТИИ ввода — до оптимистичного сдвига', () => {
        const m = extractMethod(INDEX_SRC, 'submitInput');
        const flag = m.indexOf('this._inputAcceptedAt = Date.now();');
        const opt = m.indexOf('// Оптимистичное обновление UI');
        assertTrue(flag !== -1 && opt !== -1 && flag < opt,
            'флаг установлен до optimistic-обновления');
        // после дубль-проверки
        const dup = m.indexOf('_isDuplicateReadingInput(id, num, dateStr, isEdit)');
        assertTrue(dup !== -1 && dup < flag, 'флаг — после дубль-проверки');
    });

    test('№1: openInput сбрасывает кулдаун', () => {
        const m = extractMethod(INDEX_SRC, 'openInput');
        assertTrue(m.indexOf('this._inputAcceptedAt = 0;') !== -1,
            'осознанное открытие формы снимает кулдаун');
    });

    test('№1: _submitPeriodEntry ставит флаг после проверок дат', () => {
        const m = extractMethod(INDEX_SRC, '_submitPeriodEntry');
        const flag = m.indexOf('this._inputAcceptedAt = Date.now();');
        const hard = m.indexOf('Дата конца периода раньше даты начала');
        assertTrue(flag !== -1, 'флаг в месячной ветке');
        assertTrue(hard !== -1 && hard < flag,
            'флаг ставится ПОСЛЕ hard-проверки дат (отказ кулдаун не запускает)');
        const outbox = m.indexOf('this._outboxAdd({');
        assertTrue(outbox !== -1 && flag < outbox, 'флаг — до write-ahead записи');
    });

    test('№2/№3: _isDuplicateReadingInput объявлен и вызывается из submitInput', () => {
        assertTrue(INDEX_SRC.indexOf('_isDuplicateReadingInput: function(') !== -1,
            'метод объявлен');
        const m = extractMethod(INDEX_SRC, 'submitInput');
        const call = m.indexOf('if (this._isDuplicateReadingInput(id, num, dateStr, isEdit)) {');
        assertTrue(call !== -1, 'вызов-блок есть');
        // блокирует ДО оптимистичного обновления и ДО closeInput в основном флоу
        const opt = m.indexOf('// Оптимистичное обновление UI');
        assertTrue(call < opt, 'дубль-проверка раньше оптимистичного сдвига');
        // тост объясняет, что делать
        const zone = m.slice(call, call + 700);
        assertTrue(zone.indexOf('уже введены за эту дату') !== -1,
            'тост: уже введены');
        assertTrue(zone.indexOf('Изменить показания') !== -1,
            'тост направляет к правке в окне 1 ч');
        assertTrue(zone.indexOf('return;') !== -1, 'отправка прервана');
    });

    test('№2/№3: ключ метода — id+curr+dateCurr, БЕЗ prev', () => {
        const m = extractMethod(INDEX_SRC, '_isDuplicateReadingInput');
        assertTrue(m.indexOf('if (isEdit) return false;') !== -1,
            'правка в окне 1 ч не блокируется');
        assertTrue(m.indexOf('parseFloat(meters[i].curr || 0)') !== -1,
            'сравнение curr с нормализацией типов');
        assertTrue(m.indexOf("meters[i].dateCurr || ''") !== -1, 'сравнение dateCurr');
        assertTrue(m.indexOf('this._outboxLoad()') !== -1, 'проверка очереди outbox');
        assertTrue(m.indexOf('prev') === -1,
            'prev НЕ в ключе — «двойной сдвиг» должен ловиться');
    });

    test('№4: _outboxCollapseDuplicates вызывается из _flushOutbox ДО серверных дедупов', () => {
        const m = extractMethod(INDEX_SRC, '_flushOutbox');
        const collapse = m.indexOf('this._outboxCollapseDuplicates(entries)');
        const srvDay = m.indexOf("'flowmeter.list'");
        const srvPeriod = m.indexOf("'flowmeter.archive'");
        assertTrue(collapse !== -1, 'свёртка в флаше');
        assertTrue(srvDay !== -1 && collapse < srvDay,
            'свёртка раньше серверного дедупа day');
        assertTrue(srvPeriod !== -1 && collapse < srvPeriod,
            'свёртка раньше серверного дедупа period');
    });

    test('№4: ключ свёртки — id|dateCurr|curr|entryType (без prev)', () => {
        const m = extractMethod(INDEX_SRC, '_outboxCollapseDuplicates');
        assertTrue(m !== null, 'метод объявлен');
        assertTrue(m.indexOf("String(pl.id) + '|' + String(pl.dateCurr || '')") !== -1,
            'ключ: id + dateCurr');
        assertTrue(m.indexOf('parseFloat(pl.curr || 0)') !== -1, 'ключ: curr');
        assertTrue(m.indexOf('String(pl.entryType || \'\')') !== -1, 'ключ: entryType');
        assertTrue(m.indexOf('this._outboxRemove(e.cid)') !== -1,
            'копии удаляются из журнала');
        assertTrue(m.indexOf('prev') === -1, 'prev не участвует');
    });
});

// ============================================================
// C. VM — клиент: _isDuplicateReadingInput / _outboxCollapseDuplicates
// ============================================================
function dupReadingVM(meters, outboxEntries) {
    const src = extractMethod(INDEX_SRC, '_isDuplicateReadingInput');
    if (!src) return null;
    const ctx = { String, parseFloat, Object };
    vm.createContext(ctx);
    vm.runInContext(
        'var M = { _METERS: ' + JSON.stringify(meters || []) + ',' +
        ' _outboxLoad: function() { return ' + JSON.stringify(outboxEntries || []) + '; }' +
        ', ' + src + ' };', ctx);
    return ctx.M;
}

describe('Task 375 — VM: _isDuplicateReadingInput', () => {

    test('те же curr+dateCurr в meters → дубль', () => {
        const M = dupReadingVM([{ id: 2, curr: 383400, dateCurr: '9/9/2026' }], []);
        assertTrue(M._isDuplicateReadingInput(2, 383400, '9/9/2026', false) === true,
            'повтор того же значения за ту же дату блокируется');
    });

    test('другое curr → не дубль (осознанная корректировка значения)', () => {
        const M = dupReadingVM([{ id: 2, curr: 383400, dateCurr: '9/9/2026' }], []);
        assertFalse(M._isDuplicateReadingInput(2, 383500, '9/9/2026', false),
            'новое значение проходит');
    });

    test('другая дата → не дубль', () => {
        const M = dupReadingVM([{ id: 2, curr: 383400, dateCurr: '9/9/2026' }], []);
        assertFalse(M._isDuplicateReadingInput(2, 383400, '9/10/2026', false),
            'новая дата проходит');
    });

    test('isEdit → никогда не блокируется', () => {
        const M = dupReadingVM([{ id: 2, curr: 383400, dateCurr: '9/9/2026' }],
            [{ cid: 'x', payload: { id: 2, curr: 383400, dateCurr: '9/9/2026' } }]);
        assertFalse(M._isDuplicateReadingInput(2, 383400, '9/9/2026', true),
            'правка в окне 1 ч идёт сервером на место (Task 359)');
    });

    test('строковые/числовые типы нормализуются («383400» vs 383400)', () => {
        const M = dupReadingVM([{ id: '2', curr: '383400', dateCurr: '9/9/2026' }], []);
        assertTrue(M._isDuplicateReadingInput(2, 383400, '9/9/2026', false) === true,
            'id строкой и curr строкой — совпадение распознано');
    });

    test('нет расходомера в meters → не дубль', () => {
        const M = dupReadingVM([{ id: 4, curr: 100, dateCurr: '9/9/2026' }], []);
        assertFalse(M._isDuplicateReadingInput(2, 100, '9/9/2026', false),
            'чужой расходомер не мешает');
    });

    test('копия ждёт доставки в outbox → дубль (второе окно/двойной клик)', () => {
        const M = dupReadingVM([{ id: 2, curr: 383291, dateCurr: '9/8/2026' }],
            [{ cid: 'a', kind: 'day', payload: { id: 2, curr: 383400, dateCurr: '9/9/2026' } }]);
        assertTrue(M._isDuplicateReadingInput(2, 383400, '9/9/2026', false) === true,
            'первая доставка ещё в очереди — вторая заблокирована');
    });

    test('в outbox ДРУГОЕ значение/дата → не дубль', () => {
        const M = dupReadingVM([{ id: 2, curr: 383291, dateCurr: '9/8/2026' }],
            [{ cid: 'a', payload: { id: 2, curr: 383500, dateCurr: '9/9/2026' } }]);
        assertFalse(M._isDuplicateReadingInput(2, 383400, '9/9/2026', false),
            'очередь с другим значением не блокирует');
    });

    test('битые записи outbox не роняют проверку', () => {
        const M = dupReadingVM([{ id: 2, curr: 383291, dateCurr: '9/8/2026' }],
            [null, { cid: 'b' }, { cid: 'c', payload: null }]);
        assertFalse(M._isDuplicateReadingInput(2, 383400, '9/9/2026', false),
            'null/без payload — не совпадение, не падение');
    });
});

describe('Task 375 — VM: _outboxCollapseDuplicates', () => {

    function collapseVM(entries) {
        const src = extractMethod(INDEX_SRC, '_outboxCollapseDuplicates');
        if (!src) return null;
        const ctx = { String, parseFloat, Object };
        vm.createContext(ctx);
        vm.runInContext(
            'var M = { removed: [],' +
            ' _outboxRemove: function(cid) { this.removed.push(cid); }' +
            ', ' + src + ' };', ctx);
        const kept = ctx.M._outboxCollapseDuplicates(entries);
        return { M: ctx.M, kept };
    }

    test('двойной сдвиг prev: вторая копия со сдвинутым prev — удалена', () => {
        const e1 = { cid: 'a', kind: 'day', ts: 1, payload: { id: 2, prev: 383291, curr: 383400, dateCurr: '9/9/2026' } };
        const e2 = { cid: 'b', kind: 'day', ts: 2, payload: { id: 2, prev: 383400, curr: 383400, dateCurr: '9/9/2026' } };
        const r = collapseVM([e1, e2]);
        assertEqual(r.kept.length, 1, 'осталась одна запись');
        assertEqual(r.kept[0].cid, 'a', 'старейшая (реальные показания)');
        assertEqual(r.M.removed.join(), 'b', 'копия удалена из журнала');
    });

    test('разные даты одного расходомера — обе сохранены', () => {
        const r = collapseVM([
            { cid: 'a', kind: 'day', payload: { id: 2, curr: 100, dateCurr: '9/9/2026' } },
            { cid: 'b', kind: 'day', payload: { id: 2, curr: 110, dateCurr: '9/10/2026' } }
        ]);
        assertEqual(r.kept.length, 2, 'последовательные сутки — обе идут');
        assertEqual(r.M.removed.length, 0, 'ничего не удалено');
    });

    test('одно показание трижды (серия дублей) — остаётся первая', () => {
        const mk = (cid, prev) => ({ cid, kind: 'day', payload: { id: 5, prev, curr: 700, dateCurr: '9/9/2026' } });
        const r = collapseVM([mk('a', 600), mk('b', 700), mk('c', 700)]);
        assertEqual(r.kept.length, 1, 'одна запись');
        assertEqual(r.kept[0].cid, 'a', 'первая по порядку очереди');
        assertEqual(r.M.removed.join(), 'b,c', 'обе копии убраны');
    });

    test('сутки и месяц одного значения — РАЗНЫЕ записи (entryType в ключе)', () => {
        const r = collapseVM([
            { cid: 'a', kind: 'day', payload: { id: 1, curr: 500, dateCurr: '8/31/2026' } },
            { cid: 'b', kind: 'period', payload: { id: 1, entryType: 'месяц', curr: 500, dateCurr: '8/31/2026' } }
        ]);
        assertEqual(r.kept.length, 2, 'entryType различает типы записей');
    });

    test('разные расходомеры с одинаковыми значениями — обе записи', () => {
        const r = collapseVM([
            { cid: 'a', kind: 'day', payload: { id: 2, curr: 100, dateCurr: '9/9/2026' } },
            { cid: 'b', kind: 'day', payload: { id: 4, curr: 100, dateCurr: '9/9/2026' } }
        ]);
        assertEqual(r.kept.length, 2, 'id в ключе различает счётчики');
    });

    test('порядок сохранён; пустой/битый ввод не падает', () => {
        const r = collapseVM(null);
        assertEqual(r.kept.length, 0, 'null → пусто');
        const r2 = collapseVM([null, { cid: 'z' }]);
        assertEqual(r2.kept.length, 1, 'битые записи пропускаются тихо');
    });

    test('числовая нормализация: «383400» и 383400 — копии', () => {
        const r = collapseVM([
            { cid: 'a', kind: 'day', payload: { id: 2, curr: 383400, dateCurr: '9/9/2026' } },
            { cid: 'b', kind: 'day', payload: { id: '2', curr: '383400', dateCurr: '9/9/2026' } }
        ]);
        assertEqual(r.kept.length, 1, 'типы не спасают от свёртки');
    });
});

// ============================================================
// D. VM — сервер: правило «окно 1 часа» (FlowmeterArchive.gs)
// ============================================================
function sheetMock(rows) {
    const calls = { appendRow: 0, withLock: 0 };
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
                if (lockBehavior === 'busy') throw new Error('server_busy');
                return fn();
            }
        }
    };
    vm.createContext(ctx);
    const obj = vm.runInContext('(function(){' + ARCHIVE_GS + '; return FlowmeterArchive;})()', ctx);
    obj._getSheet = function () { return mock.sheet; };
    return { obj, mock, ctx };
}

function archRow(id, prev, curr, day, entryType, ts) {
    const row = new Array(18).fill('');
    row[0] = id;
    row[2] = prev;
    row[3] = curr;
    row[6] = day;                    // G: dateCurr
    row[14] = (ts === undefined) ? new Date() : ts;   // O: timestamp
    row[17] = entryType || '';       // R
    return row;
}

const D = (y, m, d) => new Date(y, m - 1, d);
const H2 = () => new Date(Date.now() - 2 * 60 * 60 * 1000);   // 2 часа назад

describe('Task 375 — VM сервер: правило «окно 1 часа»', () => {

    test('СВЕЖАЯ строка с ДРУГИМ prev (двойной сдвиг) — дубль, не дописывается', () => {
        const rows = [archRow(2, 383291, 383400, D(2026, 9, 9), 'сутки')];   // O = сейчас
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 383400, 383400, '9/8/2026', '9/9/2026',
            null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows.length, 1,
            'повторный «Сохранить» со сдвинутым prev в первый час — пойман');
        assertTrue(a.ctx.__logs.some(l => l.indexOf('дубль пропущен') !== -1),
            'дубль залогирован');
    });

    test('СТАРАЯ строка (2 ч) с другим prev — НЕ дубль (осознанный повтор)', () => {
        const rows = [archRow(2, 383291, 383400, D(2026, 9, 9), 'сутки', H2())];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 383400, 383400, '9/8/2026', '9/9/2026',
            null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows.length, 2, 'позже часа правило не действует');
    });

    test('граница окна: 59 минут — дубль, 61 минута — не дубль', () => {
        const rows59 = [archRow(2, 1, 100, D(2026, 9, 9), 'сутки',
            new Date(Date.now() - 59 * 60 * 1000))];
        const a59 = archiveVM(rows59);
        a59.obj.appendToArchive(2, 'Х', 100, 100, '9/8/2026', '9/9/2026',
            null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows59.length, 1, '59 мин — ещё окно правки');

        const rows61 = [archRow(2, 1, 100, D(2026, 9, 9), 'сутки',
            new Date(Date.now() - 61 * 60 * 1000))];
        const a61 = archiveVM(rows61);
        a61.obj.appendToArchive(2, 'Х', 100, 100, '9/8/2026', '9/9/2026',
            null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows61.length, 2, '61 мин — окно закрыто');
    });

    test('свежая строка, но другое curr — НЕ дубль (корректировка значения)', () => {
        const rows = [archRow(2, 383291, 383400, D(2026, 9, 9), 'сутки')];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 383400, 383500, '9/8/2026', '9/9/2026',
            null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows.length, 2, 'новое значение дописывается');
    });

    test('свежая строка, но другая дата — НЕ дубль', () => {
        const rows = [archRow(2, 383400, 383500, D(2026, 9, 9), 'сутки')];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 383400, 383500, '9/9/2026', '9/10/2026',
            null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows.length, 2, 'новая дата дописывается');
    });

    test('свежая строка, но другой entryType — НЕ дубль', () => {
        const rows = [archRow(2, 0, 500, D(2026, 8, 31), 'сутки')];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 0, 500, '8/1/2026', '8/31/2026',
            null, null, 'т', 'Ежемесячно', 'Админ', 'И', '', '', 'месяц');
        assertEqual(rows.length, 2, 'сутки ≠ месяц');
    });

    test('правило 1 (точный ключ Task 366) живо при ЛЮБОМ возрасте строки', () => {
        const rows = [archRow(2, 383291, 383400, D(2026, 9, 9), 'сутки', H2())];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 383291, 383400, '9/8/2026', '9/9/2026',
            null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows.length, 1, 'точный ключ ловит и старую строку');
    });

    test('строка без O-таймштампа — правило 2 не срабатывает (только точный ключ)', () => {
        const rows = [archRow(2, 383291, 383400, D(2026, 9, 9), 'сутки', '')];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 383400, 383400, '9/8/2026', '9/9/2026',
            null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(rows.length, 2,
            'пустой таймштамп не мешает записи (лучше дубль, чем потеря)');
    });

    test('замок по-прежнему один на вызов; appendRow только для недубля', () => {
        const rows = [];
        const a = archiveVM(rows);
        a.obj.appendToArchive(2, 'Х', 1, 2, '9/8/2026', '9/9/2026',
            null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        a.obj.appendToArchive(2, 'Х', 2, 2, '9/8/2026', '9/9/2026',
            null, null, 'м³', 'Ежедневно', 'Админ', 'И', '', '', 'сутки');
        assertEqual(a.mock.calls.withLock, 2, 'по замку на вызов');
        assertEqual(a.mock.calls.appendRow, 1, 'двойной сдвиг не дописан');
    });
});

// ============================================================
// E. SRC — сервер: структура правила в FlowmeterArchive.gs
// ============================================================
describe('Task 375 — SRC: сервер FlowmeterArchive.gs', () => {

    test('правило «окно 1 часа»: 60*60*1000 + O-таймштамп row[14]', () => {
        const i = ARCHIVE_GS.indexOf('_isDuplicateArchiveRow: function');
        assertTrue(i !== -1, 'функция на месте');
        const fn = extractMethod(ARCHIVE_GS, '_isDuplicateArchiveRow');
        assertTrue(fn.indexOf('60 * 60 * 1000') !== -1, 'окно ровно 1 час');
        assertTrue(fn.indexOf('row[14]') !== -1, 'O: timestamp читается');
        assertTrue(fn.indexOf('Task 375') !== -1, 'маркер Task 375');
    });

    test('prev проверяется ПОСЛЕ curr (правило 2 не зависит от prev)', () => {
        const fn = extractMethod(ARCHIVE_GS, '_isDuplicateArchiveRow');
        const d = fn.indexOf("String(parseFloat(row[3])) !== currNeedle");   // D: curr
        const c = fn.indexOf("String(parseFloat(row[2])) === prevNeedle");   // C: prev (правило 1)
        assertTrue(d !== -1 && c !== -1 && d < c,
            'фильтр по curr раньше возврата по prev');
    });

    test('комментарий блока описывает оба правила', () => {
        const i = ARCHIVE_GS.indexOf('Task 366: защита');
        const zone = ARCHIVE_GS.slice(i, i + 2600);
        assertTrue(zone.indexOf('окно 1 часа') !== -1, 'правило 2 задокументировано');
        assertTrue(zone.indexOf('независимо от prev') !== -1, 'независимость от prev');
    });

    test('Flowmeter.gs не менялся (защита — только в архиве)', () => {
        const FLOWMETER_GS = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'Flowmeter.gs'), 'utf8');
        assertTrue(FLOWMETER_GS.indexOf('Task 375') === -1,
            'маршрут updateReading не тронут (правка на месте и meters-запись прежние)');
    });
});

// ============================================================
// F. SW
// ============================================================
describe('Task 375 — SW кэш', () => {

    test('SW: CACHE_VERSION = kipia-test-v761', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v761'") !== -1,
            'версия кэша поднята до v604');
    });

    test('SW: нет v603 (старая) и нет v605 (двойной бамп)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v603') === -1, 'старая версия не осталась');
        assertTrue(SW_SRC.indexOf('kipia-test-v762') === -1, 'двойного бампа не было');
    });
});
