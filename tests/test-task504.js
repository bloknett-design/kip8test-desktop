// tests/test-task504.js
// Task 504 — заявка пользователя:
//   «В разделе "Табель учёта рабочего времени", в окне мероприятий,
//    даты выполненных мероприятий сделай зелёным цветом, а просроченных
//    — красным.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   CSS: 4 правила цветов дат — .ws-ep-date-ok (тёмная #81c784 /
//     светлая #2e7d32) и .ws-ep-date-bad (тёмная #ef5350 / светлая
//     #c62828); порядок каскада: ok/bad ПОСЛЕ светлого color:#000
//     (специфичность 0,2,0 = у светлого правила — побеждает поздний;
//     даты БЕЗ классов в светлой теме остаются чёрными), светлые
//     варианты (0,3,0) — после тёмных. Палитра = ws-il-due-* (Task 407)
//     и ws-ppe-exp-* (Task 444) — те же тона, что у строк «✓ актуально
//     / ⚠ просрочено» попапа ячейки.
//   SRC: _renderMonthEventsPanel — класс на ДАТУ (.ws-ep-date' +
//     dateCls + '): ТОЛЬКО И/ПЗ (у семейства «Инструктажи» есть
//     столбцы «выполнение»/«просрочен», как Task 482); выполнение = 1
//     → ws-ep-date-ok (ПРИОРИТЕТНЕЕ просрочки, как evDone в Task 482);
//     не выполнено + просрочено (поле «просрочен» сервера, нет —
//     дата_начала < todayIso, todayIso уже вычислен по Task 380) →
//     ws-ep-date-bad; ОБ/ПР/* — без классов.
//   VM (динамические даты текущего месяца — инварианты при любой
//     дате запуска): выполненный И (выполнение=1, дата в прошлом) —
//     зелёный (выполнение важнее прошедшей даты); просроченный ПЗ
//     (просрочен=1) — красный; И без полей с прошедшей датой —
//     красный (фолбэк дата_начала < сегодня); будущий ПЗ — БЕЗ
//     класса; ОБ/ПР — БЕЗ класса при любых полях; выполнение=1 +
//     просрочен=1 → зелёный (приоритет).
//   РЕГРЕСС: ws-ep-past (Task 380/389) на строках жив — класс даты
//     НЕ трогает фон; структура разметки строк сохранена
//     (dot + b.ws-ep-date + span.ws-ep-text); СИЗ-строки («до дд.мм»)
//     — без классов дат; счётчики ws-ep-date-ok/bad = расчётным.
//   SW: kipia-test-v750 (двойного бампа нет — v728).
//
// Запуск: через tests/run-all.js (require './test-task504.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Вырезка метода WorkSchedule: «имя: function» (отступ 8 пробелов)
// → следующий метод ТОГО ЖЕ уровня (приём test-task380.js).
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
// 1. CSS: цвета дат по состоянию (обе темы)
// ============================================================
describe('Task 504 — CSS: дата строки зелёная/красная по состоянию', () => {

    test('тёмная тема: ok ЗЕЛЁНЫЙ #81c784', () => {
        const re = /\.ws-ep-date\.ws-ep-date-ok \{\s*color:\s*#81c784;\s*\}/;
        assertTrue(re.test(INDEX_SRC),
            'выполнено: #81c784 — палитра ws-il-due-ok (Task 407)');
    });

    test('тёмная тема: bad КРАСНЫЙ #ef5350', () => {
        const re = /\.ws-ep-date\.ws-ep-date-bad \{\s*color:\s*#ef5350;\s*\}/;
        assertTrue(re.test(INDEX_SRC),
            'просрочено: #ef5350 — палитра ws-il-due-bad (Task 407)');
    });

    test('светлая тема: ok #2e7d32, bad #c62828', () => {
        const reOk = /\[data-theme="light"\] \.ws-ep-date\.ws-ep-date-ok \{\s*color:\s*#2e7d32;\s*\}/;
        const reBad = /\[data-theme="light"\] \.ws-ep-date\.ws-ep-date-bad \{\s*color:\s*#c62828;\s*\}/;
        assertTrue(reOk.test(INDEX_SRC), 'светлая ok: #2e7d32 (Task 407/444)');
        assertTrue(reBad.test(INDEX_SRC), 'светлая bad: #c62828 (Task 407/444)');
    });

    test('ПОРЯДОК: ok/bad ПОСЛЕ светлого color:#000, светлые — последними', () => {
        // Каскад: [data-theme="light"] .ws-ep-date { color: #000 } (0,2,0)
        // и .ws-ep-date.ws-ep-date-ok (0,2,0) — равные, побеждает поздний;
        // поэтому ок/bad-правила обязаны стоять ПОСЛЕ светлого правила,
        // иначе цветные даты терялись бы только в светлой теме.
        // Светлые ок/bad (0,3,0) — после тёмных ок/bad.
        const iLightDate = INDEX_SRC.indexOf(
            '[data-theme="light"] .ws-ep-text,\n    [data-theme="light"] .ws-ep-date { color: #000; }');
        const iOk = INDEX_SRC.indexOf('.ws-ep-date.ws-ep-date-ok {');
        const iBad = INDEX_SRC.indexOf('.ws-ep-date.ws-ep-date-bad {');
        const iLightOk = INDEX_SRC.indexOf('[data-theme="light"] .ws-ep-date.ws-ep-date-ok {');
        const iLightBad = INDEX_SRC.indexOf('[data-theme="light"] .ws-ep-date.ws-ep-date-bad {');
        assertTrue(iLightDate !== -1 && iOk !== -1 && iBad !== -1 &&
                   iLightOk !== -1 && iLightBad !== -1,
            'все 5 точек каскада на месте (светлая база + 2 тёмных + 2 светлых)');
        assertTrue(iLightDate < iOk && iOk < iBad && iBad < iLightOk && iLightOk < iLightBad,
            'порядок: светлая база < ok < bad < светлая ok < светлая bad');
    });

    test('правила по одному разу (двойного определения нет)', () => {
        // якорь «\n    » — иначе подстрока светлого правила ловится
        // повторно ([data-theme="light"] .ws-ep-date.ws-ep-date-ok {…})
        assertEqual((INDEX_SRC.match(/\n    \.ws-ep-date\.ws-ep-date-ok \{/g) || []).length, 1,
            '.ws-ep-date.ok (тёмная) определён один раз');
        assertEqual((INDEX_SRC.match(/\n    \.ws-ep-date\.ws-ep-date-bad \{/g) || []).length, 1,
            '.ws-ep-date.bad (тёмная) определён один раз');
        assertEqual((INDEX_SRC.match(/\n    \[data-theme="light"\] \.ws-ep-date\.ws-ep-date-ok \{/g) || []).length, 1,
            '.ws-ep-date.ok (светлая) определён один раз');
        assertEqual((INDEX_SRC.match(/\n    \[data-theme="light"\] \.ws-ep-date\.ws-ep-date-bad \{/g) || []).length, 1,
            '.ws-ep-date.bad (светлая) определён один раз');
    });

    test('регресс: базовая .ws-ep-date жива (Task 315 — жирная, nowrap)', () => {
        const re = /\.ws-ep-date \{[^}]*font-weight:\s*700;[^}]*white-space:\s*nowrap;[^}]*\}/;
        assertTrue(re.test(INDEX_SRC), 'базовое правило даты не тронуто');
    });
});

// ============================================================
// 2. SRC: _renderMonthEventsPanel — класс по состоянию И/ПЗ
// ============================================================
describe('Task 504 — SRC: класс даты по состоянию записи', () => {

    test('гвард И/ПЗ: только семейство «Инструктажи» (Task 482)', () => {
        const m = methodText(WS_SRC, '_renderMonthEventsPanel');
        assertTrue(m.length > 0, 'метод найден');
        assertTrue(m.indexOf("if (code === 'И' || code === 'ПЗ')") !== -1,
            'классы ставятся только записям И/ПЗ (ОБ/ПР/* — без)');
    });

    test('выполнение = 1 → ok (parseInt, семантика Task 418/482)', () => {
        const m = methodText(WS_SRC, '_renderMonthEventsPanel');
        assertTrue(m.indexOf("parseInt(tr['выполнение'], 10) === 1") !== -1,
            'отметка выполнения — parseInt === 1');
    });

    test('просрочен: поле сервера, фолбэк — дата_начала < todayIso', () => {
        const m = methodText(WS_SRC, '_renderMonthEventsPanel');
        assertTrue(m.indexOf("(tr['просрочен'] !== undefined)") !== -1 &&
                   m.indexOf("(parseInt(tr['просрочен'], 10) === 1)") !== -1,
            'поле «просрочен» сервера приоритетно');
        assertTrue(m.indexOf("!evDone &&") !== -1 &&
                   m.indexOf("String(tr['дата_начала'] || '') < todayIso") !== -1,
            'фолбэк: не выполнено и дата начала раньше «сегодня»');
    });

    test('ПРИОРИТЕТ: выполнение важнее просрочки', () => {
        const m = methodText(WS_SRC, '_renderMonthEventsPanel');
        assertTrue(m.indexOf("evDone\n                        ? ' ws-ep-date-ok'\n                        : (evLate ? ' ws-ep-date-bad' : '')") !== -1,
            'evDone ? ok : (evLate ? bad : \'\') — как Task 482');
    });

    test('класс вписан в ДАТУ (не в строку/текст)', () => {
        const m = methodText(WS_SRC, '_renderMonthEventsPanel');
        assertTrue(m.indexOf("'<b class=\"ws-ep-date' + dateCls + '\">'") !== -1,
            'b.ws-ep-date' + ' + dateCls — разметка даты');
        assertTrue(m.indexOf("'<span class=\"ws-ep-item' + pastCls + '\">'") !== -1,
            'строка по-прежнему несёт только pastCls (фон Task 380)');
    });

    test('СИЗ-строки месяца — БЕЗ элемента даты (Task 520)', () => {
        const m = methodText(WS_SRC, '_renderMonthEventsPanel');
        // Task 520: в строках секции месяца НЕТ даты «до …» вовсе
        // (формат: наименование · ФИО); dateCls мероприятий не задет
        assertFalse(m.indexOf("'<b class=\"ws-ep-date\">до ' +") !== -1,
            'даты СИЗ «до дд.мм» больше нет — строка без даты (Task 520)');
        assertFalse(m.indexOf("'СИЗ · ' + String") !== -1,
            'префикса «СИЗ · » в строках СИЗ больше нет (Task 520)');
        // НОВАЯ группа «Просроченная выдача СИЗ» (за всё время):
        // месяц.год окончания — КРАСНЫЙ ws-ep-date-bad (заявка
        // Task 520 — «месяц и год красного цвета»)
        assertTrue(m.indexOf("'<b class=\"ws-ep-date ws-ep-date-bad\">' +") !== -1,
            'дата «мм.гггг» группы просрочки — красная (Task 520)');
    });
});

// ============================================================
// 3. VM: рендер по данным — цвета по состоянию (динамич. даты)
// ============================================================
describe('Task 504 — VM: классы дат по состоянию записей', () => {

    const EMP = [{ 'таб_номер': '0871', 'ФИО': 'Иванов Иван Иванович' }];

    // Динамические даты ТЕКУЩЕГО месяца — инварианты верны при любой
    // дате запуска (приём test-task380.js)
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
    // дата строки: фрагмент после '<b class="ws-ep-date'
    function dateClsOf(row) {
        const m = row.match(/<b class="ws-ep-date([^"]*)">/);
        return m ? m[1].trim() : null;
    }

    test('выполненный И (дата в прошлом) — ЗЕЛЁНЫЙ, вопреки прошедшей дате', () => {
        const s = mStart < todayIso ? mStart : iso(Y, M, Math.max(1, NOW.getDate() - 1));
        const trs = [{ 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Охрана труда',
                       'дата_начала': s, 'выполнение': 1 }];
        const el = loadHost(trs);
        const rows = rowsOf(el);
        assertEqual(rows.length, 1, 'строка в окне');
        assertEqual(dateClsOf(rows[0]), 'ws-ep-date-ok',
            'выполнение=1 → зелёная дата (фолбэк просрочки не сработал)');
    });

    test('просроченный ПЗ (поле сервера «просрочен») — КРАСНЫЙ', () => {
        const trs = [{ 'таб_номер': '0871', 'тип': 'проверка_знаний', 'тема': 'КИП',
                       'дата_начала': mEnd, 'просрочен': 1 }];
        const el = loadHost(trs);
        const rows = rowsOf(el);
        assertEqual(rows.length, 1, 'строка в окне');
        assertEqual(dateClsOf(rows[0]), 'ws-ep-date-bad',
            'поле просрочен=1 → красная дата (дата будущая — поле приоритетно)');
    });

    test('И без полей с прошедшей датой — КРАСНЫЙ (фолбэк даты)', () => {
        // первый день месяца прошёл iff 1-е < сегодня — инвариант
        const trs = [{ 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Пожарная',
                       'дата_начала': mStart }];
        const el = loadHost(trs);
        const rows = rowsOf(el);
        assertEqual(rows.length, 1, 'строка в окне');
        const exp = mStart < todayIso ? 'ws-ep-date-bad' : '';
        assertEqual(dateClsOf(rows[0]), exp,
            'без полей: просрочка по дате (расчёт — ' + JSON.stringify(exp) + ')');
    });

    test('будущий ПЗ без отметки — БЕЗ класса (не просрочен)', () => {
        const trs = [{ 'таб_номер': '0871', 'тип': 'проверка_знаний', 'тема': 'Электро',
                       'дата_начала': mEnd }];
        const el = loadHost(trs);
        const rows = rowsOf(el);
        assertEqual(rows.length, 1, 'строка в окне');
        assertEqual(dateClsOf(rows[0]), '',
            'дата не наступила — обычный цвет даты');
    });

    test('выполнение ПРИОРИТЕТНЕЕ поля «просрочен» (1+1 → ЗЕЛЁНЫЙ)', () => {
        const trs = [{ 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Первая помощь',
                       'дата_начала': mStart, 'выполнение': 1, 'просрочен': 1 }];
        const el = loadHost(trs);
        const rows = rowsOf(el);
        assertEqual(dateClsOf(rows[0]), 'ws-ep-date-ok',
            'отметка выполнения перекрывает просрочку (как Task 482)');
    });

    test('ОБ/ПР — БЕЗ класса при ЛЮБЫХ полях состояния', () => {
        const trs = [
            { 'таб_номер': '0871', 'тип': 'обучение', 'тема': 'Курс',
              'дата_начала': mStart, 'выполнение': 1, 'просрочен': 1 },
            { 'таб_номер': '0871', 'тип': 'прогул', 'тема': 'Прогул',
              'дата_начала': mStart, 'выполнение': 1 }
        ];
        const el = loadHost(trs);
        const rows = rowsOf(el);
        assertEqual(rows.length, 2, 'обе строки в окне');
        assertEqual(dateClsOf(rows[0]), '', 'ОБ без класса (гвард И/ПЗ)');
        assertEqual(dateClsOf(rows[1]), '', 'ПР без класса (гвард И/ПЗ)');
    });

    test('выполнение=0 — НЕ зелёная (parseInt строг)', () => {
        const trs = [{ 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Вводный',
                       'дата_начала': mEnd, 'выполнение': 0, 'просрочен': 0 }];
        const el = loadHost(trs);
        const rows = rowsOf(el);
        assertEqual(dateClsOf(rows[0]), '',
            'выполнение=0/просрочен=0 при будущей дате — без класса');
    });

    test('РЕГРЕСС: фон строк ws-ep-past жив + структура сохранена', () => {
        // прошедшая запись без полей: дата красная, фон строки past
        const trs = [{ 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Прошедшее',
                       'дата_начала': mStart, 'дата_окончания': mStart }];
        const el = loadHost(trs);
        const rows = rowsOf(el);
        assertEqual(rows.length, 1, 'строка в окне');
        const expPast = mStart < todayIso;
        assertEqual(rows[0].indexOf('ws-ep-past') !== -1, expPast,
            'фон строки по-прежнему считается (Task 380)');
        assertTrue(rows[0].indexOf('ws-ep-dot') !== -1 &&
                   rows[0].indexOf('ws-ep-text') !== -1,
            'структура строки: точка + дата + текст (Task 315)');
    });

    test('СИЗ-строка — дата «до …» без класса', () => {
        // СИЗ с истекающим сроком в текущем месяце — всегда видна
        const el = loadHost([]);
        // окно пустое (нет мероприятий), но СИЗ нет в _PPE хоста —
        // секция не рендерится; проверяем СИЗ-паттерн в SRC (см. блок 2)
        assertTrue(el.innerHTML.indexOf('ws-ep-date-ok') === -1 &&
                   el.innerHTML.indexOf('ws-ep-date-bad') === -1,
            'пустое окно без классов дат');
    });
});

// ============================================================
// 4. SW и двойной бамп
// ============================================================
describe('Task 504 — SW и двойной бамп', () => {

    test('SW: kipia-test-v750', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v750'") !== -1,
            'версия кэша kipia-test-v750');
        assertFalse(SW_SRC.indexOf('kipia-test-v751') !== -1,
            'двойного бампа нет');
    });
});
