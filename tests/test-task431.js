// ============================================================
// Task 431 — заявка (kip8test): «при печати графика работы, список
// кодов расположи справа от списка мероприятий на расстоянии
// 10px, сейчас между ними очень большое расстояние, посмотри и
// исправь, а нижнюю стору с примечаниями расположи под ними.
// В тёмной теме фон ярлыков работников сделай как фон в блоках
// карт работников. В блоке Повторные инструктажи и периодическая
// проверка знаний, при наведении указателя мыши на строку зебры,
// она меняет цвет фона, убери этот эффект, и кнопку отметки
// выполнения расположи над кнопкой удалить».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   КЛИЕНТ (SRC):
//   1) печать: .wsp-mev flex 0 1 auto (НЕ растягивается — коды
//      встают в 10px справа от текста мероприятий, gap 10px
//      обёртки wsp-bottom Task 375 жив), wsp-foot — ПОД обоими
//      столбиками (в _buildPrintHtml после закрывающей </div>
//      обёртки wsp-bottom);
//   2) тёмная тема ярлыков: .ws-wtab = #243349 (фон блоков карт
//      .ws-wcard), hover #2A3A53, active #31445F; тёплые тона
//      Task 390 (#4B4E46/#575A50/#63665B) сняты; светлая тема
//      НЕ тронута (#E4E0D3/#DBD6C8/var(--bg-tertiary));
//   3) hover строк блока повторных инструктажей (.ws-wcol-instr)
//      — фон НЕ меняется: прозрачный hover + зебра-строки держат
//      СВОЙ оттенок (тёмная и светлая темы);
//   4) .ws-act-col — вертикальная колонка конца строки;
//   5) разметка b5: кнопки разделены (iActEdit/iActDel), галочка
//      и ✕ в .ws-act-col (галочка НАД удалением), ✎ — вне
//      колонки, порядок строки: iLateTag + iActEdit + iDelCol;
//   VM (клиент):
//   6) _renderWorkerCard asBlocks: галочка в колонке НАД ✕,
//      ✎ — левее колонки; зритель — колонка с одной галочкой
//      состояния (выполнено); запись без id — без колонки;
//      попап (!asBlocks) — БЕЗ галочки, прежний порядок ✎/✕.
//   SW: kipia-test-v752.
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

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// ============================================================
// 1. SRC — печать: коды в 10px справа от мероприятий
// ============================================================
describe('Task 431 — SRC: печать (коды справа от мероприятий)', () => {

    test('.wsp-mev: без ограничений — вся ширина листа (Task 442)', () => {
        const i = INDEX_SRC.indexOf('#wsPrintSheet .wsp-mev {');
        assertTrue(i !== -1, 'правило .wsp-mev есть');
        const r = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i));
        // Task 442: столбца кодов справа больше нет — ограничения
        // зоны мероприятий (flex/min-width из Tasks 439/440) сняты
        assertTrue(r.indexOf('flex:') === -1,
            'flex-ограничений нет (кодов справа больше нет, Task 442)');
        assertTrue(r.indexOf('min-width') === -1,
            'усадки зоны нет (зоны больше нет)');
    });

    test('.wsp-legend: правило УДАЛЕНО (Task 442)', () => {
        const i = INDEX_SRC.indexOf('#wsPrintSheet .wsp-legend {');
        assertTrue(i === -1,
            'правила .wsp-legend нет — блок кодов удалён (Task 442)');
        assertTrue(INDEX_SRC.indexOf('#wsPrintSheet .wsp-lg {') === -1,
            'правила .wsp-lg тоже нет');
    });

    test('wsp-foot удалена; секция одна — мероприятия (Task 442)', () => {
        // Task 438 (заявка: «нижний текст убери»): сноска wsp-foot
        // УДАЛЕНА; Task 442: легенда кодов удалена — в обёртке
        // осталась единственная секция мероприятий
        const f = INDEX_SRC.indexOf("html += '<div class=\"wsp-foot\">");
        assertTrue(f === -1, 'сноска wsp-foot не строится (Task 438)');
        const iLegend = INDEX_SRC.indexOf("html += '<div class=\"wsp-legend\">");
        assertTrue(iLegend === -1,
            'легенда кодов НЕ строится (Task 442)');
        const iMev = INDEX_SRC.indexOf("html += '<div class=\"wsp-mev\">");
        assertTrue(iMev !== -1, 'секция мероприятий строится');
        const open = INDEX_SRC.lastIndexOf("html += '<div class=\"wsp-bottom\">'", iMev);
        assertTrue(open !== -1 && open < iMev,
            'обёртка wsp-bottom открывается раньше секции');
        // закрытие секции и обёртки — два последовательных оператора
        // (между ними — только комментарий Task 442, сырой исходник)
        const close1 = INDEX_SRC.indexOf("html += '</div>';", iMev);
        const close2 = INDEX_SRC.indexOf("html += '</div>';", close1 + 1);
        assertTrue(close1 !== -1 && close2 !== -1 && close2 - close1 < 400,
            'закрытия секции/обёртки — подряд');
        const wrap = INDEX_SRC.slice(open, close2);
        // разметка легенды (в комментарии Task 442 слово
        // wsp-legend встречается — ищем именно РАЗМЕТКУ)
        assertTrue(wrap.indexOf('wsp-mev') !== -1 &&
                   wrap.indexOf('<div class="wsp-legend">') === -1,
            'в обёртке — только список мероприятий (Task 442)');
    });
});

// ============================================================
// 2. SRC — тёмная тема ярлыков = фон блоков карт
// ============================================================
describe('Task 431 — SRC: тёмная тема ярлыков', () => {

    test('.ws-wtab фон — ТОЧНО фон блока карты .ws-wcard', () => {
        const i = INDEX_SRC.indexOf('.ws-wcard {');
        assertTrue(i !== -1, 'правило .ws-wcard есть');
        const card = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i));
        assertTrue(card.indexOf('background: #243349;') !== -1,
            'блок карты: фон #243349 (Task 395)');
        const j = INDEX_SRC.indexOf('.ws-wtab {');
        const tab = INDEX_SRC.slice(j, INDEX_SRC.indexOf('}', j));
        assertTrue(tab.indexOf('background: #243349;') !== -1,
            'ярлык: тот же #243349 — «как фон в блоках карт работников»');
    });

    test('hover и active — шаги светлее в семействе блоков карт', () => {
        const h = INDEX_SRC.indexOf('.ws-wtab:hover {');
        const rH = INDEX_SRC.slice(h, INDEX_SRC.indexOf('}', h));
        assertTrue(rH.indexOf('background: #2A3A53;') !== -1,
            'hover #2A3A53 — светлее #243349');
        const a = INDEX_SRC.indexOf('.ws-wtab.active {');
        const rA = INDEX_SRC.slice(a, INDEX_SRC.indexOf('}', a));
        assertTrue(rA.indexOf('background: #31445F;') !== -1,
            'active #31445F — самый светлый');
    });

    test('тёплые тона Task 390 сняты из ярлыков', () => {
        assertFalse(INDEX_SRC.indexOf('background: #4B4E46;') !== -1,
            'неактивный #4B4E46 убран');
        assertFalse(INDEX_SRC.indexOf('background: #575A50;') !== -1,
            'hover #575A50 убран');
        assertFalse(INDEX_SRC.indexOf('background: #63665B;') !== -1,
            'active #63665B убран');
    });

    test('светлая тема ярлыков — НЕ тронута', () => {
        const b = INDEX_SRC.match(/\[data-theme="light"\] \.ws-wtab \{[^}]*\}/);
        assertTrue(b !== null && b[0].indexOf('background: #E4E0D3;') !== -1,
            'светлая: неактивный #E4E0D3 (как прежде)');
        const h = INDEX_SRC.match(/\[data-theme="light"\] \.ws-wtab:hover \{[^}]*\}/);
        assertTrue(h !== null && h[0].indexOf('background: #DBD6C8') !== -1,
            'светлая: hover #DBD6C8 (как прежде)');
    });
});

// ============================================================
// 3. SRC — hover строк зебры блока повторных инструктажей
// ============================================================
describe('Task 431 — SRC: hover строк блока инструктажей', () => {

    test('нейтрализация подсветки в колонке .ws-wcol-instr (тёмная)', () => {
        assertTrue(INDEX_SRC.indexOf(
            '.ws-wcol-instr .ws-popup-row:hover { background: transparent; }') !== -1,
            'hover НЕзебра-строк — прозрачный (подсветка снята)');
        assertTrue(INDEX_SRC.indexOf(
            '.ws-wcol-instr .ws-popup-row.ws-row-alt:hover') !== -1,
            'hover зебра-строк — свой статичный оттенок (не сбрасывается)');
    });

    test('нейтрализация в светлой теме (там и была подсветка)', () => {
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] .ws-wcol-instr .ws-popup-row:hover') !== -1,
            'светлая: hover прозрачный — rgba(42,93,143,0.12) перекрыт');
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] .ws-wcol-instr .ws-popup-row.ws-row-alt:hover') !== -1,
            'светлая: зебра на hover — свой оттенок rgba(0,0,0,0.05)');
    });

    test('зона — только колонка инструктажей (другие блоки не тронуты)', () => {
        // у мероприятий/отпусков/СИЗ общая подсветка остаётся
        assertFalse(INDEX_SRC.indexOf(
            '.ws-wcard .ws-popup-row:hover { background: transparent; }') !== -1,
            'глобального отключения hover по всей карте НЕТ (только ws-wcol-instr)');
    });
});

// ============================================================
// 4. SRC — колонка .ws-act-col и разметка b5
// ============================================================
describe('Task 431 — SRC: галочка над кнопкой удаления', () => {

    test('.ws-act-col — вертикальная колонка', () => {
        const i = INDEX_SRC.indexOf('.ws-act-col {');
        assertTrue(i !== -1, 'правило .ws-act-col есть');
        const r = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i));
        assertTrue(r.indexOf('flex-direction: column') !== -1,
            'кнопки в колонку (галочка над удалением)');
        assertTrue(r.indexOf('flex-shrink: 0') !== -1,
            'колонка не сжимается');
    });

    test('разметка b5: галочка над рядом «✎ ✕» (Task 433)', () => {
        const start = INDEX_SRC.indexOf('нет инструктажей и проверок знаний за год');
        const end = INDEX_SRC.indexOf('ws-emp-addins', start);
        const FLAT = INDEX_SRC.slice(start, end);
        assertTrue(FLAT.indexOf("var iActEdit = '', iActDel = '';") !== -1,
            'кнопки разделены: ✎ отдельно, ✕ отдельно');
        // Task 433 (заявка: «кнопки редактировать и удалить в блоке
        // инструктажей поменяй местами»): в ряду .ws-act-row ✎
        // строится ПЕРВЫМ, ✕ — ПОСЛЕ (в Task 432 было наоборот)
        assertTrue(FLAT.indexOf(
            "'<span class=\"ws-act-row\">' + iActEdit + iActDel + '</span>'") !== -1,
            'ряд .ws-act-row: ✎ ПЕРВЫМ, ✕ ПОСЛЕ (Task 433: поменяны местами)');
        assertTrue(FLAT.indexOf(
            "'<span class=\"ws-act-col\">' + iChk + iActRow + '</span>'") !== -1,
            'колонка: галочка НАД рядом ✎✕');
        assertTrue(FLAT.indexOf('iLateTag + iRowEnd') !== -1,
            'порядок строки: бейдж → конец строки (колонка кнопок)');
        assertTrue(FLAT.indexOf('asBlocks && iTrId && withEdit') !== -1,
            'интерактивность галочки — только карточка с правом правки (Task 418)');
        assertTrue(FLAT.indexOf('WorkSchedule.toggleTrainingDone(') !== -1,
            'onclick галочки — toggleTrainingDone (как прежде)');
        // попап: прежний горизонтальный порядок (без колонки)
        assertTrue(FLAT.indexOf("iRowEnd = iActEdit + iActDel;") !== -1,
            'попап (!asBlocks) — ✎/✕ горизонтально, без .ws-act-col');
    });
});

// ============================================================
// 5. VM — рендер строки: положение кнопок
// ============================================================
describe('Task 431 — VM: строка инструктажа (кнопки)', () => {

    const YEAR = new Date().getFullYear();

    function isoToday() {
        const n = new Date();
        return n.getFullYear() + '-' +
            (n.getMonth() + 1 < 10 ? '0' + (n.getMonth() + 1) : String(n.getMonth() + 1)) +
            '-' + (n.getDate() < 10 ? '0' + n.getDate() : String(n.getDate()));
    }

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
        'выполнение': 0, 'просрочен': 0 },
      { id: 52, 'таб_номер': '017', 'тип': 'проверка_знаний',
        'тема': 'Электроустановки до 1000 В', 'дата_начала': d(10),
        'дата_окончания': d(10), 'длительность_дней': 1,
        'выполнение': 0, 'просрочен': 0 }
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
            '_VACATIONS: [],' +
            '_TRAININGS: [],' +
            '_PPE: [],' +
            '_INSTR_LIST: [],' +
            '_INSTR_ALL: ' + JSON.stringify(opts.instrAll || INS) + ',' +
            '_fmtDateRu: function(x) { var p = String(x).split("-");' +
            '  return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(x); },' +
            '_esc: function(s) { return String(s); },' +
            '_escAttr: function(s) { return String(s); },' +
            '_vacDaysInYear: function(v, y) { return 0; },' +
            '_vacNetDaysInYear: function(v, y) { return 0; },' +
            '_plural: function(n, f) { return f[2]; },' +
            '_trainingCodeOf: function(t) { return t === "проверка_знаний" ? "ПЗ" : "И"; },' +
            '_statusMeta: function(c) { return { code: c, color: "#123456", name: c }; }' +
            '});')(mockDoc({}));
    }

    // вырезка строки-записи по теме
    function rowOf(html, topic) {
        const i = html.indexOf(topic);
        if (i === -1) return null;
        const start = html.lastIndexOf('<div class="ws-popup-row', i);
        return html.slice(start, html.indexOf('</div>', i) + 6);
    }

    test('редактор: галочка в колонке НАД рядом «✎ ✕»', () => {
        const host = cardHost({ edit: true });
        const html = host._renderWorkerCard('017', true, true).join('');
        const row = rowOf(html, 'Повторный инструктаж по ОТ');
        assertTrue(row !== null, 'строка записи найдена');
        const col = row.indexOf('<span class="ws-act-col">');
        assertTrue(col !== -1, 'колонка .ws-act-col в строке');
        const iRow = row.indexOf('<span class="ws-act-row">', col);
        const chk = row.indexOf('ws-done-chk', col);
        assertTrue(iRow !== -1 && chk !== -1 && chk < iRow,
            'внутри колонки галочка РАНЬШЕ ряда (галочка НАД ✎✕)');
        // Task 433 (заявка: кнопки поменяны местами): в ряду ✎
        // ПЕРВЫМ, ✕ — ПОСЛЕ (Task 432 было ✕ первым)
        const del = row.indexOf('ws-popup-act-del', iRow);
        const edit = row.indexOf('ws-popup-act"', iRow);
        assertTrue(del !== -1 && edit !== -1 && edit < del,
            'в ряду .ws-act-row: ✎ первым, ✕ — после (Task 433)');
    });

    test('редактор: колонка с рядом ✕✎ замыкает строку', () => {
        const host = cardHost({ edit: true });
        const html = host._renderWorkerCard('017', true, true).join('');
        const row = rowOf(html, 'Электроустановки до 1000 В');
        const iCol = row.indexOf('ws-act-col');
        const iName = row.indexOf('ws-popup-name');
        assertTrue(iCol !== -1 && iName !== -1 && iName < iCol,
            'порядок: …имя, затем колонка (галочка/✕✎) в КОНЦЕ строки');
    });

    test('зритель: колонка с одной галочкой состояния (выполнено)', () => {
        const done = JSON.parse(JSON.stringify(INS));
        done[0]['выполнение'] = 1;
        const host = cardHost({ edit: false, instrAll: done });
        const html = host._renderWorkerCard('017', false, true).join('');
        const row = rowOf(html, 'Повторный инструктаж по ОТ');
        const col = row.indexOf('<span class="ws-act-col">');
        assertTrue(col !== -1, 'колонка есть и у зрителя');
        const colEnd = row.indexOf('</span>', row.indexOf('✓', col));
        const colText = row.slice(col, colEnd);
        assertTrue(colText.indexOf('ws-done-on') !== -1 &&
                   colText.indexOf('ws-done-ro') !== -1,
            'некликабельная галочка состояния внутри колонки');
        assertTrue(colText.indexOf('ws-popup-act') === -1,
            'кнопок правки/удаления у зрителя нет');
    });

    test('запись без id — без колонки (нет кнопок)', () => {
        const noId = JSON.parse(JSON.stringify(INS));
        delete noId[0].id;
        const host = cardHost({ edit: true, instrAll: noId });
        const html = host._renderWorkerCard('017', true, true).join('');
        const row = rowOf(html, 'Повторный инструктаж по ОТ');
        assertTrue(row !== null, 'строка без id рендерится');
        assertTrue(row.indexOf('ws-act-col') === -1,
            'колонки нет — нет ни галочки, ни кнопок');
    });

    test('попап (!asBlocks): прежний вид — БЕЗ галочки и колонки', () => {
        const host = cardHost({ edit: true });
        const html = host._renderWorkerCard('017', true, false);
        assertTrue(html.indexOf('ws-done-chk') === -1,
            'галочка — только в карточке (Task 418, регресс)');
        assertTrue(html.indexOf('ws-act-col') === -1,
            'колонка — только в карточке');
    });
});

// ============================================================
// 6. SW — версия
// ============================================================
describe('Task 431 — SW версия', () => {
    test('v657', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v752') !== -1,
            'SW кэш kipia-test-v752');
    });
});
