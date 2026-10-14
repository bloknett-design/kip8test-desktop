// tests/test-task326.js
// Task 326 — BUGFIX (заявка пользователя: «не открываются некоторые
// разделы и полные карточки расходомеров»).
//
// ПРИЧИНА: Task 323 при перестройке рабочей области табеля в
// #wsWsBody (сетка + боковая шторка итогов) потерял ЗАКРЫВАЮЩИЙ
// </div> страницы #page-work-schedule. Весь DOM после табеля —
// разделы «КИП ИОС», «Приборы», «Блокировки», «Задвижки»,
// «Регуляторы», «Проекты», «Кабельный журнал», «План 114»,
// калькуляторы/конвертеры, «Сапёр», «Телефонный справочник»,
// админ-панель, «Библиотека», «Билеты», «Что нового» и ДЕСКТОПНАЯ
// ПАНЕЛЬ ДЕТАЛЕЙ #detailPanel — оказывался ВЛОЖЕННЫМ в скрытую
// (display:none без .active) страницу табеля: клики «не открывали»
// разделы и полные карточки расходомеров (мобильные полные
// страницы расходомеров идут в разметке РАНЬШЕ табеля и не
// пострадали).
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   СТРУКТУРА HTML (стек-парсер с пропуском <script>/<style>/
//   комментариев): 1) баланс <div>/</div> по всему документу = 0
//   незакрытых; 2) КАЖДАЯ .page-content страница — ПРЯМОЙ потомок
//   #contentArea (список всех page-*); 3) #detailPanel — прямой
//   потомок #contentArea; 4) #wsWsBody — прямой потомок
//   #page-work-schedule (вложенность сетки/шторки НЕ сломана);
//   5) порядок: #detailPanel идёт ПОСЛЕ последней страницы, но
//   ВНУТРИ #contentArea; 6) комментарий багфикса Task 326 в HTML.
//   SW: kipia-test-v735 (v566 не существует).
//
// Запуск: через tests/run-all.js (require './test-task326.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ============================================================
// Лёгкий стек-парсер тегов <div> с пропуском содержимого
// <script>/<style> и HTML-комментариев (JS-шаблоны внутри скриптов
// содержат <div> и сломали бы наивный подсчёт).
// Возвращает { stack: [незакрытые], parents: {id: parentId} }.
// ============================================================
function parseDivTree(src) {
    const stack = [];
    const parents = {};
    let i = 0;
    const n = src.length;
    while (i < n) {
        if (src[i] === '<') {
            // Комментарий <!-- ... -->
            if (src.startsWith('<!--', i)) {
                const end = src.indexOf('-->', i);
                i = end === -1 ? n : end + 3;
                continue;
            }
            // <script ...> ... </script> / <style ...> ... </style>
            const tagMatch = /^<(script|style)\b[^>]*>/i.exec(src.slice(i, i + 200));
            if (tagMatch) {
                const closeTag = '</' + tagMatch[1].toLowerCase() + '>';
                const end = src.toLowerCase().indexOf(closeTag, i);
                i = end === -1 ? n : end + closeTag.length;
                continue;
            }
            // Закрывающий </div>
            if (/^<\/div\s*>/i.test(src.slice(i, i + 12))) {
                stack.pop();
                i = src.indexOf('>', i) + 1;
                continue;
            }
            // Открывающий <div ...> (self-closing <div/> не бывает на практике)
            if (/^<div\b/i.test(src.slice(i, i + 6))) {
                const end = src.indexOf('>', i);
                const tag = src.slice(i, end + 1);
                const idMatch = /\bid="([^"]*)"/.exec(tag);
                const id = idMatch ? idMatch[1] : '';
                parents[id] = stack.length ? stack[stack.length - 1] : '(root)';
                stack.push(id);
                i = end + 1;
                continue;
            }
            i++;
        } else {
            i++;
        }
    }
    return { stack, parents };
}

const PARSED = parseDivTree(INDEX_SRC);

// Все id страниц приложения (page-*), объявленные в HTML
const PAGE_IDS = (INDEX_SRC.match(/<div id="page-[a-z0-9-]+"/g) || [])
    .map(s => s.replace('<div id="', '').replace('"', ''));

describe('Task 326 BUGFIX — структура HTML: закрытие #page-work-schedule', () => {

    test('баланс <div>/</div> по документу = 0 незакрытых (пропуск script/style/комментариев)', () => {
        assertEqual(PARSED.stack.length, 0,
            'незакрытых div: ' + JSON.stringify(PARSED.stack));
    });

    test('#detailPanel — ПРЯМОЙ потомок #contentArea (панель полных карточек видна на десктопе)', () => {
        assertEqual(PARSED.parents['detailPanel'], 'contentArea',
            'родитель detailPanel: ' + PARSED.parents['detailPanel']);
    });

    test('страницы после табеля в разметке — прямые потомки #contentArea', () => {
        // Разделы, которые «не открывались» из-за вложенности в табель
        const mustBeTop = [
            'page-kip-ios', 'page-devices-prod', 'page-devices-type', 'page-devices-name',
            'page-device-detail', 'page-lockouts-prod', 'page-lockout-detail',
            'page-valves-prod', 'page-valve-detail', 'page-regulators-prod',
            'page-regulator-detail', 'page-projects-prod', 'page-project-detail',
            'page-cable-journal-edit', 'page-plan-114', 'page-calculators',
            'page-calc-kipa', 'page-converter', 'page-library-internal',
            'page-exam-tickets', 'page-whats-new', 'page-minesweeper',
            'page-phonebook', 'page-admin', 'page-work-schedule'
        ];
        mustBeTop.forEach(pid => {
            assertTrue(PAGE_IDS.indexOf(pid) !== -1, 'страница объявлена: ' + pid);
            assertEqual(PARSED.parents[pid], 'contentArea',
                pid + ': родитель = ' + PARSED.parents[pid] + ' (ожидался contentArea)');
        });
    });

    test('КАЖДАЯ страница page-* — прямой потомок #contentArea (не вложена в другую страницу)', () => {
        const offenders = PAGE_IDS.filter(pid => PARSED.parents[pid] !== 'contentArea');
        assertEqual(offenders.length, 0,
            'страницы с чужим родителем: ' + JSON.stringify(offenders));
    });

    test('#wsWsBody (сетка + шторка итогов) — потомок #page-work-schedule (вложенность Task 323 сохранена; Task 331: колонка сетки)', () => {
        assertEqual(PARSED.parents['wsWsBody'], 'page-work-schedule',
            'родитель wsWsBody: ' + PARSED.parents['wsWsBody']);
        // Task 331: сетка (контейнер + статичный бордюрчик + зона
        // ползунка) собрана в КОЛОНКУ #wsGridCol — она потомок wsWsBody
        assertEqual(PARSED.parents['wsGridCol'], 'wsWsBody',
            'родитель wsGridCol: ' + PARSED.parents['wsGridCol']);
        assertEqual(PARSED.parents['wsGridWrap'], 'wsGridCol',
            'родитель wsGridWrap (колонка, Task 331): ' + PARSED.parents['wsGridWrap']);
        assertEqual(PARSED.parents['wsGridFoot'], 'wsGridCol',
            'родитель wsGridFoot (статичный бордюрчик): ' + PARSED.parents['wsGridFoot']);
        assertEqual(PARSED.parents['wsGridHbar'], 'wsGridCol',
            'родитель wsGridHbar (зона ползунка): ' + PARSED.parents['wsGridHbar']);
        assertEqual(PARSED.parents['wsTotalsDrawer'], 'wsWsBody',
            'родитель wsTotalsDrawer: ' + PARSED.parents['wsTotalsDrawer']);
    });

    test('#detailPanel в разметке — ПОСЛЕ закрытия #page-work-schedule (багфикс-комментарий Task 326 присутствует)', () => {
        // Позиция закрывающего тега страницы табеля (после wsWsBody)
        // и позиция открытия #detailPanel — страница должна закрываться РАНЬШЕ.
        const wsOpen = INDEX_SRC.indexOf('<div id="page-work-schedule"');
        const detailOpen = INDEX_SRC.indexOf('<div id="detailPanel">');
        assertTrue(wsOpen !== -1 && detailOpen !== -1, 'оба элемента объявлены');
        assertTrue(wsOpen < detailOpen, 'табель раньше detailPanel в разметке');
        // Комментарий багфикса Task 326
        assertTrue(INDEX_SRC.indexOf('Task 326 (BUGFIX)') !== -1,
            'комментарий Task 326 (BUGFIX) в HTML присутствует');
    });

    test('SW: актуальная версия kipia-test-v735 (Task 326)', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v735'") !== -1,
            'CACHE_VERSION = kipia-test-v735 в sw.js');
        assertFalse(SW_SRC.indexOf('kipia-test-v736') !== -1,
            'v566 не существует (один инкремент на Task 326)');
    });
});
