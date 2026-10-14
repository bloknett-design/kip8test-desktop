// tests/test-task495.js
// Task 495: заявка пользователя — «В блоке ввода данных для расчёта
//   таблицы убери поле с типом датчика, и убери тексты "Тип датчика"
//   и "Шаг расчёта таблицы в градусах Цельсия", и оформи этот блок
//   так же как блок произвольного расчёта, только не с эффектом
//   выступа, а наоборот. Сразу вноси изменения и в kip8.»
//
// Блок ввода данных расчёта таблицы — на page-temp-sensor-view, под
// панелью произвольного расчёта (Task 371/373/494): подпись «Тип
// датчика» + чип tempSensorViewChip + диапазон min/max + шаг таблицы.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — HTML: в page-temp-sensor-view НЕТ подписи «Тип датчика»,
//      чипа и подсказки «Шаг расчёта таблицы в градусах Цельсия»;
//      литералы отсутствуют во всём index.html (урок Task 488 — и в
//      комментариях); поля диапазона/шага — в новой панели
//      #tempTableFormPanel (класс ts-calc-panel ts-calc-inset, БЕЗ
//      обёртки .scale-form), все ТРИ поля с классом ts-calc-field;
//      панель ПОСЛЕ панели произвольного расчёта; кнопка «Рассчитать»
//      — ВНЕ панели; мёртвые CSS-правила чипа сняты.
//   B. SRC — CSS: модификатор .ts-calc-inset — УГЛУБЛЕНИЕ, «наоборот»
//      выступу Task 494: рамка 1px приглушённая (не 2px яркая),
//      background-image: none (нет синего градиента), box-shadow
//      ТОЛЬКО внутренние (тёмная сверху + светлая кромка снизу),
//      внешней тени НЕТ; правило ПОСЛЕ базового .ts-calc-panel
//      (перекрывает выступ); светлая тема — своя версия углубления.
//   C. VM — openTempSensor: чип не создаётся (ключа в els нет),
//      дефолты 0/100/10 живы; calcTempSensor строит таблицу через
//      поля новой панели (ids не менялись).
//   D. SW v719 (guard v720; v718 в sw.js отсутствует) + комментарий
//      Task 495.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');
const { extractFunctions } = require('./extract-functions.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Блок страницы по id (баланс div-ов) — как в test-task372
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

// Чанк новой панели таблицы: от начала тега '<div' (класс-атрибут
// стоит ДО id в теге) до кнопки «Рассчитать» — панель закрывается
// ДО кнопки (кнопка вне панели)
function tablePanelChunk() {
    const iId = INDEX_SRC.indexOf('id="tempTableFormPanel"');
    const iPanel = iId === -1 ? -1 : INDEX_SRC.lastIndexOf('<div', iId);
    const iBtn = INDEX_SRC.indexOf('onclick="calcTempSensor()"');
    if (iPanel === -1 || iBtn === -1 || iBtn < iPanel) return null;
    return INDEX_SRC.slice(iPanel, iBtn);
}

describe('Task 495 — SRC: поле типа датчика и тексты удалены', () => {

    test('HTML: подпись «Тип датчика» и чип удалены со страницы датчика', () => {
        const b = pageBlock('temp-sensor-view');
        assertTrue(b !== null, 'страница есть');
        assertFalse(b.indexOf('Тип датчика') !== -1,
            'текста «Тип датчика» на странице НЕТ');
        assertFalse(b.indexOf('tempSensorViewChip') !== -1,
            'чип tempSensorViewChip на странице НЕТ');
    });

    test('HTML: подсказка «Шаг расчёта таблицы в градусах Цельсия» удалена', () => {
        const b = pageBlock('temp-sensor-view');
        assertFalse(b.indexOf('Шаг расчёта таблицы в градусах Цельсия') !== -1,
            'подсказки про шаг на странице НЕТ');
        // литералы отсутствуют во всём index.html (урок Task 488:
        // срезы тестов ловят литералы в комментариях)
        assertFalse(INDEX_SRC.indexOf('Шаг расчёта таблицы в градусах Цельсия') !== -1,
            'литерала подсказки нет во всём index.html');
        assertFalse(INDEX_SRC.indexOf('Тип датчика') !== -1,
            'литерала «Тип датчика» нет во всём index.html');
        assertFalse(INDEX_SRC.indexOf('tempSensorViewChip') !== -1,
            'id чипа нет во всём index.html');
    });

    test('HTML: поля — в панели #tempTableFormPanel (ts-calc-inset)', () => {
        const c = tablePanelChunk();
        assertTrue(c !== null, 'чанк панели таблицы извлечён');
        assertTrue(c.indexOf('class="ts-calc-panel ts-calc-inset"') !== -1,
            'классы панели: ts-calc-panel + ts-calc-inset');
        assertFalse(c.indexOf('class="scale-form"') !== -1,
            'обёртки .scale-form в блоке НЕТ (снята)');
        // подписи и поля прежние (ids не менялись)
        for (const chunk of [
            'Диапазон измерения (°C)',
            'Шаг таблицы (°C)',
            'id="temp_sensor_min"',
            'id="temp_sensor_max"',
            'id="temp_sensor_step"'
        ]) {
            assertTrue(c.indexOf(chunk) !== -1, 'панель содержит: ' + chunk);
        }
    });

    test('HTML: все ТРИ поля получили класс ts-calc-field (как в ППР)', () => {
        const c = tablePanelChunk();
        const n = c.split('ts-calc-field').length - 1;
        assertEqual(n, 3, 'ровно ТРИ поля с классом (min + max + шаг)');
        // каждое поле — scale-field ts-calc-field
        assertEqual(c.split('class="scale-field ts-calc-field"').length - 1, 3,
            'класс написан как scale-field ts-calc-field у всех трёх');
    });

    test('HTML: панель ПОСЛЕ панели произвольного расчёта; кнопка — вне панели', () => {
        const iCustom = INDEX_SRC.indexOf('id="tempCustomCalcPanel"');
        const iTable = INDEX_SRC.indexOf('id="tempTableFormPanel"');
        assertTrue(iCustom !== -1 && iTable !== -1, 'обе панели есть');
        assertTrue(iCustom < iTable, 'панель таблицы ПОД панелью произвольного расчёта');
        const c = tablePanelChunk();
        // до кнопки «Рассчитать» панель закрыта: 2 подписи + flex-строка
        // + закрытие самой панели = 4 </div>; последняя </div> — ДО <button
        assertEqual(c.split('</div>').length - 1, 4,
            'панель закрыта ДО кнопки (4 закрытия: 2 подписи + flex + сама панель)');
        assertTrue(c.lastIndexOf('</div>') < c.indexOf('<button'),
            'кнопка «Рассчитать» начинается ПОСЛЕ закрытия панели');
    });

    test('CSS: правила чипа .ts-view-chip* сняты (мёртвый код)', () => {
        for (const gone of ['.ts-view-chip {', '.ts-view-chip-name',
                            '.ts-view-chip-meta', '.ts-view-chip']) {
            assertTrue(INDEX_SRC.indexOf(gone) === -1,
                'правила/класса нет в index.html: ' + gone);
        }
    });
});

describe('Task 495 — SRC: CSS углубления (наоборот выступу)', () => {

    test('CSS: модификатор .ts-calc-inset — правило с углублением', () => {
        const i = INDEX_SRC.indexOf('.ts-calc-panel.ts-calc-inset {');
        assertTrue(i !== -1, 'правило .ts-calc-panel.ts-calc-inset есть');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('border: 1px solid rgba(255, 255, 255, 0.12)') !== -1,
            'рамка 1px нейтральная приглушённая (Task 502; у выступа — 2px)');
        assertTrue(rule.indexOf('background-image: none') !== -1,
            'без синего градиента (у выступа — линейный градиент)');
        assertTrue(rule.indexOf('box-shadow: inset 0 3px 10px rgba(0, 0, 0, 0.5)') !== -1,
            'внутренняя тёмная тень сверху — глубина «колодца»');
        assertTrue(rule.indexOf('inset 0 -1px 0 rgba(255, 255, 255, 0.06)') !== -1,
            'светлая кромка снизу (наоборот подсветке сверху у выступа)');
        assertFalse(rule.indexOf('0 5px 14px') !== -1,
            'внешней тени НЕТ (у выступа — 0 5px 14px)');
    });

    test('CSS: правило ПОСЛЕ базового .ts-calc-panel — перекрывает выступ', () => {
        const iBase = INDEX_SRC.indexOf('.ts-calc-panel {');
        const iInset = INDEX_SRC.indexOf('.ts-calc-panel.ts-calc-inset {');
        const iBaseLight = INDEX_SRC.indexOf('[data-theme="light"] .ts-calc-panel {');
        assertTrue(iBase !== -1 && iInset !== -1 && iBaseLight !== -1,
            'базовое, светлое и inset-правила есть');
        assertTrue(iBase < iInset, 'inset-правило ПОСЛЕ базового (перекрывает)');
        assertTrue(iBaseLight < iInset,
            'inset-правило ПОСЛЕ светлого правила панели (перекрывает и в светлой теме)');
    });

    test('CSS: светлая тема — своя версия углубления', () => {
        const i = INDEX_SRC.indexOf('[data-theme="light"] .ts-calc-panel.ts-calc-inset {');
        assertTrue(i !== -1, 'светлое inset-правило есть');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('background-color: rgba(20, 20, 19, 0.03)') !== -1,
            'светлый фон «колодца» нейтральный (Task 502)');
        assertTrue(rule.indexOf('box-shadow: inset 0 2px 8px rgba(20, 20, 19, 0.08)') !== -1,
            'мягкая внутренняя тень сверху');
        assertTrue(rule.indexOf('inset 0 -1px 0 rgba(255, 255, 255, 0.7)') !== -1,
            'светлая кромка снизу');
        assertTrue(rule.indexOf('border-color: rgba(20, 20, 19, 0.16)') !== -1,
            'приглушённая рамка светлой темы нейтральная (Task 502)');
        assertFalse(rule.indexOf('0 4px 12px') !== -1,
            'внешней тени НЕТ (у светлого выступа — 0 4px 12px)');
    });

    test('SRC: в разметке — панель с модификатором, наследует поля ППР', () => {
        const b = pageBlock('temp-sensor-view');
        assertTrue(b.indexOf('ts-calc-panel ts-calc-inset') !== -1,
            'класс-модификатор в разметке');
        // поля панели наследуют .ts-calc-panel .scale-form-label (Task 494)
        const iLbl = INDEX_SRC.indexOf('.ts-calc-panel .scale-form-label {');
        assertTrue(iLbl !== -1, 'правило подписей ППР живо (общее для панелей)');
    });
});

describe('Task 495 — VM: логика без чипа', () => {

    const fns = extractFunctions();

    function makeVm() {
        const els = {};
        const mkEl = () => ({
            value: '', style: {}, innerHTML: '', textContent: '',
            scrollIntoView: () => {}, children: [],
            _attrs: {},
            setAttribute(k, v) { this._attrs[k] = String(v); },
            getAttribute(k) { return (k in this._attrs) ? this._attrs[k] : null; }
        });
        const document = {
            getElementById: id => (els[id] || (els[id] = mkEl())),
            querySelectorAll: () => []
        };
        const toasts = [];
        const nav = [];
        const store = {};
        const ctx = {
            document,
            localStorage: {
                getItem: k => (k in store ? store[k] : null),
                setItem: (k, v) => { store[k] = String(v); },
                removeItem: k => { delete store[k]; }
            },
            showToast: m => toasts.push(String(m)),
            parseLocaleNumber: fns.parseLocaleNumber,
            formatNumber: fns.formatNumber,
            calcCuResistance: fns.calcCuResistance,
            calcRtdResistance: fns.calcRtdResistance,
            calcTcVoltage: fns.calcTcVoltage,
            setTimeout: () => 0,
            navigator: {},
            navigateTo: p => nav.push(p)
        };
        vm.createContext(ctx);
        const code = ['getRtdSensorMap', 'getTcSensorMap', 'getTempSensorCatalog',
                      'tempSensorFindByKey', 'renderTempSensorCards', 'setTempSensorsTab',
                      'toggleTempSensorFav', 'toggleTempSensorFavFromView',
                      'updateTempSensorFavBtn', 'openTempSensor',
                      'tempSensorInfoHtml', 'getTempSensorRange',
                      'tempCalcForwardValue', 'tempCalcInvertValue',
                      'tempQueryFromTemp', 'tempQueryFromValue', 'calcTempSensor']
            .map(grabFn).join('\n');
        const tempFavStart = INDEX_SRC.indexOf('var TempFav={');
        const tempFavBrace = INDEX_SRC.indexOf('{', tempFavStart);
        let tfDepth = 0, tfEnd = -1;
        for (let i = tempFavBrace; i < INDEX_SRC.length; i++) {
            if (INDEX_SRC[i] === '{') tfDepth++;
            else if (INDEX_SRC[i] === '}') { tfDepth--; if (tfDepth === 0) { tfEnd = i + 2; break; } }
        }
        const tempFavSrc = INDEX_SRC.slice(tempFavStart, tfEnd);
        vm.runInContext('var tempSensorKey=null; var tempSensorsTab=\'all\';\n' + tempFavSrc + '\n' + code + '\n;globalThis.__api = {' +
            'openTempSensor, calcTempSensor, TempFav};', ctx);
        return { els, toasts, nav, api: ctx.__api };
    }

    test('openTempSensor: чип не создаётся, дефолты и переход живы', () => {
        const vmw = makeVm();
        vmw.api.openTempSensor('cu50_1428');
        assertFalse('tempSensorViewChip' in vmw.els,
            'ключа tempSensorViewChip в els НЕТ — чип удалён');
        assertEqual(vmw.nav[vmw.nav.length - 1], 'temp-sensor-view',
            'переход на страницу датчика');
        assertEqual(vmw.els['tempSensorViewTitle'].textContent,
            '50М (Cu50) α = 0,00428 °C⁻¹',
            'тип датчика — в заголовке страницы');
        assertEqual(vmw.els['temp_sensor_min'].value, '0', 'min = 0');
        assertEqual(vmw.els['temp_sensor_max'].value, '100', 'max = 100');
        assertEqual(vmw.els['temp_sensor_step'].value, '10', 'шаг = 10');
    });

    test('calcTempSensor: таблица строится через поля новой панели', () => {
        const vmw = makeVm();
        vmw.api.openTempSensor('cu50_1428');
        vmw.api.calcTempSensor();
        const res = vmw.els['tempSensorResults'];
        assertTrue(res.innerHTML.length > 100, 'таблица построена');
        assertTrue(res.innerHTML.indexOf('50М') !== -1 ||
                   res.innerHTML.indexOf('Cu') !== -1,
            'в таблице — выбранный датчик');
        assertTrue(res.innerHTML.indexOf('°C') !== -1, 'в таблице есть градусы');
        assertEqual(res.style.display, 'block',
            'результаты показаны (calcTempSensor ставит block)');
    });

    test('openTempSensor: код функции не ссылается на чип', () => {
        const fn = grabFn('openTempSensor');
        assertTrue(fn !== null, 'функция есть');
        assertFalse(fn.indexOf('tempSensorViewChip') !== -1,
            'openTempSensor не обращается к чипу');
        assertFalse(fn.indexOf('ts-view-chip') !== -1,
            'классов чипа в openTempSensor нет');
    });
});

describe('Task 495 — SW: версия кеша v719', () => {

    test('SW: CACHE_VERSION = kipia-test-v738, один инкремент', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v738';") !== -1,
            'CACHE_VERSION = kipia-test-v738');
        assertFalse(SW_SRC.indexOf('kipia-test-v718') !== -1,
            'v718 в sw.js отсутствует (ровно один инкремент)');
        assertFalse(SW_SRC.indexOf('kipia-test-v739') !== -1,
            'v720 не существует (guard)');
    });

    test('SW: комментарий Task 495 в шапке версий', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v738';");
        // Task 502: окно 2400 → 2900 (якорь 2758).
        const ctx = SW_SRC.slice(Math.max(0, i - 4200), i);
        assertTrue(ctx.indexOf('Task 495') !== -1, 'маркер задачи');
        assertTrue(ctx.indexOf('УГЛУБЛЕНИЯ') !== -1,
            'упоминание эффекта углубления');
        assertTrue(ctx.indexOf('ts-calc-inset') !== -1,
            'упоминание модификатора панели');
    });
});

console.log('test-task495: все describes зарегистрированы');
