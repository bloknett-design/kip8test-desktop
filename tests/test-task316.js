// tests/test-task316.js
// Task 316 — НАВЕДЕНИЕ/КЛИК на дату в шапке шахматки — выделяется
// ВЕСЬ столбец (шапка + ячейки тела, вид как у «сегодня» Task 313):
//   • мышь над датой — столбец подсвечен (снимается уходом курсора);
//   • клик по дате — день ВЫБРАН (держится до клика по другой
//     области / повторного клика / Esc / смены месяца) и ФИЛЬТРУЕТ
//     окно мероприятий месяца по этому дню (записи, НАКРЫВАЮЩИЕ дату:
//     дата_начала <= день <= дата_окончания);
//   • дата в шапке — курсор-палец (кликабельна).
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   HTML/JS: th[data-day] + onmouseenter/onmouseleave (_dayHover) +
//     onclick (_daySelect) на датах шапки; классы ws-hover-col/
//     ws-sel-col штампуются в thead из состояния; td[data-day] в
//     _renderCell + классы ws-hover/ws-sel; document-click (capture)
//     вне th.ws-day-col → _daySelect(null) — сброс; Esc → сброс;
//     onMonthChange — сброс _hoverDay/_selDay.
//   CSS: .ws-hover-col/.ws-sel-col (градиент поверх фона th, число
//     акцентом), td .ws-hover/.ws-sel (inset-«заливка» поверх
//     inline-цветов, выбранный насыщеннее), .ws-day-col cursor:
//     pointer; светлая тема.
//   VM: _dayHover (подсветка столбца, снятие прежнего, no-op);
//     _daySelect (выбор/тоггл/программный сброс, перерисовка окна
//     мероприятий); _renderMonthEventsPanel с _selDay (фильтр
//     накрывающих записей, заголовок «05.09», «нет мероприятий в
//     этот день», охрана дня вне месяца → полный месяц);
//     _dayColClass мягкий к мок-DOM.
//   SW: kipia-test-v759.
//
// Запуск: через tests/run-all.js (require './test-task316.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Вырезка метода WorkSchedule: «имя: function» (отступ 8 пробелов)
// → следующий метод ТОГО ЖЕ уровня.
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
// HTML/JS: разметка шапки, ячеек, слушатели, сбросы
// ------------------------------------------------------------
describe('Task 316 — HTML/JS: столбец дня по наведению/клику', () => {

    test('JS: thead — th[data-day] + hover/leave/click хандлеры', () => {
        assertTrue(/thCls \+ '" data-day="' \+ d \+ '"'/.test(INDEX_SRC),
            'th несёт data-day дня (после class)');
        assertTrue(/onmouseenter="WorkSchedule\._dayHover\(' \+ d \+ '\)"/.test(INDEX_SRC),
            'onmouseenter → _dayHover(d)');
        assertTrue(/onmouseleave="WorkSchedule\._dayHover\(null\)"/.test(INDEX_SRC),
            'onmouseleave → _dayHover(null)');
        assertTrue(/onclick="WorkSchedule\._daySelect\(' \+ d \+ '\)"/.test(INDEX_SRC),
            'onclick → _daySelect(d)');
    });

    test('JS: thead — классы ws-hover-col/ws-sel-col из состояния', () => {
        assertTrue(/\(this\._hoverDay === d \? ' ws-hover-col' : ''\)/.test(INDEX_SRC),
            'ws-hover-col штампуется при _hoverDay === d');
        assertTrue(/\(this\._selDay === d \? ' ws-sel-col' : ''\)/.test(INDEX_SRC),
            'ws-sel-col штампуется при _selDay === d');
    });

    test('JS: _renderCell — td[data-day] + классы ws-hover/ws-sel', () => {
        const cell = methodText(INDEX_SRC, '_renderCell');
        assertTrue(cell.indexOf('data-day="\' + day + \'"') !== -1,
            'td несёт data-day дня');
        assertTrue(cell.indexOf("if (day === this._hoverDay) classes.push('ws-hover');") !== -1,
            'ws-hover по _hoverDay');
        assertTrue(cell.indexOf("if (day === this._selDay) classes.push('ws-sel');") !== -1,
            'ws-sel по _selDay');
    });

    test('JS: init — document-click (capture) вне дат — сброс выбора', () => {
        // init — НЕуникальное имя (другие модули); ищем в границах
        // WorkSchedule (срез от «var WorkSchedule = {»)
        const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));
        const init = methodText(WS_SRC, 'init');
        assertTrue(/addEventListener\('click'/.test(init),
            'document click-слушатель установлен');
        assertTrue(init.indexOf("t.closest('th.ws-day-col')") !== -1,
            'клик по ДАТЕ шапки пропускается (разбирает её onclick)');
        assertTrue(/selfOnce\._daySelect\(null\);\s*\}, true\);/.test(init),
            'сброс выбора вызывается в CAPTURE-фазе (, true)');
    });

    test('JS: init — Esc снимает выбор дня', () => {
        const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));
        const init = methodText(WS_SRC, 'init');
        // Task 385: между closeEmpPopup и _daySelect добавлено
        // закрытие шторки «Легенда» — окно расширено 300 → 700
        assertTrue(/ev\.key === 'Escape'[\s\S]{0,700}selfOnce\._daySelect\(null\);/.test(init),
            'Escape → _daySelect(null) рядом с закрытием попапов (+легенда Task 385)');
    });

    test('JS: onMonthChange — смена месяца сбрасывает выбор', () => {
        const omc = methodText(INDEX_SRC, 'onMonthChange');
        assertTrue(omc.indexOf('this._hoverDay = null;') !== -1 &&
                   omc.indexOf('this._selDay = null;') !== -1,
            'наведение и выбор сбрасываются при смене месяца/года');
    });

    test('JS: состояние _hoverDay/_selDay объявлено', () => {
        assertTrue(/_hoverDay: null,/.test(INDEX_SRC) &&
                   /_selDay: null,/.test(INDEX_SRC),
            'поля состояния объявлены в объекте');
    });
});

// ------------------------------------------------------------
// CSS: подсветка столбца — тёмная и светлая темы
// ------------------------------------------------------------
describe('Task 316 — CSS: вид столбца наведённой/выбранной даты', () => {

    test('CSS: th — градиент поверх фона + акцент (hover и sel)', () => {
        assertTrue(/\.ws-grid thead th\.ws-day-col\.ws-hover-col\s*\{[^}]*background-image/.test(INDEX_SRC),
            '.ws-hover-col — градиент');
        assertTrue(/\.ws-grid thead th\.ws-day-col\.ws-sel-col\s*\{[^}]*background-image/.test(INDEX_SRC),
            '.ws-sel-col — градиент');
        const hov = INDEX_SRC.match(/\.ws-grid thead th\.ws-day-col\.ws-hover-col\s*\{([^}]*)\}/)[1];
        const sel = INDEX_SRC.match(/\.ws-grid thead th\.ws-day-col\.ws-sel-col\s*\{([^}]*)\}/)[1];
        assertTrue(parseFloat(hov.match(/rgba\(\s*74,\s*143,\s*199,\s*([\d.]+)\s*\)/)[1]) <
                   parseFloat(sel.match(/rgba\(\s*74,\s*143,\s*199,\s*([\d.]+)\s*\)/)[1]),
            'выбранный столбец НАСЫЩЕННЕЕ наведённого');
    });

    test('CSS: td — inset-«заливка» поверх inline-цветов (hover и sel)', () => {
        assertTrue(/\.ws-grid tbody td\.ws-cell\.ws-hover\s*\{[^}]*inset 0 0 0 999px/.test(INDEX_SRC),
            '.ws-hover — inset-заливка');
        assertTrue(/\.ws-grid tbody td\.ws-cell\.ws-sel\s*\{[^}]*inset 0 0 0 999px/.test(INDEX_SRC),
            '.ws-sel — inset-заливка');
        assertTrue(/td\.ws-cell\.ws-hover\.ws-source-manual/.test(INDEX_SRC) &&
                   /td\.ws-cell\.ws-sel\.ws-source-manual/.test(INDEX_SRC),
            'составные правила с ручной правкой — рамка не затёрта');
    });

    test('CSS: дата в шапке — курсор-палец', () => {
        assertTrue(/\.ws-grid thead th\.ws-day-col\s*\{[^}]*cursor:\s*pointer/.test(INDEX_SRC),
            'th.ws-day-col { cursor: pointer } — дата кликабельна');
    });

    test('CSS: светлая тема — те же состояния мягче', () => {
        assertTrue(/\[data-theme="light"\] \.ws-grid thead th\.ws-day-col\.ws-hover-col/.test(INDEX_SRC) &&
                   /\[data-theme="light"\] \.ws-grid thead th\.ws-day-col\.ws-sel-col/.test(INDEX_SRC) &&
                   /\[data-theme="light"\] \.ws-grid tbody td\.ws-cell\.ws-hover/.test(INDEX_SRC) &&
                   /\[data-theme="light"\] \.ws-grid tbody td\.ws-cell\.ws-sel/.test(INDEX_SRC),
            'светлая тема: hover/sel для шапки и ячеек');
    });
});

// ------------------------------------------------------------
// VM: _dayHover / _daySelect / _dayColClass / фильтр окна
// ------------------------------------------------------------
describe('Task 316 — VM: подсветка столбца и выбор дня', () => {

    // Фейковый элемент с классами
    function fakeEl(tag) {
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

    // Мок-DOM: wsGridWrap с колонками по data-day; wsEventsPanel — el
    function makeDom(days) {
        const byDay = {};
        for (var i = 0; i < days.length; i++) {
            var d = days[i];
            byDay[String(d)] = [fakeEl('TH')].concat([fakeEl('TD'), fakeEl('TD')]);
        }
        var wrap = {
            querySelectorAll: function(sel) {
                var m = String(sel).match(/\[data-day="(\d+)"\]/);
                return m ? (byDay[m[1]] || []) : [];
            }
        };
        var panel = { innerHTML: '', hidden: true };
        var document = {
            getElementById: function(id) {
                if (id === 'wsGridWrap') return wrap;
                if (id === 'wsEventsPanel') return panel;
                return null;
            }
        };
        return { byDay: byDay, wrap: wrap, panel: panel, document: document };
    }

    const REAL = ['_dayHover', '_daySelect', '_dayColClass',
                  '_renderMonthEventsPanel', '_trainingCodeOf', '_statusMeta'];

    function makeCtx(dom, extra) {
        const texts = REAL.map(n => methodText(INDEX_SRC, n))
            .filter(t => t.length > 0);
        assertTrue(texts.length === REAL.length, 'все методы найдены');
        const make = new Function('localStorage', 'document', 'confirm',
                                  'KipToast', 'kipConfirm',
            'return ({' + texts.join('\n') + '\n' +
            '_year: 2026, _month: 9,' +
            '_hoverDay: null, _selDay: null,' +
            '_TRAININGS: [], _EMPLOYEES: [], _STATUS_CODES: [],' +
            '_esc: function(s){ return String(s == null ? "" : s); },' +
            '_escAttr: function(s){ return String(s == null ? "" : s); },' +
            '_isoDate: function(dt){ var m=(""+(dt.getMonth()+1)).padStart(2,"0"); var d=(""+dt.getDate()).padStart(2,"0"); return dt.getFullYear()+"-"+m+"-"+d; }, _barExpSync: function() {},' +
            (extra || '') + '\n});');
        return make(null, dom.document, null, null, null);
    }

    test('VM: _dayHover — классы столбца th + td, снятие прежнего', () => {
        const dom = makeDom([3, 5]);
        const ctx = makeCtx(dom);
        ctx._dayHover(3);
        assertEqual(ctx._hoverDay, 3, 'состояние _hoverDay = 3');
        assertTrue(dom.byDay['3'][0].classList.contains('ws-hover-col'), 'th получил ws-hover-col');
        assertTrue(dom.byDay['3'][1].classList.contains('ws-hover'), 'td получил ws-hover');
        // переход курсора на другой день: прежний столбец гаснет
        ctx._dayHover(5);
        assertFalse(dom.byDay['3'][0].classList.contains('ws-hover-col'),
            'уход с даты 3 — ws-hover-col снят');
        assertTrue(dom.byDay['5'][0].classList.contains('ws-hover-col'),
            'дата 5 — ws-hover-col поставлен');
        // уход курсора — снятие
        ctx._dayHover(null);
        assertFalse(dom.byDay['5'][0].classList.contains('ws-hover-col'),
            'onmouseleave (null) — подсветка снята');
        assertEqual(ctx._hoverDay, null, '_hoverDay сброшен');
    });

    test('VM: _daySelect — выбор/тоггл/сброс + перерисовка окна', () => {
        const dom = makeDom([5]);
        let renders = 0;
        const ctx = makeCtx(dom);
        // обёртка-счётчик вызовов перерисовки окна мероприятий
        const orig = ctx._renderMonthEventsPanel.bind(ctx);
        ctx._renderMonthEventsPanel = function() { renders++; return orig(); };

        ctx._daySelect(5);
        assertEqual(ctx._selDay, 5, 'день 5 выбран');
        assertTrue(dom.byDay['5'][0].classList.contains('ws-sel-col'), 'th: ws-sel-col');
        assertTrue(dom.byDay['5'][1].classList.contains('ws-sel'), 'td: ws-sel');
        assertEqual(renders, 1, 'окно мероприятий перерисовано (фильтр по дню)');

        // повторный клик по той же дате — сброс
        ctx._daySelect(5);
        assertEqual(ctx._selDay, null, 'повторный клик — выбор снят');
        assertFalse(dom.byDay['5'][0].classList.contains('ws-sel-col'), 'ws-sel-col снят');
        assertEqual(renders, 2, 'окно перерисовано (полный месяц)');

        // программный сброс при пустом выборе — no-op (без перерисовки)
        ctx._daySelect(null);
        assertEqual(renders, 2, 'no-op: ничего не выбрано — окно не трогается');
    });

    test('VM: _dayColClass — мягкий к отсутствию DOM', () => {
        const dom = { document: { getElementById: function() { return null; } } };
        const ctx = makeCtx(dom);
        ctx._dayColClass(7, 'ws-sel-col', 'ws-sel', true); // не должен бросить
        assertTrue(true, 'нет wsGridWrap — тихо пропущено');
    });
});

// ------------------------------------------------------------
// VM: _renderMonthEventsPanel — фильтр по выбранному дню
// ------------------------------------------------------------
describe('Task 316 — VM: окно мероприятий по выбранному дню', () => {

    const EMP = [{ 'таб_номер': '0871', 'ФИО': 'Иванов Иван Иванович' }];
    const CODES = [
        { code: 'И', name: 'Инструктаж', color: '#B3E5FC' },
        { code: 'ОБ', name: 'Обучение', color: '#A5D6A7' }
    ];

    function makePanel(trainings, selDay, year, month) {
        const el = { innerHTML: '', hidden: true };
        const document = { getElementById: function(id) {
            return id === 'wsEventsPanel' ? el : null;
        }};
        const texts = ['_instrShortOf', '_normInstrKey',
                   '_renderMonthEventsPanel', '_trainingCodeOf', '_statusMeta']
            .map(n => methodText(INDEX_SRC, n));
        const make = new Function('localStorage', 'document', 'confirm', 'KipToast', 'kipConfirm',
            'return ({' + texts.join('\n') + '\n' +
            '_year: ' + (year || 2026) + ', _month: ' + (month || 9) + ',' +
            '_selDay: ' + (selDay === null || selDay === undefined ? 'null' : selDay) + ',' +
            '_hoverDay: null,' +
            '_TRAININGS: ' + JSON.stringify(trainings) + ',' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_STATUS_CODES: ' + JSON.stringify(CODES) + ',' +
            '_esc: function(s){ return String(s == null ? "" : s); },' +
            '_escAttr: function(s){ return String(s == null ? "" : s); },' +
            '_isoDate: function(dt){ var m=(""+(dt.getMonth()+1)).padStart(2,"0"); var d=(""+dt.getDate()).padStart(2,"0"); return dt.getFullYear()+"-"+m+"-"+d; }, _barExpSync: function() {},' +
            '});');
        const ctx = make(null, document, null, null, null);
        ctx._renderMonthEventsPanel();
        return el;
    }

    test('VM: выбранный день — только НАКРЫВАЮЩИЕ записи', () => {
        const trs = [
            { 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Повторный',
              'дата_начала': '2026-09-02', 'дата_окончания': '2026-09-05' },   // накрывает 03
            { 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Целевой',
              'дата_начала': '2026-09-03' },                                    // ровно день
            { 'таб_номер': '0871', 'тип': 'обучение', 'тема': 'После',
              'дата_начала': '2026-09-04', 'дата_окончания': '2026-09-06' },   // не накрывает 03
            { 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'До',
              'дата_начала': '2026-09-01', 'дата_окончания': '2026-09-02' }    // кончился 02
        ];
        const el = makePanel(trs, 3);
        assertTrue(el.innerHTML.indexOf('Мероприятия · 03.09 · 2') !== -1,
            'заголовок: день «03.09» и счётчик = 2');
        assertTrue(el.innerHTML.indexOf('Повторный') !== -1 &&
                   el.innerHTML.indexOf('Целевой') !== -1,
            'накрывающие записи показаны');
        assertFalse(el.innerHTML.indexOf('После') !== -1, 'начавшееся 04.09 — скрыто');
        assertFalse(el.innerHTML.indexOf('· До ·') !== -1, 'кончившееся 02.09 — скрыто');
        assertTrue(el.innerHTML.indexOf('02–05.09') !== -1,
            'диапазон записи показывается даже при фильтре');
    });

    test('VM: день с границей диапазона (02 = начало одной и конец другой)', () => {
        const trs = [
            { 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Первое',
              'дата_начала': '2026-08-29', 'дата_окончания': '2026-09-02' },
            { 'таб_номер': '0871', 'тип': 'обучение', 'тема': 'Второе',
              'дата_начала': '2026-09-02', 'дата_окончания': '2026-09-05' }
        ];
        const el = makePanel(trs, 2);
        assertTrue(el.innerHTML.indexOf('Мероприятия · 02.09 · 2') !== -1,
            'обе записи накрывают 02.09 (граница включительно)');
    });

    test('VM: день без мероприятий — «нет мероприятий в этот день»', () => {
        const trs = [{ 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Другой день',
                       'дата_начала': '2026-09-10' }];
        const el = makePanel(trs, 15);
        assertTrue(el.innerHTML.indexOf('нет мероприятий в этот день') !== -1,
            'пустое состояние для дня');
        assertTrue(el.innerHTML.indexOf('Мероприятия · 15.09') !== -1,
            'заголовок с выбранным днём');
        assertFalse(el.innerHTML.indexOf('· 0') !== -1, 'нулевого счётчика нет');
    });

    test('VM: _selDay = null — прежний вид (весь месяц)', () => {
        const trs = [{ 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'В месяце',
                       'дата_начала': '2026-09-02' }];
        const el = makePanel(trs, null);
        assertTrue(el.innerHTML.indexOf('Мероприятия · сентябрь 2026 · 1') !== -1,
            'без выбора — месяц/год/счётчик (Task 315 без изменений)');
        assertFalse(el.innerHTML.indexOf('нет мероприятий в этом месяце') !== -1,
            'запись месяца показана');
    });

    test('VM: выбранный день ВНЕ месяца — охрана (полный месяц)', () => {
        // сентябрь 2026: 30 дней; _selDay=31 не существует
        const trs = [{ 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'В месяце',
                       'дата_начала': '2026-09-02' }];
        const el = makePanel(trs, 31);
        assertTrue(el.innerHTML.indexOf('Мероприятия · сентябрь 2026 · 1') !== -1,
            'день вне месяца → обычный вид месяца (selIso не собран)');
    });
});

// ------------------------------------------------------------
// SW: версия кэша
// ------------------------------------------------------------
describe('Task 316 — SW: версия кэша', () => {
    test('SW: kipia-test-v759', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v759') !== -1,
            'CACHE_VERSION = kipia-test-v759');
        assertFalse(SW_SRC.indexOf('kipia-test-v554') !== -1,
            'прежней версии нет');
    });
});
