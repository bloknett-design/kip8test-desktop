// ============================================================
// PhonebookArchive.gs — Телефонный справочник: архив
// пользовательских данных (избранное + примечания) (Task 537)
// ============================================================
// Разворачивать в ТОМ ЖЕ Apps Script проекте, где Code.gs,
// Utils.gs, RoleMatrixGate.gs (проект развёртывания AKfycbyt… —
// ОДИН бэкенд на kip8 и kip8test).
//
// В Code.gs (doPost) добавить три case (см. scripts/Code.gs —
// эталон уже обновлён):
//   case 'phonebook.getMyData':
//     return _json(PhonebookArchive.getMyData(payload));
//   case 'phonebook.setFavorite':
//     return _json(PhonebookArchive.setFavorite(payload));
//   case 'phonebook.setNote':
//     return _json(PhonebookArchive.setNote(payload));
//
// ЭНДПОИНТЫ (через KipAuth.api клиента — для будущей интеграции
// раздела «Телефонный справочник», Task 537 — этап хранения):
//   phonebook.getMyData — свои избранные и примечания:
//     {token}
//     → {ok, data: {srvVer, favorites: {контакт_id: true},
//        notes: {контакт_id: 'текст'}}}
//     Форма карт — как у клиента сегодня (localStorage
//     kip8test_phonebook_favorites / _notes): будущая интеграция
//     сводится к слиянию серверных карт в локальные.
//   phonebook.setFavorite — добавить/убрать избранное:
//     {token, id, entry{header,group,subgroup,position,name,phone},
//      on(true|false)}
//     → {ok, data: {id, on, already?|removed?}}
//     ИДЕМПОТЕНТНО: on=true при активной записи → already: true
//     (дублей нет); on=false без активной записи → removed: false.
//   phonebook.setNote — сохранить/обновить/удалить примечание:
//     {token, id, entry{…}, text(до 500 символов)}
//     → {ok, data: {id, text, action: 'created'|'updated'|'removed',
//        removed?}}
//     Пустой text — удаление (пустой ввод в диалоге клиента).
//     ИДЕМПОТЕНТНО: удалять нечего → removed: false.
//
// ДАННЫЕ — ОТДЕЛЬНЫЙ файл Google Таблиц, создаётся самим скриптом:
//   SpreadsheetApp.create(FILE_NAME) — «Телефонный справочник —
//   Архив пользователей». ID сохраняется в Script Properties
//   (ключ PHONEBOOK_ARCHIVE_SPREADSHEET_ID) — файл можно свободно
//   ПЕРЕИМЕНОВЫВАТЬ/ПЕРЕМЕЩАТЬ по Drive: открытие идёт по ID.
//   Создание — функцией phonebookArchiveInit() (разовый запуск из
//   редактора, см. DEPLOY-Task537) ИЛИ лениво при первом обращении
//   к API (тогда же). Диагностика — phonebookArchiveStatus().
//
//   Лист «Избранное» (заголовки в строке 1):
//     A: id              — автоинкремент (max + 1)
//     B: дата_добавления — ISO timestamp (текст, формат '@')
//     C: email           — кто добавил (из сессии; малые буквы)
//     D: контакт_id      — pbMakeId клиента: header|group|subgroup|
//                          position|name|phone (текст, '@')
//     E: фио             — снимок для чтения архива человеком
//     F: должность       — снимок
//     G: телефон         — снимок
//     H: организация     — снимок (header)
//     I: контакт_json    — полный снимок записи (текст, '@') —
//                          резерв на случай смены структуры
//                          phonebook.json (расширение архива)
//     J: статус          — 'активна' | 'удалена' (мягкое удаление)
//     K: дата_удаления   — ISO timestamp ('' у активных)
//   Лист «Примечания»:
//     A: id              — автоинкремент (max + 1)
//     B: дата_создания   — ISO timestamp (текст, '@')
//     C: дата_изменения  — обновляется при правке текста
//     D: дата_удаления   — '' у активных
//     E: email           — кто внёс (из сессии)
//     F: контакт_id      — как в «Избранном» (текст, '@')
//     G: фио, H: должность, I: телефон, J: организация, K: контакт_json
//     L: примечание      — текст до 500 символов (формат '@' —
//                          защита от формул: '=…' не исполняется)
//     M: статус          — 'активна' | 'удалена'
//   Лист «Служебное» — параметры архива (пары Параметр/Значение):
//     версия структуры, дата создания, назначение, правила доступа,
//     описания листов и порядок расширения архива. Заполняется при
//     создании; повторные запуски НЕ перезаписывают (идемпотентно).
//
// ПРИНЦИП ДОСТУПА (заявка Task 537): «таблицы с архивами данных
// общие, но данные индивидуальные привязанные к email»:
//   - каждая строка несёт email автора;
//   - ЧТЕНИЕ всегда фильтруется по email текущего пользователя
//     (getMyData возвращает ТОЛЬКО свои записи);
//   - ЗАПИСЬ/удаление возможны только для своих строк — ключ
//     поиска (email + контакт_id);
//   - чужие строки ни при каком запросе не возвращаются и не
//     меняются. Гейт раздела — право secret.view матрицы
//     KIP8_Access (то же, что открывает страницу «Телефонный
//     справочник» на клиенте — _SECRET_PAGES). RoleMatrixGate.gs
//     не задеплоен → отказ всем (fail-closed, как PlanEvents).
//
// МЯГКОЕ УДАЛЕНИЕ (архив): удаление не стирает строки — статус
// меняется на «удалена» + дата_удаления; повторное добавление
// создаёт НОВУЮ строку (история сохраняется). Активная запись —
// максимум ОДНА на (email + контакт_id); при ручных дубках в
// таблице активной считается ПОСЛЕДНЯЯ (выше id).
//
// РАСШИРЕНИЕ АРХИВА (заявка: «в дальнейшем по необходимости
// расширение архива данных»): новые разделы данных — новыми
// листами по образцу существующих; при добавлении колонок —
// дописывать В КОНЕЦ строки (позиции старых не сдвигать),
// инкрементировать SCHEMA_VERSION и «Версия структуры» в листе
// «Служебное». Чтение позиционное (по индексу колонки, как
// PlanEvents/WorkSchedule) — заголовки человеку, индексы коду.
//
// ПОДГОТОВЛЕННЫЕ ОБЛАСТИ: все записи пишутся через
// LockService.getScriptLock() (параллельные отметки не портят
// автоинкремент); каждая операция журналируется в audit_log
// (Utils.audit, коды PHONEBOOK_*). Текстовые колонки — формат '@'
// (Task 304 — числа/даты текстом, защита от локалей); значения,
// начинающиеся с '=+-@', экранируются апострофом (защита от
// формул в примечаниях — Task 537).
//
// Авторизация — по тому же паттерну, что PlanEvents.gs:
//   rmRequirePerm(token, 'secret.view', 'PhonebookArchive')
//     → {ok, user} | {ok:false, error:'no_session'|'access_denied'}
// ============================================================

var PhonebookArchive = {

  // Название файла Google Таблицы (Drive владельца проекта;
  // переименование файла НЕ ломает скрипт — открытие по ID)
  FILE_NAME: 'Телефонный справочник — Архив пользователей',

  // Ключ в Script Properties для ID созданного файла
  ID_PROP: 'PHONEBOOK_ARCHIVE_SPREADSHEET_ID',

  FAV_SHEET: 'Избранное',
  NOTE_SHEET: 'Примечания',
  SERVICE_SHEET: 'Служебное',

  // Версия структуры листов архива (инкрементировать при
  // расширении — новые листы/колонки; см. лист «Служебное»)
  SCHEMA_VERSION: 1,

  // Статусы строк (мягкое удаление — история сохраняется)
  STATUS_ACTIVE: 'активна',
  STATUS_REMOVED: 'удалена',

  // Task 537: версия серверного кода (клиент отличает старый
  // Apps Script: нет action → «Unknown action» — тихая деградация
  // на localStorage, без потери данных пользователя)
  SRV_VER: '537',

  // Заголовки листов (строка 1; индексы колонок — в *_COLS)
  FAV_HEADERS: ['id', 'дата_добавления', 'email', 'контакт_id',
                'фио', 'должность', 'телефон', 'организация',
                'контакт_json', 'статус', 'дата_удаления'],
  // Колонки текстового формата '@' (Task 304): даты, id записи,
  // контакт_id, json-снимок, дата_удаления
  FAV_TEXT_COLS: [2, 4, 9, 11],

  NOTE_HEADERS: ['id', 'дата_создания', 'дата_изменения',
                 'дата_удаления', 'email', 'контакт_id',
                 'фио', 'должность', 'телефон', 'организация',
                 'контакт_json', 'примечание', 'статус'],
  // '@' на: даты (B, C, D), контакт_id (F), json (K), примечание (L)
  NOTE_TEXT_COLS: [2, 3, 4, 6, 11, 12],

  // Позиции колонок (1-based, как в PlanEvents/_rowTo*)
  COL: {
    FAV: { ID: 1, ADDED: 2, EMAIL: 3, CONTACT: 4, NAME: 5,
           POSITION: 6, PHONE: 7, ORG: 8, JSON: 9, STATUS: 10,
           REMOVED: 11 },
    NOTE: { ID: 1, CREATED: 2, UPDATED: 3, REMOVED: 4, EMAIL: 5,
            CONTACT: 6, NAME: 7, POSITION: 8, PHONE: 9, ORG: 10,
            JSON: 11, TEXT: 12, STATUS: 13 }
  },

  // Лимиты (зеркально PlanEvents invalid_event: отклоняем, а не
  // режем молча — пользователь видит понятную ошибку)
  MAX_CONTACT_ID: 400,   // pbMakeId: 6 полей через '|'
  MAX_NOTE: 500,         // как «работа» Task 471
  MAX_NAME: 200,
  MAX_POSITION: 200,
  MAX_ORG: 150,
  MAX_PHONE: 50,

  // Цвет шапки — как у листов PlanEventsInit/StatusCodesInit
  // (единый вид таблиц архива)
  HEADER_BG: '#1F4E5F',

  // ============================================================
  // phonebook.getMyData — свои избранные и примечания
  // ============================================================
  // payload: { token }
  // returns: { ok: true, data: { srvVer, favorites: {id: true},
  //            notes: {id: 'текст'} } }
  // Чужие записи НЕ возвращаются: фильтр по email из сессии.
  getMyData: function(payload) {
    var g = this._requireAccess(payload.token);
    if (g.error) return g.error;
    var user = g.user;
    var email = this._normEmail(user.email);

    var ss = this._getArchive();
    if (!ss) return this._archiveError();

    var favorites = {};
    var favSheet = ss.getSheetByName(this.FAV_SHEET);
    if (favSheet) {
      var lastRow = favSheet.getLastRow();
      if (lastRow >= 2) {
        var vals = favSheet.getRange(2, 1, lastRow - 1,
                                     this.COL.FAV.STATUS).getValues();
        for (var i = 0; i < vals.length; i++) {
          var rec = this._rowToFavorite(vals[i]);
          if (!rec) continue;               // битая строка — мимо
          if (rec.email !== email) continue;      // ТОЛЬКО свои
          if (rec['статус'] !== this.STATUS_ACTIVE) continue;
          // Активных ≤1 на ключ; ручные дубли — последняя
          // перезапишет более раннюю (цикл сверху вниз)
          favorites[rec['контакт_id']] = true;
        }
      }
    }

    var notes = {};
    var noteSheet = ss.getSheetByName(this.NOTE_SHEET);
    if (noteSheet) {
      var lastRow2 = noteSheet.getLastRow();
      if (lastRow2 >= 2) {
        var vals2 = noteSheet.getRange(2, 1, lastRow2 - 1,
                                       this.COL.NOTE.STATUS).getValues();
        for (var j = 0; j < vals2.length; j++) {
          var rec2 = this._rowToNote(vals2[j]);
          if (!rec2) continue;
          if (rec2.email !== email) continue;    // ТОЛЬКО свои
          if (rec2['статус'] !== this.STATUS_ACTIVE) continue;
          notes[rec2['контакт_id']] = rec2['примечание'];
        }
      }
    }

    return { ok: true, data: { srvVer: this.SRV_VER,
                               favorites: favorites, notes: notes } };
  },

  // ============================================================
  // phonebook.setFavorite — добавить/убрать избранное
  // ============================================================
  // payload: { token, id, entry{header,group,subgroup,position,
  //            name,phone}, on(true|false) }
  // returns: { ok: true, data: { id, on, already|removed } }
  //   on=true, уже активна  → already: true (новой строки нет)
  //   on=true, нет/удалена → НОВАЯ строка (история сохраняется)
  //   on=false, активна    → статус «удалена» + дата_удаления,
  //                          removed: true
  //   on=false, нет_active → removed: false (идемпотентно)
  setFavorite: function(payload) {
    var g = this._requireAccess(payload.token);
    if (g.error) return g.error;
    var user = g.user;
    var email = this._normEmail(user.email);

    var id = this._normContactId(payload.id);
    if (!id.ok) return { ok: false, error: 'invalid_id',
             message: 'Идентификатор контакта пустой или длиннее ' +
                      this.MAX_CONTACT_ID + ' символов' };
    var on = (payload.on === true || payload.on === 'true' ||
              payload.on === 1);
    var entry = this._normEntry(payload.entry);

    var ss = this._getArchive();
    if (!ss) return this._archiveError();
    var sheet = ss.getSheetByName(this.FAV_SHEET);
    if (!sheet) return this._sheetError(this.FAV_SHEET);

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var hit = this._findActiveRow(sheet, email, id.value,
                                    this.COL.FAV);
      if (on) {
        if (hit) {
          return { ok: true, data: { id: id.value, on: true,
                                     already: true } };
        }
        var rowId = this._nextId(sheet);
        this._appendRow(sheet, [rowId, this._isoNow(), email, id.value,
                                entry.name, entry.position, entry.phone,
                                entry.header, entry.json,
                                this.STATUS_ACTIVE, '']);
        try {
          Utils.audit(user.email, 'PHONEBOOK_FAV_ADD', '', '',
            'Избранное + ' + entry.name + ' (' + entry.phone + ')');
        } catch (e) { /* ignore */ }
        return { ok: true, data: { id: id.value, on: true,
                                   already: false } };
      }

      // on=false — мягкое удаление (архив: строка остаётся)
      if (!hit) {
        return { ok: true, data: { id: id.value, on: false,
                                   removed: false } };
      }
      sheet.getRange(hit, this.COL.FAV.STATUS)
           .setValue(this.STATUS_REMOVED);
      sheet.getRange(hit, this.COL.FAV.REMOVED)
           .setValue(this._isoNow());
      try {
        Utils.audit(user.email, 'PHONEBOOK_FAV_REMOVE', '', '',
          'Избранное − ' + entry.name);
      } catch (e) { /* ignore */ }
      return { ok: true, data: { id: id.value, on: false,
                                 removed: true } };
    } finally {
      lock.releaseLock();
    }
  },

  // ============================================================
  // phonebook.setNote — сохранить/обновить/удалить примечание
  // ============================================================
  // payload: { token, id, entry{…}, text }
  // returns: { ok: true, data: { id, action, text?, removed? } }
  //   text непустой, нет активной  → created (новая строка)
  //   text непустой, активная есть → updated (текст + дата
  //                                  изменения; строка та же)
  //   text пустой, активная есть   → removed (статус «удалена»)
  //   text пустой, нет активной    → removed: false (идемпотентно)
  setNote: function(payload) {
    var g = this._requireAccess(payload.token);
    if (g.error) return g.error;
    var user = g.user;
    var email = this._normEmail(user.email);

    var id = this._normContactId(payload.id);
    if (!id.ok) return { ok: false, error: 'invalid_id',
             message: 'Идентификатор контакта пустой или длиннее ' +
                      this.MAX_CONTACT_ID + ' символов' };
    var text = String(payload.text || '').trim();
    if (text.length > this.MAX_NOTE) {
      return { ok: false, error: 'invalid_note',
               message: 'Примечание длиннее ' + this.MAX_NOTE +
                        ' символов (сейчас ' + text.length + ')' };
    }
    var entry = this._normEntry(payload.entry);

    var ss = this._getArchive();
    if (!ss) return this._archiveError();
    var sheet = ss.getSheetByName(this.NOTE_SHEET);
    if (!sheet) return this._sheetError(this.NOTE_SHEET);

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var hit = this._findActiveRow(sheet, email, id.value,
                                    this.COL.NOTE);

      // Пустой текст — удаление примечания (мягкое, архив)
      if (!text) {
        if (!hit) {
          return { ok: true, data: { id: id.value,
                                     action: 'removed',
                                     removed: false } };
        }
        sheet.getRange(hit, this.COL.NOTE.STATUS)
             .setValue(this.STATUS_REMOVED);
        sheet.getRange(hit, this.COL.NOTE.REMOVED)
             .setValue(this._isoNow());
        try {
          Utils.audit(user.email, 'PHONEBOOK_NOTE_REMOVE', '', '',
            'Примечание − ' + entry.name);
        } catch (e) { /* ignore */ }
        return { ok: true, data: { id: id.value, action: 'removed',
                                   removed: true } };
      }

      // Есть активная строка — обновляем текст на месте
      // (одна активная запись на контакт, история правок —
      // в дата_изменения; смена текста не плодит строки)
      if (hit) {
        sheet.getRange(hit, this.COL.NOTE.TEXT)
             .setValue(this._escCell(text));
        sheet.getRange(hit, this.COL.NOTE.UPDATED)
             .setValue(this._isoNow());
        try {
          Utils.audit(user.email, 'PHONEBOOK_NOTE_UPDATE', '', '',
            'Примечание ≈ ' + entry.name + ': ' +
            text.slice(0, 60));
        } catch (e) { /* ignore */ }
        return { ok: true, data: { id: id.value, action: 'updated',
                                   text: text } };
      }

      // Нет активной — новая строка (дата создания = изменения:
      // один момент времени, дальше меняется только дата_изменения)
      var rowId = this._nextId(sheet);
      var now = this._isoNow();
      this._appendRow(sheet, [rowId, now, now, '',
                              email, id.value, entry.name, entry.position,
                              entry.phone, entry.header, entry.json,
                              text, this.STATUS_ACTIVE]);
      try {
        Utils.audit(user.email, 'PHONEBOOK_NOTE_ADD', '', '',
          'Примечание + ' + entry.name + ': ' + text.slice(0, 60));
      } catch (e) { /* ignore */ }
      return { ok: true, data: { id: id.value, action: 'created',
                                 text: text } };
    } finally {
      lock.releaseLock();
    }
  },

  // ============================================================
  // Внутренние хелперы
  // ============================================================

  // Доступ — право secret.view (то же, что открывает страницу
  // «Телефонный справочник» на клиенте, _SECRET_PAGES).
  // RoleMatrixGate.gs не задеплоен → отказ всем: модуль появился
  // после Task 295, «старых списков ролей» у него нет
  // (fail-closed, как PlanEvents Task 463)
  _requireAccess: function(token) {
    if (typeof rmRequirePerm !== 'function') {
      return { error: { ok: false, error: 'access_denied',
               message: 'RoleMatrixGate.gs не задеплоен — архив ' +
                        'телефонного справочника закрыт (fail-closed)' } };
    }
    var g = rmRequirePerm(token, 'secret.view', 'PhonebookArchive');
    if (!g.ok) return { error: { ok: false, error: g.error } };
    return { user: g.user };
  },

  // Файл-архив: открыть по ID из Script Properties; при первом
  // обращении (или после удаления файла) — создать и запомнить ID.
  // Создание — под блокировкой: параллельные вызовы не создадут
  // несколько файлов. Листы восстанавливаются идемпотентно
  // (_ensureSheets) — ручное удаление листа лечится само.
  _getArchive: function() {
    try {
      var props = PropertiesService.getScriptProperties();
      var id = props.getProperty(this.ID_PROP);
      if (id) {
        try {
          var ss = SpreadsheetApp.openById(id);
          if (ss) {
            this._ensureSheets(ss);
            return ss;
          }
        } catch (e) {
          // файл удалён/потерян доступ — создаём заново (ниже)
        }
      }

      var lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        // перепроверка под замком — создал ли файл параллельный вызов
        var id2 = props.getProperty(this.ID_PROP);
        if (id2) {
          try {
            var ss2 = SpreadsheetApp.openById(id2);
            if (ss2) {
              this._ensureSheets(ss2);
              return ss2;
            }
          } catch (e2) { /* создаём заново */ }
        }
        var ssNew = SpreadsheetApp.create(this.FILE_NAME);
        this._ensureSheets(ssNew);
        props.setProperty(this.ID_PROP, ssNew.getId());
        try {
          Utils.audit('', 'PHONEBOOK_ARCHIVE_CREATED', '', '',
            'Создан файл «' + this.FILE_NAME + '»: ' + ssNew.getId());
        } catch (e3) { /* ignore */ }
        return ssNew;
      } finally {
        lock.releaseLock();
      }
    } catch (e) {
      return null;
    }
  },

  // Идемпотентная инициализация листов: «Избранное» → «Примечания»
  // → «Служебное» (в конце). Дефолтный «Лист1»/«Sheet1» нового
  // файла переиспользуется под «Служебное» (в Drive не остаётся
  // пустышек). Существующие листы НИКОГДА не перезаписываются.
  _ensureSheets: function(ss) {
    var fav = ss.getSheetByName(this.FAV_SHEET);
    if (!fav) {
      fav = ss.insertSheet(this.FAV_SHEET, 0);
      this._initSheet(fav, this.FAV_HEADERS, this.FAV_TEXT_COLS);
    }
    var note = ss.getSheetByName(this.NOTE_SHEET);
    if (!note) {
      note = ss.insertSheet(this.NOTE_SHEET, 1);
      this._initSheet(note, this.NOTE_HEADERS, this.NOTE_TEXT_COLS);
    }
    var svc = ss.getSheetByName(this.SERVICE_SHEET);
    if (!svc) {
      // дефолтный «Лист1»/«Sheet1» переиспользуется под «Служебное»
      // (в Drive не остаётся пустышек) — ищем по ВСЕМ листам:
      // после вставок индексных листов он уже не первый
      var all = ss.getSheets();
      for (var i = 0; i < all.length; i++) {
        if (/^(лист1|sheet1)$/i.test(
                String(all[i].getName() || '').trim())) {
          all[i].setName(this.SERVICE_SHEET);
          svc = all[i];
          break;
        }
      }
      if (!svc) {
        svc = ss.insertSheet(this.SERVICE_SHEET,
                             ss.getSheets().length);
      }
    }
    // «Служебное» без данных (частичная инициализация) — заполнить
    if (svc && svc.getLastRow() < 1) {
      this._initServiceSheet(svc);
    }
  },

  // Шапка листа данных: заголовки + стиль + текстовый формат '@'
  // на нужные колонки (Task 304 — даты/контакт_id/json текстом)
  _initSheet: function(sheet, headers, textCols) {
    var head = sheet.getRange(1, 1, 1, headers.length);
    head.setValues([headers]);
    head.setBackground(this.HEADER_BG)
        .setFontColor('#FFFFFF')
        .setFontWeight('bold');
    for (var i = 0; i < textCols.length; i++) {
      sheet.getRange(2, textCols[i],
                     Math.max(sheet.getMaxRows() - 1, 1), 1)
          .setNumberFormat('@');
    }
    sheet.setFrozenRows(1);
  },

  // Лист «Служебное»: параметры архива (пары Параметр/Значение)
  _initServiceSheet: function(svc) {
    var rows = [
      ['Параметр', 'Значение'],
      ['Версия структуры', this.SCHEMA_VERSION],
      ['Дата создания', this._isoNow()],
      ['Назначение файла',
       'Архив пользовательских данных раздела «Телефонный ' +
       'справочник»: избранное и примечания. Таблицы общие, ' +
       'данные индивидуальны — каждая строка привязана к колонке ' +
       'email; пользователь видит только свои записи.'],
      ['Доступ',
       'Право secret.view матрицы KIP8_Access (как у страницы ' +
       'справочника). Чтение и запись — только собственные записи ' +
       'по ключу email + контакт_id.'],
      ['Лист «Избранное»',
       'Одна активная строка на контакт (email + контакт_id): ' +
       'добавление — новая строка, статус «активна»; удаление — ' +
       'статус «удалена» + дата_удаления (история сохраняется).'],
      ['Лист «Примечания»',
       'Одна активная строка на контакт: примечание до 500 ' +
       'символов; правка обновляет текст и дата_изменения; ' +
       'пустой текст — удаление (статус «удалена»).'],
      ['Расширение архива',
       'Новые разделы данных — новыми листами по образцу ' +
       'существующих. Новые колонки — дописывать В КОНЕЦ строки ' +
       '(позиции старых не сдвигать), инкрементировать «Версию ' +
       'структуры» и добавить строку с описанием изменения сюда.'],
      ['Серверная версия', this.SRV_VER]
    ];
    svc.getRange(1, 1, rows.length, 2).setValues(rows);
    svc.getRange(1, 1, 1, 2).setBackground(this.HEADER_BG)
        .setFontColor('#FFFFFF').setFontWeight('bold');
    svc.setFrozenRows(1);
  },

  // Активная строка (email + контакт_id + статус «активна») —
  // номер строки листа или 0. Поиск с КОНЦА: при ручных дублях
  // активная — последняя (id выше)
  _findActiveRow: function(sheet, email, contactId, cols) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return 0;
    var vals = sheet.getRange(2, 1, lastRow - 1,
                              cols.STATUS).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      var rowEmail = this._normEmail(vals[i][cols.EMAIL - 1]);
      var rowContact = String(vals[i][cols.CONTACT - 1] || '');
      var rowStatus = String(vals[i][cols.STATUS - 1] || '');
      if (rowEmail === email && rowContact === contactId &&
          rowStatus === this.STATUS_ACTIVE) {
        return i + 2;
      }
    }
    return 0;
  },

  // Следующий id листа (max + 1; строки «мимо формата» молча
  // пропускаются — как PlanEvents.mark)
  _nextId: function(sheet) {
    var lastRow = sheet.getLastRow();
    var maxId = 0;
    if (lastRow >= 2) {
      var vals = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < vals.length; i++) {
        var v = parseInt(vals[i][0], 10);
        if (!isNaN(v) && v > maxId) maxId = v;
      }
    }
    return maxId + 1;
  },

  // Строка «Избранного» → запись. Битые (нет контакт_id/email) —
  // null, молча пропускаются (ручные правки не ломают чтение)
  _rowToFavorite: function(r) {
    var contactId = String(r[this.COL.FAV.CONTACT - 1] || '').trim();
    var email = String(r[this.COL.FAV.EMAIL - 1] || '').trim();
    if (!contactId || !email) return null;
    return {
      id: parseInt(r[this.COL.FAV.ID - 1], 10),
      'дата_добавления': String(r[this.COL.FAV.ADDED - 1] || ''),
      email: this._normEmail(email),
      'контакт_id': contactId,
      'фио': String(r[this.COL.FAV.NAME - 1] || ''),
      'статус': String(r[this.COL.FAV.STATUS - 1] || '').trim()
    };
  },

  // Строка «Примечаний» → запись. Битые — null (как выше)
  _rowToNote: function(r) {
    var contactId = String(r[this.COL.NOTE.CONTACT - 1] || '').trim();
    var email = String(r[this.COL.NOTE.EMAIL - 1] || '').trim();
    if (!contactId || !email) return null;
    return {
      id: parseInt(r[this.COL.NOTE.ID - 1], 10),
      'дата_создания': String(r[this.COL.NOTE.CREATED - 1] || ''),
      email: this._normEmail(email),
      'контакт_id': contactId,
      'примечание': String(r[this.COL.NOTE.TEXT - 1] || ''),
      'статус': String(r[this.COL.NOTE.STATUS - 1] || '').trim()
    };
  },

  // Строка в лист: строковые значения экранируются от формул
  // (_escCell), числа (id) — как есть
  _appendRow: function(sheet, row) {
    var out = row.map(function(v) {
      return (typeof v === 'string') ? this._escCell(v) : v;
    }, this);
    sheet.appendRow(out);
  },

  // email из сессии → малые буквы без пробелов (сверка ключей
  // регистронезависима — как в Utils/RoleMatrix)
  _normEmail: function(v) {
    return String(v || '').trim().toLowerCase();
  },

  // контакт_id: строка 1..MAX_CONTACT_ID символов
  _normContactId: function(v) {
    var s = String(v || '').trim();
    if (!s || s.length > this.MAX_CONTACT_ID) return { ok: false };
    return { ok: true, value: s };
  },

  // Снимок записи справочника (для чтения архива человеком и
  // резерва на смену phonebook.json): усечение по лимитам —
  // отображаемые поля, полный клон — в контакт_json
  _normEntry: function(e) {
    e = e || {};
    var out = {
      header: this._clip(String(e.header || ''), this.MAX_ORG),
      group: this._clip(String(e.group || ''), this.MAX_ORG),
      subgroup: this._clip(String(e.subgroup || ''), this.MAX_ORG),
      position: this._clip(String(e.position || ''), this.MAX_POSITION),
      name: this._clip(String(e.name || ''), this.MAX_NAME),
      phone: this._clip(String(e.phone || ''), this.MAX_PHONE)
    };
    out.json = JSON.stringify(out);
    return out;
  },

  _clip: function(s, max) {
    s = String(s || '').trim();
    return s.length > max ? s.slice(0, max) : s;
  },

  // Защита от формул: значение, начинающееся с '=+-@', пишется с
  // ведущим апострофом — Sheets сохранит его ТЕКСТОМ (апостроф
  // поглощается при вводе, при чтении НЕ возвращается — пары
  // запись/чтение сходятся). Применимо к примечаниям и снимкам
  _escCell: function(s) {
    s = String(s === undefined || s === null ? '' : s);
    return /^[=+\-@]/.test(s) ? "'" + s : s;
  },

  // ISO timestamp (время скрипта; формат '@' на колонке хранит
  // его текстом — паттерн PlanEvents/_isoNow)
  _isoNow: function() {
    return Utilities.formatDate(new Date(),
                                Session.getScriptTimeZone(),
                                "yyyy-MM-dd'T'HH:mm:ss");
  },

  // Понятная ошибка «файл недоступен» (клиент покажет тост)
  _archiveError: function() {
    return { ok: false, error: 'archive_unavailable',
             message: 'Файл «' + this.FILE_NAME + '» недоступен — ' +
                      'запустите phonebookArchiveInit() в Apps ' +
                      'Script (см. DEPLOY-Task537)' };
  },

  _sheetError: function(name) {
    return { ok: false, error: 'sheet_not_found',
             message: 'Лист «' + name + '» не найден в архиве — ' +
                      'запустите phonebookArchiveInit() в Apps ' +
                      'Script (см. DEPLOY-Task537)' };
  }
};

// ============================================================
// phonebookArchiveInit — разовое создание файла-архива (Task 537)
// ============================================================
// ПОРЯДОК ДЕЙСТВИЙ (см. DEPLOY-Task537-phonebook-archive-storage.md):
//   1. Открыть Apps Script Editor (проект AKfycbyt…, где Code.gs)
//   2. + → Создать файл «PhonebookArchive.gs», вставить содержимое
//   3. В списке функций выбрать phonebookArchiveInit → ▶ Run
//      (первый запуск попросит авторизацию — разрешить)
//   4. В журнале (Ctrl+Enter) — имя/URL созданного файла; файл
//      появится на Drive владельца проекта; ID уже сохранён в
//      Script Properties — файл можно переименовать/переместить
//   5. Deploy → Manage deployments → Edit → New version → Deploy
//
// ИДЕМПОТЕНТНО: файл уже создан — ничего не меняет, возвращает
// exists: true с тем же URL. Листы восстанавливаются при
// случайном удалении (данные листов не трогаются).
function phonebookArchiveInit() {
  var ss = PhonebookArchive._getArchive();
  if (!ss) {
    Logger.log('PhonebookArchiveInit: файл «%s» создать НЕ удалось ' +
               '(см. сообщение выше)', PhonebookArchive.FILE_NAME);
    return { ok: false, error: 'archive_unavailable' };
  }
  var favSheet = ss.getSheetByName(PhonebookArchive.FAV_SHEET);
  var noteSheet = ss.getSheetByName(PhonebookArchive.NOTE_SHEET);
  var out = {
    ok: true,
    id: ss.getId(),
    url: ss.getUrl(),
    favRows: favSheet ? Math.max(favSheet.getLastRow() - 1, 0) : 0,
    noteRows: noteSheet ?
              Math.max(noteSheet.getLastRow() - 1, 0) : 0
  };
  Logger.log('PhonebookArchiveInit: файл «%s» готов — %s ' +
             '(избранное: %s, примечания: %s строк)',
             PhonebookArchive.FILE_NAME, out.url, out.favRows,
             out.noteRows);
  return out;
}

// Диагностика архива (запускать в редакторе; ничего не меняет):
// файл? ID? URL? листы? строки? Служебное?
function phonebookArchiveStatus() {
  var out = { file: false, id: '', url: '', sheets: {},
              schemaVersion: null };
  try {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty(PhonebookArchive.ID_PROP);
    if (!id) {
      Logger.log('PhonebookArchiveStatus: ID не сохранён — ' +
                 'запустите phonebookArchiveInit()');
      return out;
    }
    var ss = SpreadsheetApp.openById(id);
    out.file = true;
    out.id = id;
    out.url = ss.getUrl();
    [PhonebookArchive.FAV_SHEET, PhonebookArchive.NOTE_SHEET,
     PhonebookArchive.SERVICE_SHEET].forEach(function(n) {
      var sh = ss.getSheetByName(n);
      out.sheets[n] = sh ? { present: true,
        rows: Math.max(sh.getLastRow() - 1, 0) } :
        { present: false, rows: 0 };
    });
    var svc = ss.getSheetByName(PhonebookArchive.SERVICE_SHEET);
    if (svc && svc.getLastRow() >= 2) {
      var vals = svc.getRange(2, 1, svc.getLastRow() - 1, 2)
                     .getValues();
      for (var i = 0; i < vals.length; i++) {
        if (String(vals[i][0]) === 'Версия структуры') {
          out.schemaVersion = parseInt(vals[i][1], 10);
        }
      }
    }
    Logger.log('PhonebookArchiveStatus: файл=%s id=%s листы=%s',
               out.file, out.id, JSON.stringify(out.sheets));
  } catch (e) {
    Logger.log('PhonebookArchiveStatus: файл недоступен (%s) — ' +
               'запустите phonebookArchiveInit()', e);
  }
  return out;
}
