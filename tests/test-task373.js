// tests/test-task373.js
// Task 373: заявка пользователя — «В мобильной версии, на странице со
//   списком датчиков температуры карточки датчиков сделай столбиком по
//   одной в строке и растяни на всю строку по горизонтали с не большими
//   отступами по краям. В обоих версиях, добавь возможность добавлять
//   их в список избранных, по примеру как в хозрасчётных расходомерах.
//   Также убери сокращения бейджи "ТС" и "ТП" на цветных фонах из
//   карточек и из полных карточек. Так же добавь в список термопару
//   хромель-капель ТХК. В полных карточках, форму расчёта произвольных
//   значений сделай сразу над формой выбора предела измерений и шага
//   таблицы, что бы она всегда отображалась, а старую форму расчёта
//   произвольных значений под расчётной таблицей убери.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — мобильная сетка 1fr + отступы .ts-page; бейджи ТС/ТП
//      убраны из карточек и чипа (в заголовках групп остались); табы
//      «Все / Избранные»; TempFav (localStorage kip8_temp_fav_v1);
//      звёзды на карточках и в шапке страницы датчика; статичная
//      панель «Расчёт произвольных значений» НАД формой выбора
//      диапазона/шага; calcTempSensor не генерирует панель;
//      ТХК (L) в карте/каталоге/справке.
//   B. VM — calcTcVoltage('L'): контрольные точки ГОСТ Р 8.585-2001
//      (таблица: −200…800 °C) и калькулятора-эталона; монотонность.
//   C. VM — каталог: 17 датчиков (8 ТС + 9 ТП), tc_L после tc_E.
//   D. VM — TempFav: add/remove/toggle/has/count + persistence.
//   E. VM — карточки: звёзды, режим «Избранные», пустое состояние,
//      счётчики; openTempSensor: подписи панели, чип без бейджа,
//      звезда в шапке; живой расчёт L; результаты без панели.
//   F. SW v602 (guard v603).
//
// Task 490 (адаптация): мобильная сетка — кнопки по ДВЕ в строке
// (пары с одинаковой градуировкой рядом), на кнопках ТС только
// градуировка+α (скрыты аналог/R₀/диапазон), порядок ТП:
// K,L,J,T,E,N,R,S,B (ТХА (K)+ТХК (L) вместе).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue, assertFalse, assertApprox } = require('./test-helpers.js');
const { extractFunctions } = require('./extract-functions.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

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

// Извлечение исходника var-объекта «var TempFav={...};» (баланс скобок)
function grabTempFav() {
    const start = INDEX_SRC.indexOf('var TempFav={');
    if (start === -1) return null;
    const braceStart = INDEX_SRC.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < INDEX_SRC.length; i++) {
        if (INDEX_SRC[i] === '{') depth++;
        else if (INDEX_SRC[i] === '}') {
            depth--;
            if (depth === 0) return INDEX_SRC.slice(start, i + 2); // с «;»
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
// A. SRC — вёрстка, CSS, реестры
// ============================================================
describe('Task 373 — SRC: мобильные карточки и бейджи', () => {

    test('Мобильная сетка: кнопки по ДВЕ в строке (Task 490)', () => {
        assertTrue(INDEX_SRC.indexOf('@media (max-width: 1023px) { .ts-cards-grid { grid-template-columns: 1fr; } }') === -1,
            'одна колонка ниже 1024px удалена (Task 490: по две)');
        assertTrue(INDEX_SRC.indexOf('.ts-cards-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }') !== -1,
            'две колонки ниже 1024px');
        assertTrue(INDEX_SRC.indexOf('.ts-card .ts-card-name-analog, .ts-card .ts-card-r0, .ts-card .ts-card-meta-sep, .ts-card .ts-card-range, .ts-card-tc .ts-card-meta { display: none; }') !== -1,
            'на мобильном скрыты аналог, R₀, диапазон и материал ТП');
        assertTrue(INDEX_SRC.indexOf('.ts-cards-grid > .ts-card:nth-child(odd):last-child { grid-column: 1 / -1; }') !== -1,
            'последняя непарная кнопка — во всю строку');
        assertTrue(INDEX_SRC.indexOf('.ts-cards-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }') === -1,
            'старое правило мобильной сетки удалено');
        assertTrue(INDEX_SRC.indexOf('repeat(auto-fill, minmax(240px, 1fr))') !== -1,
            'десктопная сетка не тронута');
    });

    test('Небольшие отступы по краям: .ts-page padding 12px', () => {
        assertTrue(INDEX_SRC.indexOf('.ts-page { padding: 4px 12px 12px;') !== -1,
            'горизонтальный отступ 12px');
    });

    test('Бейджи ТС/ТП убраны из карточек и полных карточек', () => {
        assertTrue(INDEX_SRC.indexOf('ts-card-badge-rtd') === -1, 'нет класса rtd-бейджа');
        assertTrue(INDEX_SRC.indexOf('ts-card-badge-tc') === -1, 'нет класса tc-бейджа');
        assertTrue(INDEX_SRC.indexOf('class="ts-card-badge') === -1, 'нет использования в разметке');
        // в заголовках групп бейджи остались (не карточки)
        assertTrue(INDEX_SRC.indexOf('.ts-group-badge-rtd') !== -1, 'групповой бейдж ТС на месте');
        assertTrue(INDEX_SRC.indexOf('.ts-group-badge-tc') !== -1, 'групповой бейдж ТП на месте');
        // Task 495: чип удалён — openTempSensor его не заполняет
        const fn = grabFn('openTempSensor');
        assertTrue(fn.indexOf('ts-view-chip-name') === -1,
            'Task 495: заполнение чипа удалено из openTempSensor');
        assertTrue(fn.indexOf('ts-card-badge') === -1, 'бейджей нет');
    });
});

describe('Task 373 — SRC: избранное (по примеру расходомеров)', () => {

    test('Табы «Все / Избранные» на странице выбора', () => {
        const b = pageBlock('temp-sensors');
        assertTrue(b !== null, 'страница есть');
        assertTrue(b.indexOf('data-ts-tab="all"') !== -1, 'таб «Все»');
        assertTrue(b.indexOf('data-ts-tab="fav"') !== -1, 'таб «Избранные»');
        assertTrue(b.indexOf("setTempSensorsTab('all')") !== -1, 'обработчик «Все»');
        assertTrue(b.indexOf("setTempSensorsTab('fav')") !== -1, 'обработчик «Избранные»');
        assertTrue(b.indexOf('id="tsAllCount"') !== -1, 'счётчик «Все»');
        assertTrue(b.indexOf('id="tsFavCount"') !== -1, 'счётчик «Избранные»');
        assertTrue(b.indexOf('id="tsRtdGroupTitle"') !== -1, 'заголовок группы ТС (для скрытия пустых)');
        assertTrue(b.indexOf('id="tsTcGroupTitle"') !== -1, 'заголовок группы ТП');
    });

    test('TempFav — изолированный localStorage-ключ и API', () => {
        const fav = grabTempFav();
        assertTrue(fav !== null, 'var TempFav объявлен');
        assertTrue(fav.indexOf("kip8_temp_fav_v1") !== -1, 'ключ kip8_temp_fav_v1');
        assertTrue(fav.indexOf('kip8_flow_fav_v1') === -1, 'НЕ общий с расходомерами');
        for (const m of ['has:function', 'add:function', 'remove:function', 'toggle:function', 'count:function']) {
            assertTrue(fav.indexOf(m) !== -1, 'метод ' + m);
        }
    });

    test('Звезда на карточке списка и в шапке страницы датчика', () => {
        const fn = grabFn('renderTempSensorCards');
        assertTrue(fn.indexOf('ts-card-fav-btn') !== -1, 'звезда на карточке');
        assertTrue(fn.indexOf('event.stopPropagation(); toggleTempSensorFav(') !== -1,
            'stopPropagation — клик по звезде не открывает датчик');
        const b = pageBlock('temp-sensor-view');
        assertTrue(b.indexOf('id="tempSensorFavBtn"') !== -1, 'кнопка в шапке');
        assertTrue(b.indexOf('toggleTempSensorFavFromView()') !== -1, 'обработчик в шапке');
        assertTrue(INDEX_SRC.indexOf('.ts-card-fav-btn {') !== -1, 'CSS звезды карточки');
        assertTrue(INDEX_SRC.indexOf('#tempSensorFavBtn {') !== -1, 'CSS звезды шапки');
    });

    test('Рендер перерисовывается (идемпотентность убрана)', () => {
        const fn = grabFn('renderTempSensorCards');
        assertTrue(fn.indexOf('children.length&&tcBox.children.length') === -1,
            'guard повторного рендера удалён');
        assertTrue(fn.indexOf('TempFav.has(s.key)') !== -1, 'фильтр по избранному');
        assertTrue(fn.indexOf('ts-empty-fav') !== -1, 'пустое состояние избранного');
        assertTrue(fn.indexOf('Нет избранных датчиков') !== -1, 'текст заглушки');
    });
});

describe('Task 373 — SRC: панель расчёта над формой + ТХК (L)', () => {

    test('Панель «Расчёт произвольных значений» — статичная, НАД формой', () => {
        const b = pageBlock('temp-sensor-view');
        assertTrue(b !== null, 'страница есть');
        const iPanel = b.indexOf('id="tempCustomCalcPanel"');
        const iRange = b.indexOf('id="temp_sensor_min"');
        const iStep = b.indexOf('id="temp_sensor_step"');
        assertTrue(iPanel !== -1, 'панель в статичной разметке');
        assertTrue(iRange !== -1 && iStep !== -1, 'форма диапазона/шага на месте');
        assertTrue(iPanel < iRange && iPanel < iStep, 'панель НАД формой выбора');
        assertTrue(b.indexOf('ts-calc-panel') !== -1, 'класс ts-calc-panel');
        assertTrue(b.indexOf('id="tempQueryValLabel"') !== -1, 'подпись второго поля (меняется под тип)');
        assertTrue(b.indexOf('oninput="tempQueryFromTemp()"') !== -1, 'живой расчёт t→значение');
        assertTrue(b.indexOf('oninput="tempQueryFromValue()"') !== -1, 'живой расчёт значение→t');
        // Task 494 (адаптация): подсказка панели УДАЛЕНА по заявке
        assertTrue(b.indexOf('Введите значение в любое поле') === -1,
            'Task 494: подсказки панели НЕТ (удалена)');
    });

    test('Старая панель под таблицей удалена', () => {
        assertTrue(INDEX_SRC.indexOf('function tempCustomCalcHtml') === -1,
            'функция-генератор удалена');
        const fn = grabFn('calcTempSensor');
        assertTrue(fn.indexOf('tempCustomCalcHtml') === -1,
            'calcTempSensor не генерирует панель');
    });

    test('ТХК (L) — хромель-копель в карте, каталоге и справке', () => {
        assertTrue(grabFn('getTcSensorMap').indexOf("L:'ТХК (L)'") !== -1, 'карта типов ТП');
        const cat = grabFn('getTempSensorCatalog');
        assertTrue(cat.indexOf("L:{mat:'хромель-копель',r:[-200,800]}") !== -1, 'каталог: электроды и диапазон');
        assertTrue(cat.indexOf("['K','L','J','T','E','N','R','S','B']") !== -1, 'порядок: K+L вместе (Task 490)');
        const v = grabFn('calcTcVoltage');
        assertTrue(v.indexOf("type==='L'") !== -1, 'ветка L в calcTcVoltage');
        assertTrue(v.indexOf('6.3307953909e-2') !== -1, 'коэффициент c1 (диапазон ≥0)');
        assertTrue(v.indexOf('6.3326208351e-2') !== -1, 'коэффициент c1 (диапазон <0)');
        assertTrue(v.indexOf('-2.0259856006e-22') !== -1, 'старший коэффициент');
        const info = grabFn('tempSensorInfoHtml');
        assertTrue(info.indexOf('ТХК (L) есть только в ГОСТ') !== -1, 'справка: тип только в ГОСТ');
        assertTrue(info.indexOf('ТХА (K), ТХК (L), ТЖК (J)') !== -1, 'список типов с ТХК (L)');
    });

    test('openTempSensor задаёт подписи панели под тип датчика', () => {
        const fn = grabFn('openTempSensor');
        assertTrue(fn.indexOf('Сопротивление R(t), Ом') !== -1, 'подпись ТС');
        assertTrue(fn.indexOf('Термо-ЭДС E(t), мВ') !== -1, 'подпись ТП');
        // Task 499: подсказки диапазонов — плейсхолдеры полей
        assertTrue(fn.indexOf('tInp.placeholder=fmtI499(rng499.min)') !== -1,
            'плейсхолдер температуры (Task 499)');
        assertTrue(fn.indexOf('vInp.placeholder=fmtM499(vmin499)') !== -1,
            'плейсхолдер значения (Task 499)');
        assertTrue(fn.indexOf('updateTempSensorFavBtn()') !== -1, 'звезда шапки обновляется');
    });

    test('Маркеры Task 373 в коде', () => {
        assertTrue((INDEX_SRC.match(/Task 373/g) || []).length >= 12,
            'комментарии-маркеры Task 373');
    });
});

// ============================================================
// B. VM — ТХК (L): полиномы против таблицы ГОСТ и эталона
// ============================================================
const fns = extractFunctions();

describe('Task 373 — VM: calcTcVoltage для ТХК (L), ГОСТ Р 8.585-2001', () => {

    // Таблица НСХ ГОСТ Р 8.585-2001 (тип L, хромель-копель), мВ
    const GOST = [
        [-200, -9.488], [-100, -5.641], [0, 0.000], [100, 6.862], [200, 14.560],
        [300, 22.843], [400, 31.492], [500, 40.299], [600, 49.108],
        [700, 57.859], [800, 66.466],
    ];

    test('Контрольные точки таблицы ГОСТ (точность 0,002 мВ)', () => {
        for (const [t, e] of GOST) {
            assertApprox(fns.calcTcVoltage(t, 'L'), e, 0.002,
                'E(' + t + '°C) = ' + e + ' мВ');
        }
    });

    test('Промежуточные точки (сверка с эталонным калькулятором ГОСТ 8.585)', () => {
        // значения независимо вычислены по полиному стандарта
        assertApprox(fns.calcTcVoltage(42, 'L'), 2.7595, 0.002, 'E(42)');
        assertApprox(fns.calcTcVoltage(555, 'L'), 45.1498, 0.002, 'E(555)');
        assertApprox(fns.calcTcVoltage(-137, 'L'), -7.3094, 0.002, 'E(−137)');
        assertApprox(fns.calcTcVoltage(317, 'L'), 24.2933, 0.002, 'E(317)');
        assertApprox(fns.calcTcVoltage(777, 'L'), 64.5152, 0.002, 'E(777)');
        assertApprox(fns.calcTcVoltage(-53, 'L'), -3.1744, 0.002, 'E(−53)');
    });

    test('E(0 °C) = 0 (стык диапазонов)', () => {
        assertApprox(fns.calcTcVoltage(0, 'L'), 0, 0.0001, 'E(0)');
    });

    test('Монотонно возрастает по всему диапазону −200…800 °C', () => {
        let prev = -Infinity;
        for (let t = -200; t <= 800; t += 10) {
            const e = fns.calcTcVoltage(t, 'L');
            assertTrue(e > prev, 'E должно возрастать при t=' + t);
            prev = e;
        }
    });
});

// ============================================================
// C–E. VM — каталог, TempFav, карточки, страница датчика
// ============================================================
function makeStorage() {
    const store = {};
    return {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
        _dump: () => store,
    };
}

function makeVm373() {
    const els = {};
    const mkEl = () => ({
        value: '', style: {}, innerHTML: '', textContent: '',
        scrollIntoView: () => {}, children: [],
        _attrs: {},
        setAttribute(k, v) { this._attrs[k] = String(v); },
        getAttribute(k) { return (k in this._attrs) ? this._attrs[k] : null; },
        _cls: {},
        classList: {
            toggle(c, on) { this._own[c] = on; },
            contains(c) { return !!this._own[c]; },
            _own: {},
        },
    });
    const document = {
        getElementById: id => (els[id] || (els[id] = mkEl())),
        querySelectorAll: () => [],
    };
    const toasts = [];
    const nav = [];
    const ctx = {
        document,
        localStorage: makeStorage(),
        showToast: m => toasts.push(String(m)),
        parseLocaleNumber: fns.parseLocaleNumber,
        formatNumber: fns.formatNumber,
        calcCuResistance: fns.calcCuResistance,
        calcRtdResistance: fns.calcRtdResistance,
        calcTcVoltage: fns.calcTcVoltage,
        setTimeout: () => 0,
        navigator: {},
        navigateTo: p => nav.push(p),
    };
    vm.createContext(ctx);
    const tempFavSrc = grabTempFav();
    const code = ['getRtdSensorMap', 'getTcSensorMap', 'getTempSensorCatalog',
                  'tempSensorFindByKey', 'renderTempSensorCards', 'setTempSensorsTab',
                  'toggleTempSensorFav', 'toggleTempSensorFavFromView',
                  'updateTempSensorFavBtn', 'openTempSensor', 'tempSensorInfoHtml',
                  'getTempSensorRange', 'tempCalcForwardValue', 'tempCalcInvertValue',
                  'tempQueryFromTemp', 'tempQueryFromValue', 'calcTempSensor']
        .map(grabFn).join('\n');
    vm.runInContext('var tempSensorKey=null; var tempSensorsTab=\'all\';\n' + tempFavSrc + '\n' + code +
        '\n;globalThis.__api = { TempFav, renderTempSensorCards, setTempSensorsTab: setTempSensorsTab,' +
        ' toggleTempSensorFav, toggleTempSensorFavFromView, updateTempSensorFavBtn,' +
        ' openTempSensor, tempSensorInfoHtml, getTempSensorCatalog, tempSensorFindByKey,' +
        ' tempQueryFromTemp, tempQueryFromValue, calcTempSensor,' +
        ' setSensor: function(k){ tempSensorKey = k; },' +
        ' setTab: function(t){ tempSensorsTab = t; },' +
        ' getTab: function(){ return tempSensorsTab; },' +
        ' touch: function(id){ return document.getElementById(id); } };', ctx);
    return { els, toasts, nav, api: ctx.__api, storage: ctx.localStorage };
}

describe('Task 373 — VM: каталог с ТХК (L)', () => {

    test('17 датчиков: 8 ТС + 9 ТП', () => {
        const vmw = makeVm373();
        const cat = vmw.api.getTempSensorCatalog();
        assertEqual(cat.length, 17, 'всего 17 датчиков');
        assertEqual(cat.filter(s => s.kind === 'rtd').length, 8, '8 ТС');
        assertEqual(cat.filter(s => s.kind === 'tc').length, 9, '9 ТП (добавлена L)');
    });

    test('tc_L: имя, электроды, диапазон, позиция после ТХА (K) (Task 490)', () => {
        const vmw = makeVm373();
        const cat = vmw.api.getTempSensorCatalog();
        const byKey = {};
        cat.forEach((s, i) => { s.idx = i; byKey[s.key] = s; });
        const L = byKey['tc_L'];
        assertTrue(L !== undefined, 'tc_L в каталоге');
        assertEqual(L.name, 'ТХК (L)', 'имя');
        assertEqual(L.meta, 'хромель-копель', 'электроды');
        assertEqual(JSON.stringify(L.range), '{"min":-200,"max":800}', 'диапазон НСХ');
        assertEqual(L.kind, 'tc', 'вид: термопара');
        assertEqual(byKey['tc_K'].idx + 1, L.idx, 'L сразу после K (Task 490)');
        assertEqual(cat[16].key, 'tc_B', 'последний — ТПР (B)');
    });

    test('Справка ТХК (L): только ГОСТ, без ссылки на полиномы НИСТ', () => {
        const vmw = makeVm373();
        const sel = vmw.api.tempSensorFindByKey('tc_L');
        const html = vmw.api.tempSensorInfoHtml(sel);
        assertTrue(html.indexOf('ТХК (L)') !== -1, 'имя типа в справке');
        assertTrue(html.indexOf('хромель-копель') !== -1, 'электроды');
        assertTrue(html.indexOf('только в ГОСТ') !== -1, 'тип есть только в ГОСТ');
        assertTrue(html.indexOf('−200…800') !== -1 || html.indexOf('-200…800') !== -1, 'диапазон');
        // чужой информации (как в Task 372) по-прежнему нет
        assertTrue(html.indexOf('Термопреобразователь') === -1, 'нет информации о ТС');
    });
});

describe('Task 373 — VM: TempFav — избранное с persistence', () => {

    test('add/has/count/remove/toggle', () => {
        const vmw = makeVm373();
        const F = vmw.api.TempFav;
        assertEqual(F.count(), 0, 'изначально пусто');
        assertFalse(F.has('tc_L'), 'tc_L не в избранном');
        assertTrue(F.add('tc_L'), 'add добавляет');
        assertTrue(F.has('tc_L'), 'tc_L в избранном');
        assertFalse(F.add('tc_L'), 'повторный add — false');
        assertEqual(F.count(), 1, 'счётчик 1');
        assertTrue(F.add('pt100_1385'), 'второй датчик');
        assertEqual(F.count(), 2, 'счётчик 2');
        assertTrue(F.remove('tc_L'), 'remove удаляет');
        assertFalse(F.remove('tc_L'), 'повторный remove — false');
        assertEqual(F.count(), 1, 'счётчик 1');
        // toggle: нет → есть → нет
        assertTrue(F.toggle('cu50_1428'), 'toggle добавляет');
        assertFalse(F.toggle('cu50_1428'), 'toggle убирает');
    });

    test('Persistence: ключ kip8_temp_fav_v1, чтение после «перезагрузки»', () => {
        const vmw = makeVm373();
        const F = vmw.api.TempFav;
        F.add('tc_L');
        F.add('pt100_1385');
        const dump = vmw.storage._dump();
        assertTrue('kip8_temp_fav_v1' in dump, 'запись в localStorage');
        const parsed = JSON.parse(dump['kip8_temp_fav_v1']);
        assertTrue(parsed.hasOwnProperty('tc_L') && parsed.hasOwnProperty('pt100_1385'),
            'оба ключа сохранены');
        // «перезагрузка»: сброс кэша → чтение из хранилища
        F._data = null;
        assertTrue(F.has('tc_L') && F.has('pt100_1385'), 'после сброса кэша — читается из localStorage');
        assertEqual(F.count(), 2, 'счётчик после перезагрузки');
    });
});

describe('Task 373 — VM: карточки — звёзды, таб «Избранные», заглушка', () => {

    test('Все 17 карточек со звёздочками, без бейджей ТС/ТП', () => {
        const vmw = makeVm373();
        vmw.api.renderTempSensorCards();
        const rtd = vmw.els['tsRtdCards'].innerHTML;
        const tc = vmw.els['tsTcCards'].innerHTML;
        assertEqual((rtd.match(/class="ts-card[ "]/g) || []).length, 8, '8 ТС-карточек');
        assertEqual((tc.match(/class="ts-card ts-card-tc[ "]/g) || []).length, 9, '9 ТП-карточек');
        const all = rtd + tc;
        assertEqual((all.match(/ts-card-fav-btn/g) || []).length, 17, 'звёздочка на каждой карточке');
        assertTrue(all.indexOf('>ТС</span>') === -1, 'бейджа ТС нет');
        assertTrue(all.indexOf('>ТП</span>') === -1, 'бейджа ТП нет');
        assertTrue(all.indexOf('>☆</button>') !== -1, 'неактивная звезда ☆');
        assertEqual(vmw.els['tsAllCount'].textContent, '17', 'счётчик «Все» = 17');
        assertEqual(vmw.els['tsFavCount'].textContent, '0', 'счётчик «Избранные» = 0');
        // ТХК (L) в списке
        assertTrue(tc.indexOf('ТХК (L)') !== -1, 'карточка ТХК (L)');
        assertTrue(tc.indexOf('хромель-копель') !== -1, 'электроды на карточке');
        assertTrue(tc.indexOf('НСХ: −200…800 °C') !== -1, 'диапазон на карточке');
    });

    test('Избранные: ★ на карточке, счётчик, перерисовка', () => {
        const vmw = makeVm373();
        vmw.api.renderTempSensorCards();
        assertFalse(vmw.els['tsRtdCards'].innerHTML.indexOf('★') !== -1, 'изначально звёзды пустые');
        vmw.api.TempFav.add('pt100_1385');
        vmw.api.TempFav.add('tc_L');
        vmw.api.renderTempSensorCards();
        assertEqual(vmw.els['tsFavCount'].textContent, '2', 'счётчик «Избранные» = 2');
        assertTrue(vmw.els['tsRtdCards'].innerHTML.indexOf('★') !== -1, '★ у Pt100');
        assertTrue(vmw.els['tsTcCards'].innerHTML.indexOf('★') !== -1, '★ у ТХК (L)');
    });

    test('Таб «Избранные»: только избранные, пустые группы скрыты', () => {
        const vmw = makeVm373();
        vmw.api.TempFav.add('pt100_1385');
        vmw.api.TempFav.add('tc_L');
        vmw.api.setTab('fav');
        vmw.api.renderTempSensorCards();
        const rtd = vmw.els['tsRtdCards'].innerHTML;
        const tc = vmw.els['tsTcCards'].innerHTML;
        assertEqual((rtd.match(/class="ts-card[ "]/g) || []).length, 1, '1 ТС (Pt100)');
        assertEqual((tc.match(/class="ts-card ts-card-tc[ "]/g) || []).length, 1, '1 ТП (ТХК L)');
        assertTrue(rtd.indexOf('Pt100 (IEC)') !== -1, 'карточка Pt100');
        assertTrue(tc.indexOf('ТХК (L)') !== -1, 'карточка ТХК (L)');
        // обе группы непустые — заголовки видимы
        assertEqual(vmw.els['tsRtdGroupTitle'].style.display, '', 'заголовок ТС виден');
        assertEqual(vmw.els['tsTcGroupTitle'].style.display, '', 'заголовок ТП виден');
        // уберём ТС из избранного — заголовок ТС скроется
        vmw.api.TempFav.remove('pt100_1385');
        vmw.api.renderTempSensorCards();
        assertEqual((vmw.els['tsRtdCards'].innerHTML.match(/class="ts-card[ "]/g) || []).length, 0, 'ТС-карточек нет');
        assertEqual(vmw.els['tsRtdGroupTitle'].style.display, 'none', 'заголовок ТС скрыт');
        assertEqual(vmw.els['tsTcGroupTitle'].style.display, '', 'заголовок ТП виден');
    });

    test('Таб «Избранные» без избранного: заглушка', () => {
        const vmw = makeVm373();
        vmw.api.setTab('fav');
        vmw.api.renderTempSensorCards();
        assertTrue(vmw.els['tsRtdCards'].innerHTML.indexOf('Нет избранных датчиков') !== -1,
            'текст заглушки');
        assertTrue(vmw.els['tsRtdCards'].innerHTML.indexOf('ts-empty-fav') !== -1,
            'класс заглушки');
        assertEqual(vmw.els['tsRtdGroupTitle'].style.display, 'none', 'заголовок ТС скрыт');
        assertEqual(vmw.els['tsTcGroupTitle'].style.display, 'none', 'заголовок ТП скрыт');
    });

    test('setTempSensorsTab: переключение состояния и повторный рендер', () => {
        const vmw = makeVm373();
        vmw.api.renderTempSensorCards();
        vmw.api.setTempSensorsTab('fav');
        assertEqual(vmw.api.getTab(), 'fav', 'таб переключён');
        assertTrue(vmw.els['tsRtdCards'].innerHTML.indexOf('Нет избранных датчиков') !== -1,
            'перерисовка в режиме «Избранные»');
        vmw.api.setTempSensorsTab('all');
        assertEqual(vmw.api.getTab(), 'all', 'таб обратно');
        assertEqual((vmw.els['tsRtdCards'].innerHTML.match(/class="ts-card[ "]/g) || []).length, 8,
            'снова все 8 ТС');
    });

    test('toggleTempSensorFav: переключение и синхронизация звёзд', () => {
        const vmw = makeVm373();
        vmw.api.renderTempSensorCards();
        vmw.api.toggleTempSensorFav('tc_L');
        assertTrue(vmw.api.TempFav.has('tc_L'), 'tc_L в избранном');
        assertTrue(vmw.els['tsTcCards'].innerHTML.indexOf('★') !== -1, '★ после toggle без явного рендера');
        assertEqual(vmw.els['tsFavCount'].textContent, '1', 'счётчик обновлён');
        vmw.api.toggleTempSensorFav('tc_L');
        assertFalse(vmw.api.TempFav.has('tc_L'), 'tc_L убран');
        assertFalse(vmw.els['tsTcCards'].innerHTML.indexOf('★') !== -1, 'звезда снова пустая');
    });
});

describe('Task 373 — VM: страница датчика — панель, звезда, живой расчёт L', () => {

    test('openTempSensor(tc_L): заголовок, подпись «Термо-ЭДС», поля очищены', () => {
        const vmw = makeVm373();
        // первый заход создаёт поля панели; затем «введём» значения —
        // повторное открытие должно их сбросить
        vmw.api.openTempSensor('cu50_1428');
        vmw.els['tempQueryTemp'].value = '55';
        vmw.els['tempQueryVal'].value = '61,77';
        vmw.api.openTempSensor('tc_L');
        assertEqual(vmw.nav[vmw.nav.length - 1], 'temp-sensor-view', 'переход на страницу датчика');
        assertEqual(vmw.els['tempSensorViewTitle'].textContent, 'ТХК (L)', 'заголовок');
        assertEqual(vmw.els['tempQueryValLabel'].textContent, 'Термо-ЭДС E(t), мВ', 'подпись ТП');
        assertEqual(vmw.els['tempQueryVal'].placeholder, '−9,4881…66,4659 мВ',
            'Task 499: диапазон НСХ L в поле (бледный плейсхолдер)');
        assertEqual(vmw.els['tempQueryTemp'].value, '', 'поле t очищено');
        assertEqual(vmw.els['tempQueryVal'].value, '', 'поле E очищено');
        // Task 495: чип удалён — ключа в els нет
        assertFalse('tempSensorViewChip' in vmw.els,
            'Task 495: чип удалён из блока ввода');
    });

    test('openTempSensor(ТС): подпись «Сопротивление»', () => {
        const vmw = makeVm373();
        vmw.api.openTempSensor('cu50_1428');
        assertEqual(vmw.els['tempQueryValLabel'].textContent, 'Сопротивление R(t), Ом', 'подпись ТС');
        assertEqual(vmw.els['tempQueryVal'].placeholder, '10,2642…92,8 Ом',
            'Task 499: диапазон НСХ Cu50 в поле (−180…+200, ГОСТ 5.2.3)');
    });

    test('Звезда в шапке: синхронизация с TempFav', () => {
        const vmw = makeVm373();
        vmw.api.openTempSensor('tc_L');
        assertEqual(vmw.els['tempSensorFavBtn'].textContent, '☆', 'не в избранном — ☆');
        vmw.api.toggleTempSensorFavFromView();
        assertEqual(vmw.els['tempSensorFavBtn'].textContent, '★', 'в избранном — ★');
        assertTrue(vmw.api.TempFav.has('tc_L'), 'TempFav: tc_L добавлен из шапки');
        vmw.api.toggleTempSensorFavFromView();
        assertEqual(vmw.els['tempSensorFavBtn'].textContent, '☆', 'убрали — снова ☆');
        assertFalse(vmw.api.TempFav.has('tc_L'), 'TempFav: tc_L убран');
    });

    test('Живой расчёт ТХК (L): t=100 → 6,862 мВ и обратно', () => {
        const vmw = makeVm373();
        vmw.api.setSensor('tc_L');
        vmw.api.touch('tempQueryTemp');
        vmw.api.touch('tempQueryVal');
        vmw.els['tempQueryTemp'].value = '100';
        vmw.api.tempQueryFromTemp();
        const e = parseRu(vmw.els['tempQueryVal'].value);
        assertTrue(Math.abs(e - 6.862) < 0.005, 'E(100) ≈ 6,862, получено ' + e);
        vmw.els['tempQueryVal'].value = '6,862';
        vmw.els['tempQueryTemp'].value = '';
        vmw.api.tempQueryFromValue();
        const t = parseRu(vmw.els['tempQueryTemp'].value);
        assertTrue(Math.abs(t - 100) < 0.05, 'инверсия ≈ 100, получено ' + t);
    });

    test('Живой расчёт ТХК (L): отрицательная температура −137 °C', () => {
        const vmw = makeVm373();
        vmw.api.setSensor('tc_L');
        vmw.api.touch('tempQueryTemp');
        vmw.api.touch('tempQueryVal');
        vmw.els['tempQueryTemp'].value = '-137';
        vmw.api.tempQueryFromTemp();
        const e = parseRu(vmw.els['tempQueryVal'].value);
        assertTrue(Math.abs(e - (-7.3094)) < 0.005, 'E(−137) ≈ −7,3094, получено ' + e);
    });

    test('Вне НСХ L: t=900 → тост, поле очищено', () => {
        const vmw = makeVm373();
        vmw.api.setSensor('tc_L');
        vmw.api.touch('tempQueryTemp');
        vmw.api.touch('tempQueryVal');
        vmw.els['tempQueryTemp'].value = '900';
        vmw.api.tempQueryFromTemp();
        assertEqual(vmw.els['tempQueryVal'].value, '', 'поле E очищено');
        assertTrue(vmw.toasts.length === 1 && vmw.toasts[0].indexOf('вне диапазона') !== -1,
            'тост о выходе за НСХ');
    });

    test('calcTempSensor: таблица ЕСТЬ, панели под таблицей НЕТ', () => {
        const vmw = makeVm373();
        vmw.api.openTempSensor('tc_L');
        vmw.els['temp_sensor_min'].value = '0';
        vmw.els['temp_sensor_max'].value = '100';
        vmw.els['temp_sensor_step'].value = '50';
        vmw.api.calcTempSensor();
        const html = vmw.els['tempSensorResults'].innerHTML;
        assertTrue(html.indexOf('id="tempTableContainer"') !== -1, 'таблица значений есть');
        assertTrue(html.indexOf('ТХК (L)') !== -1, 'имя термопары в результатах');
        assertTrue(html.indexOf('6,8617') !== -1, 'E(100) ≈ 6,8617 мВ в таблице');
        assertTrue(html.indexOf('id="tempCustomCalcPanel"') === -1, 'панель произвольных значений НЕ в результатах');
        assertTrue(html.indexOf('Расчёт произвольных значений') === -1, 'заголовка панели в результатах нет');
    });
});

// ============================================================
// F. SW v602 (guard v603)
// ============================================================
describe('Task 373 — SW: версия кэша kipia-test-v737', () => {

    test('CACHE_VERSION = kipia-test-v737', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v737'") !== -1,
            'SW бампнут до v602');
    });

    test('Guard: v605 ещё не существует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v738') === -1,
            'v603 не должен существовать (следующий бамп)');
    });
});
