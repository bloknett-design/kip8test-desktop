/**
 * Sessions.gs — Управление сессиями (создание, heartbeat, logout)
 * ============================================================
 * Task 346, патч семантики logout (2026-09-08):
 *   • БАГ живого кода: logout удалял ТОЛЬКО свою строку сессии, но затем
 *     БЕЗУСЛОВНО сбрасывал login_status ПОЛЬЗОВАТЕЛЯ в «вход не
 *     выполнен». Heartbeat параллельного устройства (каждые 5 мин)
 *     проверяет login_status → видел «вход не выполнен» → удалял свою
 *     сессию и бросал session_expired → клиент уходил в гостевой режим.
 *     Итог: выход из мобильного приложения выкидывал и десктоп.
 *     Теперь login_status сбрасывается ТОЛЬКО если это была ПОСЛЕДНЯЯ
 *     сессия пользователя (Sessions._userHasOtherSession).
 *   • Бонус-фикс: getCurrentUser возвращал userId из поля user.id (строчными)
 *     → undefined — заголовок листа users «ID» (см. Task 37 ниже).
 *     Клиент кэшировал пустой userId. Теперь user.ID, как в
 *     createSession и Auth.verifyOTP.
 * Изменены ТОЛЬКО logout и getCurrentUser (+ приватный helper):
 * createSession, heartbeat и структура листа sessions НЕ менялись.
 * Деплой не требует ни sdpInit, ни правок Code.gs — только замена
 * этого файла (DEPLOY-Task346-sessions-logout-fix.md).
 *
 * Task 348 (2026-09-09): heartbeat, logout и getCurrentUser обёрнуты
 * в Utils.withLock (LockService.getScriptLock) — сериализация мутаций
 * против гонок: чужой deleteRow между нашим чтением и записью сдвигает
 * номера строк, и мы попали бы в ЧУЖУЮ строку. createSession собственного
 * замка НЕ берёт — вызывается под замком Auth.verifyOTP (замок не
 * реентерабелен). Роутер Code.gs и структура листов НЕ менялись.
 *
 * Task 349 (2026-09-09): унификация имён — событие удаления
 * осиротевшей сессии в heartbeat переименовано
 * SESSION_ORPHAN_REMOVED → SESSION_CLEANUP_ORPHAN. Теперь ленивый путь
 * (heartbeat) и крон-путь (Utils.cleanupExpiredSessions) пишут ОДНО И
 * ТО ЖЕ имя — все сессионные события под единым префиксом
 * SESSION_CLEANUP_*. Старые записи в audit_log НЕ переписываются
 * (история остаётся со старым именем). Config STALE_SESSION_DAYS НЕ
 * переименовывался (юзер завёл руками, зашит в доку/тесты Task 347).
 *
 * Task 351 (2026-09-09): прямые записи в лист sessions
 * (heartbeat: last_heartbeat F; getCurrentUser: role-снапшот D)
 * переведены на Utils.setCell — сработает сброс кэша чтений
 * (Utils._rowsCache, Task 351). Семантика записей НЕ менялась.
 */

const Sessions = {

  /**
   * Создать новую сессию для пользователя.
   * Вызывается из Auth.verifyOTP после успешной верификации кода.
   * Возвращает: { token, userId, email, role, createdAt }
   *
   * ВАЖНО (Task 37): используем user.ID (ЗАГЛАВНЫЕ), а НЕ user.id.
   * Заголовок в листе users — "ID" (заглавные), поэтому Utils.getRows()
   * возвращает obj.ID. Если написать user.id — будет undefined,
   * в sessions запишется пустой user_id, и getCurrentUser будет
   * возвращать no_session при каждой проверке.
   */
  createSession: function(user) {
    // Task 348: собственного замка НЕТ — вызывается ИЗ Auth.verifyOTP
    // под ЕГО замком (см. Auth.gs). Замок не реентерабельный: взять
    // его здесь = взаимоблокировка. Если когда-нибудь вызовете
    // createSession вне verifyOTP — оборачивайте на стороне вызова.
    const token = Utils.generateToken(Utils.getConfig('SESSION_TOKEN_LENGTH', 32));
    const now = new Date();
    Utils.appendRow('sessions', [
      token,
      user.ID,
      user.email,
      user.role,
      now,  // created_at
      now   // last_heartbeat
    ]);
    return { token: token, userId: user.ID, email: user.email, role: user.role, createdAt: now };
  },

  /**
   * Обновить heartbeat сессии.
   * ============================================================
   * ВАЖНО: сессии НЕ истекают по времени. Пользователь остаётся залогиненным
   * бессрочно, пока не выйдет сам или пока админ не сбросит login_status.
   * Heartbeat только обновляет last_heartbeat для мониторинга (админ видит,
   * когда пользователь был последний раз активен).
   *
   * Однако heartbeat всё равно проверяет:
   *   - существует ли сессия (если нет — session_expired)
   *   - существует ли пользователь (если нет — удалить сессию, session_expired)
   *   - login_status === 'вход выполнен' (админ мог сбросить — session_expired)
   * ============================================================
   */
  heartbeat: function(token) {
    if (!token) throw new Error('No token');

    // Task 348: [чтение сессии → проверки → удаление/запись] под
    // замком: иначе параллельный logout/resetLogin удаляет строку
    // выше между нашим чтением и setValue(session.row, 6) — heartbeat
    // пишет в ЧУЖУЮ строку (номера строк съезжают после любого deleteRow).
    return Utils.withLock(function() {
      const session = Utils.findSessionByToken(token);
      if (!session) {
        throw new Error('session_expired');
      }

      // Проверить, что пользователь существует и login_status всё ещё 'вход выполнен'
      const user = Utils.findUserById(session.user_id);
      if (!user) {
        // Пользователь удалён из таблицы — удалить сессию.
        // Task 349: имя унифицировано с крон-путём
        // (Utils.cleanupExpiredSessions) — было SESSION_ORPHAN_REMOVED.
        Utils.deleteRow('sessions', session.row);
        Utils.audit(session.email, 'SESSION_CLEANUP_ORPHAN', '', '',
          'User deleted, session removed during heartbeat');
        throw new Error('session_expired');
      }
      if (user.login_status !== 'вход выполнен') {
        // Админ сбросил login_status — удалить сессию, выгнать пользователя
        Utils.deleteRow('sessions', session.row);
        Utils.audit(session.email, 'FORCE_LOGOUT_ADMIN_RESET', '', '',
          'login_status is not "вход выполнен" during heartbeat — admin reset');
        throw new Error('session_expired');
      }

      // Обновить last_heartbeat (только для мониторинга, не влияет на валидность).
      // Task 351: через Utils.setCell — сброс кэша чтений (было: прямой
      // sheet.getRange().setValue() в обход хелпера).
      Utils.setCell('sessions', session.row, 6, new Date()); // last_heartbeat = F

      return { ok: true };
    });
  },

  /**
   * Выйти из сессии.
   * Удаляет сессию из sessions, сбрасывает login_status в users —
   * НО (Task 346) только если у пользователя не осталось ДРУГИХ сессий.
   */
  logout: function(token) {
    if (!token) return { ok: true };

    // Task 348: [чтение сессии → удаление строки → проверка «других
    // сессий» → сброс статуса → аудит] под замком. Гонка с параллельным
    // heartbeat/resetLogin: любой deleteRow между нашим чтением и
    // удалением сдвигает номера строк — deleteRow(session.row) попал
    // бы в ЧУЖУЮ строку, а _userHasOtherSession смотрела бы на уже
    // несуществующую раскладку. _userHasOtherSession — чистое чтение,
    // своего замка не берёт (вызывается изнутри нашего).
    return Utils.withLock(function() {
      const session = Utils.findSessionByToken(token);
      if (session) {
        Utils.deleteRow('sessions', session.row);
        const user = Utils.findUserById(session.user_id);
        let keptParallel = false;
        if (user && user.login_status === 'вход выполнен') {
          // ============================================================
          // Task 346: сброс login_status ТОЛЬКО при отсутствии других
          // сессий. Раньше сброс был безусловным: logout из мобильного
          // ставил пользователю «вход не выполнен», а heartbeat
          // параллельного десктопа (каждые 5 минут), увидев статус ≠
          // «вход выполнен», удалял свою сессию и бросал session_expired —
          // десктоп выкидывало в гостевой режим. Теперь: пока жива хотя бы
          // одна другая сессия (моб ИЛИ десктоп) — статус не трогаем,
          // выйдет последняя — сбросим как раньше.
          // ============================================================
          if (!Sessions._userHasOtherSession(session.user_id, session.email)) {
            Utils.updateUserStatus(user.row, 'вход не выполнен', user.last_login);
          } else {
            keptParallel = true;
          }
        }
        Utils.audit(session.email, 'LOGOUT', '', '',
          keptParallel
            ? 'User logged out (another session stays active — Task 346 parallel mode)'
            : 'User logged out');
      }
      return { ok: true };
    });
  },

  /**
   * ПРОВЕРКА (Task 346): остались ли у пользователя другие сессии.
   * Вызывается из logout ПОСЛЕ удаления строки текущей сессии —
   * «другие» = все оставшиеся строки этого пользователя.
   * Совпадение по user_id ИЛИ email (надёжно и для старых строк, в
   * которых user_id мог остаться пустым из-за бага Task 37).
   *
   * Осознанно НЕ используем Utils.userHasActiveSession: его критерий
   * «активности» неизвестен (возможен TTL по last_heartbeat), а здесь
   * нужен точный инвариант «есть ли строка другой сессии» — по заявке
   * сессии бессрочные. FAIL-SAFE: при любой ошибке возвращаем true —
   * лучше оставить login_status «вход выполнен» (рассинхрон починит
   * самосинхронизация Auth.sendOTP при следующем входе), чем выкинуть
   * живую параллельную сессию.
   *
   * Структура листа sessions (как в SessionsDevicePolicy.gs):
   *   r1–r3 — описание; r4 — заголовки (session_token | user_id |
   *   email | role | created_at | last_heartbeat | device); r5+ —
   *   данные. Строку заголовков ищем динамически по ячейке
   *   «session_token» (первые 10 строк) — на случай другой разметки.
   */
  _userHasOtherSession: function(userId, email) {
    try {
      const sheet = Utils.getSheet('sessions');
      const values = sheet.getDataRange().getValues();

      // Найти строку заголовков (в живой таблице — r4)
      let headerIdx = -1, tokenCol = -1;
      for (let r = 0; r < Math.min(values.length, 10); r++) {
        const row = values[r] || [];
        for (let c = 0; c < row.length; c++) {
          if (String(row[c] || '').trim().toLowerCase() === 'session_token') {
            headerIdx = r;
            tokenCol = c;
            break;
          }
        }
        if (headerIdx !== -1) break;
      }
      if (headerIdx === -1) {
        // Лист не разобрали — НЕ сбрасываем статус (fail-safe)
        return true;
      }

      const header = (values[headerIdx] || []).map(function(h) {
        return String(h || '').trim().toLowerCase();
      });
      const userIdCol = header.indexOf('user_id');
      const emailCol = header.indexOf('email');
      if (userIdCol === -1 && emailCol === -1) {
        return true; // колонок не нашли — НЕ сбрасываем статус (fail-safe)
      }

      const targetId = String(userId === undefined || userId === null ? '' : userId);
      const targetEmail = String(email === undefined || email === null ? '' : email).trim().toLowerCase();
      for (let r = headerIdx + 1; r < values.length; r++) {
        const row = values[r] || [];
        if (!String(row[tokenCol] || '').trim()) continue; // пустая/стилевая строка
        if (userIdCol !== -1 && targetId !== ''
            && String(row[userIdCol]) === targetId) {
          return true; // есть другая сессия этого пользователя
        }
        if (emailCol !== -1 && targetEmail !== ''
            && String(row[emailCol] || '').trim().toLowerCase() === targetEmail) {
          return true; // совпадение по почте (страховка от пустых user_id)
        }
      }
      return false; // других сессий нет — можно сбрасывать login_status
    } catch (err) {
      console.error('[Sessions._userHasOtherSession] ошибка — статус НЕ сбрасываем (fail-safe):', err);
      return true;
    }
  },

  /**
   * Получить данные текущего пользователя по токену.
   * Возвращает: { userId, email, role } или throws.
   *
   * ВАЖНО: вызывается при каждой проверке доступа на клиенте.
   * Сессии НЕ истекают по времени. Logout происходит только если:
   *   - токен не найден в sessions (админ удалил, либо пользователь вышел сам)
   *   - пользователь удалён из users
   *   - роль пользователя изменена на «Запрет»
   *   - login_status !== 'вход выполнен' (админ сбросил вручную)
   */
  getCurrentUser: function(token) {
    if (!token) throw new Error('no_session');

    // Task 348: [чтение сессии → возможные deleteRow (сирота / Запрет /
    // админ-сброс) → возможная правка роли в строке] под замком: чужой
    // deleteRow между чтением и записью сдвигает номера строк —
    // getRange(session.row, 4) и deleteRow(session.row) попали бы в
    // ЧУЖУЮ строку.
    return Utils.withLock(function() {
      const session = Utils.findSessionByToken(token);
      if (!session) throw new Error('no_session');

      // Получить актуальную роль из users (админ мог изменить)
      const user = Utils.findUserById(session.user_id);
      if (!user) {
        // Пользователь удалён из таблицы
        Utils.deleteRow('sessions', session.row);
        throw new Error('no_session');
      }

      // Если роль сменилась — обновить в sessions
      // Task 351: через Utils.setCell — сброс кэша чтений.
      if (user.role !== session.role) {
        Utils.setCell('sessions', session.row, 4, user.role);
      }

      // Если роль «Запрет» — принудительный logout
      if (user.role === 'Запрет') {
        Utils.deleteRow('sessions', session.row);
        Utils.updateUserStatus(user.row, 'вход не выполнен', user.last_login);
        Utils.audit(user.email, 'FORCE_LOGOUT_ROLE', '', '', 'Role changed to Запрет');
        throw new Error('no_session');
      }

      // Если админ сбросил login_status — принудительный logout.
      // Это единственный способ «выгнать» пользователя (помимо смены роли на Запрет
      // и удаления пользователя). Сессия не истекает по времени.
      if (user.login_status !== 'вход выполнен') {
        Utils.deleteRow('sessions', session.row);
        Utils.audit(user.email, 'FORCE_LOGOUT_ADMIN_RESET', '', '',
          'login_status is not "вход выполнен" — admin reset');
        throw new Error('no_session');
      }

      return {
        // ВАЖНО (Task 37 / Task 346): user.ID ЗАГЛАВНЫМИ — заголовок листа
        // users «ID», Utils.getRows() возвращает obj.ID. В живом коде здесь
        // стояло user.id → undefined, клиент кэшировал пустой userId.
        userId: user.ID,
        email: user.email,
        role: user.role
      };
    });
  }
};
