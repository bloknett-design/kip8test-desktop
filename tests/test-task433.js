// ============================================================
// Task 433 — заявка (kip8test): «Расположение кодов в печати
// верни обратно, я имел в виду, что бы правая часть блока
// растянулась вправо до конца листа, и если текст не будет
// вмещаться в одну строку, тогда переносить его на следующую
// строку. Кнопки редактировать и удалить в блоке инструктажей
// поменяй местами. В картах работников, в блоках профиля и
// отпуска, расстояние между названием строчки и содержанием
// в этой строчке должно быть по примеру как в блоке мероприятия
// обозначением кода и содержанием в строке».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   КЛИЕНТ (SRC):
//   1) печать — ВЕРТИКАЛЬНАЯ секция (Task 433: флоат Task 432
//      и flex-ряд Task 364–431 сняты): .wsp-bottom — обычный
//      блочный поток; КАЖДАЯ запись-«блок» .wsp-mev-item —
//      гибкий ряд [точка][дата][текст]: дата — слот
//      (min-width 66px, худший диапазон «29.09–02.10»), ТЕКСТ
//      (.wsp-mev-text) — flex: 1, ПРАВАЯ ЧАСТЬ БЛОКА РАСТЯНУТА
//      ДО КОНЦА ЛИСТА, перенос — только когда текст не
//      вмещается в одну строку; заглушка .wsp-mev-none — block;
//   2) печать — КОДЫ ВЕРНУЛИ ИСХОДНОЕ РАСПОЛОЖЕНИЕ «в одну
//      строку» (как до Task 360): .wsp-legend — абзац ПОД
//      списком (margin-top 2.5mm, БЕЗ float/max-width),
//      .wsp-lg — inline + margin-right 3mm + nowrap (код
//      не рвётся внутри); строка кодов РАСТЯНУТА вправо до
//      конца листа, перенос — только когда текст не вмещается;
//   3) печать — ПОРЯДОК DOM: обёртка → мероприятия → коды →
//      два последовательных закрытия (legend + обёртка) →
//      сноска wsp-foot;
//   4) кнопки блока инструктажей: ✎ и ✕ ПОМЕНЯНЫ МЕСТАМИ
//      (Task 433; в Task 432 было «✕ ✎») — ряд .ws-act-row
//      строится как iActEdit + iActDel, колонка .ws-act-col
//      (галочка НАД рядом) не тронута; попап ячейки — прежний
//      порядок ✎/✕;
//   5) карты — ПЛОТНЫЕ СЛОТЫ названий «по примеру блока
//      мероприятий» (код-слот 26px + gap 8px): профиль —
//      min-width 110px (по «Группу допуска», шрифт 14px),
//      строки отпусков — класс ws-emp-vac + слот 56px (по
//      «Часть N»), базовый вид 12px — 94px;
//   VM (клиент):
//   6) _renderWorkerCard asBlocks: строка инструктажа — ✎
//      ПЕРВЫМ в ряду .ws-act-row, ✕ — ПОСЛЕ; отпускные строки
//      несут ws-emp-vac; _buildPrintHtml — мероприятия ПЕРВЫМИ,
//      коды ПОД ними, записи с [дата][текст].
//   SW: kipia-test-v758 (главный), v660 — прежней нет.
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

function ruleBlock(sel) {
    const i = INDEX_SRC.indexOf(sel);
    if (i === -1) return '';
    return INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
}

function stripComments(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:'"\\/])\/\/[^\n]*/g, '$1');
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// ============================================================
// 1. SRC — печать: вертикальная секция, правая часть блока
// ============================================================
describe('Task 433 — SRC: печать (секция вертикальная, коды строкой)', () => {

    test('.wsp-bottom — ряда НЕТ, секция одна (Task 442)', () => {
        const r = ruleBlock('#wsPrintSheet .wsp-bottom {');
        assertTrue(r !== '', 'правило обёртки есть');
        // Task 442: столбец кодов удалён — ряд Tasks 439/440 снят,
        // обёртка снова простой блок (вертикальная секция навсегда)
        assertTrue(r.indexOf('display: flex') === -1,
            'flex-ряда НЕТ (Task 442)');
        assertTrue(r.indexOf('flow-root') === -1,
            'флоат-обёртка Task 432 не вернулась');
        assertTrue(r.indexOf('gap') === -1,
            'зазора между блоками нет (Task 442)');
        assertTrue(r.indexOf('margin-top: 2.5mm') !== -1,
            'отступ от таблицы (Task 364) жив');
    });

    test('.wsp-mev-item — запись-блок [точка][дата][текст]', () => {
        const r = ruleBlock('#wsPrintSheet .wsp-mev-item {');
        assertTrue(r !== '', 'правило строки-записи есть');
        assertTrue(r.indexOf('display: flex') !== -1,
            'запись — гибкий ряд');
        assertTrue(r.indexOf('align-items: baseline') !== -1,
            'точка/дата/текст — по базовой линии');
        assertTrue(r.indexOf('page-break-inside: avoid') !== -1,
            'запись не рвётся между страницами');
        const none = ruleBlock('#wsPrintSheet .wsp-mev-none {');
        assertTrue(none.indexOf('display: block') !== -1,
            'заглушка «нет мероприятий» — блочная (не flex)');
    });

    test('.wsp-mev-text — ПРАВАЯ ЧАСТЬ БЛОКА растянута до конца листа', () => {
        const r = ruleBlock('#wsPrintSheet .wsp-mev-text {');
        assertTrue(r !== '', 'правило текста есть');
        assertTrue(r.indexOf('flex: 1') !== -1,
            'текст занимает всю строку записи вправо — до конца листа');
        assertTrue(r.indexOf('min-width: 0') !== -1,
            'усадка при переполнении разрешена (перенос слов)');
    });

    test('.wsp-mev-date — слот даты (худший диапазон «29.09–02.10»)', () => {
        const r = ruleBlock('#wsPrintSheet .wsp-mev-date {');
        assertTrue(r !== '', 'правило даты есть');
        assertTrue(r.indexOf('font-weight: 700') !== -1,
            'дата жирная (Task 360)');
        assertTrue(r.indexOf('flex-shrink: 0') !== -1,
            'дата не сжимается');
        assertTrue(r.indexOf('min-width: 66px') !== -1,
            'слот по худший диапазон «29.09–02.10» — тексты записей выровнены');
        const dot = ruleBlock('#wsPrintSheet .wsp-mev-item i {');
        assertTrue(dot.indexOf('flex-shrink: 0') !== -1,
            'точка цвета не сжимается');
    });

    test('.wsp-legend/.wsp-lg — правила УДАЛЕНЫ (Task 442)', () => {
        assertTrue(ruleBlock('#wsPrintSheet .wsp-legend {') === '',
            'правила .wsp-legend нет (Task 442: столбец кодов удалён)');
        assertTrue(ruleBlock('#wsPrintSheet .wsp-lg {') === '' &&
                   ruleBlock('#wsPrintSheet .wsp-legend-t {') === '' &&
                   ruleBlock('#wsPrintSheet .wsp-legend-cols {') === '',
            'правил заголовка/сетки/записей кодов нет');
    });

    test('JS: секция одна — мероприятия (Task 442)', () => {
        const b = stripComments(methodText(INDEX_SRC, '_buildPrintHtml'));
        const iOpen = b.indexOf('<div class="wsp-bottom">');
        const iMev = b.indexOf('<div class="wsp-mev">');
        const iFoot = b.indexOf('<div class="wsp-foot">');
        assertTrue(iOpen !== -1 && iMev !== -1,
            'обёртка и секция мероприятий строятся');
        assertTrue(iFoot === -1, 'сноска wsp-foot удалена (Task 438)');
        assertTrue(iOpen < iMev, 'порядок: обёртка → МЕРОПРИЯТИЯ');
        assertTrue(b.indexOf('wsp-legend') === -1,
            'секции кодов нет (Task 442)');
    });

    test('JS: запись содержит [дата][текст] (правая часть — текст)', () => {
        const b = stripComments(methodText(INDEX_SRC, '_buildPrintHtml'));
        const iItem = b.indexOf("'<span class=\"wsp-mev-item\">'");
        assertTrue(iItem !== -1, 'запись строится');
        const iDate = b.indexOf('<b class="wsp-mev-date">', iItem);
        const iText = b.indexOf('<span class="wsp-mev-text">', iItem);
        assertTrue(iDate !== -1 && iText !== -1 && iDate < iText,
            'внутри записи: дата, за ней текст (правая часть)');
    });
});

// ============================================================
// 2. SRC — кнопки: ✎ и ✕ поменяны местами
// ============================================================
describe('Task 433 — SRC: кнопки блока инструктажей (✎ первым)', () => {

    test('разметка b5: ряд .ws-act-row строит iActEdit + iActDel', () => {
        const start = INDEX_SRC.indexOf('нет инструктажей и проверок знаний за год');
        const end = INDEX_SRC.indexOf('ws-emp-addins', start);
        const FLAT = INDEX_SRC.slice(start, end);
        assertTrue(FLAT !== '', 'ветка плоского списка b5 найдена');
        assertTrue(FLAT.indexOf(
            "'<span class=\"ws-act-row\">' + iActEdit + iActDel + '</span>'") !== -1,
            'Task 433: ✎ (редактировать) ПЕРВЫМ, ✕ (удалить) — ПОСЛЕ');
        assertFalse(FLAT.indexOf(
            "'<span class=\"ws-act-row\">' + iActDel + iActEdit + '</span>'") !== -1,
            'порядок Task 432 (✕ первым) больше не встречается');
        assertTrue(FLAT.indexOf(
            "'<span class=\"ws-act-col\">' + iChk + iActRow + '</span>'") !== -1,
            'колонка жива: галочка НАД рядом (Task 431/432)');
        assertTrue(FLAT.indexOf('iRowEnd = iActEdit + iActDel;') !== -1,
            'попап (!asBlocks) — прежний горизонтальный порядок ✎/✕');
    });

    test('комментарий Task 433 у ряда кнопок', () => {
        const i = INDEX_SRC.indexOf("' + iActEdit + iActDel + '</span>'");
        const zone = INDEX_SRC.slice(Math.max(0, i - 700), i);
        assertTrue(zone.indexOf('Task 433') !== -1,
            'маркер Task 433 (поменяй местами) у ряда кнопок');
        assertTrue(zone.indexOf('поменяй местами') !== -1 ||
                   zone.indexOf('ПОРЯДОК ОБРАТНЫЙ') !== -1,
            'суть заявки отражена в комментарии');
    });
});

// ============================================================
// 3. SRC — карты: плотные слоты названий профиля/отпуска
// ============================================================
describe('Task 433 — SRC: слоты названий в блоках профиля и отпуска', () => {

    test('профиль в картах — слот 110px (по «Группа допуска»)', () => {
        const r = ruleBlock('.ws-wcard .ws-emp-field .ws-emp-k {');
        assertTrue(r !== '', 'правило слота есть');
        assertTrue(r.indexOf('min-width: 110px') !== -1,
            'Task 433: плотный слот по самой длинной строке профиля');
        assertFalse(r.indexOf('128px') !== -1,
            'прежний слот 128px снят');
    });

    test('отпуска — свой слот: класс ws-emp-vac + 56px в картах', () => {
        const r = ruleBlock('.ws-wcard .ws-emp-field.ws-emp-vac .ws-emp-k {');
        assertTrue(r !== '', 'правило отпускного слота есть');
        assertTrue(r.indexOf('min-width: 56px') !== -1,
            'Task 433: слот «Часть N» (короче названий профиля)');
        const base = ruleBlock('.ws-emp-field.ws-emp-vac .ws-emp-k {');
        assertTrue(base.indexOf('min-width: 48px') !== -1,
            'базовый вид (12px): слот 48px');
    });

    test('базовый профиль (12px) — слот 94px', () => {
        const r = ruleBlock('.ws-emp-field .ws-emp-k {');
        assertTrue(r !== '', 'правило живо');
        assertTrue(r.indexOf('min-width: 94px') !== -1,
            'Task 433: 108 → 94px (плотный по «Группа допуска» при 12px)');
    });

    test('разметка b2: строки отпусков несут ws-emp-vac', () => {
        const start = INDEX_SRC.indexOf('Секция 2: отпуска года');
        const end = INDEX_SRC.indexOf('Секция 3: мероприятия ГОДА', start);
        const B2 = stripComments(INDEX_SRC.slice(start, end));
        assertTrue(B2 !== '', 'ветка b2 найдена');
        assertTrue(B2.indexOf("'<div class=\"ws-emp-field ws-emp-vac'") !== -1,
            'строки отпусков — с классом ws-emp-vac');
        assertTrue(B2.indexOf('<span class="ws-emp-k">Часть ') !== -1,
            'название строки — «Часть N» (как прежде)');
    });
});

// ============================================================
// 4. VM — рендер: кнопки ✎✕ и строки отпуска
// ============================================================
describe('Task 433 — VM: строка инструктажа и строка отпуска', () => {

    const YEAR = new Date().getFullYear();

    function d(day) {
        return YEAR + '-09-' + (day < 10 ? '0' + day : day);
    }

    const EMP = [
      { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'сменный', 'смена': 1,
        'должность': 'Слесарь КИПиА', 'группа_допуска': 'IV',
        'дата_приёма': '2024-03-15', 'дата_увольнения': '', 'в_архиве': 0 }
    ];
    const INS = [
      { id: 51, 'таб_номер': '017', 'тип': 'инструктаж',
        'тема': 'Повторный инструктаж по ОТ', 'дата_начала': d(2),
        'дата_окончания': d(2), 'длительность_дней': 1,
        'выполнение': 0, 'просрочен': 0 }
    ];
    const VACS = [
      { id: 7, 'таб_номер': '017', 'часть': 1,
        'дата_начала': YEAR + '-07-01', 'дата_окончания': YEAR + '-07-14',
        'комментарий': '' },
      { id: 8, 'таб_номер': '017', 'часть': 2,
        'дата_начала': YEAR + '-09-05', 'дата_окончания': YEAR + '-09-18',
        'комментарий': '' }
    ];

    function cardHost(opts) {
        return new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
            methodText(INDEX_SRC, '_lastExam1000Date') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
            methodText(INDEX_SRC, '_renderInstrSection') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKind') + ',\n' +
            methodText(INDEX_SRC, '_addMonthsIso') + ',\n' +
            methodText(INDEX_SRC, '_isoDate') + ',\n' +
            methodText(INDEX_SRC, '_fmtPeriodRu') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
            '_canEdit: ' + (opts.edit ? 'true' : 'false') + ',' +
            '_year: ' + YEAR + ', _month: 9,' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_VACATIONS: ' + JSON.stringify(VACS) + ',' +
            '_TRAININGS: [],' +
            '_PPE: [],' +
            '_INSTR_LIST: [],' +
            '_INSTR_ALL: ' + JSON.stringify(opts.instrAll || INS) + ',' +
            '_fmtDateRu: function(x) { var p = String(x).split("-");' +
            '  return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(x); },' +
            '_esc: function(s) { return String(s); },' +
            '_escAttr: function(s) { return String(s); },' +
            '_vacDaysInYear: function(v, y) { return 14; },' +
            '_vacNetDaysInYear: function(v, y) { return 14; },' +
            '_plural: function(n, f) { return f[2]; },' +
            '_trainingCodeOf: function(t) { return "И"; },' +
            '_statusMeta: function(c) { return { code: c, color: "#123456", name: c }; }' +
            '});')(mockDoc({}));
    }

    function rowOf(html, topic) {
        const i = html.indexOf(topic);
        if (i === -1) return null;
        const start = html.lastIndexOf('<div class="ws-emp-field', i);
        return html.slice(start, html.indexOf('</div>', i) + 6);
    }

    test('редактор: в ряду .ws-act-row ✎ ПЕРВЫМ, ✕ ПОСЛЕ', () => {
        const host = cardHost({ edit: true });
        const blocks = host._renderWorkerCard('017', true, true);
        const html = blocks.join('');
        const i = html.indexOf('Повторный инструктаж по ОТ');
        assertTrue(i !== -1, 'строка инструктажа найдена');
        const start = html.lastIndexOf('<div class="ws-popup-row', i);
        const end = html.indexOf('</div>', i) + 6;
        const row = html.slice(start, end);
        const iRow = row.indexOf('<span class="ws-act-row">');
        const iDel = row.indexOf('ws-popup-act-del', iRow);
        const iEdit = row.indexOf('ws-popup-act"', iRow);
        assertTrue(iRow !== -1, 'ряд .ws-act-row в строке');
        assertTrue(iEdit !== -1 && iDel !== -1 && iEdit < iDel,
            'Task 433: ✎ первым, ✕ — после (поменяны местами)');
    });

    test('отпускные строки — класс ws-emp-vac у КАЖДОЙ строки', () => {
        const host = cardHost({ edit: true });
        const blocks = host._renderWorkerCard('017', true, true);
        const b2 = blocks[1];
        assertEqual((b2.match(/class="ws-emp-field ws-emp-vac/g) || []).length, 2,
            'обе строки отпусков несут ws-emp-vac');
        assertTrue(b2.indexOf('ws-emp-k">Часть 1') !== -1 &&
                   b2.indexOf('ws-emp-k">Часть 2') !== -1,
            'названия строк — «Часть N»');
        // зебра жива: вторая строка — ws-row-alt
        assertTrue(b2.indexOf('ws-emp-field ws-emp-vac ws-row-alt') !== -1,
            'чередование зебры не тронуто (Task 396/432)');
    });
});

// ============================================================
// 5. SW — версия кеша
// ============================================================
describe('Task 433 — SW: версия кеша', () => {
    test('v659 (главный), v660 — прежней нет', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v758'") !== -1,
            'SW кэш kipia-test-v758');
        assertFalse(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v759'") !== -1,
            'v660 ещё не существует (guard следующего бампа)');
    });
});
