// tests/test-task496.js
// Task 496: заявка пользователя — «В блоке произвольного расчёта,
//   после ввода одного из данных и при нажатии подтверждения на
//   клавиатуре, клавиатура должна закрываться, а не перемещаться
//   по следующим полям ввода.»
//
// Панель произвольного расчёта — page-temp-sensor-view
// (#tempCustomCalcPanel, поля tempQueryTemp/tempQueryVal, Task
// 371/373/494): раньше у поля температуры был enterkeyhint="next" —
// кнопка «Далее» мобильной клавиатуры перескакивала в поле значения.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — HTML: оба поля ППР — enterkeyhint="done" (кнопка
//      «Готово»), у ППР-чанка НЕТ enterkeyhint="next"; оба поля
//      получили onkeydown="tempQueryEnterBlur(event,this)".
//   B. SRC — ГРАНИЦЫ (заявка только ППР): блок расчёта таблицы
//      (Task 495, tempTableFormPanel: min/max/step) НЕ тронут —
//      enterkeyhint="next" у min/max остался, хелпера в блоке нет;
//      ГЛОБАЛЬНЫЙ Enter-переход между полями (document keydown,
//      «Обработчик Enter/Next…») жив и не знает про ППР.
//   C. VM — tempQueryEnterBlur: Enter (key/keyCode 13) вызывает
//      preventDefault + stopPropagation (выход из глобального
//      перескока: без него событие всплывает к document, handler
//      ставит фокус в следующее поле после blur) + blur (клавиатура
//      закрывается); обычные клавиши (Tab/'a') — без действий; el
//      без blur и пустое событие — не падают.
//   D. SW v720 (guard v721; v719 в sw.js отсутствует) + комментарий
//      Task 496.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Блок страницы по id (баланс div-ов) — как в test-task372/495
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

// Извлечение исходника function-декларации по имени (баланс скобок)
function grabFn(name) {
    const start = INDEX_SRC.indexOf('function ' + name + '(');
    if (start === -1) return null;
    const braceStart = INDEX_SRC.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < INDEX_SRC.length; i++) {
        if (INDEX_SRC[i] === '{') depth++;
        else if (INDEX_SRC[i] === '}') {
            depth--;
            if (depth === 0) return INDEX_SRC.slice(start, i + 1);
        }
    }
    return null;
}

// Чанк панели ППР: от начала тега div до блока таблицы (Task 495)
function pprChunk() {
    const iId = INDEX_SRC.indexOf('id="tempCustomCalcPanel"');
    if (iId === -1) return null;
    const iPanel = INDEX_SRC.lastIndexOf('<div', iId);
    const iNext = INDEX_SRC.indexOf('id="tempTableFormPanel"');
    if (iPanel === -1 || iNext === -1 || iNext < iPanel) return null;
    return INDEX_SRC.slice(iPanel, iNext);
}

// Чанк блока таблицы (Task 495) — границы заявки Task 496
function tablePanelChunk() {
    const iId = INDEX_SRC.indexOf('id="tempTableFormPanel"');
    const iPanel = iId === -1 ? -1 : INDEX_SRC.lastIndexOf('<div', iId);
    const iBtn = INDEX_SRC.indexOf('onclick="calcTempSensor()"');
    if (iPanel === -1 || iBtn === -1 || iBtn < iPanel) return null;
    return INDEX_SRC.slice(iPanel, iBtn);
}

describe('Task 496 — SRC: ППР — клавиатура закрывается, не перескакивает', () => {

    test('HTML: оба поля ППР — enterkeyhint="done", next НЕТ', () => {
        const c = pprChunk();
        assertTrue(c !== null, 'чанк ППР извлечён');
        assertEqual(c.split('enterkeyhint="done"').length - 1, 2,
            'у ОБОИХ полей ППР enterkeyhint="done"');
        assertFalse(c.indexOf('enterkeyhint="next"') !== -1,
            'в ППР enterkeyhint="next" НЕТ (кнопка «Далее» убрана)');
    });

    test('HTML: поле температуры больше не «next» (была причина перескока)', () => {
        const b = pageBlock('temp-sensor-view');
        assertTrue(b !== null, 'страница есть');
        const i = b.indexOf('id="tempQueryTemp"');
        assertTrue(i !== -1, 'поле температуры есть');
        const tag = b.slice(b.lastIndexOf('<input', i),
                            b.indexOf('>', i) + 1);
        assertTrue(tag.indexOf('enterkeyhint="done"') !== -1,
            'у поля температуры — done');
        assertFalse(tag.indexOf('enterkeyhint="next"') !== -1,
            'у поля температуры НЕТ next');
    });

    test('HTML: оба поля ППР — onkeydown tempQueryEnterBlur(event,this)', () => {
        const c = pprChunk();
        assertEqual(c.split('onkeydown="tempQueryEnterBlur(event,this)"').length - 1, 2,
            'обработчик Enter на обоих полях ППР');
        // обработчик стоит у самих input-тегов (не в тексте подписей)
        assertEqual(c.split('<input').length - 1, 2,
            'в чанке ППР ровно ДВА input');
    });

    test('HTML: подпись и примеры полей не изменились (только клавиатура)', () => {
        const c = pprChunk();
        for (const chunk of [
            'Температура (°C)',
            'id="tempQueryValLabel"',
            'oninput="tempQueryFromTemp()"',
            'oninput="tempQueryFromValue()"',
            'class="scale-field ts-calc-field"'
        ]) {
            assertTrue(c.indexOf(chunk) !== -1, 'ППР содержит: ' + chunk);
        }
        assertEqual(c.split('class="scale-field ts-calc-field"').length - 1, 2,
            'оба поля остались крупными ts-calc-field (Task 494)');
    });

    test('HTML: комментарий над панелью — маркер Task 496', () => {
        const iId = INDEX_SRC.indexOf('id="tempCustomCalcPanel"');
        const iPanel = INDEX_SRC.lastIndexOf('<div', iId);
        const iCmt = INDEX_SRC.lastIndexOf('<!--', iPanel);
        const cmt = INDEX_SRC.slice(iCmt, iPanel);
        assertTrue(cmt.indexOf('Task 496') !== -1, 'маркер задачи в комментарии');
        assertTrue(cmt.indexOf('ЗАКРЫВАЕТ клавиатуру') !== -1,
            'суть заявки в комментарии');
        assertTrue(cmt.indexOf('enterkeyhint="done"') !== -1 ||
                   cmt.indexOf('enterkeyhint=\\u0022done\\u0022') !== -1 ||
                   cmt.indexOf('done') !== -1,
            'упоминание done');
    });
});

describe('Task 496 — SRC: границы заявки (блок таблицы НЕ тронут)', () => {

    test('HTML: блок расчёта таблицы — прежние enterkeyhint (min/max next)', () => {
        const c = tablePanelChunk();
        assertTrue(c !== null, 'чанк блока таблицы извлечён');
        assertEqual(c.split('enterkeyhint="next"').length - 1, 2,
            'у min/max блока таблицы next остался (заявка только про ППР)');
        assertEqual(c.split('enterkeyhint="done"').length - 1, 1,
            'у шага таблицы — done (как и было)');
    });

    test('HTML: в блоке таблицы НЕТ tempQueryEnterBlur', () => {
        const c = tablePanelChunk();
        assertFalse(c.indexOf('tempQueryEnterBlur') !== -1,
            'хелпер ППР не проникает в блок таблицы');
    });

    test('SRC: глобальный Enter-переход между полями жив (границы заявки)', () => {
        // Глобальный document-keydown «Обработчик Enter/Next на
        // клавиатуре — логичный переход между полями и расчёт» — НЕ
        // тронут (ППР выходит из него через stopPropagation хелпера,
        // остальные блоки страницы перескакивают как раньше).
        const i = INDEX_SRC.indexOf('// Обработчик Enter/Next на клавиатуре');
        assertTrue(i !== -1, 'глобальный обработчик на месте');
        const g = INDEX_SRC.slice(i, i + 1400);
        assertTrue(g.indexOf("fields[idx + 1].focus();") !== -1,
            'переход на следующее поле жив');
        assertTrue(g.indexOf('.converter-convert-btn') !== -1,
            'кнопка «Рассчитать» на последнем поле жива');
        assertTrue(g.indexOf('tempQuery') === -1,
            'глобальный handler не знает про ППР (не адаптирован под заявку)');
    });

    test('SRC: хелпер останавливает всплытие (stopPropagation)', () => {
        const fn = grabFn('tempQueryEnterBlur');
        assertTrue(fn !== null, 'функция есть');
        assertTrue(fn.indexOf('stopPropagation') !== -1,
            'stopPropagation — выход из глобального Enter-перехода');
        assertTrue(fn.indexOf('if(e.stopPropagation)') !== -1,
            'мягкая проверка наличия метода');
    });
});

describe('Task 496 — VM: tempQueryEnterBlur (Enter гасит клавиатуру)', () => {

    const fnSrc = grabFn('tempQueryEnterBlur');

    function makeVm() {
        const ctx = {};
        vm.createContext(ctx);
        vm.runInContext(fnSrc + '\n;globalThis.__fn = tempQueryEnterBlur;', ctx);
        return ctx.__fn;
    }

    test('функция определена в index.html', () => {
        assertTrue(fnSrc !== null, 'function tempQueryEnterBlur есть');
        assertTrue(fnSrc.indexOf('e.key') !== -1 ||
                   fnSrc.indexOf('e.keyCode') !== -1,
            'проверка клавиши Enter');
        assertTrue(fnSrc.indexOf('blur') !== -1, 'снятие фокуса (blur)');
        assertTrue(fnSrc.indexOf('preventDefault') !== -1,
            'гашение перескока (preventDefault)');
    });

    test('Enter: preventDefault + stopPropagation + blur → клавиатура закрывается', () => {
        const fn = makeVm();
        let prevented = 0, blurred = 0, stopped = 0;
        const ev = { key: 'Enter', keyCode: 13,
                     preventDefault: () => { prevented++; },
                     stopPropagation: () => { stopped++; } };
        const el = { blur: () => { blurred++; } };
        fn(ev, el);
        assertEqual(prevented, 1, 'перескакивание погашено (1 preventDefault)');
        assertEqual(stopped, 1,
            'всплытие к document остановлено (1 stopPropagation — глобальный ' +
            'Enter-переход не получит событие и не поставит фокус в следующее поле)');
        assertEqual(blurred, 1, 'фокус снят (1 blur) — клавиатура закрыта');
    });

    test('keyCode 13 без key (старые IME): тоже гасит, стопит и blur', () => {
        const fn = makeVm();
        let prevented = 0, blurred = 0, stopped = 0;
        const ev = { keyCode: 13, preventDefault: () => { prevented++; },
                     stopPropagation: () => { stopped++; } };
        const el = { blur: () => { blurred++; } };
        fn(ev, el);
        assertEqual(prevented, 1, 'preventDefault вызван');
        assertEqual(stopped, 1, 'stopPropagation вызван');
        assertEqual(blurred, 1, 'blur вызван');
    });

    test('обычные клавиши (Tab, «a») — НЕ гасят, НЕ стопят и НЕ blur', () => {
        const fn = makeVm();
        let prevented = 0, blurred = 0, stopped = 0;
        const el = { blur: () => { blurred++; } };
        fn({ key: 'Tab', preventDefault: () => { prevented++; },
             stopPropagation: () => { stopped++; } }, el);
        fn({ key: 'a', keyCode: 65, preventDefault: () => { prevented++; },
             stopPropagation: () => { stopped++; } }, el);
        fn({ key: 'Backspace', preventDefault: () => { prevented++; },
             stopPropagation: () => { stopped++; } }, el);
        assertEqual(prevented, 0, 'preventDefault НЕ вызван');
        assertEqual(stopped, 0, 'stopPropagation НЕ вызван — всплытие живо');
        assertEqual(blurred, 0, 'blur НЕ вызван — ввод не мешается');
    });

    test('защита: el без blur / event без stopPropagation — не падают', () => {
        const fn = makeVm();
        let okNoEl = true, okNoEv = true, okNoSp = true;
        try { fn({ key: 'Enter', preventDefault: () => {} }, {}); }
        catch (e) { okNoEl = false; }
        try { fn(null, { blur: () => {} }); }
        catch (e) { okNoEv = false; }
        // event без stopPropagation (старые среды) — blur всё равно зовём
        let blurred = 0;
        try { fn({ key: 'Enter', keyCode: 13, preventDefault: () => {} },
                 { blur: () => { blurred++; } }); }
        catch (e) { okNoSp = false; }
        assertTrue(okNoEl, 'el без blur() не бросает исключение');
        assertTrue(okNoEv, 'пустое событие не бросает исключение');
        assertTrue(okNoSp, 'event без stopPropagation не бросает исключение');
        assertEqual(blurred, 1, 'blur вызван и без stopPropagation');
    });

    test('attr → имя функции: onkeydown ссылается на глобальное имя', () => {
        const c = pprChunk();
        assertTrue(c.indexOf('onkeydown="tempQueryEnterBlur(event,this)"') !== -1,
            'атрибут вызывает tempQueryEnterBlur(event,this)');
        assertTrue(INDEX_SRC.indexOf('function tempQueryEnterBlur(') !== -1,
            'глобальная функция объявлена (страница её видит)');
    });
});

describe('Task 496 — SW: версия кеша v720', () => {

    test('SW: CACHE_VERSION = kipia-test-v735, один инкремент', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v735';") !== -1,
            'CACHE_VERSION = kipia-test-v735');
        assertFalse(SW_SRC.indexOf('kipia-test-v719') !== -1,
            'v719 в sw.js отсутствует (ровно один инкремент)');
        assertFalse(SW_SRC.indexOf('kipia-test-v736') !== -1,
            'v721 не существует (guard)');
    });

    test('SW: комментарий Task 496 в шапке версий', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v735';");
        // Task 499: комментарий плейсхолдеров диапазонов (~430 симв.)
        // отодвинул Task 496 до ~1292 — окно 900 → 1600.
        // Task 502: окно 2400 → 2700 (якорь 2500).
        const ctx = SW_SRC.slice(Math.max(0, i - 4000), i);
        assertTrue(ctx.indexOf('Task 496') !== -1, 'маркер задачи');
        assertTrue(ctx.indexOf('произвольного расчёта') !== -1,
            'упоминание ППР');
        assertTrue(ctx.indexOf('tempQueryEnterBlur') !== -1,
            'упоминание хелпера');
    });
});

console.log('test-task496: все describes зарегистрированы');
