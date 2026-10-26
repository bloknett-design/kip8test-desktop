// tests/test-task310.js
// Task 310 — рамка ручных д/н 1px с закруглёнными углами, «Старт
// цикла» убран из карточки, дни отпуска за вычетом праздников +
// годовой лимит 42 дн. Заявка пользователя:
//   «у ячеек с строчными "д"/"н" переделай рамку 2px на 1px и с
//    закруглёнными углами. В карточке сотрудника убери строку
//    "Старт цикла", итог подсчёта количества дней отпуска должен
//    суммироваться с учётом вычета праздничных нерабочих дней
//    попавших на период отпуска (максимальное количество отпуска
//    в год не должно превышать 42 дня на химическом производстве
//    по ТК РФ)».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   Рамка д/н (детали — в актуализированном test-task309.js):
//     — ::before с border 1px + border-radius 3px, обе темы.
//   Карточка сотрудника:
//     — строка «Старт цикла» убрана из _renderEmpPopup (поле
//       старт_цикла живо на сервере и в шторке «+ Сотрудник»);
//     — итог года: «чистые» дни (_vacNetDaysInYear) + сноска
//       «вычтено праздников: N» + «· лимит 42»; превышение —
//       красный класс ws-emp-overlimit и «ПРЕВЫШЕН лимит».
//   Праздники × отпуск (ст. 112 + ст. 120 ТК РФ) — ФУНКЦИОНАЛЬНО
//   (vm-исполнение методов из index.html, ProdCalendar — мок):
//     — _vacIsHoliday: праздники ст. 112 → true, обычный день и
//       ОБЫЧНАЯ СУББОТА → false (выходные в отпуск входят!);
//       без ProdCalendar → false (мягкая деградация);
//     — _vacSplitDays: {cal, hol, net} на периодах с праздниками
//       и без; 01–14 января → 14 кал. − 8 праздн. = 6;
//     — _vacNetDays: период целиком;
//     — _vacNetDaysInYear: период через границу года — вычет
//       праздников распределяется по году, где праздник лежит.
//   Шторка «+ Отпуск»:
//     — #wsVacYearInfo: «запланировано X из 42 …», «— ПРЕВЫШЕНИЕ»
//       и класс ws-vac-overlimit; год — из даты начала формы;
//     — onVacDatesChange: «в счёт отпуска N (вычтено праздников:
//       K, ст. 120 ТК РФ)», обновляет строку лимита;
//     — submitVacationForm: usedNet + addNet > 42 → тост + return
//       ДО вызова addVacation (на сервер не уходит);
//     — подсказка шторки упоминает ст. 120 и лимит 42 дня.
//   Тултип плана отпуска в ячейке: чистые дни + «(−N праздн.)».
//   SW: kipia-test-v760.
//
// Запуск: через tests/run-all.js (require './test-task310.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Вырезка тела функции: от сигнатуры до следующего «имя: function»
function fnBody(src, signature) {
    const i = src.indexOf(signature);
    if (i === -1) return '';
    const rest = src.slice(i + signature.length);
    const m = rest.match(/^[\s\S]*?\n        [a-zA-Z_]+: function/);
    return m ? m[0] : rest;
}

// Извлечение метода объекта WorkSchedule (баланс фигурных скобок)
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

// ============================================================
// Функциональная часть: хелперы Task 310 в vm-песочнице
// ============================================================
// Мок ProdCalendar.dayInfo — праздники ст. 112 ТК РФ (карта
// _FIXED_TITLES: 1–8 января, 23.02, 08.03, 01.05, 09.05, 12.06,
// 04.11). Выходные Сб/Вс в моке НЕ праздничные — как в реальном
// ProdCalendar (holiday ≠ off).
const HOL_MMDD = ['0101', '0102', '0103', '0104', '0105', '0106',
                  '0107', '0108', '0223', '0308', '0501', '0509',
                  '0612', '1104'];
const HOL_SET = {};
HOL_MMDD.forEach(function(mmdd) { HOL_SET[mmdd] = true; });

function mmddOf(y, m, d) {
    return String(m).padStart(2, '0') + String(d).padStart(2, '0');
}

function makeWS(withProdCalendar) {
    const names = ['_vacIsHoliday', '_vacSplitDays', '_vacNetDays',
                   '_vacNetDaysInYear', '_parseIsoLocal'];
    const src = names.map(function(n) { return extractMethod(INDEX_SRC, n); })
                     .filter(Boolean).join(',\n');
    const ctx = {
        Math: Math, Date: Date, String: String, Number: Number,
        parseInt: parseInt, isNaN: isNaN
    };
    if (withProdCalendar) {
        ctx.ProdCalendar = {
            dayInfo: function(y, m, d) {
                return { holiday: !!HOL_SET[mmddOf(y, m, d)] };
            }
        };
    }
    vm.createContext(ctx);
    vm.runInContext('var WSMixin = { ' + src + ' };', ctx,
        { filename: 'index.html-WS-vac' });
    return ctx.WSMixin;
}

const WS_PC = makeWS(true);      // с ProdCalendar (обычный случай)
const WS_NO_PC = makeWS(false);  // ProdCalendar нет — мягкая деградация

describe('Task 310 — рамка д/н 1px с закруглением', () => {

    test('CSS: ::before border 1px + border-radius 3px, pointer-events: none', () => {
        const sel = '.ws-grid tbody td.ws-cell.ws-manual-dn::before {';
        const i = INDEX_SRC.indexOf(sel);
        assertTrue(i !== -1, 'правило ::before есть (радиус на td в border-collapse не работает)');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i));
        assertTrue(rule.indexOf('border: 1px solid') !== -1,
            'толщина рамки 1px (было 2px в Task 309)');
        assertTrue(rule.indexOf('border-radius: 3px') !== -1,
            'закруглённые углы — как у свотча .ws-popup-swatch');
        assertTrue(rule.indexOf('pointer-events: none') !== -1,
            'клики по ячейке проходят сквозь рамку');
        // 2px-тень Task 309 ушла из правила д/н (в app остаётся
        // .fav-card-drag-over — другой, живой компонент)
        assertFalse(INDEX_SRC.indexOf('.ws-grid tbody td.ws-cell.ws-manual-dn {') !== -1,
            'старого селектора без ::before нет');
        assertFalse(INDEX_SRC.indexOf('box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.85)') !== -1 ||
            INDEX_SRC.indexOf('box-shadow: inset 0 0 0 2px rgba(38, 50, 56, 0.75)') !== -1,
            'инсет-тени 2px из правила д/н удалены');
    });
});

describe('Task 310 — карточка: «Старт цикла» убран', () => {

    test('JS: _renderEmpPopup без «Старт цикла» и старт_цикла', () => {
        const rep = fnBody(INDEX_SRC, '_renderWorkerCard: function');
        assertTrue(rep.indexOf("['Старт цикла',") === -1,
            'строки «Старт цикла» в выводе карточки нет');
        assertTrue(rep.indexOf("emp['старт_цикла']") === -1,
            'поле старт_цикла в карточке не читается');
        // остальные поля профиля живы (Task 311: «Шаблон ротации»
        // тоже убрана из карточки — см. test-task309/311; Task 318:
        // «Тип» переименована в «Режим работы» — заявка)
        assertTrue(rep.indexOf("'Режим работы'") !== -1 && rep.indexOf("'Должность'") !== -1,
            'Режим работы и Должность на месте');
        assertTrue(rep.indexOf("'Дата приёма'") !== -1,
            'Дата приёма на месте');
    });

    test('JS: шторка «+ Сотрудник» поле не тронута (label wsEmpStart жив)', () => {
        // данные старт_цикла остаются в форме добавления и на сервере —
        // убрано только отображение в карточке
        assertTrue(INDEX_SRC.indexOf('for="wsEmpStart"') !== -1,
            'label «Старт цикла» в шторке сотрудника остался');
        assertTrue(INDEX_SRC.indexOf("id=\"wsEmpStart\"") !== -1,
            'инпут wsEmpStart остался');
    });
});

describe('Task 310 — праздники ТК РФ × дни отпуска (функционально)', () => {

    test('_vacIsHoliday: праздники ст. 112 → true', () => {
        assertEqual(WS_PC._vacIsHoliday(new Date(2026, 0, 1)), true, '01.01 Новогодние каникулы');
        assertEqual(WS_PC._vacIsHoliday(new Date(2026, 0, 7)), true, '07.01 Рождество');
        assertEqual(WS_PC._vacIsHoliday(new Date(2026, 1, 23)), true, '23.02');
        assertEqual(WS_PC._vacIsHoliday(new Date(2026, 2, 8)), true, '08.03');
        assertEqual(WS_PC._vacIsHoliday(new Date(2026, 4, 1)), true, '01.05');
        assertEqual(WS_PC._vacIsHoliday(new Date(2026, 4, 9)), true, '09.05');
        assertEqual(WS_PC._vacIsHoliday(new Date(2026, 5, 12)), true, '12.06');
        assertEqual(WS_PC._vacIsHoliday(new Date(2026, 10, 4)), true, '04.11');
    });

    test('_vacIsHoliday: обычные дни и СУББОТЫ → false (в отпуск входят)', () => {
        // ст. 120 ТК РФ: вычитаются только НЕРАБОЧИЕ ПРАЗДНИЧНЫЕ дни;
        // обычные выходные Сб/Вс входят в календарные дни отпуска
        assertEqual(WS_PC._vacIsHoliday(new Date(2026, 5, 6)), false, 'суббота 06.06.2026');
        assertEqual(WS_PC._vacIsHoliday(new Date(2026, 5, 13)), false, 'суббота 13.06.2026');
        assertEqual(WS_PC._vacIsHoliday(new Date(2026, 5, 15)), false, 'понедельник 15.06.2026');
        assertEqual(WS_PC._vacIsHoliday(null), false, 'null → false');
    });

    test('_vacIsHoliday: без ProdCalendar → false (мягкая деградация)', () => {
        assertEqual(WS_NO_PC._vacIsHoliday(new Date(2026, 0, 1)), false,
            'данных нет — праздник не вычитается, отпуск не урезается');
    });

    test('_vacSplitDays: период с праздниками 01.05–10.05.2026 (два!)', () => {
        const r = WS_PC._vacSplitDays(
            WS_PC._parseIsoLocal('2026-05-01'), WS_PC._parseIsoLocal('2026-05-10'));
        assertEqual(r.cal, 10, '10 календарных дней');
        assertEqual(r.hol, 2, 'два праздника (01.05 и 09.05)');
        assertEqual(r.net, 8, 'в счёт отпуска 8 дней');
    });

    test('_vacSplitDays: новогодние каникулы 01–14.01.2026 (8 праздников)', () => {
        const r = WS_PC._vacSplitDays(
            WS_PC._parseIsoLocal('2026-01-01'), WS_PC._parseIsoLocal('2026-01-14'));
        assertEqual(r.cal, 14, '14 календарных дней');
        assertEqual(r.hol, 8, 'праздники 01–08 января');
        assertEqual(r.net, 6, 'в счёт отпуска только 6');
    });

    test('_vacSplitDays: период без праздников (субботы НЕ вычитаются)', () => {
        const r = WS_PC._vacSplitDays(
            WS_PC._parseIsoLocal('2026-06-01'), WS_PC._parseIsoLocal('2026-06-11'));
        assertEqual(r.cal, 11, '11 календарных дней');
        assertEqual(r.hol, 0, 'праздников нет (субботы 06/07.06 не в счёт)');
        assertEqual(r.net, 11, 'чистые = календарные');
    });

    test('_vacNetDays: объект периода целиком', () => {
        assertEqual(WS_PC._vacNetDays(
            { 'дата_начала': '2026-06-01', 'дата_окончания': '2026-06-14' }), 13,
            '01–14.06: 14 кал. − 1 (12.06) = 13');
        assertEqual(WS_PC._vacNetDays(
            { 'дата_начала': '2026-05-01', 'дата_окончания': '2026-05-01' }), 0,
            'однодневный отпуск в праздник 01.05 → 0');
    });

    test('_vacNetDaysInYear: период через границу года', () => {
        const v = { 'дата_начала': '2026-12-29', 'дата_окончания': '2027-01-11' };
        assertEqual(WS_PC._vacNetDaysInYear(v, 2026), 3,
            '2026: 29–31.12 — 3 кал., праздников нет');
        assertEqual(WS_PC._vacNetDaysInYear(v, 2027), 3,
            '2027: 01–11.01 — 11 кал. − 8 праздн. = 3');
        assertEqual(WS_PC._vacNetDaysInYear(v, 2025), 0,
            'год вне периода → 0');
    });

    test('_vacNetDaysInYear: без ProdCalendar = календарным дням года', () => {
        const v = { 'дата_начала': '2026-05-01', 'дата_окончания': '2026-05-10' };
        assertEqual(WS_NO_PC._vacNetDaysInYear(v, 2026), 10,
            'данных календаря нет — вычетов нет');
    });
});

describe('Task 310 — карточка: чистые дни периодов (Task 311: итог года убран)', () => {

    test('JS: дни периодов чистые (_vacNetDaysInYear), пометка праздников; итог года УБРАН', () => {
        const rep = fnBody(INDEX_SRC, '_renderWorkerCard: function');
        // Task 440: дни — по году БЛОКА «Отпуска» (wYearVac)
        assertTrue(rep.indexOf('_vacNetDaysInYear(vv, wYearVac)') !== -1,
            'дни периода в году — чистые (за вычетом праздников)');
        assertTrue(rep.indexOf('(−') !== -1 && rep.indexOf(' праздн.)') !== -1,
            'строка периода помечает вычтенные праздники');
        // Task 311: строка-итог «Итого в году» (и красный класс
        // ws-emp-overlimit) убраны из карточки — лимит контролирует
        // шторка «+ Отпуск» (строка годового лимита + блокировка)
        assertFalse(rep.indexOf('vacTotal +=') !== -1,
            'итог больше не суммируется в карточке (Task 311)');
        assertFalse(rep.indexOf('Итого в году') !== -1,
            'итог-строка года убрана (Task 311)');
        assertFalse(rep.indexOf('ws-emp-overlimit') !== -1,
            'класс превышения из рендера карточки ушёл');
        assertFalse(rep.indexOf('ПРЕВЫШЕН лимит ') !== -1,
            'текст превышения из карточки ушёл');
        // лимит из константы остался — для шторки «+ Отпуск»
        assertTrue(INDEX_SRC.indexOf('_VAC_YEAR_LIMIT: 42') !== -1,
            'константа лимита живёт (шторка «+ Отпуск»)');
    });

    test('JS: константа _VAC_YEAR_LIMIT = 42 с обоснованием ТК РФ', () => {
        const i = INDEX_SRC.indexOf('_VAC_YEAR_LIMIT: 42');
        assertTrue(i !== -1, 'константа определена (42 дня)');
        const around = INDEX_SRC.slice(Math.max(0, i - 700), i);
        assertTrue(around.indexOf('ст. 117') !== -1 && around.indexOf('ст. 118') !== -1,
            'комментарий: 28 осн. + 7 ст. 117 + 7 ст. 118 (хим. производство)');
    });

    test('CSS: Task 311 — ws-emp-total/ws-emp-overlimit удалены (итог в карточке убран)', () => {
        assertFalse(INDEX_SRC.indexOf('.ws-emp-total.ws-emp-overlimit') !== -1,
            'правило тёмной темы удалено (строки-итога больше нет)');
        assertFalse(INDEX_SRC.indexOf('[data-theme="light"] .ws-emp-total.ws-emp-overlimit') !== -1,
            'правило светлой темы удалено');
        assertFalse(INDEX_SRC.indexOf('.ws-emp-total {') !== -1,
            'базовый стиль итог-строки удалён');
    });
});

describe('Task 310 — шторка «+ Отпуск»: лимит года и чистые дни', () => {

    test('HTML: строка лимита #wsVacYearInfo + подсказка ст. 120/лимит', () => {
        assertTrue(INDEX_SRC.indexOf('id="wsVacYearInfo"') !== -1,
            'строка годового лимита в шторке');
        const hintIdx = INDEX_SRC.indexOf('class="ws-vac-form-hint"');
        const hint = INDEX_SRC.slice(hintIdx,
            INDEX_SRC.indexOf('</div>', hintIdx));
        assertTrue(hint.indexOf('ст. 120 ТК РФ') !== -1,
            'подсказка: праздники не включаются (ст. 120)');
        assertTrue(hint.indexOf('42 дня') !== -1,
            'подсказка: годовой лимит 42');
    });

    test('JS: _vacUpdateYearInfo — used/add/total, ПРЕВЫШЕНИЕ, класс', () => {
        const vyi = fnBody(INDEX_SRC, '_vacUpdateYearInfo: function');
        assertTrue(vyi.indexOf('_vacNetDaysInYear(v, year)') !== -1,
            'использованные дни — чистые');
        assertTrue(vyi.indexOf('_vacSplitDays(') !== -1,
            'новый период — тоже чистыми днями');
        assertTrue(vyi.indexOf('ws-vac-overlimit') !== -1,
            'класс превышения вешается на строку');
        assertTrue(vyi.indexOf('ПРЕВЫШЕНИЕ') !== -1,
            'текст превышения');
        assertTrue(vyi.indexOf("slice(0, 4)") !== -1,
            'год берётся из даты начала формы (период может уйти в другой год)');
        assertTrue(vyi.indexOf('из ' + "' + this._VAC_YEAR_LIMIT + '") !== -1,
            'показ «из 42»');
    });

    test('JS: onVacDatesChange — чистые дни + пересчёт лимита', () => {
        const odc = fnBody(INDEX_SRC, 'onVacDatesChange: function');
        assertTrue(odc.indexOf('_vacSplitDays(') !== -1,
            'дни периода считаются с праздниками');
        assertTrue(odc.indexOf('в счёт отпуска ') !== -1,
            'фраза «в счёт отпуска N»');
        assertTrue(odc.indexOf('вычтено праздников: ') !== -1,
            'пометка о вычтенных праздниках');
        assertTrue(odc.indexOf('ст. 120 ТК РФ') !== -1,
            'ссылка на норму права');
        assertTrue(odc.indexOf('this._vacUpdateYearInfo();') !== -1,
            'после смены дат обновляется строка лимита');
    });

    test('JS: onVacEmployeeChange обновляет лимит при смене сотрудника', () => {
        const oec = fnBody(INDEX_SRC, 'onVacEmployeeChange: function');
        assertTrue(oec.indexOf('this._vacUpdateYearInfo();') !== -1,
            'вызов обновления строки лимита');
    });

    test('JS: submitVacationForm блокирует превышение ДО отправки', () => {
        const svf = fnBody(INDEX_SRC, 'submitVacationForm: function');
        const limitIdx = svf.indexOf('usedNet + addNet > this._VAC_YEAR_LIMIT');
        assertTrue(limitIdx !== -1, 'проверка лимита есть');
        assertTrue(svf.indexOf('return;') !== -1 &&
            svf.indexOf('return;', limitIdx) < svf.indexOf("this._api('workSchedule.addVacation'"),
            'return ДО вызова addVacation — на сервер не уходит');
        const apiIdx = svf.indexOf("this._api('workSchedule.addVacation'");
        assertTrue(apiIdx !== -1, 'вызов API жив (нормальный путь)');
        assertTrue(svf.indexOf('_vacNetDaysInYear(lv, vacYear)') !== -1,
            'использовано — чистыми днями года периода');
        assertTrue(svf.indexOf('_vacSplitDays(') !== -1,
            'добавляемый период — чистыми днями');
    });
});

describe('Task 310/311 — тултип плана отпуска в ячейке (УДАЛЁН)', () => {

    test('JS: Task 311 — тултипы (title) с ячеек шахматки убраны', () => {
        const rc = INDEX_SRC.slice(
            INDEX_SRC.indexOf('_renderCell: function'),
            INDEX_SRC.indexOf('generateYear: function'));
        // Task 311: пояснительные окна при наведении на ячейки
        // шахматки убраны — вся информация в попапе клика
        assertFalse(rc.indexOf('ОТПУСК (план') !== -1,
            'тултип плана отпуска убран');
        assertFalse(rc.indexOf('title="' + "' + this._escAttr") !== -1,
            'рендер ячейки не собирает title-атрибут');
        assertFalse(rc.indexOf('titleParts') !== -1,
            'сборка тултипа из частей удалена');
        assertFalse(rc.indexOf('заполнится кодом «ОТ» при «Сформировать»') !== -1,
            'подсказка «Сформировать» из тултипа убрана (есть в попапе клика)');
        // при этом сам код плана «ОТ» в ячейке остался
        assertTrue(rc.indexOf("'ОТ'") !== -1,
            'код плана «ОТ» в ячейке жив');
    });
});

describe('Task 310 — Service Worker', () => {

    test('SW: версия кэша kipia-test-v760', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v760'") !== -1,
            'CACHE_VERSION в sw.js = kipia-test-v760');
        // Task 311 поднял версию до v550 — v549 (версия Task 310) ушла
        assertFalse(SW_SRC.indexOf('kipia-test-v549') !== -1,
            'старой версии v549 нет');
    });
});
