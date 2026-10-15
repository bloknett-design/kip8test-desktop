// ============================================================
// Task 425 — заявка (kip8test): «Подожди, мне не нужно объединять
// инструктажи и мероприятия, инструктажи менять не нужно, а для
// мероприятий нужно создать свои отдельные страницы, так же нужно
// проверить что бы они не влияли друг на друга в приложении.
// Потому что это совершенно разные по информационному наполнению
// блоки. Главное отличие, новые инструктажи формируются автома-
// тически в зависимости от предыдущих, а мероприятия каждый раз
// вносятся вручную и без автоматического продления, потому что у
// них нет закономерности, это как правило не плановые мероприя-
// тия, и по большей части фиксирующие уже случившееся события».
//
// ЧТО ПРОВЕРЯЕТСЯ (НЕЗАВИСИМОСТЬ БЛОКОВ):
//   СЕРВЕР (SRC):
//   1) СТОП-ПРАВИЛО в _autoCreateNextTrainings: тип отмечаемой
//      строки обучение/прогул/примечание → автосоздания НЕТ
//      (мероприятия без автоматического продления);
//   2) регресс: правила автосоздания ИНСТРУКТАЖЕЙ живы (Task
//      419..423 — инструктажи менять не нужно);
//   3) srvVer '427' — версия сервера в ответе setTrainingDone;
//   4) маршрутизация addTraining по типу (_trainingsSheetForType)
//      не тронута;
//   5) клиент: eventsInit из приложения НЕ доступен (только
//      редактор Apps Script).
//   СЕРВЕР (GAS-VM):
//   6) ГЛАВНЫЙ: отметка легаси-«обучения» в «Инструктажах»
//      (тема = пункту списка с периодичностью!) → отметка
//      записана, created ПУСТО, note «автосоздания нет»,
//      «Мероприятия» не тронуты;
//   7) регресс 421/423: отметка общего → ОБЕ записи (9-ОГЭ +3,
//      общий +6) — автосоздание инструктажей живо, «Мероприятия»
//      НЕ созданы и не тронуты;
//   8) маршрутизация addTraining: первое МЕРОПРИЯТИЕ создаёт
//      ТОЛЬКО «Мероприятия»; первый ИНСТРУКТАЖ — ТОЛЬКО
//      «Инструктажи» (листы независимы);
//   9) eventsInit: существующий «Инструктажи» с данными НЕ
//      тронут (записей 0 в лист), «Мероприятия» создан.
//   SW: kipia-test-v743.
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

function assertArrayEqual(actual, expected, message) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) {
        throw new Error((message || 'массивы различаются') +
            ': ожидалось ' + e + ', получено ' + a);
    }
}

// ============================================================
// 1. SRC — сервер: стоп-правило и регресс правил
// ============================================================
describe('Task 425 — SRC: стоп-правило мероприятий + регресс инструктажей', () => {

    test('СТОП-ПРАВИЛО: мероприятие (обучение/прогул/примечание) — автосоздания нет', () => {
        const fn = stripComments(methodText(WS_SRC, '_autoCreateNextTrainings'));
        const stop = fn.indexOf('TRAINING_EVENTSHEET_TYPES[tipKey]');
        assertTrue(stop !== -1,
            'тип отмечаемой строки проверяется по TRAINING_EVENTSHEET_TYPES');
        assertTrue(fn.indexOf('автосоздания нет (вносится вручную, без продления)') !== -1,
            'причина — в note ответа');
        const rule1 = fn.indexOf('per > 0 && !parentItem');
        assertTrue(rule1 !== -1 && stop < rule1,
            'стоп-правило срабатывает РАНЬШЕ правил автосоздания');
    });

    test('регресс 419..423: правила автосоздания ИНСТРУКТАЖЕЙ живы (инструктажи менять не нужно)', () => {
        const fn = stripComments(methodText(WS_SRC, '_autoCreateNextTrainings'));
        assertTrue(fn.indexOf('per > 0 && !parentItem') !== -1,
            'правило 1 — новый срок пункта (периодичность N)');
        assertTrue(fn.indexOf('children.length') !== -1,
            'правило 2 — дети отмеченного пункта (9-ОГЭ +3 мес)');
        assertTrue(fn.indexOf('hasInWindow') !== -1,
            'проверка окна (Task 422)');
        assertTrue(WS_SRC.indexOf('Task 421: зависимый пункт — автосоздания нет') !== -1,
            'маркер зависимого пункта (Task 421) жив');
        assertTrue(WS_SRC.indexOf('эталона заявки') !== -1,
            'форс-3 эталона 9-ОГЭ (Task 423) жив');
    });

    test('srvVer 427 — версия сервера в ответе setTrainingDone', () => {
        const fn = stripComments(methodText(WS_SRC, 'setTrainingDone'));
        assertTrue(fn.indexOf("srvVer: '427'") !== -1,
            'srvVer 427 (Task 427: раздельные последовательности id листов; День шахтёра не праздник — Task 426; мероприятия без автосоздания — Task 425)');
        assertTrue(fn.indexOf("srvVer: '426'") === -1,
            'старой версии в коде нет');
    });

    test('маршрутизация addTraining по типу не тронута (регресс 405)', () => {
        const fn = stripComments(methodText(WS_SRC, 'addTraining'));
        assertTrue(fn.indexOf('_trainingsSheetForType') !== -1,
            'лист записи — по типу (обучение/прогул/примечание → «Мероприятия»)');
        assertTrue(fn.indexOf('_ensureEventsSheet') !== -1 &&
                   fn.indexOf('_ensureTrainingsSheet') !== -1,
            'авто-создание обоих листов при добавлении (Task 405/413)');
    });

    test('клиент: eventsInit из приложения НЕ доступен (только редактор Apps Script)', () => {
        assertTrue(INDEX_SRC.indexOf('eventsInit') === -1,
            'в index.html нет обращений к eventsInit — инициализация листов не входит в API приложения');
    });
});

// ============================================================
// 2. GAS-VM — сервер: независимость блоков на моках листов
// ============================================================
describe('Task 425 — GAS-VM: блоки не влияют друг на друга', () => {

    class MockSheet {
        constructor(rows) { this.rows = rows || []; this.writeCount = 0; }
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
                getValue() {
                    const rr = self.rows[row - 1];
                    return rr ? (rr[col - 1] === undefined ? '' : rr[col - 1]) : '';
                },
                setValues(vals) {
                    self.writeCount++;
                    for (let i = 0; i < vals.length; i++) {
                        const r = row + i;
                        while (self.rows.length < r) self.rows.push([]);
                        for (let c = 0; c < vals[i].length; c++) {
                            self.rows[r - 1][col - 1 + c] = vals[i][c];
                        }
                    }
                },
                setValue(v) {
                    self.writeCount++;
                    while (self.rows.length < row) self.rows.push([]);
                    self.rows[row - 1][col - 1] = v;
                },
                clearContent() {
                    self.writeCount++;
                    for (let r = row; r < row + numRows; r++) {
                        const rr = self.rows[r - 1];
                        if (!rr) continue;
                        for (let c = col; c < col + numCols; c++) rr[c - 1] = '';
                    }
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

    const U_OT = 'Повторный инструктаж по рабочим инструкциям ОТ';
    const U_OGE = 'Повторный инструктаж по инструкции № 9-ОГЭ';
    const T_PKZ = 'Периодическая проверка знаний на допуск к самостоятельной работе';
    const TR_HEAD = ['id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
                     'выполнение', 'просрочен', 'комментарий'];

    function etalonSheets() {
        return {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание', 'сокращение'],
                [U_OT, 'инструктаж', 6, '', 'раб. инстр. ОТ'],
                [U_OGE, 'инструктаж', 3, '', '9-ОГЭ'],
                [T_PKZ, 'проверка_знаний', 12, '', '']
            ])
        };
    }

    test('ГЛАВНЫЙ: отметка легаси-«обучения» в «Инструктажах» — автосоздания НЕТ (мероприятие без продления)', () => {
        // живой кейс: тема обучения СОВПАДАЕТ с пунктом списка
        // (период 6) — без стоп-правила отметка создала бы новый
        // срок «инструктажем»; мероприятие обязано быть вручную
        const sheets = etalonSheets();
        sheets['Инструктажи'] = new MockSheet([TR_HEAD,
            [30, '017', 'обучение', U_OT, new Date(2026, 8, 1), 0, 0,
             'легаси-строка объединённой таблицы']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 30, 'выполнение': 1 });
        assertTrue(r.ok, 'отметка применилась');
        assertEqual(r.data.created.length, 0,
            'автосоздания НЕТ — мероприятия без автоматического продления');
        assertEqual(r.data.updated.length, 0, 'покрытия нет');
        assertTrue(String(r.data.autoNote)
            .indexOf('автосоздания нет') !== -1,
            'причина — в autoNote: ' + r.data.autoNote);
        assertEqual(r.data.srvVer, '427', 'версия сервера Task 427');
        // отметка ЗАПИСАНА в строку
        assertEqual(sheets['Инструктажи'].rows.length, 2,
            'новых строк не добавлено');
        assertEqual(sheets['Инструктажи'].rows[1][5], 1,
            'выполнение = 1 зафиксировано');
        assertEqual(sheets['Мероприятия'], undefined,
            'лист «Мероприятия» не тронут (блоки независимы)');
    });

    test('ГЛАВНЫЙ: отметка «прогул»/«примечание» — автосоздания тоже нет', () => {
        const prg = etalonSheets();
        prg['Инструктажи'] = new MockSheet([TR_HEAD,
            [31, '017', 'прогул', U_OT, new Date(2026, 8, 2), 0, 0, '']
        ]);
        const WS1 = loadWS(prg);
        const r1 = WS1.setTrainingDone({ token: 't', id: 31, 'выполнение': 1 });
        assertEqual(r1.data.created.length, 0, 'прогул — без автосоздания');

        const pri = etalonSheets();
        pri['Инструктажи'] = new MockSheet([TR_HEAD,
            [32, '017', 'примечание', U_OT, new Date(2026, 8, 3), 0, 0, '']
        ]);
        const WS2 = loadWS(pri);
        const r2 = WS2.setTrainingDone({ token: 't', id: 32, 'выполнение': 1 });
        assertEqual(r2.data.created.length, 0, 'примечание — без автосоздания');
    });

    test('регресс 421/423: отметка общего → ОБЕ записи (9-ОГЭ +3, общий +6) — инструктажи живы', () => {
        const sheets = etalonSheets();
        sheets['Инструктажи'] = new MockSheet([TR_HEAD,
            [20, '017', 'инструктаж', U_OT, new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r.data.created.length, 2,
            'созданы ОБЕ записи — автосоздание инструктажей НЕ тронуто');
        assertEqual(r.data.created.filter(x => x.тема === U_OGE)[0]
            .дата_проведения, '2026-12-01', '9-ОГЭ через 3 месяца');
        assertEqual(r.data.created.filter(x => x.тема === U_OT)[0]
            .дата_проведения, '2027-03-01', 'общий через 6 месяцев');
        assertEqual(sheets['Инструктажи'].rows.length, 4,
            'заголовок + исходная строка + 2 новых записи');
        assertEqual(sheets['Мероприятия'], undefined,
            '«Мероприятия» НЕ созданы — отметка инструктажа не трогает блок мероприятий');
    });

    test('маршрутизация addTraining: первое мероприятие → ТОЛЬКО «Мероприятия», первый инструктаж → ТОЛЬКО «Инструктажи»', () => {
        // (a) первое МЕРОПРИЯТИЕ
        const sheetsA = { 'Сотрудники': new MockSheet([]) };
        const WSA = loadWS(sheetsA);
        const rA = WSA.addTraining({ token: 't', 'таб_номер': '017',
            'тип': 'обучение', 'тема': 'Курс охраны труда',
            'дата_начала': '2026-09-01' });
        assertTrue(rA.ok, 'meroprijatie добавлено');
        assertTrue(sheetsA['Мероприятия'] instanceof MockSheet,
            'лист «Мероприятия» создан');
        assertEqual(sheetsA['Инструктажи'], undefined,
            'лист «Инструктажи» НЕ создан — листы независимы');
        assertEqual(sheetsA['Мероприятия'].rows.length, 2,
            'заголовки + строка');
        assertEqual(sheetsA['Мероприятия'].rows[1][2], 'обучение',
            'тип записан верно');

        // (b) первый ИНСТРУКТАЖ
        const sheetsB = { 'Сотрудники': new MockSheet([]) };
        const WSB = loadWS(sheetsB);
        const rB = WSB.addTraining({ token: 't', 'таб_номер': '017',
            'тип': 'инструктаж', 'тема': U_OT,
            'дата_начала': '2026-09-01' });
        assertTrue(rB.ok, 'instruktazh добавлен');
        assertTrue(sheetsB['Инструктажи'] instanceof MockSheet,
            'лист «Инструктажи» создан');
        assertEqual(sheetsB['Мероприятия'], undefined,
            'лист «Мероприятия» НЕ создан — листы независимы');
    });

    test('eventsInit: существующий «Инструктажи» с данными НЕ тронут', () => {
        const sheets = {
            'Инструктажи': new MockSheet([TR_HEAD,
                [40, '017', 'инструктаж', U_OT,
                 new Date(2026, 8, 1), 0, 1, ''],
                [41, '018', 'проверка_знаний', T_PKZ,
                 new Date(2026, 8, 5), 0, 0, 'x']
            ])
        };
        const WS = loadWS(sheets);
        const r = WS.eventsInit();
        assertEqual(r.sheets['Мероприятия'], 'created',
            '«Мероприятия» создан');
        assertEqual(r.sheets['Инструктажи'], undefined,
            '«Инструктажи» в отчёте НЕТ');
        assertEqual(sheets['Инструктажи'].writeCount, 0,
            'в «Инструктажи» НЕ писали');
        assertEqual(sheets['Инструктажи'].rows.length, 3,
            'строки на месте (2 записи + заголовок)');
        assertEqual(sheets['Инструктажи'].rows[1][3], U_OT,
            'данные идентичны');
    });
});

// ============================================================
// 3. SW — версия кэша
// ============================================================
describe('Task 425 — SW: версия кэша', () => {
    test('CACHE_VERSION = kipia-test-v743', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v743'") !== -1,
            'SW v653 (Task 426)');
        assertTrue(SW_SRC.indexOf('kipia-test-v744') === -1,
            'двойной бамп отсутствует');
    });
});
