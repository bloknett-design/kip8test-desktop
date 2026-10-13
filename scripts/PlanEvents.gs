// ============================================================
// PlanEvents.gs — «Плановые мероприятия»: отметки выполнения
// + архив в файле Мероприятия_КИП_ИОС (Task 463)
// ============================================================
// Разворачивать в ТОМ ЖЕ Apps Script проекте, где Code.gs,
// Utils.gs, RoleMatrixGate.gs, WorkSchedule.gs (проект
// развёртывания AKfycbyt… — ОДИН бэкенд на kip8 и kip8test).
//
// В Code.gs (doPost) добавить девять case (см. scripts/Code.gs —
// эталон уже обновлён):
//   case 'planEvents.list':
//     return _json(PlanEvents.list(payload));
//   case 'planEvents.mark':
//     return _json(PlanEvents.mark(payload));
//   case 'planEvents.update':        // Task 464
//     return _json(PlanEvents.update(payload));
//   case 'planEvents.unmark':        // Task 464
//     return _json(PlanEvents.unmark(payload));
//   case 'planEvents.years':         // Task 471
//     return _json(PlanEvents.years(payload));
//   case 'planWorks.list':           // Task 471
//     return _json(PlanEvents.listWorks(payload));
//   case 'planWorks.add':            // Task 471
//     return _json(PlanEvents.addWork(payload));
//   case 'planWorks.remove':         // Task 471
//     return _json(PlanEvents.removeWork(payload));
//   case 'planWorks.setStatus':      // Task 471
//     return _json(PlanEvents.setWorkStatus(payload));
//
// ЭНДПОИНТЫ (через KipAuth.api клиента — модули PlanEventsData/
// PlanWorksData):
//   planEvents.list — отметки года: {token, year}
//     → {ok, data: {marks: [{id, дата_выполнения, мероприятие,
//        год, месяц}], srvVer: '471'}}
//   planEvents.mark — отметить выполнение: {token, year, month,
//     event, date('ГГГГ-ММ-ДД')}
//     → {ok, data: {mark: {…}, already: bool}}
//     ИДЕМПОТЕНТНОСТЬ: запись (год, месяц, мероприятие) уже есть →
//     новая НЕ создаётся, возвращается существующая (already: true)
//     — защита от дублей при повторных кликах/ретраях клиента.
//   planEvents.update — изменить дату выполнения (Task 464):
//     {token, year, month, event, date}
//     → {ok, data: {mark: {…}}} | {ok: false, error: 'not_found'}
//     Обновляет дата_выполнения + время_отметки найденной записи
//     (все дубли ключа — тоже); отметки нет → not_found (клиент
//     предложит обновить список).
//   planEvents.unmark — снять отметку (Task 464):
//     {token, year, month, event}
//     → {ok, data: {removed: bool}}
//     Удаляет строку(и) ключа из листа «Архив»; ИДЕМПОТЕНТНО:
//     отметки нет → removed: false (без ошибки — повторные клики
//     и ретраи безопасны).
//   planEvents.years — годы архива (Task 471): {token}
//     → {ok, data: {years: [2025, 2026, …], srvVer}}
//     Отсортированный список ГОДОВ, по которым в листе «Архив» есть
//     записи. Клиент включает кнопку переключения годов ТОЛЬКО
//     если есть архив за предыдущие годы (заявка Task 471).
//   planWorks.list — работы месяца (Task 471): {token, year, month}
//     → {ok, data: {works: [{id, год, месяц, работа, статус,
//        дата_статуса}], srvVer}}
//     Работы листа «Работы на месяц» за конкретный месяц.
//   planWorks.add — добавить работу (Task 471):
//     {token, year, month, work}
//     → {ok, data: {work: {…}}}
//     Новая строка (год, месяц, работа) со статусом «не отмечен»
//     (статус '' — пустой). Вносит пользователь из интерфейса
//     «Работы на следующий месяц» (клик по одноимённой ячейке
//     таблицы «Плановых мероприятий»).
//   planWorks.remove — удалить работу (Task 471): {token, id}
//     → {ok, data: {removed: bool}}
//     ИДЕМПОТЕНТНО: работы нет → removed: false. Удаляет ВСЕ строки
//     с id (в т.ч. ручные дубли) — обход с конца списка.
//   planWorks.setStatus — отметить выполнение работы (Task 471):
//     {token, id, status('выполнено'|'частично'|'не выполнено'),
//      date('ГГГГ-ММ-ДД', необязательно — по умолчанию сегодня)}
//     → {ok, data: {work: {id, статус, дата_статуса}}} |
//       {ok: false, error: 'not_found'}
//     Обновляет статус + дата_статуса + email + время_изменения
//     найденной строки (все дубли id — тоже).
//
// ДАННЫЕ — ОТДЕЛЬНЫЙ файл Мероприятия_КИП_ИОС (Google Sheets):
//   SPREADSHEET_ID ниже. Лист «Архив» (Task 463) создаётся
//   одноразовым идемпотентным scripts/PlanEventsInit.gs (функция
//   planEventsDeploy). Структура (заголовки в строке 1):
//     A: id              — автоинкремент (max + 1)
//     B: дата_выполнения — 'ГГГГ-ММ-ДД' (текст, формат '@')
//     C: мероприятие     — наименование из таблицы раздела
//     D: год             — число (2026)
//     E: месяц           — 1..12
//     F: email           — кто отметил (из сессии)
//     G: время_отметки   — ISO timestamp (текст, формат '@')
//   Лист «Работы на месяц» (Task 471) создаётся одноразовым
//   идемпотентным scripts/PlanWorksInit.gs (функция
//   planWorksDeploy). Структура (заголовки в строке 1):
//     A: id              — автоинкремент (max + 1)
//     B: год             — число (2026)
//     C: месяц           — 1..12
//     D: работа          — текст работы (до 500 символов)
//     E: статус          — '' | 'выполнено' | 'частично' |
//                          'не выполнено' (полное/частичное/
//                          невыполнение — заявка Task 471)
//     F: дата_статуса    — 'ГГГГ-ММ-ДД' (текст, формат '@')
//     G: email           — кто внёс/отметил (из сессии)
//     H: время_изменения — ISO timestamp (текст, формат '@')
//   Ручные правки пользователем поддерживаются: строки
//   парсятся снисходительно (дата и текстом, и Date-объектом;
//   битые строки молча пропускаются — как «Отпуска» Task 279).
//
// ДОСТУП — право plan.events матрицы KIP8_Access (Task 462):
// и чтение, и отметка — одним правом (видеть раздел = отмечать
// выполнение; разделение не требуется по заявке Task 463).
// RoleMatrixGate.gs не задеплоен → отказ всем (fail-closed).
//
// Авторизация — по тому же паттерну, что WorkSchedule.gs:
//   Utils.findSessionByToken(token) → session
//   Utils.findUserById(session.user_id) → user
// ============================================================

var PlanEvents = {

  // Файл Мероприятия_КИП_ИОС (Task 463; доступ у сервисного
  // аккаунта Apps Script — тот же, что у таблицы табель_КИП_ИОС)
  SPREADSHEET_ID: '1uX8Bz6FBS9HniZfWQnHeeyccTwwjwyvpPFWyFkIclCs',
  ARCHIVE_SHEET: 'Архив',

  // Лист работ месяца (Task 471): работы вносит пользователь
  // (интерфейс «Работы на следующий месяц»), выполнение отмечается
  // в интерфейсе «Работы на месяц» (полное/частичное/невыполнение)
  WORKS_SHEET: 'Работы на месяц',

  // Допустимые статусы выполнения работы (Task 471)
  WORKS_STATUSES: ['выполнено', 'частично', 'не выполнено'],

  // Task 463/464/471: версия серверного кода (клиент отличает
  // старый Apps Script: нет action → «Unknown action» — молчаливая
  // деградация без отметок/работ, см. DEPLOY Task 463/464/471)
  SRV_VER: '471',

  // ============================================================
  // planEvents.list — отметки года
  // ============================================================
  // payload: { token, year }  (год не указан — все записи листа)
  // returns: { ok: true, data: { marks: [...], srvVer } }
  list: function(payload) {
    var g = this._requireAccess(payload.token);
    if (g.error) return g.error;

    var sheet = this._getArchiveSheet();
    if (!sheet) {
      return { ok: false, error: 'sheet_not_found',
               message: 'Лист «Архив» в файле Мероприятия_КИП_ИОС не найден — запустите planEventsDeploy() (scripts/PlanEventsInit.gs, Task 463)' };
    }

    var year = payload.year ? parseInt(payload.year, 10) : null;
    var lastRow = sheet.getLastRow();
    var marks = [];
    if (lastRow >= 2) {
      var vals = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
      for (var i = 0; i < vals.length; i++) {
        var rec = this._rowToMark(vals[i]);
        if (!rec) continue;                     // битая строка — мимо
        if (year && rec['год'] !== year) continue;
        marks.push(rec);
      }
    }
    return { ok: true, data: { marks: marks, srvVer: this.SRV_VER } };
  },

  // ============================================================
  // planEvents.mark — отметить выполнение (идемпотентно)
  // ============================================================
  // payload: { token, year, month(1..12), event, date('ГГГГ-ММ-ДД') }
  // returns: { ok: true, data: { mark: {...}, already: bool } }
  mark: function(payload) {
    var g = this._requireAccess(payload.token);
    if (g.error) return g.error;
    var user = g.user;

    var year = parseInt(payload.year, 10);
    var month = parseInt(payload.month, 10);
    var event = String(payload.event || '').trim();
    var date = this._normDate(payload.date);
    if (isNaN(year) || year < 2000 || year > 2100) {
      return { ok: false, error: 'invalid_year',
               message: 'Год отметки не распознан' };
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return { ok: false, error: 'invalid_month',
               message: 'Месяц отметки должен быть 1..12' };
    }
    if (!event || event.length > 200) {
      return { ok: false, error: 'invalid_event',
               message: 'Наименование мероприятия пустое или длиннее 200 символов' };
    }
    if (!date) {
      return { ok: false, error: 'invalid_date',
               message: 'Дата выполнения не распознана (нужен формат ГГГГ-ММ-ДД)' };
    }

    var sheet = this._getArchiveSheet();
    if (!sheet) {
      return { ok: false, error: 'sheet_not_found',
               message: 'Лист «Архив» в файле Мероприятия_КИП_ИОС не найден — запустите planEventsDeploy() (scripts/PlanEventsInit.gs, Task 463)' };
    }

    // Идемпотентность: (год, месяц, мероприятие) уже отмечено →
    // существующая запись, новой НЕ создаём (дубли невозможны)
    var lastRow = sheet.getLastRow();
    var maxId = 0;
    if (lastRow >= 2) {
      var vals = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
      for (var i = 0; i < vals.length; i++) {
        var rec = this._rowToMark(vals[i]);
        var rowId = parseInt(vals[i][0], 10);
        if (!isNaN(rowId) && rowId > maxId) maxId = rowId;
        if (!rec) continue;
        if (rec['год'] === year && rec['месяц'] === month &&
            rec['мероприятие'] === event) {
          try {
            Utils.audit(user.email, 'PLAN_EVENTS_MARK_IDEMPOTENT', '', '',
              'Отметка уже была: ' + event + ' ' + month + '/' + year);
          } catch (e) { /* ignore */ }
          return { ok: true, data: { mark: rec, already: true } };
        }
      }
    }

    var row = [maxId + 1, date, event, year, month,
               String(user.email || ''), this._isoNow()];
    sheet.appendRow(row);
    try {
      Utils.audit(user.email, 'PLAN_EVENTS_MARK', '', '',
        'Отмечено: ' + event + ' — ' + date + ' (' + month + '/' + year + ')');
    } catch (e) { /* ignore */ }
    return { ok: true, data: { mark: this._rowToMark(row), already: false } };
  },

  // ============================================================
  // planEvents.update — изменить дату выполнения (Task 464)
  // ============================================================
  // payload: {token, year, month(1..12), event, date('ГГГГ-ММ-ДД')}
  // returns: { ok: true, data: { mark: {...} } }
  //   | { ok: false, error: 'not_found' } — записи с ключом нет
  // Обновляет дата_выполнения (B) + время_отметки (G) у ВСЕХ строк
  // ключа (год, месяц, мероприятие) — ручные дубли тоже правятся
  update: function(payload) {
    var g = this._requireAccess(payload.token);
    if (g.error) return g.error;
    var user = g.user;

    var year = parseInt(payload.year, 10);
    var month = parseInt(payload.month, 10);
    var event = String(payload.event || '').trim();
    var date = this._normDate(payload.date);
    if (isNaN(year) || year < 2000 || year > 2100) {
      return { ok: false, error: 'invalid_year',
               message: 'Год отметки не распознан' };
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return { ok: false, error: 'invalid_month',
               message: 'Месяц отметки должен быть 1..12' };
    }
    if (!event || event.length > 200) {
      return { ok: false, error: 'invalid_event',
               message: 'Наименование мероприятия пустое или длиннее 200 символов' };
    }
    if (!date) {
      return { ok: false, error: 'invalid_date',
               message: 'Дата выполнения не распознана (нужен формат ГГГГ-ММ-ДД)' };
    }

    var sheet = this._getArchiveSheet();
    if (!sheet) {
      return { ok: false, error: 'sheet_not_found',
               message: 'Лист «Архив» в файле Мероприятия_КИП_ИОС не найден — запустите planEventsDeploy() (scripts/PlanEventsInit.gs, Task 463)' };
    }

    // Поиск строк ключа (сверху вниз; правка не сдвигает строки)
    var hitRows = [];
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var vals = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
      for (var i = 0; i < vals.length; i++) {
        var rec = this._rowToMark(vals[i]);
        if (!rec) continue;
        if (rec['год'] === year && rec['месяц'] === month &&
            rec['мероприятие'] === event) {
          hitRows.push(i + 2);           // позиция строки листа
        }
      }
    }
    if (!hitRows.length) {
      return { ok: false, error: 'not_found',
               message: 'Отметка не найдена — возможно, её уже сняли. Нажмите «Обновить» в шапке раздела' };
    }
    for (var j = 0; j < hitRows.length; j++) {
      sheet.getRange(hitRows[j], 2).setValue(date);             // B: дата
      sheet.getRange(hitRows[j], 7).setValue(this._isoNow());   // G: время
    }
    try {
      Utils.audit(user.email, 'PLAN_EVENTS_UPDATE', '', '',
        'Дата отметки изменена: ' + event + ' — ' + date +
        ' (' + month + '/' + year + ')');
    } catch (e) { /* ignore */ }
    return { ok: true, data: { mark: {
      id: null,
      'дата_выполнения': date,
      'мероприятие': event,
      'год': year,
      'месяц': month
    } } };
  },

  // ============================================================
  // planEvents.unmark — снять отметку (Task 464)
  // ============================================================
  // payload: {token, year, month(1..12), event}
  // returns: { ok: true, data: { removed: bool } }
  //   ИДЕМПОТЕНТНО: записи нет → removed: false (не ошибка)
  // Удаляет ВСЕ строки ключа (в т.ч. ручные дубли); обход с КОНЦА
  // списка — позиции после удаления не съезжают
  unmark: function(payload) {
    var g = this._requireAccess(payload.token);
    if (g.error) return g.error;
    var user = g.user;

    var year = parseInt(payload.year, 10);
    var month = parseInt(payload.month, 10);
    var event = String(payload.event || '').trim();
    if (isNaN(year) || year < 2000 || year > 2100) {
      return { ok: false, error: 'invalid_year',
               message: 'Год отметки не распознан' };
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return { ok: false, error: 'invalid_month',
               message: 'Месяц отметки должен быть 1..12' };
    }
    if (!event || event.length > 200) {
      return { ok: false, error: 'invalid_event',
               message: 'Наименование мероприятия пустое или длиннее 200 символов' };
    }

    var sheet = this._getArchiveSheet();
    if (!sheet) {
      return { ok: false, error: 'sheet_not_found',
               message: 'Лист «Архив» в файле Мероприятия_КИП_ИОС не найден — запустите planEventsDeploy() (scripts/PlanEventsInit.gs, Task 463)' };
    }

    var removed = 0;
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var vals = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
      for (var i = vals.length - 1; i >= 0; i--) {
        var rec = this._rowToMark(vals[i]);
        if (!rec) continue;
        if (rec['год'] === year && rec['месяц'] === month &&
            rec['мероприятие'] === event) {
          sheet.deleteRow(i + 2);
          removed++;
        }
      }
    }
    try {
      Utils.audit(user.email, 'PLAN_EVENTS_UNMARK', '', '',
        'Отметка снята: ' + event + ' (' + month + '/' + year + ')' +
        (removed ? '' : ' — не найдена'));
    } catch (e) { /* ignore */ }
    return { ok: true, data: { removed: removed > 0 } };
  },

  // ============================================================
  // planEvents.years — годы архива (Task 471)
  // ============================================================
  // payload: { token }
  // returns: { ok: true, data: { years: [2025, 2026, …], srvVer } }
  // Годы, по которым в листе «Архив» есть записи. Нужен клиенту
  // для кнопки переключения годов в шапке таблицы «Плановых
  // мероприятий»: активна ТОЛЬКО при наличии архива за предыдущие
  // годы (заявка Task 471). Битые строки (год не распознан)
  // молча пропускаются
  years: function(payload) {
    var g = this._requireAccess(payload.token);
    if (g.error) return g.error;

    var sheet = this._getArchiveSheet();
    if (!sheet) {
      return { ok: false, error: 'sheet_not_found',
               message: 'Лист «Архив» в файле Мероприятия_КИП_ИОС не найден — запустите planEventsDeploy() (scripts/PlanEventsInit.gs, Task 463)' };
    }

    var seen = {};
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var vals = sheet.getRange(2, 4, lastRow - 1, 1).getValues(); // D: год
      for (var i = 0; i < vals.length; i++) {
        var y = parseInt(vals[i][0], 10);
        if (!isNaN(y)) seen[y] = true;
      }
    }
    var years = [];
    for (var k in seen) {
      if (Object.prototype.hasOwnProperty.call(seen, k)) {
        years.push(parseInt(k, 10));
      }
    }
    years.sort(function(a, b) { return a - b; });
    return { ok: true, data: { years: years, srvVer: this.SRV_VER } };
  },

  // ============================================================
  // planWorks.list — работы месяца (Task 471)
  // ============================================================
  // payload: { token, year, month(1..12) }
  // returns: { ok: true, data: { works: [{id, год, месяц,
  //   работа, статус, дата_статуса}], srvVer } }
  listWorks: function(payload) {
    var g = this._requireAccess(payload.token);
    if (g.error) return g.error;

    var year = parseInt(payload.year, 10);
    var month = parseInt(payload.month, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      return { ok: false, error: 'invalid_year',
               message: 'Год работ не распознан' };
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return { ok: false, error: 'invalid_month',
               message: 'Месяц работ должен быть 1..12' };
    }

    var sheet = this._getWorksSheet();
    if (!sheet) {
      return { ok: false, error: 'sheet_not_found',
               message: 'Лист «Работы на месяц» в файле Мероприятия_КИП_ИОС не найден — запустите planWorksDeploy() (scripts/PlanWorksInit.gs, Task 471)' };
    }

    var works = [];
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var vals = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
      for (var i = 0; i < vals.length; i++) {
        var w = this._rowToWork(vals[i]);
        if (!w) continue;                   // битая строка — мимо
        if (w['год'] === year && w['месяц'] === month) works.push(w);
      }
    }
    return { ok: true, data: { works: works, srvVer: this.SRV_VER } };
  },

  // ============================================================
  // planWorks.add — добавить работу (Task 471)
  // ============================================================
  // payload: { token, year, month(1..12), work(текст до 500 симв.) }
  // returns: { ok: true, data: { work: {…} } }
  addWork: function(payload) {
    var g = this._requireAccess(payload.token);
    if (g.error) return g.error;
    var user = g.user;

    var year = parseInt(payload.year, 10);
    var month = parseInt(payload.month, 10);
    var work = String(payload.work || '').trim();
    if (isNaN(year) || year < 2000 || year > 2100) {
      return { ok: false, error: 'invalid_year',
               message: 'Год работ не распознан' };
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return { ok: false, error: 'invalid_month',
               message: 'Месяц работ должен быть 1..12' };
    }
    if (!work || work.length > 500) {
      return { ok: false, error: 'invalid_work',
               message: 'Описание работы пустое или длиннее 500 символов' };
    }

    var sheet = this._getWorksSheet();
    if (!sheet) {
      return { ok: false, error: 'sheet_not_found',
               message: 'Лист «Работы на месяц» в файле Мероприятия_КИП_ИОС не найден — запустите planWorksDeploy() (scripts/PlanWorksInit.gs, Task 471)' };
    }

    // Автоинкремент id — max по колонке A (как отметки Task 463)
    var lastRow = sheet.getLastRow();
    var maxId = 0;
    if (lastRow >= 2) {
      var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        var id = parseInt(ids[i][0], 10);
        if (!isNaN(id) && id > maxId) maxId = id;
      }
    }

    var row = [maxId + 1, year, month, work, '', '',
               String(user.email || ''), this._isoNow()];
    sheet.appendRow(row);
    try {
      Utils.audit(user.email, 'PLAN_WORKS_ADD', '', '',
        'Работа добавлена: ' + work + ' (' + month + '/' + year + ')');
    } catch (e) { /* ignore */ }
    return { ok: true, data: { work: this._rowToWork(row) } };
  },

  // ============================================================
  // planWorks.remove — удалить работу (Task 471)
  // ============================================================
  // payload: { token, id }
  // returns: { ok: true, data: { removed: bool } }
  //   ИДЕМПОТЕНТНО: работы нет → removed: false (не ошибка)
  // Удаляет ВСЕ строки с id (в т.ч. ручные дубли); обход с КОНЦА
  // списка — позиции после удаления не съезжают
  removeWork: function(payload) {
    var g = this._requireAccess(payload.token);
    if (g.error) return g.error;
    var user = g.user;

    var id = parseInt(payload.id, 10);
    if (isNaN(id) || id <= 0) {
      return { ok: false, error: 'invalid_id',
               message: 'Идентификатор работы не распознан' };
    }

    var sheet = this._getWorksSheet();
    if (!sheet) {
      return { ok: false, error: 'sheet_not_found',
               message: 'Лист «Работы на месяц» в файле Мероприятия_КИП_ИОС не найден — запустите planWorksDeploy() (scripts/PlanWorksInit.gs, Task 471)' };
    }

    var removed = 0;
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var vals = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
      for (var i = vals.length - 1; i >= 0; i--) {
        var rowId = parseInt(vals[i][0], 10);
        if (rowId === id) {
          sheet.deleteRow(i + 2);
          removed++;
        }
      }
    }
    try {
      Utils.audit(user.email, 'PLAN_WORKS_REMOVE', '', '',
        'Работа удалена: id ' + id + (removed ? '' : ' — не найдена'));
    } catch (e) { /* ignore */ }
    return { ok: true, data: { removed: removed > 0 } };
  },

  // ============================================================
  // planWorks.setStatus — отметить выполнение работы (Task 471)
  // ============================================================
  // payload: { token, id, status('выполнено'|'частично'|
  //   'не выполнено'), date('ГГГГ-ММ-ДД', необязательно) }
  // returns: { ok: true, data: { work: {id, статус, дата_статуса} } }
  //   | { ok: false, error: 'not_found' }
  // Обновляет статус (E) + дата_статуса (F) + email (G) +
  // время_изменения (H) у ВСЕХ строк с id. Дата не передана —
  // сегодня (по часовому поясу скрипта)
  setWorkStatus: function(payload) {
    var g = this._requireAccess(payload.token);
    if (g.error) return g.error;
    var user = g.user;

    var id = parseInt(payload.id, 10);
    var status = String(payload.status || '').trim();
    if (isNaN(id) || id <= 0) {
      return { ok: false, error: 'invalid_id',
               message: 'Идентификатор работы не распознан' };
    }
    if (this.WORKS_STATUSES.indexOf(status) === -1) {
      return { ok: false, error: 'invalid_status',
               message: 'Статус должен быть одним из: ' +
                        this.WORKS_STATUSES.join(', ') };
    }
    var date = this._normDate(payload.date);
    if (!date) {
      date = Utilities.formatDate(new Date(),
                                 Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }

    var sheet = this._getWorksSheet();
    if (!sheet) {
      return { ok: false, error: 'sheet_not_found',
               message: 'Лист «Работы на месяц» в файле Мероприятия_КИП_ИОС не найден — запустите planWorksDeploy() (scripts/PlanWorksInit.gs, Task 471)' };
    }

    // Поиск строк id (сверху вниз; правка не сдвигает строки)
    var hitRows = [];
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var vals = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
      for (var i = 0; i < vals.length; i++) {
        if (parseInt(vals[i][0], 10) === id) {
          hitRows.push(i + 2);           // позиция строки листа
        }
      }
    }
    if (!hitRows.length) {
      return { ok: false, error: 'not_found',
               message: 'Работа не найдена — возможно, её уже удалили. Обновите перечень работ' };
    }
    for (var j = 0; j < hitRows.length; j++) {
      sheet.getRange(hitRows[j], 5).setValue(status);       // E: статус
      sheet.getRange(hitRows[j], 6).setValue(date);          // F: дата
      sheet.getRange(hitRows[j], 7).setValue(String(user.email || '')); // G
      sheet.getRange(hitRows[j], 8).setValue(this._isoNow()); // H: время
    }
    try {
      Utils.audit(user.email, 'PLAN_WORKS_STATUS', '', '',
        'Работа id ' + id + ' — статус: ' + status + ' (' + date + ')');
    } catch (e) { /* ignore */ }
    return { ok: true, data: { work: {
      id: id,
      'статус': status,
      'дата_статуса': date
    } } };
  },

  // ============================================================
  // Внутренние хелперы
  // ============================================================

  // Доступ — право plan.events (Task 462). RoleMatrixGate.gs не
  // задеплоен → отказ всем: модуль появился ПОСЛЕ Task 295, у него
  // нет «старых списков ролей» (fail-closed, как матричные группы)
  _requireAccess: function(token) {
    if (typeof rmRequirePerm !== 'function') {
      return { error: { ok: false, error: 'access_denied',
               message: 'RoleMatrixGate.gs не задеплоен — план-эвентс закрыт (fail-closed)' } };
    }
    var g = rmRequirePerm(token, 'plan.events', 'PlanEvents');
    if (!g.ok) return { error: { ok: false, error: g.error } };
    return { user: g.user };
  },

  // Лист «Архив» (null — нет файла/листа; запись невозможна до
  // запуска PlanEventsInit.gs — клиент покажет понятную ошибку)
  _getArchiveSheet: function() {
    try {
      var ss = SpreadsheetApp.openById(this.SPREADSHEET_ID);
      if (!ss) return null;
      return ss.getSheetByName(this.ARCHIVE_SHEET);
    } catch (e) {
      return null;
    }
  },

  // Лист «Работы на месяц» (null — нет файла/листа; запись
  // невозможна до запуска PlanWorksInit.gs — клиент покажет
  // понятную ошибку)
  _getWorksSheet: function() {
    try {
      var ss = SpreadsheetApp.openById(this.SPREADSHEET_ID);
      if (!ss) return null;
      return ss.getSheetByName(this.WORKS_SHEET);
    } catch (e) {
      return null;
    }
  },

  // Строка листа «Работы на месяц» → работа. Битые (нет id/
  // текста/месяца) — null, молча пропускаются (ручные правки
  // не ломают перечень)
  _rowToWork: function(r) {
    var id = parseInt(r[0], 10);
    if (isNaN(id)) return null;
    var work = String(r[3] || '').trim();
    if (!work) return null;
    var year = parseInt(r[1], 10);
    var month = parseInt(r[2], 10);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
    var status = String(r[4] || '').trim();
    if (this.WORKS_STATUSES.indexOf(status) === -1) status = '';
    return {
      id: id,
      'год': year,
      'месяц': month,
      'работа': work,
      'статус': status,
      'дата_статуса': this._normDate(r[5])
    };
  },

  // Строка листа → отметка. Битые (нет id/наименования/месяца) —
  // null, молча пропускаются (ручные правки не ломают список)
  _rowToMark: function(r) {
    var id = parseInt(r[0], 10);
    if (isNaN(id)) return null;
    var event = String(r[2] || '').trim();
    if (!event) return null;
    var year = parseInt(r[3], 10);
    var month = parseInt(r[4], 10);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
    return {
      id: id,
      'дата_выполнения': this._normDate(r[1]),
      'мероприятие': event,
      'год': year,
      'месяц': month
    };
  },

  // Дата листа/клиента → 'ГГГГ-ММ-ДД' ('' — не распознана).
  // Понимает: Date-объект (Google Sheets), 'ГГГГ-ММ-ДД',
  // 'ДД.ММ.ГГГГ' / 'ДД/ММ/ГГГГ' (ручное заполнение)
  _normDate: function(v) {
    if (v === null || v === undefined || v === '') return '';
    if (Object.prototype.toString.call(v) === '[object Date]') {
      if (isNaN(v.getTime())) return '';
      return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    var s = String(v).trim();
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) {
      return m[1] + '-' + (m[2].length < 2 ? '0' : '') + m[2] +
             '-' + (m[3].length < 2 ? '0' : '') + m[3];
    }
    m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/.exec(s);
    if (m) {
      return m[3] + '-' + (m[2].length < 2 ? '0' : '') + m[2] +
             '-' + (m[1].length < 2 ? '0' : '') + m[1];
    }
    return '';
  },

  // ISO timestamp момента отметки (время_отметки, колонка G)
  _isoNow: function() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(),
                                "yyyy-MM-dd'T'HH:mm:ss");
  }
};
