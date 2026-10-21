// tests/test-task369.js
// Task 369: заявка пользователя:
//   «В разделе КИП ИОС, сделай при свайпе кнопки "Проекты" (по такому же
//    принципу как на кнопках "Приборы" и "Клапана") открывался список
//    проектов сгруппированный по столбцу Статус проекта.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. HTML — страница #page-projects-status (заголовок/поиск/инфо/
//      список); кнопка «Проекты» обёрнута в свайп-ячейку #projectSwipeCell
//      с ДВУМЯ подложками «По статусу».
//   B. CSS — .project-swipe-cell (transition/touch-action/margin),
//      .project-swipe-bg (янтарная палитра тёмная + светлая), обнуление
//      базового отступа ячейки в отдельно стоящей строке.
//   C. SRC — свайп-хендлеры (pointerdown/move/up/cleanup), тап →
//      projects-prod, свайп в обе стороны → 'projects-status';
//      PROJECT_STATUS_ORDER / projectStatusGroupKey /
//      projectStatusSortKey; projectsRenderSorted (ids.status,
//      isStatusMode, групп-сортировка только для prod);
//      projectsRenderGroup (фильтр по статусу); projectInitSorted ids;
//      роутинг: navigateTo-хук, PAGE_PARENTS, PAGE_LABELS,
//      _KIP_IOS_PAGES (доступ), DESKTOP_MASTER_PAGES, вкладка
//      «Документация».
//   D. VM — хелперы статусов (ключи, порядок, «(без статуса)»);
//      projectsRenderSorted('status') на мок-DOM: порядок групп
//      Новый → Выполнен → Остановлен → Отменен → (неизвестный по
//      алфавиту) → (без статуса), счётчики, data-mode="status";
//      режим 'prod' не тронут (группы по отделениям);
//      projectsRenderGroup: mode='status' фильтрует по статусу,
//      mode='prod' — по отделению.
//   E. SW v598 (guard v599).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ============================================================
// Извлечение функций верхнего уровня (балансировка скобок)
// ============================================================
function extractFn(src, name) {
    const marker = 'function ' + name + '(';
    const start = src.indexOf(marker);
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

// const PROJECT_STATUS_ORDER = [...]; — по балансу квадратных скобок
function extractConstArray(src, name) {
    const marker = 'const ' + name + ' = [';
    const start = src.indexOf(marker);
    if (start === -1) return null;
    const open = src.indexOf('[', start);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '[') depth++;
        else if (src[i] === ']') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1) + ';';
        }
    }
    return null;
}

// ============================================================
// A. HTML: страница и свайп-ячейка
// ============================================================
describe('Task 369 — HTML: страница «Проекты по статусу» и свайп-ячейка', () => {

    const page = INDEX_SRC.slice(INDEX_SRC.indexOf('id="page-projects-status"'),
                                  INDEX_SRC.indexOf('id="page-project-detail"'));

    test('страница #page-projects-status существует (между prod и деталью)', () => {
        assertTrue(INDEX_SRC.indexOf('id="page-projects-status"') !== -1,
            'страница должна быть в разметке');
        assertTrue(page.length > 200, 'страница не пустая');
        const iProd = INDEX_SRC.indexOf('id="page-projects-prod"');
        const iStatus = INDEX_SRC.indexOf('id="page-projects-status"');
        const iDetail = INDEX_SRC.indexOf('id="page-project-detail"');
        assertTrue(iProd < iStatus && iStatus < iDetail,
            'порядок разметки: prod → status → detail');
    });

    test('заголовок «Проекты по статусу» + поиск + инфо + список', () => {
        assertTrue(page.indexOf('Проекты по статусу</div>') !== -1, 'заголовок');
        assertTrue(page.indexOf('id="projectStatusSearchInput"') !== -1 &&
                   page.indexOf("oninput=\"projectsRenderSorted('status')\"") !== -1,
            'поиск с oninput projectsRenderSorted(\'status\')');
        assertTrue(page.indexOf('id="projectStatusSearchInputToggleBtn"') !== -1 &&
                   page.indexOf('data-search-input="projectStatusSearchInput"') !== -1,
            'кнопка-иконка поиска (единый стиль)');
        assertTrue(page.indexOf('id="projectStatusInfo"') !== -1, 'инфо-бар');
        assertTrue(page.indexOf('id="projectStatusList"') !== -1, 'список');
    });

    test('кнопка «Проекты» обёрнута в свайп-ячейку #projectSwipeCell', () => {
        const iCell = INDEX_SRC.indexOf('id="projectSwipeCell"');
        const iBtn = INDEX_SRC.indexOf('id="projectsEntryBtn"');
        assertTrue(iCell !== -1 && iBtn !== -1, 'и ячейка, и кнопка есть');
        assertTrue(iCell < iBtn, 'кнопка внутри ячейки');
        const cellChunk = INDEX_SRC.slice(iCell - 200, iBtn);
        assertTrue(cellChunk.indexOf('dev-swipe-cell project-swipe-cell') !== -1,
            'классы dev-swipe-cell project-swipe-cell');
        // Обе подложки «По статусу» — до кнопки
        const nUnder = (cellChunk.match(/<span>По статусу<\/span>/g) || []).length;
        assertEqual(nUnder, 2, 'две подложки «По статусу» (лево и право)');
        assertTrue(cellChunk.indexOf('dev-swipe-bg-left project-swipe-bg') !== -1 &&
                   cellChunk.indexOf('dev-swipe-bg-right project-swipe-bg') !== -1,
            'подложки с классом project-swipe-bg слева и справа');
    });

    test('подпись кнопки — прежняя («Проекты», «По отделениям»)', () => {
        const iBtn = INDEX_SRC.indexOf('id="projectsEntryBtn"');
        const chunk = INDEX_SRC.slice(iBtn, iBtn + 400);
        assertTrue(chunk.indexOf('>Проекты</div>') !== -1, 'лейбл «Проекты»');
        assertTrue(chunk.indexOf('По отделениям') !== -1, 'сублейбл «По отделениям»');
    });
});

// ============================================================
// B. CSS
// ============================================================
describe('Task 369 — CSS: ячейка и подложка', () => {

    test('.project-swipe-cell > #projectsEntryBtn — слой/transition/touch-action', () => {
        const i = INDEX_SRC.indexOf('.project-swipe-cell > #projectsEntryBtn {');
        assertTrue(i !== -1, 'правило есть');
        const chunk = INDEX_SRC.slice(i, i + 260);
        assertTrue(chunk.indexOf('z-index: 1') !== -1, 'z-index: 1');
        assertTrue(chunk.indexOf('transition: transform 0.25s') !== -1, 'transition');
        assertTrue(chunk.indexOf('touch-action: pan-y') !== -1, 'touch-action: pan-y');
        assertTrue(chunk.indexOf('margin: 0') !== -1, 'margin: 0');
    });

    test('.project-swipe-bg — янтарная палитра, тёмная и светлая темы', () => {
        const i = INDEX_SRC.indexOf('.project-swipe-bg {');
        assertTrue(i !== -1, 'правило есть');
        const chunk = INDEX_SRC.slice(i, i + 200);
        assertTrue(chunk.indexOf('rgba(146, 98, 44') !== -1 &&
                   chunk.indexOf('rgba(176, 128, 72') !== -1,
            'градиент в цвет кнопки #b08048');
        const iL = INDEX_SRC.indexOf('[data-theme="light"] .project-swipe-bg {');
        assertTrue(iL !== -1, 'светлая тема есть');
        const chunkL = INDEX_SRC.slice(iL, iL + 160);
        assertTrue(chunkL.indexOf('rgba(156, 108, 52') !== -1, 'светлее в светлой теме');
    });

    test('отдельная строка «Проекты»: отступ ячейки обнулён', () => {
        const i = INDEX_SRC.indexOf('#page-kip-ios > .menu-btn-row .dev-swipe-cell {');
        assertTrue(i !== -1, 'правило есть');
        const chunk = INDEX_SRC.slice(i, i + 120);
        assertTrue(chunk.indexOf('margin-bottom: 0') !== -1, 'margin-bottom: 0');
    });
});

// ============================================================
// C. SRC — JS кнопки, рендеры, роутинг
// ============================================================
describe('Task 369 — SRC: свайп кнопки и рендеры', () => {

    test('projectsInitEntryButton: pointerdown + тап → projects-prod', () => {
        const fn = extractFn(INDEX_SRC, 'projectsInitEntryButton');
        assertTrue(fn !== null, 'функция есть');
        assertTrue(fn.indexOf("addEventListener('pointerdown', onProjectSwipePointerDown)") !== -1,
            'pointerdown-хендлер подключён');
        assertTrue(fn.indexOf("navigateTo('projects-prod')") !== -1,
            'тап — по-прежнему «По отделениям»');
        assertTrue(fn.indexOf('if (projectSwipeMoved) return;') !== -1,
            'клик после свайпа гасится');
    });

    test('onProjectSwipePointerUp: свайп в ЛЮБУЮ сторону → projects-status', () => {
        const fn = extractFn(INDEX_SRC, 'onProjectSwipePointerUp');
        assertTrue(fn !== null, 'функция есть');
        assertTrue(fn.indexOf("const targetPage = 'projects-status';") !== -1,
            'единая цель — «По статусу»');
        assertTrue(fn.indexOf("st.currentDx < 0 ? '-100%' : '100%'") !== -1,
            'направление влияет только на анимацию выезда');
        assertTrue(fn.indexOf('Math.abs(st.currentDx) > threshold') !== -1,
            'порог 30% ширины');
        // «Приборы»/«Клапана» не затронуты: у них выбор по isLeft
        const dev = extractFn(INDEX_SRC, 'onDevSwipePointerUp');
        assertTrue(dev.indexOf("isLeft ? 'devices-type' : 'devices-name'") !== -1,
            'Приборы: влево → по типу, вправо → по наименованию');
    });

    test('полный набор хендлеров свайпа', () => {
        for (const name of ['onProjectSwipePointerDown', 'onProjectSwipePointerMove',
                            'onProjectSwipePointerUp', 'cleanupProjectSwipe']) {
            assertTrue(extractFn(INDEX_SRC, name) !== null, name + ' определена');
        }
        const down = extractFn(INDEX_SRC, 'onProjectSwipePointerDown');
        assertTrue(down.indexOf("getElementById('projectSwipeCell')") !== -1,
            'ячейка #projectSwipeCell');
        const move = extractFn(INDEX_SRC, 'onProjectSwipePointerMove');
        assertTrue(move.indexOf('Math.abs(dx) > Math.abs(dy) * 1.5') !== -1,
            'вертикаль — отмена (как у Приборов/Клапанов)');
    });

    test('PROJECT_STATUS_ORDER — фиксированный порядок известных статусов', () => {
        const arr = extractConstArray(INDEX_SRC, 'PROJECT_STATUS_ORDER');
        assertTrue(arr !== null, 'константа есть');
        assertTrue(arr.indexOf("'Новый'") !== -1 && arr.indexOf("'Выполнен'") !== -1 &&
                   arr.indexOf("'Остановлен'") !== -1 && arr.indexOf("'Отменен'") !== -1 &&
                   arr.indexOf("'Отменён'") !== -1,
            'все 5 известных статусов (оба написания «отменен»)');
    });

    test('projectStatusGroupKey / projectStatusSortKey определены', () => {
        const g = extractFn(INDEX_SRC, 'projectStatusGroupKey');
        const s = extractFn(INDEX_SRC, 'projectStatusSortKey');
        assertTrue(g !== null && s !== null, 'оба хелпера есть');
        assertTrue(g.indexOf("'(без статуса)'") !== -1, 'пустой статус → «(без статуса)»');
        assertTrue(s.indexOf('PROJECT_STATUS_ORDER.indexOf') !== -1,
            'приоритет по списку');
        assertTrue(s.indexOf("'9:") !== -1 && s.indexOf("'5:'") !== -1,
            'без статуса — в конце, неизвестные — до него');
    });

    test('projectsRenderSorted: ids.status + isStatusMode-ветки', () => {
        const fn = extractFn(INDEX_SRC, 'projectsRenderSorted');
        assertTrue(fn !== null, 'функция есть');
        assertTrue(fn.indexOf("status: { list: 'projectStatusList', info: 'projectStatusInfo', search: 'projectStatusSearchInput', page: 'page-projects-status' }") !== -1,
            'ids.status');
        assertTrue(fn.indexOf("const isStatusMode = (mode === 'status');") !== -1,
            'флаг isStatusMode');
        assertTrue(fn.indexOf("projectStatusSortKey(a['Статус проекта'])") !== -1,
            'сортировка элементов по приоритету статуса');
        assertTrue(fn.indexOf("isStatusMode ? projectStatusGroupKey(d['Статус проекта'])") !== -1,
            'накопление групп по статусу');
        assertTrue(fn.indexOf('if (!isStatusMode) {') !== -1,
            'групп-сортировка по минимальной дате — только для prod');
    });

    test('projectsRenderGroup: фильтр по группе статуса', () => {
        const fn = extractFn(INDEX_SRC, 'projectsRenderGroup');
        assertTrue(fn !== null, 'функция есть');
        assertTrue(fn.indexOf("if (mode === 'status') return projectStatusGroupKey(d['Статус проекта']) === group;") !== -1,
            'ветка mode=status');
        assertTrue(fn.indexOf("d[sortKey] || '(без отделения)'") !== -1,
            'prod-ветка не тронута');
    });

    test('projectInitSorted: ids ошибки для status', () => {
        const fn = extractFn(INDEX_SRC, 'projectInitSorted');
        assertTrue(fn !== null, 'функция есть');
        assertTrue(fn.indexOf("{ prod: 'projectProdList', status: 'projectStatusList' }") !== -1,
            'ошибка загрузки показывается и на странице статусов');
    });

    test('роутинг: хук navigateTo + PAGE_PARENTS + PAGE_LABELS', () => {
        assertTrue(INDEX_SRC.indexOf("if (page === 'projects-status')") !== -1,
            'navigateTo-хук');
        assertTrue(INDEX_SRC.indexOf("'projects-status':  'kip-ios',") !== -1,
            'PAGE_PARENTS: родитель kip-ios (хлебные крошки/назад)');
        assertTrue(INDEX_SRC.indexOf("'projects-status':  'Проекты по статусу',") !== -1,
            'PAGE_LABELS');
    });

    test('доступ: _KIP_IOS_PAGES + десктоп + вкладка «Документация»', () => {
        const i = INDEX_SRC.indexOf('_KIP_IOS_PAGES:');
        const chunk = INDEX_SRC.slice(i, i + 900);
        assertTrue(chunk.indexOf("'projects-status'") !== -1,
            'страница в _KIP_IOS_PAGES — доступна всем ролям КИП ИОС (легаси и серверная матрица)');
        const iM = INDEX_SRC.indexOf('DESKTOP_MASTER_PAGES');
        const chunkM = INDEX_SRC.slice(iM, iM + 500);
        assertTrue(chunkM.indexOf("'projects-status'") !== -1, 'DESKTOP_MASTER_PAGES');
        // Список вкладки «Документация» (подсветка активной вкладки)
        const iT = INDEX_SRC.indexOf("tabPage === 'docs'");
        const chunkT = INDEX_SRC.slice(iT, iT + 1200);
        assertTrue(chunkT.indexOf("'projects-status'") !== -1,
            'активная вкладка «Документация» подсвечивается и на странице статусов');
    });
});

// ============================================================
// D. VM — хелперы и рендеры на мок-DOM
// ============================================================
describe('Task 369 — VM: хелперы статусов', () => {

    function buildSandbox(extra) {
        const ctx = {
            console: { log: () => {}, warn: () => {}, error: () => {} },
            navigator: {},
            window: {},
            kipSearchFilter: (arr) => arr,
            kipRenderSearchCounter: () => {},
            KipFav: { _cardFavBtnHtml: () => '', _cardFavToggleHtml: () => '',
                      wrapKipCardsForFavSwipe: () => {} },
            isDesktop: () => false,
            updateDesktopBreadcrumb: () => {},
        };
        Object.assign(ctx, extra || {});
        vm.createContext(ctx);
        const sources = [
            extractConstArray(INDEX_SRC, 'PROJECT_STATUS_ORDER'),
            extractFn(INDEX_SRC, 'projectEsc'),
            extractFn(INDEX_SRC, 'projectNorm'),
            extractFn(INDEX_SRC, 'projectMark'),
            extractFn(INDEX_SRC, 'projectStatusClass'),
            extractFn(INDEX_SRC, 'projectStatusGroupKey'),
            extractFn(INDEX_SRC, 'projectStatusSortKey'),
            extractFn(INDEX_SRC, 'projectDateSortValue'),
            extractFn(INDEX_SRC, 'projectYearKey'),
            extractFn(INDEX_SRC, 'getProjectFileUrl'),
            extractFn(INDEX_SRC, 'projectRenderCardNumber'),
            extractFn(INDEX_SRC, 'projectPlural'),
            extractFn(INDEX_SRC, 'projectsRenderSorted'),
            extractFn(INDEX_SRC, 'projectsRenderGroup'),
        ].filter(Boolean);
        vm.runInContext(sources.join('\n') +
            '\nthis.__export = { projectStatusGroupKey, projectStatusSortKey,' +
            ' projectsRenderSorted, projectsRenderGroup, projectStatusClass };', ctx);
        return ctx;
    }

    test('projectStatusGroupKey: пустые значения → «(без статуса)»', () => {
        const ctx = buildSandbox();
        const k = ctx.__export.projectStatusGroupKey;
        assertEqual(k(''), '(без статуса)', 'пустая строка');
        assertEqual(k(null), '(без статуса)', 'null');
        assertEqual(k(undefined), '(без статуса)', 'undefined');
        assertEqual(k('   '), '(без статуса)', 'пробелы');
        assertEqual(k('Выполнен'), 'Выполнен', 'обычный статус');
        assertEqual(k('  Новый  '), 'Новый', 'trim');
    });

    test('projectStatusSortKey: фиксированный порядок групп', () => {
        const ctx = buildSandbox();
        const k = ctx.__export.projectStatusSortKey;
        const order = ['Новый', 'Выполнен', 'Остановлен', 'Отменен', 'Отменён'];
        for (let i = 1; i < order.length; i++) {
            assertTrue(k(order[i - 1]) < k(order[i]),
                order[i - 1] + ' должен идти раньше ' + order[i]);
        }
        // Неизвестные — после известных, до «без статуса»
        assertTrue(k('Выполнен') < k('Действующий'), 'неизвестный — после известных');
        assertTrue(k('Отменён') < k('Действующий'), 'даже после «Отменён»');
        assertTrue(k('Действующий') < k(''), 'неизвестный — раньше «без статуса»');
        // Неизвестные между собой — по алфавиту
        assertTrue(k('Архив') < k('Действующий'), 'неизвестные по алфавиту');
    });

    test('VM: projectsRenderSorted(status) — порядок групп, счётчики, data-mode', () => {
        const listEl = { innerHTML: '', children: [] };
        const infoEl = { textContent: 'x' };
        const searchEl = { value: '' };
        const ctx = buildSandbox({
            document: { getElementById: (id) => id === 'projectStatusList' ? listEl
                             : id === 'projectStatusInfo' ? infoEl
                             : id === 'projectStatusSearchInput' ? searchEl : null },
            projectData: { projects: [
                { ID: '1', 'Наименование проекта': 'Пр. A', '№ проекта': '10', 'Статус проекта': 'Выполнен', 'Отделение': 'ТЭЦ', 'Дата утв.': '2020-01-01' },
                { ID: '2', 'Наименование проекта': 'Пр. B', '№ проекта': '11', 'Статус проекта': 'Новый', 'Отделение': 'ТЭЦ', 'Дата утв.': '2023-05-05' },
                { ID: '3', 'Наименование проекта': 'Пр. C', '№ проекта': '12', 'Статус проекта': '', 'Отделение': 'КО', 'Дата утв.': '2019-02-02' },
                { ID: '4', 'Наименование проекта': 'Пр. D', '№ проекта': '13', 'Статус проекта': 'Остановлен', 'Отделение': 'КО', 'Дата утв.': '2021-03-03' },
                { ID: '5', 'Наименование проекта': 'Пр. E', '№ проекта': '14', 'Статус проекта': 'Новый', 'Отделение': 'ВОК', 'Дата утв.': '2022-02-02' },
                { ID: '6', 'Наименование проекта': 'Пр. F', '№ проекта': '15', 'Статус проекта': 'Отменен', 'Отделение': 'ВОК', 'Дата утв.': '2018-04-04' },
                { ID: '7', 'Наименование проекта': 'Пр. G', '№ проекта': '16', 'Статус проекта': 'Действующий', 'Отделение': 'ТЭЦ', 'Дата утв.': '2024-01-01' },
            ] },
            projectLoaded: true,
            projectGroupExpanded: {},
        });
        ctx.__export.projectsRenderSorted('status');
        const html = listEl.innerHTML;
        // Порядок заголовков групп
        const titles = [...html.matchAll(/pb-section-title-text">([^<]*)<\/span>/g)]
            .map(m => m[1]);
        assertEqual(JSON.stringify(titles),
            JSON.stringify(['Новый', 'Выполнен', 'Остановлен', 'Отменен', 'Действующий', '(без статуса)']),
            'порядок групп: известные по списку, неизвестный после, «без статуса» в конце');
        // Счётчики
        assertTrue(html.indexOf('<span class="pb-section-title-count">2</span>') !== -1,
            '«Новый» — 2 проекта');
        const counts = [...html.matchAll(/pb-section-title-count">(\d+)</g)].map(m => +m[1]);
        assertEqual(counts.reduce((a, b) => a + b, 0), 7, 'сумма по группам = все проекты');
        // Карточки (только карточки — у секций-групп свой data-mode)
        assertEqual((html.match(/class="project-card"/g) || []).length, 7,
            'все 7 карточек отрисованы');
        assertEqual((html.match(/data-mode="status"/g) || []).length, 13,
            'режимом status помечены 7 карточек + 6 секций-групп');
        // Внутри группы — по дате (старые → новые): E (2022) раньше B (2023)
        assertTrue(html.indexOf('Пр. E') < html.indexOf('Пр. B'),
            'внутри статуса — по дате от старых к новым (E 2022 раньше B 2023)');
        assertEqual(infoEl.textContent, '', 'инфо-бар очищен');
    });

    test('VM: projectsRenderSorted(status) — поиск сужает список', () => {
        const listEl = { innerHTML: '', children: [] };
        const infoEl = { textContent: '' };
        const searchEl = { value: '' };
        const ctx = buildSandbox({
            document: { getElementById: (id) => id === 'projectStatusList' ? listEl
                             : id === 'projectStatusInfo' ? infoEl
                             : id === 'projectStatusSearchInput' ? searchEl : null },
            projectData: { projects: [
                { ID: '1', 'Наименование проекта': 'Реконструкция котла', '№ проекта': '10', 'Статус проекта': 'Выполнен', 'Дата утв.': '2020-01-01' },
                { ID: '2', 'Наименование проекта': 'Насосная станция', '№ проекта': '11', 'Статус проекта': 'Новый', 'Дата утв.': '2023-05-05' },
            ] },
            projectLoaded: true,
            projectGroupExpanded: {},
            kipSearchFilter: (arr, q) => arr.filter(d =>
                d['Наименование проекта'].indexOf(q) !== -1),
        });
        searchEl.value = 'Насосная';
        ctx.__export.projectsRenderSorted('status');
        assertTrue(listEl.innerHTML.indexOf('<mark>Насосная</mark>') !== -1,
            'найденное видно (с подсветкой совпадения)');
        assertTrue(listEl.innerHTML.indexOf('Реконструкция котла') === -1, 'лишнее скрыто');
        assertTrue(listEl.innerHTML.indexOf('>Новый<') !== -1, 'группа «Новый» с 1 проектом');
        assertEqual((listEl.innerHTML.match(/class="project-card"/g) || []).length, 1,
            'одна карточка');
    });

    test('VM: projectsRenderSorted(prod) — не сломано (группы по отделениям)', () => {
        const listEl = { innerHTML: '', children: [] };
        const infoEl = { textContent: '' };
        const searchEl = { value: '' };
        const ctx = buildSandbox({
            document: { getElementById: (id) => id === 'projectProdList' ? listEl
                             : id === 'projectProdInfo' ? infoEl
                             : id === 'projectProdSearchInput' ? searchEl : null },
            projectData: { projects: [
                { ID: '1', 'Наименование проекта': 'Пр. A', '№ проекта': '10', 'Статус проекта': 'Выполнен', 'Отделение': 'ТЭЦ', 'Дата утв.': '2020-01-01' },
                { ID: '2', 'Наименование проекта': 'Пр. B', '№ проекта': '11', 'Статус проекта': 'Новый', 'Отделение': 'КО', 'Дата утв.': '2023-05-05' },
            ] },
            projectLoaded: true,
            projectGroupExpanded: {},
        });
        ctx.__export.projectsRenderSorted('prod');
        const titles = [...listEl.innerHTML.matchAll(/pb-section-title-text">([^<]*)<\/span>/g)]
            .map(m => m[1]);
        assertEqual(JSON.stringify(titles), JSON.stringify(['ТЭЦ', 'КО']),
            'prod: групп-сортировка по минимальной дате не тронута (ТЭЦ 2020 старше КО 2023)');
        assertEqual((listEl.innerHTML.match(/class="project-card"/g) || []).length, 2,
            'карточки режима prod отрисованы');
    });

    test('VM: projectsRenderGroup — mode=status фильтрует по статусу', () => {
        const listEl = { innerHTML: '', children: [] };
        const titleEl = { textContent: '' };
        const searchEl = { value: '' };
        const ctx = buildSandbox({
            document: { getElementById: (id) => id === 'projectGroupList' ? listEl
                             : id === 'projectGroupTitle' ? titleEl
                             : id === 'projectGroupSearchInput' ? searchEl : null },
            projectData: { projects: [
                { ID: '1', 'Наименование проекта': 'Пр. A', '№ проекта': '10', 'Статус проекта': 'Выполнен', 'Отделение': 'ТЭЦ', 'Дата утв.': '2020-01-01' },
                { ID: '2', 'Наименование проекта': 'Пр. B', '№ проекта': '11', 'Статус проекта': 'Новый', 'Отделение': 'ТЭЦ', 'Дата утв.': '2023-05-05' },
                { ID: '3', 'Наименование проекта': 'Пр. C', '№ проекта': '12', 'Статус проекта': 'Выполнен', 'Отделение': 'КО', 'Дата утв.': '2019-02-02' },
            ] },
            projectLoaded: true,
        });
        ctx.window._projectGroupCtx = { mode: 'status', group: 'Выполнен' };
        ctx.__export.projectsRenderGroup();
        assertEqual(titleEl.textContent, 'Выполнен', 'заголовок группы = статус');
        assertEqual((listEl.innerHTML.match(/project-card"/g) || []).length, 2,
            'только проекты со статусом «Выполнен»');
        assertTrue(listEl.innerHTML.indexOf('Пр. A') !== -1 &&
                   listEl.innerHTML.indexOf('Пр. C') !== -1, 'оба «Выполнен»');
        assertTrue(listEl.innerHTML.indexOf('Пр. B') === -1, '«Новый» не попал');
        assertTrue(listEl.innerHTML.indexOf('>2019<') !== -1 &&
                   listEl.innerHTML.indexOf('>2020<') !== -1,
            'подгруппы-годы внутри статуса');
    });

    test('VM: projectsRenderGroup — mode=prod по-прежнему по отделению', () => {
        const listEl = { innerHTML: '', children: [] };
        const titleEl = { textContent: '' };
        const searchEl = { value: '' };
        const ctx = buildSandbox({
            document: { getElementById: (id) => id === 'projectGroupList' ? listEl
                             : id === 'projectGroupTitle' ? titleEl
                             : id === 'projectGroupSearchInput' ? searchEl : null },
            projectData: { projects: [
                { ID: '1', 'Наименование проекта': 'Пр. A', '№ проекта': '10', 'Статус проекта': 'Выполнен', 'Отделение': 'ТЭЦ', 'Дата утв.': '2020-01-01' },
                { ID: '2', 'Наименование проекта': 'Пр. B', '№ проекта': '11', 'Статус проекта': 'Новый', 'Отделение': 'КО', 'Дата утв.': '2023-05-05' },
            ] },
            projectLoaded: true,
        });
        ctx.window._projectGroupCtx = { mode: 'prod', group: 'ТЭЦ' };
        ctx.__export.projectsRenderGroup();
        assertEqual((listEl.innerHTML.match(/project-card"/g) || []).length, 1,
            'только ТЭЦ');
        assertTrue(listEl.innerHTML.indexOf('Пр. A') !== -1, 'Пр. A в группе ТЭЦ');
        ctx.window._projectGroupCtx = { mode: 'status', group: '(без статуса)' };
        listEl.innerHTML = '';
        ctx.__export.projectsRenderGroup();
        assertEqual((listEl.innerHTML.match(/project-card"/g) || []).length, 0,
            '«(без статуса)» — ключ пустого статуса работает и в группе');
    });

    test('VM: projectStatusClass — классы карточек не тронуты', () => {
        const ctx = buildSandbox();
        const c = ctx.__export.projectStatusClass;
        assertEqual(c('Выполнен'), 'project-card-status-done', 'Выполнен');
        assertEqual(c('Новый'), 'project-card-status-new', 'Новый');
        assertEqual(c('Остановлен'), 'project-card-status-stopped', 'Остановлен');
        assertEqual(c('Отменен'), 'project-card-status-cancel', 'Отменен');
        assertEqual(c(''), '', 'без статуса — без класса');
    });
});

// ============================================================
// E. SW
// ============================================================
describe('Task 369 — SW: версия кэша', () => {
    test("CACHE_VERSION = 'kipia-test-v752'", () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v752'") !== -1,
            'SW-бамп v597 → v598 (деплой через Ctrl+Shift+R)');
    });
    test("guard: kipia-test-v752 ещё не существует", () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v753') === -1,
            'v599 не должен существовать (следующий номер)');
    });
});
