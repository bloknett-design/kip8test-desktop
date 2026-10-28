// tests/test-task526.js
// Task 526: «В разделе Главная / Инженерные калькуляторы / Геометрия,
//   в расчётах геометрических фигур переделай пояснительные картинки,
//   сделай их анимированными с отображением реальных расчётов фигур,
//   и переделай их отображение немного больше и без погрешностей в
//   отображении линий и прочего, отобрази их в рамках с непрозрачным
//   фоном бежевого-бело-молочного цвета в светлой теме и на твой
//   выбор в тёмной теме.»
//
// ЧТО ПРОВЕРЯЕТСЯ (четырьмя слоями):
//   Слой 1 — SRC HTML: на всех 6 страницах геометрии статичные
//     .geo-svg-container заменены рамками .geo-fig-frame (id
//     gcFigFrame…gcoFigFrame) с пустым SVG (рендер — JS-движком);
//     старых классов/маркеров — 0; Task 527: viewBox 240×240
//     (гориз. цилиндр — 240×257), HTML-блоки #xxFigRes убраны
//     (данные — в картинке); oninput всех 11 полей звает
//     geoFigUpdate (живая перестройка при вводе).
//   Слой 2 — SRC CSS: .geo-fig-frame — НЕПРОЗРАЧНЫЙ фон: тёмная тема
//     #17222E (графитово-синий лист, выбор агента), светлая —
//     #F7F2E6 (бежево-бело-молочная бумага, по заявке); рамка
//     350px max (Task 527 — немного больше); keyframes gf-draw/
//     gf-fade/gf-dim/gf-res/gf-rise/gf-sweep + гварды
//     :not(.geo-static); prefers-reduced-motion.
//   Слой 3 — SRC JS: движок [Task 526 geo-fig engine] — карта
//     GEO_FIG_PAGES (6 страниц), gfArrow/gfDimH/gfDimV (точные
//     стрелки-треугольники — БЕЗ SVG-маркеров, источник прежних
//     «погрешностей отображения линий»), geoFigBuild/Render/Play/
//     Update; хук в navigateTo; все 6 calcGeo* зовут geoFigPlay.
//   Слой 4 — VM: чистая geoFigBuild + formatNumber из репо —
//     подписи размеров фактическими значениями («D = 100 мм»,
//     «h = 1,5 м»), ряды живого расчёта совпадают с calcGeo*
//     (78,5398 см²; 28,2743 см²; 9,4248 м³; 12,637 м³ + 80,4499 %;
//     4,1888 м³; 3,1416 м³), реальные пропорции (кольцо r 46.4 при
//     d/D=0.8; цилиндр height 116 при H/D=3), жидкость gh (gf-liquid
//     + clip ghFigClip; при h=0 нет; при h=D полная), в разметке НЕТ
//     ни marker, ни #ffffff (белые подписи старых картинок не
//     читались в светлой теме).
//   SW: kipia-test-v761.
//
// Запуск: через tests/run-all.js (require './test-task526.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ============================================================
// Утилиты
// ============================================================

// Вырезка секции страницы по id (id="page-geo-…") до следующего
// комментария-заголовка раздела (страницы геометрии идут подряд).
function pageBlock(pageId) {
    const i = INDEX_SRC.indexOf('id="page-' + pageId + '"');
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('<!-- ======================== ГЕОМЕТРИЯ', i + 100);
    return INDEX_SRC.slice(i, j === -1 ? INDEX_SRC.length : j);
}

// Вырезка функции по имени (баланс фигурных скобок).
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

// Движок Task 526 + formatNumber из репо → контекст VM.
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

// Карта: ключ схемы → (pageId, id рамки, id SVG, id блока расчёта,
// viewBox). Task 527: блок расчёта #xxFigRes убран — данные в SVG
// под фигурой. Task 528: высота viewBox = 206 + 17·строк (все
// результаты — в блоке с фигурой: 257 — 3 строки, 240 — 2 строки,
// 274 — 4 строки, 291 — гориз. цилиндр с 5 строками).
const FIGS = [
    ['gc',  'geo-circle',   'gcFigFrame',  'gcFig',  'gcFigRes',  '0 0 240 257'],
    ['gr',  'geo-ring',     'grFigFrame',  'grFig',  'grFigRes',  '0 0 240 240'],
    ['gcy', 'geo-cylinder', 'gcyFigFrame', 'gcyFig', 'gcyFigRes', '0 0 240 274'],
    ['gh',  'geo-horiz',    'ghFigFrame',  'ghFig',  'ghFigRes',  '0 0 240 291'],
    ['gs',  'geo-sphere',   'gsFigFrame',  'gsFig',  'gsFigRes',  '0 0 240 257'],
    ['gco', 'geo-cone',     'gcoFigFrame', 'gcoFig', 'gcoFigRes', '0 0 240 274'],
];

// ============================================================
// 1. SRC HTML — рамки на страницах, старое убрано
// ============================================================
describe('Task 526 A: HTML — рамки живых схем', () => {

    FIGS.forEach(([key, pageId, frameId, svgId, resId, viewBox]) => {
        test(pageId + ': рамка .geo-fig-frame с SVG (без HTML-блока расчёта)', () => {
            const b = pageBlock(pageId);
            assertTrue(b !== null, 'страница найдена');
            assertTrue(b.indexOf('class="geo-fig-frame" id="' + frameId + '"') !== -1,
                'рамка #' + frameId);
            assertTrue(b.indexOf('id="' + svgId + '" class="geo-fig-svg" viewBox="' + viewBox + '"') !== -1,
                'SVG #' + svgId + ' viewBox ' + viewBox + ' (Task 527: выше — место расчёта)');
            assertFalse(b.indexOf('id="' + resId + '"') !== -1,
                'Task 527: HTML-блок #' + resId + ' убран — данные в картинке');
            assertTrue(b.indexOf('Task 526') !== -1, 'маркер Task 526 в комментарии блока');
            assertFalse(b.indexOf('geo-svg-container') !== -1, 'старый контейнер убран');
        });
    });

    test('документ: старые классы/маркеры схем — 0 вхождений', () => {
        assertEqual(INDEX_SRC.split('geo-svg-container').length - 1, 0,
            '.geo-svg-container удалён');
        assertEqual(INDEX_SRC.split('class="geo-svg"').length - 1, 0,
            '.geo-svg удалён');
        assertFalse(/<marker id="g[crs]-(a[se])"/.test(INDEX_SRC),
            'SVG-маркеры стрелок старых картинок удалены');
    });

    test('рамок .geo-fig-frame в документе — РОВНО 6', () => {
        assertEqual(INDEX_SRC.split('class="geo-fig-frame"').length - 1, 6,
            'по одной на страницу геометрии');
    });

    test('oninput: все 11 полей звают geoFigUpdate (живая перестройка)', () => {
        const expected = [
            ['gc_diameter', "geoFigUpdate('gc')"], ['gr_d_outer', "geoFigUpdate('gr')"],
            ['gr_d_inner', "geoFigUpdate('gr')"], ['gcy_diameter', "geoFigUpdate('gcy')"],
            ['gcy_height', "geoFigUpdate('gcy')"], ['gh_length', "geoFigUpdate('gh')"],
            ['gh_diameter', "geoFigUpdate('gh')"], ['gh_level', "geoFigUpdate('gh')"],
            ['gs_diameter', "geoFigUpdate('gs')"], ['gco_diameter', "geoFigUpdate('gco')"],
            ['gco_height', "geoFigUpdate('gco')"],
        ];
        expected.forEach(([id, call]) => {
            const i = INDEX_SRC.indexOf('id="' + id + '"');
            assertTrue(i !== -1, 'поле #' + id + ' найдено');
            const seg = INDEX_SRC.slice(i, i + 260);
            assertTrue(seg.indexOf('oninput="validateNumericField(this); ' + call + '"') !== -1,
                '#' + id + ' → ' + call);
        });
    });
});

// ============================================================
// 2. SRC CSS — непрозрачные рамки, обе темы, анимация
// ============================================================
describe('Task 526 B: CSS — рамки и анимация', () => {

    test('.geo-fig-frame: непрозрачный графитово-синий фон (тёмная)', () => {
        const i = INDEX_SRC.indexOf('.geo-fig-frame {');
        const seg = INDEX_SRC.slice(i, i + 1400);
        assertTrue(seg.indexOf('background: #17222E') !== -1,
            'фон #17222E — hex БЕЗ альфы (непрозрачный)');
        assertTrue(seg.indexOf('width: min(100%, 350px)') !== -1,
            'ширина до 350px — Task 527: блок с фигурой немного больше');
        assertTrue(seg.indexOf('border-radius: 14px') !== -1, 'рамка скруглена');
    });

    test('светлая тема: бежево-бело-молочный фон #F7F2E6 (по заявке)', () => {
        const i = INDEX_SRC.indexOf('[data-theme="light"] .geo-fig-frame {');
        const seg = INDEX_SRC.slice(i, i + 700);
        assertTrue(seg.indexOf('background: #F7F2E6') !== -1,
            'фон #F7F2E6 — непрозрачная бежево-молочная бумага');
        assertFalse(/background:\s*rgba/.test(seg), 'фон не полупрозрачный (rgba)');
    });

    test('анимация: 6 keyframes gf-* + гварды :not(.geo-static)', () => {
        ['gf-draw', 'gf-fade', 'gf-dim', 'gf-res', 'gf-rise', 'gf-sweep'].forEach((kf) => {
            assertTrue(INDEX_SRC.indexOf('@keyframes ' + kf) !== -1,
                '@keyframes ' + kf + ' определён');
        });
        assertTrue(INDEX_SRC.indexOf('.geo-fig-frame:not(.geo-static) .gf-draw') !== -1,
            'гвард анимации контура');
        assertTrue(INDEX_SRC.indexOf('.geo-fig-frame:not(.geo-static) .gf-resg') !== -1,
            'гвард анимации зоны расчёта в картинке (Task 527)');
        assertTrue(INDEX_SRC.indexOf('frame.classList.toggle(\'geo-static\', !animate)') !== -1,
            'geo-static выключается/включается из geoFigRender');
    });

    test('доступность: prefers-reduced-motion гасит анимации', () => {
        const i = INDEX_SRC.indexOf('@media (prefers-reduced-motion: reduce)');
        assertTrue(i !== -1, 'media-правило есть');
        const seg = INDEX_SRC.slice(i, i + 600);
        assertTrue(seg.indexOf('animation: none !important') !== -1,
            'анимации отключаются');
        assertTrue(seg.indexOf('stroke-dashoffset: 0') !== -1,
            'контур сразу в конечном состоянии');
    });
});

// ============================================================
// 3. SRC JS — движок, хук навигации, вызовы из calcGeo*
// ============================================================
describe('Task 526 C: JS — движок живых схем', () => {

    test('движок: карта страниц и все функции определены', () => {
        assertTrue(INDEX_SRC.indexOf('const GEO_FIG_PAGES') !== -1, 'GEO_FIG_PAGES');
        ['geoFigCircleSVG', 'geoFigRingSVG', 'geoFigCylSVG', 'geoFigHorizSVG',
         'geoFigSphereSVG', 'geoFigConeSVG', 'geoFigVals', 'geoFigBuild',
         'geoFigRender', 'geoFigPlay', 'geoFigUpdate', 'gfArrow', 'gfDimH',
         'gfDimV'].forEach((fn) => {
            assertTrue(INDEX_SRC.indexOf('function ' + fn + '(') !== -1,
                'function ' + fn + ' определена');
        });
        FIGS.forEach(([key, pageId]) => {
            const pat = new RegExp("'" + pageId + "'\\s*:\\s*'" + key + "'");
            assertTrue(pat.test(INDEX_SRC), pageId + ' → ' + key + ' в карте');
        });
    });

    test('navigateTo: хук GEO_FIG_PAGES → geoFigPlay при открытии', () => {
        const nav = fnBlock('navigateTo');
        assertTrue(nav !== null, 'navigateTo найдена');
        assertTrue(nav.indexOf('GEO_FIG_PAGES[page]') !== -1, 'гвард по карте страниц');
        assertTrue(nav.indexOf('geoFigPlay(GEO_FIG_PAGES[page])') !== -1,
            'запуск анимированной схемы');
    });

    test('calcGeo*: все 6 расчётов перезапускают схему с анимацией', () => {
        [['calcGeoCircle', "geoFigPlay('gc')"], ['calcGeoRing', "geoFigPlay('gr')"],
         ['calcGeoCylinder', "geoFigPlay('gcy')"], ['calcGeoHorizCyl', "geoFigPlay('gh')"],
         ['calcGeoSphere', "geoFigPlay('gs')"], ['calcGeoCone', "geoFigPlay('gco')"]].
        forEach(([fn, call]) => {
            const b = fnBlock(fn);
            assertTrue(b !== null, fn + ' найдена');
            assertTrue(b.indexOf(call) !== -1, fn + ' → ' + call);
        });
    });
});

// ============================================================
// 4. VM — живые расчёты, реальные пропорции, точные стрелки
// ============================================================
describe('Task 526 D: VM — живые схемы (движок + formatNumber)', () => {
    const CTX = engineCtx();

    test('gc: круг D=100 мм — подписи и живой расчёт', () => {
        const b = CTX.geoFigBuild('gc', { D: 100 });
        assertTrue(b.svg.indexOf('>D = 100 мм<') !== -1, 'подпись D = 100 мм');
        assertTrue(b.svg.indexOf('>R = 50 мм<') !== -1, 'подпись R = 50 мм');
        assertEqual(b.rows[0][0], 'S = π·D²/4', 'формула площади');
        assertEqual(b.rows[0][1], '78,5398 см²', 'S совпадает с calcGeoCircle');
        assertEqual(b.rows[1][1], '314,16 мм', 'P совпадает с calcGeoCircle');
        assertTrue(b.svg.indexOf('gf-sweep') !== -1, 'радиус обегает окружность');
    });

    test('gr: кольцо D=100 d=80 — реальная пропорция d/D', () => {
        const b = CTX.geoFigBuild('gr', { D: 100, d: 80 });
        assertTrue(b.svg.indexOf('>D = 100 мм<') !== -1, 'подпись D');
        assertTrue(b.svg.indexOf('>d = 80 мм<') !== -1, 'подпись d');
        assertTrue(b.svg.indexOf('r="46.4"') !== -1,
            'внутренний радиус 58·(d/D)=46.4 — пропорция реальная');
        assertEqual(b.rows[0][1], '28,2743 см²', 'S совпадает с calcGeoRing');
        assertEqual(b.rows[1][1], '20 мм', 'Dэкв = 20 мм');
        // тонкое кольцо: d=20 → отверстие 58·0.2=11.6
        const b2 = CTX.geoFigBuild('gr', { D: 100, d: 20 });
        assertTrue(b2.svg.indexOf('r="11.6"') !== -1, 'пропорция d/D=0.2 → r=11.6');
    });

    test('gcy: цилиндр D=2 H=3 — пропорция H/D реальная', () => {
        const b = CTX.geoFigBuild('gcy', { D: 2, H: 3 });
        assertTrue(b.svg.indexOf('>D = 2 м<') !== -1, 'подпись D');
        assertTrue(b.svg.indexOf('>H = 3 м<') !== -1, 'подпись H');
        assertEqual(b.rows[0][1], '9,4248 м³', 'V совпадает с calcGeoCylinder');
        assertEqual(b.rows[1][1], '18,8496 м²', 'Sбок совпадает (Task 528: все результаты)');
        assertEqual(b.rows[2][1], '25,1327 м²', 'Sполн совпадает');
        assertTrue(b.svg.indexOf('height="116.0"') !== -1, 'H/D=1.5 → фигура вытянута');
        // вдвое выше: H=6 → та же высота 116, ширина вдвое меньше
        const b2 = CTX.geoFigBuild('gcy', { D: 2, H: 6 });
        assertTrue(b2.svg.indexOf('width="38.7"') !== -1,
            'H/D=3 → ширина 38.7 (вдвое уже D=2,H=3 при той же высоте)');
    });

    test('gh: гориз. цилиндр L=5 D=2 h=1,5 — жидкость и живой расчёт', () => {
        const b = CTX.geoFigBuild('gh', { L: 5, D: 2, h: 1.5 });
        assertTrue(b.svg.indexOf('>L = 5 м<') !== -1, 'подпись L');
        assertTrue(b.svg.indexOf('>D = 2 м<') !== -1, 'подпись D');
        assertTrue(b.svg.indexOf('>h = 1,5 м<') !== -1, 'подпись h (запятая локали)');
        assertTrue(b.svg.indexOf('gf-liquid') !== -1, 'жидкость нарисована');
        assertTrue(b.svg.indexOf('clip-path="url(#ghFigClip)"') !== -1,
            'жидкость обрезана по силуэту (clipPath)');
        assertTrue(b.svg.indexOf('gf-rise') !== -1, 'анимация наливания');
        assertEqual(b.rows[0][1], '12,637 м³', 'V совпадает с calcGeoHorizCyl');
        assertEqual(b.rows[1][1], '15,708 м³', 'Vполн совпадает');
        assertEqual(b.rows[2][1], '80,4499 %', 'заполнение совпадает');
    });

    test('gh: края h=0 и h=D — без жидкости / полная', () => {
        const b0 = CTX.geoFigBuild('gh', { L: 5, D: 2, h: 0 });
        assertFalse(b0.svg.indexOf('gf-liquid') !== -1, 'h=0 — жидкости нет');
        assertFalse(b0.svg.indexOf('>h = ') !== -1, 'h=0 — размер h не рисуется');
        assertEqual(b0.rows[0][1], '0 м³', 'V=0');
        const bF = CTX.geoFigBuild('gh', { L: 5, D: 2, h: 2 });
        assertTrue(bF.svg.indexOf('gf-liquid') !== -1, 'h=D — жидкость есть');
        assertFalse(bF.svg.indexOf('>h = ') !== -1, 'h=D — размер h не рисуется');
        assertEqual(bF.rows[2][1], '100 %', 'заполнение 100 %');
    });

    test('gs: сфера D=2 — живой расчёт', () => {
        const b = CTX.geoFigBuild('gs', { D: 2 });
        assertTrue(b.svg.indexOf('>D = 2 м<') !== -1, 'подпись D');
        assertEqual(b.rows[0][1], '4,1888 м³', 'V совпадает с calcGeoSphere');
        assertEqual(b.rows[1][1], '12,5664 м²', 'S совпадает');
        assertTrue(b.svg.indexOf('gf-hidden') !== -1, 'экватор/меридиан штриховые');
    });

    test('gco: конус D=2 H=3 — размеры и образующая', () => {
        const b = CTX.geoFigBuild('gco', { D: 2, H: 3 });
        assertTrue(b.svg.indexOf('>D = 2 м<') !== -1, 'подпись D');
        assertTrue(b.svg.indexOf('>H = 3 м<') !== -1, 'подпись H');
        assertTrue(b.svg.indexOf('>L = 3,1623 м<') !== -1,
            'образующая L — фактическое значение');
        assertEqual(b.rows[0][1], '3,1416 м³', 'V совпадает с calcGeoCone');
        assertEqual(b.rows[1][0], 'Sосн = π·D²/4', 'Sосн (Task 528: все результаты)');
        assertEqual(b.rows[2][0], 'L = √(H²+(D/2)²)', 'формула образующей');
    });

    test('стрелки размеров — ТОЧНЫЕ треугольники (без маркеров)', () => {
        assertEqual(CTX.gfArrow(10, 10, 0), 'M10.0,10.0L4.0,12.3L4.0,7.7Z',
            'остриё вправо: основание ровно на 6 позади');
        assertEqual(CTX.gfArrow(10, 10, Math.PI), 'M10.0,10.0L16.0,7.7L16.0,12.3Z',
            'остриё влево');
        assertEqual(CTX.gfArrow(10, 10, -Math.PI / 2), 'M10.0,10.0L12.3,16.0L7.7,16.0Z',
            'остриё вверх');
        // во всех схемах: ни marker (смещение refX), ни белых подписей
        // (прежние fill="#ffffff" не читались в светлой теме)
        [['gc', { D: 100 }], ['gr', { D: 100, d: 80 }], ['gcy', { D: 2, H: 3 }],
         ['gh', { L: 5, D: 2, h: 1.5 }], ['gs', { D: 2 }], ['gco', { D: 2, H: 3 }]].
        forEach(([k, v]) => {
            const svg = CTX.geoFigBuild(k, v).svg;
            assertFalse(svg.indexOf('marker') !== -1, k + ': без SVG-маркеров');
            assertFalse(svg.indexOf('#ffffff') !== -1, k + ': без белых заливок');
            assertTrue(svg.indexOf('gf-dimar') !== -1, k + ': стрелки-треугольники есть');
            assertTrue(svg.indexOf('gf-draw') !== -1, k + ': анимация контура есть');
        });
    });
});

// ============================================================
// 5. SW — версия кэша бампнута (index.html менялся)
// ============================================================
describe('Task 526 — SW: версия кэша', () => {

    test('sw.js: CACHE_VERSION = kipia-test-v761', () => {
        const m = SW_SRC.match(/const CACHE_VERSION = '([^']+)'/);
        assertTrue(m, 'CACHE_VERSION найден');
        assertEqual(m[1], 'kipia-test-v761',
            'версия бампнута v740 → v741 (правка index.html, Task 528)');
    });

    test('guard: версия ушла вперёд от v740 (нет двойного бампа)', () => {
        const m = SW_SRC.match(/const CACHE_VERSION = '([^']+)'/);
        assertTrue(m[1] !== 'kipia-test-v740',
            'v740 — прошлый шаг Task 527, не должен остаться');
    });
});
