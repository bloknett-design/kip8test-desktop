// tests/test-task518.js
// Task 518: заявка — «В разделе Главная / Инженерные калькуляторы /
// КИП и А / Датчики температуры / 50М (Cu50) α = 0,00428, при вводе в
// поле сопротивления 50 Ом в поле температуры автоматический расчёт
// показывает -1,2970e-14 вместо нуля градусов. Проверь на такой
// характер замечания все разделы Инженерные калькуляторы, и на похожие
// проблемы.»
//
// ДИАГНОЗ: tempCalcInvertValue() обращает НСХ бисекцией за 80 итераций;
// вычисленная f(t) квантована шагом округления double (~1e-16 отн.) —
// в полосе |t| ~ 1e-14 °C она округляется ровно к введённому значению,
// и бисекция сходится к краю полосы, а не к номиналу. formatNumber()
// при |n| < 1e-5 уходит в научную запись — остаток виден пользователю.
// Аудит (scripts/task518-audit.js, 102 пробы): все 8 ТС invert(R0) →
// мусор −1,3e−14…−1,4e−14; ТП: E(0) у K = 1,97e−9 мВ (невязка c0 и
// экспоненты НИСТ в double), у L = 4,05e−6 мВ (свободный член
// аппроксимации), у B invert(0) = 42,13 °C (НСХ B имеет лёгкий
// отрицательный прогиб у нуля, E(20) ≈ −2,6 мкВ, второй корень E=0 при
// t ≈ 42 °C — бисекция уходила в него). Шкала-сигнал/буй/конвертеры/
// диафрагмы/погрешности — чисто (мультипликативная/точная арифметика).
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — гвард номинала v===f(0) и сглаживание |t|<1e-9 в
//      tempCalcInvertValue; якорь E(0)=0 в calcTcVoltage; наличие
//      аудит-скрипта scripts/task518-audit.js.
//   B. VM — заявка (Cu50: 50 Ом → «0»); все 8 ТС invert(R0)===0;
//      все 9 ТП E(0)===0 и invert(0)===0 (включая B и L); кривые НСХ
//      не тронуты (контрольные точки); порог сглаживания не агрессивен
//      (реальное малое t ≈ 4,7e−6 °C проходит); регресс Task 371/499
//      (round-trip 55 ↔ 61,77; 39,2275 → −50).
//   C. SW v732 (guard v733).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertStrictEqual, assertApprox,
        assertTrue, assertFalse } = require('./test-helpers.js');
const { extractFunctions } = require('./extract-functions.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Гвард окружения (по образцу Task 517 в test-task480.js): синк в
// десктоп-зеркала тянет только scripts/*.gs и scripts/sync-*.py —
// scripts/task518-audit.js (и task518-bump-sw.py) в зеркале НЕТ;
// ассерт существования — только для PWA-репо.
const AUDIT_SCRIPT_PRESENT = fs.existsSync(
    path.join(__dirname, '..', 'scripts', 'task518-audit.js'));

// Извлечение исходника function-декларации по имени (баланс фигурных
// скобок) — как в test-task371.js
function grabFn(name) {
    const start = INDEX_SRC.indexOf('function ' + name + '(');
    if (start === -1) return null;
    const braceStart = INDEX_SRC.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < INDEX_SRC.length; i++) {
        if (INDEX_SRC[i] === '{') depth++;
        else if (INDEX_SRC[i] === '}') {
            depth--;
            if (depth === 0) return INDEX_SRC.slice(start, i + 1);
        }
    }
    return null;
}

// ============================================================
// A. SRC — защита инверсии и якорь нуля ТП
// ============================================================
describe('Task 518 — SRC: защита номиналов обратного расчёта', () => {

    test('tempCalcInvertValue: гвард номинала v===f(0) + сглаживание |t|<1e-9', () => {
        const fn = grabFn('tempCalcInvertValue');
        assertTrue(fn !== null, 'функция объявлена');
        assertTrue(fn.indexOf('if(v===f(0)){return 0;}') !== -1,
            'гвард номинала: введённое = f(0) → точный 0');
        assertTrue(fn.indexOf('if(Math.abs(t)<1e-9){return 0;}') !== -1,
            'сглаживание шума бисекции |t| < 1e-9 °C');
        // маркер — в комментарии НАД функцией (grabFn берёт только тело)
        const i = INDEX_SRC.indexOf('function tempCalcInvertValue(');
        assertTrue(i > 0 && INDEX_SRC.slice(Math.max(0, i - 2200), i)
            .indexOf('Task 518 (заявка: 50М (Cu50)') !== -1,
            'комментарий-маркер Task 518 перед функцией');
    });

    test('calcTcVoltage: якорь нулевой точки E(0)=0', () => {
        const fn = grabFn('calcTcVoltage');
        assertTrue(fn.indexOf('if(t===0){return 0;}') !== -1,
            'термо-ЭДС контура со спаями равной температуры нулевая');
        assertTrue(fn.indexOf('Task 518') !== -1, 'маркер Task 518');
    });

    if (AUDIT_SCRIPT_PRESENT) test('Аудит-скрипт scripts/task518-audit.js существует', () => {
        assertTrue(fs.existsSync(path.join(__dirname, '..', 'scripts', 'task518-audit.js')),
            'двусторонний аудит (до фикса 56 находок, после — 0)');
    });
});

// ============================================================
// B. VM — функциональные проверки
// ============================================================
const fns = extractFunctions();

// Кастомная VM — как в test-task371.js (makeTempVm)
function makeTempVm() {
    const els = {};
    const document = {
        getElementById: id => (els[id] || (els[id] = {
            value: '', style: {}, innerHTML: '', textContent: '',
            scrollIntoView: () => {}, children: []
        }))
    };
    const toasts = [];
    const ctx = {
        document,
        showToast: m => toasts.push(String(m)),
        parseLocaleNumber: fns.parseLocaleNumber,
        formatNumber: fns.formatNumber,
        calcCuResistance: fns.calcCuResistance,
        calcRtdResistance: fns.calcRtdResistance,
        calcTcVoltage: fns.calcTcVoltage,
        setTimeout: () => 0
    };
    vm.createContext(ctx);
    const code = ['getRtdSensorMap', 'getTcSensorMap', 'getTempSensorCatalog',
                  'tempSensorFindByKey', 'getTempSensorRange',
                  'tempCalcForwardValue', 'tempCalcInvertValue',
                  'tempQueryFromTemp', 'tempQueryFromValue', 'calcTempSensor']
        .map(grabFn).join('\n');
    vm.runInContext('var tempSensorKey=null;\n' + code + '\n;globalThis.__api = {' +
        'getRtdSensorMap, getTcSensorMap, getTempSensorCatalog, tempSensorFindByKey, ' +
        'getTempSensorRange, tempCalcForwardValue, tempCalcInvertValue, ' +
        'tempQueryFromTemp, tempQueryFromValue, calcTempSensor, ' +
        'setSensor: function(k){ tempSensorKey = k; }};', ctx);
    return { els, toasts, api: ctx.__api };
}

function setForm(vmw, rtdKey) {
    vmw.api.setSensor(rtdKey);
    vmw.els['tempQueryTemp'] = { value: '', style: {} };
    vmw.els['tempQueryVal'] = { value: '', style: {} };
}

const RTD_KEYS = ['cu50_1428', 'cu50_1426', 'cu100_1428', 'cu100_1426',
                  'pt50_1391', 'pt100_1391', 'pt100_1385', 'pt1000_1385'];
const TC_KEYS = ['K', 'L', 'J', 'T', 'E', 'N', 'R', 'S', 'B'];

describe('Task 518 — VM: заявка Cu50 (50 Ом → 0 °C) и номиналы всех датчиков', () => {

    test('ЗАЯВКА: Cu50 α=0,00428 — ввод 50 Ом → поле температуры «0»', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'cu50_1428');
        vmw.els['tempQueryVal'].value = '50';
        vmw.api.tempQueryFromValue();
        assertEqual(vmw.els['tempQueryTemp'].value, '0',
            'вместо −1,2970e−14 — точный ноль');
        assertStrictEqual(vmw.api.tempCalcInvertValue(50), 0,
            'tempCalcInvertValue(50) === 0');
    });

    test('Все 8 ТС: invert(R₀) === 0 строго (без мусора 1e−14)', () => {
        const vmw = makeTempVm();
        const rtdMap = vmw.api.getRtdSensorMap();
        for (const k of RTD_KEYS) {
            vmw.api.setSensor(k);
            assertStrictEqual(vmw.api.tempCalcInvertValue(rtdMap[k].r0), 0,
                k + ': invert(R₀=' + rtdMap[k].r0 + ') === 0');
        }
    });

    test('Все 9 ТП: E(0) === 0 строго (якорь нулевой точки)', () => {
        const vmw = makeTempVm();
        for (const k of TC_KEYS) {
            vmw.api.setSensor('tc_' + k);
            assertStrictEqual(vmw.api.tempCalcForwardValue(0), 0,
                'ТП ' + k + ': E(0) === 0');
        }
    });

    test('Все 9 ТП: invert(E=0) === 0 строго (включая B и L)', () => {
        const vmw = makeTempVm();
        for (const k of TC_KEYS) {
            vmw.api.setSensor('tc_' + k);
            assertStrictEqual(vmw.api.tempCalcInvertValue(0), 0,
                'ТП ' + k + ': invert(0 мВ) === 0');
        }
    });

    test('ТП B: инверсия 0 мВ — именно 0, а не второй корень ≈42,13 °C', () => {
        const vmw = makeTempVm();
        vmw.api.setSensor('tc_B');
        // НСХ B у нуля: E(20) ≈ −2,6 мкВ (отрицательный прогиб), второй
        // корень E=0 при t ≈ 42,13 °C — до фикса бисекция уходила туда
        assertApprox(vmw.api.tempCalcForwardValue(20), -0.002579, 1e-4,
            'прогиб E(20) ≈ −2,58 мкВ сохранён (кривая не тронута)');
        assertEqual(vmw.api.tempCalcInvertValue(0), 0, 'инверсия E=0 → 0 °C');
    });

    test('ТП L: E(0)=0 и E(100)≈6,862 — якорь без сдвига кривой', () => {
        const vmw = makeTempVm();
        vmw.api.setSensor('tc_L');
        assertStrictEqual(vmw.api.tempCalcForwardValue(0), 0,
            'E(0) === 0 (свободный член 4,05e−6 перекрыт якорем)');
        assertApprox(vmw.api.tempCalcForwardValue(100), 6.8617, 1e-3,
            'E(100) ≈ 6,862 мВ (контрольная точка Task 373)');
    });

    test('ТП K: E(100)≈4,096 и round-trip без изменений', () => {
        const vmw = makeTempVm();
        vmw.api.setSensor('tc_K');
        assertApprox(vmw.api.tempCalcForwardValue(100), 4.0962, 1e-3,
            'E(100) ≈ 4,096 мВ');
        const t = vmw.api.tempCalcInvertValue(vmw.api.tempCalcForwardValue(100));
        assertApprox(t, 100, 1e-6, 'round-trip 100 °C');
    });

    test('Cu50: кривые НСХ не тронуты (R(100)=71,4; R(−50)=39,2275)', () => {
        assertApprox(fns.calcCuResistance(100, 50, 0.00428), 71.4, 1e-9,
            'R(100) линейная ветка');
        assertApprox(fns.calcCuResistance(-50, 50, 0.00428), 39.2275, 1e-4,
            'R(−50) ветка ГОСТ 5.2.3 (Task 499)');
    });

    test('Порог сглаживания не агрессивен: R₀+1 мкОм → реальное t≈4,67e−6', () => {
        const vmw = makeTempVm();
        vmw.api.setSensor('cu50_1428');
        const t = vmw.api.tempCalcInvertValue(50.000001);
        assertTrue(t !== 0, 'малое РЕАЛЬНОЕ значение не сглаживается в 0');
        assertApprox(t, 4.6729e-6, 1e-9, 't = 1e−6/0,214 ≈ 4,67e−6 °C');
    });

    test('Регресс Task 371: Cu50 t=55 → R=61,77 → обратно 55', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'cu50_1428');
        vmw.els['tempQueryTemp'].value = '55';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '61,77', 'R(55) для Cu50');
        vmw.els['tempQueryVal'].value = '61,77';
        vmw.els['tempQueryTemp'].value = '';
        vmw.api.tempQueryFromValue();
        assertEqual(vmw.els['tempQueryTemp'].value, '55', 'обратная задача — точный 55');
    });

    test('Регресс Task 499: Cu50 39,2275 Ом → ≈ −50 (ветка ГОСТ ниже 0 °C)', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'cu50_1428');
        vmw.els['tempQueryVal'].value = '39,2275';
        vmw.api.tempQueryFromValue();
        const t = parseFloat(vmw.els['tempQueryTemp'].value.replace(',', '.'));
        assertTrue(isFinite(t) && Math.abs(t - (-50)) < 0.05,
            'инверсия ГОСТ 5.2.3 → −50, получено ' + t);
    });

    test('Прямой live-расчёт при t=0: значение «0» у всех ТП', () => {
        const vmw = makeTempVm();
        vmw.api.setSensor('tc_K');
        vmw.els['tempQueryTemp'] = { value: '0', style: {} };
        vmw.els['tempQueryVal'] = { value: '', style: {} };
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '0', 'K: E(0) → «0» (было 1,9741e−9)');
        vmw.api.setSensor('tc_L');
        vmw.els['tempQueryTemp'] = { value: '0', style: {} };
        vmw.els['tempQueryVal'] = { value: '', style: {} };
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '0', 'L: E(0) → «0» (было 4,0536e−6)');
    });
});

// ============================================================
// C. SW v732 (guard v733)
// ============================================================
describe('Task 518 — SW: версия кэша kipia-test-v742', () => {

    test('CACHE_VERSION = kipia-test-v742', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v742'") !== -1,
            'SW бампнут до v732');
    });

    test('Guard: v733 ещё не существует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v743') === -1,
            'v733 не должен существовать (следующий бамп)');
    });
});
