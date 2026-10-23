// ============================================================
// MinesweeperArchive.gs — Сапёр: архив счёта пользователей
// по email (Task 546)
// ============================================================
// Разворачивать в ТОМ ЖЕ Apps Script-проекте, где Code.gs,
// Utils.gs, RoleMatrixGate.gs (проект развёртывания AKfycbyt… —
// ОДИН бэкенд на kip8 и kip8test).
//
// В Code.gs (doPost) добавить два case (см. scripts/Code.gs —
// эталон уже обновлён):
//   case 'minesweeper.recordResult':
//     return _json(MinesweeperArchive.recordResult(payload));
//   case 'minesweeper.getMyArchive':
//     return _json(MinesweeperArchive.getMyArchive(payload));
//
// ЭНДПОИНТЫ (через KipAuth.api клиента):
//   minesweeper.recordResult — зафиксировать завершённую партию:
//     {token, won(true|false), time(сек), diff(easy|medium|hard),
//      cols, rows, mines}
//     → {ok, data: {id, saved: true}}
//     Валидация: won — строго bool; time — целое 0..36000; diff —
//     из множества; поле — целые 4..60; мины — целые 1..500 и
//     меньше числа клеток (мины > клеток — бессмыслица). Ошибки
//     ОТКЛОНЯЮТСЯ (зеркально PhonebookArchive invalid_*): клиент
//     видит понятный код, строка не пишется.
//   minesweeper.getMyArchive — своя история (по email из сессии):
//     {token}
//     → {ok, data: {srvVer, rows: [{id, ts, won, diff, field,
//        time, mines}] — последние 50, НОВЫЕ ПЕРВЫМИ, stats:
//        {total, wins, losses, best: {easy: сек, …}}}}
//     best — минимальное время среди ПОБЕД по каждой сложности.
//
// ХРАНИЛИЩЕ — по заявке НОВАЯ СТРАНИЦА В ФАЙЛЕ KIP8_Access (не
// отдельный файл, как у PhonebookArchive): таблица открывается по
// тому же ID, что RoleMatrix.gs / SessionsDevicePolicy.gs. Лист
// «Сапёр» создаётся minesweeperArchiveInit() (разовый запуск из
// редактора) ИЛИ лениво при первом обращении к API (тогда же);
// повторные запуски идемпотентны. Диагностика —
// minesweeperArchiveStatus().
//
//   Лист «Сапёр» (стиль листов users/sessions — урок
//   RoleMatrixInit v4: строки 1–2 объединены на всю ширину,
//   закреплены ТОЛЬКО строки; колонки не закрепляем — объединение
//   через границу закрепления колонков создаёт «пустой» лист):
//     Строка 1: титул (объединена A1:I1, шапка)
//     Строка 2: описание/правила (объединена A2:I2)
//     Строка 3: заголовки (закреплено 3 строки)
//     Строка 4+: данные (добавление — appendRow):
//     A: id          — автоинкремент (max + 1)
//     B: дата        — ISO timestamp (текст, формат '@')
//     C: email       — кто играл (из сессии; малые буквы)
//     D: имя         — снимок из листа users (человеку читать;
//                      пустой name → пусто, клиент показывает email)
//     E: результат   — 'победа' | 'поражение'
//     F: сложность   — 'easy' | 'medium' | 'hard'
//     G: поле        — 'ширинаxвысота' фактической ориентации
//                      ('9x9', '16x9' на десктопе и т.п.)
//     H: время_сек   — число
//     I: мины        — число
//
// ПРИНЦИП ДОСТУПА (заявка: «архив счёта пользователей по email»):
//   - каждая строка несёт email игрока (из сессии, не из payload —
//     подделать чужой email нельзя);
//   - ЧТЕНИЕ всегда фильтруется по email текущего пользователя
//     (getMyArchive возвращает ТОЛЬКО свои партии);
//   - записи только добавляются (журнал результатов): правки и
//     удаления чужих строк API не выполняет вовсе. Гейт раздела —
//     право secret.view матрицы KIP8_Access (то же, что открывает
//     страницу «Сапёр» на клиенте — _SECRET_PAGES). RoleMatrixGate.gs
//     не задеплоен → отказ всем (fail-closed, как PhonebookArchive).
//
// ПОДГОТОВЛЕННЫЕ ОБЛАСТИ: записи идут через
// LockService.getScriptLock() (параллельные партии не портят
// автоинкремент); каждая запись журналируется в audit_log
// (Utils.audit, коды MINE_RECORD_WIN / MINE_RECORD_LOSS).
// Текстовые колонки — формат '@' (Task 304 — даты/email текстом,
// защита от локалей); значения, начинающиеся с '=+-@',
// экранируются апострофом (защита от формул).
//
// РАСШИРЕНИЕ В БУДУЩЕЕ: новые данные — новыми КОЛОНКАМИ В КОНЕЦ
// (позиции старых не сдвигать), инкрементировать SCHEMA_VERSION;
// чтение позиционное (по индексу колонки) — заголовки человеку,
// индексы коду.
// ============================================================

var MinesweeperArchive = {

  // Таблица KIP8_Access — тот же ID, что RoleMatrix.gs /
  // SessionsDevicePolicy.gs (заявка: страница архива В ЭТОМ файле)
  SPREADSHEET_ID: '1TmmNZLUArWH38F6NX0gMGar8LMNMQomm_FaGZv9osyk',

  // Новая страница (лист) в KIP8_Access
  SHEET: 'Сапёр',

  // Версия структуры листа (инкрементировать при расширении)
  SCHEMA_VERSION: 1,

  // Task 537-паттерн: версия серверного кода (клиент отличает
  // старый Apps Script: нет action → «Unknown action» — тихая
  // деградация на локальный счёт Task 193, без потери данных)
  SRV_VER: '546',

  // Заголовки листа (строка 3; данные — со строки 4)
  HEADERS: ['id', 'дата', 'email', 'имя', 'результат',
            'сложность', 'поле', 'время_сек', 'мины'],

  // Колонки текстового формата '@' (Task 304): дата, email, имя,
  // результат, сложность, поле
  TEXT_COLS: [2, 3, 4, 5, 6, 7],

  // Позиции колонок (1-based; чтение позиционное)
  COL: { ID: 1, DATE: 2, EMAIL: 3, NAME: 4, RESULT: 5,
         DIFF: 6, FIELD: 7, TIME: 8, MINES: 9 },

  // Допустимые сложности (зеркало клиента msDifficulties)
  DIFFS: { easy: true, medium: true, hard: true },

  // Лимиты валидации (отклоняем, а не режем молча)
  MAX_TIME: 36000,        // 10 часов
  MIN_DIM: 4, MAX_DIM: 60,
  MIN_MINES: 1, MAX_MINES: 500,
  MAX_ROWS_RETURN: 50,    // getMyArchive: последние 50 партий
  MAX_NAME: 200,

  RESULT_WIN: 'победа',
  RESULT_LOSS: 'поражение',

  // Цвет шапки — как у листов архивов (единый вид)
  HEADER_BG: '#1F4E5F',

  // ============================================================
  // minesweeper.recordResult — зафиксировать партию
  // ============================================================
  // payload: {token, won, time, diff, cols, rows, mines}
  // returns: {ok: true, data: {id, saved: true}} | {ok:false,…}
  recordResult: function(payload) {
    var g = this._requireAccess(payload.token);
    if (g.error) return g.error;
    var user = g.user;
    var email = this._normEmail(user.email);

    var v = this._validateGame(payload);
    if (!v.ok) return { ok: false, error: v.error, message: v.message };

    var ss = this._getSS();
    if (!ss) return this._ssError();
    var sheet = ss.getSheetByName(this.SHEET);
    if (!sheet) return this._sheetError();

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var rowId = this._nextId(sheet);
      var name = this._userName(email);
      this._appendRow(sheet, [rowId, this._isoNow(), email, name,
        v.won ? this.RESULT_WIN : this.RESULT_LOSS,
        v.diff, v.field, v.time, v.mines]);
      try {
        Utils.audit(user.email,
          v.won ? 'MINE_RECORD_WIN' : 'MINE_RECORD_LOSS', '', '',
          'Сапёр: ' + (v.won ? 'победа' : 'поражение') + ' ' +
          v.time + ' с (' + v.diff + ' ' + v.field + ')');
      } catch (e) { /* ignore */ }
      return { ok: true, data: { id: rowId, saved: true } };
    } finally {
      lock.releaseLock();
    }
  },

  // ============================================================
  // minesweeper.getMyArchive — своя история (по email)
  // ============================================================
  // payload: {token}
  // returns: {ok, data: {srvVer, rows: [последние 50, новые
  //          первыми], stats: {total, wins, losses, best}}}
  // Чужие партии НЕ возвращаются: фильтр по email из сессии.
  getMyArchive: function(payload) {
    var g = this._requireAccess(payload.token);
    if (g.error) return g.error;
    var email = this._normEmail(g.user.email);

    var ss = this._getSS();
    if (!ss) return this._ssError();

    var rows = [];
    var sheet = ss.getSheetByName(this.SHEET);
    if (sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow >= 4) {
        var vals = sheet.getRange(4, 1, lastRow - 3,
                                  this.COL.MINES).getValues();
        for (var i = 0; i < vals.length; i++) {
          var rec = this._rowToGame(vals[i]);
          if (!rec) continue;               // битая строка — мимо
          if (rec.email !== email) continue;      // ТОЛЬКО свои
          rows.push(rec);
        }
      }
    }

    // лист — append-порядок (старые сверху): новые первыми
    rows.reverse();

    var stats = { total: rows.length, wins: 0, losses: 0, best: {} };
    for (var j = 0; j < rows.length; j++) {
      if (rows[j].won) {
        stats.wins++;
        var d = rows[j].diff;
        if (!stats.best[d] || rows[j].time < stats.best[d]) {
          stats.best[d] = rows[j].time;
        }
      } else {
        stats.losses++;
      }
    }

    return { ok: true, data: { srvVer: this.SRV_VER,
      rows: rows.slice(0, this.MAX_ROWS_RETURN), stats: stats } };
  },

  // ============================================================
  // Валидация партии (зеркало клиента msDifficulties; ошибки
  // отклоняются, а не режутся — пользователь видит код)
  // ============================================================
  _validateGame: function(p) {
    p = p || {};
    var won = (p.won === true || p.won === 'true');
    var lost = (p.won === false || p.won === 'false');
    if (!won && !lost) {
      return { ok: false, error: 'invalid_result',
        message: 'Результат партии — победа или поражение (won)' };
    }
    var time = parseInt(p.time, 10);
    if (isNaN(time) || time < 0 || time > this.MAX_TIME) {
      return { ok: false, error: 'invalid_time',
        message: 'Время партии — целое число 0..' + this.MAX_TIME +
                 ' секунд' };
    }
    var diff = String(p.diff || '').trim().toLowerCase();
    if (!this.DIFFS[diff]) {
      return { ok: false, error: 'invalid_diff',
        message: 'Сложность — easy, medium или hard' };
    }
    var cols = parseInt(p.cols, 10);
    var rows = parseInt(p.rows, 10);
    var mines = parseInt(p.mines, 10);
    if (isNaN(cols) || isNaN(rows) || cols < this.MIN_DIM ||
        cols > this.MAX_DIM || rows < this.MIN_DIM ||
        rows > this.MAX_DIM) {
      return { ok: false, error: 'invalid_field',
        message: 'Размер поля — целые ' + this.MIN_DIM + '..' +
                 this.MAX_DIM };
    }
    if (isNaN(mines) || mines < this.MIN_MINES ||
        mines > this.MAX_MINES || mines >= cols * rows) {
      return { ok: false, error: 'invalid_mines',
        message: 'Число мин — целое ' + this.MIN_MINES + '..' +
                 this.MAX_MINES + ', меньше числа клеток поля' };
    }
    return { ok: true, won: won, time: time, diff: diff,
             field: cols + 'x' + rows, mines: mines };
  },

  // Гейт: право secret.view (как у страницы «Сапёр» на клиенте);
  // RoleMatrixGate.gs не задеплоен → отказ (fail-closed)
  _requireAccess: function(token) {
    if (typeof rmRequirePerm !== 'function') {
      return { error: { ok: false, error: 'access_denied',
               message: 'RoleMatrixGate.gs не задеплоен — архив ' +
                        'счёта «Сапёра» закрыт (fail-closed)' } };
    }
    var g = rmRequirePerm(token, 'secret.view', 'MinesweeperArchive');
    if (!g.ok) return { error: { ok: false, error: g.error } };
    return { user: g.user };
  },

  // Таблица KIP8_Access: открыть по ID; лист «Сапёр» —
  // самовосстановление (идемпотентное создание при отсутствии)
  _getSS: function() {
    try {
      var ss = SpreadsheetApp.openById(this.SPREADSHEET_ID);
      if (!ss) return null;
      this._ensureSheet(ss);
      return ss;
    } catch (e) {
      return null;
    }
  },

  // Лист «Сапёр»: создать, если нет (под блокировкой — параллельные
  // вызовы не создадут два листа). Порядок: закрепление СТРОК ДО
  // объединений (урок RoleMatrixInit v3), объединение строк 1–2 —
  // на всю ширину БЕЗ закрепления колонок (урок v4)
  _ensureSheet: function(ss) {
    var sheet = ss.getSheetByName(this.SHEET);
    if (sheet) return sheet;

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      // перепроверка под замком — параллельный вызов мог создать
      sheet = ss.getSheetByName(this.SHEET);
      if (sheet) return sheet;

      sheet = ss.insertSheet(this.SHEET);
      sheet.setFrozenRows(3);

      sheet.getRange(1, 1, 1, this.COL.MINES).merge();
      sheet.getRange(2, 1, 1, this.COL.MINES).merge();

      sheet.getRange(1, 1).setValue(
        'САПЁР — архив счёта пользователей (по email)')
        .setBackground(this.HEADER_BG)
        .setFontColor('#FFFFFF').setFontWeight('bold');
      sheet.getRange(2, 1).setValue(
        'Каждая строка — завершённая партия. Привязка к email из сессии; ' +
        'через API пользователь видит только свои записи. ' +
        'Структура v' + this.SCHEMA_VERSION + ': расширение — колонками ' +
        'В КОНЕЦ, позиции старых не сдвигать.')
        .setFontStyle('italic');

      sheet.getRange(3, 1, 1, this.COL.MINES).setValues([this.HEADERS]);
      sheet.getRange(3, 1, 1, this.COL.MINES)
        .setBackground(this.HEADER_BG)
        .setFontColor('#FFFFFF').setFontWeight('bold');

      // текстовые колонки — формат '@' (Task 304) на весь столбец
      for (var c = 0; c < this.TEXT_COLS.length; c++) {
        sheet.getRange(4, this.TEXT_COLS[c],
                       sheet.getMaxRows(), 1).setNumberFormat('@');
      }
      // ширины колонок — читаемость человеком
      var widths = [50, 170, 190, 170, 95, 105, 75, 95, 60];
      for (var w = 0; w < widths.length; w++) {
        sheet.setColumnWidth(w + 1, widths[w]);
      }

      try {
        Utils.audit('', 'MINE_ARCHIVE_CREATED', '', '',
          'Создан лист «' + this.SHEET + '» в KIP8_Access');
      } catch (e) { /* ignore */ }
      return sheet;
    } finally {
      lock.releaseLock();
    }
  },

  // Следующий id листа (max + 1; данные со строки 4). Строки «мимо
  // формата» молча пропускаются — как PhonebookArchive._nextId
  _nextId: function(sheet) {
    var lastRow = sheet.getLastRow();
    var maxId = 0;
    if (lastRow >= 4) {
      var vals = sheet.getRange(4, 1, lastRow - 3, 1).getValues();
      for (var i = 0; i < vals.length; i++) {
        var v = parseInt(vals[i][0], 10);
        if (!isNaN(v) && v > maxId) maxId = v;
      }
    }
    return maxId + 1;
  },

  // Строка листа → запись. Битые (нет email) — null, молча
  // пропускаются (ручные правки не ломают чтение)
  _rowToGame: function(r) {
    var email = String(r[this.COL.EMAIL - 1] || '').trim();
    if (!email) return null;
    var result = String(r[this.COL.RESULT - 1] || '').trim();
    var time = parseInt(r[this.COL.TIME - 1], 10);
    return {
      id: parseInt(r[this.COL.ID - 1], 10),
      ts: String(r[this.COL.DATE - 1] || ''),
      email: this._normEmail(email),
      won: result === this.RESULT_WIN,
      diff: String(r[this.COL.DIFF - 1] || '').trim(),
      field: String(r[this.COL.FIELD - 1] || '').trim(),
      time: isNaN(time) ? null : time,
      mines: parseInt(r[this.COL.MINES - 1], 10)
    };
  },

  // Имя пользователя из листа users (KIP8_Access) — снимок для
  // чтения архива человеком (паттерн Flowmeter Task 109); нет
  // имени — пусто (клиент показывает email)
  _userName: function(email) {
    try {
      if (typeof Utils !== 'undefined' && Utils.getRows) {
        var users = Utils.getRows('users');
        for (var i = 0; i < users.length; i++) {
          var u = users[i] || {};
          if (this._normEmail(u.email) === email) {
            return this._clip(String(u.name || ''), this.MAX_NAME);
          }
        }
      }
    } catch (e) { /* тихо — имя опционально */ }
    return '';
  },

  // Строка в лист: строки экранируются от формул (_escCell),
  // числа (id/время/мины) — как есть
  _appendRow: function(sheet, row) {
    var out = row.map(function(v) {
      return (typeof v === 'string') ? this._escCell(v) : v;
    }, this);
    sheet.appendRow(out);
  },

  // email из сессии → малые буквы без пробелов
  _normEmail: function(v) {
    return String(v || '').trim().toLowerCase();
  },

  _clip: function(s, max) {
    s = String(s || '').trim();
    return s.length > max ? s.slice(0, max) : s;
  },

  // Защита от формул: '=+-@' в начале — ведущий апостроф (паттерн
  // PhonebookArchive._escCell; при чтении апостроф не возвращается)
  _escCell: function(s) {
    s = String(s === undefined || s === null ? '' : s);
    return /^[=+\-@]/.test(s) ? "'" + s : s;
  },

  // ISO timestamp (время скрипта; формат '@' хранит текстом)
  _isoNow: function() {
    return Utilities.formatDate(new Date(),
                                Session.getScriptTimeZone(),
                                "yyyy-MM-dd'T'HH:mm:ss");
  },

  // Понятная ошибка «таблица недоступна» (клиент показывает тост)
  _ssError: function() {
    return { ok: false, error: 'archive_unavailable',
             message: 'Таблица KIP8_Access недоступна — проверьте ' +
                      'доступ владельца Apps Script-проекта' };
  },

  // Понятная ошибка «лист не создан» (после _getSS почти
  // невозможна — самовосстановление; страховка)
  _sheetError: function() {
    return { ok: false, error: 'sheet_unavailable',
             message: 'Лист «' + this.SHEET + '» не найден в ' +
                      'KIP8_Access — запустите ' +
                      'minesweeperArchiveInit() в Apps Script' };
  }
};

// ============================================================
// minesweeperArchiveInit — разовое создание листа «Сапёр» в
// KIP8_Access (Task 546)
// ============================================================
// ПОРЯДОК ДЕЙСТВИЙ (см. DEPLOY-Task546-sweeper-flip-server-archive.md):
//   1. Открыть Apps Script Editor (проект AKfycbyt…, где Code.gs)
//   2. + → Создать файл «MinesweeperArchive.gs», вставить содержимое
//   3. В списке функций выбрать minesweeperArchiveInit → ▶ Run
//      (первый запуск попросит авторизацию — разрешить)
//   4. В журнале (Ctrl+Enter) — имя/URL таблицы; лист «Сапёр»
//      появится в KIP8_Access среди users/sessions/matrix
//   5. Deploy → Manage deployments → Edit → New version → Deploy
//
// ИДЕМПОТЕНТНО: лист уже есть — ничего не меняет, exists: true.
function minesweeperArchiveInit() {
  var ss = MinesweeperArchive._getSS();
  if (!ss) {
    Logger.log('MinesweeperArchiveInit: таблица KIP8_Access ' +
               'недоступна — проверьте ID/доступ владельца');
    return { ok: false, error: 'archive_unavailable' };
  }
  var sheet = ss.getSheetByName(MinesweeperArchive.SHEET);
  var out = {
    ok: true,
    exists: true,
    spreadsheet: ss.getName(),
    url: ss.getUrl(),
    sheet: MinesweeperArchive.SHEET,
    rows: sheet ? Math.max(sheet.getLastRow() - 3, 0) : 0
  };
  Logger.log('MinesweeperArchiveInit: лист «%s» готов — %s (строк: %s)',
             out.sheet, out.url, out.rows);
  return out;
}

// Диагностика архива (запускать в редакторе; ничего не меняет):
// таблица? лист? строки? заголовки?
function minesweeperArchiveStatus() {
  var out = { spreadsheet: false, sheet: false, rows: 0,
              headersOk: null, schemaVersion: null };
  try {
    var ss = SpreadsheetApp.openById(MinesweeperArchive.SPREADSHEET_ID);
    if (!ss) {
      Logger.log('MinesweeperArchiveStatus: KIP8_Access не открылся');
      return out;
    }
    out.spreadsheet = true;
    out.url = ss.getUrl();
    var sheet = ss.getSheetByName(MinesweeperArchive.SHEET);
    if (!sheet) {
      Logger.log('MinesweeperArchiveStatus: листа «%s» нет — ' +
                 'запустите minesweeperArchiveInit()',
                 MinesweeperArchive.SHEET);
      return out;
    }
    out.sheet = true;
    out.rows = Math.max(sheet.getLastRow() - 3, 0);
    if (sheet.getLastRow() >= 3) {
      var hdr = sheet.getRange(3, 1, 1, MinesweeperArchive.COL.MINES)
                      .getValues()[0];
      out.headersOk = String(hdr.join('|')) ===
                      String(MinesweeperArchive.HEADERS.join('|'));
    }
    out.schemaVersion = MinesweeperArchive.SCHEMA_VERSION;
    Logger.log('MinesweeperArchiveStatus: лист=%s строк=%s шапка=%s',
               out.sheet, out.rows, out.headersOk);
  } catch (e) {
    Logger.log('MinesweeperArchiveStatus: ошибка (%s)', e);
  }
  return out;
}
