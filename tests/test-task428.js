// ============================================================
// Task 428 — заявка (kip8test): «При установке периода мероприятия
// в карте работника, длительность дней должна определяться
// автоматически с дальнейшей возможностью правки. Кнопки-ярлыки с
// фамилиями работников и общая сделай закруглёнными с правой
// стороны, как с левой. Расстояния между блоками личной карты
// работника, и между группы ярлыков с блоками, и от границ окна
// сделай равное 5px».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   КЛИЕНТ (SRC — CSS):
//   1) .ws-wtab: border-radius 8px СО ВСЕХ сторон (правая — как
//      левая); «8px 0 0 8px» больше нет;
//   2) пристыковка active к окну вкладок СНЯТА (margin-right: -1px
//      и прозрачная правая рамка — тёмная И светлая темы);
//   3) от границ окна — padding 5px (.ws-workers-body);
//   4) между группой ярлыков и блоками — gap 5px
//      (.ws-workers-layout; мобайл — тот же gap, собственный
//      padding-bottom ленты убран);
//   5) между блоками карточки — 5px (.ws-wtab-body .ws-wcard,
//      .ws-wgrid2 .ws-wcol; десктоп ≥1024px — gap .ws-wgrid2);
//   КЛИЕНТ (SRC — JS):
//   6) _syncTrDays: метод жив, инклюзивный расчёт (86400000 + 1),
//      стоп на instr-режиме (Task 411 — однодневность инструктажа);
//   7) openTrainingForm вешает onchange на «Дата начала» и «Дата
//      окончания» (авто-длительность на смену дат);
//   8) поле «Длит., дн» остаётся ВВОДИМЫМ (type number, min 1) —
//      ручная правка не блокируется (regression Task 306).
//   VM (клиент):
//   9) период 01..05 → 5 дн (оба конца включены); один день → 1;
//  10) конец раньше начала → период выравнивается (конец = начало,
//      1 дн), пустой конец → конец = начало;
// 11) пустое начало — поле «Длит., дн» НЕ трогается (правка жива);
// 12) instr-режим — пересчёта нет (скрытые поля Task 411);
// 13) смена месяца/года (30.08..02.09) → 4 дн;
// 14) слушатели дат реально зовут _syncTrDays (wiring).
//   SW: kipia-test-v761.
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

function ruleBlock(sel) {
    const i = INDEX_SRC.indexOf(sel + ' {');
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('\n    }', i);
    return (j === -1) ? null : INDEX_SRC.slice(i, j + 7);
}

// ============================================================
// 1. SRC — CSS: закругление ярлыков
// ============================================================
describe('Task 428 — SRC: ярлыки закруглены со ВСЕХ сторон', () => {

    test('.ws-wtab: правая сторона закруглена, как левая (8px)', () => {
        const b = ruleBlock('.ws-wtab');
        assertTrue(b !== null, 'правило живо');
        assertTrue(b.indexOf('border-radius: 8px;') !== -1,
            'радиус 8px со всех сторон (заявка: как с левой)');
        assertTrue(b.indexOf('8px 0 0 8px') === -1,
            'прямые правые углы больше нет');
    });

    test('.ws-wtab.active (тёмная): пристыковка СНЯТА', () => {
        const a = ruleBlock('.ws-wtab.active');
        assertTrue(a !== null, 'правило живо');
        assertTrue(a.indexOf('margin-right: -1px') === -1,
            'вылазка к окну вкладок убрана (Task 428)');
        assertTrue(a.indexOf('border-right-color: transparent') === -1,
            'правая рамка обычная — ярлык закруглен со всех сторон');
        assertTrue(a.indexOf('border-left-color: var(--accent-blue') !== -1,
            'акцентная планка слева жива (regression Task 390)');
    });

    test('.ws-wtab.active (светлая): правая рамка обычная', () => {
        const m = INDEX_SRC.match(/\[data-theme="light"\] \.ws-wtab\.active \{[^}]*\}/);
        assertTrue(m !== null, 'правило светлой темы живо');
        assertTrue(m[0].indexOf('border-right-color: transparent') === -1,
            'прозрачной правой рамки нет (закругление справа)');
    });

    test('мобайл: ярлыки и прежде закруглены (regression ≤1023px)', () => {
        const m = INDEX_SRC.indexOf('@media (max-width: 1023px)',
            INDEX_SRC.indexOf('.ws-wtabs {'));
        assertTrue(m !== -1, 'мобильный блок жив');
        const mb = INDEX_SRC.slice(m, m + 1600);
        assertTrue(mb.indexOf('border-radius: 8px;') !== -1,
            'радиус 8px на мобайле (лента)');
    });
});

// ============================================================
// 2. SRC — CSS: расстояния 5px
// ============================================================
describe('Task 428 — SRC: расстояния 5px', () => {

    test('.ws-workers-body: от границ окна — 5px', () => {
        const b = ruleBlock('.ws-workers-body');
        assertTrue(b !== null, 'правило живо');
        assertTrue(b.indexOf('padding: 5px;') !== -1,
            'отступ от границ окна 5px со всех сторон');
        assertTrue(b.indexOf('10px 12px 24px') === -1,
            'прежние отступы (10/12/24) убраны');
    });

    test('.ws-workers-layout: между ярлыками и блоками — 5px', () => {
        const b = ruleBlock('.ws-workers-layout');
        assertTrue(b !== null, 'правило живо');
        assertTrue(b.indexOf('gap: 5px;') !== -1,
            'зазор группы ярлыков → окна 5px (десктоп: гориз., мобайл: верт.)');
    });

    test('мобайл: собственный padding-bottom ленты убран (gap решает)', () => {
        const m = INDEX_SRC.indexOf('@media (max-width: 1023px)',
            INDEX_SRC.indexOf('.ws-wtabs {'));
        const mb = INDEX_SRC.slice(m, m + 1600);
        assertTrue(mb.indexOf('padding-bottom: 8px') === -1,
            'двойной зазор под лентой убран — остался gap 5px раскладки');
    });

    test('блоки карточки: зазор между окнами — 5px', () => {
        assertTrue(INDEX_SRC.indexOf(
            '.ws-wtab-body .ws-wcard { margin-bottom: 5px; }') !== -1,
            'зазор между блоками карточки 5px');
        assertTrue(INDEX_SRC.indexOf(
            '.ws-wtab-body .ws-wcard:last-child { margin-bottom: 0; }') !== -1,
            'последнее окно без зазора (regression Task 393)');
    });

    test('колонки: зазор — 5px (стек мобайла)', () => {
        assertTrue(INDEX_SRC.indexOf(
            '.ws-wgrid2 .ws-wcol { margin-bottom: 5px; }') !== -1,
            'зазор между колонками стека 5px');
        assertTrue(INDEX_SRC.indexOf(
            '.ws-wgrid2 .ws-wcol:last-child { margin-bottom: 0; }') !== -1,
            'последняя колонка без зазора');
    });

    test('десктоп ≥1024px: зазор между колонками — 5px', () => {
        const m = INDEX_SRC.match(/@media \(min-width: 1024px\) \{\s*\.ws-wgrid2 \{[^}]*?gap: 5px;/);
        assertTrue(m !== null,
            'gap 5px между тремя колонками (regression Task 406: flex жив)');
    });
});

// ============================================================
// 3. SRC — JS: авто-длительность по периоду
// ============================================================
describe('Task 428 — SRC: _syncTrDays (авто-длительность)', () => {

    test('метод жив: расчёт инклюзивный, выравнивание периода', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_syncTrDays'));
        assertTrue(fn.indexOf('/ 86400000) + 1') !== -1,
            'календарные дни, оба конца включены (01..03 = 3 дн)');
        assertTrue(fn.indexOf('eInp.value = s;') !== -1,
            'конец раньше начала/пустой — конец = начало (форма без противоречий)');
        assertTrue(fn.indexOf("getElementById('wsTrDays')") !== -1,
            'поле «Длит., дн» — цель пересчёта');
        assertTrue(fn.indexOf('days < 1') !== -1,
            'защита минимума 1 дн');
    });

    test('стоп на instr-режиме (однодневность Task 411 жива)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_syncTrDays'));
        assertTrue(fn.indexOf('if (this._trInstrMode) return;') !== -1,
            'инструктаж/ПЗ — скрытые поля, пересчёта нет');
    });

    test('openTrainingForm: слушатели дат → авто-длительность', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'openTrainingForm'));
        assertTrue(fn.indexOf("getElementById('wsTrStart')") !== -1 &&
                   fn.indexOf('.onchange') !== -1,
            '«Дата начала»: onchange → пересчёт');
        assertTrue(fn.indexOf("getElementById('wsTrEnd')") !== -1 &&
                   fn.indexOf('WorkSchedule._syncTrDays()') !== -1,
            '«Дата окончания»: onchange → пересчёт');
    });

    test('поле «Длит., дн» остаётся правимым (type number, min 1)', () => {
        const i = INDEX_SRC.indexOf('id="wsTrDays"');
        assertTrue(i !== -1, 'поле живо');
        const chunk = INDEX_SRC.slice(i - 120, i + 200);
        assertTrue(chunk.indexOf('type="number"') !== -1,
            'вводимое число — ручная правка НЕ блокируется (заявка)');
        assertTrue(chunk.indexOf('min="1"') !== -1,
            'минимум 1 день');
        assertFalse(chunk.indexOf('readonly') !== -1 || chunk.indexOf('disabled') !== -1,
            'без readonly/disabled — правка возможна');
    });
});

// ============================================================
// 4. VM — _syncTrDays: поведение
// ============================================================
describe('Task 428 — VM: _syncTrDays', () => {

    function mockDoc(els) {
        return { getElementById: function(id) { return els[id] || null; } };
    }

    function host(els, instrMode) {
        return new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_syncTrDays') + ',\n' +
            methodText(INDEX_SRC, '_parseIsoLocal') + ',' +
            '_trInstrMode: ' + JSON.stringify(!!instrMode) +
            '});')(mockDoc(els));
    }

    function els(s, e, days) {
        return {
            wsTrStart: { value: s },
            wsTrEnd: { value: e },
            wsTrDays: { value: String(days) }
        };
    }

    test('период 01..05 сентября → 5 дн (оба конца включены)', () => {
        const x = els('2026-09-01', '2026-09-05', 1);
        host(x, false)._syncTrDays();
        assertEqual(x.wsTrDays.value, '5', 'длительность = 5');
        assertEqual(x.wsTrEnd.value, '2026-09-05', 'конец не меняется');
    });

    test('один день → 1 дн', () => {
        const x = els('2026-09-01', '2026-09-01', 7);
        host(x, false)._syncTrDays();
        assertEqual(x.wsTrDays.value, '1', 'длительность = 1');
    });

    test('через границу месяца/года: 30.08..02.09 → 4 дн', () => {
        const x = els('2026-08-30', '2026-09-02', 1);
        host(x, false)._syncTrDays();
        assertEqual(x.wsTrDays.value, '4', 'длительность = 4');
        const x2 = els('2026-12-30', '2027-01-02', 1);
        host(x2, false)._syncTrDays();
        assertEqual(x2.wsTrDays.value, '4', 'через Новый год тоже 4');
    });

    test('конец раньше начала → период выравнивается (конец = начало, 1 дн)', () => {
        const x = els('2026-09-10', '2026-09-02', 5);
        host(x, false)._syncTrDays();
        assertEqual(x.wsTrEnd.value, '2026-09-10',
            'конец выровнен по началу');
        assertEqual(x.wsTrDays.value, '1', 'длительность = 1');
    });

    test('пустой конец → конец = начало, 1 дн', () => {
        const x = els('2026-09-10', '', 3);
        host(x, false)._syncTrDays();
        assertEqual(x.wsTrEnd.value, '2026-09-10', 'конец дополнен');
        assertEqual(x.wsTrDays.value, '1', 'длительность = 1');
    });

    test('пустое начало — «Длит., дн» НЕ трогается (правка жива)', () => {
        const x = els('', '2026-09-05', 9);
        host(x, false)._syncTrDays();
        assertEqual(x.wsTrDays.value, '9',
            'ручное значение сохранено (нет даты — нет пересчёта)');
        assertEqual(x.wsTrEnd.value, '2026-09-05', 'конец не тронут');
    });

    test('instr-режим — пересчёта нет (Task 411)', () => {
        const x = els('2026-09-01', '2026-09-05', 3);
        host(x, true)._syncTrDays();
        assertEqual(x.wsTrDays.value, '3',
            'скрытые поля инструктажа не пересчитываются');
        assertEqual(x.wsTrEnd.value, '2026-09-05', 'конец не тронут');
    });
});

// ============================================================
// 5. VM — wiring: слушатели дат зовут _syncTrDays
// ============================================================
describe('Task 428 — VM: слушатели дат (openTrainingForm)', () => {

    function mockDoc(els) {
        return { getElementById: function(id) { return els[id] || null; } };
    }

    const EMP = [
        { 'таб_номер': '2706', 'ФИО': 'Иванов И. И.' }
    ];
    const TPL = [
        { название: 'Повторный инструктаж по рабочим инструкциям ОТ',
          вид: 'инструктаж', периодичность: 6, основание: '' }
    ];

    function cls() {
        return {
            add: function() {}, remove: function() {},
            contains: function() { return false; }
        };
    }

    function freshEls() {
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

    test('onchange дат → _syncTrDays (обе даты)', () => {
        const els = freshEls();
        let count = { n: 0 };
        const h2 = new Function('document', 'setTimeout', 'counter', 'return ({' +
            methodText(INDEX_SRC, 'openTrainingForm') + ',\n' +
            methodText(INDEX_SRC, '_applyTrFormMode') + ',\n' +
            methodText(INDEX_SRC, '_syncTrTitleField') + ',\n' +
            methodText(INDEX_SRC, '_updateTrItemHint') + ',\n' +
            methodText(INDEX_SRC, '_fillTrTitleOptions') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            '_syncTrDays: function() { counter.n++; },' +
            '_esc: function(s) { return String(s); },' +
            '_isoDate: function() { return \'2026-09-27\'; },' +
            '_canEdit: true,' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_INSTR_LIST: ' + JSON.stringify(TPL) + ',' +
            '_trInstrMode: false,' +
            '_trEditType: \'\',' +
            '_editTrainingId: null' +
            '});')(mockDoc(els), function(fn) { fn(); }, count);
        h2.openTrainingForm('2706', null, null, 'обучение');
        assertTrue(typeof els.wsTrStart.onchange === 'function',
            '«Дата начала» получила слушателя');
        assertTrue(typeof els.wsTrEnd.onchange === 'function',
            '«Дата окончания» получила слушателя');
        // слушатели зовут ГЛОБАЛЬНЫЙ WorkSchedule (как в проде)
        global.WorkSchedule = h2;
        els.wsTrStart.onchange();
        assertEqual(count.n, 1, 'смена начала → пересчёт');
        els.wsTrEnd.onchange();
        assertEqual(count.n, 2, 'смена конца → пересчёт');
        delete global.WorkSchedule;
        // «Длит., дн» — слушателя НЕТ (ручная правка не сбрасывается)
        assertTrue(typeof els.wsTrDays.onchange !== 'function',
            'поле длительности без авто-перезаписи');
    });
});

// ============================================================
// 6. SW
// ============================================================
describe('Task 428 — SW-версия', () => {
    test('SW: kipia-test-v761', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v761'") !== -1,
            'SWVersion bumped');
        assertTrue(SW_SRC.indexOf('kipia-test-v762') === -1,
            'двойного бампа не было');
    });
});
