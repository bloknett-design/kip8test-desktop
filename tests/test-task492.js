// tests/test-task492.js
// Task 492: заявка пользователя — «В разделе датчиков температур кнопки
//   все и избранные смести вниз и оформи как в разделе расходомеров.
//   Оформление кнопок верни как прежде но шрифт текста оставь как есть
//   и сделай такой же на остальных кнопках, и оформление кнопок
//   добавленных в избранное сделай как сейчас выделенным.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — HTML: #tsBottomBar (нижний фиксированный бар по образцу
//      расходомеров #flowBottomBar) — сиблинг #page-temp-sensors, две
//      кнопки .ts-tab[data-ts-tab=all/fav] с onclick
//      setTempSensorsTab и счётчиками tsAllCountMob/tsFavCountMob.
//   B. SRC — CSS: (1) .ts-bottom-bar — fixed внизу, z-index 80,
//      grid 1fr 1fr, blur-фон, safe-area, разделитель ::before
//      (синий, светл. тема); показ body:has(#page-temp-sensors.active),
//      на десктопе ≥1024px — display:none !important; (2) кнопки бара:
//      17px/600, min-height 56px, active без фона (только цвет),
//      счётчик 18px/11px, ≤400px — 15px; (3) .ts-tabs скрыты на
//      мобильном, .ts-page — padding-bottom 96px; (4) крупный шрифт
//      19/12px у ВСЕХ кнопок (базовые правила), feat-правил шрифта НЕТ;
//      (5) featured-оформление (рамка 2px/градиент/тени) — сохранено
//      как было («как сейчас выделенным»), только теперь класс вешает
//      рендер по isFav.
//   C. SRC — JS: renderTempSensorCards — feat=isFav (условия
//      популярных градуировок удалены), счётчики в ДВУХ экземплярах
//      (верхние .ts-tabs + нижний бар).
//   D. VM — рендер: без избранного — 0 ts-card-feat; избранное —
//      feat только на избранных (в «Избранных» — все показанные);
//      счётчики Mob обновляются; популярные ключи НЕ featured.
//   E. SW v716 (guard v715 в sw.js отсутствует).

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

// VM как в test-task490/491: рендер карточек в псевдо-DOM
function makeVm492() {
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
// A. SRC — HTML: нижний бар #tsBottomBar
// ============================================================
describe('Task 492 — SRC: HTML нижний бар #tsBottomBar', () => {

    test('Бар существует и стоит после #page-temp-sensors (сиблинг)', () => {
        const iPage = INDEX_SRC.indexOf('id="page-temp-sensors"');
        const iBar = INDEX_SRC.indexOf('id="tsBottomBar"');
        const iView = INDEX_SRC.indexOf('id="page-temp-sensor-view"');
        assertTrue(iPage !== -1 && iBar !== -1 && iView !== -1,
            'все три элемента есть');
        assertTrue(iPage < iBar && iBar < iView,
            'бар — между страницей списка и страницей датчика (сиблинг, как #flowBottomBar)');
    });

    test('Две кнопки .ts-tab с data-ts-tab=all/fav и onclick', () => {
        const iBar = INDEX_SRC.indexOf('id="tsBottomBar"');
        const barHtml = INDEX_SRC.slice(iBar, INDEX_SRC.indexOf('</div>', iBar));
        assertTrue(barHtml.indexOf('class="ts-tab active" data-ts-tab="all"') !== -1,
            'кнопка «Все» активна по умолчанию');
        assertTrue(barHtml.indexOf('class="ts-tab" data-ts-tab="fav"') !== -1,
            'кнопка «Избранные»');
        assertTrue(barHtml.indexOf("onclick=\"setTempSensorsTab('all')\"") !== -1,
            'onclick Все');
        assertTrue(barHtml.indexOf("onclick=\"setTempSensorsTab('fav')\"") !== -1,
            'onclick Избранные');
    });

    test('Счётчики-дубликаты tsAllCountMob/tsFavCountMob', () => {
        const iBar = INDEX_SRC.indexOf('id="tsBottomBar"');
        const barHtml = INDEX_SRC.slice(iBar, INDEX_SRC.indexOf('</div>', iBar));
        assertTrue(barHtml.indexOf('id="tsAllCountMob"') !== -1,
            'счётчик «Все» нижнего бара');
        assertTrue(barHtml.indexOf('id="tsFavCountMob"') !== -1,
            'счётчик «Избранные» нижнего бара');
        // верхние (десктопные) счётчики не тронуты
        assertTrue(INDEX_SRC.indexOf('id="tsAllCount"') !== -1 &&
            INDEX_SRC.indexOf('id="tsFavCount"') !== -1,
            'верхние счётчики на месте');
    });

    test('Комментарий Task 492 у бара (образец — расходомеры)', () => {
        const iBar = INDEX_SRC.indexOf('id="tsBottomBar"');
        const before = INDEX_SRC.slice(Math.max(0, iBar - 900), iBar);
        assertTrue(before.indexOf('Task 492') !== -1,
            'комментарий Task 492 перед баром');
        assertTrue(before.indexOf('#flowBottomBar') !== -1,
            'упоминание образца #flowBottomBar');
    });
});

// ============================================================
// B. SRC — CSS: бар, скрытие верхних табов, шрифт, featured
// ============================================================
describe('Task 492 — SRC: CSS нижнего бара (по образцу расходомеров)', () => {

    test('.ts-bottom-bar: fixed внизу, z-index 80, grid 1fr 1fr, blur, safe-area', () => {
        assertTrue(INDEX_SRC.indexOf('.ts-bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 80; display: none; grid-template-columns: 1fr 1fr;') !== -1,
            'фиксация внизу + две равные колонки');
        assertTrue(INDEX_SRC.indexOf('padding-bottom: env(safe-area-inset-bottom, 0px); background: var(--bottom-nav-bg, rgba(23, 33, 43, 0.95)); backdrop-filter: blur(20px);') !== -1,
            'blur-фон и safe-area (как flow-bottom-bar)');
        assertTrue(INDEX_SRC.indexOf('border-top: 1px solid var(--card-border); }') !== -1,
            'верхняя граница бара');
    });

    test('Показ: body:has(#page-temp-sensors.active), по умолчанию скрыт', () => {
        assertTrue(INDEX_SRC.indexOf('body:has(#page-temp-sensors.active) .ts-bottom-bar { display: grid; }') !== -1,
            'показывается только на активной странице датчиков');
        assertTrue(INDEX_SRC.indexOf('.ts-bottom-bar { position: fixed;') < INDEX_SRC.indexOf('body:has(#page-temp-sensors.active) .ts-bottom-bar { display: grid; }'),
            'display:none по умолчанию объявлен раньше');
    });

    test('Десктоп ≥1024px: бар скрыт (display: none !important)', () => {
        assertTrue(INDEX_SRC.indexOf('@media (min-width: 1024px) { body:has(#page-temp-sensors.active) .ts-bottom-bar { display: none !important; } }') !== -1,
            'десктоп — прежние табы .ts-tabs сверху');
    });

    test('Разделитель ::before между кнопками (нейтральный + светлая тема)', () => {
        assertTrue(INDEX_SRC.indexOf('.ts-bottom-bar::before { content: \'\';') !== -1,
            'псевдоэлемент-разделитель');
        assertTrue(INDEX_SRC.indexOf('background: rgba(255, 255, 255, 0.12); transform: translateX(-50%);') !== -1,
            'вертикальная линия по центру');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ts-bottom-bar::before { background: rgba(20, 20, 19, 0.12); }') !== -1,
            'светлая тема разделителя');
    });

    test('Кнопки бара: 17px/600, min-height 56px, active — только цвет', () => {
        assertTrue(INDEX_SRC.indexOf('#tsBottomBar .ts-tab { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 56px;') !== -1,
            'геометрия как flow-tab (56px)');
        assertTrue(INDEX_SRC.indexOf('font-family: \'Inter\', sans-serif; font-size: 17px; font-weight: 600;') !== -1,
            'шрифт 17px/600 (как flow-tab)');
        assertTrue(INDEX_SRC.indexOf('#tsBottomBar .ts-tab.active { background: transparent; color: #ffffff; }') !== -1,
            'active — без фона, нейтральный светлый текст (Task 502)');
        assertTrue(INDEX_SRC.indexOf('#tsBottomBar .ts-tab:active { background: rgba(255, 255, 255, 0.08); opacity: 0.75; }') !== -1,
            ':active — лёгкая подсветка');
    });

    test('Счётчик бара 18px/11px; ≤400px — кнопка компактнее (15px)', () => {
        assertTrue(INDEX_SRC.indexOf('#tsBottomBar .ts-tab-count { min-width: 18px; height: 18px; border-radius: 9px; font-size: 11px; line-height: 18px; }') !== -1,
            'крупный счётчик (как flow-tab-count)');
        assertTrue(INDEX_SRC.indexOf('@media (max-width: 400px) { #tsBottomBar .ts-tab { font-size: 15px; padding: 14px 8px calc(14px + env(safe-area-inset-bottom, 0px)); gap: 4px; } }') !== -1,
            'узкий экран — компактная кнопка');
    });

    test('Верхние .ts-tabs скрыты на мобильном; отступ .ts-page под бар', () => {
        const mob = mobileBlock();
        assertTrue(mob.indexOf('.ts-tabs { display: none; }') !== -1,
            '.ts-tabs скрыты в @media ≤1023px');
        assertTrue(mob.indexOf('body:has(#page-temp-sensors.active) .ts-page { padding-bottom: 96px; }') !== -1,
            'нижний отступ контента под фиксированный бар');
        // десктопные .ts-tabs не тронуты (базовое правило вне media живо)
        assertTrue(INDEX_SRC.indexOf('.ts-tabs { display: flex; margin: 6px 0 4px;') !== -1,
            'базовое правило .ts-tabs (десктоп) прежнее');
    });
});

// ============================================================
// C. SRC — CSS: единый крупный шрифт + featured у избранного
// ============================================================
describe('Task 492 — SRC: шрифт у всех кнопок + featured-оформление', () => {

    test('Крупный шрифт — базовые правила мобильного блока (19/12px)', () => {
        const mob = mobileBlock();
        assertTrue(mob.indexOf('.ts-card-name { font-size: 19px; }') !== -1,
            'имя 19px у ВСЕХ кнопок');
        assertTrue(mob.indexOf('.ts-card-meta { font-size: 12px; }') !== -1,
            'meta 12px у ВСЕХ кнопок');
    });

    test('Feat-правил шрифта НЕТ (шрифт един для обычных и featured)', () => {
        const mob = mobileBlock();
        assertFalse(mob.indexOf('.ts-card-feat .ts-card-name { font-size: 19px; }') !== -1,
            'feat-правило имени удалено');
        assertFalse(mob.indexOf('.ts-card-feat .ts-card-meta { font-size: 12px; }') !== -1,
            'feat-правило meta удалено');
        assertFalse(INDEX_SRC.indexOf('.ts-card-feat .ts-card-name { font-size: 17px; } }') !== -1,
            '≤400px feat-правило удалено');
        assertTrue(INDEX_SRC.indexOf('@media (max-width: 400px) { .ts-card { padding: 9px 10px 10px; } .ts-card-name { font-size: 17px; } }') !== -1,
            '≤400px: имя 17px — базовое; meta 10.5px удалена (12px наследуется)');
    });

    test('Featured-оформление сохранено «как выделенным» (рамка/градиент/тени)', () => {
        const mob = mobileBlock();
        assertTrue(mob.indexOf('.ts-card-feat { padding: 12px 14px 13px; border: 2px solid rgba(255, 255, 255, 0.2);') !== -1,
            'рамка 2px нейтральная (Task 502) + крупнее паддинг');
        assertTrue(mob.indexOf('background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.01));') !== -1,
            'приподнятый градиент фона (нейтральный, Task 502)');
        assertTrue(mob.indexOf('box-shadow: 0 5px 14px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 -3px 0 rgba(0, 0, 0, 0.3);') !== -1,
            'эффект выступа (тень + inset-подсветка/затемнение)');
        assertTrue(mob.indexOf('.ts-card-feat:active { transform: translateY(2px) scale(0.98);') !== -1,
            ':active «утапливается»');
        assertTrue(mob.indexOf('[data-theme="light"] .ts-card-feat { border-color: rgba(20, 20, 19, 0.35);') !== -1,
            'светлая тема featured');
    });

    test('Featured-правила ТОЛЬКО в мобильном media (десктоп без изменений)', () => {
        const mob = mobileBlock();
        const outside = INDEX_SRC.replace(mob, '');
        assertFalse(outside.indexOf('.ts-card-feat {') !== -1,
            'за пределами мобильного блока .ts-card-feat { нет');
        assertTrue(mob.indexOf('.ts-card-feat') !== -1,
            'внутри мобильного блока есть');
    });
});

// ============================================================
// D. SRC — JS: feat = isFav, счётчики в двух экземплярах
// ============================================================
describe('Task 492 — SRC: рендер — feat=isFav + счётчики бара', () => {

    test('renderTempSensorCards: feat = isFav (условия Task 491 удалены)', () => {
        const fn = grabFn('renderTempSensorCards');
        assertTrue(fn !== null, 'функция объявлена');
        assertTrue(fn.indexOf('let feat=isFav;') !== -1,
            'feat = isFav (кнопки в избранном)');
        assertFalse(fn.indexOf("String(s.key).indexOf('cu50_')===0") !== -1,
            'условие популярных ТС (50М/100М) удалено');
        assertFalse(fn.indexOf("s.tc==='K'||s.tc==='L'") !== -1,
            'условие популярных ТП (K/L) удалено');
        assertTrue(fn.indexOf("+(feat?' ts-card-feat':'')+") !== -1,
            'класс в разметке карточки — как прежде');
    });

    test('Счётчики обновляются в ДВУХ экземплярах (верх + нижний бар)', () => {
        const fn = grabFn('renderTempSensorCards');
        assertTrue(fn.indexOf("getElementById('tsAllCountMob')") !== -1,
            'tsAllCountMob');
        assertTrue(fn.indexOf("getElementById('tsFavCountMob')") !== -1,
            'tsFavCountMob');
        assertTrue(fn.indexOf("getElementById('tsAllCount')") !== -1,
            'верхний tsAllCount жив');
        assertTrue(fn.indexOf("getElementById('tsFavCount')") !== -1,
            'верхний tsFavCount жив');
    });

    test('setTempSensorsTab синхронизирует все .ts-tab (общий data-ts-tab)', () => {
        const fn = grabFn('setTempSensorsTab');
        assertTrue(fn !== null, 'функция объявлена');
        assertTrue(fn.indexOf("querySelectorAll('.ts-tab[data-ts-tab]')") !== -1,
            'переключение всех кнопок (верхние + нижний бар)');
    });
});

// ============================================================
// E. VM — рендер: featured у избранного
// ============================================================
describe('Task 492 — VM: featured у кнопок в избранном', () => {

    test('Без избранного: 0 featured (популярные 50М/100М/K/L — обычные)', () => {
        const vmw = makeVm492();
        vmw.api.renderTempSensorCards();
        const rtd = vmw.els['tsRtdCards'].innerHTML;
        const tc = vmw.els['tsTcCards'].innerHTML;
        assertEqual((rtd.match(/class="ts-card ts-card-feat"/g) || []).length, 0, '0 featured ТС');
        assertEqual((tc.match(/ts-card-feat/g) || []).length, 0, '0 featured ТП');
        assertEqual((rtd.match(/class="ts-card"/g) || []).length, 8, '8 обычных ТС');
        assertEqual((tc.match(/class="ts-card ts-card-tc"/g) || []).length, 9, '9 обычных ТП');
    });

    test('Избранное ТС+ТП: featured ровно на них (вкладка «Все»)', () => {
        const vmw = makeVm492();
        vmw.api.TempFav.add('cu50_1428');
        vmw.api.TempFav.add('tc_K');
        vmw.api.renderTempSensorCards();
        const rtd = vmw.els['tsRtdCards'].innerHTML;
        const tc = vmw.els['tsTcCards'].innerHTML;
        assertEqual((rtd.match(/class="ts-card ts-card-feat"/g) || []).length, 1, '1 featured ТС — 50М');
        assertTrue(rtd.indexOf("openTempSensor('cu50_1428')") !== -1, 'это 50М (0,00428)');
        assertEqual((tc.match(/class="ts-card ts-card-tc ts-card-feat"/g) || []).length, 1, '1 featured ТП — ТХА (K)');
        assertTrue(tc.indexOf("openTempSensor('tc_K')") !== -1, 'это ТХА (K)');
        // сосед-двойник без избранного — НЕ featured
        assertFalse(rtd.indexOf("openTempSensor('cu50_1426')\"") !== -1 &&
            rtd.indexOf('ts-card-feat', rtd.indexOf("openTempSensor('cu50_1426')\"") - 120) !== -1,
            'вторая 50М (0,00426) без избранного — обычная');
    });

    test('Вкладка «Избранные»: ВСЕ показанные — featured', () => {
        const vmw = makeVm492();
        vmw.api.TempFav.add('cu50_1426');
        vmw.api.TempFav.add('tc_J');
        vmw.api.setTempSensorsTab('fav');
        vmw.api.renderTempSensorCards();
        const rtd = vmw.els['tsRtdCards'].innerHTML;
        const tc = vmw.els['tsTcCards'].innerHTML;
        assertEqual((rtd.match(/class="ts-card ts-card-feat"/g) || []).length, 1, 'единственная ТС — featured');
        assertEqual((tc.match(/class="ts-card ts-card-tc ts-card-feat"/g) || []).length, 1, 'единственный ТП — featured');
        assertEqual((rtd.match(/class="ts-card"/g) || []).length, 0, 'не-featured ТС нет');
        vmw.api.setTempSensorsTab('all');
    });

    test('Счётчики нижнего бара обновляются (Mob-элементы)', () => {
        const vmw = makeVm492();
        vmw.api.renderTempSensorCards();
        assertEqual(vmw.els['tsAllCountMob'].textContent, '17', 'AllMob = 17');
        assertEqual(vmw.els['tsFavCountMob'].textContent, '0', 'FavMob = 0');
        assertEqual(vmw.els['tsAllCount'].textContent, '17', 'верхний All = 17');
        vmw.api.TempFav.add('pt1000_1385');
        vmw.api.renderTempSensorCards();
        assertEqual(vmw.els['tsFavCountMob'].textContent, '1', 'FavMob = 1 после add');
        assertEqual(vmw.els['tsFavCount'].textContent, '1', 'верхний Fav = 1');
    });

    test('Снятие избранного снимает featured', () => {
        const vmw = makeVm492();
        vmw.api.TempFav.add('cu100_1428');
        vmw.api.renderTempSensorCards();
        let rtd = vmw.els['tsRtdCards'].innerHTML;
        assertEqual((rtd.match(/class="ts-card ts-card-feat"/g) || []).length, 1, 'был featured');
        vmw.api.TempFav.remove('cu100_1428');
        vmw.api.renderTempSensorCards();
        rtd = vmw.els['tsRtdCards'].innerHTML;
        assertEqual((rtd.match(/class="ts-card ts-card-feat"/g) || []).length, 0, 'featured снят');
        assertEqual(vmw.els['tsFavCountMob'].textContent, '0', 'FavMob = 0');
    });
});

// ============================================================
// F. SW — версия кеша
// ============================================================
describe('Task 492 — SW: версия кеша', () => {

    test('SW: кэш поднят до kipia-test-v746', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v746'") !== -1,
            'CACHE_VERSION = kipia-test-v746 (Task 492)');
        assertFalse(SW_SRC.indexOf('kipia-test-v715') !== -1,
            'старой версии v715 нет');
    });

    test('SW: комментарий Task 492 описывает изменения', () => {
        assertTrue(SW_SRC.indexOf('// Task 492: «Датчики температуры» — табы «Все/Избранные» смещены ВНИЗ') !== -1,
            'комментарий Task 492 в истории');
        assertTrue(SW_SRC.indexOf('ts-bottom-bar') !== -1,
            'упоминание нижнего бара');
        assertTrue(SW_SRC.indexOf('у кнопок В ИЗБРАННОМ') !== -1,
            'featured у избранного');
    });

    test('SW: комментарий Task 491 сохранён (история не переписывается)', () => {
        assertTrue(SW_SRC.indexOf('// Task 491: «Датчики температуры» — пары кнопок ТС по заявке: 50М+50М') !== -1,
            'комментарий Task 491 на месте');
    });
});

console.log('test-task492: все describes зарегистрированы');
