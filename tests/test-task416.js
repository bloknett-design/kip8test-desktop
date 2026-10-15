// ============================================================
// Task 416 — заявка: «Я добавил в таблицу Список_И_и_ПЗ новый
// столбец E "сокращение", в нём содержаться сокращённые названия,
// которые нужно применять на странице Табель учёта рабочего
// времени, в окне мероприятий и в мини окнах шахматки и фамилий
// работников».
//
// Сервер: _readInstrListSheet читает столбец E «сокращение» по
// заголовку; instrListInit пишет заголовок E, но НЕ затирает
// данные столбца E (dataCols = 4).
// Клиент: _instrShortOf(тема) — сокращение пункта по ключу
// _normInstrKey (нет соответствия/пустое — полное название);
// применяется в: тултип бейджа (_renderCell), окно «Мероприятия
// в этот день» (_renderEventsPopup), окно «Мероприятия»
// (_renderMonthEventsPanel), печать табеля (_buildPrintHtml),
// строки карточки (b3/b5 _renderWorkerCard) и заголовки групп
// (_renderInstrSection). Форма «+ Инструктаж…» — select по
// ПОЛНЫМ названиям (не тронута).
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

// ============================================================
// 1. SRC — клиент: хелпер и точки применения
// ============================================================
describe('Task 416 — SRC: клиент', () => {

    test('_instrShortOf существует + док-маркер Task 416', () => {
        const fn = methodText(INDEX_SRC, '_instrShortOf');
        assertTrue(fn.indexOf('сокращение') !== -1, 'читает поле «сокращение»');
        assertTrue(fn.indexOf('this._normInstrKey(') !== -1,
            'сопоставление по ключу нормализации (как группировка 407)');
        assertTrue(fn.indexOf('return sh || t;') !== -1,
            'пустое сокращение → полное название');
        assertTrue(INDEX_SRC.indexOf('Task 416 (заявка: «в таблице Список_И_и_ПЗ новый столбец E') !== -1,
            'док-блок помечен Task 416');
    });

    test('тултип бейджа шахматки — короткое название', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderCell'));
        assertTrue(fn.indexOf('this._instrShortOf(String(evTr.тема).trim())') !== -1,
            'evTip строится через _instrShortOf');
    });

    test('окно «Мероприятия в этот день» — короткое название', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderEventsPopup'));
        assertTrue(fn.indexOf('this._instrShortOf(deT.тема) || deMeta.name') !== -1,
            'строка окна дня — сокращение, нет — полное');
    });

    test('окно «Мероприятия» (месяц) — короткое название', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderMonthEventsPanel'));
        assertTrue(fn.indexOf("this._instrShortOf(tr['тема']) || meta.name") !== -1,
            'строка окна месяца — сокращение, нет — полное');
    });

    test('печать табеля — короткое название', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_buildPrintHtml'));
        assertTrue(fn.indexOf("this._instrShortOf(ev['тема']) || evMeta.name") !== -1,
            'список мероприятий печати — сокращение, нет — полное');
    });

    test('карточка: строки мероприятий и инструктажей — ПОЛНЫЕ названия (Task 417)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertEqual(0, (fn.match(/this\._instrShortOf\(/g) || []).length,
            'Task 417: b3/b5 не подставляют сокращения — только полные');
    });

    test('групповой вид: заголовок группы — сокращение + title с полным', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderInstrSection'));
        assertTrue(fn.indexOf('var gName = this._instrShortOf(String(gItem.название' +
                              " || ''));") !== -1,
            'заголовок группы — через _instrShortOf');
        assertTrue(fn.indexOf("gName !== gFull && gFull") !== -1 &&
                   fn.indexOf("' title=\"' + this._esc(gFull) + '\"") !== -1,
            'полное название остаётся в title-тултипе');
    });

    test('форма «+ Инструктаж…» НЕ тронута — select по полным названиям', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'openTrainingForm'));
        assertTrue(fn.indexOf('_instrShortOf') === -1,
            'форма не подставляет сокращения (выбор по полным названиям)');
    });
});

// ============================================================
// 2. VM — _instrShortOf + окно «Мероприятия в этот день»
// ============================================================
describe('Task 416 — VM: хелпер и окно дня', () => {

    const LIST = [
        { название: 'Повторный инструктаж по рабочим инструкциям ОТ',
          вид: 'инструктаж', периодичность: 6, основание: '',
          сокращение: 'Инстр. ОТ' },
        { название: 'Периодическая проверка знаний на допуск к самостоятельной работе',
          вид: 'проверка_знаний', периодичность: 12, основание: '',
          сокращение: '' },
        { название: 'Целевой инструктаж', вид: 'инструктаж',
          периодичность: 0, основание: '', сокращение: 'Целевой' }
    ];

    function shortHost() {
        return new Function('return ({' +
            methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            '_INSTR_LIST: ' + JSON.stringify(LIST) +
            '});')();
    }

    test('сокращение есть — ОНО, регистр/ё/пробелы не важны', () => {
        const h = shortHost();
        assertEqual('Инстр. ОТ',
            h._instrShortOf('Повторный инструктаж по рабочим инструкциям ОТ'),
            'точное совпадение темы');
        assertEqual('Инстр. ОТ',
            h._instrShortOf('  повторный инструктаж  по рабочим инструкциям ОТ '),
            'регистр/лишние пробелы (нормализация 407)');
        assertEqual('Инстр. ОТ',
            h._instrShortOf('Повторный инструктаж по рабочим инструкциям ОТ'),
            'ё-нормализация не ломает совпадение');
    });

    test('пустое сокращение → ПОЛНОЕ название', () => {
        const h = shortHost();
        assertEqual('Периодическая проверка знаний на допуск к самостоятельной работе',
            h._instrShortOf('Периодическая проверка знаний на допуск к самостоятельной работе'),
            'ячейка E пуста — полное название (ничего не теряем)');
    });

    test('нет соответствия / пустая тема — прежнее поведение', () => {
        const h = shortHost();
        assertEqual('Курс АСУ ТП (обучение)', h._instrShortOf('Курс АСУ ТП (обучение)'),
            'мероприятие вне шаблона — полное название');
        assertEqual('', h._instrShortOf(''), 'пустая тема — пустая строка');
        assertEqual('', h._instrShortOf(null), 'null — пустая строка');
    });

    test('окно дня: строка показывает сокращение', () => {
        const evp = { innerHTML: '' };
        const doc = { getElementById: () => null };
        const h = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_renderEventsPopup') + ',\n' +
            methodText(INDEX_SRC, '_eventsAt') + ',\n' +
            methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_trainingCodeOf') + ',\n' +
            '_canEdit: false,' +
            '_isInstrType: function(t) { return t === \'инструктаж\' || t === \'проверка_знаний\'; },' +
            '_EMPLOYEES: [{ \'таб_номер\': \'017\', \'ФИО\': \'Иванов И. И.\' }],' +
            '_TRAININGS: [' +
            '{ id: 41, \'таб_номер\': \'017\', \'тип\': \'инструктаж\',' +
            '  \'дата_начала\': \'2026-09-05\', \'дата_окончания\': \'2026-09-05\',' +
            '  \'тема\': \'Повторный инструктаж по рабочим инструкциям ОТ\' }],' +
            '_INSTR_LIST: ' + JSON.stringify(LIST) + ',' +
            '_STATUS_CODES: [],' +
            '_esc: function(s) { return String(s == null ? \'\' : s); },' +
            '_escAttr: function(s) { return String(s == null ? \'\' : s); },' +
            // Task 434: дата окна мероприятий ячейки — дд.мм.гггг
            '_fmtDateRu: function(d) { var p = String(d).split("-");' +
            '  return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(d); },' +
            '_statusMeta: function() { return {}; }' +
            '});')(doc);
        const html = h._renderEventsPopup('2026-09-05', '017');
        assertTrue(html.indexOf('Инстр. ОТ') !== -1,
            'строка окна — сокращение из столбца E');
        assertTrue(html.indexOf('Повторный инструктаж по рабочим') === -1,
            'полного названия в окне НЕТ');
    });
});

// ============================================================
// 3. VM — карточка: плоский вид и заголовки групп
// ============================================================
describe('Task 416 — VM: карточка', () => {

    const YEAR = new Date().getFullYear();
    function ymd(dt) {
        const m = dt.getMonth() + 1, d = dt.getDate();
        return dt.getFullYear() + '-' + (m < 10 ? '0' : '') + m +
               '-' + (d < 10 ? '0' : '') + d;
    }
    const TODAY = ymd(new Date());

    const EMP = [
        { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
          'смена': '', 'должность': 'Слесарь КИПиА 5 разряд',
          'комментарий': '', 'группа_допуска': 'IV',
          'дата_приёма': '2024-03-15' }
    ];
    const TPL = [
        { название: 'Повторный инструктаж по рабочим инструкциям ОТ',
          вид: 'инструктаж', периодичность: 6, основание: '',
          сокращение: 'Инстр. ОТ' },
        { название: 'Периодическая проверка знаний на допуск к проведению работ в электроустановках до 1000 В',
          вид: 'проверка_знаний', периодичность: 12, основание: '',
          сокращение: 'ПЗ ЭБ до 1000 В' }
    ];
    const TR = [
        { id: 51, 'таб_номер': '017', 'тип': 'инструктаж',
          'тема': 'Повторный инструктаж по рабочим инструкциям ОТ',
          'дата_начала': TODAY, 'дата_окончания': TODAY },
        { id: 52, 'таб_номер': '017', 'тип': 'проверка_знаний',
          'тема': 'Периодическая проверка знаний на допуск к проведению работ в электроустановках до 1000 В',
          'дата_начала': TODAY, 'дата_окончания': TODAY },
        { id: 53, 'таб_номер': '017', 'тип': 'обучение',
          'тема': 'Курс АСУ ТП', 'дата_начала': TODAY,
          'дата_окончания': TODAY }
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
            methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKind') + ',\n' +
            methodText(INDEX_SRC, '_addMonthsIso') + ',\n' +
            methodText(INDEX_SRC, '_isoDate') + ',\n' +
            methodText(INDEX_SRC, '_fmtPeriodRu') + ',\n' +
            '_canEdit: ' + (opts.edit ? 'true' : 'false') + ',' +
            '_year: ' + YEAR + ', _month: 8,' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_VACATIONS: [],' +
            '_TRAININGS: ' + JSON.stringify(opts.trainings) + ',' +
            '_PPE: [],' +
            '_INSTR_LIST: ' + JSON.stringify(opts.tpl) + ',' +
            '_INSTR_ALL: [],' +
            '_fmtDateRu: function(d) { var p = String(d).split("-");' +
            '  return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(d); },' +
            '_esc: function(s) { return String(s); },' +
            '_escAttr: function(s) { return String(s); },' +
            '_vacDaysInYear: function(v, y) { return 0; },' +
            '_vacNetDaysInYear: function(v, y) { return 0; },' +
            '_plural: function(n, f) { return f[2]; },' +
            '_trainingCodeOf: function(t) { return t === "проверка_знаний" ? "ПЗ" : "И"; },' +
            '_statusMeta: function(c) { return { code: c, color: "#123456", name: c }; }' +
            '});')({ getElementById: () => null });
    }

    test('КАРТА (asBlocks): плоские строки — ПОЛНЫЕ названия + дата (Task 417)', () => {
        const host = cardHost({ tpl: TPL, edit: true, trainings: TR });
        const html = host._renderWorkerCard('017', true, true).join('');
        assertTrue(/ws-popup-event[^>]*>[\s\S]*?Повторный инструктаж по рабочим инструкциям ОТ · /.test(html),
            'строка инструктажа — полное название');
        assertTrue(html.indexOf('Периодическая проверка знаний на допуск к проведению работ в электроустановках до 1000 В · ') !== -1,
            'строка ПЗ — полное название');
        assertFalse(/ws-popup-event[^>]*>[\s\S]*?Инстр\. ОТ · /.test(html),
            'сокращений в блоках карты НЕТ (Task 417)');
        assertFalse(/ws-popup-event[^>]*>[\s\S]*?ПЗ ЭБ до 1000 В · /.test(html),
            'сокращений ПЗ в блоках карты НЕТ (Task 417)');
        assertTrue(/ws-popup-event[^>]*>[\s\S]*?Курс АСУ ТП · /.test(html),
            'мероприятие вне шаблона — полное название (b3)');
    });

    test('ПОПАП (групповой вид): заголовок группы — сокращение + title', () => {
        const host = cardHost({ tpl: TPL, edit: true, trainings: TR });
        const html = host._renderWorkerCard('017', true, false);
        assertTrue(/ws-il-name[^>]*>[\s\S]*?Инстр\. ОТ</.test(html) ||
                   /title="Повторный инструктаж по рабочим инструкциям ОТ"[\s\S]*?>Инстр\. ОТ</.test(html),
            'заголовок группы — сокращение');
        assertTrue(html.indexOf('title="Повторный инструктаж по рабочим инструкциям ОТ"') !== -1,
            'title-тултип несёт ПОЛНОЕ название');
        assertTrue(/ws-il-name[^>]*>[\s\S]*?ПЗ ЭБ до 1000 В</.test(html) ||
                   /title="Периодическая проверка знаний на допуск к проведению работ в электроустановках до 1000 В"[\s\S]*?>ПЗ ЭБ до 1000 В</.test(html),
            'заголовок группы ПЗ — сокращение');
    });

    test('без шаблона/без сокращений — прежний вид (деградация)', () => {
        const host = cardHost({ tpl: [], edit: true, trainings: TR });
        const html = host._renderWorkerCard('017', true, true).join('');
        assertTrue(/ws-popup-event[^>]*>[\s\S]*?Повторный инструктаж по рабочим инструкциям ОТ · /.test(html),
            'нет шаблона — полные названия (как до Task 416)');
    });
});

// ============================================================
// 4. SRC + GAS-VM — сервер
// ============================================================
describe('Task 416 — сервер', () => {

    test('SRC: _readInstrListSheet читает столбец E «сокращение»', () => {
        const fn = stripComments(methodText(WS_SRC, '_readInstrListSheet'));
        assertTrue(fn.indexOf("['сокращение']") !== -1,
            'заголовок E ищется по названию');
        assertTrue(fn.indexOf('сокращение:') !== -1 &&
                   fn.indexOf('shortCol') !== -1,
            'поле «сокращение» в пункте (нет заголовка — пусто)');
    });

    test('SRC: instrListInit — заголовок E создаётся, данные E не затираются', () => {
        const fn = stripComments(methodText(WS_SRC, 'instrListInit'));
        assertTrue(fn.indexOf("'сокращение'") !== -1,
            'заголовок листа — ПЯТЬ столбцов (A..E)');
        assertTrue(fn.indexOf('dataCols = 4') !== -1,
            'эталонные строки — только A..D');
        assertTrue(fn.indexOf("lastRow - 1, dataCols") !== -1,
            'clearContent — только dataCols');
        assertTrue((fn.match(/dataCols\)/g) || []).length >= 2,
            'очистка и запись строк — шириной dataCols (E не трогаем)');
    });

    // ---- GAS-VM: моки листов (харнесс Task 407) ----
    class MockSheet {
        constructor(rows) { this.rows = rows || []; }
        getLastRow() { return this.rows.length; }
        getLastColumn() {
            let m = 0;
            for (const r of this.rows) m = Math.max(m, r.length);
            return m || 1;
        }
        getRange(row, col, numRows, numCols) {
            numRows = numRows || 1; numCols = numCols || 1;
            const self = this;
            return {
                getValues() {
                    const out = [];
                    for (let r = row; r < row + numRows; r++) {
                        const line = [];
                        for (let c = col; c < col + numCols; c++) {
                            const rr = self.rows[r - 1];
                            line.push(rr ? (rr[c - 1] === undefined ? '' : rr[c - 1]) : '');
                        }
                        out.push(line);
                    }
                    return out;
                },
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

    function sheetsWithShort() {
        return {
            'Инструктажи': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_начала',
                 'дата_окончания', 'длительность_дней', 'комментарий']
            ]),
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание', 'сокращение'],
                ['Повторный инструктаж по рабочим инструкциям ОТ',
                 'инструктаж', 6, '', 'Инстр. ОТ'],
                ['Периодическая проверка знаний на допуск к самостоятельной работе',
                 'проверка_знаний', 12, '', ''],
                ['Целевой инструктаж', 'инструктаж', 0, '', 'Целевой']
            ])
        };
    }

    test('GAS-VM: instrList несёт «сокращение» из столбца E', () => {
        const WS = loadWS(sheetsWithShort());
        const r = WS.listTrainings({ token: 't' });
        assertTrue(r.ok, 'ok');
        assertEqual(3, r.data.instrList.length, 'три пункта');
        assertEqual('Инстр. ОТ', r.data.instrList[0].сокращение,
            'сокращение прочитано');
        assertEqual('', r.data.instrList[1].сокращение,
            'пустая ячейка E — пустая строка');
        assertEqual('Целевой', r.data.instrList[2].сокращение,
            'третий пункт');
    });

    test('GAS-VM: лист без столбца E — сокращение: \'\' (старый лист)', () => {
        const sheets = sheetsWithShort();
        sheets['Список_И_и_ПЗ'] = new MockSheet([
            ['название', 'вид', 'периодичность', 'основание'],
            ['Повторный инструктаж по рабочим инструкциям ОТ',
             'инструктаж', 6, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.listTrainings({ token: 't' });
        assertEqual('', r.data.instrList[0].сокращение,
            'нет заголовка E — пустое сокращение (клиент покажет полное)');
    });

    test('GAS-VM: instrListInit НЕ затирает данные столбца E', () => {
        const sheets = sheetsWithShort();
        // пользовательские сокращения в E (у строк 2-3)
        const WS = loadWS(sheets);
        const r = WS.instrListInit();
        assertTrue(r.ok && r.rows === 5, 'эталон 5 пунктов записан');
        const sheet = sheets['Список_И_и_ПЗ'];
        assertEqual('сокращение', sheet.rows[0][4],
            'заголовок E создан');
        assertEqual('Инстр. ОТ', sheet.rows[1][4],
            'сокращение 2-й строки СОХРАНЕНО (clearContent — A..D)');
        assertEqual('Целевой', sheet.rows[3][4],
            'сокращение 4-й строки (бывший «Целевой инструктаж») СОХРАНЕНО');
        // старая 4-я строка «Целевой инструктаж» замещена эталоном
        // (A..D переписаны: 3-я строка листа — канон-пункт № 9-ОГЭ)
        assertEqual('Повторный инструктаж по инструкции № 9-ОГЭ',
            sheet.rows[2][0], 'A..D замещены эталоном заявки 409');
        const after = WS.listTrainings({ token: 't' });
        assertEqual('Повторный инструктаж по рабочим инструкциям ОТ',
            after.data.instrList[0].название, 'название — эталон');
        assertEqual('Инстр. ОТ', after.data.instrList[0].сокращение,
            'сокращение из столбца E живо после init');
    });
});

// ============================================================
// 5. SW — версия
// ============================================================
describe('Task 416 — SW версия', () => {
    test('v643', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v744'") !== -1,
            'SW кэш — kipia-test-v744');
        assertTrue(SW_SRC.indexOf('kipia-test-v642') === -1,
            'v642 не осталась в sw.js');
        assertTrue(SW_SRC.indexOf('kipia-test-v745') === -1,
            'двойной бамп отсутствует (guard: v644)');
    });
});
