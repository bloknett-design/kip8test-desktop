// Тесты функции calcTcVoltage — термо-ЭДС термопар
//
// Эталонные значения по NIST ITS-90 (SRD 60), вычислены через
// Python-библиотеку thermocouples_reference.
//
// Все коэффициенты полиномов НИСТ выверены по NIST Standard Reference
// Database 60 (версия 2.0). Функция calcTcVoltage() теперь работает
// корректно для всех 8 типов термопар: K, J, T, N, E, R, S, B.

const { test, describe, assertApprox, assertTrue } = require('./test-helpers.js');
const { extractFunctions } = require('./extract-functions.js');
const fns = extractFunctions();

// Допуски: полиномы НИСТ дают точность ~0.001 мВ, но мы используем
// округление до 3 знаков — берём ε = 0.05 мВ
const EPS = 0.05;

// Эталонные значения по NIST ITS-90 (SRD 60):
// K(100)=4.096, K(500)=20.644, K(1000)=41.276
// J(100)=5.269, J(500)=27.393
// T(100)=4.279, T(200)=9.288, T(400)=20.872
// N(100)=2.774, N(500)=16.748, N(1000)=36.256
// E(100)=6.319, E(500)=37.005, E(1000)=76.373
// R(100)=0.647, R(500)=4.471, R(1000)=10.506
// S(100)=0.646, S(500)=4.233, S(1000)=9.587
// B(0)≈0, B(500)=1.242, B(1000)=4.834, B(1500)=10.099

describe('ТХА (K) — хромель-алюмель', () => {

    test('E(0°C) = 0.000 мВ', () => {
        assertApprox(fns.calcTcVoltage(0, 'K'), 0.000, EPS);
    });

    test('E(100°C) = 4.096 мВ', () => {
        assertApprox(fns.calcTcVoltage(100, 'K'), 4.096, EPS);
    });

    test('E(500°C) = 20.644 мВ', () => {
        assertApprox(fns.calcTcVoltage(500, 'K'), 20.644, EPS);
    });

    test('E(1000°C) = 41.276 мВ', () => {
        assertApprox(fns.calcTcVoltage(1000, 'K'), 41.276, EPS);
    });

    test('E(1372°C) ≈ 54.886 мВ (верхняя граница)', () => {
        assertApprox(fns.calcTcVoltage(1372, 'K'), 54.886, 0.5);
    });

    test('E(-200°C) ≈ -5.891 мВ (нижняя граница)', () => {
        assertApprox(fns.calcTcVoltage(-200, 'K'), -5.891, 0.5);
    });

    test('Монотонно возрастает с температурой', () => {
        const temps = [-100, 0, 100, 500, 1000];
        let prev = -Infinity;
        for (const t of temps) {
            const e = fns.calcTcVoltage(t, 'K');
            assertTrue(e > prev, 'E должно возрастать: ' + t);
            prev = e;
        }
    });
});

describe('ТЖК (J) — железо-константан', () => {

    test('E(0°C) = 0.000 мВ', () => {
        assertApprox(fns.calcTcVoltage(0, 'J'), 0.000, EPS);
    });

    test('E(100°C) = 5.269 мВ', () => {
        assertApprox(fns.calcTcVoltage(100, 'J'), 5.269, EPS);
    });

    test('E(500°C) = 27.393 мВ', () => {
        assertApprox(fns.calcTcVoltage(500, 'J'), 27.393, EPS);
    });

    test('E(750°C) = 42.283 мВ', () => {
        assertApprox(fns.calcTcVoltage(750, 'J'), 42.283, EPS);
    });
});

describe('ТМК (T) — медь-константан', () => {

    test('E(0°C) = 0.000 мВ', () => {
        assertApprox(fns.calcTcVoltage(0, 'T'), 0.000, EPS);
    });

    test('E(100°C) = 4.279 мВ (исправлено — ранее баг -299.7)', () => {
        assertApprox(fns.calcTcVoltage(100, 'T'), 4.279, EPS);
    });

    test('E(200°C) = 9.288 мВ (исправлено — ранее баг -30442)', () => {
        assertApprox(fns.calcTcVoltage(200, 'T'), 9.288, EPS);
    });

    test('E(400°C) = 20.872 мВ (верхняя граница диапазона)', () => {
        assertApprox(fns.calcTcVoltage(400, 'T'), 20.872, 0.1);
    });

    test('E(-100°C) = -3.379 мВ (отрицательная температура, исправлено)', () => {
        assertApprox(fns.calcTcVoltage(-100, 'T'), -3.379, 0.2);
    });

    test('E(-200°C) = -5.603 мВ (нижняя граница)', () => {
        assertApprox(fns.calcTcVoltage(-200, 'T'), -5.603, 0.5);
    });
});

describe('ТНН (N) — никросил-нисил', () => {

    test('E(0°C) = 0.000 мВ', () => {
        assertApprox(fns.calcTcVoltage(0, 'N'), 0.000, EPS);
    });

    test('E(100°C) = 2.774 мВ (исправлено — ранее баг -1130)', () => {
        assertApprox(fns.calcTcVoltage(100, 'N'), 2.774, EPS);
    });

    test('E(500°C) = 16.748 мВ (исправлено — ранее баг -2.2e8)', () => {
        // Значение по NIST ITS-90 = 16.748 мВ (не 13.740, как я ошибочно писал раньше)
        assertApprox(fns.calcTcVoltage(500, 'N'), 16.748, 0.2);
    });

    test('E(1000°C) = 36.256 мВ', () => {
        assertApprox(fns.calcTcVoltage(1000, 'N'), 36.256, 0.5);
    });

    test('E(1300°C) = 47.513 мВ (верхняя граница)', () => {
        assertApprox(fns.calcTcVoltage(1300, 'N'), 47.513, 1.0);
    });
});

describe('ТХКн (E) — хромель-константан', () => {

    test('E(0°C) = 0.000 мВ', () => {
        assertApprox(fns.calcTcVoltage(0, 'E'), 0.000, EPS);
    });

    test('E(100°C) = 6.319 мВ', () => {
        assertApprox(fns.calcTcVoltage(100, 'E'), 6.319, 0.05);
    });

    test('E(500°C) = 37.005 мВ', () => {
        // Значение по NIST ITS-90 = 37.005 мВ
        assertApprox(fns.calcTcVoltage(500, 'E'), 37.005, 0.2);
    });

    test('E(1000°C) = 76.373 мВ', () => {
        assertApprox(fns.calcTcVoltage(1000, 'E'), 76.373, 0.5);
    });
});

describe('ТПП (R) — платинородий-платина 13%', () => {

    test('E(0°C) = 0.000 мВ', () => {
        assertApprox(fns.calcTcVoltage(0, 'R'), 0.000, EPS);
    });

    test('E(100°C) = 0.647 мВ', () => {
        assertApprox(fns.calcTcVoltage(100, 'R'), 0.647, EPS);
    });

    test('E(500°C) = 4.471 мВ', () => {
        assertApprox(fns.calcTcVoltage(500, 'R'), 4.471, 0.1);
    });

    test('E(1000°C) = 10.506 мВ (исправлено — ранее расхождение)', () => {
        assertApprox(fns.calcTcVoltage(1000, 'R'), 10.506, 0.5);
    });
});

describe('ТПП (S) — платинородий-платина 10%', () => {

    test('E(0°C) = 0.000 мВ', () => {
        assertApprox(fns.calcTcVoltage(0, 'S'), 0.000, EPS);
    });

    test('E(100°C) = 0.646 мВ (исправлено — ранее баг 0.106)', () => {
        assertApprox(fns.calcTcVoltage(100, 'S'), 0.646, EPS);
    });

    test('E(500°C) = 4.233 мВ (исправлено — ранее баг 1.534)', () => {
        assertApprox(fns.calcTcVoltage(500, 'S'), 4.233, 0.1);
    });

    test('E(1000°C) = 9.587 мВ (исправлено — ранее баг 4.189)', () => {
        assertApprox(fns.calcTcVoltage(1000, 'S'), 9.587, 0.2);
    });

    test('E(1768°C) ≈ 18.691 мВ (плавление платины)', () => {
        assertApprox(fns.calcTcVoltage(1768, 'S'), 18.691, 0.5);
    });
});

describe('ТПР (B) — платинородий-платинородий 30%/6%', () => {

    test('E(0°C) ≈ 0 мВ', () => {
        // Эталон -0.003, функция даёт ~0
        assertApprox(fns.calcTcVoltage(0, 'B'), 0, 0.05);
    });

    test('E(500°C) = 1.242 мВ (исправлено — ранее расхождение 1.44)', () => {
        assertApprox(fns.calcTcVoltage(500, 'B'), 1.242, 0.1);
    });

    test('E(1000°C) = 4.834 мВ (исправлено — ранее баг 0.19)', () => {
        assertApprox(fns.calcTcVoltage(1000, 'B'), 4.834, 0.1);
    });

    test('E(1500°C) = 10.099 мВ (исправлено — ранее баг 0.26)', () => {
        assertApprox(fns.calcTcVoltage(1500, 'B'), 10.099, 0.2);
    });

    test('E(1820°C) = 13.820 мВ (верхняя граница, исправлено)', () => {
        assertApprox(fns.calcTcVoltage(1820, 'B'), 13.820, 0.5);
    });
});

describe('Сравнение термопар — относительная чувствительность', () => {

    test('E (ТХКн) > J (ТЖК) > T (ТМК) > K (ТХА) при 100°C', () => {
        // При 100°C: E=6.319, J=5.269, T=4.279, K=4.096
        // T чувствительнее K при низких температурах
        const eK = fns.calcTcVoltage(100, 'K');
        const eJ = fns.calcTcVoltage(100, 'J');
        const eT = fns.calcTcVoltage(100, 'T');
        const eE = fns.calcTcVoltage(100, 'E');
        assertTrue(eE > eJ, 'E > J: ' + eE + ' > ' + eJ);
        assertTrue(eJ > eT, 'J > T: ' + eJ + ' > ' + eT);
        assertTrue(eT > eK, 'T > K: ' + eT + ' > ' + eK);
    });

    test('S и R (платиновые) < K (хромель-алюмель) при 1000°C', () => {
        const eK = fns.calcTcVoltage(1000, 'K');
        const eS = fns.calcTcVoltage(1000, 'S');
        const eR = fns.calcTcVoltage(1000, 'R');
        assertTrue(eS < eK && eR < eK, 'платиновые < K при 1000°C');
    });

    test('B (ТПР) — самый низкий сигнал при 500°C', () => {
        // B даёт ~1.242 мВ при 500°C, тогда как K — 20.644 мВ
        const eB = fns.calcTcVoltage(500, 'B');
        const eK = fns.calcTcVoltage(500, 'K');
        assertTrue(eB < eK, 'B должен быть меньше K');
        assertTrue(eB < 2, 'B(500) должно быть < 2 мВ');
    });
});

