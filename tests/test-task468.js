// tests/test-task468.js
// Task 468 — заявка пользователя: «Ширину столбца "Мероприятия"
// сделай по самому длинному тексту, всю таблицу — влево экрана,
// а справа от таблицы на всё оставшееся место размести окно
// с Описанием раздела и его функционала.»
//
// КОНТЕКСТ: раздел «Плановые мероприятия» (Task 460 — таблица
// по образцу «Пример таблицы мероприятий.xlsx», Task 463 — отметки
// выполнения, Task 464 — ширина колонки по тексту + мобильный
// вид). ДО Task 468: .pe-card { margin: 0 12px } + .pe-table
// { min-width: 100% } растягивали auto-колонку «Мероприятия» на
// свободную ширину карточки — таблица «плавала» по ширине окна.
// РЕШЕНИЕ (всё в index.html, клиент-only):
//   1) внешний отступ перенесён с .pe-card на НОВЫЙ .pe-layout
//      (flex-строка: карточка таблицы + окно описания);
//   2) .pe-table { min-width: 100% } УДАЛЕНО — ширина строго
//      width: max-content (столбец по самому длинному тексту);
//   3) .pe-layout .pe-card { flex: 0 0 auto } — карточка слева
//      никогда не сжимается (столбец не раздувается/не переносится);
//   4) НОВОЕ окно .pe-desc-card { flex: 1 1 280px } справа — на всё
//      оставшееся место (описание раздела + функционал Task 460/
//      463/464); @media < 1200px раскладка складывается в колонку
//      (описание ПОД таблицей), мобильный вид Task 464 (@1023px)
//      не тронут.
//   SW: kipia-test-v746.
//
// Запуск: через tests/run-all.js (require './test-task468.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function ruleBlock(sel) {
    const i = INDEX_SRC.indexOf(sel);
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('}', i);
    return (j === -1) ? null : INDEX_SRC.slice(i, j + 1);
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// ============================================================
// 1. SRC — CSS: .pe-layout — flex-строка раскладки
// ============================================================
describe('Task 468 — SRC: CSS — раскладка .pe-layout', () => {

    test('правило .pe-layout { display: flex; gap: 12px }', () => {
        const b = ruleBlock('.pe-layout {');
        assertTrue(b !== null && /display:\s*flex/.test(b),
            'flex-строка: карточка таблицы + окно описания');
        assertTrue(b !== null && /gap:\s*12px/.test(b),
            'зазор между таблицей и описанием');
    });

    test('внешний отступ перенесён с .pe-card на .pe-layout', () => {
        const lay = ruleBlock('.pe-layout {');
        assertTrue(lay !== null && /margin:\s*0 12px/.test(lay),
            '.pe-layout держит отступ 0 12px (был у .pe-card)');
        const card = ruleBlock('.pe-card {');
        assertTrue(card !== null && /margin:\s*0;/.test(card),
            '.pe-card больше не создаёт внешний отступ');
    });

    test('маркер Task 468 в комментарии над .pe-layout', () => {
        const i = INDEX_SRC.indexOf('.pe-layout {');
        const ctx = INDEX_SRC.slice(Math.max(0, i - 1200), i);
        assertTrue(ctx.indexOf('Task 468') !== -1,
            'комментарий о раскладке раздела');
    });
});

// ============================================================
// 2. SRC — CSS: карточка слева не сжимается, таблица по тексту
// ============================================================
describe('Task 468 — SRC: CSS — карточка таблицы по контенту', () => {

    test('.pe-layout .pe-card { flex: 0 0 auto } — таблица влево', () => {
        const b = ruleBlock('.pe-layout .pe-card {');
        assertTrue(b !== null && /flex:\s*0 0 auto/.test(b),
            'карточка не тянется и не сжимается — прижата влево экрана');
    });

    test('.pe-table: min-width: 100% УДАЛЕН (ширина строго по контенту)', () => {
        const b = stripComments(ruleBlock('.pe-table {'));
        assertTrue(b !== null && /width:\s*max-content/.test(b),
            'width: max-content жив (Task 464)');
        assertTrue(b === null || !/min-width/.test(b),
            'min-width больше НЕ растягивает auto-колонку (ядро заявки; '
            + 'в комментарии над правилом упоминание «прежнее min-width: 100%» '
            + '— история, не свойство)');
    });

    test('Task 464 (колонка по тексту) не тронут: pe-col-name auto, месяцы 46px', () => {
        const n = ruleBlock('.pe-col-name {');
        assertTrue(n !== null && /width:\s*auto/.test(n),
            'колонка наименований по тексту');
        const m = ruleBlock('.pe-col-month {');
        assertTrue(m !== null && /width:\s*46px/.test(m),
            'месяцы — узкие 46px');
    });

    test('десктопный nowrap наименований жив (перенос только на мобайле)', () => {
        const i = INDEX_SRC.indexOf('.pe-name, .pe-th-name { white-space: nowrap; }');
        assertTrue(i !== -1, 'nowrap жив');
    });
});

// ============================================================
// 3. SRC — CSS: окно «Описание раздела» справа
// ============================================================
describe('Task 468 — SRC: CSS — окно .pe-desc-card', () => {

    test('правило .pe-desc-card { flex: 1 1 280px } — на всё остаточное место', () => {
        const b = ruleBlock('.pe-desc-card {');
        assertTrue(b !== null && /flex:\s*1 1 280px/.test(b),
            'окно описания забирает свободную ширину справа от таблицы');
        assertTrue(b !== null && /border-radius:\s*12px/.test(b) &&
            /border:\s*1px solid/.test(b),
            'рамка «окна» как у карточки раздела');
    });

    test('типографика окна: .pe-desc-title / .pe-desc-lead / .pe-desc-sub / .pe-desc-list', () => {
        ['.pe-desc-title {', '.pe-desc-lead {', '.pe-desc-sub {', '.pe-desc-list {']
            .forEach(function(sel) {
                assertTrue(INDEX_SRC.indexOf(sel) !== -1,
                    'правило ' + sel + ' живо');
            });
        const t = ruleBlock('.pe-desc-title {');
        assertTrue(t !== null && /font-weight:\s*700/.test(t), 'заголовок жирный');
        const l = ruleBlock('.pe-desc-list {');
        assertTrue(l !== null && /display:\s*grid/.test(l), 'список — грид с зазором');
    });

    test('светлая тема окна описания', () => {
        const a = ruleBlock('[data-theme="light"] .pe-desc-lead {');
        const b = ruleBlock('[data-theme="light"] .pe-desc-sub {');
        assertTrue(a !== null && b !== null,
            'обе правки светлой темы живы');
    });

    test('@media (max-width: 1199px): описание ПОД таблицей', () => {
        const i = INDEX_SRC.indexOf('@media (max-width: 1199px)');
        assertTrue(i !== -1, 'медиа-запрос узкого экрана есть');
        const ctx = INDEX_SRC.slice(i, i + 400);
        assertTrue(/\.pe-layout\s*\{\s*flex-direction:\s*column/.test(ctx),
            'раскладка складывается в колонку');
    });
});

// ============================================================
// 4. SRC — HTML: таблица слева, описание справа
// ============================================================
describe('Task 468 — SRC: HTML — структура раскладки', () => {

    test('.pe-body > .pe-layout > [.pe-card + aside.pe-desc-card]', () => {
        const i = INDEX_SRC.indexOf('<div class="pe-layout">');
        assertTrue(i !== -1, 'контейнер раскладки есть');
        const card = INDEX_SRC.indexOf('<div class="pe-card">', i);
        const desc = INDEX_SRC.indexOf('<aside class="pe-desc-card"', i);
        const end = INDEX_SRC.indexOf('</div>', INDEX_SRC.indexOf('</aside>', i));
        assertTrue(card > i && desc > card, 'карточка таблицы ПЕРВЫЙ ребёнок (слева), окно описания — ВТОРОЙ (справа)');
        const table = INDEX_SRC.indexOf('<table class="pe-table"', card);
        assertTrue(table > card && table < desc, 'таблица внутри карточки');
    });

    test('aside с aria-label «Описание раздела»', () => {
        const i = INDEX_SRC.indexOf('<aside class="pe-desc-card" aria-label="Описание раздела">');
        assertTrue(i !== -1, 'семантичный aside с доступным именем');
    });

    test('содержание окна: заголовок, вводный абзац, «Функционал», пункты списка', () => {
        const i = INDEX_SRC.indexOf('<aside class="pe-desc-card"');
        const j = INDEX_SRC.indexOf('</aside>', i);
        const html = INDEX_SRC.slice(i, j);
        assertTrue(html.indexOf('pe-desc-title') !== -1 &&
            html.indexOf('Описание раздела') !== -1, 'заголовок окна');
        assertTrue(html.indexOf('pe-desc-lead') !== -1, 'вводный абзац');
        assertTrue(html.indexOf('pe-desc-sub') !== -1 &&
            html.indexOf('Функционал') !== -1, 'подзаголовок «Функционал»');
        // Task 469: описание переписано по заявке — пункт
        // «Мобильная версия» убран, стало 4 пункта
        assertTrue((html.match(/<li>/g) || []).length === 4,
            'четыре пункта функционала (Task 469: 5 → 4)');
    });

    test('описание отражает фактический функционал (Task 463/464)', () => {
        const i = INDEX_SRC.indexOf('<aside class="pe-desc-card"');
        const html = INDEX_SRC.slice(i, INDEX_SRC.indexOf('</aside>', i));
        assertTrue(html.indexOf('Отметка выполнения') !== -1, 'отметки 463');
        assertTrue(html.indexOf('Изменение отметки') !== -1, 'правка отметки 464');
        // Task 469: упоминания образца-файла и мобильного вида
        // из описания убраны (заявка на сокращённый текст) —
        // текст переписан, ассерты под новое содержание сняты
    });
});

// ============================================================
// 5. SRC — изоляция: мобильный вид Task 464 и JS не тронуты
// ============================================================
describe('Task 468 — SRC: мобильный вид Task 464 не тронут', () => {

    test('@media 1023px: полоса месяца, скрытие месяцев, таблица 100%', () => {
        // ищем @media 1023px именно раздела pe-*: отталкиваемся от
        // правила .pe-month-bar { display: flex; } и проверяем заголовок
        // медиа-запроса над ним (в файле есть РАННИЕ @media 1023px
        // других разделов — первый indexOf попал бы не туда)
        const bar = INDEX_SRC.indexOf('.pe-month-bar { display: flex; }');
        assertTrue(bar !== -1, 'полоса выбора месяца жива');
        const head = INDEX_SRC.slice(Math.max(0, bar - 300), bar);
        assertTrue(/@media\s*\(max-width:\s*1023px\)/.test(head),
            'правило внутри @media 1023px (мобильный вид Task 464)');
        const ctx = INDEX_SRC.slice(bar, bar + 900);
        assertTrue(/\.pe-table\s*\{\s*width:\s*100%/.test(ctx),
            'таблица на всю ширину на мобайле (Task 464)');
        assertTrue(/white-space:\s*normal/.test(ctx),
            'перенос наименований на мобайле жив');
    });

    test('JS отметок/обновления не тронут (PlanEventsData/peMonthSel)', () => {
        assertTrue(INDEX_SRC.indexOf('peMonthSel') !== -1,
            'селектор месяца жив');
        assertTrue(INDEX_SRC.indexOf('PlanEventsData.refresh()') !== -1,
            'кнопка «Обновить» (Task 463) жива');
        assertTrue(INDEX_SRC.indexOf('peTable') !== -1,
            'таблица с id=peTable жива');
    });

    test('классы pe-desc-* не утекли в другие разделы', () => {
        // HTML-часть = после </head> (простой indexOf('<body') ЛОВИТ
        // подстроку '<body' внутри JS-шаблонов standalone-документов
        // печати — slice начинался бы слишком рано)
        const htmlStart = INDEX_SRC.indexOf('</head>');
        const html = INDEX_SRC.slice(htmlStart);
        assertTrue((html.match(/pe-desc-card/g) || []).length === 1,
            'окно описания ровно одно — только в «Плановых мероприятиях»');
    });
});

// ============================================================
// 6. SW: версия кэша
// ============================================================
describe('Task 468 — SW: версия кэша', () => {

    test('CACHE_VERSION = kipia-test-v746', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v746';") !== -1,
            'инкремент Task 468: v691 → v692');
    });

    test('v691 в sw.js отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v691') === -1,
            'версии до Task 468 нет');
    });

    test('комментарий Task 468 о раскладке раздела', () => {
        assertTrue(SW_SRC.indexOf('Task 468') !== -1, 'маркер задачи');
        assertTrue(SW_SRC.indexOf('pe-desc-card') !== -1 &&
            SW_SRC.indexOf('Плановые мероприятия') !== -1,
            'описание раскладки с классами');
    });
});
