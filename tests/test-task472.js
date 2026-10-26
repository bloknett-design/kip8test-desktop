// tests/test-task472.js
// Task 472 — заявка пользователя: «При вводе текста работ на
// следующий месяц больше поля ввода, поле ввода должно динамически
// расширятся вниз под новые строчки текста. Кликабильные ячейки
// таблицы мероприятий должны незначительно выделяться зрительно
// второй рамкой внутри имитирующей выпуклость кнопки. Фон таблицы
// и окна должны быть не прозрачными, и окно в светлой теме не
// белым а бежевым цветом, как цвет фона бара, и с толстой рамкой
// с эффектом выступа.»
//
// КОНТЕКСТ: динамичное правое окно Task 471 (ввод работ «на
// следующий месяц» — поле + «Добавить»; перечень «Работы на
// месяц» с отметками), таблица Task 460/470, отметки Task 463,
// раскладка Task 468, светлый бежевый бар — --header-bg светлой
// темы rgba(240, 238, 230, 0.92).
// РЕШЕНИЕ (клиент-only, серверных шагов НЕТ):
//   1) поле ввода — <textarea rows="1"> с АВТОРОСТОМ: слушатель
//      input → PlanWorksData._growInput (height:auto →
//      scrollHeight+2px — компенсация границ border-box);
//      Enter — по-прежнему «Добавить» (перехват жив);
//   2) кликабельные ячейки (td.pe-m, месяцы шапки, «Мероприятия»,
//      строки работ pe-name-click) — вторая внутренняя рамка:
//      бевел inset box-shadow (светлая грань сверху/слева, тёмная
//      снизу/справа); у выбранного месяца бевел слит с полосой;
//   3) .pe-card/.pe-desc-card — сплошные фоны #17212e (тёмная),
//      светлая: карточка #faf9f6, окно — БЕЖЕВОЕ #f0eee6 (цвет
//      фона бара) с толстой 3px двухтонной рамкой-выступом.
//   SW: kipia-test-v760.
//
// Запуск: через tests/run-all.js (require './test-task472.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Блок модуля PlanWorksData (между PlanEventsData и WorkSchedule)
function pwModuleSrc() {
    const a = INDEX_SRC.indexOf('var PlanWorksData = {');
    const b = INDEX_SRC.indexOf('var WorkSchedule = {');
    return (a !== -1 && b !== -1 && b > a) ? INDEX_SRC.slice(a, b) : '';
}

function extractMethod(src, name) {
    const start = src.indexOf(name + ': function(');
    if (start === -1) return null;
    const braceStart = src.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    return null;
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// Метод модуля как ФУНКЦИЯ (для .call с контролируемым this)
function methodFn(src, name) {
    const m = extractMethod(src, name);
    if (!m) return null;
    return new Function('return (' + m.slice(m.indexOf('function')) + ');')();
}

// CSS-правило от селектора до первой закрывающей скобки
function ruleBlock(sel) {
    const i = INDEX_SRC.indexOf(sel);
    if (i === -1) return null;
    return INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
}

// ============================================================
// 1. Авторост поля ввода работ (textarea)
// ============================================================
describe('Task 472 — SRC: поле ввода с авторостом', () => {

    test('_render: поле — textarea rows=1 (не input)', () => {
        const fn = stripComments(extractMethod(pwModuleSrc(), '_render'));
        assertTrue(fn.indexOf('<textarea id="peWorkInput"') !== -1,
            'поле описания работы — textarea (перенос строк)');
        assertTrue(fn.indexOf('rows="1"') !== -1,
            'стартовая высота — одна строка');
        assertFalse(fn.indexOf('<input type="text" id="peWorkInput"') !== -1,
            'однострочный input заменён (заявка: авторост)');
        assertTrue(fn.indexOf('maxlength="500"') !== -1,
            'лимит 500 символов жив (сервер)');
        assertTrue(fn.indexOf('aria-label="Описание работы"') !== -1,
            'доступность поля жива');
    });

    test('_bindView: слушатель input → авторост + первичный размер', () => {
        const fn = stripComments(extractMethod(pwModuleSrc(), '_bindView'));
        assertTrue(fn.indexOf("addEventListener('input'") !== -1,
            'пересчёт высоты на каждый ввод');
        assertTrue(fn.indexOf('self._growInput(inp)') !== -1,
            'авторост вызывается при вводе текста');
        assertTrue(fn.indexOf('this._growInput(inp)') !== -1,
            'начальная высота выставляется сразу после рендера');
        assertTrue(fn.indexOf('inp.focus()') !== -1,
            'фокус в поле жив (Task 471)');
    });

    test('_bindView: Enter — по-прежнему «Добавить»', () => {
        const fn = stripComments(extractMethod(pwModuleSrc(), '_bindView'));
        assertTrue(fn.indexOf("e.key === 'Enter'") !== -1 &&
                   fn.indexOf('self._add()') !== -1,
            'Enter добавляет работу (авторост не сломал)');
    });

    test('_growInput: высота под контент (+2px границ border-box)', () => {
        const fn = methodFn(pwModuleSrc(), '_growInput');
        assertTrue(fn !== null, 'метод _growInput существует');
        const f1 = { style: {}, scrollHeight: 33 };
        fn(f1);
        assertEqual(f1.style.height, '35px',
            'одна строка — высота прежнего input');
        const f2 = { style: {}, scrollHeight: 120 };
        fn(f2);
        assertEqual(f2.style.height, '122px',
            'многострочный текст — поле выросло вниз (+2px границы)');
        const f3 = { style: { height: '120px' }, scrollHeight: 33 };
        fn(f3);
        assertEqual(f3.style.height, '35px',
            'очистка/удаление текста — поле сжимается обратно');
    });

    test('CSS .pe-works-input: без ресайза и скроллбара', () => {
        const b = ruleBlock('.pe-works-input {');
        assertTrue(b !== null, 'правило .pe-works-input');
        assertTrue(/resize:\s*none/.test(b), 'ручной ресайз отключён');
        assertTrue(/overflow:\s*hidden/.test(b),
            'скроллбар не показывается (высота = контент)');
        assertTrue(/min-height:\s*35px/.test(b),
            'минимум — одна строка (как прежний input)');
        assertTrue(/display:\s*block/.test(b), 'блочное поле в flex-строке');
    });

    test('CSS .pe-works-form: кнопка прижата к первой строке', () => {
        const b = ruleBlock('.pe-works-form {');
        assertTrue(b !== null, 'правило .pe-works-form');
        assertTrue(/align-items:\s*flex-start/.test(b),
            '«Добавить» не растягивается вместе с растущим полем');
    });
});

// ============================================================
// 2. Вторая внутренняя рамка — выпуклость кликабельных ячеек
// ============================================================
describe('Task 472 — SRC: бевел кликабельных ячеек', () => {

    test('группа правил: бевел на всех кликабельных ячейках', () => {
        const i = INDEX_SRC.indexOf('Task 472: выпуклость кликабельных ячеек таблицы');
        assertTrue(i !== -1, 'маркер Task 472 в CSS');
        const blk = INDEX_SRC.slice(i, i + 1400);
        assertTrue(blk.indexOf('.pe-table td.pe-m') !== -1,
            'ячейки месяцев таблицы (диалог отметки Task 463)');
        assertTrue(blk.indexOf('.pe-head-months th') !== -1,
            'месяцы шапки (выбор месяца Task 471)');
        assertTrue(blk.indexOf('.pe-table th.pe-th-name') !== -1,
            '«Мероприятия» (возврат к описанию Task 471)');
        assertTrue(blk.indexOf('.pe-table td.pe-name.pe-name-click') !== -1,
            'строки работ (Task 470/471)');
    });

    test('бевел: светлая грань сверху/слева, тёмная снизу/справа', () => {
        const i = INDEX_SRC.indexOf('Task 472: выпуклость кликабельных ячеек таблицы');
        const blk = INDEX_SRC.slice(i, i + 1400);
        assertTrue(blk.indexOf('inset 1px 1px 0 rgba(255, 255, 255, 0.11)') !== -1,
            'светлая грань — выпуклость (тёмная тема)');
        assertTrue(blk.indexOf('inset -1px -1px 0 rgba(0, 0, 0, 0.45)') !== -1,
            'тёмная грань — выпуклость (тёмная тема)');
    });

    test('светлая тема: бевел двухтонный, читаемый на светлом', () => {
        const i = INDEX_SRC.indexOf('Task 472: выпуклость кликабельных ячеек таблицы');
        const blk = INDEX_SRC.slice(i, i + 1400);
        assertTrue(blk.indexOf('inset 1px 1px 0 rgba(255, 255, 255, 0.8)') !== -1,
            'светлая грань усилиена для светлой темы');
        assertTrue(blk.indexOf('inset -1px -1px 0 rgba(83, 96, 117, 0.42)') !== -1,
            'тёмная грань — цвет границ таблиц (rgb 83,96,117)');
    });

    test('выбранный месяц шапки: бевел слит с полосой снизу', () => {
        const sel = ruleBlock('.pe-head-months th.pe-mo-sel {');
        assertTrue(sel !== null, 'правило pe-mo-sel живо');
        assertTrue(sel.indexOf('inset 1px 1px 0') !== -1 &&
                   sel.indexOf('inset -1px -1px 0') !== -1,
            'бевел не потерян у выбранного месяца');
        assertTrue(sel.indexOf('inset 0 -2px 0 rgba(74, 143, 199, 0.85)') !== -1,
            'акцентная полоса снизу жива (Task 471)');
        const lt = ruleBlock('[data-theme="light"] .pe-head-months th.pe-mo-sel {');
        assertTrue(lt !== null && lt.indexOf('inset 1px 1px 0') !== -1 &&
                   lt.indexOf('inset 0 -2px 0 rgba(58, 108, 152, 0.8)') !== -1,
            'светлая тема: бевел + полоса вместе');
    });

    test('бевел НЕ задан таблице целиком (только кликабельные)', () => {
        // Общие ячейки (группы, некликабельные наименования) бевел
        // не получают — правило адресное, через перечисление
        const base = ruleBlock('.pe-table th, .pe-table td {');
        assertTrue(base === null || base.indexOf('box-shadow') === -1,
            'общая рамка ячеек — без бевела (только кликабельные)');
        const grp = ruleBlock('.pe-group td {');
        assertTrue(grp === null || grp.indexOf('box-shadow') === -1,
            'строки-группы — без бевела (не кликабельны)');
    });
});

// ============================================================
// 3. Непрозрачные фоны + бежевое окно в светлой теме
// ============================================================
describe('Task 472 — SRC: непрозрачные фоны и бежевое окно', () => {

    test('.pe-card: сплошной фон (тёмная тема)', () => {
        const b = ruleBlock('.pe-card {');
        assertTrue(b !== null, 'правило .pe-card');
        const code = stripComments(b);
        assertTrue(/background:\s*#17212e/.test(code),
            'карточка таблицы непрозрачная (аналог rgba(30,42,56,0.55))');
        assertFalse(code.indexOf('var(--card-bg') !== -1,
            'альфа-фон карточки убран');
    });

    test('.pe-desc-card: сплошной фон (тёмная тема)', () => {
        const b = ruleBlock('.pe-desc-card {');
        assertTrue(b !== null, 'правило .pe-desc-card');
        const code = stripComments(b);
        assertTrue(/background:\s*#17212e/.test(code),
            'окно непрозрачное (тёмная тема)');
        assertFalse(code.indexOf('var(--card-bg') !== -1,
            'альфа-фон окна убран');
        assertTrue(/border:\s*1px solid/.test(code) &&
                   /border-radius:\s*12px/.test(code),
            'базовая рамка окна жива (Task 468)');
    });

    test('светлая тема: карточка таблицы непрозрачная', () => {
        const b = ruleBlock('[data-theme="light"] .pe-card {');
        assertTrue(b !== null, 'правило light .pe-card');
        assertTrue(/background:\s*#faf9f6/.test(b),
            'сплошной аналог rgba(255,255,255,0.65) над бежевой страницей');
    });

    test('светлая тема: окно — БЕЖЕВОЕ, как фон бара', () => {
        const b = ruleBlock('[data-theme="light"] .pe-desc-card {');
        assertTrue(b !== null, 'правило light .pe-desc-card');
        assertTrue(/background:\s*#f0eee6/.test(b),
            'окно бежевое #f0eee6 = rgb(240,238,230)');
        // бар светлой темы: --header-bg rgba(240, 238, 230, 0.92)
        assertTrue(INDEX_SRC.indexOf('--header-bg: rgba(240, 238, 230, 0.92);') !== -1,
            'цвет фона бара светлой темы (эталон бежевого)');
    });

    test('светлая тема: толстая рамка с эффектом выступа', () => {
        const b = ruleBlock('[data-theme="light"] .pe-desc-card {');
        assertTrue(/border:\s*3px solid/.test(b),
            'толстая рамка окна (3px)');
        assertTrue(b.indexOf('#fffdf7') !== -1,
            'светлая грань рамки (сверху/слева) — выступ');
        assertTrue(b.indexOf('#c8c2af') !== -1,
            'тёмная грань рамки (снизу/справа) — выступ');
        assertTrue(/box-shadow/.test(b),
            'мягкая тень — панель приподнята над страницей');
    });

    test('маркер Task 472 в комментарии секции страницы', () => {
        const i = INDEX_SRC.indexOf('<div id="page-plan-events" class="page-content">');
        assertTrue(i !== -1, 'секция найдена');
        const ctx = INDEX_SRC.slice(Math.max(0, i - 3900), i);
        assertTrue(ctx.indexOf('Task 472') !== -1,
            'описание партии Task 472 в шапке секции');
        assertTrue(ctx.indexOf('авторост') !== -1 || ctx.indexOf('АВТОРОСТОМ') !== -1,
            'упоминание автороста поля');
    });
});

// ============================================================
// 4. SW — версия кэша + комментарий партии
// ============================================================
describe('Task 472 — SW: версия кэша', () => {

    test("CACHE_VERSION = kipia-test-v760", () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v760';") !== -1,
            'SW поднят до kipia-test-v760 (Task 472)');
    });

    test('версия до партии (v695) отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v695') === -1,
            'в sw.js не осталось kipia-test-v695');
    });

    test('комментарий Task 472 в шапке версий sw.js', () => {
        const i = SW_SRC.indexOf('kipia-test-v760');
        // Task 492: комментарий (~290 симв.) отодвинул якорь Task 472
        // до ~8730 — окно 8500 → 9300.
        // Task 497: комментарий избранного расходомеров (~200 симв.)
        // — якорь 472@9939 — окно 9900 → 10300 (запас 361).
        // Task 499: комментарий плейсхолдеров диапазонов (~430 симв.)
        // — якорь 472@10658 — окно 10300 → 11200 (запас 542).
        // Task 501: комментарий электротехники/геометрии (~380 симв.)
        // — якорь 472@11459 — окно 11200 → 12400 (запас 941).
        const ctx = SW_SRC.slice(Math.max(0, i - 13700), i);
        // Task 478: окна 2100 → 2900 (Task 472 ~2251) и
        // 2700 → 3400 (Task 471 ~2800) — комментарий ППР-индикации.
        // Task 481: окна 2900 → 3600 (Task 472 ~3011) и
        // 3400 → 4200 (Task 471 ~3560) — комментарий «ТО = только год».
        assertTrue(ctx.indexOf('Task 472') !== -1, 'упоминание Task 472');
        assertTrue(ctx.indexOf('бежевое') !== -1,
            'описание: бежевое окно светлой темы');
        assertTrue(ctx.indexOf('textarea') !== -1,
            'описание: авторост поля textarea');
    });

    test('контекст Task 471 не вытеснен (окно 1300 символов)', () => {
        const i = SW_SRC.indexOf('kipia-test-v760');
        // Task 473: окно 900 → 1020; Task 474: 1020 → 1300 — комментарий
        // Task 475: окно 1300 → 2100 — комментарий этапа 1 оптимизации
        // Task 476: окна 1500 → 2100 (Task 472 ~1621) и
        // 2100 → 2700 (Task 471 ~2170) — комментарий этапа 2.
        // отодвинул Task 471 до ~1738; окно Task 472 900 → 1500 (~1189).
        // Task 474 в шапке sw.js отодвинул начало комментария Task 471
        // (~1157 символов).
        // Task 499: комментарий плейсхолдеров (~430 симв.) — якорь
        // 471@11207 — окно 11200 → 12000.
        // Task 501: комментарий (~380 симв.) — якорь 471@12008 —
        // окно 12000 → 13000.
        const ctx = SW_SRC.slice(Math.max(0, i - 14300), i);
        assertTrue(ctx.indexOf('Task 471') !== -1,
            'комментарий Task 471 остаётся в окне версий');
    });
});
