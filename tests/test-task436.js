// ============================================================
// Task 436 — заявка (kip8test): «В разделе расходомеров
// хозрасчётных, в полных карточках расходомеров, график должен
// строится по логике - все значения относительно между собой до
// 100%, но если есть значения, которые больше в два раза и выше
// чем среднее значение остальных, то все меньше него значения
// отображаются относительно до 80% от общего 100% размера, а
// большие значения отображаются от 80 до 100%. То есть все
// значения делятся на две группы, малые и большие значения, малые
// относительно друг друга отображаются по размерам диаграммы от 0%
// до 80%, а большие отображаются минимум это 80%, а максимум 100%
// относительно друг друга по размеру графика».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   КЛИЕНТ (SRC):
//   1) расчёт групп: значения показанных записей, «большое» =
//      ≥ 2 × среднего ОСТАЛЬНЫХ (среднее остальных > 0);
//      twoScale только когда есть ОБЕ группы;
//   2) полосы: малые — Math.max(5, (v − minS)/(maxS − minS) × 80)
//      (пол 5% Task 226 сохранён), большие — 80 + (v − minB)/
//      (maxB − minB) × 20; равные/единственные в группе —
//      середина полосы (40% / 90%);
//   3) прежняя нормализация 0–100% (Task 224/226) и плоская 60%
//      сохранены; окно 31 записи и источники данных не тронуты.
//   VM (клиент, _buildArchiveChart целиком):
//   4) без выброса [10,11,12,13] → прежние высоты 5/33.3/66.7/100;
//   5) выброс [10,11,12,300] → 5/40/80 + 90 (одиночный большой —
//      середина полосы 80–100);
//   6) равные малые + большой [5,5,5,100] → 40/40/40 + 90;
//   7) два больших [1,1,10,12] → 40/40 + 80/100 (диапазон 80–100);
//   8) ровно 2× среднего [1,2,3] → тоже две группы (граница ≥);
//   9) нулевые остальные [0,0,5] → БЕЗ групп (avgOthers = 0),
//      прежняя нормализация 5/5/100;
//  10) менее 2× [10,15] → прежняя нормализация 5/100;
//  11) все равны [7,7,7] → плоская 60/60/60;
//  12) одна запись — графика нет; записи вне окна 31 не влияют.
//   SW: kipia-test-v750 (главный), v660 — прежней нет.
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
    return s.replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:'"\\/])\/\/[^\n]*/g, '$1');
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// ============================================================
// 1. SRC — маркеры правки
// ============================================================
describe('Task 436 — SRC: шкала двух групп графика', () => {

    function chartBody() {
        return stripComments(methodText(INDEX_SRC, '_buildArchiveChart'));
    }

    test('детекция «больших»: ≥ 2 × среднего ОСТАЛЬНЫХ показанных', () => {
        const body = chartBody();
        assertTrue(body.indexOf('vals.length > 1') !== -1,
            'среднее остальных — только когда записей больше одной');
        assertTrue(body.indexOf('(vSum - vals[bv]) / (vals.length - 1)') !== -1,
            'среднее ОСТАЛЬНЫХ (без самого значения)');
        assertTrue(body.indexOf('avgOthers > 0 && vals[bv] >= 2 * avgOthers') !== -1,
            '«большое» = ≥ 2 × среднего остальных (нулевые остальные не считаются)');
        assertTrue(body.indexOf('var twoScale = (bigCount > 0 && bigCount < vals.length);') !== -1,
            'две группы — только когда есть ОБЕ (малые и большие)');
    });

    test('границы групп считаются по ПОКАЗАННЫМ записям (окно 31)', () => {
        const body = chartBody();
        assertTrue(body.indexOf('chartRecords = records.slice(0, 31).reverse()') !== -1,
            'окно последних 31 записи сохранено (Task 286/288)');
        const iVals = body.indexOf('var vals = [];');
        const iChart = body.indexOf('var chartRecords = records.slice(0, 31)');
        assertTrue(iChart !== -1 && iVals !== -1 && iVals > iChart,
            'значения групп — ПОСЛЕ среза показанных записей');
        assertTrue(body.indexOf('vals.push(pickValue(chartRecords[cv]))') !== -1,
            'значения — из показанных записей');
    });

    test('полосы: малые 0–80% (пол 5%), большие 80–100%', () => {
        const body = chartBody();
        assertTrue(body.indexOf('Math.max(5, ((val - minS) / (maxS - minS)) * 80)') !== -1,
            'малые: (v − minS)/(maxS − minS) × 80 с полом 5% (Task 226 жив)');
        assertTrue(body.indexOf('(80 + ((val - minB) / (maxB - minB)) * 20)') !== -1,
            'большие: 80 + (v − minB)/(maxB − minB) × 20');
        assertTrue(body.indexOf('if (twoScale && isBig[j])') !== -1 &&
                   body.indexOf('} else if (twoScale) {') !== -1,
            'высота бара — по СВОЕЙ группе');
    });

    test('равные/единственные в группе — середина своей полосы', () => {
        const body = chartBody();
        assertTrue(body.indexOf('? 90') !== -1,
            'единственный/равные большие — 90% (середина полосы 80–100)');
        assertTrue(body.indexOf('? 40') !== -1,
            'равные малые — 40% (середина полосы 0–80)');
    });

    test('прежняя нормализация 0–100% и плоская линия НЕ тронуты', () => {
        const body = chartBody();
        assertTrue(body.indexOf('Math.max(5, ((val - minVal) / range) * 100)') !== -1,
            'Task 224: (val − minVal)/range × 100 сохранён (ветка без больших)');
        assertTrue(body.indexOf('barPct = 60;') !== -1,
            'плоская линия 60% сохранена');
        assertTrue(body.indexOf('_isDailyMode') !== -1 &&
                   body.indexOf('pickValue') !== -1 &&
                   body.indexOf('r.consumption') !== -1 &&
                   body.indexOf('r.curr') !== -1,
            'источники данных (Task 223/228) не тронуты');
        assertTrue(body.indexOf("'Показания (посуточно)'") !== -1 &&
                   body.indexOf("'Расход'") !== -1,
            'заголовки (Task 292) не тронуты');
    });
});

// ============================================================
// 2. VM — высоты баров
// ============================================================
function chartHost() {
    return new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_buildArchiveChart') + ',' +
        '_isDailyMode: function(m) { return false; },' +
        '_fmtNum: function(v) { return String(Math.round(v * 100) / 100); },' +
        '_fmtDateShort: function(d) { return String(d); },' +
        '_esc: function(s) { return String(s); }' +
        '});')(mockDoc({}));
}

// записи — НОВЫЕ ПЕРВЫЕ (как в архиве), consumption — значение бара
function recs(vals) {
    return vals.map(function(v, i) {
        return { dateCurr: '9/' + (vals.length - i) + '/2026', consumption: v, curr: v };
    });
}

function heights(html) {
    const out = [];
    const re = /height:([\d.]+)%/g;
    let m;
    while ((m = re.exec(html)) !== null) out.push(parseFloat(m[1]));
    return out;
}

function approx(a) {
    return a.map(function(x) { return Math.round(x * 10) / 10; });
}

describe('Task 436 — VM: высоты баров', () => {

    test('без выброса [10,11,12,13] — прежняя нормализация', () => {
        const html = chartHost()._buildArchiveChart(recs([13, 12, 11, 10]), { unit: 'м³' });
        assertEqual(JSON.stringify([5, 33.3, 66.7, 100]), JSON.stringify(approx(heights(html))),
            'Task 224/226: min→5, max→100');
    });

    test('выброс [10,11,12,300] — малые в 0–80, большой в 80–100', () => {
        const html = chartHost()._buildArchiveChart(recs([300, 12, 11, 10]), { unit: 'м³' });
        assertEqual(JSON.stringify([5, 40, 80, 90]), JSON.stringify(approx(heights(html))),
            'малые 5/40/80 (относительно друг друга), одиночный большой — 90');
    });

    test('равные малые + большой [5,5,5,100] — малые серединой полосы', () => {
        const html = chartHost()._buildArchiveChart(recs([100, 5, 5, 5]), { unit: 'м³' });
        assertEqual(JSON.stringify([40, 40, 40, 90]), JSON.stringify(approx(heights(html))),
            'равные малые — 40, одиночный большой — 90');
    });

    test('два больших [1,1,10,12] — диапазон 80–100 внутри группы', () => {
        const html = chartHost()._buildArchiveChart(recs([12, 10, 1, 1]), { unit: 'м³' });
        assertEqual(JSON.stringify([40, 40, 80, 100]), JSON.stringify(approx(heights(html))),
            'равные малые — 40; большой 10 → 80 (минимум полосы), 12 → 100');
    });

    test('ровно 2× среднего остальных [1,2,3] — тоже две группы', () => {
        const html = chartHost()._buildArchiveChart(recs([3, 2, 1]), { unit: 'м³' });
        assertEqual(JSON.stringify([5, 80, 90]), JSON.stringify(approx(heights(html))),
            '3 ≥ 2 × avg(1,2)=1.5 → большой; граница включительно');
    });

    test('нулевые остальные [0,0,5] — БЕЗ групп (прежняя нормализация)', () => {
        const html = chartHost()._buildArchiveChart(recs([5, 0, 0]), { unit: 'м³' });
        assertEqual(JSON.stringify([5, 5, 100]), JSON.stringify(approx(heights(html))),
            'avgOthers = 0 → «вдвое больше нуля» не считается');
    });

    test('менее 2× [10,15] — прежняя нормализация', () => {
        const html = chartHost()._buildArchiveChart(recs([15, 10]), { unit: 'м³' });
        assertEqual(JSON.stringify([5, 100]), JSON.stringify(approx(heights(html))),
            '15 < 2 × 10 — выброса нет');
    });

    test('все равны [7,7,7] — плоская линия 60%', () => {
        const html = chartHost()._buildArchiveChart(recs([7, 7, 7]), { unit: 'м³' });
        assertEqual(JSON.stringify([60, 60, 60]), JSON.stringify(approx(heights(html))),
            'Task 224: плоский случай не тронут');
    });

    test('одна запись — графика нет', () => {
        const html = chartHost()._buildArchiveChart(recs([5]), { unit: 'м³' });
        assertEqual('', html, 'меньше двух записей — без графика');
    });

    test('значения ВНЕ окна 31 записи на график не влияют', () => {
        // 31 показанная: [1×30, 100]; за окном (старые) — 1000
        const vals = [100];
        for (let i = 0; i < 30; i++) vals.push(1);
        vals.push(1000); // 32-я запись — за окном
        const html = chartHost()._buildArchiveChart(recs(vals), { unit: 'м³' });
        const h = approx(heights(html));
        assertEqual(31, h.length, 'ровно 31 бар');
        // показанный 100 — единственный большой: 90; показанные 1 — малые: 40
        assertEqual(40, h[0], 'первый показанный (старейший) — малый 40');
        assertEqual(90, h[30], 'последний показанный (новейший, 100) — большой 90');
        assertFalse(h.indexOf(100) !== -1,
            'высоты 100% нет — запись 1000 за окном НЕ сжала показанные бары');
    });

    test('подсказка бара показывает ФАКТИЧЕСКОЕ значение, не процент', () => {
        const html = chartHost()._buildArchiveChart(recs([300, 12, 11, 10]), { unit: 'м³' });
        assertTrue(html.indexOf('>300<') !== -1,
            'тип большого бара — 300 (реальное значение)');
        assertTrue(html.indexOf('>10<') !== -1,
            'тип малого бара — 10');
        assertFalse(html.indexOf('>90<') !== -1,
            'процент в типе не показывается');
    });
});

// ============================================================
// 3. SW — версия кэша
// ============================================================
describe('Task 436 — SW: версия kipia-test-v750', () => {
    test('CACHE_VERSION = kipia-test-v750, прежней v660 нет', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v750'") !== -1,
            'CACHE_VERSION = kipia-test-v750');
        assertFalse(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v660'") !== -1,
            'v660 как активная версия больше не существует');
    });
});
