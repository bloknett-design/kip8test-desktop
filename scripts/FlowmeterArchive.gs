// ============================================================
// FlowmeterArchive.gs — Архив показаний хозрасчётных расходомеров
// ============================================================
// Лист «hozraschet_archive» в той же Google Таблице.
// Каждый ввод показаний добавляет строку в архив — полный аудит.
//
// ИСПОЛЬЗОВАНИЕ:
//   1. Скопировать этот файл в проект Apps Script
//   2. Один раз запустить flowmeterInitArchive() для создания листа
//   3. После инициализации функцию flowmeterInitArchive можно удалить
//
// Эндпоинты (через Code.gs):
//   flowmeter.archive — прочитать архив для заданного meterId
//
// Структура листа «hozraschet_archive» (строка 1 — заголовки):
//   A: meterId       — номер позиции (1–12)
//   B: hoz           — название (Хозрасчёт №1)
//   C: prev          — предыдущие показания
//   D: curr          — текущие (новые) показания
//   E: consumption   — расход = curr − prev
//   F: datePrev      — дата предыдущих показаний (Date object)
//   G: dateCurr      — дата текущих показаний (Date object)
//   H: daysBetween   — кол-во дней между датами (для записей «за
//                      период» недели/месяца — ВКЛЮЧИТЕЛЬНО: 01.08–31.08
//                      = 31 полный день; Task 289)
//   I: temp          — температура среды (число или пусто)
//   J: unit          — единица измерения (т, м³)
//   K: Gcal          — гигакалории пара (число или пусто; Task 100)
//   L: period        — периодичность
//   M: modRole       — роль пользователя, внёсшего показания
//   N: modName       — имя пользователя, внёсшего показания
//   O: timestamp     — метка времени записи (Date object)
//   P: comment       — комментарий к этим показаниям (Task 197).
//                      Копируется из hozraschet_meters.O в момент смены автора
//                      показаний (см. Flowmeter.updateReading). Для того же
//                      автора (перезапись) — пусто, т.к. активный комментарий
//                      остаётся в O и не «архивный».
//   Q: anomaly        — строка с кодами аномалий валидации (Task 199, Фаза 1).
//                      Формат: «CODE1: detail; CODE2: detail; ...» (пусто = аномалий
//                      нет). Заполняется в appendToArchive из результата
//                      ValidationRules.compute, вызванного в updateReading.
//                      Коды: SIGN_NEG / DATE_INCONSISTENT (hard-block, в archive не
//                      попадают, т.к. показания не сохраняются) + JUMP_NEGATIVE /
//                      JUMP_HIGH / JUMP_LOW / PERIOD_MISMATCH / TEMP_OUT_OF_RANGE /
//                      GCAL_RATIO / DUPLICATE (soft-confirm, попадают в archive
//                      с пометкой).
//   R: entryType      — тип записи (Task 286): 'сутки' (обычный ввод и все
//                      legacy-записи до Task 286 — пусто в R = сутки) /
//                      'неделя' / 'месяц' («расход за период» — агрегат от
//                      Тэкон-19 по Хозрасчёту №1; meters-строка при этом не
//                      меняется, curr = расход за период, datePrev/dateCurr =
//                      границы периода). Заголовок R самовосстанавливается в
//                      appendToArchive при первой записи с типом (см. ниже).
// ============================================================

var FlowmeterArchive = {

  SPREADSHEET_ID: '1enZSq7K8pwJVzaAI_tbXZtvATqARTxH0lSU4c-wc1eY',
  ARCHIVE_SHEET_NAME: 'hozraschet_archive',
  DATA_START_ROW: 2,

  // Роли с правом чтения архива (те же что READ_ROLES в Flowmeter.gs)
  READ_ROLES: ['КИП ИОС дежурный', 'ИТР8', 'ИТР8 pro', 'ИТР ИОС',
               'КИП ИОС pro', 'Админ'],

  // ============================================================
  // Получить лист архива
  // ============================================================
  _getSheet: function() {
    var ss = SpreadsheetApp.openById(this.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(this.ARCHIVE_SHEET_NAME);
    return sheet;  // может быть null, если лист не создан
  },

  // ============================================================
  // Авторизация: чтение архива
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
  // appendToArchive — добавить запись в архив
  // Вызывается из Flowmeter.updateReading() после записи новых показаний
  // ============================================================
  // Параметры:
  //   meterId   — номер позиции (1–12)
  //   hoz       — название
  //   prev      — предыдущие показания (число)
  //   curr      — новые показания (число)
  //   datePrev  — дата предыдущих показаний (M/D/YYYY строка)
  //   dateCurr  — дата текущих показаний (M/D/YYYY строка)
  //   temp      — температура (число или null)
  //   gcal      — гигакалории пара (число или null; Task 100, только для расходомеров пара)
  //   unit      — единица (т, м³)
  //   period    — периодичность
  //   role      — роль пользователя
  //   name      — имя пользователя
  //   comment   — Task 197: комментарий к этим показаниям (строка или пусто).
  //              Передаётся из Flowmeter.updateReading как старый комментарий
  //              из meters.O в момент смены автора показаний. Для того же
  //              автора (перезапись) — пусто.
  //   anomaly   — Task 199: строка с кодами аномалий валидации (soft-confirm),
  //              формат «CODE1: detail; CODE2: detail; ...». Пусто = аномалий
  //              нет. Hard-block-коды (SIGN_NEG, DATE_INCONSISTENT) сюда не
  //              попадают, т.к. показания не сохраняются (caller возвращает
  //              ошибку до вызова appendToArchive).
  //   entryType — Task 286: тип записи — 'сутки' (обычный ввод; legacy-строки
  //              без R = сутки) / 'неделя' / 'месяц' («расход за период» —
  //              только архив, meters-строка не меняется). Пишется в R=18.
  //              Необязательный параметр (undefined = пусто в R, трактуется
  //              как 'сутки' при чтении в listArchive).
  // ============================================================
  appendToArchive: function(meterId, hoz, prev, curr, datePrev, dateCurr, temp, gcal, unit, period, role, name, comment, anomaly, entryType) {
    var sheet = this._getSheet();
    if (!sheet) {
      // Лист архива не создан — тихо пропускаем (не блокируем основной flow)
      Logger.log('Archive sheet not found — skipping archive write');
      return;
    }

    // Task 286: самовосстановление заголовка R1 ('entryType') — на случай,
    // если лист архива был создан до Task 286 и колонки R нет в шапке.
    // Идемпотентно: после первой записи заголовок уже стоит, перезаписи нет.
    try {
      if (String(sheet.getRange(1, 18).getValue() || '') === '') {
        sheet.getRange(1, 18).setValue('entryType');
      }
    } catch (e) { /* не критично — заголовок косметика */ }

    var consumption = (curr || 0) - (prev || 0);

    // Вычисляем кол-во дней между датами
    var daysBetween = 0;
    var datePrevObj = Flowmeter._clientToDateObj(datePrev);
    var dateCurrObj = Flowmeter._clientToDateObj(dateCurr);
    if (datePrevObj && dateCurrObj) {
      daysBetween = Math.round((dateCurrObj - datePrevObj) / 86400000);
      if (daysBetween < 0) daysBetween = 0;
      // Task 289: записи «за период» (неделя/месяц) — дни считаются
      // ВКЛЮЧИТЕЛЬНО: период 01.08–31.08 = 31 полный день (не 30),
      // неделя пн–вс = 7 дней. Суточные записи — прежняя семантика
      // (разница дат), чтобы не задеть валидацию PERIOD_MISMATCH
      // (ValidationRules считает daysBetween по датам самостоятельно).
      var etNorm = String(entryType || '').trim().toLowerCase();
      if (etNorm === 'неделя' || etNorm === 'месяц') {
        daysBetween = daysBetween + 1;
      }
    }

    // Добавляем строку в конец листа.
    // Структура (18 столбцов A–R, Task 100 добавил K=Gcal, Task 197 — P=comment,
    // Task 199 — Q=anomaly, Task 286 — R=entryType):
    //   A meterId, B hoz, C prev, D curr, E consumption,
    //   F datePrev, G dateCurr, H daysBetween, I unit, J temp,
    //   K Gcal (Task 100), L period, M modRole, N modName, O timestamp,
    //   P comment (Task 197), Q anomaly (Task 199), R entryType (Task 286)
    sheet.appendRow([
      meterId,                                                                    // A: meterId
      hoz || '',                                                                  // B: hoz
      prev || 0,                                                                  // C: prev
      curr || 0,                                                                  // D: curr
      consumption,                                                                // E: consumption
      datePrevObj || '',                                                          // F: datePrev (Date object)
      dateCurrObj || '',                                                          // G: dateCurr (Date object)
      daysBetween,                                                                // H: daysBetween
      unit || '',                                                                 // I: unit (раньше было в J, но в архиве порядок другой — см. заголовки)
      (temp !== null && temp !== undefined && temp !== '') ? parseFloat(temp) : '',  // J: temp
      (gcal !== null && gcal !== undefined && gcal !== '') ? parseFloat(gcal) : '',  // K: Gcal (Task 100)
      period || '',                                                               // L: period
      role || '',                                                                 // M: modRole
      name || '',                                                                 // N: modName
      new Date(),                                                                  // O: timestamp
      String(comment || ''),                                                       // P: comment (Task 197)
      String(anomaly || ''),                                                       // Q: anomaly (Task 199)
      String(entryType || '')                                                      // R: entryType (Task 286)
    ]);

    Logger.log('Archive: meterId=' + meterId + ', prev=' + prev + ', curr=' + curr + ', consumption=' + consumption + ', gcal=' + (gcal || '—') +
               (entryType ? (', entryType=' + entryType) : ''));
  },

  // ============================================================
  // updateLatestReading — Task 359: правка суточных показаний в окне
  // 1 часа — ОБНОВИТЬ последнюю суточную запись этого расходомера
  // НА МЕСТЕ, не создавая новую строку архива.
  // ============================================================
  // Заявка: «после записи показаний на сервер пользователь в течение
  // часа правит значение — создаётся НОВАЯ запись вместо изменения
  // уже введённой». Правка = та же логическая запись (история не
  // должна обрастать дублями), новый ввод = новая строка.
  //
  // Вызывается из Flowmeter.updateReading при payload.isEdit=true
  // (сервер уже проверил: тот же пользователь, с ввода прошло <1 ч —
  // по meters-строке M/N). Здесь дополнительно сверяемся с самой
  // архивной строкой:
  //   • ищем с конца ПЕРВУЮ запись meterId с entryType 'сутки'
  //     (пусто/legacy = сутки; записи «за неделю/месяц» — другие
  //     логические записи, их пропускаем);
  //   • найденная строка должна быть СВЕЖЕЙ (timestamp O < 1 ч от
  //     сейчас) — окно зеркалит meters-проверку updateReading. Если
  //     строка старая (или её нет) — исходный ввод не доархивировался
  //     (archive write при вводе был non-critical и мог не удаться):
  //     возвращаем false, вызывающий сделает fallback-вызов appendToArchive.
  //
  // Обновляемые колонки (те же, что пишет appendToArchive):
  //   C prev, D curr, E consumption, F datePrev, G dateCurr,
  //   H daysBetween, I unit, J temp, K Gcal, L period, M modRole,
  //   N modName, O timestamp (время правки), Q anomaly.
  // НЕ трогаем: A meterId, B hoz (идентичность записи), R entryType.
  // P comment — сохраняем: перезаписываем ТОЛЬКО если передан
  // непустой комментарий (Task 237: активный комментарий ввода живёт
  // в meters.O и принадлежит этой же записи; правка его не стирает).
  //
  // @return {boolean} true — строка найдена и обновлена; false —
  //   свежей суточной записи нет (вызывающий делает appendToArchive).
  // Не требует авторизации — вызывается только сервером из
  // Flowmeter.updateReading.
  // ============================================================
  updateLatestReading: function(meterId, prev, curr, datePrev, dateCurr, temp, gcal, unit, period, role, name, comment, anomaly) {
    var sheet = this._getSheet();
    if (!sheet) return false;

    var lastRow = sheet.getLastRow();
    if (lastRow < this.DATA_START_ROW) return false;

    // A (meterId) + O (timestamp) + R (entryType): читаем 18 колонок,
    // поиск с конца (appendRow пишет в конец → последняя по позиции
    // с совпавшим meterId и 'сутки' = самая свежая суточная).
    var range = sheet.getRange(this.DATA_START_ROW, 1,
                               lastRow - this.DATA_START_ROW + 1, 18);
    var values = range.getValues();

    for (var i = values.length - 1; i >= 0; i--) {
      var etRaw = String(values[i][17] || '').trim().toLowerCase();
      if (etRaw === 'неделя' || etRaw === 'месяц') continue;   // агрегаты — не та запись
      if (parseInt(values[i][0], 10) !== meterId) continue;

      // Свежесть найденной строки (окно 1 ч, как в updateReading)
      var ts = values[i][14];  // O
      if (!(ts instanceof Date)) return false;   // нет метки — не правим
      var elapsedMin = (new Date() - ts) / 1000 / 60;
      if (elapsedMin > 60) return false;         // чужая старая запись — не трогаем

      // Пересчёт производных полей (как в appendToArchive)
      var rowToUpdate = this.DATA_START_ROW + i;
      var consumption = (curr || 0) - (prev || 0);
      var daysBetween = 0;
      var datePrevObj = Flowmeter._clientToDateObj(datePrev);
      var dateCurrObj = Flowmeter._clientToDateObj(dateCurr);
      if (datePrevObj && dateCurrObj) {
        daysBetween = Math.round((dateCurrObj - datePrevObj) / 86400000);
        if (daysBetween < 0) daysBetween = 0;
      }

      sheet.getRange(rowToUpdate, 3).setValue(prev || 0);                   // C: prev
      sheet.getRange(rowToUpdate, 4).setValue(curr || 0);                   // D: curr
      sheet.getRange(rowToUpdate, 5).setValue(consumption);                 // E: consumption
      sheet.getRange(rowToUpdate, 6).setValue(datePrevObj || '');           // F: datePrev
      sheet.getRange(rowToUpdate, 7).setValue(dateCurrObj || '');           // G: dateCurr
      sheet.getRange(rowToUpdate, 8).setValue(daysBetween);                 // H: daysBetween
      sheet.getRange(rowToUpdate, 9).setValue(unit || '');                  // I: unit
      sheet.getRange(rowToUpdate, 10).setValue(                             // J: temp
        (temp !== null && temp !== undefined && temp !== '') ? parseFloat(temp) : '');
      sheet.getRange(rowToUpdate, 11).setValue(                             // K: Gcal
        (gcal !== null && gcal !== undefined && gcal !== '') ? parseFloat(gcal) : '');
      sheet.getRange(rowToUpdate, 12).setValue(period || '');               // L: period
      sheet.getRange(rowToUpdate, 13).setValue(role || '');                 // M: modRole
      sheet.getRange(rowToUpdate, 14).setValue(name || '');                 // N: modName
      sheet.getRange(rowToUpdate, 15).setValue(new Date());                 // O: время правки
      if (String(comment || '') !== '') {
        sheet.getRange(rowToUpdate, 16).setValue(String(comment));          // P: comment (не стирать)
      }
      sheet.getRange(rowToUpdate, 17).setValue(String(anomaly || ''));      // Q: anomaly

      Logger.log('Archive (правка, Task 359): meterId=' + meterId +
                 ', строка ' + rowToUpdate + ' обновлена на месте' +
                 ', prev=' + prev + ', curr=' + curr + ', consumption=' + consumption);
      return true;
    }
    return false;  // суточных записей для meterId нет
  },

  // ============================================================
  // updateLatestComment — Task 237: обновить P (comment) в самой свежей
  // архивной записи для meterId.
  // ============================================================
  // Вызывается:
  //   1) из Flowmeter.setComment — синхронизация: при записи нового
  //      комментария в meters.O он же пишется в archive.P самой свежей
  //      записи этого счётчика. Так комментарий остаётся в архиве даже
  //      после того, как при следующем вводе показаний meters.O будет
  //      очищен.
  //   2) из Flowmeter.updateReading — миграция старых комментариев:
  //      если в meters.O был комментарий (а archive.P пуст из-за того,
  //      что setComment был вызван ДО развертывания этого патча),
  //      дублируем его в archive.P перед сбросом meters.O. Idempotent:
  //      если setComment уже записал, значение совпадает и перезапись
  //      не меняет данных.
  //
  // @param {number} meterId — id позиции (1–12)
  // @param {string} comment — текст комментария (пустая строка = удалить)
  // @returns {boolean} true если строка найдена и обновлена, false если
  //                     архив пуст или нет записей для этого meterId.
  // Не требует авторизации — вызывается только сервером из
  // Flowmeter.setComment / Flowmeter.updateReading.
  // ============================================================
  updateLatestComment: function(meterId, comment) {
    var sheet = this._getSheet();
    if (!sheet) return false;

    var lastRow = sheet.getLastRow();
    if (lastRow < this.DATA_START_ROW) return false;

    // Читаем только колонку A (meterId) для поиска последней записи.
    // Для эффективности: 1 колонка вместо 17.
    var range = sheet.getRange(this.DATA_START_ROW, 1,
                               lastRow - this.DATA_START_ROW + 1, 1);
    var values = range.getValues();

    // Идём с конца, ищем самую свежую запись для meterId.
    // (appendRow всегда добавляет в конец листа → последняя по позиции
    //  с совпадающим meterId и есть самая свежая.)
    for (var i = values.length - 1; i >= 0; i--) {
      if (parseInt(values[i][0], 10) === meterId) {
        var rowToUpdate = this.DATA_START_ROW + i;
        sheet.getRange(rowToUpdate, 16).setValue(String(comment || ''));  // P=16
        return true;
      }
    }
    return false;  // записей для этого meterId нет
  },

  // ============================================================
  // listArchive — прочитать архив для заданного meterId
  // ============================================================
  // payload: { token, id }
  // Возвращает: { ok: true, data: { records: [...], meterId: N } }
  //
  // Записи возвращаются в обратном порядке (новейшие первыми).
  // Опционально: payload.limit — макс. кол-во записей (по умолчанию 100)
  // ============================================================
  listArchive: function(payload) {
    var auth = this._requireRead(payload.token);
    if (auth.error) return auth.error;

    var meterId = parseInt(payload.id, 10);
    if (!meterId || meterId < 1) {
      return { ok: false, error: 'Некорректный id позиции' };
    }

    var limit = parseInt(payload.limit, 10) || 100;

    var sheet = this._getSheet();
    if (!sheet) {
      // Лист архива не создан — вернуть пустой массив
      return { ok: true, data: { records: [], meterId: meterId } };
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < this.DATA_START_ROW) {
      return { ok: true, data: { records: [], meterId: meterId } };
    }

    // Читаем все данные (столбцы A–R, 18 столбцов; Task 100 добавил K=Gcal,
    // Task 197 добавил P=comment, Task 199 добавил Q=anomaly,
    // Task 286 добавил R=entryType)
    var range = sheet.getRange(this.DATA_START_ROW, 1, lastRow - this.DATA_START_ROW + 1, 18);
    var values = range.getValues();

    var records = [];
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      // Фильтруем по meterId (col A = 0)
      if (parseInt(row[0], 10) !== meterId) continue;

      // Task 286: тип записи (R=18). Пусто у legacy-строк = 'сутки'.
      // Нормализация на сервере — клиент получает готовое значение.
      var entryTypeRaw = String(row[17] || '').trim().toLowerCase();
      var entryType = (entryTypeRaw === 'неделя' || entryTypeRaw === 'месяц') ? entryTypeRaw : 'сутки';

      var record = {
        meterId:     parseInt(row[0], 10),
        hoz:         String(row[1] || ''),
        prev:        parseFloat(row[2]) || 0,
        curr:        parseFloat(row[3]) || 0,
        consumption: parseFloat(row[4]) || 0,
        datePrev:    Flowmeter._sheetToClientDate(row[5]),
        dateCurr:    Flowmeter._sheetToClientDate(row[6]),
        daysBetween: parseInt(row[7], 10) || 0,
        unit:        String(row[8] || ''),
        temp:        Flowmeter._parseTemp(row[9]),
        gcal:        Flowmeter._parseGcal(row[10]),   // K=11 — гигакалории пара (Task 100)
        period:      String(row[11] || ''),
        modRole:     String(row[12] || ''),
        modName:     String(row[13] || ''),
        timestamp:   (row[14] instanceof Date)
                       ? row[14].toISOString()
                       : String(row[14] || ''),
        comment:     String(row[15] || '').trim(),    // P=16 — Task 197
        anomaly:     String(row[16] || '').trim(),   // Q=17 — Task 199
        entryType:   entryType                       // R=18 — Task 286
      };
      records.push(record);
    }

    // Сортируем: новейшие первыми (по timestamp или позиции в массиве)
    records.reverse();

    // Ограничиваем кол-во записей
    if (records.length > limit) {
      records = records.slice(0, limit);
    }

    // Task 222: добавляем карту описаний кодов аномалий (для рендера в
    // столбце «⚠ Замечания» хронологии показаний). Фронтенд берёт из
    // этой карты дружелюбное описание вместо технического detail.
    var anomalyHelp = {};
    try {
      if (typeof ValidationRules !== 'undefined' && ValidationRules.getHelpMap) {
        anomalyHelp = ValidationRules.getHelpMap();
      }
    } catch (e) {
      // Тихо игнорируем — фронтенд использует технический detail
    }

    return { ok: true, data: { records: records, meterId: meterId, anomalyHelp: anomalyHelp } };
  },

  // ============================================================
  // getRecentAllMeters — последние записи архива для всех счётчиков
  // за последние daysBack дней (Task 200, для WRONG_METER валидации)
  // ============================================================
  // @param {number} daysBack — сколько дней назад смотреть (по умолчанию 7)
  // @returns {Array} — массив объектов:
  //   { meterId, hoz, prev, curr, consumption, dateCurr, modName, timestamp }
  // Берёт самую свежую запись для каждого meterId (по dateCurr).
  // Task 286: записи «за неделю/месяц» (R='неделя'/'месяц') ПРОПУСКАЮТСЯ —
  // агрегат за период не должен участвовать в суточных сравнениях
  // WRONG_METER (иначе ложные срабатывания: недельный расход в ~7 раз
  // больше суточного).
  // Не требует авторизации — вызывается сервером из updateReading
  // и из listRules (для клиента, через маршрут flowmeter.getRecentAllMeters).
  // ============================================================
  getRecentAllMeters: function(daysBack) {
    daysBack = daysBack || 7;
    var sheet = this._getSheet();
    if (!sheet) return [];

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    // A..R = 18 колонок (Task 286: R=entryType)
    var range = sheet.getRange(this.DATA_START_ROW, 1, lastRow - this.DATA_START_ROW + 1, 18);
    var data = range.getValues();

    var byMeter = {};
    var cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    // cutoffDate = начало дня (daysBack дней назад)
    cutoffDate.setHours(0, 0, 0, 0);

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var mid = parseInt(row[0], 10); // A=meterId
      if (!mid) continue;

      // Task 286: агрегаты «за неделю/месяц» не участвуют (см. докстринг)
      var etRaw = String(row[17] || '').trim().toLowerCase();
      if (etRaw === 'неделя' || etRaw === 'месяц') continue;

      var dateCurr = row[6]; // G=dateCurr
      if (!(dateCurr instanceof Date)) continue;
      if (dateCurr < cutoffDate) continue;

      var existing = byMeter[mid];
      if (!existing || (dateCurr > existing.dateCurr)) {
        byMeter[mid] = {
          meterId:     mid,
          hoz:         row[1],            // B=hoz
          prev:        row[2],            // C=prev
          curr:        row[3],            // D=curr
          consumption: row[4],            // E=consumption
          dateCurr:    dateCurr,          // G=dateCurr
          modName:     row[13],           // N=modName
          timestamp:   row[14]            // O=timestamp
        };
      }
    }

    var result = [];
    for (var k in byMeter) {
      if (byMeter.hasOwnProperty(k)) result.push(byMeter[k]);
    }
    return result;
  },

  // ============================================================
  // listRecentAllMeters — endpoint-обёртка (с авторизацией)
  // для клиента: flowmeter.getRecentAllMeters (через Code.gs).
  // ============================================================
  // @param payload.token — токен сессии
  // @param payload.daysBack — число дней (по умолчанию 7)
  // @returns { ok: true, data: { records: [...] } }
  // ============================================================
  listRecentAllMeters: function(payload) {
    var auth = this._requireRead(payload && payload.token);
    if (auth.error) return auth.error;
    var days = parseInt(payload.daysBack, 10);
    if (isNaN(days) || days <= 0) days = 7;
    var records = this.getRecentAllMeters(days);
    return { ok: true, data: { records: records } };
  }
};

// ============================================================
// flowmeterInitArchive — Одноразовая инициализация листа архива
// ============================================================
// Запускается один раз вручную из редактора Apps Script:
//   1. Выбрать функцию flowmeterInitArchive
//   2. Нажать ▶ Run
//   3. Проверить лог — «Архив: лист создан»
//
// @param {boolean} force - Если true, пересоздаёт лист даже если он есть.
//                          По умолчанию false (безопасный режим).
// ============================================================
function flowmeterInitArchive(force) {
  var SPREADSHEET_ID = '1enZSq7K8pwJVzaAI_tbXZtvATqARTxH0lSU4c-wc1eY';
  var SHEET_NAME = 'hozraschet_archive';

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    Logger.log('Архив: лист «' + SHEET_NAME + '» создан.');
  } else {
    if (!force) {
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        Logger.log('Архив: лист «' + SHEET_NAME + '» уже содержит ' + (lastRow - 1) +
                   ' записей. Для пересоздания вызовите flowmeterInitArchive(true)');
        return;
      }
    }
    Logger.log('Архив: лист «' + SHEET_NAME + '» уже существует. Очищаем...');
    sheet.clear();
  }

  // Заголовки (строка 1). ВАЖНО: порядок соответствует appendToArchive:
  //   A=1 meterId, B=2 hoz, C=3 prev, D=4 curr, E=5 consumption,
  //   F=6 datePrev, G=7 dateCurr, H=8 daysBetween, I=9 unit, J=10 temp,
  //   K=11 Gcal, L=12 period, M=13 modRole, N=14 modName, O=15 timestamp,
  //   P=16 comment (Task 197), Q=17 anomaly (Task 199), R=18 entryType (Task 286).
  // В предыдущей версии init-функции заголовки I/J и N/O были перепутаны
  // (I='temp' вместо 'unit', N='timestamp' вместо 'modName') — это
  // расходилось с реальной структурой данных в appendToArchive. Теперь
  // заголовки строго соответствуют позициям данных.
  // ВНИМАНИЕ (Task 286): этот init одноразовый и у живых таблиц уже выполнен —
  // заголовок R=entryType при первой записи с типом самовосстанавливается
  // в appendToArchive, повторно запускать flowmeterInitArchive НЕ нужно.
  var headers = [
    'meterId',       // A=1
    'hoz',           // B=2
    'prev',          // C=3
    'curr',          // D=4
    'consumption',   // E=5
    'datePrev',      // F=6
    'dateCurr',      // G=7
    'daysBetween',   // H=8
    'unit',          // I=9  (fix: было 'temp')
    'temp',          // J=10 (fix: было 'unit')
    'Gcal',          // K=11
    'period',        // L=12
    'modRole',       // M=13
    'modName',       // N=14 (fix: было 'timestamp')
    'timestamp',     // O=15 (fix: было пропущено)
    'comment',       // P=16 — Task 197
    'anomaly',       // Q=17 — Task 199
    'entryType'      // R=18 — Task 286
  ];

  // Записываем заголовки
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Форматирование заголовков
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4a86e8');
  headerRange.setFontColor('#ffffff');

  // Формат дат: столбцы F, G (datePrev, dateCurr) и N (timestamp)
  sheet.getRange(2, 6, 1, 2).setNumberFormat('dd.mm.yyyy');
  sheet.getRange(2, 14, 1, 1).setNumberFormat('dd.mm.yyyy HH:mm:ss');

  // Формат чисел: столбцы C, D, E (prev, curr, consumption)
  sheet.getRange(2, 3, 1, 3).setNumberFormat('#,##0.00');

  // Формат температуры: столбец I
  sheet.getRange(2, 9, 1, 1).setNumberFormat('#,##0.0');

  // Заморозить первую строку
  sheet.setFrozenRows(1);

  // Автоподбор ширины
  for (var c = 1; c <= headers.length; c++) {
    sheet.autoResizeColumn(c);
  }

  Logger.log('Архив: инициализация завершена. Лист «' + SHEET_NAME + '» готов.');
  Logger.log('Столбцы: ' + headers.join(', '));
}
