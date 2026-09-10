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
//                            Task 286: payload.entryType='неделя'|'месяц' —
//                            ввод «расход за период» (только в архив,
//                            meters-строка не меняется; hard-проверки те же,
//                            soft-валидация пропускается — правила
//                            откалиброваны на суточные значения)
//   flowmeter.setComment   — Task 195: комментарий к последним показаниям
//                            (только для автора показаний)
//
// Авторизация — по тому же паттерну, что CableJournal.gs:
//   Utils.findSessionByToken(token) → session
//   Utils.findUserById(session.user_id) → user
//
// Структура листа «hozraschet_meters» в Google Таблице:
//   Строка 1 — заголовки столбцов
//   Строки 2+ — данные (12 позиций, строки 2–13)
//
//   Столбцы (A–Q; P не используется с Task 211):
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
//     O: comment    — активный комментарий к последним показаниям (Task 195; виден всем,
//                     редактировать может автор показаний ИЛИ админ — до тех пор,
//                     пока другой пользователь не внесёт новые данные)
//     P: (не используется с Task 211; ранее archivedComment — preview для карточки.
//                       Полная история комментариев — в hozraschet_archive.P по записям.)
//     Q: allowNegative — флаг «допустим отрицательный расход» (Task 199). Значения:
//                     'yes' (для счётчиков возврата конденсата, где curr<prev легитимно)
//                     или пусто/'no' (для остальных). Читается в list() → поле meter
//                     .allowNegative. Используется в ValidationRules.compute для
//                     пропуска правила JUMP_NEGATIVE.
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

  // Роли с правом чтения расходомеров (LEGACY-запас, Task 295:
  // рабочая проверка — право flowmeter.view из МАТРИЦЫ KIP8_Access,
  // список ниже — только если RoleMatrixGate.gs не задеплоен)
  // Task 112: убран 'КИП ИОС pro' — по карте ролей фильтр 10 = нет
  // Task 116: добавлен 'КИП8 pro' — по карте ролей фильтр 10 = да
  READ_ROLES: ['КИП ИОС дежурный', 'ИТР8', 'ИТР8 pro', 'ИТР ИОС',
               'КИП8 pro', 'Админ'],

  // Роли с правом ввода показаний (LEGACY-запас, Task 295: рабочая
  // проверка — право flowmeter.input из МАТРИЦЫ; по матрице (Task 293)
  // ввод также имеют «ИТР ИОС» — осознанное расширение против списка)
  INPUT_ROLES: ['КИП ИОС дежурный', 'Админ'],

  // Task 295: флаг однократного предупреждения о legacy-режиме
  _rmgLegacyWarned: false,

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
  // Task 295: право flowmeter.view из МАТРИЦЫ KIP8_Access
  // (лист matrix, строка 4). Если RoleMatrixGate.gs не задеплоен —
  // прежняя проверка по READ_ROLES (legacy-режим).
  // Возвращает { user } или { error: {ok:false,...} }
  // ============================================================
  _requireRead: function(token) {
    if (typeof rmRequirePerm === 'function') {
      var g = rmRequirePerm(token, 'flowmeter.view', 'Flowmeter');
      if (!g.ok) return { error: { ok: false, error: g.error } };
      return { user: g.user };
    }
    this._rmgLegacyWarn('Flowmeter._requireRead');
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
  // Task 295: право flowmeter.input из МАТРИЦЫ. ИЗМЕНЕНИЕ ПОВЕДЕНИЯ
  // (осознанное, матрица Task 293): «ИТР ИОС» теперь ВВОДИТ показания
  // (раньше — только дежурный и Админ). Роль без галочки — отказ,
  // матрица недоступна — отказ для всех (fail-closed).
  // Возвращает { user } или { error: {ok:false,...} }
  // ============================================================
  _requireEdit: function(token) {
    if (typeof rmRequirePerm === 'function') {
      var g = rmRequirePerm(token, 'flowmeter.input', 'Flowmeter');
      if (!g.ok) return { error: { ok: false, error: g.error } };
      return { user: g.user };
    }
    this._rmgLegacyWarn('Flowmeter._requireEdit');
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

  // Task 295: однократное предупреждение о работе без матрицы
  _rmgLegacyWarn: function(where) {
    if (this._rmgLegacyWarned) return;
    this._rmgLegacyWarned = true;
    try {
      console.error('[Flowmeter] RoleMatrixGate.gs не задеплоен — ' + where +
        ' работает по legacy-списку READ_ROLES/INPUT_ROLES. ' +
        'Вставьте RoleMatrix.gs + RoleMatrixGate.gs в проект.');
    } catch (e) { /* ignore */ }
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

    // Читаем данные (строка DATA_START_ROW до lastRow, столбцы A–Q = 17 столбцов;
    // O=15 — comment, Task 195; P=16 — не используется с Task 211;
    // Q=17 — allowNegative, Task 199)
    var range = sheet.getRange(this.DATA_START_ROW, 1, lastRow - this.DATA_START_ROW + 1, 17);
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
        modTimestamp:   this._parseTimestamp(row[13]),  // N=14 (Task 108)
        comment:        String(row[14] || '').trim(),   // O=15 — Task 195
        // Task 211: P=16 (archivedComment) больше не читается из meters —
        // полная история комментариев живёт в hozraschet_archive.P
        allowNegative:  String(row[16] || '').trim().toLowerCase()  // Q=17 — Task 199
      };
      meters.push(meter);
    }

    return { ok: true, data: { meters: meters } };
  },

  // ============================================================
  // flowmeter.updateReading — обновить показания одной позиции
  // ============================================================
  // payload: { token, id, prev, curr, datePrev, dateCurr, temp, gcal,
  //            entryType }  ← Task 286
  //   entryType — тип записи:
  //     'сутки' (по умолчанию, пусто/undefined = legacy-сутки) —
  //       обычный ввод: обновляется meters-строка (D–G, I, J, L–N) + архив;
  //     'неделя' / 'месяц' (Task 286, только Хозрасчёт №1) —
  //       «расход за период»: запись ТОЛЬКО в hozraschet_archive
  //       (R=entryType), meters-строка НЕ трогается — «Последние
  //       показания» в карточке остаются последними СУТОЧНЫМИ.
  //       prev всегда 0 → consumption в архиве = введённый расход.
  //       isEdit НЕ поддерживается (запись нельзя «изменить» — при ошибке
  //       вводится заново; история сохраняется в архиве).
  // Возвращает: { ok: true, data: { id: N } }
  //
  // Task 359: правка в окне 1 часа (isEdit=true, проверки M/N прошли)
  // теперь обновляет и АРХИВНУЮ запись НА МЕСТЕ (FlowmeterArchive.
  // updateLatestReading) — вместо создания новой строки архива.
  // «Правка = та же логическая запись»: история не обрастает дублями,
  // комментарий meters.O не сбрасывается (принадлежит этой же записи).
  // Fallback: свежей суточной записи в архиве нет (запись при вводе
  // не удалась) — создаётся новая строка (как при обычном вводе).
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

    // Task 286: нормализация типа записи. Допустимые значения:
    // 'сутки' (по умолчанию), 'неделя', 'месяц' — строка на русском,
    // попадает в hozraschet_archive.R как есть (читаемо в таблице).
    var entryType = String(payload.entryType || 'сутки').trim().toLowerCase();
    if (entryType !== 'неделя' && entryType !== 'месяц') entryType = 'сутки';

    // Task 286: «расход за период» — отдельная ветка (только архив)
    if (entryType === 'неделя' || entryType === 'месяц') {
      return this._writePeriodEntry(payload, user, id, entryType);
    }

    // Task 205: Хозрасчёт №1 (id=1) — особый режим «расход за предыдущие сутки».
    // Данные приходят уже сформированными из Тэкон-19 (расход за сутки в т и Гкал).
    // Поэтому:
    //   • prev всегда 0 (нет накопительных показаний);
    //   • datePrev = dateCurr (нет «предыдущей даты»);
    //   • temp игнорируется (Тэкон-19 не отдаёт температуру);
    //   • gcal — необязательное поле (если Тэкон-19 отдаёт расход в Гкал,
    //     пользователь заполняет; если нет — поле остаётся пустым).
    // consumption в архиве = curr - 0 = curr — то есть равно введённому значению,
    // что и требуется для графика по введённым данным, а не по вычисленному расходу.
    if (id === 1) {
      payload.prev = 0;
      payload.datePrev = payload.dateCurr || '';
      payload.temp = null;
      // gcal — необязательное поле (Task 206: убрано требование обязательности).
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

    // Task 199: Валидация показаний перед записью. Считываем meter из строки
    // (нужен для allowNegative из Q=17), берём правила из flowmeter_validation_rules
    // и последнюю запись архива для проверки DUPLICATE.
    // Hard-block (SIGN_NEG, DATE_INCONSISTENT) — возвращаем ошибку, не пишем.
    // Soft-confirm правила — записываем показания, но в archive.Q пишем строку
    // с кодами и детализацией (пример: «JUMP_HIGH: расход 50.50 > max×3=15.00; ...»).
    var meterForValidation = {
      id: id,
      hoz: String(sheet.getRange(rowNum, 2).getValue() || ''),
      param: String(sheet.getRange(rowNum, 3).getValue() || ''),
      unit: String(sheet.getRange(rowNum, 8).getValue() || ''),
      period: String(sheet.getRange(rowNum, 11).getValue() || ''),
      modRole: String(sheet.getRange(rowNum, 12).getValue() || ''),
      modName: String(sheet.getRange(rowNum, 13).getValue() || ''),
      allowNegative: String(sheet.getRange(rowNum, 17).getValue() || '').toLowerCase().trim()  // Q=17
    };
    var rulesForMeter = null;
    var lastArchiveRecord = null;
    try {
      rulesForMeter = ValidationRules.getRulesForMeter(id);
    } catch (e) {
      Logger.log('ValidationRules.getRulesForMeter failed: ' + e.message);
    }
    try {
      var archSheet = SpreadsheetApp.openById(this.SPREADSHEET_ID)
                       .getSheetByName('hozraschet_archive');
      if (archSheet) {
        var archLast = archSheet.getLastRow();
        if (archLast >= 2) {
          // Читаем все строки, ищем последнюю для этого meterId (колонка A=1)
          var archRange = archSheet.getRange(2, 1, archLast - 1, 16);
          var archVals = archRange.getValues();
          for (var av = archVals.length - 1; av >= 0; av--) {
            if (parseInt(archVals[av][0], 10) === id) {
              lastArchiveRecord = {
                meterId: parseInt(archVals[av][0], 10),
                prev: parseFloat(archVals[av][2]) || 0,
                curr: parseFloat(archVals[av][3]) || 0,
                modName: String(archVals[av][13] || ''),
                timestamp: (archVals[av][14] instanceof Date)
                            ? archVals[av][14].toISOString() : String(archVals[av][14] || '')
              };
              break;
            }
          }
        }
      }
    } catch (e) {
      Logger.log('Reading last archive record failed (non-critical): ' + e.message);
    }

    // Task 200: последние записи ВСЕХ счётчиков за 7 дней для WRONG_METER
    var recentAllMeters = null;
    try {
      recentAllMeters = FlowmeterArchive.getRecentAllMeters(
        ValidationRules.WRONG_METER_PARAMS.LOOKBACK_DAYS
      );
    } catch (e) {
      Logger.log('getRecentAllMeters failed (non-critical): ' + e.message);
    }

    var validationResult = ValidationRules.compute(
      meterForValidation, payload, rulesForMeter, lastArchiveRecord, recentAllMeters
    );
    if (validationResult.hardBlock) {
      // Hard-block: возвращаем ошибку, ничего не пишем в таблицу
      try {
        Utils.audit(user.email, 'FLOWMETER_VALIDATION_BLOCK', '', '',
          'Расходомер id=' + id + ': ' + validationResult.hardBlock.code +
          ' — ' + validationResult.hardBlock.message);
      } catch (e) { /* audit — не критично */ }
      return { ok: false, error: validationResult.hardBlock.code.toLowerCase(),
               message: validationResult.hardBlock.message };
    }
    var anomalyDetail = validationResult.detail || '';

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
    // Task 237: при новом вводе показаний meters.O ВСЕГДА очищается
    // (независимо от смены автора) — комментарий к только что введённым
    // показаниям пока не введён, ждём вызова setComment от автора. Прежний
    // комментарий остаётся в archive.P своей строки (он был записан туда
    // одновременно с meters.O в setComment — см. Task 237). Для случая
    // миграции старых комментариев (setComment был вызван ДО развёртывания
    // этого патча и не записал в archive.P) — дублируем старый meters.O
    // в archive.P самой свежей записи ПЕРЕД сбросом O. Idempotent: если
    // setComment уже записал то же значение, перезапись не меняет данных.
    // Task 359: при ПРАВКЕ (isEdit) этот блок миграции пропускается —
    // комментарий в meters.O принадлежит ТОЙ ЖЕ логической записи
    // (введена < 1 ч назад тем же пользователем), сбрасывать его
    // нельзя. Миграция «старый комментарий → архив прежней записи»
    // нужна только НОВОМУ вводу (запись = новая, комментарий ждёт
    // нового setComment). Значение oldCommentForArchive при isEdit
    // передаётся в updateLatestReading → archive.P правимой строки
    // (нормально уже там; восстанавливается, если запись архива при
    // вводе потеряла P).
    var oldCommentForArchive = String(sheet.getRange(rowNum, 15).getValue() || '').trim();  // O=15

    sheet.getRange(rowNum, 12).setValue(user.role || '');
    sheet.getRange(rowNum, 13).setValue(user.email || '');

    if (!payload.isEdit && oldCommentForArchive !== '') {
      // Task 237: миграция — продублировать старый meters.O в archive.P
      // самой свежей записи этого счётчика (если ещё не там). Для новых
      // комментариев (setComment уже записал) — no-op (то же значение).
      // Task 359: только для НОВОГО ввода (при isEdit комментарий —
      // атрибут текущей записи, см. комментарий выше).
      try {
        FlowmeterArchive.updateLatestComment(id, oldCommentForArchive);
      } catch (e) {
        Logger.log('updateLatestComment (migration) failed (non-critical): ' + e.message);
      }
      // Очистить активный комментарий O — ждёт нового комментария для
      // только что введённых показаний (его внесёт setComment автора).
      try {
        sheet.getRange(rowNum, 15).setValue('');  // O=15 — сброс
      } catch (e) { /* не критично */ }
    }

    // Task 108: Записываем timestamp текущего ввода в N=14 (modTimestamp)
    sheet.getRange(rowNum, 14).setValue(new Date());

    // Аудит (по паттерну CableJournal → Utils.audit)
    // Task 359: пометка «(правка)» — в аудите видно, что запись
    // изменила существующие показания, а не создала новые
    try {
      Utils.audit(user.email, 'FLOWMETER_UPDATE_READING', '', '',
        'Расходомер id=' + id + ': показания ' + payload.prev + ' → ' + payload.curr +
        (payload.isEdit ? ' (правка в окне 1 ч)' : ''));
    } catch (e) { /* audit log — не критично */ }

    // Архив: Task 359 — при ПРАВКЕ (isEdit, окно 1 ч) обновляем
    // последнюю суточную запись ЭТОГО расходомера НА МЕСТЕ
    // (FlowmeterArchive.updateLatestReading): правка = та же логическая
    // запись, новая строка истории НЕ создаётся (раньше создавалась —
    // «Хронология показаний» обрастала дублями за одну дату).
    // Новому вводу — как прежде, appendToArchive (новая строка).
    // Fallback правки: свежей суточной записи в архиве нет (запись
    // при исходном вводе не удалась — archive write non-critical) —
    // создаём строку appendToArchive'ом, комментарий записи (если
    // был в meters.O) переносится в P новой строки.
    // Ошибка архива не блокирует основной ответ (тихо логируется).
    try {
      var hozName = String(sheet.getRange(rowNum, 2).getValue() || '');
      var unitVal = String(sheet.getRange(rowNum, 8).getValue() || '');
      var periodVal = String(sheet.getRange(rowNum, 11).getValue() || '');
      var archived = false;
      if (payload.isEdit) {
        try {
          archived = FlowmeterArchive.updateLatestReading(
            id,
            prevVal, currVal,
            payload.datePrev, payload.dateCurr,
            payload.temp, payload.gcal, unitVal, periodVal,
            user.role || '', user.name || user.email || '',  // Task 109: имя (если есть) или email
            oldCommentForArchive,  // Task 359: комментарий текущей записи — не теряется
            anomalyDetail
          );
        } catch (editUpdErr) {
          Logger.log('Archive edit-in-place failed (non-critical): ' + editUpdErr.message);
        }
      }
      if (!archived) {
        // Task 237: новая запись — с пустым comment (ожидание setComment).
        // Task 359: ИСКЛЮЧЕНИЕ — фолбэк правки: строка создаётся взамен
        // несостоявшейся записи исходного ввода, комментарий meters.O
        // принадлежит ей и переносится в P.
        FlowmeterArchive.appendToArchive(
          id, hozName,
          prevVal, currVal,
          payload.datePrev, payload.dateCurr,
          payload.temp, payload.gcal, unitVal, periodVal,
          user.role || '', user.name || user.email || '',  // Task 109: имя (если есть) или email
          payload.isEdit ? oldCommentForArchive : '',  // Task 237/359
          anomalyDetail,  // Task 199: строка с кодами аномалий для archive.Q
          'сутки'  // Task 286: тип записи (R=18); legacy-строки без R = 'сутки'
        );
      }
    } catch (archiveErr) {
      Logger.log('Archive write failed (non-critical): ' + archiveErr.message);
    }

    return { ok: true, data: { id: id } };
  },

  // ============================================================
  // Task 286: _writePeriodEntry — «расход за неделю/месяц» (только архив)
  // ============================================================
  // Вызывается из updateReading при entryType='неделя'|'месяц'
  // (клиент отправляет только для Хозрасчёта №1 — расход пара по Тэкон-19).
  //
  // Отличия от суточного ввода:
  //   • meters-строка НЕ обновляется — «Последние показания» в карточке
  //     остаются последними СУТОЧНЫМИ; modRole/modName/modTimestamp (L–N)
  //     и активный комментарий (O) не затрагиваются;
  //   • запись идёт ТОЛЬКО в hozraschet_archive: A= meterId, C= prev (0),
  //     D= curr (расход за период), E= consumption (= curr),
  //     F= datePrev (начало периода), G= dateCurr (конец периода),
  //     H= daysBetween, K= Gcal (опционально), R= entryType;
  //   • soft-валидация (ValidationRules.compute) ПРОПУСКАЕТСЯ — правила
  //     (max_cons, min_cons и т.д.) откалиброваны на суточные значения,
  //     недельный/месячный агрегат дал бы ложные JUMP_HIGH/PERIOD_MISMATCH;
  //   • остаются hard-проверки (как SIGN_NEG / DATE_INCONSISTENT у суток):
  //     отрицательное значение; дата конца раньше даты начала;
  //   • isEdit не поддерживается — игнорируется (передаётся как новый ввод);
  //   • ошибка записи в архив здесь КРИТИЧНА (архив — единственное
  //     хранилище записи) → возвращаем ok:false, а не глотаем.
  // ============================================================
  _writePeriodEntry: function(payload, user, id, entryType) {
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

    // --- Hard-проверки (зеркало SIGN_NEG / DATE_INCONSISTENT) ---
    var currVal = parseFloat(payload.curr);
    if (isNaN(currVal)) {
      return { ok: false, error: 'Некорректное значение расхода' };
    }
    if (currVal < 0) {
      return { ok: false, error: 'sign_neg',
               message: 'Отрицательное значение расхода: ' + currVal +
                        '. Проверьте, не введён ли знак «минус» случайно.' };
    }

    var datePrevObj = this._clientToDateObj(payload.datePrev);
    var dateCurrObj = this._clientToDateObj(payload.dateCurr);
    if (datePrevObj && dateCurrObj && dateCurrObj < datePrevObj) {
      return { ok: false, error: 'date_inconsistent',
               message: 'Дата конца периода раньше даты начала: ' +
                        payload.datePrev + ' → ' + payload.dateCurr +
                        '. Проверьте даты периода.' };
    }

    // Гкал — необязательное поле (как у суточного ввода №1, Task 206)
    var gcalVal = null;
    if (payload.gcal !== null && payload.gcal !== undefined && payload.gcal !== '') {
      gcalVal = parseFloat(payload.gcal);
      if (isNaN(gcalVal)) gcalVal = null;
    }

    // Данные позиции из meters-строки (только чтение — не запись)
    var hozName = String(sheet.getRange(rowNum, 2).getValue() || '');
    var unitVal = String(sheet.getRange(rowNum, 8).getValue() || '');
    var periodVal = String(sheet.getRange(rowNum, 11).getValue() || '');

    // Аудит (по паттерну суточного ввода); падеж — винительный
    // («за неделю»/«за месяц», не «за неделя»)
    var entryTypeAcc = (entryType === 'неделя') ? 'неделю' : entryType;
    try {
      Utils.audit(user.email, 'FLOWMETER_UPDATE_READING', '', '',
        'Расходомер id=' + id + ': расход за ' + entryTypeAcc + ' = ' + currVal +
        ' ' + unitVal + ' (' + payload.datePrev + ' — ' + payload.dateCurr + ')');
    } catch (e) { /* audit log — не критично */ }

    // Единственная запись — в архив (ошибка = неуспех, не глотаем)
    try {
      FlowmeterArchive.appendToArchive(
        id, hozName,
        0, currVal,   // prev=0 → consumption (E) = введённый расход за период
        payload.datePrev, payload.dateCurr,
        null,         // temp — нет для №1 (Тэкон-19 не отдаёт температуру)
        gcalVal, unitVal, periodVal,
        user.role || '', user.name || user.email || '',
        '',           // comment — пусто (setComment работает с суточными)
        '',           // anomaly — soft-валидация пропущена
        entryType     // Task 286: R=18 — 'неделя' | 'месяц'
      );
    } catch (archiveErr) {
      Logger.log('Archive write failed (period entry): ' + archiveErr.message);
      return { ok: false, error: 'Ошибка записи в архив: ' + archiveErr.message };
    }

    return { ok: true, data: { id: id, entryType: entryType } };
  },

  // ============================================================
  // flowmeter.setComment — Task 195: комментарий к последним показаниям
  // ============================================================
  // payload: { token, id, comment }
  //   comment — строка до 500 символов; пустая строка = удалить комментарий.
  // Возвращает: { ok: true, data: { id: N, comment: '...' } }
  //
  // Права: пользователь с правом ввода показаний (INPUT_ROLES), который
  // внёс ПОСЛЕДНИЕ показания (modName в M совпадает с его email).
  // АДМИН (role === 'Админ') может комментировать любые показания —
  // проверка авторства для него пропускается (Task 195 update).
  // Ограничения по времени НЕТ — пока показания за этим пользователем
  // (у админа — безусловно).
  // Комментарий виден всем читателям раздела (list возвращает поле comment).
  //
  // Task 237: комментарий пишется ОДНОВРЕМЕННО в две таблицы:
  //   • hozraschet_meters.O (активный комментарий к текущим показаниям)
  //   • hozraschet_archive.P (в строку с самой свежей архивной записью
  //     этого счётчика — через FlowmeterArchive.updateLatestComment)
  // После ввода новых показаний meters.O очищается (см. updateReading),
  // а предыдущий комментарий остаётся в archive.P своей строки (архив).
  // ============================================================
  setComment: function(payload) {
    var auth = this._requireEdit(payload.token);
    if (auth.error) return auth.error;
    var user = auth.user;

    var id = parseInt(payload.id, 10);
    if (!id || id < 1) {
      return { ok: false, error: 'Некорректный id позиции' };
    }

    var comment = String(payload.comment === undefined || payload.comment === null
      ? '' : payload.comment).trim();
    if (comment.length > 500) {
      return { ok: false, error: 'Комментарий длиннее 500 символов' };
    }

    var sheet = this._getSheet();
    if (!sheet) {
      return { ok: false, error: 'Лист не найден' };
    }

    var rowNum = id + 1;
    var lastRow = sheet.getLastRow();
    if (rowNum > lastRow) {
      return { ok: false, error: 'Позиция id=' + id + ' не найдена' };
    }

    // Валидация авторства: комментарий может добавить/изменить только тот,
    // кто вводил ПОСЛЕДНИЕ показания (столбец M — email).
    // АДМИН обходит эту проверку (Task 195 update).
    var isAdmin = (String(user.role || '').toLowerCase() === 'админ');
    if (!isAdmin) {
      var existingModName = String(sheet.getRange(rowNum, 13).getValue() || '').toLowerCase().trim();  // M=13
      var currentUser = String(user.email || '').toLowerCase().trim();
      if (!existingModName || existingModName !== currentUser) {
        return { ok: false, error: 'not_your_input',
                 message: 'Комментарий доступен только тому, кто вводил последние показания' };
      }
    }

    // Task 237: пишем комментарий одновременно в две таблицы:
    //   1) hozraschet_meters.O — активный комментарий (текущие показания)
    //   2) hozraschet_archive.P — в строку с самой свежей архивной записью
    //      этого счётчика. Так после следующего ввода показаний (когда
    //      meters.O будет очищен) комментарий останется в архиве.
    sheet.getRange(rowNum, 15).setValue(comment);  // O=15 — meters.O

    // archive.P — самая свежая запись для этого meterId.
    // Ошибки updateLatestComment НЕ блокируют ответ (арxiv — best-effort).
    try {
      FlowmeterArchive.updateLatestComment(id, comment);
    } catch (e) {
      Logger.log('FlowmeterArchive.updateLatestComment failed (non-critical): ' + e.message);
    }

    // Аудит
    try {
      var actionLabel = comment ? 'FLOWMETER_SET_COMMENT' : 'FLOWMETER_DELETE_COMMENT';
      var shortText = comment.length > 60 ? comment.substring(0, 60) + '…' : comment;
      var who = isAdmin ? ' (админ)' : '';
      Utils.audit(user.email, actionLabel, '', '',
        'Расходомер id=' + id + who + ': ' + (comment ? '«' + shortText + '»' : 'комментарий удалён'));
    } catch (e) { /* audit log — не критично */ }

    return { ok: true, data: { id: id, comment: comment } };
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

// ============================================================
// flowmeterCleanupCommentMetadata — Одноразовая миграция (Task 212)
// ============================================================
// Запускается один раз вручную из редактора Apps Script:
//   1. Выбрать функцию flowmeterCleanupCommentMetadata
//   2. Нажать ▶ Run
//   3. Проверить лог — сколько строк исправлено
//   4. После миграции функцию можно удалить из проекта
//
// Что делает:
//   • Проходит по столбцу P (16) листа hozraschet_meters и листа
//     hozraschet_archive.
//   • В каждой ячейке ищет шаблон «[ISO-timestamp | email]: текст»
//     (формат preview, который писался в meters.P до Task 211).
//   • Если совпало — заменяет значение на чистый «текст» без метаданных.
//   • Если не совпало — оставляет как есть (plain text уже).
//
// Цель: привести исторические данные к единому plain-text формату,
// который используется после Task 211. После миграции НОВЫЕ записи
// тоже будут plain text (см. Flowmeter.updateReading → appendToArchive
// и отсутствие записи в meters.P).
// ============================================================
function flowmeterCleanupCommentMetadata() {
  var SPREADSHEET_ID = '1enZSq7K8pwJVzaAI_tbXZtvATqARTxH0lSU4c-wc1eY';
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Шаблон: [2026-08-27T22:51:15.659Z | email@host]: текст
  //Capture group 1 = текст после «]: »
  var pattern = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z \| [^\]]+\]:\s*(.*)$/;
  var COL = 16; // P=16

  var result = { metersProcessed: 0, metersFixed: 0,
                 archiveProcessed: 0, archiveFixed: 0 };

  // 1) hozraschet_meters — столбец P, строки 2+ (до 12 позиций, но берём все)
  try {
    var metersSheet = ss.getSheetByName('hozraschet_meters');
    if (metersSheet) {
      var metersLastRow = metersSheet.getLastRow();
      if (metersLastRow >= 2) {
        var metersRange = metersSheet.getRange(2, COL, metersLastRow - 1, 1);
        var metersVals = metersRange.getValues();
        var metersChanged = false;
        for (var i = 0; i < metersVals.length; i++) {
          result.metersProcessed++;
          var v = String(metersVals[i][0] || '');
          var m = v.match(pattern);
          if (m) {
            metersVals[i][0] = m[1]; // только текст
            result.metersFixed++;
            metersChanged = true;
          }
        }
        if (metersChanged) {
          metersRange.setValues(metersVals);
        }
      }
    }
  } catch (e) {
    Logger.log('Cleanup meters failed: ' + e.message);
  }

  // 2) hozraschet_archive — столбец P, строки 2+
  try {
    var archiveSheet = ss.getSheetByName('hozraschet_archive');
    if (archiveSheet) {
      var archiveLastRow = archiveSheet.getLastRow();
      if (archiveLastRow >= 2) {
        var archiveRange = archiveSheet.getRange(2, COL, archiveLastRow - 1, 1);
        var archiveVals = archiveRange.getValues();
        var archiveChanged = false;
        for (var j = 0; j < archiveVals.length; j++) {
          result.archiveProcessed++;
          var av = String(archiveVals[j][0] || '');
          var am = av.match(pattern);
          if (am) {
            archiveVals[j][0] = am[1];
            result.archiveFixed++;
            archiveChanged = true;
          }
        }
        if (archiveChanged) {
          archiveRange.setValues(archiveVals);
        }
      }
    }
  } catch (e) {
    Logger.log('Cleanup archive failed: ' + e.message);
  }

  var msg = 'Cleanup done. meters: ' + result.metersFixed + '/' + result.metersProcessed +
            ' fixed, archive: ' + result.archiveFixed + '/' + result.archiveProcessed + ' fixed.';
  Logger.log(msg);
  return msg;
}
