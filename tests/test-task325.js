// tests/test-task325.js
// Task 325 — по заявке пользователя: «Ширину столбца сотрудников
// сделать по ширине текста в самом широком. Кнопки
// "Сформировать", "Сохранить (N)", "Отменить" разместить в
// третьей строке под кнопками "Итоги учёта", "Месяц" и "Год".
// Плюс ✕ в шапке шторки убери. В таблице итогов учёта сделай
// тонкие вертикальные линии разделения ячеек».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   HTML: ТРИ ряда колонки кнопок — ряд 1 #wsSelectsRow (селекты +
//   «Обновить»), ряд 2 #wsTotalsRow («Итоги учёта» → «Месяц» →
//   «Год»), ряд 3 #wsActionsRow («Сформировать» → «Сохранить» →
//   «Отменить» — ПОД рядом итогов, заявка); ✕ шапки шторки
//   #wsTtClose УДАЛЁН — в шапке только ⚠ (#wsTtWarn) и «Обновить»
//   (#wsTtRefresh).
//   CSS: ширина колонки «Сотрудник» — var(--ws-emp-w, 180/200px)
//   (база + десктоп fixed-раскладка), кап max-width 180px удалён;
//   у колонки итогов .ws-tt-emp капы 220/150px + эллипсис
//   удалены — ширина по самому широкому тексту; ТОНКИЕ
//   ВЕРТИКАЛЬНЫЕ ЛИНИИ ячеек таблицы итогов (border-right у
//   th/td, последняя колонка — без линии, светлая тема); пустая
//   шапка шторки — филлер 16px (.ws-tt-head-empty).
//   VM: _measureEmpCol — Range-замер натуральной ширины текста
//   (заголовок + .ws-emp-name/.ws-emp-pos каждой строки), максимум
//   + паддинги заголовка + 2px → --ws-emp-w на #page-work-schedule;
//   повтор с той же шириной НЕ пишет; скрытая страница (max < 40) —
//   не трогает; без gridWrap/createRange — тихий выход;
//   _renderGrid зовёт _measureEmpCol ДО _fitGrid (один кадр);
//   init — повторный замер по document.fonts.ready (поздний шрифт);
//   _attachTotalsSync — на МОБАЙЛЕ клик/тап МИМО шторки закрывает
//   её (✕ удалён): слушатель document click, только <1024px,
//   клики по #wsTotalsDrawer/#wsTotalsRow не закрывают.
//   SW: kipia-test-v734.
//
// Запуск: через tests/run-all.js (require './test-task325.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const WS_CLIENT = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        \},|\n    \};/);
    const end = m ? m.index + m[0].length : rest.length;
    let text = rest.slice(0, end);
    text = text.replace(/\n\s{4}\};\s*$/, '');
    return text;
}
function methodFn(src, name, document) {
    const text = methodText(src, name).replace(/,\s*$/, '');
    const body = text.replace(new RegExp('^ {8}' + name + ': '), '');
    return new Function('document', 'return (' + body + ')')(document || null);
}
function wsHost(methodNames, extra, document) {
    const host = Object.assign({}, extra);
    methodNames.forEach(function(n) {
        host[n] = methodFn(WS_CLIENT, n, document || null);
    });
    return host;
}
function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// ============================================================
// 1. HTML: ТРИ ряда тулбара + шапка шторки без ✕
// ============================================================
describe('Task 325 — HTML: три ряда кнопок и шапка без ✕', () => {

    const ws = INDEX_SRC.slice(INDEX_SRC.indexOf('id="page-work-schedule"'),
                                INDEX_SRC.indexOf('id="wsGridWrap"'));

    test('HTML: ТРИ ряда колонки кнопок в порядке заявки', () => {
        const iSel = ws.indexOf('id="wsSelectsRow"');
        const iTot = ws.indexOf('id="wsTotalsRow"');
        const iAct = ws.indexOf('id="wsActionsRow"');
        assertTrue(iSel !== -1, 'ряд 1 (селекты) есть');
        assertTrue(iTot !== -1, 'ряд 2 (итоги) есть');
        assertTrue(iAct !== -1, 'ряд 3 (действия) есть');
        assertTrue(iSel < iTot && iTot < iAct,
            'порядок: селекты → Итоги учёта → действия (ряд 3 ПОД итогами)');
        const totChunk = ws.slice(iTot - 200, iAct);
        assertTrue(totChunk.indexOf('ws-toolbar-row ws-totals-row') !== -1,
            'ряд 2 — класс .ws-toolbar-row .ws-totals-row');
    });

    test('HTML: ряд 2 — «Итоги учёта» → «Месяц» → «Год»', () => {
        const iTot = ws.indexOf('id="wsTotalsRow"');
        const iAct = ws.indexOf('id="wsActionsRow"');
        const chunk = ws.slice(iTot, iAct);
        const iBtn = chunk.indexOf('id="wsTotalsBtn"');
        const iM = chunk.indexOf('id="wsTtTabMonth"');
        const iY = chunk.indexOf('id="wsTtTabYear"');
        assertTrue(iBtn !== -1 && iM !== -1 && iY !== -1, 'кнопка и вкладки в ряду 2');
        assertTrue(iBtn < iM && iM < iY, 'вкладки СПРАВА от «Итоги учёта»');
        assertTrue(chunk.indexOf('aria-pressed="false"') !== -1,
            'кнопка — переключатель (aria-pressed)');
    });

    test('HTML: ряд 3 — «Сформировать» → «Сохранить» → «Отменить»', () => {
        const iAct = ws.indexOf('id="wsActionsRow"');
        // Task 328: перед «Сформировать» стоит кнопка-иконка
        // перекрестья #wsCrossBtn (заявка) — окно поиска расширено.
        // Task 332: САМАЯ ЛЕВАЯ — ещё и кнопка вида #wsViewBtn
        // (3 svg-иконки + крупный комментарий) — окно расширено снова.
        // Task 333: у кнопки вида ПОДПИСЬ «Вид» (span + комментарий) —
        // окно расширено ещё раз (4600 → 5000)
        const chunk = ws.slice(iAct - 80, iAct + 5000);
        const iGen = chunk.indexOf('id="wsGenerateBtn"');
        const iSave = chunk.indexOf('id="wsSaveBtn"');
        const iCancel = chunk.indexOf('id="wsCancelBtn"');
        const iView = chunk.indexOf('id="wsViewBtn"');
        const iCross = chunk.indexOf('id="wsCrossBtn"');
        assertTrue(iGen !== -1 && iSave !== -1 && iCancel !== -1, 'три кнопки есть');
        assertTrue(iGen < iSave && iSave < iCancel,
            'порядок заявки: Сформировать → Сохранить → Отменить');
        assertTrue(iView !== -1 && iCross !== -1 && iView < iCross && iCross < iGen,
            'Task 332: вид → подсветка → Сформировать (слева направо)');
        assertTrue(chunk.indexOf('ws-toolbar-row ws-actions-row') !== -1,
            'ряд 3 — класс .ws-toolbar-row .ws-actions-row');
    });

    test('HTML: ✕ шапки шторки УДАЛЁН (заявка)', () => {
        assertFalse(INDEX_SRC.indexOf('id="wsTtClose"') !== -1,
            'кнопки #wsTtClose нет во всём файле');
        assertFalse(INDEX_SRC.indexOf('ws-tt-close') !== -1,
            'класс .ws-tt-close удалён (CSS+HTML)');
        assertFalse(INDEX_SRC.indexOf('Закрыть панель итогов') !== -1,
            'aria-label «Закрыть панель итогов» удалён');
        const iPanel = INDEX_SRC.indexOf('id="wsTotalsPanel"');
        const chunk = INDEX_SRC.slice(iPanel, iPanel + 2400);
        assertTrue(chunk.indexOf('class="ws-tt-head"') !== -1, 'шапка .ws-tt-head');
        assertTrue(chunk.indexOf('id="wsTtWarn"') !== -1, '⚠ остался (аварийный)');
        // Task 332 (заявка): кнопка «Обновить» шапки УДАЛЕНА
        assertFalse(chunk.indexOf('id="wsTtRefresh"') !== -1,
            '«Обновить» удалён из шапки (Task 332)');
    });
});

// ============================================================
// 2. CSS: колонка по самому широкому тексту + вертикальные линии
// ============================================================
describe('Task 325 — CSS: ширина колонки и линии ячеек', () => {

    test('CSS: колонка «Сотрудник» сетки — var(--ws-emp-w) (база)', () => {
        const m = INDEX_SRC.match(/\.ws-grid thead th\.ws-emp-col\s*\{[^}]*\}/);
        assertTrue(!!m, 'правило th.ws-emp-col');
        assertTrue(!!m && m[0].indexOf('width: var(--ws-emp-w, 180px)') !== -1,
            'ширина — переменная замера (фолбэк 180px)');
        assertFalse(!!m && m[0].indexOf('max-width: 180px') !== -1,
            'жёсткий кап 180px удалён');
        assertTrue(!!m && m[0].indexOf('min-width: 130px') !== -1,
            'минимум остался страховкой');
    });

    test('CSS: десктоп (fixed-раскладка) — тоже var(--ws-emp-w)', () => {
        const th = INDEX_SRC.match(/#page-work-schedule \.ws-grid thead th\.ws-emp-col\s*\{[^}]*\}/);
        assertTrue(!!th && th[0].indexOf('width: var(--ws-emp-w, 200px)') !== -1,
            'thead: ширина по замеру (фолбэк 200px)');
        assertFalse(!!th && th[0].indexOf('width: 200px;') !== -1,
            'фиксированные 200px удалены');
        const td = INDEX_SRC.match(/#page-work-schedule \.ws-grid tbody td\.ws-emp-col\s*\{[^}]*\}/);
        assertTrue(!!td && td[0].indexOf('width: var(--ws-emp-w, 200px)') !== -1,
            'tbody: ширина по замеру');
        assertFalse(!!td && td[0].indexOf('width: 200px;') !== -1,
            'фиксированные 200px в ячейках удалены');
    });

    test('CSS: колонка «Сотрудник» итогов (Task 327: fixed-раскладка месяца)', () => {
        const m = INDEX_SRC.match(/\.ws-tt-table th\.ws-tt-emp,\n\s*\.ws-tt-table td\.ws-tt-emp\s*\{[^}]*\}/);
        assertTrue(!!m, 'правило .ws-tt-emp есть');
        // Task 327 (заявка: равные столбцы): месячная таблица — fixed,
        // капов 220px/150px нет; ГОД — авто-ширина по ФИО (капов нет тоже)
        assertFalse(/\.ws-tt-table th\.ws-tt-emp,\n\s*\.ws-tt-table td\.ws-tt-emp\s*\{[^}]*max-width/.test(INDEX_SRC),
            'кап 220px удалён (год — по самому широкому ФИО)');
        assertFalse(/@media \(max-width: 1023px\)\s*\{[^@]*\.ws-tt-emp[^}]*max-width:\s*150px/.test(INDEX_SRC),
            'мобильный кап 150px удалён');
        // Task 327: месяц — fixed-раскладка, колонке задана ширина
        // (мобайл: ФИО + равные столбцы данных), эллипсис — только
        // в месячной таблице (год — полные ФИО).
        // Task 382-адаптация: доля 42% → var(--ws-tt-emp-w, 42%) —
        // ИЗНАЧАЛЬНАЯ ширина по тексту (как в «Году»), меряет
        // _measureTtEmpFullW; 42% — фолбэк переменной
        const mm = INDEX_SRC.match(/\.ws-tt-table:not\(\.ws-tt-year\) th\.ws-tt-emp,\n\s*\.ws-tt-table:not\(\.ws-tt-year\) td\.ws-tt-emp\s*\{[^}]*\}/);
        assertTrue(!!mm && mm[0].indexOf('width: var(--ws-tt-emp-w, 42%)') !== -1,
            'месяц: ширина по тексту var(--ws-tt-emp-w, 42%) (Task 382; фолбэк — доля 42%)');
        assertTrue(!!mm && mm[0].indexOf('text-overflow: ellipsis') !== -1,
            'месяц: эллипсис ФИО (fixed — не по содержимому)');
        const fix = INDEX_SRC.match(/\.ws-tt-table:not\(\.ws-tt-year\)\s*\{[^}]*table-layout:\s*fixed/);
        assertTrue(!!fix, 'месяц: table-layout fixed — равные столбцы (заявка)');
    });

    test('CSS: ТОНКИЕ ВЕРТИКАЛЬНЫЕ ЛИНИИ ячеек таблицы итогов', () => {
        const m = INDEX_SRC.match(/\.ws-tt-table th,\n\s*\.ws-tt-table td\s*\{[^}]*\}/);
        assertTrue(!!m, 'правило th/td таблицы итогов');
        assertTrue(!!m && m[0].indexOf('border-right: 1px solid') !== -1,
            'вертикальная линия 1px (тонкая, как горизонтальная)');
        assertTrue(!!m && m[0].indexOf('border-bottom: 1px solid') !== -1,
            'горизонтальные линии сохранены');
        const last = INDEX_SRC.match(/\.ws-tt-table th:last-child,\n\s*\.ws-tt-table td:last-child\s*\{[^}]*\}/);
        assertTrue(!!last && last[0].indexOf('border-right: none') !== -1,
            'последняя колонка — без линии (не обводится справа)');
        const light = INDEX_SRC.match(/\[data-theme="light"\] \.ws-tt-table th,\n\s*\[data-theme="light"\] \.ws-tt-table td\s*\{[^}]*\}/);
        assertTrue(!!light && light[0].indexOf('border-right-color') !== -1,
            'светлая тема — вертикальные линии тоже');
    });

    test('CSS: ТРИ ряда × calc((95px − 6px)/3) — действия третьей строкой', () => {
        const m = INDEX_SRC.match(/@media \(min-width: 1024px\)\s*\{[\s\S]*?\.ws-toolbar-row\s*\{[^}]*calc\(\(95px - 6px\) \/ 3\)[^}]*\}/);
        assertTrue(!!m, 'ряд = (95 − 6)/3 — ТРИ ряда, два зазора');
        assertFalse(INDEX_SRC.indexOf('calc((95px - 3px) / 2)') !== -1,
            'формула двух рядов (Task 324) удалена');
    });

    test('CSS: пустая шапка шторки — ПРЯЧЕТСЯ ЦЕЛИКОМ (Task 331)', () => {
        // Task 331 (заявка: «высота шапки столбцов шторки — по высоте
        // шапки сетки»): 16px-филлер УДАЛЁН — шапка таблицы итогов (38px)
        // занимает всю зону шапки сетки; без ⚠/«Обновить» шапка скрыта
        assertFalse(/\.ws-tt-head\.ws-tt-head-empty/.test(INDEX_SRC),
            'правило 16px-филлера удалено (Task 331)');
        const m = INDEX_SRC.match(/\.ws-tt-head\[hidden\]\s*\{\s*display:\s*none[^}]*\}/);
        assertTrue(!!m,
            'шапка без ⚠/«Обновить» скрыта ([hidden], строки от верха)');
    });
});

// ============================================================
// 3. VM: _measureEmpCol — замер ширины по самому широкому тексту
// ============================================================
describe('Task 325 — VM: _measureEmpCol', () => {

    // Мок сетки: Range-замер возвращает заданную ширину текста узла.
    // th = 70; ячейки: name 96 / pos 60, name 142 / pos 120, name 88
    // → максимум 142; паддинги th = 20 → ceil(142 + 20 + 2) = 164px
    function makeMeasureDoc(spec, opts) {
        opts = opts || {};
        const widthMap = new Map();
        const page = {
            style: { props: {}, setPropertyCalls: 0,
                     setProperty: function(k, v) { this.props[k] = v; this.setPropertyCalls++; },
                     getPropertyValue: function(k) { return this.props[k] || ''; },
                     removeProperty: function(k) { delete this.props[k]; } }
        };
        function el(w) {
            const e = {};
            if (w !== undefined && w !== null) widthMap.set(e, w);
            return e;
        }
        function FakeRange() { this.node = null; }
        FakeRange.prototype.selectNodeContents = function(node) { this.node = node; };
        FakeRange.prototype.getBoundingClientRect = function() {
            const w = widthMap.has(this.node) ? widthMap.get(this.node) : 0;
            return { width: w, height: 12 };
        };
        const th = el(spec.th);
        const cells = (spec.cells || []).map(function(c) {
            const nameEl = el(c.name);
            const posEl = (c.pos !== undefined && c.pos !== null) ? el(c.pos) : null;
            return { querySelector: function(sel) {
                if (sel === '.ws-emp-name') return nameEl;
                if (sel === '.ws-emp-pos') return posEl;
                return null;
            } };
        });
        const gridWrap = {
            querySelector: function(sel) { return sel === '.ws-grid thead th.ws-emp-col' ? th : null; },
            querySelectorAll: function(sel) {
                return sel === '.ws-grid tbody td.ws-emp-col' ? cells : [];
            }
        };
        const doc = {
            getElementById: function(id) {
                if (id === 'page-work-schedule') return page;
                if (id === 'wsGridWrap') return opts.noGridWrap ? null : gridWrap;
                return null;
            },
            createRange: opts.noRange ? undefined : function() { return new FakeRange(); }
        };
        return { doc: doc, page: page };
    }

    function withWindow(paddings, fn) {
        const saved = global.window;
        global.window = { getComputedStyle: function() {
            return { paddingLeft: (paddings || 10) + 'px', paddingRight: (paddings || 10) + 'px' };
        } };
        try { fn(); } finally {
            if (saved === undefined) delete global.window;
            else global.window = saved;
        }
    }

    test('VM: _measureEmpCol — максимум текста + паддинги + 2px', () => {
        const md = makeMeasureDoc({
            th: 70,
            cells: [ { name: 96, pos: 60 }, { name: 142, pos: 120 }, { name: 88 } ]
        });
        const host = wsHost(['_measureEmpCol'], {}, md.doc);
        withWindow(10, function() {
            host._measureEmpCol();
        });
        assertEqual(md.page.style.props['--ws-emp-w'], '164px',
            'ceil(142 + 20 паддингов + 2 запас) = 164px');
        assertEqual(md.page.style.setPropertyCalls, 1, 'одно обновление');
    });

    test('VM: та же ширина — повторной записи НЕТ', () => {
        const md = makeMeasureDoc({ th: 70, cells: [ { name: 142 } ] });
        const host = wsHost(['_measureEmpCol'], {}, md.doc);
        withWindow(10, function() {
            host._measureEmpCol();
            host._measureEmpCol();
        });
        assertEqual(md.page.style.setPropertyCalls, 1,
            'значение не изменилось — setProperty не зовётся');
    });

    test('VM: скрытая страница (все rect = 0) — значение НЕ трогается', () => {
        const md = makeMeasureDoc({ th: 0, cells: [ { name: 0 }, { name: 0 } ] });
        md.page.style.props['--ws-emp-w'] = '180px';
        const host = wsHost(['_measureEmpCol'], {}, md.doc);
        withWindow(10, function() {
            host._measureEmpCol();
        });
        assertEqual(md.page.style.props['--ws-emp-w'], '180px', 'прежнее значение');
        assertEqual(md.page.style.setPropertyCalls, 0, 'записи нет');
    });

    test('VM: без сетки / без Range — тихий выход без ошибок', () => {
        const md = makeMeasureDoc({ th: 70, cells: [ { name: 120 } ] }, { noGridWrap: true });
        const host = wsHost(['_measureEmpCol'], {}, md.doc);
        host._measureEmpCol();
        assertEqual(md.page.style.setPropertyCalls, 0, 'нет сетки — нет записи');
        const md2 = makeMeasureDoc({ th: 70, cells: [ { name: 120 } ] }, { noRange: true });
        const host2 = wsHost(['_measureEmpCol'], {}, md2.doc);
        host2._measureEmpCol();
        assertEqual(md2.page.style.setPropertyCalls, 0, 'нет Range-API — нет записи');
    });

    test('VM: должность шире ФИО — берётся ДОЛЖНОСТЬ', () => {
        const md = makeMeasureDoc({
            th: 60,
            cells: [ { name: 96, pos: 155 }, { name: 88 } ]
        });
        const host = wsHost(['_measureEmpCol'], {}, md.doc);
        withWindow(8, function() {
            host._measureEmpCol();
        });
        assertEqual(md.page.style.props['--ws-emp-w'],
            Math.ceil(155 + 16 + 2) + 'px', '155 + 16 паддингов + 2 = 173px');
    });

    test('JS: _renderGrid зовёт _measureEmpCol ДО _fitGrid', () => {
        const rg = methodText(WS_CLIENT, '_renderGrid');
        const iM = rg.indexOf('this._measureEmpCol();');
        const iF = rg.indexOf('this._fitGrid();');
        assertTrue(iM !== -1, 'замер в рендере есть');
        assertTrue(iF !== -1, 'подгонка высот есть');
        assertTrue(iM < iF, 'замер ДО подгонки — раскладка одного кадра');
    });

    test('JS: init — повторный замер по document.fonts.ready', () => {
        const init = INDEX_SRC.slice(INDEX_SRC.indexOf('init: function'),
                                     INDEX_SRC.indexOf('_refreshFromUrlState: function'));
        assertTrue(init.indexOf('document.fonts.ready.then') !== -1,
            'шрифт загрузился поздно — ширины перемеряются');
        assertTrue(init.indexOf('self._measureEmpCol();') !== -1,
            'повторный вызов _measureEmpCol');
    });
});

// ============================================================
// 4. VM: закрытие на мобиле — тап МИМО шторки (✕ удалён)
// ============================================================
describe('Task 325 — VM: мобильное закрытие тапом мимо', () => {

    function makeAttachDoc() {
        const handlers = {};
        const doc = {
            getElementById: function(id) {
                if (id === 'wsGridWrap') return { addEventListener: function() {} };
                if (id === 'wsTtBody') return { addEventListener: function() {} };
                return null;
            },
            addEventListener: function(type, fn) { handlers[type] = fn; }
        };
        return { doc: doc, handlers: handlers };
    }

    function runClick(matchMediaMatches, closest, open) {
        const ad = makeAttachDoc();
        let toggles = 0;
        const host = wsHost(['_attachTotalsSync'], {
            _totalsOpen: open !== false,
            _ttSyncAttached: false,
            toggleTotals: function() { toggles++; }
        }, ad.doc);
        host._attachTotalsSync();
        const saved = global.window;
        global.window = { matchMedia: function(q) {
            return { matches: matchMediaMatches };
        } };
        try {
            ad.handlers['click']({ target: { closest: function(sel) {
                return closest === sel ? { } : null;
            } } });
        } finally {
            if (saved === undefined) delete global.window;
            else global.window = saved;
        }
        return toggles;
    }

    test('VM: тап МИМО шторки на мобиле — ЗАКРЫВАЕТ (toggleTotals)', () => {
        assertEqual(runClick(true, null, true), 1, 'клик вне — закрытие');
    });

    test('VM: клик ПО ШТОРКЕ — не закрывает', () => {
        assertEqual(runClick(true, '#wsTotalsDrawer', true), 0, 'клик по шторке — ничего');
    });

    test('VM: клик по ряду 2 тулбара — не закрывает (кнопка сама тоглится)', () => {
        assertEqual(runClick(true, '#wsTotalsRow', true), 0, 'клик по «Итоги учёта» — без двойного тогла');
    });

    test('VM: ДЕСКТОП — клик мимо шторки НЕ закрывает', () => {
        assertEqual(runClick(false, null, true), 0, 'только мобильный режим <1024px');
    });

    test('VM: закрытая шторка — слушатель молчит', () => {
        assertEqual(runClick(true, null, false), 0, '_totalsOpen=false — выход');
    });

    test('JS: слушатель в _attachTotalsSync — по документу, мобильный', () => {
        const m = methodText(WS_CLIENT, '_attachTotalsSync');
        assertTrue(m.indexOf("document.addEventListener('click'") !== -1,
            'document-клик (✕ удалён — закрытие тапом мимо)');
        assertTrue(m.indexOf("matchMedia('(max-width: 1023px)')") !== -1,
            'только мобильная вёрстка');
        assertTrue(m.indexOf("closest('#wsTotalsDrawer')") !== -1, 'клики по шторке — мимо');
        assertTrue(m.indexOf("closest('#wsTotalsRow')") !== -1, 'клики по ряду итогов — мимо');
        assertTrue(m.indexOf('self.toggleTotals();') !== -1, 'закрытие — toggleTotals');
    });
});

// ============================================================
// 5. SW: версия кэша
// ============================================================
describe('Task 325 — SW', () => {

    test('SW: версия кэша kipia-test-v734 (Task 325)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v734'") !== -1,
            'CACHE_VERSION = kipia-test-v734');
        assertFalse(SW_SRC.indexOf('kipia-test-v735') !== -1,
            'v566 не существует (один инкремент на Task 326)');
    });
});
