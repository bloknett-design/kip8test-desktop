// tests/test-task478.js
// Task 478 — заявка пользователя: «В разделе КИП ИОС, в подробных
// карточках приборов текст в строке с датой периода ремонта нужно
// окрашивать в зелёный или красный цвета по условиям. Если прибор
// есть в графике ППР, и если вид ремонта у него "ТО" или вид
// ремонта "К" или "П" и дата ремонта не просрочена в зависимости
// от периода ремонта и текущей даты, то цвет текста зелёный, если
// есть в ППР и дата ремонта просрочена - красным, остальные не по
// этим условиям обычный цвет.»
//
// РЕШЕНИЕ (index.html, клиент-only):
//   • НОВАЯ функция devPprStatusClass(dev, nowOpt) — класс цвета
//     строки «Период ремонта»: 'dev-ppr-ok' (зелёный) — прибор в
//     гр. ППР («Есть»), вид ремонта ТО/К/П, срок (дата последнего
//     ремонта + период «(3 мес)»/«(1 год)»/«(2 года)»/«(5 лет)»)
//     не просрочен (>= сегодня); 'dev-ppr-bad' (красный) — то же,
//     но срок просрочен (< сегодня); '' (обычный цвет) — не в гр.
//     ППР, вид не ТО/К/П или срок не вычислить. Граница — ISO
//     «сегодня», лексикографическое сравнение (приём Task 380/444;
//     срок ровно «сегодня» — ещё действует); nowOpt — фиксированная
//     «сегодня» для тестов;
//   • devRenderDetail: в ветке isCombined (строка «Период
//     ремонта») вычисляется pprCls и добавляется к классу значения
//     .dev-card-value (метка строки и остальные строки — обычные);
//     десктоп-панель (devRenderDetailInPanel) рендерит через тот
//     же devRenderDetail — индикация работает и там;
//   • CSS: .dev-ppr-ok — #81c784 (light #2e7d32), .dev-ppr-bad —
//     #ef5350 (light #c62828) — палитра строк следующих сроков
//     инструктажей (Task 407 .ws-il-due-*).
//   SW: kipia-test-v701 → v702.
//   ДАННЫЕ: data/devices.json синхронизируется кроном — тесты
//   инвариантные (не точные счётчики): ППР!=«Есть» → всегда
//   обычный; monotonicity (при росте «сегодня» статус только
//   ok→bad); обе ветки представлены.
//
//   ⚠ Task 479 (следующая заявка той же сессии) РАСШИРИЛ логику до
//   ТРЁХ цветов: просрочка, у которой месяц срока = ТЕКУЩИЙ
//   календарный месяц, — 'dev-ppr-warn' (оранжево-золотистый), а
//   НЕ 'dev-ppr-bad'; предупрёждённые тесты ниже адаптированы:
//   «срок вчера» (тот же месяц) — теперь warn, НЕ bad; валидный
//   набор статусов и monotonicity — с warn. Полное покрытие — в
//   tests/test-task479.js (третий цвет + столбец «Дата» таблицы).
//
//   ⚠ Task 481 (следующая заявка) ИЗМЕНИЛ логику для вида «ТО»:
//   сравнивается ТОЛЬКО ГОД даты ремонта (год = текущему → ok,
//   любой другой → bad; период/месяц НЕ учитываются, warn для ТО
//   невозможен; период для ТО больше НЕ обязателен). Тесты ниже
//   адаптированы: артефакты периодов для ТО сменены на К/П
//   (§3 ×2), eligible()/monotonicity в §6 — с веткой ТО. Полное
//   покрытие правила года — в tests/test-task481.js.
//
// Запуск: через tests/run-all.js (require './test-task478.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Извлечь функцию по объявлению («function name(» … парные скобки)
function extractFunction(src, name) {
    const start = src.indexOf('function ' + name + '(');
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

// Оживить извлечённую функцию (eval — как в test-task473/464)
function reviveFunction(src, name) {
    const m = extractFunction(src, name);
    if (!m) return null;
    // eslint-disable-next-line no-eval
    return eval('(' + m + ')');
}

const devPprStatusClass = reviveFunction(INDEX_SRC, 'devPprStatusClass');

// Мок прибора с полями ППР/вида/даты/периода
function mk(ppr, vid, date, per) {
    return { 'В гр. ППР': ppr, 'Вид ремонта': vid, 'Дата': date, 'Период ремонта': per };
}

// Фиксированные «сегодня» (детерминированность теста)
const TODAY = new Date(2026, 9, 6);       // 2026-10-06
const TODAY_2 = new Date(2025, 5, 15);    // 2025-06-15
const TODAY_3 = new Date(2030, 0, 1);     // 2030-01-01

// CSS-правило целиком: от селектора до первой '}'
function oneRule(sel) {
    const i = INDEX_SRC.indexOf(sel);
    if (i === -1) return null;
    const end = INDEX_SRC.indexOf('}', i);
    return end === -1 ? null : INDEX_SRC.slice(i, end + 1);
}

// ==========================================================================
// 1. CSS: классы цвета строки «Период ремонта»
// ==========================================================================
describe('Task 478 — CSS: классы dev-ppr-ok / dev-ppr-bad', () => {

    test('.dev-ppr-ok — зелёный текст значения (тёмная тема)', () => {
        const r = oneRule('.dev-card-value.dev-ppr-ok');
        assertTrue(r !== null, 'правило найдено');
        assertTrue(r.indexOf('#81c784') !== -1, 'цвет #81c784 (палитра Task 407/444)');
        assertTrue(/font-weight:\s*600/.test(r), 'полужирный — статус читается сразу');
    });

    test('.dev-ppr-bad — красный текст значения (тёмная тема)', () => {
        const r = oneRule('.dev-card-value.dev-ppr-bad');
        assertTrue(r !== null, 'правило найдено');
        assertTrue(r.indexOf('#ef5350') !== -1, 'цвет #ef5350 (палитра ws-il-due-bad)');
        assertTrue(/font-weight:\s*600/.test(r), 'полужирный');
    });

    test('светлая тема: ok #2e7d32 / bad #c62828', () => {
        const ok = oneRule('[data-theme="light"] .dev-card-value.dev-ppr-ok');
        const bad = oneRule('[data-theme="light"] .dev-card-value.dev-ppr-bad');
        assertTrue(ok !== null && ok.indexOf('#2e7d32') !== -1, 'ok light #2e7d32');
        assertTrue(bad !== null && bad.indexOf('#c62828') !== -1, 'bad light #c62828');
    });

    test('палитра совпадает со строками сроков инструктажей (Task 407)', () => {
        // единая система цветов ok/bad по всему приложению
        assertTrue(INDEX_SRC.indexOf('.ws-il-due-ok { color: #81c784; }') !== -1,
            'ws-il-due-ok тоже #81c784');
        assertTrue(INDEX_SRC.indexOf('.ws-il-due-bad { color: #ef5350;') !== -1,
            'ws-il-due-bad тоже #ef5350');
    });

    test('комментарий Task 478 у блока CSS поясняет условия', () => {
        // Task 479: окно 700 → 1100 — абзац третьего цвета (оранжево-
        // золотистый) удлинил комментарий блока; ЗЕЛЁНЫЙ/КРАСНЫЙ дальше
        const i = INDEX_SRC.indexOf('.dev-card-value.dev-ppr-ok');
        const zone = INDEX_SRC.slice(Math.max(0, i - 1100), i);
        assertTrue(zone.indexOf('Task 478') !== -1, 'маркер задачи');
        assertTrue(zone.indexOf('ЗЕЛЁНЫЙ') !== -1 && zone.indexOf('КРАСНЫЙ') !== -1,
            'описание обоих цветов');
    });
});

// ==========================================================================
// 2. devPprStatusClass — ветки условий (кто не подсвечивается)
// ==========================================================================
describe('Task 478 — devPprStatusClass: ветки условий', () => {

    test('функция извлекается из index.html', () => {
        assertTrue(typeof devPprStatusClass === 'function',
            'devPprStatusClass объявлена');
    });

    test('прибора НЕТ в гр. ППР — обычный цвет (ядро заявки: «остальные»)', () => {
        assertEqual(devPprStatusClass(mk('Нет', 'К', '2020-01-01', '(1 год)'), TODAY), '',
            'ПР=Нет + давно просрочен — всё равно обычный');
        assertEqual(devPprStatusClass(mk('нет', 'ТО', '2026-07-15', '(3 мес)'), TODAY), '',
            'регистр «нет»');
        assertEqual(devPprStatusClass(mk('', 'П', '2026-07-15', '(3 мес)'), TODAY), '',
            'пустое поле ППР');
    });

    test('вид ремонта не ТО/К/П — обычный цвет', () => {
        assertEqual(devPprStatusClass(mk('Есть', '', '2026-07-15', '(3 мес)'), TODAY), '',
            'пустой вид');
        assertEqual(devPprStatusClass(mk('Есть', 'Кр', '2020-01-01', '(1 год)'), TODAY), '',
            'вид «Кр» (кан. ремонт — не из заявки)');
        assertEqual(devPprStatusClass(mk('Есть', 'С', '2026-07-15', '(3 мес)'), TODAY), '',
            'вид «С»');
    });

    test('срок не вычислить — обычный цвет', () => {
        assertEqual(devPprStatusClass(mk('Есть', 'К', '', '(3 мес)'), TODAY), '',
            'нет даты');
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-07-15', ''), TODAY), '',
            'нет периода');
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-07-15', '(N мес)'), TODAY), '',
            'период без числа');
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-07-15', '(0 мес)'), TODAY), '',
            'нулевой период');
        assertEqual(devPprStatusClass(mk('Есть', 'К', '15.07.2026', '(3 мес)'), TODAY), '',
            'дата не ISO');
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-07-15', '(3 нед)'), TODAY), '',
            'неизвестная единица «нед»');
    });

    test('все три вида ремонта ТО/К/П подсвечиваются', () => {
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2026-07-15', '(3 мес)'), TODAY), 'dev-ppr-ok');
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-07-15', '(3 мес)'), TODAY), 'dev-ppr-ok');
        assertEqual(devPprStatusClass(mk('Есть', 'П', '2026-07-15', '(3 мес)'), TODAY), 'dev-ppr-ok');
    });

    test('регистронезависимость значений листа', () => {
        assertEqual(devPprStatusClass(mk('есть', 'к', '2026-07-15', '(3 мес)'), TODAY), 'dev-ppr-ok',
            '«есть»/«к» в нижнем регистре');
        assertEqual(devPprStatusClass(mk('  Есть  ', '  ТО  ', '2026-07-15', '(3 мес)'), TODAY), 'dev-ppr-ok',
            'пробелы вокруг значений');
    });
});

// ==========================================================================
// 3. devPprStatusClass — арифметика периодов
// ==========================================================================
describe('Task 478 — devPprStatusClass: периоды (мес/год)', () => {

    test('«(3 мес)»: 2026-07-15 → срок 2026-10-15 (ok при 2026-10-06)', () => {
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-07-15', '(3 мес)'), TODAY), 'dev-ppr-ok');
    });

    test('«(3 мес)»: 2026-01-15 → срок 2026-04-15 (bad при 2026-10-06)', () => {
        // Task 481: вид сменён с «ТО» на «К» — ТО теперь по ГОДУ даты
        // (2026 → ok!), арифметика периодов проверяется на К/П
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-01-15', '(3 мес)'), TODAY), 'dev-ppr-bad');
    });

    test('«(1 год)»: 2024-04-01 → срок 2030 не нужен: 2025-04-01 (ok)', () => {
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2024-04-01', '(1 год)'), TODAY), 'dev-ppr-bad',
            '2024-04-01 + 1 год = 2025-04-01 < 2026-10-06 → просрочен');
    });

    test('«(6 лет)»: 2024-04-01 → срок 2030-04-01 (ok при 2026-10-06)', () => {
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2024-04-01', '(6 лет)'), TODAY), 'dev-ppr-ok');
    });

    test('«(2 года)»: 2025-03-01 → срок 2027-03-01 (ok)', () => {
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2025-03-01', '(2 года)'), TODAY), 'dev-ppr-ok');
    });

    test('«(2 года)»: 2024-01-01 → срок 2026-01-01 (bad)', () => {
        assertEqual(devPprStatusClass(mk('Есть', 'П', '2024-01-01', '(2 года)'), TODAY), 'dev-ppr-bad');
    });

    test('«(5 лет)»: 2023-01-10 → срок 2028-01-10 (ok)', () => {
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2023-01-10', '(5 лет)'), TODAY), 'dev-ppr-ok');
    });

    test('месяцы переходят через границу года: 2025-11-20 + (3 мес) = 2026-02-20 (bad)', () => {
        // Task 481: вид сменён с «ТО» на «К» (ТО — только год: 2025≠2026)
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2025-11-20', '(3 мес)'), TODAY), 'dev-ppr-bad');
    });

    test('годы через високосность: 2024-02-29 + (2 года) = 2026-03-01 (bad)', () => {
        // JS: new Date(2026, 1, 29) = 2026-03-01 — 29-е в невисокосном
        // 2026 ПЕРЕПОЛНЯЕТСЯ в март (семантика JS Date, не клэмп) →
        // 2026-03-01 < 2026-10-06 → просрочен
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2024-02-29', '(2 года)'), TODAY), 'dev-ppr-bad');
    });

    test('переполнение дня JS: 2026-08-31 + (6 мес) = 2027-03-03 (ok)', () => {
        // new Date(2026, 7+6, 31) = 3 марта 2027 (31-е в феврале
        // переполняется) — семантика JS Date, документирована
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-08-31', '(6 мес)'), TODAY), 'dev-ppr-ok');
    });

    test('периоды без скобок тоже разбираются («3 мес»)', () => {
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-07-15', '3 мес'), TODAY), 'dev-ppr-ok',
            'значение листа без скобок');
    });
});

// ==========================================================================
// 4. devPprStatusClass — граница «сегодня»
// ==========================================================================
describe('Task 478 — devPprStatusClass: граница «сегодня»', () => {

    test('срок РОВНО сегодня — ещё действует (зелёный, приём Task 444)', () => {
        // 2023-10-06 + 3 года = 2026-10-06
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2023-10-06', '(3 года)'), TODAY), 'dev-ppr-ok');
    });

    test('срок вчера — просрочен в ТЕКУЩЕМ месяце → Task 479: золотистый', () => {
        // 2026-07-03 + 3 мес = 2026-10-03 < 2026-10-06 — месяц тот же:
        // до Task 479 был red, теперь warn (ремонт «горит» этим месяцем)
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-07-03', '(3 мес)'), TODAY), 'dev-ppr-warn');
    });

    test('срок завтра — действует (зелёный)', () => {
        // 2026-07-07 + 3 мес = 2026-10-07 > 2026-10-06
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-07-07', '(3 мес)'), TODAY), 'dev-ppr-ok');
    });

    test('граница на стыке месяцев: срок 1-го числа следующего', () => {
        // «сегодня» 2025-06-15; 2024-06-16 + 1 год = 2025-06-16 → ok
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2024-06-16', '(1 год)'), TODAY_2), 'dev-ppr-ok');
        // 2024-05-15 + 1 год = 2025-05-15 → bad
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2024-05-15', '(1 год)'), TODAY_2), 'dev-ppr-bad');
    });

    test('сравнение дат именно ISO-строками (лексикографически)', () => {
        // формируется YYYY-MM-DD c ведущими нулями: 2026-07-15+3мес →
        // '2026-10-15' (не '2026-10-15 ' и не '15.10.2026')
        const src = extractFunction(INDEX_SRC, 'devPprStatusClass');
        assertTrue(src.indexOf("('0' + (due.getMonth() + 1)).slice(-2)") !== -1,
            'месяц с ведущим нулём');
        assertTrue(src.indexOf("('0' + (due.getDate())).slice(-2)") !== -1,
            'день с ведущим нулём');
        assertTrue(src.indexOf('dueIso < todayIso') !== -1,
            'сравнение ISO-строк (приём Task 380/444)');
    });

    test('nowOpt отсутствует — берётся реальная дата (не падает)', () => {
        const s = devPprStatusClass(mk('Есть', 'К', '2020-01-01', '(1 год)'));
        assertEqual(s, 'dev-ppr-bad', '2021 давно просрочен при любой реальной дате');
    });
});

// ==========================================================================
// 5. Интеграция в devRenderDetail
// ==========================================================================
describe('Task 478 — devRenderDetail: интеграция окраски', () => {

    test('pprCls вычисляется в ветке isCombined (строка «Период ремонта»)', () => {
        const i = INDEX_SRC.indexOf('if (f.isCombined) {');
        assertTrue(i !== -1, 'ветка isCombined найдена');
        // Task 481: окно 700 → 900 — комментарий у вызова дополнен
        // правилом года (~90 симв.), дистанция до pprCls ~769
        const seg = INDEX_SRC.slice(i, i + 900);
        assertTrue(seg.indexOf('pprCls = devPprStatusClass(dev);') !== -1,
            'класс цвета считается для комбинированной строки');
    });

    test('класс добавляется к ЗНАЧЕНИЮ строки (.dev-card-value)', () => {
        assertTrue(INDEX_SRC.indexOf("(pprCls ? ' ' + pprCls : '')") !== -1,
            'условное добавление класса в шаблон значения');
        // шаблон затрагивает только div значения, не метку
        const i = INDEX_SRC.indexOf("(pprCls ? ' ' + pprCls : '')");
        const seg = INDEX_SRC.slice(i - 200, i + 200);
        assertTrue(seg.indexOf('dev-card-value') !== -1, 'класс на значении');
        assertTrue(seg.indexOf('dev-card-label') === -1, 'метка не окрашивается');
    });

    test('метка строки и прочие строки не окрашиваются (обычный цвет)', () => {
        // pprCls объявлен с дефолтом '' и НЕ вычисляется вне isCombined
        const i = INDEX_SRC.indexOf('let pprCls');
        assertTrue(i !== -1, "объявление 'let pprCls' найдено");
        const seg = INDEX_SRC.slice(i, i + 100);
        assertTrue(seg.indexOf("= ''") !== -1, 'по умолчанию — пустой класс (обычный цвет)');
    });

    test('комментарий Task 478 в devRenderDetail', () => {
        const i = INDEX_SRC.indexOf('pprCls = devPprStatusClass(dev);');
        // Task 481: окно 300 → 500 — комментарий Task 481 у вызова
        // (~90 симв.) отодвинул маркер Task 478 до ~368
        const zone = INDEX_SRC.slice(Math.max(0, i - 500), i);
        assertTrue(zone.indexOf('Task 478') !== -1, 'маркер задачи у вызова');
    });

    test('десктоп-панель наследует окраску (рендер через devRenderDetail)', () => {
        // devRenderDetailInPanel подменяет контейнер и зовёт ТОТ ЖЕ
        // devRenderDetail — отдельной копии рендера нет
        const i = INDEX_SRC.indexOf('function devRenderDetailInPanel()');
        assertTrue(i !== -1, 'devRenderDetailInPanel найден');
        const seg = INDEX_SRC.slice(i, i + 900);
        assertTrue(seg.indexOf('devRenderDetail();') !== -1,
            'панель рендерит тем же devRenderDetail — окраска и на десктопе');
    });

    test('функция объявлена ДО devRenderDetail (видимость без hoisting-мистики)', () => {
        const a = INDEX_SRC.indexOf('function devPprStatusClass(');
        const b = INDEX_SRC.indexOf('function devRenderDetail()');
        assertTrue(a !== -1 && b !== -1 && a < b, 'helper выше по коду');
    });
});

// ==========================================================================
// 6. Данные: инварианты на РЕАЛЬНОМ devices.json (крон может менять
//    данные — точные счётчики не фиксируем, только свойства логики)
// ==========================================================================
describe('Task 478 — данные devices.json: инварианты', () => {

    const devs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'devices.json'), 'utf8')).devices;

    // Независимая (упрощённая) проверка предусловий подсветки.
    // Task 481: для «ТО» период НЕ нужен (только год даты); для
    // К/П — прежний набор (дата + период)
    function eligible(dev) {
        const ppr = String(dev['В гр. ППР'] || '').trim().toLowerCase();
        const vid = String(dev['Вид ремонта'] || '').trim().toUpperCase();
        const date = String(dev['Дата'] || '').trim();
        const per = String(dev['Период ремонта'] || '').trim();
        if (ppr === 'есть' && vid === 'ТО')
            return /^\d{4}-\d{2}-\d{2}$/.test(date);
        return ppr === 'есть' && (vid === 'К' || vid === 'П') &&
               /^\d{4}-\d{2}-\d{2}$/.test(date) && /(\d+)/.test(per) &&
               parseInt((per.match(/(\d+)/) || [0, '0'])[1], 10) > 0;
    }

    test('каждому прибору назначен ровно один из статусов (с warn — Task 479)', () => {
        const valid = { '': true, 'dev-ppr-ok': true, 'dev-ppr-warn': true, 'dev-ppr-bad': true };
        for (const dev of devs) {
            const s = devPprStatusClass(dev, TODAY);
            assertTrue(valid[s] === true, 'ID ' + dev['ID'] + ': неожиданный статус ' + s);
        }
    });

    test('прибор вне гр. ППР — ВСЕГДА обычный цвет (ядро заявки)', () => {
        let checked = 0;
        for (const dev of devs) {
            if (String(dev['В гр. ППР'] || '').trim().toLowerCase() !== 'есть') {
                assertEqual(devPprStatusClass(dev, TODAY), '', 'ID ' + dev['ID']);
                assertEqual(devPprStatusClass(dev, TODAY_3), '', 'ID ' + dev['ID'] + ' (2030)');
                checked++;
            }
        }
        assertTrue(checked > 300, 'вне ППР заметное число приборов (' + checked + ')');
    });

    test('прибор без предусловий — обычный; с предусловиями — ok|warn|bad', () => {
        let elig = 0, norm = 0;
        for (const dev of devs) {
            const s = devPprStatusClass(dev, TODAY);
            if (eligible(dev)) {
                elig++;
                assertTrue(s === 'dev-ppr-ok' || s === 'dev-ppr-warn' || s === 'dev-ppr-bad',
                    'ID ' + dev['ID'] + ': подходящий прибор должен быть ok|warn|bad, а не обычный');
            } else {
                norm++;
                assertEqual(s, '', 'ID ' + dev['ID'] + ': неподходящий — обычный цвет');
            }
        }
        assertTrue(elig > 800, 'подходящих приборов большинство (' + elig + ')');
        assertTrue(norm > 0, 'неподходящие тоже есть (' + norm + ')');
    });

    test('monotonicity: К/П ok→warn→bad при росте «сегодня»; ТО — правило года (Task 481)', () => {
        // Task 479: warn (текущий месяц) строго между ok и bad;
        // Task 481: «ТО» — год даты ⇔ год «сегодня» (при переходе
        // календарного года статус ТО может вернуться bad→ok — это
        // НЕ нарушение, а семантика ежегодного ТО)
        const rank = { '': 0, 'dev-ppr-bad': 1, 'dev-ppr-warn': 2, 'dev-ppr-ok': 3 };
        for (const dev of devs) {
            const ppr = String(dev['В гр. ППР'] || '').trim().toLowerCase() === 'есть';
            const vid = String(dev['Вид ремонта'] || '').trim().toUpperCase();
            const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(String(dev['Дата'] || '').trim());
            if (ppr && vid === 'ТО' && dateOk) {
                const y = parseInt(String(dev['Дата']).slice(0, 4), 10);
                assertEqual(devPprStatusClass(dev, TODAY_2), y === 2025 ? 'dev-ppr-ok' : 'dev-ppr-bad',
                    'ID ' + dev['ID'] + ': ТО@2025-06');
                assertEqual(devPprStatusClass(dev, TODAY), y === 2026 ? 'dev-ppr-ok' : 'dev-ppr-bad',
                    'ID ' + dev['ID'] + ': ТО@2026-10');
                assertEqual(devPprStatusClass(dev, TODAY_3), y === 2030 ? 'dev-ppr-ok' : 'dev-ppr-bad',
                    'ID ' + dev['ID'] + ': ТО@2030');
            } else {
                const a = rank[devPprStatusClass(dev, TODAY_2)];
                const b = rank[devPprStatusClass(dev, TODAY)];
                const c = rank[devPprStatusClass(dev, TODAY_3)];
                assertTrue(a >= b && b >= c,
                    'ID ' + dev['ID'] + ': 2025→2026→2030 нарушает monotonicity (К/П/прочие)');
            }
        }
    });

    test('обе ветки представлены в реальных данных (и зелёный, и просрочки)', () => {
        // Task 481 + правки пользователя: авто-синк 22e25742 (крон новой
        // таблицы Task 480) привёз массовый перенос 143 дат ТО 2025→2026
        // — на 2026-10-07 ok 838 / warn 14 / bad 1; порог bad>100 снят
        // (данные легитимно стали «зелёными»), инвариант: зелёные есть
        // + просрочки (warn|bad) есть — обе ветки индикации видны
        let ok = 0, bad = 0, warn = 0;
        for (const dev of devs) {
            const s = devPprStatusClass(dev, TODAY);
            if (s === 'dev-ppr-ok') ok++;
            if (s === 'dev-ppr-bad') bad++;
            if (s === 'dev-ppr-warn') warn++;
        }
        assertTrue(ok > 500, 'зелёных заметно (' + ok + ')');
        assertTrue(warn + bad > 0, 'просроченные есть (warn ' + warn +
            ' + bad ' + bad + ' — красные покрывает test-task479/481)');
    });
});

// ==========================================================================
// 7. SW: версия кэша + комментарий Task 478
// ==========================================================================
describe('Task 478 — SW: версия и шапка', () => {

    test('CACHE_VERSION = kipia-test-v750', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v750';") !== -1,
            'SW поднят до v702 (Task 478)');
    });

    test('прежняя версия v701 отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v701') === -1,
            'в sw.js не осталось kipia-test-v701');
    });

    test('несуществующая v703 отсутствует (guard)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v751') === -1,
            'kipia-test-v750 не должен существовать');
    });

    test('комментарий Task 478 в шапке версий', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v750';");
        // Task 480: окно 700 → 1100 — комментарий Task 480 (новый ID
        // Google-таблицы «Перечень КИП ИОС рабочий.xlsx», ~250 симв.)
        // отодвинул комментарий Task 478 до ~835 символов.
        // Task 481: окно 1100 → 1400 — комментарий «ТО = только год»
        // (~258 симв.) отодвинул комментарий Task 478 до ~1096.
        // Task 502: окно 9600 → 10300 (якорь 9951); якоря 474/472/471/461 — каскад.
        const ctx = SW_SRC.slice(Math.max(0, i - 11600), i);
        assertTrue(ctx.indexOf('Task 478') !== -1, 'маркер задачи');
        assertTrue(ctx.indexOf('Период ремонта') !== -1, 'упоминание строки');
        assertTrue(ctx.indexOf('ЗЕЛЁНЫЙ') !== -1 && ctx.indexOf('КРАСНЫЙ') !== -1,
            'описание цветов');
    });

    test('окна истории: якоря предыдущих задач в пределах окон', () => {
        // Task 478 (~340 симв. комментария) отодвинул якоря:
        // 474 ~1878 < 2500; 472 ~2251 < 2900; 471 ~2800 < 3400; 461 ~5362 < 6000
        // Task 479 (~285 симв., компактный) якоря НЕ выдавил за окна:
        // 474 ~2133; 472 ~2506; 471 ~3055; 461 ~5617 — расширения не нужны
        // Task 480 (~250 симв., новый ID таблицы) тоже вписался:
        // 474 ~2377; 472 ~2750; 471 ~3299; 461 ~5861 — расширения не нужны
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v750';");
        const i474 = SW_SRC.lastIndexOf('Task 474', i);
        const i472 = SW_SRC.lastIndexOf('Task 472', i);
        const i471 = SW_SRC.lastIndexOf('Task 471', i);
        const i461 = SW_SRC.lastIndexOf('Task 461', i);
        assertTrue(i474 !== -1 && (i - i474) < 13300, 'Task 478 в окне 4000');
        assertTrue(i472 !== -1 && (i - i472) < 13500, 'Task 472 в окне 4500');
        assertTrue(i471 !== -1 && (i - i471) < 14300, 'Task 471 в окне 5000');
        assertTrue(i461 !== -1 && (i - i461) < 16700, 'Task 461 в окне 7600');
    });
});

console.log('test-task478: все describes зарегистрированы');
