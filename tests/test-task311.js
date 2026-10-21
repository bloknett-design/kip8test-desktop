// tests/test-task311.js
// Task 311 — зачистка карточки сотрудника, пояснительных окон
// при наведении и кнопки «+ Сотрудник». Заявка пользователя:
//   «В карточке сотрудника убери строки "Шаблон ротации",
//    "Сотрудник", "Итого в году". Убери пояснительные окна при
//    наведении на ячейки сотрудников и шахматки. Кнопку
//    "+ Сотрудник" убери, а её функцию должно выполнять заглавие
//    ячеек сотрудников "Сотрудник", расположенное в шапке над ними.»
//
// ЧТО ПРОВЕРЯЕТСЯ (статические инварианты клиента):
//   Карточка сотрудника (_renderEmpPopup):
//     — строка-заголовок «Сотрудник» (секция профиля) убрана —
//       поля идут сразу после шапки ФИО;
//     — поле «Шаблон ротации» не рендерится (данные живы в шторке
//       «+ Сотрудник» и на сервере);
//     — итог-строка года отпусков не рендерится (лимит 42 дн.
//       контролирует шторка «+ Отпуск» — Task 310);
//     — CSS ws-emp-total / ws-emp-overlimit удалены вместе со строкой.
//   Пояснительные окна при наведении:
//     — карточка сотрудника открывается ТОЛЬКО кликом: hover-делегат
//       (_attachEmpPopupHover, таймеры 350/400 мс, mouseenter/
//       mouseleave попапа, mouseover/mouseout контейнера) удалён;
//     — ячейки шахматки и шапка сетки не несут title-атрибутов:
//       titleParts/статус/праздник/мероприятия/план отпуска/смена
//       по циклу — всё убрано (информация в попапе клика и окошке
//       производственного календаря в тулбаре);
//     — title-подсказка на колонке ФИО убрана.
//   Кнопка «+ Сотрудник» → заголовок «Сотрудник»:
//     — кнопка #wsEmpBtn и класс .ws-addemp-btn удалены (HTML+CSS);
//     — заголовок thead th.ws-emp-col получает класс ws-emp-head-add,
//       onclick openEmployeeForm и плюсик-индикатор (только _canEdit);
//     — зрителям — обычный заголовок без клика (класса/onclick нет);
//     — двойная защита: openEmployeeForm сам проверяет право записи.
//   SW: kipia-test-v550 (один инкремент с v549 Task 310; Task 312
//   поднял до v551 — см. test-task312.js).
//
// Запуск: через tests/run-all.js (require './test-task311.js').

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

describe('Task 311 — карточка: строки «Шаблон ротации», «Сотрудник», «Итого в году» убраны', () => {

    test('JS: _renderEmpPopup — без поля «Шаблон ротации»', () => {
        const rp = fnBody(INDEX_SRC, '_renderEmpPopup: function');
        assertFalse(rp.indexOf("['Шаблон ротации',") !== -1,
            'поле «Шаблон ротации» не рендерится');
        assertFalse(rp.indexOf('_PATTERNS[pi]') !== -1,
            'поиск имени шаблона в _PATTERNS удалён из карточки');
        // поле живо в шторке добавления сотрудника (данные не потеряны)
        const sheet = INDEX_SRC.slice(
            INDEX_SRC.indexOf('id="wsEmpSheet"'),
            INDEX_SRC.indexOf('</div>', INDEX_SRC.indexOf('id="wsEmpSheet"')));
        assertTrue(INDEX_SRC.indexOf('for="wsEmpPattern"') !== -1,
            'шторка «+ Сотрудник»: поле шаблона живо (wsEmpPattern)');
    });

    test('JS: _renderEmpPopup — без строки-заголовка «Сотрудник»', () => {
        const rp = fnBody(INDEX_SRC, '_renderWorkerCard: function');
        assertFalse(rp.indexOf('<div class="ws-popup-sec">Сотрудник</div>') !== -1,
            'строка-заголовок «Сотрудник» не рендерится (профиль — сразу после шапки)');
        // секции отпусков и мероприятий остались (заголовками-строками)
        assertTrue(rp.indexOf('<div class="ws-popup-sec">Отпуска · ') !== -1,
            'секция отпусков жива');
        assertTrue(rp.indexOf('<div class="ws-popup-sec">Мероприятия · ') !== -1,
            'секция мероприятий жива');
    });

    test('JS: _renderEmpPopup — без итога года отпусков', () => {
        const rp = fnBody(INDEX_SRC, '_renderWorkerCard: function');
        assertFalse(rp.indexOf('Итого в году: ') !== -1,
            'итог-строка года не рендерится');
        assertFalse(rp.indexOf('ws-emp-total') !== -1,
            'класс итог-строки не рендерится');
        assertFalse(rp.indexOf('vacTotal') !== -1,
            'переменная итога удалена');
        // дни периодов — чистые (Task 310), с пометкой праздников
        // Task 440: дни — по году БЛОКА «Отпуска» (wYearVac)
        assertTrue(rp.indexOf('_vacNetDaysInYear(vv, wYearVac)') !== -1,
            'чистые дни периода на месте');
        // лимит 42 жив в шторке «+ Отпуск» (Task 310 — не задет)
        assertTrue(INDEX_SRC.indexOf('_VAC_YEAR_LIMIT: 42') !== -1,
            'константа лимита 42 жива для шторки «+ Отпуск»');
        const svf = fnBody(INDEX_SRC, 'submitVacationForm: function');
        assertTrue(svf.indexOf('usedNet + addNet > this._VAC_YEAR_LIMIT') !== -1,
            'блокировка превышения в шторке жива');
    });

    test('CSS: ws-emp-total / ws-emp-overlimit удалены (строки-итога нет)', () => {
        assertFalse(INDEX_SRC.indexOf('.ws-emp-total {') !== -1,
            'базовый стиль итог-строки удалён');
        assertFalse(INDEX_SRC.indexOf('.ws-emp-total.ws-emp-overlimit') !== -1,
            'красный стиль тёмной темы удалён');
        assertFalse(INDEX_SRC.indexOf('[data-theme="light"] .ws-emp-total') !== -1,
            'правила светлой темы удалены');
    });
});

describe('Task 311 — пояснительные окна при наведении убраны', () => {

    test('JS: карточка сотрудника — hover-режим удалён (только клик)', () => {
        assertFalse(INDEX_SRC.indexOf('_attachEmpPopupHover: function') !== -1,
            'метод hover-делегата удалён');
        assertFalse(INDEX_SRC.indexOf('_attachEmpPopupHover();') !== -1,
            'вызов из init удалён');
        assertFalse(INDEX_SRC.indexOf('_empHoverAttached') !== -1,
            'флаг навешивания удалён');
        assertFalse(/_empOpenTimer/.test(INDEX_SRC),
            'таймер открытия (350 мс) удалён');
        assertFalse(/_empCloseTimer/.test(INDEX_SRC),
            'таймер закрытия (400 мс) удалён');
        assertFalse(INDEX_SRC.indexOf('_scheduleEmpPopupClose') !== -1,
            'планировщик закрытия удалён');
        assertFalse(INDEX_SRC.indexOf("wrap.addEventListener('mouseover'") !== -1,
            'mouseover контейнера сетки не слушается');
        assertFalse(INDEX_SRC.indexOf("wrap.addEventListener('mouseout'") !== -1,
            'mouseout контейнера сетки не слушается');
        assertFalse(INDEX_SRC.indexOf("popup.addEventListener('mouseenter'") !== -1,
            'mouseenter попапа не слушается');
        assertFalse(INDEX_SRC.indexOf("popup.addEventListener('mouseleave'") !== -1,
            'mouseleave попапа не слушается');
        // Task 487 (заявка: «в десктопной версии сделай появление
        // попапа при наведении»): медиа-запрос (hover: hover) снова
        // есть в файле — НО только в блоке onCellHover (ховер ЯЧЕЕК
        // табеля, окно мероприятий); карточка сотрудника по-прежнему
        // БЕЗ ховера («клик один для всех»). Проверяем адресность:
        // вхождения — между onCellClick и onCellLeave (док-комментарий
        // Task 487 над onCellHover тоже входит в блок)
        // граница снизу — сам метод; сверху — ПРЕДЫДУЩИЙ метод
        // (onCellClick): док-комментарий Task 487 стоит НАД
        // onCellHover и тоже содержит (hover: hover)
        const iStart = INDEX_SRC.indexOf('onCellClick: function');
        const iEnd = INDEX_SRC.indexOf('onCellLeave: function');
        let hovPos = -1, hovCount = 0, hovInside = true;
        while ((hovPos = INDEX_SRC.indexOf('(hover: hover)', hovPos + 1)) !== -1) {
            hovCount++;
            if (hovPos < iStart || hovPos >= iEnd) hovInside = false;
        }
        assertTrue(iStart !== -1 && iEnd !== -1 && hovCount > 0 && hovInside,
            'все (hover: hover) — только в блоке onCellHover (Task 487: ячейки табеля)');
        // Task 417: попап карточки удалён — клика по ФИО больше нет
        assertFalse(INDEX_SRC.indexOf('onEmpCellClick: function') !== -1,
            'метод клика по ФИО удалён (Task 417)');
        assertFalse(INDEX_SRC.indexOf('_openEmpPopup: function') !== -1,
            'метод открытия попапа удалён (Task 417)');
    });

    test('JS: колонка ФИО — title-подсказка убрана', () => {
        const gridPart = INDEX_SRC.slice(
            INDEX_SRC.indexOf('_renderGrid: function'),
            INDEX_SRC.indexOf('_fitGrid: function'));
        assertFalse(gridPart.indexOf('Карточка сотрудника: профиль, отпуска, мероприятия') !== -1,
            'title «Карточка сотрудника…» с ячейки убран');
    });

    test('JS: ячейки шахматки — title-атрибуты убраны (_renderCell)', () => {
        const rc = INDEX_SRC.slice(
            INDEX_SRC.indexOf('_renderCell: function'),
            INDEX_SRC.indexOf('generateYear: function'));
        assertFalse(rc.indexOf('titleParts') !== -1,
            'сборка тултипа из частей удалена');
        // Task 408 (заявка: вид И/ПЗ у кодов в шахматке): title
        // остаётся ТОЛЬКО на бейдже мероприятия («код — тема
        // записи»); сама ячейка — по-прежнему без title
        const tCount = rc.split('title="').length - 1;
        const bCount = rc.split("' title=\"' +").length - 1;
        assertTrue(tCount === bCount && bCount === 1,
            'единственный title — тултип бейджа (не ячейка)');
        // при этом содержимое ячейки живо: код статуса, бейджи, маркеры
        assertTrue(rc.indexOf("classes.push('ws-pending')") !== -1,
            'маркер несохранённой правки жив');
        assertTrue(rc.indexOf("classes.push('ws-overtime')") !== -1,
            'маркер переработки жив');
        assertTrue(rc.indexOf('ws-ev-badge') !== -1,
            'бейдж мероприятия жив');
    });

    test('JS: шапка сетки — тултипы праздников/сокращённых убраны', () => {
        const gridPart = INDEX_SRC.slice(
            INDEX_SRC.indexOf('_renderGrid: function'),
            INDEX_SRC.indexOf('_fitGrid: function'));
        assertFalse(gridPart.indexOf('thTitle') !== -1,
            'сборка thTitle удалена');
        assertFalse(gridPart.indexOf('_escAttr(thTitle)') !== -1,
            'title в заголовках дней не пишется');
        // звёздочка сокращённого дня осталась в шапке
        assertTrue(gridPart.indexOf('ws-short-star') !== -1,
            'звёздочка сокращённого дня в шапке жива');
        // названия праздников — в окошке производственного календаря
        assertTrue(INDEX_SRC.indexOf('.ws-cal-panel {') !== -1,
            'окошко календаря в тулбаре жива');
    });
});

describe('Task 311 — кнопка «+ Сотрудник» → заголовок «Сотрудник»', () => {

    test('HTML: кнопка #wsEmpBtn удалена из тулбара', () => {
        assertFalse(INDEX_SRC.indexOf('id="wsEmpBtn"') !== -1,
            'кнопки #wsEmpBtn нет в разметке');
        assertFalse(INDEX_SRC.indexOf('ws-addemp-btn') !== -1,
            'класс .ws-addemp-btn удалён (HTML и CSS)');
        // Task 312: «+ Отпуск» из тулбара тоже удалена — функционал
        // переехал строкой «+ Отпуск…» в карточку сотрудника
        assertFalse(INDEX_SRC.indexOf('id="wsVacBtn"') !== -1,
            'Task 312: кнопка «+ Отпуск» из тулбара удалена');
    });

    test('JS: _renderGrid — заголовок «Работники» — ПРОСТО надпись (Task 386)', () => {
        const gridPart = INDEX_SRC.slice(
            INDEX_SRC.indexOf('_renderGrid: function'),
            INDEX_SRC.indexOf('_fitGrid: function'));
        assertTrue(gridPart.indexOf('data-full="Работники" data-s4="Рабо">Работники</span>') !== -1,
            'текст «Работники» (Task 386: «Работник +» → надпись)');
        assertTrue(gridPart.indexOf("this._canEdit ? ' ws-emp-head-add' : ''") === -1,
            'класс кнопки НЕ вешается (функция кнопки снята по заявке)');
        assertTrue(gridPart.indexOf('onclick="WorkSchedule.openWorkersPage()"') === -1,
            'клика у заголовка нет — переход только кнопкой «Работники» в баре');
        assertTrue(gridPart.indexOf('<i class="ws-emp-head-plus">+</i>') === -1,
            'плюсик-индикатор удалён');
        // двойная защита (Task 395): openWorkersPage пускает edit/view
        const owp = fnBody(INDEX_SRC, 'openWorkersPage: function');
        assertTrue(owp.indexOf("if (lvl !== 'edit' && lvl !== 'view') return;") !== -1,
            'openWorkersPage пускает edit/view (Task 395: null/min — мимо)');
    });

    test('CSS: ws-emp-head-add — правила УДАЛЕНЫ (Task 386: надпись)', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-grid thead th.ws-emp-col.ws-emp-head-add') === -1,
            'курсор/hover-правила кнопки заголовка удалены');
        assertTrue(INDEX_SRC.indexOf('.ws-grid thead th.ws-emp-col .ws-emp-head-plus {') === -1,
            'стиль плюсика-индикатора удалён');
    });

    test('JS: init() больше не управляет видимостью кнопки сотрудника', () => {
        const init = INDEX_SRC.slice(
            INDEX_SRC.indexOf('init: function'),
            INDEX_SRC.indexOf('_refreshFromUrlState: function'));
        assertFalse(init.indexOf("getElementById('wsEmpBtn')") !== -1,
            'init не ищет wsEmpBtn (кнопки нет)');
        // шапка перерисовывается при каждом рендере — видимость
        // решается в _renderGrid по _canEdit, отдельного флага не нужно.
        // Task 312: «+ Отпуск» из тулбара удалена — init её не ищет тоже
        // (видимость строки «+ Отпуск…» решает _renderEmpPopup)
        assertFalse(init.indexOf("getElementById('wsVacBtn')") !== -1,
            'Task 312: видимость «+ Отпуск» из init убрана');
    });
});

describe('Task 311 — Service Worker', () => {

    test('SW: версия кэша kipia-test-v753', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v753'") !== -1,
            'CACHE_VERSION в sw.js = kipia-test-v753');
        assertFalse(SW_SRC.indexOf('kipia-test-v549') !== -1,
            'старой версии v549 нет');
    });
});
