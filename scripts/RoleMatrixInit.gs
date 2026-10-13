/**
 * RoleMatrixInit.gs — ОДНОРАЗОВЫЙ скрипт инициализации системы доступа.
 * Task 293. Запускать в Apps Script-проекте, привязанном к таблице
 * KIP8_Access (тот же проект, что деплоится как Web App AKfycbyt…).
 *
 * ЧТО ДЕЛАЕТ:
 *   Создаёт 3 листа в стиле существующих (users, sessions, …):
 *
 *   1) matrix — МАТРИЦА ДОСТУПА «роль × право» (главный лист).
 *      Строки 1–3: описание/инструкция/версия. Строка 4: технические
 *      ID (role_id в A, perm_id в C..). Строка 5: человекочитаемые
 *      названия. Строки 6+: роли, в ячейках — чекбоксы (галочки).
 *
 *   2) permissions — реестр прав (справочник, расширяемый):
 *      perm_id, Название, Описание, Группа, Конфликт с,
 *      Системное, Активно, Добавлено.
 *
 *   3) roles — реестр ролей (справочник):
 *      role_id, Название, Описание, Системная, Порядок.
 *      ВАЖНО: «Название» должно ТОЧНО совпадать со значениями
 *      role в листе users (по нему сервер сопоставляет роль
 *      пользователя со строкой матрицы).
 *
 * БЕЗОПАСНОСТЬ:
 *   - Существующие листы (users/sessions/otp_codes/audit_log/config)
 *     НЕ трогаются.
 *   - Повторный запуск при уже существующем листе matrix — выход
 *     без изменений (идемпотентность).
 *   - Технические строки/колонки защищены «мягкой» защитой
 *     (warning-only): редактирование возможно, но с предупреждением.
 *
 * v2 (02.09.2026): исправлена ошибка v1 — у Range в Apps Script нет
 *   метода setItalic(), заменён на setFontStyle('italic') (3 места);
 *   добавлена функция roleMatrixCleanup() — удаление листов матрицы
 *   (для пересоздания или после сбоя на середине);
 *   roleMatrixInit() теперь распознаёт частичную инициализацию
 *   (есть matrix, нет permissions/roles) и подсказывает, что делать.
 *
 * v3 (02.09.2026): исправлена ошибка v2 — «Невозможно закрепить
 *   столбцы, в которых содержится только часть объединенных ячеек»:
 *   закрепление строк/столбцов теперь выполняется ДО объединения
 *   ячеек и записи данных (в v2 объединённая строка 1 пересекала
 *   границу закрепления столбцов A|B, и setFrozenColumns(2) падал);
 *   объединение строк 1–2 идёт через _mergeRow() с запасным
 *   разбиением по границе закрепления; строка 2 (инструкция)
 *   теперь объединена на всю ширину листа — в v2 перенос текста
 *   был зажат шириной колонки A.
 *
 * v4 (02.09.2026): найдена и устранена ПРИЧИНА «пустых листов»
 *   после v3. Объединение строк 1–2 на всю ширину листа при
 *   закреплённых столбцах A–B создаёт состояние, которое Google
 *   Sheets НЕ МОЖЕТ ОТРИСОВАТЬ: API принимает merge() без ошибки,
 *   но UI и экспорт xlsx показывают лист полностью ПУСТЫМ
 *   (подтверждено скачиванием таблицы после запуска v3 у
 *   пользователя: листы matrix/permissions/roles существуют,
 *   закрепления 5×2/4×2 на месте, непустых ячеек — 0; те же 3
 *   предупреждения «Нельзя объединять закрепленные и
 *   незакрепленные столбцы» — от protect() диапазонов через ту
 *   же границу). Лечение — вернуться к проверенному стилю
 *   СУЩЕСТВУЮЩИХ листов users/sessions/config (там строки 1–2
 *   объединены на всю ширину A1:E1/A2:E2 при закреплении ТОЛЬКО
 *   строк): закрепление столбцов полностью убрано из всех трёх
 *   листов; _mergeRow() застрахован и никогда не создаёт
 *   объединение через границу. Плюс: таблица-цель всегда
 *   открывается по ID KIP8_Access (адрес пишется в журнал);
 *   самопроверка созданных листов ЧТЕНИЕМ из таблицы
 *   (_verifyCreated — данные записаны + лист отображаем),
 *   итоговое сообщение содержит результаты проверки; новая
 *   функция roleMatrixStatus() — диагностика состояния листов
 *   в любой момент (в т.ч. распознаёт «повреждённые» листы v3).
 *
 * РАСШИРЕНИЕ В БУДУЩЕМ (когда появятся новые разделы/функционалы):
 *   Новое право  = новая колонка в matrix (строка 4 — perm_id,
 *                  строка 5 — название) + строка в permissions.
 *   Новая роль   = новая строка в matrix (A — role_id, B — название)
 *                  + строка в roles.
 *   Код сервера (RoleMatrix.gs, следующий этап) читает matrix
 *   динамически: количество строк/колонок не фиксировано.
 */

// ЦЕЛЕВАЯ таблица — KIP8_Access. Скрипт v4 всегда открывает её по ID
// (независимо от того, в каком проекте Apps Script запущен) и пишет
// адрес таблицы в журнал выполнения — исключает запись «не в ту
// таблицу» и путаницу с активной таблицей проекта.
var FALLBACK_SPREADSHEET_ID = '1TmmNZLUArWH38F6NX0gMGar8LMNMQomm_FaGZv9osyk';

// ==========================================================================
// ДАННЫЕ ПО УМОЛЧАНИЮ (карта ролей пользователя, актуальная на 02.09.2026;
// 2 расхождения со старым кодом применены ПО ТАБЛИЦЕ:
//   ф.11 «Ввод показаний» добавлен роли ИТР ИОС;
//   ф.12 «График работы — просмотр» добавлен роли ИТР8 pro)
// ==========================================================================

// [role_id, Название, Описание, Системная, Порядок]
var INIT_ROLES = [
  ['zapret',       'Запрет',           'Полный запрет: доступна только главная страница (используется для блокировки пользователя)', true,  1],
  ['common',       'Общий доступ',     'Гостевой уровень: только инженерные калькуляторы, вход не требуется',                          true,  2],
  ['itr_tokem',    'ИТР ТОКЕМ',        'Калькуляторы + КИП ИОС с ограничениями (фильтр 4) + Что нового',                                false, 3],
  ['kip8',         'КИП8',             'Калькуляторы + библиотека (билеты) + секретные кнопки + Что нового',                            false, 4],
  ['kip8_pro',     'КИП8 pro',         'КИП8 + расходомеры хозрасчётные (просмотр)',                                                      false, 5],
  ['kip_ios',      'КИП ИОС',          'Полный КИП ИОС + библиотека + секретные кнопки + Что нового',                                    false, 6],
  ['kip_ios_pro',  'КИП ИОС pro',      'КИП ИОС + правка кабельного журнала',                                                             false, 7],
  ['kip_ios_duty', 'КИП ИОС дежурный', 'КИП ИОС + расходомеры с вводом показаний',                                                        false, 8],
  ['itr8',         'ИТР8',             'КИП ИОС + расходомеры хозрасчётные (просмотр)',                                                   false, 9],
  ['itr8_pro',     'ИТР8 pro',         'ИТР8 + просмотр графика работы',                                                                  false, 10],
  ['itr_ios',      'ИТР ИОС',          'ИТР8 + правка кабельного журнала + ввод показаний',                                               false, 11],
  ['admin',        'Админ',            'Полный доступ: все разделы, админ-панель, управление матрицей',                                  true,  12]
];

// [perm_id, Название, Описание, Группа, Конфликт с, Системное, Активно, Добавлено]
var INIT_PERMISSIONS = [
  ['calc.view',           'Инженерные калькуляторы',        'Отображение раздела «Инженерные калькуляторы» и всех калькуляторов/конвертеров',                     'Разделы',        '',                false, true, '2026-09-02'],
  ['library.view',        'Билеты и Библиотека КИП и А',    'Отображение разделов «Экзаменационные билеты» и «Библиотека КИП и А»',                                 'Разделы',        '',                false, true, '2026-09-02'],
  ['kipios.view',         'КИП ИОС — полный',               'Отображение всех разделов КИП ИОС: приборы, блокировки, клапаны, регуляторы, проекты, каб. журнал, план 114', 'КИП ИОС', 'kipios.restricted', false, true, '2026-09-02'],
  ['kipios.restricted',   'КИП ИОС — с ограничениями',      'КИП ИОС с фильтром: скрыты Графики, Проекты, Кабельный журнал, столбец «Замечания»; скрыты приборы без «В гр. ППР» и блокировки без «В перечне»', 'КИП ИОС', 'kipios.view', false, true, '2026-09-02'],
  ['cablejournal.edit',   'Кабельный журнал — правка',      'Добавление, правка и удаление кабелей в разделе «Кабельный журнал»',                                   'Действия',       '',                false, true, '2026-09-02'],
  ['admin.panel',         'Админ-панель',                   'Отображение раздела «Админ-панель»: пользователи, сессии, логи, матрица доступа',                      'Система',        '',                true,  true, '2026-09-02'],
  ['secret.view',         'Секретные кнопки',               'Доступны секретные кнопки «Сапёр» и «Телефонный справочник»',                                          'Сервис',         '',                false, true, '2026-09-02'],
  ['whatsnew.view',       'Что нового',                     'Отображение раздела «Что нового»',                                                                      'Разделы',        '',                false, true, '2026-09-02'],
  ['charts.view',         'Графики КИП ИОС',                'Отображение кнопки раздела «Графики» на странице КИП ИОС',                                             'Разделы',        '',                false, true, '2026-09-02'],
  ['flowmeter.view',      'Расходомеры — просмотр',         'Отображение раздела «Расходомеры хозрасчётные» (просмотр данных)',                                     'Расходомеры',    '',                false, true, '2026-09-02'],
  ['flowmeter.input',     'Расходомеры — ввод показаний',   'Ввод показаний (сутки/месяц) в разделе «Расходомеры хозрасчётные»',                                    'Расходомеры',    '',                false, true, '2026-09-02'],
  ['workschedule.view',   'График работы — просмотр',       'Просмотр раздела «График работы»: кнопки и диалоги скрыты, доступен только выбор года и месяца',        'График работы',  '',                false, true, '2026-09-02'],
  ['workschedule.edit',   'График работы — внесение',       'Внесение данных в разделе «График работы»: сотрудники, инструктажи, отпуска (подразумевает просмотр)',  'График работы',  '',                false, true, '2026-09-02']
];

// Матрица: role_id → perm_id → true/false.
var INIT_MATRIX = {
  'zapret':       {},
  'common':       { 'calc.view': true },
  'itr_tokem':    { 'calc.view': true, 'kipios.restricted': true, 'whatsnew.view': true },
  'kip8':         { 'calc.view': true, 'library.view': true, 'secret.view': true, 'whatsnew.view': true },
  'kip8_pro':     { 'calc.view': true, 'library.view': true, 'secret.view': true, 'whatsnew.view': true, 'flowmeter.view': true },
  'kip_ios':      { 'calc.view': true, 'library.view': true, 'kipios.view': true, 'secret.view': true, 'whatsnew.view': true },
  'kip_ios_pro':  { 'calc.view': true, 'library.view': true, 'kipios.view': true, 'secret.view': true, 'whatsnew.view': true, 'cablejournal.edit': true },
  'kip_ios_duty': { 'calc.view': true, 'library.view': true, 'kipios.view': true, 'secret.view': true, 'whatsnew.view': true, 'flowmeter.view': true, 'flowmeter.input': true },
  'itr8':         { 'calc.view': true, 'library.view': true, 'kipios.view': true, 'secret.view': true, 'whatsnew.view': true, 'flowmeter.view': true },
  'itr8_pro':     { 'calc.view': true, 'library.view': true, 'kipios.view': true, 'secret.view': true, 'whatsnew.view': true, 'flowmeter.view': true, 'workschedule.view': true },
  'itr_ios':      { 'calc.view': true, 'library.view': true, 'kipios.view': true, 'secret.view': true, 'whatsnew.view': true, 'flowmeter.view': true, 'cablejournal.edit': true, 'flowmeter.input': true },
  'admin':        { 'calc.view': true, 'library.view': true, 'kipios.view': true, 'secret.view': true, 'whatsnew.view': true, 'charts.view': true, 'cablejournal.edit': true, 'admin.panel': true, 'flowmeter.view': true, 'flowmeter.input': true, 'workschedule.view': true, 'workschedule.edit': true }
};

// ==========================================================================
// ГЛАВНАЯ ФУНКЦИЯ (запустить её один раз в редакторе Apps Script)
// ==========================================================================

function roleMatrixInit() {
  // Всегда работаем с целевой таблицей по ID — независимо от проекта,
  // в котором запущен скрипт (адрес таблицы пишется в журнал).
  var ss = SpreadsheetApp.openById(FALLBACK_SPREADSHEET_ID);
  Logger.log('Целевая таблица: «' + ss.getName() + '» — ' + ss.getUrl());

  // --- Идемпотентность: не перезаписывать существующее ---
  if (ss.getSheetByName('matrix')) {
    // Частичная инициализация (сбой на середине, как в v1)?
    if (!ss.getSheetByName('permissions') || !ss.getSheetByName('roles')) {
      throw new Error('Обнаружена незавершённая инициализация: лист «matrix» есть, но «permissions»/«roles» — нет. ' +
        'Запустите функцию roleMatrixCleanup(), затем снова roleMatrixInit().');
    }
    var msg = 'Лист «matrix» уже существует — инициализация НЕ выполнена (ничего не изменено). ' +
      'Для пересоздания запустите roleMatrixCleanup() и затем roleMatrixInit().';
    Logger.log(msg);
    return msg;
  }

  // --- Самопроверка данных на консистентность ---
  var check = _validateInitData();
  if (check !== true) { throw new Error('Ошибка в данных скрипта: ' + check); }

  var created = [];
  _createMatrixSheet(ss);      created.push('matrix');
  _createPermissionsSheet(ss); created.push('permissions');
  _createRolesSheet(ss);       created.push('roles');

  // --- Самопроверка результата ЧТЕНИЕМ из таблицы ---
  var errs = _verifyCreated(ss);
  if (errs.length > 0) {
    throw new Error('Самопроверка после создания НЕ ПРОШЛА: ' + errs.join('; ') +
      '. Запустите roleMatrixCleanup() и roleMatrixInit() снова; если повторится — приложите журнал выполнения.');
  }

  var m = ss.getSheetByName('matrix');
  var p = ss.getSheetByName('permissions');
  var g = ss.getSheetByName('roles');
  var summary = 'Готово. Созданы листы: ' + created.join(', ') +
    '. Прав: ' + INIT_PERMISSIONS.length + ', ролей: ' + INIT_ROLES.length + '.' +
    ' Самопроверка чтения: matrix ' + m.getLastRow() + '×' + m.getLastColumn() +
    ' (A6=\'' + m.getRange('A6').getValue() + '\'), permissions ' +
    p.getLastRow() + '×' + p.getLastColumn() + ', roles ' +
    g.getLastRow() + '×' + g.getLastColumn() + ' — ОК.' +
    ' Проверьте галочки в «matrix» (вкладки внизу таблицы, последние в списке).';
  Logger.log(summary);
  return summary;
}

// ==========================================================================
// ОЧИСТКА: удаляет листы matrix / permissions / roles (для пересоздания
// или после сбоя на середине). Существующие листы таблицы НЕ трогает.
// ==========================================================================

function roleMatrixCleanup() {
  var ss = SpreadsheetApp.openById(FALLBACK_SPREADSHEET_ID);
  Logger.log('Целевая таблица: «' + ss.getName() + '» — ' + ss.getUrl());
  var deleted = [];
  var names = ['matrix', 'permissions', 'roles'];
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (sh) { ss.deleteSheet(sh); deleted.push(names[i]); }
  }
  var msg = deleted.length
    ? 'Удалены листы: ' + deleted.join(', ') + '. Теперь запустите roleMatrixInit().'
    : 'Листы matrix / permissions / roles не найдены — нечего удалять. Можно запускать roleMatrixInit().';
  Logger.log(msg);
  return msg;
}

// ==========================================================================
// ДИАГНОСТИКА: состояние листов матрицы (запускать в любой момент,
// ничего не меняет). Распознаёт «повреждённые» листы v2/v3 —
// объединение через границу закрепления столбцов: лист существует,
// но отображается ПУСТЫМ.
// ==========================================================================

function roleMatrixStatus() {
  var ss = SpreadsheetApp.openById(FALLBACK_SPREADSHEET_ID);
  var lines = ['Таблица: «' + ss.getName() + '» — ' + ss.getUrl()];
  var names = ['matrix', 'permissions', 'roles'];
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (!sh) {
      lines.push('· ' + names[i] + ': ОТСУТСТВУЕТ (инициализация не выполнялась или выполнен cleanup)');
      continue;
    }
    var line = '· ' + names[i] + ': ' + sh.getLastRow() + '×' + sh.getLastColumn() +
      ', закрепление ' + sh.getFrozenRows() + ' стр. × ' + sh.getFrozenColumns() + ' кол.';
    if (!_isRenderable(sh)) {
      line += ' — ⚠ ПОВРЕЖДЁН: объединение пересекает границу закрепления столбцов, лист отображается ПУСТЫМ. Лечение: roleMatrixCleanup() + roleMatrixInit().';
    } else if (sh.getFrozenColumns() > 0) {
      line += ' — ⚠ закрепление столбцов (' + sh.getFrozenColumns() + ') в v4 не используется (остаток v2/v3?) — рекомендуется roleMatrixCleanup() + roleMatrixInit().';
    } else if (sh.getLastRow() <= 1 && sh.getLastColumn() <= 1) {
      line += ' — ⚠ ПУСТОЙ (данных нет). Лечение: roleMatrixCleanup() + roleMatrixInit().';
    } else {
      line += ' — ОК';
    }
    lines.push(line);
  }
  var msg = lines.join('\n');
  Logger.log(msg);
  return msg;
}

// ==========================================================================
// ВНУТРЕННИЕ ФУНКЦИИ
// ==========================================================================

function _validateInitData() {
  var permIds = {};
  for (var i = 0; i < INIT_PERMISSIONS.length; i++) { permIds[INIT_PERMISSIONS[i][0]] = true; }
  var roleIds = {};
  for (var j = 0; j < INIT_ROLES.length; j++) { roleIds[INIT_ROLES[j][0]] = true; }

  // Матрица: все perm_id и role_id известны?
  for (var rid in INIT_MATRIX) {
    if (!roleIds[rid]) return 'роль «' + rid + '» из матрицы отсутствует в INIT_ROLES';
    var perms = INIT_MATRIX[rid];
    for (var pid in perms) {
      if (!permIds[pid]) return 'право «' + pid + '» роли «' + rid + '» отсутствует в INIT_PERMISSIONS';
    }
  }
  // У каждой роли из реестра есть строка в матрице?
  for (var r2 = 0; r2 < INIT_ROLES.length; r2++) {
    if (!INIT_MATRIX.hasOwnProperty(INIT_ROLES[r2][0])) {
      return 'роль «' + INIT_ROLES[r2][0] + '» отсутствует в INIT_MATRIX';
    }
  }
  // Админ: панель администратора обязана быть включена (защита от самоблокировки)
  if (!(INIT_MATRIX['admin'] && INIT_MATRIX['admin']['admin.panel'] === true)) {
    return 'роль «admin» должна иметь право admin.panel';
  }
  return true;
}

function _headerStyle(range, bg, bold) {
  range.setBackground(bg)
       .setFontWeight(bold ? 'bold' : 'normal')
       .setFontColor('#ffffff')
       .setVerticalAlignment('middle');
}

function _softProtect(range, description) {
  try {
    var p = range.protect().setDescription(description);
    if (p.canSetWarningOnly && p.canSetWarningOnly()) { p.setWarningOnly(true); }
  } catch (e) {
    Logger.log('Защита диапазона не установлена (не критично): ' + e);
  }
}

// Самопроверка созданных листов ЧТЕНИЕМ из таблицы: данные реально
// записаны и лист отображаем (нет объединений через границу закрепления
// столбцов — иначе Google Sheets показывает лист пустым).
function _verifyCreated(ss) {
  var errs = [];

  var m = ss.getSheetByName('matrix');
  if (!m) { errs.push('лист matrix не найден'); }
  else {
    if (!_isRenderable(m)) { errs.push('matrix: объединение пересекает границу закрепления столбцов (лист будет отображаться пустым)'); }
    var a4 = String(m.getRange('A4').getValue() || '');
    if (a4 !== 'role_id') { errs.push('matrix!A4 = "' + a4 + '" (ожидался "role_id")'); }
    var a6 = String(m.getRange('A6').getValue() || '');
    if (!a6) { errs.push('matrix!A6 пуст (ожидался ID первой роли)'); }
    if (m.getLastRow() < 5 + INIT_ROLES.length) { errs.push('matrix: последняя строка ' + m.getLastRow() + ' (ожидается ' + (5 + INIT_ROLES.length) + ')'); }
    if (m.getLastColumn() < 2 + INIT_PERMISSIONS.length) { errs.push('matrix: последняя колонка ' + m.getLastColumn() + ' (ожидается ' + (2 + INIT_PERMISSIONS.length) + ')'); }
  }

  var p = ss.getSheetByName('permissions');
  if (!p) { errs.push('лист permissions не найден'); }
  else {
    if (!_isRenderable(p)) { errs.push('permissions: объединение пересекает границу закрепления столбцов'); }
    if (String(p.getRange('A4').getValue() || '') !== 'perm_id') { errs.push('permissions!A4 ≠ "perm_id"'); }
    if (p.getLastRow() < 4 + INIT_PERMISSIONS.length) { errs.push('permissions: последняя строка ' + p.getLastRow() + ' (ожидается ' + (4 + INIT_PERMISSIONS.length) + ')'); }
  }

  var g = ss.getSheetByName('roles');
  if (!g) { errs.push('лист roles не найден'); }
  else {
    if (!_isRenderable(g)) { errs.push('roles: объединение пересекает границу закрепления столбцов'); }
    if (String(g.getRange('A4').getValue() || '') !== 'role_id') { errs.push('roles!A4 ≠ "role_id"'); }
    if (g.getLastRow() < 4 + INIT_ROLES.length) { errs.push('roles: последняя строка ' + g.getLastRow() + ' (ожидается ' + (4 + INIT_ROLES.length) + ')'); }
  }

  return errs;
}

// Лист отображается корректно, только если ни одно объединение не
// пересекает границу закрепления СТОЛБЦОВ (проверка «повреждённости» —
// состояния, при котором Google Sheets показывает лист пустым).
function _isRenderable(sheet) {
  var frozen = 0;
  try { frozen = sheet.getFrozenColumns() || 0; } catch (e) { frozen = 0; }
  if (frozen <= 0) { return true; }
  var lastCol = sheet.getLastColumn();
  if (lastCol <= frozen) { return true; }
  var lastRow = Math.max(sheet.getLastRow() || 1, sheet.getFrozenRows() || 0, 2);
  var merges = sheet.getRange(1, 1, lastRow, lastCol).getMergedRanges();
  for (var i = 0; i < merges.length; i++) {
    if (merges[i].getColumn() <= frozen &&
        merges[i].getColumn() + merges[i].getNumColumns() - 1 > frozen) {
      return false;
    }
  }
  return true;
}

// Объединяет строку row (колонки 1..lastCol) и возвращает диапазон
// ДЛЯ ТЕКСТА. НИКОГДА не создаёт объединение через границу закрепления
// СТОЛБЦОВ: Apps Script принимает такое объединение БЕЗ ошибки, но
// Google Sheets не может его отобразить — весь лист выглядит пустым
// (причина «пустых листов» после v3). Поэтому в v4 закрепление столбцов
// вообще не используется (только строки — ровно как в существующих
// листах users/sessions с их A1:E1/A2:E2), а этот хелпер — страховка
// на будущее: если столбцы всё же закреплены, строка сразу разбивается
// на два блока: 1..frozen и frozen+1..lastCol (текст — в правом, широком
// блоке; фон ставится на всю строку, шов не виден).
function _mergeRow(sheet, row, lastCol) {
  var frozen = 0;
  try { frozen = sheet.getFrozenColumns() || 0; } catch (e) { frozen = 0; }
  if (frozen <= 0 || frozen >= lastCol) {
    return sheet.getRange(row, 1, 1, lastCol).merge();
  }
  if (frozen > 1) { sheet.getRange(row, 1, 1, frozen).merge(); }
  return sheet.getRange(row, frozen + 1, 1, lastCol - frozen).merge();
}

function _createMatrixSheet(ss) {
  var sheet = ss.insertSheet('matrix');
  sheet.setTabColor('#2d7d46');

  var nRoles = INIT_ROLES.length;
  var nPerms = INIT_PERMISSIONS.length;
  var lastCol = 2 + nPerms;

  // ЗАКРЕПЛЕНИЕ — только СТРОКИ (в точности как в существующих листах
  // users/sessions: строки 1–4 закреплены, столбцы — НЕТ). Закрепление
  // столбцов в v2/v3 комбинировалось с объединением строк 1–2 на всю
  // ширину — Google Sheets такое не отображает: лист выглядит пустым
  // (см. v4 в шапке файла). Порядок «сначала закрепление, потом
  // объединения» сохранён из v3.
  sheet.setFrozenRows(5);

  // r1: заголовок (объединение с запасным разбиением по границе)
  var r1 = _mergeRow(sheet, 1, lastCol);
  r1.setValue('ЛИСТ: matrix — МАТРИЦА ДОСТУПА РОЛЕЙ (роль × право; галочка = доступ разрешён)')
    .setFontWeight('bold').setFontSize(12).setVerticalAlignment('middle');
  _headerStyle(r1, '#1a3c5e', true);
  sheet.getRange(1, 1, 1, lastCol).setBackground('#1a3c5e');

  // r2: инструкция — объединена на всю ширину (в v2 не была объединена,
  // перенос текста был зажат шириной колонки A)
  var r2 = _mergeRow(sheet, 2, lastCol);
  r2.setValue(
    'ИНСТРУКЦИЯ: источник истины для системы доступа приложения. Строка 4 — технические ID (НЕ переименовывать, не удалять), строка 5 — названия. ' +
    'Колонка A — role_id (технический, не менять), колонка B — название роли (должно ТОЧНО совпадать с role в листе users). ' +
    'НОВОЕ ПРАВО: добавить колонку (строка 4 = perm_id, строка 5 = название) и строку в лист permissions. ' +
    'НОВАЯ РОЛЬ: добавить строку ниже последней (A = role_id, B = название) и строку в лист roles. ' +
    'Роль «Админ» всегда сохраняет все права. Задвоение ID недопустимо.')
    .setWrap(true).setFontSize(9).setFontStyle('italic').setFontColor('#333333');
  sheet.setRowHeight(2, 90);

  // r3: версия/дата
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy');
  sheet.getRange('A3').setValue('Сгенерировано: ' + today + ' • версия матрицы: 1 • Task 293 • одноразовый скрипт RoleMatrixInit.gs')
    .setFontSize(9).setFontColor('#777777');

  // r4: технические заголовки
  var head4 = ['role_id', 'role_name'];
  for (var p = 0; p < nPerms; p++) { head4.push(INIT_PERMISSIONS[p][0]); }
  var r4 = sheet.getRange(4, 1, 1, 2 + nPerms);
  r4.setValues([head4]);
  _headerStyle(r4, '#4a4a4a', false);
  r4.setFontFamily('Consolas').setFontSize(9).setWrap(false);

  // r5: человекочитаемые названия
  var head5 = ['', 'Роль'];
  for (var p2 = 0; p2 < nPerms; p2++) { head5.push(INIT_PERMISSIONS[p2][1]); }
  var r5 = sheet.getRange(5, 1, 1, 2 + nPerms);
  r5.setValues([head5]);
  _headerStyle(r5, '#1a3c5e', true);
  r5.setWrap(true).setHorizontalAlignment('center').setVerticalAlignment('bottom');

  // r6+: роли и значения
  var values = [];
  for (var r = 0; r < nRoles; r++) {
    var rid = INIT_ROLES[r][0];
    var row = [rid, INIT_ROLES[r][1]];
    for (var c = 0; c < nPerms; c++) {
      var pid = INIT_PERMISSIONS[c][0];
      row.push(INIT_MATRIX[rid][pid] === true);
    }
    values.push(row);
  }
  var dataRange = sheet.getRange(6, 1, nRoles, 2 + nPerms);
  dataRange.setValues(values);
  dataRange.setHorizontalAlignment('center');
  sheet.getRange(6, 1, nRoles, 1).setFontFamily('Consolas').setFontSize(9).setHorizontalAlignment('left');
  sheet.getRange(6, 2, nRoles, 1).setFontWeight('bold').setHorizontalAlignment('left');

  // Чекбоксы на область значений
  sheet.getRange(6, 3, nRoles, nPerms)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().setAllowInvalid(false).build())
    .setHorizontalAlignment('center');

  // Визуальное оформление
  sheet.setColumnWidth(1, 110);           // role_id
  sheet.setColumnWidth(2, 130);           // Роль
  for (var w = 3; w <= 2 + nPerms; w++) { sheet.setColumnWidth(w, 64); }
  sheet.getRange(6, 1, nRoles, 1).setBackground('#f5f5f5');
  sheet.getRange(6, 2, nRoles, 1).setBackground('#eef3f8');
  // Чередование строк для читаемости
  for (var z = 0; z < nRoles; z++) {
    if (z % 2 === 1) { sheet.getRange(6 + z, 3, 1, nPerms).setBackground('#fafafa'); }
    if (INIT_ROLES[z][3] === true) { // системные роли — выделить
      sheet.getRange(6 + z, 1, 1, 2 + nPerms).setBorder(true, true, true, true, true, true, '#c9a227', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    }
  }
  sheet.getRange('B5').setBorder(true, null, null, null, null, null, '#ffffff', SpreadsheetApp.BorderStyle.SOLID);

  // Мягкая защита технических строк и колонок
  _softProtect(sheet.getRange(1, 1, 5, 2 + nPerms), 'matrix: строки 1–5 (заголовки и ID) — не редактировать');
  _softProtect(sheet.getRange(6, 1, nRoles, 2), 'matrix: колонки A–B (ID и названия ролей) — менять только осознанно');
}

function _createPermissionsSheet(ss) {
  var sheet = ss.insertSheet('permissions');
  sheet.setTabColor('#8a8a8a');

  var n = INIT_PERMISSIONS.length;

  // ЗАКРЕПЛЕНИЕ — только строки, по образцу существующих листов (v4);
  // столбцы НЕ закрепляем (причина «пустых листов» v3 — см. шапку).
  sheet.setFrozenRows(4);

  var r1 = _mergeRow(sheet, 1, 8);
  r1.setValue('ЛИСТ: permissions — реестр прав доступа (справочник)')
    .setFontWeight('bold').setFontSize(12);
  _headerStyle(r1, '#1a3c5e', true);
  sheet.getRange(1, 1, 1, 8).setBackground('#1a3c5e');
  var r2 = _mergeRow(sheet, 2, 8);
  r2.setValue(
    'ИНСТРУКЦИЯ: справочник всех прав приложения, расширяется при добавлении новых разделов/функционалов. ' +
    'perm_id (A) — технический ID, латиница, НЕ переименовывать и не удалять (на него ссылается matrix строка 4). ' +
    'Название (B) — показывается в админ-панели. Конфликт с (E) — perm_id через запятую, с которыми право взаимоисключается. ' +
    'Системное (F) — право, которое нельзя отключать (admin.panel). Активно (G) — временное выключение права без удаления.')
    .setWrap(true).setFontSize(9).setFontStyle('italic').setFontColor('#333333');
  sheet.setRowHeight(2, 90);
  sheet.getRange('A3').setValue('Сгенерировано: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy') + ' • Task 293')
    .setFontSize(9).setFontColor('#777777');

  var headers = ['perm_id', 'Название', 'Описание', 'Группа', 'Конфликт с', 'Системное', 'Активно', 'Добавлено'];
  var r4 = sheet.getRange(4, 1, 1, headers.length);
  r4.setValues([headers]);
  _headerStyle(r4, '#4a4a4a', true);

  sheet.getRange(5, 1, n, 8).setValues(INIT_PERMISSIONS);
  sheet.getRange(5, 1, n, 1).setFontFamily('Consolas').setFontSize(9);
  sheet.getRange(5, 2, n, 1).setFontWeight('bold');
  sheet.getRange(5, 4, n, 1).setWrap(false);
  sheet.getRange(5, 3, n, 1).setWrap(true);

  sheet.setColumnWidth(1, 150); sheet.setColumnWidth(2, 160);
  sheet.setColumnWidth(3, 380); sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 130); sheet.setColumnWidth(6, 90);
  sheet.setColumnWidth(7, 80);  sheet.setColumnWidth(8, 90);

  _softProtect(sheet.getRange(4, 1, 1, 8), 'permissions: строка заголовков — не редактировать');
}

function _createRolesSheet(ss) {
  var sheet = ss.insertSheet('roles');
  sheet.setTabColor('#8a8a8a');

  var n = INIT_ROLES.length;

  // ЗАКРЕПЛЕНИЕ — только строки, по образцу существующих листов (v4);
  // столбцы НЕ закрепляем (причина «пустых листов» v3 — см. шапку).
  sheet.setFrozenRows(4);

  var r1 = _mergeRow(sheet, 1, 5);
  r1.setValue('ЛИСТ: roles — реестр ролей (справочник)')
    .setFontWeight('bold').setFontSize(12);
  _headerStyle(r1, '#1a3c5e', true);
  sheet.getRange(1, 1, 1, 5).setBackground('#1a3c5e');
  var r2 = _mergeRow(sheet, 2, 5);
  r2.setValue(
    'ИНСТРУКЦИЯ: Название роли (B) должно ТОЧНО совпадать со значением role в листе users — по нему сервер находит роль пользователя. ' +
    'Системные роли (D): «Запрет», «Общий доступ», «Админ» — защищены от удаления. Роль «Админ» всегда имеет все права (строка в matrix не нужна «полная» — сервер гарантирует). ' +
    'Порядок (E) — сортировка в админ-панели. role_id (A) — технический, НЕ переименовывать.')
    .setWrap(true).setFontSize(9).setFontStyle('italic').setFontColor('#333333');
  sheet.setRowHeight(2, 90);
  sheet.getRange('A3').setValue('Сгенерировано: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy') + ' • Task 293')
    .setFontSize(9).setFontColor('#777777');

  var headers = ['role_id', 'Название', 'Описание', 'Системная', 'Порядок'];
  var r4 = sheet.getRange(4, 1, 1, headers.length);
  r4.setValues([headers]);
  _headerStyle(r4, '#4a4a4a', true);

  sheet.getRange(5, 1, n, 5).setValues(INIT_ROLES);
  sheet.getRange(5, 1, n, 1).setFontFamily('Consolas').setFontSize(9);
  sheet.getRange(5, 2, n, 1).setFontWeight('bold');
  sheet.getRange(5, 3, n, 1).setWrap(true);

  sheet.setColumnWidth(1, 120); sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(3, 420); sheet.setColumnWidth(4, 90);
  sheet.setColumnWidth(5, 70);

  _softProtect(sheet.getRange(4, 1, 1, 5), 'roles: строка заголовков — не редактировать');
}
