// tests/test-task487.js
// Task 487 — заявка пользователя (раздел «Табель учёта рабочего
// времени»), ДВЕ части:
//   1) «В разделе "Табель учёта рабочего времени", в ячейках табеля,
//      в попапе мероприятия "И" или "ПЗ" убери возможность
//      редактирования и внесения изменений (убери все три кнопки),
//      должен быть только просмотр, а изменение теперь должно быть
//      возможно только из карт работников» — окно «Мероприятия в
//      этот день» (#wsEventsPopup) стало СПРАВОЧНЫМ для ВСЕХ ролей:
//      удалены все ТРИ кнопки строки (✓-отметка выполнения Task 482,
//      ✎-правка Task 309, ✕-удаление Task 309); правка/удаление/
//      отметка — ТОЛЬКО из карточки работника (страница «Работники»,
//      Task 385/418/427 — кнопки там НЕ тронуты). Состояние
//      выполнения остаётся ИНФОРМАЦИЕЙ: некликабельный маркер
//      ws-done-chk ws-done-on ws-done-ro (тултип «Выполнено»),
//      как прежде было у зрителей; сетка дублирует состояние цветом
//      рамки бейджа (ws-ev-done/ws-ev-late, Task 482).
//   2) «И в десктопной версии сделай появление попапа, если есть
//      мероприятие, при наведении указателя мыши» — ДЕСКТОП-ХОВЕР:
//      onmouseenter/onmouseleave на КАЖДОЙ ячейке шахматки
//      (_renderCell), гейты в onCellHover (вьюпорт ≥1024px И media
//      (hover: hover)+(pointer: fine) — планшет/телефон ховера не
//      получают; _saving; открытый кликом попап _popupCell —
//      неприкосновенен; пустая ячейка — окно не открывается;
//      Task 522: «д»/«н» дневного персонала открывает окно и БЕЗ
//      мероприятий — секция «Статус дня» _renderDnDayInfo),
//      _openHoverPopup (тот же _renderEventsPopup + позиционирование
//      как у _openEventsOnlyPopup, БЕЗ кловера #wsPopupCloser и БЕЗ
//      записи _popupCell; mouseenter окна гасит grace-таймер,
//      mouseleave закрывает), onCellLeave (grace 350 мс — курсор
//      может идти НА окно), _closeHoverPopup (при живом _popupCell
//      окно клика НЕ трогает). Клик (редактор: окно кодов+мероприятия;
//      зритель: только мероприятия), Esc, кловер — работают как
//      прежде; _openCellPopup/_openEventsOnlyPopup/closeCellPopup
//      сбрасывают ховер-состояние (клик перехватывает окно).
//   Адаптации: test-task309.js (окно без ✎/✕ + регресс карточки),
//   test-task313.js (окно справочное), test-task482.js §3 (VM
//   редактора — read-only маркер вместо клик-галочки).
//   sw.js kipia-test-v710 → v711 + комментарий Task 487; логика SW
//   НЕ менялась; кэши не тронуты. Клиент-only.
//
// Запуск: через tests/run-all.js (require './test-task487.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Вырезка метода WorkSchedule: «имя: function» (отступ 8 пробелов)
// → следующий метод ТОГО ЖЕ уровня (паттерн test-task482).
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// ==========================================================================
// 1. SRC: окно «Мероприятия в этот день» — справочное (часть 1)
// ==========================================================================
describe('Task 487 — SRC: попап мероприятий без кнопок', () => {

    test('JS: _renderEventsPopup — все три кнопки удалены', () => {
        const ep = methodText(WS_SRC, '_renderEventsPopup');
        assertTrue(ep.length > 0, 'метод найден');
        assertTrue(ep.indexOf('WorkSchedule.toggleTrainingDone(') === -1,
            '✓ клик-отметки нет (Task 482 отменена в окне)');
        assertTrue(ep.indexOf('WorkSchedule.editTraining(') === -1,
            '✎ правки нет (Task 309 отменена в окне)');
        assertTrue(ep.indexOf('WorkSchedule.deleteTraining(') === -1,
            '✕ удаления нет (Task 309 отменена в окне)');
        assertTrue(ep.indexOf('ws-popup-act') === -1,
            'классов кнопок в окне нет вовсе');
        assertTrue(ep.indexOf('onclick=') === -1,
            'кликабельных элементов в строках окна нет');
    });

    test('JS: маркер-«кнопка» состояния убран вовсе (Task 488)', () => {
        const ep = methodText(WS_SRC, '_renderEventsPopup');
        // Task 488 (заявка: «кнопка отметки осталась»): read-only
        // квадрат ws-done-chk ВЫГЛЯДЕЛ кнопкой — удалён; состояние
        // выполнения несут: рамка бейджа ячейки сетки (ws-ev-done)
        // и галочка карточки работника
        assertTrue(ep.indexOf('ws-done-chk') === -1,
            'маркера-«кнопки» в окне больше НЕТ (Task 488)');
        assertTrue(ep.indexOf('title="Выполнено"') === -1,
            'тултипа состояния больше нет');
        assertFalse(ep.indexOf('if (this._canEdit)') !== -1,
            'ветки редактора в окне нет — вид един');
    });

    test('JS: правка/удаление/отметка — ТОЛЬКО из карточки работника', () => {
        // регресс: карточка (страница «Работники») кнопки сохранила
        const card = INDEX_SRC.slice(
            INDEX_SRC.indexOf('_renderWorkerCard: function'),
            INDEX_SRC.indexOf('_renderWorkerCardPanels: function'));
        assertTrue(card.indexOf('WorkSchedule.editTraining(') !== -1,
            '✎ в карточке жив (правка — только оттуда)');
        assertTrue(card.indexOf('WorkSchedule.deleteTraining(') !== -1,
            '✕ в карточке жив (удаление — только оттуда)');
        assertTrue(card.indexOf('WorkSchedule.toggleTrainingDone(') !== -1,
            '✓ отметки в карточке живы (Task 418)');
        // методы-экшены никуда не делись — их зовёт карточка
        assertTrue(methodText(WS_SRC, 'editTraining').length > 0, 'editTraining жив');
        assertTrue(methodText(WS_SRC, 'deleteTraining').length > 0, 'deleteTraining жив');
        assertTrue(methodText(WS_SRC, 'toggleTrainingDone').length > 0,
            'toggleTrainingDone жив (вызовы — из карточки)');
    });
});

// ==========================================================================
// 2. SRC: десктоп-ховер — проводка и гварды (часть 2)
// ==========================================================================
describe('Task 487 — SRC: ховер-хендлеры ячеек и методы', () => {

    test('JS: _renderCell вешает onmouseenter/onmouseleave на ячейку', () => {
        const rc = methodText(WS_SRC, '_renderCell');
        assertTrue(rc.length > 0, 'метод найден');
        // хендлер собирается в hoverHandler и вставляется атрибутом td
        assertTrue(rc.indexOf("var hoverHandler = 'WorkSchedule.onCellHover(event,") !== -1,
            'ховер-хендлер собирается (дата + таб. номер ячейки)');
        assertTrue(rc.indexOf("'onmouseenter=\"' + hoverHandler + '\" ' +") !== -1,
            'атрибут onmouseenter на каждой ячейке');
        assertTrue(rc.indexOf("'onmouseleave=\"WorkSchedule.onCellLeave()\"'") !== -1 ||
                   rc.indexOf('onmouseleave="WorkSchedule.onCellLeave()"') !== -1,
            'уход курсора — onCellLeave (mouseleave)');
        // клик прежний — оба хендлера на одном td
        assertTrue(rc.indexOf("var clickHandler = 'WorkSchedule.onCellClick(event,") !== -1,
            'клик по ячейке прежний (рядом с ховером)');
    });

    test('JS: onCellHover — гейты десктопа, мыши, сохранения и клика', () => {
        const h = methodText(WS_SRC, 'onCellHover');
        assertTrue(h.length > 0, 'метод найден');
        assertTrue(h.indexOf("'(min-width: 1024px)').matches") !== -1,
            'только десктоп-вьюпорт (≥1024px, признак isDesktop модуля)');
        assertTrue(h.indexOf("(hover: hover) and (pointer: fine)") !== -1,
            'только настоящий мышиный указатель (планшет — мимо)');
        assertTrue(h.indexOf('if (this._saving) return;') !== -1,
            'пакетное сохранение не беспокоим');
        assertTrue(h.indexOf('if (this._popupCell) return;') !== -1,
            'открытый кликом попап неприкосновенен');
        assertTrue(h.indexOf('this._eventsAt(isoDate, tabNo).length') !== -1,
            'гейт мероприятий жив (Task 522: ИЛИ д/н-справка дневного)');
        // Task 522 (заявка: ховер на «д» дневного — попап с информацией
        // по коду и временем работы): гейт расширен — окно открывается
        // и БЕЗ мероприятий, если есть д/н-справка (_dnDayInfoAt)
        assertTrue(h.indexOf('this._dnDayInfoAt(isoDate, tabNo)') !== -1,
            'Task 522: альтернативный гейт — д/н-справка дневного персонала');
        assertTrue(h.indexOf('this._openHoverPopup(td, isoDate, tabNo)') !== -1,
            'открытие — через _openHoverPopup');
    });

    test('JS: onCellLeave — grace-таймер, клик-режим не закрывает', () => {
        const l = methodText(WS_SRC, 'onCellLeave');
        assertTrue(l.length > 0, 'метод найден');
        assertTrue(l.indexOf('350') !== -1,
            'grace 350 мс (курсор может идти НА окно)');
        assertTrue(l.indexOf('if (this._popupCell)') !== -1,
            'живой клик-попап — только сброс ховер-флагов, НЕ закрытие');
        assertTrue(l.indexOf('_closeHoverPopup()') !== -1,
            'истёк таймер — окно закрывается');
    });

    test('JS: анти-дребезг — 400 мс после закрытия кликового попапа', () => {
        // браузер переотправляет mouseenter на ячейку под НЕПОДВИЖНЫМ
        // курсором, когда кловер скрывается (Esc/кловер/статус) —
        // окно не должно «возрождаться» сразу после закрытия
        const h = methodText(WS_SRC, 'onCellHover');
        assertTrue(h.indexOf('this._popupClosedAt') !== -1 &&
                   h.indexOf('< 400') !== -1,
            'onCellHover гейтится свежей меткой _popupClosedAt');
        const c = methodText(WS_SRC, 'closeCellPopup');
        assertTrue(c.indexOf('this._popupClosedAt = Date.now();') !== -1,
            'closeCellPopup ставит метку закрытия');
    });

    test('JS: _openHoverPopup — тот же рендер, без кловера и _popupCell', () => {
        const o = methodText(WS_SRC, '_openHoverPopup');
        assertTrue(o.length > 0, 'метод найден');
        assertTrue(o.indexOf('this._renderEventsPopup(isoDate, tabNo)') !== -1,
            'содержимое — тот же справочный _renderEventsPopup');
        assertTrue(o.indexOf('wsPopupCloser') === -1,
            'кловер НЕ активируется (закрытие — уход курсора, не клик)');
        assertFalse(o.indexOf('this._popupCell =') !== -1,
            '_popupCell НЕ пишется (кликовый режим не подменяется)');
        assertTrue(o.indexOf('evp.onmouseenter =') !== -1 &&
                   o.indexOf('evp.onmouseleave =') !== -1,
            'курсор на окне — держит его открытым');
    });

    test('JS: _closeHoverPopup — кликовое окно не трогает', () => {
        const c = methodText(WS_SRC, '_closeHoverPopup');
        assertTrue(c.length > 0, 'метод найден');
        assertTrue(c.indexOf('if (!this._popupCell)') !== -1,
            'гвард: живой клик-попап — окно НЕ прячется');
        assertTrue(c.indexOf('evp.onmouseenter = null') !== -1,
            'ховер-хендлеры окна снимаются');
    });

    test('JS: клик/Esc сбрасывают ховер-состояние (перехват окна)', () => {
        const oc = methodText(WS_SRC, '_openCellPopup');
        const oe = methodText(WS_SRC, '_openEventsOnlyPopup');
        const cc = methodText(WS_SRC, 'closeCellPopup');
        [oc, oe, cc].forEach(function(m, i) {
            const who = ['_openCellPopup', '_openEventsOnlyPopup',
                         'closeCellPopup'][i];
            assertTrue(m.indexOf('this._hoverOn = false') !== -1,
                who + ' сбрасывает ховер-флаг');
            assertTrue(m.indexOf('clearTimeout(this._hoverTimer)') !== -1,
                who + ' гасит grace-таймер');
        });
    });
});

// ==========================================================================
// 3. VM: окно справочное (часть 1 — рендер)
// ==========================================================================
describe('Task 487 — VM: _renderEventsPopup справочное', () => {

    const CODES = [
        { code: 'И', name: 'Инструктаж', color: '#B3E5FC' },
        { code: 'ПЗ', name: 'Проверка знаний', color: '#FFCDD2' },
        { code: 'ОБ', name: 'Обучение', color: '#D1C4E9' }
    ];
    const EMP = [{ 'таб_номер': 7, 'ФИО': 'Иванов И. И.' }];
    const TRAININGS = [
        { id: 201, 'таб_номер': 7, тип: 'инструктаж',
          дата_начала: '2026-10-05', дата_окончания: '2026-10-05',
          тема: 'Повторный инструктаж по охране труда', выполнение: 1 },
        { id: 202, 'таб_номер': 7, тип: 'проверка_знаний',
          дата_начала: '2026-10-12', дата_окончания: '2026-10-12',
          тема: 'Проверка знаний до 1000В', выполнение: 0 }
    ];

    function loadPopupHost(canEdit) {
        const names = ['_renderEventsPopup', '_eventsAt', '_trainingCodeOf',
                       '_statusMeta', '_isInstrType', '_instrShortOf',
                       '_normInstrKey', '_fmtDateRu', '_esc'];
        const texts = names.map(n => methodText(WS_SRC, n));
        assertTrue(texts.every(t => t.length > 0), 'методы извлекаются');
        const host = new Function('return ({' + texts.join('\n') + '\n});')();
        host._EMPLOYEES = EMP;
        host._TRAININGS = TRAININGS;
        host._STATUS_CODES = CODES;
        host._INSTR_LIST = [];
        host._canEdit = canEdit;
        return host;
    }

    test('редактор: выполнено — маркера нет, только текст (Task 488)', () => {
        const host = loadPopupHost(true);
        const html = host._renderEventsPopup('2026-10-05', 7);
        assertTrue(html.indexOf('ws-done-chk') === -1,
            'маркера «выполнено» НЕТ (Task 488 — чисто текстовое окно)');
        assertTrue(html.indexOf('onclick') === -1,
            'в окне НЕТ ни одного кликабельного элемента');
        assertTrue(html.indexOf('Редактировать') === -1 &&
                   html.indexOf('Удалить') === -1,
            '✎/✕ отсутствуют');
    });

    test('редактор == зритель: идентичный HTML окна', () => {
        const ed = loadPopupHost(true);
        const vi = loadPopupHost(false);
        assertEqual(ed._renderEventsPopup('2026-10-05', 7),
            vi._renderEventsPopup('2026-10-05', 7),
            'роль больше НЕ влияет на окно (справочное)');
    });

    test('не выполнено — маркера нет, строка только текстовая', () => {
        const host = loadPopupHost(true);
        const html = host._renderEventsPopup('2026-10-12', 7);
        assertTrue(html.indexOf('ws-done-chk') === -1,
            'невыполненная запись — без маркера (состояние — рамка бейджа сетки)');
    });
});

// ==========================================================================
// 4. VM: ховер-жизненный цикл (часть 2)
// ==========================================================================
describe('Task 487 — VM: onCellHover/onCellLeave/ховер-окно', () => {

    // мок window.matchMedia: два запроса метода — десктоп и ховер
    function mockWindow(desktop, hover) {
        return {
            innerWidth: 1280,
            innerHeight: 720,
            matchMedia: function(q) {
                if (q.indexOf('min-width: 1024px') !== -1)
                    return { matches: !!desktop };
                if (q.indexOf('hover: hover') !== -1)
                    return { matches: !!hover };
                return { matches: false };
            }
        };
    }

    // мок #wsEventsPopup (+ classList-протокол)
    function mockEvp() {
        return {
            innerHTML: '',
            active: false,
            style: {},
            offsetWidth: 240,
            offsetHeight: 90,
            onmouseenter: null,
            onmouseleave: null,
            classList: {
                add: function() { evpRef.active = true; },
                remove: function() { evpRef.active = false; },
                contains: function() { return evpRef.active; }
            }
        };
    }
    let evpRef = null;

    function loadHoverHost(win, evp, trainings) {
        evpRef = evp;
        const names = ['onCellHover', 'onCellLeave', '_openHoverPopup',
                       '_closeHoverPopup', 'closeCellPopup',
                       '_renderEventsPopup', '_eventsAt', '_trainingCodeOf',
                       '_statusMeta', '_isInstrType', '_instrShortOf',
                       '_normInstrKey', '_fmtDateRu', '_esc'];
        const texts = names.map(n => methodText(WS_SRC, n));
        assertTrue(texts.every(t => t.length > 0), 'ховер-методы извлекаются');
        const host = new Function('window', 'document',
            'return ({' + texts.join('\n') + '\n});')(win, {
                getElementById: function(id) {
                    return id === 'wsEventsPopup' ? evp : null;
                }
            });
        host._EMPLOYEES = [{ 'таб_номер': 7, 'ФИО': 'Иванов И. И.' }];
        host._TRAININGS = trainings || [{
            id: 301, 'таб_номер': 7, тип: 'инструктаж',
            дата_начала: '2026-10-05', дата_окончания: '2026-10-05',
            тема: 'Инструктаж по охране труда', выполнение: 1
        }];
        host._STATUS_CODES = [
            { code: 'И', name: 'Инструктаж', color: '#B3E5FC' },
            { code: 'ПЗ', name: 'Проверка знаний', color: '#FFCDD2' }
        ];
        host._INSTR_LIST = [];
        host._saving = false;
        host._popupCell = null;
        host._hoverOn = false;
        host._hoverCell = null;
        host._hoverTimer = null;
        host._popupClosedAt = 0;
        return host;
    }

    const DESKTOP = { target: { closest: function() { return null; } } };

    test('десктоп+мышь+мероприятие — окно открывается', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, true), evp);
        host.onCellHover(DESKTOP, '2026-10-05', 7);
        assertEqual(evp.active, true, 'окно активно');
        assertTrue(evp.innerHTML.indexOf('Инструктаж') !== -1,
            'содержимое — мероприятия дня');
        assertEqual(host._hoverOn, true, 'ховер-флаг поднят');
        // хендлеры держания окна навешаны
        assertTrue(typeof evp.onmouseenter === 'function' &&
                   typeof evp.onmouseleave === 'function',
            'mouseenter/mouseleave окна назначены');
    });

    test('мобильный/узкий вьюпорт — окно НЕ открывается', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(false, true), evp);
        host.onCellHover(DESKTOP, '2026-10-05', 7);
        assertEqual(evp.active, false, 'вьюпорт <1024 — тишина');
        assertEqual(host._hoverOn, false, 'флаг не поднимался');
    });

    test('тач-устройство (нет hover) — окно НЕ открывается', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, false), evp);
        host.onCellHover(DESKTOP, '2026-10-05', 7);
        assertEqual(evp.active, false, 'планшет/телефон — тишина');
    });

    test('идёт сохранение — ховер молчит', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, true), evp);
        host._saving = true;
        host.onCellHover(DESKTOP, '2026-10-05', 7);
        assertEqual(evp.active, false, 'во время _saving окно не открывается');
    });

    test('открыт кликом — ховер НЕ вмешивается', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, true), evp);
        host._popupCell = { date: '2026-10-01', 'таб_номер': 7 };
        host.onCellHover(DESKTOP, '2026-10-05', 7);
        assertEqual(host._hoverOn, false, 'кликовый режим заблокировал ховер');
    });

    test('ячейка БЕЗ мероприятий — окно не открывается', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, true), evp);
        host.onCellHover(DESKTOP, '2026-12-01', 7);
        assertEqual(evp.active, false, 'пустая ячейка — тишина');
        assertEqual(host._hoverOn, false, 'флаг не поднимался');
    });

    test('onCellLeave — grace-таймер 350 мс отложенного закрытия', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, true), evp);
        host.onCellHover(DESKTOP, '2026-10-05', 7);
        host.onCellLeave();
        assertTrue(host._hoverTimer !== null && host._hoverTimer !== undefined,
            'таймер отложенного закрытия назначен');
        // mouseenter окна гасит таймер (курсор пошёл на окно читать)
        evp.onmouseenter();
        assertEqual(host._hoverTimer, null, 'вход на окно отменил закрытие');
        assertEqual(evp.active, true, 'окно ещё открыто');
        clearTimeout(host._hoverTimer);
        host._closeHoverPopup();
    });

    test('onCellLeave при живом клике — окно клика НЕ закрывается', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, true), evp);
        host.onCellHover(DESKTOP, '2026-10-05', 7);
        host._popupCell = { date: '2026-10-01', 'таб_номер': 7 };
        host.onCellLeave();
        assertEqual(host._hoverTimer, null, 'таймера нет — сразу сброс');
        assertEqual(evp.active, true, 'окно (уже кликовое) открыто');
        assertEqual(host._hoverOn, false, 'ховер-флаг сброшен');
    });

    test('_closeHoverPopup — прячет окно и снимает хендлеры', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, true), evp);
        host.onCellHover(DESKTOP, '2026-10-05', 7);
        host._closeHoverPopup();
        assertEqual(evp.active, false, 'окно спрятано');
        assertEqual(evp.innerHTML, '', 'содержимое вычищено');
        assertEqual(evp.onmouseenter, null, 'хендлер входа снят');
        assertEqual(evp.onmouseleave, null, 'хендлер ухода снят');
        assertEqual(host._hoverOn, false, 'флаг опущен');
    });

    test('анти-дребезг: свежая метка закрытия гейтит ховер 400 мс', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, true), evp);
        // закрыли кликовый попап «только что» — ховер молчит
        host._popupClosedAt = Date.now();
        host.onCellHover(DESKTOP, '2026-10-05', 7);
        assertEqual(evp.active, false, 'сразу после закрытия — тишина');
        // метка старая — ховер работает
        host._popupClosedAt = Date.now() - 500;
        host.onCellHover(DESKTOP, '2026-10-05', 7);
        assertEqual(evp.active, true, 'после 400 мс — окно открывается');
        host._closeHoverPopup();
    });

    test('позиционирование — правее «ячейки» (паттерн _openEventsOnlyPopup)', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, true), evp);
        const cell = { getBoundingClientRect: function() {
            return { left: 100, right: 130, top: 200, bottom: 220 };
        } };
        host._openHoverPopup(cell, '2026-10-05', 7);
        assertEqual(evp.style.left, '136px',
            'правее ячейки (+6px; габарит мока 240×90)');
        assertEqual(evp.style.top, '200px', 'от верха ячейки');
    });

    test('повторный ховер в ту же ячейку — рендера нет, таймер гасится', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, true), evp);
        host.onCellHover(DESKTOP, '2026-10-05', 7);
        evp.innerHTML = 'KEEP';
        host.onCellLeave();               // назначит grace-таймер
        host.onCellHover(DESKTOP, '2026-10-05', 7);   // та же ячейка
        assertEqual(evp.innerHTML, 'KEEP',
            'тот же день — содержимое НЕ перерендерено');
        assertEqual(host._hoverTimer, null, 'таймер закрытия погашен');
        clearTimeout(host._hoverTimer);
        host._closeHoverPopup();
    });
});

// ==========================================================================
// 5. sw.js — инкремент кэша + комментарий
// ==========================================================================
describe('Task 487 — SW: инкремент версии', () => {

    test("sw.js: CACHE_VERSION = 'kipia-test-v743'", () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v743'") !== -1,
            'версия кэша инкрементирована v710 → v711');
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v710'") === -1,
            'старой версии нет');
    });

    test('sw.js: комментарий Task 487 описывает обе части заявки', () => {
        const i = SW_SRC.indexOf('// Task 487:');
        assertTrue(i !== -1, 'строка комментария есть');
        const cmt = SW_SRC.slice(i, i + 700);
        assertTrue(cmt.indexOf('СПРАВОЧНОЕ') !== -1,
            'часть 1 — окно справочное, кнопки убраны');
        assertTrue(cmt.indexOf('ховер') !== -1,
            'часть 2 — десктоп-ховер по ячейке');
        assertTrue(cmt.indexOf('карточк') !== -1,
            'правка — из карточки работника');
    });
});
