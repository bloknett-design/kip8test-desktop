// ============================================================
// Task 403 — заявка: «На странице Табель учёта рабочего времени,
// в столбце с фамилиями в должности сократи слово разряд на "р.",
// и убери данные группы допуска, и в сплывающем окне при нажатии
// на ячейку с фамилией работника убери данные СИЗ. При
// редактировании комментария в картах работников, изменения не
// применяются, а повторяются данные из группы допуска. В Табель
// учёта рабочего времени / Работники, ширину ярлыков с фамилиями
// работников сделай по габаритам самого длинного текста, блок
// мероприятия перемести в верх между блоками профиля и СИЗ».
//
// 1) СТОЛБЕЦ ФИО: строка должности — ТОЛЬКО должность, слово
//    «разряд» сокращено до «р.» (склонения тоже); группа допуска
//    УБРАНА из столбца (осталась в карточке/сводной/шторке правки).
// 2) ПОПАП шахматки (клик по ячейке с фамилией): БЕЗ блока СИЗ
//    (СИЗ — только страница «Работники», все 4 блока там живы).
// 3) БАГ КОММЕНТАРИЯ (сервер WorkSchedule.gs): пользователь вставил
//    столбец «группа_допуска» МЕЖДУ «должность» (J) и «комментарий»
//    (K) — жёсткие индексы J..K читали/писали не туда (комментарий
//    показывал группу допуска и не сохранялся). Фикс: «должность» и
//    «комментарий» — тоже по ЗАГОЛОВКАМ строки 1 (_headerColIndex,
//    фолбэк J/K); чтение/запись — каждый реквизит в свой столбец.
// 4) «РАБОТНИКИ»: ширина ярлыков — по ГАБАРИТАМ самого длинного
//    текста (_fitWorkersTabs + CSS var --ws-wtabs-w; фолбэк 236px).
// 5) «РАБОТНИКИ»: блок МЕРОПРИЯТИЯ — ВВЕРХУ ПРАВОЙ колонки, между
//    блоками ПРОФИЛЯ и СИЗ (левая — профиль + отпуска).
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
    if (m === null) throw new Error('метод не найден: ' + name);
    return m;
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// ============================================================
// 1. SRC — столбец ФИО: должность без группы, «разряд» → «р.»
// ============================================================
describe('Task 403 — SRC: строка должности столбца ФИО', () => {

    test('_empPosLine: только должность (группа допуска убрана)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_empPosLine'));
        assertTrue(fn.indexOf("var pos = String(emp['должность'] || '').trim();") !== -1,
            'должность читается');
        assertFalse(fn.indexOf('группа_допуска') !== -1,
            'группа допуска в строке должности БОЛЬШЕ не участвует');
        assertTrue(fn.indexOf("if (!pos) return '';") !== -1,
            'без должности — пустая строка (блок не рендерится)');
        assertTrue(fn.indexOf('this._shortGrade(pos)') !== -1,
            'должность проходит через сокращение «разряд» → «р.»');
    });

    test('_shortGrade: целое слово «разряд» с любым окончанием → «р.»', () => {
        const fn = methodText(INDEX_SRC, '_shortGrade');
        assertTrue(fn.indexOf('/разряд[а-яё]*/gi') !== -1,
            'регулярка: корень «разряд» + любые строчные буквы, без учёта регистра');
        assertTrue(fn.indexOf("'р.'") !== -1, 'замена — «р.» с точкой');
    });

    test('группа допуска жива в карточке/сводной/шторке (НЕ задета)', () => {
        const card = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(card.indexOf("['Группа допуска'") !== -1,
            'карточка: строка «Группа допуска» осталась');
        const gen = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        assertTrue(gen.indexOf('<th>Должность</th><th>Группа допуска</th>') !== -1,
            'сводная «Общая»: колонка «Группа допуска» осталась');
        assertTrue(INDEX_SRC.indexOf('id="wsEmpAccessGroup"') !== -1,
            'шторка правки: селект группы жив');
    });

    test('печать НЕ показывает должность (Task 439); «разряд» — только в сетке', () => {
        // Task 439: _posLabel удалён — печать показывает только
        // ФИО и Тип; сокращение «разряд» (_shortGrade) живёт
        // только в _empPosLine ячейки сетки
        assertFalse(INDEX_SRC.indexOf('_posLabel: function') !== -1,
            'метод _posLabel удалён (Task 439)');
        const fn = stripComments(methodText(INDEX_SRC, '_empPosLine'));
        assertTrue(fn.indexOf('_shortGrade') !== -1,
            'строка должности сетки — с сокращением «разряд»');
        const b = stripComments(methodText(INDEX_SRC, '_buildPrintHtml'));
        assertTrue(b.indexOf('_shortGrade') === -1 && b.indexOf('должность') === -1,
            'печать должность не читает (только _empTipLine)');
    });
});

// ============================================================
// 2. SRC — попап шахматки без СИЗ
// ============================================================
describe('Task 403 — SRC: попап без СИЗ', () => {

    test('_renderWorkerCard: склеенный вид (попап) — БЕЗ b4', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(
            fn.indexOf('return asBlocks ? [b1, b2, b3, b4, b5] : (b1 + b2 + b3 + b5);') !== -1,
            'попап (без asBlocks) — профиль + отпуска + мероприятия '
            + 'инструктажи (Task 405), БЕЗ СИЗ');
        assertFalse(fn.indexOf('(b1 + b2 + b3 + b4)') !== -1,
            'СИЗ (b4) в попап больше не входит');
    });

    test('СИЗ-блок собирается только для asBlocks (страница «Работники»)', () => {
        const fn = methodText(INDEX_SRC, '_renderWorkerCard');
        const iSec = fn.indexOf('--- Секция 4: СИЗ');
        const iAsb = fn.indexOf('var b4 = asBlocks');
        assertTrue(iSec !== -1 && iAsb !== -1, 'секция СИЗ жива (страница)');
        // идемпотентность: b4 остаётся ЧЕТВЁРТЫМ элементом массива asBlocks
        assertTrue(fn.indexOf('[b1, b2, b3, b4, b5]') !== -1,
            'asBlocks — 5 блоков (Task 405: + повторные инструктажи)');
    });

    test('_renderEmpPopup → _renderWorkerCard(tabNo, false)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderEmpPopup'));
        assertTrue(fn.indexOf('this._renderWorkerCard(tabNo, false)') !== -1,
            'попап — read-only карточка (без asBlocks → без СИЗ)');
    });
});

// ============================================================
// 3. SRC — страница «Работники»: ярлыки + мероприятия над СИЗ
// ============================================================
describe('Task 403 — SRC: страница «Работники»', () => {

    test('_renderWorkerCardPanels: ТРИ колонки — инструктажи вторая, СИЗ третья (Task 406)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCardPanels'));
        assertTrue(fn.indexOf('else if (bi === 4) colInstr += panel;') !== -1,
            'инструктажи (блок 5) — ВТОРАЯ колонка (Task 406)');
        assertTrue(fn.indexOf("'<div class=\"ws-wcol ws-wcol-ppe\">' + colPpe + '</div>'") !== -1,
            'ТРЕТЬЯ колонка .ws-wcol-ppe — СИЗ (Task 406)');
    });

    test('CSS: ширина ярлыков — переменная по замеру (фолбэк 236px)', () => {
        const i = INDEX_SRC.indexOf('.ws-wtabs {');
        assertTrue(i !== -1, 'правило .ws-wtabs есть');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(block.indexOf('width: var(--ws-wtabs-w, 236px);') !== -1,
            'ширина из переменной --ws-wtabs-w, фолбэк 236px');
        const m = INDEX_SRC.indexOf('@media (max-width: 1023px)', i);
        const mblock = INDEX_SRC.slice(m, m + 1200);
        assertTrue(mblock.indexOf('width: auto') !== -1,
            'мобайл: лента ярлыков — width:auto (переменная не мешает)');
    });

    test('_fitWorkersTabs: метод + вызов из _renderWorkersPage + fonts.ready', () => {
        assertTrue(INDEX_SRC.indexOf('_fitWorkersTabs: function') !== -1,
            'метод _fitWorkersTabs существует');
        const rwp = stripComments(methodText(INDEX_SRC, '_renderWorkersPage'));
        assertTrue(rwp.indexOf('this._fitWorkersTabs()') !== -1,
            'замер — после КАЖДОЙ перерисовки страницы (VM-моки — тихо)');
        const fn = methodText(INDEX_SRC, '_fitWorkersTabs');
        assertTrue(fn.indexOf("querySelector('.ws-wtabs')") !== -1 &&
                   fn.indexOf("style.whiteSpace = 'nowrap'") !== -1,
            'замер: колонка сжимается с nowrap-ярлыками');
        assertTrue(fn.indexOf('--ws-wtabs-w') !== -1,
            'результат — в CSS-переменную (НЕ inline width: мобайл перебивает media-правилом)');
        const fonts = INDEX_SRC.slice(INDEX_SRC.indexOf('document.fonts.ready.then'),
                                      INDEX_SRC.indexOf('document.fonts.ready.then') + 1400);
        assertTrue(fonts.indexOf('_fitWorkersTabs') !== -1,
            'повторный замер по document.fonts.ready (поздний шрифт)');
    });
});

// ============================================================
// 4. VM — клиент: _empPosLine / _shortGrade / карточка / панели
// ============================================================
describe('Task 403 — VM: строка должности', () => {

    const host = new Function('return ({' +
        methodText(INDEX_SRC, '_empPosLine') + ',' +
        methodText(INDEX_SRC, '_shortGrade') +
        '});')();

    test('_empPosLine: «разряд» → «р.», группа игнорируется', () => {
        assertEqual(host._empPosLine({ 'должность': 'Слесарь КИПиА 5 разряд', 'группа_допуска': 'IV' }),
            'Слесарь КИПиА 5 р.', 'сокращение + группа не показывается');
        assertEqual(host._empPosLine({ 'должность': 'Электромонтёр 4 разряда' }),
            'Электромонтёр 4 р.', 'склонение «разряда» тоже сокращается');
        assertEqual(host._empPosLine({ 'должность': 'Мастер КИПиА' }),
            'Мастер КИПиА', 'без «разряда» — должность как есть');
        assertEqual(host._empPosLine({ 'группа_допуска': 'IV' }), '',
            'без должности — пусто (группа не рендерится)');
        assertEqual(host._empPosLine({}), '', 'пусто — строка не рендерится');
    });

    test('_shortGrade: окончания/регистр/кратность', () => {
        assertEqual(host._shortGrade('Слесарь 3 разряд'), 'Слесарь 3 р.',
            'именительный падеж');
        assertEqual(host._shortGrade('Слесарь 3 разряда'), 'Слесарь 3 р.',
            'родительный падеж');
        assertEqual(host._shortGrade('Слесарь 3 разрядом'), 'Слесарь 3 р.',
            'творительный падеж');
        assertEqual(host._shortGrade('разряд 5'), 'р. 5', 'разряд в начале');
        assertEqual(host._shortGrade('Разряд 5'), 'р. 5', 'заглавная буква');
        assertEqual(host._shortGrade('слесарь 2 и 3 разряды'), 'слесарь 2 и 3 р.',
            'множественное число — одно вхождение замены');
        assertEqual(host._shortGrade('Мастер'), 'Мастер', 'без «разряда» — как есть');
        assertEqual(host._shortGrade(''), '', 'пустая строка');
    });
});

describe('Task 403 — VM: попап шахматки без СИЗ', () => {

    function cardHost(withEdit, ppe) {
        const EMP = [
            { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
              'смена': '', 'должность': 'Слесарь КИПиА 5 разряд', 'комментарий': '',
              'группа_допуска': 'IV', 'дата_приёма': '2024-03-15' },
        ];
        return new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
            methodText(INDEX_SRC, '_lastExam1000Date') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            '_canEdit: ' + JSON.stringify(!!withEdit) + ',' +
            '_year: 2026, _month: 8,' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_VACATIONS: [],' +
            '_TRAININGS: [],' +
            '_PPE: ' + JSON.stringify(ppe || []) + ',' +
            '_fmtDateRu: function(d) { d = String(d);' +
            '  var p = d.split("-"); return p.length === 3 ?' +
            '  p[2] + "." + p[1] + "." + p[0] : d; },' +
            '_esc: function(s) { return String(s); },' +
            '_escAttr: function(s) { return String(s); },' +
            '_trainingCodeOf: function(t) { return "И"; },' +
            '_statusMeta: function(c) { return {}; }' +
            '});')(mockDoc({}));
    }

    test('попап (withEdit=false, без asBlocks): НЕТ данных СИЗ', () => {
        const host = cardHost(false, [
            { id: 1, 'таб_номер': '2706', наименование: 'Каска защитная',
              дата_выдачи: '2026-09-17', срок_годности: '1 год',
              дата_окончания: '2027-09-17', примечание: '' },
        ]);
        const html = host._renderWorkerCard('2706', false);
        assertTrue(html.indexOf('СИЗ') === -1,
            'секции СИЗ в попапе нет');
        assertTrue(html.indexOf('Каска защитная') === -1,
            'записи СИЗ в попапе нет');
        assertTrue(html.indexOf('нет выданных СИЗ') === -1,
            'пустого состояния СИЗ в попапе нет');
        assertTrue(html.indexOf('ws-emp-addppe') === -1,
            'строки «+ СИЗ…» в попапе нет');
        // ядро карточки живо
        assertTrue(html.indexOf('<div class="ws-popup-title">Галкин Д. Н.') !== -1 &&
                   html.indexOf('<div class="ws-popup-sec">Отпуска · 2026') !== -1 &&
                   html.indexOf('<div class="ws-popup-sec">Мероприятия · 2026') !== -1,
            'шапка + отпуска + мероприятия — прежние секции попапа');
        assertTrue(html.indexOf('Группа допуска') !== -1,
            'строка «Группа допуска» профиля в попапе жива (заявка не трогала)');
    });

    test('asBlocks (страница «Работники»): 4 блока, СИЗ — четвёртый', () => {
        const host = cardHost(true, [
            { id: 1, 'таб_номер': '2706', наименование: 'Каска защитная',
              дата_выдачи: '2026-09-17', срок_годности: '1 год',
              дата_окончания: '2027-09-17', примечание: '' },
        ]);
        const blocks = host._renderWorkerCard('2706', true, true);
        assertEqual(blocks.length, 5, 'пять блоков (Task 405)');
        assertTrue(blocks[0].indexOf('Галкин Д. Н.') !== -1, 'блок 1 — профиль');
        assertTrue(blocks[1].indexOf('Отпуска · 2026') !== -1, 'блок 2 — отпуска');
        assertTrue(blocks[2].indexOf('Мероприятия · 2026') !== -1, 'блок 3 — мероприятия');
        assertTrue(blocks[3].indexOf('СИЗ · средства индивидуальной защиты') !== -1,
            'блок 4 — СИЗ (страница «Работники»)');
        assertTrue(
            blocks[4].indexOf('Повторные инструктажи и периодическая проверка знаний · 2026') !== -1,
            'Task 405: блок 5 — повторные инструктажи (пустое состояние)');
        assertTrue(blocks[3].indexOf('Каска защитная') !== -1, 'запись СИЗ на странице');
    });
});

describe('Task 403 → 404 — VM: панели — ТРИ колонки (СИЗ слева от мероприятий)', () => {

    test('колонки: 1 — профиль+отпуска; 2 — СИЗ; 3 — мероприятия', () => {
        const EMP = [
            { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
              'смена': '', 'должность': 'Слесарь КИПиА 5 разряд', 'комментарий': '',
              'группа_допуска': 'IV', 'дата_приёма': '2024-03-15' },
        ];
        const PPE = [
            { id: 1, 'таб_номер': '2706', наименование: 'Каска защитная',
              дата_выдачи: '2026-09-17', срок_годности: '1 год',
              дата_окончания: '2027-09-17', примечание: '' },
        ];
        const TR = [
            { id: 1, 'таб_номер': '2706', тип: 'Инструктаж', тема: 'ОТ',
              дата_начала: '2026-02-10', дата_окончания: '2026-02-10' },
        ];
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
            methodText(INDEX_SRC, '_lastExam1000Date') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
            methodText(INDEX_SRC, '_renderWorkerCardPanels') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            '_canEdit: true, _year: 2026, _month: 8,' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_VACATIONS: [],' +
            '_TRAININGS: ' + JSON.stringify(TR) + ',' +
            '_PPE: ' + JSON.stringify(PPE) + ',' +
            '_fmtDateRu: function(d) { d = String(d);' +
            '  var p = d.split("-"); return p.length === 3 ?' +
            '  p[2] + "." + p[1] + "." + p[0] : d; },' +
            '_esc: function(s) { return String(s); },' +
            '_escAttr: function(s) { return String(s); },' +
            '_trainingCodeOf: function(t) { return "И"; },' +
            '_statusMeta: function(c) { return {}; }' +
            '});')(mockDoc({}));
        const html = host._renderWorkerCardPanels('2706', true);
        const iL = html.indexOf('<div class="ws-wcol">');
        const iI = html.indexOf('<div class="ws-wcol ws-wcol-instr">');
        const iP = html.indexOf('<div class="ws-wcol ws-wcol-ppe">');
        assertTrue(iL !== -1 && iI !== -1 && iP !== -1 && iL < iI && iI < iP,
            'ТРИ колонки: main → инструктажи → СИЗ (Task 406)');
        const mainPart = html.slice(iL, iI);
        const insPart = html.slice(iI, iP);
        const ppePart = html.slice(iP);
        assertEqual((mainPart.match(/class="ws-wcard"/g) || []).length, 3,
            'колонка 1 — 3 окна (профиль + отпуска + мероприятия, Task 406)');
        assertEqual((insPart.match(/class="ws-wcard"/g) || []).length, 1,
            'колонка 2 — 1 окно (инструктажи)');
        assertEqual((ppePart.match(/class="ws-wcard"/g) || []).length, 1,
            'колонка 3 — 1 окно (СИЗ)');
        const iProf = mainPart.indexOf('Галкин Д. Н.');
        const iVac = mainPart.indexOf('Отпуска · 2026');
        const iTr = mainPart.indexOf('Мероприятия · 2026');
        assertTrue(iProf !== -1 && iVac !== -1 && iTr !== -1 &&
                   iProf < iVac && iVac < iTr,
            'колонка 1: профиль → отпуска → мероприятия (Task 406)');
        const iPz = ppePart.indexOf('СИЗ · средства индивидуальной защиты');
        assertTrue(iPz !== -1, 'СИЗ на месте (3-я колонка)');
        // Task 405: «Инструктаж» с заглавной — тоже b5 (толерантность)
        assertTrue(insPart.indexOf('Повторные инструктажи') !== -1 &&
                   insPart.indexOf('ОТ') !== -1,
            'инструктаж — во 2-й колонке, в блоке повторных инструктажей');
        assertTrue(insPart.indexOf('Мероприятия · 2026') === -1,
            'мероприятия НЕ во 2-й колонке (Task 406)');
        assertTrue(ppePart.indexOf('Повторные инструктажи') === -1 &&
                   ppePart.indexOf('Мероприятия · 2026') === -1,
            'в 3-й колонке — только СИЗ');
    });
});

describe('Task 403 — VM: _fitWorkersTabs (ширина ярлыков)', () => {

    test('переменная --ws-wtabs-w = ceil(замер + 1); идемпотентность', () => {
        const items = [{ style: {} }, { style: {} }, { style: {} }];
        const tabs = {
            style: {
                vars: {},
                setProperty: function(k, v) { this.vars[k] = v; },
                getPropertyValue: function(k) { return this.vars[k] || ''; }
            },
            offsetWidth: 268,
            querySelectorAll: function() { return items; }
        };
        const doc = { querySelector: function() { return tabs; } };
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_fitWorkersTabs') + '});')(doc);
        host._fitWorkersTabs();
        assertEqual(tabs.style.vars['--ws-wtabs-w'], '269px',
            '268px замера → 269px (ceil + 1)');
        // повторный вызов с той же шириной — значение то же
        host._fitWorkersTabs();
        assertEqual(tabs.style.vars['--ws-wtabs-w'], '269px', 'идемпотентно');
        // скрытая страница (замер 0) — переменная НЕ пишется
        tabs.offsetWidth = 0;
        delete tabs.style.vars['--ws-wtabs-w'];
        host._fitWorkersTabs();
        assertTrue(!('--ws-wtabs-w' in tabs.style.vars),
            'замер < 60 — фолбэк CSS 236px');
    });

    test('мок document без querySelector — тихий выход (VM-совместимость)', () => {
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_fitWorkersTabs') + '});')({});
        let ok = true;
        try { host._fitWorkersTabs(); } catch (e) { ok = false; }
        assertTrue(ok, 'не падает на моках без querySelector');
    });
});

// ============================================================
// 5. VM — сервер: баг комментария (столбцы по заголовкам)
// ============================================================
describe('Task 403 — VM: сервер — _headerColIndex', () => {

    const host = new Function('return ({' +
        methodText(WS_GS_SRC, '_headerColIndex') + '});')();

    const mkSheet = function(heads) {
        return {
            getLastColumn: function() { return heads.length; },
            getRange: function() { return { getValues: function() { return [heads]; } }; }
        };
    };
    const base = ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон_ротации',
                  'старт_цикла', 'дата_приёма', 'дата_увольнения',
                  'в_архиве', 'должность', 'комментарий'];

    test('обычный лист: должность J (9), комментарий K (10)', () => {
        assertEqual(host._headerColIndex(mkSheet(base), ['должность']), 9, 'J');
        assertEqual(host._headerColIndex(mkSheet(base), ['комментарий']), 10, 'K');
    });

    test('пользовательский лист: группа МЕЖДУ ними — комментарий L (11)', () => {
        const userHeads = base.slice(0, 10)
            .concat(['группа_допуска']).concat(['комментарий']);
        assertEqual(host._headerColIndex(mkSheet(userHeads), ['должность']), 9, 'J');
        assertEqual(host._headerColIndex(mkSheet(userHeads), ['комментарий']), 11, 'L');
    });

    test('нормализация: регистр/пробелы/подчёркивания', () => {
        const messy = base.slice(0, 9)
            .concat([' Должность ']).concat(['Комментарий'])
            .concat(['Группа допуска']);
        assertEqual(host._headerColIndex(mkSheet(messy), ['должность']), 9,
            'регистр и пробелы вокруг');
        assertEqual(host._headerColIndex(mkSheet(messy), ['комментарий']), 10, 'K');
    });

    test('нет заголовка — null (вызов даёт легаси-фолбэк)', () => {
        assertEqual(host._headerColIndex(mkSheet(base.map(function(h, i) {
            return i === 9 ? 'что-то' : h;
        })), ['должность']), null, 'заголовок должности не найден');
        assertEqual(host._headerColIndex({
            getLastColumn: function() { throw new Error('x'); }
        }, ['должность']), null, 'сбой листа — null');
    });
});

describe('Task 403 — VM: сервер — listEmployees (баг комментария)', () => {

    // мок листа «Сотрудники»: data[0] — заголовки, далее строки
    function mkSheet(data) {
        return {
            getLastColumn: function() { return data[0].length; },
            getLastRow: function() { return data.length; },
            getRange: function(r, c, nr, nc) {
                nr = nr || 1; nc = nc || 1;
                const out = [];
                for (let i = 0; i < nr; i++) {
                    const row = [];
                    for (let j = 0; j < nc; j++) {
                        row.push((data[r - 1 + i] || [])[c - 1 + j] || '');
                    }
                    out.push(row);
                }
                return { getValues: function() { return out; } };
            }
        };
    }

    const mkHost = function(sheet) {
        return new Function('sheet', 'return ({' +
            methodText(WS_GS_SRC, 'listEmployees') + ',' +
            methodText(WS_GS_SRC, '_accessGroupColIndex') + ',' +
            methodText(WS_GS_SRC, '_headerColIndex') + ',' +
            // Task 489-adapt: карта столбцов + композиция ФИО
            methodText(WS_GS_SRC, '_employeesColMap') + ',' +
            methodText(WS_GS_SRC, '_wsShortFio') + ',' +
            methodText(WS_GS_SRC, '_wsNameInitial') + ',' +
            methodText(WS_GS_SRC, '_wsFullFio') + ',' +
            '_requireRead: function() { return { user: { email: "t" } }; },' +
            '_getSheet: function() { return sheet; },' +
            '_toIsoDate: function(d) { return d; }' +
            '});')(sheet);
    };

    test('группа МЕЖДУ должностью и комментарием: каждый — из СВОЕГО столбца', () => {
        // КОНТЕКСТ БАГА: пользователь вставил «группа_допуска» в K,
        // комментарий сместился на L; прежний код читал r[10] = группа
        const sheet = mkSheet([
            ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон_ротации',
             'старт_цикла', 'дата_приёма', 'дата_увольнения', 'в_архиве',
             'должность', 'группа_допуска', 'комментарий'],
            ['2706', 'Галкин Д. Н.', 'дневной', '', '', '', '', '', 0,
             'Слесарь КИПиА 5 разряд', 'IV', 'комментарий из L'],
        ]);
        const res = mkHost(sheet).listEmployees({ token: 't' });
        assertTrue(res.ok, 'ok');
        assertEqual(res.data.employees.length, 1, 'один работник');
        assertEqual(res.data.employees[0].должность, 'Слесарь КИПиА 5 разряд',
            'должность — из J');
        assertEqual(res.data.employees[0].группа_допуска, 'IV',
            'группа — из K (свой столбец)');
        assertEqual(res.data.employees[0].комментарий, 'комментарий из L',
            'КОММЕНТАРИЙ — ИЗ L (не группа допуска!)');
    });

    test('легаси-лист без группы (A..K): прежнее поведение', () => {
        const sheet = mkSheet([
            ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон_ротации',
             'старт_цикла', 'дата_приёма', 'дата_увольнения', 'в_архиве',
             'должность', 'комментарий'],
            ['0377', 'Первов С. А.', 'сменный', 1, '', '', '', '', 0,
             'Слесарь КИПиА', 'обычный комментарий'],
        ]);
        const res = mkHost(sheet).listEmployees({ token: 't' });
        assertEqual(res.data.employees[0].комментарий, 'обычный комментарий',
            'комментарий — из K (канон)');
        assertEqual(res.data.employees[0].группа_допуска, '',
            'нет столбца группы — пусто');
    });
});

describe('Task 403 — VM: сервер — updateEmployee (баг комментария)', () => {

    // мок: пишет setValue/setValues в writes (координаты 1-based)
    function mkRecSheet(data) {
        const writes = [];
        const sheet = {
            writes: writes,
            getLastColumn: function() { return data[0].length; },
            getLastRow: function() { return data.length; },
            getRange: function(r, c, nr, nc) {
                nr = nr || 1; nc = nc || 1;
                const vals = [];
                for (let i = 0; i < nr; i++) {
                    const row = [];
                    for (let j = 0; j < nc; j++) {
                        row.push((data[r - 1 + i] || [])[c - 1 + j] || '');
                    }
                    vals.push(row);
                }
                return {
                    getValues: function() { return vals; },
                    setValue: function(v) { writes.push({ r: r, c: c, v: v }); },
                    setValues: function(v) { writes.push({ r: r, c: c, v: v }); }
                };
            }
        };
        return sheet;
    }

    const mkHost = function(sheet) {
        return new Function('sheet', 'return ({' +
            methodText(WS_GS_SRC, 'updateEmployee') + ',' +
            methodText(WS_GS_SRC, '_accessGroupColIndex') + ',' +
            methodText(WS_GS_SRC, '_headerColIndex') + ',' +
            // Task 489-adapt: карта столбцов + композиция ФИО
            methodText(WS_GS_SRC, '_employeesColMap') + ',' +
            methodText(WS_GS_SRC, '_wsShortFio') + ',' +
            methodText(WS_GS_SRC, '_wsNameInitial') + ',' +
            methodText(WS_GS_SRC, '_wsFullFio') + ',' +
            '_requireWrite: function() { return { user: { email: "t" } }; },' +
            '_getSheet: function() { return sheet; },' +
            '_parseIsoDate: function(d) { return d; }' +
            '});')(sheet);
    };

    // лист ПОЛЬЗОВАТЕЛЯ: группа в K, комментарий в L
    const userSheetData = [
        ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон_ротации',
         'старт_цикла', 'дата_приёма', 'дата_увольнения', 'в_архиве',
         'должность', 'группа_допуска', 'комментарий'],
        ['2706', 'Галкин Д. Н.', 'дневной', '', '', '2026-01-01', '', '', 0,
         'Слесарь КИПиА 5 разряд', 'IV', 'старый комментарий'],
    ];

    const payload = {
        token: 't', 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.',
        тип: 'дневной', смена: '', шаблон_ротации: null,
        старт_цикла: '2026-01-01', дата_приёма: null,
        должность: 'Слесарь КИПиА 5 разряд',
        группа_допуска: 'IV', комментарий: 'ПРАВКА комментария'
    };

    test('комментарий → L, должность → J, группа → K (каждый в свой столбец)', () => {
        const sheet = mkRecSheet(userSheetData.map(r => r.slice()));
        const res = mkHost(sheet).updateEmployee(payload);
        assertTrue(res.ok, 'ok');
        const byCol = {};
        sheet.writes.forEach(function(w) {
            if (w.r === 2 && !Array.isArray(w.v)) byCol[w.c] = w.v;
        });
        assertEqual(byCol[10], 'Слесарь КИПиА 5 разряд', 'должность — в J (col 10)');
        assertEqual(byCol[12], 'ПРАВКА комментария',
            'КОММЕНТАРИЙ — В L (col 12), не в K с группой!');
        assertEqual(byCol[11], 'IV', 'группа — в K (col 11)');
    });

    test('guard: payload без поля группы — столбец K не трогается', () => {
        const sheet = mkRecSheet(userSheetData.map(r => r.slice()));
        const noGroup = {};
        Object.keys(payload).forEach(function(k) {
            if (k !== 'группа_допуска') noGroup[k] = payload[k];
        });
        const res = mkHost(sheet).updateEmployee(noGroup);
        assertTrue(res.ok, 'ok');
        const cols = sheet.writes.filter(w => w.r === 2 && !Array.isArray(w.v))
            .map(w => w.c);
        assertTrue(cols.indexOf(11) === -1,
            'старый фронтенд (кэш SW) не затирает группу листа');
        assertTrue(cols.indexOf(12) !== -1, 'комментарий всё же пишется');
    });

    test('легаси-лист (A..K, без группы): комментарий — в K', () => {
        const sheet = mkRecSheet([
            ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон_ротации',
             'старт_цикла', 'дата_приёма', 'дата_увольнения', 'в_архиве',
             'должность', 'комментарий'],
            ['2706', 'Галкин Д. Н.', 'дневной', '', '', '2026-01-01', '', '', 0,
             'Слесарь КИПиА', 'старый'],
        ]);
        const res = mkHost(sheet).updateEmployee(payload);
        assertTrue(res.ok, 'ok');
        const byCol = {};
        sheet.writes.forEach(function(w) {
            if (w.r === 2 && !Array.isArray(w.v)) byCol[w.c] = w.v;
        });
        assertEqual(byCol[10], 'Слесарь КИПиА 5 разряд', 'должность — J');
        assertEqual(byCol[11], 'ПРАВКА комментария', 'комментарий — K (канон)');
    });
});

describe('Task 403 — VM: сервер — addEmployee (сборка строки)', () => {

    // регистратор строки: new Function НЕ видит замыканий теста —
    // рекордер передаётся АРГУМЕНТОМ в хост
    const REC = { appended: null };

    test('группа в K, комментарий в L — реквизиты не затирают друг друга', () => {
        const data = [
            ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон_ротации',
             'старт_цикла', 'дата_приёма', 'дата_увольнения', 'в_архиве',
             'должность', 'группа_допуска', 'комментарий'],
            ['2706', 'Галкин Д. Н.', 'дневной', '', '', '2026-01-01', '', '', 0,
             'Слесарь КИПиА', 'IV', 'старый'],
        ];
        REC.appended = null;
        const sheet = {
            getLastColumn: function() { return data[0].length; },
            getLastRow: function() { return data.length; },
            getRange: function(r, c, nr, nc) {
                nr = nr || 1; nc = nc || 1;
                const vals = [];
                for (let i = 0; i < nr; i++) {
                    const row = [];
                    for (let j = 0; j < nc; j++) {
                        row.push((data[r - 1 + i] || [])[c - 1 + j] || '');
                    }
                    vals.push(row);
                }
                return {
                    getValues: function() { return vals; },
                    setValue: function() {},
                    setValues: function() {},
                    setNumberFormat: function() {}
                };
            }
        };
        const host = new Function('sheet', 'rec', 'return ({' +
            methodText(WS_GS_SRC, 'addEmployee') + ',' +
            methodText(WS_GS_SRC, '_accessGroupColIndex') + ',' +
            methodText(WS_GS_SRC, '_headerColIndex') + ',' +
            // Task 489-adapt: карта столбцов + композиция ФИО
            methodText(WS_GS_SRC, '_employeesColMap') + ',' +
            methodText(WS_GS_SRC, '_wsShortFio') + ',' +
            methodText(WS_GS_SRC, '_wsNameInitial') + ',' +
            methodText(WS_GS_SRC, '_wsFullFio') + ',' +
            '_requireWrite: function() { return { user: { email: "t" } }; },' +
            '_getSheet: function() { return sheet; },' +
            '_parseIsoDate: function(d) { return d; },' +
            '_appendRowKeepText: function(sh, rowVals) { rec.appended = rowVals; return 3; }' +
            '});')(sheet, REC);
        const res = host.addEmployee({
            token: 't', 'таб_номер': '0871', 'ФИО': 'Новый Н. Н.',
            тип: 'сменный', смена: 2, шаблон_ротации: null,
            старт_цикла: '2026-01-01', дата_приёма: null,
            должность: 'Слесарь КИПиА 5 разряд', группа_допуска: 'III',
            комментарий: 'комментарий нового'
        });
        assertTrue(res.ok, 'ok');
        const appended = REC.appended;
        assertTrue(appended !== null, 'строка ушла в _appendRowKeepText');
        assertEqual(appended[9], 'Слесарь КИПиА 5 разряд', 'должность — J (инд 9)');
        assertEqual(appended[10], 'III', 'группа — K (инд 10)');
        assertEqual(appended[11], 'комментарий нового',
            'комментарий — L (инд 11), НЕ затёрт группой (баг фиксен)');
        assertEqual(appended.length, 12, 'строка до самого правого столбца');
    });
});

// ============================================================
// 6. SW — версия кэша
// ============================================================
describe('Task 403 — SW: версия кэша', () => {
    test('CACHE_VERSION = kipia-test-v733 (Task 403)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v733'") !== -1,
            'фронтенд менялся — кэш поднят до v630');
    });
    test('guard: v631 отсутствует (следующий бамп)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v734') === -1,
            'v631 ещё не существует (guard следующего бампа)');
    });
});
