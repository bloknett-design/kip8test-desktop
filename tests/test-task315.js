// tests/test-task315.js
// Task 315 — бар над шахматкой: ВТОРОЕ окно с данными всех мероприятий
// открытого месяца (между кнопками и окном времени и праздников), бар
// из ТРЁХ РАВНЫХ частей, перенос текста в окнах; кнопка «Отменить»
// рядом с «Сохранить»; строки 2 («Сохранить»/«Отменить») и 3
// («Сформировать») под кнопками выбора месяца и года.
// Заявка пользователя:
//   «В баре над шахматкой добавь второе окно с данными всех
//    мероприятий на открытый месяц, расположи это окно между
//    кнопками и окном времени и праздников, раздели бар на три
//    равных части, для кнопок и двух окон. Если текст в окнах не
//    будет помещаться в одну строку, он должен переноситься на
//    строку ниже. При добавлении нового кода или мероприятия в
//    ячейки шахматки, помимо кнопки "Сохранить" должна появляться
//    кнопка "Отменить", для отмены ввода изменений. Кнопки
//    "Сохранить" и "Отменить" расположи под кнопками выбора месяца
//    и года, кнопку "Сформировать" ещё ниже, в третьей строке.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   HTML: .ws-bar-row (строка 1: ws-toolbar-main → #wsEventsPanel →
//     #wsCalPanel — окно мероприятий МЕЖДУ кнопками и окном времени
//     и праздников); строка 2 .ws-actions-row (#wsSaveBtn +
//     #wsCancelBtn) и строка 3 .ws-generate-row (#wsGenerateBtn) —
//     Task 317: ряды ВНУТРИ колонки кнопок .ws-toolbar-main (было:
//     отдельные ряды бара во всю ширину), порядок: ряд 1 → ряд 2 →
//     ряд 3 → окна.
//   CSS: media ≥1024px — .ws-bar-row grid 1fr 1fr 1fr (ТРИ РАВНЫЕ
//     части), окна height 95px/justify-self stretch; .ws-events-panel
//     (95px, скролл, overscroll); ПЕРЕНОС текста: .ws-ep-item
//     white-space: normal + overflow-wrap, .ws-cp-day normal (чипы
//     праздников), .ws-cp-item normal; .ws-actions-row/.ws-generate-row
//     [hidden] display:none; .ws-cancel-btn (красная, 34px);
//     margin-left:auto у «Сформировать» удалён; светлая тема.
//   JS: cancelAll — сброс _PENDING + перерисовка + тост + kipConfirm
//     (danger) + guard _saving; _updateSaveBtn — скрывает/показывает
//     «Отменить» и всю строку 2; init — wsGenerateRow по праву записи;
//     _renderMonthEventsPanel — вызов из _renderGrid, фильтр
//     пересечения месяца, сортировка, формат дат «02.09»/«02–05.09»/
//     «29.09–02.10», счётчик, пустое состояние.
//   VM: _renderMonthEventsPanel (записи в месяце/через границу/вне;
//     форматы дат; пустой месяц; счётчик; скрытие hidden),
//     _updateSaveBtn (n=0 скрыта / n=2 показана), cancelAll
//     (сброс правок, тост).
//   SW: kipia-test-v738.
//
// Запуск: через tests/run-all.js (require './test-task315.js').

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

// Объект из РЕАЛЬНЫХ методов (+ мок-переопределения и поля состояния).
// Параметры — глобалы, которые методы видят в браузере.
function loadCtx(realNames, mocks, globals) {
    const texts = realNames.map(n => methodText(INDEX_SRC, n))
        .filter(t => t.length > 0);
    assertTrue(texts.length === realNames.length,
        'все методы найдены: ' + realNames.join(', '));
    const make = new Function('localStorage', 'document', 'confirm',
                              'KipToast', 'kipConfirm',
        'return ({' + texts.join('\n') + '\n' + (mocks || '') + '\n});');
    return make(globals.localStorage, globals.document,
                globals.confirm, globals.KipToast, globals.kipConfirm);
}

// ------------------------------------------------------------
// HTML: структура бара (строки 1/2/3)
// ------------------------------------------------------------
describe('Task 315 — HTML: бар из трёх частей + строки 2/3', () => {

    const ws = INDEX_SRC.slice(INDEX_SRC.indexOf('id="page-work-schedule"'),
                                INDEX_SRC.indexOf('id="wsGridWrap"'));

    test('HTML: строка 1 — .ws-bar-row с кнопками и ДВУМЯ окнами', () => {
        const iBar = ws.indexOf('class="ws-bar-row"');
        const iMain = ws.indexOf('class="ws-toolbar-main"');
        const iEv = ws.indexOf('id="wsEventsPanel"');
        const iCal = ws.indexOf('id="wsCalPanel"');
        assertTrue(iBar !== -1 && iMain !== -1 && iEv !== -1 && iCal !== -1,
            'бар-строка, ряд кнопок и оба окна есть');
        assertTrue(iBar < iMain, '.ws-bar-row открывает строку 1');
        // ОКНО МЕРОПРИЯТИЙ — МЕЖДУ кнопками и окном времени и праздников
        assertTrue(iMain < iEv && iEv < iCal,
            'порядок: кнопки → окно мероприятий → окно времени и праздников');
        assertTrue(ws.indexOf('id="wsEventsPanel" class="ws-events-panel"') !== -1,
            'окно мероприятий — класс ws-events-panel');
    });

    test('HTML: Task 324 → 325 — ряды 2/3: Сформировать + Сохранить + Отменить (ряд 3)', () => {
        const iMain = ws.indexOf('class="ws-toolbar-main"');
        const iRow = ws.indexOf('id="wsActionsRow"');
        const iGen = ws.indexOf('id="wsGenerateBtn"');
        const iSave = ws.indexOf('id="wsSaveBtn"');
        const iCancel = ws.indexOf('id="wsCancelBtn"');
        const iTot = ws.indexOf('id="wsTotalsRow"');
        assertTrue(iRow !== -1 && iGen !== -1 && iSave !== -1 && iCancel !== -1,
            'ряд действий и все три кнопки есть (Task 325)');
        assertTrue(iMain !== -1 && iMain < iTot && iTot < iRow,
            'ряды — внутри .ws-toolbar-main: итоги (2) → действия (3)');
        assertTrue(iRow < iGen && iGen < iSave && iSave < iCancel,
            'ОДНА СТРОКА (заявка Task 325): Сформировать → Сохранить → Отменить — ПОД итогами');
        assertFalse(ws.indexOf('id="wsGenerateRow"') !== -1,
            'отдельная строка генерации (ws-generate-row) удалена');
        const btn = ws.slice(iCancel - 100, iCancel + 400);
        assertTrue(btn.indexOf('onclick="WorkSchedule.cancelAll()"') !== -1,
            'onclick → WorkSchedule.cancelAll()');
        assertTrue(/id="wsCancelBtn"[^>]*\shidden/.test(btn),
            '«Отменить» скрыта без правок (появляется при вводе изменений)');
        assertTrue(btn.indexOf('>Отменить</button>') !== -1,
            'текст кнопки — «Отменить»');
        assertTrue(/id="wsGenerateBtn"[^>]*\shidden/.test(ws),
            '«Сформировать» скрыта без права записи (init)');
        assertFalse(INDEX_SRC.indexOf('class="ws-tb-sep"') !== -1,
            'разделитель .ws-tb-sep удалён (Task 325: блоки в разных рядах)');
    });

    test('HTML: «Сохранить» (saveAll) не изменилась', () => {
        const re = /<button type="button" id="wsSaveBtn" class="ws-save-btn" onclick="WorkSchedule\.saveAll\(\)" hidden>Сохранить<\/button>/;
        assertTrue(re.test(ws), 'кнопка saveAll — прежняя разметка (текст «(N)» ставит JS)');
    });
});

// ------------------------------------------------------------
// CSS: три равные части, перенос текста, строки 2/3, «Отменить»
// ------------------------------------------------------------
describe('Task 315 — CSS: компоновка и перенос текста', () => {

    test('CSS: десктоп — .ws-bar-row grid из ТРЁХ РАВНЫХ частей', () => {
        assertTrue(/\.ws-bar-row \{[^}]*display:\s*grid/.test(INDEX_SRC),
            'строка 1 бара — grid');
        const re = /\.ws-bar-row \{[^}]*grid-template-columns:\s*1fr\s+1fr\s+1fr/;
        assertTrue(re.test(INDEX_SRC), 'ТРИ РАВНЫЕ части (1fr 1fr 1fr)');
    });

    test('CSS: окна в media — 95px + растяжение на свою 1/3', () => {
        const mq = INDEX_SRC.match(/@media \(min-width: 1024px\) \{[\s\S]*?\.ws-events-panel,[\s\S]*?\.ws-cal-panel \{[\s\S]*?\}/);
        assertTrue(!!mq, 'десктопное правило обоих окон');
        assertTrue(mq[0].indexOf('height: 95px') !== -1, 'высота 95px');
        assertTrue(mq[0].indexOf('justify-self: stretch') !== -1,
            'растяжение на 1/3 (fit-content календаря выключен)');
    });

    test('CSS: .ws-events-panel — окно как у календаря (95px/скролл)', () => {
        const re = /\.ws-events-panel \{[^}]*height:\s*95px[^}]*overflow-y:\s*auto/;
        assertTrue(re.test(INDEX_SRC), '95px + скролл внутри');
        assertTrue(/\.ws-events-panel \{[^}]*overscroll-behavior:\s*contain/.test(INDEX_SRC),
            'скролл окна не тянет страницу');
        assertTrue(INDEX_SRC.indexOf('.ws-events-panel[hidden] { display: none; }') !== -1,
            'скрытие окна до первых данных');
    });

    test('CSS: ПЕРЕНОС текста в окнах (заявка)', () => {
        // строки мероприятий
        const item = INDEX_SRC.match(/\.ws-ep-item \{[\s\S]*?\n    \}/);
        assertTrue(!!item, 'правило .ws-ep-item');
        assertTrue(item[0].indexOf('white-space: normal') !== -1,
            'строка мероприятия переносится (normal)');
        assertTrue(item[0].indexOf('overflow-wrap: break-word') !== -1,
            'длинные слова не рвут окно');
        // чипы праздников и счётчики календаря
        const day = INDEX_SRC.match(/\.ws-cp-day \{[\s\S]*?\n    \}/);
        assertTrue(!!day && day[0].indexOf('white-space: normal') !== -1,
            'чипы праздников переносятся');
        const it = INDEX_SRC.match(/\.ws-cp-item \{[\s\S]*?\n    \}/);
        assertTrue(!!it && it[0].indexOf('white-space: normal') !== -1,
            'счётчики норм переносятся');
        // дата не рвётся внутри
        assertTrue(/\.ws-ep-date \{[^}]*white-space:\s*nowrap/.test(INDEX_SRC),
            '«02–05.09» не рвётся внутри (nowrap у даты)');
    });

    test('CSS: Task 324 → 325 — ряды всегда на виду (строк-обёрток нет)', () => {
        // Task 315/317/325: правило строки .ws-generate-row и скрытия
        // строк УДАЛЕНЫ (Task 325: ряды 2/3 — итоги и действия, в ряду 2
        // всегда видны кнопки итогов — ряды не прячутся)
        assertFalse(/\.ws-generate-row\s*\{/.test(INDEX_SRC),
            'правило строки генерации удалено');
        assertFalse(/\.ws-actions-row\[hidden\]/.test(INDEX_SRC),
            'скрытие строки действий удалено (ряд всегда на виду)');
        assertFalse(/\.ws-bottom-row \.ws-tb-sep/.test(INDEX_SRC),
            'разделитель нижнего ряда удалён (Task 325: блоки в разных рядах)');
    });

    test('CSS: .ws-cancel-btn — красная, 32px (Task 328)', () => {
        const re = /\.ws-cancel-btn \{[^}]*background:\s*rgba\(255, 107, 107, 0\.14\)[^}]*height:\s*32px/;
        assertTrue(re.test(INDEX_SRC), 'приглушённо-красная кнопка 32px (Task 328 — кнопки меньше)');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ws-cancel-btn') !== -1,
            'светлая тема кнопки');
    });

    test('CSS: «Сформировать» больше не прижата вправо', () => {
        const gen = INDEX_SRC.match(/\.ws-generate-btn \{[\s\S]*?\n    \}/);
        assertTrue(!!gen, 'правило .ws-generate-btn');
        assertFalse(/margin-left:\s*auto/.test(gen[0]),
            'margin-left: auto удалён — кнопка в собственной строке 3');
    });

    test('CSS: светлая тема окна мероприятий', () => {
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ws-events-panel') !== -1,
            'светлый фон окна (как у календаря #e9e7de)');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ws-ep-cap') !== -1,
            'светлая зелёная плашка заголовка');
    });
});

// ------------------------------------------------------------
// JS: скелет (cancelAll, _updateSaveBtn, init, вызовы рендера)
// ------------------------------------------------------------
describe('Task 315 — JS: скелет', () => {

    test('JS: cancelAll — сброс правок с подтверждением', () => {
        const m = methodText(INDEX_SRC, 'cancelAll');
        assertTrue(m.indexOf('cancelAll: function') !== -1, 'метод есть');
        assertTrue(m.indexOf('if (this._saving) return;') !== -1,
            'блокировка во время пакетного сохранения');
        assertTrue(m.indexOf('self._PENDING = {};') !== -1,
            'сброс всех накопленных правок');
        assertTrue(m.indexOf('self._updateSaveBtn();') !== -1 &&
                   m.indexOf('self._renderGrid();') !== -1,
            'обновление кнопок + перерисовка сетки');
        assertTrue(m.indexOf("'Изменения отменены (' + n + ')'") !== -1,
            'тост со счётчиком отменённых');
        assertTrue(m.indexOf('kipConfirm(') !== -1 &&
                   m.indexOf('danger: true') !== -1,
            'подтверждение kipConfirm с danger-кнопкой');
    });

    test('JS: _updateSaveBtn — «Отменить» вместе с «Сохранить»; ряд НЕ прячется (Task 324)', () => {
        const m = methodText(INDEX_SRC, '_updateSaveBtn');
        assertTrue(m.indexOf('var show = this._canEdit && n > 0;') !== -1,
            'видимость = права И есть правки');
        assertTrue(m.indexOf("getElementById('wsCancelBtn')") !== -1,
            'управляет «Отменить»');
        assertFalse(m.indexOf("getElementById('wsActionsRow')") !== -1,
            'Task 324: ряд НЕ скрывается — в нижнем ряду всегда есть кнопки итогов');
    });

    test('JS: init скрывает «Сформировать» по праву записи (ряд не трогает)', () => {
        const init = INDEX_SRC.slice(INDEX_SRC.indexOf('init: function'),
                                     INDEX_SRC.indexOf('_refreshFromUrlState: function'));
        assertTrue(init.indexOf("getElementById('wsGenerateBtn')") !== -1,
            'init берёт кнопку «Сформировать»');
        assertTrue(init.indexOf('genBtn.hidden = !this._canEdit;') !== -1,
            'скрыта без права записи');
        assertFalse(init.indexOf("getElementById('wsGenerateRow')") !== -1,
            'Task 324: отдельной строки генерации больше нет');
    });

    test('JS: _renderGrid вызывает _renderMonthEventsPanel', () => {
        const rg = methodText(INDEX_SRC, '_renderGrid');
        assertTrue(rg.indexOf('this._renderMonthEventsPanel();') !== -1,
            'окно мероприятий обновляется при каждом рендере сетки');
    });

    test('JS: _renderMonthEventsPanel — фильтр/сортировка/формат', () => {
        const m = methodText(INDEX_SRC, '_renderMonthEventsPanel');
        assertTrue(m.indexOf('_renderMonthEventsPanel: function') !== -1, 'метод есть');
        // фильтр пересечения месяца: e < mStart || s > mEnd → мимо
        assertTrue(m.indexOf('e < mStart || s > mEnd') !== -1,
            'мероприятие попадает при ПЕРЕСЕЧЕНИИ месяца');
        assertTrue(m.indexOf("t['дата_начала']") !== -1 &&
                   m.indexOf("t['дата_окончания']") !== -1,
            'диапазон дат записи');
        // сортировка по дате начала, затем таб. номер
        assertTrue(m.indexOf("String(a['дата_начала']).localeCompare(String(b['дата_начала']))") !== -1,
            'сортировка по дате начала');
        // формат дат
        assertTrue(m.indexOf("slice(8) + '–' + fmtDay(eIso)") !== -1,
            'диапазон в одном месяце: «02–05.09»');
        assertTrue(m.indexOf('fmtDay(sIso) + \'–\' + fmtDay(eIso)') !== -1,
            'через границу месяца: «29.09–02.10»');
        // заголовок со счётчиком + пустое состояние
        assertTrue(m.indexOf('Мероприятия · ') !== -1, 'заголовок окна');
        assertTrue(m.indexOf("' · ' + list.length") !== -1, 'счётчик записей');
        assertTrue(m.indexOf('нет мероприятий в этом месяце') !== -1,
            'пустое состояние');
        // строка: точка-цвет/дата/код-тема-ФИО + тултип
        assertTrue(m.indexOf('ws-ep-item') !== -1 && m.indexOf('ws-ep-dot') !== -1,
            'строки с точкой-цветом');
        assertTrue(m.indexOf('ws-ep-date') !== -1 && m.indexOf('ws-ep-text') !== -1,
            'дата и текст строки');
        assertTrue(m.indexOf("meta.color") !== -1, 'цвет кода из «Коды_статусов»');
        assertTrue(m.indexOf("fioIdx[tr['таб_номер']]") !== -1, 'ФИО по таб. номеру');
        assertTrue(m.indexOf('el.hidden = false;') !== -1, 'окно показано');
    });
});

// ------------------------------------------------------------
// VM: _renderMonthEventsPanel — рендер по данным
// ------------------------------------------------------------
describe('Task 315 — VM: окно мероприятий месяца', () => {

    function makePanel(trainings, year, month, employees) {
        const el = { innerHTML: '', hidden: true };
        const document = { getElementById: function(id) { return id === 'wsEventsPanel' ? el : null; } };
        const ctx = loadCtx(
            ['_instrShortOf', '_normInstrKey',
                   '_renderMonthEventsPanel', '_trainingCodeOf', '_statusMeta'],
            '_year: ' + year + ', _month: ' + month + ',' +
            '_TRAININGS: ' + JSON.stringify(trainings) + ',' +
            '_EMPLOYEES: ' + JSON.stringify(employees) + ',' +
            '_STATUS_CODES: [],' +
            '_esc: function(s){ return String(s == null ? "" : s); },' +
            '_escAttr: function(s){ return String(s == null ? "" : s); },' +
            '_isoDate: function(dt){ var m=(""+(dt.getMonth()+1)).padStart(2,"0"); var d=(""+dt.getDate()).padStart(2,"0"); return dt.getFullYear()+"-"+m+"-"+d; }, _barExpSync: function() {},',
            { document: document }
        );
        ctx._renderMonthEventsPanel();
        return el;
    }

    const EMP = [{ 'таб_номер': '0871', 'ФИО': 'Иванов Иван Иванович' }];
    const CODES = [
        { code: 'И', name: 'Инструктаж', color: '#B3E5FC' },
        { code: 'ОБ', name: 'Обучение', color: '#A5D6A7' }
    ];

    test('VM: записи месяца + пересекающие границу + счётчик + ФИО', () => {
        const trs = [
            { 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Повторный инструктаж по ОТ',
              'дата_начала': '2026-09-02', 'дата_окончания': '2026-09-05' },
            { 'таб_номер': '0871', 'тип': 'обучение', 'тема': 'Охрана труда',
              'дата_начала': '2026-08-29', 'дата_окончания': '2026-09-02' },
            { 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Вне месяца',
              'дата_начала': '2026-08-01', 'дата_окончания': '2026-08-15' },
            { 'таб_номер': '0871', 'тип': 'обучение', 'тема': 'Следующий месяц',
              'дата_начала': '2026-10-02', 'дата_окончания': '2026-10-03' }
        ];
        // _statusMeta подменяем справочником CODES: соберём контекст
        // вручную — чтобы статус-мета бралась из CODES
        const el = { innerHTML: '', hidden: true };
        const document = { getElementById: function(id) { return id === 'wsEventsPanel' ? el : null; } };
        const texts = ['_instrShortOf', '_normInstrKey',
                   '_renderMonthEventsPanel', '_trainingCodeOf', '_statusMeta'].map(n => methodText(INDEX_SRC, n));
        const make = new Function('localStorage', 'document', 'confirm', 'KipToast', 'kipConfirm',
            'return ({' + texts.join('\n') + '\n' +
            '_year: 2026, _month: 9,' +
            '_TRAININGS: ' + JSON.stringify(trs) + ',' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_STATUS_CODES: ' + JSON.stringify(CODES) + ',' +
            '_esc: function(s){ return String(s == null ? "" : s); },' +
            '_escAttr: function(s){ return String(s == null ? "" : s); },' +
            '_isoDate: function(dt){ var m=(""+(dt.getMonth()+1)).padStart(2,"0"); var d=(""+dt.getDate()).padStart(2,"0"); return dt.getFullYear()+"-"+m+"-"+d; }, _barExpSync: function() {},' +
            '});');
        const ctx = make(null, document, null, null, null);
        ctx._renderMonthEventsPanel();

        assertFalse(el.hidden, 'окно показано (hidden снят)');
        assertTrue(el.innerHTML.indexOf('Мероприятия · сентябрь 2026 · 2') !== -1,
            'заголовок: месяц, год и счётчик = 2 (в месяце и пересекающее)');
        assertTrue(el.innerHTML.indexOf('02–05.09') !== -1,
            'диапазон в одном месяце: «02–05.09»');
        assertTrue(el.innerHTML.indexOf('29.08–02.09') !== -1,
            'диапазон через границу: «29.08–02.09»');
        assertFalse(el.innerHTML.indexOf('Вне месяца') !== -1,
            'запись августа полностью вне месяца НЕ показана');
        assertFalse(el.innerHTML.indexOf('Следующий месяц') !== -1,
            'запись октября НЕ показана');
        assertTrue(el.innerHTML.indexOf('Иванов Иван Иванович') !== -1,
            'ФИО по таб. номеру');
        assertTrue(el.innerHTML.indexOf('Повторный инструктаж по ОТ') !== -1,
            'тема мероприятия');
        // порядок: 29.08–02.09 (начало раньше) до 02–05.09
        assertTrue(el.innerHTML.indexOf('29.08–02.09') < el.innerHTML.indexOf('02–05.09'),
            'сортировка по дате начала');
        // цвет кода из справочника
        assertTrue(el.innerHTML.indexOf('#B3E5FC') !== -1, 'цвет И из «Коды_статусов»');
    });

    test('VM: пустой месяц — «нет мероприятий в этом месяце»', () => {
        const el = makePanel([], 2026, 9, EMP);
        assertTrue(el.innerHTML.indexOf('нет мероприятий в этом месяце') !== -1,
            'пустое состояние');
        assertTrue(el.innerHTML.indexOf('Мероприятия · сентябрь 2026') !== -1,
            'заголовок без счётчика');
        assertFalse(el.innerHTML.indexOf('· 0') !== -1, 'нулевого счётчика нет');
    });

    test('VM: однодневное мероприятие — «02.09» без диапазона', () => {
        const trs = [{ 'таб_номер': '0871', 'тип': 'инструктаж', 'тема': 'Целевой',
                       'дата_начала': '2026-09-02' }];
        const el = makePanel(trs, 2026, 9, EMP);
        assertTrue(el.innerHTML.indexOf('>02.09</b>') !== -1,
            'один день — «02.09»');
        assertFalse(el.innerHTML.indexOf('–') !== -1, 'без дефиса-диапазона');
    });
});

// ------------------------------------------------------------
// VM: _updateSaveBtn + cancelAll
// ------------------------------------------------------------
describe('Task 315 — VM: кнопки «Сохранить»/«Отменить»', () => {

    test('VM: _updateSaveBtn — n=0 кнопки скрыты, n=2 показаны', () => {
        const btn = { hidden: false, textContent: '' };
        const cancel = { hidden: false };
        const document = { getElementById: function(id) {
            if (id === 'wsSaveBtn') return btn;
            if (id === 'wsCancelBtn') return cancel;
            return null;
        }};
        const texts = ['_updateSaveBtn'].map(n => methodText(INDEX_SRC, n));
        const make = new Function('localStorage', 'document', 'confirm', 'KipToast', 'kipConfirm',
            'return ({' + texts.join('\n') + '\n' + '_canEdit: true, _PENDING: {} });');
        const ctx = make(null, document, null, null, null);

        ctx._updateSaveBtn();
        assertTrue(btn.hidden && cancel.hidden,
            'без правок: «Сохранить»/«Отменить» скрыты (ряд остаётся — кнопки итогов)');

        ctx._PENDING = { '2026-09-02|0871': { 'статус': 'Д' },
                         '2026-09-03|0871': { 'статус': 'ОТ' } };
        ctx._updateSaveBtn();
        assertFalse(btn.hidden, '«Сохранить» показана при правках');
        assertFalse(cancel.hidden, '«Отменить» появляется ВМЕСТЕ с «Сохранить»');
        assertEqual('Сохранить (2)', btn.textContent, 'текст со счётчиком');
    });

    test('VM: _updateSaveBtn — зритель без права записи: скрыто', () => {
        const btn = { hidden: false, textContent: '' };
        const cancel = { hidden: false };
        const document = { getElementById: function(id) {
            if (id === 'wsSaveBtn') return btn;
            if (id === 'wsCancelBtn') return cancel;
            return null;
        }};
        const texts = ['_updateSaveBtn'].map(n => methodText(INDEX_SRC, n));
        const make = new Function('localStorage', 'document', 'confirm', 'KipToast', 'kipConfirm',
            'return ({' + texts.join('\n') + '\n' +
            '_canEdit: false, _PENDING: { a: 1 } });');
        const ctx = make(null, document, null, null, null);
        ctx._updateSaveBtn();
        assertTrue(btn.hidden && cancel.hidden,
            'зритель: «Сохранить»/«Отменить» скрыты, даже при наличии правок в памяти');
    });

    test('VM: cancelAll — сброс правок, тост, перерисовка', () => {
        const toasts = [];
        const KipToast = { show: function(msg) { toasts.push(msg); } };
        const document = { getElementById: function() { return null; } };
        const texts = ['cancelAll'].map(n => methodText(INDEX_SRC, n));
        const make = new Function('localStorage', 'document', 'confirm', 'KipToast', 'kipConfirm',
            'return ({' + texts.join('\n') + '\n' +
            '_saving: false,' +
            '_PENDING: { "2026-09-02|0871": 1, "2026-09-03|0871": 2 },' +
            '_updateSaveBtn: function() { this._btn = "updated"; },' +
            '_renderGrid: function() { this._grid = "rerendered"; } });');
        const ctx = make(null, document, function() { return true; }, KipToast, null);

        ctx.cancelAll();
        assertEqual(0, Object.keys(ctx._PENDING).length, '_PENDING очищен');
        assertEqual('updated', ctx._btn, 'кнопки обновлены');
        assertEqual('rerendered', ctx._grid, 'сетка перерисована');
        assertEqual(1, toasts.length, 'один тост');
        assertTrue(toasts[0].indexOf('Изменения отменены (2)') !== -1,
            'тост со счётчиком');
    });

    test('VM: cancelAll — пустой _PENDING ничего не делает', () => {
        const toasts = [];
        const KipToast = { show: function(msg) { toasts.push(msg); } };
        const document = { getElementById: function() { return null; } };
        const texts = ['cancelAll'].map(n => methodText(INDEX_SRC, n));
        const make = new Function('localStorage', 'document', 'confirm', 'KipToast', 'kipConfirm',
            'return ({' + texts.join('\n') + '\n' +
            '_saving: false, _PENDING: {} });');
        const ctx = make(null, document, function() { return true; }, KipToast, null);
        ctx.cancelAll();
        assertEqual(0, toasts.length, 'без правок — без тоста и диалога');
    });
});

// ------------------------------------------------------------
// Service Worker
// ------------------------------------------------------------
describe('Task 315 — Service Worker', () => {
    test('SW: версия кэша kipia-test-v738', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v738') !== -1,
            'SW поднят до v556 (Task 317 — тултип «данные от», три ряда кнопок)');
        assertFalse(SW_SRC.indexOf('kipia-test-v739') !== -1,
            'лишний инкремент не делался');
    });
});
