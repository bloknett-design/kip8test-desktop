// tests/test-task374.js
// Task 374: заявка пользователя — «убери кнопку "Копировать" над
//   расчётными таблицами. И переноси все изменения в боевой kip8.»
//   (первая часть — этот файл; перенос в kip8 — отдельный коммит
//   в репозитории kip8).
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — в calcTempSensor (обе ветки: ТС и ТП) кнопка «Копировать»
//      и вызов copyCalcTable('tempTableContainer') удалены; заголовок
//      «Таблица значений (шаг X°C)» сохранён с отступом сверху 12px;
//      flex-обёртка justify-content:space-between убрана.
//   B. SRC — соседние разделы НЕ тронуты: copyCalcTable() осталась
//      (весоизмерительные датчики, 3 вызова wsTableContainer),
//      кнопки copyScaleTable (Шкала-сигнал) и copyBuoyTable (Буй)
//      на месте.
//   C. VM — живой расчёт: результаты ТС и ТП содержат таблицу
//      (tempTableContainer) и заголовок, но НЕ содержат «Копировать»
//      и copyCalcTable; значения R(t)/E(t) в таблице корректны.
//   D. SW v603 (guard v604).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue, assertFalse, assertApprox } = require('./test-helpers.js');
const { extractFunctions } = require('./extract-functions.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Извлечение исходника function-декларации по имени (баланс скобок)
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
// A. SRC — кнопка убрана из обеих веток calcTempSensor
// ============================================================
describe('Task 374 — SRC: кнопка «Копировать» убрана из таблиц датчиков', () => {

    test('calcTempSensor: нет вызова copyCalcTable и кнопки в исходнике', () => {
        const fn = grabFn('calcTempSensor');
        assertTrue(fn !== null, 'функция calcTempSensor найдена');
        assertTrue(fn.indexOf("copyCalcTable('tempTableContainer')") === -1,
            'вызов copyCalcTable удалён');
        assertTrue(fn.indexOf('>Копировать</button>') === -1,
            'кнопка «Копировать» удалена');
        assertTrue(fn.indexOf('<button') === -1,
            'кнопок в результатах больше нет вообще');
    });

    test('Заголовок «Таблица значений» сохранён в обеих ветках (отступ 12px)', () => {
        const fn = grabFn('calcTempSensor');
        const title = '<div class="converter-result-label-title" style="margin-top:12px;">Таблица значений (шаг ${formatNumber(step)}°C)</div>';
        assertEqual(fn.split(title).length - 1, 2, 'ровно 2 заголовка (ТС и ТП)');
        // старая flex-обёртка с кнопкой удалена
        assertTrue(fn.indexOf('justify-content:space-between; align-items:center; margin-top:12px; margin-bottom:0;"><div class="converter-result-label-title">Таблица значений') === -1,
            'flex-обёртка с кнопкой удалена');
        // сама таблица на месте в обеих ветках
        assertEqual(fn.split('id="tempTableContainer"').length - 1, 2, 'таблица в обеих ветках');
    });

    test('Таблицы значений R(t)/E(t) не тронуты', () => {
        const fn = grabFn('calcTempSensor');
        assertTrue(fn.indexOf('R(t), Ом') !== -1, 'колонка R(t) на месте');
        assertTrue(fn.indexOf('E(t), мВ') !== -1, 'колонка E(t) на месте');
    });

    test('Маркеры Task 374 в коде', () => {
        assertTrue(INDEX_SRC.indexOf('Task 374') !== -1, 'комментарий-маркер Task 374');
    });
});

// ============================================================
// B. SRC — соседние разделы не тронуты
// ============================================================
describe('Task 374 — SRC: копирование в соседних разделах сохранено', () => {

    test('copyCalcTable() осталась (весоизмерительные датчики)', () => {
        assertTrue(INDEX_SRC.indexOf('function copyCalcTable(') !== -1,
            'функция copyCalcTable объявлена');
        assertEqual(INDEX_SRC.split("copyCalcTable(\\'wsTableContainer\\')").length - 1, 3,
            '3 вызова wsTableContainer (3 ветки весоизмерительных)');
    });

    test('Кнопки «Шкала-сигнал» и «Буй» на месте', () => {
        assertTrue(INDEX_SRC.indexOf('onclick="copyScaleTable()"') !== -1,
            'кнопка копирования в Шкала-сигнал');
        assertTrue(INDEX_SRC.indexOf('onclick="copyBuoyTable()"') !== -1,
            'кнопка копирования в Буе');
    });

    test('В разделе датчиков температуры кнопок копирования не осталось', () => {
        // страница датчика: от открытия до конца calcTempSensor
        const i = INDEX_SRC.indexOf('function openTempSensor(');
        const j = INDEX_SRC.indexOf('function calcRtdResistance(');
        assertTrue(i !== -1 && j !== -1 && i < j, 'зона раздела найдена');
        const zone = INDEX_SRC.slice(i, j);
        assertTrue(zone.indexOf('>Копировать</button>') === -1,
            'в зоне раздела нет кнопки «Копировать»');
    });
});

// ============================================================
// C. VM — живой расчёт без кнопки
// ============================================================
const fns = extractFunctions();

function makeStorage() {
    const store = {};
    return {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
        _dump: () => store,
    };
}

function makeVm374() {
    const els = {};
    const mkEl = () => ({
        value: '', style: {}, innerHTML: '', textContent: '',
        scrollIntoView: () => {}, children: [],
        _attrs: {},
        setAttribute(k, v) { this._attrs[k] = String(v); },
        getAttribute(k) { return (k in this._attrs) ? this._attrs[k] : null; },
        _cls: {},
        classList: {
            toggle(c, on) { this._own[c] = on; },
            contains(c) { return !!this._own[c]; },
            _own: {},
        },
    });
    const document = {
        getElementById: id => (els[id] || (els[id] = mkEl())),
        querySelectorAll: () => [],
    };
    const toasts = [];
    const ctx = {
        document,
        localStorage: makeStorage(),
        showToast: m => toasts.push(String(m)),
        parseLocaleNumber: fns.parseLocaleNumber,
        formatNumber: fns.formatNumber,
        calcCuResistance: fns.calcCuResistance,
        calcRtdResistance: fns.calcRtdResistance,
        calcTcVoltage: fns.calcTcVoltage,
        setTimeout: () => 0,
        navigator: {},
    };
    vm.createContext(ctx);
    const code = ['getRtdSensorMap', 'getTcSensorMap', 'getTempSensorCatalog',
                  'tempSensorFindByKey', 'calcTempSensor']
        .map(grabFn).join('\n');
    vm.runInContext('var tempSensorKey=null;\n' + code +
        '\n;globalThis.__api = { calcTempSensor,' +
        ' setSensor: function(k){ tempSensorKey = k; },' +
        ' touch: function(id){ return document.getElementById(id); } };', ctx);
    return { els, toasts, api: ctx.__api };
}

describe('Task 374 — VM: результаты расчёта без кнопки «Копировать»', () => {

    test('ТС (50М Cu50): таблица есть, кнопки нет', () => {
        const vmw = makeVm374();
        vmw.api.setSensor('cu50_1428');
        vmw.api.touch('temp_sensor_min');
        vmw.api.touch('temp_sensor_max');
        vmw.api.touch('temp_sensor_step');
        vmw.api.touch('tempSensorResults');
        vmw.els['temp_sensor_min'].value = '0';
        vmw.els['temp_sensor_max'].value = '100';
        vmw.els['temp_sensor_step'].value = '50';
        vmw.api.calcTempSensor();
        const html = vmw.els['tempSensorResults'].innerHTML;
        assertTrue(html.indexOf('id="tempTableContainer"') !== -1, 'таблица значений есть');
        assertTrue(html.indexOf('Таблица значений (шаг 50°C)') !== -1, 'заголовок таблицы есть');
        assertTrue(html.indexOf('Копировать') === -1, 'кнопки «Копировать» нет');
        assertTrue(html.indexOf('copyCalcTable') === -1, 'вызова copyCalcTable нет');
        assertTrue(html.indexOf('<button') === -1, 'кнопок в результатах нет');
        // значение не пострадало: R(50) Cu50 α=0,00428 = 60,7 Ом
        assertTrue(html.indexOf('60,7') !== -1, 'R(50) = 60,7 Ом в таблице');
    });

    test('ТП (ТХК L): таблица есть, кнопки нет', () => {
        const vmw = makeVm374();
        vmw.api.setSensor('tc_L');
        vmw.api.touch('temp_sensor_min');
        vmw.api.touch('temp_sensor_max');
        vmw.api.touch('temp_sensor_step');
        vmw.api.touch('tempSensorResults');
        vmw.els['temp_sensor_min'].value = '0';
        vmw.els['temp_sensor_max'].value = '100';
        vmw.els['temp_sensor_step'].value = '50';
        vmw.api.calcTempSensor();
        const html = vmw.els['tempSensorResults'].innerHTML;
        assertTrue(html.indexOf('id="tempTableContainer"') !== -1, 'таблица значений есть');
        assertTrue(html.indexOf('ТХК (L)') !== -1, 'имя термопары в результатах');
        assertTrue(html.indexOf('Копировать') === -1, 'кнопки «Копировать» нет');
        assertTrue(html.indexOf('<button') === -1, 'кнопок в результатах нет');
        // значение не пострадало: E(100) L = 6,8617 мВ (Task 373)
        assertTrue(html.indexOf('6,8617') !== -1, 'E(100) ≈ 6,8617 мВ в таблице');
    });

    test('ТП (ТХА K): контрольная точка НИСТ не пострадала', () => {
        const vmw = makeVm374();
        vmw.api.setSensor('tc_K');
        vmw.api.touch('temp_sensor_min');
        vmw.api.touch('temp_sensor_max');
        vmw.api.touch('temp_sensor_step');
        vmw.api.touch('tempSensorResults');
        vmw.els['temp_sensor_min'].value = '0';
        vmw.els['temp_sensor_max'].value = '200';
        vmw.els['temp_sensor_step'].value = '100';
        vmw.api.calcTempSensor();
        const html = vmw.els['tempSensorResults'].innerHTML;
        // E(100) K = 4,096 мВ (НИСТ)
        assertTrue(html.indexOf('4,096') !== -1, 'E(100) = 4,096 мВ в таблице');
        assertApprox(fns.calcTcVoltage(100, 'K'), 4.096, 0.001, 'полином K не тронут');
    });
});

// ============================================================
// D. SW v603 (guard v604)
// ============================================================
describe('Task 374 — SW: версия кэша kipia-test-v743', () => {

    test('CACHE_VERSION = kipia-test-v743', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v743'") !== -1,
            'SW бампнут до v603');
    });

    test('Guard: v605 ещё не существует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v744') === -1,
            'v604 не должен существовать (следующий бамп)');
    });
});
