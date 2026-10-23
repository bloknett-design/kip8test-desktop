// tests/test-task372.js
// Task 372: заявка пользователя — «Переделаем раздел Датчики температуры.
//   На странице Главная / Инженерные калькуляторы / КИП и А / Датчики
//   температуры, сделай страницу со списком карточек всех датчиков
//   температуры, которые находятся сейчас в выпадающих списках на странице
//   выбора датчиков температуры, и при выборе датчика будет переход на его
//   страницу с выбором диапазона измерения, шага таблицы, и под ними
//   добавь форму пересчёта сопротивление-температура для термометров,
//   Термо-ЭДС-температура для термопар. Блок со справочной информацией
//   оставь в каждом датчике температуры, но в термометрах убери информацию
//   о термопарах, а в термопарах от термометрах.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — страница карточек (#page-temp-sensors: группы ТС/ТП, 2 сетки),
//      страница датчика (#page-temp-sensor-view: conv-3col, чип, диапазон,
//      шаг, результаты, справка), старые select-ы удалены, реестры
//      (PAGE_PARENTS/PAGE_LABELS/топ-бар/_CALC_PAGES/navigateTo-хуки).
//   B. VM — каталог (16 позиций, порядок, диапазоны, имена, meta),
//      renderTempSensorCards (8+8 карточек, onclick-ключи, идемпотентность),
//      openTempSensor (дефолты 0/100/10, сброс результатов, заголовок,
//      чип, справка, navigateTo; неизвестный ключ — тост).
//   C. VM — справка по типу датчика: ТС БЕЗ информации о термопарах
//      (нет «Термопара», ГОСТ Р 8.585-2001), ТП БЕЗ информации о
//      термометрах (нет «Термопреобразователь», ГОСТ 6651-2009, IEC 60751).
//   D. VM — расчёт по выбранному датчику (состояние, а не selects):
//      calcTempSensor таблица ТС/ТП, живой пересчёт Task 371 через состояние.
//   E. SW v602 (guard v603).
//
// Task 373 (адаптация): бейджи ТС/ТП убраны из карточек и чипа;
// каталог вырос до 17 позиций (добавлена ТХК (L) после ТХКн (E));
// renderTempSensorCards перерисовывается при каждом вызове (табы
// «Все / Избранные» + звёзды TempFav); панель «Расчёт произвольных
// значений» стала статичной над формой — из результатов удалена.
// Task 490 (адаптация): мобильная сетка — кнопки по ДВЕ в строке
// (пары с одинаковой градуировкой рядом), на кнопках ТС только
// градуировка+α (скрыты аналог/R₀/диапазон), порядок ТП:
// K,L,J,T,E,N,R,S,B (ТХА (K)+ТХК (L) вместе).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');
const { extractFunctions } = require('./extract-functions.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Извлечение исходника function-декларации по имени (баланс фигурных скобок)
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

// «1234,56» (с неразрывными пробелами) → 1234.56
function parseRu(s) {
    return parseFloat(String(s).replace(/\u00A0/g, '').replace(',', '.'));
}

// Блок страницы по id (открывающий div до парного закрывающего)
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

// ============================================================
// A. SRC — страницы, реестры, удаление старых select-ов
// ============================================================
describe('Task 372 — SRC: страница карточек и страница датчика', () => {

    test('Страница temp-sensors — карточки в двух группах (ТС/ТП)', () => {
        const b = pageBlock('temp-sensors');
        assertTrue(b !== null, 'страница есть');
        assertTrue(b.indexOf('class="page-content">') !== -1, 'НЕ conv-3col (страница выбора)');
        assertTrue(b.indexOf('ts-page') !== -1, 'контейнер ts-page');
        assertTrue(b.indexOf('Термометры сопротивления') !== -1, 'группа ТС');
        assertTrue(b.indexOf('Термопары') !== -1, 'группа ТП');
        assertTrue(b.indexOf('id="tsRtdCards"') !== -1, 'сетка карточек ТС');
        assertTrue(b.indexOf('id="tsTcCards"') !== -1, 'сетка карточек ТП');
        assertTrue(b.indexOf('ГОСТ 6651-2009') !== -1, 'гост ТС в заголовке группы');
        assertTrue(b.indexOf('ГОСТ Р 8.585-2001') !== -1, 'гост ТП в заголовке группы');
    });

    test('Страница temp-sensor-view — conv-3col с формой и результатами', () => {
        const b = pageBlock('temp-sensor-view');
        assertTrue(b !== null, 'страница есть');
        assertTrue(b.indexOf('class="page-content conv-3col-page">') !== -1, 'conv-3col-page');
        assertTrue(b.indexOf('id="tempSensorViewTitle"') !== -1, 'динамический заголовок');
        assertFalse(b.indexOf('id="tempSensorViewChip"') !== -1,
            'Task 495: чип типа датчика удалён из блока ввода');
        assertTrue(b.indexOf('ts-calc-inset') !== -1,
            'Task 495: блок таблицы — панель с углублением');
        assertTrue(b.indexOf('id="temp_sensor_min"') !== -1, 'поле min');
        assertTrue(b.indexOf('id="temp_sensor_max"') !== -1, 'поле max');
        assertTrue(b.indexOf('id="temp_sensor_step"') !== -1, 'поле шага');
        assertTrue(b.indexOf('Диапазон измерения (°C)') !== -1, 'подпись диапазона');
        assertTrue(b.indexOf('Шаг таблицы (°C)') !== -1, 'подпись шага');
        assertTrue(b.indexOf('calcTempSensor()') !== -1, 'кнопка «Рассчитать»');
        assertTrue(b.indexOf('id="tempSensorResults"') !== -1, 'контейнер результатов');
        assertTrue(b.indexOf('id="tempSensorInfoBody"') !== -1, 'тело справки');
        assertTrue(b.indexOf('Справочная информация') !== -1, 'заголовок справки');
        assertTrue(b.indexOf('conv-info-block') !== -1, 'класс conv-info-block');
    });

    test('Старые выпадающие списки удалены', () => {
        for (const gone of [
            "getElementById('temp_sensor_type'", "getElementById('temp_rtd_type'",
            "getElementById('temp_tc_type'", 'id="temp_sensor_type"', 'id="temp_rtd_type"',
            'id="temp_tc_type"', 'id="rtd_options"', 'id="tc_options"',
            'function updateTempSensorOptions',
        ]) {
            assertTrue(INDEX_SRC.indexOf(gone) === -1, 'нет: ' + gone);
        }
    });

    test('Каталог: 8 ТС парами градуировок (Task 491) + 9 ТП парами (Task 490)', () => {
        const fn = grabFn('getTempSensorCatalog');
        assertTrue(fn !== null, 'функция объявлена');
        const orderChunk = "['cu50_1428','cu50_1426','cu100_1428','cu100_1426','pt50_1391','pt100_1391','pt100_1385','pt1000_1385']";
        assertTrue(fn.indexOf(orderChunk) !== -1, 'порядок ТС (Task 491: 50М+50М, 100М+100М)');
        assertTrue(fn.indexOf("['K','L','J','T','E','N','R','S','B']") !== -1, 'порядок ТП (Task 490: K+L вместе, парами)');
        assertTrue(fn.indexOf("key:'tc_'+k") !== -1, 'ключи ТП вида tc_K');
    });

    test('Реестры: temp-sensor-view зарегистрирован везде', () => {
        assertTrue(INDEX_SRC.indexOf("'temp-sensor-view': 'temp-sensors'") !== -1, 'PAGE_PARENTS');
        assertTrue(INDEX_SRC.indexOf("'temp-sensor-view': 'Датчик температуры'") !== -1, 'PAGE_LABELS');
        assertTrue(INDEX_SRC.indexOf("'temp-sensors', 'temp-sensor-view', 'orifice-select'") !== -1, 'топ-бар calculators');
        assertTrue(INDEX_SRC.indexOf("'temp-sensors', 'temp-sensor-view',") !== -1, 'KipAuth._CALC_PAGES');
    });

    test('navigateTo: хуки списка и детальной страницы', () => {
        assertTrue(INDEX_SRC.indexOf("if (page === 'temp-sensor-view' && !tempSensorKey) { page = 'temp-sensors'; }") !== -1,
            'редирект без выбора → список');
        assertTrue(INDEX_SRC.indexOf("if (page === 'temp-sensors') {") !== -1 &&
                   INDEX_SRC.indexOf("if (typeof renderTempSensorCards === 'function') renderTempSensorCards();") !== -1,
            'рендер карточек при открытии списка (Task 491: multiline-блок)');
        // десктоп: последний сегмент крошек — имя датчика (customCurrentLabel)
        // Task 498: сегмент — только тип датчика (с α, как в заголовке)
        assertTrue(INDEX_SRC.indexOf('updateDesktopBreadcrumb(null, l498)') !== -1,
            'крошки: тип датчика (Task 498: с α) вместо статической метки');
    });

    test('openTempSensor: дефолты формы и сброс результатов', () => {
        const fn = grabFn('openTempSensor');
        assertTrue(fn !== null, 'функция объявлена');
        assertTrue(fn.indexOf("mn.value='0';") !== -1, 'min = 0');
        assertTrue(fn.indexOf("mx.value='100';") !== -1, 'max = 100');
        assertTrue(fn.indexOf("st.value='10';") !== -1, 'шаг = 10');
        assertTrue(fn.indexOf("res.innerHTML='';") !== -1, 'сброс результатов');
        assertTrue(fn.indexOf("res.style.display='none';") !== -1, 'скрытие результатов');
        assertTrue(fn.indexOf("tempSensorInfoHtml(sel)") !== -1, 'справка под датчик');
        assertTrue(fn.indexOf("navigateTo('temp-sensor-view')") !== -1, 'переход на страницу датчика');
        assertTrue(fn.indexOf('Датчик не найден') !== -1, 'тост на неизвестный ключ');
    });

    test('renderTempSensorCards: рендер с избранным и табами (Task 373)', () => {
        const fn = grabFn('renderTempSensorCards');
        assertTrue(fn !== null, 'функция объявлена');
        assertTrue(fn.indexOf("getElementById('tsRtdCards')") !== -1, 'сетка ТС');
        assertTrue(fn.indexOf("getElementById('tsTcCards')") !== -1, 'сетка ТП');
        assertTrue(fn.indexOf('children.length&&tcBox.children.length') === -1, 'guard повторного рендера удалён (Task 373)');
        assertTrue(fn.indexOf('TempFav.has(s.key)') !== -1, 'фильтр избранного');
        assertTrue(fn.indexOf('role="button"') !== -1, 'доступность: role button');
    });

    test('CSS карточек и чипа на месте', () => {
        for (const cls of ['.ts-cards-grid', '.ts-card {', '.ts-card-name', '.ts-card-fav-btn',
                           '.ts-tabs', '#tempSensorFavBtn', '.ts-calc-panel',
                           '.ts-calc-panel.ts-calc-inset']) {
            assertTrue(INDEX_SRC.indexOf(cls) !== -1, 'есть правило ' + cls);
        }
        // Task 495: правила чипа сняты как неиспользуемые
        assertTrue(INDEX_SRC.indexOf('.ts-view-chip') === -1,
            'Task 495: CSS-правила чипа удалены');
        // Task 373: бейджи карточек удалены
        assertTrue(INDEX_SRC.indexOf('.ts-card-badge') === -1, 'CSS бейджей карточек нет');
    });

    test('Саблейблы обновлены (карточки вместо расчёта на месте)', () => {
        assertTrue(INDEX_SRC.indexOf('Термометры сопротивления и термопары') !== -1,
            'новый саблейбл в меню и SUBSECTIONS');
        assertTrue(INDEX_SRC.indexOf('Расчёт R и мВ по температуре') === -1,
            'старый саблейбл удалён');
    });

    test('Маркеры Task 372 в коде', () => {
        assertTrue((INDEX_SRC.match(/\/\/ Task 372|Task 372:/g) || []).length >= 10,
            'комментарии-маркеры Task 372');
    });
});

// ============================================================
// B. VM — каталог, карточки, открытие датчика
// ============================================================
const fns = extractFunctions();

function makeVm() {
    const els = {};
    const mkEl = () => ({
        value: '', style: {}, innerHTML: '', textContent: '',
        scrollIntoView: () => {}, children: [],
        _attrs: {},
        setAttribute(k, v) { this._attrs[k] = String(v); },
        getAttribute(k) { return (k in this._attrs) ? this._attrs[k] : null; },
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
    // Task 373: tempCustomCalcHtml удалена (панель статичная); добавлены
    // TempFav, tempSensorsTab и переключатели избранного
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
        'getRtdSensorMap, getTcSensorMap, getTempSensorCatalog, tempSensorFindByKey, ' +
        'renderTempSensorCards, openTempSensor, tempSensorInfoHtml, TempFav, ' +
        'getTempSensorRange, tempCalcForwardValue, tempCalcInvertValue, ' +
        'tempQueryFromTemp, tempQueryFromValue, calcTempSensor, ' +
        'setSensor: function(k){ tempSensorKey = k; }};', ctx);
    return { els, toasts, nav, api: ctx.__api };
}

describe('Task 372 — VM: каталог всех датчиков', () => {

    test('17 позиций: 8 ТС + 9 ТП, порядок и ключи', () => {
        const vmw = makeVm();
        const cat = vmw.api.getTempSensorCatalog();
        assertEqual(cat.length, 17, 'всего 17 датчиков (Task 373: + ТХК L)');
        assertEqual(cat.filter(s => s.kind === 'rtd').length, 8, '8 ТС');
        assertEqual(cat.filter(s => s.kind === 'tc').length, 9, '9 ТП');
        assertEqual(cat[0].key, 'cu50_1428', 'первый — 50М (Cu50), как в списке');
        assertEqual(cat[7].key, 'pt1000_1385', 'последний ТС — Pt1000 (IEC)');
        assertEqual(cat[8].key, 'tc_K', 'первый ТП — ТХА (K)');
        assertEqual(cat[9].key, 'tc_L', 'Task 490: ТХК (L) сразу после ТХА (K)');
        assertEqual(cat[16].key, 'tc_B', 'последний ТП — ТПР (B)');
    });

    test('Диапазоны НСХ по датчикам', () => {
        const vmw = makeVm();
        const cat = vmw.api.getTempSensorCatalog();
        const byKey = {};
        cat.forEach(s => { byKey[s.key] = s; });
        // Task 499: Cu α = 0,00428 — −180…+200 (ГОСТ 6651-2009, А.3/5.2.3)
        assertEqual(JSON.stringify(byKey['cu50_1428'].range), '{"min":-180,"max":200}', 'Cu50 0,00428');
        assertEqual(JSON.stringify(byKey['cu50_1426'].range), '{"min":-50,"max":200}', 'Cu50 0,00426');
        assertEqual(JSON.stringify(byKey['pt100_1385'].range), '{"min":-200,"max":850}', 'Pt100');
        assertEqual(JSON.stringify(byKey['tc_K'].range), '{"min":-270,"max":1372}', 'K');
        assertEqual(JSON.stringify(byKey['tc_B'].range), '{"min":0,"max":1820}', 'B');
        assertEqual(JSON.stringify(byKey['tc_T'].range), '{"min":-270,"max":400}', 'T');
        assertEqual(JSON.stringify(byKey['tc_R'].range), '{"min":-50,"max":1768}', 'R');
    });

    test('Имена и meta карточек', () => {
        const vmw = makeVm();
        const cat = vmw.api.getTempSensorCatalog();
        const byKey = {};
        cat.forEach(s => { byKey[s.key] = s; });
        assertEqual(byKey['cu50_1428'].name, '50М (Cu50)', 'имя Cu50');
        assertEqual(byKey['tc_K'].name, 'ТХА (K)', 'имя K');
        assertTrue(byKey['cu50_1428'].meta.indexOf('R₀ = 50 Ом') !== -1, 'meta Cu50: R₀');
        assertTrue(byKey['cu50_1428'].meta.indexOf('0,00428') !== -1, 'meta Cu50: α');
        assertTrue(byKey['pt100_1385'].meta.indexOf('0,00385') !== -1, 'meta Pt IEC');
        assertTrue(byKey['pt50_1391'].meta.indexOf('0,00391') !== -1, 'meta Pt ГОСТ');
        assertTrue(byKey['tc_K'].meta.indexOf('хромель-алюмель') !== -1, 'meta K: электроды');
        assertTrue(byKey['tc_B'].meta.indexOf('платинородий-платинородий') !== -1, 'meta B');
    });

    test('tempSensorFindByKey: поиск и промах', () => {
        const vmw = makeVm();
        const sel = vmw.api.tempSensorFindByKey('tc_S');
        assertTrue(sel !== null && sel.name === 'ТПП (S)', 'найден S');
        assertEqual(vmw.api.tempSensorFindByKey('nope'), null, 'неизвестный ключ → null');
    });
});

describe('Task 372 — VM: renderTempSensorCards', () => {

    test('8 карточек ТС + 9 карточек ТП с onclick-ключами (Task 373: без бейджей, со звёздами)', () => {
        const vmw = makeVm();
        vmw.api.renderTempSensorCards();
        const rtd = vmw.els['tsRtdCards'].innerHTML;
        const tc = vmw.els['tsTcCards'].innerHTML;
        assertEqual((rtd.match(/class="ts-card[ "]/g) || []).length, 8, '8 ТС-карточек');
        assertEqual((tc.match(/class="ts-card ts-card-tc[ "]/g) || []).length, 9, '9 ТП-карточек (Task 373: + ТХК L)');
        assertTrue(rtd.indexOf("openTempSensor('cu50_1428')") !== -1, 'onclick Cu50');
        assertTrue(rtd.indexOf("openTempSensor('pt1000_1385')") !== -1, 'onclick Pt1000');
        assertTrue(tc.indexOf("openTempSensor('tc_K')") !== -1, 'onclick K');
        assertTrue(tc.indexOf("openTempSensor('tc_L')") !== -1, 'Task 373: onclick ТХК (L)');
        assertTrue(tc.indexOf("openTempSensor('tc_B')") !== -1, 'onclick B');
        // Task 373: бейджи ТС/ТП убраны из карточек
        assertTrue(rtd.indexOf('>ТС</span>') === -1, 'бейджа ТС нет');
        assertTrue(tc.indexOf('>ТП</span>') === -1, 'бейджа ТП нет');
        // Task 373: звезда избранного на каждой карточке
        assertEqual((rtd.match(/ts-card-fav-btn/g) || []).length, 8, 'звёзды на ТС');
        assertEqual((tc.match(/ts-card-fav-btn/g) || []).length, 9, 'звёзды на ТП');
        assertTrue(rtd.indexOf('50М (Cu50)') !== -1, 'имя на карточке ТС');
        assertTrue(tc.indexOf('ТХА (K)') !== -1, 'имя на карточке ТП');
        assertTrue(tc.indexOf('ТХК (L)') !== -1, 'Task 373: карточка ТХК (L)');
        assertTrue(rtd.indexOf('НСХ: −50…200 °C') !== -1, 'диапазон Cu α = 0,00426 (минус U+2212)');
        assertTrue(rtd.indexOf('НСХ: −180…200 °C') !== -1,
            'Task 499: Cu α = 0,00428 — −180…200 (ГОСТ 6651-2009, А.3)');
        assertTrue(tc.indexOf('НСХ: −270…1372 °C') !== -1, 'диапазон на карточке K');
        assertTrue(tc.indexOf('НСХ: −200…800 °C') !== -1, 'Task 373: диапазон L');
        assertEqual(vmw.els['tsAllCount'].textContent, '17', 'счётчик «Все»');
        assertEqual(vmw.els['tsFavCount'].textContent, '0', 'счётчик «Избранные»');
    });

    test('Task 373: повторный вызов перерисовывает (состояние звёзд)', () => {
        const vmw = makeVm();
        vmw.api.renderTempSensorCards();
        vmw.api.TempFav.add('cu50_1428');
        vmw.api.renderTempSensorCards();
        assertTrue(vmw.els['tsRtdCards'].innerHTML.indexOf('★') !== -1, 'звезда отразилась');
        assertEqual(vmw.els['tsFavCount'].textContent, '1', 'счётчик обновился');
    });
});

describe('Task 372 — VM: openTempSensor — переход на страницу датчика', () => {

    test('Полный флоу: состояние, заголовок, чип, дефолты, справка, переход', () => {
        const vmw = makeVm();
        vmw.api.openTempSensor('cu50_1428');
        assertEqual(vmw.nav[0], 'temp-sensor-view', 'navigateTo на страницу датчика');
        assertEqual(vmw.els['tempSensorViewTitle'].textContent, '50М (Cu50) α = 0,00428 °C⁻¹',
            'заголовок страницы');
        assertFalse('tempSensorViewChip' in vmw.els,
            'Task 495: чип удалён — openTempSensor его не трогает');
        assertEqual(vmw.els['tempQueryValLabel'].textContent, 'Сопротивление R(t), Ом', 'Task 373: подпись панели для ТС');
        assertEqual(vmw.els['temp_sensor_min'].value, '0', 'min = 0');
        assertEqual(vmw.els['temp_sensor_max'].value, '100', 'max = 100');
        assertEqual(vmw.els['temp_sensor_step'].value, '10', 'шаг = 10');
        assertEqual(vmw.els['tempSensorResults'].innerHTML, '', 'результаты сброшены');
        assertEqual(vmw.els['tempSensorResults'].style.display, 'none', 'результаты скрыты');
        assertTrue(vmw.els['tempSensorInfoBody'].innerHTML.indexOf('Термопреобразователь сопротивления') !== -1,
            'справка заполнена (ТС)');
        assertEqual(vmw.toasts.length, 0, 'без тостов');
    });

    test('Смена датчика: ТП-заголовок и повторный переход', () => {
        const vmw = makeVm();
        vmw.api.openTempSensor('tc_K');
        assertEqual(vmw.els['tempSensorViewTitle'].textContent, 'ТХА (K)', 'заголовок ТП');
        assertEqual(vmw.nav[0], 'temp-sensor-view', 'переход');
        // сначала «рассчитали» что-то — потом сменили датчик: всё сброшено
        vmw.els['tempSensorResults'].innerHTML = '<table></table>';
        vmw.els['tempSensorResults'].style.display = 'block';
        vmw.api.openTempSensor('tc_B');
        assertEqual(vmw.els['tempSensorResults'].innerHTML, '', 'результаты сброшены при смене');
        assertEqual(vmw.els['tempSensorViewTitle'].textContent, 'ТПР (B)', 'новый заголовок');
    });

    test('Неизвестный ключ — тост, без перехода', () => {
        const vmw = makeVm();
        vmw.api.openTempSensor('nope');
        assertEqual(vmw.nav.length, 0, 'перехода нет');
        assertTrue(vmw.toasts.length === 1 && vmw.toasts[0].indexOf('Датчик не найден') !== -1,
            'тост «Датчик не найден»');
    });
});

// ============================================================
// C. VM — справка: ТС без термопар, ТП без термометров
// ============================================================
describe('Task 372 — VM: справочная информация по типу датчика', () => {

    test('ТС: есть информация о термометрах, НЕТ — о термопарах', () => {
        const vmw = makeVm();
        const sel = vmw.api.tempSensorFindByKey('pt100_1385');
        const html = vmw.api.tempSensorInfoHtml(sel);
        assertTrue(html.indexOf('Термопреобразователь сопротивления') !== -1, 'принцип ТС');
        assertTrue(html.indexOf('R(t) = R₀·(1 + α·t)') !== -1, 'формула медных ТС');
        assertTrue(html.indexOf('ГОСТ 6651-2009') !== -1, 'ГОСТ ТС');
        assertTrue(html.indexOf('IEC 60751') !== -1, 'IEC 60751 (Pt)');
        assertTrue(html.indexOf('R₀ = 100 Ом') !== -1, 'параметры датчика');
        // ЧУЖОЙ информации быть не должно (заявка Task 372)
        assertTrue(html.indexOf('Термопара') === -1, 'нет слова «Термопара»');
        assertTrue(html.indexOf('термо-ЭДС') === -1, 'нет термо-ЭДС');
        assertTrue(html.indexOf('ГОСТ Р 8.585-2001') === -1, 'нет ГОСТ термопар');
        assertTrue(html.indexOf('эффект Зеебека') === -1, 'нет эффекта Зеебека');
    });

    test('ТП: есть информация о термопарах, НЕТ — о термометрах', () => {
        const vmw = makeVm();
        const sel = vmw.api.tempSensorFindByKey('tc_K');
        const html = vmw.api.tempSensorInfoHtml(sel);
        assertTrue(html.indexOf('Термопара (ТП)') !== -1, 'принцип ТП');
        assertTrue(html.indexOf('термо-ЭДС') !== -1, 'термо-ЭДС');
        assertTrue(html.indexOf('эффект Зеебека') !== -1, 'эффект Зеебека');
        assertTrue(html.indexOf('ГОСТ Р 8.585-2001') !== -1, 'ГОСТ ТП');
        assertTrue(html.indexOf('E(t) = Σ cᵢ·tⁱ') !== -1, 'полином НИСТ');
        assertTrue(html.indexOf('хромель-алюмель') !== -1, 'электроды датчика');
        // ЧУЖОЙ информации быть не должно (заявка Task 372)
        assertTrue(html.indexOf('Термопреобразователь') === -1, 'нет «Термопреобразователь»');
        assertTrue(html.indexOf('сопротивления чувствительного элемента') === -1, 'нет принципа ТС');
        assertTrue(html.indexOf('ГОСТ 6651-2009') === -1, 'нет ГОСТ ТС');
        assertTrue(html.indexOf('IEC 60751') === -1, 'нет IEC 60751');
        assertTrue(html.indexOf('R(t)') === -1, 'нет формул R(t)');
    });

    test('Справка у каждого датчика: все 16 ключей дают непустой блок', () => {
        const vmw = makeVm();
        vmw.api.getTempSensorCatalog().forEach(s => {
            const html = vmw.api.tempSensorInfoHtml(s);
            assertTrue(html.length > 200, 'справка непустая: ' + s.key);
            assertTrue(html.indexOf('Нормативные документы') !== -1, 'есть нормативы: ' + s.key);
        });
    });
});

// ============================================================
// D. VM — расчёт по выбранному датчику (состояние)
// ============================================================
// Поля живого пересчёта (Task 371) — явное создание в mock-DOM
function makeQueryEls(vmw) {
    vmw.els['tempQueryTemp'] = { value: '', style: {} };
    vmw.els['tempQueryVal'] = { value: '', style: {} };
}

describe('Task 372 — VM: расчёт по выбранному датчику', () => {

    test('calcTempSensor без выбора — тост «Выберите датчик температуры»', () => {
        const vmw = makeVm();
        vmw.els['temp_sensor_min'] = { value: '0', style: {} };
        vmw.els['temp_sensor_max'] = { value: '100', style: {} };
        vmw.els['temp_sensor_step'] = { value: '10', style: {} };
        vmw.api.calcTempSensor();
        assertTrue(vmw.toasts.length === 1 && vmw.toasts[0].indexOf('Выберите датчик') !== -1,
            'тост про выбор датчика');
    });

    test('ТС Cu50: таблица значений (Task 373: панель — статичная, НЕ в результатах)', () => {
        const vmw = makeVm();
        vmw.api.openTempSensor('cu50_1428');
        vmw.els['temp_sensor_min'].value = '0';
        vmw.els['temp_sensor_max'].value = '100';
        vmw.els['temp_sensor_step'].value = '50';
        vmw.api.calcTempSensor();
        const html = vmw.els['tempSensorResults'].innerHTML;
        assertTrue(html.indexOf('50М (Cu50)') !== -1, 'имя датчика в результатах');
        assertTrue(html.indexOf('60,7') !== -1, 'R(50) = 60,7 в таблице');
        assertTrue(html.indexOf('71,4') !== -1, 'R(100) = 71,4 в таблице');
        assertTrue(html.indexOf('id="tempTableContainer"') !== -1, 'таблица есть');
        assertTrue(html.indexOf('id="tempCustomCalcPanel"') === -1, 'Task 373: панели в результатах НЕТ (перенесена над форму)');
        assertTrue(html.indexOf('Расчёт произвольных значений') === -1, 'заголовка панели в результатах нет');
    });

    test('ТП K: таблица E(t) (Task 373: подписи панели — на странице, не в результатах)', () => {
        const vmw = makeVm();
        vmw.api.openTempSensor('tc_K');
        vmw.els['temp_sensor_min'].value = '0';
        vmw.els['temp_sensor_max'].value = '100';
        vmw.els['temp_sensor_step'].value = '100';
        vmw.api.calcTempSensor();
        const html = vmw.els['tempSensorResults'].innerHTML;
        assertTrue(html.indexOf('ТХА (K)') !== -1, 'имя термопары');
        assertTrue(html.indexOf('4,096') !== -1, 'E(100) ≈ 4,096 мВ');
        assertTrue(html.indexOf('id="tempCustomCalcPanel"') === -1, 'панели в результатах нет');
        // подпись панели на странице датчика переключена под тип ТП
        assertEqual(vmw.els['tempQueryValLabel'].textContent, 'Термо-ЭДС E(t), мВ', 'подпись ТП на статичной панели');
    });

    test('Живой пересчёт Task 371 — через состояние (tc_B)', () => {
        const vmw = makeVm();
        makeQueryEls(vmw);
        vmw.api.setSensor('tc_B');
        vmw.els['tempQueryTemp'].value = '1000';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '4,8343', 'E(1000) тип B');
        vmw.els['tempQueryVal'].value = '4,8343';
        vmw.els['tempQueryTemp'].value = '';
        vmw.api.tempQueryFromValue();
        const t = parseRu(vmw.els['tempQueryTemp'].value);
        assertTrue(Math.abs(t - 1000) < 0.01, 'инверсия ≈ 1000, получено ' + t);
    });

    test('Живой пересчёт Task 371 — через состояние (Pt100, ниже 0 °C)', () => {
        const vmw = makeVm();
        makeQueryEls(vmw);
        vmw.api.setSensor('pt100_1385');
        vmw.els['tempQueryTemp'].value = '-50';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '80,3063', 'R(−50) с членом C');
        vmw.els['tempQueryVal'].value = '80,3063';
        vmw.els['tempQueryTemp'].value = '';
        vmw.api.tempQueryFromValue();
        assertEqual(vmw.els['tempQueryTemp'].value, '-50', 'инверсия бисекцией');
    });

    test('Тост вне диапазона НСХ — с единицей выбранного типа', () => {
        const vmw = makeVm();
        makeQueryEls(vmw);
        vmw.api.setSensor('cu50_1428');
        vmw.els['tempQueryVal'].value = '10';
        vmw.api.tempQueryFromValue();
        assertTrue(vmw.toasts.length === 1 && vmw.toasts[0].indexOf('Ом') !== -1,
            'единица Ом для ТС');
        const vmw2 = makeVm();
        makeQueryEls(vmw2);
        vmw2.api.setSensor('tc_K');
        vmw2.els['tempQueryVal'].value = '100';
        vmw2.api.tempQueryFromValue();
        assertTrue(vmw2.toasts.length === 1 && vmw2.toasts[0].indexOf('мВ') !== -1,
            'единица мВ для ТП');
    });
});

// ============================================================
// E. SW v601 (guard v602)
// ============================================================
describe('Task 372 — SW: версия кэша kipia-test-v757', () => {

    test('CACHE_VERSION = kipia-test-v757', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v757'") !== -1,
            'SW бампнут до v601');
    });

    test('Guard: v605 ещё не существует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v758') === -1,
            'v602 не должен существовать (следующий бамп)');
    });
});
