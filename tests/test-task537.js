// tests/test-task537.js
// Task 537 — заявка пользователя: «Необходимо проработать телефонный
// справочник. создать файл с google таблицей для телефонного
// справочника, придумай для него название, в этом файле я планирую
// организовать сохранять данные внесённые пользователями в разделах
// телефонного справочника избранное и добавленные примечания,
// доступные только тем пользователям которые их внесли для себя,
// то есть таблицы с архивами данных общие, но данные индивидуальные
// привязанные к email. и в дальнейшем по необходимости расширение
// архива данных для телефонного справочника.»
//
// РЕШЕНИЕ (СЕРВЕР — этап хранения; клиентская интеграция —
// следующая задача):
//   scripts/PhonebookArchive.gs — НОВЫЙ модуль:
//     • файл Google Таблиц «Телефонный справочник — Архив
//       пользователей» создаётся САМИМ скриптом
//       (SpreadsheetApp.create, телефон phonebookArchiveInit() —
//       разовый запуск из редактора; ИЛИ лениво при первом
//       обращении к API); ID — в Script Properties
//       (PHONEBOOK_ARCHIVE_SPREADSHEET_ID), открытие по ID —
//       файл можно переименовывать/перемещать по Drive;
//     • листы: «Избранное» (id, дата_добавления, email,
//       контакт_id, фио, должность, телефон, организация,
//       контакт_json, статус, дата_удаления), «Примечания» (id,
//       даты, email, контакт_id, снимки, контакт_json,
//       примечание ≤500, статус), «Служебное» (версия структуры,
//       назначение, порядок расширения архива);
//     • email-привязка: каждая строка несёт email автора; ЧТЕНИЕ
//       фильтруется по email (getMyData возвращает ТОЛЬКО свои),
//       ЗАПИСЬ/удаление — только своих строк; чужие записи ни при
//       каком запросе не возвращаются и не меняются;
//     • мягкое удаление ('активна'/'удалена' + дата_удаления) —
//       история сохраняется (архив); ≤1 активная строка на
//       (email + контакт_id); повторное добавление — новая строка;
//     • гейт secret.view (как у страницы справочника на клиенте,
//       _SECRET_PAGES), fail-closed без RoleMatrixGate.gs;
//     • LockService на записи, Utils.audit (PHONEBOOK_*),
//       формат '@' (Task 304) + экранирование '=+-@' апострофом
//       (защита примечаний от формул);
//   scripts/Code.gs — роутинг phonebook.getMyData / setFavorite /
//   setNote (+ строка в шапке-индексе модулей);
//   клиент НЕ менялся (SW без изменений — kipia-test-v758).
//
// Запуск: через tests/run-all.js (require './test-task537.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'PhonebookArchive.gs'), 'utf8');
const CODE_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Code.gs'), 'utf8');

// assertEqual в этом фреймворке — строгое ===; для объектов/массивов
// сравниваем по содержимому (JSON)
function assertDeepEqual(actual, expected, message) {
    assertEqual(JSON.stringify(actual), JSON.stringify(expected), message);
}

// ============================================================
// GAS-моки (SpreadsheetApp / PropertiesService / LockService /
// Session / Utilities / Utils.audit / rmRequirePerm)
// ============================================================

class MockSheet {
    constructor(name, rows) {
        this._name = name;
        this.rows = rows || [];
        this.formats = {};   // 'r,c' → формат (для '@')
    }
    getName() { return this._name; }
    setName(n) { this._name = n; return this; }
    getLastRow() { return this.rows.length; }
    getMaxRows() { return Math.max(this.rows.length, 200); }
    appendRow(row) { this.rows.push(row.slice()); return this; }
    getRange(row, col, numRows, numCols) {
        numRows = numRows || 1; numCols = numCols || 1;
        const self = this;
        return {
            getValues() {
                const out = [];
                for (let r = row; r < row + numRows; r++) {
                    const line = [];
                    for (let c = col; c < col + numCols; c++) {
                        const rr = self.rows[r - 1];
                        line.push(rr ? (rr[c - 1] === undefined ? '' : rr[c - 1]) : '');
                    }
                    out.push(line);
                }
                return out;
            },
            setValue(v) {
                while (self.rows.length < row) self.rows.push([]);
                if (!self.rows[row - 1]) self.rows[row - 1] = [];
                self.rows[row - 1][col - 1] = v;
                return this;
            },
            setValues(vals) {
                for (let i = 0; i < vals.length; i++) {
                    const r = row + i;
                    while (self.rows.length < r) self.rows.push([]);
                    for (let c = 0; c < vals[i].length; c++) {
                        self.rows[r - 1][col - 1 + c] = vals[i][c];
                    }
                }
                return this;
            },
            setNumberFormat(f) { self.formats[row + ',' + col] = f; return this; },
            setBackground() { return this; },
            setFontColor() { return this; },
            setFontWeight() { return this; }
        };
    }
    setFrozenRows() {}
}

class MockSS {
    constructor(name) {
        this._name = name;
        this._id = 'SS' + (++MockSS.seq);
        this.sheets = [];
        this.sheets.push(new MockSheet('Лист1', []));
    }
    getName() { return this._name; }
    getId() { return this._id; }
    getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this._id + '/edit'; }
    getSheets() { return this.sheets.slice(); }
    getSheetByName(n) {
        for (const s of this.sheets) if (s.getName() === n) return s;
        return null;
    }
    insertSheet(name, index) {
        const s = new MockSheet(name, []);
        const idx = (index === undefined || index === null)
            ? this.sheets.length : index;
        this.sheets.splice(Math.min(idx, this.sheets.length), 0, s);
        return s;
    }
}
MockSS.seq = 0;

function isoOf(d) {
    const p = n => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

// Среда: файлы/свойства/аудит + гейт с настраиваемым пользователем
function makeEnv(opts) {
    opts = opts || {};
    const state = {
        props: {},
        files: {},
        created: [],
        audit: [],
        gateCalls: [],
        now: new Date('2026-10-17T10:00:00')
    };
    const SpreadsheetApp = {
        openById: (id) => state.files[id] || null,
        create: (name) => {
            const ss = new MockSS(name);
            state.files[ss.getId()] = ss;
            state.created.push(ss);
            return ss;
        }
    };
    const PropertiesService = {
        getScriptProperties: () => ({
            getProperty: (k) => (k in state.props ? state.props[k] : null),
            setProperty: (k, v) => { state.props[k] = String(v); }
        })
    };
    const LockService = {
        getScriptLock: () => ({ waitLock() {}, releaseLock() {} })
    };
    const Session = { getScriptTimeZone: () => 'Asia/Novosibirsk' };
    // время идёт вперёд на 1 сек за каждый вызов formatDate —
    // даты «изменения» гарантированно различимы в тестах
    const Utilities = {
        formatDate: () => { state.now = new Date(state.now.getTime() + 1000); return isoOf(state.now); }
    };
    const Utils = {
        audit: (email, action, ip, ua, details) => {
            state.audit.push({ email, action, details });
        }
    };
    const rmRequirePerm = (opts.rmRequirePerm === undefined)
        ? function (token, permId, context) {
            state.gateCalls.push({ token, permId, context });
            if (!token) return { ok: false, error: 'no_session' };
            if (token === 'bad') return { ok: false, error: 'no_session' };
            if (token === 'noperm') return { ok: false, error: 'access_denied' };
            return { ok: true, user: { email: opts.user || 'user@example.com', role: 'kip8' } };
        }
        : opts.rmRequirePerm;
    return {
        state, SpreadsheetApp, PropertiesService, LockService,
        Session, Utilities, Utils, rmRequirePerm
    };
}

// Загрузка PhonebookArchive.gs в контролируемую среду
function loadPA(env) {
    const factory = new Function(
        'SpreadsheetApp', 'PropertiesService', 'LockService',
        'Session', 'Utilities', 'Utils', 'Logger', 'rmRequirePerm',
        GS_SRC + '\nreturn { PA: PhonebookArchive, init: phonebookArchiveInit, status: phonebookArchiveStatus };');
    return factory(env.SpreadsheetApp, env.PropertiesService,
                   env.LockService, env.Session, env.Utilities,
                   env.Utils, { log: function () {} }, env.rmRequirePerm);
}

// Контакты (форма клиента: pbMakeId = header|group|subgroup|
// position|name|phone; group/subgroup null → '')
const ENTRY = {
    header: 'ООО ПО «ТОКЕМ»',
    group: 'Отдел КИПиА',
    subgroup: null,
    position: 'Инженер',
    name: 'Иванов Иван Иванович',
    phone: '50 01'
};
const CID = 'ООО ПО «ТОКЕМ»|Отдел КИПиА|||Инженер|Иванов Иван Иванович|50 01';

// ============================================================
// 1. SRC — scripts/PhonebookArchive.gs
// ============================================================
describe('Task 537 — SRC: PhonebookArchive.gs', () => {

    test('модуль определён (var PhonebookArchive = {)', () => {
        assertTrue(GS_SRC.indexOf('var PhonebookArchive = {') !== -1,
            'объект-модуль в стиле PlanEvents.gs');
    });

    test('название файла-архива: «Телефонный справочник — Архив пользователей»', () => {
        assertTrue(GS_SRC.indexOf("'Телефонный справочник — Архив пользователей'") !== -1,
            'FILE_NAME — придуманное название (заявка)');
    });

    test('ID файла — в Script Properties (ключ PHONEBOOK_ARCHIVE_SPREADSHEET_ID)', () => {
        assertTrue(GS_SRC.indexOf('PHONEBOOK_ARCHIVE_SPREADSHEET_ID') !== -1,
            'ключ ID_PROP');
        assertTrue(GS_SRC.indexOf('PropertiesService.getScriptProperties()') !== -1,
            'чтение Script Properties');
    });

    test('три листа архива: «Избранное», «Примечания», «Служебное»', () => {
        assertTrue(GS_SRC.indexOf("FAV_SHEET: 'Избранное'") !== -1, 'Избранное');
        assertTrue(GS_SRC.indexOf("NOTE_SHEET: 'Примечания'") !== -1, 'Примечания');
        assertTrue(GS_SRC.indexOf("SERVICE_SHEET: 'Служебное'") !== -1, 'Служебное');
    });

    test('заголовки листов: email, контакт_id, статус, дата_удаления, контакт_json', () => {
        assertTrue(GS_SRC.indexOf("'email', 'контакт_id'") !== -1,
            'email + контакт_id рядом (ключи привязки)');
        assertTrue(GS_SRC.indexOf("'статус'") !== -1, 'колонка статуса');
        assertTrue(GS_SRC.indexOf("'дата_удаления'") !== -1, 'дата_удаления (архив)');
        assertTrue(GS_SRC.indexOf("'контакт_json'") !== -1,
            'json-снимок — резерв на смену phonebook.json');
        assertTrue(GS_SRC.indexOf("'примечание'") !== -1, 'колонка примечания');
    });

    test('мягкое удаление: статусы «активна»/«удалена»', () => {
        assertTrue(GS_SRC.indexOf("STATUS_ACTIVE: 'активна'") !== -1, 'активна');
        assertTrue(GS_SRC.indexOf("STATUS_REMOVED: 'удалена'") !== -1, 'удалена');
    });

    test('версии: SCHEMA_VERSION + SRV_VER 537 (расширение архива)', () => {
        assertTrue(GS_SRC.indexOf('SCHEMA_VERSION: 1') !== -1,
            'версия структуры листов');
        assertTrue(GS_SRC.indexOf("SRV_VER: '537'") !== -1,
            'серверная версия для клиента');
    });

    test('гейт secret.view + fail-closed без RoleMatrixGate.gs', () => {
        assertTrue(GS_SRC.indexOf("rmRequirePerm(token, 'secret.view', 'PhonebookArchive')") !== -1,
            'право secret.view — как у страницы справочника');
        assertTrue(GS_SRC.indexOf('typeof rmRequirePerm !== \'function\'') !== -1,
            'fail-closed: гейт не задеплоен → отказ всем');
    });

    test('LockService на записи (параллельные вызовы)', () => {
        assertTrue(GS_SRC.indexOf('LockService.getScriptLock()') !== -1,
            'блокировка есть');
        const blocks = GS_SRC.split('lock.waitLock(20000);').length - 1;
        assertEqual(3, blocks, 'setFavorite + setNote + _getArchive');
    });

    test('аудит: коды PHONEBOOK_*', () => {
        ['PHONEBOOK_FAV_ADD', 'PHONEBOOK_FAV_REMOVE', 'PHONEBOOK_NOTE_ADD',
         'PHONEBOOK_NOTE_UPDATE', 'PHONEBOOK_NOTE_REMOVE',
         'PHONEBOOK_ARCHIVE_CREATED'].forEach(code => {
            assertTrue(GS_SRC.indexOf(code) !== -1, 'код ' + code);
        });
    });

    test('текстовый формат \'@\' (Task 304) + экранирование формул', () => {
        assertTrue(GS_SRC.indexOf("setNumberFormat('@')") !== -1,
            '@ на текстовые колонки');
        assertTrue(GS_SRC.indexOf('_escCell') !== -1,
            'экранирование значений');
        assertTrue(GS_SRC.indexOf("/^[=+\\-@]/") !== -1,
            'префиксы формул =+-@');
    });

    test('phonebookArchiveInit + phonebookArchiveStatus (редактор)', () => {
        assertTrue(GS_SRC.indexOf('function phonebookArchiveInit()') !== -1,
            'разовое создание файла');
        assertTrue(GS_SRC.indexOf('function phonebookArchiveStatus()') !== -1,
            'диагностика');
    });

    test('лимиты: контакт_id ≤ 400, примечание ≤ 500 (как Task 471)', () => {
        assertTrue(GS_SRC.indexOf('MAX_CONTACT_ID: 400') !== -1, 'лимит id');
        assertTrue(GS_SRC.indexOf('MAX_NOTE: 500') !== -1, 'лимит примечания');
    });
});

// ============================================================
// 2. SRC — Code.gs: роутинг phonebook.*
// ============================================================
describe('Task 537 — SRC: Code.gs роутинг', () => {

    test('case phonebook.getMyData → PhonebookArchive.getMyData', () => {
        assertTrue(CODE_SRC.indexOf("case 'phonebook.getMyData':") !== -1, 'case есть');
        assertTrue(CODE_SRC.indexOf('return _json(PhonebookArchive.getMyData(payload));') !== -1,
            'вызов модуля');
    });

    test('case phonebook.setFavorite → PhonebookArchive.setFavorite', () => {
        assertTrue(CODE_SRC.indexOf("case 'phonebook.setFavorite':") !== -1, 'case есть');
        assertTrue(CODE_SRC.indexOf('return _json(PhonebookArchive.setFavorite(payload));') !== -1,
            'вызов модуля');
    });

    test('case phonebook.setNote → PhonebookArchive.setNote', () => {
        assertTrue(CODE_SRC.indexOf("case 'phonebook.setNote':") !== -1, 'case есть');
        assertTrue(CODE_SRC.indexOf('return _json(PhonebookArchive.setNote(payload));') !== -1,
            'вызов модуля');
    });

    test('шапка-индекс Code.gs упоминает PhonebookArchive (Task 537)', () => {
        assertTrue(CODE_SRC.indexOf('PhonebookArchive (Task 537)') !== -1,
            'строка в списке модулей');
    });

    test('роуты НЕ в GATE_ACTIONS (гейт внутри модуля, как PlanEvents)', () => {
        const ga = CODE_SRC.slice(CODE_SRC.indexOf('const GATE_ACTIONS'),
                                  CODE_SRC.indexOf('var _gateLegacyWarned'));
        assertTrue(ga.indexOf('phonebook') === -1,
            'phonebook.* не в GATE_ACTIONS — secret.view проверяет модуль');
    });
});

// ============================================================
// 3. VM — инициализация файла-архива
// ============================================================
describe('Task 537 — VM: инициализация файла', () => {

    test('phonebookArchiveInit создаёт файл с названием и сохраняет ID', () => {
        const env = makeEnv();
        const m = loadPA(env);
        const r = m.init();
        assertTrue(r.ok, 'ok');
        assertEqual(1, env.state.created.length, 'ровно один файл');
        assertEqual('Телефонный справочник — Архив пользователей',
            env.state.created[0].getName(), 'название файла');
        assertTrue(!!env.state.props.PHONEBOOK_ARCHIVE_SPREADSHEET_ID,
            'ID в Script Properties');
        assertEqual(env.state.created[0].getId(),
            env.state.props.PHONEBOOK_ARCHIVE_SPREADSHEET_ID, 'ID совпадает');
    });

    test('три листа: «Избранное», «Примечания», «Служебное» (порядок)', () => {
        const env = makeEnv();
        const m = loadPA(env);
        m.init();
        const ss = env.state.created[0];
        assertDeepEqual(['Избранное', 'Примечания', 'Служебное'],
            ss.getSheets().map(s => s.getName()),
            'Лист1 переиспользован под «Служебное», без пустышек');
    });

    test('заголовки листов данных (11 и 13 колонок)', () => {
        const env = makeEnv();
        const m = loadPA(env);
        m.init();
        const ss = env.state.created[0];
        assertDeepEqual(['id', 'дата_добавления', 'email', 'контакт_id', 'фио',
                     'должность', 'телефон', 'организация', 'контакт_json',
                     'статус', 'дата_удаления'],
            ss.getSheetByName('Избранное').rows[0], 'шапка «Избранного»');
        assertDeepEqual(['id', 'дата_создания', 'дата_изменения', 'дата_удаления',
                     'email', 'контакт_id', 'фио', 'должность', 'телефон',
                     'организация', 'контакт_json', 'примечание', 'статус'],
            ss.getSheetByName('Примечания').rows[0], 'шапка «Примечаний»');
    });

    test('«Служебное»: версия структуры, назначение, порядок расширения', () => {
        const env = makeEnv();
        const m = loadPA(env);
        m.init();
        const svc = env.state.created[0].getSheetByName('Служебное');
        const pairs = {};
        svc.rows.slice(1).forEach(r => { pairs[r[0]] = r[1]; });
        assertEqual(1, pairs['Версия структуры'], 'SCHEMA_VERSION 1');
        assertTrue(String(pairs['Назначение файла']).indexOf('данные индивидуальны') !== -1,
            'принцип email-привязки задокументирован');
        assertTrue(String(pairs['Расширение архива']).indexOf('новыми листами') !== -1,
            'порядок расширения задокументирован (заявка)');
        assertEqual('537', pairs['Серверная версия'], 'SRV_VER');
    });

    test('init идемпотентен: повторный запуск не создаёт второй файл', () => {
        const env = makeEnv();
        const m = loadPA(env);
        m.init();
        const id1 = env.state.props.PHONEBOOK_ARCHIVE_SPREADSHEET_ID;
        m.init();
        assertEqual(1, env.state.created.length, 'файл по-прежнему один');
        assertEqual(id1, env.state.props.PHONEBOOK_ARCHIVE_SPREADSHEET_ID,
            'ID не менялся');
    });

    test('status(): диагностика без изменений', () => {
        const env = makeEnv();
        const m = loadPA(env);
        m.init();
        const r = m.status();
        assertTrue(r.file, 'файл доступен');
        assertEqual(true, r.sheets['Избранное'].present, 'лист Избранное');
        assertEqual(true, r.sheets['Примечания'].present, 'лист Примечания');
        assertEqual(1, r.schemaVersion, 'версия структуры прочитана');
        assertEqual(0, r.sheets['Избранное'].rows, 'строк данных нет');
    });

    test('ленивое автосоздание: getMyData без init создаёт файл', () => {
        const env = makeEnv();
        const m = loadPA(env);
        const r = m.PA.getMyData({ token: 't' });
        assertTrue(r.ok, 'ok');
        assertEqual(1, env.state.created.length, 'файл создан при первом обращении');
        assertTrue(!!env.state.props.PHONEBOOK_ARCHIVE_SPREADSHEET_ID, 'ID сохранён');
        assertDeepEqual({}, r.data.favorites, 'избранное пусто');
        assertDeepEqual({}, r.data.notes, 'примечания пусты');
        assertEqual('537', r.data.srvVer, 'srvVer');
        assertTrue(env.state.audit.some(
            a => a.action === 'PHONEBOOK_ARCHIVE_CREATED'),
            'создание файла — в журнале аудита');
    });

    test('авто-ремонт: удалённый вручную лист «Избранное» восстанавливается', () => {
        const env = makeEnv();
        const m = loadPA(env);
        m.init();
        const ss = env.state.created[0];
        // пользователь случайно удалил лист данных
        ss.sheets = ss.sheets.filter(s => s.getName() !== 'Избранное');
        const r = m.PA.getMyData({ token: 't' });
        assertTrue(r.ok, 'ok (не sheet_not_found)');
        assertTrue(!!ss.getSheetByName('Избранное'), 'лист восстановлен с шапкой');
        assertEqual('email', ss.getSheetByName('Избранное').rows[0][2],
            'заголовки на месте');
    });
});

// ============================================================
// 4. VM — избранное: привязка к email
// ============================================================
describe('Task 537 — VM: избранное (email-привязка)', () => {

    function envWithUser(email) { return makeEnv({ user: email }); }

    test('setFavorite on=true: строка с email, контакт_id, статусом и снимками', () => {
        const env = envWithUser('user@example.com');
        const m = loadPA(env);
        m.init();
        const r = m.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: true });
        assertTrue(r.ok, 'ok');
        assertFalse(r.data.already, 'не дубликат');
        const fav = env.state.created[0].getSheetByName('Избранное');
        assertEqual(2, fav.rows.length, 'шапка + 1 строка');
        assertEqual(1, fav.rows[1][0], 'id автоинкремент');
        assertEqual('user@example.com', fav.rows[1][2], 'email автора');
        assertEqual(CID, fav.rows[1][3], 'контакт_id');
        assertEqual('Иванов Иван Иванович', fav.rows[1][4], 'снимок фио');
        assertEqual('50 01', fav.rows[1][6], 'снимок телефона');
        assertEqual('активна', fav.rows[1][9], 'статус');
        assertTrue(String(fav.rows[1][8]).indexOf('Отдел КИПиА') !== -1,
            'контакт_json содержит группу (снимок)');
    });

    test('повторное on=true → already: true, дублей нет', () => {
        const env = envWithUser('user@example.com');
        const m = loadPA(env);
        m.init();
        m.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: true });
        const r = m.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: true });
        assertTrue(r.ok && r.data.already === true, 'already');
        const fav = env.state.created[0].getSheetByName('Избранное');
        assertEqual(2, fav.rows.length, 'по-прежнему одна строка данных');
    });

    test('getMyData: только свои записи', () => {
        const env = envWithUser('user@example.com');
        const m = loadPA(env);
        m.init();
        m.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: true });
        const r = m.PA.getMyData({ token: 't' });
        assertDeepEqual({ [CID]: true }, r.data.favorites, 'свой контакт виден');
    });

    test('ИЗОЛЯЦИЯ: чужие избранное не видны и не удаляемы', () => {
        const env = envWithUser('first@example.com');
        const m = loadPA(env);
        m.init();
        m.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: true });

        // второй пользователь (другой email) — свой гейт-ответ
        const env2 = makeEnv({ user: 'second@example.com' });
        env2.state.props = env.state.props;      // тот же файл-архив
        env2.state.files = env.state.files;
        const m2 = loadPA(env2);
        const r2 = m2.PA.getMyData({ token: 't' });
        assertDeepEqual({}, r2.data.favorites, 'чужое избранное НЕ видно');

        // попытка удалить ЧУЖОЙ контакт — не трогает строку первого
        const rm = m2.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: false });
        assertTrue(rm.ok && rm.data.removed === false, 'удалять нечего');
        const fav = env.state.created[0].getSheetByName('Избранное');
        assertEqual('активна', fav.rows[1][9], 'строка первого пользователя цела');
    });

    test('on=false: мягкое удаление — статус «удалена» + дата_удаления', () => {
        const env = envWithUser('user@example.com');
        const m = loadPA(env);
        m.init();
        m.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: true });
        const r = m.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: false });
        assertTrue(r.ok && r.data.removed === true, 'removed');
        const fav = env.state.created[0].getSheetByName('Избранное');
        assertEqual('удалена', fav.rows[1][9], 'статус (архив: строка осталась)');
        assertTrue(String(fav.rows[1][10]).indexOf('2026-') === 0,
            'дата_удаления заполнена');
        assertDeepEqual({}, m.PA.getMyData({ token: 't' }).data.favorites,
            'в своих данных контакта больше нет');
    });

    test('on=false повторно → removed: false (идемпотентно)', () => {
        const env = envWithUser('user@example.com');
        const m = loadPA(env);
        m.init();
        m.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: true });
        m.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: false });
        const r = m.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: false });
        assertTrue(r.ok && r.data.removed === false, 'удалять нечего');
    });

    test('повторное добавление после удаления — НОВАЯ строка (история)', () => {
        const env = envWithUser('user@example.com');
        const m = loadPA(env);
        m.init();
        m.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: true });
        m.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: false });
        const r = m.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: true });
        assertFalse(r.data.already, 'новая строка, не already');
        const fav = env.state.created[0].getSheetByName('Избранное');
        assertEqual(3, fav.rows.length, 'шапка + 2 строки (история сохранена)');
        assertEqual('удалена', fav.rows[1][9], 'первая строка — архивная');
        assertEqual('активна', fav.rows[2][9], 'вторая — активная');
        assertEqual(2, fav.rows[2][0], 'id вырос');
    });

    test('email регистронезависим: User@EXAMPLE.com == user@example.com', () => {
        const env = envWithUser('USER@EXAMPLE.COM');
        const m = loadPA(env);
        m.init();
        m.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: true });
        const fav = env.state.created[0].getSheetByName('Избранное');
        assertEqual('user@example.com', fav.rows[1][2], 'в листе — малые буквы');
        // читает тот же пользователь с другим регистром в сессии
        const env2 = makeEnv({ user: 'user@example.com' });
        env2.state.props = env.state.props;
        env2.state.files = env.state.files;
        const m2 = loadPA(env2);
        assertDeepEqual({ [CID]: true },
            m2.PA.getMyData({ token: 't' }).data.favorites, 'запись видна');
    });

    test('аудит: PHONEBOOK_FAV_ADD / PHONEBOOK_FAV_REMOVE', () => {
        const env = envWithUser('user@example.com');
        const m = loadPA(env);
        m.init();
        m.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: true });
        m.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: false });
        const codes = env.state.audit.map(a => a.action);
        assertTrue(codes.indexOf('PHONEBOOK_FAV_ADD') !== -1, 'добавление');
        assertTrue(codes.indexOf('PHONEBOOK_FAV_REMOVE') !== -1, 'удаление');
        const favAudits = env.state.audit.filter(
            a => a.action.indexOf('PHONEBOOK_FAV') === 0);
        assertTrue(favAudits.length > 0 &&
            favAudits.every(a => a.email === 'user@example.com'),
            'email автора в записях аудита избранного');
    });
});

// ============================================================
// 5. VM — примечания
// ============================================================
describe('Task 537 — VM: примечания', () => {

    test('setNote текст → created: строка с примечанием и датами', () => {
        const env = makeEnv({ user: 'user@example.com' });
        const m = loadPA(env);
        m.init();
        const r = m.PA.setNote({ token: 't', id: CID, entry: ENTRY,
                                 text: 'Звонить после 17:00' });
        assertTrue(r.ok, 'ok');
        assertEqual('created', r.data.action, 'action created');
        const note = env.state.created[0].getSheetByName('Примечания');
        assertEqual(2, note.rows.length, 'шапка + 1 строка');
        assertEqual('user@example.com', note.rows[1][4], 'email');
        assertEqual(CID, note.rows[1][5], 'контакт_id');
        assertEqual('Звонить после 17:00', note.rows[1][11], 'текст');
        assertEqual('активна', note.rows[1][12], 'статус');
        assertEqual(note.rows[1][1], note.rows[1][2], 'дата_создания = изменения');
    });

    test('правка текста → updated: та же строка, новая дата_изменения', () => {
        const env = makeEnv({ user: 'user@example.com' });
        const m = loadPA(env);
        m.init();
        m.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: 'первый текст' });
        // глубокая копия: строки мутируются setValue на месте
        const before = env.state.created[0].getSheetByName('Примечания')
            .rows.map(r => r.slice());
        const r = m.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: 'второй текст' });
        assertEqual('updated', r.data.action, 'action updated');
        const note = env.state.created[0].getSheetByName('Примечания');
        assertEqual(2, note.rows.length, 'строка ТА ЖЕ (дублей нет)');
        assertEqual('второй текст', note.rows[1][11], 'текст обновлён');
        assertTrue(note.rows[1][2] > before[1][2], 'дата_изменения выросла');
        assertEqual(before[1][1], note.rows[1][1], 'дата_создания не тронута');
    });

    test('getMyData: карта примечаний {id: текст}', () => {
        const env = makeEnv({ user: 'user@example.com' });
        const m = loadPA(env);
        m.init();
        m.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: 'примечание' });
        const r = m.PA.getMyData({ token: 't' });
        assertDeepEqual({ [CID]: 'примечание' }, r.data.notes, 'своя запись');
        assertDeepEqual({}, r.data.favorites, 'избранное не задето');
    });

    test('ИЗОЛЯЦИЯ примечаний: чужие не видны, чужие не удаляемы', () => {
        const env = makeEnv({ user: 'first@example.com' });
        const m = loadPA(env);
        m.init();
        m.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: 'тайна первого' });

        const env2 = makeEnv({ user: 'second@example.com' });
        env2.state.props = env.state.props;
        env2.state.files = env.state.files;
        const m2 = loadPA(env2);
        assertDeepEqual({}, m2.PA.getMyData({ token: 't' }).data.notes,
            'чужое примечание НЕ видно');
        const rm = m2.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: '' });
        assertTrue(rm.data.removed === false, 'удалять нечего');
        const note = env.state.created[0].getSheetByName('Примечания');
        assertEqual('активна', note.rows[1][12], 'строка первого цела');
        assertEqual('тайна первого', note.rows[1][11], 'текст не тронут');
    });

    test('пустой текст → мягкое удаление; повторно → removed: false', () => {
        const env = makeEnv({ user: 'user@example.com' });
        const m = loadPA(env);
        m.init();
        m.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: 'текст' });
        const r = m.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: '   ' });
        assertEqual('removed', r.data.action, 'пробелы = пустой текст');
        assertTrue(r.data.removed, 'removed');
        const note = env.state.created[0].getSheetByName('Примечания');
        assertEqual('удалена', note.rows[1][12], 'статус (архив)');
        assertDeepEqual({}, m.PA.getMyData({ token: 't' }).data.notes, 'больше не видно');
        const r2 = m.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: '' });
        assertTrue(r2.data.removed === false, 'идемпотентно');
    });

    test('повторное создание после удаления — новая строка', () => {
        const env = makeEnv({ user: 'user@example.com' });
        const m = loadPA(env);
        m.init();
        m.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: 'раз' });
        m.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: '' });
        m.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: 'два' });
        const note = env.state.created[0].getSheetByName('Примечания');
        assertEqual(3, note.rows.length, 'история: шапка + 2 строки');
        assertEqual('удалена', note.rows[1][12], 'первая — архивная');
        assertEqual('активна', note.rows[2][12], 'вторая — активная');
    });

    test('валидация: примечание > 500 → invalid_note', () => {
        const env = makeEnv({ user: 'user@example.com' });
        const m = loadPA(env);
        m.init();
        const r = m.PA.setNote({ token: 't', id: CID, entry: ENTRY,
                                 text: 'x'.repeat(501) });
        assertFalse(r.ok, 'отказ');
        assertEqual('invalid_note', r.error, 'код ошибки');
        assertEqual(1, env.state.created[0].getSheetByName('Примечания').rows.length,
            'строк данных нет');
    });

    test('валидация: пустой контакт_id → invalid_id', () => {
        const env = makeEnv({ user: 'user@example.com' });
        const m = loadPA(env);
        m.init();
        assertFalse(m.PA.setFavorite({ token: 't', id: '', entry: ENTRY, on: true }).ok,
            'setFavorite с пустым id отклонён');
        const r = m.PA.setNote({ token: 't', id: '   ', entry: ENTRY, text: 'т' });
        assertEqual('invalid_id', r.error, 'setNote с пробельным id отклонён');
    });

    test('аудит: PHONEBOOK_NOTE_ADD / UPDATE / REMOVE', () => {
        const env = makeEnv({ user: 'user@example.com' });
        const m = loadPA(env);
        m.init();
        m.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: 'раз' });
        m.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: 'два' });
        m.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: '' });
        const codes = env.state.audit.map(a => a.action);
        assertTrue(codes.indexOf('PHONEBOOK_NOTE_ADD') !== -1, 'создание');
        assertTrue(codes.indexOf('PHONEBOOK_NOTE_UPDATE') !== -1, 'правка');
        assertTrue(codes.indexOf('PHONEBOOK_NOTE_REMOVE') !== -1, 'удаление');
    });
});

// ============================================================
// 6. VM — доступ и защита данных
// ============================================================
describe('Task 537 — VM: доступ (secret.view)', () => {

    test('невалидный токен → no_session', () => {
        const env = makeEnv();
        const m = loadPA(env);
        const r = m.PA.getMyData({ token: 'bad' });
        assertFalse(r.ok, 'отказ');
        assertEqual('no_session', r.error, 'код');
    });

    test('нет права secret.view → access_denied', () => {
        const env = makeEnv();
        const m = loadPA(env);
        const r = m.PA.setFavorite({ token: 'noperm', id: CID, entry: ENTRY, on: true });
        assertFalse(r.ok, 'отказ');
        assertEqual('access_denied', r.error, 'код');
    });

    test('гейт вызывается с правом secret.view и контекстом модуля', () => {
        const env = makeEnv();
        const m = loadPA(env);
        m.PA.getMyData({ token: 't' });
        assertEqual(1, env.state.gateCalls.length, 'один вызов гейта');
        assertEqual('secret.view', env.state.gateCalls[0].permId,
            'право — как у страницы справочника');
        assertEqual('PhonebookArchive', env.state.gateCalls[0].context,
            'контекст модуля');
    });

    test('RoleMatrixGate.gs не задеплоен → отказ всем (fail-closed)', () => {
        const env = makeEnv();
        const m = loadPA({ ...env, rmRequirePerm: undefined });
        const r = m.PA.getMyData({ token: 't' });
        assertFalse(r.ok, 'отказ');
        assertEqual('access_denied', r.error, 'код');
        assertTrue(String(r.message || '').indexOf('RoleMatrixGate') !== -1,
            'понятное сообщение о недостающем гейте');
    });
});

describe('Task 537 — VM: защита от формул', () => {

    test('примечание, начинающееся с "=", пишется экранированным', () => {
        const env = makeEnv({ user: 'user@example.com' });
        const m = loadPA(env);
        m.init();
        m.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: '=1+1' });
        const note = env.state.created[0].getSheetByName('Примечания');
        assertEqual("'=1+1", note.rows[1][11],
            'ведущий апостроф — Sheets сохранит текстом');
    });

    test('обычные примечания не экранируются', () => {
        const env = makeEnv({ user: 'user@example.com' });
        const m = loadPA(env);
        m.init();
        m.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: 'Звонить в 17:00' });
        const note = env.state.created[0].getSheetByName('Примечания');
        assertEqual('Звонить в 17:00', note.rows[1][11], 'как есть');
    });

    test('два пользователя в ОДНОМ файле: строки разных email рядом', () => {
        // «таблицы с архивами данных общие, но данные индивидуальные»
        const envA = makeEnv({ user: 'a@example.com' });
        const mA = loadPA(envA);
        mA.init();
        mA.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: true });
        mA.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: 'заметка A' });

        const envB = makeEnv({ user: 'b@example.com' });
        envB.state.props = envA.state.props;
        envB.state.files = envA.state.files;
        const mB = loadPA(envB);
        mB.PA.setFavorite({ token: 't', id: CID, entry: ENTRY, on: true });
        mB.PA.setNote({ token: 't', id: CID, entry: ENTRY, text: 'заметка B' });

        const fav = envA.state.created[0].getSheetByName('Избранное');
        assertEqual(3, fav.rows.length, 'общий лист: 2 строки двух email');
        assertEqual('a@example.com', fav.rows[1][2], 'первая — A');
        assertEqual('b@example.com', fav.rows[2][2], 'вторая — B');
        const note = envA.state.created[0].getSheetByName('Примечания');
        assertEqual(3, note.rows.length, 'примечания — тоже общий лист');

        // каждый видит только своё
        assertDeepEqual({ [CID]: true },
            mA.PA.getMyData({ token: 't' }).data.favorites, 'A видит своё');
        assertDeepEqual({ [CID]: 'заметка B' },
            mB.PA.getMyData({ token: 't' }).data.notes, 'B видит своё');
    });
});
