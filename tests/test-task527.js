// tests/test-task527.js
// Task 527: «В разделе Главная / Инженерные калькуляторы / Геометрия,
//   на некоторых геометрических фигурах линии и цифры пересекаются и
//   накладываются друг на друга, поправь, и расчётные данные должны
//   отображаться на картинке под геометрической фигурой, поэтому блок
//   с фигурой сделай немного больше.»
//
// ЧТО ПРОВЕРЯЕТСЯ (пятью слоями):
//   Слой 1 — SRC HTML: HTML-блоки #xxFigRes удалены со всех 6 страниц
//     (данные — теперь ВНУТРИ картинки), viewBox вырос: 240×240 на
//     5 страницах (2 строки расчёта), 240×257 на гориз. цилиндре
//     (3 строки); Task 527 упомянут в комментариях всех 6 рамок.
//   Слой 2 — SRC CSS: рамка 350px («блок немного больше»); классы
//     .gf-sep (разделитель) / .gf-val (значения); CSS .geo-fig-res*
//     удалён; анимация и prefers-reduced-motion — на .gf-resg.
//   Слой 3 — SRC JS: gfDataZone (зона расчёта в картинке: разделитель
//     y=194, строки с y=212 шагом 17, .gf-tx/.gf-val, .gf-resg);
//     geoFigBuild добавляет зону; geoFigRender — без resEl; gfDimH —
//     параметр labelPos ('below'); gfDimV — отступ 9, вынос подписи
//     при коротком размере; подписи выведены из фигур: круг/сфера —
//     D ПОД фигурой, кольцо — D под + d НАД фигурой, конус — L у
//     ЛЕВОГО ребра.
//   Слой 4 — VM: данные расчёта — в SVG под фигурой (совпадают с
//     calcGeo*); подпись h/D больше не пересекает выносные линии
//     (вынесена за пределы размера); юнит-тесты gfDimH/gfDimV.
//   Слой 5 — SW: kipia-test-v740.
//
// Запуск: через tests/run-all.js (require './test-task527.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ============================================================
// Утилиты (как в test-task526.js)
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
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(fmt + '\n' + engine, sandbox);
    return sandbox;
}

const PAGES = ['geo-circle', 'geo-ring', 'geo-cylinder', 'geo-horiz', 'geo-sphere', 'geo-cone'];

// ============================================================
// 1. SRC HTML — блоки расчёта убраны, viewBox вырос
// ============================================================
describe('Task 527 A: HTML — данные уходят в картинку', () => {

    test('документ: HTML-блоки #xxFigRes — 0 вхождений', () => {
        // в комментариях документации упоминание убранного блока допустимо —
        // проверяем именно РАЗМЕТКУ и ОБРАЩЕНИЯ из JS
        ['gcFigRes', 'grFigRes', 'gcyFigRes', 'ghFigRes', 'gsFigRes', 'gcoFigRes'].
        forEach((id) => {
            assertEqual(INDEX_SRC.split('id="' + id + '"').length - 1, 0,
                'div #' + id + ' убран');
        });
        assertEqual(INDEX_SRC.split("+ 'FigRes'").length - 1, 0,
            "обращений key + 'FigRes' из JS нет");
        assertEqual(INDEX_SRC.split('class="geo-fig-res"').length - 1, 0,
            'класс geo-fig-res не используется в разметке');
    });

    test('viewBox: 240×240 на 5 страницах, 240×257 на гориз. цилиндре', () => {
        assertEqual(INDEX_SRC.split('viewBox="0 0 240 240"').length - 1, 5,
            '5 рамок с двумя строками расчёта');
        assertEqual(INDEX_SRC.split('viewBox="0 0 240 257"').length - 1, 1,
            'гориз. цилиндр — 3 строки расчёта (240×257)');
        assertEqual(INDEX_SRC.split('viewBox="0 0 240 190"').length - 1, 0,
            'старый viewBox 240×190 не остался');
    });

    PAGES.forEach((pageId) => {
        test(pageId + ': комментарий рамки дополнен Task 527', () => {
            const b = pageBlock(pageId);
            assertTrue(b !== null, 'страница найдена');
            const i = b.indexOf('Task 527');
            assertTrue(i !== -1, 'упоминание Task 527 в комментарии рамки');
            const seg = b.slice(i, i + 400);
            assertTrue(seg.indexOf('в картинке ПОД фигурой') !== -1,
                'описание: данные в картинке под фигурой');
            assertTrue(seg.indexOf('350px') !== -1, 'описание: рамка увеличена');
        });
    });
});

// ============================================================
// 2. SRC CSS — классы зоны расчёта, рамка больше
// ============================================================
describe('Task 527 B: CSS — зона расчёта в картинке', () => {

    test('.geo-fig-frame: ширина 350px — блок немного больше', () => {
        const i = INDEX_SRC.indexOf('.geo-fig-frame {');
        const seg = INDEX_SRC.slice(i, i + 1400);
        assertTrue(seg.indexOf('width: min(100%, 350px)') !== -1,
            '350px (было 320px — «сделай немного больше»)');
    });

    test('классы SVG-зоны: .gf-sep (разделитель) и .gf-val (значения)', () => {
        assertTrue(INDEX_SRC.indexOf('.geo-fig-svg .gf-sep') !== -1,
            '.gf-sep — разделитель зоны расчёта');
        assertTrue(INDEX_SRC.indexOf('.geo-fig-svg .gf-val') !== -1,
            '.gf-val — значения живого расчёта');
        assertTrue(INDEX_SRC.indexOf('.geo-fig-svg .gf-val   { fill: var(--gf-val); }') !== -1,
            'значения цветом результата');
    });

    test('CSS .geo-fig-res* удалён (HTML-блок заменён SVG-группой)', () => {
        assertFalse(INDEX_SRC.indexOf('.geo-fig-res {') !== -1, '.geo-fig-res удалён');
        assertFalse(INDEX_SRC.indexOf('.geo-fig-res-row') !== -1, '.geo-fig-res-row удалён');
        assertFalse(INDEX_SRC.indexOf('.geo-fig-res-f') !== -1, '.geo-fig-res-f удалён');
        assertFalse(INDEX_SRC.indexOf('.geo-fig-res-v') !== -1, '.geo-fig-res-v удалён');
    });

    test('анимация: зона расчёта — .gf-resg (+ reduced-motion)', () => {
        assertTrue(INDEX_SRC.indexOf(
            '.geo-fig-frame:not(.geo-static) .gf-resg { opacity: 0; animation: gf-res 0.45s ease-out forwards; }'
        ) !== -1, 'гвард анимации SVG-группы зоны расчёта');
        const i = INDEX_SRC.indexOf('@media (prefers-reduced-motion: reduce)');
        const seg = INDEX_SRC.slice(i, i + 600);
        assertTrue(seg.indexOf('.gf-resg') !== -1,
            'prefers-reduced-motion гасит и зону расчёта в картинке');
    });
});

// ============================================================
// 3. SRC JS — движок: зона расчёта + исправление пересечений
// ============================================================
describe('Task 527 C: JS — движок', () => {

    test('gfDataZone: функция определена и вызывается из geoFigBuild', () => {
        assertTrue(INDEX_SRC.indexOf('function gfDataZone(') !== -1,
            'function gfDataZone определена');
        const b = fnBlock('geoFigBuild');
        assertTrue(b !== null, 'geoFigBuild найдена');
        assertTrue(b.indexOf('b.svg += gfDataZone(b.rows);') !== -1,
            'зона расчёта добавляется к фигуре (в картинке)');
    });

    test('gfDataZone: разделитель y=194, строки с y=212 шагом 17', () => {
        const b = fnBlock('gfDataZone');
        assertTrue(b !== null, 'gfDataZone найдена');
        assertTrue(b.indexOf('x1="10" y1="194" x2="230" y2="194"') !== -1,
            'разделитель под фигурой (y=194)');
        assertTrue(b.indexOf('const y = 212 + i * 17;') !== -1,
            'строки расчёта с y=212, шаг 17');
        assertTrue(b.indexOf('class="gf-resg"') !== -1, 'группа .gf-resg (анимация)');
        assertTrue(b.indexOf('class="gf-sep"') !== -1, 'разделитель .gf-sep');
        assertTrue(b.indexOf('class="gf-tx"') !== -1, 'формулы .gf-tx');
        assertTrue(b.indexOf('class="gf-val"') !== -1, 'значения .gf-val');
        assertTrue(b.indexOf('text-anchor="end" x="228"') !== -1,
            'значения прижаты вправо (колонка результата)');
    });

    test('geoFigRender: без HTML-блока — только SVG', () => {
        const b = fnBlock('geoFigRender');
        assertTrue(b !== null, 'geoFigRender найдена');
        assertFalse(b.indexOf('resEl') !== -1, 'resEl убран');
        assertFalse(b.indexOf('FigRes') !== -1, 'обращений к #xxFigRes нет');
        assertTrue(b.indexOf("svgEl.innerHTML = geoFigBuild(key, v).svg;") !== -1,
            'фигура + зона расчёта — одним SVG');
    });

    test('gfDimH: параметр labelPos — подпись ПОД линией для размеров под фигурой', () => {
        const b = fnBlock('gfDimH');
        assertTrue(b !== null, 'gfDimH найдена');
        assertTrue(b.indexOf('labelPos') !== -1, 'параметр labelPos');
        assertTrue(b.indexOf("? y + 14 : y - 5") !== -1,
            "позиция подписи: 'below' → y+14, иначе y−5");
    });

    test('gfDimV: отступ 9 + вынос подписи при коротком размере', () => {
        const b = fnBlock('gfDimV');
        assertTrue(b !== null, 'gfDimV найдена');
        assertTrue(b.indexOf('? x + 9 : x - 9') !== -1,
            'отступ подписи от линии 9 (было 5 — глифы касались)');
        assertTrue(b.indexOf('llen + 10') !== -1, 'детектор короткого размера');
        assertTrue(b.indexOf('bot + llen / 2 + 8') !== -1, 'вынос подписи вниз');
        assertTrue(b.indexOf('top - llen / 2 - 8') !== -1, 'вынос подписи вверх');
    });

    test('круг/сфера/кольцо: D — размер ПОД фигурой (gfDimH …, \'below\')', () => {
        [['geoFigCircleSVG', 'cy + R + 14'], ['geoFigSphereSVG', 'cy + R + 14'],
         ['geoFigRingSVG', 'cy + Ro + 14']].forEach(([fn, coord]) => {
            const b = fnBlock(fn);
            assertTrue(b !== null, fn + ' найдена');
            assertTrue(b.indexOf(coord) !== -1, fn + ': размерная линия под фигурой');
            assertTrue(b.indexOf("'below'") !== -1, fn + ": labelPos 'below'");
        });
    });

    test('кольцо: подпись d — НАД фигурой (вне отверстия)', () => {
        const b = fnBlock('geoFigRingSVG');
        assertTrue(b !== null, 'geoFigRingSVG найдена');
        assertTrue(b.indexOf('cy - Ro - 11') !== -1,
            'подпись d над кольцом (была внутри отверстия — пересекала линии при малом d)');
    });

    test('конус: подпись L — у ЛЕВОГО ребра (anchor end)', () => {
        const b = fnBlock('geoFigConeSVG');
        assertTrue(b !== null, 'geoFigConeSVG найдена');
        assertTrue(b.indexOf('const mx = cx - rx / 2') !== -1,
            'середина ЛЕВОГО ребра (было правого — подпись пересекала линию H)');
        assertTrue(b.indexOf('text-anchor="end"') !== -1, 'текст растёт влево от ребра');
        assertTrue(b.indexOf('gfN(mx - 7)') !== -1, 'отступ 7 от ребра');
    });
});

// ============================================================
// 4. VM — данные в картинке, подписи без пересечений
// ============================================================
describe('Task 527 D: VM — живой расчёт в картинке', () => {
    const CTX = engineCtx();

    test('gc: данные ВНУТРИ картинки под фигурой', () => {
        const b = CTX.geoFigBuild('gc', { D: 100 });
        assertTrue(b.svg.indexOf('gf-resg') !== -1, 'группа зоны расчёта');
        assertTrue(b.svg.indexOf('<line class="gf-sep" stroke-width="1" x1="10" y1="194" x2="230" y2="194"') !== -1,
            'разделитель под фигурой');
        assertTrue(b.svg.indexOf('>S = π·D²/4<') !== -1, 'формула S — в SVG');
        assertTrue(b.svg.indexOf('>78,5398 см²<') !== -1, 'значение S — в SVG (= calcGeoCircle)');
        assertTrue(b.svg.indexOf('>P = π·D<') !== -1, 'формула P — в SVG');
        assertTrue(b.svg.indexOf('>314,16 мм<') !== -1, 'значение P — в SVG');
        assertTrue(b.svg.indexOf('x="12" y="212"') !== -1, 'первая строка y=212');
        assertTrue(b.svg.indexOf('x="228" y="229"') !== -1, 'вторая строка y=229');
    });

    test('gc: подпись D — под кругом, не внутри', () => {
        const b = CTX.geoFigBuild('gc', { D: 100 });
        assertTrue(b.svg.indexOf('y="168.0">D = 100 мм<') !== -1,
            'подпись D на y=168 (под кругом: cy+R+28)');
        assertFalse(b.svg.indexOf('y="101.0"') !== -1,
            'старая позиция внутри круга (y=101) не используется');
    });

    test('gr: D под кольцом, d — над кольцом (вне отверстия)', () => {
        const b = CTX.geoFigBuild('gr', { D: 100, d: 80 });
        assertTrue(b.svg.indexOf('y="172.0">D = 100 мм<') !== -1, 'D под кольцом (y=172)');
        assertTrue(b.svg.indexOf('y="17.0">d = 80 мм<') !== -1, 'd над кольцом (y=17)');
        assertFalse(b.svg.indexOf('y="102.0">D') !== -1, 'D больше не в отверстии');
        assertFalse(b.svg.indexOf('y="75.0">d') !== -1, 'd больше не в отверстии');
        // малое отверстие: подпись d всё равно вне фигуры
        const b2 = CTX.geoFigBuild('gr', { D: 100, d: 20 });
        assertTrue(b2.svg.indexOf('y="17.0">d = 20 мм<') !== -1,
            'd=20: подпись над кольцом, не на теле кольца');
    });

    test('gs: подпись D — под сферой (меридиан не пересекает)', () => {
        const b = CTX.geoFigBuild('gs', { D: 2 });
        assertTrue(b.svg.indexOf('y="170.0">D = 2 м<') !== -1,
            'подпись D на y=170 — ниже окружности (низ y=142)');
        assertTrue(b.svg.indexOf('>4,1888 м³<') !== -1, 'V в картинке (= calcGeoSphere)');
        assertTrue(b.svg.indexOf('>12,5664 м²<') !== -1, 'S в картинке');
        // штриховой меридиан (rx=16.8 у x≈103..137) больше не встречает
        // подпись: текст начинается с y=162 (band 162..170)
        assertFalse(b.svg.indexOf('y="112.0"') !== -1, 'старая позиция y=112 не используется');
    });

    test('gco: L у левого ребра, D — под линией размера', () => {
        const b = CTX.geoFigBuild('gco', { D: 2, H: 3 });
        assertTrue(b.svg.indexOf('text-anchor="end" x="96.0"') !== -1,
            'L: anchor end, x=96 — у левого ребра (право края — 75)');
        assertTrue(b.svg.indexOf('>L = 3,1623 м<') !== -1, 'значение L');
        assertTrue(b.svg.indexOf('y="184.1">D = 2 м<') !== -1,
            'D: подпись ПОД размерной линией (y=184, линия y=170)');
        assertTrue(b.svg.indexOf('>3,1416 м³<') !== -1, 'V в картинке (= calcGeoCone)');
    });

    test('gh: 3 строки расчёта в картинке', () => {
        const b = CTX.geoFigBuild('gh', { L: 5, D: 2, h: 1.5 });
        assertTrue(b.svg.indexOf('y="212"') !== -1, 'строка 1 (y=212)');
        assertTrue(b.svg.indexOf('y="229"') !== -1, 'строка 2 (y=229)');
        assertTrue(b.svg.indexOf('y="246"') !== -1, 'строка 3 (y=246)');
        assertTrue(b.svg.indexOf('>12,637 м³<') !== -1, 'V в картинке');
        assertTrue(b.svg.indexOf('>15,708 м³<') !== -1, 'Vполн в картинке');
        assertTrue(b.svg.indexOf('>80,4499 %<') !== -1, 'заполнение в картинке');
    });

    test('gh: подпись h больше НЕ пересекает выносные линии', () => {
        // Прежде: span 45 < длины подписи ~61 → текст заходил на выносную
        // линию зеркала (y=81). Теперь подпись вынесена за пределы
        // размера (вверх, y≈42.7) — вне диапазона 81..126.
        const b = CTX.geoFigBuild('gh', { L: 5, D: 2, h: 1.5 });
        const m = b.svg.match(/rotate\(-90 [\d.]+ ([\d.]+)\)">h = 1,5 м/);
        assertTrue(m !== null, 'подпись h найдена в SVG');
        if (m) {
            const ly = parseFloat(m[1]);
            assertTrue(ly < 81 || ly > 126,
                'центр подписи вне выносных (y=' + m[1] + ', выносные 81 и 126)');
        }
        // короткий уровень h=0.2: подпись тоже вне выносных (120..126)
        const b2 = CTX.geoFigBuild('gh', { L: 5, D: 2, h: 0.2 });
        const m2 = b2.svg.match(/rotate\(-90 [\d.]+ ([\d.]+)\)">h = 0,2 м/);
        assertTrue(m2 !== null, 'подпись h=0,2 найдена');
        if (m2) {
            const ly2 = parseFloat(m2[1]);
            assertTrue(ly2 < 120 || ly2 > 132,
                'h=0,2: подпись вне выносных (y=' + m2[1] + ')');
        }
    });

    test('gcy: фигура не изменилась, расчёт — в картинке', () => {
        const b = CTX.geoFigBuild('gcy', { D: 2, H: 3 });
        assertTrue(b.svg.indexOf('height="116.0"') !== -1, 'пропорция H/D жива');
        assertTrue(b.svg.indexOf('>D = 2 м<') !== -1, 'подпись D');
        assertTrue(b.svg.indexOf('>H = 3 м<') !== -1, 'подпись H');
        assertTrue(b.svg.indexOf('>9,4248 м³<') !== -1, 'V в картинке');
        assertTrue(b.svg.indexOf('>25,1327 м²<') !== -1, 'Sполн в картинке');
    });

    test('юнит: gfDimH labelPos — below/above', () => {
        const below = CTX.gfDimH(10, 100, 50, 'X', [], 'below');
        assertTrue(below.indexOf('y="64.0"') !== -1, "labelPos 'below' → y+14");
        const above = CTX.gfDimH(10, 100, 50, 'X', []);
        assertTrue(above.indexOf('y="45.0"') !== -1, 'по умолчанию → y−5');
    });

    test('юнит: gfDimV — короткий размер выносит подпись', () => {
        // span 10 < len ~67 → подпись вниз за выносную: y = 110+67/2+8 = 151.5
        const short = CTX.gfDimV(100, 110, 200, 'abcdefghij', [], 'right');
        assertTrue(short.indexOf('y="151.5"') !== -1, 'короткий размер → подпись вне');
        // длинный размер: подпись у середины
        const long = CTX.gfDimV(0, 100, 50, 'D = 2 м', [], 'left');
        assertTrue(long.indexOf('y="50.0"') !== -1, 'длинный → середина (y=50)');
        // отступ от линии: lx = x−9 (left) / x+9 (right)
        assertTrue(long.indexOf('x="41.0"') !== -1, 'left: lx = x−9');
        assertTrue(short.indexOf('x="209.0"') !== -1, 'right: lx = x+9');
    });

    test('во всех схемах: зона расчёта в картинке + без старых маркеров', () => {
        [['gc', { D: 100 }], ['gr', { D: 100, d: 80 }], ['gcy', { D: 2, H: 3 }],
         ['gh', { L: 5, D: 2, h: 1.5 }], ['gs', { D: 2 }], ['gco', { D: 2, H: 3 }]].
        forEach(([k, v]) => {
            const svg = CTX.geoFigBuild(k, v).svg;
            assertTrue(svg.indexOf('gf-resg') !== -1, k + ': зона расчёта в картинке');
            assertTrue(svg.indexOf('gf-sep') !== -1, k + ': разделитель есть');
            assertTrue(svg.indexOf('geo-fig-res-row') === -1, k + ': без HTML-строк расчёта');
            assertTrue(svg.indexOf('marker') === -1, k + ': без SVG-маркеров');
        });
    });
});

// ============================================================
// 5. SW — версия кэша бампнута (index.html менялся)
// ============================================================
describe('Task 527 — SW: версия кэша', () => {

    test('sw.js: CACHE_VERSION = kipia-test-v740', () => {
        const m = SW_SRC.match(/const CACHE_VERSION = '([^']+)'/);
        assertTrue(m, 'CACHE_VERSION найден');
        assertEqual(m[1], 'kipia-test-v740',
            'версия бампнута v739 → v740 (правка index.html)');
    });

    test('guard: версия ушла вперёд от v739 (нет двойного бампа)', () => {
        const m = SW_SRC.match(/const CACHE_VERSION = '([^']+)'/);
        assertTrue(m[1] !== 'kipia-test-v739',
            'v739 — прошлый шаг Task 526, не должен остаться');
    });
});
