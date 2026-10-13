/**
 * Auth.gs — Логика OTP (генерация, отправка, верификация)
 * ============================================================
 * Task 346 (2026-09-08), патч для параллельных сессий «1 моб + 1 десктоп»:
 *   • УДАЛЕНЫ обе блокировки «С этого аккаунта уже выполнен вход…»
 *     (были в sendOTP и verifyOTP) — по заявке пользователь с одной почты
 *     может ПАРАЛЛЕЛЬНО работать в мобильном И десктопном приложениях.
 *   • Лимит «не больше двух входов, по одному на тип приложения» теперь
 *     обеспечивает SessionsDevicePolicy.gs (≤1 mobile + ≤1 desktop,
 *     вытеснение сессии ТОГО ЖЕ типа при повторном входе).
 *   • verifyOTP принимает 3-й аргумент payload (поле device от клиента)
 *     и возвращает evicted — число вытесненных сессий (для тоста).
 *   • Роутер Code.gs должен вызывать:
 *       Auth.verifyOTP(payload.email, payload.code, payload)
 *   Полный порядок активации — DEPLOY-Task346-sessions-device-policy.md.
 *
 * Task 348 (2026-09-09): в verifyOTP все мутации после проверки кода
 * (markOtpUsed → самосинхронизация → Запрет-чек → createSession →
 * sdpApplyDevicePolicy → login_status='вход выполнен') выполняются
 * под Utils.withLock — атомарно против параллельных верификаций
 * (повторное использование кода, дубль девайс-сессии). sendOTP
 * замка НЕ берёт: письмо отправляется ВНЕ замка (MailApp медленный,
 * иначе все входы встанут в очередь за почтой). Роутер и структура
 * листов НЕ менялись — DEPLOY-Task348-uuid-lockservice.md.
 *
 * Task 349 (2026-09-09): удалён МЁРТВЫЙ per-IP rate limit. Apps Script
 * в doPost не видит IP и User-Agent клиента, поэтому getClientIp()/
 * getClientUserAgent() всегда возвращали '' — ветка «20 неудач/час с
 * одного IP» не срабатывала ни при каких условиях, а колонки ip/
 * user_agent в audit_log всегда пустые. Хелперы удалены из Utils.gs.
 * ЖИВАЯ защита: глобальный лимит 100 OTP/час (RATE_LIMIT_OTP_PER_HOUR)
 * + MAX_OTP_ATTEMPTS/OTP_BLOCK_MINUTES + cooldown. Сигнатура
 * Utils.audit(email, action, ip, ua, details) НЕ менялась — 40+
 * вызовов по всем файлам; 3-й и 4-й аргументы теперь всегда ''.
 *
 * Task 350 (2026-09-09): закрыты последние гонки и дыра двойного
 * submit: 1) verifyOTP — ВСЕ проверки и мутации (включая ПОИСК OTP,
 * истечение, неверный код/инкремент попыток) под ОДНИМ замком, с
 * пере-чтением состояния ВНУТРИ. Замок Task 348 читал otp ДО замка:
 * два параллельных submit одного кода оба видели «unused», второй
 * входил после первого и создавал ВТОРУЮ сессию с одного кода.
 * 2) sendOTP — [самосинхронизация → блокировка → кулдаун → запись
 * OTP] одним замком (раньше кулдаун+appendRow были без замка: два
 * одновременных запроса обходили 60-сек кулдаун — 2 письма, 2 строки);
 * письмо по-прежнему ПОСЛЕ замка (MailApp вне критической секции).
 * Аудит успешного входа перенесён внутрь замка (appendRow дописывает
 * в конец — чужие строки не сдвигает). Роутер Code.gs НЕ менялся —
 * DEPLOY-Task350-locks-cleanup-batch.md.
 *
 * Task 352 (2026-09-09): закрыт мягкий DoS по email (аудит п.5).
 * АТАКА: знающий email жертвы шлёт 5 мусорных verifyOTP → 5 строк
 * OTP_FAILED в audit_log → countRecentOtpFails блокировал sendOTP
 * жертвы «через 30 минут» — и продлевал блок до бесконечности,
 * каждый раз сбрасывая счётчик новыми мусорными запросами (счётчик
 * писался по EMAIL, т.е. контролировался атакующим). ЛЕЧЕНИЕ:
 *   1) sendOTP: email-блок УДАЛЁН (вместе с countRecentOtpFails из
 *      Utils.gs — единственный вызов). Брутфорс останавливает то,
 *      что атакующий НЕ контролирует: MAX_OTP_ATTEMPTS на код
 *      (5/10^6), кулдаун 60 сек, TTL 10 мин, глобальный лимит
 *      100 OTP/час — все остаются;
 *   2) verifyOTP: неверные попытки по-прежнему НЕ сжигают код
 *      (верный код принимается всегда, пока не истёк/не used —
 *      жертва спама входит своим кодом), но после исчерпания
 *      MAX_OTP_ATTEMPTS дальнейшие неверные сабмиты отклоняются
 *      ДЁШЕВО: без инкремента attempts и без строки аудита — спам
 *      по чужому email не раздувает otp_codes/audit_log;
 *   3) ключ OTP_BLOCK_MINUTES больше НЕ читается кодом (строку в
 *      config можно удалить или оставить — безвредно).
 */

const Auth = {

  /**
   * Запросить OTP-код на email.
   * Шаги:
   *   1. Нормализовать email
   *   2. Найти пользователя в users
   *   3. Самосинхронизация login_status (Task 346: отказа «уже вошли» НЕТ)
   *   4. Проверить cooldown (не чаще 60 сек)
   *   5. Проверить rate limit (глобальный 100/час; per-IP удалён в
   *      Task 349 — IP недоступен в GAS)
   *   6. Сгенерировать 6-значный код
   *   7. Записать в otp_codes
   *   8. Отправить письмо через MailApp
   *   9. Записать audit_log
   *
   * ВАЖНО: для несуществующих email возвращаем «код отправлен»,
   * но фактически не отправляем — защита от перебора email.
   */
  sendOTP: function(rawEmail) {
    const email = Utils.normalizeEmail(rawEmail);
    if (!email) {
      throw new Error('Некорректный email');
    }

    // Rate limit: глобально 100 OTP/час. Осознанно ДО замка: грубый
    // глобальный счётчик, дрейф на ±1 при параллельных запросах
    // допустим (а полное чтение audit_log в критической секции —
    // лишнее время под замком).
    const globalCount = Utils.countRecentAuditLogs('OTP_REQUESTED', 60);
    if (globalCount >= Utils.getConfig('RATE_LIMIT_OTP_PER_HOUR', 100)) {
      Utils.audit(email, 'RATE_LIMIT_HIT', '', '', 'Global OTP rate limit');
      throw new Error('Слишком много запросов, попробуйте позже');
    }

    // Task 349: per-IP лимит «20 неудач/час» УДАЛЁН — был мёртвым кодом
    // (getClientIp всегда возвращал '', счётчик всегда 0). Брутфорс
    // конкретного ящика останавливает MAX_OTP_ATTEMPTS — лимит
    // неверных попыток НА КОД (email-блок sendOTP удалён в Task 352
    // как мягкий DoS: счётчик по email писался атакующим).

    // Найти пользователя (fail-fast, БЕЗ замка). Для несуществующего
    // email возвращаем «код отправлен», но не отправляем — защита от
    // перебора email. Логируем как OTP_REQUESTED_NOT_FOUND.
    const user = Utils.findUserByEmail(email);
    if (!user) {
      Utils.audit(email, 'OTP_REQUESTED_NOT_FOUND', '', '', 'Email not in users sheet');
      return { sent: true, message: 'Код отправлен на ' + email };
    }

    // Конфиг-значения (чистые чтения стабильного листа config — вне
    // гонок, читать под замком незачем). Task 352: MAX_OTP_ATTEMPTS
    // здесь больше НЕ читается — лимит неверных попыток проверяет
    // verifyOTP на конкретном коде (email-блок удалён, см. шапку).
    const codeLength = Utils.getConfig('OTP_CODE_LENGTH', 6);
    const ttlMin = Utils.getConfig('OTP_TTL_MINUTES', 10);
    const cooldown = Utils.getConfig('OTP_RESEND_COOLDOWN_SECONDS', 60);

    // ============================================================
    // Task 350: [самосинхронизация → кулдаун → генерация и запись
    // кода] — ОДНИМ замком. Раньше кулдаун-чек и
    // appendRow('otp_codes') были без замки: два ОДНОВРЕМЕННЫХ запроса
    // кода оба проходили кулдаун по ещё не записанной строке (TOCTOU)
    // → 2 письма и 2 строки OTP за 60 сек. Самосинхронизация тоже
    // была мутацией без замка, и юзер читался снаружи — параллельный
    // resetLogin мог сменить login_status между чтением и записью;
    // теперь юзер ПЕРЕЧИТЫВАЕТСЯ внутри замка (заодно гард удаления).
    // Письмо (MailApp) — ПОСЛЕ замка: медленная отправка не должна
    // ставить все входы в очередь за почтой (правило Task 348 №1).
    // ============================================================
    const otpPrepared = Utils.withLock(function() {
      // Юзер мог быть удалён между пред-проверкой и замком.
      let user2 = Utils.findUserByEmail(email);
      if (!user2) {
        return { notFound: true };
      }

      // Task 346: БЛОКИРОВКА «уже выполнен вход» УДАЛЕНА (заявка: с одной
      // почты — параллельная работа в мобильном И десктопном приложении;
      // запрета с формулировкой «пользователь уже вошел» быть не должно).
      // Лимит входов (не больше двух, по одному на тип приложения)
      // применяет SessionsDevicePolicy.gs в verifyOTP при создании сессии.
      //
      // Оставлена только САМОСИНХРОНИЗАЦИЯ login_status: статус может
      // рассинхронизироваться с реальным состоянием sessions:
      //   1. Hourly cleanup удалил сессию, но не сбросил login_status.
      //   2. Сессия истекла по TTL и удалена через getCurrentUser, но сброс
      //      login_status не сработал.
      //   3. Токен в браузере не находится в sessions (удалён админом или
      //      ручная правка таблицы).
      //   4. Cleanup ещё не запускался (он раз в час), а сессия уже не активна.
      // Если активных (не истёкших по TTL) сессий нет — сбросить login_status
      // и продолжить вход. Если есть — НЕ блокируем: это параллельный вход в
      // другое приложение, политику применит verifyOTP.
      if (user2.login_status === 'вход выполнен'
          && !Utils.userHasActiveSession(user2.ID)) {
        Utils.updateUserStatus(user2.row, 'вход не выполнен', user2.last_login);
        Utils.audit(email, 'LOGIN_STATUS_AUTO_RESET', '', '',
          'login_status was "вход выполнен" but no active session found — auto-reset');
        // Перечитать пользователя, чтобы дальше работать со свежим состоянием.
        user2 = Utils.findUserByEmail(email);
      }

      // Task 352: email-блокировка «после MAX_OTP_ATTEMPTS неудач»
      // УДАЛЁНА — была мягким DoS: счётчик OTP_FAILED по email писался
      // ЛЮБЫМ, знающим адрес жертвы, и блокировал ей sendOTP на 30 мин
      // (продлеваемо до бесконечности). Брутфорс кода останавливает
      // лимит попыток в verifyOTP — на самОм коде, который атакующий
      // не контролирует. Здесь остаётся только кулдаун (ниже).

      // Cooldown: не чаще 60 сек (чтение и запись в ОДНОЙ критической
      // секции — параллельный запрос увидит уже записанную строку)
      const lastOtp = Utils.getLastOtpForEmail(email);
      if (lastOtp && (Date.now() - lastOtp.created_at.getTime()) / 1000 < cooldown) {
        const waitSec = Math.ceil(cooldown - (Date.now() - lastOtp.created_at.getTime()) / 1000);
        return { cooldown: waitSec };
      }

      // Сгенерировать код и записать в otp_codes — атомарно с кулдауном
      const code = Utils.generateNumericCode(codeLength);
      const now = new Date();
      const expires = new Date(now.getTime() + ttlMin * 60 * 1000);
      Utils.appendRow('otp_codes', [email, code, now, expires, 'FALSE', 0]);
      return { code: code, now: now };
    });

    // Обработка результатов замка (бросаем ЗА пределами замка —
    // критическая секция уже завершена)
    if (otpPrepared.notFound) {
      Utils.audit(email, 'OTP_REQUESTED_NOT_FOUND', '', '', 'User deleted during OTP request');
      return { sent: true, message: 'Код отправлен на ' + email };
    }
    if (otpPrepared.cooldown) {
      throw new Error('Подождите ' + otpPrepared.cooldown + ' сек перед повторным запросом кода');
    }
    const code = otpPrepared.code;
    const now = otpPrepared.now;

    // Отправить письмо.
    // ВАЖНО: Mail.ru (bk.ru, mail.ru, inbox.ru, list.ru) и Яндекс.Почта
    // агрессивно фильтруют письма от Apps Script. Чтобы повысить
    // доставляемость:
    //   • HTML body с inline-стилями (почтовики считают легитимным)
    //   • Карточка с крупным кодом (не «голое число» — снижает spam score)
    //   • НЕ используем noReply:true (noreply-отправители понижаются)
    //   • replyTo с реальным адресом поддержки (из config или владелец скрипта)
    //   • Развёрнутый текст (контекст + время + что делать если не запрашивали)
    const subject = 'Код доступа к КИПиА: ' + code;
    const requestTime = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss z');
    const supportEmail = Utils.getConfig('SUPPORT_REPLY_TO', '') || '';

    // Plain-text fallback (для почтовиков без HTML, и для превью).
    const textBody = [
      'КИПиА — система доступа',
      '',
      'Ваш одноразовый код: ' + code,
      '',
      'Код действителен ' + ttlMin + ' минут.',
      'Запрошен: ' + requestTime + '.',
      '',
      'Если вы не запрашивали этот код — просто проигнорируйте письмо.',
      'Никому не сообщайте этот код, даже если представляются поддержкой.',
      '',
      '— Система доступа КИПиА'
    ].join('\n');

    // HTML body с карточкой.
    const htmlBody = ''
      + '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
      + '</head><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,\'Helvetica Neue\',Arial,sans-serif;color:#1a2233;">'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">'
      + '<tr><td align="center">'
      + '<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);overflow:hidden;">'
      // Шапка
      + '<tr><td style="background:#1a2233;padding:20px 28px;">'
      + '<div style="font-size:16px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">КИПиА — система доступа</div>'
      + '<div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px;">Одноразовый код для входа</div>'
      + '</td></tr>'
      // Тело
      + '<tr><td style="padding:28px;">'
      + '<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#3a4a5e;">Здравствуйте! Вы запросили код для входа в приложение «КИПиА». Используйте указанный ниже код в форме ввода:</p>'
      // Карточка с кодом
      + '<div style="background:#f0f4f8;border:1px dashed #4a8fc7;border-radius:10px;padding:20px 16px;text-align:center;margin:0 0 20px;">'
      + '<div style="font-size:11px;color:#7a8a9e;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Ваш код</div>'
      + '<div style="font-size:34px;font-weight:700;color:#1a2233;letter-spacing:6px;font-family:\'Courier New\',monospace;">' + code + '</div>'
      + '<div style="font-size:12px;color:#7a8a9e;margin-top:10px;">Действителен ' + ttlMin + ' минут</div>'
      + '</div>'
      // Детали запроса
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;color:#5a6a7e;margin-bottom:20px;">'
      + '<tr><td style="padding:3px 0;color:#9aa8b8;">Запрошен:</td><td style="padding:3px 0;text-align:right;color:#3a4a5e;font-weight:500;">' + requestTime + '</td></tr>'
      + '<tr><td style="padding:3px 0;color:#9aa8b8;">Для email:</td><td style="padding:3px 0;text-align:right;color:#3a4a5e;font-weight:500;">' + email + '</td></tr>'
      + '</table>'
      // Предупреждение
      + '<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#5a6a7e;border-left:3px solid #c7964a;padding-left:12px;">Если вы не запрашивали этот код — просто проигнорируйте письмо. <strong style="color:#1a2233;">Никому не сообщайте этот код</strong>, даже если представляются поддержкой.</p>'
      + '</td></tr>'
      // Подвал
      + '<tr><td style="background:#fafbfc;border-top:1px solid #e8ebf0;padding:16px 28px;">'
      + '<div style="font-size:11px;color:#9aa8b8;line-height:1.5;">Это автоматическое письмо от системы доступа КИПиА. Не отвечайте на него напрямую.'
      + (supportEmail ? ' По вопросам обращайтесь: <a href="mailto:' + supportEmail + '" style="color:#4a8fc7;">' + supportEmail + '</a>.' : '')
      + '</div>'
      + '</td></tr>'
      + '</table>'
      + '</td></tr></table>'
      + '</body></html>';

    const mailOptions = {
      name: 'КИПиА — система доступа',
      htmlBody: htmlBody,
      // noReply убран намеренно: noreply-отправители понижаются в спам-фильтрах Mail.ru/Яндекса.
    };
    if (supportEmail) {
      mailOptions.replyTo = supportEmail;
    }

    try {
      MailApp.sendEmail(email, subject, textBody, mailOptions);
    } catch (e) {
      console.error('MailApp.sendEmail failed:', e);
      Utils.audit(email, 'OTP_SEND_FAILED', '', '', e.message);
      throw new Error('Не удалось отправить письмо. Попробуйте позже.');
    }

    Utils.audit(email, 'OTP_REQUESTED', '', '', 'OTP code sent');

    return { sent: true, message: 'Код отправлен на ' + email };
  },

  /**
   * Верифицировать OTP-код и создать сессию.
   * Возвращает: { token, role, userId, email, evicted }
   *
   * Task 346: 3-й аргумент payload — объект запроса (клиент шлёт поле
   * device: 'mobile' | 'desktop'; старые клиенты без поля — политика
   * пропускается). evicted > 0 — вытеснена прежняя сессия ТОГО ЖЕ типа
   * устройства (клиент показывает тост «Прежний вход в … приложении
   * завершён»). Роутер Code.gs: Auth.verifyOTP(payload.email, payload.code, payload).
   */
  verifyOTP: function(rawEmail, code, payload) {
    const email = Utils.normalizeEmail(rawEmail);
    if (!email) {
      throw new Error('Некорректный email');
    }
    if (!code || !/^\d{4,8}$/.test(String(code))) {
      throw new Error('Некорректный код');
    }

    // Пред-проверка юзера (fail-fast, БЕЗ замка: чтение + аудит-append,
    // мутаций со сдвигом строк нет). Для несуществующего — то же
    // сообщение, что и для неверного кода (не раскрываем перебор).
    const user = Utils.findUserByEmail(email);
    if (!user) {
      Utils.audit(email, 'OTP_FAILED', '', '', 'User not found');
      throw new Error('Неверный код');
    }

    // Task 346: тип устройства из payload для политики сессий.
    const t346device = (payload && payload.device) ? String(payload.device).toLowerCase() : '';
    let t346evicted = 0;

    // ============================================================
    // Task 350: ВСЕ проверки и мутации верификации — ОДНИМ замком, с
    // ПЕРЕ-ЧТЕНИЕМ состояния ВНУТРИ. Замок Task 348 оберегал мутации,
    // но OTP читался ДО замка — две дыры:
    //   1) два параллельных submit ОДНОГО кода оба видели «unused»
    //      (внешнее чтение), второй входил в замок после первого и
    //      создавал ВТОРУЮ сессию с одного кода — двойной вход НЕ
    //      блокировался, вопреки замыслу Task 348;
    //   2) otp.row из внешнего чтения мог устареть: часовая чистка
    //      otp_codes удаляет строки → номера съезжают → markOtpUsed/
    //      инкремент попыток писали бы в ЧУЖУЮ строку.
    // Теперь getActiveOtpForEmail вызывается ТОЛЬКО внутри замка.
    // Замок НЕ реентерабелен: Sessions.createSession и
    // sdpApplyDevicePolicy своих замков НЕ берут (см. Sessions.gs).
    // ============================================================
    return Utils.withLock(function() {
      // Найти активный OTP для этого email — ВНУТРИ замка (см. выше)
      const otp = Utils.getActiveOtpForEmail(email);
      if (!otp) {
        Utils.audit(email, 'OTP_FAILED', '', '', 'No active OTP');
        throw new Error('Код не найден или истёк. Запросите новый.');
      }

      // Проверить истечение
      if (otp.expires_at.getTime() < Date.now()) {
        Utils.markOtpUsed(otp.row);
        Utils.audit(email, 'OTP_FAILED', '', '', 'Code expired');
        throw new Error('Код истёк. Запросите новый.');
      }

      // Проверить код. Task 350: incrementOtpAttempts вызывается ПОД
      // замком и возвращает НОВОЕ значение счётчика — «прочитал →
      // записал attempts+1» атомарно (раньше значение считалось из
      // внешнего чтения: параллельные неудачи терялись).
      //
      // Task 352 (анти-DoS): неверные попытки НЕ сжигают код — верный
      // код принимается ВСЕГДА, пока не истёк и не использован (жертва
      // спама входит своим кодом). После исчерпания MAX_OTP_ATTEMPTS
      // дальнейшие неверные сабмиты отклоняются ДЁШЕВО — без
      // инкремента и без строки аудита (спам не раздувает листы).
      if (String(otp.code) !== String(code)) {
        const max = Utils.getConfig('MAX_OTP_ATTEMPTS', 5);
        if (Number(otp.attempts || 0) >= max) {
          // Лимит для ЭТОГО кода уже исчерпан — дешёвый отказ (без
          // мутаций). Сообщение то же, что при исчерпании: единый UX,
          // атакующий не отличим от неуклюжего юзера и ничего не
          // узнаёт о состоянии кода.
          throw new Error('Неверный код. Превышен лимит попыток для этого кода. Запросите новый.');
        }
        const attempts = Utils.incrementOtpAttempts(otp.row);
        Utils.audit(email, 'OTP_FAILED', '', '', 'Wrong code, attempt ' + attempts + '/' + max);
        if (attempts >= max) {
          throw new Error('Неверный код. Превышен лимит попыток для этого кода. Запросите новый.');
        }
        throw new Error('Неверный код. Осталось попыток: ' + (max - attempts));
      }

      // Код верный — пометить как использованный ПЕРВЫМ действием:
      // повторный submit того же кода при пере-чтении выше увидит
      // «used» и не создаст вторую сессию (Task 350).
      Utils.markOtpUsed(otp.row);

      // Перечитать пользователя: между пред-проверкой и замком могли
      // войти другие / смениться роль / статус / юзер удалён.
      // Task 346: блокировка «уже выполнен вход» УДАЛЕНА — осталась
      // только самосинхронизация login_status при отсутствии активных
      // сессий.
      let freshUser = Utils.findUserByEmail(email);
      if (!freshUser) {
        // Юзер удалён из users между пред-проверкой и замком (раньше
        // здесь был бы TypeError на null)
        Utils.audit(email, 'OTP_FAILED', '', '', 'User deleted during verification');
        throw new Error('Неверный код');
      }
      if (freshUser.login_status === 'вход выполнен'
          && !Utils.userHasActiveSession(freshUser.ID)) {
        Utils.updateUserStatus(freshUser.row, 'вход не выполнен', freshUser.last_login);
        Utils.audit(email, 'LOGIN_STATUS_AUTO_RESET', '', '',
          'login_status was "вход выполнен" but no active session — auto-reset (during verify)');
        freshUser = Utils.findUserByEmail(email);
      }

      // Проверить, что роль не «Запрет»
      if (freshUser.role === 'Запрет') {
        Utils.audit(email, 'LOGIN_BLOCKED_ROLE', '', '', 'Role: Запрет');
        throw new Error('Доступ запрещён. Обратитесь к администратору.');
      }

      // Создать сессию
      const session = Sessions.createSession(freshUser);

      // Task 346: политика «1 моб + 1 десктоп» (SessionsDevicePolicy.gs):
      // записать device в строку новой сессии и вытеснить (удалить) все
      // ДРУГИЕ сессии этой почты с ТЕМ ЖЕ типом устройства. Инвариант:
      // ≤1 mobile + ≤1 desktop = не больше двух входов; вход в «другое»
      // приложение всегда разрешён. FAIL-OPEN: ошибки политики не блокируют
      // вход; старые клиенты без device — политика пропускается.
      if (typeof sdpApplyDevicePolicy === 'function') {
        const t346policy = sdpApplyDevicePolicy(email, t346device, session.token);
        if (t346policy && t346policy.evicted) {
          t346evicted = t346policy.evicted;
        }
      } else {
        // SessionsDevicePolicy.gs ещё не добавлен в проект (Шаг 1 DEPLOY) —
        // вход работает как раньше, без лимитов.
        console.warn('Task 346: sdpApplyDevicePolicy не найдена — SessionsDevicePolicy.gs не подключён?');
      }

      // Обновить users: login_status + last_login
      Utils.updateUserStatus(freshUser.row, 'вход выполнен', new Date());

      // Аудит — внутри замка (Task 350): appendRow дописывает в КОНЕЦ
      // листа и НЕ сдвигает чужие строки (гонки нет), а выносить его
      // наружу при throw-путях сложнее, чем оставить здесь.
      Utils.audit(email, 'OTP_VERIFIED', '', '', 'Role: ' + freshUser.role);
      Utils.audit(email, 'LOGIN_SUCCESS', '', '',
          'Session created' + (t346device ? ', device: ' + t346device : '')
          + (t346evicted ? ', evicted: ' + t346evicted : ''));

      // ВАЖНО (Task 37): используем freshUser.ID (ЗАГЛАВНЫЕ), а НЕ freshUser.id.
      // Заголовок в листе users — "ID", поэтому Utils.getRows() возвращает obj.ID.
      // Если написать freshUser.id — будет undefined, клиент сохранит userId=''
      // в localStorage, а сессия в БД уже корректна (см. Sessions.createSession).
      return {
        token: session.token,
        role: freshUser.role,
        userId: freshUser.ID,
        email: email,
        // Task 346: >0 — прежний вход ТОГО ЖЕ типа устройства вытеснен
        // (клиент показывает тост; старым клиентам поле безвредно).
        evicted: t346evicted
      };
    });
  }
};
