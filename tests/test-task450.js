// ============================================================
// Task 450 — заявка пользователя: «Группы «12/8 часовые» выравни
// по центру. В должностях убери разряды "Слесарь по КИП и А 5
// разряда" на "Слесарь по КИП и А". В нижней части отчёта,
// выравни по центру черты текст подписи, а под фамилиями, справа
// от подписей, сделай черту, разделяющую фамилии и нижний текст
// "(ф.и.о.)", который тоже выравни по центру добавленной черты».
//
// Реализация (ТОЛЬКО печатная вёрстка, index.html):
//   • ярлыки групп «12 часовые»/«8 часовые» — ПО ЦЕНТРУ
//     объединённых ячеек colspan 7 (Task 449 делал влево с
//     отступом 2мм);
//   • _talonsPosition — РАЗРЯДЫ УБИРАЮТСЯ («Слесарь по КИП и А 5
//     разряда» → «Слесарь по КИП и А», «Электромонтёр 4 разряда»
//     → «Электромонтёр»; арабские «5 разряда»/«5-го разряда» и
//     римские «III разряда», в конце и в середине строки;
//     должности без разрядов — как есть; экранная страница
//     печатает должность КАК ЕСТЬ);
//   • подписи: линия из подчёркиваний — ПО ЦЕНТРУ своей колонки
//     (подсказка «(подпись)» выровнена по центру линии — прежде
//     линия прижималась влево, а подсказка была по центру);
//     над «(ф.и.о.)» — ЧЕРТА на всю ширину колонок 6–7 (класс
//     wst-s-fio, border-top): разделяет фамилию и пояснение,
//     пояснение — по центру черты.
// Модель данных, экранная страница (чипы/правки/«Дней явки»),
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
// Срез модуля WorkSchedule (имена методов неуникальны в монолите)
const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// Значение строковой константы _TALONS_PRINT_CSS (константа
// заканчивается правилом сетки .wst-c7 — как в Tasks 447-449)
const TALONS_CSS_VALUE = new Function('return ({' + (function() {
    const start = WS_SRC.indexOf('_TALONS_PRINT_CSS:');
    const marker = "'#wsPrintSheet.wst-sheet .wst-c7 { width: 22.2%; }',";
    const end = WS_SRC.indexOf(marker, start);
    if (start === -1 || end === -1) throw new Error('_TALONS_PRINT_CSS не найден');
    return WS_SRC.slice(start, end + marker.length);
})() + '})._TALONS_PRINT_CSS;')();

// ============================================================
// 1. SRC — группы по центру, подписи, разряды
// ============================================================
describe('Task 450 — SRC: группы по центру', () => {

    test('ярлык «12/8 часовые» — ПО ЦЕНТРУ объединённой ячейки', () => {
        const css = TALONS_CSS_VALUE;
        assertTrue(css.indexOf('.wst-rep-table td.wst-r-glab { text-align: center; }') !== -1,
            'td.wst-r-glab — text-align: center');
        assertTrue(css.indexOf('.wst-rep-table td.wst-r-glab { text-align: left') === -1,
            'левого правила (Task 449) больше нет');
        assertTrue(css.indexOf('td.wst-r-glab { text-align: center; padding-left') === -1,
            'отступа 2мм в правиле нет');
        // объединённая ячейка на всю ширину — как в Task 449 (регресс)
        const fn = stripComments(methodText(WS_SRC, '_buildTalonsPrintHtml'));
        assertTrue(fn.indexOf('<td colspan="7" class="wst-r-glab">12 часовые</td>') !== -1 &&
                   fn.indexOf('<td colspan="7" class="wst-r-glab">8 часовые</td>') !== -1,
            'группы — colspan 7 на всю горизонталь (не тронуто)');
    });
});

describe('Task 450 — SRC: подписи (линия по центру + черта над (ф.и.о.))', () => {

    test('линия подписи — ПО ЦЕНТРУ колонки (подсказка по центру линии)', () => {
        const css = TALONS_CSS_VALUE;
        assertTrue(css.indexOf('.wst-sign-table td.wst-s-line { text-align: center; }') !== -1,
            'td.wst-s-line — text-align: center (прежде — влево по умолчанию)');
        // подсказка «(подпись)» — по центру ячейки той же колонки
        assertTrue(css.indexOf('td.wst-s-hint { font-size: 7pt; height: 3.5mm; vertical-align: top; text-align: center;') !== -1,
            'подсказка 7pt — по центру (Task 449, не тронуто)');
    });

    test('черта под фамилией — ПО ДЛИНЕ самой длинной фамилии (Task 451)', () => {
        const css = TALONS_CSS_VALUE;
        assertTrue(css.indexOf('.wst-s-nbox { position: relative; display: inline-block; border-bottom: 1px solid #000;') !== -1,
            'черта — border-bottom бокса .wst-s-nbox (НЕ на всю ширину колонок 6–7)');
        assertTrue(css.indexOf('.wst-s-gh { visibility: hidden; white-space: nowrap; }') !== -1,
            'призрак .wst-s-gh — невидимый текст longest задаёт ширину бокса');
        assertTrue(css.indexOf('.wst-s-nm { position: absolute; left: 0; right: 0; top: 0; text-align: center;') !== -1,
            'фамилия .wst-s-nm — абсолютно поверх призрака, по центру черты');
        assertTrue(css.indexOf('td.wst-s-fio') === -1,
            'прежней черты border-top на всю ширину (Task 450) больше нет');
        // специфичность: базовое td-правило подписей на месте
        assertTrue(css.indexOf('.wst-sign-table td { border: none;') !== -1,
            'базовое td-правило подписей на месте');
    });

    test('_talonsSignBlock: призрак longest + фамилия .wst-s-nm; линия 17 «_» на месте', () => {
        const fn = stripComments(methodText(WS_SRC, '_talonsSignBlock'));
        assertTrue(fn.indexOf('<span class="wst-s-gh">') !== -1 &&
                   fn.indexOf('this._esc(longest || name)') !== -1,
            'призрак — текст самой длинной фамилии (fallback — сама фамилия)');
        assertTrue(fn.indexOf('<span class="wst-s-nm">') !== -1,
            'фамилия — .wst-s-nm поверх призрака');
        assertTrue(fn.indexOf('_________________') !== -1,
            'линия подписи — 17 подчёркиваний (как в форме, не тронуто)');
        assertTrue(fn.indexOf('<td class="wst-s-line">_________________</td>') !== -1,
            'линия — в колонке 4 (по центру — правилом CSS)');
        assertTrue((fn.match(/wst-s-fio/g) || []).length === 0,
            'класс wst-s-fio полностью ушёл (Task 451)');
    });

    test('три подписи + разделители — как прежде (регресс Task 448)', () => {
        const rep = stripComments(methodText(WS_SRC, '_buildTalonsPrintHtml'));
        for (const part of ["_talonsSignBlock('Рук. подразделения', 'Игушов Н.В.',",
                            "_talonsSignBlock('С табелем сверено:', 'Котельникова И.А.',",
                            "_talonsSignBlock('Руководитель СОТ и ПБ', 'Фензель В.П.',"]) {
            assertTrue(rep.indexOf(part) !== -1, 'вызов: ' + part.slice(0, 45));
        }
        assertEqual((rep.match(/wst-s-gap/g) || []).length, 2,
            'два разделителя между тремя подписями');
    });
});

describe('Task 450 — SRC: _talonsPosition убирает разряды', () => {

    test('разряд-регексы: арабские (в т.ч. «5-го») и римские', () => {
        const fn = methodText(WS_SRC, '_talonsPosition');
        assertTrue(fn.indexOf('разряд[ауе]?(?![а-яё])/gi') !== -1,
            'суффиксы разряда (а/у/е) + lookahead (НЕ \\b — он не работает после кириллицы: \\w в JS = ASCII)');
        assertTrue(fn.indexOf('(?:го|й|е|ый|ой|ий)?') !== -1,
            'склонения «5-го/5-й/5-ый» разряда');
        assertTrue(fn.indexOf('[ivx]+\\s*разряд') !== -1,
            'римские «III разряда»');
        assertTrue(fn.indexOf('\\s*\\d+\\s*[-–—]?') !== -1,
            'дефис между числом и склонением');
        assertTrue(fn.indexOf('разряд[ауе]?\\b') === -1,
            'сломанного \\b после кириллицы больше нет (\\w = только ASCII)');
    });

    test('базовая нормализация КИПиА (Task 449) не сломана', () => {
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

    test('экранная страница НЕ тронута: должность как есть', () => {
        const rp = stripComments(methodText(WS_SRC, '_renderTalonsPage'));
        assertTrue(rp.indexOf("row.emp['должность']") !== -1,
            'экранная таблица печатает должность как есть (с разрядами)');
        assertTrue(rp.indexOf('_talonsPosition') === -1,
            'нормализатор на экране не используется');
    });
});

// ============================================================
// 2. VM — печатная форма (мок-DOM как в Tasks 447-449)
// ============================================================
describe('Task 450 — VM: разряды, группы, подписи', () => {

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
                  'должность': 'Слесарь КИПиА 5 разряда' },
                { 'таб_номер': '024', 'ФИО': 'Гусев Г. Г.', 'тип': 'сменный',
                  'должность': 'Мастер по КИП и А 6 разряда' }]) + ',' +
            '_ENTRIES: ' + JSON.stringify(entries || [
                { 'дата': NOWY + '-' + MM + '-01', 'таб_номер': '017', 'статус': 'Д8' },
                { 'дата': NOWY + '-' + MM + '-02', 'таб_номер': '017', 'статус': 'Н' },
                { 'дата': NOWY + '-' + MM + '-03', 'таб_номер': '024', 'статус': 'Д' },
                { 'дата': NOWY + '-' + MM + '-04', 'таб_номер': '024', 'статус': 'Н' },
                { 'дата': NOWY + '-' + MM + '-05', 'таб_номер': '024', 'статус': 'Н' }]) + ',' +
            '_PENDING: {}, _TALONS_EDIT: {},' +
            '_year: ' + NOWY + ', _month: ' + NOWM + ',' +
            '_viewLevel: \'edit\', _canEdit: true,' +
            '_STATUS_CODES: [],' +
            '});')(undefined, win, dom.document);
    }

    test('_talonsPosition: разряды убираются (все варианты)', () => {
        const h = printHost(printDom(), { print: function() {} });
        const cases = [
            ['Слесарь по КИП и А 5 разряда', 'Слесарь по КИП и А'],
            ['Слесарь по КИП и А 5 разряд', 'Слесарь по КИП и А'],
            ['Слесарь по КИП и А 5-го разряда', 'Слесарь по КИП и А'],
            ['Слесарь КИПиА 5 разряда', 'Слесарь по КИП и А'],
            ['Слесарь КИП и А 5-й разряд', 'Слесарь по КИП и А'],
            ['Мастер по КИП и А 6 разряда', 'Мастер по КИП и А'],
            ['Мастер КИПиА 7 разряда', 'Мастер по КИП и А'],
            ['Электромонтёр 4 разряда', 'Электромонтёр'],
            ['Электрогазосварщик 3 разряда', 'Электрогазосварщик'],
            ['Слесарь III разряда', 'Слесарь'],
            ['Слесарь 5 разряда КИПиА', 'Слесарь по КИП и А'],
            ['Слесарь по КИП и А, 5 разряда', 'Слесарь по КИП и А'],
            // без разрядов — прежнее поведение (Task 449)
            ['Слесарь по КИП и А', 'Слесарь по КИП и А'],
            ['Слесарь КИПиА', 'Слесарь по КИП и А'],
            ['Электрик', 'Электрик'],
            ['', '—'],
            [null, '—']
        ];
        for (const [raw, want] of cases) {
            assertEqual(h._talonsPosition(raw), want,
                '«' + raw + '» → «' + want + '»');
        }
    });

    test('печать: должности БЕЗ разрядов, канонический формат', () => {
        const h = printHost(printDom(), { print: function() {} }, [
            { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
              'должность': 'Слесарь по КИП и А 5 разряда' },
            { 'таб_номер': '024', 'ФИО': 'Гусев Г. Г.', 'тип': 'сменный',
              'должность': 'Мастер КИПиА 6 разряда' },
            { 'таб_номер': '031', 'ФИО': 'Сидоров С. С.', 'тип': 'сменный',
              'должность': 'Электромонтёр 4 разряда' }
        ]);
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        assertTrue(html.indexOf('Слесарь по КИП и А</td>') !== -1,
            'Иванов: «Слесарь по КИП и А» без разряда');
        assertTrue(html.indexOf('Мастер по КИП и А</td>') !== -1,
            'Гусев: КИПиА + разряд → канонический формат');
        assertTrue(html.indexOf('Электромонтёр</td>') !== -1,
            'Сидоров: должность без КИП — разряд снят');
        assertTrue(html.indexOf('разряда') === -1 && html.indexOf('разряд ') === -1,
            'в печатной форме не осталось разрядов');
        assertTrue(html.indexOf('5 разряда') === -1 &&
                   html.indexOf('6 разряда') === -1 &&
                   html.indexOf('4 разряда') === -1,
            'ни одного численного разряда в форме');
    });

    test('печать: группы colspan 7 + ИТОГО + подписи (регресс 448/449 + призрак 451)', () => {
        const h = printHost(printDom(), { print: function() {} });
        const html = h._buildTalonsPrintHtml(h._talonsRows());
        assertTrue(html.indexOf('<td colspan="7" class="wst-r-glab">12 часовые</td>') !== -1 &&
                   html.indexOf('<td colspan="7" class="wst-r-glab">8 часовые</td>') !== -1,
            'группы — объединённые ячейки (вёрстка не тронута)');
        assertTrue(html.indexOf('<td colspan="5" class="wst-t-itog">ИТОГО: 12 часовые</td>') !== -1 &&
                   html.indexOf('<td colspan="5" class="wst-t-itog">8 часовые</td>') !== -1,
            'ИТОГО — по одной строке на группу');
        // подписи: линия и черта-бокс — по три штуки
        assertEqual((html.match(/wst-s-nbox/g) || []).length, 3,
            'черта-бокс (по длине longest) — во всех трёх подписях (Task 451)');
        assertEqual((html.match(/wst-s-line/g) || []).length, 3,
            'линия подписи — во всех трёх блоках');
        assertEqual((html.match(/_________________/g) || []).length, 3,
            '17 подчёркиваний — три линии');
        assertEqual((html.match(/\(ф\.и\.о\.\)/g) || []).length, 3,
            'три пояснения «(ф.и.о.)»');
        assertTrue(html.indexOf('wst-s-fio') === -1,
            'прежний класс черты на всю ширину не используется');
        assertEqual((html.match(/<span class="wst-s-gh">Котельникова И\.А\.<\/span>/g) || []).length, 3,
            'призрак во всех трёх блоках — САМАЯ ДЛИННАЯ фамилия «Котельникова И.А.»');
    });
});

// ============================================================
// 3. SW — версия кэша
// ============================================================
describe('Task 450 — SW', () => {
    test('SW: кэш поднят до kipia-test-v739 (Task 450)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v739'") !== -1,
            'CACHE_VERSION = kipia-test-v739');
        assertTrue(SW_SRC.indexOf('kipia-test-v740') === -1,
            'kipia-test-v740 не существует');
        assertTrue(SW_SRC.indexOf('Task 450') !== -1,
            'комментарий Task 450 в истории версий');
    });
});
