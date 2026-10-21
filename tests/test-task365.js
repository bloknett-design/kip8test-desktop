// tests/test-task365.js
// Task 365: расходомеры хозрасчётные — заявка пользователя
// (с поправкой):
//   1) «В разделе Расходомеры хозрасчётные, в Хозрасчёте №12 период
//      указан еженедельно, но фактически нужно ежедневно, в
//      соответствии с формой ввода данных» — период №12
//      нормализуется на клиенте (_normalizeMeters во всех трёх
//      точках наполнения _METERS: fallback-json / кэш / сервер);
//      fallback data/flowmeters.json тоже поправлен;
//   2) «красным должно быть с шести утра новых суток от суток ввода
//      данных, пока не введут новые данные, а не ровно час» —
//      поведение Task 357 подтверждено поправкой: красный «Ежедневно»
//      стартует в 6:00 СЛЕДУЮЩИХ суток и ДЕРЖИТСЯ до ввода новых
//      данных; часового окна 6:00–7:00 НЕТ.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. _normalizeMeters (VM): №12 «Еженедельно»/«Ежемесячно»/пусто →
//      «Ежедневно»; идемпотентность; другие расходомеры не тронуты;
//      не-массив и null-элементы не роняют.
//   B. Персистентность красного (поправка, VM _isOverdue): данные
//      введены 10.09 за 9/9 — зелёный до 6:00 11.09; красный с
//      6:00 11.09; красный В 7:00/7:01/12:00/23:59 (час НЕ гасит);
//      красный днями спустя; зелёный только с новыми данными
//      (9/10) — в любой момент ввода; следующий цикл — снова
//      красный в 6:00 12.09.
//   C. Интеграция №12: «Еженедельно» из таблицы + вчерашние данные —
//      недельная логика была бы зелёной, суточная (после
//      нормализации) — красной на следующее утро.
//   D. SRC: точки применения нормализации (fallback/кэш/сервер),
//      маркеры поправки в комментариях _isOverdue и CSS,
//      data/flowmeters.json (№12 «Ежедневно», №3/№11 не тронуты),
//      SW v594 (guard v595).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const FLOW_JSON = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'flowmeters.json'), 'utf8'));

// ============================================================
// Извлечение методов из FlowmeterData (балансировка скобок)
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

let Mixin = null;
try {
    const parts = ['_isOverdue', '_parseMdy', '_dayKey', '_mondayOf', '_recordCoversPeriod', '_normalizeMeters']
        .map(n => extractMethod(INDEX_SRC, n))
        .filter(Boolean);
    if (parts.length === 6) {
        const ctx = {};
        vm.createContext(ctx);
        vm.runInContext('var Mixin = { ' + parts.join(',') + ' };', ctx);
        Mixin = ctx.Mixin;
    }
} catch (e) { /* методы не извлеклись — тесты ниже упадут с причиной */ }

// ============================================================
// A. _normalizeMeters — период №12 «Ежедневно»
// ============================================================
describe('Task 365 — _normalizeMeters: №12 → «Ежедневно»', () => {

    test('Методы извлечены из FlowmeterData', () => {
        assertTrue(Mixin !== null && typeof Mixin._normalizeMeters === 'function',
            '_normalizeMeters извлечён из index.html');
        assertTrue(typeof Mixin._isOverdue === 'function', '_isOverdue извлечён');
    });

    test('№12 «Еженедельно» (как в таблице) → «Ежедневно»', () => {
        const arr = Mixin._normalizeMeters([{ id: 12, period: 'Еженедельно' }]);
        assertEqual(arr[0].period, 'Ежедневно', 'период №12 нормализован');
    });

    test('№12 «Ежемесячно» / пусто → «Ежедневно» (любой мусор из таблицы)', () => {
        assertEqual(Mixin._normalizeMeters([{ id: 12, period: 'Ежемесячно' }])[0].period, 'Ежедневно', 'месячный → суточный');
        assertEqual(Mixin._normalizeMeters([{ id: 12, period: '' }])[0].period, 'Ежедневно', 'пустой → суточный');
        assertEqual(Mixin._normalizeMeters([{ id: 12 }])[0].period, 'Ежедневно', 'без периода → суточный');
    });

    test('Идемпотентность: «Ежедневно» остаётся «Ежедневно»', () => {
        const arr = Mixin._normalizeMeters([{ id: 12, period: 'Ежедневно' }, { id: 12, period: 'Ежедневно' }]);
        assertEqual(arr[0].period, 'Ежедневно', 'повторная нормализация ничего не ломает');
        assertEqual(arr[1].period, 'Ежедневно', 'и второй раз');
    });

    test('Другие расходомеры не тронуты (№3/№11 недельные, №9 месячный, №1)', () => {
        const arr = Mixin._normalizeMeters([
            { id: 1, period: 'Ежедневно' },
            { id: 3, period: 'Еженедельно' },
            { id: 9, period: 'Ежемесячно' },
            { id: 11, period: 'Еженедельно' }
        ]);
        assertEqual(arr[0].period, 'Ежедневно', '№1 как был');
        assertEqual(arr[1].period, 'Еженедельно', '№3 недельный — не тронут');
        assertEqual(arr[2].period, 'Ежемесячно', '№9 месячный — не тронут');
        assertEqual(arr[3].period, 'Еженедельно', '№11 недельный — не тронут');
    });

    test('Не-массив возвращается как есть; null-элементы не роняют', () => {
        assertEqual(Mixin._normalizeMeters(null), null, 'null → null');
        assertEqual(Mixin._normalizeMeters('x'), 'x', 'строка → строка');
        const arr = Mixin._normalizeMeters([null, { id: 12, period: 'Еженедельно' }, undefined]);
        assertEqual(arr[0], null, 'null-элемент сохранён');
        assertEqual(arr[1].period, 'Ежедневно', '№12 среди мусора нормализован');
        assertEqual(arr[2], undefined, 'undefined сохранён');
    });
});

// ============================================================
// B. Персистентность красного — поправка заявки «НЕ ровно час»
// Сценарий: показания введены 10.09.2026 (чт) за 9/9 (вчера).
// ============================================================
describe('Task 365 — поправка: красный с 6:00 новых суток ДО новых данных (не час)', () => {

    test('10.09 23:59 — ЗЕЛЁНЫЙ (до 6:00 следующих суток)', () => {
        assertFalse(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/9/2026' }, new Date(2026, 8, 10, 23, 59)),
            'введено сегодня за вчера — зелёный до утра');
    });

    test('11.09 5:59 — ЗЕЛЁНЫЙ (последние минуты до границы)', () => {
        assertFalse(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/9/2026' }, new Date(2026, 8, 11, 5, 59)),
            'цикл 10.09 ещё действует');
    });

    test('11.09 6:00 — КРАСНЫЙ (старт: новые сутки от суток ввода)', () => {
        assertTrue(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/9/2026' }, new Date(2026, 8, 11, 6, 0)),
            'ровно в 6:00 новых суток — пора вводить');
    });

    test('11.09 6:59 — КРАСНЫЙ (внутри «часа» — тоже красный)', () => {
        assertTrue(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/9/2026' }, new Date(2026, 8, 11, 6, 59)),
            'внутри часа 6:00–7:00 красный');
    });

    test('11.09 7:00 — КРАСНЫЙ (час кончился, НЕ гаснет — поправка!)', () => {
        assertTrue(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/9/2026' }, new Date(2026, 8, 11, 7, 0)),
            'часовое окно 6:00–7:00 НЕ существует');
    });

    test('11.09 7:01 / 12:00 / 23:59 — КРАСНЫЙ весь день', () => {
        assertTrue(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/9/2026' }, new Date(2026, 8, 11, 7, 1)), '7:01');
        assertTrue(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/9/2026' }, new Date(2026, 8, 11, 12, 0)), 'полдень');
        assertTrue(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/9/2026' }, new Date(2026, 8, 11, 23, 59)), 'почти полночь');
    });

    test('12.09 6:00 и 15.09 — КРАСНЫЙ днями спустя (пока нет данных)', () => {
        assertTrue(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/9/2026' }, new Date(2026, 8, 12, 6, 0)),
            'следующие сутки — всё ещё красный');
        assertTrue(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/9/2026' }, new Date(2026, 8, 15, 9, 0)),
            'через несколько дней — всё ещё красный');
    });

    test('Ввод новых данных 11.09 7:30 (за 9/10) — сразу ЗЕЛЁНЫЙ', () => {
        assertFalse(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/10/2026' }, new Date(2026, 8, 11, 7, 30)),
            'новые показания — зелёный немедленно');
    });

    test('После ввода за 9/10: 12.09 5:59 ЗЕЛЁНЫЙ, 12.09 6:00 КРАСНЫЙ (новый цикл)', () => {
        assertFalse(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/10/2026' }, new Date(2026, 8, 12, 5, 59)),
            'зелёный до 6:00 следующих суток после ввода');
        assertTrue(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/10/2026' }, new Date(2026, 8, 12, 6, 0)),
            'в 6:00 следующих суток — снова красный');
    });

    test('Ввод поздно вечером 11.09 22:00 за 9/10 — ЗЕЛЁНЫЙ сразу', () => {
        assertFalse(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/10/2026' }, new Date(2026, 8, 11, 22, 0)),
            'вечерний ввод тоже закрывает цикл');
    });
});

// ============================================================
// C. Интеграция №12: недельная запись из таблицы + суточная логика
// ============================================================
describe('Task 365 — №12: нормализация меняет цвет на суточный ритм', () => {

    test('Без нормализации недельная логика дала бы КРАСНЫЙ (Task 368: закрытая неделя)', () => {
        // 11.09.2026 — пятница; данные 9/9 (точка) не накрывают
        // закрытую неделю 31.08–06.09 — «пора вводить»
        assertTrue(Mixin._isOverdue({ period: 'Еженедельно', dateCurr: '9/9/2026' }, new Date(2026, 8, 11, 7, 0)),
            'недельный ритм Task 368: закрытая неделя без данных');
    });

    test('После нормализации №12 — КРАСНЫЙ в 6:00 следующих суток', () => {
        const meters = Mixin._normalizeMeters([{ id: 12, period: 'Еженедельно', dateCurr: '9/9/2026' }]);
        assertEqual(meters[0].period, 'Ежедневно', 'период нормализован');
        assertTrue(Mixin._isOverdue(meters[0], new Date(2026, 8, 11, 6, 0)),
            'суточный ритм: красный на следующее утро');
        assertTrue(Mixin._isOverdue(meters[0], new Date(2026, 8, 11, 7, 0)),
            'и держится (не час)');
    });

    test('№12 нормализованный со вчерашними данными — ЗЕЛЁНЫЙ сегодня', () => {
        const meters = Mixin._normalizeMeters([{ id: 12, period: 'Еженедельно', dateCurr: '9/9/2026' }]);
        assertFalse(Mixin._isOverdue(meters[0], new Date(2026, 8, 10, 12, 0)),
            'введено сегодня за вчера — зелёный');
    });

    test('№3 (настоящий недельный) НЕ нормализуется — недельный ритм жив (Task 368)', () => {
        const meters = Mixin._normalizeMeters([{ id: 3, period: 'Еженедельно', datePrev: '8/31/2026', dateCurr: '9/6/2026' }]);
        assertEqual(meters[0].period, 'Еженедельно', 'период не нормализован');
        assertFalse(Mixin._isOverdue(meters[0], new Date(2026, 8, 11, 7, 0)),
            'данные накрывают закрытую неделю 31.08–06.09 — зелёный');
    });
});

// ============================================================
// D. SRC: точки применения, комментарии, JSON, SW
// ============================================================
describe('Task 365 — клиент: нормализация во всех источниках данных', () => {

    test('_normalizeMeters определён в FlowmeterData', () => {
        assertTrue(INDEX_SRC.indexOf('_normalizeMeters: function(meters)') !== -1,
            'метод определён');
    });

    test('load(): серверные данные нормализуются (flowmeter.list)', () => {
        assertTrue(INDEX_SRC.indexOf(
            'self._METERS = self._normalizeMeters(data.meters);\n                    self._loaded = true;'
        ) !== -1, 'точка применения в load()');
    });

    test('_loadFallback(): fallback-json нормализуется', () => {
        assertTrue(INDEX_SRC.indexOf(
            'self._METERS = self._normalizeMeters(data.meters);\n                            }'
        ) !== -1, 'точка применения в _loadFallback()');
    });

    test('_restoreCache(): кэш localStorage нормализуется', () => {
        assertTrue(INDEX_SRC.indexOf(
            'this._METERS = this._normalizeMeters(cached.meters);'
        ) !== -1, 'точка применения в _restoreCache()');
    });

    test('Всего применений нормализации — 3 (fallback + кэш + сервер)', () => {
        assertEqual(INDEX_SRC.split('self._normalizeMeters(data.meters)').length - 1, 2,
            'две точки с data.meters (fallback и сервер)');
        assertEqual(INDEX_SRC.split('this._normalizeMeters(cached.meters)').length - 1, 1,
            'одна точка с cached.meters (кэш)');
    });

    test('Комментарий _isOverdue несёт поправку Task 365 (не час)', () => {
        const i = INDEX_SRC.indexOf('Task 365 (поправка заявки): красный «Ежедневно»');
        assertTrue(i !== -1, 'маркер поправки в блоке _isOverdue');
        const chunk = INDEX_SRC.slice(i, i + 500);
        assertTrue(chunk.indexOf('часового окна 6:00–7:00 НЕТ') !== -1,
            'явно указано: часового окна нет');
    });

    test('Комментарий CSS .flow-summary-val-due несёт поправку Task 365', () => {
        const i = INDEX_SRC.indexOf('Task 365 (поправка заявки): красный — НЕ час');
        assertTrue(i !== -1, 'маркер поправки в CSS-комментарии');
    });

    test('Заявка №12 процитирована в комментарии нормализации', () => {
        const i = INDEX_SRC.indexOf('Task 365: нормализация периода расходомеров на клиенте');
        assertTrue(i !== -1, 'блок комментария нормализации на месте');
        const chunk = INDEX_SRC.slice(i, i + 400);
        assertTrue(chunk.indexOf('в Хозрасчёте №12 период указан еженедельно') !== -1,
            'заявка процитирована');
    });
});

describe('Task 365 — data/flowmeters.json: №12 «Ежедневно»', () => {

    test('№12: period = «Ежедневно»', () => {
        const m12 = FLOW_JSON.meters.find(m => m.id === 12);
        assertTrue(!!m12, 'расходомер №12 есть в fallback');
        assertEqual(m12.period, 'Ежедневно', 'период №12 в fallback-json');
    });

    test('№3 и №11 остаются «Еженедельно», №9 — «Ежемесячно»', () => {
        const m3 = FLOW_JSON.meters.find(m => m.id === 3);
        const m11 = FLOW_JSON.meters.find(m => m.id === 11);
        const m9 = FLOW_JSON.meters.find(m => m.id === 9);
        assertEqual(m3.period, 'Еженедельно', '№3 не тронут');
        assertEqual(m11.period, 'Еженедельно', '№11 не тронут');
        assertEqual(m9.period, 'Ежемесячно', '№9 не тронут');
    });
});

describe('Task 365 — SW кэш', () => {

    test('SW: CACHE_VERSION = kipia-test-v753', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v753'") !== -1,
            'версия кэша поднята до v594');
    });

    test('SW: нет v593 (старая) и нет v595 (двойной бамп)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v593') === -1, 'старая версия не осталась');
        assertTrue(SW_SRC.indexOf('kipia-test-v754') === -1, 'двойного бампа не было');
    });
});
