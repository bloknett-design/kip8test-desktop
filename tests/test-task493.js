// tests/test-task493.js
// Task 493: заявка пользователя — «Кнопку "Табель учёта рабочего
//   времени" установленную на главную страницу назови короче
//   "Табель учёта".»
//
// Кнопка появляется на главной через ЗАКРЕПЛЕНИЕ (реестр SUBSECTIONS →
// renderPinnedItems), а её источник — статическая кнопка на странице
// «Документация ИОС» (workScheduleMenuBtn). Переименованы ОБЕ кнопки
// (единая сущность): статическая + label в реестре.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — HTML: статическая кнопка workScheduleMenuBtn —
//      <div class="menu-btn-label">Табель учёта</div> (короткое имя),
//      длинное имя в чанке кнопки ОТСУТСТВУЕТ; субметка прежняя.
//   B. SRC — реестр SUBSECTIONS: label 'Табель учёта' + прежние
//      sublabel/target/category; комментарий Task 493 рядом.
//   C. SRC — НЕ переименовано (инварианты): заголовок страницы
//      page-inline-header-title — полное имя; PAGE_LABELS (крошки) —
//      полное имя; пункт сайдбара sidebarWorkScheduleBtn — полное имя.
//   D. VM — renderPinnedItems: пин work-schedule → на главной метка
//      «Табель учёта» (рендер из реестра), sublabel прежний,
//      золотистый стиль docs не задет.
//   E. SW v717 (guard v716 в sw.js отсутствует).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Извлечение блока кода по балансу скобок от открывающей { до парной }
function grabBraced(startMarker) {
    const start = INDEX_SRC.indexOf(startMarker);
    if (start === -1) return null;
    const braceStart = INDEX_SRC.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < INDEX_SRC.length; i++) {
        if (INDEX_SRC[i] === '{') depth++;
        else if (INDEX_SRC[i] === '}') {
            depth--;
            if (depth === 0) return INDEX_SRC.slice(start, i + 1);
        }
    }
    return null;
}

describe('Task 493 — кнопка «Табель учёта» (переименование короче)', () => {

    test('HTML: статическая кнопка на page-docs-ios — короткая метка', () => {
        const i = INDEX_SRC.indexOf('id="workScheduleMenuBtn"');
        assertTrue(i !== -1, 'кнопка workScheduleMenuBtn есть');
        const chunk = INDEX_SRC.slice(i, i + 700);
        assertTrue(chunk.indexOf('<div class="menu-btn-label">Табель учёта</div>') !== -1,
            'menu-btn-label — «Табель учёта» (короткое имя, Task 493)');
        assertFalse(chunk.indexOf('Табель учёта рабочего времени') !== -1,
            'длинное имя в кнопке больше НЕ встречается');
        assertTrue(chunk.indexOf('Шахматка сменного и дневного персонала') !== -1,
            'субметка не изменилась');
        assertTrue(chunk.indexOf("navigateTo('work-schedule')") !== -1,
            'навигация прежняя (id не тронут)');
    });

    test('JS: SUBSECTIONS — короткая метка, остальные поля прежние', () => {
        const re = /'work-schedule':\s*\{ label: 'Табель учёта',\s*sublabel: 'Шахматка сменного и дневного персонала',\s*target: 'work-schedule',\s*category: 'docs' \}/;
        assertTrue(re.test(INDEX_SRC),
            'реестр: label «Табель учёта», sublabel/target/category прежние');
        // Комментарий-метка задачи рядом с записью реестра
        const iReg = INDEX_SRC.indexOf("'work-schedule':  { label: 'Табель учёта'");
        assertTrue(iReg !== -1, 'запись реестра найдена (пробелы как в исходнике)');
        const before = INDEX_SRC.slice(Math.max(0, iReg - 300), iReg);
        assertTrue(before.indexOf('Task 493') !== -1,
            'комментарий Task 493 перед записью реестра');
    });

    test('JS: прежний label реестра исчез (нет дублей)', () => {
        assertFalse(/'work-schedule':\s*\{ label: 'Табель учёта рабочего времени'/.test(INDEX_SRC),
            'старая запись реестра удалена');
    });

    test('НЕ переименовано: заголовок страницы — полное имя', () => {
        assertTrue(INDEX_SRC.indexOf('<div class="page-inline-header-title">Табель учёта рабочего времени</div>') !== -1,
            'page-inline-header-title — «Табель учёта рабочего времени» (как было)');
    });

    test('НЕ переименовано: PAGE_LABELS (крошки) — полное имя', () => {
        assertTrue(/'work-schedule':\s+'Табель учёта рабочего времени'/.test(INDEX_SRC),
            'PAGE_LABELS: «Табель учёта рабочего времени» (как было)');
    });

    test('НЕ переименовано: пункт сайдбара — полное имя', () => {
        const i = INDEX_SRC.indexOf('id="sidebarWorkScheduleBtn" onclick');
        assertTrue(i !== -1, 'sidebarWorkScheduleBtn (div) есть');
        const chunk = INDEX_SRC.slice(i, i + 400);
        assertTrue(chunk.indexOf('Табель учёта рабочего времени') !== -1,
            'пункт сайдбара — полное имя (как было)');
    });

    test('VM: renderPinnedItems — на главной метка «Табель учёта»', () => {
        // Извлекаем реестр SUBSECTIONS и функции пиннинга, рендерим
        // закреплённый work-schedule в мок-контейнер.
        const KEY_DECL = "const PINNED_STORAGE_KEY = 'pinnedSubsections';";
        assertTrue(INDEX_SRC.indexOf(KEY_DECL) !== -1,
            'объявление PINNED_STORAGE_KEY есть в исходнике');
        const subsectionsSrc = grabBraced('const SUBSECTIONS =');
        const getPinnedSrc = grabBraced('function getPinnedItems()');
        const setPinnedSrc = grabBraced('function setPinnedItems(arr)');
        const pinEscSrc = grabBraced('function pinEscHtml(s)');
        const renderSrc = grabBraced('function renderPinnedItems()');
        const attachSrc = grabBraced('function attachPinnedDragHandlers()');
        assertTrue(!!subsectionsSrc && !!getPinnedSrc && !!setPinnedSrc &&
                   !!pinEscSrc && !!renderSrc && !!attachSrc,
            'все блоки пиннинга извлечены из index.html');

        const container = { innerHTML: '' };
        const ctx = {
            localStorage: {
                _store: { pinnedSubsections: JSON.stringify(['work-schedule']) },
                getItem(k) { return this._store[k] || null; },
                setItem(k, v) { this._store[k] = String(v); },
                removeItem(k) { delete this._store[k]; }
            },
            document: {
                getElementById(id) { return id === 'pinnedItemsContainer' ? container : null; },
                querySelectorAll() { return []; }
            }
        };
        vm.createContext(ctx);
        vm.runInContext(KEY_DECL + '\n' + subsectionsSrc + '\n' + setPinnedSrc + '\n' +
                        getPinnedSrc + '\n' + pinEscSrc + '\n' +
                        attachSrc + '\n' + renderSrc, ctx);

        ctx.renderPinnedItems();
        const html = container.innerHTML;
        assertTrue(html.indexOf('>Табель учёта</div>') !== -1,
            'метка на главной (пин) — «Табель учёта»');
        assertFalse(html.indexOf('Табель учёта рабочего времени') !== -1,
            'длинное имя на главной больше не рендерится');
        assertTrue(html.indexOf('Шахматка сменного и дневного персонала') !== -1,
            'субметка на главной прежняя');
        assertTrue(html.indexOf('border-color:rgba(199,150,74,0.35);') !== -1,
            'золотистый стиль docs-категории не задет');
        assertTrue(html.indexOf("data-pinned-key=\"work-schedule\"") !== -1,
            'кнопка закреплена с ключом work-schedule');
    });

    test('VM: реестр — точное значение label программно', () => {
        const subsectionsSrc = grabBraced('const SUBSECTIONS =');
        const ctx = {};
        vm.createContext(ctx);
        vm.runInContext(subsectionsSrc + '\nthis.__S = SUBSECTIONS;', ctx);
        const s = ctx.__S['work-schedule'];
        assertTrue(!!s, 'запись work-schedule в реестре');
        assertTrue(s.label === 'Табель учёта',
            'label === «Табель учёта»');
        assertTrue(s.sublabel === 'Шахматка сменного и дневного персонала',
            'sublabel прежний');
        assertTrue(s.target === 'work-schedule' && s.category === 'docs',
            'target/category прежние');
    });

    test('SW: версия кеша поднята до v717', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v754';") !== -1,
            'CACHE_VERSION = kipia-test-v754');
        assertTrue(SW_SRC.indexOf('kipia-test-v716') === -1,
            'v716 в sw.js отсутствует (ровно один инкремент)');
        assertFalse(SW_SRC.indexOf('kipia-test-v755') !== -1,
            'v718 не существует (guard)');
    });

    test('SW: комментарий Task 493 в шапке версий', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v754';");
        // Task 497: комментарий избранного расходомеров (~200 симв.)
        // — якорь 493@1206 — окно 900 → 1400 (запас 194).
        // Task 502: окно 2800 → 3300 (якорь 3133).
        const ctx = SW_SRC.slice(Math.max(0, i - 4600), i);
        assertTrue(ctx.indexOf('Task 493') !== -1, 'маркер задачи');
        assertTrue(ctx.indexOf('Табель учёта') !== -1, 'описание переименования');
    });
});

console.log('test-task493: все describes зарегистрированы');
