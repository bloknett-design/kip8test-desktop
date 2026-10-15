// ============================================================
// Task 460 — заявка: «Теперь необходимо создать новый раздел
// "Плановые мероприятия" в разделе Документация ИОС. На странице
// нового раздела необходимо разместить информацию в виде таблицы
// по образцу приложенному в файле» (файл «Пример таблицы
// мероприятий.xlsx»).
//
// Реализация (полностью КЛИЕНТСКАЯ, index.html + sw.js):
//   • НОВАЯ страница page-plan-events — подраздел «Документации
//     ИОС»: кнопка planEventsMenuBtn на page-docs-ios (после
//     «Табеля»), крошки «Главная / Документация / Документация
//     ИОС / Плановые мероприятия» (PAGE_PARENTS/PAGE_LABELS),
//     закрепление на главной (SUBSECTIONS, категория docs);
//   • таблица ПО ОБРАЗЦУ: шапка «Мероприятия» (rowspan 2) +
//     «2026 год» (colspan 12) + 12 месяцев; группы «В начале
//     месяца» (3 мероприятия) / «В конце месяца» (5 мероприятий);
//     ячейки месяцев ПУСТЫЕ (разметка периодичности в образец
//     не входит); опечатка образца «Феф.» исправлена на «Фев.»;
//   • доступ — как у страницы «Документация ИОС» (без отдельного
//     права): _KIP_IOS_PAGES + LVL_KIP8_PRO + _applyServerAccess
//     (flowmeter.view без КИП ИОС) + пункт сайдбара;
//     [Task 462] доступ переведён на ОТДЕЛЬНОЕ право plan.events
//     (группа _PLAN_EVENTS_PAGES, уровни с PLAN_EVENTS, в
//     _applyServerAccess — perm('plan.events') + переходный
//     фоллбек пока колонки в матрице нет; см. test-task462.js);
//   • sw.js → kipia-test-v742.
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Данные образца (файл «Пример таблицы мероприятий.xlsx», лист 1).
// Task 470: точка в конце сокращения ноября («Ноя.» — как у прочих
// сокращённых месяцев), в группу «В конце месяца» добавлено мероприятие
// «Работы на следующий месяц», НОВАЯ группа «На текущий месяц»
// с мероприятием «Работы на месяц».
const MONTHS_SAMPLE = ['Янв.', 'Фев.', 'Мар.', 'Апр.', 'Май', 'Июн.',
                       'Июл.', 'Авг.', 'Сен.', 'Окт.', 'Ноя.', 'Дек.'];
const GROUPS_SAMPLE = [
    { name: 'В начале месяца', acts: [
        'Проверка электроинструмента (приспособлений)',
        'Проверка СИЗ в электроустановках',
        'Проверка огнетушителей'] },
    { name: 'В конце месяца', acts: [
        'График смен на следующий месяц',
        'Отчёт по талонам',
        'Выписка из ППР на следующий месяц',
        'Журнал учёта электрооборудования',
        'Отчёт по графику ППР',
        // Task 470: новое мероприятие группы «В конце месяца»
        'Работы на следующий месяц'] },
    // Task 470: новая группа «На текущий месяц»
    { name: 'На текущий месяц', acts: [
        'Работы на месяц'] },
];

function section(name) {
    const start = INDEX_SRC.indexOf(name);
    if (start === -1) return null;
    return INDEX_SRC.slice(start, start + 40000);
}

// ============================================================
// 1. SRC — страница и кнопка-вход
// ============================================================
describe('Task 460 — SRC: страница «Плановые мероприятия»', () => {

    test('страница page-plan-events существует, комментарий-заявка Task 460', () => {
        const idx = INDEX_SRC.indexOf('<div id="page-plan-events" class="page-content">');
        assertTrue(idx !== -1, 'div страницы определён');
        const above = INDEX_SRC.slice(Math.max(0, idx - 2500), idx);
        assertTrue(above.indexOf('Task 460') !== -1, 'комментарий-ссылка на Task 460');
        assertTrue(above.indexOf('Плановые мероприятия') !== -1,
            'в комментарии — название раздела');
        assertTrue(above.indexOf('Пример таблицы мероприятий') !== -1,
            'в комментарии — ссылка на файл-образец');
    });

    test('заголовок страницы + шеврон назад', () => {
        const idx = INDEX_SRC.indexOf('<div id="page-plan-events" class="page-content">');
        const head = INDEX_SRC.slice(idx, idx + 700);
        assertTrue(head.indexOf('page-inline-header-chevron') !== -1, 'шеврон назад есть');
        assertTrue(head.indexOf('>Плановые мероприятия</div>') !== -1,
            'заголовок «Плановые мероприятия»');
    });

    test('кнопка planEventsMenuBtn на page-docs-ios — ПОСЛЕ «Табеля»', () => {
        const btnIdx = INDEX_SRC.indexOf('id="planEventsMenuBtn"');
        assertTrue(btnIdx !== -1, 'кнопка определена');
        // кнопка внутри страницы page-docs-ios
        const pageStart = INDEX_SRC.indexOf('<div id="page-docs-ios" class="page-content">');
        const pageEnd = INDEX_SRC.indexOf('ПЛАНОВЫЕ МЕРОПРИЯТИЯ');
        assertTrue(pageStart !== -1 && pageEnd !== -1 && btnIdx > pageStart && btnIdx < pageEnd,
            'кнопка живёт на странице «Документация ИОС»');
        const wsIdx = INDEX_SRC.indexOf('id="workScheduleMenuBtn"');
        assertTrue(wsIdx !== -1 && btnIdx > wsIdx, 'кнопка стоит после «Табеля учёта рабочего времени»');
        const btn = INDEX_SRC.slice(btnIdx - 400, btnIdx + 700);
        assertTrue(btn.indexOf("navigateTo('plan-events')") !== -1, 'переход на plan-events');
        assertTrue(btn.indexOf('Плановые мероприятия</div>') !== -1, 'label кнопки');
        assertTrue(btn.indexOf('Периодические работы по месяцам года') !== -1, 'sublabel кнопки');
    });
});

// ============================================================
// 2. SRC — таблица по образцу
// ============================================================
describe('Task 460 — SRC: таблица по образцу «Мероприятия × 12 месяцев»', () => {

    const page = section('<div id="page-plan-events" class="page-content">');

    test('таблица pe-table с colgroup: наименование + 12 месяцев', () => {
        assertTrue(page !== null, 'страница найдена');
        assertTrue(page.indexOf('<table class="pe-table" id="peTable">') !== -1, 'таблица pe-table (id добавлен Task 463 — делегированный клик)');
        assertTrue(page.indexOf('<col class="pe-col-name">') !== -1, 'колонка наименований');
        assertTrue(page.indexOf('<col class="pe-col-month" span="12">') !== -1,
            '12 колонок месяцев одним col');
    });

    test('шапка образца: «Мероприятия» rowspan 2 + «2026 год» colspan 12 (Task 471: кнопка года)', () => {
        assertTrue(page.indexOf('<th class="pe-th-name" rowspan="2">Мероприятия</th>') !== -1,
            '«Мероприятия» на 2 строки (A1:A2 образца)');
        // Task 471: слева от года — кнопка предыдущего года (pePrevYearBtn),
        // текст года — в #peYearLabel (JS переключает по годам архива)
        assertTrue(page.indexOf('<th class="pe-th-year" colspan="12"><button type="button" id="pePrevYearBtn"') !== -1,
            '«2026 год» на 12 колонок + кнопка слева (B1:M1 образца + Task 471)');
        assertTrue(page.indexOf('<span id="peYearLabel">2026 год</span>') !== -1,
            'подпись «2026 год» — #peYearLabel (Task 471)');
    });

    test('12 месяцев образца; «Фев.» — опечатка образца «Феф.» ИСПРАВЛЕНА; «Ноя.» с точкой (Task 470)', () => {
        const m = page.match(/<tr class="pe-head-months">\s*([\s\S]*?)\s*<\/tr>/);
        assertTrue(m !== null, 'строка месяцев найдена');
        const ths = [];
        const re = /<th>([^<]*)<\/th>/g;
        let mm;
        while ((mm = re.exec(m[1])) !== null) ths.push(mm[1]);
        assertEqual(ths.length, 12, 'ровно 12 колонок месяцев');
        assertEqual(ths.join('|'), MONTHS_SAMPLE.join('|'),
            'месяцы — в порядке и написании образца («Ноя.» — Task 470)');
        assertTrue(ths[1] === 'Фев.', 'второй месяц — «Фев.»');
        assertTrue(ths[10] === 'Ноя.', 'ноябрь — «Ноя.» с точкой (Task 470)');
        assertFalse(th_of(page, 'Феф.'), 'опечатки «Феф.» в th-ячейках нет');
        assertFalse(th_of(page, 'Ноя'), 'сокращения ноября без точки нет (Task 470)');
    });

    test('группы «В начале месяца» / «В конце месяца» / «На текущий месяц» — строки-заголовки colspan 13', () => {
        assertTrue(page.indexOf('<tr class="pe-group"><td colspan="13">В начале месяца</td></tr>') !== -1,
            'группа «В начале месяца»');
        assertTrue(page.indexOf('<tr class="pe-group"><td colspan="13">В конце месяца</td></tr>') !== -1,
            'группа «В конце месяца»');
        // Task 470: новая группа «На текущий месяц»
        assertTrue(page.indexOf('<tr class="pe-group"><td colspan="13">На текущий месяц</td></tr>') !== -1,
            'группа «На текущий месяц» (Task 470)');
    });

    test('10 мероприятий — образец (8) + заявка Task 470 (2); текст и ПОРЯДОК', () => {
        const names = [];
        const re = /<td class="pe-name">([^<]*)<\/td>/g;
        let m;
        while ((m = re.exec(page)) !== null) names.push(m[1]);
        const expected = GROUPS_SAMPLE[0].acts.concat(
            GROUPS_SAMPLE[1].acts, GROUPS_SAMPLE[2].acts);
        assertEqual(names.length, 10, 'ровно 10 мероприятий (8 образца + 2 Task 470)');
        assertEqual(names.join('|'), expected.join('|'),
            'перечень и порядок — образец, затем заявка Task 470');
    });

    test('порядок строк: группы охватывают СВОИ мероприятия (3 + 6 + 1)', () => {
        const g1 = page.indexOf('>В начале месяца</td></tr>');
        const a3 = page.indexOf('Проверка огнетушителей</td>');
        const g2 = page.indexOf('>В конце месяца</td></tr>');
        const a8 = page.indexOf('Отчёт по графику ППР</td>');
        const a9 = page.indexOf('Работы на следующий месяц</td>');
        const g3 = page.indexOf('>На текущий месяц</td></tr>');
        const a10 = page.indexOf('Работы на месяц</td>');
        assertTrue(g1 !== -1 && g2 !== -1 && a3 !== -1 && a8 !== -1 &&
                   a9 !== -1 && g3 !== -1 && a10 !== -1, 'все маркеры найдены');
        assertTrue(g1 < a3 && a3 < g2, '3 мероприятия ДО группы «В конце месяца»');
        assertTrue(g2 < a8 && a8 < a9, '6 мероприятий ПОСЛЕ группы «В конце месяца»');
        assertTrue(a9 < g3 && g3 < a10, '«Работы на следующий месяц» ДО, «Работы на месяц» ПОСЛЕ группы «На текущий месяц» (Task 470)');
    });

    test('ячейки месяцев ПУСТЫЕ: 120 шт., без текста и отметок (как в образце)', () => {
        const cnt = (page.match(/<td class="pe-m"><\/td>/g) || []).length;
        assertEqual(cnt, 120, '10 строк × 12 месяцев = 120 пустых ячеек');
        // в строках мероприятий нет отметок (✓/✗/+/V/дата) вне td.pe-m
        const rows = page.split('<tr class="pe-row">').slice(1);
        assertEqual(rows.length, 10, '10 строк мероприятий');
        for (const r of rows) {
            const body = r.split('</tr>')[0];
            const tds = (body.match(/<td[^>]*>([^<]*)<\/td>/g) || []);
            assertEqual(tds.length, 13, 'строка: 1 наименование + 12 месяцев');
        }
    });

    test('комментарий: опечатка образца задокументирована как исправленная', () => {
        const idx = INDEX_SRC.indexOf('<div id="page-plan-events" class="page-content">');
        const above = INDEX_SRC.slice(Math.max(0, idx - 2500), idx);
        assertTrue(above.indexOf('«Феф.»') !== -1 && above.indexOf('«Фев.»') !== -1,
            'комментарий упоминает исправление «Феф.» → «Фев.»');
    });
});

function th_of(page, text) {
    return page.indexOf('<th>' + text + '</th>') !== -1;
}

// ============================================================
// 3. SRC — CSS (тёмная + светлая темы)
// ============================================================
describe('Task 460 — SRC: CSS pe-*', () => {

    test('блок стилей с комментарием Task 460 и ссылкой на заявку', () => {
        const idx = INDEX_SRC.indexOf('.pe-table {');
        assertTrue(idx !== -1, 'блок .pe-table существует');
        const above = INDEX_SRC.slice(Math.max(0, idx - 3500), idx);
        assertTrue(above.indexOf('Task 460') !== -1, 'комментарий Task 460 над блоком');
        assertTrue(above.indexOf('Пример таблицы мероприятий') !== -1,
            'упоминание файла-образца');
    });

    test('карточка-обёртка + горизонтальная прокрутка (мобайл)', () => {
        assertTrue(INDEX_SRC.indexOf('.pe-card {') !== -1, '.pe-card есть');
        assertTrue(INDEX_SRC.indexOf('.pe-grid-wrap {') !== -1, '.pe-grid-wrap есть');
        const wrap = INDEX_SRC.slice(INDEX_SRC.indexOf('.pe-grid-wrap {'),
                                     INDEX_SRC.indexOf('.pe-grid-wrap {') + 400);
        assertTrue(wrap.indexOf('overflow-x: auto') !== -1, 'overflow-x: auto');
        assertTrue(wrap.indexOf('-webkit-overflow-scrolling: touch') !== -1, 'touch-скролл');
    });

    test('скроллбар скрыт (паттерн .ws-grid-wrap)', () => {
        const idx = INDEX_SRC.indexOf('.pe-grid-wrap::-webkit-scrollbar');
        assertTrue(idx !== -1, 'правило скрытия скроллбара есть');
    });

    test('пропорции: колонка наименований по тексту (Task 464) + узкие месяцы', () => {
        // Task 464: фиксированные 300px заменены на auto + nowrap —
        // ширина по самому длинному наименованию (заявка пользователя)
        assertTrue(INDEX_SRC.indexOf('.pe-col-name { width: auto; }') !== -1,
            'колонка наименований по тексту (width: auto, Task 464)');
        assertTrue(INDEX_SRC.indexOf('.pe-name, .pe-th-name { white-space: nowrap; }') !== -1,
            'наименования без переносов');
        assertTrue(INDEX_SRC.indexOf('.pe-col-month { width: 46px; }') !== -1,
            'месяцы 46px');
    });

    test('шапка — стальная #1e293b (канон Task 330 шахматки)', () => {
        const idx = INDEX_SRC.indexOf('.pe-table thead th {');
        const block = INDEX_SRC.slice(idx, idx + 400);
        assertTrue(block.indexOf('#1e293b') !== -1, 'фон шапки #1e293b');
    });

    test('зебра строк: alpha-подсветка чётных, нечётные прозрачны (обе темы)', () => {
        assertTrue(INDEX_SRC.indexOf('.pe-row:nth-child(even) td') !== -1, 'чётные строки');
        assertTrue(INDEX_SRC.indexOf('.pe-row:nth-child(odd) td') !== -1, 'нечётные строки');
        const i = INDEX_SRC.indexOf('.pe-row:nth-child(even) td');
        const block = INDEX_SRC.slice(i, i + 120);
        assertTrue(block.indexOf('rgba(255, 255, 255, 0.055)') !== -1,
            'тёмная тема — белая alpha-подсветка чётных');
        const li = INDEX_SRC.indexOf('[data-theme="light"] .pe-row:nth-child(even) td');
        const lblock = INDEX_SRC.slice(li, li + 140);
        assertTrue(lblock.indexOf('rgba(20, 20, 19, 0.055)') !== -1,
            'светлая тема — чёрная alpha-подсветка чётных');
    });

    test('светлая тема: границы и шапка как у сетки шахматки', () => {
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .pe-table th,') !== -1,
            'правило светлой темы есть');
        const idx = INDEX_SRC.indexOf('[data-theme="light"] .pe-table thead th {');
        const block = INDEX_SRC.slice(idx, idx + 200);
        assertTrue(block.indexOf('#bfcad5') !== -1, 'фон шапки светлой темы #bfcad5');
        assertTrue(INDEX_SRC.indexOf('border-color: rgb(83, 96, 117)') !== -1,
            'границы светлой темы rgb(83, 96, 117)');
    });

    test('группы-строки: жирные, фон шапки таблиц', () => {
        const idx = INDEX_SRC.indexOf('.pe-group td {');
        const block = INDEX_SRC.slice(idx, idx + 400);
        assertTrue(block.indexOf('font-weight: 700') !== -1, 'жирный текст группы');
        assertTrue(block.indexOf('var(--table-head-bg') !== -1, 'фон --table-head-bg');
    });
});

// ============================================================
// 4. SRC — регистрация навигации
// ============================================================
describe('Task 460 — SRC: навигация и закрепление', () => {

    test('PAGE_PARENTS: plan-events → docs-ios (полные крошки)', () => {
        assertTrue(INDEX_SRC.indexOf("'plan-events':              'docs-ios',") !== -1,
            'родитель — «Документация ИОС»');
    });

    test('PAGE_LABELS: «Плановые мероприятия»', () => {
        assertTrue(INDEX_SRC.indexOf("'plan-events':      'Плановые мероприятия',") !== -1,
            'метка страницы');
    });

    test('SUBSECTIONS: можно закрепить на главной, категория docs', () => {
        const idx = INDEX_SRC.indexOf("'plan-events':    { label: 'Плановые мероприятия'");
        assertTrue(idx !== -1, 'запись в реестре SUBSECTIONS');
        const entry = INDEX_SRC.slice(idx, idx + 260);
        assertTrue(entry.indexOf("target: 'plan-events'") !== -1, 'target plan-events');
        assertTrue(entry.indexOf("category: 'docs'") !== -1, 'категория docs');
    });
});

// ============================================================
// 5. SRC — доступ (Task 460: следовал за «Документацией ИОС»;
//    Task 462 перевёл на отдельное право plan.events)
// ============================================================
describe('Task 460 — SRC: права доступа (обновлено Task 462)', () => {

    test('plan-events — своя группа _PLAN_EVENTS_PAGES, НЕ в _KIP_IOS_PAGES', () => {
        assertTrue(INDEX_SRC.indexOf("_PLAN_EVENTS_PAGES: ['plan-events'],") !== -1,
            'группа доступа plan-events (Task 462)');
        const idx = INDEX_SRC.indexOf('_KIP_IOS_PAGES:');
        const end = INDEX_SRC.indexOf('_PLAN_EVENTS_PAGES:');
        const block = INDEX_SRC.slice(idx, end);
        assertTrue(block.indexOf("'plan-events'") === -1,
            'plan-events больше НЕ в массиве _KIP_IOS_PAGES (Task 462)');
    });

    test('LVL_KIP8_PRO: docs-ios + PLAN_EVENTS (легаси-карта)', () => {
        assertTrue(INDEX_SRC.indexOf("FLOWMETER, PLAN_EVENTS, ['docs-ios']);") !== -1,
            'КИП8 pro получает docs-ios + plan-events (через PLAN_EVENTS)');
    });

    test('_applyServerAccess: flowmeter.view без КИП ИОС → только docs-ios', () => {
        assertTrue(INDEX_SRC.indexOf("if (!kipios) _add(['docs-ios']);") !== -1,
            'серверная матрица: хаб отдельно, план-эвентс — по праву plan.events');
    });

    test('пункт сайдбара в группе «Документация ИОС»', () => {
        const idx = INDEX_SRC.indexOf("navigateTo('plan-events'); toggleSidebar();");
        assertTrue(idx !== -1, 'sidebar-item с переходом на plan-events');
        const around = INDEX_SRC.slice(Math.max(0, idx - 700), idx + 200);
        assertTrue(around.indexOf('sidebarWorkScheduleBtn') !== -1,
            'пункт стоит в группе «Документация ИОС» (рядом с «Табелем»)');
    });
});

// ============================================================
// 6. SW
// ============================================================
describe('Task 460 — SW', () => {

    test('kipia-test-v742 + комментарий Task 460', () => {
        assertTrue(SW_SRC.indexOf("kipia-test-v742") !== -1, 'версия поднята до v684');
        assertTrue(SW_SRC.indexOf('kipia-test-v683') === -1, 'старой версии v683 нет');
        assertTrue(SW_SRC.indexOf('Task 460') !== -1, 'комментарий Task 460 в истории');
        assertTrue(SW_SRC.indexOf('Плановые мероприятия') !== -1,
            'в комментарии — название раздела');
    });
});
