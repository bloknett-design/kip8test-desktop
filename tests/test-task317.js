// tests/test-task317.js
// Task 317 — бар над шахматкой (по заявке пользователя):
//   «Строку "данные от" после кнопки "Обновить" убрать в
//    информационное окно, появляющееся при наведении указателя
//    мыши на кнопку "Обновить". Габариты кнопок в баре нужно
//    сделать, чтобы все кнопки в три ряда помещались ровно в
//    высоту окон справа от них, и расстояние между рядами кнопок
//    должно быть 3px. Рамки от границ бара до его внутренних
//    элементов должны быть 5px и не изменяться.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   HTML: колонка кнопок .ws-toolbar-main с ТРЕМЯ рядами —
//     .ws-toolbar-row (#wsSelectsRow: селекты + «Обновить»),
//     .ws-actions-row (ряд 2), .ws-generate-row (ряд 3) — ряды
//     ВНУТРИ колонки, окна (#wsEventsPanel/#wsCalPanel) — рядом;
//     штамп #wsCacheStamp УДАЛЁН, вместо него тултип
//     #wsRefreshTip (+ #wsRefreshTipDate + .ws-rt-desc) после
//     бара; у кнопки «Обновить» нет длинного нативного title.
//   CSS: база — .ws-toolbar-main column + gap 3px; ряды
//     (.ws-toolbar-row/.ws-actions-row/.ws-generate-row) flex
//     с gap 8px и wrap; [hidden] — display:none; десктоп
//     (media ≥1024px): .ws-toolbar-main height 95px (РОВНО окна),
//     ряды height calc((95px - 6px)/3) + nowrap + stretch,
//     кнопки/селекты height 100% + padding 4px 9px (Task 328 —
//     заявка: кнопки немного меньше; было 4px 12px); окна
//     95px/justify-self stretch; .ws-toolbar padding 5px —
//     НЕ меняется (заявка: рамки бара 5px); тултип — fixed,
//     pointer-events none, [hidden], z-index, светлая тема.
//   JS: _updateCacheStamp пишет в #wsRefreshTipDate (без данных —
//     «локальных данных ещё нет»); _showRefreshTip/_hideRefreshTip
//     (позиция над кнопкой/под ней при нехватке места, hidden);
//     init — слушатели mouseenter/mouseleave/focus/blur/click на
//     кнопке + scroll-capture; loadGrid вызывает _updateCacheStamp
//     (3 ветки — как в Task 314).
//   VM: _updateCacheStamp (формат/подсказка), _showRefreshTip/
//     _hideRefreshTip на моках (скрытие, позиция сверху/снизу).
//   SW: kipia-test-v753.
//
// Запуск: через tests/run-all.js (require './test-task317.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

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

// ------------------------------------------------------------
// HTML: два ряда в колонке кнопок + тултип вместо штампа
// (Task 324: рядов СТАЛО ДВА — нижний ряд один, с блоком итогов)
// ------------------------------------------------------------
describe('Task 317 — HTML: колонка кнопок из двух рядов (Task 324)', () => {

    const ws = INDEX_SRC.slice(INDEX_SRC.indexOf('id="page-work-schedule"'),
                                INDEX_SRC.indexOf('id="wsGridWrap"'));

    test('HTML: ряд 1 — .ws-toolbar-row #wsSelectsRow (селекты + «Обновить»)', () => {
        const iMain = ws.indexOf('class="ws-toolbar-main"');
        const iRow1 = ws.indexOf('id="wsSelectsRow"');
        const iMonth = ws.indexOf('id="wsMonthSel"');
        const iYear = ws.indexOf('id="wsYearSel"');
        const iRefresh = ws.indexOf('id="wsRefreshBtn"');
        assertTrue(iRow1 !== -1, 'обёртка ряда 1 #wsSelectsRow есть');
        assertTrue(iMain !== -1 && iMain < iRow1, 'ряд 1 — внутри колонки .ws-toolbar-main');
        assertTrue(iRow1 < iMonth && iMonth < iYear && iYear < iRefresh,
            'в ряду 1: месяц → год → «Обновить»');
        assertTrue(ws.indexOf('class="ws-toolbar-row" id="wsSelectsRow"') !== -1,
            'класс .ws-toolbar-row у ряда 1');
    });

    test('HTML: три ряда — внутри колонки, окна после неё (Task 324 → 325)', () => {
        const iMain = ws.indexOf('class="ws-toolbar-main"');
        const iRow1 = ws.indexOf('id="wsSelectsRow"');
        const iTot = ws.indexOf('id="wsTotalsRow"');
        const iAct = ws.indexOf('id="wsActionsRow"');
        const iEv = ws.indexOf('id="wsEventsPanel"');
        const iCal = ws.indexOf('id="wsCalPanel"');
        assertTrue(iMain < iRow1 && iRow1 < iTot && iTot < iAct,
            'колонка: ряд 1 (селекты) → ряд 2 (итоги) → ряд 3 (действия, Task 325)');
        assertTrue(iAct < iEv && iEv < iCal,
            'ряд 3 до окон; окна — СПРАВА от колонки кнопок');
        assertFalse(ws.indexOf('id="wsGenerateRow"') !== -1,
            'отдельный ряд генерации удалён');
    });

    test('HTML: штамп из бара удалён', () => {
        assertTrue(ws.indexOf('id="wsCacheStamp"') === -1,
            'штампа #wsCacheStamp в баре нет');
        assertTrue(INDEX_SRC.indexOf('.ws-cache-stamp') === -1,
            'мёртвый класс .ws-cache-stamp удалён');
    });

    test('HTML: тултип #wsRefreshTip — информационное окно кнопки', () => {
        const iTip = ws.indexOf('id="wsRefreshTip"');
        assertTrue(iTip !== -1, 'окно есть');
        assertTrue(ws.indexOf('id="wsRefreshTip" class="ws-refresh-tip" hidden') !== -1,
            'скрыто по умолчанию (hidden)');
        assertTrue(ws.indexOf('id="wsRefreshTipDate"') !== -1,
            'строка-дата #wsRefreshTipDate');
        const desc = ws.slice(iTip, iTip + 700);
        assertTrue(desc.indexOf('ws-rt-desc') !== -1 &&
                   desc.indexOf('Обновить данные графика') !== -1,
            'описание кнопки (бывший title) — в окне');
        // нативного title у кнопки нет (не двойное окно)
        const iRefresh = ws.indexOf('id="wsRefreshBtn"');
        const btn = ws.slice(iRefresh - 100, iRefresh + 500);
        assertFalse(/title="/.test(btn),
            'у кнопки «Обновить» нет нативного title');
    });
});

// ------------------------------------------------------------
// CSS: зазоры 3px, высота ровно в окна, рамка бара 5px, тултип
// ------------------------------------------------------------
describe('Task 317 — CSS: габариты и зазоры', () => {

    test('CSS: колонка кнопок — column, зазор между рядами 3px', () => {
        const re = /\.ws-toolbar-main \{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*gap:\s*3px/;
        assertTrue(re.test(INDEX_SRC),
            'базовая колонка: flex column, gap 3px (расстояние между рядами)');
    });

    test('CSS: ряды — flex с gap 8px, wrap (мобильный перенос)', () => {
        const re = /\.ws-toolbar-row \{[^}]*display:\s*flex[^}]*gap:\s*8px[^}]*flex-wrap:\s*wrap/;
        assertTrue(re.test(INDEX_SRC), 'общее правило рядов (Task 324: ряд один класс)');
        // Task 324: скрытие пустых рядов [hidden] удалено — нижний ряд
        // всегда на виду (кнопки итогов видны всем ролям)
        assertFalse(INDEX_SRC.indexOf('.ws-actions-row[hidden]') !== -1,
            'скрытие ряда действий удалено (Task 324)');
    });

    test('CSS: десктоп — колонка РОВНО в высоту окон (95px)', () => {
        // правило .ws-toolbar-main с height 95px — десктопное (Task 317):
        // колонка кнопок занимает РОВНО высоту окон справа
        assertTrue(/\.ws-toolbar-main \{[^}]*height:\s*95px/.test(INDEX_SRC),
            'высота колонки = высота окон (95px)');
        assertTrue(/\.ws-toolbar-main \{[^}]*height:\s*95px[^}]*flex-wrap:\s*nowrap/.test(INDEX_SRC),
            'перенос выключен (колонка не превышает 95px)');
    });

    test('CSS: десктоп — ТРИ ряда × calc((95px − 6px)/3) (Task 324 → 325)', () => {
        const m = INDEX_SRC.match(/@media \(min-width: 1024px\)\s*\{[\s\S]*?\.ws-toolbar-row\s*\{[^}]*calc\(\(95px - 6px\) \/ 3\)[^}]*\}/);
        assertTrue(!!m, 'ряд = (95 − 6px)/3 — ТРИ ряда, два зазора 3px (Task 325)');
        assertFalse(INDEX_SRC.indexOf('calc((95px - 3px) / 2)') !== -1,
            'формула двух рядов удалена');
    });

    test('CSS: десктоп — кнопки/селекты во всю высоту ряда', () => {
        // Task 328 (заявка: кнопки немного меньше): padding 4px 12px →
        // 4px 9px — правило актуализировано
        const re = /\.ws-month-sel, \.ws-year-sel, \.ws-generate-btn, \.ws-save-btn,\s*\n\s*\.ws-cancel-btn, \.ws-refresh-btn, \.ws-totals-btn, \.ws-tt-tab \{[^}]*height:\s*100%[^}]*padding:\s*4px 9px/;
        assertTrue(re.test(INDEX_SRC), 'height 100% + компактный padding 4px 9px (Task 328; + Итоги/вкладки, Task 324)');
    });

    test('CSS: рамка бара — 5px, не меняется', () => {
        // все правила .ws-toolbar (НЕ -main/…), где есть padding,
        // обязаны иметь padding: 5px — рамки бара не изменяются
        const re = /\.ws-toolbar \{[^}]*\}/g;
        let m, withPad = 0, bad = null;
        while ((m = re.exec(INDEX_SRC)) !== null) {
            if (/padding:/.test(m[0])) {
                withPad++;
                if (!/padding:\s*5px\s*;/.test(m[0])) bad = m[0].slice(0, 80);
            }
        }
        assertTrue(withPad >= 1, 'базовое правило с padding есть');
        assertTrue(!bad, 'все padding у .ws-toolbar — 5px (' + withPad + ' правил): ' + (bad || ''));
    });

    test('CSS: окна — 95px на десктопе (высота, к которой равняются кнопки)', () => {
        const mq = INDEX_SRC.match(/@media \(min-width: 1024px\) \{[\s\S]*?\.ws-events-panel,\s*\n\s*\.ws-cal-panel \{[\s\S]*?\}/);
        assertTrue(!!mq, 'десктопное правило окон');
        assertTrue(mq[0].indexOf('height: 95px') !== -1 &&
                   mq[0].indexOf('justify-self: stretch') !== -1,
            '95px + растяжение на 1/3');
    });

    test('CSS: тултип — fixed, сквозь него клики, скрытие [hidden]', () => {
        const re = /\.ws-refresh-tip \{[^}]*position:\s*fixed[^}]*pointer-events:\s*none/;
        assertTrue(re.test(INDEX_SRC), 'fixed + pointer-events: none');
        assertTrue(INDEX_SRC.indexOf('.ws-refresh-tip[hidden] { display: none; }') !== -1,
            'перекрытие display для [hidden]');
        const z = INDEX_SRC.match(/\.ws-refresh-tip \{[^}]*z-index:\s*(\d+)/);
        assertTrue(!!z && parseInt(z[1], 10) > 9402,
            'z-index выше попапов ячеек (9401–9402)');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ws-refresh-tip') !== -1,
            'светлая тема');
    });
});

// ------------------------------------------------------------
// JS: тултип (обновление, показ/скрытие, слушатели)
// ------------------------------------------------------------
describe('Task 317 — JS: тултип «данные от …»', () => {

    test('JS: _updateCacheStamp пишет в #wsRefreshTipDate', () => {
        const m = methodText(INDEX_SRC, '_updateCacheStamp');
        assertTrue(m.length > 0, 'метод есть');
        assertTrue(m.indexOf("getElementById('wsRefreshTipDate')") !== -1,
            'ищет строку-дату тултипа');
        assertTrue(m.indexOf("'данные от '") !== -1,
            'формат «данные от ДД.ММ, ЧЧ:ММ»');
        assertTrue(m.indexOf("'локальных данных ещё нет'") !== -1,
            'без данных — подсказка');
        assertFalse(m.indexOf('wsCacheStamp') !== -1,
            'про старый штамп не вспоминает');
    });

    test('JS: _showRefreshTip — позиция над кнопкой/под ней', () => {
        const m = methodText(INDEX_SRC, '_showRefreshTip');
        assertTrue(m.length > 0, 'метод есть');
        assertTrue(m.indexOf('getBoundingClientRect') !== -1,
            'привязка к кнопке');
        assertTrue(m.indexOf('r.top - tip.offsetHeight - 8') !== -1,
            'по умолчанию — НАД кнопкой (зазор 8px)');
        assertTrue(m.indexOf('r.bottom + 6') !== -1,
            'не хватает места сверху — ПОД кнопкой');
        assertTrue(m.indexOf('this._updateCacheStamp()') !== -1,
            'перед показом — свежая дата');
    });

    test('JS: _hideRefreshTip — просто скрывает', () => {
        const m = methodText(INDEX_SRC, '_hideRefreshTip');
        assertTrue(m.length > 0, 'метод есть');
        assertTrue(m.indexOf("getElementById('wsRefreshTip')") !== -1,
            'ищет окно');
        assertTrue(m.indexOf('tip.hidden = true') !== -1, 'скрытие');
    });

    test('JS: init — слушатели наведения/фокуса/клика + scroll', () => {
        const init = INDEX_SRC.slice(INDEX_SRC.indexOf('init: function'),
                                     INDEX_SRC.indexOf('_refreshFromUrlState: function'));
        const iWire = init.indexOf('_showRefreshTip');
        assertTrue(iWire !== -1, 'проводка тултипа в init');
        // Task 328: между проводкой «Обновить» и scroll-сбросом живёт
        // проводка окна «Сформировать» (#wsGenerateTip) — окно поиска
        // расширено, чтобы охватить scroll-слушатель.
        // Task 332: добавлены окна #wsCrossTip/#wsViewTip (значок
        // подсветки и кнопка вида) — окно расширено ещё раз
        const seg = init.slice(Math.max(0, iWire - 1200), iWire + 5000);
        assertTrue(seg.indexOf("addEventListener('mouseenter'") !== -1 &&
                   seg.indexOf("addEventListener('mouseleave'") !== -1,
            'наведение/уход курсора');
        assertTrue(seg.indexOf("addEventListener('focus'") !== -1 &&
                   seg.indexOf("addEventListener('blur'") !== -1,
            'фокус с клавиатуры');
        assertTrue(seg.indexOf("addEventListener('click'") !== -1,
            'клик — скрыть (итог покажет тост)');
        assertTrue(seg.indexOf("document.addEventListener('scroll'") !== -1,
            'прокрутка — скрыть (fixed-позиция устаревает)');
    });

    test('JS: loadGrid по-прежнему обновляет дату (4 ветки)', () => {
        // Task 476: +четвёртый вызов — ветка KipDB (IndexedDB) между
        // промахом localStorage-копии и сетью.
        const m = methodText(INDEX_SRC, 'loadGrid');
        const n = (m.match(/_updateCacheStamp\(\)/g) || []).length;
        assertEqual(n, 4, 'кэш-ветка LS, кэш-ветка KipDB, до загрузки, после загрузки');
    });

    // ---------- VM на моках ----------
    function mkDoc(btnRect, tipH) {
        const date = { textContent: '' };
        const tip = { hidden: true, style: {}, offsetHeight: tipH };
        const btn = { getBoundingClientRect: () => btnRect };
        return {
            getElementById: id => (id === 'wsRefreshTipDate' ? date :
                                   id === 'wsRefreshTip' ? tip :
                                   id === 'wsRefreshBtn' ? btn : null),
            _date: date, _tip: tip, _btn: btn
        };
    }
    function mkCtx(doc) {
        const texts = ['_updateCacheStamp', '_showRefreshTip', '_hideRefreshTip']
            .map(n => methodText(INDEX_SRC, n));
        const make = new Function('document',
            'return ({' + texts.join('\n') + '\n});');
        const ctx = make(doc);
        ctx._cacheTs = 0;
        return ctx;
    }

    test('VM: _updateCacheStamp — подсказка и формат', () => {
        const doc = mkDoc({ top: 100, left: 50, bottom: 130 }, 40);
        const ctx = mkCtx(doc);
        ctx._updateCacheStamp();
        assertEqual(doc._date.textContent, 'локальных данных ещё нет',
            'нет данных — подсказка');
        ctx._cacheTs = new Date(2026, 8, 4, 14, 22, 0).getTime();
        ctx._updateCacheStamp();
        assertEqual(doc._date.textContent, 'данные от 04.09, 14:22', 'формат');
    });

    test('VM: _showRefreshTip — над кнопкой; скрытие', () => {
        // кнопка на y=200, окно 40px → top = 200 − 40 − 8 = 152
        const doc = mkDoc({ top: 200, left: 50, bottom: 230 }, 40);
        const ctx = mkCtx(doc);
        ctx._showRefreshTip();
        assertTrue(doc._tip.hidden === false, 'окно показано');
        assertEqual(doc._tip.style.left, '50px', 'лево — по кнопке');
        assertEqual(doc._tip.style.top, '152px', 'над кнопкой (зазор 8px)');
        ctx._hideRefreshTip();
        assertTrue(doc._tip.hidden === true, 'скрыто');
    });

    test('VM: _showRefreshTip — у верхней кромки → под кнопкой', () => {
        // top=20: 20 − 40 − 8 = −28 < 4 → под кнопкой: bottom 50 + 6 = 56
        const doc = mkDoc({ top: 20, left: 0, bottom: 50 }, 40);
        const ctx = mkCtx(doc);
        ctx._showRefreshTip();
        assertEqual(doc._tip.style.top, '56px', 'под кнопкой (зазор 6px)');
        assertEqual(doc._tip.style.left, '6px', 'лево не меньше 6px');
    });
});

// ------------------------------------------------------------
// Service Worker
// ------------------------------------------------------------
describe('Task 317 — Service Worker', () => {
    test('SW: версия кэша kipia-test-v753', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v753') !== -1,
            'CACHE_VERSION = kipia-test-v753 (Task 317)');
        assertFalse(SW_SRC.indexOf('kipia-test-v754') !== -1,
            'лишний инкремент не делался');
    });
});
