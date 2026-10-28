// ============================================================
// Task 451 — заявка: «В нижней части отчёта, черту под фамилиями
// сделай по длине самой длинной фамилии. На странице "Талоны"
// колонку "Выдано талонов" раздели на две колонки "Выдано 12 ч.
// талонов" и "Выдано 8 ч. талонов". И если при ручной правке, на
// одного работника укажут и 8ч и 12 ч, то в отчёте он должен
// указываться дважды в соответствующих группах. На странице
// талонов общий итог дней явки подсчитывать и указывать не нужно,
// и нужно подсчитывать отдельно 12ч и 8ч, а работников
// отсортировать по алфавиту фамилий.»
//
// Реализация (полностью КЛИЕНТСКАЯ, index.html):
//   • ЧЕРТА ПОД ФАМИЛИЯМИ — по длине САМОЙ ДЛИННОЙ фамилии
//     («Котельникова И.А.»): «призрак» — невидимый текст longest
//     (.wst-s-gh, visibility: hidden) задаёт ширину бокса
//     (.wst-s-nbox), черта — border-bottom бокса; фамилия
//     (.wst-s-nm, position: absolute) — поверх призрака, по
//     центру черты; «(ф.и.о.)» — по центру колонок 6–7 (= центр
//     черты); прежняя черта border-top на всю ширину (Task 450)
//     удалена;
//   • ЭКРАННАЯ СТРАНИЦА: колонка «Выдано талонов» РАЗДЕЛЕНА на
//     «Выдано 12 ч. талонов» и «Выдано 8 ч. талонов» (input на
//     каждую категорию, data-cat + data-auto); авто — ПО ДНЯМ
//     месяца (Task 452: 7,2/8 ч → 8ч, 12 ч → 12ч, переработка
//     «д»/«н» учтена); правка НЕ зависит от правки второй
//     категории (_TALONS_EDIT[таб] = {t12, t8} — только
//     правленные поля, пустой объект — ключ целиком);
//   • ИТОГИ: общий итог дней явки НЕ показывается (заявка);
//     итоги талонов — ОТДЕЛЬНО 12ч и 8ч (чипы шапки
//     wstTotalT12Chip/wstTotalT8Chip + ячейки Итого
//     wstTotalT12/wstTotalT8; ячейка «Дней явки» в Итого —
//     пустая);
//   • ДВОЙНОЕ ПОПАДАНИЕ В ОТЧЁТ: группа печатного отчёта
//     определяется НЕНАЛЕВЫМ количеством талонов категории
//     (t12 > 0 → «12 часовые», t8 > 0 → «8 часовые»; обе > 0 —
//     работник В ОБОИХ группах со своими числами: часы t12×12 /
//     t8×8, талоны t12/t8, ИТОГО каждой группы — сумма своей
//     категории); обе категории нулевые — прежний fallback по
//     типу («сменный» → «12 часовые»);
//   • СОРТИРОВКА ПО АЛФАВИТУ ФАМИЛИЙ: модель _talonsRows
//     сортирует строки по фамилии (первое слово ФИО,
//     localeCompare 'ru', вторичный ключ — полное ФИО) — единый
//     порядок экранной страницы и печати.
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

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

function methodText(src, name) {
    const m = extractMethod(src, name);
    if (m === null) throw new Error('метод не найден: ' + name);
    return m;
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const NOW = new Date();
const NOWY = NOW.getFullYear();
const NOWM = NOW.getMonth() + 1;
const MM = (NOWM < 10 ? '0' + NOWM : '' + NOWM);
const MONTH_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
                     'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const D = (md) => (NOWY + '-' + md);
// Срез модуля WorkSchedule (имена методов неуникальны в монолите)
const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// Значение строковой константы _TALONS_PRINT_CSS (паттерн 448–450)
const TALONS_CSS_VALUE = new Function('return ({' + (function() {
    const start = WS_SRC.indexOf('_TALONS_PRINT_CSS:');
    const marker = "'#wsPrintSheet.wst-sheet .wst-c7 { width: 22.2%; }',";
    const end = WS_SRC.indexOf(marker, start);
    if (start === -1 || end === -1) throw new Error('_TALONS_PRINT_CSS не найден');
    return WS_SRC.slice(start, end + marker.length);
})() + '})._TALONS_PRINT_CSS;')();

// ============================================================
// 1. SRC — модель: категории 12/8, правки, сортировка, итоги
// ============================================================
describe('Task 451 — SRC: модель _talonsRows', () => {

    test('авто-категории ПО ДНЯМ месяца (Task 452: 7,2/8 → 8ч, 12 → 12ч)', () => {
        const fn = stripComments(methodText(WS_SRC, '_talonsRows'));
        assertTrue(fn.indexOf('var agg = this._talonsAgg(eff,') !== -1,
            'агрегация — ПО-ДНЁВНАЯ классификация _talonsAgg');
        assertTrue(fn.indexOf('var days = a ? a.days : 0;') !== -1,
            'дни — счётчик дней _talonsAgg (переработка учтена)');
        assertTrue(fn.indexOf('var auto12 = a ? a.t12 : 0;') !== -1 &&
                   fn.indexOf('var auto8 = a ? a.t8 : 0;') !== -1,
            'авто: талоны категории = дням своей категории по часам');
        assertTrue(fn.indexOf('is12') === -1,
            'тип работника категорию НЕ определяет (заявка Task 452)');
    });

    test('правки: {t12, t8} по категориям, независимо', () => {
        const fn = stripComments(methodText(WS_SRC, '_talonsRows'));
        assertTrue(fn.indexOf('var edit = this._TALONS_EDIT[tab] || {};') !== -1,
            'правки работника — объект категорий');
        assertTrue(fn.indexOf('if (edit.t12 !== undefined && edit.t12 !== auto12)') !== -1 &&
                   fn.indexOf('if (edit.t8 !== undefined && edit.t8 !== auto8)') !== -1,
            'каждая категория перекрывается своей правкой независимо');
        assertTrue(fn.indexOf('edited12: e12, edited8: e8') !== -1,
            'строка несёт флаги правок по категориям');
        assertTrue(fn.indexOf('auto12: auto12, auto8: auto8') !== -1,
            'строка несёт авто-количества (для data-auto полей)');
    });

    test('итоги: t12/t8/edited — БЕЗ общего days/talons', () => {
        const fn = stripComments(methodText(WS_SRC, '_talonsRows'));
        assertEqual(fn.indexOf('var totals = { t12: 0, t8: 0, edited: 0 };') !== -1, true,
            'итоги — только по категориям и правкам (общий итог дней явки не считается — заявка)');
        assertTrue(fn.indexOf('totals.t12 += t12;') !== -1 &&
                   fn.indexOf('totals.t8 += t8;') !== -1,
            'суммы считаются отдельно 12ч и 8ч');
        assertTrue(fn.indexOf('totals.days') === -1 && fn.indexOf('totals.talons') === -1,
            'прежних общих итогов больше нет');
    });

    test('сортировка ПО АЛФАВИТУ ФАМИЛИЙ (первое слово ФИО)', () => {
        const fn = stripComments(methodText(WS_SRC, '_talonsRows'));
        const iFam = fn.indexOf('var famOf = function(r)');
        assertTrue(iFam !== -1, 'хелпер извлечения фамилии');
        const seg = fn.slice(iFam, iFam + 300);
        assertTrue(seg.indexOf("var sp = s.indexOf(' ');") !== -1 &&
                   seg.indexOf('return sp === -1 ? s : s.slice(0, sp);') !== -1,
            'фамилия — первое слово ФИО (до пробела)');
        assertTrue(fn.indexOf("rows.sort(function(a, b) {") !== -1 &&
                   fn.indexOf("localeCompare(famOf(b), 'ru')") !== -1,
            'строки сортируются по фамилии, локаль ru');
        assertTrue(fn.indexOf("String(a.emp['ФИО'] || '')") !== -1 &&
                   fn.indexOf("String(b.emp['ФИО'] || '')") !== -1,
            'вторичный ключ — полное ФИО (однофамильцы)');
    });
});

// ============================================================
// 2. SRC — экранная страница: две колонки, итоги без дней
// ============================================================
describe('Task 451 — SRC: рендер страницы', () => {

    test('колонка «Выдано талонов» РАЗДЕЛЕНА на 12ч и 8ч', () => {
        const fn = stripComments(methodText(WS_SRC, '_renderTalonsPage'));
        assertTrue(fn.indexOf('<th class="wst-c-tal">Выдано 12 ч. талонов</th>') !== -1 &&
                   fn.indexOf('<th class="wst-c-tal">Выдано 8 ч. талонов</th>') !== -1,
            'два заголовка — по категории (заявка)');
        assertTrue(fn.indexOf('>Выдано талонов<') === -1,
            'общей колонки «Выдано талонов» больше нет');
        // две ячейки на строку — по категории
        assertTrue(fn.indexOf("talCell(row, 't12')") !== -1 &&
                   fn.indexOf("talCell(row, 't8')") !== -1,
            'строка зовёт talCell для обеих категорий');
    });

    test('talCell: input с data-cat/data-auto, бейдж к авто категории', () => {
        const fn = stripComments(methodText(WS_SRC, '_renderTalonsPage'));
        const iT = fn.indexOf('var talCell = function(row, cat)');
        assertTrue(iT !== -1, 'хелпер ячейки категории');
        const seg = fn.slice(iT, iT + 900);
        assertTrue(seg.indexOf("var auto = (cat === 't12') ? row.auto12 : row.auto8;") !== -1,
            'авто-количество категории — из модели (data-auto)');
        assertTrue(seg.indexOf('" data-cat="\' + cat + \'" data-auto="\' + auto +') !== -1,
            'input несёт data-cat и data-auto');
        assertTrue(seg.indexOf("var editedCat = (cat === 't12') ? row.edited12 : row.edited8;") !== -1,
            'подсветка правки — по своей категории');
        assertTrue(seg.indexOf('var diff = val - auto;') !== -1,
            'бейдж разницы — против авто категории');
    });

    test('чипы и Итого: 12/8 отдельно, общий итог дней НЕ показывается', () => {
        const fn = stripComments(methodText(WS_SRC, '_renderTalonsPage'));
        assertTrue(fn.indexOf('12 ч. талонов: <b id="wstTotalT12Chip">') !== -1 &&
                   fn.indexOf('8 ч. талонов: <b id="wstTotalT8Chip">') !== -1,
            'чипы итогов — по категориям');
        assertTrue(fn.indexOf('Дней явки: <b') === -1,
            'чипа общего итога дней явки больше нет (заявка)');
        assertTrue(fn.indexOf('<td class="wst-c-tal" id="wstTotalT12">') !== -1 &&
                   fn.indexOf('<td class="wst-c-tal" id="wstTotalT8">') !== -1,
            'итоговая строка — суммы 12/8 раздельно');
        // ячейка «Дней явки» в Итого — ПУСТАЯ (без id и числа)
        const iTot = fn.indexOf("'</tbody><tfoot><tr>'");
        const seg = fn.slice(iTot, iTot + 400);
        assertTrue(seg.indexOf('<td class="wst-c-days"></td>') !== -1,
            'ячейка «Дней явки» в Итого — пустая (итог дней не указывается)');
        assertTrue(seg.indexOf('wstTotalDays') === -1,
            'id итога дней удалён');
        // пересчёт чипов — по категориям
        const upd = stripComments(methodText(WS_SRC, '_talonsUpdateTotals'));
        assertTrue(upd.indexOf("set('wstTotalT12Chip', model.totals.t12)") !== -1 &&
                   upd.indexOf("set('wstTotalT8Chip', model.totals.t8)") !== -1 &&
                   upd.indexOf("set('wstTotalT12', model.totals.t12)") !== -1 &&
                   upd.indexOf("set('wstTotalT8', model.totals.t8)") !== -1,
            'точечный пересчёт — 12/8 раздельно');
        assertTrue(upd.indexOf('wstTotalDays') === -1 &&
                   upd.indexOf('wstTotalTalons') === -1,
            'прежних общих итогов в пересчёте нет');
    });

    test('onTalonsInput: категория + авто; пустой объект правок — ключ целиком', () => {
        const fn = stripComments(methodText(WS_SRC, 'onTalonsInput'));
        assertTrue(fn.indexOf("if (cat !== 't12' && cat !== 't8') return;") !== -1,
            'гейт категории');
        assertTrue(fn.indexOf('delete cur[cat];') !== -1 &&
                   fn.indexOf('if (Object.keys(cur).length === 0) {') !== -1 &&
                   fn.indexOf('delete this._TALONS_EDIT[tab];') !== -1,
            'снятие категории; пустой объект — ключ удаляется целиком');
        assertTrue(fn.indexOf('e[cat] = val;') !== -1,
            'правка пишется в свою категорию');
    });
});

// ============================================================
// 3. SRC — печать: двойные группы + черта-призрак
// ============================================================
describe('Task 451 — SRC: печатная форма', () => {

    test('двойное попадание: t12 > 0 → «12 часовые», t8 > 0 → «8 часовые»', () => {
        const fn = stripComments(methodText(WS_SRC, '_buildTalonsPrintHtml'));
        assertTrue(fn.indexOf('if (t12 > 0) g12.push(row);') !== -1 &&
                   fn.indexOf('if (t8 > 0) g8.push(row);') !== -1,
            'обе проверки НЕ взаимоисключающие — работник в ОБОИХ группах (заявка)');
        const iFb = fn.indexOf('if (!t12 && !t8) {');
        assertTrue(iFb !== -1, 'нулевый fallback');
        const seg = fn.slice(iFb, iFb + 400);
        assertTrue(seg.indexOf("tip === 'сменный'") !== -1,
            'обе категории нулевые — прежний признак типа (пустые строки не пропадают)');
    });

    test('числа строк и ИТОГО — по категории группы', () => {
        const fn = stripComments(methodText(WS_SRC, '_buildTalonsPrintHtml'));
        assertTrue(fn.indexOf("rowsOf(g12, 12, 't12')") !== -1 &&
                   fn.indexOf("rowsOf(g8, 8, 't8')") !== -1,
            'талоны/часы группы — из своей категории (t12×12 / t8×8)');
        assertTrue(fn.indexOf("groupSum(g12, 't12')") !== -1 &&
                   fn.indexOf("groupSum(g8, 't8')") !== -1,
            'ИТОГО групп — суммы своей категории');
    });

    test('черта подписи — по длине САМОЙ ДЛИННОЙ фамилии (призрак)', () => {
        const fn = stripComments(methodText(WS_SRC, '_buildTalonsPrintHtml'));
        const iS = fn.indexOf("var signNames = ['Игушов Н.В.', 'Котельникова И.А.', 'Фензель В.П.']");
        assertTrue(iS !== -1, 'список фамилий подписантов');
        const seg = fn.slice(iS, iS + 400);
        assertTrue(seg.indexOf('signNames[si].length > longest.length') !== -1,
            'longest — самая длинная фамилия (по символам)');
        assertTrue(seg.indexOf("if (signNames[si].length > longest.length) {") !== -1,
            'цикл выбора longest');
        // всем трём блокам передаётся одинаковый longest
        assertEqual((fn.match(/, longest\) \+/g) || []).length, 3,
            'все три _talonsSignBlock получают longest');
    });

    test('CSS: черта — border-bottom бокса по ширине призрака', () => {
        const css = TALONS_CSS_VALUE;
        assertTrue(css.indexOf('.wst-sign-table td.wst-s-name { text-align: center; }') !== -1,
            'фамилия — по центру колонок 6–7 (черта центрирована вместе с ней)');
        assertTrue(css.indexOf('.wst-s-nbox { position: relative; display: inline-block; border-bottom: 1px solid #000;') !== -1,
            'черта — border-bottom бокса .wst-s-nbox');
        assertTrue(css.indexOf('.wst-s-gh { visibility: hidden; white-space: nowrap; }') !== -1,
            'призрак .wst-s-gh — невидимый текст задаёт ширину');
        assertTrue(css.indexOf('.wst-s-nm { position: absolute; left: 0; right: 0; top: 0; text-align: center;') !== -1,
            'фамилия — поверх призрака, по центру черты');
        assertTrue(css.indexOf('border-top: 1px solid #000; }') === -1,
            'черта на всю ширину колонок (border-top, Task 450) удалена');
    });
});

// ============================================================
// 4. VM — модель: категории, двойные правки, сортировка
// ============================================================
describe('Task 451 — VM: _talonsRows', () => {

    const EMP = [
        { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
          'должность': 'Слесарь КИПиА' },
        { 'таб_номер': '024', 'ФИО': 'Гусев Г. Г.', 'тип': 'сменный', 'смена': 3,
          'должность': 'Электромонтёр' }
    ];

    function rowsHost(opts) {
        opts = opts || {};
        return new Function('return ({' +
            methodText(WS_SRC, '_talonsMonthInfo') + ',\n' +
            methodText(WS_SRC, '_talonsEffectiveEntries') + ',\n' +
            methodText(WS_SRC, '_talonsRows') + ',\n' +
            methodText(WS_SRC, '_talonsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsZero') + ',\n' +
            methodText(WS_SRC, '_empTypeMap') + ',\n' +
            methodText(WS_SRC, '_codeHours') + ',\n' +
            methodText(WS_SRC, '_overHours') + ',\n' +
            methodText(WS_SRC, '_statusMeta') + ',\n' +
            '_EMPLOYEES: ' + JSON.stringify(opts.employees || EMP) + ',' +
            '_ENTRIES: ' + JSON.stringify(opts.entries || []) + ',' +
            '_PENDING: ' + JSON.stringify(opts.pending || {}) + ',' +
            '_TALONS_EDIT: ' + JSON.stringify(opts.edits || {}) + ',' +
            '_year: ' + NOWY + ', _month: ' + NOWM + ',' +
            '_STATUS_CODES: [],' +
            '});')();
    }
    // строка по табельному (сортировка по алфавиту перемешивает
    // порядок — ищем по ключу, не по индексу)
    const byTab = function(m, tab) {
        for (let i = 0; i < m.rows.length; i++) {
            if (m.rows[i].tab === tab) return m.rows[i];
        }
        return null;
    };

    test('авто ПО ДНЯМ: Д8 → 8ч талоны, Н → 12ч (тип не важен)', () => {
        const h = rowsHost({ entries: [
            { 'дата': D(MM + '-01'), 'таб_номер': '017', 'статус': 'Д8' },
            { 'дата': D(MM + '-02'), 'таб_номер': '017', 'статус': 'Д8' },
            { 'дата': D(MM + '-03'), 'таб_номер': '024', 'статус': 'Н' },
            { 'дата': D(MM + '-04'), 'таб_номер': '024', 'статус': 'Н' }
        ] });
        const m = h._talonsRows();
        const iv = byTab(m, '017');
        assertEqual(iv.t8, 2, 'Иванов (дневной): 2 дня Д8 → 2 талона 8ч (по часам дней)');
        assertEqual(iv.t12, 0, 'Иванов: 12ч авто = 0');
        assertEqual(iv.auto8, 2, 'авто 8ч = 2');
        assertEqual(iv.auto12, 0, 'авто 12ч = 0');
        const gu = byTab(m, '024');
        assertEqual(gu.t12, 2, 'Гусев (сменный): 2 дня Н → 2 талона 12ч (по часам дней)');
        assertEqual(gu.t8, 0, 'Гусев: 8ч авто = 0');
        assertEqual(m.totals.t12, 2, 'итог 12ч = 2');
        assertEqual(m.totals.t8, 2, 'итог 8ч = 2');
        assertEqual(m.totals.edited, 0, 'правок нет');
    });

    test('правка ОБЕИХ категорий у одного работника — обе живут', () => {
        const h = rowsHost({ entries: [
            { 'дата': D(MM + '-01'), 'таб_номер': '017', 'статус': 'Д8' },
            { 'дата': D(MM + '-02'), 'таб_номер': '017', 'статус': 'Д8' },
            { 'дата': D(MM + '-03'), 'таб_номер': '017', 'статус': 'Д8' }
        ], edits: { '017': { t12: 2, t8: 5 } } });
        const m = h._talonsRows();
        const iv = byTab(m, '017');
        assertEqual(iv.days, 3, 'явок 3');
        assertEqual(iv.t12, 2, 'правка 12ч = 2 (авто было 0)');
        assertEqual(iv.t8, 5, 'правка 8ч = 5 (авто было 3)');
        assertTrue(iv.edited12, 'правка 12ч помечена');
        assertTrue(iv.edited8, 'правка 8ч помечена');
        assertTrue(iv.edited, 'строка правленая');
        assertEqual(m.totals.t12, 2, 'итог 12ч = 2');
        assertEqual(m.totals.t8, 5, 'итог 8ч = 5');
        assertEqual(m.totals.edited, 1, 'ОДНА правка (работник, не категория)');
    });

    test('правка СВОЕЙ категории до явок снимается (= авто)', () => {
        // Иванов дневной, 3 явки → авто 8ч = 3; правка t8 = 3 — НЕ правка
        const h = rowsHost({ entries: [
            { 'дата': D(MM + '-01'), 'таб_номер': '017', 'статус': 'Д8' },
            { 'дата': D(MM + '-02'), 'таб_номер': '017', 'статус': 'Д8' },
            { 'дата': D(MM + '-03'), 'таб_номер': '017', 'статус': 'Д8' }
        ], edits: { '017': { t8: 3, t12: 1 } } });
        const m = h._talonsRows();
        const iv = byTab(m, '017');
        assertFalse(iv.edited8, 't8 = авто 3 — правкой НЕ считается');
        assertEqual(iv.t8, 3, 'значение — авто');
        assertTrue(iv.edited12, 't12 = 1 ≠ авто 0 — правка жива');
        assertEqual(m.totals.edited, 1, 'одна правка (только 12ч)');
    });

    test('сортировка ПО АЛФАВИТУ ФАМИЛИЙ (не порядок шахматки)', () => {
        const h = rowsHost({ employees: [
            { 'таб_номер': '050', 'ФИО': 'Сидоров С. С.', 'тип': 'сменный',
              'должность': 'Электрик' },
            { 'таб_номер': '017', 'ФИО': 'Мухин М. М.', 'тип': 'дневной',
              'должность': 'Слесарь КИПиА' },
            { 'таб_номер': '024', 'ФИО': 'Андреев А. А.', 'тип': 'дневной',
              'должность': 'Электрик' }
        ], entries: [
            { 'дата': D(MM + '-01'), 'таб_номер': '050', 'статус': 'Н' },
            { 'дата': D(MM + '-01'), 'таб_номер': '024', 'статус': 'Д8' }
        ] });
        const m = h._talonsRows();
        assertEqual(m.rows.map(function(r) { return r.emp['ФИО']; }).join('|'),
            'Андреев А. А.|Мухин М. М.|Сидоров С. С.',
            'алфавит фамилий: Андреев → Мухин → Сидоров');
    });
});

// ============================================================
// 5. VM — onTalonsInput: обе категории независимо
// ============================================================
describe('Task 451 — VM: onTalonsInput по категориям', () => {

    function inputHost(cat) {
        const el = {
            _v: '', _cls: 'wst-count',
            get value() { return this._v; },
            set value(x) { this._v = x; },
            get className() { return this._cls; },
            set className(x) { this._cls = x; },
            getAttribute: function(k) {
                if (k === 'data-tab') return '024';
                if (k === 'data-cat') return cat;
                if (k === 'data-auto') return (cat === 't12') ? '3' : '0';
                return null;
            },
            parentNode: null
        };
        const badge = { textContent: '', className: 'wst-diff', hidden: true };
        el.parentNode = { querySelector: function(sel) {
            return (sel === '.wst-diff') ? badge : null;
        } };
        const dom = {
            _vals: {},
            getElementById: function(id) {
                if (!this._vals.hasOwnProperty(id)) {
                    this._vals[id] = { textContent: '', hidden: false };
                }
                return this._vals[id];
            }
        };
        const h = new Function('document', 'return ({' +
            methodText(WS_SRC, '_talonsMonthInfo') + ',\n' +
            methodText(WS_SRC, '_talonsEffectiveEntries') + ',\n' +
            methodText(WS_SRC, '_talonsRows') + ',\n' +
            methodText(WS_SRC, '_talonsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsZero') + ',\n' +
            methodText(WS_SRC, '_empTypeMap') + ',\n' +
            methodText(WS_SRC, 'onTalonsInput') + ',\n' +
            methodText(WS_SRC, '_talonsUpdateTotals') + ',\n' +
            '_codeHours: function(c) { return ({ "Д": 12, "Н": 12, "Д8": 8 })[c] || 0; },' +
            '_overHours: function() { return 0; },' +
            '_statusMeta: function() { return null; },' +
            '_esc: function(s) { return String(s); },' +
            "_escAttr: function(s) { return String(s); }," +
            '_EMPLOYEES: [{ "таб_номер": "024", "ФИО": "Гусев Г. Г.", "тип": "сменный", "должность": "Электрик" }],' +
            '_ENTRIES: ' + JSON.stringify([
                { 'дата': NOWY + '-' + MM + '-01', 'таб_номер': '024', 'статус': 'Н' },
                { 'дата': NOWY + '-' + MM + '-02', 'таб_номер': '024', 'статус': 'Н' },
                { 'дата': NOWY + '-' + MM + '-03', 'таб_номер': '024', 'статус': 'Н' }]) + ',' +
            '_PENDING: {},' +
            '_TALONS_EDIT: {},' +
            '_year: ' + NOWY + ', _month: ' + NOWM + ',' +
            '_STATUS_CODES: [],' +
            '});')(dom);
        h._el = el;
        h._badge = badge;
        h._dom = dom;
        return h;
    }

    test('правка 8ч у СМЕННОГО (авто 0) — вторая категория работает', () => {
        const h = inputHost('t8');
        h._el._v = '4';
        h.onTalonsInput(h._el);
        assertEqual(h._TALONS_EDIT['024'].t8, 4, 'правка 8ч у сменного сохранена');
        assertEqual(h._badge.textContent, '+4', 'бейдж: +4 к авто 0');
        // итог: авто 12ч = 3 явкам (без правки) + правка 8ч = 4
        assertEqual(h._dom._vals['wstTotalT12'].textContent, '3',
            'итог 12ч — авто по явкам');
        assertEqual(h._dom._vals['wstTotalT8'].textContent, '4',
            'итог 8ч — правка');
        assertEqual(h._dom._vals['wstEditCount'].textContent, '1',
            'одна правка');
    });

    test('обе категории правятся независимо (t12 + t8 одного работника)', () => {
        const h = inputHost('t8');
        h._TALONS_EDIT['024'] = { t12: 6 };
        h._el._v = '2';
        h.onTalonsInput(h._el);
        assertEqual(h._TALONS_EDIT['024'].t8, 2, 'правка t8 добавлена');
        assertEqual(h._TALONS_EDIT['024'].t12, 6, 'правка t12 не тронута');
        assertEqual(h._dom._vals['wstTotalT12'].textContent, '6',
            'итог 12ч = 6 (правка)');
        assertEqual(h._dom._vals['wstTotalT8'].textContent, '2',
            'итог 8ч = 2 (правка)');
        assertEqual(h._dom._vals['wstEditCount'].textContent, '1',
            'правок — один работник');
    });

    test('снятие последней категории удаляет ключ работника', () => {
        const h = inputHost('t12');
        h._TALONS_EDIT['024'] = { t12: 9 };
        h._el._v = '3'; // = авто 12ч (3 явки) → правка снята
        h.onTalonsInput(h._el);
        assertFalse(Object.prototype.hasOwnProperty.call(h._TALONS_EDIT, '024'),
            'последняя категория снята — ключ удалён целиком');
        assertEqual(h._dom._vals['wstTotalT12'].textContent, '3',
            'итог вернулся к авто');
        assertEqual(h._dom._vals['wstEditCount'].textContent, '0', 'правок 0');
    });

    test('чужая категория игнорируется (гейт data-cat)', () => {
        const h = inputHost('t9');
        h._el._v = '7';
        h.onTalonsInput(h._el);
        assertEqual(JSON.stringify(h._TALONS_EDIT), '{}',
            'неизвестная категория — правка не пишется');
    });
});

// ============================================================
// 6. VM — печать: двойное попадание + сортировка + черта
// ============================================================
describe('Task 451 — VM: печатная форма', () => {

    function printDom() {
        const elements = {};
        const reg = function(el) { if (el.id) elements[el.id] = el; };
        function makeEl(tag) {
            const el = {
                tag: tag, id: '', className: '', innerHTML: '',
                children: [], style: {}, attrs: {}, listeners: {},
                parentNode: null, srcdoc: '', contentDocument: null,
                addEventListener: function(type, fn) {
                    (el.listeners[type] = el.listeners[type] || []).push(fn);
                },
                removeEventListener: function(type, fn) {
                    el.listeners[type] = (el.listeners[type] || [])
                        .filter(f => f !== fn);
                },
                dispatch: function(type, ev) {
                    (el.listeners[type] || []).slice().forEach(fn => fn(ev || {}));
                },
                setAttribute: function(k, v) { el.attrs[k] = v; },
                appendChild: function(c) {
                    c.parentNode = el;
                    el.children.push(c);
                    reg(c);
                    return c;
                },
                removeChild: function(c) {
                    el.children = el.children.filter(x => x !== c);
                    if (elements[c.id] === c) delete elements[c.id];
                },
                querySelector: function(sel) {
                    const cls = sel.replace(/^\./, '');
                    const find = function(root) {
                        for (let i = 0; i < root.children.length; i++) {
                            const ch = root.children[i];
                            if (String(ch.className || '')
                                    .split(/\s+/).indexOf(cls) !== -1) return ch;
                            const r = find(ch);
                            if (r) return r;
                        }
                        return null;
                    };
                    const found = find(el);
                    if (found) return found;
                    if (!el._qcache) el._qcache = {};
                    if (!el._qcache[cls]) el._qcache[cls] = makeEl('button');
                    return el._qcache[cls];
                }
            };
            return el;
        }
        const body = makeEl('body');
        const head = makeEl('head');
        return {
            document: {
                createElement: makeEl,
                getElementById: function(id) { return elements[id] || null; },
                body: body,
                head: head
            },
            elements: elements,
            body: body,
            head: head
        };
    }

    function printHost(dom, employees, entries, edits) {
        return new Function('KipToast', 'window', 'document', 'return ({' +
            methodText(WS_SRC, '_talonsMonthInfo') + ',\n' +
            methodText(WS_SRC, '_talonsEffectiveEntries') + ',\n' +
            methodText(WS_SRC, '_talonsRows') + ',\n' +
            methodText(WS_SRC, '_talonsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsAgg') + ',\n' +
            methodText(WS_SRC, '_totalsZero') + ',\n' +
            methodText(WS_SRC, '_empTypeMap') + ',\n' +
            methodText(WS_SRC, '_buildTalonsPrintHtml') + ',\n' +
            methodText(WS_SRC, '_talonsColgroup') + ',\n' +
            methodText(WS_SRC, '_talonsTextWidth') + ',\n' +
            methodText(WS_SRC, '_talonsPosition') + ',\n' +
            methodText(WS_SRC, '_talonsSignBlock') + ',\n' +
            '_TALONS_PRINT_CSS: ' + JSON.stringify(TALONS_CSS_VALUE) + ',\n' +
            '_codeHours: function(c) { return ({ "Д": 12, "Н": 12, "Д8": 8 })[c] || 0; },' +
            '_overHours: function() { return 0; },' +
            '_statusMeta: function() { return null; },' +
            '_esc: function(s) { return String(s); },' +
            '_EMPLOYEES: ' + JSON.stringify(employees) + ',' +
            '_ENTRIES: ' + JSON.stringify(entries) + ',' +
            '_PENDING: {},' +
            '_TALONS_EDIT: ' + JSON.stringify(edits || {}) + ',' +
            '_year: ' + NOWY + ', _month: ' + NOWM + ',' +
            '_viewLevel: \'edit\', _canEdit: true,' +
            '_STATUS_CODES: [],' +
            '});')(undefined, { print: function() {} }, dom.document);
    }

    // Смена: Гусев (сменный, 3 явки), Иванов (дневной, 2 явки)
    const EMP = [
        { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
          'должность': 'Слесарь КИПиА' },
        { 'таб_номер': '024', 'ФИО': 'Гусев Г. Г.', 'тип': 'сменный',
          'должность': 'Электромонтёр' }
    ];
    const ENTRIES = [
        { 'дата': NOWY + '-' + MM + '-01', 'таб_номер': '017', 'статус': 'Д8' },
        { 'дата': NOWY + '-' + MM + '-02', 'таб_номер': '017', 'статус': 'Н' },
        { 'дата': NOWY + '-' + MM + '-03', 'таб_номер': '024', 'статус': 'Д' },
        { 'дата': NOWY + '-' + MM + '-04', 'таб_номер': '024', 'статус': 'Н' },
        { 'дата': NOWY + '-' + MM + '-05', 'таб_номер': '024', 'статус': 'Н' }
    ];

    test('двойное попадание: работник с 12ч И 8ч — в ОБОИХ группах', () => {
        // Иванову (дневной, 2 явки) правкой указали и 12ч (2), и 8ч (5)
        const h = printHost(printDom(), EMP, ENTRIES, { '017': { t12: 2, t8: 5 } });
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        const i12 = html.indexOf('>12 часовые<');
        const i8 = html.indexOf('>8 часовые<');
        const iGus = html.indexOf('Гусев Г. Г.');
        // Иванов — ДВАЖДЫ: в 12-часовых (2 талона) и в 8-часовых (5)
        assertEqual((html.match(/Иванов И\. И\./g) || []).length, 2,
            'Иванов в отчёте ДВАЖДЫ (обе категории — заявка)');
        const iIvan12 = html.indexOf('Иванов И. И.');
        const iIvan8 = html.indexOf('Иванов И. И.', iIvan12 + 1);
        assertTrue(iIvan12 > i12 && iIvan12 < i8,
            'первое вхождение Иванова — в группе «12 часовые»');
        assertTrue(iIvan8 > i8, 'второе вхождение — в группе «8 часовые»');
        assertTrue(iGus > i12 && iGus < i8, 'Гусев (сменный, 3 явки) — в 12-часовых');
        // числа: Иванов 12ч: 2 талона / 24 часа; 8ч: 5 талонов / 40 часов
        assertTrue(html.indexOf('>24</td>') !== -1, 'Иванов 12ч: 2 × 12 = 24 часа');
        assertTrue(html.indexOf('>40</td>') !== -1, 'Иванов 8ч: 5 × 8 = 40 часов');
        // ИТОГО: 12ч = Гусев 3 + Иванов 2 = 5; 8ч = Иванов 5
        const i12t = html.indexOf('<td colspan="5" class="wst-t-itog">ИТОГО: 12 часовые</td>');
        const i8t = html.indexOf('<td colspan="5" class="wst-t-itog">8 часовые</td>');
        const v5 = html.indexOf('<td class="wst-t-val">5</td>');
        assertTrue(v5 !== -1 && v5 > i12t && v5 < i8t,
            'ИТОГО 12 часовые = 5 (Гусев 3 + Иванов 2)');
        const v8 = html.indexOf('<td class="wst-t-val">5</td>', i8t);
        assertTrue(v8 !== -1, 'ИТОГО 8 часовые = 5 (только Иванов)');
        // сквозная нумерация: Гусев №1, Иванов №2 (12ч), Иванов №3 (8ч)
        assertTrue(html.indexOf('<td class="wst-r-n">3</td>') !== -1,
            'три строки данных (Гусев + Иванов×2)');
    });

    test('сортировка: внутри групп — по алфавиту фамилий', () => {
        const employees = [
            { 'таб_номер': '050', 'ФИО': 'Сидоров С. С.', 'тип': 'сменный',
              'должность': 'Электрик' },
            { 'таб_номер': '024', 'ФИО': 'Гусев Г. Г.', 'тип': 'сменный',
              'должность': 'Электрик' },
            { 'таб_номер': '017', 'ФИО': 'Андреев А. А.', 'тип': 'сменный',
              'должность': 'Электрик' }
        ];
        const entries = [
            { 'дата': NOWY + '-' + MM + '-01', 'таб_номер': '050', 'статус': 'Н' },
            { 'дата': NOWY + '-' + MM + '-01', 'таб_номер': '024', 'статус': 'Н' },
            { 'дата': NOWY + '-' + MM + '-01', 'таб_номер': '017', 'статус': 'Н' }
        ];
        const h = printHost(printDom(), employees, entries, {});
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        const iA = html.indexOf('Андреев А. А.');
        const iG = html.indexOf('Гусев Г. Г.');
        const iS = html.indexOf('Сидоров С. С.');
        assertTrue(iA !== -1 && iG !== -1 && iS !== -1 &&
                   iA < iG && iG < iS,
            'в группе «12 часовые»: Андреев → Гусев → Сидоров (алфавит)');
    });

    test('обе категории нулевые — fallback по типу (пустые строки живы)', () => {
        // Иванов дневной без записей: t12=0, t8=0 → «8 часовые» с нулями
        const h = printHost(printDom(), EMP, [], {});
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        const i12 = html.indexOf('>12 часовые<');
        const i8 = html.indexOf('>8 часовые<');
        const iGus = html.indexOf('Гусев Г. Г.');
        const iIvan = html.indexOf('Иванов И. И.');
        assertEqual((html.match(/Иванов И\. И\./g) || []).length, 1,
            'нулевые категории — ОДНО вхождение (fallback, без дублей)');
        assertTrue(iGus > i12 && iGus < i8, 'Гусев (сменный, 0) — fallback в 12-часовых');
        assertTrue(iIvan > i8, 'Иванов (дневной, 0) — fallback в 8-часовых');
        assertEqual((html.match(/wst-t-val">0</g) || []).length, 2,
            'обе группы — нулевые суммы (работники с нулями показаны)');
    });

    test('подписи: призрак longest «Котельникова И.А.» во всех трёх блоках', () => {
        const h = printHost(printDom(), EMP, ENTRIES, {});
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        // черта по длине САМОЙ ДЛИННОЙ фамилии — призрак одинаков у всех
        assertEqual((html.match(/<span class="wst-s-gh">Котельникова И\.А\.<\/span>/g) || []).length, 3,
            'призрак «Котельникова И.А.» (16 симв.) — во всех трёх подписях');
        assertEqual((html.match(/<span class="wst-s-nm">/g) || []).length, 3,
            'три фамилии поверх призраков');
        assertTrue(html.indexOf('<span class="wst-s-nm">Игушов Н.В.</span>') !== -1 &&
                   html.indexOf('<span class="wst-s-nm">Котельникова И.А.</span>') !== -1 &&
                   html.indexOf('<span class="wst-s-nm">Фензель В.П.</span>') !== -1,
            'фамилии подписантов на месте');
        // боксы черты + пояснения
        assertEqual((html.match(/wst-s-nbox/g) || []).length, 3, 'три бокса черты');
        assertEqual((html.match(/\(ф\.и\.о\.\)/g) || []).length, 3,
            'три пояснения «(ф.и.о.)» — по центру черты (CSS)');
        assertEqual((html.match(/wst-s-fio/g) || []).length, 0,
            'прежнего класса border-top больше нет');
    });

    test('одна страница не разъехалась: высоты блоков не изменились', () => {
        // черта — border-bottom вместо строки текста: высота строк
        // подписей прежняя (пруф одного листа — PDF-эквивалент в
        // браузерном прогоне); проверяем СТРУКТУРНО: призрак не
        // добавляет строк — тот же набор <tr> в sign-table
        const h = printHost(printDom(), EMP, ENTRIES, {});
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        const sign = html.slice(html.indexOf('wst-sign-table'));
        assertEqual((sign.match(/<tr/g) || []).length, 8,
            '8 строк таблицы подписей (3×2 + 2 разделителя) — как до Task 451');
        assertEqual((sign.match(/wst-s-gap/g) || []).length, 2,
            'два разделителя');
    });
});

// ============================================================
// 7. SW — версия кэша
// ============================================================
describe('Task 451 — SW', () => {
    test('SW: кэш поднят до kipia-test-v761 (Task 451)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v761'") !== -1,
            'CACHE_VERSION = kipia-test-v761');
        assertTrue(SW_SRC.indexOf('kipia-test-v762') === -1,
            'kipia-test-v761 не существует');
        assertTrue(SW_SRC.indexOf('Task 451') !== -1,
            'комментарий Task 451 в истории версий');
    });
});

