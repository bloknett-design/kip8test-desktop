// ============================================================
// Task 409 — заявка: «В разделе инструктажей и проверки знаний
// должны содержаться: Повторный инструктаж по рабочим инструкциям
// ОТ - 6 мес.; Повторный инструктаж по инструкции № 9-ОГЭ - 3 мес.;
// Периодическая проверка знаний на допуск к самостоятельной работе
// - 1 год; Периодическая проверка знаний на допуск к проведению
// работ в электроустановках до 1000 В - 1 год; Периодическая
// проверка знаний по охране труда при выполнении работ на высоте
// (по инструкции № 53-ОТ). Больше никаких видов мероприятий в
// блоке данного раздела и таблицы Список_И_и_ПЗ быть не должно».
//
// 1) СЕРВЕР: instrListInit — ЗАМЕЩАЕТ строки листа эталоном заявки
//    (ровно 5 пунктов; п.5: основание «инструкция № 53-ОТ»,
//    периодичность 12 мес).
// 2) КЛИЕНТ: _fmtPeriodRu — 12 мес → «раз в год», 24 → «раз в 2
//    года», 6 → «раз в 6 месяцев»; шапка группы блока и подсказка
//    формы переведены на новый формат.
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');

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

// Эталон заявки 409 — 5 пунктов (клиентский вид)
const FIVE = [
    { название: 'Повторный инструктаж по рабочим инструкциям ОТ',
      вид: 'инструктаж', периодичность: 6, основание: '' },
    { название: 'Повторный инструктаж по инструкции № 9-ОГЭ',
      вид: 'инструктаж', периодичность: 3, основание: '' },
    { название: 'Периодическая проверка знаний на допуск к самостоятельной работе',
      вид: 'проверка_знаний', периодичность: 12, основание: '' },
    { название: 'Периодическая проверка знаний на допуск к проведению работ в электроустановках до 1000 В',
      вид: 'проверка_знаний', периодичность: 12, основание: '' },
    { название: 'Периодическая проверка знаний по охране труда при выполнении работ на высоте',
      вид: 'проверка_знаний', периодичность: 12, основание: 'инструкция № 53-ОТ' }
];

// ============================================================
// 1. SRC — сервер: эталон 5 пунктов
// ============================================================
describe('Task 409 — SRC: сервер (эталон заявки)', () => {

    test('эталон: ровно 5 пунктов заявки, образцы Task 407 удалены', () => {
        const fn = stripComments(methodText(WS_SRC, 'instrListInit'));
        for (const n of FIVE.map(x => x.название)) {
            assertTrue(fn.indexOf("'" + n + "'") !== -1,
                'пункт эталона: ' + n);
        }
        // вид + периодичность каждого пункта
        assertTrue(fn.indexOf("'инструктаж', 6,") !== -1 &&
                   fn.indexOf("'инструктаж', 3,") !== -1,
            'инструктажи: 6 мес и 3 мес');
        assertEqual(3, (fn.match(/'проверка_знаний', 12,/g) || []).length,
            'три проверки знаний с периодичностью 12 мес');
        assertTrue(fn.indexOf("'инструкция № 53-ОТ'") !== -1,
            'основание пункта «работы на высоте»');
        assertTrue(fn.indexOf("'Охрана труда'") === -1 &&
                   fn.indexOf("'Пожарная безопасность'") === -1 &&
                   fn.indexOf("'Электробезопасность'") === -1 &&
                   fn.indexOf("'Проверка знаний по специальности'") === -1,
            'образцы Task 407 из эталона удалены');
    });

    test('замещение: reset + очистка строк перед записью', () => {
        const fn = stripComments(methodText(WS_SRC, 'instrListInit'));
        assertTrue(fn.indexOf('reset: !created') !== -1,
            'флаг reset в ответе');
        assertTrue(fn.indexOf('clearContent') !== -1,
            'очистка прежних строк перед записью эталона');
        assertTrue(fn.indexOf('rows: items.length') !== -1,
            'rows = число пунктов эталона');
    });
});

// ============================================================
// 2. SRC — клиент: _fmtPeriodRu + места вывода
// ============================================================
describe('Task 409 — SRC: клиент (формат периодичности)', () => {

    test('_fmtPeriodRu существует (рядом с _plural)', () => {
        assertTrue(INDEX_SRC.indexOf('_fmtPeriodRu: function(n)') !== -1,
            'метод объявлен');
    });

    test('шапка группы: вывод через _fmtPeriodRu', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderInstrSection'));
        assertTrue(fn.indexOf('this._fmtPeriodRu(gItem.периодичность)') !== -1,
            'шапка группы — _fmtPeriodRu');
        assertTrue(fn.indexOf("['месяц', 'месяца', 'месяцев']") === -1,
            'старая подпись «раз в N месяцев» из шапки убрана');
    });

    test('подсказка формы: вывод через _fmtPeriodRu', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_updateTrItemHint'));
        assertTrue(fn.indexOf('txt = this._fmtPeriodRu(per);') !== -1,
            'подсказка — _fmtPeriodRu');
    });

    test('SW поднят (SW_VERSION = kipia-test-v734)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v734') !== -1,
            'CACHE_VERSION в sw.js — kipia-test-v734');
    });
});

// ============================================================
// 3. VM — _fmtPeriodRu: годы и месяцы
// ============================================================
describe('Task 409 — VM: _fmtPeriodRu', () => {

    const host = new Function('return ({' +
        methodText(INDEX_SRC, '_fmtPeriodRu') + '});')();

    test('месяцы', () => {
        assertEqual('раз в 6 месяцев', host._fmtPeriodRu(6));
        assertEqual('раз в 3 месяца', host._fmtPeriodRu(3));
        assertEqual('раз в месяц', host._fmtPeriodRu(1));
        assertEqual('раз в 18 месяцев', host._fmtPeriodRu(18));
    });

    test('годы', () => {
        assertEqual('раз в год', host._fmtPeriodRu(12));
        assertEqual('раз в 2 года', host._fmtPeriodRu(24));
        assertEqual('раз в 3 года', host._fmtPeriodRu(36));
        assertEqual('раз в 5 лет', host._fmtPeriodRu(60));
    });

    test('разовый/пустой и строка из листа', () => {
        assertEqual('', host._fmtPeriodRu(0));
        assertEqual('', host._fmtPeriodRu(''));
        assertEqual('раз в год', host._fmtPeriodRu('12'));
    });
});

// ============================================================
// 4. VM — блок: шапки групп с эталоном заявки
// ============================================================
describe('Task 409 — VM: блок по эталону 5 пунктов', () => {

    const TAB = '017';
    // дата записи 10.04.2026 + 6 мес = 10.10.2026 — «след. срок»
    // всегда в будущем относительно даты прогона (2026-09-25+)
    const INS = [
        { id: 21, 'таб_номер': TAB, 'тип': 'инструктаж',
          'тема': 'Повторный инструктаж по рабочим инструкциям ОТ',
          'дата_начала': '2026-04-10', 'дата_окончания': '2026-04-10' }
    ];

    function sectionHost() {
        return new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_renderInstrSection') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKind') + ',\n' +
            methodText(INDEX_SRC, '_addMonthsIso') + ',\n' +
            methodText(INDEX_SRC, '_isoDate') + ',\n' +
            methodText(INDEX_SRC, '_fmtPeriodRu') + ',\n' +
            '_fmtDateRu: function(d) { var p = String(d).split("-");' +
            '  return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(d); },' +
            '_esc: function(s) { return String(s); },' +
            '_plural: function(n, f) { return f[2]; },' +
            '_trainingCodeOf: function(t) { return t === "проверка_знаний" ? "ПЗ" : "И"; },' +
            '_statusMeta: function(c) { return { code: c, color: "#123456", name: c }; },' +
            '_INSTR_LIST: ' + JSON.stringify(FIVE) + ',' +
            '_INSTR_ALL: ' + JSON.stringify(INS) +
            '});')(mockDoc({}));
    }

    test('5 групп: 2 И + 3 ПЗ, порядок шаблона', () => {
        const host = sectionHost();
        const html = host._renderInstrSection(INS, TAB, true, true, host._INSTR_LIST);
        assertEqual(5, (html.match(/ws-il-head/g) || []).length,
            'ровно 5 шапок групп');
        const pos = FIVE.map(x => html.indexOf('ws-il-name">' + x.название + '<'));
        assertTrue(pos.every(i => i !== -1), 'все 5 названий');
        assertTrue(pos.every((v, i) => i === 0 || v > pos[i - 1]),
            'порядок групп = порядок эталона');
        // код И ×3: две шапки групп + строка записи (тоже с кодом)
        assertEqual(3, (html.match(/>И</g) || []).length, 'код И: 2 шапки + запись');
        assertEqual(3, (html.match(/>ПЗ</g) || []).length, 'код ПЗ ×3');
    });

    test('подписи периодичности: «раз в 6 месяцев/3 месяца/год»', () => {
        const host = sectionHost();
        const html = host._renderInstrSection(INS, TAB, true, true, host._INSTR_LIST);
        assertEqual(1, (html.match(/раз в 6 месяцев/g) || []).length,
            'рабочие инструкции ОТ — раз в 6 месяцев');
        assertEqual(1, (html.match(/раз в 3 месяца/g) || []).length,
            '№ 9-ОГЭ — раз в 3 месяца');
        assertEqual(3, (html.match(/раз в год(?![а-я])/g) || []).length,
            'проверки знаний — раз в год ×3');
        assertTrue(html.indexOf('раз в 12 месяцев') === -1,
            'старого формата нет');
    });

    test('сроки: след. срок = запись + периодичность', () => {
        const host = sectionHost();
        const html = host._renderInstrSection(INS, TAB, true, true, host._INSTR_LIST);
        const iHead = html.indexOf('ws-il-name">Повторный инструктаж по рабочим инструкциям ОТ<');
        assertTrue(iHead !== -1, 'группа первого пункта');
        const end = html.indexOf('ws-il-head', iHead + 10);
        const seg = html.slice(iHead, end === -1 ? html.length : end);
        // Адаптация даты (Task 497, 11.10.2026): срок 10.10.2026 ИСТЁК —
        // рендер показывает «⚠ просрочено с 10.10.2026» (dueIso < today),
        // до истечения показывал «след. срок: 10.10.2026 ✓». Обе формы —
        // один и тот же вычисленный срок: запись 10.04.2026 + 6 мес.
        assertTrue(seg.indexOf('10.10.2026') !== -1 &&
                   (seg.indexOf('след. срок: 10.10.2026') !== -1 ||
                    seg.indexOf('просрочено с 10.10.2026') !== -1),
            'запись 10.04.2026 + 6 мес = 10.10.2026 (будущее «след. срок», прошедшее «просрочено»)');
    });
});

// ============================================================
// 5. VM — форма: подсказка пункта с эталоном
// ============================================================
describe('Task 409 — VM: подсказка формы', () => {

    function formHost(tip) {
        const els = {
            wsTrType: { value: tip },
            wsTrTitleSel: { hidden: false, innerHTML: 'stale', value: '' },
            wsTrTitle: { hidden: false, value: '' },
            wsTrTitleList: { innerHTML: 'stale' },
            wsTrItemHint: { hidden: true, textContent: 'старая подсказка' }
        };
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_syncTrTitleField') + ',\n' +
            methodText(INDEX_SRC, '_updateTrItemHint') + ',\n' +
            methodText(INDEX_SRC, '_fillTrTitleOptions') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKind') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_fmtPeriodRu') + ',\n' +
            '_esc: function(s) { return String(s); },' +
            '_plural: function(n, f) { return f[2]; },' +
            '_trInstrMode: true,' +
            '_INSTR_LIST: ' + JSON.stringify(FIVE) +
            '});')(mockDoc(els));
        return { host: host, els: els };
    }

    test('select предлагает ВСЕ 5 пунктов эталона с группами', () => {
        const c = formHost(null);
        c.host._syncTrTitleField();
        const h = c.els.wsTrTitleSel.innerHTML;
        assertEqual(5, (h.match(/<option value="/g) || []).length - 1,
            '5 пунктов эталона (+ пустой)');
        assertTrue(h.indexOf('Повторный инструктаж по рабочим инструкциям ОТ') !== -1 &&
                   h.indexOf('Повторный инструктаж по инструкции № 9-ОГЭ') !== -1 &&
                   h.indexOf('Периодическая проверка знаний на допуск к самостоятельной работе') !== -1,
            'пункты заявки 409');
        assertTrue(h.indexOf('<optgroup label="Инструктажи">') !== -1 &&
                   h.indexOf('<optgroup label="Проверка знаний">') !== -1,
            'группы по виду (Task 410)');
    });

    test('группа «Проверка знаний» — 3 пункта эталона', () => {
        const c = formHost(null);
        c.host._syncTrTitleField();
        const h = c.els.wsTrTitleSel.innerHTML;
        const gp = h.indexOf('<optgroup label="Проверка знаний">');
        assertTrue(gp !== -1, 'группа ПЗ есть');
        assertEqual(3, (h.slice(gp).match(/<option value="/g) || []).length,
            '3 ПЗ-пункта в своей группе');
        assertTrue(h.slice(gp).indexOf('при выполнении работ на высоте') !== -1,
            'высота предложена');
    });

    test('подсказка: «раз в год · Основание: инструкция № 53-ОТ»', () => {
        const c = formHost('проверка_знаний');
        c.els.wsTrTitleSel.value =
            'Периодическая проверка знаний по охране труда при выполнении работ на высоте';
        c.host._updateTrItemHint();
        assertEqual('раз в год · Основание: инструкция № 53-ОТ',
            c.els.wsTrItemHint.textContent, 'текст подсказки');
        assertTrue(c.els.wsTrItemHint.hidden === false, 'подсказка видна');
    });

    test('подсказка без основания — только периодичность', () => {
        const c = formHost('проверка_знаний');
        c.els.wsTrTitleSel.value =
            'Периодическая проверка знаний на допуск к самостоятельной работе';
        c.host._updateTrItemHint();
        assertEqual('раз в год', c.els.wsTrItemHint.textContent,
            'без основания — только «раз в год»');
    });
});

// ============================================================
// 6. GAS-VM — instrListInit: создание + замещение
// ============================================================
describe('Task 409 — GAS-VM: instrListInit (моки листов)', () => {

    class MockSheet {
        constructor(rows) { this.rows = rows || []; }
        getLastRow() { return this.rows.length; }
        getRange(row, col, numRows, numCols) {
            numRows = numRows || 1; numCols = numCols || 1;
            const self = this;
            return {
                setValues(vals) {
                    for (let i = 0; i < vals.length; i++) {
                        const r = row + i;
                        while (self.rows.length < r) self.rows.push([]);
                        for (let c = 0; c < vals[i].length; c++) {
                            self.rows[r - 1][col - 1 + c] = vals[i][c];
                        }
                    }
                },
                clearContent() {
                    for (let r = row; r < row + numRows; r++) {
                        for (let c = col; c < col + numCols; c++) {
                            if (self.rows[r - 1]) self.rows[r - 1][c - 1] = '';
                        }
                    }
                },
                setFontWeight() { return this; },
                setBackground() { return this; },
                setFontColor() { return this; }
            };
        }
        setFrozenRows() {}
    }

    const MOCK_UTILS = {
        findSessionByToken: () => ({ user_id: 1 }),
        findUserById: () => ({ role: 'Админ', email: 'test@example.com' }),
        audit: () => {}
    };

    function loadWS(sheets) {
        const ss = {
            getSheetByName: (n) => sheets[n] || null,
            insertSheet: (name) => {
                const s = new MockSheet([]);
                sheets[name] = s;
                return s;
            }
        };
        const SpreadsheetApp = { openById: () => ss };
        const factory = new Function('SpreadsheetApp', 'Utils', 'Logger',
            WS_SRC + '\nreturn WorkSchedule;');
        return factory(SpreadsheetApp, MOCK_UTILS, { log: () => {} });
    }

    test('листа нет — создаётся с заголовком + 5 пунктами', () => {
        const sheets = {};
        const WS = loadWS(sheets);
        const r = WS.instrListInit();
        assertTrue(r.ok, 'ok');
        assertTrue(r.created === true && r.reset === false, 'created, не reset');
        assertEqual(5, r.rows, 'rows = 5');
        const rows = sheets['Список_И_и_ПЗ'].rows;
        assertEqual(6, rows.length, 'заголовок + 5 строк');
        assertEqual('название', rows[0][0], 'заголовок A1');
        assertEqual('Повторный инструктаж по рабочим инструкциям ОТ', rows[1][0]);
        assertEqual('инструктаж', rows[1][1]);
        assertEqual(6, rows[1][2]);
        assertEqual('инструкция № 53-ОТ', rows[5][3],
            'основание пункта «работы на высоте»');
    });

    test('лист есть с образцами — строки замещаются эталоном', () => {
        const sheets = { 'Список_И_и_ПЗ': new MockSheet([
            ['название', 'вид', 'периодичность', 'основание'],
            ['Охрана труда', 'инструктаж', 6, 'не реже 1 раза в 6 месяцев'],
            ['Пожарная безопасность', 'инструктаж', 6, 'не реже 1 раза в 6 месяцев'],
            ['Электробезопасность', 'проверка_знаний', 12, 'ежегодно'],
            ['Проверка знаний по специальности', 'проверка_знаний', 12, 'ежегодно'],
            ['Вредные вещества', 'инструктаж', 12, 'дописал пользователь']
        ]) };
        const WS = loadWS(sheets);
        const r = WS.instrListInit();
        assertTrue(r.ok, 'ok');
        assertTrue(r.created === false && r.reset === true, 'reset, не created');
        assertEqual(5, r.rows, 'rows = 5');
        const rows = sheets['Список_И_и_ПЗ'].rows;
        assertEqual('Повторный инструктаж по рабочим инструкциям ОТ', rows[1][0],
            'первая строка — эталон');
        for (const gone of ['Охрана труда', 'Пожарная безопасность',
                            'Электробезопасность', 'Проверка знаний по специальности',
                            'Вредные вещества']) {
            assertTrue(rows.every(rr => rr[0] !== gone),
                'образец удалён: ' + gone);
        }
        assertEqual('Периодическая проверка знаний по охране труда при выполнении работ на высоте',
            rows[5][0], 'пятая строка — высота');
        assertEqual(12, rows[5][2], 'периодичность 12');
        assertEqual('инструкция № 53-ОТ', rows[5][3], 'основание');
    });

    test('повторный запуск — результат идемпотентен', () => {
        const sheets = {};
        const WS = loadWS(sheets);
        WS.instrListInit();
        const r2 = WS.instrListInit();
        assertTrue(r2.reset === true, 'второй запуск — reset');
        assertEqual(6, sheets['Список_И_и_ПЗ'].rows.length,
            'строки не дублируются');
        assertEqual('Повторный инструктаж по инструкции № 9-ОГЭ',
            sheets['Список_И_и_ПЗ'].rows[2][0], 'второй пункт на месте');
    });
});
