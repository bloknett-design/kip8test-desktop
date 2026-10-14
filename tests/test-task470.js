// tests/test-task470.js
// Task 470 — заявка пользователя: «В таблице плановых мероприятий,
// в конце сокращённого слова месяца ноября "Ноя" поставь точку.
// К группе мероприятий в конце месяца добавь мероприятие "Работы
// на следующий месяц", и ниже в таблице создай новую группу
// мероприятий "На текущий месяц", и добавь в эту группу новое
// мероприятие "Работы на месяц".»
//
// КОНТЕКСТ: таблица «Плановых мероприятий» создана Task 460 (по
// образцу «Пример таблицы мероприятий.xlsx»: группы «В начале
// месяца» (3) и «В конце месяца» (5), 8 мероприятий), отметки —
// Task 463/464 (совпадение с архивом по ТОЧНОЙ строке наименования
// из DOM — новые строки автоматически кликабельны), раскладка
// Task 468 (таблица влево + окно описания справа).
// РЕШЕНИЕ (клиент-only, только index.html):
//   1) «Ноя» → «Ноя.» (точка у сокращения; «Май» — полное слово,
//      остаётся без точки);
//   2) в группу «В конце месяца» добавлено мероприятие «Работы
//      на следующий месяц» (последней строкой группы);
//   3) НОВАЯ группа «На текущий месяц» с мероприятием
//      «Работы на месяц» (внизу таблицы);
//   4) JS/CSS/раскладка НЕ тронуты — ячейки новых строк такие же
//      пустые td.pe-m, отметки работают по наименованию из DOM.
//   SW: kipia-test-v737.
//
// Запуск: через tests/run-all.js (require './test-task470.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Секция страницы «Плановые мероприятия» (таблица — в её начале).
function peSection() {
    const start = INDEX_SRC.indexOf('<div id="page-plan-events" class="page-content">');
    if (start === -1) return null;
    return INDEX_SRC.slice(start, start + 40000);
}

// Строка шапки месяцев (tr.pe-head-months целиком).
function monthsRow() {
    const page = peSection();
    if (page === null) return null;
    const m = page.match(/<tr class="pe-head-months">[\s\S]*?<\/tr>/);
    return m ? m[0] : null;
}

// ============================================================
// 1. SRC — точка в конце сокращения ноября «Ноя.»
// ============================================================
describe('Task 470 — SRC: «Ноя.» с точкой в шапке месяцев', () => {

    test('в строке месяцев ноябрь — «Ноя.» с точкой', () => {
        const row = monthsRow();
        assertTrue(row !== null, 'строка месяцев найдена');
        assertTrue(row.indexOf('<th>Ноя.</th>') !== -1,
            'th ноября — «Ноя.» (точка по заявке)');
    });

    test('сокращения «Ноя» без точки больше нет', () => {
        const row = monthsRow();
        assertTrue(row.indexOf('<th>Ноя</th>') === -1,
            'th «Ноя» без точки отсутствует');
    });

    test('прочие месяцы не изменились: «Май» — без точки, «Дек.»/«Янв.» — с точкой', () => {
        const row = monthsRow();
        assertTrue(row.indexOf('<th>Май</th>') !== -1,
            '«Май» — полное слово, без точки (не тронуто)');
        assertTrue(row.indexOf('<th>Янв.</th>') !== -1, 'январь — «Янв.»');
        assertTrue(row.indexOf('<th>Дек.</th>') !== -1, 'декабрь — «Дек.»');
        assertEqual((row.match(/<th>/g) || []).length, 12,
            'ровно 12 колонок месяцев');
    });

    test('точка — ТОЛЬКО у ноября: других изменений в шапке нет', () => {
        const row = monthsRow();
        const expected = ['Янв.', 'Фев.', 'Мар.', 'Апр.', 'Май', 'Июн.',
                         'Июл.', 'Авг.', 'Сен.', 'Окт.', 'Ноя.', 'Дек.'];
        const ths = [];
        const re = /<th>([^<]*)<\/th>/g;
        let m;
        while ((m = re.exec(row)) !== null) ths.push(m[1]);
        assertEqual(ths.join('|'), expected.join('|'),
            'шапка месяцев — канон Task 460 + точка ноября Task 470');
    });
});

// ============================================================
// 2. SRC — мероприятие «Работы на следующий месяц»
// ============================================================
describe('Task 470 — SRC: мероприятие «Работы на следующий месяц»', () => {

    test('строка pe-row с наименованием «Работы на следующий месяц»', () => {
        const page = peSection();
        assertTrue(page !== null, 'страница найдена');
        assertTrue(page.indexOf('<td class="pe-name">Работы на следующий месяц</td>') !== -1,
            'td.pe-name с текстом заявки — дословно');
    });

    test('структура новой строки: 1 наименование + 12 пустых ячеек месяцев', () => {
        const page = peSection();
        const i = page.indexOf('<td class="pe-name">Работы на следующий месяц</td>');
        assertTrue(i !== -1, 'строка найдена');
        const row = page.slice(page.lastIndexOf('<tr class="pe-row">', i),
                                page.indexOf('</tr>', i));
        assertEqual((row.match(/<td class="pe-m"><\/td>/g) || []).length, 12,
            '12 пустых td.pe-m — отметки Task 463 работают сразу');
        assertEqual((row.match(/<td[^>]*>[^<]*<\/td>/g) || []).length, 13,
            'строка: 1 наименование + 12 месяцев');
    });

    test('строка — ВНУТРИ группы «В конце месяца» (последней в группе)', () => {
        const page = peSection();
        const g2 = page.indexOf('>В конце месяца</td></tr>');
        const aNew = page.indexOf('<td class="pe-name">Работы на следующий месяц</td>');
        const g3 = page.indexOf('>На текущий месяц</td></tr>');
        assertTrue(g2 !== -1 && aNew !== -1 && g3 !== -1, 'все маркеры найдены');
        assertTrue(g2 < aNew, 'мероприятие ПОСЛЕ заголовка «В конце месяца»');
        assertTrue(aNew < g3, 'мероприятие ДО новой группы «На текущий месяц»');
        // последняя в группе: следующая строка-мероприятие после неё —
        // уже из группы «На текущий месяц»
        const after = page.slice(aNew + 100);
        const nextRow = after.indexOf('<td class="pe-name">');
        const nextName = after.slice(nextRow, nextRow + 60);
        assertTrue(nextName.indexOf('Работы на месяц') !== -1,
            'следующее мероприятие — «Работы на месяц» (новая группа)');
    });

    test('позиция в группе: после «Отчёт по графику ППР» (конец группы)', () => {
        const page = peSection();
        const prev = page.indexOf('<td class="pe-name">Отчёт по графику ППР</td>');
        const aNew = page.indexOf('<td class="pe-name">Работы на следующий месяц</td>');
        assertTrue(prev !== -1 && aNew !== -1, 'оба маркера найдены');
        assertTrue(prev < aNew, '«Работы на следующий месяц» — после «Отчёт по графику ППР»');
    });
});

// ============================================================
// 3. SRC — новая группа «На текущий месяц» + «Работы на месяц»
// ============================================================
describe('Task 470 — SRC: группа «На текущий месяц»', () => {

    test('строка-заголовок группы colspan 13 — текст заявки дословно', () => {
        const page = peSection();
        assertTrue(page.indexOf('<tr class="pe-group"><td colspan="13">На текущий месяц</td></tr>') !== -1,
            'pe-group «На текущий месяц» (формат групп Task 460)');
    });

    test('группа — НИЖЕ группы «В конце месяца» (последняя в таблице)', () => {
        const page = peSection();
        const g1 = page.indexOf('>В начале месяца</td></tr>');
        const g2 = page.indexOf('>В конце месяца</td></tr>');
        const g3 = page.indexOf('>На текущий месяц</td></tr>');
        assertTrue(g1 !== -1 && g2 !== -1 && g3 !== -1, 'все группы найдены');
        assertTrue(g1 < g2 && g2 < g3, 'порядок групп: начало → конец → текущий месяц');
        const tbodyEnd = page.indexOf('</tbody>');
        assertTrue(g3 < tbodyEnd, 'группа внутри tbody таблицы');
    });

    test('в группе одно мероприятие «Работы на месяц» — текст дословно', () => {
        const page = peSection();
        const g3 = page.indexOf('>На текущий месяц</td></tr>');
        const tbodyEnd = page.indexOf('</tbody>');
        const group = page.slice(g3, tbodyEnd);
        assertTrue(group.indexOf('<td class="pe-name">Работы на месяц</td>') !== -1,
            'мероприятие «Работы на месяц» после заголовка группы');
        assertEqual((group.match(/<td class="pe-name">/g) || []).length, 1,
            'ровно одно мероприятие в группе');
    });

    test('структура строки «Работы на месяц»: 13 ячеек, 12 пустых месяцев', () => {
        const page = peSection();
        const i = page.indexOf('<td class="pe-name">Работы на месяц</td>');
        assertTrue(i !== -1, 'строка найдена');
        const row = page.slice(page.lastIndexOf('<tr class="pe-row">', i),
                                page.indexOf('</tr>', i));
        assertEqual((row.match(/<td class="pe-m"><\/td>/g) || []).length, 12,
            '12 пустых td.pe-m');
        assertEqual((row.match(/<td[^>]*>[^<]*<\/td>/g) || []).length, 13,
            'строка: 1 наименование + 12 месяцев');
    });

    test('«Работы на месяц» — последняя строка-мероприятие таблицы', () => {
        const page = peSection();
        const tbodyEnd = page.indexOf('</tbody>');
        const last = page.slice(0, tbodyEnd).lastIndexOf('<tr class="pe-row">');
        const lastName = page.slice(last, last + 120);
        assertTrue(lastName.indexOf('Работы на месяц') !== -1,
            'последний pe-row в tbody — «Работы на месяц»');
    });
});

// ============================================================
// 4. SRC — итоговая структура таблицы (10 мероприятий / 3 группы)
// ============================================================
describe('Task 470 — SRC: итоговая структура таблицы', () => {

    test('10 строк мероприятий (8 образца + 2 заявки Task 470)', () => {
        const page = peSection();
        assertEqual((page.match(/<tr class="pe-row">/g) || []).length, 10,
            'в таблице 10 pe-row');
    });

    test('3 строки-группы: начало / конец / текущий месяц', () => {
        const page = peSection();
        assertEqual((page.match(/<tr class="pe-group">/g) || []).length, 3,
            'в таблице 3 pe-group');
    });

    test('120 пустых ячеек месяцев (10 строк × 12)', () => {
        const page = peSection();
        assertEqual((page.match(/<td class="pe-m"><\/td>/g) || []).length, 120,
            'все ячейки месяцев пустые — как в образце');
    });

    test('все 10 мероприятий — перечень и порядок', () => {
        const page = peSection();
        const names = [];
        const re = /<td class="pe-name">([^<]*)<\/td>/g;
        let m;
        while ((m = re.exec(page)) !== null) names.push(m[1]);
        assertEqual(names.join('|'), [
            'Проверка электроинструмента (приспособлений)',
            'Проверка СИЗ в электроустановках',
            'Проверка огнетушителей',
            'График смен на следующий месяц',
            'Отчёт по талонам',
            'Выписка из ППР на следующий месяц',
            'Журнал учёта электрооборудования',
            'Отчёт по графику ППР',
            'Работы на следующий месяц',   // Task 470
            'Работы на месяц'               // Task 470
        ].join('|'), '8 образца Task 460 + 2 заявки Task 470, порядок сохранён');
    });
});

// ============================================================
// 5. SRC — JS отметок не тронут (клиент-only)
// ============================================================
describe('Task 470 — SRC: JS отметок Task 463/464 не тронут', () => {

    test('PlanEventsData: наименования из DOM — новый источник для отметок', () => {
        const i = INDEX_SRC.indexOf('var PlanEventsData = {');
        assertTrue(i !== -1, 'модууль PlanEventsData жив');
        assertTrue(INDEX_SRC.indexOf("_cellInfo: function(td)") !== -1,
            '_cellInfo читает наименование строки из td.pe-name');
        assertTrue(INDEX_SRC.indexOf('tr.querySelector(\'td.pe-name\')') !== -1,
            'наименование мероприятия — из разметки (один источник истины)');
    });

    test('делегированный клик по td.pe-m — новые строки кликабельны', () => {
        // Task 471: обработчик расширен (клики по наименованиям/
        // «Мероприятия»/месяцам шапки) — td.pe-m остался первой
        // веткой, целевая проверка — та же (closest('td.pe-m'))
        assertTrue(INDEX_SRC.indexOf("t.closest('td.pe-m')") !== -1,
            'делегированный обработчик td.pe-m жив (Task 463 → 471)');
        // ячейки новых строк — те же td.pe-m: клики работают без правок JS
        const page = peSection();
        const i = page.indexOf('<td class="pe-name">Работы на месяц</td>');
        assertTrue(i !== -1, 'строка новой группы найдена');
    });

    test('мобильный выбор месяца Task 464 и раскладка Task 468 не тронуты', () => {
        assertTrue(INDEX_SRC.indexOf('peMonthSel') !== -1, 'селектор месяца жив');
        assertTrue(INDEX_SRC.indexOf('pe-layout') !== -1, 'раскладка Task 468 жива');
        assertTrue(INDEX_SRC.indexOf('pe-desc-card') !== -1, 'окно описания живо');
    });
});

// ============================================================
// 6. SW: версия кэша
// ============================================================
describe('Task 470 — SW: версия кэша', () => {

    test('CACHE_VERSION = kipia-test-v737', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v737';") !== -1,
            'инкремент Task 470: v693 → v694');
    });

    test('v693 в sw.js отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v693') === -1,
            'версии до Task 470 нет');
    });

    test('комментарий Task 470 в истории версий sw.js', () => {
        assertTrue(SW_SRC.indexOf('Task 470') !== -1, 'маркер задачи');
        assertTrue(SW_SRC.indexOf('«Ноя.»') !== -1,
            'в истории упомянута точка сокращения');
        assertTrue(SW_SRC.indexOf('На текущий месяц') !== -1,
            'в истории упомянута новая группа');
        assertTrue(SW_SRC.indexOf('Работы на следующий месяц') !== -1,
            'в истории упомянуто новое мероприятие');
    });

    test('IMAGE_CACHE_VERSION не тронут (кэш картинок независим)', () => {
        assertTrue(SW_SRC.indexOf("const IMAGE_CACHE_VERSION = 'kipia-images-test-v3';") !== -1,
            'кэш картинок не инкрементирован');
    });
});
