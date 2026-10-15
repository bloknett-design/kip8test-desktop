// tests/test-task330.js
// Task 330 — заявка пользователя:
//   «Фон шапки шахматки табеля с кнопкой "Сотрудник +" и днями недель
//    сделай темнее, ближе к сине-серому цвету. В окне выбора кодов
//    ячеек, шрифт текста описания кодов сделай маленьким. В светлой
//    теме, весь текст в окнах мероприятий и норм времени, в баре
//    табеля, должен быть чёрным цветом.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   CSS шапка: .ws-grid thead th — ТЁМНЫЙ СИНЕ-СЕРЫЙ #1e293b (вместо
//     var(--bg-tertiary, #0e1621) — почти чёрной «морской» синевы);
//     hover заголовка «Сотрудник +» — #2a3a4c (светлее новой шапки);
//     светлая тема — ОТДЕЛЬНОЕ правило [data-theme="light"] .ws-grid
//     thead th { background: #bfcad5 } (шапка ТЕМНЕЕ прежней почти
//     белой 240,240,240), групповое правило больше шапку НЕ красит
//     (селекты/колонка ФИО остаются 240,240,240).
//   CSS попап кодов: #wsCellPopup .ws-popup-name — font-size 10px
//     (маленький, прежде 12px); окно «Мероприятия в этот день» и
//     карточка — НЕ тронуты (правило только под #wsCellPopup).
//   CSS светлая тема, окна бара: ВЕСЬ текст ЧЁРНЫЙ #000 — .ws-ep-cap
//     (заголовок мероприятий), .ws-ep-item/.ws-ep-text/.ws-ep-date,
//     «нет мероприятий» (#wsEventsPanel .ws-cp-empty), .ws-cp-col,
//     .ws-cp-item b, .ws-cp-empty/.ws-cp-legend, плашки .ws-cp-norms/
//     .ws-cp-days > .ws-cp-cap, бейдж «предварительно» (.ws-cal-prelim
//     — позднее правило), чипы дней .ws-cp-day (правило ПОСЛЕ
//     .ws-cp-day.k-* — побеждает по порядку исходника); цветные
//     фоны плашек/чипов СОХРАНЕНЫ (смысловые подложки).
//   SW: kipia-test-v741.
//
// Запуск: через tests/run-all.js (require './test-task330.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function ruleBlock(cssPart) {
    // ищем ПЕРВОЕ самостоятельное правило (перевод строки + отступ 4 —
    // чтобы не зацепить #page-work-schedule.ws-tt-gridwide .ws-grid thead th
    // и прочие ПРЕФИКСНЫЕ варианты селектора)
    const needle = '\n    ' + cssPart;
    const i = INDEX_SRC.indexOf(needle);
    if (i === -1) return '';
    const rest = INDEX_SRC.slice(i + 1);
    const m = rest.match(/\n    \}/);
    return m ? rest.slice(0, m.index) : '';
}

// ============================================================
// 1. Шапка шахматки — сине-серый фон (обе темы)
// ============================================================
describe('Task 330 — шапка: тёмный сине-серый фон', () => {

    test('тёмная тема: .ws-grid thead th — background: #1e293b', () => {
        const block = ruleBlock('.ws-grid thead th {');
        assertTrue(block.length > 0, 'правило .ws-grid thead th найдено');
        assertTrue(/background:\s*#1e293b/.test(block),
            'фон шапки — сине-серый сланец #1e293b');
        assertFalse(/background:\s*var\(--bg-tertiary,\s*#0e1621\)/.test(block),
            'прежний почти чёрный фон var(--bg-tertiary) убран из шапки');
    });

    test('тёмная тема: hover-правило заголовка удалено (Task 386)', () => {
        // Task 386: заголовок — надпись; hover #2a3a4c из Task 330
        // удалён вместе с кнопкой
        const block = ruleBlock('.ws-grid thead th.ws-emp-col.ws-emp-head-add:hover {');
        assertEqual(block.length, 0, 'правило hover удалено (заголовок-надпись)');
    });

    test('светлая тема: ОТДЕЛЬНОЕ правило шапки — #bfcad5 (темнее)', () => {
        const block = ruleBlock('[data-theme="light"] .ws-grid thead th {');
        assertTrue(block.length > 0,
            'правило [data-theme="light"] .ws-grid thead th найдено');
        assertTrue(/background:\s*#bfcad5/.test(block),
            'светлая шапка — сине-серый #bfcad5 (заявка: темнее)');
        assertTrue(/color:\s*#333/.test(block),
            'текст шапки остаётся тёмным #333');
    });

    test('светлая тема: групповое правило БЕЗ шапки (слияние устранено)', () => {
        const i = INDEX_SRC.indexOf('[data-theme="light"] .ws-month-sel,');
        assertTrue(i !== -1, 'групповое правило светлой темы найдено');
        const chunk = INDEX_SRC.slice(i, i + 400);
        assertFalse(chunk.indexOf('.ws-grid thead th') !== -1,
            'шапка исключена из группы почти-белого фона 240,240,240');
        assertTrue(chunk.indexOf('tbody td.ws-emp-col') !== -1,
            'селекты и колонка ФИО остаются в группе (не тронуты)');
    });

    test('подсветки столбцов шапки — градиенты ПОВЕРХ нового фона', () => {
        // Task 313/316: today/hover/sel — background-image (не background),
        // они по-прежнему ложатся поверх background-color шапки
        const t = ruleBlock('[data-theme="light"] .ws-grid thead th.ws-day-col.ws-today-col {');
        assertTrue(/background-image:\s*linear-gradient/.test(t),
            'today-градиент — background-image (не затёрт)');
        const h = ruleBlock('.ws-grid thead th.ws-day-col.ws-hover-col {') ||
                  ruleBlock('#page-work-schedule .ws-grid thead th.ws-day-col.ws-hover-col {');
        assertTrue(/background-image/.test(h) || h.length === 0,
            'hover-градиент столбца — background-image (не затёрт)');
    });
});

// ============================================================
// 2. Окно выбора кодов — маленький шрифт описаний
// ============================================================
describe('Task 330 — окно кодов: маленький шрифт описаний', () => {

    test('#wsCellPopup .ws-popup-name — font-size: 10px', () => {
        const block = ruleBlock('#wsCellPopup .ws-popup-name {');
        assertTrue(block.length > 0, 'правило найдено');
        assertTrue(/font-size:\s*10px/.test(block),
            'шрифт описаний — маленький 10px (заявка)');
        assertFalse(/font-size:\s*12px/.test(block),
            'прежде 12px — больше не в этом правиле');
        assertTrue(/white-space:\s*normal/.test(block),
            'перенос строк описаний (Task 319) сохранён');
    });

    test('только окно кодов: прочие .ws-popup-name НЕ уменьшены', () => {
        // окно «Мероприятия в этот день» (#wsEventsPopup) и карточка
        // сотрудника используют базовый .ws-popup-name — правило 10px
        // scoped только под #wsCellPopup
        const block = ruleBlock('#wsCellPopup .ws-popup-name {');
        assertTrue(block.length > 0 && block.indexOf('#wsCellPopup') !== -1,
            'правило 10px — только в контексте #wsCellPopup');
    });
});

// ============================================================
// 3. Светлая тема — ВЕСЬ текст окон бара ЧЁРНЫЙ
// ============================================================
describe('Task 330 — светлая тема: чёрный текст окон бара', () => {

    test('окно мероприятий: заголовок/строки/даты/пусто — #000', () => {
        const cap = ruleBlock('[data-theme="light"] .ws-ep-cap {');
        assertTrue(/color:\s*#000/.test(cap), 'заголовок .ws-ep-cap — чёрный');
        assertTrue(/background:\s*rgba\(76,\s*199,\s*113/.test(cap),
            'зелёная подложка заголовка сохранена');

        const i = INDEX_SRC.indexOf('[data-theme="light"] .ws-ep-item { color:');
        assertTrue(i !== -1, 'правило .ws-ep-item найдено');
        assertTrue(INDEX_SRC.slice(i, i + 60).indexOf('#000') !== -1,
            'строки мероприятий — чёрные');

        const j = INDEX_SRC.indexOf('[data-theme="light"] .ws-ep-text,');
        const chunk = INDEX_SRC.slice(j, j + 200);
        assertTrue(/#000/.test(chunk), 'текст и даты мероприятий — чёрные');

        const e = ruleBlock('[data-theme="light"] #wsEventsPanel .ws-cp-empty {');
        assertTrue(/color:\s*#000/.test(e),
            '«нет мероприятий…» — чёрный (прежде #999)');
    });

    test('окно норм/праздников: столбики/пусто/легенда — #000', () => {
        const col = INDEX_SRC.indexOf('[data-theme="light"] .ws-cp-col { color:');
        assertTrue(INDEX_SRC.slice(col, col + 60).indexOf('#000') !== -1,
            '.ws-cp-col — чёрный (прежде #666)');
        const b = INDEX_SRC.indexOf('[data-theme="light"] .ws-cp-item b { color:');
        assertTrue(INDEX_SRC.slice(b, b + 60).indexOf('#000') !== -1,
            '.ws-cp-item b — чёрный (прежде #333)');
        const lg = INDEX_SRC.indexOf('[data-theme="light"] .ws-cp-empty,');
        assertTrue(INDEX_SRC.slice(lg, lg + 160).indexOf('#000') !== -1,
            '.ws-cp-empty/.ws-cp-legend — чёрные (прежде #999)');
    });

    test('плашки заголовков окна норм — чёрный текст, цветной фон', () => {
        const n = ruleBlock('[data-theme="light"] .ws-cp-norms > .ws-cp-cap {');
        assertTrue(/color:\s*#000/.test(n), '«Норма, месяц» — чёрный (прежде #1d5f96)');
        assertTrue(/background:\s*rgba\(74,\s*143,\s*199/.test(n),
            'синяя подложка плашки сохранена');
        const d = ruleBlock('[data-theme="light"] .ws-cp-days > .ws-cp-cap {');
        assertTrue(/color:\s*#000/.test(d), '«Праздники и переносы» — чёрный (прежде #b02c2c)');
        assertTrue(/background:\s*rgba\(255,\s*107,\s*107/.test(d),
            'красная подложка плашки сохранена');
    });

    test('бейдж «предварительно» — чёрный текст (позднее правило)', () => {
        // два [data-theme="light"] .ws-cal-prelim: первое (Task 264/266,
        // #a06b00) перекрыто ВТОРЫМ (Task 330, #000) — позднее в исходнике
        const first = INDEX_SRC.indexOf('[data-theme="light"] .ws-cal-prelim {');
        const second = INDEX_SRC.indexOf('[data-theme="light"] .ws-cal-prelim {', first + 10);
        assertTrue(second > first, 'правило-переопределение Task 330 существует');
        const block = INDEX_SRC.slice(second, second + 300);
        assertTrue(/color:\s*#000/.test(block),
            'бейдж «предварительно» — чёрный (прежде #a06b00)');
        assertTrue(/background:\s*rgba\(255,\s*160,\s*0/.test(block),
            'янтарная подложка бейджа сохранена');
    });

    test('чипы особых дней — чёрный текст, ПОСЛЕ правил k-*', () => {
        const dayRule = INDEX_SRC.indexOf('[data-theme="light"] .ws-cp-day {');
        assertTrue(dayRule !== -1, 'правило [data-theme="light"] .ws-cp-day есть');
        const block = INDEX_SRC.slice(dayRule, dayRule + 200);
        assertTrue(/color:\s*#000/.test(block),
            'текст чипов — чёрный (заявка: весь текст)');
        // правило должно идти ПОСЛЕ .ws-cp-day.k-hol и др. — та же
        // специфичность (0,2,0), побеждает позднее
        const kHol = INDEX_SRC.indexOf('.ws-cp-day.k-hol {');
        assertTrue(kHol !== -1 && dayRule > kHol,
            'правило Task 330 позже k-hol/k-reg/… — перекрашивает чипы');
        // цветные фоны чипов не тронуты
        assertTrue(INDEX_SRC.indexOf('.ws-cp-day.k-hol { background: rgba(255,107,107,0.16)') !== -1,
            'подложки чипов (k-hol и др.) сохранены');
    });

    test('тёмная тема окон бара — НЕ тронута (заявка только про светлую)', () => {
        const cap = ruleBlock('.ws-ep-cap {');
        assertTrue(/color:\s*#4ac771/.test(cap),
            'заголовок мероприятий в тёмной теме — прежний зелёный');
        const k = INDEX_SRC.indexOf('.ws-cp-day.k-hol {');
        assertTrue(INDEX_SRC.slice(k, k + 120).indexOf('#ff6b6b') !== -1,
            'чип k-hol в тёмной теме — прежний красный');
    });
});

// ============================================================
// 4. SW: версия кэша
// ============================================================
describe('Task 330 — SW: версия кэша', () => {

    test('SW: кэш поднят до kipia-test-v741 (Task 330)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v741') !== -1,
            'CACHE_VERSION = kipia-test-v741');
        assertFalse(SW_SRC.indexOf('kipia-test-v742') !== -1,
            'лишнего инкремента v570 нет');
    });
});
