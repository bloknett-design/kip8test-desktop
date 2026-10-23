// ============================================================
// Task 457 — заявка: «Сделай отображение этих кодов как ручные,
// в Итоги/Талоны/печать входит» (развитие Task 456: авто-«д»/«н»
// замещения отпуска).
//
// Реализация (после Task 458 — материализация в записи):
//   • Task 457 (снят Task 458): ВИРТУАЛЬНЫЕ записи _autoDnEntries
//     удалены — авто-«д»/«н» стали РЕАЛЬНЫМИ записями: план
//     материализуется в правки _PENDING (_autoDnMaterialize),
//     «Сохранить» → setManualEntry (источник «руч») — как ручные;
//   • Итоги учёта (месяц) + печать/PDF/Excel: переработка
//     over/overDays (Task 322, в явки/часы не попадает) — ШТАТНЫЙ
//     путь эффективных записей (сервер + _PENDING), без
//     подмешивания слоя; код в печатной сетке (_printCell /
//     _printModel — эффективная запись);
//   • Талоны: день явки + 12-часовой талон (получатели — всегда
//     сменные, _overHours = 12) — штатная агрегация;
//   • отображение «как ручные»: материализованная правка — вид
//     ручной записи (рамка ws-manual-dn + метка ws-source-manual
//     у правки с источником «руч», Task 309), ws-auto-dn —
//     инертный маркер реестра, активная строка «д»/«н» в попапе;
//   • после «Сохранить» записи видны серверу, архивам, «Году» и
//     другим устройствам — полностью как ручные (заявка Task 458).
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

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

// Срез модуля WorkSchedule (имена методов неуникальны в монолите)
const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// ============================================================
// 1. SRC — виртуальные записи удалены, включение штатное
// ============================================================
describe('Task 457/458 — SRC: отчёты без виртуального слоя', () => {

    test('метод _autoDnEntries УДАЛЁН — ссылок в модуле нет', () => {
        assertEqual(WS_SRC.indexOf('_autoDnEntries'), -1,
            'Task 458: авто-«д»/«н» — записи, виртуальный слой не нужен');
    });

    test('Итоги месяца: эффективные записи, БЕЗ подмешивания', () => {
        const tm = methodText(WS_SRC, '_renderTotalsMonth');
        assertTrue(tm.indexOf('this._totalsEffectiveEntries()') !== -1,
            'Итоги: сервер + правки _PENDING (материализация — в них)');
        assertEqual(tm.indexOf('entries.concat('), -1,
            'concat виртуальных записей удалён (двойной счёт невозможен)');
    });

    test('печать: printGrid — тот же agg по эффективным записям', () => {
        const pg = methodText(WS_SRC, 'printGrid');
        assertTrue(pg.indexOf('this._totalsEffectiveEntries()') !== -1 &&
                   pg.indexOf('this._totalsAgg(') !== -1,
            'печать: колонка «Перераб./дни» — по записям/правкам');
        assertEqual(pg.indexOf('.concat('), -1,
            'подмешивания слоя в agg печати нет');
    });

    test('Талоны: _talonsRows — эффективные записи месяца сетки', () => {
        const fn = methodText(WS_SRC, '_talonsRows');
        assertTrue(fn.indexOf('this._talonsEffectiveEntries(entries, mi.y, mi.m)') !== -1,
            'агрегация талонов: месяц — как у записей сетки (Task 455)');
        assertEqual(fn.indexOf('eff.concat('), -1,
            'concat слоя удалён — правки _PENDING в _talonsEffectiveEntries');
    });

    test('печать сетки: _printCell и _printModel — записи штатно', () => {
        const pc = methodText(WS_SRC, '_printCell');
        assertEqual(pc.indexOf('_AUTO_DN'), -1,
            'псевдо-запись слоя Task 457 удалена — правка/запись даёт код');
        const pm = methodText(WS_SRC, '_printModel');
        assertEqual(pm.indexOf('_AUTO_DN'), -1,
            'подстановка слоя в PDF/Excel удалена — eff несёт код');
        assertTrue(pm.indexOf('var pending = pend[key] || null;') !== -1,
            '_printModel читает _PENDING — материализованные коды в PDF/Excel');
    });

    test('записи создаются: материализация в _renderGrid (гвард typeof)', () => {
        const rg = methodText(WS_SRC, '_renderGrid');
        assertTrue(rg.indexOf('this._autoDnMaterialize()') !== -1,
            '«Сохранить» получает материализованные правки штатно');
        assertTrue(rg.indexOf("typeof this._autoDnMaterialize === 'function'") !== -1,
            'гвард — старые VM-харнессы без метода не падают');
        const ap = methodText(WS_SRC, '_autoDnPlan');
        assertEqual(ap.indexOf('_autoDnEntries'), -1,
            'расчёт плана не зависит от виртуальных записей (нет рекурсии)');
    });
});

// ============================================================
// 2. SRC — SW
// ============================================================
describe('Task 457 — SRC: SW kipia-test-v757', () => {
    test('CACHE_VERSION = kipia-test-v757, прежней v680 нет', () => {
        assertTrue(SW_SRC.indexOf("'kipia-test-v757'") !== -1,
            'новая версия SW v682');
        assertEqual(SW_SRC.indexOf("'kipia-test-v680'"), -1,
            'старой версии v680 не осталось');
        assertTrue(SW_SRC.indexOf('Task 457') !== -1,
            'комментарий истории Task 457');
    });
});

// ============================================================
// 3. VM — Итоги: переработка over/overDays по материализованным
//    правкам (паттерн «план → _PENDING → эффективные записи»)
// ============================================================
describe('Task 457 — VM: Итоги учёта с материализованными правками', () => {

    const CODES = [
        { code: 'Д', name: 'День (12-час)', color: '#c8e6c9' },
        { code: 'д', name: 'День в вых./праздник', color: '#dcecc9' },
        { code: 'н', name: 'Ночь в вых./праздник', color: '#cfd8f5' }
    ];

    // ПРАВКА материализации — поля как у ручного ввода «д»/«н»
    // сменному (без часов: переработка 12 ч по типу, Task 322)
    function dnPending(day, code) {
        return {
            'статус': code, 'переработка': 0, 'замещает': null,
            'комментарий': '', 'часы': null
        };
    }

    function aggHost(opts) {
        opts = opts || {};
        return new Function('return ({' +
            methodText(WS_SRC, '_totalsEffectiveEntries') + ',' +
            methodText(WS_SRC, '_totalsZero') + ',' +
            methodText(WS_SRC, '_totalsAgg') + ',' +
            methodText(WS_SRC, '_codeHours') + ',' +
            methodText(WS_SRC, '_statusMeta') + ',' +
            methodText(WS_SRC, '_empTypeMap') + ',' +
            methodText(WS_SRC, '_overHours') + ',' +
            '_EMPLOYEES: ' + JSON.stringify(opts.emps || [{
                'таб_номер': '02', 'ФИО': 'Белов Б. Б.', 'тип': 'сменный' }]) + ',' +
            '_ENTRIES: ' + JSON.stringify(opts.entries || [
                { 'дата': '2026-10-06', 'таб_номер': '02', 'статус': 'Д', 'источник': 'авто' },
                { 'дата': '2026-10-07', 'таб_номер': '02', 'статус': 'Н', 'источник': 'авто' },
                { 'дата': '2026-10-14', 'таб_номер': '02', 'статус': 'Д', 'источник': 'авто' }]) + ',' +
            '_PENDING: ' + JSON.stringify(opts.pending !== undefined ? opts.pending
                : (function() {
                    // паттерн материализации Task 458: план дня 3 «д»,
                    // дня 19 «н» — правки _PENDING
                    var p = {};
                    p['2026-10-03|02'] = dnPending(3, 'д');
                    p['2026-10-19|02'] = dnPending(19, 'н');
                    return p;
                })()) + ',' +
            '_STATUS_CODES: ' + JSON.stringify(CODES) + ',' +
            '});')();
    }

    function aggOf(h) {
        return h._totalsAgg(h._totalsEffectiveEntries(),
                            h._empTypeMap(h._EMPLOYEES));
    }

    test('материализованные «д»/«н» = ПЕРЕРАБОТКА: over/overDays растут, явки/часы НЕ тронуты', () => {
        const h = aggHost({});
        const a = aggOf(h).byTab['02'];
        assertEqual(a.work, 3, 'явки — только записи (д/н — не явка, Task 322)');
        assertEqual(a.overDays, 2, '2 дня переработки — материализованные д/н');
        assertEqual(a.over, 24, 'сменному 12 ч × 2 = 24 ч');
        assertEqual(a.total, 5, 'total — все дни табеля');
    });

    test('ручной «д» и материализованный «н» — один счётчик (суммирование)', () => {
        const h = aggHost({
            entries: [{ 'дата': '2026-10-05', 'таб_номер': '02',
                        'статус': 'д', 'источник': 'руч', 'часы': null }],
            pending: (function() {
                var p = {};
                p['2026-10-20|02'] = dnPending(20, 'н');
                return p;
            })()
        });
        const a = aggOf(h).byTab['02'];
        assertEqual(a.overDays, 2, 'ручной «д» + авто «н» = 2 дня');
        assertEqual(a.over, 24, '12 + 12 = 24 ч');
        assertEqual(a.work, 0, 'явок нет');
    });

    test('пустые правки — счётчики только по записям', () => {
        const h = aggHost({ pending: {} });
        const a = aggOf(h).byTab['02'];
        assertEqual(a.work, 3, 'правок нет — только записи');
        assertEqual(a.overDays, 0, 'переработки нет');
    });
});

// ============================================================
// 4. VM — Талоны: день явки + 12-часовой талон по правкам
// ============================================================
describe('Task 457 — VM: Талоны с материализованными правками', () => {

    const CODES = [
        { code: 'Д', name: 'День (12-час)', color: '#c8e6c9' },
        { code: 'д', name: 'День в вых./праздник', color: '#dcecc9' },
        { code: 'н', name: 'Ночь в вых./праздник', color: '#cfd8f5' }
    ];

    function talonsHost(pending, entries) {
        return new Function('return ({' +
            methodText(WS_SRC, '_talonsEffectiveEntries') + ',' +
            methodText(WS_SRC, '_talonsAgg') + ',' +
            methodText(WS_SRC, '_overHours') + ',' +
            methodText(WS_SRC, '_codeHours') + ',' +
            methodText(WS_SRC, '_statusMeta') + ',' +
            methodText(WS_SRC, '_empTypeMap') + ',' +
            '_EMPLOYEES: [{ "таб_номер": "02", "ФИО": "Белов Б. Б.", "тип": "сменный" }],' +
            '_ENTRIES: ' + JSON.stringify(entries || []) + ',' +
            '_PENDING: ' + JSON.stringify(pending || {}) + ',' +
            '_STATUS_CODES: ' + JSON.stringify(CODES) + ',' +
            '});')();
    }

    test('материализованные «д»/«н»: дни явки и 12-часовые талоны (сменный)', () => {
        // паттерн Task 458: правки материализации в _PENDING
        const h = talonsHost({
            '2026-10-03|02': { 'статус': 'д', 'переработка': 0,
                               'замещает': null, 'комментарий': '', 'часы': null },
            '2026-10-08|02': { 'статус': 'н', 'переработка': 0,
                               'замещает': null, 'комментарий': '', 'часы': null }
        }, [{ 'дата': '2026-10-06', 'таб_номер': '02', 'статус': 'Д' }]);
        // паттерн _talonsRows: eff = _talonsEffectiveEntries(_ENTRIES, y, m)
        const eff = h._talonsEffectiveEntries(h._ENTRIES, 2026, 10);
        const a = h._talonsAgg(eff, h._empTypeMap(h._EMPLOYEES)).byTab['02'];
        assertEqual(a.days, 3, 'смена Д + 2 материализованных д/н = 3 дня явки');
        assertEqual(a.t12, 3, '12-часовые талоны: Д + д + н');
        assertEqual(a.t8, 0, '8-часовых нет');
    });

    test('правок нет — талоны только по записям', () => {
        const h = talonsHost({}, [{ 'дата': '2026-10-06', 'таб_номер': '02', 'статус': 'Д8' }]);
        const eff = h._talonsEffectiveEntries(h._ENTRIES, 2026, 10);
        const a = h._talonsAgg(eff, h._empTypeMap(h._EMPLOYEES)).byTab['02'];
        assertEqual(a.days, 1, 'запись одна');
        assertEqual(a.t8, 1, 'Д8 — 8-часовой талон');
    });
});

// ============================================================
// 5. VM — печать: _printCell и _printModel с материализованной
//    правкой (эффективная запись — как у ручного кода)
// ============================================================
describe('Task 457 — VM: печать сетки (_printCell/_printModel)', () => {

    const CODES = [
        { code: 'Д', name: 'День (12-час)', color: '#c8e6c9' },
        { code: 'д', name: 'День в вых./праздник', color: '#dcecc9' },
        { code: 'н', name: 'Ночь в вых./праздник', color: '#cfd8f5' }
    ];
    const EMP = { 'таб_номер': '02', 'ФИО': 'Белов Б. Б.', 'тип': 'сменный' };

    function printHost() {
        return new Function('return ({' +
            methodText(WS_SRC, '_printCell') + ',' +
            methodText(WS_SRC, '_statusMeta') + ',' +
            methodText(WS_SRC, '_vacationAt') + ',' +
            methodText(WS_SRC, '_calDayOff') + ',' +
            methodText(WS_SRC, '_esc') + ',' +
            '_EVENT_CODES: [],' +
            '_STATUS_CODES: ' + JSON.stringify(CODES) + ',' +
            '_VACATIONS: [],' +
            '_year: 2026, _month: 10,' +
            '});')();
    }

    test('_printCell: материализованная правка «д» — как запись (код + фон)', () => {
        const h = printHost();
        // правка материализации: источник «руч» у эффективной записи
        const td = h._printCell(3, '2026-10-03', EMP,
            { 'статус': 'д', 'источник': 'руч' }, false);
        assertTrue(td.indexOf('>д<') !== -1, 'код «д» в ячейке печати');
        assertTrue(td.indexOf('background:#dcecc9') !== -1,
            'фон — цвет справочника «д»');
        assertEqual(td.indexOf('wsp-over'), -1, 'точки переработки нет (переработка 0)');
        assertEqual(td.indexOf('wsp-vac'), -1, 'плана отпуска нет');
    });

    test('_printCell: без записи ячейка остаётся пустой (слой не рисует)', () => {
        const h = printHost();
        const td = h._printCell(3, '2026-10-03', EMP, null, false);
        assertEqual(td.indexOf('>д<'), -1, 'кода нет — только записи/правки');
        assertEqual(td.indexOf('background:'), -1, 'фона нет');
    });

    test('_printModel: правка «д» в ячейках PDF/Excel + итоги строки', () => {
        const h = new Function('return ({' +
            methodText(WS_SRC, '_printModel') + ',' +
            methodText(WS_SRC, '_buildEntryIndex') + ',' +
            methodText(WS_SRC, '_totalsEffectiveEntries') + ',' +
            methodText(WS_SRC, '_totalsZero') + ',' +
            methodText(WS_SRC, '_totalsAgg') + ',' +
            methodText(WS_SRC, '_codeHours') + ',' +
            methodText(WS_SRC, '_statusMeta') + ',' +
            methodText(WS_SRC, '_empTypeMap') + ',' +
            methodText(WS_SRC, '_overHours') + ',' +
            methodText(WS_SRC, '_vacationAt') + ',' +
            methodText(WS_SRC, '_empTipLine') + ',' +
            methodText(WS_SRC, '_isoDate') + ',' +
            '_printEventsData: function() { return []; },' +
            '_EVENT_CODES: [],' +
            '_STATUS_CODES: ' + JSON.stringify(CODES) + ',' +
            '_EMPLOYEES: [' + JSON.stringify(EMP) + '],' +
            '_ENTRIES: [{ "дата": "2026-10-06", "таб_номер": "02", "статус": "Д", "источник": "авто" }],' +
            '_PENDING: { "2026-10-03|02": { "статус": "д", "переработка": 0,' +
            ' "замещает": null, "комментарий": "", "часы": null } },' +
            '_VACATIONS: [],' +
            '_view: "full",' +
            '_year: 2026, _month: 10,' +
            '});')();
        // agg — паттерн printGrid: эффективные записи (сервер + _PENDING)
        const agg = h._totalsAgg(h._totalsEffectiveEntries(),
            h._empTypeMap(h._EMPLOYEES));
        const model = h._printModel([EMP], agg);
        assertEqual(model.rows.length, 1, 'строка работника');
        const day3 = model.rows[0].cells[2];   // 3 октября
        assertEqual(day3.status, 'д', 'правка «д» в ячейке модели');
        assertEqual(day3.color, '#dcecc9', 'цвет справочника «д»');
        assertFalse(day3.vac, 'это не план отпуска');
        const day6 = model.rows[0].cells[5];   // 6 октября — запись
        assertEqual(day6.status, 'Д', 'запись на месте');
        const day4 = model.rows[0].cells[3];   // 4 октября — пусто
        assertEqual(day4.status, '', 'без записи и правки — пусто');
        assertEqual(model.rows[0].work, 1, 'явка — запись Д');
        assertEqual(model.rows[0].overDays, 1, '«Перераб./дни» — правка «д»');
    });
});
