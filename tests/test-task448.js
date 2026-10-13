// ============================================================
// Task 448 — открытый пункт Task 447: пользователь прислал ссылку
// на файл Excel со СТРОГОЙ формой отчёта (лист «Отчет»:
// «Наименование предприятия ООО ПО "Токем"» / «ОТЧЕТ» / «на
// выдачу талонов Л.П.П. (лечебно-профилактическое питание) за
// месяц год г.» / «Цех № 8 пр-во ИОС»; таблица СЕМЬ колонок —
// № п/п / Табельный номер / Ф.И.О. / Должность / Кол-во
// отработан-ных часов / Кол-во выданных талонов / Роспись о
// получении; группы «12 часовые» и «8 часовые»; ИТОГО (шт.) по
// группам; подписи: Рук. подразделения — Игушов Н.В., С табелем
// сверено — Котельникова И.А. (материально-ответственное лицо),
// Руководитель СОТ и ПБ — Фензель В.П.).
//
// Task 449 (сверху): форма УПЛОТНЕНА до одного листа А4 —
// шапка 12/13pt, th 10.5pt/9мм, td 11pt/6.3мм, ИТОГО/подписи
// 11pt, подсказки 7pt; «№<br>п/п»; группы — colspan 7; ИТОГО —
// по одной строке на группу; ФИО/Должность — влево (1,3,1);
// должности — «Слесарь по КИП и А» (_talonsPosition).
//
// Реализация (ТОЛЬКО печатная вёрстка, index.html):
//   • _TALONS_PRINT_CSS — сетка 7 колонок по ширинам Excel
//     (4.2/12/18.2/20/11.9/11.5/22.2%), шапка 14pt / таблица
//     12pt Times New Roman, шапка таблицы БЕЗ жирного, суммы
//     ИТОГО — курсив с подчёркиванием, подсказки подписей 8pt;
//   • _buildTalonsPrintHtml — группы «12 часовые» (тип
//     «сменный») / «8 часовые» (прочие), порядок шахматки,
//     сквозная нумерация, часы = талоны × 12/8 (формула листа
//     E=F×12/8), ИТОГО по группам, три подписи (_talonsSignBlock);
//   • модель данных, экранная страница, инжект @page, диалог
//     предпросмотра — НЕ ТРОНУТЫ (как заявлено в открытом
//     пункте Task 447).
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

// Значение строковой константы _TALONS_PRINT_CSS (вычисляем
// конкатенацию фрагментов; константа заканчивается правилом .wst-c7)
const TALONS_CSS_VALUE = new Function('return ({' + (function() {
    const start = WS_SRC.indexOf('_TALONS_PRINT_CSS:');
    const marker = "'#wsPrintSheet.wst-sheet .wst-c7 { width: 22.2%; }',";
    const end = WS_SRC.indexOf(marker, start);
    if (start === -1 || end === -1) throw new Error('_TALONS_PRINT_CSS не найден');
    return WS_SRC.slice(start, end + marker.length);
})() + '})._TALONS_PRINT_CSS;')();

// ============================================================
// 1. SRC — вёрстка строгой формы
// ============================================================
describe('Task 448 — SRC: строгая форма по Excel', () => {

    test('шапка формы: предприятие / ОТЧЕТ / Л.П.П. / цех — точно по листу', () => {
        const fn = methodText(WS_SRC, '_buildTalonsPrintHtml');
        for (const part of [
                'Наименование предприятия ООО ПО "Токем"',
                '>ОТЧЕТ<',
                'на выдачу талонов Л.П.П. (лечебно-профилактическое питание) за ',
                'Цех № 8 пр-во ИОС']) {
            assertTrue(fn.indexOf(part) !== -1, 'шапка содержит: ' + part);
        }
        // месяц подставляется текущий — нижний регистр номинатива
        assertTrue(fn.indexOf("this._esc(mi.name) + ' ' + mi.y") !== -1,
            'период «за месяц год г.» из модели месяца');
    });

    test('таблица — РОВНО семь колонок, заголовки дословно из формы', () => {
        const fn = methodText(WS_SRC, '_buildTalonsPrintHtml');
        const heads = ['№<br>п/п', 'Табельный номер', 'Ф.И.О.', 'Должность',
                       'Кол-во отработан-ных часов',
                       'Кол-во выданных талонов', 'Роспись о получении'];
        for (const h of heads) {
            assertTrue(fn.indexOf(h) !== -1, 'заголовок: ' + h);
        }
        // 7 <th> в шапке
        const thCount = (fn.match(/<th /g) || []).length;
        assertEqual(thCount, 7, 'ровно 7 колонок шапки');
        // колонка «Роспись» — пустые ячейки для рукописного заполнения
        assertTrue(fn.indexOf('<td class="wst-r-sign"></td>') !== -1,
            'пустые ячейки «Роспись о получении»');
    });

    test('группы «12 часовые» / «8 часовые»: деление по типу «сменный»', () => {
        const fn = stripComments(methodText(WS_SRC, '_buildTalonsPrintHtml'));
        assertTrue(fn.indexOf("tip === 'сменный'") !== -1,
            'тип «сменный» — признак группы «12 часовые» (авто/нулевой fallback — Task 451)');
        assertTrue(fn.indexOf("rowsOf(g12, 12, 't12')") !== -1 &&
                   fn.indexOf("rowsOf(g8, 8, 't8')") !== -1,
            'часы: 12-часовым × 12 (талоны t12), 8-часовым × 8 (t8) — формула листа E=F×12/8');
        assertTrue(fn.indexOf('>12 часовые<') !== -1 &&
                   fn.indexOf('>8 часовые<') !== -1,
            'ярлыки групп в таблице');
        // ярлык группы — в ОБЪЕДИНЁННОЙ ячейке на всю ширину
        // таблицы (Task 449; прежде — в колонке «Должность»)
        assertTrue(fn.indexOf('<td colspan="7" class="wst-r-glab">12 часовые</td>') !== -1 &&
                   fn.indexOf('<td colspan="7" class="wst-r-glab">8 часовые</td>') !== -1,
            'строки групп — объединённые ячейки colspan 7');
    });

    test('ИТОГО — две строки по группам, суммы в (шт.)', () => {
        const fn = stripComments(methodText(WS_SRC, '_buildTalonsPrintHtml'));
        assertTrue(fn.indexOf('ИТОГО:') !== -1, 'метка «ИТОГО:» (с двоеточием)');
        assertTrue(fn.indexOf("'<tr><td colspan=\"5\" class=\"wst-t-itog\">ИТОГО: 12 часовые</td>'") !== -1 &&
                   fn.indexOf("'<tr><td colspan=\"5\" class=\"wst-t-itog\">8 часовые</td>'") !== -1,
            'итоги — по ОДНОЙ строке на группу (Task 449)');
        assertTrue(fn.indexOf('(шт.)') !== -1, 'единицы (шт.)');
        assertTrue(fn.indexOf('groupSum') !== -1,
            'суммы считаются ПО ГРУППАМ (не общий итог)');
        assertTrue(fn.indexOf('model.totals') === -1,
            'печатные суммы не зависят от чипов экранной страницы');
    });

    test('_talonsSignBlock: три подписи строго по форме + линия 17 «_»', () => {
        const fn = methodText(WS_SRC, '_talonsSignBlock');
        assertTrue(fn.indexOf('_________________') !== -1,
            'линия подписи — 17 подчёркиваний, как в форме');
        assertTrue(fn.indexOf('(ф.и.о.)') !== -1,
            'подсказка «(ф.и.о.)» под именем');
        const rep = methodText(WS_SRC, '_buildTalonsPrintHtml');
        for (const part of [
                "_talonsSignBlock('Рук. подразделения', 'Игушов Н.В.',",
                "_talonsSignBlock('С табелем сверено:', 'Котельникова И.А.',",
                "'(подпись материально-ответственного лица)'",
                "_talonsSignBlock('Руководитель СОТ и ПБ', 'Фензель В.П.',"]) {
            assertTrue(rep.indexOf(part) !== -1, 'вызов: ' + part.slice(0, 50));
        }
        // блоки разделены пустыми строками (wst-s-gap)
        const gaps = (rep.match(/wst-s-gap/g) || []).length;
        assertEqual(gaps, 2, 'два разделителя между тремя подписями');
    });

    test('экранная страница: правки/чипы/«Дней явки» на месте (12/8 раздельно — Task 451)', () => {
        const fn = methodText(WS_SRC, '_renderTalonsPage');
        assertTrue(fn.indexOf('Дней явки') !== -1,
            'экранная таблица по-прежнему показывает дни явки (колонка-источник)');
        assertTrue(fn.indexOf('wst-count') !== -1,
            'поля ручной правки на месте');
        assertTrue(INDEX_SRC.indexOf('wstTotalT12Chip') !== -1 &&
                   INDEX_SRC.indexOf('wstTotalT8Chip') !== -1,
            'чипы итогов на месте — 12/8 раздельно (Task 451)');
    });

    test('инжект @page и standalone-документ — без изменений', () => {
        const inj = stripComments(methodText(WS_SRC, '_talonsInjectPrintStyle'));
        assertTrue(inj.indexOf('@page { size: A4 portrait; margin: 12mm 10mm; }') !== -1,
            'A4 книжная + поля');
        const doc = stripComments(methodText(WS_SRC, '_buildTalonsFileHtml'));
        assertTrue(doc.indexOf('width: 190mm') !== -1, 'лист 190мм');
        assertTrue(doc.indexOf('Times New Roman') !== -1, 'шрифт формы');
    });
});

// ============================================================
// 2. SRC — CSS строгой формы
// ============================================================
describe('Task 448 — SRC: CSS сетки/шрифты/акценты', () => {

    test('шрифты: компакт ОДНОГО листа А4 (Task 449)', () => {
        const css = TALONS_CSS_VALUE;
        assertTrue(css.indexOf('.wst-rep-org { font-size: 12pt; }') !== -1,
            'предприятие 12pt (было 14pt)');
        assertTrue(css.indexOf('.wst-rep-title { text-align: center; font-size: 13pt; font-weight: 700; margin-top: 2mm; }') !== -1,
            '«ОТЧЕТ» — жирная 13pt, поле 2мм (было 14pt/4.5мм)');
        assertTrue(css.indexOf('padding: 0.6mm 1mm; font-size: 10.5pt; height: 9mm;') !== -1,
            'шапка таблицы 10.5pt/9мм (было 12pt/14мм)');
        assertTrue(css.indexOf('padding: 0.5mm 1mm; font-size: 11pt; height: 2.5em;') !== -1,
            'строки данных 11pt/2.5em — ДВЕ строки текста, центр по вертикали (Task 454; было 6мм)');
        assertTrue(css.indexOf('font-size: 11pt; height: 5.2mm;') !== -1,
            'строки ИТОГО 11pt/5.2мм (было 12pt/6мм)');
        assertTrue(css.indexOf('font-size: 11pt; height: 5.5mm; vertical-align: bottom;') !== -1,
            'строки подписей 11pt/5.5мм (было 12pt/7мм)');
        assertTrue(css.indexOf('td.wst-s-hint { font-size: 7pt; height: 3.5mm;') !== -1,
            'подсказки подписей 7pt/3.5мм (было 8pt/4.5мм — и тонули в td-правиле)');
        assertTrue(css.indexOf('.wst-s-gap { height: 2.2mm; }') !== -1,
            'разделители подписей 2.2мм (было 5.5мм)');
        assertTrue(css.indexOf('margin-top: 3.5mm; }') !== -1,
            'блок подписей в 3.5мм от ИТОГО (было 9мм)');
    });

    test('сетка 7 колонок по ширинам Excel — едина для всех трёх таблиц', () => {
        const css = TALONS_CSS_VALUE;
        const widths = [['wst-c1', '4.2%'], ['wst-c2', '12%'],
                        ['wst-c3', '18.2%'], ['wst-c4', '20%'],
                        ['wst-c5', '11.9%'], ['wst-c6', '11.5%'],
                        ['wst-c7', '22.2%']];
        for (const [cls, w] of widths) {
            assertTrue(css.indexOf('.' + cls + ' { width: ' + w + '; }') !== -1,
                'ширина ' + cls + ' = ' + w);
        }
        const rep = methodText(WS_SRC, '_buildTalonsPrintHtml');
        for (const t of ['wst-rep-table', 'wst-tot-table', 'wst-sign-table']) {
            assertTrue(rep.indexOf("'<table class=\"" + t + "\">' + CG") !== -1,
                t + ' использует общую сетку colgroup');
        }
    });

    test('шапка таблицы НЕ жирная (в форме b=False), ИТОГО — курсив+подчёрк', () => {
        const css = TALONS_CSS_VALUE;
        assertTrue(css.indexOf('th { border: 1px solid #000; font-weight: 400;') !== -1,
            'заголовки колонок — обычное начертание');
        assertTrue(css.indexOf('.wst-tot-table td.wst-t-val { text-align: center; font-style: italic; border-bottom: 1px solid #000; }') !== -1,
            'суммы ИТОГО — курсив с подчёркиванием (специфичность выше td-правила)');
        assertTrue(css.indexOf('border-bottom: 1px solid #000') !== -1,
            'линии под суммами');
    });

    test('многостраничность: повтор шапки, строки не рвутся, ярлык с первой строкой', () => {
        const css = TALONS_CSS_VALUE;
        assertTrue(css.indexOf('table-header-group') !== -1, 'повтор шапки');
        assertTrue(css.indexOf('page-break-inside: avoid') !== -1,
            'строки не рвутся между страницами');
        assertTrue(css.indexOf('.wst-r-group { page-break-after: avoid; }') !== -1,
            'ярлык группы не отрывается от первой строки');
    });

    test('имена подписей не переносятся (как перелив в Excel)', () => {
        const css = TALONS_CSS_VALUE;
        assertTrue(css.indexOf('.wst-s-name { white-space: nowrap; }') !== -1,
            'nowrap для Ф.И.О. подписантов');
    });
});

// ============================================================
// 3. VM — печатная форма (мок-DOM как в Task 447)
// ============================================================
describe('Task 448 — VM: группы, часы, итоги, подписи', () => {

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

    function printHost(dom, win) {
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
            '_EMPLOYEES: ' + JSON.stringify([
                { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
                  'должность': 'Слесарь КИПиА' },
                { 'таб_номер': '024', 'ФИО': 'Гусев Г. Г.', 'тип': 'сменный',
                  'должность': 'Слесарь КИПиА' }]) + ',' +
            '_ENTRIES: ' + JSON.stringify([
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

    test('деление на группы: сменный → «12 часовые», дневной → «8 часовые»', () => {
        const h = printHost(printDom(), { print: function() {} });
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        // Гусев — сменный (Д+Н+Н = 3 явки) — блок «12 часовые»;
        // Иванов — дневной (Д8+Н = 2 явки) — блок «8 часовые»
        const i12 = html.indexOf('>12 часовые<');
        const i8 = html.indexOf('>8 часовые<');
        const iGus = html.indexOf('Гусев Г. Г.');
        const iIvan = html.indexOf('Иванов И. И.');
        assertTrue(i12 !== -1 && i8 !== -1 && i12 < i8,
            'блок «12 часовые» выше блока «8 часовые»');
        assertTrue(iGus > i12 && iGus < i8, 'сменный Гусев — в первом блоке');
        assertTrue(iIvan > i8, 'дневной Иванов — во втором блоке');
        // Гусев — №1 (первый блок), Иванов — №2 (сквозная нумерация)
        assertTrue(html.indexOf('<td class="wst-r-n">1</td>' +
                    '<td class="wst-r-tab">024</td>') !== -1,
            'Гусев — №1 с табельным 024');
        assertTrue(html.indexOf('<td class="wst-r-n">2</td>' +
                    '<td class="wst-r-tab">017</td>') !== -1,
            'Иванов — №2 (нумерация сквозная через группы)');
    });

    test('часы = талоны × 12/8 — формула листа (правка талонов меняет часы)', () => {
        const dom = printDom();
        const h = printHost(dom, { print: function() {} });
        // Гусев (сменный): 3 явки → 3 талона × 12 = 36 часов
        let html = h._buildTalonsPrintHtml(h._talonsRows());
        assertTrue(html.indexOf('>36</td>') !== -1, 'Гусев: 3 × 12 = 36 часов');
        assertTrue(html.indexOf('>16</td>') !== -1, 'Иванов: 2 × 8 = 16 часов');
        // ручная правка 12ч Гусева до 5 талонов → часы 60
        h._TALONS_EDIT['024'] = { t12: 5 };
        html = h._buildTalonsPrintHtml(h._talonsRows());
        assertTrue(html.indexOf('>60</td>') !== -1,
            'после правки: 5 × 12 = 60 часов (правка учитывается)');
    });

    test('ИТОГО по группам: суммы талонов, НЕ дней и не общий итог', () => {
        const dom = printDom();
        const h = printHost(dom, { print: function() {} });
        h._TALONS_EDIT['024'] = { t12: 5 }; // Гусев 5 (12ч), Иванов 2 (8ч)
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        assertTrue(html.indexOf('wst-t-val') !== -1, 'блок ИТОГО есть');
        // 12 часовые: 5 (шт.); 8 часовые: 2 (шт.) — порядок строк
        const i12t = html.indexOf('<td colspan="5" class="wst-t-itog">ИТОГО: 12 часовые</td>');
        const i8t = html.indexOf('<td colspan="5" class="wst-t-itog">8 часовые</td>');
        const v1 = html.indexOf('<td class="wst-t-val">5</td>');
        const v2 = html.indexOf('<td class="wst-t-val">2</td>');
        assertTrue(i12t !== -1 && i8t !== -1 && i12t < i8t,
            'две строки итогов по группам');
        assertTrue(v1 !== -1 && v1 > i12t && v1 < i8t,
            'в строке «12 часовые» — сумма 5');
        assertTrue(v2 !== -1 && v2 > i8t, 'в строке «8 часовые» — сумма 2');
        // единицы (шт.) у обеих сумм
        assertEqual((html.match(/\(шт\.\)/g) || []).length, 2,
            'две пометки (шт.)');
    });

    test('пустая группа отображается (нулевая сумма), порядок стабилен', () => {
        const dom = printDom();
        const h = printHost(dom, { print: function() {} });
        // все — дневные: блок «12 часовые» пуст, сумма 0
        h._EMPLOYEES = h._EMPLOYEES.filter(function(e) {
            return e['тип'] !== 'сменный';
        });
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        assertTrue(html.indexOf('>12 часовые<') !== -1,
            'блок «12 часовые» присутствует даже без сменных');
        assertTrue(html.indexOf('<td class="wst-t-val">0</td>') !== -1,
            'сумма пустой группы — 0');
    });

    test('подписи: точные должности/имена/подсказки формы', () => {
        const h = printHost(printDom(), { print: function() {} });
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        for (const part of ['Рук. подразделения', 'Игушов Н.В.',
                            'С табелем сверено:', 'Котельникова И.А.',
                            '(подпись материально-ответственного лица)',
                            'Руководитель СОТ и ПБ', 'Фензель В.П.',
                            '_________________', '(подпись)', '(ф.и.о.)']) {
            assertTrue(html.indexOf(part) !== -1, 'подпись: ' + part);
        }
        // подсказки — по одной на каждый блок (3 × «(ф.и.о.)»)
        assertEqual((html.match(/\(ф\.и\.о\.\)/g) || []).length, 3,
            'три подсказки (ф.и.о.)');
        assertEqual((html.match(/\(подпись\)/g) || []).length, 2,
            'две подсказки (подпись) + одна развёрнутая');
    });

    test('шапка: предприятие слева, ОТЧЕТ/Л.П.П./цех — по центру (классы)', () => {
        const h = printHost(printDom(), { print: function() {} });
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        assertTrue(html.indexOf('<div class="wst-rep-org">Наименование предприятия ООО ПО "Токем"</div>') !== -1,
            'предприятие — первой строкой слева');
        assertTrue(html.indexOf('<div class="wst-rep-title">ОТЧЕТ</div>') !== -1,
            '«ОТЧЕТ» (без ё, как в форме)');
        assertTrue(html.indexOf('лечебно-профилактическое питание') !== -1,
            'расшифровка Л.П.П.');
        assertTrue(html.indexOf('<div class="wst-rep-dept">Цех № 8 пр-во ИОС</div>') !== -1,
            'цех');
        assertTrue(html.indexOf('за ' + MONTH_NAMES[NOWM - 1] + ' ' + NOWY + ' г.') !== -1,
            'текущий месяц и год в подзаголовке');
    });
});

// ============================================================
// 4. SW — версия кэша
// ============================================================
describe('Task 448 — SW', () => {
    test('SW: кэш поднят до kipia-test-v732 (Task 448)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v732'") !== -1,
            'CACHE_VERSION = kipia-test-v732');
        assertTrue(SW_SRC.indexOf('kipia-test-v733') === -1,
            'kipia-test-v733 не существует');
        assertTrue(SW_SRC.indexOf('Task 448') !== -1,
            'комментарий Task 448 в истории версий');
    });
});
