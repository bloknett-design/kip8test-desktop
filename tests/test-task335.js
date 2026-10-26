// tests/test-task335.js
// Task 335 — заявка пользователя (правки/баги после Task 334):
//   1) «Блок картинка + "№ прибора" + "Место установки" в карточке
//      прибора должен вплотную примыкать к верхнему бару» — при
//      прокрутке мобильная шапка сжимается до 40px, липкий блок
//      следует высоте шапки (top 56px → 40px); десктоп-панель —
//      компенсация верхнего паддинга скролл-зоны (Task 336 заменил
//      неработавший margin-top −16px на :has-правило padding-top: 0).
//   2) «Колонка с фамилиями сужается не резко, а ПЛАВНО в начале
//      прокрутки; текст шапки "Сотрудник +" сокращается до "Сотр"» —
//      CSS transition ширины (0.35s, Task 336 — ещё плавнее) на
//      колонки ФИО/«Сотрудник», порог сужения 0, span-обмен
//      заголовка (data-full="Сотрудник"/data-s4="Сотр"), плюсик
//      шапки скрыт в суженном виде.
//   3) «В мобильном не сразу работает прокрутка шахматки табеля и
//      таблиц итогов учёта, а только после увеличения шахматки
//      щипком» — таблицы .ws-grid/.ws-tt-table получают класс
//      pinch-zoom-target (touch-action: pan-y) — селекторы
//      pan-x pan-y переопределяют (приём Task 230).
//   4) «В мобильном, на странице итогов учёта за месяц должны
//      отображаться ВСЕ столбцы» — _renderTotalsMonth: на странице
//      (_ttPage) доп. столбцы включены всегда (extraOn).
//   5) «Кнопка открытия окна мероприятий подписана "Мероприятия"» —
//      опечатка «Мероприятия» исправлена.
//   6) «В десктопной версии, при изменении вида на только сменные
//      или только дневные сотрудники, шахматка не должна
//      растягиваться до низа окна приложения» — класс
//      ws-view-filtered на #page-work-schedule (_applyView),
//      CSS align-self/flex по контенту, _fitGrid капсулирует высоту
//      строк природной, остаток раздачи ≤ n-1.
//   SW: kipia-test-v759.
//
// Запуск: через tests/run-all.js (require './test-task335.js').

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

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

function ruleBlock(cssPart) {
    const i = INDEX_SRC.indexOf(cssPart);
    if (i === -1) return '';
    const rest = INDEX_SRC.slice(i);
    const m = rest.match(/\}\s/);
    return rest.slice(0, m ? m.index + 1 : 200);
}

// ============================================================
// 1. Карточка прибора — блок вплотную к верхнему бару
// ============================================================
describe('Task 335 — карточка прибора: блок вплотную к бару', () => {

    test('CSS: scrolled-шапка 40px — липкий блок следует (top: 40px)', () => {
        const b = ruleBlock('#page-device-detail.scrolled .dev-detail-top {');
        assertTrue(b.length > 0, 'правило найдено');
        assertEqual(b, '#page-device-detail.scrolled .dev-detail-top {\n        top: 40px;\n    }',
            'top: 40px — вплотную к сжатой шапке (56 → 40 при скролле)');
    });

    test('CSS: базовый sticky 56px сохранён (нескроллое состояние)', () => {
        const b = ruleBlock('#page-device-detail .dev-detail-top {');
        assertTrue(/top:\s*56px/.test(b), 'top: 56px под полной шапкой');
    });

    test('CSS: десктоп-панель — БЕЗ верхнего паддинга зоны (:has, Task 336)', () => {
        const b = ruleBlock('#detailPanel .dev-detail-top {');
        assertTrue(b.length > 0, 'правило панели найдено');
        // Task 336: margin-top: -16px УДАЛЁН — маржа sticky-блока
        // схлопывалась с маржей .dev-detail-card и не срабатывала;
        // вместо неё :has-правило ниже убирает padding-top зоны
        assertFalse(/margin-top:\s*-16px/.test(b),
            'margin-top: -16 удалён (не работал — схлопывание маржи)');
        assertTrue(/margin-left:\s*-16px/.test(b) && /margin-right:\s*-16px/.test(b),
            'боковые full-bleed маржи на месте (Task 334)');
    });

    test('CSS: десктоп-панель — :has-правило padding-top: 0 (Task 336)', () => {
        const i = INDEX_SRC.indexOf(
            '#detailPanel .detail-panel-body:has(> .dev-detail-card > .dev-detail-top)');
        assertTrue(i !== -1, ':has-правило найдено');
        const chunk = INDEX_SRC.slice(i, i + 200);
        assertTrue(/padding-top:\s*0/.test(chunk), 'padding-top: 0 — блок вплотную к бару');
        // правило — ПОСЛЕ базового padding: 16px (порядок = приоритет)
        const base = INDEX_SRC.indexOf('#detailPanel .detail-panel-body {');
        assertTrue(base !== -1 && i > base, ':has-правило после базового паддинга');
    });
});

// ============================================================
// 2. Плавное сужение + «Сотрудник +» → «Сотр»
// ============================================================
describe('Task 335 — плавное сужение колонки фамилий', () => {

    test('CSS: transition ширины колонки ФИО сетки (0.35s, Task 336 — плавнее)', () => {
        const b = ruleBlock('.ws-grid thead th.ws-emp-col,');
        // первое вхождение — базовое правило; ищем блок transition
        const i = INDEX_SRC.indexOf(
            '.ws-grid thead th.ws-emp-col,\n        .ws-grid tbody td.ws-emp-col {\n            transition');
        assertTrue(i !== -1, 'правило transition колонки ФИО есть');
        const chunk = INDEX_SRC.slice(i, i + 300);
        assertTrue(/transition:\s*width 0\.35s cubic-bezier\(0\.4, 0, 0\.2, 1\)/.test(chunk), 'width анимируется (0.35s, мягкая кривая)');
        assertTrue(/min-width 0\.35s cubic-bezier/.test(chunk), 'min-width анимируется');
        assertTrue(/padding 0\.35s cubic-bezier/.test(chunk), 'padding анимируется');
    });

    test('CSS: transition ширины колонки «Сотрудник» итогов (после базового правила)', () => {
        // правило стоит ПОСЛЕ базового .ws-tt-emp (порядок = приоритет)
        const base = INDEX_SRC.indexOf('.ws-tt-table th.ws-tt-emp,\n    .ws-tt-table td.ws-tt-emp {\n        text-align: left;');
        const i = INDEX_SRC.indexOf(
            '.ws-tt-table th.ws-tt-emp,\n        .ws-tt-table td.ws-tt-emp {\n            transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);');
        assertTrue(base !== -1, 'базовое правило на месте');
        assertTrue(i !== -1 && i > base, 'transition-правило после базового');
    });

    test('CSS: правило плюсика в суженном виде удалено (Task 386)', () => {
        // Task 386: заголовок — надпись, плюсика нет — правило
        // (.ws-narrow .ws-emp-head-plus) удалено
        const b = ruleBlock('.ws-grid.ws-narrow thead th.ws-emp-col .ws-emp-head-plus {');
        assertEqual(b.length, 0, 'правило удалено (плюсика больше нет)');
    });

    test('VM: порог сужения — 0 (в самом начале прокрутки)', () => {
        const re = methodText(INDEX_SRC, '_attachEmpNarrow');
        assertTrue(re.indexOf('el.scrollLeft > 0') !== -1,
            'слушатель scroll: scrollLeft > 0 (без порога 6)');
        const rp = methodText(INDEX_SRC, '_reapplyEmpNarrow');
        assertTrue(rp.indexOf('el.scrollLeft > 0') !== -1,
            '_reapplyEmpNarrow: scrollLeft > 0');
    });

    test('VM: _narrowApply — ТОЛЬКО мобильная вёрстка (десктоп гасится)', () => {
        const src = methodText(INDEX_SRC, '_narrowApply');
        assertTrue(src.indexOf("window.matchMedia('(max-width: 1023px)')") !== -1,
            'гейт matchMedia ≤1023px');
        assertTrue(/on = false/.test(src), 'десктоп: включение сужения погашено');
    });

    test('VM: _narrowApply гейт — браузер/мобайл (window подменяется)', () => {
        // мобайл: matchMedia('(max-width: 1023px)').matches = true —
        // сужение применяется; десктоп: matches = false — гасится
        const mk = function(mobile) {
            const host = new Function('window', 'return ({' +
                methodText(INDEX_SRC, '_narrowApply') + '\n});')({
                matchMedia: function() {
                    return { matches: mobile };
                }
            });
            return host;
        };
        const span = { full: 'Иванов И.И.', s4: 'Иван', cur: 'Иванов И.И.',
            getAttribute: function(k) {
                return k === 'data-full' ? this.full : this.s4; },
            set textContent(v) { this.cur = v; },
            get textContent() { return this.cur; } };
        const table = { classList: { classes: {},
            toggle: function(c, on) { this.classes[c] = !!on; } } };
        const container = { querySelectorAll: function(sel) {
            return sel === '.ws-grid, .ws-tt-table' ? [table] : [span]; } };
        mk(true)._narrowApply(container, true);
        assertTrue(table.classList.classes['ws-narrow'] === true,
            'мобайл: класс поставлен');
        assertEqual(span.cur, 'Иван', 'мобайл: текст = 4 буквы');
        // десктоп: включение гасится — таблица не сужается, ФИО целое
        const span2 = { full: 'Иванов И.И.', s4: 'Иван', cur: 'Иванов И.И.',
            getAttribute: function(k) {
                return k === 'data-full' ? this.full : this.s4; },
            set textContent(v) { this.cur = v; },
            get textContent() { return this.cur; } };
        const table2 = { classList: { classes: {},
            toggle: function(c, on) { this.classes[c] = !!on; } } };
        const container2 = { querySelectorAll: function(sel) {
            return sel === '.ws-grid, .ws-tt-table' ? [table2] : [span2]; } };
        mk(false)._narrowApply(container2, true);
        assertFalse(table2.classList.classes['ws-narrow'] === true,
            'десктоп: класс НЕ поставлен');
        assertEqual(span2.cur, 'Иванов И.И.',
            'десктоп: полное ФИО (гориз. прокрутка шторки не портит)');
    });

    test('РЕНДЕР: шапка сетки — span «Работники» ⇄ «Рабо»', () => {
        const i = INDEX_SRC.indexOf('class="ws-emp-head-txt"');
        assertTrue(i !== -1, 'span.ws-emp-head-txt в разметке шапки сетки');
        const chunk = INDEX_SRC.slice(i - 80, i + 160);
        assertTrue(chunk.indexOf('data-full="Работники"') !== -1,
            'data-full «Работники» (Task 386: надпись, не кнопка)');
        assertTrue(chunk.indexOf('data-s4="Рабо"') !== -1, 'data-s4 «Рабо»');
    });

    test('РЕНДЕР: шапки итогов (месяц + год + архив) — span «Работник» ⇄ «Рабо»', () => {
        const n = (INDEX_SRC.match(/class="ws-tt-emp-head"/g) || []).length;
        assertEqual(n, 3, 'три таблицы: месяц, годовая, архивная');
        const chunk = INDEX_SRC.slice(
            INDEX_SRC.indexOf('class="ws-tt-emp-head"') - 40,
            INDEX_SRC.indexOf('class="ws-tt-emp-head"') + 120);
        assertTrue(chunk.indexOf('data-full="Работник"') !== -1, 'data-full (Task 385: работник)');
        assertTrue(chunk.indexOf('data-s4="Рабо"') !== -1, 'data-s4 «Рабо»');
    });
});

// ============================================================
// 3. Мобильный горизонтальный скролл сразу (touch-action)
// ============================================================
describe('Task 335 — мобильный скролл без предварительного pinch-zoom', () => {

    test('CSS: pan-x pan-y для шахматки-таблицы (.ws-grid.pinch-zoom-target)', () => {
        const i = INDEX_SRC.indexOf('.ws-grid.pinch-zoom-target,');
        assertTrue(i !== -1, 'селектор .ws-grid.pinch-zoom-target есть');
        const chunk = INDEX_SRC.slice(i, i + 400);
        assertTrue(/touch-action:\s*pan-x pan-y/.test(chunk), 'touch-action: pan-x pan-y');
    });

    test('CSS: pan-x pan-y для таблиц итогов (.ws-tt-table.pinch-zoom-target)', () => {
        const i = INDEX_SRC.indexOf('.ws-tt-table.pinch-zoom-target,');
        assertTrue(i !== -1, 'селектор .ws-tt-table.pinch-zoom-target есть');
        const chunk = INDEX_SRC.slice(i, i + 400);
        assertTrue(/touch-action:\s*pan-x pan-y/.test(chunk), 'touch-action: pan-x pan-y');
    });

    test('CSS: контейнеры тоже покрыты (wrap/тела итогов)', () => {
        const i = INDEX_SRC.indexOf('.ws-grid-wrap.pinch-zoom-target,');
        assertTrue(i !== -1, 'селектор .ws-grid-wrap.pinch-zoom-target');
        const j = INDEX_SRC.indexOf('.ws-tt-body.pinch-zoom-target {');
        assertTrue(j !== -1, 'селектор .ws-tt-body.pinch-zoom-target (шторка+страница)');
    });

    test('CSS: базовое pinch-правило pan-y НЕ тронуто (щипок жив)', () => {
        // базовое правило — именно «pan-y» (а не переопределение
        // Task 230/335 «pan-x pan-y» — оно матчится тем же indexOf)
        assertTrue(/\.pinch-zoom-target \{\s*touch-action:\s*pan-y;/.test(INDEX_SRC),
            '.pinch-zoom-target { touch-action: pan-y } — прочие таблицы как прежде');
        const z = ruleBlock('.pinch-zoom-target.zoomed {');
        assertTrue(/pan-x pan-y/.test(z), 'zoomed: pan-x pan-y — зум не сломан');
    });
});

// ============================================================
// 4. Страница итогов за месяц — ВСЕ столбцы
// ============================================================
describe('Task 335 — мобильная страница итогов: все столбцы', () => {

    test('VM: extraOn = страница → всегда true (десктоп-шторка — _totalsExtra)', () => {
        const src = methodText(INDEX_SRC, '_renderTotalsMonth');
        const i = src.indexOf('extraOn');
        assertTrue(i !== -1, 'переменная extraOn');
        const chunk = src.slice(i - 120, i + 160);
        assertTrue(chunk.indexOf('_ttPage ? true') !== -1,
            'страница итогов — ВСЕ столбцы');
        assertTrue(chunk.indexOf('_totalsExtra') !== -1,
            'шторка — прежний тоггл «Ещё»');
    });

    test('VM: мин-ширина по extraOn (не по _totalsExtra)', () => {
        const src = methodText(INDEX_SRC, '_renderTotalsMonth');
        const i = src.indexOf('table.style.minWidth = extraOn');
        assertTrue(i !== -1, 'minWidth считается от extraOn');
    });

    test('VM: рендер месяца на СТРАНИЦЕ — 12 столбцов (3 основных + 8 доп.)', () => {
        // _ttPage = true (страница) — доп. столбцы рендерятся ВСЕГДА
        const host = new Function('document', 'window', 'return ({' +
            '_ttPage: true,' +
            '_ttBodyEl: function() { return this._pb; },' +
            '_pb: null,' +
            '_EMPLOYEES: [{' +
            'таб_номер: \'017\', ФИО: \'Иванов И.И.\', тип: \'сменный\'}],' +
            '_totalsEffectiveEntries: function() { return []; },' +
            '_empTypeMap: function() { return {}; },' +
            '_totalsAgg: function() { return { byTab: {}, grand: null }; },' +
            '_totalsZero: function() { return { work: 0, hours: 0, over: 0 }; },' +
            '_setTtWarn: function() {},' +
            '_totalsExtra: false,' +
            '_fitTtDrawer: null,' +
            '_applyTtHeadVar: function() { return false; },' +
            '_fitGrid: function() {},' +
            '_syncTotalsRows: function() {},' +
            '_hbarSyncAll: function() {},' +
            '_reapplyEmpNarrow: function() {},' +
            '_esc: function(s) { return String(s); },' +
            '_escAttr: function(s) { return String(s); },' +
            '_fmtTotalsNum: function(v) { return String(v); },' +
            '_renderTotalsMonth: ' + methodText(INDEX_SRC, '_renderTotalsMonth')
                .replace('_renderTotalsMonth: function', 'function') +
            '\n});');
        const pb = { innerHTML: '', querySelector: function() { return null; } };
        const h = host(mockDoc({}), { matchMedia: function() { return { matches: false }; } });
        h._pb = pb;
        h._renderTotalsMonth();
        const ths = pb.innerHTML.match(/<th[^>]*>[\s\S]*?<\/th>/g) || [];
        assertEqual(ths.length, 12,
            '12 столбцов: Сотрудник + 3 основных + 8 дополнительных');
        for (const name of ['Отгул (ОВ)', 'Больничный (Б)', 'Отпуск (ОТ)',
                            'Уч. отпуск (У)', 'Прогул (ПР)', 'День (Д)',
                            'Ночь (Н)', 'Прочие']) {
            assertTrue(pb.innerHTML.indexOf(name) !== -1,
                '«' + name + '» виден на странице итогов');
        }
    });
});

// ============================================================
// 5. Опечатка «Мероприятия» → «Мероприятия»
// ============================================================
describe('Task 335 — опечатка чипа мероприятий', () => {
    // корректное написание: «Меропри» + «ятия»; опечатка была
    // «Меропри» + «вия» — собираем строки конкатенацией, чтобы
    // визуально похожие написания не путались в исходнике теста
    const TYPO = 'Меропри' + 'вия';
    const RIGHT = 'Меропри' + 'ятия';

    test('HTML: чип подписан правильно (без «в»)', () => {
        const i = INDEX_SRC.indexOf('id="wsChipEvents"');
        assertTrue(i !== -1, 'чип найден');
        const end = INDEX_SRC.indexOf('</button>', i);
        const chunk = INDEX_SRC.slice(i, end);
        assertTrue(chunk.indexOf('>' + RIGHT) !== -1,
            'подпись — «Мероприятия»');
        assertFalse(chunk.indexOf(TYPO) !== -1, 'опечатки в чипе нет');
    });

    test('HTML: опечатка больше не встречается (весь файл)', () => {
        assertFalse(INDEX_SRC.indexOf(TYPO) !== -1,
            '«' + TYPO + '» отсутствует (в т.ч. в комментариях)');
    });
});

// ============================================================
// 6. Десктоп: фильтрованные виды не растягивают шахматку
// ============================================================
describe('Task 335 — десктоп: виды сменные/дневные без растяжки', () => {

    test('VM: _applyView ставит класс ws-view-filtered', () => {
        const src = methodText(INDEX_SRC, '_applyView');
        assertTrue(src.indexOf("ws-view-filtered") !== -1, 'класс ставится');
        assertTrue(src.indexOf("!full") !== -1, 'только НЕполный вид');
    });

    test('CSS: колонка по контенту (align-self) + контейнер flex 0 1 auto', () => {
        const i = INDEX_SRC.indexOf(
            '#page-work-schedule.ws-view-filtered .ws-grid-col {');
        assertTrue(i !== -1, 'правило колонки найдено');
        const chunk = INDEX_SRC.slice(i, i + 200);
        assertTrue(/align-self:\s*flex-start/.test(chunk),
            'колонка не тянется вниз (align-self: flex-start)');
        const w = INDEX_SRC.indexOf(
            '#page-work-schedule.ws-view-filtered .ws-grid-wrap {');
        assertTrue(w !== -1, 'правило контейнера найдено');
        const wchunk = INDEX_SRC.slice(w, w + 120);
        assertTrue(/flex:\s*0 1 auto/.test(wchunk), 'контейнер по контенту');
    });

    test('VM: _fitGrid — капсулирование природной высоты в фильтрованном виде', () => {
        const src = methodText(INDEX_SRC, '_fitGrid');
        assertTrue(src.indexOf("this._view !== 'full' && h > natural") !== -1,
            'h не превышает natural в сменном/дневном виде');
        assertTrue(src.indexOf('if (rem > n - 1) rem = n - 1;') !== -1,
            'раздача остатка ограничена (≤ n-1)');
    });
});

// ============================================================
// SW-версия
// ============================================================
describe('Task 335 — версия кэша SW', () => {
    test('SW: кэш поднят до kipia-test-v759', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v759'") !== -1,
            'CACHE_VERSION = kipia-test-v759 (Task 335 — только фронтенд)');
        assertFalse(SW_SRC.indexOf('kipia-test-v760') !== -1,
            'лишний инкремент (v577) не сделан');
    });
});
