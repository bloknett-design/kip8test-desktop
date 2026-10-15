// tests/test-task363.js
// Task 363 — заявка пользователя: «В шахматке табеля фон выходных
// дней сделай таким же как в пустых ячейках. А на ячейках выходных
// дней сделай толстые красные разделительные линии вокруг по краям
// группы этих ячеек (не каждую ячейку), включая ячейки с датами.
// А нерабочие праздничные дни оставь светлым розовым фоном, только
// добавь такой же фон и на их ячейки с датами» (экранная сетка
// «График работы», Tasks 254/255/319/355):
//   • фон обычных ВЫХОДНЫХ (Сб/Вс + переносы, НЕ праздники) — как у
//     ПУСТЫХ ячеек (#eef0f2 / var(--bg-primary) по темам): прежние
//     розовые правила .ws-weekend.ws-status-empty удалены;
//   • красная 2px-рамка #e57373 вокруг ГРУППЫ столбцов выходных (не
//     каждую ячейку): верх — внутренняя тень th шапки (border-top
//     шапке запрещён Task 355), бока — border-left/right первого/
//     последнего столбца группы, низ — border-bottom последней
//     строки; шапка с датами ВХОДИТ в рамку; заменила тонкие
//     1px-линии стыков Task 255 (ws-boundary-*, #cc6e73);
//   • ПРАЗДНИКИ (ст. 112, dInfo.holiday): розовый #f8e2e9 у пустых
//     ячеек тела (ws-feast.ws-status-empty) + ТА ЖЕ заливка на
//     ячейке даты в шапке (th.ws-feast background); в группу рамки
//     праздники НЕ входят.
// Хелперы: _calDayFeast (праздник), _calWend (обычный выходной).
//
// SW: kipia-test-v743.
//
// Запуск: через tests/run-all.js (require './test-task363.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

const WS_START = INDEX_SRC.indexOf('var WorkSchedule = {');
const WS_CLIENT = INDEX_SRC.slice(WS_START, WS_START + 520000);

function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

function stripComments(src) {
    return String(src)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]*\/\/.*$/gm, '');
}

function mockEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// 1. SRC — CSS: фон выходных = пустые, розовый — праздники
// ============================================================
describe('Task 363 — SRC: фоны (выходные = пустые, праздники розовые)', () => {

    test('SRC: розовых правил ВЫХОДНЫХ больше нет (.ws-weekend.ws-status-empty)', () => {
        assertEqual(INDEX_SRC.indexOf('.ws-weekend.ws-status-empty'), -1,
            'селектор розовых выходных удалён из файла');
    });

    test('SRC: розовый ПРАЗДНИКА — база + светлая тема (#f8e2e9)', () => {
        assertTrue(INDEX_SRC.indexOf(
            '.ws-grid tbody td.ws-cell.ws-feast.ws-status-empty {\n' +
            '        background: #f8e2e9;') !== -1,
            'базовое правило ws-feast.ws-status-empty (тёмная — под фильтром 319)');
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] .ws-grid tbody td.ws-cell.ws-feast.ws-status-empty {\n' +
            '        background: #f8e2e9;') !== -1,
            'светлая тема (перекрывает светлое «.»-правило)');
    });

    test('SRC: шапка — фон даты праздника #f8e2e9 (заявка)', () => {
        const i = INDEX_SRC.indexOf('.ws-grid thead th.ws-day-col.ws-feast {');
        assertTrue(i !== -1, 'правило th.ws-feast есть');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('background: #f8e2e9') !== -1,
            'та же розовая заливка на ячейке с датой');
        assertTrue(rule.indexOf('color: #ff6b6b') !== -1 &&
                  rule.indexOf('font-weight: 700') !== -1,
            'ярко-красный жирный текст праздника жив (Task 260)');
    });

    test('SRC: маркер ws-weekend у нерабочих дней сохранён (регресс)', () => {
        assertTrue(INDEX_SRC.indexOf("if (dayOff) classes.push('ws-weekend');") !== -1,
            'класс-маркер нерабочих дней остаётся (тесты/семантика)');
    });
});

// ============================================================
// 2. SRC — CSS: рамка-группа выходных 2px #e57373 (Task 364)
// ============================================================
describe('Task 363 — SRC: красная рамка-группа выходных', () => {

    test('SRC: верх группы — внутренняя тень th (border-top шапки нет)', () => {
        assertTrue(INDEX_SRC.indexOf(
            '.ws-grid thead th.ws-day-col.ws-wgrp {\n' +
            '        box-shadow: inset 0 2px 0 0 #e57373;') !== -1,
            'тень 2px #e57373 на th столбцов группы (Task 364)');
        // высота шапки не меняется (Task 355: border-top: 0 жив)
        const re = /\.ws-grid thead th \{[^}]*border-top: 0;/;
        assertTrue(re.test(INDEX_SRC), 'border-top базовой шапки — по-прежнему 0');
    });

    test('SRC: бока рамки — th и td первого/последнего столбца группы', () => {
        assertTrue(INDEX_SRC.indexOf(
            '.ws-grid thead th.ws-day-col.ws-wgrp-first { border-left: 2px solid #e57373; }') !== -1,
            'th первого столбца — border-left 2px');
        assertTrue(INDEX_SRC.indexOf(
            '.ws-grid thead th.ws-day-col.ws-wgrp-last { border-right: 2px solid #e57373; }') !== -1,
            'th последнего столбца — border-right 2px');
        assertTrue(INDEX_SRC.indexOf(
            '.ws-grid tbody td.ws-cell.ws-wgrp-first { border-left: 2px solid #e57373; }') !== -1,
            'td первого столбца — border-left 2px');
        assertTrue(INDEX_SRC.indexOf(
            '.ws-grid tbody td.ws-cell.ws-wgrp-last { border-right: 2px solid #e57373; }') !== -1,
            'td последнего столбца — border-right 2px');
    });

    test('SRC: низ рамки — border-bottom последней строки', () => {
        assertTrue(INDEX_SRC.indexOf(
            '.ws-grid tbody tr:last-child td.ws-cell.ws-wgrp {\n' +
            '        border-bottom: 2px solid #e57373;') !== -1,
            'низ группы — 2px на tr:last-child (Task 364)');
    });

    test('SRC: тонкие 1px-линии Task 255 полностью удалены', () => {
        assertEqual(INDEX_SRC.indexOf('ws-boundary'), -1,
            'классы/правила ws-boundary-* удалены');
        assertEqual(INDEX_SRC.indexOf('#cc6e73'), -1,
            'пыльно-красный #cc6e73 удалён');
    });

    test('SRC: специфичность рамки выше светлой темы (не перекрасится)', () => {
        // [data-theme="light"] .ws-grid tbody td { border-color } —
        // (0,2,2); рамочные селекторы с .ws-cell — (0,3,2) и позже
        // (Task 377: цвет правила — rgb(64,80,102), селектор прежний)
        const iLight = INDEX_SRC.indexOf(
            '[data-theme="light"] .ws-grid tbody td {\n        border-color: rgb(64, 80, 102);');
        const iRed = INDEX_SRC.indexOf('.ws-grid tbody td.ws-cell.ws-wgrp-first {');
        assertTrue(iLight !== -1 && iRed !== -1,
            'оба правила в файле');
        const weak = /\.ws-grid tbody td\.ws-wgrp-\w+ \{/;   // без .ws-cell
        assertFalse(weak.test(INDEX_SRC), 'слабого селектора без .ws-cell нет');
    });
});

// ============================================================
// 3. SRC — JS: хелперы и классы
// ============================================================
describe('Task 363 — SRC: хелперы _calDayFeast/_calWend', () => {

    test('SRC: _calDayFeast — праздник ст. 112 по календарю', () => {
        const h = stripComments(methodText(WS_CLIENT, '_calDayFeast'));
        assertTrue(h.length > 0, 'метод определён');
        assertTrue(h.indexOf('holiday') !== -1, 'поле holiday dayInfo');
        assertTrue(h.indexOf('return false;') !== -1,
            'без календаря праздников нет');
    });

    test('SRC: _calWend — обычный выходной (нерабочий, НЕ праздник)', () => {
        const h = stripComments(methodText(WS_CLIENT, '_calWend'));
        assertTrue(h.length > 0, 'метод определён');
        assertTrue(h.indexOf('_calDayOff(day)') !== -1 &&
                   h.indexOf('!this._calDayFeast(day)') !== -1,
            'нерабочий МИНУС праздник');
    });

    test('SRC: _renderGrid — wgrp-классы на th (шапка в рамке)', () => {
        const g = stripComments(methodText(WS_CLIENT, '_renderGrid'));
        assertTrue(g.indexOf("wgrpCls = ' ws-wgrp'") !== -1,
            'базовый класс группы');
        assertTrue(g.indexOf("wgrpCls += ' ws-wgrp-first'") !== -1 &&
                   g.indexOf("wgrpCls += ' ws-wgrp-last'") !== -1,
            'крайние столбцы группы');
        assertTrue(g.indexOf('this._calWend(d - 1)') !== -1 &&
                   g.indexOf('this._calWend(d + 1)') !== -1,
            'соседи дня — по календарю (границы групп)');
        assertTrue(g.indexOf('if (isOff && !isFeast)') !== -1,
            'праздники в группу НЕ входят');
        assertTrue(g.indexOf("(isFeast ? ' ws-feast' : '') + wgrpCls +") !== -1,
            'wgrpCls попадает в thCls');
    });

    test('SRC: _renderCell — ws-feast + рамка на td', () => {
        const c = stripComments(methodText(WS_CLIENT, '_renderCell'));
        assertTrue(c.indexOf("if (dayFeast) classes.push('ws-feast');") !== -1,
            'праздник в теле — ws-feast');
        assertTrue(c.indexOf("classes.push('ws-wgrp');") !== -1,
            'столбец группы на td');
        assertTrue(c.indexOf("classes.push('ws-wgrp-first');") !== -1 &&
                   c.indexOf("classes.push('ws-wgrp-last');") !== -1,
            'крайние столбцы на td');
        // гварды для старых VM-хостов без новых хелперов
        assertTrue(c.indexOf("typeof this._calDayFeast === 'function'") !== -1,
            'гвард _calDayFeast');
        assertTrue(c.indexOf("typeof this._calWend === 'function'") !== -1,
            'гвард _calWend');
    });
});

// ============================================================
// 4. VM — хелперы и _renderCell с моком календаря
// ============================================================
describe('Task 363 — VM: календарь/группы/_renderCell', () => {

    const CODES = [
        { code: 'Д',  name: 'День',   color: '#FFE082' },
        { code: 'ОТ', name: 'Отпуск', color: '#ECEFF1' },
        { code: 'И',  name: 'Инструктаж', color: '#B3E5FC' }
    ];

    // сентябрь 2026: 1=Вт… 5-6 Сб/Вс, 12-13 Сб/Вс; 15 — ПРАЗДНИК
    // (off+holiday, среда); 19-20 Сб/Вс; 10 — одиночный перенос
    // (off без holiday, четверг)
    function mkCal() {
        var cal = {};
        [5, 6, 12, 13, 19, 20, 26, 27].forEach(function (d) { cal[d] = { off: true, holiday: false }; });
        cal[10] = { off: true, holiday: false };     // перенесённый выходной (одиночный)
        cal[15] = { off: true, holiday: true };      // нерабочий праздничный
        return cal;
    }

    function mkHost(cal) {
        return new Function('ProdCalendar', 'return ({' +
            methodText(WS_CLIENT, '_renderCell') + '\n' +
            methodText(WS_CLIENT, '_calDayOff') + '\n' +
            methodText(WS_CLIENT, '_calDayFeast') + '\n' +
            methodText(WS_CLIENT, '_calWend') + '\n' +
            '_year: 2026, _month: 9, _todayIso: null, _canEdit: true,' +
            '_STATUS_CODES: ' + JSON.stringify(CODES) + ',' +
            '_EVENT_CODES: ["И","ОБ","ПЗ","ПР","*"],' +
            '_ABSENCE_CODES: ["ОТ","У","ОВ","Б","ПР"],' +
            '_VAC_CODES: ["ОТ","У"],' +
            '_eventsAt: function() { return []; },' +
            '_vacationAt: function() { return null; },' +
            '_plannedShiftAt: function() { return null; },' +
            '_statusMeta: function(code) { ' +
                'for (var i = 0; i < CODES.length; i++) { if (CODES[i].code === code) return CODES[i]; } ' +
                'return null; },' +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')({ dayInfo: function(y, m, d) { return cal[d] || { off: false, holiday: false, short: false }; } });
    }

    var EMP = { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'сменный' };

    function cell(host, day) {
        var iso = '2026-09-' + (day < 10 ? '0' : '') + day;
        return host._renderCell(day, iso, EMP, null, false);
    }

    test('VM: _calWend — суббота обычный выходной, праздник — НЕ выходной', () => {
        var host = mkHost(mkCal());
        assertEqual(host._calWend(5), true, 'сб 05.09 — обычный выходной');
        assertEqual(host._calWend(15), false, 'праздник 15 — НЕ входит в группу');
        assertEqual(host._calWend(4), false, 'рабочая пятница — не выходной');
    });

    test('VM: _calDayFeast — только праздник', () => {
        var host = mkHost(mkCal());
        assertEqual(host._calDayFeast(15), true, 'праздник 15.09');
        assertEqual(host._calDayFeast(5), false, 'суббота — не праздник');
    });

    test('VM: суббота — ws-wgrp + ws-wgrp-first, НЕ last (воскресенье рядом)', () => {
        var html = cell(mkHost(mkCal()), 5);
        assertTrue(html.indexOf('ws-wgrp') !== -1, 'столбец группы');
        assertTrue(html.indexOf('ws-wgrp-first') !== -1, 'первый столбец группы');
        assertFalse(html.indexOf('ws-wgrp-last') !== -1, 'НЕ последний (рядом вс)');
        assertFalse(html.indexOf('ws-feast') !== -1, 'не праздник');
        assertTrue(html.indexOf('ws-weekend') !== -1, 'маркер нерабочего (регресс)');
        assertTrue(html.indexOf('ws-status-empty') !== -1, 'пустая ячейка');
    });

    test('VM: воскресенье — ws-wgrp-last, НЕ first', () => {
        var html = cell(mkHost(mkCal()), 6);
        assertTrue(html.indexOf('ws-wgrp-last') !== -1, 'последний столбец группы');
        assertFalse(html.indexOf('ws-wgrp-first') !== -1, 'НЕ первый (рядом сб)');
    });

    test('VM: ПРАЗДНИК — ws-feast, без рамки группы', () => {
        var html = cell(mkHost(mkCal()), 15);
        assertTrue(html.indexOf('ws-feast') !== -1, 'класс праздника (розовый фон)');
        assertFalse(html.indexOf('ws-wgrp') !== -1, 'рамки группы НЕТ');
        assertTrue(html.indexOf('ws-weekend') !== -1, 'нерабочий день — маркер жив');
    });

    test('VM: праздник РАЗБИВАЕТ соседние выходные (группа только из выходных)', () => {
        // календарь: 19 сб обычный, 20 вс ПРАЗДНИК, 21 пн обычный выходной
        var cal = { 19: { off: true, holiday: false },
                    20: { off: true, holiday: true },
                    21: { off: true, holiday: false } };
        var html = cell(mkHost(cal), 19);
        assertTrue(html.indexOf('ws-wgrp-first') !== -1 && html.indexOf('ws-wgrp-last') !== -1,
            'сб 19 — одиночная группа (за ним праздник): first + last');
        var html21 = cell(mkHost(cal), 21);
        assertTrue(html21.indexOf('ws-wgrp-first') !== -1 && html21.indexOf('ws-wgrp-last') !== -1,
            'пн 21 — тоже одиночная группа (перед ним праздник)');
    });

    test('VM: одиночный перенесённый выходной — first + last', () => {
        var html = cell(mkHost(mkCal()), 10);
        assertTrue(html.indexOf('ws-wgrp') !== -1, 'столбец группы');
        assertTrue(html.indexOf('ws-wgrp-first') !== -1 &&
                   html.indexOf('ws-wgrp-last') !== -1,
            'одиночная группа обводится целиком');
    });

    test('VM: 1-е число выходной — first (край таблицы = край группы)', () => {
        var cal = { 1: { off: true, holiday: false }, 2: { off: true, holiday: false } };
        var html = cell(mkHost(cal), 1);
        assertTrue(html.indexOf('ws-wgrp-first') !== -1,
            'день 1 — первый столбец группы (левая граница у колонки ФИО)');
        assertFalse(html.indexOf('ws-wgrp-last') !== -1, 'день 2 тоже выходной');
    });

    test('VM: рабочий день — никаких классов группы/праздника', () => {
        var html = cell(mkHost(mkCal()), 4);
        assertFalse(html.indexOf('ws-wgrp') !== -1, 'рамки нет');
        assertFalse(html.indexOf('ws-feast') !== -1, 'праздника нет');
        assertFalse(html.indexOf('ws-weekend') !== -1, 'нерабочего нет');
    });

    test('VM: рабочий день рядом с группой — БЕЗ красной границы (2px бьёт 1px)', () => {
        // раньше Task 255 красил ОБЕ стороны стыка; теперь достаточно
        // стороны выходного — в border-collapse победит широкая
        var html = cell(mkHost(mkCal()), 4);
        assertTrue(html.indexOf('ws-boundary') === -1,
            'граничных классов Task 255 у рабочего дня нет');
    });

    test('VM: старый хост без новых хелперов — не падает', () => {
        var host = new Function('return ({' +
            methodText(WS_CLIENT, '_renderCell') + '\n' +
            '_year: 2026, _month: 9, _todayIso: null, _canEdit: true,' +
            '_STATUS_CODES: ' + JSON.stringify(CODES) + ',' +
            '_EVENT_CODES: ["И"],' +
            '_ABSENCE_CODES: ["ОТ"],' +
            '_VAC_CODES: ["ОТ"],' +
            '_eventsAt: function() { return []; },' +
            '_vacationAt: function() { return null; },' +
            '_plannedShiftAt: function() { return null; },' +
            '_statusMeta: function() { return null; },' +
            '_calDayOff: function() { return true; },' +
            '_esc: ' + mockEsc.toString() + ',' +
            '});')();
        var html = host._renderCell(5, '2026-09-05', EMP, null, false);
        assertTrue(html.indexOf('ws-weekend') !== -1, 'ячейка построена, нерабочий');
        assertTrue(html.indexOf('wsp-') === -1, 'экранная ячейка');
    });
});

// ============================================================
// 5. Регресс — соседние фичи не тронуты
// ============================================================
describe('Task 363 — VM: регресс соседних фич', () => {

    test('SRC: «.»-ячейка и статус-мероприятие как прежде (355/356 живы)', () => {
        const c = methodText(WS_CLIENT, '_renderCell');
        assertTrue(c.indexOf("(showMainCode ? status : (vacPlan ? 'ОТ' : ''))") !== -1,
            'тернарник контента (Task 356)');
        assertTrue(c.indexOf("if (isDotCode) classes.push('ws-dot-code')") !== -1,
            'маркер «.» (Task 314)');
        assertTrue(c.indexOf("if (!showMainCode && !vacPlan) classes.push('ws-status-empty')") !== -1,
            'пустой вид ячейки');
    });

    test('SRC: статусные ячейки печатают inline-фон (Task 250/252)', () => {
        const c = methodText(WS_CLIENT, '_renderCell');
        assertTrue(c.indexOf("if (showMainCode) style += 'background:' + color + ';';") !== -1,
            'inline-фон статусных ячеек жив');
    });

    test('SRC: today/hover/sel колонки и бейджи живы (313/316/314)', () => {
        const c = methodText(WS_CLIENT, '_renderCell');
        assertTrue(c.indexOf('ws-today') !== -1 && c.indexOf('ws-hover') !== -1 &&
                   c.indexOf('ws-sel') !== -1, 'подсветки столбцов');
        assertTrue(c.indexOf('ws-ev-badge') !== -1 && c.indexOf('_eventsAt') !== -1,
            'бейджи мероприятий');
    });
});

// ============================================================
// 6. Service Worker
// ============================================================
describe('Task 363 — Service Worker', () => {

    test('SW: кэш поднят до kipia-test-v743', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v743'") !== -1,
            'CACHE_VERSION = kipia-test-v743 (Task 363 — фронтенд)');
        assertFalse(SW_SRC.indexOf('kipia-test-v744') !== -1,
            'v605 ещё не существует (лишний инкремент)');
    });

    test('SW: в index.html нет захардкоженной версии кэша', () => {
        assertFalse(INDEX_SRC.indexOf('kipia-test-v59') !== -1,
            'клиент не знает номер кэша (версией управляет sw.js)');
    });
});
