// tests/test-task469.js
// Task 469 — заявка пользователя: «Перепиши описание раздела на
// "Периодические работы на участке КИП ИОС, выполняемые в начале
// и в конце каждого месяца.
//
// Функционал
// Отметка выполнения — клик по ячейке месяца открывает диалог
// «Отметка выполнения»: укажите дату (по умолчанию — сегодняшняя)
// и нажмите «Подтвердить» — в ячейке появится зелёная галочка.
// Хранение отметок — отметки записываются в архив.
// Правка отметки — клик по отмеченной ячейке открывает диалог
// «Изменение отметки»: можно сохранить новую дату или удалить
// отметку.
// Обновление — кнопка «Обновить» в шапке страницы перезагружает
// отметки с сервера."»
//
// КОНТЕКСТ: окно «Описание раздела» справа от таблицы «Плановых
// мероприятий» создано Task 468 (pe-layout/pe-desc-card). ДО
// Task 469: вводный абзац упоминал образец «Пример таблицы
// мероприятий.xlsx» и группировку строк, пункт «Хранение отметок»
// раскрывал файл «Мероприятия_КИП_ИОС» (лист «Архив»), пятым
// пунктом была «Мобильная версия».
// РЕШЕНИЕ (клиент-only, только текст в index.html):
//   1) вводный абзац переписан: «Периодические работы на участке
//      КИП ИОС, выполняемые в начале и в конце каждого месяца.»;
//   2) «Хранение отметок» сокращён до «отметки записываются
//      в архив.»;
//   3) пункт «Мобильная версия» УДАЛЕН (5 → 4 пункта);
//   4) раскладка, стили и JS окна Task 468/463/464 НЕ тронуты.
//   SW: kipia-test-v732.
//
// Запуск: через tests/run-all.js (require './test-task469.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Блок окна описания (aside … </aside>) — все проверки содержания
// строго внутри него, чтобы не ловить те же слова в других разделах.
function descBlock() {
    const i = INDEX_SRC.indexOf('<aside class="pe-desc-card"');
    if (i === -1) return null;
    const j = INDEX_SRC.indexOf('</aside>', i);
    return (j === -1) ? null : INDEX_SRC.slice(i, j);
}

// ============================================================
// 1. SRC — HTML: вводный абзац переписан по заявке
// ============================================================
describe('Task 469 — SRC: вводный абзац описания', () => {

    test('лид — точный текст заявки «Периодические работы на участке КИП ИОС…»', () => {
        const html = descBlock();
        assertTrue(html !== null, 'окно описания живо');
        assertTrue(html.indexOf('Периодические работы на участке КИП ИОС, выполняемые в начале и в конце каждого месяца.') !== -1,
            'формулировка из заявки — дословно');
    });

    test('старые формулировки вводного абзаца удалены', () => {
        const html = descBlock();
        assertTrue(html.indexOf('Пример таблицы мероприятий') === -1,
            'упоминание образца-файла убрано');
        assertTrue(html.indexOf('периодические работы предприятия') === -1,
            '«работы предприятия» заменены на «работы на участке КИП ИОС»');
        assertTrue(html.indexOf('строки сгруппированы') === -1,
            'описание группировки строк убрано');
        assertTrue(html.indexOf('12 колонок-месяцев') === -1,
            'описание структуры таблицы убрано');
    });

    test('лид в разметке — по-прежнему .pe-desc-lead внутри aside', () => {
        const html = descBlock();
        assertTrue(html.indexOf('<div class="pe-desc-lead">Периодические работы на участке КИП ИОС,') !== -1,
            'тот же класс и позиция, что в Task 468');
    });
});

// ============================================================
// 2. SRC — HTML: функционал — ровно 4 пункта по заявке
// ============================================================
describe('Task 469 — SRC: список «Функционал» — 4 пункта', () => {

    test('пункт «Отметка выполнения» — полный текст заявки', () => {
        const html = descBlock();
        assertTrue(html.indexOf('<li><b>Отметка выполнения</b> — клик по ячейке месяца открывает диалог «Отметка выполнения»: укажите дату (по умолчанию — сегодняшняя) и нажмите «Подтвердить» — в ячейке появится зелёная галочка.</li>') !== -1,
            'формулировка из заявки — дословно');
    });

    test('пункт «Хранение отметок» сокращён: «отметки записываются в архив.»', () => {
        const html = descBlock();
        assertTrue(html.indexOf('<li><b>Хранение отметок</b> — отметки записываются в архив.</li>') !== -1,
            'короткая формулировка из заявки — дословно');
        assertTrue(html.indexOf('архива файла') === -1,
            'раскрытие «в архив файла …» убрано');
        assertTrue(html.indexOf('лист «Архив»') === -1,
            'детали листа «Архив» убраны из описания');
    });

    test('пункт «Правка отметки» — полный текст заявки', () => {
        const html = descBlock();
        assertTrue(html.indexOf('<li><b>Правка отметки</b> — клик по отмеченной ячейке открывает диалог «Изменение отметки»: можно сохранить новую дату или удалить отметку.</li>') !== -1,
            'формулировка из заявки — дословно');
    });

    test('пункт «Обновление» — полный текст заявки', () => {
        const html = descBlock();
        assertTrue(html.indexOf('<li><b>Обновление</b> — кнопка «Обновить» в шапке страницы перезагружает отметки с сервера.</li>') !== -1,
            'формулировка из заявки — дословно');
    });

    test('пункт «Мобильная версия» УДАЛЕН (5 → 4 пункта)', () => {
        const html = descBlock();
        assertTrue(html.indexOf('Мобильная версия') === -1,
            'пункта про мобильную версию больше нет');
        assertTrue((html.match(/<li>/g) || []).length === 4,
            'ровно четыре пункта функционала');
    });

    test('порядок пунктов по заявке: отметка → хранение → правка → обновление', () => {
        const html = descBlock();
        const a = html.indexOf('<b>Отметка выполнения</b>');
        const b = html.indexOf('<b>Хранение отметок</b>');
        const c = html.indexOf('<b>Правка отметки</b>');
        const d = html.indexOf('<b>Обновление</b>');
        assertTrue(a !== -1 && b !== -1 && c !== -1 && d !== -1,
            'все четыре пункта на месте');
        assertTrue(a < b && b < c && c < d,
            'порядок как в заявке пользователя');
    });

    test('подзаголовок «Функционал» жив (.pe-desc-sub)', () => {
        const html = descBlock();
        assertTrue(html.indexOf('<div class="pe-desc-sub">Функционал</div>') !== -1,
            'подзаголовок между лидом и списком');
    });
});

// ============================================================
// 3. SRC — HTML: каркас окна Task 468 не тронут
// ============================================================
describe('Task 469 — SRC: каркас окна Task 468 не тронут', () => {

    test('aside.pe-desc-card с aria-label и заголовком «Описание раздела»', () => {
        assertTrue(INDEX_SRC.indexOf('<aside class="pe-desc-card" aria-label="Описание раздела">') !== -1,
            'семантичный aside с доступным именем (Task 468)');
        const html = descBlock();
        assertTrue(html.indexOf('<div class="pe-desc-title">Описание раздела</div>') !== -1,
            'заголовок окна не менялся');
    });

    test('структура: заголовок → лид → «Функционал» → список', () => {
        const html = descBlock();
        const t = html.indexOf('pe-desc-title');
        const l = html.indexOf('pe-desc-lead');
        const s = html.indexOf('pe-desc-sub');
        const u = html.indexOf('pe-desc-list');
        assertTrue(t !== -1 && l > t && s > l && u > s,
            'порядок блоков окна сохранён из Task 468');
    });

    test('окно ровно одно и по-прежнему в «Плановых мероприятиях»', () => {
        const htmlStart = INDEX_SRC.indexOf('</head>');
        const html = INDEX_SRC.slice(htmlStart);
        assertTrue((html.match(/pe-desc-card/g) || []).length === 1,
            'pe-desc-card один — правка не размножила окно (Task 468)');
    });

    test('маркер Task 469 в комментарии над aside', () => {
        const i = INDEX_SRC.indexOf('<aside class="pe-desc-card"');
        const ctx = INDEX_SRC.slice(Math.max(0, i - 1200), i);
        assertTrue(ctx.indexOf('Task 469') !== -1,
            'комментарий о переписанном описании');
    });

    test('таблица раздела не тронута (строки мероприятий на месте)', () => {
        ['Отчёт по талонам', 'Выписка из ППР на следующий месяц',
         'Журнал учёта электрооборудования', 'Отчёт по графику ППР']
            .forEach(function(name) {
                assertTrue(INDEX_SRC.indexOf(name) !== -1,
                    'строка «' + name + '» жива');
            });
    });
});

// ============================================================
// 4. SRC — изоляция: раскладка/мобайл/JS не тронуты
// ============================================================
describe('Task 469 — SRC: изоляция (раскладка 468 / мобайл 464 / JS)', () => {

    test('раскладка Task 468 жива: .pe-layout flex + окно flex: 1 1 280px', () => {
        const i = INDEX_SRC.indexOf('.pe-layout {');
        assertTrue(i !== -1, 'flex-строка раскладки жива');
        const lay = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(/display:\s*flex/.test(lay), 'flex жив');
        const d = INDEX_SRC.indexOf('.pe-desc-card {');
        const card = INDEX_SRC.slice(d, INDEX_SRC.indexOf('}', d) + 1);
        assertTrue(/flex:\s*1 1 280px/.test(card),
            'окно описания забирает остаточное место справа');
    });

    test('@media 1199px: описание ПОД таблицей (Task 468)', () => {
        const i = INDEX_SRC.indexOf('@media (max-width: 1199px)');
        assertTrue(i !== -1, 'медиа-запрос узкого экрана жив');
        const ctx = INDEX_SRC.slice(i, i + 400);
        assertTrue(/\.pe-layout\s*\{\s*flex-direction:\s*column/.test(ctx),
            'раскладка складывается в колонку');
    });

    test('мобильный вид Task 464 жив (@media 1023px + pe-month-bar)', () => {
        const bar = INDEX_SRC.indexOf('.pe-month-bar { display: flex; }');
        assertTrue(bar !== -1, 'полоса выбора месяца жива');
        const head = INDEX_SRC.slice(Math.max(0, bar - 300), bar);
        assertTrue(/@media\s*\(max-width:\s*1023px\)/.test(head),
            'правило внутри @media 1023px');
    });

    test('JS отметок/обновления не тронут (PlanEventsData/peMonthSel)', () => {
        assertTrue(INDEX_SRC.indexOf('peMonthSel') !== -1,
            'селектор месяца жив');
        assertTrue(INDEX_SRC.indexOf('PlanEventsData.refresh()') !== -1,
            'кнопка «Обновить» (Task 463) жива');
        assertTrue(INDEX_SRC.indexOf('peTable') !== -1,
            'таблица с id=peTable жива');
    });

    test('идентичность серверного файла не выпала из приложения', () => {
        // «Мероприятия_КИП_ИОС» убрано из ТЕКСТА описания, но файл
        // остаётся идентификатором раздела в JS (Task 463)
        assertTrue(INDEX_SRC.indexOf('Мероприятия_КИП_ИОС') !== -1,
            'файл мероприятий жив в JS-части (вне окна описания)');
        const html = descBlock();
        assertTrue(html.indexOf('Мероприятия_КИП_ИОС') === -1,
            'в тексте описания файла нет (сокращение по заявке)');
    });

    test('CSS-правила окна не менялись (типографика Task 468)', () => {
        ['.pe-desc-card {', '.pe-desc-title {', '.pe-desc-lead {',
         '.pe-desc-sub {', '.pe-desc-list {',
         '[data-theme="light"] .pe-desc-lead {',
         '[data-theme="light"] .pe-desc-sub {']
            .forEach(function(sel) {
                assertTrue(INDEX_SRC.indexOf(sel) !== -1,
                    'правило ' + sel + ' живо');
            });
    });
});

// ============================================================
// 5. SW: версия кэша
// ============================================================
describe('Task 469 — SW: версия кэша', () => {

    test('CACHE_VERSION = kipia-test-v732', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v732';") !== -1,
            'инкремент Task 469: v692 → v693');
    });

    test('v692 в sw.js отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v692') === -1,
            'версии до Task 469 нет');
    });

    test('комментарий Task 469 в истории версий sw.js', () => {
        assertTrue(SW_SRC.indexOf('Task 469') !== -1, 'маркер задачи');
        assertTrue(SW_SRC.indexOf('Периодические работы на участке') !== -1,
            'описание переписанного текста в истории');
    });

    test('IMAGE_CACHE_VERSION не тронут (кэш картинок независим)', () => {
        assertTrue(SW_SRC.indexOf("const IMAGE_CACHE_VERSION = 'kipia-images-test-v3';") !== -1,
            'кэш картинок не инкрементирован');
    });
});
