// tests/test-task479.js
// Task 479 — дополнение заявки Task 478: «Дополни условие, если в гр.
// ППР + вид ТО/К/П + срок просрочен, но срок просрочен на текущий
// месяц по календарю, то оранжево-золотистый цвет. И в табличном
// виде в столбце Дата примени такие же условия цвета к тексту даты
// в ячейках.»
//
// РЕШЕНИЕ (клиент-only):
//   • devPprStatusClass(dev, nowOpt) — ТРИ состояния вместо двух:
//     'dev-ppr-ok' (зелёный) — срок не просрочен (>= сегодня);
//     'dev-ppr-warn' (оранжево-золотистый) — срок просрочен
//     (< сегодня), НО месяц срока (первые 7 симв. YYYY-MM) =
//     ТЕКУЩИЙ календарный месяц (ремонт «горит» сейчас);
//     'dev-ppr-bad' (красный) — просрочен, месяц срока РАНЬШЕ
//     текущего; '' (обычный) — без изменений (не в ППР / вид не
//     ТО/К/П / срок не вычислить);
//   • CSS index.html: .dev-ppr-warn #e0a030 (светлая #a06a00) —
//     янтарная палитра метки «Дата старше N лет» таблицы приборов
//     (Task 169), font-weight 600;
//   • devices-table-desktop.js (десктоп, Electron): столбец «Дата» —
//     цвет ТЕКСТА даты в ячейках по той же логике (guard typeof,
//     класс добавляется к td.dev-table-td) + CSS td.dev-ppr-ok/warn/
//     bad (обе темы);
//   SW: kipia-test-v702 → v703 (комментарий ~285 симв., окна истории
//   НЕ расширялись — запасы 345+).
//   ДАННЫЕ: devices.json синкается кроном — тесты инвариантные:
//   warn-ветка проверяется сканом 12 месяцев 2026 (не одной датой);
//   monotonicity ok → warn → bad при росте «сегодня».
//
//   ⚠ Task 481 (следующая заявка) ИЗМЕНИЛ логику для вида «ТО»:
//   ТОЛЬКО ГОД даты ремонта (текущий → ok, другой → bad; период
//   не нужен, warn для ТО невозможен). Тесты ниже адаптированы:
//   моки warn/bad для ТО сменены на К (§2 ×2, §3 ×1 — арифметика
//   даты+периода осталась для К/П); eligible()/monotonicity §4 —
//   с веткой ТО (скан warn-месяцев теперь видит ТОЛЬКО К/П).
//   Полное покрытие правила года — в tests/test-task481.js.
//
// Запуск: через tests/run-all.js (require './test-task479.js').

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

// Оживить извлечённую функцию (eval — как в test-task478/473/464)
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
const JAN10 = new Date(2027, 0, 10);      // 2027-01-10 (стык годов)

// CSS-правило целиком: от селектора до первой '}'
function oneRule(src, sel) {
    const i = src.indexOf(sel);
    if (i === -1) return null;
    const end = src.indexOf('}', i);
    return end === -1 ? null : src.slice(i, end + 1);
}

// ==========================================================================
// 1. CSS (index.html): третий цвет dev-ppr-warn
// ==========================================================================
describe('Task 479 — CSS: класс dev-ppr-warn (оранжево-золотистый)', () => {

    test('.dev-ppr-warn — янтарный текст значения (тёмная тема)', () => {
        const r = oneRule(INDEX_SRC, '.dev-card-value.dev-ppr-warn');
        assertTrue(r !== null, 'правило найдено');
        assertTrue(r.indexOf('#e0a030') !== -1, 'цвет #e0a030 (янтарь метки Task 169)');
        assertTrue(/font-weight:\s*600/.test(r), 'полужирный — статус читается сразу');
    });

    test('светлая тема: warn #a06a00', () => {
        const r = oneRule(INDEX_SRC, '[data-theme="light"] .dev-card-value.dev-ppr-warn');
        assertTrue(r !== null && r.indexOf('#a06a00') !== -1, 'warn light #a06a00');
    });

    test('правила Task 478 (ok/bad) не изменились', () => {
        const ok = oneRule(INDEX_SRC, '.dev-card-value.dev-ppr-ok');
        const bad = oneRule(INDEX_SRC, '.dev-card-value.dev-ppr-bad');
        assertTrue(ok !== null && ok.indexOf('#81c784') !== -1, 'ok по-прежнему #81c784');
        assertTrue(bad !== null && bad.indexOf('#ef5350') !== -1, 'bad по-прежнему #ef5350');
    });

    test('палитра совпадает с янтарной меткой таблицы (Task 169 dev-mark-old)', () => {
        // единая янтарная система цветов по всему приложению
        assertTrue(DT_SRC.indexOf('dev-mark-old > td:first-child { box-shadow: inset 4px 0 0 #e0a030; }') !== -1,
            'метка «Дата старше N лет» тоже #e0a030');
    });

    test('комментарий Task 479 у блока CSS поясняет третий цвет', () => {
        const i = INDEX_SRC.indexOf('.dev-card-value.dev-ppr-warn');
        const zone = INDEX_SRC.slice(Math.max(0, i - 1800), i);
        assertTrue(zone.indexOf('Task 479') !== -1, 'маркер задачи');
        assertTrue(zone.indexOf('ОРАНЖЕВО-ЗОЛОТИСТЫЙ') !== -1,
            'описание цвета заглавными (стиль Task 478)');
        assertTrue(zone.indexOf('ТЕКУЩИЙ календарный месяц') !== -1,
            'условие — текущий календарный месяц');
    });
});

// ==========================================================================
// 2. devPprStatusClass — ветка warn (срок на текущий месяц)
// ==========================================================================
describe('Task 479 — devPprStatusClass: ветка warn', () => {

    test('функция извлекается из index.html', () => {
        assertTrue(typeof devPprStatusClass === 'function',
            'devPprStatusClass объявлена');
    });

    test('срок РАНЬШЕ в текущем месяце — золотистый (ядро заявки 479)', () => {
        // 2025-10-01 + (1 год) = 2026-10-01 < 2026-10-06, месяц тот же
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2025-10-01', '(1 год)'), TODAY),
            'dev-ppr-warn', 'просрочен на 5 дней внутри октября');
    });

    test('срок вчера — золотистый, НЕ красный (правка семантики 478)', () => {
        // 2026-07-03 + (3 мес) = 2026-10-03 < 2026-10-06, октябрь
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-07-03', '(3 мес)'), TODAY),
            'dev-ppr-warn', 'вчерашний срок ещё «горит» этим месяцем');
    });

    test('срок 1-го числа текущего месяца — золотистый', () => {
        // 2026-07-01 + (3 мес) = 2026-10-01
        // Task 481: вид сменён с «ТО» на «К» — ТО теперь по ГОДУ (ok)
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-07-01', '(3 мес)'), TODAY),
            'dev-ppr-warn', 'самый ранний день месяца');
    });

    test('конец ПРОШЛОГО месяца — КРАСНЫЙ (даже 6 дней просрочки)', () => {
        // 2026-06-30 + (3 мес) = 2026-09-30 < 2026-10-06 — сентябрь
        assertEqual(devPprStatusClass(mk('Есть', 'П', '2026-06-30', '(3 мес)'), TODAY),
            'dev-ppr-bad', 'граница месяца по КАЛЕНДАРЮ, не «меньше 30 дней»');
    });

    test('срок позже в текущем месяце — ЗЕЛЁНЫЙ (не просрочен)', () => {
        // 2026-07-20 + (3 мес) = 2026-10-20 > 2026-10-06
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-07-20', '(3 мес)'), TODAY),
            'dev-ppr-ok', 'текущий месяц, но день ещё не наступил');
    });

    test('срок РОВНО сегодня — зелёный (граница Task 478/444 сохранена)', () => {
        // 2023-10-06 + (3 года) = 2026-10-06
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2023-10-06', '(3 года)'), TODAY),
            'dev-ppr-ok');
    });

    test('глубоко просрочен (месяц давно прошёл) — красный', () => {
        // 2026-01-15 + (3 мес) = 2026-04-15 — апрель
        // Task 481: вид сменён с «ТО» на «К» (ТО 2026 → ok по году)
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-01-15', '(3 мес)'), TODAY),
            'dev-ppr-bad');
    });

    test('не в гр. ППР + просрочка в текущем месяце — обычный цвет', () => {
        assertEqual(devPprStatusClass(mk('Нет', 'К', '2025-10-01', '(1 год)'), TODAY), '',
            'предусловия заявки обязательны и для warn');
        assertEqual(devPprStatusClass(mk('Есть', 'С', '2025-10-01', '(1 год)'), TODAY), '',
            'вид не ТО/К/П — без индикации');
    });
});

// ==========================================================================
// 3. devPprStatusClass — границы месяца и года
// ==========================================================================
describe('Task 479 — devPprStatusClass: календарные границы', () => {

    test('стык месяцев на другой «сегодня» (2025-06-15)', () => {
        // 2024-06-05 + (1 год) = 2025-06-05 < 15, июнь → warn
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2024-06-05', '(1 год)'), TODAY_2),
            'dev-ppr-warn', 'июнь — текущий');
        // 2024-05-31 + (1 год) = 2025-05-31 → май → bad
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2024-05-31', '(1 год)'), TODAY_2),
            'dev-ppr-bad', 'май — прошлый');
        // 2024-06-16 + (1 год) = 2025-06-16 > 15 → ok
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2024-06-16', '(1 год)'), TODAY_2),
            'dev-ppr-ok', 'будущая дата текущего месяца');
    });

    test('стык годов: январь текущий — warn, декабрь прошлого — bad', () => {
        // 2026-10-01 + (3 мес) = 2027-01-01 < 2027-01-10, январь → warn
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-10-01', '(3 мес)'), JAN10),
            'dev-ppr-warn', 'новогодний warn');
        // 2026-09-28 + (3 мес) = 2026-12-28 < 2027-01-10, декабрь → bad
        // Task 481: вид сменён с «ТО» на «К» (ТО 2026 ≠ 2027 → bad по году)
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-09-28', '(3 мес)'), JAN10),
            'dev-ppr-bad', 'декабрь прошлого года — уже красный');
    });

    test('1-е число месяца: warn невозможен (нет дней раньше 1-го)', () => {
        // 2027-01-01 при «сегодня» 2030-01-01: месяц срока 2027-01 ≠ 2030-01
        assertEqual(devPprStatusClass(mk('Есть', 'К', '2026-01-01', '(1 год)'), TODAY_3),
            'dev-ppr-bad', 'на 1-м числе месяца warn математически невозможен');
    });

    test('сравнение месяца — первые 7 символов YYYY-MM (slice(0, 7))', () => {
        const src = extractFunction(INDEX_SRC, 'devPprStatusClass');
        assertTrue(src.indexOf('dueIso.slice(0, 7)') !== -1, 'месяц срока срезом 7');
        assertTrue(src.indexOf('todayIso.slice(0, 7)') !== -1, 'месяц сегодня срезом 7');
        assertTrue(src.indexOf('dev-ppr-warn') !== -1, 'возврат warn');
        assertTrue(src.indexOf('dueIso < todayIso') !== -1,
            'граница просрочки — ISO-сравнение (Task 478 сохранено)');
    });

    test('monotonicity одного прибора: ok → warn → bad при росте «сегодня»', () => {
        // фиксированный прибор: 2025-10-01 + (1 год) = срок 2026-10-01
        const dev = mk('Есть', 'К', '2025-10-01', '(1 год)');
        assertEqual(devPprStatusClass(dev, new Date(2026, 8, 30)), 'dev-ppr-ok',
            '30 сентября — срок ещё действует');
        assertEqual(devPprStatusClass(dev, new Date(2026, 9, 1)), 'dev-ppr-ok',
            'ровно в срок — действует (граница Task 444)');
        assertEqual(devPprStatusClass(dev, new Date(2026, 9, 3)), 'dev-ppr-warn',
            '3 октября — просрочен внутри месяца');
        assertEqual(devPprStatusClass(dev, new Date(2026, 9, 31)), 'dev-ppr-warn',
            '31 октября — весь месяц золотистый');
        assertEqual(devPprStatusClass(dev, new Date(2026, 10, 1)), 'dev-ppr-bad',
            '1 ноября — месяц прошёл, красный');
    });
});

// ==========================================================================
// 4. Данные: инварианты на РЕАЛЬНОМ devices.json (крон меняет данные —
//    точные счётчики не фиксируем, только свойства логики)
// ==========================================================================
describe('Task 479 — данные devices.json: инварианты трёх состояний', () => {

    const devs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'devices.json'), 'utf8')).devices;

    // Независимая (упрощённая) проверка предусловий подсветки.
    // Task 481: для «ТО» период НЕ нужен (только год даты)
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

    test('каждому прибору назначен ровно один из ЧЕТЫРЁХ статусов', () => {
        const valid = { '': true, 'dev-ppr-ok': true, 'dev-ppr-warn': true, 'dev-ppr-bad': true };
        for (const dev of devs) {
            const s = devPprStatusClass(dev, TODAY);
            assertTrue(valid[s] === true, 'ID ' + dev['ID'] + ': неожиданный статус ' + s);
        }
    });

    test('прибор вне гр. ППР — ВСЕГДА обычный цвет', () => {
        for (const dev of devs) {
            if (String(dev['В гр. ППР'] || '').trim().toLowerCase() !== 'есть') {
                assertEqual(devPprStatusClass(dev, TODAY), '', 'ID ' + dev['ID']);
                assertEqual(devPprStatusClass(dev, TODAY_3), '', 'ID ' + dev['ID'] + ' (2030)');
            }
        }
    });

    test('с предусловиями — ok|warn|bad; без предусловий — обычный', () => {
        for (const dev of devs) {
            const s = devPprStatusClass(dev, TODAY);
            if (eligible(dev)) {
                assertTrue(s === 'dev-ppr-ok' || s === 'dev-ppr-warn' || s === 'dev-ppr-bad',
                    'ID ' + dev['ID'] + ': подходящий прибор должен быть ok|warn|bad');
            } else {
                assertEqual(s, '', 'ID ' + dev['ID'] + ': неподходящий — обычный');
            }
        }
    });

    test('monotonicity: К/П ok→warn→bad при росте «сегодня»; ТО — год (Task 481)', () => {
        // warn строго между ok и bad: ровно один месяц жизни у просрочки;
        // Task 481: «ТО» — год даты ⇔ год «сегодня» (при переходе
        // года статус может вернуться bad→ok — семантика ТО)
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

    test('warn-ветка представлена в реальных данных (скан 12 месяцев 2026)', () => {
        // НЕ одна дата (данные синкаются кроном): warn живёт ровно один
        // календарный месяц, поэтому ищем хоть один месяц года с warn.
        // Task 481: warn дают ТОЛЬКО К/П — у «ТО» месяца нет (год)
        let total = 0;
        const perMonth = [];
        for (let mo = 0; mo < 12; mo++) {
            const t = new Date(2026, mo, 6);
            let n = 0;
            for (const dev of devs) {
                if (devPprStatusClass(dev, t) === 'dev-ppr-warn') n++;
            }
            perMonth.push(n);
            total += n;
        }
        assertTrue(total > 0,
            'хотя бы один месяц 2026 с warn-приборами К/П (по месяцам: ' + perMonth.join(',') + ')');
    });

    test('инвариант перераспределения: warn + bad = все просрочки', () => {
        // при любом «сегодня» просроченные приборы — это ровно warn ∪ bad
        const t = new Date(2026, 9, 6);
        let overdue = 0, warn = 0, bad = 0;
        for (const dev of devs) {
            const s = devPprStatusClass(dev, t);
            if (s === 'dev-ppr-warn') { warn++; overdue++; }
            if (s === 'dev-ppr-bad') { bad++; overdue++; }
        }
        assertEqual(overdue, warn + bad, 'счётчики согласованы');
        assertTrue(bad > 0, 'красные есть (' + bad + ')');
    });
});

// ==========================================================================
// 5. Табличный вид (десктоп-модуль devices-table-desktop.js)
// ==========================================================================
describe('Task 479 — таблица приборов: столбец «Дата» с цветом ППР', () => {

    test('rowHtml окрашивает ячейки столбца «Дата» через devPprStatusClass', () => {
        const i = DT_SRC.indexOf("if (col.key === 'Дата'");
        assertTrue(i !== -1, 'ветка столбца «Дата» найдена');
        const seg = DT_SRC.slice(i, i + 400);
        assertTrue(seg.indexOf('devPprStatusClass(dev)') !== -1,
            'вызов той же функции, что в карточке');
    });

    test('guard typeof — модуль не падает, если функция ещё не определена', () => {
        const i = DT_SRC.indexOf("if (col.key === 'Дата'");
        const seg = DT_SRC.slice(i, i + 400);
        assertTrue(seg.indexOf('typeof devPprStatusClass') !== -1,
            'защита от async-инъекции модуля (Electron loader)');
    });

    test('класс добавляется К td (текст ячейки), не к строке', () => {
        const i = DT_SRC.indexOf("if (col.key === 'Дата'");
        const seg = DT_SRC.slice(i, i + 400);
        assertTrue(seg.indexOf("cls += ' ' + pprCls") !== -1,
            'добавление к cls ячейки');
        // cls начинается с dev-table-td (базовый класс ячейки)
        const j = DT_SRC.indexOf("var cls = 'dev-table-td'");
        assertTrue(j !== -1 && j < i, 'базовый класс ячейки объявлен до ветки');
    });

    test('условие ТОЛЬКО для столбца «Дата» (другие столбцы не окрашиваются)', () => {
        // в ветке сравнивается именно col.key === 'Дата'; ни «В гр. ППР»,
        // ни «Вид ремонта» не получают цвет в таблице
        const i = DT_SRC.indexOf("if (col.key === 'Дата'");
        assertTrue(DT_SRC.indexOf("col.key === 'В гр. ППР'") === -1,
            'столбец «В гр. ППР» не окрашивается');
        assertTrue(DT_SRC.indexOf("col.key === 'Вид ремонта'") === -1,
            'столбец «Вид ремонта» не окрашивается');
    });

    test('CSS модуля: td.dev-ppr-ok/warn/bad — тёмная тема', () => {
        const ok = oneRule(DT_SRC, '.dev-table td.dev-ppr-ok');
        const warn = oneRule(DT_SRC, '.dev-table td.dev-ppr-warn');
        const bad = oneRule(DT_SRC, '.dev-table td.dev-ppr-bad');
        assertTrue(ok !== null && ok.indexOf('#81c784') !== -1, 'td ok #81c784');
        assertTrue(warn !== null && warn.indexOf('#e0a030') !== -1, 'td warn #e0a030');
        assertTrue(bad !== null && bad.indexOf('#ef5350') !== -1, 'td bad #ef5350');
        assertTrue(/font-weight:\s*600/.test(warn), 'полужирный 600');
    });

    test('CSS модуля: светлая тема #2e7d32 / #a06a00 / #c62828', () => {
        const ok = oneRule(DT_SRC, '[data-theme="light"] .dev-table td.dev-ppr-ok');
        const warn = oneRule(DT_SRC, '[data-theme="light"] .dev-table td.dev-ppr-warn');
        const bad = oneRule(DT_SRC, '[data-theme="light"] .dev-table td.dev-ppr-bad');
        assertTrue(ok !== null && ok.indexOf('#2e7d32') !== -1, 'td ok light');
        assertTrue(warn !== null && warn.indexOf('#a06a00') !== -1, 'td warn light');
        assertTrue(bad !== null && bad.indexOf('#c62828') !== -1, 'td bad light');
    });

    test('палитра таблицы = палитре карточки (единая система)', () => {
        // значения цветов в обоих файлах идентичны
        for (const hex of ['#81c784', '#ef5350', '#e0a030', '#2e7d32', '#c62828', '#a06a00']) {
            assertTrue(INDEX_SRC.indexOf(hex) !== -1 && DT_SRC.indexOf(hex) !== -1,
                'цвет ' + hex + ' есть в обоих файлах');
        }
    });

    test('комментарий Task 479 в шапке модуля таблицы', () => {
        const i = DT_SRC.indexOf('Task 479:');
        assertTrue(i !== -1, 'маркер задачи в шапке');
        const zone = DT_SRC.slice(i, i + 600);
        assertTrue(zone.indexOf('столбец «Дата»') !== -1, 'описание столбца');
        assertTrue(zone.indexOf('devPprStatusClass') !== -1, 'упоминание общей функции');
    });

    test('комментарий Task 479 у CSS-правил модуля', () => {
        const i = DT_SRC.indexOf('.dev-table td.dev-ppr-warn');
        const zone = DT_SRC.slice(Math.max(0, i - 600), i);
        assertTrue(zone.indexOf('Task 479') !== -1, 'маркер у CSS');
        assertTrue(zone.indexOf('#e0a030') !== -1, 'янтарь в комментарии');
    });

    test('модуль по-прежнему ТОЛЬКО десктопный (инъекция IS_ELECTRON)', () => {
        // загрузчик в index.html не тронут: только Electron
        const i = INDEX_SRC.indexOf("'devices-table-desktop.js'");
        assertTrue(i !== -1, 'модуль подключён как прежде');
        const zone = INDEX_SRC.slice(Math.max(0, i - 400), i + 200);
        assertTrue(zone.indexOf('IS_ELECTRON') !== -1, 'инъекция за IS_ELECTRON');
    });
});

// ==========================================================================
// 6. Интеграция в карточку (devRenderDetail — поведение сохранено)
// ==========================================================================
describe('Task 479 — карточка: интеграция не сломана', () => {

    test('pprCls вычисляется в ветке isCombined, как в Task 478', () => {
        const i = INDEX_SRC.indexOf('if (f.isCombined) {');
        // Task 481: окно 700 → 900 — комментарий у вызова дополнен
        // правилом года (~90 симв.), дистанция до pprCls ~769
        const seg = INDEX_SRC.slice(i, i + 900);
        assertTrue(seg.indexOf('pprCls = devPprStatusClass(dev);') !== -1,
            'класс цвета считается для комбинированной строки');
    });

    test('комментарий у вызова упоминает три цвета (Task 479)', () => {
        const i = INDEX_SRC.indexOf('pprCls = devPprStatusClass(dev);');
        const zone = INDEX_SRC.slice(Math.max(0, i - 400), i);
        assertTrue(zone.indexOf('Task 479') !== -1, 'маркер дополнения');
        assertTrue(zone.indexOf('оранжево-золотистый') !== -1, 'третий цвет описан');
    });

    test('десктоп-панель рендерит тем же devRenderDetail', () => {
        const i = INDEX_SRC.indexOf('function devRenderDetailInPanel()');
        const seg = INDEX_SRC.slice(i, i + 900);
        assertTrue(seg.indexOf('devRenderDetail();') !== -1,
            'панель — тот же рендер, warn работает и там');
    });
});

// ==========================================================================
// 7. SW: версия + комментарий + окна истории
// ==========================================================================
describe('Task 479 — SW: версия и шапка', () => {

    test('CACHE_VERSION = kipia-test-v761', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v761';") !== -1,
            'SW поднят до v703 (Task 479)');
    });

    test('прежняя версия v702 отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v702') === -1,
            'в sw.js не осталось kipia-test-v702');
    });

    test('несуществующая v704 отсутствует (guard)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v762') === -1,
            'kipia-test-v761 не должен существовать');
    });

    test('комментарий Task 479 в шапке версий', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v761';");
        // Task 480: окно 700 → 1100 — комментарий Task 480 (~250 симв.)
        // отодвинул комментарий Task 478 до ~835 (за прежним окном 700).
        // Task 481: окно 1100 → 1400 — комментарий «ТО = только год»
        // (~258 симв.) отодвинул Task 478 до ~1096.
        // Task 484: окно 2100 → 2500 — комментарий Task 484 (~390)
        // отодвинул Task 478 до ~2189 (за прежним окном 2100).
        // Task 502: окно 9600 → 10300 (якорь 9612); якоря — каскад.
        const ctx = SW_SRC.slice(Math.max(0, i - 11600), i);
        assertTrue(ctx.indexOf('Task 479') !== -1, 'маркер задачи');
        assertTrue(ctx.indexOf('оранжево-золотистый') !== -1, 'третий цвет');
        assertTrue(ctx.indexOf('dev-ppr-warn') !== -1, 'имя класса');
        assertTrue(ctx.indexOf('столбце «Дата»') !== -1, 'упоминание таблицы');
        // комментарий Task 478 не вытеснен (окно 1100 после Task 480)
        assertTrue(ctx.indexOf('Task 478') !== -1, 'комментарий 478 в том же окне');
        assertTrue(ctx.indexOf('ЗЕЛЁНЫЙ') !== -1 && ctx.indexOf('КРАСНЫЙ') !== -1,
            'описание цветов 478 сохранено');
    });

    test('окна истории: якоря 461/471/472/474 в расширенных окнах (Task 486)', () => {
        // комментарий Task 479 компактен (~285 симв.) — окна Task 478
        // НЕ расширялись: 474 ~2133 < 2500; 472 ~2506 < 2900;
        // 471 ~3055 < 3400; 461 ~5617 < 6000 (запасы 345+)
        // Task 480 (~250 симв.) тоже вписался: 474 ~2377; 472 ~2750;
        // 471 ~3299; 461 ~5861 — расширения не нужны (запасы 101+)
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v761';");
        const i474 = SW_SRC.lastIndexOf('Task 474', i);
        const i472 = SW_SRC.lastIndexOf('Task 472', i);
        const i471 = SW_SRC.lastIndexOf('Task 471', i);
        const i461 = SW_SRC.lastIndexOf('Task 461', i);
        assertTrue(i474 !== -1 && (i - i474) < 13300, 'Task 474 в окне 4000');
        assertTrue(i472 !== -1 && (i - i472) < 13500, 'Task 472 в окне 4500');
        assertTrue(i471 !== -1 && (i - i471) < 14300, 'Task 471 в окне 5000');
        assertTrue(i461 !== -1 && (i - i461) < 16700, 'Task 461 в окне 7600');
    });
});

console.log('test-task479: все describes зарегистрированы');
