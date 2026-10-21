// ============================================================
// Task 410 — заявка: «Не работает: в форме добавления инструктажа
// или проверки знаний, в карточке работников, в блоке инструктажей
// и проверки знаний, старые выпадающие списки, в том числе с
// обучение, прогул, примечание, а нужно, чтобы я мог выбрать один
// из инструктажей или проверки знаний из таблицы Список_И_и_ПЗ».
//
// 1) ФОРМА-инструктаж («+ Инструктаж…» блока; правка И/ПЗ): поле
//    «Тип» скрыто, строгий select ВСЕХ пунктов «Список_И_и_ПЗ»
//    одним списком с группами «Инструктажи» / «Проверка знаний»;
//    тип записи = «вид» пункта (_instrTypeOfTheme); «вне списка» —
//    тип правимой записи (_trEditType).
// 2) ФОРМА-мероприятие: типы только обучение/прогул/примечание
//    (инструктаж/ПЗ убраны), тема — свободный ввод; попап ячейки
//    шахматки — дефолт «обучение» (было «инструктаж»).
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

// ============================================================
// 1. SRC — разметка шторки
// ============================================================
describe('Task 410 — SRC: разметка шторки', () => {

    test('тип — только мероприятие: обучение/прогул/примечание', () => {
        const sel = INDEX_SRC.match(/<select id="wsTrType"[\s\S]*?<\/select>/);
        assertTrue(!!sel, 'селект типа найден');
        ['обучение', 'прогул', 'примечание'].forEach(v => {
            assertTrue(sel[0].indexOf('value="' + v + '"') !== -1,
                'опция «' + v + '» есть');
        });
        assertTrue(sel[0].indexOf('value="инструктаж"') === -1 &&
                   sel[0].indexOf('value="проверка_знаний"') === -1,
            'инструктаж/проверка знаний убраны из типов (выбор — из блока инструктажей)');
    });

    test('id групп режима + ярлык темы', () => {
        assertTrue(INDEX_SRC.indexOf('id="wsTrTabGroup"') !== -1 &&
                   INDEX_SRC.indexOf('id="wsTrTypeGroup"') !== -1 &&
                   INDEX_SRC.indexOf('id="wsTrTitleLabel"') !== -1,
            'id для применения режима (_applyTrFormMode)');
    });
});

// ============================================================
// 2. SRC — режимы openTrainingForm / submit
// ============================================================
describe('Task 410 — SRC: режимы формы', () => {

    test('openTrainingForm: instr-режим из prefillType и правки', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'openTrainingForm'));
        assertTrue(fn.indexOf('this._trInstrMode = this._isInstrType(preTip);') !== -1,
            'создание: instr-режим из prefillType («+ Инструктаж…»)');
        assertTrue(fn.indexOf('this._trInstrMode = this._isInstrType(this._trEditType);') !== -1,
            'правка: instr-режим по типу записи (инструктаж/ПЗ)');
        assertTrue(fn.indexOf("preTip === 'обучение' || preTip === 'прогул' ||") !== -1,
            'мероприятие: валидация типов, фолбэк «обучение»');
        assertTrue(fn.indexOf('this._applyTrFormMode();') !== -1,
            'разметка формы применяется режимом');
        assertTrue(fn.indexOf("'Новый инструктаж / проверка знаний'") !== -1 &&
                   fn.indexOf("'Правка инструктажа / проверки знаний'") !== -1,
            'заголовки instr-режима');
        assertTrue(fn.indexOf("'Новое мероприятие'") !== -1 &&
                   fn.indexOf("'Правка мероприятия'") !== -1,
            'заголовки мероприятия живы');
    });

    test('_applyTrFormMode: скрытие «Тип» + ярлык (Task 411: работник — статичная строка)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_applyTrFormMode'));
        assertTrue(fn.indexOf("typeGroup.style.display = instr ? 'none' : '';") !== -1,
            'группа «Тип» скрыта в instr-режиме');
        assertTrue(fn.indexOf('tabGroup.style.flex') === -1,
            'ширина работника не переключается (Task 411 — статичная строка)');
        assertTrue(fn.indexOf("'Инструктаж / проверка знаний'") !== -1 &&
                   fn.indexOf(": 'Тема'") !== -1,
            'ярлык темы переключается по режиму');
    });

    test('submit: тип из пункта + фолбэк правки + тосты', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'submitTrainingForm'));
        assertTrue(fn.indexOf('tip = this._instrTypeOfTheme(tema) ||') !== -1,
            'тип записи = «вид» выбранного пункта шаблона');
        assertTrue(fn.indexOf('this._isInstrType(this._trEditType)') !== -1 &&
                   fn.indexOf("? this._trEditType : 'инструктаж'") !== -1,
            'фолбэк «вне списка»: тип правимой записи → «инструктаж»');
        assertTrue(fn.indexOf("'Запись добавлена'") !== -1 &&
                   fn.indexOf("'Запись обновлена'") !== -1,
            'тосты instr-режима');
        assertTrue(fn.indexOf("'Мероприятие добавлено'") !== -1,
            'тост мероприятия жив');
    });

    test('входы: «+ Инструктаж…» — instr; попап ячейки — «обучение»', () => {
        const ai = stripComments(methodText(INDEX_SRC, 'onEmpAddInstruction'));
        assertTrue(ai.indexOf("'инструктаж'") !== -1,
            '«+ Инструктаж…» — вход instr-режима');
        const pe = stripComments(methodText(INDEX_SRC, 'onPopupAddEvent'));
        assertTrue(pe.indexOf("this.openTrainingForm(tabNo, date, null, 'обучение');") !== -1,
            'попап ячейки — дефолт «обучение» (Task 410)');
    });

    test('свойства режима + хелпер _instrTypeOfTheme', () => {
        assertTrue(INDEX_SRC.indexOf('_trInstrMode: false,') !== -1 &&
                   INDEX_SRC.indexOf("_trEditType: ''") !== -1,
            'свойства режима в состоянии WorkSchedule');
        assertTrue(INDEX_SRC.indexOf('_instrTypeOfTheme: function') !== -1,
            'хелпер типа по теме пункта');
    });
});

// ============================================================
// 3. VM — _instrTypeOfTheme: тип записи по теме пункта
// ============================================================
describe('Task 410 — VM: тип записи по теме пункта', () => {

    const TPL = [
        { название: 'Повторный инструктаж по рабочим инструкциям ОТ',
          вид: 'инструктаж', периодичность: 6, основание: '' },
        { название: 'Периодическая проверка знаний на допуск к самостоятельной работе',
          вид: 'проверка_знаний', периодичность: 12, основание: '' }
    ];
    const host = new Function('return ({' +
        methodText(INDEX_SRC, '_instrTypeOfTheme') + ',\n' +
        methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
        methodText(INDEX_SRC, '_normInstrKind') + ',\n' +
        '_INSTR_LIST: ' + JSON.stringify(TPL) + '});')();

    test('пункт инструктажа → тип «инструктаж»', () => {
        assertEqual(host._instrTypeOfTheme('Повторный инструктаж по рабочим инструкциям ОТ'),
            'инструктаж', 'вид пункта');
    });

    test('пункт ПЗ → тип «проверка_знаний»', () => {
        assertEqual(host._instrTypeOfTheme('Периодическая проверка знаний на допуск к самостоятельной работе'),
            'проверка_знаний', 'вид пункта');
    });

    test('нормализация (регистр/пробелы)', () => {
        assertEqual(host._instrTypeOfTheme('  повторный инструктаж  ПО рабочим инструкциям ОТ '),
            'инструктаж', 'толерантность к регистру/пробелам');
    });

    test('темы нет («вне списка») → пусто', () => {
        assertEqual(host._instrTypeOfTheme('Внеплановый по наряду №4'), '',
            'фолбэк обрабатывает submitTrainingForm');
        assertEqual(host._instrTypeOfTheme(''), '', 'пустая тема');
    });
});

// ============================================================
// 4. VM — _applyTrFormMode: применение режима к разметке
// ============================================================
describe('Task 410 — VM: применение режима к разметке', () => {

    function modeHost(instr) {
        const els = {
            wsTrTypeGroup: { style: {} },
            wsTrTabGroup: { style: {} },
            wsTrTitleLabel: { textContent: 'Тема' }
        };
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_applyTrFormMode') + ',' +
            '_trInstrMode: ' + JSON.stringify(!!instr) + '});')(mockDoc(els));
        return { host: host, els: els };
    }

    test('instr: «Тип» скрыт, ярлык темы (Task 411: работник — статично)', () => {
        const c = modeHost(true);
        c.host._applyTrFormMode();
        assertEqual(c.els.wsTrTypeGroup.style.display, 'none',
            'группа «Тип» скрыта');
        assertEqual(c.els.wsTrTitleLabel.textContent,
            'Инструктаж / проверка знаний', 'ярлык темы instr-режима');
    });

    test('event: прежний вид формы', () => {
        const c = modeHost(false);
        c.host._applyTrFormMode();
        assertEqual(c.els.wsTrTypeGroup.style.display, '',
            'группа «Тип» видна');
        assertEqual(c.els.wsTrTitleLabel.textContent, 'Тема',
            'ярлык «Тема»');
    });
});

// ============================================================
// 5. SW — версия кэша
// ============================================================
describe('Task 410 — SW', () => {

    test('версия кэша поднята (v637)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v753') !== -1,
            'CACHE_VERSION = kipia-test-v753');
    });
});
