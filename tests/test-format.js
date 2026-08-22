// Тесты функций форматирования чисел:
//   parseLocaleNumber, formatNumber, roundNumber, formatBuoyNumber

const { test, describe, assertEqual, assertApprox, assertTrue, assertFalse } = require('./test-helpers.js');
const { extractFunctions } = require('./extract-functions.js');
const fns = extractFunctions();

describe('parseLocaleNumber — парсинг числа с русской запятой', () => {

    test('Парсит число с запятой как десятичным разделителем', () => {
        assertApprox(fns.parseLocaleNumber('3,14'), 3.14, 0.0001, '3,14 → 3.14');
    });

    test('Парсит число с точкой как десятичным разделителем', () => {
        assertApprox(fns.parseLocaleNumber('3.14'), 3.14, 0.0001, '3.14 → 3.14');
    });

    test('Парсит целое число в виде строки', () => {
        assertEqual(fns.parseLocaleNumber('42'), 42, '"42" → 42');
    });

    test('Парсит целое число в виде числа (не строка)', () => {
        assertEqual(fns.parseLocaleNumber(42), 42, '42 → 42');
    });

    test('Парсит отрицательное число', () => {
        assertApprox(fns.parseLocaleNumber('-2,5'), -2.5, 0.0001, '-2,5 → -2.5');
    });

    test('Парсит число с запятой и пробелами', () => {
        assertApprox(fns.parseLocaleNumber('  1,5  '), 1.5, 0.0001, '  1,5  → 1.5');
    });

    test('Возвращает NaN для пустой строки', () => {
        assertTrue(isNaN(fns.parseLocaleNumber('')), '"" → NaN');
    });

    test('Возвращает NaN для нечисловой строки', () => {
        assertTrue(isNaN(fns.parseLocaleNumber('abc')), '"abc" → NaN');
    });

    test('Парсит число в экспоненциальной записи', () => {
        assertApprox(fns.parseLocaleNumber('1e3'), 1000, 0.0001, '"1e3" → 1000');
    });

    test('Парсит ноль', () => {
        assertEqual(fns.parseLocaleNumber('0'), 0, '"0" → 0');
    });
});

describe('formatNumber — форматирование числа с русской запятой', () => {

    test('Возвращает "0" для нуля', () => {
        assertEqual(fns.formatNumber(0), '0', '0 → "0"');
    });

    test('Форматирует число от 1 до 100 с 4 знаками после запятой', () => {
        // Math.abs(n) >= 1 → 4 decimal places, но parseFloat убирает trailing zeros
        assertEqual(fns.formatNumber(3.14159), '3,1416', '3.14159 → "3,1416"');
    });

    test('Форматирует целое число без дробной части', () => {
        // 42 → toFixed(4) = "42.0000" → parseFloat = 42 → "42"
        assertEqual(fns.formatNumber(42), '42', '42 → "42"');
    });

    test('Форматирует число от 100 до 1e9 с 2 знаками после запятой', () => {
        // Math.abs(n) >= 100 → 2 decimal places
        assertEqual(fns.formatNumber(123.456), '123,46', '123.456 → "123,46"');
    });

    test('Форматирует малое число (< 1) с 6 знаками после запятой', () => {
        // Math.abs(n) < 1 → 6 decimal places
        assertEqual(fns.formatNumber(0.123456789), '0,123457', '0.123456789 → "0,123457"');
    });

    test('Использует экспоненциальную запись для очень больших чисел', () => {
        // >= 1e9 → exponential
        const result = fns.formatNumber(1e10);
        assertTrue(result.includes('e+'), '1e10 → экспонента');
    });

    test('Использует экспоненциальную запись для очень малых чисел', () => {
        // < 0.00001 → exponential
        const result = fns.formatNumber(0.0000001);
        assertTrue(result.includes('e-'), '0.0000001 → экспонента');
    });

    test('Форматирует отрицательное число', () => {
        assertEqual(fns.formatNumber(-3.14), '-3,14', '-3.14 → "-3,14"');
    });

    test('Использует запятую как разделитель (не точку)', () => {
        const result = fns.formatNumber(1.5);
        assertTrue(result.includes(','), 'должна быть запятая');
        assertFalse(result.includes('.'), 'не должно быть точки');
    });

    // Новые тесты для разделения разрядов неразрывным пробелом
    test('Разделяет разряды больших чисел неразрывным пробелом', () => {
        // 1234567.89 → "1 234 567,89" (с неразрывным пробелом \u00A0)
        const result = fns.formatNumber(1234567.89);
        assertTrue(result.includes('\u00A0'), 'должен быть неразрывный пробел');
        assertTrue(result.startsWith('1\u00A0'), 'должно начинаться с "1 "');
        // Проверяем, что нет обычного пробела (только неразрывный)
        assertFalse(result.includes(' '), 'не должно быть обычного пробела');
    });

    test('Не разделяет разряды для чисел < 1000', () => {
        // 42 → "42" (без разделения)
        const result = fns.formatNumber(42);
        assertFalse(result.includes('\u00A0'), 'не должно быть пробелов');
    });

    test('Разделяет только целую часть (не дробную)', () => {
        // 1234.5678 → "1 234,5678" — разделение только до запятой
        const result = fns.formatNumber(1234.5678);
        const parts = result.split(',');
        assertTrue(parts[0].includes('\u00A0'), 'целая часть должна иметь пробел');
        assertFalse(parts[1].includes('\u00A0'), 'дробная часть не должна иметь пробелов');
    });

    test('Разделяет разряды отрицательных больших чисел', () => {
        // -1234567 → "-1 234 567"
        const result = fns.formatNumber(-1234567);
        assertTrue(result.startsWith('-1\u00A0'), 'отрицательное число с разделением');
        assertTrue(result.includes('\u00A0'), 'есть неразрывный пробел');
    });
});

describe('roundNumber — округление до 2 значащих цифр', () => {

    test('Возвращает "0" для нуля', () => {
        assertEqual(fns.roundNumber(0), '0', '0 → "0"');
    });

    test('Округляет 123.456 до 2 значащих цифр', () => {
        // 123.456 → 2 sig figs → 120
        const result = fns.roundNumber(123.456);
        assertTrue(result.startsWith('120'), '123.456 → ~120');
    });

    test('Округляет 0.001234 до 2 значащих цифр', () => {
        // 0.001234 → 2 sig figs → 0.0012
        const result = fns.roundNumber(0.001234);
        assertTrue(result.includes('0,0012') || result.includes('0.0012'), '0.001234 → ~0.0012');
    });

    test('Использует запятую как разделитель', () => {
        const result = fns.roundNumber(1.5);
        assertTrue(result.includes(','), 'должна быть запятая');
    });

    test('Разделяет разряды больших чисел неразрывным пробелом', () => {
        // 1234567 → ~1 200 000
        const result = fns.roundNumber(1234567);
        assertTrue(result.includes('\u00A0'), 'должен быть неразрывный пробел для больших чисел');
    });
});

describe('formatBuoyNumber — форматирование для буйковых уровнемеров', () => {

    test('Возвращает "0" для нуля', () => {
        assertEqual(fns.formatBuoyNumber(0), '0', '0 → "0"');
    });

    test('Использует экспоненциальную запись для очень малых чисел', () => {
        const result = fns.formatBuoyNumber(0.00005);
        assertTrue(result.includes('e-'), '0.00005 → экспонента');
    });

    test('Форматирует число >= 100 с 2 знаками', () => {
        assertEqual(fns.formatBuoyNumber(123.456), '123,46', '123.456 → "123,46"');
    });

    test('Форматирует число 1..100 с 3 знаками', () => {
        assertEqual(fns.formatBuoyNumber(12.3456), '12,346', '12.3456 → "12,346"');
    });

    test('Форматирует число < 1 с 4 знаками', () => {
        assertEqual(fns.formatBuoyNumber(0.12345), '0,1235', '0.12345 → "0,1235"');
    });

    test('Использует запятую как разделитель', () => {
        const result = fns.formatBuoyNumber(1.5);
        assertTrue(result.includes(','), 'должна быть запятая');
    });

    test('Разделяет разряды больших чисел неразрывным пробелом', () => {
        const result = fns.formatBuoyNumber(1234567);
        assertTrue(result.includes('\u00A0'), 'должен быть неразрывный пробел');
    });
});
