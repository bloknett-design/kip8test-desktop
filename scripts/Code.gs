/**
 * Code.gs — Главный файл маршрутизации HTTP-запросов
 * ============================================================
 * Apps Script Web App для системы доступа PWA КИПиА.
 * Принимает POST/GET запросы от PWA, маршрутизует по действиям.
 *
 * Деплой: Deploy → New deployment → Web app
 *   Execute as: Me (владелец таблицы)
 *   Who has access: Anyone (без авторизации Google)
 *
 * Безопасность: запросы публичные, но защищены логикой
 * (rate limiting, валидация токенов, OTP-коды).
 * ============================================================
 *
 * ВАЖНО: каждый модуль (Auth, Sessions, Admin, CableJournal)
 * принимает индивидуальные параметры, извлечённые из payload.
 * Flowmeter принимает payload целиком и сам извлекает поля.
 *
 * Сигнатуры методов:
 *   Auth.sendOTP(email)                    → результат
 *   Auth.verifyOTP(email, code)            → результат
 *   Sessions.getCurrentUser(token)         → результат
 *   Sessions.heartbeat(token)              → результат
 *   Sessions.logout(token)                 → результат
 *   Admin.listUsers(token)                 → результат
 *   Admin.updateRole(token, userId, newRole) → результат
 *   Admin.resetLogin(token, userId)        → результат
 *   Admin.createUser(token, email, role)   → результат
 *   Admin.listSessions(token)              → результат
 *   Admin.listLogs(token, limit)           → результат
 *   CableJournal.list(token, options)      → результат
 *   CableJournal.getColumns(token)         → результат
 *   CableJournal.getFilters(token)         → результат
 *   CableJournal.appendRow(token, data)    → результат
 *   CableJournal.updateRow(token, row, data) → результат
 *   CableJournal.deleteRow(token, row)     → результат
 *   Flowmeter.list(payload)                → {ok, data/error}
 *   Flowmeter.updateReading(payload)       → {ok, data/error}
 *   FlowmeterArchive.listArchive(payload)  → {ok, data/error}
 * ============================================================
 */

/** URL деплоя (заполните после первого деплоя). */
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbztmOJb_QVnjRk1GnvKe4X1TWcDgPSFVvGJiumm3y5RaGwgEiJX15PBiJVUX9mKJiWHzA/exec';

/**
 * Обработка POST-запросов от PWA.
 * Формат: ?action=NAME в URL, JSON в теле.
 * Возвращает: JSON {ok: true, data: {...}} или {ok: false, error: "..."}
 */
function doPost(e) {
  try {
    const action = (e.parameter.action || '').trim();
    const payload = e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};

    let result;
    switch (action) {

      // === Публичные эндпоинты (для входа) ===
      case 'sendOTP':
        result = Auth.sendOTP(payload.email);
        break;

      case 'verifyOTP':
        result = Auth.verifyOTP(payload.email, payload.code);
        break;

      // === Эндпоинты для авторизованных сессий ===
      case 'getCurrentUser':
        result = Sessions.getCurrentUser(payload.token);
        break;

      case 'heartbeat':
        result = Sessions.heartbeat(payload.token);
        break;

      case 'logout':
        result = Sessions.logout(payload.token);
        break;

      // === Админ-эндпоинты (требуют роль "Админ") ===
      case 'adminListUsers':
        result = Admin.listUsers(payload.token);
        break;

      case 'adminUpdateRole':
        result = Admin.updateRole(payload.token, payload.userId, payload.newRole);
        break;

      case 'adminResetLogin':
        result = Admin.resetLogin(payload.token, payload.userId);
        break;

      case 'adminCreateUser':
        result = Admin.createUser(payload.token, payload.email, payload.role);
        break;

      case 'adminListSessions':
        result = Admin.listSessions(payload.token);
        break;

      case 'adminListLogs':
        result = Admin.listLogs(payload.token, payload.limit || 100);
        break;

      // === Кабельный журнал ===
      case 'cableJournal.list':
        result = CableJournal.list(payload.token, payload.options || {});
        break;

      case 'cableJournal.getColumns':
        result = CableJournal.getColumns(payload.token);
        break;

      case 'cableJournal.getFilters':
        result = CableJournal.getFilters(payload.token);
        break;

      case 'cableJournal.appendRow':
        result = CableJournal.appendRow(payload.token, payload.data || {});
        break;

      case 'cableJournal.updateRow':
        result = CableJournal.updateRow(payload.token, payload.row, payload.data || {});
        break;

      case 'cableJournal.deleteRow':
        result = CableJournal.deleteRow(payload.token, payload.row);
        break;

      // === Расходомеры хозрасчётные (Flowmeter) ===
      // Flowmeter.gs возвращает {ok, data/error} напрямую,
      // поэтому оборачиваем через _json без дополнительной упаковки.
      case 'flowmeter.list':
        return _json(Flowmeter.list(payload));

      case 'flowmeter.updateReading':
        return _json(Flowmeter.updateReading(payload));

      case 'flowmeter.archive':
        return _json(FlowmeterArchive.listArchive(payload));

      default:
        return _json({ ok: false, error: 'Unknown action: ' + action });
    }

    return _json({ ok: true, data: result });

  } catch (err) {
    console.error('doPost error:', err);
    return _json({ ok: false, error: err.message || String(err) });
  }
}

/**
 * Обработка GET-запросов (для проверки, что Web App работает).
 * Откройте URL в браузере — увидите статус.
 */
function doGet(e) {
  return _json({
    ok: true,
    data: {
      service: 'KIP8 Access Control',
      version: '1.0',
      timestamp: new Date().toISOString()
    }
  });
}

/** JSON-ответ с правильным content-type. */
function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Cron-функция: запускать каждый час через Time-driven trigger.
 * См. настройку триггеров в функции setupTriggers() ниже.
 */
function hourlyCleanup() {
  Utils.cleanupExpiredSessions();
  Utils.cleanupExpiredOtpCodes();
  Utils.cleanupOldAuditLogs();
}
