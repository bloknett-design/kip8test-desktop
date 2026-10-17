// tests/test-task494.js
// Task 494: заявка пользователя — «На страницах расчёта датчиков
//   температуры убери надписи "Расчёт произвольных значений
//   Введите значение в любое поле — другое рассчитается
//   автоматически", а шрифт, размер полей ввода в этом блоке
//   сделай больше и ярче, и сам блок сделай в стиле эффект
//   выступа (рамка 2px + градиент + тень). Сразу вноси изменения
//   и в kip8.»
//
// Панель tempCustomCalcPanel (Task 371/373 — статичная, НАД формой
// выбора диапазона/шага на page-temp-sensor-view, единая для ТС и ТП).
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — HTML: заголовок «Расчёт произвольных значений» (div
//      .ts-calc-title) и подсказка «Введите значение в любое поле —
//      другое рассчитается автоматически» (div .ts-calc-hint) УДАЛЕНЫ;
//      инварианты: панель на месте (НАД формой), подписи/поля/id/
//      oninput/placeholder прежние; оба поля получили класс
//      ts-calc-field.
//   B. SRC — CSS: панель — эффект ВЫСТУПА по образцу featured-кнопок
//      Task 492 (border 2px + градиент + тень: внешняя снизу,
//      inset-подсветка сверху, затемнение снизу); поля — крупнее
//      (52px/19px/700) и ярче (белый текст, яркая рамка/плейсхолдер);
//      светлая тема — мягкая версия; старые правила .ts-calc-title/
//      .ts-calc-hint и прежняя тонкая рамка 1px удалены.
//   C. VM — openTempSensor по-прежнему подставляет подписи/примеры
//      под тип датчика (правки разметки логики не меняли).
//   D. SW v718 (guard v719; v717 в sw.js отсутствует) + комментарий
//      Task 494.

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Чанк статичной панели: от id="tempCustomCalcPanel" до панели
// таблицы Task 495 (id="tempTableFormPanel") — поля таблицы
// (min/max/шаг) получили класс ts-calc-field в Task 495, поэтому
// конец чанка перенесён с формы выбора на новую панель.
function panelChunk() {
    const iPanel = INDEX_SRC.indexOf('id="tempCustomCalcPanel"');
    const iRange = INDEX_SRC.indexOf('id="tempTableFormPanel"');
    if (iPanel === -1 || iRange === -1) return null;
    return INDEX_SRC.slice(iPanel, iRange);
}

describe('Task 494 — SRC: панель без заголовка/подсказки, поля крупнее и ярче', () => {

    test('HTML: заголовок «Расчёт произвольных значений» УДАЛЕН', () => {
        const p = panelChunk();
        assertTrue(p !== null, 'панель в статичной разметке');
        assertFalse(p.indexOf('ts-calc-title') !== -1,
            'div.ts-calc-title в панели НЕТ (Task 494)');
        assertFalse(p.indexOf('>Расчёт произвольных значений</div>') !== -1,
            'текст заголовка в панели НЕТ (Task 494)');
    });

    test('HTML: подсказка «Введите значение в любое поле…» УДАЛЕНА', () => {
        const p = panelChunk();
        assertFalse(p.indexOf('ts-calc-hint') !== -1,
            'div.ts-calc-hint в панели НЕТ (Task 494)');
        assertFalse(p.indexOf('Введите значение в любое поле') !== -1,
            'текст подсказки в панели НЕТ (Task 494)');
    });

    test('HTML: инварианты панели — поля/подписи/живой расчёт на месте', () => {
        const p = panelChunk();
        // Панель по-прежнему НАД формой выбора (Task 373)
        const iPanel = INDEX_SRC.indexOf('id="tempCustomCalcPanel"');
        const iRange = INDEX_SRC.indexOf('id="temp_sensor_min"');
        assertTrue(iPanel !== -1 && iRange !== -1 && iPanel < iRange,
            'панель НАД формой выбора (инвариант Task 373)');
        for (const chunk of [
            'id="tempQueryTemp"',
            'id="tempQueryVal"',
            'id="tempQueryValLabel"',
            'oninput="tempQueryFromTemp()"',
            'oninput="tempQueryFromValue()"',
            'Температура (°C)',
            'Сопротивление R(t), Ом',
            'Task 499 (заявка: «подсказки диапазонов',
            'бледным текстом'
        ]) {
            assertTrue(p.indexOf(chunk) !== -1, 'панель содержит: ' + chunk);
        }
    });

    test('HTML: оба поля получили класс ts-calc-field', () => {
        const p = panelChunk();
        assertTrue(p.indexOf('class="scale-field ts-calc-field"') !== -1,
            'класс ts-calc-field у полей панели');
        const n = p.split('ts-calc-field').length - 1;
        assertTrue(n === 2, 'ровно ДВА поля с классом (температура + значение)');
    });

    test('CSS: панель — эффект выступа (рамка 2px + градиент + тень)', () => {
        const i = INDEX_SRC.indexOf('.ts-calc-panel {');
        assertTrue(i !== -1, 'правило .ts-calc-panel есть');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('border: 2px solid rgba(255, 255, 255, 0.16);') !== -1,
            'рамка 2px нейтральная (Task 502: палитра снята)');
        assertTrue(rule.indexOf('linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.01))') !== -1,
            'градиент фона (приподнятость)');
        assertTrue(rule.indexOf('box-shadow: 0 5px 14px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 -3px 0 rgba(0, 0, 0, 0.3);') !== -1,
            'тень выступа: внешняя снизу + inset-подсветка сверху + затемнение снизу');
        assertTrue(rule.indexOf('background-color: var(--card-bg);') !== -1,
            'подложка var(--card-bg) сохранена');
    });

    test('CSS: поля крупнее и ярче (52px / 19px / 700 / белый)', () => {
        const i = INDEX_SRC.indexOf('.ts-calc-field {');
        assertTrue(i !== -1, 'правило .ts-calc-field есть');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('height: 52px;') !== -1, 'высота 52px (было 42px)');
        assertTrue(rule.indexOf('font-size: 19px;') !== -1, 'шрифт 19px (было 15px)');
        assertTrue(rule.indexOf('font-weight: 700;') !== -1, 'жирный шрифт');
        assertTrue(rule.indexOf('color: #ffffff;') !== -1, 'белый текст (ярче)');
        assertTrue(rule.indexOf('border-color: rgba(255, 255, 255, 0.22);') !== -1,
            'рамка поля нейтральная (Task 502)');
        const ip = INDEX_SRC.indexOf('.ts-calc-field::placeholder');
        assertTrue(ip !== -1, 'правило ::placeholder есть');
        const ph = INDEX_SRC.slice(ip, INDEX_SRC.indexOf('}', ip) + 1);
        assertTrue(ph.indexOf('rgba(255, 255, 255, 0.4)') !== -1,
            'плейсхолдер ярче (0.4, было 0.15)');
        const ic = INDEX_SRC.indexOf('.ts-calc-field:focus');
        assertTrue(ic !== -1, 'правило :focus есть');
    });

    test('CSS: светлая тема — панель и поля', () => {
        const iL = INDEX_SRC.indexOf('[data-theme="light"] .ts-calc-panel {');
        assertTrue(iL !== -1, 'правило светлой темы панели есть');
        const rl = INDEX_SRC.slice(iL, INDEX_SRC.indexOf('}', iL) + 1);
        assertTrue(rl.indexOf('border-color: rgba(20, 20, 19, 0.32);') !== -1,
            'рамка светлой темы нейтральная (Task 502)');
        assertTrue(rl.indexOf('0 4px 12px rgba(20, 20, 19, 0.1)') !== -1,
            'мягкая тень светлой темы (нейтральная, Task 502)');
        const iF = INDEX_SRC.indexOf('[data-theme="light"] .ts-calc-field {');
        assertTrue(iF !== -1, 'правило светлой темы полей есть');
        const rf = INDEX_SRC.slice(iF, INDEX_SRC.indexOf('}', iF) + 1);
        assertTrue(rf.indexOf('color: #141413;') !== -1, 'тёмный текст светлой темы');
    });

    test('CSS: старые правила панели удалены', () => {
        assertFalse(INDEX_SRC.indexOf('.ts-calc-title {') !== -1,
            'правило .ts-calc-title снято (заголовок удалён)');
        assertFalse(INDEX_SRC.indexOf('.ts-calc-hint {') !== -1,
            'правило .ts-calc-hint снято (подсказка удалена)');
        const i = INDEX_SRC.indexOf('.ts-calc-panel {');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertFalse(rule.indexOf('border: 1px solid rgba(74, 143, 199, 0.2);') !== -1,
            'прежняя тонкая рамка 1px удалена (теперь 2px)');
        // Подписи полей внутри панели — ярче общего правила
        const iLbl = INDEX_SRC.indexOf('.ts-calc-panel .scale-form-label {');
        assertTrue(iLbl !== -1, 'правило подписей внутри панели есть');
        const rl = INDEX_SRC.slice(iLbl, INDEX_SRC.indexOf('}', iLbl) + 1);
        assertTrue(rl.indexOf('rgba(255, 255, 255, 0.6)') !== -1,
            'подписи ярче (0.6, было 0.35)');
    });

    test('CSS: мобильные media НЕ ужимают поля панели (override)', () => {
        // ≤480px и ≤400px ужимают .form-field/.scale-field до 14/13px
        // и 40/38px — поля панели держат 19px/52px (override ПОСЛЕ общих
        // правил в тех же media-блоках; в файле несколько media-блоков,
        // ищем по вхождениям override, а не по первому попавшемуся media)
        const ov = '.ts-calc-field { padding: 10px 14px; font-size: 19px; height: 52px; }';
        let idx = -1;
        const spots = [];
        while ((idx = INDEX_SRC.indexOf(ov, idx + 1)) !== -1) {
            spots.push(idx);
        }
        assertTrue(spots.length === 2,
            'ровно ДВА override-а (≤480px и ≤400px), найдено ' + spots.length);
        // контейнер каждого override: ближайший @media назад + общее
        // правило ужимания перед ним (каскад: позже = сильнее)
        const ctxOf = (s) => {
            const back = INDEX_SRC.slice(Math.max(0, s - 1600), s);
            const m = back.lastIndexOf('@media (');
            return { back: back, media: m === -1 ? '' : back.slice(m, m + 40) };
        };
        const c0 = ctxOf(spots[0]);
        assertTrue(c0.media.indexOf('max-width: 480px') !== -1,
            'первый override — в блоке max-width: 480px');
        assertTrue(c0.back.indexOf('.form-field, .scale-field {') !== -1,
            '≤480px: override ПОСЛЕ общего правила ужимания (каскад)');
        const c1 = ctxOf(spots[1]);
        assertTrue(c1.media.indexOf('max-width: 400px') !== -1,
            'второй override — в блоке max-width: 400px');
        assertTrue(c1.back.indexOf('.form-field, .scale-field { padding: 8px 10px; font-size: 13px; height: 38px; }') !== -1,
            '≤400px: override ПОСЛЕ общего правила (13px/38px не тронуто)');
    });

    test('VM: openTempSensor — подписи под тип датчика живы (логика не менялась)', () => {
        const i = INDEX_SRC.indexOf('function openTempSensor(');
        assertTrue(i !== -1, 'функция openTempSensor есть');
        // Task 499: блок плейсхолдеров диапазонов (~3300-3600 от начала
        // функции) — срез расширен 3000 → 4500
        const fn = INDEX_SRC.slice(i, i + 4500);
        assertTrue(fn.indexOf("vLab.textContent='Сопротивление R(t), Ом'") !== -1,
            'подпись ТС подставляется');
        assertTrue(fn.indexOf("vLab.textContent='Термо-ЭДС E(t), мВ'") !== -1,
            'подпись ТП подставляется');
        // Task 499: подсказки диапазонов — прямо в поля (плейсхолдеры)
        assertTrue(fn.indexOf('tInp.placeholder=fmtI499(rng499.min)') !== -1,
            'плейсхолдер температуры (Task 499)');
        assertTrue(fn.indexOf('vInp.placeholder=fmtM499(vmin499)') !== -1,
            'плейсхолдер значения (Task 499)');
    });
});

describe('Task 494 — SW: версия кеша v718', () => {

    test('SW: CACHE_VERSION = kipia-test-v750, один инкремент', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v750';") !== -1,
            'CACHE_VERSION = kipia-test-v750');
        assertFalse(SW_SRC.indexOf('kipia-test-v717') !== -1,
            'v717 в sw.js отсутствует (ровно один инкремент)');
        assertFalse(SW_SRC.indexOf('kipia-test-v751') !== -1,
            'v719 не существует (guard)');
    });

    test('SW: комментарий Task 494 в шапке версий', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v750';");
        // Task 497: комментарий избранного расходомеров (~200 симв.)
        // — якорь 494@1030 — окно 900 → 1200 (запас 170).
        // Task 502: окно 2600 → 3100 (якорь 2957).
        const ctx = SW_SRC.slice(Math.max(0, i - 4400), i);
        assertTrue(ctx.indexOf('Task 494') !== -1, 'маркер задачи');
        assertTrue(ctx.indexOf('tempCustomCalcPanel') !== -1,
            'упоминание панели в комментарии');
    });
});

console.log('test-task494: все describes зарегистрированы');
