// ============================================================
// PlanEventsInit.gs — создание листа «Архив» в файле
// Мероприятия_КИП_ИОС (Task 463)
// ============================================================
// НАЗНАЧЕНИЕ:
//   Разовый инструмент деплоя Task 463 (см. scripts/DEPLOY-
//   Task463-plan-events-marks-archive.md): создаёт лист «Архив»
//   со структурой, которую читает/пишет PlanEvents.gs
//   (planEvents.list / planEvents.mark — раздел «Плановые
//   мероприятия», отметки выполнения с датой).
//
// ИСПОЛЬЗОВАНИЕ:
//   1. Открыть редактор Apps Script (проект развёртывания
//      AKfycbyt… — тот же, где Code.gs и PlanEvents.gs)
//   2. + → Создать файл «PlanEventsInit.gs», вставить содержимое
//      ЦЕЛИКОМ
//   3. В выпадающем списке функций выбрать planEventsDeploy и
//      нажать ▶ Run (первый запуск попросит авторизацию —
//      разрешить)
//   4. Результат смотреть в журнале (Ctrl+Enter / «Выполнения»);
//      диагностика — planEventsStatus
//   5. После завершения деплоя файл можно удалить из проекта
//      (код приложения его НЕ использует — это разовый
//      инструмент; копия-эталон в scripts/ репозитория)
//
// БЕЗОПАСНОСТЬ:
//   - Существующий лист «Архив» НИКОГДА не перезаписывается
//     (planEventsDeploy пропускает шаг, если лист уже есть).
//   - Остальные листы файла не трогаются (в файле только
//     автосозданный «Лист1» — остаётся как есть).
//   - Приложение работает и БЕЗ листа (до его создания):
//     planEvents.list/mark вернут sheet_not_found — клиент
//     покажет понятную ошибку в тосте.
// ============================================================

// Файл Мероприятия_КИП_ИОС (Task 463; тот же ID, что в PlanEvents.gs)
var PE_SPREADSHEET_ID = '1uX8Bz6FBS9HniZfWQnHeeyccTwwjwyvpPFWyFkIclCs';

var PE_SHEET_NAME = 'Архив';
var PE_HEADERS = ['id', 'дата_выполнения', 'мероприятие', 'год',
                  'месяц', 'email', 'время_отметки'];

// Цвет шапки — как у листов WorkSchedule (StatusCodesInit.gs /
// PPEInit.gs): тёмный, белый текст — единый вид таблицы
var PE_HEADER_BG = '#1F4E5F';

// Создать лист «Архив» с заголовками. Лист уже есть — ничего
// не меняет (возвращает false). Заголовок — строка 1.
// Колонки B (дата_выполнения) и G (время_отметки) — текстовый
// формат '@' на всю колонку: appendRow пишет строки дат КАК ТЕКСТ
// (числоподобные строки не превращаются в Date — паттерн Task 304
// из WorkSchedule.gs, защита от локалей)
function planEventsDeploy() {
  var ss = SpreadsheetApp.openById(PE_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PE_SHEET_NAME);
  if (sheet) {
    Logger.log('PlanEventsInit: лист «%s» уже существует — не трогаю', PE_SHEET_NAME);
    return false;
  }
  sheet = ss.insertSheet(PE_SHEET_NAME);
  var head = sheet.getRange(1, 1, 1, PE_HEADERS.length);
  head.setValues([PE_HEADERS]);
  head.setBackground(PE_HEADER_BG)
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
  // Даты текстом (Task 304 — паттерн «таб_номер текстом»):
  sheet.getRange('B2:B').setNumberFormat('@');
  sheet.getRange('G2:G').setNumberFormat('@');
  sheet.setFrozenRows(1);
  Logger.log('PlanEventsInit: лист «%s» создан, заголовки: %s',
    PE_SHEET_NAME, PE_HEADERS.join(' | '));
  return true;
}

// Диагностика: файл доступен? лист? заголовки? сколько строк?
// Ничего не меняет.
function planEventsStatus() {
  var out = { file: false, sheet: false, headers: [], rows: 0, lastId: 0 };
  try {
    var ss = SpreadsheetApp.openById(PE_SPREADSHEET_ID);
    out.file = true;
    var sheet = ss.getSheetByName(PE_SHEET_NAME);
    if (!sheet) {
      Logger.log('PlanEventsStatus: файл открыт, листа «%s» НЕТ — запустите planEventsDeploy()', PE_SHEET_NAME);
      return out;
    }
    out.sheet = true;
    out.headers = sheet.getRange(1, 1, 1, PE_HEADERS.length)
                      .getValues()[0].map(function(v) { return String(v || ''); });
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      out.rows = lastRow - 1;
      var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        var id = parseInt(ids[i][0], 10);
        if (!isNaN(id) && id > out.lastId) out.lastId = id;
      }
    }
    Logger.log('PlanEventsStatus: файл=%s лист=%s строк=%s последний id=%s заголовки=%s',
      out.file, out.sheet, out.rows, out.lastId, out.headers.join(' | '));
  } catch (e) {
    Logger.log('PlanEventsStatus: файл недоступен (%s) — проверьте доступ Apps Script к таблице', e);
  }
  return out;
}
