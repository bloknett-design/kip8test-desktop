// ============================================================
// Task 413 — заявка: «При добавлении инструктажа или проверки
// знаний в форме ввода в приложении, они не добавляются, ещё я
// удалил таблицу Инструктажи в файле табель_КИП_ИОС, когда мы
// начали заново работать над разделом проведения инструктажей и
// проверки знаний. Где должны сохраняться вновь создаваемые записи
// в этом разделе? Что нужно сделать чтобы был их архив?».
//
// ДИАГНОЗ: записи раздела пишутся в лист «Инструктажи» файла
// табель_КИП_ИОС (A:id, B:таб_номер, C:тип, D:тема, E:дата_начала,
// F:дата_окончания, G:длительность_дней, H:комментарий). Лист был
// удалён вручную → addTraining возвращал 'sheet_not_found:
// Инструктажи' (для «Мероприятий» автосоздание было — Task 405,
// для «Инструктажей» — нет); listTrainings при отсутствии листа
// падал → вся загрузка сетки с экраном/тостом ошибки.
//
// 1) СЕРВЕР (WorkSchedule.gs): _ensureTrainingsSheet — автосоздание
//    листа «Инструктажи» с каноническими заголовками (зеркально
//    _ensureEventsSheet 405); addTraining — при отсутствии ЛЮБОГО
//    листа вызывает соответствующий ensure; listTrainings — мягкая
//    деградация: trainings/instrAll пустые, «Мероприятия» и
//    «Список_И_и_ПЗ» читаются независимо, ok:true.
// 2) КЛИЕНТ (index.html): _apiErrText — понятный русский текст для
//    'sheet_not_found: X' (старый Apps Script); тосты/экран ошибки
//    submitTrainingForm/_doDeleteTraining/loadGrid — через
//    _apiErrText (раньше сырой err.message).
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
// 1. SRC — сервер: автосоздание листа + мягкое чтение
// ============================================================
describe('Task 413 — SRC: сервер (WorkSchedule.gs)', () => {

    test('_ensureTrainingsSheet — автосоздание листа «Инструктажи»', () => {
        const fn = stripComments(methodText(WS_SRC, '_ensureTrainingsSheet'));
        assertTrue(WS_SRC.indexOf('_ensureTrainingsSheet: function()') !== -1,
            'метод существует');
        assertTrue(fn.indexOf('insertSheet(this.TRAININGS_SHEET)') !== -1,
            'лист создаётся insertSheet');
        // Task 418: канонические заголовки — столбцы E..G
        // переименованы пользователем (дата_проведения/выполнение/
        // просрочен), лист создаётся сразу в новом формате
        const hdr = fn.indexOf("'дата_проведения'") !== -1 &&
                    fn.indexOf("'выполнение'") !== -1 &&
                    fn.indexOf("'просрочен'") !== -1 &&
                    fn.indexOf("'комментарий'") !== -1;
        assertTrue(hdr, 'канонические заголовки A..H (Task 418)');
        assertTrue(fn.indexOf("'дата_начала'") === -1,
            'легаси-заголовков больше нет');
        assertTrue(fn.indexOf('setFrozenRows(1)') !== -1,
            'строка заголовков закреплена (как у «Мероприятий»)');
        assertTrue(fn.indexOf('WORKSCHEDULE_TRAININGS_SHEET_CREATED') !== -1,
            'аудит создания листа');
        // гонка одновременных добавлений: insertSheet бросил, но лист
        // уже создан другим вызовом — берём существующий
        assertTrue(fn.indexOf('catch (e)') !== -1 &&
                    fn.indexOf('getSheetByName(this.TRAININGS_SHEET)') !== -1,
            'защита от гонки создания');
    });

    test('addTraining: при отсутствии ЛЮБОГО листа — автосоздание', () => {
        const fn = stripComments(methodText(WS_SRC, 'addTraining'));
        assertTrue(fn.indexOf('this._ensureTrainingsSheet()') !== -1,
            '«Инструктажи» создаются автоматически (заявка 413)');
        assertTrue(fn.indexOf('this._ensureEventsSheet()') !== -1,
            '«Мероприятия» — прежнее поведение (Task 405)');
        assertTrue(fn.indexOf('if (!sheet) {') !== -1,
            'ensure вызывается когда листа нет');
    });

    test('listTrainings: мягкая деградация без листа «Инструктажи»', () => {
        const fn = stripComments(methodText(WS_SRC, 'listTrainings'));
        assertTrue(fn.indexOf('sheet_not_found') === -1,
            'чтение больше НЕ падает ошибкой отсутствия листа');
        assertTrue(fn.indexOf('this._readTrainingsSheet(sheet, payload) : []') !== -1,
            'trainings — пустой срез без листа');
        assertTrue(fn.indexOf('this._readTrainingsSheet(sheet, {}) : []') !== -1,
            'instrAll — пустой срез без листа');
        // «Мероприятия» и «Список_И_и_ПЗ» читаются независимо от
        // наличия «Инструктажей»
        assertTrue(fn.indexOf('evSheet ? this._readTrainingsSheet(evSheet, {}) : []') !== -1,
            'eventsAll живёт независимо');
        assertTrue(fn.indexOf('this._readInstrListSheet()') !== -1,
            'instrList живёт независимо');
    });

    test('док-блок: структура листа + эндпоинт addTraining', () => {
        assertTrue(WS_SRC.indexOf('Task 413: лист может быть удалён вручную — addTraining') !== -1,
            'примечание об автосоздании в структуре листа');
        assertTrue(WS_SRC.indexOf('создаётся') !== -1 &&
                    WS_SRC.indexOf('автоматически с заголовками') !== -1,
            'шапка-перечень эндпоинтов обновлена');
    });
});

// ============================================================
// 2. SRC — клиент: понятный текст ошибки
// ============================================================
describe('Task 413 — SRC: клиент (index.html)', () => {

    test('_apiErrText: маппинг sheet_not_found', () => {
        const m = INDEX_SRC.match(/_apiErrText: function\(err\) \{[\s\S]*?\n        \},/);
        assertTrue(!!m, 'хелпер _apiErrText найден');
        assertTrue(m[0].indexOf('sheet_not_found') !== -1,
            'распознаётся код sheet_not_found');
        assertTrue(m[0].indexOf('табель_КИП_ИОС') !== -1 &&
                    m[0].indexOf('WorkSchedule.gs') !== -1,
            'текст называет файл и что обновить');
        assertTrue(m[0].indexOf('создана автоматически') !== -1,
            'текст объясняет автовосстановление таблицы');
    });

    test('submitTrainingForm: catch — _apiErrText (не сырой err.message)', () => {
        const fn = methodText(INDEX_SRC, 'submitTrainingForm');
        assertTrue(fn.indexOf("self._apiErrText(err)") !== -1,
            'ветка правки уже использовала _apiErrText');
        const catches = fn.match(/catch\(function\(err\) \{[\s\S]*?\}\)/g) || [];
        assertTrue(catches.length >= 2, 'две ветки catch (правка + новая запись)');
        const raw = fn.match(/KipToast\.show\('Ошибка: ' \+ \(err\.message \|\| err\)\)/g);
        assertTrue(!raw, 'сырого err.message в тостах больше нет');
    });

    test('_doDeleteTraining и loadGrid: понятный текст ошибок', () => {
        const del = methodText(INDEX_SRC, '_doDeleteTraining');
        assertTrue(del.indexOf('self._apiErrText(err)') !== -1,
            'удаление — тост через _apiErrText');
        const lg = methodText(INDEX_SRC, 'loadGrid');
        assertTrue(lg.indexOf('Ошибка загрузки: \' + self._apiErrText(err)') !== -1,
            'экран ошибки загрузки — через _apiErrText');
        assertTrue(lg.indexOf('\'Ошибка загрузки графика: \' + self._apiErrText(err)') !== -1,
            'тост загрузки — через _apiErrText');
    });
});

// ============================================================
// 3. VM — клиент: _apiErrText
// ============================================================
describe('Task 413 — VM: WorkSchedule._apiErrText', () => {

    function loadApiErrText() {
        const m = extractMethod(INDEX_SRC, '_apiErrText');
        if (!m) throw new Error('_apiErrText не найден');
        // метод внутри объекта: оборачиваем в объектный литерал
        return new Function('return ({' + m + '})._apiErrText;')();
    }

    test('sheet_not_found: Инструктажи — понятный русский текст', () => {
        const f = loadApiErrText();
        const txt = f({ message: 'sheet_not_found: Инструктажи' });
        assertTrue(txt.indexOf('Инструктажи') !== -1,
            'имя листа в тексте: ' + txt);
        assertTrue(txt.indexOf('табель_КИП_ИОС') !== -1,
            'называет файл табель_КИП_ИОС');
        assertTrue(txt.indexOf('WorkSchedule.gs') !== -1,
            'говорит, что обновить');
        assertTrue(txt.indexOf('создана автоматически') !== -1,
            'объясняет автовосстановление');
    });

    test('serverMessage — приоритет, без изменений', () => {
        const f = loadApiErrText();
        assertEqual(f({ serverMessage: 'Период пересекается с заданным отпуском' }),
            'Период пересекается с заданным отпуском',
            'serverMessage возвращается как есть (Task 282)');
    });

    test('обычные коды ошибок не затрагиваются', () => {
        const f = loadApiErrText();
        assertEqual(f({ message: 'overlap' }), 'overlap', 'код как был');
        assertEqual(f({ message: 'no_session' }), 'no_session', 'код как был');
        assertEqual(f(null), 'ошибка', 'без err — «ошибка»');
    });

    test('sheet_not_found с другим листом («Мероприятия»)', () => {
        const f = loadApiErrText();
        const txt = f({ message: 'sheet_not_found: Мероприятия' });
        assertTrue(txt.indexOf('Мероприятия') !== -1, 'имя листа подставлено');
        assertTrue(txt.indexOf('Инструктажи') === -1,
            'нет подстановки чужого имени');
    });
});

// ============================================================
// 4. GAS-VM — сервер: автосоздание + мягкое чтение
// ============================================================
describe('Task 413 — GAS-VM: сервер (моки листов)', () => {

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
                setValue(v) {
                    while (self.rows.length < row) self.rows.push([]);
                    self.rows[row - 1][col - 1] = v;
                },
                setNumberFormat() { return this; },
                setFontWeight() { return this; },
                setBackground() { return this; },
                setFontColor() { return this; }
            };
        }
        deleteRow(r) { this.rows.splice(r - 1, 1); }
        setFrozenRows() { this.frozen = true; }
    }

    const MOCK_UTILS = {
        findSessionByToken: () => ({ user_id: 1 }),
        findUserById: () => ({ role: 'Админ', email: 'test@example.com' }),
        audit: () => {}
    };

    function loadWS(sheets, insertSheetImpl) {
        const ss = {
            getSheetByName: (n) => sheets[n] || null,
            insertSheet: insertSheetImpl || ((name) => {
                const s = new MockSheet([]);
                sheets[name] = s;
                return s;
            })
        };
        const SpreadsheetApp = { openById: () => ss };
        const factory = new Function('SpreadsheetApp', 'Utils', 'Logger',
            WS_SRC + '\nreturn WorkSchedule;');
        return factory(SpreadsheetApp, MOCK_UTILS, { log: () => {} });
    }

    // Сценарий пользователя: «Инструктажи» удалён, «Мероприятия» и
    // «Список_И_и_ПЗ» живы
    function userSheets() {
        return {
            'Мероприятия': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_начала',
                 'дата_окончания', 'длительность_дней', 'комментарий'],
                [10, '017', 'обучение', 'Курс АСУ ТП',
                 new Date(2026, 7, 5), new Date(2026, 7, 5), 1, 'внешний курс']
            ]),
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание'],
                ['Повторный инструктаж по рабочим инструкциям ОТ',
                 'инструктаж', 6, ''],
                ['Периодическая проверка знаний по охране труда при выполнении работ на высоте',
                 'проверка_знаний', 12, 'инструкция № 53-ОТ']
            ])
        };
    }

    test('addTraining: листа «Инструктажи» нет — создаётся, запись пишется', () => {
        const sheets = userSheets();
        const WS = loadWS(sheets);
        const r = WS.addTraining({ token: 't', 'таб_номер': '017',
            тип: 'инструктаж', тема: 'Повторный инструктаж по рабочим инструкциям ОТ',
            дата_начала: '2026-08-25' });
        assertTrue(r.ok, 'ok — лист создан автоматически');
        const t = sheets['Инструктажи'];
        assertTrue(!!t, 'лист «Инструктажи» создан');
        assertEqual(t.rows.length, 2, 'шапка + 1 строка данных');
        // Task 418: канонические заголовки — НОВЫЙ формат
        assertEqual(JSON.stringify(t.rows[0]),
            JSON.stringify(['id', 'таб_номер', 'тип', 'тема',
                           'дата_проведения', 'выполнение',
                           'просрочен', 'комментарий']),
            'заголовки A..H канонические (Task 418)');
        assertEqual(t.frozen, true, 'строка заголовков закреплена');
        // Task 427: РАЗДЕЛЬНАЯ нумерация — id ПЕРВОЙ записи нового
        // листа «Инструктажи» = 1 (максимум «Мероприятий» 10 не мешает)
        assertEqual(t.rows[1][0], 1,
            'id = 1 — СВОЯ последовательность листа (Task 427)');
        assertEqual(t.rows[1][1], '017', 'таб_номер текстом');
        assertEqual(t.rows[1][2], 'инструктаж', 'тип');
        assertEqual(t.rows[1][3], 'Повторный инструктаж по рабочим инструкциям ОТ',
            'тема');
        assertTrue(t.rows[1][4] instanceof Date, 'дата_проведения — Date');
        // Task 418: F — выполнение (новая запись — 0, отметок ещё
        // нет), G — просрочен (дата 25.08.2026 прошла → 1)
        assertEqual(t.rows[1][5], 0, 'выполнение = 0 (без отметки)');
        assertEqual(t.rows[1][6], 1, 'просрочен = 1 (дата прошла)');
    });

    test('addTraining: вторая запись — нумерация на созданном листе', () => {
        const sheets = userSheets();
        const WS = loadWS(sheets);
        WS.addTraining({ token: 't', 'таб_номер': '023',
            тип: 'проверка_знаний',
            тема: 'Периодическая проверка знаний по охране труда при выполнении работ на высоте',
            дата_начала: '2026-08-26' });
        const r2 = WS.addTraining({ token: 't', 'таб_номер': '023',
            тип: 'инструктаж', тема: 'Повторный инструктаж по инструкции № 9-ОГЭ',
            дата_начала: '2026-08-27' });
        assertTrue(r2.ok && r2.data.id === 2,
            'id = 2 (1 + 1 — СВОЯ последовательность «Инструктажей», Task 427)');
        assertEqual(sheets['Инструктажи'].rows.length, 3, 'шапка + 2 записи');
    });

    test('addTraining: ни одного листа — «Инструктажи» с нуля (id 1)', () => {
        const sheets = { 'Список_И_и_ПЗ': userSheets()['Список_И_и_ПЗ'] };
        const WS = loadWS(sheets);
        const r = WS.addTraining({ token: 't', 'таб_номер': '017',
            тип: 'проверка_знаний',
            тема: 'Периодическая проверка знаний на допуск к самостоятельной работе',
            дата_начала: '2026-09-01' });
        assertTrue(r.ok, 'ok');
        assertEqual(r.data.id, 1, 'первая запись — id 1');
        assertEqual(sheets['Инструктажи'].rows[1][2], 'проверка_знаний',
            'тип записи');
    });

    test('listTrainings: листа «Инструктажи» нет — ok, «Мероприятия» живы', () => {
        const sheets = userSheets();
        const WS = loadWS(sheets);
        const r = WS.listTrainings({ token: 't', year: 2026, month: 8 });
        assertTrue(r.ok, 'ok (лист отсутствует — НЕ ошибка, Task 413)');
        assertEqual(r.data.trainings.length, 1,
            'запись «Мероприятий» читается');
        assertEqual(r.data.trainings[0].тема, 'Курс АСУ ТП',
            'тема записи «Мероприятий»');
        assertEqual(r.data.instrAll.length, 0, 'instrAll — пустой срез');
        assertEqual(r.data.eventsAll.length, 1, 'eventsAll живой');
        assertEqual(r.data.instrList.length, 2,
            'instrList «Список_И_и_ПЗ» читается независимо');
    });

    test('listTrainings: обоих листов записей нет — пустые списки, ok', () => {
        const sheets = {};
        const WS = loadWS(sheets);
        const r = WS.listTrainings({ token: 't', year: 2026, month: 8 });
        assertTrue(r.ok, 'ok без листов вообще');
        assertEqual(r.data.trainings.length, 0, 'trainings []');
        assertEqual(r.data.instrAll.length, 0, 'instrAll []');
        assertEqual(r.data.eventsAll.length, 0, 'eventsAll []');
        assertEqual(r.data.instrList.length, 0, 'instrList []');
    });

    test('listTrainings: регресс — с обоими листами объединение (Task 405)', () => {
        const sheets = userSheets();
        sheets['Инструктажи'] = new MockSheet([
            ['id', 'таб_номер', 'тип', 'тема', 'дата_начала',
             'дата_окончания', 'длительность_дней', 'комментарий'],
            [5, '017', 'инструктаж', 'Инструктаж по ОТ',
             new Date(2026, 7, 10), new Date(2026, 7, 10), 1, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.listTrainings({ token: 't', year: 2026, month: 8 });
        assertTrue(r.ok, 'ok');
        assertEqual(r.data.trainings.length, 2,
            '«Инструктажи» + «Мероприятия» вместе');
        assertEqual(r.data.instrAll.length, 1, 'instrAll — записи листа');
    });

    test('addTraining: обучение — «Мероприятия» с автосозданием (регресс 405)', () => {
        const sheets = {};
        const WS = loadWS(sheets);
        const r = WS.addTraining({ token: 't', 'таб_номер': '017',
            тип: 'обучение', тема: 'Первый курс', дата_начала: '2026-08-27' });
        assertTrue(r.ok, 'ok');
        assertTrue(!!sheets['Мероприятия'], 'лист «Мероприятия» создан');
        assertEqual(sheets['Мероприятия'].rows.length, 2, 'шапка + строка');
        assertFalse(!!sheets['Инструктажи'],
            '«Инструктажи» не трогаются (тип — мероприятие)');
    });

    test('гонка: insertSheet бросил, лист уже создан — берётся существующий', () => {
        const sheets = userSheets();
        const raceWinner = new MockSheet([
            ['id', 'таб_номер', 'тип', 'тема', 'дата_начала',
             'дата_окончания', 'длительность_дней', 'комментарий'],
            [10, '0871', 'инструктаж', 'Чужой вызов успел первым',
             new Date(2026, 7, 1), new Date(2026, 7, 1), 1, '']
        ]);
        sheets['Инструктажи'] = raceWinner;
        const WS = loadWS(sheets, () => {
            throw new Error('A sheet with that name already exists');
        });
        const r = WS.addTraining({ token: 't', 'таб_номер': '017',
            тип: 'инструктаж', тема: 'Мой инструктаж', дата_начала: '2026-08-28' });
        assertTrue(r.ok, 'ok — гонка не роняет добавление');
        assertEqual(raceWinner.rows.length, 3, 'шапка + чужая + своя запись');
        assertEqual(r.data.id, 11, 'id выше существующего max 10');
    });
});

// ============================================================
// 5. SW — версия кэша
// ============================================================
describe('Task 413 — SW: версия кэша', () => {
    test('CACHE_VERSION = kipia-test-v753', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v753'") !== -1,
            'SW v640 (Task 413)');
        assertTrue(SW_SRC.indexOf('kipia-test-v754') === -1,
            'двойной бамп отсутствует');
    });
});
