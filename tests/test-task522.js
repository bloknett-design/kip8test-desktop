// tests/test-task522.js
// Task 522 — по заявке пользователя: «При нажатии или наведении курсора
// мыши на ячейку с кодом «д» для дневного персонала, должен появляться
// попап с информацией по этому коду и временем работы. И у меня вопрос
// по этому поводу, где хранятся данные по установленному времени в этом
// коде для дневного персонала?»
//
// ОТВЕТ НА ВОПРОС (зафиксирован тестами): «время» для «д»/«н» дневного
// персонала хранится ТОЛЬКО в виде часов — КОЛОНКА K «часы» листа
// «Записи_графика» (Task 322; сервер WorkSchedule.gs applyCellStatus,
// диапазон 0,5..24, округление к 0,1). Времена начала/окончания из
// малой формы (Task 521) НИГДЕ не сохраняются — из них вычисляются
// часы, и только число пишется в K. Колонка J «комментарий» — отдельное
// свободное поле, времени там нет. Поэтому секция показывает
// «Время работы: N ч» из K; точные чч:мм восстановить нельзя.
//
// ЧТО ИЗМЕНЕНО (окно «Мероприятия в этот день» — клик зрителя/
// редактора и десктоп-ховер Task 487; КЛИЕНТ-ONLY, данные/сервер
// не тронуты):
//   • НОВАЯ секция «Статус дня» (_renderDnDayInfo, гейт-предикат
//     _dnDayInfoAt: эффективный статус «д»/«н» + сотрудник НЕ сменный
//     — как малая форма Task 322/521): свотч + код + ПОЛНОЕ название
//     из справочника «Коды_статусов» («информация по коду» из заявки;
//     переносится строками) + «Время работы: N ч» из колонки K
//     (янтарь #e0a23c/#a06a13 — как расчёт малой формы Task 521 и
//     колонка «Переработка» итогов; формат с запятой — _fmtTotalsNum;
//     пусто — курсив «не указано») + italic «Авто: замещение отпуска»
//     для материализованных авто-«д»/«н» (Task 458);
//   • секция вставлена в _renderEventsPopup ПОД подзаголовком «дата ·
//     ФИО», НАД списком мероприятий; гвард typeof — старые VM-хосты
//     без новых хелперов не падают (секции нет, прежний рендер);
//   • onCellHover: ховер открывает окно и БЕЗ мероприятий, если у
//     ячейки есть д/н-справка (десктоп ≥1024px + мышь — гейты Task 487
//     не тронуты; сменный «д»/«н» без мероприятий окно по-прежнему не
//     открывает);
//   • клик (зритель — окно мероприятий; редактор — окно кодов + окно
//     мероприятий сверху) получает секцию автоматически — тот же
//     _renderEventsPopup.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   SRC: _dnDayInfoAt (гейты д/н + не сменный + _effectiveEntry);
//   _renderDnDayInfo (свотч/код/название/время/авто); интеграция в
//   _renderEventsPopup (гвард typeof, порядок секция→мероприятия);
//   гейт onCellHover (мероприятия ИЛИ д/н-справка); окно справочное —
//   в секции НЕТ onclick; Task 522 в комментариях.
//   CSS: .ws-dn-info в окне (отступ/разделитель), янтарь времени
//   (обе темы), курсив «не указано», перенос названия.
//   VM: _dnDayInfoAt (д/н/сменный/прочие коды/пустая ячейка/_PENDING
//   правки/авто-реестр); _renderDnDayInfo (часы/не указано/валидация
//   часов/эскейп/авто); интеграция окна (секция+«нет мероприятий»,
//   секция+мероприятие и ПОРЯДОК, без д/н — регресс Task 313/487);
//   onCellHover (день-«д» без мероприятий открывает; сменный — нет;
//   день+мероприятие — секция И событие); старые VM-хосты — гварды
//   (_renderEventsPopup без _renderDnDayInfo, onCellHover без
//   _dnDayInfoAt — не падают).
//   SW: kipia-test-v753.
//
// Запуск: через tests/run-all.js (require './test-task522.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const WS_CLIENT = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// Вырезка метода (как в test-task322/521.js)
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

// Справочник с ПОЛНЫМИ (длинными) названиями «д»/«н» — как в
// StatusCodesInit.gs (Task 524: без хвоста «в комментарии»):
// проверяем, что секция показывает именно справочное название
// (заявка: «информацией по этому коду»)
const CODES = [
    { code: 'д', color: '#FFD54F',
      name: 'День, плановая продолжительность работы в выходные и нерабочие праздничные дни, для сменного персонала дневная 12-часовая смена (с 7:30 до 19:30), для дневного персонала — с указанием продолжительности (в часах)' },
    { code: 'н', color: '#78909C',
      name: 'Ночь, плановая продолжительность работы в выходные и нерабочие праздничные дни, для сменного персонала ночная 12-часовая смена (с 19:30 до 7:30), для дневного персонала — с указанием продолжительности (в часах)' },
    { code: 'Д', color: '#FFE082', name: 'День, плановая 12-часовая смена' },
    { code: 'ОТ', color: '#ECEFF1', name: 'Отпуск' },
    { code: 'И', color: '#B3E5FC', name: 'Инструктаж' }
];
const DAY_EMP = { 'таб_номер': 23, 'ФИО': 'Петров Пётр Петрович',
                  'тип': 'дневной' };
const SHIFT_EMP = { 'таб_номер': 17, 'ФИО': 'Иванов Иван Иванович',
                    'тип': 'сменный' };

// Хост секции «Статус дня»: _dnDayInfoAt/_renderDnDayInfo + слой
// данных (_serverEntry/_effectiveEntry: _ENTRIES/_PENDING)
function loadInfoHost(employees, entries, pending, autoDn) {
    const host = wsHost(
        ['_dnDayInfoAt', '_renderDnDayInfo', '_effectiveEntry',
         '_serverEntry', '_esc', '_fmtTotalsNum', '_statusMeta'], {});
    host._EMPLOYEES = employees;
    host._ENTRIES = entries || [];
    host._PENDING = pending || {};
    host._STATUS_CODES = CODES;
    if (autoDn) host._autoDnIsKey = autoDn;
    return host;
}

// Ховер-методы читают window (matchMedia/innerWidth) — хост
// собирается как в test-task487: window+document в аргументах
// конструктора Function
function vmHostWin(methodNames, win, doc, extra) {
    const texts = methodNames.map(function(n) { return methodText(WS_CLIENT, n); });
    assertTrue(texts.every(function(t) { return t.length > 0; }),
        'ховер-методы извлекаются');
    const host = new Function('window', 'document',
        'return ({' + texts.join('\n') + '\n});')(win, doc);
    return Object.assign(host, extra);
}

// мок #wsEventsPopup (+ classList-протокол, как test-task487)
let evpRef = null;
function mockEvp() {
    const evp = {
        innerHTML: '',
        active: false,
        style: {},
        offsetWidth: 240,
        offsetHeight: 110,
        onmouseenter: null,
        onmouseleave: null,
        classList: {
            add: function() { evpRef.active = true; },
            remove: function() { evpRef.active = false; },
            contains: function() { return evpRef.active; }
        }
    };
    evpRef = evp;
    return evp;
}

const DESKTOP_EV = { target: { closest: function() { return null; } } };

// ============================================================
// 1. SRC: методы секции «Статус дня»
// ============================================================
describe('Task 522 — SRC: _dnDayInfoAt/_renderDnDayInfo', () => {
    test('SRC: _dnDayInfoAt — гейты предиката', () => {
        const t = methodText(WS_CLIENT, '_dnDayInfoAt');
        assertTrue(t.length > 0, 'метод найден');
        assertTrue(t.indexOf("code !== 'д' && code !== 'н'") !== -1,
            'только коды «д»/«н»');
        assertTrue(t.indexOf("'сменный'") !== -1,
            'смена типа сотрудника — сравнение со «сменный»');
        assertTrue(t.indexOf('if (isShift) return null;') !== -1,
            'сменному справки нет (фиксированные смены, часов нет)');
        assertTrue(t.indexOf('this._effectiveEntry(isoDate, tabNo)') !== -1,
            'эффективный статус: запись + правка _PENDING');
        assertTrue(t.indexOf("typeof this._effectiveEntry !== 'function'") !== -1,
            'гвард typeof для старых VM-хостов');
        assertTrue(t.indexOf('_autoDnIsKey') !== -1,
            'авто-«д»/«н» замещения отпуска (Task 458) — в предикате');
    });

    test('SRC: _dnDayInfoAt — часы из эффективной записи (колонка K)', () => {
        const t = methodText(WS_CLIENT, '_dnDayInfoAt');
        assertTrue(t.indexOf("eff['часы']") !== -1,
            'часы читаются из эффективной записи (колонка K «Записи_графика»)');
        assertTrue(t.indexOf('Math.round(h * 10) / 10') !== -1,
            'округление к 0,1 ч — как сервер/итоги');
        assertTrue(t.indexOf('h > 0') !== -1,
            'нулевые/отрицательные часы = «не указано»');
    });

    test('SRC: _renderDnDayInfo — состав секции', () => {
        const t = methodText(WS_CLIENT, '_renderDnDayInfo');
        assertTrue(t.length > 0, 'метод найден');
        assertTrue(t.indexOf('ws-dn-info') !== -1,
            'контейнер .ws-dn-info');
        assertTrue(t.indexOf('ws-dn-info-code') !== -1 &&
                   t.indexOf('ws-dn-info-name') !== -1,
            'код + ПОЛНОЕ название из справочника');
        assertTrue(t.indexOf('Время работы: ') !== -1,
            'строка времени работы (заявка: «и временем работы»)');
        assertTrue(t.indexOf('Время работы: не указано') !== -1,
            'пустая колонка K → «не указано»');
        assertTrue(t.indexOf('ws-dn-info-empty') !== -1,
            'курсив-класс пустого времени');
        assertTrue(t.indexOf('this._fmtTotalsNum') !== -1,
            'формат часов с запятой — как итоги/малая форма');
        assertTrue(t.indexOf('Авто: замещение отпуска') !== -1,
            'происхождение авто-«д»/«н» — italic-строка');
        assertTrue(t.indexOf('ws-popup-swatch') !== -1,
            'свотч цвета кода — как строки мероприятий');
        assertTrue(t.indexOf('this._esc(') !== -1,
            'эскейп текстов (название из справочника)');
    });

    test('SRC: секция НЕ кликабельна (окно справочное, Task 487)', () => {
        const t = methodText(WS_CLIENT, '_renderDnDayInfo');
        assertTrue(t.indexOf('onclick') === -1,
            'в секции нет ни одного onclick — чисто текстовая справка');
    });
});

// ============================================================
// 2. SRC: интеграция в окно и ховер-гейт
// ============================================================
describe('Task 522 — SRC: интеграция _renderEventsPopup/onCellHover', () => {
    test('SRC: _renderEventsPopup вызывает секцию под подзаголовком', () => {
        const t = methodText(WS_CLIENT, '_renderEventsPopup');
        assertTrue(t.length > 0, 'метод найден');
        assertTrue(t.indexOf("typeof this._renderDnDayInfo === 'function'") !== -1,
            'гвард typeof — старые VM-хосты не падают');
        const iSub = t.indexOf('ws-events-sub');
        const iDn = t.indexOf('this._renderDnDayInfo(isoDate, tabNo)');
        const iEv = t.indexOf('var dayEvents = this._eventsAt(isoDate, tabNo);');
        assertTrue(iSub !== -1 && iDn !== -1 && iEv !== -1,
            'все три блока в рендере');
        assertTrue(iSub < iDn && iDn < iEv,
            'порядок: подзаголовок → СЕКЦИЯ → список мероприятий');
    });

    test('SRC: onCellHover — окно при мероприятиях ИЛИ д/н-справке', () => {
        const h = methodText(WS_CLIENT, 'onCellHover');
        assertTrue(h.length > 0, 'метод найден');
        const iEv = h.indexOf('this._eventsAt(isoDate, tabNo).length');
        const iDn = h.indexOf('this._dnDayInfoAt(isoDate, tabNo)');
        assertTrue(iEv !== -1 && iDn !== -1,
            'оба гейта в методе');
        const gate = h.slice(iEv - 40, iDn + 40);
        assertTrue(gate.indexOf('!') !== -1 && gate.indexOf('&&') !== -1,
            'условие: НЕ мероприятия И НЕ справка → тишина');
        assertTrue(h.indexOf('Task 522') !== -1,
            'комментарий-маркер Task 522 у гейта');
    });

    test('SRC: заявка «при нажатии» — клики рендерят то же окно', () => {
        // зритель: клик → _openEventsOnlyPopup → _renderEventsPopup
        // редактор: клик → _openCellPopup → окно кодов + _renderEventsPopup
        // (сверху) — секция видна в обоих путях без отдельных правок
        const oe = methodText(WS_CLIENT, '_openEventsOnlyPopup');
        const oc = methodText(WS_CLIENT, '_openCellPopup');
        assertTrue(oe.indexOf('this._renderEventsPopup(isoDate, tabNo)') !== -1,
            'клик зрителя — окно мероприятий (с секцией)');
        assertTrue(oc.indexOf('this._renderEventsPopup(isoDate, tabNo)') !== -1,
            'клик редактора — окно мероприятий над кодами (с секцией)');
    });
});

// ============================================================
// 3. SRC: CSS секции (обе темы)
// ============================================================
describe('Task 522 — SRC: CSS секции «Статус дня»', () => {
    test('CSS: .ws-dn-info в окне — отступ и разделитель', () => {
        assertTrue(/\.ws-events-popup \.ws-dn-info\s*\{[^}]*padding/.test(INDEX_SRC),
            'секция живёт в окне мероприятий (padding)');
        assertTrue(/\.ws-events-popup \.ws-dn-info\s*\{[^}]*border-bottom/.test(INDEX_SRC),
            'разделитель под секцией (как у подзаголовка)');
    });

    test('CSS: время работы — янтарь обеих тем (как Task 521)', () => {
        assertTrue(/\.ws-dn-info-time\s*\{[^}]*color:\s*#e0a23c/.test(INDEX_SRC),
            'тёмная: #e0a23c (янтарь расчёта малой формы)');
        assertTrue(/\[data-theme="light"\] \.ws-dn-info-time\s*\{[^}]*color:\s*#a06a13/.test(INDEX_SRC),
            'светлая: #a06a13 (тот же янтарь светлее)');
        assertTrue(/\.ws-dn-info-time\.ws-dn-info-empty\s*\{[^}]*font-style:\s*italic/.test(INDEX_SRC),
            '«не указано» — курсив (читается как пропуск, не как число)');
    });

    test('CSS: название кода переносится строками', () => {
        assertTrue(/\.ws-dn-info-name\s*\{[^}]*white-space:\s*normal/.test(INDEX_SRC),
            'white-space: normal — длинное название переносится');
        assertTrue(/\.ws-dn-info-name\s*\{[^}]*line-height/.test(INDEX_SRC),
            'line-height — читаемая плотность строк');
        assertTrue(/\.ws-dn-info-row\s*\{[^}]*display:\s*flex/.test(INDEX_SRC),
            'строка «свотч+код+название» — flex');
    });
});

// ============================================================
// 4. VM: _dnDayInfoAt — предикат д/н-справки
// ============================================================
describe('Task 522 — VM: _dnDayInfoAt', () => {

    test('день «д» с часами 7,2 → объект справки', () => {
        const host = loadInfoHost(
            [DAY_EMP, SHIFT_EMP],
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д', 'часы': 7.2 }]);
        const info = host._dnDayInfoAt('2026-10-11', 23);
        assertTrue(info && info.code === 'д',
            'код «д» возвращается');
        assertEqual(info['часы'], 7.2, 'часы из записи (колонка K)');
        assertFalse(info.auto, 'не авто-запись');
        assertEqual(info.meta.name, CODES[0].name, 'мета справочника — полное название');
        assertEqual(info.meta.color, '#FFD54F', 'цвет справочника');
    });

    test('день «н» с часами 12 → объект справки', () => {
        const host = loadInfoHost(
            [DAY_EMP],
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'н', 'часы': 12 }]);
        const info = host._dnDayInfoAt('2026-10-11', 23);
        assertTrue(info && info.code === 'н', 'код «н» — симметрично «д»');
        assertEqual(info['часы'], 12, '12 ч ночная работа дневного');
    });

    test('сменному «д»/«н» — null (часов нет, смена фиксирована)', () => {
        const host = loadInfoHost(
            [SHIFT_EMP],
            [{ 'дата': '2026-10-11', 'таб_номер': 17, 'статус': 'д', 'часы': 12 }]);
        assertEqual(host._dnDayInfoAt('2026-10-11', 17), null,
            'сменный — справки нет (и ховер-гейт для него молчит)');
    });

    test('прочие коды и пустая ячейка — null', () => {
        const host = loadInfoHost(
            [DAY_EMP],
            [{ 'дата': '2026-10-05', 'таб_номер': 23, 'статус': 'Д', 'часы': 12 },
             { 'дата': '2026-10-06', 'таб_номер': 23, 'статус': 'ОТ' },
             { 'дата': '2026-10-07', 'таб_номер': 23, 'статус': '' }]);
        assertEqual(host._dnDayInfoAt('2026-10-05', 23), null,
            'заглавная «Д» — плановая смена, не д/н-справка');
        assertEqual(host._dnDayInfoAt('2026-10-06', 23), null, '«ОТ» — не справка');
        assertEqual(host._dnDayInfoAt('2026-10-07', 23), null, 'пустой статус');
        assertEqual(host._dnDayInfoAt('2026-10-08', 23), null,
            'ячейка без записи');
    });

    test('_PENDING правка перекрывает запись (эффективность)', () => {
        const host = loadInfoHost(
            [DAY_EMP],
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д', 'часы': 7.2 }],
            { '2026-10-11|23': { 'статус': 'д', 'часы': 9 } });
        assertEqual(host._dnDayInfoAt('2026-10-11', 23)['часы'], 9,
            'правка часов видна сразу после малой формы');
        // правка ставит «д» на пустую ячейку, часы ещё не введены
        const host2 = loadInfoHost(
            [DAY_EMP], [], { '2026-10-11|23': { 'статус': 'д' } });
        const info2 = host2._dnDayInfoAt('2026-10-11', 23);
        assertTrue(info2 && info2['часы'] === null,
            'новая правка без часов → null (покажется «не указано»)');
    });

    test('валидация часов: 0/отрицательные/мусор → «не указано»', () => {
        const host = loadInfoHost(
            [DAY_EMP],
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д', 'часы': 0 },
             { 'дата': '2026-10-12', 'таб_номер': 23, 'статус': 'д', 'часы': -3 },
             { 'дата': '2026-10-13', 'таб_номер': 23, 'статус': 'д', 'часы': '7,2' },
             { 'дата': '2026-10-14', 'таб_номер': 23, 'статус': 'д' }]);
        assertEqual(host._dnDayInfoAt('2026-10-11', 23)['часы'], null, '0 → null');
        assertEqual(host._dnDayInfoAt('2026-10-12', 23)['часы'], null, '-3 → null');
        assertEqual(host._dnDayInfoAt('2026-10-13', 23)['часы'], null,
            'строка «7,2» → null (только число)');
        assertEqual(host._dnDayInfoAt('2026-10-14', 23)['часы'], null, 'нет поля');
    });

    test('авто-«д»/«н» замещения отпуска — флаг из реестра Task 458', () => {
        const host = loadInfoHost(
            [DAY_EMP],
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д', 'часы': 7.2 }],
            null,
            function(key) { return key === '2026-10-11|23'; });
        assertEqual(host._dnDayInfoAt('2026-10-11', 23).auto, true,
            'реестр знает ключ → auto=true');
        assertEqual(host._dnDayInfoAt('2026-10-18', 23), null,
            'другой день — нет записи, нет справки');
    });

    test('округление часов к 0,1 (7.1667 → 7.2)', () => {
        const host = loadInfoHost(
            [DAY_EMP],
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д', 'часы': 7.16667 }]);
        assertEqual(host._dnDayInfoAt('2026-10-11', 23)['часы'], 7.2,
            'как сервер/итоги/малая форма');
    });
});

// ============================================================
// 5. VM: _renderDnDayInfo — рендер секции
// ============================================================
describe('Task 522 — VM: _renderDnDayInfo', () => {

    test('день «д» 7,2 ч: свотч + код + полное название + время', () => {
        const host = loadInfoHost(
            [DAY_EMP],
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д', 'часы': 7.2 }]);
        const html = host._renderDnDayInfo('2026-10-11', 23);
        assertTrue(html.indexOf('class="ws-dn-info"') !== -1, 'контейнер секции');
        assertTrue(html.indexOf('background:#FFD54F') !== -1, 'свотч цвета справочника');
        assertTrue(html.indexOf('class="ws-dn-info-code">д<') !== -1, 'код «д»');
        assertTrue(html.indexOf(CODES[0].name) !== -1,
            'ПОЛНОЕ справочное название — «информация по коду»');
        assertTrue(html.indexOf('Время работы: 7,2 ч') !== -1,
            'время работы с запятой (формат итогов)');
        assertFalse(html.indexOf('ws-dn-info-empty') !== -1, 'не «пустой» вариант');
        assertFalse(html.indexOf('Авто:') !== -1, 'не авто-запись');
    });

    test('часы не указаны → курсив «Время работы: не указано»', () => {
        const host = loadInfoHost(
            [DAY_EMP],
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д' }]);
        const html = host._renderDnDayInfo('2026-10-11', 23);
        assertTrue(html.indexOf('Время работы: не указано') !== -1,
            'пустая колонка K — честный прочерк');
        assertTrue(html.indexOf('ws-dn-info-empty') !== -1, 'курсив-класс');
    });

    test('авто-«д» → строка происхождения «Авто: замещение отпуска»', () => {
        const host = loadInfoHost(
            [DAY_EMP],
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д', 'часы': 8 }],
            null,
            function() { return true; });
        const html = host._renderDnDayInfo('2026-10-11', 23);
        assertTrue(html.indexOf('Авто: замещение отпуска') !== -1,
            'italic-строка происхождения');
        assertTrue(html.indexOf('ws-dn-info-auto') !== -1, 'класс строки');
    });

    test('сменный/чужой код/пусто → пустая строка (секции нет)', () => {
        const host = loadInfoHost(
            [DAY_EMP, SHIFT_EMP],
            [{ 'дата': '2026-10-05', 'таб_номер': 23, 'статус': 'Д' },
             { 'дата': '2026-10-11', 'таб_номер': 17, 'статус': 'д', 'часы': 12 }]);
        assertEqual(host._renderDnDayInfo('2026-10-05', 23), '',
            'не д/н — пусто');
        assertEqual(host._renderDnDayInfo('2026-10-11', 17), '',
            'сменный — пусто');
        assertEqual(host._renderDnDayInfo('2026-10-20', 23), '',
            'нет записи — пусто');
    });

    test('эскейп: название с HTML-символами не ломает разметку', () => {
        const host = loadInfoHost(
            [DAY_EMP],
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д', 'часы': 3 }]);
        host._STATUS_CODES = [
            { code: 'д', color: '#FFD54F',
              name: 'День <b>«д»</b> & выходной' }];
        const html = host._renderDnDayInfo('2026-10-11', 23);
        assertTrue(html.indexOf('<b>') === -1,
            'HTML из справочника экранирован');
        assertTrue(html.indexOf('&lt;b&gt;') !== -1, 'теги экранированы');
        assertTrue(html.indexOf('&amp;') !== -1, 'амперсанд экранирован');
    });
});

// ============================================================
// 6. VM: интеграция окна «Мероприятия в этот день»
// ============================================================
describe('Task 522 — VM: _renderEventsPopup с секцией', () => {

    const TRAINING = {
        id: 301, 'таб_номер': 23, тип: 'инструктаж',
        дата_начала: '2026-10-11', дата_окончания: '2026-10-11',
        тема: 'Повторный инструктаж по охране труда', выполнение: 1
    };

    function loadEventsHost(entries, trainings) {
        const host = wsHost(
            ['_renderEventsPopup', '_eventsAt', '_trainingCodeOf',
             '_statusMeta', '_isInstrType', '_instrShortOf',
             '_normInstrKey', '_fmtDateRu', '_esc', '_fmtTotalsNum',
             '_renderDnDayInfo', '_dnDayInfoAt', '_effectiveEntry',
             '_serverEntry'], {});
        host._EMPLOYEES = [DAY_EMP, SHIFT_EMP];
        host._ENTRIES = entries || [];
        host._PENDING = {};
        host._TRAININGS = trainings || [];
        host._STATUS_CODES = CODES;
        host._INSTR_LIST = [];
        return host;
    }

    test('день «д» БЕЗ мероприятий: секция + «нет мероприятий»', () => {
        const host = loadEventsHost(
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д', 'часы': 7.2 }]);
        const html = host._renderEventsPopup('2026-10-11', 23);
        assertTrue(html.indexOf('Мероприятия в этот день') !== -1, 'заголовок окна');
        assertTrue(html.indexOf('Петров Пётр Петрович') !== -1, 'подзаголовок «дата · ФИО»');
        assertTrue(html.indexOf('ws-dn-info') !== -1, 'секция «Статус дня»');
        assertTrue(html.indexOf('Время работы: 7,2 ч') !== -1, 'время работы из K');
        assertTrue(html.indexOf('нет мероприятий') !== -1,
            'пустой список мероприятий — прежнее поведение');
    });

    test('день «д» С мероприятием: секция НАД строкой события', () => {
        const host = loadEventsHost(
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д', 'часы': 7.2 }],
            [TRAINING]);
        const html = host._renderEventsPopup('2026-10-11', 23);
        const iDn = html.indexOf('ws-dn-info');
        const iEv = html.indexOf('Повторный инструктаж');
        assertTrue(iDn !== -1 && iEv !== -1, 'секция и событие в окне');
        assertTrue(iDn < iEv, 'статус дня первичнее событий (порядок)');
    });

    test('без д/н (обычная смена) — окно БЕЗ секции (регресс 313/487)', () => {
        const host = loadEventsHost(
            [{ 'дата': '2026-10-05', 'таб_номер': 23, 'статус': 'Д' }],
            [Object.assign({}, TRAINING, { дата_начала: '2026-10-05',
                                           дата_окончания: '2026-10-05' })]);
        const html = host._renderEventsPopup('2026-10-05', 23);
        assertTrue(html.indexOf('ws-dn-info') === -1,
            'нет д/н-справки — окно как прежде');
        assertTrue(html.indexOf('Повторный инструктаж') !== -1,
            'мероприятия рендерятся как раньше');
    });

    test('редактор == зритель: окно одинаковое (справочное)', () => {
        // роль не влияет на _renderEventsPopup (Task 487); секция
        // тоже не зависит от роли — справка для всех
        const host = loadEventsHost(
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д', 'часы': 7.2 }]);
        const a = host._renderEventsPopup('2026-10-11', 23);
        host._canEdit = true;
        const b = host._renderEventsPopup('2026-10-11', 23);
        assertEqual(a, b, 'HTML не зависит от роли');
    });
});

// ============================================================
// 7. VM: onCellHover — окно без мероприятий (д/н дневного)
// ============================================================
describe('Task 522 — VM: onCellHover д/н-справка', () => {

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

    function loadHoverHost(win, evp, entries, trainings) {
        return vmHostWin(
            ['onCellHover', 'onCellLeave', '_openHoverPopup',
             '_closeHoverPopup', 'closeCellPopup',
             '_renderEventsPopup', '_eventsAt', '_trainingCodeOf',
             '_statusMeta', '_isInstrType', '_instrShortOf',
             '_normInstrKey', '_fmtDateRu', '_esc', '_fmtTotalsNum',
             '_renderDnDayInfo', '_dnDayInfoAt', '_effectiveEntry',
             '_serverEntry'], win,
            { getElementById: function(id) {
                return id === 'wsEventsPopup' ? evp : null; } },
            { _EMPLOYEES: [DAY_EMP, SHIFT_EMP],
              _ENTRIES: entries || [],
              _PENDING: {},
              _TRAININGS: trainings || [],
              _STATUS_CODES: CODES,
              _INSTR_LIST: [],
              _saving: false,
              _popupCell: null,
              _hoverOn: false,
              _hoverCell: null,
              _hoverTimer: null,
              _popupClosedAt: 0 });
    }

    test('день «д» БЕЗ мероприятий — ховер открывает окно (заявка)', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, true), evp,
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д', 'часы': 7.2 }]);
        host.onCellHover(DESKTOP_EV, '2026-10-11', 23);
        assertEqual(evp.active, true, 'окно активно');
        assertEqual(host._hoverOn, true, 'ховер-флаг поднят');
        assertTrue(evp.innerHTML.indexOf('Время работы: 7,2 ч') !== -1,
            'секция со временем работы — в окне');
        assertTrue(evp.innerHTML.indexOf('нет мероприятий') !== -1,
            'пустые мероприятия показаны честно');
        assertTrue(typeof evp.onmouseenter === 'function' &&
                   typeof evp.onmouseleave === 'function',
            'курсор может идти НА окно (grace-хендлеры)');
    });

    test('день «н» без мероприятий — тоже открывает (симметрия д/н)', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, true), evp,
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'н', 'часы': 4 }]);
        host.onCellHover(DESKTOP_EV, '2026-10-11', 23);
        assertEqual(evp.active, true, 'окно активно');
        assertTrue(evp.innerHTML.indexOf('Время работы: 4 ч') !== -1,
            'ночная работа дневного — 4 ч');
    });

    test('сменный «д» без мероприятий — окно НЕ открывается', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, true), evp,
            [{ 'дата': '2026-10-11', 'таб_номер': 17, 'статус': 'д', 'часы': 12 }]);
        host.onCellHover(DESKTOP_EV, '2026-10-11', 17);
        assertEqual(evp.active, false, 'тишина — часов нет, показывать нечего');
        assertEqual(host._hoverOn, false, 'флаг не поднимался');
    });

    test('обычная смена без мероприятий — окно НЕ открывается (регресс)', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, true), evp,
            [{ 'дата': '2026-10-05', 'таб_номер': 23, 'статус': 'Д' }]);
        host.onCellHover(DESKTOP_EV, '2026-10-05', 23);
        assertEqual(evp.active, false, 'прежний гейт жив: нет событий — тишина');
    });

    const HOVER_TRAINING = { id: 301, 'таб_номер': 23, тип: 'инструктаж',
               дата_начала: '2026-10-11', дата_окончания: '2026-10-11',
               тема: 'Инструктаж по охране труда', выполнение: 1 };

    test('день «д» И мероприятие — секция и событие вместе', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, true), evp,
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д', 'часы': 7.2 }],
            [HOVER_TRAINING]);
        host.onCellHover(DESKTOP_EV, '2026-10-11', 23);
        assertEqual(evp.active, true, 'окно активно');
        assertTrue(evp.innerHTML.indexOf('Время работы: 7,2 ч') !== -1,
            'секция статуса дня');
        assertTrue(evp.innerHTML.indexOf('Инструктаж по охране труда') !== -1,
            'мероприятие рядом');
    });

    test('мобильный вьюпорт — д/н-справка ховером НЕ открывается', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(false, true), evp,
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д', 'часы': 7.2 }]);
        host.onCellHover(DESKTOP_EV, '2026-10-11', 23);
        assertEqual(evp.active, false, 'гейты Task 487 не тронуты (<1024px)');
    });

    test('живой клик-попап — ховер не мешает (гвард _popupCell)', () => {
        const evp = mockEvp();
        const host = loadHoverHost(mockWindow(true, true), evp,
            [{ 'дата': '2026-10-11', 'таб_номер': 23, 'статус': 'д', 'часы': 7.2 }]);
        host._popupCell = { date: '2026-10-12', 'таб_номер': 23 };
        host.onCellHover(DESKTOP_EV, '2026-10-11', 23);
        assertEqual(evp.active, false,
            'кликовое окно неприкосновенно — ховер молчит');
    });
});

// ============================================================
// 8. VM: старые VM-хосты — гварды (обратная совместимость)
// ============================================================
describe('Task 522 — VM: гварды typeof для старых хостов', () => {

    test('_renderEventsPopup без _renderDnDayInfo — не падает', () => {
        // хост в стиле test-task487 (loadPopupHost) — БЕЗ новых методов
        const host = wsHost(
            ['_renderEventsPopup', '_eventsAt', '_trainingCodeOf',
             '_statusMeta', '_isInstrType', '_instrShortOf',
             '_normInstrKey', '_fmtDateRu', '_esc'], {});
        host._EMPLOYEES = [DAY_EMP];
        host._TRAININGS = [{ id: 301, 'таб_номер': 23, тип: 'инструктаж',
                             дата_начала: '2026-10-11', дата_окончания: '2026-10-11',
                             тема: 'Инструктаж по охране труда', выполнение: 1 }];
        host._STATUS_CODES = CODES;
        host._INSTR_LIST = [];
        let html = '';
        try {
            html = host._renderEventsPopup('2026-10-11', 23);
        } catch (e) {
            assertTrue(false, 'не должно падать: ' + e.message);
        }
        assertTrue(html.indexOf('Инструктаж по охране труда') !== -1,
            'мероприятия рендерятся (гвард пропускает секцию)');
        assertTrue(html.indexOf('ws-dn-info') === -1, 'секции нет');
    });

    test('onCellHover без _dnDayInfoAt — мероприятия работают как прежде', () => {
        // старый хост (стиль test-task487) — БЕЗ новых методов:
        // мероприятия открывают окно, пустые дни молчат (гварды typeof)
        const win = {
            innerWidth: 1280, innerHeight: 720,
            matchMedia: function(q) {
                return { matches: q.indexOf('min-width: 1024px') !== -1 ||
                                  q.indexOf('hover: hover') !== -1 };
            }
        };
        const training = { id: 301, 'таб_номер': 23, тип: 'инструктаж',
                            дата_начала: '2026-10-11', дата_окончания: '2026-10-11',
                            тема: 'Инструктаж по охране труда', выполнение: 1 };
        const evp = mockEvp();
        const host = vmHostWin(
            ['onCellHover', 'onCellLeave', '_openHoverPopup',
             '_closeHoverPopup', 'closeCellPopup',
             '_renderEventsPopup', '_eventsAt', '_trainingCodeOf',
             '_statusMeta', '_isInstrType', '_instrShortOf',
             '_normInstrKey', '_fmtDateRu', '_esc'], win,
            { getElementById: function(id) {
                return id === 'wsEventsPopup' ? evp : null; } },
            { _EMPLOYEES: [DAY_EMP], _TRAININGS: [training],
              _STATUS_CODES: CODES, _INSTR_LIST: [],
              _saving: false, _popupCell: null, _hoverOn: false,
              _hoverCell: null, _hoverTimer: null, _popupClosedAt: 0 });
        try {
            host.onCellHover(DESKTOP_EV, '2026-10-11', 23);
        } catch (e) {
            assertTrue(false, 'не должно падать: ' + e.message);
        }
        assertEqual(evp.active, true,
            'ховер с мероприятием работает (гвард пропускает д/н-гейт)');
        // а БЕЗ мероприятий — тишина (старая семантика Task 487)
        const evp2 = mockEvp();
        const host2 = vmHostWin(
            ['onCellHover', 'onCellLeave', '_openHoverPopup',
             '_closeHoverPopup', 'closeCellPopup',
             '_renderEventsPopup', '_eventsAt', '_trainingCodeOf',
             '_statusMeta', '_isInstrType', '_instrShortOf',
             '_normInstrKey', '_fmtDateRu', '_esc'], win,
            { getElementById: function(id) {
                return id === 'wsEventsPopup' ? evp2 : null; } },
            { _EMPLOYEES: [DAY_EMP], _TRAININGS: [],
              _STATUS_CODES: CODES, _INSTR_LIST: [],
              _saving: false, _popupCell: null, _hoverOn: false,
              _hoverCell: null, _hoverTimer: null, _popupClosedAt: 0 });
        host2.onCellHover(DESKTOP_EV, '2026-10-11', 23);
        assertEqual(evp2.active, false,
            'без мероприятий и без хелпера — тишина');
    });
});

// ============================================================
// 9. SW: версия кэша
// ============================================================
describe('Task 522 — SW: версия кэша', () => {
    test('SW: кэш поднят до kipia-test-v753 (Task 522)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v753'") !== -1,
            'CACHE_VERSION = kipia-test-v753');
        assertFalse(SW_SRC.indexOf('kipia-test-v754') !== -1,
            'v736 не существует (один инкремент на Task 522)');
    });
});
