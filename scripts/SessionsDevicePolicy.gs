/**
 * SessionsDevicePolicy.gs — Task 346: политика сессий «1 моб + 1 десктоп»
 * на одну почту (параллельная работа в двух приложениях).
 * ============================================================
 * ЗАЯВКА (2026-09-08): «у пользователей должна быть возможность с одной
 * почты заходить и параллельно работать в двух приложениях, в мобильном
 * и десктопном. Чтобы при входе, допустим, в мобильное приложение, затем
 * он мог с этой же почтой войти в десктопное приложение и при этом не
 * было запрета с формулировкой, что пользователь уже вошел. Но не больше
 * двух входов с одной почты, и только один вход в мобильное приложение,
 * а другой вход с этой же почты в десктопное приложение».
 *
 * ЧТО ДЕЛАЕТ (вызывается из Auth.verifyOTP при каждом входе):
 *   1. Записывает тип устройства ('mobile' | 'desktop') в колонку
 *      «device» строки новой сессии (клиент шлёт поле device в
 *      payload verifyOTP: мобильный UA → 'mobile', Electron/ПК →
 *      'desktop'; старые клиенты без поля → политика пропускается).
 *   2. ВЫТЕСНЕНИЕ: удаляет все ДРУГИЕ сессии этой почты с ТЕМ ЖЕ типом
 *      устройства. Инвариант: у одной почты ≤1 активная мобильная
 *      сессия И ≤1 активная десктопная = не больше двух входов.
 *      Вход в «другое» приложение (моб после десктопа и наоборот)
 *      ВСЕГДА разрешён — никаких запретов «пользователь уже вошел».
 *      Пользователь на вытесненном устройстве увидит штатное
 *      «Сессия истекла» на ближайшем heartbeat (≤5 мин).
 *
 * ЛИСТ sessions (структура проверена снапшотом 2026-09-08):
 *   r1–r3 — описание; r4 — заголовки; r5+ — данные.
 *   Колонки: A session_token | B user_id | C email | D role |
 *            E created_at  | F last_heartbeat | G device (Task 346,
 *            заголовок добавляется sdpInit()).
 *   Пустые «стилевые» строки ниже данных игнорируются (фильтр по
 *   непустому session_token — как в RoleMatrix.gs, листы имеют
 *   стилевой холст).
 *
 * СЕССИИ БЕЗ device (легаси): НЕ трогаются — их закроет штатный
 * hourlyCleanup (Utils.cleanupExpiredSessions) по last_heartbeat.
 *
 * ПУБЛИЧНЫЕ ФУНКЦИИ:
 *   sdpInit()                              → добавить заголовок device (1 раз)
 *   sdpApplyDevicePolicy(email, device, newToken)
 *     → { applied, evicted, reason? }     → вызов из Auth.verifyOTP
 *
 * УСТАНОВКА — см. DEPLOY-Task346-sessions-device-policy.md.
 * ============================================================
 */

// ==========================================================================
// НАСТРОЙКИ
// ==========================================================================

// Таблица KIP8_Access (та же, что в RoleMatrix.gs: листы users/sessions/
// audit_log/matrix/permissions/roles/otp_codes/config).
var SDP_SPREADSHEET_ID = '1TmmNZLUArWH38F6NX0gMGar8LMNMQomm_FaGZv9osyk';

var SDP_SHEET = 'sessions';
var SDP_HEADER_ROW = 4;      // строка заголовков
var SDP_DATA_ROW = 5;        // первая строка данных

// Поддерживаемые типы устройств (всё остальное = политика пропускается).
var SDP_DEVICES = { 'mobile': true, 'desktop': true };

// ==========================================================================
// ОДНОРАЗОВАЯ ИНИЦИАЛИЗАЦИЯ
// ==========================================================================

/**
 * Добавляет заголовок «device» в r4 листа sessions (колонка G), если его
 * ещё нет. ЗАПУСТИТЬ ОДИН РАЗ в Apps Script Editor (выпадающий список
 * функций → sdpInit → Run). Идемпотентно: повторный запуск безвреден.
 *
 * @return {string} человекочитаемый результат (для лога Executions).
 */
function sdpInit() {
  var ss = SpreadsheetApp.openById(SDP_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SDP_SHEET);
  if (!sheet) {
    throw new Error('Лист «' + SDP_SHEET + '» не найден в KIP8_Access');
  }

  // Найти колонку device по заголовку r4 (динамично, как в RoleMatrix.gs).
  var headerRange = sheet.getRange(SDP_HEADER_ROW, 1, 1,
      Math.max(sheet.getLastColumn(), 7));
  var header = headerRange.getValues()[0];
  for (var c = 0; c < header.length; c++) {
    var h = String(header[c] || '').trim().toLowerCase();
    if (h === 'device') {
      return 'Колонка device уже есть (колонка ' + (c + 1) + ') — инициализация не нужна';
    }
  }

  // Заголовка нет → записать в первую колонку после последнего заголовка
  // (обычно G = 7). На случай стилевого холста берём max(последняя
  // непустая ячейка r4, 6) + 1.
  var lastHeaderCol = 0;
  for (var c2 = 0; c2 < header.length; c2++) {
    if (String(header[c2] || '').trim() !== '') lastHeaderCol = c2 + 1;
  }
  var deviceCol = Math.max(lastHeaderCol, 6) + 1;
  sheet.getRange(SDP_HEADER_ROW, deviceCol, 1, 1).setValue('device');
  return 'Добавлен заголовок device в r4, колонка ' + deviceCol
      + ' (лист sessions). Устаревшие строки останутся без типа — их '
      + 'закроет штатный hourlyCleanup.';
}

// ==========================================================================
// ПОЛИТИКА (вызов из Auth.verifyOTP)
// ==========================================================================

/**
 * Применить политику «1 моб + 1 десктоп» к новой сессии.
 * ВЫЗЫВАТЬ ПОСЛЕ записи строки новой сессии в лист sessions, ПЕРЕД
 * формированием успешного ответа клиенту:
 *
 *   var _t346 = sdpApplyDevicePolicy(email, payload.device, token);
 *   // … и в data ответа: evicted: _t346.evicted
 *
 * FAIL-OPEN: любые ошибки (нет листа, нет колонки, нет доступа) НЕ
 * блокируют вход — пишется console.error, возвращается applied:false.
 *
 * @param {string} email     Email пользователя (как в листе sessions).
 * @param {string} device    'mobile' | 'desktop' (payload клиента).
 * @param {string} newToken  session_token новой сессии.
 * @return {Object} { applied: boolean, evicted: number, reason?: string }
 */
function sdpApplyDevicePolicy(email, device, newToken) {
  var result = { applied: false, evicted: 0 };

  try {
    // --- Нормализация ---
    var dev = String(device || '').trim().toLowerCase();
    var mail = String(email || '').trim().toLowerCase();
    var tok = String(newToken || '').trim();
    if (!mail || !tok) {
      result.reason = 'no_email_or_token';
      return result;
    }
    if (!SDP_DEVICES[dev]) {
      // Старый клиент без поля device (или мусор) — политика не
      // применяется, вход работает как до Task 346.
      result.reason = 'unsupported_device';
      return result;
    }

    var ss = SpreadsheetApp.openById(SDP_SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SDP_SHEET);
    if (!sheet) {
      result.reason = 'no_sheet';
      console.error('[SessionsDevicePolicy] Лист sessions не найден');
      return result;
    }

    // --- Заголовки r4: индексы колонок ---
    var values = sheet.getDataRange().getValues();
    var header = (values[SDP_HEADER_ROW - 1] || []).map(function (h) {
      return String(h || '').trim().toLowerCase();
    });
    var tokenIdx = header.indexOf('session_token');
    var emailIdx = header.indexOf('email');
    var deviceIdx = header.indexOf('device');
    if (tokenIdx === -1 || emailIdx === -1) {
      result.reason = 'unexpected_header';
      console.error('[SessionsDevicePolicy] Заголовки r4 листа sessions '
          + 'не содержат session_token/email: ' + JSON.stringify(header));
      return result;
    }
    if (deviceIdx === -1) {
      result.reason = 'no_device_column';
      console.error('[SessionsDevicePolicy] Колонки device нет — запустите '
          + 'sdpInit() один раз (см. DEPLOY-Task346)');
      return result;
    }

    // --- Пройти по строкам данных (r5+), найти:
    //     newTokenRow (записать device) и rowsToEvict (та же почта +
    //     тот же device, другой токен) ---
    var newTokenRow = 0;
    var rowsToEvict = [];
    for (var r = SDP_DATA_ROW - 1; r < values.length; r++) {
      var row = values[r];
      var rowToken = String(row[tokenIdx] || '').trim();
      if (!rowToken) continue; // пустая/стилевая строка
      var rowEmail = String(row[emailIdx] || '').trim().toLowerCase();
      if (rowToken === tok) {
        newTokenRow = r + 1; // 1-based
        continue;
      }
      if (rowEmail === mail
          && String(row[deviceIdx] || '').trim().toLowerCase() === dev) {
        rowsToEvict.push(r + 1); // 1-based
      }
    }

    if (!newTokenRow) {
      result.reason = 'new_token_not_found';
      console.error('[SessionsDevicePolicy] Новая сессия не найдена в '
          + 'листе sessions — политика пропущена (вход не блокирован)');
      return result;
    }

    // --- 1) Записать device в строку новой сессии ---
    sheet.getRange(newTokenRow, deviceIdx + 1, 1, 1).setValue(dev);

    // --- 2) Вытеснение: удалить старые строки (СНИЗУ ВВЕРХ —
    //     индексы не сдвигаются) ---
    rowsToEvict.sort(function (a, b) { return b - a; });
    for (var i = 0; i < rowsToEvict.length; i++) {
      sheet.deleteRow(rowsToEvict[i]);
    }

    result.applied = true;
    result.evicted = rowsToEvict.length;
    return result;

  } catch (err) {
    // FAIL-OPEN: вход важнее лимита — не бросаем исключение наружу.
    result.reason = 'error';
    result.error = err && err.message ? err.message : String(err);
    console.error('[SessionsDevicePolicy] Ошибка (вход не блокирован): '
        + result.error);
    return result;
  }
}

