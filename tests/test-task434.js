// ============================================================
// Task 434 — заявка (kip8test): «Коды на печати сделать в две
// колонки под названием "Коды:". В картах работников, в блоке
// профиля, после знака группы указывать дату последней
// выполненной проверке знаний до 1000В, в формате "от дд.мм.гггг".
// Также в окнах мероприятий ячеек табеля, дату указывать в
// формате "дд.мм.гггг"».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   КЛИЕНТ (SRC):
//   1) печать — КОДЫ В ДВЕ КОЛОНКИ ПОД НАЗВАНИЕМ «Коды:»
//      (Task 434; строка-абзац Task 433 и столбик Task 360–431
//      сняты): заголовок .wsp-legend-t — display: block (своя
//      строка сверху), сетка .wsp-legend-cols — grid 1fr 1fr
//      (две равные колонки на всю ширину листа), каждая запись
//      .wsp-lg — display: block + white-space: normal (длинное
//      наименование переносится ВНУТРИ своей колонки) +
//      break-inside: avoid (запись не рвётся);
//   2) печать — DOM: «Коды:» и <div class="wsp-legend-cols">
//      открываются сразу за легендой; закрытия сетки, легенды
//      и обёртки — ТРИ последовательных оператора; сноска — ниже;
//   3) профиль — ПОСЛЕ ЗНАКА ГРУППЫ дата последней ВЫПОЛНЕННОЙ
//      проверки знаний до 1000 В («IV от 15.03.2026»): grpVal
//      строится из «группа_допуска», при находке добавляется
//      « от » + _fmtDateRu; пустая группа — «—» без даты;
//   4) _lastExam1000Date — критерии: тип «проверка_знаний»
//      (нормализация пробелов/регистра), тема содержит
//      «до 1000 В» (толерантно: «до 1000В»), выполнение = 1,
//      дата — «дата_проведения» с фолбэком «дата_начала»;
//      пул «Мероприятий» (_EVENTS_ALL) НЕ сканируется —
//      разделы независимы (Task 429);
//   5) окна мероприятий ячеек табеля — дата ДД.ММ.ГГГГ
//      (Task 434; прежде ISO): подстрока окна «Мероприятия в
//      этот день» — this._esc(this._fmtDateRu(isoDate));
//      заголовок окна кодов — var popupDate = this._fmtDateRu(isoDate);
//   VM (клиент):
//   6) карточка (asBlocks): группа IV + выполненная проверка
//      знаний до 1000 В → строка «IV от 15.03.2026»;
//      невыполненная/просроченная запись → только «IV»;
//      инструктаж с «до 1000 В» в теме → НЕ считается;
//      проверка знаний БЕЗ «до 1000 В» → НЕ считается;
//      несколько выполненных — самая поздняя дата;
//      пустая группа → «—» без даты;
//   7) _lastExam1000Date (юнит): нормализация типа
//      «Проверка знаний» с пробелом; дата_проведения важнее
//      дата_начала; записи других работников не мешают;
//   8) _renderEventsPopup: подстрока окна — «05.09.2026»,
//      ISO-даты «2026-09-05» в окне НЕТ.
//   SW: kipia-test-v755 (главный), v660 — прежней нет.
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

function ruleBlock(sel) {
    const i = INDEX_SRC.indexOf(sel);
    if (i === -1) return '';
    return INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
}

function stripComments(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:'"\\/])\/\/[^\n]*/g, '$1');
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

const YEAR = 2026;
function d(day) { return YEAR + '-09-' + (day < 10 ? '0' + day : day); }

// ============================================================
// 1. SRC — печать: коды в ДВЕ КОЛОНКИ под названием «Коды:»
// ============================================================
describe('Task 434 — SRC: печать (коды в две колонки)', () => {

    test('правила легенды кодов УДАЛЕНЫ (Task 442)', () => {
        // Task 442 (заявка: «убери … столбец с кодами»): вся
        // легенда (заголовок, сетка, записи) снята из печати
        assertTrue(ruleBlock('#wsPrintSheet .wsp-legend-t {') === '',
            'правила .wsp-legend-t нет');
        assertTrue(ruleBlock('#wsPrintSheet .wsp-legend-cols {') === '',
            'правила .wsp-legend-cols нет');
        assertTrue(ruleBlock('#wsPrintSheet .wsp-lg {') === '',
            'правила .wsp-lg нет');
        assertTrue(ruleBlock('#wsPrintSheet .wsp-legend {') === '',
            'правила .wsp-legend нет');
    });

    test('JS: легенды в DOM НЕТ — секция мероприятий одна (Task 442)', () => {
        const b = stripComments(methodText(INDEX_SRC, '_buildPrintHtml'));
        assertTrue(b.indexOf('<div class="wsp-legend">') === -1,
            'легенда не строится (Task 442)');
        assertTrue(b.indexOf('Коды:') === -1,
            'заголовка «Коды:» нет');
        assertTrue(b.indexOf('wsp-legend-cols') === -1,
            'сетки колонок нет');
        const iFoot = b.indexOf('<div class="wsp-foot">');
        assertTrue(iFoot === -1, 'сноска wsp-foot удалена (Task 438)');
        // закрытие секции мероприятий + обёртки — два оператора
        const iMev = b.indexOf('<div class="wsp-mev">');
        const iClose1 = b.indexOf("html += '</div>';", iMev);
        const iClose2 = b.indexOf("html += '</div>';", iClose1 + 1);
        assertTrue(iClose1 !== -1 && iClose2 !== -1 && iClose2 - iClose1 < 200,
            'закрытия секции/обёртки — подряд');
    });

    test('JS: мероприятие — прежний ряд [дата][текст] (регресс 433)', () => {
        const b = stripComments(methodText(INDEX_SRC, '_buildPrintHtml'));
        const iItem = b.indexOf("'<span class=\"wsp-mev-item\">'");
        const iDate = b.indexOf('<b class="wsp-mev-date">', iItem);
        const iText = b.indexOf('<span class="wsp-mev-text">', iItem);
        assertTrue(iItem !== -1 && iDate !== -1 && iText !== -1 && iDate < iText,
            'запись мероприятий: [дата][текст→конец листа] (Task 433 жив)');
    });
});

// ============================================================
// 2. SRC — профиль: дата после знака группы
// ============================================================
describe('Task 434 — SRC: профиль (дата проверки знаний до 1000 В)', () => {

    test('_renderWorkerCard — grpVal + « от » + дата', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        const iGrp = fn.indexOf("var grpVal = String(emp['группа_допуска'] || '').trim();");
        const iCall = fn.indexOf('this._lastExam1000Date(emp[\'таб_номер\'])');
        const iAdd = fn.indexOf("grpVal += ' от ' + this._fmtDateRu(examIso)");
        const iRow = fn.indexOf("['Группа допуска', grpVal || '—']");
        assertTrue(iGrp !== -1 && iCall !== -1 && iAdd !== -1 && iRow !== -1,
            'знак группы + дата последней выполненной проверки («от …»)');
        assertTrue(iGrp < iCall && iCall < iAdd && iAdd < iRow,
            'порядок: значение группы → поиск даты → добавление → строка');
    });

    test('_lastExam1000Date — критерии отбора записи', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_lastExam1000Date'));
        assertTrue(fn.indexOf("String(r['таб_номер']) !== tabNo") !== -1,
            'записи только этого работника');
        assertTrue(fn.indexOf("tNorm !== 'проверка_знаний'") !== -1,
            'тип — проверка_знаний (инструктажи не считаются)');
        assertTrue(fn.indexOf('parseInt(r.выполнение, 10) !== 1') !== -1,
            'только ВЫПОЛНЕННЫЕ записи (отметка стоит)');
        assertTrue(fn.indexOf('до\\s*1000\\s*в/i') !== -1,
            'тема содержит «до 1000 В» (толерантно к пробелам)');
        assertTrue(fn.indexOf('r.дата_проведения || r.дата_начала') !== -1,
            'дата проведения с фолбэком дата_начала (легаси)');
        assertFalse(fn.indexOf('_EVENTS_ALL') !== -1,
            'пул «Мероприятий» НЕ сканируется (разделы независимы, Task 429)');
    });
});

// ============================================================
// 3. SRC — окна мероприятий ячеек: дата дд.мм.гггг
// ============================================================
describe('Task 434 — SRC: окна ячеек (дата дд.мм.гггг)', () => {

    test('_renderEventsPopup — подстрока с датой ПО-РУССКИ', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderEventsPopup'));
        assertTrue(fn.indexOf("this._esc(this._fmtDateRu(isoDate)) + ' · '") !== -1,
            'подстрока «дата · ФИО» — дата через _fmtDateRu (дд.мм.гггг)');
        assertFalse(fn.indexOf('this._esc(isoDate)') !== -1,
            'ISO-дата в подстроке больше не выводится');
    });

    test('_renderCellPopup — заголовок окна кодов с датой ПО-РУССКИ', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderCellPopup'));
        assertTrue(fn.indexOf('var popupDate = this._fmtDateRu(isoDate);') !== -1,
            'заголовок окна кодов — дата дд.мм.гггг (Task 260: праздник рядом)');
        assertFalse(fn.indexOf('var popupDate = isoDate;') !== -1,
            'ISO-дата в заголовке больше не выводится');
    });
});

// ============================================================
// 4. VM — карточка: строка «Группа допуска» с датой
// ============================================================
describe('Task 434 — VM: карточка (группа + дата проверки)', () => {

    const EMP = [
      { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'сменный', 'смена': 1,
        'должность': 'Слесарь КИПиА', 'группа_допуска': 'IV',
        'дата_приёма': '2024-03-15', 'дата_увольнения': '', 'в_архиве': 0 }
    ];

    function cardHost(opts) {
        return new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
            methodText(INDEX_SRC, '_lastExam1000Date') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
            methodText(INDEX_SRC, '_renderInstrSection') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKind') + ',\n' +
            methodText(INDEX_SRC, '_addMonthsIso') + ',\n' +
            methodText(INDEX_SRC, '_isoDate') + ',\n' +
            methodText(INDEX_SRC, '_fmtPeriodRu') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
            '_canEdit: ' + (opts.edit ? 'true' : 'false') + ',' +
            '_year: ' + YEAR + ', _month: 9,' +
            '_EMPLOYEES: ' + JSON.stringify(opts.emp || EMP) + ',' +
            '_VACATIONS: [],' +
            '_TRAININGS: [],' +
            '_PPE: [],' +
            '_INSTR_LIST: [],' +
            '_INSTR_ALL: ' + JSON.stringify(opts.instrAll || []) + ',' +
            '_fmtDateRu: function(x) { var p = String(x).split("-");' +
            '  return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(x); },' +
            '_esc: function(s) { return String(s); },' +
            '_escAttr: function(s) { return String(s); },' +
            '_vacDaysInYear: function(v, y) { return 14; },' +
            '_vacNetDaysInYear: function(v, y) { return 14; },' +
            '_plural: function(n, f) { return f[2]; },' +
            '_trainingCodeOf: function(t) { return "И"; },' +
            '_statusMeta: function(c) { return { code: c, color: "#123456", name: c }; }' +
            '});')(mockDoc({}));
    }

    function rowOf(html, topic) {
        const i = html.indexOf(topic);
        if (i === -1) return null;
        const start = html.lastIndexOf('<div class="ws-emp-field', i);
        return html.slice(start, html.indexOf('</div>', i) + 6);
    }

    function exam(day, done, tema, tip) {
        return { id: 90 + day, 'таб_номер': '017', 'тип': tip || 'проверка_знаний',
                 'тема': tema || 'Периодическая проверка знаний на допуск к проведению работ в электроустановках до 1000 В',
                 'дата_проведения': '2026-03-' + (day < 10 ? '0' + day : day),
                 'дата_начала': '2026-03-' + (day < 10 ? '0' + day : day),
                 'дата_окончания': '2026-03-' + (day < 10 ? '0' + day : day),
                 'длительность_дней': 1, 'выполнение': done ? 1 : 0,
                 'просрочен': done ? 0 : 1 };
    }

    test('группа IV + выполненная проверка до 1000 В → «IV от 15.03.2026»', () => {
        const host = cardHost({ edit: true, instrAll: [exam(15, true)] });
        const blocks = host._renderWorkerCard('017', true, true);
        const row = rowOf(blocks.join(''), 'Группа допуска');
        assertTrue(row !== null, 'строка группы найдена');
        assertTrue(row.indexOf('>IV от 15.03.2026<') !== -1,
            'после знака группы — дата «от дд.мм.гггг»');
    });

    test('невыполненная запись → только знак группы', () => {
        const host = cardHost({ edit: true, instrAll: [exam(15, false)] });
        const blocks = host._renderWorkerCard('017', true, true);
        const row = rowOf(blocks.join(''), 'Группа допуска');
        assertTrue(row.indexOf('>IV<') !== -1,
            'нет выполненной проверки — только «IV», без даты');
    });

    test('инструктаж с «до 1000 В» в теме → НЕ считается', () => {
        const host = cardHost({ edit: true,
            instrAll: [exam(15, true, 'Периодическая проверка знаний до 1000 В', 'инструктаж')] });
        const blocks = host._renderWorkerCard('017', true, true);
        const row = rowOf(blocks.join(''), 'Группа допуска');
        assertTrue(row.indexOf('>IV<') !== -1,
            'тип «инструктаж» (пусть и с «до 1000 В») — дата не ставится');
    });

    test('проверка знаний БЕЗ «до 1000 В» → НЕ считается', () => {
        const host = cardHost({ edit: true,
            instrAll: [exam(15, true, 'Периодическая проверка знаний на допуск к самостоятельной работе')] });
        const blocks = host._renderWorkerCard('017', true, true);
        const row = rowOf(blocks.join(''), 'Группа допуска');
        assertTrue(row.indexOf('>IV<') !== -1,
            'другая проверка знаний (не до 1000 В) — дата не ставится');
    });

    test('несколько выполненных — САМАЯ ПОЗДНЯЯ дата', () => {
        const host = cardHost({ edit: true,
            instrAll: [exam(10, true), exam(20, true)] });
        const blocks = host._renderWorkerCard('017', true, true);
        const row = rowOf(blocks.join(''), 'Группа допуска');
        assertTrue(row.indexOf('>IV от 20.03.2026<') !== -1,
            'из нескольких выполненных берётся последняя дата');
    });

    test('пустая группа → «—» без даты', () => {
        const emp = [Object.assign({}, EMP[0], { 'группа_допуска': '' })];
        const host = cardHost({ edit: true, emp: emp, instrAll: [exam(15, true)] });
        const blocks = host._renderWorkerCard('017', true, true);
        const row = rowOf(blocks.join(''), 'Группа допуска');
        assertTrue(row.indexOf('—') !== -1,
            'нет группы — «—», дата не добавляется');
        assertTrue(row.indexOf('от 15.03.2026') === -1,
            'без знака группы даты нет');
    });

    test('записи другого работника не мешают', () => {
        const other = Object.assign(exam(25, true), { 'таб_номер': '999' });
        const host = cardHost({ edit: true, instrAll: [other, exam(5, true)] });
        const blocks = host._renderWorkerCard('017', true, true);
        const row = rowOf(blocks.join(''), 'Группа допуска');
        assertTrue(row.indexOf('>IV от 05.03.2026<') !== -1,
            'дата — по записям ЭТОГО работника (05.03, не 25.03)');
    });
});

// ============================================================
// 5. VM — _lastExam1000Date (юнит)
// ============================================================
describe('Task 434 — VM: _lastExam1000Date (юнит)', () => {

    const host = new Function('return ({' +
        methodText(INDEX_SRC, '_lastExam1000Date') + ',\n' +
        '_INSTR_ALL: [], _TRAININGS: []' +
        '});')();

    test('тип с пробелом «Проверка знаний» нормализуется', () => {
        const h = new Function('return ({' +
            methodText(INDEX_SRC, '_lastExam1000Date') + ',\n' +
            '_INSTR_ALL: [{ id: 1, \'таб_номер\': \'017\', ' +
            '\'тип\': \'Проверка знаний\', выполнение: 1, ' +
            '\'тема\': \'Периодическая проверка знаний на допуск к проведению работ в электроустановках до 1000 В\', ' +
            '\'дата_проведения\': \'2026-02-10\', \'дата_начала\': \'2026-02-10\' }],' +
            '_TRAININGS: []' +
            '});')();
        assertEqual('2026-02-10', h._lastExam1000Date('017'),
            'регистр/пробелы типа не важны');
    });

    test('тема «до 1000В» без пробела — тоже совпадает', () => {
        const h = new Function('return ({' +
            methodText(INDEX_SRC, '_lastExam1000Date') + ',\n' +
            '_INSTR_ALL: [{ id: 1, \'таб_номер\': \'017\', ' +
            '\'тип\': \'проверка_знаний\', выполнение: 1, ' +
            '\'тема\': \'Проверка знаний до 1000В\', ' +
            '\'дата_проведения\': \'2026-04-01\', \'дата_начала\': \'2026-04-01\' }],' +
            '_TRAININGS: []' +
            '});')();
        assertEqual('2026-04-01', h._lastExam1000Date('017'),
            '«до 1000В» (слитно) распознаётся');
    });

    test('дата_проведения важнее дата_начала (легаси-фолбэк)', () => {
        const h = new Function('return ({' +
            methodText(INDEX_SRC, '_lastExam1000Date') + ',\n' +
            '_INSTR_ALL: [{ id: 1, \'таб_номер\': \'017\', ' +
            '\'тип\': \'проверка_знаний\', выполнение: 1, ' +
            '\'тема\': \'Проверка знаний до 1000 В\', ' +
            '\'дата_проведения\': \'2026-05-20\', \'дата_начала\': \'2020-01-01\' }],' +
            '_TRAININGS: []' +
            '});')();
        assertEqual('2026-05-20', h._lastExam1000Date('017'),
            'берётся дата_проведения, а не легаси дата_начала');
    });

    test('пустые пулы / пустой таб. номер — пустая строка', () => {
        assertEqual('', host._lastExam1000Date('017'),
            'нет записей — пусто');
        assertEqual('', host._lastExam1000Date(''),
            'пустой таб. номер — пусто (защита)');
    });
});

// ============================================================
// 6. VM — окно мероприятий ячейки: дата дд.мм.гггг
// ============================================================
describe('Task 434 — VM: окно «Мероприятия в этот день»', () => {

    test('подстрока — «05.09.2026 · ФИО», ISO нет', () => {
        const doc = { getElementById: () => null };
        const h = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_renderEventsPopup') + ',\n' +
            methodText(INDEX_SRC, '_eventsAt') + ',\n' +
            methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_trainingCodeOf') + ',\n' +
            '_canEdit: false,' +
            '_EMPLOYEES: [{ \'таб_номер\': \'017\', \'ФИО\': \'Иванов И. И.\' }],' +
            '_TRAININGS: [], _INSTR_LIST: [], _STATUS_CODES: [],' +
            '_esc: function(s) { return String(s == null ? \'\' : s); },' +
            '_fmtDateRu: function(d) { var p = String(d).split("-");' +
            '  return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(d); },' +
            '_statusMeta: function() { return {}; }' +
            '});')(doc);
        const html = h._renderEventsPopup('2026-09-05', '017');
        assertTrue(html.indexOf('05.09.2026 · Иванов И. И.') !== -1,
            'подстрока контекста: дата дд.мм.гггг · ФИО');
        assertTrue(html.indexOf('2026-09-05') === -1,
            'ISO-дата в окне отсутствует');
    });
});

// ============================================================
// 7. Service Worker
// ============================================================
describe('Task 434 — SW: версия кеша', () => {
    test('v659 (главный), v660 — прежней нет', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v755'") !== -1,
            'SW кэш kipia-test-v755');
        assertFalse(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v756'") !== -1,
            'v660 ещё не существует (guard следующего бампа)');
    });
});
