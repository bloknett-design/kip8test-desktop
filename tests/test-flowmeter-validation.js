// Тесты валидации показаний расходомера (Task 199).
//
// Проверяемые функции: flowValidateReading, _flowParseDate, _flowFmt,
// flowBuildAnomalyModalHtml. Это клиентское UX-зеркало серверной
// ValidationRules.compute.
//
// Покрытие правил (по решению пользователя — 9 правил Фазы 1, без #5 WRONG_METER):
//   • #12 SIGN_NEG        — hard-block (отрицательные значения prev/curr)
//   • #6  DATE_INCONSISTENT — hard-block (dateCurr < datePrev)
//   • #4→JUMP_NEGATIVE    — merged с #10 для не-конденсатных (consumption < 0)
//   • #3/#10 JUMP_HIGH     — consumption > max_cons × 3
//   • #10  JUMP_LOW        — 0 ≤ consumption < min_cons / 10
//   • #7   PERIOD_MISMATCH — daysBetween != expected_days (±tolerance)
//   • #8   TEMP_OUT_OF_RANGE — temp вне [temp_min, temp_max]
//   • #9   GCAL_RATIO     — для расходомеров пара: gcal/consumption вне [min, max]
//   • #11  DUPLICATE      — те же показания, что в последнем архиве,
//                            тем же автором, в течение 5 минут
//
// Стратегия: S1 (soft-confirm на клиенте + модалка) + запись в archive.Q
// (сервер делает независимо, клиент только для UX).

const { test, describe, assertEqual, assertTrue, assertFalse, assertDeepEqual } = require('./test-helpers.js');
const { extractFunctions } = require('./extract-functions.js');
const fns = extractFunctions();

// Эталонный расходомер (как в test-flowmeter-comment.js, плюс allowNegative)
function meter(opts) {
    return Object.assign({
        id: 1,
        hoz: 'Хозрасчёт №1',
        param: 'Расход пара в корпус 114',
        prev: 90.11, curr: 91.11, unit: 'т',
        datePrev: '8/20/2026', dateCurr: '8/20/2026',
        temp: null, gcal: 60.46, period: 'Ежедневно',
        modRole: 'Админ',
        modName: 'duty@plant.local',
        modDisplayName: 'duty@plant.local',
        modTimestamp: '2026-08-20T08:00:00.000Z',
        comment: '',
        allowNegative: ''  // Task 199: 'yes' для конденсатных, '' для остальных
    }, opts || {});
}

// Эталонные правила (как в flowmeter_validation_rules)
function rules(opts) {
    return Object.assign({
        meterId: 1,
        min_cons: 0.5,
        max_cons: 10.0,
        expected_days: 1,
        gcal_ratio_min: 0.40,
        gcal_ratio_max: 0.80,
        temp_min: 100,
        temp_max: 350
    }, opts || {});
}

// Эталонная последняя запись архива
function lastArchive(opts) {
    return Object.assign({
        prev: 90.11,
        curr: 91.11,
        modName: 'duty@plant.local',
        timestamp: new Date(Date.now() - 60000).toISOString()  // 1 минуту назад
    }, opts || {});
}

// Проверить, что в codes есть код (без детализации)
function hasCode(codes, code) {
    return codes.some(function(c) { return c.indexOf(code + ':') === 0 || c === code; });
}

describe('flowValidateReading — нет аномалий (счастливый путь)', () => {
    test('Нормальные показания, расход в норме — codes пустой', () => {
        var m = meter({ prev: 91.11, curr: 95.00, modName: 'duty@plant.local' });
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '8/26/2026', dateCurr: '8/27/2026', temp: 200, gcal: 2.4 };
        // lastArchive с разными значениями prev/curr — иначе DUPLICATE сработает
        var result = fns.flowValidateReading(m, p, rules(), lastArchive({ prev: 50.00, curr: 91.11 }));
        assertEqual(result.codes.length, 0);
        assertTrue(!result.hardBlock);
    });
    test('rules = null — пропускаются soft-confirm проверки, только hard-block', () => {
        var m = meter({ prev: 91.11, curr: 95.00, modName: 'x' });
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '8/26/2026', dateCurr: '8/27/2026', temp: 1500, gcal: 9999 };
        var result = fns.flowValidateReading(m, p, null, null);
        assertEqual(result.codes.length, 0);
        assertTrue(!result.hardBlock);
    });
});

describe('flowValidateReading — HARD-BLOCK #12 SIGN_NEG', () => {
    test('curr < 0 — hard-block SIGN_NEG', () => {
        var m = meter();
        var p = { id: 1, prev: 91.11, curr: -91.11, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules(), null);
        assertEqual(result.hardBlock.code, 'SIGN_NEG');
        assertTrue(hasCode(result.codes, 'SIGN_NEG'));
    });
    test('prev < 0 — hard-block SIGN_NEG', () => {
        var m = meter();
        var p = { id: 1, prev: -95.50, curr: 91.11, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules(), null);
        assertEqual(result.hardBlock.code, 'SIGN_NEG');
    });
    test('SIGN_NEG блокирует до проверки дат — codes не содержит DATE_INCONSISTENT', () => {
        var m = meter();
        var p = { id: 1, prev: -95.50, curr: -91.11, datePrev: '8/27/2026', dateCurr: '8/26/2026' };
        var result = fns.flowValidateReading(m, p, rules(), null);
        assertEqual(result.hardBlock.code, 'SIGN_NEG');
        assertFalse(hasCode(result.codes, 'DATE_INCONSISTENT'));
    });
});

describe('flowValidateReading — HARD-BLOCK #6 DATE_INCONSISTENT', () => {
    test('dateCurr < datePrev — hard-block', () => {
        var m = meter();
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '8/27/2026', dateCurr: '8/26/2026' };
        var result = fns.flowValidateReading(m, p, rules(), null);
        assertEqual(result.hardBlock.code, 'DATE_INCONSISTENT');
        assertTrue(hasCode(result.codes, 'DATE_INCONSISTENT'));
    });
    test('dateCurr === datePrev — НЕ hard-block (один день, валидно для «Ежедневно»)', () => {
        var m = meter();
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '8/26/2026', dateCurr: '8/26/2026' };
        var result = fns.flowValidateReading(m, p, rules(), null);
        assertTrue(!result.hardBlock);
    });
});

describe('flowValidateReading — #4→JUMP_NEGATIVE (merged)', () => {
    test('consumption < 0, allowNegative!=="yes" — JUMP_NEGATIVE', () => {
        var m = meter({ allowNegative: '', prev: 95.00, curr: 91.11 });
        var p = { id: 1, prev: 95.00, curr: 91.11, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules(), null);
        assertTrue(hasCode(result.codes, 'JUMP_NEGATIVE'));
        assertTrue(!result.hardBlock);
    });
    test('consumption < 0, allowNegative==="yes" — НЕ JUMP_NEGATIVE (конденсат)', () => {
        var m = meter({ allowNegative: 'yes', prev: 95.00, curr: 91.11 });
        var p = { id: 1, prev: 95.00, curr: 91.11, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules(), null);
        assertFalse(hasCode(result.codes, 'JUMP_NEGATIVE'));
    });
    test('consumption = 0 (не отрицательный) — НЕ JUMP_NEGATIVE', () => {
        var m = meter({ allowNegative: '', prev: 91.11, curr: 91.11 });
        var p = { id: 1, prev: 91.11, curr: 91.11, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules(), null);
        assertFalse(hasCode(result.codes, 'JUMP_NEGATIVE'));
    });
});

describe('flowValidateReading — #3/#10 JUMP_HIGH (×3 от max_cons)', () => {
    test('consumption = max × 4 — JUMP_HIGH', () => {
        var m = meter({ prev: 0, curr: 40.00 });  // max=10, ×4=40
        var p = { id: 1, prev: 0, curr: 40.00, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules({ max_cons: 10 }), null);
        assertTrue(hasCode(result.codes, 'JUMP_HIGH'));
    });
    test('consumption = max × 3 (порог) — НЕ JUMP_HIGH (строго больше)', () => {
        var m = meter({ prev: 0, curr: 30.00 });
        var p = { id: 1, prev: 0, curr: 30.00, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules({ max_cons: 10 }), null);
        assertFalse(hasCode(result.codes, 'JUMP_HIGH'));
    });
    test('consumption = max × 10 (EXTRA_DIGIT случай) — JUMP_HIGH с большим фактором', () => {
        var m = meter({ prev: 0, curr: 100.00 });
        var p = { id: 1, prev: 0, curr: 100.00, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules({ max_cons: 10 }), null);
        assertTrue(hasCode(result.codes, 'JUMP_HIGH'));
        assertTrue(result.codes[0].indexOf('10.00') !== -1 || result.codes[0].indexOf('100.00') !== -1);
    });
    test('max_cons = null — JUMP_HIGH не срабатывает', () => {
        var m = meter({ prev: 0, curr: 1000.00 });
        var p = { id: 1, prev: 0, curr: 1000.00, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules({ max_cons: null }), null);
        assertFalse(hasCode(result.codes, 'JUMP_HIGH'));
    });
});

describe('flowValidateReading — #10 JUMP_LOW (0 ≤ cons < min/10)', () => {
    test('consumption = 0.04 (min=0.5 → min/10=0.05) — JUMP_LOW', () => {
        var m = meter({ prev: 90.00, curr: 90.04 });
        var p = { id: 1, prev: 90.00, curr: 90.04, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules({ min_cons: 0.5 }), null);
        assertTrue(hasCode(result.codes, 'JUMP_LOW'));
    });
    test('consumption = 0.06 (выше порога min/10=0.05) — НЕ JUMP_LOW', () => {
        var m = meter({ prev: 90.00, curr: 90.06 });
        var p = { id: 1, prev: 90.00, curr: 90.06, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules({ min_cons: 0.5 }), null);
        assertFalse(hasCode(result.codes, 'JUMP_LOW'));
    });
    test('consumption < 0 (отрицательный) — НЕ JUMP_LOW (только JUMP_NEGATIVE)', () => {
        var m = meter({ allowNegative: '', prev: 95.00, curr: 90.00 });
        var p = { id: 1, prev: 95.00, curr: 90.00, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules({ min_cons: 0.5 }), null);
        assertFalse(hasCode(result.codes, 'JUMP_LOW'));
    });
});

describe('flowValidateReading — #7 PERIOD_MISMATCH', () => {
    test('expected_days=1, фактических 5 — PERIOD_MISMATCH', () => {
        var m = meter();
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '8/22/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules({ expected_days: 1 }), null);
        assertTrue(hasCode(result.codes, 'PERIOD_MISMATCH'));
    });
    test('expected_days=1, фактических 1 — НЕ PERIOD_MISMATCH', () => {
        var m = meter();
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules({ expected_days: 1 }), null);
        assertFalse(hasCode(result.codes, 'PERIOD_MISMATCH'));
    });
    test('expected_days=1, фактических 2 — НЕ PERIOD_MISMATCH (допуск ±1)', () => {
        var m = meter();
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '8/25/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules({ expected_days: 1 }), null);
        assertFalse(hasCode(result.codes, 'PERIOD_MISMATCH'));
    });
    test('expected_days=30 (месячный), фактических 35 — ПЕРИОД_MISMATCH', () => {
        var m = meter();
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '7/23/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules({ expected_days: 30 }), null);
        assertTrue(hasCode(result.codes, 'PERIOD_MISMATCH'));
    });
});

describe('flowValidateReading — #8 TEMP_OUT_OF_RANGE', () => {
    test('temp=400 (>350) — TEMP_OUT_OF_RANGE', () => {
        var m = meter();
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '8/26/2026', dateCurr: '8/27/2026', temp: 400 };
        var result = fns.flowValidateReading(m, p, rules({ temp_min: 100, temp_max: 350 }), null);
        assertTrue(hasCode(result.codes, 'TEMP_OUT_OF_RANGE'));
    });
    test('temp=50 (<100) — TEMP_OUT_OF_RANGE', () => {
        var m = meter();
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '8/26/2026', dateCurr: '8/27/2026', temp: 50 };
        var result = fns.flowValidateReading(m, p, rules({ temp_min: 100, temp_max: 350 }), null);
        assertTrue(hasCode(result.codes, 'TEMP_OUT_OF_RANGE'));
    });
    test('temp=200 (в диапазоне) — НЕ TEMP_OUT_OF_RANGE', () => {
        var m = meter();
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '8/26/2026', dateCurr: '8/27/2026', temp: 200 };
        var result = fns.flowValidateReading(m, p, rules({ temp_min: 100, temp_max: 350 }), null);
        assertFalse(hasCode(result.codes, 'TEMP_OUT_OF_RANGE'));
    });
    test('temp=null — пропускается проверка', () => {
        var m = meter();
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '8/26/2026', dateCurr: '8/27/2026', temp: null };
        var result = fns.flowValidateReading(m, p, rules({ temp_min: 100, temp_max: 350 }), null);
        assertFalse(hasCode(result.codes, 'TEMP_OUT_OF_RANGE'));
    });
});

describe('flowValidateReading — #9 GCAL_RATIO', () => {
    test('gcal/consumption=0.95 (>0.80) — GCAL_RATIO', () => {
        var m = meter({ prev: 0, curr: 100.00 });
        var p = { id: 1, prev: 0, curr: 100.00, datePrev: '8/26/2026', dateCurr: '8/27/2026', gcal: 95.0 };
        var result = fns.flowValidateReading(m, p, rules({ gcal_ratio_min: 0.40, gcal_ratio_max: 0.80 }), null);
        assertTrue(hasCode(result.codes, 'GCAL_RATIO'));
    });
    test('gcal/consumption=0.30 (<0.40) — GCAL_RATIO', () => {
        var m = meter({ prev: 0, curr: 100.00 });
        var p = { id: 1, prev: 0, curr: 100.00, datePrev: '8/26/2026', dateCurr: '8/27/2026', gcal: 30.0 };
        var result = fns.flowValidateReading(m, p, rules({ gcal_ratio_min: 0.40, gcal_ratio_max: 0.80 }), null);
        assertTrue(hasCode(result.codes, 'GCAL_RATIO'));
    });
    test('gcal/consumption=0.60 (в диапазоне) — НЕ GCAL_RATIO', () => {
        var m = meter({ prev: 0, curr: 100.00 });
        var p = { id: 1, prev: 0, curr: 100.00, datePrev: '8/26/2026', dateCurr: '8/27/2026', gcal: 60.0 };
        var result = fns.flowValidateReading(m, p, rules({ gcal_ratio_min: 0.40, gcal_ratio_max: 0.80 }), null);
        assertFalse(hasCode(result.codes, 'GCAL_RATIO'));
    });
    test('consumption=0 (деление на 0) — НЕ GCAL_RATIO', () => {
        var m = meter({ prev: 91.11, curr: 91.11 });
        var p = { id: 1, prev: 91.11, curr: 91.11, datePrev: '8/26/2026', dateCurr: '8/27/2026', gcal: 60.0 };
        var result = fns.flowValidateReading(m, p, rules({ gcal_ratio_min: 0.40, gcal_ratio_max: 0.80 }), null);
        assertFalse(hasCode(result.codes, 'GCAL_RATIO'));
    });
    test('gcal=null — НЕ GCAL_RATIO', () => {
        var m = meter({ prev: 0, curr: 100.00 });
        var p = { id: 1, prev: 0, curr: 100.00, datePrev: '8/26/2026', dateCurr: '8/27/2026', gcal: null };
        var result = fns.flowValidateReading(m, p, rules({ gcal_ratio_min: 0.40, gcal_ratio_max: 0.80 }), null);
        assertFalse(hasCode(result.codes, 'GCAL_RATIO'));
    });
});

describe('flowValidateReading — #11 DUPLICATE', () => {
    test('Те же prev/curr, тот же автор, < 5 минут — DUPLICATE', () => {
        var m = meter({ prev: 91.11, curr: 95.00, modName: 'duty@plant.local' });
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var la = lastArchive({ prev: 91.11, curr: 95.00, modName: 'duty@plant.local', timestamp: new Date(Date.now() - 60000).toISOString() });
        var result = fns.flowValidateReading(m, p, rules(), la);
        assertTrue(hasCode(result.codes, 'DUPLICATE'));
    });
    test('Те же prev/curr, но другой автор — НЕ DUPLICATE', () => {
        var m = meter({ prev: 91.11, curr: 95.00, modName: 'duty@plant.local' });
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var la = lastArchive({ prev: 91.11, curr: 95.00, modName: 'admin@plant.local', timestamp: new Date(Date.now() - 60000).toISOString() });
        var result = fns.flowValidateReading(m, p, rules(), la);
        assertFalse(hasCode(result.codes, 'DUPLICATE'));
    });
    test('Те же prev/curr, тот же автор, > 5 минут — НЕ DUPLICATE', () => {
        var m = meter({ prev: 91.11, curr: 95.00, modName: 'duty@plant.local' });
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var la = lastArchive({ prev: 91.11, curr: 95.00, modName: 'duty@plant.local', timestamp: new Date(Date.now() - 600000).toISOString() });  // 10 минут
        var result = fns.flowValidateReading(m, p, rules(), la);
        assertFalse(hasCode(result.codes, 'DUPLICATE'));
    });
    test('Разные prev/curr — НЕ DUPLICATE', () => {
        var m = meter({ prev: 91.11, curr: 95.00, modName: 'duty@plant.local' });
        var p = { id: 1, prev: 91.11, curr: 95.50, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var la = lastArchive({ prev: 91.11, curr: 95.00, modName: 'duty@plant.local', timestamp: new Date(Date.now() - 60000).toISOString() });
        var result = fns.flowValidateReading(m, p, rules(), la);
        assertFalse(hasCode(result.codes, 'DUPLICATE'));
    });
    test('lastArchive=null — НЕ DUPLICATE', () => {
        var m = meter({ prev: 91.11, curr: 95.00 });
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules(), null);
        assertFalse(hasCode(result.codes, 'DUPLICATE'));
    });
});

describe('flowValidateReading — несколько правил сразу', () => {
    test('JUMP_HIGH + PERIOD_MISMATCH вместе — оба в codes', () => {
        var m = meter({ prev: 0, curr: 50.00 });
        var p = { id: 1, prev: 0, curr: 50.00, datePrev: '8/20/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules({ max_cons: 10, expected_days: 1 }), null);
        assertTrue(hasCode(result.codes, 'JUMP_HIGH'));
        assertTrue(hasCode(result.codes, 'PERIOD_MISMATCH'));
    });
    test('TEMP_OUT_OF_RANGE + GCAL_RATIO вместе — оба в codes', () => {
        var m = meter({ prev: 0, curr: 100.00 });
        var p = { id: 1, prev: 0, curr: 100.00, datePrev: '8/26/2026', dateCurr: '8/27/2026', temp: 500, gcal: 95.0 };
        var result = fns.flowValidateReading(m, p, rules({ temp_min: 100, temp_max: 350, gcal_ratio_min: 0.40, gcal_ratio_max: 0.80 }), null);
        assertTrue(hasCode(result.codes, 'TEMP_OUT_OF_RANGE'));
        assertTrue(hasCode(result.codes, 'GCAL_RATIO'));
    });
});

// Эталонный recentAllMeters для WRONG_METER тестов (Task 200, Фаза 2)
function recentAll(opts) {
    // По умолчанию — массив из 2 других счётчиков с разными расходами
    return [
        { meterId: 2, hoz: 'Хозрасчёт №2', prev: 1000, curr: 1250, consumption: 250, modName: 'a@p', timestamp: new Date().toISOString() },
        { meterId: 4, hoz: 'Хозрасчёт №4', prev: 500, curr: 520, consumption: 20, modName: 'b@p', timestamp: new Date().toISOString() }
    ].concat(opts || []);
}

describe('flowValidateReading — #5 WRONG_METER (Task 200, Фаза 2)', () => {
    test('recentAllMeters = null → WRONG_METER не срабатывает (graceful)', () => {
        var m = meter({ prev: 0, curr: 50.00 });
        var p = { id: 1, prev: 0, curr: 50.00, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules({ max_cons: 100 }), null, null);
        assertFalse(hasCode(result.codes, 'WRONG_METER'));
    });

    test('recentAllMeters = [] (пустой массив) → WRONG_METER не срабатывает', () => {
        var m = meter({ prev: 0, curr: 50.00 });
        var p = { id: 1, prev: 0, curr: 50.00, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules({ max_cons: 100 }), null, []);
        assertFalse(hasCode(result.codes, 'WRONG_METER'));
    });

    test('Уровень 1 (exact-match): расход совпадает с другим счётчиком → WRONG_METER', () => {
        var m = meter({ id: 1, prev: 0, curr: 250.00 });
        var p = { id: 1, prev: 0, curr: 250.00, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        // meterId=2 имеет consumption=250 в recentAll — точное совпадение
        var result = fns.flowValidateReading(m, p, rules({ max_cons: 1000 }), null, recentAll());
        assertTrue(hasCode(result.codes, 'WRONG_METER'));
        // detail должен ссылаться на meterId=2
        var wmCode = result.codes.find(function(c) { return c.indexOf('WRONG_METER') === 0; });
        assertTrue(wmCode.indexOf('id=2') !== -1);
        assertTrue(wmCode.indexOf('Хозрасчёт №2') !== -1);
    });

    test('Уровень 1: расход чуть отличается (больше 0.01) → WRONG_METER не срабатывает', () => {
        var m = meter({ id: 1, prev: 0, curr: 250.05 });
        var p = { id: 1, prev: 0, curr: 250.05, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        // meterId=2 consumption=250, наш 250.05, разница 0.05 > 0.01
        var result = fns.flowValidateReading(m, p, rules({ max_cons: 1000 }), null, recentAll());
        assertFalse(hasCode(result.codes, 'WRONG_METER'));
    });

    test('Уровень 3 (swap): пара (prev, curr) совпадает с другим счётчиком → WRONG_METER', () => {
        // meterId=2 в recentAll имеет prev=1000, curr=1250. Вводим их в meterId=1.
        var m = meter({ id: 1, prev: 1000, curr: 1250, modName: 'c@p' });
        var p = { id: 1, prev: 1000, curr: 1250, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        // consumption = 250 — совпадает с meterId=2 consumption. Поэтому сработает
        // уровень 1 раньше уровня 3 — оба дают WRONG_METER, это OK.
        var result = fns.flowValidateReading(m, p, rules({ max_cons: 1000 }), null, recentAll());
        assertTrue(hasCode(result.codes, 'WRONG_METER'));
        var wmCode = result.codes.find(function(c) { return c.indexOf('WRONG_METER') === 0; });
        assertTrue(wmCode.indexOf('id=2') !== -1);
    });

    test('Уровень 3: пара (prev, curr) совпадает, но расход НЕ совпадает — swap', () => {
        // meterId=2 в recentAll: prev=1000, curr=1250, consumption=250.
        // Конструируем так, чтобы пара совпадала, но расход не был = 250.
        // Это возможно только если prev/curr — не числа (например, мы ввели 1000/1250
        // как чужую пару). consumption в этом случае = 250 (1250-1000), что совпадёт
        // с meterId=2 — уровень 1 сработает раньше. Чтобы проверить только swap,
        // надо чтобы consumption у meterId=2 был НЕ 250.
        var m = meter({ id: 1, prev: 1000, curr: 1250, modName: 'c@p' });
        var p = { id: 1, prev: 1000, curr: 1250, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        // Подменяем consumption meterId=2 на 999 (чтобы уровень 1 не сработал)
        var customRecent = [
            { meterId: 2, hoz: 'Хозрасчёт №2', prev: 1000, curr: 1250, consumption: 999, modName: 'a@p', timestamp: new Date().toISOString() }
        ];
        var result = fns.flowValidateReading(m, p, rules({ max_cons: 1000 }), null, customRecent);
        assertTrue(hasCode(result.codes, 'WRONG_METER'));
        var wmCode = result.codes.find(function(c) { return c.indexOf('WRONG_METER') === 0; });
        assertTrue(wmCode.indexOf('пара') !== -1);  // detail про «пара (prev=..., curr=...)»
    });

    test('Свой собственный meterId исключается — совпадение с собой не считается', () => {
        // meterId=1 в recentAll имеет consumption=250, наш расход=250.
        // Но это наш же счётчик — WRONG_METER не должен сработать.
        var m = meter({ id: 1, prev: 0, curr: 250.00 });
        var p = { id: 1, prev: 0, curr: 250.00, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        var recentWithSelf = recentAll([
            { meterId: 1, hoz: 'Хозрасчёт №1', prev: 0, curr: 250, consumption: 250, modName: 'd@p', timestamp: new Date().toISOString() }
        ]);
        var result = fns.flowValidateReading(m, p, rules({ max_cons: 1000 }), null, recentWithSelf);
        // meterId=2 всё ещё совпадает (consumption=250), поэтому WRONG_METER сработает на meterId=2
        assertTrue(hasCode(result.codes, 'WRONG_METER'));
        // detail должен ссылаться на meterId=2, НЕ на meterId=1
        var wmCode = result.codes.find(function(c) { return c.indexOf('WRONG_METER') === 0; });
        assertTrue(wmCode.indexOf('id=2') !== -1);
        assertTrue(wmCode.indexOf('id=1') === -1);
    });

    test('consumption < MIN_CONSUMPTION (1.0) → WRONG_METER пропускается', () => {
        var m = meter({ id: 1, prev: 100, curr: 100.5 });  // расход 0.5
        var p = { id: 1, prev: 100, curr: 100.5, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        // meterId=4 consumption=20, не совпадает. Но даже если бы совпало (0.5),
        // расход < 1.0 — WRONG_METER пропускается.
        var customRecent = [
            { meterId: 4, hoz: 'Хозрасчёт №4', prev: 100, curr: 100.5, consumption: 0.5, modName: 'b@p', timestamp: new Date().toISOString() }
        ];
        var result = fns.flowValidateReading(m, p, rules({ max_cons: 1000, min_cons: 0 }), null, customRecent);
        assertFalse(hasCode(result.codes, 'WRONG_METER'));
    });

    test('Несколько счётчиков в recentAll, один совпадает — break, один WRONG_METER код', () => {
        var m = meter({ id: 1, prev: 0, curr: 250.00 });
        var p = { id: 1, prev: 0, curr: 250.00, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        // meterId=2 совпадает (consumption=250), meterId=4 нет (consumption=20)
        var result = fns.flowValidateReading(m, p, rules({ max_cons: 1000 }), null, recentAll());
        var wmCount = result.codes.filter(function(c) { return c.indexOf('WRONG_METER') === 0; }).length;
        assertEqual(wmCount, 1);
    });

    test('WRONG_METER + другая аномалия — оба в codes', () => {
        var m = meter({ id: 1, prev: 0, curr: 250.00 });
        var p = { id: 1, prev: 0, curr: 250.00, datePrev: '8/20/2026', dateCurr: '8/27/2026' };
        // JUMP_HIGH (250 > 30 = 10×3), PERIOD_MISMATCH (7 дн vs 1), WRONG_METER (consumption=250 = meterId=2)
        var result = fns.flowValidateReading(m, p, rules({ max_cons: 10, expected_days: 1 }), null, recentAll());
        assertTrue(hasCode(result.codes, 'JUMP_HIGH'));
        assertTrue(hasCode(result.codes, 'PERIOD_MISMATCH'));
        assertTrue(hasCode(result.codes, 'WRONG_METER'));
    });
});

describe('flowValidateReading — detail-строка (формат «CODE: detail; ...»)', () => {
    test('codes.length > 0 → detail = join «; »', () => {
        var m = meter({ prev: 0, curr: 50.00 });
        var p = { id: 1, prev: 0, curr: 50.00, datePrev: '8/20/2026', dateCurr: '8/27/2026' };
        var result = fns.flowValidateReading(m, p, rules({ max_cons: 10, expected_days: 1 }), null);
        assertTrue(result.detail.indexOf(';') !== -1 || result.codes.length === 1);
        assertTrue(result.detail.indexOf('JUMP_HIGH') !== -1);
    });
    test('codes.length === 0 → detail = пустая строка', () => {
        var m = meter({ prev: 91.11, curr: 95.00 });
        var p = { id: 1, prev: 91.11, curr: 95.00, datePrev: '8/26/2026', dateCurr: '8/27/2026' };
        // lastArchive с другими prev/curr — иначе DUPLICATE
        var result = fns.flowValidateReading(m, p, rules(), lastArchive({ prev: 50.00, curr: 91.11 }));
        assertEqual(result.detail, '');
    });
});

describe('_flowParseDate — парсинг дат разных форматов', () => {
    test('M/D/YYYY → Date', () => {
        var d = fns._flowParseDate('8/27/2026');
        assertTrue(d instanceof Date);
        assertEqual(d.getFullYear(), 2026);
        assertEqual(d.getMonth(), 7);  // август = 7 (0-indexed)
        assertEqual(d.getDate(), 27);
    });
    test('YYYY-MM-DD → Date', () => {
        var d = fns._flowParseDate('2026-08-27');
        assertTrue(d instanceof Date);
        assertEqual(d.getFullYear(), 2026);
        assertEqual(d.getMonth(), 7);
        assertEqual(d.getDate(), 27);
    });
    test('DD.MM.YYYY → Date', () => {
        var d = fns._flowParseDate('27.08.2026');
        assertTrue(d instanceof Date);
        assertEqual(d.getFullYear(), 2026);
        assertEqual(d.getMonth(), 7);
        assertEqual(d.getDate(), 27);
    });
    test('Пустая строка → null', () => {
        var d = fns._flowParseDate('');
        assertEqual(d, null);
    });
    test('Невалидный формат → null', () => {
        var d = fns._flowParseDate('hello');
        assertEqual(d, null);
    });
});

describe('_flowFmt — форматирование чисел', () => {
    test('Число 3.14159 → "3.14"', () => {
        assertEqual(fns._flowFmt(3.14159), '3.14');
    });
    test('Число 0 → "0.00"', () => {
        assertEqual(fns._flowFmt(0), '0.00');
    });
    test('NaN → "NaN"', () => {
        assertEqual(fns._flowFmt(NaN), 'NaN');
    });
    test('Не число (строка) → исходная строка', () => {
        assertEqual(fns._flowFmt('hello'), 'hello');
    });
});

describe('flowBuildAnomalyModalHtml — построение модалки', () => {
    test('Пустой массив codes → fallback <li> с сообщением по умолчанию (Task 234)', () => {
        // Task 234: если все displayText пусты, рендерится fallback-пункт
        var html = fns.flowBuildAnomalyModalHtml(meter(), []);
        assertTrue(html.indexOf('flow-anomaly-modal') !== -1);
        assertTrue(html.indexOf('flow-anomaly-item') !== -1,
                   'При пустом codes рендерится fallback <li>');
        assertTrue(html.indexOf('Проверьте корректность') !== -1,
                   'Fallback должен содержать «Проверьте корректность...»');
    });
    test('Один код с деталью → <li> только с деталью (Task 234: без кода)', () => {
        // Task 234: код правила не рендерится — только описание (detail)
        var html = fns.flowBuildAnomalyModalHtml(meter(), ['JUMP_HIGH: расход 50.00 > max×3=30.00']);
        assertTrue(html.indexOf('flow-anomaly-item') !== -1);
        assertTrue(html.indexOf('расход 50.00') !== -1,
                   'Деталь аномалии должна быть в html');
        assertTrue(html.indexOf('JUMP_HIGH') === -1,
                   'Код правила JUMP_HIGH не должен отображаться в модалке (Task 234)');
        assertTrue(html.indexOf('flow-anomaly-code') === -1,
                   'Span.flow-anomaly-code не должен присутствовать');
    });
    test('Код без двоеточия — detail пустой → fallback (Task 234)', () => {
        // Task 234: при пустом displayText элемент пропускается,
        // если все пропущены — fallback-пункт «Проверьте корректность...»
        var html = fns.flowBuildAnomalyModalHtml(meter(), ['SIGN_NEG']);
        assertTrue(html.indexOf('flow-anomaly-item') !== -1,
                   'Fallback <li> должен присутствовать');
        assertTrue(html.indexOf('SIGN_NEG') === -1,
                   'Код SIGN_NEG не должен отображаться (Task 234)');
        assertTrue(html.indexOf('Проверьте корректность') !== -1,
                   'Fallback-сообщение должно быть');
    });
    test('Несколько кодов — несколько <li>', () => {
        var codes = ['JUMP_HIGH: расход 50', 'PERIOD_MISMATCH: 5 дн'];
        var html = fns.flowBuildAnomalyModalHtml(meter(), codes);
        var liCount = (html.match(/flow-anomaly-item/g) || []).length;
        assertEqual(liCount, 2);
    });
    test('HTML-символы в detail экранируются (XSS)', () => {
        var html = fns.flowBuildAnomalyModalHtml(meter(), ['JUMP_HIGH: <script>alert(1)</script>']);
        assertTrue(html.indexOf('<script>') === -1);
        assertTrue(html.indexOf('&lt;script&gt;') !== -1);
    });
    test('Meter с hoz и param — попадают в шапку модалки', () => {
        var m = meter({ hoz: 'Хозрасчёт №1', param: 'Расход пара в корпус 114' });
        var html = fns.flowBuildAnomalyModalHtml(m, ['JUMP_HIGH: test']);
        assertTrue(html.indexOf('Хозрасчёт №1') !== -1);
        assertTrue(html.indexOf('Расход пара в корпус 114') !== -1);
    });
    test('Meter null — шапка модалки пустая (не падает)', () => {
        var html = fns.flowBuildAnomalyModalHtml(null, ['JUMP_HIGH: test']);
        assertTrue(html.indexOf('flow-anomaly-modal-meter') !== -1);
    });
    test('Кнопки «Отменить» и «Сохранить с пометкой» присутствуют', () => {
        var html = fns.flowBuildAnomalyModalHtml(meter(), ['JUMP_HIGH: test']);
        assertTrue(html.indexOf('Отменить') !== -1);
        assertTrue(html.indexOf('Сохранить с пометкой') !== -1);
        assertTrue(html.indexOf('flow-anomaly-cancel') !== -1);
        assertTrue(html.indexOf('flow-anomaly-confirm') !== -1);
    });
});

// Task 222: проверка, что flowBuildAnomalyModalHtml использует
// дружелюбное описание из FlowmeterData._anomalyHelp, если оно есть.
// Поскольку FlowmeterData объявлен внутри sandbox extract-functions
// и не экспортируется, проверяем source-text инварианты в index.html.
describe('Task 222: flowBuildAnomalyModalHtml — дружелюбные описания (source-text)', () => {
    const fs = require('fs');
    const path = require('path');
    const idxSrc = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf-8');

    test('FlowmeterData имеет поле _anomalyHelp (инициализировано как {})', () => {
        assertTrue(idxSrc.indexOf('_anomalyHelp: {}') !== -1);
    });
    test('flowBuildAnomalyModalHtml читает FlowmeterData._anomalyHelp', () => {
        // Ищем паттерн обращения к карте описаний внутри функции
        var idx = idxSrc.indexOf('function flowBuildAnomalyModalHtml');
        assertTrue(idx !== -1);
        var snippet = idxSrc.substring(idx, idx + 1500);
        assertTrue(snippet.indexOf('FlowmeterData._anomalyHelp') !== -1);
        assertTrue(snippet.indexOf('helpMap[code]') !== -1);
        assertTrue(snippet.indexOf('|| detail') !== -1);
    });
    test('_buildArchiveHtml использует _anomalyHelp для столбца «⚠ Замечания»', () => {
        // Ищем паттерн внутри _buildArchiveHtml
        var idx = idxSrc.indexOf('_buildArchiveHtml: function');
        assertTrue(idx !== -1);
        var snippet = idxSrc.substring(idx, idx + 12000);
        assertTrue(snippet.indexOf('this._anomalyHelp') !== -1);
        assertTrue(snippet.indexOf('friendly') !== -1);
        assertTrue(snippet.indexOf('displayText') !== -1);
    });
    test('loadArchive сохраняет anomalyHelp из ответа сервера', () => {
        // Task 358: _flushOutbox тоже вызывает 'flowmeter.archive' и стоит
        // РАНЬШЕ loadArchive — якоримся на сам метод, а не первый вызов
        var idx = idxSrc.indexOf('loadArchive: function');
        assertTrue(idx !== -1);
        var snippet = idxSrc.substring(idx, idx + 1600);
        assertTrue(snippet.indexOf("'flowmeter.archive',") !== -1, 'вызов archive внутри loadArchive');
        assertTrue(snippet.indexOf('data.anomalyHelp') !== -1);
        assertTrue(snippet.indexOf('self._anomalyHelp') !== -1);
    });
});

// Task 222: проверка, что серверный файл ValidationRules.gs содержит
// нужные структуры (HELP_SHEET_NAME, DEFAULT_HELP, getHelpMap, listHelp,
// flowmeterInitValidationHelp) и что DEFAULT_HELP содержит все 10 кодов.
describe('Task 222: ValidationRules.gs — структуры для help-таблицы', () => {
    const fs = require('fs');
    const path = require('path');
    const vrPath = path.resolve(__dirname, '..', 'scripts', 'ValidationRules.gs');
    const src = fs.readFileSync(vrPath, 'utf-8');

    test('HELP_SHEET_NAME = flowmeter_validation_help', () => {
        assertTrue(src.indexOf("HELP_SHEET_NAME: 'flowmeter_validation_help'") !== -1);
    });
    test('DEFAULT_HELP содержит все 10 кодов', () => {
        var codes = ['SIGN_NEG', 'DATE_INCONSISTENT', 'JUMP_NEGATIVE', 'JUMP_HIGH',
                     'JUMP_LOW', 'PERIOD_MISMATCH', 'TEMP_OUT_OF_RANGE', 'GCAL_RATIO',
                     'DUPLICATE', 'WRONG_METER'];
        for (var i = 0; i < codes.length; i++) {
            assertTrue(src.indexOf(codes[i] + ':') !== -1,
                       'DEFAULT_HELP должен содержать код ' + codes[i]);
        }
    });
    test('Метод getHelpMap определён', () => {
        assertTrue(src.indexOf('getHelpMap: function') !== -1);
    });
    test('Метод listHelp определён (для эндпоинта flowmeter.getValidationHelp)', () => {
        assertTrue(src.indexOf('listHelp: function') !== -1);
    });
    test('Функция flowmeterInitValidationHelp определена', () => {
        assertTrue(src.indexOf('function flowmeterInitValidationHelp') !== -1);
    });
});

// Task 222: проверка, что Code.gs регистрирует новый эндпоинт
// flowmeter.getValidationHelp, а FlowmeterArchive.gs возвращает anomalyHelp.
describe('Task 222: регистрация эндпоинта и anomalyHelp в архиве', () => {
    const fs = require('fs');
    const path = require('path');
    const codeSrc = fs.readFileSync(path.resolve(__dirname, '..', 'scripts', 'Code.gs'), 'utf-8');
    const archSrc = fs.readFileSync(path.resolve(__dirname, '..', 'scripts', 'FlowmeterArchive.gs'), 'utf-8');

    test('Code.gs: case flowmeter.getValidationHelp → ValidationRules.listHelp', () => {
        assertTrue(codeSrc.indexOf("'flowmeter.getValidationHelp'") !== -1);
        assertTrue(codeSrc.indexOf('ValidationRules.listHelp') !== -1);
    });
    test('FlowmeterArchive.gs: listArchive возвращает anomalyHelp', () => {
        assertTrue(archSrc.indexOf('anomalyHelp') !== -1);
        assertTrue(archSrc.indexOf('ValidationRules.getHelpMap') !== -1);
    });
});

// Task 223 + 224: график в архиве расходомера строится из показаний (r.curr),
// а не из вычисленного расхода (r.consumption); высота баров нормализуется
// по диапазону [min..max]: bar = (curr − min) / (max − min) × 100.
// Тесты — source-text на index.html (без мутации sandbox-объектов).
describe('Task 223+224+228: график архива — условный источник + нормализация', () => {
    const fs = require('fs');
    const path = require('path');
    const idxPath = path.resolve(__dirname, '..', 'index.html');
    const src = fs.readFileSync(idxPath, 'utf-8');

    function chartBody() {
        var fnIdx = src.indexOf('_buildArchiveChart: function');
        if (fnIdx === -1) return '';
        var fnEnd = src.indexOf('return html;', fnIdx);
        return src.substring(fnIdx, fnEnd === -1 ? src.length : fnEnd);
    }

    // Task 228: условный выбор источника данных
    test('Определяется dailyMode через _isDailyMode(meter)', () => {
        var body = chartBody();
        assertTrue(body.indexOf('_isDailyMode') !== -1,
                   'Должен вызываться _isDailyMode(meter) для определения источника');
    });

    test('Функция pickValue использует r.curr для dailyMode', () => {
        var body = chartBody();
        assertTrue(body.indexOf('pickValue') !== -1,
                   'Должна быть функция pickValue для выбора источника');
        // Для dailyMode → r.curr
        assertTrue(body.indexOf('r.curr') !== -1,
                   'pickValue должен использовать r.curr для dailyMode');
    });

    test('Функция pickValue использует r.consumption для НЕ-dailyMode (Task 228)', () => {
        var body = chartBody();
        // Для не-dailyMode → r.consumption
        assertTrue(body.indexOf('r.consumption') !== -1,
                   'pickValue должен использовать r.consumption для не-dailyMode (Task 228)');
    });

    test('Заголовок: «Показания (посуточно)» для dailyMode, «Расход» для остальных (Task 292)', () => {
        var body = chartBody();
        // chartTitle = dailyMode ? 'Показания (посуточно)' : 'Расход' (Task 292)
        assertTrue(body.indexOf("'Показания (посуточно)'") !== -1,
                   'Должна быть строка «Показания (посуточно)» для dailyMode (Task 292)');
        assertTrue(body.indexOf("'Расход'") !== -1,
                   'Должна быть строка «Расход» для не-dailyMode');
        // Тернарный оператор
        assertTrue(body.indexOf("chartTitle = dailyMode") !== -1 ||
                   body.indexOf("dailyMode ? 'Показания (посуточно)' : 'Расход'") !== -1,
                   'Должен быть тернарный выбор заголовка по dailyMode');
    });

    // Task 224: нормализация по диапазону
    test('Вычисляется minVal (минимум значений)', () => {
        var body = chartBody();
        assertTrue(body.indexOf('minVal') !== -1,
                   'Должна быть переменная minVal');
        assertTrue(body.indexOf('Infinity') !== -1,
                   'minVal должен инициализироваться Infinity');
    });

    test('Вычисляется maxVal (максимум значений)', () => {
        var body = chartBody();
        assertTrue(body.indexOf('maxVal') !== -1,
                   'Должна быть переменная maxVal');
    });

    test('Формула нормализации: (val − minVal) / range × 100', () => {
        var body = chartBody();
        assertTrue(body.indexOf('(val - minVal)') !== -1,
                   'Должна быть формула (val − minVal)');
        assertTrue(body.indexOf('/ range') !== -1,
                   'Должно быть деление на range (max − min)');
        assertTrue(body.indexOf('* 100') !== -1,
                   'Должно быть умножение на 100');
    });

    test('Защита от деления на ноль (плоский случай max === min)', () => {
        var body = chartBody();
        assertTrue(body.indexOf('range === 0') !== -1 || body.indexOf('flat') !== -1,
                   'Должна быть защита от деления на ноль (range === 0 / flat)');
    });

    test('Минимальная высота бара 5% (Math.max(5, ...)) — Task 226', () => {
        var body = chartBody();
        assertTrue(body.indexOf('Math.max(5') !== -1,
                   'Должен быть Math.max(5, ...) для минимальной высоты 5% (Task 226)');
        assertTrue(body.indexOf('Math.max(1') === -1,
                   'Старый Math.max(1, ...) должен быть убран');
    });

    test('Старый код (curr / maxReading × 100 без min) убран', () => {
        var body = chartBody();
        assertTrue(body.indexOf('(curr / maxReading) * 100') === -1,
                   'Старая формула (curr / maxReading) × 100 должна быть убрана');
    });
});

// Task 231 (историческая заметка): в этой ревизии SW был поднят до v495.
// Актуальная версия — v496 (Task 232, см. ниже). Текущий SW-тест живёт в
// блоке «Task 232: SW версия v496» — он проверяет и наличие v496, и
// отсутствие v495. Отдельный блок Task 231 убран, чтобы не падал при
// следующих bump-ах.

// Task 230: горизонтальный скролл таблицы хронологии работает сразу (без pinch-zoom).
// Причина бага: .pinch-zoom-target имеет touch-action: pan-y (только вертикаль),
// и лишь после добавления класса .zoomed (через pinch-zoom) становится pan-x pan-y.
// Решение: для таблицы хронологии добавлено специфичное правило
// .flow-archive-table-wrap.pinch-zoom-target { touch-action: pan-x pan-y }.
describe('Task 230: горизонтальный скролл таблицы хронологии без pinch-zoom', () => {
    const fs = require('fs');
    const path = require('path');
    const idxPath = path.resolve(__dirname, '..', 'index.html');
    const src = fs.readFileSync(idxPath, 'utf-8');

    test('Добавлено правило .flow-archive-table-wrap.pinch-zoom-target', () => {
        assertTrue(src.indexOf('.flow-archive-table-wrap.pinch-zoom-target') !== -1,
                   'Должно быть CSS-правило .flow-archive-table-wrap.pinch-zoom-target');
    });

    test('touch-action: pan-x pan-y для таблицы хронологии', () => {
        // Находим блок правила
        var ruleIdx = src.indexOf('.flow-archive-table-wrap.pinch-zoom-target');
        assertTrue(ruleIdx !== -1);
        var ruleEnd = src.indexOf('}', ruleIdx);
        var ruleText = src.substring(ruleIdx, ruleEnd === -1 ? src.length : ruleEnd);
        assertTrue(ruleText.indexOf('touch-action: pan-x pan-y') !== -1,
                   'touch-action должен быть pan-x pan-y');
    });

    test('Старое touch-action: pan-y у .pinch-zoom-target сохранено (для других элементов)', () => {
        // Базовое правило .pinch-zoom-target не трогаем — оно нужно для билетов и др.
        // Ищем именно базовое правило (с переносом строки перед, чтобы не поймать
        // .flow-archive-table-wrap.pinch-zoom-target).
        var needle = '\n    .pinch-zoom-target {\n        touch-action: pan-y;';
        assertTrue(src.indexOf(needle) !== -1,
                   'Базовое .pinch-zoom-target должно остаться с touch-action: pan-y');
    });
});

// Task 225: реорганизация строки «Последние показания» в детальной карточке.
// Убраны отдельные строки «Температура среды» и «Гигакалории пара» — их
// значения перенесены под основные показания. Дата «за дата г.» —
// отдельной строкой под названием «Последние показания».
describe('Task 225: реорганизация строки «Последние показания»', () => {
    const fs = require('fs');
    const path = require('path');
    const idxPath = path.resolve(__dirname, '..', 'index.html');
    const src = fs.readFileSync(idxPath, 'utf-8');

    // Находим _buildDetailHtml
    function detailBody() {
        var fnIdx = src.indexOf('_buildDetailHtml: function');
        if (fnIdx === -1) return '';
        // Конец функции — следующая закрывающая } на уровне метода
        var fnEnd = src.indexOf('\n        },', fnIdx);
        return src.substring(fnIdx, fnEnd === -1 ? src.length : fnEnd);
    }

    test('Отдельная строка «Температура среды» убрана', () => {
        var body = detailBody();
        // Не должно быть HTML-строки с label «Температура среды»
        assertTrue(body.indexOf('>Температура среды<') === -1,
                   'Строка «Температура среды» должна быть убрана');
    });

    test('Отдельная строка «Гигакалории пара» убрана', () => {
        var body = detailBody();
        assertTrue(body.indexOf('>Гигакалории пара<') === -1,
                   'Строка «Гигакалории пара» должна быть убрана');
    });

    test('Значение температуры перенесено в flow-detail-sub (под осн. значением)', () => {
        var body = detailBody();
        // tempStr всё ещё формируется в buildDetailHtml
        assertTrue(body.indexOf('m.temp.toFixed(1)') !== -1,
                   'Должно быть вычисление tempStr');
        // И оборачивается в flow-detail-sub
        assertTrue(body.indexOf('flow-detail-value flow-detail-sub') !== -1 ||
                   body.indexOf('flow-detail-sub') !== -1,
                   'Подзначения должны иметь класс flow-detail-sub');
    });

    test('Значение гигакалорий перенесено в flow-detail-sub', () => {
        var body = detailBody();
        // gcalStr формируется ранее (строка ~31793)
        assertTrue(body.indexOf('gcalStr') !== -1,
                   'Должно использоваться gcalStr');
        // И оборачивается в flow-detail-sub
        assertTrue(body.indexOf('flow-detail-sub') !== -1,
                   'Подзначения должны иметь класс flow-detail-sub');
    });

    test('Дата «за дата г.» — под-элемент label, одна строка (Task 227+229)', () => {
        var body = detailBody();
        // Task 227: дата в row-head (не отдельной строкой под названием)
        // Task 229: дата — под-элемент .flow-detail-label (одна общая строка)
        assertTrue(body.indexOf('flow-detail-date-inline') !== -1,
                   'Дата должна иметь класс-маркер flow-detail-date-inline');
        // Проверяем, что lastReadingLabel идёт ВНУТРИ span.flow-detail-label
        // (это единственный span с этим классом в карточке), а date-inline
        // идёт сразу после lastReadingLabel (с тем же родителем — span.label).
        // Находим подстроку «flow-detail-label» — после неё в радиусе 200
        // символов должно быть «flow-detail-date-inline» (т.е. date-элемент
        // является под-элементом label, а не отдельным span в row-head).
        var labelIdx = body.indexOf('flow-detail-label');
        assertTrue(labelIdx !== -1, 'flow-detail-label должен быть в коде');
        var snippet = body.substring(labelIdx, Math.min(body.length, labelIdx + 300));
        assertTrue(snippet.indexOf('flow-detail-date-inline') !== -1,
                   'Дата должна идти внутри span.flow-detail-label (одна общая строка с названием)');
        // Старый формат (<div class="flow-detail-date">за ...</div> как отдельная
        // строка под row-head) должен быть убран
        assertTrue(body.indexOf('<div class="flow-detail-date">за ') === -1,
                   'Старая дата-как-блок должна быть убрана (Task 227)');
    });

    test('Значение показаний не содержит встроенную дату «за ...»', () => {
        var body = detailBody();
        // Старый формат — значение показаний имело встроенную дату через запятую:
        //   ... ' + this._esc(m.unit) + ',<span class="flow-detail-date"> за ' + this._fmtDate(m.dateCurr) + ' г.</span> ...
        // После Task 225 дата перенесена выше (отдельной строкой), а в значении
        // показаний её быть не должно.
        // Проверяем: в подстроке, где формируется flow-detail-curr, нет
        // ",<span class=\"flow-detail-date\"> за ".
        var currIdx = body.indexOf('flow-detail-curr');
        assertTrue(currIdx !== -1, 'flow-detail-curr должен быть в коде');
        // Ищем следующий фрагмент ',<span class="flow-detail-date"> за '
        // в радиусе 200 символов от flow-detail-curr (тело строки значения).
        var snippet = body.substring(currIdx, Math.min(body.length, currIdx + 400));
        assertTrue(snippet.indexOf(',<span class="flow-detail-date"> за ') === -1,
                   'Значение показаний не должно содержать встроенную дату «за ...»');
        // И должно закрываться </div> без продолжения даты
        // (найдём первую закрывающую > после curr)
        assertTrue(snippet.indexOf(' ' + '</div>') !== -1 || snippet.indexOf('</div>') !== -1,
                   'Значение показаний должно закрываться </div>');
    });

    test('Добавлен класс flow-detail-row-last для строки «Последние показания»', () => {
        var body = detailBody();
        assertTrue(body.indexOf('flow-detail-row-last') !== -1,
                   'Должен быть класс-маркер flow-detail-row-last');
    });

    test('CSS-класс .flow-detail-sub определён', () => {
        assertTrue(src.indexOf('.flow-detail-sub') !== -1,
                   'CSS .flow-detail-sub должен быть определён');
    });
});

// Task 231: реорганизация сводной карточки расходомера в списке.
// В каждой карточке хозрасчётного расходомера:
//   1) «Последние показания» и дата «за дата г.» — в одной строке (дата — под-элемент label,
//      как в детальной карточке Task 229);
//   2) лейблы «Гкал» и «T среды» убраны — значения (с собственными единицами °C и Гкал)
//      показаны под основным значением как sub-текст.
describe('Task 231: карточка расходомера — label+дата в одну строку, лейблы Гкал/T среды убраны', () => {
    const fs = require('fs');
    const path = require('path');
    const idxPath = path.resolve(__dirname, '..', 'index.html');
    const src = fs.readFileSync(idxPath, 'utf-8');

    // Извлекаем тело метода renderList (где формируется HTML карточек)
    function renderListBody() {
        var fnIdx = src.indexOf('renderList: function');
        if (fnIdx === -1) return '';
        var fnEnd = src.indexOf('\n        },', fnIdx);
        return src.substring(fnIdx, fnEnd === -1 ? src.length : fnEnd);
    }

    test('Лейбл «T среды» убран из карточки списка', () => {
        var body = renderListBody();
        // Не должно быть HTML-строки с label «T среды» внутри renderList
        assertTrue(body.indexOf('>T среды<') === -1,
                   'Лейбл «T среды» должен быть убран из карточки списка');
    });

    test('Лейбл «Гкал» убран из карточки списка', () => {
        var body = renderListBody();
        assertTrue(body.indexOf('>Гкал<') === -1,
                   'Лейбл «Гкал» должен быть убран из карточки списка');
    });

    test('Дата — под-элемент label «Последние показания» (одна строка)', () => {
        var body = renderListBody();
        // Дата должна иметь класс-маркер flow-summary-date-inline
        assertTrue(body.indexOf('flow-summary-date-inline') !== -1,
                   'Дата должна иметь класс flow-summary-date-inline');
        // Проверяем: в радиусе 300 символов после flow-summary-label должен быть
        // flow-summary-date-inline (т.е. дата — под-элемент label)
        var labelIdx = body.indexOf('flow-summary-label');
        assertTrue(labelIdx !== -1, 'flow-summary-label должен быть в коде');
        var snippet = body.substring(labelIdx, Math.min(body.length, labelIdx + 300));
        assertTrue(snippet.indexOf('flow-summary-date-inline') !== -1,
                   'Дата должна идти внутри span.flow-summary-label (одна строка с названием)');
    });

    test('Старый формат даты через запятую в значении убран', () => {
        var body = renderListBody();
        // Старый формат: ',<span class="flow-detail-date"> за ' + ... + ' г.'
        // не должен встречаться в карточке списка
        assertTrue(body.indexOf(',<span class="flow-detail-date"> за ') === -1,
                   'Старый формат даты через запятую в значении должен быть убран');
    });

    test('Sub-значения temp/gcal показаны под основным значением без лейблов', () => {
        var body = renderListBody();
        // Должен быть класс flow-summary-sub для sub-значений
        assertTrue(body.indexOf('flow-summary-sub') !== -1,
                   'Должен быть класс flow-summary-sub для sub-значений temp/gcal');
        // Значения tempStr/gcalStr всё ещё формируются и используются
        assertTrue(body.indexOf('tempStr') !== -1, 'tempStr должен использоваться');
        assertTrue(body.indexOf('gcalStr') !== -1, 'gcalStr должен использоваться');
        // Проверяем что subParts содержит tempStr/gcalStr (через join)
        assertTrue(body.indexOf('subParts.push(tempStr)') !== -1 ||
                   body.indexOf('subParts.push(') !== -1,
                   'temp/gcal должны добавляться в subParts');
        assertTrue(body.indexOf('.join(') !== -1,
                   'Sub-значения должны объединяться через join');
    });

    test('Старые отдельные summary-items для T среды и Гкал убраны', () => {
        var body = renderListBody();
        // Раньше было: html += '<span class="flow-summary-item"><span class="flow-summary-label">T среды</span>...
        // Теперь этого быть не должно
        assertTrue(body.indexOf('flow-summary-label">T среды') === -1,
                   'Отдельный summary-item с T среды должен быть убран');
        assertTrue(body.indexOf('flow-summary-label">Гкал') === -1,
                   'Отдельный summary-item с Гкал должен быть убран');
    });

    test('CSS-класс .flow-summary-date-inline определён', () => {
        assertTrue(src.indexOf('.flow-summary-label .flow-summary-date-inline') !== -1,
                   'CSS .flow-summary-label .flow-summary-date-inline должен быть определён');
    });

    test('CSS-класс .flow-summary-sub определён', () => {
        assertTrue(src.indexOf('.flow-summary-sub') !== -1,
                   'CSS .flow-summary-sub должен быть определён');
    });
});

// Task 232: внесённый комментарий сразу отображается в архивных записях.
// Архитектура:
//   • setComment пишет в meters.O (активный комментарий счётчика)
//   • archive.P заполняется только при смене автора показаний в updateReading
//   • для той же автора archive.P пустой → самая свежая запись в архиве
//     показывает r.comment = '' хотя комментарий есть в meters.O
// Решение: в _buildArchiveHtml для i===0 (новейшая запись) если r.comment пуст,
// берём m.comment (через flowCommentText — с поддержкой локального fallback).
// Доп.: в submitComment success добавлен немедленный рендер архива из кэша,
// чтобы комментарий отобразился без ожидания network round-trip в loadArchive.
describe('Task 232: комментарий сразу отображается в архивных записях', () => {
    const fs = require('fs');
    const path = require('path');
    const idxPath = path.resolve(__dirname, '..', 'index.html');
    const src = fs.readFileSync(idxPath, 'utf-8');

    // Извлекаем тело метода _buildArchiveHtml
    function archiveBody() {
        var fnIdx = src.indexOf('_buildArchiveHtml: function');
        if (fnIdx === -1) return '';
        var fnEnd = src.indexOf('\n        },', fnIdx);
        return src.substring(fnIdx, fnEnd === -1 ? src.length : fnEnd);
    }

    // Извлекаем тело submitComment
    function submitBody() {
        var fnIdx = src.indexOf('submitComment: function');
        if (fnIdx === -1) return '';
        var fnEnd = src.indexOf('\n        },', fnIdx);
        return src.substring(fnIdx, fnEnd === -1 ? src.length : fnEnd);
    }

    test('В _buildArchiveHtml есть проверка i === 0 + flowCommentText fallback', () => {
        var body = archiveBody();
        // Проверка i === 0 в контексте comment cell
        assertTrue(body.indexOf('i === 0') !== -1,
                   'Должна быть проверка i === 0 для новейшей записи');
        // Вызов flowCommentText(meter, ...) для получения активного комментария
        assertTrue(body.indexOf('flowCommentText(meter') !== -1,
                   'Должен быть вызов flowCommentText(meter, ...) для fallback');
    });

    test('Старая логика «r.comment → cmtStr или —» сохранена для старых записей', () => {
        var body = archiveBody();
        // Должна остаться проверка r.comment из archive.P (для старых записей)
        assertTrue(body.indexOf('r.comment') !== -1,
                   'r.comment должен использоваться (для старых записей)');
        // И должна быть явная защита: если !cmtStr, брать liveCmt
        assertTrue(body.indexOf('if (!cmtStr && i === 0') !== -1 ||
                   body.indexOf('!cmtStr && i === 0') !== -1,
                   'Должна быть защита: для i===0 при пустом r.comment брать активный');
    });

    test('Если у записи есть archive.P (r.comment) — он приоритетнее активного', () => {
        var body = archiveBody();
        // Порядок: сначала r.comment, потом fallback. Проверяем что r.comment первый
        var idxRcomment = body.indexOf('var cmtStr = (r.comment');
        assertTrue(idxRcomment !== -1,
                   'Должна быть инициализация cmtStr из r.comment');
        var idxFallback = body.indexOf('if (!cmtStr && i === 0');
        assertTrue(idxFallback !== -1, 'Должен быть fallback для i===0');
        assertTrue(idxFallback > idxRcomment,
                   'Fallback должен идти ПОСЛЕ инициализации из r.comment');
    });

    test('submitComment вызывает немедленный рендер архива из кэша', () => {
        var body = submitBody();
        // В success-handler должен быть вызов _restoreArchiveCache + _buildArchiveHtml
        assertTrue(body.indexOf('_restoreArchiveCache') !== -1,
                   'submitComment должен вызывать _restoreArchiveCache для кэш-рендера');
        assertTrue(body.indexOf('flowArchiveContainer') !== -1,
                   'submitComment должен обращаться к #flowArchiveContainer');
        assertTrue(body.indexOf('_buildArchiveHtml') !== -1,
                   'submitComment должен вызвать _buildArchiveHtml с кэшем');
    });

    test('Кэш-рендер обёрнут в try/catch (не ломает основной flow)', () => {
        var body = submitBody();
        // Поиск try { ... } catch ... вокруг _restoreArchiveCache
        var idx = body.indexOf('_restoreArchiveCache');
        assertTrue(idx !== -1);
        // Должен быть try перед этим вызовом (в радиусе 200 символов)
        var before = body.substring(Math.max(0, idx - 200), idx);
        assertTrue(before.indexOf('try') !== -1,
                   'Кэш-рендер должен быть в try-блоке (не ломает основной flow)');
    });

    test('Локальный fallback-путь в submitComment тоже имеет кэш-рендер', () => {
        var body = submitBody();
        // Должен быть второй блок _restoreArchiveCache в fallback-ветке (Unknown action)
        var firstIdx = body.indexOf('_restoreArchiveCache');
        var secondIdx = body.indexOf('_restoreArchiveCache', firstIdx + 1);
        assertTrue(secondIdx !== -1,
                   'Должно быть два вызова _restoreArchiveCache: основной + fallback');
    });
});

// Task 232 (историческая заметка): в этой ревизии SW был поднят до v496
// (комментарий сразу отображается в архиве). Актуальная версия — v497
// (Task 233, см. ниже). Отдельный блок Task 232 убран, чтобы не падал
// при следующих bump-ах.

// Task 233: код правила (JUMP_NEGATIVE, TEMP_OUT_OF_RANGE, ...) не должен
// отображаться в тексте сообщения в столбце «⚠ Замечания» таблицы хронологии.
// Раньше рядом с описанием рендерился .flow-anomaly-badge с самим кодом —
// убрали. Теперь каждая аномалия = одна строка с описанием (friendly или detail).
describe('Task 233: код правила не показывается в столбце «⚠ Замечания»', () => {
    const fs = require('fs');
    const path = require('path');
    const idxPath = path.resolve(__dirname, '..', 'index.html');
    const src = fs.readFileSync(idxPath, 'utf-8');

    // Извлекаем тело метода _buildArchiveHtml
    function archiveBody() {
        var fnIdx = src.indexOf('_buildArchiveHtml: function');
        if (fnIdx === -1) return '';
        var fnEnd = src.indexOf('\n        },', fnIdx);
        return src.substring(fnIdx, fnEnd === -1 ? src.length : fnEnd);
    }

    test('HTML-вывод span.flow-anomaly-badge убран из _buildArchiveHtml', () => {
        var body = archiveBody();
        // Раньше: badges += '<span class="flow-anomaly-badge">' + this._esc(code) + '</span>';
        // Этой строки быть не должно в коде рендера аномалий.
        assertTrue(body.indexOf('<span class="flow-anomaly-badge">') === -1,
                   'Не должно быть рендера .flow-anomaly-badge (кода правила) в _buildArchiveHtml');
    });

    test('Описание аномалии (.flow-anomaly-badge-detail) всё ещё рендерится', () => {
        var body = archiveBody();
        assertTrue(body.indexOf('flow-anomaly-badge-detail') !== -1,
                   'Должен остаться рендер .flow-anomaly-badge-detail с описанием');
    });

    test('Каждая аномалия обёрнута в div.flow-anomaly-line', () => {
        var body = archiveBody();
        assertTrue(body.indexOf('flow-anomaly-line') !== -1,
                   'Должна быть обёртка .flow-anomaly-line для каждой аномалии (отдельная строка)');
    });

    test('Если displayText пуст — элемент не рендерится (проверка if (displayText))', () => {
        var body = archiveBody();
        // Должна быть проверка if (displayText) перед добавлением в badges
        assertTrue(body.indexOf('if (displayText)') !== -1,
                   'Должна быть проверка if (displayText) — пустые описания не рендерятся');
    });

    test('Fallback «—» если ни одного описания не найдено', () => {
        var body = archiveBody();
        // После цикла должна быть проверка: if (badges) ... else td с «—»
        var idxIfBadges = body.indexOf('if (badges)');
        assertTrue(idxIfBadges !== -1,
                   'Должна быть проверка if (badges) — fallback на «—» если все описания пусты');
        // После if (badges) должно быть else с «—»
        var afterIf = body.substring(idxIfBadges);
        assertTrue(afterIf.indexOf('else') !== -1 &&
                   afterIf.indexOf('—') !== -1,
                   'После if (badges) должен быть else-ветвление с «—»');
    });

    test('CSS-класс .flow-anomaly-line определён', () => {
        assertTrue(src.indexOf('.flow-archive-anomaly .flow-anomaly-line') !== -1 ||
                   src.indexOf('.flow-anomaly-line') !== -1,
                   'CSS .flow-anomaly-line должен быть определён');
    });
});

// Task 233 (историческая заметка): в этой ревизии SW был поднят до v497
// (код правила убран из столбца «⚠ Замечания» хронологии). Актуальная
// версия — v498 (Task 234, см. ниже). Отдельный блок Task 233 убран, чтобы
// не падал при следующих bump-ах.

// Task 234: код правила убран ИЗ МОДАЛКИ подтверждения аномалий.
// В Task 233 был убран из столбца хронологии, но в flowBuildAnomalyModalHtml
// (Task 199) оставался span.flow-anomaly-code с техническим кодом (JUMP_NEGATIVE,
// TEMP_OUT_OF_RANGE, ...). Теперь модалка показывает только описание аномалии.
describe('Task 234: код правила не показывается в модалке подтверждения аномалий', () => {
    const fs = require('fs');
    const path = require('path');
    const idxPath = path.resolve(__dirname, '..', 'index.html');
    const src = fs.readFileSync(idxPath, 'utf-8');

    // Извлекаем тело функции flowBuildAnomalyModalHtml
    function modalBody() {
        var fnIdx = src.indexOf('function flowBuildAnomalyModalHtml(');
        if (fnIdx === -1) return '';
        // Функция объявлена как `function name(...) { ... }` — ищем закрывающую
        // скобку на отдельной строке с отступом 4 пробела.
        var fnEnd = src.indexOf('\n    }\n', fnIdx);
        return src.substring(fnIdx, fnEnd === -1 ? src.length : fnEnd);
    }

    test('HTML-вывод span.flow-anomaly-code убран из flowBuildAnomalyModalHtml', () => {
        var body = modalBody();
        // Раньше: '<span class="flow-anomaly-code">' + escHtml(code) + '</span>'
        // Этой строки быть не должно в теле модалки.
        assertTrue(body.indexOf('<span class="flow-anomaly-code">') === -1,
                   'Не должно быть рендера .flow-anomaly-code (кода правила) в модалке');
    });

    test('Описание аномалии (.flow-anomaly-detail) всё ещё рендерится в модалке', () => {
        var body = modalBody();
        assertTrue(body.indexOf('flow-anomaly-detail') !== -1,
                   'Должен остаться рендер .flow-anomaly-detail с описанием');
    });

    test('Если displayText пуст — элемент не рендерится (continue в цикле)', () => {
        var body = modalBody();
        assertTrue(body.indexOf('if (!displayText) continue') !== -1,
                   'Должна быть проверка if (!displayText) continue — пустые описания пропускаются');
    });

    test('Fallback, если после фильтра items пуст', () => {
        var body = modalBody();
        // После цикла: if (!items) { ... } — fallback на пункт по умолчанию
        var idxIfItems = body.indexOf('if (!items)');
        assertTrue(idxIfItems !== -1,
                   'Должна быть проверка if (!items) — fallback если все описания пусты');
        var afterIf = body.substring(idxIfItems);
        assertTrue(afterIf.indexOf('flow-anomaly-detail') !== -1 &&
                   afterIf.indexOf('Проверьте корректность') !== -1,
                   'Fallback должен содержать пункт с текстом «Проверьте корректность...»');
    });

    test('Цикл по codes сохранён (обрабатывается каждый код)', () => {
        var body = modalBody();
        assertTrue(body.indexOf('for (var i = 0; i < codes.length; i++)') !== -1,
                   'Цикл по codes должен остаться');
        assertTrue(body.indexOf('helpMap[code]') !== -1,
                   'Логика выбора описания из helpMap (Task 222) должна сохраниться');
    });
});

// Task 234 (историческая заметка): в этой ревизии SW был поднят до v498
// (код правила убран из модалки подтверждения аномалий). Актуальная версия —
// v499 (Task 235, см. ниже). Отдельный блок Task 234 убран, чтобы не падал
// при следующих bump-ах.

// Task 235: правила валидации кэшируются в localStorage между сессиями.
// Раньше loadValidationRules() при каждом открытии карточки делал серверный
// запрос flowmeter.getValidationRules — теперь если кэш свежий (< 24ч),
// запрос пропускается, и модалка аномалий появляется моментально из памяти.
// Сервер всё равно валидирует независимо при фактическом сохранении.
describe('Task 235: кэш правил валидации в localStorage (мгновенная модалка)', () => {
    const fs = require('fs');
    const path = require('path');
    const idxPath = path.resolve(__dirname, '..', 'index.html');
    const src = fs.readFileSync(idxPath, 'utf-8');

    // Извлекаем тело объекта FlowmeterData для source-text проверок
    function flowmeterDataBody() {
        var idx = src.indexOf('var FlowmeterData = {');
        if (idx === -1) return '';
        // Ищем закрывающую скобку объекта на отдельной строке
        var end = src.indexOf('\n    };\n', idx);
        return src.substring(idx, end === -1 ? src.length : end);
    }

    test('Поле _rulesCacheKey определено', () => {
        var body = flowmeterDataBody();
        assertTrue(body.indexOf("_rulesCacheKey: 'kip8_flow_rules_v1'") !== -1,
                   'Должен быть ключ _rulesCacheKey для localStorage');
    });

    test('Поле _rulesCacheTtlMs определено (24 часа)', () => {
        var body = flowmeterDataBody();
        // TTL = 24 * 60 * 60 * 1000 (1 сутки в мс)
        assertTrue(body.indexOf('_rulesCacheTtlMs:') !== -1 &&
                   body.indexOf('24 * 60 * 60 * 1000') !== -1,
                   'TTL должен быть 24 часа (24*60*60*1000 мс)');
    });

    test('Поле _rulesCacheTs определено (timestamp последней синхронизации)', () => {
        var body = flowmeterDataBody();
        assertTrue(body.indexOf('_rulesCacheTs:') !== -1,
                   'Должно быть поле _rulesCacheTs — timestamp кэша');
    });

    test('Метод _loadRulesCacheFromStorage определён (синхронная подгрузка из localStorage)', () => {
        var body = flowmeterDataBody();
        assertTrue(body.indexOf('_loadRulesCacheFromStorage: function') !== -1,
                   'Должен быть метод _loadRulesCacheFromStorage');
        // Должен читать localStorage по _rulesCacheKey
        assertTrue(body.indexOf("localStorage.getItem(this._rulesCacheKey)") !== -1,
                   'Метод должен читать localStorage по _rulesCacheKey');
        // Должен заполнять _rulesCacheTs
        assertTrue(body.indexOf('this._rulesCacheTs = ts') !== -1,
                   'Должен устанавливать _rulesCacheTs из localStorage');
    });

    test('Метод _persistRulesCache определён (запись в localStorage)', () => {
        var body = flowmeterDataBody();
        assertTrue(body.indexOf('_persistRulesCache: function') !== -1,
                   'Должен быть метод _persistRulesCache');
        // Должен писать в localStorage
        assertTrue(body.indexOf("localStorage.setItem(this._rulesCacheKey") !== -1,
                   'Метод должен писать в localStorage по _rulesCacheKey');
        // Должен ставить текущий timestamp
        assertTrue(body.indexOf('ts: Date.now()') !== -1,
                   'Payload должен содержать текущий timestamp');
    });

    test('loadValidationRules: skip-fetch если кэш свежий', () => {
        var body = flowmeterDataBody();
        var idx = body.indexOf('loadValidationRules: function');
        assertTrue(idx !== -1, 'loadValidationRules должен быть определён');
        var snippet = body.substring(idx, idx + 2500);
        // Проверка freshness: if (_rulesCacheTs > 0 && (now - _rulesCacheTs) < _rulesCacheTtlMs)
        assertTrue(snippet.indexOf('_rulesCacheTs > 0') !== -1 &&
                   snippet.indexOf('_rulesCacheTtlMs') !== -1,
                   'Должна быть проверка freshness по _rulesCacheTs + TTL');
        // Если свежий — return Promise.resolve без _api вызова
        assertTrue(snippet.indexOf('Promise.resolve(this._rulesCache)') !== -1,
                   'При свежем кэше — return Promise.resolve без серверного round-trip');
    });

    test('loadValidationRules: persist после успешного fetch', () => {
        var body = flowmeterDataBody();
        var idx = body.indexOf('loadValidationRules: function');
        var snippet = body.substring(idx, idx + 2500);
        // После успешного fetch должно вызываться _persistRulesCache
        assertTrue(snippet.indexOf('self._persistRulesCache()') !== -1,
                   'После успешного fetch должно вызываться _persistRulesCache');
        // Старый кэш должен сбрасываться перед заполнением (если сервер вернул
        // урезанный список — не оставляем «зомби»-правил)
        assertTrue(snippet.indexOf('self._rulesCache = {}') !== -1,
                   'Старый _rulesCache должен сбрасываться перед заполнением');
    });

    test('loadValidationRules: fallback на stale localStorage при ошибке fetch', () => {
        var body = flowmeterDataBody();
        var idx = body.indexOf('loadValidationRules: function');
        var snippet = body.substring(idx, idx + 2500);
        // В catch-ветке должно вызываться _loadRulesCacheFromStorage
        // (если в памяти пусто — пробуем достать из localStorage)
        assertTrue(snippet.indexOf('_loadRulesCacheFromStorage()') !== -1,
                   'В catch-ветке должно вызываться _loadRulesCacheFromStorage (fallback)');
    });

    test('init() вызывает _loadRulesCacheFromStorage (синхронно до load)', () => {
        var body = flowmeterDataBody();
        var idx = body.indexOf('init: function');
        assertTrue(idx !== -1, 'init должен быть определён');
        var initEnd = body.indexOf('load: function', idx);
        var initSnippet = body.substring(idx, initEnd === -1 ? body.length : initEnd);
        assertTrue(initSnippet.indexOf('_loadRulesCacheFromStorage()') !== -1,
                   'init() должен вызывать _loadRulesCacheFromStorage');
        // Должен идти ДО load()
        var callPos = initSnippet.indexOf('_loadRulesCacheFromStorage()');
        var loadPos = initSnippet.indexOf('this.load()');
        assertTrue(callPos !== -1 && loadPos !== -1 && callPos < loadPos,
                   '_loadRulesCacheFromStorage должен идти ДО this.load() в init()');
    });
});

// Task 235 (историческая заметка): в этой ревизии SW был поднят до v499
// (правила валидации кэшируются в localStorage на 24ч для моментальной
// модалки аномалий). Актуальная версия — v500 (Task 236, см. ниже).
// Отдельный блок Task 235 убран, чтобы не падал при следующих bump-ах.

// Task 236: кнопка «Обновить правила» в админ-панели (page-admin → .admin-footer).
// Принудительно обнуляет _rulesCacheTs (обходит TTL-проверку 24ч) и вызывает
// loadValidationRules() — фоновый fetch свежих правил с сервера + обновление
// localStorage. Видна только админу (страница page-admin защищена ролью).
describe('Task 236: кнопка «Обновить правила» в админ-панели', () => {
    const fs = require('fs');
    const path = require('path');
    const idxPath = path.resolve(__dirname, '..', 'index.html');
    const src = fs.readFileSync(idxPath, 'utf-8');

    test('Кнопка «Обновить правила» присутствует в .admin-footer', () => {
        // Ищем .admin-footer блок внутри page-admin
        var adminPageIdx = src.indexOf('id="page-admin"');
        assertTrue(adminPageIdx !== -1, 'page-admin должен существовать');
        var footerIdx = src.indexOf('class="admin-footer"', adminPageIdx);
        assertTrue(footerIdx !== -1, '.admin-footer должен быть в page-admin');
        // Ищем кнопку «Обновить правила» после .admin-footer
        var footerEnd = src.indexOf('</div>', footerIdx);
        var footerBlock = src.substring(footerIdx, footerEnd === -1 ? src.length : footerEnd);
        assertTrue(footerBlock.indexOf('Обновить правила') !== -1,
                   'В .admin-footer должна быть кнопка «Обновить правила»');
        assertTrue(footerBlock.indexOf('KipAdmin.refreshValidationRules()') !== -1,
                   'Кнопка должна вызывать KipAdmin.refreshValidationRules()');
    });

    test('Метод refreshValidationRules определён в KipAdmin', () => {
        var idx = src.indexOf('refreshValidationRules: function');
        assertTrue(idx !== -1,
                   'Метод refreshValidationRules: function должен быть в KipAdmin');
    });

    test('refreshValidationRules обнуляет _rulesCacheTs перед вызовом', () => {
        var idx = src.indexOf('refreshValidationRules: function');
        assertTrue(idx !== -1);
        var snippet = src.substring(idx, idx + 1500);
        // Должно быть: FlowmeterData._rulesCacheTs = 0
        assertTrue(snippet.indexOf('FlowmeterData._rulesCacheTs = 0') !== -1,
                   'Должно обнулять _rulesCacheTs перед вызовом loadValidationRules');
    });

    test('refreshValidationRules вызывает FlowmeterData.loadValidationRules()', () => {
        var idx = src.indexOf('refreshValidationRules: function');
        var snippet = src.substring(idx, idx + 1500);
        assertTrue(snippet.indexOf('FlowmeterData.loadValidationRules()') !== -1,
                   'Должно вызывать FlowmeterData.loadValidationRules()');
    });

    test('refreshValidationRules: toast обратной связи (success/error)', () => {
        var idx = src.indexOf('refreshValidationRules: function');
        var snippet = src.substring(idx, idx + 2500);
        // Должен показывать toast с количеством правил или с ошибкой
        assertTrue(snippet.indexOf('KipToast.show') !== -1,
                   'Должен использовать KipToast.show для обратной связи');
        assertTrue(snippet.indexOf('Правила обновлены') !== -1,
                   'Должен показывать «Правила обновлены» при успехе');
        assertTrue(snippet.indexOf('Ошибка обновления правил') !== -1,
                   'Должен показывать «Ошибка обновления правил» при сбое');
    });

    test('refreshValidationRules: try/catch вокруг всего тела', () => {
        var idx = src.indexOf('refreshValidationRules: function');
        var snippet = src.substring(idx, idx + 2500);
        // Должно быть в try/catch — чтобы клик по кнопке не уронил страницу
        assertTrue(snippet.indexOf('try {') !== -1 &&
                   snippet.indexOf('catch (e)') !== -1,
                   'Тело метода должно быть в try/catch');
        // В catch должно логироваться + показываться toast
        var catchIdx = snippet.indexOf('catch (e)');
        var catchSnippet = snippet.substring(catchIdx);
        assertTrue(catchSnippet.indexOf('console.error') !== -1,
                   'В catch должно логироваться в console');
        assertTrue(catchSnippet.indexOf('KipToast.show') !== -1,
                   'В catch должен показываться toast с ошибкой');
    });

    test('Кнопка не нарушает существующую кнопку «Обновить данные»', () => {
        var adminPageIdx = src.indexOf('id="page-admin"');
        var footerIdx = src.indexOf('class="admin-footer"', adminPageIdx);
        var footerEnd = src.indexOf('</div>', footerIdx);
        var footerBlock = src.substring(footerIdx, footerEnd === -1 ? src.length : footerEnd);
        assertTrue(footerBlock.indexOf('Обновить данные') !== -1,
                   'Кнопка «Обновить данные» должна остаться');
        assertTrue(footerBlock.indexOf('KipAdmin.refreshAll()') !== -1,
                   '«Обновить данные» должна вызывать KipAdmin.refreshAll()');
    });
});

// Task 236 (историческая заметка): в этой ревизии SW был поднят до v500
// (кнопка «Обновить правила» в админ-панели — обнуляет _rulesCacheTs и
// вызывает loadValidationRules() для принудительного обхода 24ч TTL).
// Актуальная версия — v501 (Task 237, см. ниже). Отдельный блок Task 236
// убран, чтобы не падал при следующих bump-ах.

// Task 237: комментарий одновременно пишется в meters.O и archive.P,
// meters.O всегда сбрасывается при новом вводе показаний (не только
// при смене автора), новая архивная запись создаётся с пустым comment.
describe('Task 237: комментарий в meters.O + archive.P (одновременная запись)', () => {
    const fs = require('fs');
    const path = require('path');
    const flowmeterPath = path.resolve(__dirname, '..', 'scripts', 'Flowmeter.gs');
    const archivePath = path.resolve(__dirname, '..', 'scripts', 'FlowmeterArchive.gs');
    const flowmeterSrc = fs.readFileSync(flowmeterPath, 'utf-8');
    const archiveSrc = fs.readFileSync(archivePath, 'utf-8');

    test('FlowmeterArchive.updateLatestComment определён', () => {
        assertTrue(archiveSrc.indexOf('updateLatestComment: function') !== -1,
            'Метод updateLatestComment: function должен быть в FlowmeterArchive.gs');
    });

    test('updateLatestComment: ищет самую свежую запись (scan с конца)', () => {
        var idx = archiveSrc.indexOf('updateLatestComment: function');
        var snippet = archiveSrc.substring(idx, idx + 2500);
        // Цикл с конца массива (i >= 0; i--) — для поиска последней записи
        assertTrue(snippet.indexOf('values.length - 1;') !== -1,
            'Должен сканировать с конца для поиска самой свежей записи');
        assertTrue(snippet.indexOf('i >= 0; i--') !== -1,
            'Цикл должен идти в обратном порядке');
    });

    test('updateLatestComment: пишет в столбец P (16) — comment', () => {
        var idx = archiveSrc.indexOf('updateLatestComment: function');
        var snippet = archiveSrc.substring(idx, idx + 2500);
        assertTrue(snippet.indexOf('getRange(rowToUpdate, 16)') !== -1,
            'Должен обновлять P=16 (comment) в самой свежей записи');
        assertTrue(snippet.indexOf("setValue(String(comment || ''))") !== -1,
            'Должен записывать строку комментария (пустая строка для удаления)');
    });

    test('updateLatestComment: только колонка A читается для поиска (эффективность)', () => {
        var idx = archiveSrc.indexOf('updateLatestComment: function');
        var snippet = archiveSrc.substring(idx, idx + 2500);
        // Чтение 1 колонки вместо 17 — для эффективности (только A=meterId)
        assertTrue(snippet.indexOf(', 1)') !== -1,
            'Должен читать 1 колонку (только A=meterId) для эффективности');
    });

    test('setComment: пишет в meters.O (столбец 15)', () => {
        var idx = flowmeterSrc.indexOf('setComment: function');
        assertTrue(idx !== -1);
        var snippet = flowmeterSrc.substring(idx, idx + 3000);
        assertTrue(snippet.indexOf('getRange(rowNum, 15)') !== -1,
            'setComment должен писать в meters.O (столбец 15)');
    });

    test('setComment: вызывает FlowmeterArchive.updateLatestComment (синхронная запись в archive.P)', () => {
        var idx = flowmeterSrc.indexOf('setComment: function');
        var snippet = flowmeterSrc.substring(idx, idx + 3000);
        assertTrue(snippet.indexOf('FlowmeterArchive.updateLatestComment(id, comment)') !== -1,
            'setComment должен вызывать FlowmeterArchive.updateLatestComment для записи в archive.P');
    });

    test('setComment: try/catch вокруг updateLatestComment (best-effort)', () => {
        var idx = flowmeterSrc.indexOf('setComment: function');
        var snippet = flowmeterSrc.substring(idx, idx + 3000);
        var callIdx = snippet.indexOf('FlowmeterArchive.updateLatestComment');
        var callSnippet = snippet.substring(callIdx - 100, callIdx + 300);
        assertTrue(callSnippet.indexOf('try') !== -1,
            'Вызов updateLatestComment должен быть в try/catch (не блокировать ответ)');
        assertTrue(callSnippet.indexOf('catch (e)') !== -1,
            'Должен быть catch блок для не критичных ошибок архива');
    });

    test('updateReading: meters.O сбрасывается при НОВОМ вводе (не только при смене автора)', () => {
        var idx = flowmeterSrc.indexOf('updateReading: function');
        // updateReading ~11к символов — берём полный body до закрывающей },
        var endIdx = flowmeterSrc.indexOf('  },', idx + 100);
        var snippet = flowmeterSrc.substring(idx, endIdx);
        // По старой логике был authorChanged && oldCommentForArchive — Task 237
        // убрал authorChanged; Task 359 добавил !payload.isEdit: при ПРАВКЕ
        // (окно 1 ч, тот же автор) комментарий принадлежит той же логической
        // записи и НЕ сбрасывается; при НОВОМ вводе — сброс всегда.
        assertTrue(snippet.indexOf("if (!payload.isEdit && oldCommentForArchive !== '') {") !== -1,
            'Сброс meters.O — только для нового ввода (Task 359 guard)');
        assertTrue(snippet.indexOf('authorChanged && oldCommentForArchive') === -1,
            'Не должно быть условия authorChanged для сброса meters.O (Task 237)');
    });

    test('updateReading: миграция старого meters.O в archive.P перед сбросом', () => {
        var idx = flowmeterSrc.indexOf('updateReading: function');
        var endIdx = flowmeterSrc.indexOf('  },', idx + 100);
        var snippet = flowmeterSrc.substring(idx, endIdx);
        // Перед сбросом meters.O — продублировать в archive.P (миграция)
        var resetIdx = snippet.indexOf("sheet.getRange(rowNum, 15).setValue('')");
        assertTrue(resetIdx !== -1, 'Должен сбрасывать meters.O (столбец 15)');
        var beforeReset = snippet.substring(0, resetIdx);
        assertTrue(beforeReset.indexOf('FlowmeterArchive.updateLatestComment(id, oldCommentForArchive)') !== -1,
            'Перед сбросом meters.O должен вызывать updateLatestComment для миграции');
    });

    test('updateReading: appendToArchive вызывается с пустой строкой как comment', () => {
        var idx = flowmeterSrc.indexOf('updateReading: function');
        var endIdx = flowmeterSrc.indexOf('  },', idx + 100);
        var snippet = flowmeterSrc.substring(idx, endIdx);
        var archiveCallIdx = snippet.indexOf('FlowmeterArchive.appendToArchive(');
        assertTrue(archiveCallIdx !== -1, 'Должен вызывать appendToArchive');
        // После вызова — параметры. Ищем в радиусе 800 символов пустую строку
        // для параметра comment (Task 237: новая запись без комментария).
        var callSnippet = snippet.substring(archiveCallIdx, archiveCallIdx + 1000);
        assertTrue(callSnippet.indexOf("''") !== -1,
            'Новый параметр comment в appendToArchive должен быть пустой строкой (Task 237)');
        assertTrue(callSnippet.indexOf('authorChanged ? oldCommentForArchive') === -1,
            'Старая логика (authorChanged ? oldCommentForArchive) убрана');
    });
});

// Task 237 (историческая заметка): в этой ревизии SW был поднят до v501
// (комментарий к показаниям теперь пишется одновременно в hozraschet_meters.O
// и hozraschet_archive.P; meters.O всегда сбрасывается при новом вводе
// показаний, новая архивная запись создаётся с пустым comment). Актуальная
// версия — v502 (Task 238, см. ниже). Отдельный блок Task 237 убран, чтобы
// не падать при следующих bump-ах.

// Task 238: «Загрузка данных…» с анимированными точками до загрузки данных
// (вместо «Нет данных»); «Нет связи с сервером, попробуйте зайти позже»
// при ошибке сети/сервера и отсутствии кэша.
describe('Task 238: состояние «Загрузка данных…» и ошибка связи', () => {
    const fs = require('fs');
    const path = require('path');
    const idxPath = path.resolve(__dirname, '..', 'index.html');
    const src = fs.readFileSync(idxPath, 'utf-8');

    // === CSS ===

    test('.flow-loading класс определён', () => {
        var idx = src.indexOf('.flow-loading {');
        assertTrue(idx !== -1, 'CSS-класс .flow-loading должен существовать');
    });

    test('.flow-loading-dots span — анимация (animation: flowLoadingDot)', () => {
        var idx = src.indexOf('.flow-loading-dots span {');
        assertTrue(idx !== -1);
        var snippet = src.substring(idx, idx + 300);
        assertTrue(snippet.indexOf('animation') !== -1 &&
                   snippet.indexOf('flowLoadingDot') !== -1,
            '.flow-loading-dots span должен использовать animation: flowLoadingDot');
    });

    test('@keyframes flowLoadingDot определён', () => {
        assertTrue(src.indexOf('@keyframes flowLoadingDot') !== -1,
            '@keyframes flowLoadingDot должен быть определён');
    });

    test('.flow-loading-dots span:nth-child(1..3) — задержки анимации', () => {
        // Три точки с разными animation-delay (каскад)
        assertTrue(src.indexOf('.flow-loading-dots span:nth-child(1)') !== -1,
            'nth-child(1) для задержки анимации');
        assertTrue(src.indexOf('.flow-loading-dots span:nth-child(2)') !== -1,
            'nth-child(2) для задержки анимации');
        assertTrue(src.indexOf('.flow-loading-dots span:nth-child(3)') !== -1,
            'nth-child(3) для задержки анимации');
    });

    test('.flow-error класс определён', () => {
        var idx = src.indexOf('.flow-error {');
        assertTrue(idx !== -1, 'CSS-класс .flow-error должен существовать');
    });

    // === _loadState поле ===

    test('_loadState поле определено со значением по умолчанию \'idle\'', () => {
        var idx = src.indexOf('_loadState:');
        assertTrue(idx !== -1, '_loadState поле должно быть в FlowmeterData');
        var snippet = src.substring(idx, idx + 200);
        assertTrue(snippet.indexOf("'idle'") !== -1,
            "Значение по умолчанию должно быть 'idle'");
    });

    // === init() ===

    test('init() устанавливает _loadState в \'loading\' при наличии токена', () => {
        // Ищем через уникальный маркер, который есть только в init() FlowmeterData
        var marker = "_loadState = token ? 'loading' : 'idle'";
        assertTrue(src.indexOf(marker) !== -1,
            "init() должен устанавливать _loadState = token ? 'loading' : 'idle'");
    });

    // === load() ===

    test('load(): при отсутствии токена _loadState = \'idle\'', () => {
        // Уникальный маркер внутри load() FlowmeterData
        var marker = "this._loadState = 'idle';  // Task 238: нет токена";
        assertTrue(src.indexOf(marker) !== -1,
            "В ветке без токена: _loadState = 'idle'");
    });

    test('load(): при пустом _METERS — _loadState = \'loading\' + renderList', () => {
        // Ищем уникальный фрагмент
        var meterCheck = src.indexOf('this._METERS.length === 0');
        assertTrue(meterCheck !== -1,
            'Должна быть проверка _METERS.length === 0');
        var block = src.substring(meterCheck, meterCheck + 300);
        assertTrue(block.indexOf("_loadState = 'loading'") !== -1,
            'При пустом _METERS: _loadState = \'loading\'');
        assertTrue(block.indexOf('this.renderList()') !== -1,
            'При пустом _METERS: renderList() для показа «Загрузка данных…»');
    });

    test('load() success: _loadState = \'loaded\'', () => {
        // Уникальный маркер в success-ветке load()
        var marker = "self._loadState = 'loaded';  // Task 238";
        assertTrue(src.indexOf(marker) !== -1,
            "В success-ветке then: _loadState = 'loaded'");
    });

    test('load() catch: _loadState = \'error\'', () => {
        // Уникальный маркер в catch-ветке load()
        var marker = "self._loadState = 'error';  // Task 238";
        assertTrue(src.indexOf(marker) !== -1,
            "В catch-ветке: _loadState = 'error'");
    });

    // === renderList() — 3 ветки ===

    test('renderList(): ветка loading показывает «Загрузка данных»', () => {
        // Task 497 (адаптация): сравнение '_loadState === \'loading\''
        // встречается и в условии favEmpty497 (раньше ветки) — ищем
        // именно ВЕТКУ else-if загрузки.
        var marker = "} else if (this._loadState === 'loading') {";
        var loadingIdx = src.indexOf(marker);
        assertTrue(loadingIdx !== -1,
            "renderList должен проверять _loadState === 'loading'");
        var block = src.substring(loadingIdx, loadingIdx + 500);
        assertTrue(block.indexOf('Загрузка данных') !== -1,
            'В loading-ветке должен быть текст «Загрузка данных»');
        assertTrue(block.indexOf('flow-loading-dots') !== -1,
            'Должны быть анимированные точки .flow-loading-dots');
    });

    test('renderList(): ветка error показывает «Нет связи с сервером»', () => {
        // Task 497 (адаптация): как и с loading — ищем ВЕТКУ else-if
        // ошибки, не условие favEmpty497.
        var marker = "} else if (this._loadState === 'error') {";
        var errorIdx = src.indexOf(marker);
        assertTrue(errorIdx !== -1,
            "renderList должен проверять _loadState === 'error'");
        var block = src.substring(errorIdx, errorIdx + 600);
        assertTrue(block.indexOf('Нет связи с сервером') !== -1,
            'В error-ветке должен быть текст «Нет связи с сервером»');
        assertTrue(block.indexOf('Попробуйте зайти позже') !== -1,
            'В error-ветке должен быть hint «Попробуйте зайти позже»');
    });

    test('renderList(): fallback «Нет данных» сохранён для loaded/idle', () => {
        // Заглушка должна остаться — в else-ветке renderList
        // Ищем в радиусе после loading-маркера и error-маркера
        var loadingIdx = src.indexOf("this._loadState === 'loading'");
        var errorIdx = src.indexOf("this._loadState === 'error'");
        // «Нет данных» должен быть после error-блока
        var noDataIdx = src.indexOf('Нет данных', errorIdx);
        assertTrue(noDataIdx !== -1 && noDataIdx < errorIdx + 2000,
            'Должна остаться заглушка «Нет данных» для loaded/idle состояний');
    });
});

// Task 238 (историческая заметка): в этой ревизии SW был поднят до v502
// для состояния «Загрузка данных…» с анимированными точками и ошибки связи.
// Текущая версия — v503 (Task 240, см. ниже). Отдельный блок Task 238 убран,
// чтобы не плодить исторические SW-блоки в файле.

// Task 240 (историческая заметка): в этой ревизии раздел «График работы»
// был добавлен в сайдбар как top-level sidebar-item с иконкой календаря,
// расположенный перед «Админ-панелью». Виден только роли «Админ» —
// WORK_SCHEDULE_PAGES отсутствует в LVL_* массивах, доступ через ['*'].
// SW был поднят до v503.
//
// Task 241 (текущая ревизия): «График работы» перемещён из top-level
// сервисной секции в сворачиваемую группу «Документация ИОС»
// (data-group="docs-ios") — рядом с «Расходомерами хозрасчётными».
// Виден только Админу (как и раньше). Иконка календаря убрана — внутри
// группы sidebar-item-extra пункты идут без иконок, только цветной текст.
// Светлая тема: зебра списка карточек расходомеров сделана немного
// контрастней (odd-ряд темнее, even-ряд без изменений). SW поднят до v504.

describe('Task 241: «График работы» перемещён в группу «Документация ИОС»', () => {
    const fs = require('fs');
    const path = require('path');
    const htmlPath = path.resolve(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    test('Сайдбар: есть sidebar-item с navigateTo(\'work-schedule\') и текстом «Табель учёта рабочего времени»', () => {
        // После Task 241 пункт находится внутри группы docs-ios как
        // sidebar-item-extra (без иконки, с оранжевым цветом группы).
        // Task 321: раздел переименован («График работы» → «Табель
        // учёта рабочего времени»).
        const reItem = /<div class="sidebar-item[^"]*"[^>]*onclick="navigateTo\('work-schedule'\);[^"]*"[^>]*>[\s\S]{0,500}?Табель учёта рабочего времени[\s\S]{0,200}?<\/div>/;
        assertTrue(reItem.test(html),
            'Ожидался sidebar-item с navigateTo(\'work-schedule\') и текстом «Табель учёта рабочего времени»');
    });

    test('Сайдбар: sidebar-item раздела табеля имеет id="sidebarWorkScheduleBtn" и style="display:none"', () => {
        // id — для возможной отдельной проверки в _applyRoleToUI (как sidebarAdminBtn).
        // style="display:none" — чтобы не мелькал до первого запуска _applyRoleToUI.
        const reAttrs = /<div class="sidebar-item[^"]*"[^>]*id="sidebarWorkScheduleBtn"[^>]*style="display:none;"/;
        assertTrue(reAttrs.test(html),
            'sidebar-item должен иметь id="sidebarWorkScheduleBtn" и style="display:none"');
    });

    test('Сайдбар: «График работы» расположен ВНУТРИ группы docs-ios', () => {
        // Найти начало группы docs-ios и убедиться, что sidebar-item с
        // navigateTo('work-schedule') находится после начала группы и до
        // ближайшего sidebar-divider (группа — последняя перед разделителем).
        const groupStart = html.indexOf('data-group="docs-ios"');
        assertTrue(groupStart !== -1, 'Группа docs-ios должна существовать');
        const dividerStart = html.indexOf('class="sidebar-divider"', groupStart + 1);
        assertTrue(dividerStart !== -1, 'После группы docs-ios должен идти sidebar-divider');
        const groupSlice = html.slice(groupStart, dividerStart);
        const reItem = /<div class="sidebar-item[^"]*"[^>]*onclick="navigateTo\('work-schedule'\)/;
        assertTrue(reItem.test(groupSlice),
            'Внутри группы docs-ios должен быть sidebar-item с navigateTo(\'work-schedule\')');
    });

    test('Сайдбар: раздел табеля расположен ПЕРЕД «Админ-панель» в HTML-разметке', () => {
        // Логично: оба пункта видимы только Админу; «Табель учёта
        // рабочего времени» (теперь внутри группы docs-ios) всё ещё
        // идёт раньше sidebarAdminBtn в HTML.
        const idxWork = html.indexOf('id="sidebarWorkScheduleBtn"');
        const idxAdmin = html.indexOf('id="sidebarAdminBtn"');
        assertTrue(idxWork !== -1 && idxAdmin !== -1 && idxWork < idxAdmin,
            'sidebarWorkScheduleBtn должен идти раньше sidebarAdminBtn в HTML-разметке');
    });

    test('Сайдбар: группа docs-ios имеет статичный счётчик «2»', () => {
        // Для Админа видны 2 пункта (Расходомеры + График работы).
        // Статичный HTML-счётчик должен быть «2» — чтобы не было мелькания
        // до первого запуска _applyRoleToUI. _applyRoleToUI пересчитает
        // счётчик для не-Админ ролей (1 — если виден только Расходомеры).
        const groupStart = html.indexOf('data-group="docs-ios"');
        const dividerStart = html.indexOf('class="sidebar-divider"', groupStart + 1);
        const groupSlice = html.slice(groupStart, dividerStart);
        const reCount = /<span class="sidebar-group-title-count">2<\/span>/;
        assertTrue(reCount.test(groupSlice),
            'Группа docs-ios должна иметь статичный счётчик «2»');
    });

    test('Сайдбар: пункт табеля НЕ имеет иконки (как sidebar-item-extra внутри группы)', () => {
        // Внутри групп sidebar-item-extra пункты идут без svg-иконок —
        // только цветной текст. Это соответствует паттерну остальных пунктов
        // групп (Расходомеры, Приборы, Блокировки и т.д.).
        const reItem = /<div class="sidebar-item[^"]*"[^>]*id="sidebarWorkScheduleBtn"[^>]*>[\s\S]{0,300}?<\/div>/;
        const m = reItem.exec(html);
        assertTrue(m !== null, 'sidebar-item раздела табеля должен существовать');
        assertTrue(m[0].indexOf('<svg') === -1,
            'sidebar-item табеля внутри группы docs-ios не должен содержать <svg> иконку');
    });
});

describe('Task 241: зебра списка расходомеров в светлой теме контрастней', () => {
    const fs = require('fs');
    const path = require('path');
    const htmlPath = path.resolve(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    // Извлекаем RGB-компоненты из rgba(...) фона нечётных/чётных карточек.
    function extractLightBg(nth) {
        // Пример: [data-theme="light"] .flow-card:nth-child(odd)  { background: rgba(243, 233, 223, 0.96); }
        const re = new RegExp('\\[data-theme="light"\\] \\.flow-card:nth-child\\(' + nth + '\\)\\s*\\{[^}]*background:\\s*rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+)');
        const m = re.exec(html);
        if (!m) return null;
        return { r: +m[1], g: +m[2], b: +m[3] };
    }

    test('Светлая тема: odd-ряд карточек темнее even-ряда (R-канал)', () => {
        const odd = extractLightBg('odd');
        const even = extractLightBg('even');
        assertTrue(odd !== null && even !== null,
            'Должны быть CSS-правила для odd/even в светлой теме');
        // odd должен быть темнее even (меньшее значение RGB = темнее).
        assertTrue(odd.r < even.r,
            'odd-ряд должен быть темнее even-ряда по R-каналу (было 248 vs 252 — разница 4, незаметно)');
        // Разница должна быть заметной (≥ 7 пунктов — было 4, стало ~9–15).
        assertTrue((even.r - odd.r) >= 7,
            'Разница по R-каналу должна быть не менее 7 (контрастней, чем было)');
    });
});

// Task 246 (бекпорт Tasks 242-243 из kip8): SW-блок версии v505 удалён —
// версия v506 введена в Task 247 (см. describe ниже). Историческая заметка.

// Task 247: дата «за ДД.ММ.ГГГГ г.» в строке «Последние показания» — единый
// неразрывный блок. При нехватке ширины (мобильные экраны) весь текст
// «за 29.08.2026 г.» переносится на новую строку ЦЕЛИКОМ, а не по словам:
//   • white-space: nowrap на .flow-detail-date-inline / .flow-summary-date-inline
//   • пробел-разделитель вынесен ЗА пределы span даты (единственная точка
//     переноса — между названием «Последние показания» и блоком даты)
describe('Task 247: дата «за ДД.ММ.ГГГГ г.» — неразрывный блок (детальная карточка)', () => {
    const fs = require('fs');
    const path = require('path');
    const htmlPath = path.resolve(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    test('CSS: .flow-detail-date-inline имеет white-space: nowrap', () => {
        const re = /\.flow-detail-label \.flow-detail-date-inline\s*\{[^}]*white-space:\s*nowrap/;
        assertTrue(re.test(html),
            'Правило .flow-detail-label .flow-detail-date-inline должно содержать white-space: nowrap — иначе дата рвётся по словам');
    });

    test('HTML: блок даты начинается с «за» БЕЗ ведущего пробела внутри span', () => {
        // Task 368: дата вычисляется в переменной lastDateInline (для
        // периодных — «за ДД.ММ–ДД.ММ.ГГГГ») и начинается с «за »
        assertTrue(html.indexOf("var lastDateInline = 'за ' + this._fmtDate(m.dateCurr)") !== -1,
            'блок даты начинается сразу с «за» (без пробела внутри)');
        assertTrue(html.indexOf('<span class="flow-detail-date-inline"> за ') === -1,
            'Старый паттерн с пробелом внутри span не должен остаться (пробел внутри nowrap-блока запретил бы перенос между названием и датой)');
    });

    test('HTML: пробел-разделитель ВНЕ span (перенос между названием и датой)', () => {
        // Task 368: lastReadingLabel + ' <span class="flow-detail-date-inline">' + lastDateInline
        // (пробел — внутри строкового литерала, но ЗА пределами HTML-тега span)
        const re = /lastReadingLabel \+\s*' <span class="flow-detail-date-inline">' \+ lastDateInline/;
        assertTrue(re.test(html),
            'Пробел между «Последние показания» и span даты должен быть снаружи — единственная точка переноса строки');
    });
});

describe('Task 247: то же для карточек списка расходомеров', () => {
    const fs = require('fs');
    const path = require('path');
    const htmlPath = path.resolve(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    test('CSS: .flow-summary-date-inline имеет white-space: nowrap', () => {
        const re = /\.flow-summary-label \.flow-summary-date-inline\s*\{[^}]*white-space:\s*nowrap/;
        assertTrue(re.test(html),
            'Правило .flow-summary-label .flow-summary-date-inline должно содержать white-space: nowrap');
    });

    test('HTML: блок даты начинается с «за» БЕЗ ведущего пробела внутри span', () => {
        // Task 368: дата вычисляется в переменной lastDateInline368 (для
        // периодных — «за ДД.ММ–ДД.ММ.ГГГГ») и начинается с «за »
        assertTrue(html.indexOf("var lastDateInline368 = 'за ' + this._fmtDate(m.dateCurr)") !== -1,
            'span даты в карточке списка начинается сразу с «за»');
        assertTrue(html.indexOf('<span class="flow-summary-date-inline"> за ') === -1,
            'Старый паттерн с пробелом внутри span не должен остаться в карточках списка');
    });

    test('HTML: пробел-разделитель ВНЕ span в renderList', () => {
        // Task 368: «Последние показания <span class="flow-summary-date-inline">' + lastDateInline368
        const re = /Последние показания <span class="flow-summary-date-inline">' \+ lastDateInline368/;
        assertTrue(re.test(html),
            'Между «Последние показания» и span даты должен стоять пробел снаружи span');
    });
});

// Task 247: SW-блок версии v506 удалён — версия v507 введена в Task 248
// (см. describe ниже). Историческая заметка.

// Task 248: столбец «Комментарий» таблицы «Хронология показаний» — текст
// размещается максимум в 4 строки; если при этой ширине столбца весь текст
// не помещается, ширина столбца подгоняется (не меняя 4 строк) так, чтобы
// помещался ВЕСЬ текст. Причина бага: эвристика Task 221
// ceil(naturalWidth / 4) + 10 делила текст на 4 равные части, а реальный
// перенос — по границам слов (комментарий «В показаниях значения за период
// двух суток 28-29.08.2026» → 5 строк, 5-я срезалась max-height:5.2em).
// Фикс: бинарный поиск минимальной ширины по РЕАЛЬНОЙ высоте ячейки.
describe('Task 248: ширина столбца «Комментарий» — весь текст в 4 строки (бинарный поиск)', () => {
    const fs = require('fs');
    const path = require('path');
    const htmlPath = path.resolve(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    test('JS: MAX_LINES = 4 в _applyOptimalWidth', () => {
        const re = /_applyOptimalWidth:\s*function[^]*?var MAX_LINES = 4;/;
        assertTrue(re.test(html),
            'В _applyOptimalWidth должна быть константа MAX_LINES = 4 (максимум 4 строки по ТЗ)');
    });

    test('JS: бинарный поиск минимальной ширины (while hi-lo и Math.floor)', () => {
        assertTrue(html.indexOf('while (hi - lo > 1)') !== -1,
            'Должен быть бинарный поиск: while (hi - lo > 1)');
        const re = /var mid = Math\.floor\(\(lo \+ hi\) \/ 2\);/;
        assertTrue(re.test(html),
            'Должен быть бинарный поиск: mid = Math.floor((lo + hi) / 2)');
    });

    test('JS: порог высоты = 4 строки (maxAllowedHeight из lineHeight)', () => {
        const re = /var maxAllowedHeight = MAX_LINES \* lineHeightPx \+ 1;/;
        assertTrue(re.test(html),
            'Порог высоты должен считаться как MAX_LINES * lineHeightPx + 1 (реальная высота 4 строк + допуск округления)');
        assertTrue(html.indexOf('getComputedStyle(measured[0].cell, null)') !== -1,
            'lineHeight должен браться из computed style ячейки');
    });

    test('JS: старая эвристика Task 221 ceil(maxNatural / 4) удалена', () => {
        const re = /Math\.ceil\(maxNatural\s*\/\s*4\)/;
        assertTrue(!re.test(html),
            'Эвристика ceil(maxNatural / 4) не должна остаться — она не учитывает границы слов');
        assertTrue(html.indexOf('fourLineWidth') === -1,
            'Переменная fourLineWidth (эвристика Task 221) должна быть удалена');
    });

    test('JS: _measureArchiveCellHeight — реальная высота при white-space: normal', () => {
        const re = /_measureArchiveCellHeight:\s*function\s*\(cell,\s*widthPx\)/;
        assertTrue(re.test(html),
            'Должен быть helper _measureArchiveCellHeight(cell, widthPx)');
        const reW = /' width:' \+ widthPx \+ 'px !important;'/;
        assertTrue(reW.test(html),
            'Измерение должно идти при фиксированной ширине width:widthPx');
        assertTrue(html.indexOf('white-space:normal !important') !== -1,
            'Измерение должно идти при white-space:normal (реальный перенос по словам, а не nowrap)');
        const reH = /var h = cell\.scrollHeight;/;
        assertTrue(reH.test(html),
            'Высота должна измеряться через cell.scrollHeight');
    });

    test('JS: результат применяется как min-width И max-width (механика Task 221)', () => {
        const reMin = /cells\[j\]\.style\.minWidth = candidate \+ 'px';/;
        const reMax = /cells\[j\]\.style\.maxWidth = candidate \+ 'px';/;
        assertTrue(reMin.test(html) && reMax.test(html),
            'candidate должен применяться как min-width + max-width на все inner-div столбца');
    });

    test('JS: guard при скрытом контейнере (измерения 0) — ширина не применяется', () => {
        assertTrue(html.indexOf('if (headerNatural <= 0) return;') !== -1,
            'Guard: headerNatural <= 0 → return (скрытый контейнер, CSS-fallback)');
        assertTrue(html.indexOf('if (measured.length === 0) return;') !== -1,
            'Guard: measured.length === 0 → return (все измерения 0, CSS-fallback)');
    });

    test('JS: алгоритм применяется к обоим столбцам (Комментарий + Замечания)', () => {
        assertTrue(html.indexOf('this._applyOptimalWidth(commentCells, commentTh);') !== -1,
            'Должен вызываться для столбца «Комментарий»');
        assertTrue(html.indexOf('this._applyOptimalWidth(anomalyCells, anomalyTh);') !== -1,
            'Должен вызываться для столбца «⚠ Замечания»');
    });
});

describe('Task 248: CSS-отсечка «4 строки» сохранена (safety cap)', () => {
    const fs = require('fs');
    const path = require('path');
    const htmlPath = path.resolve(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    test('CSS: .flow-archive-comment-inner — max-height: 5.2em + overflow: hidden', () => {
        const re = /\.flow-archive-table \.flow-archive-comment-inner\s*\{[^}]*max-height:\s*5\.2em;[^}]*overflow:\s*hidden;/;
        assertTrue(re.test(html),
            'Отсечка 4 строки (4 × 1.3em = 5.2em) должна остаться как safety cap');
    });

    test('CSS: .flow-archive-comment — перенос слов разрешён (white-space: normal)', () => {
        const re = /\.flow-archive-table \.flow-archive-comment\s*\{[^}]*white-space:\s*normal;[^}]*word-break:\s*break-word;/;
        assertTrue(re.test(html),
            'Ячейка комментария должна переносить текст по словам (white-space: normal + word-break: break-word)');
    });
});

// Task 248: SW-блок версии v507 удалён — версия v508 введена в Task 249
// (SW-тест v508 находится в tests/test-work-schedule.js). Историческая заметка.
