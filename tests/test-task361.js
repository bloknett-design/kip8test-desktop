// tests/test-task361.js
// Task 361 — заявка пользователя: «В печати столбец с
// сотрудниками сделай уже, по ширине текста в нём, а в общем
// размер таблицы увеличь насколько это возможно, и размер
// шрифта всех строк над и под таблицей сделай больше (для более
// удобного чтения, потому что сейчас текст на печати очень
// маленький, и его неудобно читать). И сделай отображение на
// печати значков мероприятий в ячейках шахматки» (правка
// печатной формы — Tasks 341/342/343/360):
//   • КОЛОНКА «Сотрудник» — по ширине текста: НЕ фиксированные
//     50mm, а inline style width на th .wsp-emp, посчитанный в
//     _buildPrintHtml по самой длинной ФИО (10.5px bold) /
//     должности (8.5px) печатаемых строк; в браузере — точно
//     canvas measureText, вне браузера — оценка ~0.62em/символ;
//     кламп 24–48mm, округление вверх до 0.5mm, +3.5mm запас;
//   • ТАБЛИЦА КРУПНЕЕ: у колонок дней НЕТ своей ширины (правило
//     .wsp-day { width: 6.5mm } удалено) — fixed-раскладка делит
//     остаток поровну между 31 днём (освободившаяся ширина от
//     узкой ФИО достаётся дням); высота ячеек 6.2→7.2mm; код
//     ячейки 8.5→10px; ФИО 9→10.5px; должность 7.5→8.5px;
//     итоги 9→10mm, «Перераб.» 12→14mm; точка переработки
//     1.6→2.2mm;
//   • ШРИФТЫ НАД/ПОД ТАБЛИЦЕЙ: базовый лист 10→11px; заголовок
//     15→18px; месяц/вид 12→14px; норма 10→12px; штамп 9→11px;
//     список мероприятий 8→11px; перечень кодов 8→11px; сноска
//     7.5→10px; точки цвета 7→9px;
//   • БЕЙДЖИ МЕРОПРИЯТИЙ в ячейках печати ВЕРНУТЫ (Task 343 их
//     убирал — заявка 361 вернула): _printCell вызывает _eventsAt,
//     сплошные бейджи с inline-цветом у сформированного дня,
//     пунктирные (план) у пустой ячейки, виртуальный бейдж
//     статус-мероприятия без строки в «Инструктажах»; CSS
//     .wsp-ev-wrap/.wsp-ev/.wsp-ev-plan; сноска поясняет значок.
//
// SW: kipia-test-v733.
//
// Запуск: через tests/run-all.js (require './test-task361.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Срез исходника от начала объекта WorkSchedule (имена методов
// НЕуникальны в файле — извлекаем только из модуля «График работы»)
const WS_START = INDEX_SRC.indexOf('var WorkSchedule = {');
const WS_CLIENT = INDEX_SRC.slice(WS_START, WS_START + 600000);

function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

// Убирает комментарии — ассерты SRC проверяют КОД
function stripComments(src) {
    return String(src)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]*\/\/.*$/gm, '');
}

// Простейший эскейп для моков (поведение = WorkSchedule._esc)
function mockEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// увеличенный срез @media print (блок вырос после Tasks 360/361;
// Task 434 добавил сетку-две-колонки кодов — окно 13000→15000,
// чтобы .wsp-foot оставался внутри среза)
function printCss() {
    const i = INDEX_SRC.indexOf('@media print');
    return stripComments(INDEX_SRC.slice(i, i + 15000));
}

// ============================================================
// 1. SRC — колонка «Сотрудник» по ширине текста
// ============================================================
describe('Task 361 — SRC: колонка «Сотрудник» по тексту', () => {

    test('SRC: _buildPrintHtml измеряет текст (canvas/фолбэк) и задаёт inline width', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.length > 0, 'метод найден');
        assertTrue(b.indexOf('measureText') !== -1,
            'точное измерение через canvas measureText');
        assertTrue(b.indexOf('measureTxt') !== -1,
            'локальная функция измерения');
        assertTrue(b.indexOf("empWmm + 'mm\">Работник</th>'") !== -1,
            'inline ширина на th .wsp-emp (Task 385: работник)');
        assertTrue(b.indexOf('empWmm < 12') !== -1 && b.indexOf('empWmm > 48') !== -1,
            'кламп 12–48mm (Task 439: мин снижен — колонка уже');
    });

    test('SRC: измеряются ФИО и Тип печатаемых строк (Task 439)', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf("viewEmps[wi]['ФИО']") !== -1,
            'ФИО сотрудника');
        assertTrue(b.indexOf('_empTipLine(viewEmps[wi])') !== -1,
            'Тип сотрудника (Task 439: должность из колонки убрана)');
        // шрифты измерения = шрифты печати
        assertTrue(b.indexOf('fioPx = 10.5') !== -1, 'ФИО 10.5px');
        assertTrue(b.indexOf('posPx = 8.5') !== -1, 'должность 8.5px');
    });

    test('SRC: CSS .wsp-emp — фолбэк, НЕ фиксированные 50mm', () => {
        const block = printCss();
        assertTrue(block.indexOf('width: 50mm') === -1,
            'фиксированная ширина 50mm убрана');
        const i = block.indexOf('#wsPrintSheet .wsp-emp {');
        assertTrue(i !== -1, 'правило .wsp-emp есть');
        const rule = block.slice(i, block.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('width: 34mm') !== -1,
            'CSS-фолбэк 34mm (JS перекрывает inline шириной)');
    });

    test('SRC: у колонок дней НЕТ своей ширины — делят остаток поровну', () => {
        const block = printCss();
        // Task 442 вернул правило .wsp-day (font-weight 400 — будние
        // числа НЕ жирные), но ШИРИНЫ в нём по-прежнему нет
        const i = block.indexOf('#wsPrintSheet .wsp-day {');
        if (i !== -1) {
            const r = block.slice(i, block.indexOf('}', i) + 1);
            assertTrue(r.indexOf('width') === -1,
                'правило .wsp-day (Task 442) БЕЗ ширины — дни делят остаток');
            assertTrue(r.indexOf('font-weight: 400') !== -1,
                'Task 442: будние числа — обычные (не жирные)');
        }
        assertTrue(block.indexOf('width: 6.5mm') === -1,
            'прежняя ширина 6.5mm не вернулась (fixed-раскладка жива)');
        assertTrue(block.indexOf('#wsPrintSheet .wsp-day span {') !== -1,
            'день недели под числом жив (регресс)');
        assertTrue(block.indexOf('#wsPrintSheet .wsp-day.wsp-off') !== -1,
            'выходные в шапке живы (регресс)');
    });
});

// ============================================================
// 2. SRC — таблица крупнее + шрифты над/под таблицей
// ============================================================
describe('Task 361 — SRC: размеры и шрифты листа', () => {

    function ruleOf(sel) {
        const block = printCss();
        const i = block.indexOf(sel);
        if (i === -1) return '';
        return block.slice(i, block.indexOf('}', i) + 1);
    }

    test('SRC: базовый шрифт листа 11px (был 10px)', () => {
        const r = ruleOf('#wsPrintSheet {');
        assertTrue(r.indexOf('font: 11px/1.35 Arial') !== -1,
            'базовый шрифт 11px/1.35');
    });

    test('SRC: строки НАД таблицей крупнее', () => {
        assertTrue(ruleOf('#wsPrintSheet .wsp-title {').indexOf('font-size: 18px') !== -1,
            'заголовок 18px (был 15px)');
        assertTrue(ruleOf('#wsPrintSheet .wsp-sub {').indexOf('font-size: 14px') !== -1,
            'месяц/год/вид 14px (был 12px)');
        assertTrue(INDEX_SRC.indexOf('#wsPrintSheet .wsp-meta {') === -1,
            'строки нормы нет — правило удалено (Task 438)');
        assertTrue(INDEX_SRC.indexOf('#wsPrintSheet .wsp-printed {') === -1,
            'штампа «Распечатано» нет — правило удалено (Task 438)');
    });

    test('SRC: строки ПОД таблицей крупнее (легенды нет — Task 442)', () => {
        assertTrue(ruleOf('#wsPrintSheet .wsp-mev {').indexOf('font-size: 11px') !== -1,
            'список мероприятий 11px (был 8px)');
        assertTrue(INDEX_SRC.indexOf('#wsPrintSheet .wsp-legend {') === -1,
            'правило .wsp-legend удалено вместе с перечнем (Task 442)');
        assertTrue(INDEX_SRC.indexOf('#wsPrintSheet .wsp-foot {') === -1,
            'сноска удалена — правило .wsp-foot убрано (Task 438)');
        const i = ruleOf('#wsPrintSheet .wsp-mev-item i {');
        assertTrue(i.indexOf('width: 9px') !== -1, 'точка цвета 9px (была 7px)');
    });

    test('SRC: таблица крупнее — ячейки выше, шрифты таблицы больше', () => {
        const th = printCss();
        const i = th.indexOf('#wsPrintSheet .wsp-grid th,');
        const block = th.slice(i, th.indexOf('overflow: hidden;', i));
        assertTrue(block.indexOf('height: 7.2mm') !== -1,
            'высота ячеек 7.2mm (была 6.2mm)');
        assertTrue(ruleOf('#wsPrintSheet .wsp-cell {').indexOf('font-size: 10px') !== -1,
            'код в ячейке 10px (был 8.5px)');
        assertTrue(ruleOf('#wsPrintSheet .wsp-fio {').indexOf('font-size: 10.5px') !== -1,
            'ФИО 10.5px (был 9px)');
        assertTrue(ruleOf('#wsPrintSheet .wsp-pos {').indexOf('font-size: 8.5px') !== -1,
            'должность 8.5px (была 7.5px)');
        assertTrue(ruleOf('#wsPrintSheet .wsp-day span {').indexOf('font-size: 7.5px') !== -1,
            'день недели 7.5px (был 6.5px)');
    });

    test('SRC: итоговые колонки и точка переработки шире/крупнее', () => {
        assertTrue(ruleOf('#wsPrintSheet .wsp-tot {').indexOf('width: 10mm') !== -1,
            '«Дни» 10mm (были 9mm)');
        assertTrue(ruleOf('#wsPrintSheet .wsp-tot.wsp-tot-over {').indexOf('width: 12mm') !== -1,
            '«Перераб.» 12mm (Task 438: только дни; было 14mm под «дни/ч»)');
        const over = ruleOf('#wsPrintSheet .wsp-over {');
        assertTrue(over.indexOf('width: 2.2mm') !== -1 && over.indexOf('height: 2.2mm') !== -1,
            'точка переработки 2.2mm (была 1.6mm)');
    });
});

// ============================================================
// 3. SRC — бейджи мероприятий в ячейках печати
// ============================================================
describe('Task 361 — SRC: бейджи мероприятий в печати', () => {

    test('SRC: CSS бейджей .wsp-ev* УДАЛЕНЫ (Task 442)', () => {
        const block = printCss();
        assertTrue(block.indexOf('#wsPrintSheet .wsp-ev-wrap {') === -1,
            'правила .wsp-ev-wrap нет (значки удалены)');
        assertTrue(block.indexOf('#wsPrintSheet .wsp-ev {') === -1,
            'правила .wsp-ev нет');
        assertTrue(block.indexOf('wsp-ev-plan') === -1,
            'и пунктирного плана нет (сняты вместе со значками)');
    });

    test('SRC: _printCell — бейджей НЕТ (Task 442)', () => {
        const c = stripComments(methodText(WS_CLIENT, '_printCell'));
        assertTrue(c.indexOf('_eventsAt') === -1,
            'события дня печатной ячейкой не запрашиваются');
        assertTrue(c.indexOf('events.concat') === -1,
            'виртуального бейджа нет');
        assertTrue(c.indexOf('wsp-ev') === -1,
            'разметки бейджей в ячейке нет (Task 442)');
        assertTrue(c.indexOf("content + '</td>'") !== -1,
            'ячейка закрывается сразу после кода/точки');
    });

    test('SRC: сноска удалена — пояснений значка больше нет (Task 438)', () => {
        const b = stripComments(methodText(WS_CLIENT, '_buildPrintHtml'));
        assertTrue(b.indexOf('значок в углу ячейки') === -1,
            'сноска с пояснением значка удалена вместе со wsp-foot (Task 438)');
        assertFalse(b.indexOf('день ещё не сформирован') !== -1,
            'пояснение «день ещё не сформирован» удалено (Task 388)');
    });
});

// ============================================================
// 4. VM — _printCell: бейджи в ячейках
// ============================================================
describe('Task 361 — VM: _printCell бейджи', () => {

    function cellHost(over) {
        over = over || {};
        return new Function('return ({' +
            methodText(WS_CLIENT, '_printCell') + '\n' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '_statusMeta: function(code) { return ' + JSON.stringify(over.meta || { code: 'Д', color: '#FFE082' }) + '; },' +
            '_calDayOff: function(day) { return ' + JSON.stringify(over.dayOff === undefined ? false : over.dayOff) + '; },' +
            '_vacationAt: function(iso, tab) { return ' + JSON.stringify(over.vac || null) + '; },' +
            '_eventsAt: function(iso, tab) { return ' + JSON.stringify(over.events || []) + '; },' +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')();
    }

    var EMP = { 'таб_номер': '017' };

    test('VM: смена Д + событие И — только код в центре, бейджа НЕТ (Task 442)', () => {
        var td = cellHost({ meta: { code: 'Д', color: '#FFE082' },
                            events: [{ code: 'И', training: 7 }] })
            ._printCell(2, '2026-09-02', EMP, { 'статус': 'Д' });
        assertTrue(td.indexOf('background:#FFE082;">Д<') !== -1,
            'код смены Д в центре ячейки (регресс 341)');
        assertTrue(td.indexOf('wsp-ev') === -1,
            'бейджа НЕТ (Task 442: мини-значки удалены)');
    });

    test('VM: пустая ячейка + 2 события — бейджей НЕТ (Task 442)', () => {
        var td = cellHost({ events: [{ code: 'И', training: 1 },
                                      { code: 'ПР', training: 2 }] })
            ._printCell(6, '2026-09-06', EMP, null);
        assertTrue(td.indexOf('wsp-ev') === -1, 'бейджей нет вовсе');
        assertTrue(td.indexOf('background:') === -1, 'заливки нет');
    });

    test('VM: статус-мероприятие И — ПУСТАЯ ячейка (Task 442)', () => {
        var td = cellHost({ meta: { code: 'И', color: '#B3E5FC' },
                            events: [{ code: 'И', training: 7 }] })
            ._printCell(5, '2026-09-05', EMP, { 'статус': 'И' });
        assertTrue(td.indexOf('>И<') === -1, 'кода нет');
        assertTrue(td.indexOf('wsp-ev') === -1, 'бейджа нет');
        assertTrue(td.indexOf('background:') === -1, 'фона нет');
    });

    test('VM: статус-мероприятие ОБ БЕЗ записи — ПУСТАЯ ячейка (Task 442)', () => {
        var td = cellHost({ meta: { code: 'ОБ', color: '#D1C4E9' } })
            ._printCell(7, '2026-09-07', EMP, { 'статус': 'ОБ' });
        assertTrue(td.indexOf('>ОБ<') === -1, 'кода нет');
        assertTrue(td.indexOf('wsp-ev') === -1, 'бейджа нет');
    });

    test('VM: переработка + событие — точка есть, бейджа нет (Task 442)', () => {
        var td = cellHost({ events: [{ code: 'И', training: 7 }] })
            ._printCell(3, '2026-09-03', EMP,
                        { 'статус': 'д', 'переработка': 1 });
        assertTrue(td.indexOf('wsp-over') !== -1, 'красная точка переработки');
        assertTrue(td.indexOf('wsp-ev') === -1, 'бейджа нет (Task 442)');
    });

    test('VM: без событий — бейджей нет (регресс)', () => {
        var td = cellHost()._printCell(4, '2026-09-04', EMP, { 'статус': 'Д' });
        assertTrue(td.indexOf('wsp-ev') === -1, 'бейджей нет');
    });

    test('VM: без мока _eventsAt (старый host) — не падает, бейджей нет', () => {
        var host = new Function('return ({' +
            methodText(WS_CLIENT, '_printCell') + '\n' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '_statusMeta: function() { return {}; },' +
            '_calDayOff: function() { return false; },' +
            '_vacationAt: function() { return null; },' +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')();
        var td = host._printCell(2, '2026-09-02', EMP, { 'статус': 'Д' });
        assertTrue(td.indexOf('>Д</td>') !== -1, 'ячейка построена');
        assertTrue(td.indexOf('wsp-ev') === -1, 'бейджей нет');
    });
});

// ============================================================
// 5. VM — _buildPrintHtml: ширина колонки по тексту
// ============================================================
describe('Task 361 — VM: ширина «Сотрудник» по тексту', () => {

    function sheetHost(opts, mockDoc) {
        opts = opts || {};
        var args = 'ProdCalendar';
        if (mockDoc) args += ', document';
        return new Function(args, 'return ({' +
            methodText(WS_CLIENT, '_buildPrintHtml') + '\n' +
            '_year: 2026, _month: 9, _view: "full",' +
            '_isoDate: function(dt) { return dt.getFullYear() + "-" + ' +
                '(dt.getMonth() < 9 ? "0" : "") + (dt.getMonth() + 1) + "-" + ' +
                '(dt.getDate() < 10 ? "0" : "") + dt.getDate(); },' +
            '_buildEntryIndex: function() { return {}; },' +
            '_PENDING: {},' +
            '_empTipLine: function() { return "смена №1"; },' +
            '_fmtTotalsNum: function(v) { return String(Math.round((v || 0) * 10) / 10).replace(".", ","); },' +
            '_STATUS_CODES: ' + JSON.stringify(opts.codes || [
                { code: 'Д', name: 'День (12-час)', color: '#FFE082' }]) + ',' +
            '_calDayOff: function(day) { return day % 7 === 0 || day % 6 === 0; },' +
            '_vacationAt: function() { return null; },' +
            '_TRAININGS: [],' +
            '_EMPLOYEES: ' + JSON.stringify(opts.employees || [
                { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' }]) + ',' +
            '_trainingCodeOf: function() { return ""; },' +
            '_statusMeta: function() { return null; },' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '_printCell: function(day, iso, emp, entry) { return "<td></td>"; },' +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')(opts.pcal || { monthStats: function() { return null; } },
                   mockDoc || undefined);
    }

    function empWidth(html) {
        var m = html.match(/<th class="wsp-emp" style="width:(\d+(?:\.\d+)?)mm">Работник<\/th>/);
        return m ? parseFloat(m[1]) : null;
    }

    test('VM: inline ширина на th .wsp-emp в клампе 12–48 (Task 439)', () => {
        var html = sheetHost()._buildPrintHtml(
            [{ 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' }],
            { byTab: {}, grand: null });
        var w = empWidth(html);
        assertTrue(w !== null, 'inline width есть');
        assertTrue(w >= 12 && w <= 48, 'в клампе 12–48mm: ' + w);
        // фолбэк-оценка Node (без canvas): 20 симв × 10.5px × 0.62
        // = 130.2px = 34.5mm + 3.5mm ≈ 38mm (шаг 0.5mm вверх)
        assertEqual(w, 38, 'оценка по символам без canvas');
    });

    test('VM: canvas measureText точнее оценки (мок document)', () => {
        // мок canvas: width = 7px × длина строки
        var doc = {
            createElement: function(tag) {
                return {
                    getContext: function() {
                        return {
                            font: '',
                            measureText: function(t) {
                                return { width: String(t).length * 7 };
                            }
                        };
                    }
                };
            }
        };
        var html = sheetHost(null, doc)._buildPrintHtml(
            [{ 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' }],
            { byTab: {}, grand: null });
        // 20 симв × 7px = 140px = 37.0mm + 3.5mm = 40.5 → 41mm
        assertEqual(empWidth(html), 41, 'ширина из canvas measureText');
    });

    test('VM: короткие ФИО — ширина по заголовку «Работник» (Task 439)', () => {
        var html = sheetHost()._buildPrintHtml(
            [{ 'ФИО': 'А', 'таб_номер': '001' }], { byTab: {}, grand: null });
        // «Работник» 8 симв × 11 × 0.62 = 54.6px = 14.4mm + 3.5 =
        // 17.95 → шаг 0.5mm вверх = 18mm; Тип «смена №1» короче
        assertEqual(empWidth(html), 18, 'по заголовку «Работник» — 18mm');
    });

    test('VM: очень длинное ФИО — максимум 48mm (переносится)', () => {
        var long = new Array(101).join('А'); // 100 символов
        var html = sheetHost()._buildPrintHtml(
            [{ 'ФИО': long, 'таб_номер': '001' }], { byTab: {}, grand: null });
        assertEqual(empWidth(html), 48, 'кламп-максимум 48mm');
    });

    test('VM: самая длинная строка побеждает (заголовок против Типа)', () => {
        var html = sheetHost()._buildPrintHtml(
            [{ 'ФИО': 'А', 'таб_номер': '001' }], { byTab: {}, grand: null });
        // Тип-мок «смена №1» (8 симв × 8.5 × 0.62 = 42.2px =
        // 11.2mm) — короче заголовка «Работник» (14.4mm)
        assertEqual(empWidth(html), 18, 'ФИО «А» + короткий Тип → 18mm');
    });

    test('VM: дни без inline ширины — остаток делится сам', () => {
        var html = sheetHost()._buildPrintHtml(
            [{ 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' }],
            { byTab: {}, grand: null });
        var i = html.indexOf('<th class="wsp-day');
        var dayTh = html.slice(i, html.indexOf('>', i) + 1);
        assertTrue(dayTh.indexOf('style') === -1,
            'у th дня нет inline ширины (fixed-раскладка делит остаток)');
    });
});

// ============================================================
// 6. VM — регресс: лист целиком (шапка/секции/фут)
// ============================================================
describe('Task 361 — VM: регресс печатного листа', () => {

    function sheetHost() {
        return new Function('ProdCalendar', 'return ({' +
            methodText(WS_CLIENT, '_buildPrintHtml') + '\n' +
            '_year: 2026, _month: 9, _view: "full",' +
            '_isoDate: function(dt) { return dt.getFullYear() + "-" + ' +
                '(dt.getMonth() < 9 ? "0" : "") + (dt.getMonth() + 1) + "-" + ' +
                '(dt.getDate() < 10 ? "0" : "") + dt.getDate(); },' +
            '_buildEntryIndex: function() { return {}; },' +
            '_PENDING: {},' +
            '_empTipLine: function() { return "смена №1"; },' +
            '_fmtTotalsNum: function(v) { return String(Math.round((v || 0) * 10) / 10).replace(".", ","); },' +
            '_STATUS_CODES: [{ code: "Д", name: "День (12-час)", color: "#FFE082" }],' +
            '_calDayOff: function(day) { return day % 7 === 0 || day % 7 === 0; },' +
            '_vacationAt: function() { return null; },' +
            '_TRAININGS: [],' +
            '_EMPLOYEES: [{ "ФИО": "Иванов Иван Иванович", "таб_номер": "017" }],' +
            '_trainingCodeOf: function() { return ""; },' +
            '_statusMeta: function() { return null; },' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '_printCell: function(day, iso, emp, entry) { return "<td></td>"; },' +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')({ monthStats: function() { return { workDays: 22, hours40: 176 }; } });
    }

    test('VM: шапка/таблица/мероприятия/коды/сноска — всё на месте', () => {
        var html = sheetHost()._buildPrintHtml(
            [{ 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017' }],
            { byTab: {}, grand: null });
        assertTrue(html.indexOf('wsp-title') !== -1, 'заголовок');
        assertTrue(html.indexOf('<table class="wsp-grid">') !== -1, 'таблица');
        assertTrue(html.indexOf('<div class="wsp-mev">') !== -1, 'секция мероприятий (Task 360)');
        assertTrue(html.indexOf('<div class="wsp-legend">') === -1,
            'перечня кодов НЕТ (Task 442: столбец удалён)');
        assertTrue(html.indexOf('значок в углу ячейки') === -1,
            'сноски с пояснением значка нет (Task 438)');
        assertTrue(html.indexOf('wsp-sum') === -1, 'итоговой строки нет (Task 343 жив)');
    });
});

// ============================================================
// 7. Service Worker
// ============================================================
describe('Task 361 — Service Worker', () => {

    test('SW: кэш поднят до kipia-test-v733', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v733'") !== -1,
            'CACHE_VERSION = kipia-test-v733 (Task 361 — фронтенд)');
        assertFalse(SW_SRC.indexOf('kipia-test-v734') !== -1,
            'v605 ещё не существует (лишний инкремент)');
    });

    test('SW: в index.html нет захардкоженной версии кэша', () => {
        assertFalse(INDEX_SRC.indexOf('kipia-test-v59') !== -1,
            'клиент не знает номер кэша (версией управляет sw.js)');
    });
});
