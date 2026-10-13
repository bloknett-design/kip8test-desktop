// ============================================================
// ValidationRules.gs — Правила валидации показаний расходомеров
// ============================================================
// Лист «flowmeter_validation_rules» в той же Google Таблице, что
// hozraschet_meters / hozraschet_archive:
//   1enZSq7K8pwJVzaAI_tbXZtvATqARTxH0lSU4c-wc1eY
//
// Эндпоинты (через Code.gs):
//   flowmeter.getValidationRules — прочитать правила для meterId (или все)
//
// Структура листа «flowmeter_validation_rules» (строка 1 — заголовки):
//   A: meterId         — номер позиции (1–12)
//   B: min_cons        — нижняя граница расхода за период (число)
//   C: max_cons        — верхняя граница расхода за период (число)
//   D: expected_days   — ожидаемое кол-во дней между снятиями (1/7/30 и т.д.)
//   E: gcal_ratio_min  — мин Gcal/consumption (только для расходомеров пара)
//   F: gcal_ratio_max  — макс Gcal/consumption
//   G: temp_min        — нижняя граница температуры (°C)
//   H: temp_max        — верхняя граница температуры (°C)
//
// Правила (Task 199, Фаза 1 — 9 правил; Task 200, Фаза 2 — + WRONG_METER):
//   HARD-BLOCK (сервер возвращает ошибку, не пишет):
//     SIGN_NEG         — prev<0 или curr<0 (сценарий #12, «знак»)
//     DATE_INCONSISTENT — dateCurr < datePrev (сценарий #6)
//   SOFT-CONFIRM (записывается, в archive.Q пишется код с деталью):
//     JUMP_NEGATIVE    — consumption<0 && meter.allowNegative!=='yes'
//                        (сценарий #4 REVERSED, для не-конденсатных)
//     JUMP_HIGH        — consumption > max_cons × 3 (сценарий #3/#10)
//     JUMP_LOW         — 0 ≤ consumption < min_cons / 10 (сценарий #10)
//     PERIOD_MISMATCH  — daysBetween != expected_days (сценарий #7)
//     TEMP_OUT_OF_RANGE — temp вне [temp_min, temp_max] (сценарий #8)
//     GCAL_RATIO       — для расходомеров пара: gcal/consumption вне
//                        [gcal_ratio_min, gcal_ratio_max] (сценарий #9)
//     DUPLICATE        — те же (prev, curr) что в последней записи архива,
//                        поданные тем же автором в течение 5 минут
//                        (сценарий #11)
//     WRONG_METER      — (Task 200, Фаза 2) consumption или пара (prev, curr)
//                        совпадает с последней записью другого счётчика
//                        за последние 7 дней. Эвристики: уровень 1 (exact-match
//                        consumption) + уровень 3 (swap = совпадение пары prev/curr).
//                        Близкое совпадение (уровень 2) отключено — много false
//                        positives. Параметры — WRONG_METER_PARAMS ниже.
// ============================================================

var ValidationRules = {

  SPREADSHEET_ID: '1enZSq7K8pwJVzaAI_tbXZtvATqARTxH0lSU4c-wc1eY',
  RULES_SHEET_NAME: 'flowmeter_validation_rules',
  HELP_SHEET_NAME: 'flowmeter_validation_help',   // Task 222
  DATA_START_ROW: 2,

  // Task 222 — дефолтные описания кодов правил в простой форме для
  // пользователей. Используются:
  //   • при инициализации листа flowmeter_validation_help
  //     (функция flowmeterInitValidationHelp ниже);
  //   • как fallback, если лист отсутствует или код не найден в нём
  //     (getHelpMap возвращает DEFAULT_HELP вместо пустого объекта).
  // При изменении этих строк желательно повторно запустить
  // flowmeterInitValidationHelp(true) — функция перезапишет лист.
  DEFAULT_HELP: {
    SIGN_NEG:          'Введено отрицательное показание — проверьте, нет ли знака «минус» по ошибке.',
    DATE_INCONSISTENT: 'Текущая дата раньше предыдущей — проверьте даты снятия показаний.',
    JUMP_NEGATIVE:     'Расход получился отрицательным — возможно, перепутаны предыдущие и текущие показания.',
    JUMP_HIGH:         'Расход намного больше обычного — возможна лишняя цифра или ошибка ввода.',
    JUMP_LOW:          'Расход намного меньше обычного — возможна ошибка ввода.',
    PERIOD_MISMATCH:   'Период между показаниями не соответствует ожидаемому.',
    TEMP_OUT_OF_RANGE: 'Температура вне допустимого диапазона.',
    GCAL_RATIO:        'Соотношение Гкал/расход вне допустимого диапазона.',
    DUPLICATE:         'Такие же показания уже были введены недавно этим же автором — возможен дубликат.',
    WRONG_METER:       'Показания похожи на запись другого счётчика — проверьте, что выбран верный счётчик.'
  },

  // Коды правил (используются в archive.Q как строка «CODE: detail; ...»)
  CODES: {
    SIGN_NEG:         'SIGN_NEG',
    DATE_INCONSISTENT:'DATE_INCONSISTENT',
    JUMP_NEGATIVE:   'JUMP_NEGATIVE',
    JUMP_HIGH:        'JUMP_HIGH',
    JUMP_LOW:         'JUMP_LOW',
    PERIOD_MISMATCH:  'PERIOD_MISMATCH',
    TEMP_OUT_OF_RANGE:'TEMP_OUT_OF_RANGE',
    GCAL_RATIO:       'GCAL_RATIO',
    DUPLICATE:        'DUPLICATE',
    WRONG_METER:      'WRONG_METER'   // Task 200, Фаза 2
  },

  // ============================================================
  // Task 200 — параметры WRONG_METER (Фаза 2)
  // ============================================================
  //   LOOKBACK_DAYS         — сколько дней назад смотреть в архиве
  //   EXACT_MATCH_THRESHOLD — точное совпадение = расхождение < этого значения
  //                           (напр. 0.01 → 100.00 и 100.005 считаются совпадением)
  //   MIN_CONSUMPTION       — игнорировать consumption < этого (нулевые/микро-расходы
  //                           дают много ложных совпадений)
  //   SWAP_DETECTION        — включить уровень 3 (совпадение пары prev/curr с другим
  //                           счётчиком = оператор ввёл чужие показания целиком)
  // Близкое совпадение (уровень 2) отключено по умолчанию — слишком много false
  // positives между счётчиками одного типа (два воздуха, два газа и т.п.).
  // ============================================================
  WRONG_METER_PARAMS: {
    LOOKBACK_DAYS: 7,
    EXACT_MATCH_THRESHOLD: 0.01,
    MIN_CONSUMPTION: 1.0,
    SWAP_DETECTION: true
  },

  // Hard-block коды (сервер возвращает ошибку, не пишет показания)
  HARD_BLOCK_CODES: {
    SIGN_NEG: true,
    DATE_INCONSISTENT: true
  },

  // ============================================================
  // _getSheet — получить лист rules (или null)
  // ============================================================
  _getSheet: function() {
    var ss = SpreadsheetApp.openById(this.SPREADSHEET_ID);
    return ss.getSheetByName(this.RULES_SHEET_NAME);
  },

  // ============================================================
  // _requireRead — авторизация (любая роль с правом чтения расходомеров)
  // ============================================================
  _requireRead: function(token) {
    if (!token) return { error: { ok: false, error: 'no_session' } };
    var session = Utils.findSessionByToken(token);
    if (!session) return { error: { ok: false, error: 'no_session' } };
    var user = Utils.findUserById(session.user_id);
    if (!user) return { error: { ok: false, error: 'no_session' } };
    if (Flowmeter.READ_ROLES.indexOf(user.role) === -1) {
      return { error: { ok: false, error: 'access_denied' } };
    }
    return { user: user };
  },

  // ============================================================
  // getRulesForMeter(meterId) — словарь правил для meterId
  // Возвращает null, если правила не заданы (валидация пропускается).
  // ============================================================
  getRulesForMeter: function(meterId) {
    var sheet = this._getSheet();
    if (!sheet) return null;

    var lastRow = sheet.getLastRow();
    if (lastRow < this.DATA_START_ROW) return null;

    // Читаем все строки правил, ищем по meterId (колонка A = 1)
    var range = sheet.getRange(this.DATA_START_ROW, 1, lastRow - this.DATA_START_ROW + 1, 8);
    var values = range.getValues();
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      if (parseInt(row[0], 10) === parseInt(meterId, 10)) {
        return {
          meterId:       parseInt(row[0], 10),
          min_cons:      (row[1] === '' || row[1] === null) ? null : parseFloat(row[1]),
          max_cons:      (row[2] === '' || row[2] === null) ? null : parseFloat(row[2]),
          expected_days: (row[3] === '' || row[3] === null) ? null : parseInt(row[3], 10),
          gcal_ratio_min:(row[4] === '' || row[4] === null) ? null : parseFloat(row[4]),
          gcal_ratio_max:(row[5] === '' || row[5] === null) ? null : parseFloat(row[5]),
          temp_min:      (row[6] === '' || row[6] === null) ? null : parseFloat(row[6]),
          temp_max:      (row[7] === '' || row[7] === null) ? null : parseFloat(row[7])
        };
      }
    }
    return null;
  },

  // ============================================================
  // listRules — эндпоинт flowmeter.getValidationRules
  // payload: { token, id? } — id опциональный; без id возвращает все правила
  // Возвращает: { ok, data: { rules: [...] } } или { rules: {...} } для одного
  // ============================================================
  listRules: function(payload) {
    var auth = this._requireRead(payload.token);
    if (auth.error) return auth.error;

    var sheet = this._getSheet();
    if (!sheet) {
      return { ok: true, data: { rules: [] } };
    }
    var lastRow = sheet.getLastRow();
    if (lastRow < this.DATA_START_ROW) {
      return { ok: true, data: { rules: [] } };
    }
    var range = sheet.getRange(this.DATA_START_ROW, 1, lastRow - this.DATA_START_ROW + 1, 8);
    var values = range.getValues();
    var rules = [];
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      if (!row[0] && !row[1]) continue;  // пропускаем пустые
      rules.push({
        meterId:       parseInt(row[0], 10),
        min_cons:      (row[1] === '' || row[1] === null) ? null : parseFloat(row[1]),
        max_cons:      (row[2] === '' || row[2] === null) ? null : parseFloat(row[2]),
        expected_days: (row[3] === '' || row[3] === null) ? null : parseInt(row[3], 10),
        gcal_ratio_min:(row[4] === '' || row[4] === null) ? null : parseFloat(row[4]),
        gcal_ratio_max:(row[5] === '' || row[5] === null) ? null : parseFloat(row[5]),
        temp_min:      (row[6] === '' || row[6] === null) ? null : parseFloat(row[6]),
        temp_max:      (row[7] === '' || row[7] === null) ? null : parseFloat(row[7])
      });
    }
    // Фильтрация по id (если передан)
    if (payload && payload.id) {
      var id = parseInt(payload.id, 10);
      rules = rules.filter(function(r) { return r.meterId === id; });
    }
    return { ok: true, data: { rules: rules } };
  },

  // ============================================================
  // compute(meter, payload, rules, lastArchive, recentAllMeters) — вычислить аномалии
  // ============================================================
  // Параметры:
  //   meter           — объект строки из hozraschet_meters (с полем
  //                    allowNegative — 'yes'/'no'/пусто)
  //   payload         — то, что прислал клиент: { id, prev, curr, datePrev,
  //                    dateCurr, temp, gcal, unit }
  //   rules           — объект из getRulesForMeter (или null = правила
  //                    не заданы, валидация пропускается)
  //   lastArchive     — последняя запись архива для этого meterId
  //                    (или null). { prev, curr, modName, timestamp }.
  //   recentAllMeters — (Task 200) последние записи архива для ВСЕХ счётчиков
  //                    за последние LOOKBACK_DAYS дней (массив или null).
  //                    Если null/пустой — правило WRONG_METER пропускается.
  // Возвращает: { codes: [..], hardBlock: null|{code, message}, detail: '...' }
  //   codes      — массив строк вида 'CODE: detail'
  //   hardBlock  — если не null, сервер должен вернуть ошибку
  //                (caller сам формирует error response)
  // ============================================================
  compute: function(meter, payload, rules, lastArchive, recentAllMeters) {
    var codes = [];
    var hardBlock = null;

    var prev = parseFloat(payload.prev);
    var curr = parseFloat(payload.curr);
    if (isNaN(prev)) prev = 0;
    if (isNaN(curr)) curr = 0;

    var consumption = curr - prev;

    // ===== HARD-BLOCK #12: SIGN_NEG =====
    if (prev < 0 || curr < 0) {
      var signMsg = 'Отрицательное значение показания: prev=' + prev + ', curr=' + curr +
                    '. Проверьте, не введён ли знак «минус» случайно.';
      codes.push(this.CODES.SIGN_NEG + ': prev=' + prev + ', curr=' + curr);
      hardBlock = { code: this.CODES.SIGN_NEG, message: signMsg };
      // Дальше не считаем — данные невалидны
      return { codes: codes, hardBlock: hardBlock };
    }

    // ===== HARD-BLOCK #6: DATE_INCONSISTENT =====
    var dp = Flowmeter._clientToDateObj(payload.datePrev);
    var dc = Flowmeter._clientToDateObj(payload.dateCurr);
    if (dp && dc && dc < dp) {
      var dateMsg = 'Дата текущая раньше предыдущей: prev=' + payload.datePrev +
                    ', curr=' + payload.dateCurr + '. Проверьте даты.';
      codes.push(this.CODES.DATE_INCONSISTENT + ': prev=' + payload.datePrev +
                  ', curr=' + payload.dateCurr);
      hardBlock = { code: this.CODES.DATE_INCONSISTENT, message: dateMsg };
      return { codes: codes, hardBlock: hardBlock };
    }

    // Дальше — только soft-confirm правила (если rules заданы)
    if (!rules) {
      // Правила не заданы — пропускаем остальные проверки
      return { codes: codes, hardBlock: hardBlock };
    }

    var allowNegative = String(meter && meter.allowNegative || '').toLowerCase() === 'yes';

    // ===== SOFT #4 → JUMP_NEGATIVE (merged) =====
    // Для счётчиков, у которых allowNegative!=='yes', отрицательный расход
    // = переставленные цифры (REVERSED) или опечатка.
    if (consumption < 0 && !allowNegative) {
      codes.push(this.CODES.JUMP_NEGATIVE + ': расход ' + this._fmt(consumption) +
                  ' < 0 (curr < prev), allowNegative!=' + (allowNegative ? 'yes' : 'no'));
    }

    // ===== SOFT #3 / #10: JUMP_HIGH =====
    // consumption > max_cons × 3 (включает случай EXTRA_DIGIT ×10 — деталь
    // покажет, насколько аномально)
    if (rules.max_cons !== null && !isNaN(rules.max_cons)) {
      var highThreshold = rules.max_cons * 3;
      if (consumption > highThreshold) {
        var factor = rules.max_cons > 0 ? (consumption / rules.max_cons) : 0;
        codes.push(this.CODES.JUMP_HIGH + ': расход ' + this._fmt(consumption) +
                    ' > max×3=' + this._fmt(highThreshold) +
                    ' (превышение в ' + this._fmt(factor) + ' раз от max_cons=' +
                    this._fmt(rules.max_cons) + ')');
      }
      // ===== SOFT #10: JUMP_LOW =====
      // 0 ≤ consumption < min_cons / 10 (только положительные — чтобы не
      // дублировать JUMP_NEGATIVE для отрицательных)
      if (consumption >= 0 && rules.min_cons !== null && !isNaN(rules.min_cons)) {
        var lowThreshold = rules.min_cons / 10;
        if (consumption < lowThreshold) {
          codes.push(this.CODES.JUMP_LOW + ': расход ' + this._fmt(consumption) +
                      ' < min/10=' + this._fmt(lowThreshold) +
                      ' (ожидается не менее ' + this._fmt(rules.min_cons) + ')');
        }
      }
    }

    // ===== SOFT #7: PERIOD_MISMATCH =====
    // daysBetween != expected_days. Допуск ±1 день (для «Ежедневно» могут
    // быть 0/1/2 — взяли/сдали в один день или пропустили день).
    if (rules.expected_days !== null && !isNaN(rules.expected_days) && dp && dc) {
      var daysBetween = Math.round((dc - dp) / 86400000);
      if (daysBetween < 0) daysBetween = 0;
      var tolerance = (rules.expected_days === 1) ? 1 : Math.max(1, Math.round(rules.expected_days * 0.1));
      if (Math.abs(daysBetween - rules.expected_days) > tolerance) {
        codes.push(this.CODES.PERIOD_MISMATCH + ': дней между показаниями ' + daysBetween +
                    ', ожидается ' + rules.expected_days +
                    ' (допуск ±' + tolerance + ')');
      }
    }

    // ===== SOFT #8: TEMP_OUT_OF_RANGE =====
    // Только если temp передан (не null/не пусто) и в rules заданы границы
    if (payload.temp !== null && payload.temp !== undefined && payload.temp !== '' &&
        rules.temp_min !== null && rules.temp_max !== null) {
      var t = parseFloat(payload.temp);
      if (!isNaN(t) && (t < rules.temp_min || t > rules.temp_max)) {
        codes.push(this.CODES.TEMP_OUT_OF_RANGE + ': температура ' + t +
                    '°C вне [' + rules.temp_min + ', ' + rules.temp_max + ']');
      }
    }

    // ===== SOFT #9: GCAL_RATIO =====
    // Только для расходомеров пара (по полю param содержит «пара») и если
    // в rules задан диапазон gcal_ratio. consumption должен быть > 0.
    //
    // Физический смысл: ratio = Гкал / тонны = энтальпия пара (Гкал/т).
    // ВАЖНО — допущение о периоде (Task 234, уточнено пользователем):
    //   • payload.gcal — значение Гкал ЗА СУТКИ (суточное потребление теплоты,
    //     которое оператор вводит в форме показаний).
    //   • consumption = curr − prev — масса пара в тоннах, накопленная
    //     за ВЕСЬ ПЕРИОД между снятиями (между datePrev и dateCurr).
    //   • Текущая формула `g / consumption` корректна ТОЛЬКО когда период
    //     равен 1 суткам (expected_days = 1): тогда и числитель, и знаменатель
    //     относятся к одним суткам, и ratio = Гкал/т за день = энтальпия.
    //   • Все расходомеры пара в текущей конфигурации — суточные
    //     (expected_days = 1 в flowmeter_validation_rules), поэтому формула
    //     работает как задумано.
    //   • ЕСЛИ в будущем добавят недельный/месячный паровой счётчик
    //     (expected_days != 1), формула начнёт молчаливо давать заниженный
    //     ratio (в expected_days раз ниже реальной энтальпии). В этом случае
    //     нужно нормализовать: `ratio = (g * rules.expected_days) / consumption`,
    //     либо калибровать gcal_ratio_min/max индивидуально под период.
    //   • См. также обсуждение в worklog.md → Task 234 (архив диалога).
    if (consumption > 0 && payload.gcal !== null && payload.gcal !== undefined &&
        payload.gcal !== '' && rules.gcal_ratio_min !== null && rules.gcal_ratio_max !== null) {
      var g = parseFloat(payload.gcal);
      if (!isNaN(g) && g > 0) {
        var ratio = g / consumption;
        if (ratio < rules.gcal_ratio_min || ratio > rules.gcal_ratio_max) {
          codes.push(this.CODES.GCAL_RATIO + ': отношение Gcal/consumption=' +
                      this._fmt(ratio) + ' вне [' + rules.gcal_ratio_min + ', ' +
                      rules.gcal_ratio_max + '] (consumption=' + this._fmt(consumption) +
                      ', Gcal=' + this._fmt(g) + ')');
        }
      }
    }

    // ===== SOFT #11: DUPLICATE =====
    // Те же (prev, curr) что в последней записи архива, тот же автор,
    // в течение 5 минут (300 000 мс)
    if (lastArchive && lastArchive.prev === prev && lastArchive.curr === curr) {
      // Проверяем автора и время
      var sameAuthor = false;
      var recent = false;
      if (lastArchive.modName && meter && meter.modName) {
        sameAuthor = String(lastArchive.modName).toLowerCase() ===
                     String(meter.modName).toLowerCase();
      }
      if (lastArchive.timestamp) {
        var lastTs = new Date(lastArchive.timestamp);
        var nowTs = new Date();
        if (!isNaN(lastTs.getTime())) {
          var elapsed = nowTs - lastTs;
          recent = elapsed >= 0 && elapsed < 300000;  // < 5 минут
        }
      }
      if (sameAuthor && recent) {
        codes.push(this.CODES.DUPLICATE + ': те же показания prev=' + prev +
                    ', curr=' + curr + ' уже введены этим же автором менее 5 минут назад');
      }
    }

    // ===== SOFT #5: WRONG_METER (Task 200, Фаза 2) =====
    // Эвристика: совпадение расхода или пары (prev, curr) с другим счётчиком.
    // Только exact-match (уровень 1) и swap (уровень 3 — совпадение пары).
    // Близкое совпадение (уровень 2) отключено — слишком много false positives
    // между счётчиками одного типа (два расходомера воздуха и т.п.).
    if (recentAllMeters && recentAllMeters.length > 0 &&
        consumption >= this.WRONG_METER_PARAMS.MIN_CONSUMPTION) {
      var threshold = this.WRONG_METER_PARAMS.EXACT_MATCH_THRESHOLD;
      var myMeterId = meter && meter.id ? parseInt(meter.id, 10) : null;
      var wrongFound = false;

      for (var ri = 0; ri < recentAllMeters.length; ri++) {
        var other = recentAllMeters[ri];
        var otherId = parseInt(other.meterId, 10);
        if (otherId === myMeterId) continue;  // пропускаем себя

        // Уровень 1: exact-match по consumption
        var otherCons = parseFloat(other.consumption);
        if (!isNaN(otherCons) && Math.abs(otherCons - consumption) < threshold) {
          codes.push(this.CODES.WRONG_METER + ': расход ' + this._fmt(consumption) +
                      ' совпадает с расходомером id=' + otherId +
                      ' (' + this._esc(other.hoz) + '), расход ' + this._fmt(otherCons) +
                      ' — возможно, оператор ввёл показания не в тот счётчик');
          wrongFound = true;
          break;
        }

        // Уровень 3: swap-detection — пара (prev, curr) совпадает с последней
        // записью другого счётчика = оператор скопировал чужие показания целиком
        if (this.WRONG_METER_PARAMS.SWAP_DETECTION &&
            !isNaN(parseFloat(other.prev)) && !isNaN(parseFloat(other.curr)) &&
            Math.abs(parseFloat(other.prev) - prev) < threshold &&
            Math.abs(parseFloat(other.curr) - curr) < threshold) {
          codes.push(this.CODES.WRONG_METER + ': пара (prev=' + prev +
                      ', curr=' + curr + ') совпадает с последней записью расходомера id=' +
                      otherId + ' (' + this._esc(other.hoz) +
                      ') — оператор, вероятно, ввёл чужие показания целиком');
          wrongFound = true;
          break;
        }
      }
    }

    var detail = codes.join('; ');
    return { codes: codes, hardBlock: hardBlock, detail: detail };
  },

  // ============================================================
  // Task 222 — getHelpMap(): прочитать лист flowmeter_validation_help и
  // вернуть {CODE: описание}. Не требует авторизации — вызывается
  // сервером из FlowmeterArchive.listArchive для добавления anomalyHelp
  // в ответ архивного эндпоинта. Если лист отсутствует или пуст —
  // возвращает DEFAULT_HELP (10 кодов с предзаполненными описаниями).
  // Кэшируется на 10 минут через CacheService (опционально).
  // ============================================================
  getHelpMap: function() {
    var result = {};
    try {
      var ss = SpreadsheetApp.openById(this.SPREADSHEET_ID);
      var sheet = ss.getSheetByName(this.HELP_SHEET_NAME);
      if (sheet) {
        var lastRow = sheet.getLastRow();
        if (lastRow >= this.DATA_START_ROW) {
          var range = sheet.getRange(this.DATA_START_ROW, 1, lastRow - this.DATA_START_ROW + 1, 2);
          var values = range.getValues();
          for (var i = 0; i < values.length; i++) {
            var code = String(values[i][0] || '').trim();
            var desc = String(values[i][1] || '').trim();
            if (code && desc) result[code] = desc;
          }
        }
      }
    } catch (e) {
      // Тихо игнорируем — fallback ниже даст DEFAULT_HELP
    }
    // Если лист пуст/отсутствует — сливаем с DEFAULT_HELP (любые
    // пользовательские записи из листа перебивают дефолт).
    var keys = Object.keys(this.DEFAULT_HELP);
    for (var k = 0; k < keys.length; k++) {
      if (!result[keys[k]]) result[keys[k]] = this.DEFAULT_HELP[keys[k]];
    }
    return result;
  },

  // ============================================================
  // Task 222 — listHelp(payload): эндпоинт flowmeter.getValidationHelp.
  // Авторизация любая роль с правом чтения расходомеров.
  // Возвращает { ok: true, data: { help: {CODE: описание, ...} } }.
  // ============================================================
  listHelp: function(payload) {
    var auth = this._requireRead(payload.token);
    if (auth.error) return auth.error;
    return { ok: true, data: { help: this.getHelpMap() } };
  },

  // ============================================================
  // _fmt — форматировать число для detail-строки (2 знака после запятой)
  // ============================================================
  _fmt: function(n) {
    if (typeof n !== 'number' || isNaN(n)) return String(n);
    return n.toFixed(2);
  },

  // ============================================================
  // _esc — экранировать HTML-спецсимволы для безопасной вставки в detail
  // (используется в WRONG_METER detail, где подставляется other.hoz)
  // ============================================================
  _esc: function(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};

// ============================================================
// flowmeterInitRules — одноразовая инициализация листа rules
// ============================================================
// Запускается один раз вручную из редактора Apps Script:
//   1. Выбрать функцию flowmeterInitRules
//   2. Нажать ▶ Run
//   3. Проверить лог — «Rules: лист создан / обновлён»
// После создания листа можно вручную заполнить строки 2..13
// (по одной на каждый meterId 1..12) значениями min_cons/max_cons/
// expected_days/gcal_ratio_min/gcal_ratio_max/temp_min/temp_max.
// Альтернатива: запустить flowmeterInitRulesFromArchive(true) —
// заполнить min/max/expected_days автоматически из истории архива.
// ============================================================
function flowmeterInitRules() {
  var SPREADSHEET_ID = '1enZSq7K8pwJVzaAI_tbXZtvATqARTxH0lSU4c-wc1eY';
  var SHEET_NAME = 'flowmeter_validation_rules';

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    Logger.log('Rules: лист «' + SHEET_NAME + '» создан.');
  } else {
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      Logger.log('Rules: лист уже содержит ' + (lastRow - 1) + ' строк. ' +
                 'Для пересоздания удалите лист вручную и запустите снова.');
      return;
    }
    Logger.log('Rules: лист «' + SHEET_NAME + '» уже существует, пустой — заполняем заголовки.');
  }

  var headers = [
    '№ счётчика',         // A=1  (meterId)
    'Мин. расход',        // B=2  (min_cons)
    'Макс. расход',       // C=3  (max_cons)
    'Период (дни)',       // D=4  (expected_days)
    'Мин. Гкал/расход',   // E=5  (gcal_ratio_min)
    'Макс. Гкал/расход',  // F=6  (gcal_ratio_max)
    'Мин. температура',   // G=7  (temp_min)
    'Макс. температура'   // H=8  (temp_max)
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4a86e8');
  headerRange.setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  for (var c = 1; c <= headers.length; c++) {
    sheet.autoResizeColumn(c);
  }
  Logger.log('Rules: инициализация завершена. Заголовки: ' + headers.join(', '));
  Logger.log('Теперь заполните строки 2..13 вручную (по meterId 1..12) ' +
             'ИЛИ запустите flowmeterInitRulesFromArchive(true) для автозаполнения.');
}

// ============================================================
// flowmeterInitRulesFromArchive — автозаполнение правил из истории архива
// ============================================================
// @param {boolean} force - перезаписать существующие строки (по умолчанию false)
// Заполняет min_cons/max_cons/expected_days для meterId 1..12 на основе
// исторических данных из hozraschet_archive:
//   - min_cons = 0.5 × historical_min_consumption (округлено до 2 знаков)
//   - max_cons = 1.5 × historical_max_consumption
//   - expected_days = мода daysBetween (или 1 если нет данных)
//   - gcal_ratio_min/max — НЕ заполняются (требуют ручной настройки
//     для расходомеров пара, см. System Prompt, раздел «Расходомеры»)
//   - temp_min/max — НЕ заполняются (требуют ручной настройки)
// ============================================================
function flowmeterInitRulesFromArchive(force) {
  var SPREADSHEET_ID = '1enZSq7K8pwJVzaAI_tbXZtvATqARTxH0lSU4c-wc1eY';
  var SHEET_NAME = 'flowmeter_validation_rules';
  var ARCHIVE_SHEET = 'hozraschet_archive';

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var rulesSheet = ss.getSheetByName(SHEET_NAME);
  if (!rulesSheet) {
    Logger.log('Лист «' + SHEET_NAME + '» не найден. Сначала запустите flowmeterInitRules().');
    return;
  }
  var archiveSheet = ss.getSheetByName(ARCHIVE_SHEET);
  if (!archiveSheet) {
    Logger.log('Лист «' + ARCHIVE_SHEET + '» не найден. Автозаполнение невозможно.');
    return;
  }

  // Читаем архив (столбцы A-P, 16 колонок)
  var archLastRow = archiveSheet.getLastRow();
  var archData = [];
  if (archLastRow >= 2) {
    var range = archiveSheet.getRange(2, 1, archLastRow - 1, 16);
    archData = range.getValues();
  }

  // Группируем по meterId (колонка A=0 в архиве): consumption (E=4), daysBetween (H=7)
  var byMeter = {};
  for (var i = 0; i < archData.length; i++) {
    var row = archData[i];
    var mid = parseInt(row[0], 10);
    if (!mid) continue;
    if (!byMeter[mid]) byMeter[mid] = { cons: [], days: [] };
    var cons = parseFloat(row[4]);  // E=4 — consumption
    if (!isNaN(cons)) byMeter[mid].cons.push(cons);
    var days = parseInt(row[7], 10);  // H=7 — daysBetween
    if (!isNaN(days)) byMeter[mid].days.push(days);
  }

  // Для каждого meterId 1..12 вычисляем min/max/expected_days
  var rowsToWrite = [];
  for (var m = 1; m <= 12; m++) {
    var data = byMeter[m];
    if (!data || data.cons.length === 0) {
      Logger.log('  meterId=' + m + ': нет данных в архиве, пропускаем');
      continue;
    }
    var minCons = Math.min.apply(null, data.cons);
    var maxCons = Math.max.apply(null, data.cons);
    var computedMin = Math.round(minCons * 0.5 * 100) / 100;
    var computedMax = Math.round(maxCons * 1.5 * 100) / 100;
    // Мода daysBetween (или 1 если нет данных)
    var daysMode = 1;
    if (data.days.length > 0) {
      var freq = {};
      var maxFreq = 0;
      for (var d = 0; d < data.days.length; d++) {
        var dv = data.days[d];
        freq[dv] = (freq[dv] || 0) + 1;
        if (freq[dv] > maxFreq) { maxFreq = freq[dv]; daysMode = dv; }
      }
    }
    rowsToWrite.push([m, computedMin, computedMax, daysMode, '', '', '', '']);
    Logger.log('  meterId=' + m + ': min_cons=' + computedMin +
                ', max_cons=' + computedMax + ', expected_days=' + daysMode +
                ' (из ' + data.cons.length + ' записей архива)');
  }

  if (rowsToWrite.length === 0) {
    Logger.log('Нет данных для записи. Архив пустой?');
    return;
  }

  // Записываем в лист rules начиная со строки 2
  // Если force=false и в листе уже есть данные — не пишем
  var existingLastRow = rulesSheet.getLastRow();
  if (existingLastRow >= 2 && !force) {
    Logger.log('В листе rules уже есть ' + (existingLastRow - 1) + ' строк. ' +
               'Для перезаписи вызовите flowmeterInitRulesFromArchive(true).');
    return;
  }

  // Если force=true — очищаем старые данные (кроме заголовков)
  if (force && existingLastRow >= 2) {
    rulesSheet.getRange(2, 1, existingLastRow - 1, 8).clearContent();
  }

  rulesSheet.getRange(2, 1, rowsToWrite.length, 8).setValues(rowsToWrite);
  Logger.log('Rules: записано ' + rowsToWrite.length + ' строк (meterId 1..12).');
  Logger.log('Внимание: gcal_ratio_min/max и temp_min/max НЕ заполнены — ' +
             'для расходомеров пара настройте вручную (см. System Prompt).');
}

// ============================================================
// Task 222 — flowmeterInitValidationHelp
// Одноразовая инициализация листа «flowmeter_validation_help» с
// описаниями кодов правил в простой форме для пользователей.
// Запускается вручную из редактора Apps Script:
//   1. Выбрать функцию flowmeterInitValidationHelp
//   2. Нажать ▶ Run
//   3. Проверить лог — «Help: лист создан / заполнен»
// При изменении DEFAULT_HELP в ValidationRules выше — повторно
// запустить flowmeterInitValidationHelp(true) для перезаписи листа.
// ============================================================
// Структура листа (строка 1 — заголовки):
//   A: code        — код правила (SIGN_NEG, JUMP_HIGH, ...)
//   B: description — текстовое описание в простой форме
// ============================================================
function flowmeterInitValidationHelp(force) {
  var SPREADSHEET_ID = '1enZSq7K8pwJVzaAI_tbXZtvATqARTxH0lSU4c-wc1eY';
  var SHEET_NAME = 'flowmeter_validation_help';

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    Logger.log('Help: лист «' + SHEET_NAME + '» создан.');
  } else {
    Logger.log('Help: лист «' + SHEET_NAME + '» уже существует.');
  }

  // Заголовки (перезаписываем всегда — они не подлежат редактированию)
  var headers = ['Код правила', 'Описание для пользователя'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4a86e8');
  headerRange.setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  // Если force=true — очищаем старые данные (кроме заголовков)
  var existingLastRow = sheet.getLastRow();
  if (force && existingLastRow >= 2) {
    sheet.getRange(2, 1, existingLastRow - 1, 2).clearContent();
    Logger.log('Help: очищено ' + (existingLastRow - 1) + ' старых строк (force=true).');
  } else if (!force && existingLastRow >= 2) {
    Logger.log('Help: в листе уже есть ' + (existingLastRow - 1) + ' строк. ' +
               'Для перезаписи вызовите flowmeterInitValidationHelp(true).');
    // Всё равно подгоняем ширину колонок
    sheet.autoResizeColumn(1);
    sheet.autoResizeColumn(2);
    return;
  }

  // Заполняем строками из DEFAULT_HELP
  var helpMap = ValidationRules.DEFAULT_HELP;
  var codes = Object.keys(helpMap);
  var rowsToWrite = [];
  for (var i = 0; i < codes.length; i++) {
    rowsToWrite.push([codes[i], helpMap[codes[i]]]);
  }
  sheet.getRange(2, 1, rowsToWrite.length, 2).setValues(rowsToWrite);
  sheet.autoResizeColumn(1);
  sheet.autoResizeColumn(2);

  Logger.log('Help: записано ' + rowsToWrite.length + ' строк описаний кодов.');
  Logger.log('Содержимое можно редактировать прямо в листе — изменения подхватываются');
  Logger.log('архивным эндпоинтом flowmeter.archive (поле anomalyHelp в ответе).');
}
