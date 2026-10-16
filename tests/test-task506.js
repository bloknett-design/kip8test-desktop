// tests/test-task506.js
// Task 506 — заявка пользователя:
//   «Оформление сделай по шаблону https://docs.google.com/spreadsheets/
//    d/1juXOT8lgu6cC7SZGMNJwHT01mYzu47oL7fdJteKq-y4/edit?usp=sharing,
//    без текста "Кабельный журнал отделений: 11 · записей: 159" просто
//    таблицу, шапка таблицы должна распечатываться на каждой странице,
//    просмотр с разбиением листов по страницам, сортировку как в
//    исходном файле.» (+ перенос последних изменений в kip8 — Task 507)
//
// ШАБЛОН (изучен экспортом xlsx): лист «Кабельный журнал», 159 строк,
//   A1:J161, шапка 2 строки (A1:A2…D1:D2, E1:G1 «По проекту», H1:J1
//   «Проложен»), Arial Narrow 12, thin black, «По проекту» данных —
//   заливка FFF2F2F2, ширины 17/19.71/21/18.71/17/16.71/11.43/17/
//   16.71/9.43, выравнивания: A/жилы/длины — центр, B/C/D/марки —
//   влево; ПОРЯДОК СТРОК == cables.json (№ п/п строго возрастает).
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   SRC/JS: колонки — 10 дословных подписей шаблона, суммы ширин
//     (786pt PDF / мм HTML), align/proj-маппинг, сортировка модели
//     по № п/п, _cjSub без «отделений».
//   CSS: Arial Narrow 12pt, чёрная сетка 1px #000, серый #f2f2f2
//     «По проекту», шапка БЕЗ заливки, зебры/групп НЕТ,
//     table-header-group (шапка на каждой странице).
//   ПРЕДПРОСМОТР: iframe 1123px (полная страница 297мм), документ
//     со страницами 297×210мм (контент 281×194мм), мерная таблица
//     + скрипт пагинации (getBoundingClientRect, клон thead на
//     каждую страницу, фолбэк), <\/script>-экранирование в ИСТОЧНИКЕ.
//   PDF: раскладка без заголовка (headH нет), 10 колонок, шапка
//     thTop+thSub на каждой странице, бюджет страниц, «По проекту»
//     серые в отрисовке (исходник).
//   EXCEL: объединения 6, Print_Titles 1:2, закрепление A3,
//     landscape A4, ширины колонок шаблона, Arial Narrow 12,
//     FFF2F2F2, стили E–G данных = 4/5 (серые), порядок — № п/п.
//   SW: kipia-test-v745 (двойного бампа нет — v730).
//
// Запуск: через tests/run-all.js (require './test-task506.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Вырезка метода (приём test-task505.js)
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end).replace(/(\n[ \t]*\/\/[^\n]*)+[ \t]*$/, '');
}

const CJ_START = INDEX_SRC.indexOf('const KipCableJournal = {');
const CJ_END = INDEX_SRC.indexOf('FlowmeterData — Расходомеры хозрасчётные');
const CJ_SRC = INDEX_SRC.slice(CJ_START, CJ_END > CJ_START ? CJ_END : undefined);
const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// ============================================================
// 1. SRC: колонки шаблона
// ============================================================
describe('Task 506 — SRC: колонки печатной таблицы по шаблону', () => {

    const ROWS = [
        { _row: 2, num: 2, designation: '2/1', start: 'ЩК-4', end: 'ЭЩ №4',
          section: 'по коробу', mark_project: 'КВБбШЭнг-LS',
          cores_project: '14х1', length_project: 60,
          mark_actual: 'КВБбШЭнг-LS', cores_actual: '19х1',
          length_actual: 90, department: 'Водоподготовка',
          purpose: 'Контрольный' },
        { _row: 3, num: 1, designation: '1/7', start: 'ЩК-4', end: 'ЭЩ №4',
          section: 'по коробу', mark_project: 'КВБбШЭнг-LS',
          cores_project: '14х1', length_project: 60,
          mark_actual: 'КВБбШЭнг-LS', cores_actual: '19х1',
          length_actual: 90, department: 'Водоподготовка',
          purpose: 'Контрольный' }
    ];

    function colsHost() {
        return new Function('return ({' +
            methodText(CJ_SRC, '_cjPrintCols') + '\n});')();
    }

    test('10 колонок — ключи и ДОСЛОВНЫЕ подписи шаблона (A–J)', () => {
        const cols = colsHost()._cjPrintCols();
        assertEqual(cols.length, 10, 'ровно 10 колонок шаблона');
        assertEqual(cols.map(function(c) { return c.key; }).join(','),
            'designation,start,end,section,mark_project,cores_project,' +
            'length_project,mark_actual,cores_actual,length_actual',
            'ключи колонок в порядке шаблона');
        assertEqual(cols[0].label, 'Обозначение кабеля, провода', 'A');
        assertEqual(cols[1].label, 'Начало трассы', 'B');
        assertEqual(cols[2].label, 'Конец трассы', 'C');
        assertEqual(cols[3].label, 'Участок трассы кабеля, провода', 'D');
        assertEqual(cols[4].label, 'Марка', 'E');
        assertEqual(cols[5].label, 'Число и сечение жил', 'F');
        assertEqual(cols[6].label, 'Длина, м', 'G');
        assertEqual(cols[7].label, 'Марка', 'H');
        assertEqual(cols[8].label, 'Число и сечение жил', 'I');
        assertEqual(cols[9].label, 'Длина, м', 'J');
        // колонок «№» и «Назначение» из Task 505 в шаблоне НЕТ
        assertTrue(!cols.some(function(c) {
            return c.key === 'num' || c.key === 'purpose';
        }), '«№» и «Назначение» убраны (их нет в шаблоне)');
    });

    test('ширины: 786pt PDF, пропорции шаблона, rowspan/head/align', () => {
        const cols = colsHost()._cjPrintCols();
        let sum = 0;
        cols.forEach(function(c) { sum += c.w; });
        assertEqual(sum, 786, 'сумма ширин = контент A4 альбомной (786pt)');
        // пропорции шаблона: w ∝ ширины Excel-юнитов
        const xl = [17, 19.71, 21, 18.71, 17, 16.71, 11.43, 17, 16.71, 9.43];
        cols.forEach(function(c, i) {
            const ratio = c.w / xl[i];
            assertTrue(ratio > 4.7 && ratio < 4.85,
                'колонка ' + c.key + ': пропорция шаблона (≈4.77pt/юнит)');
        });
        // 4 одиночные (rowspan) + 2 пары (head)
        assertEqual(cols.filter(function(c) { return c.rowspan; }).length, 4,
            '4 одиночные колонки (rowspan 2)');
        assertEqual(cols.filter(function(c) {
            return c.head === 'По проекту';
        }).length, 3, 'пара «По проекту» — 3 подколонки');
        assertEqual(cols.filter(function(c) {
            return c.head === 'Проложен';
        }).length, 3, 'пара «Проложен» — 3 подколонки');
        // выравнивание шаблона: A — центр; B/C/D/E/H — влево; F/G/I/J — центр
        assertEqual(cols[0].align, 'ctr', 'обозначение — центр');
        ['start', 'end', 'section', 'mark_project', 'mark_actual']
            .forEach(function(k) {
                const c = cols.filter(function(x) { return x.key === k; })[0];
                assertEqual(c.align, 'left', k + ' — влево (шаблон)');
            });
        ['cores_project', 'length_project', 'cores_actual', 'length_actual']
            .forEach(function(k) {
                const c = cols.filter(function(x) { return x.key === k; })[0];
                assertEqual(c.align, 'ctr', k + ' — центр (шаблон)');
            });
    });

    test('модель: сортировка «как в исходном файле» — по № п/п', () => {
        const h = new Function('return ({' +
            methodText(CJ_SRC, '_printModel') + '\n' +
            methodText(CJ_SRC, '_cjPrintCols') + '\n' +
            methodText(CJ_SRC, '_cjCellVal') + '\n' +
            methodText(CJ_SRC, '_cjFmtNum') + '\n' +
            '_rows: ' + JSON.stringify(ROWS) + ',' +
            '_allRows: ' + JSON.stringify(ROWS) + ',' +
            '\n});')();
        const m = h._printModel();
        // num 1 отдаётся ВТОРОЙ — печать ставит её первой
        assertEqual(m.rows[0].cells.designation, '1/7',
            'строка №1 (по № п/п) — первая');
        assertEqual(m.rows[1].cells.designation, '2/1',
            'строка №2 — вторая');
        assertEqual(m.rows.length, 2, 'все строки на месте');
    });

    test('_cjSub: только «записей», без «отделений» (сводная снята)', () => {
        const h = new Function('return ({' +
            methodText(CJ_SRC, '_cjSub') + '\n});')();
        assertEqual(h._cjSub({ total: 159, filtered: false }),
            'записей: 159', 'без фильтра');
        assertEqual(h._cjSub({ total: 11, filtered: true, totalAll: 159 }),
            'записей: 11 из 159', 'с фильтром');
        const m = methodText(CJ_SRC, '_cjSub');
        assertTrue(m.indexOf('отделений') === -1,
            '«отделений» больше не считается (группировки нет)');
    });
});

// ============================================================
// 2. SRC: CSS печатного листа по шаблону
// ============================================================
describe('Task 506 — SRC: CSS шаблона', () => {

    function printCss() {
        const i = INDEX_SRC.indexOf('_CJ_PRINT_CSS:');
        return INDEX_SRC.slice(i, INDEX_SRC.indexOf('_cjInjectPrintStyle', i));
    }

    test('шрифт Arial Narrow 12pt, цвет текста чёрный', () => {
        const css = printCss();
        assertTrue(css.indexOf('font-family: "Arial Narrow"') !== -1,
            'семейство Arial Narrow (шаблон)');
        assertTrue(css.indexOf('font-size: 12pt') !== -1,
            'кегль 12pt (шаблон)');
        assertTrue(css.indexOf('color: #000') !== -1,
            'чёрный текст (шаблон)');
    });

    test('сетка чёрная 1px, «По проекту» серые, шапка БЕЗ заливки', () => {
        const css = printCss();
        assertTrue(css.indexOf('border: 1px solid #000') !== -1,
            'чёрная сетка (шаблон — thin black)');
        assertTrue(css.indexOf('td.cjpr-c-proj { background: #f2f2f2') !== -1,
            'серые данные «По проекту» (#f2f2f2 = FFF2F2F2)');
        assertTrue(/th \{[^}]*border: 1px solid #000/.test(css),
            'шапка с сеткой');
        assertFalse(/th \{[^}]*background/.test(css),
            'шапка БЕЗ заливки (в шаблоне фона нет)');
        assertTrue(css.indexOf('print-color-adjust: exact') !== -1,
            'заливка печатается (color-adjust exact)');
    });

    test('шапка на каждой странице печати + строки не рвутся', () => {
        const css = printCss();
        assertTrue(css.indexOf('thead { display: table-header-group; }') !== -1,
            'thead повторяется на каждой странице');
        assertTrue(css.indexOf('page-break-inside: avoid') !== -1,
            'строка не разрезается между страницами');
    });
});

// ============================================================
// 3. SRC: предпросмотр с разбивкой на страницы
// ============================================================
describe('Task 506 — SRC: предпросмотр по страницам A4', () => {

    test('iframe: полная страница 297мм = 1123px', () => {
        const open = methodText(CJ_SRC, '_openCjPreview');
        assertTrue(open.indexOf("frame.style.width = '1123px'") !== -1,
            'ширина iframe 1123px (страница с полями)');
        const fit = methodText(CJ_SRC, '_cjPrevFit');
        assertTrue(fit.indexOf('var W = 1123') !== -1,
            'масштаб от полной страницы 297мм');
    });

    test('документ: страницы 297×210мм, контент 281×194мм', () => {
        const h = new Function('return ({' +
            methodText(CJ_SRC, '_buildCjFileHtml') + '\n' +
            '_CJ_PRINT_CSS: "x",' +
            '_esc: function(s) { return String(s); }' +
            '\n});')();
        const doc = h._buildCjFileHtml('<table class="cjpr-table">T</table>');
        assertTrue(doc.indexOf('width: 297mm') !== -1 &&
                   doc.indexOf('height: 210mm') !== -1,
            'страница — ПОЛНЫЙ лист A4 297×210мм');
        assertTrue(doc.indexOf('padding: 8mm') !== -1,
            '8мм поля страницы (как @page печати)');
        assertTrue(doc.indexOf('box-sizing: border-box') !== -1,
            'поля внутри листа (контент 281×194мм)');
        assertTrue(doc.indexOf('#cjMeasure') !== -1 &&
                   doc.indexOf('width: 281mm') !== -1,
            'мерная таблица шириной контента 281мм');
    });

    test('скрипт пагинации: меряет строки, шапка на каждой странице', () => {
        const m = methodText(CJ_SRC, '_buildCjFileHtml');
        assertTrue(m.indexOf('getBoundingClientRect().height') !== -1,
            'реальные высоты строк');
        assertTrue(m.indexOf('Math.round(194*96/25.4)') !== -1,
            'бюджет страницы = 194мм контента @96dpi');
        assertTrue(m.indexOf('thead.cloneNode(true)') !== -1,
            'шапка клонируется на каждую страницу');
        assertTrue(m.indexOf('colgroup') !== -1 &&
                   m.indexOf('cloneNode(true)') !== -1,
            'колонки клонируются (одинаковая сетка страниц)');
        assertTrue(m.indexOf('removeChild(src)') !== -1,
            'мерная таблица убирается после раскладки');
    });

    test('ИСТОЧНИК: закрывающий тег экранирован <\\/script>', () => {
        // в index.html литерал '<\/script>' — HTML-парсер не закрывает
        // внешний <script> приложения; в ДОКУМЕНТЕ уже обычный </script>
        assertTrue(INDEX_SRC.indexOf("'<\\/script>'") !== -1,
            'литерал <\\/script> в источнике');
        const h = new Function('return ({' +
            methodText(CJ_SRC, '_buildCjFileHtml') + '\n' +
            '_CJ_PRINT_CSS: "x",' +
            '_esc: function(s) { return String(s); }' +
            '\n});')();
        const doc = h._buildCjFileHtml('T');
        assertTrue(doc.indexOf('<script>') !== -1 &&
                   doc.indexOf('</script>') !== -1,
            'в iframe — настоящий скрипт с закрытием');
    });
});

// ============================================================
// 4. VM: PDF по шаблону
// ============================================================
describe('Task 506 — VM: PDF без заголовка, шапка на каждой странице', () => {

    function row(i) {
        return { _row: i + 2, num: i + 1, designation: 'К' + i,
                 start: 'ЩК-4, ШУ-1', end: 'ЭЩ №' + i,
                 section: 'по коробу', mark_project: 'КВБбШЭнг-LS',
                 cores_project: '14х1', length_project: 60,
                 mark_actual: 'КВБбШЭнг-LS', cores_actual: '19х1',
                 length_actual: 90, department: 'D',
                 purpose: 'Контрольный' };
    }

    function layoutHost(rows) {
        return new Function('WorkSchedule', 'KipToast', 'window', 'document',
            'return ({' +
            methodText(CJ_SRC, '_printModel') + '\n' +
            methodText(CJ_SRC, '_cjPrintCols') + '\n' +
            methodText(CJ_SRC, '_cjCellVal') + '\n' +
            methodText(CJ_SRC, '_cjFmtNum') + '\n' +
            methodText(CJ_SRC, '_cjPdfLayout') + '\n' +
            '_rows: ' + JSON.stringify(rows) + ',' +
            '\n});')(undefined, undefined, undefined, undefined);
    }

    test('структура раскладки: без headH/grpH, thH = 18+32', () => {
        const rows = [];
        for (let i = 0; i < 40; i++) rows.push(row(i));
        const h = layoutHost(rows);
        const lay = h._cjPdfLayout(h._printModel());
        assertEqual(lay.headH, undefined, 'шапки-заголовка НЕТ');
        assertEqual(lay.grpH, undefined, 'подзаголовков отделений НЕТ');
        assertEqual(lay.thH, lay.thTop + lay.thSub, 'шапка таблицы 2 строки');
        assertEqual(lay.thTop, 18, 'верхняя строка «По проекту»/«Проложен»');
        assertEqual(lay.thSub, 32, 'подписи подколонок (2 строки)');
        assertEqual(lay.cols.length, 10, '10 колонок');
    });

    test('шапка таблицы «на каждой странице» — бюджет с thead', () => {
        const rows = [];
        for (let i = 0; i < 60; i++) rows.push(row(i));
        const h = layoutHost(rows);
        const lay = h._cjPdfLayout(h._printModel());
        assertTrue(lay.pages.length >= 2,
            'страниц несколько (' + lay.pages.length + ')');
        // инвариант: сумма (thH + строки) ≤ бюджета на КАЖДОЙ странице
        lay.pages.forEach(function(p, pi) {
            let y = lay.thH;
            p.items.forEach(function(it) {
                y += it.lines * lay.lineH + lay.rowPad;
            });
            assertTrue(y <= lay.H - 2 * lay.M + 0.001,
                'страница ' + (pi + 1) + ' с шапкой в бюджете');
        });
        // все строки распределены без потерь
        let n = 0;
        lay.pages.forEach(function(p) { n += p.items.length; });
        assertEqual(n, 60, 'все 60 строк на страницах');
    });

    test('отрисовка: серые «По проекту», Arial Narrow, клип ячеек', () => {
        const m = methodText(CJ_SRC, '_cjPdfPaintPage');
        assertTrue(m.indexOf("'\"Arial Narrow\", Arial, sans-serif'") !== -1,
            'шрифт Arial Narrow (шаблон)');
        assertTrue(m.indexOf("col.head === 'По проекту'") !== -1 &&
                   m.indexOf("'#f2f2f2'") !== -1,
            'серая заливка «По проекту»');
        assertTrue(m.indexOf('ctx.clip()') !== -1,
            'текст клипится в ячейку (нет наложений)');
        assertTrue(m.indexOf("'700 '") !== -1,
            'шапка — жирная (шаблон)');
        assertTrue(m.indexOf("drawTh") !== -1,
            'шапка рисуется (на каждой странице — после пагинации)');
        assertFalse(m.indexOf('КАБЕЛЬНЫЙ ЖУРНАЛ') !== -1,
            'заголовка листа в PDF НЕТ («просто таблицу»)');
    });
});

// ============================================================
// 5. VM: книга Excel по шаблону
// ============================================================
describe('Task 506 — VM: Excel — шапка с объединениями, ширины, стили', () => {

    const ROWS = [
        { _row: 2, num: 1, designation: '1/7', start: 'ЩК-4, ШУ-1',
          end: 'ЭЩ №4', section: 'по коробу',
          mark_project: 'КВБбШЭнг-LS', cores_project: '14х1',
          length_project: 60, mark_actual: 'КВБбШЭнг-LS',
          cores_actual: '19х1', length_actual: 90,
          department: 'Водоподготовка', purpose: 'Контрольный' },
        { _row: 5, num: 2, designation: '5/2', start: 'ЩСУ-2', end: 'Н-1',
          section: 'по лотку', mark_project: 'КГ', cores_project: '1.0',
          length_project: 12, mark_actual: 'КГ', cores_actual: '3х2,5',
          length_actual: 12, department: 'Отделение №2',
          purpose: 'Силовой' }
    ];

    function wsHost() {
        return new Function('return ({' +
            methodText(WS_SRC, '_wsXlsBytes') + '\n' +
            methodText(WS_SRC, '_wsXlsCrc32') + '\n' +
            methodText(WS_SRC, '_wsXlsZip') + '\n' +
            methodText(WS_SRC, '_wsXlsColName') + '\n' +
            methodText(WS_SRC, '_wsXlsEsc') + '\n' +
            methodText(WS_SRC, '_wsXlsDocProps') + '\n' +
            methodText(WS_SRC, '_buildPdfDocument') + '\n' +
            methodText(WS_SRC, '_wsDataUrlBytes') + '\n' +
            methodText(WS_SRC, '_wsDownload') + '\n' +
            '\n});')();
    }

    function cjBookHost(rows, ws) {
        return new Function('WorkSchedule', 'KipToast', 'window', 'document',
            'return ({' +
            methodText(CJ_SRC, '_printModel') + '\n' +
            methodText(CJ_SRC, '_cjPrintCols') + '\n' +
            methodText(CJ_SRC, '_cjCellVal') + '\n' +
            methodText(CJ_SRC, '_cjFmtNum') + '\n' +
            methodText(CJ_SRC, '_buildCjWorkbook') + '\n' +
            methodText(CJ_SRC, '_cjIsoDate') + '\n' +
            '_rows: ' + JSON.stringify(rows) + ',' +
            '_allRows: ' + JSON.stringify(rows) + ',' +
            '\n});')(ws, undefined, undefined, undefined);
    }

    test('ширины колонок — из шаблона, customWidth', () => {
        const ws = wsHost();
        const h = cjBookHost(ROWS, ws);
        const txt = Buffer.from(h._buildCjWorkbook(h._printModel()).bytes)
            .toString('utf8');
        const widths = [17, 19.71, 21, 18.71, 17, 16.71, 11.43, 17, 16.71, 9.43];
        widths.forEach(function(w, i) {
            assertTrue(txt.indexOf('<col min="' + (i + 1) + '" max="' +
                       (i + 1) + '" width="' + w + '" customWidth="1"/>') !== -1,
                'колонка ' + (i + 1) + ' шириной ' + w + ' (шаблон)');
        });
    });

    test('шапка: r1/r2 с объединениями, «По проекту»/«Проложен»', () => {
        const ws = wsHost();
        const h = cjBookHost(ROWS, ws);
        const txt = Buffer.from(h._buildCjWorkbook(h._printModel()).bytes)
            .toString('utf8');
        // r1: A1 «Обозначение…», E1 «По проекту», H1 «Проложен»
        assertTrue(txt.indexOf('<c r="A1"') !== -1 &&
                   txt.indexOf('Обозначение кабеля, провода') !== -1,
            'A1 — первая одиночная колонка');
        assertTrue(txt.indexOf('<c r="E1"') !== -1 &&
                   txt.indexOf('<c r="H1"') !== -1,
            'E1/H1 — ячейки пар');
        // r2: подписи подколонок
        assertTrue(txt.indexOf('<c r="E2"') !== -1 &&
                   txt.indexOf('<c r="F2"') !== -1,
            'подписи подколонок во 2-й строке');
        // высоты строк шапки
        assertTrue(txt.indexOf('<row r="1" ht="34" customHeight="1">') !== -1,
            'r1 повыше (перенос «Обозначение кабеля, провода»)');
    });

    test('стили данных: «По проекту» E–G — серые (s=4/5), остальные 2/3', () => {
        const ws = wsHost();
        const h = cjBookHost(ROWS, ws);
        const txt = Buffer.from(h._buildCjWorkbook(h._printModel()).bytes)
            .toString('utf8');
        // стилевая карта: fillId 2 (F2F2F2) — только у xf 4/5
        const cellXfs = txt.slice(txt.indexOf('<cellXfs'),
                                  txt.indexOf('</cellXfs>'));
        const xfs = cellXfs.split('<xf ').slice(1);
        assertEqual(xfs.length, 6, '6 стилей (1 шапка + 4 данных + 1)');
        assertEqual((cellXfs.match(/fillId="2"/g) || []).length, 2,
            'серые — только 2 стиля (влево/центр «По проекту»)');
        // ячейка E3 (Марка по проекту) — s=4; F3 (жилы, центр) — s=5;
        // B3 (Начало трассы, влево) — s=2; A3 (обозначение, центр) — s=3
        assertTrue(txt.indexOf('<c r="E3" s="4"') !== -1,
            'E3 «По проекту» влево — серый стиль');
        assertTrue(txt.indexOf('<c r="F3" s="5"') !== -1,
            'F3 «По проекту» центр — серый стиль');
        assertTrue(txt.indexOf('<c r="G3" s="5"') !== -1,
            'G3 «По проекту» центр — серый стиль');
        assertTrue(txt.indexOf('<c r="H3" s="2"') !== -1,
            'H3 «Проложен» влево — обычный стиль');
        assertTrue(txt.indexOf('<c r="B3" s="2"') !== -1,
            'B3 влево — обычный');
        assertTrue(txt.indexOf('<c r="A3" s="3"') !== -1,
            'A3 центр — обычный');
    });

    test('числоподобные жилы «1.0» — ЧИСЛОМ в Excel (шаблон)', () => {
        const ws = wsHost();
        const h = cjBookHost(ROWS, ws);
        const txt = Buffer.from(h._buildCjWorkbook(h._printModel()).bytes)
            .toString('utf8');
        // cores_project 2-й строки '1.0' (строка в данных) → <v>1</v>
        const f4 = txt.indexOf('<c r="F4"');
        const seg = txt.slice(f4, txt.indexOf('</c>', f4));
        assertTrue(seg.indexOf('t="inlineStr"') === -1 &&
                   seg.indexOf('<v>1</v>') !== -1,
            'F4 «1.0» записана числом 1 (как в исходном файле)');
    });

    test('печать Excel: A4 альбомная + Print_Titles + закрепление A3', () => {
        const ws = wsHost();
        const h = cjBookHost(ROWS, ws);
        const txt = Buffer.from(h._buildCjWorkbook(h._printModel()).bytes)
            .toString('utf8');
        assertTrue(txt.indexOf('paperSize="9" orientation="landscape"') !== -1,
            'A4 альбомная (шаблон)');
        assertTrue(txt.indexOf(
            '<definedName name="_xlnm.Print_Titles" localSheetId="0">') !== -1,
            'повтор шапки при печати (заявка)');
        assertTrue(txt.indexOf("'Кабельный журнал'!$1:$2") !== -1,
            'диапазон 1:2 (имя листа в апострофах — с пробелом)');
        assertTrue(txt.indexOf(
            '<pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" ' +
            'state="frozen"/>') !== -1,
            'шапка закреплена (скролл данных)');
    });

    test('«просто таблица»: без строк-заголовка и отделений', () => {
        const ws = wsHost();
        const h = cjBookHost(ROWS, ws);
        const txt = Buffer.from(h._buildCjWorkbook(h._printModel()).bytes)
            .toString('utf8');
        // отделений в листе НЕТ (были строками-подзаголовками в 505)
        assertTrue(txt.indexOf('Водоподготовка') === -1,
            'отделений в книге НЕТ');
        // данные с 3-й строки, первая строка данных — r3
        assertTrue(txt.indexOf('<row r="3"') !== -1, 'данные с r3');
        // порядок — № п/п
        assertTrue(txt.indexOf('>1/7<') < txt.indexOf('>5/2<'),
            'порядок исходного файла');
    });
});

// ============================================================
// 6. SW: версия кэша
// ============================================================
describe('Task 506 — SW: kipia-test-v745', () => {
    test('CACHE_VERSION = kipia-test-v745', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v745'") !== -1,
            'версия кэша kipia-test-v745');
        assertFalse(SW_SRC.indexOf('kipia-test-v746') !== -1,
            'двойного бампа нет (v730 отсутствует)');
    });

    test('комментарий Task 506 в истории версий sw.js', () => {
        const i = SW_SRC.indexOf('// Task 506:');
        const v = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v745'");
        assertTrue(i !== -1, 'запись истории на месте');
        assertTrue(i < v, 'история — выше константы версии');
        const cmt = SW_SRC.slice(i, v).toLowerCase();
        assertTrue(cmt.indexOf('шаблону') !== -1 &&
                   cmt.indexOf('разбиением') !== -1 &&
                   cmt.indexOf('страниц') !== -1,
            'суть заявки в комментарии');
    });
});
