// tests/test-task322.js
// Task 322 — по заявке пользователя (три части):
//   1) «Коды „д“ и „н“ должны учитываться в итогах учёта как дни
//      переработки: для сменного персонала — по 12 часов, для
//      дневного персонала — по часам, которые указали при
//      добавлении кода в ячейку шахматки» — д/н считаются
//      ПЕРЕРАБОТКОЙ (не явки/часы/Д/Н): сменному 12 ч, дневному —
//      часы из правки ячейки (Task 521: при выборе д/н в попапе —
//      поля «Время начала/окончания работ», часы считаются
//      автоматически; шит «Дополнительно…» — поле «Часы»; поле
//      «часы» записи, серверная колонка K «Записи_графика»),
//      фолбэк 8 ч для старых записей без часов.
//   2) «Вместо кодов в шапке итогов учёта используй слова» —
//      День (Д), Ночь (Н), Отпуск (ОТ), Уч. отпуск (У), Отгул (ОВ),
//      Больничный (Б), Прогул (ПР), Переработка и т.д.
//   3) «Оформление итогов учёта сделай в виде таблицы в цвете
//      строк зеброй, и раскрываться панель должна на всю высоту
//      шахматки, до бара с кнопками» — зебра чётных строк (жива и
//      в Task 323); Task 323: панель — БОКОВАЯ ШТОРКА справа от
//      шахматки (сетка не скрывается), строки итогов — по строкам
//      сетки, итоговая строка — tfoot у низа панели.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   Клиент HTML: поле «Часы» (#wsCellHours) в шите «Дополнительно…».
//   Клиент CSS: зебра строк (обе темы), колонка Переработка
//   (ws-tt-over), полная высота панели + скрытие сетки (ws-tt-open),
//   малая форма часов (.ws-dn-*).
//   Клиент VM: onPopupStatus (сменный — сразу, дневной — форма);
//   _renderDnHoursForm (Task 521: поля «Время начала/окончания
//   работ», префилл 7:30/19:30 + текущие часы как длительность,
//   кнопки, Enter); applyDnHours (Task 521: часы = «окончание −
//   начало», полночь +24 ч, округление до 0,1, тосты);
//   dnHoursBack (возврат к кодам без перепозиционирования);
//   _applyCellStatus (поле «часы»: д/н+часы → число, без — null,
//   не-д/н → null); submitCellForm (часы: валидные/пустые/ошибка);
//   openCellForm (префилл часов из записи); saveAll (payload часы);
//   _empTypeMap/_overHours; попап показывает «· N ч» у д/н.
//   Сервер: listEntries читает 11 колонок (часы: число/null/
//   нормализация «7,2»); setManualEntry валидирует 0,5..24, пишет
//   колонку K (обновление и вставка), часы=null без поля, аудит.
//   SW: kipia-test-v749.
//
// Запуск: через tests/run-all.js (require './test-task322.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');
const WS_CLIENT = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// Вырезка метода (как в test-task321.js). Последний метод объекта
// заканчивается «\n    };» без запятой — хвост срезаем отдельно
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        \},|\n    \};/);
    const end = m ? m.index + m[0].length : rest.length;
    let text = rest.slice(0, end);
    text = text.replace(/\n\s{4}\};\s*$/, '');
    return text;
}
function methodFn(src, name, document) {
    const text = methodText(src, name).replace(/,\s*$/, '');
    const body = text.replace(new RegExp('^ {8}' + name + ': '), '');
    return new Function('document', 'return (' + body + ')')(document || null);
}
function wsHost(methodNames, extra, document) {
    const host = Object.assign({}, extra);
    methodNames.forEach(function(n) {
        host[n] = methodFn(WS_CLIENT, n, document || null);
    });
    return host;
}
function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// ============================================================
// 1. HTML: поле «Часы» в шите «Дополнительно…»
// ============================================================
describe('Task 322 — HTML: шит правки ячейки', () => {
    test('HTML: #wsCellHours — поле «Часы (для кодов д/н — переработка)»', () => {
        const i = INDEX_SRC.indexOf('id="wsCellHours"');
        assertTrue(i !== -1, 'поле часов есть в шите');
        const chunk = INDEX_SRC.slice(Math.max(0, i - 700), i + 300);
        assertTrue(chunk.indexOf('for="wsCellHours"') !== -1, 'label связан с полем');
        assertTrue(chunk.indexOf('Часы (для кодов д/н — переработка)') !== -1,
            'подпись объясняет назначение');
        assertTrue(chunk.indexOf('inputmode="decimal"') !== -1,
            'цифровая клавиатура (inputmode decimal)');
        assertTrue(chunk.indexOf('Task 322') !== -1, 'метка задачи в комментарии HTML');
    });
});

// ============================================================
// 2. CSS: зебра, колонка переработки, полная высота, форма часов
// ============================================================
describe('Task 322 — CSS: оформление итогов и формы часов', () => {
    test('CSS: Task 381 — зебра ВОССТАНОВЛЕНА, ячейки прозрачные (как до белого)', () => {
        // Заявка Task 381: «фон итогов верни как был до белого» —
        // правила Task 378 удалены, зебра строк снова просвечивает
        assertTrue(/\.ws-tt-table tbody tr:nth-child\(even\)\s*\{[^}]*rgba\(255, 255, 255, 0\.09\)/.test(INDEX_SRC),
            'зебра строк итогов восстановлена (тёмная, Task 322)');
        assertTrue(/\[data-theme="light"\] \.ws-tt-table tbody tr:nth-child\(even\)\s*\{[^}]*rgba\(0, 0, 0, 0\.07\)/.test(INDEX_SRC),
            'светлая зебра восстановлена');
        assertFalse(/\[data-theme="light"\] \.ws-tt-table tbody td\.ws-tt-num\s*\{[^}]*background:\s*#FFFFFF/.test(INDEX_SRC),
            'правила #FFFFFF ячеек значений больше нет (Task 381)');
        assertFalse(/\[data-theme="dark"\] \.ws-tt-table tbody td\.ws-tt-num\s*\{[^}]*#eef0f2/.test(INDEX_SRC),
            'тёмного правила #eef0f2 больше нет (Task 381)');
    });

    test('CSS: колонка «Переработка» — янтарная, жирная (обе темы)', () => {
        const m = INDEX_SRC.match(/\n    \.ws-tt-table td\.ws-tt-over\s*\{[^}]*\}/);
        assertTrue(!!m, 'правило ws-tt-over есть');
        assertTrue(m[0].indexOf('font-weight: 700') !== -1, 'жирная');
        assertTrue(m[0].indexOf('#e0a23c') !== -1, 'янтарный цвет (тёмная)');
        const l = INDEX_SRC.match(/\[data-theme="light"\] \.ws-tt-table td\.ws-tt-over\s*\{[^}]*\}/);
        assertTrue(!!l && l[0].indexOf('#a06a13') !== -1, 'янтарный в светлой теме');
    });

    test('CSS: Task 323→324→329 — панель БОКОВАЯ (шторка справа), сетка видна', () => {
        // Task 329 (заявка): ширина — по столбцам таблицы (JS _fitTtDrawer);
        // свёрнута — парковка margin-right = −ширина ТОЖЕ JS (проценты
        // не умеют «минус собственная ширина»)
        assertFalse(/\.ws-tt-drawer\s*\{[^}]*width:\s*50%/.test(INDEX_SRC),
            'фиксированной ширины 50% нет (Task 329)');
        assertFalse(/\.ws-tt-drawer\s*\{[^}]*margin-right:\s*-50%/.test(INDEX_SRC),
            'CSS-парковки -50% нет — маржа инлайновая (JS)');
        assertFalse(/#page-work-schedule\.ws-tt-open \.ws-tt-drawer\s*\{[^}]*margin-right:\s*0/.test(INDEX_SRC),
            'ws-tt-open маржу НЕ ставит (Task 329)');
        // сетка НЕ скрывается (было Task 322) — итоги рядом с шахматкой
        assertFalse(/#page-work-schedule\.ws-tt-open \.ws-grid-wrap\s*\{[^}]*display:\s*none/.test(INDEX_SRC),
            'сетка видна рядом с шторкой');
        // Task 327 (заявка): итоговая строка (tfoot) УДАЛЕНА — низ панели
        // закрывает бордюрчик .ws-tt-foot (как .ws-grid-foot шахматки)
        const tf = INDEX_SRC.match(/\.ws-tt-foot\s*\{[^}]*height:\s*5px[^}]*\}/);
        assertTrue(!!tf && tf[0].indexOf('#35648f') !== -1,
            'бордюрчик 5px внизу шторки (заявка Task 327)');
        assertFalse(/tfoot tr\.ws-tt-total/.test(INDEX_SRC),
            'прилипающий tfoot итоговой строки удалён (Task 327)');
        assertFalse(INDEX_SRC.indexOf('max-height: 46vh') !== -1,
            'прежний кап 46vh удалён');
        // Task 331 (заявка): левый бордюрчик — ПОЛОСА 2px как
        // разделитель сменных/дневных (#4a8fc7 / светлая #6e8ba4)
        const edge = INDEX_SRC.match(/\.ws-tt-edge\s*\{[^}]*\}/);
        assertTrue(!!edge && /width:\s*2px/.test(edge[0]) &&
            /left:\s*0/.test(edge[0]) && /#4a8fc7/.test(edge[0]),
            'полоса левого края 2px #4a8fc7 (Task 331)');
        // колонка «Сотрудник» на десктопе скрыта (месяц)
        assertTrue(/\.ws-tt-table:not\(\.ws-tt-year\) th\.ws-tt-emp[\s\S]*?display:\s*none/.test(INDEX_SRC),
            'список сотрудников в месяце скрыт — строки по строкам сетки');
    });

    test('CSS: малая форма часов в попапе (.ws-dn-form и семья)', () => {
        assertTrue(/\.ws-dn-form\s*\{[^}]*flex-direction:\s*column/.test(INDEX_SRC),
            'форма — колонка');
        assertTrue(/\.ws-dn-input\s*\{[^}]*width:\s*100%/.test(INDEX_SRC),
            'поле на всю ширину');
        assertTrue(/\.ws-dn-input:focus\s*\{[^}]*border-color/.test(INDEX_SRC),
            'фокус подсвечивает рамку');
        assertTrue(/\.ws-dn-buttons\s*\{[^}]*display:\s*flex/.test(INDEX_SRC),
            'кнопки в ряд');
        assertTrue(/\.ws-dn-ok\s*\{[^}]*#fff|\.ws-dn-ok\s*\{[^}]*#ffffff/.test(INDEX_SRC),
            'кнопка «Готово» заметная (заливка)');
        assertTrue(/\[data-theme="light"\] \.ws-dn-input\s*\{/.test(INDEX_SRC),
            'светлая тема поля');
    });
});

// ============================================================
// 3. VM: onPopupStatus — д/н сменному сразу, дневному — форма
// ============================================================
describe('Task 322 — VM: onPopupStatus — перехват д/н', () => {

    const TOASTS = [];
    const popupEl = { innerHTML: '' };

    function makeHost(empList) {
        const applied = [];
        const host = wsHost(['onPopupStatus'], {
            _popupCell: { date: '2026-09-05', 'таб_номер': '023' },
            _EMPLOYEES: empList,
            _applyCellStatus: function(d, t, c, h) { applied.push({ d: d, t: t, c: c, h: h }); },
            _renderDnHoursForm: function(code, date, tab) { popupEl.innerHTML = 'FORM:' + code; },
            closeCellPopup: function() {},
            _renderGrid: function() {},
            _updateSaveBtn: function() {}
        }, mockDoc({ wsCellPopup: popupEl }));
        host.__applied = applied;
        return host;
    }

    test('сменный: д применяется сразу (12 ч, без формы)', () => {
        const host = makeHost([{ 'таб_номер': '023', 'тип': 'сменный', 'ФИО': 'С' }]);
        host.onPopupStatus('д');
        assertEqual(host.__applied.length, 1, 'статус применён сразу');
        assertEqual(host.__applied[0].c, 'д', 'код д');
        assertEqual(host.__applied[0].h, undefined, 'без параметра часов (сменный = 12)');
        assertEqual(popupEl.innerHTML, '', 'форма часов НЕ показана');
    });

    test('сменный: н применяется сразу', () => {
        const host = makeHost([{ 'таб_номер': '023', 'тип': 'сменный' }]);
        host.onPopupStatus('н');
        assertEqual(host.__applied[0].c, 'н', 'код н сразу');
    });

    test('дневной: д → форма часов, статус НЕ применяется', () => {
        const host = makeHost([{ 'таб_номер': '023', 'тип': 'дневной' }]);
        host.onPopupStatus('д');
        assertEqual(host.__applied.length, 0, 'без немедленного применения');
        assertEqual(popupEl.innerHTML, 'FORM:д', 'форма часов показана');
    });

    test('дневной: н → форма часов; без типа — тоже форма', () => {
        const host = makeHost([{ 'таб_номер': '023', 'тип': 'дневной' }]);
        host.onPopupStatus('н');
        assertEqual(popupEl.innerHTML, 'FORM:н', 'форма для н');
        popupEl.innerHTML = '';
        const host2 = makeHost([{ 'таб_номер': '023', 'тип': '' }]);
        host2.onPopupStatus('д');
        assertEqual(host2.__applied.length, 0, 'без типа — форма (фолбэк 8)');
        assertEqual(popupEl.innerHTML, 'FORM:д', 'форма для безтипного');
    });

    test('прочие коды — прежний путь (без формы)', () => {
        popupEl.innerHTML = '';
        const host = makeHost([{ 'таб_номер': '023', 'тип': 'дневной' }]);
        host.onPopupStatus('ОТ');
        assertEqual(host.__applied.length, 1, 'ОТ применяется сразу');
        assertEqual(popupEl.innerHTML, '', 'форма не показана');
    });
});

// ============================================================
// 4. VM: _renderDnHoursForm / applyDnHours / dnHoursBack
// Task 521: форма ПЕРЕДЕЛАНА — поля «Время начала/окончания
// работ» (type=time) вместо ручного ввода часов; часы считаются
// автоматически («окончание − начало», полночь +24 ч).
// Моки: #wsDnStart/#wsDnEnd/#wsDnCalc.
// ============================================================
describe('Task 322/521 — VM: малая форма времени работ', () => {

    const TOASTS = [];
    const startMock = { value: '', focus: function() {} };
    const endMock = { value: '', focus: function() {} };
    const calcMock = { textContent: '' };
    const popupEl = { innerHTML: '' };

    function toastOn() {
        TOASTS.length = 0;
        global.KipToast = { show: function(m) { TOASTS.push(m); } };
    }
    function toastOff() { delete global.KipToast; }

    // реальные чистые методы + мок-функции контекста
    // Task 521: +dnHoursRecalc/_dnParseTime/_dnMinutesToHHMM
    const FORM_METHODS = ['_renderDnHoursForm', 'applyDnHours', 'dnHoursBack',
                          'dnHoursRecalc', '_dnParseTime', '_dnMinutesToHHMM',
                          '_statusMeta', '_esc', '_escAttr', '_fmtTotalsNum'];
    const STATUS_CODES = [
        { code: 'д', name: 'День в вых./праздник', color: '#FFD54F' },
        { code: 'н', name: 'Ночь в вых./праздник', color: '#78909C' },
        { code: 'Д', name: 'День (12-час)', color: '#FFE082' }
    ];

    function makeFormHost(effEntry) {
        const applied = [];
        const host = wsHost(FORM_METHODS, {
            _popupCell: { date: '2026-09-05', 'таб_номер': '023' },
            _EMPLOYEES: [{ 'таб_номер': '023', 'тип': 'дневной', 'ФИО': 'Петров П.П.' }],
            _STATUS_CODES: STATUS_CODES,
            _effectiveEntry: function() { return effEntry; },
            _applyCellStatus: function(d, t, c, h) { applied.push({ c: c, h: h }); },
            closeCellPopup: function() { popupEl.innerHTML = ''; },
            _renderGrid: function() {},
            _updateSaveBtn: function() {},
            _renderCellPopup: function() { return 'CODES-LIST'; }
        }, mockDoc({ wsCellPopup: popupEl, wsDnStart: startMock,
                     wsDnEnd: endMock, wsDnCalc: calcMock }));
        host.__applied = applied;
        return host;
    }

    test('форма: заголовок с ФИО, поля времени, префилл 8 ч, Enter', () => {
        const host = makeFormHost(null);
        host._renderDnHoursForm('д', '2026-09-05', '023');
        const h = popupEl.innerHTML;
        assertTrue(h.indexOf('2026-09-05') !== -1 && h.indexOf('Петров П.П.') !== -1,
            'заголовок: дата · ФИО');
        assertTrue(h.indexOf('id="wsDnStart"') !== -1 && h.indexOf('id="wsDnEnd"') !== -1,
            'два поля времени (Task 521)');
        assertTrue(h.indexOf('value="07:30"') !== -1 && h.indexOf('value="15:30"') !== -1,
            'префилл 7:30–15:30 (8 ч — обычный день дневного)');
        assertTrue(h.indexOf('Время начала работ') !== -1 &&
            h.indexOf('Время окончания работ') !== -1, 'подписи полей');
        assertTrue(h.indexOf('id="wsDnCalc"') !== -1, 'строка живого расчёта');
        assertTrue(h.indexOf('Готово') !== -1 && h.indexOf('Назад к кодам') !== -1,
            'кнопки Готово/Назад');
        assertTrue(h.indexOf('applyDnHours') !== -1, 'применение по кнопке');
        assertTrue(h.indexOf("event.key==='Enter'") !== -1, 'Enter применяет');
        assertTrue(h.indexOf('День в вых./праздник') !== -1, 'название кода в форме');
        assertTrue(h.indexOf('рассчитываются автоматически') !== -1,
            'подсказка об автоматическом расчёте');
    });

    test('форма: существующие часы — длительность префилла (7,2)', () => {
        const host = makeFormHost({ 'статус': 'д', 'часы': 7.2 });
        host._renderDnHoursForm('д', '2026-09-05', '023');
        assertTrue(popupEl.innerHTML.indexOf('value="14:42"') !== -1,
            'окончание = 7:30 + 7,2 ч (текущие часы записи)');
    });

    test('форма: чужой код в ячейке — префилл 8 ч (не чужие часы)', () => {
        const host = makeFormHost({ 'статус': 'Д', 'часы': 12 });
        host._renderDnHoursForm('д', '2026-09-05', '023');
        assertTrue(popupEl.innerHTML.indexOf('value="15:30"') !== -1,
            'часы берутся только у того же кода');
    });

    test('applyDnHours: 08:00–15:12 → правка с числом 7,2', () => {
        toastOn();
        try {
            const host = makeFormHost(null);
            host._renderDnHoursForm('д', '2026-09-05', '023');
            startMock.value = '08:00';
            endMock.value = '15:12';
            host.applyDnHours('д');
            assertEqual(host.__applied.length, 1, 'правка применена');
            assertEqual(host.__applied[0].c, 'д', 'код д');
            assertTrue(Math.abs(host.__applied[0].h - 7.2) < 1e-9, 'часы 7,2 (из минут)');
            assertEqual(popupEl.innerHTML, '', 'попап закрыт');
            assertEqual(TOASTS.length, 0, 'без тостов');
        } finally { toastOff(); }
    });

    test('applyDnHours: округление до 0,1 (07:00–14:10 → 7,2)', () => {
        toastOn();
        try {
            const host = makeFormHost(null);
            host._renderDnHoursForm('д', '2026-09-05', '023');
            startMock.value = '07:00';
            endMock.value = '14:10';
            host.applyDnHours('д');
            assertTrue(Math.abs(host.__applied[0].h - 7.2) < 1e-9, 'округлено к 0,1');
        } finally { toastOff(); }
    });

    test('applyDnHours: мусор/пусто/совпало/мало — тост, правки нет', () => {
        toastOn();
        try {
            [['', '15:00'], ['07:30', ''], ['07:30', 'abc'],
             ['08:00', '08:00'], ['08:00', '08:20']].forEach(function(pair) {
                const host = makeFormHost(null);
                host._renderDnHoursForm('д', '2026-09-05', '023');
                startMock.value = pair[0];
                endMock.value = pair[1];
                host.applyDnHours('д');
                assertEqual(host.__applied.length, 0,
                    'правки нет для «' + pair[0] + '»–«' + pair[1] + '»');
                assertTrue(popupEl.innerHTML.indexOf('ws-dn-form') !== -1,
                    'форма остаётся');
            });
            assertEqual(TOASTS.length, 5, 'по тосту на каждую ошибку');
            assertTrue(TOASTS[0].indexOf('Укажите время начала и окончания') !== -1,
                'первый тост поясняет незаполненное время');
        } finally { toastOff(); }
    });

    test('dnHoursBack: список кодов возвращается на место', () => {
        const host = makeFormHost(null);
        host._renderDnHoursForm('д', '2026-09-05', '023');
        host.dnHoursBack('2026-09-05', '023');
        assertEqual(popupEl.innerHTML, 'CODES-LIST', 'список кодов в том же попапе');
        assertEqual(host.__applied.length, 0, 'статус не применён');
    });
});

// ============================================================
// 5. VM: _applyCellStatus — поле «часы»
// ============================================================
describe('Task 322 — VM: _applyCellStatus с часами', () => {

    const host = wsHost(['_applyCellStatus'], {
        _ENTRIES: [
            { 'дата': '2026-09-05', 'таб_номер': '023', 'статус': 'Д',
              'источник': 'руч', 'комментарий': 'был коммент', 'замещает': '077' }
        ],
        _PENDING: {}
    });
    host._serverEntry = function(d, t) {
        return (d === '2026-09-05' && t === '023') ? host._ENTRIES[0] : null;
    };

    test('д с часами → pending.часы = число; доп. поля сохраняются', () => {
        host._applyCellStatus('2026-09-05', '023', 'д', 7.2);
        const p = host._PENDING['2026-09-05|023'];
        assertTrue(!!p, 'правка создана');
        assertEqual(p['статус'], 'д', 'код д');
        assertEqual(p['часы'], 7.2, 'часы числом');
        assertEqual(p['комментарий'], 'был коммент', 'комментарий сохранён из базы');
        assertEqual(p['замещает'], '077', 'замещение сохранено');
    });

    test('д без часов → часы null (фолбэк 8 в итогах)', () => {
        host._applyCellStatus('2026-09-05', '023', 'д');
        assertEqual(host._PENDING['2026-09-05|023']['часы'], null, 'null без часов');
    });

    test('не-д/н код → часы null (поле затирается)', () => {
        host._applyCellStatus('2026-09-05', '023', 'ОТ', 8);
        assertEqual(host._PENDING['2026-09-05|023']['часы'], null,
            'часы только у д/н');
    });

    test('негодные часы (NaN/0/минус) → null', () => {
        host._applyCellStatus('2026-09-05', '023', 'н', NaN);
        assertEqual(host._PENDING['2026-09-05|023']['часы'], null, 'NaN → null');
        host._applyCellStatus('2026-09-05', '023', 'н', 0);
        assertEqual(host._PENDING['2026-09-05|023']['часы'], null, '0 → null');
        host._applyCellStatus('2026-09-05', '023', 'н', -5);
        assertEqual(host._PENDING['2026-09-05|023']['часы'], null, '-5 → null');
    });

    test('округление часов к 0,1 в pending', () => {
        host._applyCellStatus('2026-09-05', '023', 'д', 7.17);
        assertEqual(host._PENDING['2026-09-05|023']['часы'], 7.2, '7,17 → 7,2');
    });
});

// ============================================================
// 6. VM: submitCellForm / openCellForm / saveAll — часы
// ============================================================
describe('Task 322 — VM: шит «Дополнительно…» и сохранение', () => {

    const TOASTS = [];
    const els = {
        // Task 530: focus() — таймер openCellForm (350 мс) фокусирует
        // селект статуса; async-тесты общего прогона дают таймеру
        // сработать — мок обязан иметь метод (иначе TypeError валил прогон)
        wsCellStatus: { value: 'д', focus: function() {} },
        wsCellOvertime: { value: '0' },
        wsCellSubstitute: { value: '' },
        wsCellComment: { value: 'коммент' },
        wsCellHours: { value: '' },
        wsCellInfo: { textContent: '' },
        wsCellDelete: { style: { display: '' } },
        wsCellOverlay: { classList: { add: function() {}, remove: function() {} } },
        wsCellSheet: { classList: { add: function() {}, remove: function() {} } }
    };
    function toastOn() {
        TOASTS.length = 0;
        global.KipToast = { show: function(m) { TOASTS.push(m); } };
    }
    function toastOff() { delete global.KipToast; }

    test('submitCellForm: часы д/н (запятая) → pending.часы', () => {
        toastOn();
        try {
            const pending = {};
            const host = wsHost(['submitCellForm'], {
                _editingCell: { date: '2026-09-05', 'таб_номер': '023' },
                _setPendingCell: function(d, t, f) { pending[d + '|' + t] = f; },
                closeCellForm: function() {},
                _renderGrid: function() {},
                _updateSaveBtn: function() {}
            }, mockDoc(els));
            els.wsCellStatus.value = 'д';
            els.wsCellHours.value = '7,2';
            host.submitCellForm();
            assertEqual(pending['2026-09-05|023']['часы'], 7.2, 'часы из шита');
            assertEqual(pending['2026-09-05|023']['статус'], 'д', 'статус д');
        } finally { toastOff(); }
    });

    test('submitCellForm: д/н с мусором в часах → тост-ошибка, правки нет', () => {
        toastOn();
        try {
            const pending = {};
            const host = wsHost(['submitCellForm'], {
                _editingCell: { date: '2026-09-05', 'таб_номер': '023' },
                _setPendingCell: function(d, t, f) { pending[d + '|' + t] = f; },
                closeCellForm: function() {},
                _renderGrid: function() {},
                _updateSaveBtn: function() {}
            }, mockDoc(els));
            els.wsCellStatus.value = 'д';
            els.wsCellHours.value = 'девять';
            host.submitCellForm();
            assertEqual(Object.keys(pending).length, 0, 'правка не создана');
            assertEqual(TOASTS.length, 1, 'тост об ошибке');
            assertTrue(TOASTS[0].indexOf('0,5') !== -1, 'диапазон в сообщении');
        } finally { toastOff(); }
    });

    test('submitCellForm: д/н с часами вне диапазона → тост-ошибка', () => {
        toastOn();
        try {
            const host = wsHost(['submitCellForm'], {
                _editingCell: { date: '2026-09-05', 'таб_номер': '023' },
                _setPendingCell: function() {},
                closeCellForm: function() {},
                _renderGrid: function() {},
                _updateSaveBtn: function() {}
            }, mockDoc(els));
            els.wsCellStatus.value = 'н';
            els.wsCellHours.value = '30';
            host.submitCellForm();
            assertEqual(TOASTS.length, 1, 'ошибка диапазона');
        } finally { toastOff(); }
    });

    test('submitCellForm: пустые часы у д/н → null (не указано)', () => {
        const pending = {};
        const host = wsHost(['submitCellForm'], {
            _editingCell: { date: '2026-09-05', 'таб_номер': '023' },
            _setPendingCell: function(d, t, f) { pending[d + '|' + t] = f; },
            closeCellForm: function() {},
            _renderGrid: function() {},
            _updateSaveBtn: function() {}
        }, mockDoc(els));
        els.wsCellStatus.value = 'д';
        els.wsCellHours.value = '';
        host.submitCellForm();
        assertEqual(pending['2026-09-05|023']['часы'], null, 'пусто = null');
    });

    test('submitCellForm: не-д/н статус — часы игнорируются (null)', () => {
        const pending = {};
        const host = wsHost(['submitCellForm'], {
            _editingCell: { date: '2026-09-05', 'таб_номер': '023' },
            _setPendingCell: function(d, t, f) { pending[d + '|' + t] = f; },
            closeCellForm: function() {},
            _renderGrid: function() {},
            _updateSaveBtn: function() {}
        }, mockDoc(els));
        els.wsCellStatus.value = 'ОТ';
        els.wsCellHours.value = '8';
        host.submitCellForm();
        assertEqual(pending['2026-09-05|023']['часы'], null, 'ОТ — часы не пишутся');
    });

    test('openCellForm: префилл часов из записи д/н (с запятой)', () => {
        const host = wsHost(['openCellForm'], {
            _canEdit: true,
            _PENDING: {},
            _effectiveEntry: function() {
                return { 'статус': 'д', 'часы': 7.2, 'источник': 'руч' };
            },
            _EMPLOYEES: [{ 'таб_номер': '023', 'ФИО': 'Петров П.П.' }],
            _fillStatusSelect: function() {}
        }, mockDoc(els));
        els.wsCellStatus.value = 'д';
        host.openCellForm('2026-09-05', '023');
        assertEqual(els.wsCellHours.value, '7,2', 'часы с запятой');
    });

    test('openCellForm: не-д/н запись — поле часов пустое', () => {
        const host = wsHost(['openCellForm'], {
            _canEdit: true,
            _PENDING: {},
            _effectiveEntry: function() {
                return { 'статус': 'Д', 'часы': 12, 'источник': 'авто' };
            },
            _EMPLOYEES: [{ 'таб_номер': '023', 'ФИО': 'Петров П.П.' }],
            _fillStatusSelect: function() {}
        }, mockDoc(els));
        els.wsCellStatus.value = 'Д';
        host.openCellForm('2026-09-05', '023');
        assertEqual(els.wsCellHours.value, '', 'часы не показываются для Д');
    });

    test('JS: saveAll отправляет часы в payload setManualEntry', () => {
        const sa = methodText(WS_CLIENT, 'saveAll');
        assertTrue(sa.indexOf("payload['часы']") !== -1,
            'поле часы добавляется в payload');
        assertTrue(sa.indexOf('setManualEntry') !== -1, 'эндпоинт прежний');
    });
});

// ============================================================
// 7. VM: попап показывает часы у стоящего д/н
// ============================================================
describe('Task 322 — VM: список кодов — часы у д/н', () => {

    test('JS: _renderCellPopup добавляет «· N ч» к д/н с часами', () => {
        const rp = methodText(WS_CLIENT, '_renderCellPopup');
        assertTrue(rp.indexOf('eff[\'часы\']') !== -1,
            'часы эффективной записи читаются');
        assertTrue(rp.indexOf('_fmtTotalsNum(eff[\'часы\'])') !== -1,
            'формат с запятой');
        assertTrue(rp.indexOf("c.code === 'д' || c.code === 'н'") !== -1,
            'только для кодов д/н');
    });
});

// ============================================================
// 8. VM: _empTypeMap / _overHours / агрегация д/н
// ============================================================
describe('Task 322 — VM: типы персонала и часы переработки', () => {

    const host = wsHost(['_empTypeMap', '_overHours', '_codeHours', '_totalsZero',
                         '_totalsAgg', '_statusMeta'], {
        _STATUS_CODES: [
            { code: 'Д', name: 'День (12-час)' },
            { code: 'Д8', name: 'День 8-час' },
            { code: 'д', name: 'День в вых./праздник' },
            { code: 'н', name: 'Ночь в вых./праздник' }
        ]
    });

    test('_empTypeMap: карта таб → тип (trim, пусто у отсутствующих)', () => {
        const map = host._empTypeMap([
            { 'таб_номер': '023', 'тип': ' сменный ' },
            { 'таб_номер': '0871', 'тип': 'дневной' },
            { 'таб_номер': 42, 'тип': 'дневной' }
        ]);
        assertEqual(map['023'], 'сменный', 'trim типа');
        assertEqual(map['0871'], 'дневной', 'тип дневной');
        assertEqual(map['42'], 'дневной', 'числовой таб_номер строкой');
        assertEqual(map['999'], undefined, 'отсутствующий — undefined');
    });

    test('_overHours: сменный 12; дневной — часы записи', () => {
        assertEqual(host._overHours({ 'таб_номер': '023' }, { '023': 'сменный' }), 12,
            'сменный без часов — 12');
        assertEqual(host._overHours({ 'таб_номер': '023', 'часы': 3 }, { '023': 'сменный' }), 12,
            'сменный: часы записи игнорируются (всегда 12)');
        assertEqual(host._overHours({ 'таб_номер': '0871', 'часы': 7.2 }, { '0871': 'дневной' }), 7.2,
            'дневной с часами');
        assertEqual(host._overHours({ 'таб_номер': '0871', 'часы': '7,2' }, { '0871': 'дневной' }), 7.2,
            'дневной: строка «7,2» нормализуется');
    });

    test('_overHours: без часов/мусор → фолбэк 8', () => {
        assertEqual(host._overHours({ 'таб_номер': '0871' }, { '0871': 'дневной' }), 8,
            'нет часов → 8 (обычный день дневного)');
        assertEqual(host._overHours({}, {}), 8, 'нет типа и часов → 8');
        assertEqual(host._overHours({ 'часы': 'abc' }, { '': 'дневной' }), 8,
            'мусор в часах → 8');
        assertEqual(host._overHours({ 'часы': 0 }, { '': 'дневной' }), 8,
            'ноль в часах → 8');
        assertEqual(host._overHours({ 'часы': -4 }, { '': 'дневной' }), 8,
            'минус в часах → 8');
    });

    test('_totalsAgg: д/н не портит прочие счётчики (явки/часы/Д/Н)', () => {
        const entries = [
            { 'таб_номер': '023', 'статус': 'Д' },
            { 'таб_номер': '023', 'статус': 'Н' },
            { 'таб_номер': '023', 'статус': 'д' },
            { 'таб_номер': '023', 'статус': 'н' },
            { 'таб_номер': '023', 'статус': 'Д8' }
        ];
        const agg = host._totalsAgg(entries, { '023': 'сменный' });
        const a = agg.byTab['023'];
        assertEqual(a.work, 3, 'явки: Д+Н+Д8 (д/н — не явки)');
        assertEqual(a.day, 2, 'дневные: Д+Д8');
        assertEqual(a.night, 1, 'ночные: Н');
        assertTrue(Math.abs(a.hours - 32) < 1e-9, 'часы: 12+12+8');
        assertEqual(a.overDays, 2, '2 дня переработки');
        assertTrue(Math.abs(a.over - 24) < 1e-9, 'переработка: 12+12');
        assertEqual(a.total, 5, 'всего 5 записей');
    });
});

// ============================================================
// 9. Сервер: listEntries / setManualEntry — колонка K «часы»
// ============================================================
describe('Task 322 — Сервер WorkSchedule.gs: часы переработки', () => {

    class MockSheet {
        constructor(rows) { this.rows = rows || []; }
        getLastRow() { return this.rows.length; }
        getRange(row, col, numRows, numCols) {
            numRows = numRows || 1; numCols = numCols || 1;
            const self = this;
            return {
                getValues() {
                    const out = [];
                    for (let r = row; r < row + numRows; r++) {
                        const line = [];
                        for (let c = col; c < col + numCols; c++) {
                            const rr = self.rows[r - 1];
                            line.push(rr ? (rr[c - 1] === undefined ? '' : rr[c - 1]) : '');
                        }
                        out.push(line);
                    }
                    return out;
                },
                setValue(v) {
                    while (self.rows.length < row) self.rows.push([]);
                    self.rows[row - 1][col - 1] = v;
                },
                setValues(vals) {
                    for (let i = 0; i < vals.length; i++) {
                        const r = row + i;
                        while (self.rows.length < r) self.rows.push([]);
                        for (let c = 0; c < vals[i].length; c++) {
                            self.rows[r - 1][col - 1 + c] = vals[i][c];
                        }
                    }
                },
                setNumberFormat() {}
            };
        }
        appendRow(arr) { this.rows.push(arr.slice()); }
    }

    const MOCK_UTILS = {
        findSessionByToken: () => ({ user_id: 1 }),
        findUserById: () => ({ role: 'Админ', email: 'test@example.com' }),
        audit: () => {}
    };

    const TOK = { token: 't' };

    function loadWS(sheets) {
        const ss = { getSheetByName: (n) => sheets[n] || null };
        const factory = new Function('SpreadsheetApp', 'Utils',
            WS_GS_SRC + '\nreturn WorkSchedule;');
        return factory({ openById: () => ss }, MOCK_UTILS);
    }

    // сентябрь-2026: две записи с часами, одна без
    function mkSheets() {
        return {
            'Коды_статусов': new MockSheet([
                ['код'], ['Д'], ['Н'], ['д'], ['н'], ['Д8'], ['ОТ']
            ]),
            'Записи_графика': new MockSheet([
                ['дата', 'таб_номер', 'статус', 'переработка', 'праздник',
                 'источник', 'обновл', 'замещает', 'инструкция', 'комментарий', 'часы'],
                [new Date(2026, 8, 5), '023', 'д', 0, 1, 'руч', new Date(), '', '', '', 7.2],
                [new Date(2026, 8, 6), '0871', 'д', 0, 1, 'руч', new Date(), '', '', '', ''],
                [new Date(2026, 8, 7), '023', 'н', 0, 0, 'руч', new Date(), '', '', '', '7,2']
            ])
        };
    }

    test('listEntries: 11 колонок — часы числом/null/нормализация строки', () => {
        const ws = loadWS(mkSheets());
        const res = ws.listEntries({ token: 't', year: 2026, month: 9 });
        assertTrue(res.ok, 'запрос ок');
        assertEqual(res.data.entries.length, 3, 'три записи сентября');
        const byTabDate = {};
        res.data.entries.forEach(function(e) { byTabDate[e['таб_номер'] + e['дата']] = e; });
        assertEqual(byTabDate['0232026-09-05']['часы'], 7.2, 'число 7,2');
        assertEqual(byTabDate['08712026-09-06']['часы'], null, 'пусто → null');
        assertEqual(byTabDate['0232026-09-07']['часы'], 7.2, 'строка «7,2» → 7,2');
    });

    test('listEntries: мусорные часы (30/abc/0) → null', () => {
        const sheets = mkSheets();
        sheets['Записи_графика'].rows.push(
            [new Date(2026, 8, 8), '099', 'д', 0, 0, 'руч', new Date(), '', '', '', 30],
            [new Date(2026, 8, 9), '099', 'д', 0, 0, 'руч', new Date(), '', '', '', 'abc'],
            [new Date(2026, 8, 10), '099', 'д', 0, 0, 'руч', new Date(), '', '', '', 0]);
        const ws = loadWS(sheets);
        const res = ws.listEntries({ token: 't', year: 2026, month: 9 });
        const bad = res.data.entries.filter(function(e) { return e['таб_номер'] === '099'; });
        assertEqual(bad.length, 3, 'три записи 099');
        bad.forEach(function(e) {
            assertEqual(e['часы'], null, 'мусорные часы → null (' + e['дата'] + ')');
        });
    });

    test('setManualEntry: валидные часы — ок, колонка K обновлена', () => {
        const sheets = mkSheets();
        const ws = loadWS(sheets);
        const res = ws.setManualEntry(Object.assign({}, TOK, {
            date: '2026-09-05', 'таб_номер': '023', 'статус': 'д',
            'переработка': 0, 'замещает': null, 'комментарий': '', 'часы': 4.5
        }));
        assertTrue(res.ok, 'правка ок');
        assertEqual(res.data['часы'], 4.5, 'часы в ответе');
        const row = sheets['Записи_графика'].rows[1];
        assertEqual(row[10], 4.5, 'колонка K (11-я) = 4,5');
        assertEqual(row[2], 'д', 'статус сохранён');
        assertEqual(row[5], 'руч', 'источник руч');
    });

    test('setManualEntry: часы строкой «7,2» — нормализуются', () => {
        const sheets = mkSheets();
        const ws = loadWS(sheets);
        const res = ws.setManualEntry(Object.assign({}, TOK, {
            date: '2026-09-05', 'таб_номер': '023', 'статус': 'д', 'часы': '7,2'
        }));
        assertTrue(res.ok, 'строка принята');
        assertEqual(res.data['часы'], 7.2, '7,2 числом');
        assertEqual(sheets['Записи_графика'].rows[1][10], 7.2, 'K = 7,2');
    });

    test('setManualEntry: новые часы ЗАТРАЮТ старые (обновление строки)', () => {
        const sheets = mkSheets();
        const ws = loadWS(sheets);
        ws.setManualEntry(Object.assign({}, TOK, {
            date: '2026-09-05', 'таб_номер': '023', 'статус': 'д', 'часы': 6
        }));
        assertEqual(sheets['Записи_графика'].rows.length, 4, 'строка не дублировалась');
        assertEqual(sheets['Записи_графика'].rows[1][10], 6, 'новые часы в K');
    });

    test('setManualEntry: null/undefined часы → null в K (смена статуса чистит)', () => {
        const sheets = mkSheets();
        const ws = loadWS(sheets);
        // обновление БЕЗ поля часы (старый клиент) — часы остаются
        ws.setManualEntry(Object.assign({}, TOK, {
            date: '2026-09-05', 'таб_номер': '023', 'статус': 'д'
        }));
        assertEqual(sheets['Записи_графика'].rows[1][10], 7.2,
            'старый клиент не затирает часы (undefined игнор)');
        // новый клиент шлёт null явно — чистим
        ws.setManualEntry(Object.assign({}, TOK, {
            date: '2026-09-05', 'таб_номер': '023', 'статус': 'д', 'часы': null
        }));
        assertEqual(sheets['Записи_графика'].rows[1][10], null, 'null — чистит K');
    });

    test('setManualEntry: вставка новой строки с часами (K в комплекте)', () => {
        const sheets = mkSheets();
        const ws = loadWS(sheets);
        const res = ws.setManualEntry(Object.assign({}, TOK, {
            date: '2026-09-20', 'таб_номер': '077', 'статус': 'н', 'часы': 11
        }));
        assertTrue(res.ok, 'вставка ок');
        assertEqual(sheets['Записи_графика'].rows.length, 5, 'строка добавлена');
        const row = sheets['Записи_графика'].rows[4];
        assertEqual(row[10], 11, 'K = 11 в новой строке');
        assertEqual(row[1], '077', 'таб_номер');
    });

    test('setManualEntry: негодные часы → invalid_часы', () => {
        const ws = loadWS(mkSheets());
        ['0,2', '25', 'abc', -1].forEach(function(bad) {
            const res = ws.setManualEntry(Object.assign({}, TOK, {
                date: '2026-09-05', 'таб_номер': '023', 'статус': 'д', 'часы': bad
            }));
            assertFalse(res.ok, 'отказ для «' + bad + '»');
            assertTrue(String(res.error).indexOf('invalid_часы') === 0,
                'код ошибки invalid_часы');
        });
    });

    test('JS-текст: комментарий структуры — колонка K задокументирована', () => {
        assertTrue(WS_GS_SRC.indexOf('//   K: часы (Task 322') !== -1,
            'структура листа описывает K');
        assertTrue(WS_GS_SRC.indexOf('_wsNumOrNull') !== -1, 'хелпер нормализации часов');
        // Task 523: listEntries читает 13 колонок — K часы + L/M времена
        assertTrue(WS_GS_SRC.indexOf('lastRow - 1, 13') !== -1,
            'listEntries читает 13 колонок (K+L/M, Task 523)');
    });
});

// ============================================================
// 10. Шапка словами + Переработка (строки таблицы)
// ============================================================
describe('Task 322 — итоги: слова в шапке и колонка Переработка', () => {

    const host = wsHost(['_codeHours', '_totalsZero', '_totalsAgg', '_statusMeta',
                         '_empTypeMap', '_overHours', '_totalsEffectiveEntries',
                         '_fmtTotalsNum', '_esc', '_setTtWarn', '_renderTotalsMonth'], {
        _year: 2026,
        _month: 9,
        _EMPLOYEES: [
            { 'таб_номер': '0871', 'ФИО': 'Иванов И.И.', 'тип': 'сменный' },
            { 'таб_номер': '023', 'ФИО': 'Петров П.П.', 'тип': 'дневной' }
        ],
        _ENTRIES: [
            { 'дата': '2026-09-01', 'таб_номер': '0871', 'статус': 'Д' },
            { 'дата': '2026-09-05', 'таб_номер': '0871', 'статус': 'д' },
            { 'дата': '2026-09-06', 'таб_номер': '023', 'статус': 'д', 'часы': 7.2 }
        ],
        _PENDING: {},
        // Task 323: рендер зовёт _applyTtHeadVar/_fitGrid/_syncTotalsRows
        _applyTtHeadVar: function() { return false; },
        _fitGrid: function() {},
        _syncTotalsRows: function() {},
        _STATUS_CODES: [
            { code: 'Д', name: 'День (12-час)' },
            { code: 'д', name: 'День в вых./праздник' }
        ]
        // Task 324: инфо-строка wsTtInfo удалена — ⚠ шапки (пустая на месяце)
    }, mockDoc({ wsTtBody: { innerHTML: '', querySelector: function() { return null; } },
                 wsTtWarn: { textContent: '', hidden: true, attrs: {},
                             setAttribute: function(k, v) { this.attrs[k] = v; } } }));

    test('шапка: полный набор слов (День/Ночь/Отпуск/Уч. отпуск/Отгул/Больничный/Прогул/Переработка)', () => {
        host._renderTotalsMonth();
        const h = host._els ? '' : null; // (не используется — читаем ниже)
        const body = (function() {
            const els = { wsTtBody: { innerHTML: '', querySelector: function() { return null; } },
                          // Task 324: инфо удалена — ⚠ шапки
                          wsTtWarn: { textContent: '', hidden: true, attrs: {},
                                      setAttribute: function(k, v) { this.attrs[k] = v; } } };
            const host2 = wsHost(['_codeHours', '_totalsZero', '_totalsAgg', '_statusMeta',
                                   '_empTypeMap', '_overHours', '_totalsEffectiveEntries',
                                   '_fmtTotalsNum', '_esc', '_setTtWarn', '_renderTotalsMonth'], {
                _year: 2026, _month: 9,
                // Task 327: доп. столбцы — за кнопкой «Ещё» (_totalsExtra)
                _totalsExtra: true,
                _EMPLOYEES: host._EMPLOYEES, _ENTRIES: host._ENTRIES,
                _PENDING: {},
                _applyTtHeadVar: function() { return false; },
                _fitGrid: function() {},
                _syncTotalsRows: function() {},
                _STATUS_CODES: host._STATUS_CODES
            }, mockDoc(els));
            host2._renderTotalsMonth();
            return els.wsTtBody.innerHTML;
        })();
        assertTrue(body.indexOf('День (Д)') !== -1, 'День (Д)');
        assertTrue(body.indexOf('Ночь (Н)') !== -1, 'Ночь (Н)');
        assertTrue(body.indexOf('Отпуск (ОТ)') !== -1, 'Отпуск (ОТ)');
        assertTrue(body.indexOf('Уч. отпуск (У)') !== -1, 'Уч. отпуск (У)');
        assertTrue(body.indexOf('Отгул (ОВ)') !== -1, 'Отгул (ОВ)');
        assertTrue(body.indexOf('Больничный (Б)') !== -1, 'Больничный (Б)');
        assertTrue(body.indexOf('Прогул (ПР)') !== -1, 'Прогул (ПР)');
        assertTrue(body.indexOf('Переработка') !== -1, 'Переработка');
        assertTrue(body.indexOf('Прочие') !== -1, 'Прочие');
        // Task 327 (заявка): столбца «Всего» больше нет
        assertFalse(body.indexOf('<th>Всего</th>') !== -1, 'столбца «Всего» нет (заявка)');
    });

    test('строки: переработка сменного 12 и дневного 7,2 + итог 19,2', () => {
        const els = { wsTtBody: { innerHTML: '', querySelector: function() { return null; } },
                      // Task 324: инфо удалена — ⚠ шапки
                      wsTtWarn: { textContent: '', hidden: true, attrs: {},
                                  setAttribute: function(k, v) { this.attrs[k] = v; } } };
        const host2 = wsHost(['_codeHours', '_totalsZero', '_totalsAgg', '_statusMeta',
                               '_empTypeMap', '_overHours', '_totalsEffectiveEntries',
                               '_fmtTotalsNum', '_esc', '_setTtWarn', '_renderTotalsMonth'], {
            _year: 2026, _month: 9,
            _EMPLOYEES: host._EMPLOYEES, _ENTRIES: host._ENTRIES,
            _PENDING: {},
            _applyTtHeadVar: function() { return false; },
            _fitGrid: function() {},
            _syncTotalsRows: function() {},
            _STATUS_CODES: host._STATUS_CODES
        }, mockDoc(els));
        host2._renderTotalsMonth();
        const b = els.wsTtBody.innerHTML;
        // ЧАСЫ остаются часами (это их столбец): Иванов Д=12
        assertTrue(b.indexOf('>12</td>') !== -1, 'Иванов (сменный): 12 ч в ЧАСАХ');
        // Task 327 (заявка): итоговой строки нет — 19,2 не выводится
        assertFalse(b.indexOf('>19,2</td>') !== -1,
            'итоговой строки нет (заявка Task 327)');
        // Task 329 (заявка): ПЕРЕРАБОТКА — в ДНЯХ (по 1 дню у обоих),
        // ЧАСЫ — в тултипе ячейки (Петров 7,2 — только в тултипе)
        assertTrue(/ws-tt-over[^>]*>1<\/td>/.test(b),
            'переработка в ДНЯХ: по 1 дню (Task 329)');
        assertTrue(b.indexOf('title="часов переработки: 12 (коды д/н)"') !== -1,
            'часы переработки в тултипе (сменный 12)');
        assertTrue(b.indexOf('title="часов переработки: 7,2 (коды д/н)"') !== -1,
            'часы в тултипе (дневной 7,2)');
        assertFalse(/ws-tt-over[^>]*>7,2<\/td>/.test(b),
            'часов в значении переработки нет (Task 329)');
    });
});

// ============================================================
// 11. SW: версия кэша
// ============================================================
describe('Task 322 — SW: версия кэша', () => {
    test('SW: кэш поднят до kipia-test-v749 (Task 322)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v749'") !== -1,
            'CACHE_VERSION = kipia-test-v749');
        assertFalse(SW_SRC.indexOf('kipia-test-v750') !== -1,
            'v566 не существует (один инкремент на Task 326)');
    });
});
