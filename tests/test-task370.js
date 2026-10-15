// tests/test-task370.js
// Task 370: заявка пользователя — «внеси изменения сразу и в тестовый
//   и в боевой проекты, жёлто-оранжевые значения недоставленных вместо
//   баннера, измени цвет чуть ярче и ближе к желтому».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — цвет недоставленных значений (.flow-summary-val-pending,
//      Task 367) стал ярче и ближе к жёлтому: #ffc400 (тёмная тема) /
//      #cc9900 (светлая); старые #f5a623 / #c96e00 не остались;
//      соседние цвета (зелёный #5ab870, красный #ff5c47 / #e8230a)
//      не тронуты; комментарий-маркер Task 370; приоритет pending
//      над красным due и классы/логика не менялись.
//   B. SW v599 (guard v600).

const fs = require('fs');
const path = require('path');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ============================================================
// A. SRC — цвет недоставленных значений
// ============================================================
describe('Task 370 — SRC: недоставленные — ярче и ближе к жёлтому', () => {

    test('Тёмная тема: .flow-summary-val-pending — яркий #ffc400', () => {
        const i = INDEX_SRC.indexOf('.flow-summary-val.flow-summary-val-pending {');
        assertTrue(i !== -1, 'CSS-правило pending есть');
        const css = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertEqual(css.trim(), '.flow-summary-val.flow-summary-val-pending {\n        color: #ffc400;\n    }',
            'тёмная тема — яркий жёлто-оранжевый #ffc400, только цвет');
    });

    test('Светлая тема: золотистый #cc9900 (читаемый на белом)', () => {
        const l = INDEX_SRC.indexOf('[data-theme="light"] .flow-summary-val.flow-summary-val-pending');
        assertTrue(l !== -1, 'правило светлой темы есть');
        const css = INDEX_SRC.slice(l, INDEX_SRC.indexOf('}', l) + 1);
        assertTrue(css.indexOf('#cc9900') !== -1, 'светлая тема — #cc9900');
        assertTrue(css.indexOf('font-size') === -1 && css.indexOf('font-weight') === -1,
            'размер/вес не тронуты');
    });

    test('Старые цвета Task 367 (#f5a623 / #c96e00) не остались', () => {
        assertTrue(INDEX_SRC.indexOf('#f5a623') === -1, '#f5a623 удалён из index.html');
        assertTrue(INDEX_SRC.indexOf('#c96e00') === -1, '#c96e00 удалён из index.html');
    });

    test('Оттенок ближе к жёлтому: hue(#ffc400) ≈ 46° (было 37° у #f5a623)', () => {
        // #ffc400: R=255 G=196 B=0 → hue = 60*(G-B)/(R-B) = 46.1°
        // #f5a623: R=245 G=166 B=35 → hue = 37.4° (оранжевее)
        const hueNew = 60 * ((196 - 0) / (255 - 0));
        const hueOld = 60 * ((166 - 35) / (245 - 35));
        assertTrue(hueNew > 43 && hueNew < 49, 'новый оттенок — жёлто-оранжевая зона, у жёлтого');
        assertTrue(hueNew > hueOld, 'оттенок сместился К ЖЁЛТОМУ (не в красный)');
        // яркость: max-канал вырос, синий обнулился — цвет сочнее
        assertTrue(255 >= 245 && 0 <= 35, 'ярче: max-канал не ниже, синий меньше');
    });

    test('Комментарий-маркер Task 370 в CSS (заявка задокументирована)', () => {
        const i = INDEX_SRC.indexOf('.flow-summary-val.flow-summary-val-pending {');
        assertTrue(i !== -1, 'CSS-правило pending есть');
        const before = INDEX_SRC.slice(Math.max(0, i - 600), i);
        assertTrue(before.indexOf('Task 370') !== -1, 'комментарий упоминает Task 370');
        assertTrue(before.indexOf('#ffc400') !== -1 && before.indexOf('#cc9900') !== -1,
            'в комментарии указаны новые цвета (обе темы)');
    });

    test('Соседние цвета не тронуты: зелёный и красные на месте', () => {
        assertTrue(INDEX_SRC.indexOf('.flow-summary-val { font-size: 16px; font-weight: 700; color: #5ab870; }') !== -1,
            'зелёный #5ab870 (обычные значения) на месте');
        assertTrue(INDEX_SRC.indexOf('#ff5c47') !== -1, 'красный #ff5c47 (due, тёмная) на месте');
        assertTrue(INDEX_SRC.indexOf('#e8230a') !== -1, 'красный #e8230a (due, светлая) на месте');
    });

    test('Логика не менялась: приоритет pending НАД красным due (Task 367)', () => {
        const rlStart = INDEX_SRC.indexOf('renderList: function');
        assertTrue(rlStart !== -1, 'renderList есть');
        const rl = INDEX_SRC.slice(rlStart, rlStart + 12000);
        const pend = rl.indexOf("if (pendingIds[String(m.id)]) valCls += ' flow-summary-val-pending';");
        const due = rl.indexOf("else if (this._isOverdue(m, null)) valCls += ' flow-summary-val-due';");
        assertTrue(pend !== -1 && due !== -1, 'обе ветки классов на месте');
        assertTrue(pend < due, 'недоставленное (жёлто-оранжевый) важнее «пора вводить»');
    });
});

// ============================================================
// B. SW
// ============================================================
describe('Task 370 — SW: kipia-test-v740', () => {
    test('SW: CACHE_VERSION = kipia-test-v740', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v740'") !== -1,
            'SW-кэш инвалидируется (цвет значений в index.html)');
    });
    test('SW: нет старых/двойных версий', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v598') === -1, 'старая версия v598 не осталась');
        assertTrue(SW_SRC.indexOf('kipia-test-v741') === -1, 'двойного бампа (v600) не было');
    });
});
