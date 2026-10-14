// tests/test-task502.js
// Task 502: заявка пользователя — «Убери палитру кнопок и блоков,
//   она зрительно перегружает приложение. В разделе шкала-сигнал
//   поменяй местами блоки произвольных значений и типа шкалы, и в
//   блоке произвольных расчётов убери текст "Введите значение в
//   любое поле — другое рассчитается автоматически", и при вводе
//   одного из произвольных значений, подтверждение должно закрывать
//   клавиатуру, а не переходить на следующее поле ввода.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — палитра ts-элементов СНЯТА в ОБЕИХ темах: тёмная —
//      нейтральный белый (рамки/градиент/фокус/табы/звёзды/featured/
//      нижний бар/разделители), светлая — нейтральный 20,20,19;
//      цветных литералов (синий/терракота) в ts-правилах НЕТ.
//   B. SRC — границы заявки: структура панелей сохранена (выступ 2px
//      + градиент, колодец 1px + inset-тени); кнопки «Рассчитать»
//      и переменные тем НЕ тронуты; подсказка буйка НЕ удалялась.
//   C. SRC — «Шкала-сигнал»: панель шкалы (тип шкалы) — ВВЕРХУ, ППР —
//      ПОД ней, кнопка после обеих; текст-подсказка ППР удалён;
//      scaleQueryEnterBlur определён (обёртка Task 496) и стоит на
//      ОБОИХ полях ППР; enterkeyhint="done"; живой расчёт жив.
//   D. VM — scaleQueryEnterBlur: Enter (key и keyCode 13) гасит
//      клавиатуру (preventDefault + stopPropagation + blur), прочие
//      клавиши — без действий; глобальный Enter/Next жив (границы).
//   E. SW kipia-test-v734 + комментарий Task 502 (guard v727).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Блок страницы по id (баланс div-ов)
function pageBlock(pageId) {
    const i = INDEX_SRC.indexOf('<div id="page-' + pageId + '"');
    if (i === -1) return null;
    let pos = i, depth = 0, started = false;
    while (pos < INDEX_SRC.length) {
        const m = /<\/?div\b/.exec(INDEX_SRC.slice(pos));
        if (!m) break;
        pos = pos + m.index;
        if (INDEX_SRC[pos + 1] === '/') { depth--; } else { depth++; started = true; }
        pos += 4;
        if (started && depth === 0) return INDEX_SRC.slice(i, pos);
    }
    return null;
}

// Колонка ввода conv-3col страницы
function colInput(pageId) {
    const b = pageBlock(pageId);
    if (!b) return null;
    const i1 = b.indexOf('<div class="conv-col conv-col-input">');
    const i2 = b.indexOf('<div class="conv-col conv-col-table">');
    if (i1 === -1 || i2 === -1 || i1 > i2) return null;
    return b.slice(i1, i2);
}

// ==========================================================================
// A. ПАЛИТРА СНЯТА — тёмная тема (нейтральный белый)
// ==========================================================================
describe('Task 502 A: тёмная тема — нейтральные ts-элементы', () => {
    test('панель-выступ: нейтральная рамка 2px + нейтральный градиент', () => {
        const i = INDEX_SRC.indexOf('.ts-calc-panel {');
        assertTrue(i !== -1, 'правило .ts-calc-panel есть');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('border: 2px solid rgba(255, 255, 255, 0.16);') !== -1,
            'рамка 2px нейтральная');
        assertTrue(rule.indexOf(
            'linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.01))') !== -1,
            'градиент нейтральный');
        assertTrue(rule.indexOf('box-shadow: 0 5px 14px rgba(0, 0, 0, 0.42)') !== -1,
            'тень выступа сохранена (структура Task 500)');
        assertFalse(rule.indexOf('rgba(74, 143, 199') !== -1,
            'синих литералов в правиле нет');
    });

    test('поля и фокус — нейтральные', () => {
        const i = INDEX_SRC.indexOf('.ts-calc-field { height: 52px;');
        assertTrue(i !== -1, 'правило .ts-calc-field есть');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('border-color: rgba(255, 255, 255, 0.22);') !== -1,
            'рамка поля нейтральная');
        const iF = INDEX_SRC.indexOf('.ts-calc-field:focus {');
        const rf = INDEX_SRC.slice(iF, INDEX_SRC.indexOf('}', iF) + 1);
        assertTrue(rf.indexOf('border-color: rgba(255, 255, 255, 0.5);') !== -1,
            'фокус-рамка нейтральная');
        assertTrue(rf.indexOf('box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.12);') !== -1,
            'фокус-кольцо нейтральное');
        // поля в панелях и cs-триггеры — те же нейтральные литералы
        assertEqual(INDEX_SRC.split(
            'border-color: rgba(255, 255, 255, 0.22);').length - 1, 3,
            'нейтральная рамка: ts-calc-field + панельные поля + cs-trigger');
        assertEqual(INDEX_SRC.split(
            'border-color: rgba(255, 255, 255, 0.5); box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.12);').length - 1, 3,
            'нейтральный фокус: ts-calc-field + панельные поля + cs-trigger');
    });

    test('колодец и разделители — нейтральные', () => {
        const i = INDEX_SRC.indexOf('.ts-calc-panel.ts-calc-inset {');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('border: 1px solid rgba(255, 255, 255, 0.12);') !== -1,
            'рамка колодца 1px нейтральная');
        assertTrue(rule.indexOf('inset 0 3px 10px rgba(0, 0, 0, 0.5)') !== -1,
            'внутренняя тень колодца сохранена');
        const iS = INDEX_SRC.indexOf(
            '.ts-calc-panel .scale-form-label.ts-calc-sep {');
        const rs = INDEX_SRC.slice(iS, INDEX_SRC.indexOf('}', iS) + 1);
        assertTrue(rs.indexOf('border-top: 1px solid rgba(255, 255, 255, 0.12);') !== -1,
            'разделитель групп нейтральный');
    });

    test('табы/счётчики/звёзды/featured/нижний бар — нейтральные', () => {
        assertTrue(INDEX_SRC.indexOf(
            '.ts-tab.active { background: rgba(255, 255, 255, 0.1); color: #ffffff; }') !== -1,
            'активный таб нейтральный');
        assertTrue(INDEX_SRC.indexOf(
            '.ts-tab.active .ts-tab-count { background: rgba(255, 255, 255, 0.92); color: #14171c; }') !== -1,
            'счётчик активного таба нейтральный');
        assertTrue(INDEX_SRC.indexOf(
            '.ts-card-fav-btn.active { color: #e0e0e0; background: rgba(255, 255, 255, 0.12); }') !== -1,
            'звёздочка активная нейтральная');
        assertTrue(INDEX_SRC.indexOf(
            '.ts-card-feat { padding: 12px 14px 13px; border: 2px solid rgba(255, 255, 255, 0.2);') !== -1,
            'featured-карточка нейтральная');
        assertTrue(INDEX_SRC.indexOf(
            '#tsBottomBar .ts-tab.active { background: transparent; color: #ffffff; }') !== -1,
            'нижний бар нейтральный');
        assertTrue(INDEX_SRC.indexOf(
            '.ts-bottom-bar::before { content: \'\';') !== -1 &&
            INDEX_SRC.indexOf(
                'background: rgba(255, 255, 255, 0.12); transform: translateX(-50%);') !== -1,
            'разделитель бара нейтральный');
    });
});

// ==========================================================================
// B. ПАЛИТРА СНЯТА — светлая тема (нейтральный 20,20,19) + границы
// ==========================================================================
describe('Task 502 B: светлая тема — нейтральные ts-элементы + границы', () => {
    test('панель-выступ и колодец — нейтральные', () => {
        const i = INDEX_SRC.indexOf('[data-theme="light"] .ts-calc-panel {');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('border-color: rgba(20, 20, 19, 0.32);') !== -1,
            'рамка панели нейтральная');
        assertTrue(rule.indexOf(
            'linear-gradient(180deg, rgba(20, 20, 19, 0.03), rgba(20, 20, 19, 0))') !== -1,
            'градиент нейтральный');
        assertTrue(rule.indexOf('0 4px 12px rgba(20, 20, 19, 0.1)') !== -1,
            'тень нейтральная');
        const iI = INDEX_SRC.indexOf(
            '[data-theme="light"] .ts-calc-panel.ts-calc-inset {');
        const ri = INDEX_SRC.slice(iI, INDEX_SRC.indexOf('}', iI) + 1);
        assertTrue(ri.indexOf('border-color: rgba(20, 20, 19, 0.16);') !== -1,
            'рамка колодца нейтральная');
        assertTrue(ri.indexOf('background-color: rgba(20, 20, 19, 0.03);') !== -1,
            'фон колодца нейтральный');
    });

    test('фокус полей/триггеров, табы, звёзды — нейтральные', () => {
        assertEqual(INDEX_SRC.split(
            'border-color: rgba(20, 20, 19, 0.55); box-shadow: 0 0 0 3px rgba(20, 20, 19, 0.12);').length - 1, 3,
            'нейтральный фокус светлой: 3 правила');
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] .ts-tab.active { background: rgba(20, 20, 19, 0.08); color: #141413; }') !== -1,
            'активный таб нейтральный');
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] .ts-tab.active .ts-tab-count { background: #141413; color: #FAF9F5; }') !== -1,
            'счётчик активного таба нейтральный');
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] .ts-card-fav-btn.active { color: #141413; background: rgba(20, 20, 19, 0.08); }') !== -1,
            'звёздочка нейтральная');
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] #tsBottomBar .ts-tab.active { color: #141413; }') !== -1,
            'нижний бар нейтральный');
    });

    test('ЦВЕТНЫХ литералов в ts-правилах НЕТ (обе темы)', () => {
        const lines = INDEX_SRC.split('\n');
        const prefixes = ['.ts-', '#tsBottomBar', '#tempSensorFavBtn',
                          '[data-theme="light"] .ts-',
                          '[data-theme="light"] #tsBottomBar',
                          '[data-theme="light"] #tempSensorFavBtn'];
        const badLits = ['rgba(74, 143, 199', 'rgba(43, 111, 163',
                         'rgba(198, 97, 63', 'rgba(158, 78, 48',
                         '43, 111, 163', '21, 54, 83',
                         '#4a8fc7', '#C6613F', '#2b6fa3'];
        const bad = lines.filter((line) => {
            const st = line.trim();
            return prefixes.some((p) => st.startsWith(p)) &&
                   badLits.some((b) => line.indexOf(b) !== -1);
        });
        assertEqual(bad.length, 0,
            'цветные литералы: ' + (bad.length ? bad[0].trim().slice(0, 90) : 'нет'));
    });

    test('границы: кнопки «Рассчитать» и переменные тем НЕ тронуты', () => {
        // тёмная: синий градиент первичной кнопки жив
        assertTrue(INDEX_SRC.indexOf(
            'linear-gradient(135deg, #2563eb, #3b82f6)') !== -1,
            'кнопка «Рассчитать» тёмной темы жива');
        // светлая: терракотовый градиент первичной кнопки жив
        assertTrue(INDEX_SRC.indexOf(
            'linear-gradient(135deg, #C6613F, #D97757)') !== -1,
            'кнопка «Рассчитать» светлой темы жива');
        assertTrue(INDEX_SRC.indexOf('--accent-blue: #C6613F;') !== -1,
            'акцент светлой темы (переменная) жив');
        assertTrue(INDEX_SRC.indexOf('--accent-blue: #4a8fc7;') !== -1,
            'акцент тёмной темы (переменная) жив');
    });

    test('границы: подсказка буйкового уровнемера НЕ удалялась', () => {
        assertTrue(INDEX_SRC.indexOf(
            'Введите значение в любое поле — два других рассчитаются автоматически') !== -1,
            'подсказка ППР буйка на месте (заявка только про шкала-сигнал)');
    });
});

// ==========================================================================
// C. ШКАЛА-СИГНАЛ — порядок блоков + подсказка удалена + Enter
// ==========================================================================
describe('Task 502 C: шкала-сигнал — swap блоков, подсказка, Enter', () => {
    test('порядок: панель шкалы (тип шкалы) — ВВЕРХУ, ППР — ПОД ней', () => {
        const col1 = colInput('scale-signal');
        assertTrue(col1 !== null, 'колонка ввода найдена');
        const iF = col1.indexOf('id="scaleFormPanel"');
        const iQ = col1.indexOf('id="scaleQueryPanel"');
        const iBtn = col1.indexOf('class="scale-calc-btn"');
        assertTrue(iF !== -1 && iQ !== -1, 'обе панели в колонке ввода');
        assertTrue(iF < iQ, 'панель расчёта шкалы (тип шкалы) — выше');
        assertTrue(iBtn > iQ, 'кнопка «Рассчитать» — после обеих панелей');
        // панель шкалы начинается с группы «Тип шкалы»
        const segF = col1.slice(iF, iF + 200);
        assertTrue(segF.indexOf('Тип шкалы') !== -1,
            'панель шкалы открывается группой «Тип шкалы»');
        // ППР — по-прежнему выступ (ts-calc-panel без inset)
        assertTrue(col1.indexOf('class="ts-calc-panel" id="scaleQueryPanel"') !== -1,
            'ППР — ts-calc-panel БЕЗ inset (эффект выступа сохранён)');
    });

    test('текст-подсказка ППР удалён (дословно, как в заявке)', () => {
        assertFalse(INDEX_SRC.indexOf(
            'Введите значение в любое поле — другое рассчитается автоматически') !== -1,
            'подсказка удалена из index.html');
        // поля и живой расчёт панели живы
        const col1 = colInput('scale-signal');
        const iQ = col1.indexOf('id="scaleQueryPanel"');
        const seg = col1.slice(iQ, iQ + 2000);
        ['queryScaleVal', 'querySigVal', 'scaleQueryUnit',
         'scaleQuerySigUnit'].forEach((id) => {
            assertTrue(seg.indexOf('id="' + id + '"') !== -1, '#' + id + ' жив');
        });
        assertTrue(seg.indexOf('queryFromScaleLive()') !== -1,
            'живой расчёт «шкала → сигнал» жив');
        assertTrue(seg.indexOf('queryFromSignalLive()') !== -1,
            'живой расчёт «сигнал → шкала» жив');
    });

    test('scaleQueryEnterBlur: функция-обёртка + на ОБОИХ полях ППР', () => {
        assertTrue(INDEX_SRC.indexOf('function scaleQueryEnterBlur(') !== -1,
            'функция определена');
        const fn = INDEX_SRC.slice(
            INDEX_SRC.indexOf('function scaleQueryEnterBlur('),
            INDEX_SRC.indexOf('}', INDEX_SRC.indexOf('function scaleQueryEnterBlur(')) + 1);
        assertTrue(fn.indexOf('tempQueryEnterBlur(e, el)') !== -1,
            'обёртка над tempQueryEnterBlur (логика Task 496)');
        const col1 = colInput('scale-signal');
        assertEqual(col1.split('onkeydown="scaleQueryEnterBlur(event,this)"').length - 1, 2,
            'обработчик на обоих полях ППР');
        const iT = col1.indexOf('id="queryScaleVal"');
        const tagS = col1.slice(col1.lastIndexOf('<input', iT),
                                col1.indexOf('>', iT) + 1);
        assertTrue(tagS.indexOf('enterkeyhint="done"') !== -1,
            'enterkeyhint done у поля шкалы');
        const iV = col1.indexOf('id="querySigVal"');
        const tagV = col1.slice(col1.lastIndexOf('<input', iV),
                                col1.indexOf('>', iV) + 1);
        assertTrue(tagV.indexOf('enterkeyhint="done"') !== -1,
            'enterkeyhint done у поля сигнала');
    });

    test('комментарий-маркер Task 502 над панелью ППР', () => {
        const iQ = INDEX_SRC.indexOf('id="scaleQueryPanel"');
        const iCmt = INDEX_SRC.lastIndexOf('<!--', iQ);
        const cmt = INDEX_SRC.slice(iCmt, iQ);
        assertTrue(cmt.indexOf('Task 502') !== -1, 'маркер задачи');
        assertTrue(cmt.indexOf('ПОМЕНЯНЫ МЕСТАМИ') !== -1, 'суть swap');
        assertTrue(cmt.indexOf('ЗАКРЫВАЕТ') !== -1, 'суть Enter-blur');
    });
});

// ==========================================================================
// D. VM — scaleQueryEnterBlur: Enter гасит клавиатуру
// ==========================================================================
describe('Task 502 D: VM — Enter в полях ППР гасит клавиатуру', () => {
    function grabFn(name) {
        const start = INDEX_SRC.indexOf('function ' + name + '(');
        if (start === -1) return null;
        const brace = INDEX_SRC.indexOf('{', start);
        let depth = 0;
        for (let i = brace; i < INDEX_SRC.length; i++) {
            if (INDEX_SRC[i] === '{') depth++;
            else if (INDEX_SRC[i] === '}') {
                depth--;
                if (depth === 0) return INDEX_SRC.slice(start, i + 1);
            }
        }
        return null;
    }

    test('VM: Enter — гасит клавиатуру; другая клавиша — без действий', () => {
        const src = grabFn('tempQueryEnterBlur') + '\n' +
                    grabFn('scaleQueryEnterBlur');
        const mk = (props) => {
            const calls = { preventDefault: 0, stopPropagation: 0, blur: 0 };
            const ev = Object.assign({}, props, {
                preventDefault: () => { calls.preventDefault++; },
                stopPropagation: () => { calls.stopPropagation++; },
            });
            const el = { blur: () => { calls.blur++; } };
            return { calls, ev, el };
        };
        const ctx = { console: { log: () => {} } };
        vm.createContext(ctx);
        vm.runInContext(src, ctx);

        const enter = mk({ key: 'Enter', keyCode: 13 });
        vm.runInContext('scaleQueryEnterBlur(__e, __l)',
                        Object.assign(ctx, { __e: enter.ev, __l: enter.el }));
        assertEqual(enter.calls.preventDefault, 1, 'Enter: preventDefault');
        assertEqual(enter.calls.stopPropagation, 1, 'Enter: stopPropagation');
        assertEqual(enter.calls.blur, 1, 'Enter: blur (клавиатура закрыта)');

        const other = mk({ key: 'a', keyCode: 65 });
        vm.runInContext('scaleQueryEnterBlur(__e, __l)',
                        Object.assign(ctx, { __e: other.ev, __l: other.el }));
        assertEqual(other.calls.preventDefault, 0, 'не Enter: без действий');
        assertEqual(other.calls.blur, 0, 'не Enter: blur не звался');
    });

    test('границы: глобальный Enter/Next жив; ППР датчиков не тронут', () => {
        // глобальный переход между полями (document keydown) жив
        assertTrue(INDEX_SRC.indexOf(
            'fields[idx + 1].focus();') !== -1,
            'глобальный Enter/Next-переход жив (для остальных блоков)');
        // tempQueryEnterBlur жива и стоит на полях ППР датчиков
        assertTrue(INDEX_SRC.indexOf('function tempQueryEnterBlur(') !== -1,
            'tempQueryEnterBlur жива');
        assertEqual(INDEX_SRC.split(
            'onkeydown="tempQueryEnterBlur(event,this)"').length - 1, 2,
            'оба поля ППР датчиков температуры — со своим обработчиком');
    });
});

// ==========================================================================
// E. SW — версия и комментарий
// ==========================================================================
describe('Task 502 E: Service Worker', () => {
    test("sw.js: CACHE_VERSION = 'kipia-test-v734'", () => {
        assertTrue(
            SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v734';") !== -1,
            'версия v726');
        assertFalse(SW_SRC.indexOf('kipia-test-v735') !== -1,
            'следующей версии нет');
    });

    test('sw.js: комментарий Task 502 — маркер заявки', () => {
        assertTrue(SW_SRC.indexOf('Task 502: цветная политура кнопок и блоков СНЯТА') !== -1,
            'маркер Task 502 в sw.js');
        assertTrue(SW_SRC.indexOf('поменяны местами') !== -1,
            'swap блоков упомянут');
        assertTrue(SW_SRC.indexOf('гасит клавиатуру') !== -1,
            'Enter-blur упомянут');
    });
});
