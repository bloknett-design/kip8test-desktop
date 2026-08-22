// Тесты функций сигналов:
//   getSignalRangeAndUnit, calculateSignalValue
//   getBuoySignalRangeAndUnit, calculateBuoySignalValue

const { test, describe, assertEqual, assertApprox, assertTrue } = require('./test-helpers.js');
const { extractFunctions } = require('./extract-functions.js');
const fns = extractFunctions();

describe('getSignalRangeAndUnit — словарь диапазонов сигналов', () => {

    test('4-20 мА: корректные min/max/unit/label', () => {
        const r = fns.getSignalRangeAndUnit('4_20');
        assertEqual(r.min, 4, 'min=4');
        assertEqual(r.max, 20, 'max=20');
        assertEqual(r.unit, 'мА', 'unit=мА');
        assertEqual(r.label, '4-20 мА', 'label=4-20 мА');
    });

    test('0-20 мА', () => {
        const r = fns.getSignalRangeAndUnit('0_20');
        assertEqual(r.min, 0);
        assertEqual(r.max, 20);
        assertEqual(r.unit, 'мА');
    });

    test('0-5 мА', () => {
        const r = fns.getSignalRangeAndUnit('0_5mA');
        assertEqual(r.min, 0);
        assertEqual(r.max, 5);
        assertEqual(r.unit, 'мА');
    });

    test('0-10 В', () => {
        const r = fns.getSignalRangeAndUnit('0_10V');
        assertEqual(r.min, 0);
        assertEqual(r.max, 10);
        assertEqual(r.unit, 'В');
    });

    test('1-5 В', () => {
        const r = fns.getSignalRangeAndUnit('1_5V');
        assertEqual(r.min, 1);
        assertEqual(r.max, 5);
        assertEqual(r.unit, 'В');
    });

    test('0-5 В', () => {
        const r = fns.getSignalRangeAndUnit('0_5V');
        assertEqual(r.min, 0);
        assertEqual(r.max, 5);
        assertEqual(r.unit, 'В');
    });

    test('-10...+10 В (биполярное)', () => {
        const r = fns.getSignalRangeAndUnit('bipolar_10');
        assertEqual(r.min, -10);
        assertEqual(r.max, 10);
        assertEqual(r.unit, 'В');
    });

    test('20-100 кПа (пневматика)', () => {
        const r = fns.getSignalRangeAndUnit('20_100_kPa');
        assertEqual(r.min, 20);
        assertEqual(r.max, 100);
        assertEqual(r.unit, 'кПа');
    });

    test('0,2-1,0 бар', () => {
        const r = fns.getSignalRangeAndUnit('0_2_1_0_bar');
        assertApprox(r.min, 0.2, 0.0001);
        assertApprox(r.max, 1.0, 0.0001);
        assertEqual(r.unit, 'бар');
    });

    test('3-15 psi', () => {
        const r = fns.getSignalRangeAndUnit('3_15_psi');
        assertEqual(r.min, 3);
        assertEqual(r.max, 15);
        assertEqual(r.unit, 'psi');
    });

    test('0,2-1,0 кгс/см²', () => {
        const r = fns.getSignalRangeAndUnit('0_2_1_0_kgf_cm2');
        assertApprox(r.min, 0.2, 0.0001);
        assertApprox(r.max, 1.0, 0.0001);
        assertEqual(r.unit, 'кгс/см²');
    });

    test('0-100 % (добавленный сигнал)', () => {
        const r = fns.getSignalRangeAndUnit('0_100_pct');
        assertEqual(r.min, 0);
        assertEqual(r.max, 100);
        assertEqual(r.unit, '%');
    });

    test('Неизвестный тип → fallback на 4-20 мА', () => {
        const r = fns.getSignalRangeAndUnit('unknown_type');
        assertEqual(r.min, 4);
        assertEqual(r.max, 20);
        assertEqual(r.unit, 'мА');
    });
});

describe('calculateSignalValue — расчёт значения сигнала по %', () => {

    // Ключевой инвариант 4-20 мА:
    // 0% → 4 мА, 50% → 12 мА, 100% → 20 мА
    test('4-20 мА: 0% → 4 мА (живой ноль)', () => {
        const r = fns.calculateSignalValue(0, '4_20');
        assertApprox(r.value, 4, 0.0001, '0% должно давать 4 мА');
        assertEqual(r.unit, 'мА');
        assertEqual(r.isValid, true);
    });

    test('4-20 мА: 50% → 12 мА', () => {
        const r = fns.calculateSignalValue(50, '4_20');
        assertApprox(r.value, 12, 0.0001, '50% должно давать 12 мА');
    });

    test('4-20 мА: 100% → 20 мА', () => {
        const r = fns.calculateSignalValue(100, '4_20');
        assertApprox(r.value, 20, 0.0001, '100% должно давать 20 мА');
    });

    test('4-20 мА: 25% → 8 мА', () => {
        const r = fns.calculateSignalValue(25, '4_20');
        assertApprox(r.value, 8, 0.0001, '25% должно давать 8 мА');
    });

    test('4-20 мА: 75% → 16 мА', () => {
        const r = fns.calculateSignalValue(75, '4_20');
        assertApprox(r.value, 16, 0.0001, '75% должно давать 16 мА');
    });

    // 0-20 мА (без живого нуля)
    test('0-20 мА: 0% → 0 мА', () => {
        const r = fns.calculateSignalValue(0, '0_20');
        assertApprox(r.value, 0, 0.0001);
    });

    test('0-20 мА: 50% → 10 мА', () => {
        const r = fns.calculateSignalValue(50, '0_20');
        assertApprox(r.value, 10, 0.0001);
    });

    test('0-20 мА: 100% → 20 мА', () => {
        const r = fns.calculateSignalValue(100, '0_20');
        assertApprox(r.value, 20, 0.0001);
    });

    // 0-10 В
    test('0-10 В: 50% → 5 В', () => {
        const r = fns.calculateSignalValue(50, '0_10V');
        assertApprox(r.value, 5, 0.0001);
    });

    // 1-5 В (с живым нулём)
    test('1-5 В: 0% → 1 В (живой ноль)', () => {
        const r = fns.calculateSignalValue(0, '1_5V');
        assertApprox(r.value, 1, 0.0001);
    });

    test('1-5 В: 100% → 5 В', () => {
        const r = fns.calculateSignalValue(100, '1_5V');
        assertApprox(r.value, 5, 0.0001);
    });

    // Биполярный сигнал -10...+10 В
    test('-10...+10 В: 0% → -10 В', () => {
        const r = fns.calculateSignalValue(0, 'bipolar_10');
        assertApprox(r.value, -10, 0.0001);
    });

    test('-10...+10 В: 50% → 0 В', () => {
        const r = fns.calculateSignalValue(50, 'bipolar_10');
        assertApprox(r.value, 0, 0.0001);
    });

    test('-10...+10 В: 100% → +10 В', () => {
        const r = fns.calculateSignalValue(100, 'bipolar_10');
        assertApprox(r.value, 10, 0.0001);
    });

    // Пневматика 20-100 кПа
    test('20-100 кПа: 0% → 20 кПа', () => {
        const r = fns.calculateSignalValue(0, '20_100_kPa');
        assertApprox(r.value, 20, 0.0001);
    });

    test('20-100 кПа: 100% → 100 кПа', () => {
        const r = fns.calculateSignalValue(100, '20_100_kPa');
        assertApprox(r.value, 100, 0.0001);
    });

    // 0-100 %
    test('0-100 %: 50% → 50', () => {
        const r = fns.calculateSignalValue(50, '0_100_pct');
        assertApprox(r.value, 50, 0.0001);
    });

    // Корректность единиц измерения
    test('Единица измерения возвращается в результате', () => {
        const r4_20 = fns.calculateSignalValue(50, '4_20');
        assertEqual(r4_20.unit, 'мА');
        const r0_10V = fns.calculateSignalValue(50, '0_10V');
        assertEqual(r0_10V.unit, 'В');
        const r_kpa = fns.calculateSignalValue(50, '20_100_kPa');
        assertEqual(r_kpa.unit, 'кПа');
    });
});

describe('getBuoySignalRangeAndUnit — для буйковых уровнемеров', () => {

    test('4-20 мА: те же значения, что и для основной функции', () => {
        const r = fns.getBuoySignalRangeAndUnit('4_20');
        assertEqual(r.min, 4);
        assertEqual(r.max, 20);
        assertEqual(r.unit, 'мА');
    });

    test('0,2-1,0 кгс/см² (по умолчанию для буёв)', () => {
        const r = fns.getBuoySignalRangeAndUnit('0_2_1_0_kgf_cm2');
        assertApprox(r.min, 0.2, 0.0001);
        assertApprox(r.max, 1.0, 0.0001);
        assertEqual(r.unit, 'кгс/см²');
    });
});

describe('calculateBuoySignalValue — расчёт сигнала для буёв', () => {

    test('4-20 мА: 50% → 12 мА (инвариант)', () => {
        const r = fns.calculateBuoySignalValue(50, '4_20');
        assertApprox(r.value, 12, 0.0001);
    });

    test('0,2-1,0 кгс/см²: 0% → 0,2 кгс/см²', () => {
        const r = fns.calculateBuoySignalValue(0, '0_2_1_0_kgf_cm2');
        assertApprox(r.value, 0.2, 0.0001);
    });

    test('0,2-1,0 кгс/см²: 100% → 1,0 кгс/см²', () => {
        const r = fns.calculateBuoySignalValue(100, '0_2_1_0_kgf_cm2');
        assertApprox(r.value, 1.0, 0.0001);
    });
});
