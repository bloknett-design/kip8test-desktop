// tests/test-flow-period-input.js
// Task 286: ввод «расход за неделю/месяц» для Хозрасчёта №1.
// Task 287 (историческая заметка): счётчик переданных показаний
//   переделан — календарная неделя (пн–вс), предыдущий месяц
//   с откатом назад, непрозрачный фон.
// Task 288: блок «Передано показаний (контроль)» УДАЛЁН вместе с
//   логикой счёта (flowCountStats, flowPluralRecords, FLOW_MONTHS_RU,
//   _buildStatsHtml, CSS .flow-stats-*).
// Task 289: форма ввода «за неделю» УБРАНА (chips: сутки/месяц;
//   недельные ветки ввода и flowPrevWeekRange удалены); счётчик
//   «За неделю» — из суточных показаний, справа от заголовка
//   «Хронология показаний»; на сервере дни периода в архиве
//   считаются ВКЛЮЧИТЕЛЬНО (01.08–31.08 = 31 день).
// Task 290: счётчик «За неделю» считает ПОСЛЕДНЮЮ ПОЛНУЮ
//   календарную неделю (пн–вс, закрывшуюся в прошлое воскресенье)
//   — складываются показания, переданные за КАЖДЫЕ сутки недели
//   (т + Гкал), период подписан («24.08–30.08.2026»); в начале
//   каждой недели счётчик сам переходит на новую закрывшуюся
//   неделю, БЕЗ записи в архив.
// Task 291: счётчик «За неделю» перенесён ОТДЕЛЬНОЙ строкой ПОД
//   заголовок «Хронология показаний»; перенос текста — только после
//   двоеточия (подпись и значение неразрывны); строки заголовка и
//   счётчика получили НЕПРОЗРАЧНЫЙ фон (зебра детальной карточки
//   #372e2a/#463e38 — сетка страницы не просвечивает).
// Task 292: заголовок графика для dailyMode (Хозрасчёт №1) —
//   «Показания (посуточно), т»: уточнение, что график строится
//   только по суточным записям (Task 286); для остальных
//   хозрасчётов — «Расход», как прежде.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. Standalone-хелперы (песочница extract-functions):
//      flowWeekCounterStats — последняя ПОЛНАЯ неделя пн–вс
//      (переходы месяца/года, переход ровно в пн), сумма суточных
//      т И Гкал за каждые сутки, пропуск агрегатов, дедуп правок
//      за один день; flowWeekRangeLabel — подпись периода;
//      flowPrevMonthRange — прошедший месяц;
//      flowDateToInputVal / flowDateToMdy — конвертация дат;
//      flowEntryTypeAcc — винительный падеж.
//   B. Клиент (index.html, статика): chips (сутки/месяц), поля дат,
//      ветка submitInput (только месяц), маршрут updatePeriodReading,
//      счётчик «За неделю» — отдельной строкой под заголовком
//      хронологии (период + т + Гкал, перенос после двоеточия,
//      непрозрачные фоны, чистый рендер без записи в архив),
//      Task 289 — форма недели убрана,
//      Task 288 — счётчик контроля удалён, бейджи «нед»/«мес»,
//      график — только суточные записи,
//      Task 292 — заголовок dailyMode «Показания (посуточно)»; SW → v543 (Task 298).
//   C. Серверные справочные копии (.gs): ветка entryType в
//      updateReading, _writePeriodEntry (только архив, prev=0,
//      hard-проверки), колонка R (entryType) в архиве,
//      самовосстановление заголовка R1, чтение 18 колонок,
//      пропуск агрегатов в getRecentAllMeters, маршрут в Code.gs,
//      Task 289 — дни периода ВКЛЮЧИТЕЛЬНО, node --check ×3.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');
const { extractFunctions } = require('./extract-functions.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const FLOWMETER_GS = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'Flowmeter.gs'), 'utf8');
const ARCHIVE_GS = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'FlowmeterArchive.gs'), 'utf8');
const CODE_GS = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'Code.gs'), 'utf8');

const fns = extractFunctions();

// ============================================================
// A. Standalone-хелперы (вычисления)
// ============================================================

describe('Task 286 — flowPrevMonthRange: границы прошедшего месяца', () => {

    test('01.09.2026 → 01.08.2026 – 31.08.2026', () => {
        const r = fns.flowPrevMonthRange(new Date(2026, 8, 1));
        assertEqual(fns.flowDateToMdy(r.start), '8/1/2026', 'start = 1-е число прошлого месяца');
        assertEqual(fns.flowDateToMdy(r.end), '8/31/2026', 'end = последнее число (31.08)');
    });

    test('15.02.2027 → 01.01.2027 – 31.01.2027 (январь — 31 день)', () => {
        const r = fns.flowPrevMonthRange(new Date(2027, 1, 15));
        assertEqual(fns.flowDateToMdy(r.start), '1/1/2027', 'start = 1 января');
        assertEqual(fns.flowDateToMdy(r.end), '1/31/2027', 'end = 31 января');
    });

    test('Январь 2027 → декабрь 2026 (переход через год): 01.12.2026 – 31.12.2026', () => {
        const r = fns.flowPrevMonthRange(new Date(2027, 0, 20));
        assertEqual(fns.flowDateToMdy(r.start), '12/1/2026', 'start = 1 декабря прошлого года');
        assertEqual(fns.flowDateToMdy(r.end), '12/31/2026', 'end = 31 декабря прошлого года');
    });

    test('Март невисокосного 2027 → февраль: 01.02 – 28.02', () => {
        const r = fns.flowPrevMonthRange(new Date(2027, 2, 5));
        assertEqual(fns.flowDateToMdy(r.end), '2/28/2027', 'end = 28 февраля (невисокосный)');
    });

    test('Июль 2028 → июнь, 30 дней', () => {
        const r = fns.flowPrevMonthRange(new Date(2028, 6, 10));
        assertEqual(fns.flowDateToMdy(r.end), '6/30/2028', 'end = 30 июня');
    });
});

describe('Task 286 — flowDateToInputVal / flowDateToMdy: конвертация дат', () => {

    test('flowDateToInputVal: паддинг нулями (01.09.2026 → 2026-09-01)', () => {
        assertEqual(fns.flowDateToInputVal(new Date(2026, 8, 1)), '2026-09-01', 'YYYY-MM-DD');
    });

    test('flowDateToInputVal: 25.12.2026 → 2026-12-25', () => {
        assertEqual(fns.flowDateToInputVal(new Date(2026, 11, 25)), '2026-12-25', 'YYYY-MM-DD');
    });

    test('flowDateToInputVal: невалидная дата → пустая строка', () => {
        assertEqual(fns.flowDateToInputVal(null), '', 'null → ""');
        assertEqual(fns.flowDateToInputVal(new Date(NaN)), '', 'Invalid Date → ""');
    });

    test('flowDateToMdy: 01.09.2026 → 9/1/2026 (внутренний формат)', () => {
        assertEqual(fns.flowDateToMdy(new Date(2026, 8, 1)), '9/1/2026', 'M/D/YYYY');
        assertEqual(fns.flowDateToMdy(new Date(2026, 11, 25)), '12/25/2026', 'M/D/YYYY');
    });

    test('flowDateToMdy: невалидная дата → пустая строка', () => {
        assertEqual(fns.flowDateToMdy(null), '', 'null → ""');
    });
});

describe('Task 286 — flowEntryTypeAcc: винительный падеж («за …»)', () => {

    test('за сутки / за неделю / за месяц', () => {
        assertEqual(fns.flowEntryTypeAcc('сутки'), 'сутки', '«за сутки»');
        assertEqual(fns.flowEntryTypeAcc('неделя'), 'неделю', '«за неделю» (не «за неделя»!)');
        assertEqual(fns.flowEntryTypeAcc('месяц'), 'месяц', '«за месяц»');
    });

    test('неизвестный тип → сутки (безопасный дефолт)', () => {
        assertEqual(fns.flowEntryTypeAcc(''), 'сутки', 'пусто → сутки');
        assertEqual(fns.flowEntryTypeAcc('день'), 'сутки', 'мусор → сутки');
    });
});

// B. Клиент (index.html — статические проверки)
// ============================================================

describe('Task 286 — клиент: UI шита ввода (chips + поля дат)', () => {

    test('Ряд chips периода присутствует и скрыт по умолчанию', () => {
        assertTrue(INDEX_SRC.indexOf('id="flowInputPeriodRow"') !== -1,
            'ряд #flowInputPeriodRow есть в HTML');
        const m = INDEX_SRC.match(/id="flowInputPeriodRow" style="display:none;"/);
        assertTrue(m !== null, 'по умолчанию скрыт (показывается только для №1)');
    });

    test('Два chips: За сутки / За месяц → setEntryType (Task 289: недели нет)', () => {
        assertTrue(INDEX_SRC.indexOf("id=\"flowChipDay\" onclick=\"FlowmeterData.setEntryType('сутки')\"") !== -1,
            'chip «За сутки»');
        assertTrue(INDEX_SRC.indexOf("id=\"flowChipMonth\" onclick=\"FlowmeterData.setEntryType('месяц')\"") !== -1,
            'chip «За месяц»');
        assertFalse(INDEX_SRC.indexOf('id="flowChipWeek"') !== -1,
            'chip «За неделю» удалён (Task 289)');
    });

    test('Второе поле даты «по» + динамические подписи лейблов', () => {
        assertTrue(INDEX_SRC.indexOf('id="flowInputDateEndGroup"') !== -1,
            'группа конца периода есть');
        assertTrue(INDEX_SRC.indexOf('id="flowInputDateEnd"') !== -1,
            'input #flowInputDateEnd есть');
        assertTrue(INDEX_SRC.indexOf('id="flowInputDateLabel"') !== -1,
            'лейбл начала даты получает id (для смены подписи)');
        assertTrue(INDEX_SRC.indexOf('id="flowInputDateEndLabel"') !== -1,
            'лейбл конца периода есть');
    });

    test('Заголовок шита — винительный падеж («за неделю», не «за неделя»)', () => {
        assertTrue(INDEX_SRC.indexOf("m.hoz + ' — внести расход за ' + flowEntryTypeAcc(type)") !== -1,
            'заголовок через flowEntryTypeAcc');
        assertTrue(INDEX_SRC.indexOf("KipToast.show('Расход за ' + flowEntryTypeAcc(type) + ' сохранён')") !== -1,
            'тост через flowEntryTypeAcc');
    });

    test('Chips видны только для №1 при новом вводе (openInput)', () => {
        const m = INDEX_SRC.match(/periodRow\.style\.display = \(dailyMode && !isEdit\) \? '' : 'none';/);
        assertTrue(m !== null, 'условие dailyMode && !isEdit');
    });

    test('setEntryType: только №1 + валидация типа', () => {
        assertTrue(INDEX_SRC.indexOf('setEntryType: function(type)') !== -1,
            'метод setEntryType определён');
        assertTrue(INDEX_SRC.indexOf("if (!m || !this._isDailyMode(m)) return;  // только №1") !== -1,
            'guard: только Хозрасчёт №1');
        assertTrue(INDEX_SRC.indexOf("if (type !== 'сутки' && type !== 'месяц') return;  // Task 289: недели нет") !== -1,
            'guard: допустимые типы (сутки/месяц, Task 289)');
    });

    test('_applyEntryTypeFields: подписи «Период с» / «по» и даты по умолчанию', () => {
        assertTrue(INDEX_SRC.indexOf("_applyEntryTypeFields: function(m, isEdit)") !== -1,
            'метод определён');
        assertTrue(INDEX_SRC.indexOf("dateLabel.textContent = 'Период с'") !== -1,
            'лейбл «Период с»');
        assertTrue(INDEX_SRC.indexOf("dateEndLabel.textContent = 'по'") !== -1,
            'лейбл «по»');
        assertTrue(INDEX_SRC.indexOf("dateLabel.textContent = 'Дата за предыдущие сутки'") !== -1,
            'возврат подписи для суточного режима');
        assertTrue(INDEX_SRC.indexOf('flowPrevMonthRange(now)') !== -1,
            'даты месяца по умолчанию — flowPrevMonthRange');
        // Task 368: хелпер возвращён — границы прошедшей недели для
        // ПОКАЗАНИЙ №3/№11 (chip «За неделю» у №1 по-прежнему нет — тест выше)
        assertTrue(INDEX_SRC.indexOf('function flowPrevWeekRange(now)') !== -1,
            'Task 368: flowPrevWeekRange есть (период показаний недельных)');
        assertTrue(INDEX_SRC.indexOf("field.placeholder = 'Расход за прошедший месяц, ' + m.unit;") !== -1,
            'placeholder только месяца (Task 289)');
    });

    test('closeInput снимает фокус с нового поля даты', () => {
        const m = INDEX_SRC.match(/dateEndField\.blur\(\);/);
        assertTrue(m !== null, 'blur для #flowInputDateEnd');
    });
});

describe('Task 286 — клиент: submitInput ветка «за период»', () => {

    test('submitInput уходит в _submitPeriodEntry только для месяца (Task 289)', () => {
        assertTrue(INDEX_SRC.indexOf("if (this._inputEntryType === 'месяц') {") !== -1,
            'ветка только на месяц');
        assertTrue(INDEX_SRC.indexOf('this._submitPeriodEntry(num, gcalVal);') !== -1,
            'вызов _submitPeriodEntry');
        assertFalse(INDEX_SRC.indexOf("this._inputEntryType === 'неделя'") !== -1,
            'недельной ветки ввода больше нет');
    });

    test('_submitPeriodEntry: guard «только месяц» и дефолт дат (Task 289)', () => {
        assertTrue(INDEX_SRC.indexOf("if (!id || type !== 'месяц') return;  // Task 289: только месяц") !== -1,
            'guard: только месяц');
        assertTrue(INDEX_SRC.indexOf('var defRange = flowPrevMonthRange(now);') !== -1,
            'дефолт периода — прошедший месяц');
    });

    test('_submitPeriodEntry: отдельный маршрут flowmeter.updatePeriodReading', () => {
        assertTrue(INDEX_SRC.indexOf("this._api('flowmeter.updatePeriodReading', apiPayload)") !== -1,
            'маршрут updatePeriodReading (не updateReading!)');
    });

    test('_submitPeriodEntry: payload с entryType и prev=0', () => {
        assertTrue(INDEX_SRC.indexOf('entryType: type,') !== -1, 'entryType в payload');
        const m = INDEX_SRC.match(/prev: 0,\s*\/\/ расход за период → consumption = введённое значение/);
        assertTrue(m !== null, 'prev=0 — consumption = расход');
    });

    test('Защита от старого сервера: «Unknown action» → подсказка DEPLOY', () => {
        // Task 358: между условием и тостом теперь outbox-фиксация — окно расширено
        const m = INDEX_SRC.match(/msg\.indexOf\('Unknown action'\) !== -1[\s\S]{0,600}?обновите Apps Script \(DEPLOY-Task286\)/);
        assertTrue(m !== null, 'ветка Unknown action с подсказкой обновить сервер');
    });

    test('Клиентская hard-проверка: дата конца раньше начала → тост, без отправки', () => {
        const m = INDEX_SRC.match(/Дата конца периода раньше даты начала/);
        assertTrue(m !== null, 'сообщение о неверных датах периода');
    });

    test('Эхо entryType проверяется (подстраховка ветки сервера)', () => {
        const m = INDEX_SRC.match(/etEcho !== type/);
        assertTrue(m !== null, 'сравнение ответа сервера с отправленным типом');
    });

    test('После успеха — load() (перезагрузка архива), без optimistic-обновления meters', () => {
        // Task 358: в теле появился outbox-блок — окно расширено
        const m = INDEX_SRC.match(/_submitPeriodEntry[\s\S]{0,3500}?self\.load\(\)/);
        assertTrue(m !== null, 'load() после сохранения периода');
        // Оптимистичное обновление meter.curr осталось только в суточной ветке:
        const submitBody = INDEX_SRC.slice(
            INDEX_SRC.indexOf('submitInput: function()'),
            INDEX_SRC.indexOf('_submitPeriodEntry: function(num, gcalVal)'));
        assertTrue(submitBody.indexOf('meter.curr = num;') !== -1,
            'суточная ветка: оптимистичное обновление как прежде');
    });
});

describe('Task 288 — счётчик «Передано показаний (контроль)» удалён', () => {

    test('Метод _buildStatsHtml и заголовок блока удалены', () => {
        assertFalse(INDEX_SRC.indexOf('_buildStatsHtml') !== -1,
            'метода _buildStatsHtml нет');
        assertFalse(INDEX_SRC.indexOf('Передано показаний') !== -1,
            'заголовка «Передано показаний» нет');
    });

    test('Логика счёта удалена: flowCountStats / flowPluralRecords / FLOW_MONTHS_RU', () => {
        assertFalse(INDEX_SRC.indexOf('flowCountStats') !== -1,
            'функции счёта нет');
        assertFalse(INDEX_SRC.indexOf('flowPluralRecords') !== -1,
            'склонения «N записей» нет');
        assertFalse(INDEX_SRC.indexOf('FLOW_MONTHS_RU') !== -1,
            'массива названий месяцев нет');
    });

    test('CSS блока .flow-stats-* удалён (тёмная и светлая темы)', () => {
        assertFalse(INDEX_SRC.indexOf('.flow-stats-section') !== -1, 'контейнера нет');
        assertFalse(INDEX_SRC.indexOf('.flow-stats-row') !== -1, 'строк нет');
        assertFalse(INDEX_SRC.indexOf('.flow-stats-title') !== -1, 'заголовка нет');
        assertFalse(INDEX_SRC.indexOf('.flow-stats-value') !== -1, 'значений нет');
    });

    test('Пустой архив: карточка рендерит только «Записей ещё нет», без блока', () => {
        const m = INDEX_SRC.match(/var weekCounterHtml = this\._buildWeekCounterHtml\(records, meter\);\s*if \(!records \|\| records\.length === 0\) \{\s*return '<div class="flow-archive-section">' \+/);
        assertTrue(m !== null, 'пустой архив → сразу хронология (заголовок + счётчик недели), без statsHtml');
        assertFalse(INDEX_SRC.indexOf('statsHtml') !== -1,
            'переменной statsHtml нет');
    });

    test('Хронология не начинается со вставки счётчика', () => {
        const m = INDEX_SRC.match(/var html = '';\s*html \+= '<div class="flow-archive-section">';/);
        assertTrue(m !== null, 'html начинается напрямую с flow-archive-section');
    });

    test('Удалённые хелперы не извлекаются песочницей (flowEntryTypeAcc остаётся)', () => {
        const EXTRACT_SRC = fs.readFileSync(path.join(__dirname, 'extract-functions.js'), 'utf8');
        assertFalse(EXTRACT_SRC.indexOf("'flowCountStats'") !== -1,
            'flowCountStats не извлекается');
        assertFalse(EXTRACT_SRC.indexOf("'flowPluralRecords'") !== -1,
            'flowPluralRecords не извлекается');
        assertTrue(EXTRACT_SRC.indexOf("'flowPrevWeekRange'") !== -1,
            'Task 368: flowPrevWeekRange извлекается (период показаний)');
        assertTrue(EXTRACT_SRC.indexOf("'flowWeekCounterStats'") !== -1,
            'Task 289: flowWeekCounterStats извлекается (счётчик недели)');
        assertTrue(EXTRACT_SRC.indexOf("'flowWeekRangeLabel'") !== -1,
            'Task 290: flowWeekRangeLabel извлекается (подпись периода недели)');
        assertTrue(EXTRACT_SRC.indexOf("'flowEntryTypeAcc'") !== -1,
            'flowEntryTypeAcc остаётся (форма ввода)');
    });

    test('Форма ввода: chips «За сутки»/«За месяц» (Task 289 убрал «За неделю»)', () => {
        assertTrue(INDEX_SRC.indexOf('id="flowChipDay"') !== -1, 'chip «За сутки»');
        assertFalse(INDEX_SRC.indexOf('id="flowChipWeek"') !== -1, 'chip «За неделю» удалён');
        assertTrue(INDEX_SRC.indexOf('id="flowChipMonth"') !== -1, 'chip «За месяц»');
        assertTrue(INDEX_SRC.indexOf("m.hoz + ' — внести расход за ' + flowEntryTypeAcc(type)") !== -1,
            'заголовок шита через flowEntryTypeAcc');
    });

    test('Маршрут периода и запись в архив не тронуты', () => {
        assertTrue(INDEX_SRC.indexOf("this._api('flowmeter.updatePeriodReading', apiPayload)") !== -1,
            'маршрут updatePeriodReading на месте');
        assertTrue(INDEX_SRC.indexOf('_submitPeriodEntry: function(num, gcalVal)') !== -1,
            'метод _submitPeriodEntry на месте');
    });
});


describe('Task 286 — клиент: хронология (бейджи + график)', () => {

    test('Записи недели/месяца: диапазон дат + бейдж «нед»/«мес»', () => {
        assertTrue(INDEX_SRC.indexOf('flow-arch-period-badge') !== -1, 'CSS-класс бейджа');
        assertTrue(INDEX_SRC.indexOf("(rEt === 'неделя') ? 'нед' : 'мес'") !== -1,
            'текст бейджа нед/мес');
        assertTrue(INDEX_SRC.indexOf('_fmtDateShort(r.datePrev)') !== -1,
            'диапазон: datePrev–dateCurr');
    });

    test('График — только суточные записи (агрегаты исключены)', () => {
        assertTrue(INDEX_SRC.indexOf('dayRecords = records.filter') !== -1,
            'фильтрация dayRecords');
        assertTrue(INDEX_SRC.indexOf('this._buildArchiveChart(dayRecords, meter)') !== -1,
            'график строится из dayRecords');
    });

    test('Таблица хронологии показывает ВСЕ записи (включая агрегаты)', () => {
        // displayRecords (последние 31 любых) идут в таблицу:
        const m = INDEX_SRC.match(/displayRecords = records\.length > recLimit \? records\.slice\(0, recLimit\) : records;/);
        assertTrue(m !== null, 'таблица — все типы записей');
    });
});

describe('Task 286 — клиент: CSS и SW', () => {

    test('CSS: chips (тёмная + светлая темы)', () => {
        assertTrue(INDEX_SRC.indexOf('.flow-period-chip {') !== -1, 'базовый стиль');
        assertTrue(INDEX_SRC.indexOf('.flow-period-chip.active {') !== -1, 'активный chip');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .flow-period-chip.active {') !== -1,
            'светлая тема');
    });

    test('CSS: бейдж периода (тёмная + светлая)', () => {
        assertTrue(INDEX_SRC.indexOf('.flow-arch-period-badge {') !== -1, 'бейдж');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .flow-arch-period-badge {') !== -1,
            'светлая тема');
    });

    test('SW-кэш поднят до v544 (Task 298 — фронтенд менялся)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v752'") !== -1,
            'CACHE_VERSION = kipia-test-v752');
        assertFalse(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v534'") !== -1,
            'старой версии v534 нет');
    });

    test('Регрессия: WEB_APP_URL не тронут (AKfycbyt…, Task 284)', () => {
        const m = INDEX_SRC.match(/WEB_APP_URL:\s*'(https:\/\/script\.google\.com\/macros\/s\/AKfycbyt[^(]+\/exec)'/);
        assertTrue(m !== null, 'URL развёртывания прежний');
    });
});

// ============================================================
// D. Task 289/290 — счётчик «За неделю» из суточных данных
// ============================================================

describe('Task 290 — flowWeekCounterStats: последняя ПОЛНАЯ календарная неделя (пн–вс)', () => {

    test('Вторник 01.09.2026 → полная неделя пн 24.08.2026 – вс 30.08.2026', () => {
        const w = fns.flowWeekCounterStats([], new Date(2026, 8, 1));  // вт
        assertEqual(fns.flowDateToMdy(w.start), '8/24/2026', 'start = пн прошлой (полной) недели');
        assertEqual(fns.flowDateToMdy(w.end), '8/30/2026', 'end = вс прошлой (полной) недели');
    });

    test('Понедельник 31.08.2026 → уже перешёл на закрывшуюся неделю 24.08–30.08', () => {
        // В начале каждой недели (ровно в пн) счётчик переходит на
        // данные только что закрывшейся полной недели
        const w = fns.flowWeekCounterStats([], new Date(2026, 7, 31));  // пн
        assertEqual(fns.flowDateToMdy(w.start), '8/24/2026', 'start = пн закрывшейся недели');
        assertEqual(fns.flowDateToMdy(w.end), '8/30/2026', 'end = вс (вчера)');
    });

    test('Воскресенье 06.09.2026 → всё ещё 24.08–30.08 (текущая неделя не полная)', () => {
        const w = fns.flowWeekCounterStats([], new Date(2026, 8, 6));  // вс
        assertEqual(fns.flowDateToMdy(w.start), '8/24/2026', 'start = пн полной недели');
        assertEqual(fns.flowDateToMdy(w.end), '8/30/2026', 'end = вс полной недели');
    });

    test('Неделя через границу года: пн 04.01.2027 → полная 28.12.2026 – 03.01.2027', () => {
        const w = fns.flowWeekCounterStats([], new Date(2027, 0, 4));  // пн
        assertEqual(fns.flowDateToMdy(w.start), '12/28/2026', 'start в прошлом году');
        assertEqual(fns.flowDateToMdy(w.end), '1/3/2027', 'end в новом году');
    });

    test('Воскресенье 03.01.2027 → полная неделя 21.12.2026 – 27.12.2026', () => {
        // Текущая неделя 28.12.2026–03.01.2027 ещё не полная (включает сегодня)
        const w = fns.flowWeekCounterStats([], new Date(2027, 0, 3));  // вс
        assertEqual(fns.flowDateToMdy(w.start), '12/21/2026', 'start = пн позапрошлой недели');
        assertEqual(fns.flowDateToMdy(w.end), '12/27/2026', 'end = вс прошлой недели');
    });

    test('Неделя через границу месяца: пн 05.10.2026 → полная 28.09 – 04.10', () => {
        const w = fns.flowWeekCounterStats([], new Date(2026, 9, 5));  // пн
        assertEqual(fns.flowDateToMdy(w.start), '9/28/2026', 'start = пн сентября');
        assertEqual(fns.flowDateToMdy(w.end), '10/4/2026', 'end = вс октября');
    });

    test('Претензия Task 290: счётчик = сумма показаний КАЖДЫХ суток недели (не сутки 31.08)', () => {
        // Пользователь: «"За неделю: 53,60 т" — это 53,60 т за сутки
        // 31.08.2026». Счётчик должен складывать показания, переданные
        // за каждые сутки ПОЛНОЙ недели (24.08–30.08), а не показывать
        // свежие сутки текущей недели.
        const recs = [
            { curr: 53.60, dateCurr: '8/31/2026' },   // пн ТЕКУЩЕЙ (неполной) недели
            { curr: 51.20, dateCurr: '8/30/2026' },   // вс полной недели
            { curr: 52.40, dateCurr: '8/29/2026' },   // сб
            { curr: 50.80, dateCurr: '8/28/2026' },   // пт
            { curr: 49.60, dateCurr: '8/27/2026' },   // чт
            { curr: 48.40, dateCurr: '8/26/2026' },   // ср
            { curr: 47.20, dateCurr: '8/25/2026' },   // вт
            { curr: 46.00, dateCurr: '8/24/2026' },   // пн
            { curr: 44.00, dateCurr: '8/23/2026' }    // вс позапрошлой недели — вне
        ];
        const w = fns.flowWeekCounterStats(recs, new Date(2026, 8, 1));  // вт 01.09
        assertEqual(Math.round(w.sum * 100) / 100, 345.6, 'сумма = 46+47,2+48,4+49,6+50,8+52,4+51,2 (семь суток полной недели)');
        assertEqual(w.days, 7, 'семь разных дат полной недели');
        assertFalse(w.sum === 53.60, 'НЕ показания одних суток 31.08');
    });

    test('Гкал за полную неделю складываются по тому же принципу', () => {
        const recs = [
            { curr: 51.20, dateCurr: '8/30/2026', gcal: 0.221 },
            { curr: 52.40, dateCurr: '8/29/2026', gcal: 0.226 },
            { curr: 50.80, dateCurr: '8/28/2026', gcal: 0.219 },
            { curr: 53.60, dateCurr: '8/31/2026', gcal: 0.230 },   // текущая неделя — вне
            { curr: 49.60, dateCurr: '8/27/2026' }                  // Гкал не введена
        ];
        const w = fns.flowWeekCounterStats(recs, new Date(2026, 8, 2));  // ср
        assertEqual(Math.round(w.sum * 100) / 100, 204, 'сумма т = 49,6+50,8+52,4+51,2');
        assertEqual(Math.round(w.gcal * 1000) / 1000, 0.666, 'сумма Гкал = 0,219+0,226+0,221');
        assertEqual(w.gcalDays, 3, 'три даты с введённой Гкал');
        assertEqual(w.days, 4, 'четыре даты с суточными записями');
    });

    test('Гкал из СТАРОЙ правки даты не считается (свежая запись сверху)', () => {
        const recs = [
            { curr: 6,     dateCurr: '8/25/2026' },              // свежая правка: Гкал убрана
            { curr: 2,     dateCurr: '8/25/2026', gcal: 9 },     // старая правка — не считается
            { curr: 4,     dateCurr: '8/24/2026', gcal: 1.5 }
        ];
        const w = fns.flowWeekCounterStats(recs, new Date(2026, 8, 2));  // ср
        assertEqual(w.sum, 10, 'т = 6 (свежая) + 4');
        assertEqual(w.gcal, 1.5, 'Гкал только из свежей записи 24.08');
        assertEqual(w.gcalDays, 1, 'одна дата с Гкал');
    });

    test('Агрегаты «за неделю/месяц» (entryType) не учитываются', () => {
        const recs = [
            { curr: 5,    dateCurr: '8/26/2026' },
            { curr: 700,  dateCurr: '8/26/2026', entryType: 'неделя' },
            { curr: 3000, dateCurr: '8/25/2026', entryType: 'месяц' }
        ];
        const w = fns.flowWeekCounterStats(recs, new Date(2026, 8, 2));
        assertEqual(w.sum, 5, 'агрегаты проигнорированы');
        assertEqual(w.days, 1, 'только одна суточная дата');
    });

    test('Правка за тот же день не задваивает счётчик (свежая запись сверху)', () => {
        const recs = [
            { curr: 6, dateCurr: '8/26/2026' },   // свежее (выше в архиве)
            { curr: 2, dateCurr: '8/26/2026' },   // старая правка той же даты
            { curr: 4, dateCurr: '8/25/2026' }
        ];
        const w = fns.flowWeekCounterStats(recs, new Date(2026, 8, 2));
        assertEqual(w.sum, 10, 'сумма = 6 (свежая за 26.08) + 4');
        assertEqual(w.days, 2, 'две даты');
    });

    test('Записей нет → sum=0, days=0, gcal=0, gcalDays=0', () => {
        const w = fns.flowWeekCounterStats([], new Date(2026, 8, 2));
        assertEqual(w.sum, 0, 'сумма 0');
        assertEqual(w.days, 0, 'дней 0');
        assertEqual(w.gcal, 0, 'Гкал 0');
        assertEqual(w.gcalDays, 0, 'дат с Гкал 0');
    });

    test('Мусорные записи (null, кривая дата, галимые Гкал) не роняют счётчик', () => {
        const recs = [
            { curr: 5, dateCurr: 'мусор' },
            { curr: 4, dateCurr: '8/25/2026', gcal: 'abc' },
            null
        ];
        const w = fns.flowWeekCounterStats(recs, new Date(2026, 8, 2));
        assertEqual(w.sum, 4, 'мусорная дата пропущена');
        assertEqual(w.days, 1, 'одна валидная дата');
        assertEqual(w.gcalDays, 0, 'нечисловая Гкал не считается');
    });

    test('now без Date → берётся текущая дата (не падает)', () => {
        const w = fns.flowWeekCounterStats([]);
        assertEqual(w.start.getDay(), 1, 'start — понедельник');
        assertEqual(w.end.getDay(), 0, 'end — воскресенье');
        assertEqual(w.sum, 0, 'пустой список записей');
    });
});

describe('Task 290 — flowWeekRangeLabel: подпись периода полной недели', () => {

    test('Неделя внутри одного года: «24.08–30.08.2026»', () => {
        assertEqual(fns.flowWeekRangeLabel(new Date(2026, 7, 24), new Date(2026, 7, 30)),
            '24.08–30.08.2026', 'ДД.ММ–ДД.ММ.ГГГГ');
    });

    test('Неделя через границу месяца: «28.09–04.10.2026»', () => {
        assertEqual(fns.flowWeekRangeLabel(new Date(2026, 8, 28), new Date(2026, 9, 4)),
            '28.09–04.10.2026', 'месяцы разные, год один — год один раз');
    });

    test('Неделя через границу года: обе даты с годом «28.12.2026–03.01.2027»', () => {
        assertEqual(fns.flowWeekRangeLabel(new Date(2026, 11, 28), new Date(2027, 0, 3)),
            '28.12.2026–03.01.2027', 'годы разные — обе даты полностью');
    });

    test('Невалидные даты → пустая строка', () => {
        assertEqual(fns.flowWeekRangeLabel(null, new Date(2026, 7, 30)), '', 'null → ""');
        assertEqual(fns.flowWeekRangeLabel(new Date(NaN), new Date(2026, 7, 30)), '', 'Invalid → ""');
    });
});

describe('Task 290/291 — клиент: счётчик «За неделю» в хронологии', () => {

    test('_buildWeekCounterHtml: метод определён, гвард dailyMode (только №1)', () => {
        assertTrue(INDEX_SRC.indexOf('_buildWeekCounterHtml: function(records, meter)') !== -1,
            'метод определён');
        assertTrue(INDEX_SRC.indexOf("if (!this._isDailyMode(meter)) return '';") !== -1,
            'только Хозрасчёт №1 (суточный ввод)');
    });

    test('Task 291: счётчик — ОТДЕЛЬНОЙ строкой ПОД заголовком (обе ветки рендера)', () => {
        // Заголовок — чистая строка без счётчика, счётчик — следующей
        // строкой (в обеих ветках: пустой архив и основная):
        const titleRow = "'<div class=\"flow-archive-title\">Хронология показаний</div>' + weekCounterHtml";
        assertEqual(INDEX_SRC.split(titleRow).length - 1, 2,
            'заголовок + weekCounterHtml отдельной строкой — и в пустой, и в основной ветке');
        assertFalse(INDEX_SRC.indexOf('flow-archive-title-text') !== -1,
            'внутренний span заголовка (flex-раскладка Task 289/290) удалён');
    });

    test('flowWeekCounterStats вызывается с текущей датой', () => {
        const m = INDEX_SRC.match(/flowWeekCounterStats\(records, new Date\(\)\)/);
        assertTrue(m !== null, 'вызов с new Date()');
    });

    test('Период недели подписан в счётчике (flowWeekRangeLabel)', () => {
        assertTrue(INDEX_SRC.indexOf('var period = flowWeekRangeLabel(wk.start, wk.end);') !== -1,
            'период из start/end полной недели');
        // Ищем литеральный фрагмент исходника рендера:
        const labelSpan = '><span class="flow-week-counter-label">За неделю \' + this._esc(period) + \':</span>';
        assertTrue(INDEX_SRC.indexOf(labelSpan) !== -1,
            'рендер подписи: «За неделю 24.08–30.08.2026:»');
    });

    test('Task 291: структура строки — подпись и значение неразрывны, перенос после двоеточия', () => {
        // Значение — отдельный спан после пробела: единственная точка
        // переноса — пробел после двоеточия
        assertTrue(INDEX_SRC.indexOf("' <span class=\"flow-week-counter-value\">' + valStr + '</span></div>'") !== -1,
            'рендер значения: <span value> через пробел после подписи');
        const css = INDEX_SRC.slice(
            INDEX_SRC.indexOf('.flow-week-counter-row {'),
            INDEX_SRC.indexOf('.flow-archive-empty'));
        assertTrue(css.indexOf('.flow-week-counter-label,') !== -1 &&
            css.indexOf('.flow-week-counter-value {') !== -1,
            'CSS подписи и значения');
        // Подпись и значение — каждый неразрывен: перенос ВОЗМОЖЕН
        // только между ними (после двоеточия)
        assertEqual(css.split('white-space: nowrap;').length - 1, 1,
            'white-space: nowrap на обоих спанах одним правилом');
        assertFalse(css.indexOf('white-space: normal;') !== -1,
            'старого переноса внутри счётчика (Task 290) нет');
    });

    test('Значения т + Гкал за полную неделю (Гкал — если есть)', () => {
        const m = INDEX_SRC.match(/\(wk\.days > 0\)\s*\?\s*\(this\._fmtNum\(wk\.sum\)\s*\+\s*' '\s*\+\s*this\._esc\(meter\.unit\)/);
        assertTrue(m !== null, 'т: _fmtNum(wk.sum) + unit');
        assertTrue(INDEX_SRC.indexOf("wk.gcal.toFixed(3).replace('.', ',') + ' Гкал'") !== -1,
            'Гкал: 3 знака, запятая');
        assertTrue(INDEX_SRC.indexOf('(wk.gcalDays > 0') !== -1,
            'Гкал показывается только когда есть значения за неделю');
    });

    test('Нет суточных записей на полной неделе → «За неделю …: —»', () => {
        const m = INDEX_SRC.match(/\(wk\.days > 0\)[\s\S]*?\?\s*[\s\S]*?\)\s*:\s*'—'/);
        assertTrue(m !== null, 'тернарник: days > 0 → значение, иначе «—»');
    });

    test('CSS счётчика: .flow-week-counter-row (тёмная + светлая) + непрозрачные фоны', () => {
        assertTrue(INDEX_SRC.indexOf('.flow-week-counter-row {') !== -1, 'базовый стиль');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .flow-week-counter-row {') !== -1, 'светлая тема');
        assertTrue(INDEX_SRC.indexOf('.flow-archive-title {') !== -1, 'заголовок (блочная строка)');
        // Task 291: непрозрачные фоны обеих строк — сетка страницы
        // (20×20) не просвечивает; цвета = зебра детальной карточки
        const titleCss = INDEX_SRC.slice(
            INDEX_SRC.indexOf('.flow-archive-title {'),
            INDEX_SRC.indexOf('.flow-week-counter-row {'));
        assertTrue(titleCss.indexOf('background: #372e2a;') !== -1,
            'заголовок: непрозрачный #372e2a (тёмная)');
        const rowCss = INDEX_SRC.slice(
            INDEX_SRC.indexOf('.flow-week-counter-row {'),
            INDEX_SRC.indexOf('.flow-archive-empty'));
        assertTrue(rowCss.indexOf('background: #463e38;') !== -1,
            'счётчик: непрозрачный #463e38 (тёмная)');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .flow-archive-title {') !== -1 &&
            INDEX_SRC.indexOf('background: #f5f0eb;') !== -1,
            'заголовок: #f5f0eb (светлая)');
        assertTrue(INDEX_SRC.indexOf('background: #ebe5de;') !== -1,
            'счётчик: #ebe5de (светлая)');
        // Flex-раскладка заголовка (Task 289/290) убрана
        const flexProps = ['display: flex;', 'justify-content: space-between;', 'flex-wrap: wrap;'];
        flexProps.forEach(function(p) {
            assertFalse(titleCss.indexOf(p) !== -1,
                'заголовок больше не flex: ' + p);
        });
    });

    test('Счётчик не пишет в архив (чистый рендер)', () => {
        const start = INDEX_SRC.indexOf('_buildWeekCounterHtml: function');
        const end = INDEX_SRC.indexOf('// Рендер секции хронологии');
        const body = INDEX_SRC.slice(start, end);
        assertFalse(body.indexOf('_submitPeriodEntry') !== -1,
            'нет записи показаний из счётчика');
        assertFalse(body.indexOf('updatePeriodReading') !== -1,
            'нет серверных вызовов из счётчика');
    });
});

// ============================================================
// E. Task 292 — заголовок графика: уточнение «посуточно»
// ============================================================

describe('Task 292 — заголовок графика: «Показания (посуточно)» для dailyMode', () => {

    function chartBody() {
        var fnIdx = INDEX_SRC.indexOf('_buildArchiveChart: function');
        var fnEnd = INDEX_SRC.indexOf('return html;', fnIdx);
        return INDEX_SRC.slice(fnIdx, fnEnd);
    }

    test('dailyMode: «Показания (посуточно)» + единица → «Показания (посуточно), т»', () => {
        var body = chartBody();
        assertTrue(body.indexOf("'Показания (посуточно)'") !== -1,
            'строка «Показания (посуточно)» для dailyMode');
        assertTrue(body.indexOf("chartTitle + ', ' + this._esc(unit)") !== -1,
            'единица приписывается через запятую');
    });

    test('НЕ-dailyMode: ветка «Расход» не тронута (Task 228)', () => {
        var body = chartBody();
        assertTrue(body.indexOf("'Расход'") !== -1,
            '«Расход» для остальных хозрасчётов');
        assertFalse(body.indexOf("'Показания'") !== -1,
            'голого «Показания» больше нет — только с уточнением (посуточно)');
    });

    test('График по-прежнему строится только из dayRecords (Task 286 не тронут)', () => {
        assertTrue(INDEX_SRC.indexOf('dayRecords = records.filter') !== -1,
            'фильтрация dayRecords на месте');
        assertTrue(INDEX_SRC.indexOf('this._buildArchiveChart(dayRecords, meter)') !== -1,
            'график — только суточные записи');
    });

    test('SW-кэш: v538 → v539 (Task 296 — только фронтенд, сервер не менялся)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v752'") !== -1,
            'CACHE_VERSION = kipia-test-v752');
        assertFalse(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v537'") !== -1,
            'старой версии v537 нет');
    });
});

// ============================================================
// C. Серверные справочные копии (.gs)
// ============================================================

describe('Task 286 — сервер: Flowmeter.gs (ветка entryType)', () => {

    test('updateReading нормализует entryType (сутки по умолчанию)', () => {
        assertTrue(FLOWMETER_GS.indexOf("var entryType = String(payload.entryType || 'сутки').trim().toLowerCase();") !== -1,
            'нормализация с дефолтом «сутки»');
        assertTrue(FLOWMETER_GS.indexOf("if (entryType !== 'неделя' && entryType !== 'месяц') entryType = 'сутки';") !== -1,
            'неизвестные значения → сутки');
    });

    test('Ветка «за период» уходит в _writePeriodEntry ДО meters-записи', () => {
        const branch = FLOWMETER_GS.indexOf("if (entryType === 'неделя' || entryType === 'месяц') {");
        assertTrue(branch !== -1, 'ветка есть');
        // Ветка до блока Task 205 (id===1) — до записи в meters:
        const task205 = FLOWMETER_GS.indexOf('if (id === 1) {');
        assertTrue(branch < task205, 'ветка периода раньше суточной логики');
    });

    test('_writePeriodEntry: метод определён, prev=0 (consumption = расход)', () => {
        assertTrue(FLOWMETER_GS.indexOf('_writePeriodEntry: function(payload, user, id, entryType)') !== -1,
            'метод определён');
        assertTrue(FLOWMETER_GS.indexOf('0, currVal,   // prev=0 → consumption (E) = введённый расход за период') !== -1,
            'prev=0 при записи в архив');
    });

    test('_writePeriodEntry: НЕ пишет в meters-строку', () => {
        // Вырезаем тело метода и проверяем отсутствие setValue в колонки meters
        const start = FLOWMETER_GS.indexOf('_writePeriodEntry: function');
        const end = FLOWMETER_GS.indexOf('setComment: function');
        const body = FLOWMETER_GS.slice(start, end);
        // setValue в _writePeriodEntry допустим только в архиве (через appendToArchive);
        // прямых getRange(rowNum, N).setValue (запись в meters) быть не должно:
        const metersWrites = body.match(/getRange\(rowNum, \d+\)\.setValue\(/g) || [];
        assertEqual(metersWrites.length, 0, 'нет прямых записей в meters-строку: ' + metersWrites.length);
        // Чтение (getValue) колонок 2/8/11 — допустимо (hoz/unit/period):
        assertTrue(body.indexOf('sheet.getRange(rowNum, 2).getValue()') !== -1,
            'чтение hoz (только getValue)');
    });

    test('_writePeriodEntry: hard-проверки (отрицательное значение, даты навыворот)', () => {
        const start = FLOWMETER_GS.indexOf('_writePeriodEntry: function');
        const end = FLOWMETER_GS.indexOf('setComment: function');
        const body = FLOWMETER_GS.slice(start, end);
        assertTrue(body.indexOf("error: 'sign_neg'") !== -1, 'проверка отрицательного значения');
        assertTrue(body.indexOf("error: 'date_inconsistent'") !== -1, 'проверка порядка дат');
    });

    test('Soft-валидация пропускается для периодов (правила суточные)', () => {
        const start = FLOWMETER_GS.indexOf('_writePeriodEntry: function');
        const end = FLOWMETER_GS.indexOf('setComment: function');
        const body = FLOWMETER_GS.slice(start, end);
        assertFalse(body.indexOf('ValidationRules.compute') !== -1,
            'ValidationRules.compute не вызывается для недели/месяца');
        assertFalse(body.indexOf('_requireEdit') !== -1,
            'авторизация уже выполнена в updateReading (нет повторного _requireEdit)');
    });

    test('Ошибка записи в архив — неуспех (архив — единственное хранилище)', () => {
        const start = FLOWMETER_GS.indexOf('_writePeriodEntry: function');
        const end = FLOWMETER_GS.indexOf('setComment: function');
        const body = FLOWMETER_GS.slice(start, end);
        // Task 376: стабильный код archive_write_failed (клиент отличает
        // «доставим позже» от «окончательный отказ»), человекочитаемый
        // текст — в message
        assertTrue(body.indexOf("return { ok: false, error: 'archive_write_failed'") !== -1,
            'ok:false при сбое архива');
        assertTrue(body.indexOf('повторно автоматически') !== -1,
            'message объясняет автоматический повтор');
    });

    test('Суточный путь помечает запись «сутки» (R=18)', () => {
        assertTrue(FLOWMETER_GS.indexOf("'сутки'  // Task 286: тип записи (R=18)") !== -1,
            'суточные записи помечены явно');
    });

    test('node --check: Flowmeter.gs синтаксически валиден', () => {
        const tmp = '/tmp/task286-flowmeter-check.js';
        fs.writeFileSync(tmp, FLOWMETER_GS);
        execSync('node --check ' + tmp);
        fs.unlinkSync(tmp);
        assertTrue(true, 'синтаксис валиден');
    });
});

describe('Task 286 — сервер: FlowmeterArchive.gs (колонка R)', () => {

    test('appendToArchive: параметр entryType (15-й)', () => {
        const m = ARCHIVE_GS.match(/appendToArchive: function\(meterId, hoz, prev, curr, datePrev, dateCurr, temp, gcal, unit, period, role, name, comment, anomaly, entryType\)/);
        assertTrue(m !== null, 'подпись с entryType');
    });

    test('appendRow пишет 18 значений (R = entryType)', () => {
        const m = ARCHIVE_GS.match(/String\(entryType \|\| ''\)\s+\/\/ R: entryType \(Task 286\)/);
        assertTrue(m !== null, 'R-колонка в appendRow');
    });

    test('Самовосстановление заголовка R1 (идемпотентно)', () => {
        const m = ARCHIVE_GS.match(/sheet\.getRange\(1, 18\)\.setValue\('entryType'\)/);
        assertTrue(m !== null, 'setValue заголовка при пустой ячейке R1');
    });

    test('listArchive читает 18 колонок и возвращает entryType', () => {
        assertTrue(ARCHIVE_GS.indexOf('lastRow - this.DATA_START_ROW + 1, 18);') !== -1,
            'getRange …18 колонок');
        assertTrue(ARCHIVE_GS.indexOf('entryType:   entryType                       // R=18 — Task 286') !== -1,
            'поле entryType в record');
        assertTrue(ARCHIVE_GS.indexOf("(entryTypeRaw === 'неделя' || entryTypeRaw === 'месяц') ? entryTypeRaw : 'сутки'") !== -1,
            'нормализация: пусто = сутки (legacy)');
    });

    test('getRecentAllMeters: 18 колонок + пропуск агрегатов', () => {
        const m = ARCHIVE_GS.match(/if \(etRaw === 'неделя' \|\| etRaw === 'месяц'\) continue;/);
        assertTrue(m !== null, 'агрегаты не участвуют в WRONG_METER');
    });

    test('flowmeterInitArchive: заголовок entryType (R=18)', () => {
        const m = ARCHIVE_GS.match(/'entryType'\s+\/\/ R=18 — Task 286/);
        assertTrue(m !== null, 'заголовок в init-функции');
    });

    test('Task 289: дни периода считаются ВКЛЮЧИТЕЛЬНО (01.08–31.08 = 31 день)', () => {
        const m = ARCHIVE_GS.match(/var etNorm = String\(entryType \|\| ''\)\.trim\(\)\.toLowerCase\(\);\s*if \(etNorm === 'неделя' \|\| etNorm === 'месяц'\) \{\s*daysBetween = daysBetween \+ 1;/);
        assertTrue(m !== null, 'период → daysBetween + 1');
        // Кламп отрицательной разницы стоит ДО инкремента: суточные записи
        // (без entryType) получают прежнюю семантику (разница дат).
        const clampPos = ARCHIVE_GS.indexOf('if (daysBetween < 0) daysBetween = 0;');
        const incPos = ARCHIVE_GS.indexOf('daysBetween = daysBetween + 1;');
        assertTrue(clampPos !== -1 && incPos !== -1 && clampPos < incPos,
            'кламп < 0 раньше инкремента периода');
    });

    test('node --check: FlowmeterArchive.gs синтаксически валиден', () => {
        const tmp = '/tmp/task286-archive-check.js';
        fs.writeFileSync(tmp, ARCHIVE_GS);
        execSync('node --check ' + tmp);
        fs.unlinkSync(tmp);
        assertTrue(true, 'синтаксис валиден');
    });
});

describe('Task 286 — сервер: Code.gs (маршрут updatePeriodReading)', () => {

    test("case 'flowmeter.updatePeriodReading' маршрутизируется в updateReading", () => {
        const m = CODE_GS.match(/case 'flowmeter\.updatePeriodReading':\s*\n\s*return _json\(Flowmeter\.updateReading\(payload\)\);/);
        assertTrue(m !== null, 'маршрут определён');
    });

    test('Маршрут distinct от суточного updateReading (защита от старого сервера)', () => {
        // Комментарий-обоснование в Code.gs (многострочный):
        const m = CODE_GS.match(/СТАРЫЙ[\s\S]{0,200}сервер без/);
        assertTrue(m !== null, 'комментарий о защите старого сервера');
        // Оба маршрута на месте:
        assertTrue(CODE_GS.indexOf("case 'flowmeter.updateReading':") !== -1,
            'суточный маршрут на месте');
        // Ровно один маршрут updatePeriodReading (нет дублей):
        const routes = CODE_GS.match(/case 'flowmeter\.updatePeriodReading':/g) || [];
        assertEqual(routes.length, 1, 'единственный маршрут updatePeriodReading');
    });

    test('node --check: Code.gs синтаксически валиден', () => {
        const tmp = '/tmp/task286-code-check.js';
        fs.writeFileSync(tmp, CODE_GS);
        execSync('node --check ' + tmp);
        fs.unlinkSync(tmp);
        assertTrue(true, 'синтаксис валиден');
    });
});
