// tests/test-task465.js
// Task 465 — заявка пользователя: «В разделе Табель учёта рабочего
// времени, в окнах мероприятий и норм, значки "развернуть окно"
// сместить на расстояние от краёв окон на 3px сверху и справа. В
// окне мероприятий, справа от значка раскрытия окна сделай новый
// значок с иконкой принтера, форма кнопки квадратная и размером
// как кнопка раскрытия окна, при нажатии на эту кнопку должно
// появляться диалоговое окно печати и сохранения в форматах
// файлов, так же как в окне кнопки печати графика, с
// предпросмотром списка мероприятий, для дальнейшей печати или
// сохранения в файл списка мероприятий на текущий месяц.»
//
// РЕШЕНИЕ:
//   клиент (index.html): значки .ws-bar-exp — top/right 5→2px
//   (2px CSS + 1px рамка окна = 3px от внешнего края; в окне
//   мероприятий — сброс margin-top: 3px от правила Task 381
//   «склейка строк», из-за него значок висел НИЖЕ, чем в окне
//   норм); НОВЫЙ значок .ws-bar-print в окне мероприятий —
//   слева от раскрытия (Task 466: значки ПОМЕНЯНЫ МЕСТАМИ —
//   раскрытие в самом углу; 22×22, стиль пары),
//   создаёт _barExpSync (только #wsEventsPanel), клик →
//   printEventsList; печать списка открытого месяца: модель
//   _eventsListModel (та же выборка, что окно «Мероприятия»,
//   без фильтра дня, фильтр мастеров для min) → лист
//   #wsPrintSheet.wsev-sheet + инжект #wsEventsPrintStyle
//   (@page A4 portrait, приём талонов) → диалог wsEventsPrevModal
//   («Печать»/«Сохранить PDF»/«Сохранить Excel»/«Отмена»,
//   «A4 · книжная», предпросмотр iframe 190мм); генераторы:
//   _eventsPdfLayout/_eventsPdfPaintPage (canvas×2, 595×842) +
//   _buildEventsWorkbook/_eventsSheetXml/_eventsStylesXml (xlsx
//   «Мероприятия»); диалоги печати взаимоисключающие (график ↔
//   талоны ↔ список мероприятий);
//   SW: kipia-test-v749.
//
// Запуск: через tests/run-all.js (require './test-task465.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function extractMethod(src, name) {
    const start = src.indexOf(name + ': function(');
    if (start === -1) return null;
    const braceStart = src.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    return null;
}

function methodText(src, name) {
    const m = extractMethod(src, name);
    return m ? String(m) : '';
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function ruleBlock(sel) {
    const i = INDEX_SRC.indexOf(sel);
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('}', i);
    return (j === -1) ? null : INDEX_SRC.slice(i, j + 1);
}

// ============================================================
// 1. SRC — CSS: геометрия значков 3px + значок печати
// ============================================================
describe('Task 465 — SRC: CSS значков окон бара', () => {

    test('.ws-bar-exp: top/right 2px (3px от края окна с рамкой)', () => {
        const b = ruleBlock('.ws-bar-exp {');
        assertTrue(b !== null && /right:\s*2px/.test(b) && /top:\s*2px/.test(b),
            'упор 2px + 1px рамка окна = 3px от края (было 5px)');
        assertFalse(b !== null && /right:\s*5px/.test(b), 'прежних 5px нет');
    });

    test('окно мероприятий (Task 466): печать сдвинута ВЛЕВО (27px), раскрытие в углу', () => {
        const b = ruleBlock('#wsEventsPanel .ws-bar-print { right: 27px; }');
        assertTrue(b !== null, '#wsEventsPanel .ws-bar-print { right: 27px } — пара значков');
        assertTrue(INDEX_SRC.indexOf('#wsEventsPanel .ws-bar-exp { right: 27px; }') === -1,
            'Task 466: прежний сдвиг раскрытия УБРАН — раскрытие в самом углу');
        const p = ruleBlock('.ws-bar-print {\n');
        assertTrue(p !== null && /right:\s*2px/.test(p) && /top:\s*2px/.test(p),
            'база .ws-bar-print — 2px (в окне мероприятий перекрыта 27px)');
    });

    test('.ws-bar-print: квадрат 22×22, стиль пары раскрытию', () => {
        const p = ruleBlock('.ws-bar-print {\n');
        assertTrue(p !== null && /width:\s*22px/.test(p) && /height:\s*22px/.test(p),
            'квадратная кнопка размером с раскрытие');
        assertTrue(p !== null && /border-radius:\s*3px/.test(p) &&
                   /opacity:\s*0\.45/.test(p),
            'рамка/радиус/приглушение — как у .ws-bar-exp');
        const hov = INDEX_SRC.match(/\.ws-bar-print:hover,\s*\n\s*\.ws-bar-print:focus-visible\s*\{[^}]*opacity:\s*1[^}]*\}/);
        assertTrue(!!hov, 'наведение/фокус — полная контрастность');
        const light = INDEX_SRC.indexOf('[data-theme="light"] .ws-bar-print { color: #222; }') !== -1;
        assertTrue(light, 'светлая тема — тёмная иконка');
    });

    test('сброс margin-top у значков окна мероприятий (правило склейки Task 381)', () => {
        const i = INDEX_SRC.indexOf('.ws-events-panel > .ws-bar-exp,');
        assertTrue(i !== -1, 'правило сброса маржи на месте');
        const j = INDEX_SRC.indexOf('}', i);
        const rule = INDEX_SRC.slice(i, j + 1);
        assertTrue(rule.indexOf('.ws-events-panel > .ws-bar-print') !== -1 &&
                   rule.indexOf('margin-top: 0') !== -1,
            'оба значка — margin-top: 0 (иначе 3px от > * + *)');
    });

    test('заголовок окна мероприятий: паддинг 52px (пара значков)', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-events-panel .ws-ep-cap { padding-right: 52px; }') !== -1,
            '52px под пару [раскрытие][печать]');
        assertTrue(INDEX_SRC.indexOf('.ws-cal-panel .ws-cp-cap { padding-right: 26px; }') !== -1,
            'окно норм — прежние 26px');
    });
});

// ============================================================
// 2. SRC — _barExpSync: значок печати в окне мероприятий
// ============================================================
describe('Task 465 — SRC: _barExpSync — значок печати', () => {

    test('создание .ws-bar-print — ТОЛЬКО в окне мероприятий', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_barExpSync'));
        assertTrue(fn.indexOf("el.id === 'wsEventsPanel'") !== -1,
            'условие создания — id окна мероприятий');
        assertTrue(fn.indexOf("className = 'ws-bar-print'") !== -1,
            'класс .ws-bar-print');
        assertTrue(fn.indexOf("'Печать списка мероприятий'") !== -1,
            'aria-label значка');
        assertTrue(fn.indexOf('printEventsList') !== -1,
            'клик — печать списка');
    });

    test('иконка принтера — та же, что у кнопки «Печать» графика', () => {
        const fn = methodText(INDEX_SRC, '_barExpSync');
        const m = fn.match(/M19 8H5c-1\.66 0-3 1\.34-3 3v6h4v4h12v-4h4v-6c0-1\.66-1\.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-\.55 0-1-\.45-1-1s\.45-1 1-1 1 \.45 1 1-\.45 1-1 1zm-1-9H6v4h12V6z/);
        assertTrue(!!m, 'Material-иконка принтера (path кнопки wsPrintBtn)');
    });

    test('прикол прокрутки — на ОБОИХ значках', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_barExpSync'));
        assertTrue(fn.indexOf("el.querySelector('.ws-bar-print')") !== -1,
            'слушатель scroll двигает и печать');
        assertTrue(fn.indexOf("if (prn) prn.style.transform = tNow") !== -1,
            'transform ставится обоим значкам при sync');
    });
});

// ============================================================
// 3. SRC — печать списка: вход + модель + HTML листа
// ============================================================
describe('Task 465 — SRC: printEventsList + модель + HTML', () => {

    test('printEventsList: защита доступа + пустой месяц', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'printEventsList'));
        assertTrue(fn.indexOf('this._viewLevel === null') !== -1,
            'раздел скрыт — программный вызов не работает');
        assertTrue(fn.indexOf('Нет мероприятий для печати — месяц пуст') !== -1,
            'тост пустого месяца');
        assertTrue(fn.indexOf("className = 'wsev-sheet'") !== -1,
            'лист #wsPrintSheet получает класс wsev-sheet');
    });

    test('printEventsList: инжект + диалог + фолбэк', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'printEventsList'));
        assertTrue(fn.indexOf('_eventsInjectPrintStyle') !== -1,
            'инжект книжной @page');
        assertTrue(fn.indexOf('_openEventsPreview') !== -1,
            'диалог предпросмотра');
        assertTrue(fn.indexOf('window.print()') !== -1,
            'фолбэк — печать сразу');
    });

    test('_eventsListModel: та же выборка окна, без фильтра дня', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_eventsListModel'));
        assertTrue(fn.indexOf('mStart') !== -1 && fn.indexOf('mEnd') !== -1,
            'границы открытого месяца');
        assertFalse(fn.indexOf('_selDay') !== -1,
            'фильтра выбранного дня НЕТ (печать полного месяца)');
        assertTrue(fn.indexOf("_viewLevel === 'min'") !== -1 &&
                   fn.indexOf('_isMasterKipia') !== -1,
            'уровень min — записи мастеров скрыты (Task 399)');
        assertTrue(fn.indexOf("'До износа'") !== -1,
            'СИЗ «До износа» не попадают (как в окне)');
        assertTrue(fn.indexOf('_instrShortOf') !== -1,
            'короткие названия инструктажей (Task 416)');
    });

    test('_buildEventsPrintHtml: таблица + СИЗ + заглушка', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_buildEventsPrintHtml'));
        ['№', 'Даты', 'Мероприятие', 'Работник'].forEach(function(h) {
            assertTrue(fn.indexOf(">" + h + "</th>") !== -1, 'колонка ' + h);
        });
        assertTrue(fn.indexOf('нет мероприятий в этом месяце') !== -1,
            'строка-заглушка пустого списка');
        assertTrue(fn.indexOf('wsev-cap') !== -1 &&
                   fn.indexOf('Наименование СИЗ') !== -1,
            'секция СИЗ (пустая — не пишется)');
        assertTrue(fn.indexOf('wsev-dot') !== -1, 'точки цвета кодов');
    });

    test('_EVENTS_PRINT_CSS: книжный лист wsev-*', () => {
        const i = INDEX_SRC.indexOf('_EVENTS_PRINT_CSS:');
        assertTrue(i !== -1, 'блок CSS листа определён');
        const j = INDEX_SRC.indexOf('_eventsInjectPrintStyle: function', i);
        const css = (j === -1) ? '' : INDEX_SRC.slice(i, j);
        assertTrue(css.indexOf('#wsPrintSheet.wsev-sheet') !== -1,
            'селекторы листа wsev-sheet');
        assertTrue(css.indexOf('wsev-c-n') !== -1 && css.indexOf('wsev-c-d') !== -1,
            'фиксированные ширины колонок №/Даты');
        assertTrue(css.indexOf('table-header-group') !== -1,
            'повтор шапки на страницах печати');
    });

    test('инжект @page книжной ориентации (приём талонов)', () => {
        const inj = stripComments(methodText(INDEX_SRC, '_eventsInjectPrintStyle'));
        assertTrue(inj.indexOf("id = 'wsEventsPrintStyle'") !== -1,
            'id инжект-стиля');
        assertTrue(inj.indexOf('size: A4 portrait') !== -1,
            '@page книжная');
        const rm = stripComments(methodText(INDEX_SRC, '_eventsRemovePrintStyle'));
        assertTrue(rm.indexOf("getElementById('wsEventsPrintStyle')") !== -1,
            'снятие инжекта при закрытии');
    });
});

// ============================================================
// 4. SRC — диалог предпросмотра + взаимоисключение
// ============================================================
describe('Task 465 — SRC: диалог предпросмотра списка', () => {

    test('_openEventsPreview: каркас диалога wspprev-*', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_openEventsPreview'));
        assertTrue(fn.indexOf("id = 'wsEventsPrevModal'") !== -1,
            'id оверлея wsEventsPrevModal');
        assertTrue(fn.indexOf('Предпросмотр') !== -1 &&
                   fn.indexOf('Мероприятия — ') !== -1,
            'шапка «Предпросмотр печати / Мероприятия — месяц год»');
        assertTrue(fn.indexOf('wspprev-frame') !== -1,
            'iframe предпросмотра');
    });

    test('кнопочный ряд как у печати графика (Task 438)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_openEventsPreview'));
        ['wspprev-print', 'wspprev-pdf', 'wspprev-xlsx', 'wspprev-cancel'].forEach(function(cls) {
            assertTrue(fn.indexOf(cls) !== -1, 'кнопка ' + cls);
        });
        assertTrue(fn.indexOf('Сохранить PDF') !== -1 &&
                   fn.indexOf('Сохранить Excel') !== -1,
            'подписи кнопок сохранения');
        assertTrue(fn.indexOf('A4 · книжная') !== -1, 'подсказка формата');
    });

    test('содержимое iframe — standalone-документ листа', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_openEventsPreview'));
        assertTrue(fn.indexOf('_buildEventsFileHtml') !== -1,
            'srcdoc из _buildEventsFileHtml');
        const fh = stripComments(methodText(INDEX_SRC, '_buildEventsFileHtml'));
        assertTrue(fh.indexOf('size: A4 portrait; margin: 12mm 10mm') !== -1,
            '@page standalone-документа');
        assertTrue(fh.indexOf('width: 190mm') !== -1, 'книжный лист 190мм');
        assertTrue(fh.indexOf('class="wsev-sheet"') !== -1,
            'лист с классом wsev-sheet');
    });

    test('закрытие: Esc/затемнение/Отмена + снятие инжекта', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_closeEventsPreview'));
        assertTrue(fn.indexOf("getElementById('wsEventsPrevModal')") !== -1,
            'удаление оверлея');
        assertTrue(fn.indexOf('_eventsRemovePrintStyle') !== -1,
            'снятие инжект-стиля');
        const op = stripComments(methodText(INDEX_SRC, '_openEventsPreview'));
        assertTrue(op.indexOf("'Escape'") !== -1, 'Esc закрывает');
        assertTrue(op.indexOf('ev.target === overlay') !== -1,
            'клик по затемнению закрывает');
    });

    test('диалоги печати взаимоисключающие (график/талоны/список)', () => {
        const g = stripComments(methodText(INDEX_SRC, '_openPrintPreview'));
        assertTrue(g.indexOf('_closeEventsPreview') !== -1,
            'печать графика закрывает список мероприятий');
        const t = stripComments(methodText(INDEX_SRC, '_openTalonsPreview'));
        assertTrue(t.indexOf('_closeEventsPreview') !== -1,
            'талоны закрывают список мероприятий');
        const e = stripComments(methodText(INDEX_SRC, '_openEventsPreview'));
        assertTrue(e.indexOf('_closePrintPreview') !== -1 &&
                   e.indexOf('_closeTalonsPreview') !== -1,
            'список мероприятий закрывает график и талоны');
    });
});

// ============================================================
// 5. SRC — генераторы PDF/Excel
// ============================================================
describe('Task 465 — SRC: генераторы выгрузок', () => {

    test('_saveEventsPdf: имя файла + тосты', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_saveEventsPdf'));
        assertTrue(fn.indexOf("'Мероприятия_' + months[mIdx - 1] + '_'") !== -1,
            'имя «Мероприятия_‹Месяц›_‹год›.pdf»');
        assertTrue(fn.indexOf('_eventsPdfLayout') !== -1 &&
                   fn.indexOf('_eventsPdfPaintPage') !== -1 &&
                   fn.indexOf('_buildPdfDocument') !== -1,
            'цепочка раскладка → отрисовка → PDF (переиспользование Task 438)');
        assertTrue(fn.indexOf('Не удалось сохранить PDF списка мероприятий') !== -1,
            'тост ошибки');
    });

    test('_saveEventsXlsx + книга «Мероприятия»', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_saveEventsXlsx'));
        assertTrue(fn.indexOf('_buildEventsWorkbook') !== -1,
            'сборка книги');
        const wb = stripComments(methodText(INDEX_SRC, '_buildEventsWorkbook'));
        assertTrue(wb.indexOf('<sheet name="Мероприятия"') !== -1,
            'лист «Мероприятия»');
        assertTrue(wb.indexOf("'Мероприятия_' + months[mIdx - 1] + '_'") !== -1,
            'имя файла .xlsx');
        assertTrue(wb.indexOf('widths: [5, 14, 64, 36]') !== -1,
            'ширины колонок');
    });

    test('_eventsSheetXml: без закрепления панели', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_eventsSheetXml'));
        assertTrue(fn.indexOf('sheetData') !== -1, 'лист с данными');
        assertFalse(fn.indexOf('pane ') !== -1, 'нет pane (клон без закрепления)');
        assertFalse(fn.indexOf('xSplit') !== -1, 'нет xSplit');
    });

    test('_eventsStylesXml: карта стилей книги', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_eventsStylesXml'));
        assertTrue(fn.indexOf('fonts count="4"') !== -1, '4 шрифта');
        assertTrue(fn.indexOf('FF4472C4') !== -1, 'синяя шапка таблицы');
        assertTrue(fn.indexOf('cellXfs count="8"') !== -1, '8 стилей ячеек');
    });
});

// ============================================================
// 6. VM — модель списка месяца
// ============================================================
describe('Task 465 — VM: _eventsListModel', () => {

    const host = (function() {
        const src = methodText(INDEX_SRC, '_eventsListModel');
        return new Function('return ({' + src + '\n});')();
    })();

    function fakeThis() {
        return {
            _year: 2026, _month: 10, _viewLevel: 'edit',
            _EMPLOYEES: [
                {'таб_номер': '017', 'ФИО': 'Иванов Иван Иванович'},
                {'таб_номер': '023', 'ФИО': 'Мастер Кипиа М.'}
            ],
            _TRAININGS: [
                {'id': 1, 'тема': 'Вне месяца', 'тип': 'инструктаж',
                 'дата_начала': '2026-08-15', 'дата_окончания': '2026-08-20',
                 'таб_номер': '017'},
                {'id': 2, 'тема': 'Внутри месяца', 'тип': 'обучение',
                 'дата_начала': '2026-10-05', 'дата_окончания': '2026-10-08',
                 'таб_номер': '017'},
                {'id': 3, 'тема': 'Накрывает конец месяца', 'тип': 'инструктаж',
                 'дата_начала': '2026-09-28', 'дата_окончания': '2026-10-02',
                 'таб_номер': '023'},
                {'id': 4, 'тема': 'Накрывает следующий', 'тип': 'инструктаж',
                 'дата_начала': '2026-10-30', 'дата_окончания': '2026-11-03',
                 'таб_номер': '017'}
            ],
            _PPE: [
                {'таб_номер': '017', 'наименование': 'Каска защитная',
                 'дата_окончания': '2026-10-15'},
                {'таб_номер': '023', 'наименование': 'Перчатки',
                 'дата_окончания': '2026-10-20'},
                {'таб_номер': '017', 'наименование': 'Ремень',
                 'дата_окончания': 'До износа'},
                {'таб_номер': '017', 'наименование': 'Очки',
                 'дата_окончания': '2026-12-01'}
            ],
            _isMasterKipia: function(emp) {
                return String(emp['ФИО'] || '').indexOf('Мастер') === 0;
            },
            _trainingCodeOf: function(tip) {
                return tip === 'обучение' ? 'ОУ' : 'И';
            },
            _statusMeta: function(code) {
                return (code === 'ОУ')
                    ? {name: 'Обучение', color: '#abc123'}
                    : {name: 'Инструктаж', color: '#4ac771'};
            },
            _instrShortOf: function(t) { return ''; }
        };
    }

    test('выборка месяца: 3 мероприятия (вход/накрытия), вне месяца нет', () => {
        const m = host._eventsListModel.call(fakeThis());
        assertEqual(3, m.events.length, 'три записи месяца');
        assertEqual('2026', String(m.y), 'год');
        assertEqual(10, m.m, 'месяц');
        assertEqual('октябрь', m.monthName, 'имя месяца (номинатив)');
        // сортировка по дате начала: 28.09, 05.10, 30.10
        assertEqual('28.09–02.10', m.events[0].range, 'первая — накрывающая начало');
        assertEqual('05–08.10', m.events[1].range, 'внутри месяца — короткий диапазон');
        assertEqual('30.10–03.11', m.events[2].range, 'накрывающая конец');
    });

    test('текст строки: код · название · цвет; ФИО отдельно', () => {
        const ft = fakeThis();
        // id4 — таб. номер БЕЗ записи в справочнике (фолбэк «таб. №…»)
        ft._TRAININGS[3]['таб_номер'] = '099';
        const m = host._eventsListModel.call(ft);
        assertEqual('ОУ · Обучение', m.events[1].name, 'код + название');
        assertEqual('#abc123', m.events[1].color, 'цвет кода из справочника');
        assertEqual('Иванов Иван Иванович', m.events[1].fio, 'ФИО работника');
        assertEqual('Мастер Кипиа М.', m.events[0].fio, 'ФИО мастера из справочника');
        assertEqual('таб. №099', m.events[2].fio, 'нет в справочнике — фолбэк таб. №');
    });

    test('СИЗ: истекающие в месяце, «До износа»/вне месяца — нет', () => {
        const m = host._eventsListModel.call(fakeThis());
        assertEqual(2, m.ppe.length, 'две записи СИЗ');
        assertEqual('до 15.10', m.ppe[0].range, 'сорт по дате: первая 15.10');
        assertEqual('до 20.10', m.ppe[1].range, 'вторая 20.10');
        assertEqual('#f0a830', m.ppe[0].color, 'янтарная точка СИЗ');
    });

    test('уровень min — записи мастеров скрыты (Task 399)', () => {
        const ft = fakeThis();
        ft._viewLevel = 'min';
        const m = host._eventsListModel.call(ft);
        assertEqual(2, m.events.length, 'запись мастера (таб. 023) скрыта');
        assertEqual(1, m.ppe.length, 'СИЗ мастера скрыты');
    });

    test('нет данных уровня null-модели: пустые массивы', () => {
        const ft = fakeThis();
        ft._TRAININGS = [];
        ft._PPE = [];
        const m = host._eventsListModel.call(ft);
        assertEqual(0, m.events.length, 'пусто');
        assertEqual(0, m.ppe.length, 'пусто');
    });
});

// ============================================================
// 7. VM — HTML печатного листа
// ============================================================
describe('Task 465 — VM: _buildEventsPrintHtml', () => {

    const host = (function() {
        const src = methodText(INDEX_SRC, '_buildEventsPrintHtml');
        return new Function('return ({' + src + '\n});')();
    })();
    const escHost = {
        _esc: function(s) {
            return String(s).replace(/&/g, '&amp;')
                .replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }
    };
    const model = {
        y: 2026, m: 10, monthName: 'октябрь',
        events: [
            {range: '05–08.10', name: 'ОУ · Обучение', fio: 'Иванов И. И.', color: '#abc123'}
        ],
        ppe: [
            {range: 'до 15.10', name: 'Каска защитная', fio: 'Иванов И. И.', color: '#f0a830'}
        ]
    };

    test('шапка + таблица мероприятий + секция СИЗ', () => {
        const html = host._buildEventsPrintHtml.call(escHost, model);
        assertTrue(html.indexOf('wsev-title') !== -1 &&
                   html.indexOf('Мероприятия') !== -1, 'заголовок листа');
        assertTrue(html.indexOf('октябрь 2026 г.') !== -1 &&
                   html.indexOf('записей: 1') !== -1, 'подзаголовок с счётчиком');
        assertTrue(html.indexOf('<th class="wsev-c-n">№</th>') !== -1, 'колонка №');
        assertTrue(html.indexOf('05–08.10') !== -1 &&
                   html.indexOf('Иванов И. И.') !== -1, 'строка данных');
        assertTrue(html.indexOf('wsev-cap') !== -1 &&
                   html.indexOf('СИЗ · октябрь 2026 · 1') !== -1,
            'заголовок секции СИЗ');
        assertTrue(html.indexOf('wsev-dot-ppe') !== -1, 'янтарная точка СИЗ');
        assertTrue(html.indexOf('background:#abc123') !== -1, 'точка цвета кода');
    });

    test('пустой список — строка-заглушка; пустые СИЗ — секции нет', () => {
        const m2 = {y: 2026, m: 10, monthName: 'октябрь', events: [], ppe: []};
        const html = host._buildEventsPrintHtml.call(escHost, m2);
        assertTrue(html.indexOf('нет мероприятий в этом месяце') !== -1,
            'заглушка пустого списка');
        assertTrue(html.indexOf('wsev-cap') === -1, 'секции СИЗ нет');
        assertTrue(html.indexOf('записей:') === -1, 'счётчик не пишется');
    });

    test('экранирование спецсимволов в данных', () => {
        const m3 = {
            y: 2026, m: 10, monthName: 'октябрь',
            events: [{range: '01.10', name: '<b>инъекция</b>',
                      fio: 'Ива&нов', color: '#fff'}],
            ppe: []
        };
        const html = host._buildEventsPrintHtml.call(escHost, m3);
        assertTrue(html.indexOf('<b>инъекция</b>') === -1,
            'HTML-теги экранированы');
        assertTrue(html.indexOf('&lt;b&gt;') !== -1, 'tag escaped');
        assertTrue(html.indexOf('Ива&amp;нов') !== -1, 'амперсанд экранирован');
    });
});

// ============================================================
// 8. VM — раскладка PDF
// ============================================================
describe('Task 465 — VM: _eventsPdfLayout', () => {

    const host = (function() {
        const src = methodText(INDEX_SRC, '_eventsPdfLayout');
        return new Function('return ({' + src + '\n});')();
    })();

    function mkModel(nEv, nPpe) {
        const events = [];
        for (let i = 0; i < nEv; i++) {
            events.push({range: '05–08.10', name: 'И · Мероприятие №' + (i + 1),
                         fio: 'Иванов Иван Иванович', color: '#4ac771'});
        }
        const ppe = [];
        for (let j = 0; j < nPpe; j++) {
            ppe.push({range: 'до 15.10', name: 'Каска защитная',
                      fio: 'Иванов Иван Иванович', color: '#f0a830'});
        }
        return {y: 2026, m: 10, monthName: 'октябрь', events: events, ppe: ppe};
    }

    test('книжный формат: 595×842, поля 28', () => {
        const lay = host._eventsPdfLayout.call(null, mkModel(3, 1));
        assertEqual(595, lay.W, 'ширина A4 портрет');
        assertEqual(842, lay.H, 'высота A4 портрет');
        assertEqual(28, lay.M, 'поля');
    });

    test('малый список — одна страница, шапка на первой', () => {
        const lay = host._eventsPdfLayout.call(null, mkModel(5, 2));
        assertEqual(1, lay.pages.length, 'одна страница');
        assertTrue(lay.pages[0].first, 'первая — с шапкой');
        assertEqual(5, lay.pages[0].ev.length, 'все строки мероприятий');
        assertEqual(2, lay.pages[0].ppe.rows.length, 'строки СИЗ на той же странице');
        assertTrue(lay.pages[0].ppe.cap, 'caption СИЗ на первой странице');
    });

    test('длинный список — перенос страниц + сквозная нумерация', () => {
        const lay = host._eventsPdfLayout.call(null, mkModel(70, 0));
        assertTrue(lay.pages.length >= 2, 'страниц несколько: ' + lay.pages.length);
        assertEqual(lay.pages[0].ev.length, lay.pages[1].evFirst,
            'evFirst второй страницы = числу строк первой (сквозная нумерация)');
        const total = lay.pages.reduce(function(s, pg) {
            return s + (pg.ev ? pg.ev.length : 0);
        }, 0);
        assertEqual(70, total, 'все 70 строк размещены');
        assertFalse(lay.pages[1].first, 'вторая — без шапки');
    });

    test('пустые мероприятия (только СИЗ) — заглушка в таблице', () => {
        const lay = host._eventsPdfLayout.call(null, mkModel(0, 2));
        assertEqual(1, lay.pages[0].ev.length, 'строка-заглушка');
        assertTrue(lay.pages[0].ev[0].src.none === true ||
                   lay.pages[0].ev[0].src['none'] === true, 'маркер none');
        assertEqual(2, lay.pages[0].ppe.rows.length, 'СИЗ на месте');
    });
});

// ============================================================
// 9. VM — книга Excel
// ============================================================
describe('Task 465 — VM: _buildEventsWorkbook', () => {

    const host = (function() {
        const names = ['_buildEventsWorkbook', '_eventsSheetXml', '_eventsStylesXml',
                      '_wsXlsColName', '_wsXlsEsc', '_wsXlsBytes', '_wsXlsZip', '_wsXlsCrc32',
                      '_wsXlsDocProps'];
        const texts = names.map(function(n) { return methodText(INDEX_SRC, n); });
        assertTrue(texts.every(function(t) { return t.length > 0; }),
            'методы книги найдены в исходнике');
        return new Function('return ({' + texts.join(',\n') + '});')();
    })();

    function zipText(bytes, wanted) {
        // zip STORE: локальные заголовки подряд
        const buf = Buffer.from(bytes);
        const out = {};
        let p = 0;
        while (p + 30 <= buf.length &&
               buf[p] === 0x50 && buf[p + 1] === 0x4b && buf[p + 2] === 0x03 && buf[p + 3] === 0x04) {
            const nameLen = buf.readUInt16LE(p + 26);
            const dataLen = buf.readUInt32LE(p + 18);
            const name = buf.slice(p + 30, p + 30 + nameLen).toString('utf8');
            const data = buf.slice(p + 30 + nameLen, p + 30 + nameLen + dataLen);
            out[name] = data.toString('utf8');
            p += 30 + nameLen + dataLen;
        }
        return out;
    }

    const model = {
        y: 2026, m: 10, monthName: 'октябрь',
        events: [
            {range: '05–08.10', name: 'ОУ · Обучение', fio: 'Иванов И. И.', color: '#abc123'},
            {range: '10.10', name: 'И · Инструктаж', fio: 'Петров П. П.', color: '#4ac771'}
        ],
        ppe: [
            {range: 'до 15.10', name: 'Каска защитная', fio: 'Иванов И. И.', color: '#f0a830'}
        ]
    };

    test('имя файла и счётчики', () => {
        const wb = host._buildEventsWorkbook.call(host, model);
        assertEqual('Мероприятия_Октябрь_2026.xlsx', wb.name, 'имя файла');
        assertEqual(2, wb.counts.events, 'счётчик мероприятий');
        assertEqual(1, wb.counts.ppe, 'счётчик СИЗ');
    });

    test('валидный zip (PK, STORE) с пакетом книги', () => {
        const wb = host._buildEventsWorkbook.call(host, model);
        const buf = Buffer.from(wb.bytes);
        assertTrue(buf[0] === 0x50 && buf[1] === 0x4b, 'magic PK');
        const files = zipText(wb.bytes);
        ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
         'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml',
         'xl/styles.xml'].forEach(function(n) {
            assertTrue(files[n] !== undefined, 'в пакете есть ' + n);
        });
        assertTrue(files['xl/workbook.xml'].indexOf('Мероприятия') !== -1,
            'лист называется «Мероприятия»');
    });

    test('sheet1: заголовок, шапка, строки мероприятий и СИЗ', () => {
        const wb = host._buildEventsWorkbook.call(host, model);
        const sheet = zipText(wb.bytes)['xl/worksheets/sheet1.xml'];
        assertTrue(sheet.indexOf('Мероприятия') !== -1, 'заголовок листа');
        assertTrue(sheet.indexOf('октябрь 2026 г.') !== -1, 'подзаголовок месяца');
        assertTrue(sheet.indexOf('записей: 2') !== -1, 'счётчик в подзаголовке');
        ['Даты', 'Мероприятие', 'Работник', 'Срок', 'Наименование СИЗ'].forEach(function(h) {
            assertTrue(sheet.indexOf(h) !== -1, 'шапка/секция: ' + h);
        });
        assertTrue(sheet.indexOf('05–08.10') !== -1 &&
                   sheet.indexOf('ОУ · Обучение') !== -1, 'строка мероприятия');
        assertTrue(sheet.indexOf('СИЗ · октябрь 2026 · 1') !== -1, 'ярлык СИЗ');
        assertTrue(sheet.indexOf('width="64"') !== -1, 'ширина колонки мероприятий');
    });

    test('styles.xml: карта из 8 стилей', () => {
        const wb = host._buildEventsWorkbook.call(host, model);
        const styles = zipText(wb.bytes)['xl/styles.xml'];
        assertTrue(styles.indexOf('fonts count="4"') !== -1, '4 шрифта');
        assertTrue(styles.indexOf('FF4472C4') !== -1, 'синяя шапка');
        assertTrue(styles.indexOf('cellXfs count="8"') !== -1, '8 cellXfs');
    });

    test('пустые мероприятия — заглушка; пустые СИЗ — секции нет', () => {
        const wb = host._buildEventsWorkbook.call(host,
            {y: 2026, m: 10, monthName: 'октябрь', events: [], ppe: []});
        const sheet = zipText(wb.bytes)['xl/worksheets/sheet1.xml'];
        assertTrue(sheet.indexOf('нет мероприятий в этом месяце') !== -1, 'заглушка');
        assertTrue(sheet.indexOf('Наименование СИЗ') === -1, 'секции СИЗ нет');
    });
});

// ============================================================
// 10. SW: версия кэша
// ============================================================
describe('Task 465 — SW: версия кэша', () => {

    test('CACHE_VERSION = kipia-test-v749', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v749';") !== -1,
            'текущая версия v690');
    });

    test('v689 в sw.js отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v689') === -1,
            'версии до Task 466 нет');
    });

    test('комментарий Task 465 о составе правок', () => {
        assertTrue(SW_SRC.indexOf('Task 465') !== -1, 'маркер задачи');
        assertTrue(SW_SRC.indexOf('ws-bar-print') !== -1,
            'упоминание значка печати');
    });
});

console.log('test-task465: все describes зарегистрированы');
