// tests/test-task527.js
// Task 527: «В разделе Главная / Инженерные калькуляторы / Геометрия,
//   на некоторых геометрических фигурах линии и цифры пересекаются и
//   накладываются друг на друга, поправь, и расчётные данные должны
//   отображаться на картинке под геометрической фигурой, поэтому блок
//   с фигурой сделай немного больше.»
//
// ЧТО ПРОВЕРЯЕТСЯ (пятью слоями):
//   Слой 1 — SRC HTML: HTML-блоки #xxFigRes удалены со всех 6 страниц
//     (данные — теперь ВНУТРИ картинки); Task 527 упомянут в
//     комментариях всех 6 рамок. Task 528 (адаптация): viewBox
//     206+17·строк — 240×240 (кольцо, 2), 240×257 (круг/сфера, 3),
//     240×274 (цилиндр/конус, 4), 240×291 (гориз. цилиндр, 5).
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
//   Слой 5 — SW: kipia-test-v749 (Task 528).
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

    test('viewBox: Task 528 — высота 206+17·строк (все результаты в блоке)', () => {
        assertEqual(INDEX_SRC.split('viewBox="0 0 240 240"').length - 1, 1,
            'кольцо — 2 строки расчёта (240×240)');
        assertEqual(INDEX_SRC.split('viewBox="0 0 240 257"').length - 1, 2,
            'круг и сфера — 3 строки расчёта (240×257)');
        assertEqual(INDEX_SRC.split('viewBox="0 0 240 274"').length - 1, 2,
            'цилиндр и конус — 4 строки расчёта (240×274)');
        assertEqual(INDEX_SRC.split('viewBox="0 0 240 291"').length - 1, 1,
            'гориз. цилиндр — 5 строк расчёта (240×291)');
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
        assertTrue(b.indexOf("svgEl.innerHTML = b.svg;") !== -1,
            'фигура + зона расчёта — одним SVG');
        assertTrue(b.indexOf("setAttribute('viewBox', '0 0 240 ' + (206 + b.rows.length * 17))") !== -1,
            'Task 528: высота viewBox — по числу строк зоны расчёта');
    });

    test('gfDimH: Task 528 — подпись ВСЕГДА НАД линией (labelPos убран)', () => {
        const b = fnBlock('gfDimH');
        assertTrue(b !== null, 'gfDimH найдена');
        assertTrue(b.indexOf('labelPos') === -1, 'параметр labelPos убран');
        assertTrue(b.indexOf('gfN(y - 5)') !== -1,
            'базовая линия подписи — над линией (y−5)');
        assertTrue(b.indexOf('x2 + 8 + lw <= 234') !== -1,
            'узкий размер — подпись за выносными линиями (справа)');
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

    test('круг/сфера/кольцо: D под фигурой, подпись НАД линией (Task 528)', () => {
        [['geoFigCircleSVG', 'cy + R + 24'], ['geoFigSphereSVG', 'cy + R + 24'],
         ['geoFigRingSVG', 'cy + Ro + 24']].forEach(([fn, coord]) => {
            const b = fnBlock(fn);
            assertTrue(b !== null, fn + ' найдена');
            assertTrue(b.indexOf(coord) !== -1,
                fn + ': размерная линия под фигурой, выносные длиннее (+24)');
            assertTrue(b.indexOf("'below'") === -1, fn + ": labelPos 'below' убран");
        });
    });

    test('кольцо: подпись d — ВНУТРИ отверстия над линией (Task 528)', () => {
        const b = fnBlock('geoFigRingSVG');
        assertTrue(b !== null, 'geoFigRingSVG найдена');
        assertTrue(b.indexOf('cy - 5') !== -1,
            'Task 528: подпись d внутри отверстия, НАД размерной линией');
        assertTrue(b.indexOf('holeW') !== -1, 'детектор ширины отверстия');
        assertTrue(b.indexOf('cy - Ro - 11') !== -1,
            'fallback при малом d — над кольцом (позиция Task 527)');
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

    test('gc: подпись D — НАД размерной линией под кругом (Task 528)', () => {
        const b = CTX.geoFigBuild('gc', { D: 100 });
        assertTrue(b.svg.indexOf('y2="164.0"') !== -1,
            'размерная линия на y=164 (cy+R+24, выносные длиннее)');
        assertTrue(b.svg.indexOf('y="159.0">D = 100 мм<') !== -1,
            'подпись D НАД линией (y=159 = 164−5)');
        assertFalse(b.svg.indexOf('y="168.0">D =') !== -1,
            'Task 527 подпись ПОД линией (y=168) не используется');
        assertFalse(b.svg.indexOf('y="101.0"') !== -1,
            'старая позиция внутри круга (y=101) не используется');
    });

    test('gr: D НАД линией под кольцом, d — ВНУТРИ отверстия (Task 528)', () => {
        const b = CTX.geoFigBuild('gr', { D: 100, d: 80 });
        assertTrue(b.svg.indexOf('y="163.0">D = 100 мм<') !== -1,
            'D НАД размерной линией (y=163, линия 168)');
        assertTrue(b.svg.indexOf('y="81.0">d = 80 мм<') !== -1,
            'Task 528: d внутри отверстия НАД размерной линией (y=81)');
        assertFalse(b.svg.indexOf('y="102.0">D') !== -1, 'D больше не в отверстии');
        // малое отверстие: подпись d вне фигуры (fallback Task 527)
        const b2 = CTX.geoFigBuild('gr', { D: 100, d: 20 });
        assertTrue(b2.svg.indexOf('y="17.0">d = 20 мм<') !== -1,
            'd=20: подпись над кольцом, не на теле кольца');
    });

    test('gs: подпись D — НАД размерной линией под сферой (Task 528)', () => {
        const b = CTX.geoFigBuild('gs', { D: 2 });
        assertTrue(b.svg.indexOf('y2="166.0"') !== -1,
            'размерная линия y=166 (низ окружности y=142)');
        assertTrue(b.svg.indexOf('y="161.0">D = 2 м<') !== -1,
            'подпись D НАД линией (y=161)');
        assertTrue(b.svg.indexOf('>4,1888 м³<') !== -1, 'V в картинке (= calcGeoSphere)');
        assertTrue(b.svg.indexOf('>12,5664 м²<') !== -1, 'S в картинке');
        assertFalse(b.svg.indexOf('y="112.0"') !== -1, 'старая позиция y=112 не используется');
    });

    test('gco: L у левого ребра, D — НАД линией размера (Task 528)', () => {
        const b = CTX.geoFigBuild('gco', { D: 2, H: 3 });
        assertTrue(b.svg.indexOf('text-anchor="end" x="96.0"') !== -1,
            'L: anchor end, x=96 — у левого ребра (право края — 75)');
        assertTrue(b.svg.indexOf('>L = 3,1623 м<') !== -1, 'значение L');
        assertTrue(b.svg.indexOf('y="173.1">D = 2 м<') !== -1,
            'D: подпись НАД размерной линией (y=173.1, линия 178.1)');
        assertTrue(b.svg.indexOf('>3,1416 м³<') !== -1, 'V в картинке (= calcGeoCone)');
    });

    test('gh: 5 строк расчёта в картинке (Task 528: все результаты)', () => {
        const b = CTX.geoFigBuild('gh', { L: 5, D: 2, h: 1.5 });
        assertTrue(b.svg.indexOf('y="212"') !== -1, 'строка 1 (y=212)');
        assertTrue(b.svg.indexOf('y="229"') !== -1, 'строка 2 (y=229)');
        assertTrue(b.svg.indexOf('y="246"') !== -1, 'строка 3 (y=246)');
        assertTrue(b.svg.indexOf('y="263"') !== -1, 'строка 4 (y=263, S сегмента)');
        assertTrue(b.svg.indexOf('y="280"') !== -1, 'строка 5 (y=280, масса воды)');
        assertTrue(b.svg.indexOf('>12,637 м³<') !== -1, 'V в картинке');
        assertTrue(b.svg.indexOf('>15,708 м³<') !== -1, 'Vполн в картинке');
        assertTrue(b.svg.indexOf('>80,4499 %<') !== -1, 'заполнение в картинке');
        assertTrue(b.svg.indexOf('>S сегмента<') !== -1, 'формула S сегмента');
        assertTrue(b.svg.indexOf('>Масса воды (ρ=998)<') !== -1, 'масса воды');
    });

    test('gh: значение h — НАД линией зеркала (Task 528)', () => {
        // Task 528 (заявка): «значения уровня жидкости так же можно
        // разместить над линией (сделать вынос линии немного дальше от
        // фигуры)» — горизонтальный текст НАД штриховой линией зеркала
        // (y=77 над линией y=81), размерная линия — без подписи,
        // выносная зеркала тянется дальше от фигуры (до x=228).
        const b = CTX.geoFigBuild('gh', { L: 5, D: 2, h: 1.5 });
        assertTrue(b.svg.indexOf('text-anchor="end" x="182.0" y="77.0">h = 1,5 м<') !== -1,
            'значение h НАД линией зеркала (y=77, у правого края корпуса)');
        assertFalse(/rotate\(-90 [\d.]+ [\d.]+\)">h = 1,5 м/.test(b.svg),
            'повернутой подписи h больше нет (значение — над линией)');
        assertTrue(b.svg.indexOf('x2="228.0" y2="81.0"') !== -1,
            'выносная зеркала дальше от фигуры (до x=228, было 221)');
        // короткий уровень h=0.2: значение тоже над линией зеркала
        const b2 = CTX.geoFigBuild('gh', { L: 5, D: 2, h: 0.2 });
        assertTrue(b2.svg.indexOf('y="116.0">h = 0,2 м<') !== -1,
            'h=0,2: значение над линией зеркала (y=116)');
        // высокий уровень h=1.9: над линией нет места — повернутая
        // подпись у размерной линии (fallback Task 527)
        const b3 = CTX.geoFigBuild('gh', { L: 5, D: 2, h: 1.9 });
        assertTrue(/rotate\(-90 [\d.]+ [\d.]+\)">h = 1,9 м/.test(b3.svg),
            'h=1,9: повернутая подпись (fallback)');
    });

    test('gcy: фигура не изменилась, расчёт — в картинке', () => {
        const b = CTX.geoFigBuild('gcy', { D: 2, H: 3 });
        assertTrue(b.svg.indexOf('height="116.0"') !== -1, 'пропорция H/D жива');
        assertTrue(b.svg.indexOf('>D = 2 м<') !== -1, 'подпись D');
        assertTrue(b.svg.indexOf('>H = 3 м<') !== -1, 'подпись H');
        assertTrue(b.svg.indexOf('>9,4248 м³<') !== -1, 'V в картинке');
        assertTrue(b.svg.indexOf('>25,1327 м²<') !== -1, 'Sполн в картинке');
    });

    test('юнит: gfDimH — подпись всегда над линией (Task 528)', () => {
        const above = CTX.gfDimH(10, 100, 50, 'X');
        assertTrue(above.indexOf('y="45.0"') !== -1, 'над линией → y−5');
        const narrow = CTX.gfDimH(50, 60, 50, 'abcdefghij');
        assertTrue(narrow.indexOf('text-anchor="start" x="68.0" y="45.0"') !== -1,
            'узкий размер — подпись справа за выносными (НАД линией)');
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

    test('sw.js: CACHE_VERSION = kipia-test-v749', () => {
        const m = SW_SRC.match(/const CACHE_VERSION = '([^']+)'/);
        assertTrue(m, 'CACHE_VERSION найден');
        assertEqual(m[1], 'kipia-test-v749',
            'версия бампнута v740 → v741 (правка index.html, Task 528)');
    });

    test('guard: версия ушла вперёд от v740 (нет двойного бампа)', () => {
        const m = SW_SRC.match(/const CACHE_VERSION = '([^']+)'/);
        assertTrue(m[1] !== 'kipia-test-v740',
            'v740 — прошлый шаг Task 527, не должен остаться');
    });
});
