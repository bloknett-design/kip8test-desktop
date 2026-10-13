/**
 * RoleMatrix.gs — СЕРВЕРНОЕ ЧТЕНИЕ матрицы доступа (Этап 2, Task 294).
 *
 * Читает лист «matrix» таблицы KIP8_Access (создан RoleMatrixInit.gs,
 * Task 293 v4) и отвечает на вопрос «что разрешено роли N».
 *
 * СТРУКТУРА matrix (создана Task 293 v4):
 *   r1–r3: описание/инструкция/«Сгенерировано»;
 *   r4:    технические ID — role_id (A), role_name (B), perm_id (C+);
 *   r5:    человекочитаемые названия прав;
 *   r6+:   роли: A=role_id, B=Название (СОВПАДАЕТ со значениями role
 *          в листе users — по нему и связываем), C+=чекбоксы.
 *
 * ПРИНЦИПЫ:
 *   1) ДИНАМИЧНОСТЬ: количество строк/колонок НЕ фиксировано. Новое
 *      право = новая колонка (заполнить r4 perm_id и r5 название);
 *      новая роль = новая строка (A role_id, B название). Сервер
 *      подхватит их при следующем чтении (или после сброса кэша).
 *      ВАЖНО: границы данных ищутся ПО КОНТЕНТУ, а не getLastRow()/
 *      getLastColumn() — листы имеют «стилевой холст» до ~1000-й
 *      строки и 26-й колонки (пустые ячейки со стилями), из-за
 *      которого getLast* возвращает 1000×26 (доказано скачиванием
 *      таблицы 02.09.2026).
 *   2) FAIL-CLOSED: любая проблема (лист отсутствует, роль не
 *      найдена, нет доступа к таблице) → доступ ПОЛНОСТЬЮ закрыт +
 *      предупреждение в поле warnings и console.error. Функции
 *      НИКОГДА не бросают исключений — сервер сайта не должен
 *      падать из-за матрицы.
 *   3) «АДМИН ВСЕГДА ВСЕ ПРАВА»: роли с role_id='admin' (или
 *      названием «Админ») выдаются ВСЕ права матрицы независимо от
 *      чекбоксов — защита от случайного снятия галочек. Исключение —
 *      права из RM_ADMIN_EXCLUDE (режимные, взаимоисключающие):
 *      они уважаются по чекбоксу. В частности admin.panel у админа
 *      НЕОТКЛЮЧАЕМ (нельзя удалить право на собственную панель —
 *      защита от самоблокировки).
 *   4) КЭШ: матрица кэшируется в CacheService (TTL 5 минут).
 *      После правки галочек: подождать ≤5 мин либо вызвать
 *      roleMatrixInvalidateCache() (вручную или из админ-панели).
 *
 * ПУБЛИЧНЫЕ ФУНКЦИИ:
 *   roleMatrixGetAccess(roleName)
 *     → { role, roleId, found, isAdmin, permissions{permId:bool},
 *         granted[permId], warnings[] }
 *   roleMatrixInvalidateCache([email]) — сброс кэша
 *   roleMatrixDebug() — что «видит» сервер (запускать в редакторе)
 *
 * ПРИМЕР ИСПОЛЬЗОВАНИЯ (в Code.gs / doGet / проверках):
 *   var acc = roleMatrixGetAccess(userRole);
 *   // или напрямую по структуре:
 *   if (acc.permissions['charts.view']) { … }
 */

// ==========================================================================
// НАСТРОЙКИ
// ==========================================================================

// Таблица-источник (KIP8_Access; та же, что в RoleMatrixInit.gs).
var ROLE_MATRIX_SPREADSHEET_ID = '1TmmNZLUArWH38F6NX0gMGar8LMNMQomm_FaGZv9osyk';

var RM_MATRIX_SHEET = 'matrix';
var RM_USERS_SHEET  = 'users';

// Кэш чтения матрицы (сек). После правки галочек изменения подхватятся
// не позже чем через это время; мгновенно — roleMatrixInvalidateCache().
var RM_CACHE_TTL_SEC  = 300;
var RM_CACHE_KEY      = 'RoleMatrix.matrix.v1';
var RM_USER_CACHE_PREFIX = 'RoleMatrix.user.v1.'; // + email (нормализ.)

// ПРАВИЛА ДЛЯ «АДМИНА»:
// «Админ» всегда получает все права независимо от чекбоксов…
var RM_ADMIN_ALL_PERMS = true;
// …КРОМЕ перечисленных здесь «режимных» прав (выдаются по чекбоксу):
// kipios.restricted — ограничительный режим КИП ИОС для ИТР ТОКЕМ
// (конфликтует с kipios.view; админ осознанно не включает его).
var RM_ADMIN_EXCLUDE = { 'kipios.restricted': true };
// Право на саму админ-панель у админа неотключаемо (защита от
// самоблокировки: сняв его, админ потерял бы доступ к матрице).
var RM_ADMIN_ROLE_ID   = 'admin';
var RM_ADMIN_ROLE_NAME = 'админ'; // сравнение без регистра
var RM_PANEL_PERM      = 'admin.panel';

// Предохранители от «раздутого» листа (стилевой холст A1:Z1000):
var RM_MAX_ROWS = 2000; // потолок сканирования строк ролей
var RM_MAX_COLS = 60;   // потолок сканирования колонок прав
var RM_MAX_HEAD_ROWS = 10; // поиск строки заголовков в users
var RM_MAX_USER_ROWS = 5000; // потолок сканирования пользователей

// ==========================================================================
// ПУБЛИЧНОЕ API
// ==========================================================================

/**
 * Права роли по НАЗВАНИЮ (как в users!role / matrix!B / roles!B).
 * Регистр и пробелы по краям не важны; можно передать и role_id
 * (zapret, kip8_pro, admin…). НИКОГДА не бросает исключений.
 *
 * @param {string} roleName название роли («ИТР8 pro») или role_id.
 * @return {{role:string, roleId:string, found:boolean, isAdmin:boolean,
 *           permissions:Object, granted:string[], warnings:string[]}}
 */
function roleMatrixGetAccess(roleName) {
  var name = _rmTrim(roleName);
  var key = name.toLowerCase();
  var res = {
    role: name,
    roleId: '',
    found: false,
    isAdmin: false,
    permissions: {},
    granted: [],
    warnings: []
  };

  if (!name) {
    res.warnings.push('Роль не задана (пустое значение). Доступ закрыт.');
    return res;
  }

  var matrix = _rmGetMatrix();
  res.warnings = matrix.warnings.slice(0);
  if (!matrix.permIds.length || !matrix.roles.length) {
    return res; // матрица нечитаема — fail-closed (warnings уже внутри)
  }

  var row = null;
  for (var i = 0; i < matrix.roles.length; i++) {
    if (matrix.roles[i].name.toLowerCase() === key) { row = matrix.roles[i]; break; }
  }
  if (!row) { // запасной вариант: передали технический role_id
    for (var j = 0; j < matrix.roles.length; j++) {
      if ((matrix.roles[j].roleId || '').toLowerCase() === key) { row = matrix.roles[j]; break; }
    }
  }
  if (!row) {
    res.warnings.push('Роль «' + name + '» не найдена в matrix!B (и среди role_id). Доступ закрыт (fail-closed).');
    return res;
  }

  res.found = true;
  res.role = row.name;
  res.roleId = row.roleId || '';
  res.isAdmin = (row.roleId || '').toLowerCase() === RM_ADMIN_ROLE_ID ||
                row.name.toLowerCase() === RM_ADMIN_ROLE_NAME;

  for (var p = 0; p < matrix.permIds.length; p++) {
    var pid = matrix.permIds[p];
    var val = row.perms[pid] === true; // чекбокс из матрицы
    if (res.isAdmin && RM_ADMIN_ALL_PERMS) {
      if (pid === RM_PANEL_PERM) {
        val = true;                                  // неотключаемо у админа
      } else if (!RM_ADMIN_EXCLUDE[pid]) {
        val = true;                                  // «всегда все права»
      } // иначе (режимные права) — строго по чекбоксу
    }
    res.permissions[pid] = val;
    if (val) { res.granted.push(pid); }
  }
  return res;
}

/**
 * Сброс кэша: матрицы (без аргумента) и, при передаче email, — кэша
 * роли этого пользователя. Вызывать после правки галочек/ролей, если
 * не хочется ждать 5 минут (TTL кэша).
 *
 * @param {string=} email чей кэш пользователей сбросить (необяз.).
 */
function roleMatrixInvalidateCache(email) {
  var cache = _rmCache();
  if (!cache) { return 'Кэш недоступен — нечего сбрасывать (чтение идёт напрямую).'; }
  try { cache.remove(RM_CACHE_KEY); } catch (e) {}
  var em = _rmTrim(String(email || '')).toLowerCase();
  if (em) {
    try { cache.remove(RM_USER_CACHE_PREFIX + em); } catch (e) {}
  }
  var msg = 'Кэш матрицы доступа сброшен. Следующее чтение — из таблицы.' +
    (em ? ' Кэш пользователя ' + em + ' тоже сброшен.' : '');
  Logger.log(msg);
  return msg;
}

/**
 * ДИАГНОСТИКА: что сервер видит в матрице и пользователях. Запускать
 * в редакторе Apps Script (ничего не меняет; кэш сбрасывает).
 * Показывает: права, роли и их наборы, пользователей users и есть ли
 * их роль в матрице, warnings. Сверяйте с тем, что видите в таблице.
 */
function roleMatrixDebug() {
  roleMatrixInvalidateCache();
  var lines = [];
  var ssName = '';
  try {
    ssName = SpreadsheetApp.openById(ROLE_MATRIX_SPREADSHEET_ID).getName();
  } catch (e) {
    ssName = 'НЕДОСТУПНА: ' + e;
  }
  lines.push('Таблица: «' + ssName + '» — ' + ROLE_MATRIX_SPREADSHEET_ID);

  var matrix = _rmGetMatrix();
  lines.push('Права (matrix r4, C+): ' + matrix.permIds.length +
    (matrix.permIds.length ? ' — ' + matrix.permIds.join(', ') : ''));
  lines.push('Роли (matrix r6+): ' + matrix.roles.length);
  for (var i = 0; i < matrix.roles.length; i++) {
    var r = matrix.roles[i];
    var cnt = 0;
    for (var pid in r.perms) { if (r.perms[pid] === true) { cnt++; } }
    lines.push('  · «' + r.name + '»' + (r.roleId ? ' (' + r.roleId + ')' : '') +
      ': прав ' + cnt + '/' + matrix.permIds.length);
  }

  // Пользователи: role → есть ли в матрице?
  lines.push('Пользователи (users):');
  try {
    var users = _rmReadUsersForDebug();
    var roleNames = {};
    for (var k = 0; k < matrix.roles.length; k++) {
      roleNames[matrix.roles[k].name.toLowerCase()] = true;
    }
    if (!users.length) { lines.push('  (не прочитано — см. warnings выше)'); }
    for (var u = 0; u < users.length; u++) {
      var ok = roleNames[users[u].role.toLowerCase()] ? 'роль есть в matrix' : '⚠ РОЛИ НЕТ В MATRIX';
      lines.push('  · ' + users[u].email + ' → «' + users[u].role + '»: ' + ok);
    }
  } catch (e) {
    lines.push('  ошибка чтения users: ' + e);
  }

  if (matrix.warnings.length) {
    lines.push('ПРЕДУПРЕЖДЕНИЯ:');
    for (var w = 0; w < matrix.warnings.length; w++) { lines.push('  ⚠ ' + matrix.warnings[w]); }
  } else {
    lines.push('Предупреждений нет — ОК.');
  }
  var msg = lines.join('\n');
  Logger.log(msg);
  return msg;
}

// ==========================================================================
// ВНУТРЕННИЕ ФУНКЦИИ (чтение, кэш, нормализация)
// ==========================================================================

/** Кэш скрипта или null (недоступен → читаем без кэша). */
function _rmCache() {
  try { return CacheService.getScriptCache(); } catch (e) { return null; }
}

/** Матрица (с кэшем TTL RM_CACHE_TTL_SEC). */
function _rmGetMatrix() {
  var cache = _rmCache();
  if (cache) {
    try {
      var hit = cache.get(RM_CACHE_KEY);
      if (hit) {
        var parsed = JSON.parse(hit);
        if (parsed && parsed.permIds && parsed.roles) { return parsed; }
      }
    } catch (e) { /* битый кэш — перечитаем */ }
  }
  var result = _rmReadMatrixRaw();
  if (cache) {
    try {
      cache.put(RM_CACHE_KEY, JSON.stringify(result), RM_CACHE_TTL_SEC);
    } catch (e) { /* кэш переполнен — просто не кэшируем */ }
  }
  return result;
}

/**
 * ЧТЕНИЕ матрицы. Границы — ПО КОНТЕНТУ (не getLast*, см. шапку):
 * права = непустые ячейки r4 от C; роли = строки r6+ с непустым B.
 * @return {{permIds:string[], roles:[{roleId,name,perms}], warnings:string[]}}
 */
function _rmReadMatrixRaw() {
  var out = { permIds: [], roles: [], warnings: [] };
  var ss = null;
  try {
    ss = SpreadsheetApp.openById(ROLE_MATRIX_SPREADSHEET_ID);
  } catch (e) {
    out.warnings.push('Не удалось открыть таблицу KIP8_Access: ' + e +
      '. Доступ закрыт (fail-closed).');
    _rmErr(out.warnings[out.warnings.length - 1]);
    return out;
  }

  var sh = ss.getSheetByName(RM_MATRIX_SHEET);
  if (!sh) {
    out.warnings.push('Лист «matrix» отсутствует — инициализация не выполнялась? ' +
      'Запустите RoleMatrixInit (Task 293). Доступ закрыт (fail-closed).');
    _rmErr(out.warnings[0]);
    return out;
  }

  var lastRowCand = Math.min(sh.getLastRow() || 0, RM_MAX_ROWS);
  var lastColCand = Math.min(sh.getLastColumn() || 0, RM_MAX_COLS);
  if (lastRowCand < 5 || lastColCand < 3) {
    out.warnings.push('Лист «matrix» пуст или повреждён (lastRow=' + sh.getLastRow() +
      ', lastCol=' + sh.getLastColumn() + '). Запустите roleMatrixStatus() ' +
      'из RoleMatrixInit.gs. Доступ закрыт (fail-closed).');
    _rmErr(out.warnings[0]);
    return out;
  }

  try {
    var header = sh.getRange(4, 1, 1, lastColCand).getValues()[0];

    // Права: непустые perm_id в строке 4, начиная с колонки C (индекс 2).
    var permCols = [];
    for (var c = 2; c < lastColCand; c++) {
      var pid = _rmTrim(header[c]);
      if (pid) { permCols.push({ col: c, pid: pid }); }
    }

    // Роли: строки 6+ с непустым названием (B, индекс 1).
    var roles = [];
    if (lastRowCand >= 6) {
      var data = sh.getRange(6, 1, lastRowCand - 5, lastColCand).getValues();
      for (var r = 0; r < data.length; r++) {
        var name = _rmTrim(data[r][1]);
        if (!name) { continue; }
        var perms = {};
        for (var p = 0; p < permCols.length; p++) {
          perms[permCols[p].pid] = _rmIsChecked(data[r][permCols[p].col]);
        }
        roles.push({ roleId: _rmTrim(data[r][0]), name: name, perms: perms });
      }
    }

    out.permIds = [];
    for (var q = 0; q < permCols.length; q++) { out.permIds.push(permCols[q].pid); }
    out.roles = roles;

    if (!out.permIds.length) {
      out.warnings.push('В «matrix» строка 4 не содержит perm_id (C+ пустые). Доступ закрыт.');
    }
    if (!out.roles.length) {
      out.warnings.push('В «matrix» нет ролей: строки 6+ пустые в колонке B «Название».');
    }
  } catch (e) {
    out.warnings.push('Ошибка чтения «matrix»: ' + e + '. Доступ закрыт (fail-closed).');
    _rmErr(out.warnings[0]);
  }
  return out;
}

/**
 * Роль пользователя по email из листа users. Колонки email/role ищутся
 * ДИНАМИЧНО по строке заголовков (в первых RM_MAX_HEAD_ROWS строках),
 * данные — до последней непустой email (не getLast*, см. шапку).
 * @param {string} emailLower нормализованный email (trim+lower).
 * @param {string[]} warnings сюда дописываются проблемы.
 * @return {?string} название роли или null.
 */
function _rmFindUserRole(emailLower, warnings) {
  var cache = _rmCache();
  var cacheKey = RM_USER_CACHE_PREFIX + emailLower;
  if (cache) {
    try {
      var hit = cache.get(cacheKey);
      if (hit !== null && hit !== undefined) {
        var v = JSON.parse(hit);
        if (v && v.role !== undefined) { return v.role; } // role может быть ''
      }
    } catch (e) { /* битый кэш — читаем */ }
  }

  var role = _rmFindUserRoleRaw(emailLower, warnings);

  if (cache && role !== null) { // не найденного не кэшируем: появится — сразу увидим
    try { cache.put(cacheKey, JSON.stringify({ role: role }), RM_CACHE_TTL_SEC); } catch (e) {}
  }
  return role;
}

/** Реальное чтение users (без кэша). */
function _rmFindUserRoleRaw(emailLower, warnings) {
  var ss;
  try {
    ss = SpreadsheetApp.openById(ROLE_MATRIX_SPREADSHEET_ID);
  } catch (e) {
    warnings.push('Не удалось открыть таблицу KIP8_Access: ' + e);
    return null;
  }
  var sh = ss.getSheetByName(RM_USERS_SHEET);
  if (!sh) {
    warnings.push('Лист «users» отсутствует в таблице.');
    return null;
  }

  var lastRowCand = Math.min(sh.getLastRow() || 0, RM_MAX_USER_ROWS);
  var lastColCand = Math.min(sh.getLastColumn() || 0, RM_MAX_COLS);
  if (lastRowCand < 1) { warnings.push('Лист «users» пуст.'); return null; }

  var headRows = Math.min(RM_MAX_HEAD_ROWS, lastRowCand);
  var head = sh.getRange(1, 1, headRows, lastColCand).getValues();
  var emailCol = -1, roleCol = -1, headRow = -1;
  for (var r = 0; r < head.length; r++) {
    for (var c = 0; c < head[r].length; c++) {
      var v = _rmTrim(head[r][c]).toLowerCase();
      if (v === 'email' || v === 'e-mail') { emailCol = c; headRow = r; }
      if (v === 'role') { roleCol = c; }
    }
    if (emailCol >= 0 && roleCol >= 0) { break; }
  }
  if (emailCol < 0 || roleCol < 0) {
    warnings.push('В «users» не найдены колонки «email»/«role» в первых ' +
      headRows + ' строках — структура изменилась?');
    return null;
  }

  var data = sh.getRange(headRow + 2, 1, Math.max(lastRowCand - headRow - 1, 1), lastColCand).getValues();
  for (var i = 0; i < data.length; i++) {
    var em = _rmTrim(data[i][emailCol]).toLowerCase();
    if (em === emailLower) { return _rmTrim(data[i][roleCol]); }
  }
  return null;
}

/** users для roleMatrixDebug: {email, role}[] (без кэша, для отчёта). */
function _rmReadUsersForDebug() {
  var ss = SpreadsheetApp.openById(ROLE_MATRIX_SPREADSHEET_ID);
  var sh = ss.getSheetByName(RM_USERS_SHEET);
  if (!sh) { return []; }
  var lastRowCand = Math.min(sh.getLastRow() || 0, RM_MAX_USER_ROWS);
  var lastColCand = Math.min(sh.getLastColumn() || 0, RM_MAX_COLS);
  var headRows = Math.min(RM_MAX_HEAD_ROWS, lastRowCand);
  var head = sh.getRange(1, 1, headRows, lastColCand).getValues();
  var emailCol = -1, roleCol = -1, headRow = -1;
  for (var r = 0; r < head.length; r++) {
    for (var c = 0; c < head[r].length; c++) {
      var v = _rmTrim(head[r][c]).toLowerCase();
      if (v === 'email' || v === 'e-mail') { emailCol = c; headRow = r; }
      if (v === 'role') { roleCol = c; }
    }
    if (emailCol >= 0 && roleCol >= 0) { break; }
  }
  if (emailCol < 0 || roleCol < 0) { return []; }
  var data = sh.getRange(headRow + 2, 1, Math.max(lastRowCand - headRow - 1, 1), lastColCand).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var em = _rmTrim(data[i][emailCol]);
    if (!em) { continue; }
    out.push({ email: em, role: _rmTrim(data[i][roleCol]) });
  }
  return out;
}

// — утилиты ————————————————————————————————————————————————————————————

/** trim строки (null-safe). */
function _rmTrim(v) {
  if (v === null || v === undefined) { return ''; }
  return String(v).replace(/^\s+|\s+$/g, '');
}

/** Значение ячейки = включённый чекбокс? */
function _rmIsChecked(v) {
  if (v === true) { return true; }
  if (v === 1) { return true; }
  if (typeof v === 'string' && v.replace(/^\s+|\s+$/g, '').toUpperCase() === 'TRUE') { return true; }
  return false;
}

/** Лог проблемы в консоль (не бросаем!). */
function _rmErr(msg) {
  try { console.error('[RoleMatrix] ' + msg); } catch (e) {}
}
