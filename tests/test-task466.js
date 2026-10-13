// tests/test-task466.js
// Task 466 — заявка пользователя: «В окне мероприятий поменяй
// местами значки раскрытия окна и печати мероприятий.»
//
// КОНТЕКСТ: Task 465 создал в окне «Мероприятия» бара табеля пару
// значков у правого края — [раскрытие (27px)][печать (в самом
// углу, right: 2px)]. Task 466 МЕНЯЕТ ИХ МЕСТАМИ:
//   клиент (index.html): CSS-правило #wsEventsPanel .ws-bar-exp
//   { right: 27px } УБРАНО (значок раскрытия возвращается в самый
//   угол на базовые right/top 2px), вместо него добавлено
//   #wsEventsPanel .ws-bar-print { right: 27px } — печать теперь
//   СЛЕВА от раскрытия. Пара остаётся парой: 22+3+22+2px от правой
//   грани, паддинг заголовка окна 52px не менялся; JS не тронут
//   (оба значка absolute внутри скроллера, прикол translateY
//   общий — порядок в DOM не важен); окно норм не тронуто.
//   SW: kipia-test-v733.
//
// Запуск: через tests/run-all.js (require './test-task466.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function ruleBlock(sel) {
    const i = INDEX_SRC.indexOf(sel);
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('}', i);
    return (j === -1) ? null : INDEX_SRC.slice(i, j + 1);
}

function methodText(src, name) {
    const start = src.indexOf(name + ': function(');
    if (start === -1) return '';
    const braceStart = src.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    return '';
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// ============================================================
// 1. SRC — CSS: значки ПОМЕНЯНЫ МЕСТАМИ
// ============================================================
describe('Task 466 — SRC: CSS — свап значков окна мероприятий', () => {

    test('печать сдвинута ВЛЕВО: #wsEventsPanel .ws-bar-print { right: 27px }', () => {
        const b = ruleBlock('#wsEventsPanel .ws-bar-print { right: 27px; }');
        assertTrue(b !== null,
            'печать — 27px от правой грани (слева от раскрытия)');
    });

    test('прежний сдвиг РАСКРЫТИЯ убран — раскрытие в самом углу', () => {
        assertTrue(INDEX_SRC.indexOf('#wsEventsPanel .ws-bar-exp { right: 27px; }') === -1,
            'правила Task 465 #wsEventsPanel .ws-bar-exp { right: 27px } больше нет');
        const i = INDEX_SRC.indexOf('.ws-bar-exp {');
        const j = INDEX_SRC.indexOf('}', i);
        const base = INDEX_SRC.slice(i, j + 1);
        assertTrue(/right:\s*2px/.test(base) && /top:\s*2px/.test(base),
            'база .ws-bar-exp — 2px + 1px рамка = 3px от края (угол)');
    });

    test('переопределений раскрытия по окнам больше нет (только печать)', () => {
        // единственное #wsEventsPanel-переопределение геометрии — печать
        const re = /#wsEventsPanel\s+\.ws-bar-[a-z]+\s*\{[^}]*right:/g;
        const found = INDEX_SRC.match(re) || [];
        assertTrue(found.length === 1 &&
                   found[0].indexOf('.ws-bar-print') !== -1,
            'ровно одно переопределение — у печати (27px), у раскрытия нет');
    });

    test('пара осталась парой: печать 22×22 в базе (угол по умолчанию)', () => {
        const p = ruleBlock('.ws-bar-print {\n');
        assertTrue(p !== null && /right:\s*2px/.test(p) && /top:\s*2px/.test(p),
            'база .ws-bar-print — 2px (в окне мероприятий перекрыта 27px)');
        assertTrue(p !== null && /width:\s*22px/.test(p) && /height:\s*22px/.test(p),
            'квадрат 22×22 — размер не менялся');
    });

    test('сброс margin-top у ОБОИХ значков окна мероприятий жив', () => {
        const i = INDEX_SRC.indexOf('.ws-events-panel > .ws-bar-exp,');
        assertTrue(i !== -1, 'правило сброса маржи на месте');
        const j = INDEX_SRC.indexOf('}', i);
        const rule = INDEX_SRC.slice(i, j + 1);
        assertTrue(rule.indexOf('.ws-events-panel > .ws-bar-print') !== -1 &&
                   rule.indexOf('margin-top: 0') !== -1,
            'оба значка — margin-top: 0 (правило Task 381 > * + *)');
    });

    test('паддинг заголовка 52px (пара) не менялся', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-events-panel .ws-ep-cap { padding-right: 52px; }') !== -1,
            '52px под пару [печать][раскрытие]');
        assertTrue(INDEX_SRC.indexOf('.ws-cal-panel .ws-cp-cap { padding-right: 26px; }') !== -1,
            'окно норм — прежние 26px');
    });
});

// ============================================================
// 2. SRC — JS: логика не тронута, порядок — только CSS
// ============================================================
describe('Task 466 — SRC: JS не тронут (порядок значков — CSS)', () => {

    test('_barExpSync: печать по-прежнему ТОЛЬКО в окне мероприятий', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_barExpSync'));
        assertTrue(fn.indexOf("el.id === 'wsEventsPanel'") !== -1,
            'условие создания — id окна мероприятий');
        assertTrue(fn.indexOf("className = 'ws-bar-print'") !== -1,
            'класс .ws-bar-print');
        assertTrue(fn.indexOf('printEventsList') !== -1,
            'клик — печать списка');
    });

    test('прикол прокрутки — на ОБОИХ значках (не зависел от порядка)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_barExpSync'));
        assertTrue(fn.indexOf("el.querySelector('.ws-bar-print')") !== -1,
            'слушатель scroll двигает и печать');
        assertTrue(fn.indexOf("if (prn) prn.style.transform = tNow") !== -1,
            'transform ставится обоим значкам при sync');
    });

    test('маркер Task 466 в комментариях index.html', () => {
        assertTrue(INDEX_SRC.indexOf('Task 466') !== -1,
            'комментарий о свапе значков');
        assertTrue(INDEX_SRC.indexOf('СЛЕВА от значка раскрытия') !== -1,
            'направление печати — слева от раскрытия');
    });
});

// ============================================================
// 3. SW: версия кэша
// ============================================================
describe('Task 466 — SW: версия кэша', () => {

    test('CACHE_VERSION = kipia-test-v733', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v733';") !== -1,
            'инкремент Task 466: v689 → v690');
    });

    test('v689 в sw.js отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v689') === -1,
            'версии до Task 466 нет');
    });

    test('комментарий Task 466 о свапе значков', () => {
        assertTrue(SW_SRC.indexOf('Task 466') !== -1, 'маркер задачи');
        assertTrue(SW_SRC.indexOf('слева от раскрытия') !== -1,
            'печать — слева от раскрытия');
    });
});
