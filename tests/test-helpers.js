// ============================================================
// Минимальный тестовый фреймворк для КИПиА
// ============================================================
// Без внешних зависимостей (не требует npm install).
// Запускается через: node tests/run-all.js
//
// Поддерживаемые assertions:
//   assertEqual(actual, expected, message)        — строгое равенство
//   assertStrictEqual(actual, expected, message)  — Object.is
//   assertApprox(actual, expected, eps, message)  — равенство с погрешностью
//   assertThrows(fn, message)                     — функция должна бросить
//   assertNotThrows(fn, message)                  — функция не должна бросить
//   assertTrue(value, message)                    — приведение к true
//   assertFalse(value, message)                   — приведение к false
//
// Все assertion-функции бросают AssertionError при провале.
// Это позволяет xtest() перехватывать провал через try/catch.
// ============================================================

// Кастомное исключение для assertion-провалов.
// Имеет свойство _isAssertionError, чтобы отличать от случайных ошибок.
class AssertionError extends Error {
    constructor(message, details) {
        super(message);
        this.name = 'AssertionError';
        this.details = details;
        this._isAssertionError = true;
    }
}

let _tests = [];
let _currentGroup = '';
let _currentTest = '';
let _passed = 0;
let _failed = 0;
let _failures = [];

// Регистрация теста. test(name, fn) — fn может быть синхронным или async.
function test(name, fn) {
    _tests.push({ name: name, fn: fn, group: _currentGroup });
}

// Группировка тестов (для отчёта)
function describe(groupName, fn) {
    const prevGroup = _currentGroup;
    _currentGroup = groupName;
    fn();
    _currentGroup = prevGroup;
}

// ===== Assertions =====
// Все функции бросают AssertionError при провале.
// При успехе — ничего не делают (тихо возвращаются).

function _formatValue(v) {
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : String(v);
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (Array.isArray(v)) return '[' + v.map(_formatValue).join(', ') + ']';
    if (typeof v === 'object') {
        try { return JSON.stringify(v); } catch { return String(v); }
    }
    return String(v);
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new AssertionError(
            message || 'assertEqual failed',
            `expected ${_formatValue(expected)}, got ${_formatValue(actual)}`
        );
    }
}

function assertStrictEqual(actual, expected, message) {
    if (!Object.is(actual, expected)) {
        throw new AssertionError(
            message || 'assertStrictEqual failed',
            `expected ${_formatValue(expected)} (strict), got ${_formatValue(actual)}`
        );
    }
}

function assertApprox(actual, expected, eps, message) {
    if (typeof actual !== 'number' || typeof expected !== 'number') {
        throw new AssertionError(
            message || 'assertApprox failed',
            `non-number operand: actual=${_formatValue(actual)}, expected=${_formatValue(expected)}`
        );
    }
    if (Math.abs(actual - expected) > eps) {
        throw new AssertionError(
            message || 'assertApprox failed',
            `expected ${expected} ± ${eps}, got ${actual} (diff=${actual - expected})`
        );
    }
}

function assertThrows(fn, message) {
    try {
        fn();
    } catch (e) {
        if (e._isAssertionError) throw e;  // пробрасываем assertion-ошибки
        return;  // ожидаемое исключение
    }
    throw new AssertionError(
        message || 'assertThrows failed',
        'expected function to throw, but it did not'
    );
}

function assertNotThrows(fn, message) {
    try {
        fn();
    } catch (e) {
        if (e._isAssertionError) throw e;  // пробрасываем assertion-ошибки
        throw new AssertionError(
            message || 'assertNotThrows failed',
            `expected function not to throw, but it threw: ${e.message}`
        );
    }
}

function assertTrue(value, message) {
    if (!value) {
        throw new AssertionError(
            message || 'assertTrue failed',
            `expected truthy, got ${_formatValue(value)}`
        );
    }
}

function assertFalse(value, message) {
    if (value) {
        throw new AssertionError(
            message || 'assertFalse failed',
            `expected falsy, got ${_formatValue(value)}`
        );
    }
}

// ===== Внутренние счётчики =====
// Используются только для итоговой статистики. Сами assertion-функции
// бросают AssertionError, а runAll() их ловит и обновляет счётчики.

function _recordPass() {
    _passed++;
}

function _recordFail(group, test, details) {
    _failed++;
    _failures.push({ group: group, test: test, details: details });
}

// ===== Запуск всех тестов =====

async function runAll() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Тесты КИПиА — запуск ' + _tests.length + ' тестов');
    console.log('═══════════════════════════════════════════════════════════\n');

    const startTime = Date.now();
    let lastGroup = '';

    for (const t of _tests) {
        if (t.group !== lastGroup) {
            if (lastGroup) console.log('');
            console.log('▶ ' + (t.group || '(без группы)'));
            lastGroup = t.group;
        }
        _currentTest = t.name;
        _currentGroup = t.group;
        process.stdout.write('  • ' + t.name + ' ... ');
        try {
            await t.fn();
            _recordPass();
            console.log('\x1b[32m✓\x1b[0m');
        } catch (e) {
            if (e._isAssertionError) {
                _recordFail(t.group, t.name, e.details);
            } else {
                _recordFail(t.group, t.name, 'EXCEPTION: ' + (e.stack || e.message || String(e)));
            }
            console.log('\x1b[31m✗\x1b[0m');
        }
        _currentTest = '';
    }

    const elapsed = Date.now() - startTime;
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Результат: \x1b[32m' + _passed + ' passed\x1b[0m, \x1b[31m' + _failed + ' failed\x1b[0m, ' + _tests.length + ' total (' + elapsed + ' ms)');

    if (_failures.length > 0) {
        console.log('\n── Ошибки ──────────────────────────────────────────────────');
        for (const f of _failures) {
            console.log('  [' + (f.group || '?') + '] ' + f.test);
            console.log('    → ' + f.details);
        }
        console.log('');
    }
    console.log('═══════════════════════════════════════════════════════════\n');

    return _failed === 0 ? 0 : 1;
}

// Экспорт для CommonJS (Node.js)
module.exports = {
    test, describe,
    assertEqual, assertStrictEqual, assertApprox,
    assertThrows, assertNotThrows, assertTrue, assertFalse,
    runAll,
    AssertionError,
    _tests  // экспортируем для xtest() в test-thermocouple.js
};
