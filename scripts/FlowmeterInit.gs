// ============================================================
// FlowmeterInit.gs — Одноразовая инициализация листа
// «hozraschet_meters» в Google Таблице из hardcoded данных
// ============================================================
// ИСПОЛЬЗОВАНИЕ:
//   1. Скопировать этот файл в проект Apps Script
//      (тот же проект, где Code.gs, Utils.gs, CableJournal.gs, Flowmeter.gs)
//   2. В редакторе Apps Script выбрать функцию flowmeterInitSheet
//   3. Нажать ▶ Run
//   4. Проверить лог (Ctrl+Enter) — должно быть «Инициализация завершена»
//   5. После инициализации этот файл можно удалить из проекта
//
// ВАЖНО: Даты записываются как Date objects, а не строки.
// Это исключает проблему, когда Google Sheets интерпретирует
// строку "8/3/2026" как D/M/YYYY (8 марта) вместо M/D/YYYY
// (3 августа) из-за русской локали таблицы.
// ============================================================

/**
 * Инициализация листа hozraschet_meters в Google Таблице.
 * Запускается один раз вручную из редактора Apps Script.
 *
 * @param {boolean} force - Если true, перезаписывает даже если лист уже есть
 *                          с данными. По умолчанию false (безопасный режим).
 */
function flowmeterInitSheet(force) {
  var SPREADSHEET_ID = '1enZSq7K8pwJVzaAI_tbXZtvATqARTxH0lSU4c-wc1eY';
  var SHEET_NAME = 'hozraschet_meters';

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  // --- Создать лист, если не существует ---
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    Logger.log('Лист «' + SHEET_NAME + '» создан.');
  } else {
    // Лист уже есть — проверить, есть ли данные
    var lastRow = sheet.getLastRow();
    if (lastRow > 1 && !force) {
      Logger.log('Лист «' + SHEET_NAME + '» уже содержит ' + (lastRow - 1) +
                 ' строк данных. Для перезаписи вызовите flowmeterInitSheet(true)');
      return;
    }
    Logger.log('Лист «' + SHEET_NAME + '» уже существует. Очищаем...');
    sheet.clear();
  }

  // --- Вспомогательная: M/D/YYYY → Date object ---
  // new Date(year, month-1, day) — month 0-indexed в JavaScript
  function mdy(s) {
    var p = s.split('/');
    return new Date(+p[2], +p[0] - 1, +p[1]);
  }

  // --- Hardcoded данные (из FlowmeterData._METERS в index.html) ---
  // Даты в формате M/D/YYYY, конвертируются в Date objects
  var METERS = [
    { id: 1,  hoz: 'Хозрасчёт №1',  param: 'Расход пара в корпус 114',                         datePrev: mdy('8/3/2026'),  dateCurr: mdy('8/10/2026'), prev: 73.60,     curr: 74.60,     unit: 'т',  temp: '',    period: 'Ежедневно' },
    { id: 2,  hoz: 'Хозрасчёт №2',  param: 'Расход воды речной в корпус 114',                  datePrev: mdy('8/3/2026'),  dateCurr: mdy('8/10/2026'), prev: 381484.00, curr: 381485.00, unit: 'м³', temp: '',    period: 'Ежедневно' },
    { id: 3,  hoz: 'Хозрасчёт №3',  param: 'Расход воды пожарохозяйственной (ПХВ) в корпус 114', datePrev: mdy('8/3/2026'), dateCurr: mdy('8/10/2026'), prev: 381484.00, curr: 381485.00, unit: 'м³', temp: '',    period: 'Еженедельно' },
    { id: 4,  hoz: 'Хозрасчёт №4',  param: 'Расход воздуха технологического в корпус 114',      datePrev: mdy('8/3/2026'),  dateCurr: mdy('8/10/2026'), prev: 314737.00, curr: 314738.00, unit: 'м³', temp: '',    period: 'Ежедневно' },
    { id: 5,  hoz: 'Хозрасчёт №5',  param: 'Расход воздуха КИП в корпус 114',                   datePrev: mdy('8/3/2026'),  dateCurr: mdy('8/10/2026'), prev: 90738.00,  curr: 90739.00,  unit: 'м³', temp: '',    period: 'Ежедневно' },
    { id: 6,  hoz: 'Хозрасчёт №6',  param: 'Расход природного газа общего в корпус 114',        datePrev: mdy('8/3/2026'),  dateCurr: mdy('8/10/2026'), prev: 8457.20,   curr: 8458.20,   unit: 'м³', temp: 32.7,  period: 'Ежедневно' },
    { id: 7,  hoz: 'Хозрасчёт №7',  param: 'Расход природного газа на печь поз. 704/1',         datePrev: mdy('8/3/2026'),  dateCurr: mdy('8/10/2026'), prev: 0.00,      curr: 0.00,      unit: 'м³', temp: '',    period: 'Ежедневно' },
    { id: 8,  hoz: 'Хозрасчёт №8',  param: 'Расход природного газа на печь поз. 704/2',         datePrev: mdy('8/3/2026'),  dateCurr: mdy('8/10/2026'), prev: 8544.50,   curr: 8545.50,   unit: 'м³', temp: '',    period: 'Ежедневно' },
    { id: 9,  hoz: 'Хозрасчёт №9',  param: 'Расход азота в корпус 114',                         datePrev: mdy('8/3/2026'),  dateCurr: mdy('8/10/2026'), prev: 8544.50,   curr: 8545.50,   unit: 'м³', temp: '',    period: 'Ежемесячно' },
    { id: 10, hoz: 'Хозрасчёт №10', param: 'Расход воздуха технологического в корпус 115',      datePrev: mdy('8/3/2026'),  dateCurr: mdy('8/10/2026'), prev: 4604.40,   curr: 4605.40,   unit: 'м³', temp: '',    period: 'Ежедневно' },
    { id: 11, hoz: 'Хозрасчёт №11', param: 'Расход воды речной в корпус 116',                   datePrev: mdy('8/3/2026'),  dateCurr: mdy('8/10/2026'), prev: 105240.00,  curr: 105241.00, unit: 'м³', temp: '',    period: 'Еженедельно' },
    { id: 12, hoz: 'Хозрасчёт №12', param: 'Расход воздуха технологического в корпус 116',      datePrev: mdy('8/3/2026'),  dateCurr: mdy('8/10/2026'), prev: 105240.00,  curr: 105241.00, unit: 'м³', temp: '',    period: 'Еженедельно' }
  ];

  // --- Заголовки (строка 1) ---
  var headers = ['id', 'hoz', 'param', 'datePrev', 'dateCurr', 'prev', 'curr', 'unit', 'temp', 'period'];

  // --- Формируем массив всех строк (заголовок + данные) ---
  var allRows = [headers];
  for (var i = 0; i < METERS.length; i++) {
    var m = METERS[i];
    allRows.push([
      m.id,
      m.hoz,
      m.param,
      m.datePrev,   // Date object — Google Sheets сохранит как дату
      m.dateCurr,   // Date object — Google Sheets сохранит как дату
      m.prev,
      m.curr,
      m.unit,
      m.temp,
      m.period
    ]);
  }

  // --- Записываем все данные за один вызов ---
  var range = sheet.getRange(1, 1, allRows.length, headers.length);
  range.setValues(allRows);

  // --- Форматирование ---
  // Заголовки: жирный шрифт, фон
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4a86e8');
  headerRange.setFontColor('#ffffff');

  // Столбец D и E (datePrev, dateCurr): формат даты DD.MM.YYYY
  sheet.getRange(2, 4, METERS.length, 2).setNumberFormat('dd.mm.yyyy');

  // Столбец F (prev) и G (curr): числовой формат с 2 знаками
  sheet.getRange(2, 6, METERS.length, 2).setNumberFormat('#,##0.00');

  // Столбец I (temp): числовой формат с 1 знаком
  sheet.getRange(2, 9, METERS.length, 1).setNumberFormat('#,##0.0');

  // Заморозить первую строку (заголовки)
  sheet.setFrozenRows(1);

  // Автоподбор ширины столбцов
  for (var c = 1; c <= headers.length; c++) {
    sheet.autoResizeColumn(c);
  }

  Logger.log('Инициализация завершена: лист «' + SHEET_NAME + '», ' +
             METERS.length + ' позиций расходомеров записано.');
  Logger.log('Столбцы: ' + headers.join(', '));
  Logger.log('Даты записаны как Date objects (3 августа 2026, 10 августа 2026).');
}

// ============================================================
// flowmeterFixDates — Исправить даты в существующем листе
// ============================================================
// Если даты в листе хранятся неправильно (например, Google Sheets
// интерпретировал "8/3/2026" как 8 марта вместо 3 августа),
// запустите эту функцию для исправления.
//
// Заменяет строковые даты и неправильно распарсенные Date objects
// на корректные Date objects (3 августа 2026, 10 августа 2026).
//
// @param {boolean} force - Если true, перезаписывает даже те даты,
//                          которые выглядят корректно. По умолчанию false.
// ============================================================
function flowmeterFixDates(force) {
  var SPREADSHEET_ID = '1enZSq7K8pwJVzaAI_tbXZtvATqARTxH0lSU4c-wc1eY';
  var SHEET_NAME = 'hozraschet_meters';

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log('Лист «' + SHEET_NAME + '» не найден!');
    return;
  }

  // Правильные даты: 3 августа 2026, 10 августа 2026
  var correctPrev = new Date(2026, 7, 3);   // Aug 3, 2026
  var correctCurr = new Date(2026, 7, 10);  // Aug 10, 2026

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('Нет данных для исправления.');
    return;
  }

  // Читаем столбцы D и E (datePrev, dateCurr)
  var range = sheet.getRange(2, 4, lastRow - 1, 2);
  var values = range.getValues();

  var fixed = 0;
  for (var i = 0; i < values.length; i++) {
    var datePrev = values[i][0];
    var dateCurr = values[i][1];

    var needsFix = force;

    if (!needsFix) {
      // Проверяем, нужно ли исправление
      if (datePrev instanceof Date) {
        // Если дата — 8 марта (месяц=2, день=8) вместо 3 августа (месяц=7, день=3)
        if (datePrev.getMonth() === 2 && datePrev.getDate() === 8) needsFix = true;
      } else if (typeof datePrev === 'string') {
        // Если строка содержит "08.03" или "8/3" — возможно неправильно
        if (datePrev.indexOf('08.03') !== -1 || datePrev === '8/3/2026') needsFix = true;
      }
    }

    if (needsFix) {
      // Записываем правильные Date objects
      var rowNum = i + 2;
      sheet.getRange(rowNum, 4).setValue(correctPrev);
      sheet.getRange(rowNum, 5).setValue(correctCurr);

      // Устанавливаем формат даты DD.MM.YYYY
      sheet.getRange(rowNum, 4).setNumberFormat('dd.mm.yyyy');
      sheet.getRange(rowNum, 5).setNumberFormat('dd.mm.yyyy');

      fixed++;
    }
  }

  Logger.log('Исправлено дат: ' + fixed + ' из ' + values.length + ' строк.');
  if (fixed === 0) {
    Logger.log('Все даты корректны — исправление не требуется.');
  }
}
