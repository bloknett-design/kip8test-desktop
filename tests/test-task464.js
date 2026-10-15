// tests/test-task464.js
// Task 464 — заявка пользователя: «Сделал скрипты, создалась новый
// лист Архив создал, отметки мероприятий работают. Краткую
// инструкцию над таблицей "Нажмите на ячейку месяца, чтобы отметить
// выполнение мероприятия — отметка с датой сохраняется в архив файла
// Мероприятия_КИП_ИОС" убери. Ширину столбца с мероприятиями сделай
// по тексту в нём. В диалоговом окне подтверждения отметки, кнопку
// "Отмена" подкрась немного в красный, а кнопку "Отметить"
// переименуй в "Подтвердить". После выполнения отметки сделай
// возможность отредактировать дату и отменить выполнение отметки.
// В мобильной версии, для компактности, оставляй только столбец с
// мероприятиями и текущий месяц, с возможностью выбора месяца. И
// перенеси изменения в боевой kip8.»
//
// РЕШЕНИЕ:
//   клиент (index.html): подсказка peHint удалена; колонка
//   мероприятий width: auto + nowrap (по тексту); кнопка
//   подтверждения «Подтвердить», «Отмена» слегка красная
//   (pe-cancel-red); НОВЫЙ диалог правки _editDialog —
//   [Отмена][Удалить отметку (pe-unmark-btn, красная)]
//   [Сохранить дату]; _saveDate → planEvents.update,
//   _unmarkCell → planEvents.unmark; мобильная компактность:
//   селектор #peMonthSel (полоса .pe-month-bar, только
//   <= 1023px) + классы колонок pe-mo-N (_tagColumns) и
//   скрытие pe-mo-off (_applyMonth, только на мобайле);
//   сервер (scripts/PlanEvents.gs + 2 case в Code.gs):
//   planEvents.update — правка даты_выполнения + время_отметки
//   всех строк ключа, not_found если записи нет;
//   planEvents.unmark — deleteRow всех строк ключа (с конца),
//   идемпотентно removed:false; SRV_VER '464';
//   SW: kipia-test-v744.
//
// Запуск: через tests/run-all.js (require './test-task464.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'PlanEvents.gs'), 'utf8');
const CODE_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Code.gs'), 'utf8');

function extractMethod(src, name) {
    const start = src.indexOf(name + ': function(');
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

const PE_MODULE_SRC = (function() {
    const a = INDEX_SRC.indexOf('var PlanEventsData = {');
    const b = INDEX_SRC.indexOf('var WorkSchedule = {');
    return (a !== -1 && b !== -1 && b > a) ? INDEX_SRC.slice(a, b) : '';
})();

function methodText(src, name) {
    const m = extractMethod(src, name);
    return m ? String(m) : '';
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// ============================================================
// 1. SRC — HTML: подсказка удалена, селектор месяца на месте
// ============================================================
describe('Task 464 — SRC: HTML страницы plan-events', () => {

    test('подсказка над таблицей удалена', () => {
        assertTrue(INDEX_SRC.indexOf('peHint') === -1,
            'элемент peHint удалён');
        assertTrue(INDEX_SRC.indexOf('class="pe-hint"') === -1,
            'класс pe-hint удалён');
        assertTrue(INDEX_SRC.indexOf('Нажмите на ячейку месяца, чтобы отметить') === -1,
            'текст инструкции удалён');
    });

    test('полоса выбора месяца на месте подсказки (внутри карточки)', () => {
        const i = INDEX_SRC.indexOf('class="pe-month-bar"');
        assertTrue(i !== -1, 'полоса .pe-month-bar определена');
        const card = INDEX_SRC.indexOf('<div class="pe-card">');
        const grid = INDEX_SRC.indexOf('<div class="pe-grid-wrap">');
        assertTrue(card !== -1 && i > card && i < grid,
            'полоса внутри карточки, перед таблицей');
    });

    test('селектор месяца: label + select#peMonthSel', () => {
        assertTrue(INDEX_SRC.indexOf('id="peMonthSel"') !== -1,
            'селектор определён');
        assertTrue(INDEX_SRC.indexOf('class="pe-month-bar-label" for="peMonthSel"') !== -1,
            'подпись «Месяц» связана с селектором');
        assertTrue(INDEX_SRC.indexOf('aria-label="Месяц для отображения"') !== -1,
            'aria-label селектора');
    });

    test('разметка ячеек не содержит классов месяцев (ставит JS)', () => {
        // Task 470: 96 → 120 пустых ячеек (новые мероприятия Task 470)
        assertEqual(120, INDEX_SRC.split('<td class="pe-m"></td>').length - 1,
            'пустые ячейки месяцев в разметке не тронуты');
    });
});

// ============================================================
// 2. SRC — CSS: ширина по тексту, кнопки, мобильный блок
// ============================================================
describe('Task 464 — SRC: CSS правок', () => {

    test('колонка мероприятий — по тексту (auto + nowrap)', () => {
        assertTrue(INDEX_SRC.indexOf('.pe-col-name { width: auto; }') !== -1,
            'width: auto (было 300px)');
        assertTrue(INDEX_SRC.indexOf('.pe-name, .pe-th-name { white-space: nowrap; }') !== -1,
            'без переносов');
        assertFalse(INDEX_SRC.indexOf('.pe-col-name { width: 300px; }') !== -1,
            'фиксированная ширина удалена');
    });

    test('«Отмена» диалога подтверждения слегка красная (pe-cancel-red)', () => {
        const i = INDEX_SRC.indexOf('.pe-dialog .kip-dialog-cancel.pe-cancel-red');
        assertTrue(i !== -1, 'правило стиля есть');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(/rgba\(220,\s*80,\s*80/.test(block) || block.indexOf('#d98484') !== -1,
            'красный оттенок в тёмной теме: ' + block);
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .pe-dialog .kip-dialog-cancel.pe-cancel-red') !== -1,
            'светлая тема тоже подкрашена');
    });

    test('кнопка «Удалить отметку» — красная (pe-unmark-btn)', () => {
        const i = INDEX_SRC.indexOf('.pe-dialog .kip-dialog-btn.pe-unmark-btn');
        assertTrue(i !== -1, 'правило стиля есть');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(/rgba\(220,\s*80,\s*80/.test(block),
            'красный фон опасной кнопки');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .pe-dialog .kip-dialog-btn.pe-unmark-btn') !== -1,
            'светлая тема');
    });

    test('полоса выбора месяца скрыта на десктопе', () => {
        const i = INDEX_SRC.indexOf('.pe-month-bar {');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(block.indexOf('display: none') !== -1,
            'по умолчанию скрыта');
    });

    test('media <= 1023px: полоса видима + скрытие pe-mo-off', () => {
        // Якорь — само правило скрытия (первый @media (max-width: 1023px)
        // в файле — чужой, из другой секции)
        const i = INDEX_SRC.indexOf('.pe-table .pe-mo-off { display: none; }');
        assertTrue(i !== -1, 'правило скрытия неактивных месяцев есть');
        const above = INDEX_SRC.slice(Math.max(0, i - 300), i);
        assertTrue(above.indexOf('@media (max-width: 1023px)') !== -1,
            'правило внутри мобильного media-блока');
        const j = INDEX_SRC.indexOf('.pe-month-bar { display: flex; }');
        assertTrue(j !== -1 && Math.abs(j - i) < 300,
            'полоса выбора показывается в том же media-блоке');
    });

    test('media <= 1023px: компактность — таблица 100% + переносы', () => {
        // Десктопный nowrap «по тексту» на 375px не оставляет места
        // столбцу месяца (352+46px) — на мобайле наименования переносятся
        const i = INDEX_SRC.indexOf('.pe-table { width: 100%; }');
        assertTrue(i !== -1, 'таблица на всю ширину на мобайле');
        const around = INDEX_SRC.slice(Math.max(0, i - 700), i + 100);
        assertTrue(around.indexOf('@media (max-width: 1023px)') !== -1,
            'внутри мобильного media-блока');
        assertTrue(INDEX_SRC.indexOf('.pe-name, .pe-th-name { white-space: normal; }') !== -1,
            'перенос наименований на мобайле');
        assertTrue(INDEX_SRC.indexOf('.pe-table col.pe-col-month { width: 0; }') !== -1,
            'col месяцев не резервировал пустые слоты скрытых месяцев');
    });

    test('стили селектора месяца под темы', () => {
        assertTrue(INDEX_SRC.indexOf('.pe-month-select {') !== -1,
            'базовые стили селектора');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .pe-month-select {') !== -1,
            'светлая тема селектора');
    });
});

// ============================================================
// 3. SRC — модуль PlanEventsData: новые методы
// ============================================================
describe('Task 464 — SRC: модуль PlanEventsData', () => {

    test('init: разметка колонок + селектор месяца', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, 'init'));
        assertTrue(fn.indexOf('_tagColumns(table)') !== -1,
            'вызов _tagColumns');
        assertTrue(fn.indexOf('_initMonthSelect()') !== -1,
            'вызов _initMonthSelect');
        assertTrue(fn.indexOf('loadMarks(true)') !== -1,
            'автозагрузка отметок сохранена');
    });

    test('_tagColumns: классы pe-mo-N на шапке и ячейках', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, '_tagColumns'));
        assertTrue(fn.indexOf('tr.pe-head-months th') !== -1,
            'шапка месяцев');
        assertTrue(fn.indexOf('td.pe-m') !== -1, 'ячейки строк');
        assertTrue(fn.indexOf("'pe-mo-' + (i + 1)") !== -1 &&
                   fn.indexOf("'pe-mo-' + (j + 1)") !== -1,
            'классы 1..12 по индексу');
    });

    test('_initMonthSelect: опции MONTHS, текущий по умолчанию, change', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, '_initMonthSelect'));
        assertTrue(fn.indexOf('peMonthSel') !== -1, 'селектор по id');
        assertTrue(fn.indexOf('this.MONTHS') !== -1, 'опции из MONTHS');
        assertTrue(fn.indexOf('new Date().getMonth() + 1') !== -1,
            'по умолчанию текущий месяц');
        assertTrue(fn.indexOf("addEventListener('change'") !== -1,
            'слушатель смены месяца');
        assertTrue(fn.indexOf('_applyMonth') !== -1,
            'применение выбора');
    });

    test('_applyMonth: pe-mo-off всем, кроме выбранного', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, '_applyMonth'));
        assertTrue(fn.indexOf('[class*="pe-mo-"]') !== -1,
            'выбор всех колонок месяцев');
        assertTrue(fn.indexOf('pe-mo-(\\d+)') !== -1 || fn.indexOf('pe-mo-') !== -1,
            'разбор номера месяца из класса');
        assertTrue(fn.indexOf('toggle') !== -1,
            'переключение класса');
    });

    test('_cellClick: отмеченная → _editDialog (правка/снятие)', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, '_cellClick'));
        assertTrue(fn.indexOf('_editDialog') !== -1,
            'диалог правки для отмеченной');
        assertTrue(fn.indexOf("res.action === 'unmark'") !== -1,
            'ветка unmark');
        assertTrue(fn.indexOf('_saveDate') !== -1, 'ветка правки даты');
        assertTrue(fn.indexOf('_confirmDialog') !== -1,
            'диалог подтверждения для пустой');
    });

    test('_editDialog: три кнопки + валидация даты', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, '_editDialog'));
        assertTrue(fn.indexOf('Изменение отметки') !== -1,
            'заголовок «Изменение отметки»');
        assertTrue(fn.indexOf('Удалить отметку') !== -1,
            'кнопка удаления отметки');
        assertTrue(fn.indexOf('pe-unmark-btn') !== -1, 'красный класс кнопки');
        assertTrue(fn.indexOf('Сохранить дату') !== -1,
            'кнопка сохранения даты');
        assertTrue(fn.indexOf('выполнено ') !== -1,
            'текущая дата в подписи');
        assertTrue(fn.indexOf("mark['дата_выполнения']") !== -1,
            'дата отметки в поле (prefill)');
        assertTrue(fn.indexOf('Укажите дату выполнения') !== -1,
            'валидация даты');
        assertTrue(fn.indexOf("{ action: 'unmark' }") !== -1 &&
                   fn.indexOf("{ action: 'save', date: d }") !== -1,
            'результаты промиса');
    });

    test('_saveDate: planEvents.update + busy + перерисовка', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, '_saveDate'));
        assertTrue(fn.indexOf("api('planEvents.update'") !== -1,
            'вызов planEvents.update');
        ['token', 'year: this._viewYear', 'month: info.month',
         'event: info.event', 'date: date'].forEach(function(frag) {
            assertTrue(fn.indexOf(frag) !== -1, 'в payload: ' + frag);
        });
        assertTrue(fn.indexOf('pe-m-busy') !== -1, 'busy на время запроса');
        assertTrue(fn.indexOf('_rebuildIndex') !== -1, 'перестройка индекса');
        assertTrue(fn.indexOf('_setCell') !== -1, 'перерисовка ячейки');
        assertTrue(fn.indexOf('Дата отметки обновлена') !== -1,
            'тост успеха');
        assertTrue(fn.indexOf('Не удалось сохранить дату') !== -1,
            'тост ошибки');
    });

    test('_unmarkCell: planEvents.unmark + крестик + тост', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, '_unmarkCell'));
        assertTrue(fn.indexOf("api('planEvents.unmark'") !== -1,
            'вызов planEvents.unmark');
        ['token', 'year: this._viewYear', 'month: info.month',
         'event: info.event'].forEach(function(frag) {
            assertTrue(fn.indexOf(frag) !== -1, 'в payload: ' + frag);
        });
        assertFalse(fn.indexOf('date:') !== -1, 'даты в payload снятия НЕТ');
        assertTrue(fn.indexOf('_setCell(td, null)') !== -1,
            'ячейка возвращается к крестику');
        assertTrue(fn.indexOf('Отметка снята') !== -1, 'тост успеха');
        assertTrue(fn.indexOf('Не удалось снять отметку') !== -1,
            'тост ошибки');
        assertTrue(fn.indexOf('pe-m-busy') !== -1, 'busy на время запроса');
    });

    test('_confirmDialog: кнопка «Подтвердить» (была «Отметить»)', () => {
        const fn = stripComments(methodText(PE_MODULE_SRC, '_confirmDialog'));
        assertTrue(fn.indexOf('>Подтвердить</button>') !== -1,
            'текст кнопки «Подтвердить»');
        assertFalse(fn.indexOf('>Отметить</button>') !== -1,
            'старого текста «Отметить» нет');
        assertTrue(fn.indexOf('pe-cancel-red') !== -1,
            'класс красной «Отмены»');
    });
});

// ============================================================
// 4. SRC — сервер PlanEvents.gs: update / unmark
// ============================================================
describe('Task 464 — SRC: сервер PlanEvents.gs', () => {

    test('SRV_VER поднят (Task 471: 471)', () => {
        // Task 471: сервер расширен (planEvents.years + planWorks.*),
        // версия поднята 464 → 471
        assertTrue(GS_SRC.indexOf("SRV_VER: '471'") !== -1,
            'SRV_VER: 471');
    });

    test('update: валидация полей как у mark', () => {
        const fn = stripComments(methodText(GS_SRC, 'update'));
        ['invalid_year', 'invalid_month', 'invalid_event', 'invalid_date'].forEach(function(code) {
            assertTrue(fn.indexOf(code) !== -1, 'код ошибки: ' + code);
        });
    });

    test('update: правка даты + времени у найденных строк', () => {
        const fn = stripComments(methodText(GS_SRC, 'update'));
        assertTrue(fn.indexOf('hitRows') !== -1, 'поиск строк ключа');
        assertTrue(fn.indexOf("getRange(hitRows[j], 2).setValue(date)") !== -1,
            'колонка B (дата_выполнения)');
        assertTrue(fn.indexOf("getRange(hitRows[j], 7).setValue(this._isoNow())") !== -1,
            'колонка G (время_отметки)');
    });

    test('update: not_found — отметки нет', () => {
        const fn = stripComments(methodText(GS_SRC, 'update'));
        assertTrue(fn.indexOf("error: 'not_found'") !== -1,
            'код not_found');
        assertTrue(fn.indexOf('Отметка не найдена') !== -1,
            'понятное сообщение');
    });

    test('update: аудит PLAN_EVENTS_UPDATE', () => {
        const fn = stripComments(methodText(GS_SRC, 'update'));
        assertTrue(fn.indexOf('PLAN_EVENTS_UPDATE') !== -1,
            'код аудита');
    });

    test('unmark: удаление строк с КОНЦА (индексы не съезжают)', () => {
        const fn = stripComments(methodText(GS_SRC, 'unmark'));
        assertTrue(fn.indexOf('vals.length - 1; i >= 0; i--') !== -1,
            'обход с конца');
        assertTrue(fn.indexOf('deleteRow(i + 2)') !== -1, 'deleteRow');
    });

    test('unmark: идемпотентность — removed:false без ошибки', () => {
        const fn = stripComments(methodText(GS_SRC, 'unmark'));
        assertTrue(fn.indexOf('removed: removed > 0') !== -1,
            'removed: bool');
        assertFalse(fn.indexOf("error: 'not_found'") !== -1,
            'отсутствие отметки — НЕ ошибка');
    });

    test('unmark: аудит PLAN_EVENTS_UNMARK', () => {
        const fn = stripComments(methodText(GS_SRC, 'unmark'));
        assertTrue(fn.indexOf('PLAN_EVENTS_UNMARK') !== -1,
            'код аудита');
    });

    test('unmark: даты в payload НЕ требуется', () => {
        const fn = stripComments(methodText(GS_SRC, 'unmark'));
        assertFalse(fn.indexOf('_normDate(payload.date)') !== -1,
            'дата не парсится (снятие — без даты)');
    });

    test('шапка: эндпоинты update/unmark документированы', () => {
        assertTrue(GS_SRC.indexOf('planEvents.update') !== -1 &&
                   GS_SRC.indexOf('planEvents.unmark') !== -1,
            'эндпоинты в шапке модуля');
        assertTrue(GS_SRC.indexOf('Task 464') !== -1, 'маркер Task 464');
    });
});

// ============================================================
// 5. SRC — маршрутизация Code.gs
// ============================================================
describe('Task 464 — SRC: Code.gs маршрутизация', () => {

    test('case planEvents.update / planEvents.unmark перед default', () => {
        assertTrue(CODE_SRC.indexOf("case 'planEvents.update':") !== -1,
            'case update');
        assertTrue(CODE_SRC.indexOf("case 'planEvents.unmark':") !== -1,
            'case unmark');
        const iUpd = CODE_SRC.indexOf("case 'planEvents.update':");
        const iDefault = CODE_SRC.indexOf('default:');
        assertTrue(iUpd !== -1 && iDefault !== -1 && iUpd < iDefault,
            'case до default');
        assertTrue(CODE_SRC.indexOf('PlanEvents.update(payload)') !== -1 &&
                   CODE_SRC.indexOf('PlanEvents.unmark(payload)') !== -1,
            'вызовы модуля');
    });

    test('шапка Code.gs дополнена Task 464', () => {
        assertTrue(CODE_SRC.indexOf('Task 464') !== -1,
            'упоминание Task 464');
    });
});

// ============================================================
// 6. SW: версия кэша + комментарий
// ============================================================
describe('Task 464 — SW: версия кэша', () => {

    test('CACHE_VERSION = kipia-test-v744', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v744';") !== -1,
            'текущая версия v688');
    });

    test('v687 в sw.js отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v687') === -1,
            'версии до Task 464 нет');
    });

    test('комментарий Task 464 о составе правок', () => {
        assertTrue(SW_SRC.indexOf('Task 464') !== -1, 'маркер задачи');
        assertTrue(SW_SRC.indexOf('peMonthSel') !== -1 ||
                   SW_SRC.indexOf('правка') !== -1,
            'упоминание правки/снятия или селектора месяца');
    });
});

console.log('test-task464: все describes зарегистрированы');
