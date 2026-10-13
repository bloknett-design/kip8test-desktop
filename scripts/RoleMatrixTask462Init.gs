/**
 * RoleMatrixTask462Init.gs — ОДНОРАЗОВЫЙ скрипт (Task 462, 02.10.2026).
 *
 * ЗАЧЕМ: раздел «Плановые мероприятия» (страница plan-events в хабе
 * «Документация ИОС», создан Task 460) до сих пор не имел СВОЕГО
 * права в матрице — доступ следовал за хабом (права kipios.view /
 * kipios.restricted / flowmeter.view). Task 462 выделяет разделу
 * ОТДЕЛЬНЫЙ столбец матрицы:
 *   · plan.events — «Плановые мероприятия»: видимость раздела
 *     «Плановые мероприятия» в «Документации ИОС» (статичная таблица
 *     периодических работ по месяцам года) и пункта в сайдбаре.
 *
 * ЧТО ДЕЛАЕТ СКРИПТ (идемпотентно — повторный запуск ничего не меняет):
 *   1. Лист «matrix»: добавляет колонку plan.events (r4 = perm_id,
 *      r5 = название; колонка становится ПОСЛЕДНЕЙ правой); чекбоксы
 *      на строки ролей.
 *   2. ГАЛОЧКИ ПО УМОЛЧАНИЮ = ТЕКУЩИЙ доступ к разделу (Task 460),
 *      чтобы при переходе на новое право НИКТО не потерял раздел:
 *      отмечаются роли, у которых есть kipios.view ИЛИ kipios.restricted
 *      ИЛИ flowmeter.view (именно эти права давали «Документацию ИОС»
 *      вместе с «Плановыми мероприятиями»). «Админ» — отмечен всегда
 *      (сервер и так выдаёт админу все права матрицы).
 *      Если колонка УЖЕ существует — галочки НЕ трогаются (пользователь
 *      мог настроить доступ вручную).
 *   3. Лист «permissions»: добавляет строку-справочник нового права.
 *   4. Обновляет метку версии в matrix!A3.
 *   5. Сбрасывает кэш матрицы (roleMatrixInvalidateCache) — изменения
 *      подхватывает сервер сразу (иначе ≤ 5 минут).
 *
 * ДАЛЬШЕ (галочки — руками в таблице): доступ к разделу теперь
 * определяется ТОЛЬКО этим столбцом — снимите/поставьте галочки
 * нужным ролям, изменения подхватываются без релиза приложения
 * (при входе / загрузке страницы / heartbeat, кэш ≤ 5 минут).
 *
 * КЛИЕНТ (sw kipia-test-v686, Task 462): пока колонки в матрице НЕТ,
 * действует прежнее поведение Task 460 (раздел следует за хабом) —
 * переходный период; после запуска этого скрипта — строго по галочке.
 *
 * ЗАПУСК: вставить файл в проект Apps Script (script.google.com —
 * общий проект kip8test/kip8) → выбрать функцию
 * task462AddPlanEventsPermission → «Выполнить» → посмотреть журнал
 * (Вид → Журнал выполнения). Таблицу править не обязательно — скрипт
 * сам пишет колонку и сбрасывает кэш.
 */

var TASK462_SPREADSHEET_ID = '1TmmNZLUArWH38F6NX0gMGar8LMNMQomm_FaGZv9osyk';

var TASK462_PERM_ID   = 'plan.events';
var TASK462_PERM_NAME = 'Плановые мероприятия';
var TASK462_PERM_ROW  = [
  TASK462_PERM_ID,
  TASK462_PERM_NAME,
  'Раздел «Плановые мероприятия» в «Документации ИОС»: статичная таблица периодических работ по месяцам года. До Task 462 доступ следовал за «Документацией ИОС» (kipios.view / kipios.restricted / flowmeter.view)',
  'КИП ИОС',
  '',
  false,
  true,
  '2026-10-02'
];

// Права, которые до Task 462 давали раздел (для галочек по умолчанию).
var TASK462_SOURCE_PERMS = ['kipios.view', 'kipios.restricted', 'flowmeter.view'];

/**
 * Главная функция (запустить один раз в редакторе Apps Script).
 * @return {string} отчёт о выполнении.
 */
function task462AddPlanEventsPermission() {
  var ss = SpreadsheetApp.openById(TASK462_SPREADSHEET_ID);
  Logger.log('Целевая таблица: «' + ss.getName() + '» — ' + ss.getUrl());

  var report = [];

  // --- 1. matrix: колонка plan.events ---
  var m = ss.getSheetByName('matrix');
  if (!m) {
    throw new Error('Лист «matrix» не найден — запустите roleMatrixInit (Task 293).');
  }
  var col = _t462FindPermColumn(m);
  var colCreated = false;
  if (col !== -1) {
    report.push('matrix: колонка «' + TASK462_PERM_ID + '» уже есть (колонка ' +
      _t462ColLetter(col) + ') — галочки НЕ тронуты (доступ уже настроен)');
  } else {
    // последняя непустая perm_id в строке 4 (от C, т.е. индекса 2)
    var lastCol = Math.min(m.getLastColumn() || 2, 60);
    var head4 = m.getRange(4, 1, 1, lastCol).getValues()[0];
    var lastPermCol = 2; // B
    for (var c = 2; c < head4.length; c++) {
      if (String(head4[c] || '').trim()) lastPermCol = c + 1; // 1-based
    }
    var newCol = lastPermCol + 1; // 1-based, сразу после последнего права
    m.insertColumnAfter(lastPermCol);
    m.getRange(4, newCol).setValue(TASK462_PERM_ID);
    m.getRange(5, newCol).setValue(TASK462_PERM_NAME);
    // формат как у соседей (r4 — консолас 9, r5 — заголовок)
    m.getRange(4, newCol).setFontFamily('Consolas').setFontSize(9).setWrap(false);
    m.getRange(5, newCol).setFontWeight('bold').setWrap(true)
      .setHorizontalAlignment('center').setVerticalAlignment('bottom');
    m.setColumnWidth(newCol, 64);
    report.push('matrix: ДОБАВЛЕНА колонка «' + TASK462_PERM_ID + '» (' +
      _t462ColLetter(newCol) + ', после ' + _t462ColLetter(lastPermCol) + ')');
    col = newCol;
    colCreated = true;
  }

  // --- 2. чекбоксы и значения по умолчанию ---
  // Галочки ставим ТОЛЬКО если колонка была только что создана
  // (существующую не трогаем — доступ мог быть настроен руками).
  // Формула дефолта = текущий доступ (Task 460): kipios.view ||
  // kipios.restricted || flowmeter.view; «Админ» — всегда ✓.
  if (!colCreated) {
    report.push('matrix: значения колонки оставлены как есть (см. пункт выше)');
  } else {
    // шапка прав (строка 4) по колонкам — читаем ОДИН раз
    var head4b = m.getRange(4, 1, 1, Math.max(col, 2)).getValues()[0];
    var srcCols = []; // индексы (0-based в data) колонок прав-источников
    for (var sc = 2; sc < head4b.length; sc++) {
      if (TASK462_SOURCE_PERMS.indexOf(String(head4b[sc] || '').trim()) !== -1) {
        srcCols.push(sc);
      }
    }
    var lastRow = Math.min(m.getLastRow() || 0, 2000);
    var data = m.getRange(6, 1, Math.max(lastRow - 5, 1), Math.max(col, 2)).getValues();
    var rolesTouched = 0;
    var grantedList = [];
    for (var r = 0; r < data.length; r++) {
      var roleId = String(data[r][0] || '').trim();
      var roleName = String(data[r][1] || '').trim();
      if (!roleName) continue;
      var isAdmin = (roleId.toLowerCase() === 'admin');
      // какие права-источники у роли отмечены
      var sources = [];
      for (var s = 0; s < srcCols.length; s++) {
        if (_t462IsChecked(data[r][srcCols[s]])) {
          sources.push(String(head4b[srcCols[s]] || '').trim());
        }
      }
      var val = isAdmin || sources.length > 0;
      var cell = m.getRange(6 + r, col);
      cell.setValue(val);
      cell.setHorizontalAlignment('center');
      rolesTouched++;
      if (val) grantedList.push(roleName + (isAdmin ? ' (админ)' :
        ' ← ' + sources.join(' + ')));
    }
    // data validation (чекбокс) на всю колонку ролей — как в Task 293
    if (rolesTouched > 0) {
      m.getRange(6, col, rolesTouched, 1)
        .setDataValidation(SpreadsheetApp.newDataValidation()
          .requireCheckbox().setAllowInvalid(false).build());
    }
    report.push('matrix: чекбоксы проставлены на ' + rolesTouched +
      ' ролях; доступ (✓) сохранён текущим — ' + grantedList.length + ' ролям:');
    for (var g = 0; g < grantedList.length; g++) {
      report.push('      · ' + grantedList[g]);
    }
    report.push('      (снимите/поставьте галочки руками — вступает в силу' +
      ' при входе/heartbeat, кэш ≤ 5 минут)');
  }

  // --- 3. permissions: строка-справочник ---
  var p = ss.getSheetByName('permissions');
  if (!p) {
    report.push('permissions: лист не найден — строка-справочник НЕ добавлена (не критично)');
  } else {
    var pLastRow = Math.min(p.getLastRow() || 0, 2000);
    var pIds = p.getRange(4, 1, Math.max(pLastRow - 3, 1), 1).getValues();
    var exists = false;
    for (var pr = 0; pr < pIds.length; pr++) {
      if (String(pIds[pr][0] || '').trim() === TASK462_PERM_ID) { exists = true; break; }
    }
    if (exists) {
      report.push('permissions: строка «' + TASK462_PERM_ID + '» уже есть — не тронута');
    } else {
      // данные с r5; ищем первую СВОБОДНУЮ строку после последней непустой
      var pTarget = 5;
      for (var pr2 = 0; pr2 < pIds.length; pr2++) {
        if (String(pIds[pr2][0] || '').trim()) pTarget = 5 + pr2 + 1;
      }
      p.getRange(pTarget, 1, 1, TASK462_PERM_ROW.length).setValues([TASK462_PERM_ROW]);
      p.getRange(pTarget, 1).setFontFamily('Consolas').setFontSize(9);
      p.getRange(pTarget, 2).setFontWeight('bold');
      p.getRange(pTarget, 3).setWrap(true);
      report.push('permissions: ДОБАВЛЕНА строка-справочник (строка ' + pTarget + ')');
    }
  }

  // --- 4. метка версии в matrix!A3 ---
  try {
    var a3 = String(m.getRange('A3').getValue() || '');
    if (a3.indexOf('Task 462') === -1) {
      m.getRange('A3').setValue(a3 + ' • Task 462: +plan.events (Плановые мероприятия — отдельное право)')
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

  var msg = 'Task 462: Готово.\n  • ' + report.join('\n  • ') +
    '\n\nДАЛЬШЕ: доступ к «Плановым мероприятиям» определяется только' +
    ' столбцом plan.events — расставьте галочки ролям в таблице' +
    ' (подхватится без релиза: вход / загрузка / heartbeat, кэш ≤5 мин).';
  Logger.log(msg);
  return msg;
}

/** Найти колонку права в matrix (строка 4, от C) — 1-based, -1 если нет. */
function _t462FindPermColumn(m) {
  var lastCol = Math.min(m.getLastColumn() || 2, 60);
  var head4 = m.getRange(4, 1, 1, lastCol).getValues()[0];
  for (var c = 2; c < head4.length; c++) {
    if (String(head4[c] || '').trim() === TASK462_PERM_ID) return c + 1;
  }
  return -1;
}

/** Значение ячейки = включённый чекбокс? (как _rmIsChecked в RoleMatrix.gs) */
function _t462IsChecked(v) {
  if (v === true) { return true; }
  if (v === 1) { return true; }
  if (typeof v === 'string' && v.replace(/^\s+|\s+$/g, '').toUpperCase() === 'TRUE') { return true; }
  return false;
}

/** Буква колонки по 1-based номеру (1=A, 2=B, 27=AA…). */
function _t462ColLetter(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
