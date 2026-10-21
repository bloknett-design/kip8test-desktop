// tests/test-task313.js
// Task 313 — подсветка сегодняшней даты в шахматке + отдельное окно
// «Мероприятия в этот день» над окном кодов.
// Заявка пользователя:
//   «В шахматке должен немного подсвечиваться фон сегодняшней даты.
//    При нажатии на ячейку в шахматке, помимо окна с кодами, должно
//    появляться ещё одно отдельное окно, расположенное над окном с
//    кодами, в котором должны отображаться все мероприятия в этой
//    ячейке, с отображением цвета, кода и названием, а в окне с кодами
//    убери строку "Мероприятия в этот день", теперь этот функционал
//    будет в окне выше, которое как раз можно назвать "Мероприятия
//    в этот день"».
//
// ЧТО ПРОВЕРЯЕТСЯ (статические инварианты клиента):
//   Подсветка сегодняшней даты:
//     — _renderGrid: todayIso кэшируется в this._todayIso;
//     — шапка: колонка сегодняшней даты получает класс ws-today-col;
//     — _renderCell: ячейка столбца «сегодня» получает класс ws-today;
//     — CSS: ws-today-col (градиент поверх непрозрачного фона th —
//       sticky-шапка), td.ws-today (inset-«заливка» — работает поверх
//       inline-цветов статусов), совмещённое правило «сегодня + ручная
//       запись» (обе inset-тени составные), светлая тема.
//   Окно «Мероприятия в этот день»:
//     — HTML: #wsEventsPopup (.ws-cell-popup.ws-events-popup) рядом
//       с #wsCellPopup;
//     — CSS: компактное окно (max-height 300px), z-index 9402 выше
//       окна кодов 9401, подстрока даты и пустое состояние;
//     — _renderCellPopup: секции мероприятий БОЛЬШЕ НЕТ (Task 313),
//       «+ Мероприятие…»/«Дополнительно…» живы;
//     — _renderEventsPopup: заголовок «Мероприятия в этот день»,
//       подстрока «дата · ФИО», строки мероприятий (свотч ЦВЕТА +
//       КОД + НАЗВАНИЕ), кнопки ✎/✕ только редакторам (Task 309),
//       пустое состояние «нет мероприятий»;
//     — _openCellPopup: окно рендерится вместе с окном кодов и
//       позиционируется СТРОГО НАД ним (eTop = top - eh - 8, сдвиг
//       окна кодов вниз при нехватке места, левые края выровнены);
//     — closeCellPopup: закрывает ОБА окна.
//   SW: kipia-test-v752.
//
// Запуск: через tests/run-all.js (require './test-task313.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Вырезка тела функции: от сигнатуры до следующего «имя: function»
// на том же уровне отступов (8 пробелов — методы WorkSchedule)
function fnBody(src, signature) {
    const i = src.indexOf(signature);
    if (i === -1) return '';
    const rest = src.slice(i + signature.length);
    const m = rest.match(/^[\s\S]*?\n        [a-zA-Z_]+: function/);
    return m ? m[0] : rest;
}

describe('Task 313 — подсветка сегодняшней даты в шахматке', () => {

    test('JS: _renderGrid кэширует todayIso в this._todayIso', () => {
        const rg = fnBody(INDEX_SRC, '_renderGrid: function');
        assertTrue(rg.indexOf('var todayIso = this._isoDate(new Date());') !== -1,
            'ISO сегодняшней даты вычисляется при отрисовке');
        assertTrue(rg.indexOf('this._todayIso = todayIso;') !== -1,
            'значение кэшируется на сетку (ячейки не зовут new Date)');
    });

    test('JS: шапка — колонка «сегодня» получает ws-today-col', () => {
        const rg = fnBody(INDEX_SRC, '_renderGrid: function');
        assertTrue(rg.indexOf("ws-today-col' : ''") !== -1,
            'класс ws-today-col добавляется в thCls');
        assertTrue(rg.indexOf('this._isoDate(dt) === todayIso') !== -1,
            'сравнение ISO колонки с сегодняшней датой');
    });

    test('JS: _renderCell — ячейка «сегодня» получает ws-today', () => {
        const rc = fnBody(INDEX_SRC, '_renderCell: function');
        assertTrue(rc.indexOf("isoDate === this._todayIso") !== -1 &&
                   rc.indexOf("classes.push('ws-today')") !== -1,
            'класс ws-today на ячейки столбца сегодняшней даты');
    });

    test('CSS: шапка — градиент поверх непрозрачного фона + акцент', () => {
        const m = /\.ws-grid thead th\.ws-day-col\.ws-today-col \{[^}]*linear-gradient\([^;]*\);[^}]*color:\s*var\(--accent-blue,\s*#4a8fc7\);/.test(INDEX_SRC);
        assertTrue(m,
            'ws-today-col: linear-gradient поверх фона th + акцентное число');
        // фон th не перекрыт полупрозрачным background (sticky-шапка
        // обязана оставаться непрозрачной — иначе сквозь неё видно тело);
        // Task 330: базовый фон шапки — сине-серый сланец #1e293b
        // (НЕпрозрачный, заявка: «темнее, ближе к сине-серому»)
        const thBg = /\.ws-grid thead th \{[^}]*background:\s*#1e293b;/.test(INDEX_SRC);
        assertTrue(thBg, 'базовый непрозрачный фон th жив (#1e293b, Task 330)');
    });

    test('CSS: ячейки — inset-«заливка» поверх inline-цветов статусов', () => {
        // Task 377: 0.16 → 0.30 — усиленная подсветка «сегодня»
        const m = /\.ws-grid tbody td\.ws-cell\.ws-today \{[^}]*box-shadow:\s*inset 0 0 0 999px rgba\(74,\s*143,\s*199,\s*0\.30\);/.test(INDEX_SRC);
        assertTrue(m, 'td.ws-today: inset 0 0 0 999px rgba(74,143,199,0.30)');
        // статусные ячейки красятся inline — только inset-тень видна
        // и на них; ::before/::after свободны (рамка д/н, точка)
        assertTrue(/ws-manual-dn::before/.test(INDEX_SRC) &&
                   /\.ws-overtime::after/.test(INDEX_SRC),
            'псевдоэлементы задач 309/250 не заняты подсветкой');
    });

    test('CSS: «сегодня + ручная запись» — составные тени', () => {
        const m = /\.ws-grid tbody td\.ws-cell\.ws-today\.ws-source-manual \{[^}]*inset 0 0 0 999px rgba\(74,\s*143,\s*199,\s*0\.30\),[^}]*inset 0 0 0 1\.5px rgba\(255,\s*255,\s*255,\s*0\.5\);/.test(INDEX_SRC);
        assertTrue(m,
            'заливка дня + рамка ручной записи в одном box-shadow');
    });

    test('CSS: светлая тема — подсветка «сегодня» мягче', () => {
        // Task 377: 0.13 → 0.26 (шапка), 0.10 → 0.22 (ячейки)
        assertTrue(/\[data-theme="light"\] \.ws-grid thead th\.ws-day-col\.ws-today-col \{[^}]*rgba\(42,\s*93,\s*143,\s*0\.26\)/.test(INDEX_SRC),
            'светлая шапка: rgba(42,93,143,0.26)');
        assertTrue(/\[data-theme="light"\] \.ws-grid tbody td\.ws-cell\.ws-today \{[^}]*inset 0 0 0 999px rgba\(42,\s*93,\s*143,\s*0\.22\);/.test(INDEX_SRC),
            'светлые ячейки: rgba(42,93,143,0.22)');
    });
});

describe('Task 313 — окно «Мероприятия в этот день» над окном кодов', () => {

    test('HTML: контейнер #wsEventsPopup рядом с окном кодов', () => {
        const iCloser = INDEX_SRC.indexOf('id="wsPopupCloser"');
        const iCodes = INDEX_SRC.indexOf('id="wsCellPopup"');
        const iEvents = INDEX_SRC.indexOf('id="wsEventsPopup"');
        assertTrue(iEvents !== -1,
            'окно мероприятий объявлено в HTML');
        assertTrue(iCloser !== -1 && iCodes !== -1 &&
                   iCloser < iCodes && iCodes < iEvents,
            'кловер → окно кодов → окно мероприятий (одна группа)');
        const m = /<div id="wsEventsPopup" class="ws-cell-popup ws-events-popup" role="dialog" aria-label="Мероприятия в этот день"><\/div>/.test(INDEX_SRC);
        assertTrue(m, 'классы и aria-label окна мероприятий');
    });

    test('JS: _renderCellPopup — секция мероприятий УДАЛЕНА', () => {
        const cp = fnBody(INDEX_SRC, '_renderCellPopup: function');
        // МАРКЕРЫ РЕНДЕРА (комментарии кода упоминают переезд —
        // подстроки «Мероприятия…» в комментариях не считаются)
        assertFalse(cp.indexOf('ws-popup-sec') !== -1,
            'заголовка секции в окне кодов нет');
        assertFalse(cp.indexOf('ws-popup-event') !== -1,
            'строк-событий в окне кодов нет');
        assertFalse(cp.indexOf('this._eventsAt(') !== -1,
            'окно кодов не собирает события');
        // строки действий окна кодов живы (Task 303/251)
        assertTrue(cp.indexOf('+ Мероприятие…') !== -1 &&
                   cp.indexOf('Дополнительно…') !== -1,
            '«+ Мероприятие…» и «Дополнительно…» живы');
    });

    test('JS: _renderEventsPopup — заголовок + подстрока «дата · ФИО»', () => {
        const ep = fnBody(INDEX_SRC, '_renderEventsPopup: function');
        assertTrue(ep.indexOf('<div class="ws-popup-title">Мероприятия в этот день</div>') !== -1,
            'заголовок окна — «Мероприятия в этот день»');
        // Task 434 (заявка: «в окнах мероприятий ячеек табеля, дату
        // указывать в формате дд.мм.гггг»): подстрока — дата
        // ПО-РУССКИ (_fmtDateRu: 2026-09-05 → 05.09.2026), не ISO
        assertTrue(ep.indexOf('ws-events-sub') !== -1 &&
                   ep.indexOf("this._esc(this._fmtDateRu(isoDate)) + ' · '") !== -1,
            'подстрока «дата · ФИО» (контекст ячейки, дата дд.мм.гггг)');
    });

    test('JS: _renderEventsPopup — строки: цвет, код, название', () => {
        const ep = fnBody(INDEX_SRC, '_renderEventsPopup: function');
        assertTrue(ep.indexOf('this._eventsAt(isoDate, tabNo)') !== -1,
            'слой событий прежний (_eventsAt, лист «Инструктажи»)');
        assertTrue(ep.indexOf('ws-popup-swatch') !== -1 &&
                   ep.indexOf('ws-popup-code') !== -1 &&
                   ep.indexOf('ws-popup-name') !== -1,
            'свотч ЦВЕТА + КОД + НАЗВАНИЕ в строках');
        assertTrue(ep.indexOf("this._instrShortOf(deT.тема) || deMeta.name || ''") !== -1,
            'название — тема мероприятия (иначе название кода)');
    });

    test('JS: _renderEventsPopup — окно справочное, БЕЗ кнопок (Task 487)', () => {
        const ep = fnBody(INDEX_SRC, '_renderEventsPopup: function');
        // Task 487 (заявка: «убери все три кнопки, только просмотр,
        // изменение — только из карт работников»): кнопок в окне нет
        // НИ У КОГО (было Task 309/313 — «только редакторам»)
        assertTrue(ep.indexOf('if (this._canEdit && deId)') === -1,
            'кнопок ✎/✕ в окне больше НЕТ (Task 487)');
        assertTrue(ep.indexOf('event.stopPropagation(); WorkSchedule.editTraining(') === -1,
            '✎ из окна удалён');
        assertTrue(ep.indexOf('event.stopPropagation(); WorkSchedule.deleteTraining(') === -1,
            '✕ из окна удалён');
        assertTrue(ep.indexOf('WorkSchedule.toggleTrainingDone(') === -1,
            'клик-галочки тоже нет (отметка — из карточки)');
        // Task 488 (заявка: «кнопка отметки осталась»): read-only
        // маркер-квадрат ws-done-chk удалён ВООБЩЕ — окно чисто
        // текстовая справка; состояние — рамка бейджа сетки
        assertTrue(ep.indexOf('ws-done-chk') === -1,
            'маркера-«кнопки» в окне нет (Task 488)');
    });

    test('JS: _renderEventsPopup — пустое состояние', () => {
        const ep = fnBody(INDEX_SRC, '_renderEventsPopup: function');
        assertTrue(ep.indexOf("if (!dayEvents.length)") !== -1 &&
                   ep.indexOf('ws-events-empty') !== -1 &&
                   ep.indexOf('нет мероприятий') !== -1,
            'пустой день — курсив «нет мероприятий»');
    });

    test('JS: _openCellPopup — окно мероприятий рендерится вместе с кодами', () => {
        const op = fnBody(INDEX_SRC, '_openCellPopup: function');
        assertTrue(op.indexOf("getElementById('wsEventsPopup')") !== -1,
            'окно мероприятий ищется в DOM');
        assertTrue(op.indexOf('this._renderEventsPopup(isoDate, tabNo)') !== -1,
            'содержимое — _renderEventsPopup');
        assertTrue(op.indexOf("evp.classList.add('active')") !== -1,
            'окно активируется вместе с окном кодов');
    });

    test('JS: _openCellPopup — окно мероприятий СТРОГО НАД окном кодов', () => {
        const op = fnBody(INDEX_SRC, '_openCellPopup: function');
        assertTrue(op.indexOf('var eTop = top - eh - 8;') !== -1,
            'верх окна мероприятий = верх окна кодов − высота − 8px');
        // не влезает сверху — окно кодов сдвигается ВНИЗ (порядок окон
        // не меняется: мероприятия всегда сверху)
        assertTrue(op.indexOf('top += (8 - eTop);') !== -1,
            'окно кодов сдвигается вниз при нехватке места сверху');
        assertTrue(op.indexOf('if (eTop < 8) eTop = 8;') !== -1,
            'тесный вьюпорт — окно мероприятий прижимается к верху');
        // левые края выровнены (своя ширина учитывается клампом)
        assertTrue(op.indexOf('var eLeft = left;') !== -1 &&
                   op.indexOf('if (eLeft + ew > vw - 8)') !== -1,
            'выравнивание по левому краю с клампом ширины');
        // окно кодов позиционируется ПОСЛЕ сдвига (учитывает окна)
        const iShift = op.indexOf('top += (8 - eTop);');
        const iPopupSet = op.indexOf("popup.style.left = Math.round(left) + 'px';");
        assertTrue(iShift !== -1 && iPopupSet !== -1 && iShift < iPopupSet,
            'позиция окна кодов выставляется после сдвига');
    });

    test('JS: closeCellPopup закрывает ОБА окна', () => {
        const cc = fnBody(INDEX_SRC, 'closeCellPopup: function');
        assertTrue(cc.indexOf("getElementById('wsEventsPopup')") !== -1 &&
                   cc.indexOf("evp.classList.remove('active')") !== -1,
            'окно мероприятий деактивируется и очищается');
        assertTrue(cc.indexOf("popup.classList.remove('active')") !== -1,
            'окно кодов закрывается как раньше');
    });

    test('CSS: окно мероприятий — компактное, ВЫШЕ окна кодов', () => {
        const m = /\.ws-cell-popup\.ws-events-popup \{[^}]*max-height:\s*300px;[^}]*z-index:\s*9402;/.test(INDEX_SRC);
        assertTrue(m, 'max-height 300 + z-index 9402 (окно кодов — 9401)');
        assertTrue(INDEX_SRC.indexOf('.ws-events-popup .ws-events-sub {') !== -1,
            'стиль подстроки «дата · ФИО»');
        assertTrue(INDEX_SRC.indexOf('.ws-events-popup .ws-events-empty {') !== -1,
            'стиль пустого состояния');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ws-events-popup .ws-events-sub {') !== -1,
            'светлая тема подстроки');
    });
});

describe('Task 313 — Service Worker', () => {

    test('SW: версия кэша kipia-test-v752', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v752'") !== -1,
            'CACHE_VERSION в sw.js = kipia-test-v752');
        assertFalse(SW_SRC.indexOf('kipia-test-v551') !== -1,
            'старой версии v551 нет');
    });
});
