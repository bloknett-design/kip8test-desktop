/**
 * Utils.gs — Вспомогательные функции
 * ============================================================
 * Чтение/запись листов, валидация, генерация токенов,
 * нормализация email, rate limiting, cleanup.
 *
 * Task 348 (2026-09-09): 1) генерация токенов и OTP-кодов переведена
 * с Math.random (не криптостойкий) на Utilities.getUuid(); 2) добавлен
 * Utils.withLock(fn, timeoutMs) — сериализация мутаций через
 * LockService.getScriptLock(); обёрнуты Admin.createUser,
 * Admin.resetLogin и cleanupStaleSessions (остальные обёртки — в
 * Sessions.gs и Auth.gs, см. DEPLOY-Task348-uuid-lockservice.md).
 *
 * Task 349 (2026-09-09): 1) удалены МЁРТВЫЕ хелперы getClientIp() /
 * getClientUserAgent() (всегда возвращали '') и
 * countRecentAuditLogsByIp() (вызывался только из мёртвой per-IP
 * ветки sendOTP, всегда 0) — Apps Script в doPost не видит IP и
 * User-Agent клиента, код-обманка удалён; 2) Admin.updateRole —
 * замок + синхрон role-снапшота sessions!D при смене роли +
 * МГНОВЕННАЯ выгонка при «Запрет» (удаление всех сессий юзера и
 * сброс login_status, как resetLogin) — см. DEPLOY-Task349.
 *
 * Task 350 (2026-09-09): закрыты ПОСЛЕДНИЕ мутации без замка и
 * добавлены БАТЧ-удаления: 1) cleanupExpiredSessions /
 * cleanupExpiredOtpCodes / cleanupOldAuditLogs (крон hourlyCleanup
 * работает параллельно с запросами юзеров) — под Utils.withLock
 * (таймаут 30 сек); cleanupExpiredSessions вдобавок читает users
 * ОДИН раз (было findUserById на каждую строку = O(n²) чтений);
 * 2) чистки otp_codes и audit_log удаляют сплошной верхний блок
 * одним deleteRows(5, N) вместо deleteRow на каждую строку (листы
 * append-only → просроченное сверху; страховочный проход с конца —
 * для строк, выбившихся из хронологии); 3) incrementOtpAttempts
 * возвращает НОВОЕ значение счётчика (вызов под замком в verifyOTP
 * читает+пишет атомарно) — см. DEPLOY-Task350-locks-cleanup-batch.md.
 *
 * Task 351 (2026-09-09): 1) Admin.deleteUser — удаление пользователя
 * со всеми его сессиями и OTP (замок; гарды «нельзя себя» и «нельзя
 * последнего админа»; аудит ADMIN_DELETE_USER; см. DEPLOY-Task351);
 * 2) КЭШ ЧТЕНИЙ на одно выполнение — _rowsCache + beginExecution()
 * (сброс в doPost/hourlyCleanup — Code.gs) + инвалидация при любой
 * записи; повторные getRows одного листа (sendOTP: users ×2, config
 * ×5-6, audit_log ×2; гейт+модуль: сессия+юзер ×2) = ОДНО чтение
 * API вместо 2-6; 3) Admin.listLogs читает только ХВОСТ audit_log
 * (Utils.getLastRows — заголовки r4 + последние N строк) вместо всего
 * листа (90 дней логов) + сортировка хвоста; 4) getConfig с ЧИСЛОВЫМ
 * дефолтом парсит значение устойчиво: '', 'abc', '-5', '0', NaN →
 * дефолт + console.warn ('' * N = 0 → cutoff «сейчас» → чистка
 * сносила бы ВСЕ сессии — реальная дыра).
 *
 * Task 352 (2026-09-09): закрыт мягкий DoS по email (аудит п.5) —
 * удалён countRecentOtpFails (единственный вызов — email-блок в
 * sendOTP: счётчик OTP_FAILED по email писался ЛЮБЫМ, знающим адрес
 * жертвы, и блокировал ей выдачу кода на 30 мин, продлеваемо до
 * бесконечности). Ключ config OTP_BLOCK_MINUTES больше НЕ читается.
 * Логика лимита попыток — в verifyOTP (Auth.gs): неверные попытки не
 * сжигают код, после MAX_OTP_ATTEMPTS — дешёвый отказ без аудита.
 *
 * Task 347 (2026-09-08): добавлена Utils.cleanupStaleSessions() —
 * чистка «заброшенных» строк листа sessions (last_heartbeat старше
 * N дней; config STALE_SESSION_DAYS, по умолчанию 30). Вызывается
 * из hourlyCleanup (Code.gs, одна строка). Диагноз: за месяцы
 * тестов в листе sessions накопились десятки строк-сирот (старый
 * logout их не удалял, входы без выхода, а сессии по заявке
 * бессрочные), из-за них фикс Task 346 не сбрасывал login_status
 * последней сессии («another session stays active»). Справочник
 * соответствует живому Utils.gs (прислан 2026-09-08, включая
 * встроенные Admin.gs; ОПАСНАЯ копия функции настройки триггеров
 * удалена в Task 513 — канон живёт в Code.gs) + новая функция.
 */

const Utils = {

  /** Кэш листов (один getActiveSheet за вызов). */
  _sheetCache: {},

  /**
   * Task 351: кэш ДАННЫХ листов (getRows) — строго на ОДНО выполнение.
   * GAS МОЖЕТ переиспользовать глобальное состояние между выполнениями
   * на одном инстансе — поэтому сброс (beginExecution) вызывается в
   * НАЧАЛЕ каждого входа: Code.gs doPost (все запросы) и hourlyCleanup
   * (крон). Без этого второй запрос получил бы снапшот первого.
   * Внутри выполнения записи листов инвалидируют кэш (см. _invalidate).
   */
  _rowsCache: {},

  /** Получить лист по имени (с кэшем). */
  getSheet: function(name) {
    if (!this._sheetCache[name]) {
      this._sheetCache[name] = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    }
    return this._sheetCache[name];
  },

  /**
   * Task 351: сброс кэша чтений — вызывать в начале КАЖДОГО выполнения
   * (Code.gs: doPost и hourlyCleanup; там же — единственные входы
   * продакшена). Ручные запуски из редактора (init-скрипты)
   * листы почти не читают через getRows; если добавить чтения —
   * вызывать beginExecution и там.
   */
  beginExecution: function() {
    this._rowsCache = {};
  },

  /**
   * Task 351: сбросить кэш КОНКРЕТНОГО листа — вызывается ВСЕМИ
   * мутациями этого листа (appendRow/deleteRow/deleteRows/setCell/
   * updateUserStatus/markOtpUsed/incrementOtpAttempts — ниже).
   * Соглашение по спискам аутентификации: мутации users/sessions/
   * otp_codes/audit_log идут ТОЛЬКО через эти хелперы (Sessions.gs
   * и Auth.gs также используют их; прямые setValue там переведены
   * на Utils.setCell в Task 351). ЕДИНСТВЕННОЕ исключение —
   * SessionsDevicePolicy.gs (свой openById): его записи device и
   * вытеснения выполняются в verifyOTP ВСЕГДА сразу после
   * Sessions.createSession, чей appendRow уже сбросил кэш sessions, —
   * устаревшего снапшота быть не может; см. DEPLOY-Task351
   * («осознанные НЕ-правки»).
   */
  invalidateCache: function(name) {
    delete this._rowsCache[name];
  },

  /**
   * Получить все строки листа как массив объектов (ключи — из строки 4 заголовков).
   * Task 351: кэш на выполнение — повторные чтения того же листа не
   * ходят в API. Возвращается КОПИЯ массива (slice): вызывающие могут
   * сортировать его (listLogs) без порчи кэша. ОБЪЕКТЫ строк общие —
   * поля объектов НЕ мутировать (только читать).
   */
  getRows: function(name) {
    if (this._rowsCache[name]) {
      return this._rowsCache[name].slice();
    }
    const sheet = this.getSheet(name);
    if (!sheet || sheet.getLastRow() < 4) return [];
    const range = sheet.getRange(4, 1, sheet.getLastRow() - 3, sheet.getLastColumn());
    const values = range.getValues();
    const headers = values[0];
    const rows = [];
    for (let i = 1; i < values.length; i++) {
      const obj = { row: i + 4 }; // номер строки в таблице
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = values[i][j];
      }
      rows.push(obj);
    }
    this._rowsCache[name] = rows;
    return rows.slice();
  },

  /**
   * Task 351: последние count строк данных листа (ХВОСТ) + заголовки
   * строки 4 — два маленьких чтения вместо всего листа. Для
   * append-only листов (audit_log, otp_codes): свежие события внизу,
   * список «последние N» = физический хвост. Используется
   * Admin.listLogs (раньше читала ВЕСЬ audit_log — 90 дней, десятки
   * тысяч строк — ради первых 100 после сортировки). Возвращает массив
   * объектов как getRows (row — реальный номер строки; поля не
   * мутировать). Кэшем не пользуется намеренно: вызывается один раз
   * за выполнение, а смешение «хвост+кэш полного листа» только
   * усложнило бы инварианты.
   */
  getLastRows: function(name, count) {
    if (!count || count < 1) return [];
    const sheet = this.getSheet(name);
    if (!sheet) return [];
    const lastRow = sheet.getLastRow();
    if (lastRow < 5) return []; // данных нет (r4 — заголовки)
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(4, 1, 1, lastCol).getValues()[0];
    const take = Math.min(count, lastRow - 4); // строк данных всего
    const startRow = lastRow - take + 1;       // первая строка чтения
    const values = sheet.getRange(startRow, 1, take, lastCol).getValues();
    const rows = [];
    for (let i = 0; i < values.length; i++) {
      const obj = { row: startRow + i };
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = values[i][j];
      }
      rows.push(obj);
    }
    return rows;
  },

  /** Добавить строку в лист (Task 351: + сброс кэша листа). */
  appendRow: function(name, values) {
    const sheet = this.getSheet(name);
    sheet.appendRow(values);
    this.invalidateCache(name);
  },

  /** Удалить строку по номеру (Task 351: + сброс кэша листа). */
  deleteRow: function(name, rowNum) {
    const sheet = this.getSheet(name);
    sheet.deleteRow(rowNum);
    this.invalidateCache(name);
  },

  /**
   * Task 351: удалить СПЛОШНОЙ блок строк (батч) одним вызовом —
   * обёртка над sheet.deleteRows(row, count) со сбросом кэша.
   * Используют крон-чистки (Task 350 срезают верхний блок
   * просроченных). Замена прямых getSheet(...).deleteRows(...)
   * (которые обходили кэш) — семантика та же.
   */
  deleteRows: function(name, rowNum, count) {
    const sheet = this.getSheet(name);
    sheet.deleteRows(rowNum, count);
    this.invalidateCache(name);
  },

  /** Обновить ячейку (Task 351: + сброс кэша листа). */
  setCell: function(name, rowNum, colNum, value) {
    const sheet = this.getSheet(name);
    sheet.getRange(rowNum, colNum).setValue(value);
    this.invalidateCache(name);
  },

  // ========================================================================
  // CONFIG
  // ========================================================================

  /**
   * Получить значение настройки из листа config.
   * Task 351: УСТОЙЧИВЫЙ ЧИСЛОВОЙ ПАРСИНГ — если defaultValue число,
   * значение парсится и проверяется, мусор НЕ протекает в арифметику:
   *   • "" (пусто) → раньше возвращался как есть → '' * N = 0 →
   *     cutoff «сейчас» → cleanupStaleSessions сносила ВСЕ сессии;
   *   • "abc" / "30 дней"-не-число / NaN → тихий отказ чисток;
   *   • "-5" / "0" → бессмысленные/опасные пороги (0 дней = снос всего).
   * Теперь: парсим мягко (trim, parseInt — "30 дней" → 30), при NaN
   * или < 1 возвращаем defaultValue + console.warn. Все 9 числовых
   * ключей (OTP-лимиты, STALE_SESSION_DAYS, AUDIT_LOG_RETENTION_DAYS…)
   * имеют смысл только ≥ 1 — поэтому минимум 1 зашит здесь; если
   * появится ключ с легитимным 0 — заводить отдельный геттер.
   * Строковые ключи (SUPPORT_REPLY_TO): defaultValue не число →
   * прежнее поведение (значение как есть).
   */
  getConfig: function(key, defaultValue) {
    const rows = this.getRows('config');
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].key === key) {
        const v = rows[i].value;
        // Если дефолт числовой — вернуть ЧИСЛО или дефолт, но не мусор
        if (typeof defaultValue === 'number') {
          const n = (typeof v === 'number') ? v
            : parseInt(String(v === undefined || v === null ? '' : v).trim(), 10);
          if (isNaN(n) || n < 1) {
            console.warn('[Utils.getConfig] config «' + key + '»: значение «' + v + '" не число или < 1 — использую дефолт ' + defaultValue);
            return defaultValue;
          }
          return n;
        }
        // Строковый ключ: прежнее поведение (числоподобные строки —
        // как записано; читатель сам решает, что с этим делать)
        if (typeof v === 'number') return v;
        if (typeof v === 'string' && /^\d+$/.test(v)) return parseInt(v, 10);
        return v;
      }
    }
    return defaultValue;
  },

  // ========================================================================
  // USERS
  // ========================================================================

  /** Найти пользователя по email. Возвращает {id, email, role, login_status, last_login, row} или null. */
  findUserByEmail: function(email) {
    const rows = this.getRows('users');
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i].email || '').toLowerCase() === email.toLowerCase()) {
        return rows[i];
      }
    }
    return null;
  },

  /** Найти пользователя по ID. */
  findUserById: function(id) {
    const rows = this.getRows('users');
    for (let i = 0; i < rows.length; i++) {
      if (Number(rows[i].ID) === Number(id)) {
        return rows[i];
      }
    }
    return null;
  },

  /**
   * Обновить login_status и last_login в строке users.
   * Task 351: сброс кэша users (мутация мимо getRows недопустима).
   */
  updateUserStatus: function(rowNum, status, lastLogin) {
    const sheet = this.getSheet('users');
    sheet.getRange(rowNum, 4).setValue(status);   // login_status = D
    if (lastLogin !== undefined) {
      sheet.getRange(rowNum, 5).setValue(lastLogin); // last_login = E
    }
    this.invalidateCache('users');
  },

  // ========================================================================
  // SESSIONS
  // ========================================================================

  /** Найти сессию по token. */
  findSessionByToken: function(token) {
    const rows = this.getRows('sessions');
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].session_token === token) return rows[i];
    }
    return null;
  },

  /**
   * Проверить, есть ли у пользователя активная сессия.
   * Возвращает true, если есть хотя бы одна запись в sessions для этого пользователя.
   *
   * ВАЖНО: сессии НЕ истекают по времени. Активной считается любая запись
   * в таблице sessions для этого пользователя.
   *
   * Используется в Auth.sendOTP для проверки "уже выполнен вход":
   * если login_status = 'вход выполнен', но записей в sessions нет — значит
   * login_status устарел, и его нужно сбросить, а не блокировать вход.
   */
  userHasActiveSession: function(userId) {
    const rows = this.getRows('sessions');
    for (let i = 0; i < rows.length; i++) {
      if (Number(rows[i].user_id) === Number(userId)) {
        return true;
      }
    }
    return false;
  },

  // ========================================================================
  // OTP
  // ========================================================================

  /** Получить последний активный (не used) OTP для email. */
  getActiveOtpForEmail: function(email) {
    const rows = this.getRows('otp_codes');
    let latest = null;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i].email || '').toLowerCase() === email.toLowerCase() &&
          rows[i].used !== true && String(rows[i].used).toUpperCase() !== 'TRUE') {
        if (!latest || rows[i].created_at.getTime() > latest.created_at.getTime()) {
          latest = rows[i];
        }
      }
    }
    return latest;
  },

  /** Получить последний OTP для email (любой, включая used). */
  getLastOtpForEmail: function(email) {
    const rows = this.getRows('otp_codes');
    let latest = null;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i].email || '').toLowerCase() === email.toLowerCase()) {
        if (!latest || rows[i].created_at.getTime() > latest.created_at.getTime()) {
          latest = rows[i];
        }
      }
    }
    return latest;
  },

  /**
   * Пометить OTP как использованный.
   * Task 351: сброс кэша otp_codes.
   */
  markOtpUsed: function(rowNum) {
    const sheet = this.getSheet('otp_codes');
    sheet.getRange(rowNum, 5).setValue('TRUE'); // used = E
    this.invalidateCache('otp_codes');
  },

  /**
   * Увеличить счётчик попыток для OTP.
   * Task 350: возвращает НОВОЕ значение счётчика — вызывается ПОД
   * замком в Auth.verifyOTP, где «прочитал attempts → записал
   * attempts+1» должен быть атомарным (раньше verifyOTP считал
   * «otp.attempts + 1» из УСТАРЕВШЕГО внешнего чтения — параллельные
   * неудачные попытки терялись, лимит считался неверно).
   */
  incrementOtpAttempts: function(rowNum) {
    const sheet = this.getSheet('otp_codes');
    const cell = sheet.getRange(rowNum, 6); // attempts = F
    const cur = parseInt(cell.getValue() || '0', 10);
    const next = cur + 1;
    cell.setValue(next);
    this.invalidateCache('otp_codes'); // Task 351: мутация сбрасывает кэш
    return next;
  },

  // Task 352: countRecentOtpFails (счётчик OTP_FAILED по email за N
  // минут) УДАЛЁН — единственный вызов (email-блок sendOTP) удалён
  // в Task 352 как мягкий DoS: счётчик по email писался ЛЮБЫМ, знающим
  // адрес жертвы, и блокировал ей выдачу кода. Brute-force-защита —
  // MAX_OTP_ATTEMPTS на код (в verifyOTP), см. шапку Auth.gs.

  // ========================================================================
  // AUDIT LOG
  // ========================================================================

  /** Записать событие в audit_log. */
  audit: function(email, action, ip, userAgent, details) {
    this.appendRow('audit_log', [
      new Date(),
      email || '',
      action || '',
      ip || '',
      userAgent || '',
      details || ''
    ]);
  },

  /** Подсчитать события action за последние N минут (глобально). */
  countRecentAuditLogs: function(action, minutes) {
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const rows = this.getRows('audit_log');
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].action === action &&
          rows[i].timestamp instanceof Date &&
          rows[i].timestamp.getTime() > since.getTime()) {
        count++;
      }
    }
    return count;
  },

  // Task 349: countRecentAuditLogsByIp УДАЛЁН — мёртвый код (IP в GAS
  // недоступен; вызывался только из удалённой per-IP ветки sendOTP и
  // всегда возвращал 0 из-за guard «if (!ip) return 0»).

  // ========================================================================
  // VALIDATION & GENERATORS
  // ========================================================================

  /** Нормализовать email: lowercase, trim, базовая валидация. */
  normalizeEmail: function(raw) {
    if (!raw) return '';
    const s = String(raw).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return '';
    return s;
  },

  // ========================================================================
  // LOCK (Task 348) — сериализация мутаций против гонок
  // ========================================================================

  /**
   * Task 348: выполнить fn под глобальным замком скрипта.
   * Apps Script обрабатывает запросы ПАРАЛЛЕЛЬНО: любая цепочка
   * «прочитал → посчитал → записал» может перемешаться с чужой такой
   * же (дубль ID при createUser; запись/удаление в ЧУЖУЮ строку по
   * устаревшему номеру при logout/heartbeat; дубль девайс-сессии при
   * параллельном входе). LockService.getScriptLock() — один замок на
   * все выполнения скрипта: пока fn выполняется, остальные ждут.
   *
   * ПРАВИЛА (нарушать нельзя):
   *   1. Критическая секция короткая — только чтения/записи таблиц.
   *      Отправка почты (MailApp) и внешние вызовы — ВНЕ замка.
   *   2. Замок НЕ реентерабельный: внутри fn НЕ вызывать функции,
   *      которые сами берут withLock (взаимоблокировка). Чтение
   *      переносится ВНУТРЬ fn — прочитанное снаружи уже устарело.
   *   3. tryLock с таймаутом: при таймауте — понятная ошибка
   *      server_busy (клиент предложит повторить), не вечное молчание.
   */
  withLock: function(fn, timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(timeoutMs)) {
      throw new Error('server_busy: попробуйте ещё раз через несколько секунд');
    }
    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  },

  /**
   * Task 348: токен сессии из Utilities.getUuid().
   * Math.random() — не криптографический генератор (последовательность
   * теоретически восстанавливается по нескольким значениям), а сессии
   * бессрочные — украденный токен жил бы вечно. getUuid() — встроенный
   * криптостойкий источник: один UUID минус 4 дефиса = ровно 32
   * hex-символа (дефолтная длина токена). Длина параметром сохранена:
   * если в config SESSION_TOKEN_LENGTH другой размер — доберём вторым
   * UUID. Старые токены остаются валидными, меняется только генерация
   * новых (charset [0-9a-f] вместо [A-Za-z0-9], длина та же).
   */
  generateToken: function(length) {
    length = length || 32;
    let out = '';
    while (out.length < length) {
      out += Utilities.getUuid().replace(/-/g, '');
    }
    return out.substring(0, length);
  },

  /**
   * Task 348: числовой OTP-код тоже из getUuid — из hex-символов UUID
   * оставляем только цифры 0-9 (в одном UUID их в среднем ~20, для
   * 6-значного кода хватает с запасом; цикл — страховка). Прежний
   * Math.random был предсказуемым; лимит попыток MAX_OTP_ATTEMPTS
   * остаётся второй линией обороны. Возвращает строку — клиент
   * сравнивает код как текст, формат не изменился.
   */
  generateNumericCode: function(length) {
    let digits = '';
    while (digits.length < length) {
      digits += Utilities.getUuid().replace(/[^0-9]/g, '');
    }
    return digits.substring(0, length);
  },

  // Task 349: getClientIp() / getClientUserAgent() УДАЛЁНЫ — всегда
  // возвращали '' (Apps Script в doPost не видит IP/UA клиента);
  // вызовы Utils.audit(...) теперь передают '' напрямую. Колонки ip /
  // user_agent в audit_log остаются (история), но всегда пустые.


  // ========================================================================
  // ROLES (источник истины — Карта ролей, см. kip8-desktop/tests/test-role-access.js)
  // ========================================================================

  /**
   * Полный список допустимых ролей.
   * ============================================================
   * Порядок соответствует карте ролей (tests/test-role-access.js):
   *   1. Запрет
   *   2. Общий доступ
   *   3. ИТР ТОКЕМ                 — калькуляторы + ограниченный КИП ИОС + «Что нового» (фильтры 1, 4, 8)
   *   4. КИП8                       — калькуляторы + билеты + секретные + «Что нового»
   *   5. КИП8 pro                   — КИП8 + расходомеры
   *   6. КИП ИОС                    — КИП8 + КИП ИОС
   *   7. КИП ИОС pro                — КИП ИОС + «Проекты» и «Каб.журнал» (фильтр 5)
   *   8. КИП ИОС дежурный           — КИП ИОС pro + расходомеры + canInputReadings
   *   9. ИТР8                       — КИП ИОС + расходомеры
   *  10. ИТР8 pro                   — ИТР8
   *  11. ИТР ИОС                    — ИТР8 + «Проекты»/«Каб.журнал»
   *  12. Админ                      — полный доступ (фильтры 1-11)
   *
   * ВАЖНО: любые изменения этого списка синхронизировать с:
   *   - kip8-desktop/tests/test-role-access.js (const ROLES)
   *   - kip8-desktop/index.html (ROLE_ACCESS + LVL_* константы в _applyRoleToUI)
   * ============================================================
   */
  getAllowedRoles: function() {
    return [
      'Запрет',
      'Общий доступ',
      'ИТР ТОКЕМ',
      'КИП8',
      'КИП8 pro',
      'КИП ИОС',
      'КИП ИОС pro',
      'КИП ИОС дежурный',
      'ИТР8',
      'ИТР8 pro',
      'ИТР ИОС',
      'Админ'
    ];
  },

  // ========================================================================
  // CLEANUP (вызывается из hourlyCleanup через trigger)
  // ========================================================================

  /**
   * Очистка сессий (вызывается из hourlyCleanup через trigger).
   * ============================================================
   * ВАЖНО: сессии НЕ истекают по времени. Эта функция только удаляет
   * «осиротевшие» сессии — те, у которых пользователь удалён из users.
   * Логика getCurrentUser уже делает это лениво, но cron нужен для
   * сессий, к которым никто не обращается.
   *
   * Task 350: 1) [чтение users → чтение sessions → deleteRow с конца]
   * под Utils.withLock — крон бежит ПАРАЛЛЕЛЬНО запросам юзеров:
   * чужой logout/heartbeat/deleteRow между нашим чтением и удалением
   * сдвигает номера строк — чистка без замка могла удалить ЧУЖУЮ
   * строку (класс бага Task 348, эти три чистки тогда остались без
   * замка); 2) список живых ID читается ОДНИМ getRows('users') и
   * складывается в индекс — было findUserById на КАЖДУЮ строку
   * sessions, каждый вызов = полный перечит листа users (O(n²)
   * API-чтений). Семантика прежняя: Number-совпадение, строка без
   * user_id (Number('')=0, юзера с ID 0 нет) = сирота и удаляется.
   * Возвращает число удалённых строк (для логирования).
   * ============================================================
   */
  cleanupExpiredSessions: function() {
    return Utils.withLock(() => {
      const rows = this.getRows('sessions');
      if (rows.length === 0) return 0;

      // Живые ID — один проход по users (вместо findUserById в цикле).
      // isNaN-строки в users!A в индекс не попадают — их сессии,
      // как и раньше, считаются осиротевшими.
      const userRows = this.getRows('users');
      const existingIds = {};
      for (let i = 0; i < userRows.length; i++) {
        const id = Number(userRows[i].ID);
        if (!isNaN(id)) existingIds[id] = true;
      }

      // Идём с конца, чтобы не сбивать нумерацию строк при удалении
      let removed = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        const s = rows[i];
        if (!existingIds[Number(s.user_id)]) {
          this.deleteRow('sessions', s.row);
          this.audit(s.email, 'SESSION_CLEANUP_ORPHAN', '', '',
            'User deleted from users table, session removed');
          removed++;
        }
      }
      return removed;
    }, 30000);
  },

  /**
   * Удалить истёкшие OTP-коды (старше 1 часа).
   * Task 350: под замком + БАТЧ-удаление. Лист append-only (строки
   * дописываются только в конец) → хронология по времени создания →
   * просроченные строки = сплошной блок СВЕРХУ (данные с r5). Один
   * sheet.deleteRows(5, N) вместо deleteRow на каждую строку: сотни
   * API-вызовов заменены одним — быстрее и не упирается в 6-минутный
   * лимит триггера. Страховочный проход с конца удаляет просроченные
   * строки, ВЫБИВШИЕСЯ из хронологии (ручная вставка в середину):
   * их номера после батча сдвинуты на N вверх → row - prefix.
   * Возвращает число удалённых строк.
   */
  cleanupExpiredOtpCodes: function() {
    return Utils.withLock(() => {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000);
      const rows = this.getRows('otp_codes');

      // Сплошной блок просроченных сверху (как правило — все разом)
      let prefix = 0;
      while (prefix < rows.length
          && rows[prefix].expires_at instanceof Date
          && rows[prefix].expires_at.getTime() < cutoff.getTime()) {
        prefix++;
      }
      let removed = 0;
      if (prefix > 0) {
        // Task 351: батч через Utils.deleteRows — сброс кэша листа
        // (прямой getSheet().deleteRows() обходил кэш чтений).
        this.deleteRows('otp_codes', 5, prefix);
        removed += prefix;
      }

      // Страховка: просроченные НИЖЕ чужой/свежей строки (не хронология)
      for (let i = rows.length - 1; i >= prefix; i--) {
        if (rows[i].expires_at instanceof Date
            && rows[i].expires_at.getTime() < cutoff.getTime()) {
          this.deleteRow('otp_codes', rows[i].row - prefix);
          removed++;
        }
      }
      return removed;
    }, 30000);
  },

  /**
   * Удалить старые записи audit_log (старше N дней).
   * Task 350: под замком + БАТЧ-удаление — как cleanupExpiredOtpCodes
   * (лист append-only, audit пишет только appendRow → хронология;
   * просроченный блок сверху срезается одним deleteRows(5, N),
   * выбившиеся из хронологии строки — страховочным проходом с конца).
   * Раньше: deleteRow на КАЖДУЮ строку — при 90 днях логов сотни
   * последовательных API-вызовов, риск упереться в лимит триггера,
   * и всё это без замка (гонка номеров строк с запросами юзеров).
   * Возвращает число удалённых строк.
   */
  cleanupOldAuditLogs: function() {
    return Utils.withLock(() => {
      const days = this.getConfig('AUDIT_LOG_RETENTION_DAYS', 90);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const rows = this.getRows('audit_log');

      // Сплошной блок просроченных сверху
      let prefix = 0;
      while (prefix < rows.length
          && rows[prefix].timestamp instanceof Date
          && rows[prefix].timestamp.getTime() < cutoff.getTime()) {
        prefix++;
      }
      let removed = 0;
      if (prefix > 0) {
        // Task 351: батч через Utils.deleteRows (сброс кэша листа)
        this.deleteRows('audit_log', 5, prefix);
        removed += prefix;
      }

      // Страховка: просроченные ниже нехронологичной вставки
      for (let i = rows.length - 1; i >= prefix; i--) {
        if (rows[i].timestamp instanceof Date
            && rows[i].timestamp.getTime() < cutoff.getTime()) {
          this.deleteRow('audit_log', rows[i].row - prefix);
          removed++;
        }
      }
      return removed;
    }, 30000);
  },

  /**
   * Task 347: удалить «заброшенные» сессии — строки листа sessions,
   * у которых last_heartbeat старше N дней (config: STALE_SESSION_DAYS,
   * по умолчанию 30). Вызывается из hourlyCleanup (Code.gs).
   *
   * Почему это НЕ «истечение по времени» (заявка: сессии бессрочные):
   * живое устройство бьёт heartbeat каждые 5 минут, поэтому last_heartbeat
   * активной сессии всегда свежий. Строка, молчавшая месяц, — это удалённое
   * приложение/очищенный браузер, а не живая сессия. Именно такие строки
   * копились месяцами (старый logout их не удалял) и не давали фиксу
   * Task 346 сбрасывать login_status последней сессии.
   *
   * Дополнительно: если у пользователя после чистки не осталось ни одной
   * строки — сбросить login_status в «вход не выполнен» (событие
   * LOGIN_STATUS_AUTO_RESET, как в самосинхронизации Auth.sendOTP).
   * Строки с пустым user_id (легаси Task 37) удаляются, но статус их
   * пользователя не трогаем — рассинхрон починит самосинхронизация при
   * следующем входе.
   *
   * Возвращает число удалённых строк (для логирования/отладки).
   */
  cleanupStaleSessions: function() {
    // Task 348: мутации под замком (таймаут 30 сек — чистка большого
    // листа дольше обычной операции). Стрелочная функция: this (= Utils)
    // сохраняется лексически. Гонка: параллельный logout удаляет строку
    // между нашим чтением и deleteRow — номер съезжает, чистка удалила бы
    // ЧУЖУЮ строку. Внутри НЕ вызывать withLock-функции (замок не
    // реентерабелен).
    return Utils.withLock(() => {
      const days = this.getConfig('STALE_SESSION_DAYS', 30);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const rows = this.getRows('sessions');
      const affected = {}; // user_id -> true (у кого могли исчезнуть все сессии)
      let removed = 0;

      // Проход 1: удалить устаревшие строки (с конца — нумерация не сбивается)
      for (let i = rows.length - 1; i >= 0; i--) {
        const s = rows[i];
        const hb = (s.last_heartbeat instanceof Date) ? s.last_heartbeat.getTime() : 0;
        if (hb < cutoff) {
          this.deleteRow('sessions', s.row);
          if (s.user_id !== '' && s.user_id !== undefined && s.user_id !== null) {
            affected[s.user_id] = true;
          }
          this.audit(s.email, 'SESSION_CLEANUP_STALE', '', '',
            'last_heartbeat older than ' + days + ' days — session removed');
          removed++;
        }
      }

      // Проход 2: сбросить login_status тем, у кого сессий не осталось
      for (const uid in affected) {
        if (!this.userHasActiveSession(uid)) {
          const user = this.findUserById(uid);
          if (user && user.login_status === 'вход выполнен') {
            this.updateUserStatus(user.row, 'вход не выполнен', user.last_login);
            this.audit(user.email, 'LOGIN_STATUS_AUTO_RESET', '', '',
              'No sessions left after stale cleanup');
          }
        }
      }
      return removed;
    }, 30000);
  }
};

/**
 * Admin.gs — Админ-функции (требуют роль "Админ")
 * Встроен в Utils.gs для удобства (отдельный файл не обязателен).
 */
const Admin = {

  _requireAdmin: function(token) {
    if (!token) throw new Error('Unauthorized');
    const session = Utils.findSessionByToken(token);
    if (!session) throw new Error('Unauthorized');
    const user = Utils.findUserById(session.user_id);
    if (!user || user.role !== 'Админ') {
      Utils.audit(session.email, 'ADMIN_ACCESS_DENIED', '', '', 'Non-admin tried admin endpoint');
      throw new Error('Forbidden: admin role required');
    }
    return user;
  },

  listUsers: function(token) {
    this._requireAdmin(token);
    return Utils.getRows('users').map(u => ({
      id: u.ID, email: u.email, role: u.role,
      login_status: u.login_status, last_login: u.last_login
    }));
  },

  updateRole: function(token, userId, newRole) {
    const admin = this._requireAdmin(token);

    // Task 349: [найти юзера → валидация роли → запись users!C →
    // синхрон role-снапшота в sessions!D | «Запрет»: мгновенная
    // выгонка] под замком — паттерн resetLogin (Task 348): параллельный
    // heartbeat/logout/resetLogin удаляет строки сессий между нашим
    // чтением и записью, номера строк съезжают. updateRole была
    // последней мутацией без замка.
    return Utils.withLock(function() {
      const user = Utils.findUserById(userId);
      if (!user) throw new Error('User not found');
      // Список ролей по карте ролей (Task 38, "Карта ролей.xlsx").
      // Источник истины — Utils.getAllowedRoles() — чтобы список был в одном месте.
      const allowed = Utils.getAllowedRoles();
      if (allowed.indexOf(newRole) === -1) throw new Error('Invalid role: ' + newRole);

      // role = C. Task 351: через Utils.setCell — сброс кэша users
      // (прямая запись мимо хелпера оставила бы кэш устаревшим).
      Utils.setCell('users', user.row, 3, newRole);

      // ============================================================
      // Task 349: sessions!D — role-снапшот на момент входа. Раньше
      // updateRole его НЕ трогала: строка висела со старой ролью до
      // ближайшего getCurrentUser юзера (он мог быть офлайн — и тогда
      // бессрочно). Теперь:
      //   • обычная роль — снапшот обновляется во всех живых сессиях
      //     юзера сразу (getCurrentUser делал это лениво, при запросе);
      //   • «Запрет» — МГНОВЕННАЯ выгонка: удалить ВСЕ его сессии и
      //     сбросить login_status (как resetLogin), не дожидаясь
      //     запроса жертвы. Роль-снапшот трогать незачем — строк нет.
      // ============================================================
      let evicted = 0;
      const sessions = Utils.getRows('sessions');
      if (newRole === 'Запрет') {
        // С конца: deleteRow сдвигает номера строк ниже (как в resetLogin)
        for (let i = sessions.length - 1; i >= 0; i--) {
          if (Number(sessions[i].user_id) === Number(userId)) {
            Utils.deleteRow('sessions', sessions[i].row);
            evicted++;
          }
        }
        if (evicted > 0) {
          Utils.updateUserStatus(user.row, 'вход не выполнен', user.last_login);
        }
      } else {
        for (let i = 0; i < sessions.length; i++) {
          if (Number(sessions[i].user_id) === Number(userId) &&
              sessions[i].role !== newRole) {
            // Task 351: через Utils.setCell — сброс кэша sessions
            Utils.setCell('sessions', sessions[i].row, 4, newRole);
          }
        }
      }

      Utils.audit(admin.email, 'ADMIN_UPDATE_ROLE', '', '',
        'User ' + user.email + ' role: ' + user.role + ' → ' + newRole +
        (evicted > 0 ? ' (instant evict: ' + evicted + ' session(s))' : ''));
      if (evicted > 0) {
        // Существующее событие (ленивый путь getCurrentUser пишет то же
        // имя) — Task 349 новых типов аудита НЕ вводит.
        Utils.audit(user.email, 'FORCE_LOGOUT_ROLE', '', '',
          'Role changed to Запрет — instant evict by updateRole');
      }
      return { ok: true, evicted: evicted };
    });
  },

  resetLogin: function(token, userId) {
    const admin = this._requireAdmin(token);

    // Task 348: [найти юзера → сбросить статус → удалить его сессии →
    // аудит] под замком. Параллельный logout/heartbeat пользователя
    // (heartbeat каждые 5 мин) читает и удаляет строки между нашим
    // чтением и удалением — номера строк съезжают, deleteRow попал бы
    // в ЧУЖУЮ строку. Поиск юзера тоже внутри замка (снаружи — уже
    // устаревший row).
    return Utils.withLock(function() {
      const user = Utils.findUserById(userId);
      if (!user) throw new Error('User not found');

      Utils.updateUserStatus(user.row, 'вход не выполнен', user.last_login);

      // Удалить все активные сессии этого пользователя
      const sessions = Utils.getRows('sessions');
      for (let i = sessions.length - 1; i >= 0; i--) {
        if (Number(sessions[i].user_id) === Number(userId)) {
          Utils.deleteRow('sessions', sessions[i].row);
        }
      }

      Utils.audit(admin.email, 'ADMIN_RESET_LOGIN', '', '',
        'Reset login for ' + user.email);
      return { ok: true };
    });
  },

  /**
   * Task 351: УДАЛИТЬ пользователя — со всеми его сессиями и OTP-кодами.
   * Аудит п.3 (🟡): функции удаления не было — удалённый руками из
   * users юзер оставлял хвосты в sessions (их вычищал только крон
   * cleanupExpiredSessions как «сирот») и активный OTP, который
   * оставался годен ДО истечения TTL — если сразу пересоздать юзера
   * с той же почтой, старый код дал бы вход «новому» юзеру.
   *
   * ГАРДЫ (fail-safe — контролируемая ошибка, не падение):
   *   • юзер не найден → 'User not found' (двойной клик / уже удалён);
   *   • нельзя удалить СЕБЯ (admin.ID === user.ID) — иначе админ
   *     сносит свою строку посреди запроса и теряет доступ;
   *   • нельзя удалить ПОСЛЕДНЕГО админа — иначе систему нечем
   *     администрировать (сами себя админы тоже не удалят, см. выше).
   *
   * Порядок (всё под ОДНИМ замком, паттерн resetLogin Task 348):
   *   1. найти юзера (ВНУТРИ замка — снаружи row уже устарел);
   *   2. сессии: с конца, совпадение по user_id ИЛИ email — надёжно
   *      и для легаси-строк Task 37 с пустым user_id;
   *   3. OTP-строки по email (с конца — номера строк не съезжают);
   *   4. строка users ПОСЛЕДНЕЙ — удаления в других листах не трогают
   *      нумерацию users, а наш user.row собран под замком;
   *   5. аудит ADMIN_DELETE_USER с деталями (сколько снесено).
   * Возвращает { ok, deleted, sessionsRemoved, otpsRemoved }.
   */
  deleteUser: function(token, userId) {
    const admin = this._requireAdmin(token);

    return Utils.withLock(function() {
      const user = Utils.findUserById(userId);
      if (!user) throw new Error('User not found');

      // Гард: нельзя удалить собственный аккаунт
      if (Number(user.ID) === Number(admin.ID)) {
        throw new Error('Нельзя удалить собственный аккаунт');
      }

      // Гард: нельзя удалить последнего админа
      if (user.role === 'Админ') {
        const allUsers = Utils.getRows('users');
        let otherAdmins = 0;
        for (let i = 0; i < allUsers.length; i++) {
          if (allUsers[i].role === 'Админ'
              && Number(allUsers[i].ID) !== Number(user.ID)) {
            otherAdmins++;
          }
        }
        if (otherAdmins === 0) {
          throw new Error('Нельзя удалить последнего администратора');
        }
      }

      // 1) Сессии юзера: с конца (deleteRow сдвигает номера ниже),
      //    по user_id ИЛИ email (легаси Task 37 — пустой user_id)
      let sessionsRemoved = 0;
      const targetEmail = String(user.email || '').toLowerCase();
      const sessions = Utils.getRows('sessions');
      for (let i = sessions.length - 1; i >= 0; i--) {
        const s = sessions[i];
        const byId = Number(s.user_id) === Number(userId);
        const byEmail = targetEmail !== ''
            && String(s.email || '').toLowerCase() === targetEmail;
        if (byId || byEmail) {
          Utils.deleteRow('sessions', s.row);
          sessionsRemoved++;
        }
      }

      // 2) OTP-коды по email: активный код умирает вместе с юзером
      //    (закрыта дыра «удалил → пересоздал → вошёл по старому коду»)
      let otpsRemoved = 0;
      const otps = Utils.getRows('otp_codes');
      for (let i = otps.length - 1; i >= 0; i--) {
        if (String(otps[i].email || '').toLowerCase() === targetEmail) {
          Utils.deleteRow('otp_codes', otps[i].row);
          otpsRemoved++;
        }
      }

      // 3) Строка users — последней (см. доккоммент выше)
      Utils.deleteRow('users', user.row);

      // 4) Аудит
      Utils.audit(admin.email, 'ADMIN_DELETE_USER', '', '',
        'Deleted user ' + user.email + ' (id ' + user.ID + '): removed '
        + sessionsRemoved + ' session(s), ' + otpsRemoved + ' otp row(s)');

      return {
        ok: true,
        deleted: user.email,
        sessionsRemoved: sessionsRemoved,
        otpsRemoved: otpsRemoved
      };
    });
  },

  /**
   * Создать нового пользователя.
   * Логика:
   *   1. Валидация email (normalizeEmail)
   *   2. Проверка, что email уникальный (findUserByEmail)
   *   3. Проверка роли (allowed список)
   *   4. Сгенерировать новый ID = max(existing IDs) + 1
   *   5. Добавить строку: [ID, email, role, 'вход не выполнен', '']
   *   6. audit_log
   * Возвращает { ok: true, id: <newId>, email, role }.
   */
  createUser: function(token, rawEmail, newRole) {
    const admin = this._requireAdmin(token);

    const email = Utils.normalizeEmail(rawEmail);
    if (!email) throw new Error('Некорректный email');

    // Список ролей — единый источник истины Utils.getAllowedRoles().
    const allowed = Utils.getAllowedRoles();
    if (allowed.indexOf(newRole) === -1) {
      throw new Error('Недопустимая роль: ' + newRole);
    }

    // Task 348: [проверка уникальности email → maxId → запись] под
    // замком. Иначе два одновременных createUser (двойной клик по
    // «Создать» / два админа) оба считают maxId+1 и создадут ДВУХ
    // пользователей с одним ID. Стрелочная функция — this не нужен,
    // всё через Utils.* и captured-переменные.
    return Utils.withLock(function() {
      // Проверка уникальности email (внутри замка — двойной submit
      // не пройдёт дважды).
      const existing = Utils.findUserByEmail(email);
      if (existing) {
        throw new Error('Пользователь с email ' + email + ' уже существует');
      }

      // Сгенерировать новый ID = max(existing IDs) + 1.
      // Чтение ВНУТРИ замка — прочитанное снаружи уже устарело.
      const rows = Utils.getRows('users');
      let maxId = 0;
      for (let i = 0; i < rows.length; i++) {
        const id = Number(rows[i].ID);
        if (!isNaN(id) && id > maxId) maxId = id;
      }
      const newId = maxId + 1;

      // Добавить строку: ID | email | role | login_status | last_login
      // Структура листа users: A=ID, B=email, C=role, D=login_status, E=last_login.
      Utils.appendRow('users', [newId, email, newRole, 'вход не выполнен', '']);

      Utils.audit(admin.email, 'ADMIN_CREATE_USER', '', '',
        'Created user: ' + email + ' (role: ' + newRole + ', id: ' + newId + ')');

      return { ok: true, id: newId, email: email, role: newRole };
    });
  },

  listSessions: function(token) {
    this._requireAdmin(token);
    return Utils.getRows('sessions').map(s => ({
      token: s.session_token ? s.session_token.substring(0, 8) + '…' : '', // не возвращаем полный токен
      user_id: s.user_id,
      email: s.email,
      role: s.role,
      created_at: s.created_at,
      last_heartbeat: s.last_heartbeat
    }));
  },

  /**
   * Task 351: журнал аудита — только ХВОСТ. Раньше читался ВЕСЬ
   * audit_log (90 дней, десятки тысяч строк) ради limit (100)
   * строк после сортировки. Лист append-only → последние события —
   * физический низ листа → Utils.getLastRows читает заголовки r4 +
   * последние limit строк. Хвост ещё раз сортируем по убыванию
   * timestamp — страховка от редких нехронологических вставок
   * (ручная правка середины листа): их «самые свежие» записи могут
   * не попасть в физический хвост — осознанный обмен (см.
   * DEPLOY-Task351). Формат полей ответа прежний.
   */
  listLogs: function(token, limit) {
    this._requireAdmin(token);
    limit = Math.min(limit || 100, 500);
    const rows = Utils.getLastRows('audit_log', limit);
    // Сортировка по убыванию timestamp (страховка, хвост почти отсортирован)
    rows.sort((a, b) => {
      const ta = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
      const tb = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
      return tb - ta;
    });
    return rows.map(r => ({
      timestamp: r.timestamp,
      email: r.email,
      action: r.action,
      ip: r.ip,
      details: r.details
    }));
  }
};
