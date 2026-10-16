// tests/test-task309.js
// Task 309 — карточка сотрудника у колонки ФИО + правка/удаление
// мероприятий + рамка ручных д/н. Заявка пользователя:
//   «при наведении указателя мыши или при нажатии на поле с
//    сотрудником (слева от шахматки), должно появляться окно с
//    данными сотрудника, которые раньше были в убранных вкладках
//    (сотрудники, отпуска, инструктажи). Так же сделай возможность
//    редактирования и удаления добавляемых мероприятий в ячейки.
//    Коды "д" и "н", добавляемые в шахматку пользователем вручную,
//    должны отображаться с обрамлением по краям, по примеру как
//    в их миниатюрах.»
//
// ЧТО ПРОВЕРЯЕТСЯ (статические инварианты клиента):
//   Карточка сотрудника:
//     — элементы #wsEmpPopup/#wsEmpPopupCloser в HTML;
//     — td.ws-emp-col получает data-tab + onclick onEmpCellClick;
//     — (Task 311: hover-режим УДАЛЁН — единственный триггер КЛИК;
//       _attachEmpPopupHover и таймеры 350/400 мс исчезли);
//     — клик — карточка всегда прикреплена (кловер active);
//     — _renderEmpPopup: профиль (Task 311: без строки-заголовка
//       «Сотрудник» и без «Шаблон ротации»), отпуска года с фильтром
//       _vacDaysInYear (Task 311: итог-строка года убрана),
//       мероприятия месяца с кнопками ✎/✕ только редакторам;
//     — Esc и взаимная блокировка с попапом ячейки.
//   Правка/удаление мероприятий:
//     — кнопки ✎/✕ в КАРТОЧКЕ (Task 385: страница «Работники»);
//       в попапе ячейки («Мероприятия в этот день») кнопок НЕТ —
//       Task 487 убрал их (окно справочное для всех ролей);
//     — editTraining: поиск записи по id в _TRAININGS, закрытие
//       попапов, openTrainingForm в режиме правки (заголовок
//       «Правка мероприятия», кнопка «Сохранить»);
//     — submitTrainingForm в правке: addTraining(новые значения)
//       → deleteTraining(старый id) (серверного updateTraining нет,
//       Apps Script не трогаем), тост «Мероприятие обновлено»;
//     — deleteTraining закрывает оба попапа до подтверждения.
//   Рамка ручных д/н:
//     — _renderCell: класс ws-manual-dn при источник «руч» и статусе
//       д/н (виден и до сохранения — pending даёт «руч»);
//     — CSS: ::before рамка 1px с закруглёнными углами (Task 310
//       переработала box-shadow 2px → border 1px + radius 3px),
//       тёмная и светлая темы.
//   Регресс-фиксы Task 308 (заявка «добавляю мероприятие — тост
//   "Ошибка: self.loadTrainings is not a function"»):
//     — вызовы удалённых страниц loadTrainings()/loadVacations()
//       больше не встречаются; вместо них loadGrid().
//   SW: kipia-test-v745.
//
// Запуск: через tests/run-all.js (require './test-task309.js').

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

describe('Task 309 — карточка сотрудника у колонки ФИО', () => {

    test('HTML: Task 417 — попап #wsEmpPopup и кловер УДАЛЕНЫ', () => {
        // Task 417 (заявка): окно карточки по фамилии удалено полностью
        assertFalse(INDEX_SRC.indexOf('id="wsEmpPopupCloser"') !== -1,
            'кловер удалён вместе с попапом');
        assertFalse(INDEX_SRC.indexOf('id="wsEmpPopup"') !== -1,
            'контейнер карточки удалён');
        assertFalse(INDEX_SRC.indexOf('onclick="WorkSchedule.closeEmpPopup()"') !== -1,
            'клик по кловеру удалён вместе с окном');
        assertFalse(INDEX_SRC.indexOf('class="ws-cell-popup ws-emp-popup"') !== -1,
            'модификатор ws-emp-popup больше не рендерится');
        assertTrue(INDEX_SRC.indexOf('ПОПАП КАРТОЧКИ ПО ФАМИЛИИ УДАЛЁН ПОЛНОСТЬЮ') !== -1,
            'HTML-маркер удаления Task 417');
    });

    test('Рендер: td.ws-emp-col — data-tab жив, onclick УДАЛЁН (Task 417)', () => {
        const gridPart = INDEX_SRC.slice(
            INDEX_SRC.indexOf('_renderGrid: function'),
            INDEX_SRC.indexOf('_fitGrid: function'));
        assertTrue(gridPart.indexOf('data-tab=') !== -1,
            'колонка ФИО несёт data-tab (идентификация строки)');
        assertFalse(gridPart.indexOf('WorkSchedule.onEmpCellClick(event,') !== -1,
            'Task 417: клика по колонке ФИО больше нет');
        assertFalse(gridPart.indexOf('_empCardAllowed') !== -1,
            'Task 417: гейт карточки удалён из рендера');
        // Task 311: пояснительный тултип с ячейки убран
        assertFalse(gridPart.indexOf('Карточка сотрудника: профиль, отпуска, мероприятия') !== -1,
            'title-подсказка на колонке убрана (Task 311)');
    });

    test('JS: Task 311 — hover-режим карточки УДАЛЁН (только клик)', () => {
        // Пояснительные окна при наведении убраны по заявке: единственный
        // триггер карточки — клик по колонке ФИО (в т.ч. на таче).
        assertFalse(INDEX_SRC.indexOf('_attachEmpPopupHover') !== -1,
            'метод _attachEmpPopupHover удалён (и вызов из init)');
        assertFalse(INDEX_SRC.indexOf('_empHoverAttached') !== -1,
            'флаг повторного навешивания удалён');
        assertFalse(/_empOpenTimer/.test(INDEX_SRC),
            'таймер открытия 350 мс удалён');
        assertFalse(/_empCloseTimer/.test(INDEX_SRC),
            'таймер закрытия 400 мс удалён');
        assertFalse(INDEX_SRC.indexOf("_scheduleEmpPopupClose") !== -1,
            'планировщик закрытия по mouseleave удалён');
        // у попапа не осталось mouseenter/mouseleave-слушателей
        assertFalse(INDEX_SRC.indexOf("popup.addEventListener('mouseenter'") !== -1,
            'mouseenter попапа не слушается');
        assertFalse(INDEX_SRC.indexOf("popup.addEventListener('mouseleave'") !== -1,
            'mouseleave попапа не слушается');
        // сетка не слушает mouseover/mouseout для карточки
        assertFalse(INDEX_SRC.indexOf("wrap.addEventListener('mouseover'") !== -1,
            'mouseover на контейнере сетки удалён');
        assertFalse(INDEX_SRC.indexOf("wrap.addEventListener('mouseout'") !== -1,
            'mouseout на контейнере сетки удалён');
    });

    test('JS: Task 417 — методы открытия удалены, closeEmpPopup — no-op', () => {
        assertFalse(INDEX_SRC.indexOf('onEmpCellClick: function') !== -1,
            'onEmpCellClick удалён (клика по ФИО нет)');
        assertFalse(INDEX_SRC.indexOf('_openEmpPopup: function') !== -1,
            '_openEmpPopup удалён');
        // closeEmpPopup остаётся защитным no-op (окна нет — только флаги)
        const cpBody = fnBody(INDEX_SRC, 'closeEmpPopup: function');
        assertTrue(cpBody.indexOf("var popup = document.getElementById('wsEmpPopup');") !== -1,
            'closeEmpPopup ищет окно (null после удаления)');
        assertTrue(cpBody.indexOf('this._empPinned = false;') !== -1,
            'флаги сбрасываются');
        // Esc: обработчик init закрывает ОБА попапа
        const escIdx = INDEX_SRC.indexOf("if (ev.key === 'Escape')");
        assertTrue(escIdx !== -1 &&
            INDEX_SRC.indexOf('selfOnce.closeEmpPopup();', escIdx) !== -1,
            'Esc закрывает и карточку сотрудника');
        // обратная блокировка: открытие статусного попапа закрывает карточку
        const cellClickPart = fnBody(INDEX_SRC, 'onCellClick: function');
        assertTrue(cellClickPart.indexOf('this.closeEmpPopup();') !== -1,
            'onCellClick закрывает карточку сотрудника');
    });

    test('JS: _renderEmpPopup — блоки данных из убранных вкладок', () => {
        // Task 385: тело карточки — в _renderWorkerCard (обёртка
        // _renderEmpPopup = чтение; withEdit=false/true)
        const rp = fnBody(INDEX_SRC, '_renderWorkerCard: function');
        // Task 311: строка-заголовок «Сотрудник» убрана — профиль
        // идёт сразу после шапки ФИО (без секции «Сотрудник»)
        assertFalse(rp.indexOf('<div class="ws-popup-sec">Сотрудник</div>') !== -1,
            'строка-заголовок «Сотрудник» убрана (Task 311)');
        assertTrue(rp.indexOf('<div class="ws-popup-sec">Отпуска · ') !== -1,
            'секция отпусков (бывшая вкладка «Отпуска»)');
        assertTrue(rp.indexOf('<div class="ws-popup-sec">Мероприятия · ') !== -1,
            'секция мероприятий (бывшая вкладка «Инструктажи»)');
        // профиль: поля карточки (Task 310: «Старт цикла» убрана;
        // Task 311: «Шаблон ротации» убрана по заявке; Task 318:
        // «Тип» переименована в «Режим работы» — заявка)
        ['Режим работы', 'Должность', 'Дата приёма', 'Комментарий']
            .forEach(f => assertTrue(rp.indexOf("['" + f + "',") !== -1,
                'поле профиля «' + f + '»'));
        assertFalse(rp.indexOf("['Тип',") !== -1,
            'Task 318: прежняя подпись «Тип» убрана');
        assertFalse(rp.indexOf("['Шаблон ротации',") !== -1,
            'поле «Шаблон ротации» убрано (Task 311)');
        // шаблон больше не ищется в _PATTERNS для карточки
        assertFalse(rp.indexOf('this._PATTERNS[pi].name') !== -1,
            'поиск имени шаблона в _PATTERNS удалён из карточки');
    });

    test('JS: отпуска в карточке — фильтр по году, чистые дни, БЕЗ итога года', () => {
        const rp = fnBody(INDEX_SRC, '_renderWorkerCard: function');
        // Task 440: навигация ‹год› блока «Отпуска» — фильтр и дни
        // по году БЛОКА wYearVac (попап — год шахматки)
        assertTrue(rp.indexOf('this._vacDaysInYear(v, wYearVac)') !== -1,
            'периоды фильтруются по году блока (Task 440)');
        assertTrue(rp.indexOf('this._vacNetDaysInYear(vv, wYearVac)') !== -1,
            'дни периода — чистые (за вычетом праздников, Task 310), по году блока');
        // Task 311: строка-итог «Итого в году» убрана из карточки
        assertFalse(rp.indexOf('Итого в году: ') !== -1,
            'итог-строка года убрана (Task 311)');
        assertFalse(rp.indexOf('ws-emp-total') !== -1,
            'класс ws-emp-total больше не рендерится');
        assertFalse(rp.indexOf('ws-emp-overlimit') !== -1,
            'красная строка превышения из карточки ушла');
        assertFalse(rp.indexOf('this._plural(vacTotal,') !== -1,
            'итог больше не склоняется (строки нет)');
        assertTrue(rp.indexOf('нет запланированных периодов') !== -1,
            'пустое состояние секции отпусков');
    });

    test('JS: мероприятия в карточке — сортировка по дате, кнопки только редакторам', () => {
        const rp = fnBody(INDEX_SRC, '_renderWorkerCard: function');
        assertTrue(rp.indexOf('WorkSchedule.editTraining(') !== -1,
            'кнопка правки ✎ в карточке (Task 385: страница «Работники»)');
        assertTrue(rp.indexOf('WorkSchedule.deleteTraining(') !== -1,
            'кнопка удаления ✕ в карточке (Task 385: страница «Работники»)');
        assertTrue(rp.indexOf('if (withEdit && trId)') !== -1,
            'кнопки — только с withEdit (Task 385: страница «Работники», редакторам)');
        assertTrue(rp.indexOf('нет мероприятий за год') !== -1,
            'пустое состояние секции мероприятий (Task 394: год)');
        assertTrue(rp.indexOf('a.дата_начала).localeCompare') !== -1,
            'мероприятия отсортированы по дате начала');
    });

    test('JS: closeEmpPopup сбрасывает состояние и очищает DOM', () => {
        const cp = fnBody(INDEX_SRC, 'closeEmpPopup: function');
        assertTrue(cp.indexOf("popup.classList.remove('active')") !== -1,
            'попап деактивируется');
        assertTrue(cp.indexOf("closer.classList.remove('active')") !== -1,
            'кловер деактивируется');
        assertTrue(cp.indexOf('this._empPinned = false;') !== -1,
            'флаг прикрепления сброшен');
    });
});

describe('Task 309 — правка и удаление мероприятий', () => {

    test('JS: окно «Мероприятия в этот день» — БЕЗ кнопок (Task 487)', () => {
        // Task 313: секция переехала из попапа кодов в отдельное окно
        // #wsEventsPopup (рендер — _renderEventsPopup между
        // _renderCellPopup и _openCellPopup — срез ниже покрывает его)
        // Task 487 (заявка: «убери все три кнопки, только просмотр,
        // изменение — только из карт работников»): окно стало
        // справочным для ВСЕХ ролей — ✎/✕ из него УДАЛЕНЫ (было:
        // «кнопки — только редакторам», Task 309/313)
        const popupPart = INDEX_SRC.slice(
            INDEX_SRC.indexOf('_renderCellPopup: function'),
            INDEX_SRC.indexOf('_openCellPopup: function'));
        assertTrue(popupPart.indexOf('if (this._canEdit && deId)') === -1,
            'кнопок правки/удаления в окне больше НЕТ (Task 487)');
        assertTrue(popupPart.indexOf('event.stopPropagation(); WorkSchedule.editTraining(') === -1,
            '✎ из окна удалён');
        assertTrue(popupPart.indexOf('event.stopPropagation(); WorkSchedule.deleteTraining(') === -1,
            '✕ из окна удалён');
        // правка/удаление остались в КАРТОЧКЕ (страница «Работники»)
        const cardPart = INDEX_SRC.slice(
            INDEX_SRC.indexOf('_renderWorkerCard: function'),
            INDEX_SRC.indexOf('_renderWorkerCardPanels: function'));
        assertTrue(cardPart.indexOf('WorkSchedule.editTraining(') !== -1,
            '✎ в карточке работника — на месте (правка только оттуда)');
        assertTrue(cardPart.indexOf('WorkSchedule.deleteTraining(') !== -1,
            '✕ в карточке работника — на месте (удаление только оттуда)');
    });

    test('JS: editTraining находит запись по id и открывает форму в режиме правки', () => {
        const et = fnBody(INDEX_SRC, 'editTraining: function');
        // Task 417: поиск по ЕДИНОМУ пулу — _TRAININGS → _INSTR_ALL →
        // _EVENTS_ALL (правка архивных записей прошлых лет из карточки)
        assertTrue(et.indexOf('var pools = [this._TRAININGS, this._INSTR_ALL,') !== -1,
            'единый пул поиска: срез года + архивы обоих листов');
        assertTrue(et.indexOf('parseInt(arr[i].id, 10) !== tid') !== -1,
            'поиск записи по id в пуле (Task 427: id + семейство типа)');
        assertTrue(et.indexOf('this.closeCellPopup();') !== -1 &&
            et.indexOf('this.closeEmpPopup();') !== -1,
            'попапы закрываются до открытия формы');
        assertTrue(et.indexOf('this.openTrainingForm(null, null, rec);') !== -1,
            'форма открывается с записью для правки');
        assertTrue(et.indexOf('Мероприятие не найдено — обновите график') !== -1,
            'тост при ненайденной записи');
    });

    test('JS: форма мероприятия — режимы «Новое мероприятие»/«Правка мероприятия»', () => {
        // ids для переключения заголовка/кнопки
        assertTrue(INDEX_SRC.indexOf('id="wsTrSheetTitle"') !== -1,
            'заголовок шторки имеет id');
        assertTrue(INDEX_SRC.indexOf('id="wsTrSubmitBtn"') !== -1,
            'кнопка отправки имеет id');
        const otf = fnBody(INDEX_SRC, 'openTrainingForm: function');
        assertTrue(otf.indexOf(": 'Правка мероприятия'") !== -1,
            'заголовок в режиме правки (мероприятие; Task 410 — тернарник)');
        assertTrue(otf.indexOf("submitBtn.textContent = 'Сохранить'") !== -1,
            'кнопка в режиме правки');
        assertTrue(otf.indexOf("sheetTitle.textContent = this._trInstrMode") !== -1 &&
                   otf.indexOf("'Новое мероприятие'") !== -1,
            'заголовок в режиме создания (Task 410 — режимы шторки)');
        assertTrue(otf.indexOf('this._editTrainingId = parseInt(editTraining.id, 10);') !== -1,
            'id правимой записи сохраняется в _editTrainingId');
        // префилл значений записи
        assertTrue(otf.indexOf("String(editTraining.дата_начала || '')") !== -1,
            'даты записи вписываются в форму');
    });

    test('JS: submitTrainingForm в правке — add новых значений, затем delete старой записи', () => {
        const stf = fnBody(INDEX_SRC, 'submitTrainingForm: function');
        const editIdx = stf.indexOf('if (this._editTrainingId)');
        assertTrue(editIdx !== -1, 'ветка режима правки есть');
        const editBranch = stf.slice(editIdx);
        // порядок: add → delete (сбой add не трогает старую запись)
        const addIdx = editBranch.indexOf("this._api('workSchedule.addTraining', payload)");
        const delIdx = editBranch.indexOf("инстр: oldFam })");
        assertTrue(addIdx !== -1 && delIdx !== -1 && addIdx < delIdx,
            'addTraining выполняется ДО deleteTraining старой записи (Task 427: delete адресует семейство типа)');
        assertTrue(editBranch.indexOf("'Мероприятие обновлено'") !== -1,
            'тост об обновлении');
        // сбой частичного шага — сетка перезагружается и ошибка видна
        // Task 314: loadGrid(true) — только сеть после правок
        assertTrue(editBranch.indexOf('self.loadGrid(true);') !== -1,
            'сетка перезагружается после правки (и при сбое)');
        // сервер не менялся: updateTraining НЕ добавлялся
        assertFalse(INDEX_SRC.indexOf('workSchedule.updateTraining') !== -1,
            'клиент не зовёт несуществующий updateTraining (Apps Script не трогаем)');
    });

    test('JS: deleteTraining закрывает попапы до диалога подтверждения', () => {
        const dt = fnBody(INDEX_SRC, 'deleteTraining: function');
        assertTrue(dt.indexOf('this.closeCellPopup();') !== -1 &&
            dt.indexOf('this.closeEmpPopup();') !== -1,
            'оба попапа закрываются (кнопки ✕ есть в обоих)');
        assertTrue(dt.indexOf('kipConfirm') !== -1,
            'подтверждение удаления сохранено');
    });
});

describe('Task 309 — рамка ручных д/н', () => {

    test('JS: _renderCell ставит ws-manual-dn только ручным д/н', () => {
        const rc = INDEX_SRC.slice(
            INDEX_SRC.indexOf('_renderCell: function'),
            INDEX_SRC.indexOf('generateYear: function'));
        const idx = rc.indexOf("if (isManual && (status === 'д' || status === 'н'))");
        assertTrue(idx !== -1, 'условие: источник «руч» + статус д/н');
        // класс ставится после ws-source-manual (общий маркер жив)
        assertTrue(rc.indexOf("if (isManual) classes.push('ws-source-manual');") !== -1,
            'общий маркер ручных записей не тронут');
        // планированные Д/Н и ручные другие коды — БЕЗ яркой рамки:
        // условие объединяет оба требования через &&
        const cond = rc.slice(idx, rc.indexOf('}', idx));
        assertTrue(cond.indexOf('isManual') !== -1 && cond.indexOf("status === 'д'") !== -1,
            'рамка не вешается на авто-коды');
    });

    test('CSS: ws-manual-dn — ::before рамка 1px с закруглением (Task 310), обе темы', () => {
        // Task 310: рамка 1px с ЗАКРУГЛЁННЫМИ углами — как у миниатюры
        // .ws-popup-swatch (border 1px + border-radius 3px). Было 2px
        // box-shadow без скругления (Task 309).
        assertTrue(INDEX_SRC.indexOf('.ws-grid tbody td.ws-cell.ws-manual-dn::before {') !== -1,
            'правило ::before (border-collapse: collapse игнорирует radius на td)');
        const rule = INDEX_SRC.slice(
            INDEX_SRC.indexOf('.ws-grid tbody td.ws-cell.ws-manual-dn::before {'),
            INDEX_SRC.indexOf('}', INDEX_SRC.indexOf('.ws-grid tbody td.ws-cell.ws-manual-dn::before {')));
        assertTrue(rule.indexOf('border: 1px solid rgba(255, 255, 255, 0.85)') !== -1,
            'тёмная тема: рамка 1px (не 2px)');
        assertTrue(rule.indexOf('border-radius: 3px') !== -1,
            'углы закруглены — как у свотча миниатюры');
        assertTrue(rule.indexOf('pointer-events: none') !== -1,
            'клики по ячейке проходят сквозь рамку');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ws-grid tbody td.ws-cell.ws-manual-dn::before {') !== -1,
            'светлая тема: правило есть');
        const ruleLight = INDEX_SRC.slice(
            INDEX_SRC.indexOf('[data-theme="light"] .ws-grid tbody td.ws-cell.ws-manual-dn::before {'),
            INDEX_SRC.indexOf('}', INDEX_SRC.indexOf('[data-theme="light"] .ws-grid tbody td.ws-cell.ws-manual-dn::before {')));
        assertTrue(ruleLight.indexOf('border-color: rgba(38, 50, 56, 0.75)') !== -1,
            'светлая тема: тёмная рамка 1px');
        // box-shadow-вариант Task 309 полностью ушёл
        assertFalse(INDEX_SRC.indexOf('box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.85)') !== -1,
            'инсет-тень 2px удалена');
        assertFalse(INDEX_SRC.indexOf('box-shadow: inset 0 0 0 2px rgba(38, 50, 56, 0.75)') !== -1,
            'светлая 2px тень удалена');
    });

    test('CSS: Task 417 — hover-подсветка колонки ФИО удалена', () => {
        assertFalse(INDEX_SRC.indexOf('.ws-grid tbody td.ws-emp-col:hover {') !== -1,
            'тёмная тема: правило hover удалено');
        assertFalse(INDEX_SRC.indexOf('[data-theme="light"] .ws-grid tbody td.ws-emp-col:hover') !== -1,
            'светлая тема: правило hover удалено');
        assertTrue(INDEX_SRC.indexOf('подсветка НАВЕДЕНИЯ колонки ФИО удалена') !== -1,
            'CSS-маркер удаления Task 417');
    });
});

describe('Task 309 — регресс-фиксы Task 308 (loadTrainings/loadVacations)', () => {

    test('JS: вызовы удалённых страниц loadTrainings()/loadVacations() исчезли', () => {
        // Task 308 удалил страницы «Инструктажи»/«Отпуска» вместе с их
        // загрузчиками, но вызовы self.loadTrainings() остались — после
        // добавления/удаления мероприятия тостил ложную «Ошибка» и сетка
        // не перезагружалась. Task 309 заменил вызовы на loadGrid().
        assertFalse(/self\.loadTrainings\(\)/.test(INDEX_SRC),
            'self.loadTrainings() больше не зовётся (метода нет)');
        assertFalse(/self\.loadVacations\(\)/.test(INDEX_SRC),
            'self.loadVacations() больше не зовётся (метода нет)');
        assertFalse(/this\.loadTrainings\(\)/.test(INDEX_SRC),
            'this.loadTrainings() тоже не встречается');
        assertFalse(/this\.loadVacations\(\)/.test(INDEX_SRC),
            'this.loadVacations() тоже не встречается');
    });

    test('JS: добавление/удаление мероприятия и удаление отпуска перезагружают сетку', () => {
        const stf = fnBody(INDEX_SRC, 'submitTrainingForm: function');
        // Task 314: loadGrid(true) — свежие данные с сервера
        assertTrue(stf.indexOf('self.loadGrid(true);') !== -1,
            'submitTrainingForm (создание) → loadGrid(true)');
        const ddt = fnBody(INDEX_SRC, '_doDeleteTraining: function');
        assertTrue(ddt.indexOf('self.loadGrid(true);') !== -1,
            '_doDeleteTraining → loadGrid(true)');
        const ddv = fnBody(INDEX_SRC, '_doDeleteVacation: function');
        assertTrue(ddv.indexOf('self.loadGrid(true);') !== -1,
            '_doDeleteVacation → loadGrid(true) (план «ОТ» обновляется)');
    });
});

describe('Task 309 — Service Worker', () => {

    test('SW: версия кэша kipia-test-v745', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v745'") !== -1,
            'CACHE_VERSION в sw.js = kipia-test-v745');
        assertFalse(SW_SRC.indexOf('kipia-test-v547') !== -1,
            'старой версии v547 нет');
    });
});
