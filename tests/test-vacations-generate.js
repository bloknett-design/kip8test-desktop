// tests/test-vacations-generate.js
// Task 279: отпуска не формируются в шахматке при «Сформировать».
//
// ЧТО ПРОВЕРЯЕТСЯ (двумя слоями):
//   Слой 1 — СИМУЛЯЦИЯ сервера: WorkSchedule.gs загружается в Node с
//   мок-таблицами (SpreadsheetApp/Utils инъекцией), generateMonth
//   прогоняется по-настоящему. Это первый тест репозитория, который
//   исполняет серверный код, а не только regex-инварианты:
//     A. happy path: 14 дн. «ОТ», перекрытие авто-смен, Сб/Вс, счётчики
//     B. период через границу месяца
//     C. идемпотентность: устаревшие «ОТ» снимаются
//     D. ДАТЫ ТЕКСТОМ «10.08.2026» — регресс Task 279 (раньше терялись)
//     E. ПУСТОЙ id — регресс Task 279 (раньше строки выбрасывались)
//     F. период через границу года
//     G. лист «Отпуска» отсутствует — генерация ок, vacationError в ответе
//     H. _parseSheetDate: ISO / dd.mm.yyyy / dd.mm.yy / мусор
//     I. addVacation учитывает текстовые даты при пересечении
//   Слой 2 — статические инварианты фронтенда/сервера/init/кэша.
//
// Запуск: через tests/run-all.js (require './test-vacations-generate.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

const WS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const INIT_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'VacationsInit.gs'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ============================================================
// Мок-инфраструктура Apps Script
// ============================================================
class MockSheet {
    constructor(rows) {
        this.rows = rows || [];   // включая строку 1 (шапка)
        this.fmtCalls = [];       // Task 304: вызовы setNumberFormat
    }
    getLastRow() { return this.rows.length; }
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
            // Task 304: реальный Sheets применяет формат к ячейке;
            // мок только протоколирует вызов — тесты проверяют,
            // что таб-ячейкам ставится '@' ДО записи значения
            setNumberFormat(fmt) {
                self.fmtCalls.push({ row: row, col: col,
                                     numRows: numRows, numCols: numCols, fmt: fmt });
            }
        };
    }
    deleteRow(r) { this.rows.splice(r - 1, 1); }
    appendRow(arr) { this.rows.push(arr.slice()); }
}

const MOCK_UTILS = {
    findSessionByToken: () => ({ user_id: 1 }),
    findUserById: () => ({ role: 'Админ', email: 'test@example.com' }),
    audit: () => {}
};

// Загрузка WorkSchedule.gs как модуля с инъекцией глобалов
function loadWS(sheets) {
    const ss = { getSheetByName: (n) => sheets[n] || null };
    const SpreadsheetApp = { openById: () => ss };
    const factory = new Function('SpreadsheetApp', 'Utils', WS_SRC + '\nreturn WorkSchedule;');
    return factory(SpreadsheetApp, MOCK_UTILS);
}

// Стенд: 017/023, шаблон cycle 4 (Д/Н/—/—), старт цикла 01.01.2026
function baseSheets() {
    return {
        'Сотрудники': new MockSheet([
            ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон', 'старт_цикла', 'приём', 'увольнение', 'архив', 'должность', 'комментарий'],
            ['017', 'Иванов И.И.', 'оператор', '', 1, new Date(2026, 0, 1), '', '', 0, '', ''],
            ['023', 'Петров П.П.', 'оператор', '', 1, new Date(2026, 0, 3), '', '', 0, '', '']
        ]),
        'Шаблоны_ротации': new MockSheet([
            ['id', 'name', 'cycle', 'desc'],
            [1, 'Сутки через двое', 4, '']
        ]),
        'Дни_цикла': new MockSheet([
            ['pattern_id', 'day', 'status'],
            [1, 1, 'Д'], [1, 2, 'Н'], [1, 3, ''], [1, 4, '']
        ]),
        'Инструктажи': new MockSheet([
            ['id', 'таб', 'тип', 'тема', 'начало', 'конец', 'дней', 'комментарий']
        ]),
        'Записи_графика': new MockSheet([
            ['дата', 'таб', 'статус', 'переработка', 'праздник', 'источник', 'обновлён', 'замещает', 'инструкция', 'комментарий']
        ]),
        'Отпуска': new MockSheet([
            ['id', 'таб_номер', 'часть', 'дата_начала', 'дата_окончания', 'комментарий']
        ])
    };
}

function entriesOf(sheet, tabNo) {
    const out = [];
    for (let i = 1; i < sheet.rows.length; i++) {
        if (String(sheet.rows[i][1]).trim() === tabNo) out.push(sheet.rows[i]);
    }
    return out;
}
function iso(dt) {
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' +
           String(dt.getDate()).padStart(2, '0');
}

// ============================================================
// Слой 1: симуляция generateMonth
// ============================================================
describe('Task 279 — симуляция generateMonth (мок-таблицы)', () => {

    test('A: happy path — 14 дн. «ОТ», перекрытие авто-смены, Сб/Вс, счётчики', () => {
        const sheets = baseSheets();
        sheets['Отпуска'].rows.push([1, '017', 1, new Date(2026, 7, 10), new Date(2026, 7, 23), '']);
        // существующая авто-смена 10.08 (первая строка данных) — должна
        // перекрыться «ОТ» на месте (ветка toUpdate)
        sheets['Записи_графика'].rows.push(
            [new Date(2026, 7, 10), '017', 'Н', 0, 0, 'авто', new Date(), '', null, '']);

        const WS = loadWS(sheets);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 8 });

        assertTrue(res.ok, 'generateMonth вернул ok');
        const es = entriesOf(sheets['Записи_графика'], '017');
        const byDate = {};
        es.forEach(r => { byDate[iso(r[0])] = r[2]; });

        // все 14 дней отпуска — «ОТ» (Task 298: код «О» → «ОТ»)
        let cntO = 0;
        for (let d = 10; d <= 23; d++) {
            if (byDate['2026-08-' + String(d).padStart(2, '0')] === 'ОТ') cntO++;
        }
        assertEqual(cntO, 14, 'дней «ОТ» внутри периода 10–23.08');

        // дни цикла 1/2 внутри отпуска (10,13,14,17,18,21,22) — смены не
        // проскочили, дни цикла 3/4 и Сб/Вс — вставка «ОТ»; счётчики
        // (генерация ДО фиксы этот сценарий тоже проходила)
        assertEqual(res.data.vacationUpdated, 7, 'vacationUpdated (смена→«ОТ»: 6 в toInsert + 1 в листе)');
        assertEqual(res.data.vacationGenerated, 7, 'vacationGenerated (пустые дни → вставка «ОТ»)');
        assertEqual(res.data.vacationDays, 14, 'vacationDays = generated + updated');
        assertEqual(res.data.vacationsFound, 1, 'vacationsFound = 1 период');

        // предсуществующая строка (строка 2 листа) обновлена на месте
        assertEqual(sheets['Записи_графика'].rows[1][2], 'ОТ', 'строка 2 (смена 10.08) стала «ОТ»');
        assertEqual(iso(sheets['Записи_графика'].rows[1][0]), '2026-08-10', 'дата строки 2 не съехала');

        // Сб/Вс внутри отпуска (15–16.08.2026) — «ОТ» (календарные дни)
        assertEqual(byDate['2026-08-15'], 'ОТ', 'суббота 15.08 = «ОТ»');
        assertEqual(byDate['2026-08-16'], 'ОТ', 'воскресенье 16.08 = «ОТ»');

        // «ОТ» — источник «авто», без инструкции
        const oRows = es.filter(r => r[2] === 'ОТ');
        assertTrue(oRows.every(r => r[5] === 'авто'), 'источник всех «ОТ» — авто');
        assertTrue(oRows.every(r => r[8] === null || r[8] === ''), 'инструкция у «ОТ» пуста');

        // смены вне отпуска сгенерированы как раньше
        const shiftDays = es.filter(r => r[2] === 'Д' || r[2] === 'Н').length;
        assertTrue(shiftDays >= 8, 'смены вне отпуска на месте (' + shiftDays + ' шт.)');
        // диагностическое поле ошибок отпусков отсутствует
        assertEqual(res.data.vacationError, null, 'vacationError = null');
    });

    test('B: период через границу месяца 25.07–05.08 — обе половины', () => {
        const sheets = baseSheets();
        sheets['Отпуска'].rows.push([1, '017', 1, new Date(2026, 6, 25), new Date(2026, 7, 5), '']);
        const WS = loadWS(sheets);
        WS.generateMonth({ token: 't', year: 2026, month: 8 });
        const cntAug = entriesOf(sheets['Записи_графика'], '017')
            .filter(r => r[2] === 'ОТ' && r[0].getMonth() === 7).length;
        assertEqual(cntAug, 5, 'август: «ОТ» 01–05.08');
        WS.generateMonth({ token: 't', year: 2026, month: 7 });
        const cntJul = entriesOf(sheets['Записи_графика'], '017')
            .filter(r => r[2] === 'ОТ' && r[0].getMonth() === 6).length;
        assertEqual(cntJul, 7, 'июль: «ОТ» 25–31.07');
    });

    test('C: идемпотентность — период удалён, устаревшие «ОТ» сняты', () => {
        const sheets = baseSheets();
        sheets['Отпуска'].rows.push([1, '017', 1, new Date(2026, 7, 10), new Date(2026, 7, 23), '']);
        const WS = loadWS(sheets);
        WS.generateMonth({ token: 't', year: 2026, month: 8 });
        const before = entriesOf(sheets['Записи_графика'], '017').filter(r => r[2] === 'ОТ').length;
        assertEqual(before, 14, 'до удаления: 14 «ОТ»');
        sheets['Отпуска'].rows.splice(1, 1);
        const res2 = WS.generateMonth({ token: 't', year: 2026, month: 8 });
        const after = entriesOf(sheets['Записи_графика'], '017').filter(r => r[2] === 'ОТ').length;
        assertEqual(after, 0, 'после повторной генерации: 0 «ОТ»');
        assertEqual(res2.data.removed, 14, 'removed=14');
    });

    test('D (регресс Task 279): даты ТЕКСТОМ «10.08.2026» теперь работают', () => {
        const sheets = baseSheets();
        // ручной ввод: локаль не распознала даты — в ячейках строки
        sheets['Отпуска'].rows.push([1, '017', 1, '10.08.2026', '23.08.2026', '']);
        const WS = loadWS(sheets);
        const lv = WS.listVacations({ token: 't', year: 2026 });
        assertTrue(lv.ok, 'listVacations ok');
        assertEqual(lv.data.vacations.length, 1, 'период с текстовыми датами виден');
        assertEqual(lv.data.vacations[0].дата_начала, '2026-08-10', 'дата_начала распарсена');
        assertEqual(lv.data.vacations[0].дата_окончания, '2026-08-23', 'дата_окончания распарсена');
        assertEqual(lv.data.vacations[0].дней, 14, 'дней = 14');
        const res = WS.generateMonth({ token: 't', year: 2026, month: 8 });
        const cnt = entriesOf(sheets['Записи_графика'], '017').filter(r => r[2] === 'ОТ').length;
        assertEqual(cnt, 14, '«Сформировать» проставил 14 «ОТ» (до Task 279 — 0)');
    });

    test('E (регресс Task 279): ПУСТОЙ id больше не выбрасывает строку', () => {
        const sheets = baseSheets();
        // деплой-док Task 274 разрешал «id можно не заполнять»
        sheets['Отпуска'].rows.push(['', '017', 1, new Date(2026, 7, 10), new Date(2026, 7, 23), '']);
        const WS = loadWS(sheets);
        const lv = WS.listVacations({ token: 't', year: 2026 });
        assertEqual(lv.data.vacations.length, 1, 'период без id виден');
        assertEqual(lv.data.vacations[0].id, null, 'id = null (не число)');
        const res = WS.generateMonth({ token: 't', year: 2026, month: 8 });
        const cnt = entriesOf(sheets['Записи_графика'], '017').filter(r => r[2] === 'ОТ').length;
        assertEqual(cnt, 14, '«Сформировать» проставил 14 «ОТ» (до Task 279 — 0)');
        assertEqual(res.data.vacationsFound, 1, 'vacationsFound = 1');
    });

    test('E2: мусорная строка (без id/таб/даты) по-прежнему игнорируется', () => {
        const sheets = baseSheets();
        sheets['Отпуска'].rows.push(['', '', '', '', '', '']);
        sheets['Отпуска'].rows.push([1, '017', 1, new Date(2026, 7, 10), new Date(2026, 7, 23), '']);
        const WS = loadWS(sheets);
        const lv = WS.listVacations({ token: 't', year: 2026 });
        assertEqual(lv.data.vacations.length, 1, 'пустая строка не попала в список');
    });

    test('F: период через границу года 29.12.2026–11.01.2027', () => {
        const sheets = baseSheets();
        sheets['Отпуска'].rows.push([1, '017', 1, new Date(2026, 11, 29), new Date(2027, 0, 11), '']);
        const WS = loadWS(sheets);
        const lv26 = WS.listVacations({ token: 't', year: 2026 });
        assertEqual(lv26.data.vacations.length, 1, 'listVacations(2026) видит период');
        const lv27 = WS.listVacations({ token: 't', year: 2027 });
        assertEqual(lv27.data.vacations.length, 1, 'listVacations(2027) тоже видит');
        WS.generateMonth({ token: 't', year: 2026, month: 12 });
        const cnt = entriesOf(sheets['Записи_графика'], '017').filter(r => r[2] === 'ОТ').length;
        assertEqual(cnt, 3, 'декабрь 2026: «ОТ» 29–31.12');
    });

    test('G: лист «Отпуска» отсутствует — генерация ок + vacationError', () => {
        const sheets = baseSheets();
        delete sheets['Отпуска'];
        const WS = loadWS(sheets);
        const res = WS.generateMonth({ token: 't', year: 2026, month: 8 });
        assertTrue(res.ok, 'генерация без листа «Отпуска» проходит');
        assertEqual(res.data.vacationsFound, 0, 'vacationsFound = 0');
        assertTrue(String(res.data.vacationError).indexOf('sheet_not_found') === 0,
            'vacationError = sheet_not_found: ' + res.data.vacationError);
    });

    test('H: _parseSheetDate — форматы и мусор', () => {
        const WS = loadWS(baseSheets());
        assertEqual(iso(WS._parseSheetDate('10.08.2026')), '2026-08-10', 'dd.mm.yyyy');
        assertEqual(iso(WS._parseSheetDate('1.8.2026')), '2026-08-01', 'd.m.yyyy без нулей');
        assertEqual(iso(WS._parseSheetDate('10.08.26')), '2026-08-10', 'dd.mm.yy');
        assertEqual(iso(WS._parseSheetDate('2026-08-10')), '2026-08-10', 'ISO');
        assertEqual(iso(WS._parseSheetDate(new Date(2026, 7, 10))), '2026-08-10', 'Date как есть');
        assertEqual(WS._parseSheetDate(''), null, 'пусто → null');
        assertEqual(WS._parseSheetDate(null), null, 'null → null');
        assertEqual(WS._parseSheetDate(46123), null, 'число → null (не парсим сериалы)');
        assertEqual(WS._parseSheetDate('32.01.2026'), null, 'несуществующий день → null');
        assertEqual(WS._parseSheetDate('10.13.2026'), null, 'несуществующий месяц → null');
        assertEqual(WS._parseSheetDate('абракадабра'), null, 'мусор → null');
    });

    test('I: addVacation учитывает текстовые даты при проверке пересечения', () => {
        const sheets = baseSheets();
        sheets['Отпуска'].rows.push([1, '017', 1, '10.08.2026', '23.08.2026', '']);
        const WS = loadWS(sheets);
        // пересекающийся период в ту же часть
        const res = WS.addVacation({ token: 't', 'таб_номер': '017', 'часть': 2,
                                     'дата_начала': '2026-08-20', 'дата_окончания': '2026-08-25' });
        assertFalse(res.ok, 'пересечение с текстовой датой отклонено');
        assertEqual(res.error, 'overlap', 'ошибка overlap');
        // непересекающийся — добавлен с Date-объектами и id = max+1
        const res2 = WS.addVacation({ token: 't', 'таб_номер': '017', 'часть': 2,
                                      'дата_начала': '2026-09-01', 'дата_окончания': '2026-09-05' });
        assertTrue(res2.ok, 'непересекающийся период добавлен');
        const last = sheets['Отпуска'].rows[sheets['Отпуска'].rows.length - 1];
        assertEqual(last[0], 2, 'id = max+1 = 2');
        assertTrue(last[3] instanceof Date, 'дата записана Date-объектом');
        assertEqual(iso(last[3]), '2026-09-01', 'дата начала корректна');
    });
});

// ============================================================
// Слой 2: статические инварианты
// ============================================================
describe('Task 279 — статические инварианты (фронт/init/кэш)', () => {

    test('тост «Сформировать» (месяц) показывает отпускные счётчики', () => {
        assertTrue(INDEX_SRC.indexOf("', отпусков отмечено ' + vacDays + ' дн.'") !== -1,
            'месячный тост содержит «отпусков отмечено N дн.»');
        assertTrue(INDEX_SRC.indexOf('data.vacationError') !== -1,
            'тост обрабатывает vacationError');
    });

    test('тост «Сформировать» (год) суммирует отпускные дни', () => {
        assertTrue(INDEX_SRC.indexOf("', отпусков отмечено ' + totalVacDays + ' дн.'") !== -1,
            'годовой тост содержит сумму отпускных дней');
        assertTrue(INDEX_SRC.indexOf('totalVacDays += (data && data.vacationDays) || 0;') !== -1,
            'накопление totalVacDays в цикле 12 месяцев');
    });

    test('кнопка «Удалить» без id: логика страницы удалена (Task 308), сервер жив', () => {
        // Task 308: страница «Отпуска» и _renderVacations удалены —
        // интерфейсные проверки vv.id/u.id ушли вместе с карточками.
        // deleteVacation-метод жив (API); сервер по-прежнему валидирует
        // id в listVacations и самолечит их VacationsInit.gs
        assertTrue(INDEX_SRC.indexOf('delBtn = vv.id') === -1,
            'рендер кнопки по vv.id удалён вместе со страницей');
        assertTrue(INDEX_SRC.indexOf('this._canEdit && u.id') === -1,
            'секция «нет в справочнике» удалена');
        assertTrue(INDEX_SRC.indexOf('deleteVacation: function') !== -1,
            'метод deleteVacation жив (серверный эндпоинт без изменений)');
    });

    test('WorkSchedule.gs: парсер текстовых дат и пустые id', () => {
        assertTrue(WS_SRC.indexOf('_parseSheetDate: function') !== -1, 'хелпер _parseSheetDate');
        assertTrue(WS_SRC.indexOf('vacationsFound:    vacations.length') !== -1,
            'vacationsFound в ответе generateMonth');
        assertTrue(WS_SRC.indexOf('vacationError:') !== -1, 'vacationError в ответе');
        assertTrue(WS_SRC.indexOf('vacationDays:      vacationDays') !== -1,
            'vacationDays в ответе');
        // listVacations: пустая строка = нет id И таба И даты
        assertTrue(WS_SRC.indexOf("!String(r[1] || '').trim() &&") !== -1,
            'условие пустой строки учитывает таб_номер и дату');
        assertTrue(WS_SRC.indexOf('isNaN(vId) ? null : vId') !== -1, 'id: null допустим');
        // addVacation использует _parseSheetDate
        assertTrue(WS_SRC.indexOf('var exStart = this._parseSheetDate(r[3]);') !== -1,
            'addVacation: пересечения по _parseSheetDate');
    });

    test('VacationsInit.gs: самолечение данных (id + текстовые даты)', () => {
        assertTrue(INIT_SRC.indexOf('function vacParseDate') !== -1, 'локальный парсер vacParseDate');
        assertTrue(INIT_SRC.indexOf('sheet.getRange(normRow, 1).setValue(normMaxId)') !== -1,
            'дозаполнение пустых id');
        assertTrue(INIT_SRC.indexOf("sheet.getRange(normRow, dc).setValue(parsedDate)") !== -1,
            'конвертация текстовых дат в Date');
        assertTrue(INIT_SRC.indexOf('самолечение данных') !== -1,
            'лог о самолечении');
    });

    test('SW-кэш поднят до v544 (Task 298 — сервер+фронтенд: коды статусов Т-12/Т-13)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v751'") !== -1,
            'CACHE_VERSION = kipia-test-v751');
    });
});

// ============================================================
// Task 298 — валидация кода статуса в setManualEntry (сервер)
// ============================================================
describe('Task 298 — валидация кода статуса (setManualEntry/_validateStatusCode)', () => {

    // Коды справочника — как в листе «Коды_статусов» пользователя
    // (16 кодов; «.» — плановый выходной; «Д7,2» — с запятой)
    const CODES_SHEET = () => new MockSheet([
        ['код', 'название', 'цвет'],
        ['Д', 'День 12-час', '#FFE082'],
        ['Д8', 'День 8-час', '#FFF9C4'],
        ['Д7,2', 'День 7,2-час', '#FFF9C4'],
        ['Н', 'Ночь 12-час', '#B0BEC5'],
        ['д', 'День в вых/праздник', '#FFD54F'],
        ['н', 'Ночь в вых/праздник', '#78909C'],
        ['ОТ', 'Отпуск', '#ECEFF1'],
        ['У', 'Учебный отпуск', '#80CBC4'],
        ['ОВ', 'Отгул', '#C5E1A5'],
        ['Б', 'Больничный', '#F8BBD0'],
        ['ПР', 'Прогул', '#EF5350'],
        ['И', 'Инструктаж', '#B3E5FC'],
        ['ОБ', 'Обучение', '#D1C4E9'],
        ['ПЗ', 'Проверка знаний', '#FFCDD2'],
        ['*', 'Примечание', '#FFAB91'],
        ['.', 'Плановый выходной', '#CFD8DC']
    ]);

    test('A: код из справочника — правка принимается, запись создана', () => {
        const sheets = baseSheets();
        sheets['Коды_статусов'] = CODES_SHEET();
        const WS = loadWS(sheets);
        const res = WS.setManualEntry({
            token: 't', date: '2026-08-05', 'таб_номер': '017',
            'статус': 'д', 'переработка': 0, 'комментарий': ''
        });
        assertTrue(res.ok, 'setManualEntry ok');
        const row = sheets['Записи_графика'].rows[1];
        assertEqual(row[2], 'д', 'статус «д» записан (регистрозависимо)');
        assertEqual(row[5], 'руч', 'источник — руч');
    });

    test('B: НЕизвестный код — отклонён, записи нет (fail-closed)', () => {
        const sheets = baseSheets();
        sheets['Коды_статусов'] = CODES_SHEET();
        const WS = loadWS(sheets);
        const res = WS.setManualEntry({
            token: 't', date: '2026-08-05', 'таб_номер': '017',
            'статус': 'X9', 'переработка': 0, 'комментарий': ''
        });
        assertFalse(res.ok, 'правка отклонена');
        assertTrue(String(res.error).indexOf('unknown_статус') === 0,
            'ошибка unknown_статус, получили: ' + res.error);
        assertEqual(sheets['Записи_графика'].rows.length, 1,
            'запись НЕ создана (только шапка)');
    });

    test('C: регистрозависимость — «Д» и «д» это РАЗНЫЕ коды, оба валидны', () => {
        const sheets = baseSheets();
        sheets['Коды_статусов'] = CODES_SHEET();
        const WS = loadWS(sheets);
        const r1 = WS.setManualEntry({ token: 't', date: '2026-08-01', 'таб_номер': '017', 'статус': 'Д' });
        const r2 = WS.setManualEntry({ token: 't', date: '2026-08-02', 'таб_номер': '017', 'статус': 'д' });
        assertTrue(r1.ok && r2.ok, 'оба кода проходят');
    });

    test('D: «.» (плановый выходной) — валидный код', () => {
        const sheets = baseSheets();
        sheets['Коды_статусов'] = CODES_SHEET();
        const WS = loadWS(sheets);
        const res = WS.setManualEntry({
            token: 't', date: '2026-08-08', 'таб_номер': '017', 'статус': '.'
        });
        assertTrue(res.ok, 'точка валидна');
        assertEqual(sheets['Записи_графика'].rows[1][2], '.', 'статус «.» записан');
    });

    test('E: «Д7,2» (код с запятой) — валидный код', () => {
        const sheets = baseSheets();
        sheets['Коды_статусов'] = CODES_SHEET();
        const WS = loadWS(sheets);
        const res = WS.setManualEntry({
            token: 't', date: '2026-08-07', 'таб_номер': '017', 'статус': 'Д7,2'
        });
        assertTrue(res.ok, '«Д7,2» валиден');
    });

    test('F: лист «Коды_статусов» отсутствует — правка отклонена (fail-closed)', () => {
        const sheets = baseSheets();  // без «Коды_статусов»
        const WS = loadWS(sheets);
        const res = WS.setManualEntry({
            token: 't', date: '2026-08-05', 'таб_номер': '017', 'статус': 'д'
        });
        assertFalse(res.ok, 'без справочника правка не проходит');
        assertTrue(String(res.error).indexOf('sheet_not_found') === 0,
            'ошибка sheet_not_found, получили: ' + res.error);
    });

    test('G: пустой код — invalid_статус (прежнее поведение сохранено)', () => {
        const sheets = baseSheets();
        sheets['Коды_статусов'] = CODES_SHEET();
        const WS = loadWS(sheets);
        const res = WS.setManualEntry({
            token: 't', date: '2026-08-05', 'таб_номер': '017', 'статус': ''
        });
        assertFalse(res.ok, 'пустой код отклонён');
        assertEqual(res.error, 'invalid_статус', 'ошибка invalid_статус');
    });

    test('H: стилевой холст (пустые строки до 1000-й) не ломает валидацию', () => {
        const sheets = baseSheets();
        const codes = CODES_SHEET();
        // урок Task 294: getLastRow завышен стилевым холстом — пустые
        // строки в колонке A должны пропускаться
        while (codes.rows.length < 1000) codes.rows.push(['', '', '']);
        sheets['Коды_статусов'] = codes;
        const WS = loadWS(sheets);
        const res = WS.setManualEntry({
            token: 't', date: '2026-08-05', 'таб_номер': '017', 'статус': 'ОТ'
        });
        assertTrue(res.ok, 'валидный код найден среди 1000 строк');
        const res2 = WS.setManualEntry({
            token: 't', date: '2026-08-06', 'таб_номер': '017', 'статус': 'ОТ '
        });
        // trim на входе: «ОТ » с пробелом — валиден (сервер тримит payload)
        assertTrue(res2.ok, 'trim статуса работает');
    });

    test('I: генерация отпусков пишет «ОТ» (grep-инвариант сервера)', () => {
        assertTrue(WS_SRC.indexOf("status: 'ОТ'") !== -1,
            "toUpdate.push({ status: 'ОТ' ... })");
        assertTrue(WS_SRC.indexOf("статус: 'ОТ'") !== -1,
            "entryIndex[...] = { статус: 'ОТ' ... }");
        assertTrue(WS_SRC.indexOf("rv[2] = 'ОТ'") !== -1,
            "замена в toInsert: rv[2] = 'ОТ'");
        assertFalse(WS_SRC.indexOf("status: 'О'") !== -1,
            "старого статуса 'О' в generateMonth больше нет");
    });

    test('J: TRAINING_TYPE_TO_STATUS не тронут (И/ОБ/ПЗ)', () => {
        assertTrue(WS_SRC.indexOf("'инструктаж':       'И'") !== -1, 'инструктаж → И');
        assertTrue(WS_SRC.indexOf("'обучение':         'ОБ'") !== -1, 'обучение → ОБ');
        assertTrue(WS_SRC.indexOf("'проверка_знаний':  'ПЗ'") !== -1, 'проверка знаний → ПЗ');
    });
});
