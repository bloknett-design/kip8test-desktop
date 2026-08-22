// ============================================================
// Flowmeter.gs — Расходомеры хозрасчётные: чтение/запись данных
// в Google Таблицу hozraschet_meters
// ============================================================
// Развернуть в том же Apps Script проекте, где находятся
//   Code.gs, Utils.gs, CableJournal.gs.
//
// Эндпоинты (вызываются через doPost):
//   flowmeter.list         — прочитать все позиции расходомеров
//   flowmeter.updateReading — обновить показания одной позиции
//
// Авторизация — по тому же паттерну, что CableJournal.gs:
//   Utils.findSessionByToken(token) → session
//   Utils.findUserById(session.user_id) → user
//
// Структура листа «hozraschet_meters» в Google Таблице:
//   Строка 1 — заголовки столбцов
//   Строки 2+ — данные (12 позиций, строки 2–13)
//
//   Столбцы (A–N):
//     A: id         — номер позиции (1–12)
//     B: hoz        — название (Хозрасчёт №1)
//     C: param      — параметр (Расход пара в корпус 114)
//     D: datePrev   — предыдущая дата (Date object в ячейке)
//     E: dateCurr   — текущая дата (Date object в ячейке)
//     F: prev       — предыдущие показания (число)
//     G: curr       — текущие показания (число)
//     H: unit       — единица измерения (т, м³)
//     I: temp       — температура среды (/число или пусто)
//     J: Gcal       — гигакалории пара (число или пусто; только для расходомеров пара, Task 100)
//     K: period     — периодичность (Ежедневно/Еженедельно/Ежемесячно)
//     L: modRole    — роль пользователя, внёсшего последние изменения
//     M: modName    — имя пользователя, внёсшего последние изменения
//     N: modTimestamp — timestamp последнего ввода (Task 108 — для редактирования в течение 1 часа)
//
//   Данные начинаются со строки 2 (строка 1 — заголовки).
//   Строка 2 → id=1, строка 13 → id=12.
//
//   Даты хранятся как Date objects (не строки!),
//   что позволяет Google Sheets отображать их корректно
//   независимо от локали таблицы.
//   Клиент отправляет/ожидает формат M/D/YYYY (8/3/2026).
// ============================================================

var Flowmeter = {

  // ID Google Таблицы
  SPREADSHEET_ID: '1enZSq7K8pwJVzaAI_tbXZtvATqARTxH0lSU4c-wc1eY',

  // Имя листа в таблице
  SHEET_NAME: 'hozraschet_meters',

  // Строка, с которой начинаются данные (1-based, после заголовков)
  DATA_START_ROW: 2,

  // Роли с правом чтения расходомеров
  // Task 112: убран 'КИП ИОС pro' — по карте ролей фильтр 10 = нет
  // Task 116: добавлен 'КИП8 pro' — по карте ролей фильтр 10 = да
  READ_ROLES: ['КИП ИОС дежурный', 'ИТР8', 'ИТР8 pro', 'ИТР ИОС',
               'КИП8 pro', 'Админ'],

  // Роли с правом ввода показаний (запись)
  INPUT_ROLES: ['КИП ИОС дежурный', 'Админ'],

  // ============================================================
  // Получить лист таблицы по имени, с fallback на первый лист
  // ============================================================
  _getSheet: function() {
    var ss = SpreadsheetApp.openById(this.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(this.SHEET_NAME);
    if (sheet) return sheet;
    var sheets = ss.getSheets();
    if (sheets.length > 0) return sheets[0];
    return null;
  },

  // ============================================================
  // Авторизация: чтение
  // По паттерну CableJournal._requireRead, но без throw —
  // возвращает { user } или { error: {ok:false,...} }
  // ============================================================
  _requireRead: function(token) {
    if (!token) return { error: { ok: false, error: 'no_session' } };
    var session = Utils.findSessionByToken(token);
    if (!session) return { error: { ok: false, error: 'no_session' } };
    var user = Utils.findUserById(session.user_id);
    if (!user) return { error: { ok: false, error: 'no_session' } };

    if (this.READ_ROLES.indexOf(user.role) === -1) {
      return { error: { ok: false, error: 'access_denied' } };
    }
    return { user: user };
  },

  // ============================================================
  // Авторизация: запись (ввод показаний)
  // По паттерну CableJournal._requireEdit, но без throw —
  // возвращает { user } или { error: {ok:false,...} }
  // ============================================================
  _requireEdit: function(token) {
    if (!token) return { error: { ok: false, error: 'no_session' } };
    var session = Utils.findSessionByToken(token);
    if (!session) return { error: { ok: false, error: 'no_session' } };
    var user = Utils.findUserById(session.user_id);
    if (!user) return { error: { ok: false, error: 'no_session' } };

    if (this.INPUT_ROLES.indexOf(user.role) === -1) {
      try {
        Utils.audit(user.email, 'FLOWMETER_ACCESS_DENIED', '', '',
          'Роль "' + user.role + '" не имеет прав на ввод показаний расходомеров');
      } catch (e) { /* ignore */ }
      return { error: { ok: false, error: 'access_denied' } };
    }
    return { user: user };
  },

  // ============================================================
  // flowmeter.list — прочитать все позиции расходомеров
  // ============================================================
  // payload: { token }
  // Возвращает: { ok: true, data: { meters: [...] } }
  list: function(payload) {
    var auth = this._requireRead(payload.token);
    if (auth.error) return auth.error;

    var sheet = this._getSheet();
    if (!sheet) {
      return { ok: false, error: 'Лист не найден' };
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < this.DATA_START_ROW) {
      return { ok: true, data: { meters: [] } };
    }

    // Читаем данные (строка DATA_START_ROW до lastRow, столбцы A–N = 14 столбцов)
    var range = sheet.getRange(this.DATA_START_ROW, 1, lastRow - this.DATA_START_ROW + 1, 14);
    var values = range.getValues();

    // Task 109: Строим кэш email → name из таблицы users (KIP8_Access)
    // для отображения имени пользователя (а не email) в карточке.
    var userNameCache = this._buildUserNameCache();

    var meters = [];
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      // Пропускаем пустые строки
      if (!row[0] && !row[1]) continue;

      var modEmail = String(row[12] || '');  // M — email (для _canEdit)
      // Task 109: modDisplayName — имя пользователя из таблицы users (для отображения)
      var modDisplayName = modEmail;
      if (modEmail && userNameCache[modEmail]) {
        modDisplayName = userNameCache[modEmail];
      }

      var meter = {
        id:             parseInt(row[0], 10) || (i + 1),
        hoz:            String(row[1] || ''),
        param:          String(row[2] || ''),
        datePrev:       this._sheetToClientDate(row[3]),
        dateCurr:       this._sheetToClientDate(row[4]),
        prev:           parseFloat(row[5]) || 0,
        curr:           parseFloat(row[6]) || 0,
        unit:           String(row[7] || ''),
        temp:           this._parseTemp(row[8]),
        gcal:           this._parseGcal(row[9]),   // J=10 — гигакалории пара (Task 100)
        period:         String(row[10] || ''),
        modRole:        String(row[11] || ''),
        modName:        modEmail,                   // M — email (для _canEdit, Task 108)
        modDisplayName: modDisplayName,             // Task 109 — имя для отображения
        modTimestamp:   this._parseTimestamp(row[13])  // N=14 (Task 108)
      };
      meters.push(meter);
    }

    return { ok: true, data: { meters: meters } };
  },

  // ============================================================
  // flowmeter.updateReading — обновить показания одной позиции
  // ============================================================
  // payload: { token, id, prev, curr, datePrev, dateCurr, temp, gcal }
  // Возвращает: { ok: true, data: { id: N } }
  //
  // Записывает в строку (id + 1):
  //   D → datePrev (Date), E → dateCurr (Date),
  //   F → prev, G → curr, I → temp, J → gcal (Task 100)
  updateReading: function(payload) {
    var auth = this._requireEdit(payload.token);
    if (auth.error) return auth.error;
    var user = auth.user;

    var id = parseInt(payload.id, 10);
    if (!id || id < 1) {
      return { ok: false, error: 'Некорректный id позиции' };
    }

    var sheet = this._getSheet();
    if (!sheet) {
      return { ok: false, error: 'Лист не найден' };
    }

    // Строка в таблице: id + 1 (строка 1 — заголовки, строка 2 — id=1)
    var rowNum = id + 1;
    var lastRow = sheet.getLastRow();
    if (rowNum > lastRow) {
      return { ok: false, error: 'Позиция id=' + id + ' не найдена' };
    }

    // Конвертируем даты: M/D/YYYY (клиент) → Date object (таблица)
    var datePrevObj = this._clientToDateObj(payload.datePrev);
    var dateCurrObj = this._clientToDateObj(payload.dateCurr);
    var prevVal = parseFloat(payload.prev) || 0;
    var currVal = parseFloat(payload.curr) || 0;

    // Task 108: Если isEdit=true — проверяем, что прошёл менее 1 часа
    // и что текущий пользователь — тот, кто вводил последние показания.
    if (payload.isEdit) {
      var existingModName = String(sheet.getRange(rowNum, 13).getValue() || '');  // M=13
      var existingTs = sheet.getRange(rowNum, 14).getValue();  // N=14 — modTimestamp

      // Проверка: тот же пользователь? Сравниваем по email (Task 108)
      var currentUser = user.email || '';
      if (existingModName !== currentUser) {
        return { ok: false, error: 'not_your_input',
                 message: 'Редактировать может только тот, кто вводил показания' };
      }

      // Проверка: прошёл менее 1 часа?
      if (existingTs instanceof Date) {
        var elapsedMin = (new Date() - existingTs) / 1000 / 60;
        if (elapsedMin > 60) {
          return { ok: false, error: 'edit_window_expired',
                   message: 'Прошло более 1 часа — редактирование недоступно' };
        }
      } else {
        // modTimestamp пустой — редактирование недоступно (старые данные без timestamp)
        return { ok: false, error: 'edit_window_expired',
                 message: 'Нет данных о времени ввода — редактирование недоступно' };
      }
    }

    // Обновляем ячейки:
    // D=4 (datePrev), E=5 (dateCurr), F=6 (prev), G=7 (curr), I=9 (temp)
    if (datePrevObj) {
      sheet.getRange(rowNum, 4).setValue(datePrevObj);
    } else {
      sheet.getRange(rowNum, 4).setValue(payload.datePrev || '');
    }
    if (dateCurrObj) {
      sheet.getRange(rowNum, 5).setValue(dateCurrObj);
    } else {
      sheet.getRange(rowNum, 5).setValue(payload.dateCurr || '');
    }
    sheet.getRange(rowNum, 6).setValue(prevVal);
    sheet.getRange(rowNum, 7).setValue(currVal);

    // Температура (I=9)
    if (payload.temp !== null && payload.temp !== undefined && payload.temp !== '') {
      sheet.getRange(rowNum, 9).setValue(parseFloat(payload.temp));
    } else {
      sheet.getRange(rowNum, 9).setValue('');
    }

    // Гигакалории пара (J=10, Task 100)
    // Записываются только для расходомеров пара (клиент отправляет gcal только для них).
    // Для остальных расходомеров поле gcal не отправляется — не трогаем ячейку J.
    if (payload.gcal !== null && payload.gcal !== undefined && payload.gcal !== '') {
      sheet.getRange(rowNum, 10).setValue(parseFloat(payload.gcal));
    } else if (payload.gcal === '' || payload.gcal === null) {
      // Явно послана пустая строка/null — очищаем ячейку
      sheet.getRange(rowNum, 10).setValue('');
    }
    // Если payload.gcal === undefined — не трогаем ячейку (старое значение остаётся)

    // Кто внёс изменения: L=12 (modRole), M=13 (modName)
    // Task 108: пишем email (не user.name) — чтобы клиент мог сравнить с KipAuth._cachedEmail
    sheet.getRange(rowNum, 12).setValue(user.role || '');
    sheet.getRange(rowNum, 13).setValue(user.email || '');

    // Task 108: Записываем timestamp текущего ввода в N=14 (modTimestamp)
    sheet.getRange(rowNum, 14).setValue(new Date());

    // Аудит (по паттерну CableJournal → Utils.audit)
    try {
      Utils.audit(user.email, 'FLOWMETER_UPDATE_READING', '', '',
        'Расходомер id=' + id + ': показания ' + payload.prev + ' → ' + payload.curr);
    } catch (e) { /* audit log — не критично */ }

    // Архив: добавить запись в лист hozraschet_archive
    // (не блокирует основной ответ — ошибка архива тихо логируется)
    try {
      var hozName = String(sheet.getRange(rowNum, 2).getValue() || '');
      var unitVal = String(sheet.getRange(rowNum, 8).getValue() || '');
      var periodVal = String(sheet.getRange(rowNum, 11).getValue() || '');
      FlowmeterArchive.appendToArchive(
        id, hozName,
        prevVal, currVal,
        payload.datePrev, payload.dateCurr,
        payload.temp, payload.gcal, unitVal, periodVal,
        user.role || '', user.name || user.email || ''  // Task 109: имя (если есть) или email
      );
    } catch (archiveErr) {
      Logger.log('Archive write failed (non-critical): ' + archiveErr.message);
    }

    return { ok: true, data: { id: id } };
  },

  // ============================================================
  // Вспомогательные: конвертация дат
  // ============================================================

  // Дата из таблицы → формат клиента (M/D/YYYY)
  _sheetToClientDate: function(val) {
    if (!val) return '';
    if (val instanceof Date) {
      return (val.getMonth() + 1) + '/' + val.getDate() + '/' + val.getFullYear();
    }
    var s = String(val).trim();
    if (!s) return '';
    // DD.MM.YYYY → M/D/YYYY
    var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) {
      return (+m[2]) + '/' + (+m[1]) + '/' + m[3];
    }
    // M/D/YYYY — вернуть как есть
    if (s.indexOf('/') !== -1) return s;
    return s;
  },

  // Дата из клиента (M/D/YYYY) → Date object для записи в таблицу
  _clientToDateObj: function(val) {
    if (!val) return null;
    var s = String(val).trim();
    // M/D/YYYY → new Date(year, month-1, day)
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      var dateObj = new Date(+m[3], +m[1] - 1, +m[2]);
      if (!isNaN(dateObj.getTime())) return dateObj;
    }
    // DD.MM.YYYY → new Date(year, month-1, day)
    var d = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (d) {
      var dateObj2 = new Date(+d[3], +d[2] - 1, +d[1]);
      if (!isNaN(dateObj2.getTime())) return dateObj2;
    }
    return null;
  },

  // Парсинг температуры (число или null)
  _parseTemp: function(val) {
    if (val === '' || val === null || val === undefined) return null;
    var n = parseFloat(val);
    return isNaN(n) ? null : n;
  },

  // Парсинг гигакалорий пара (число или null) — Task 100
  _parseGcal: function(val) {
    if (val === '' || val === null || val === undefined) return null;
    var n = parseFloat(val);
    return isNaN(n) ? null : n;
  },

  // Парсинг timestamp последнего ввода (Date → ISO-строка, Task 108)
  _parseTimestamp: function(val) {
    if (val === '' || val === null || val === undefined) return null;
    if (val instanceof Date) {
      return val.toISOString();
    }
    var s = String(val).trim();
    return s || null;
  },

  // ============================================================
  // Task 109: Построить кэш { email → name } из листа users (KIP8_Access)
  // Используется в list() для отображения имени пользователя (а не email)
  // в детальной карточке расходомера.
  //
  // Использует Utils.getRows('users') — возвращает массив объектов
  // с ключами из строки 4 заголовков листа users.
  // Если в таблице есть столбец 'name' — используем его.
  // Если нет — modDisplayName = email (fallback).
  // ============================================================
  _buildUserNameCache: function() {
    var cache = {};
    try {
      if (typeof Utils !== 'undefined' && Utils.getRows) {
        var users = Utils.getRows('users');
        if (users && users.length) {
          for (var i = 0; i < users.length; i++) {
            var u = users[i];
            var email = String(u.email || '').toLowerCase().trim();
            var name = String(u.name || '').trim();
            if (email && name) {
              cache[email] = name;
            }
          }
        }
      }
    } catch (e) {
      // Тихо игнорируем — modDisplayName = email (функциональность не ломается)
    }
    return cache;
  }
};
