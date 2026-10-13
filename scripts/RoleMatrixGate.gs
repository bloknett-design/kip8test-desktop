/**
 * RoleMatrixGate.gs — ЦЕНТРАЛЬНЫЙ СЕРВЕРНЫЙ ШЛЮЗ ПРАВ (Этап 3, Task 295).
 *
 * Единая точка проверки «токен сессии → есть ли право» по МАТРИЦЕ
 * доступа из таблицы KIP8_Access (лист matrix, Task 293). Матрица —
 * единственный источник истины: правка галочки в таблице меняет
 * права на сервере (кэш ≤5 минут, см. RoleMatrix.gs).
 *
 * ЧТО МЕНЯЕТСЯ для захардкоженных списков ролей:
 *   Flowmeter.gs   READ_ROLES/INPUT_ROLES  → flowmeter.view / flowmeter.input
 *   WorkSchedule.gs READ_ROLES/WRITE_ROLES → workschedule.view / workschedule.edit
 *   Code.gs        admin* / каб. журнал    → admin.panel / cablejournal.edit
 * Отдельно задокументированные изменения против старых списков
 * (осознанные решения в матрице, Task 293):
 *   · «ИТР8 pro»  получает ПРОСМОТР графика работы (workschedule.view;
 *     ранее Task 204 — только Админ);
 *   · «ИТР ИОС»   получает ВВОД показаний расходомеров (flowmeter.input;
 *     ранее INPUT_ROLES = дежурный + Админ).
 *
 * КОНТРАКТ (совпадает с Utils в существующих модулях):
 *   Utils.findSessionByToken(token) → session | null
 *   Utils.findUserById(session.user_id) → user { email, role, … } | null
 *
 * ПРИНЦИПЫ:
 *   · FAIL-CLOSED: матрица недоступна/роль не найдена/право снято →
 *     отказ. Роль, которой нет в matrix, не проходит НИКУДА.
 *   · Никогда не бросает исключений (возвращает {ok:false,error}).
 *   · Каждый отказ пишется в audit_log (Utils.audit, best-effort)
 *     кодом RM_ACCESS_DENIED — видно в админ-панели «Логи».
 *   · Legacy-запас: если файл не задеплоен (typeof rmRequirePerm !==
 *     'function'), вызывающие модули уходят в прежние списки ролей —
 *     сайт продолжает работать как до Этапа 3 (в консоль пишется
 *     предупреждение). Это защита от частичного деплоя.
 *
 * ПУБЛИЧНЫЕ ФУНКЦИИ:
 *   rmResolveUserByToken(token)  → {ok, error, user, session}
 *   rmRequirePerm(token, permId, context) → {ok, user, access}
 *                                        | {ok:false, error:'no_session'|'access_denied'}
 *   rmGetMyAccess(token)         → данные прав для клиента (бросает
 *                                  Error('no_session') при невалидном
 *                                  токене — конвенция doPost)
 *   rmGateStatus()               — диагностика шлюза (запускать в
 *                                  редакторе; ничего не меняет)
 *
 * ТРЕБУЕТ: RoleMatrix.gs (Task 294) в том же проекте Apps Script.
 */

// ==========================================================================
// НАСТРОЙКИ
// ==========================================================================

// Код события в audit_log при отказе в праве.
var RMG_AUDIT_CODE = 'RM_ACCESS_DENIED';

// ==========================================================================
// РЕЗОЛВ ПОЛЬЗОВАТЕЛЯ ПО ТОКЕНУ
// ==========================================================================

/**
 * Токен сессии → пользователь (через Utils, как в WorkSchedule.gs).
 * НИКОГДА не бросает исключений.
 *
 * @param {string} token токен сессии из клиента.
 * @return {{ok:boolean, error:string, user:Object, session:Object}}
 */
function rmResolveUserByToken(token) {
  var out = { ok: false, error: '', user: null, session: null };
  if (!token) { out.error = 'no_session'; return out; }
  if (typeof Utils === 'undefined' || typeof Utils.findSessionByToken !== 'function') {
    out.error = 'no_session';
    _rmgErr('Utils не найден — невозможно проверить сессию (fail-closed)');
    return out;
  }
  try {
    var session = Utils.findSessionByToken(token);
    if (!session) { out.error = 'no_session'; return out; }
    var user = Utils.findUserById(session.user_id);
    if (!user || !user.email || !user.role) { out.error = 'no_session'; return out; }
    out.ok = true;
    out.session = session;
    out.user = user;
    return out;
  } catch (e) {
    out.error = 'no_session';
    _rmgErr('Ошибка резолва сессии: ' + e);
    return out;
  }
}

// ==========================================================================
// ЦЕНТРАЛЬНЫЙ ГЕЙТ
// ==========================================================================

/**
 * Проверка права для сессии. ЕДИНАЯ точка входа для всех модулей.
 * НИКОГДА не бросает исключений.
 *
 * @param {string} token токен сессии.
 * @param {string} permId право из матрицы ('flowmeter.input', …).
 * @param {string=} context метка действия для аудита ('adminListUsers',
 *        'WorkSchedule.generateMonth' — что было запрещено).
 * @return {{ok:boolean, error:string, user:Object, access:Object}}
 *         ok:false + error:'no_session'   — сессия не найдена/истекла;
 *         ok:false + error:'access_denied' — права нет ИЛИ матрица
 *         недоступна ИЛИ роль не найдена (fail-closed, см. audit_log).
 */
function rmRequirePerm(token, permId, context) {
  var r = rmResolveUserByToken(token);
  if (!r.ok) { return { ok: false, error: r.error, user: null, access: null }; }
  var user = r.user;

  var perm = String(permId === null || permId === undefined ? '' : permId).replace(/^\s+|\s+$/g, '');
  if (!perm) {
    _rmgAudit(user, '', context, 'право не указано (ошибка конфигурации)');
    return { ok: false, error: 'access_denied', user: user, access: null };
  }

  var access = null;
  try {
    access = roleMatrixGetAccess(user.role);
  } catch (e) {
    access = null;
    _rmgErr('RoleMatrix.gs недоступен/бросил исключение: ' + e + ' — доступ закрыт (fail-closed)');
  }
  if (!access || !access.found || !access.permissions) {
    _rmgAudit(user, perm, context,
      'матрица недоступна или роль «' + user.role + '» не найдена (fail-closed)');
    return { ok: false, error: 'access_denied', user: user, access: access };
  }
  if (access.permissions[perm] !== true) {
    _rmgAudit(user, perm, context, 'нет права');
    return { ok: false, error: 'access_denied', user: user, access: access };
  }
  return { ok: true, error: '', user: user, access: access };
}

// ==========================================================================
// ДАННЫЕ ПРАВ ДЛЯ КЛИЕНТА (Этап 4 подготовлен)
// ==========================================================================

/**
 * Полная карта прав текущего пользователя — для клиента (будет
 * вызываться после входа, action 'getMyAccess'). При невалидном
 * токене БРОСАЕТ Error('no_session') — конвенция doPost, клиент
 * уходит в handleSessionExpired. Роль/права берутся из матрицы:
 * поле found=false или пустой permissions означает fail-closed
 * (клиент обязан закрыть всё, warnings поясняют причину).
 *
 * @param {string} token токен сессии.
 * @return {{userId, email, role, roleId, found, isAdmin,
 *           permissions:Object, granted:string[], warnings:string[]}}
 */
function rmGetMyAccess(token) {
  var r = rmResolveUserByToken(token);
  if (!r.ok) { throw new Error(r.error || 'no_session'); }
  var user = r.user;

  var access = null;
  try {
    access = roleMatrixGetAccess(user.role);
  } catch (e) {
    access = null;
    _rmgErr('RoleMatrix.gs недоступен/бросил исключение: ' + e);
  }
  if (!access) {
    access = { roleId: '', found: false, isAdmin: false,
               permissions: {}, granted: [], warnings: ['матрица недоступна'] };
  }

  return {
    userId: _rmgUserId(user),
    email: user.email,
    role: user.role,
    roleId: access.roleId || '',
    found: access.found === true,
    isAdmin: access.isAdmin === true,
    permissions: access.permissions || {},
    granted: access.granted || [],
    warnings: access.warnings || []
  };
}

// ==========================================================================
// ДИАГНОСТИКА
// ==========================================================================

/**
 * Состояние шлюза: наличие зависимостей + сводка «роль × ключевое
 * право» по матрице. Запускать в редакторе Apps Script — в журнал
 * попадает таблица, по которой видно, кого сервер пускает.
 */
function rmGateStatus() {
  var lines = ['=== RoleMatrixGate: статус ==='];

  // Зависимости
  lines.push('Utils: ' + (typeof Utils !== 'undefined' && typeof Utils.findSessionByToken === 'function' ? 'OK' : 'ОТСУТСТВУЕТ'));
  lines.push('RoleMatrix: ' + (typeof roleMatrixGetAccess === 'function' ? 'OK' : 'ОТСУТСТВУЕТ (RoleMatrix.gs не задеплоен!)'));

  if (typeof roleMatrixGetAccess !== 'function') {
    var m0 = lines.join('\n');
    Logger.log(m0);
    return m0;
  }

  // Сводка по ключевым правам (какие роли что проходят)
  // Task 340: + workschedule.view.min (ограниченный просмотр графика)
  var keyPerms = ['admin.panel', 'cablejournal.edit', 'flowmeter.view',
                  'flowmeter.input', 'workschedule.view',
                  'workschedule.view.min', 'workschedule.edit'];
  var matrix = _rmgGetMatrixForStatus();
  if (!matrix.length) {
    lines.push('Матрица: НЕ ЧИТАЕТСЯ (запустите roleMatrixDebug из RoleMatrix.gs)');
  } else {
    lines.push('Ключ: A=админ-панель(admin.panel), C=каб.журнал(cablejournal.edit), ' +
      'F=расх.просмотр(flowmeter.view), I=расх.ввод(flowmeter.input), ' +
      'G=график.просмотр(workschedule.view), M=график.ограниченный(workschedule.view.min), ' +
      'W=график.запись(workschedule.edit); ' +
      'прописная = право есть, «·» = нет:');
    var legend = { 'admin.panel': 'a', 'cablejournal.edit': 'c', 'flowmeter.view': 'f',
                   'flowmeter.input': 'i', 'workschedule.view': 'g',
                   'workschedule.view.min': 'm', 'workschedule.edit': 'w' };
    for (var i = 0; i < matrix.length; i++) {
      var roleName = matrix[i];
      var acc = roleMatrixGetAccess(roleName);
      var marks = '';
      for (var p = 0; p < keyPerms.length; p++) {
        marks += (acc.permissions && acc.permissions[keyPerms[p]] === true)
          ? legend[keyPerms[p]].toUpperCase() + ' ' : '· ';
      }
      var pad = roleName.length < 18 ? roleName + ' '.repeat(18 - roleName.length) : roleName;
      lines.push('  ' + pad + marks + (acc.found ? '' : '  ← РОЛЬ НЕ НАЙДЕНА (fail-closed)'));
    }
  }

  // Пример гейта по реальной сессии (если есть хотя бы одна активная)
  try {
    var sessions = Utils.listActiveSessions ? Utils.listActiveSessions() : null;
    if (sessions && sessions.length) {
      var s = sessions[0];
      var u = Utils.findUserById(s.user_id);
      if (u) {
        var g = rmRequirePerm(s.token, 'admin.panel', 'rmGateStatus');
        lines.push('Пример: сессия ' + u.email + ' (роль «' + u.role + '») → admin.panel: ' +
          (g.ok ? 'ЕСТЬ' : 'нет (' + g.error + ')'));
      }
    }
  } catch (e) { /* диагностика не падает */ }

  var msg = lines.join('\n');
  Logger.log(msg);
  return msg;
}

/** Список названий ролей из матрицы (для сводки rmGateStatus). */
function _rmgGetMatrixForStatus() {
  try {
    var hit = typeof _rmGetMatrix === 'function' ? _rmGetMatrix() : null;
    if (hit && hit.roles && hit.roles.length) {
      var names = [];
      for (var i = 0; i < hit.roles.length; i++) { names.push(hit.roles[i].name); }
      return names;
    }
  } catch (e) {}
  return [];
}

// ==========================================================================
// ВНУТРЕННИЕ
// ==========================================================================

/** userId из объекта user (разные варианты ключа в модулях). */
function _rmgUserId(user) {
  if (!user) { return null; }
  if (user.userId !== undefined && user.userId !== null) { return user.userId; }
  if (user.user_id !== undefined && user.user_id !== null) { return user.user_id; }
  if (user.id !== undefined && user.id !== null) { return user.id; }
  if (user.ID !== undefined && user.ID !== null) { return user.ID; }
  return null;
}

/** Отказ в праве → audit_log (best-effort, не бросает). */
function _rmgAudit(user, perm, context, reason) {
  try {
    if (typeof Utils === 'undefined' || typeof Utils.audit !== 'function') { return; }
    Utils.audit(user.email, RMG_AUDIT_CODE, '', '',
      'Роль «' + user.role + '»: ' + (reason || 'отказ') +
      (perm ? ' [право: ' + perm + ']' : '') +
      (context ? ' [действие: ' + context + ']' : ''));
  } catch (e) { /* ignore */ }
}

/** Лог проблемы в консоль (не бросаем). */
function _rmgErr(msg) {
  try { console.error('[RoleMatrixGate] ' + msg); } catch (e) {}
}
