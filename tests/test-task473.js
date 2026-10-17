// tests/test-task473.js
// Task 473 — заявка пользователя: «В разделе Графики КИП ИОС, на
// вкладке Приборы, сделай что бы на графике "Количество приборов
// по графику ППР по месяцам на 2026 год" отображалось количество
// приборов на каждый месяц на диаграмме, и проверь сама диаграмма
// не отображает зрительно количество приборов по месяцам "К
// Калибровка П Поверка ТО Тех. обслуж.".»
//
// РЕШЕНИЕ (charts-desktop.js — модуль графиков, только десктоп
// Electron; данные ППР не менялись — только отрисовка):
//   (а) КОРЕНЬ «не отображает зрительно»: у ряда столбцов было
//       align-items:flex-end — ячейки НЕ растягивались на высоту
//       ряда, height:% столбца разрешался против auto-высоты ячейки
//       и схлопывался в min-height:2px — ВСЕ столбцы всех серий
//       были зрительно невидимы (2px), подтверждено замером в
//       Chromium (браузер-чек: было 2px из 165px). Теперь
//       align-items:stretch — высота ячейки определена, столбцы
//       рисуются по значению; низ столбца прижат flex-end
//       самой ячейки;
//   (б) значение над КАЖДЫМ столбцом — количество на каждый месяц
//       видно прямо на диаграмме;
//   (в) нулевые месяцы — подпись «0» у основания;
//   (г) ВСПОМОГАТЕЛЬНАЯ ПРАВАЯ ОСЬ для малых серий (легаси
//       гистограммы Task 473);
//   SW: kipia-test-v750.
//
// ИСТОРИЯ АДАПТАЦИЙ:
//   Task 483: _PPR_DEVICES УДАЛЁН (данные вкладки «Приборы» теперь
//   считает sync-devices.py → ppr_chart в data/devices.json; вкладка
//   рендерится НОВЫМ _renderDevicesPPR «таблица+диаграмма»).
//   Task 484: _renderPPRChart (+правая ось, _niceMax, заШитые
//   _PPR_LOCKOUTS, CSS .ppr-chart-*/.ppr-bar-*/.ppr-y-axis) УДАЛЁН —
//   вкладка «Блокировки» рендерится тем же _renderDevicesPPR. Тесты
//   механики мёртвого рендерера (§1–§3: _niceMax, правая ось,
//   легенда, итоги, метки осей) — УДАЛЕНЫ; семантика Task 473
//   (подписи над КАЖДЫМ столбцом, «0» у основания, КОРЕНЬ stretch)
//   жива в _renderDevicesPPR/.ppr-tc-* и покрыта ниже §1–§2
//   (плюс test-task483 §VM и test-task484).
//   Окна истории sw.js — расширены scripts/task484-windows.py.
//
// Запуск: через tests/run-all.js (require './test-task473.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const CHARTS_SRC = fs.readFileSync(path.join(ROOT, 'charts-desktop.js'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

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

// Оживить извлечённый метод (eval объектного литерала — как в test-task464)
function reviveMethod(src, name) {
    const m = extractMethod(src, name);
    if (!m) return null;
    // eslint-disable-next-line no-eval
    return eval('({' + m + '})')[name];
}

// Мок данных ППР «Приборы» (Task 483: _PPR_DEVICES удалён из
// charts-desktop.js; Task 484: рендерер _renderPPRChart тоже удалён —
// мок нужен для проверки СЕМАНТИКИ Task 473 на живом
// _renderDevicesPPR: подписи над каждым столбцом + «0» у основания)
const MOCK_PPR_DEVICES = {
    year: 2026,
    series: [
        { name: 'Калибровка', code: 'К', values: [13, 33, 30, 45, 24, 28, 33, 34, 48, 16, 34, 35] },
        { name: 'Поверка', code: 'П', values: [12, 12, 4, 15, 0, 4, 6, 10, 4, 6, 1, 12] },
        { name: 'Тех. обслуж.', code: 'ТО', values: [353, 354, 500, 320, 374, 496, 333, 353, 481, 358, 362, 485] }
    ]
};

// Хост с живыми методами отрисовки (та же арифметика, что в браузере)
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

// ==========================================================================
// 1. SEMANTIC Task 473 на живом рендерере: подписи над КАЖДЫМ
//    столбцом + «0» у основания + КОРЕНЬ stretch (высоты определены)
// ==========================================================================
describe('Task 473: семантика на _renderDevicesPPR (мок, бывш. «Приборы»)', () => {
    const host = makeHost();
    const html = host._renderDevicesPPR(MOCK_PPR_DEVICES);
    const data = MOCK_PPR_DEVICES;
    const K = data.series[0], P = data.series[1], TO = data.series[2];

    test('мок-данные теста (бывшие _PPR_DEVICES, удалены Task 483): серии', () => {
        assertEqual(K.name, 'Калибровка'); assertEqual(K.code, 'К');
        assertEqual(P.name, 'Поверка'); assertEqual(P.code, 'П');
        assertEqual(TO.name, 'Тех. обслуж.'); assertEqual(TO.code, 'ТО');
        assertEqual(K.values.length, 12); assertEqual(P.values.length, 12);
        assertEqual(TO.values.length, 12);
        // единственный нулевой месяц — Май у Поверки
        const zeros = [];
        for (let m = 0; m < 12; m++)
            for (let s = 0; s < 3; s++)
                if (data.series[s].values[m] === 0) zeros.push([s, m]);
        assertEqual(zeros.length, 1, 'ровно один нулевой месяц (Май, П)');
        assertEqual(zeros[0][0], 1); assertEqual(zeros[0][1], 4);
    });

    test('значение над КАЖДЫМ ненулевым столбцом: 35 подписей (12 К + 11 П + 12 ТО)', () => {
        // п. (б) заявки: количество видно на каждый месяц
        assertEqual(countOccurrences(html, 'class="ppr-tc-val"'), 35);
    });

    test('нулевой месяц — подпись «0» у основания (.ppr-tc-val-zero)', () => {
        // п. (в) решения: нули не теряются
        assertEqual(countOccurrences(html, 'class="ppr-tc-val-zero"'), 1);
        assertTrue(html.indexOf('>0</span>') !== -1, 'текст «0» присутствует');
    });

    test('12 групп месяцев, столбцы выровнены по колонкам таблицы', () => {
        assertEqual(countOccurrences(html, 'class="ppr-tc-g"'), 12);
        const romans = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
        for (const r of romans) {
            assertTrue(html.indexOf('>' + r + '</div>') !== -1, 'месяц ' + r);
        }
    });

    test('единая шкала: высоты пропорциональны значениям (ТО 500 → 100%)', () => {
        const max = 500;
        assertTrue(html.indexOf('height:100%') !== -1, 'максимальный столбец');
        assertTrue(html.indexOf('height:' + (13 / max) * 100 + '%') !== -1,
            'пропорция К 13/500');
        assertTrue(html.indexOf('height:' + (12 / max) * 100 + '%') !== -1,
            'пропорция П 12/500');
    });

    test('тултипы с расшифровкой серий', () => {
        assertTrue(html.indexOf('Калибровка (К), IX: 48') !== -1, 'К/IX');
        assertTrue(html.indexOf('Тех. обслуж. (ТО), III: 500') !== -1, 'ТО/III');
    });
});

// ==========================================================================
// 2. CSS: КОРЕНЬ «не отображает зрительно» + якорь «0» (ppr-tc-*)
// ==========================================================================
describe('Task 473: CSS графиков (ppr-tc-*, живой рендерер)', () => {

    test('КОРЕНЬ «не отображает зрительно»: .ppr-tc-bars align-items:stretch', () => {
        // Было flex-end у старой гистограммы — ячейки не растягивались
        // на высоту ряда, height:% столбца разрешался против
        // auto-высоты ячейки и схлопывался в min-height:2px: ВСЕ
        // столбцы были зрительно невидимы (замер Chromium: 2px из
        // 165px) — это и значила фраза заявки «сама диаграмма не
        // отображает зрительно количество приборов по месяцам».
        const m = CHARTS_SRC.match(/\.ppr-tc-bars \{[^}]*\}/);
        assertTrue(!!m && /align-items:\s*stretch/.test(m[0]),
            'ячейки растянуты на всю высоту ряда — высота столбца определена');
        assertTrue(!!m && !/align-items:\s*flex-end/.test(m[0]),
            'flex-end убран из ряда столбцов');
    });

    test('низ столбца прижат ячейкой (.ppr-tc-bcell align-items:flex-end)', () => {
        const m = CHARTS_SRC.match(/\.ppr-tc-bcell \{[^}]*\}/);
        assertTrue(!!m && /align-items:\s*flex-end/.test(m[0]),
            'столбец прижат к основанию ячейки');
    });

    test('запас под подписи: .ppr-tc-bars padding-top 16px', () => {
        const m = CHARTS_SRC.match(/\.ppr-tc-bars \{[^}]*\}/);
        assertTrue(!!m && /padding:\s*16px 1px 0/.test(m[0]),
            'было 4px — подписи упирались в шапку');
    });

    test('.ppr-tc-bcell position:relative — якорь подписи «0»', () => {
        const m = CHARTS_SRC.match(/\.ppr-tc-bcell \{[^}]*\}/);
        assertTrue(!!m && /position:\s*relative/.test(m[0]), 'якорь для «0»');
    });

    test('стиль подписи нуля .ppr-tc-val-zero у основания', () => {
        const m = CHARTS_SRC.match(/\.ppr-tc-val-zero \{[^}]*\}/);
        assertTrue(!!m && /bottom:\s*1px/.test(m[0]), 'привязка к основанию');
    });

    test('минимальная высота столбца сохранена (min-height: 2px)', () => {
        const m = CHARTS_SRC.match(/\.ppr-tc-bar \{[^}]*\}/);
        assertTrue(!!m && /min-height:\s*2px/.test(m[0]), 'столбец не схлопнется');
    });

    test('Task 484: мёртвый CSS старой гистограммы УДАЛЁН', () => {
        // правая ось/легенда/сетка старого _renderPPRChart (Task 473
        // г/д) не должны вернуться — рендерер удалён Task 484.
        // Проверяем ПРАВИЛА (имя + " {"): упоминания классов в
        // исторических комментариях шапки допускаются (некролог)
        for (const cls of ['.ppr-bars-row', '.ppr-y-axis-right', '.ppr-bar-val',
                           '.ppr-totals-row', '.ppr-chart-card']) {
            assertTrue(CHARTS_SRC.indexOf(cls + ' {') === -1,
                'CSS-правило ' + cls + ' удалено');
        }
    });
});

// ==========================================================================
// 3. Заголовок модуля и Service Worker
// ==========================================================================
describe('Task 473: шапка charts-desktop.js и SW', () => {

    test('шапка charts-desktop.js описывает Task 473', () => {
        assertTrue(CHARTS_SRC.indexOf('Task 473') !== -1, 'маркер задачи');
        assertTrue(CHARTS_SRC.indexOf('ВСПОМОГА') !== -1 || CHARTS_SRC.indexOf('правая ось') !== -1,
            'упоминание вспомогательной оси (история Task 473)');
    });

    test('модуль по-прежнему только десктоп (заголовок Electron)', () => {
        assertTrue(CHARTS_SRC.indexOf('ТОЛЬКО десктопного приложения') !== -1,
            'назначение модуля не изменилось');
    });

    test('CACHE_VERSION = kipia-test-v750', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v750';") !== -1,
            'текущая версия v707');
    });

    test('v706 в sw.js отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v706') === -1,
            'версии до текущей задачи нет');
    });

    test('v708 в sw.js отсутствует (лишний инкремент не сделан)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v751') === -1,
            'версия после текущей задачи не существует');
    });

    test('комментарий Task 473 о составе правок в sw.js (окно истории)', () => {
        // Task 473 ~3843 (комментарии 474-484 отодвинули) — окно 4600
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v750';");
        // Task 492: комментарий (~290 симв.) отодвинул якорь Task 473
        // до ~8469 — окно 8200 → 9000.
        // Task 502: окно 11500 → 12000 (якорь 11605).
        const ctx = SW_SRC.slice(Math.max(0, i - 13300), i);
        assertTrue(ctx.indexOf('Task 473') !== -1, 'маркер задачи в окне истории');
        assertTrue(ctx.indexOf('правая ось') !== -1 || ctx.indexOf('ППР') !== -1,
            'упоминание графика ППР');
    });

    test('charts-desktop.js в ASSETS сервис-воркера (обновление кэша)', () => {
        assertTrue(SW_SRC.indexOf('./charts-desktop.js') !== -1,
            'файл графика перекешируется при бампе');
    });
});

console.log('test-task473: все describes зарегистрированы');
