// tests/test-task467.js
// Task 467 — заявка пользователя: «В окне предпросмотра печати
// списка мероприятий, лист со списком смещён вправо за границу
// окна предпросмотра.»
//
// КОНТЕКСТ: Task 465 открыл диалог печати списка мероприятий
// (кнопка-принтер в окне «Мероприятия» бара табеля). ПРИЧИНА
// ДЕФЕКТА: iframe предпросмотра наследовал альбомные 1063px из
// .wspprev-frame (Task 430 — печать ГРАФИКА), а _eventsPrevFit
// масштабирует КНИЖНЫЙ лист W=794 и режет paper overflow:hidden по
// 794px → лист (центрировался flex-ом в viewport 1063px, отступ
// ~134px) уезжал вправо, правый край срезался границей окна.
// ФИКС (приём Task 449 wst-prev-frame — талоны прошли этот же
// путь): новый класс wsev-prev-frame → CSS-ширина iframe 794px:
//   клиент (index.html): CSS-правило
//   .wspprev-frame.wsev-prev-frame { width: 794px; } + маркер
//   Task 467; в _openEventsPreview —
//   frame.className = 'wspprev-frame wsev-prev-frame' (комментарий
//   Task 467). Диалог/кнопки/генераторы PDF-Excel не тронуты;
//   график (1063px) и талоны (wst-prev-frame) — не тронуты.
//   SW: kipia-test-v734.
//
// Запуск: через tests/run-all.js (require './test-task467.js').

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
// 1. SRC — CSS: книжная ширина iframe предпросмотра списка
// ============================================================
describe('Task 467 — SRC: CSS — wsev-prev-frame 794px', () => {

    test('правило .wspprev-frame.wsev-prev-frame { width: 794px }', () => {
        const b = ruleBlock('.wspprev-frame.wsev-prev-frame {');
        assertTrue(b !== null && /width:\s*794px/.test(b),
            'книжная ширина iframe списка мероприятий — 794px');
    });

    test('правило стоит ПОСЛЕ базового .wspprev-frame (перекрытие 1063px)', () => {
        const base = INDEX_SRC.indexOf('.wspprev-frame {');
        const ev = INDEX_SRC.indexOf('.wspprev-frame.wsev-prev-frame {');
        assertTrue(base !== -1 && ev !== -1 && ev > base,
            'специфичность+порядок каскада перекрывают альбомные 1063px');
    });

    test('ширина 794px == W масштабирования _eventsPrevFit (ядро фикса)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_eventsPrevFit'));
        assertTrue(fn.indexOf('var W = 794;') !== -1,
            'fit масштабирует 794px — теперь совпадает с CSS iframe');
    });

    test('маркер Task 467 в CSS-комментарии', () => {
        const i = INDEX_SRC.indexOf('.wspprev-frame.wsev-prev-frame {');
        const ctx = INDEX_SRC.slice(Math.max(0, i - 500), i);
        assertTrue(ctx.indexOf('Task 467') !== -1,
            'комментарий о причине фикса рядом с правилом');
    });
});

// ============================================================
// 2. SRC — JS: класс на iframe диалога списка
// ============================================================
describe('Task 467 — SRC: JS — класс в _openEventsPreview', () => {

    test('frame.className = wspprev-frame wsev-prev-frame', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_openEventsPreview'));
        assertTrue(fn.indexOf(
            "frame.className = 'wspprev-frame wsev-prev-frame';") !== -1,
            'iframe списка получает книжный класс');
    });

    test('маркер Task 467 в комментарии JS', () => {
        const fn = methodText(INDEX_SRC, '_openEventsPreview');
        assertTrue(fn.indexOf('Task 467') !== -1, 'комментарий о фиксе');
    });

    test('остальная вёрстка диалога не тронута (кнопки/fit/srcdoc)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_openEventsPreview'));
        ['wspprev-print', 'wspprev-pdf', 'wspprev-xlsx', 'wspprev-cancel']
            .forEach(function(cls) {
                assertTrue(fn.indexOf(cls) !== -1, 'кнопка ' + cls + ' жива');
            });
        assertTrue(fn.indexOf('_buildEventsFileHtml') !== -1,
            'srcdoc из standalone-документа');
    });

    test('standalone-документ листа не менялся (190мм + flex центр)', () => {
        const fh = stripComments(methodText(INDEX_SRC, '_buildEventsFileHtml'));
        assertTrue(fh.indexOf('width: 190mm') !== -1, 'лист 190мм');
        assertTrue(fh.indexOf('justify-content: center') !== -1,
            'центрирование листа в iframe (теперь viewport 794px — без сдвига)');
    });
});

// ============================================================
// 3. SRC — изоляция фикса: график и талоны не тронуты
// ============================================================
describe('Task 467 — SRC: соседние предпросмотры не тронуты', () => {

    test('график: прежний wspprev-frame без книжного класса (1063px)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_openPrintPreview'));
        assertTrue(fn.indexOf("className = 'wspprev-frame';") !== -1,
            'альбомный график — базовый класс');
        assertTrue(fn.indexOf('wsev-prev-frame') === -1,
            'фикс не затронул предпросмотр графика');
    });

    test('талоны: wst-prev-frame 794px остался', () => {
        const b = ruleBlock('.wspprev-frame.wst-prev-frame {');
        assertTrue(b !== null && /width:\s*794px/.test(b),
            'правило талонов живо');
        const fn = stripComments(methodText(INDEX_SRC, '_openTalonsPreview'));
        assertTrue(fn.indexOf('wst-prev-frame') !== -1,
            'iframe талонов — с классом wst-prev-frame');
    });

    test('wsev-prev-frame не попал в другие диалоги', () => {
        const t = stripComments(methodText(INDEX_SRC, '_openTalonsPreview'));
        assertTrue(t.indexOf('wsev-prev-frame') === -1,
            'диалог талонов чист');
        const g = stripComments(methodText(INDEX_SRC, '_openPrintPreview'));
        assertTrue(g.indexOf('wsev-prev-frame') === -1,
            'диалог графика чист');
    });
});

// ============================================================
// 4. SW: версия кэша
// ============================================================
describe('Task 467 — SW: версия кэша', () => {

    test('CACHE_VERSION = kipia-test-v734', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v734';") !== -1,
            'инкремент Task 467: v690 → v691');
    });

    test('v690 в sw.js отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v690') === -1,
            'версии до Task 467 нет');
    });

    test('комментарий Task 467 о фиксе предпросмотра', () => {
        assertTrue(SW_SRC.indexOf('Task 467') !== -1, 'маркер задачи');
        assertTrue(SW_SRC.indexOf('wsev-prev-frame') !== -1,
            'упоминание класса фикса');
    });
});
