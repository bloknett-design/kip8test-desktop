// ============================================================
// Task 412 — заявка: «Нет выпадающего списка в форме выбора
// инструктажа и проверки знания, просто пустое поле для ручного
// ввода, а должен быть список из таблицы "Список_И_и_ПЗ"».
//
// Причина: select строится из _INSTR_LIST ← ответ сервера
// workSchedule.listTrainings.instrList; боевой Apps Script не отдал
// ни одного пункта (не обновлён до 407/409 / лист не создан) — форма
// деградировала в свободный ввод (защита Task 407).
//
// Фикс (клиент, паттерн канона Task 387): _normalizeInstrList —
// живой список главный; пустой сервер/кэш → встроенный эталон
// _INSTR_CANON (ровно 5 пунктов заявки 409, байт-в-байт как
// instrListInit): форма «+ Инструктаж…» всегда даёт строгий выбор,
// карточка — групповой вид, тип записи = «вид» пункта.
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');

function extractMethod(src, name) {
    const start = src.indexOf(name + ': function(');
    if (start === -1) return null;
    const braceStart = src.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    return null;
}

function methodText(src, name) {
    const m = extractMethod(src, name);
    if (m === null) throw new Error('метод не найден: ' + name);
    return m;
}

// Свойство-массив (напр. _INSTR_CANON) — текст для встраивания в VM-хост
function propArrayText(src, name) {
    const start = src.indexOf(name + ': [');
    if (start === -1) throw new Error('свойство не найдено: ' + name);
    const open = src.indexOf('[', start);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '[') depth++;
        else if (src[i] === ']') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    throw new Error('массив не закрыт: ' + name);
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

function lsMock() {
    const store = {};
    return {
        store: store,
        getItem: function(k) { return k in store ? store[k] : null; },
        setItem: function(k, v) { store[k] = String(v); },
        removeItem: function(k) { delete store[k]; }
    };
}

// Тихий console для VM-хостов (метод пишет console.warn при фолбэке)
const NO_CONSOLE = { warn: function() {}, info: function() {} };

// Канон из index.html (живое значение, не копия в тесте)
function canonFromSrc() {
    return new Function('return ({' + propArrayText(INDEX_SRC, '_INSTR_CANON') + '});')()._INSTR_CANON;
}

// Эталон instrListInit из WorkSchedule.gs (GAS-источник правды)
function gasCanonFromSrc() {
    const m = WS_SRC.match(/var items = \[([\s\S]*?)\];/);
    if (!m) throw new Error('эталон instrListInit не найден в WorkSchedule.gs');
    const rows = [...m[1].matchAll(/\['([^']+)',\s*'([^']+)',\s*(\d+),\s*'([^']*)'\]/g)];
    if (rows.length !== 5) throw new Error('ожидалось 5 строк эталона, найдено ' + rows.length);
    const out = rows.map(function(r) {
        return { название: r[1], вид: r[2],
                 периодичность: parseInt(r[3], 10), основание: r[4] };
    });
    // Task 419 (заявка 9-ОГЭ): столбец F «в составе» — instrListInit
    // пишет связь в F3 (в пустую ячейку), _readInstrListSheet
    // применяет встроенную связь INSTR_DEFAULT_PARENT к пункту-ребёнку
    const dp = WS_SRC.match(
        /INSTR_DEFAULT_PARENT:\s*\{\s*child:\s*'([^']+)',\s*parent:\s*'([^']+)'/);
    if (!dp) throw new Error('INSTR_DEFAULT_PARENT не найден в WorkSchedule.gs');
    const key = s => String(s || '').trim().toLowerCase()
        .replace(/ё/g, 'е').replace(/\s+/g, ' ');
    for (const it of out) {
        if (key(it.название) === key(dp[1])) it['в составе'] = dp[2];
    }
    return out;
}

// ============================================================
// 1. SRC — канон + подключение
// ============================================================
describe('Task 412 — SRC: встроенный эталон', () => {

    test('канон объявлен: ровно 5 пунктов заявки 409', () => {
        assertTrue(INDEX_SRC.indexOf('_INSTR_CANON: [') !== -1,
            'декларация _INSTR_CANON в состоянии WorkSchedule');
        const canon = canonFromSrc();
        assertEqual(5, canon.length, 'ровно 5 пунктов');
        assertEqual(2, canon.filter(function(x) { return x.вид === 'инструктаж'; }).length,
            '2 повторных инструктажа');
        assertEqual(3, canon.filter(function(x) { return x.вид === 'проверка_знаний'; }).length,
            '3 периодические проверки знаний');
    });

    test('канон = эталон instrListInit (GAS) байт-в-байт', () => {
        assertEqual(JSON.stringify(gasCanonFromSrc()), JSON.stringify(canonFromSrc()),
            'клиентский канон совпадает с серверным эталоном');
    });

    test('периодичности/основания канона', () => {
        const c = canonFromSrc();
        assertEqual(6, c[0].периодичность, 'рабочие инструкции ОТ — 6 мес');
        assertEqual(3, c[1].периодичность, '№ 9-ОГЭ — 3 мес');
        assertEqual(12, c[2].периодичность, 'самостоятельная работа — 12 мес');
        assertEqual(12, c[3].периодичность, 'электроустановки до 1000 В — 12 мес');
        assertEqual(12, c[4].периодичность, 'высота — 12 мес');
        assertEqual('инструкция № 53-ОТ', c[4].основание, 'основание высоты (заявка 409)');
    });

    test('_loadTrainings применяет нормализацию', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_loadTrainings'));
        assertTrue(fn.indexOf('self._INSTR_LIST = self._normalizeInstrList(data.instrList);') !== -1,
            'пустой ответ сервера — встроенный эталон (не пустой список)');
    });

    test('_restoreCachedView применяет нормализацию', () => {
        // Task 476: разбор объекта кэша вынесен в _restoreFromObj
        // (общий для localStorage- и KipDB-слоёв) — ассерт на нём.
        const r = stripComments(methodText(INDEX_SRC, '_restoreFromObj'));
        assertTrue(r.indexOf('this._INSTR_LIST = this._normalizeInstrList(') !== -1,
            'пустой кэш прежней версии — встроенный эталон');
        assertTrue(r.indexOf('Array.isArray(c.instrList) ? c.instrList : []') !== -1,
            'guard кэша прежней версии сохранён (Task 407)');
    });

    test('_normalizeInstrList: живой список главный, пустой — канон', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_normalizeInstrList'));
        // Task 420: живой список возвращается (с встроенной связью
        // 9-ОГЭ для листа без столбца «в составе» — дубль серверной
        // логики), не замещается каноном
        assertTrue(fn.indexOf('if (items.length) {') !== -1 &&
                   fn.indexOf('return items;') !== -1,
            'непустой живой список возвращается как есть');
        assertTrue(fn.indexOf('this._INSTR_CANON') !== -1,
            'фолбэк — встроенный канон');
    });

    test('регресс 410: select в instr-режиме при непустом списке', () => {
        const sf = stripComments(methodText(INDEX_SRC, '_syncTrTitleField'));
        assertTrue(sf.indexOf('var useSel = !!this._trInstrMode &&') !== -1 &&
                   sf.indexOf('(this._INSTR_LIST || []).length > 0;') !== -1,
            'условие select не изменено');
    });
});

// ============================================================
// 2. VM — _normalizeInstrList
// ============================================================
describe('Task 412 — VM: _normalizeInstrList', () => {

    const host = new Function('console', 'return ({' +
        propArrayText(INDEX_SRC, '_INSTR_CANON') + ',' +
        methodText(INDEX_SRC, '_normalizeInstrList') + '});')(NO_CONSOLE);

    test('пустой массив → 5 пунктов канона', () => {
        const r = host._normalizeInstrList([]);
        assertEqual(5, r.length, 'канон заявки 409');
        assertEqual('Повторный инструктаж по рабочим инструкциям ОТ', r[0].название,
            'первый пункт');
    });

    test('undefined/null → канон (старый сервер без поля)', () => {
        assertEqual(5, host._normalizeInstrList(undefined).length,
            'поля instrList нет в ответе');
        assertEqual(5, host._normalizeInstrList(null).length, 'null');
    });

    test('живой список — возвращается как есть', () => {
        const live = [{ название: 'Вводный инструктаж', вид: 'инструктаж',
                        периодичность: 0, основание: '' }];
        const r = host._normalizeInstrList(live);
        assertEqual(1, r.length, 'живой список главнее канона');
        assertEqual('Вводный инструктаж', r[0].название, 'без подмены');
    });

    test('строки без названия отфильтровываются', () => {
        const r = host._normalizeInstrList([
            { название: '  ', вид: 'инструктаж', периодичность: 6, основание: '' },
            { вид: 'инструктаж' },
            { название: 'Цеховый инструктаж', вид: 'инструктаж',
              периодичность: 6, основание: '' }
        ]);
        assertEqual(1, r.length, 'мусорные строки отброшены, живая осталась');
        assertEqual('Цеховый инструктаж', r[0].название, 'живая строка');
    });

    test('фолбэк возвращает КОПИЮ канона (не мутирует)', () => {
        const a = host._normalizeInstrList([]);
        const b = host._normalizeInstrList(undefined);
        a[0].название = 'испорчен';
        assertEqual('Повторный инструктаж по рабочим инструкциям ОТ', b[0].название,
            'повторный вызов не зависит от мутаций первого');
        assertEqual('Повторный инструктаж по рабочим инструкциям ОТ',
            host._INSTR_CANON[0].название, 'канон не мутирован');
    });
});

// ============================================================
// 3. VM — _loadTrainings: пустой сервер (регресс заявки)
// ============================================================
describe('Task 412 — VM: _loadTrainings (пустой ответ сервера)', () => {

    function loadHost(serverData) {
        return new Function('console', 'SRV', 'return ({' +
            propArrayText(INDEX_SRC, '_INSTR_CANON') + ',' +
            methodText(INDEX_SRC, '_normalizeInstrList') + ',' +
            methodText(INDEX_SRC, '_loadTrainings') + ',' +
            '_api: function(a, p) { return Promise.resolve(SRV); },' +
            '_TRAININGS: null, _INSTR_LIST: null, _INSTR_ALL: null,' +
            '_EVENTS_ALL: null, _year: 2026' +
            '});')(NO_CONSOLE, serverData);
    }

    test('instrList: [] → _INSTR_LIST = 5 пунктов канона', async () => {
        const host = loadHost({ trainings: [], instrList: [], instrAll: [], eventsAll: [] });
        await host._loadTrainings();
        assertEqual(5, host._INSTR_LIST.length,
            'форма не деградирует в свободный ввод (заявка 412)');
        assertEqual('инструктаж', host._INSTR_LIST[0].вид, 'вид первого пункта');
    });

    test('живой instrList → живой список без подмены', async () => {
        const live = [{ название: 'Повторный инструктаж по инструкции № 9-ОГЭ',
                        вид: 'инструктаж', периодичность: 3, основание: '' }];
        const host = loadHost({ trainings: [], instrList: live, instrAll: [], eventsAll: [] });
        await host._loadTrainings();
        assertEqual(1, host._INSTR_LIST.length, 'живой лист главный');
        assertEqual(3, host._INSTR_LIST[0].периодичность, 'поля живого листа');
    });
});

// ============================================================
// 4. VM — _restoreCachedView: кэш прежней версии
// ============================================================
describe('Task 412 — VM: _restoreCachedView (кэш без instrList)', () => {

    function restoreHost(cacheObj) {
        const ls = lsMock();
        ls.store['kip8_ws_test_412'] = JSON.stringify(cacheObj);
        return new Function('document', 'localStorage', 'console', 'return ({' +
            methodText(INDEX_SRC, '_cacheRead') + ',' +
            methodText(INDEX_SRC, '_restoreCachedView') + ',' +
            methodText(INDEX_SRC, '_restoreFromObj') + ',' +
            methodText(INDEX_SRC, '_ymKey') + ',' +
            propArrayText(INDEX_SRC, '_INSTR_CANON') + ',' +
            methodText(INDEX_SRC, '_normalizeInstrList') + ',' +
            '_normalizeStatusCodes: function(c) { return c; },' +
            '_fillStatusSelect: function() {},' +
            '_wsCacheKey: "kip8_ws_test_412",' +
            '_STATUS_CODES: [], _PATTERNS: [], _EMPLOYEES: [],' +
            '_VACATIONS: [], _VAC_PAGE: [], _PPE: [],' +
            '_INSTR_LIST: [], _INSTR_ALL: [], _EVENTS_ALL: [], _vacYear: 0,' +
            '_year: 2026, _month: 9, _cacheTs: 0' +
            '});')(mockDoc({}), ls, NO_CONSOLE);
    }

    const baseCache = {
        v: 1,
        codes: [{ code: 'И', name: 'инструктаж', color: '#111' }],
        patterns: [],
        employees: [{ 'таб_номер': '017', 'ФИО': 'И' }],
        vacations: { '2026': [] },
        ppe: [],
        views: { '2026-09': { entries: [], trainings: [], ts: 1 } }
    };

    test('кэш ПРЕЖНЕЙ версии (без instrList) — эталон', () => {
        const host = restoreHost(baseCache);
        assertTrue(host._restoreCachedView(), 'кэш поднят');
        assertEqual(5, host._INSTR_LIST.length,
            'старый кэш → встроенный эталон (до первого «Обновить»)');
    });

    test('кэш с живым instrList — живой список', () => {
        const c = JSON.parse(JSON.stringify(baseCache));
        c.instrList = [{ название: 'Вводный инструктаж', вид: 'инструктаж',
                         периодичность: 0, основание: '' }];
        c.instrAll = [];
        const host = restoreHost(c);
        assertTrue(host._restoreCachedView(), 'кэш поднят');
        assertEqual(1, host._INSTR_LIST.length, 'живой список из кэша');
    });
});

// ============================================================
// 5. VM — форма: select после пустого сервера
// ============================================================
describe('Task 412 — VM: форма «+ Инструктаж…» (канон)', () => {

    // как openTrainingForm: _INSTR_LIST уже нормализован загрузкой
    function formHost(serverList) {
        const els = {
            wsTrType: { value: '' },
            wsTrTitleSel: { hidden: false, innerHTML: 'stale', value: '' },
            wsTrTitle: { hidden: false, value: 'старый текст' },
            wsTrTitleList: { innerHTML: 'stale' },
            wsTrItemHint: { hidden: true, textContent: 'старая подсказка' }
        };
        const host = new Function('document', 'console', 'return ({' +
            methodText(INDEX_SRC, '_syncTrTitleField') + ',' +
            methodText(INDEX_SRC, '_updateTrItemHint') + ',' +
            methodText(INDEX_SRC, '_fillTrTitleOptions') + ',' +
            methodText(INDEX_SRC, '_isInstrType') + ',' +
            methodText(INDEX_SRC, '_normInstrKind') + ',' +
            methodText(INDEX_SRC, '_normInstrKey') + ',' +
            methodText(INDEX_SRC, '_fmtPeriodRu') + ',' +
            methodText(INDEX_SRC, '_normalizeInstrList') + ',' +
            propArrayText(INDEX_SRC, '_INSTR_CANON') + ',' +
            '_esc: function(s) { return String(s); },' +
            '_plural: function(n, f) { return f[2]; },' +
            '_trInstrMode: true,' +
            '_INSTR_LIST: []' +
            '});')(mockDoc(els), NO_CONSOLE);
        host._INSTR_LIST = host._normalizeInstrList(serverList);
        return { host: host, els: els };
    }

    test('пустой сервер: select показан (не свободный ввод)', () => {
        const c = formHost([]);
        c.host._syncTrTitleField();
        assertTrue(c.els.wsTrTitleSel.hidden === false,
            'select виден — заявка 412 выполнена');
        assertTrue(c.els.wsTrTitle.hidden === true,
            'текстовый ввод скрыт');
    });

    test('пустой сервер: 5 пунктов в 2 группах', () => {
        const c = formHost([]);
        c.host._syncTrTitleField();
        const h = c.els.wsTrTitleSel.innerHTML;
        assertTrue(h.indexOf('value="">— выберите из списка —') !== -1,
            'пустой пункт');
        const gi = h.indexOf('<optgroup label="Инструктажи">');
        const gp = h.indexOf('<optgroup label="Проверка знаний">');
        assertTrue(gi !== -1 && gp !== -1 && gi < gp, 'обе группы по порядку');
        assertEqual(2, (h.slice(gi, gp).match(/<option /g) || []).length,
            '2 повторных инструктажа в группе');
        assertEqual(3, (h.slice(gp).match(/<option /g) || []).length,
            '3 проверки знаний в группе');
        assertTrue(h.indexOf('Повторный инструктаж по инструкции № 9-ОГЭ') !== -1,
            'пункт № 9-ОГЭ в списке');
        assertTrue(h.indexOf('до 1000 В') !== -1, 'пункт электроустановок в списке');
    });

    test('подсказка пункта «высота» из канона', () => {
        const c = formHost([]);
        c.host._syncTrTitleField();
        c.els.wsTrTitleSel.value =
            'Периодическая проверка знаний по охране труда при выполнении работ на высоте';
        c.host._updateTrItemHint();
        assertEqual('раз в год · Основание: инструкция № 53-ОТ',
            c.els.wsTrItemHint.textContent, 'периодичность + основание (Task 409)');
    });

    test('правка «вне списка» — отдельный пункт (регресс 410)', () => {
        const c = formHost([]);
        c.host._syncTrTitleField('Внеплановый по наряду №4');
        assertTrue(c.els.wsTrTitleSel.innerHTML.indexOf('(вне списка)</option>') !== -1,
            'тема правимой записи вне эталона — отдельный пункт');
    });

    test('тип записи = «вид» пункта канона', () => {
        const t = new Function('return ({' +
            methodText(INDEX_SRC, '_instrTypeOfTheme') + ',' +
            methodText(INDEX_SRC, '_normInstrKey') + ',' +
            methodText(INDEX_SRC, '_normInstrKind') + ',' +
            methodText(INDEX_SRC, '_normalizeInstrList') + ',' +
            propArrayText(INDEX_SRC, '_INSTR_CANON') + '});')();
        t._INSTR_LIST = t._normalizeInstrList([]);
        assertEqual('инструктаж',
            t._instrTypeOfTheme('Повторный инструктаж по инструкции № 9-ОГЭ'),
            'вид пункта → тип записи');
        assertEqual('проверка_знаний',
            t._instrTypeOfTheme('Периодическая проверка знаний на допуск к самостоятельной работе'),
            'ПЗ → тип записи');
        assertEqual('проверка_знаний',
            t._instrTypeOfTheme('  периодическая проверка знаний по охране труда при выполнении работ на высоте '),
            'нормализация регистра/пробелов');
    });
});

// ============================================================
// 6. SW — версия кэша
// ============================================================
describe('Task 412 — SW', () => {

    test('версия кэша поднята (v639)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v731') !== -1,
            'CACHE_VERSION = kipia-test-v731');
    });
});
