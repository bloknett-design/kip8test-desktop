// tests/test-task553.js
// Task 553 — блок «Повторные инструктажи и периодическая проверка
// знаний» карточки работника (страница «Работники» раздела «Табель
// учёта рабочего времени»): отображение ПРИМЕЧАНИЯ записи — поле
// «комментарий» листа «Инструктажи» (столбец H). Заявка пользователя:
//   «В разделе "Табель учёта рабочего времени / Работники" в блоке
//    инструктажей и проверки знаний, сделай отображения примечания
//    в инструктажах и проверках данных».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   SRC (index.html):
//     — _instrNoteHtml: хелпер примечания — « · «текст»» (курсив
//       .ws-tr-note) для КОНЦА строки записи; пробельные/пустые —
//       пустая строка;
//     — хелпер вставлен во ВСЕ ТРИ вью блока: плоские строки КАРТЫ
//       (страница «Работники»: тема · дата · «примечание»), строки
//       групп «Список_И_и_ПЗ» попапа ячейки (после даты — тема в
//       заголовке группы) и строки «вне списка»;
//     — CSS .ws-tr-note (курсив + opacity 0.75 — обе темы) и
//       .ws-wcard .ws-tr-note 13px (размер мета-строки СИЗ Task 444);
//     — данные уже приходят с сервера: комментарий — столбец H
//       листа «Инструктажи», addTraining пишет/listTrainings отдаёт
//       (WorkSchedule.gs БЕЗ правок Task 553 — КЛИЕНТ-ONLY).
//   VM (функционально, извлечение _instrNoteHtml + _esc):
//     — примечание есть → ' · <span class="ws-tr-note">«текст»</span>';
//     — пустое/пробельное/нет поля/нет записи → '';
//     — HTML-экранирование текста (&<>"') через _esc;
//     — длинный текст не обрезается клиентом (лимит 500 — сервер).
//   Санитар:
//     — заявка-цитата в исходнике;
//     — сервер WorkSchedule.gs НЕ менялся (метки Task 553 нет,
//       прежняя колонка H «комментарий» читается как r[7]).
//
// Запуск: через tests/run-all.js (require './test-task553.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');
const WS_CLIENT = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// Вырезка метода объекта WorkSchedule (баланс фигурных скобок) —
// как в test-task310.js / test-task550.js
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
// VM-харнесс: _instrNoteHtml + настоящий _esc WorkSchedule
// ============================================================
const HOST = (function() {
    const src = extractMethod(WS_CLIENT, '_instrNoteHtml') + ',\n' +
                extractMethod(WS_CLIENT, '_esc');
    const ctx = { String: String };
    vm.createContext(ctx);
    vm.runInContext('var WSMixin = { ' + src + ' };', ctx,
        { filename: 'index.html-WS-instr-note' });
    return ctx.WSMixin;
})();

// ============================================================
// 1. SRC: хелпер _instrNoteHtml
// ============================================================
describe('Task 553 — SRC: хелпер _instrNoteHtml', () => {
    test('SRC: _instrNoteHtml объявлен, комментарий Task 553', () => {
        const i = WS_CLIENT.indexOf('_instrNoteHtml: function');
        assertTrue(i !== -1, 'хелпер есть в объекте WorkSchedule');
        const chunk = WS_CLIENT.slice(Math.max(0, i - 1700), i + 700);
        assertTrue(chunk.indexOf('Task 553') !== -1,
            'метка задачи в комментарии над хелпером');
        assertTrue(chunk.indexOf('комментарий') !== -1,
            'источник — поле «комментарий» записи');
    });

    test('SRC: заявка в комментарии — блок инструктажей и проверки знаний', () => {
        const i = WS_CLIENT.indexOf('_instrNoteHtml: function');
        const chunk = WS_CLIENT.slice(Math.max(0, i - 1700), i + 700);
        assertTrue(chunk.indexOf('инструктажей и проверки знаний') !== -1,
            'заявка называет блок');
        assertTrue(chunk.indexOf('Работники') !== -1,
            'заявка называет страницу');
    });

    test('SRC: пустое примечание не показывается (trim + возврат пусто)', () => {
        const body = extractMethod(WS_CLIENT, '_instrNoteHtml');
        assertTrue(body !== null, 'тело хелпера извлекается');
        assertTrue(body.indexOf('.trim()') !== -1,
            'пробельные значения отсекаются trim()');
        assertTrue(body.indexOf('ws-tr-note') !== -1,
            'разметка примечания — span.ws-tr-note');
        assertTrue(body.indexOf('«') !== -1 && body.indexOf('»') !== -1,
            'кавычки-ёлочки вокруг текста (как примечание СИЗ)');
    });

    test('SRC: источник — столбец H листа «Инструктажи» (без правок сервера)', () => {
        const body = extractMethod(WS_CLIENT, '_instrNoteHtml');
        assertTrue(body.indexOf('комментарий') !== -1,
            'читается поле «комментарий» записи');
        // сервер: прежняя структура листа — комментарий в H (r[7])
        const gs = WS_GS_SRC;
        assertTrue(gs.indexOf('H: комментарий') !== -1,
            'WorkSchedule.gs: столбец H листа «Инструктажи» — комментарий (прежний)');
        assertTrue(gs.indexOf('String(r[7] || \'\').trim()') !== -1,
            'listTrainings уже отдаёт комментарий (r[7])');
    });
});

// ============================================================
// 2. SRC: хелпер вставлен во все три вью блока
// ============================================================
describe('Task 553 — SRC: три вью блока инструктажей', () => {
    test('SRC: плоские строки КАРТЫ (Работники) — тема · дата · «примечание»', () => {
        // Task 555: тело строки карты строится через iNameBody →
        // iNameHtml (краткое наименование пункта + остальной текст
        // мельче) — примечание осталось в конце ОСТАЛЬНОГО текста
        const i = WS_CLIENT.indexOf("' · ' + iPeriod + iNote;");
        assertTrue(i !== -1, 'вставка после даты строки карты (iNameBody)');
        assertTrue(WS_CLIENT.indexOf('this._instrNoteHtml(it)') !== -1,
            'вызов хелпера в ветке b5');
        const j = WS_CLIENT.indexOf("iNameHtml + '</span>' +");
        assertTrue(j !== -1, 'строка карты использует iNameHtml');
        const chunk = WS_CLIENT.slice(Math.max(0, j - 2200), j + 200);
        assertTrue(chunk.indexOf('ws-popup-event') !== -1,
            'строка записи — .ws-popup-event (ветка b5 карты)');
        assertTrue(chunk.indexOf('iLateTag') !== -1,
            'та же строка несёт бейдж «просрочен» (Task 418)');
    });

    test('SRC: строки групп «Список_И_и_ПЗ» попапа ячейки — примечание после даты', () => {
        const i = WS_CLIENT.indexOf(
            "'<span class=\"ws-popup-name\">' + rPeriod + rNote + '</span>' +");
        assertTrue(i !== -1, 'вставка в строку группы');
        assertTrue(WS_CLIENT.indexOf('this._instrNoteHtml(gr)') !== -1,
            'вызов хелпера в строке группы');
        const chunk = WS_CLIENT.slice(Math.max(0, i - 900), i + 200);
        assertTrue(chunk.indexOf('ws-il-row') !== -1,
            'строка группы — .ws-il-row (_renderInstrSection)');
        assertTrue(chunk.indexOf('rPeriod') !== -1,
            'примечание — после периода (тема в заголовке группы)');
    });

    test('SRC: строки «вне списка» — примечание как в карте', () => {
        const i = WS_CLIENT.indexOf("' · ' + oPeriod + oNote +");
        assertTrue(i !== -1, 'вставка в строку «вне списка»');
        assertTrue(WS_CLIENT.indexOf('this._instrNoteHtml(ot)') !== -1,
            'вызов хелпера в строке «вне списка»');
        const chunk = WS_CLIENT.slice(Math.max(0, i - 2200), i + 200);
        assertTrue(chunk.indexOf('ws-il-off') !== -1 || chunk.indexOf('вне списка') !== -1,
            'строка живёт в ветке «вне списка»');
    });

    test('SRC: РОВНО три вызова хелпера (карта + группы + вне списка)', () => {
        const calls = WS_CLIENT.split('this._instrNoteHtml(').length - 1;
        assertEqual(calls, 3, 'три вызова _instrNoteHtml в трёх вью');
    });

    test('SRC: typeof-оговорка у всех трёх вызовов (приём Task 550)', () => {
        // старые VM-харнессы без хелпера — рендер без примечания,
        // не TypeError (обратная совместимость, как _entryIsHoliday)
        const guards = WS_CLIENT.split(
            "typeof this._instrNoteHtml === 'function'").length - 1;
        assertEqual(guards, 3,
            'оговорка при каждом вызове: iNote/rNote/oNote');
    });

    test('SRC: хелпер НЕ трогает блок «Мероприятия» (b3)', () => {
        const b3 = WS_CLIENT.slice(
            WS_CLIENT.indexOf('ws-emp-addtr'), WS_CLIENT.indexOf('ws-emp-addins'));
        assertTrue(b3.indexOf('_instrNoteHtml') === -1,
            'строки мероприятий не несут примечание (заявка — только блок инструктажей)');
    });
});

// ============================================================
// 3. SRC: стили примечания
// ============================================================
describe('Task 553 — SRC: стили .ws-tr-note', () => {
    test('SRC: .ws-tr-note — курсив + затемнение (opacity, обе темы)', () => {
        const i = INDEX_SRC.indexOf('.ws-tr-note {');
        assertTrue(i !== -1, 'правило .ws-tr-note есть');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('font-style: italic') !== -1,
            'примечание — курсивом');
        assertTrue(rule.indexOf('opacity: 0.75') !== -1,
            'чуть тише текста строки (без отдельного цвета светлой темы)');
    });

    test('SRC: в карте примечание — 13px, как мета-строка СИЗ (Task 444)', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-wcard .ws-tr-note { font-size: 13px; }') !== -1,
            'размер в окнах карты совпадает с .ws-wcard .ws-ppe-meta');
    });

    test('SRC: примечание переносится вместе с темой строки (Task 415)', () => {
        // span живёт ВНУТРИ .ws-popup-name (перенос строки карты),
        // а не отдельной колонкой строки; Task 555: примечание —
        // внутри .ws-tr-rest ОСТАЛЬНОГО текста строки карты
        const i = WS_CLIENT.indexOf("' · ' + iPeriod + iNote;");
        const chunk = WS_CLIENT.slice(Math.max(0, i - 200), i + 800);
        assertTrue(chunk.indexOf('ws-tr-rest') !== -1,
            'примечание внутри .ws-tr-rest — общий перенос Task 415');
        const j = WS_CLIENT.indexOf("iNameHtml + '</span>' +");
        const row = WS_CLIENT.slice(Math.max(0, j - 900), j + 100);
        assertTrue(row.indexOf('ws-popup-name') !== -1,
            'iNameHtml (с примечанием) внутри .ws-popup-name строки');
    });
});

// ============================================================
// 4. VM: хелпер функционально
// ============================================================
describe('Task 553 — VM: _instrNoteHtml (примечание записи)', () => {
    test('VM: примечание есть → « · «текст»» в span.ws-tr-note', () => {
        const html = HOST._instrNoteHtml({ комментарий: 'осмотр 12.03, отклонений нет' });
        assertEqual(html,
            ' · <span class="ws-tr-note">«осмотр 12.03, отклонений нет»</span>',
            'строка карты получает примечание в конце');
    });

    test('VM: примечание инструктажа и проверки знаний — одинаково', () => {
        // оба типа записей блока — одно поле «комментарий»
        const instr = HOST._instrNoteHtml({ тип: 'инструктаж', комментарий: 'протокол № 7' });
        const check = HOST._instrNoteHtml({ тип: 'проверка_знаний', комментарий: 'протокол № 7' });
        assertEqual(instr, check, 'вид примечания не зависит от типа записи');
        assertTrue(instr.indexOf('протокол № 7') !== -1, 'текст на месте');
    });

    test('VM: пустое примечание → пустая строка', () => {
        assertEqual(HOST._instrNoteHtml({ комментарий: '' }), '',
            'пусто — строку не меняем');
    });

    test('VM: пробельное примечание → пустая строка', () => {
        assertEqual(HOST._instrNoteHtml({ комментарий: '   \u00a0 ' }), '',
            'пробелы/NBSP — не показываются');
    });

    test('VM: нет поля / нет записи → пустая строка', () => {
        assertEqual(HOST._instrNoteHtml({}), '', 'нет поля комментарий');
        assertEqual(HOST._instrNoteHtml(null), '', 'null-запись');
        assertEqual(HOST._instrNoteHtml(undefined), '', 'undefined');
    });

    test('VM: HTML-экранирование текста примечания', () => {
        const html = HOST._instrNoteHtml({ комментарий: '<b>&"в"</b>' });
        assertTrue(html.indexOf('<b>') === -1, 'сырой HTML не проходит');
        assertTrue(html.indexOf('&lt;b&gt;') !== -1, 'теги экранированы');
        assertTrue(html.indexOf('&amp;') !== -1, 'амперсанд экранирован');
        assertTrue(html.indexOf('&quot;в&quot;') !== -1, 'кавычки экранированы');
    });

    test('VM: длинное примечание не обрезается клиентом', () => {
        const long = (new Array(201)).join('а');   // 200 символов
        const html = HOST._instrNoteHtml({ комментарий: long });
        assertTrue(html.indexOf(long) !== -1,
            'клиент не режет текст (лимит 500 — сервер addTraining)');
    });

    test('VM: структура — разделитель + кавычки + класс', () => {
        const html = HOST._instrNoteHtml({ комментарий: 'текст' });
        assertTrue(html.indexOf(' · ') === 0, 'начинается разделителем строки');
        assertTrue(html.indexOf('class="ws-tr-note"') !== -1, 'класс стиля на месте');
        assertTrue(html.indexOf('«текст»') !== -1, 'текст в кавычках-ёлочках');
    });
});

// ============================================================
// 5. Санитар
// ============================================================
describe('Task 553 — санитар', () => {
    test('санитар: заявка-цитата в исходнике', () => {
        assertTrue(INDEX_SRC.indexOf('отображения примечания в инструктажах') !== -1,
            'цитата заявки в комментарии Task 553');
        assertTrue(INDEX_SRC.indexOf('Табель учёта рабочего времени /') !== -1,
            'раздел заявки назван');
    });

    test('санитар: сервер WorkSchedule.gs менялся ТОЛЬКО Task 554 (не 553)', () => {
        assertTrue(WS_GS_SRC.indexOf('Task 553') === -1,
            'метки Task 553 в сервере нет — отображение примечания КЛИЕНТ-ONLY');
        assertTrue(WS_GS_SRC.indexOf('Task 554') !== -1,
            'Task 554 — перенос примечания при автосоздании (заявка: «примечания так же должны переноситься»): сервер ДЕПЛОИТСЯ');
    });

    test('санитар: sw.js — версия кэша поднята (горячее обновление)', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v764'") !== -1,
            'SW v762 — клиенты обновятся при открытии');
        assertTrue(SW_SRC.indexOf('kipia-test-v765') === -1,
            'следующей версии нет');
    });
});
