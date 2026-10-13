/**
 * CableJournal.gs — Кабельный журнал
 * ============================================================
 * Подключение к внешней Google Sheets "Кабельный журнал"
 * (ID: 1XsmoyE4CpIcrNqmeFXIuNzi7vuOzxwZix109YlXkv8Y)
 *
 * Структура вкладки "Кабельный журнал":
 *   A: № п/п
 *   B: Обозначение кабеля, провода
 *   C: Начало трассы
 *   D: Конец трассы
 *   E: Участок трассы кабеля, провода
 *   F: Марка (по проекту)
 *   G: Число и сечение жил (по проекту)
 *   H: Длина, м (по проекту)
 *   I: Марка (проложен)
 *   J: Число и сечение жил (проложен)
 *   K: Длина, м (проложен)
 *   L: Дата добавления (auto)
 *   M: Отделение, производство
 *   N: Назначение кабеля
 *   O: № проекта
 *   P: Последний редактор (Task 508 — name из users KIP8_Access)
 *   Q: Дата правки (Task 508 — auto)
 *   R: Архив (Task 508 — причина архивации, «Удалён»)
 *   S: Кем удалён (Task 508 — name из users KIP8_Access)
 *   T: Дата удаления (Task 508 — auto)
 *
 * Task 508 — АРХИВ ЖУРНАЛА:
 *   • appendRow / updateRow пишут в P/Q, кто последний вносил правки
 *     (по столбцу name таблицы users файла KIP8_Access; пустой name →
 *     фолбэк email) и когда.
 *   • deleteRow НЕ удаляет строку физически: помечает архивной
 *     (R = «Удалён», S = кто удалил, T = когда). Архивные записи
 *     приходят в list() с флагом _archived — клиент (Task 508)
 *     скрывает их из списка/печати/PDF, но показывает в Excel.
 *   • Колонки P–T и их заголовки создаются сами (_ensureArchiveColumns)
 *     при первом обращении — отдельный init-скрипт не нужен.
 *
 * ДОСТУП:
 *   - Чтение (list, getColumns, getFilters): всем авторизованным пользователям
 *   - Запись (appendRow, updateRow, deleteRow): Админ, ИТР ИОС, КИП ИОС pro
 * ============================================================
 */

const CableJournal = {

  /** ID файла Google Sheets "Кабельный журнал". */
  FILE_ID: '1XsmoyE4CpIcrNqmeFXIuNzi7vuOzxwZix109YlXkv8Y',

  /** Имя вкладки. */
  SHEET_NAME: 'Кабельный журнал',

  /** Роли с правом записи. */
  EDIT_ROLES: ['Админ', 'ИТР ИОС', 'КИП ИОС pro'],

  /** Колонки, для которых fallback-опции берутся из уникальных значений
   *  в данных (если на колонке не настроена data validation).
   *  designation / start / end остаются свободным вводом —
   *  значения слишком индивидуальны для выпадающего списка. */
  FALLBACK_OPTION_KEYS: [
    'section',           // Участок трассы
    'mark_project',      // Марка (по проекту)
    'cores_project',     // Число и сечение жил (по проекту)
    'mark_actual',       // Марка (проложен)
    'cores_actual',      // Число и сечение жил (проложен)
    'department',        // Отделение, производство
    'purpose',           // Назначение кабеля
    'project_no'         // № проекта
  ],

  /** Заголовки колонок архива Task 508 (P–T). */
  ARCHIVE_HEADERS: [
    'Последний редактор',  // P (16)
    'Дата правки',         // Q (17)
    'Архив',               // R (18) — причина («Удалён»)
    'Кем удалён',          // S (19)
    'Дата удаления'        // T (20)
  ],

  /** Номер первой колонки архива (P = 16). */
  ARCHIVE_COL_START: 16,

  /** Схема колонок (ключ → {col, label, type}). */
  SCHEMA: [
    { key: 'num',            label: '№ п/п',                              col: 1,  type: 'number', readOnly: true  },
    { key: 'designation',    label: 'Обозначение кабеля, провода',         col: 2,  type: 'text'                   },
    { key: 'start',          label: 'Начало трассы',                       col: 3,  type: 'text'                   },
    { key: 'end',            label: 'Конец трассы',                        col: 4,  type: 'text'                   },
    { key: 'section',        label: 'Участок трассы',                      col: 5,  type: 'text'                   },
    { key: 'mark_project',   label: 'Марка (по проекту)',                  col: 6,  type: 'text'                   },
    { key: 'cores_project',  label: 'Число и сечение жил (по проекту)',    col: 7,  type: 'text'                   },
    { key: 'length_project', label: 'Длина, м (по проекту)',               col: 8,  type: 'number'                 },
    { key: 'mark_actual',    label: 'Марка (проложен)',                    col: 9,  type: 'text'                   },
    { key: 'cores_actual',   label: 'Число и сечение жил (проложен)',      col: 10, type: 'text'                   },
    { key: 'length_actual',  label: 'Длина, м (проложен)',                 col: 11, type: 'number'                 },
    { key: 'added_at',       label: 'Дата добавления',                     col: 12, type: 'date', readOnly: true  },
    { key: 'department',     label: 'Отделение, производство',             col: 13, type: 'text'                   },
    { key: 'purpose',        label: 'Назначение кабеля',                   col: 14, type: 'text'                   },
    { key: 'project_no',     label: '№ проекта',                           col: 15, type: 'text'                   },
    // Task 508 — архив журнала (P–T, только сервер пишет)
    { key: 'last_editor',    label: 'Последний редактор',                  col: 16, type: 'text',  readOnly: true  },
    { key: 'edited_at',      label: 'Дата правки',                         col: 17, type: 'date',  readOnly: true  },
    { key: 'archived',       label: 'Архив',                               col: 18, type: 'text',  readOnly: true  },
    { key: 'archived_by',    label: 'Кем удалён',                          col: 19, type: 'text',  readOnly: true  },
    { key: 'archived_at',    label: 'Дата удаления',                       col: 20, type: 'date',  readOnly: true  }
  ],


  // ========================================================================
  // ВНУТРЕННИЕ ХЕЛПЕРЫ
  // ========================================================================

  /**
   * Открыть таблицу Кабельного журнала.
   * Возвращает Spreadsheet object.
   */
  _openSheet: function() {
    const ss = SpreadsheetApp.openById(this.FILE_ID);
    const sheet = ss.getSheetByName(this.SHEET_NAME);
    if (!sheet) {
      throw new Error('Вкладка "' + this.SHEET_NAME + '" не найдена в файле Кабельного журнала');
    }
    // Task 508: колонки архива P–T (физические колонки + заголовки)
    // создаются при первом обращении — идемпотентно, отдельно
    // инициализировать нечего.
    this._ensureArchiveColumns(sheet);
    return sheet;
  },

  /**
   * Task 508: гарантировать физические колонки P–T и их заголовки.
   *  - если maxColumns < 20 — расширить лист вправо (insertColumnsAfter
   *    добавляет в КОНЕЦ, существующие данные не сдвигаются);
   *  - пустые ячейки заголовков P1:T1 заполнить эталонными подписями
   *    (непустые НЕ трогаем — ручные правки пользователя сохраняются).
   * Идемпотентно: при готовых колонках — только чтение (1 getRange).
   */
  _ensureArchiveColumns: function(sheet) {
    try {
      let maxC = sheet.getMaxColumns();
      const want = this.ARCHIVE_COL_START + this.ARCHIVE_HEADERS.length - 1; // 20
      if (maxC < want) {
        sheet.insertColumnsAfter(maxC, want - maxC);
        maxC = want;
      }
      const rng = sheet.getRange(1, this.ARCHIVE_COL_START, 1,
                                 this.ARCHIVE_HEADERS.length);
      const hdr = rng.getValues()[0];
      let changed = false;
      const out = [];
      for (let i = 0; i < this.ARCHIVE_HEADERS.length; i++) {
        const cur = hdr[i];
        const s = (cur === null || cur === undefined)
          ? '' : String(cur).trim();
        if (s === '') {
          out.push(this.ARCHIVE_HEADERS[i]);
          changed = true;
        } else {
          out.push(cur);
        }
      }
      if (changed) rng.setValues([out]);
    } catch (e) { /* архив колонки — не критичны для чтения */ }
  },

  /**
   * Task 508: имя пользователя для архива — столбец name таблицы
   * users файла KIP8_Access (user приходит из Utils.findUserById,
   * getRows('users') мапит заголовки листа в поля объекта).
   * Пустой name → фолбэк email (архив не должен быть безымянным).
   */
  _userName: function(user) {
    if (!user) return '';
    const n = (user.name === undefined || user.name === null)
      ? '' : String(user.name).trim();
    if (n) return n;
    const e = (user.email === undefined || user.email === null)
      ? '' : String(user.email).trim();
    return e;
  },

  /**
   * Проверить, что у пользователя есть права на запись.
   * Возвращает объект пользователя.
   */
  _requireEdit: function(token) {
    if (!token) throw new Error('Unauthorized: токен не передан');
    const session = Utils.findSessionByToken(token);
    if (!session) throw new Error('Unauthorized: сессия не найдена');
    const user = Utils.findUserById(session.user_id);
    if (!user) throw new Error('Unauthorized: пользователь не найден');

    if (this.EDIT_ROLES.indexOf(user.role) === -1) {
      Utils.audit(user.email, 'CABLE_JOURNAL_ACCESS_DENIED', '', '',
        'Роль "' + user.role + '" не имеет прав на редактирование Кабельного журнала');
      throw new Error('Forbidden: недостаточно прав для редактирования Кабельного журнала');
    }
    return user;
  },

  /**
   * Проверить, что у пользователя есть права на чтение.
   * Возвращает объект пользователя.
   */
  _requireRead: function(token) {
    if (!token) throw new Error('Unauthorized: токен не передан');
    const session = Utils.findSessionByToken(token);
    if (!session) throw new Error('Unauthorized: сессия не найдена');
    const user = Utils.findUserById(session.user_id);
    if (!user) throw new Error('Unauthorized: пользователь не найден');
    return user;
  },

  /**
   * Поиск колонки по ключу.
   */
  _findCol: function(key) {
    for (let i = 0; i < this.SCHEMA.length; i++) {
      if (this.SCHEMA[i].key === key) return this.SCHEMA[i];
    }
    return null;
  },

  /**
   * Преобразовать строку значений в объект.
   * rowValues — массив значений (из getValues()).
   * rowIdx — номер строки в таблице (для операций delete/update).
   */
  _rowToObject: function(rowValues, rowIdx) {
    const obj = { _row: rowIdx };
    for (let i = 0; i < this.SCHEMA.length; i++) {
      const col = this.SCHEMA[i];
      const v = rowValues[col.col - 1];
      // Преобразование дат
      if (col.type === 'date' && v instanceof Date) {
        obj[col.key] = v.toISOString();
      } else if (col.type === 'number' && typeof v === 'string' && v !== '') {
        const n = Number(v.replace(',', '.'));
        obj[col.key] = isNaN(n) ? v : n;
      } else {
        obj[col.key] = v;
      }
    }
    // Task 508: признак архивной записи — колонка «Архив» (R)
    // непустая. Клиент по флагу скрывает запись из списка/печати/
    // PDF и показывает в Excel-экспорте.
    obj._archived = obj.archived !== undefined && obj.archived !== null &&
      String(obj.archived).trim() !== '';
    return obj;
  },


  // ========================================================================
  // ПУБЛИЧНЫЕ МЕТОДЫ (вызываются из Code.gs)
  // ========================================================================

  /**
   * Получить схему колонок с валидациями (выпадающие списки).
   * Доступ: любой авторизованный пользователь.
   *
   * Для каждой колонки поле options:
   *   - null  → свободный ввод (input/textarea)
   *   - [...] → выпадающий список, отрисовывается как <select>
   *
   * Источник options:
   *   1. Data Validation Google Sheets (ONE_OF_LIST / ONE_OF_RANGE) —
   *      если на колонке настроен выпадающий список, берём его значения.
   *   2. Fallback: для перечисленных в FALLBACK_OPTION_KEYS колонок —
   *      уникальные значения из данных (section, mark_project,
   *      cores_project, mark_actual, cores_actual, department, purpose,
   *      project_no). Этот же источник используется в форме добавления.
   *   3. Для остальных текстовых колонок (designation, start, end) fallback
   *      НЕ применяется — эти поля остаются свободным вводом, даже если в
   *      таблице есть несколько одинаковых значений.
   *
   * Возвращает: {
   *   columns: [{ key, label, type, readOnly, options: string[]|null }, ...],
   *   editRoles: [...]
   * }
   */
  getColumns: function(token) {
    const user = this._requireRead(token);

    const sheet = this._openSheet();
    const lastRow = sheet.getLastRow();

    // Для каждой колонки определить список опций (или null)
    const validations = {};
    for (let i = 0; i < this.SCHEMA.length; i++) {
      const col = this.SCHEMA[i];
      if (col.readOnly) {
        validations[col.key] = null;
        continue;
      }
      try {
        validations[col.key] = this._readColumnOptions(sheet, col.col, col.key, lastRow);
      } catch (e) {
        validations[col.key] = null;
      }
    }

    return {
      columns: this.SCHEMA.map(c => ({
        key: c.key,
        label: c.label,
        type: c.type,
        readOnly: !!c.readOnly,
        options: validations[c.key] || null
      })),
      editRoles: this.EDIT_ROLES,
      canEdit: this.EDIT_ROLES.indexOf(user.role) !== -1,
      userRole: user.role
    };
  },

  /**
   * Прочитать опции для колонки: из data validation (ONE_OF_LIST или
   * ONE_OF_RANGE), либо fallback на уникальные значения из данных
   * (только для department и purpose).
   */
  _readColumnOptions: function(sheet, colIdx, key, lastRow) {
    let options = null;

    // 1. Попробовать data validation на диапазоне данных.
    try {
      const range = lastRow >= 2
        ? sheet.getRange(2, colIdx, Math.max(lastRow - 1, 1), 1)
        : sheet.getRange(2, colIdx, 1, 1);
      const dvs = range.getDataValidations();
      let dv = null;
      for (let r = 0; r < dvs.length; r++) {
        for (let c = 0; c < dvs[r].length; c++) {
          if (dvs[r][c]) { dv = dvs[r][c]; break; }
        }
        if (dv) break;
      }
      if (dv) {
        const critType = dv.getCriteriaType();
        const critValues = dv.getCriteriaValues() || [];
        if (critType === SpreadsheetApp.DataValidationCriteria.ONE_OF_LIST && Array.isArray(critValues)) {
          options = critValues.map(function(v) { return String(v); });
        }
        else if (critType === SpreadsheetApp.DataValidationCriteria.ONE_OF_RANGE && critValues[0]) {
          const rng = critValues[0];
          const vals = rng.getValues();
          const set = {};
          for (let r = 0; r < vals.length; r++) {
            for (let c = 0; c < vals[r].length; c++) {
              const v = String(vals[r][c] || '').trim();
              if (v) set[v] = true;
            }
          }
          options = Object.keys(set).sort();
        }
      }
    } catch (e) { /* ignore — fallback ниже */ }

    // 2. Fallback: уникальные значения из данных для перечисленных колонок.
    if (!options && lastRow >= 2 && this.FALLBACK_OPTION_KEYS.indexOf(key) !== -1) {
      try {
        const vals = sheet.getRange(2, colIdx, lastRow - 1, 1).getValues();
        const set = {};
        for (let r = 0; r < vals.length; r++) {
          const v = String(vals[r][0] || '').trim();
          if (v) set[v] = true;
        }
        options = Object.keys(set).sort();
      } catch (e) { /* ignore */ }
    }

    if (options && options.length === 0) options = null;

    return options;
  },

  /**
   * Получить список записей.
   * Доступ: любой авторизованный пользователь.
   *
   * Task 508: архивные записи (удалённые, колонка «Архив» = «Удалён»)
   * НЕ отфильтровываются на сервере — они приходят с флагом _archived,
   * а клиент решает, что с ними делать (список/печать/PDF — без них,
   * Excel — с ними). total — число АКТИВНЫХ записей, archivedTotal —
   * архивных.
   */
  list: function(token, options) {
    const user = this._requireRead(token);
    options = options || {};

    const sheet = this._openSheet();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow < 2) {
      return {
        rows: [],
        total: 0,
        archivedTotal: 0,
        canEdit: this.EDIT_ROLES.indexOf(user.role) !== -1
      };
    }

    const range = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const values = range.getValues();

    const search = (options.search || '').toLowerCase().trim();
    const deptFilter = (options.department || '').toLowerCase().trim();
    const purposeFilter = (options.purpose || '').toLowerCase().trim();

    let filtered = [];
    for (let i = 0; i < values.length; i++) {
      const obj = this._rowToObject(values[i], i + 2);

      if (search) {
        let found = false;
        for (let j = 0; j < this.SCHEMA.length; j++) {
          const v = String(obj[this.SCHEMA[j].key] || '').toLowerCase();
          if (v.indexOf(search) !== -1) { found = true; break; }
        }
        if (!found) continue;
      }

      if (deptFilter && String(obj.department || '').toLowerCase() !== deptFilter) continue;
      if (purposeFilter && String(obj.purpose || '').toLowerCase() !== purposeFilter) continue;

      filtered.push(obj);
    }

    let total = 0, archivedTotal = 0;
    for (let i = 0; i < filtered.length; i++) {
      if (filtered[i]._archived) archivedTotal++;
      else total++;
    }

    const limit = Math.min(options.limit || 500, 1000);
    const offset = Math.max(options.offset || 0, 0);
    const paged = filtered.slice(offset, offset + limit);

    return {
      rows: paged,
      total: total,
      archivedTotal: archivedTotal,
      canEdit: this.EDIT_ROLES.indexOf(user.role) !== -1,
      userRole: user.role
    };
  },

  /**
   * Получить список уникальных значений для фильтров (department, purpose).
   * Доступ: любой авторизованный пользователь.
   * Task 508: архивные записи в фильтры НЕ попадают.
   */
  getFilters: function(token) {
    this._requireRead(token);

    const sheet = this._openSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { departments: [], purposes: [] };
    }

    const range = sheet.getRange(2, 1, lastRow - 1, 20);
    const values = range.getValues();

    const departments = {};
    const purposes = {};

    for (let i = 0; i < values.length; i++) {
      // Task 508: пропустить архивные (колонка R = 18)
      const arch = String(values[i][17] || '').trim() !== '';
      if (arch) continue;
      const dept = String(values[i][12] || '').trim();
      const purpose = String(values[i][13] || '').trim();
      if (dept) departments[dept] = true;
      if (purpose) purposes[purpose] = true;
    }

    return {
      departments: Object.keys(departments).sort(),
      purposes: Object.keys(purposes).sort()
    };
  },

  /**
   * Добавить новую запись.
   * Доступ: Админ, ИТР ИОС, КИП ИОС pro.
   *
   * data — объект с полями по схеме (кроме num и added_at — они вычисляются автоматически).
   * Task 508: создатель записи сразу записывается в «Последний
   * редактор» (P) + «Дата правки» (Q).
   * Возвращает: { ok: true, row: <newRowNum>, num: <assignedNum> }
   */
  appendRow: function(token, data) {
    const user = this._requireEdit(token);
    if (!data || typeof data !== 'object') {
      throw new Error('Данные записи не переданы');
    }

    const sheet = this._openSheet();
    const lastRow = sheet.getLastRow();

    // Вычислить следующий № п/п (max из существующих + 1)
    let maxNum = 0;
    if (lastRow >= 2) {
      const nums = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < nums.length; i++) {
        const n = Number(nums[i][0]);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    }
    const newNum = maxNum + 1;

    // Сформировать строку в порядке колонок
    const rowData = [];
    for (let i = 0; i < this.SCHEMA.length; i++) {
      const col = this.SCHEMA[i];
      if (col.key === 'num') {
        rowData.push(newNum);
      } else if (col.key === 'added_at') {
        let d = data.added_at;
        if (d === undefined || d === null || d === '') {
          rowData.push(new Date());
        } else {
          const parsed = new Date(d);
          rowData.push(isNaN(parsed.getTime()) ? new Date() : parsed);
        }
      } else if (col.key === 'last_editor') {
        // Task 508: кто внёс запись (name из users KIP8_Access)
        rowData.push(this._userName(user));
      } else if (col.key === 'edited_at') {
        // Task 508: дата правки
        rowData.push(new Date());
      } else if (col.key === 'archived' || col.key === 'archived_by' ||
                 col.key === 'archived_at') {
        // Task 508: новая запись — не архивная
        rowData.push('');
      } else {
        let v = data[col.key];
        if (v === undefined || v === null) v = '';
        if (col.type === 'number' && v !== '') {
          const n = typeof v === 'string' ? Number(String(v).replace(',', '.')) : Number(v);
          v = isNaN(n) ? v : n;
        }
        rowData.push(v);
      }
    }

    sheet.appendRow(rowData);

    const newLastRow = sheet.getLastRow();

    Utils.audit(user.email, 'CABLE_JOURNAL_APPEND', '', '',
      'Добавлена запись №' + newNum + ' (строка ' + newLastRow + '): ' +
      (data.designation || '(без обозначения)') +
      ' (автор: ' + this._userName(user) + ')');

    return { ok: true, row: newLastRow, num: newNum };
  },

  // ========================================================================
  // РЕДАКТИРОВАНИЕ И УДАЛЕНИЕ
  // ========================================================================

  /**
   * Обновить существующую запись кабельного журнала.
   * Доступ: Админ, ИТР ИОС, КИП ИОС pro.
   *
   * Параметры:
   *   token — сессионный токен
   *   row   — номер строки в таблице (1-based, из cableJournal.list → _row)
   *   data  — объект { [columnKey]: value } с обновлёнными полями.
   *           Поля, отсутствующие в data, НЕ затрагиваются.
   *           readOnly-колонки (num) пропускаются.
   *           added_at можно обновить (клиент может передать дату правки).
   *
   * Task 508: после правки в P/Q пишется, кто последний вносил правки
   * (name из users KIP8_Access) и когда.
   *
   * Возвращает: { ok: true, row: <rowNum>, num: <recordNum>, updated: [<key>, ...] }
   */
  updateRow: function(token, row, data) {
    const user = this._requireEdit(token);

    // Валидация row
    if (row === undefined || row === null) {
      throw new Error('Не указан номер строки (row)');
    }
    row = Number(row);
    if (isNaN(row) || row < 2) {
      throw new Error('Некорректный номер строки: ' + row + ' (ожидается ≥ 2)');
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Данные для обновления не переданы');
    }

    const sheet = this._openSheet();
    const lastRow = sheet.getLastRow();

    if (row > lastRow) {
      throw new Error('Строка ' + row + ' не существует (последняя строка с данными: ' + lastRow + ')');
    }

    // Прочитать текущую строку (для аудита и для получения num)
    const currentRowValues = sheet.getRange(row, 1, 1, this.SCHEMA.length).getValues()[0];
    const currentObj = this._rowToObject(currentRowValues, row);
    const recordNum = currentObj.num || (row - 1);

    // Обновить только переданные поля, пропуская readOnly (кроме added_at)
    const updatedKeys = [];
    for (let i = 0; i < this.SCHEMA.length; i++) {
      const col = this.SCHEMA[i];

      // readOnly-колонки пропускаем (num — никогда не обновляется)
      // added_at — исключение: readOnly в схеме, но разрешаем обновление
      if (col.readOnly && col.key !== 'added_at') continue;

      // Поле не передано в data — не трогаем
      if (!data.hasOwnProperty(col.key)) continue;

      let value = data[col.key];

      // Преобразование типов (как в appendRow)
      if (col.type === 'number' && value !== '' && value != null) {
        const n = typeof value === 'string' ? Number(String(value).replace(',', '.')) : Number(value);
        value = isNaN(n) ? value : n;
      } else if (col.type === 'date') {
        if (value !== '' && value != null) {
          const parsed = new Date(value);
          value = isNaN(parsed.getTime()) ? value : parsed;
        }
      }

      // null/undefined → пустая строка (очистка ячейки)
      if (value == null) value = '';

      sheet.getRange(row, col.col).setValue(value);
      updatedKeys.push(col.key);
    }

    // Task 508: кто последний вносил правки (P) и когда (Q) —
    // name из users KIP8_Access (пустой name → email)
    sheet.getRange(row, 16).setValue(this._userName(user));
    sheet.getRange(row, 17).setValue(new Date());

    // Аудит
    Utils.audit(user.email, 'CABLE_JOURNAL_UPDATE', '', '',
      'Обновлена запись №' + recordNum + ' (строка ' + row + '), поля: ' +
      (updatedKeys.length > 0 ? updatedKeys.join(', ') : '(нет изменений)') +
      ', обозначение: ' + (currentObj.designation || data.designation || '(без обозначения)') +
      ' (правил: ' + this._userName(user) + ')');

    return { ok: true, row: row, num: recordNum, updated: updatedKeys };
  },

  /**
   * Удалить существующую запись кабельного журнала.
   * Доступ: Админ, ИТР ИОС, КИП ИОС pro.
   *
   * Параметры:
   *   token — сессионный токен
   *   row   — номер строки в таблице (1-based, из cableJournal.list → _row)
   *
   * Task 508: строка НЕ удаляется физически — помечается архивной:
   *   R («Архив») = «Удалён», S («Кем удалён») = name из users
   *   KIP8_Access, T («Дата удаления») = сейчас. Данные записи
   *   сохраняются. Архивные записи скрыты из списка/печати/PDF
   *   (клиент Task 508) и видны в Excel-экспорте.
   *
   * Возвращает: { ok: true, num: <recordNum>, archived: true }
   */
  deleteRow: function(token, row) {
    const user = this._requireEdit(token);

    // Валидация row
    if (row === undefined || row === null) {
      throw new Error('Не указан номер строки (row)');
    }
    row = Number(row);
    if (isNaN(row) || row < 2) {
      throw new Error('Некорректный номер строки: ' + row + ' (ожидается ≥ 2)');
    }

    const sheet = this._openSheet();
    const lastRow = sheet.getLastRow();

    if (row > lastRow) {
      throw new Error('Строка ' + row + ' не существует (последняя строка с данными: ' + lastRow + ')');
    }

    // Прочитать удаляемую строку (для аудита)
    const currentRowValues = sheet.getRange(row, 1, 1, this.SCHEMA.length).getValues()[0];
    const currentObj = this._rowToObject(currentRowValues, row);
    const recordNum = currentObj.num || (row - 1);
    const designation = currentObj.designation || '(без обозначения)';
    const who = this._userName(user);

    // Task 508: НЕ sheet.deleteRow(row) — запись остаётся в журнале
    // как архивная (причина «Удалён», кто удалил, когда)
    sheet.getRange(row, 18).setValue('Удалён');   // R: Архив (причина)
    sheet.getRange(row, 19).setValue(who);        // S: Кем удалён
    sheet.getRange(row, 20).setValue(new Date()); // T: Дата удаления

    // Аудит
    Utils.audit(user.email, 'CABLE_JOURNAL_DELETE', '', '',
      'Запись №' + recordNum + ' (строка ' + row + ') архивирована (' +
      'Удалён) пользователем ' + who + ': ' + designation);

    return { ok: true, num: recordNum, archived: true };
  }
};
