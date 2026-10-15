// tests/test-task357.js
// Task 357: расходомеры хозрасчётные — заявка:
//   1) в форме ввода показаний поле «Дата за предыдущие сутки» по
//      умолчанию содержит дату ПРЕДЫДУЩИХ СУТОК (если пользователь
//      забудет выбрать дату — при сохранении введённых данных
//      сохранится дата предыдущих суток); при редактировании —
//      предзаполнение СУЩЕСТВУЮЩЕЙ датой записи (правка больше не
//      сдвигает дату показаний на «сегодня»);
//   2) цвет шрифта показаний в списке карточек расходомеров:
//      зелёный → КРАСНЫЙ, когда «пора вводить новые данные»:
//        «Ежедневно»   — с 6:00 нет данных за предыдущие сутки;
//                        после ввода и сохранения — зелёный до 6:00
//                        следующих суток;
//        «Еженедельно» / «Ежемесячно» (Task 368): показания вводятся
//                        за период двух дат; зелёный — период данных
//                        накрывает последнюю ЗАКРЫТУЮ неделю (пн–вс) /
//                        месяц; красный — закрытый период без данных.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. Логика _isOverdue (VM: методы извлечены из FlowmeterData):
//      ежедневно (граница 6:00, до/после, ровно 6:00, переходы
//      месяца/года, ранний ввод до 6:00, будущее, нет данных),
//      еженедельно (пн–вс, граница понедельника, переход года),
//      ежемесячно (граница 1-го числа, переход года), неизвестный
//      период — как ежедневный.
//   B. Хелперы: _parseMdy (валид/пусто/мусор), _dayKey, _mondayOf
//      (чт/вс/пн, воскресенье той же недели).
//   C. Форма ввода (VM + моки DOM + фиксированные «сейчас»):
//      дефолт нового ввода — предыдущие сутки; редактирование —
//      существующая дата записи; битая дата записи — откат на вчера.
//   D. Клиент (SRC): класс flow-summary-val-due в renderList, CSS
//      тёмная/светлая тема, таймер _startOverdueTimer (раз в минуту,
//      guard от повторного запуска, рендер только при открытом
//      разделе), сигнатура _calcOverdueSig в renderList, fallback
//      submitInput «вчера», старые дефолты «сегодня» удалены, init
//      запускает таймер; SW → v583 (guard v584).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ============================================================
// Извлечение метода из объекта FlowmeterData (балансировка скобок)
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

// A+B: методы логики «пора вводить» (без DOM — только вычисления)
let Mixin = null;
try {
    const parts = ['_isOverdue', '_parseMdy', '_dayKey', '_mondayOf', '_recordCoversPeriod']
        .map(n => extractMethod(INDEX_SRC, n))
        .filter(Boolean);
    if (parts.length === 5) {
        const ctx = {};
        vm.createContext(ctx);
        vm.runInContext('var Mixin = { ' + parts.join(',') + ' };', ctx);
        Mixin = ctx.Mixin;
    }
} catch (e) { /* методы не извлеклись — тесты ниже упадут с причиной */ }

// C: метод формы ввода + моки DOM + фиксированное «сейчас»
// (10.09.2026 07:30, четверг, после 6:00)
const RealDate = Date;
const FIXED_NOW = new RealDate(2026, 8, 10, 7, 30);
function FakeDate(y, m, d, h, mi, s) {
    if (y === undefined) return FIXED_NOW;             // new Date() → фиксированное «сейчас»
    return new RealDate(y, m, d, h || 0, mi || 0, s || 0);
}

function flowDateToInputValMock(d) {
    if (!d || !(d instanceof RealDate) || isNaN(d.getTime())) return '';
    const m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

let Sheet = null;
let sheetEls = null;
try {
    const applySrc = extractMethod(INDEX_SRC, '_applyEntryTypeFields');
    if (applySrc) {
        sheetEls = {
            flowInputDate:        { value: '' },
            flowInputDateEnd:     { value: '' },
            flowInputDateLabel:   { textContent: '' },
            flowInputDateEndLabel:{ textContent: '' },
            flowInputDateEndGroup:{ style: {} },
            flowInputTitle:       { textContent: '' },
            flowInputField:       { placeholder: '' }
        };
        const ctx = {
            Date: FakeDate,
            document: { getElementById: id => sheetEls[id] || null },
            flowDateToInputVal: flowDateToInputValMock,
            flowPrevMonthRange: () => ({ start: new RealDate(2026, 7, 1), end: new RealDate(2026, 7, 31) }),
            flowEntryTypeAcc: t => t
        };
        vm.createContext(ctx);
        vm.runInContext(
            'var Sheet = { ' + applySrc + ',' +
            ' _isDailyMode: function(m) { return !!(m && m.id === 1); },' +
            // Task 368: реальные классификаторы периода — ветка показаний
            // за период в _applyEntryTypeFields (для суточных меток §C
            // возвращают false, ветка пропускается)
            " _isWeeklyMeter: function(m) { return !this._isDailyMode(m) && /недел|еженед/.test(String((m && m.period) || '').toLowerCase()); }," +
            " _isMonthlyMeter: function(m) { return !this._isDailyMode(m) && /месяц|месяч|ежемес/.test(String((m && m.period) || '').toLowerCase()); }," +
            (extractMethod(INDEX_SRC, '_parseMdy') || '_parseMdy: function(s) { return null; }') + ',' +
            " _inputEntryType: 'сутки' };",
            ctx);
        Sheet = ctx.Sheet;
    }
} catch (e) { /* метод не извлёкся — тесты ниже упадут с причиной */ }

// ============================================================
// A. _isOverdue — «Ежедневно» (граница 6:00)
// ============================================================
describe('Task 357 — _isOverdue: «Ежедневно» (граница 6:00)', () => {

    test('Методы извлечены из FlowmeterData', () => {
        assertTrue(Mixin !== null && typeof Mixin._isOverdue === 'function',
            '_isOverdue извлечён из index.html');
        assertTrue(typeof Mixin._parseMdy === 'function', '_parseMdy извлечён');
    });

    test('07:00, данные за вчера (9/9) → ЗЕЛЁНЫЙ', () => {
        const r = Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/9/2026' }, new Date(2026, 8, 10, 7, 0));
        assertFalse(r, 'данные за предыдущие сутки введены — не пора');
    });

    test('07:00, данные за позавчера (9/8) → КРАСНЫЙ (за 9/9 нет)', () => {
        const r = Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/8/2026' }, new Date(2026, 8, 10, 7, 0));
        assertTrue(r, 'пора вводить данные за 9/9');
    });

    test('05:59 (до 6:00), данные за 9/8 → ЗЕЛЁНЫЙ (цикл прошлых суток)', () => {
        const r = Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/8/2026' }, new Date(2026, 8, 10, 5, 59));
        assertFalse(r, 'до 6:00 ожидается 9/8 — данные есть');
    });

    test('05:59 (до 6:00), данные за 9/7 → КРАСНЫЙ', () => {
        const r = Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/7/2026' }, new Date(2026, 8, 10, 5, 59));
        assertTrue(r, 'до 6:00 ожидается 9/8 — данных нет');
    });

    test('Ровно 6:00 — граница цикла (9/9 → зелёный, 9/8 → красный)', () => {
        const g = Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/9/2026' }, new Date(2026, 8, 10, 6, 0));
        assertFalse(g, 'ровно в 6:00 данные за 9/9 уже закрывают цикл');
        const r = Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/8/2026' }, new Date(2026, 8, 10, 6, 0));
        assertTrue(r, 'ровно в 6:00 пора вводить за 9/9');
    });

    test('Зелёный ДО 6:00 следующих суток после ввода (05:00 на 11.09, данные 9/9)', () => {
        const r = Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/9/2026' }, new Date(2026, 8, 11, 5, 0));
        assertFalse(r, 'введены 10.09 за 9/9 — зелёный до 6:00 11.09');
    });

    test('6:00 следующих суток (11.09) — снова КРАСНЫЙ, данных за 9/10 нет', () => {
        const r = Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/9/2026' }, new Date(2026, 8, 11, 6, 0));
        assertTrue(r, 'наступил цикл 11.09 — пора вводить за 9/10');
    });

    test('Ранний ввод до 6:00 (03:00, данные за 9/9) — зелёный и после 6:00', () => {
        const r = Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/9/2026' }, new Date(2026, 8, 10, 3, 0));
        assertFalse(r, 'данные за «вчера» уже введены — не пора');
    });

    test('Переход месяца: 1 октября 07:00, данные 9/30 → зелёный; 9/29 → красный', () => {
        const g = Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/30/2026' }, new Date(2026, 9, 1, 7, 0));
        assertFalse(g, 'за 30.09 введены — не пора');
        const r = Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/29/2026' }, new Date(2026, 9, 1, 7, 0));
        assertTrue(r, 'за 30.09 данных нет — пора');
    });

    test('Переход года: 1 января 2027 07:00, данные 12/31/2026 → зелёный', () => {
        const r = Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '12/31/2026' }, new Date(2027, 0, 1, 7, 0));
        assertFalse(r, 'за 31.12 введены — не пора');
    });

    test('Нет данных (null / пусто / мусор) → КРАСНЫЙ', () => {
        assertTrue(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: null }, new Date(2026, 8, 10, 7, 0)),
            'null → пора');
        assertTrue(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '' }, new Date(2026, 8, 10, 7, 0)),
            'пусто → пора');
        assertTrue(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: 'мусор' }, new Date(2026, 8, 10, 7, 0)),
            'мусор → пора');
    });

    test('Дата «в будущем» (9/10 при «сейчас» 10.09 07:00) → зелёный', () => {
        const r = Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/10/2026' }, new Date(2026, 8, 10, 7, 0));
        assertFalse(r, 'данные свежее ожидаемых — не пора');
    });

    test('Неизвестный период — считается как ежедневный', () => {
        const r = Mixin._isOverdue({ period: '', dateCurr: '9/8/2026' }, new Date(2026, 8, 10, 7, 0));
        assertTrue(r, 'периода нет → ежедневная логика → пора');
    });
});

// ============================================================
// A. _isOverdue — «Еженедельно» (Task 368: ЗАКРЫТАЯ неделя пн–вс)
// ============================================================
describe('Task 357 — _isOverdue: «Еженедельно» (закрытая неделя, Task 368)', () => {
    // Task 368: ссылка — последняя ЗАКРЫТАЯ календарная неделя:
    // «сейчас» чт 10.09.2026 → закрытая 31.08–06.09;
    // «сейчас» пн 14.09.2026 → закрытая 07.09–13.09.

    test('Период данных = закрытая неделя (8/31–9/6), сейчас чт 10.09 → ЗЕЛЁНЫЙ', () => {
        const r = Mixin._isOverdue({ period: 'Еженедельно', datePrev: '8/31/2026', dateCurr: '9/6/2026' }, new Date(2026, 8, 10, 12, 0));
        assertFalse(r, 'данные за прошедшую неделю введены');
    });

    test('Закрытая неделя без данных (точка 8/24 — двухнедельной давности), чт 10.09 → КРАСНЫЙ', () => {
        const r = Mixin._isOverdue({ period: 'Еженедельно', dateCurr: '8/24/2026' }, new Date(2026, 8, 10, 12, 0));
        assertTrue(r, 'календарная неделя 31.08–06.09 прошла без данных');
    });

    test('Снова красный: данные 8/31–9/6, наступил пн 14.09 → КРАСНЫЙ (закрылась 07–13.09)', () => {
        const r = Mixin._isOverdue({ period: 'Еженедельно', datePrev: '8/31/2026', dateCurr: '9/6/2026' }, new Date(2026, 8, 14, 0, 30));
        assertTrue(r, 'новая неделя прошла — ждем данные за неё');
    });

    test('Ввели за закрывшуюся неделю (9/7–9/13), пн 14.09 12:00 → ЗЕЛЁНЫЙ', () => {
        const r = Mixin._isOverdue({ period: 'Еженедельно', datePrev: '9/7/2026', dateCurr: '9/13/2026' }, new Date(2026, 8, 14, 12, 0));
        assertFalse(r, 'пока следующая неделя не закрылась — зелёный');
    });

    test('Точечная запись внутри закрытой недели (9/9), пн 14.09 → ЗЕЛЁНЫЙ', () => {
        const r = Mixin._isOverdue({ period: 'Еженедельно', dateCurr: '9/9/2026' }, new Date(2026, 8, 14, 12, 0));
        assertFalse(r, 'показание снято в течение недели 07–13.09');
    });

    test('Ранний ввод текущей недели (точка 9/9), чт 10.09 → КРАСНЫЙ (закрытая 31.08–06.09 не накрыта)', () => {
        const r = Mixin._isOverdue({ period: 'Еженедельно', dateCurr: '9/9/2026' }, new Date(2026, 8, 10, 12, 0));
        assertTrue(r, 'данные нужны за ЗАКРЫТУЮ неделю');
    });

    test('Запись накрывает границу недель (8/31–9/8), чт 10.09 → ЗЕЛЁНЫЙ', () => {
        const r = Mixin._isOverdue({ period: 'Еженедельно', datePrev: '8/31/2026', dateCurr: '9/8/2026' }, new Date(2026, 8, 10, 12, 0));
        assertFalse(r, 'пересечения с закрытой неделей достаточно');
    });

    test('Переход года: пн 04.01.2027, данные 28.12.2026–03.01.2027 → ЗЕЛЁНЫЙ', () => {
        const r = Mixin._isOverdue({ period: 'Еженедельно', datePrev: '12/28/2026', dateCurr: '1/3/2027' }, new Date(2027, 0, 4, 10, 0));
        assertFalse(r, 'закрытая неделя накрыта через границу года');
    });

    test('Переход года: пн 04.01.2027, точка 27.12.2026 → КРАСНЫЙ', () => {
        const r = Mixin._isOverdue({ period: 'Еженедельно', dateCurr: '12/27/2026' }, new Date(2027, 0, 4, 10, 0));
        assertTrue(r, 'данные старше закрытой недели 28.12–03.01');
    });

    test('Нет данных → КРАСНЫЙ', () => {
        assertTrue(Mixin._isOverdue({ period: 'Еженедельно', dateCurr: null }, new Date(2026, 8, 10, 12, 0)),
            'нет данных — пора');
    });
});

// ============================================================
// A. _isOverdue — «Ежемесячно» (Task 368: ЗАКРЫТЫЙ месяц)
// ============================================================
describe('Task 357 — _isOverdue: «Ежемесячно» (закрытый месяц, Task 368)', () => {
    // Task 368: ссылка — последний ЗАКРЫТЫЙ календарный месяц:
    // «сейчас» сентябрь → закрытый август; «сейчас» октябрь → сентябрь.

    test('Период данных = прошлый месяц (8/1–8/31), сейчас 10.09 → ЗЕЛЁНЫЙ', () => {
        const r = Mixin._isOverdue({ period: 'Ежемесячно', datePrev: '8/1/2026', dateCurr: '8/31/2026' }, new Date(2026, 8, 10, 12, 0));
        assertFalse(r, 'данные за закрытый месяц введены');
    });

    test('Закрытый месяц без данных (точка 7/20), сейчас сентябрь → КРАСНЫЙ', () => {
        const r = Mixin._isOverdue({ period: 'Ежемесячно', dateCurr: '7/20/2026' }, new Date(2026, 8, 10, 12, 0));
        assertTrue(r, 'календарный месяц прошёл — пора вводить');
    });

    test('Граница: 30 сент 23:59 (данные 8/1–8/31) — ЗЕЛЁНЫЙ', () => {
        const r = Mixin._isOverdue({ period: 'Ежемесячно', datePrev: '8/1/2026', dateCurr: '8/31/2026' }, new Date(2026, 8, 30, 23, 59));
        assertFalse(r, 'сентябрь ещё не закрыт — август накрыт');
    });

    test('Граница: 1 окт 00:05 (данные 8/1–8/31) — КРАСНЫЙ (сентябрь закрылся)', () => {
        const r = Mixin._isOverdue({ period: 'Ежемесячно', datePrev: '8/1/2026', dateCurr: '8/31/2026' }, new Date(2026, 9, 1, 0, 5));
        assertTrue(r, 'текущий месяц прошёл — ждем данные за его период');
    });

    test('Ввели за закрывшийся месяц (9/1–9/30), октябрь → ЗЕЛЁНЫЙ', () => {
        const r = Mixin._isOverdue({ period: 'Ежемесячно', datePrev: '9/1/2026', dateCurr: '9/30/2026' }, new Date(2026, 9, 15, 10, 0));
        assertFalse(r, 'пока следующий месяц не закрылся — зелёный');
    });

    test('Точечная запись внутри закрытого месяца (8/20), сентябрь → ЗЕЛЁНЫЙ', () => {
        const r = Mixin._isOverdue({ period: 'Ежемесячно', dateCurr: '8/20/2026' }, new Date(2026, 8, 16, 10, 0));
        assertFalse(r, 'показание снято в течение августа');
    });

    test('Переход года: январь 2027, данные 12/1–12/31 → ЗЕЛЁНЫЙ; точка 11/15 → КРАСНЫЙ', () => {
        const g = Mixin._isOverdue({ period: 'Ежемесячно', datePrev: '12/1/2026', dateCurr: '12/31/2026' }, new Date(2027, 0, 10, 10, 0));
        assertFalse(g, 'закрытый декабрь накрыт через границу года');
        const r = Mixin._isOverdue({ period: 'Ежемесячно', dateCurr: '11/15/2026' }, new Date(2027, 0, 10, 10, 0));
        assertTrue(r, 'декабрь без данных');
    });

    test('Нет данных → КРАСНЫЙ', () => {
        assertTrue(Mixin._isOverdue({ period: 'Ежемесячно', dateCurr: null }, new Date(2026, 8, 10, 12, 0)),
            'нет данных — пора');
    });
});

// ============================================================
// B. Хелперы _parseMdy / _dayKey / _mondayOf
// ============================================================
describe('Task 357 — хелперы дат', () => {

    test('_parseMdy: 8/19/2026 → 19 августа 2026 (локальная полночь)', () => {
        const d = Mixin._parseMdy('8/19/2026');
        assertTrue(d !== null, 'дата распознана');
        assertEqual(d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(), '2026-8-19', 'M/D/YYYY');
    });

    test('_parseMdy: пусто / мусор / неполное → null', () => {
        assertEqual(Mixin._parseMdy(null), null, 'null → null');
        assertEqual(Mixin._parseMdy(''), null, 'пусто → null');
        assertEqual(Mixin._parseMdy('мусор'), null, 'мусор → null');
        assertEqual(Mixin._parseMdy('9/2026'), null, '2 части → null');
    });

    test('_dayKey: 10.09.2026 → 20260910', () => {
        assertEqual(Mixin._dayKey(new Date(2026, 8, 10)), 20260910, 'YYYYMMDD числом');
        assertEqual(Mixin._dayKey(new Date(2026, 0, 1)), 20260101, '1 января');
    });

    test('_mondayOf: четверг 10.09.2026 → пн 07.09.2026', () => {
        const m = Mixin._mondayOf(new Date(2026, 8, 10));
        assertEqual(m.getFullYear() + '-' + (m.getMonth() + 1) + '-' + m.getDate(), '2026-9-7', 'понедельник');
    });

    test('_mondayOf: вс 13.09 → пн 07.09 (та же неделя); пн 14.09 → сам себе', () => {
        const m1 = Mixin._mondayOf(new Date(2026, 8, 13));
        assertEqual(m1.getDate(), 7, 'воскресенье → понедельник той же недели');
        const m2 = Mixin._mondayOf(new Date(2026, 8, 14));
        assertEqual(m2.getDate(), 14, 'понедельник → сам понедельник');
    });
});

// ============================================================
// C. Форма ввода: дефолт даты «предыдущие сутки»
// ============================================================
describe('Task 357 — форма ввода: дефолт даты = предыдущие сутки', () => {

    test('_applyEntryTypeFields извлечён (моки DOM готовы)', () => {
        assertTrue(Sheet !== null && typeof Sheet._applyEntryTypeFields === 'function',
            '_applyEntryTypeFields извлечён из index.html');
    });

    test('Новый ввод (не №1): дефолт — ВЧЕРА (сейчас 10.09 → 2026-09-09)', () => {
        sheetEls.flowInputDate.value = '';
        Sheet._applyEntryTypeFields({ id: 2, dateCurr: '9/8/2026', period: 'Ежедневно' }, false);
        assertEqual(sheetEls.flowInputDate.value, '2026-09-09',
            'подпись «Дата за предыдущие сутки» совпадает со значением');
    });

    test('Новый ввод №1 (сутки): дефолт — тоже ВЧЕРА', () => {
        sheetEls.flowInputDate.value = '';
        Sheet._applyEntryTypeFields({ id: 1, dateCurr: '9/8/2026', period: 'Ежедневно' }, false);
        assertEqual(sheetEls.flowInputDate.value, '2026-09-09', 'суточный режим №1 — тоже вчера');
    });

    test('Редактирование: предзаполнение СУЩЕСТВУЮЩЕЙ датой записи (9/5)', () => {
        sheetEls.flowInputDate.value = '';
        Sheet._applyEntryTypeFields({ id: 2, dateCurr: '9/5/2026', period: 'Ежедневно' }, true);
        assertEqual(sheetEls.flowInputDate.value, '2026-09-05',
            'правка не сдвигает дату показаний на «сегодня»');
    });

    test('Редактирование с битой датой записи — откат на ВЧЕРА', () => {
        sheetEls.flowInputDate.value = '';
        Sheet._applyEntryTypeFields({ id: 2, dateCurr: 'мусор', period: 'Ежедневно' }, true);
        assertEqual(sheetEls.flowInputDate.value, '2026-09-09', 'битая дата → дефолт «вчера»');
    });

    test('Подпись поля возвращается к «Дата за предыдущие сутки»', () => {
        sheetEls.flowInputDateLabel.textContent = 'Период с';
        Sheet._applyEntryTypeFields({ id: 2, dateCurr: '9/8/2026', period: 'Ежедневно' }, false);
        assertEqual(sheetEls.flowInputDateLabel.textContent, 'Дата за предыдущие сутки', 'лейбл суточного ввода');
    });
});

// ============================================================
// D. SRC-ассерты: renderList, CSS, таймер, fallback, SW
// ============================================================
describe('Task 357 — клиент: красный класс в renderList + CSS', () => {

    test('renderList добавляет flow-summary-val-due по _isOverdue', () => {
        // Task 367: тернарник заменён цепочкой valCls — недоставленные
        // (pending) приоритетнее красного, класс due остался в else-if
        assertTrue(INDEX_SRC.indexOf(
            "else if (this._isOverdue(m, null)) valCls += ' flow-summary-val-due';"
            ) !== -1, 'классDue добавляется к значению показаний');
    });

    test('CSS: красный #e74c3c (тёмная) и #c0392b (светлая тема)', () => {
        // Task 359: цвета ЯРЧЕ (#ff5c47 / #e8230a) + шрифт крупнее
        // (18px/800) — точные новые значения проверяются в test-task359.js;
        // здесь — что старые приглушённые ушли:
        assertTrue(INDEX_SRC.indexOf('.flow-summary-val.flow-summary-val-due { color: #e74c3c; }') === -1,
            'старый тёмно-красный #e74c3c убран (Task 359: ярче)');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .flow-summary-val.flow-summary-val-due { color: #c0392b; }') === -1,
            'старый кирпичный #c0392b убран (Task 359: ярче)');
        assertTrue(INDEX_SRC.indexOf('.flow-summary-val.flow-summary-val-due {') !== -1,
            'CSS-правило due остаётся (блок, не однострочник)');
    });

    test('Зелёный базовый цвет показаний не тронут', () => {
        assertTrue(INDEX_SRC.indexOf('.flow-summary-val { font-size: 16px; font-weight: 700; color: #5ab870; }') !== -1,
            'зелёный #5ab870 остаётся базовым');
    });
});

describe('Task 357 — клиент: минутный таймер смены цвета', () => {

    test('_startOverdueTimer определён с guard от повторного запуска', () => {
        assertTrue(INDEX_SRC.indexOf('_startOverdueTimer: function()') !== -1,
            'метод таймера определён');
        assertTrue(INDEX_SRC.indexOf('if (this._overdueTimer) return;') !== -1,
            'guard: init() вызывается на каждый заход в раздел');
    });

    test('Интервал — 1 минута', () => {
        assertTrue(INDEX_SRC.indexOf('}, 60 * 1000);') !== -1,
            'setInterval(..., 60 * 1000)');
    });

    test('Перерисовка только при открытом разделе расходомеров', () => {
        assertTrue(INDEX_SRC.indexOf("var pg = document.getElementById('page-flowmeter-data');") !== -1,
            'проверка активной страницы');
        assertTrue(INDEX_SRC.indexOf("if (pg && pg.classList.contains('active')) self.renderList();") !== -1,
            'renderList только когда раздел открыт');
    });

    test('Сигнатура _calcOverdueSig синхронизируется в renderList', () => {
        assertTrue(INDEX_SRC.indexOf('this._overdueSig = this._calcOverdueSig();') !== -1,
            'renderList фиксирует сигнатуру состояний «пора вводить»');
    });

    test('init() запускает таймер', () => {
        assertTrue(INDEX_SRC.indexOf('this._startOverdueTimer();') !== -1,
            'вызов в init');
    });
});

describe('Task 357 — клиент: submitInput fallback «предыдущие сутки»', () => {

    test('Пустая дата сохраняется как ПРЕДЫДУЩИЕ сутки', () => {
        assertTrue(INDEX_SRC.indexOf('var prevDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);') !== -1,
            'prevDay = вчера');
        assertTrue(INDEX_SRC.indexOf("dateStr = (prevDay.getMonth() + 1) + '/' + prevDay.getDate() + '/' + prevDay.getFullYear();") !== -1,
            'dateStr из prevDay (M/D/YYYY)');
    });

    test('Старый дефолт «сегодня» удалён (поле и fallback)', () => {
        assertFalse(INDEX_SRC.indexOf('if (dateField) dateField.value = flowDateToInputVal(now);') !== -1,
            'старый предзаполнял «сегодня» удалён');
        assertFalse(INDEX_SRC.indexOf('используем сегодня') !== -1,
            'старый комментарий «используем сегодня» удалён');
        assertFalse(INDEX_SRC.indexOf('(now.getMonth() + 1) + \'/\' + now.getDate() + \'/\' + now.getFullYear()') !== -1,
            'конструкция «сегодня» в M/D/YYYY удалена');
    });

    test('Дефолт нового ввода — prefill «вчера»', () => {
        assertTrue(INDEX_SRC.indexOf('prefill = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);') !== -1,
            'prefill = предыдущие сутки');
    });

    test('Редактирование предзаполняется существующей датой записи', () => {
        assertTrue(INDEX_SRC.indexOf('if (isEdit && m && m.dateCurr) {') !== -1,
            'ветка isEdit → dateCurr записи');
    });
});

describe('Task 357 — SW кэш', () => {

    test('SW: CACHE_VERSION = kipia-test-v742', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v742'") !== -1,
            'версия кэша поднята до v583');
    });

    test('SW: нет v582 (старая) и нет v584 (двойной бамп)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v585') === -1, 'старая версия не осталась');
        assertTrue(SW_SRC.indexOf('kipia-test-v743') === -1, 'двойного бампа не было');
    });
});
