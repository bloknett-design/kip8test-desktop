/**
 * RoleMatrixTask340Init.gs — ОДНОРАЗОВЫЙ скрипт (Task 340, 07.09.2026).
 *
 * ЗАЧЕМ: трёхуровневый доступ к разделу «График работы» (в приложении —
 * «Табель учёта рабочего времени»). В матрице KIP8_Access (лист matrix)
 * было ДВА столбца: workschedule.view и workschedule.edit. Task 340
 * добавляет ТРЕТИЙ — workschedule.view.min («ограниченный просмотр»):
 *   · workschedule.edit      — полный доступ (просмотр + внесение);
 *   · workschedule.view      — просмотр: клик по ячейке шахматки → окно
 *     «Мероприятия в этот день» (окно кодов НЕ открывается); клик по
 *     ФИО → карточка сотрудника БЕЗ элементов правки; все кнопки
 *     доступны, кроме «Сформировать»;
 *   · workschedule.view.min  — ограниченный просмотр: как view, НО
 *     карточка по ФИО НЕ открывается, скрыты кнопки «Сформировать» и
 *     «Итоги учёта», в шахматке скрыты работники «Мастер КИПиА».
 *
 * ЧТО ДЕЛАЕТ СКРИПТ (идемпотентно — повторный запуск ничего не меняет):
 *   1. Лист «matrix»: добавляет колонку workschedule.view.min
 *      (r4 = perm_id, r5 = название, чекбоксы на строки ролей;
 *      колонка становится ПОСЛЕДНЕЙ правой — рядом со столбцами
 *      «График работы»); все галочки СНЯТЫ, кроме «Админ».
 *   2. Лист «permissions»: добавляет строку-справочник нового права.
 *   3. Обновляет метку версии в matrix!A3.
 *   4. Сбрасывает кэш матрицы (roleMatrixInvalidateCache) — изменения
 *      подхватывает сервер сразу (иначе ≤ 5 минут).
 *
 * ГДЕ ГАЛОЧКИ СТАВИТЬ (руками в таблице после запуска):
 *   · ограниченный просмотр (например, «КИП ИОС дежурный») — отметить
 *     ТОЛЬКО workschedule.view.min. Если при этом останется отмеченной
 *     и workschedule.view — действует ОГРАНИЧЕННЫЙ уровень (min
 *     сильнее view; правка двух галочек не требуется, но чище —
 *     оставить одну);
 *   · обычный просмотр — только workschedule.view;
 *   · полный доступ — workschedule.edit (просмотр включён);
 *   · «Админ» — все права всегда (сервер выдаёт автоматически).
 *
 * ЗАПУСК: вставить файл в проект Apps Script (script.google.com) →
 * выбрать функцию task340AddViewMinPermission → «Выполнить» →
 * посмотреть журнал (Вид → Журнал выполнения). Таблицу править не
 * обязательно — скрипт сам пишет колонку и сбрасывает кэш.
 *
 * ПОРЯДОК ДЕПЛОЯ (ВАЖНО!): сначала этот скрипт + новая версия
 * WorkSchedule.gs (_requireRead пускает чтение по view.min), и только
 * ПОТОМ снимайте у ролей workschedule.view, оставляя только
 * workschedule.view.min — старый сервер отклонял бы чтение по
 * одному лишь view.min (см. DEPLOY-Task340-workschedule-view-min.md).
 */

var TASK340_SPREADSHEET_ID = '1TmmNZLUArWH38F6NX0gMGar8LMNMQomm_FaGZv9osyk';

var TASK340_PERM_ID   = 'workschedule.view.min';
var TASK340_PERM_NAME = 'График работы — ограниченный просмотр';
var TASK340_PERM_ROW  = [
  TASK340_PERM_ID,
  TASK340_PERM_NAME,
  'Ограниченный просмотр раздела «График работы»: окно «Мероприятия в этот день» доступно, окно выбора кодов/карточка сотрудника не открываются; скрыты кнопки «Сформировать» и «Итоги учёта»; в шахматке скрыты работники «Мастер КИПиА»',
  'График работы',
  '',
  false,
  true,
  '2026-09-07'
];

/**
 * Главная функция (запустить один раз в редакторе Apps Script).
 * @return {string} отчёт о выполнении.
 */
function task340AddViewMinPermission() {
  var ss = SpreadsheetApp.openById(TASK340_SPREADSHEET_ID);
  Logger.log('Целевая таблица: «' + ss.getName() + '» — ' + ss.getUrl());

  var report = [];

  // --- 1. matrix: колонка workschedule.view.min ---
  var m = ss.getSheetByName('matrix');
  if (!m) {
    throw new Error('Лист «matrix» не найден — запустите roleMatrixInit (Task 293).');
  }
  var col = _t340FindPermColumn(m);
  if (col !== -1) {
    report.push('matrix: колонка «' + TASK340_PERM_ID + '» уже есть (колонка ' +
      _t340ColLetter(col) + ') — не тронута');
  } else {
    // последняя непустая perm_id в строке 4 (от C, т.е. индекс 3+)
    var lastCol = Math.min(m.getLastColumn() || 2, 60);
    var head4 = m.getRange(4, 1, 1, lastCol).getValues()[0];
    var lastPermCol = 2; // B
    for (var c = 2; c < head4.length; c++) {
      if (String(head4[c] || '').trim()) lastPermCol = c + 1; // 1-based
    }
    var newCol = lastPermCol + 1; // 1-based, сразу после последнего права
    m.insertColumnAfter(lastPermCol);
    m.getRange(4, newCol).setValue(TASK340_PERM_ID);
    m.getRange(5, newCol).setValue(TASK340_PERM_NAME);
    // формат как у соседей (r4 — консолас 9, r5 — заголовок)
    m.getRange(4, newCol).setFontFamily('Consolas').setFontSize(9).setWrap(false);
    m.getRange(5, newCol).setFontWeight('bold').setWrap(true)
      .setHorizontalAlignment('center').setVerticalAlignment('bottom');
    m.setColumnWidth(newCol, 64);
    report.push('matrix: ДОБАВЛЕНА колонка «' + TASK340_PERM_ID + '» (' +
      _t340ColLetter(newCol) + ', после ' + _t340ColLetter(lastPermCol) + ')');
    col = newCol;
  }

  // --- 2. чекбоксы и значения по умолчанию (все ✗, Админ ✓) ---
  var lastRow = Math.min(m.getLastRow() || 0, 2000);
  var data = m.getRange(6, 1, lastRow - 5, Math.max(col, 2)).getValues();
  var rolesTouched = 0;
  for (var r = 0; r < data.length; r++) {
    var roleId = String(data[r][0] || '').trim();
    var roleName = String(data[r][1] || '').trim();
    if (!roleName) continue;
    var isAdmin = (roleId.toLowerCase() === 'admin');
    var cell = m.getRange(6 + r, col);
    cell.setValue(isAdmin);
    cell.setHorizontalAlignment('center');
    rolesTouched++;
  }
  // data validation (чекбокс) на всю колонку ролей — как в Task 293
  if (rolesTouched > 0) {
    m.getRange(6, col, rolesTouched, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation()
        .requireCheckbox().setAllowInvalid(false).build());
  }
  report.push('matrix: чекбоксы проставлены на ' + rolesTouched +
    ' ролях (все сняты, «Админ» отмечен — сервер и так даёт админу все права)');

  // --- 3. permissions: строка-справочник ---
  var p = ss.getSheetByName('permissions');
  if (!p) {
    report.push('permissions: лист не найден — строка-справочник НЕ добавлена (не критично)');
  } else {
    var pLastRow = Math.min(p.getLastRow() || 0, 2000);
    var pIds = p.getRange(4, 1, Math.max(pLastRow - 3, 1), 1).getValues();
    var exists = false;
    for (var pr = 0; pr < pIds.length; pr++) {
      if (String(pIds[pr][0] || '').trim() === TASK340_PERM_ID) { exists = true; break; }
    }
    if (exists) {
      report.push('permissions: строка «' + TASK340_PERM_ID + '» уже есть — не тронута');
    } else {
      // данные с r5; ищем первую СВОБОДНУЮ строку после последней непустой
      var pTarget = 5;
      for (var pr2 = 0; pr2 < pIds.length; pr2++) {
        if (String(pIds[pr2][0] || '').trim()) pTarget = 5 + pr2 + 1;
      }
      p.getRange(pTarget, 1, 1, TASK340_PERM_ROW.length).setValues([TASK340_PERM_ROW]);
      p.getRange(pTarget, 1).setFontFamily('Consolas').setFontSize(9);
      p.getRange(pTarget, 2).setFontWeight('bold');
      p.getRange(pTarget, 3).setWrap(true);
      report.push('permissions: ДОБАВЛЕНА строка-справочник (строка ' + pTarget + ')');
    }
  }

  // --- 4. метка версии в matrix!A3 ---
  try {
    var a3 = String(m.getRange('A3').getValue() || '');
    if (a3.indexOf('Task 340') === -1) {
      m.getRange('A3').setValue(a3 + ' • Task 340: +workschedule.view.min (ограниченный просмотр графика)')
        .setFontSize(9).setFontColor('#777777');
      report.push('matrix!A3: метка версии дополнена');
    }
  } catch (e) { /* не критично */ }

  // --- 5. сброс кэша сервера (если RoleMatrix.gs в этом же проекте) ---
  try {
    if (typeof roleMatrixInvalidateCache === 'function') {
      roleMatrixInvalidateCache();
      report.push('кэш матрицы СБРОШЕН (roleMatrixInvalidateCache)');
    } else {
      report.push('RoleMatrix.gs не в проекте — сбросьте кэш позже или подождите ≤5 мин');
    }
  } catch (e) {
    report.push('сброс кэша не удался: ' + e + ' (подождите ≤5 мин — кэш истечёт сам)');
  }

  var msg = 'Task 340: Готово.\n  • ' + report.join('\n  • ') +
    '\n\nДАЛЬШЕ (галочки — руками в таблице):' +
    '\n  · ограниченный просмотр (напр., «КИП ИОС дежурный»): отметить workschedule.view.min' +
    ' (workschedule.view можно оставить — min сильнее, но чище снять);' +
    '\n  · обычный просмотр: workschedule.view; полный доступ: workschedule.edit.';
  Logger.log(msg);
  return msg;
}

/** Найти колонку права в matrix (строка 4, от C) — 1-based, -1 если нет. */
function _t340FindPermColumn(m) {
  var lastCol = Math.min(m.getLastColumn() || 2, 60);
  var head4 = m.getRange(4, 1, 1, lastCol).getValues()[0];
  for (var c = 2; c < head4.length; c++) {
    if (String(head4[c] || '').trim() === TASK340_PERM_ID) return c + 1;
  }
  return -1;
}

/** Буква колонки по 1-based номеру (1=A, 2=B, 27=AA…). */
function _t340ColLetter(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
