// ============================================================
// VacationsDiagnose.gs — Диагностика «отпуска не формируются
// в шахматке» (Task 280 — табель_КИП_ИОС)
// ============================================================
// ЧТО ПРОВЕРЯЕТ (всё — в лог «Выполнение», Ctrl+Enter):
//   0. Какая версия WorkSchedule.gs сейчас в проекте (Task 279+?)
//      — ловит случай «файл заменили, а задеплоился старый» или
//      «в проекте два WorkSchedule-файла и победил старый»;
//   1. Лист «Отпуска»: шапка (строка 1), число строк;
//   2. Каждая строка: id / таб_номер / часть / даты — типы ячеек
//      и распознаёт ли их сервер (Date | «10.08.2026» | мусор);
//   3. Каждый таб_номер — есть ли такой сотрудник в листе
//      «Сотрудники» (несовпадение = «О» пишется, но в шахматке
//      НЕ отображается — сетка строится по списку сотрудников);
//   4. Симуляция «Сформировать» на выбранный месяц: сколько
//      «О» будет вставлено/перекрыто, что мешает (ручные правки,
//      период вне года/месяца), + какие месяцы года затронуты;
//   5. Лист «Записи_графика»: читаются ли даты, есть ли уже
//      авто-«О» за месяц;
//   6. ВЕРДИКТ: конкретные причины и что делать.
//
// ЗАПУСК (в редакторе Apps Script проекта табели):
//   1. Создать файл VacationsDiagnose.gs (или вставить код в
//      любой существующий .gs), Ctrl+S — сохранить;
//   2. Выбрать в выпадающем списке функций vacationsDiagnose;
//   3. ▶ Run:
//        vacationsDiagnose()          — текущий месяц;
//        vacationsDiagnose(2026, 6)   — конкретный месяц;
//   4. Ctrl+Enter («Выполнение») — весь лог скопировать и
//      прислать в чат: по нему будет видно причину точно.
//
// БЕЗОПАСНОСТЬ: функция ТОЛЬКО ЧИТАЕТ (getValue/getValues) —
// ни одной ячейки не меняется, данные не трогаются. После
// диагностики файл можно удалить из проекта.
// Не зависит от WorkSchedule.gs (свой парсер дат) — работает
// даже если в проекте лежит старая версия.
// ============================================================

/**
 * Диагностика отпусков табель_КИП_ИОС (read-only).
 * @param {number} [year]  — год симуляции (по умолчанию текущий).
 * @param {number} [month] — месяц симуляции 1..12 (по умолчанию текущий).
 */
function vacationsDiagnose(year, month) {
  var SPREADSHEET_ID = '1MQtW-CWCmjlu-SAeVBllKDP6NRkiOkmW-7xgOjHskWY';
  var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
                'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

  var now = new Date();
  var Y = (year !== undefined && year !== null) ? parseInt(year, 10) : now.getFullYear();
  var M = (month !== undefined && month !== null) ? parseInt(month, 10) : now.getMonth() + 1;
  if (isNaN(Y)) Y = now.getFullYear();
  if (isNaN(M) || M < 1 || M > 12) M = now.getMonth() + 1;

  var problems = [];   // критичные причины («О» не появится)
  var warnings = [];   // не критично, но лучше поправить
  var periods = [];    // валидные периоды, попадающие в год Y
  var simDays = 0;     // дней «О» в симуляции месяца (заполняется ниже)

  function log(s) { Logger.log(s); }
  function prob(s) { problems.push(s); log('✗ ПРОБЛЕМА: ' + s); }
  function warn(s) { warnings.push(s); log('⚠ ' + s); }

  // --- Вердикт (вызывается и при досрочном выходе) ---
  function printVerdict() {
    log('');
    log('==========================================================');
    log('ВЕРДИКТ (' + MONTHS[M - 1] + ' ' + Y + ')');
    log('==========================================================');
    if (problems.length > 0) {
      log('НАЙДЕНО ПРИЧИН: ' + problems.length + ' — каждая помечена «✗» выше.');
      if (simDays > 0) {
        log('Тем не менее частично «О» проставится (' + simDays +
            ' дн. — см. симуляцию): у остальных строк причины выше.');
      }
      log('Исправьте данные листа «Отпуска» (формат дат 10.08.2026, таб_номер');
      log('строго из листа «Сотрудники») и повторите «Сформировать».');
    } else if (periods.length === 0) {
      log('Данные читаются, но валидных периодов на год ' + Y + ' НЕТ: отпусков');
      log('за ' + Y + ' в листе «Отпуска» не значится — «Сформировать» проставлять');
      log('нечего. Проверьте ГОД в датах периодов и год, который формируете.');
    } else if (simDays === 0) {
      log('Данные корректны, но периоды НЕ пересекают ' + MONTHS[M - 1] + ' ' + Y + '.');
      log('Сформируйте месяц, в который попадает отпуск (см. список месяцев выше),');
      log('или запустите диагностику нужного месяца: vacationsDiagnose(' + Y + ', N).');
    } else {
      log('ДАННЫЕ И КОД В ПОРЯДКЕ: «Сформировать» за ' + MONTHS[M - 1] + ' ' + Y +
          ' проставит «О» — ' + simDays + ' дн. (см. симуляцию).');
      log('Если в приложении «О» всё равно нет — исполняется СТАРАЯ версия:');
      log('  1) в редакторе Apps Script: Ctrl+S (проект СОХРАНЁН? без сохранения');
      log('     «новая версия» деплоит старый код!);');
      log('  2) Развернуть → Управление развертываниями → ✏️ Изменить →');
      log('     Версия: «Новая версия» → Развернуть (в СТАРОМ развертывании,');
      log('     URL не меняется; адрес должен быть тот же, что в коде:');
      log('     script.google.com/macros/s/AKfycbyt…/exec);');
      log('  3) в браузере: Ctrl+Shift+R, а лучше закрыть ВСЕ вкладки приложения');
      log('     и открыть заново (service worker обновляется со 2-й загрузки).');
      log('  4) После «Сформировать» тост обязан показать «отпусков отмечено');
      log('     ' + simDays + ' дн.» — если строки про отпуска в тосте нет вообще,');
      log('     значит задеплоилась старая версия (п. 1–2).');
    }
    log('');
    log('Этот лог (Ctrl+A, Ctrl+C в окне «Выполнение») можно прислать в чат —');
    log('по нему причина «отпуска не работают» видна точно.');
  }

  log('==========================================================');
  log('ДИАГНОСТИКА ОТПУСКОВ — ' + MONTHS[M - 1] + ' ' + Y + ' (табель_КИП_ИОС)');
  log('==========================================================');

  // --- 0. Версия WorkSchedule.gs в проекте ---
  log('');
  log('--- 0. КОД ПРОЕКТА (редактор) ---');
  var has279 = (typeof WorkSchedule !== 'undefined') &&
               (typeof WorkSchedule._parseSheetDate === 'function');
  if (has279) {
    log('✓ WorkSchedule.gs — версия Task 279 или новее: строки без id и');
    log('  даты-текст («10.08.2026») читаются сервером.');
  } else {
    prob('WorkSchedule.gs в проекте СТАРЫЙ (нет _parseSheetDate — до Task 279):');
    log('  listVacations выбрасывает строки с пустым id и датами-текстом —');
    log('  «отпуска не формируются» именно из-за этого. Замените файл на');
    log('  версию Task 279 (scripts/WorkSchedule.gs из репозитория) и задеплойте.');
    log('  Внимание: если вы вставляли код НОВЫМ файлом рядом со старым');
    log('  WorkSchedule.gs — удалите старый (два файла с var WorkSchedule');
    log('  конфликтуют, побеждает один из них непредсказуемо).');
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // --- 1. Лист «Отпуска» ---
  log('');
  log('--- 1. ЛИСТ «ОТПУСКА» ---');
  var vac = ss.getSheetByName('Отпуска');
  if (!vac) {
    prob('Листа «Отпуска» в таблице НЕТ — generateMonth молча пропускает');
    log('  отпуска (в тосте будет «отпуска не проверены: sheet_not_found»).');
    log('  Создайте лист: запустите vacationsInitSheet() из VacationsInit.gs.');
    printVerdict();
    return;
  }
  var lastRow = vac.getLastRow();
  var a1 = String(vac.getRange(1, 1).getValue()).trim();
  if (a1 !== 'id') {
    prob('Строка 1 листа «Отпуска» — не шапка (в A1: «' + (a1 || 'пусто') + '»).');
    log('  Приложение читает данные строго со строки 2: данные, стоящие в');
    log('  строке 1, НЕ видны. Запустите vacationsInitSheet() — она вставит');
    log('  шапку сверху и сдвинет данные вниз (данные не теряются).');
  }
  var dataRows = Math.max(0, lastRow - 1);
  log('Строк данных: ' + dataRows);
  if (dataRows === 0) {
    prob('Лист «Отпуска» ПУСТ — периоды отпусков не введены.');
    log('  «Сформировать» не может проставить «О» без периодов. Введите');
    log('  строки: таб_номер (из «Сотрудники»), часть 1–3, дата_начала,');
    log('  дата_окончания (формат 10.08.2026) — или через страницу');
    log('  «Отпуска» в приложении, или vacationsSeedDemo() для проверки.');
    printVerdict();
    return;
  }

  // --- 2. Сотрудники ---
  log('');
  log('--- 2. ЛИСТ «СОТРУДНИКИ» ---');
  var empSheet = ss.getSheetByName('Сотрудники');
  var empTabs = {};   // таб → ФИО
  var empCount = 0;
  if (empSheet && empSheet.getLastRow() >= 2) {
    var ev = empSheet.getRange(2, 1, empSheet.getLastRow() - 1, 2).getValues();
    for (var e = 0; e < ev.length; e++) {
      var etab = String(ev[e][0] === null || ev[e][0] === undefined ? '' : ev[e][0]).trim();
      if (!etab) continue;
      empTabs[etab] = String(ev[e][1] || '').trim();
      empCount++;
    }
  }
  log('Сотрудников: ' + empCount);
  if (empCount === 0) {
    prob('Лист «Сотрудники» пуст или не найден — неоткуда брать таб_номера.');
  }

  // --- 3. Построчный разбор листа «Отпуска» ---
  log('');
  log('--- 3. СТРОКИ «ОТПУСКА» (разбор как на сервере) ---');
  var vals = vac.getRange(2, 1, dataRows, 6).getValues();
  var yearStart = new Date(Y, 0, 1);
  var yearEnd = new Date(Y + 1, 0, 1);
  var emptyIds = 0, textDates = 0;

  for (var i = 0; i < vals.length; i++) {
    var rn = i + 2;
    var idRaw = vals[i][0], tabRaw = vals[i][1], partRaw = vals[i][2];
    var dRaw = vals[i][3], eRaw = vals[i][4], comRaw = vals[i][5];
    var tab = String(tabRaw === null || tabRaw === undefined ? '' : tabRaw).trim();
    var idS = (idRaw === null || idRaw === undefined || idRaw === '') ? '' : String(idRaw).trim();
    var dStart = diagParseDate(dRaw);
    var dEnd = diagParseDate(eRaw);
    var rowHeader = 'строка ' + rn + ': id=' + (idS || '—') +
        ', таб=' + (tab || '—') +
        ', часть=' + (partRaw === '' || partRaw === null ? '—' : diagShow(partRaw)) +
        ', нач=' + diagShow(dRaw) + ', ок=' + diagShow(eRaw);
    log(rowHeader + (comRaw ? '' : ''));

    // Полностью пустая строка — сервер пропускает молча, не ошибка
    if (!idS && !tab && !dStart) {
      log('  → пустая строка — сервер пропустит (не ошибка)');
      continue;
    }

    // id пуст: Task 279 читает, но кнопка «Удалить» скрыта + init лечит
    if (!idS) {
      emptyIds++;
      warn('строка ' + rn + ': id пуст — читается (Task 279), но в приложении');
      log('  у периода не будет кнопки «Удалить». Запустите vacationsInitSheet()');
      log('  — id дозаполнится автоматически.');
    }

    // дата_начала — единственное КРИТИЧНОЕ поле чтения
    if (!dStart) {
      prob('строка ' + rn + ': дата_начала ' + diagShow(dRaw) + ' (' + diagTypeName(dRaw) +
           ') НЕ РАСПОЗНАНА — сервер ИГНОРИРУЕТ строку целиком.');
      log('  Годные форматы: настоящая дата либо текст «10.08.2026» / «1.8.26» /');
      log('  «2026-08-10». Числа, «10-08-2026», «10.08» и прочее — не читаются.');
      continue;
    }

    // дата_окончания: пусто → 1 день (это норма); мусор → тоже 1 день (предупредить)
    var endEff = dEnd || dStart;
    if (!dEnd && eRaw !== null && eRaw !== undefined && String(eRaw).trim() !== '') {
      warn('строка ' + rn + ': дата_окончания ' + diagShow(eRaw) + ' (' + diagTypeName(eRaw) +
           ') не распознана — сервер возьмёт 1 день (только дата_начала).');
      log('  Если задумывался период — исправьте формат на 10.08.2026.');
    }
    if (dEnd && dEnd.getTime() < dStart.getTime()) {
      warn('строка ' + rn + ': дата_начала ПОЗЖЕ даты_окончания — сервер');
      log('  проставит 0 дней. Поменяйте даты местами.');
    }

    // Даты-текст: читаются (Task 279), но лучше конвертнуть (init лечит)
    if (!(dRaw instanceof Date) || (eRaw !== null && eRaw !== undefined &&
        String(eRaw).trim() !== '' && !(eRaw instanceof Date))) {
      textDates++;
    }

    // таб_номер → «Сотрудники»
    if (!tab) {
      prob('строка ' + rn + ': таб_номер ПУСТ — «О» запишется «в никуда» и в');
      log('  шахматке не отразится. Укажите таб из листа «Сотрудники».');
      continue;
    }
    if (!empTabs.hasOwnProperty(tab)) {
      prob('строка ' + rn + ': таб_номер «' + tab + '» НЕ НАЙДЕН в «Сотрудники» — «О»');
      log('  будет записан в «Записи_графика», но в шахматке НЕ отразится: сетка');
      log('  строится по списку сотрудников. Таб должен совпадать посимвольно,');
      log('  включая ведущие нули («017» ≠ «17») и пробелы.');
      log('  Табы в «Сотрудники»: ' + Object.keys(empTabs).join(', ').slice(0, 300));
    } else {
      log('  → сотрудник: ' + (empTabs[tab] || '(ФИО пусто)') + ' [таб ' + tab + ']');
    }

    // Год: listVacations возвращает только периоды, пересекающие год Y
    if (endEff.getTime() < yearStart.getTime() || dStart.getTime() >= yearEnd.getTime()) {
      warn('строка ' + rn + ': период ' + diagIso(dStart) + '…' + diagIso(endEff) +
           ' НЕ пересекает год ' + Y + ' — «Сформировать» за ' + Y + ' его не проставит.');
      continue;
    }
    periods.push({ row: rn, tab: tab, start: dStart, end: endEff,
                   tabOk: empTabs.hasOwnProperty(tab) });
  }
  if (emptyIds > 0 || textDates > 0) {
    warn('Итого: пустых id — ' + emptyIds + ', дат-текстом — ' + textDates +
         '. Запустите vacationsInitSheet() (без force) — самолечение');
    log('  Task 279 дозаполнит id и конвертирует текстовые даты в настоящие.');
  }

  // --- 4. Симуляция «Сформировать» на M.Y ---
  log('');
  log('--- 4. СИМУЛЯЦИЯ «СФОРМИРОВАТЬ» (' + MONTHS[M - 1] + ' ' + Y + ') ---');
  var monthStart = new Date(Y, M - 1, 1);
  var monthEnd = new Date(Y, M, 1);

  // Существующие записи месяца (та же логика, что listEntries)
  var entriesSheet = ss.getSheetByName('Записи_графика');
  var entryIndex = {};   // "ISO|таб" → {статус, источник}
  var entriesTotal = 0, entriesBadDate = 0, vacAuto = 0, vacManual = 0;
  if (entriesSheet && entriesSheet.getLastRow() >= 2) {
    var gLast = entriesSheet.getLastRow();
    var gv = entriesSheet.getRange(2, 1, gLast - 1, 6).getValues();  // A..F
    for (var g = 0; g < gv.length; g++) {
      var dcell = gv[g][0];
      if (!(dcell instanceof Date)) {
        if (gv[g][0] !== '' && gv[g][0] !== null) entriesBadDate++;
        continue;
      }
      if (dcell < monthStart || dcell >= monthEnd) continue;
      var gtab = String(gv[g][1] === null || gv[g][1] === undefined ? '' : gv[g][1]).trim();
      var gstat = String(gv[g][2] || '').trim();
      var gsrc = String(gv[g][5] || '').trim();
      entryIndex[diagIso(dcell) + '|' + gtab] = { 'статус': gstat, 'источник': gsrc };
      entriesTotal++;
      if (gstat === 'О') { if (gsrc === 'руч') vacManual++; else vacAuto++; }
    }
  } else {
    warn('Лист «Записи_графика» пуст или не найден — «Сформировать» вставит');
    log('  все записи заново (это не ошибка, если таблица новая).');
  }
  log('Записей месяца в «Записи_графика»: ' + entriesTotal +
      ' (авто-«О»: ' + vacAuto + ', ручных «О»: ' + vacManual + ')');
  if (entriesBadDate > 0) {
    warn('В «Записи_графика» ' + entriesBadDate + ' строк, где дата в столбце A —');
    log('  не настоящая дата (текст/число): сервер эти строки не видит.');
  }
  if (vacAuto > 0) {
    log('✓ За месяц УЖЕ есть авто-«О» (' + vacAuto + ') — сервер ранее их писал:');
    if (vacAuto > 0 && periods.length === 0) {
      log('  это следы прошлой генерации; текущий лист «Отпуска» их больше не');
      log('  покрывает — повторное «Сформировать» их УДАЛИТ (идемпотентность).');
    }
  }

  var simInsert = 0, simUpdate = 0, simBlocked = 0, simAlready = 0;
  var simByEmp = {};
  var blockedSamples = [];
  for (var pi = 0; pi < periods.length; pi++) {
    var per = periods[pi];
    var cur = new Date(Math.max(per.start.getTime(), monthStart.getTime()));
    while (cur.getTime() <= per.end.getTime() && cur.getTime() < monthEnd.getTime()) {
      var isoV = diagIso(cur);
      var exV = entryIndex[isoV + '|' + per.tab];
      var empAgg = simByEmp[per.tab];
      if (!empAgg) empAgg = simByEmp[per.tab] = { insert: 0, update: 0, blocked: 0, already: 0, visible: per.tabOk };
      if (exV) {
        if (exV['источник'] === 'руч') {
          simBlocked++; empAgg.blocked++;
          if (blockedSamples.length < 12) blockedSamples.push(isoV + ' [' + per.tab + ']');
        } else if (exV['статус'] === 'О') {
          simAlready++; empAgg.already++;
        } else {
          simUpdate++; empAgg.update++;
        }
      } else {
        simInsert++; empAgg.insert++;
      }
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    }
  }
  simDays = simInsert + simUpdate + simAlready;
  log('Если нажать «Сформировать» (' + MONTHS[M - 1] + ' ' + Y + '):');
  log('  вставится новых «О»: ' + simInsert);
  log('  авто-смен перекроется на «О»: ' + simUpdate);
  log('  уже стоит «О» (прошлая генерация): ' + simAlready);
  log('  дней занято РУЧНЫМИ правками (сервер не тронет): ' + simBlocked +
      (blockedSamples.length ? ' — ' + blockedSamples.join(', ') : ''));
  for (var empKey in simByEmp) {
    var agg = simByEmp[empKey];
    log('  таб ' + empKey + (agg.visible ? '' : ' (НЕ в «Сотрудники» — в сетке НЕ отразится!)') +
        ': новых ' + agg.insert + ', перекрыто ' + agg.update +
        ', уже «О» ' + agg.already + ', руч ' + agg.blocked);
  }

  // Какие месяцы года затрагивают периоды (без обращения к записям)
  if (periods.length > 0) {
    log('Периоды года ' + Y + ' затрагивают месяцы:');
    for (var mo = 0; mo < 12; mo++) {
      var ms = new Date(Y, mo, 1);
      var me = new Date(Y, mo + 1, 1);
      var dcnt = 0;
      for (var qi = 0; qi < periods.length; qi++) {
        var q = periods[qi];
        var s = Math.max(q.start.getTime(), ms.getTime());
        var en = Math.min(q.end.getTime(), me.getTime() - 1);
        if (en >= s) dcnt += Math.round((en - s) / 86400000) + 1;
      }
      if (dcnt > 0) log('  ' + MONTHS[mo] + ': ' + dcnt + ' дн. «О»');
    }
  }

  printVerdict();
}

// ============================================================
// diagParseDate / diagSafeDate — копия серверного парсера
// (WorkSchedule._parseSheetDate, Task 279). Файл самодостаточен:
// диагностика работает и со старым WorkSchedule.gs в проекте.
// Date → как есть; «dd.mm.yyyy» / «dd.mm.yy» / «yyyy-mm-dd» → Date;
// остальное (пусто, число, мусор) → null.
// ============================================================
function diagParseDate(v) {
  if (v instanceof Date) return v;
  if (v === null || v === undefined) return null;
  var s = String(v).trim();
  if (!s) return null;
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return diagSafeDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
  if (m) return diagSafeDate(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2})$/);
  if (m) return diagSafeDate(2000 + +m[3], +m[2], +m[1]);
  return null;
}

function diagSafeDate(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (y < 1900 || y > 2100) return null;
  var dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

// ============================================================
// Хелперы вывода
// ============================================================
function diagIso(dt) {
  var m = ('' + (dt.getMonth() + 1)).padStart(2, '0');
  var d = ('' + dt.getDate()).padStart(2, '0');
  return dt.getFullYear() + '-' + m + '-' + d;
}

function diagShow(v) {
  if (v === null || v === undefined) return '—';
  if (v === '') return '—';
  if (v instanceof Date) return diagIso(v) + ' [дата]';
  var s = String(v);
  return '«' + (s.length > 24 ? s.slice(0, 24) + '…' : s) + '»';
}

function diagTypeName(v) {
  if (v === null || v === undefined || v === '') return 'пусто';
  if (v instanceof Date) return 'дата';
  if (typeof v === 'number') return 'число';
  return 'текст';
}
