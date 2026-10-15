// tests/test-prod-calendar.js
// Task 260: тесты модуля ProdCalendar (производственный календарь РФ)
//
// Что проверяется:
//   1. Парсинг isDayOff (GitHub-зеркало) — реальные данные 2024/2026:
//      праздники, перенесённые выходные, сокращённые дни, РАБОЧИЕ
//      субботы (2024: 27.04, 28.12, 02.11).
//      (Task 272: парсер production-calendar.ru и его тесты удалены
//      вместе с источником — токен и выбор региона убраны из
//      приложения, регион один: 42 — Кемеровская область - Кузбасс.)
//   2. dayInfo — единая логика «нерабочий/праздник/сокращённый/рабочая
//      суббота + название»; фолбэк без данных (Сб/Вс + ст. 112 ТК РФ).
//   3. monthStats — нормы времени 40/36/24-час. недель по месяцам и
//      году (сверено с официальным календарём 2026: 247 дн., 1972 ч).
//   4. Кэш localStorage (ключ = год + регион), TTL, офлайн-устаревание.
//   5. Настройки: регион фиксирован 42 (Кемеровская область — Кузбасс),
//      хранившиеся настройки (регион/токен) вычищаются (Task 272).
//   6. Интеграция в index.html: кнопка «Обновить» в тулбаре, диалог
//      подтверждения, вызовы в WorkSchedule, CSS, SW-версия.
//   7. Task 264: День города Кемерово (12 июня, регион 42, вместе с
//      Днём России), окошко календаря в тулбаре (нормы и праздники
//      месяца), звёздочка сокращённых предпраздничных дней.
//   8. Task 272: кнопка «Календарь» → «Обновить» (диалог с источником
//      calendar.legalic.ru и подтверждением), шторка настроек,
//      выбор региона и поле токена production-calendar.ru удалены.
//
// Запуск: через tests/run-all.js (require './test-prod-calendar.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue, assertFalse, assertApprox } = require('./test-helpers.js');

const indexPath = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');

// ============================================================
// Извлечение модуля ProdCalendar из index.html (vm-песочница с моком
// localStorage; сетевые методы подменяются в конкретных тестах).
// ============================================================

function extractProdCalendarSrc(src) {
    const marker = 'var ProdCalendar = {';
    const start = src.indexOf(marker);
    if (start === -1) return null;
    const braceStart = src.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1) + ';';
        }
    }
    return null;
}

const PC_SRC = extractProdCalendarSrc(html);

// Фабрика: свежий экземпляр ProdCalendar в vm-контексте с моком localStorage
function makePC(storageData) {
    const storage = {
        _d: storageData || {},
        getItem: function(k) { return (k in this._d) ? this._d[k] : null; },
        setItem: function(k, v) { this._d[String(k)] = String(v); },
        removeItem: function(k) { delete this._d[k]; }
    };
    const ctx = {
        localStorage: storage,
        console: console,
        Math: Math, Date: Date, JSON: JSON, RegExp: RegExp,
        parseInt: parseInt, parseFloat: parseFloat,
        isNaN: isNaN, isFinite: isFinite,
        String: String, Number: Number, Boolean: Boolean,
        Array: Array, Object: Object, Promise: Promise,
        setTimeout: function() { return 0; },
        clearTimeout: function() {},
        document: { getElementById: function() { return null; } }
    };
    vm.createContext(ctx);
    vm.runInContext(PC_SRC, ctx, { filename: 'index.html-ProdCalendar' });
    return { PC: ctx.ProdCalendar, storage: storage };
}

// ============================================================
// Фикстуры — РЕАЛЬНЫЕ данные источников (изъяты живыми запросами)
// ============================================================

// isDayOff 2026 (raw.githubusercontent.com/isdayoff/calendars):
// 18 нерабочих сверх Сб/Вс, 4 сокращённых, 0 рабочих суббот, 14 праздников
const IDO_2026 = {
    year: 2026, countrycode: 'ru',
    dayoff: ['0101','0102','0103','0104','0105','0106','0107','0108',
             '0109','0110','0111','0223','0309','0501','0511','0612',
             '1104','1231'],
    predayoff: ['0430','0508','0611','1103'],
    workday: [],
    holiday: ['0101','0102','0103','0104','0105','0106','0107','0108',
              '0223','0308','0501','0509','0612','1104'],
    covidday: []
};

// isDayOff 2024 — год с РАБОЧИМИ субботами (0427, 1228, 1102)
const IDO_2024 = {
    year: 2024, countrycode: 'ru',
    dayoff: ['0101','0102','0103','0104','0105','0106','0107','0108',
             '0223','0308','0429','0430','0501','0509','0510','0612',
             '1104','1230','1231'],
    predayoff: ['0222','0307','0508','0611','1102'],
    workday: ['0427','1228','1102'],
    holiday: ['0101','0102','0103','0104','0105','0106','0107','0108',
              '0223','0308','0501','0509','0612','1104'],
    covidday: []
};

// Task 272: фикстуры production-calendar.ru (PCAL_DAYS, PCAL_OK,
// PCAL_GUEST_RESTRICTED) УДАЛЕНЫ вместе с парсером и тестами —
// источник с личным токеном исключён из приложения.

// Загрузить в модуль данные isDayOff конкретного года (минуя сеть)
function loadIsDayOff(PC, json, year) {
    const parsed = PC._parseIsDayOff(json);
    PC._MEM[year] = {
        source: parsed.source,
        fetchedAtMs: Date.now(),
        region: 42,
        regionName: 'Кемеровская область - Кузбасс',
        days: parsed.days
    };
    return parsed;
}

// ============================================================
// Тесты
// ============================================================

describe('ProdCalendar: модуль определён', () => {
    test('JS: var ProdCalendar определён в index.html', () => {
        assertTrue(PC_SRC !== null && PC_SRC.indexOf('_DEFAULT_REGION') !== -1,
            'Модуль ProdCalendar извлекается из index.html');
    });
    test('JS: источники данных — legalic (основной) и isDayOff (резерв)', () => {
        assertTrue(html.indexOf('calendar.legalic.ru/api/v1/calendars/RU-FEDERAL/export') !== -1,
            'URL legalic прописан (основной источник)');
        assertTrue(html.indexOf('raw.githubusercontent.com/isdayoff/calendars') !== -1,
            'URL isDayOff GitHub-зеркала прописан');
        assertTrue(html.indexOf('https://production-calendar.ru/v2/ru/') === -1,
            'URL production-calendar.ru удалён (Task 272 — токен больше не используется)');
    });
});

describe('ProdCalendar: парсинг isDayOff', () => {
    test('2026: 18 нерабочих сверх Сб/Вс, 4 сокращённых', () => {
        const { PC } = makePC();
        const parsed = PC._parseIsDayOff(IDO_2026);
        let offs = 0, shorts = 0, holidays = 0;
        for (const k in parsed.days) {
            if (parsed.days[k].off) offs++;
            if (parsed.days[k].short) shorts++;
            if (parsed.days[k].holiday) holidays++;
        }
        assertEqual(offs, 18, 'dayoff[] → 18 записей off');
        assertEqual(shorts, 4, 'predayoff[] → 4 записи short');
        assertEqual(holidays, 14, 'holiday[] → 14 записей holiday');
        assertEqual(parsed.source, 'isdayoff', 'источник помечен');
    });
    test('2026: 9 января — перенесённый выходной (off без holiday)', () => {
        const { PC } = makePC();
        const parsed = PC._parseIsDayOff(IDO_2026);
        assertTrue(parsed.days['0109'].off === 1 && !parsed.days['0109'].holiday,
            '0109 = off, не праздник (перенос с субботы 3 января)');
    });
    test('2024: рабочие субботы 0427/1228/1102 → work, без off', () => {
        const { PC } = makePC();
        const parsed = PC._parseIsDayOff(IDO_2024);
        assertTrue(parsed.days['0427'].work === 1 && !parsed.days['0427'].off,
            '27 апреля 2024 — рабочая суббота');
        assertTrue(parsed.days['1102'].work === 1 && parsed.days['1102'].short === 1,
            '2 ноября 2024 — рабочая И сокращённая суббота');
    });
    test('некорректный формат → null', () => {
        const { PC } = makePC();
        assertEqual(PC._parseIsDayOff(null), null);
        assertEqual(PC._parseIsDayOff({ predayoff: ['0101'] }), null,
            'нет dayoff[] → null');
        assertEqual(PC._parseIsDayOff({ dayoff: '0101' }), null,
            'dayoff не массив → null');
    });
});

// Task 272: describe «Парсинг production-calendar.ru» УДАЛЁН —
// источник с личным токеном исключён из приложения (регион один — 42,
// поле ввода токена и шторка настроек убраны).

describe('ProdCalendar: dayInfo — производственный календарь 2026', () => {
    test('9 января (пт) — перенесённый выходной', () => {
        const { PC } = makePC();
        loadIsDayOff(PC, IDO_2026, 2026);
        const info = PC.dayInfo(2026, 1, 9);
        assertTrue(info.off, 'нерабочий');
        assertFalse(info.holiday, 'не праздник');
        assertEqual(info.title, 'Выходной (перенесённый)');
        assertTrue(info.hasData, 'данные есть');
    });
    test('1 мая (пт) — праздник с названием из ТК РФ', () => {
        const { PC } = makePC();
        loadIsDayOff(PC, IDO_2026, 2026);
        const info = PC.dayInfo(2026, 5, 1);
        assertTrue(info.off && info.holiday);
        assertEqual(info.title, 'Праздник Весны и Труда');
    });
    test('9 мая (сб) — праздник на выходном', () => {
        const { PC } = makePC();
        loadIsDayOff(PC, IDO_2026, 2026);
        const info = PC.dayInfo(2026, 5, 9);
        assertTrue(info.off, 'нерабочий (суббота + праздник)');
        assertTrue(info.holiday);
        assertEqual(info.title, 'День Победы');
    });
    test('30 апреля (чт) — сокращённый рабочий день', () => {
        const { PC } = makePC();
        loadIsDayOff(PC, IDO_2026, 2026);
        const info = PC.dayInfo(2026, 4, 30);
        assertFalse(info.off, 'рабочий');
        assertTrue(info.short, 'сокращённый');
        assertEqual(info.title, 'Сокращённый рабочий день');
    });
    test('23 февраля (пн) и 8 марта (вс) — праздники', () => {
        const { PC } = makePC();
        loadIsDayOff(PC, IDO_2026, 2026);
        const feb = PC.dayInfo(2026, 2, 23);
        assertTrue(feb.off && feb.holiday);
        assertEqual(feb.title, 'День защитника Отечества');
        const mar = PC.dayInfo(2026, 3, 8);
        assertTrue(mar.off && mar.holiday, 'воскресенье + праздник');
        assertEqual(mar.title, 'Международный женский день');
    });
    test('31 декабря (чт) — перенесённый выходной', () => {
        const { PC } = makePC();
        loadIsDayOff(PC, IDO_2026, 2026);
        const info = PC.dayInfo(2026, 12, 31);
        assertTrue(info.off && !info.holiday);
        assertEqual(info.title, 'Выходной (перенесённый)');
    });
    test('обычная среда — рабочий день без названия', () => {
        const { PC } = makePC();
        loadIsDayOff(PC, IDO_2026, 2026);
        const info = PC.dayInfo(2026, 8, 12);
        assertFalse(info.off);
        assertEqual(info.title, null);
        assertTrue(info.hasData);
    });
});

describe('ProdCalendar: dayInfo — рабочие субботы 2024', () => {
    test('27 апреля (сб) — РАБОЧАЯ суббота', () => {
        const { PC } = makePC();
        loadIsDayOff(PC, IDO_2024, 2024);
        const info = PC.dayInfo(2024, 4, 27);
        assertFalse(info.off, 'выходной отменён переносом');
        assertTrue(info.work, 'рабочий перенос');
        assertEqual(info.title, 'Рабочий день (перенос)');
    });
    test('28 апреля (вс) — обычный выходной', () => {
        const { PC } = makePC();
        loadIsDayOff(PC, IDO_2024, 2024);
        const info = PC.dayInfo(2024, 4, 28);
        assertTrue(info.off && !info.work);
    });
    test('2 ноября (сб) — рабочая И сокращённая', () => {
        const { PC } = makePC();
        loadIsDayOff(PC, IDO_2024, 2024);
        const info = PC.dayInfo(2024, 11, 2);
        assertFalse(info.off);
        assertTrue(info.work && info.short);
    });
});

describe('ProdCalendar: dayInfo — фолбэк без данных', () => {
    test('Сб/Вс — нерабочие, hasData=false, source=fallback', () => {
        const { PC } = makePC();
        const sat = PC.dayInfo(2027, 8, 14);
        assertTrue(sat.off);
        assertFalse(sat.hasData);
        assertEqual(sat.source, 'fallback');
        const mon = PC.dayInfo(2027, 8, 16);
        assertFalse(mon.off);
    });
    test('праздники ст. 112 ТК РФ видны и без данных', () => {
        const { PC } = makePC();
        const may = PC.dayInfo(2027, 5, 1);
        assertTrue(may.off && may.holiday);
        assertEqual(may.title, 'Праздник Весны и Труда');
        const jan = PC.dayInfo(2027, 1, 7);
        assertEqual(jan.title, 'Рождество Христово');
    });
    test('переносы без данных НЕ известны (обычный рабочий день)', () => {
        const { PC } = makePC();
        const d = PC.dayInfo(2027, 5, 11);
        assertFalse(d.off, 'вторник 11 мая без данных — рабочий');
    });
});

describe('ProdCalendar: monthStats — нормы времени', () => {
    test('январь 2026: 15 рабочих, 120 ч (40-час)', () => {
        const { PC } = makePC();
        loadIsDayOff(PC, IDO_2026, 2026);
        const st = PC.monthStats(2026, 1);
        assertEqual(st.workDays, 15);
        assertEqual(st.offDays, 16);
        assertEqual(st.shortened, 0);
        assertEqual(st.hours40, 120);
        assertEqual(st.specialDays.length, 9,
            '8 праздников (1-8 января) + 1 перенос (9 января)');
    });
    test('май 2026: 19 рабочих, 1 сокращённый, 151 ч', () => {
        const { PC } = makePC();
        loadIsDayOff(PC, IDO_2026, 2026);
        const st = PC.monthStats(2026, 5);
        assertEqual(st.workDays, 19);
        assertEqual(st.offDays, 12);
        assertEqual(st.shortened, 1);
        assertEqual(st.hours40, 151);
        assertApprox(st.hours36, 135.8, 0.05, '19×7,2 − 1 = 135,8');
        assertApprox(st.hours24, 90.2, 0.05, '19×4,8 − 1 = 90,2');
        // особые дни: 1 мая (праздник), 8 (сокращённый), 9 (праздник), 11 (перенос)
        assertEqual(st.specialDays.length, 4);
        assertEqual(st.specialDays[0].kind, 'праздник');
        assertEqual(st.specialDays[1].kind, 'сокращённый');
        assertEqual(st.specialDays[3].kind, 'перенос');
    });
    test('апрель 2026: 22 рабочих, 175 ч', () => {
        const { PC } = makePC();
        loadIsDayOff(PC, IDO_2026, 2026);
        const st = PC.monthStats(2026, 4);
        assertEqual(st.workDays, 22);
        assertEqual(st.hours40, 175, '22×8 − 1 = 175');
    });
    test('2026 год целиком: 247 раб. дн., 1972 / 1774,4 / 1181,6 ч', () => {
        const { PC } = makePC();
        loadIsDayOff(PC, IDO_2026, 2026);
        let workDays = 0, shortened = 0;
        for (let m = 1; m <= 12; m++) {
            const st = PC.monthStats(2026, m);
            workDays += st.workDays;
            shortened += st.shortened;
        }
        assertEqual(workDays, 247, 'официальная норма 2026 года');
        assertEqual(shortened, 4);
        assertEqual(workDays * 8 - shortened, 1972, 'норма 40-час. недели');
        assertApprox(workDays * 7.2 - shortened, 1774.4, 0.05, '36-час.');
        assertApprox(workDays * 4.8 - shortened, 1181.6, 0.05, '24-час.');
    });
    test('апрель 2024 (рабочая суббота): 21 рабочий, 168 ч', () => {
        const { PC } = makePC();
        loadIsDayOff(PC, IDO_2024, 2024);
        const st = PC.monthStats(2024, 4);
        assertEqual(st.workDays, 21, '27.04 — рабочая суббота, 29-30 — выходные');
        assertEqual(st.hours40, 168);
        assertEqual(st.specialDays.length, 3,
            '27 — рабочий перенос, 29 и 30 — перенесённые выходные');
        const kinds = st.specialDays.map(function(sd) { return sd.kind; }).join(',');
        assertEqual(kinds, 'рабочий перенос,перенос,перенос');
    });
});

describe('ProdCalendar: настройки — регион фиксирован (Task 272)', () => {
    test('регион всегда 42 (Кемеровская область - Кузбасс), токена нет', () => {
        const { PC } = makePC();
        const s = PC.getSettings();
        assertEqual(s.region, 42);
        assertTrue(s.token === undefined,
            'токен production-calendar.ru из настроек удалён');
    });
    test('Task 272: справочник регионов и токен удалены из модуля', () => {
        const { PC } = makePC();
        assertTrue(PC.regions === undefined, 'regions() удалён');
        assertTrue(PC.regionName === undefined, 'regionName() удалён');
        assertTrue(PC.regionHasRegional === undefined, 'regionHasRegional() удалён');
        assertTrue(PC.setSettings === undefined, 'setSettings() удалён');
        assertTrue(PC._REGIONS_RAW === undefined, 'таблица 89 регионов удалена');
        assertTrue(PC._PRODCAL_URL === undefined, 'URL production-calendar.ru удалён');
        assertTrue(PC._fetchProdCal === undefined, '_fetchProdCal удалён');
        assertTrue(PC._parseProdCal === undefined, '_parseProdCal удалён');
        assertTrue(PC.openSheet === undefined, 'openSheet (шторка) удалён');
        assertTrue(PC.closeSheet === undefined, 'closeSheet (шторка) удалён');
        assertTrue(PC._renderSheet === undefined, '_renderSheet (шторка) удалён');
        assertTrue(PC.saveToken === undefined, 'saveToken (токен) удалён');
        assertTrue(PC.onRegionChange === undefined, 'onRegionChange (регион) удалён');
    });
    test('старая запись настроек (регион/токен) вычищается из localStorage', () => {
        const { PC, storage } = makePC({
            'ws_pcal_settings_v1': '{"region":26,"token":"tok"}'
        });
        PC.getSettings();
        assertTrue(storage._d['ws_pcal_settings_v1'] === undefined,
            'запись настроек удалена (больше не используется)');
    });
    test('битые/чужие настройки не влияют — регион остаётся 42', () => {
        const { PC } = makePC({ 'ws_pcal_settings_v1': '{битый json' });
        const s = PC.getSettings();
        assertEqual(s.region, 42);
    });
});

describe('ProdCalendar: кэш и ensureYear', () => {
    test('ключ кэша включает год и регион (фиксированный 42; v3 — Task 426)', () => {
        const { PC } = makePC();
        assertEqual(PC._cacheKey(2026), 'ws_pcal_year3_2026_42');
    });
    test('свежий кэш → сеть НЕ дёргается, resolve(false)', () => {
        const fresh = {
            source: 'isdayoff', fetchedAtMs: Date.now(),
            region: 42, regionName: 'Кемеровская область - Кузбасс',
            days: { '0509': { holiday: 1 } }
        };
        const { PC } = makePC({
            'ws_pcal_year3_2026_42': JSON.stringify(fresh)
        });
        PC._fetchYear = function() { throw new Error('сеть не должна вызываться'); };
        let resolved = null;
        PC.ensureYear(2026, false).then(function(v) { resolved = v; });
        // синхронная проверка: _fetchYear бросил бы исключение до промиса
        assertEqual(PC._MEM[2026].days['0509'].holiday, 1, 'кэш загружен в память');
    });
    test('force=true → сеть вызывается, данные в памяти и кэше', async () => {
        const { PC, storage } = makePC();
        const parsed = PC._parseIsDayOff(IDO_2026);
        parsed.fetchedAtMs = Date.now();
        parsed.region = 42;
        parsed.regionName = 'Кемеровская область - Кузбасс';
        PC._fetchYear = function() { return Promise.resolve(parsed); };
        const changed = await PC.ensureYear(2026, true);
        assertEqual(changed, true, 'пришли новые данные');
        assertTrue(PC._MEM[2026] && PC._MEM[2026].days['0109'].off === 1, 'в памяти');
        const cached = JSON.parse(storage._d['ws_pcal_year3_2026_42']);
        assertEqual(cached.source, 'isdayoff', 'в localStorage');
        assertTrue(cached.days['0501'].off === 1);
    });
    test('сбой сети → устаревший кэш продолжает работать (офлайн)', async () => {
        const stale = {
            source: 'isdayoff', fetchedAtMs: Date.now() - 10 * 24 * 3600 * 1000,
            region: 42, regionName: 'Кемеровская область - Кузбасс',
            days: { '0509': { holiday: 1 } }
        };
        const { PC } = makePC({
            'ws_pcal_year3_2026_42': JSON.stringify(stale)
        });
        PC._fetchYear = function() { return Promise.reject(new Error('нет сети')); };
        const changed = await PC.ensureYear(2026, true);
        assertEqual(changed, false, 'новых данных нет');
        assertTrue(PC._MEM[2026] && PC._MEM[2026].days['0509'],
            'устаревший кэш загружен в память (офлайн-режим)');
        const info = PC.dayInfo(2026, 5, 9);
        assertTrue(info.off && info.holiday, 'День Победы работает офлайн');
    });
    test('полный отказ (нет сети, нет кэша) → фолбэк Сб/Вс', async () => {
        const { PC } = makePC();
        PC._fetchYear = function() { return Promise.resolve(null); };
        const changed = await PC.ensureYear(2030, true);
        assertEqual(changed, false);
        const info = PC.dayInfo(2030, 5, 9);
        assertFalse(info.hasData);
        assertEqual(info.source, 'fallback');
    });
    test('некорректный год → resolve(false) без сети', async () => {
        const { PC } = makePC();
        PC._fetchYear = function() { throw new Error('сеть не должна вызываться'); };
        assertEqual(await PC.ensureYear(1899, true), false);
        assertEqual(await PC.ensureYear(2101, true), false);
        assertEqual(await PC.ensureYear('abc', true), false);
    });
});

describe('ProdCalendar: утилиты', () => {
    test('_fmtHours: целые без дроби, дробные с запятой', () => {
        const { PC } = makePC();
        assertEqual(PC._fmtHours(151), '151');
        assertEqual(PC._fmtHours(135.8), '135,8');
        assertEqual(PC._fmtHours(1774.4), '1774,4');
        assertEqual(PC._fmtHours(120), '120');
    });
    test('_esc экранирует HTML', () => {
        const { PC } = makePC();
        assertEqual(PC._esc('<b>"x"&\'</b>'), '&lt;b&gt;&quot;x&quot;&amp;&#39;&lt;/b&gt;');
    });
});

describe('Task 260: интеграция в index.html', () => {
    test('HTML: кнопка «Обновить» УДАЛЕНА — кнопки объединены (Task 306)', () => {
        assertTrue(html.indexOf('id="wsCalChip"') === -1,
            'кнопка wsCalChip удалена из тулбара (объединена с «Сформировать»)');
        assertTrue(html.indexOf('wsCalChipText') === -1,
            'текстовый элемент кнопки удалён');
        assertTrue(html.indexOf('onclick="ProdCalendar.confirmRefresh()"') === -1,
            'онклик confirmRefresh удалён (диалога больше нет)');
        // «Сформировать» — единственная кнопка действия в тулбаре
        assertTrue(html.indexOf('id="wsGenerateBtn"') !== -1,
            'кнопка wsGenerateBtn осталась единственной кнопкой действия');
    });
    test('HTML: шторка настроек календаря УДАЛЕНА (Task 272)', () => {
        assertTrue(html.indexOf('id="wsCalOverlay"') === -1 &&
                   html.indexOf('id="wsCalSheet"') === -1 &&
                   html.indexOf('id="wsCalSheetBody"') === -1,
            'оверлей + шторка + тело шторки удалены из разметки');
        assertTrue(html.indexOf('ProdCalendar.closeSheet()') === -1,
            'закрытие шторки больше не используется');
        assertTrue(html.indexOf('wsCalRegionSel') === -1,
            'селект региона удалён');
        assertTrue(html.indexOf('wsCalToken') === -1,
            'поле ввода токена production-calendar.ru удалено');
        assertTrue(html.indexOf('API-токен production-calendar.ru') === -1,
            'плейсхолдер токена удалён');
        assertTrue(html.indexOf('.ws-cal-sheet {') === -1,
            'стили шторки удалены');
    });
    test('JS: WorkSchedule запускает загрузку календаря', () => {
        assertTrue(html.indexOf('_ensureCal: function') !== -1,
            'метод _ensureCal определён');
        const initCalls = (html.match(/this\._ensureCal\(\);/g) || []).length;
        assertTrue(initCalls >= 2,
            '_ensureCal вызывается в init() и onMonthChange()');
        assertTrue(html.indexOf('self._updateCalChip();') !== -1,
            'кнопка «Обновить» синхронизируется после загрузки сетки (loadGrid)');
    });
    test('JS: ячейки шахматки используют календарь (_calDayOff)', () => {
        assertTrue(html.indexOf('_calDayOff: function') !== -1,
            'метод _calDayOff определён');
        assertTrue(html.indexOf("var dayOff = this._calDayOff(day);") !== -1,
            '_renderCell определяет нерабочий день по календарю');
        assertTrue(html.indexOf("if (dayOff) classes.push('ws-weekend');") !== -1,
            'класс ws-weekend — по календарю (Сб/Вс + праздники + переносы)');
    });
    test('JS: шапка шахматки — ws-holiday/ws-feast (Task 311: тултип убран)', () => {
        assertTrue(html.indexOf("var isFeast = dInfo ? !!dInfo.holiday : false;") !== -1,
            'праздник определяется по ProdCalendar.dayInfo');
        assertTrue(html.indexOf("' ws-feast'") !== -1,
            'класс ws-feast для праздников');
        // Task 311: пояснительные тултипы с ячеек/шапки убраны —
        // названия праздников показывает окошко производственного
        // календаря в тулбаре (.ws-cal-panel, Task 264)
        assertFalse(html.indexOf('thTitle = d + \' \' + dow + \' — \' + dInfo.title') !== -1,
            'тултип заголовка с названием праздника удалён (Task 311)');
    });
    test('CSS: стили праздника и окошка (стили кнопки удалены)', () => {
        assertTrue(html.indexOf('.ws-cal-chip {') === -1,
            'стили кнопки «Обновить» удалены (Task 306 — кнопки объединены)');
        assertTrue(html.indexOf('.ws-cal-chip:disabled') === -1,
            'стиль выключенной кнопки удалён');
        assertTrue(html.indexOf('.ws-grid thead th.ws-day-col.ws-feast {') !== -1,
            'стили праздника в шапке');
        assertTrue(html.indexOf('.ws-cp-day.k-hol') !== -1,
            'стили чипов праздников в окошке тулбара');
        assertTrue(html.indexOf('.ws-cal-panel {') !== -1,
            'стили окошка календаря в тулбаре');
    });
    test('SW: версия кэша kipia-test-v741 (Task 298)', () => {
        const sw = fs.readFileSync(path.resolve(__dirname, '..', 'sw.js'), 'utf8');
        assertTrue(sw.indexOf("CACHE_VERSION = 'kipia-test-v741'") !== -1,
            'CACHE_VERSION в sw.js = kipia-test-v741');
    });
    test('Task 311: тултип ячейки убран; название праздника — в попапе клика', () => {
        // Task 311: пояснительные тултипы с ячеек шахматки убраны;
        // название праздника остаётся в заголовке попапа выбора статуса
        assertFalse(html.indexOf('titleParts.splice(1, 0, cellInfo.title);') !== -1,
            'вставка названия в тултип ячейки удалена (Task 311)');
        assertTrue(html.indexOf('popupDate += \' · \' + pdInfo.title;') !== -1,
            'название — в заголовке попапа выбора статуса');
    });
});

// ============================================================
// Task 262: legalic — основной источник, официальные нормы,
// цепочки переносов, 2027 preliminary (Task 426: День шахтёра
// НЕ праздник — региональный оверлей удалён)
// ============================================================

// Фикстуры legalic. Особые дни 2026 — РЕАЛЬНЫЕ (export
// calendar.legalic.ru/api/v1/calendars/RU-FEDERAL/export?year=2026):
// 14 праздников, 4 перенесённых выходных, 4 сокращённых, 0 рабочих
// суббот. Полный год генерируется: WORKING = 480/432/288 мин,
// SHORTENED_WORKING = 420/372/228 мин (суммы минут = официальные
// нормы: 247 дн. → 1972 / 1774,4 / 1181,6 ч).
const LG2026_SPECIAL = {
    '0101': { t: 'PUBLIC_HOLIDAY', n: 'Новогодние каникулы' },
    '0102': { t: 'PUBLIC_HOLIDAY', n: 'Новогодние каникулы' },
    '0103': { t: 'PUBLIC_HOLIDAY', n: 'Новогодние каникулы' },
    '0104': { t: 'PUBLIC_HOLIDAY', n: 'Новогодние каникулы' },
    '0105': { t: 'PUBLIC_HOLIDAY', n: 'Новогодние каникулы' },
    '0106': { t: 'PUBLIC_HOLIDAY', n: 'Новогодние каникулы' },
    '0107': { t: 'PUBLIC_HOLIDAY', n: 'Рождество Христово' },
    '0108': { t: 'PUBLIC_HOLIDAY', n: 'Новогодние каникулы' },
    '0109': { t: 'TRANSFERRED_DAY_OFF', from: '2026-01-03' },
    '0223': { t: 'PUBLIC_HOLIDAY', n: 'День защитника Отечества' },
    '0308': { t: 'PUBLIC_HOLIDAY', n: 'Международный женский день', to: '2026-03-09' },
    '0309': { t: 'TRANSFERRED_DAY_OFF', from: '2026-03-08' },
    '0430': { t: 'SHORTENED_WORKING' },
    '0501': { t: 'PUBLIC_HOLIDAY', n: 'Праздник Весны и Труда' },
    '0508': { t: 'SHORTENED_WORKING' },
    '0509': { t: 'PUBLIC_HOLIDAY', n: 'День Победы' },
    '0511': { t: 'TRANSFERRED_DAY_OFF', from: '2026-05-09' },
    '0611': { t: 'SHORTENED_WORKING' },
    '0612': { t: 'PUBLIC_HOLIDAY', n: 'День России' },
    '1103': { t: 'SHORTENED_WORKING' },
    '1104': { t: 'PUBLIC_HOLIDAY', n: 'День народного единства' },
    '1231': { t: 'TRANSFERRED_DAY_OFF', from: '2026-01-04' }
};

// Генератор полного года legalic (WORKING/WEEKEND достраиваются,
// минуты соответствуют реальным суммам источника)
function buildLegalicYear(year, special, status) {
    const days = [];
    for (let m = 1; m <= 12; m++) {
        const last = new Date(year, m, 0).getDate();
        for (let d = 1; d <= last; d++) {
            const mmdd = (m < 10 ? '0' : '') + m + (d < 10 ? '0' : '') + d;
            const dow = new Date(year, m - 1, d).getDay();
            const sp = special[mmdd] || {};
            const weekend = dow === 0 || dow === 6;
            const type = sp.t || (weekend ? 'WEEKEND' : 'WORKING');
            const minutes = type === 'WORKING' ? { '40h': 480, '36h': 432, '24h': 288 }
                          : type === 'SHORTENED_WORKING' ? { '40h': 420, '36h': 372, '24h': 228 }
                          : { '40h': 0, '36h': 0, '24h': 0 };
            const day = {
                date: year + '-' + mmdd.slice(0, 2) + '-' + mmdd.slice(2),
                weekday: (dow + 6) % 7,
                type: type,
                isWorking: type === 'WORKING' || type === 'SHORTENED_WORKING' ||
                           type === 'TRANSFERRED_WORKING',
                shortened: type === 'SHORTENED_WORKING',
                minutes: minutes
            };
            if (sp.n) day.holidayName = sp.n;
            if (sp.from) day.transferredFrom = sp.from;
            if (sp.to) day.transferredTo = sp.to;
            days.push(day);
        }
    }
    return {
        version: { versionId: 'RU-FEDERAL-' + year + '-v1', year: year,
                   status: status || 'OFFICIAL' },
        contentHash: 'sha256:test',
        days: days
    };
}

// Загрузить в модуль данные legalic года (минуя сеть), регион 42
function loadLegalic(PC, json, year) {
    const parsed = PC._parseLegalic(json);
    parsed.region = 42;
    parsed.regionName = 'Кемеровская область - Кузбасс';
    parsed.fetchedAtMs = Date.now();
    // Task 426: оверлей Дня шахтёра больше НЕ применяется
    PC._MEM[year] = parsed;
    return parsed;
}

describe('Task 262: legalic — парсинг и официальные нормы', () => {
    test('JS: источник legalic прописан в index.html (основной)', () => {
        assertTrue(html.indexOf('calendar.legalic.ru/api/v1/calendars/RU-FEDERAL/export') !== -1,
            'URL legalic export прописан');
        assertTrue(html.indexOf('_fetchLegalic: function') !== -1,
            'метод _fetchLegalic определён');
    });
    test('парсинг: типы дней → off/holiday/short/work + переносы', () => {
        const { PC } = makePC();
        const parsed = PC._parseLegalic(buildLegalicYear(2026, LG2026_SPECIAL));
        assertEqual(parsed.source, 'legalic', 'источник legalic');
        assertEqual(parsed.days['0501'].off, 1, '1 мая — нерабочий');
        assertEqual(parsed.days['0501'].holiday, 1, '1 мая — праздник');
        assertEqual(parsed.days['0501'].title, 'Праздник Весны и Труда', 'название из holidayName');
        assertEqual(parsed.days['0109'].off, 1, '9 января — перенесённый выходной');
        assertEqual(parsed.days['0109'].tFrom, '0103', 'перенос С 03.01');
        assertEqual(parsed.days['0308'].tTo, '0309', 'перенос НА 09.03');
        assertEqual(parsed.days['0430'].short, 1, '30 апреля — сокращённый');
        assertTrue(!parsed.days['0105'] || parsed.days['0105'].holiday === 1,
            'обычные дни без признаков не записываются');
        assertEqual(parsed.version.id, 'RU-FEDERAL-2026-v1', 'версия календаря');
        assertEqual(parsed.preliminary, false, '2026 — OFFICIAL');
    });
    test('парсинг: TRANSFERRED_WORKING (рабочая суббота 01.11.2025)', () => {
        const { PC } = makePC();
        const parsed = PC._parseLegalic({
            version: { versionId: 'RU-FEDERAL-2025-v1', year: 2025, status: 'OFFICIAL' },
            days: [
                { date: '2025-11-01', weekday: 5, type: 'TRANSFERRED_WORKING',
                  isWorking: true, shortened: true,
                  minutes: { '40h': 420, '36h': 372, '24h': 228 },
                  transferredTo: '2025-11-03' },
                { date: '2025-11-03', weekday: 1, type: 'TRANSFERRED_DAY_OFF',
                  isWorking: false, shortened: false,
                  minutes: { '40h': 0, '36h': 0, '24h': 0 },
                  transferredFrom: '2025-11-01' }
            ]
        });
        assertEqual(parsed.days['1101'].work, 1, 'рабочая суббота');
        assertEqual(parsed.days['1101'].short, 1, 'и сокращённая');
        assertEqual(parsed.days['1101'].tTo, '1103', 'выходной перенесён на 03.11');
        assertEqual(parsed.days['1103'].off, 1, '03.11 — нерабочий');
        assertEqual(parsed.days['1103'].tFrom, '1101', 'перенос с 01.11');
    });
    test('парсинг: некорректный формат → null', () => {
        const { PC } = makePC();
        assertEqual(PC._parseLegalic(null), null);
        assertEqual(PC._parseLegalic({ days: 'x' }), null);
        assertEqual(PC._parseLegalic({ days: [] }), null); // нет version.versionId
    });
    test('официальные нормы 2026 из минут: год и месяцы', () => {
        const { PC } = makePC();
        const parsed = PC._parseLegalic(buildLegalicYear(2026, LG2026_SPECIAL));
        assertEqual(parsed.norms.official, true);
        assertEqual(parsed.norms.year.h40, 1972, '40-час: 1972 ч');
        assertEqual(parsed.norms.year.h36, 1774.4, '36-час: 1774,4 ч');
        assertEqual(parsed.norms.year.h24, 1181.6, '24-час: 1181,6 ч');
        assertEqual(parsed.norms.months['01'].h40, 120, 'январь: 120 ч');
        assertEqual(parsed.norms.months['05'].h40, 151, 'май: 151 ч');
        assertEqual(parsed.norms.months['04'].h40, 175, 'апрель: 175 ч');
    });
    test('PRELIMINARY (2027, проект Минтруда) → флаг preliminary', () => {
        const { PC } = makePC();
        const parsed = PC._parseLegalic(buildLegalicYear(2027, {}, 'PRELIMINARY'));
        assertEqual(parsed.preliminary, true, 'год предварительный');
        assertEqual(parsed.version.status, 'PRELIMINARY');
    });
});

describe('Task 426: День шахтёра — НЕ праздничный день (заявка)', () => {
    test('JS: _minersDayMmdd/_applyRegionalOverlay/_MINERS_DAY_TITLE удалены', () => {
        assertTrue(PC_SRC.indexOf('_minersDayMmdd: function') === -1,
            'расчёт последнего воскресенья августа удалён');
        assertTrue(PC_SRC.indexOf('_applyRegionalOverlay: function') === -1,
            'наложение регионального праздника удалено');
        assertTrue(PC_SRC.indexOf("_MINERS_DAY_TITLE: 'День шахтёра'") === -1,
            'константа «День шахтёра» удалена');
        assertTrue(PC_SRC.indexOf("_CACHE_PREFIX: 'ws_pcal_year3_'") !== -1,
            'кэш v3 — сбрасывает кэш v2 с оверлеем Дня шахтёра');
    });
    test('dayInfo: 30.08.2026 (legalic) — обычное воскресенье, НЕ праздник', () => {
        const { PC } = makePC();
        loadLegalic(PC, buildLegalicYear(2026, LG2026_SPECIAL), 2026);
        const info = PC.dayInfo(2026, 8, 30);
        assertTrue(info.off, 'нерабочий (воскресенье)');
        assertFalse(info.holiday, 'НЕ праздник — заявка Task 426');
        assertFalse(info.regional, 'региональной метки нет');
        assertEqual(info.title, null, 'названия праздника нет');
    });
    test('фолбэк без данных: 30.08.2026 — обычное воскресенье', () => {
        const { PC } = makePC(); // регион по умолчанию 42
        const info = PC.dayInfo(2026, 8, 30);
        assertEqual(info.source, 'fallback');
        assertTrue(info.off, 'воскресенье — нерабочий');
        assertFalse(info.holiday, 'НЕ праздник (Task 426)');
        assertEqual(info.title, null, 'названия нет');
    });
    test('Task 272: сохранённый регион 54 в настройках игнорируется (фикс. 42)', () => {
        const { PC } = makePC({
            'ws_pcal_settings_v1': '{"region":54,"token":"tok"}'
        });
        assertEqual(PC.getSettings().region, 42,
            'регион фиксирован — 42, выбор региона удалён из приложения');
        const info = PC.dayInfo(2026, 8, 30);
        assertFalse(info.holiday, 'и для 42 День шахтёра НЕ праздник (Task 426)');
    });
    test('dayInfo: рабочий перенос на 30.08 НЕ перекрывается праздником', () => {
        // федеральный календарь объявил последнее воскресенье августа
        // рабочим переносом — раньше оверлей вернул бы выходной
        const { PC } = makePC();
        loadLegalic(PC, buildLegalicYear(2026, {
            '0830': { t: 'TRANSFERRED_WORKING', to: '2026-09-01' }
        }), 2026);
        const info = PC.dayInfo(2026, 8, 30);
        assertFalse(info.off, 'рабочий перенос сохранён');
        assertTrue(info.work, 'день рабочий');
        assertFalse(info.holiday, 'праздником не становится');
    });
    test('monthStats: август 2026 БЕЗ Дня шахтёра в особых днях', () => {
        const { PC } = makePC();
        loadLegalic(PC, buildLegalicYear(2026, LG2026_SPECIAL), 2026);
        const st = PC.monthStats(2026, 8);
        const miners = st.specialDays.filter(function(x) { return x.title === 'День шахтёра'; });
        assertEqual(miners.length, 0, 'Дня шахтёра в особых днях нет (Task 426)');
        const anyRegional = st.specialDays.filter(function(x) { return x.kind === 'региональный праздник'; });
        assertEqual(anyRegional.length, 0, 'региональных праздников нет');
    });
    test('HTML: маркер заявки Task 426 в index.html', () => {
        assertTrue(html.indexOf('Task 426') !== -1,
            'комментарий-маркер Task 426 в коде клиента');
    });
});

describe('Task 262: цепочки переносов в dayInfo', () => {
    test('9 января 2026: «Выходной, перенесённый с 03.01.2026»', () => {
        const { PC } = makePC();
        loadLegalic(PC, buildLegalicYear(2026, LG2026_SPECIAL), 2026);
        const info = PC.dayInfo(2026, 1, 9);
        assertTrue(info.off && !info.holiday, 'нерабочий, не праздник');
        assertEqual(info.title, 'Выходной, перенесённый с 03.01.2026');
        assertEqual(info.transferFrom, '03.01.2026');
    });
    test('8 марта 2026: праздник + «выходной перенесён на 09.03.2026»', () => {
        const { PC } = makePC();
        loadLegalic(PC, buildLegalicYear(2026, LG2026_SPECIAL), 2026);
        const info = PC.dayInfo(2026, 3, 8);
        assertTrue(info.holiday, 'праздник (воскресенье)');
        assertEqual(info.title, 'Международный женский день (выходной перенесён на 09.03.2026)');
        assertEqual(info.transferTo, '09.03.2026');
    });
    test('31 декабря 2026: перенесённый с 04.01.2026', () => {
        const { PC } = makePC();
        loadLegalic(PC, buildLegalicYear(2026, LG2026_SPECIAL), 2026);
        const info = PC.dayInfo(2026, 12, 31);
        assertTrue(info.off, 'нерабочий');
        assertEqual(info.title, 'Выходной, перенесённый с 04.01.2026');
    });
    test('рабочая суббота 01.11.2025: «выходной перенесён на 03.11.2025»', () => {
        const { PC } = makePC();
        PC._MEM[2025] = {
            source: 'legalic', fetchedAtMs: Date.now(), region: 42,
            regionName: 'Кемеровская область - Кузбасс',
            version: { id: 'RU-FEDERAL-2025-v1', status: 'OFFICIAL' },
            norms: { official: true, months: {}, year: null },
            days: {
                '1101': { work: 1, short: 1, tTo: '1103' },
                '1103': { off: 1, tFrom: '1101' }
            }
        };
        const sat = PC.dayInfo(2025, 11, 1);
        assertFalse(sat.off, 'суббота рабочая');
        assertTrue(sat.work, 'флаг work');
        assertEqual(sat.title, 'Рабочий день (перенос): выходной перенесён на 03.11.2025');
        const mon = PC.dayInfo(2025, 11, 3);
        assertTrue(mon.off, 'понедельник нерабочий');
        assertEqual(mon.title, 'Выходной, перенесённый с 01.11.2025');
    });
    test('30 апреля 2026: сокращённый рабочий день', () => {
        const { PC } = makePC();
        loadLegalic(PC, buildLegalicYear(2026, LG2026_SPECIAL), 2026);
        const info = PC.dayInfo(2026, 4, 30);
        assertFalse(info.off, 'рабочий');
        assertTrue(info.short, 'сокращённый');
        assertEqual(info.title, 'Сокращённый рабочий день');
    });
});

describe('Task 262: официальные нормы в monthStats', () => {
    test('январь 2026: 15 раб. дн., 120/108/72 ч — официальные', () => {
        const { PC } = makePC();
        loadLegalic(PC, buildLegalicYear(2026, LG2026_SPECIAL), 2026);
        const st = PC.monthStats(2026, 1);
        assertEqual(st.source, 'legalic');
        assertEqual(st.workDays, 15);
        assertEqual(st.hours40, 120);
        assertEqual(st.hours36, 108);
        assertEqual(st.hours24, 72);
        assertEqual(st.normsOfficial, true, 'нормы официальные');
        assertEqual(st.yearHours40, 1972, 'годовая норма 40-час.');
        assertEqual(st.version.id, 'RU-FEDERAL-2026-v1');
        assertEqual(st.preliminary, false);
    });
    test('май 2026: 19 раб. дн., 151 ч; апрель: 175 ч', () => {
        const { PC } = makePC();
        loadLegalic(PC, buildLegalicYear(2026, LG2026_SPECIAL), 2026);
        const may = PC.monthStats(2026, 5);
        assertEqual(may.workDays, 19);
        assertEqual(may.hours40, 151);
        assertEqual(may.shortened, 1, '8 мая сокращённый');
        const apr = PC.monthStats(2026, 4);
        assertEqual(apr.workDays, 22);
        assertEqual(apr.hours40, 175);
    });
    test('год 2026 суммарно: 247 раб. дн. (сверка всех месяцев)', () => {
        const { PC } = makePC();
        loadLegalic(PC, buildLegalicYear(2026, LG2026_SPECIAL), 2026);
        let wd = 0;
        for (let m = 1; m <= 12; m++) wd += PC.monthStats(2026, m).workDays;
        assertEqual(wd, 247, '247 рабочих дней в году');
    });
    test('isDayOff-данные: нормы остаются локальным расчётом', () => {
        const { PC } = makePC();
        loadIsDayOff(PC, IDO_2026, 2026);
        const st = PC.monthStats(2026, 5);
        assertEqual(st.source, 'isdayoff');
        assertEqual(st.normsOfficial, false, 'локальный расчёт');
        assertEqual(st.hours40, 151, 'совпадает с официальным');
    });
    test('PRELIMINARY-год: monthStats.preliminary = true', () => {
        const { PC } = makePC();
        loadLegalic(PC, buildLegalicYear(2027, {}, 'PRELIMINARY'), 2027);
        const st = PC.monthStats(2027, 1);
        assertEqual(st.preliminary, true, '2027 — предварительные данные');
        assertEqual(st.version.status, 'PRELIMINARY');
    });
});

describe('Task 262/272: приоритет источников _fetchYear', () => {
    test('регион 42: legalic первый, наложения Дня шахтёра НЕТ (Task 426)', async () => {
        const { PC } = makePC();
        const calls = [];
        PC._fetchLegalic = function() {
            calls.push('legalic');
            return Promise.resolve({
                source: 'legalic', fetchedAtMs: Date.now(),
                region: 42, regionName: 'Кемеровская область - Кузбасс',
                days: { '0501': { off: 1, holiday: 1 } }
            });
        };
        PC._fetchIsDayOff = function() { calls.push('isdayoff'); return Promise.resolve(null); };
        const data = await PC._fetchYear(2026);
        assertEqual(data.source, 'legalic', 'победил legalic');
        assertEqual(calls.join(','), 'legalic', 'резерв не дёргался');
        assertTrue(!data.days['0830'],
            'наложение Дня шахтёра удалено — заявка Task 426');
    });
    test('Task 272: prodcal больше НЕ участвует в цепочке', async () => {
        const { PC } = makePC();
        // оба источника отказывают — цепочка завершается, prodcal-веток нет
        let isdayoffCalled = false;
        PC._fetchLegalic = function() { return Promise.reject(new Error('down')); };
        PC._fetchIsDayOff = function() { isdayoffCalled = true; return Promise.reject(new Error('down')); };
        const data = await PC._fetchYear(2026);
        assertEqual(data, null, 'оба отказали — null, третьего источника нет');
        assertTrue(isdayoffCalled, 'резерв isdayoff вызывался');
        assertTrue(PC._fetchProdCal === undefined, '_fetchProdCal удалён из модуля');
    });
    test('legalic недоступен → isDayOff (резерв)', async () => {
        const { PC } = makePC();
        PC._fetchLegalic = function() { return Promise.reject(new Error('down')); };
        PC._fetchIsDayOff = function() {
            const parsed = PC._parseIsDayOff(IDO_2026);
            parsed.fetchedAtMs = Date.now();
            parsed.region = 42;
            parsed.regionName = 'Кемеровская область - Кузбасс';
            return Promise.resolve(parsed);
        };
        const data = await PC._fetchYear(2026);
        assertEqual(data.source, 'isdayoff', 'резерв сработал');
        assertTrue(!data.days['0830'],
            'наложение Дня шахтёра удалено и на резерве (Task 426)');
    });
    test('все источники недоступны → null (фолбэк Сб/Вс)', async () => {
        const { PC } = makePC();
        PC._fetchLegalic = function() { return Promise.reject(new Error('down')); };
        PC._fetchIsDayOff = function() { return Promise.reject(new Error('down')); };
        const data = await PC._fetchYear(2026);
        assertEqual(data, null, 'все отказали — null');
    });
});

describe('Task 262/426: кэш v3 и подписи источников', () => {
    test('кэш v3 хранит version/norms и вычищает старые ключи Task 260/v2', () => {
        const { PC, storage } = makePC({
            'ws_pcal_year_2026_42': '{"source":"isdayoff","fetchedAtMs":1,"days":{}}',
            'ws_pcal_year2_2026_42': '{"source":"legalic","fetchedAtMs":2,"days":{"0830":{"off":1,"holiday":1,"regional":1,"title":"День шахтёра"}}}'
        });
        PC._saveCache(2026, {
            source: 'legalic', fetchedAtMs: 12345,
            region: 42, regionName: 'Кемеровская область - Кузбасс',
            version: { id: 'RU-FEDERAL-2026-v1', status: 'OFFICIAL' },
            norms: { official: true, months: { '01': { h40: 120 } }, year: { h40: 1972 } },
            days: { '0101': { off: 1 } }
        });
        const cached = JSON.parse(storage._d['ws_pcal_year3_2026_42']);
        assertEqual(cached.source, 'legalic', 'legalic принимается кэшем');
        assertEqual(cached.version.id, 'RU-FEDERAL-2026-v1', 'версия в кэше');
        assertEqual(cached.norms.year.h40, 1972, 'нормы в кэше');
        assertTrue(!('ws_pcal_year_2026_42' in storage._d), 'ключ Task 260 вычищен');
        assertTrue(!('ws_pcal_year2_2026_42' in storage._d),
            'ключ v2 (День шахтёра ещё праздник) вычищен — Task 426');
        // чтение обратно
        const loaded = PC._loadCache(2026);
        assertEqual(loaded.version.id, 'RU-FEDERAL-2026-v1');
    });
    test('_sourceLabel: legalic — основной источник', () => {
        const { PC } = makePC();
        assertTrue(PC._sourceLabel('legalic').indexOf('calendar.legalic.ru') !== -1);
        assertTrue(PC._sourceLabel('isdayoff').indexOf('isDayOff') !== -1);
        assertTrue(PC._sourceLabel('prodcalendar').indexOf('production-calendar.ru') !== -1);
    });
});

describe('Task 262: интеграция в index.html', () => {
    test('JS: цепочки переносов в тултипах (перенесён с/на)', () => {
        assertTrue(html.indexOf("title = 'Выходной, перенесённый с ' + tFrom;") !== -1,
            '«Выходной, перенесённый с …» в названии дня');
        assertTrue(html.indexOf("' (выходной перенесён на ' + tTo + ')'" ) !== -1,
            '«(выходной перенесён на …)» у праздников на Сб/Вс');
        assertTrue(html.indexOf(': выходной перенесён на ' + String.fromCharCode(39) + ' + tTo') !== -1,
            'рабочая суббота объясняет перенос');
    });
    test('CSS: бейдж «предварительные данные» (официальные нормы убраны — Task 266)', () => {
        assertTrue(html.indexOf('.ws-cal-prelim') !== -1, 'стили бейджа preliminary');
        // Task 266: бейдж «официальные нормы» убран из окошка вместе со стилями
        assertTrue(html.indexOf('.ws-cal-official') === -1,
            'стили бейджа официальных норм удалены (Task 266)');
        assertTrue(html.indexOf("На ' + y + ' год (40-час): <b>'") !== -1,
            'строка годовой нормы — в окошке тулбара');
    });
    test('JS: маркеры Дня шахтёра удалены из данных (Task 426)', () => {
        // Task 426 (заявка): день не входит в перечень гос. праздников —
        // оверлей/фолбэк/константа удалены; версия календаря — в кэше
        assertTrue(html.indexOf("_MINERS_DAY_TITLE: 'День шахтёра'") === -1,
            'константы Дня шахтёра в модуле нет');
        assertTrue(html.indexOf('_applyRegionalOverlay: function') === -1,
            'наложения регионального праздника нет');
        assertTrue(html.indexOf('Task 426') !== -1,
            'правило Task 426 упомянуто в комментариях');
    });
    test('JS: окошко помечает предварительность; тултипы окон УБРАНЫ (Task 328)', () => {
        // Task 328 (заявка): всплывающие подсказки окон бара УБРАНЫ —
        // официальность норм больше не помечается тултипом
        assertTrue(html.indexOf("st.normsOfficial ? ' — официальные данные' : ''") === -1,
            'тултип норм окошка удалён (Task 328)');
        assertTrue(html.indexOf('ws-cp-norms" title=') === -1,
            'нативного title у группы норм нет');
        assertTrue(html.indexOf('>предварительно</span>') !== -1,
            'бейдж «предварительно» в окошке');
    });
});

// ============================================================
// Task 264: День города Кемерово (12 июня, вместе с Днём России,
// регион 42), звёздочка сокращённых дней, окошко календаря в тулбаре
// ============================================================

describe('Task 264: День города Кемерово (12 июня, регион 42)', () => {
    test('dayInfo: 12.06.2026 — «День России · День города Кемерово»', () => {
        const { PC } = makePC();
        loadLegalic(PC, buildLegalicYear(2026, LG2026_SPECIAL), 2026);
        const info = PC.dayInfo(2026, 6, 12);
        assertTrue(info.off, 'нерабочий');
        assertTrue(info.holiday, 'праздник');
        assertEqual(info.title, 'День России · День города Кемерово');
    });
    test('Task 272: День города Кемерово — всегда (регион фиксирован 42)', () => {
        const { PC } = makePC();
        loadLegalic(PC, buildLegalicYear(2026, LG2026_SPECIAL), 2026);
        assertEqual(PC.dayInfo(2026, 6, 12).title,
            'День России · День города Кемерово',
            'регион 42 фиксирован — выбор другого региона невозможен');
    });
    test('фолбэк без данных: комбинированное название и без источника', () => {
        const { PC } = makePC(); // регион по умолчанию 42
        const info = PC.dayInfo(2026, 6, 12);
        assertEqual(info.source, 'fallback');
        assertEqual(info.title, 'День России · День города Кемерово');
    });
    test('Task 272: фолбэк всегда с Днём города (регион фиксирован 42)', () => {
        const { PC } = makePC();
        assertEqual(PC.dayInfo(2026, 6, 12).title,
            'День России · День города Кемерово');
    });
    test('monthStats: 12 июня — праздник с двойным названием', () => {
        const { PC } = makePC();
        loadLegalic(PC, buildLegalicYear(2026, LG2026_SPECIAL), 2026);
        const st = PC.monthStats(2026, 6);
        const d12 = st.specialDays.filter(function(x) { return x.d === 12; });
        assertEqual(d12.length, 1, 'ровно одна запись');
        assertEqual(d12[0].kind, 'праздник');
        assertEqual(d12[0].title, 'День России · День города Кемерово');
    });
    test('_isCityDay: только 0612 (регион фиксирован 42)', () => {
        const { PC } = makePC();
        assertTrue(PC._isCityDay('0612'), 'регион 42, 12 июня');
        assertFalse(PC._isCityDay('0613'), 'другая дата');
        // Task 272: регион фиксирован — выбор региона в настройках
        // невозможен, День города применяется всегда
        assertTrue(PC._isCityDay('0612'), 'регион всегда 42');
    });
});

describe('Task 264: окошко календаря в баре кнопок графика', () => {
    test('HTML: тулбар — ряд кнопок (.ws-toolbar-main) + окошко wsCalPanel', () => {
        assertTrue(html.indexOf('id="wsCalPanel"') !== -1, 'контейнер окошка');
        assertTrue(html.indexOf('class="ws-toolbar-main"') !== -1,
            'ряд кнопок .ws-toolbar-main');
        // Task 266: мобильная база — колонка (кнопки сверху, окошко ниже);
        // на десктопе (≥1024px) тулбар — строка: окошко слева, кнопки справа
        assertTrue(/\.ws-toolbar \{[^}]*flex-direction:\s*column/.test(html),
            'мобильная база тулбара — колонка');
        assertTrue(html.indexOf('.ws-cal-panel[hidden] { display: none; }') !== -1,
            'скрытие окошка до первых данных');
    });
    test('JS: ProdCalendar.renderPanel вызывается из _updateCalChip', () => {
        assertTrue(html.indexOf('renderPanel: function') !== -1,
            'метод renderPanel определён');
        assertTrue(html.indexOf('ProdCalendar.renderPanel();') !== -1,
            'вызов из WorkSchedule._updateCalChip');
    });
    test('JS: окошко показывает нормы 40/36/24 и годовую', () => {
        assertTrue(html.indexOf('Рабочих: <b>') !== -1, 'рабочие дни в окошке');
        assertTrue(html.indexOf('40-час: <b>') !== -1, 'норма 40-час в окошке');
        assertTrue(html.indexOf('36-час: <b>') !== -1, 'норма 36-час в окошке');
        assertTrue(html.indexOf('24-час: <b>') !== -1, 'норма 24-час в окошке');
        assertTrue(html.indexOf("На ' + y + ' год (40-час): <b>'") !== -1,
            'годовая норма в окошке');
    });
    test('JS: нормы и праздники ПЕРЕМЕЩЕНЫ из шторки в окошко', () => {
        assertTrue(html.indexOf('.ws-cal-norms-grid') === -1,
            'блок норм шторки (и его CSS) удалён');
        // Task 272: подсказка о переезде удалена вместе со шторкой
        assertTrue(html.indexOf('Нормы времени и праздники месяца — ') === -1,
            'подсказка о переезде удалена (шторки больше нет)');
        assertTrue(html.indexOf('нет праздников и переносов') !== -1,
            'пустое состояние списка в окошке');
    });
    test('JS: звёздочка сокращённого дня в шапке + легенда', () => {
        assertTrue(html.indexOf('<i class="ws-short-star">*</i>') !== -1,
            'звёздочка у числа дня в шапке шахматки');
        assertTrue(html.indexOf('* — сокращённый предпраздничный день') !== -1,
            'легенда звёздочки в окошке');
        // Task 311: пояснительный тултип шапки убран — расшифровка
        // звёздочки живёт в легенде окошка календаря (выше)
        assertFalse(html.indexOf('(сокращённый день, −1 час)') !== -1,
            'пояснение в тултипе шапки удалено (Task 311)');
    });
});

// ============================================================
// Task 266: ревизия окошка календаря в баре кнопок графика —
// столбики (нормы + праздники), статическая высота бара + скролл
// в окошке; убраны строка «источник: …» и бейдж «официальные нормы».
// Task 269: нормы — ГРУППА из двух подстолбиков (дни/часы), окно —
// шириной по тексту в ПРАВОЙ части бара, кнопки — слева внизу.
// ============================================================

describe('Task 266: окошко столбиками, слева в баре — кнопки справа', () => {
    test('CSS: столбики — вертикальные списки (.ws-cp-col)', () => {
        assertTrue(/\.ws-cp-col \{[^}]*flex-direction:\s*column/.test(html),
            'столбик — колонка (подстолбики норм/праздники)');
        assertTrue(/\.ws-cp-col \{[^}]*flex-shrink:\s*0/.test(html),
            'столбик не сжимается — переносится при нехватке ширины');
        // Task 269: нормы — группа ws-cp-group ws-cp-norms (два подстолбика)
        assertTrue(html.indexOf('ws-cp-group ws-cp-norms') !== -1,
            'группа норм в renderPanel');
        assertTrue(html.indexOf('ws-cp-col ws-cp-days') !== -1,
            'столбик праздников в renderPanel');
    });
    test('CSS: статическая высота окошка + скролл внутри', () => {
        assertTrue(/\.ws-cal-panel \{[^}]*height:\s*95px/.test(html),
            'фиксированная высота окошка (Task 270 — 95px, под 5 строк)');
        assertTrue(/\.ws-cal-panel \{[^}]*overflow-y:\s*auto/.test(html),
            'полоса прокрутки, если столбики не входят');
        assertTrue(/\.ws-cal-panel \{[^}]*overscroll-behavior:\s*contain/.test(html),
            'скролл окошка не тянет страницу');
    });
    test('CSS: десктоп — три равные части бара (≥1024px, Task 269→272→315)', () => {
        // Task 315: строка 1 бара (.ws-bar-row) — grid из ТРЁХ РАВНЫХ
        // частей: кнопки | окно мероприятий | окно времени и праздников
        assertTrue(/\.ws-bar-row \{[^}]*display:\s*grid/.test(html),
            'десктоп: строка 1 бара — grid');
        assertTrue(/\.ws-bar-row \{[^}]*grid-template-columns:\s*1fr 1fr 1fr/.test(html),
            'бар разделён на ТРИ РАВНЫЕ части (1fr 1fr 1fr)');
        const mq = html.match(/\.ws-toolbar-main \{[^}]*height:\s*95px/);
        assertTrue(!!mq, 'Task 317: десктопная колонка кнопок — 95px (ровно окна)');
        assertFalse(/\.ws-toolbar-main \{[^}]*order:\s*0/.test(html),
            'компоновка order (Task 269/272) удалена — теперь grid');
        assertFalse(/\.ws-toolbar-main \{[^}]*margin-right:\s*auto/.test(html),
            'прижатие окна вправо (margin-right: auto) удалено');
    });
    test('CSS: высота бара на десктопе — 95px (статическая, Task 270)', () => {
        const re = /@media \(min-width: 1024px\) \{[\s\S]*?\.ws-cal-panel \{[^}]*height:\s*95px/s;
        assertTrue(re.test(html), 'десктопная высота окошка — 95px (под 5 строк)');
    });
    test('JS: убраны источник и время обновления из окошка', () => {
        // строки источника больше нет ни в JS, ни в CSS окошка
        assertTrue(html.indexOf('ws-cp-src') === -1,
            'класс строки источника удалён');
        assertTrue(html.indexOf('_sourceShort') === -1,
            'метод _sourceShort удалён (был нужен только для окошка)');
        assertTrue(html.indexOf("', обновлено ' + this._fmtDateTime") === -1,
            'время обновления не выводится в окошке');
        // Task 272: полная подпись источника — в диалоге кнопки «Обновить»
        assertTrue(html.indexOf('_sourceLabel') !== -1,
            'полная подпись источника — в диалоге подтверждения обновления');
    });
    test('JS: бейдж «официальные нормы» не рендерится', () => {
        assertTrue(html.indexOf('>официальные нормы</span>') === -1,
            'бейдж удалён из renderPanel');
        // Task 328 (заявка): тултипы окон бара УБРАНЫ — официальность
        // не помечается всплывающей подсказкой
        assertTrue(html.indexOf("st.normsOfficial ? ' — официальные данные' : ''") === -1,
            'тултип столбика норм удалён (Task 328)');
    });
    test('JS: легенда звёздочки — в конце столбика праздников', () => {
        assertTrue(html.indexOf('ws-cp-legend') !== -1,
            'класс легенды в окошке');
        assertTrue(html.indexOf('ws-cp-legend">* — сокращённый предпраздничный день') !== -1,
            'легенда — последний элемент столбика праздников');
    });
    test('JS: renderPanel — заголовки обоих столбиков', () => {
        assertTrue(html.indexOf('ws-cp-cap">Норма, ') !== -1,
            'заголовок столбика норм');
        assertTrue(html.indexOf('ws-cp-cap">Праздники и переносы</span>') !== -1,
            'заголовок столбика праздников');
    });
});

// ============================================================
// Task 272: кнопка «Обновить» вместо «Календарь» — диалог с
// источником legalic и подтверждением; регион фиксирован (42);
// выбор региона, поле токена и шторка настроек удалены;
// «Сформировать» — шахматка на весь год; кнопки в левом
// верхнем углу бара
// ============================================================

describe('Task 272→306: кнопка «Обновить» объединена с «Сформировать»', () => {
    test('JS: confirmRefresh УДАЛЁН — обновление идёт тихо с формированием', () => {
        assertTrue(html.indexOf('confirmRefresh: function') === -1,
            'метод confirmRefresh удалён (диалог не нужен)');
        assertTrue(html.indexOf("{ title: 'Обновление календаря', okText: 'Обновить' }") === -1,
            'диалог обновления удалён');
    });
    test('JS: подпись источника legalic — как в заявке', () => {
        const { PC } = makePC();
        assertEqual(PC._sourceLabel('legalic'),
            'calendar.legalic.ru (федеральный, официальные нормы)');
    });
    test('JS: refreshNow(silent) — тихий режим без тостов (Task 306)', () => {
        assertTrue(html.indexOf('refreshNow: function(silent)') !== -1,
            'параметр silent — обновление в составе «Сформировать»');
        assertTrue(html.indexOf('ensureYear(ym.y, true)') !== -1,
            'обновление — принудительное (force=true, TTL игнорируется)');
        assertTrue(html.indexOf("if (!silent && typeof KipToast !== 'undefined'") !== -1,
            'тосты только в НЕтихом режиме');
        assertTrue(html.indexOf('getElementById(\'wsCalChip\')') === -1,
            'манипуляция кнопкой wsCalChip удалена');
    });
    test('JS: _currentYM берёт год из WorkSchedule или текущей даты', () => {
        assertTrue(html.indexOf('_currentYM: function') !== -1,
            'метод _currentYM определён (замена _sy/_sm шторки)');
        // Task 323: граница слова — this._syncTotalsRows не считается
        // за поле шторки _sy
        assertTrue(!/\bthis\._sy\b/.test(html) && !/\bthis\._sm\b/.test(html),
            'поля шторки _sy/_sm удалены');
    });
    test('JS: WorkSchedule._refreshProdCalendarQuiet — тихое обновление', () => {
        assertTrue(html.indexOf('_refreshProdCalendarQuiet: function') !== -1,
            'хелпер тихого обновления определён');
        assertTrue(html.indexOf('ProdCalendar.refreshNow(true);') !== -1,
            'вызов в тихом режиме (silent=true)');
        const genPart = html.slice(html.indexOf('_doGenerateMonth: function'));
        assertTrue(genPart.indexOf('this._refreshProdCalendarQuiet();') !== -1,
            '_doGenerateMonth обновляет календарь');
        const genYear = html.slice(html.indexOf('_doGenerateYear: function'));
        assertTrue(genYear.indexOf('this._refreshProdCalendarQuiet();') !== -1,
            '_doGenerateYear обновляет календарь');
    });
});
