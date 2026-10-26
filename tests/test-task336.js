// tests/test-task336.js
// Task 336 — заявка пользователя (уточнения Task 334/335):
//   1) «Блок картинка + "№ прибора" + "Место установки" — вплотную
//      к верхнему бару, ТАК ЖЕ в десктопной версии»: margin-top
//      -16px (Task 335) НЕ работал на реальном рендере — маржа
//      sticky-блока схлопывалась с маржей .dev-detail-card;
//      заменён :has-правилом padding-top: 0 на скролл-зоне панели
//      (замер: зазор 16px → 0, и в покое, и при прокрутке).
//   2) «Плавное сужение — сделай ЕЩЁ ПЛАВНЕЕ, ширина столбца
//      сотрудников — ПО ШИРИНЕ СОКРАЩЁННОГО ТЕКСТА, так же в
//      таблицах мобильной страницы итогов вкладок месяц и год»:
//      transition 0.35s cubic-bezier(0.4, 0, 0.2, 1); ширины
//      .ws-narrow — CSS-переменные --ws-emp-nw/--ws-tt-emp-nw,
//      меряет JS _measureEmpNarrowW (max «Сотр»/4 букв + паддинги
//      + 2); НОВОЕ правило итогов ПОСЛЕ 42%-й доли — месячная
//      таблица (fixed-раскладка) теперь сужается тоже.
//   3) «Вертикальная полоса в шапке шахматки между "Сотрудник +" и
//      первым днём — только со стороны ячейки "Сотрудник +", в
//      одной плоскости с полосами строк»: прозрачная правая
//      граница 1px у th.ws-emp-col выравнивает padding-box с
//      td (у которого граница 1px в border-collapse) — ::after
//      шапки рисуется теми же 2px, что у строк.
//   SW: kipia-test-v758.
//
// Запуск: через tests/run-all.js (require './test-task336.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

function ruleBlock(cssPart) {
    const i = INDEX_SRC.indexOf(cssPart);
    if (i === -1) return '';
    const rest = INDEX_SRC.slice(i);
    const m = rest.match(/\}\s/);
    return rest.slice(0, m ? m.index + 1 : 200);
}

// ============================================================
// 1. Карточка прибора — блок вплотную к бару (десктоп)
// ============================================================
describe('Task 336 — десктоп-панель: блок вплотную к бару', () => {

    test('CSS: margin-top: -16px УДАЛЁН из #detailPanel .dev-detail-top', () => {
        const b = ruleBlock('#detailPanel .dev-detail-top {');
        assertTrue(b.length > 0, 'правило панели найдено');
        assertFalse(/margin-top:\s*-16px/.test(b),
            'маржа удалена (схлопывалась с .dev-detail-card — блок оставался на +16px)');
    });

    test('CSS: :has-правило — padding-top: 0 скролл-зоны при дев-карточке', () => {
        const i = INDEX_SRC.indexOf(
            '#detailPanel .detail-panel-body:has(> .dev-detail-card > .dev-detail-top)');
        assertTrue(i !== -1, ':has-правило найдено');
        const chunk = INDEX_SRC.slice(i, i + 120);
        assertTrue(/padding-top:\s*0/.test(chunk), 'padding-top: 0');
    });

    test('CSS: :has-правило ПОСЛЕ базового padding: 16px (порядок решает)', () => {
        const base = INDEX_SRC.indexOf('#detailPanel .detail-panel-body {');
        const has = INDEX_SRC.indexOf(
            '#detailPanel .detail-panel-body:has(> .dev-detail-card > .dev-detail-top)');
        assertTrue(base !== -1, 'базовое правило есть');
        assertTrue(has > base, ':has позже базы — перебивает паддинг');
        const baseChunk = INDEX_SRC.slice(base, base + 80);
        assertTrue(/padding:\s*16px/.test(baseChunk), 'база: padding: 16px');
    });

    test('CSS: :has — только карточка ПРИБОРА (структура card > top)', () => {
        // прочие карточки панели (каб. журнал, правки) НЕ имеют
        // .dev-detail-top — у них паддинг 16px остаётся
        const sel = '#detailPanel .detail-panel-body:has(> .dev-detail-card > .dev-detail-top)';
        assertTrue(sel.indexOf('.dev-detail-top') !== -1,
            'условие включает .dev-detail-top — только карточка прибора');
        const n = (INDEX_SRC.match(/class="dev-detail-top"/g) || []).length;
        assertEqual(n, 1, 'рендерит .dev-detail-top только карточка прибора');
    });
});

// ============================================================
// 2. Сужение: ещё плавнее + ширина по сокращённому тексту
// ============================================================
describe('Task 336 — сужение по ширине сокращённого текста', () => {

    test('CSS: сетка — .ws-narrow width/min-width: var(--ws-emp-nw, 52px)', () => {
        const b = ruleBlock('.ws-grid.ws-narrow thead th.ws-emp-col,');
        assertTrue(b.length > 0, 'правило найдено');
        assertTrue(/width:\s*var\(--ws-emp-nw, 52px\)/.test(b), 'width: var(--ws-emp-nw, 52px)');
        assertTrue(/min-width:\s*var\(--ws-emp-nw, 52px\)/.test(b), 'min-width: var(--ws-emp-nw, 52px)');
    });

    test('CSS: итоги — var(--ws-tt-emp-nw, 48px) (раннее правило Task 334-блока)', () => {
        const b = ruleBlock('.ws-tt-table.ws-narrow th.ws-tt-emp,');
        assertTrue(b.length > 0, 'правило найдено');
        assertTrue(/width:\s*var\(--ws-tt-emp-nw, 48px\)/.test(b), 'width: var(--ws-tt-emp-nw, 48px)');
    });

    test('CSS: итоги — правило ПОСЛЕ 42%-й доли (месяц сужается)', () => {
        const pct = INDEX_SRC.indexOf('.ws-tt-table:not(.ws-tt-year) th.ws-tt-emp,');
        assertTrue(pct !== -1, '42%-правило есть');
        const late = INDEX_SRC.indexOf('.ws-tt-table.ws-narrow th.ws-tt-emp,', pct);
        assertTrue(late !== -1 && late > pct,
            'повторное .ws-narrow-правило ПОСЛЕ 42% (равная специфичность — порядок решает)');
        const chunk = INDEX_SRC.slice(late, late + 200);
        assertTrue(/width:\s*var\(--ws-tt-emp-nw, 48px\)/.test(chunk), 'ширина — переменная');
        // комментарий Task 336 — ПЕРЕД правилом (пояснение механизма)
        const before = INDEX_SRC.slice(late - 800, late);
        assertTrue(before.indexOf('Task 336') !== -1, 'комментарий Task 336 у правила');
    });

    test('CSS: переходы ЕЩЁ ПЛАВНЕЕ — 0.35s cubic-bezier(0.4, 0, 0.2, 1)', () => {
        const i = INDEX_SRC.indexOf(
            '.ws-grid thead th.ws-emp-col,\n        .ws-grid tbody td.ws-emp-col {\n            transition');
        assertTrue(i !== -1, 'transition-правило сетки есть');
        const chunk = INDEX_SRC.slice(i, i + 300);
        assertTrue(/width 0\.35s cubic-bezier\(0\.4, 0, 0\.2, 1\)/.test(chunk),
            'сетка: width 0.35s cubic-bezier(0.4,0,0.2,1)');
        const j = INDEX_SRC.indexOf(
            '.ws-tt-table th.ws-tt-emp,\n        .ws-tt-table td.ws-tt-emp {\n            transition: width 0.35s');
        assertTrue(j !== -1, 'transition-правило итогов есть');
        const tchunk = INDEX_SRC.slice(j, j + 160);
        assertTrue(/0\.35s cubic-bezier\(0\.4, 0, 0\.2, 1\)/.test(tchunk),
            'итоги: 0.35s cubic-bezier(0.4,0,0.2,1)');
    });

    test('VM: _measureEmpNarrowW — есть и меряет span[data-s4]', () => {
        const src = methodText(INDEX_SRC, '_measureEmpNarrowW');
        assertTrue(src.length > 0, 'метод найден');
        assertTrue(src.indexOf("[data-s4]") !== -1, 'выборка span[data-s4]');
        assertTrue(src.indexOf('--ws-emp-nw') !== -1, 'пишет --ws-emp-nw');
        assertTrue(src.indexOf('--ws-tt-emp-nw') !== -1, 'пишет --ws-tt-emp-nw');
        assertTrue(src.indexOf('Math.ceil') !== -1, 'ceil — целые пиксели');
    });

    test('VM: _measureEmpNarrowW — замер/возврат текста + переменные (мок DOM)', () => {
        const bodyStyle = {
            props: {},
            setProperty: function(name, val) { this.props[name] = val; },
            getPropertyValue: function(name) { return this.props[name] || ''; }
        };
        const mkSpan = function(full, s4, w, startText) {
            return {
                attrs: { 'data-full': full, 'data-s4': s4 },
                text: startText !== undefined ? startText : full,
                getAttribute: function(k) { return this.attrs[k] || null; },
                set textContent(v) { this.text = v; },
                get textContent() { return this.text; },
                getBoundingClientRect: function() { return { width: w }; }
            };
        };
        // сетка видима: «Сотр» 29 + «Иван» 30 → максимум 30
        const gridSpans = [mkSpan('Сотрудник', 'Сотр', 29), mkSpan('Иванов И.И.', 'Иван', 30)];
        // итоги: шторка СКРЫТА (width 0), страница видима: 29/31 → 31
        const ttSpans = [mkSpan('Сотрудник', 'Сотр', 29), mkSpan('Щукин И.И.', 'Щуки', 31)];
        const doc = {
            body: { style: bodyStyle },
            getElementById: function(id) {
                if (id === 'wsGridWrap') return {
                    querySelectorAll: function() { return gridSpans; },
                    getBoundingClientRect: function() { return { width: 375 }; }
                };
                if (id === 'wsTtBody') return {
                    querySelectorAll: function() { return ttSpans; },
                    getBoundingClientRect: function() { return { width: 0 }; }
                };
                if (id === 'wsTtPageBody') return {
                    querySelectorAll: function() { return ttSpans; },
                    getBoundingClientRect: function() { return { width: 375 }; }
                };
                return null;
            }
        };
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_measureEmpNarrowW') + '\n});')(doc);
        host._measureEmpNarrowW();
        // сетка: 30 + 8 (паддинги 6 4) + 2 = 40
        assertEqual(bodyStyle.props['--ws-emp-nw'], '40px',
            '--ws-emp-nw = ceil(30+8+2) = 40px');
        // итоги: 31 + 16 (паддинги 5 8) + 2 = 49 (шторка скрыта — взята страница)
        assertEqual(bodyStyle.props['--ws-tt-emp-nw'], '49px',
            '--ws-tt-emp-nw = ceil(31+16+2) = 49px (видимая: страница)');
        // текст возвращен
        assertEqual(gridSpans[0].text, 'Сотрудник', 'текст шапки возвращён');
        assertEqual(gridSpans[1].text, 'Иванов И.И.', 'ФИО возвращено');
        assertEqual(ttSpans[1].text, 'Щукин И.И.', 'ФИО итогов возвращено');
    });

    test('VM: скрытый контейнер пропускается — переменная не пишется', () => {
        const bodyStyle = {
            props: {},
            setProperty: function(name, val) { this.props[name] = val; },
            getPropertyValue: function(name) { return this.props[name] || ''; }
        };
        const span = {
            attrs: { 'data-full': 'Иванов И.И.', 'data-s4': 'Иван' },
            text: 'Иванов И.И.',
            getAttribute: function(k) { return this.attrs[k] || null; },
            set textContent(v) { this.text = v; },
            get textContent() { return this.text; },
            getBoundingClientRect: function() { return { width: 30 }; }
        };
        const hidden = function() {
            return {
                querySelectorAll: function() { return [span]; },
                getBoundingClientRect: function() { return { width: 0 }; }
            };
        };
        const doc = {
            body: { style: bodyStyle },
            getElementById: function() { return hidden(); }
        };
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_measureEmpNarrowW') + '\n});')(doc);
        host._measureEmpNarrowW();
        assertTrue(!bodyStyle.props['--ws-emp-nw'], 'сетка скрыта — переменная НЕ тронута');
        assertTrue(!bodyStyle.props['--ws-tt-emp-nw'], 'итоги скрыты — переменная НЕ тронута');
    });

    test('VM: _reapplyEmpNarrow зовёт _measureEmpNarrowW (после рендеров)', () => {
        const src = methodText(INDEX_SRC, '_reapplyEmpNarrow');
        assertTrue(src.indexOf('_measureEmpNarrowW') !== -1,
            'замер внутри _reapplyEmpNarrow (переживает перерисовки)');
    });

    test('VM: document.fonts.ready — повторный замер (поздний шрифт)', () => {
        const i = INDEX_SRC.indexOf('document.fonts.ready.then(function() {');
        assertTrue(i !== -1, 'fonts.ready-хук есть');
        const chunk = INDEX_SRC.slice(i, i + 300);
        assertTrue(chunk.indexOf('_measureEmpNarrowW') !== -1,
            '_measureEmpNarrowW вызывается после загрузки шрифта');
    });
});

// ============================================================
// 3. Полоса шапки — в одной плоскости с полосами строк
// ============================================================
describe('Task 336 — полоса шапки сетки: одна плоскость', () => {

    test('CSS: th.ws-emp-col — прозрачная правая граница 1px (в базовом правиле)', () => {
        const m = INDEX_SRC.match(/\.ws-grid thead th\.ws-emp-col\s*\{[^}]*\}/);
        assertTrue(!!m, 'базовое правило th.ws-emp-col найдено');
        assertTrue(!!m && m[0].indexOf('border-right: 1px solid transparent;') !== -1,
            'border-right: 1px solid transparent — внутри базового правила');
    });

    test('CSS: правило — ПОСЛЕ ::after-полосы (близко к ней)', () => {
        const after = INDEX_SRC.indexOf('.ws-grid thead th.ws-emp-col::after,');
        const m = INDEX_SRC.match(/\.ws-grid thead th\.ws-emp-col\s*\{[^}]*\}/);
        assertTrue(after !== -1, '::after-полоса есть');
        assertTrue(!!m && INDEX_SRC.indexOf(m[0]) > after,
            'базовое правило (с границей) после ::after-правила');
    });

    test('CSS: ::after-полоса НЕ тронута (2px, right: 0)', () => {
        const b = ruleBlock('.ws-grid thead th.ws-emp-col::after,');
        assertTrue(/width:\s*2px/.test(b), 'ширина 2px');
        assertTrue(/right:\s*0/.test(b), 'right: 0 — со стороны ячейки ФИО');
        assertTrue(/pointer-events:\s*none/.test(b), 'кликам не мешает');
    });

    test('КОНТЕКСТ: комментарий — «только со стороны ячейки Сотрудник +»', () => {
        const m = INDEX_SRC.match(/\.ws-grid thead th\.ws-emp-col\s*\{[^}]*\}/);
        assertTrue(!!m, 'правило найдено');
        // пояснение механизма — ВНУТРИ правила (перед border-right)
        assertTrue(!!m && m[0].indexOf('Task 336') !== -1, 'комментарий Task 336');
        assertTrue(!!m && m[0].indexOf('ОДНОЙ ПЛОСКОСТИ') !== -1,
            'пояснение: полоса шапки в одной плоскости с полосами строк');
        const br = m[0].indexOf('border-right: 1px solid transparent;');
        const com = m[0].indexOf('Task 336');
        assertTrue(!!m && com !== -1 && br !== -1 && com < br,
            'комментарий ПЕРЕД border-right (внутри правила)');
    });
});

// ============================================================
// 4. Service Worker
// ============================================================
describe('Task 336 — Service Worker', () => {
    test('SW: кэш поднят до kipia-test-v758', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v758'") !== -1,
            'CACHE_VERSION = kipia-test-v758 (Task 336 — только фронтенд)');
        assertFalse(SW_SRC.indexOf('kipia-test-v759') !== -1,
            'лишний инкремент (v577) не сделан');
    });
});
