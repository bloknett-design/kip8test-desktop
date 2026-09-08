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
 *   Auth.verifyOTP(email, code, payload)   → результат (Task 346: payload.device)
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
 *   Flowmeter.setComment(payload)          → {ok, data/error}  // Task 195
 *   FlowmeterArchive.listArchive(payload)  → {ok, data/error}
 *   RoleMatrixGate (Task 295):
 *     getMyAccess(token) → {userId, email, role, roleId, isAdmin,
 *                           permissions, granted, warnings}
 *     Гейт GATE_ACTIONS: admin* → admin.panel, каб. журнал (записи)
 *     → cablejournal.edit — по матрице KIP8_Access (до модуля).
 * ============================================================
 */

/** URL деплоя (заполните после первого деплоя). */
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyt2sjbJ8xT5UPKDlYj4q-CV-5pH_Yrv5COrg0PIpp92snpQULUNtJC__pMnQ0h6feNlA/exec'; // Task 284: актуальное развёртывание (см. index.html)

// ==========================================================================
// Task 295 (Этап 3): серверный шлюз прав по МАТРИЦЕ KIP8_Access.
// Действие → требуемое право (perm_id из листа matrix). Проверка
// выполняется ДО вызова модуля (rmRequirePerm из RoleMatrixGate.gs).
// Гейтится только то, что НЕ проверяется внутри модулей репо
// (Flowmeter/WorkSchedule проверяют матрицу сами внутри
// _requireRead/_requireEdit/_requireWrite), — админ-действия и
// записи в кабельный журнал (модули Admin/CableJournal в репо
// отсутствуют, их внутренние проверки заменить нельзя).
// Чтения (cableJournal.list и т.п.) не гейтятся — доступ к данным
// фильтруется внутри самих модулей, как и раньше.
// ЗАЩИТА ОТ ЧАСТИЧНОГО ДЕПЛОЯ: если RoleMatrixGate.gs не вставлен в
// проект, проверки пропускаются (legacy-режим, как до Этапа 3), в
// консоль пишется однократное предупреждение.
// ==========================================================================
const GATE_ACTIONS = {
  // Админ-панель: всё администрирование (пользователи, сессии, логи)
  'adminListUsers':     'admin.panel',
  'adminUpdateRole':    'admin.panel',
  'adminResetLogin':    'admin.panel',
  'adminCreateUser':    'admin.panel',
  'adminListSessions':  'admin.panel',
  'adminListLogs':      'admin.panel',
  // Кабельный журнал — записи (чтение не гейтится, см. выше)
  'cableJournal.appendRow': 'cablejournal.edit',
  'cableJournal.updateRow': 'cablejournal.edit',
  'cableJournal.deleteRow': 'cablejournal.edit'
};

/** Однократное (за выполнение) предупреждение о пропущенном гейте. */
var _gateLegacyWarned = false;

function _gateLegacyWarn(action) {
  if (_gateLegacyWarned) return;
  _gateLegacyWarned = true;
  console.error('[Code.gs] RoleMatrixGate.gs не задеплоен — проверка прав ' +
    'для «' + action + '» и других гейтов ПРОПУЩЕНА (legacy-режим). ' +
    'Вставьте RoleMatrix.gs + RoleMatrixGate.gs в проект и сделайте новый деплой.');
}

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

    // === Task 295: гейт прав по матрице (до вызова модуля) ===
    const requiredPerm = GATE_ACTIONS[action];
    if (requiredPerm) {
      if (typeof rmRequirePerm === 'function') {
        const gate = rmRequirePerm(payload.token, requiredPerm, action);
        if (!gate.ok) {
          return _json({ ok: false, error: gate.error }); // no_session | access_denied
        }
      } else {
        _gateLegacyWarn(action); // частичный деплой — работаем как раньше
      }
    }

    let result;
    switch (action) {

      // === Публичные эндпоинты (для входа) ===
      case 'sendOTP':
        result = Auth.sendOTP(payload.email);
        break;

      case 'verifyOTP':
        // Task 346: payload 3-м аргументом — поле device для политики
        // сессий «1 моб + 1 десктоп» (SessionsDevicePolicy.gs).
        result = Auth.verifyOTP(payload.email, payload.code, payload);
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

      // === Task 295: карта прав текущего пользователя из МАТРИЦЫ ===
      // (для клиента; невалидный токен → {ok:false, error:'no_session'})
      case 'getMyAccess':
        if (typeof rmGetMyAccess !== 'function') {
          throw new Error('RoleMatrixGate.gs не задеплоен (getMyAccess недоступен)');
        }
        result = rmGetMyAccess(payload.token);
        break;

      // === Админ-эндпоинты (гейт Task 295: право admin.panel) ===
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

      // Task 286: ввод «расход за неделю/месяц» (Хозрасчёт №1) — только архив.
      // Отдельный маршрут (не updateReading) — чтобы СТАРЫЙ сервер без
      // поддержки типов записей возвращал «Unknown action» и НИЧЕГО не писал,
      // а не трактовал недельный агрегат как суточные показания (это
      // испортило бы meters-строку). payload.entryType='неделя'|'месяц'
      // уже задан клиентом → Flowmeter.updateReading ветвится в
      // _writePeriodEntry (meters-строка не трогается, soft-валидация
      // пропускается). Ответ: {ok, data:{id, entryType}}.
      case 'flowmeter.updatePeriodReading':
        return _json(Flowmeter.updateReading(payload));

      // Task 195: комментарий к последним показаниям (только автор показаний)
      case 'flowmeter.setComment':
        return _json(Flowmeter.setComment(payload));

      case 'flowmeter.archive':
        return _json(FlowmeterArchive.listArchive(payload));

      // Task 199: правила валидации показаний (для админ-панели и
      // для клиента — preload перед открытием карточки ввода)
      case 'flowmeter.getValidationRules':
        return _json(ValidationRules.listRules(payload));

      // Task 200: последние записи архива всех счётчиков за N дней
      // (для клиента — WRONG_METER проверка перед показом модалки)
      case 'flowmeter.getRecentAllMeters':
        return _json(FlowmeterArchive.listRecentAllMeters(payload));

      // Task 222: карта кодов правил аномалий → текстовые описания
      // (для отображения в столбце «⚠ Замечания» хронологии показаний)
      case 'flowmeter.getValidationHelp':
        return _json(ValidationRules.listHelp(payload));

      // === График работы персонала (WorkSchedule) ===
      // WorkSchedule.gs возвращает {ok, data/error} напрямую,
      // поэтому оборачиваем через _json без дополнительной упаковки.
      case 'workSchedule.getStatusCodes':
        return _json(WorkSchedule.getStatusCodes(payload));

      case 'workSchedule.getPatterns':
        return _json(WorkSchedule.getPatterns(payload));

      case 'workSchedule.listEmployees':
        return _json(WorkSchedule.listEmployees(payload));

      case 'workSchedule.listEntries':
        return _json(WorkSchedule.listEntries(payload));

      case 'workSchedule.listTrainings':
        return _json(WorkSchedule.listTrainings(payload));

      case 'workSchedule.generateMonth':
        return _json(WorkSchedule.generateMonth(payload));

      case 'workSchedule.setManualEntry':
        return _json(WorkSchedule.setManualEntry(payload));

      case 'workSchedule.deleteEntry':
        return _json(WorkSchedule.deleteEntry(payload));

      case 'workSchedule.addEmployee':
        return _json(WorkSchedule.addEmployee(payload));

      // Task 318: увольнение — дата_увольнения (H) + в_архиве=1 (I)
      // в таблице «Сотрудники»; строка остаётся в листе как архив
      case 'workSchedule.dismissEmployee':
        return _json(WorkSchedule.dismissEmployee(payload));

      case 'workSchedule.addTraining':
        return _json(WorkSchedule.addTraining(payload));

      case 'workSchedule.deleteTraining':
        return _json(WorkSchedule.deleteTraining(payload));

      // Task 274: отпуска — план периодов (лист «Отпуска» таблицы
      // табель_КИП_ИОС), автоматическая расстановка «О» в шахматке
      case 'workSchedule.listVacations':
        return _json(WorkSchedule.listVacations(payload));

      case 'workSchedule.addVacation':
        return _json(WorkSchedule.addVacation(payload));

      case 'workSchedule.deleteVacation':
        return _json(WorkSchedule.deleteVacation(payload));

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
 * Триггер создаётся функцией setupTriggers() ниже — запустите её один раз
 * вручную в Apps Script Editor после первого деплоя (Editor → выберите
 * setupTriggers в выпадающем списке функций → Run → авторизуйтесь).
 * После этого функция идемпотентна: повторные запуски сначала удалят старые
 * триггеры hourlyCleanup, потом создадут новый — без дубликатов.
 */
function hourlyCleanup() {
  Utils.cleanupExpiredSessions();
  Utils.cleanupExpiredOtpCodes();
  Utils.cleanupOldAuditLogs();
  // Task 347: чистка «заброшенных» строк sessions (last_heartbeat старше
  // STALE_SESSION_DAYS дней, по умолчанию 30) — см. scripts/Utils.gs.
  Utils.cleanupStaleSessions();
}

/**
 * setupTriggers() — разовое создание time-driven триггера.
 *
 * Порядок действий:
 *   1. Открыть Apps Script Editor (там, где размешён этот Code.gs)
 *   2. В выпадающем списке функций вверху выбрать «setupTriggers»
 *   3. Нажать Run (▶)
 *   4. При первом запуске Google попросит авторизацию:
 *      Review permissions → выбрать аккаунт → Advanced →
 *      Go to project (unsafe) → Allow
 *   5. В Executions (Ctrl+Enter / левое меню ▶) должно появиться:
 *      «Создан триггер hourlyCleanup (раз в час), удалено старых: N»
 *   6. Проверить: левое меню Triggers (иконка часов) →
 *      должен быть виден триггер hourlyCleanup, повтор «Every 1 hour»
 *
 * Идемпотентность: перед созданием удаляются все существующие триггеры
 * с тем же именем handler-функции — повторные запуски безопасны.
 */
function setupTriggers() {
  // 1. Удаляем старые триггеры hourlyCleanup, чтобы не дублировались
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    var t = triggers[i];
    if (t.getHandlerFunction() === 'hourlyCleanup') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  }
  if (removed > 0) {
    console.log('Удалено старых триггеров hourlyCleanup: ' + removed);
  }

  // 2. Создаём новый — раз в час
  ScriptApp.newTrigger('hourlyCleanup')
    .timeBased()
    .everyHours(1)
    .create();

  console.log('Создан триггер hourlyCleanup (раз в час)');
}
