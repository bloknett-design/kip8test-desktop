// tests/test-task356.js
// Task 356 — шахматка табеля: «пустые ячейки без кодов событий тоже
// должны быть без точек» (развитие Task 355 — там точка «·» была
// убрана только в НЕРАБОЧИХ выходных/праздничных ячейках).
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   SRC (index.html):
//     — _renderCell: центр ячейки = код статуса | «ОТ» плана | ПУСТО
//       (тернарник свёлся к (vacPlan ? 'ОТ' : '')); строкового
//       литерала «·» в методе НЕТ (в комментариях — есть, не счёт);
//     — старый тернарник (dayOff ? '' : '·') из файла удалён;
//     — комментарий-маркер Task 356 у контента ячейки;
//     — метка «·» СОХРАНЕНА в попапе выбора статуса и select
//       «Дополнительно…» (код «.» там по-прежнему подписан точкой);
//     — классы-маркеры ws-dot-code / ws-status-empty ставятся,
//       бейджи (evHtml + shiftWrap) конкатенируются к контенту;
//     — sw.js: CACHE_VERSION = kipia-test-v738 (+ guard v586).
//   VM (_renderCell, моки как в test-task314.js / test-task355.js):
//     — РАБОЧИЙ день: пустая, «.»-код, статус-мероприятие «И»
//       (с записью и без — виртуальный бейдж), пустая + будущее
//       мероприятие (пунктирный бейдж) — центр ПУСТ, «·» НЕТ;
//     — РАБОЧИЙ день: план отпуска «ОТ», смена «Д» — прежний вид
//       (заполненные ячейки правкой не задеты);
//     — НЕРАБОЧИЙ день (Task 355 жив): пустая и «.» — без «·»,
//       ws-weekend/ws-dot-code на месте; план «ОТ» показывается.
//
// Запуск: через tests/run-all.js (require './test-task356.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Вырезка метода WorkSchedule: «имя: function» (отступ 8 пробелов)
// → следующий метод ТОГО ЖЕ уровня (паттерн test-task314.js).
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

function loadMethod(name, localStorage, document) {
    const text = methodText(INDEX_SRC, name);
    assertTrue(text.indexOf(name + ': function') !== -1,
        'метод ' + name + ' найден в index.html');
    const make = new Function('localStorage', 'document', 'return ({' + text + '\n});');
    return make(localStorage, document)[name];
}

// ------------------------------------------------------------
// SRC: центр пустых ячеек без кодов — ПУСТ
// ------------------------------------------------------------
describe('Task 356 — SRC: «·» убрана из пустых ячеек (рабочие дни)', () => {
    test('_renderCell: контент — код статуса | «ОТ» плана | ПУСТО', () => {
        const cell = methodText(INDEX_SRC, '_renderCell');
        assertTrue(cell.indexOf("(showMainCode ? status : (vacPlan ? 'ОТ' : ''))") !== -1,
            'тернарник свёлся к (vacPlan ? \'ОТ\' : \'\')');
    });

    test('_renderCell: строкового литерала «·» в методе НЕТ', () => {
        const cell = methodText(INDEX_SRC, '_renderCell');
        // в комментариях «·» упоминается (Task 314/355/356) — выкидываем
        // строки-комментарии, в КОДЕ символа быть не должно
        const code = cell.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assertFalse(code.indexOf('·') !== -1, 'символ «·» в коде _renderCell отсутствует');
    });

    test('старый тернарник (dayOff ? \'\' : \'·\') из файла удалён', () => {
        assertFalse(INDEX_SRC.indexOf("(dayOff ? '' : '·')") !== -1,
            'в index.html нет прежнего dayOff-тернарника с «·»');
    });

    test('_renderCell: комментарий-маркер Task 356 у контента', () => {
        const cell = methodText(INDEX_SRC, '_renderCell');
        assertTrue(cell.indexOf('Task 356 (заявка «пустые ячейки без кодов событий') !== -1,
            'комментарий Task 356 в _renderCell');
    });

    test('Task 387: метка «·» убрана и в ПОПАПЕ/select — «Выходной» без кода', () => {
        // Task 387 (заявка: «я убрал точку — теперь просто пустая
        // ячейка белого цвета»): строка «Выходного» в попапе — БЕЗ
        // кода-символа (свотч-пустая ячейка); в select «Выходной»
        // представлен опцией «— выходной —»
        assertTrue(INDEX_SRC.indexOf("this._esc(isDot ? '' : c.code)") !== -1,
            'попап: isDot ? пусто : код (метка «·» удалена)');
        assertFalse(INDEX_SRC.indexOf("this._esc(isDot ? '·' : c.code)") !== -1,
            'метки «·» в попапе больше нет');
        assertFalse(INDEX_SRC.indexOf("var label = (c.code === '.') ? '·' : c.code;") !== -1,
            'метки «·» в select больше нет (Task 387)');
        assertTrue(INDEX_SRC.indexOf("if (c.code === '' || c.code === '.') continue;") !== -1,
            'select: «Выходной» — опцией «— выходной —»');
    });

    test('классы-маркеры и бейджи не тронуты', () => {
        const cell = methodText(INDEX_SRC, '_renderCell');
        assertTrue(cell.indexOf("if (isDotCode) classes.push('ws-dot-code')") !== -1,
            'ws-dot-code ставится («.»-маркер)');
        assertTrue(cell.indexOf("if (!showMainCode && !vacPlan) classes.push('ws-status-empty')") !== -1,
            'ws-status-empty ставится');
        assertTrue(cell.indexOf("evHtml + shiftWrap +") !== -1,
            'бейджи мероприятий/смен конкатенируются к контенту');
    });
});

// ------------------------------------------------------------
// VM: _renderCell — рабочий день, пустой центр
// ------------------------------------------------------------
describe('Task 356 — VM: _renderCell (пустые ячейки без «·»)', () => {

    const CODES = [
        { code: 'Д',  name: 'День',    color: '#FFE082' },
        { code: 'ОТ', name: 'Отпуск',  color: '#ECEFF1' },
        { code: '.',  name: 'Плановый выходной день', color: '#EEF0F2' },
        { code: 'И',  name: 'Инструктаж', color: '#B3E5FC' }
    ];

    function mkRenderCtx(dayOff, eventsMap, vacMap) {
        const ctx = {
            _year: 2026, _month: 9, _todayIso: null, _canEdit: true,
            _STATUS_CODES: CODES,
            _EVENT_CODES: ['И', 'ОБ', 'ПЗ', 'ПР', '*'],
            _ABSENCE_CODES: ['ОТ', 'У', 'ОВ', 'Б', 'ПР'],
            _VAC_CODES: ['ОТ', 'У'],
            _eventsAt: function (iso, tab) { return eventsMap[iso] || []; },
            _vacationAt: function (iso, tab) { return vacMap && vacMap[iso] || null; },
            _plannedShiftAt: function () { return null; },
            _statusMeta: function (code) {
                for (var i = 0; i < CODES.length; i++) {
                    if (CODES[i].code === code) return CODES[i];
                }
                return null;
            },
            _calDayOff: function () { return dayOff; },
            _esc: function (s) { return String(s); }
        };
        ctx._renderCell = loadMethod('_renderCell', null, null);
        return ctx;
    }

    const EMP = { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'сменный' };

    function cellHtml(ctx, entry) {
        return ctx._renderCell(4, '2026-09-04', EMP, entry, false);
    }

    // главный текст ячейки — до первого дочернего span (бейджи не в счёт)
    function mainText(html) {
        const m = html.match(/onclick="WorkSchedule\.onCellClick[^"]*"[^>]*>([^<]*)</);
        return m ? m[1] : null;
    }

    // --- РАБОЧИЙ день: центр ПУСТ у ячеек без кодов ---

    test('рабочий день, ПУСТАЯ ячейка — «·» НЕТ (заявка Task 356)', () => {
        const ctx = mkRenderCtx(false, {}, null);
        const html = cellHtml(ctx, null);
        assertEqual(mainText(html), '', 'центр пуст');
        assertFalse(html.indexOf('·') !== -1, 'символа «·» в ячейке нет вообще');
        assertTrue(html.indexOf('ws-status-empty') !== -1, 'вид пустой ячейки');
        assertFalse(html.indexOf('ws-weekend') !== -1, 'рабочий день — не ws-weekend');
    });

    test('рабочий день, код «.» — центр ПУСТ, маркер ws-dot-code жив', () => {
        const ctx = mkRenderCtx(false, {}, null);
        const html = cellHtml(ctx, { 'статус': '.', 'источник': 'авто', 'переработка': 0 });
        assertEqual(mainText(html), '', 'центр пуст (точка не выводится)');
        assertFalse(html.indexOf('·') !== -1, 'символа «·» в ячейке нет вообще');
        assertTrue(html.indexOf('ws-dot-code') !== -1, 'класс-маркер «.» на месте');
    });

    test('рабочий день, статус-мероприятие «И» — центр ПУСТ + сплошной бейдж', () => {
        const ctx = mkRenderCtx(false, { '2026-09-04': [{ code: 'И', training: { id: 1 } }] }, null);
        const html = cellHtml(ctx, { 'статус': 'И', 'источник': 'авто', 'переработка': 0 });
        assertEqual(mainText(html), '', 'центр пуст — НЕ «И» и не «·»');
        assertFalse(html.indexOf('·') !== -1, 'символа «·» в ячейке нет вообще');
        const b = html.match(/<span class="ws-ev-badge"[^>]*>И<\/span>/);
        assertTrue(!!b, 'бейдж «И» на месте');
        assertTrue(b && b[0].indexOf('background:#B3E5FC') !== -1,
            'бейдж сплошной, цвет справочника');
        assertFalse(html.indexOf('ws-ev-pending') !== -1, 'не пунктирный (день сформирован)');
    });

    test('рабочий день, «И» БЕЗ записи в «Инструктажи» — виртуальный бейдж, центр ПУСТ', () => {
        const ctx = mkRenderCtx(false, {}, null);
        const html = cellHtml(ctx, { 'статус': 'И', 'источник': 'авто', 'переработка': 0 });
        assertEqual(mainText(html), '', 'центр пуст');
        assertFalse(html.indexOf('·') !== -1, 'символа «·» в ячейке нет вообще');
        assertTrue(/<span class="ws-ev-badge"[^>]*>И<\/span>/.test(html),
            'виртуальный бейдж из статуса');
    });

    test('рабочий день, ПУСТАЯ + будущее мероприятие — пунктирный бейдж, центр ПУСТ', () => {
        const ctx = mkRenderCtx(false, { '2026-09-04': [{ code: 'И', training: { id: 2 } }] }, null);
        const html = cellHtml(ctx, null);
        assertEqual(mainText(html), '', 'центр пуст');
        assertFalse(html.indexOf('·') !== -1, 'символа «·» в ячейке нет вообще');
        assertFalse(html.indexOf('ws-ev-pending') !== -1,
            'пунктирного бейджа нет (Task 388: сплошной с цветом кода)');
    });

    // --- РАБОЧИЙ день: заполненные ячейки не задеты ---

    test('рабочий день, план отпуска — «ОТ» показывается', () => {
        const ctx = mkRenderCtx(false, {}, { '2026-09-04': { 'таб_номер': '017' } });
        const html = cellHtml(ctx, null);
        assertEqual(mainText(html), 'ОТ', 'код плана «ОТ» — прежний вид');
        assertTrue(html.indexOf('ws-vac-plan') !== -1, 'пунктирная рамка плана');
    });

    test('рабочий день, смена «Д» — код + inline-фон', () => {
        const ctx = mkRenderCtx(false, {}, null);
        const html = cellHtml(ctx, { 'статус': 'Д', 'источник': 'авто', 'переработка': 0 });
        assertEqual(mainText(html), 'Д', 'код смены — основной');
        assertTrue(/style="background:#FFE082;"/.test(html), 'inline-фон смены');
    });

    // --- НЕРАБОЧИЙ день: Task 355 жив ---

    test('нерабочий день, ПУСТАЯ — «·» НЕТ, ws-weekend (Task 355 жив)', () => {
        const ctx = mkRenderCtx(true, {}, null);
        const html = cellHtml(ctx, null);
        assertEqual(mainText(html), '', 'центр пуст');
        assertFalse(html.indexOf('·') !== -1, 'символа «·» в ячейке нет вообще');
        assertTrue(html.indexOf('ws-weekend') !== -1, 'класс ws-weekend (розовый фон)');
    });

    test('нерабочий день, «.» — «·» НЕТ, ws-dot-code жив (Task 355 жив)', () => {
        const ctx = mkRenderCtx(true, {}, null);
        const html = cellHtml(ctx, { 'статус': '.', 'источник': 'авто', 'переработка': 0 });
        assertEqual(mainText(html), '', 'центр пуст');
        assertTrue(html.indexOf('ws-dot-code') !== -1, 'маркер ws-dot-code');
    });

    test('нерабочий день, план отпуска — «ОТ» показывается (Task 355 жив)', () => {
        const ctx = mkRenderCtx(true, {}, { '2026-09-04': { 'таб_номер': '017' } });
        const html = cellHtml(ctx, null);
        assertEqual(mainText(html), 'ОТ', 'код плана «ОТ»');
    });
});

// ------------------------------------------------------------
// Service Worker
// ------------------------------------------------------------
describe('Task 356 — Service Worker', () => {
    test('SW: версия кэша kipia-test-v738', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v738'") !== -1,
            'CACHE_VERSION в sw.js = kipia-test-v738');
    });

    test('SW: двойной бамп не случился (v586 не существует)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v739') === -1,
            'в sw.js нет kipia-test-v738');
    });
});
