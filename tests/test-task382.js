// tests/test-task382.js
// Task 382 — заявка пользователя: «В мобильной версии, на странице
// итогов учёта, в таблице вкладки месяц изначальную ширину столбца
// с фамилиями сотрудников сделай по ширине текста в ячейках как на
// вкладке год».
// Механика: базовое правило месячной таблицы итогов
// .ws-tt-table:not(.ws-tt-year) th/td.ws-tt-emp — доля 42%
// заменена на var(--ws-tt-emp-w, 42%) (фолбэк — прежняя доля);
// переменную меряет JS _measureTtEmpFullW — максимум «№ таб. +
// 5px маржи + ФИО» строк и заголовка «Сотрудник» + паддинги
// ячейки 8+8 + 2 запас (как авто-раскладка годовой таблицы —
// там колонка и так по тексту, месяц теперь совпадает с ней).
// Вызовы: _reapplyEmpNarrow (после каждого рендера итогов — его
// зовут последними и месяц, и год) + document.fonts.ready.
// При активном сужении (прокрутка): текст спанов временно
// возвращается к data-full, скрытый № таб. показывается инлайном
// на время замера — всё возвращается; late-правило .ws-narrow
// ПОСЛЕ базового — сужение при прокрутке не тронуто.
// SW: kipia-test-v738 (guard v612).
//
// Запуск: через tests/run-all.js (require './test-task382.js').

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

// ============================================================
// 1. CSS: изначальная ширина колонки — ПО ТЕКСТУ (как в «Годе»)
// ============================================================
describe('Task 382 — CSS: месяц — ширина колонки по тексту', () => {

    test('CSS: базовое правило — var(--ws-tt-emp-w, 42%) вместо доли', () => {
        const m = INDEX_SRC.match(
            /\.ws-tt-table:not\(\.ws-tt-year\) th\.ws-tt-emp,\n\s*\.ws-tt-table:not\(\.ws-tt-year\) td\.ws-tt-emp\s*\{[^}]*\}/);
        assertTrue(!!m, 'правило найдено');
        assertTrue(!!m && m[0].indexOf('width: var(--ws-tt-emp-w, 42%)') !== -1,
            'width: var(--ws-tt-emp-w, 42%) — по тексту, фолбэк 42%');
        assertTrue(!!m && m[0].indexOf('Task 382') !== -1,
            'инлайн-комментарий Task 382 у ширины');
    });

    test('CSS: эллипсис/nowrap сохранены (страховка субпиксельности)', () => {
        const m = INDEX_SRC.match(
            /\.ws-tt-table:not\(\.ws-tt-year\) th\.ws-tt-emp,\n\s*\.ws-tt-table:not\(\.ws-tt-year\) td\.ws-tt-emp\s*\{[^}]*\}/);
        assertTrue(!!m && m[0].indexOf('overflow: hidden') !== -1, 'overflow: hidden');
        assertTrue(!!m && m[0].indexOf('text-overflow: ellipsis') !== -1, 'эллипсис');
        assertTrue(!!m && m[0].indexOf('white-space: nowrap') !== -1, 'nowrap');
    });

    test('CSS: комментарий Task 382 ПЕРЕД правилом (механика замера)', () => {
        const i = INDEX_SRC.indexOf(
            '.ws-tt-table:not(.ws-tt-year) th.ws-tt-emp,');
        assertTrue(i !== -1, 'правило есть');
        const before = INDEX_SRC.slice(i - 900, i);
        assertTrue(before.indexOf('Task 382') !== -1, 'комментарий Task 382 перед правилом');
        assertTrue(before.indexOf('_measureTtEmpFullW') !== -1,
            'в комментарии — имя замерщика');
    });

    test('CSS: late-правило .ws-narrow — ПОСЛЕ базового (сужение живо)', () => {
        const base = INDEX_SRC.indexOf(
            '.ws-tt-table:not(.ws-tt-year) th.ws-tt-emp,');
        const late = INDEX_SRC.indexOf('.ws-tt-table.ws-narrow th.ws-tt-emp,', base);
        assertTrue(late !== -1 && late > base,
            'повторное .ws-narrow-правило ПОСЛЕ базового (порядок решает)');
        const chunk = INDEX_SRC.slice(late, late + 200);
        assertTrue(/width:\s*var\(--ws-tt-emp-nw, 48px\)/.test(chunk),
            'сужение при прокрутке — var(--ws-tt-emp-nw, 48px)');
    });

    test('CSS: fixed-раскладка месяца НЕ тронута (равные данные)', () => {
        const fix = INDEX_SRC.match(
            /\.ws-tt-table:not\(\.ws-tt-year\)\s*\{[^}]*table-layout:\s*fixed/);
        assertTrue(!!fix, 'table-layout: fixed — столбцы данных делят остаток поровну');
    });

    test('CSS: год — авто-раскладка (колонка и так по тексту)', () => {
        const y = INDEX_SRC.match(/\.ws-tt-table\.ws-tt-year\s*\{[^}]*\}/);
        assertFalse(!!y && y[0].indexOf('table-layout') !== -1,
            'год: fixed НЕ задан (авто — эталон «по тексту»)');
    });

    test('CSS: год НЕ получает переменную (только месяц)', () => {
        // ЗНАЧЕНИЕ ширины var(--ws-tt-emp-w, 42%) — ровно одно,
        // в месячном правиле :not(.ws-tt-year) (упоминания в
        // комментариях не считаются)
        const n = (INDEX_SRC.match(/width:\s*var\(--ws-tt-emp-w,\s*42%\)/g) || []).length;
        assertEqual(n, 1, 'width: var(--ws-tt-emp-w, 42%) — только базовое правило месяца');
        const y = INDEX_SRC.match(/\.ws-tt-table\.ws-tt-year th\.ws-tt-emp[\s\S]{0,200}?\{[^}]*\}/);
        assertFalse(!!y && y[0].indexOf('--ws-tt-emp-w') !== -1,
            'годовое правило НЕ читает --ws-tt-emp-w (авто-раскладка)');
    });

    test('CSS: десктоп-скрытие колонки месяца НЕ тронуто', () => {
        const i = INDEX_SRC.indexOf(
            '.ws-tt-table:not(.ws-tt-year) th.ws-tt-emp,\n        .ws-tt-table:not(.ws-tt-year) td.ws-tt-emp { display: none; }');
        assertTrue(i !== -1, 'правило display: none (≥1024px) на месте');
    });

    test('CSS: мобильный transition ширины НЕ тронут (плавность)', () => {
        const i = INDEX_SRC.indexOf(
            '.ws-tt-table th.ws-tt-emp,\n        .ws-tt-table td.ws-tt-emp {\n            transition: width 0.35s');
        assertTrue(i !== -1, 'transition-правило итогов на месте (0.35s)');
    });
});

// ============================================================
// 2. SRC: замерщик _measureTtEmpFullW + точки вызова
// ============================================================
describe('Task 382 — SRC: _measureTtEmpFullW', () => {

    test('SRC: метод есть, пишет --ws-tt-emp-w, ceil + 16 + 2', () => {
        const src = methodText(INDEX_SRC, '_measureTtEmpFullW');
        assertTrue(src.length > 0, 'метод найден');
        assertTrue(src.indexOf('--ws-tt-emp-w') !== -1, 'пишет --ws-tt-emp-w');
        assertTrue(src.indexOf('Math.ceil(tw + 16 + 2)') !== -1,
            'ceil(max + паддинги 16 + запас 2)');
    });

    test('SRC: замер строк = № таб. + 5px маржи + ФИО; заголовок тоже', () => {
        const src = methodText(INDEX_SRC, '_measureTtEmpFullW');
        assertTrue(src.indexOf("spanW(tno) + 5") !== -1,
            '№ таб. + 5px margin-right (как в авто-раскладке года)');
        assertTrue(src.indexOf(".ws-tt-name") !== -1, 'ФИО — span.ws-tt-name');
        assertTrue(src.indexOf(".ws-tt-emp-head") !== -1,
            'заголовок «Сотрудник» участвует (как в авто-раскладке)');
    });

    test('SRC: при активном сужении — временно data-full + видимый № таб.', () => {
        const src = methodText(INDEX_SRC, '_measureTtEmpFullW');
        assertTrue(src.indexOf("getAttribute('data-full')") !== -1,
            'текст временно возвращается к data-full');
        assertTrue(src.indexOf("style.display = 'inline'") !== -1,
            'скрытый в сужении № таб. показывается на время замера');
        assertTrue(src.indexOf('tabnos[i].style.display = oldD[i]') !== -1,
            'инлайн-стиль № таб. возвращается');
        assertTrue(src.indexOf('spans[i].textContent = olds[i]') !== -1,
            'текст спанов возвращается');
    });

    test('SRC: шторка ИЛИ страница (меряется видимая, max обоих)', () => {
        const src = methodText(INDEX_SRC, '_measureTtEmpFullW');
        assertTrue(src.indexOf("getElementById('wsTtBody')") !== -1, 'шторка');
        assertTrue(src.indexOf("getElementById('wsTtPageBody')") !== -1, 'страница итогов');
        assertTrue(src.indexOf('if (tw < pw) tw = pw;') !== -1, 'максимум двух');
        assertTrue(src.indexOf('.width <= 0') !== -1, 'невидимый контейнер пропускается');
    });

    test('SRC: _reapplyEmpNarrow зовёт замер (после КАЖДОГО рендера)', () => {
        const src = methodText(INDEX_SRC, '_reapplyEmpNarrow');
        assertTrue(src.indexOf('_measureTtEmpFullW') !== -1,
            '_measureTtEmpFullW внутри _reapplyEmpNarrow (рассматривают месяц И год)');
        assertTrue(src.indexOf("typeof this._measureTtEmpFullW === 'function'") !== -1,
            'typeof-guard — VM-моки без метода не падают');
    });

    test('SRC: рендеры итогов кончаются на _reapplyEmpNarrow (замер обновляется)', () => {
        const rm = methodText(INDEX_SRC, '_renderTotalsMonth');
        const ry = methodText(INDEX_SRC, '_renderTotalsYearTable');
        assertTrue(rm.indexOf('_reapplyEmpNarrow') !== -1, 'месяц → _reapplyEmpNarrow');
        assertTrue(ry.indexOf('_reapplyEmpNarrow') !== -1, 'год → _reapplyEmpNarrow');
    });

    test('SRC: document.fonts.ready — повторный замер (поздний шрифт)', () => {
        const i = INDEX_SRC.indexOf('document.fonts.ready.then(function() {');
        assertTrue(i !== -1, 'fonts.ready-хук есть');
        const chunk = INDEX_SRC.slice(i, i + 900);
        assertTrue(chunk.indexOf('_measureTtEmpFullW') !== -1,
            '_measureTtEmpFullW после загрузки шрифта (ширина текста меняется)');
    });

    test('SRC: прежний замерщик суженной ширины НЕ тронут', () => {
        const src = methodText(INDEX_SRC, '_measureEmpNarrowW');
        assertTrue(src.indexOf('--ws-tt-emp-nw') !== -1, '--ws-tt-emp-nw на месте');
        assertTrue(src.indexOf('--ws-emp-nw') !== -1, '--ws-emp-nw на месте');
    });
});

// ============================================================
// 3. VM: замер на моках DOM
// ============================================================
describe('Task 382 — VM: _measureTtEmpFullW на моках', () => {

    function mkBodyStyle() {
        return {
            props: {},
            setProperty: function(name, val) { this.props[name] = val; },
            getPropertyValue: function(name) { return this.props[name] || ''; }
        };
    }

    // спан с фикс. шириной; в rect-замер пишет лог текущего текста
    // (видно, ЧТО было во время измерения) и лог дисплея
    function mkSpan(cls, full, s4, w, startText, log) {
        return {
            attrs: { 'data-full': full, 'data-s4': s4 },
            text: startText !== undefined ? startText : full,
            style: { display: '' },
            getAttribute: function(k) { return this.attrs[k] || null; },
            set textContent(v) { this.text = v; },
            get textContent() { return this.text; },
            getBoundingClientRect: function() {
                if (log) log.push({ cls: cls, text: this.text,
                                    display: this.style.display });
                return { width: w };
            }
        };
    }

    test('VM: страница видима — max(№+5+ФИО, заголовок) + 16 + 2', () => {
        const bodyStyle = mkBodyStyle();
        const log = [];
        // cell1: №22 + 5 + 84 = 111; cell2: №24 + 5 + 96 = 125; загол. 65
        const tno1 = mkSpan('tabno', '017', '', 22, '017', log);
        const nm1 = mkSpan('name', 'Иванов Иван Иванович', 'Иван', 84, 'Иванов Иван Иванович', log);
        const tno2 = mkSpan('tabno', '018', '', 24, '018', log);
        const nm2 = mkSpan('name', 'Сидоров Сидор Сидорович', 'Сидо', 96, 'Сидоров Сидор Сидорович', log);
        const head = mkSpan('head', 'Сотрудник', 'Сотр', 65, 'Сотрудник', log);
        const cells = [
            { querySelector: function(sel) {
                return sel === '.ws-tt-tabno' ? tno1
                    : sel === '.ws-tt-name' ? nm1 : null; } },
            { querySelector: function(sel) {
                return sel === '.ws-tt-tabno' ? tno2
                    : sel === '.ws-tt-name' ? nm2 : null; } }
        ];
        const page = {
            getBoundingClientRect: function() { return { width: 375 }; },
            querySelectorAll: function(sel) {
                if (sel === 'td.ws-tt-emp') return cells;
                if (sel === '.ws-tt-emp-head') return [head];
                if (sel === '[data-s4]') return [head, nm1, nm2];
                if (sel === '.ws-tt-tabno') return [tno1, tno2];
                return [];
            }
        };
        const doc = {
            body: { style: bodyStyle },
            getElementById: function(id) {
                if (id === 'wsTtPageBody') return page;
                return { getBoundingClientRect: function() { return { width: 0 }; },
                         querySelectorAll: function() { return []; } };
            }
        };
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_measureTtEmpFullW') + '\n});')(doc);
        host._measureTtEmpFullW();
        // max = 125 (строка cell2) → 125 + 16 + 2 = 143
        assertEqual(bodyStyle.props['--ws-tt-emp-w'], '143px',
            '--ws-tt-emp-w = ceil(24+5+96+16+2) = 143px');
        // текст возвращен (начинался полным — остался полным)
        assertEqual(nm2.text, 'Сидоров Сидор Сидорович', 'ФИО возвращено');
        assertEqual(head.text, 'Сотрудник', 'заголовок возвращён');
        assertEqual(tno2.style.display, '', 'дисплей № таб. возвращён');
    });

    test('VM: АКТИВНОЕ СУЖЕНИЕ — замер по data-full, всё возвращено', () => {
        const bodyStyle = mkBodyStyle();
        const log = [];
        // спаны в суженном состоянии: текст = s4, № таб. «скрыт»
        const tno = mkSpan('tabno', '017', '', 22, '017', log);
        const nm = mkSpan('name', 'Щукин Игорь Петрович', 'Щуки', 90, 'Щуки', log);
        const head = mkSpan('head', 'Сотрудник', 'Сотр', 65, 'Сотр', log);
        const cells = [
            { querySelector: function(sel) {
                return sel === '.ws-tt-tabno' ? tno
                    : sel === '.ws-tt-name' ? nm : null; } }
        ];
        const page = {
            getBoundingClientRect: function() { return { width: 375 }; },
            querySelectorAll: function(sel) {
                if (sel === 'td.ws-tt-emp') return cells;
                if (sel === '.ws-tt-emp-head') return [head];
                if (sel === '[data-s4]') return [head, nm];
                if (sel === '.ws-tt-tabno') return [tno];
                return [];
            }
        };
        const doc = {
            body: { style: bodyStyle },
            getElementById: function(id) {
                if (id === 'wsTtPageBody') return page;
                return { getBoundingClientRect: function() { return { width: 0 }; },
                         querySelectorAll: function() { return []; } };
            }
        };
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_measureTtEmpFullW') + '\n});')(doc);
        host._measureTtEmpFullW();
        // ВО ВРЕМЯ замера текст был ПОЛНЫЙ, № таб. виден (inline)
        const nmRect = log.filter(function(l) { return l.cls === 'name'; })[0];
        const tnoRect = log.filter(function(l) { return l.cls === 'tabno'; })[0];
        assertEqual(nmRect.text, 'Щукин Игорь Петрович',
            'замер шёл по ПОЛНОМУ тексту (data-full)');
        assertEqual(tnoRect.display, 'inline',
            '№ таб. на время замера показан (inline)');
        // ПОСЛЕ замера — суженное состояние возвращено
        assertEqual(nm.text, 'Щуки', 'после замера текст = s4 (как было)');
        assertEqual(head.text, 'Сотр', 'заголовок = «Сотр» (как было)');
        assertEqual(tno.style.display, '', 'инлайн-дисплей снят');
        // 22 + 5 + 90 = 117 → 117 + 16 + 2 = 135
        assertEqual(bodyStyle.props['--ws-tt-emp-w'], '135px',
            '--ws-tt-emp-w = ceil(117+16+2) = 135px');
    });

    test('VM: шторка И страница — берётся максимум (рассинхрон имён)', () => {
        const bodyStyle = mkBodyStyle();
        const mkCell = function(tabW, nameW) {
            var tno = mkSpan('tabno', '001', '', tabW, '001');
            var nm = mkSpan('name', 'Иванов И.И.', 'Иван', nameW, 'Иванов И.И.');
            return { cell: { querySelector: function(sel) {
                        return sel === '.ws-tt-tabno' ? tno
                            : sel === '.ws-tt-name' ? nm : null; } },
                     spans: [tno, nm] };
        };
        const drawer = mkCell(20, 80);   // 20+5+80 = 105
        const page = mkCell(22, 90);     // 22+5+90 = 117
        const doc = {
            body: { style: bodyStyle },
            getElementById: function(id) {
                if (id === 'wsTtBody') return {
                    getBoundingClientRect: function() { return { width: 300 }; },
                    querySelectorAll: function(sel) {
                        if (sel === 'td.ws-tt-emp') return [drawer.cell];
                        if (sel === '[data-s4]') return drawer.spans;
                        if (sel === '.ws-tt-tabno') return [drawer.spans[0]];
                        return [];
                    }
                };
                if (id === 'wsTtPageBody') return {
                    getBoundingClientRect: function() { return { width: 375 }; },
                    querySelectorAll: function(sel) {
                        if (sel === 'td.ws-tt-emp') return [page.cell];
                        if (sel === '[data-s4]') return page.spans;
                        if (sel === '.ws-tt-tabno') return [page.spans[0]];
                        return [];
                    }
                };
                return null;
            }
        };
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_measureTtEmpFullW') + '\n});')(doc);
        host._measureTtEmpFullW();
        // max(105, 117) = 117 → 117 + 16 + 2 = 135
        assertEqual(bodyStyle.props['--ws-tt-emp-w'], '135px',
            'максимум двух контейнеров: ceil(117+16+2) = 135px');
    });

    test('VM: оба контейнера скрыты — переменная НЕ тронута', () => {
        const bodyStyle = mkBodyStyle();
        const doc = {
            body: { style: bodyStyle },
            getElementById: function() {
                return { getBoundingClientRect: function() { return { width: 0 }; },
                         querySelectorAll: function() { return []; } };
            }
        };
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_measureTtEmpFullW') + '\n});')(doc);
        host._measureTtEmpFullW();
        assertTrue(!bodyStyle.props['--ws-tt-emp-w'],
            'итоги скрыты — переменная НЕ пишется (фолбэк 42%)');
    });

    test('VM: без ячеек (пустое состояние) — переменная НЕ тронута', () => {
        const bodyStyle = mkBodyStyle();
        const doc = {
            body: { style: bodyStyle },
            getElementById: function(id) {
                if (id === 'wsTtPageBody') return {
                    getBoundingClientRect: function() { return { width: 375 }; },
                    querySelectorAll: function() { return []; }
                };
                return null;
            }
        };
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_measureTtEmpFullW') + '\n});')(doc);
        host._measureTtEmpFullW();
        assertTrue(!bodyStyle.props['--ws-tt-emp-w'], 'нет таблиц — нет записи');
    });

    test('VM: повторный замер с той же шириной — setProperty не дёргается', () => {
        const bodyStyle = mkBodyStyle();
        var calls = 0;
        bodyStyle.setProperty = function(name, val) {
            calls++; this.props[name] = val;
        };
        const tno = mkSpan('tabno', '017', '', 22, '017');
        const nm = mkSpan('name', 'Иванов И.И.', 'Иван', 84, 'Иванов И.И.');
        const cells = [{ querySelector: function(sel) {
            return sel === '.ws-tt-tabno' ? tno
                : sel === '.ws-tt-name' ? nm : null; } }];
        const page = {
            getBoundingClientRect: function() { return { width: 375 }; },
            querySelectorAll: function(sel) {
                if (sel === 'td.ws-tt-emp') return cells;
                if (sel === '[data-s4]') return [nm];
                if (sel === '.ws-tt-tabno') return [tno];
                return [];
            }
        };
        const doc = {
            body: { style: bodyStyle },
            getElementById: function(id) {
                if (id === 'wsTtPageBody') return page;
                return null;
            }
        };
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_measureTtEmpFullW') + '\n});')(doc);
        host._measureTtEmpFullW();
        host._measureTtEmpFullW();
        assertEqual(calls, 1, 'одно setProperty — дубликат не пишется');
    });
});

// ============================================================
// 4. Service Worker
// ============================================================
describe('Task 382 — Service Worker', () => {
    test('SW: кэш поднят до kipia-test-v738', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v738'") !== -1,
            'CACHE_VERSION = kipia-test-v738 (Task 382 — только фронтенд)');
        assertFalse(SW_SRC.indexOf('kipia-test-v739') !== -1,
            'лишний инкремент (v612) не сделан');
    });
});
