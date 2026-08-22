// Тесты функций буйкового уровнемера:
//   calcBuoyVolume, calcBuoyancyMass

const { test, describe, assertEqual, assertApprox, assertTrue, assertThrows } = require('./test-helpers.js');
const { extractFunctions } = require('./extract-functions.js');
const fns = extractFunctions();

describe('calcBuoyVolume — объём буйка', () => {

    test('Объём цилиндра: D=50мм, L=1000мм', () => {
        // D=50мм → r=0.025м, L=1м
        // V = π·r²·L = π·0.025²·1 = 0.001963 м³
        const v = fns.calcBuoyVolume(50, 1000);
        assertApprox(v, 0.001963, 0.00001, 'V = π·(0.025)²·1');
    });

    test('Объём цилиндра: D=100мм, L=500мм', () => {
        // D=100мм → r=0.05м, L=0.5м
        // V = π·0.05²·0.5 = 0.003927 м³
        const v = fns.calcBuoyVolume(100, 500);
        assertApprox(v, 0.003927, 0.00001);
    });

    test('Объём цилиндра: D=30мм, L=300мм', () => {
        // D=30мм → r=0.015м, L=0.3м
        // V = π·0.015²·0.3 = 0.000212 м³
        const v = fns.calcBuoyVolume(30, 300);
        assertApprox(v, 0.0002121, 0.000001);
    });

    test('Объём масштабируется квадратично по диаметру', () => {
        // Удвоение D должно дать 4× объём
        const v1 = fns.calcBuoyVolume(50, 1000);
        const v2 = fns.calcBuoyVolume(100, 1000);
        assertApprox(v2 / v1, 4, 0.001, '2× D → 4× V');
    });

    test('Объём масштабируется линейно по длине', () => {
        // Удвоение L должно дать 2× объём
        const v1 = fns.calcBuoyVolume(50, 500);
        const v2 = fns.calcBuoyVolume(50, 1000);
        assertApprox(v2 / v1, 2, 0.001, '2× L → 2× V');
    });
});

describe('calcBuoyancyMass — выталкивающая масса', () => {

    test('При 0% погружения → масса = 0', () => {
        const m = fns.calcBuoyancyMass(0, 50, 1000, 1000);
        assertEqual(m, 0, '0% → 0 кг');
    });

    test('При 100% погружения → полная выталкивающая масса', () => {
        // D=50мм, L=1000мм, ρ=1000 кг/м³ (вода)
        // V = 0.001963 м³, m = V·ρ = 1.963 кг
        const m = fns.calcBuoyancyMass(100, 50, 1000, 1000);
        assertApprox(m, 1.9635, 0.001, '100% → 1.963 кг для воды');
    });

    test('При 50% погружения → половина массы', () => {
        const m50 = fns.calcBuoyancyMass(50, 50, 1000, 1000);
        const m100 = fns.calcBuoyancyMass(100, 50, 1000, 1000);
        assertApprox(m50, m100 / 2, 0.0001, '50% → 0.5 × 100%');
    });

    test('Плотность воды 1000 кг/м³ → масса = объём', () => {
        // V = 0.001963 м³, ρ = 1000 → m = 1.963 кг
        const v = fns.calcBuoyVolume(50, 1000);
        const m = fns.calcBuoyancyMass(100, 50, 1000, 1000);
        assertApprox(m, v * 1000, 0.0001, 'm = V·ρ');
    });

    test('Плотность масла 850 кг/м³ → меньше массы', () => {
        // ρ=850 < 1000 → m < m_воды
        const m_water = fns.calcBuoyancyMass(100, 50, 1000, 1000);
        const m_oil = fns.calcBuoyancyMass(100, 50, 1000, 850);
        assertTrue(m_oil < m_water, 'масло легче воды');
        assertApprox(m_oil / m_water, 0.85, 0.001, 'соотношение = 850/1000');
    });

    test('Плотность ртути 13546 кг/м³ → большая масса', () => {
        const m = fns.calcBuoyancyMass(100, 50, 1000, 13546);
        // V=0.001963, m = 0.001963 * 13546 ≈ 26.59 кг
        assertApprox(m, 26.59, 0.01);
    });

    test('Масса линейна по плотности', () => {
        const m1 = fns.calcBuoyancyMass(100, 50, 1000, 500);
        const m2 = fns.calcBuoyancyMass(100, 50, 1000, 1500);
        assertApprox(m2 / m1, 3, 0.001, '3× ρ → 3× m');
    });

    test('Масса линейна по проценту погружения', () => {
        const m25 = fns.calcBuoyancyMass(25, 50, 1000, 1000);
        const m75 = fns.calcBuoyancyMass(75, 50, 1000, 1000);
        assertApprox(m75 / m25, 3, 0.001, '75%/25% = 3');
    });

    test('При проценте > 100 не превышает полную массу (clamping)', () => {
        // Функция должна ограничить погружение на 100%
        const m100 = fns.calcBuoyancyMass(100, 50, 1000, 1000);
        const m150 = fns.calcBuoyancyMass(150, 50, 1000, 1000);
        assertApprox(m150, m100, 0.0001, '150% не должно превышать 100%');
    });
});
