// tests/test-task371.js
// Task 371: заявка пользователя — «На странице Главная / Инженерные
//   калькуляторы / КИП и А / Датчики температуры, под блоком Таблица
//   значений добавь блок Расчёт произвольных значений, по примеру
//   как в разделе Шкала-сигнал.»
// Task 372 (адаптация): раздел переделан на страницу карточек + страницу
//   датчика — датчик теперь выбирается состоянием tempSensorKey
//   (setSensor), а не выпадающими списками; диапазоны НСХ живут в
//   каталоге getTempSensorCatalog(). Проверки Task 371 сохранены.
// Task 373 (адаптация): панель «Расчёт произвольных значений» стала
//   СТАТИЧНОЙ разметкой страницы датчика — НАД формой выбора предела
//   измерения и шага таблицы (отображается всегда); генератор
//   tempCustomCalcHtml удалён, из результатов calcTempSensor панель
//   убрана. Живой расчёт (функции Task 371) — без изменений.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — панель «Расчёт произвольных значений» — статичная разметка
//      страницы датчика НАД формой выбора (id tempQueryTemp/tempQueryVal,
//      живые oninput-обработчики); calcTempSolver больше НЕ генерирует
//      панель; рефакторинг: карта типов ТС в одном месте; функции живого
//      расчёта; диапазоны НСХ; обращение бисекцией; маркеры Task 371.
//   B. VM — живой двусторонний расчёт: Cu50/Pt100/Pt1000/ТП K, B
//      (прямое значение и обратная задача, включая t<0°C с членом C),
//      границы НСХ, тосты «вне диапазона НСХ» с очисткой поля.
//   C. VM (calcTempSensor) — таблица значений в результатах; панель —
//      статичная (в результатах её нет), повторный «Рассчитать»
//      перерисовывает.
//   D. SW v602 (guard v603).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');
const { extractFunctions } = require('./extract-functions.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Извлечение исходника function-декларации по имени (баланс фигурных
// скобок; в телах функций скобки в строках/шаблонах сбалансированы)
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

// «1234,56» (с неразрывными пробелами) → 1234.56
function parseRu(s) {
    return parseFloat(String(s).replace(/\u00A0/g, '').replace(',', '.'));
}

// ============================================================
// A. SRC — разметка и структура
// ============================================================
describe('Task 371 — SRC: блок «Расчёт произвольных значений»', () => {

    test('Task 373: панель — статичная разметка НАД формой выбора, всегда видима', () => {
        const i = INDEX_SRC.indexOf('id="tempSensorResults"');
        const chunk = INDEX_SRC.slice(i, i + 200);
        assertTrue(chunk.indexOf('tempCustomCalcPanel') === -1,
            'в результатах панели нет — только в статичной разметке');
        const iPanel = INDEX_SRC.indexOf('id="tempCustomCalcPanel"');
        assertTrue(iPanel !== -1, 'панель есть в статичной разметке страницы');
        const iRange = INDEX_SRC.indexOf('id="temp_sensor_min"');
        const iStep = INDEX_SRC.indexOf('id="temp_sensor_step"');
        assertTrue(iRange !== -1 && iStep !== -1, 'форма выбора на месте');
        assertTrue(iPanel < iRange && iPanel < iStep, 'панель НАД формой (заявка Task 373)');
        const panelChunk = INDEX_SRC.slice(iPanel, iRange);
        for (const chunk2 of [
            'id="tempQueryTemp"',
            'id="tempQueryVal"',
            'id="tempQueryValLabel"',
            'oninput="tempQueryFromTemp()"',
            'oninput="tempQueryFromValue()"',
            'Температура (°C)'
        ]) {
            assertTrue(panelChunk.indexOf(chunk2) !== -1, 'панель содержит: ' + chunk2);
        }
        // Task 494 (адаптация): заголовок и подсказка панели УДАЛЕНЫ
        assertTrue(panelChunk.indexOf('Расчёт произвольных значений') === -1,
            'Task 494: заголовка панели в разметке НЕТ (удалён)');
        assertTrue(panelChunk.indexOf('Введите значение в любое поле') === -1,
            'Task 494: подсказки панели в разметке НЕТ (удалена)');
    });

    test('Task 373: calcTempSensor НЕ генерирует панель (генератор удалён)', () => {
        assertTrue(INDEX_SRC.indexOf('function tempCustomCalcHtml') === -1,
            'генератор tempCustomCalcHtml удалён');
        const fn = grabFn('calcTempSensor');
        assertTrue(fn.indexOf('tempCustomCalcHtml') === -1,
            'в calcTempSensor вызовов генератора нет');
        // подпись/плейсхолдер под тип датчика задаёт openTempSensor
        const op = grabFn('openTempSensor');
        assertTrue(op.indexOf("vLab.textContent='Сопротивление R(t), Ом'") !== -1,
            'openTempSensor: подпись ТС');
        assertTrue(op.indexOf("vLab.textContent='Термо-ЭДС E(t), мВ'") !== -1,
            'openTempSensor: подпись ТП');
        // Task 499: подсказки диапазонов — плейсхолдеры полей
        assertTrue(op.indexOf('tInp.placeholder=fmtI499(rng499.min)') !== -1,
            'openTempSensor: плейсхолдер температуры (Task 499)');
        assertTrue(op.indexOf('vInp.placeholder=fmtM499(vmin499)') !== -1,
            'openTempSensor: плейсхолдер значения (Task 499)');
    });

    test('Рефакторинг: карта типов ТС ровно в одном месте', () => {
        assertEqual(INDEX_SRC.split('cu50_1428:{r0:50,alpha:0.00428').length - 1, 1,
            'литерал карты один (в getRtdSensorMap)');
        const m = grabFn('calcTempSensor');
        assertTrue(m.indexOf('getRtdSensorMap()') !== -1,
            'calcTempSensor использует getRtdSensorMap()');
        assertTrue(m.indexOf('pt1000_1385:{r0:1000') === -1,
            'дубликата карты в calcTempSensor нет');
    });

    test('Функции живого расчёта и диапазоны НСХ объявлены', () => {
        for (const name of ['getRtdSensorMap', 'getTempSensorRange',
                            'tempCalcForwardValue', 'tempCalcInvertValue',
                            'tempQueryFromTemp', 'tempQueryFromValue']) {
            assertTrue(grabFn(name) !== null, 'function ' + name + ' объявлена');
        }
    });

    test('Диапазоны НСХ: Cu 0,00428 −180…200 (Task 499), Pt −200…850, ТП по типам', () => {
        // Task 372: единый источник диапазонов — каталог карточек;
        // Task 499: Cu α = 0,00428 — −180…+200 (ГОСТ 6651-2009, А.3/5.2.3)
        const fn = grabFn('getTempSensorCatalog');
        assertTrue(fn.indexOf('{min:-180,max:200}') !== -1, 'Cu 0,00428: −180…200 (Task 499)');
        assertTrue(fn.indexOf('{min:-50,max:200}') !== -1, 'Cu 0,00426: −50…200');
        assertTrue(fn.indexOf('{min:-200,max:850}') !== -1, 'Pt: −200…850');
        assertTrue(fn.indexOf('[-270,1372]') !== -1, 'K: −270…1372');
        assertTrue(fn.indexOf('[0,1820]') !== -1, 'B: 0…1820');
        assertTrue(fn.indexOf('[-270,400]') !== -1, 'T: −270…400');
        assertTrue(fn.indexOf('[-50,1768]') !== -1, 'R: −50…1768');
        const gr = grabFn('getTempSensorRange');
        assertTrue(gr.indexOf('sel.range.min') !== -1, 'getTempSensorRange читает каталог');
        assertTrue(gr.indexOf('{min:-50,max:200}') !== -1, 'фолбэк getTempSensorRange');
    });

    test('Инверсия — бисекция по монотонной НСХ', () => {
        const fn = grabFn('tempCalcInvertValue');
        assertTrue(fn.indexOf('for(let i=0;i<80;i++)') !== -1, 'цикл бисекции');
        assertTrue(fn.indexOf('return null;') !== -1, 'null вне диапазона');
    });

    test('Тосты «вне диапазона НСХ» очищают другое поле', () => {
        const ft = grabFn('tempQueryFromTemp');
        assertTrue(ft.indexOf('Температура вне диапазона НСХ') !== -1, 'тост температуры');
        assertTrue(ft.indexOf("vEl.value='';") !== -1, 'очистка поля значения');
        const fv = grabFn('tempQueryFromValue');
        assertTrue(fv.indexOf('Значение вне диапазона НСХ') !== -1, 'тост значения');
        assertTrue(fv.indexOf("tEl.value='';") !== -1, 'очистка поля температуры');
    });

    test('Пустой ввод очищает парное поле (как в «Шкала-сигнал»)', () => {
        assertTrue(grabFn('tempQueryFromTemp').indexOf("if(isNaN(t)){vEl.value='';return;}") !== -1,
            't→значение: NaN очищает');
        assertTrue(grabFn('tempQueryFromValue').indexOf("if(isNaN(v)){tEl.value='';return;}") !== -1,
            'значение→t: NaN очищает');
    });

    test('Маркеры Task 371 в коде', () => {
        assertTrue((INDEX_SRC.match(/\/\/ Task 371/g) || []).length >= 5,
            'комментарии-маркеры Task 371');
    });
});

// ============================================================
// B+C. VM — функциональные проверки
// ============================================================
const fns = extractFunctions();

// Кастомная VM: свой document (элементы по требованию) + захват тостов
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
    // Task 372: датчик — из состояния tempSensorKey (карточка),
    // не из выпадающих списков; Task 373: tempCustomCalcHtml удалена
    const code = ['getRtdSensorMap', 'getTcSensorMap', 'getTempSensorCatalog',
                  'tempSensorFindByKey', 'getTempSensorRange',
                  'tempCalcForwardValue', 'tempCalcInvertValue',
                  'tempQueryFromTemp', 'tempQueryFromValue', 'calcTempSensor']
        .map(grabFn).join('\n');
    vm.runInContext('var tempSensorKey=null;\n' + code + '\n;globalThis.__api = {' +
        'getRtdSensorMap, getTcSensorMap, getTempSensorCatalog, tempSensorFindByKey, ' +
        'getTempSensorRange, ' +
        'tempCalcForwardValue, tempCalcInvertValue, ' +
        'tempQueryFromTemp, tempQueryFromValue, calcTempSensor, ' +
        'setSensor: function(k){ tempSensorKey = k; }};', ctx);
    return { els, toasts, api: ctx.__api };
}

// Task 372: выбор датчика — ключ каталога (ТС — ключ карты ТС, ТП — 'tc_'+тип)
function setForm(vm, type, rtd, tc) {
    vm.api.setSensor(type === 'rtd' ? rtd : ('tc_' + tc));
    vm.els['tempQueryTemp'] = { value: '', style: {} };
    vm.els['tempQueryVal'] = { value: '', style: {} };
}

describe('Task 371 — VM: живой расчёт ТС (температура ↔ сопротивление)', () => {

    test('Cu50 (α=0,00428): t=55 → R=61,77 Ом; и обратно', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'rtd', 'cu50_1428', 'K');
        vmw.els['tempQueryTemp'].value = '55';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '61,77', 'R(55) для Cu50');
        vmw.els['tempQueryVal'].value = '61,77';
        vmw.els['tempQueryTemp'].value = '';
        vmw.api.tempQueryFromValue();
        assertEqual(vmw.els['tempQueryTemp'].value, '55', 'обратная задача — точный 55');
    });

    test('Cu50: границы НСХ −180…200 → 10,2642 / 92,8 Ом (ГОСТ 5.2.3, Task 499)', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'rtd', 'cu50_1428', 'K');
        vmw.els['tempQueryTemp'].value = '-50';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '39,2275', 'R(−50) по ГОСТ 5.2.3');
        vmw.els['tempQueryTemp'].value = '-180';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '10,2642', 'R(−180) — нижняя граница А.3');
        vmw.els['tempQueryTemp'].value = '200';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '92,8', 'R(200)');
    });

    test('Cu50: t=250 вне НСХ → тост + поле очищено', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'rtd', 'cu50_1428', 'K');
        vmw.els['tempQueryTemp'].value = '250';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '', 'поле значения очищено');
        // Task 499: диапазон Cu 0,00428 расширен — тост «-180 … 200»
        assertTrue(vmw.toasts.length === 1 &&
            vmw.toasts[0].indexOf('Температура вне диапазона НСХ') !== -1 &&
            vmw.toasts[0].indexOf('-180') !== -1 && vmw.toasts[0].indexOf('200') !== -1,
            'тост с границами: ' + (vmw.toasts[0] || '—'));
    });

    test('Cu50: R=10 Ом ниже НСХ → тост «Значение вне диапазона» + очистка', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'rtd', 'cu50_1428', 'K');
        vmw.els['tempQueryVal'].value = '10';
        vmw.api.tempQueryFromValue();
        assertEqual(vmw.els['tempQueryTemp'].value, '', 'поле температуры очищено');
        assertTrue(vmw.toasts.length === 1 &&
            vmw.toasts[0].indexOf('Значение вне диапазона НСХ') !== -1 &&
            vmw.toasts[0].indexOf('Ом') !== -1,
            'тост с единицей Ом');
    });

    test('Pt100 (IEC): t=55 → 121,32; t=100 → 138,51 (сверка с IEC 60751)', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'rtd', 'pt100_1385', 'K');
        vmw.els['tempQueryTemp'].value = '55';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '121,32', 'R(55) Pt100');
        vmw.els['tempQueryTemp'].value = '100';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '138,51', 'R(100) Pt100');
    });

    test('Pt100: t=−50 (член C) → 80,3063 Ом; обратная задача → −50', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'rtd', 'pt100_1385', 'K');
        vmw.els['tempQueryTemp'].value = '-50';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '80,3063', 'R(−50) с членом C');
        vmw.els['tempQueryVal'].value = '80,3063';
        vmw.els['tempQueryTemp'].value = '';
        vmw.api.tempQueryFromValue();
        assertEqual(vmw.els['tempQueryTemp'].value, '-50', 'инверсия ниже 0°C — бисекция');
    });

    test('Pt1000 (IEC): t=100 → 1385,05 Ом (R₀=1000)', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'rtd', 'pt1000_1385', 'K');
        vmw.els['tempQueryTemp'].value = '100';
        vmw.api.tempQueryFromTemp();
        const r = parseRu(vmw.els['tempQueryVal'].value);
        assertTrue(Math.abs(r - 1385.055) < 0.01, 'R(100) Pt1000 ≈ 1385,05, получено ' + r);
    });

    test('Pt100: t=−300 вне НСХ → тост', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'rtd', 'pt100_1385', 'K');
        vmw.els['tempQueryTemp'].value = '-300';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '', 'очищено');
        assertTrue(vmw.toasts.length === 1, 'тост показан');
    });

    test('Пустое поле температуры очищает поле значения', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'rtd', 'cu50_1428', 'K');
        vmw.els['tempQueryVal'].value = '61,77';
        vmw.els['tempQueryTemp'].value = '';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '', 'NaN → очистка парного поля');
        assertEqual(vmw.toasts.length, 0, 'без тоста');
    });
});

describe('Task 371 — VM: живой расчёт ТП (температура ↔ термо-ЭДС)', () => {

    test('ТХА (K): t=400 → 16,3971 мВ; обратная задача → 400', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'tc', 'cu50_1428', 'K');
        vmw.els['tempQueryTemp'].value = '400';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '16,3971', 'E(400) по полиному приложения');
        vmw.els['tempQueryVal'].value = '16,3971';
        vmw.els['tempQueryTemp'].value = '';
        vmw.api.tempQueryFromValue();
        const t = parseRu(vmw.els['tempQueryTemp'].value);
        assertTrue(Math.abs(t - 400) < 0.01, 'инверсия ≈ 400, получено ' + t);
    });

    test('ТХА (K): t=−100 → −3,5536 мВ; обратно → −99,999', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'tc', 'cu50_1428', 'K');
        vmw.els['tempQueryTemp'].value = '-100';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '-3,5536', 'E(−100), ветка t<0');
        vmw.els['tempQueryVal'].value = '-3,5536';
        vmw.els['tempQueryTemp'].value = '';
        vmw.api.tempQueryFromValue();
        const t = parseRu(vmw.els['tempQueryTemp'].value);
        assertTrue(Math.abs(t - (-100)) < 0.01, 'инверсия ≈ −100, получено ' + t);
    });

    test('ТПР (B): t=1000 → 4,8343 мВ; обратно → 1000', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'tc', 'cu50_1428', 'B');
        vmw.els['tempQueryTemp'].value = '1000';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '4,8343', 'E(1000) тип B');
        vmw.els['tempQueryVal'].value = '4,8343';
        vmw.els['tempQueryTemp'].value = '';
        vmw.api.tempQueryFromValue();
        const t = parseRu(vmw.els['tempQueryTemp'].value);
        assertTrue(Math.abs(t - 1000) < 0.01, 'инверсия ≈ 1000, получено ' + t);
    });

    test('ТМК (T): t=−100 → ≈ −3,378 мВ; обратная задача', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'tc', 'cu50_1428', 'T');
        vmw.els['tempQueryTemp'].value = '-100';
        vmw.api.tempQueryFromTemp();
        const e = parseRu(vmw.els['tempQueryVal'].value);
        assertTrue(Math.abs(e - (-3.3787)) < 0.002, 'E(−100) тип T ≈ −3,379, получено ' + e);
        vmw.els['tempQueryVal'].value = vmw.els['tempQueryVal'].value;
        vmw.els['tempQueryTemp'].value = '';
        vmw.api.tempQueryFromValue();
        const t = parseRu(vmw.els['tempQueryTemp'].value);
        assertTrue(Math.abs(t - (-100)) < 0.01, 'инверсия ≈ −100, получено ' + t);
    });

    test('K: E=100 мВ выше НСХ (макс 54,8864) → тост с «мВ» + очистка', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'tc', 'cu50_1428', 'K');
        vmw.els['tempQueryVal'].value = '100';
        vmw.api.tempQueryFromValue();
        assertEqual(vmw.els['tempQueryTemp'].value, '', 'поле температуры очищено');
        assertTrue(vmw.toasts.length === 1 &&
            vmw.toasts[0].indexOf('Значение вне диапазона НСХ') !== -1 &&
            vmw.toasts[0].indexOf('мВ') !== -1,
            'тост с единицей мВ: ' + (vmw.toasts[0] || '—'));
    });

    test('K: t=1373 вне НСХ (макс 1372) → тост', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'tc', 'cu50_1428', 'K');
        vmw.els['tempQueryTemp'].value = '1373';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '', 'очищено');
        assertTrue(vmw.toasts.length === 1, 'тост показан');
    });

    test('getTempSensorRange: границы по типам', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'rtd', 'cu100_1426', 'K');
        assertEqual(JSON.stringify(vmw.api.getTempSensorRange()), '{"min":-50,"max":200}', 'Cu');
        setForm(vmw, 'rtd', 'pt50_1391', 'K');
        assertEqual(JSON.stringify(vmw.api.getTempSensorRange()), '{"min":-200,"max":850}', 'Pt');
        setForm(vmw, 'tc', 'cu50_1428', 'J');
        assertEqual(JSON.stringify(vmw.api.getTempSensorRange()), '{"min":-210,"max":1200}', 'J');
        setForm(vmw, 'tc', 'cu50_1428', 'B');
        assertEqual(JSON.stringify(vmw.api.getTempSensorRange()), '{"min":0,"max":1820}', 'B');
        setForm(vmw, 'tc', 'cu50_1428', 'R');
        assertEqual(JSON.stringify(vmw.api.getTempSensorRange()), '{"min":-50,"max":1768}', 'R');
    });

    test('Task 373: подписи панели подставляются под тип датчика (SRC)', () => {
        // генератор удалён — подпись второго поля меняет openTempSensor
        // (проверено в SRC выше); здесь — статичная разметка содержит
        // оба варианта подстановки и общий пример температуры
        const iPanel = INDEX_SRC.indexOf('id="tempCustomCalcPanel"');
        const iRange = INDEX_SRC.indexOf('id="temp_sensor_min"');
        const panel = INDEX_SRC.slice(iPanel, iRange);
        // Task 499: «Например: …» в полях заменены диапазонами НСХ
        // (плейсхолдеры, бледный текст)
        assertTrue(panel.indexOf('Например:') === -1, 'Task 499: предложений «Например:» нет');
        assertTrue(panel.indexOf('Task 499 (заявка: «подсказки диапазонов') !== -1,
            'комментарий Task 499 в панели');
        assertTrue(panel.indexOf('Сопротивление R(t), Ом') !== -1, 'подпись ТС (дефолт)');
        const op = grabFn('openTempSensor');
        assertTrue(op.indexOf("Термо-ЭДС E(t), мВ") !== -1, 'подпись ТП подставляется');
        assertTrue(op.indexOf('vInp.placeholder=fmtM499(vmin499)') !== -1,
            'Task 499: диапазон подставляется прямо в поле');
    });
});

describe('Task 371 — VM: calcTempSensor — таблица в результатах, панель — статичная', () => {

    test('Ветка ТС: таблица есть, панели в результатах НЕТ (Task 373)', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'rtd', 'cu50_1428', 'K');
        vmw.els['temp_sensor_min'] = { value: '0', style: {} };
        vmw.els['temp_sensor_max'] = { value: '100', style: {} };
        vmw.els['temp_sensor_step'] = { value: '10', style: {} };
        vmw.api.calcTempSensor();
        const html = vmw.els['tempSensorResults'].innerHTML;
        assertTrue(html.indexOf('tempTableContainer') !== -1, 'таблица есть');
        assertTrue(html.indexOf('id="tempCustomCalcPanel"') === -1, 'панели в результатах нет (Task 373)');
        assertTrue(html.indexOf('Расчёт произвольных значений') === -1, 'заголовка блока в результатах нет');
        assertTrue(html.indexOf('id="tempQueryTemp"') === -1, 'полей панели в результатах нет');
    });

    test('Ветка ТП: подписи панели в результатах нет', () => {
        const vmw = makeTempVm();
        setForm(vmw, 'tc', 'cu50_1428', 'K');
        vmw.els['temp_sensor_min'] = { value: '0', style: {} };
        vmw.els['temp_sensor_max'] = { value: '100', style: {} };
        vmw.els['temp_sensor_step'] = { value: '10', style: {} };
        vmw.api.calcTempSensor();
        const html = vmw.els['tempSensorResults'].innerHTML;
        assertTrue(html.indexOf('Термо-ЭДС E(t), мВ') === -1, 'подписи ТП в результатах нет');
        assertTrue(html.indexOf('Сопротивление R(t), Ом') === -1, 'подписи ТС в результатах нет');
        assertTrue(html.indexOf('tempTableContainer') !== -1, 'таблица ТП есть');
    });

    test('Task 373: панель — в статичной разметке страницы (видна всегда)', () => {
        // Панель живёт в разметке #page-temp-sensor-view над формой выбора
        // — не зависит от нажатия «Рассчитать» (заявка Task 373)
        const b = (function () {
            const i = INDEX_SRC.indexOf('<div id="page-temp-sensor-view"');
            let pos = i, depth = 0, started = false;
            while (pos < INDEX_SRC.length) {
                const m = /<\/?div\b/.exec(INDEX_SRC.slice(pos));
                if (!m) break;
                pos = pos + m.index;
                if (INDEX_SRC[pos + 1] === '/') { depth--; } else { depth++; started = true; }
                pos += 4;
                if (started && depth === 0) return INDEX_SRC.slice(i, pos);
            }
            return null;
        })();
        assertTrue(b !== null, 'страница датчика есть');
        assertTrue(b.indexOf('id="tempCustomCalcPanel"') !== -1, 'панель в разметке страницы');
        assertTrue(b.indexOf('id="temp_sensor_min"') !== -1, 'форма выбора в разметке');
        assertTrue(b.indexOf('id="tempCustomCalcPanel"') < b.indexOf('id="temp_sensor_min"'),
            'панель НАД формой — отображается всегда');
    });
});

// ============================================================
// D. SW v600 (guard v601)
// ============================================================
describe('Task 371 — SW: версия кэша kipia-test-v760', () => {

    test('CACHE_VERSION = kipia-test-v760', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v760'") !== -1,
            'SW бампнут до v600');
    });

    test('Guard: v605 ещё не существует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v761') === -1,
            'v601 не должен существовать (следующий бамп)');
    });
});
