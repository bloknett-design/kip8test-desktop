// ============================================================
// StatusCodesInit.gs — автоматическая замена листа
// «Коды_статусов» в таблице «График работы» (Task 299)
// ============================================================
// НАЗНАЧЕНИЕ:
//   Автоматизирует ШАГ 1 (и по желанию ШАГИ 2–3) деплоя
//   Task 298 (см. scripts/DEPLOY-Task298-status-codes.md):
//   вместо ручной замены 10 строк на 16 в таблице Google —
//   один запуск скрипта из редактора Apps Script.
//
// ИСПОЛЬЗОВАНИЕ:
//   1. Открыть редактор Apps Script (проект развёртывания
//      AKfycbyt… — тот же, где WorkSchedule.gs)
//   2. + → Создать файл «StatusCodesInit.gs», вставить содержимое
//      этого файла ЦЕЛИКОМ
//   3. В выпадающем списке функций выбрать нужную и нажать ▶ Run
//      (первый запуск попросит авторизацию — разрешить)
//   4. Результат смотреть в журнале (Ctrl+Enter / «Выполнения»)
//   5. После завершения деплоя файл можно удалить из проекта
//      (код приложения его НЕ использует — это разовый инструмент)
//
// ФУНКЦИИ (каждая запускается отдельно):
//   statusCodesReplace([force])  — ШАГ 1: заменить лист
//                                  «Коды_статусов» на эталонный
//                                  состав 16 кодов. Старый лист НЕ
//                                  удаляется, а сохраняется как
//                                  «Коды_статусов_резерв_<дата>».
//                                  force=true — заменить, даже если
//                                  состав уже совпадает (починка
//                                  оформления).
//   migrateVacationStatus()      — ШАГ 2: миграция «О» → «ОТ» в
//                                  «Записи_графика» (только точное
//                                  совпадение «О» в колонке C, с
//                                  учётом регистра — «ОТ»/«ОБ»/«д»
//                                  не затрагиваются). Перед правкой
//                                  создаётся резервная копия листа.
//   updateCycleDaysTemplate2()   — ШАГ 3 (опция): «Дни_цикла»,
//                                  шаблон 2 «Дневной 5/2» — дни 1–4
//                                  «Д» → «Д8», день 5 «Д» → «Д7,2»
//                                  (см. DEPLOY-Task298, рекомендация).
//   statusCodesCleanupBackups()  — удалить все резервные листы
//                                  («…_резерв_*» трёх семейств),
//                                  когда деплой проверен и откаты
//                                  больше не нужны.
//
// БЕЗОПАСНОСТЬ:
//   - Старое содержимое НИКОГДА не теряется: перед заменой текущий
//     лист переименовывается в «Коды_статусов_резерв_<дата_время>»
//     и остаётся в таблице (откат = переименовать обратно).
//   - Миграция/Дни_цикла перед правками копируют лист целиком
//     (copyTo) в «…_резерв_<дата_время>».
//   - Все операции затрагивают ТОЛЬКО перечисленные листы;
//     остальные листы таблицы не читаются и не пишутся.
//   - Идемпотентность: повторный запуск безопасен — уже
//     актуальные части пропускаются, лишние резервы не плодятся.
//   - Прочие листы (Сотрудники, Отпуска, Инструктажи и т.д.) не
//     трогаются. Кэшей сервера это не требует: WorkSchedule.gs
//     читает «Коды_статусов» без кэша (Task 298) — состав
//     подхватывается приложением сразу после замены (обновить
//     страницу в браузере).
//
// СТРУКТУРА ЛИСТА (та же, что читает WorkSchedule.gs →
// STATUS_CODES_SHEET; строка 1 — шапка, данные со строки 2):
//   A: код            — PK, регистрозависим («Д» ≠ «д»)
//   B: название       — текст (до ~500 симв.)
//   C: цвет_заливки   — HEX вида «#RRGGBB» (для попапа шахматки)
//
// СОСТАВ 16 КОДОВ — Т-12/Т-13 (Task 298, Табель):
//   Д, Д8, Д7,2, Н, д, н, ОТ, У, ОВ, Б, ПР, И, ОБ, ПЗ, *, .
//   ВАЖНО: «Д8» и «Д7,2» — ДВА РАЗНЫХ кода (в ручной правке
//   пользователя они были склеены в одну строку «Д8, Д7,2» —
//   так не работает: колонка A — первичный ключ, код сверяется
//   точным совпадением в _validateStatusCode и в попапе клиента).
//   Цвета там, где в ручной правке стояло «?», взяты из
//   согласованного набора Task 298 (Q2).
// ============================================================

// Целевая таблица — «График работы» (тот же ID, что в
// WorkSchedule.gs; скрипт открывает её по ID явно, чтобы
// исключить запись «не в ту таблицу»).
var SC_SPREADSHEET_ID = '1MQtW-CWCmjlu-SAeVBllKDP6NRkiOkmW-7xgOjHskWY';

var SC_SHEET_NAME = 'Коды_статусов';
var SC_HEADERS    = ['код', 'название', 'цвет_заливки'];

// Префиксы резервных листов (для поиска/очистки)
var SC_BACKUP_PREFIX  = 'Коды_статусов_резерв_';
var SC_ENTRIES_SHEET  = 'Записи_графика';
var SC_ENTRIES_BACKUP = 'Записи_графика_резерв_';
var SC_CYCLE_SHEET    = 'Дни_цикла';
var SC_CYCLE_BACKUP   = 'Дни_цикла_резерв_';

// Цвет шапки — как в текущем листе пользователя (тёмный,
// белый текст), чтобы замена не меняла привычный вид.
var SC_HEADER_BG = '#1F4E5F';

// ------------------------------------------------------------
// ЭТАЛОННЫЙ СОСТАВ (Task 298 → 387, 16 кодов по Т-12/Т-13).
// Task 387 (заявка): порядок — по группам (Д8/Д7,2/Д/Н/д/н →
// отпуска → отгул → больничный → выходной → прогул → меропри-
// ятия), описания — полные формулировки заявки; «Выходной» —
// код ПУСТОЙ (пользователь убрал «.» из листа: выходной = пустая
// ячейка белого цвета, точка-символ в приложении не показывается;
// легаси-«.» в Записях_графика рендерится пустой ячейкой). Цвет
// «Выходного» справочный — приложение красит его свотч/ячейку
// классом пустой ячейки (ws-swatch-dot/ws-dot-code), цвет из
// листа не применяется. Клиент нормализует справочник тем же
// каноном (_STATUS_CODES_CANON в index.html) — порядок/формули-
// ровки листа не критичны для отображения, эта замена — консис-
// тентность данных. Если нужно поменять формулировку/цвет —
// правьте ЗДЕСЬ (и канон в index.html) и запустите
// statusCodesReplace() заново (предыдущее состояние уйдёт
// в резерв). Код (колонка A) менять НЕЛЬЗЯ без правки
// приложения: он зашит в generateMonth («ОТ»), попап и тесты.
// ------------------------------------------------------------
var SC_STATUS_CODES = [
  ['Д8',   'День, плановая дневная 8-часовая смена (с 7:30 до 16:30), в пятницу (предпраздничный день) на час короче', '#FFF9C4'],
  ['Д7,2', 'День, плановая дневная 7,2-часовая смена (с 7:30 до 15:48), в пятницу (предпраздничный день) на час короче', '#FFF9C4'],  // Task 302: цвет = как у Д8 (решение пользователя 03.09.2026); было #FFF176
  ['Д',    'День, плановая дневная 12-часовая смена (с 7:30 до 19:30)', '#FFE082'],
  ['Н',    'Ночь, плановая ночная 12-часовая смена (с 19:30 до 7:30)', '#B0BEC5'],
  ['д',    'День, плановая продолжительность работы в выходные и нерабочие праздничные дни, для сменного персонала дневная 12-часовая смена (с 7:30 до 19:30), для дневного персонала — с указанием продолжительности (в часах) в комментарии', '#FFD54F'],
  ['н',    'Ночь, плановая продолжительность работы в выходные и нерабочие праздничные дни, для сменного персонала ночная 12-часовая смена (с 19:30 до 7:30), для дневного персонала — с указанием продолжительности (в часах) в комментарии', '#78909C'],
  ['ОТ',   'Отпуск, ежегодный основной оплачиваемый отпуск', '#ECEFF1'],
  ['У',    'Учебный отпуск, дополнительный отпуск в связи с обучением с сохранением среднего заработка', '#80CBC4'],
  ['ОВ',   'Отгул, выходные дни (оплачиваемые, за ранее отработанное время, без содержания — с указанием в комментарии)', '#C5E1A5'],
  ['Б',    'Больничный, временная нетрудоспособность с назначением пособия', '#F8BBD0'],
  ['',     'Выходной, плановый выходной день', '#EEF0F2'],
  ['ПР',   'Прогул (отсутствие без уважительных причин)', '#EF5350'],
  ['И',    'Инструктаж, проведение повторных инструктажей по охране труда и промышленной безопасности', '#B3E5FC'],
  ['ОБ',   'Обучение, обучение по охране труда и промышленной безопасности', '#D1C4E9'],
  ['ПЗ',   'Проверка знаний, по охране труда и промышленной безопасности, до 1000В, на допуск к самостоятельной работе', '#FFCDD2'],
  ['*',    'Примечание, не плановые или не регламентированные случаи (аварийные работы, принят, уволен), с обязательным комментированием', '#FFAB91']
];

// ============================================================
// ШАГ 1: замена листа «Коды_статусов»
// ============================================================
/**
 * Заменяет лист «Коды_статусов» на эталонный состав 16 кодов.
 * Старый лист сохраняется как «Коды_статусов_резерв_<дата_время>»
 * (полный откат = вернуть старое имя).
 *
 * @param {boolean} [force] — true: заменить даже при совпадающем
 *     составе (починить оформление). По умолчанию false.
 * @return {Object} { ok, skipped, backup, rows, errors }
 */
function statusCodesReplace(force) {
  var ss = _scOpen();
  if (!ss) return { ok: false, error: 'spreadsheet_not_found' };

  // Сначала проверяем сами данные — код это PK: дубль/кривой цвет
  // должны остановить замену ДО любых изменений в таблице.
  var verr = _scValidateData();
  if (verr) {
    Logger.log('✕ ОШИБКА ДАННЫХ: ' + verr + ' — таблица НЕ изменена.');
    return { ok: false, error: verr };
  }

  var sheet = ss.getSheetByName(SC_SHEET_NAME);
  var current = sheet ? _scReadRows(sheet) : [];

  if (sheet && !force && _scEqualsCanonical(current)) {
    Logger.log('✓ Лист «' + SC_SHEET_NAME + '» уже содержит эталонный состав (' +
               current.length + ' кодов) — замена не требуется. ' +
               '(Для починки оформления: statusCodesReplace(true))');
    return { ok: true, skipped: true, rows: current.length };
  }

  var backupName = null;
  var position;
  if (sheet) {
    position = sheet.getIndex() - 1;            // 0-based для insertSheet
    backupName = _scUniqueBackupName(ss, SC_BACKUP_PREFIX);
    sheet.setName(backupName);
    Logger.log('Резерв: прежний лист (' + current.length + ' строк) сохранён как «' +
               backupName + '». Откат = вернуть имя «' + SC_SHEET_NAME + '».');
  } else {
    position = Math.min(2, ss.getSheets().length);  // 3-я позиция: после README и Сотрудников
    Logger.log('Лист «' + SC_SHEET_NAME + '» не найден — создаётся новый (позиция ' +
               (position + 1) + ').');
  }

  var fresh = ss.insertSheet(SC_SHEET_NAME, position);
  _scWriteSheet(fresh);

  // Самопроверка чтением из таблицы (урок RoleMatrixInit v4:
  // доверяй, но перечитай — ссылаемся на лист ЗАНОВО по имени).
  var verify = _scVerifySheet(ss.getSheetByName(SC_SHEET_NAME));
  if (verify.ok) {
    Logger.log('✓ ЗАМЕНА ВЫПОЛНЕНА: ' + SC_STATUS_CODES.length +
               ' кодов записаны и подтверждены чтением (шапка + ' +
               (SC_STATUS_CODES.length) + ' строк).');
    Logger.log('  Резерв (если был): «' + (backupName || '—') + '». ' +
               'Приложение увидит новый состав сразу — обновите страницу.');
  } else {
    Logger.log('✕ ПРОВЕРКА НЕ ПРОШЛА (' + verify.errors.length + ' расхождений):');
    for (var i = 0; i < verify.errors.length; i++) {
      Logger.log('   • ' + verify.errors[i]);
    }
    if (backupName) {
      Logger.log('  Прежние данные — в резерве «' + backupName +
                 '». Сообщите об ошибке; лист можно вернуть обратно.');
    }
  }
  return { ok: verify.ok, backup: backupName, rows: SC_STATUS_CODES.length, errors: verify.errors };
}

// ============================================================
// ШАГ 2: миграция «О» → «ОТ» в «Записи_графика»
// ============================================================
/**
 * Заменяет в «Записи_графика» статус «О» на «ОТ» (Task 298:
 * «О» больше не в справочнике, отпуск теперь «ОТ»). Точное
 * совпадение строки в колонке C, с учётом регистра: «ОТ»,
 * «ОБ», «д», «О» латинская и пр. не затрагиваются. Перед
 * правкой лист копируется в «Записи_графика_резерв_<дата>».
 * @return {Object} { ok, migrated, backup }
 */
function migrateVacationStatus() {
  var ss = _scOpen();
  if (!ss) return { ok: false, error: 'spreadsheet_not_found' };
  var sheet = ss.getSheetByName(SC_ENTRIES_SHEET);
  if (!sheet) {
    Logger.log('✕ Лист «' + SC_ENTRIES_SHEET + '» не найден.');
    return { ok: false, error: 'sheet_not_found: ' + SC_ENTRIES_SHEET };
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('✓ «Записи_графика» пуст — миграция не нужна.');
    return { ok: true, migrated: 0 };
  }

  // Ищем ТОЧНОЕ «О» (кириллица) в колонке C. Регистр и язык
  // важны: «ОТ»/«ОБ»/«ОЖ» длиннее, строчная «о» и латинская
  // «O» — другие значения, их не трогаем.
  var values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  var targets = [];
  for (var i = 0; i < values.length; i++) {
    var st = values[i][2];
    if (st === null || st === undefined) continue;
    if (String(st).trim() === 'О') {
      targets.push({ row: i + 2, date: values[i][0], tab: values[i][1] });
    }
  }

  if (targets.length === 0) {
    Logger.log('✓ Записей со статусом «О» нет — миграция уже выполнена (или не требовалась).');
    return { ok: true, migrated: 0 };
  }

  var backup = sheet.copyTo(ss);
  backup.setName(SC_ENTRIES_BACKUP + _scTimestamp());

  for (var t = 0; t < targets.length; t++) {
    sheet.getRange(targets[t].row, 3).setValue('ОТ');
    Logger.log('   строка ' + targets[t].row + ': ' + _scIsoDate(targets[t].date) +
               ' / таб ' + targets[t].tab + ' — «О» → «ОТ»');
  }
  Logger.log('✓ МИГРАЦИЯ: ' + targets.length + ' записей «О» → «ОТ». Резерв: «' +
             backup.getName() + '».');
  return { ok: true, migrated: targets.length, backup: backup.getName() };
}

// ============================================================
// ШАГ 3 (опция): «Дни_цикла», шаблон 2 → Д8/Д7,2
// ============================================================
/**
 * Рекомендация DEPLOY-Task298: дневной персонал по шаблону 2
 * работает 8-час (пятница — 7,2-час). Дни 1–4 «Д»→«Д8»,
 * день 5 «Д»→«Д7,2». Точное «Д» (строчная «д» — другой код!),
 * только шаблон 2, пустые дни (выходные) не трогаются.
 * @return {Object} { ok, changed, backup }
 */
function updateCycleDaysTemplate2() {
  var ss = _scOpen();
  if (!ss) return { ok: false, error: 'spreadsheet_not_found' };
  var sheet = ss.getSheetByName(SC_CYCLE_SHEET);
  if (!sheet) {
    Logger.log('✕ Лист «' + SC_CYCLE_SHEET + '» не найден.');
    return { ok: false, error: 'sheet_not_found: ' + SC_CYCLE_SHEET };
  }

  // Название шаблона 2 — для журнала (не критично, если листа нет)
  var tplName = '';
  var patterns = ss.getSheetByName('Шаблоны_ротации');
  if (patterns && patterns.getLastRow() >= 2) {
    var pv = patterns.getRange(2, 1, patterns.getLastRow() - 1, 2).getValues();
    for (var p = 0; p < pv.length; p++) {
      if (parseInt(pv[p][0], 10) === 2) { tplName = String(pv[p][1] || '').trim(); break; }
    }
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('✓ «Дни_цикла» пуст — нечего обновлять.');
    return { ok: true, changed: 0 };
  }
  var values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  var changes = [];
  for (var i = 0; i < values.length; i++) {
    if (parseInt(values[i][0], 10) !== 2) continue;        // только шаблон 2
    var day = parseInt(values[i][1], 10);
    var st = values[i][2];
    if (st === null || st === undefined) continue;
    if (String(st).trim() !== 'Д') continue;               // ТОЧНО «Д» («д» — другой код)
    var target = (day >= 1 && day <= 4) ? 'Д8' : (day === 5 ? 'Д7,2' : null);
    if (!target) {
      Logger.log('⚠ Шаблон 2, день ' + day + ': статус «Д» вне дней 1–5 — не тронут.');
      continue;
    }
    changes.push({ row: i + 2, day: day, to: target });
  }

  if (changes.length === 0) {
    Logger.log('✓ Шаблон 2' + (tplName ? ' («' + tplName + '»)' : '') +
               ' уже использует Д8/Д7,2 (или «Д» нет) — обновление не требуется.');
    return { ok: true, changed: 0 };
  }

  var backup = sheet.copyTo(ss);
  backup.setName(SC_CYCLE_BACKUP + _scTimestamp());

  for (var c = 0; c < changes.length; c++) {
    sheet.getRange(changes[c].row, 3).setValue(changes[c].to);
    Logger.log('   строка ' + changes[c].row + ': день ' + changes[c].day +
               ' цикла — «Д» → «' + changes[c].to + '»');
  }
  Logger.log('✓ ДНИ_ЦИКЛА: шаблон 2' + (tplName ? ' («' + tplName + '»)' : '') +
             ' — ' + changes.length + ' замен. Резерв: «' + backup.getName() + '».');
  Logger.log('  Существующие записи прошлых месяцев не менялись («Д» остаётся валидным кодом).');
  return { ok: true, changed: changes.length, backup: backup.getName() };
}

// ============================================================
// Очистка резервов
// ============================================================
/**
 * Удаляет все резервные листы трёх семейств («Коды_статусов_резерв_*»,
 * «Записи_графика_резерв_*», «Дни_цикла_резерв_*»). Запускать ТОЛЬКО
 * когда деплой проверен и откат не нужен.
 * @return {Object} { ok, removed }
 */
function statusCodesCleanupBackups() {
  var ss = _scOpen();
  if (!ss) return { ok: false, error: 'spreadsheet_not_found' };
  var prefixes = [SC_BACKUP_PREFIX, SC_ENTRIES_BACKUP, SC_CYCLE_BACKUP];
  var sheets = ss.getSheets();
  var removed = [];
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    var isBackup = false;
    for (var p = 0; p < prefixes.length; p++) {
      if (name.indexOf(prefixes[p]) === 0) { isBackup = true; break; }
    }
    if (!isBackup) continue;
    if (ss.getSheets().length <= 1) {
      Logger.log('⚠ В таблице остался последний лист — удаление остановлено.');
      break;
    }
    ss.deleteSheet(sheets[i]);
    removed.push(name);
    Logger.log('Удалён резервный лист: «' + name + '»');
  }
  if (removed.length === 0) Logger.log('Резервных листов не найдено — чисто.');
  else Logger.log('✓ Удалено резервных листов: ' + removed.length + '.');
  return { ok: true, removed: removed };
}

// ============================================================
// Внутренние помощники
// ============================================================

function _scOpen() {
  var ss = SpreadsheetApp.openById(SC_SPREADSHEET_ID);
  if (!ss) {
    Logger.log('✕ Таблица ' + SC_SPREADSHEET_ID + ' недоступна.');
    return null;
  }
  Logger.log('Таблица: «' + ss.getName() + '» — ' + ss.getUrl());
  return ss;
}

// Проверка эталонных данных ДО изменения таблицы: код — PK,
// дубликаты недопустимы; цвет обязан быть #RRGGBB (его читает
// клиент как CSS-фон попапа шахматки).
function _scValidateData() {
  if (!SC_STATUS_CODES.length) return 'пустой массив SC_STATUS_CODES';
  var seen = {};
  for (var i = 0; i < SC_STATUS_CODES.length; i++) {
    var row = SC_STATUS_CODES[i];
    if (!row || row.length < 3) return 'строка ' + (i + 1) + ': нет трёх колонок';
    var code = String(row[0]).trim();
    // Task 387: пустой код РАЗРЕШЁН — строка «Выходной» (выходной =
    // пустая ячейка белого цвета; пользователь убрал «.» из листа).
    // Дубль пустого кода ловится общим seen-набором ниже
    if (seen[code]) {
      return 'дубль кода «' + code + '» (строки ' + seen[code] + ' и ' + (i + 1) + ')';
    }
    seen[code] = (i + 1);
    if (!String(row[1] || '').trim()) return 'код «' + code + '»: пустое название';
    var color = String(row[2]).trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return 'код «' + code + '»: цвет «' + color + '» не вида #RRGGBB';
    }
  }
  return null;
}

// Чтение строк листа — зеркально getStatusCodes WorkSchedule.gs:
// данные со строки 2, пустые коды пропускаются, всё через String+trim.
function _scReadRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === '' || values[i][0] === null) continue;
    rows.push([
      String(values[i][0]).trim(),
      String(values[i][1] || '').trim(),
      String(values[i][2] || '').trim()
    ]);
  }
  return rows;
}

function _scEqualsCanonical(rows) {
  if (rows.length !== SC_STATUS_CODES.length) return false;
  for (var i = 0; i < rows.length; i++) {
    for (var c = 0; c < 3; c++) {
      if (String(rows[i][c]) !== String(SC_STATUS_CODES[i][c])) return false;
    }
  }
  return true;
}

// Запись листа: формат-текст ДО значений («Д7,2»/«.»/«*» обязаны
// сохраниться посимвольно — как в уроке Task 281 про автопревращения),
// затем шапка, данные и оформление (заливка строки цветом статуса —
// как в текущем листе пользователя).
function _scWriteSheet(sheet) {
  var n = SC_STATUS_CODES.length;

  sheet.getRange(1, 1, n + 1, 3).setNumberFormat('@');
  sheet.getRange(1, 1, 1, 3).setValues([SC_HEADERS]);
  sheet.getRange(2, 1, n, 3).setValues(SC_STATUS_CODES);

  // Шапка
  sheet.getRange(1, 1, 1, 3)
    .setBackground(SC_HEADER_BG)
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  // Строки данных: заливка всей строки цветом статуса; код —
  // жирный по центру; название — слева с переносом; цвет — центр.
  var body = sheet.getRange(2, 1, n, 3);
  var bgs = [], weights = [], aligns = [], wraps = [], vAligns = [];
  for (var i = 0; i < n; i++) {
    var color = SC_STATUS_CODES[i][2];
    bgs.push([color, color, color]);
    weights.push([true, false, false]);
    aligns.push(['center', 'left', 'center']);
    wraps.push([false, true, false]);
    vAligns.push(['middle', 'top', 'middle']);
  }
  body.setBackgrounds(bgs)
      .setFontWeights(weights)
      .setHorizontalAlignments(aligns)
      .setWraps(wraps)
      .setVerticalAlignments(vAligns);

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 90);    // код
  sheet.setColumnWidth(2, 560);   // название
  sheet.setColumnWidth(3, 110);   // цвет

  // ВАЖНО: никаких объединений ячеек и закреплений СТОЛБЦОВ —
  // только закрепление строки 1 (урок RoleMatrixInit v3/v4:
  // merge через границу закрепления делает лист неотображаемым).
}

// Самопроверка: перечитать лист и сверить с эталоном.
function _scVerifySheet(sheet) {
  if (!sheet) return { ok: false, errors: ['лист не найден после записи'] };
  var rows = _scReadRows(sheet);
  var errors = [];
  if (rows.length !== SC_STATUS_CODES.length) {
    errors.push('строк данных: ' + rows.length + ', ожидалось ' + SC_STATUS_CODES.length);
  }
  var cmp = Math.min(rows.length, SC_STATUS_CODES.length);
  for (var i = 0; i < cmp; i++) {
    for (var c = 0; c < 3; c++) {
      if (String(rows[i][c]) !== String(SC_STATUS_CODES[i][c])) {
        errors.push('строка ' + (i + 2) + ', колонка ' + 'ABC'[c] +
                    ': «' + rows[i][c] + '» ≠ «' + SC_STATUS_CODES[i][c] + '»');
      }
    }
  }
  return { ok: errors.length === 0, errors: errors };
}

function _scUniqueBackupName(ss, prefix) {
  var base = prefix + _scTimestamp();
  var name = base;
  var n = 2;
  while (ss.getSheetByName(name)) {
    name = base + '_' + n;
    n++;
  }
  return name;
}

function _scTimestamp() {
  var d = new Date();
  function p(x) { return (x < 10 ? '0' : '') + x; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
         '_' + p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds());
}

function _scIsoDate(v) {
  if (v instanceof Date) {
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return v.getFullYear() + '-' + p(v.getMonth() + 1) + '-' + p(v.getDate());
  }
  return (v === null || v === undefined) ? '—' : String(v);
}
