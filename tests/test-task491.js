// tests/test-task491.js
// Task 491: заявка пользователя — «Поменяй на пары 50М+50М, 100М+100М.
//   И сделай шрифт и рамки кнопок 50М, 100М, ТХА(K), ТХК(L) побольше
//   и выдели их эффектом выступа. И сделай так, если пользователь
//   добавил избранное, то при открытии страницы должна открываться
//   сразу вкладка избранное, такой же принцип сделай в разделе
//   расходомеров хозрасчётных.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — каталог ТС: пары ОДИНАКОВЫХ градуировок 50М+50М (α 0,00428
//      и 0,00426), 100М+100М; 50П+100П и Pt100+Pt1000 не тронуты.
//   B. SRC — CSS .ts-card-feat (только в @media ≤1023px): рамка 2px
//      акцент, шрифт имени 19px (≤400px — 17px), meta 12px, эффект
//      выступа (внешняя тень снизу + inset-подсветка сверху и
//      затемнение снизу), :active — «утапливание» (translateY + тень
//      внутрь), светлая тема; десктопных featured-правил НЕТ.
//   C. SRC — рендер: класс ts-card-feat вешается на cu50_*/cu100_* и
//      tc_K/tc_L (условие в renderTempSensorCards).
//   D. SRC — автооткрытие вкладки «Избранное»: хук в navigateTo
//      ('temp-sensors': setTempSensorsTab(fav при TempFav.count()>0))
//      и в FlowmeterData.init (targetTab491 по FlowFav.count(),
//      синхронизация кнопок .flow-tab[data-flow-tab]).
//   E. VM — рендер: 4 ТС с ts-card-feat (обе 50М, обе 100М), 2 ТП
//      (ТХА (K), ТХК (L)); порядок ключей ТС в HTML; в режиме
//      «Избранные» featured-класс сохраняется, у не-популярных его нет.
//   F. SW v715 (guard v716).
//
// ADAPTATION Task 492 (заявка: «Оформление кнопок верни как прежде,
//   но шрифт текста оставь как есть и сделай такой же на остальных
//   кнопках, и оформление кнопок добавленных в избранное сделай как
//   сейчас выделенным»): featured-ОФОРМЛЕНИЕ (ts-card-feat: рамка 2px,
//   градиент, эффект выступа) теперь вешается по isFav (избранное),
//   НЕ по популярным градуировкам; КРУПНЫЙ ШРИФТ (19/12, ≤400px 17)
//   перенесён в базовые правила .ts-card-name/.ts-card-meta мобильного
//   блока — правила «.ts-card-feat имя/meta» УДАЛЕНЫ; каталог (пары
//   50М+50М/100М+100М) и автооткрытие «Избранного» НЕ тронуты. В этом
//   файле тесты B/C/E переписаны под новую семантику; SW — v716.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

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

function makeStorage() {
    const store = {};
    return {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
    };
}

// VM как в test-task490: рендер карточек в псевдо-DOM
function makeVm491() {
    const els = {};
    const mkEl = () => ({
        value: '', style: {}, innerHTML: '', textContent: '',
        scrollIntoView: () => {}, children: [],
        _attrs: {},
        setAttribute(k, v) { this._attrs[k] = String(v); },
        getAttribute(k) { return (k in this._attrs) ? this._attrs[k] : null; },
        classList: { toggle() {}, contains() { return false; } }
    });
    const document = {
        getElementById: id => (els[id] || (els[id] = mkEl())),
        querySelectorAll: () => []
    };
    const toasts = [];
    const nav = [];
    const ctx = {
        document,
        localStorage: makeStorage(),
        showToast: m => toasts.push(String(m)),
        setTimeout: () => 0,
        navigator: {},
        navigateTo: p => nav.push(p)
    };
    vm.createContext(ctx);
    const code = ['getRtdSensorMap', 'getTcSensorMap', 'getTempSensorCatalog',
                  'renderTempSensorCards', 'setTempSensorsTab',
                  'toggleTempSensorFav', 'updateTempSensorFavBtn']
        .map(grabFn).join('\n');
    vm.runInContext('var tempSensorKey=null; var tempSensorsTab=\'all\';\n' +
        grabTempFav() + '\n' + code +
        '\n;globalThis.__api = { getTempSensorCatalog, renderTempSensorCards,' +
        ' setTempSensorsTab, TempFav };', ctx);
    return { els, toasts, nav, api: ctx.__api };
}

// Мобильный @media-блок (≤1023px) с сеткой ts-cards-grid: берём
// @media ПЕРЕД якорем сетки (в файле несколько блоков ≤1023px)
function mobileBlock() {
    const anchor = INDEX_SRC.indexOf('.ts-cards-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }');
    if (anchor === -1) return '';
    const i = INDEX_SRC.lastIndexOf('@media (max-width: 1023px)', anchor);
    if (i === -1) return '';
    const close = INDEX_SRC.indexOf('\n    }', i);
    return close === -1 ? '' : INDEX_SRC.slice(i, close);
}

// ============================================================
// A. SRC — каталог ТС: пары одинаковых градуировок
// ============================================================
describe('Task 491 — SRC: каталог ТС — 50М+50М, 100М+100М', () => {

    test('Каталог: новый порядок ТС (Task 491), старого нет', () => {
        const fn = grabFn('getTempSensorCatalog');
        assertTrue(fn !== null, 'функция объявлена');
        assertTrue(fn.indexOf("['cu50_1428','cu50_1426','cu100_1428','cu100_1426','pt50_1391','pt100_1391','pt100_1385','pt1000_1385']") !== -1,
            '50М+50М, 100М+100М, затем 50П+100П, Pt100+Pt1000');
        assertTrue(fn.indexOf("['cu50_1428','cu100_1428','cu50_1426','cu100_1426'") === -1,
            'старый порядок (50М+100М) удалён');
    });

    test('Комментарий каталога описывает пары Task 491', () => {
        assertTrue(INDEX_SRC.indexOf('// Task 491: порядок ТС — парами ОДИНАКОВЫХ градуировок (заявка):') !== -1,
            'комментарий про 50М+50М / 100М+100М');
        assertTrue(INDEX_SRC.indexOf('// 50М+50М (α 0,00428 и 0,00426), 100М+100М') !== -1,
            'в комментарии — обе 50М рядом (разные α)');
    });
});

// ============================================================
// B. SRC — CSS featured-кнопок (эффект выступа)
// ============================================================
describe('Task 491 — SRC: CSS .ts-card-feat — выступ и размеры', () => {

    test('Рамка 2px + акцент + крупнее паддинг', () => {
        const mob = mobileBlock();
        assertTrue(mob.indexOf('.ts-card-feat { padding: 12px 14px 13px; border: 2px solid rgba(255, 255, 255, 0.2);') !== -1,
            'рамка 2px, нейтральный цвет (Task 502: палитра снята), отступы крупнее');
    });

    test('Эффект выступа: внешняя тень снизу + inset-подсветка сверху/затемнение снизу', () => {
        const mob = mobileBlock();
        assertTrue(mob.indexOf('box-shadow: 0 5px 14px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 -3px 0 rgba(0, 0, 0, 0.3);') !== -1,
            'тень выступа (drop + inset сверху/снизу)');
        assertTrue(mob.indexOf('background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.01));') !== -1,
            'приподнятый градиент фона');
    });

    test('При нажатии кнопка «утапливается»', () => {
        const mob = mobileBlock();
        assertTrue(mob.indexOf('.ts-card-feat:active { transform: translateY(2px) scale(0.98);') !== -1,
            'сдвиг вниз при :active');
        assertTrue(mob.indexOf('box-shadow: 0 1px 4px rgba(0, 0, 0, 0.32), inset 0 2px 8px rgba(0, 0, 0, 0.35);') !== -1,
            'тень внутрь при :active');
    });

    test('Шрифт крупный: база 19px/12px у ВСЕХ кнопок (Task 492)', () => {
        // Task 492 (адаптация): правила «.ts-card-feat имя/meta» удалены —
        // крупный шрифт из Task 491 перенесён в базовые правила мобильного
        // блока (.ts-card-name 19px / .ts-card-meta 12px), т.е. у ВСЕХ
        // кнопок; ≤400px: имя 17px (базовое, бывшее featured)
        const mob = mobileBlock();
        assertTrue(mob.indexOf('.ts-card-name { font-size: 19px; }') !== -1,
            'имя 19px — база (Task 492)');
        assertTrue(mob.indexOf('.ts-card-meta { font-size: 12px; }') !== -1,
            'meta 12px — база (Task 492)');
        assertTrue(mob.indexOf('.ts-card-feat .ts-card-name { font-size: 19px; }') === -1,
            'feat-правила шрифта удалены (шрифт общий)');
        assertTrue(mob.indexOf('.ts-card-feat .ts-card-meta { font-size: 12px; }') === -1,
            'feat-правила meta удалены');
        assertTrue(INDEX_SRC.indexOf('@media (max-width: 400px) { .ts-card { padding: 9px 10px 10px; } .ts-card-name { font-size: 17px; } }') !== -1,
            '≤400px: имя 17px — базовое (бывш. featured)');
    });

    test('Светлая тема: мягкие тени и свой бордер', () => {
        const mob = mobileBlock();
        assertTrue(mob.indexOf('[data-theme="light"] .ts-card-feat { border-color: rgba(20, 20, 19, 0.35);') !== -1,
            'light: бордер');
        assertTrue(mob.indexOf('box-shadow: 0 4px 12px rgba(20, 20, 19, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.6), inset 0 -3px 0 rgba(20, 20, 19, 0.06);') !== -1,
            'light: мягкий выступ');
    });

    test('Featured-правила ТОЛЬКО в мобильном media (десктоп без изменений)', () => {
        // все .ts-card-feat-правила живут внутри @media ≤1023px
        const mob = mobileBlock();
        const outside = INDEX_SRC.replace(mob, '');
        const cssOutside = outside.indexOf('.ts-card-feat {') === -1 &&
            outside.indexOf('.ts-card-feat .ts-card-name { font-size: 19px; }') === -1;
        assertTrue(cssOutside, 'за пределами мобильного блока — только 400px/комментарии');
        assertTrue(mob.indexOf('.ts-card-feat') !== -1, 'внутри мобильного блока есть');
        // ≤400px — базовый крупный шрифт (Task 492: meta 10.5px и
        // feat-правило удалены — шрифт един для всех кнопок)
        assertTrue(INDEX_SRC.indexOf('@media (max-width: 400px) { .ts-card { padding: 9px 10px 10px; } .ts-card-name { font-size: 17px; } }') !== -1,
            'узкий блок ≤400px — базовое имя 17px, без feat-правил');
    });
});

// ============================================================
// C. SRC — featured-класс в рендере + автооткрытие вкладки
// ============================================================
describe('Task 491 — SRC: рендер и автооткрытие «Избранных»', () => {

    test('renderTempSensorCards: условие featured = isFav (Task 492)', () => {
        const fn = grabFn('renderTempSensorCards');
        assertTrue(fn !== null, 'функция объявлена');
        // Task 492: feat = isFav (избранное); условия популярных
        // градуировок из Task 491 удалены
        assertTrue(fn.indexOf('let feat=isFav;') !== -1,
            'feat = isFav (кнопки в избранном)');
        assertTrue(fn.indexOf("String(s.key).indexOf('cu50_')===0") === -1,
            'условие популярных ТС (50М) удалено');
        assertTrue(fn.indexOf("s.tc==='K'||s.tc==='L'") === -1,
            'условие популярных ТП (K/L) удалено');
        assertTrue(fn.indexOf("+(feat?' ts-card-feat':'')+") !== -1,
            'класс добавляется в разметку карточки');
        // Task 492: счётчики в двух экземплярах (верх + нижний бар)
        assertTrue(fn.indexOf("getElementById('tsAllCountMob')") !== -1,
            'счётчик tsAllCountMob (нижний бар)');
        assertTrue(fn.indexOf("getElementById('tsFavCountMob')") !== -1,
            'счётчик tsFavCountMob (нижний бар)');
    });

    test('navigateTo(temp-sensors): есть избранное → вкладка «Избранные»', () => {
        assertTrue(INDEX_SRC.indexOf("if (page === 'temp-sensors') {") !== -1,
            'блок открытия страницы');
        assertTrue(INDEX_SRC.indexOf("if (typeof setTempSensorsTab === 'function' && typeof TempFav !== 'undefined') { setTempSensorsTab(TempFav.count() > 0 ? 'fav' : 'all'); }") !== -1,
            'автовыбор таба по TempFav.count()');
        assertTrue(INDEX_SRC.indexOf('if (typeof renderTempSensorCards === \'function\') renderTempSensorCards();') !== -1,
            'рендер карточек сохранён');
    });

    test('FlowmeterData.init: есть избранное → вкладка «Избранные»', () => {
        assertTrue(INDEX_SRC.indexOf("var targetTab491 = (typeof FlowFav !== 'undefined' && FlowFav.count() > 0) ? 'fav' : 'all';") !== -1,
            'targetTab491 по FlowFav.count()');
        assertTrue(INDEX_SRC.indexOf('if (this._activeTab !== targetTab491) {') !== -1,
            'переключение только при отличии');
        assertTrue(INDEX_SRC.indexOf("document.querySelectorAll('.flow-tab[data-flow-tab]')") !== -1,
            'синхронизация кнопок табов');
        // Порядок: автовыбор ДО первого renderList
        const iTarget = INDEX_SRC.indexOf('var targetTab491');
        const iRender = INDEX_SRC.indexOf('this.renderList();', iTarget);
        assertTrue(iTarget !== -1 && iRender > iTarget, 'автотаб до renderList');
    });
});

// ============================================================
// D/E. VM — рендер карточек с featured-классом
// ============================================================
describe('Task 491 — VM: featured-класс (Task 492: на избранном)', () => {

    test('Без избранного: 0 featured ТС, все 8 обычные (Task 492)', () => {
        const vmw = makeVm491();
        vmw.api.renderTempSensorCards();
        const rtd = vmw.els['tsRtdCards'].innerHTML;
        assertEqual((rtd.match(/class="ts-card ts-card-feat"/g) || []).length, 0, '0 featured ТС (feat=избранное)');
        assertEqual((rtd.match(/class="ts-card"/g) || []).length, 8, 'все 8 ТС обычные');
        assertFalse(rtd.indexOf('ts-card-feat') !== -1,
            'популярные 50М/100М больше НЕ featured (Task 492)');
    });

    test('Без избранного: 0 featured ТП, все 9 обычные (Task 492)', () => {
        const vmw = makeVm491();
        vmw.api.renderTempSensorCards();
        const tc = vmw.els['tsTcCards'].innerHTML;
        assertEqual((tc.match(/class="ts-card ts-card-tc ts-card-feat"/g) || []).length, 0, '0 featured ТП');
        assertEqual((tc.match(/class="ts-card ts-card-tc"/g) || []).length, 9, 'все 9 ТП обычные');
        assertFalse(tc.indexOf('ts-card-feat') !== -1,
            'ТХА (K)/ТХК (L) больше НЕ featured (Task 492)');
    });

    test('Порядок ТС в HTML: 50М, 50М, 100М, 100М, 50П, 100П, Pt100, Pt1000', () => {
        const vmw = makeVm491();
        vmw.api.renderTempSensorCards();
        const rtd = vmw.els['tsRtdCards'].innerHTML;
        const keys = [];
        const re = /openTempSensor\('([a-z0-9_]+)'\)/g;
        let m;
        while ((m = re.exec(rtd)) !== null) { keys.push(m[1]); }
        assertEqual(keys.join(','),
            'cu50_1428,cu50_1426,cu100_1428,cu100_1426,pt50_1391,pt100_1391,pt100_1385,pt1000_1385',
            'пары 50М+50М и 100М+100М (Task 491)');
    });

    test('Избранные: featured-класс у избранного (Task 492)', () => {
        const vmw = makeVm491();
        vmw.api.TempFav.add('cu50_1426');
        vmw.api.TempFav.add('tc_J');
        vmw.api.setTempSensorsTab('fav');
        vmw.api.renderTempSensorCards();
        const rtd = vmw.els['tsRtdCards'].innerHTML;
        const tc = vmw.els['tsTcCards'].innerHTML;
        assertEqual((rtd.match(/class="ts-card ts-card-feat"/g) || []).length, 1, '1 ТС — featured 50М (в избранном)');
        assertTrue(rtd.indexOf("openTempSensor('cu50_1426')") !== -1, 'карточка 50М (0,00426)');
        // Task 492: ТЖК (J) — В избранном → featured (не как в Task 491)
        assertEqual((tc.match(/class="ts-card ts-card-tc ts-card-feat"/g) || []).length, 1, '1 ТП — featured ТЖК (J)');
        assertTrue(tc.indexOf("openTempSensor('tc_J')") !== -1, 'карточка ТЖК (J) в «Избранных»');
        vmw.api.setTempSensorsTab('all');
    });

    test('Вкладка «Все» с избранным: featured только у избранного', () => {
        const vmw = makeVm491();
        vmw.api.TempFav.add('pt1000_1385');
        vmw.api.setTempSensorsTab('all');
        vmw.api.renderTempSensorCards();
        const rtd = vmw.els['tsRtdCards'].innerHTML;
        assertEqual((rtd.match(/class="ts-card ts-card-feat"/g) || []).length, 1, 'только Pt1000 — featured');
        assertTrue(rtd.indexOf("openTempSensor('pt1000_1385')") !== -1, 'карточка Pt1000');
        const tc = vmw.els['tsTcCards'].innerHTML;
        assertFalse(tc.indexOf('ts-card-feat') !== -1, 'в ТП избранного нет');
        vmw.api.setTempSensorsTab('all');
    });
});

// ============================================================
// F. SW — версия кеша
// ============================================================
describe('Task 491 — SW: версия кеша', () => {

    test('SW: кэш поднят до kipia-test-v733', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v733'") !== -1,
            'CACHE_VERSION = kipia-test-v733 (Task 491)');
        assertFalse(SW_SRC.indexOf('kipia-test-v714') !== -1,
            'старой версии v714 нет');
    });

    test('SW: комментарий Task 491 описывает изменения', () => {
        assertTrue(SW_SRC.indexOf('// Task 491: «Датчики температуры» — пары кнопок ТС по заявке: 50М+50М') !== -1,
            'комментарий Task 491 в истории');
        assertTrue(SW_SRC.indexOf('эффект выступа') !== -1, 'упоминание эффекта выступа');
        assertTrue(SW_SRC.indexOf('«Избранные» (датчики температуры в navigateTo + расходомеры') !== -1,
            'упоминание автооткрытия вкладки');
    });
});
