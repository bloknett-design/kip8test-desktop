// tests/test-task483.js
// Task 483 — заявка пользователя: «В разделе "Графики КИП ИОС", во
// вкладке "Приборы" оформление и предоставление информации сделай
// по примеру как на приложенном к этому сообщению скрину, и проверь
// логику формирования трендов диаграммы, должно отображаться
// количество приборов по месяцам которые проходят "П", "К" и "ТО",
// количество должно вычисляться следующим способом, в зависимости
// от вида ремонта ("П", "К" и "ТО") считаются если есть в графике
// ппр, в файле Перечень КИП ИОС рабочий.xlsx, на листе "Приборы"
// в столбце "Наличие в ППР" находится значение "Есть", если "Нет",
// то не учитываются.»
//
// РЕШЕНИЕ (2 файла + данные):
//   (а) ОФОРМЛЕНИЕ «как в Excel» (скрин = лист «Диаграммы» книги
//       «Перечень КИП ИОС рабочий.xlsx», сверено пиксельно и по
//       заливкам XLSX): НОВЫЙ _renderDevicesPPR — ТАБЛИЦА (шапка
//       «Вид обслуживания» A1:B2 + титул «Количество ПРИБОРОВ по
//       графику ППР по месяцам на <год> год» C1:N1; месяцы I–XII
//       жирные, пастели листа: I/V/IX/XII #FFB9B9, VI-VIII #FFDB69;
//       строки К/П/ТО: бейдж accent+40% #8DB4E2/#D99694/#C3D69B +
//       название + 12 значений на фоне accent+80% #DBEEF4/#FDEADA/
//       #EBF1DE) + ДИАГРАММА (та же CSS-сетка — столбцы выровнены
//       по колонкам таблицы; accent1/2/3 #4F81BD/#C0504D/#9BBB59;
//       у ТО — горизонтальная штриховка, как на листе; значения над
//       КАЖДЫМ столбцом, «0» у основания — прецедент Task 473;
//       осей/легенды/титула НЕТ). Карточка — БЕЛЫЙ «документ» в обе
//       темах (пастели Excel читаются только на белом);
//   (б) ЛОГИКА: _PPR_DEVICES (заШитые счётчики, расходившиеся с
//       файлом) УДАЛЁН; счётчики считает sync-devices.py → блок
//       ppr_chart в data/devices.json: по листу «Приборы», метка
//       месяца I..XII == «К»/«П»/«ТО» (точное совпадение, как
//       COUNTIF листа «Диаграммы»; «К*» НЕ считается) И «Наличие в
//       ППР» == «Есть» (регистронезависимо; «Нет»/пусто — мимо).
//       СВЕРЕНО с Excel: без фильтра (как COUNTIF листа) К 350/П 86/
//       ТО 4703; с фильтром пользователя К 350/П 84/ТО 2977 (на
//       2026-10-07: 854 «Есть»/437 «Нет», все «К*» на «Нет»-строках).
//       Вкладка «Приборы» грузит devices.json единым путём
//       _renderTab/_loadData; _renderPPRChart (+правая ось) остаётся
//       живым для вкладки «Блокировки»;
//   (в) sync-devices.py: устойчивость — лист «Приборы» недоступен
//       (экспорт с gid= одного листа) → сохранён прежний ppr_chart.
//   SW: kipia-test-v736 (логика SW не менялась; окна истории
//       расширены scripts/task483-windows.py; бамп tests —
//       scripts/task483-bump-sw.py). АДАПТАЦИЯ test-task473.js:
//   _PPR_DEVICES → локальный мок (механика _renderPPRChart жива для
//   «Блокировок»).
//   Task 484 АДАПТАЦИЯ: вкладка «Блокировки» переведена на тот же
//   _renderDevicesPPR — _renderPPRChart и _PPR_LOCKOUTS УДАЛЕНЫ
//   (инверсия проверок ниже); _renderDevicesPPR получил параметр
//   noun («ПРИБОРОВ»/«БЛОКИРОВОК»); логика и рендер «Блокировок»
//   тестируются в test-task484.js.
//
// Запуск: через tests/run-all.js (require './test-task483.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const CHARTS_SRC = fs.readFileSync(path.join(ROOT, 'charts-desktop.js'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const SYNC_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'sync-devices.py'), 'utf8');
const DEVICES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'devices.json'), 'utf8'));

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

// Мок-хост с живыми методами и константами модуля (как в test-task473)
function makeHost() {
    return {
        _renderDevicesPPR: reviveMethod(CHARTS_SRC, '_renderDevicesPPR'),
        _escHtml: reviveMethod(CHARTS_SRC, '_escHtml'),
        _MONTHS_ROMAN: ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'],
        _PPR_TC_STYLES: {
            'К':  { suffix: 'k',  bar: '#4F81BD', badge: '#8DB4E2', row: '#DBEEF4' },
            'П':  { suffix: 'p',  bar: '#C0504D', badge: '#D99694', row: '#FDEADA' },
            'ТО': { suffix: 'to', bar: '#9BBB59', badge: '#C3D69B', row: '#EBF1DE' }
        },
        _PPR_TC_MONTH_CLS: ['pink','','','','pink','gold','gold','gold','pink','','','pink']
    };
}

function countOccurrences(haystack, needle) {
    return haystack.split(needle).length - 1;
}

// Мок данных (значения = снимок реального ppr_chart на Task 483)
const MOCK_PPR = {
    year: 2026,
    series: [
        { code: 'К', name: 'Калибровка', values: [13, 29, 26, 39, 24, 28, 32, 34, 44, 16, 30, 35] },
        { code: 'П', name: 'Поверка', values: [11, 11, 3, 15, 0, 4, 6, 10, 5, 7, 6, 6] },
        { code: 'ТО', name: 'Тех. обслуж.', values: [234, 233, 293, 204, 249, 290, 220, 229, 273, 235, 237, 280] }
    ]
};

// ==========================================================================
// 1. sync-devices.py — логика подсчёта ppr_chart (заявка пользователя)
// ==========================================================================
describe('Task 483: sync-devices.py — счётчики ППР по месяцам', () => {
    test('parse_ppr_chart существует', () => {
        assertTrue(SYNC_SRC.indexOf('def parse_ppr_chart(') !== -1,
            'функция подсчёта объявлена');
    });

    test('фильтр «Наличие в ППР» = «Есть» (регистронезависимо)', () => {
        assertTrue(SYNC_SRC.indexOf("!= 'есть'") !== -1,
            'строки != «есть» пропускаются (заявка: «Нет» не учитываются)');
        assertTrue(SYNC_SRC.indexOf(".strip().lower()") !== -1,
            'значение нормализуется trim + lower');
    });

    test('месячные колонки I–XII', () => {
        assertTrue(SYNC_SRC.indexOf("PPR_MONTH_COLS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']") !== -1,
            'список 12 месяцев');
    });

    test('виды ремонта К/П/ТО', () => {
        assertTrue(SYNC_SRC.indexOf("PPR_TYPES = ['К', 'П', 'ТО']") !== -1,
            'три серии');
        assertTrue(SYNC_SRC.indexOf("PPR_TYPE_NAMES = {'К': 'Калибровка', 'П': 'Поверка', 'ТО': 'Тех. обслуж.'}") !== -1,
            'названия серий');
    });

    test('ТОЧНОЕ совпадение кода (как COUNTIF; «К*» не считается)', () => {
        // «К*» НЕ входит в PPR_TYPES → v in counts == False
        const seg = SYNC_SRC.slice(SYNC_SRC.indexOf('v = str(ws.cell'));
        assertTrue(seg.indexOf('if v in counts') !== -1,
            'членство в counts — точное совпадение');
        assertFalse(SYNC_SRC.indexOf('К*') === -1 ? false : SYNC_SRC.indexOf("'К*'") !== -1 && SYNC_SRC.indexOf("'К*' in counts") !== -1,
            '«К*» не добавлен как отдельный тип');
    });

    test('источник — лист «Приборы», столбец «Наличие в ППР»', () => {
        assertTrue(SYNC_SRC.indexOf("'Наличие в ППР' in headers") !== -1,
            'столбец ищется по заголовку');
        assertTrue(SYNC_SRC.indexOf("def parse_ppr_chart(xlsx_path, sheet_name='Приборы')") !== -1,
            'лист «Приборы» по умолчанию');
    });

    test('блок ppr_chart пишется в devices.json', () => {
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
        // экспорт с gid= одного листа — «Приборы» нет → старый блок жив
        assertTrue(SYNC_SRC.indexOf("json.load(f).get('ppr_chart')") !== -1,
            'чтение прежнего блока');
        assertTrue(SYNC_SRC.indexOf('сохранён прежний блок') !== -1,
            'лог сохранения');
    });
});

// ==========================================================================
// 2. charts-desktop.js — новый рендер и удаление заШитых данных
// ==========================================================================
describe('Task 483: charts-desktop.js — структура', () => {
    test('_PPR_DEVICES УДАЛЁН (корень жалобы)', () => {
        // упоминание в КОММЕНТАРИЯХ шапки допускается (некролог) —
        // проверяем отсутствие БЛОКА ДАННЫХ и его ИСПОЛЬЗОВАНИЯ
        assertTrue(CHARTS_SRC.indexOf('_PPR_DEVICES: {') === -1,
            'блок заШитых счётчиков удалён');
        assertTrue(CHARTS_SRC.indexOf('this._PPR_DEVICES') === -1,
            'использование удалено');
        // Task 484: счётчики «Блокировок» тоже больше не заШиты
        assertTrue(CHARTS_SRC.indexOf('_PPR_LOCKOUTS: {') === -1,
            'блок заШитых счётчиков «Блокировок» удалён (Task 484)');
        assertTrue(CHARTS_SRC.indexOf('this._PPR_LOCKOUTS') === -1,
            'использование _PPR_LOCKOUTS удалено (Task 484)');
    });

    test('рендерер _renderDevicesPPR объявлен (Task 484: с параметром noun)', () => {
        assertTrue(CHARTS_SRC.indexOf('_renderDevicesPPR: function(ppr, noun)') !== -1,
            'метод существует; noun — существительное титула');
    });

    test('поле _pprChart (блок из devices.json)', () => {
        assertTrue(CHARTS_SRC.indexOf('_pprChart: null') !== -1,
            'поле объявлено');
    });

    test('_loadData захватывает ppr_chart для devices', () => {
        const seg = CHARTS_SRC.slice(CHARTS_SRC.indexOf('_loadData: function'),
                                     CHARTS_SRC.indexOf('_renderTab: function'));
        assertTrue(seg.indexOf("data.ppr_chart") !== -1,
            'блок читается из ответа');
        assertTrue(seg.indexOf("KipCharts._pprChart = data.ppr_chart") !== -1,
            'сохраняется в поле модуля');
    });

    test('вкладка «Приборы» грузит данные (единый путь)', () => {
        const seg = CHARTS_SRC.slice(CHARTS_SRC.indexOf('_renderTab: function'),
                                     CHARTS_SRC.indexOf('_renderContent: function'));
        assertTrue(seg.indexOf('Загрузка…') !== -1,
            'показывается загрузка (раньше рендерилось сразу)');
        assertFalse(seg.indexOf("_renderContent(tab, [])") !== -1,
            'спец-ветка «без данных» удалена');
    });

    test('_renderContent: ветка devices рендерит ppr_chart', () => {
        const seg = CHARTS_SRC.slice(CHARTS_SRC.indexOf('_renderContent: function'),
                                     CHARTS_SRC.indexOf('_renderValvesPies: function'));
        assertTrue(seg.indexOf('_renderDevicesPPR(ppr,') !== -1,
            'вызов нового рендерера (Task 484: с noun)');
        assertTrue(seg.indexOf('ppr-tc-empty-note') !== -1,
            'фолбэк при отсутствии блока');
    });

    test('CSS Task 483 подключён вторым style-блоком', () => {
        assertTrue(CHARTS_SRC.indexOf('chartsDesktopCss483') !== -1,
            'id style-элемента');
        assertTrue(CHARTS_SRC.indexOf('css483') !== -1,
            'массив правил');
    });

    test('палитра Excel: бейджи/строки/столбцы', () => {
        assertTrue(CHARTS_SRC.indexOf('#8DB4E2') !== -1 && CHARTS_SRC.indexOf('#D99694') !== -1 &&
                   CHARTS_SRC.indexOf('#C3D69B') !== -1, 'бейджи accent+40%');
        assertTrue(CHARTS_SRC.indexOf('#DBEEF4') !== -1 && CHARTS_SRC.indexOf('#FDEADA') !== -1 &&
                   CHARTS_SRC.indexOf('#EBF1DE') !== -1, 'оттенки строк accent+80%');
        assertTrue(CHARTS_SRC.indexOf('#4F81BD') !== -1 && CHARTS_SRC.indexOf('#C0504D') !== -1 &&
                   CHARTS_SRC.indexOf('#9BBB59') !== -1, 'столбцы accent1/2/3');
    });

    test('пастели шапки месяцев (розовый/золотой)', () => {
        assertTrue(CHARTS_SRC.indexOf('#FFB9B9') !== -1, 'розовый I/V/IX/XII');
        assertTrue(CHARTS_SRC.indexOf('#FFDB69') !== -1, 'золотой VI-VIII');
        const m = CHARTS_SRC.match(/_PPR_TC_MONTH_CLS: \[([^\]]*)\]/);
        assertTrue(!!m, 'массив классов месяцев найден');
        assertTrue(m && m[1].split(',').filter(x => x.indexOf('pink') !== -1).length === 4,
            'ровно 4 розовых месяца');
        assertTrue(m && m[1].split(',').filter(x => x.indexOf('gold') !== -1).length === 3,
            'ровно 3 золотых месяца');
    });

    test('титул «Количество <noun> … на <год> год» — динамический', () => {
        // Task 484: noun — «ПРИБОРОВ»/«БЛОКИРОВОК»; по умолчанию
        // «ПРИБОРОВ» (обратная совместимость)
        assertTrue(CHARTS_SRC.indexOf("'Количество ' + (noun || 'ПРИБОРОВ') + ' по графику ППР по месяцам на ' + year + ' год'") !== -1,
            'титул собирается из данных и noun');
    });

    test('штриховка ТО — горизонтальные полосы', () => {
        assertTrue(CHARTS_SRC.indexOf('repeating-linear-gradient(to bottom, #A3AF7F 0px, #A3AF7F 3px, #C4D695 3px, #C4D695 6px)') !== -1,
            'градиент горизонтальных полос');
    });

    test('Task 473-фиксы в новой диаграмме: stretch + flex-end', () => {
        const seg = CHARTS_SRC.slice(CHARTS_SRC.indexOf('css483 = ['));
        assertTrue(seg.indexOf('align-items: stretch') !== -1,
            '.ppr-tc-bars stretch (якорь высоты столбцов)');
        assertTrue(seg.indexOf('align-items: flex-end') !== -1,
            '.ppr-tc-bcell flex-end (низ к основанию)');
        assertTrue(seg.indexOf('padding: 16px 1px 0') !== -1,
            'запас под подписи значений');
    });

    test('_renderPPRChart (правая ось) УДАЛЁН — «Блокировки» рендерит _renderDevicesPPR', () => {
        // Task 484: заявка «убери всё лишнее» — старый рендерер и
        // заШитые счётчики удалены; упоминание в некрологе шапки
        // допускается, определение/вызов — нет
        assertTrue(CHARTS_SRC.indexOf('_renderPPRChart: function') === -1,
            'рендерер удалён');
        assertTrue(CHARTS_SRC.indexOf('this._renderPPRChart') === -1,
            'вызов удалён');
        assertTrue(CHARTS_SRC.indexOf("this._renderDevicesPPR(ppr,") !== -1,
            'обе вкладки рендерятся _renderDevicesPPR');
    });
});

// ==========================================================================
// 3. data/devices.json — блок ppr_chart (инварианты; крон обновляет
//    данные ежедневно, поэтому НЕ точные счётчики — прецедент 478 §6)
// ==========================================================================
describe('Task 483: devices.json — блок ppr_chart', () => {
    const ppr = DEVICES_JSON.ppr_chart;

    test('блок ppr_chart присутствует', () => {
        assertTrue(!!ppr, 'поле есть после синка Task 483');
    });

    test('три серии К/П/ТО в каноническом порядке', () => {
        assertEqual(ppr.series.length, 3, 'три серии');
        assertEqual(ppr.series[0].code, 'К');
        assertEqual(ppr.series[0].name, 'Калибровка');
        assertEqual(ppr.series[1].code, 'П');
        assertEqual(ppr.series[1].name, 'Поверка');
        assertEqual(ppr.series[2].code, 'ТО');
        assertEqual(ppr.series[2].name, 'Тех. обслуж.');
    });

    test('по 12 значений у каждой серии', () => {
        for (const s of ppr.series) assertEqual(s.values.length, 12, s.code);
    });

    test('значения — целые неотрицательные', () => {
        for (const s of ppr.series)
            for (const v of s.values)
                assertTrue(Number.isInteger(v) && v >= 0, s.code + ': ' + v);
    });

    test('фильтр заявки: счётчики ≤ пометок строк «Есть»', () => {
        // инвариант против регресса фильтра: 854 строки «Есть» × до 4
        // пометок = потолок 3416; счётчик БЕЗ фильтра был бы 5139
        const total = ppr.series.reduce((a, s) => a + s.values.reduce((x, y) => x + y, 0), 0);
        assertTrue(total > 0, 'счётчики не пустые');
        assertTrue(total <= 4 * 854 + 1, 'не выше «Есть»-потолка (фильтр жив)');
    });

    test('год = 2026 (текущий год данных)', () => {
        assertEqual(ppr.year, 2026);
    });

    test('метаданные фильтра и источника', () => {
        assertEqual(ppr.filter, 'Наличие в ППР = Есть');
        assertEqual(ppr.source_sheet, 'Приборы');
    });

    test('структура devices.json не задета (массив и заголовки прежние)', () => {
        // Task 491 (rebase поверх авто-синка 5238816d): 1291 → 1288 —
        // пользователь удалил 3 прибора в Google Sheets
        assertEqual(DEVICES_JSON.total_devices, 1288, 'total_devices прежний');
        assertEqual(DEVICES_JSON.devices.length, 1288, 'массив прежний');
        assertEqual(DEVICES_JSON.headers.length, 24, '24 колонки');
        assertEqual(DEVICES_JSON.headers[0], 'ID', 'ID первый');
    });
});

// ==========================================================================
// 4. VM: _renderDevicesPPR — таблица + диаграмма по моку
// ==========================================================================
describe('Task 483: VM — _renderDevicesPPR (таблица + диаграмма)', () => {
    const host = makeHost();
    const html = host._renderDevicesPPR(MOCK_PPR);

    test('титул «Количество ПРИБОРОВ … на 2026 год»', () => {
        assertTrue(html.indexOf('Количество ПРИБОРОВ по графику ППР по месяцам на 2026 год') !== -1,
            'титул с годом из данных');
    });

    test('шапка «Вид обслуживания» + титул + месяцы I–XII', () => {
        assertTrue(html.indexOf('ppr-tc-vo') !== -1 &&
                   html.indexOf('Вид обслуживания') !== -1, 'шапка');
        assertTrue(html.indexOf('ppr-tc-title') !== -1, 'титул-ячейка');
        const romans = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
        assertEqual(countOccurrences(html, 'class="ppr-tc-m'), 12, '12 месячных ячеек');
        for (const r of romans)
            assertTrue(html.indexOf('>' + r + '</div>') !== -1, 'месяц ' + r);
    });

    test('пастели месяцев: 4 розовых + 3 золотых', () => {
        assertEqual(countOccurrences(html, 'ppr-tc-m-pink'), 4, 'I/V/IX/XII');
        assertEqual(countOccurrences(html, 'ppr-tc-m-gold'), 3, 'VI/VII/VIII');
    });

    test('бейджи К/П/ТО с классами accent+40%', () => {
        assertEqual(countOccurrences(html, 'class="ppr-tc-badge ppr-tc-badge-k"'), 1, 'К');
        assertEqual(countOccurrences(html, 'class="ppr-tc-badge ppr-tc-badge-p"'), 1, 'П');
        assertEqual(countOccurrences(html, 'class="ppr-tc-badge ppr-tc-badge-to"'), 1, 'ТО');
        assertTrue(html.indexOf('>К</div>') !== -1, 'код К');
        assertTrue(html.indexOf('>П</div>') !== -1, 'код П');
        assertTrue(html.indexOf('>ТО</div>') !== -1, 'код ТО');
    });

    test('строки данных с названиями', () => {
        assertTrue(html.indexOf('Калибровка') !== -1, 'Калибровка');
        assertTrue(html.indexOf('Поверка') !== -1, 'Поверка');
        assertTrue(html.indexOf('Тех. обслуж.') !== -1, 'Тех. обслуж.');
    });

    test('значения таблицы: 36 ячеек ppr-tc-v (3 серии × 12)', () => {
        assertEqual(countOccurrences(html, 'class="ppr-tc-v ppr-tc-r-'), 36);
        assertTrue(html.indexOf('>349</div>') === -1, 'заШитых значений нет');
    });

    test('диаграмма: 12 групп + выравнивание (та же сетка)', () => {
        assertEqual(countOccurrences(html, 'class="ppr-tc-g"'), 12, '12 групп месяцев');
        assertEqual(countOccurrences(html, 'ppr-tc-chart-empty'), 1, 'пустые левые колонки');
    });

    test('35 столбцов (12 К + 11 П + 12 ТО) + 1 нулевой', () => {
        // точные литералы классов: «class="ppr-tc-bar"» не должен
        // ловить контейнер «ppr-tc-bars» / «ppr-tc-bcell»
        assertEqual(countOccurrences(html, 'class="ppr-tc-bar"'), 23,
            '23 однотонных (12 К + 11 П)');
        assertEqual(countOccurrences(html, 'class="ppr-tc-bar ppr-tc-hatch"'), 12,
            '12 штрихованных ТО');
        assertEqual(countOccurrences(html, 'ppr-tc-hatch'), 12, 'штриховка только у ТО');
        assertEqual(countOccurrences(html, 'class="ppr-tc-val-zero"'), 1, 'нуль П/V');
        assertTrue(html.indexOf('>0</span>') !== -1, 'подпись «0» у основания');
    });

    test('значения над КАЖДЫМ ненулевым столбцом', () => {
        assertEqual(countOccurrences(html, 'class="ppr-tc-val"'), 35, '35 подписей');
        assertTrue(html.indexOf('>44</span>') !== -1, 'К/IX = 44');
        assertTrue(html.indexOf('>293</span>') !== -1, 'ТО/III = 293');
        assertTrue(html.indexOf('>15</span>') !== -1, 'П/IV = 15');
    });

    test('единая шкала: максимум ТО 293 → height:100%', () => {
        assertTrue(html.indexOf('height:100%') !== -1, 'максимальный столбец');
        // К 44 из 293 → 15.017064…%
        assertTrue(html.indexOf('height:' + (44 / 293) * 100 + '%') !== -1,
            'пропорция К 44/293');
        assertTrue(html.indexOf('height:' + (11 / 293) * 100 + '%') !== -1,
            'пропорция П 11/293');
    });

    test('цвета столбцов инлайном (К/П), штриховка классом (ТО)', () => {
        assertTrue(html.indexOf('background:#4F81BD') !== -1, 'К accent1');
        assertTrue(html.indexOf('background:#C0504D') !== -1, 'П accent2');
        // ТО — без inline background (штриховка из CSS-класса)
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
        assertTrue(html.indexOf('Калибровка (К), IX: 44') !== -1, 'К/IX');
        assertTrue(html.indexOf('Тех. обслуж. (ТО), III: 293') !== -1, 'ТО/III');
    });

    test('HTML экранируется (название с <)', () => {
        const h2 = host._renderDevicesPPR({
            year: 2026,
            series: [{ code: 'К', name: 'Калиб<ровка', values: [1,0,0,0,0,0,0,0,0,0,0,0] }]
        });
        assertTrue(h2.indexOf('Калиб&lt;ровка') !== -1, 'угловые скобки экранированы');
    });

    test('устойчивость: мусорные значения → 0, серии без 12 значений пропущены', () => {
        const h2 = host._renderDevicesPPR({
            year: 2027,
            series: [
                { code: 'П', name: 'Поверка', values: [null, 'x', undefined, 2, 0, 0, 0, 0, 0, 0, 0, 0] },
                { code: 'К', name: 'Калибровка', values: [1, 2] } // пропущена
            ]
        });
        assertTrue(h2.indexOf('на 2027 год') !== -1, 'год из данных');
        assertEqual(countOccurrences(h2, 'class="ppr-tc-v ppr-tc-r-'), 12, 'только 12 значений');
        assertEqual(countOccurrences(h2, 'ppr-tc-badge-p"'), 1, 'только серия П');
        assertTrue(h2.indexOf('>2</div>') !== -1, 'число 2 прошло');
    });

    test('фолбэк-оформление для неизвестного кода серии', () => {
        const h2 = host._renderDevicesPPR({
            year: 2026,
            series: [{ code: 'X', name: 'Прочее', values: [1,0,0,0,0,0,0,0,0,0,0,0] }]
        });
        assertTrue(h2.indexOf('ppr-tc-badge-x') !== -1, 'суффикс x');
        assertTrue(h2.indexOf('background:#9e9e9e') !== -1, 'серый столбец');
    });
});

// ==========================================================================
// 5. SW: версия v707 + комментарий Task 483
// ==========================================================================
describe('Task 483: SW — версия и кэши', () => {
    test('CACHE_VERSION = kipia-test-v736', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v736';") !== -1,
            'версия поднята');
    });

    test('v706 в sw.js отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v706') === -1, 'старой версии нет');
    });

    test('v708 в sw.js отсутствует (лишний инкремент не сделан)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v737') === -1);
    });

    test('комментарий Task 483 в шапке версий (окно 700)', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v736';");
        // Task 490: +480 симв. комментария — окно 3900 → 4400 (якорь 4137)
        // Task 502: окно 8000 → 8600 (якорь 8474).
                // Task 508: окно 9300 → 10500 — комментарий архива
        // Кабельного журнала (~160 симв.) отодвинул Task 483.
const ctx = SW_SRC.slice(Math.max(0, i - 10500), i);
        assertTrue(ctx.indexOf('Task 483') !== -1, 'маркер задачи');
        assertTrue(ctx.indexOf('Графики КИП ИОС') !== -1, 'раздел');
        assertTrue(ctx.indexOf('ppr_chart') !== -1, 'блок данных');
        assertTrue(ctx.indexOf('Логика SW не менялась') !== -1, 'логика не менялась');
    });

    test('charts-desktop.js и data/devices.json в ASSETS', () => {
        assertTrue(SW_SRC.indexOf("'./charts-desktop.js'") !== -1,
            'модуль графиков кэшируется');
        assertTrue(SW_SRC.indexOf("'./data/devices.json'") !== -1,
            'данные приборов кэшируются');
    });

    test('персистентные кэши НЕ инкрементированы', () => {
        assertTrue(SW_SRC.indexOf('kipia-images-test-v3') !== -1, 'IMAGE_CACHE v3');
        assertTrue(SW_SRC.indexOf('kipia-data-test-v1') !== -1, 'DATA_CACHE v1');
    });
});

console.log('test-task483: все describes зарегистрированы');
