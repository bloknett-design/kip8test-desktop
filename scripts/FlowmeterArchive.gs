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
//   H: daysBetween   — кол-во дней между датами
//   I: temp          — температура среды (число или пусто)
//   J: unit          — единица измерения (т, м³)
//   K: Gcal          — гигакалории пара (число или пусто; Task 100)
//   L: period        — периодичность
//   M: modRole       — роль пользователя, внёсшего показания
//   N: modName       — имя пользователя, внёсшего показания
//   O: timestamp     — метка времени записи (Date object)
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
  // ============================================================
  appendToArchive: function(meterId, hoz, prev, curr, datePrev, dateCurr, temp, gcal, unit, period, role, name) {
    var sheet = this._getSheet();
    if (!sheet) {
      // Лист архива не создан — тихо пропускаем (не блокируем основной flow)
      Logger.log('Archive sheet not found — skipping archive write');
      return;
    }

    var consumption = (curr || 0) - (prev || 0);

    // Вычисляем кол-во дней между датами
    var daysBetween = 0;
    var datePrevObj = Flowmeter._clientToDateObj(datePrev);
    var dateCurrObj = Flowmeter._clientToDateObj(dateCurr);
    if (datePrevObj && dateCurrObj) {
      daysBetween = Math.round((dateCurrObj - datePrevObj) / 86400000);
      if (daysBetween < 0) daysBetween = 0;
    }

    // Добавляем строку в конец листа.
    // Структура (15 столбцов A–O, Task 100 добавил K=Gcal):
    //   A meterId, B hoz, C prev, D curr, E consumption,
    //   F datePrev, G dateCurr, H daysBetween, I unit, J temp,
    //   K Gcal (Task 100), L period, M modRole, N modName, O timestamp
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
      new Date()                                                                  // O: timestamp
    ]);

    Logger.log('Archive: meterId=' + meterId + ', prev=' + prev + ', curr=' + curr + ', consumption=' + consumption + ', gcal=' + (gcal || '—'));
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

    // Читаем все данные ( столбцы A–O, 15 столбцов; Task 100 добавил K=Gcal)
    var range = sheet.getRange(this.DATA_START_ROW, 1, lastRow - this.DATA_START_ROW + 1, 15);
    var values = range.getValues();

    var records = [];
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      // Фильтруем по meterId (col A = 0)
      if (parseInt(row[0], 10) !== meterId) continue;

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
                       : String(row[14] || '')
      };
      records.push(record);
    }

    // Сортируем: новейшие первыми (по timestamp или позиции в массиве)
    records.reverse();

    // Ограничиваем кол-во записей
    if (records.length > limit) {
      records = records.slice(0, limit);
    }

    return { ok: true, data: { records: records, meterId: meterId } };
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

  // Заголовки (строка 1)
  var headers = [
    'meterId',       // A
    'hoz',           // B
    'prev',          // C
    'curr',          // D
    'consumption',   // E
    'datePrev',      // F
    'dateCurr',      // G
    'daysBetween',   // H
    'temp',          // I
    'unit',          // J
    'period',        // K
    'modRole',       // L
    'modName',       // M
    'timestamp'      // N
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
