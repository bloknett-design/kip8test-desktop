// tests/test-task312.js
// Task 312 — «+ Отпуск» в карточку сотрудника; попап ячейки без
// «— выходной —» и кодов мероприятий; цвет «.» — белый.
// Заявка пользователя:
//   «В разделе "График работы", в баре над шахматкой убери кнопку
//    "+ Отпуск", а её функционал перемести в новую кнопку в окно
//    сотрудника в блок отпуска. В открывающимся окне ячеек шахматки
//    коды которые добавляются через "+ Мероприятия" убери из списка
//    основных, они будут добавляться только в виде маленьких иконок
//    в ячейках. В этом же окне убери самый первый код, которого нет
//    в таблице кодов " — выходной", а цвет кода "." нужно сделать
//    белым как в пустых ячейках с точкой (напишешь мне код цвета,
//    я заменю на него в таблице)».
//
// ЧТО ПРОВЕРЯЕТСЯ (статические инварианты клиента):
//   Кнопка «+ Отпуск» → карточка сотрудника:
//     — #wsVacBtn и .ws-addvac-btn (HTML + CSS + светлая тема)
//       удалены; init() больше не управляет видимостью;
//     — _renderEmpPopup рендерит строку «+ Отпуск…» (класс
//       ws-emp-addvac, стили строки — ws-popup-row ws-popup-more)
//       ТОЛЬКО при _canEdit;
//     — onEmpAddVacation(таб.№): закрыть карточку → открыть форму
//       с префиллом (closeEmpPopup + openVacationForm(tabNo));
//     — openVacationForm(tabNo): сотрудник карточки выбирается в
//       списке ДО onVacEmployeeChange (часть/лимит — сразу его);
//     — двойная защита: openVacationForm проверяет _canEdit;
//     — bottom-sheet #wsVacSheet жив без изменений.
//   Попап ячейки (_renderCellPopup):
//     — строка «— выходной —» (код «—», нет в «Коды_статусов»)
//       УДАЛЕНА; ws-popup-swatch-empty не используется; очистка
//       ячейки — «Дополнительно…» (select + удаление);
//     — коды мероприятий (_EVENT_CODES: И/ОБ/ПЗ/ПР/*) исключены
//       из списка основных статусов; справка/действия — окно
//       «Мероприятия в этот день» (Task 313: вынесено ИЗ окна кодов
//       в отдельное окно НАД ним) и «+ Мероприятие…» живы;
//     — «Дополнительно…» (select «Статус»): мероприятия не
//       предлагаются, ТЕКУЩЕЕ значение-мероприятие остаётся
//       опцией (generateMonth пишет его на день события без
//       смены — шит не должен «терять» статус ячейки).
//   Цвет «.»:
//     — fallback-цвет в _loadStatusCodes: #CFD8DC → #FAF9F5
//       (белый, как фон пустых ячеек с точкой — светлая тема
//       --bg-primary #FAF9F5); ОСНОВНОЕ значение пользователь
//       меняет в листе «Коды_статусов» сам (код #FAF9F5).
//   SW: kipia-test-v741 (Task 313: v551 → v552 — окно мероприятий
//       над окном кодов + подсветка сегодняшней даты).
//
// Запуск: через tests/run-all.js (require './test-task312.js').

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

describe('Task 312 — кнопка «+ Отпуск»: тулбар → карточка сотрудника', () => {

    test('HTML: #wsVacBtn удалена из бара над шахматкой', () => {
        assertTrue(INDEX_SRC.indexOf('id="wsVacBtn"') === -1,
            'кнопки «+ Отпуск» в тулбаре нет');
        // бар жив: селекты, «Сформировать», «Сохранить», окошко календаря
        const ws = INDEX_SRC.slice(INDEX_SRC.indexOf('id="page-work-schedule"'),
                                   INDEX_SRC.indexOf('id="wsGridWrap"'));
        assertTrue(ws.indexOf('id="wsMonthSel"') !== -1 &&
                   ws.indexOf('id="wsYearSel"') !== -1 &&
                   ws.indexOf('id="wsGenerateBtn"') !== -1 &&
                   ws.indexOf('id="wsSaveBtn"') !== -1 &&
                   ws.indexOf('id="wsCalPanel"') !== -1,
            'бар над шахматкой жив (селекты, «Сформировать», «Сохранить», календарь)');
    });

    test('CSS: .ws-addvac-btn — правило удалено (тёмная + светлая тема)', () => {
        assertFalse(INDEX_SRC.indexOf('.ws-addvac-btn') !== -1,
            'правило .ws-addvac-btn не осталось в CSS');
        assertFalse(/\[data-theme="light"\] \.ws-addvac-btn/.test(INDEX_SRC),
            'светлая тема «+ Отпуск» удалена');
        // ряд кнопок одного роста живёт без «+ Отпуск»
        // Task 314: + .ws-refresh-btn («Обновить») — один рост;
        // Task 324: + .ws-totals-btn/.ws-tt-tab (Итоги учёта + вкладки)
        assertTrue(/\.ws-month-sel, \.ws-year-sel, \.ws-generate-btn, \.ws-save-btn,\n\s*\.ws-refresh-btn, \.ws-totals-btn, \.ws-tt-tab \{[^}]*height:\s*32px/.test(INDEX_SRC),
            'единая высота 32px (Task 269/314/324, актуализация Task 328) — без .ws-addvac-btn');
    });

    test('JS: init() больше не ищет wsVacBtn', () => {
        const init = INDEX_SRC.slice(INDEX_SRC.indexOf('init: function'),
                                     INDEX_SRC.indexOf('_refreshFromUrlState: function'));
        assertFalse(init.indexOf("getElementById('wsVacBtn')") !== -1,
            'init не управляет убранной кнопкой');
        // «Сформировать» — прежняя логика видимости по _canEdit
        assertTrue(init.indexOf("var genBtn = document.getElementById('wsGenerateBtn');") !== -1,
            'видимость «Сформировать» в init не задета');
    });

    test('JS: _renderEmpPopup — строка «+ Отпуск…» в блоке отпусков', () => {
        // Task 385: тело — в _renderWorkerCard (страница «Работники»)
        const rp = fnBody(INDEX_SRC, '_renderWorkerCard: function');
        assertTrue(rp.indexOf('ws-emp-addvac') !== -1,
            'класс-маркер строки добавления отпуска');
        assertTrue(rp.indexOf('+ Отпуск…</div>') !== -1,
            'текст строки «+ Отпуск…»');
        assertTrue(rp.indexOf('ws-popup-row ws-popup-more ws-emp-addvac') !== -1,
            'стиль строки — как «+ Мероприятие…» в попапе ячейки');
        // строка ПОСЛЕ секции «Отпуска · год» и ДО «Мероприятия · месяц»
        const iVacSec = rp.indexOf('Отпуска · ');
        const iAddVac = rp.indexOf('ws-emp-addvac');
        const iTrSec = rp.indexOf('Мероприятия · ');
        assertTrue(iVacSec !== -1 && iAddVac !== -1 && iTrSec !== -1 &&
                   iVacSec < iAddVac && iAddVac < iTrSec,
            'строка «+ Отпуск…» внутри блока отпусков (между секциями)');
        // только редакторам (Task 385: гейт withEdit — страница
        // «Работники»; попап шахматки зовёт с false)
        assertTrue(rp.indexOf('if (withEdit) {') !== -1,
            'рендер строки обёрнут гейтом withEdit');
    });

    test('JS: клик строки → onEmpAddVacation(таб. №) с экранированием', () => {
        const rp = fnBody(INDEX_SRC, '_renderWorkerCard: function');
        assertTrue(rp.indexOf("WorkSchedule.onEmpAddVacation(\\'") !== -1,
            'onclick строки зовёт onEmpAddVacation с таб. №');
        assertTrue(rp.indexOf("this._esc(String(emp['таб_номер'] || ''))") !== -1,
            'таб. № экранируется _esc (защита от кавычек)');
    });

    test('JS: onEmpAddVacation — закрыть карточку, открыть форму с префиллом', () => {
        const fn = fnBody(INDEX_SRC, 'onEmpAddVacation: function');
        assertTrue(fn.indexOf('this.closeEmpPopup();') !== -1,
            'карточка закрывается перед шторкой');
        assertTrue(fn.indexOf('this.openVacationForm(tabNo);') !== -1,
            'форма открывается с таб. № сотрудника карточки');
    });

    test('JS: openVacationForm(tabNo) — префилл сотрудника', () => {
        const fn = fnBody(INDEX_SRC, 'openVacationForm: function');
        // Task 384: 2-й аргумент editVacation — режим правки периода
        assertTrue(INDEX_SRC.indexOf('openVacationForm: function(tabNo, editVacation)') !== -1,
            'сигнатура принимает необязательный таб. № (и запись правки — Task 384)');
        assertTrue(fn.indexOf('empSel.value = String(tabNo);') !== -1,
            'выбранный сотрудник устанавливается в списке');
        // префилл ДО onVacEmployeeChange: часть и лимит года — сразу его
        const iPrefill = fn.indexOf('empSel.value = String(tabNo);');
        const iChange = fn.indexOf('this.onVacEmployeeChange();');
        assertTrue(iPrefill !== -1 && iChange !== -1 && iPrefill < iChange,
            'префилл раньше onVacEmployeeChange (часть/лимит — для него)');
        // двойная защита (право записи) не снята
        assertTrue(fn.indexOf('if (!this._canEdit) return;') !== -1,
            'openVacationForm проверяет право записи');
    });

    test('HTML: bottom-sheet «Новый отпуск» жив (без изменений)', () => {
        assertTrue(INDEX_SRC.indexOf('id="wsVacSheet"') !== -1 &&
                   INDEX_SRC.indexOf('id="wsVacOverlay"') !== -1 &&
                   INDEX_SRC.indexOf('id="wsVacTabNo"') !== -1 &&
                   INDEX_SRC.indexOf('id="wsVacStart"') !== -1 &&
                   INDEX_SRC.indexOf('id="wsVacEnd"') !== -1,
            'шторка и поля формы живы');
        assertTrue(INDEX_SRC.indexOf('WorkSchedule.submitVacationForm()') !== -1,
            'submit жив (лимит 42 дн. Task 310 — в шторке)');
    });
});

describe('Task 312 — попап ячейки: «— выходной —» и коды мероприятий', () => {

    test('JS: строка «— выходной —» удалена из _renderCellPopup', () => {
        const cp = fnBody(INDEX_SRC, '_renderCellPopup: function');
        assertFalse(cp.indexOf('>выходной</span>') !== -1,
            'строки «— выходной —» в попапе нет');
        assertFalse(cp.indexOf('ws-popup-swatch-empty') !== -1,
            'пунктирный свотч «выходного» не рендерится');
        assertFalse(cp.indexOf("WorkSchedule.onPopupStatus(\\'\\')") !== -1,
            'клик по пустому коду из попапа не вызывается');
        // шапка и строки статусов живы
        assertTrue(cp.indexOf('ws-popup-title') !== -1,
            'заголовок (дата · ФИО) жив');
        assertTrue(cp.indexOf('ws-popup-row') !== -1 &&
                   cp.indexOf('ws-popup-swatch') !== -1,
            'строки «код — название» живы');
    });

    test('CSS: .ws-popup-swatch-empty — мёртвое правило удалено', () => {
        assertFalse(INDEX_SRC.indexOf('.ws-popup-swatch-empty {') !== -1,
            'правило .ws-popup-swatch-empty не осталось');
        assertTrue(INDEX_SRC.indexOf('.ws-popup-swatch {') !== -1,
            'базовый свотч жив');
    });

    test('JS: коды мероприятий исключены из списка основных', () => {
        const cp = fnBody(INDEX_SRC, '_renderCellPopup: function');
        assertTrue(cp.indexOf('this._EVENT_CODES.indexOf(c.code) !== -1') !== -1,
            'фильтр _EVENT_CODES в цикле статусов');
        // сам список _EVENT_CODES жив (бейджи, секция мероприятий)
        assertTrue(INDEX_SRC.indexOf("_EVENT_CODES: ['И', 'ОБ', 'ПЗ', 'ПР', '*']") !== -1,
            'константа _EVENT_CODES жива (слой мероприятий Task 303/306)');
    });

    test('JS: Task 313 — секция мероприятий вынесена из _renderCellPopup', () => {
        // Task 313: секция «Мероприятия в этот день» переехала из
        // окна кодов в ОТДЕЛЬНОЕ окно #wsEventsPopup над ним; в самом
        // _renderCellPopup строк-событий и заголовка секции больше нет
        // (проверяются МАРКЕРЫ РЕНДЕРА — комментарии кода упоминают
        // переезд и не должны ломать инвариант)
        const cp = fnBody(INDEX_SRC, '_renderCellPopup: function');
        assertFalse(cp.indexOf('ws-popup-sec') !== -1,
            'Task 313: заголовка секции в окне кодов нет');
        assertFalse(cp.indexOf('ws-popup-event') !== -1,
            'Task 313: строк-событий в окне кодов нет');
        assertFalse(cp.indexOf('this._eventsAt(') !== -1,
            'Task 313: _renderCellPopup не собирает события (рендер — в _renderEventsPopup)');
        assertTrue(cp.indexOf('WorkSchedule.onPopupAddEvent()') !== -1,
            '«+ Мероприятие…» жив (добавление событий)');
        assertTrue(cp.indexOf('WorkSchedule.onPopupMore()') !== -1,
            '«Дополнительно…» жив (расширенная правка)');
    });

    test('JS: _fillStatusSelect — мероприятия не предлагаются, текущее значение живо', () => {
        const fn = fnBody(INDEX_SRC, '_fillStatusSelect: function');
        assertTrue(fn.indexOf('this._EVENT_CODES.indexOf(c.code) !== -1 && c.code !== cur') !== -1,
            'фильтр мероприятий с исключением текущего значения (Task 387: cur)');
        // option «— выходной —» в select «Дополнительно…» жив
        // (это НЕ попап: очистка ячейки осталась в расширенной правке)
        assertTrue(fn.indexOf('<option value="">— выходной —</option>') !== -1,
            'select шита: «— выходной —» жив (очистка ячейки)');
        // незнакомое легаси-значение по-прежнему добавляется опцией
        assertTrue(fn.indexOf('(нет в справочнике)') !== -1,
            'легаси-значение временно опцией (Task 298)');
    });

    test('JS: onPopupStatus(\'\') — семантика очистки жива (путь шита)', () => {
        // Метод onPopupStatus не удалён (submitCellForm и select шита
        // используют его семантику через _applyCellStatus(''))
        const fn = fnBody(INDEX_SRC, 'onPopupStatus: function');
        assertTrue(fn.indexOf('_applyCellStatus') !== -1,
            'onPopupStatus применяет статус локально');
        // _applyCellStatus('') — очистка: ручная запись → __delete и т. д.
        const ap = fnBody(INDEX_SRC, '_applyCellStatus: function');
        assertTrue(ap.indexOf('__delete') !== -1,
            'семантика «выходной» в _applyCellStatus жива');
    });
});

describe('Task 312/314 — «.» (плановый выходной): символ «·», фон как пустая ячейка', () => {

    test('JS: fallback = канон Task 387 («Выходной» — пустой код, #EEF0F2)', () => {
        // Task 314: «.»-ячейка красится CSS-классом ws-dot-code —
        // фон ПУСТОЙ ячейки в любой теме; цвет листа/канона к фону
        // ячейки НЕ применяется (значение справочное; #EEF0F2 — фон
        // ячеек светлой темы, Task 250). Task 387: fallback — КАНОН
        // _STATUS_CODES_CANON (порядок по группам, полные наимено-
        // вания), «Выходной» — ПУСТОЙ код (точка «·» убрана заявкой)
        const lc = fnBody(INDEX_SRC, '_loadStatusCodes: function');
        assertTrue(lc.indexOf('self._normalizeStatusCodes(self._STATUS_CODES_CANON)') !== -1,
            'fallback — канон _STATUS_CODES_CANON (Task 387)');
        assertTrue(INDEX_SRC.indexOf("{code:'',     short:'выходной', name:'Выходной, плановый выходной день', color:'#EEF0F2'}") !== -1,
            'канон: «Выходной» — пустой код, #EEF0F2 (фон ячеек светлой темы)');
        assertFalse(INDEX_SRC.indexOf("color:'#CFD8DC'") !== -1,
            'старый серо-голубой #CFD8DC не остался');
    });

    test('JS: «.»-ячейка — класс ws-dot-code, inline-фон НЕ ставится', () => {
        const rc = fnBody(INDEX_SRC, '_renderCell: function');
        assertTrue(rc.indexOf("var isDotCode = (status === '.');") !== -1,
            'детектор «.» в _renderCell');
        assertTrue(rc.indexOf("if (isDotCode) classes.push('ws-dot-code');") !== -1,
            'класс-маркер ws-dot-code');
        assertTrue(rc.indexOf('if (showMainCode) style') !== -1,
            'inline-фон только для «настоящих» статусов (не «.»)');
        // символ в ячейке — «·» (U+00B7) как у пустых
        // Task 355: в нерабочих днях (dayOff) «·» НЕ выводится
        assertTrue(rc.indexOf("(showMainCode ? status : (vacPlan ? 'ОТ' : ''))") !== -1,
            '«.» и пустая ячейка — чистый центр (Task 356: «·» убрана везде)');
    });

    test('JS: попап/select — «Выходной» БЕЗ кода-символа (Task 387), свотч ws-swatch-dot', () => {
        const rp = fnBody(INDEX_SRC, '_renderCellPopup: function');
        assertTrue(rp.indexOf("var isDot = (c.code === '.' || c.code === '');") !== -1,
            'детектор «Выходного»: пустой код ИЛИ легаси-«.»');
        assertTrue(rp.indexOf("this._esc(isDot ? '' : c.code)") !== -1,
            'метка строки «Выходного» ПУСТА (точка «·» убрана, Task 387)');
        assertFalse(rp.indexOf("this._esc(isDot ? '·' : c.code)") !== -1,
            'метки «·» в попапе больше нет');
        assertTrue(rp.indexOf('ws-popup-swatch ws-swatch-dot') !== -1,
            'свотч «Выходного» — фон пустой ячейки (тема)');
        const fs2 = fnBody(INDEX_SRC, '_fillStatusSelect: function');
        assertTrue(fs2.indexOf("if (c.code === '' || c.code === '.') continue;") !== -1,
            'select: «Выходной» — опцией «— выходной —» (без дубля)');
        assertTrue(fs2.indexOf("var cur = (current === '.') ? '' : current;") !== -1,
            'select: легаси-«.» текущего значения маппится в «— выходной —»');
    });

    test('CSS: ws-dot-code — фон пустой ячейки, обе темы', () => {
        const dark = /\.ws-grid tbody td\.ws-cell\.ws-dot-code \{[^}]*background:\s*var\(--bg-primary,\s*#1a2233\);/.test(INDEX_SRC);
        assertTrue(dark, '«.»-ячейка — var(--bg-primary, #1a2233)');
        const light = /\[data-theme="light"\] \.ws-grid tbody td\.ws-cell\.ws-dot-code \{[^}]*background:\s*#FFFFFF;/.test(INDEX_SRC);
        assertTrue(light, 'светлая тема: «.»-ячейка = #FFFFFF (как пустые, Task 379)');
        const sw = /\.ws-popup-swatch\.ws-swatch-dot \{[^}]*background:\s*var\(--bg-primary,\s*#1a2233\);/.test(INDEX_SRC);
        assertTrue(sw, 'свотч «.» в попапе — фон пустой ячейки');
    });

    test('CSS: фон пустых ячеек — --bg-primary (эталон цвета)', () => {
        // Пустые ячейки с точкой: background: var(--bg-primary, #1a2233);
        // светлая тема задаёт --bg-primary: #FAF9F5 — фон СТРАНИЦЫ; фон
        // ЯЧЕЕК сетки светлой темы — #FFFFFF (Task 250→379) — его и
        // берёт «.»-ячейка (совпадение с пустой в любой теме)
        const m = /\.ws-grid tbody td\.ws-cell \{[^}]*background:\s*var\(--bg-primary,\s*#1a2233\);/.test(INDEX_SRC);
        assertTrue(m, 'пустая ячейка — var(--bg-primary, #1a2233)');
        const light = INDEX_SRC.indexOf('--bg-primary: #FAF9F5;') !== -1;
        assertTrue(light, 'светлая тема: --bg-primary = #FAF9F5');
    });
});

describe('Task 312 — Service Worker', () => {

    test('SW: версия кэша kipia-test-v741', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v741'") !== -1,
            'CACHE_VERSION в sw.js = kipia-test-v741');
        assertFalse(SW_SRC.indexOf('kipia-test-v550') !== -1,
            'старой версии v550 нет');
    });
});
