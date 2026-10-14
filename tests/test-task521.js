// tests/test-task521.js
// Task 521 — по заявке пользователя: «В разделе Табель учёта рабочего
// времени, при выборе дневному персоналу в шахматке код "д-день
// выходной", часы переработки в этот день должны рассчитываться
// автоматически в зависимости от введённых данных время начала и
// время окончания работ в этот день».
//
// ЧТО ИЗМЕНЕНО (малая форма д/н в попапе ячейки, Task 322):
//   • поле «Часы переработки в этот день» (ручной ввод 0,5..24,
//     #wsDnHours) ЗАМЕНЕНО парой полей type=time: «Время начала
//     работ» (#wsDnStart) и «Время окончания работ» (#wsDnEnd);
//   • часы = «окончание − начало»; окончание раньше начала — работа
//     через полночь (+24 ч); одинаковое время и меньше 0,5 ч —
//     ошибка-тост (диапазон сервера 0,5..24; больше 24 из двух
//     моментов суток получить нельзя);
//   • живая строка расчёта #wsDnCalc («Переработка: N ч», «N ч (через
//     полночь)», «Переработка: —») — dnHoursRecalc (oninput);
//   • префилл: «д» — 07:30, «н» — 19:30; длительность — часы той же
//     записи/правки, иначе 8 ч (дефолт Task 322 сохранён);
//   • результат прежний: _applyCellStatus(…, часы) → _PENDING/колонка
//     K «Записи_графика» — сервер НЕ меняется; шит «Дополнительно…»
//     (#wsCellHours, прямая правка часов) не тронут — вне заявки.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   Клиент SRC: два поля type=time + подписи; oninput dnHoursRecalc;
//   строка #wsDnCalc; янтарный .ws-dn-calc (обе темы); .ws-dn-times;
//   старое поле/тосты УДАЛЕНЫ; шит «Дополнительно…» цел; индикатор
//   type=time инвертирован в тёмной теме.
//   Клиент VM: префиллы (д/н/свои часы/чужой код); dnHoursRecalc
//   (обычный/через полночь/прочерк); applyDnHours (точные часы,
//   округление, полночь, 3 класса ошибок); _dnParseTime;
//   _dnMinutesToHHMM.
//   SW: kipia-test-v738.
//
// Запуск: через tests/run-all.js (require './test-task521.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const WS_CLIENT = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// Вырезка метода (как в test-task322.js)
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
// 1. SRC: разметка малой формы — время вместо часов
// ============================================================
describe('Task 521 — SRC: поля времени в малой форме', () => {
    test('SRC: два поля type=time #wsDnStart/#wsDnEnd с подписями', () => {
        assertTrue(INDEX_SRC.indexOf('type="time" id="wsDnStart"') !== -1,
            'поле начала — type=time');
        assertTrue(INDEX_SRC.indexOf('type="time" id="wsDnEnd"') !== -1,
            'поле окончания — type=time');
        assertTrue(INDEX_SRC.indexOf('for="wsDnStart">Время начала работ') !== -1,
            'подпись «Время начала работ»');
        assertTrue(INDEX_SRC.indexOf('for="wsDnEnd">Время окончания работ') !== -1,
            'подпись «Время окончания работ»');
        assertTrue(INDEX_SRC.indexOf('oninput="WorkSchedule.dnHoursRecalc()"') !== -1,
            'живой пересчёт на вводе');
        const n = INDEX_SRC.split('oninput="WorkSchedule.dnHoursRecalc()"').length - 1;
        assertEqual(n, 2, 'oninput у ОБОИХ полей');
    });

    test('SRC: строка живого расчёта #wsDnCalc в форме', () => {
        const m = methodText(WS_CLIENT, '_renderDnHoursForm');
        assertTrue(m.indexOf('id="wsDnCalc"') !== -1, 'элемент расчёта есть');
        assertTrue(m.indexOf('Переработка: ') !== -1, 'подпись «Переработка:»');
    });

    test('SRC: старое поле часов и старые тосты УДАЛЕНЫ', () => {
        assertTrue(INDEX_SRC.indexOf('wsDnHours') === -1,
            'поля #wsDnHours больше нет');
        assertTrue(INDEX_SRC.indexOf('Часы переработки в этот день') === -1,
            'старой подписи нет');
        assertTrue(INDEX_SRC.indexOf('Укажите часы от 0,5 до 24') === -1,
            'старого тоста диапазона нет');
        // шит «Дополнительно…» НЕ тронут (прямая правка часов — вне заявки)
        assertTrue(INDEX_SRC.indexOf('id="wsCellHours"') !== -1,
            'поле «Часы» шита «Дополнительно…» на месте');
    });

    test('SRC: подсказка — расчёт автоматический, полночь учтена', () => {
        const m = methodText(WS_CLIENT, '_renderDnHoursForm');
        assertTrue(m.indexOf('рассчитываются автоматически') !== -1,
            'подсказка про автоматический расчёт');
        assertTrue(m.indexOf('через полночь учитывается') !== -1,
            'упоминание работы через полночь');
    });

    test('SRC: applyDnHours — расчёт из двух времён', () => {
        const m = methodText(WS_CLIENT, 'applyDnHours');
        assertTrue(m.indexOf('_dnParseTime') !== -1, 'парсинг обоих полей');
        assertTrue(m.indexOf('24 * 60') !== -1, 'переход через полночь (+24 ч)');
        assertTrue(m.indexOf('Math.round(val * 10) / 10') !== -1,
            'округление к 0,1 ч — как в итогах/сервере');
        assertTrue(m.indexOf('Укажите время начала и окончания работ') !== -1,
            'тост про незаполненное время');
    });

    test('SRC: префилл — 7:30/19:30 + часы записи (дефолт 8)', () => {
        const m = methodText(WS_CLIENT, '_renderDnHoursForm');
        assertTrue(m.indexOf('19 * 60 + 30') !== -1, '«н» — с 19:30');
        assertTrue(m.indexOf('7 * 60 + 30') !== -1, '«д» — с 7:30');
        assertTrue(m.indexOf('_dnMinutesToHHMM') !== -1, 'перевод минут в чч:мм');
        assertTrue(m.indexOf(': 8') !== -1, 'дефолт 8 ч сохранён (Task 322)');
    });
});

// ============================================================
// 2. SRC: CSS — пара полей, янтарная строка расчёта, индикатор
// ============================================================
describe('Task 521 — SRC: CSS формы времени', () => {
    test('CSS: .ws-dn-times — пара полей в ряд', () => {
        assertTrue(/\.ws-dn-times\s*\{[^}]*display:\s*flex/.test(INDEX_SRC),
            'строка полей — flex');
        assertTrue(/\.ws-dn-time\s*\{[^}]*flex-direction:\s*column/.test(INDEX_SRC),
            'каждое поле — колонка (подпись над вводом)');
    });

    test('CSS: .ws-dn-calc — янтарная, как «Переработка» итогов', () => {
        const d = INDEX_SRC.match(/\.ws-dn-calc\s*\{[^}]*\}/);
        assertTrue(!!d && d[0].indexOf('#e0a23c') !== -1,
            'янтарный цвет (тёмная, как ws-tt-over)');
        const l = INDEX_SRC.match(/\[data-theme="light"\] \.ws-dn-calc\s*\{[^}]*\}/);
        assertTrue(!!l && l[0].indexOf('#a06a13') !== -1, 'янтарный в светлой теме');
    });

    test('CSS: индикатор type=time инвертирован в тёмной теме', () => {
        const d = INDEX_SRC.match(/\.ws-dn-input::-webkit-calendar-picker-indicator\s*\{[^}]*\}/);
        assertTrue(!!d && d[0].indexOf('invert') !== -1,
            'invert для тёмной темы (Chromium/Electron)');
        assertTrue(/\[data-theme="light"\] \.ws-dn-input::-webkit-calendar-picker-indicator\s*\{[^}]*filter:\s*none/.test(INDEX_SRC),
            'в светлой — без фильтра');
    });
});

// ============================================================
// 3. VM: малая форма — префиллы
// ============================================================
describe('Task 521 — VM: префиллы формы времени', () => {

    const popupEl = { innerHTML: '' };
    const startMock = { value: '', focus: function() {} };
    const endMock = { value: '', focus: function() {} };
    const calcMock = { textContent: '' };

    const STATUS_CODES = [
        { code: 'д', name: 'День в вых./праздник', color: '#FFD54F' },
        { code: 'н', name: 'Ночь в вых./праздник', color: '#78909C' }
    ];

    function makeFormHost(effEntry) {
        const applied = [];
        const host = wsHost(['_renderDnHoursForm', 'dnHoursRecalc', 'applyDnHours',
                              'dnHoursBack', '_dnParseTime', '_dnMinutesToHHMM',
                              '_statusMeta', '_esc', '_escAttr', '_fmtTotalsNum'], {
            _popupCell: { date: '2026-10-10', 'таб_номер': '023' },
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

    test('префилл «д» (новая запись): 07:30–15:30, расчёт 8 ч', () => {
        const host = makeFormHost(null);
        host._renderDnHoursForm('д', '2026-10-10', '023');
        const h = popupEl.innerHTML;
        assertTrue(h.indexOf('2026-10-10') !== -1 && h.indexOf('Петров П.П.') !== -1,
            'заголовок: дата · ФИО');
        assertTrue(h.indexOf('value="07:30"') !== -1, 'начало — 7:30 (дневная смена)');
        assertTrue(h.indexOf('value="15:30"') !== -1, 'окончание — 15:30 (8 ч)');
        assertTrue(h.indexOf('Переработка: 8 ч') !== -1, 'строка расчёта — 8 ч');
        assertTrue(h.indexOf('Готово') !== -1 && h.indexOf('Назад к кодам') !== -1,
            'кнопки Готово/Назад');
        assertTrue(h.indexOf("event.key==='Enter'") !== -1, 'Enter применяет');
    });

    test('префилл «н» (новая запись): 19:30–03:30', () => {
        const host = makeFormHost(null);
        host._renderDnHoursForm('н', '2026-10-10', '023');
        const h = popupEl.innerHTML;
        assertTrue(h.indexOf('value="19:30"') !== -1, 'начало — 19:30 (ночь)');
        assertTrue(h.indexOf('value="03:30"') !== -1, 'окончание — 03:30 (8 ч, через полночь)');
    });

    test('префилл: существующие часы 7,2 → 07:30–14:42', () => {
        const host = makeFormHost({ 'статус': 'д', 'часы': 7.2 });
        host._renderDnHoursForm('д', '2026-10-10', '023');
        const h = popupEl.innerHTML;
        assertTrue(h.indexOf('value="07:30"') !== -1, 'начало прежнее');
        assertTrue(h.indexOf('value="14:42"') !== -1, 'окончание = 7:30 + 7,2 ч');
        assertTrue(h.indexOf('Переработка: 7,2 ч') !== -1, 'строка расчёта — 7,2 ч');
    });

    test('префилл: чужой код в записи — дефолт 8 ч (не чужие часы)', () => {
        const host = makeFormHost({ 'статус': 'Д', 'часы': 12 });
        host._renderDnHoursForm('д', '2026-10-10', '023');
        assertTrue(popupEl.innerHTML.indexOf('value="15:30"') !== -1,
            'берутся часы только того же кода (иначе 8)');
    });
});

// ============================================================
// 4. VM: dnHoursRecalc — живая строка расчёта
// ============================================================
describe('Task 521 — VM: dnHoursRecalc', () => {

    const popupEl = { innerHTML: '' };
    const startMock = { value: '', focus: function() {} };
    const endMock = { value: '', focus: function() {} };
    const calcMock = { textContent: '' };

    function recalcHost() {
        return wsHost(['dnHoursRecalc', '_dnParseTime', '_fmtTotalsNum'], {},
            mockDoc({ wsDnStart: startMock, wsDnEnd: endMock, wsDnCalc: calcMock }));
    }

    test('08:00–15:12 → «Переработка: 7,2 ч»', () => {
        const host = recalcHost();
        startMock.value = '08:00'; endMock.value = '15:12';
        host.dnHoursRecalc();
        assertEqual(calcMock.textContent, 'Переработка: 7,2 ч', 'точные минуты');
    });

    test('19:30–07:30 → «12 ч (через полночь)»', () => {
        const host = recalcHost();
        startMock.value = '19:30'; endMock.value = '07:30';
        host.dnHoursRecalc();
        assertEqual(calcMock.textContent, 'Переработка: 12 ч (через полночь)',
            'ночь через полночь');
    });

    test('16:00–01:00 → «9 ч (через полночь)»', () => {
        const host = recalcHost();
        startMock.value = '16:00'; endMock.value = '01:00';
        host.dnHoursRecalc();
        assertEqual(calcMock.textContent, 'Переработка: 9 ч (через полночь)',
            'вечерняя работа за полночь');
    });

    test('незаполненное/негодное → «Переработка: —»', () => {
        const host = recalcHost();
        [['', ''], ['', '15:00'], ['08:00', ''], ['08:00', 'abc'],
         ['08:00', '25:70']].forEach(function(pair) {
            startMock.value = pair[0]; endMock.value = pair[1];
            host.dnHoursRecalc();
            assertEqual(calcMock.textContent, 'Переработка: —',
                'прочерк для «' + pair[0] + '»–«' + pair[1] + '»');
        });
    });
});

// ============================================================
// 5. VM: applyDnHours — расчёт и применение
// ============================================================
describe('Task 521 — VM: applyDnHours', () => {

    const TOASTS = [];
    const popupEl = { innerHTML: 'FORM' };
    const startMock = { value: '', focus: function() {} };
    const endMock = { value: '', focus: function() {} };
    const calcMock = { textContent: '' };

    function toastOn() {
        TOASTS.length = 0;
        global.KipToast = { show: function(m) { TOASTS.push(m); } };
    }
    function toastOff() { delete global.KipToast; }

    function makeHost() {
        const applied = [];
        const host = wsHost(['applyDnHours', 'dnHoursRecalc', '_dnParseTime',
                             '_dnMinutesToHHMM'], {
            _popupCell: { date: '2026-10-10', 'таб_номер': '023' },
            _applyCellStatus: function(d, t, c, h) { applied.push({ c: c, h: h }); },
            closeCellPopup: function() { popupEl.innerHTML = ''; },
            _renderGrid: function() {},
            _updateSaveBtn: function() {}
        }, mockDoc({ wsDnStart: startMock, wsDnEnd: endMock, wsDnCalc: calcMock }));
        host.__applied = applied;
        return host;
    }

    test('08:00–15:12 → правка 7,2 ч; попап закрыт; без тостов', () => {
        toastOn();
        try {
            const host = makeHost();
            startMock.value = '08:00'; endMock.value = '15:12';
            host.applyDnHours('д');
            assertEqual(host.__applied.length, 1, 'правка применена');
            assertEqual(host.__applied[0].c, 'д', 'код д');
            assertTrue(Math.abs(host.__applied[0].h - 7.2) < 1e-9, 'часы 7,2 (из минут)');
            assertEqual(popupEl.innerHTML, '', 'попап закрыт');
            assertEqual(TOASTS.length, 0, 'без тостов');
        } finally { toastOff(); }
    });

    test('07:00–14:10 → округление к 0,1 (7,1667 → 7,2)', () => {
        toastOn();
        try {
            const host = makeHost();
            startMock.value = '07:00'; endMock.value = '14:10';
            host.applyDnHours('д');
            assertTrue(Math.abs(host.__applied[0].h - 7.2) < 1e-9, 'округлено к 7,2');
        } finally { toastOff(); }
    });

    test('через полночь: 19:30–07:30 → 12 ч; 16:00–01:00 → 9 ч', () => {
        toastOn();
        try {
            const host = makeHost();
            startMock.value = '19:30'; endMock.value = '07:30';
            host.applyDnHours('н');
            assertTrue(Math.abs(host.__applied[0].h - 12) < 1e-9, 'ночь 12 ч');
            const host2 = makeHost();
            startMock.value = '16:00'; endMock.value = '01:00';
            host2.applyDnHours('д');
            assertTrue(Math.abs(host2.__applied[0].h - 9) < 1e-9, 'вечер за полночь 9 ч');
        } finally { toastOff(); }
    });

    test('ошибки: пусто/негодно/совпало/меньше 0,5 — тост, правки нет', () => {
        toastOn();
        try {
            const cases = [
                ['', '15:00', 'Укажите время начала и окончания'],
                ['07:30', '', 'Укажите время начала и окончания'],
                ['07:30', '25:70', 'Укажите время начала и окончания'],
                ['08:00', '08:00', 'совпадает с временем начала'],
                ['08:00', '08:20', 'меньше 0,5 ч']
            ];
            cases.forEach(function(c) {
                const host = makeHost();
                popupEl.innerHTML = 'FORM';
                startMock.value = c[0]; endMock.value = c[1];
                host.applyDnHours('д');
                assertEqual(host.__applied.length, 0,
                    'правки нет для «' + c[0] + '»–«' + c[1] + '»');
                assertTrue(popupEl.innerHTML.indexOf('FORM') !== -1, 'форма остаётся');
                assertTrue(TOASTS.length >= 1 && TOASTS[TOASTS.length - 1].indexOf(c[2]) !== -1,
                    'тост поясняет: «' + c[2] + '»');
                TOASTS.length = 0;
            });
        } finally { toastOff(); }
    });
});

// ============================================================
// 6. VM: хелперы времени
// ============================================================
describe('Task 521 — VM: _dnParseTime / _dnMinutesToHHMM', () => {

    const host = wsHost(['_dnParseTime', '_dnMinutesToHHMM'], {}, null);

    test('_dnParseTime: «чч:мм» → минуты; негодное → null', () => {
        assertEqual(host._dnParseTime('7:30'), 450, '«7:30» → 450');
        assertEqual(host._dnParseTime('07:30'), 450, '«07:30» → 450');
        assertEqual(host._dnParseTime('23:59'), 1439, '«23:59» → 1439');
        assertEqual(host._dnParseTime('0:00'), 0, '«0:00» → 0');
        assertEqual(host._dnParseTime(''), null, 'пусто → null');
        assertEqual(host._dnParseTime('25:00'), null, 'час > 23 → null');
        assertEqual(host._dnParseTime('12:60'), null, 'минуты > 59 → null');
        assertEqual(host._dnParseTime('7:3'), null, 'минуты одной цифрой → null');
        assertEqual(host._dnParseTime('0730'), null, 'без двоеточия → null');
        assertEqual(host._dnParseTime('abc'), null, 'мусор → null');
    });

    test('_dnMinutesToHHMM: минуты → «чч:мм» (модуль 24 ч)', () => {
        assertEqual(host._dnMinutesToHHMM(450), '07:30', '450 → 07:30');
        assertEqual(host._dnMinutesToHHMM(882), '14:42', '882 → 14:42');
        assertEqual(host._dnMinutesToHHMM(210), '03:30', '210 → 03:30');
        assertEqual(host._dnMinutesToHHMM(0), '00:00', '0 → 00:00');
        assertEqual(host._dnMinutesToHHMM(1440), '00:00', 'сутки → 00:00');
        assertEqual(host._dnMinutesToHHMM(1650), '03:30', '1650 → 03:30 (за полночь)');
        assertEqual(host._dnMinutesToHHMM(-30), '23:30', 'отрицательные заворачиваются');
    });
});

// ============================================================
// 7. SW: версия кэша
// ============================================================
describe('Task 521 — SW: версия кэша', () => {
    test('SW: кэш поднят до kipia-test-v738 (Task 521)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v738'") !== -1,
            'CACHE_VERSION = kipia-test-v738');
        assertFalse(SW_SRC.indexOf('kipia-test-v739') !== -1,
            'v735 не существует (один инкремент на Task 521)');
    });
});
