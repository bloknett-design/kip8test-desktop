// ============================================================
// Task 453 — заявка: «При попытке установки в ручную статуса
// "Выходной, плановый выходной день" появляется сообщение
// "Нельзя очистить авто-запись. Установите статус вручную.",
// хотя в таблице Коды_статусов этот статус есть, и остальные
// статусы из этой таблицы устанавливаются.»
//
// Корень: слот канона «Выходной» несёт ПУСТОЙ код (Task 387 —
// пользователь убрал «.» из листа), клиент трактует выбор как
// ОЧИСТКУ ячейки, а авто-запись очистить нельзя (deleteEntry
// отказывает). Фикс:
//   • «Выходной» поверх авто-смены → РУЧНАЯ запись «.» (легаси-
//     код слота; рендерится пустой белой ячейкой, НЕ рабочий
//     день в Итогах/Талонах/печати; generateMonth существующие
//     записи не трогает — выходной живёт поверх графика);
//   • «Удалить запись» на правке поверх авто снимает ПРАВКУ
//     (ячейка возвращается к авто-смене) — undo для «.»;
//   • saveAll: отклонение «.» старым сервером (unknown_статус)
//     → тост-ПОДСКАЗКА (обновить WorkSchedule.gs / вернуть «.»
//     в лист «Коды_статусов»);
//   • сервер (справочная копия scripts/WorkSchedule.gs):
//     _validateStatusCode принимает «.» всегда (слот «Выходного»
//     существует на клиенте при любом составе листа).
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');

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

// Срез модуля WorkSchedule (имена методов неуникальны в монолите)
const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// KipToast-мок: глобал переустанавливается ПЕРЕД каждым замером —
// другие тест-файлы (task322/418/419) удаляют/перезаписывают
// global.KipToast между прогонами
let TOASTS = [];
function toastOn() {
    global.KipToast = { show: function(msg) { TOASTS.push(String(msg)); } };
    TOASTS = [];
}
function lastToast() { return TOASTS.length ? TOASTS[TOASTS.length - 1] : null; }

// ============================================================
// 1. SRC — _applyCellStatus: «.» поверх авто вместо отказа
// ============================================================
describe('Task 453 — SRC: _applyCellStatus', () => {

    test('авто-ветка — ПЕРВОЙ, запись «.» с чистыми полями', () => {
        const fn = stripComments(methodText(WS_SRC, '_applyCellStatus'));
        const iAuto = fn.indexOf("if (server && server.источник === 'авто') {");
        const iManual = fn.indexOf("server.источник === 'руч'");
        const iLocal = fn.indexOf('pending && !server');
        assertTrue(iAuto !== -1, 'ветка авто существует');
        assertTrue(iAuto < iManual && iAuto < iLocal,
            'проверка авто — РАНЬШЕ руч/локальной (покрывает и случай правки поверх авто)');
        assertTrue(fn.indexOf("'статус': '.',") !== -1 &&
                   fn.indexOf("'переработка': 0,") !== -1 &&
                   fn.indexOf("'замещает': null,") !== -1 &&
                   fn.indexOf("'комментарий': '',") !== -1 &&
                   fn.indexOf("'часы': null") !== -1,
            'запись «.» с чистыми полями: без переработки/замещения/часов/комментария');
    });

    test('тост-успех вместо отказа; старый тост удалён', () => {
        const fn = methodText(WS_SRC, '_applyCellStatus');
        assertTrue(fn.indexOf('Выходной поставлен поверх авто-записи. Нажмите «Сохранить»') !== -1,
            'понятный тост: выходной поставлен, нажмите «Сохранить»');
        assertTrue(fn.indexOf("KipToast.show('Нельзя очистить авто-запись") === -1,
            'прежний тост-отказ удалён (заявка: статус обязан ставиться)');
        assertTrue(fn.indexOf('__delete: true') !== -1,
            'руч-ветка: __delete жив (регресс Task 251)');
    });

    test('попап и шит «Дополнительно…» — общий путь (код «»)', () => {
        const pop = stripComments(methodText(WS_SRC, 'onPopupStatus'));
        assertTrue(pop.indexOf('this._applyCellStatus(date, tabNo, code);') !== -1,
            'попап: onPopupStatus → _applyCellStatus (code «» — путь «Выходного»)');
        const sheet = stripComments(methodText(WS_SRC, 'submitCellForm'));
        assertTrue(sheet.indexOf("this._applyCellStatus(cell.date, cell['таб_номер'], '');") !== -1,
            'шит: «— выходной —» → _applyCellStatus(\'\') — тот же фикс');
    });
});

// ============================================================
// 2. SRC — deleteCell: откат правки поверх авто
// ============================================================
describe('Task 453 — SRC: deleteCell', () => {

    test('правка поверх авто — снять правку, не __delete', () => {
        const raw = methodText(WS_SRC, 'deleteCell');
        const fn = stripComments(raw);
        assertTrue(fn.indexOf("_serverEntry(cell.date, cell['таб_номер'])") !== -1,
            'deleteCell смотрит НА СЕРВЕРНУЮ запись (не только эффективную)');
        assertTrue(fn.indexOf("server.источник === 'авто' && pending") !== -1,
            'ветка «авто + правка» — отдельная');
        assertTrue(fn.indexOf('delete this._PENDING[key];') !== -1,
            'откат правки: ячейка возвращается к авто-смене');
        assertTrue(fn.indexOf('__delete') === -1,
            '__delete по авто НЕ планируется (упал бы при сохранении)');
        assertTrue(raw.indexOf('Правка снята — снова авто-запись') !== -1,
            'тост отката понятен, без «Сохранить» (правка локальная)');
    });

    test('чистая авто-запись — прежний отказ; ручная — прежний путь', () => {
        const fn = stripComments(methodText(WS_SRC, 'deleteCell'));
        assertTrue(fn.indexOf("server.источник !== 'руч' && !pending") !== -1 &&
                   fn.indexOf('Можно удалять только ручные записи') !== -1,
            'авто без правки — тост «Можно удалять только ручные записи»');
        assertTrue(fn.indexOf("this._applyCellStatus(cell.date, cell['таб_номер'], '');") !== -1,
            'ручная запись — прежний путь удаления через _applyCellStatus');
    });
});

// ============================================================
// 3. SRC — saveAll: подсказка при unknown_статус «.»
// ============================================================
describe('Task 453 — SRC: saveAll (failDot)', () => {

    test('детекция отклонения «.» старым сервером', () => {
        const fn = stripComments(methodText(WS_SRC, 'saveAll'));
        assertTrue(fn.indexOf('var failDot = false;') !== -1,
            'счётчик failDot объявлен');
        assertTrue(fn.indexOf("p['статус'] === '.'") !== -1 &&
                   fn.indexOf("indexOf('unknown_статус') !== -1") !== -1,
            'catch: «.» + unknown_статус → failDot');
    });

    test('тост-подсказка: обновить сервер ИЛИ вернуть «.» в лист', () => {
        const fn = methodText(WS_SRC, 'saveAll');
        assertTrue(fn.indexOf('if (failDot) {') !== -1,
            'подсказка — только при failDot');
        assertTrue(fn.indexOf('не принят сервером') !== -1 &&
                   fn.indexOf('обновите WorkSchedule.gs в Apps Script') !== -1 &&
                   fn.indexOf('верните «.» в колонку A') !== -1,
            'подсказка называет ОБА решения (Apps Script / лист «Коды_статусов»)');
    });
});

// ============================================================
// 4. SRC — сервер (справочная копия WorkSchedule.gs)
// ============================================================
describe('Task 453 — SRC: сервер _validateStatusCode', () => {

    test('«.» валиден всегда (слот «Выходного» существует при любом листе)', () => {
        const fn = methodText(GS_SRC, '_validateStatusCode');
        const iDot = fn.indexOf("if (status === '.') return { ok: true };");
        const iSheet = fn.indexOf('_getSheet(this.STATUS_CODES_SHEET)');
        assertTrue(iDot !== -1, 'спец-ветка «.» существует');
        assertTrue(iDot < iSheet,
            '«.» принимается БЕЗ обращения к листу (колонка A кода не содержит)');
        assertTrue(fn.indexOf('Task 453') !== -1,
            'комментарий Task 453 объясняет легаси-код «Выходного»');
    });
});

// ============================================================
// 5. VM — _applyCellStatus: сценарии «Выходного»
// ============================================================
describe('Task 453 — VM: _applyCellStatus', () => {

    function host(entries) {
        return new Function('return ({' +
            methodText(WS_SRC, '_applyCellStatus') + ',\n' +
            methodText(WS_SRC, '_serverEntry') + ',\n' +
            methodText(WS_SRC, '_effectiveEntry') + ',\n' +
            '_ENTRIES: ' + JSON.stringify(entries || []) + ',' +
            '_PENDING: {}' +
            '});')();
    }

    const AUTO_D = [{ 'дата': '2026-09-05', 'таб_номер': '023',
                      'статус': 'Д', 'источник': 'авто' }];
    const AUTO_D8 = [{ 'дата': '2026-09-05', 'таб_номер': '023',
                       'статус': 'Д8', 'источник': 'авто' }];
    const MANUAL_B = [{ 'дата': '2026-09-05', 'таб_номер': '023',
                        'статус': 'Б', 'источник': 'руч' }];

    test('ЗАЯВКА: «Выходной» на авто-смене Д → запись «.», без отказа', () => {
        toastOn();
        const h = host(AUTO_D);
        h._applyCellStatus('2026-09-05', '023', '');
        const p = h._PENDING['2026-09-05|023'];
        assertTrue(!!p, 'правка создана (прежде — тост-отказ без правки)');
        assertEqual(p['статус'], '.', 'статус «.» — плановый выходной');
        assertEqual(p['переработка'], 0, 'переработки нет');
        assertEqual(p['замещает'], null, 'замещения нет');
        assertEqual(p['комментарий'], '', 'комментарий чист');
        assertEqual(p['часы'], null, 'часов нет');
        assertEqual(lastToast(), 'Выходной поставлен поверх авто-записи. Нажмите «Сохранить»',
            'тост-успех вместо «Нельзя очистить авто-запись»');
    });

    test('эффективное состояние: «.»-правка поверх авто — источник «руч»', () => {
        const h = host(AUTO_D8);
        h._applyCellStatus('2026-09-05', '023', '');
        const eff = h._effectiveEntry('2026-09-05', '023');
        assertEqual(eff['статус'], '.', 'эффективный статус «.»');
        assertEqual(eff['источник'], 'руч', 'источник «руч» (запись ручная — deletable)');
    });

    test('повторный «Выходной» на «.»-правке — идемпотентно', () => {
        toastOn();
        const h = host(AUTO_D);
        h._applyCellStatus('2026-09-05', '023', '');
        h._applyCellStatus('2026-09-05', '023', '');
        assertEqual(h._PENDING['2026-09-05|023']['статус'], '.',
            'правка остаётся «.» (сброса к авто нет)');
    });

    test('правка кода поверх авто, затем «Выходной» — правка заменяется на «.»', () => {
        const h = host(AUTO_D);
        h._applyCellStatus('2026-09-05', '023', 'ОТ');
        assertEqual(h._PENDING['2026-09-05|023']['статус'], 'ОТ', 'сначала ОТ');
        h._applyCellStatus('2026-09-05', '023', '');
        assertEqual(h._PENDING['2026-09-05|023']['статус'], '.',
            'последнее действие выигрывает: «.» (не откат к авто, как прежде)');
    });

    test('«Выходной» на ручной записи → __delete (регресс Task 251)', () => {
        toastOn();
        const h = host(MANUAL_B);
        h._applyCellStatus('2026-09-05', '023', '');
        assertEqual(h._PENDING['2026-09-05|023'].__delete, true,
            'ручная запись планируется к удалению');
        assertEqual(lastToast(), null, 'тост «поверх авто» НЕ показывается');
    });

    test('локальная правка пустой ячейки + «Выходной» → правка снята', () => {
        const h = host([]);
        h._applyCellStatus('2026-09-05', '023', 'ОТ');
        assertTrue(!!h._PENDING['2026-09-05|023'], 'правка ОТ есть');
        h._applyCellStatus('2026-09-05', '023', '');
        assertEqual(h._PENDING['2026-09-05|023'], undefined,
            'правка снята — ячейка пустая (выходной = пустая ячейка)');
    });

    test('пустая ячейка + «Выходной» → ничего (запись не нужна)', () => {
        toastOn();
        const h = host([]);
        h._applyCellStatus('2026-09-05', '023', '');
        assertEqual(h._PENDING['2026-09-05|023'], undefined,
            '«.»-запись на пустой ячейке НЕ создаётся (выходной = пустая)');
        assertEqual(lastToast(), null, 'тоста нет');
    });
});

// ============================================================
// 6. VM — deleteCell: undo для «.»-выходного
// ============================================================
describe('Task 453 — VM: deleteCell', () => {

    function host(entries, pending, editEntry) {
        return new Function('return ({' +
            methodText(WS_SRC, 'deleteCell') + ',\n' +
            methodText(WS_SRC, '_applyCellStatus') + ',\n' +
            methodText(WS_SRC, '_serverEntry') + ',\n' +
            '_ENTRIES: ' + JSON.stringify(entries || []) + ',' +
            '_PENDING: ' + JSON.stringify(pending || {}) + ',' +
            '_editingCell: { date: \'2026-09-05\', \'таб_номер\': \'023\',' +
            ' entry: ' + JSON.stringify(editEntry || null) + ' },' +
            'closeCellForm: function() { this._closed = (this._closed || 0) + 1; },' +
            '_renderGrid: function() {},' +
            '_updateSaveBtn: function() {}' +
            '});')();
    }

    const AUTO_D = [{ 'дата': '2026-09-05', 'таб_номер': '023',
                      'статус': 'Д', 'источник': 'авто' }];
    const MANUAL_B = [{ 'дата': '2026-09-05', 'таб_номер': '023',
                        'статус': 'Б', 'источник': 'руч' }];

    test('«.»-правка поверх авто: «Удалить запись» снимает правку', () => {
        toastOn();
        const h = host(AUTO_D, { '2026-09-05|023': { 'статус': '.',
            'переработка': 0, 'замещает': null, 'комментарий': '', 'часы': null } },
            { 'статус': '.', 'источник': 'руч' });
        h.deleteCell();
        assertEqual(h._PENDING['2026-09-05|023'], undefined,
            'правка снята — ячейка возвращается к авто-смене Д');
        assertEqual(h._closed, 1, 'шит закрыт');
        assertEqual(lastToast(), 'Правка снята — снова авто-запись',
            'понятный тост отката (локального, без «Сохранить»)');
    });

    test('чистая авто-запись — прежний отказ', () => {
        toastOn();
        const h = host(AUTO_D, {}, { 'статус': 'Д', 'источник': 'авто' });
        h.deleteCell();
        assertEqual(lastToast(), 'Можно удалять только ручные записи',
            'авто без правки — отказ (сервер запрещает deleteEntry)');
        assertEqual(h._closed, undefined, 'шит НЕ закрыт (early return)');
    });

    test('ручная запись — прежний путь __delete', () => {
        toastOn();
        const h = host(MANUAL_B, {}, { 'статус': 'Б', 'источник': 'руч' });
        h.deleteCell();
        assertEqual(h._PENDING['2026-09-05|023'].__delete, true,
            'ручная запись планируется к удалению');
        assertEqual(lastToast(), 'Удаление применено. Нажмите «Сохранить» для отправки на сервер',
            'прежний тост удаления');
    });

    test('локальная правка пустой ячейки (нет записи) — правка снимается', () => {
        toastOn();
        const h = host([], { '2026-09-05|023': { 'статус': 'ОТ' } },
            { 'статус': 'ОТ', 'источник': 'руч' });
        h.deleteCell();
        assertEqual(h._PENDING['2026-09-05|023'], undefined,
            'правка снята (путь _applyCellStatus — pending && !server)');
    });
});

// ============================================================
// 7. VM — Итоги: «.» поверх авто исключает день из явок
// ============================================================
describe('Task 453 — VM: Итоги учёта', () => {

    function totalsHost(entries, pending) {
        return new Function('return ({' +
            methodText(WS_SRC, '_totalsEffectiveEntries') + ',\n' +
            methodText(WS_SRC, '_totalsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsZero') + ',\n' +
            methodText(WS_SRC, '_codeHours') + ',\n' +
            methodText(WS_SRC, '_overHours') + ',\n' +
            methodText(WS_SRC, '_statusMeta') + ',\n' +
            methodText(WS_SRC, '_empTypeMap') + ',\n' +
            '_ENTRIES: ' + JSON.stringify(entries) + ',' +
            '_PENDING: ' + JSON.stringify(pending || {}) + ',' +
            '_STATUS_CODES: []' +
            '});')();
    }

    test('плановый выходной поверх авто Д8 — НЕ день явки в Итогах', () => {
        const entries = [{ 'дата': '2026-09-05', 'таб_номер': '023',
                           'статус': 'Д8', 'источник': 'авто' }];
        const emps = [{ 'таб_номер': '023', 'тип': 'дневной' }];
        const before = totalsHost(entries, {});
        const a0 = before._totalsAgg(before._totalsEffectiveEntries(),
            before._empTypeMap(emps)).byTab['023'];
        assertEqual(a0.work, 1, 'без правки: авто Д8 — день явки');

        const after = totalsHost(entries, { '2026-09-05|023': {
            'статус': '.', 'переработка': 0, 'замещает': null,
            'комментарий': '', 'часы': null } });
        const a1 = after._totalsAgg(after._totalsEffectiveEntries(),
            after._empTypeMap(emps)).byTab['023'];
        assertEqual(a1.work, 0, 'с «.»-правкой: день НЕ явка (выходной поверх авто)');
        assertEqual(a1.hours, 0, 'часы дня исключены');
        assertEqual(a1.other, 1, '«.» — прочая запись (как легаси-«.»)');
    });
});

// ============================================================
// 8. VM — сервер: «.» валиден, пустой код — нет
// ============================================================
describe('Task 453 — VM: сервер _validateStatusCode', () => {

    test('«.» → ok; «» → invalid_статус (без обращения к листу)', () => {
        const h = new Function('return ({' +
            methodText(GS_SRC, '_validateStatusCode') +
            '});')();
        const dot = h._validateStatusCode('.');
        assertEqual(dot.ok, true, '«.» валиден (рук. плановый выходной)');
        const empty = h._validateStatusCode('');
        assertEqual(empty.ok, false, 'пустой код НЕ валиден (путь удаления — deleteEntry)');
        assertEqual(empty.error, 'invalid_статус', 'ошибка invalid_статус');
    });
});

// ============================================================
// 9. SW — версия кэша
// ============================================================
describe('Task 453 — SW', () => {
    test('SW: кэш поднят до kipia-test-v756 (Task 453)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v756'") !== -1,
            'CACHE_VERSION = kipia-test-v756');
        assertTrue(SW_SRC.indexOf('kipia-test-v757') === -1,
            'kipia-test-v756 не существует');
        assertTrue(SW_SRC.indexOf('Task 453') !== -1,
            'комментарий Task 453 в истории версий');
    });
});
