// tests/test-task524.js
// Task 524: «В описании кодов "д" и "н" убери в конце текст
// "в комментарии".»
//
// ЧТО ПРОВЕРЯЕТСЯ (четырьмя слоями):
//   Слой 1 — SRC канон (index.html _STATUS_CODES_CANON):
//     наименования «д»/«н» — прежние полные формулировки БЕЗ хвоста
//     «в комментарии» (окончание — «(в часах)»); short/цвет/порядок
//     не тронуты; «ОВ» НЕ менялся («с указанием в комментарии» жив —
//     заявка касалась только «д»/«н»); в ИМЕНАХ канона «в комментарии»
//     остаётся ровно у одного кода (ОВ); маркер Task 524 в комментарии
//     блока канона.
//   Слой 2 — SRC справочник (scripts/StatusCodesInit.gs): строки
//     SC_STATUS_CODES «д»/«н» БАЙТ-В-БАЙТ равны именам канона
//     (синхронность канон ↔ эталон листа); состав 16 кодов; имена
//     канона и справочника совпадают по всем кодам.
//   Слой 3 — VM нормализация: _normalizeStatusCodes на ЛЕГАСИ-листе
//     (старые формулировки с «в комментарии» — как в живом листе
//     Google Sheets до перезапуска statusCodesReplace()) даёт НОВЫЕ
//     имена «д»/«н» из канона — отображение НЕ зависит от листа,
//     обновления фронтенда достаточно; «ОВ» остаётся с «в комментарии»;
//     цвет листа сохраняется, short берётся из канона.
//   Слой 4 — VM рендер: секция «Статус дня» (Task 522/523) на
//     нормализованном справочнике показывает НОВОЕ название «д»/«н»
//     и НЕ содержит «в комментарии» (полная цепочка лист → нормали-
//     зация → попап).
//   SW: kipia-test-v756.
//
// Запуск: через tests/run-all.js (require './test-task524.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const INIT_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'StatusCodesInit.gs'), 'utf8');
const WS_CLIENT = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// Вырезка метода (как в test-task322/521/522/523.js)
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        \},|\n    \};/);
    const end = m ? m.index + m[0].length : rest.length;
    let text = rest.slice(0, end);
    text = text.replace(/\n\s{4}\};\s*$/, '');
    return text;
}
function methodFn(src, name, document) {
    const text = methodText(src, name).replace(/,\s*$/, '');
    const body = text.replace(new RegExp('^ {8}' + name + ': '), '');
    return new Function('document', 'return (' + body + ')')(document || null);
}
function wsHost(methodNames, extra, document) {
    const host = Object.assign({}, extra);
    methodNames.forEach(function(n) {
        host[n] = methodFn(WS_CLIENT, n, document || null);
    });
    return host;
}

// Канон справочника из index.html — скобочный баланс (как 387)
function canonCodes() {
    const i = INDEX_SRC.indexOf('_STATUS_CODES_CANON: [');
    if (i === -1) return null;
    const open = INDEX_SRC.indexOf('[', i);
    let depth = 0;
    for (let k = open; k < INDEX_SRC.length; k++) {
        if (INDEX_SRC[k] === '[') depth++;
        else if (INDEX_SRC[k] === ']') {
            depth--;
            if (!depth) return eval(INDEX_SRC.slice(open, k + 1));
        }
    }
    return null;
}
const CANON = canonCodes() || [];

// Эталонный состав из StatusCodesInit.gs — скобочный баланс по
// «var SC_STATUS_CODES = [» (строки-тройки [код, название, цвет])
function scStatusCodes() {
    const i = INIT_SRC.indexOf('var SC_STATUS_CODES = [');
    if (i === -1) return null;
    const open = INIT_SRC.indexOf('[', i);
    let depth = 0;
    for (let k = open; k < INIT_SRC.length; k++) {
        if (INIT_SRC[k] === '[') depth++;
        else if (INIT_SRC[k] === ']') {
            depth--;
            if (!depth) return eval(INIT_SRC.slice(open, k + 1));
        }
    }
    return null;
}
const SC_CODES = scStatusCodes() || [];

const NAME_D = 'День, плановая продолжительность работы в выходные и нерабочие праздничные дни, для сменного персонала дневная 12-часовая смена (с 7:30 до 19:30), для дневного персонала — с указанием продолжительности (в часах)';
const NAME_N = 'Ночь, плановая продолжительность работы в выходные и нерабочие праздничные дни, для сменного персонала ночная 12-часовая смена (с 19:30 до 7:30), для дневного персонала — с указанием продолжительности (в часах)';
// ЛЕГАСИ-имена — прежние формулировки (живой лист Google Sheets
// до перезапуска statusCodesReplace() по DEPLOY-Task524)
const NAME_D_OLD = NAME_D + ' в комментарии';
const NAME_N_OLD = NAME_N + ' в комментарии';

// ============================================================
// 1. SRC — канон _STATUS_CODES_CANON
// ============================================================
describe('Task 524 — SRC: канон (index.html)', () => {

    test('«д»: полное наименование БЕЗ «в комментарии»', () => {
        const cd = CANON.find(c => c.code === 'д');
        assertTrue(cd, 'код «д» в каноне есть');
        assertEqual(cd.name, NAME_D, 'точная формулировка Task 524');
        assertTrue(cd.name.slice(-'(в часах)'.length) === '(в часах)',
            'окончание — «(в часах)»');
        assertTrue(cd.name.indexOf('в комментарии') === -1,
            'хвост «в комментарии» убран');
    });

    test('«н»: полное наименование БЕЗ «в комментарии»', () => {
        const cn = CANON.find(c => c.code === 'н');
        assertTrue(cn, 'код «н» в каноне есть');
        assertEqual(cn.name, NAME_N, 'точная формулировка Task 524');
        assertTrue(cn.name.slice(-'(в часах)'.length) === '(в часах)',
            'окончание — «(в часах)»');
        assertTrue(cn.name.indexOf('в комментарии') === -1,
            'хвост «в комментарии» убран');
    });

    test('«д»/«н»: short и ЦВЕТ не тронуты (заявка — только текст)', () => {
        const cd = CANON.find(c => c.code === 'д');
        const cn = CANON.find(c => c.code === 'н');
        assertEqual(cd.short, 'день в выходной', 'short «д» прежний');
        assertEqual(cd.color, '#FFD54F', 'цвет «д» прежний');
        assertEqual(cn.short, 'ночь в выходной', 'short «н» прежний');
        assertEqual(cn.color, '#78909C', 'цвет «н» прежний');
    });

    test('«ОВ» НЕ тронут — «с указанием в комментарии» жив (только «д»/«н»)', () => {
        const ov = CANON.find(c => c.code === 'ОВ');
        assertEqual(ov.name,
            'Отгул, выходные дни (оплачиваемые, за ранее отработанное время, без содержания — с указанием в комментарии)',
            'ОВ: формулировка не менялась');
    });

    test('санитар: в ИМЕНАХ канона «в комментарии» — только ОВ', () => {
        const withTail = CANON.filter(c =>
            String(c.name || '').indexOf('в комментарии') !== -1);
        assertEqual(withTail.length, 1, 'ровно одно имя с «в комментарии»');
        assertEqual(withTail[0].code, 'ОВ', 'это «ОВ»');
    });

    test('канон — по-прежнему 16 кодов, порядок по группам', () => {
        assertEqual(CANON.length, 16, '16 канонических кодов');
        const order = CANON.map(c => c.code || '«»').join(' ');
        assertEqual(order, 'Д8 Д7,2 Д Н д н ОТ У ОВ Б «» ПР И ОБ ПЗ *',
            'порядок Task 387 не менялся');
    });

    test('маркер Task 524 в комментарии блока канона', () => {
        const i = INDEX_SRC.indexOf('_STATUS_CODES_CANON: [');
        const head = INDEX_SRC.slice(Math.max(0, i - 1600), i);
        assertTrue(head.indexOf('Task 524') !== -1,
            'заявка Task 524 задокументирована над каноном');
        assertTrue(head.indexOf('«в комментарии»') !== -1,
            'суть заявки процитирована');
    });
});

// ============================================================
// 2. SRC — справочник StatusCodesInit.gs
// ============================================================
describe('Task 524 — SRC: StatusCodesInit.gs', () => {

    test('SC_STATUS_CODES: строки «д»/«н» равны именам канона', () => {
        assertTrue(SC_CODES.length > 0, 'массив SC_STATUS_CODES извлечён');
        const dRow = SC_CODES.find(r => r[0] === 'д');
        const nRow = SC_CODES.find(r => r[0] === 'н');
        const cd = CANON.find(c => c.code === 'д');
        const cn = CANON.find(c => c.code === 'н');
        assertEqual(dRow[1], cd.name, '«д»: справочник = канон (байт-в-байт)');
        assertEqual(nRow[1], cn.name, '«н»: справочник = канон (байт-в-байт)');
        assertEqual(dRow[1], NAME_D, '«д»: новая формулировка');
        assertEqual(nRow[1], NAME_N, '«н»: новая формулировка');
        assertFalse(dRow[1].indexOf('в комментарии') !== -1 ||
                    nRow[1].indexOf('в комментарии') !== -1,
            'хвоста «в комментарии» нет у «д»/«н»');
    });

    test('SC_STATUS_CODES: состав 16 кодов, порядок = канону', () => {
        assertEqual(SC_CODES.length, 16, '16 строк эталона');
        assertEqual(SC_CODES.map(r => r[0]).join(' '),
            CANON.map(c => c.code).join(' '),
            'коды и порядок совпадают с каноном');
    });

    test('SC_STATUS_CODES: названия ВСЕХ кодов = канону (синхронность)', () => {
        SC_CODES.forEach(function(row) {
            const cc = CANON.find(c => c.code === row[0]);
            assertTrue(cc, 'код «' + row[0] + '» есть в каноне');
            assertEqual(row[1], cc.name,
                '«' + row[0] + '»: справочник = канон');
        });
    });

    test('«ОВ» в эталоне НЕ тронут', () => {
        const ov = SC_CODES.find(r => r[0] === 'ОВ');
        assertEqual(ov[1],
            'Отгул, выходные дни (оплачиваемые, за ранее отработанное время, без содержания — с указанием в комментарии)',
            'ОВ: прежняя формулировка в эталоне листа');
    });

    test('инструкция DEPLOY в шапке: statusCodesReplace() без force', () => {
        const head = INIT_SRC.slice(0, INIT_SRC.indexOf('var SC_STATUS_CODES'));
        assertTrue(head.indexOf('Task 524') !== -1,
            'маркер Task 524 в шапке эталона');
        assertTrue(/statusCodesReplace\(\) \(без force/.test(head),
            'подсказка перезапуска statusCodesReplace() без force');
    });
});

// ============================================================
// 3. VM — нормализация (отображение не зависит от листа)
// ============================================================
describe('Task 524 — VM: _normalizeStatusCodes', () => {

    // ЛЕГАСИ-лист «Коды_статусов» — СТАРЫЕ формулировки «д»/«н»
    // (как в живой таблице Google Sheets до DEPLOY-Task524),
    // порядок строк произвольный — нормализация выравнивает каноном
    const LEGACY_SHEET = [
        { code: 'д', name: NAME_D_OLD, color: '#FFD54F' },
        { code: 'н', name: NAME_N_OLD, color: '#78909C' },
        { code: 'ОВ', name: 'Отгул, выходные дни (оплачиваемые, за ранее отработанное время, без содержания — с указанием в комментарии)', color: '#C5E1A5' },
        { code: 'Д8', name: 'День, 8ч', color: '#FFF9C4' },
        { code: 'ОТ', name: 'Отпуск', color: '#ECEFF1' }
    ];

    function normHost() {
        return { _STATUS_CODES_CANON: CANON };
    }

    test('легаси-лист со старыми «д»/«н» → НОВЫЕ имена канона', () => {
        const host = normHost();
        const fn = methodFn(WS_CLIENT, '_normalizeStatusCodes');
        const out = fn.call(host, LEGACY_SHEET);
        const cd = out.find(c => c.code === 'д');
        const cn = out.find(c => c.code === 'н');
        assertEqual(cd.name, NAME_D, '«д»: имя = новый канон (не лист!)');
        assertEqual(cn.name, NAME_N, '«н»: имя = новый канон (не лист!)');
        assertFalse(out.some(c => c.code === 'д' &&
            c.name.indexOf('в комментарии') !== -1),
            '«в комментарии» у «д» не переживает нормализацию');
    });

    test('легаси-лист: цвет ЛИСТА сохраняется, short — из канона', () => {
        const host = normHost();
        const fn = methodFn(WS_CLIENT, '_normalizeStatusCodes');
        const out = fn.call(host, LEGACY_SHEET);
        const cd = out.find(c => c.code === 'д');
        const cn = out.find(c => c.code === 'н');
        assertEqual(cd.color, '#FFD54F', 'цвет «д» — живой цвет листа');
        assertEqual(cn.color, '#78909C', 'цвет «н» — живой цвет листа');
        assertEqual(cd.short, 'день в выходной', 'short «д» из канона');
        assertEqual(cn.short, 'ночь в выходной', 'short «н» из канона');
    });

    test('«ОВ» остаётся с «в комментарии» (заявка «д»/«н» не трогала его)', () => {
        const host = normHost();
        const fn = methodFn(WS_CLIENT, '_normalizeStatusCodes');
        const out = fn.call(host, LEGACY_SHEET);
        const ov = out.find(c => c.code === 'ОВ');
        assertTrue(ov.name.indexOf('с указанием в комментарии') !== -1,
            'ОВ: канонное имя с «в комментарии»');
    });

    test('порядок нормализованного = порядок канона (слот «Выходной» всегда)', () => {
        const host = normHost();
        const fn = methodFn(WS_CLIENT, '_normalizeStatusCodes');
        const out = fn.call(host, LEGACY_SHEET);
        assertEqual(out.map(c => c.code || '«»').join(' '),
            'Д8 д н ОТ ОВ «»', 'лист выровнен по группам канона');
    });
});

// ============================================================
// 4. VM — рендер секции «Статус дня» (полная цепочка)
// ============================================================
describe('Task 524 — VM: секция «Статус дня»', () => {

    const DAY_EMP = { 'таб_номер': 23, 'ФИО': 'Петров Пётр Петрович',
                      'тип': 'дневной' };

    // Хост: слой данных + рендер; _STATUS_CODES — результат
    // нормализации ЛЕГАСИ-листа (как в живом приложении)
    function renderHost(entries) {
        const host = wsHost(
            ['_dnDayInfoAt', '_renderDnDayInfo', '_effectiveEntry',
             '_serverEntry', '_esc', '_fmtTotalsNum', '_statusMeta',
             '_dnParseTime'], {});
        host._EMPLOYEES = [DAY_EMP];
        host._ENTRIES = entries;
        host._PENDING = {};
        const norm = methodFn(WS_CLIENT, '_normalizeStatusCodes');
        host._STATUS_CODES = norm.call({ _STATUS_CODES_CANON: CANON }, [
            { code: 'д', name: NAME_D_OLD, color: '#FFD54F' },
            { code: 'н', name: NAME_N_OLD, color: '#78909C' }
        ]);
        return host;
    }

    test('попап «д»: новое название, БЕЗ «в комментарии»', () => {
        const host = renderHost(
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д',
               'часы': 7.2 }]);
        const html = host._renderDnDayInfo('2026-10-11', 23);
        assertTrue(html.indexOf(NAME_D) !== -1,
            'полное НОВОЕ название «д» в HTML');
        assertTrue(html.indexOf('в комментарии') === -1,
            'хвоста «в комментарии» в секции нет');
        assertTrue(html.indexOf('7,2 ч') !== -1,
            'время работы по-прежнему показывается (Task 522/523 живы)');
    });

    test('попап «н»: новое название, БЕЗ «в комментарии»', () => {
        const host = renderHost(
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'н',
               'часы': 12, 'время_начала': '19:30',
               'время_окончания': '07:30' }]);
        const html = host._renderDnDayInfo('2026-10-11', 23);
        assertTrue(html.indexOf(NAME_N) !== -1,
            'полное НОВОЕ название «н» в HTML');
        assertTrue(html.indexOf('в комментарии') === -1,
            'хвоста «в комментарии» в секции нет');
        assertTrue(html.indexOf('через полночь') !== -1,
            'ночная пара времён рендерится (Task 523 жив)');
    });
});

// ============================================================
// 5. SW: версия кэша
// ============================================================
describe('Task 524 — SW: версия кэша', () => {
    test('SW: кэш поднят до kipia-test-v756 (Task 524)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v756') !== -1,
            'SW несёт версию kipia-test-v756');
        assertTrue(SW_SRC.indexOf('kipia-test-v736') === -1,
            'прежней версии kipia-test-v736 нет');
    });
});
