// Тесты функций сужающих устройств (диафрагм):
//   convertOpFlowToM3s, convertOpDpToPa
//
// Точные имена unit (как в коде index.html):
//   convertOpFlowToM3s: 'm3h', 'm3s', 'l_s', 'kg_h', 'kg_s', 't_h'
//   convertOpDpToPa:    'kPa', 'Pa', 'MPa', 'mmH2O', 'mmHg', 'bar'

const { test, describe, assertEqual, assertApprox, assertTrue } = require('./test-helpers.js');
const { extractFunctions } = require('./extract-functions.js');
const fns = extractFunctions();

describe('convertOpFlowToM3s — перевод расхода в м³/с', () => {

    test('1 м³/ч → 1/3600 м³/с', () => {
        const v = fns.convertOpFlowToM3s(1, 'm3h', 1000);
        assertApprox(v, 1 / 3600, 1e-9, '1 м³/ч = 2.778e-4 м³/с');
    });

    test('3600 м³/ч → 1 м³/с', () => {
        const v = fns.convertOpFlowToM3s(3600, 'm3h', 1000);
        assertApprox(v, 1, 1e-9);
    });

    test('1 м³/с → 1 м³/с (без преобразования)', () => {
        const v = fns.convertOpFlowToM3s(1, 'm3s', 1000);
        assertApprox(v, 1, 1e-9);
    });

    test('1 л/с → 0.001 м³/с', () => {
        const v = fns.convertOpFlowToM3s(1, 'l_s', 1000);
        assertApprox(v, 0.001, 1e-9);
    });

    test('0 → 0', () => {
        const v = fns.convertOpFlowToM3s(0, 'm3h', 1000);
        assertEqual(v, 0);
    });

    test('Массовый расход: 1 кг/ч воды (ρ=1000) → 1/3600/1000 м³/с', () => {
        // Q_mass = 1 кг/ч → Q_vol = Q_mass / ρ = 1/1000 м³/ч = 1/3600/1000 м³/с
        const v = fns.convertOpFlowToM3s(1, 'kg_h', 1000);
        assertApprox(v, 1 / 3600 / 1000, 1e-12);
    });

    test('Массовый расход: 1 кг/с воды → 0.001 м³/с', () => {
        const v = fns.convertOpFlowToM3s(1, 'kg_s', 1000);
        assertApprox(v, 0.001, 1e-9);
    });

    test('Тонн в час: 1 т/ч воды → 1/3600 м³/с', () => {
        // 1 т/ч = 1000 кг/ч, ρ=1000 → 1000/3600/1000 = 1/3600 м³/с
        const v = fns.convertOpFlowToM3s(1, 't_h', 1000);
        assertApprox(v, 1 / 3600, 1e-9);
    });

    test('Массовый расход зависит от плотности: 1 кг/ч при ρ=500 → 2× объём', () => {
        const v1000 = fns.convertOpFlowToM3s(1, 'kg_h', 1000);
        const v500 = fns.convertOpFlowToM3s(1, 'kg_h', 500);
        assertApprox(v500 / v1000, 2, 1e-6, 'вдвое меньше ρ → вдвое больше V');
    });

    test('Неизвестная единица → fallback на м³/ч (деление на 3600)', () => {
        const v = fns.convertOpFlowToM3s(3600, 'unknown', 1000);
        assertApprox(v, 1, 1e-9, 'default → flow/3600');
    });
});

describe('convertOpDpToPa — перевод перепада давления в Па', () => {

    test('1 Па → 1 Па', () => {
        const v = fns.convertOpDpToPa(1, 'Pa');
        assertApprox(v, 1, 1e-9);
    });

    test('1 кПа → 1000 Па', () => {
        const v = fns.convertOpDpToPa(1, 'kPa');
        assertApprox(v, 1000, 1e-6);
    });

    test('1 МПа → 1 000 000 Па', () => {
        const v = fns.convertOpDpToPa(1, 'MPa');
        assertApprox(v, 1e6, 1e-3);
    });

    test('1 бар → 100 000 Па', () => {
        const v = fns.convertOpDpToPa(1, 'bar');
        assertApprox(v, 100000, 1e-3);
    });

    test('1 мм вод.ст. → 9.80665 Па', () => {
        const v = fns.convertOpDpToPa(1, 'mmH2O');
        assertApprox(v, 9.80665, 1e-4);
    });

    test('1 мм рт.ст. → 133.322 Па', () => {
        const v = fns.convertOpDpToPa(1, 'mmHg');
        assertApprox(v, 133.322, 0.01);
    });

    test('0 → 0 (для любой единицы)', () => {
        assertEqual(fns.convertOpDpToPa(0, 'Pa'), 0);
        assertEqual(fns.convertOpDpToPa(0, 'kPa'), 0);
        assertEqual(fns.convertOpDpToPa(0, 'bar'), 0);
    });

    test('Линейность: 5 кПа = 5 × 1 кПа', () => {
        const v1 = fns.convertOpDpToPa(1, 'kPa');
        const v5 = fns.convertOpDpToPa(5, 'kPa');
        assertApprox(v5 / v1, 5, 1e-6);
    });

    test('Неизвестная единица → fallback на кПа (×1000)', () => {
        const v = fns.convertOpDpToPa(1, 'unknown');
        assertApprox(v, 1000, 1e-6, 'default → dp*1000');
    });
});

