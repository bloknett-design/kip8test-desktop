// ============================================================
// TabNumbersFix.gs — починка таб_№ с потерянными ведущими нулями
// (Task 304)
// ============================================================
// ПРОБЛЕМА (Task 304): до обновления WorkSchedule.gs приложение
// писало таб_№ в листы «Инструктажи» / «Отпуска» / «Записи_графика»
// ЧЕРЕЗ appendRow. Google Sheets трактует записываемые значения по
// USER_ENTERED-семантике (как будто их напечатали в ячейку):
// числоподобная строка «0871» превращается в ЧИСЛО 871 — ведущий
// ноль теряется. Дальше таб перестаёт сопоставляться со справочником
// «Сотрудники» (там таб — текст «0871»):
//   • бейдж мероприятия в шахматке молча не показывается;
//   • «Сформировать» не проставляет строки по этому мероприятию;
//   • на странице «Инструктажи» вместо ФИО — «таб. № 871».
// Живой пример (03.09.2026): «Инструктажи», id=4, «Повторный»
// инструктаж Романова Д. А. (таб 0871, 30.09.2026) записан как 871.
//
// ЧТО ДЕЛАЕТ fixTabNumbers():
//   1. Читает справочник «Сотрудники» → эталонные таб_номера.
//   2. Сканирует колонки таб_№ листов «Инструктажи» (B),
//      «Отпуска» (B), «Записи_графика» (B) и «Сотрудники» (A):
//        • «871» без нулей, но в справочнике есть «0871» →
//          ячейка перезаписывается канонической формой «0871»;
//        • число, чья строка уже совпадает с таб из справочника →
//          перезаписывается тем же значением, но ТЕКСТОМ;
//        • таб, которого нет в справочнике вовсе → только ЖУРНАЛ
//          (скрипт не знает, что имел в виду человек).
//   3. Ставит колонкам таб_№ текстовый формат '@' на весь столбец
//      (ниже шапки): и ручной ввод «0871» в таблице, и записи
//      нового WorkSchedule.gs хранятся текстом.
//   4. Перепроверяет себя повторным сканом (должно быть 0 проблем).
//
// ЗАЧЕМ СКРИПТ, ЕСЛИ WorkSchedule.gs УЖЕ ИСПРАВЛЕН:
//   новый код защищает БУДУЩИЕ записи; уже испорченные ячейки
//   (записанные старым кодом) остаются числами. Этот скрипт чинит
//   их за один запуск — без ручной правки ячеек.
//
// ИСПОЛЬЗОВАНИЕ (как у StatusCodesInit.gs, Task 299):
//   1. Открыть редактор Apps Script (проект развёртывания Web App —
//      тот же, где WorkSchedule.gs).
//   2. + → Создать файл «TabNumbersFix.gs», вставить содержимое
//      этого файла ЦЕЛИКОМ.
//   3. Выбрать функцию в выпадающем списке и нажать ▶ Run
//      (первый запуск попросит авторизацию — разрешить).
//   4. Результат — в журнале (Ctrl+Enter / «Выполнения»).
//   5. После проверки файл можно удалить из проекта (код
//      приложения его НЕ использует — это разовый инструмент).
//
// ФУНКЦИИ:
//   fixTabNumbers()   — диагностика + починка одним запуском
//                       (рекомендуется). Идемпотентен: повторный
//                       запуск ничего не меняет.
//   tabNumbersStatus()— ТОЛЬКО диагностика (ничего не пишет):
//                       показывает проблемные ячейки и что было бы
//                       исправлено. Безопасно запускать когда угодно.
//
// БЕЗОПАСНОСТЬ:
//   - Меняются ТОЛЬКО ячейки таб_№ перечисленных листов; темы, даты,
//     статусы, id, комментарии не затрагиваются.
//   - Неизвестные таб_номера не перезаписываются — только журнал.
//   - Если у двух сотрудников таб различаются лишь ведущими нулями
//     («0871» и «871») — неоднозначно, такие ячейки пропускаются
//     с записью в журнал (чинить вручную).
//   - Идемпотентность: повторный запуск на уже починенных данных
//     ничего не меняет (0 исправлений).
//   - Таблица открывается по ID явно — исключает запись «не туда».
// ============================================================

// Целевая таблица — «График работы» (тот же ID, что в
// WorkSchedule.gs / StatusCodesInit.gs).
var TN_SPREADSHEET_ID = '1MQtW-CWCmjlu-SAeVBllKDP6NRkiOkmW-7xgOjHskWY';

// (статус починки — заполняется в tnInternalRun)
var TN_RESULT = null;

// ------------------------------------------------------------
// Сканирование: справочник + проблемные ячейки. Ничего не пишет.
// Возвращает { ok, validCount, strippedCollisions, problems: [...] }:
//   problems[i] = { sheet, col, row, current, target, kind }
//     kind: 'pad'    — есть канонический таб с нулями («871»→«0871»)
//           'type'   — значение-число, строка уже валидна → в текст
//           'unknown'— таб нет в справочнике (только журнал)
// ------------------------------------------------------------
function tnScan() {
  var ss = SpreadsheetApp.openById(TN_SPREADSHEET_ID);

  // 1. Справочник таб_номеров (Сотрудники, колонка A)
  var empsSheet = ss.getSheetByName('Сотрудники');
  if (!empsSheet) return { ok: false, error: 'sheet_not_found: Сотрудники' };
  var validTabs = {};        // канонический таб → true
  var strippedMap = {};      // таб без ведущих нулей → канонический
  var collisions = {};       // неоднозначные «без нулей» формы
  var empsLast = empsSheet.getLastRow();
  if (empsLast >= 2) {
    var empVals = empsSheet.getRange(2, 1, empsLast - 1, 1).getValues();
    for (var i = 0; i < empVals.length; i++) {
      var t = String(empVals[i][0] === null || empVals[i][0] === undefined
                     ? '' : empVals[i][0]).trim();
      if (!t) continue;
      validTabs[t] = true;
      var st = TN_STRIP(t);
      if (strippedMap[st] && strippedMap[st] !== t) {
        collisions[st] = true;   // «0871» и «871» — разные сотрудники
      } else {
        strippedMap[st] = t;
      }
    }
  }
  if (!Object.keys(validTabs).length) {
    return { ok: false, error: 'empty: Сотрудники (нет таб_номеров)' };
  }

  // 2. Колонки таб_№ в рабочих листах (+ сам справочник — только
  // нормализация чисел в текст, источник истины он сам)
  var targets = [
    { sheet: 'Сотрудники',     col: 1, isReference: true  },
    { sheet: 'Инструктажи',    col: 2, isReference: false },
    { sheet: 'Отпуска',        col: 2, isReference: false },
    { sheet: 'Записи_графика', col: 2, isReference: false }
  ];
  var problems = [];
  for (var g = 0; g < targets.length; g++) {
    var target = targets[g];
    var sh = ss.getSheetByName(target.sheet);
    if (!sh) {
      Logger.log('⚠ лист «' + target.sheet + '» не найден — пропущен');
      continue;
    }
    var last = sh.getLastRow();
    if (last < 2) continue;
    // getLastRow бывает завышен «стилевым холстом» (урок Task 294:
    // getLastRow=1000 при данных 17×15) — пустые ячейки просто
    // пропускаются циклом ниже.
    var vals = sh.getRange(2, target.col, last - 1, 1).getValues();
    for (var r = 0; r < vals.length; r++) {
      var v = vals[r][0];
      if (v === '' || v === null || v === undefined) continue;
      var s = String(v).trim();
      if (!s) continue;
      var rowNum = r + 2;

      if (validTabs[s]) {
        // Таб корректный. Число в ячейке → перезаписать тем же
        // значением текстом (косметика + единообразие формата).
        if (typeof v === 'number') {
          problems.push({ sheet: target.sheet, col: target.col, row: rowNum,
                          current: s, target: s, kind: 'type' });
        }
        continue;
      }
      // Не совпал точно → ищем канонический с ведущими нулями
      var st2 = TN_STRIP(s);
      if (target.isReference) {
        // Справочник сам себе источник: «871» в «Сотрудники» не
        // чиним — только сообщаем (что имел в виду человек, скрипт
        // не знает; после ручной правки повторный запуск разрулит).
        problems.push({ sheet: target.sheet, col: target.col, row: rowNum,
                        current: s, target: null, kind: 'unknown' });
        continue;
      }
      if (collisions[st2]) {
        Logger.log('⚠ «' + target.sheet + '»!' + TN_A1(target.col) + rowNum +
                   ' = «' + s + '»: неоднозначно (в справочнике есть таб, различающиеся' +
                   ' только нулями) — пропущено, править вручную');
        continue;
      }
      var canonical = strippedMap[st2];
      if (canonical && canonical !== s) {
        problems.push({ sheet: target.sheet, col: target.col, row: rowNum,
                        current: s, target: canonical, kind: 'pad' });
      } else {
        problems.push({ sheet: target.sheet, col: target.col, row: rowNum,
                        current: s, target: null, kind: 'unknown' });
      }
    }
  }
  return {
    ok: true,
    validCount: Object.keys(validTabs).length,
    strippedCollisions: Object.keys(collisions),
    problems: problems
  };
}

// «0871» → «871» (для сопоставления форм с потерянными нулями)
function TN_STRIP(s) {
  var st = String(s).replace(/^0+/, '');
  return st === '' ? '0' : st;
}

// Номер колонки → буква A1 (для читаемых логов; 1→A, 2→B)
function TN_A1(col) {
  var letters = '';
  var c = col;
  while (c > 0) {
    var m = (c - 1) % 26;
    letters = String.fromCharCode(65 + m) + letters;
    c = Math.floor((c - 1) / 26);
  }
  return letters;
}

// ------------------------------------------------------------
// ДИАГНОСТИКА: показать проблемы, ничего не менять
// ------------------------------------------------------------
function tabNumbersStatus() {
  Logger.log('=== Task 304: диагностика таб_№ (только чтение) ===');
  var scan = tnScan();
  if (!scan.ok) {
    Logger.log('✕ ' + scan.error);
    return scan;
  }
  TN_LOG_PROBLEMS(scan);
  Logger.log('Справочник: ' + scan.validCount + ' таб_номеров.');
  if (!scan.problems.length) {
    Logger.log('✓ Проблемных таб_№ не найдено — чинить нечего.');
  }
  return scan;
}

// ------------------------------------------------------------
// ПОЧИНКА: перезаписать проблемные ячейки + текстовый формат
// колонок таб_№. Идемпотентна.
// ------------------------------------------------------------
function fixTabNumbers() {
  Logger.log('=== Task 304: починка таб_№ (ведущие нули) ===');
  var ss = SpreadsheetApp.openById(TN_SPREADSHEET_ID);
  var scan = tnScan();
  if (!scan.ok) {
    Logger.log('✕ ' + scan.error);
    return scan;
  }
  TN_LOG_PROBLEMS(scan);

  var fixed = 0;
  var unknown = 0;
  for (var i = 0; i < scan.problems.length; i++) {
    var p = scan.problems[i];
    if (p.kind === 'unknown') {
      unknown++;
      continue;
    }
    var sh = ss.getSheetByName(p.sheet);
    if (!sh) continue;
    // Текстовый формат ДО записи значения — тот же приём, что в
    // исправленном WorkSchedule.gs (_appendRowKeepText): иначе
    // setValue запишет «0871» снова числом.
    var cell = sh.getRange(p.row, p.col);
    cell.setNumberFormat('@');
    cell.setValue(p.target);
    fixed++;
    Logger.log('• «' + p.sheet + '»!' + TN_A1(p.col) + p.row + ': «' +
               p.current + '» → «' + p.target + '» (' +
               (p.kind === 'pad' ? 'восстановлен ведущий ноль' : 'число → текст') + ')');
  }

  // Текстовый формат на ВЕСЬ столбец таб_№ (ниже шапки): будущий
  // ручной ввод «0871» в таблице тоже сохранит нули. Идемпотентно.
  var columnTargets = [
    { sheet: 'Сотрудники',     col: 1 },
    { sheet: 'Инструктажи',    col: 2 },
    { sheet: 'Отпуска',        col: 2 },
    { sheet: 'Записи_графика', col: 2 }
  ];
  for (var c = 0; c < columnTargets.length; c++) {
    var ct = columnTargets[c];
    var csh = ss.getSheetByName(ct.sheet);
    if (!csh) continue;
    csh.getRange(2, ct.col, csh.getMaxRows() - 1, 1).setNumberFormat('@');
    Logger.log('• «' + ct.sheet + '»: колонка ' + TN_A1(ct.col) +
               ' переведена в текстовый формат');
  }

  if (unknown) {
    Logger.log('⚠ НЕ ИСПРАВЛЕНО (таб нет в справочнике «Сотрудники») — ' +
               unknown + ' шт.: см. список выше; править вручную.');
  }

  // Самопроверка повторным сканом
  var recheck = tnScan();
  var remaining = (recheck.ok ? recheck.problems : []).filter(function(p) {
    return p.kind !== 'unknown';
  }).length;

  Logger.log('');
  if (fixed === 0 && remaining === 0) {
    Logger.log('✓ Данные уже в порядке — исправлений не потребовалось' +
               (unknown ? ' (кроме ' + unknown + ' неизвестных таб — журнал выше)' : '') + '.');
  } else if (remaining === 0) {
    Logger.log('✓ ГОТОВО: исправлено ячеек — ' + fixed + '.' +
               (unknown ? ' Неизвестных таб — ' + unknown + ' (журнал выше).' : ''));
    Logger.log('Проверка в приложении: страница «Инструктажи» — у всех записей ФИО;');
    Logger.log('шахматка — бейдж мероприятия на ячейке; «Сформировать» — без ⚠.');
  } else {
    Logger.log('✕ После починки осталось проблем: ' + remaining + ' — см. журнал.');
  }
  TN_RESULT = { fixed: fixed, unknown: unknown, remaining: remaining };
  return TN_RESULT;
}

// Общий лог проблем (для диагностики и починки)
function TN_LOG_PROBLEMS(scan) {
  if (!scan.problems.length) {
    Logger.log('Проблемных таб_№ не найдено.');
    return;
  }
  Logger.log('Найдено проблемных таб_№: ' + scan.problems.length + ':');
  for (var i = 0; i < scan.problems.length; i++) {
    var p = scan.problems[i];
    var note = p.kind === 'pad'
      ? ' → будет «' + p.target + '» (восстановить ведущие нули)'
      : (p.kind === 'type'
          ? ' → перезаписать текстом «' + p.target + '»'
          : ' — НЕТ в справочнике «Сотрудники» (править вручную)');
    Logger.log('  «' + p.sheet + '»!' + TN_A1(p.col) + p.row + ' = «' + p.current + '»' + note);
  }
}
