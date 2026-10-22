// tests/test-task485.js
// Task 485 — заявка пользователя: «Во вкладке блокировок вид
// обслуживания не "Кан. ремонт" а "Кап. ремонт". Во вкладке клапана
// убери текущие графики и подсчёты, и сделай новые (круговые) по
// количеству отсечных, регулирующих (это где есть "Рег" или "рег."),
// сколько дисковых затворов по столбцу "Тип запорной части.
// Материал затвора/ корпуса" а остальные как просто "Клапана" тоже
// сколько, сколько по Ду, сколько футированых. Во вкладке регуляторов
// убери текущие графики и подсчёты, и сделай новые (круговые) по
// количеству Производство, Устроиство регулятора или ручного
// управления, Параметр (унифицировать по регулируемой величине,
// например температура, давление, уровень, расход, концентрация,
// ручное управление, частота на частотных преобразователях ЧП и тек
// далее). И сделай их по раскраске и стилю как во вкладках приборы и
// блокировки, все вкладки в одном стиле. Сразу обнови и в kip8.»
//
// РЕШЕНИЕ (2 файла + данные; перенос в kip8 — сразу по команде):
//   (а) «Кап. ремонт»: sync-lockouts.py PPR_TYPE_NAMES + точечная
//       правка data/lockouts.json (1 строка, байт-в-байт по остальному);
//   (б) вкладки «Клапана»/«Регуляторы» — КРУГОВЫЕ диаграммы (SVG):
//       та же «документная» белая карточка .ppr-tc-card и палитра
//       Excel accent1-6/+40% (Task 483/484 — «все вкладки в одном
//       стиле»); сектора от 12 часов по часовой (как Excel), подписи
//       процентов снаружи у секторов >= 5.5%, легенда: свотч +
//       название + количество + процент;
//   (в) Клапана (3 пирога): по типам (Дисковые затворы по столбцу
//       «Тип запорной части. Материал затвора/ корпуса» — ПЕРВЫМИ:
//       у всех дисковых Тип = «Запорно-рег.», категория «Регулирую-
//       щие» вырезала бы их; затем «Отс»/«Рег|рег» по «Тип,
//       пропускная характеристика»; прочие — «Клапана» — строка
//       легенды даже при 0: заявка «тоже сколько»); по Ду («?»/пусто
//       → «Ду не указан»; сортировка по количеству, затем по числу);
//       футированные («футирован|футерован» в запорной части);
//   (г) Регуляторы (3 пирога): по производствам; по устройствам
//       («Устроиство…» — написание листа); по параметрам —
//       унификация по регулируемой величине (правила первого
//       совпадения, регистронезависимо; опечатки листа «Давыление»/
//       «Уровнень» учтены; «Дозировка» ~ расход; «Прочие» —
//       дискретные операции: подача/слив/отсекатели/обогрев…);
//   (д) ЛИШНЕЕ УДАЛЕНО: сводная статистика (var totalItems,
//       .chart-stats-*/.chart-stat-*), Топ-10 бары (_renderBarChart,
//       .chart-bar-*/.chart-card*) и _groupLabel/_avgPerProd —
//       заявка «убери текущие графики и подсчёты»;
//   SW: kipia-test-v755 (логика SW не менялась; окна истории
//       расширены scripts/task485-windows.py; бамп tests —
//       scripts/task485-bump-sw.py; OWN-файл — этот тест).
//   АДАПТАЦИИ: test-task484.js («Кап. ремонт» x8, тест «стат-код
//   удалён», якоря срезов _renderValvesPies), test-task483.js
//   (якорь среза _renderContent).
//
// Запуск: через tests/run-all.js (require './test-task485.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const CHARTS_SRC = fs.readFileSync(path.join(ROOT, 'charts-desktop.js'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const SYNC_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'sync-lockouts.py'), 'utf8');
const LOCKOUTS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'lockouts.json'), 'utf8'));
const VALVES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'valves.json'), 'utf8'));
const REGS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regulators.json'), 'utf8'));

// Извлечь метод объекта по имени («name: function(» … парные скобки)
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

function reviveMethod(src, name) {
    const m = extractMethod(src, name);
    if (!m) return null;
    // eslint-disable-next-line no-eval
    return eval('({' + m + '})')[name];
}

function countOccurrences(haystack, needle) {
    return haystack.split(needle).length - 1;
}

// Мок-хост с живыми методами механики круговых (как в 483/484)
function makePieHost() {
    return {
        _renderPieCard: reviveMethod(CHARTS_SRC, '_renderPieCard'),
        _renderValvesPies: reviveMethod(CHARTS_SRC, '_renderValvesPies'),
        _renderRegulatorsPies: reviveMethod(CHARTS_SRC, '_renderRegulatorsPies'),
        _countByField: reviveMethod(CHARTS_SRC, '_countByField'),
        _classifyRegParam: reviveMethod(CHARTS_SRC, '_classifyRegParam'),
        _pcPct: reviveMethod(CHARTS_SRC, '_pcPct'),
        _escHtml: reviveMethod(CHARTS_SRC, '_escHtml'),
        _PC_PALETTE: ['#4F81BD', '#C0504D', '#9BBB59', '#8064A2', '#4BACC6', '#F79646',
                      '#8DB4E2', '#D99694', '#C3D69B', '#B1A0C7', '#92CDDC', '#FDC08A'],
        _V_TYPE_FIELD: 'Тип, пропускная характеристика',
        _V_ZAP_FIELD: 'Тип запорной части. Материал затвора/ корпуса',
        _V_DN_FIELD: 'DN (мм)',
        _R_PROD_FIELD: 'Производство',
        _R_UST_FIELD: 'Устроиство регулятора или ручного управления',
        _R_PAR_FIELD: 'Параметр',
        _REG_PARAM_RULES: [
            { name: 'Температура', rx: /температур|\btic\b/i },
            { name: 'Давление', rx: /давлени|давылен/i },
            { name: 'Уровень', rx: /уровен|уровн/i },
            { name: 'Расход', rx: /расход|\bfirc\b|дозировк/i },
            { name: 'Концентрация', rx: /концентрац/i },
            { name: 'Частота (ЧП)', rx: /частот|чп/i },
            { name: 'Ручное управление', rx: /ручн/i }
        ]
    };
}

// ==========================================================================
// 1. «Кап. ремонт» — sync-lockouts.py + data/lockouts.json
// ==========================================================================
describe('Task 485: Кап. ремонт (блокировки)', () => {
    test('PPR_TYPE_NAMES: «Кр» → «Кап. ремонт»', () => {
        assertTrue(SYNC_SRC.indexOf("PPR_TYPE_NAMES = {'Кр': 'Кап. ремонт', 'ТО': 'Тех. обслуж.'}") !== -1,
            'опечатка «Кан. ремонт» исправлена');
    });

    test('«Кан. ремонт» не осталось ни в скрипте, ни в данных', () => {
        assertTrue(SYNC_SRC.indexOf('Кан. ремонт') === -1, 'sync-lockouts.py чист');
        assertTrue(JSON.stringify(LOCKOUTS_JSON).indexOf('Кан. ремонт') === -1,
            'lockouts.json чист');
        assertTrue(CHARTS_SRC.indexOf('Кан. ремонт') === -1, 'charts-desktop.js чист');
    });

    test('lockouts.json: имя серии Кр = «Кап. ремонт» (точечная правка)', () => {
        const ppr = LOCKOUTS_JSON.ppr_chart;
        assertEqual(ppr.series[0].code, 'Кр');
        assertEqual(ppr.series[0].name, 'Кап. ремонт');
        assertEqual(ppr.series[1].code, 'ТО');
        assertEqual(ppr.series[1].name, 'Тех. обслуж.');
    });

    test('данные блокировок не задеты (значения/структура прежние)', () => {
        const ppr = LOCKOUTS_JSON.ppr_chart;
        // Task 540: авто-синк f42423f5 (20.10.2026) — 531 → 529; Task 542: авто-синк c60c426b (21.10.2026) — 529 → 528
        assertEqual(LOCKOUTS_JSON.total_lockouts, 528, 'total прежний');
        assertEqual(LOCKOUTS_JSON.lockouts.length, 528, 'массив прежний');
        assertEqual(ppr.series[0].values.length, 12, '12 значений Кр');
        const sumKr = ppr.series[0].values.reduce((a, b) => a + b, 0);
        assertTrue(sumKr > 0 && sumKr <= LOCKOUTS_JSON.total_lockouts,
            'Кр ' + sumKr + ' ≤ 531 (правка — только имя)');
    });
});

// ==========================================================================
// 2. charts-desktop.js — структура: диспетчер, удаления, механика
// ==========================================================================
describe('Task 485: charts-desktop.js — структура', () => {
    test('СТАРОЕ УДАЛЕНО: сводная статистика и Топ-10 бары', () => {
        // заявка: «убери текущие графики и подсчёты»
        for (const lit of ['var totalItems', '_renderBarChart: function',
                           'this._renderBarChart', '_groupLabel: function',
                           '_avgPerProd: function']) {
            assertTrue(CHARTS_SRC.indexOf(lit) === -1, 'удалено: ' + lit);
        }
    });

    test('мёртвый CSS старых баров/статистики удалён (правила «имя {»)', () => {
        for (const cls of ['.chart-card {', '.chart-card-title {', '.chart-card-body {',
                           '.chart-bar-row {', '.chart-bar-label {', '.chart-bar-track {',
                           '.chart-bar-fill {', '.chart-bar-value {',
                           '.chart-stats-grid {', '.chart-stat-card {',
                           '.chart-stat-value {', '.chart-stat-label {']) {
            assertTrue(CHARTS_SRC.indexOf(cls) === -1, 'CSS-правило удалено: ' + cls);
        }
    });

    test('_renderContent — ДИСПЕТЧЕР: ветка valves/regulators', () => {
        const seg = CHARTS_SRC.slice(CHARTS_SRC.indexOf('_renderContent: function'),
                                     CHARTS_SRC.indexOf('_renderValvesPies: function'));
        assertTrue(seg.indexOf("if (tab === 'devices' || tab === 'lockouts')") !== -1,
            'ветка ППР (483/484) жива');
        assertTrue(seg.indexOf("if (tab === 'valves' || tab === 'regulators')") !== -1,
            'ветка круговых (485)');
        assertTrue(seg.indexOf('this._renderValvesPies(items)') !== -1,
            'клапана → круговые');
        assertTrue(seg.indexOf('this._renderRegulatorsPies(items)') !== -1,
            'регуляторы → круговые');
        assertTrue(seg.indexOf("'клапанам'") !== -1 && seg.indexOf("'регуляторам'") !== -1,
            'фолбэк без данных для обеих вкладок');
    });

    test('рендереры круговых объявлены', () => {
        assertTrue(CHARTS_SRC.indexOf('_renderPieCard: function(title, rows)') !== -1,
            'карточка-пирог');
        assertTrue(CHARTS_SRC.indexOf('_renderValvesPies: function(items)') !== -1,
            'клапана');
        assertTrue(CHARTS_SRC.indexOf('_renderRegulatorsPies: function(items)') !== -1,
            'регуляторы');
        assertTrue(CHARTS_SRC.indexOf('_countByField: function(items, field)') !== -1,
            'счётчик по полю');
        assertTrue(CHARTS_SRC.indexOf('_classifyRegParam: function(s)') !== -1,
            'классификатор параметров');
    });

    test('палитра Excel: accent1-6 + осветлённые +40% (стиль Приборов)', () => {
        // «сделай их по раскраске и стилю как во вкладках приборы и
        // блокировки»: accent4-6 доблётвляют тройку 483 до цикла Excel
        const m = CHARTS_SRC.match(/_PC_PALETTE: \[([^\]]*)\]/);
        assertTrue(!!m, 'массив палитры найден');
        for (const c of ['#4F81BD', '#C0504D', '#9BBB59', '#8064A2', '#4BACC6', '#F79646',
                         '#8DB4E2', '#D99694', '#C3D69B', '#B1A0C7', '#92CDDC', '#FDC08A']) {
            assertTrue(m && m[1].indexOf(c) !== -1, 'цвет ' + c);
        }
    });

    test('CSS Task 485 — третий style-блок (pc-*)', () => {
        assertTrue(CHARTS_SRC.indexOf('chartsDesktopCss485') !== -1, 'id style-элемента');
        assertTrue(CHARTS_SRC.indexOf('css485') !== -1, 'массив правил');
        for (const cls of ['.pc-title {', '.pc-body {', '.pc-svg {', '.pc-legend {',
                           '.pc-li {', '.pc-swatch {', '.pc-name {', '.pc-cnt {',
                           '.pc-pct {', '.pc-slice-lbl {']) {
            assertTrue(CHARTS_SRC.indexOf(cls) !== -1, 'правило ' + cls);
        }
        // карточка пирога = та же «документная» белая карточка 483/484
        assertTrue(CHARTS_SRC.indexOf('ppr-tc-card') !== -1, 'класс карточки переиспользуется');
    });

    test('порог наружных подписей: 5.5% (анти-наложение)', () => {
        assertTrue(CHARTS_SRC.indexOf('if (frac >= 0.055)') !== -1,
            'подписи только у крупных секторов');
    });

    test('КЛАПАНА — классификация по заявке (порядок: дисковые первыми)', () => {
        // все 28 дисковых имеют Тип «Запорно-рег.» — категория
        // «Регулирующие» вырезала бы их; заявка считает их отдельной
        // категорией «по столбцу» — поэтому проверка дисковых ПЕРВОЙ
        const iDisk = CHARTS_SRC.indexOf("zap.indexOf('дисков') !== -1");
        const iOtc = CHARTS_SRC.indexOf("tip.indexOf('отс') !== -1");
        const iReg = CHARTS_SRC.indexOf("tip.indexOf('рег') !== -1");
        assertTrue(iDisk !== -1 && iOtc !== -1 && iReg !== -1, 'все три ветки есть');
        assertTrue(iDisk < iOtc && iOtc < iReg, 'порядок: дисков → отс → рег');
        // «Клапана» — всегда строка легенды (заявка: «тоже сколько»)
        assertTrue(CHARTS_SRC.indexOf("{ name: 'Клапана', count: 0 }") !== -1,
            'категория «Клапана» объявлена');
        // «?»/пусто → «Ду не указан»
        assertTrue(CHARTS_SRC.indexOf("'Ду не указан'") !== -1, 'метка Ду не указан');
        // футированные
        assertTrue(CHARTS_SRC.indexOf("футирован") !== -1 &&
                   CHARTS_SRC.indexOf('футерован') !== -1, 'футирован|футерован');
    });

    test('РЕГУЛЯТОРЫ — унификация параметров по величине (правила)', () => {
        const seg = CHARTS_SRC.slice(CHARTS_SRC.indexOf('_REG_PARAM_RULES: ['),
                                     CHARTS_SRC.indexOf('_classifyRegParam: function'));
        for (const nm of ["'Температура'", "'Давление'", "'Уровень'", "'Расход'",
                          "'Концентрация'", "'Частота (ЧП)'", "'Ручное управление'"]) {
            assertTrue(seg.indexOf(nm) !== -1, 'правило ' + nm);
        }
        // порядок правил: Давление раньше Расхода («Давление (расход)»
        // → Давление), Частота раньше Ручного («Частота … в ручном
        // режиме» → Частота)
        const iP = seg.indexOf("'Давление'"), iF = seg.indexOf("'Расход'");
        const iCh = seg.indexOf("'Частота (ЧП)'"), iR = seg.indexOf("'Ручное управление'");
        assertTrue(iP < iF, 'Давление раньше Расхода');
        assertTrue(iCh < iR, 'Частота раньше Ручного');
        // поля листа (написание «Устроиство» — как в файле)
        assertTrue(CHARTS_SRC.indexOf("'Устроиство регулятора или ручного управления'") !== -1,
            'поле устройств — написание листа');
        // «Прочие» — последней категорией пирога
        const segR = CHARTS_SRC.slice(CHARTS_SRC.indexOf('_renderRegulatorsPies: function'),
                                      CHARTS_SRC.indexOf('initEntryButton'));
        assertTrue(segR.indexOf("parRows.push({ name: 'Прочие', count: parMap['Прочие'] })") !== -1,
            'Прочие добавляются после правил');
    });

    test('титулы карточек — стиль «Количество …»', () => {
        assertTrue(CHARTS_SRC.indexOf("'Количество КЛАПАНОВ по типам'") !== -1);
        assertTrue(CHARTS_SRC.indexOf("'Количество КЛАПАНОВ по Ду'") !== -1);
        assertTrue(CHARTS_SRC.indexOf("'Количество футированных КЛАПАНОВ'") !== -1);
        assertTrue(CHARTS_SRC.indexOf("'Количество РЕГУЛЯТОРОВ по производствам'") !== -1);
        assertTrue(CHARTS_SRC.indexOf("'Количество РЕГУЛЯТОРОВ по устройствам (регулятора или ручного управления)'") !== -1);
        assertTrue(CHARTS_SRC.indexOf("'Количество РЕГУЛЯТОРОВ по параметрам (регулируемой величине)'") !== -1);
    });
});

// ==========================================================================
// 3. VM: _renderPieCard — механика SVG-пирога (моки)
// ==========================================================================
describe('Task 485: VM — _renderPieCard (крайние случаи)', () => {
    const host = makePieHost();

    test('обычный пирог: 3 сектора + 3 строки легенды + проценты', () => {
        const h = host._renderPieCard('Тест', [
            { name: 'A', count: 4 }, { name: 'B', count: 3 }, { name: 'C', count: 3 }
        ]);
        assertEqual(countOccurrences(h, '<path '), 3, '3 path-сектора');
        assertEqual(countOccurrences(h, 'class="pc-li"'), 3, '3 строки легенды');
        assertTrue(h.indexOf('fill="#4F81BD"') !== -1, 'accent1');
        assertTrue(h.indexOf('fill="#C0504D"') !== -1, 'accent2');
        assertTrue(h.indexOf('fill="#9BBB59"') !== -1, 'accent3');
        assertTrue(h.indexOf('>4</span>') !== -1 && h.indexOf('>3</span>') !== -1,
            'количество в легенде');
        assertTrue(h.indexOf('40%') !== -1 && h.indexOf('30%') !== -1, 'проценты');
        assertTrue(h.indexOf('class="ppr-tc-card"') !== -1, 'документная карточка');
        assertTrue(h.indexOf('class="pc-title"') !== -1, 'титул');
        assertTrue(h.indexOf('role="img"') !== -1, 'svg role=img');
    });

    test('подписи-проценты только у секторов >= 5.5%', () => {
        const h = host._renderPieCard('Тест', [
            { name: 'A', count: 95 }, { name: 'B', count: 3 }, { name: 'C', count: 2 }
        ]);
        assertEqual(countOccurrences(h, 'class="pc-slice-lbl"'), 1,
            'подпись только у 95%');
    });

    test('единственный ненулевой сектор — <circle> (не degenerate-path)', () => {
        const h = host._renderPieCard('Тест', [
            { name: 'A', count: 5 }, { name: 'B', count: 0 }
        ]);
        assertTrue(h.indexOf('<circle ') !== -1, 'круг целиком');
        assertEqual(countOccurrences(h, '<path '), 0, 'без path');
        assertEqual(countOccurrences(h, 'class="pc-li"'), 2, 'легенда полная');
    });

    test('нулевая категория — строка легенды БЕЗ сектора (заявка «тоже сколько»)', () => {
        const h = host._renderPieCard('Тест', [
            { name: 'A', count: 3 }, { name: 'Нулевая', count: 0 }, { name: 'C', count: 2 }
        ]);
        assertEqual(countOccurrences(h, '<path '), 2, '2 сектора');
        assertEqual(countOccurrences(h, 'class="pc-li"'), 3, '3 строки легенды');
        assertTrue(h.indexOf('Нулевая') !== -1, 'название видно');
    });

    test('пустые rows / все нули → пустая строка', () => {
        assertEqual(host._renderPieCard('Т', []), '');
        assertEqual(host._renderPieCard('Т', [{ name: 'A', count: 0 }]), '');
    });

    test('HTML-экранирование названия и титула', () => {
        const h = host._renderPieCard('Титул <тест>', [{ name: 'A<&>B', count: 1 }]);
        assertTrue(h.indexOf('Титул &lt;тест&gt;') !== -1, 'титул экранирован');
        assertTrue(h.indexOf('A&lt;&amp;&gt;B') !== -1, 'название экранировано');
    });

    test('_pcPct: >=10% — целое, меньше — один знак', () => {
        assertEqual(host._pcPct(121, 320), '38%');
        assertEqual(host._pcPct(28, 320), '8.8%');
        assertEqual(host._pcPct(1, 268), '0.4%');
        assertEqual(host._pcPct(0, 10), '0%');
    });

    test('крупный сектор > 50% — largeArc=1', () => {
        const h = host._renderPieCard('Т', [
            { name: 'A', count: 80 }, { name: 'B', count: 20 }
        ]);
        assertTrue(h.indexOf('A82,82 0 1 1') !== -1, 'флаг large у 80%-сектора');
    });
});

// ==========================================================================
// 4. VM: _classifyRegParam — унификация по регулируемой величине
// ==========================================================================
describe('Task 485: VM — _classifyRegParam', () => {
    const host = makePieHost();
    const cl = s => host._classifyRegParam(s);

    test('прямые величины', () => {
        assertEqual(cl('Температура в поз. 513/1-3'), 'Температура');
        assertEqual(cl('TIC в поз. 519/5'), 'Температура');
        assertEqual(cl('Давление пара 5 атм.'), 'Давление');
        assertEqual(cl('Редуцирование давления воздуха КИП до 1,4 кгс/см2'), 'Давление');
        assertEqual(cl('Уровень демводы в ёмкости поз. Д-1'), 'Уровень');
        assertEqual(cl('Расход осветленной воды на мутномер'), 'Расход');
        assertEqual(cl('FIRC воды в поз. 519/5'), 'Расход');
        assertEqual(cl('Концентрация производственных стоков'), 'Концентрация');
        assertEqual(cl('Управление ЧП насоса поз. 112/2'), 'Частота (ЧП)');
        assertEqual(cl('Частота вращения мешалки поз. 14/1'), 'Частота (ЧП)');
        assertEqual(cl('Ручное дистанционное управление сливом'), 'Ручное управление');
    });

    test('опечатки листа и пересечения (порядок правил)', () => {
        assertEqual(cl('Давыление воздуха КИП корпус 114'), 'Давление', 'опечатка «Давыление»');
        assertEqual(cl('Уровнень в поз. 15м/1'), 'Уровень', 'опечатка «Уровнень»');
        assertEqual(cl('Давление (расход) воздуха на эрлифт'), 'Давление',
            'Давление раньше Расхода');
        assertEqual(cl('Частота работы насосов поз. 505н/1, 2 в ручном режиме'), 'Частота (ЧП)',
            'Частота раньше Ручного');
        assertEqual(cl('Дозировка демводы в поз. 7м/1'), 'Расход', 'дозирование ~ расход');
    });

    test('дискретные операции → Прочие; пусто → Прочие', () => {
        assertEqual(cl('Подача воды в режиме "На очистку" рег. клапаном насосов'), 'Прочие');
        assertEqual(cl('Слив ПВС из поз. 11м/1 в поз. 11м/2'), 'Прочие');
        assertEqual(cl('Отсекатель подачи ГОВ в мерник поз. 11'), 'Прочие');
        assertEqual(cl('Электрообогрев буферной емкости поз. 531а'), 'Прочие');
        assertEqual(cl(''), 'Прочие');
        assertEqual(cl(null), 'Прочие');
    });
});

// ==========================================================================
// 5. VM: рендеры вкладок на РЕАЛЬНЫХ данных (инварианты; крон
//    обновляет data/*.json — точные счётчики НЕ проверяем, прецедент
//    478 §6)
// ==========================================================================
describe('Task 485: VM — вкладка «Клапана» (data/valves.json)', () => {
    const host = makePieHost();
    const items = VALVES_JSON.valves;
    const html = host._renderValvesPies(items);

    test('три карточки-пирога', () => {
        assertEqual(countOccurrences(html, 'class="ppr-tc-card"'), 3);
        assertEqual(countOccurrences(html, 'class="pc-svg"'), 3);
    });

    test('ТИПЫ: 4 категории, сумма == всего клапанов', () => {
        // первая карточка — типы; считаем её строки легенды
        const card1 = html.slice(0, html.indexOf('Количество КЛАПАНОВ по Ду'));
        assertEqual(countOccurrences(card1, 'class="pc-li"'), 4,
            'Отсечные/Регулирующие/Дисковые затворы/Клапана');
        for (const nm of ['Отсечные', 'Регулирующие', 'Дисковые затворы', 'Клапана']) {
            assertTrue(card1.indexOf(nm) !== -1, 'категория ' + nm);
        }
        const counts = [...card1.matchAll(/<span class="pc-cnt">(\d+)<\/span>/g)].map(m => +m[1]);
        assertEqual(counts.length, 4);
        assertEqual(counts.reduce((a, b) => a + b, 0), items.length,
            'сумма категорий == ' + items.length);
    });

    test('ТИПЫ: дисковые затворы > 0 (все «Запорно-рег.» — вырезаны из регулирующих)', () => {
        const card1 = html.slice(0, html.indexOf('Количество КЛАПАНОВ по Ду'));
        const counts = [...card1.matchAll(/<span class="pc-cnt">(\d+)<\/span>/g)].map(m => +m[1]);
        assertTrue(counts[2] > 0, 'дисковые ' + counts[2]);
        // сверка с источником: строк с «дисков» в запорной части
        let nDisk = 0;
        for (const it of items) {
            if (((it['Тип запорной части. Материал затвора/ корпуса'] || '') + '')
                .toLowerCase().indexOf('дисков') !== -1) nDisk++;
        }
        assertEqual(counts[2], nDisk, 'дисковые == строкам с «дисков»');
    });

    test('ДУ: строки легенды == уникальным значениям DN (пусто/? → не указан)', () => {
        const card2 = html.slice(html.indexOf('Количество КЛАПАНОВ по Ду'),
                                 html.indexOf('Количество футированных КЛАПАНОВ'));
        const legend = countOccurrences(card2, 'class="pc-li"');
        const uniq = new Set();
        for (const it of items) {
            const v = (it['DN (мм)'] || '').toString().trim();
            uniq.add(!v || v === '?' ? 'Ду не указан' : 'Ду ' + v);
        }
        assertEqual(legend, uniq.size, 'легенда == уникальным Ду');
        assertTrue(card2.indexOf('Ду не указан') !== -1, 'метка не-указан');
        // сортировка: первый — самый частый
        const first = card2.match(/<span class="pc-cnt">(\d+)<\/span>/);
        let maxCnt = 0;
        const cntMap = {};
        for (const it of items) {
            const v = (it['DN (мм)'] || '').toString().trim();
            const k = !v || v === '?' ? 'Ду не указан' : 'Ду ' + v;
            cntMap[k] = (cntMap[k] || 0) + 1;
        }
        for (const k in cntMap) maxCnt = Math.max(maxCnt, cntMap[k]);
        assertEqual(+first[1], maxCnt, 'первая строка — максимум');
    });

    test('ФУТИРОВАННЫЕ: 2 категории, сумма == всего', () => {
        const card3 = html.slice(html.indexOf('Количество футированных КЛАПАНОВ'));
        assertEqual(countOccurrences(card3, 'class="pc-li"'), 2);
        assertTrue(card3.indexOf('Футированные') !== -1 &&
                   card3.indexOf('Не футированные') !== -1);
        const counts = [...card3.matchAll(/<span class="pc-cnt">(\d+)<\/span>/g)].map(m => +m[1]);
        assertEqual(counts.reduce((a, b) => a + b, 0), items.length);
        let nFut = 0;
        for (const it of items) {
            const z = ((it['Тип запорной части. Материал затвора/ корпуса'] || '') + '')
                .toLowerCase();
            if (z.indexOf('футирован') !== -1 || z.indexOf('футерован') !== -1) nFut++;
        }
        assertEqual(counts[0], nFut, 'футированные == строкам с «футирован»');
    });
});

describe('Task 485: VM — вкладка «Регуляторы» (data/regulators.json)', () => {
    const host = makePieHost();
    const items = REGS_JSON.regulators;
    const html = host._renderRegulatorsPies(items);

    test('три карточки-пирога', () => {
        assertEqual(countOccurrences(html, 'class="ppr-tc-card"'), 3);
        assertEqual(countOccurrences(html, 'class="pc-svg"'), 3);
    });

    test('ПРОИЗВОДСТВА: легенда == уникальным производствам', () => {
        const card1 = html.slice(0, html.indexOf('Количество РЕГУЛЯТОРОВ по устройствам'));
        const legend = countOccurrences(card1, 'class="pc-li"');
        const uniq = new Set(items.map(x => (x['Производство'] || '').toString().trim())
            .filter(Boolean));
        assertEqual(legend, uniq.size);
    });

    test('УСТРОЙСТВА: легенда == уникальным устройствам', () => {
        const card2 = html.slice(html.indexOf('Количество РЕГУЛЯТОРОВ по устройствам'),
                                 html.indexOf('Количество РЕГУЛЯТОРОВ по параметрам'));
        const legend = countOccurrences(card2, 'class="pc-li"');
        const uniq = new Set(items.map(x =>
            (x['Устроиство регулятора или ручного управления'] || '').toString().trim())
            .filter(Boolean));
        assertEqual(legend, uniq.size);
    });

    test('ПАРАМЕТРЫ: сумма категорий == всего; «Прочие» — последняя строка', () => {
        const card3 = html.slice(html.indexOf('Количество РЕГУЛЯТОРОВ по параметрам'));
        const rows = [...card3.matchAll(/<span class="pc-name">([^<]*)<\/span>\s*<span class="pc-cnt">(\d+)<\/span>/g)]
            .map(m => ({ name: m[1], count: +m[2] }));
        assertEqual(rows.reduce((a, r) => a + r.count, 0), items.length,
            'сумма == ' + items.length);
        assertEqual(rows[rows.length - 1].name, 'Прочие', 'Прочие последняя');
        const KNOWN = ['Температура', 'Давление', 'Уровень', 'Расход', 'Концентрация',
                       'Частота (ЧП)', 'Ручное управление', 'Прочие'];
        for (const r of rows) assertTrue(KNOWN.indexOf(r.name) !== -1, 'категория ' + r.name);
        // порядок секторов — порядок правил (кроме «Прочие»)
        const order = rows.filter(r => r.name !== 'Прочие').map(r => r.name);
        const expected = KNOWN.slice(0, 7).filter(nm => order.indexOf(nm) !== -1);
        assertEqual(JSON.stringify(order), JSON.stringify(expected),
            'порядок == порядку правил');
    });

    test('ПАРАМЕТРЫ: сверка классификатора с данными (все строки)', () => {
        const map = {};
        for (const it of items) {
            const c = host._classifyRegParam(it['Параметр']);
            map[c] = (map[c] || 0) + 1;
        }
        const card3 = html.slice(html.indexOf('Количество РЕГУЛЯТОРОВ по параметрам'));
        const rows = [...card3.matchAll(/<span class="pc-name">([^<]*)<\/span>\s*<span class="pc-cnt">(\d+)<\/span>/g)]
            .map(m => ({ name: m[1], count: +m[2] }));
        assertEqual(rows.length, Object.keys(map).length, 'категорий столько же');
        for (const r of rows) assertEqual(r.count, map[r.name], r.name);
    });
});

// ==========================================================================
// 6. SW: версия v709 + комментарий Task 485
// ==========================================================================
describe('Task 485: SW — версия и кэши', () => {
    test('CACHE_VERSION = kipia-test-v755', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v755';") !== -1,
            'версия поднята');
    });

    test('v708 в sw.js отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v708') === -1, 'старой версии нет');
    });

    test('v710 в sw.js отсутствует (лишний инкремент не сделан)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v756') === -1);
    });

    test('комментарий Task 485 в шапке версий (окно 1500)', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v755';");
        // Task 502: окно 7600 → 8000 (якорь 7759).
        const ctx = SW_SRC.slice(Math.max(0, i - 9300), i);
        assertTrue(ctx.indexOf('Task 485') !== -1, 'маркер задачи');
        assertTrue(ctx.indexOf('Клапана') !== -1, 'вкладка Клапана');
        assertTrue(ctx.indexOf('Регуляторы') !== -1, 'вкладка Регуляторы');
        assertTrue(ctx.indexOf('круговые') !== -1, 'круговые диаграммы');
        assertTrue(ctx.indexOf('Кап. ремонт') !== -1, 'правка блокировок');
        assertTrue(ctx.indexOf('Логика SW не менялась') !== -1, 'логика не менялась');
    });

    test('charts-desktop.js в ASSETS; данные клапанов/регуляторов — без изменений SW', () => {
        assertTrue(SW_SRC.indexOf("'./charts-desktop.js'") !== -1,
            'модуль графиков кэшируется');
        // valves.json был в ASSETS и ДО задачи (как devices);
        // regulators/lockouts — через DATA-кэш (SWR text-compare
        // подхватит ppr_chart без смены логики SW)
        assertTrue(SW_SRC.indexOf("'./data/valves.json'") !== -1,
            'valves.json в ASSETS (было и до 485)');
        assertFalse(SW_SRC.indexOf("'./data/regulators.json'") !== -1,
            'regulators.json НЕ добавлялся (логика SW не менялась)');
    });

    test('персистентные кэши НЕ инкрементированы', () => {
        assertTrue(SW_SRC.indexOf('kipia-images-test-v3') !== -1, 'IMAGE_CACHE v3');
        assertTrue(SW_SRC.indexOf('kipia-data-test-v1') !== -1, 'DATA_CACHE v1');
    });
});

console.log('test-task485: все describes зарегистрированы');
