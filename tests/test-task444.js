// ============================================================
// Task 444 — заявка: «В картах работников, в блоке СИЗ, шрифт
// наименования СИЗ сделай не ярким, а текст с датами и сроками
// наоборот сделай нормальным ярким и лучше читаемым, дату
// окончания "до дд.мм.гггг" сделай больше размером и цвет шрифта
// зелёным - если дата окончания не просрочена и оранжевым или
// ближе к красному цвету - если дата окончания просрочена.»
//
// Реализация (полностью КЛИЕНТСКАЯ, index.html):
//   • CSS: .ws-ppe-name — secondary, вес 500 (приглушено, прежде
//     primary/600); .ws-ppe-meta — primary, 11.5px (прежде
//     secondary, 10.5px); в карточке .ws-wcard .ws-ppe-meta —
//     13px (прежде 12.5px);
//   • CSS: .ws-ppe-exp — 1.15em/700 (крупнее мета-строки);
//     .ws-ppe-exp-ok — зелёный #81c784 (light #2e7d32 — палитра
//     ws-il-due-ok), .ws-ppe-exp-bad — оранжево-красный #ff7043
//     (light #e64a19);
//   • Рендер _renderWorkerCard: «до дд.мм.гггг» — в span
//     ws-ppe-exp ok/bad; просроченность — ISO «сегодня»
//     (лексикографическое сравнение, приём Task 380; дата ровно
//     сегодня — ещё действует); «До износа»/без даты — без
//     выделения; дата «сегодня» считается инлайн — рендер не
//     зависит от _isoDate (самодостаточность в мок-тестах).
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
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
    return m ? String(m) : '';
}

// CSS-правило целиком: от селектора до ПЕРВОЙ '}' (работает и для
// однострочных, и для многострочных правил)
function oneRule(sel) {
    const i = INDEX_SRC.indexOf(sel);
    if (i === -1) return null;
    const end = INDEX_SRC.indexOf('}', i);
    return end === -1 ? null : INDEX_SRC.slice(i, end + 1);
}

// ============================================================
// 1. SRC — CSS: инверсия яркости имя ↔ мета
// ============================================================
describe('Task 444 — SRC: CSS блока СИЗ', () => {

    test('.ws-ppe-name — ПРИГЛУШЁННОЕ имя (secondary, вес 500)', () => {
        const r = oneRule('.ws-ppe-name');
        assertTrue(r !== null, 'правило найдено');
        assertTrue(r.indexOf('var(--text-secondary') !== -1,
            'цвет secondary (не яркое)');
        assertTrue(r.indexOf('font-weight: 500') !== -1,
            'вес 500 (прежде 600)');
        assertTrue(r.indexOf('var(--text-primary') === -1,
            'primary у имени УБРАН');
    });

    test('.ws-ppe-meta — ЯРКАЯ мета (primary, 11.5px)', () => {
        const r = oneRule('.ws-ppe-meta');
        assertTrue(r !== null, 'правило найдено');
        assertTrue(r.indexOf('var(--text-primary') !== -1,
            'цвет primary (яркая, читаемая)');
        assertTrue(r.indexOf('font-size: 11.5px') !== -1,
            'крупнее (прежде 10.5px)');
        assertTrue(r.indexOf('var(--text-secondary') === -1,
            'secondary у меты УБРАН');
    });

    test('light-тема: имя #777, мета #333', () => {
        const rn = oneRule('[data-theme="light"] .ws-ppe-name');
        const rm = oneRule('[data-theme="light"] .ws-ppe-meta');
        assertTrue(rn !== null && rn.indexOf('#777') !== -1,
            'имя — приглушённый #777');
        assertTrue(rm !== null && rm.indexOf('#333') !== -1,
            'мета — яркий #333 (прежде #777)');
    });

    test('.ws-wcard .ws-ppe-meta — 13px в карточке (прежде 12.5px)', () => {
        const r = oneRule('.ws-wcard .ws-ppe-meta');
        assertTrue(r !== null, 'правило найдено');
        assertTrue(r.indexOf('font-size: 13px') !== -1, 'размер 13px');
        assertTrue(r.indexOf('12.5px') === -1, 'старый размер убран');
    });
});

// ============================================================
// 2. SRC — CSS: .ws-ppe-exp — дата окончания крупнее + цвет
// ============================================================
describe('Task 444 — SRC: CSS .ws-ppe-exp (до дд.мм.гггг)', () => {

    test('.ws-ppe-exp — 1.15em, вес 700 (крупнее меты)', () => {
        const r = oneRule('.ws-ppe-exp');
        assertTrue(r !== null, 'правило найдено');
        assertTrue(r.indexOf('font-size: 1.15em') !== -1,
            'размер 1.15em (11.5px→13.2px / 13px→15px)');
        assertTrue(r.indexOf('font-weight: 700') !== -1, 'жирный 700');
    });

    test('цвета: ok зелёный, bad оранжево-красный (тёмная тема)', () => {
        const ok = oneRule('.ws-ppe-exp-ok');
        const bad = oneRule('.ws-ppe-exp-bad');
        assertTrue(ok !== null && ok.indexOf('#81c784') !== -1,
            'ok — зелёный #81c784 (палитра ws-il-due-ok)');
        assertTrue(bad !== null && bad.indexOf('#ff7043') !== -1,
            'bad — оранжево-красный #ff7043');
    });

    test('цвета light-темы: ok #2e7d32, bad #e64a19', () => {
        const ok = oneRule('[data-theme="light"] .ws-ppe-exp-ok');
        const bad = oneRule('[data-theme="light"] .ws-ppe-exp-bad');
        assertTrue(ok !== null && ok.indexOf('#2e7d32') !== -1,
            'light ok — зелёный #2e7d32');
        assertTrue(bad !== null && bad.indexOf('#e64a19') !== -1,
            'light bad — оранжево-красный #e64a19');
    });
});

// ============================================================
// 3. SRC — рендер: span ws-ppe-exp + класс по просроченности
// ============================================================
describe('Task 444 — SRC: рендер _renderWorkerCard', () => {

    test('«до …» — span с классом ok/bad', () => {
        const fn = methodText(INDEX_SRC, '_renderWorkerCard');
        assertTrue(fn.indexOf('<span class="ws-ppe-exp \' +') !== -1,
            'оборачивание в span');
        assertTrue(fn.indexOf("? 'ws-ppe-exp-bad' : 'ws-ppe-exp-ok'") !== -1,
            'тернар bad/ok');
    });

    test('граница — ISO «сегодня», инлайн (без _isoDate)', () => {
        const fn = methodText(INDEX_SRC, '_renderWorkerCard');
        assertTrue(fn.indexOf("('0' + (pNow.getMonth() + 1)).slice(-2)") !== -1,
            'месяц инлайн');
        assertTrue(fn.indexOf("('0' + pNow.getDate()).slice(-2)") !== -1,
            'день инлайн');
        assertTrue(fn.indexOf('(pExp < pToday)') !== -1,
            'лексикографическое сравнение ISO (приём Task 380)');
    });

    test('guard «До износа» жив — без span', () => {
        const fn = methodText(INDEX_SRC, '_renderWorkerCard');
        assertTrue(fn.indexOf("pExp !== 'До износа'") !== -1,
            '«До износа» не выделяется');
    });
});

// ============================================================
// 4. VM — рендер карточки: ok/bad по датам
// ============================================================
function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

function cardHost(ppe) {
    const EMP = [
        { 'таб_номер': '2706', 'ФИО': 'Иванов И. И.', 'должность': 'Слесарь КИПиА',
          'категория': 'Дневной' },
    ];
    const host = new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
        '_canEdit: true,' +
        '_year: 2026, _month: 8,' +
        '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
        '_VACATIONS: [],' +
        '_TRAININGS: [],' +
        '_PPE: ' + JSON.stringify(ppe || []) + ',' +
        '_fmtDateRu: function(d) { d = String(d);' +
        '  var p = d.split("-"); return p.length === 3 ?' +
        '  p[2] + "." + p[1] + "." + p[0] : d; },' +
        '_esc: function(s) { return String(s); },' +
        '_escAttr: function(s) { return String(s); },' +
        '_trainingCodeOf: function(t) { return "И"; },' +
        '_statusMeta: function(c) { return {}; }' +
        '});')(mockDoc({}));
    return host;
}

describe('Task 444 — VM: карточка, цвета даты окончания', () => {

    // «сегодня» в ISO (граница ok/bad — вычисляется ТАК ЖЕ, как в
    // рендере; дата ровно «сегодня» — ещё ДЕЙСТВУЕТ → ok)
    const now = new Date();
    const todayIso = now.getFullYear() + '-' +
        ('0' + (now.getMonth() + 1)).slice(-2) + '-' +
        ('0' + now.getDate()).slice(-2);
    const todayRu = todayIso.split('-')[2] + '.' +
        todayIso.split('-')[1] + '.' + todayIso.split('-')[0];

    const PPE = [
        { id: 1, 'таб_номер': '2706', наименование: 'Костюм для защиты от растворов кислот и щелочей',
          дата_выдачи: '2026-08-17', срок_годности: '1 год',
          дата_окончания: '2027-08-17', примечание: '' },
        { id: 2, 'таб_номер': '2706', наименование: 'Перчатки резиновые',
          дата_выдачи: '2024-01-01', срок_годности: '1 год',
          дата_окончания: '2025-01-01', примечание: '' },
        { id: 3, 'таб_номер': '2706', наименование: 'Очки закрытые',
          дата_выдачи: '', срок_годности: 'До износа',
          дата_окончания: 'До износа', примечание: '' },
        { id: 4, 'таб_номер': '2706', наименование: 'Каска защитная',
          дата_выдачи: '', срок_годности: '', дата_окончания: '', примечание: '' },
        { id: 5, 'таб_номер': '2706', наименование: 'Респиратор',
          дата_выдачи: '2026-09-01', срок_годности: '1 год',
          дата_окончания: todayIso, примечание: '' },
    ];

    test('действующий срок — ЗЕЛЁНЫЙ (ws-ppe-exp-ok)', () => {
        const host = cardHost(PPE);
        const html = host._renderWorkerCard('2706', true, true)[3];
        assertTrue(html.indexOf('<span class="ws-ppe-exp ws-ppe-exp-ok">до 17.08.2027</span>') !== -1,
            'запись 1 — будущая дата, зелёный');
    });

    test('просроченный срок — ОРАНЖЕВО-КРАСНЫЙ (ws-ppe-exp-bad)', () => {
        const host = cardHost(PPE);
        const html = host._renderWorkerCard('2706', true, true)[3];
        assertTrue(html.indexOf('<span class="ws-ppe-exp ws-ppe-exp-bad">до 01.01.2025</span>') !== -1,
            'запись 2 — прошлая дата, оранжево-красный');
    });

    test('граница: дата ровно «сегодня» — ещё действует (ok)', () => {
        const host = cardHost(PPE);
        const html = host._renderWorkerCard('2706', true, true)[3];
        assertTrue(html.indexOf('<span class="ws-ppe-exp ws-ppe-exp-ok">до ' + todayRu + '</span>') !== -1,
            '«до сегодня» — зелёный (строго раньше «сегодня» — просрочено)');
    });

    test('«До износа» и без даты — БЕЗ выделения', () => {
        const host = cardHost(PPE);
        const html = host._renderWorkerCard('2706', true, true)[3];
        // ровно ТРИ выделенные записи (1 ok, 2 bad, 5 ok-сегодня)
        assertEqual(html.split('ws-ppe-exp ').length - 1, 3,
            'span ws-ppe-exp — только у записей с датой (не «До износа»/пусто)');
        assertTrue(html.indexOf('срок До износа') !== -1,
            '«До износа» — обычная мета (регресс Task 392)');
    });

    test('имя и мета — классы на месте (структура блока жива)', () => {
        const host = cardHost(PPE);
        const html = host._renderWorkerCard('2706', true, true)[3];
        assertTrue(html.indexOf('ws-ppe-name') !== -1, 'класс имени');
        assertTrue(html.indexOf('ws-ppe-meta') !== -1, 'класс мета-строки');
        assertTrue(html.indexOf('выдано 17.08.2026') !== -1,
            'дата выдачи (регресс Task 392)');
        assertTrue(html.indexOf('срок 1 год') !== -1, 'срок годности');
    });
});

// ============================================================
// 5. SW — версия кэша
// ============================================================
describe('Task 444 — SW: версия кэша', () => {

    test('SW: kipia-test-v750', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v750'") !== -1,
            'SWVersion bumped');
        assertTrue(SW_SRC.indexOf('kipia-test-v751') === -1,
            'двойного бампа не было');
    });

    test('SW: комментарий Task 444 в истории версий', () => {
        assertTrue(SW_SRC.indexOf('Task 444') !== -1,
            'комментарий задачи');
        assertTrue(SW_SRC.indexOf('ПРИГЛУШЕНО') !== -1,
            'описание инверсии яркости');
    });
});
