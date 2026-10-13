// Тесты функций термометров сопротивления:
//   calcRtdResistance (платиновые Pt), calcCuResistance (медные Cu)
//
// Эталонные значения:
//   - ГОСТ 6651-2009 для Pt100 (α=0.00385, IEC 60751)
//   - Простая формула для Cu: R(t) = R₀·(1 + α·t)
//
// Источник табличных значений:
//   - IEC 60751 / ГОСТ 6651-2009, Приложение А
//   - Для Pt100: R(0°C)=100, R(100°C)=138.5, R(-50°C)=80.31

const { test, describe, assertApprox, assertTrue } = require('./test-helpers.js');
const { extractFunctions } = require('./extract-functions.js');
const fns = extractFunctions();

describe('calcCuResistance — медные ТС (ГОСТ 6651-2009)', () => {

    // Формула: R(t) = R₀·(1 + α·t) при t ≥ 0; ниже 0 °C для α = 0,00428 —
    // формула 5.2.3 ГОСТ 6651-2009: R(t) = R₀·[1 + At + Bt(t+6,7) + Ct³]
    // (Task 499: R(−50) = 39,2275 для Cu50 — раньше линейно 39,3)
    // Для Cu50 (α=0.00428): R(0)=50, R(100)=50·(1+0.00428·100)=50·1.428=71.4

    test('Cu50 (α=0.00428): R(0°C) = 50 Ом', () => {
        const r = fns.calcCuResistance(0, 50, 0.00428);
        assertApprox(r, 50, 0.001, 'R(0) = R₀');
    });

    test('Cu50 (α=0.00428): R(100°C) = 71.4 Ом', () => {
        // 50·(1 + 0.00428·100) = 50·1.428 = 71.4
        const r = fns.calcCuResistance(100, 50, 0.00428);
        assertApprox(r, 71.4, 0.01);
    });

    test('Cu50 (α=0.00428): R(-50°C) = 39.2275 Ом (ГОСТ 5.2.3, Task 499)', () => {
        // Task 499: ниже 0 °C — формула 5.2.3 ГОСТ 6651-2009
        // 50·(1 + 4.28e-3·(-50) - 6.2032e-7·(-50)·(-43.3) + 8.5154e-10·(-50)³)
        // = 50·0.784550… = 39.2275 (таблица А.3: 78.46 на 100 Ом)
        const r = fns.calcCuResistance(-50, 50, 0.00428);
        assertApprox(r, 39.2275, 0.001);
    });

    test('Cu100 (α=0.00428): R(100°C) = 142.8 Ом', () => {
        // 100·(1 + 0.00428·100) = 100·1.428 = 142.8
        const r = fns.calcCuResistance(100, 100, 0.00428);
        assertApprox(r, 142.8, 0.01);
    });

    test('Cu50 (α=0.00426): R(100°C) с другим α', () => {
        // 50·(1 + 0.00426·100) = 50·1.426 = 71.3
        const r = fns.calcCuResistance(100, 50, 0.00426);
        assertApprox(r, 71.3, 0.01);
    });

    test('Линейность: R(50) = (R(0) + R(100))/2', () => {
        const r0 = fns.calcCuResistance(0, 50, 0.00428);
        const r50 = fns.calcCuResistance(50, 50, 0.00428);
        const r100 = fns.calcCuResistance(100, 50, 0.00428);
        assertApprox(r50, (r0 + r100) / 2, 0.001, 'линейная характеристика');
    });

    test('R₀ масштабируется: Cu100 = 2× Cu50 при той же t', () => {
        const r50 = fns.calcCuResistance(75, 50, 0.00428);
        const r100 = fns.calcCuResistance(75, 100, 0.00428);
        assertApprox(r100 / r50, 2, 0.0001);
    });
});

describe('calcRtdResistance — платиновые ТС (квадратичная характеристика)', () => {

    // Формула для Pt100 (IEC 60751, α=0.00385):
    //   при t >= 0: R(t) = R₀·(1 + A·t + B·t²)
    //   A = 3.9083e-3, B = -5.775e-7
    // Эталонные значения:
    //   R(0) = 100.00
    //   R(100) = 138.51
    //   R(-50) = 80.31
    //   R(200) = 175.86
    //   R(500) = 280.93

    test('Pt100 (IEC): R(0°C) = 100 Ом', () => {
        const r = fns.calcRtdResistance(0, 100, 'pt1385');
        assertApprox(r, 100.00, 0.01);
    });

    test('Pt100 (IEC): R(100°C) = 138.51 Ом', () => {
        const r = fns.calcRtdResistance(100, 100, 'pt1385');
        assertApprox(r, 138.51, 0.02);
    });

    test('Pt100 (IEC): R(200°C) = 175.86 Ом', () => {
        const r = fns.calcRtdResistance(200, 100, 'pt1385');
        assertApprox(r, 175.86, 0.05);
    });

    test('Pt100 (IEC): R(500°C) = 280.93 Ом', () => {
        const r = fns.calcRtdResistance(500, 100, 'pt1385');
        assertApprox(r, 280.93, 0.1);
    });

    test('Pt100 (IEC): R(-50°C) = 80.31 Ом (отрицательная температура)', () => {
        const r = fns.calcRtdResistance(-50, 100, 'pt1385');
        assertApprox(r, 80.31, 0.02);
    });

    test('Pt100 (IEC): R(-200°C) ≈ 18.52 Ом (граница диапазона)', () => {
        const r = fns.calcRtdResistance(-200, 100, 'pt1385');
        assertApprox(r, 18.52, 0.05);
    });

    test('Pt1000 (IEC): R(100°C) = 1385.1 Ом', () => {
        const r = fns.calcRtdResistance(100, 1000, 'pt1385');
        assertApprox(r, 1385.1, 0.5);
    });

    test('Pt50 (IEC): R(100°C) = 69.26 Ом', () => {
        const r = fns.calcRtdResistance(100, 50, 'pt1385');
        assertApprox(r, 69.255, 0.05);
    });

    // Для Pt100 α=0.00391 (ГОСТ 6651-2009, российский стандарт)
    // A = 3.969·10⁻³, B = -5.841·10⁻⁷
    // R(100) ≈ 139.11 (немного отличается от IEC)
    test('Pt100 (ГОСТ α=0.00391): R(0°C) = 100 Ом', () => {
        const r = fns.calcRtdResistance(0, 100, 'pt1391');
        assertApprox(r, 100.00, 0.01);
    });

    test('Pt100 (ГОСТ α=0.00391): R(100°C) ≈ 139.1 Ом', () => {
        const r = fns.calcRtdResistance(100, 100, 'pt1391');
        assertTrue(r > 139.0 && r < 139.3, 'R(100) для ГОСТ Pt100 ~ 139.1');
    });

    // Проверка квадратичности (не линейность!)
    test('Pt100 нелинеен: R(50) ≠ (R(0)+R(100))/2', () => {
        const r0 = fns.calcRtdResistance(0, 100, 'pt1385');
        const r50 = fns.calcRtdResistance(50, 100, 'pt1385');
        const r100 = fns.calcRtdResistance(100, 100, 'pt1385');
        const linear_mid = (r0 + r100) / 2;
        assertTrue(Math.abs(r50 - linear_mid) > 0.1, 'Pt100 должен отличаться от линейного');
    });

    // Проверка монотонности
    test('Pt100 монотонно возрастает с температурой', () => {
        const temps = [-100, -50, 0, 50, 100, 200, 300, 500];
        let prev = -Infinity;
        for (const t of temps) {
            const r = fns.calcRtdResistance(t, 100, 'pt1385');
            assertTrue(r > prev, 'R должен возрастать: ' + t + '°C → ' + r);
            prev = r;
        }
    });
});
