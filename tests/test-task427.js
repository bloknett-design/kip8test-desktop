// ============================================================
// Task 427 — заявка (kip8test): «При создании новых строк в
// таблицах Инструктажи и Мероприятия, столбец id в них
// заполняется общей последовательностью по нарастанию значений,
// нарастание номеров id в них должно быть раздельным, значит где
// то в коде эти разделы до сих пор перекликаются. Проверь,
// исправь, должно быть полное разделение между разделами
// инструктажей и мероприятий, в том числе формирование порядковых
// номеров id новых строк в таблицах».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   СЕРВЕР (SRC):
//   1) addTraining: id = максимум СВОЕГО листа + 1 — кросс-максимум
//      по чужому листу (evMaxId) удалён;
//   2) _autoCreateNextTrainings: нумерация ТОЛЬКО «Инструктажей»;
//   3) deleteTraining: флаг «инстр» (0|1) — семейство типа записи
//      адресует лист и ПРОВЕРЯЕТ тип строки (коллизии id
//      разноимённых листов не снимают чужую строку);
//   4) srvVer '427';
//   5) регресс: правила автосоздания инструктажей 419..423 и
//      стоп-правило мероприятий 425 живы (инструктажи не тронуты).
//   КЛИЕНТ (SRC):
//   6) editTraining/deleteTraining принимают семейство записи
//      (кнопки блоков/попапов передают флаг);
//   7) toggleTrainingDone — только инструктажные типы (галочка);
//   8) _wtabYearRecords — дедуп по семейству ('i'/'e');
//   9) правка (add+delete) передаёт инстр: oldFam;
//  10) порог предупреждения srvVer < 427.
//   GAS-VM (сервер):
//  11) ГЛАВНЫЙ: раздельные последовательности id — max листов
//      разные (5 и 2) → инструктаж id 6, обучение id 3 (НЕ 7);
//  12) автосоздание отметкой общего: id 21/22 при «Мероприятиях»
//      с id 99 (максимум чужого листа НЕ мешает);
//  13) deleteTraining при коллизии id в обоих листах — семейство
//      выбирает СВОЮ строку; легаси-мероприятие в «Инструктажах»
//      удаляется по инстр=0; без флага — прежний порядок;
//  14) регресс 421/423/425: общий → ОБЕ записи; мероприятие —
//      без автосоздания.
//   VM (клиент):
//  15) _wtabYearRecords: одинаковые id разных листов — ДВЕ записи
//      (раньше одна «съедалась» дедупом);
//  16) editTraining(id, fam): семейство выбирает запись
//      (мероприятие id 5 в _TRAININGS больше не перехватывает
//      инструктаж id 5);
//  17) _doDeleteTraining: API payload несёт инстр;
//  18) toggleTrainingDone: помечается ТОЛЬКО копия инструктажа.
//   SW: kipia-test-v753.
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
// 1. SRC — сервер: раздельная нумерация id
// ============================================================
describe('Task 427 — SRC: сервер (раздельные последовательности id)', () => {

    test('addTraining: id — максимум СВОЕГО листа + 1', () => {
        const fn = stripComments(methodText(WS_SRC, 'addTraining'));
        assertTrue(fn.indexOf('this._maxTrainingsId(sheet) + 1') !== -1,
            'id = max листа записи + 1 (заявка: раздельное нарастание)');
        assertTrue(fn.indexOf('evMaxId') === -1,
            'кросс-максимум «Мероприятий» удалён (общая последовательность отменена)');
    });

    test('_autoCreateNextTrainings: нумерация ТОЛЬКО «Инструктажей»', () => {
        const fn = stripComments(methodText(WS_SRC, '_autoCreateNextTrainings'));
        assertTrue(fn.indexOf('var maxId = this._maxTrainingsId(sheet);') !== -1,
            'максимум листа «Инструктажей» (автосоздание пишет только туда)');
        assertTrue(fn.indexOf('this._maxTrainingsId(this._getSheet(this.EVENTS_SHEET))') === -1,
            'чужой лист больше не участвует');
    });

    test('deleteTraining: семейство типа записи адресует строку (флаг инстр)', () => {
        const fn = stripComments(methodText(WS_SRC, 'deleteTraining'));
        assertTrue(fn.indexOf("parseInt(payload.инстр, 10)") !== -1,
            'флаг «инстр» из payload клиента');
        assertTrue(fn.indexOf('this.TRAINING_EVENTSHEET_TYPES[rowTip]') !== -1,
            'тип строки (столбец C) проверяется по семейству');
        assertTrue(fn.indexOf('[this.EVENTS_SHEET, this.TRAININGS_SHEET]') !== -1,
            'мероприятие — свой лист ПЕРВЫМ (легаси в «Инструктажах» — фолбэком)');
        assertTrue(fn.indexOf('this.TRAININGS_SHEET, this.EVENTS_SHEET') !== -1,
            'инструктаж/без флага — прежний порядок листов');
    });

    test('srvVer 427 — версия сервера в ответе setTrainingDone', () => {
        const fn = stripComments(methodText(WS_SRC, 'setTrainingDone'));
        assertTrue(fn.indexOf("srvVer: '427'") !== -1,
            'srvVer 427 (Task 427: раздельные последовательности id)');
        assertTrue(fn.indexOf("srvVer: '426'") === -1,
            'старой версии в коде нет');
    });

    test('регресс: правила инструктажей 419..425 живы (инструктажи менять не нужно)', () => {
        const fn = stripComments(methodText(WS_SRC, '_autoCreateNextTrainings'));
        assertTrue(fn.indexOf('per > 0 && !parentItem') !== -1,
            'правило 1 — новый срок пункта (периодичность N)');
        assertTrue(fn.indexOf('children.length') !== -1,
            'правило 2 — дети отмеченного пункта (9-ОГЭ +3 мес, Task 421/423)');
        assertTrue(fn.indexOf('TRAINING_EVENTSHEET_TYPES[tipKey]') !== -1,
            'стоп-правило мероприятий (Task 425) — раньше правил');
        const stop = fn.indexOf('TRAINING_EVENTSHEET_TYPES[tipKey]');
        const rule1 = fn.indexOf('per > 0 && !parentItem');
        assertTrue(stop !== -1 && rule1 !== -1 && stop < rule1,
            'стоп-правило срабатывает РАНЬШЕ правил автосоздания');
    });
});

// ============================================================
// 2. SRC — клиент: семейство записи в адресации id
// ============================================================
describe('Task 427 — SRC: клиент (адресация id по семейству)', () => {

    test('кнопки ✎/✕ передают семейство записи', () => {
        // Task 488: попап дня («Мероприятия в этот день») стал
        // чисто текстовым (заявка «кнопка отметки осталась») —
        // семейство записи в нём НЕ адресуется; правка/отметка —
        // только из карточек (остальные четыре адресата ниже)
        const epDay = INDEX_SRC.slice(
            INDEX_SRC.indexOf('_renderEventsPopup: function'),
            INDEX_SRC.indexOf('_openCellPopup: function'));
        assertTrue(epDay.indexOf('deFam') === -1,
            'попап дня: семейство записи не адресуется (Task 488)');
        assertTrue(epDay.indexOf('deId') === -1,
            'попап дня: id записи не адресуется (Task 488)');
        assertTrue(INDEX_SRC.indexOf(
            'var trFam = this._isInstrType(t.тип) ? 1 : 0;') !== -1,
            'блок «Мероприятия» карточки: семейство записи');
        assertTrue(INDEX_SRC.indexOf(
            'var iTrFam = this._isInstrType(it.тип) ? 1 : 0;') !== -1,
            'плоский список инструктажей: семейство записи');
        assertTrue(INDEX_SRC.indexOf(
            'var rFam = this._isInstrType(gr.тип) ? 1 : 0;') !== -1,
            'группы шаблона: семейство записи');
        assertTrue(INDEX_SRC.indexOf(
            'var oFam = this._isInstrType(ot.тип) ? 1 : 0;') !== -1,
            '«вне списка»: семейство записи');
        assertTrue(INDEX_SRC.indexOf(
            "WorkSchedule.editTraining(' + trId + ', ' + trFam + ')") !== -1,
            '✎ передаёт флаг семейства');
        assertTrue(INDEX_SRC.indexOf(
            "WorkSchedule.deleteTraining(' + trId + ', ' + trFam + ')") !== -1,
            '✕ передаёт флаг семейства');
    });

    test('editTraining: поиск по id + семейство (fam)', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'editTraining'));
        assertTrue(fn.indexOf('editTraining: function(id, fam)') !== -1,
            'параметр fam (0|1)');
        assertTrue(fn.indexOf('this._isInstrType(arr[i].тип) !== useFam') !== -1,
            'запись другого семейства с тем же id не перехватывается');
    });

    test('deleteTraining/_doDeleteTraining: флаг семейства в payload', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_doDeleteTraining'));
        assertTrue(fn.indexOf('pl.инстр') !== -1,
            'payload несёт инстр (0|1) — сервер адресует лист');
        const dt = stripComments(methodText(INDEX_SRC, 'deleteTraining'));
        assertTrue(dt.indexOf('deleteTraining: function(id, fam)') !== -1,
            'параметр fam');
        assertTrue(dt.indexOf('_doDeleteTraining(id, fam)') !== -1,
            'флаг пробрасывается в вызов');
    });

    test('toggleTrainingDone: только инструктажные типы', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'toggleTrainingDone'));
        assertEqual((fn.match(
            /if \(!this\._isInstrType\(arr\[i\]\.тип\)\) continue;/g) || []).length >= 1,
            true, 'поиск записи — фильтр инструктажных типов');
        assertEqual((fn.match(
            /if \(!self\._isInstrType\(arr\[i\]\.тип\)\) continue;/g) || []).length,
            1, 'обновление копий — фильтр инструктажных типов');
        assertEqual((fn.match(
            /if \(!self\._isInstrType\(uarr\[ui\]\.тип\)\) continue;/g) || []).length,
            1, 'покрытые дети — фильтр инструктажных типов');
    });

    test('_wtabYearRecords: дедуп ключа по семейству типа', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_wtabYearRecords'));
        assertTrue(fn.indexOf("this._isInstrType(r.тип) ? 'i' + id : 'e' + id") !== -1,
            'одинаковые id инструктажа и мероприятия — ДВЕ записи, не дубль');
    });

    test('правка (add+delete): старая строка адресуется семейством её типа', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'submitTrainingForm'));
        assertTrue(fn.indexOf(
            'var oldFam = this._isInstrType(this._trEditType) ? 1 : 0;') !== -1,
            'семейство исходной записи (тип в правке мог смениться внутри семейства)');
        assertTrue(fn.indexOf('инстр: oldFam') !== -1,
            'delete старой строки несёт флаг');
    });

    test('порог предупреждения «старый сервер» — srvVer < 427', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'toggleTrainingDone'));
        assertTrue(fn.indexOf('parseInt(d.srvVer, 10) < 427') !== -1,
            'сквозная нумерация id (сервер до 427) — тоже старый сервер');
    });
});

// ============================================================
// 3. GAS-VM — сервер: раздельные id на моках листов
// ============================================================
describe('Task 427 — GAS-VM: раздельные последовательности id', () => {

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
    const TR_HEAD = ['id', 'таб_номер', 'тип', 'тема', 'дата_проведения',
                     'выполнение', 'просрочен', 'комментарий'];
    const EV_HEAD = ['id', 'таб_номер', 'тип', 'тема', 'дата_начала',
                     'дата_окончания', 'длительность_дней', 'комментарий'];

    function etalonSheets() {
        return {
            'Список_И_и_ПЗ': new MockSheet([
                ['название', 'вид', 'периодичность', 'основание', 'сокращение'],
                [U_OT, 'инструктаж', 6, '', 'раб. инстр. ОТ'],
                [U_OGE, 'инструктаж', 3, '', '9-ОГЭ']
            ])
        };
    }

    test('ГЛАВНЫЙ: id РАЗДЕЛЬНЫЕ — max «Инструктажей» 5, max «Мероприятий» 2', () => {
        const sheets = {
            'Инструктажи': new MockSheet([TR_HEAD,
                [1, '017', 'инструктаж', U_OT, new Date(2026, 8, 1), 0, 0, ''],
                [5, '017', 'инструктаж', U_OT, new Date(2026, 8, 10), 0, 0, '']
            ]),
            'Мероприятия': new MockSheet([EV_HEAD,
                [1, '017', 'обучение', 'Курс', new Date(2026, 7, 5),
                 new Date(2026, 7, 5), 1, ''],
                [2, '018', 'прогул', 'Прогул', new Date(2026, 7, 12),
                 new Date(2026, 7, 12), 1, '']
            ])
        };
        const WS = loadWS(sheets);
        // новый ИНСТРУКТАЖ: 5 + 1 = 6 (НЕ 2 + 1 = 3 и НЕ общий max 5 + 1)
        const r1 = WS.addTraining({ token: 't', 'таб_номер': '017',
            'тип': 'инструктаж', 'тема': U_OT, 'дата_начала': '2026-09-15' });
        assertTrue(r1.ok && r1.data.id === 6,
            'инструктаж id 6 = max «Инструктажей» (5) + 1');
        // новое МЕРОПРИЯТИЕ: 2 + 1 = 3 (НЕ 6 + 1 = 7 общей последовательностью)
        const r2 = WS.addTraining({ token: 't', 'таб_номер': '017',
            'тип': 'обучение', 'тема': 'Стажировка', 'дата_начала': '2026-09-16' });
        assertTrue(r2.ok && r2.data.id === 3,
            'мероприятие id 3 = max «Мероприятий» (2) + 1 — РАЗДЕЛЬНОЕ нарастание');
        // строки лежат в СВОИХ листах
        assertEqual(sheets['Инструктажи'].rows.length, 4,
            'новый инструктаж — в «Инструктажах» (3+1)');
        assertEqual(sheets['Мероприятия'].rows.length, 4,
            'новое мероприятие — в «Мероприятиях» (3+1)');
    });

    test('автосоздание отметкой общего: id 21/22 при «Мероприятиях» с id 99', () => {
        const sheets = etalonSheets();
        sheets['Инструктажи'] = new MockSheet([TR_HEAD,
            [20, '017', 'инструктаж', U_OT, new Date(2026, 8, 1), 0, 0, '']
        ]);
        sheets['Мероприятия'] = new MockSheet([EV_HEAD,
            [99, '017', 'обучение', 'Курс', new Date(2026, 7, 5),
             new Date(2026, 7, 5), 1, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 20, 'выполнение': 1 });
        assertEqual(r.data.created.length, 2,
            'созданы ОБЕ записи (регресс 421/423)');
        assertEqual(r.data.created[0].id, 21,
            'id 21 = max «Инструктажей» (20) + 1 — max «Мероприятий» (99) НЕ мешает');
        assertEqual(r.data.created[1].id, 22, 'id 22 — следующий СВОЕЙ последовательности');
        assertEqual(r.data.srvVer, '427', 'версия сервера Task 427');
    });

    test('регресс 425: отметка легаси-«обучения» — автосоздания нет', () => {
        const sheets = etalonSheets();
        sheets['Инструктажи'] = new MockSheet([TR_HEAD,
            [30, '017', 'обучение', U_OT, new Date(2026, 8, 1), 0, 0, '']
        ]);
        const WS = loadWS(sheets);
        const r = WS.setTrainingDone({ token: 't', id: 30, 'выполнение': 1 });
        assertEqual(r.data.created.length, 0,
            'мероприятие — без автосоздания (Task 425 жив)');
    });

    test('deleteTraining: КОЛЛИЗИЯ id — семейство выбирает СВОЮ строку', () => {
        // (a) инстр=1 — удаляется ИНСТРУКТАЖ, мероприятие id 7 живо
        const sheetsA = {
            'Инструктажи': new MockSheet([TR_HEAD,
                [7, '017', 'инструктаж', U_OT, new Date(2026, 8, 1), 0, 0, '']
            ]),
            'Мероприятия': new MockSheet([EV_HEAD,
                [7, '017', 'обучение', 'Курс', new Date(2026, 7, 5),
                 new Date(2026, 7, 5), 1, '']
            ])
        };
        const WSA = loadWS(sheetsA);
        const ra = WSA.deleteTraining({ token: 't', id: 7, инстр: 1 });
        assertTrue(ra.ok, 'инстр=1: строка найдена');
        assertEqual(sheetsA['Инструктажи'].rows.length, 1,
            'инструктаж id 7 удалён (остался только заголовок)');
        assertEqual(sheetsA['Мероприятия'].rows.length, 2,
            'мероприятие id 7 ЖИВО — чужой id не снимается');

        // (b) инстр=0 — удаляется МЕРОПРИЯТИЕ, инструктаж id 7 жив
        const sheetsB = {
            'Инструктажи': new MockSheet([TR_HEAD,
                [7, '017', 'инструктаж', U_OT, new Date(2026, 8, 1), 0, 0, '']
            ]),
            'Мероприятия': new MockSheet([EV_HEAD,
                [7, '017', 'обучение', 'Курс', new Date(2026, 7, 5),
                 new Date(2026, 7, 5), 1, '']
            ])
        };
        const WSB = loadWS(sheetsB);
        const rb = WSB.deleteTraining({ token: 't', id: 7, инстр: 0 });
        assertTrue(rb.ok, 'инстр=0: строка найдена');
        assertEqual(sheetsB['Мероприятия'].rows.length, 1,
            'мероприятие id 7 удалено');
        assertEqual(sheetsB['Инструктажи'].rows.length, 2,
            'инструктаж id 7 ЖИВ');
    });

    test('deleteTraining: легаси-«обучение» в «Инструктажах» — инстр=0', () => {
        const sheets = {
            'Инструктажи': new MockSheet([TR_HEAD,
                [30, '017', 'обучение', 'Курс ОТ', new Date(2026, 8, 1), 0, 0, '']
            ]),
            'Мероприятия': new MockSheet([EV_HEAD,
                [31, '018', 'прогул', 'Прогул', new Date(2026, 7, 12),
                 new Date(2026, 7, 12), 1, '']
            ])
        };
        const WS = loadWS(sheets);
        const r = WS.deleteTraining({ token: 't', id: 30, инстр: 0 });
        assertTrue(r.ok, 'легаси-мероприятие найдено');
        assertEqual(sheets['Инструктажи'].rows.length, 1,
            'легаси-строка обучение удалена из «Инструктажей»');
        assertEqual(sheets['Мероприятия'].rows.length, 2,
            '«Мероприятия» не тронуты (id 31 ≠ 30)');
    });

    test('deleteTraining: БЕЗ флага — прежний порядок (старый клиент)', () => {
        const sheets = {
            'Инструктажи': new MockSheet([TR_HEAD,
                [7, '017', 'инструктаж', U_OT, new Date(2026, 8, 1), 0, 0, '']
            ]),
            'Мероприятия': new MockSheet([EV_HEAD,
                [8, '017', 'обучение', 'Курс', new Date(2026, 7, 5),
                 new Date(2026, 7, 5), 1, '']
            ])
        };
        const WS = loadWS(sheets);
        // id только в «Мероприятиях» — находится фолбэком порядка
        const r = WS.deleteTraining({ token: 't', id: 8 });
        assertTrue(r.ok, 'без флага: id 8 найден');
        assertEqual(sheets['Мероприятия'].rows.length, 1, 'мероприятие удалено');
        assertEqual(sheets['Инструктажи'].rows.length, 2, '«Инструктажи» живы');
    });
});

// ============================================================
// 4. VM — клиент: коллизии id в пулах
// ============================================================
describe('Task 427 — VM: клиент (семейство решает коллизии id)', () => {

    function loadFn(name) {
        const m = extractMethod(INDEX_SRC, name);
        if (!m) throw new Error('метод не найден: ' + name);
        return new Function('return ({' + m + '}).' + name + ';')();
    }

    function isInstrType(t) {
        return t === 'инструктаж' || t === 'проверка_знаний';
    }

    test('_wtabYearRecords: одинаковые id разных листов — ДВЕ записи', () => {
        const host = {
            _INSTR_ALL: [{ id: 5, 'таб_номер': '017', тип: 'инструктаж',
                           тема: 'Инстр', дата_начала: '2026-03-01',
                           дата_окончания: '2026-03-01' }],
            _EVENTS_ALL: [{ id: 5, 'таб_номер': '017', тип: 'обучение',
                            тема: 'Курс', дата_начала: '2026-05-10',
                            дата_окончания: '2026-05-10' }],
            _TRAININGS: [],
            _isInstrType: isInstrType
        };
        const r = loadFn('_wtabYearRecords').call(host, '017', 2026);
        assertEqual(r.ins.length, 1, 'инструктаж id 5 в выдаче');
        assertEqual(r.evs.length, 1,
            'мероприятие id 5 ТОЖЕ в выдаче (до Task 427 «съедалось» дедупом)');
        assertEqual(r.ins[0].тема, 'Инстр', 'правильная запись в ins');
        assertEqual(r.evs[0].тема, 'Курс', 'правильная запись в evs');
    });

    test('editTraining(id, fam): семейство выбирает запись (мероприятие в _TRAININGS не перехватывает)', () => {
        // годовой срез _TRAININGS несёт записи ОБОИХ листов: событие
        // id 5 (курс) и инструктаж id 5 живут в РАЗНЫХ таблицах;
        // архивы: _EVENTS_ALL — копия курса id 5 + прогул id 6
        const kursInSlice = { id: 5, 'таб_номер': '017', тип: 'обучение',
                              тема: 'Курс', дата_начала: '2026-05-10',
                              дата_окончания: '2026-05-10' };
        const instrRec = { id: 5, 'таб_номер': '017', тип: 'инструктаж',
                           тема: 'Инстр', дата_начала: '2026-03-01',
                           дата_окончания: '2026-03-01' };
        const prgRec = { id: 6, 'таб_номер': '017', тип: 'прогул',
                         тема: 'Прогул', дата_начала: '2026-06-01',
                         дата_окончания: '2026-06-01' };
        function mkHost() {
            return {
                _canEdit: true,
                _TRAININGS: [kursInSlice],
                _INSTR_ALL: [instrRec],
                _EVENTS_ALL: [kursInSlice, prgRec],
                _isInstrType: isInstrType,
                closeCellPopup: function() {},
                closeEmpPopup: function() {},
                openTrainingForm: function(a, b, rec) { this.__opened = rec; }
            };
        }
        const h1 = mkHost();
        loadFn('editTraining').call(h1, 5, 1);
        assertEqual(h1.__opened, instrRec,
            'fam=1: найден ИНСТРУКТАЖ id 5 (событие id 5 в _TRAININGS первым по пулам — не перехватило)');

        const h2 = mkHost();
        loadFn('editTraining').call(h2, 5, 0);
        assertTrue(h2.__opened && h2.__opened.тема === 'Курс',
            'fam=0: найдено МЕРОПРИЯТИЕ id 5 (курс)');

        const h3 = mkHost();
        loadFn('editTraining').call(h3, 6, 0);
        assertEqual(h3.__opened, prgRec, 'fam=0: прогул id 6 найден');

        const h4 = mkHost();
        loadFn('editTraining').call(h4, 5);
        assertTrue(h4.__opened && h4.__opened.тема === 'Курс',
            'без флага (старый вызов) — прежний порядок пулов: первый id 5');
    });

    test('_doDeleteTraining: API payload несёт инстр', async () => {
        const calls = [];
        const host = {
            _canEdit: true,
            _api: function(action, payload) {
                calls.push({ action: action, payload: payload });
                return Promise.resolve({ data: { id: payload.id } });
            },
            loadGrid: function() {},
            _apiErrText: function() { return ''; }
        };
        global.KipToast = { show: function() {} };
        try {
            await loadFn('_doDeleteTraining').call(host, 5, 0);
            await loadFn('_doDeleteTraining').call(host, 7, 1);
            await loadFn('_doDeleteTraining').call(host, 9);
        } finally {
            delete global.KipToast;
        }
        assertEqual(calls.length, 3, 'три вызова API');
        assertEqual(calls[0].payload.инстр, 0, 'мероприятие: инстр 0');
        assertEqual(calls[1].payload.инстр, 1, 'инструктаж: инстр 1');
        assertEqual(calls[2].payload.инстр, undefined,
            'без флага — поле не отправляется (старый путь)');
    });

    test('toggleTrainingDone: помечается ТОЛЬКО копия инструктажа', async () => {
        const instrRec = { id: 5, 'таб_номер': '017', тип: 'инструктаж',
                           тема: 'Инстр', дата_начала: '2026-03-01',
                           выполнение: 0, просрочен: 0 };
        const evInSlice = { id: 5, 'таб_номер': '017', тип: 'обучение',
                            тема: 'Курс', дата_начала: '2026-05-10',
                            выполнение: 0, просрочен: 0 };
        const evRec = { id: 5, 'таб_номер': '017', тип: 'прогул',
                        тема: 'Прогул', дата_начала: '2026-06-01',
                        выполнение: 0, просрочен: 0 };
        const self = {
            _canEdit: true,
            _TRAININGS: [evInSlice],
            _INSTR_ALL: [instrRec],
            _EVENTS_ALL: [evRec],
            _isInstrType: isInstrType,
            _year: 2026,
            _renderWorkersIfOpen: function() {},
            _isoDate: function() { return '2026-09-27'; },
            _fmtDateRu: function(iso) {
                return String(iso).split('-').reverse().join('.');
            },
            _apiErrText: function() { return ''; }
        };
        self._api = function() {
            return Promise.resolve({
                data: { id: 5, 'выполнение': 1, 'просрочен': 0,
                        srvVer: '427', autoNote: '', created: [],
                        updated: [], skipped: [] }
            });
        };
        global.KipToast = { show: function() {} };
        let logged = null;
        const origLog = console.log;
        console.log = function() { logged = true; };
        try {
            await loadFn('toggleTrainingDone').call(self, 5);
        } finally {
            delete global.KipToast;
            console.log = origLog;
        }
        void logged;
        assertEqual(instrRec.выполнение, 1,
            'копия инструктажа id 5 в _INSTR_ALL отмечена');
        assertEqual(evInSlice.выполнение, 0,
            'мероприятие id 5 в годовом срезе _TRAININGS НЕ отмечено');
        assertEqual(evRec.выполнение, 0,
            'мероприятие id 5 в _EVENTS_ALL НЕ отмечено');
    });
});

// ============================================================
// 5. SW — версия кэша
// ============================================================
describe('Task 427 — SW: версия кэша', () => {
    test('CACHE_VERSION = kipia-test-v753', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v753'") !== -1,
            'SW v654 (Task 427)');
        assertTrue(SW_SRC.indexOf('kipia-test-v754') === -1,
            'двойной бамп отсутствует');
    });
});
