// tests/test-task319.js
// Task 319 — четыре правки по заявке пользователя:
//   1) «При наведении на кнопку "Обновить" информационное окошко
//      появляется сверху и частично скрывается под самым верхним
//      баром, поправь» — тултип переносится в <body> (из-под
//      stacking-контекста .page-content z2, который опускал его под
//      верхний бар z70) и позиция «над кнопкой» считается С УЧЁТОМ
//      бара: не хватает места ниже бара — окно ПОД кнопкой.
//   2) «При перемещении указателя мыши по ячейкам шахматки должны
//      выделяться в перекрестье строка и столбец, которые
//      пересекаются в ячейке под указателем» — ПЕРЕКРЕСТЬЕ:
//      делегирование mouseover/mouseout на #wsGridWrap →
//      _cellHover(ri, day) → _rowHover (класс ws-hover-row на <tr>)
//      + _dayHover (столбец, Task 316); снятие — уход с ячеек.
//   3) «В тёмной теме цвет шахматки дней должен оставаться как в
//      светлой теме, только немного притеняться поверхностным
//      фильтром» — [data-theme="dark"]: пустые #eef0f2, выходные
//      #f7d9e3, текст #141413, вся площадь — filter brightness(0.88).
//   4) «В окне с выбором кодов текст названия кода немного меньше и
//      переносится по строкам; окно "Мероприятия в этот день"
//      доступно пользователям с доступом "График работы —
//      просмотр"» — #wsCellPopup .ws-popup-name 12px + wrap;
//      onCellClick зрителя → _openEventsOnlyPopup (справка, без
//      окна кодов и без тоста «нет прав»).
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   CSS: перекрестье — tr.ws-hover-row td.ws-cell inset 0.10 тёмная /
//     0.06 светлая; пересечение (с .ws-hover) 0.24/0.16; выбор дня
//     сильнее строки; сегодня в строке; рамка ws-source-manual не
//     затирается; ФИО-ячейка строки. Тёмная шахматка — цвета светлой
//     темы + brightness; выходные; «·»/пустые; пунктирный бейдж;
//     свотч «.»; порядок (правило ПОСЛЕ .ws-dot-code). Попап кодов —
//     название 12px + white-space normal + break-word; база nowrap.
//   JS: _hoverRow состояние; onMonthChange сброс; _renderGrid
//     штампует ws-hover-row (trClsParts); методы _cellHover/
//     _rowHover/_rowClass; init — делегирование mouseover/mouseout +
//     перенос тултипа в body; _showRefreshTip — .desktop-top-bar +
//     top < barBottom + 4; onCellClick — зритель →
//     _openEventsOnlyPopup, тост «нет прав» УДАЛЁН.
//   VM: _cellHover (строка+столбец, снятие обоих, переходы без
//     мигания — no-op по «не менялся»); _rowHover (смена строк,
//     снятие); _rowClass мягкий к мок-DOM; _showRefreshTip (с баром
//     → под кнопкой, без бара → прежнее поведение);
//     _openEventsOnlyPopup (рендер окна, кловер, позиция, без
//     окна кодов).
//   SW: kipia-test-v736.
//
// Запуск: через tests/run-all.js (require './test-task319.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
// WorkSchedule — срез от «var WorkSchedule = {» (init — НЕуникальное
// имя, есть в других модулях; приём Task 316)
const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// Вырезка метода WorkSchedule: «имя: function» (отступ 8) → следующий
// метод ТОГО ЖЕ уровня.
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

function cssRule(re) { return re.test(INDEX_SRC); }

// ============================================================
// 1. Тултип «Обновить»: перенос в body + учёт верхнего бара
// ============================================================
describe('Task 319 — тултип «Обновить»: не под верхним баром', () => {

    test('JS: init — тултип переносится в <body> (stacking-контекст)', () => {
        const init = methodText(WS_SRC, 'init');
        assertTrue(init.indexOf("getElementById('wsRefreshTip')") !== -1,
            'init находит #wsRefreshTip');
        assertTrue(init.indexOf('document.body.appendChild(rTip)') !== -1,
            'тултип переносится в body — из-под .page-content (z2)');
        assertTrue(init.indexOf('rTip.parentNode !== document.body') !== -1,
            'перенос только если ещё не в body (идемпотентно)');
    });

    test('JS: _showRefreshTip — учёт .desktop-top-bar (barBottom)', () => {
        const m = methodText(INDEX_SRC, '_showRefreshTip');
        assertTrue(m.indexOf(".desktop-top-bar") !== -1,
            'ищет верхний бар (.desktop-top-bar)');
        assertTrue(m.indexOf('barBottom') !== -1,
            'нижняя граница бара учитывается');
        assertTrue(m.indexOf('top < barBottom + 4') !== -1,
            'не хватает места ниже бара — окно ПОД кнопкой');
        assertTrue(m.indexOf('r.bottom + 6') !== -1,
            'под кнопкой (зазор 6px)');
        // мок-DOM в тестах (Task 317) без querySelector — тихо пропускает
        assertTrue(m.indexOf('document.querySelector') !== -1 &&
                   m.indexOf('try {') !== -1,
            'guard: querySelector в try — моки без него работают');
    });

    test('CSS: тултип — z-index выше баров (осталось от Task 317)', () => {
        assertTrue(/\.ws-refresh-tip \{[^}]*z-index:\s*9450/s.test(INDEX_SRC),
            'z-index 9450 — теперь в корневом контексте (в body) выше бара z70');
    });
});

// ============================================================
// 2. Перекрестье: строка + столбец ячейки под курсором
// ============================================================
describe('Task 319 — перекрестье: строка и столбец', () => {

    test('JS: состояние _hoverRow объявлено (рядом с _hoverDay)', () => {
        assertTrue(/_hoverDay: null,\s*\n\s*_selDay: null,/.test(INDEX_SRC),
            '_hoverDay/_selDay на месте (Task 316)');
        assertTrue(INDEX_SRC.indexOf('_hoverRow: null,') !== -1,
            '_hoverRow: null объявлен');
    });

    test('JS: onMonthChange сбрасывает строку перекрестья', () => {
        const m = methodText(INDEX_SRC, 'onMonthChange');
        assertTrue(m.indexOf('this._hoverDay = null;') !== -1, 'день (Task 316)');
        assertTrue(m.indexOf('this._hoverRow = null;') !== -1,
            'строка тоже сбрасывается при смене месяца');
    });

    test('JS: _renderGrid штампует ws-hover-row на <tr> из состояния', () => {
        assertTrue(INDEX_SRC.indexOf("trClsParts.push('ws-hover-row')") !== -1,
            'ws-hover-row пушится в классы строки');
        assertTrue(INDEX_SRC.indexOf('if (ei === this._hoverRow)') !== -1,
            'условие — индекс строки рендера равен _hoverRow');
        // ws-group-first (Task 259) не потерян
        assertTrue(INDEX_SRC.indexOf("trClsParts.push('ws-group-first')") !== -1,
            'ws-group-first живёт в том же массиве');
        assertTrue(/prevTier = empTier;/.test(INDEX_SRC),
            'prevTier обновляется по каждой строке (Task 259)');
    });

    test('JS: методы _cellHover/_rowHover/_rowClass', () => {
        const ch = methodText(INDEX_SRC, '_cellHover');
        assertTrue(ch.indexOf('this._rowHover(null);') !== -1 &&
                   ch.indexOf('this._dayHover(null);') !== -1,
            'null — снимает И строку, И столбец');
        assertTrue(ch.indexOf('this._rowHover(ri);') !== -1 &&
                   ch.indexOf('this._dayHover(day);') !== -1,
            'числа — ставит строку И столбец');

        const rh = methodText(INDEX_SRC, '_rowHover');
        assertTrue(rh.indexOf('if (this._hoverRow === ri) return;') !== -1,
            'no-op если строка не менялась (нет мигания между ячейками)');
        assertTrue(rh.indexOf("toggle('ws-hover-row'") === -1 &&
                   rh.indexOf('_rowClass(prev, false)') !== -1 &&
                   rh.indexOf('_rowClass(ri, true)') !== -1,
            'смена класса через _rowClass(prev→false, new→true)');

        const rc = methodText(INDEX_SRC, '_rowClass');
        assertTrue(rc.indexOf("querySelectorAll('tbody tr')") !== -1,
            'строки — по tbody tr (порядок рендера)');
        assertTrue(rc.indexOf("toggle('ws-hover-row', on)") !== -1,
            'класс ws-hover-row на <tr>');
    });

    test('JS: init — делегирование mouseover/mouseout на контейнере', () => {
        const init = methodText(WS_SRC, 'init');
        assertTrue(init.indexOf("getElementById('wsGridWrap')") !== -1,
            'контейнер сетки найден');
        const iOver = init.indexOf("addEventListener('mouseover'");
        const iOut = init.indexOf("addEventListener('mouseout'");
        assertTrue(iOver !== -1 && iOut !== -1 && iOver < iOut,
            'оба слушателя (mouseover, затем mouseout)');
        assertTrue(init.indexOf("e.target.closest('td.ws-cell, td.ws-emp-col')") !== -1,
            'ячейка дня ИЛИ ФИО находится closest (Task 378: ФИО тоже подсвечивает строку)');
        assertTrue(init.indexOf('tr.sectionRowIndex') !== -1,
            'строка — sectionRowIndex (порядок tbody)');
        assertTrue(init.indexOf("to.closest('td.ws-cell, td.ws-emp-col')") !== -1,
            'mouseout: переход на другую ячейку/ФИО — подсветку НЕ трогаем');
    });

    test('CSS: перекрестье — тёмная тема', () => {
        assertTrue(cssRule(/\.ws-grid tbody tr\.ws-hover-row td\.ws-cell \{[^}]*rgba\(74, 143, 199, 0\.30\)[^}]*\}/s),
            'строка — inset 0.30 (Task 378: яркость «сегодня»)');
        assertTrue(cssRule(/tr\.ws-hover-row td\.ws-cell\.ws-hover \{[^}]*rgba\(74, 143, 199, 0\.34\)[^}]*\}/s),
            'ПЕРЕСЕЧЕНИЕ строки и столбца — 0.34 (насыщеннее, Task 378)');
        assertTrue(cssRule(/tr\.ws-hover-row td\.ws-cell\.ws-sel \{[^}]*rgba\(74, 143, 199, 0\.34\)[^}]*\}/s),
            'выбранный кликом день в строке — выбор не затирается');
        assertTrue(cssRule(/tr\.ws-hover-row td\.ws-cell\.ws-today \{[^}]*rgba\(74, 143, 199, 0\.34\)[^}]*\}/s),
            '«сегодня» в наведённой строке (Task 377 → 378: 0.32 → 0.34)');
        assertTrue(cssRule(/tr\.ws-hover-row td\.ws-cell\.ws-source-manual \{[^}]*0\.30\),[^}]*1\.5px rgba\(255,255,255,0\.5\)[^}]*\}/s),
            'рамка ручной записи не затирается заливкой строки');
        assertTrue(cssRule(/tr\.ws-hover-row td\.ws-emp-col \{[^}]*rgba\(74, 143, 199, 0\.30\)[^}]*\}/s),
            'ФИО-ячейка строки — «начало» перекрестья');
    });

    test('CSS: перекрестье — светлая тема (тон мягче)', () => {
        assertTrue(cssRule(/\[data-theme="light"\] \.ws-grid tbody tr\.ws-hover-row td\.ws-cell \{[^}]*rgba\(42, 93, 143, 0\.22\)[^}]*\}/s),
            'строка — 0.22 (Task 378: яркость «сегодня»)');
        assertTrue(cssRule(/\[data-theme="light"\][^{]*tr\.ws-hover-row td\.ws-cell\.ws-hover \{[^}]*rgba\(42, 93, 143, 0\.26\)[^}]*\}/s),
            'пересечение — 0.26 (насыщеннее, Task 378)');
        assertTrue(cssRule(/\[data-theme="light"\][^{]*tr\.ws-hover-row td\.ws-cell\.ws-sel \{[^}]*rgba\(42, 93, 143, 0\.26\)[^}]*\}/s),
            'выбранный день в строке — не затирается');
        assertTrue(cssRule(/\[data-theme="light"\][^{]*tr\.ws-hover-row td\.ws-emp-col \{[^}]*rgba\(42, 93, 143, 0\.22\)[^}]*\}/s),
            'ФИО-ячейка (светлая)');
    });

    // ---------- VM: перекрестье на моках ----------

    function fakeTr() {
        const cls = new Set();
        return {
            tagName: 'TR',
            classList: {
                toggle: function(c, on) { if (on) cls.add(c); else cls.delete(c); },
                contains: function(c) { return cls.has(c); }
            },
            classes: cls
        };
    }
    function fakeCell(tag) {
        const cls = new Set();
        return {
            tagName: tag,
            classList: {
                toggle: function(c, on) { if (on) cls.add(c); else cls.delete(c); },
                contains: function(c) { return cls.has(c); }
            },
            classes: cls
        };
    }

    // Мок-DOM: 3 строки (tr с td), столбцы по data-day
    function makeGridDom() {
        const rows = [fakeTr(), fakeTr(), fakeTr()];
        const byDay = {};
        [5, 7].forEach(function(d) {
            byDay[String(d)] = [fakeCell('TH'), fakeCell('TD'), fakeCell('TD'), fakeCell('TD')];
        });
        const wrap = {
            querySelectorAll: function(sel) {
                if (sel === 'tbody tr') return rows;
                var m = String(sel).match(/\[data-day="(\d+)"\]/);
                return m ? (byDay[m[1]] || []) : [];
            }
        };
        var document = {
            getElementById: function(id) {
                return id === 'wsGridWrap' ? wrap : null;
            }
        };
        return { rows: rows, byDay: byDay, wrap: wrap, document: document };
    }

    const CROSS = ['_cellHover', '_rowHover', '_rowClass', '_dayHover', '_dayColClass'];
    function makeCrossCtx(dom) {
        const texts = CROSS.map(n => methodText(INDEX_SRC, n)).filter(t => t.length > 0);
        assertEqual(texts.length, CROSS.length, 'все методы найдены');
        const make = new Function('document',
            'return ({' + texts.join('\n') + '\n' +
            '_hoverDay: null, _hoverRow: null' + '\n});');
        return make(dom.document);
    }

    test('VM: _cellHover — строка И столбец, снятие обоих', () => {
        const dom = makeGridDom();
        const ctx = makeCrossCtx(dom);
        ctx._cellHover(1, 5);
        assertEqual(ctx._hoverRow, 1, '_hoverRow = 1');
        assertEqual(ctx._hoverDay, 5, '_hoverDay = 5');
        assertTrue(dom.rows[1].classList.contains('ws-hover-row'),
            'строка 1 получила ws-hover-row');
        assertFalse(dom.rows[0].classList.contains('ws-hover-row'), 'строка 0 чиста');
        assertFalse(dom.rows[2].classList.contains('ws-hover-row'), 'строка 2 чиста');
        assertTrue(dom.byDay['5'][0].classList.contains('ws-hover-col'),
            'th дня 5 — ws-hover-col');
        assertTrue(dom.byDay['5'][1].classList.contains('ws-hover'),
            'td дня 5 — ws-hover');
        assertFalse(dom.byDay['7'][0].classList.contains('ws-hover-col'),
            'столбец 7 не подсвечен');

        // переход на соседнюю ячейку (другой день, ТА ЖЕ строка):
        // строка не мигает (no-op по «не менялся»), столбец сменится
        ctx._cellHover(1, 7);
        assertTrue(dom.rows[1].classList.contains('ws-hover-row'),
            'строка 1 осталась подсвеченной (без мигания)');
        assertFalse(dom.byDay['5'][0].classList.contains('ws-hover-col'),
            'столбец 5 снят');
        assertTrue(dom.byDay['7'][0].classList.contains('ws-hover-col'),
            'столбец 7 поставлен');

        // смена строки: прежняя гаснет
        ctx._cellHover(2, 7);
        assertFalse(dom.rows[1].classList.contains('ws-hover-row'),
            'строка 1 снята');
        assertTrue(dom.rows[2].classList.contains('ws-hover-row'),
            'строка 2 поставлена');

        // уход с ячеек — снимается ВСЁ
        ctx._cellHover(null);
        assertFalse(dom.rows[2].classList.contains('ws-hover-row'), 'строка снята');
        assertFalse(dom.byDay['7'][0].classList.contains('ws-hover-col'), 'столбец снят');
        assertEqual(ctx._hoverRow, null, '_hoverRow null');
        assertEqual(ctx._hoverDay, null, '_hoverDay null');
    });

    test('VM: _rowClass — мягкий к мок-DOM (нет wrap/индекс вне)', () => {
        const doc = { document: { getElementById: function() { return null; } } };
        const ctx = makeCrossCtx(doc);
        ctx._rowClass(0, true); // нет wsGridWrap — тихо
        ctx._rowClass(-1, true); // отрицательный индекс — тихо
        assertTrue(true, 'нет DOM — не бросает');
        // индекс за пределами строк
        const dom = makeGridDom();
        const ctx2 = makeCrossCtx(dom);
        ctx2._rowClass(99, true); // 3 строки — индекс 99 вне
        assertTrue(true, 'индекс вне диапазона — тихо');
    });
});

// ============================================================
// 3. Тёмная тема: цвета шахматки дней как в светлой + фильтр
// ============================================================
describe('Task 319 — тёмная тема: шахматка дней как в светлой', () => {

    test('CSS: [data-theme="dark"] td.ws-cell — светлые цвета + фильтр', () => {
        assertTrue(cssRule(/\[data-theme="dark"\] \.ws-grid tbody td\.ws-cell \{[^}]*background:\s*#eef0f2;[^}]*\}/s),
            'пустые ячейки — #eef0f2 (как в светлой теме)');
        assertTrue(cssRule(/\[data-theme="dark"\] \.ws-grid tbody td\.ws-cell \{[^}]*color:\s*#141413;[^}]*\}/s),
            'текст кодов — тёмный #141413 (--text-primary светлой)');
        assertTrue(cssRule(/\[data-theme="dark"\] \.ws-grid tbody td\.ws-cell \{[^}]*filter:\s*brightness\(0\.88\);[^}]*\}/s),
            'вся площадь — поверхностный фильтр brightness(0.88)');
    });

    test('CSS: тёмная тема — праздники/пустые/бейджи как в светлой', () => {
        // Task 363: розовый — только праздники (#f8e2e9, бывший цвет
        // выходных Tasks 254/355); тёмная несёт его под фильтром 319
        assertTrue(cssRule(/\.ws-grid tbody td\.ws-cell\.ws-feast\.ws-status-empty \{[^}]*background:\s*#f8e2e9;[^}]*\}/s),
            'праздники — #f8e2e9 в базе (тёмная под фильтром Task 363)');
        assertTrue(cssRule(/\[data-theme="dark"\] \.ws-grid tbody td\.ws-cell\.ws-status-empty \{[^}]*color:\s*rgba\(20, 20, 19, 0\.65\)[^}]*\}/s),
            '«·»/пустые — вторичный тёмный (как в светлой)');
        // Task 388: правило тёмной темы пунктирного бейджа удалено
        assertFalse(INDEX_SRC.indexOf('[data-theme="dark"] .ws-grid tbody td.ws-cell .ws-ev-badge.ws-ev-pending') !== -1,
            'пунктирных бейджей больше нет (Task 388)');
        assertTrue(cssRule(/\[data-theme="dark"\] \.ws-popup-swatch\.ws-swatch-dot \{[^}]*background:\s*#eef0f2;[^}]*\}/s),
            'свотч «.» в попапе — светлый (совпадает с ячейкой)');
    });

    test('CSS: порядок — тёмное правило ПОСЛЕ .ws-dot-code (специфичность)', () => {
        const iDot = INDEX_SRC.indexOf('.ws-grid tbody td.ws-cell.ws-dot-code {');
        const iDark = INDEX_SRC.indexOf('[data-theme="dark"] .ws-grid tbody td.ws-cell {');
        assertTrue(iDot !== -1 && iDark !== -1 && iDot < iDark,
            'тёмное правило ниже — при равной специфичности побеждает');
    });

    test('CSS: базовые правила тёмной темы НЕ тронуты (история Tasks)', () => {
        // база (тёмная по умолчанию) осталась — светлая тема не затронута,
        // тёмная перекрывается только [data-theme="dark"]-правилами Task 319
        assertTrue(cssRule(/\.ws-grid tbody td\.ws-cell \{[^}]*background:\s*var\(--bg-primary[^}]*\}/s),
            'база .ws-cell — var(--bg-primary) (правка НЕ в базе)');
        assertTrue(cssRule(/\[data-theme="light"\] \.ws-grid tbody td\.ws-cell\.ws-feast\.ws-status-empty \{[^}]*#f8e2e9[^}]*\}/s),
            'светлое правило праздников #f8e2e9 — на месте (Task 363)');
        assertTrue(cssRule(/\[data-theme="light"\] \.ws-grid tbody td\.ws-cell \{[^}]*background:\s*#FFFFFF;[^}]*\}/s),
            'светлая тема: пустые ячейки #FFFFFF (Task 379, было #eef0f2)');
    });
});

// ============================================================
// 4. Окно выбора кодов: название мельче + перенос; окно
//    «Мероприятия в этот день» — зрителям
// ============================================================
describe('Task 319 — окно кодов и «Мероприятия в этот день»', () => {

    test('CSS: #wsCellPopup .ws-popup-name — 10px (Task 330: маленький) + перенос', () => {
        // Task 330 (заявка): шрифт ОПИСАНИЯ кодов — маленький (10px,
        // прежде Task 319 12px)
        assertTrue(cssRule(/#wsCellPopup \.ws-popup-name \{[^}]*font-size:\s*10px;[^}]*\}/s),
            'название кода — 10px (Task 330: «маленький»)');
        assertTrue(cssRule(/#wsCellPopup \.ws-popup-name \{[^}]*white-space:\s*normal;[^}]*\}/s),
            'перенос по строкам (white-space: normal)');
        assertTrue(cssRule(/#wsCellPopup \.ws-popup-name \{[^}]*overflow-wrap:\s*break-word;[^}]*\}/s),
            'длинные слова переносятся (break-word)');
        // база для ОСТАЛЬНЫХ окон — прежний однострочный вид
        assertTrue(cssRule(/\.ws-popup-name \{[^}]*white-space:\s*nowrap;[^}]*overflow:\s*hidden;[^}]*\}/s),
            'база .ws-popup-name — nowrap+ellipsis (другие окна)');
    });

    test('JS: onCellClick — зритель → окно мероприятий (без тоста)', () => {
        const m = methodText(INDEX_SRC, 'onCellClick');
        assertTrue(m.indexOf('this.closeEmpPopup();') !== -1,
            'карточка сотрудника закрывается (Task 309)');
        assertTrue(m.indexOf('this._openEventsOnlyPopup(td, isoDate, tabNo);') !== -1,
            'зритель → _openEventsOnlyPopup (справка)');
        assertTrue(m.indexOf('this._openCellPopup(td, isoDate, tabNo);') !== -1,
            'редактор → прежнее окно кодов');
        assertTrue(m.indexOf('У вас нет прав на правку графика') === -1,
            'тост «нет прав» УДАЛЁН (заявка: окно должно открываться)');
    });

    test('JS: _openEventsOnlyPopup — метод', () => {
        const m = methodText(INDEX_SRC, '_openEventsOnlyPopup');
        assertTrue(m.indexOf("getElementById('wsEventsPopup')") !== -1,
            'окно «Мероприятия в этот день»');
        assertTrue(m.indexOf('this._renderEventsPopup(isoDate, tabNo)') !== -1,
            'содержимое — тот же _renderEventsPopup (кнопки ✎/✕ в нём _canEdit-gated)');
        assertTrue(m.indexOf("getElementById('wsPopupCloser')") !== -1 &&
                   m.indexOf("closer.classList.add('active')") !== -1,
            'кловер активен — клик мимо закрывает');
        assertTrue(m.indexOf("evp.classList.add('active')") !== -1,
            'окно активно');
        assertTrue(m.indexOf('rect.right + 6') !== -1,
            'позиция — рядом с ячейкой (правее, как у окна кодов)');
        assertTrue(m.indexOf("getElementById('wsCellPopup')") === -1,
            'окно выбора кодов НЕ трогается (зрителю не показывается)');
    });

    // ---------- VM ----------

    test('VM: _openEventsOnlyPopup — рендер, кловер, окно активно', () => {
        const evp = { innerHTML: '', style: {}, classList: new Set(),
                      offsetWidth: 240, offsetHeight: 90 };
        evp.classList = {
            add: function(c) { evp.classList._s.add(c); },
            remove: function(c) { evp.classList._s.delete(c); },
            contains: function(c) { return evp.classList._s.has(c); },
            _s: new Set()
        };
        const closer = { classList: { add: function(c) { closer.active = c; },
                                      remove: function() {} } };
        const doc = {
            getElementById: function(id) {
                if (id === 'wsEventsPopup') return evp;
                if (id === 'wsPopupCloser') return closer;
                return null;
            }
        };
        const texts = ['_openEventsOnlyPopup', '_renderEventsPopup', '_eventsAt',
                       '_instrShortOf', '_normInstrKey',
                       '_trainingCodeOf', '_statusMeta', '_esc',
                       // Task 434: дата окна — дд.мм.гггг (_fmtDateRu);
                       // идёт ДО «_escAttr» — вырезка последнего метода без
                       // хвостовой запятой должна остаться последней
                       '_fmtDateRu', '_escAttr']
            .map(n => methodText(INDEX_SRC, n));
        // «var o = {…}; o._canEdit = …; return o;» — без запятых на стыке
        // (последний метод может не иметь хвостовой запятой)
        const make = new Function('document', 'window',
            'var o = {' + texts.join('\n') + '\n};' +
            'o._canEdit = false;' +
            "o._isInstrType = function(t) { return t === 'инструктаж' || t === 'проверка_знаний'; };" +
            "o._EMPLOYEES = [{ 'таб_номер': '0871', 'ФИО': 'Иванов И. И.' }];" +
            "o._TRAININGS = [{ id: 41, 'таб_номер': '0871', тип: 'инструктаж', дата_начала: '2026-09-05', дата_окончания: '2026-09-05', тема: 'Целевой инструктаж' }];" +
            "o._STATUS_CODES = [{ code: 'И', name: 'Инструктаж', color: '#B3E5FC' }];" +
            'return o;');
        const ctx = make(doc, { innerWidth: 1280, innerHeight: 800 });
        ctx._openEventsOnlyPopup({ getBoundingClientRect: function() {
            return { top: 300, left: 400, right: 440, bottom: 339 };
        }}, '2026-09-05', '0871');
        assertTrue(evp.innerHTML.indexOf('Мероприятия в этот день') !== -1,
            'заголовок окна');
        assertTrue(evp.innerHTML.indexOf('Иванов И. И.') !== -1,
            'подстрока контекста (дата · ФИО)');
        // Task 434: дата окна мероприятий ячейки — дд.мм.гггг (не ISO)
        assertTrue(evp.innerHTML.indexOf('05.09.2026') !== -1,
            'Task 434: дата в подстроке — 05.09.2026 (дд.мм.гггг)');
        assertTrue(evp.innerHTML.indexOf('2026-09-05') === -1,
            'Task 434: ISO-даты в окне больше нет');
        assertTrue(evp.innerHTML.indexOf('Целевой инструктаж') !== -1,
            'тема мероприятия видна');
        assertTrue(evp.innerHTML.indexOf('editTraining') === -1 &&
                   evp.innerHTML.indexOf('deleteTraining') === -1,
            'зрителю БЕЗ кнопок ✎/✕');
        assertTrue(evp.classList.contains('active'), 'окно активно');
        assertEqual(closer.active, 'active', 'кловер активен');
        assertEqual(evp.style.left, '446px', 'позиция — правее ячейки (440+6)');
        assertEqual(evp.style.top, '300px', 'верх — по ячейке');
        assertEqual(evp.style.visibility, '', 'видимость восстановлена');
    });

    test('VM: _showRefreshTip — с верхним баром окно ПОД кнопкой', () => {
        const tip = { hidden: true, style: {}, offsetHeight: 56 };
        const date = { textContent: '' };
        const btn = { getBoundingClientRect: function() {
            return { top: 76, left: 30, bottom: 106, right: 141 };
        }};
        // бар: sticky, высота 56 — низ на y=56
        const bar = { getBoundingClientRect: function() {
            return { top: 0, bottom: 56, height: 56, left: 0, right: 1280 };
        }};
        const doc = {
            getElementById: function(id) {
                if (id === 'wsRefreshTip') return tip;
                if (id === 'wsRefreshTipDate') return date;
                if (id === 'wsRefreshBtn') return btn;
                return null;
            },
            querySelector: function(sel) {
                return sel === '.desktop-top-bar' ? bar : null;
            }
        };
        const texts = ['_updateCacheStamp', '_showRefreshTip', '_hideRefreshTip']
            .map(n => methodText(INDEX_SRC, n));
        const make = new Function('document', 'return ({' + texts.join('\n') + '\n});');
        const ctx = make(doc);
        ctx._cacheTs = new Date(2026, 8, 5, 14, 22, 0).getTime();
        ctx._showRefreshTip();
        // над кнопкой: 76 − 56 − 8 = 12 < 56+4 → ПОД кнопкой: 106 + 6 = 112
        assertEqual(tip.style.top, '112px', 'места ниже бара нет — окно ПОД кнопкой');
        assertEqual(tip.style.left, '30px', 'лево — по кнопке');

        // без бара (мобайл/моки): прежнее поведение — НАД кнопкой
        const doc2 = {
            getElementById: doc.getElementById,
            querySelector: function() { return null; }
        };
        const ctx2 = make(doc2);
        ctx2._cacheTs = ctx._cacheTs;
        ctx2._showRefreshTip();
        assertEqual(tip.style.top, '12px', 'бара нет — окно НАД кнопкой (76−56−8)');
    });
});

// ------------------------------------------------------------
// Service Worker
// ------------------------------------------------------------
describe('Task 319 — Service Worker', () => {
    test('SW: версия кэша kipia-test-v736', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v736') !== -1,
            'CACHE_VERSION = kipia-test-v736 (Task 319)');
        assertFalse(SW_SRC.indexOf('kipia-test-v737') !== -1,
            'нет лишнего инкремента');
    });
});
