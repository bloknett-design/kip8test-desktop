// ============================================================
// Task 449 — заявка пользователя: «В отчёте талонов необходимо
// что бы отчёт умещался на один лист А4, сейчас нижние подписи не
// вмещаются, даже если это повлияет на уменьшение размера шрифта
// текста в отчёте. Должности укажи в формате как в строгой форме
// "Слесарь по КИП и А", ФИО и Должность выравни по левому краю.
// Итого: 12 часовые - в одну строчку, под ними 8 часовые - в одну
// строчку. В шапке таблицы "№ п/п" в две строчки. Названия групп в
// таблице "12 часовые" и "8 часовые" в объеденённых ячейках по
// всей горизонтали в таблице».
//
// Реализация (ТОЛЬКО печатная вёрстка, index.html):
//   • _TALONS_PRINT_CSS — компакт ОДНОГО листа А4: шапка 12pt
//     («ОТЧЕТ» 13pt), th 10.5pt/9мм, td 11pt/6мм, группы 4.2мм,
//     ИТОГО 11pt/5.2мм, подписи 11pt/5.5мм, подсказки 7pt/3.5мм,
//     разделители 2.2мм, межблочные поля сокращены; ЛЕВОЕ
//     выравнивание ФИО/Должности/ярлыков групп/меток ИТОГО/(шт.)
//     и подсказки подписей — правилами специфичности 1,3,1
//     (td.класс; прежде td-правило 1,2,1 перебивало: ФИО и
//     Должность печатались ПО ЦЕНТРУ, подсказки — 12pt вместо 8pt,
//     метки ИТОГО — по центру вместо правого края);
//   • _buildTalonsPrintHtml — «№<br>п/п» (две строчки); группы
//     «12 часовые»/«8 часовые» — ОБЪЕДИНЁННЫЕ ячейки colspan 7 на
//     всю ширину; ИТОГО — ОДНА строка на группу («ИТОГО: 12
//     часовые» / «8 часовые» в colspan 5, right + nowrap, сумма —
//     в колонке талонов); должности — через НОВЫЙ хелпер
//     _talonsPosition («Слесарь КИПиА»/«Слесарь КИП и А» →
//     «Слесарь по КИП и А» — формат листа «Данные работников»
//     строгой формы; должности без «КИП» — как есть; пустая —
//     прочерк);
//   • базовый шрифт инжекта печати и standalone-предпросмотра —
//     11pt/1.25 (было 12pt/1.3).
// Модель данных, экранная страница (правки/чипы/«Дней явки»),
// @page-поля, диалог предпросмотра — НЕ ТРОНУТЫ.
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
// Срез модуля WorkSchedule (имена методов неуникальны в монолите)
const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// Значение строковой константы _TALONS_PRINT_CSS (константа
// заканчивается правилом сетки .wst-c7 — как в Tasks 447/448)
const TALONS_CSS_VALUE = new Function('return ({' + (function() {
    const start = WS_SRC.indexOf('_TALONS_PRINT_CSS:');
    const marker = "'#wsPrintSheet.wst-sheet .wst-c7 { width: 22.2%; }',";
    const end = WS_SRC.indexOf(marker, start);
    if (start === -1 || end === -1) throw new Error('_TALONS_PRINT_CSS не найден');
    return WS_SRC.slice(start, end + marker.length);
})() + '})._TALONS_PRINT_CSS;')();

// ============================================================
// 1. SRC — компакт одного листа А4
// ============================================================
describe('Task 449 — SRC: один лист А4 (компакт)', () => {

    test('шапка формы сжата: 12pt / «ОТЧЕТ» 13pt, поля сокращены', () => {
        const css = TALONS_CSS_VALUE;
        assertTrue(css.indexOf('.wst-rep { font-family: Times New Roman, Times, serif; color: #000; font-size: 11pt; }') !== -1,
            'базовый кегль формы 11pt (было 12pt)');
        assertTrue(css.indexOf('.wst-rep-org { font-size: 12pt; }') !== -1,
            'предприятие 12pt (было 14pt)');
        assertTrue(css.indexOf('.wst-rep-title { text-align: center; font-size: 13pt; font-weight: 700; margin-top: 2mm; }') !== -1,
            '«ОТЧЕТ» 13pt/2мм (было 14pt/4.5мм)');
        assertTrue(css.indexOf('.wst-rep-sub { text-align: center; font-size: 12pt; margin-top: 0.5mm; }') !== -1,
            'подзаголовок Л.П.П. 12pt/0.5мм (было 14pt/1мм)');
        assertTrue(css.indexOf('.wst-rep-dept { text-align: center; font-size: 12pt; margin: 0.5mm 0 2.5mm; }') !== -1,
            'цех 12pt, низ 2.5мм (было 14pt/4мм)');
    });

    test('таблица сжата: th 10.5pt/9мм, td 11pt/2.5em (две строки — Task 454), группы 4.2мм', () => {
        const css = TALONS_CSS_VALUE;
        assertTrue(css.indexOf('th { border: 1px solid #000; font-weight: 400; text-align: center; vertical-align: middle; padding: 0.6mm 1mm; font-size: 10.5pt; height: 9mm; }') !== -1,
            'шапка таблицы 10.5pt/9мм (было 12pt/14мм)');
        assertTrue(css.indexOf('td { border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0.5mm 1mm; font-size: 11pt; height: 2.5em; overflow: hidden; }') !== -1,
            'строки данных 11pt/2.5em — ДВЕ строки текста (Task 454; было 6мм)');
        assertTrue(css.indexOf('.wst-r-group td { height: 4.2mm; }') !== -1,
            'строки-ярлыки групп 4.2мм (было 6мм)');
    });

    test('ИТОГО и подписи сжаты: 11pt, подсказки 7pt, разделители 2.2мм', () => {
        const css = TALONS_CSS_VALUE;
        assertTrue(css.indexOf('.wst-tot-table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 2mm; }') !== -1,
            'блок ИТОГО в 2мм от таблицы (было 2.5мм)');
        assertTrue(css.indexOf('.wst-tot-table td { border: none; padding: 0.4mm 1mm; font-size: 11pt; height: 5.2mm; vertical-align: middle; }') !== -1,
            'строки ИТОГО 11pt/5.2мм (было 12pt/6мм)');
        assertTrue(css.indexOf('.wst-sign-table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 3.5mm; }') !== -1,
            'блок подписей в 3.5мм от ИТОГО (было 9мм)');
        assertTrue(css.indexOf('.wst-sign-table td { border: none; padding: 0 1mm; font-size: 11pt; height: 5.5mm; vertical-align: bottom; }') !== -1,
            'строки подписей 11pt/5.5мм (было 12pt/7мм)');
        assertTrue(css.indexOf('td.wst-s-hint { font-size: 7pt; height: 3.5mm; vertical-align: top; text-align: center; padding-top: 0.3mm; }') !== -1,
            'подсказки 7pt/3.5мм (было 8pt/4.5мм) + специфичность 1,3,1');
        assertTrue(css.indexOf('.wst-s-gap { height: 2.2mm; }') !== -1,
            'разделители подписей 2.2мм (было 5.5мм)');
    });

    test('базовый шрифт печати и предпросмотра — 11pt/1.25', () => {
        const inj = stripComments(methodText(WS_SRC, '_talonsInjectPrintStyle'));
        assertTrue(inj.indexOf('#wsPrintSheet.wst-sheet { font: 11pt/1.25 Times New Roman, Times, serif; color: #000; }') !== -1,
            'инжект печати: 11pt/1.25 (было 12pt/1.3)');
        const doc = stripComments(methodText(WS_SRC, '_buildTalonsFileHtml'));
        assertTrue(doc.indexOf('font: 11pt/1.25 Times New Roman, Times, serif; color: #000; }') !== -1,
            'standalone-предпросмотр: тот же кегль (синхронно печати)');
        // @page-поля НЕ тронуты (12мм 10мм) — компакт за счёт кегля,
        // а не полей принтера
        assertTrue(inj.indexOf('@page { size: A4 portrait; margin: 12mm 10mm; }') !== -1,
            '@page A4 книжная, поля прежние');
    });
});

// ============================================================
// 2. SRC — выравнивание и специфичность (1,3,1)
// ============================================================
describe('Task 449 — SRC: влево и специфичность', () => {

    test('ФИО и Должность — по ЛЕВОМУ краю (td.класс 1,3,1)', () => {
        const css = TALONS_CSS_VALUE;
        assertTrue(css.indexOf('.wst-rep-table td.wst-r-fio, ') !== -1 &&
                   css.indexOf('.wst-rep-table td.wst-r-pos { text-align: left; }') !== -1,
            'правила через td.класс — иначе td-центр (1,2,1) перебивал (1,2,0)');
        assertFalse(css.indexOf('.wst-sheet .wst-r-fio, \' +\n            \'#wsPrintSheet.wst-sheet .wst-r-pos { text-align: left; }') !== -1,
            'старых слабых правил больше нет');
    });

    test('ярлык группы — ПО ЦЕНТРУ объединённой ячейки (Task 450); td.класс 1,3,1', () => {
        const css = TALONS_CSS_VALUE;
        assertTrue(css.indexOf('.wst-rep-table td.wst-r-glab { text-align: center; }') !== -1,
            'ярлык «12/8 часовые» — по центру (Task 450; в 449 был влево с отступом 2мм)');
        assertTrue(css.indexOf('.wst-rep-table td.wst-r-glab { text-align: left') === -1,
            'прежнего левого правила больше нет');
    });

    test('метки ИТОГО и (шт.) — td.класс; класс wst-t-grp удалён', () => {
        const css = TALONS_CSS_VALUE;
        assertTrue(css.indexOf('.wst-tot-table td.wst-t-itog { text-align: right; white-space: nowrap; }') !== -1,
            'метка ИТОГО — вправо к сумме + nowrap (одна строка)');
        assertTrue(css.indexOf('.wst-tot-table td.wst-t-unit { text-align: left; }') !== -1,
            '(шт.) — влево от суммы, td.класс');
        assertTrue(css.indexOf('wst-t-grp') === -1,
            'класса wst-t-grp больше нет (группа — внутри метки ИТОГО)');
        // суммы — прежнее правило Task 448 (курсив + подчёркивание)
        assertTrue(css.indexOf('.wst-tot-table td.wst-t-val { text-align: center; font-style: italic; border-bottom: 1px solid #000; }') !== -1,
            'суммы ИТОГО — курсив с подчёркиванием (не тронуто)');
    });

    test('сетка 7 колонок и многостраничность — без изменений', () => {
        const css = TALONS_CSS_VALUE;
        const widths = [['wst-c1', '4.2%'], ['wst-c2', '12%'],
                        ['wst-c3', '18.2%'], ['wst-c4', '20%'],
                        ['wst-c5', '11.9%'], ['wst-c6', '11.5%'],
                        ['wst-c7', '22.2%']];
        for (const [cls, w] of widths) {
            assertTrue(css.indexOf('.' + cls + ' { width: ' + w + '; }') !== -1,
                'ширина ' + cls + ' = ' + w);
        }
        assertTrue(css.indexOf('table-header-group') !== -1 &&
                   css.indexOf('page-break-inside: avoid') !== -1 &&
                   css.indexOf('.wst-r-group { page-break-after: avoid; }') !== -1,
            'повтор шапки / строки не рвутся / ярлык с первой строкой');
    });
});

// ============================================================
// 3. SRC — структура печатной формы
// ============================================================
describe('Task 449 — SRC: «№ п/п» в две строчки, группы colspan 7, ИТОГО одной строкой', () => {

    test('шапка таблицы: «№<br>п/п» — ровно две строчки', () => {
        const fn = stripComments(methodText(WS_SRC, '_buildTalonsPrintHtml'));
        assertTrue(fn.indexOf("'<th class=\"wst-r-n\">№<br>п/п</th>'") !== -1,
            '«№» первой строчкой, «п/п» — второй');
        assertTrue(fn.indexOf('№ п/п</th>') === -1,
            'однострочного «№ п/п» больше нет');
    });

    test('группы — объединённые ячейки на всю горизонталь (colspan 7)', () => {
        const fn = stripComments(methodText(WS_SRC, '_buildTalonsPrintHtml'));
        assertTrue(fn.indexOf('<td colspan="7" class="wst-r-glab">12 часовые</td>') !== -1,
            '«12 часовые» — одна ячейка на все 7 колонок');
        assertTrue(fn.indexOf('<td colspan="7" class="wst-r-glab">8 часовые</td>') !== -1,
            '«8 часовые» — одна ячейка на все 7 колонок');
        assertTrue(fn.indexOf('<td colspan="3"></td>') === -1,
            'прежней разрезки (3+1+3) больше нет');
    });

    test('ИТОГО — по ОДНОЙ строке на группу, метка в colspan 5', () => {
        const fn = stripComments(methodText(WS_SRC, '_buildTalonsPrintHtml'));
        assertTrue(fn.indexOf('<tr><td colspan="5" class="wst-t-itog">ИТОГО: 12 часовые</td>') !== -1,
            'первая строка: «ИТОГО: 12 часовые» целиком');
        assertTrue(fn.indexOf('<tr><td colspan="5" class="wst-t-itog">8 часовые</td>') !== -1,
            'под ней: «8 часовые» целиком');
        // сумма — в колонке талонов (c6), затем (шт.)
        assertTrue(fn.indexOf("'\" class=\"wst-t-itog\">ИТОГО: 12 часовые</td>' +") === -1,
            'нет мусорных конкатенаций');
        const i12 = fn.indexOf("ИТОГО: 12 часовые</td>' +");
        const v12 = fn.indexOf("' + groupSum(g12, 't12') + '");
        assertTrue(i12 !== -1 && v12 !== -1, 'суммы по группам на месте (по категории t12/t8 — Task 451)');
    });

    test('должности — через _talonsPosition (формат строгой формы)', () => {
        const fn = stripComments(methodText(WS_SRC, '_buildTalonsPrintHtml'));
        assertTrue(fn.indexOf("self._esc(self._talonsPosition(r.emp['должность']))") !== -1,
            'печать берёт должность через нормализатор');
        assertTrue(fn.indexOf("String(r.emp['должность'] || '').trim() || '—'") === -1,
            'прямая печать сырой должности убрана');
    });

    test('экранная страница НЕ тронута: сырая должность, «Дней явки»', () => {
        const rp = stripComments(methodText(WS_SRC, '_renderTalonsPage'));
        assertTrue(rp.indexOf("row.emp['должность']") !== -1,
            'экранная таблица печатает должность как есть (без нормализации)');
        assertTrue(rp.indexOf('_talonsPosition') === -1,
            'нормализатор на экране не используется');
        assertTrue(rp.indexOf('Дней явки') !== -1 && rp.indexOf('wst-count') !== -1,
            'колонка «Дней явки» и поля правок на месте');
    });
});

// ============================================================
// 4. SRC — хелпер _talonsPosition
// ============================================================
describe('Task 449 — SRC: _talonsPosition', () => {

    test('метод существует, приводит «КИПиА»/«КИП и А» к «по КИП и А»', () => {
        const fn = methodText(WS_SRC, '_talonsPosition');
        assertTrue(fn.indexOf("replace(/кип\\s*и\\s*а/gi, 'КИП и А')") !== -1,
            '«КИПиА»/«кип и а» → каноническое «КИП и А»');
        assertTrue(fn.indexOf("/по\\s+КИП и А/.test(m)") !== -1,
            'уже с «по» — не дублирует предлог');
        assertTrue(fn.indexOf("m.replace(/КИП и А/, 'по КИП и А')") !== -1,
            'вставка «по» перед «КИП и А»');
        assertTrue(fn.indexOf("return '—'") !== -1,
            'пустая должность — прочерк');
    });
});

// ============================================================
// 5. VM — печатная форма (мок-DOM как в Tasks 447/448)
// ============================================================
describe('Task 449 — VM: должности, группы, ИТОГО, шапка', () => {

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

    function printHost(dom, win, employees, entries) {
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
            '_EMPLOYEES: ' + JSON.stringify(employees || [
                { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
                  'должность': 'Слесарь КИПиА' },
                { 'таб_номер': '024', 'ФИО': 'Гусев Г. Г.', 'тип': 'сменный',
                  'должность': 'Мастер по КИП и А' }]) + ',' +
            '_ENTRIES: ' + JSON.stringify(entries || [
                { 'дата': NOWY + '-' + MM + '-01', 'таб_номер': '017', 'статус': 'Д8' },
                { 'дата': NOWY + '-' + MM + '-02', 'таб_номер': '017', 'статус': 'Д8' },
                { 'дата': NOWY + '-' + MM + '-03', 'таб_номер': '024', 'статус': 'Д' },
                { 'дата': NOWY + '-' + MM + '-04', 'таб_номер': '024', 'статус': 'Н' },
                { 'дата': NOWY + '-' + MM + '-05', 'таб_номер': '024', 'статус': 'Н' }]) + ',' +
            '_PENDING: {}, _TALONS_EDIT: {},' +
            '_year: ' + NOWY + ', _month: ' + NOWM + ',' +
            '_viewLevel: \'edit\', _canEdit: true,' +
            '_STATUS_CODES: [],' +
            '});')(undefined, win, dom.document);
    }

    test('_talonsPosition: сценарии нормализации (формат строгой формы)', () => {
        const h = printHost(printDom(), { print: function() {} });
        const cases = [
            ['Слесарь КИПиА', 'Слесарь по КИП и А'],
            ['Слесарь КИП и А', 'Слесарь по КИП и А'],
            ['Слесарь по КИП и А', 'Слесарь по КИП и А'],
            ['Мастер КИПиА', 'Мастер по КИП и А'],
            ['Мастер по КИП и А', 'Мастер по КИП и А'],
            ['Инженер КИПиА', 'Инженер по КИП и А'],
            ['Электрик', 'Электрик'],
            ['Электромонтёр', 'Электромонтёр'],
            ['', '—'],
            [null, '—'],
            ['   ', '—']
        ];
        for (const [raw, want] of cases) {
            assertEqual(h._talonsPosition(raw), want,
                '«' + raw + '» → «' + want + '»');
        }
    });

    test('печать: «Слесарь КИПиА» → «Слесарь по КИП и А», прочие — как есть', () => {
        const h = printHost(printDom(), { print: function() {} }, [
            { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
              'должность': 'Слесарь КИПиА' },
            { 'таб_номер': '024', 'ФИО': 'Гусев Г. Г.', 'тип': 'сменный',
              'должность': 'Мастер по КИП и А' },
            { 'таб_номер': '031', 'ФИО': 'Сидоров С. С.', 'тип': 'сменный',
              'должность': 'Электрик' }
        ]);
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        assertTrue(html.indexOf('Слесарь по КИП и А') !== -1,
            'Иванов: КИПиА приведён к формату формы');
        assertTrue(html.indexOf('Слесарь КИПиА') === -1,
            'сырого «Слесарь КИПиА» в печати больше нет');
        assertTrue(html.indexOf('Мастер по КИП и А') !== -1,
            'уже в формате формы — не дублирует «по по»');
        assertTrue(html.indexOf('Электрик') !== -1,
            'должность без КИП — как есть');
        assertTrue((html.match(/Электрик/g) || []).length === 1,
            '«Электрик» — один раз (не задвоен)');
    });

    test('печать: шапка «№<br>п/п» + группы colspan 7 + ИТОГО одной строкой', () => {
        const h = printHost(printDom(), { print: function() {} });
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        assertTrue(html.indexOf('<th class="wst-r-n">№<br>п/п</th>') !== -1,
            '«№ п/п» в две строчки');
        assertTrue(html.indexOf('<td colspan="7" class="wst-r-glab">12 часовые</td>') !== -1,
            'группа «12 часовые» — объединённая ячейка');
        assertTrue(html.indexOf('<td colspan="7" class="wst-r-glab">8 часовые</td>') !== -1,
            'группа «8 часовые» — объединённая ячейка');
        // ИТОГО: Гусев 3 талона (12-часовые), Иванов 2 (8-часовые)
        const i12 = html.indexOf('<td colspan="5" class="wst-t-itog">ИТОГО: 12 часовые</td>');
        const i8 = html.indexOf('<td colspan="5" class="wst-t-itog">8 часовые</td>');
        const v3 = html.indexOf('<td class="wst-t-val">3</td>');
        const v2 = html.indexOf('<td class="wst-t-val">2</td>');
        assertTrue(i12 !== -1 && i8 !== -1 && i12 < i8,
            'две строки ИТОГО по порядку групп');
        assertTrue(v3 !== -1 && v3 > i12 && v3 < i8,
            '«ИТОГО: 12 часовые» — сумма 3 в той же строке');
        assertTrue(v2 !== -1 && v2 > i8, '«8 часовые» — сумма 2 в той же строке');
        assertEqual((html.match(/\(шт\.\)/g) || []).length, 2,
            'две пометки (шт.)');
        // метка ИТОГО — одна строка: между «ИТОГО:» и суммой нет </td>
        assertTrue(html.indexOf('ИТОГО: 12 часовые</td>') !== -1,
            'метка целиком в одной ячейке (без разбивки на колонки)');
    });

    test('печать: подписи прежние (Игушов/Котельникова/Фензель), строки целы', () => {
        const h = printHost(printDom(), { print: function() {} });
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        for (const part of ['Рук. подразделения', 'Игушов Н.В.',
                            'С табелем сверено:', 'Котельникова И.А.',
                            '(подпись материально-ответственного лица)',
                            'Руководитель СОТ и ПБ', 'Фензель В.П.',
                            '_________________', '(подпись)', '(ф.и.о.)']) {
            assertTrue(html.indexOf(part) !== -1, 'подпись: ' + part);
        }
        assertEqual((html.match(/wst-s-gap/g) || []).length, 2,
            'два разделителя между тремя подписями');
    });
});

// ============================================================
// 6. SW — версия кэша
// ============================================================
describe('Task 449 — SW', () => {
    test('SW: кэш поднят до kipia-test-v755 (Task 449)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v755'") !== -1,
            'CACHE_VERSION = kipia-test-v755');
        assertTrue(SW_SRC.indexOf('kipia-test-v756') === -1,
            'kipia-test-v755 не существует');
        assertTrue(SW_SRC.indexOf('Task 449') !== -1,
            'комментарий Task 449 в истории версий');
    });
});
