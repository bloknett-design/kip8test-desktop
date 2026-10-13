// ============================================================
// VacationsInit.gs — Одноразовая инициализация листа «Отпуска»
// в Google Таблице табель_КИП_ИОС (Task 274/275 — автоматическая
// расстановка отпусков в шахматке)
// ============================================================
// ИСПОЛЬЗОВАНИЕ:
//   1. Скопировать этот файл в проект Apps Script табели
//      (тот же проект, где Code.gs, Utils.gs, WorkSchedule.gs)
//   2. В редакторе Apps Script выбрать функцию vacationsInitSheet
//      в выпадающем списке функций
//   3. Нажать ▶ Run (первый запуск попросит авторизацию — разрешить)
//   4. Проверить лог выполнения (Ctrl+Enter / «Выполнение»)
//   5. После инициализации этот файл можно удалить из проекта
//
// ФУНКЦИИ:
//   vacationsInitSheet([force]) — создать/починить лист «Отпуска»:
//     • листа нет            → создать: шапка A1–F1, форматирование,
//                              валидации, подсветка пересечений;
//     • лист есть, БЕЗ force → БЕЗОПАСНЫЙ режим: данные не теряются;
//                              чинится шапка (если строки 1 не было —
//                              данные сдвигаются вниз) + Task 279
//                              самолечение: дозаполняются пустые id,
//                              текстовые даты конвертируются в Date;
//                              Task 281: столбец B — формат «@» (текст),
//                              список валидации — на весь лист
//                              «Сотрудники», числовые таб. номера
//                              канонизируются в текст (см. ниже);
//     • force = true         → полная перестройка (ДАННЫЕ УДАЛЯЮТСЯ!).
//   vacationsSeedDemo([force]) — демо-периоды из DEPLOY-инструкции
//     (017 — 3 части 28 дн., 023 — 1 часть). Добавляются только на
//     пустой лист (или force=true). Удобно для проверки сразу
//     после деплоя серверной части Task 274.
//
// СТРУКТУРА ЛИСТА (строка 1 — шапка, данные со строки 2; читает
// WorkSchedule.gs → VACATIONS_SHEET):
//   A: id             — число; присваивает приложение (max id + 1)
//   B: таб_номер      — текст, FK на лист «Сотрудники» (столбец A)
//   C: часть          — число 1–3 (отпуск делится на 2–3 части в год)
//   D: дата_начала    — дата
//   E: дата_окончания — дата
//   F: комментарий    — текст (до 500 символов)
//
// ВАЖНО: даты могут лежать и текстом («10.08.2026» — ручной ввод в
// локали, не распознавшей дату). Task 279: WorkSchedule.gs теперь
// парсит текстовые даты (_parseSheetDate), а vacationsInitSheet()
// ДОЗАПОЛНЯЕТ пустые id и конвертирует текстовые даты в настоящие
// Date (самолечение листа). vacationsSeedDemo пишет new Date(y, m, d).
//
// ВАЖНО (Task 281): таб. номер в столбце B хранится ТЕКСТОМ (PK —
// строка, в т.ч. ведущие нули: «017»). Раньше у B не было формата —
// «Авто» превращал ручной ввод «017» в число 17, а список валидации
// в «Сотрудники»!A — текст: requireValueInRange сравнивает значения
// СТРОГО по типу → любой ручной ввод отвергался с окном «Произошла
// ошибка. Табельный номер: выберите сотрудника из листа
// «Сотрудники».». Инициализатор ставит на B2:B формат «@» (текст —
// введённое сохраняется посимвольно), расширяет список валидации на
// ВЕСЬ лист «Сотрудники» и конвертирует числовые таб. номера в текст
// (и в «Отпуска»!B, и в «Сотрудники»!A — сервер читает их через
// String(), семантика не меняется, тип становится единым).
//
// Идемпотентность: повторный запуск vacationsInitSheet() безопасен —
// данные сохраняются, переустанавливаются только шапка/форматирование/
// валидации/подсветка. Из других листов скрипт читает «Сотрудники»
// (источник списка валидации) и при необходимости канонизирует
// числовые таб. номера в текст (строка — PK по спецификации
// WorkSchedule.gs); на другие листы скрипт НЕ пишет.
// ============================================================

/**
 * Инициализация листа «Отпуска» в табель_КИП_ИОС.
 * Запускается вручную из редактора Apps Script (один раз).
 *
 * @param {boolean} [force] — true: очистить лист и перестроить
 *                            (ДАННЫЕ УДАЛЯЮТСЯ). По умолчанию false.
 * @return {Object} { sheet, rows, created, force }
 */
function vacationsInitSheet(force) {
  // Тот же ID, что и WorkSchedule.gs (табель_КИП_ИОС)
  var SPREADSHEET_ID = '1MQtW-CWCmjlu-SAeVBllKDP6NRkiOkmW-7xgOjHskWY';
  var SHEET_NAME = 'Отпуска';
  var HEADERS = ['id', 'таб_номер', 'часть', 'дата_начала', 'дата_окончания', 'комментарий'];
  var VALIDATION_ROWS = 1000;  // валидации/подсветка до строки 1000

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  // --- Создать лист, если не существует ---
  var created = false;
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    created = true;
    Logger.log('Лист «' + SHEET_NAME + '» создан.');
  }

  var lastRow = sheet.getLastRow();
  var hasData = lastRow >= 2;

  // --- force: полная перестройка (данные удаляются!) ---
  if (force) {
    if (hasData) {
      Logger.log('⚠ FORCE: лист очищается — ' + (lastRow - 1) +
                 ' строк данных будет удалено.');
    }
    sheet.clear();
    hasData = false;
  }

  // --- Шапка (строка 1) ---
  // Приложение читает данные СТРОГО со строки 2: всё, что стоит в
  // строке 1, воспринимается как шапка и в данные НЕ попадает.
  //   • строка 1 пуста            → пишем шапку в неё (данные со
  //                                 строки 2 остаются на месте);
  //   • A1 = 'id'                 → шапка на месте, канонизируем все
  //                                 6 ячеек (починка опечаток);
  //   • A1 заполнен чем-то иным   → в строке 1 ДАННЫЕ (приложение их
  //                                 не видело!) — вставляем строку
  //                                 сверху, данные сдвигаются вниз
  //                                 и становятся видимыми.
  var a1 = String(sheet.getRange(1, 1).getValue()).trim();
  if (a1 !== '' && a1 !== HEADERS[0]) {
    sheet.insertRowBefore(1);
    Logger.log('⚠ Строка 1 содержала данные («' + a1 + '») — вставлена ' +
               'строка шапки, данные сдвинуты вниз (ранее приложение ' +
               'их не видело: чтение идёт со строки 2).');
  }
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

  // --- Форматирование ---
  // Стиль как у остальных инициализируемых листов (FlowmeterInit.gs):
  // жирная шапка, синий фон, белый текст, закрепление строки 1.
  var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setFontWeight('bold')
             .setBackground('#4a86e8')
             .setFontColor('#ffffff');

  sheet.setFrozenRows(1);

  // Ширины столбцов (autoResizeColumn не подходит: у пустого столбца
  // без данных он сужается до минимума)
  sheet.setColumnWidth(1, 60);    // id
  sheet.setColumnWidth(2, 110);   // таб_номер
  sheet.setColumnWidth(3, 70);    // часть
  sheet.setColumnWidth(4, 120);   // дата_начала
  sheet.setColumnWidth(5, 130);   // дата_окончания
  sheet.setColumnWidth(6, 320);   // комментарий

  // Форматы на весь столбец (открытые диапазоны A2:A — новые строки
  // наследуют формат):
  sheet.getRange('A2:A').setNumberFormat('0');           // id — целое
  // Task 281: таб_номер — ТЕКСТ (формат «@»). Без него ручной ввод
  // «017»/«17» в ячейке формата «Авто» превращается в ЧИСЛО, а список
  // валидации — текст (requireValueInRange сравнивает строго по
  // типу) → ввод отвергался: «Произошла ошибка. Табельный номер:
  // выберите сотрудника из листа "Сотрудники"». С «@» введённое
  // сохраняется посимвольно (ведущие нули — на месте) и совпадает
  // со списком. Приложение пишет таб строкой и читает String() —
  // формат на запись/чтение не влияет.
  sheet.getRange('B2:B').setNumberFormat('@');           // таб_номер — текст
  sheet.getRange('C2:C').setNumberFormat('0');           // часть — целое
  sheet.getRange('D2:E').setNumberFormat('dd.mm.yyyy');  // даты
  sheet.getRange('A2:A').setHorizontalAlignment('center');
  sheet.getRange('C2:E').setHorizontalAlignment('center');

  // --- Валидация: часть = целое 1..3 (ст. 125 ТК РФ) ---
  // addVacation отклонит неверную часть на сервере; валидация
  // помогает при ручном редактировании листа.
  // ВАЖНО: у DataValidationBuilder НЕТ метода setHelpTitle — только
  // setHelpText (иначе TypeError, Task 276). Не добавлять.
  var partRule = SpreadsheetApp.newDataValidation()
    .requireNumberBetween(1, 3)
    .setAllowInvalid(false)
    .setHelpText('Часть отпуска: введите 1, 2 или 3 (ст. 125 ТК РФ — отпуск делится на 1–3 части в год).')
    .build();
  sheet.getRange(2, 3, VALIDATION_ROWS - 1, 1).setDataValidation(partRule);

  // --- Валидация: таб_номер — выпадающий список из «Сотрудники» ---
  var empSheet = ss.getSheetByName('Сотрудники');
  if (empSheet && empSheet.getLastRow() >= 2) {
    // Task 281: диапазон списка — на ВЕСЬ лист «Сотрудники»
    // (getMaxRows), а не до последней заполненной строки: сотрудники,
    // добавленные ПОСЛЕ инициализации, попадают в выпадающий список,
    // пока их строка в пределах листа. Пустые ячейки диапазона в
    // список не попадают — безопасно. При нехватке — перезапуск
    // vacationsInitSheet() обновляет диапазон (идемпотентно).
    var empRows = Math.max(empSheet.getMaxRows() - 1,
                           empSheet.getLastRow() - 1, 1);
    var empRange = empSheet.getRange(2, 1, empRows, 1);
    var empRule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(empRange, true)  // true — показывать список
      .setAllowInvalid(false)
      .setHelpText('Табельный номер: выберите сотрудника из листа «Сотрудники».')
      .build();
    sheet.getRange(2, 2, VALIDATION_ROWS - 1, 1).setDataValidation(empRule);
    Logger.log('Выпадающий список таб_номер: ' + (empSheet.getLastRow() - 1) +
               ' сотрудников из листа «Сотрудники».');
  } else {
    Logger.log('⚠ Лист «Сотрудники» пуст или не найден — выпадающий список ' +
               'таб_номер не настроен (не критично, можно заполнить вручную).');
  }

  // --- Подсветка пересечений периодов одного сотрудника (D2:E) ---
  // Сервер addVacation отклоняет пересечения; при РУЧНОМ заполнении
  // пересекающиеся периоды подсвечиваются красным. Периоды
  // [s1..e1] и [s2..e2] пересекаются, если s1 <= e2 и e1 >= s2.
  // «<>» (непустые) в COUNTIFS и guards $D2/$E2 — черновики без
  // дат (заполнен только таб_номер) не дают ложных пересечений.
  // Task 277: 1) у правила ОБЯЗАТЕЛЬНО setRanges — без него build()
  // бросает «Ranges must have at least one range»; 2) формула — с
  // префиксом «=» (синтаксис формул UI); 3) 1000 в диапазонах
  // COUNTIFS = VALIDATION_ROWS (ограничено для скорости).
  // Подсветка — косметика: сбой не должен валить инициализацию,
  // блок под try/catch (сервер пересечения всё равно отклоняет).
  try {
    var overlapRange = sheet.getRange(2, 4, VALIDATION_ROWS - 1, 2);  // D2:E1000
    var overlapFormula = '=AND($B2<>"", $D2<>"", $E2<>"", ' +
      'COUNTIFS($B$2:$B$1000,$B2, $D$2:$D$1000,"<>", $E$2:$E$1000,"<>", ' +
      '$D$2:$D$1000,"<="&$E2, $E$2:$E$1000,">="&$D2) > 1)';
    var overlapRule = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(overlapFormula)
      .setBackground('#f4c7c3')
      .setRanges([overlapRange])
      .build();
    // Правила листа заменяются целиком (идемпотентность повторных
    // запусков; свои правила на листе «Отпуска» завести заново).
    sheet.setConditionalFormatRules([overlapRule]);
    var appliedRules = sheet.getConditionalFormatRules();
    Logger.log('Подсветка пересечений периодов: D2:E' + VALIDATION_ROWS +
               ' (красный фон); правил на листе: ' + appliedRules.length + '.');
  } catch (cfErr) {
    Logger.log('⚠ Не удалось настроить подсветку пересечений: ' + cfErr +
               ' (не критично — сервер addVacation всё равно отклоняет ' +
               'пересечения). Лист полностью рабочий.');
  }

  // --- Task 281: канонизация таб. номеров «Сотрудники» (строка — PK) ---
  // Числовые таб. номера в «Сотрудники»!A (ручной ввод в ячейку
  // «Авто» и/или вставка из буфера) конвертируются в ТЕКСТ: сервер и
  // фронтенд читают таб через String() (семантика не меняется), а
  // тип становится единым с записями приложения (addEmployee пишет
  // строку). Заодно строим карту для самолечения «Отпуска»!B (ниже):
  // tabByNum = { число → текстовый таб } для однозначных соответствий.
  // empSheet определён выше (блок валидации); если «Сотрудники»
  // нет/пуст — карты пусты, числовые таб. номера в B останутся числами
  // (с предупреждением в логе — валидации на них тоже нет).
  var tabByNum = {};      // число → текстовый таб (однозначное соответствие)
  var tabAmbiguous = {};  // число → true (несколько разных текстов)
  if (empSheet && empSheet.getLastRow() >= 2) {
    var empTabVals = empSheet.getRange(2, 1, empSheet.getLastRow() - 1, 1).getValues();
    var empNumFixed = 0;
    for (var te = 0; te < empTabVals.length; te++) {
      var empTabVal = empTabVals[te][0];
      if (typeof empTabVal === 'number') {
        // числовой таб → текст (только столбец A, только эта ячейка)
        empSheet.getRange(te + 2, 1).setValue(String(empTabVal)).setNumberFormat('@');
        empNumFixed++;
        empTabVal = String(empTabVal);
      }
      var tabTxt = String(empTabVal).trim();
      if (!tabTxt) continue;
      var tabInt = parseInt(tabTxt, 10);
      if (isNaN(tabInt)) continue;
      if (tabByNum[tabInt] && tabByNum[tabInt] !== tabTxt) {
        tabAmbiguous[tabInt] = true;  // «017» и «17» — разные сотрудники
      } else {
        tabByNum[tabInt] = tabTxt;
      }
    }
    if (empNumFixed > 0) {
      Logger.log('Task 281 — канонизация «Сотрудники»!A: числовых ' +
                 'таб. номеров сконвертировано в текст: ' + empNumFixed +
                 ' (сервер читает их через String — семантика не меняется).');
    }
  }

  // --- Task 279: нормализация данных (id и текстовые даты) ---
  // Причины бага «при формировании не формируются отпуска в шахматке»:
  //   (1) пустой id в столбце A — деплой-док Task 274 разрешал
  //       «id можно не заполнять», но сервер ДО Task 279 молча
  //       выбрасывал такие строки;
  //   (2) даты текстом («10.08.2026») — тоже молча выбрасывались
  //       (instanceof Date === false).
  // Оба дефекта чинятся и на чтении (WorkSchedule._parseSheetDate,
  // id: null допустим), и здесь — на данных: id дозаполняются
  // (max id + 1), текстовые даты конвертируются в Date. Данные не
  // теряются, повторный запуск ничего не меняет (идемпотентно).
  // force-режим сюда не доходит — лист очищен выше.
  if (sheet.getLastRow() >= 2) {
    var normLastRow = sheet.getLastRow();
    var normVals = sheet.getRange(2, 1, normLastRow - 1, 6).getValues();
    var normMaxId = 0;
    for (var mi = 0; mi < normVals.length; mi++) {
      var normId = parseInt(normVals[mi][0], 10);
      if (!isNaN(normId) && normId > normMaxId) normMaxId = normId;
    }
    var idsFixed = 0, datesFixed = 0, tabsFixed = 0;
    for (var ni = 0; ni < normVals.length; ni++) {
      var normRow = ni + 2;
      // 1) пустой id (A) → дозаполнить max id + 1
      if (normVals[ni][0] === '' || normVals[ni][0] === null) {
        // дозаполняем только содержательные строки (есть таб или дата)
        if (String(normVals[ni][1] || '').trim() || vacParseDate(normVals[ni][3])) {
          normMaxId++;
          sheet.getRange(normRow, 1).setValue(normMaxId);
          idsFixed++;
        }
      }
      // 2) Task 281: таб_номер числом (B) → текстовый таб из
      //    «Сотрудники» (ручной ввод до фиксы / вставка из буфера
      //    обходили валидацию: 17 → «017»). Неоднозначное соответствие
      //    («017» и «17» у разных сотрудников) — оставляем числом.
      if (typeof normVals[ni][1] === 'number') {
        var numTab = normVals[ni][1];
        if (!tabAmbiguous[numTab] && tabByNum[numTab]) {
          sheet.getRange(normRow, 2).setValue(tabByNum[numTab]);
          tabsFixed++;
        } else {
          Logger.log('⚠ строка ' + normRow + ': таб_номер-число ' + numTab +
                     ' не сопоставлен однозначно с «Сотрудники» — оставлен' +
                     ' числом (замените вручную на таб из списка).');
        }
      }
      // 3) текстовые даты (D, E) → настоящие Date + формат dd.mm.yyyy
      for (var dc = 4; dc <= 5; dc++) {
        var cellVal = normVals[ni][dc - 1];
        if (cellVal instanceof Date) continue;
        var parsedDate = vacParseDate(cellVal);
        if (parsedDate) {
          sheet.getRange(normRow, dc).setValue(parsedDate).setNumberFormat('dd.mm.yyyy');
          datesFixed++;
        }
      }
    }
    if (idsFixed > 0 || datesFixed > 0 || tabsFixed > 0) {
      Logger.log('Task 279/281 — самолечение данных: дозаполнено id: ' + idsFixed +
                 ', дат сконвертировано из текста: ' + datesFixed +
                 ', таб_номер-чисел исправлено: ' + tabsFixed + '.' +
                 ' (раньше такие строки не попадали в план и «Сформировать»)');
    } else {
      Logger.log('Данные листа в порядке: пустых id, текстовых дат и ' +
                 'числовых таб_номеров нет.');
    }
  }

  // --- Итог ---
  var dataRows = Math.max(0, sheet.getLastRow() - 1);
  Logger.log('==========================================');
  Logger.log('Лист «' + SHEET_NAME + '» готов' +
             (created ? ' (создан)' : ' (существовал)') + '.');
  Logger.log('Столбцы: ' + HEADERS.join(', '));
  Logger.log('Строк данных: ' + dataRows + ' — ' +
             (force ? 'очищено (force)' : 'сохранены'));
  Logger.log('Следующий шаг: деплой WorkSchedule.gs + Code.gs — см. ' +
             'scripts/DEPLOY-Task274-vacations.md.');
  if (dataRows === 0) {
    Logger.log('Совет: для быстрой проверки запустите vacationsSeedDemo() — ' +
               'демо-периоды 017 (3 части) и 023 (1 часть).');
  }
  return { sheet: SHEET_NAME, rows: dataRows, created: created, force: !!force };
}

// ============================================================
// vacationsSeedDemo — демо-периоды из DEPLOY-инструкции
// ============================================================
// Заполняет лист «Отпуска» примером из DEPLOY-Task274-vacations.md:
//   017 — 3 части (14 + 10 + 4 = 28 дн.), 023 — 1 часть (14 дн.).
// Добавляет ТОЛЬКО на пустой лист (или с force=true — тогда поверх
// существующих, id продолжается от max id).
//
// Даты — Date objects (месяц в JavaScript 0-indexed: 5 = июнь).
// После деплоя серверной части: «Сформировать» за 2026 год проставит
// «О» в июне/августе/октябре у 017 и в июне у 023.
//
// @param {boolean} [force] — true: добавить поверх существующих данных.
// ============================================================
function vacationsSeedDemo(force) {
  var SPREADSHEET_ID = '1MQtW-CWCmjlu-SAeVBllKDP6NRkiOkmW-7xgOjHskWY';
  var SHEET_NAME = 'Отпуска';

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log('⚠ Лист «Отпуска» не найден — сначала запустите ' +
               'vacationsInitSheet().');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow >= 2 && !force) {
    Logger.log('Лист уже содержит данные (' + (lastRow - 1) +
               ' строк) — демо не добавлено.');
    Logger.log('Для добавления демо поверх существующих: ' +
               'vacationsSeedDemo(true).');
    return;
  }

  // Демо-периоды (пример из DEPLOY-Task274-vacations.md)
  var DEMO = [
    { tab: '017', part: 1, start: new Date(2026, 5, 1),  end: new Date(2026, 5, 14),  comment: 'основная часть' },
    { tab: '017', part: 2, start: new Date(2026, 7, 3),  end: new Date(2026, 7, 12),  comment: '' },
    { tab: '017', part: 3, start: new Date(2026, 9, 19), end: new Date(2026, 9, 22),  comment: '' },
    { tab: '023', part: 1, start: new Date(2026, 5, 15), end: new Date(2026, 5, 28),  comment: '' }
  ];

  // Предупреждение: страница «Отпуска» строится по списку «Сотрудники»
  // (join по таб_номер) — периоды несуществующих номеров не отобразятся.
  var empSheet = ss.getSheetByName('Сотрудники');
  if (empSheet && empSheet.getLastRow() >= 2) {
    var empVals = empSheet.getRange(2, 1, empSheet.getLastRow() - 1, 1).getValues();
    var tabs = {};
    for (var i = 0; i < empVals.length; i++) {
      tabs[String(empVals[i][0]).trim()] = true;
    }
    var warned = {};
    for (var j = 0; j < DEMO.length; j++) {
      var t = DEMO[j].tab;
      if (!warned[t]) {
        warned[t] = true;
        if (!tabs[t]) {
          Logger.log('⚠ таб_номер ' + t + ' отсутствует в «Сотрудники» — ' +
                     'его периоды не отобразятся на странице «Отпуска» ' +
                     '(замените таб в скрипте на реальный номер).');
        }
      }
    }
  }

  // max id в столбце A (та же логика, что в addVacation)
  var maxId = 0;
  if (lastRow >= 2) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var k = 0; k < ids.length; k++) {
      var v = parseInt(ids[k][0], 10);
      if (!isNaN(v) && v > maxId) maxId = v;
    }
  }

  // Добавление (appendRow, как в addVacation: [id, таб, часть, start, end, комментарий])
  for (var d = 0; d < DEMO.length; d++) {
    var row = DEMO[d];
    maxId++;
    sheet.appendRow([maxId, row.tab, row.part, row.start, row.end, row.comment]);
  }

  Logger.log('Добавлено демо-периодов: ' + DEMO.length +
             ' (id ' + (maxId - DEMO.length + 1) + '…' + maxId + ').');
  Logger.log('017: 3 части (14 + 10 + 4 = 28 дн.), 023: 1 часть (14 дн.).');
  Logger.log('Даты записаны как Date objects. «Сформировать» (2026) ' +
             'проставит «О»: июнь/август/октябрь — 017, июнь — 023.');
}

// ============================================================
// vacParseDate / vacSafeDate — локальный парсер дат (Task 279)
// ============================================================
// Не зависит от WorkSchedule.gs (файл можно запускать отдельно).
// Date → как есть; «dd.mm.yyyy» / «dd.mm.yy» / «yyyy-mm-dd» → Date;
// остальное (пусто, число, мусор) → null. Совпадает по поведению
// с WorkSchedule._parseSheetDate.
// ============================================================
function vacParseDate(v) {
  if (v instanceof Date) return v;
  if (v === null || v === undefined) return null;
  var s = String(v).trim();
  if (!s) return null;
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);        // ISO
  if (m) return vacSafeDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);  // dd.mm.yyyy
  if (m) return vacSafeDate(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2})$/);   // dd.mm.yy
  if (m) return vacSafeDate(2000 + +m[3], +m[2], +m[1]);
  return null;
}

function vacSafeDate(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (y < 1900 || y > 2100) return null;
  var dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    return null;
  }
  return dt;
}
