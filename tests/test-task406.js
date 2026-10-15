// ============================================================
// Task 406 — заявка: «В картах работников, блок мероприятия
// перемести под блок отпуска, а блоки СИЗ и инструктажей поменяй
// местами».
//
// Раскладка карточки «Работники» (Task 404/405 → 406):
//   ДО:  1-я колонка — профиль + отпуска | 2-я — СИЗ |
//        3-я — мероприятия, под ним инструктажи
//   ПОСЛЕ: 1-я колонка — профиль + отпуска + МЕРОПРИЯТИЯ (под
//        отпусками) | 2-я (.ws-wcol-instr) — «Повторные
//        инструктажи и периодическая проверка знаний» | 3-я
//        (.ws-wcol-ppe) — СИЗ.
// Мобайл ≤1023px — стек колонок в том же порядке. Попап шахматки
// (b1+b2+b3+b5 — профиль → отпуска → мероприятия → инструктажи,
// без СИЗ) уже соответствует заявке — не меняется. Сервер не
// трогается.
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

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// ============================================================
// 1. SRC — _renderWorkerCardPanels: новая раскладка
// ============================================================
describe('Task 406 — SRC: раскладка колонок карточки', () => {

    test('мероприятия — в ПЕРВУЮ колонку (под отпусками)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCardPanels'));
        assertTrue(fn.indexOf('if (bi < 3) colMain += panel;') !== -1,
            'блоки 1–3 (профиль + отпуска + мероприятия) — в colMain');
        assertTrue(fn.indexOf('var colMain = \'\', colInstr = \'\', colPpe = \'\';') !== -1,
            'сборщики: colMain / colInstr / colPpe');
    });

    test('инструктажи — ВТОРАЯ колонка, СИЗ — ТРЕТЬЯ (поменяны местами)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCardPanels'));
        assertTrue(fn.indexOf('else if (bi === 4) colInstr += panel;') !== -1,
            'блок 5 (инструктажи) — в colInstr (2-я колонка)');
        assertTrue(fn.indexOf('else colPpe += panel;') !== -1,
            'блок 4 (СИЗ) — в colPpe (3-я колонка)');
        assertTrue(fn.indexOf('ws-wcol-instr') !== -1 &&
                   fn.indexOf('ws-wcol-ppe') !== -1,
            'маркеры колонок .ws-wcol-instr / .ws-wcol-ppe');
    });

    test('возврат: main → инструктажи → СИЗ; легаси .ws-wcol-tr удалён', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCardPanels'));
        const iM = fn.indexOf("'<div class=\"ws-wcol\">' + colMain + '</div>' +");
        const iI = fn.indexOf("'<div class=\"ws-wcol ws-wcol-instr\">' + colInstr + '</div>' +");
        const iP = fn.indexOf("'<div class=\"ws-wcol ws-wcol-ppe\">' + colPpe + '</div>'");
        assertTrue(iM !== -1 && iI !== -1 && iP !== -1 && iM < iI && iI < iP,
            'порядок возврата: main → .ws-wcol-instr → .ws-wcol-ppe');
        assertFalse(fn.indexOf('colTr') !== -1,
            'легаси-сборщик colTr удалён');
        assertFalse(INDEX_SRC.indexOf('ws-wcol-tr') !== -1,
            'класс .ws-wcol-tr исчез из index.html целиком');
    });

    test('CSS: три равные колонки живы (заявка Task 404 не сломана)', () => {
        const m = INDEX_SRC.match(/@media \(min-width: 1024px\) \{\s*\.ws-wgrid2 \{[^}]*?\}\s*\.ws-wgrid2 \.ws-wcol \{[^}]*?\}\s*\}/);
        assertTrue(m !== null, 'блок медиаправил жив');
        assertTrue(m[0].indexOf('display: flex;') !== -1 &&
                   m[0].indexOf('flex-wrap: nowrap;') !== -1 &&
                   m[0].indexOf('flex: 1 1 0;') !== -1,
            'flex без переноса, равные доли — три колонки в одну линию');
        assertTrue(INDEX_SRC.indexOf('.ws-wgrid2 .ws-wcol { margin-bottom: 5px; }') !== -1,
            'мобайл-стек: зазор между колонками жив (Task 428: 5px)');
    });

    test('попап шахматки НЕ меняется: b1+b2+b3+b5 (без СИЗ)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf('(b1 + b2 + b3 + b5)') !== -1,
            'попап: профиль → отпуска → мероприятия → инструктажи');
        assertTrue(fn.indexOf('[b1, b2, b3, b4, b5]') !== -1,
            'asBlocks — по-прежнему 5 блоков');
    });
});

// ============================================================
// 2. VM — панели: раскладка блоков по колонкам
// ============================================================
describe('Task 406 — VM: колонки карточки', () => {

    const EMP = [
        { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
          'смена': '', 'должность': 'Слесарь КИПиА 5 разряд', 'комментарий': '',
          'группа_допуска': 'IV', 'дата_приёма': '2024-03-15' },
    ];
    const VACS = [{
        id: 7, 'таб_номер': '2706', 'часть': 1,
        'дата_начала': '2026-07-01', 'дата_окончания': '2026-07-14',
        'комментарий': '' }];
    const TRS = [
        { id: 5, 'таб_номер': '2706', 'тип': 'инструктаж', 'тема': 'ОТ',
          'дата_начала': '2026-02-10', 'дата_окончания': '2026-02-10' },
        { id: 6, 'таб_номер': '2706', 'тип': 'обучение', 'тема': 'КУ',
          'дата_начала': '2026-03-02', 'дата_окончания': '2026-03-05' }];
    const PPE = [{
        id: 3, 'таб_номер': '2706', наименование: 'Каска защитная',
        дата_выдачи: '2026-09-17', срок_годности: '1 год',
        дата_окончания: '2027-09-17', примечание: '' }];

    function cardHost(withEdit) {
        return new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
            methodText(INDEX_SRC, '_lastExam1000Date') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
            methodText(INDEX_SRC, '_renderWorkerCardPanels') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            '_canEdit: ' + (withEdit ? 'true' : 'false') + ',' +
            '_year: 2026, _month: 8,' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_VACATIONS: ' + JSON.stringify(VACS) + ',' +
            '_TRAININGS: ' + JSON.stringify(TRS) + ',' +
            '_PPE: ' + JSON.stringify(PPE) + ',' +
            '_fmtDateRu: function(d) { d = String(d);' +
            '  var p = d.split("-"); return p.length === 3 ?' +
            '  p[2] + "." + p[1] + "." + p[0] : d; },' +
            '_esc: function(s) { return String(s); },' +
            '_escAttr: function(s) { return String(s); },' +
            '_trainingCodeOf: function(t) { return "И"; },' +
            '_statusMeta: function(c) { return {}; },' +
            '_vacDaysInYear: function(v, y) { return 14; },' +
            '_vacNetDaysInYear: function(v, y) { return 14; },' +
            '_plural: function(n, f) { return f[2]; }' +
            '});')(mockDoc({}));
    }

    test('колонка 1 — профиль → отпуска → мероприятия (стек, 3 окна)', () => {
        const host = cardHost(true);
        const html = host._renderWorkerCardPanels('2706', true);
        const iL = html.indexOf('<div class="ws-wcol">');
        const iI = html.indexOf('<div class="ws-wcol ws-wcol-instr">');
        const iP = html.indexOf('<div class="ws-wcol ws-wcol-ppe">');
        assertTrue(iL !== -1 && iI !== -1 && iP !== -1 && iL < iI && iI < iP,
            'ТРИ колонки: main → инструктажи → СИЗ');
        const mainPart = html.slice(iL, iI);
        assertEqual((mainPart.match(/class="ws-wcard"/g) || []).length, 3,
            'в 1-й колонке ТРИ окна (Task 406)');
        const iProf = mainPart.indexOf('Галкин Д. Н.');
        const iVac = mainPart.indexOf('Отпуска · 2026');
        const iTr = mainPart.indexOf('Мероприятия · 2026');
        assertTrue(iProf !== -1 && iVac !== -1 && iTr !== -1,
            'профиль, отпуска и мероприятия — в 1-й колонке');
        assertTrue(iProf < iVac && iVac < iTr,
            'мероприятия — ПОД блоком отпуска (заявка)');
        // в 1-й колонке нет чужих блоков
        assertTrue(mainPart.indexOf('СИЗ · средства') === -1 &&
                   mainPart.indexOf('Повторные инструктажи') === -1,
            'в 1-й колонке нет СИЗ и инструктажей');
    });

    test('колонка 2 — только блок инструктажей; колонка 3 — только СИЗ', () => {
        const host = cardHost(true);
        const html = host._renderWorkerCardPanels('2706', true);
        const iI = html.indexOf('<div class="ws-wcol ws-wcol-instr">');
        const iP = html.indexOf('<div class="ws-wcol ws-wcol-ppe">');
        const insPart = html.slice(iI, iP);
        const ppePart = html.slice(iP);
        assertEqual((insPart.match(/class="ws-wcard"/g) || []).length, 1,
            'во 2-й колонке ОДНО окно');
        assertTrue(insPart.indexOf(
            'Повторные инструктажи и периодическая проверка знаний · 2026') !== -1,
            'заголовок блока инструктажей — во 2-й колонке');
        assertTrue(insPart.indexOf('ОТ') !== -1,
            'запись инструктажа — во 2-й колонке');
        assertEqual((ppePart.match(/class="ws-wcard"/g) || []).length, 1,
            'в 3-й колонке ОДНО окно');
        assertTrue(ppePart.indexOf('СИЗ · средства индивидуальной защиты') !== -1,
            'заголовок СИЗ — в 3-й колонке');
        assertTrue(ppePart.indexOf('Каска защитная') !== -1,
            'запись СИЗ — в 3-й колонке');
        assertTrue(insPart.indexOf('Мероприятия · 2026') === -1 &&
                   ppePart.indexOf('Мероприятия · 2026') === -1,
            'мероприятия — ТОЛЬКО в 1-й колонке');
    });

    test('обучение — в 1-й колонке (блок мероприятий), НЕ в инструктажах', () => {
        const host = cardHost(true);
        const html = host._renderWorkerCardPanels('2706', true);
        const iL = html.indexOf('<div class="ws-wcol">');
        const iI = html.indexOf('<div class="ws-wcol ws-wcol-instr">');
        const mainPart = html.slice(iL, iI);
        const insPart = html.slice(iI, html.indexOf('<div class="ws-wcol ws-wcol-ppe">'));
        assertTrue(mainPart.indexOf('КУ') !== -1,
            'обучение — в блоке мероприятий 1-й колонки');
        assertTrue(insPart.indexOf('КУ') === -1,
            'обучение — НЕ в блоке инструктажей');
    });

    test('мобайл: порядок DOM = стек колонок (профиль → … → инструктажи → СИЗ)', () => {
        const host = cardHost(false);
        const html = host._renderWorkerCardPanels('2706', false);
        const order = [
            html.indexOf('Галкин Д. Н.'),
            html.indexOf('Отпуска · 2026'),
            html.indexOf('Мероприятия · 2026'),
            html.indexOf('Повторные инструктажи и периодическая проверка знаний · 2026'),
            html.indexOf('СИЗ · средства индивидуальной защиты'),
        ];
        order.forEach(function(i) { assertTrue(i !== -1, 'блок найден'); });
        assertTrue(order[0] < order[1] && order[1] < order[2] &&
                   order[2] < order[3] && order[3] < order[4],
            'стек мобайла (DOM): профиль → отпуска → мероприятия → инструктажи → СИЗ');
    });

    test('зритель (withEdit=false): кнопок нет, раскладка та же', () => {
        const host = cardHost(false);
        const html = host._renderWorkerCardPanels('2706', false);
        assertTrue(html.indexOf('ws-popup-act') === -1,
            'у зрителя кнопок ✎/✕ нет');
        assertEqual((html.match(/class="ws-wcard"/g) || []).length, 5,
            'пять окон-панелей сохранены');
    });

    test('попап шахматки: мероприятия под отпусками, без СИЗ (регресс)', () => {
        const host = cardHost(false);
        const html = host._renderWorkerCard('2706', false, false);
        const iVac = html.indexOf('Отпуска · 2026');
        const iTr = html.indexOf('Мероприятия · 2026');
        const iIns = html.indexOf(
            'Повторные инструктажи и периодическая проверка знаний · 2026');
        assertTrue(iVac !== -1 && iTr !== -1 && iIns !== -1 &&
                   iVac < iTr && iTr < iIns,
            'попап: отпуска → мероприятия → инструктажи');
        assertTrue(html.indexOf('СИЗ · средства') === -1,
            'попап без СИЗ (Task 403)');
    });
});

// ============================================================
// 3. SW — версия кэша
// ============================================================
describe('Task 406 — SW', () => {

    test('CACHE_VERSION = kipia-test-v741', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v741'") !== -1,
            'SW v633 (Task 406)');
        assertTrue(SW_SRC.indexOf('kipia-test-v742') === -1,
            'нет забегания вперёд');
    });
});
