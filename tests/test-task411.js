// ============================================================
// Task 411 — заявка: «Нужно скорректировать форму добавления
// инструктажа и проверки знаний в картах работников. Форма
// открывается в каждой карте работника, поэтому выпадающий список
// с фамилиями в ней не нужен, работник должен автоматически
// вычисляться из его карты, где открыта форма добавления. В поле
// «Инструктаж / проверка знаний» должен быть выпадающий список из
// таблицы Список_И_и_ПЗ. Поле выбора даты должно быть одно: нет
// необходимости указывать период проведения инструктажа или
// проверки знания, они проводятся одним днём, просто выбирается
// дата проведения».
//
// 1) РАБОТНИК: выпадающий список фамилий УБРАН — статичная строка
//    «ФИО · таб. №» (как шторка увольнения, Task 318) + скрытое
//    поле #wsTrTabNo (держатель значения для submit); работник
//    вычисляется из карточки/ячейки входа (правка — из записи).
// 2) ОДНА ДАТА: instr-режим — «Дата проведения»; «Дата
//    окончания» и «Длит., дн» скрыты; submit ВСЕГДА пишет
//    однодневную запись. Мероприятие (обучение может быть
//    многодневным) — прежний период.
// 3) Выбор пункта «Список_И_и_ПЗ» — Task 410 (жив, не менялся).
// ============================================================

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
    if (m === null) throw new Error('метод не найден: ' + name);
    return m;
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// Фрагмент разметки шторки #wsTrSheet (до шторки отпусков)
const SHEET = INDEX_SRC.slice(INDEX_SRC.indexOf('id="wsTrSheet"'),
                              INDEX_SRC.indexOf('id="wsVacSheet"'));

// ============================================================
// 1. SRC — разметка шторки
// ============================================================
describe('Task 411 — SRC: разметка шторки', () => {

    test('работник — статичная строка, выпадающий список убран', () => {
        assertTrue(SHEET.indexOf('id="wsTrEmp"') !== -1 &&
                   SHEET.indexOf('class="ws-dismiss-emp"') !== -1,
            'статичная строка #wsTrEmp (стиль шторки увольнения)');
        assertTrue(SHEET.indexOf('<input type="hidden" id="wsTrTabNo">') !== -1,
            'скрытое поле значения #wsTrTabNo (для submit)');
        assertTrue(SHEET.indexOf('<select id="wsTrTabNo"') === -1,
            'выпадающий список фамилий убран');
        assertTrue(SHEET.indexOf('<label class="flow-input-label">Работник</label>') !== -1,
            'подпись «Работник» (не «Таб. №»)');
    });

    test('даты — id групп и подписи для переключения режима', () => {
        assertTrue(SHEET.indexOf('id="wsTrStartGroup"') !== -1 &&
                   SHEET.indexOf('id="wsTrEndGroup"') !== -1 &&
                   SHEET.indexOf('id="wsTrDaysGroup"') !== -1,
            'группы дат имеют id (_applyTrFormMode)');
        assertTrue(SHEET.indexOf('id="wsTrStartLabel"') !== -1,
            'подпись даты начала имеет id («Дата проведения»/«Дата начала»)');
    });
});

// ============================================================
// 2. SRC — логика формы
// ============================================================
describe('Task 411 — SRC: логика формы', () => {

    test('openTrainingForm: работник вычисляется из карточки входа', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'openTrainingForm'));
        assertTrue(fn.indexOf("(editTraining && editTraining['таб_номер'])") !== -1,
            'правка — работник из записи; создание — из карточки/ячейки');
        assertTrue(fn.indexOf('Работник не определён — откройте форму из карточки работника') !== -1,
            'тост-защита, когда работника нет');
        assertTrue(fn.indexOf("empDiv.textContent = emp['ФИО'] + ' · таб. №' + emp['таб_номер'];") !== -1,
            'статичная строка «ФИО · таб. №»');
        assertTrue(fn.indexOf("empInput.value = String(emp['таб_номер']);") !== -1,
            'скрытое поле получает табельный номер');
        assertTrue(fn.indexOf('empSel.innerHTML') === -1 &&
                   fn.indexOf('— выберите —') === -1,
            'построение списка фамилий удалено');
    });

    test('openTrainingForm: фокус — не список работников', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'openTrainingForm'));
        const tail = fn.slice(fn.indexOf('setTimeout'));
        assertTrue(tail.indexOf("getElementById('wsTrTabNo')") === -1,
            'фокус больше не на списке работников');
        assertTrue(tail.indexOf('instrFocus') !== -1,
            'фокус — первый видимый контроль режима (пункт/тип)');
    });

    test('_applyTrFormMode: одна дата в instr-режиме', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_applyTrFormMode'));
        assertTrue(fn.indexOf("endGroup.style.display = instr ? 'none' : '';") !== -1 &&
                   fn.indexOf("daysGroup.style.display = instr ? 'none' : '';") !== -1,
            '«Дата окончания» и «Длит., дн» скрыты в instr-режиме');
        assertTrue(fn.indexOf("'Дата проведения' : 'Дата начала'") !== -1,
            'подпись даты: «Дата проведения» в instr, «Дата начала» — в событии');
    });

    test('submit: однодневная запись instr + валидации', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'submitTrainingForm'));
        const di = fn.indexOf('endDate = startDate;');
        assertTrue(di !== -1, 'дата окончания = дата проведения (instr)');
        assertTrue(fn.indexOf('days = 1;', di) !== -1,
            'длительность — 1 день (следом в instr-ветке)');
        assertTrue(fn.indexOf("'Работник не определён'") !== -1,
            'валидация работника (скрытое поле, защита прямых вызовов)');
        assertTrue(fn.indexOf("'Укажите дату проведения'") !== -1 &&
                   fn.indexOf("'Укажите дату начала'") !== -1,
            'валидация даты — по режиму');
    });

    test('входы передают работника карточки (все вызовы)', () => {
        const ins = stripComments(methodText(INDEX_SRC, 'onEmpAddInstruction'));
        const tr = stripComments(methodText(INDEX_SRC, 'onEmpAddTraining'));
        const pop = stripComments(methodText(INDEX_SRC, 'onPopupAddEvent'));
        assertTrue(ins.indexOf('this.openTrainingForm(tabNo, null, null, \'инструктаж\');') !== -1,
            '«+ Инструктаж…» — работник карточки');
        assertTrue(tr.indexOf('this.openTrainingForm(tabNo, null, null, \'обучение\');') !== -1,
            '«+ Мероприятие…» — работник карточки');
        assertTrue(pop.indexOf('this.openTrainingForm(tabNo, date, null, \'обучение\');') !== -1,
            'попап ячейки — работник ячейки');
    });
});

// ============================================================
// 3. VM — openTrainingForm: работник + режимы
// ============================================================
describe('Task 411 — VM: форма (работник из карточки входа)', () => {

    const EMP = [
        { 'таб_номер': '2706', 'ФИО': 'Иванов И. И.' },
        { 'таб_номер': '0173', 'ФИО': 'Галкин Д. Н.' }
    ];
    const TPL = [
        { название: 'Повторный инструктаж по рабочим инструкциям ОТ',
          вид: 'инструктаж', периодичность: 6, основание: '' },
        { название: 'Повторный инструктаж по инструкции № 9-ОГЭ',
          вид: 'инструктаж', периодичность: 3, основание: 'инструкция № 9-ОГЭ' },
        { название: 'Периодическая проверка знаний на допуск к самостоятельной работе',
          вид: 'проверка_знаний', периодичность: 12, основание: '' },
        { название: 'Периодическая проверка знаний на допуск к проведению работ в электроустановках до 1000 В',
          вид: 'проверка_знаний', периодичность: 12, основание: '' },
        { название: 'Периодическая проверка знаний по охране труда при выполнении работ на высоте',
          вид: 'проверка_знаний', периодичность: 12, основание: 'инструкция № 53-ОТ' }
    ];

    function freshEls() {
        const cls = () => ({ add: function() {}, remove: function() {} });
        return {
            wsTrSheetTitle: { textContent: '' },
            wsTrSubmitBtn: { textContent: '' },
            wsTrEmp: { textContent: '—' },
            wsTrTabNo: { value: '' },
            wsTrType: { value: 'обучение', focus: function() {} },
            wsTrTypeGroup: { style: {} },
            wsTrTabGroup: { style: {} },
            wsTrTitleLabel: { textContent: '' },
            wsTrTitleSel: { hidden: false, value: '', innerHTML: '', focus: function() {} },
            wsTrTitle: { hidden: false, value: '', focus: function() {} },
            wsTrTitleList: { innerHTML: '' },
            wsTrItemHint: { hidden: true, textContent: '' },
            wsTrStartGroup: { style: {} },
            wsTrStartLabel: { textContent: '' },
            wsTrStart: { value: '' },
            wsTrEndGroup: { style: {} },
            wsTrEnd: { value: '' },
            wsTrDaysGroup: { style: {} },
            wsTrDays: { value: '' },
            wsTrComment: { value: '' },
            wsTrOverlay: { classList: cls() },
            wsTrSheet: { classList: cls() }
        };
    }

    function formHost(els) {
        // setTimeout — синхронный (фокус без задержки)
        return new Function('document', 'setTimeout', 'return ({' +
            methodText(INDEX_SRC, 'openTrainingForm') + ',\n' +
            methodText(INDEX_SRC, '_applyTrFormMode') + ',\n' +
            methodText(INDEX_SRC, '_syncTrTitleField') + ',\n' +
            methodText(INDEX_SRC, '_updateTrItemHint') + ',\n' +
            methodText(INDEX_SRC, '_fillTrTitleOptions') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKind') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_fmtPeriodRu') + ',\n' +
            '_esc: function(s) { return String(s); },' +
            '_plural: function(n, f) { return f[2]; },' +
            '_isoDate: function(d) { return \'2026-09-25\'; },' +
            '_canEdit: true,' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_INSTR_LIST: ' + JSON.stringify(TPL) + ',' +
            '_trInstrMode: false,' +
            '_trEditType: \'\',' +
            '_editTrainingId: null' +
            '});')(mockDoc(els), function(fn) { fn(); });
    }

    test('«+ Инструктаж…»: работник карточки — статичная строка', () => {
        const els = freshEls();
        formHost(els).openTrainingForm('2706', null, null, 'инструктаж');
        assertEqual(els.wsTrEmp.textContent, 'Иванов И. И. · таб. №2706',
            'работник карточки в статичной строке');
        assertEqual(els.wsTrTabNo.value, '2706', 'скрытое поле значения');
        assertEqual(els.wsTrSheetTitle.textContent,
            'Новый инструктаж / проверка знаний', 'заголовок instr-режима');
    });

    test('instr-режим: одна дата, «Тип» скрыт, ярлыки', () => {
        const els = freshEls();
        formHost(els).openTrainingForm('2706', null, null, 'инструктаж');
        assertEqual(els.wsTrTypeGroup.style.display, 'none',
            'группа «Тип» скрыта');
        assertEqual(els.wsTrEndGroup.style.display, 'none',
            '«Дата окончания» скрыта');
        assertEqual(els.wsTrDaysGroup.style.display, 'none',
            '«Длит., дн» скрыта');
        assertEqual(els.wsTrStartLabel.textContent, 'Дата проведения',
            'подпись даты — «Дата проведения»');
        assertEqual(els.wsTrTitleLabel.textContent,
            'Инструктаж / проверка знаний', 'ярлык пункта списка');
        assertTrue(els.wsTrTitleSel.hidden === false,
            'select «Список_И_и_ПЗ» виден (Task 410 жив)');
        assertEqual(els.wsTrSubmitBtn.textContent, 'Добавить', 'кнопка');
    });

    test('правка записи: работник из записи, значения в форме', () => {
        const els = freshEls();
        formHost(els).openTrainingForm(null, null, {
            id: 42, 'таб_номер': '0173', тип: 'проверка_знаний',
            тема: 'Периодическая проверка знаний по охране труда при выполнении работ на высоте',
            дата_начала: '2026-03-10', дата_окончания: '2026-03-10',
            длительность_дней: 1, комментарий: ''
        });
        assertEqual(els.wsTrEmp.textContent, 'Галкин Д. Н. · таб. №0173',
            'работник записи в статичной строке');
        assertEqual(els.wsTrTabNo.value, '0173', 'скрытое поле записи');
        assertEqual(els.wsTrSheetTitle.textContent,
            'Правка инструктажа / проверки знаний', 'заголовок правки');
        assertEqual(els.wsTrTitleSel.value,
            'Периодическая проверка знаний по охране труда при выполнении работ на высоте',
            'тема записи выбрана в select');
        assertEqual(els.wsTrSubmitBtn.textContent, 'Сохранить', 'кнопка правки');
    });

    test('мероприятие: период дат сохраняется (обучение многодневное)', () => {
        const els = freshEls();
        formHost(els).openTrainingForm('2706', null, null, 'обучение');
        assertEqual(els.wsTrEndGroup.style.display, '',
            '«Дата окончания» видна');
        assertEqual(els.wsTrDaysGroup.style.display, '',
            '«Длит., дн» видна');
        assertEqual(els.wsTrStartLabel.textContent, 'Дата начала',
            'подпись даты — «Дата начала»');
        assertEqual(els.wsTrSheetTitle.textContent, 'Новое мероприятие',
            'заголовок режима мероприятия');
    });

    test('без работника: форма НЕ открывается', () => {
        const els = freshEls();
        let opened = false;
        els.wsTrSheet.classList.add = function() { opened = true; };
        formHost(els).openTrainingForm(null, null, null, 'инструктаж');
        assertFalse(opened, 'шторка не активируется');
        assertEqual(els.wsTrEmp.textContent, '—', 'строка работника пуста');
    });
});

// ============================================================
// 4. VM — submitTrainingForm: однодневность instr
// ============================================================
describe('Task 411 — VM: submit (одна дата у инструктажа/ПЗ)', () => {

    const TPL = [
        { название: 'Повторный инструктаж по рабочим инструкциям ОТ',
          вид: 'инструктаж', периодичность: 6, основание: '' },
        { название: 'Периодическая проверка знаний по охране труда при выполнении работ на высоте',
          вид: 'проверка_знаний', периодичность: 12, основание: 'инструкция № 53-ОТ' }
    ];

    function submitHost(els, mode) {
        const calls = [];
        return {
            host: new Function('document', 'calls', 'return ({' +
                methodText(INDEX_SRC, 'submitTrainingForm') + ',\n' +
                methodText(INDEX_SRC, '_instrTypeOfTheme') + ',\n' +
                methodText(INDEX_SRC, '_isInstrType') + ',\n' +
                methodText(INDEX_SRC, '_normInstrKind') + ',\n' +
                methodText(INDEX_SRC, '_normInstrKey') + ',' +
                '_api: function(m, p) { calls.push([m, p]);' +
                ' return Promise.resolve({}); },' +
                'closeTrainingForm: function() {},' +
                'loadGrid: function() {},' +
                '_trInstrMode: ' + JSON.stringify(!!mode) + ',' +
                '_trEditType: \'\',' +
                '_editTrainingId: null,' +
                '_INSTR_LIST: ' + JSON.stringify(TPL) +
                '});')(mockDoc(els), calls),
            calls: calls
        };
    }

    function freshEls() {
        return {
            wsTrTabNo: { value: '2706' },
            wsTrType: { value: 'обучение' },
            wsTrTitleSel: { hidden: false, value: 'Повторный инструктаж по рабочим инструкциям ОТ' },
            wsTrTitle: { hidden: true, value: '' },
            wsTrStart: { value: '2026-09-25' },
            wsTrEnd: { value: '2026-10-05' },   // «устаревшее» многодневное
            wsTrDays: { value: '10' },           // «устаревшая» длительность
            wsTrComment: { value: '' }
        };
    }

    test('instr: submit пишет ОДНОДНЕВНУЮ запись (конец=начало, 1 день)', async () => {
        const els = freshEls();
        const c = submitHost(els, true);
        await c.host.submitTrainingForm();
        assertEqual(c.calls.length, 1, 'один вызов addTraining');
        const p = c.calls[0][1];
        assertEqual(p['таб_номер'], '2706', 'работник из скрытого поля');
        assertEqual(p.дата_начала, '2026-09-25', 'дата проведения');
        assertEqual(p.дата_окончания, '2026-09-25',
            'дата окончания = дата проведения (скрытые поля проигнорированы)');
        assertEqual(p.длительность_дней, 1, 'длительность — 1 день');
        assertEqual(p.тип, 'инструктаж', 'тип из вида пункта (Task 410)');
    });

    test('instr ПЗ: тип пункта + однодневность', async () => {
        const els = freshEls();
        els.wsTrTitleSel.value =
            'Периодическая проверка знаний по охране труда при выполнении работ на высоте';
        const c = submitHost(els, true);
        await c.host.submitTrainingForm();
        const p = c.calls[0][1];
        assertEqual(p.тип, 'проверка_знаний', 'тип записи = вид пункта');
        assertEqual(p.дата_окончания, p.дата_начала, 'однодневная запись');
        assertEqual(p.длительность_дней, 1, '1 день');
    });

    test('мероприятие: многодневный период сохраняется', async () => {
        const els = freshEls();
        els.wsTrTitleSel.hidden = true;      // событие — текстовый ввод
        els.wsTrTitle = { hidden: false, value: 'Курс повышения квалификации' };
        els.wsTrType.value = 'обучение';
        const c = submitHost(els, false);
        await c.host.submitTrainingForm();
        const p = c.calls[0][1];
        assertEqual(p.дата_начала, '2026-09-25', 'дата начала');
        assertEqual(p.дата_окончания, '2026-10-05',
            'дата окончания события сохранена (обучение многодневное)');
        assertEqual(p.длительность_дней, 10, 'длительность события сохранена');
    });
});

// ============================================================
// 5. SW — версия кэша
// ============================================================
describe('Task 411 — SW', () => {

    test('версия кэша поднята (v638)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v734') !== -1,
            'CACHE_VERSION = kipia-test-v734');
    });
});
