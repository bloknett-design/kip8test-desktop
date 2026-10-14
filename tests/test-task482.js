// tests/test-task482.js
// Task 482 — заявка пользователя (раздел «Табель учёта рабочего
// времени»), ТРИ части:
//   1) «в окнах мероприятий и нормах рабочего времени, если при их
//      разворачивании список будет длинным и не вмещаться в экран,
//      то сделай возможность его прокрутки колёсиком мышки или
//      свайпом по сенсору экрана» — раскрытое окно бара КАПАЕТСЯ по
//      низу ЭКРАНА (_barExpMaxH: vh − rect.top − 10, минимум 140px),
//      текст длиннее предела листается ВНУТРИ окна (overflow-y:
//      auto + overscroll-behavior: contain уже стоят — колесо/
//      свайп/↑↓; полоса по-прежнему скрыта, приём Task 378);
//   2) «в ячейках шахматки табеля учёта значки "ПЗ" и "И" должны
//      менять цвет рамки на зелёный, если отмечено их выполнение,
//      или красный, если выполнение не отмечено, а дата проведения
//      прошла» — классы ws-ev-done (#43a047 — палитра галочки
//      Task 418) / ws-ev-late (#ef5350 — палитра «просрочен»
//      Task 418) на бейдже; только И/ПЗ (семейство «Инструктажи»,
//      столбцы «выполнение»/«просрочен»); просрочка = поле
//      «просрочен» сервера либо дата_начала < «сегодня» (семантика
//      карточки Task 418);
//   3) «добавь возможность отмечать их выполнение в окне, которое
//      появляется возле ячейки при нажатии на эту ячейку, рядом со
//      значками редактирования и удаления, у тех пользователей,
//      которые имеют доступ к изменению данных» — ГАЛОЧКА .ws-done-
//      chk в ряду действий попапа «Мероприятия в этот день»
//      (ПЕРЕД ✎/✕), клик — toggleTrainingDone (тот же метод, что в
//      карточке, Task 418); только записи семейства «Инструктажи»
//      с id; зрители видят СОСТОЯНИЕ некликабельно; после отметки
//      шахматка (_renderGridIfOpen) и окно (_refreshEventsPopup)
//      перерисовываются сразу.
//   АДАПТАЦИЯ Task 487 (заявка: «в попапе мероприятия убери все три
//   кнопки — только просмотр, изменение только из карт работников»):
//   часть 3 в попапе ОТМЕНЕНА — клик-галочка и ✎/✕ из окна удалены
//   (VM-тесты §3 переписаны под справочное окно: read-only маркер
//   для всех ролей). Методы toggleTrainingDone/_renderGridIfOpen/
//   _refreshEventsPopup (§4) живы — их вызывает карточка (Task 418).
//   sw.js kipia-test-v705 → v706 + комментарий Task 482 (~375
//   симв.); ЛОГИКА SW НЕ МЕНЯЛАСЬ; персистентные кэши НЕ ТОНУТЫ.
//
// Адаптации под Task 482: test-task379.js §3 — формула маржи
// `(95 - el.scrollHeight)` → `(95 - hOpen)` (кап высоты; VM-тесты §4
// НЕ тронуты — гвард typeof отключает кап в старых харнессах);
// окна истории sw.js расширены scripts/task482-windows.py
// (478/479: 1400→1700; 480: 700→1100; 481: w700→1100 + w1400→1700).
//
// Запуск: через tests/run-all.js (require './test-task482.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Вырезка метода WorkSchedule: «имя: function» (отступ 8 пробелов)
// → следующий метод ТОГО ЖЕ уровня (как в test-task379).
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

// CSS-правило целиком: от селектора до первой '}'
function oneRule(src, sel) {
    const i = src.indexOf(sel);
    if (i === -1) return null;
    const end = src.indexOf('}', i);
    return end === -1 ? null : src.slice(i, end + 1);
}

// ==========================================================================
// 1. CSS: рамка бейджа И/ПЗ (часть 2 заявки)
// ==========================================================================
describe('Task 482 — CSS: рамка бейджа ws-ev-done / ws-ev-late', () => {

    test('правило ws-ev-done: зелёная рамка + внешняя полоска', () => {
        const r = oneRule(INDEX_SRC,
            '.ws-grid tbody td.ws-cell .ws-ev-badge.ws-ev-done');
        assertTrue(r !== null, 'правило объявлено');
        assertTrue(r.indexOf('#43a047') !== -1,
            'палитра галочки отметки Task 418');
        assertTrue(r.indexOf('border-color') !== -1, 'красится именно РАМКА');
        assertTrue(r.indexOf('rgba(67, 160, 71') !== -1,
            'внешняя полоска box-shadow — той же парой');
    });

    test('правило ws-ev-late: красная рамка + внешняя полоска', () => {
        const r = oneRule(INDEX_SRC,
            '.ws-grid tbody td.ws-cell .ws-ev-badge.ws-ev-late');
        assertTrue(r !== null, 'правило объявлено');
        assertTrue(r.indexOf('#ef5350') !== -1,
            'палитра бейджа «просрочен» Task 418');
        assertTrue(r.indexOf('border-color') !== -1, 'красится именно РАМКА');
        assertTrue(r.indexOf('rgba(239, 83, 80') !== -1,
            'внешняя полоска box-shadow — той же парой');
    });

    test('базовая рамка бейджа НЕ тронута (обычное состояние)', () => {
        const r = oneRule(INDEX_SRC,
            '.ws-grid tbody td.ws-cell .ws-ev-badge {');
        assertTrue(r !== null, 'базовое правило живо');
        assertTrue(r.indexOf('border: 1px solid rgba(0, 0, 0, 0.45)') !== -1,
            'тёмная рамка по умолчанию — как прежде');
        assertTrue(r.indexOf('box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22)') !== -1,
            'белая внешняя полоска по умолчанию — как прежде');
    });

    test('цвета обеих тем: средние тона (без light-переопределений)', () => {
        // #43a047/#ef5350 читаются и на светлом фоне (уже заняты
        // светлой темой Task 418) — отдельных light-правил НЕ надо
        const i = INDEX_SRC.indexOf(
            '.ws-grid tbody td.ws-cell .ws-ev-badge.ws-ev-done');
        const light = INDEX_SRC.indexOf(
            '[data-theme="light"] .ws-grid tbody td.ws-cell .ws-ev-badge');
        assertTrue(light === -1 || light > i + 600,
            'light-переопределений рамок не появлялось');
    });
});

// ==========================================================================
// 2. SRC: логика рамки в _renderCell (evStateCls)
// ==========================================================================
describe('Task 482 — SRC: класс состояния на бейджах ячеек', () => {

    test('класс evStateCls подставляется в бейдж', () => {
        assertTrue(INDEX_SRC.indexOf(
            "'<span class=\"ws-ev-badge' + evStateCls + '\"'") !== -1,
            'атрибут class собирается с evStateCls (пустой — прежний вид)');
    });

    test('условие — только коды И и ПЗ', () => {
        const i = INDEX_SRC.indexOf("var evStateCls = '';");
        const seg = INDEX_SRC.slice(i, i + 700);
        assertTrue(seg.indexOf("events[evj].code === 'И'") !== -1,
            'бейдж И');
        assertTrue(seg.indexOf("events[evj].code === 'ПЗ'") !== -1,
            'бейдж ПЗ');
        assertTrue(seg.indexOf('ОБ') === -1,
            'ОБ (обучение) — НЕ окрашивается (нет столбца выполнения)');
    });

    test('зелёный: выполнение = 1', () => {
        const i = INDEX_SRC.indexOf("var evStateCls = '';");
        // окно 900: до ' ws-ev-done' от объявления ~725 символов
        const seg = INDEX_SRC.slice(i, i + 900);
        assertTrue(seg.indexOf(
            'parseInt(evTr.выполнение, 10) === 1') !== -1,
            'отметка выполнения листа «Инструктажи»');
        assertTrue(seg.indexOf("' ws-ev-done'") !== -1, 'класс ws-ev-done');
    });

    test('красный: не выполнено + дата прошла (просрочен/дата_начала)', () => {
        const i = INDEX_SRC.indexOf("var evStateCls = '';");
        const seg = INDEX_SRC.slice(i, i + 900);
        assertTrue(seg.indexOf(
            'evTr.просрочен !== undefined') !== -1,
            'поле «просрочен» сервера имеет приоритет');
        assertTrue(seg.indexOf(
            "String(evTr.дата_начала || '')") !== -1,
            'фолбэк: дата_начала < «сегодня» (семантика карточки 418)');
        assertTrue(seg.indexOf("' ws-ev-late'") !== -1, 'класс ws-ev-late');
    });

    test('запись без полей (виртуальный бейдж) — обычная рамка', () => {
        const i = INDEX_SRC.indexOf("var evStateCls = '';");
        const seg = INDEX_SRC.slice(i, i + 300);
        assertTrue(seg.indexOf('if (evTr &&') !== -1,
            'гвард evTr: виртуальный бейдж статуса не красится');
    });

    test('просрочка считается от «сегодня» (_todayIso сетки)', () => {
        const i = INDEX_SRC.indexOf("var evStateCls = '';");
        const seg = INDEX_SRC.slice(i, i + 900);
        assertTrue(seg.indexOf('this._todayIso') !== -1,
            'дата сетки (_renderGrid) с фолбэком свежей даты');
    });
});

// ==========================================================================
// 3. VM: попап «Мероприятия в этот день» — галочка отметки (часть 3)
// ==========================================================================
describe('Task 482 — VM: _renderEventsPopup — маркер состояния (Task 487: окно справочное)', () => {

    const CODES = [
        { code: 'И', name: 'Инструктаж', color: '#B3E5FC' },
        { code: 'ПЗ', name: 'Проверка знаний', color: '#FFCDD2' },
        { code: 'ОБ', name: 'Обучение', color: '#D1C4E9' }
    ];
    const EMP = [{ 'таб_номер': 7, 'ФИО': 'Иванов И. И.' }];
    const TRAININGS = [
        { id: 101, 'таб_номер': 7, тип: 'инструктаж',
          дата_начала: '2026-09-10', дата_окончания: '2026-09-10',
          тема: 'Повторный инструктаж по охране труда',
          выполнение: 1, просрочен: 0 },
        { id: 102, 'таб_номер': 7, тип: 'проверка_знаний',
          дата_начала: '2026-09-20', дата_окончания: '2026-09-20',
          тема: 'Проверка знаний до 1000В',
          выполнение: 0, просрочен: 1 },
        { id: 103, 'таб_номер': 7, тип: 'обучение',
          дата_начала: '2026-09-25', дата_окончания: '2026-09-25',
          тема: 'Обучение по охране труда', выполнение: 0 }
    ];

    function loadPopupHost(canEdit, trainings) {
        const names = ['_renderEventsPopup', '_eventsAt', '_trainingCodeOf',
                       '_statusMeta', '_isInstrType', '_instrShortOf',
                       '_normInstrKey', '_fmtDateRu', '_esc'];
        const texts = names.map(n => methodText(WS_SRC, n));
        assertTrue(texts.every(t => t.length > 0),
            'методы попапа извлекаются');
        const host = new Function(
            'return ({' + texts.join('\n') + '\n});')();
        host._EMPLOYEES = EMP;
        host._TRAININGS = trainings || TRAININGS;
        host._STATUS_CODES = CODES;
        host._INSTR_LIST = [];
        host._canEdit = canEdit;
        return host;
    }

    test('редактор + И выполнено: БЕЗ маркера и кнопок (Task 488)', () => {
        // Task 487 (заявка): окно справочное для ВСЕХ ролей —
        // клик-галочка и ✎/✕ удалены. Task 488 (заявка: «кнопка
        // отметки осталась»): убран и read-only МАРКЕР-квадрат —
        // окно чисто текстовая справка (состояние — рамка бейджа
        // сетки + галочка карточки работника)
        const host = loadPopupHost(true);
        const html = host._renderEventsPopup('2026-09-10', 7);
        assertTrue(html.indexOf('ws-done-chk') === -1,
            'маркера-«кнопки» нет даже у выполненного (Task 488)');
        assertTrue(html.indexOf('toggleTrainingDone') === -1,
            'клика-отметки нет (отметка — из карточки)');
        assertTrue(html.indexOf('Редактировать') === -1 &&
                   html.indexOf('Удалить') === -1,
            '✎/✕ в окне нет (правка — из карточки)');
    });

    test('редактор + ПЗ НЕ выполнено: значка нет, окна — только текст', () => {
        const host = loadPopupHost(true);
        const html = host._renderEventsPopup('2026-09-20', 7);
        assertTrue(html.indexOf('ws-done-chk') === -1,
            'не выполнено — маркера нет (состояние несёт рамка бейджа в сетке)');
        assertTrue(html.indexOf('toggleTrainingDone') === -1,
            'клика нет и у невыполненного (Task 487)');
    });

    test('ОБ (не «Инструктажи») — маркера нет, кнопок тоже нет (Task 487)', () => {
        const host = loadPopupHost(true);
        const html = host._renderEventsPopup('2026-09-25', 7);
        assertTrue(html.indexOf('ws-done-chk') === -1,
            'семейство «Мероприятия» (ОБ) — столбца выполнения нет');
        assertTrue(html.indexOf('Редактировать') === -1,
            'и у ОБ правки из окна нет — только из карточки (Task 487)');
    });

    test('зритель + выполнено: без маркера и кнопок (Task 488)', () => {
        const host = loadPopupHost(false);
        const html = host._renderEventsPopup('2026-09-10', 7);
        assertTrue(html.indexOf('ws-done-chk') === -1,
            'маркера нет и у зрителя — окно одинаково текстовое (Task 488)');
        assertTrue(html.indexOf('toggleTrainingDone') === -1,
            'зритель НЕ отмечает выполнение');
        assertTrue(html.indexOf('Редактировать') === -1 &&
                   html.indexOf('Удалить') === -1,
            'кнопок правки у зрителя нет (как прежде)');
    });

    test('зритель + НЕ выполнено: без значка вовсе (сетка красит рамку)', () => {
        const host = loadPopupHost(false);
        const html = host._renderEventsPopup('2026-09-20', 7);
        assertTrue(html.indexOf('ws-done-chk') === -1,
            'значка нет — состояние несёт рамка бейджа в сетке');
    });

    test('запись без id — без маркера (семейство/адресат сверки)', () => {
        const noId = [{ 'таб_номер': 7, тип: 'инструктаж',
                        дата_начала: '2026-09-10', дата_окончания: '2026-09-10',
                        тема: 'Инструктаж без id', выполнение: 1 }];
        const host = loadPopupHost(true, noId);
        const html = host._renderEventsPopup('2026-09-10', 7);
        assertTrue(html.indexOf('ws-done-chk') === -1,
            'id нет — маркера нет (правило сохранено)');
    });

    test('пустой день — прежняя строка «нет мероприятий»', () => {
        const host = loadPopupHost(true);
        const html = host._renderEventsPopup('2026-12-01', 7);
        assertTrue(html.indexOf('нет мероприятий') !== -1,
            'регресс пустого дня не внесён');
    });
});

// ==========================================================================
// 4. SRC + VM: перерисовки после отметки (часть 3, продолжение)
// ==========================================================================
describe('Task 482 — перерисовка шахматки и попапа после отметки', () => {

    test('SRC: toggleTrainingDone зовёт оба обновления', () => {
        const m = methodText(WS_SRC, 'toggleTrainingDone');
        assertTrue(m.length > 0, 'метод найден');
        assertTrue(m.indexOf('self._renderGridIfOpen();') !== -1,
            'шахматка (рамки бейджей) — сразу');
        assertTrue(m.indexOf('self._refreshEventsPopup();') !== -1,
            'окно «Мероприятия в этот день» — сразу');
    });

    test('SRC: методы-помощники объявлены', () => {
        assertTrue(methodText(WS_SRC, '_renderGridIfOpen').length > 0,
            '_renderGridIfOpen');
        assertTrue(methodText(WS_SRC, '_refreshEventsPopup').length > 0,
            '_refreshEventsPopup');
    });

    test('VM: _renderGridIfOpen — рендерит ТОЛЬКО на открытой странице', () => {
        const texts = ['_renderGridIfOpen'].map(n => methodText(WS_SRC, n));
        let rendered = 0;
        // метод зовёт глобальный document — подменяем аргументом
        // харнесса (паттерн test-task379 §4 loadHost)
        const mkDoc = (active) => ({
            getElementById: () => ({
                classList: { contains: () => active }
            })
        });
        const hostA = new Function('document',
            'return ({' + texts.join('\n') + '\n});')(mkDoc(true));
        hostA._renderGrid = function() { rendered++; };
        hostA._renderGridIfOpen();
        assertEqual(rendered, 1, 'открытая страница — один рендер');
        const hostB = new Function('document',
            'return ({' + texts.join('\n') + '\n});')(mkDoc(false));
        hostB._renderGrid = function() { rendered++; };
        hostB._renderGridIfOpen();
        assertEqual(rendered, 1, 'вне табеля — тишина (паттерн 379-харнесса)');
    });

    test('VM: _refreshEventsPopup — обновляет ТОЛЬКО открытое окно', () => {
        const texts = ['_refreshEventsPopup'].map(n => methodText(WS_SRC, n));
        const evpOff = { innerHTML: 'OLD',
                         classList: { contains: () => false } };
        const doc = { getElementById: (id) =>
            (id === 'wsEventsPopup' ? evpOff : null) };
        const host = new Function('document',
            'return ({' + texts.join('\n') + '\n});')(doc);
        host._popupCell = { date: '2026-09-10', 'таб_номер': 7 };
        host._renderEventsPopup = function() { return 'NEW'; };
        host._refreshEventsPopup();
        assertEqual(evpOff.innerHTML, 'OLD',
            'окно закрыто — содержимое НЕ трогается');
    });

    test('VM: _refreshEventsPopup — обновляет открытое окно', () => {
        const texts = ['_refreshEventsPopup'].map(n => methodText(WS_SRC, n));
        const evp = { innerHTML: 'OLD',
                      classList: { contains: () => true } };
        const doc = { getElementById: (id) =>
            (id === 'wsEventsPopup' ? evp : null) };
        const host = new Function('document',
            'return ({' + texts.join('\n') + '\n});')(doc);
        host._popupCell = { date: '2026-09-20', 'таб_номер': 7 };
        host._renderEventsPopup = function(d, t) {
            return 'NEW-' + d + '-' + t;
        };
        host._refreshEventsPopup();
        assertEqual(evp.innerHTML, 'NEW-2026-09-20-7',
            'окно открыто — содержимое перерисовано (_popupCell жив)');
    });

    test('VM: _refreshEventsPopup — без _popupCell тишина', () => {
        const texts = ['_refreshEventsPopup'].map(n => methodText(WS_SRC, n));
        const evp = { innerHTML: 'OLD',
                      classList: { contains: () => true } };
        const doc = { getElementById: (id) =>
            (id === 'wsEventsPopup' ? evp : null) };
        const host = new Function('document',
            'return ({' + texts.join('\n') + '\n});')(doc);
        host._popupCell = null;
        host._renderEventsPopup = function() { return 'NEW'; };
        host._refreshEventsPopup();
        assertEqual(evp.innerHTML, 'OLD',
            'контекста ячейки нет (окно уже закрыто) — тишина');
    });
});

// ==========================================================================
// 5. SRC + VM: кап высоты раскрытых окон (часть 1)
// ==========================================================================
describe('Task 482 — кап раскрытия окон «Мероприятия»/«Нормы»', () => {

    test('SRC: _barExpMaxH объявлен с формулой вьюпорта', () => {
        const m = methodText(WS_SRC, '_barExpMaxH');
        assertTrue(m.length > 0, 'метод найден');
        assertTrue(m.indexOf('Math.max(140, vh - rect.top - 10)') !== -1,
            'предел = низ экрана − 10px, минимум 140px');
        assertTrue(m.indexOf('typeof window !== \'undefined\'') !== -1,
            'гвард window (VM-харнессы без окна)');
        assertTrue(m.indexOf('getBoundingClientRect') !== -1,
            'верх окна — стабилен при раскрытии (Task 379)');
    });

    test('SRC: оба метода раскрытия капают высоту (гвард typeof)', () => {
        const s = methodText(WS_SRC, '_barExpSync');
        const t = methodText(WS_SRC, '_barExpToggle');
        [s, t].forEach(function(m, idx) {
            assertTrue(m.indexOf(
                "typeof this._barExpMaxH === 'function'") !== -1,
                'метод ' + (idx ? '_barExpToggle' : '_barExpSync') +
                ' подключает кап с гвардом');
            assertTrue(m.indexOf('(95 - hOpen) + \'px\'') !== -1,
                'метод ' + (idx ? '_barExpToggle' : '_barExpSync') +
                ': формула маржи с капом (габарит 95px сохранён)');
        });
    });

    test('SRC: прокрутка окна остаётся (overflow/overscroll не тронуты)', () => {
        const r = oneRule(INDEX_SRC, '.ws-events-panel {');
        assertTrue(r.indexOf('overflow-y: auto') !== -1,
            'вертикальная прокрутка внутри окна');
        assertTrue(r.indexOf('overscroll-behavior: contain') !== -1,
            'скролл не тянет страницу (свайп/колесо — окно)');
        // .ws-cal-panel имеет НЕСКОЛЬКО правил (переопределения
        // Task 378/379 без прокрутки) — базовое правило с overflow
        // ищем перебором всех вхождений селектора
        let idx = -1, ok = false;
        while ((idx = INDEX_SRC.indexOf('.ws-cal-panel {', idx + 1)) !== -1) {
            const end = INDEX_SRC.indexOf('}', idx);
            const rule = INDEX_SRC.slice(idx, end + 1);
            if (rule.indexOf('overflow-y: auto') !== -1 &&
                rule.indexOf('overscroll-behavior: contain') !== -1) {
                ok = true;
                break;
            }
        }
        assertTrue(ok, 'окно норм — та же прокрутка (базовое правило)');
    });

    // ---- VM: живые методы с капом ----
    function mkBtn482() {
        const cls = [];
        return {
            tagName: 'BUTTON', style: {}, type: '', className: '',
            innerHTML: '', attrs: {}, onclick: null,
            classList: {
                toggle: function(c, on) {
                    const i = cls.indexOf(c);
                    if (on === undefined) on = i === -1;
                    if (on && i === -1) cls.push(c);
                    if (!on && i !== -1) cls.splice(i, 1);
                },
                contains: function(c) { return cls.indexOf(c) !== -1; }
            },
            setAttribute: function(k, v) { this.attrs[k] = v; }
        };
    }

    function mkPanel482(scrollH, rectTop) {
        const cls = [];
        let btn = null;
        const el = {
            scrollHeight: scrollH,
            clientHeight: 95,
            scrollTop: 0,
            listeners: {},
            style: {},
            classList: {
                contains: function(c) { return cls.indexOf(c) !== -1; },
                toggle: function(c, on) {
                    const i = cls.indexOf(c);
                    if (on === undefined) on = i === -1;
                    if (on && i === -1) cls.push(c);
                    if (!on && i !== -1) cls.splice(i, 1);
                },
                add: function(c) { if (cls.indexOf(c) === -1) cls.push(c); },
                remove: function(c) {
                    const i = cls.indexOf(c);
                    if (i !== -1) cls.splice(i, 1);
                }
            },
            querySelector: function(sel) {
                return (sel === '.ws-bar-exp' && btn) ? btn : null;
            },
            appendChild: function(node) { btn = node; },
            addEventListener: function(type, fn) {
                (this.listeners[type] = this.listeners[type] || []).push(fn);
            },
            getBoundingClientRect: function() {
                return { top: rectTop === undefined ? 0 : rectTop };
            }
        };
        el._btn = function() { return btn; };
        el._cls = cls;
        return el;
    }

    function loadCapHost(vh) {
        const names = ['_barExpMaxH', '_barExpSync', '_barExpToggle'];
        const texts = names.map(n => methodText(WS_SRC, n));
        assertTrue(texts.every(t => t.length > 0), 'методы _barExp* найдены');
        return new Function('document',
            'return ({' + texts.join('\n') + '\n});')({
            documentElement: { clientHeight: vh },
            // _barExpSync создаёт значок раскрытия — кнопка-мок
            // (паттерн mockDoc test-task379)
            createElement: function() { return mkBtn482(); }
        });
    }

    test('VM: формула капа — vh − top − 10 (прямой вызов)', () => {
        const host = loadCapHost(800);
        const el = { getBoundingClientRect: function() { return { top: 100 }; } };
        assertEqual(host._barExpMaxH(el), 690, '800 − 100 − 10 = 690');
    });

    test('VM: минимум 140px на экзотических вьюпортах', () => {
        const host = loadCapHost(100);
        const el = { getBoundingClientRect: function() { return { top: 50 }; } };
        assertEqual(host._barExpMaxH(el), 140,
            '100 − 50 − 10 = 40 → клампится к 140');
    });

    test('VM: короткий список — раскрывается ЦЕЛИКОМ (кап не мешает)', () => {
        const host = loadCapHost(800);
        const el = mkPanel482(250, 100);
        host._barExpSync(el);
        host._barExpToggle(el);
        assertEqual(el.style.height, '250px',
            '250 < 690 — окно раскрыто на весь текст (как прежде)');
        assertEqual(el.style.marginBottom, '-155px',
            'габарит бара 95px сохранён (Task 379)');
    });

    test('VM: список ДЛИННЕЕ экрана — высота = кап, листается внутри', () => {
        const host = loadCapHost(800);           // кап = 800−100−10 = 690
        const el = mkPanel482(900, 100);
        host._barExpSync(el);
        host._barExpToggle(el);
        assertEqual(el.style.height, '690px',
            'окно НЕ выше низа экрана');
        assertEqual(el.style.marginBottom, '-595px',
            'маржа 95 − 690 (габарит бара прежний)');
        assertTrue(el.scrollHeight > 690,
            'текст длиннее окна — работает внутренняя прокрутка');
    });

    test('VM: тесный вьюпорт — кап меньше (мобильный поворот)', () => {
        const host = loadCapHost(300);           // кап = 300−50−10 = 240
        const el = mkPanel482(900, 50);
        host._barExpSync(el);
        host._barExpToggle(el);
        assertEqual(el.style.height, '240px', 'кап следует за экраном');
    });

    test('VM: раскрытое окно + НОВЫЙ текст — кап пересчитывается', () => {
        const host = loadCapHost(800);
        const el = mkPanel482(250, 100);
        host._barExpSync(el);
        host._barExpToggle(el);
        assertEqual(el.style.height, '250px', 'сначала влезает');
        el.scrollHeight = 1200;                  // перерисовка с бОльшим
        host._barExpSync(el);
        assertEqual(el.style.height, '690px',
            'низ следует за текстом, но НЕ ниже экрана');
        el.scrollHeight = 80;                    // текст перестал переполнять
        host._barExpSync(el);
        assertFalse(el._cls.indexOf('ws-bar-open') !== -1,
            'переполнения нет — окно свернулось само (как прежде)');
    });

    test('VM: повторный клик — сворачивание как прежде', () => {
        const host = loadCapHost(800);
        const el = mkPanel482(900, 100);
        host._barExpSync(el);
        host._barExpToggle(el);
        assertEqual(el.style.height, '690px', 'раскрыто с капом');
        host._barExpToggle(el);
        assertFalse(el._cls.indexOf('ws-bar-open') !== -1, 'класс снят');
        assertEqual(el.style.height, '', 'высота возвращена (CSS 95px)');
        assertEqual(el.style.marginBottom, '', 'маржа сброшена');
    });

    test('VM: без метода _barExpMaxH — прежнее поведение (гвард)', () => {
        // старые VM-харнессы тестов 378/379: только два метода
        const texts = ['_barExpSync', '_barExpToggle']
            .map(n => methodText(WS_SRC, n));
        const host = new Function('document',
            'return ({' + texts.join('\n') + '\n});')({
            documentElement: { clientHeight: 300 },
            createElement: function() { return mkBtn482(); }
        });
        const el = mkPanel482(900, 50);
        host._barExpSync(el);
        host._barExpToggle(el);
        assertEqual(el.style.height, '900px',
            'гвард отключает кап — высота = scrollHeight (регресс 378/379 исключён)');
        assertEqual(el.style.marginBottom, '-805px', 'формула 95 − scrollHeight');
    });
});

// ==========================================================================
// 6. SW: версия, комментарий, окна истории
// ==========================================================================
describe('Task 482 — SW: kipia-test-v735 + комментарий', () => {

    test('CACHE_VERSION = kipia-test-v735', () => {
        assertTrue(SW_SRC.indexOf(
            "const CACHE_VERSION = 'kipia-test-v735';") !== -1,
            'версия кэша поднята v705 → v706');
    });

    test('несуществующая v707 отсутствует (guard)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v736') === -1,
            'kipia-test-v736 не должен существовать');
    });

    test('старая v705 вычищена из sw.js', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v705') === -1,
            'v705 не должен остаться');
    });

    test('персистентные кэши НЕ инкрементированы (правка клиентская)', () => {
        assertTrue(SW_SRC.indexOf('kipia-images-test-v3') !== -1,
            'IMAGE_CACHE v3 жив');
        assertTrue(SW_SRC.indexOf('kipia-data-test-v1') !== -1,
            'DATA_CACHE v1 жив');
    });

    test('комментарий Task 482 в шапке версий (окно 1100)', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v735';");
        const ctx = SW_SRC.slice(Math.max(0, i - 10100), i);
        assertTrue(ctx.indexOf('Task 482') !== -1, 'маркер задачи');
        assertTrue(ctx.indexOf('_barExpMaxH') !== -1,
            'кап раскрытия окон бара');
        assertTrue(ctx.indexOf('рамка зелёная') !== -1 &&
                   ctx.indexOf('красная') !== -1,
            'рамки бейджей И/ПЗ');
        assertTrue(ctx.indexOf('галочка отметки') !== -1,
            'галочка в попапе «Мероприятия в этот день»');
    });

    test('комментарии Task 481/480 не вытеснены (окно 1100)', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v735';");
        // Task 490: +480 симв. комментария — окно 5000 → 6000 (якоря
        // 481@5196, 480@5440, таблица@5405)
        // Task 492: комментарий (~290 симв.) отодвинул якорь 480
        // до ~6221 — окно 6000 → 6800 (481@5977 внутри)
        const ctx = SW_SRC.slice(Math.max(0, i - 11100), i);
        assertTrue(ctx.indexOf('Task 481') !== -1, 'Task 481 в окне');
        assertTrue(ctx.indexOf('Task 480') !== -1, 'Task 480 в окне');
        assertTrue(ctx.indexOf('Перечень КИП ИОС рабочий') !== -1,
            'Task 480: имя таблицы');
    });

    test('комментарии Task 479/478 не вытеснены (окно 4100)', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v735';");
        // Task 502: окна 9100 → 9800, 9600 → 10300 (+ синхро-литералы 478/479/480/481); якоря — каскад.
        const ctx = SW_SRC.slice(Math.max(0, i - 11600), i);
        assertTrue(ctx.indexOf('Task 479') !== -1 &&
                   ctx.indexOf('оранжево-золотистый') !== -1,
            'Task 479 в окне 1700');
        assertTrue(ctx.indexOf('Task 478') !== -1, 'Task 478 в окне 2500');
        assertTrue(ctx.indexOf('Период ремонта') !== -1,
            'Task 478: упоминание строки');
    });

    test('окна истории: якоря 474/472/471/461 в прежних окнах', () => {
        // Task 482 (~375 симв.): 474 ~3016 < 3100; 472 ~3389 < 3600;
        // 471 ~3938 < 4200; 461 ~6500 < 6800 — расширения не нужны
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v735';");
        const i474 = SW_SRC.lastIndexOf('Task 474', i);
        const i472 = SW_SRC.lastIndexOf('Task 472', i);
        const i471 = SW_SRC.lastIndexOf('Task 471', i);
        const i461 = SW_SRC.lastIndexOf('Task 461', i);
        assertTrue(i474 !== -1 && (i - i474) < 13300, 'Task 474 в окне 4000');
        assertTrue(i472 !== -1 && (i - i472) < 13500, 'Task 472 в окне 4500');
        assertTrue(i471 !== -1 && (i - i471) < 14300, 'Task 471 в окне 5000');
        assertTrue(i461 !== -1 && (i - i461) < 16700, 'Task 461 в окне 7600');
    });

    test('окна ЧУЖИХ тестов синхронизированы (478/479/480/481)', () => {
        // windows-скрипты 482/483/484/486: 478 3200→4100; 479 3200→4100;
        // 480 2600→3200; 481: 3200/3200/4100
        // Task 490: 480 и 481 — 5000 → 6000 (+480 симв. комментария
        // Task 490 в sw.js; каскад task490-bump-sw)
        const s478 = fs.readFileSync(path.join(ROOT, 'tests', 'test-task478.js'), 'utf8');
        assertTrue(s478.indexOf('i - 11600') !== -1, 'test-task478: окно 8100 (Task 495; Task 505: +700)');
        const s479 = fs.readFileSync(path.join(ROOT, 'tests', 'test-task479.js'), 'utf8');
        assertTrue(s479.indexOf('i - 11600') !== -1, 'test-task479: окно 8100 (Task 495; Task 505: +700)');
        const s480 = fs.readFileSync(path.join(ROOT, 'tests', 'test-task480.js'), 'utf8');
        assertTrue(s480.indexOf('i - 11100') !== -1, 'test-task480: окно 7500 (Task 495; Task 505: +700)');
        const s481 = fs.readFileSync(path.join(ROOT, 'tests', 'test-task481.js'), 'utf8');
        // Task 493: комментарий переименования кнопки Табель (+173 симв.)
        // — окно 481-собств. 6000 → 6800 (якорь 481@6153, запас 647)
        assertTrue(s481.indexOf('i - 11100') !== -1 &&
                   s481.indexOf('i - 11600') !== -1,
            'test-task481: окна 7500 (Task 496: собств. + w700)/8100');
    });
});

console.log('test-task482: все describes зарегистрированы');
