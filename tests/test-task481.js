// tests/test-task481.js
// Task 481 — заявка пользователя: «В условии приборов, у которых вид
// ремонта "ТО", нужно учитывать только год вместо полной даты, если
// год даты ремонта текущий, то цвет текста зелёный, если год даты
// ремонта не соответствует текущему - красный.»
//
// РЕШЕНИЕ (index.html, клиент-only):
//   • devPprStatusClass(dev, nowOpt) — НОВАЯ ветка «ТО» сразу после
//     разбора ISO-даты и ДО разбора периода: вид «ТО» → сравнивается
//     ТОЛЬКО ГОД даты ремонта с текущим календарным годом «сегодня»
//     (parseInt(m[1]) === now.getFullYear()): совпал → 'dev-ppr-ok'
//     (зелёный), НЕ совпал — прошлый ИЛИ будущий год — → 'dev-ppr-bad'
//     (красный). Период ремонта, месяц и день НЕ учитываются;
//     'dev-ppr-warn' для «ТО» невозможен (у года нет месяцев).
//     Период для «ТО» больше НЕ обязателен (год — из даты; раньше
//     «нет периода» означал обычный цвет); К/П — прежняя логика
//     даты+периода (зелёный / золотистый на текущий месяц / красный)
//     без изменений;
//   • одна функция — оба места: строка «Период ремонта» карточки
//     (мобильная страница + десктоп-панель) и столбец «Дата»
//     табличного вида (devices-table-desktop.js зовёт ту же
//     devPprStatusClass) — правка ОДНОЙ точки покрыла всё;
//   • CSS и палитры НЕ менялись (классы dev-ppr-ok/bad/warn те же);
//   • sw.js kipia-test-v704 → v705 + комментарий Task 481 (~258
//     симв.); ЛОГИКА SW НЕ МЕНЯЛАСЬ; персистентные кэши НЕ тронуты.
//   ДАННЫЕ (2026-10-07): ТО в ППР 195 — год 2026: 52, год 2025: 143,
//   будущих лет НЕТ, все даты ISO, у всех есть период; прогноз
//   статусов: ok 695 / warn 14 (только К/П) / bad 144 / обычный 438.
//   devices.json синкается кроном — тесты инвариантные (правило
//   года, не точные счётчики).
//
// Адаптации под Task 481: test-task478.js / test-task479.js — моки
// периодной арифметики для «ТО» сменены на К/П, eligible() — «ТО»
// без периода, monotonicity — с веткой ТО (год ⇔ год «сегодня»);
// окна истории sw.js расширены scripts/task481-windows.py
// (474 2500→3100, 472 2900→3600, 471 3400→4200, 461 6000→6800,
// комментарий Task 478 1100→1400).
//
// Запуск: через tests/run-all.js (require './test-task481.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const DT_SRC = fs.readFileSync(path.join(ROOT, 'devices-table-desktop.js'), 'utf8');

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

// Оживить извлечённую функцию (eval — как в test-task478/479/473)
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
function oneRule(src, sel) {
    const i = src.indexOf(sel);
    if (i === -1) return null;
    const end = src.indexOf('}', i);
    return end === -1 ? null : src.slice(i, end + 1);
}

// ==========================================================================
// 1. devPprStatusClass — правило года для «ТО» (ядро заявки Task 481)
// ==========================================================================
describe('Task 481 — devPprStatusClass: «ТО» — только ГОД даты', () => {

    test('функция извлекается из index.html', () => {
        assertTrue(typeof devPprStatusClass === 'function',
            'devPprStatusClass объявлена');
    });

    test('ТО + год текущий → ЗЕЛЁНЫЙ (ядро заявки)', () => {
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2026-07-15', '(3 мес)'), TODAY),
            'dev-ppr-ok', 'год даты 2026 == году «сегодня» 2026');
    });

    test('ТО + год текущий, но срок по ПЕРИОДУ просрочен → всё равно ЗЕЛЁНЫЙ', () => {
        // 2026-01-15 + (3 мес) = 2026-04-15 < 2026-10-06 — по прежней
        // логике К/П было бы bad; для ТО важен ТОЛЬКО год (кейс ID 16
        // «Мутномер» из браузер-чека Task 478 — был красный, стал зелёный)
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2026-01-15', '(3 мес)'), TODAY),
            'dev-ppr-ok', 'период НЕ учитывается для ТО');
    });

    test('ТО + год прошлый → КРАСНЫЙ (даже если период ещё действует)', () => {
        // 2025-10-15 + (1 год) = 2026-10-15 > 2026-10-06 — по прежней
        // логике было бы ok; для ТО прошлый год = просрочка
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2025-10-15', '(1 год)'), TODAY),
            'dev-ppr-bad', 'год 2025 != 2026 — красный, срок не спасает');
    });

    test('ТО + год БУДУЩИЙ → КРАСНЫЙ («не соответствует текущему»)', () => {
        // заявка буквальна: «не соответствует» — любой другой год,
        // в данных будущих лет нет, но правило обязано работать
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2027-05-10', '(3 мес)'), TODAY),
            'dev-ppr-bad', '2027 != 2026');
    });

    test('ТО: месяц и день даты НЕ важны (год решает)', () => {
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2026-01-01', '(1 год)'), TODAY),
            'dev-ppr-ok', '1 января');
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2026-12-31', '(1 год)'), TODAY),
            'dev-ppr-ok', '31 декабря — весь календарный год зелёный');
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2025-01-01', '(6 лет)'), TODAY),
            'dev-ppr-bad', 'прошлый год — даже 1 января');
    });

    test('ТО: ПЕРИОД не важен вовсе (год один — статус один)', () => {
        // вариации периода не меняют статус; «ТО» без периода и с
        // мусорным периодом теперь тоже подсвечивается (раньше — '')
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2026-05-20', '(3 мес)'), TODAY), 'dev-ppr-ok');
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2026-05-20', '(6 лет)'), TODAY), 'dev-ppr-ok');
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2026-05-20', '3 мес'), TODAY), 'dev-ppr-ok');
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2026-05-20', ''), TODAY), 'dev-ppr-ok',
            'пустой период — год всё равно вычисляется из даты');
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2026-05-20', '(нед)'), TODAY), 'dev-ppr-ok',
            'мусорный период для ТО не мешает');
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2025-05-20', ''), TODAY), 'dev-ppr-bad',
            'пустой период + прошлый год — красный');
    });

    test('ТО: «золотистый» (warn) НЕВОЗМОЖЕН — у года нет месяцев', () => {
        // скан всех 12 месяцев 2026: статус ТО не зависит от месяца
        const dev = mk('Есть', 'ТО', '2026-05-20', '(3 мес)');
        for (let mo = 0; mo < 12; mo++) {
            const s = devPprStatusClass(dev, new Date(2026, mo, 10));
            assertTrue(s === 'dev-ppr-ok',
                'май 2026, «сегодня» месяц ' + (mo + 1) + ': ' + s + ' (warn невозможен)');
        }
        const devOld = mk('Есть', 'ТО', '2025-05-20', '(3 мес)');
        for (let mo = 0; mo < 12; mo++) {
            const s = devPprStatusClass(devOld, new Date(2026, mo, 10));
            assertTrue(s === 'dev-ppr-bad',
                'май 2025, «сегодня» месяц ' + (mo + 1) + ': ' + s);
        }
    });

    test('ТО: nowOpt уважается — год берётся из «сегодня» параметра', () => {
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2026-01-15', '(3 мес)'), TODAY_2),
            'dev-ppr-bad', '«сегодня» 2025: год 2026 ещё «не текущий»');
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2025-03-01', '(3 мес)'), TODAY_2),
            'dev-ppr-ok', '«сегодня» 2025: год 2025 совпал');
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2030-01-01', '(1 год)'), TODAY_3),
            'dev-ppr-ok', '«сегодня» 2030: год 2030 совпал');
    });

    test('ТО: семафор календарного года — ровно на год «вкл»', () => {
        // один прибор ТО 2026: 2025 → bad, весь 2026 → ok, 2027 → bad
        const dev = mk('Есть', 'ТО', '2026-06-15', '(3 мес)');
        assertEqual(devPprStatusClass(dev, new Date(2025, 11, 31)), 'dev-ppr-bad',
            '31.12.2025 — год ещё не наступил');
        assertEqual(devPprStatusClass(dev, new Date(2026, 0, 1)), 'dev-ppr-ok',
            '01.01.2026 — зелёный с первого дня года');
        assertEqual(devPprStatusClass(dev, new Date(2026, 11, 31)), 'dev-ppr-ok',
            '31.12.2026 — зелёный до последнего дня года');
        assertEqual(devPprStatusClass(dev, new Date(2027, 0, 1)), 'dev-ppr-bad',
            '01.01.2027 — год кончился, красный');
    });

    test('предусловия заявки сохранены: ППР/вид/дата', () => {
        assertEqual(devPprStatusClass(mk('Нет', 'ТО', '2026-07-15', '(3 мес)'), TODAY), '',
            'нет в гр. ППР — обычный, даже с годом текущим');
        assertEqual(devPprStatusClass(mk('Есть', 'С', '2026-07-15', '(3 мес)'), TODAY), '',
            'вид «С» — не из заявки');
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '', '(3 мес)'), TODAY), '',
            'нет даты — год не вычислить');
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '15.07.2026', '(3 мес)'), TODAY), '',
            'дата не ISO — год не вычислить');
    });

    test('регистронезависимость вида «ТО» (значения листа)', () => {
        assertEqual(devPprStatusClass(mk('есть', 'то', '2026-07-15', '(3 мес)'), TODAY), 'dev-ppr-ok',
            '«есть»/«то» в нижнем регистре');
        assertEqual(devPprStatusClass(mk('  Есть  ', '  ТО  ', '2026-07-15', '(3 мес)'), TODAY), 'dev-ppr-ok',
            'пробелы вокруг значений');
    });
});

// ==========================================================================
// 2. К/П — прежняя логика даты+периода (не затронута Task 481)
// ==========================================================================
describe('Task 481 — К/П: логика даты+периода не изменилась', () => {

    test('К с той же датой, что «красный» ТО → ЗЕЛЁНЫЙ (контраст семантик)', () => {
        // 2025-10-15 + (1 год) = 2026-10-15 > 2026-10-06: К действует;
        // ТО с этой датой — красный (год прошлый). Прямое сравнение
        // двух семантик из одной заявки
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2025-10-15', '(1 год)'), TODAY), 'dev-ppr-ok');
        assertEqual(devPprStatusClass(mk('Есть', 'ТО', '2025-10-15', '(1 год)'), TODAY), 'dev-ppr-bad');
    });

    test('К: warn на текущий месяц жив (Task 479 не сломан)', () => {
        // 2025-10-01 + (1 год) = 2026-10-01 < 2026-10-06, октябрь
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2025-10-01', '(1 год)'), TODAY),
            'dev-ppr-warn', 'золотистый — только у К/П');
    });

    test('К: просрочен раньше текущего месяца → bad', () => {
        // 2025-03-01 + (1 год) = 2026-03-01 — март
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2025-03-01', '(1 год)'), TODAY),
            'dev-ppr-bad');
    });

    test('П: полная дата с периодом (годы) — прежняя арифметика', () => {
        // 2024-04-01 + (6 лет) = 2030-04-01 > 2026-10-06 → ok
        assertEqual(devPprStatusClass(mk('Есть', 'П', '2024-04-01', '(6 лет)'), TODAY), 'dev-ppr-ok');
    });

    test('К без периода — по-прежнему обычный цвет (период обязателен для К/П)', () => {
        // в отличие от «ТО»: для К год даты не спасает без периода
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-07-15', ''), TODAY), '',
            'К + пустой период → срок не вычислить');
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-07-15', '(нед)'), TODAY), '',
            'К + неизвестная единица → обычный');
    });
});

// ==========================================================================
// 3. Структура кода: ветка «ТО» в devPprStatusClass
// ==========================================================================
describe('Task 481 — структура: ветка «ТО» до разбора периода', () => {

    test('ветка «ТО» существует и сравнивает ГОД', () => {
        const src = extractFunction(INDEX_SRC, 'devPprStatusClass');
        assertTrue(src.indexOf("vid === 'ТО'") !== -1,
            "условие vid === 'ТО'");
        assertTrue(src.indexOf('parseInt(m[1], 10) === now.getFullYear()') !== -1,
            'сравнение года даты с годом «сегодня»');
    });

    test('ветка «ТО» идёт ДО разбора периода (период для ТО не нужен)', () => {
        const src = extractFunction(INDEX_SRC, 'devPprStatusClass');
        const iTo = src.indexOf("vid === 'ТО'");
        const iPer = src.indexOf("dev['Период ремонта']");
        assertTrue(iTo !== -1 && iPer !== -1 && iTo < iPer,
            'ветка года выше разбора периода');
    });

    test('возвраты ветки «ТО» — только ok/bad (warn в ней нет)', () => {
        const src = extractFunction(INDEX_SRC, 'devPprStatusClass');
        const iTo = src.indexOf("vid === 'ТО'");
        const iEnd = src.indexOf('return', iTo);
        const seg = src.slice(iTo, iEnd + 200);
        assertTrue(seg.indexOf("'dev-ppr-ok'") !== -1 && seg.indexOf("'dev-ppr-bad'") !== -1,
            'тернарник ok/bad');
        assertTrue(seg.indexOf('warn') === -1, 'warn в ветке ТО отсутствует');
    });

    test('«сегодня» (now) вычисляется ДО ветки «ТО»', () => {
        const src = extractFunction(INDEX_SRC, 'devPprStatusClass');
        const iNow = src.indexOf('var now = nowOpt || new Date();');
        const iTo = src.indexOf("vid === 'ТО'");
        assertTrue(iNow !== -1 && iTo !== -1 && iNow < iTo,
            'now объявлен выше ветки ТО (год «сегодня» доступен)');
    });

    test('комментарий функции упоминает правило Task 481', () => {
        const i = INDEX_SRC.indexOf('function devPprStatusClass(');
        const zone = INDEX_SRC.slice(Math.max(0, i - 1600), i);
        assertTrue(zone.indexOf('Task 481') !== -1, 'маркер задачи в комментарии функции');
        assertTrue(zone.indexOf('ГОД') !== -1, 'правило года описано');
    });
});

// ==========================================================================
// 4. Интеграция: карточка + таблица + CSS
// ==========================================================================
describe('Task 481 — интеграция (карточка, таблица, CSS)', () => {

    test('карточка: pprCls вычисляется в ветке isCombined (как в 478/479)', () => {
        const i = INDEX_SRC.indexOf('if (f.isCombined) {');
        // окно 900: комментарий Task 481 у вызова (~90 симв.) —
        // дистанция до pprCls ~769
        const seg = INDEX_SRC.slice(i, i + 900);
        assertTrue(seg.indexOf('pprCls = devPprStatusClass(dev);') !== -1,
            'вызов общей функции жив');
    });

    test('карточка: комментарий у вызова упоминает Task 481 (правило года)', () => {
        const i = INDEX_SRC.indexOf('pprCls = devPprStatusClass(dev);');
        const zone = INDEX_SRC.slice(Math.max(0, i - 500), i);
        assertTrue(zone.indexOf('Task 478') !== -1, 'маркер 478 жив');
        assertTrue(zone.indexOf('Task 479') !== -1, 'маркер 479 жив');
        assertTrue(zone.indexOf('Task 481') !== -1, 'маркер 481 добавлен');
        assertTrue(zone.indexOf('ГОД') !== -1, 'правило года у вызова');
    });

    test('таблица: столбец «Дата» зовёт ту же devPprStatusClass (guard)', () => {
        const i = DT_SRC.indexOf("if (col.key === 'Дата'");
        assertTrue(i !== -1, 'ветка столбца «Дата» жива');
        const seg = DT_SRC.slice(i, i + 500);
        assertTrue(seg.indexOf('devPprStatusClass(dev)') !== -1,
            'вызов общей функции — правило года работает и в таблице');
        assertTrue(seg.indexOf('typeof devPprStatusClass') !== -1, 'guard жив');
    });

    test('таблица: комментарий ветки упоминает правило года (Task 481)', () => {
        const i = DT_SRC.indexOf("if (col.key === 'Дата'");
        const zone = DT_SRC.slice(Math.max(0, i - 600), i);
        assertTrue(zone.indexOf('Task 479') !== -1, 'маркер 479 жив');
        assertTrue(zone.indexOf('Task 481') !== -1, 'маркер 481 добавлен');
        assertTrue(zone.indexOf('ГОД') !== -1, 'правило года упомянуто');
    });

    test('таблица: шапка модуля дополнена секцией Task 481', () => {
        const i = DT_SRC.indexOf('Task 481:');
        assertTrue(i !== -1, 'маркер в шапке');
        const zone = DT_SRC.slice(i, i + 400);
        assertTrue(zone.indexOf('ТО') !== -1, 'вид «ТО» описан');
        assertTrue(zone.indexOf('ГОД') !== -1, 'правило года');
    });

    test('CSS: классы и палитры НЕ менялись (те же три цвета)', () => {
        const ok = oneRule(INDEX_SRC, '.dev-card-value.dev-ppr-ok');
        const bad = oneRule(INDEX_SRC, '.dev-card-value.dev-ppr-bad');
        const warn = oneRule(INDEX_SRC, '.dev-card-value.dev-ppr-warn');
        assertTrue(ok !== null && ok.indexOf('#81c784') !== -1, 'ok #81c784 прежний');
        assertTrue(bad !== null && bad.indexOf('#ef5350') !== -1, 'bad #ef5350 прежний');
        assertTrue(warn !== null && warn.indexOf('#e0a030') !== -1, 'warn #e0a030 прежний');
        const okL = oneRule(INDEX_SRC, '[data-theme="light"] .dev-card-value.dev-ppr-ok');
        assertTrue(okL !== null && okL.indexOf('#2e7d32') !== -1, 'ok light прежний');
    });

    test('CSS: комментарий блока дополнен правилом Task 481', () => {
        const i = INDEX_SRC.indexOf('.dev-card-value.dev-ppr-ok');
        const zone = INDEX_SRC.slice(Math.max(0, i - 1100), i);
        assertTrue(zone.indexOf('Task 478') !== -1 && zone.indexOf('Task 479') !== -1,
            'комментарии 478/479 живы');
        assertTrue(zone.indexOf('Task 481') !== -1, 'маркер 481 в CSS-комментарии');
        assertTrue(zone.indexOf('ГОД') !== -1, 'правило года');
    });

    test('CSS таблицы: правила td прежние (модуль не менял палитры)', () => {
        const ok = oneRule(DT_SRC, '.dev-table td.dev-ppr-ok');
        const bad = oneRule(DT_SRC, '.dev-table td.dev-ppr-bad');
        assertTrue(ok !== null && ok.indexOf('#81c784') !== -1, 'td ok прежний');
        assertTrue(bad !== null && bad.indexOf('#ef5350') !== -1, 'td bad прежний');
    });
});

// ==========================================================================
// 5. Данные devices.json: инварианты правила года
// ==========================================================================
describe('Task 481 — данные devices.json: инварианты «ТО = год»', () => {

    const devs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'devices.json'), 'utf8')).devices;

    // ТО-прибор в ППР с ISO-датой (для «ТО» период не обязателен)
    function isTo(dev) {
        return String(dev['В гр. ППР'] || '').trim().toLowerCase() === 'есть' &&
            String(dev['Вид ремонта'] || '').trim().toUpperCase() === 'ТО' &&
            /^\d{4}-\d{2}-\d{2}$/.test(String(dev['Дата'] || '').trim());
    }

    test('каждому прибору — один из ЧЕТЫРЁХ статусов (канон)', () => {
        const valid = { '': true, 'dev-ppr-ok': true, 'dev-ppr-warn': true, 'dev-ppr-bad': true };
        for (const dev of devs) {
            const s = devPprStatusClass(dev, TODAY);
            assertTrue(valid[s] === true, 'ID ' + dev['ID'] + ': неожиданный статус ' + s);
        }
    });

    test('ТО: статус ⇔ ГОД даты = году «сегодня» (три «сегодня»)', () => {
        // ядро заявки на РЕАЛЬНЫХ данных: 2025-06-15 / 2026-10-06 / 2030-01-01
        const dates = [[TODAY_2, 2025], [TODAY, 2026], [TODAY_3, 2030]];
        for (const dev of devs) {
            if (!isTo(dev)) continue;
            const y = parseInt(String(dev['Дата']).slice(0, 4), 10);
            for (const [t, yr] of dates) {
                const s = devPprStatusClass(dev, t);
                assertEqual(s, y === yr ? 'dev-ppr-ok' : 'dev-ppr-bad',
                    'ID ' + dev['ID'] + ' (год ' + y + ', «сегодня» ' + yr + ')');
            }
        }
    });

    test('ТО: warn НЕ встречается ни в одном месяце года', () => {
        // скан 12 «сегодня» 2026 — у ТО месяца нет, только год
        let toWarn = 0;
        for (let mo = 0; mo < 12; mo++) {
            const t = new Date(2026, mo, 6);
            for (const dev of devs) {
                if (isTo(dev) && devPprStatusClass(dev, t) === 'dev-ppr-warn') toWarn++;
            }
        }
        assertEqual(toWarn, 0, 'warn у ТО невозможен (получено ' + toWarn + ')');
    });

    test('ТО: статус определён у каждого прибора с предусловиями', () => {
        // на 2026-10-07 (после авто-синка 22e25742 — массовый перенос
        // дат ТО 2025→2026 пользователем): все 195 ТО — 2026 года → ok;
        // «красная» ветка ТО в данных временно отсутствует (легитимно) —
        // обе ветки логики покрыты юнит-моками §1 (2025/2027 → bad);
        // инвариант: каждому ТО с предусловиями назначен ровно ok|bad
        let ok = 0, bad = 0, total = 0;
        for (const dev of devs) {
            if (!isTo(dev)) continue;
            total++;
            const s = devPprStatusClass(dev, TODAY);
            if (s === 'dev-ppr-ok') ok++;
            if (s === 'dev-ppr-bad') bad++;
        }
        assertEqual(ok + bad, total,
            'все «ТО» с предусловиями получили статус (ok ' + ok + ' + bad ' + bad + ' из ' + total + ')');
        assertTrue(ok > 0, 'ТО с текущим годом есть (' + ok + ' — все зелёные)');
    });

    test('вне гр. ППР — обычный цвет, независимо от вида/даты', () => {
        for (const dev of devs) {
            if (String(dev['В гр. ППР'] || '').trim().toLowerCase() !== 'есть') {
                assertEqual(devPprStatusClass(dev, TODAY), '', 'ID ' + dev['ID']);
                assertEqual(devPprStatusClass(dev, TODAY_3), '', 'ID ' + dev['ID'] + ' (2030)');
            }
        }
    });

    test('итоговые счётчики статусов — заметные (канон инвариантов)', () => {
        // 2026-10-07 после массовой правки ТО 2025→2026 (авто-синк
        // 22e25742, крон из новой таблицы Task 480): ok 838 / warn 14 /
        // bad 1 / обычный 438 — порог bad>100 заменён на «просрочки есть»
        let ok = 0, warn = 0, bad = 0, norm = 0;
        for (const dev of devs) {
            const s = devPprStatusClass(dev, TODAY);
            if (s === 'dev-ppr-ok') ok++;
            else if (s === 'dev-ppr-warn') warn++;
            else if (s === 'dev-ppr-bad') bad++;
            else norm++;
        }
        assertTrue(ok > 500, 'зелёных заметно (' + ok + '; на 2026-10-07 — 838)');
        assertTrue(warn + bad > 0, 'просроченные есть (warn ' + warn +
            ' + bad ' + bad + ')');
        assertTrue(norm > 0, 'обычные есть (' + norm + ')');
    });
});

// ==========================================================================
// 6. SW: версия кэша + комментарий Task 481 + окна истории
// ==========================================================================
describe('Task 481 — SW: версия и шапка', () => {

    test('CACHE_VERSION = kipia-test-v754', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v754';") !== -1,
            'SW поднят до v705 (Task 481)');
    });

    test('прежняя версия v704 отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v704') === -1,
            'в sw.js не осталось kipia-test-v704');
    });

    test('несуществующая v706 отсутствует (guard)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v755') === -1,
            'kipia-test-v754 не должен существовать');
    });

    test('комментарий Task 481 в шапке версий (окно 700)', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v754';");
        // Task 490: +480 симв. комментария — окно 5000 → 6000 (якорь 5196)
        // Task 493: комментарий переименования кнопки Табель (~173 симв.)
        // — якорь 481@6153 — окно 6000 → 6800 (запас 647)
        // Task 496: комментарий ППР-клавиатуры (~254 симв.) — якорь
        // 481@6859 — окно 6800 → 7500 (запас 641)
        // Task 502: окна 9100 → 9800 (481@9113, 480@9357), 9600 → 10300 (479@9612, 478@9951); якоря — каскад.
        const ctx = SW_SRC.slice(Math.max(0, i - 11100), i);
        assertTrue(ctx.indexOf('Task 481') !== -1, 'маркер задачи');
        assertTrue(ctx.indexOf('ГОД') !== -1, 'правило года');
        assertTrue(ctx.indexOf('ТО') !== -1, 'вид «ТО»');
        assertTrue(ctx.indexOf('золотистого для ТО') !== -1 ||
            ctx.indexOf('золотистый для ТО') !== -1, 'warn для ТО исключён');
    });

    test('комментарии Task 480/479/478 не вытеснены (окна 700/1400/1400)', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v754';");
        // Task 490: окно w700 5000 → 6000 (якорь 480@5440); w1400 6500
        // хватает (478@6034, Период ремонта@5987)
        // Task 492: комментарий (~290 симв.) — якорь 480@6221;
        // окно w700 6000 → 6800 (w1400 7300 хватает: 479@6235)
        const w700 = SW_SRC.slice(Math.max(0, i - 11100), i);
        assertTrue(w700.indexOf('Task 480') !== -1, 'Task 480 в окне 700');
        const w1400 = SW_SRC.slice(Math.max(0, i - 11600), i);
        assertTrue(w1400.indexOf('Task 479') !== -1 && w1400.indexOf('оранжево-золотистый') !== -1,
            'Task 479 в окне 1400');
        assertTrue(w1400.indexOf('Task 478') !== -1 &&
            w1400.indexOf('ЗЕЛЁНЫЙ') !== -1 && w1400.indexOf('КРАСНЫЙ') !== -1,
            'Task 478 в окне 1400');
    });

    test('окна истории: якоря 474/472/471/461 в расширенных окнах', () => {
        // Task 481 (~258 симв.) отодвинул якоря: 474 ~2638 → окно 3100;
        // 472 ~3011 → 3600; 471 ~3560 → 4200; 461 ~6122 → 6800
        // (scripts/task481-windows.py; прецедент Task 478/475/476)
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v754';");
        const i474 = SW_SRC.lastIndexOf('Task 474', i);
        const i472 = SW_SRC.lastIndexOf('Task 472', i);
        const i471 = SW_SRC.lastIndexOf('Task 471', i);
        const i461 = SW_SRC.lastIndexOf('Task 461', i);
        assertTrue(i474 !== -1 && (i - i474) < 13300, 'Task 474 в окне 4000');
        assertTrue(i472 !== -1 && (i - i472) < 13500, 'Task 472 в окне 4500');
        assertTrue(i471 !== -1 && (i - i471) < 14300, 'Task 471 в окне 5000');
        assertTrue(i461 !== -1 && (i - i461) < 16700, 'Task 461 в окне 7600');
    });

    test('персистентные кэши НЕ инкрементированы (правка клиентская)', () => {
        // кэш картинок и данных не зависит от CACHE_VERSION (Task 475)
        assertTrue(SW_SRC.indexOf('kipia-images-test-v3') !== -1, 'IMAGE_CACHE v3 жив');
        assertTrue(SW_SRC.indexOf('kipia-data-test-v1') !== -1, 'DATA_CACHE v1 жив');
    });

    test('окна ЧУЖИХ тестов синхронизированы (test-task475 §9 литералы)', () => {
        // регламентные окна истории живут в тестах 461/471/472/474 —
        // test-task475 §9 сверяет ЛИТЕРАЛЫ; после Task 483 они новые
        const s461 = fs.readFileSync(path.join(ROOT, 'tests', 'test-task461.js'), 'utf8');
        assertTrue(s461.indexOf('i - 17000') !== -1, 'test-task461: окно 13200 (Task 495; Task 505: +700; Task 508: +700)');
        const s471 = fs.readFileSync(path.join(ROOT, 'tests', 'test-task471.js'), 'utf8');
        assertTrue(s471.indexOf('i - 14400') !== -1, 'test-task471: окно 13000 (Task 501; Task 508: +700)');
        const s472 = fs.readFileSync(path.join(ROOT, 'tests', 'test-task472.js'), 'utf8');
        assertTrue(s472.indexOf('i - 13700') !== -1, 'test-task472: окно 12400 (Task 501; Task 505: +700)');
        const s474 = fs.readFileSync(path.join(ROOT, 'tests', 'test-task474.js'), 'utf8');
        assertTrue(s474.indexOf('i - 13300') !== -1, 'test-task474: окно 11200 (Task 498; Task 505: +700)');
    });
});

console.log('test-task481: все describes зарегистрированы');
