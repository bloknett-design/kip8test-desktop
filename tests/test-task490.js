// tests/test-task490.js
// Task 490: заявка пользователя — «В мобильной версии, в разделе
//   "Датчики температуры" расположи кнопки с градуировками по две в
//   одной строке, с одинаковой градуировкой, и на кнопках термометров
//   оставь только градуировку и температурный коэффициент, а у термопар
//   градуировку и наименование, кнопки термопар ТХА (K) и ТХК (L)
//   расположи вместе, остальные кнопки по своему усмотрению.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — мобильная сетка (≤1023px): ДВЕ колонки; скрытие на
//      мобильном аналога в скобках (ts-card-name-analog), R₀
//      (ts-card-r0), разделителя « · » (ts-card-meta-sep), диапазона
//      НСХ (ts-card-range) и материала ТП (ts-card-tc .ts-card-meta);
//      последняя непарная кнопка — во всю строку; десктопная сетка
//      auto-fill minmax(240px) не тронута; ≤400px — компактнее.
//   B. SRC — порядок ТП в каталоге: ['K','L','J','T','E','N','R','S','B']
//      (ТХА (K)+ТХК (L) вместе; J+T, E+N, R+S; B замыкает).
//   C. VM — рендер: спаны имени/meta ТС (десктоп-текст прежний:
//      textContent = «50М (Cu50)» / «R₀ = 50 Ом · α = 0,00428 °C⁻¹»);
//      ТП-карточки без спанов (наименование с градуировкой); порядок
//      onclick-ключей ТП; ТХА (K) и ТХК (L) — СОСЕДНИЕ карточки.
//   D. VM — пары ТС по градуировке (Task 491: 50М+50М, 100М+
//      100М — одинаковая градуировка, разные α; 50П+100П,
//      Pt100+Pt1000 — пары Task 490 без изменений).
//   E. SW v714 (guard v715).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');
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

// Извлечение исходника var-объекта «var TempFav={...};» (баланс скобок)
function grabTempFav() {
    const start = INDEX_SRC.indexOf('var TempFav={');
    if (start === -1) return null;
    const braceStart = INDEX_SRC.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < INDEX_SRC.length; i++) {
        if (INDEX_SRC[i] === '{') depth++;
        else if (INDEX_SRC[i] === '}') {
            depth--;
            if (depth === 0) return INDEX_SRC.slice(start, i + 2); // с «;»
        }
    }
    return null;
}

function makeStorage() {
    const store = {};
    return {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
    };
}

// VM как в test-task373: рендер карточек в псевдо-DOM
function makeVm490() {
    const els = {};
    const mkEl = () => ({
        value: '', style: {}, innerHTML: '', textContent: '',
        scrollIntoView: () => {}, children: [],
        _attrs: {},
        setAttribute(k, v) { this._attrs[k] = String(v); },
        getAttribute(k) { return (k in this._attrs) ? this._attrs[k] : null; },
        classList: { toggle() {}, contains() { return false; } }
    });
    const document = {
        getElementById: id => (els[id] || (els[id] = mkEl())),
        querySelectorAll: () => []
    };
    const toasts = [];
    const nav = [];
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
        navigateTo: p => nav.push(p)
    };
    vm.createContext(ctx);
    const code = ['getRtdSensorMap', 'getTcSensorMap', 'getTempSensorCatalog',
                  'tempSensorFindByKey', 'renderTempSensorCards', 'setTempSensorsTab',
                  'toggleTempSensorFav', 'toggleTempSensorFavFromView',
                  'updateTempSensorFavBtn', 'openTempSensor']
        .map(grabFn).join('\n');
    vm.runInContext('var tempSensorKey=null; var tempSensorsTab=\'all\';\n' +
        grabTempFav() + '\n' + code +
        '\n;globalThis.__api = { getRtdSensorMap, getTcSensorMap, getTempSensorCatalog,' +
        ' renderTempSensorCards, TempFav };', ctx);
    return { els, toasts, nav, api: ctx.__api };
}

// ============================================================
// A. SRC — мобильная сетка и компактные кнопки
// ============================================================
describe('Task 490 — SRC: мобильная сетка по две в строке', () => {

    test('Сетка: ДВЕ колонки ниже 1024px, одна колонка удалена', () => {
        assertTrue(INDEX_SRC.indexOf('.ts-cards-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }') !== -1,
            'две колонки в @media (max-width: 1023px)');
        assertTrue(INDEX_SRC.indexOf('@media (max-width: 1023px) { .ts-cards-grid { grid-template-columns: 1fr; } }') === -1,
            'одна колонка (Task 373) удалена');
        // сетка живёт ВНУТРИ мобильного @media-блока
        const m = /@media \(max-width: 1023px\) \{[^@]*?\.ts-cards-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.exec(INDEX_SRC);
        assertTrue(m !== null, 'правило внутри мобильного media-блока');
    });

    test('Кнопки ТС: скрыты аналог, R₀ и разделитель (только градуировка + α)', () => {
        assertTrue(INDEX_SRC.indexOf('.ts-card .ts-card-name-analog, .ts-card .ts-card-r0, .ts-card .ts-card-meta-sep, .ts-card .ts-card-range, .ts-card-tc .ts-card-meta { display: none; }') !== -1,
            'скрытие в @media (max-width: 1023px)');
    });

    test('Кнопки ТП: материал электродов и диапазон НСХ скрыты (остаётся наименование с градуировкой)', () => {
        assertTrue(INDEX_SRC.indexOf('.ts-card-tc .ts-card-meta') !== -1,
            'правило для meta ТП');
        assertTrue(INDEX_SRC.indexOf('.ts-card-range') !== -1,
            'правило для диапазона НСХ');
    });

    test('Последняя непарная кнопка — во всю строку', () => {
        assertTrue(INDEX_SRC.indexOf('.ts-cards-grid > .ts-card:nth-child(odd):last-child { grid-column: 1 / -1; }') !== -1,
            'правило полной ширины');
    });

    test('Десктоп не тронут: auto-fill minmax(240px)', () => {
        assertTrue(INDEX_SRC.indexOf('.ts-cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }') !== -1,
            'базовая десктопная сетка прежняя');
        assertTrue(INDEX_SRC.indexOf('@media (min-width: 1024px) { .ts-cards-grid') === -1,
            'новых десктоп-оверрайдов не добавлено');
    });

    test('Узкие экраны (≤400px): компактнее отступы, крупный шрифт (Task 492)', () => {
        // Task 491: строка дополнена featured-правилом (17px)
        // Task 492 (адаптация): meta 10.5px и feat-правило удалены —
        // крупный шрифт (Task 491) стал базовым у ВСЕХ кнопок
        // (имя 17px ≤400px, meta 12px наследуется из блока ≤1023px)
        assertTrue(INDEX_SRC.indexOf('@media (max-width: 400px) { .ts-card { padding: 9px 10px 10px; } .ts-card-name { font-size: 17px; } }') !== -1,
            'компактная кнопка на узких экранах');
    });
});

// ============================================================
// B. SRC — порядок ТП парами
// ============================================================
describe('Task 490 — SRC: порядок термопар парами', () => {

    test('Каталог ТП: K+L вместе, затем J+T, E+N, R+S, B', () => {
        const fn = grabFn('getTempSensorCatalog');
        assertTrue(fn.indexOf("['K','L','J','T','E','N','R','S','B']") !== -1,
            'новый порядок ТП');
        assertTrue(fn.indexOf("['K','J','T','N','E','L','R','S','B']") === -1,
            'старый порядок удалён');
    });

    test('Каталог ТС (Task 491): 50М+50М, затем 100М+100М', () => {
        const fn = grabFn('getTempSensorCatalog');
        assertTrue(fn.indexOf("['cu50_1428','cu50_1426','cu100_1428','cu100_1426'") !== -1,
            'новый порядок ТС (Task 491: одинаковые градуировки рядом)');
        assertTrue(fn.indexOf("['cu50_1428','cu100_1428','cu50_1426','cu100_1426'") === -1,
            'старый порядок ТС (Task 490: 50М+100М) удалён');
    });
});

// ============================================================
// C. VM — рендер карточек со спанами
// ============================================================
describe('Task 490 — VM: рендер компактных кнопок', () => {

    test('Имя ТС делится на градуировку и аналог (спаны)', () => {
        const vmw = makeVm490();
        vmw.api.renderTempSensorCards();
        const rtd = vmw.els['tsRtdCards'].innerHTML;
        assertTrue(rtd.indexOf('<span class="ts-card-name-main">50М</span><span class="ts-card-name-analog"> (Cu50)</span>') !== -1,
            '50М (Cu50): main + analog');
        assertTrue(rtd.indexOf('<span class="ts-card-name-main">100П</span><span class="ts-card-name-analog"> (Pt100)</span>') !== -1,
            '100П (Pt100): main + analog');
        assertTrue(rtd.indexOf('<span class="ts-card-name-main">Pt1000</span><span class="ts-card-name-analog"> (IEC)</span>') !== -1,
            'Pt1000 (IEC): main + analog');
    });

    test('Meta ТС делится на R₀ и α (спаны)', () => {
        const vmw = makeVm490();
        vmw.api.renderTempSensorCards();
        const rtd = vmw.els['tsRtdCards'].innerHTML;
        assertTrue(rtd.indexOf('<span class="ts-card-r0">R₀ = 50 Ом</span><span class="ts-card-meta-sep"> · </span><span class="ts-card-alpha">α = 0,00428 °C⁻¹</span>') !== -1,
            'Cu50: R₀ скрыт, α остаётся');
        assertTrue(rtd.indexOf('<span class="ts-card-r0">R₀ = 100 Ом</span><span class="ts-card-meta-sep"> · </span><span class="ts-card-alpha">α = 0,00391 (ГОСТ)</span>') !== -1,
            '100П: α ГОСТ');
        assertTrue(rtd.indexOf('<span class="ts-card-alpha">α = 0,00385 (IEC)</span>') !== -1,
            'Pt IEC: α');
    });

    test('Карточки ТП: имя без спанов (наименование + градуировка)', () => {
        const vmw = makeVm490();
        vmw.api.renderTempSensorCards();
        const tc = vmw.els['tsTcCards'].innerHTML;
        assertTrue(tc.indexOf('<span class="ts-card-name">ТХА (K)</span>') !== -1,
            'ТХА (K) одним куском');
        assertTrue(tc.indexOf('<span class="ts-card-name">ТХК (L)</span>') !== -1,
            'ТХК (L) одним куском');
        assertTrue(tc.indexOf('ts-card-name-analog') === -1,
            'у ТП нет аналога-спана');
        assertTrue(tc.indexOf('ts-card-r0') === -1,
            'у ТП нет R₀-спана');
    });

    test('ТХА (K) и ТХК (L) — соседние карточки', () => {
        const vmw = makeVm490();
        vmw.api.renderTempSensorCards();
        const tc = vmw.els['tsTcCards'].innerHTML;
        const keys = [];
        const re = /openTempSensor\('tc_([A-Z])'\)/g;
        let m;
        while ((m = re.exec(tc)) !== null) { keys.push(m[1]); }
        assertEqual(keys.join(','), 'K,L,J,T,E,N,R,S,B', 'порядок ТП в рендере');
        assertEqual(keys.indexOf('K') + 1, keys.indexOf('L'), 'L сразу после K');
    });

    test('8 ТС + 9 ТП карточек, звёзды на месте', () => {
        const vmw = makeVm490();
        vmw.api.renderTempSensorCards();
        const rtd = vmw.els['tsRtdCards'].innerHTML;
        const tc = vmw.els['tsTcCards'].innerHTML;
        assertEqual((rtd.match(/class="ts-card[ "]/g) || []).length, 8, '8 ТС');
        assertEqual((tc.match(/class="ts-card ts-card-tc[ "]/g) || []).length, 9, '9 ТП');
        assertEqual((rtd.match(/ts-card-fav-btn/g) || []).length, 8, 'звёзды ТС');
        assertEqual((tc.match(/ts-card-fav-btn/g) || []).length, 9, 'звёзды ТП');
    });
});

// ============================================================
// D. VM — пары ТС с одинаковой градуировкой (одной α)
// ============================================================
describe('Task 490 — VM: пары ТС по градуировке', () => {

    test('Строки сетки: 50М+50М, 100М+100М (Task 491), 50П+100П, Pt100+Pt1000', () => {
        const vmw = makeVm490();
        const cat = vmw.api.getTempSensorCatalog();
        const rtd = cat.filter(s => s.kind === 'rtd');
        assertEqual(rtd.length, 8, '8 ТС');
        // Task 491: пары (0,1)=(50М,50М), (2,3)=(100М,100М) —
        // одинаковая градуировка, РАЗНЫЕ α; (4,5)=(50П,100П),
        // (6,7)=(Pt100,Pt1000) — пары Task 490 (семья НСХ)
        const mainOf = s => s.name.slice(0, s.name.indexOf(' ('));
        assertEqual(mainOf(rtd[0]), '50М', 'кнопка 1: 50М');
        assertEqual(mainOf(rtd[1]), '50М', 'кнопка 2: 50М рядом (Task 491)');
        assertEqual(mainOf(rtd[2]), '100М', 'кнопка 3: 100М');
        assertEqual(mainOf(rtd[3]), '100М', 'кнопка 4: 100М рядом (Task 491)');
        assertEqual(mainOf(rtd[4]), '50П', 'пара 3: 50П');
        assertEqual(mainOf(rtd[5]), '100П', 'пара 3: 100П');
        assertEqual(mainOf(rtd[6]), 'Pt100', 'пара 4: Pt100');
        assertEqual(mainOf(rtd[7]), 'Pt1000', 'пара 4: Pt1000');
        const alphaOf = s => s.meta.slice(s.meta.indexOf('α'));
        assertEqual(alphaOf(rtd[0]), 'α = 0,00428 °C⁻¹', 'пара 50М №1: 0,00428');
        assertEqual(alphaOf(rtd[1]), 'α = 0,00426 °C⁻¹', 'пара 50М №2: 0,00426');
        assertEqual(alphaOf(rtd[2]), 'α = 0,00428 °C⁻¹', 'пара 100М №1: 0,00428');
        assertEqual(alphaOf(rtd[3]), 'α = 0,00426 °C⁻¹', 'пара 100М №2: 0,00426');
    });
});

// ============================================================
// E. SW — версия кеша
// ============================================================
describe('Task 490 — SW: версия кеша', () => {

    test('SW: кэш поднят до kipia-test-v750', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v750'") !== -1,
            'CACHE_VERSION = kipia-test-v750 (Task 490)');
        assertFalse(SW_SRC.indexOf('kipia-test-v713') !== -1,
            'старой версии v713 нет');
    });
});
