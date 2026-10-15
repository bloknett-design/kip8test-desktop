// tests/test-task426.js
// Task 426 — День шахтёра НЕ государственный праздник. Заявка
// пользователя:
//   «при подсчёте отпускных дней и учёте праздничных выходных
//    учитывай, что день шахтёра (отмечается каждый год в последнее
//    воскресенье августа) не входит в перечень государственных
//    праздников, дающих право на дополнительный выходной».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   СЕРВЕР WorkSchedule.gs:
//     — _minersDayMmdd удалён; наложение в legalic-ветке и фолбэке
//       _getProdCal удалено (последнее воскресенье августа — обычный
//       выходной; рабочий перенос на него НЕ перекрывается);
//     — srvVer '427' в ответе setTrainingDone (поднят Task 427 —
//       раздельные последовательности id листов).
//   КЛИЕНТ index.html (ProdCalendar):
//     — _minersDayMmdd/_applyRegionalOverlay/_MINERS_DAY_TITLE
//       удалены; dayInfo-фолбэк без Дня шахтёра;
//     — кэш v3 (ws_pcal_year3_) — сбрасывает кэш v2, в котором
//       День шахтёра был наложен как праздник;
//     — регресс: порог предупреждения «старый сервер» srvVer < 427
//       (поднят Task 427 поверх исторической границы 423);
//     — ГЛАВНОЕ (VM, реальный ProdCalendar + методы Task 310):
//       отпуск 24.08–06.09.2026, захватывающий бывший День шахтёра
//       (30.08, вс) → праздников в периоде НЕТ, «чистые» дни =
//       календарным (14); контроль: 01–10.05.2026 → 2 праздника
//       ст. 112 вычитаются, как раньше.
//   VM-СЕРВЕР: _getProdCal (legalic / фолбэк) — 30.08 обычное
//     воскресенье; TRANSFERRED_WORKING на 30.08 остаётся РАБОЧИМ.
//   SW: kipia-test-v741.
//
// Запуск: через tests/run-all.js (require './test-task426.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ============================================================
// Хелперы
// ============================================================

// Вырезка метода клиента по балансу скобок (паттерн test-task310)
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

// Извлечение модуля ProdCalendar из index.html (как test-prod-calendar)
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
const PC_SRC = extractProdCalendarSrc(INDEX_SRC);

// Фикстура legalic-года: будни WORKING, Сб/Вс WEEKEND, specials —
// переопределение типов по 'MMDD' (минимум для _parseLegalic:
// version.versionId + days[])
function buildLegalicYear(year, specials) {
    const sp = specials || {};
    const days = [];
    let dt = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    while (dt < end) {
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        const mmdd = mm + dd;
        let type = 'WORKING';
        if (dt.getDay() === 0 || dt.getDay() === 6) type = 'WEEKEND';
        if (sp[mmdd]) type = sp[mmdd];
        days.push({
            date: year + '-' + mm + '-' + dd,
            type: type,
            isWorking: type === 'WORKING' || type === 'SHORTENED_WORKING' ||
                       type === 'TRANSFERRED_WORKING'
        });
        dt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1);
    }
    return { version: { versionId: 'RU-FEDERAL-' + year + '-v1', status: 'OFFICIAL' }, days: days };
}

// Единая vm-песочница: реальный ProdCalendar + WSMixin (методы
// Task 310 из index.html) — _vacIsHoliday видит глобальный
// ProdCalendar того же контекста, как в приложении
function makeVacCtx(legalicJson) {
    const storage = {
        _d: {},
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
    const names = ['_vacIsHoliday', '_vacSplitDays', '_parseIsoLocal'];
    const methods = names.map(function(n) { return extractMethod(INDEX_SRC, n); })
                         .filter(Boolean).join(',\n');
    vm.runInContext('var WSMixin = { ' + methods + ' };', ctx,
        { filename: 'index.html-WS-vac' });
    if (legalicJson) {
        const parsed = ctx.ProdCalendar._parseLegalic(legalicJson);
        parsed.region = 42;
        parsed.regionName = 'Кемеровская область - Кузбасс';
        parsed.fetchedAtMs = Date.now();
        // ключ года — из первой даты фикстуры ('2026-01-01' → 2026)
        ctx.ProdCalendar._MEM[parseInt(legalicJson.days[0].date.slice(0, 4), 10)] = parsed;
    }
    return ctx;
}

// Сервер в vm: фабрика WorkSchedule c моками Apps Script (паттерн
// test-task320; _getProdCal листы не трогает — sheets пустые)
const MOCK_UTILS = {
    findSessionByToken: () => ({ user_id: 1 }),
    findUserById: () => ({ role: 'Админ', email: 'test@example.com' }),
    audit: () => {}
};
function loadWS(urlFetchApp) {
    const ss = { getSheetByName: () => null };
    const factory = new Function('SpreadsheetApp', 'Utils', 'UrlFetchApp', 'CacheService',
        WS_GS_SRC + '\nreturn WorkSchedule;');
    return factory({ openById: () => ss }, MOCK_UTILS, urlFetchApp, undefined);
}
function ufaFor(json) {
    return { fetch: () => ({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify(json)
    }) };
}

// ============================================================
// 1. Сервер: маркеры удаления Дня шахтёра + srvVer 426
// ============================================================
describe('Task 426 — сервер: День шахтёра удалён из праздников', () => {

    test('JS: _minersDayMmdd и наложения в _getProdCal удалены', () => {
        assertTrue(WS_GS_SRC.indexOf('_minersDayMmdd: function') === -1,
            'расчёт последнего воскресенья августа удалён из сервера');
        assertTrue(WS_GS_SRC.indexOf('off[this._minersDayMmdd(year)]') === -1,
            'наложение в фолбэке удалено');
        assertTrue(WS_GS_SRC.indexOf('if (!workOn[md]) off[md] = 1') === -1,
            'наложение в legalic-ветке удалено');
        assertTrue(WS_GS_SRC.indexOf('Task 426') !== -1,
            'маркер заявки Task 426 в комментариях сервера');
    });

    test('JS: srvVer 427 в ответе setTrainingDone', () => {
        assertTrue(WS_GS_SRC.indexOf("srvVer: '427'") !== -1,
            'srvVer 427 (Task 427: раздельные последовательности id; День шахтёра не праздник — Task 426)');
        assertTrue(WS_GS_SRC.indexOf("srvVer: '426'") === -1,
            'старой версии в коде нет');
    });
});

// ============================================================
// 2. Клиент: маркеры удаления + кэш v3 + регресс порога 423
// ============================================================
describe('Task 426 — клиент: ProdCalendar без Дня шахтёра', () => {

    test('JS: _minersDayMmdd/_applyRegionalOverlay/_MINERS_DAY_TITLE удалены', () => {
        assertTrue(INDEX_SRC.indexOf('_minersDayMmdd: function') === -1,
            'расчёт последнего воскресенья августа удалён');
        assertTrue(INDEX_SRC.indexOf('_applyRegionalOverlay: function') === -1,
            'наложение регионального праздника удалено');
        assertTrue(INDEX_SRC.indexOf("_MINERS_DAY_TITLE: 'День шахтёра'") === -1,
            'константа «День шахтёра» удалена');
        assertTrue(INDEX_SRC.indexOf("день не входит в перечень") !== -1,
            'комментарий-обоснование заявки в коде');
    });

    test('JS: кэш v3 (ws_pcal_year3_) — сброс кэшей v1/v2 с оверлеем', () => {
        assertTrue(INDEX_SRC.indexOf("_CACHE_PREFIX: 'ws_pcal_year3_'") !== -1,
            'префикс кэша поднят до v3');
        assertTrue(INDEX_SRC.indexOf("localStorage.removeItem('ws_pcal_year2_' + year + '_'") !== -1,
            'ключ v2 вычищается при сохранении новых данных');
    });

    test('JS: регресс — порог предупреждения «старый сервер» srvVer < 427', () => {
        const fn = extractMethod(INDEX_SRC, 'toggleTrainingDone');
        assertTrue(fn !== null && fn.indexOf('parseInt(d.srvVer, 10) < 427') !== -1,
            'клиент предупреждает при srvVer < 427 (Task 427 поднял границу: сквозная нумерация id — тоже старый сервер; историческая 423 поглощена)');
    });

    test('JS: регресс — День города Кемерово (12 июня) остаётся названием', () => {
        assertTrue(INDEX_SRC.indexOf("_CITY_DAY_TITLE: 'День города Кемерово'") !== -1,
            'День города жив (название федерального праздника 12.06)');
        assertTrue(INDEX_SRC.indexOf('_isCityDay') !== -1,
            'метод _isCityDay жив');
    });
});

// ============================================================
// 3. ГЛАВНОЕ: отпуск × бывший День шахтёра (VM, реальный
//    ProdCalendar + методы Task 310 из index.html)
// ============================================================
describe('Task 426 — отпуск: День шахтёра НЕ продлевает (ст. 120)', () => {

    test('24.08–06.09.2026 (внутри бывший День шахтёра 30.08) → праздников НЕТ', () => {
        const ctx = makeVacCtx(buildLegalicYear(2026));
        const r = ctx.WSMixin._vacSplitDays(
            ctx.WSMixin._parseIsoLocal('2026-08-24'),
            ctx.WSMixin._parseIsoLocal('2026-09-06'));
        assertEqual(r.cal, 14, '14 календарных дней');
        assertEqual(r.hol, 0, 'праздников в периоде НЕТ — 30.08 НЕ праздник (Task 426)');
        assertEqual(r.net, 14, 'в счёт отпуска все 14 дней (раньше было 13)');
    });

    test('контроль: 01–10.05.2026 → праздники ст. 112 вычитаются, как раньше', () => {
        const ctx = makeVacCtx(buildLegalicYear(2026, { '0501': 'PUBLIC_HOLIDAY', '0509': 'PUBLIC_HOLIDAY' }));
        const r = ctx.WSMixin._vacSplitDays(
            ctx.WSMixin._parseIsoLocal('2026-05-01'),
            ctx.WSMixin._parseIsoLocal('2026-05-10'));
        assertEqual(r.cal, 10, '10 календарных дней');
        assertEqual(r.hol, 2, 'два праздника (01.05 и 09.05) — ст. 112 работает');
        assertEqual(r.net, 8, 'в счёт отпуска 8 дней');
    });

    test('dayInfo 30.08.2026 (реальный модуль, legalic) — НЕ праздник', () => {
        const ctx = makeVacCtx(buildLegalicYear(2026));
        const info = ctx.ProdCalendar.dayInfo(2026, 8, 30);
        assertTrue(info.off, 'нерабочий — как обычное воскресенье');
        assertFalse(info.holiday, 'НЕ праздник (заявка Task 426)');
        assertFalse(info.regional, 'региональной метки нет');
        assertEqual(info.title, null, 'названия праздника нет');
    });

    test('dayInfo 30.08.2026 (фолбэк без данных) — НЕ праздник', () => {
        const ctx = makeVacCtx(null);
        const info = ctx.ProdCalendar.dayInfo(2026, 8, 30);
        assertEqual(info.source, 'fallback');
        assertTrue(info.off, 'воскресенье — нерабочий');
        assertFalse(info.holiday, 'и в фолбэке НЕ праздник (Task 426)');
    });
});

// ============================================================
// 4. Сервер VM: _getProdCal без Дня шахтёра
// ============================================================
describe('Task 426 — сервер VM: производственный календарь', () => {

    test('legalic: 30.08.2026 (воскресенье) нерабочий — БЕЗ праздничной метки', () => {
        const WS = loadWS(ufaFor(buildLegalicYear(2026)));
        const cal = WS._getProdCal(2026);
        assertEqual(cal.full, true, 'legalic — полная карта');
        assertEqual(cal.off['0830'], 1, '30.08 нерабочий (обычное воскресенье WEEKEND)');
    });

    test('ГЛАВНОЕ: рабочий перенос на 30.08 НЕ перекрывается праздником', () => {
        // раньше региональный оверлей вернул бы этому воскресенью
        // выходной; заявка: день не гос. праздник — федеральный
        // календарь главнее
        const WS = loadWS(ufaFor(buildLegalicYear(2026, { '0830': 'TRANSFERRED_WORKING' })));
        const cal = WS._getProdCal(2026);
        assertTrue(!cal.off['0830'],
            '30.08 с переносом РАБОЧИЙ — наложения Дня шахтёра нет');
        assertFalse(WS._isNonWorkingDay(new Date(2026, 7, 30), cal),
            'генерация поставит смену в последнее воскресенье августа');
    });

    test('фолбэк: карта праздников 30.08 НЕ содержит (выходной — по воскресенью)', () => {
        const WS = loadWS(undefined);
        const cal = WS._getProdCal(2026);
        assertEqual(cal.full, false, 'фолбэк');
        assertTrue(!cal.off['0830'], '30.08 не в карте праздников');
        assertTrue(WS._isNonWorkingDay(new Date(2026, 7, 30), cal),
            'но день нерабочий — как воскресенье');
    });
});

// ============================================================
// 5. SW — версия кэша
// ============================================================
describe('Task 426 — SW: версия кэша', () => {
    test('CACHE_VERSION = kipia-test-v741', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v741'") !== -1,
            'SW v653 (Task 426)');
        assertTrue(SW_SRC.indexOf('kipia-test-v742') === -1,
            'двойной бамп отсутствует');
    });
});
