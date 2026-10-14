// tests/test-task380.js
// Task 380 — заявки пользователя:
//   1) «В окне „Мероприятия“ в баре, цвет фона в окне где расположен
//      текст мероприятий дата которых прошла, должен быть светлее, а
//      дата которых ещё не наступила или не прошла — фон в окне
//      темнее» — фон СТРОКИ мероприятия (.ws-ep-item) по СРОКУ:
//      ПРОШЛО (дата_окончания строго раньше «сегодня») — класс
//      .ws-ep-past (ставит _renderMonthEventsPanel, граница —
//      this._isoDate(new Date())) — фон СВЕТЛЕЕ окна; идёт сегодня /
//      будущие — базовый фон ТЕМНЕЕ окна. Полупрозрачные тинты в обеих
//      темах: тёмная — прошедшие rgba(255,255,255,0.12) / текущие
//      rgba(0,0,0,0.45); светлая — прошедшие rgba(255,255,255,0.55) /
//      текущие rgba(0,0,0,0.12). Task 381: padding 3px 10px + margin
//      0 -10px — строка до КРАЁВ окна, соседние строки СКЛЕИВАЮТСЯ
//      (gap: 0) — ОБЩИЙ фон окна вместо плашек по строкам.
//   2) «В мобильной версии, при нажатии с задержкой на ячейки шахматки
//      и с фамилиями и ячейки итогов учёта, не должен выделяться текст
//      в ячейках для копирования, поделиться, поиска в гугл и
//      остальные манипуляции с выделенным текстом» — user-select:none
//      (+ -webkit-touch-callout:none) на ВСЕЙ таблице шахматки
//      (.ws-grid) и таблицах итогов (.ws-tt-table) ТОЛЬКО в мобильном
//      breakpoint ≤1023px; десктоп не тронут.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   CSS мероприятия: 4 правила фонов (база/прошедшее/светлая база/
//     светлая прошедшее) + ПОРЯДОК (каскад специфичностей: светлые
//     после базовых, .ws-ep-past светлой — последним); отступы
//     строки (Task 381: 3px 10px / 0 -10px + склейка); старое
//     правило .ws-ep-item (перенос текста,
//     Task 315) и старый светлый color:#000 (Task 330) живы.
//   SRC: _renderMonthEventsPanel — todayIso через _isoDate(new Date())
//     ровно 1 раз; eIso = дата_окончания || дата_начала; класс
//     ws-ep-past при eIso < todayIso.
//   VM (динамические даты текущего месяца): строка «весь месяц» и
//     «последний день» НИКОГДА не прошедшие (инвариант любой даты
//     запуска); «первый день» (с датой_окончания и без) — прошедшие
//     iff 1-е число < сегодня; счётчик ws-ep-past совпадает с
//     расчётным; структура строк сохранена.
//   CSS мобайл: user-select:none на .ws-grid,.ws-tt-table внутри
//     @media (max-width: 1023px); базовые правила таблиц БЕЗ
//     user-select (десктоп жив); правило одно.
//   SW: kipia-test-v736 (guard v610).
//   Регресс: окна бара на десктопе выделяются как прежде
//     (.ws-events-panel без user-select).
//
// Запуск: через tests/run-all.js (require './test-task380.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Вырезка метода WorkSchedule: «имя: function» (отступ 8 пробелов)
// → следующий метод ТОГО ЖЕ уровня.
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// ============================================================
// 1. CSS: окно «Мероприятия» — фон строк по сроку
// ============================================================
describe('Task 380 — CSS: фон строк мероприятий по сроку', () => {

    test('база .ws-ep-item: ТЁМНЫЙ фон + строка до краёв (Task 381)', () => {
        // [^{}]* не пересекает границы правил → находит именно НОВОЕ
        // правило (старое Task 315 без padding не матчится)
        const re = /\.ws-ep-item \{[^{}]*padding:\s*3px 10px;[^{}]*margin:\s*0 -10px;[^{}]*background:\s*rgba\(0, 0, 0, 0\.45\);[^{}]*\}/;
        assertTrue(re.test(INDEX_SRC),
            'текущие/будущие: rgba(0,0,0,0.45) — ТЕМНЕЕ окна; строка до краёв (Task 381)');
    });

    test('.ws-ep-past: ПРОЗРАЧНЫЙ — общий фон окна (Task 389)', () => {
        const re = /\.ws-ep-item\.ws-ep-past \{[^}]*background:\s*transparent;[^}]*\}/;
        assertTrue(re.test(INDEX_SRC),
            'прошедшие: transparent — виден ОБЩИЙ ФОН окна var(--bg-tertiary), как выше оглавления (Task 389)');
    });

    test('светлая тема: ТЁМНЫЙ фон текущих/будущих', () => {
        const re = /\[data-theme="light"\] \.ws-ep-item \{[^}]*background:\s*rgba\(0, 0, 0, 0\.12\);[^}]*\}/;
        assertTrue(re.test(INDEX_SRC),
            'светлая тема: rgba(0,0,0,0.12) — темнее окна #e9e7de');
    });

    test('светлая тема: .ws-ep-past ПРОЗРАЧНЫЙ (Task 389)', () => {
        const re = /\[data-theme="light"\] \.ws-ep-item\.ws-ep-past \{[^}]*background:\s*transparent;[^}]*\}/;
        assertTrue(re.test(INDEX_SRC),
            'светлая тема: прошедшие transparent — общий фон окна (Task 389)');
    });

    test('ПОРЯДОК правил: база → past → светлая база → светлая past', () => {
        // каскад специфичностей (0,1,0 → 0,2,0 → 0,2,0 → 0,3,0):
        // светлые правила ПОСЛЕ базовых, .ws-ep-past светлой — последним
        // (иначе светлая база (0,2,0) перебила бы тёмный .ws-ep-past)
        const iBase = INDEX_SRC.indexOf('.ws-ep-item {\n        padding: 3px 10px;');
        const iPast = INDEX_SRC.indexOf('.ws-ep-item.ws-ep-past {');
        const iLight = INDEX_SRC.indexOf('[data-theme="light"] .ws-ep-item {\n');
        const iLightPast = INDEX_SRC.indexOf('[data-theme="light"] .ws-ep-item.ws-ep-past {');
        assertTrue(iBase !== -1 && iPast !== -1 && iLight !== -1 && iLightPast !== -1,
            'все 4 правила на месте');
        assertTrue(iBase < iPast && iPast < iLight && iLight < iLightPast,
            'порядок каскада верен (база < past < светлая < светлая past)');
    });

    test('регресс: старое правило .ws-ep-item живо (Task 315 — перенос)', () => {
        const item = INDEX_SRC.match(/\.ws-ep-item \{[\s\S]*?\n    \}/);
        assertTrue(!!item, 'правило .ws-ep-item');
        assertTrue(item[0].indexOf('white-space: normal') !== -1,
            'строка мероприятия переносится (normal)');
        assertTrue(item[0].indexOf('overflow-wrap: break-word') !== -1,
            'длинные слова не рвут окно');
        assertTrue(item[0].indexOf('display: flex') !== -1,
            'флекс-строка (точка/дата/текст) как прежде');
    });

    test('регресс: светлый чёрный текст строк жив (Task 330)', () => {
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ws-ep-item { color:') !== -1,
            'правило светлой темы Task 330 на месте');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ws-ep-text,') !== -1,
            'текст/дата строк — чёрные в светлой теме');
    });
});

// ============================================================
// 2. SRC: _renderMonthEventsPanel — граница «сегодня»
// ============================================================
describe('Task 380 — SRC: класс ws-ep-past по дате', () => {

    test('todayIso через _isoDate(new Date()) — ровно 1 раз', () => {
        const m = methodText(WS_SRC, '_renderMonthEventsPanel');
        assertTrue(m.length > 0, 'метод найден');
        const n = (m.match(/this\._isoDate\(new Date\(\)\)/g) || []).length;
        assertEqual(n, 1, 'граница «сегодня» — тот же приём, что ws-today');
    });

    test('eIso: дата_окончания || дата_начала (однодневные)', () => {
        const m = methodText(WS_SRC, '_renderMonthEventsPanel');
        assertTrue(m.indexOf("String(tr['дата_окончания'] || tr['дата_начала'] || '')") !== -1,
            'конец отсутствует — сравнение по началу');
    });

    test('класс: (eIso && eIso < todayIso) — СТРОГО раньше сегодня', () => {
        const m = methodText(WS_SRC, '_renderMonthEventsPanel');
        assertTrue(m.indexOf("(eIso && eIso < todayIso) ? ' ws-ep-past' : ''") !== -1,
            'прошедшие = окончание строго раньше «сегодня»');
        assertTrue(m.indexOf("'<span class=\"ws-ep-item' + pastCls + '\">'") !== -1,
            'класс вписан в разметку строки');
    });
});

// ============================================================
// 3. VM: рендер по данным — прошедшие/текущие (динамич. даты)
// ============================================================
describe('Task 380 — VM: классы строк по сроку', () => {

    const EMP = [{ 'таб_номер': '0871', 'ФИО': 'Иванов Иван Иванович' }];

    // Динамические даты ТЕКУЩЕГО месяца — инварианты верны при любой
    // дате запуска: «весь месяц» и «последний день» никогда не
    // прошедшие; «первый день» — прошедший iff 1-е < сегодня
    const NOW = new Date();
    const Y = NOW.getFullYear(), M = NOW.getMonth() + 1;
    const DIM = new Date(Y, M, 0).getDate();
    const pad = function(n) { return (n < 10 ? '0' : '') + n; };
    const iso = function(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); };
    const mStart = iso(Y, M, 1), mEnd = iso(Y, M, DIM);
    const todayIso = iso(Y, M, NOW.getDate());

    function loadHost(trainings) {
        const el = { innerHTML: '', hidden: true };
        const document = { getElementById: function(id) {
            return id === 'wsEventsPanel' ? el : null;
        }};
        const texts = ['_instrShortOf', '_normInstrKey',
                   '_renderMonthEventsPanel', '_trainingCodeOf', '_statusMeta']
            .map(n => methodText(INDEX_SRC, n));
        const make = new Function('localStorage', 'document', 'confirm',
                                  'KipToast', 'kipConfirm',
            'return ({' + texts.join('\n') + '\n' +
            '_year: ' + Y + ', _month: ' + M + ',' +
            '_selDay: null,' +
            '_TRAININGS: ' + JSON.stringify(trainings) + ',' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_STATUS_CODES: [],' +
            '_esc: function(s){ return String(s == null ? "" : s); },' +
            '_escAttr: function(s){ return String(s == null ? "" : s); },' +
            '_isoDate: function(dt){ if (!dt) return null; var m = ("" + (dt.getMonth() + 1)).padStart(2, "0"); var d = ("" + dt.getDate()).padStart(2, "0"); return dt.getFullYear() + "-" + m + "-" + d; },' +
            '_barExpSync: function() {},' +
            '});');
        const ctx = make(null, document, null, null, null);
        ctx._renderMonthEventsPanel();
        return el;
    }

    // строки по фрагментам после '<span class="ws-ep-item'
    function rowsOf(el) {
        return el.innerHTML.split('<span class="ws-ep-item').slice(1);
    }

    test('«весь месяц» и «последний день» — НИКОГДА не прошедшие', () => {
        const trs = [
            { 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Весь месяц',
              'дата_начала': mStart, 'дата_окончания': mEnd },
            { 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Последний день',
              'дата_начала': mEnd, 'дата_окончания': mEnd }
        ];
        const el = loadHost(trs);
        const rows = rowsOf(el);
        assertEqual(rows.length, 2, 'обе строки в окне');
        rows.forEach(function(r) {
            assertFalse(r.indexOf('ws-ep-past') !== -1,
                'строка не прошедшая (конец ≥ сегодня всегда)');
        });
    });

    test('«первый день» — прошедший iff 1-е число < сегодня (оба варианта конца)', () => {
        const trs = [
            { 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Первый день',
              'дата_начала': mStart, 'дата_окончания': mStart },
            { 'таб_номер': '0871', 'тип': 'обучение', 'тема': 'Первый день без конца',
              'дата_начала': mStart }
        ];
        const el = loadHost(trs);
        const rows = rowsOf(el);
        assertEqual(rows.length, 2, 'обе строки в окне');
        const expPast = mStart < todayIso;
        const gotPast = rows.filter(r => r.indexOf('ws-ep-past') !== -1).length;
        assertEqual(gotPast, expPast ? 2 : 0,
            'расчётное (' + (expPast ? 'прошли' : 'не прошли') + ') = фактическому');
    });

    test('счётчик ws-ep-past в разметке = расчётному (смесь дат)', () => {
        const trs = [
            { 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Весь месяц',
              'дата_начала': mStart, 'дата_окончания': mEnd },
            { 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Последний день',
              'дата_начала': mEnd, 'дата_окончания': mEnd },
            { 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Первый день',
              'дата_начала': mStart, 'дата_окончания': mStart },
            { 'таб_номер': '0871', 'тип': 'обучение', 'тема': 'Первый день без конца',
              'дата_начала': mStart }
        ];
        const el = loadHost(trs);
        const n = (el.innerHTML.match(/ws-ep-past/g) || []).length;
        const exp = mStart < todayIso ? 2 : 0;
        assertEqual(n, exp, 'классов ws-ep-past ровно столько, сколько прошедших');
        // структура: класс вписан в открывающий тег строки
        assertEqual((el.innerHTML.match(/<span class="ws-ep-item/g) || []).length, 4,
            'разметка строк сохранена (Task 315)');
    });
});

// ============================================================
// 4. CSS: мобайл — запрет выделения текста (шахматка + итоги)
// ============================================================
describe('Task 380 — CSS: мобайл без выделения текста', () => {

    test('.ws-grid и .ws-tt-table: user-select:none в ≤1023px', () => {
        const re = /@media \(max-width: 1023px\) \{\s*\.ws-grid,\s*\n\s*\.ws-tt-table \{[^}]*-webkit-user-select:\s*none;[^}]*-moz-user-select:\s*none;[^}]*-ms-user-select:\s*none;[^}]*user-select:\s*none;[^}]*\}/s;
        assertTrue(re.test(INDEX_SRC),
            'обе таблицы не выделяются на мобиле (все префиксы)');
    });

    test('-webkit-touch-callout: none — коллаут iOS погашен', () => {
        const re = /@media \(max-width: 1023px\) \{[^@]*?\.ws-grid,\s*\n\s*\.ws-tt-table \{[^}]*-webkit-touch-callout:\s*none;[^}]*\}/s;
        assertTrue(re.test(INDEX_SRC), 'долгое нажатие iOS без коллаута');
    });

    test('правило ОДНО (двойного бампа нет)', () => {
        assertEqual((INDEX_SRC.match(/\.ws-grid,\s*\n\s*\.ws-tt-table \{/g) || []).length, 1,
            'селектор .ws-grid,.ws-tt-table встречается один раз');
    });

    test('ДЕСКТОП не тронут: базовые правила таблиц без user-select', () => {
        const grid = INDEX_SRC.match(/\.ws-grid \{[\s\S]*?\n    \}/);
        assertTrue(!!grid, 'базовое правило .ws-grid есть');
        assertFalse(grid[0].indexOf('user-select') !== -1,
            'базовая .ws-grid без user-select (выделение мышью живо)');
        const tt = INDEX_SRC.match(/\.ws-tt-table \{[\s\S]*?\n    \}/);
        assertTrue(!!tt, 'базовое правило .ws-tt-table есть');
        assertFalse(tt[0].indexOf('user-select') !== -1,
            'базовая .ws-tt-table без user-select');
        // и нет user-select у таблиц в десктопном breakpoint
        const desk = INDEX_SRC.match(/@media \(min-width: 1024px\) \{[\s\S]*?\n    \}/);
        assertTrue(!desk || desk[0].indexOf('user-select') === -1,
            'десктопные правила без user-select');
    });

    test('регресс: окна бара НЕ тронуты (выделение текста окон живо)', () => {
        const ev = INDEX_SRC.match(/\.ws-events-panel \{[\s\S]*?\n    \}/);
        assertTrue(!!ev && ev[0].indexOf('user-select') === -1,
            'окно мероприятий без user-select (заявка только про таблицы)');
    });
});

// ============================================================
// 5. SW и адаптации
// ============================================================
describe('Task 380 — SW и адаптации тестов', () => {

    test('SW: kipia-test-v736', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v736'") !== -1,
            'версия кэша kipia-test-v736');
        assertFalse(SW_SRC.indexOf('kipia-test-v737') !== -1,
            'двойного бампа нет');
    });

    test('адаптации: VM-хосты 315/316 получили _isoDate', () => {
        const t315 = fs.readFileSync(path.join(ROOT, 'tests/test-task315.js'), 'utf8');
        const t316 = fs.readFileSync(path.join(ROOT, 'tests/test-task316.js'), 'utf8');
        assertTrue((t315.match(/_isoDate: function\(dt\)/g) || []).length >= 2,
            'test-task315: заглушка _isoDate в хостах');
        assertTrue((t316.match(/_isoDate: function\(dt\)/g) || []).length >= 2,
            'test-task316: заглушка _isoDate в хостах');
    });
});
