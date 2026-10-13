// ============================================================
// PPEInit.gs — создание листа «СИЗ» в таблице «График работы»
// (файл табель_КИП_ИОС) и предзаполнение перечня СИЗ (Task 392)
// ============================================================
// НАЗНАЧЕНИЕ:
//   Разовый инструмент деплоя Task 392 (см. scripts/DEPLOY-Task392)
//   + миграция структуры Task 443 (столбец G «дата_изготовления»):
//   создаёт лист «СИЗ» со структурой, которую читает/пишет
//   WorkSchedule.gs (listPpe/addPpe/updatePpe/deletePpe — секция
//   СИЗ в карточке работника), и по желанию заполняет СТАНДАРТНЫЙ
//   перечень СИЗ для каждого активного работника справочника
//   «Сотрудники» (образец — файл «Таблица СИЗ работникам КИП
//   ИОС.xlsx»; перечень — на основании Приказа Минтруда России от
//   29.10.2021 N767н).
//
// ИСПОЛЬЗОВАНИЕ:
//   1. Открыть редактор Apps Script (проект развёртывания
//      AKfycbyt… — тот же, где Code.gs и WorkSchedule.gs)
//   2. + → Создать файл «PPEInit.gs», вставить содержимое ЦЕЛИКОМ
//   3. В выпадающем списке функций выбрать нужную и нажать ▶ Run
//      (первый запуск попросит авторизацию — разрешить)
//   4. Результат смотреть в журнале (Ctrl+Enter / «Выполнения»)
//   5. После завершения деплоя файл можно удалить из проекта
//      (код приложения его НЕ использует — это разовый инструмент)
//
// ФУНКЦИИ (каждая запускается отдельно):
//   ppeDeployAll()       — рекомендованный порядок: мигрировать
//                          старый лист (Task 443) + создать лист +
//                          предзаполнить стандартный перечень всем
//                          активным работникам. Запустить ОДИН раз.
//   ppeMigrateManufacture() — Task 443, ШАГ 0: вставить столбец G
//                          «дата_изготовления» в СУЩЕСТВУЮЩИЙ лист
//                          (справа от «дата_выдачи»; срок/окончание/
//                          примечание сместятся G→H, H→I, I→J;
//                          данные строк не трогаются — вставляется
//                          пустой столбец). Идемпотентно.
//   ppeCreateSheet()     — ШАГ 1: создать лист «СИЗ» с заголовками
//                          (существующий лист НЕ трогается).
//   ppePrefillStandard() — ШАГ 2: каждому АКТИВНОМУ работнику
//                          («Сотрудники», в_архиве=0), у которого
//                          ещё нет строк СИЗ, добавить стандартный
//                          перечень из 8 позиций (даты выдачи
//                          пустые — заполняются приложением при
//                          выдаче; «Очки закрытые» — «До износа»).
//   ppeStatus()          — диагностика: наличие листа, заголовки,
//                          число строк, последний id, покрытие
//                          работников. Ничего не меняет.
//
// БЕЗОПАСНОСТЬ:
//   - Существующий лист «СИЗ» НИКОГДА не перезаписывается
//     (ppeCreateSheet пропускает шаг, если лист уже есть).
//   - ppePrefillStandard НЕ дублирует: работник, у которого уже
//     есть строки СИЗ, пропускается (повторный запуск безопасен).
//   - Остальные листы не пишутся; читается только «Сотрудники»
//     (и «СИЗ» — для диагностики/проверки дублей).
//   - Приложение работает и БЕЗ листа (до его создания): секция
//     СИЗ в карточках показывает «нет выданных СИЗ», кнопки
//     добавления вернут понятную ошибку sheet_not_found в тосте.
// ============================================================

// Целевая таблица — «График работы» (тот же ID, что в
// WorkSchedule.gs; скрипт открывает её по ID явно, чтобы
// исключить запись «не в ту таблицу»).
var PPE_SPREADSHEET_ID = '1MQtW-CWCmjlu-SAeVBllKDP6NRkiOkmW-7xgOjHskWY';

var PPE_SHEET_NAME = 'СИЗ';
// Task 443: G «дата_изготовления» после F «дата_выдачи» —
// срок_годности/дата_окончания/примечание сместились в H/I/J
var PPE_HEADERS    = ['id', 'таб_номер', 'работник', 'должность',
                      'наименование_СИЗ', 'дата_выдачи', 'дата_изготовления',
                      'срок_годности', 'дата_окончания', 'примечание'];
var PPE_EMPLOYEES_SHEET = 'Сотрудники';

// Цвет шапки — как у листа «Коды_статусов» (StatusCodesInit.gs):
// тёмный, белый текст — единый вид таблицы
var PPE_HEADER_BG = '#1F4E5F';

// Стандартный перечень СИЗ цеха №8 (образец файла «Таблица СИЗ
// работникам КИП ИОС.xlsx»; Приказ Минтруда России от 29.10.2021
// N767н). срок_годности/примечание — как в образце; дата_выдачи
// пустая (заполнится приложением при фактической выдаче).
// «Очки закрытые»: срок «До износа» → дата_окончания «До износа».
var PPE_STANDARD = [
  { name: 'Костюм для защиты от растворов кислот и щелочей',
    term: '1 год',   note: '' },
  { name: 'Ботинки',                                term: '1,5 года', note: '' },
  { name: 'Белье нательное',                        term: '',         note: '' },
  { name: 'Куртка утеплённая',                      term: '2 года',   note: 'До износа' },
  { name: 'Каска защитная',                         term: '2 года',   note: 'До износа' },
  { name: 'Подшлемник',                             term: '',         note: '' },
  { name: 'Противогаз',                             term: '',         note: '' },
  { name: 'Очки закрытые',                          term: 'До износа', note: '' }
];

function ppeDeployAll() {
  ppeMigrateManufacture();   // Task 443: старый лист — новая структура
  var created = ppeCreateSheet();
  var pre = ppePrefillStandard();
  Logger.log('PPEInit: лист=%s, предзаполнено работников=%s, строк добавлено=%s',
    created ? 'создан' : 'уже был', pre.workers, pre.rows);
}

// ШАГ 0 (Task 443): миграция СУЩЕСТВУЮЩЕГО листа «СИЗ» — вставить
// столбец G «дата_изготовления» справа от F «дата_выдачи»; столбцы
// срок_годности/дата_окончания/примечание сместятся G→H, H→I, I→J.
// ДАННЫЕ строк не трогаются: вставляется ПУСТОЙ столбец, прежние
// даты окончания остаются верными (без даты изготовления срок
// считается от даты выдачи — как и раньше). Дата окончания от даты
// изготовления начнёт считаться после её заполнения в приложении
// (или вручную в листе). Идемпотентно: шапка G уже
// «дата_изготовления» → ничего не делает. Листа нет → ничего не
// делает (ppeCreateSheet создаст сразу новую структуру).
function ppeMigrateManufacture() {
  var ss = SpreadsheetApp.openById(PPE_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PPE_SHEET_NAME);
  if (!sheet) {
    Logger.log('PPEInit (443): листа «%s» нет — миграция не нужна (ppeCreateSheet создаст новую структуру)',
      PPE_SHEET_NAME);
    return false;
  }
  var head = sheet.getRange(1, 1, 1, 10).getValues()[0];
  var g = String(head[6] || '').trim();
  if (g === 'дата_изготовления') {
    Logger.log('PPEInit (443): столбец G уже «дата_изготовления» — миграция не нужна');
    return false;
  }
  if (g !== 'срок_годности') {
    throw new Error('Лист «СИЗ»: шапка G = «' + g +
      '» — ожидается «срок_годности» (старая структура) или «дата_изготовления» (уже мигрировано)');
  }
  sheet.insertColumnAfter(6);  // новый ПУСТОЙ G; старые G/H/I → H/I/J
  var cell = sheet.getRange(1, 7);
  cell.setValue('дата_изготовления');
  cell.setBackground(PPE_HEADER_BG)
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
  Logger.log('PPEInit (443): вставлен столбец G «дата_изготовления» (срок_годности → H, дата_окончания → I, примечание → J); данные строк не менялись');
  return true;
}

// ШАГ 1: создать лист «СИЗ» с заголовками. Лист уже есть —
// ничего не меняет (возвращает false). Заголовок — строка 1.
function ppeCreateSheet() {
  var ss = SpreadsheetApp.openById(PPE_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PPE_SHEET_NAME);
  if (sheet) {
    Logger.log('PPEInit: лист «%s» уже существует — не трогаю', PPE_SHEET_NAME);
    return false;
  }
  sheet = ss.insertSheet(PPE_SHEET_NAME);
  var head = sheet.getRange(1, 1, 1, PPE_HEADERS.length);
  head.setValues([PPE_HEADERS]);
  head.setBackground(PPE_HEADER_BG)
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
  // таб_номер (B) — текстовый формат на всю колонку (Task 304)
  sheet.getRange('B2:B').setNumberFormat('@');
  sheet.setFrozenRows(1);
  Logger.log('PPEInit: лист «%s» создан, заголовки: %s',
    PPE_SHEET_NAME, PPE_HEADERS.join(' | '));
  return true;
}

// ШАГ 2: стандартный перечень каждому активному работнику без
// строк СИЗ. Возвращает {workers, rows} — сколько работников
// обработано и сколько строк добавлено.
function ppePrefillStandard() {
  var ss = SpreadsheetApp.openById(PPE_SPREADSHEET_ID);
  var ppeSheet = ss.getSheetByName(PPE_SHEET_NAME);
  if (!ppeSheet) {
    Logger.log('PPEInit: листа «%s» нет — сначала ppeCreateSheet()', PPE_SHEET_NAME);
    return { workers: 0, rows: 0 };
  }
  var empSheet = ss.getSheetByName(PPE_EMPLOYEES_SHEET);
  if (!empSheet) {
    Logger.log('PPEInit: листа «%s» нет — стоп', PPE_EMPLOYEES_SHEET);
    return { workers: 0, rows: 0 };
  }

  // Task 443: строка предзаполнения — ДЕСЯТЬ значений (G — дата
  // изготовления); нужен лист новой структуры — старый сначала
  // ppeMigrateManufacture() (иначе значения попали бы не в свои
  // столбцы после сдвига G→H→I→J)
  var headG = String(ppeSheet.getRange(1, 7).getValues()[0][0] || '').trim();
  if (headG !== 'дата_изготовления') {
    Logger.log('PPEInit: лист «%s» без столбца G «дата_изготовления» — сначала ppeMigrateManufacture() (Task 443)',
      PPE_SHEET_NAME);
    return { workers: 0, rows: 0 };
  }

  // Активные работники (в_архиве=0): A таб_№, B ФИО, J должность
  var empLast = empSheet.getLastRow();
  var workers = [];
  if (empLast >= 2) {
    var vals = empSheet.getRange(2, 1, empLast - 1, 11).getValues();
    for (var i = 0; i < vals.length; i++) {
      var tabNo = String(vals[i][0] || '').trim();
      if (!tabNo) continue;
      if (parseInt(vals[i][8], 10) === 1) continue;  // в_архиве
      workers.push({
        tabNo: tabNo,
        fio:   String(vals[i][1] || '').trim(),
        pos:   String(vals[i][9] || '').trim()
      });
    }
  }

  // Уже покрытые таб_№ (есть хоть одна строка СИЗ)
  var covered = {};
  var ppeLast = ppeSheet.getLastRow();
  if (ppeLast >= 2) {
    // Task 443: 10 столбцов (G — дата изготовления)
    var pVals = ppeSheet.getRange(2, 1, ppeLast - 1, 10).getValues();
    for (var p = 0; p < pVals.length; p++) {
      var t = String(pVals[p][1] || '').trim();
      if (t) covered[t] = true;
    }
  }

  // max id
  var maxId = 0;
  if (ppeLast >= 2) {
    var ids = ppeSheet.getRange(2, 1, ppeLast - 1, 1).getValues();
    for (var q = 0; q < ids.length; q++) {
      var v = parseInt(ids[q][0], 10);
      if (!isNaN(v) && v > maxId) maxId = v;
    }
  }

  var added = 0, touched = 0;
  for (var w = 0; w < workers.length; w++) {
    var wk = workers[w];
    if (covered[wk.tabNo]) {
      Logger.log('PPEInit: %s (таб %s) — строки уже есть, пропуск', wk.fio, wk.tabNo);
      continue;
    }
    for (var s = 0; s < PPE_STANDARD.length; s++) {
      var item = PPE_STANDARD[s];
      maxId++;
      var newRow = ppeSheet.getLastRow() + 1;
      // Task 304: B (таб_№) — текст, ведущие нули не теряются.
      // Task 443: ДЕСЯТЬ значений — G дата_изготовления (пустая:
      // заполняется приложением, если срок СИЗ исчисляется с даты
      // производства), H срок, I дата_окончания, J примечание
      ppeSheet.getRange(newRow, 2).setNumberFormat('@');
      ppeSheet.getRange(newRow, 1, 1, 10).setValues([[
        maxId, wk.tabNo, wk.fio, wk.pos, item.name,
        '',                                 // дата_выдачи — не выдано
        '',                                 // дата_изготовления (Task 443)
        item.term,
        item.term === 'До износа' ? 'До износа' : '',  // дата_окончания
        item.note
      ]]);
      added++;
    }
    touched++;
    Logger.log('PPEInit: %s (таб %s) — добавлен стандартный перечень (%s позиций)',
      wk.fio, wk.tabNo, PPE_STANDARD.length);
  }
  Logger.log('PPEInit: предзаполнение — работников %s, строк %s', touched, added);
  return { workers: touched, rows: added };
}

// Диагностика: состояние листа «СИЗ» (ничего не меняет)
function ppeStatus() {
  var ss = SpreadsheetApp.openById(PPE_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PPE_SHEET_NAME);
  if (!sheet) {
    Logger.log('PPEInit: листа «%s» НЕТ — запусти ppeDeployAll()', PPE_SHEET_NAME);
    return;
  }
  var lastRow = sheet.getLastRow();
  Logger.log('PPEInit: лист «%s», строк данных: %s', PPE_SHEET_NAME,
    Math.max(0, lastRow - 1));
  var head = sheet.getRange(1, 1, 1, PPE_HEADERS.length).getValues()[0];
  var headDiff = [];
  for (var h = 0; h < PPE_HEADERS.length; h++) {
    if (String(head[h] || '').trim() !== PPE_HEADERS[h]) {
      headDiff.push(PPE_HEADERS[h] + ' ≠ ' + String(head[h] || ''));
    }
  }
  Logger.log('PPEInit: заголовки %s', headDiff.length
    ? 'ОТЛИЧАЮТСЯ: ' + headDiff.join('; ') : 'совпадают');
  if (lastRow < 2) return;
  // Task 443: 10 столбцов (G — дата изготовления)
  var vals = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  var maxId = 0, byTab = {}, noTab = 0, noName = 0;
  for (var i = 0; i < vals.length; i++) {
    var id = parseInt(vals[i][0], 10);
    if (!isNaN(id) && id > maxId) maxId = id;
    var t = String(vals[i][1] || '').trim();
    if (!t) { noTab++; continue; }
    byTab[t] = (byTab[t] || 0) + 1;
    if (!String(vals[i][4] || '').trim()) noName++;
  }
  Logger.log('PPEInit: последний id=%s; работников со строками: %s; строк без таб_№: %s; строк без наименования: %s',
    maxId, Object.keys(byTab).length, noTab, noName);
  var keys = Object.keys(byTab);
  for (var k = 0; k < keys.length; k++) {
    Logger.log('PPEInit:   таб %s — %s строк', keys[k], byTab[keys[k]]);
  }
}
