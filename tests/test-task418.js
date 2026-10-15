// ============================================================
// Task 418 — заявка: «В таблице "Инструктажи" я заменил название
// столбца "дата_начала" на "дата_проведения", столбца
// "дата_окончания" на "выполнение", столбца "длительность_дней" на
// "просрочен". Суть логики заполнения переименованных столбцов
// должна быть такая: в столбце "дата_проведения" указывается дата
// планируемого проведения; в столбце "выполнение" находится 0,
// если пользователь через интерфейс (новый - который необходимо
// добавить) в блоке Повторные инструктажи и периодическая проверка
// знаний, в карточке работника не сделал отметку о выполнении, и
// или цифра 1 - если сделал отметку о выполнении; в столбце
// "просрочен" находится цифра 0 - если дата проведения не просрочена
// или сделана отметка о выполнении (столбец "выполнение" = 1),
// находится цифра 1 - если дата проведения просрочена и не сделана
// отметка о выполнении (столбец "выполнение" = 0)».
//
// 1) СЕРВЕР (WorkSchedule.gs):
//    - _trainingsSheetFormat: формат листа по заголовкам строки 1
//      ('done' — переименованные столбцы / 'legacy' — прежние);
//    - _readTrainingsSheet: формат done — E: дата_проведения,
//      F: выполнение, G: просрочен (пересчёт: дата прошла и
//      отметки нет); легаси-даты в F читаются как 0; нормализация
//      F/G ЗАПИСЫВАЕТСЯ обратно в лист (_writeBackDoneFlags);
//      совместимые поля (дата_начала=дата_окончания=дата_
//      проведения, длительность_дней=1) — бейджи/печать живы;
//    - addTraining: done-формат → строка [.., дата, выполнение,
//      просрочен, ..]; payload.выполнение (правка сохраняет);
//    - setTrainingDone (НОВЫЙ эндпоинт): пишет F «выполнение»,
//      пересчитывает G «просрочен»; легаси-лист → понятная ошибка;
//    - splitTrainingsSheet: перенос done→«Мероприятия» с
//      конвертацией в прежний формат;
//    - _ensureTrainingsSheet: автосоздание листа сразу с новыми
//      заголовками; _ensureEventsSheet: НЕ копирует заголовки
//      «Инструктажей» (форматы разошлись).
// 2) КЛИЕНТ (index.html): галочка строки блока «Повторные
//    инструктажи…» КАРТОЧКИ (toggleTrainingDone 0↔1), бейдж
//    «просрочен», приглушение выполненной строки; правка записи
//    сохраняет отметку (add+delete переносит «выполнение»).
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');
const CODE_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Code.gs'), 'utf8');

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

// ============================================================
// 1. SRC — сервер
// ============================================================
describe('Task 418 — SRC: сервер (WorkSchedule.gs)', () => {

    test('_trainingsSheetFormat: детектор формата по заголовкам', () => {
        const fn = stripComments(methodText(WS_SRC, '_trainingsSheetFormat'));
        assertTrue(WS_SRC.indexOf('_trainingsSheetFormat: function(sheet)') !== -1,
            'метод существует');
        assertTrue(fn.indexOf("'выполнение'") !== -1 &&
                    fn.indexOf("'дата_проведения'") !== -1 &&
                    fn.indexOf("'просрочен'") !== -1,
            'определяющие заголовки нового формата');
        assertTrue(fn.indexOf("'legacy'") !== -1,
            'легаси-формат — безопасный путь по умолчанию');
    });

    test('_readTrainingsSheet: ветка done — поля записи + запись обратно', () => {
        const fn = stripComments(methodText(WS_SRC, '_readTrainingsSheet'));
        // поля заявки
        assertTrue(fn.indexOf('дата_проведения:') !== -1 &&
                    fn.indexOf('выполнение:') !== -1 &&
                    fn.indexOf('просрочен:') !== -1,
            'записи несут дата_проведения/выполнение/просрочен');
        // совместимость (бейджи/окна/печать шахматки)
        assertTrue(fn.indexOf('длительность_дней: 1') !== -1,
            'длительность_дней = 1 (однодневность, Task 411)');
        // легаси-дата в F → выполнение 0
        assertTrue(fn.indexOf('parseInt(r[5], 10) === 1') !== -1,
            'F строго 1 → выполнение 1 (легаси-дата/мусор → 0)');
        // пересчёт просрочки при чтении
        assertTrue(fn.indexOf('_todayStart()') !== -1,
            'граница просрочки — сегодня');
        assertTrue(fn.indexOf('_writeBackDoneFlags') !== -1,
            'нормализация F/G пишется обратно в лист');
    });

    test('_writeBackDoneFlags: пакетная запись только при отличии', () => {
        const fn = stripComments(methodText(WS_SRC, '_writeBackDoneFlags'));
        assertTrue(fn.indexOf('if (!changed) return;') !== -1,
            'без изменений — записи нет');
        assertTrue(fn.indexOf('getRange(2, 6') !== -1 &&
                    fn.indexOf('getRange(2, 7') !== -1,
            'столбцы F (6) и G (7) одним пакетом на столбец');
        assertTrue(fn.indexOf('catch (e)') !== -1,
            'ошибка записи НЕ ломает чтение');
    });

    test('addTraining: done-формат — строка [id, таб, тип, тема, дата, выполнение, просрочен, комментарий]', () => {
        const fn = stripComments(methodText(WS_SRC, 'addTraining'));
        assertTrue(fn.indexOf('payload.выполнение') !== -1,
            'payload.выполнение — правка сохраняет отметку (заявка 418)');
        assertTrue(fn.indexOf('this._isTrainingLate(startDate, done)') !== -1,
            'просрочен пересчитывается при добавлении');
        assertTrue(fn.indexOf('sheetName !== this.EVENTS_SHEET') !== -1,
            '«Мероприятия» — всегда прежний формат');
    });

    test('setTrainingDone: эндпоинт отметки о выполнении', () => {
        const fn = stripComments(methodText(WS_SRC, 'setTrainingDone'));
        assertTrue(WS_SRC.indexOf('setTrainingDone: function(payload)') !== -1,
            'метод существует');
        assertTrue(fn.indexOf('parseInt(payload.выполнение, 10) === 1') !== -1,
            'значение отметки строго 0/1');
        assertTrue(fn.indexOf("'legacy_columns'") !== -1,
            'легаси-столбцы — понятная ошибка (без «выполнения»)');
        assertTrue(fn.indexOf('getRange(row, 6, 1, 2).setValues([[done, late]])') !== -1,
            'пишет F «выполнение» + G «просрочен» одной строкой');
        assertTrue(fn.indexOf("'not_found'") !== -1,
            'запись не найдена — ошибка');
        assertTrue(fn.indexOf('WORKSCHEDULE_SET_TRAINING_DONE') !== -1,
            'аудит отметки');
    });

    test('splitTrainingsSheet: конвертация done → прежний формат', () => {
        const fn = stripComments(methodText(WS_SRC, 'splitTrainingsSheet'));
        assertTrue(fn.indexOf('_trainingsSheetFormat(src)') !== -1,
            'формат источника определяется');
        assertTrue(fn.indexOf('vals[4], 1, vals[7]') !== -1,
            'F: дата_окончания = дата начала, G: длительность 1');
    });

    test('_ensureEventsSheet: заголовки «Инструктажей» НЕ копируются', () => {
        const fn = stripComments(methodText(WS_SRC, '_ensureEventsSheet'));
        assertTrue(fn.indexOf('this._getSheet(this.TRAININGS_SHEET)') === -1,
            'копирование строки-образца удалено (форматы разошлись)');
        assertTrue(fn.indexOf("'длительность_дней'") !== -1,
            'канонические ПРЕЖНИЕ заголовки «Мероприятий»');
    });

    test('док-блок: структура листа — новые столбцы', () => {
        assertTrue(WS_SRC.indexOf('E: дата_проведения (Date — дата ПЛАНИРУЕМОГО проведения)') !== -1,
            'E — дата_проведения');
        assertTrue(WS_SRC.indexOf('F: выполнение (int 0/1') !== -1,
            'F — выполнение');
        assertTrue(WS_SRC.indexOf('G: просрочен (int 0/1 — пересчитывается автоматически') !== -1,
            'G — просрочен');
    });
});

// ============================================================
// 2. SRC — клиент
// ============================================================
describe('Task 418 — SRC: клиент (index.html)', () => {

    // окно плоского списка b5 — между пустой строкой блока и
    // строкой «+ Инструктаж…»
    const flatStart = INDEX_SRC.indexOf('нет инструктажей и проверок знаний за год');
    const flatEnd = INDEX_SRC.indexOf('ws-emp-addins', flatStart);
    const FLAT = INDEX_SRC.slice(flatStart, flatEnd);

    test('галочка отметки в строках плоского списка карточки', () => {
        assertTrue(FLAT.indexOf('ws-done-chk') !== -1,
            'класс галочки в разметке');
        assertTrue(FLAT.indexOf('WorkSchedule.toggleTrainingDone(') !== -1,
            'onclick — toggleTrainingDone');
        assertTrue(FLAT.indexOf('ws-done-on') !== -1,
            'класс выполненной галочки');
        assertTrue(FLAT.indexOf('asBlocks && iTrId && withEdit') !== -1,
            'галочка интерактивна только в КАРТОЧКЕ с правом правки');
    });

    test('бейдж «просрочен» в строках плоского списка', () => {
        assertTrue(FLAT.indexOf('ws-late-tag') !== -1,
            'класс бейджа');
        assertTrue(FLAT.indexOf('просрочен</span>') !== -1,
            'текст бейджа — «просрочен»');
        assertTrue(FLAT.indexOf('it.просрочен !== undefined') !== -1,
            'поле листа приоритетно, расчёт по дате — фолбэк (старый сервер)');
    });

    test('выполненная строка приглушена (класс ws-row-done)', () => {
        assertTrue(FLAT.indexOf('ws-row-done') !== -1,
            'класс строки-состояния');
    });

    test('зритель: состояние отметки видно, но некликабельно', () => {
        assertTrue(FLAT.indexOf('ws-done-ro') !== -1,
            'класс только-для-чтения');
        assertTrue(FLAT.indexOf('title="Выполнено"') !== -1,
            'подсказка состояния');
    });

    test('toggleTrainingDone: метод и защита', () => {
        const fn = methodText(INDEX_SRC, 'toggleTrainingDone');
        assertTrue(fn.indexOf('if (!this._canEdit) return;') !== -1,
            'гейт уровня edit');
        assertTrue(fn.indexOf('this._TRAININGS, this._INSTR_ALL') !== -1 &&
                    fn.indexOf('this._EVENTS_ALL') !== -1,
            'пулы поиска (Task 427: фильтр инструктажных типов — id таблиц раздельные)');
        assertTrue(fn.indexOf("workSchedule.setTrainingDone'") !== -1,
            'вызов нового эндпоинта');
        assertTrue(fn.indexOf('self._apiErrText(err)') !== -1,
            'ошибка — тост с текстом сервера');
    });

    test('openTrainingForm: отметка правимой записи запоминается', () => {
        const fn = methodText(INDEX_SRC, 'openTrainingForm');
        assertTrue(fn.indexOf('_trEditDone = 0;') !== -1,
            'сброс при создании');
        assertTrue(fn.indexOf('parseInt(editTraining.выполнение, 10) === 1') !== -1,
            'значение из правимой записи');
    });

    test('submitTrainingForm: правка переносит отметку в новую строку', () => {
        const fn = methodText(INDEX_SRC, 'submitTrainingForm');
        assertTrue(fn.indexOf("payload['выполнение'] = this._trEditDone") !== -1,
            'payload.выполнение при правке (add новой + delete старой)');
        assertTrue(fn.indexOf('this._editTrainingId && this._trEditDone') !== -1,
            'только в режиме правки с отметкой');
    });

    test('CSS: галочка, бейдж, приглушение', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-done-chk {') !== -1,
            'стили галочки');
        assertTrue(INDEX_SRC.indexOf('.ws-done-chk.ws-done-on {') !== -1,
            'стили выполненной галочки');
        assertTrue(INDEX_SRC.indexOf('.ws-late-tag {') !== -1,
            'стили бейджа просрочки');
        assertTrue(INDEX_SRC.indexOf('.ws-wcard .ws-popup-row.ws-row-done') !== -1,
            'приглушение выполненной строки');
    });
});

// ============================================================
// 3. SRC — Code.gs: маршрут
// ============================================================
describe('Task 418 — SRC: Code.gs (маршрут)', () => {
    test('workSchedule.setTrainingDone маршрутизируется', () => {
        assertTrue(CODE_SRC.indexOf("case 'workSchedule.setTrainingDone':") !== -1,
            'case нового действия');
        assertTrue(CODE_SRC.indexOf('_json(WorkSchedule.setTrainingDone(payload))') !== -1,
            'вызов метода WorkSchedule.gs');
    });
});

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// ============================================================
// 4. GAS-VM — сервер (моки листов)
// ============================================================
describe('Task 418 — GAS-VM: сервер (моки листов)', () => {

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

    // Лист «Инструктажи» в НОВОМ формате заявки: заголовки
    // переименованы, ячейки — смесь легаси-значений и новых
    function doneSheets() {
        return {
            'Инструктажи': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
                 'выполнение', 'просрочен', 'комментарий'],
                // a) прошедшая дата, F — ЛЕГАСИ-дата (прежний
                //    «дата_окончания»), G — легаси «длительность» 1
                [5, '017', 'инструктаж', 'до 1000 В',
                 new Date(2026, 0, 15), new Date(2026, 0, 15), 1, ''],
                // b) будущая дата, отметки нет
                [6, '017', 'проверка_знаний', 'ОТ при работах на высоте',
                 new Date(2099, 11, 31), 0, 0, 'план'],
                // c) прошедшая дата С отметкой о выполнении
                [7, '023', 'инструктаж', 'по рабочим инструкциям ОТ',
                 new Date(2026, 1, 20), 1, 0, '']
            ]),
            'Мероприятия': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_начала',
                 'дата_окончания', 'длительность_дней', 'комментарий'],
                [10, '017', 'обучение', 'Курс АСУ ТП',
                 new Date(2026, 7, 5), new Date(2026, 7, 5), 1, 'внешний курс']
            ])
        };
    }

    function legSheets() {
        return {
            'Инструктажи': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_начала',
                 'дата_окончания', 'длительность_дней', 'комментарий'],
                [5, '017', 'инструктаж', 'до 1000 В',
                 new Date(2026, 0, 15), new Date(2026, 0, 15), 1, '']
            ])
        };
    }

    const byId = (arr, id) => arr.filter(r => r.id === id)[0];

    test('listTrainings: done-лист — поля и пересчёт «просрочен»', () => {
        const sheets = doneSheets();
        const WS = loadWS(sheets);
        const r = WS.listTrainings({ token: 't', year: 2026 });
        assertTrue(r.ok, 'ok');
        const a = byId(r.data.instrAll, 5);
        assertEqual(a.выполнение, 0, 'легаси-дата в F → выполнение 0');
        assertEqual(a.просрочен, 1, 'дата прошла, отметки нет → 1');
        assertEqual(a.дата_проведения, '2026-01-15', 'дата_проведения ISO');
        const b = byId(r.data.instrAll, 6);
        assertEqual(b.выполнение, 0, 'будущая — отметки нет');
        assertEqual(b.просрочен, 0, 'дата не прошла → 0');
        const c = byId(r.data.instrAll, 7);
        assertEqual(c.выполнение, 1, 'отметка стоит');
        assertEqual(c.просрочен, 0, 'отметка есть → не просрочен');
    });

    test('listTrainings: совместимые поля (бейджи/печать живы)', () => {
        const sheets = doneSheets();
        const WS = loadWS(sheets);
        const r = WS.listTrainings({ token: 't', year: 2026 });
        const a = byId(r.data.instrAll, 5);
        assertEqual(a.дата_начала, '2026-01-15', 'дата_начала = дата_проведения');
        assertEqual(a.дата_окончания, '2026-01-15', 'дата_окончания = дата_проведения');
        assertEqual(a.длительность_дней, 1, 'длительность 1 (Task 411)');
        // объединение с «Мероприятиями» (Task 405) — живо; запись b
        // (2099 год) вне годового среза — 2 «Инструктажа» + 1 событие
        assertEqual(r.data.trainings.length, 3,
            'годовой срез: 2 «Инструктажей» + 1 «Мероприятие»');
        const ev = byId(r.data.trainings, 10);
        assertFalse('выполнение' in ev,
            'записи «Мероприятий» полей отметки не несут');
    });

    test('чтение нормализует лист: легаси-дата в F → 0, G → пересчёт', () => {
        const sheets = doneSheets();
        const WS = loadWS(sheets);
        const t = sheets['Инструктажи'];
        WS.listTrainings({ token: 't', year: 2026 });
        const rowA = t.rows[1];
        assertEqual(rowA[5], 0, 'F легаси-дата заменена на 0');
        assertEqual(rowA[6], 1, 'G просрочен = 1 (дата прошла)');
        assertEqual(t.rows[2][5], 0, 'F будущей записи не тронута (уже 0)');
        assertEqual(t.rows[3][5], 1, 'F отметки не тронута (уже 1)');
        // повторное чтение ничего не пишет (значения уже корректны)
        const writes = t.writeCount;
        WS.listTrainings({ token: 't', year: 2026 });
        assertEqual(t.writeCount, writes,
            'нормализация идемпотентна — лишних записей нет');
    });

    test('легаси-лист: прежнее поведение чтения (без полей заявки)', () => {
        const sheets = legSheets();
        const WS = loadWS(sheets);
        const r = WS.listTrainings({ token: 't', year: 2026 });
        assertTrue(r.ok, 'ok');
        const a = byId(r.data.instrAll, 5);
        assertEqual(a.дата_начала, '2026-01-15', 'дата_начала читается');
        assertEqual(a.длительность_дней, 1, 'длительность читается');
        assertFalse('выполнение' in a, 'полей нового формата нет');
    });

    test('addTraining: done-лист — выполнение/просрочен в строке', () => {
        const sheets = doneSheets();
        const WS = loadWS(sheets);
        // прошедшая дата → просрочен 1
        const r = WS.addTraining({ token: 't', 'таб_номер': '017',
            тип: 'инструктаж', тема: 'по ГОСТ',
            дата_начала: '2026-02-01' });
        assertTrue(r.ok, 'ok');
        const row = sheets['Инструктажи'].rows[4];
        assertEqual(row[0], 8,
            'id 8 = max «Инструктажей» (7) + 1 — СВОЯ последовательность (Task 427; max «Мероприятий» 10 не мешает)');
        assertEqual(row[5], 0, 'новая запись — выполнение 0');
        assertEqual(row[6], 1, 'прошедшая дата → просрочен 1');
        // будущая дата → просрочен 0
        WS.addTraining({ token: 't', 'таб_номер': '017',
            тип: 'проверка_знаний', тема: 'по ПТЭ',
            дата_начала: '2099-06-01' });
        const row2 = sheets['Инструктажи'].rows[5];
        assertEqual(row2[5], 0, 'выполнение 0');
        assertEqual(row2[6], 0, 'будущая дата → просрочен 0');
    });

    test('addTraining: payload.выполнение=1 (правка) — отметка сохраняется', () => {
        const sheets = doneSheets();
        const WS = loadWS(sheets);
        const r = WS.addTraining({ token: 't', 'таб_номер': '017',
            тип: 'инструктаж', тема: 'по ГОСТ',
            дата_начала: '2026-02-01', выполнение: 1 });
        assertTrue(r.ok, 'ok');
        const row = sheets['Инструктажи'].rows[4];
        assertEqual(row[5], 1, 'выполнение = 1 (перенос правки)');
        assertEqual(row[6], 0, 'отметка есть → не просрочен');
    });

    test('addTraining: легаси-«Инструктажи» — прежняя строка (даты)', () => {
        const sheets = legSheets();
        const WS = loadWS(sheets);
        const r = WS.addTraining({ token: 't', 'таб_номер': '017',
            тип: 'инструктаж', тема: 'по ГОСТ', дата_начала: '2026-02-01',
            длительность_дней: 3, выполнение: 1 });
        assertTrue(r.ok, 'ok');
        const row = sheets['Инструктажи'].rows[2];
        assertTrue(row[5] instanceof Date,
            'F — дата_окончания (легаси-формат листа)');
        assertEqual(row[6], 3, 'G — длительность (легаси)');
    });

    test('setTrainingDone: отметить выполнение — просроченность снята', () => {
        const sheets = doneSheets();
        const WS = loadWS(sheets);
        // запись 5: дата прошла, выполнение 0 → просрочен 1
        const r = WS.setTrainingDone({ token: 't', id: 5, выполнение: 1 });
        assertTrue(r.ok, 'ok');
        assertEqual(r.data.выполнение, 1, 'выполнение = 1');
        assertEqual(r.data.просрочен, 0, 'отметка есть → просрочен 0');
        const row = sheets['Инструктажи'].rows[1];
        assertEqual(row[5], 1, 'F листа = 1');
        assertEqual(row[6], 0, 'G листа = 0');
    });

    test('setTrainingDone: снять отметку — просроченность вернулась', () => {
        const sheets = doneSheets();
        const WS = loadWS(sheets);
        // запись 7: дата прошла, выполнение 1 → снять
        const r = WS.setTrainingDone({ token: 't', id: 7, выполнение: 0 });
        assertTrue(r.ok, 'ok');
        assertEqual(r.data.выполнение, 0, 'выполнение = 0');
        assertEqual(r.data.просрочен, 1, 'дата прошла → просрочен 1');
        assertEqual(sheets['Инструктажи'].rows[3][5], 0, 'F листа = 0');
        assertEqual(sheets['Инструктажи'].rows[3][6], 1, 'G листа = 1');
    });

    test('setTrainingDone: снять отметку у будущей даты — просрочен 0', () => {
        const sheets = doneSheets();
        const WS = loadWS(sheets);
        sheets['Инструктажи'].rows[2][5] = 1; // будущая дата с отметкой
        const r = WS.setTrainingDone({ token: 't', id: 6, выполнение: 0 });
        assertTrue(r.ok, 'ok');
        assertEqual(r.data.просрочен, 0, 'дата не прошла → 0');
    });

    test('setTrainingDone: запись не найдена — not_found', () => {
        const sheets = doneSheets();
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 999, выполнение: 1 });
        assertFalse(r.ok, 'ошибка');
        assertEqual(r.error, 'not_found', 'код not_found');
    });

    test('setTrainingDone: легаси-столбцы — понятная ошибка', () => {
        const sheets = legSheets();
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 5, выполнение: 1 });
        assertFalse(r.ok, 'ошибка');
        assertEqual(r.error, 'legacy_columns', 'код legacy_columns');
        assertTrue(!!r.message && r.message.indexOf('дата_проведения') !== -1,
            'сообщение называет нужные столбцы');
    });

    test('setTrainingDone: листа нет — sheet_not_found', () => {
        const WS = loadWS({});
        const r = WS.setTrainingDone({ token: 't', id: 5, выполнение: 1 });
        assertFalse(r.ok, 'ошибка');
        assertEqual(r.error, 'sheet_not_found: Инструктажи', 'код с именем листа');
    });

    test('splitTrainingsSheet: done-строки конвертируются в прежний формат', () => {
        const sheets = doneSheets();
        // «обучение» в done-«Инструктажах» — кандидат на перенос
        sheets['Инструктажи'].rows.push(
            [8, '023', 'обучение', 'Курс КИП', new Date(2026, 4, 10), 0, 1, '']);
        const WS = loadWS(sheets);
        const r = WS.splitTrainingsSheet();
        assertTrue(r.ok && r.moved === 1, 'перенесена 1 строка');
        const dst = sheets['Мероприятия'];
        const row = dst.rows[dst.rows.length - 1];
        assertEqual(row[0], 8, 'id сохранён');
        assertEqual(row[2], 'обучение', 'тип');
        assertTrue(row[4] instanceof Date, 'E — дата начала (Date)');
        // F = дата окончания (НЕ 0/1!), G = длительность 1 (НЕ флаги!)
        assertEqual(String(row[5]), String(row[4]),
            'F — дата_окончания = дата начала (конвертация)');
        assertEqual(row[6], 1, 'G — длительность 1 день');
    });

    test('_trainingsSheetFormat: переименованный лист — done (регистр/пробелы)', () => {
        const sheets = {
            'Инструктажи': new MockSheet([
                ['ID', 'таб_номер', 'тип', 'тема',
                 ' Дата_проведения ', 'Выполнение', 'Просрочен', 'комментарий']
            ])
        };
        const WS = loadWS(sheets);
        assertEqual(WS._trainingsSheetFormat(sheets['Инструктажи']), 'done',
            'заголовки распознаются толерантно');
        const leg = legSheets();
        assertEqual(WS._trainingsSheetFormat(leg['Инструктажи']), 'legacy',
            'прежние заголовки — legacy');
        assertEqual(WS._trainingsSheetFormat(leg['Мероприятия'] || new MockSheet([['id']])), 'legacy',
            'пустые/чужие заголовки — legacy');
    });
});

// ============================================================
// 5. VM — клиент: toggleTrainingDone
// ============================================================
describe('Task 418 — VM: WorkSchedule.toggleTrainingDone', () => {

    function loadToggle() {
        const m = extractMethod(INDEX_SRC, 'toggleTrainingDone');
        if (!m) throw new Error('toggleTrainingDone не найден');
        return new Function('return ({' + m + '}).toggleTrainingDone;')();
    }

    function isoToday() {
        const n = new Date();
        return n.getFullYear() + '-' +
            (n.getMonth() + 1 < 10 ? '0' + (n.getMonth() + 1) : String(n.getMonth() + 1)) +
            '-' + (n.getDate() < 10 ? '0' + n.getDate() : String(n.getDate()));
    }

    function makeCtx(rec) {
        const ctx = {
            _canEdit: true,
            _isInstrType: function(тип) {
                var t = String(тип || '').trim().toLowerCase()
                           .replace(/\s+/g, '_');
                return t === 'инструктаж' || t === 'проверка_знаний';
            },
            _TRAININGS: [],
            _INSTR_ALL: [rec],
            _EVENTS_ALL: [],
            __calls: { api: [], renders: 0 },
            _api: function(action, payload) {
                ctx.__calls.api.push({ action: action, payload: payload });
                return Promise.resolve(
                    { data: { id: rec.id, выполнение: 1, просрочен: 0 } });
            },
            _renderWorkersIfOpen: function() { ctx.__calls.renders++; },
            _isoDate: function() { return isoToday(); },
            _apiErrText: function(e) { return e && e.message; }
        };
        return ctx;
    }

    test('отметка: API вызван, запись обновлена, карточка перерисована', async () => {
        const rec = { id: 5, 'таб_номер': '017', тип: 'инструктаж',
                      тема: 'до 1000 В', дата_начала: '2026-01-15',
                      выполнение: 0, просрочен: 1 };
        const ctx = makeCtx(rec);
        await loadToggle().call(ctx, 5);
        assertEqual(ctx.__calls.api.length, 1, 'один вызов API');
        assertEqual(ctx.__calls.api[0].action, 'workSchedule.setTrainingDone',
            'действие нового эндпоинта');
        assertEqual(ctx.__calls.api[0].payload.выполнение, 1,
            'переключение 0 → 1');
        assertEqual(ctx.__calls.api[0].payload.id, 5, 'id записи');
        assertEqual(rec.выполнение, 1, 'локальная запись обновлена');
        assertEqual(rec.просрочен, 0, 'просрочен пересчитан из ответа');
        assertEqual(ctx.__calls.renders, 1,
            'страница «Работники» перерисована');
    });

    test('снятие отметки: 1 → 0, просроченность из ответа сервера', async () => {
        const rec = { id: 7, 'таб_номер': '023', тип: 'инструктаж',
                      тема: 'по ОТ', дата_начала: '2026-01-15',
                      выполнение: 1, просрочен: 0 };
        const ctx = makeCtx(rec);
        ctx._api = function(action, payload) {
            ctx.__calls.api.push({ action: action, payload: payload });
            return Promise.resolve(
                { data: { id: 7, выполнение: 0, просрочен: 1 } });
        };
        await loadToggle().call(ctx, 7);
        assertEqual(ctx.__calls.api[0].payload.выполнение, 0,
            'переключение 1 → 0');
        assertEqual(rec.выполнение, 0, 'локально 0');
        assertEqual(rec.просрочен, 1, 'просрочен = 1 (дата прошла)');
    });

    test('старый сервер (пустой ответ): фолбэк-расчёт просрочки', async () => {
        const rec = { id: 5, 'таб_номер': '017', тип: 'инструктаж',
                      тема: 'до 1000 В', дата_начала: '2026-01-15',
                      выполнение: 0, просрочен: 1 };
        const ctx = makeCtx(rec);
        ctx._api = function(action, payload) {
            ctx.__calls.api.push({ action: action, payload: payload });
            return Promise.resolve({});
        };
        await loadToggle().call(ctx, 5);
        assertEqual(rec.выполнение, 1, 'локально 1');
        assertEqual(rec.просрочен, 0, 'выполнено → не просрочен');
    });

    test('зритель (_canEdit=false): вызова API нет', async () => {
        const rec = { id: 5, выполнение: 0 };
        const ctx = makeCtx(rec);
        ctx._canEdit = false;
        await loadToggle().call(ctx, 5);
        assertEqual(ctx.__calls.api.length, 0, 'гейт уровня edit');
        assertEqual(rec.выполнение, 0, 'запись не тронута');
    });

    test('запись не найдена: вызова API нет', async () => {
        const rec = { id: 5, выполнение: 0 };
        const ctx = makeCtx(rec);
        await loadToggle().call(ctx, 999);
        assertEqual(ctx.__calls.api.length, 0, 'нет вызова без записи');
    });

    test('ошибка сервера: промис не падает, тост через _apiErrText', async () => {
        const rec = { id: 5, тип: 'инструктаж', выполнение: 0, просрочен: 1 };
        const ctx = makeCtx(rec);
        ctx._api = function() {
            return Promise.reject(new Error('legacy_columns'));
        };
        let errShown = null;
        ctx.__calls.errText = null;
        ctx._apiErrText = function(e) { ctx.__calls.errText = e.message; return e.message; };
        const KipToast = { show: function(t) { errShown = t; } };
        // тост живёт в глобальной области страницы — подменяем на время
        global.KipToast = KipToast;
        try {
            await loadToggle().call(ctx, 5);
        } finally {
            delete global.KipToast;
        }
        assertEqual(ctx.__calls.errText, 'legacy_columns',
            'текст ошибки сервера пробрасывается');
        assertTrue(errShown !== null && errShown.indexOf('legacy_columns') !== -1,
            'тост показан: ' + errShown);
        assertEqual(rec.выполнение, 0, 'запись не изменилась');
    });
});

// ============================================================
// 6. SW — версия кэша
// ============================================================
describe('Task 418 — SW: версия кэша', () => {
    test('CACHE_VERSION = kipia-test-v742', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v742'") !== -1,
            'SW v645 (Task 418)');
        assertTrue(SW_SRC.indexOf('kipia-test-v743') === -1,
            'двойной бамп отсутствует');
    });
});
