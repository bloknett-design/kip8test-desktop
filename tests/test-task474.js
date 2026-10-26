// tests/test-task474.js
// Task 474 — заявка пользователя: «В разделе КИП ИОС, в подробной
// карточке прибора размер текста типа прибора, расположенного
// перед картинкой прибора, сделай в полтора раза больше. И текст
// "№ прибора" и "Место установки" смести немного ниже от верхней
// границы карточки.»
//
// РЕШЕНИЕ (index.html — только CSS карточки прибора devRenderDetail,
// работает в десктоп-панели #detailPanel и на мобильной странице
// #page-device-detail — рендер один, Task 173):
//   (а) текст типа прибора — оверлей .dev-detail-type-overlay в
//       нижней части картинки, поверх неё («перед картинкой
//       прибора»): font-size 12px → 18px — РОВНО в полтора раза
//       (12 * 1.5 = 18); светлая тема цвета не меняет — размер
//       один в обоих темах;
//   (б) тексты «№ прибора» и «Место установки» — блок
//       .dev-detail-meta справа от картинки: padding-top 2px →
//       12px — оба блока (мета-строки) смещены немного ниже от
//       верхней границы карточки; десктопное правило
//       #detailPanel .dev-detail-meta переопределяет только
//       горизонтальные отступы (padding-left/right 14px), НЕ
//       трогая padding-top — смещение действует и в панели;
//   (в) HTML-структура карточки не менялась (картинка слева +
//       Тип поверх неё + №/Место справа, Task 334/335/336 живы).
//   SW: kipia-test-v697 → v698.
//   АДАПТАЦИЯ (прецедент Task 471/473): окна шапки версий sw.js —
//   test-task461.js 3600 → 3800 (комментарий Task 474 отодвинул
//   Task 461 до ~3688), test-task471.js и test-task472.js
//   (контекст Task 471) 1020 → 1300 (Task 471 теперь ~1126).
//
// Запуск: через tests/run-all.js (require './test-task474.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Извлечь CSS-правило целиком (от селектора до закрывающей скобки)
function extractRule(src, selector) {
    const i = src.indexOf(selector);
    if (i === -1) return null;
    const braceStart = src.indexOf('{', i);
    let depth = 0;
    for (let k = braceStart; k < src.length; k++) {
        if (src[k] === '{') depth++;
        else if (src[k] === '}') {
            depth--;
            if (depth === 0) return src.slice(i, k + 1);
        }
    }
    return null;
}

// ==========================================================================
// 1. CSS — текст типа прибора в полтора раза крупнее (12px → 18px)
describe('Task 474 — SRC: тип прибора ×1.5', () => {
    test('правило .dev-detail-type-overlay существует (одно)', () => {
        // Считаем только самостоятельные правила (в начале строки) —
        // не переопределения «[data-theme="light"] .dev-detail-type-overlay»
        const re = /^\s*\.dev-detail-type-overlay \{/gm;
        assertEqual((INDEX_SRC.match(re) || []).length, 1,
            'ровно одно определение оверлея Типа');
    });

    test('font-size оверлея Типа = 18px', () => {
        const rule = extractRule(INDEX_SRC, '.dev-detail-type-overlay {');
        assertTrue(!!rule, 'правило извлечено');
        assertTrue(/font-size:\s*18px/.test(rule),
            'в правиле есть font-size: 18px');
    });

    test('18px — ровно в полтора раза больше прежних 12px', () => {
        assertEqual(18, 12 * 1.5,
            '12 × 1.5 = 18 (полтора раза, как в заявке)');
    });

    test('прежний размер 12px в правиле заменён (нет 12px)', () => {
        const rule = extractRule(INDEX_SRC, '.dev-detail-type-overlay {');
        assertTrue(rule.indexOf('font-size: 12px') === -1,
            'старый font-size 12px отсутствует');
    });

    test('светлая тема НЕ переопределяет размер Типа', () => {
        const rule = extractRule(INDEX_SRC,
            '[data-theme="light"] .dev-detail-type-overlay {');
        assertTrue(!!rule, 'правило светлой темы на месте');
        assertTrue(rule.indexOf('font-size') === -1,
            'в светлой теме размер не переопределяется (18px в обеих)');
    });

    test('вес и переносы Типа не тронуты (600 + break-word)', () => {
        const rule = extractRule(INDEX_SRC, '.dev-detail-type-overlay {');
        assertTrue(rule.indexOf('font-weight: 600') !== -1,
            'font-weight: 600 (как было)');
        assertTrue(rule.indexOf('overflow-wrap: break-word') !== -1,
            'перенос длинных слов сохранён');
    });

    test('комментарий Task 474 у правила оверлея Типа', () => {
        const i = INDEX_SRC.indexOf('.dev-detail-type-overlay {');
        const ctx = INDEX_SRC.slice(Math.max(0, i - 400), i);
        assertTrue(ctx.indexOf('Task 474') !== -1,
            'комментарий Task 474 перед правилом');
        assertTrue(ctx.toLowerCase().indexOf('полтора') !== -1,
            'описание: «в полтора раза»');
    });
});

// ==========================================================================
// 2. CSS — «№ прибора» и «Место установки» ниже от верхней границы
describe('Task 474 — SRC: мета-блок смещён вниз', () => {
    test('правило .dev-detail-meta существует (одно)', () => {
        // Считаем только самостоятельные правила (в начале строки) —
        // не десктопное переопределение «#detailPanel .dev-detail-meta»
        const re = /^\s*\.dev-detail-meta \{/gm;
        assertEqual((INDEX_SRC.match(re) || []).length, 1,
            'ровно одно определение мета-блока');
    });

    test('padding-top мета-блока = 12px (было 2px)', () => {
        const rule = extractRule(INDEX_SRC, '.dev-detail-meta {');
        assertTrue(!!rule, 'правило извлечено');
        assertTrue(/padding-top:\s*12px/.test(rule),
            'в правиле есть padding-top: 12px');
        assertTrue(rule.indexOf('padding-top: 2px') === -1,
            'прежний padding-top: 2px отсутствует');
    });

    test('12px — смещение «немного ниже» (не радикальное)', () => {
        assertTrue(12 >= 8 && 12 <= 20,
            'смещение в разумных пределах «немного ниже» (12px)');
    });

    test('десктоп-панель НЕ сбрасывает padding-top', () => {
        const rule = extractRule(INDEX_SRC, '#detailPanel .dev-detail-meta {');
        assertTrue(!!rule, 'десктопное правило на месте (Task 173/336)');
        assertTrue(rule.indexOf('padding-top') === -1,
            'десктоп не переопределяет padding-top — 12px действует и в панели');
        assertTrue(rule.indexOf('padding-left: 14px') !== -1 &&
            rule.indexOf('padding-right: 14px') !== -1,
            'горизонтальные отступы панели прежние');
    });

    test('комментарий Task 474 у мета-блока', () => {
        const i = INDEX_SRC.indexOf('.dev-detail-meta {');
        const ctx = INDEX_SRC.slice(Math.max(0, i - 400), i);
        assertTrue(ctx.indexOf('Task 474') !== -1,
            'комментарий Task 474 перед правилом');
        assertTrue(ctx.indexOf('№ прибора') !== -1 &&
            ctx.indexOf('Место установки') !== -1,
            'описание упоминает оба текста');
    });

    test('вертикальная раскладка блока прежняя (flex-column + gap 10px)', () => {
        const rule = extractRule(INDEX_SRC, '.dev-detail-meta {');
        assertTrue(rule.indexOf('flex-direction: column') !== -1,
            'строки по-прежнему столбиком');
        assertTrue(rule.indexOf('gap: 10px') !== -1,
            'интервал между строками не тронут');
    });
});

// ==========================================================================
// 3. SRC — структура карточки не изменилась (Task 334/335/336 живы)
describe('Task 474 — SRC: структура карточки', () => {
    test('рендер: картинка → оверлей Типа → мета-блок (порядок жив)', () => {
        const iWrap = INDEX_SRC.indexOf("class=\"dev-detail-image-wrap\"");
        const iImg = INDEX_SRC.indexOf("class=\"dev-detail-image\"");
        const iOverlay = INDEX_SRC.indexOf("class=\"dev-detail-type-overlay\"");
        const iMeta = INDEX_SRC.indexOf("class=\"dev-detail-meta\"");
        assertTrue(iWrap !== -1 && iImg !== -1 && iOverlay !== -1 && iMeta !== -1,
            'все блоки карточки рендерятся');
        assertTrue(iWrap < iImg && iImg < iOverlay && iOverlay < iMeta,
            'порядок: обёртка → картинка → Тип (перед/поверх картинки) → мета');
    });

    test('оверлей Типа рендерится только при непустом Типе', () => {
        assertTrue(INDEX_SRC.indexOf('if (type) {') !== -1 &&
            INDEX_SRC.indexOf("'<div class=\"dev-detail-type-overlay\">' + devEsc(type)") !== -1,
            'условие if (type) живо (Task 334)');
    });

    test('подписи «№ прибора» и «Место установки» на месте', () => {
        assertTrue(INDEX_SRC.indexOf(
            '<div class="dev-detail-meta-label">№ прибора</div>') !== -1,
            'метка № прибора');
        assertTrue(INDEX_SRC.indexOf(
            '<div class="dev-detail-meta-label">Место установки</div>') !== -1,
            'метка Место установки');
        assertTrue(INDEX_SRC.indexOf(
            '<div class="dev-detail-meta-label">') !== -1,
            'метки рендерятся в .dev-detail-meta-label');
    });

    test('мета-строки: № прибора синий акцент + Место обычные', () => {
        assertTrue(INDEX_SRC.indexOf(
            'dev-detail-meta-value dev-detail-meta-number') !== -1,
            '№ прибора — акцентный класс (Task 334)');
    });

    test('липкий верх карточки не тронут (Task 334/335/336)', () => {
        assertTrue(INDEX_SRC.indexOf(
            '#page-device-detail .dev-detail-top {') !== -1,
            'липкость мобайл-страницы жива');
        assertTrue(INDEX_SRC.indexOf(
            '#detailPanel .dev-detail-top {') !== -1,
            'липкость десктоп-панели жива');
    });

    test('размер картинки не менялся (140/160px)', () => {
        const m = extractRule(INDEX_SRC, '.dev-detail-image-wrap {');
        assertTrue(m.indexOf('width: 140px') !== -1 &&
            m.indexOf('height: 140px') !== -1,
            'мобайл 140px (как было)');
        const d = extractRule(INDEX_SRC, '#detailPanel .dev-detail-image-wrap {');
        assertTrue(d.indexOf('width: 160px') !== -1 &&
            d.indexOf('height: 160px') !== -1,
            'десктоп 160px (как было)');
    });
});

// ==========================================================================
// 4. SW — версия кэша и комментарий задачи
describe('Task 474 — SW: версия кэша', () => {
    test("CACHE_VERSION = kipia-test-v759", () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v759';") !== -1,
            'текущая версия v698');
    });

    test('версия до партии (v697) отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v697') === -1,
            'в sw.js не осталось kipia-test-v697');
    });

    test('v699 в sw.js отсутствует (лишний инкремент не сделан)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v760') === -1,
            'версия после Task 474 не существует');
    });

    test('комментарий Task 474 о составе правок в sw.js', () => {
        assertTrue(SW_SRC.indexOf('Task 474') !== -1, 'маркер задачи');
        assertTrue(SW_SRC.indexOf('карточк') !== -1,
            'упоминание карточки прибора');
        assertTrue(SW_SRC.indexOf('18px') !== -1 || SW_SRC.indexOf('полтора') !== -1,
            'упоминание размера Типа');
    });

    test('комментарий Task 474 рядом с версией (окно 600)', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v759';");
        // Task 496: комментарий ППР-клавиатуры (~254 симв.) — якорь
        // 474@9239 — окно 9000 → 9700 (запас 461).
        // Task 502: окно 11200 → 12000 (якорь 11493); 471 12400 → 13000 (12415); 461 15000 → 15400 (14977).
        const ctx = SW_SRC.slice(Math.max(0, i - 13300), i);
        // Task 478: окна 1700 → 2500 (Task 474 ~1878), 2700 → 3400
        // (Task 471 ~2800), 5300 → 6000 (Task 461 ~5362) — комментарий
        // ППР-индикации карточки прибора (~340 симв.).
        // Task 481: окна 2500 → 3100 (Task 474 ~2638), 3400 → 4200
        // (Task 471 ~3560), 6000 → 6800 (Task 461 ~6122) — комментарий
        // «ТО = только год даты ремонта» (~258 симв.).
        assertTrue(ctx.indexOf('Task 474') !== -1,
            'комментарий задачи в шапке версий');
    });

    test('окна истории версий: Task 471 (2100) и Task 461 (4600) — якоря', () => {
        // Значения окон живут в test-task471/472/461; здесь контроль
        // дистанций в самом sw.js (после вставки комментария Task 474).
        // Task 475: окна 1300 → 2100 и 3800 → 4600 — комментарий этапа 1
        // оптимизации (~9 строк) отодвинул якоря (Task 471 ~1738,
        // Task 476: окна расширены (+~490 симв. этапа 2):
        // Task 471 2100 → 2700 (~2170), Task 461 4600 → 5300 (~4732).
        // Task 461 ~4300).
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v759';");
        const i471 = SW_SRC.lastIndexOf('Task 471', i);
        const i461 = SW_SRC.lastIndexOf('Task 461', i);
        // Task 492: якорь 471@9279 — окно 9000 → 9800.
        assertTrue(i471 !== -1 && (i - i471) < 14300,
            'Task 471 в пределах окна 2100');
        // Task 492: якорь 461@11841 — окно 11600 → 12400.
        assertTrue(i461 !== -1 && (i - i461) < 16700,
            'Task 461 в пределах окна 4600');
        // Task 483: комментарий ~378 симв. отодвинул якоря — окна
        // расширены scripts/task483-windows.py (4200→4600/6800→7200).
        // Task 484: комментарий ~390 симв. — 4600→5000/7200→7600
        // (scripts/task484-windows.py).
    });
});

console.log('test-task474: все describes зарегистрированы');
