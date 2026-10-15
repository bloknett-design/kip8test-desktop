// tests/test-task499.js
// Task 499: заявка пользователя — «Подсказки диапазонов впиши
//   непосредственно в поля ввода, бледным текстом, вместо предложения
//   "Например: 55" и так далее. И проверь у 50М (Cu50) α = 0,00428 °C⁻¹
//   диапазон по моему -180...200 °C.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — calcCuResistance: ниже 0 °C для α = 0,00428 — формула
//      5.2.3 ГОСТ 6651-2009 (A = 4,28e-3, B = −6,2032e-7,
//      C = 8,5154e-10, член B·t·(t+6,7) + C·t³; для α = 0,00426 —
//      НСХ остаётся линейной); каталог: Cu 0,00428 — −180…+200
//      (таблица А.3 / 5.2.3), Cu 0,00426 — −50…+200; openTempSensor:
//      подсказки диапазонов — ПЛЕЙСХОЛДЕРЫ полей ППР (бледный текст,
//      прежний CSS ::placeholder) вместо «Например: …»; div-подсказки
//      ts-calc-range и CSS-правила удалены; строки формул 50М/100М
//      и справка «Формулы ТС» — с веткой ГОСТ ниже 0 °C.
//   B. fns — эталоны таблицы А.3 ГОСТ 6651-2009 (R₀ = 100):
//      −180→20,53; −170→25,10; −120→47,65; −100→56,54; −50→78,46;
//      0→100,00; +200→185,60; 50М: −180→10,2642, −50→39,2275;
//      1426: линейная при любой t (−50→39,35); монотонность
//      и непрерывность в 0 °C.
//   C. VM — плейсхолдеры полей по датчикам («−180…200 °C» /
//      «10,2642…92,8 Ом» / мВ); каталог (−180…200 / −50…200);
//      живой расчёт R(−180)/R(−50) по ГОСТ и инверсия; тост вне
//      диапазона (−190); смена датчика обновляет плейсхолдеры;
//      справка: диапазон НСХ −180…200 + формула ф. 5.2.3.
//   D. SW kipia-test-v741 (guard v724).
//
// УРОКИ (из 495/496/498): тест пишется ПОСЛЕ бампа — ассерты v723,
// гарды v724; бампом не трогается.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue, assertFalse, assertApprox } = require('./test-helpers.js');
const { extractFunctions } = require('./extract-functions.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const fns = extractFunctions();

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

// Чанк панели ППР: от id="tempCustomCalcPanel" до конца панели
function panelChunk() {
    const i = INDEX_SRC.indexOf('id="tempCustomCalcPanel"');
    if (i === -1) return null;
    let pos = INDEX_SRC.lastIndexOf('<div', i);
    let depth = 0, started = false;
    while (pos < INDEX_SRC.length) {
        const m = /<\/?div\b/.exec(INDEX_SRC.slice(pos));
        if (!m) break;
        pos = pos + m.index;
        if (INDEX_SRC[pos + 1] === '/') { depth--; } else { depth++; started = true; }
        pos += 4;
        if (started && depth === 0) return INDEX_SRC.slice(i, pos);
    }
    return null;
}

// ================================ A. SRC ================================

describe('Task 499 — SRC: формула 5.2.3 ГОСТ 6651-2009 (медь ниже 0 °C)', () => {

    test('calcCuResistance: коэффициенты A/B/C формулы 5.2.3', () => {
        const fn = grabFn('calcCuResistance');
        assertTrue(fn !== null, 'функция есть');
        assertTrue(fn.indexOf('4.28e-3') !== -1, 'A = 4,28·10⁻³');
        assertTrue(fn.indexOf('-6.2032e-7') !== -1, 'B = −6,2032·10⁻⁷');
        assertTrue(fn.indexOf('8.5154e-10') !== -1, 'C = 8,5154·10⁻¹⁰');
        assertTrue(fn.indexOf('B*t*(t+6.7)') !== -1, 'член B·t·(t+6,7 °C)');
        assertTrue(fn.indexOf('C*t*t*t') !== -1, 'член C·t³');
    });

    test('calcCuResistance: ветка ГОСТ — только α = 0,00428 и t < 0', () => {
        const fn = grabFn('calcCuResistance');
        assertTrue(fn.indexOf('t<0 && Math.abs(alpha-0.00428)<1e-9') !== -1,
            'условие: t < 0 и α = 0,00428 (для 0,00426 — линейная)');
        assertTrue(fn.indexOf('return r0*(1+alpha*t);') !== -1,
            'линейная ветка жива (t ≥ 0 и α = 0,00426)');
        // комментарий с эталонами таблицы А.3 — перед функцией
        const iFn = INDEX_SRC.indexOf('function calcCuResistance(');
        assertTrue(INDEX_SRC.slice(Math.max(0, iFn - 1400), iFn).indexOf('таблице А.3') !== -1,
            'комментарий Task 499 с эталонами А.3 перед функцией');
    });

    test('Каталог: Cu α = 0,00428 — −180…+200; α = 0,00426 — −50…+200', () => {
        const fn = grabFn('getTempSensorCatalog');
        assertTrue(fn !== null, 'функция есть');
        assertTrue(fn.indexOf('rng499=isCu?((Math.abs(sd.alpha-0.00428)<1e-9)?{min:-180,max:200}:{min:-50,max:200}):{min:-200,max:850}') !== -1,
            'rng499: 0,00428 → −180…200; 0,00426 → −50…200; Pt → −200…850');
        // комментарий 499 — над каталогом (окно 2600: 491/498/499)
        const iCat = INDEX_SRC.indexOf('function getTempSensorCatalog(');
        const before = INDEX_SRC.slice(Math.max(0, iCat - 2600), iCat);
        assertTrue(before.indexOf('Task 499 (заявка: «проверь у 50М') !== -1,
            'комментарий Task 499 перед каталогом');
        assertTrue(before.indexOf('таблица А.3 начинается с') !== -1,
            'обоснование: таблица А.3 с −180 °C');
    });

    test('openTempSensor: подсказки — ПЛЕЙСХОЛДЕРЫ полей, не строки', () => {
        const fn = grabFn('openTempSensor');
        assertTrue(fn !== null, 'функция есть');
        assertTrue(fn.indexOf('tInp.placeholder=fmtI499(rng499.min)') !== -1,
            'плейсхолдер температуры: «min…max °C»');
        assertTrue(fn.indexOf('vInp.placeholder=fmtM499(vmin499)') !== -1,
            'плейсхолдер значения: «vmin…vmax Ом/мВ»');
        assertTrue(fn.indexOf('tempCalcForwardValue(rng499.min)') !== -1,
            'значения на границах — через НСХ');
        assertTrue(fn.indexOf("'Ом':'мВ'") !== -1, 'единица по типу датчика');
        assertTrue(fn.indexOf("vInp.placeholder=''") !== -1,
            'защита: при недоступной НСХ плейсхолдер сбрасывается');
        // прежние предложения-примеры и div-подсказки удалены
        assertFalse(fn.indexOf('placeholder=\'Например') !== -1,
            'присваиваний «Например: …» больше нет');
        assertFalse(fn.indexOf('tempQueryTempRange') !== -1, 'div °C-подсказки нет');
        assertFalse(fn.indexOf('tempQueryValRange') !== -1, 'div Ом/мВ-подсказки нет');
    });

    test('HTML: поля без «Например:», div-подсказок нет, комментарий 499', () => {
        const p = panelChunk();
        assertTrue(p !== null, 'панель ППР найдена');
        assertTrue(p.indexOf('placeholder="Например:') === -1,
            'статических placeholder «Например: …» нет');
        assertEqual(p.split('ts-calc-range').length - 1, 0, 'div-подсказок нет');
        assertEqual(p.split('id="tempQueryTempRange"').length - 1, 0, 'id °C удалён');
        assertEqual(p.split('id="tempQueryValRange"').length - 1, 0, 'id Ом/мВ удалён');
        assertTrue(p.indexOf('Task 499 (заявка: «подсказки диапазонов') !== -1,
            'комментарий Task 499 в панели');
        // инварианты Task 494/496 не задеты
        assertEqual(p.split('class="scale-field ts-calc-field"').length - 1, 2,
            'оба поля — ts-calc-field (Task 494)');
        assertEqual(p.split('onkeydown="tempQueryEnterBlur(event,this)"').length - 1, 2,
            'Enter закрывает клавиатуру (Task 496)');
    });

    test('CSS: правила .ts-calc-range удалены, бледный ::placeholder жив', () => {
        assertEqual(INDEX_SRC.split('ts-calc-range').length - 1, 0,
            'упоминаний ts-calc-range в index.html нет вовсе (ts-card-range не задет)');
        assertTrue(INDEX_SRC.indexOf('.ts-calc-field::placeholder { color: rgba(255, 255, 255, 0.4); font-weight: 500; }') !== -1,
            'бледный плейсхолдер — тёмная тема (Task 494, жив)');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ts-calc-field::placeholder { color: rgba(20, 20, 19, 0.45); }') !== -1,
            'бледный плейсхолдер — светлая тема (жив)');
    });

    test('getRtdSensorMap: формулы 50М/100М с веткой ГОСТ (×2)', () => {
        const fn = grabFn('getRtdSensorMap');
        assertEqual(fn.split('по ГОСТ 6651-2009 (ф. 5.2.3)').length - 1, 2,
            'формулы 50М и 100М (α = 0,00428) упоминают ГОСТ 5.2.3');
        assertTrue(fn.indexOf("R(t) = R₀(1 + 0,00426·t)") !== -1,
            'формулы 1426 остались линейными');
    });

    test('Справка: «Формулы ТС» — с формулой 5.2.3 для меди', () => {
        const fn = grabFn('tempSensorInfoHtml');
        assertTrue(fn.indexOf('B·t·(t+6,7 °C) + C·t³') !== -1,
            'формула меди ниже 0 °C в справке');
        assertTrue(fn.indexOf('ф. 5.2.3') !== -1, 'ссылка на формулу 5.2.3');
        assertTrue(fn.indexOf('8,5154·10⁻¹⁰') !== -1, 'коэффициент C в справке');
    });
});

// ==================== B. fns: эталоны таблицы А.3 ====================

describe('Task 499 — calcCuResistance: эталоны таблицы А.3 ГОСТ 6651-2009', () => {

    // Эталоны — таблица А.3 ГОСТ 6651-2009 (медь, R₀ = 100, α = 0,00428):
    // −180 → 20,53; −170 → 25,10; −120 → 47,65; −100 → 56,54;
    // −50 → 78,46; 0 → 100,00; +200 → 185,60.
    test('100М (R₀ = 100): отрицательные температуры — по ГОСТ 5.2.3', () => {
        assertApprox(fns.calcCuResistance(-180, 100, 0.00428), 20.53, 0.01, 'R(−180) = 20,53');
        assertApprox(fns.calcCuResistance(-170, 100, 0.00428), 25.10, 0.01, 'R(−170) = 25,10');
        assertApprox(fns.calcCuResistance(-120, 100, 0.00428), 47.65, 0.01, 'R(−120) = 47,65');
        assertApprox(fns.calcCuResistance(-100, 100, 0.00428), 56.54, 0.01, 'R(−100) = 56,54');
        assertApprox(fns.calcCuResistance(-50, 100, 0.00428), 78.46, 0.01, 'R(−50) = 78,46');
    });

    test('100М: 0 и выше — линейная формула (5.2.3/6)', () => {
        assertApprox(fns.calcCuResistance(0, 100, 0.00428), 100.00, 0.001, 'R(0) = 100');
        assertApprox(fns.calcCuResistance(100, 100, 0.00428), 142.80, 0.01, 'R(100) = 142,8');
        assertApprox(fns.calcCuResistance(200, 100, 0.00428), 185.60, 0.01, 'R(200) = 185,6');
    });

    test('50М (R₀ = 50): половина от 100М (−180 → 10,2642)', () => {
        assertApprox(fns.calcCuResistance(-180, 50, 0.00428), 10.2642, 0.001, 'R(−180) 50М');
        assertApprox(fns.calcCuResistance(-50, 50, 0.00428), 39.2275, 0.001, 'R(−50) 50М');
        assertApprox(fns.calcCuResistance(200, 50, 0.00428), 92.8, 0.01, 'R(200) 50М');
    });

    test('α = 0,00426: линейная при любой t (−50 → 39,35)', () => {
        assertApprox(fns.calcCuResistance(-50, 50, 0.00426), 39.35, 0.001, 'R(−50) линейно');
        assertApprox(fns.calcCuResistance(-180, 50, 0.00426), 11.66, 0.01,
            'R(−180) линейно (в каталоге диапазон 1426 — только −50…+200)');
    });

    test('Монотонность и непрерывность в 0 °C', () => {
        let prev = -1;
        for (let t = -180; t <= 200; t += 5) {
            const r = fns.calcCuResistance(t, 100, 0.00428);
            assertTrue(r > prev, 'R монотонно растёт при t=' + t);
            prev = r;
        }
        // ветка ГОСТ при t→0⁻ стремится к r0: члены B/C обнуляются при t=0
        const eps = Math.abs(fns.calcCuResistance(-1e-9, 100, 0.00428) - 100);
        assertTrue(eps < 1e-6, 'стык веток при 0 °C непрерывен');
    });
});

// ================== C. VM: плейсхолдеры и живой расчёт ==================

// VM-харнесс по образцу test-task498.js (openTempSensor + зависимости)
function makeVm() {
    const els = {};
    const mkEl = () => ({
        value: '', style: {}, innerHTML: '', textContent: '',
        placeholder: '',
        scrollIntoView: () => {}, children: [],
        _attrs: {},
        setAttribute(k, v) { this._attrs[k] = String(v); },
        getAttribute(k) { return (k in this._attrs) ? this._attrs[k] : null; },
    });
    const document = {
        getElementById: id => (els[id] || (els[id] = mkEl())),
        querySelectorAll: () => []
    };
    const toasts = [];
    const nav = [];
    const store = {};
    const ctx = {
        document,
        localStorage: {
            getItem: k => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: k => { delete store[k]; }
        },
        showToast: m => toasts.push(String(m)),
        parseLocaleNumber: fns.parseLocaleNumber,
        formatNumber: fns.formatNumber,
        calcCuResistance: fns.calcCuResistance,
        calcRtdResistance: fns.calcRtdResistance,
        calcTcVoltage: fns.calcTcVoltage,
        setTimeout: () => 0,
        navigator: {},
        navigateTo: p => nav.push(p)
    };
    vm.createContext(ctx);
    const code = ['getRtdSensorMap', 'getTcSensorMap', 'getTempSensorCatalog',
                  'tempSensorFindByKey', 'renderTempSensorCards', 'setTempSensorsTab',
                  'toggleTempSensorFav', 'toggleTempSensorFavFromView',
                  'updateTempSensorFavBtn', 'openTempSensor',
                  'tempSensorInfoHtml', 'getTempSensorRange',
                  'tempCalcForwardValue', 'tempCalcInvertValue',
                  'tempQueryFromTemp', 'tempQueryFromValue', 'calcTempSensor']
        .map(grabFn).join('\n');
    const tempFavStart = INDEX_SRC.indexOf('var TempFav={');
    const tempFavBrace = INDEX_SRC.indexOf('{', tempFavStart);
    let tfDepth = 0, tfEnd = -1;
    for (let i = tempFavBrace; i < INDEX_SRC.length; i++) {
        if (INDEX_SRC[i] === '{') tfDepth++;
        else if (INDEX_SRC[i] === '}') { tfDepth--; if (tfDepth === 0) { tfEnd = i + 2; break; } }
    }
    const tempFavSrc = INDEX_SRC.slice(tempFavStart, tfEnd);
    vm.runInContext('var tempSensorKey=null; var tempSensorsTab=\'all\';\n' + tempFavSrc + '\n' + code + '\n;globalThis.__api = {' +
        'getTempSensorCatalog, openTempSensor, tempSensorInfoHtml, TempFav, ' +
        'renderTempSensorCards, getTempSensorRange, tempCalcForwardValue, ' +
        'tempCalcInvertValue, tempQueryFromTemp, tempQueryFromValue, ' +
        'calcTempSensor, setSensor: function(k){ tempSensorKey = k; }};', ctx);
    return { els, toasts, nav, api: ctx.__api };
}

describe('Task 499 — VM: плейсхолдеры диапазонов в полях ППР', () => {

    test('50М (Cu50, 0,00428): «−180…200 °C» + «10,2642…92,8 Ом»', () => {
        const vmw = makeVm();
        vmw.api.openTempSensor('cu50_1428');
        assertEqual(vmw.els['tempQueryTemp'].placeholder, '−180…200 °C',
            'плейсхолдер температуры (минус — типографский)');
        assertEqual(vmw.els['tempQueryVal'].placeholder, '10,2642…92,8 Ом',
            'плейсхолдер сопротивления: −180 по ГОСТ 5.2.3');
    });

    test('100М и 50М (0,00426): от R₀ и от α', () => {
        const vmw = makeVm();
        vmw.api.openTempSensor('cu100_1428');
        assertEqual(vmw.els['tempQueryTemp'].placeholder, '−180…200 °C', '100М: −180…200 °C');
        assertEqual(vmw.els['tempQueryVal'].placeholder, '20,5284…185,6 Ом',
            '100М: 20,5284 (А.3)…185,6');
        vmw.api.openTempSensor('cu50_1426');
        assertEqual(vmw.els['tempQueryTemp'].placeholder, '−50…200 °C',
            '1426: диапазон прежний (−50…+200)');
        assertEqual(vmw.els['tempQueryVal'].placeholder, '39,35…92,6 Ом',
            '1426: линейная НСХ');
    });

    test('Каталог: диапазоны Cu (−180…200 / −50…200)', () => {
        const vmw = makeVm();
        const cat = vmw.api.getTempSensorCatalog();
        const byKey = {};
        cat.forEach(s => { byKey[s.key] = s; });
        assertEqual(JSON.stringify(byKey['cu50_1428'].range), '{"min":-180,"max":200}', '50М 0,00428');
        assertEqual(JSON.stringify(byKey['cu100_1428'].range), '{"min":-180,"max":200}', '100М 0,00428');
        assertEqual(JSON.stringify(byKey['cu50_1426'].range), '{"min":-50,"max":200}', '50М 0,00426');
        assertEqual(JSON.stringify(byKey['cu100_1426'].range), '{"min":-50,"max":200}', '100М 0,00426');
    });

    test('Карточки каталога: «НСХ: −180…200 °C» для 0,00428', () => {
        const vmw = makeVm();
        vmw.api.renderTempSensorCards();
        const rtdHtml = vmw.els['tsRtdCards'].innerHTML;
        assertTrue(rtdHtml.indexOf('НСХ: −180…200 °C') !== -1,
            'на карточках 50М/100М (0,00428) — −180…200');
        assertTrue(rtdHtml.indexOf('НСХ: −50…200 °C') !== -1,
            'на карточках 1426 — прежние −50…200');
    });

    test('Смена датчика обновляет плейсхолдеры (мВ ↔ Ом)', () => {
        const vmw = makeVm();
        vmw.api.openTempSensor('cu50_1428');
        assertEqual(vmw.els['tempQueryVal'].placeholder, '10,2642…92,8 Ом', 'до смены');
        vmw.api.openTempSensor('tc_K');
        assertEqual(vmw.els['tempQueryVal'].placeholder, '−6,4577…54,8864 мВ', 'после смены');
        assertEqual(vmw.els['tempQueryValLabel'].textContent, 'Термо-ЭДС E(t), мВ', 'подпись ТП');
    });

    test('Справка датчика: диапазон НСХ −180…200 + формула 5.2.3', () => {
        const vmw = makeVm();
        vmw.api.openTempSensor('cu50_1428');
        const html = vmw.els['tempSensorInfoBody'].innerHTML;
        assertTrue(html.indexOf('диапазон НСХ: -180…200 °C') !== -1,
            'справка: диапазон −180…200');
        assertTrue(html.indexOf('ф. 5.2.3') !== -1, 'справка: формула 5.2.3');
        assertTrue(html.indexOf('8,5154·10⁻¹⁰') !== -1, 'справка: коэффициент C');
    });
});

describe('Task 499 — VM: живой расчёт по ГОСТ 5.2.3', () => {

    test('50М: t = −180 / −50 → 10,2642 / 39,2275 Ом', () => {
        const vmw = makeVm();
        vmw.api.openTempSensor('cu50_1428');
        vmw.els['tempQueryTemp'].value = '-180';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '10,2642', 'R(−180) по ГОСТ 5.2.3');
        vmw.els['tempQueryTemp'].value = '-50';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '39,2275', 'R(−50) по ГОСТ 5.2.3');
        vmw.els['tempQueryTemp'].value = '200';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '92,8', 'R(200) — линейная ветка');
    });

    test('50М: t = −190 — вне НСХ → тост с «-180» + поле очищено', () => {
        const vmw = makeVm();
        vmw.api.openTempSensor('cu50_1428');
        vmw.els['tempQueryTemp'].value = '-190';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '', 'поле значения очищено');
        assertTrue(vmw.toasts.length >= 1 &&
            vmw.toasts[vmw.toasts.length - 1].indexOf('-180') !== -1,
            'тост с нижней границей −180: ' + (vmw.toasts[vmw.toasts.length - 1] || '—'));
    });

    test('Инверсия: R = 39,2275 → ≈ −50 °C; R = 10,2642 → ≈ −180 °C', () => {
        const vmw = makeVm();
        vmw.api.openTempSensor('cu50_1428');
        vmw.els['tempQueryVal'].value = '39,2275';
        vmw.els['tempQueryTemp'].value = '';
        vmw.api.tempQueryFromValue();
        let t = parseFloat(vmw.els['tempQueryTemp'].value.replace(',', '.'));
        assertTrue(isFinite(t) && Math.abs(t - (-50)) < 0.05,
            'инверсия ГОСТ 5.2.3 → −50, получено ' + t);
        vmw.els['tempQueryVal'].value = '10,2642';
        vmw.api.tempQueryFromValue();
        t = parseFloat(vmw.els['tempQueryTemp'].value.replace(',', '.'));
        assertTrue(isFinite(t) && Math.abs(t - (-180)) < 0.05,
            'инверсия нижней границы → −180, получено ' + t);
    });
});

// ================================ D. SW ================================

describe('Task 499 — SW', () => {

    test('SW: CACHE_VERSION = kipia-test-v741, один инкремент', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v741';") !== -1,
            'CACHE_VERSION = kipia-test-v741');
        assertFalse(SW_SRC.indexOf('kipia-test-v722') !== -1,
            'v722 в sw.js отсутствует (ровно один инкремент)');
    });

    test('SW: guard-версия kipia-test-v741 НЕ выпущена', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v741';");
        assertTrue(i !== -1, 'строка версии есть');
        assertFalse(SW_SRC.indexOf('kipia-test-v742') !== -1,
            'v724 в sw.js нет (guard для следующей задачи)');
    });

    test('SW: комментарий Task 499 в истории', () => {
        const i = SW_SRC.indexOf('Task 499: подсказки диапазонов НСХ');
        assertTrue(i !== -1, 'маркер Task 499 есть');
        const ver = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v741';");
        assertTrue(i < ver, 'комментарий над версией (в блоке истории)');
        const ctx = SW_SRC.slice(Math.max(0, i - 1500), i);
        assertTrue(ctx.indexOf('Task 498') !== -1,
            'комментарий Task 498 не вытеснен (рядом, раньше в истории)');
    });
});

console.log('test-task499: все describes зарегистрированы');
