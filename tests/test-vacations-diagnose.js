// tests/test-vacations-diagnose.js
// Task 280: VacationsDiagnose.gs — функция-диагност «отпуска не
// формируются» (запускается пользователем в редакторе Apps Script).
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   1. Сигнатура vacationsDiagnose(year, month) + дефолты;
//   2. ГЛАВНОЕ — ТОЛЬКО ЧТЕНИЕ: в файле нет ни одного метода
//      записи в таблицу (setValue/appendRow/clear/…): диагностика
//      гарантированно не портит данные пользователя;
//   3. SPREADSHEET_ID = WorkSchedule.gs (та же таблица);
//   4. Проверка версии кода через WorkSchedule._parseSheetDate;
//   5. diagParseDate ИСПОЛНЯЕТСЯ в Node (new Function): форматы
//      Date / dd.mm.yyyy / dd.mm.yy / ISO, мусор → null — и
//      паттерны 1:1 совпадают с серверным _parseSheetDate;
//   6. Сверка таб_номер с «Сотрудники», симуляция месяца с
//      приоритетом «руч», вердикт с деплой-инструкцией.
//
// Запуск: через tests/run-all.js (require './test-vacations-diagnose.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

const DIAG_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'VacationsDiagnose.gs'), 'utf8');
const WS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');

describe('Task 280: VacationsDiagnose.gs — диагностика отпусков', () => {

    test('файл: функция vacationsDiagnose(year, month) + хелперы', () => {
        assertTrue(/function vacationsDiagnose\(\s*year\s*,\s*month\s*\)\s*\{/.test(DIAG_SRC));
        assertTrue(/function diagParseDate\(/.test(DIAG_SRC));
        assertTrue(/function diagSafeDate\(/.test(DIAG_SRC));
        assertTrue(/function diagIso\(/.test(DIAG_SRC));
    });

    test('ТОЛЬКО ЧТЕНИЕ: ни одного мутирующего метода таблицы', () => {
        const FORBIDDEN = /\.(setValue|setValues|appendRow|deleteRow|insertRow|insertRowBefore|insertRowAfter|deleteRows|clear|clearContents|clearFormats|setNumberFormat|copyTo|setDataValidation|setConditionalFormatRules|sort|moveDimension)\s*\(/;
        assertFalse(FORBIDDEN.test(DIAG_SRC),
            'В VacationsDiagnose.gs найден мутирующий вызов — диагностика обязана быть read-only');
    });

    test('SPREADSHEET_ID — та же таблица, что WorkSchedule.gs', () => {
        const ID = '1MQtW-CWCmjlu-SAeVBllKDP6NRkiOkmW-7xgOjHskWY';
        assertTrue(DIAG_SRC.indexOf(ID) !== -1);
        assertTrue(WS_SRC.indexOf(ID) !== -1);
    });

    test('проверка версии кода: ссылка на WorkSchedule._parseSheetDate (Task 279)', () => {
        assertTrue(DIAG_SRC.indexOf('WorkSchedule._parseSheetDate') !== -1);
        // Подсказка про конфликт двух WorkSchedule-файлов в проекте
        assertTrue(DIAG_SRC.indexOf('var WorkSchedule') !== -1);
    });

    test('парсер дат 1:1 с серверным _parseSheetDate (те же 3 паттерна)', () => {
        const PATTERNS = [
            's.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})$/)',
            's.match(/^(\\d{1,2})[.\\/](\\d{1,2})[.\\/](\\d{4})$/)',
            's.match(/^(\\d{1,2})[.\\/](\\d{1,2})[.\\/](\\d{2})$/)'
        ];
        PATTERNS.forEach(p => {
            assertTrue(DIAG_SRC.indexOf(p) !== -1, 'нет паттерна в VacationsDiagnose.gs: ' + p);
            assertTrue(WS_SRC.indexOf(p) !== -1, 'нет паттерна в WorkSchedule.gs: ' + p);
        });
    });

    test('diagParseDate исполняется: Date | dd.mm.yyyy | dd.mm.yy | ISO; мусор → null', () => {
        const mParse = DIAG_SRC.match(/function diagParseDate[\s\S]*?\n}/);
        const mSafe = DIAG_SRC.match(/function diagSafeDate[\s\S]*?\n}/);
        assertTrue(mParse && mSafe, 'не удалось извлечь diagParseDate/diagSafeDate');
        const parseDate = new Function(mSafe[0] + '\n' + mParse[0] + '\nreturn diagParseDate;')();

        // настоящая дата — как есть
        const d = new Date(2026, 7, 10);
        const r1 = parseDate(d);
        assertTrue(r1 instanceof Date && r1.getTime() === d.getTime());

        // dd.mm.yyyy
        const r2 = parseDate('10.08.2026');
        assertTrue(r2 instanceof Date);
        assertEqual(2026, r2.getFullYear());
        assertEqual(7, r2.getMonth());     // август = 7 (0-indexed)
        assertEqual(10, r2.getDate());

        // dd.mm.yy (двузначный год)
        const r3 = parseDate('1.8.26');
        assertTrue(r3 instanceof Date);
        assertEqual(2026, r3.getFullYear());
        assertEqual(7, r3.getMonth());
        assertEqual(1, r3.getDate());

        // ISO
        const r4 = parseDate('2026-08-10');
        assertTrue(r4 instanceof Date);
        assertEqual(2026, r4.getFullYear());
        assertEqual(10, r4.getDate());

        // разделитель «/» тоже поддержан (как на сервере)
        assertTrue(parseDate('10/08/2026') instanceof Date);

        // мусор → null: дефисы, числа, пусто, кривая дата, катание 32.01
        assertEqual(null, parseDate('10-08-2026'));
        assertEqual(null, parseDate('10082026'));
        assertEqual(null, parseDate('10.08'));
        assertEqual(null, parseDate(''));
        assertEqual(null, parseDate(null));
        assertEqual(null, parseDate('32.01.2026'));
        assertEqual(null, parseDate('10.13.2026'));
    });

    test('диагностика сверяет таб_номер с листом «Сотрудники»', () => {
        assertTrue(DIAG_SRC.indexOf("getSheetByName('Сотрудники')") !== -1);
        assertTrue(DIAG_SRC.indexOf('empTabs.hasOwnProperty') !== -1);
        assertTrue(DIAG_SRC.indexOf('НЕ НАЙДЕН в «Сотрудники»') !== -1);
    });

    test('симуляция «Сформировать»: вставка/перекрытие/блок «руч» + год', () => {
        // существующие записи читаются с источником (F), ручные — приоритет
        assertTrue(DIAG_SRC.indexOf("getSheetByName('Записи_графика')") !== -1);
        assertTrue(DIAG_SRC.indexOf("exV['источник'] === 'руч'") !== -1);
        assertTrue(DIAG_SRC.indexOf('simInsert') !== -1);
        assertTrue(DIAG_SRC.indexOf('simUpdate') !== -1);
        assertTrue(DIAG_SRC.indexOf('simBlocked') !== -1);
        // год-фильтр как в listVacations
        assertTrue(/yearStart\.getTime\(\)/.test(DIAG_SRC));
        assertTrue(/yearEnd\.getTime\(\)/.test(DIAG_SRC));
    });

    test('вердикт: деплой-инструкция «Новая версия» + предупреждение о Ctrl+S', () => {
        assertTrue(DIAG_SRC.indexOf('«Новая версия»') !== -1);
        assertTrue(DIAG_SRC.indexOf('Ctrl+S') !== -1);
        assertTrue(DIAG_SRC.indexOf('service worker') !== -1);
        assertTrue(DIAG_SRC.indexOf('отпусков отмечено') !== -1);
    });

    test('ранний выход: нет листа / пустой лист / сломанная шапка — вердикт всё равно печатается', () => {
        // printVerdict() вызывается на всех ветках выхода
        const calls = (DIAG_SRC.match(/printVerdict\(\)/g) || []).length;
        assertTrue(calls >= 3, 'printVerdict должен вызываться на каждом выходе, найдено: ' + calls);
        assertTrue(DIAG_SRC.indexOf("getSheetByName('Отпуска')") !== -1);
        assertTrue(DIAG_SRC.indexOf('Листа «Отпуска» в таблице НЕТ') !== -1);
        assertTrue(DIAG_SRC.indexOf('Лист «Отпуска» ПУСТ') !== -1);
        assertTrue(DIAG_SRC.indexOf('не шапка') !== -1);
    });

});
