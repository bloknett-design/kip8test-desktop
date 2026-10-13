// tests/test-task484.js
// Task 484 — заявка пользователя: «Во вкладке "Блокировки" убери всё
// лишнее и сделай так же оформление и подсчёт, как во вкладке
// "Приборы". И затем перенеси изменения в kip8.»
//
// РЕШЕНИЕ (2 файла + данные; перенос в kip8 — по регламенту):
//   (а) ОФОРМЛЕНИЕ = «Приборы» (Task 483): вкладка «Блокировки»
//       рендерит _renderDevicesPPR (титул «Количество БЛОКИРОВОК по
//       графику ППР по месяцам на <год> год», серии Кр/ТО — бейдж
//       accent1 #8DB4E2 / строка #DBEEF4 у «Кр», штриховка ТО) +
//       фолбэк-сообщение при отсутствии блока; сводная статистика,
//       Топ-10 и старый график ППР (правая ось) — НЕ рендерятся;
//   (б) ПОДСЧЁТ = «Приборы»: счётчики считает sync-lockouts.py →
//       блок ppr_chart в data/lockouts.json по ИСХОДНОМУ листу
//       «Блокировки» (месячные колонки I..XII и «Наличие в перечне
//       и в ППР» есть только на нём, не на «Блокировки_app»):
//       метка месяца == «Кр»/«ТО» (регистронезависимо — «Кр»
//       смешаннорегистровый, в 483 коды были однорегистровыми)
//       И «Наличие в перечне и в ППР» == «Есть» (тот же фильтр
//       заявки Task 483; «Нет»/пусто — мимо). СВЕРЕНО с файлом на
//       2026-10-07: с фильтром Кр 503/ТО 1509 (строк «Есть» 503),
//       без фильтра Кр 531/ТО 1593 — старые заШитые _PPR_LOCKOUTS
//       (Кр 526/ТО 1578) не соответствовали ничему — удалены;
//   (в) ЛИШНЕЕ УДАЛЕНО (charts-desktop.js): _renderPPRChart +
//       _niceMax + _PPR_LOCKOUTS + их CSS (ppr-chart-*, ppr-bar-*,
//       ppr-y-*, ppr-totals-*) — минус ~12,4 КБ;
//   (г) устойчивость: лист «Блокировки» недоступен (экспорт с
//       gid= одного листа) → сохранён прежний ppr_chart.
//   SW: kipia-test-v733 (логика SW не менялась; окна истории
//       расширены scripts/task484-windows.py; бамп tests —
//       scripts/task484-bump-sw.py; OWN-файл — этот тест).
//   АДАПТАЦИИ: test-task473.js (механика мёртвого _renderPPRChart
//   удалена, семантика переведена на _renderDevicesPPR/.ppr-tc-*),
//   test-task483.js (инверсия проверок _renderPPRChart/_PPR_LOCKOUTS,
//   сигнатура с noun).
//
// Запуск: через tests/run-all.js (require './test-task484.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const CHARTS_SRC = fs.readFileSync(path.join(ROOT, 'charts-desktop.js'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const SYNC_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'sync-lockouts.py'), 'utf8');
const LOCKOUTS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'lockouts.json'), 'utf8'));

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

// Мок-хост с живыми методами и константами модуля (как в 483)
function makeHost() {
    return {
        _renderDevicesPPR: reviveMethod(CHARTS_SRC, '_renderDevicesPPR'),
        _escHtml: reviveMethod(CHARTS_SRC, '_escHtml'),
        _MONTHS_ROMAN: ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'],
        _PPR_TC_STYLES: {
            'К':  { suffix: 'k',  bar: '#4F81BD', badge: '#8DB4E2', row: '#DBEEF4' },
            'П':  { suffix: 'p',  bar: '#C0504D', badge: '#D99694', row: '#FDEADA' },
            'ТО': { suffix: 'to', bar: '#9BBB59', badge: '#C3D69B', row: '#EBF1DE' },
            // Task 484: Кр — accent1, как К у приборов
            'Кр': { suffix: 'k',  bar: '#4F81BD', badge: '#8DB4E2', row: '#DBEEF4' }
        },
        _PPR_TC_MONTH_CLS: ['pink','','','','pink','gold','gold','gold','pink','','','pink']
    };
}

function countOccurrences(haystack, needle) {
    return haystack.split(needle).length - 1;
}

// Мок данных = снимок реального ppr_chart блокировок на Task 484
const MOCK_PPR_LOCKOUTS = {
    year: 2026,
    series: [
        { code: 'Кр', name: 'Кап. ремонт', values: [63, 38, 24, 28, 13, 38, 31, 32, 72, 23, 46, 95] },
        { code: 'ТО', name: 'Тех. обслуж.', values: [82, 91, 205, 117, 116, 191, 114, 97, 157, 122, 83, 134] }
    ]
};

// ==========================================================================
// 1. sync-lockouts.py — логика подсчёта ppr_chart (заявка пользователя)
// ==========================================================================
describe('Task 484: sync-lockouts.py — счётчики ППР по месяцам', () => {
    test('parse_ppr_chart существует', () => {
        assertTrue(SYNC_SRC.indexOf('def parse_ppr_chart(') !== -1,
            'функция подсчёта объявлена');
    });

    test('источник — ИСХОДНЫЙ лист «Блокировки» (не _app)', () => {
        // месячные колонки I..XII и «Наличие в перечне и в ППР» есть
        // только на исходном листе (у «Блокировки_app» 13 колонок
        // без месяцев) — прецедент 483 (лист «Приборы», не _app)
        assertTrue(SYNC_SRC.indexOf("PPR_CHART_SHEET = 'Блокировки'") !== -1,
            'лист по умолчанию — «Блокировки»');
        assertTrue(SYNC_SRC.indexOf("parse_ppr_chart(local_file, PPR_CHART_SHEET)") !== -1,
            'вызов из main с явным листом');
    });

    test('фильтр «Наличие в перечне и в ППР» = «Есть» (аналог заявки 483)', () => {
        assertTrue(SYNC_SRC.indexOf("PPR_FILTER_COL = 'Наличие в перечне и в ППР'") !== -1,
            'столбец фильтра объявлен');
        assertTrue(SYNC_SRC.indexOf("!= 'есть'") !== -1,
            'строки != «есть» пропускаются (тот же фильтр, что у приборов)');
        assertTrue(SYNC_SRC.indexOf(".strip().lower()") !== -1,
            'значение нормализуется trim + lower');
    });

    test('месячные колонки I–XII', () => {
        assertTrue(SYNC_SRC.indexOf("PPR_MONTH_COLS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']") !== -1,
            'список 12 месяцев');
    });

    test('виды обслуживания Кр/ТО (коды листа «Блокировки»)', () => {
        assertTrue(SYNC_SRC.indexOf("PPR_TYPES = ['Кр', 'ТО']") !== -1,
            'две серии — как на листе');
        assertTrue(SYNC_SRC.indexOf("PPR_TYPE_NAMES = {'Кр': 'Кап. ремонт', 'ТО': 'Тех. обслуж.'}") !== -1,
            'названия серий');
    });

    test('совпадение кода регистронезависимо («Кр» смешаннорегистровый)', () => {
        // урок прогона: .upper() превращает «Кр» в «КР» и метка
        // перестала совпадать с ключом — нормализуем ОБЕ стороны
        assertTrue(SYNC_SRC.indexOf('type_norm = {t.upper(): t for t in PPR_TYPES}') !== -1,
            'таблица нормализации кодов');
        assertTrue(SYNC_SRC.indexOf('type_norm.get(v)') !== -1,
            'поиск по нормализованному коду');
        assertFalse(SYNC_SRC.indexOf('if v in counts') !== -1 && SYNC_SRC.indexOf('v = str(ws.cell') !== -1 && SYNC_SRC.indexOf('if v in counts:') !== -1,
            'старое точное членство удалено');
    });

    test('блок ppr_chart пишется в lockouts.json', () => {
        assertTrue(SYNC_SRC.indexOf("out['ppr_chart'] = ppr_chart") !== -1,
            'блок добавлен в выход');
        assertTrue(SYNC_SRC.indexOf('ppr_chart пропущен') !== -1,
            'устойчивость: листа нет → блок пропущен');
    });

    test('год = текущий год синка', () => {
        assertTrue(SYNC_SRC.indexOf('year = datetime.now().year') !== -1,
            'год берётся на момент синка');
    });

    test('устойчивость: прежний ppr_chart сохраняется при недоступном листе', () => {
        // экспорт с gid= одного листа — «Блокировки» нет → старый блок жив
        assertTrue(SYNC_SRC.indexOf("json.load(f).get('ppr_chart')") !== -1,
            'чтение прежнего блока');
        assertTrue(SYNC_SRC.indexOf('сохранён прежний блок') !== -1,
            'лог сохранения');
    });
});

// ==========================================================================
// 2. charts-desktop.js — вкладка «Блокировки» = «Приборы»; лишнее удалено
// ==========================================================================
describe('Task 484: charts-desktop.js — структура', () => {
    test('_PPR_LOCKOUTS УДАЛЁН (заШитые счётчики, корень расхождения)', () => {
        // упоминание в некрологе шапки допускается — проверяем
        // отсутствие БЛОКА ДАННЫХ и ИСПОЛЬЗОВАНИЯ
        assertTrue(CHARTS_SRC.indexOf('_PPR_LOCKOUTS: {') === -1,
            'блок заШитых счётчиков удалён');
        assertTrue(CHARTS_SRC.indexOf('this._PPR_LOCKOUTS') === -1,
            'использование удалено');
    });

    test('_renderPPRChart и _niceMax УДАЛЕНЫ (мёртвый код)', () => {
        assertTrue(CHARTS_SRC.indexOf('_renderPPRChart: function') === -1,
            'рендерер старой гистограммы удалён');
        assertTrue(CHARTS_SRC.indexOf('this._renderPPRChart') === -1,
            'вызов удалён');
        assertTrue(CHARTS_SRC.indexOf('_niceMax: function') === -1,
            'помощник осей удалён');
        assertTrue(CHARTS_SRC.indexOf('this._niceMax') === -1,
            'вызов _niceMax удалён');
    });

    test('мёртвый CSS старой гистограммы УДАЛЁН', () => {
        // Проверяем ПРАВИЛА (имя + " {"): упоминания классов в
        // исторических комментариях шапки допускаются (некролог)
        for (const cls of ['.ppr-chart-card', '.ppr-chart-header', '.ppr-legend',
                           '.ppr-y-axis', '.ppr-chart-grid', '.ppr-grid-line',
                           '.ppr-month-group', '.ppr-bars-row', '.ppr-bar-cell',
                           '.ppr-bar-val', '.ppr-totals-row', '.ppr-y-axis-right',
                           '.ppr-legend-axis', '.ppr-month-label']) {
            assertTrue(CHARTS_SRC.indexOf(cls + ' {') === -1,
                'CSS-правило ' + cls + ' удалено');
        }
    });

    test('поле _pprChartLockouts (блок из lockouts.json)', () => {
        assertTrue(CHARTS_SRC.indexOf('_pprChartLockouts: null') !== -1,
            'поле объявлено');
    });

    test('_loadData захватывает ppr_chart для lockouts', () => {
        const seg = CHARTS_SRC.slice(CHARTS_SRC.indexOf('_loadData: function'),
                                     CHARTS_SRC.indexOf('_renderTab: function'));
        assertTrue(seg.indexOf("section === 'lockouts' && data.ppr_chart") !== -1,
            'блок читается из ответа для lockouts');
        assertTrue(seg.indexOf("KipCharts._pprChartLockouts = data.ppr_chart") !== -1,
            'сохраняется в поле модуля');
    });

    test('_renderContent: вкладки devices/lockouts — ОДНА ветка раннего возврата', () => {
        const seg = CHARTS_SRC.slice(CHARTS_SRC.indexOf('_renderContent: function'),
                                     CHARTS_SRC.indexOf('_renderValvesPies: function'));
        assertTrue(seg.indexOf("if (tab === 'devices' || tab === 'lockouts')") !== -1,
            'единая ветка обеих вкладок');
        assertTrue(seg.indexOf('this._pprChartLockouts') !== -1,
            'данные блокировок читаются');
        assertTrue(seg.indexOf("this._renderDevicesPPR(ppr,") !== -1,
            'рендер тот же, что у приборов');
        assertTrue(seg.indexOf("'БЛОКИРОВОК'") !== -1,
            'noun «БЛОКИРОВОК» передаётся');
    });

    test('сводная статистика и Топ-10 НЕ рендерятся для lockouts', () => {
        // Task 485: сводная статистика и Топ-10 бары удалены из
        // charts-desktop.js ЦЕЛИКОМ (заявка 485 по «Клапанам»/
        // «Регуляторам»: «убери текущие графики и подсчёты») — ни
        // одна вкладка их больше не рендерит; для lockouts рендер
        // идёт ТОЛЬКО веткой раннего возврата ppr_chart (484)
        assertTrue(CHARTS_SRC.indexOf('var totalItems') === -1,
            'код сводной статистики удалён (Task 485)');
        assertTrue(CHARTS_SRC.indexOf('_renderBarChart: function') === -1,
            'рендерер Топ-10 баров удалён (Task 485)');
        const iBranch = CHARTS_SRC.indexOf("if (tab === 'devices' || tab === 'lockouts')");
        assertTrue(iBranch !== -1, 'ветка раннего возврата lockouts жива');
    });

    test('фолбэк: понятное сообщение для блокировок', () => {
        const seg = CHARTS_SRC.slice(CHARTS_SRC.indexOf('_renderContent: function'),
                                     CHARTS_SRC.indexOf('_renderValvesPies: function'));
        assertTrue(seg.indexOf("'блокировкам'") !== -1,
            'слово «блокировкам» в фолбэке');
        assertTrue(seg.indexOf('ppr-tc-empty-note') !== -1,
            'класс фолбэка');
    });

    test('стиль «Кр» — accent1 (та же ветка, что «К» приборов)', () => {
        assertTrue(CHARTS_SRC.indexOf("'Кр': { suffix: 'k',  bar: '#4F81BD', badge: '#8DB4E2', row: '#DBEEF4' }") !== -1,
            'код Кр в _PPR_TC_STYLES');
    });

    test('титул параметризован noun (по умолчанию ПРИБОРОВ)', () => {
        assertTrue(CHARTS_SRC.indexOf("'Количество ' + (noun || 'ПРИБОРОВ') + ' по графику ППР по месяцам на ' + year + ' год'") !== -1,
            'титул собирается из данных и noun');
    });
});

// ==========================================================================
// 3. data/lockouts.json — блок ppr_chart (инварианты; крон обновляет
//    данные ежедневно, поэтому НЕ точные счётчики — прецедент 478 §6)
// ==========================================================================
describe('Task 484: lockouts.json — блок ppr_chart', () => {
    const ppr = LOCKOUTS_JSON.ppr_chart;

    test('блок ppr_chart присутствует', () => {
        assertTrue(!!ppr, 'поле есть после синка Task 484');
    });

    test('две серии Кр/ТО в каноническом порядке', () => {
        assertEqual(ppr.series.length, 2, 'две серии');
        assertEqual(ppr.series[0].code, 'Кр');
        assertEqual(ppr.series[0].name, 'Кап. ремонт');
        assertEqual(ppr.series[1].code, 'ТО');
        assertEqual(ppr.series[1].name, 'Тех. обслуж.');
    });

    test('по 12 значений у каждой серии', () => {
        for (const s of ppr.series) assertEqual(s.values.length, 12, s.code);
    });

    test('значения — целые неотрицательные', () => {
        for (const s of ppr.series)
            for (const v of s.values)
                assertTrue(Number.isInteger(v) && v >= 0, s.code + ': ' + v);
    });

    test('Кр не чаще раза на строку (сумма Кр ≤ всего блокировок)', () => {
        // капитальный ремонт ежегоден: сумма Кр ≤ total_lockouts —
        // грубый инвариант против задвоения счётчика
        const sumKr = ppr.series[0].values.reduce((a, b) => a + b, 0);
        assertTrue(sumKr > 0 && sumKr <= LOCKOUTS_JSON.total_lockouts,
            'Кр ' + sumKr + ' ≤ ' + LOCKOUTS_JSON.total_lockouts);
    });

    test('год = 2026 (текущий год данных)', () => {
        assertEqual(ppr.year, 2026);
    });

    test('метаданные фильтра и источника', () => {
        assertEqual(ppr.filter, 'Наличие в перечне и в ППР = Есть');
        assertEqual(ppr.source_sheet, 'Блокировки');
    });

    test('структура lockouts.json не задета (массив и заголовки прежние)', () => {
        assertEqual(LOCKOUTS_JSON.total_lockouts, 531, 'total_lockouts прежний');
        assertEqual(LOCKOUTS_JSON.lockouts.length, 531, 'массив прежний');
        assertEqual(LOCKOUTS_JSON.headers.length, 13, '13 колонок');
        assertEqual(LOCKOUTS_JSON.sheet, 'Блокировки_app', 'лист _app прежний');
    });
});

// ==========================================================================
// 4. VM: _renderDevicesPPR — блокировки (noun «БЛОКИРОВОК», Кр/ТО)
// ==========================================================================
describe('Task 484: VM — _renderDevicesPPR (блокировки)', () => {
    const host = makeHost();
    const html = host._renderDevicesPPR(MOCK_PPR_LOCKOUTS, 'БЛОКИРОВОК');

    test('титул «Количество БЛОКИРОВОК … на 2026 год»', () => {
        assertTrue(html.indexOf('Количество БЛОКИРОВОК по графику ППР по месяцам на 2026 год') !== -1,
            'титул с noun из вызова');
    });

    test('noun по умолчанию — ПРИБОРОВ (обратная совместимость)', () => {
        const h2 = host._renderDevicesPPR(MOCK_PPR_LOCKOUTS);
        assertTrue(h2.indexOf('Количество ПРИБОРОВ по графику ППР по месяцам на 2026 год') !== -1,
            'без второго аргумента — «ПРИБОРОВ»');
    });

    test('бейджи Кр/ТО: Кр — ветка accent1 (суффикс k), ТО — to', () => {
        assertEqual(countOccurrences(html, 'class="ppr-tc-badge ppr-tc-badge-k"'), 1, 'Кр');
        assertEqual(countOccurrences(html, 'class="ppr-tc-badge ppr-tc-badge-to"'), 1, 'ТО');
        assertTrue(html.indexOf('>Кр</div>') !== -1, 'код Кр');
        assertTrue(html.indexOf('>ТО</div>') !== -1, 'код ТО');
    });

    test('строки данных с названиями серий', () => {
        assertTrue(html.indexOf('Кап. ремонт') !== -1, 'Кап. ремонт');
        assertTrue(html.indexOf('Тех. обслуж.') !== -1, 'Тех. обслуж.');
    });

    test('значения таблицы: 24 ячейки ppr-tc-v (2 серии × 12)', () => {
        assertEqual(countOccurrences(html, 'class="ppr-tc-v ppr-tc-r-'), 24);
        assertTrue(html.indexOf('>95</div>') !== -1, 'Кр/XII = 95');
        assertTrue(html.indexOf('>205</div>') !== -1, 'ТО/III = 205');
    });

    test('диаграмма: 12 групп + 24 столбца (Кр однотонные, ТО штрихованные)', () => {
        assertEqual(countOccurrences(html, 'class="ppr-tc-g"'), 12, '12 групп месяцев');
        assertEqual(countOccurrences(html, 'class="ppr-tc-bar"'), 12, 'Кр однотонные');
        assertEqual(countOccurrences(html, 'class="ppr-tc-bar ppr-tc-hatch"'), 12,
            'ТО штрихованные');
        assertEqual(countOccurrences(html, 'ppr-tc-hatch'), 12, 'штриховка только у ТО');
    });

    test('все месяцы ненулевые → нулевых подписей нет', () => {
        assertEqual(countOccurrences(html, 'class="ppr-tc-val"'), 24, '24 подписи');
        assertEqual(countOccurrences(html, 'class="ppr-tc-val-zero"'), 0, 'нулей нет');
    });

    test('единая шкала: максимум ТО 205 → height:100%', () => {
        assertTrue(html.indexOf('height:100%') !== -1, 'максимальный столбец');
        // Кр 95 из 205 → 46.34…%
        assertTrue(html.indexOf('height:' + (95 / 205) * 100 + '%') !== -1,
            'пропорция Кр 95/205');
        // Кр 13 из 205 → 6.34…%
        assertTrue(html.indexOf('height:' + (13 / 205) * 100 + '%') !== -1,
            'пропорция Кр 13/205 (низкий столбец виден)');
    });

    test('цвет Кр инлайном (accent1), ТО — штриховка классом', () => {
        assertTrue(html.indexOf('background:#4F81BD') !== -1, 'Кр accent1');
        const toBars = html.match(/class="ppr-tc-bar ppr-tc-hatch"/g);
        assertEqual(toBars.length, 12);
        for (const b of toBars) {
            const i = html.indexOf(b);
            const style = html.slice(i, i + 160);
            assertTrue(style.indexOf('background:') === -1 || style.indexOf('background:;') !== -1,
                'у ТО нет inline фона');
        }
    });

    test('тултипы с расшифровкой', () => {
        assertTrue(html.indexOf('Кап. ремонт (Кр), XII: 95') !== -1, 'Кр/XII');
        assertTrue(html.indexOf('Тех. обслуж. (ТО), III: 205') !== -1, 'ТО/III');
    });

    test('нулевые месяцы — подпись «0» у основания', () => {
        const h2 = host._renderDevicesPPR({
            year: 2026,
            series: [
                { code: 'Кр', name: 'Кап. ремонт', values: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
                { code: 'ТО', name: 'Тех. обслуж.', values: [3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
            ]
        }, 'БЛОКИРОВОК');
        assertEqual(countOccurrences(h2, 'class="ppr-tc-val"'), 3, 'ненулевых 3');
        assertEqual(countOccurrences(h2, 'class="ppr-tc-val-zero"'), 21, 'нулей 21');
        assertTrue(h2.indexOf('>0</span>') !== -1, 'подпись «0» у основания');
    });

    test('HTML экранируется (название с <)', () => {
        const h2 = host._renderDevicesPPR({
            year: 2026,
            series: [{ code: 'Кр', name: 'Кап.<ремонт', values: [1,0,0,0,0,0,0,0,0,0,0,0] }]
        }, 'БЛОКИРОВОК');
        assertTrue(h2.indexOf('Кап.&lt;ремонт') !== -1, 'угловые скобки экранированы');
    });

    test('устойчивость: мусорные значения → 0, серии без 12 значений пропущены', () => {
        const h2 = host._renderDevicesPPR({
            year: 2027,
            series: [
                { code: 'ТО', name: 'Тех. обслуж.', values: [null, 'x', undefined, 2, 0, 0, 0, 0, 0, 0, 0, 0] },
                { code: 'Кр', name: 'Кап. ремонт', values: [1, 2] } // пропущена
            ]
        }, 'БЛОКИРОВОК');
        assertTrue(h2.indexOf('на 2027 год') !== -1, 'год из данных');
        assertEqual(countOccurrences(h2, 'class="ppr-tc-v ppr-tc-r-'), 12, 'только 12 значений');
        assertEqual(countOccurrences(h2, 'ppr-tc-badge-to"'), 1, 'только серия ТО');
    });
});

// ==========================================================================
// 5. SW: версия v708 + комментарий Task 484
// ==========================================================================
describe('Task 484: SW — версия и кэши', () => {
    test('CACHE_VERSION = kipia-test-v733', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v733';") !== -1,
            'версия поднята');
    });

    test('v707 в sw.js отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v707') === -1, 'старой версии нет');
    });

    test('v709 в sw.js отсутствует (лишний инкремент не сделан)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v734') === -1);
    });

    test('комментарий Task 484 в шапке версий (окно 700)', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v733';");
        // Task 490: +480 симв. комментария — окно 3900 → 4500 (якорь 4232)
        // Task 502: окно 8100 → 8300 (якорь 8149).
        const ctx = SW_SRC.slice(Math.max(0, i - 9600), i);
        assertTrue(ctx.indexOf('Task 484') !== -1, 'маркер задачи');
        assertTrue(ctx.indexOf('Блокировки') !== -1, 'вкладка');
        assertTrue(ctx.indexOf('ppr_chart') !== -1, 'блок данных');
        assertTrue(ctx.indexOf('Логика SW не менялась') !== -1, 'логика не менялась');
    });

    test('charts-desktop.js в ASSETS; lockouts.json — через DATA-кэш', () => {
        // Модуль графиков перекешируется при бампе версии
        assertTrue(SW_SRC.indexOf("'./charts-desktop.js'") !== -1,
            'модуль графиков кэшируется');
        // data/lockouts.json в ASSETS НЕТ (как и до задачи — как и
        // regulators): данные блокировок идут рантайм-фетчем через
        // DATA-кэш kipia-data-test-v1 (SWR text-compare подхватит
        // обновление ppr_chart без смены логики SW)
        assertFalse(SW_SRC.indexOf("'./data/lockouts.json'") !== -1,
            'lockouts.json НЕ добавлялся в ASSETS (логика SW не менялась)');
    });

    test('персистентные кэши НЕ инкрементированы', () => {
        assertTrue(SW_SRC.indexOf('kipia-images-test-v3') !== -1, 'IMAGE_CACHE v3');
        assertTrue(SW_SRC.indexOf('kipia-data-test-v1') !== -1, 'DATA_CACHE v1');
    });
});

console.log('test-task484: все describes зарегистрированы');
