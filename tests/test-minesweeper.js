// Тесты расчёта размера клетки «Сапёра» (Task 191):
//   msCalcCellSize — адаптация игрового поля под десктоп.
//
// До Task 191 размер клетки считался от window.innerWidth без
// ограничения сверху: на десктопе 1920px клетка была ~206px и поле
// растягивалось почти на весь экран. После Task 191 на десктопе
// (>= 1024px) клетка ограничена 40px, а touch-спейсер (36px)
// не вычитается из доступной ширины.
//
// Формула: availW = baseW - containerPad(32) - boardPad - scrollSpace;
//          cell = floor((availW - (cols-1)*gap) / cols); cap 40 на десктопе.

const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');
const { extractFunctions, setMockViewport, clearMockStorage, getMockElement, setMockStorageItem, getMockStorageKeys } = require('./extract-functions.js');
const fns = extractFunctions();

describe('msCalcCellSize — мобильный лейаут (< 1024px, поведение не менялось)', () => {

    test('375px (iPhone SE): 32px', () => {
        setMockViewport(375);
        // boardPad=8, gap=1, scroll=36: (375-32-8-36-8)/9 = 32.33 → 32
        assertEqual(fns.msCalcCellSize(), 32, 'клетка на 375px должна быть 32px');
    });

    test('390px (iPhone 14): 34px', () => {
        setMockViewport(390);
        // (390-32-8-36-8)/9 = 34 → 34
        assertEqual(fns.msCalcCellSize(), 34, 'клетка на 390px должна быть 34px');
    });

    test('768px (планшет, мобильный лейаут): без ограничения', () => {
        setMockViewport(768);
        // boardPad=16, gap=2, scroll=36: (768-32-16-36-16)/9 = 74.2 → 74
        // ограничение 40px НЕ применяется ниже 1024px (Task 191 — только десктоп)
        assertEqual(fns.msCalcCellSize(), 74, 'на планшете мобильное поведение сохранено');
    });

    test('Минимальный размер клетки 20px на очень узком экране', () => {
        setMockViewport(280);
        // (280-32-8-36-8)/9 = 21.7 → 21 — выше минимума
        assertTrue(fns.msCalcCellSize() >= 20, 'клетка не должна быть меньше 20px');
    });
});

describe('msCalcCellSize — десктоп (>= 1024px, Task 191: ограничение 40px)', () => {

    test('1024px: клетка 40px (было ~106px)', () => {
        setMockViewport(1024);
        // boardPad=16, gap=2, scroll=0: (1024-32-16-16)/9 = 106.6 → cap 40
        assertEqual(fns.msCalcCellSize(), 40, 'на десктопе клетка ограничена 40px');
    });

    test('1440px: клетка 40px (было ~148px)', () => {
        setMockViewport(1440);
        assertEqual(fns.msCalcCellSize(), 40, 'на десктопе клетка ограничена 40px');
    });

    test('1920px: клетка 40px (было ~206px)', () => {
        setMockViewport(1920);
        assertEqual(fns.msCalcCellSize(), 40, 'поле не должно растягиваться на весь экран');
    });

    test('2560px (2K): клетка 40px', () => {
        setMockViewport(2560);
        assertEqual(fns.msCalcCellSize(), 40, 'на больших мониторах поле остаётся компактным');
    });

    test('Ширина поля на десктопе укладывается в контейнер 520px', () => {
        setMockViewport(1920);
        const cell = fns.msCalcCellSize();
        // доска = 9 клеток + 8 gap по 2px + padding 8px*2 + border 1px*2
        const boardW = 9 * cell + 8 * 2 + 8 * 2 + 2;
        assertTrue(boardW <= 520, 'поле ' + boardW + 'px должно влезать в контейнер 520px (max-width из Task 191)');
    });

    test('Все сложности (9 колонок) имеют одинаковую ширину поля на десктопе', () => {
        setMockViewport(1920);
        // easy 9x9, medium 9x16, hard 9x28 — все 9 колонок,
        // значит ширина клетки и поля одинакова
        const cell = fns.msCalcCellSize();
        assertEqual(cell, 40, 'ширина клетки не зависит от количества строк');
    });
});

// Task 192: горизонтальные игровые поля на десктопе + счёт достижений.
// На десктопе (>= 1024px) medium/hard разворачиваются горизонтально:
// 9x16 → 16x9, 9x28 → 28x9; на мобильном ориентация прежняя —
// вертикальная.
//
// Task 193: счёт достижений хранит топ-3 ЛУЧШИХ побед по времени
// (ключ msBestResults): поражения не записываются, список отсортирован
// по времени (быстрее — выше), медленная победа не вытесняет быстрые.
// Победы из старого ключа msRecentResults (Task 192) переносятся
// один раз при первом запуске (msMigrateResults).

describe('msEffectiveDims — ориентация поля (Task 192)', () => {

    test('мобильный 375px: поля вертикальные, как раньше', () => {
        setMockViewport(375);
        assertEqual(JSON.stringify(fns.msEffectiveDims('easy')),
            JSON.stringify({ cols: 9, rows: 9, mines: 10 }), 'easy 9x9 без изменений');
        assertEqual(JSON.stringify(fns.msEffectiveDims('medium')),
            JSON.stringify({ cols: 9, rows: 16, mines: 25 }), 'medium вертикальный 9x16');
        assertEqual(JSON.stringify(fns.msEffectiveDims('hard')),
            JSON.stringify({ cols: 9, rows: 28, mines: 45 }), 'hard вертикальный 9x28');
    });

    test('десктоп 1440px: medium/hard развёрнуты горизонтально', () => {
        setMockViewport(1440);
        assertEqual(JSON.stringify(fns.msEffectiveDims('easy')),
            JSON.stringify({ cols: 9, rows: 9, mines: 10 }), 'easy остаётся квадратом');
        assertEqual(JSON.stringify(fns.msEffectiveDims('medium')),
            JSON.stringify({ cols: 16, rows: 9, mines: 25 }), 'medium горизонтальный 16x9');
        assertEqual(JSON.stringify(fns.msEffectiveDims('hard')),
            JSON.stringify({ cols: 28, rows: 9, mines: 45 }), 'hard горизонтальный 28x9');
    });

    test('граница 1024px: уже десктоп — горизонтальная ориентация', () => {
        setMockViewport(1024);
        assertEqual(JSON.stringify(fns.msEffectiveDims('medium')),
            JSON.stringify({ cols: 16, rows: 9, mines: 25 }), 'на 1024px поле горизонтальное');
    });

    test('неизвестная сложность → fallback на easy', () => {
        setMockViewport(1920);
        assertEqual(JSON.stringify(fns.msEffectiveDims('нет такой')),
            JSON.stringify({ cols: 9, rows: 9, mines: 10 }), 'fallback на easy 9x9');
    });
});

describe('msDiffLabel — подписи сложностей в селекторе (Task 192)', () => {

    test('мобильный: 9x9 / 9x16 / 9x28', () => {
        setMockViewport(375);
        assertEqual(fns.msDiffLabel('easy'), '9x9', 'подпись easy на мобильном');
        assertEqual(fns.msDiffLabel('medium'), '9x16', 'подпись medium на мобильном');
        assertEqual(fns.msDiffLabel('hard'), '9x28', 'подпись hard на мобильном');
    });

    test('десктоп: 9x9 / 16x9 / 28x9 — ширина впереди', () => {
        setMockViewport(1920);
        assertEqual(fns.msDiffLabel('easy'), '9x9', 'подпись easy на десктопе');
        assertEqual(fns.msDiffLabel('medium'), '16x9', 'подпись medium на десктопе');
        assertEqual(fns.msDiffLabel('hard'), '28x9', 'подпись hard на десктопе');
    });

    test('неизвестная сложность → пустая подпись', () => {
        setMockViewport(1920);
        assertEqual(fns.msDiffLabel('unknown'), '', 'неизвестная сложность даёт пустую строку');
    });
});

describe('msCalcCellSize(cols) — горизонтальное поле на десктопе (Task 192)', () => {

    test('1920px, 28 колонок (hard 28x9): клетка 40px', () => {
        setMockViewport(1920);
        // (1920-32-16-54)/28 = 64.9 → cap 40
        assertEqual(fns.msCalcCellSize(28), 40, 'горизонтальное поле не растягивается на весь экран');
    });

    test('1440px, 28 колонок: клетка 40px', () => {
        setMockViewport(1440);
        assertEqual(fns.msCalcCellSize(28), 40, 'клетка ограничена 40px');
    });

    test('1024px, 28 колонок: клетка 32px, поле влезает без прокрутки', () => {
        setMockViewport(1024);
        // (1024-32-16-54)/28 = 32.9 → 32
        const cell = fns.msCalcCellSize(28);
        assertEqual(cell, 32, 'клетка на минимальном десктопе');
        // доска = 28 клеток + 27 gap по 2px + padding 8px*2 + border 1px*2
        const boardW = 28 * cell + 27 * 2 + 8 * 2 + 2;
        assertTrue(boardW <= 1024 - 32, 'поле ' + boardW + 'px влезает в страницу 1024px без прокрутки');
    });

    test('1024px, 16 колонок (medium 16x9): клетка 40px', () => {
        setMockViewport(1024);
        // (1024-32-16-30)/16 = 59.1 → cap 40
        assertEqual(fns.msCalcCellSize(16), 40, 'medium на минимальном десктопе — клетка 40px');
    });

    test('без аргумента — использует активные msCols (обратная совместимость)', () => {
        setMockViewport(1920);
        assertEqual(fns.msCalcCellSize(), fns.msCalcCellSize(9), 'вызов без аргумента эквивалентен 9 колонкам');
    });
});

describe('Счёт достижений — лучшие результаты по времени (Task 193)', () => {

    test('Пустой счёт: msLoadResults() возвращает []', () => {
        clearMockStorage();
        assertEqual(fns.msLoadResults().length, 0, 'до первой победы счёт пуст');
    });

    test('Запись победы: won=true, время и сложность сохранены', () => {
        clearMockStorage();
        const res = fns.msRecordResult(true, 45, 'easy');
        assertEqual(res.length, 1, 'после первой победы — один результат');
        assertTrue(res[0].won, 'победа зафиксирована');
        assertEqual(res[0].time, 45, 'время партии сохранено');
        assertEqual(res[0].diff, 'easy', 'сложность сохранена');
    });

    test('Поражение не попадает в лучшие результаты', () => {
        clearMockStorage();
        const res = fns.msRecordResult(false, 7, 'medium');
        assertEqual(res.length, 0, 'взрыв не записывается в счёт достижений');
    });

    test('Поражение не вытесняет записанные победы', () => {
        clearMockStorage();
        fns.msRecordResult(true, 30, 'easy');
        fns.msRecordResult(false, 5, 'hard');
        const res = fns.msLoadResults();
        assertEqual(res.length, 1, 'счёт не изменился после взрыва');
        assertEqual(res[0].time, 30, 'прежняя победа на месте');
    });

    test('Результаты отсортированы по времени: быстрее — выше', () => {
        clearMockStorage();
        fns.msRecordResult(true, 40, 'easy');
        fns.msRecordResult(true, 20, 'hard');
        fns.msRecordResult(true, 30, 'medium');
        const res = fns.msLoadResults();
        assertEqual(res.length, 3, 'три победы в счёте');
        assertEqual(res[0].time, 20, 'первое место — самая быстрая победа');
        assertEqual(res[1].time, 30, 'второе место — среднее время');
        assertEqual(res[2].time, 40, 'третье место — самая медленная из топ-3');
        assertEqual(res[0].diff, 'hard', 'сложность победы сохранена при сортировке');
    });

    test('Хранится только топ-3: медленная победа не вытесняет быстрые', () => {
        clearMockStorage();
        fns.msRecordResult(true, 20, 'easy');
        fns.msRecordResult(true, 30, 'medium');
        fns.msRecordResult(true, 40, 'hard');
        fns.msRecordResult(true, 50, 'easy'); // медленнее всех — не входит в топ
        let res = fns.msLoadResults();
        assertEqual(res.length, 3, 'в счёте не больше трёх результатов');
        assertEqual(res[2].time, 40, 'медленная победа (50 с) не вытеснила быстрые');
        // быстрая победа вытесняет самую медленную из топ-3
        fns.msRecordResult(true, 10, 'medium');
        res = fns.msLoadResults();
        assertEqual(res[0].time, 10, 'новый рекорд — первое место');
        assertEqual(res[2].time, 30, 'самая медленная из топ-3 (40 с) вытеснена');
    });

    test('Мусор в хранилище не ломает счёт (возврат к пустому)', () => {
        clearMockStorage();
        // пишем валидные данные, чтобы узнать фактический ключ
        // (обёртка isolateLocalStorage добавляет префикс к 'msBestResults')
        fns.msSaveResults([{ won: true, time: 1, diff: 'easy', ts: 1 }]);
        const keys = getMockStorageKeys();
        assertEqual(keys.length, 1, 'в хранилище один ключ счёта');
        // заменяем содержимое на мусор — чтение не должно падать
        setMockStorageItem(keys[0], '{{{не json');
        assertEqual(fns.msLoadResults().length, 0, 'повреждённое хранилище → пустой счёт без исключений');
    });

    test('Мусор в записях отбраковывается фильтром побед', () => {
        clearMockStorage();
        fns.msSaveResults([
            { won: true, time: 25, diff: 'easy', ts: 1 },
            null,
            { won: false, time: 10, diff: 'easy', ts: 2 },
            { won: true, time: 'мусор', diff: 'easy', ts: 3 },
            { won: true, time: 15, diff: 'hard', ts: 4 }
        ]);
        const res = fns.msLoadResults();
        assertEqual(res.length, 2, 'учтены только валидные победы');
        assertEqual(res[0].time, 15, 'валидные победы отсортированы по времени');
        assertEqual(res[1].time, 25, 'вторая валидная победа в счёте');
    });
});

describe('Миграция счёта из msRecentResults → msBestResults (Task 193)', () => {

    // Вспомогалка: узнаём фактический физический префикс ключа —
    // обёртка isolateLocalStorage добавляет 'kip8test:', кратность
    // зависит от количества выполнений extractFunctions() в процессе.
    function discoverPrefix() {
        clearMockStorage();
        fns.msSaveResults([]);
        const keys = getMockStorageKeys();
        return keys[0].slice(0, keys[0].length - 'msBestResults'.length);
    }

    test('Победы из старого ключа переносятся, поражения отбрасываются', () => {
        const prefix = discoverPrefix();
        clearMockStorage();
        // старые данные Task 192: победы вперемешку с поражениями
        setMockStorageItem(prefix + 'msRecentResults', JSON.stringify([
            { won: true, time: 50, diff: 'easy', ts: 1 },
            { won: false, time: 7, diff: 'medium', ts: 2 },
            { won: true, time: 25, diff: 'hard', ts: 3 }
        ]));
        fns.msMigrateResults();
        const res = fns.msLoadResults();
        assertEqual(res.length, 2, 'перенесены только победы');
        assertEqual(res[0].time, 25, 'победы отсортированы по времени (лучшая — первая)');
        assertEqual(res[1].time, 50, 'вторая победа перенесена');
        const after = getMockStorageKeys().map(function (k) { return k.slice(prefix.length); });
        assertTrue(after.indexOf('msRecentResults') === -1, 'старый ключ удалён после миграции');
        assertTrue(after.indexOf('msBestResults') !== -1, 'новый ключ создан');
    });

    test('Миграция не затирает существующий счёт лучших', () => {
        const prefix = discoverPrefix();
        clearMockStorage();
        fns.msRecordResult(true, 15, 'easy'); // новый счёт уже есть
        setMockStorageItem(prefix + 'msRecentResults', JSON.stringify([
            { won: true, time: 99, diff: 'hard', ts: 1 }
        ]));
        fns.msMigrateResults();
        const res = fns.msLoadResults();
        assertEqual(res.length, 1, 'существующий счёт сохранён');
        assertEqual(res[0].time, 15, 'миграция не затёрла лучший результат');
    });

    test('Миграция мусорного старого ключа не падает и удаляет его', () => {
        const prefix = discoverPrefix();
        clearMockStorage();
        setMockStorageItem(prefix + 'msRecentResults', '{{{не json');
        fns.msMigrateResults();
        assertEqual(fns.msLoadResults().length, 0, 'мусор не перенесён, исключений нет');
        const after = getMockStorageKeys().map(function (k) { return k.slice(prefix.length); });
        assertTrue(after.indexOf('msRecentResults') === -1, 'мусорный старый ключ удалён');
    });

    test('Повторная миграция — no-op (старого ключа больше нет)', () => {
        clearMockStorage();
        fns.msRecordResult(true, 42, 'medium');
        fns.msMigrateResults(); // старого ключа нет — ничего не должно измениться
        const res = fns.msLoadResults();
        assertEqual(res.length, 1, 'счёт не тронут повторной миграцией');
        assertEqual(res[0].time, 42, 'результат сохранён');
    });
});

describe('msRenderAchievements — рендер лучших результатов (Task 193)', () => {

    test('Слоты медалей по местам + бейдж рекорда', () => {
        clearMockStorage();
        setMockViewport(1920); // десктопные подписи 16x9
        fns.msRecordResult(true, 45, 'easy');
        fns.msRecordResult(true, 12, 'medium');
        fns.msRenderAchievements();
        const row = getMockElement('msAchRow');
        assertTrue(row !== null, 'мок-элемент msAchRow создан');
        assertEqual(row.innerHTML.split('ms-ach-slot win').length - 1, 2, 'два слота побед');
        assertTrue(row.innerHTML.indexOf('ms-ach-slot empty') !== -1, 'пустой слот отрендерен');
        assertTrue(row.innerHTML.indexOf('ms-ach-slot loss') === -1, 'слотов поражения больше нет');
        assertTrue(row.innerHTML.indexOf('🥇') !== -1, 'золото — лучшее время');
        assertTrue(row.innerHTML.indexOf('🥈') !== -1, 'серебро — второе время');
        assertTrue(row.innerHTML.indexOf('🥉') === -1, 'бронза не отрендерена без третьей победы');
        assertTrue(row.innerHTML.indexOf('16x9') !== -1, 'подпись сложности в текущей ориентации');
        assertTrue(row.innerHTML.indexOf('12 с') !== -1, 'время лучшей партии в слоте');
        const score = getMockElement('msAchScore');
        assertEqual(score.textContent, 'рекорд 12 с', 'бейдж: рекордное время');
    });

    test('Порядок слотов — по времени, а не по хронологии', () => {
        clearMockStorage();
        setMockViewport(1920);
        // первая победа медленная, вторая быстрая — быстрая должна быть первой
        fns.msRecordResult(true, 45, 'hard');
        fns.msRecordResult(true, 12, 'easy');
        fns.msRenderAchievements();
        const row = getMockElement('msAchRow');
        const gold = row.innerHTML.indexOf('🥇');
        const silver = row.innerHTML.indexOf('🥈');
        assertTrue(gold !== -1 && silver !== -1, 'обе медали отрендерены');
        assertTrue(gold < silver, 'золото левее серебра (лучшее время — первым)');
        assertTrue(row.innerHTML.indexOf('12 с') < row.innerHTML.indexOf('45 с'), 'быстрое время в первом слоте');
    });

    test('Пустой счёт — 3 пустых слота, бейдж скрыт', () => {
        clearMockStorage();
        fns.msRenderAchievements();
        const row = getMockElement('msAchRow');
        assertEqual(row.innerHTML.split('ms-ach-slot empty').length - 1, 3, 'три пустых слота');
        const score = getMockElement('msAchScore');
        assertEqual(score.style.display, 'none', 'бейдж скрыт без побед');
    });

    test('Полный топ-3: три медали, рекорд в бейдже', () => {
        clearMockStorage();
        setMockViewport(1920);
        fns.msRecordResult(true, 60, 'easy');
        fns.msRecordResult(true, 20, 'medium');
        fns.msRecordResult(true, 40, 'hard');
        fns.msRenderAchievements();
        const row = getMockElement('msAchRow');
        assertEqual(row.innerHTML.split('ms-ach-slot win').length - 1, 3, 'три слота побед');
        assertTrue(row.innerHTML.indexOf('ms-ach-slot empty') === -1, 'пустых слотов нет');
        assertTrue(row.innerHTML.indexOf('🥉') !== -1, 'бронза отрендерена');
        const score = getMockElement('msAchScore');
        assertEqual(score.textContent, 'рекорд 20 с', 'бейдж: лучшее из времён');
    });
});

// Task 194: «Сапёр» — корневой раздел главной страницы (ранее был
// подразделом «Инженерных калькуляторов»: крошки десктопа показывали
// «Главная / Инженерные калькуляторы / Сапёр»). Проверяем иерархию
// навигации через buildBreadcrumbPath: путь строится по PAGE_PARENTS.
describe('Навигация: Сапёр — корневой раздел главной (Task 194)', () => {

    test('Крошки Сапёра: Главная / Сапёр (без Инженерных калькуляторов)', () => {
        const path = fns.buildBreadcrumbPath('minesweeper');
        assertEqual(path.join('>'), 'minesweeper',
            'в пути один сегмент — Сапёр на верхнем уровне, «Инженерные калькуляторы» больше не родитель');
    });

    test('Крошки как у Телефонного справочника (тоже секретный корневой раздел)', () => {
        const ms = fns.buildBreadcrumbPath('minesweeper');
        const pb = fns.buildBreadcrumbPath('phonebook');
        assertEqual(ms.length, pb.length, 'Сапёр и Телефонный справочник — одна глубина иерархии');
    });

    test('Иерархия калькуляторов не тронута: КИП и А → Конвертер', () => {
        const path = fns.buildBreadcrumbPath('converter');
        assertEqual(path.join('>'), 'calculators>calc-kipa>converter',
            'подразделы калькуляторов сохраняют прежнюю вложенность');
    });

    test('Иерархия калькуляторов не тронута: КИП и А', () => {
        const path = fns.buildBreadcrumbPath('calc-kipa');
        assertEqual(path.join('>'), 'calculators>calc-kipa',
            'КИП и А — по-прежнему подраздел «Инженерных калькуляторов»');
    });

    test('Главная — пустой путь (корень)', () => {
        assertEqual(fns.buildBreadcrumbPath('dashboard').length, 0, 'у главной нет крошек');
    });
});

// Восстановление дефолтного вьюпорта мока (375) — на случай,
// если другие тестовые файлы будут читать window.innerWidth
describe('Восстановление мок-вьюпорта после тестов Сапёра', () => {
    test('вьюпорт возвращён к 375px', () => {
        setMockViewport(375);
        clearMockStorage(); // Task 192: чистое хранилище для следующих файлов
        assertEqual(fns.msCalcCellSize(), 32, 'дефолтное состояние мока восстановлено');
    });
});
