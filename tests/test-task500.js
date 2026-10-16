// tests/test-task500.js
// Task 500: заявка пользователя — «Примени стиль отображения для
//   всех разделов КИП и А, в разделах шкала-сигнал, буйковый
//   уровнемер и сужающее устройство объедини блоки с полями ввода
//   в один блок.»
//
// Стиль — по образцу «Датчиков температуры» (Tasks 494-499):
// блоки форм получают вид ts-calc-panel ts-calc-inset («колодец»),
// поля input/select в панелях — 52/19/700 (CSS-селекторы по тегам,
// спан-бейджи единиц НЕ тронуты).
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — ОБЪЕДИНЕНИЕ: 6 страниц (scale-signal, buoy-calc,
//      orifice-quick/dp/flow/diameter) — в колонке ввода ОДНА панель
//      ts-calc-panel ts-calc-inset с id (…FormPanel), обёрток
//      class="scale-form" в col1 НЕТ, бывшие группы разделены
//      ts-calc-sep (N-1 шт.), кнопка расчёта — ВНЕ панели; ключевые
//      поля (id) и скрытые JS-блоки (scaleCustomRange,
//      op_*_gas_params и т.д.) живы.
//   B. SRC — панели «Расчёт произвольных значений» (scale-signal,
//      buoy-calc): ts-calc-panel БЕЗ ts-calc-inset (эффект выступа,
//      как ППР датчиков температуры), id scaleQueryPanel/
//      buoyQueryPanel, поля живы.
//   C. SRC — СТИЛЬ без объединения: 8 страниц конвертера —
//      converter-form ts-calc-panel ts-calc-inset; 11 страниц
//      погрешности — scale-form с классами панелей (error-scale —
//      все 7 блоков, включая ws_mech_group/ws_els_group с их id и
//      inline-стилями); error-kit: динамические kit-dev-form НЕ
//      получили классы панелей.
//   D. SRC — CSS Task 500: поля в панелях (input/select.scale-field
//      и form-field) — 52/19/700 + select padding-right 28px +
//      фокус/плейсхолдер/light; .form-label в панелях — 12px;
//      .ts-calc-sep — линия сверху; отступ панелей в col-input
//      8px 0 12px; правила ПОСЛЕ базовых .ts-calc-field (494);
//      спан-бейджи orifice НЕ получили вид полей (span.scale-field
//      без ts-calc-field, свои правила живы).
//   E. SRC — целостность: pageBlock() всех страниц закрывается
//      (div-баланс), ключевые JS-функции страниц живы.
//   F. SW v724 + комментарий Task 500 в шапке версий (окно 500).

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Блок страницы по id (баланс div-ов) — как в test-task372/495
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

// Колонка ввода страницы (между conv-col-input и conv-col-table)
function colInput(pageId) {
    const b = pageBlock(pageId);
    if (!b) return null;
    const i1 = b.indexOf('<div class="conv-col conv-col-input">');
    const i2 = b.indexOf('<div class="conv-col conv-col-table">');
    if (i1 === -1 || i2 === -1 || i1 > i2) return null;
    return b.slice(i1, i2);
}

// ==========================================================================
// A. ОБЪЕДИНЕНИЕ БЛОКОВ В ОДНУ ПАНЕЛЬ (6 страниц)
// ==========================================================================
describe('Task 500 A: объединение блоков ввода в один блок', () => {
    // (pageId, panelId, бывших блоков, кнопка, живые поля, скрытые блоки)
    const MERGED = [
        ['scale-signal', 'scaleFormPanel', 3, 'scale-calc-btn',
         ['scaleType', 'scalePreset', 'scaleMin', 'scaleMax', 'scaleUnitName',
          'sigType', 'sigMin', 'sigMax', 'sigUnitCustom'],
         ['scaleCustomRange', 'sigCustomRange']],
        ['buoy-calc', 'buoyFormPanel', 4, 'converter-convert-btn',
         ['buoy_diam', 'buoy_length', 'buoy_weight_kg', 'liquid_preset',
          'liquid_density', 'suspension_mass', 'buoy_signal_type'],
         ['customSignalRange', 'buoyWeightContainer']],
        ['orifice-quick', 'orificeQuickFormPanel', 5, 'converter-convert-btn',
         ['oq_medium', 'oq_flow', 'oq_flow_unit', 'oq_d_pipe', 'oq_beta', 'oq_rho'],
         []],
        ['orifice-dp', 'orificeDpFormPanel', 7, 'converter-convert-btn',
         ['op_dp_d20', 'op_dp_pipe_material', 'op_dp_temp', 'op_dp_flow'],
         ['op_dp_gas_params']],
        ['orifice-flow', 'orificeFlowFormPanel', 7, 'converter-convert-btn',
         ['op_flow_d20', 'op_flow_pipe_material', 'op_flow_temp', 'op_flow_dp'],
         ['op_flow_gas_params']],
        ['orifice-diameter', 'orificeDiameterFormPanel', 7, 'converter-convert-btn',
         ['op_medium_type', 'op_d20', 'op_dp', 'op_flow', 'op_device_type',
          'op_plate_material'],
         ['op_gas_params']],
    ];

    MERGED.forEach(([pageId, panelId, nBlocks, btnClass, fieldIds, hiddenIds]) => {
        test(pageId + ': ОДНА панель ts-calc-inset с id, обёрток .scale-form в col1 НЕТ', () => {
            const col1 = colInput(pageId);
            assertTrue(col1 !== null, 'колонка ввода найдена');
            assertTrue(col1.indexOf('class="ts-calc-panel ts-calc-inset" id="' + panelId + '"') !== -1,
                'панель #' + panelId + ' с классами ts-calc-panel ts-calc-inset');
            const nForms = col1.split('class="scale-form"').length - 1;
            assertEqual(nForms, 0, 'обёрток .scale-form в col1: ' + nForms + ' (ожидалось 0)');
            // панель ОДНА в col1 (count без масштаба: ts-calc-inset ×1)
            assertEqual(col1.split('ts-calc-inset').length - 1, 1,
                'панель-«колодец» в col1 ровно одна');
        });

        test(pageId + ': бывшие группы разделены ts-calc-sep (' + (nBlocks - 1) + ' шт.)', () => {
            const col1 = colInput(pageId);
            assertEqual(col1.split('ts-calc-sep').length - 1, nBlocks - 1,
                'разделителей групп: ' + (col1.split('ts-calc-sep').length - 1));
        });

        test(pageId + ': кнопка расчёта ВНЕ панели (после неё)', () => {
            const col1 = colInput(pageId);
            const iPanelId = col1.indexOf('id="' + panelId + '"');
            const iPanelOpen = col1.lastIndexOf('<div', iPanelId); // начало тега панели
            const iBtn = col1.indexOf('class="' + btnClass + '"');
            assertTrue(iBtn !== -1, 'кнопка ' + btnClass + ' в col1');
            assertTrue(iPanelOpen !== -1 && iPanelOpen < iBtn, 'панель раньше кнопки');
            // панель ЗАКРЫВАЕТСЯ до кнопки: в срезе [начало тега панели;
            // кнопка) открывающих div столько же, сколько закрывающих
            // (последний </div> — закрытие самой панели)
            const seg = col1.slice(iPanelOpen, iBtn);
            const nOpen = (seg.match(/<div\b/g) || []).length;
            const nClose = (seg.match(/<\/div>/g) || []).length;
            assertEqual(nOpen, nClose, 'панель закрыта до кнопки (' + nOpen + '/' + nClose + ')');
        });

        test(pageId + ': ключевые поля и скрытые JS-блоки живы', () => {
            const col1 = colInput(pageId);
            fieldIds.forEach((id) => {
                assertTrue(col1.indexOf('id="' + id + '"') !== -1,
                    'поле #' + id + ' на месте');
            });
            hiddenIds.forEach((id) => {
                assertTrue(col1.indexOf('id="' + id + '"') !== -1,
                    'скрытый блок #' + id + ' (JS-переключатель) на месте');
            });
        });
    });

    test('объединение — РЕГРЕССИЯ: признаки заявки в комментариях Task 500', () => {
        assertTrue(INDEX_SRC.indexOf('Task 500 (заявка)') !== -1,
            'HTML-комментарий Task 500 у панелей');
        const n = INDEX_SRC.split('<!-- Task 500 (заявка): блоки полей ввода объединены').length - 1;
        assertEqual(n, 6, 'комментариев у объединённых панелей: ' + n);
    });
});

// ==========================================================================
// B. ПАНЕЛИ «РАСЧЁТ ПРОИЗВОЛЬНЫХ ЗНАЧЕНИЙ» — ts-calc-panel (выступ)
// ==========================================================================
describe('Task 500 B: панели произвольных значений — как ППР', () => {
    test('scale-signal: #scaleQueryPanel — ts-calc-panel БЕЗ ts-calc-inset', () => {
        const b = pageBlock('scale-signal');
        assertTrue(b.indexOf('class="ts-calc-panel" id="scaleQueryPanel"') !== -1,
            'панель с эффектом выступа (как ППР датчиков температуры)');
        assertTrue(b.indexOf('ts-calc-panel ts-calc-inset" id="scaleQueryPanel"') === -1,
            'НЕ колодец — выступ');
        // Task 501: панель перенесена из результатов в колонку ввода;
        // Task 502 (заявка): блоки произвольных значений и типа шкалы
        // ПОМЕНЯНЫ МЕСТАМИ — панель шкалы теперь ВВЕРХУ, ППР под ней.
        const col1 = colInput('scale-signal');
        const iQ = col1.indexOf('id="scaleQueryPanel"');
        const iF = col1.indexOf('id="scaleFormPanel"');
        assertTrue(iQ !== -1 && iF !== -1 && iF < iQ,
            'панель шкалы — НАД панелью произвольных значений (Task 502)');
        const seg = col1.slice(iQ, iQ + 2400);
        assertTrue(seg.indexOf('id="queryScaleVal"') !== -1, 'поле шкалы живо');
        assertTrue(seg.indexOf('id="querySigVal"') !== -1, 'поле сигнала живо');
        assertTrue(b.indexOf('queryFromScaleLive()') !== -1, 'живой расчёт жив');
    });

    test('buoy-calc: #buoyQueryPanel — ts-calc-panel БЕЗ ts-calc-inset', () => {
        const b = pageBlock('buoy-calc');
        assertTrue(b.indexOf('class="ts-calc-panel" id="buoyQueryPanel"') !== -1,
            'панель с эффектом выступа');
        const i = b.indexOf('id="buoyCustomCalcPanel"');
        const seg = b.slice(i, i + 2600);
        assertTrue(seg.indexOf('id="buoyCustomLevel"') !== -1, 'поле уровня живо');
        assertTrue(seg.indexOf('id="buoyCustomMass"') !== -1, 'поле массы живо');
        assertTrue(seg.indexOf('id="buoyCustomSignal"') !== -1, 'поле сигнала живо');
    });
});

// ==========================================================================
// C. СТИЛЬ БЕЗ ОБЪЕДИНЕНИЯ — 19 страниц (конвертер + погрешность)
// ==========================================================================
describe('Task 500 C: классы панелей на страницах-стилях', () => {
    const CONV = ['conv-pressure', 'conv-flow', 'conv-mass', 'conv-temp',
                  'conv-length', 'conv-density', 'conv-time', 'conv-volume'];

    CONV.forEach((pid) => {
        test(pid + ': converter-form + ts-calc-panel ts-calc-inset', () => {
            const col1 = colInput(pid);
            assertTrue(col1 !== null, 'колонка ввода найдена');
            assertTrue(col1.indexOf('class="converter-form ts-calc-panel ts-calc-inset"') !== -1,
                'блок конвертера получил классы панели-«колодца»');
            assertTrue(col1.indexOf('id="conv-') !== -1 || col1.indexOf('form-field') !== -1,
                'поля конвертера живы');
        });
    });

    const ERR = [['error-pressure', 1], ['error-temp-rtd', 1], ['error-temp-tc', 1],
                 ['error-flow', 1], ['error-level', 1], ['error-generic-number', 1],
                 ['error-generic-underline', 1], ['error-generic-circle', 1],
                 ['error-generic-fraction', 1], ['error-scale', 7], ['error-kit', 1]];
    ERR.forEach(([pid, n]) => {
        test(pid + ': scale-form ts-calc-panel ts-calc-inset ×' + n, () => {
            const col1 = colInput(pid);
            assertTrue(col1 !== null, 'колонка ввода найдена');
            const k = col1.split('class="scale-form ts-calc-panel ts-calc-inset"').length - 1;
            assertEqual(k, n, 'блоков с классами: ' + k + ' (ожидалось ' + n + ')');
        });
    });

    test('error-scale: блоки с id/inline-стилями сохранили их', () => {
        const col1 = colInput('error-scale');
        assertTrue(col1.indexOf('id="ws_mech_group"') !== -1, 'id ws_mech_group жив');
        assertTrue(col1.indexOf('id="ws_els_group"') !== -1, 'id ws_els_group жив');
        assertTrue(col1.indexOf('id="ws_els_group" class="scale-form ts-calc-panel ts-calc-inset"') !== -1,
            'классы добавлены БЕЗ потери id');
    });

    test('error-kit: динамические kit-dev-form НЕ стилизованы (компактный вид)', () => {
        const col1 = colInput('error-kit');
        assertTrue(col1.indexOf('id="kit_device_list"') !== -1, 'список приборов жив');
        assertTrue(col1.indexOf('kit-dev-form ts-calc-panel') === -1,
            'динамика kit-dev-form без классов панелей');
        assertTrue(INDEX_SRC.indexOf('.kit-dev-form .scale-field { height: 36px') !== -1,
            'компактные правила kit-dev-form живы');
    });
});

// ==========================================================================
// D. CSS Task 500
// ==========================================================================
describe('Task 500 D: CSS — поля, разделители, отступы, light-тема', () => {
    test('поля в панелях: 52/19/700 — input+select, scale+form', () => {
        const i = INDEX_SRC.indexOf(
            '.ts-calc-panel input.scale-field, .ts-calc-panel select.scale-field');
        assertTrue(i !== -1, 'правило input/select.scale-field есть');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i));
        assertTrue(rule.indexOf('height: 52px') !== -1, 'высота 52px');
        assertTrue(rule.indexOf('font-size: 19px') !== -1, 'шрифт 19px');
        assertTrue(rule.indexOf('font-weight: 700') !== -1, 'жирность 700');
        assertTrue(rule.indexOf('padding: 10px 14px') !== -1, 'отступ полей 10/14');
        const i2 = INDEX_SRC.indexOf(
            '.ts-calc-panel input.form-field, .ts-calc-panel select.form-field');
        assertTrue(i2 !== -1 && i2 > i && i2 - i < 400,
            'form-field в том же правиле (конвертер)');
    });

    test('select в панелях: padding-right 28px (стрелка не перекрыта)', () => {
        const i = INDEX_SRC.indexOf(
            '.ts-calc-panel select.scale-field, .ts-calc-panel select.form-field { padding-right: 28px; }');
        assertTrue(i !== -1, 'правило стрелки select');
    });

    test('фокус и плейсхолдер полей в панелях', () => {
        assertTrue(INDEX_SRC.indexOf(
            '.ts-calc-panel input.scale-field:focus, .ts-calc-panel select.scale-field:focus') !== -1,
            'правило фокуса');
        assertTrue(INDEX_SRC.indexOf(
            '.ts-calc-panel input.scale-field::placeholder, .ts-calc-panel input.form-field::placeholder') !== -1,
            'правило плейсхолдера (бледный, как Task 499)');
    });

    test('разделитель групп .ts-calc-sep — линия сверху с отступом', () => {
        const i = INDEX_SRC.indexOf('.ts-calc-panel .scale-form-label.ts-calc-sep {');
        assertTrue(i !== -1, 'правило ts-calc-sep');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i));
        assertTrue(rule.indexOf('margin-top: 14px') !== -1, 'отступ сверху');
        assertTrue(rule.indexOf('padding-top: 14px') !== -1, 'внутренний отступ');
        assertTrue(rule.indexOf('border-top: 1px solid') !== -1, 'линия-разделитель');
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] .ts-calc-panel .scale-form-label.ts-calc-sep') !== -1,
            'light-вариант линии');
    });

    test('подписи form-label в панелях — как scale-form-label (12px)', () => {
        const i = INDEX_SRC.indexOf('.ts-calc-panel .form-label {');
        assertTrue(i !== -1, 'правило form-label');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i));
        assertTrue(rule.indexOf('font-size: 12px') !== -1, 'размер 12px');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ts-calc-panel .form-label') !== -1,
            'light-вариант');
    });

    test('отступ панелей в col-input: 8px 0 12px (сильнее нуля Task 179)', () => {
        const i = INDEX_SRC.indexOf(
            '.conv-3col-page .conv-col-input .scale-form.ts-calc-panel');
        assertTrue(i !== -1, 'правило scale-form.ts-calc-panel');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i));
        assertTrue(rule.indexOf('margin: 8px 0 12px') !== -1, 'отступ 8/12');
        assertTrue(rule.indexOf('converter-form.ts-calc-panel') !== -1,
            'конвертер в том же правиле');
    });

    test('light-тема полей в панелях', () => {
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] .ts-calc-panel input.scale-field, [data-theme="light"] .ts-calc-panel select.scale-field') !== -1,
            'light-правило полей');
        const i = INDEX_SRC.indexOf(
            '[data-theme="light"] .ts-calc-panel input.scale-field::placeholder');
        assertTrue(i !== -1, 'light-плейсхолдер');
    });

    test('правила ПОСЛЕ базовых .ts-calc-field (Task 494) и ts-calc-inset (495)', () => {
        const iBase = INDEX_SRC.indexOf('.ts-calc-field {');
        const iInset = INDEX_SRC.indexOf('.ts-calc-panel.ts-calc-inset {');
        const iNew = INDEX_SRC.indexOf(
            '.ts-calc-panel input.scale-field, .ts-calc-panel select.scale-field');
        assertTrue(iBase !== -1 && iInset !== -1 && iNew !== -1, 'все три правила есть');
        assertTrue(iBase < iNew, 'правило Task 500 после .ts-calc-field');
        assertTrue(iInset < iNew, 'правило Task 500 после ts-calc-inset');
    });

    test('кастомные селекты в панелях: триггеры — крупный вид (52/19/700)', () => {
        // нативные select скрыты кастомными дропдаунами (cs-wrapper);
        // видимый элемент — .cs-trigger; в панелях он стилизован как поля
        const i = INDEX_SRC.indexOf('.ts-calc-panel .cs-trigger {');
        assertTrue(i !== -1, 'правило .cs-trigger в панелях есть');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i));
        assertTrue(rule.indexOf('height: 52px') !== -1, 'высота 52px');
        assertTrue(rule.indexOf('font-size: 19px') !== -1, 'шрифт 19px');
        assertTrue(rule.indexOf('font-weight: 700') !== -1, 'жирность 700');
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] .ts-calc-panel .cs-trigger {') !== -1,
            'light-вариант триггера');
        assertTrue(INDEX_SRC.indexOf(
            '.ts-calc-panel .cs-trigger:focus, .ts-calc-panel .cs-trigger.cs-open') !== -1,
            'фокус/открытие триггера');
        assertTrue(INDEX_SRC.indexOf('.ts-calc-panel .cs-wrapper { margin-bottom: 14px; }') !== -1,
            'отступ обёртки селекта = отступу полей');
    });

    test('спан-бейджи единиц НЕ получили вид полей (orifice)', () => {
        // бейджи «мм»/«—»/«кг/м³» — span class="scale-field" с inline-стилями
        const b = pageBlock('orifice-quick');
        assertTrue(b.indexOf('<span class="scale-field"') !== -1,
            'бейджи span.scale-field живы');
        assertTrue(b.indexOf('ts-calc-field') === -1,
            'класс ts-calc-field НЕ добавлен на страницу (бейджи целы)');
        assertTrue(INDEX_SRC.indexOf('span class="scale-field ts-calc-field"') === -1,
            'ни одного спана с классом поля во всём файле');
    });

    test('CSS-комментарий Task 500 с сутью заявки', () => {
        const i = INDEX_SRC.indexOf('/* Task 500 (заявка): единый стиль отображения');
        assertTrue(i !== -1, 'комментарий блока CSS');
        const seg = INDEX_SRC.slice(i, i + 1600);
        assertTrue(seg.indexOf('объединены в ОДНУ панель') !== -1,
            'упоминание объединения');
        assertTrue(seg.indexOf('спан-бейджи') !== -1, 'упоминание бейджей');
    });
});

// ==========================================================================
// E. ЦЕЛОСТНОСТЬ
// ==========================================================================
describe('Task 500 E: целостность страниц и JS', () => {
    test('все 25 страниц КИП и А парсятся (div-баланс pageBlock)', () => {
        const PAGES = ['conv-pressure', 'conv-flow', 'conv-mass', 'conv-temp',
            'conv-length', 'conv-density', 'conv-time', 'conv-volume',
            'scale-signal', 'error-pressure', 'error-temp-rtd', 'error-temp-tc',
            'error-flow', 'error-level', 'error-generic-number',
            'error-generic-underline', 'error-generic-circle',
            'error-generic-fraction', 'error-scale', 'error-kit',
            'buoy-calc', 'orifice-quick', 'orifice-dp', 'orifice-flow',
            'orifice-diameter', 'temp-sensor-view'];
        let ok = 0;
        PAGES.forEach((pid) => {
            if (pageBlock(pid) !== null) ok++;
        });
        assertEqual(ok, PAGES.length, 'страниц закрылись: ' + ok + '/' + PAGES.length);
    });

    test('JS-функции страниц НЕ тронуты (живой расчёт)', () => {
        ['setScaleDefaults', 'setSignalDefaults', 'calcScaleSignal',
         'updateBuoySignalUnit', 'calculateBuoyCalibration',
         'updateOqMediumDefaults', 'calcOrificeQuick', 'updateOpFlowForm'
        ].forEach((fn) => {
            assertTrue(INDEX_SRC.indexOf('function ' + fn + '(') !== -1,
                'функция ' + fn + ' жива');
        });
    });

    test('temp-sensor-view: эталонный стиль не сломан (регрессия 495)', () => {
        const b = pageBlock('temp-sensor-view');
        assertTrue(b.indexOf('class="ts-calc-panel" id="tempCustomCalcPanel"') !== -1,
            'ППР как был');
        assertTrue(b.indexOf('class="ts-calc-panel ts-calc-inset" id="tempTableFormPanel"') !== -1,
            'блок таблицы как был');
        assertTrue(b.indexOf('class="scale-field ts-calc-field"') !== -1,
            'поля с классом ts-calc-field как были');
    });
});

// ==========================================================================
// F. SW: версия и комментарий
// ==========================================================================
describe('Task 500 F: SW', () => {
    test("sw.js: CACHE_VERSION = 'kipia-test-v746'", () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v746';") !== -1,
            'версия поднята');
    });

    test('v725 в sw.js отсутствует (лишний инкремент не сделан)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v747') === -1);
    });

    test('комментарий Task 500 в шапке версий (окно 1600)', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v746';");
        // Task 501: комментарий электротехники/геометрии (~380 симв.)
        // отодвинул Task 500 до ~821 — окно 500 → 1600.
                // Task 508: окно 2200 → 2800 — комментарий архива
        // Кабельного журнала отодвинул Task 500 до ~2568.
const ctx = SW_SRC.slice(Math.max(0, i - 2800), i);
        assertTrue(ctx.indexOf('Task 500') !== -1, 'маркер задачи');
        assertTrue(ctx.indexOf('ОДНУ панель') !== -1, 'суть объединения');
        assertTrue(ctx.indexOf('ts-calc-sep') !== -1, 'разделители');
        assertTrue(ctx.indexOf('Клиент-only') !== -1, 'клиент-only');
    });

    test('комментарий ПОСЛЕ Task 499 (порядок в шапке)', () => {
        const i499 = SW_SRC.indexOf('// Task 499:');
        const i500 = SW_SRC.indexOf('// Task 500:');
        assertTrue(i499 !== -1 && i500 !== -1 && i499 < i500,
            'Task 500 добавлен после Task 499');
    });
});

console.log('test-task500: все describes зарегистрированы');
