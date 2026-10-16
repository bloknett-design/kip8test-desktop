// tests/test-task525.js
// Task 525: «В разделе библиотека/электробезопасность, на кнопке
// инструкции СО 153-34.03.603-2003 укажи дополнительную информацию
// о том, что данная инструкция отменена, с названием документа
// отмены.»
//
// ЧТО ПРОВЕРЯЕТСЯ (тремя слоями):
//   Слой 1 — SRC HTML (index.html, раздел #page-library-electro):
//     на кнопке инструкции СО 153-34.03.603-2003 появилась третья
//     строка .menu-btn-cancelled «Отменена — приказ Минэнерго России
//     от 01.12.2023 № 1105» (документ отмены: приказ Минэнерго
//     России от 01.12.2023 № 1105 «Об отмене приказа Минэнерго
//     России от 30.06.2003 № 261»); label/sublabel/ссылка Google
//     Drive НЕ тронуты; .menu-btn-cancelled — РОВНО ОДНА во всём
//     документе (только отменённый документ); соседи по разделу
//     (ПУЭ, ПТЭЭП, ПОТЭЭ, Дополнительно) без статуса отмены;
//     маркер Task 525 в комментарии блока кнопки.
//   Слой 2 — SRC CSS (index.html): .menu-btn-cancelled — красный
//     #ef5350 (тёмная тема) / #c62828 (светлая, канон «плохих» дат
//     Task 520 .ws-ep-date-bad); кегль/межстрочный как у sublabel;
//     правило глобальное — работает и в мобильной (строка), и в
//     десктопной (колонка, 3-grid) вёрстке Библиотеки.
//   Слой 3 — СТРУКТУРА кнопки: порядок детей .menu-btn-text —
//     label → sublabel → cancelled; строка отмены внутри того же
//     <a>, что и «Инструкция СО 153-34.03.603-2003» (не в чужой
//     кнопке); блок <a> валиден (закрыт).
//   SW: kipia-test-v749.
//
// Запуск: через tests/run-all.js (require './test-task525.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ============================================================
// Утилиты: вырезка блока <a …> … </a> вокруг маркера
// ============================================================

// Вырезает ПЕРВЫЙ блок <a ...>...</a>, содержащий подстроку marker.
// Возвращает null, если маркер не найден.
function anchorBlock(marker) {
    const i = INDEX_SRC.indexOf(marker);
    if (i === -1) return null;
    const start = INDEX_SRC.lastIndexOf('<a ', i);
    const end = INDEX_SRC.indexOf('</a>', i);
    if (start === -1 || end === -1) return null;
    return INDEX_SRC.slice(start, end + 4);
}

// Вырезает секцию страницы по id (div … закрывающий на том же
// уровне не ищем примитивно — секция короткая, ищем следующий
// закрывающий комментарий-заголовок раздела).
function sectionBlock(pageId, nextMarker) {
    const i = INDEX_SRC.indexOf('id="' + pageId + '"');
    if (i === -1) return null;
    const j = nextMarker ? INDEX_SRC.indexOf(nextMarker, i) : INDEX_SRC.length;
    return INDEX_SRC.slice(i, j === -1 ? INDEX_SRC.length : j);
}

const LABEL_SO = 'Инструкция СО 153-34.03.603-2003';
const SUB_SO = 'Применение и испытание средств защиты, используемых в электроустановках';
const LINK_SO = 'https://drive.google.com/file/d/1Q8kne-DyfxkkPZp0uxROAm6BC9rPZeq4/view';
const CANCELLED_CLASS = 'menu-btn-cancelled';
const CANCELLED_TEXT = 'Отменена — приказ Минэнерго России от 01.12.2023 № 1105';

const SO_ANCHOR = anchorBlock(LABEL_SO);
const ELECTRO_SECTION = sectionBlock('page-library-electro',
    '======================== ЭКЗАМЕНАЦИОННЫЕ БИЛЕТЫ');

// ============================================================
// 1. SRC — HTML кнопки СО 153-34.03.603-2003
// ============================================================
describe('Task 525 — SRC: HTML кнопки СО 153-34.03.603-2003', () => {

    test('кнопка раздела найдена (якорь с label СО 153)', () => {
        assertTrue(SO_ANCHOR, 'блок <a> с «' + LABEL_SO + '» существует');
        assertTrue(ELECTRO_SECTION, 'секция #page-library-electro найдена');
    });

    test('строка статуса «Отменена …» на кнопке — точный текст', () => {
        assertTrue(SO_ANCHOR.indexOf('<div class="' + CANCELLED_CLASS + '">') !== -1,
            'div.' + CANCELLED_CLASS + ' внутри кнопки');
        const m = SO_ANCHOR.match(new RegExp('<div class="' + CANCELLED_CLASS + '">(.*?)</div>'));
        assertTrue(m, 'текст строки извлекается');
        assertEqual(m[1], CANCELLED_TEXT, 'точная формулировка Task 525');
    });

    test('в тексте отмены — статус + документ отмены целиком', () => {
        assertTrue(CANCELLED_TEXT.indexOf('Отменена') !== -1,
            'статус «Отменена»');
        assertTrue(CANCELLED_TEXT.indexOf('приказ Минэнерго России') !== -1,
            'вид документа и ведомство');
        assertTrue(CANCELLED_TEXT.indexOf('от 01.12.2023') !== -1,
            'дата приказа');
        assertTrue(CANCELLED_TEXT.indexOf('№ 1105') !== -1,
            'номер приказа (отмена СО 153-34.03.603-2003 с 01.12.2023)');
    });

    test('label и sublabel кнопки НЕ тронуты', () => {
        assertTrue(SO_ANCHOR.indexOf('<div class="menu-btn-label">' + LABEL_SO + '</div>') !== -1,
            'label прежний');
        assertTrue(SO_ANCHOR.indexOf('<div class="menu-btn-sublabel">' + SUB_SO + '</div>') !== -1,
            'sublabel прежний');
    });

    test('ссылка Google Drive сохранена (документ — для ознакомления)', () => {
        assertTrue(SO_ANCHOR.indexOf('href="' + LINK_SO + '"') !== -1,
            'href прежний');
        assertTrue(SO_ANCHOR.indexOf('target="_blank"') !== -1,
            'открытие в новой вкладке');
        assertTrue(SO_ANCHOR.indexOf('rel="noopener"') !== -1,
            'noopener');
    });

    test('маркер Task 525 в комментарии блока кнопки', () => {
        const i = INDEX_SRC.indexOf('class="' + CANCELLED_CLASS + '"');
        const head = INDEX_SRC.slice(Math.max(0, i - 700), i);
        assertTrue(head.indexOf('Task 525') !== -1,
            'комментарий Task 525 над строкой отмены');
        assertTrue(head.indexOf('№ 1105') !== -1,
            'документ отмены процитирован в комментарии');
    });
});

// ============================================================
// 2. SRC — уникальность статуса и соседние кнопки
// ============================================================
describe('Task 525 — SRC: уникальность статуса и соседи', () => {

    test('.menu-btn-cancelled — РОВНО ОДИН во всём документе', () => {
        const n = (INDEX_SRC.match(new RegExp('class="' + CANCELLED_CLASS + '"', 'g')) || []).length;
        assertEqual(n, 1, 'статус только у отменённого документа');
    });

    test('строка отмены — ВНУТРИ раздела Электробезопасность', () => {
        assertTrue(ELECTRO_SECTION.indexOf('class="' + CANCELLED_CLASS + '"') !== -1,
            '.menu-btn-cancelled в #page-library-electro');
    });

    test('соседние кнопки раздела — БЕЗ статуса отмены', () => {
        ['ПУЭ 6 и 7', 'ПТЭЭП 2003', 'ПОТЭЭ 2022', 'Дополнительно'].forEach(function(label) {
            const a = anchorBlock('<div class="menu-btn-label">' + label + '</div>');
            assertTrue(a, 'кнопка «' + label + '» найдена');
            assertFalse(a.indexOf(CANCELLED_CLASS) !== -1,
                '«' + label + '» — без строки отмены');
        });
    });

    test('строка отмены не «расползлась» в другие разделы (кнопка библиотеки КИП и А)', () => {
        // Библиотека КИП и А — соседний раздел; проверяем что его кнопки чисты
        const internal = sectionBlock('page-library-internal', 'page-library-electro');
        assertTrue(internal, 'секция #page-library-internal найдена');
        assertFalse(internal.indexOf('class="' + CANCELLED_CLASS + '"') !== -1,
            'в библиотеке КИП и А строки отмены нет');
    });
});

// ============================================================
// 3. SRC — CSS обеих тем
// ============================================================
describe('Task 525 — SRC: CSS строки «Отменена»', () => {

    test('базовое правило .menu-btn-cancelled (тёмная тема)', () => {
        const m = INDEX_SRC.match(/\.menu-btn-cancelled\s*\{[^}]*\}/);
        assertTrue(m, 'правило .menu-btn-cancelled существует');
        assertTrue(/color:\s*#ef5350/.test(m[0]),
            'красный #ef5350 — канон «плохих» дат Task 520 (тёмная)');
        assertTrue(/font-weight:\s*600/.test(m[0]),
            'полужирная — заметность статуса');
        assertTrue(/font-size:\s*13px/.test(m[0]),
            'кегль 13px — чуть меньше sublabel (14px)');
        assertTrue(/line-height:\s*1\.3/.test(m[0]),
            'межстрочный — как у sublabel');
        assertTrue(/margin-top:\s*4px/.test(m[0]),
            'отбивка от подписи сверху');
    });

    test('светлая тема — [data-theme="light"] переопределение', () => {
        const m = INDEX_SRC.match(/\[data-theme="light"\]\s*\.menu-btn-cancelled\s*\{[^}]*\}/);
        assertTrue(m, 'переопределение для светлой темы существует');
        assertTrue(/color:\s*#c62828/.test(m[0]),
            'красный #c62828 — канон Task 520 (светлая)');
    });

    test('правило в глобальном блоке стилей (мобильная строка + десктоп-колонка)', () => {
        // Правило должно стоять рядом с .menu-btn-sublabel (базовый блок),
        // а не внутри медиа-запроса — иначе одна из вёрсток потеряет цвет
        const i = INDEX_SRC.indexOf('.menu-btn-cancelled {');
        const s = INDEX_SRC.indexOf('.menu-btn-sublabel {');
        assertTrue(i !== -1 && s !== -1, 'оба правила найдены');
        assertTrue(Math.abs(i - s) < 900,
            'правило рядом с .menu-btn-sublabel (базовый блок, вне @media)');
        // Убедимся, что перед правилом нет активного @media-обёртки:
        // последний @media выше должен закрываться до правила
        const before = INDEX_SRC.slice(0, i);
        const lastOpen = before.lastIndexOf('@media');
        const afterLastOpen = before.slice(lastOpen);
        const closed = (afterLastOpen.match(/\{/g) || []).length === (afterLastOpen.match(/\}/g) || []).length;
        assertTrue(closed, 'правило НЕ внутри @media — работает во всех вёрстках');
    });

    test('цвет согласован с каноном .ws-ep-date-bad (Task 520)', () => {
        assertTrue(/\.ws-ep-date\.ws-ep-date-bad\s*\{\s*color:\s*#ef5350/.test(INDEX_SRC),
            'тёмная: тот же #ef5350, что у просроченных дат');
        assertTrue(/\[data-theme="light"\]\s*\.ws-ep-date\.ws-ep-date-bad\s*\{\s*color:\s*#c62828/.test(INDEX_SRC),
            'светлая: тот же #c62828');
    });
});

// ============================================================
// 4. СТРУКТУРА — порядок детей кнопки и валидность блока
// ============================================================
describe('Task 525 — структура кнопки', () => {

    test('порядок детей .menu-btn-text: label → sublabel → cancelled', () => {
        const text = SO_ANCHOR.match(/<div class="menu-btn-text">([\s\S]*?)<\/div>\s*<svg/);
        assertTrue(text, 'блок .menu-btn-text выделяется');
        const iL = text[1].indexOf('menu-btn-label');
        const iS = text[1].indexOf('menu-btn-sublabel');
        const iC = text[1].indexOf(CANCELLED_CLASS);
        assertTrue(iL !== -1 && iS !== -1 && iC !== -1, 'все три строки на месте');
        assertTrue(iL < iS && iS < iC, 'строка отмены — ПОД подписью (третья)');
    });

    test('строка отмены внутри того же <a>, что и label СО 153', () => {
        // anchorBlock вырезает <a> вокруг label — наличие класса уже это
        // доказывает; дополнительно: между label и cancelled нет </a>
        const iL = SO_ANCHOR.indexOf(LABEL_SO);
        const iC = SO_ANCHOR.indexOf(CANCELLED_CLASS);
        const between = SO_ANCHOR.slice(iL, iC);
        assertFalse(between.indexOf('</a>') !== -1,
            'label и строка отмены — в одном якоре (без закрытия между)');
    });

    test('блок <a> закрыт, строка отмены — до </a>', () => {
        assertTrue(SO_ANCHOR.lastIndexOf('</a>') === SO_ANCHOR.length - 4,
            'блок заканчивается </a>');
        assertTrue(SO_ANCHOR.indexOf(CANCELLED_TEXT) < SO_ANCHOR.indexOf('</a>'),
            'строка отмены внутри якоря');
    });
});

// ============================================================
// 5. SW — версия кэша бампнута (index.html менялся)
// ============================================================
describe('Task 525 — SW: версия кэша', () => {

    test('sw.js: CACHE_VERSION = kipia-test-v749', () => {
        const m = SW_SRC.match(/const CACHE_VERSION = '([^']+)'/);
        assertTrue(m, 'CACHE_VERSION найден');
        assertEqual(m[1], 'kipia-test-v749',
            'версия бампнута v737 → v738 (правка index.html)');
    });

    test('guard: версия ушла вперёд от v737 (нет двойного бампа)', () => {
        const m = SW_SRC.match(/const CACHE_VERSION = '([^']+)'/);
        assertTrue(m[1] !== 'kipia-test-v737',
            'v737 — прошлый шаг Task 524, не должен остаться');
    });
});
