// tests/test-task328.js
// Task 328 — заявка пользователя:
//   «Добавь кнопку в виде значка включения и отключения функции
//    перекрёстной подсветки строк и столбцов в шахматке графика.
//    Расположи её слева от кнопки "Сформировать". Сделай размер
//    всех кнопок в баре над шахматкой немного меньше. Всплывающие
//    окна с подсказками при наведении указателя мыши на два окна
//    и кнопки "Итоги учёта", "Месяц", "Год", "Отменить" убери, а на
//    кнопке "Сформировать" сделай такого же формата как у кнопки
//    "Обновить".»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   HTML: #wsCrossBtn — иконка-переключатель (svg-перекрестье,
//     aria-pressed="true", aria-label, БЕЗ title) в ряду 3
//     #wsActionsRow СЛЕВА от «Сформировать»; нативные title УБРАНЫ
//     с «Итоги учёта»/«Месяц»/«Год»/«Отменить»/«Сформировать»;
//     окно #wsGenerateTip — формат кнопки «Обновить» (класс
//     ws-refresh-tip + .ws-rt-date/.ws-rt-desc), после #wsRefreshTip.
//   CSS: .ws-cross-btn (32×32, svg 16px, состояния aria-pressed
//     true/false, светлая тема; десктоп — height 100%, width 34px);
//     кнопки бара МЕНЬШЕ: шрифт 13px (вкладки 12px), паддинги
//     5px 11px/5px 10px/5px 8px, высота 34px → 32px, десктоп
//     4px 12px → 4px 9px.
//   JS/VM: _crossOn (true по умолчанию); toggleCross — переключение,
//     localStorage kip8_ws_cross_v1, aria-pressed кнопки, снятие
//     подсветки при выключении, тост; init — восстановление из
//     localStorage; гейт `self._crossOn === false` в mouseover-
//     делегировании; _show/_hideGenerateTip (позиция над/под
//     кнопкой) + проводка слушателей (наведение/фокус/scroll);
//     тултипы ДВУХ ОКОН бара удалены (ws-ep-item без title,
//     renderPanel без title: нормы/бейдж/чипы, monthsGen удалён).
//   SW: kipia-test-v738.
//
// Запуск: через tests/run-all.js (require './test-task328.js').

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

function methodFn(src, name) {
    const txt = methodText(src, name);
    assertTrue(txt.length > 0, 'метод найден: ' + name);
    const obj = new Function('return ({' + txt + '\n});')();
    return obj[name];
}

function buttonTag(html, id) {
    const m = html.match(new RegExp('<button[^>]*id="' + id + '"[^>]*>'));
    return m ? m[0] : '';
}

// ============================================================
// 1. HTML: кнопка-иконка перекрестья + тултипы кнопок
// ============================================================
describe('Task 328 — HTML: кнопка перекрестья и тултипы', () => {

    const ws = INDEX_SRC.slice(INDEX_SRC.indexOf('id="page-work-schedule"'),
                                INDEX_SRC.indexOf('id="wsGridWrap"'));

    test('HTML: #wsCrossBtn — в ряду 3, СЛЕВА от «Сформировать» (заявка)', () => {
        const iAct = ws.indexOf('id="wsActionsRow"');
        const chunk = ws.slice(iAct, ws.indexOf('</div>', ws.indexOf('id="wsCancelBtn"')));
        const iCross = chunk.indexOf('id="wsCrossBtn"');
        const iGen = chunk.indexOf('id="wsGenerateBtn"');
        const iSave = chunk.indexOf('id="wsSaveBtn"');
        const iCancel = chunk.indexOf('id="wsCancelBtn"');
        assertTrue(iCross !== -1, 'кнопка перекрестья есть в ряду действий');
        assertTrue(iGen !== -1 && iCross < iGen,
            'перекрестье СЛЕВА от «Сформировать» (заявка)');
        assertTrue(iGen < iSave && iSave < iCancel,
            'порядок ряда сохранён: Сформировать → Сохранить → Отменить');
    });

    test('HTML: #wsCrossBtn — иконка-переключатель (svg, aria, БЕЗ title)', () => {
        const tag = buttonTag(ws, 'wsCrossBtn');
        assertTrue(tag.length > 0, 'кнопка есть');
        assertTrue(tag.indexOf('WorkSchedule.toggleCross()') !== -1,
            'onclick → WorkSchedule.toggleCross()');
        assertTrue(tag.indexOf('aria-pressed="true"') !== -1,
            'начальное состояние ВКЛЮЧЕНО (aria-pressed)');
        assertTrue(tag.indexOf('aria-label="Перекрёстная подсветка') !== -1,
            'подпись для скринридеров (иконка без текста)');
        assertFalse(/title="/.test(tag),
            'видимой всплывающей подсказки НЕТ (заявка убрала тултипы)');
        // иконка — svg с сеткой и перекрестьем (строка+столбец)
        const btnFull = ws.slice(ws.indexOf('id="wsCrossBtn"') - 120,
                                 ws.indexOf('</button>', ws.indexOf('id="wsCrossBtn"')));
        assertTrue(btnFull.indexOf('<svg') !== -1 && btnFull.indexOf('viewBox="0 0 24 24"') !== -1,
            'иконка svg 24×24');
        assertTrue(btnFull.indexOf('M3 9h18v6H3z') !== -1 &&
                   btnFull.indexOf('M9 3h6v18H9z') !== -1,
            'перекрестье: ЗАЛИВКИ строки (M3 9h18v6) и столбца (M9 3h6v18)');
    });

    test('HTML: нативные title УБРАНЫ с кнопок (заявка)', () => {
        // «Итоги учёта», «Месяц», «Год», «Отменить» — без всплывающих
        // подсказок при наведении
        ['wsTotalsBtn', 'wsTtTabMonth', 'wsTtTabYear', 'wsCancelBtn',
         'wsGenerateBtn'].forEach(function(id) {
            const tag = buttonTag(ws, id);
            assertTrue(tag.length > 0, 'кнопка есть: ' + id);
            assertFalse(/title="/.test(tag),
                'нативного title нет: ' + id + ' (Task 328)');
        });
    });

    test('HTML: окно #wsGenerateTip — формат кнопки «Обновить» (заявка)', () => {
        const iRefresh = ws.indexOf('id="wsRefreshTip"');
        const iGen = ws.indexOf('id="wsGenerateTip"');
        assertTrue(iGen !== -1, 'окно #wsGenerateTip есть');
        assertTrue(iRefresh !== -1 && iRefresh < iGen,
            'окно «Сформировать» рядом с окном «Обновить» (после него)');
        const tip = ws.slice(iGen, ws.indexOf('</div>\n            </div>', iGen));
        assertTrue(tip.indexOf('class="ws-refresh-tip"') !== -1,
            'тот же класс, что у #wsRefreshTip (формат «Обновить»)');
        assertTrue(tip.indexOf('ws-rt-date') !== -1,
            'строка-заголовок .ws-rt-date (как строка-дата «Обновить»)');
        assertTrue(tip.indexOf('Сформировать шахматку') !== -1,
            'заголовок «Сформировать шахматку»');
        assertTrue(tip.indexOf('ws-rt-desc') !== -1,
            'описание .ws-rt-desc');
        assertTrue(tip.indexOf('диалог подтверждения') !== -1,
            'описание упоминает диалог подтверждения (бывший title)');
        assertTrue(/\shidden\b/.test(tip),
            'скрыто по умолчанию (hidden)');
    });
});

// ============================================================
// 2. CSS: кнопка-иконка + размеры кнопок бара
// ============================================================
describe('Task 328 — CSS: перекрестье и размеры кнопок', () => {

    test('CSS: .ws-cross-btn — квадрат 32×32, иконка 16px', () => {
        const re = /\.ws-cross-btn \{[^}]*width:\s*32px[^}]*height:\s*32px[^}]*padding:\s*0/;
        assertTrue(re.test(INDEX_SRC), 'квадрат 32×32 без паддинга');
        assertTrue(/\.ws-cross-btn svg \{[^}]*width:\s*16px[^}]*height:\s*16px/.test(INDEX_SRC),
            'иконка 16×16');
        assertTrue(/\.ws-cross-btn \{[^}]*display:\s*inline-flex[^}]*justify-content:\s*center/.test(INDEX_SRC),
            'иконка центрируется');
    });

    test('CSS: состояния aria-pressed — ВКЛ тинт / ВЫКЛ приглушение', () => {
        assertTrue(/\.ws-cross-btn\[aria-pressed="true"\] \{[^}]*background:\s*rgba\(74, 143, 199, 0\.18\)/.test(INDEX_SRC),
            'ВКЛЮЧЕНА — синий тинт (как нажатый переключатель)');
        assertTrue(/\.ws-cross-btn\[aria-pressed="false"\] \{[^}]*color:\s*var\(--text-secondary/.test(INDEX_SRC),
            'ВЫКЛЮЧЕНА — нейтральный цвет');
        assertTrue(/\.ws-cross-btn\[aria-pressed="false"\] svg \{[^}]*opacity:\s*0\.55/.test(INDEX_SRC),
            'ВЫКЛЮЧЕНА — иконка приглушена');
        assertTrue(/\[data-theme="light"\] \.ws-cross-btn \{/.test(INDEX_SRC),
            'светлая тема есть');
        assertTrue(/\[data-theme="light"\] \.ws-cross-btn\[aria-pressed="true"\] \{/.test(INDEX_SRC),
            'светлая тема: ВКЛ-состояние есть');
    });

    test('CSS: десктоп — перекрестье во всю высоту ряда, ширина 34px', () => {
        const re = /@media \(min-width: 1024px\) \{[\s\S]*?\.ws-cross-btn \{[^}]*height:\s*100%[^}]*width:\s*34px[^}]*padding:\s*0/;
        assertTrue(re.test(INDEX_SRC),
            'десктоп: height 100% ряда, width 34px, без паддинга');
    });

    test('CSS: кнопки бара МЕНЬШЕ — шрифт 13px, паддинги уменьшены (заявка)', () => {
        assertTrue(/\.ws-generate-btn \{[^}]*padding:\s*5px 11px[^}]*font-size:\s*13px/.test(INDEX_SRC),
            '«Сформировать»: 5px 11px / 13px (было 6px 14px / 14px)');
        assertTrue(/\.ws-save-btn \{[^}]*padding:\s*5px 11px[^}]*font-size:\s*13px/.test(INDEX_SRC),
            '«Сохранить»: 5px 11px / 13px');
        assertTrue(/\.ws-cancel-btn \{[^}]*padding:\s*5px 11px[^}]*font-size:\s*13px[^}]*height:\s*32px/.test(INDEX_SRC),
            '«Отменить»: 5px 11px / 13px / высота 32px');
        assertTrue(/\.ws-refresh-btn \{[^}]*padding:\s*5px 10px[^}]*font-size:\s*13px/.test(INDEX_SRC),
            '«Обновить»: 5px 10px / 13px');
        assertTrue(/\.ws-refresh-btn svg \{[^}]*width:\s*13px[^}]*height:\s*13px/.test(INDEX_SRC),
            'иконка «Обновить»: 13px (была 14px)');
        assertTrue(/\.ws-totals-btn \{[^}]*padding:\s*5px 11px[^}]*font-size:\s*13px/.test(INDEX_SRC),
            '«Итоги учёта»: 5px 11px / 13px');
        assertTrue(/\.ws-tt-tab \{[^}]*padding:\s*5px 10px[^}]*font-size:\s*12px/.test(INDEX_SRC),
            'вкладки «Месяц»/«Год»: 5px 10px / 12px');
        assertTrue(/\.ws-month-sel, \.ws-year-sel \{[^}]*padding:\s*5px 8px[^}]*font-size:\s*13px/.test(INDEX_SRC),
            'селекты месяца/года: 5px 8px / 13px (ряд ровный)');
    });

    test('CSS: единая высота кнопок — 32px (была 34px)', () => {
        const re = /\.ws-month-sel, \.ws-year-sel, \.ws-generate-btn, \.ws-save-btn,\s*\n\s*\.ws-refresh-btn, \.ws-totals-btn, \.ws-tt-tab \{[^}]*height:\s*32px/;
        assertTrue(re.test(INDEX_SRC), 'общая высота ряда — 32px (Task 328)');
    });
});

// ============================================================
// 3. JS: состояние, переключение, гейт, окно «Сформировать»
// ============================================================
describe('Task 328 — JS: toggleCross и окно «Сформировать»', () => {

    test('JS: состояние _crossOn (true по умолчанию)', () => {
        assertTrue(/_crossOn:\s*true/.test(INDEX_SRC),
            '_crossOn: true — перекрестье включено по умолчанию');
    });

    test('JS: toggleCross — переключение/сохранение/синхронизация', () => {
        const m = methodText(WS_CLIENT, 'toggleCross');
        assertTrue(m.length > 0, 'метод есть');
        assertTrue(m.indexOf('this._crossOn = !this._crossOn;') !== -1,
            'переключение состояния');
        assertTrue(m.indexOf("localStorage.setItem('kip8_ws_cross_v1'") !== -1,
            'сохранение выбора (kip8_ws_cross_v1)');
        assertTrue(m.indexOf("this._crossOn ? '1' : '0'") !== -1,
            'значение по состоянию');
        assertTrue(m.indexOf("getElementById('wsCrossBtn')") !== -1,
            'кнопка синхронизируется');
        assertTrue(m.indexOf("aria-pressed") !== -1,
            'aria-pressed кнопки');
        assertTrue(m.indexOf('this._cellHover(null);') !== -1,
            'выключение СРАЗУ гасит подсветку (строку и столбец)');
        assertTrue(m.indexOf('Подсветка строк и столбцов включена') !== -1 &&
                   m.indexOf('Подсветка строк и столбцов выключена') !== -1,
            'тост-отклик (иконка без текста)');
    });

    test('JS: init — восстановление состояния из localStorage', () => {
        const init = INDEX_SRC.slice(INDEX_SRC.indexOf('init: function'),
                                     INDEX_SRC.indexOf('_refreshFromUrlState: function'));
        assertTrue(init.indexOf("localStorage.getItem('kip8_ws_cross_v1') === '0'") !== -1,
            'чтение сохранённого выбора (выключено)');
        assertTrue(init.indexOf("crossBtn.setAttribute('aria-pressed'") !== -1,
            'кнопка получает сохранённое состояние');
    });

    test('JS: гейт перекрестья в mouseover-делегировании', () => {
        const init = INDEX_SRC.slice(INDEX_SRC.indexOf('init: function'),
                                     INDEX_SRC.indexOf('_refreshFromUrlState: function'));
        const iGrid = init.indexOf("getElementById('wsGridWrap')");
        assertTrue(iGrid !== -1, 'делегирование на контейнере сетки');
        const seg = init.slice(iGrid, iGrid + 1600);
        assertTrue(seg.indexOf('if (self._crossOn === false) return;') !== -1,
            'ВЫКЛЮЧЕНО — наведение НЕ подсвечивает (гейт в mouseover)');
        assertTrue(seg.indexOf('self._cellHover(ri, day);') !== -1,
            'ВКЛЮЧЕНО — прежнее поведение Task 319');
    });

    test('JS: _showGenerateTip/_hideGenerateTip — позиция как у «Обновить»', () => {
        const show = methodText(WS_CLIENT, '_showGenerateTip');
        assertTrue(show.length > 0, 'метод показа есть');
        assertTrue(show.indexOf("getElementById('wsGenerateBtn')") !== -1 &&
                   show.indexOf("getElementById('wsGenerateTip')") !== -1,
            'привязка к кнопке «Сформировать» и её окну');
        assertTrue(show.indexOf('r.top - tip.offsetHeight - 8') !== -1,
            'по умолчанию — НАД кнопкой (зазор 8px, как «Обновить»)');
        assertTrue(show.indexOf('r.bottom + 6') !== -1,
            'не хватает места — ПОД кнопкой (как «Обновить»)');
        assertTrue(show.indexOf('.desktop-top-bar') !== -1,
            'учёт верхнего бара (приём Task 319)');
        const hide = methodText(WS_CLIENT, '_hideGenerateTip');
        assertTrue(hide.length > 0, 'метод скрытия есть');
        assertTrue(hide.indexOf("getElementById('wsGenerateTip')") !== -1,
            'ищет окно');
        assertTrue(hide.indexOf('tip.hidden = true') !== -1, 'скрытие');
    });

    test('JS: init — проводка окна «Сформировать» (наведение/фокус/scroll)', () => {
        const init = INDEX_SRC.slice(INDEX_SRC.indexOf('init: function'),
                                     INDEX_SRC.indexOf('_refreshFromUrlState: function'));
        assertTrue(init.indexOf("getElementById('wsGenerateTip')") !== -1,
            'окно «Сформировать» в init');
        assertTrue(init.indexOf('document.body.appendChild(gTip)') !== -1,
            'окно перенесено в <body> (приём Task 319 — stacking-контекст)');
        const iWire = init.indexOf('_showGenerateTip');
        assertTrue(iWire !== -1, 'проводка тултипа в init');
        const seg = init.slice(Math.max(0, iWire - 900), iWire + 1200);
        assertTrue(seg.indexOf("addEventListener('mouseenter'") !== -1 &&
                   seg.indexOf("addEventListener('mouseleave'") !== -1,
            'наведение/уход курсора');
        assertTrue(seg.indexOf("addEventListener('focus'") !== -1 &&
                   seg.indexOf("addEventListener('blur'") !== -1,
            'фокус с клавиатуры');
        const iScroll = init.indexOf("document.addEventListener('scroll'");
        const scrollSeg = init.slice(iScroll, iScroll + 300);
        assertTrue(scrollSeg.indexOf('_hideGenerateTip()') !== -1,
            'прокрутка скрывает ОБА окна (Обновить + Сформировать)');
    });

    test('JS: тултипы ДВУХ ОКОН бара удалены (заявка)', () => {
        // окно 2 — мероприятия месяца: строки без нативного title
        const ep = methodText(WS_CLIENT, '_renderMonthEventsPanel');
        assertTrue(ep.indexOf('ws-ep-item') !== -1, 'строки окна мероприятий');
        assertFalse(ep.indexOf('title="') !== -1,
            'окно мероприятий: БЕЗ всплывающих подсказок (Task 328)');
        assertFalse(ep.indexOf('_escAttr(tip)') !== -1,
            'переменная tip удалена');
        // окно 3 — время и праздники: renderPanel без title
        const rp = methodText(WS_CLIENT, 'renderPanel');
        assertTrue(rp.indexOf('ws-cp-norms') !== -1, 'группа норм рендерится');
        assertFalse(rp.indexOf('title=') !== -1,
            'окно календаря: БЕЗ всплывающих подсказок (Task 328)');
        assertFalse(rp.indexOf('ws-cal-prelim" title') !== -1,
            'бейдж «предварительно» — без title');
        assertFalse(rp.indexOf('var monthsGen') !== -1,
            'monthsGen удалён (был только в тултипах чипов)');
    });
});

// ============================================================
// 4. VM: поведение на моках
// ============================================================
describe('Task 328 — VM: toggleCross и окно «Сформировать»', () => {

    test('VM: toggleCross — вкл/выкл, localStorage, aria, снятие подсветки', () => {
        const saved = { key: null, val: null };
        const btn = { pressed: 'true',
                      setAttribute: function(k, v) { if (k === 'aria-pressed') this.pressed = v; } };
        const toasts = [];
        const hovers = [];
        const gBackup = { ls: global.localStorage, doc: global.document,
                          toast: global.KipToast };
        global.localStorage = {
            getItem: function() { return null; },
            setItem: function(k, v) { saved.key = k; saved.val = v; }
        };
        global.document = { getElementById: function(id) {
            return id === 'wsCrossBtn' ? btn : null;
        } };
        global.KipToast = { show: function(m) { toasts.push(m); } };
        try {
            const fn = methodFn(WS_CLIENT, 'toggleCross');
            const ctx = { _crossOn: true,
                          _cellHover: function(d) { hovers.push(d); } };

            fn.call(ctx);
            assertEqual(ctx._crossOn, false, 'переключение: ВКЛ → ВЫКЛ');
            assertEqual(saved.key, 'kip8_ws_cross_v1', 'ключ localStorage');
            assertEqual(saved.val, '0', 'ВЫКЛ сохранено как "0"');
            assertEqual(btn.pressed, 'false', 'кнопка: aria-pressed="false"');
            assertEqual(hovers.length, 1, 'подсветка снята при выключении');
            assertEqual(hovers[0], null, '_cellHover(null)');
            assertEqual(toasts.length, 1, 'тост показан');
            assertEqual(toasts[0], 'Подсветка строк и столбцов выключена',
                'текст тоста ВЫКЛ');

            fn.call(ctx);
            assertEqual(ctx._crossOn, true, 'переключение: ВЫКЛ → ВКЛ');
            assertEqual(saved.val, '1', 'ВКЛ сохранено как "1"');
            assertEqual(btn.pressed, 'true', 'кнопка: aria-pressed="true"');
            assertEqual(hovers.length, 1, 'при ВКЛ подсветку НЕ трогает');
            assertEqual(toasts[1], 'Подсветка строк и столбцов включена',
                'текст тоста ВКЛ');
        } finally {
            global.localStorage = gBackup.ls;
            global.document = gBackup.doc;
            global.KipToast = gBackup.toast;
        }
    });

    test('VM: _showGenerateTip — над кнопкой; _hideGenerateTip скрывает', () => {
        // кнопка на y=200, окно 40px → top = 200 − 40 − 8 = 152
        const tip = { hidden: true, style: {}, offsetHeight: 40 };
        const btn = { getBoundingClientRect: function() {
            return { top: 200, left: 50, bottom: 232 };
        } };
        const doc = { getElementById: function(id) {
            return id === 'wsGenerateBtn' ? btn :
                   id === 'wsGenerateTip' ? tip : null;
        } };
        const show = new Function('document',
            'return ({' + methodText(WS_CLIENT, '_showGenerateTip') + '\n});')(doc)._showGenerateTip;
        const hide = new Function('document',
            'return ({' + methodText(WS_CLIENT, '_hideGenerateTip') + '\n});')(doc)._hideGenerateTip;
        show.call({});
        assertTrue(tip.hidden === false, 'окно показано');
        assertEqual(tip.style.left, '50px', 'лево — по кнопке');
        assertEqual(tip.style.top, '152px', 'над кнопкой (зазор 8px)');
        hide.call({});
        assertTrue(tip.hidden === true, 'скрыто');
    });

    test('VM: _showGenerateTip — у верхней кромки → под кнопкой', () => {
        // top=20: 20 − 40 − 8 = −28 < 4 → под кнопкой: bottom 52 + 6 = 58
        const tip = { hidden: true, style: {}, offsetHeight: 40 };
        const btn = { getBoundingClientRect: function() {
            return { top: 20, left: 0, bottom: 52 };
        } };
        const doc = { getElementById: function(id) {
            return id === 'wsGenerateBtn' ? btn :
                   id === 'wsGenerateTip' ? tip : null;
        } };
        const show = new Function('document',
            'return ({' + methodText(WS_CLIENT, '_showGenerateTip') + '\n});')(doc)._showGenerateTip;
        show.call({});
        assertEqual(tip.style.top, '58px', 'под кнопкой (зазор 6px)');
        assertEqual(tip.style.left, '6px', 'лево не меньше 6px');
    });
});

// ============================================================
// 5. Service Worker
// ============================================================
describe('Task 328 — Service Worker', () => {
    test('SW: версия кэша kipia-test-v738', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v738'") !== -1,
            'CACHE_VERSION = kipia-test-v738 (Task 328 — только фронтенд)');
        assertFalse(SW_SRC.indexOf('kipia-test-v739') !== -1,
            'лишний инкремент не делался');
    });
});
