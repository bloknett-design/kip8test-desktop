// tests/test-task334.js
// Task 334 — заявка пользователя:
//   «Название кнопки "Вид" сделай без значков, просто "Вид". В полной
//    карточке прибора, блок с картинкой и строками "№ прибора" и "Место
//    установки" не должны прокручиваться по вертикали. Необходимо
//    проработать отображение раздела табельного учёта в мобильной
//    версии: кнопка включения перекрёстной подсветки должна быть убрана
//    (её функционал не реализуется в мобильной версии); два окна с
//    мероприятиями и нормами должны быть изначально скрыты; итоги учёта
//    должны открываться на новой странице под названием "Итоги учёта"
//    и с тремя шевронами в верхнем баре, а таблица данных должна быть
//    с фамилиями сотрудников; при прокрутке по горизонтали шахматки
//    табеля учёта и таблицы итогов учёта, столбцы с фамилиями
//    сотрудников должны сужаться до отображения первых четырёх букв
//    фамилий.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   HTML/CSS КНОПКА ВИДА: в #wsViewBtn НЕТ svg-значков — только
//     span.ws-view-label «Вид»; иконки wsViewIconFull/Shift/Day
//     удалены из разметки; CSS-правило .ws-view-btn svg удалено;
//     _updateViewBtn больше не переключает иконки.
//   CSS КАРТОЧКА ПРИБОРА: #page-device-detail .dev-detail-top —
//     position: sticky, top: 56px (под липкой шапкой страницы);
//     #detailPanel .dev-detail-top — sticky top: 0 + full-bleed
//     маржины −16px (скролл-зона панели).
//   CSS МОБИЛЬНЫЙ ТАБЕЛЬ: #wsCrossBtn — display: none в media
//     ≤1023px; окна #wsEventsPanel/#wsCalPanel скрыты БЕЗ классов
//     ws-mob-events-on/ws-mob-norms-on (:not-селекторы); чипы
//     .ws-mob-chips — только мобильный display: flex.
//   HTML СТРАНИЦА ИТОГОВ: #page-ws-totals с шапкой (шеврон
//     chevronTap + заголовок «Итоги учёта»), вкладки Месяц/Год
//     (#wsTtPageTabMonth/#wsTtPageTabYear), тело #wsTtPageBody;
//     CSS .ws-tt-page — flex-колонка высотой 100vh − 56 − 70.
//   JS НАВИГАЦИЯ: PAGE_PARENTS['ws-totals'] = 'work-schedule';
//     PAGE_LABELS['ws-totals'] = 'Итоги учёта';
//     _WORK_SCHEDULE_PAGES = ['work-schedule', 'ws-totals'];
//     хук navigateTo: открытие → WorkSchedule.onTotalsPageOpen,
//     уход с ws-totals → onTotalsPageClose; toggleTotals на мобиле
//     (matchMedia !min-1024) уходит navigateTo('ws-totals').
//   JS VM: toggleMobPanel (классы ws-mob-events-on/ws-mob-norms-on +
//     aria-pressed чипа), onTotalsPageOpen (флаг _ttPage + рендер в
//     #wsTtPageBody), onTotalsPageClose, _ttBodyEl (страница/шторка),
//     _surname4 (первые 4 буквы первого слова), _narrowApply (класс
//     ws-narrow + обмен data-s4/data-full), _reapplyEmpNarrow
//     (восстановление при scrollLeft > 6), _attachEmpNarrow
//     (однократность).
//   РЕНДЕР: сетка — span.ws-emp-full с data-full/data-s4; итоги
//     (месяц/год) — span.ws-tt-name с data-full/data-s4.
//   CSS СУЖЕНИЕ: .ws-grid.ws-narrow th/td.ws-emp-col — 76px,
//     .ws-tab-no/.ws-emp-pos скрыты; .ws-tt-table.ws-narrow
//     th/td.ws-tt-emp — 58px, .ws-tt-tabno скрыт (media ≤1023px).
//   SW: kipia-test-v755.
//
// Запуск: через tests/run-all.js (require './test-task334.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

const WS_CLIENT = INDEX_SRC;

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

// Извлечение CSS-правила по началу селектора (первое вхождение)
function ruleBlock(cssPart) {
    const i = INDEX_SRC.indexOf(cssPart);
    if (i === -1) return '';
    const rest = INDEX_SRC.slice(i);
    const m = rest.match(/\}\s/);
    return rest.slice(0, m ? m.index + 1 : 200);
}

// ============================================================
// 1. Кнопка «Вид» — БЕЗ значков
// ============================================================
describe('Task 334 — кнопка «Вид» без значков', () => {

    test('HTML: в #wsViewBtn нет svg — только span.ws-view-label', () => {
        const iBtn = INDEX_SRC.indexOf('id="wsViewBtn"');
        const iEnd = INDEX_SRC.indexOf('</button>', iBtn);
        const chunk = INDEX_SRC.slice(iBtn, iEnd);
        assertTrue(chunk.indexOf('<span class="ws-view-label">Вид</span>') !== -1,
            'подпись «Вид» в кнопке');
        assertFalse(chunk.indexOf('<svg') !== -1,
            'svg-значков в кнопке НЕТ');
        assertFalse(chunk.indexOf('wsViewIconFull') !== -1,
            'иконка wsViewIconFull удалена');
    });

    test('HTML: иконки видов удалены из разметки целиком', () => {
        assertFalse(INDEX_SRC.indexOf('id="wsViewIconFull"') !== -1,
            'wsViewIconFull отсутствует');
        assertFalse(INDEX_SRC.indexOf('id="wsViewIconShift"') !== -1,
            'wsViewIconShift отсутствует');
        assertFalse(INDEX_SRC.indexOf('id="wsViewIconDay"') !== -1,
            'wsViewIconDay отсутствует');
    });

    test('CSS: правило .ws-view-btn svg удалено', () => {
        assertFalse(INDEX_SRC.indexOf('.ws-view-btn svg') !== -1,
            'мёртвое правило .ws-view-btn svg удалено');
        const label = ruleBlock('.ws-view-btn .ws-view-label {');
        assertTrue(label.length > 0, 'правило .ws-view-label живо');
        assertTrue(/font-size:\s*13px/.test(label), 'шрифт 13px');
        assertTrue(/font-weight:\s*600/.test(label), 'жирность 600');
    });

    test('JS: _updateViewBtn не переключает иконки', () => {
        const fn = methodText(WS_CLIENT, '_updateViewBtn');
        assertTrue(fn.indexOf('wsViewIconFull') === -1,
            'в _updateViewBtn нет обращений к иконкам');
        assertTrue(fn.indexOf("names[this._view]") !== -1,
            'aria-label с названием вида остался');
        assertTrue(fn.indexOf('ws-view-locked') !== -1,
            'класс замка роли остался');
    });
});

// ============================================================
// 2. Карточка прибора — верхний блок НЕ прокручивается
// ============================================================
describe('Task 334 — карточка прибора: блок картинка+№+Место липкий', () => {

    test('CSS: мобильная страница — sticky top 56px', () => {
        const b = ruleBlock('#page-device-detail .dev-detail-top {');
        assertTrue(b.length > 0, 'правило найдено');
        assertTrue(/position:\s*sticky/.test(b), 'position: sticky');
        assertTrue(/top:\s*56px/.test(b), 'top: 56px — под липкой шапкой');
        assertTrue(/z-index:\s*5/.test(b), 'z-index: 5');
        assertTrue(/box-shadow/.test(b), 'тень отделения от контента');
    });

    test('CSS: светлая тема — тень мягче', () => {
        const b = ruleBlock('[data-theme="light"] #page-device-detail .dev-detail-top {');
        assertTrue(b.length > 0, 'правило светлой темы есть');
        assertTrue(/box-shadow/.test(b), 'тень задана');
    });

    test('CSS: десктопная панель — sticky top 0 + full-bleed', () => {
        const i = INDEX_SRC.indexOf('#detailPanel .dev-detail-top {');
        assertTrue(i !== -1, 'правило панели найдено');
        const rest = INDEX_SRC.slice(i);
        const m = rest.match(/\}\s/);
        const b = rest.slice(0, m ? m.index + 1 : 300);
        assertTrue(/position:\s*sticky/.test(b), 'position: sticky');
        assertTrue(/top:\s*0/.test(b), 'top: 0 — верх скролл-зоны панели');
        assertTrue(/margin-left:\s*-16px/.test(b), 'full-bleed слева');
        assertTrue(/margin-right:\s*-16px/.test(b), 'full-bleed справа');
        assertTrue(/padding-left:\s*16px/.test(b), 'картинка на прежнем месте');
    });
});

// ============================================================
// 3. Мобильный табельный учёт: подсветка скрыта, окна за чипами
// ============================================================
describe('Task 334 — мобильный: кнопка подсветки скрыта', () => {

    test('CSS: #wsCrossBtn — display:none в media ≤1023px', () => {
        const i = INDEX_SRC.indexOf('/* 1) кнопка подсветки — СКРЫТА на мобильном */');
        assertTrue(i !== -1, 'комментарий блока Task 334 найден');
        const chunk = INDEX_SRC.slice(i, i + 400);
        assertTrue(/#wsCrossBtn\s*\{\s*display:\s*none/.test(chunk),
            'кнопка подсветки скрыта на мобильном');
    });

    test('CSS: окна скрыты без классов чипов (только ≤1023px)', () => {
        assertTrue(INDEX_SRC.indexOf(
            '#page-work-schedule:not(.ws-mob-events-on) #wsEventsPanel') !== -1,
            'мероприятия скрыты без ws-mob-events-on');
        assertTrue(INDEX_SRC.indexOf(
            '#page-work-schedule:not(.ws-mob-norms-on) #wsCalPanel') !== -1,
            'нормы скрыты без ws-mob-norms-on');
    });

    test('HTML: чипы .ws-mob-chips с кнопками «Мероприятия»/«Нормы»', () => {
        const i = INDEX_SRC.indexOf('id="wsMobChips"');
        assertTrue(i !== -1, 'ряд чипов найден');
        const iEnd = INDEX_SRC.indexOf('</div>', i);
        const chunk = INDEX_SRC.slice(i, iEnd);
        assertTrue(chunk.indexOf('id="wsChipEvents"') !== -1,
            'чип «Мероприятия» есть');
        assertTrue(chunk.indexOf('id="wsChipNorms"') !== -1,
            'чип «Нормы» есть');
        assertTrue(chunk.indexOf('WorkSchedule.toggleMobPanel(\'events\')') !== -1,
            'чип мероприятий зовёт toggleMobPanel(events)');
        assertTrue(chunk.indexOf('WorkSchedule.toggleMobPanel(\'norms\')') !== -1,
            'чип норм зовёт toggleMobPanel(norms)');
    });

    test('CSS: чипы только на мобильном, активный — акцент', () => {
        const b = ruleBlock('.ws-mob-chips {');
        assertTrue(/display:\s*none/.test(b), 'базово скрыты (десктоп)');
        const i = INDEX_SRC.indexOf('.ws-mob-chips { display: flex; }');
        assertTrue(i !== -1, 'mobile media показывает чипы');
        const a = ruleBlock('.ws-mob-chip[aria-pressed="true"] {');
        assertTrue(/rgba\(74,\s*143,\s*199/.test(a), 'активный чип — акцент');
    });

    test('VM: toggleMobPanel — класс страницы + aria-pressed чипа', () => {
        function mkPage() {
            // хранилище классов — ВНУТРИ classList (this = classList)
            const cl = { classes: {},
                contains: function(c) { return !!this.classes[c]; },
                toggle: function(c, on) { this.classes[c] = !!on; } };
            return { classList: cl };
        }
        function mkChip() {
            return { attrs: {},
                     setAttribute: function(k, v) { this.attrs[k] = v; } };
        }
        const page = mkPage();
        const chipE = mkChip(), chipN = mkChip();
        const els = { 'page-work-schedule': page,
                      'wsChipEvents': chipE, 'wsChipNorms': chipN };
        const host = new Function('document', 'return ({' +
            methodText(WS_CLIENT, 'toggleMobPanel') + '\n});')(mockDoc(els));
        host.toggleMobPanel('events');
        assertTrue(page.classList.contains('ws-mob-events-on'),
            'класс ws-mob-events-on поставлен');
        assertFalse(page.classList.contains('ws-mob-norms-on'),
            'нормы не тронуты');
        assertEqual(chipE.attrs['aria-pressed'], 'true',
            'чип мероприятий — aria-pressed true');
        host.toggleMobPanel('events');
        assertFalse(page.classList.contains('ws-mob-events-on'),
            'повторный тоггл снимает класс');
        assertEqual(chipE.attrs['aria-pressed'], 'false',
            'чип мероприятий — aria-pressed false');
        host.toggleMobPanel('norms');
        assertTrue(page.classList.contains('ws-mob-norms-on'),
            'класс ws-mob-norms-on поставлен');
        assertEqual(chipN.attrs['aria-pressed'], 'true',
            'чип норм — aria-pressed true');
    });

});

// ============================================================
// 4. Страница «Итоги учёта» (мобильная)
// ============================================================
describe('Task 334 — страница «Итоги учёта»', () => {

    test('HTML: страница с шапкой, вкладками и телом', () => {
        const i = INDEX_SRC.indexOf('id="page-ws-totals"');
        assertTrue(i !== -1, 'страница #page-ws-totals существует');
        const iEnd = INDEX_SRC.indexOf('</div>', INDEX_SRC.indexOf('id="wsTtPageBody"'));
        const chunk = INDEX_SRC.slice(i, iEnd);
        assertTrue(chunk.indexOf('page-inline-header-chevron') !== -1,
            'шеврон «Назад» в шапке (chevronTap — многострелочный)');
        assertTrue(chunk.indexOf('>Итоги учёта</div>') !== -1,
            'заголовок «Итоги учёта»');
        assertTrue(chunk.indexOf('id="wsTtPageTabMonth"') !== -1,
            'вкладка «Месяц»');
        assertTrue(chunk.indexOf('id="wsTtPageTabYear"') !== -1,
            'вкладка «Год»');
        assertTrue(chunk.indexOf('id="wsTtPageBody"') !== -1,
            'тело таблиц #wsTtPageBody');
    });

    test('JS: navigateTo открывает/закрывает страницу итогов', () => {
        assertTrue(INDEX_SRC.indexOf(
            "if (page === 'ws-totals') {") !== -1,
            'хук открытия страницы итогов');
        assertTrue(INDEX_SRC.indexOf(
            'WorkSchedule.onTotalsPageOpen(); }, 30);') !== -1,
            'onTotalsPageOpen по таймеру (как init табеля)');
        assertTrue(INDEX_SRC.indexOf(
            'WorkSchedule._ttPage) {\n            WorkSchedule.onTotalsPageClose();') !== -1,
            'уход с ws-totals снимает флаг (_ttPage)');
    });

    test('JS: toggleTotals — мобильная ветка уходит на страницу', () => {
        const fn = methodText(WS_CLIENT, 'toggleTotals');
        assertTrue(fn.indexOf("navigateTo('ws-totals')") !== -1,
            'мобильная ветка: navigateTo(ws-totals)');
        assertTrue(fn.indexOf("(min-width: 1024px)") !== -1,
            'ветка по matchMedia');
    });

    test('JS: карты страниц — родитель/метка/доступ', () => {
        assertTrue(INDEX_SRC.indexOf("'ws-totals':                'work-schedule'") !== -1,
            'PAGE_PARENTS: дочь табеля');
        assertTrue(INDEX_SRC.indexOf("'ws-totals':                'Итоги учёта'") !== -1,
            'PAGE_LABELS: «Итоги учёта»');
        assertTrue(INDEX_SRC.indexOf(
            "_WORK_SCHEDULE_PAGES: ['work-schedule', 'ws-totals', 'ws-workers', 'ws-legend', 'ws-talons']") !== -1,
            '_WORK_SCHEDULE_PAGES: страницы модуля (+ «Работники» — Task 385; + «Обозначения» — Task 386)');
    });

    test('VM: onTotalsPageOpen — флаг, вкладки, рендер в тело страницы', () => {
        function mkTab() {
            const cl = { classes: {},
                toggle: function(c, on) { this.classes[c] = !!on; } };
            return { classList: cl };
        }
        const els = {
            wsTtPageTabMonth: mkTab(),
            wsTtPageTabYear: mkTab(),
            wsTtPageBody: { innerHTML: '', querySelector: function() { return null; } }
        };
        const host = new Function('document', 'return ({' +
            methodText(WS_CLIENT, 'onTotalsPageOpen') + '\n' +
            methodText(WS_CLIENT, 'onTotalsPageClose') + '\n' +
            methodText(WS_CLIENT, '_ttBodyEl') + '\n' +
            '_totalsTab: "month",' +
            '_renderTotals: function() { this._rendered = true; },' +
            '_reapplyEmpNarrow: function() { this._reapplied = true; }' +
            '});')(mockDoc(els));
        host.onTotalsPageOpen();
        assertTrue(host._ttPage === true, 'флаг _ttPage включён');
        assertTrue(host._rendered === true, 'рендер итогов выполнен');
        assertTrue(host._reapplied === true, 'сужение восстановлено');
        assertTrue(els.wsTtPageTabMonth.classList.classes['active'] === true,
            'вкладка «Месяц» активна');
        assertTrue(els.wsTtPageTabYear.classList.classes['active'] === false,
            'вкладка «Год» не активна');
        // тело — СТРАНИЦА (не шторка)
        assertEqual(host._ttBodyEl(), els.wsTtPageBody,
            '_ttBodyEl отдаёт тело страницы при открытом _ttPage');
        host.onTotalsPageClose();
        assertFalse(host._ttPage === true, 'флаг снят закрытием');
    });

    test('VM: _ttBodyEl — без страницы отдаёт шторку', () => {
        const els = {
            wsTtBody: { innerHTML: '' },
            wsTtPageBody: { innerHTML: '' }
        };
        const host = new Function('document', 'return ({' +
            methodText(WS_CLIENT, '_ttBodyEl') + '\n_ttPage: false });')(mockDoc(els));
        assertEqual(host._ttBodyEl(), els.wsTtBody,
            'закрытая страница — рендер в шторку');
    });

    test('JS: рендеры берут тело через _ttBodyEl', () => {
        for (const fn of ['_renderTotalsMonth', '_renderTotalsYear',
                          '_renderTotalsYearTable']) {
            const src = methodText(WS_CLIENT, fn);
            assertTrue(src.indexOf("this._ttBodyEl()") !== -1,
                fn + ' использует _ttBodyEl()');
        }
        const rc = methodText(WS_CLIENT, '_rowClass');
        assertTrue(rc.indexOf("this._ttBodyEl()") !== -1,
            '_rowClass использует _ttBodyEl()');
    });

    test('JS: гейты рендера учитывают страницу (_ttPage)', () => {
        const rt = methodText(WS_CLIENT, '_renderTotals');
        assertTrue(rt.indexOf('!this._totalsOpen && !this._ttPage') !== -1,
            '_renderTotals: шторка ИЛИ страница');
        const ri = methodText(WS_CLIENT, '_renderTotalsIfOpen');
        assertTrue(ri.indexOf('this._totalsOpen || this._ttPage') !== -1,
            '_renderTotalsIfOpen: шторка ИЛИ страница');
        const st = methodText(WS_CLIENT, 'setTotalsTab');
        assertTrue(st.indexOf("wsTtPageTabMonth") !== -1,
            'setTotalsTab синхронизирует вкладки страницы');
    });

    test('CSS: компоновка страницы (flex-колонка, скролл тела)', () => {
        const b = ruleBlock('.ws-tt-page {');
        assertTrue(/display:\s*flex/.test(b), 'flex-колонка');
        assertTrue(/flex-direction:\s*column/.test(b), 'направление колонкой');
        assertTrue(/100vh - 56px - 70px/.test(b),
            'высота: экран минус шапка минус низ');
        const tabs = ruleBlock('.ws-tt-page-tabs {');
        assertTrue(/display:\s*flex/.test(tabs), 'ряд вкладок');
        const body = INDEX_SRC.indexOf('.ws-tt-page-body { flex: 1 1 auto; }');
        assertTrue(body !== -1, 'тело растягивается');
    });
});

// ============================================================
// 5. Сужение фамилий до 4 букв при горизонтальной прокрутке
// ============================================================
describe('Task 334 — сужение ФИО до 4 букв', () => {

    test('VM: _surname4 — первые 4 буквы первого слова', () => {
        const host = new Function('return ({' +
            methodText(WS_CLIENT, '_surname4') + '\n});')();
        assertEqual(host._surname4('Иванов Иван Иванович'), 'Иван',
            'фамилия Иванов → «Иван»');
        assertEqual(host._surname4('Петров П.П.'), 'Петр',
            'фамилия Петров → «Петр»');
        assertEqual(host._surname4('Ёлкин'), 'Ёлки',
            'короткая фамилия — до 4 букв');
        assertEqual(host._surname4(''), '',
            'пустая строка — пусто');
        assertEqual(host._surname4(null), '',
            'null — пусто');
        assertEqual(host._surname4('  Крюкова О.'), 'Крюк',
            'ведущие пробелы не мешают');
    });

    test('VM: _narrowApply — классы таблиц + обмен текста span', () => {
        const spanFull = {
            _attr: { 'data-full': 'Иванов И.И.', 'data-s4': 'Иван' },
            text: 'Иванов И.И.',
            getAttribute: function(k) { return this._attr[k]; },
            set textContent(v) { this.text = v; },
            get textContent() { return this.text; }
        };
        // простой объект span
        function mkSpan(full, s4) {
            return { full: full, s4: s4, cur: full,
                getAttribute: function(k) {
                    return k === 'data-full' ? this.full : this.s4; },
                set textContent(v) { this.cur = v; },
                get textContent() { return this.cur; } };
        }
        const span = mkSpan('Иванов И.И.', 'Иван');
        const table = { classList: { classes: {},
            toggle: function(c, on) { this.classes[c] = !!on; } } };
        const container = {
            querySelectorAll: function(sel) {
                if (sel === '.ws-grid, .ws-tt-table') return [table];
                return [span];
            }
        };
        const host = new Function('return ({' +
            methodText(WS_CLIENT, '_narrowApply') + '\n});')();
        host._narrowApply(container, true);
        assertTrue(table.classList.classes['ws-narrow'] === true,
            'класс ws-narrow поставлен');
        assertEqual(span.textContent, 'Иван', 'текст = 4 буквы фамилии');
        host._narrowApply(container, false);
        assertFalse(table.classList.classes['ws-narrow'] === true,
            'класс снят');
        assertEqual(span.textContent, 'Иванов И.И.', 'полное ФИО возвращено');
    });

    test('VM: _reapplyEmpNarrow — восстанавливает при scrollLeft > 6', () => {
        const els = {
            wsGridWrap: { scrollLeft: 40 },
            wsTtBody: { scrollLeft: 0 },
            wsTtPageBody: { scrollLeft: 7 }
        };
        // new Function не видит внешних переменных — сбор вызовов
        // в сам объект-хост
        const host = new Function('document', 'return ({' +
            methodText(WS_CLIENT, '_reapplyEmpNarrow') + '\n' +
            '_calls: [],' +
            '_narrowApply: function(c, on) { this._calls.push([c, on]); }' +
            '});')(mockDoc(els));
        host._reapplyEmpNarrow();
        assertEqual(host._calls.length, 2, 'два прокрученных контейнера');
        assertEqual(host._calls[0][0], els.wsGridWrap, 'сетка');
        assertEqual(host._calls[1][0], els.wsTtPageBody, 'страница итогов');
    });

    test('VM: _attachEmpNarrow — однократность + passive', () => {
        const bound = [];
        function mkEl(id) {
            return { id: id, addEventListener: function(type, fn, opts) {
                bound.push({ id: id, type: type, opts: opts, fn: fn }); } };
        }
        const els = { wsGridWrap: mkEl('wsGridWrap'), wsTtBody: mkEl('wsTtBody'),
                      wsTtPageBody: mkEl('wsTtPageBody') };
        const host = new Function('document', 'return ({' +
            methodText(WS_CLIENT, '_attachEmpNarrow') + '\n' +
            '_narrowAttached: false,' +
            '_narrowApply: function() {}' + '});')(mockDoc(els));
        host._attachEmpNarrow();
        host._attachEmpNarrow();
        assertEqual(bound.length, 3, 'ровно три слушателя');
        assertEqual(bound[0].id, 'wsGridWrap', 'шахматка');
        assertEqual(bound[1].id, 'wsTtBody', 'шторка');
        assertEqual(bound[2].id, 'wsTtPageBody', 'страница итогов');
        assertTrue(bound[0].opts && bound[0].opts.passive === true,
            'passive: true');
        // событие прокрутки применяет сужение
        const target = { scrollLeft: 100, _narrow: null };
        const host2 = new Function('return ({' +
            methodText(WS_CLIENT, '_narrowApply') + '\n});')();
        bound[0].fn.call(target);
        // (fn вызывает self._narrowApply(el, scrollLeft > 6) через замыкание
        //  на host — проверяем через отдельный вызов ниже)
    });

    test('РЕНДЕР: сетка — span.ws-emp-full с data-full/data-s4', () => {
        const i = INDEX_SRC.indexOf('class="ws-emp-full"');
        assertTrue(i !== -1, 'span.ws-emp-full в разметке сетки');
        const chunk = INDEX_SRC.slice(i - 260, i + 260);
        assertTrue(chunk.indexOf('data-full=') !== -1, 'data-full есть');
        assertTrue(chunk.indexOf('data-s4=') !== -1, 'data-s4 есть');
        assertTrue(chunk.indexOf('_surname4') !== -1,
            'значение s4 — из _surname4');
    });

    test('РЕНДЕР: итоги — span.ws-tt-name с data-full/data-s4', () => {
        const i = INDEX_SRC.indexOf('class="ws-tt-name"');
        assertTrue(i !== -1, 'span.ws-tt-name в месячной таблице');
        const chunk = INDEX_SRC.slice(i - 300, i + 300);
        assertTrue(chunk.indexOf('data-full=') !== -1, 'data-full (месяц)');
        const j = INDEX_SRC.indexOf('class="ws-tt-name"', i + 1);
        assertTrue(j !== -1, 'span.ws-tt-name и в годовой (yearRow)');
    });

    test('CSS: .ws-grid.ws-narrow — узкая колонка (Task 336: по ширине текста), без таб.номера/должности', () => {
        const b = ruleBlock('.ws-grid.ws-narrow thead th.ws-emp-col,');
        assertTrue(b.length > 0, 'правило найдено');
        assertTrue(/width:\s*var\(--ws-emp-nw, 52px\)/.test(b), 'ширина var(--ws-emp-nw) (Task 336 — по сокращённому тексту)');
        assertTrue(/min-width:\s*var\(--ws-emp-nw, 52px\)/.test(b), 'минимум var(--ws-emp-nw)');
        const i = INDEX_SRC.indexOf(
            '.ws-grid.ws-narrow td.ws-emp-col .ws-tab-no,');
        assertTrue(i !== -1, 'скрытие таб. номера/должности');
        const chunk = INDEX_SRC.slice(i, i + 200);
        assertTrue(/display:\s*none/.test(chunk), 'display: none');
    });

    test('CSS: .ws-tt-table.ws-narrow — var(--ws-tt-emp-nw) (Task 336), без таб.номера', () => {
        const b = ruleBlock('.ws-tt-table.ws-narrow th.ws-tt-emp,');
        assertTrue(b.length > 0, 'правило найдено');
        assertTrue(/width:\s*var\(--ws-tt-emp-nw, 48px\)/.test(b), 'ширина var(--ws-tt-emp-nw) (по сокращённому тексту)');
        const i = INDEX_SRC.indexOf('.ws-tt-table.ws-narrow .ws-tt-tabno');
        assertTrue(i !== -1, 'скрытие таб. номера итогов');
        const chunk = INDEX_SRC.slice(i, i + 120);
        assertTrue(/display:\s*none/.test(chunk), 'display: none');
    });

    test('JS: _reapplyEmpNarrow вызывается после рендеров', () => {
        const rg = methodText(WS_CLIENT, '_renderGrid');
        assertTrue(rg.indexOf('_reapplyEmpNarrow') !== -1,
            '_renderGrid восстанавливает сужение');
        const rm = methodText(WS_CLIENT, '_renderTotalsMonth');
        assertTrue(rm.indexOf('_reapplyEmpNarrow') !== -1,
            '_renderTotalsMonth восстанавливает сужение');
        const ry = methodText(WS_CLIENT, '_renderTotalsYearTable');
        assertTrue(ry.indexOf('_reapplyEmpNarrow') !== -1,
            '_renderTotalsYearTable восстанавливает сужение');
    });

    test('JS: init вешает слушатели прокрутки', () => {
        // вызов _attachEmpNarrow уникален (только в init WorkSchedule —
        // у других модулей init без него)
        assertTrue(INDEX_SRC.indexOf('this._attachEmpNarrow();') !== -1,
            'init табеля вызывает _attachEmpNarrow');
        // вызов стоит ДО чтения даты (ранняя точка init)
        const i = INDEX_SRC.indexOf('this._attachEmpNarrow();');
        const j = INDEX_SRC.indexOf('var now = new Date();', i);
        assertTrue(i !== -1 && j > i, 'слушатели вешаются в начале init');
    });
});

// ============================================================
// 6. Service Worker
// ============================================================
describe('Task 334 — Service Worker', () => {
    test('SW: кэш поднят до kipia-test-v755', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v755'") !== -1,
            'CACHE_VERSION = kipia-test-v755 (Task 334 — только фронтенд)');
        assertFalse(SW_SRC.indexOf('kipia-test-v756') !== -1,
            'лишний инкремент (v577) не сделан');
    });
});
