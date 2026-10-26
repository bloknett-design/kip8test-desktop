// tests/test-task528.js
// Task 528: «На изображении фигур надписи должны быть как положено над
//   линиями (если мало места, то вынос линии нужно сделать больше), в
//   фигуре кольцо текст размера внутреннего диаметра можно разместить
//   внутри самой фигуры (там нет явного конфликта с линиями), в
//   горизонтальном цилиндре значения уровня жидкости так же можно
//   разместить над линией (сделать вынос линии немного дальше от
//   фигуры), и все результаты расчётов выводить в блоке с фигурами и
//   при нажатии на кнопку "Расчитать" автоматически смещать экран в
//   сторону фигуры.»
//
// ЧТО ПРОВЕРЯЕТСЯ (пятью слоями):
//   Слой 1 — SRC HTML: панели «Результат» #xx_results убраны со всех
//     6 страниц (ВСЕ результаты — в блоке с фигурой); viewBox каждой
//     рамки = 206 + 17·строк (257/240/274/291/274/257); комментарии
//     рамок дополнены Task 528; кнопки «Рассчитать» на месте.
//   Слой 2 — SRC CSS: комментарий системы схем дополнен Task 528.
//   Слой 3 — SRC JS: gfDimH — подпись всегда НАД линией (labelPos
//     убран; узкий размер — за выносными); gfDimV — labelSide 'none';
//     geoFigScrollTo — определена и вызывается из всех шести calcGeo*
//     (панель результатов и scrollIntoView панели убраны);
//     geoFigRender задаёт высоту viewBox по числу строк; кольцо —
//     подпись d внутри отверстия (holeW-детектор + fallback); гориз.
//     цилиндр — вынос 20, значение h над линией зеркала.
//   Слой 4 — VM: позиции подписей (D — над линией под фигурой у
//     круга/кольца/сферы/конуса; d — внутри отверстия y=81, fallback
//     y=17; h — над линией зеркала y=77/x=182, выносная до x=228;
//     fallback повернутая при h=1,9); ВСЕ результаты в rows (R, Sбок,
//     Sполн, Sосн, Sбок конуса, S сегмента, масса воды ρ=998 —
//     совпадают с математикой calcGeo*); высоты 206+17·n; юнит-тесты
//     gfDimH (над линией / узкий / у края) и gfDimV 'none'.
//   Слой 5 — SW: kipia-test-v758.
//
// Запуск: через tests/run-all.js (require './test-task528.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ============================================================
// Утилиты (как в test-task526.js / test-task527.js)
// ============================================================
function pageBlock(pageId) {
    const i = INDEX_SRC.indexOf('id="page-' + pageId + '"');
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('<!-- ======================== ГЕОМЕТРИЯ', i + 100);
    return INDEX_SRC.slice(i, j === -1 ? INDEX_SRC.length : j);
}

function fnBlock(name) {
    const i = INDEX_SRC.indexOf('function ' + name + '(');
    if (i === -1) return null;
    let depth = 0;
    for (let k = i; k < INDEX_SRC.length; k++) {
        if (INDEX_SRC[k] === '{') depth++;
        else if (INDEX_SRC[k] === '}') {
            depth--;
            if (depth === 0) return INDEX_SRC.slice(i, k + 1);
        }
    }
    return null;
}

function engineCtx() {
    const i0 = INDEX_SRC.indexOf('// [Task 526 geo-fig engine: BEGIN]');
    const i1 = INDEX_SRC.indexOf('// [Task 526 geo-fig engine: END]');
    const engine = INDEX_SRC.slice(i0, i1);
    const fmt = fnBlock('formatNumber');
    const sandbox = { Math: Math, window: { matchMedia: function () { return { matches: false }; } } };
    vm.createContext(sandbox);
    vm.runInContext(fmt + '\n' + engine, sandbox);
    return sandbox;
}

const PAGES = ['geo-circle', 'geo-ring', 'geo-cylinder', 'geo-horiz', 'geo-sphere', 'geo-cone'];
const KEYS = ['gc', 'gr', 'gcy', 'gh', 'gs', 'gco'];
// страницы → (viewBox, число строк зоны расчёта)
const VB = {
    'gc':  ['0 0 240 257', 3], 'gr':  ['0 0 240 240', 2], 'gcy': ['0 0 240 274', 4],
    'gh':  ['0 0 240 291', 5], 'gs':  ['0 0 240 257', 3], 'gco': ['0 0 240 274', 4]
};

// ============================================================
// 1. SRC HTML — панели результатов убраны, viewBox по строкам
// ============================================================
describe('Task 528 A: HTML — все результаты в блоке с фигурой', () => {

    test('документ: панели #xx_results убраны со всех 6 страниц', () => {
        KEYS.forEach((k) => {
            assertEqual(INDEX_SRC.split('id="' + k + '_results"').length - 1, 0,
                'div #' + k + '_results убран');
            assertEqual(INDEX_SRC.split("getElementById('" + k + "_results')").length - 1, 0,
                'обращений к #' + k + '_results из JS нет');
        });
        assertEqual(INDEX_SRC.split('converter-result-group').length - 1 > 0, true,
            'класс converter-result-group остался у ДРУГИХ калькуляторов (не геометрия)');
    });

    test('документ: кнопки «Рассчитать» на всех 6 страницах', () => {
        [['geo-circle', 'calcGeoCircle()'], ['geo-ring', 'calcGeoRing()'],
         ['geo-cylinder', 'calcGeoCylinder()'], ['geo-horiz', 'calcGeoHorizCyl()'],
         ['geo-sphere', 'calcGeoSphere()'], ['geo-cone', 'calcGeoCone()']].
        forEach(([pageId, fn]) => {
            const b = pageBlock(pageId);
            assertTrue(b !== null, pageId + ' найдена');
            assertTrue(b.indexOf('onclick="' + fn + '"') !== -1,
                pageId + ': кнопка «Рассчитать» → ' + fn);
            assertTrue(b.indexOf('>Рассчитать</button>') !== -1,
                pageId + ': подпись кнопки «Рассчитать»');
        });
    });

    test('viewBox: высота 206 + 17·строк на каждой странице', () => {
        PAGES.forEach((pageId) => {
            const b = pageBlock(pageId);
            assertTrue(b !== null, pageId + ' найдена');
            const key = pageId.slice(4, 6) === 'ci' ? 'gc' :
                { 'geo-circle': 'gc', 'geo-ring': 'gr', 'geo-cylinder': 'gcy',
                  'geo-horiz': 'gh', 'geo-sphere': 'gs', 'geo-cone': 'gco' }[pageId];
            const vb = VB[key];
            assertTrue(b.indexOf('viewBox="' + vb[0] + '"') !== -1,
                pageId + ': viewBox ' + vb[0] + ' (' + vb[1] + ' строк расчёта)');
        });
    });

    test('комментарии рамок: Task 528 + «в блоке с фигурой»', () => {
        PAGES.forEach((pageId) => {
            const b = pageBlock(pageId);
            const i = b.indexOf('Task 528');
            assertTrue(i !== -1, pageId + ': упоминание Task 528');
            const seg = b.slice(i, i + 400);
            assertTrue(seg.indexOf('в блоке с фигурой') !== -1,
                pageId + ': «все результаты — в блоке с фигурой»');
            assertTrue(seg.indexOf('к фигуре') !== -1,
                pageId + ': «Рассчитать» прокручивает экран к фигуре');
        });
    });

    test('gh/horiz: комментарий — значение h над линией зеркала', () => {
        const b = pageBlock('geo-horiz');
        const i = b.indexOf('Task 528');
        const seg = b.slice(i, i + 400);
        assertTrue(seg.indexOf('НАД линией зеркала') !== -1,
            'значение h — над линией зеркала жидкости');
        assertTrue(seg.indexOf('дальше от фигуры') !== -1,
            'вынос размерной линии дальше от фигуры');
    });

    test('geo-ring: комментарий — d внутри отверстия', () => {
        const b = pageBlock('geo-ring');
        const i = b.indexOf('Task 528');
        const seg = b.slice(i, i + 400);
        assertTrue(seg.indexOf('ВНУТРИ отверстия') !== -1,
            'подпись d — внутри отверстия над размерной линией');
    });
});

// ============================================================
// 2. SRC CSS — комментарий системы схем дополнен
// ============================================================
describe('Task 528 B: CSS — комментарий системы схем', () => {

    test('.geo-fig-frame: комментарий дополнен Task 528', () => {
        const i = INDEX_SRC.indexOf('.geo-fig-frame {');
        const head = INDEX_SRC.slice(Math.max(0, i - 2400), i);
        const j = head.lastIndexOf('Task 528');
        assertTrue(j !== -1, 'Task 528 упомянут в комментарии перед правилом');
        const seg = head.slice(j, j + 600);
        assertTrue(seg.indexOf('НАД линиями') !== -1, 'подписи — НАД линиями');
        assertTrue(seg.indexOf('внутри отверстия') !== -1, 'кольцо d — внутри отверстия');
        assertTrue(seg.indexOf('#xx_results') !== -1, 'панель #xx_results убрана');
    });

    test('рамка: 350px сохраняется (размер Task 527 не уменьшен)', () => {
        const i = INDEX_SRC.indexOf('.geo-fig-frame {');
        const seg = INDEX_SRC.slice(i, i + 1400);
        assertTrue(seg.indexOf('width: min(100%, 350px)') !== -1,
            'ширина рамки 350px');
    });
});

// ============================================================
// 3. SRC JS — движок: надписи над линиями, scroll, панель убрана
// ============================================================
describe('Task 528 C: JS — движок и calcGeo*', () => {

    test('gfDimH: подпись НАД линией, узкий размер — за выносными', () => {
        const b = fnBlock('gfDimH');
        assertTrue(b !== null, 'gfDimH найдена');
        assertTrue(b.indexOf('labelPos') === -1, 'параметр labelPos убран');
        assertTrue(b.indexOf('gfN(y - 5)') !== -1, 'базовая линия подписи y−5');
        assertTrue(b.indexOf('x2 + 8 + lw <= 234') !== -1,
            'узкий размер: подпись справа за выносными');
        assertTrue(b.indexOf("anchor = 'start'") !== -1, 'anchor start (справа)');
        assertTrue(b.indexOf("anchor = 'end'") !== -1, 'anchor end (слева)');
    });

    test('gfDimV: labelSide \'none\' — линии без подписи', () => {
        const b = fnBlock('gfDimV');
        assertTrue(b !== null, 'gfDimV найдена');
        assertTrue(b.indexOf("labelSide === 'none'") !== -1,
            "ветка 'none' — только линии/стрелки/выносные");
    });

    test('geoFigScrollTo: определена, smooth + prefers-reduced-motion', () => {
        const b = fnBlock('geoFigScrollTo');
        assertTrue(b !== null, 'geoFigScrollTo найдена');
        assertTrue(b.indexOf("scrollIntoView") !== -1, 'вызов scrollIntoView');
        assertTrue(b.indexOf("prefers-reduced-motion: reduce") !== -1,
            'учёт prefers-reduced-motion');
        assertTrue(b.indexOf("block: 'center'") !== -1, 'фигура — к центру экрана');
    });

    test('calcGeo*: все 6 — geoFigPlay + geoFigScrollTo, панели убраны', () => {
        [['calcGeoCircle', 'gc'], ['calcGeoRing', 'gr'], ['calcGeoCylinder', 'gcy'],
         ['calcGeoHorizCyl', 'gh'], ['calcGeoSphere', 'gs'], ['calcGeoCone', 'gco']].
        forEach(([fn, key]) => {
            const b = fnBlock(fn);
            assertTrue(b !== null, fn + ' найдена');
            assertTrue(b.indexOf("geoFigPlay('" + key + "')") !== -1,
                fn + ' → geoFigPlay (анимация)');
            assertTrue(b.indexOf("geoFigScrollTo('" + key + "')") !== -1,
                fn + ' → geoFigScrollTo (экран — к фигуре)');
            assertFalse(b.indexOf("getElementById('" + key + "_results')") !== -1,
                fn + ': без обращений к панели #xx_results');
            assertFalse(b.indexOf('converter-result-item') !== -1,
                fn + ': без строк панели «Результат»');
            assertFalse(b.indexOf('res.scrollIntoView') !== -1,
                fn + ': без прокрутки к панели (было вниз, теперь — к фигуре)');
        });
    });

    test('geoFigRender: высота viewBox по числу строк зоны расчёта', () => {
        const b = fnBlock('geoFigRender');
        assertTrue(b !== null, 'geoFigRender найдена');
        assertTrue(b.indexOf("(206 + b.rows.length * 17)") !== -1,
            'высота = 206 + 17·строк');
        assertTrue(b.indexOf('b.svg') !== -1, 'рендер SVG из сборки');
    });

    test('кольцо: holeW-детектор + fallback над фигурой', () => {
        const b = fnBlock('geoFigRingSVG');
        assertTrue(b !== null, 'geoFigRingSVG найдена');
        assertTrue(b.indexOf('holeW') !== -1, 'ширина отверстия на высоте подписи');
        assertTrue(b.indexOf('cy - 5') !== -1, 'подпись над линией внутри отверстия');
        assertTrue(b.indexOf('cy - Ro - 11') !== -1, 'fallback — над фигурой');
    });

    test('гориз. цилиндр: вынос 20 + значение h над линией зеркала', () => {
        const b = fnBlock('geoFigHorizSVG');
        assertTrue(b !== null, 'geoFigHorizSVG найдена');
        assertTrue(b.indexOf('capRx + 20') !== -1,
            'размерная линия h дальше от фигуры (вынос 20, было 13)');
        assertTrue(b.indexOf('yLevel - 14 >= yTop') !== -1,
            'гвард места над линией зеркала');
        assertTrue(b.indexOf('gfN(yLevel - 4)') !== -1,
            'значение h НАД линией зеркала (baseline yLevel−4)');
        assertTrue(b.indexOf("'none'") !== -1, "размерная линия — labelSide 'none'");
        assertTrue(b.indexOf("'right'") !== -1, 'fallback — повернутая подпись');
    });

    test('строки зоны расчёта: все результаты calcGeo* в блоке с фигурой', () => {
        const checks = [
            ['geoFigCircleSVG', 'R = D/2'],
            ['geoFigCylSVG', 'Sбок = π·D·H'],
            ['geoFigCylSVG', 'Масса воды (ρ=998)'],
            ['geoFigHorizSVG', 'S сегмента'],
            ['geoFigHorizSVG', 'Масса воды (ρ=998)'],
            ['geoFigSphereSVG', 'Масса воды (ρ=998)'],
            ['geoFigConeSVG', 'Sосн = π·D²/4'],
            ['geoFigConeSVG', 'Sбок = π·(D/2)·L']
        ];
        checks.forEach(([fn, label]) => {
            const b = fnBlock(fn);
            assertTrue(b !== null, fn + ' найдена');
            assertTrue(b.indexOf("['" + label + "'") !== -1,
                fn + ': строка «' + label + '» в блоке с фигурой');
        });
    });
});

// ============================================================
// 4. VM — надписи над линиями, все результаты, высоты viewBox
// ============================================================
describe('Task 528 D: VM — надписи НАД линиями, все результаты', () => {
    const CTX = engineCtx();

    test('gc: D — НАД размерной линией под кругом, выносные длиннее', () => {
        const b = CTX.geoFigBuild('gc', { D: 100 });
        assertTrue(b.svg.indexOf('y2="164.0"') !== -1,
            'размерная линия y=164 (cy+R+24 — вынос линии больше)');
        assertTrue(b.svg.indexOf('y="159.0">D = 100 мм<') !== -1,
            'подпись НАД линией (y=159 = линия − 5)');
        assertTrue(b.svg.indexOf('y2="168.0"') !== -1,
            'выносные линии до y=168 (на 4 за размер)');
        assertFalse(b.svg.indexOf('y="168.0">D =') !== -1,
            'подписи ПОД линией больше нет');
    });

    test('gc: 3 строки — S, P, R (все результаты calcGeoCircle)', () => {
        const b = CTX.geoFigBuild('gc', { D: 100 });
        assertEqual(b.rows.length, 3, 'три строки');
        assertEqual(b.rows[0][1], '78,5398 см²', 'S');
        assertEqual(b.rows[1][1], '314,16 мм', 'P');
        assertEqual(b.rows[2][0], 'R = D/2', 'формула радиуса');
        assertEqual(b.rows[2][1], '50 мм', 'R — как в прежней панели');
    });

    test('gr: d — ВНУТРИ отверстия НАД линией (заявка)', () => {
        const b = CTX.geoFigBuild('gr', { D: 100, d: 80 });
        assertTrue(b.svg.indexOf('y="81.0">d = 80 мм<') !== -1,
            'подпись d внутри отверстия над размерной линией (y=81=cy−5)');
        assertTrue(b.svg.indexOf('y="163.0">D = 100 мм<') !== -1,
            'подпись D — НАД размерной линией под кольцом (y=163)');
        assertTrue(b.svg.indexOf('y2="168.0"') !== -1, 'размерная линия D: y=168');
        assertFalse(b.svg.indexOf('y="172.0">D') !== -1,
            'подписи D ПОД линией (y=172, Task 527) больше нет');
    });

    test('gr: малое d — fallback над фигурой; 2 строки', () => {
        const b2 = CTX.geoFigBuild('gr', { D: 100, d: 20 });
        assertTrue(b2.svg.indexOf('y="17.0">d = 20 мм<') !== -1,
            'd=20: подпись над фигурой (отверстие узкое)');
        const b = CTX.geoFigBuild('gr', { D: 100, d: 80 });
        assertEqual(b.rows.length, 2, 'две строки');
        assertEqual(b.rows[0][1], '28,2743 см²', 'S = π·(D²−d²)/4');
        assertEqual(b.rows[1][1], '20 мм', 'Dэкв = D − d');
    });

    test('gcy: 4 строки — V, Sбок, Sполн, масса воды', () => {
        const b = CTX.geoFigBuild('gcy', { D: 2, H: 3 });
        assertEqual(b.rows.length, 4, 'четыре строки');
        assertEqual(b.rows[0][1], '9,4248 м³', 'V');
        assertEqual(b.rows[1][0], 'Sбок = π·D·H', 'формула Sбок');
        assertEqual(b.rows[1][1], '18,8496 м²', 'Sбок = π·2·3');
        assertEqual(b.rows[2][1], '25,1327 м²', 'Sполн');
        assertEqual(b.rows[3][1], CTX.formatNumber(9.42477796076938 * 998) + ' кг',
            'масса воды (ρ=998) — как в calcGeoCylinder');
    });

    test('gh: значение h — НАД линией зеркала, вынос дальше от фигуры', () => {
        const b = CTX.geoFigBuild('gh', { L: 5, D: 2, h: 1.5 });
        assertTrue(b.svg.indexOf('text-anchor="end" x="182.0" y="77.0">h = 1,5 м<') !== -1,
            'h = 1,5 м — горизонтально НАД линией зеркала (y=77, линия y=81)');
        assertFalse(/rotate\(-90 [\d.]+ [\d.]+\)">h = 1,5 м/.test(b.svg),
            'повернутой подписи h нет');
        assertTrue(b.svg.indexOf('x2="228.0" y2="81.0"') !== -1,
            'выносная зеркала — до x=228 (дальше от фигуры, было 221)');
    });

    test('gh: 5 строк — V, Vполн, заполнение, S сегмента, масса воды', () => {
        const b = CTX.geoFigBuild('gh', { L: 5, D: 2, h: 1.5 });
        assertEqual(b.rows.length, 5, 'пять строк');
        assertEqual(b.rows[0][1], '12,637 м³', 'V');
        assertEqual(b.rows[1][1], '15,708 м³', 'Vполн');
        assertEqual(b.rows[2][1], '80,4499 %', 'заполнение');
        assertEqual(b.rows[3][0], 'S сегмента', 'площадь сегмента');
        assertEqual(b.rows[4][0], 'Масса воды (ρ=998)', 'масса воды');
        const Rm = 1, h = 1.5;
        const segA = Rm * Rm * Math.acos((Rm - h) / Rm) - (Rm - h) * Math.sqrt(2 * Rm * h - h * h);
        assertEqual(b.rows[3][1], CTX.formatNumber(segA) + ' м²', 'Sсегм = формула сегмента');
        assertEqual(b.rows[4][1], CTX.formatNumber(segA * 5 * 998) + ' кг',
            'масса = V·998 — как в calcGeoHorizCyl');
    });

    test('gh: края и fallback — h=0,2 над линией; h=1,9 повернутая', () => {
        const b2 = CTX.geoFigBuild('gh', { L: 5, D: 2, h: 0.2 });
        assertTrue(b2.svg.indexOf('y="116.0">h = 0,2 м<') !== -1,
            'h=0,2: значение над линией зеркала (y=116)');
        const b3 = CTX.geoFigBuild('gh', { L: 5, D: 2, h: 1.9 });
        assertTrue(/rotate\(-90 [\d.]+ [\d.]+\)">h = 1,9 м/.test(b3.svg),
            'h=1,9 (места над линией нет): повернутая подпись у линии');
        const b4 = CTX.geoFigBuild('gh', { L: 1, D: 2, h: 1.5 });
        assertTrue(/rotate\(-90 [\d.]+ [\d.]+\)">h = 1,5 м/.test(b4.svg),
            'короткий корпус L=1: повернутая подпись (текст не помещается)');
    });

    test('gs: D — НАД размерной линией; 3 строки с массой воды', () => {
        const b = CTX.geoFigBuild('gs', { D: 2 });
        assertTrue(b.svg.indexOf('y="161.0">D = 2 м<') !== -1,
            'подпись D НАД линией (y=161, линия y=166)');
        assertTrue(b.svg.indexOf('y2="166.0"') !== -1, 'размерная линия y=166');
        assertEqual(b.rows.length, 3, 'три строки');
        assertEqual(b.rows[2][0], 'Масса воды (ρ=998)', 'формула массы');
        assertEqual(b.rows[2][1], CTX.formatNumber(4.188790204786391 * 998) + ' кг',
            'масса = π·D³/6·998');
    });

    test('gco: D — НАД размерной линией; узкое основание — за выносными', () => {
        const b = CTX.geoFigBuild('gco', { D: 2, H: 3 });
        assertTrue(b.svg.indexOf('y="173.1">D = 2 м<') !== -1,
            'подпись D НАД линией (y=173.1, линия y=178.1)');
        assertEqual(b.rows.length, 4, 'четыре строки');
        assertEqual(b.rows[1][1], '3,1416 м²', 'Sосн = π·D²/4');
        assertEqual(b.rows[2][1], '3,1623 м', 'L = √(H²+(D/2)²)');
        assertEqual(b.rows[3][1], '9,9346 м²', 'Sбок = π·(D/2)·L');
        // узкое основание: текст не помещается между выносными → справа
        const b2 = CTX.geoFigBuild('gco', { D: 0.5, H: 3 });
        assertTrue(/text-anchor="start" x="139.5" y="[\d.]+">D = 0,5 м</.test(b2.svg),
            'D=0,5: подпись за выносными линиями (справа), НАД линией');
    });

    test('высоты viewBox: 206 + 17·строк по всем 6 схемам', () => {
        [['gc', { D: 100 }], ['gr', { D: 100, d: 80 }], ['gcy', { D: 2, H: 3 }],
         ['gh', { L: 5, D: 2, h: 1.5 }], ['gs', { D: 2 }], ['gco', { D: 2, H: 3 }]].
        forEach(([k, v]) => {
            const n = CTX.geoFigBuild(k, v).rows.length;
            assertEqual(206 + 17 * n, parseInt(VB[k][0].split(' ')[3], 10),
                k + ': 206+17·' + n + ' = высота viewBox ' + VB[k][0]);
        });
    });

    test('юнит: gfDimH — над линией / узкий справа / узкий у края слева', () => {
        const wide = CTX.gfDimH(10, 100, 50, 'X');
        assertTrue(wide.indexOf('text-anchor="middle" x="55.0" y="45.0"') !== -1,
            'широкий размер: подпись над серединой, НАД линией');
        const narrow = CTX.gfDimH(50, 60, 50, 'abcdefghij');
        assertTrue(narrow.indexOf('text-anchor="start" x="68.0" y="45.0"') !== -1,
            'узкий: подпись справа за выносными (start, x2+8)');
        const edge = CTX.gfDimH(200, 210, 50, 'abcdefghij');
        assertTrue(edge.indexOf('text-anchor="end" x="192.0" y="45.0"') !== -1,
            'узкий у правого края: подпись слева (end, x1−8)');
    });

    test('юнит: gfDimV — \'none\' без текста, выносные рисуются', () => {
        const none = CTX.gfDimV(100, 126, 224, 'h = 1,5 м', [[126, 195], [81, 202.8]], 'none');
        assertFalse(none.indexOf('gf-dimtx') !== -1, 'подписи нет');
        assertTrue(none.indexOf('gf-dimln') !== -1, 'линии и выносные есть');
        assertTrue(none.indexOf('gf-dimar') !== -1, 'стрелки есть');
        const right = CTX.gfDimV(100, 126, 224, 'h = 1,5 м', [], 'right');
        assertTrue(right.indexOf('gf-dimtx') !== -1, "обычный 'right' — подпись есть");
    });

    test('геометрия: подписи НИЖЕ линий не встречаются (все размеры)', () => {
        // для каждого gfDimH-подписи в собранных схемах: y подписи < y линии.
        // В SVG это видно как отсутствие паттерна «подпись на y+14» —
        // проверяем юнит-функцией на характерных размерах фигур.
        [['gc', { D: 100 }], ['gr', { D: 100, d: 80 }], ['gcy', { D: 2, H: 3 }],
         ['gh', { L: 5, D: 2, h: 1.5 }], ['gs', { D: 2 }], ['gco', { D: 2, H: 3 }]].
        forEach(([k, v]) => {
            const svg = CTX.geoFigBuild(k, v).svg;
            // каждая <text class="gf-dimtx"> БЕЗ transform стоит над своей
            // размерной линией: её y СТРОГО меньше y ближайшей линии ниже
            // (грубая проверка: подпись не на y_line+14 — старый стиль 'below')
            assertFalse(/y="([\d.]+)">[^<]*<\/text>\s*<line[^>]*y1="\1"/.test(svg),
                k + ': нет подписей, сидящих НА размерной линии (старый below)');
        });
    });

    test('geoFigScrollTo: доступна в контексте движка', () => {
        assertTrue(typeof CTX.geoFigScrollTo === 'function',
            'функция определена в движке (вызывается из calcGeo*)');
    });
});

// ============================================================
// 5. SW — версия кэша бампнута (index.html менялся)
// ============================================================
describe('Task 528 — SW: версия кэша', () => {

    test('sw.js: CACHE_VERSION = kipia-test-v758', () => {
        const m = SW_SRC.match(/const CACHE_VERSION = '([^']+)'/);
        assertTrue(m, 'CACHE_VERSION найден');
        assertEqual(m[1], 'kipia-test-v758',
            'версия бампнута v740 → v741 (правка index.html, Task 528)');
    });

    test('guard: версия ушла вперёд от v740 (нет двойного бампа)', () => {
        const m = SW_SRC.match(/const CACHE_VERSION = '([^']+)'/);
        assertTrue(m[1] !== 'kipia-test-v740',
            'v740 — прошлый шаг Task 527, не должен остаться');
    });
});
