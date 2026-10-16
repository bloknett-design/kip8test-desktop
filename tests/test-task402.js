// ============================================================
// Task 402 — заявка: «В разделе Табель учёта рабочего времени,
// в столбце работники, в ячейках с фамилиями работников, данные
// типа работника размести в третьей строчке снизу, не меняя при
// этом шрифта и высоты ячеек. В файле табель_КИП_ИОС я добавил
// новый столбец "группа_допуска", необходимо сделать чтобы данные
// из него также редактировались из приложения и отображались
// в приложении после данных "должность"».
//
// 1) ЯЧЕЙКА СЕТКИ: данные ТИПА работника — ТРЕТЬЯ строка (под
//    ФИО и должностью): «смена №1» / «сменный» / «дневной»; шрифт
//    и стили — те же, что у строки должности (10px/400, 12px);
//    высоту ячеек десктопа задаёт растяжка _fitGrid (не меняется),
//    ярусы compact/tight подстроены; сужение (ws-narrow) скрывает
//    строку вместе с должностью; печатная форма прежняя (_posLabel).
// 2) «ГРУППА ДОПУСКА» (столбец «группа_допуска» листа «Сотрудники»,
//    позиция любая — по заголовку строки 1): в ячейке — ПОСЛЕ
//    должности («Слесарь КИПиА · IV»), в карточке — строка после
//    «Должности», в сводной «Общая» — колонка после «Должности»,
//    в шторке — селект (уникальные листа + II/III/IV/V), submit →
//    addEmployee/updateEmployee с полем группа_допуска.
// 3) GAS WorkSchedule.gs: listEmployees отдаёт поле; updateEmployee/
//    addEmployee пишут в столбец по заголовку (guard: старый фронтенд
//    без поля НЕ затирает значение листа); нет столбца — мягкая
//    деградация (пусто / пропуск записи).
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');

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
    return m ? String(m) : '';
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// хост с методами сетки (без DOM)
function gridHost() {
    return new Function('return ({' +
        methodText(INDEX_SRC, '_empPosLine') + ',' +
        methodText(INDEX_SRC, '_shortGrade') + ',' +
        methodText(INDEX_SRC, '_empTipLine') +
        '});')();
}

// ============================================================
// 1. SRC — CSS: строка типа .ws-emp-tip (шрифт должности)
// ============================================================
describe('Task 402 — SRC: CSS строки типа .ws-emp-tip', () => {

    test('база: те же шрифт/стили, что у должности (заявка: «не меняя шрифта»)', () => {
        const i = INDEX_SRC.indexOf('.ws-grid tbody td.ws-emp-col .ws-emp-tip {');
        assertTrue(i !== -1, 'базовое правило .ws-emp-tip есть');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i));
        assertTrue(block.indexOf('font-size: 10px;') !== -1 &&
                   block.indexOf('font-weight: 400;') !== -1,
            'шрифт 10px/400 — как у .ws-emp-pos');
        assertTrue(block.indexOf('line-height: 12px;') !== -1 &&
                   block.indexOf('margin-top: 1px;') !== -1,
            'целый интервал 12px + отступ 1px — как у строки должности (Task 256)');
        assertTrue(block.indexOf('white-space: nowrap;') !== -1 &&
                   block.indexOf('text-overflow: ellipsis;') !== -1,
            'эллипсис своей строки (как ФИО/должность)');
    });

    test('светлая тема — цвет как у должности (#666)', () => {
        const i = INDEX_SRC.indexOf('[data-theme="light"] .ws-grid tbody td.ws-emp-col .ws-emp-tip {');
        assertTrue(i !== -1, 'правило светлой темы есть');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i));
        assertTrue(block.indexOf('color: #666;') !== -1, 'тот же цвет, что у .ws-emp-pos');
    });

    test('сужение (ws-narrow) скрывает строку типа — как должность/таб.№', () => {
        assertTrue(INDEX_SRC.indexOf(
            '.ws-grid.ws-narrow td.ws-emp-col .ws-emp-tip { display: none; }') !== -1,
            'строка типа скрыта в суженном виде (мобайл, горизонтальный скролл)');
    });

    test('ярусы compact/tight — те же подстройки, что у должности', () => {
        const ci = INDEX_SRC.indexOf('.ws-grid-wrap.ws-compact .ws-grid tbody td.ws-emp-col .ws-emp-tip {');
        assertTrue(ci !== -1, 'compact-правило есть');
        assertTrue(INDEX_SRC.slice(ci, INDEX_SRC.indexOf('}', ci)).indexOf('margin-top: 0;') !== -1,
            'compact: без отступа');
        const ti = INDEX_SRC.indexOf('.ws-grid-wrap.ws-tight .ws-grid tbody td.ws-emp-col .ws-emp-tip {');
        assertTrue(ti !== -1, 'tight-правило есть');
        const tb = INDEX_SRC.slice(ti, INDEX_SRC.indexOf('}', ti));
        assertTrue(tb.indexOf('font-size: 9px;') !== -1 &&
                   tb.indexOf('line-height: 10px;') !== -1,
            'tight: 9px/10px — как должность');
    });

    test('высота ячейки НЕ фиксируется: у .ws-emp-tip нет height/padding', () => {
        const i = INDEX_SRC.indexOf('.ws-grid tbody td.ws-emp-col .ws-emp-tip {');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i));
        // line-height содержит подстроку height — ищем СВОЙСТВО height
        assertTrue(!/(?:^|[;{\s])height\s*:/.test(block),
            'своей высоты нет — высоту ячеек задаёт растяжка _fitGrid (десктоп)');
        assertTrue(!/(?:^|[;{\s])padding\s*:/.test(block),
            'своих паддингов нет (паддинги ячейки прежние)');
    });
});

// ============================================================
// 2. SRC — рендер ячейки: третья строка + замер колонки
// ============================================================
describe('Task 402 — SRC: рендер ячейки (тип — третья строка)', () => {

    test('_renderGrid: строки должности и типа — раздельные вызовы', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderGrid'));
        assertTrue(fn.indexOf("var empPosLabel = this._empPosLine(emp);") !== -1,
            'строка должности — _empPosLine (Task 403: без группы, «разряд» → «р.»)');
        assertTrue(fn.indexOf("var empTipLabel = this._empTipLine(emp);") !== -1,
            'данные типа — _empTipLine');
        assertTrue(fn.indexOf("'<div class=\"ws-emp-tip\">' + this._esc(empTipLabel) + '</div>'") !== -1,
            'блок .ws-emp-tip рендерится отдельно от .ws-emp-pos');
    });

    test('td: ФИО → должность → тип (порядок строк в ячейке)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderGrid'));
        // сборка td: empTip идёт ПОСЛЕ empPos (строка типа — последняя)
        assertTrue(fn.indexOf("'</span></div>' + empPos + empTip + '</td>'") !== -1,
            'td: empPos + empTip — тип третьей строкой блока');
        assertTrue(fn.indexOf('<div class="ws-emp-name">') !== -1 &&
                   fn.indexOf("'<div class=\"ws-emp-pos\">'") !== -1 &&
                   fn.indexOf("'<div class=\"ws-emp-tip\">'") !== -1,
            'три блока строки: .ws-emp-name / .ws-emp-pos / .ws-emp-tip');
    });

    test('пустой тип — строка не рендерится (тернарник)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderGrid'));
        const re = /var empTipLabel = this\._empTipLine\(emp\);\s*\n\s*var empTip = empTipLabel\s*\n\s*\? '<div class="ws-emp-tip">/;
        assertTrue(re.test(fn), 'без типа нет пустого блока .ws-emp-tip');
    });

    test('_measureEmpCol: строка типа — в замере ширины колонки', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_measureEmpCol'));
        assertTrue(fn.indexOf(".querySelector('.ws-emp-tip')") !== -1,
            'колонка ФИО — по самому широкому тексту из ТРЁХ строк');
    });

    test('печать использует Тип (Task 439): _empTipLine, _posLabel удалён', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_buildPrintHtml'));
        assertTrue(fn.indexOf('this._empTipLine(') !== -1,
            'печатная форма — Тип под ФИО (Task 439: «только ФИО и Тип»)');
        const grid = stripComments(methodText(INDEX_SRC, '_renderGrid'));
        assertTrue(grid.indexOf('this._posLabel(') === -1,
            'сетка _posLabel не использует (только _empPosLine/_empTipLine)');
        assertFalse(INDEX_SRC.indexOf('_posLabel: function') !== -1,
            'метод _posLabel удалён (Task 439 — потребителей не осталось)');
    });
});

// ============================================================
// 3. VM — _empPosLine / _empTipLine
// ============================================================
describe('Task 402 — VM: _empPosLine / _empTipLine', () => {

    test('_empPosLine: только должность; «разряд» → «р.» (Task 403)', () => {
        const h = gridHost();
        assertEqual(h._empPosLine({ 'должность': 'Слесарь КИПиА', 'группа_допуска': 'IV' }),
            'Слесарь КИПиА', 'группа допуска из столбца ФИО убрана (Task 403)');
        assertEqual(h._empPosLine({ 'должность': 'Слесарь КИПиА' }), 'Слесарь КИПиА',
            'без группы — должность');
        assertEqual(h._empPosLine({ 'группа_допуска': 'IV' }), '',
            'без должности — пусто (группа не показывается)');
        assertEqual(h._empPosLine({}), '', 'пусто — строка не рендерится');
        assertEqual(h._empPosLine({ 'должность': 'Слесарь КИПиА 5 разряд' }),
            'Слесарь КИПиА 5 р.', '«разряд» сокращён до «р.» (Task 403)');
    });

    test('_empTipLine: тип работника — своя строка', () => {
        const h = gridHost();
        assertEqual(h._empTipLine({ 'тип': 'сменный', 'смена': 1 }), 'смена №1',
            'сменный с номером смены');
        assertEqual(h._empTipLine({ 'тип': 'сменный' }), 'сменный',
            'сменный без номера смены');
        assertEqual(h._empTipLine({ 'тип': 'сменный', 'смена': 7 }), 'сменный',
            'номер смены вне 1..5 — просто «сменный»');
        assertEqual(h._empTipLine({ 'тип': 'дневной' }), 'дневной', 'дневной');
        assertEqual(h._empTipLine({}), '', 'без типа — строка не рендерится');
    });
});

// ============================================================
// 4. SRC — карточка работника и сводная «Общая»
// ============================================================
describe('Task 402 — SRC: карточка и сводная таблица', () => {

    test('карточка: «Группа допуска» — строкой ПОСЛЕ «Должности»', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        const iPos = fn.indexOf("['Должность'");
        const iGrp = fn.indexOf("['Группа допуска'");
        const iHire = fn.indexOf("['Дата приёма'");
        assertTrue(iPos !== -1 && iGrp !== -1 && iHire !== -1 &&
                   iPos < iGrp && iGrp < iHire,
            'профиль: Должность → Группа допуска → Дата приёма');
        // Task 402: пустая группа — «—»; Task 434: знак группы в
        // переменной grpVal (после него добавляется дата «от …»)
        assertTrue(fn.indexOf("String(emp['группа_допуска'] || '').trim()" ) !== -1,
            'значение группы — из столбца «группа_допуска»');
        assertTrue(fn.indexOf("['Группа допуска', grpVal || '—']") !== -1,
            'пустая группа — «—» (Task 434: grpVal + дата проверки)');
    });

    test('сводная «Общая»: колонка «Группа допуска» после «Должности»', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        assertTrue(fn.indexOf('<th>Должность</th><th>Группа допуска</th>') !== -1,
            'шапка: Должность → Группа допуска');
        const iPos = fn.indexOf("this._esc(String(emp['должность'] || '')");
        const iGrp = fn.indexOf("this._esc(grpVal || '—')");
        assertTrue(iPos !== -1 && iGrp !== -1 && iPos < iGrp,
            'строки: ячейка группы после должности (Task 445: grpVal + дата проверки)');
    });
});

// ============================================================
// 5. SRC + VM — шторка работника: селект «Группа допуска»
// ============================================================
describe('Task 402 — SRC: шторка работника (селект группы)', () => {

    test('разметка: select wsEmpAccessGroup — в строке с «Должностью»', () => {
        const iPos = INDEX_SRC.indexOf('id="wsEmpPosition"');
        const iGrp = INDEX_SRC.indexOf('id="wsEmpAccessGroup"');
        const iCmt = INDEX_SRC.indexOf('id="wsEmpComment"');
        assertTrue(iPos !== -1 && iGrp !== -1 && iCmt !== -1 &&
                   iPos < iGrp && iGrp < iCmt,
            'Должность → Группа допуска → Комментарий (данные после должности)');
        assertTrue(INDEX_SRC.indexOf('for="wsEmpAccessGroup">Группа допуска</label>') !== -1,
            'лейбл «Группа допуска»');
    });

    test('openEmpEditForm: префилл группы из данных работника', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'openEmpEditForm'));
        assertTrue(fn.indexOf("this._fillGroupSelect(String(emp['группа_допуска'] || '').trim());") !== -1,
            'правка: текущая группа в селект (временная опция, как «Должность» Task 318)');
    });

    test('openEmployeeForm: сброс группы при создании', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'openEmployeeForm'));
        assertTrue(fn.indexOf("this._fillGroupSelect('');") !== -1,
            'создание: группа пустая');
    });

    test('submitEmployeeForm: поле в ОБОИХ payload (update + add)', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'submitEmployeeForm'));
        assertEqual((fn.match(/'группа_допуска': accessGroup,/g) || []).length, 2,
            'группа_допуска в updateEmployee И addEmployee');
        assertTrue(fn.indexOf("var grpSel = document.getElementById('wsEmpAccessGroup');") !== -1,
            'селект читается VM-безопасно (нет селекта — пусто)');
    });

    test('VM: _fillGroupOptions — стандарт + уникальные листа + keep', () => {
        const esc = function(s) { return String(s); };
        const host = new Function('_esc', '_escAttr', 'return ({' +
            methodText(INDEX_SRC, '_fillGroupOptions') +
            ', _esc: _esc, _escAttr: _escAttr});')(esc, esc);
        // уникальные листа (IV дважды + III) + стандарт
        const sel = { value: '', innerHTML: '' };
        host._fillGroupOptions(sel, [
            { 'группа_допуска': 'IV' }, { 'группа_допуска': 'IV' },
            { 'группа_допуска': 'III' }, { 'группа_допуска': '' },
            { 'группа_допуска': '3' }
        ], '');
        const opts = sel.innerHTML.split('<option').slice(1).map(function(o) {
            return o.slice(o.indexOf('>') + 1).replace('</option>', '');
        });
        assertEqual(opts[0], '— не указана —', 'первая опция — пустая');
        assertTrue(opts.indexOf('II') !== -1 && opts.indexOf('III') !== -1 &&
                   opts.indexOf('IV') !== -1 && opts.indexOf('V') !== -1,
            'стандарт II/III/IV/V всегда в списке');
        assertTrue(opts.indexOf('3') !== -1,
            'значение листа «3» (нестандартный формат) тоже в списке');
        assertEqual(opts.filter(function(o) { return o === 'IV'; }).length, 1,
            'дубликаты схлопываются');
        assertEqual(sel.value, '', 'keep пустой — выбрана пустая опция');
        // keep значения, которого нет нигде
        const sel2 = { value: '', innerHTML: '' };
        host._fillGroupOptions(sel2, [], 'VI');
        assertTrue(sel2.innerHTML.indexOf('>VI</option>') !== -1,
            'keep VI добавлен опцией (значение правки сохраняется)');
        assertEqual(sel2.value, 'VI', 'выбрано сохранённое значение');
    });
});

// ============================================================
// 6. SRC — сервер WorkSchedule.gs (справочная копия)
// ============================================================
describe('Task 402 — сервер: WorkSchedule.gs (SRC)', () => {

    test('хелпер _accessGroupColIndex: поиск столбца по заголовку', () => {
        const fn = methodText(WS_GS_SRC, '_accessGroupColIndex');
        assertTrue(fn.indexOf('getLastColumn') !== -1 &&
                   fn.indexOf('lastCol < 12') !== -1,
            'столбцов меньше 12 (A..K) — группы нет (null)');
        assertTrue(fn.indexOf("'группа_допуска'") !== -1 &&
                   fn.indexOf("'группа допуска'") !== -1,
            'оба написания заголовка (подчёркивание/пробел)');
        assertTrue(fn.indexOf('toLowerCase') !== -1 &&
                   fn.indexOf('trim()') !== -1,
            'толерантно к регистру и пробелам вокруг');
    });

    test('VM: _accessGroupColIndex — позиции и мягкая деградация', () => {
        const host = new Function('return ({' +
            methodText(WS_GS_SRC, '_accessGroupColIndex') + '});')();
        const mockSheet = function(heads) {
            return {
                getLastColumn: function() { return heads.length; },
                getRange: function() { return { getValues: function() { return [heads]; } }; }
            };
        };
        const base = ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон_ротации',
                      'старт_цикла', 'дата_приёма', 'дата_увольнения',
                      'в_архиве', 'должность', 'комментарий'];
        assertEqual(host._accessGroupColIndex(mockSheet(base.concat(['группа_допуска']))), 11,
            'стандартная позиция L (индекс 11)');
        assertEqual(host._accessGroupColIndex(mockSheet(base.concat(['Группа допуска']))), 11,
            'пробел вместо подчёркивания');
        assertEqual(host._accessGroupColIndex(
            mockSheet(base.slice(0, 10).concat([' группа_допуска ']).concat(['комментарий']))), 10,
            'любая другая позиция (вставлен между J и K)');
        assertEqual(host._accessGroupColIndex(mockSheet(base)), null,
            'нет столбца — null (обратная совместимость)');
        assertEqual(host._accessGroupColIndex(mockSheet(base.concat(['что-то']))), null,
            'заголовок не совпал — null');
        assertEqual(host._accessGroupColIndex({ getLastColumn: function() { throw new Error('x'); } }), null,
            'сбой листа — null (не падает)');
    });

    test('listEmployees: поле группа_допуска + расширенное чтение', () => {
        const fn = stripComments(methodText(WS_GS_SRC, 'listEmployees'));
        // Task 489-adapt: группа/должность/комментарий — в карте
        // _employeesColMap (по заголовкам строки 1)
        assertTrue(fn.indexOf('var cols = this._employeesColMap(sheet);') !== -1,
            'столбцы ищутся по заголовкам (карта, Task 489)');
        // Task 489-adapt: заголовки ищет карта (listEmployees её
        // вызывает; прямых _headerColIndex-вызовов больше нет)
        const map = stripComments(methodText(WS_GS_SRC, '_employeesColMap'));
        assertTrue(map.indexOf("['должность']") !== -1 &&
                   map.indexOf("['комментарий']") !== -1,
            'должность/комментарий — по заголовкам строки 1 (в карте)');
        assertTrue(fn.indexOf('cols.width') !== -1 &&
                   fn.indexOf('r[cols[') !== -1,
            'чтение до самого правого столбца карты');
        assertTrue(fn.indexOf('группа_допуска:') !== -1 &&
                   fn.indexOf("(cols['группа_допуска'] !== null)") !== -1,
            'поле в ответе; нет столбца — пустая строка');
    });

    test('updateEmployee: запись группы с guard по payload', () => {
        const fn = stripComments(methodText(WS_GS_SRC, 'updateEmployee'));
        assertTrue(fn.indexOf('payload.группа_допуска !== undefined') !== -1,
            'guard: старый фронтенд (кэш SW) без поля НЕ затирает значение листа');
        assertTrue(fn.indexOf("sheet.getRange(row, cols['группа_допуска'] + 1).setValue(accessGroup);") !== -1,
            'запись в столбец по заголовку (карта, Task 489-adapt)');
        assertTrue(fn.indexOf('slice(0, 50)') !== -1, 'значение урезано до 50 симв.');
    });

    test('addEmployee: группа в новой строке листа', () => {
        const fn = stripComments(methodText(WS_GS_SRC, 'addEmployee'));
        // Task 403: строка — до самого правого столбца, реквизиты —
        // каждый в свой (прежде фикс J..K затирал комментарий группой)
        assertTrue(fn.indexOf('while (rowVals.length < rowWidth) rowVals.push(\'\');') !== -1,
            'строка дополнена пустыми до самого правого столбца');
        assertTrue(fn.indexOf("rowVals[cols['должность']] = position;") !== -1 &&
                   fn.indexOf("rowVals[cols['комментарий']] = comment;") !== -1,
            'должность и комментарий — каждый в свой столбец (карта)');
        assertTrue(fn.indexOf("rowVals[cols['группа_допуска']] = accessGroup;") !== -1,
            'группа записана в найденный столбец (карта)');
    });

    test('node --check: .gs синтаксически валиден', () => {
        const { execSync } = require('child_process');
        const tmp = path.join(require('os').tmpdir(), 'task402-ws-check.js');
        fs.writeFileSync(tmp, WS_GS_SRC);
        execSync('node --check ' + JSON.stringify(tmp));
        fs.unlinkSync(tmp);
    });
});

// ============================================================
// 7. SW — версия кэша
// ============================================================
describe('Task 402 — SW: версия кэша', () => {
    test('CACHE_VERSION = kipia-test-v749 (Task 402)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v749'") !== -1,
            'фронтенд менялся — кэш поднят до v629');
    });
    test('guard: v630 отсутствует (следующий бамп)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v750') === -1,
            'v630 ещё не существует (guard следующего бампа)');
    });
});
