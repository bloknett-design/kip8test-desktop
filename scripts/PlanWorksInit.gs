// ============================================================
// PlanWorksInit.gs — создание листа «Работы на месяц» в файле
// Мероприятия_КИП_ИОС (Task 471)
// ============================================================
// НАЗНАЧЕНИЕ:
//   Разовый инструмент деплоя Task 471 (см. scripts/DEPLOY-
//   Task471-plan-events-years-works-month.md): создаёт лист
//   «Работы на месяц» со структурой, которую читает/пишет
//   PlanEvents.gs (planWorks.list / add / remove / setStatus —
//   работы на месяц: ввод пользователем через интерфейс
//   «Работы на следующий месяц», отметка полного/частичного
//   выполнения или невыполнения через интерфейс
//   «Работы на месяц» раздела «Плановые мероприятия»).
//
// ИСПОЛЬЗОВАНИЕ:
//   1. Открыть редактор Apps Script (проект развёртывания
//      AKfycbyt… — тот же, где Code.gs и PlanEvents.gs)
//   2. + → Создать файл «PlanWorksInit.gs», вставить содержимое
//      ЦЕЛИКОМ
//   3. В выпадающем списке функций выбрать planWorksDeploy и
//      нажать ▶ Run (первый запуск попросит авторизацию —
//      разрешить)
//   4. Результат смотреть в журнале (Ctrl+Enter / «Выполнения»);
//      диагностика — planWorksStatus
//   5. После завершения деплоя файл можно удалить из проекта
//      (код приложения его НЕ использует — это разовый
//      инструмент; копия-эталон в scripts/ репозитория)
//
// БЕЗОПАСНОСТЬ:
//   - Существующий лист «Работы на месяц» НИКОГДА не
//     перезаписывается (planWorksDeploy пропускает шаг, если
//     лист уже есть).
//   - Остальные листы файла не трогаются (лист «Архив» Task 463
//     и автосозданный «Лист1» остаются как есть).
//   - Приложение работает и БЕЗ листа (до его создания):
//     planWorks.* вернут sheet_not_found — клиент покажет
//     понятную ошибку в окне работ.
// ============================================================

// Файл Мероприятия_КИП_ИОС (Task 471; тот же ID, что в PlanEvents.gs)
var PW_SPREADSHEET_ID = '1uX8Bz6FBS9HniZfWQnHeeyccTwwjwyvpPFWyFkIclCs';

var PW_SHEET_NAME = 'Работы на месяц';
var PW_HEADERS = ['id', 'год', 'месяц', 'работа', 'статус',
                  'дата_статуса', 'email', 'время_изменения'];

// Цвет шапки — как у листов WorkSchedule (StatusCodesInit.gs /
// PPEInit.gs / PlanEventsInit.gs): тёмный, белый текст — единый
// вид таблицы
var PW_HEADER_BG = '#1F4E5F';

// Создать лист «Работы на месяц» с заголовками. Лист уже есть —
// ничего не меняет (возвращает false). Заголовок — строка 1.
// Колонки D (работа), F (дата_статуса) и H (время_изменения) —
// текстовый формат '@' на всю колонку: appendRow пишет строки
// КАК ТЕКСТ (числоподобные строки не превращаются в Date —
// паттерн Task 304 из WorkSchedule.gs, защита от локалей)
function planWorksDeploy() {
  var ss = SpreadsheetApp.openById(PW_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PW_SHEET_NAME);
  if (sheet) {
    Logger.log('PlanWorksInit: лист «%s» уже существует — не трогаю', PW_SHEET_NAME);
    return false;
  }
  sheet = ss.insertSheet(PW_SHEET_NAME);
  var head = sheet.getRange(1, 1, 1, PW_HEADERS.length);
  head.setValues([PW_HEADERS]);
  head.setBackground(PW_HEADER_BG)
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
  // Текст и даты — строками (Task 304 — паттерн «таб_номер текстом»):
  sheet.getRange('D2:D').setNumberFormat('@');
  sheet.getRange('F2:F').setNumberFormat('@');
  sheet.getRange('H2:H').setNumberFormat('@');
  sheet.setFrozenRows(1);
  Logger.log('PlanWorksInit: лист «%s» создан, заголовки: %s',
    PW_SHEET_NAME, PW_HEADERS.join(' | '));
  return true;
}

// Диагностика: файл доступен? лист? заголовки? сколько строк?
// Ничего не меняет.
function planWorksStatus() {
  var out = { file: false, sheet: false, headers: [], rows: 0, lastId: 0 };
  try {
    var ss = SpreadsheetApp.openById(PW_SPREADSHEET_ID);
    out.file = true;
    var sheet = ss.getSheetByName(PW_SHEET_NAME);
    if (!sheet) {
      Logger.log('PlanWorksStatus: файл открыт, листа «%s» НЕТ — запустите planWorksDeploy()', PW_SHEET_NAME);
      return out;
    }
    out.sheet = true;
    out.headers = sheet.getRange(1, 1, 1, PW_HEADERS.length)
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
    Logger.log('PlanWorksStatus: файл=%s лист=%s строк=%s последний id=%s заголовки=%s',
      out.file, out.sheet, out.rows, out.lastId, out.headers.join(' | '));
  } catch (e) {
    Logger.log('PlanWorksStatus: файл недоступен (%s) — проверьте доступ Apps Script к таблице', e);
  }
  return out;
}
