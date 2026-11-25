// tests/test-task555.js
// Task 555 — блок «Повторные инструктажи и периодическая проверка
// знаний» в КАРТОЧКАХ работников (страница «Работники» раздела «Табель
// учёта рабочего времени»): КРАТКОЕ наименование пункта
// «Список_И_и_ПЗ» в НАЧАЛЕ каждой строки записи. Заявка пользователя:
//   «в блоке со списком инструктажей и проверок знаний в карточках
//    работников, в начале каждого списка отображалось его краткое
//    наименование, указанное в таблице Список_И_и_ПЗ из файла
//    табель_КИП_ИОС. В начале краткое наименование более выраженным
//    шрифтом (инструктажи - синим цветом, проверки знаний - красным,
//    как цвет у их мини значков), а затем остальной текст более
//    мелким шрифтом. И шрифт не должен тускнеть при отметке
//    выполнения, а оставаться таким же нормально читаемым».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   SRC (index.html):
//     — _instrAbbrOf: ЧИСТОЕ «сокращение» пункта шаблона по теме
//       записи (БЕЗ фолбэка на полное название, какой есть у
//       _instrShortOf); нет соответствия/пустая ячейка E/старый
//       сервер без поля — пустая строка;
//     — вставка в ПЛОСКИЕ строки КАРТЫ (ветка b5): краткое
//       наименование — span.ws-tr-short (+ ws-tr-short-pz для
//       проверок знаний) В НАЧАЛЕ, остальной текст (полная тема ·
//       дата · примечание Task 553) — span.ws-tr-rest; typeof-
//       оговорка (приём Task 550); группы/«вне списка» попапа и
//       блок «Мероприятия» НЕ затронуты;
//     — CSS: .ws-tr-short жирный + синий (#64B5F6, светлая
//       #1565C0), .ws-tr-short-pz красный (#EF5350, светлая
//       #C62828), .ws-tr-rest 13px, в карте .ws-tr-short 14px;
//     — затухание выполненной строки СНЯТО (правило Task 418
//       opacity 0.55 удалено — заявка «не должен тускнеть»).
//   VM (извлечение _instrAbbrOf + _normInstrKey):
//     — соответствие пункту (норм-ключ: регистр/пробелы/«ё») →
//       «сокращение» с trim;
//     — нет соответствия / пустое «сокращение» / пустая тема /
//       пустой-отсутствующий _INSTR_LIST → '';
//   Санитар:
//     — заявка-цитата в исходнике;
//     — сервер WorkSchedule.gs НЕ менялся (КЛИЕНТ-ONLY: сокращение
//       сервер отдаёт с Task 416, метки Task 555 в GAS нет);
//     — sw.js — версия кэша v764, следующей нет.
//
// Запуск: через tests/run-all.js (require './test-task555.js').

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
// как в test-task553.js / test-task550.js
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
// VM-харнесс: _instrAbbrOf + настоящий _normInstrKey WorkSchedule
// (_INSTR_LIST подставляется тестами — как поле хоста)
// ============================================================
const HOST = (function() {
    const src = extractMethod(WS_CLIENT, '_instrAbbrOf') + ',\n' +
                extractMethod(WS_CLIENT, '_normInstrKey');
    const ctx = { String: String };
    vm.createContext(ctx);
    vm.runInContext('var WSMixin = { ' + src + ' };', ctx,
        { filename: 'index.html-WS-instr-abbr' });
    return ctx.WSMixin;
})();

// Эталонный шаблон «Список_И_и_ПЗ» (формат listTrainings: название/
// вид/периодичность/основание/сокращение/в составе)
function IL(rows) {
    return rows.map(function(r) {
        return { 'название': r[0], 'вид': r[1], 'периодичность': r[2],
                 'основание': r[3], 'сокращение': r[4], 'в составе': r[5] };
    });
}

// ============================================================
// 1. SRC: хелпер _instrAbbrOf
// ============================================================
describe('Task 555 — SRC: хелпер _instrAbbrOf', () => {
    test('SRC: _instrAbbrOf объявлен, комментарий Task 555', () => {
        const i = WS_CLIENT.indexOf('_instrAbbrOf: function');
        assertTrue(i !== -1, 'хелпер есть в объекте WorkSchedule');
        const chunk = WS_CLIENT.slice(Math.max(0, i - 2100), i + 700);
        assertTrue(chunk.indexOf('Task 555') !== -1,
            'метка задачи в комментарии над хелпером');
        assertTrue(chunk.indexOf('Список_И_и_ПЗ') !== -1,
            'источник краткого наименования — таблица Список_И_и_ПЗ');
        assertTrue(chunk.indexOf('сокращение') !== -1,
            'читается поле «сокращение» пункта шаблона');
    });

    test('SRC: заявка в комментарии — карточки работников', () => {
        const i = WS_CLIENT.indexOf('_instrAbbrOf: function');
        const chunk = WS_CLIENT.slice(Math.max(0, i - 2100), i + 700);
        assertTrue(chunk.indexOf('в карточках работников') !== -1,
            'заявка называет карточки');
        assertTrue(chunk.indexOf('краткое наименование') !== -1,
            'заявка называет краткое наименование');
    });

    test('SRC: ЧИСТОЕ сокращение — БЕЗ фолбэка на полное название', () => {
        const body = extractMethod(WS_CLIENT, '_instrAbbrOf');
        assertTrue(body !== null, 'тело хелпера извлекается');
        assertTrue(body.indexOf(
            "String(this._INSTR_LIST[i].сокращение || '').trim()") !== -1,
            'возвращается сокращение пункта с trim');
        assertTrue(body.indexOf('return \'\';') !== -1,
            'нет соответствия — пустая строка (НЕ полная тема)');
        assertFalse(body.indexOf('return t;') !== -1,
            'фолбэк _instrShortOf (полное название) НЕ используется');
    });

    test('SRC: соответствие по норм-ключу темы (Task 407)', () => {
        const body = extractMethod(WS_CLIENT, '_instrAbbrOf');
        assertTrue(body.indexOf('this._normInstrKey(t)') !== -1,
            'тема записи нормализуется');
        assertTrue(body.indexOf(
            'this._normInstrKey(this._INSTR_LIST[i].название) === key') !== -1,
            'сравнение с «названием» пункта шаблона');
        assertTrue(body.indexOf('(this._INSTR_LIST || [])') !== -1,
            'пустой/отсутствующий список — безопасно (старый сервер)');
    });
});

// ============================================================
// 2. SRC: вставка в плоские строки КАРТЫ (ветка b5)
// ============================================================
describe('Task 555 — SRC: строки карты с кратким наименованием', () => {
    test('SRC: строка карты строится через iNameHtml (префикс + остальное)', () => {
        const i = WS_CLIENT.indexOf("var iNameHtml = iShort");
        assertTrue(i !== -1, 'переменная iNameHtml в ветке b5');
        const chunk = WS_CLIENT.slice(Math.max(0, i - 2600), i + 900);
        assertTrue(chunk.indexOf('var iShort = (typeof this._instrAbbrOf') !== -1,
            'краткое наименование вычисляется с typeof-оговоркой');
        assertTrue(chunk.indexOf('<span class="ws-tr-short') !== -1,
            'префикс строки — span.ws-tr-short');
        assertTrue(chunk.indexOf('<span class="ws-tr-rest">') !== -1,
            'остальной текст — span.ws-tr-rest');
    });

    test('SRC: РОВНО один вызов _instrAbbrOf (плоские строки карты)', () => {
        const calls = WS_CLIENT.split('this._instrAbbrOf(').length - 1;
        assertEqual(calls, 1,
            'хелпер применяется только в плоской ветке b5');
        const guards = WS_CLIENT.split(
            "typeof this._instrAbbrOf === 'function'").length - 1;
        assertEqual(guards, 1,
            'typeof-оговорка (приём Task 550) при единственном вызове');
    });

    test('SRC: проверки знаний — красный класс ws-tr-short-pz', () => {
        const i = WS_CLIENT.indexOf("var iNameHtml = iShort");
        const chunk = WS_CLIENT.slice(Math.max(0, i - 200), i + 700);
        assertTrue(chunk.indexOf(
            "this._normInstrKind(it.тип) === 'проверка_знаний'") !== -1,
            'вид записи решает цвет краткого наименования');
        assertTrue(chunk.indexOf('ws-tr-short-pz') !== -1,
            'класс красного варианта для ПЗ');
    });

    test('SRC: полная тема и примечание остаются (Task 417/553)', () => {
        // Task 557: тема — iNameText; остальной текст (.ws-tr-rest,
        // вторая строка) — тема + примечание; дата — первой
        // строкой после краткого, в конце НЕ повторяется
        const i = WS_CLIENT.indexOf(
            "'<span class=\"ws-tr-rest\">' + iNameText + iNote + '</span>'");
        assertTrue(i !== -1,
            'остальной текст — iNameText + примечание Task 553');
        assertTrue(WS_CLIENT.indexOf(
            'var iNameText = this._esc(it.тема || iMeta.name || it.тип);') !== -1,
            'полное название записи — в остальном тексте (Task 417)');
        assertTrue(WS_CLIENT.indexOf(
            "var iNameBody = iNameText + ' · ' + iDateHtml + iNote;") !== -1,
            'дата (Task 556 — span.ws-tr-date, ярче) в конце — только у строки БЕЗ краткого');
        // строка карты (конец ветки b5, ~4.7 КБ ниже объявления
        // iNameHtml) использует iNameHtml внутри .ws-popup-name —
        // отдельное окно вокруг вхождения
        const j = WS_CLIENT.indexOf("iNameHtml + '</span>' +");
        assertTrue(j !== -1, 'строка карты использует iNameHtml');
        const row = WS_CLIENT.slice(Math.max(0, j - 900), j + 100);
        assertTrue(row.indexOf('ws-popup-name') !== -1,
            'iNameHtml живёт внутри .ws-popup-name строки карты');
    });

    test('SRC: группы и «вне списка» попапа ячейки НЕ затронуты', () => {
        const fn = extractMethod(WS_CLIENT, '_renderInstrSection');
        assertTrue(fn !== null, '_renderInstrSection извлекается');
        assertTrue(fn.indexOf('_instrAbbrOf') === -1,
            'строки групп/«вне списка» без краткого наименования (заявка — карточки)');
        // групповой вид уже ведёт сокращением заголовка группы (Task 416)
        assertTrue(fn.indexOf('_instrShortOf') !== -1,
            'заголовки групп попапа — прежний компактный вид Task 416');
    });

    test('SRC: блок «Мероприятия» (b3) не затронут', () => {
        const b3 = WS_CLIENT.slice(
            WS_CLIENT.indexOf('ws-emp-addtr'), WS_CLIENT.indexOf('ws-emp-addins'));
        assertTrue(b3.indexOf('_instrAbbrOf') === -1,
            'строки мероприятий не несут краткое наименование');
    });
});

// ============================================================
// 3. SRC: стили краткого наименования + снятие затухания
// ============================================================
describe('Task 555 — SRC: стили .ws-tr-short/.ws-tr-rest, затухание снято', () => {
    test('SRC: .ws-tr-short — жирный, синий (тёмная) и синий (светлая)', () => {
        const i = INDEX_SRC.indexOf('.ws-tr-short {');
        assertTrue(i !== -1, 'правило .ws-tr-short есть');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('font-weight: 700') !== -1,
            'краткое наименование — жирным («более выраженным шрифтом»)');
        assertTrue(rule.indexOf('#64B5F6') !== -1,
            'инструктажи — синим (тёмная тема)');
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] .ws-tr-short { color: #1565C0; }') !== -1,
            'светлая тема — насыщенный синий');
    });

    test('SRC: .ws-tr-short-pz — красный, обе темы', () => {
        assertTrue(INDEX_SRC.indexOf(
            '.ws-tr-short.ws-tr-short-pz { color: #EF5350; }') !== -1,
            'проверки знаний — красным (тёмная тема)');
        assertTrue(INDEX_SRC.indexOf(
            '[data-theme="light"] .ws-tr-short.ws-tr-short-pz { color: #C62828; }') !== -1,
            'светлая тема — насыщенный красный');
    });

    test('SRC: остальной текст — мельче (13px, в карте 14px у префикса)', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-tr-rest { font-size: 13px; }') !== -1,
            'остальной текст строки — мельче');
        assertTrue(INDEX_SRC.indexOf(
            '.ws-wcard .ws-tr-short { font-size: 14px; }') !== -1,
            'краткое наименование в карте — 14px (размер строки)');
    });

    test('SRC: затухание выполненной строки СНЯТО (Task 418 → Task 555)', () => {
        assertFalse(INDEX_SRC.indexOf(
            '.ws-wcard .ws-popup-row.ws-row-done .ws-popup-name') !== -1,
            'правило приглушения .ws-popup-name удалено');
        assertFalse(INDEX_SRC.indexOf(
            '.ws-wcard .ws-popup-row.ws-row-done .ws-popup-code') !== -1,
            'правило приглушения .ws-popup-code удалено');
        assertTrue(INDEX_SRC.indexOf('не должен тускнеть') !== -1,
            'комментарий Task 555 объясняет снятие (заявка-цитата)');
    });

    test('SRC: класс ws-row-done остаётся маркером состояния', () => {
        // состояние видно галочкой ws-done-on (Task 418); класс
        // строки сохранён в разметке, исчезло только затухание текста
        assertTrue(WS_CLIENT.indexOf("(iDone ? ' ws-row-done' : '')") !== -1,
            'класс выполненной строки в разметке ветки b5');
    });
});

// ============================================================
// 4. VM: хелпер функционально
// ============================================================
describe('Task 555 — VM: _instrAbbrOf (краткое наименование пункта)', () => {
    test('VM: тема соответствует пункту — сокращение пункта', () => {
        HOST._INSTR_LIST = IL([
            ['Повторный инструктаж по рабочим инструкциям', 'инструктаж', 6,
             'ПОТ', 'ОТ-РИ', ''],
            ['Периодическая проверка знаний до 1000 В', 'проверка_знаний', 12,
             'ПТЭЭП', 'ПЗ-1000В', ''],
        ]);
        assertEqual(HOST._instrAbbrOf(
            'Повторный инструктаж по рабочим инструкциям'), 'ОТ-РИ',
            'инструктаж — сокращение пункта');
        assertEqual(HOST._instrAbbrOf(
            'Периодическая проверка знаний до 1000 В'), 'ПЗ-1000В',
            'проверка знаний — сокращение пункта');
    });

    test('VM: норм-ключ — регистр/пробелы/«ё» не ломают соответствие', () => {
        HOST._INSTR_LIST = IL([
            ['Повторный инструктаж по рабочим инструкциям', 'инструктаж', 6,
             'ПОТ', 'ОТ-РИ', ''],
        ]);
        assertEqual(HOST._instrAbbrOf(
            '  повторный инструктаж  ПО РАБОЧИМ инструкциям '), 'ОТ-РИ',
            'лишние пробелы и регистр темы');
        assertEqual(HOST._instrAbbrOf(
            'Повторный инструктаж по рабочим инструкциям'.replace('е', 'ё')),
            'ОТ-РИ', '«ё» темы не ломает сравнение');
    });

    test('VM: сокращение с пробелами по краям — trim', () => {
        HOST._INSTR_LIST = IL([
            ['Инструктаж № 9-ОГЭ', 'инструктаж', 3, 'ЭБ', ' 9-ОГЭ ', ''],
        ]);
        assertEqual(HOST._instrAbbrOf('Инструктаж № 9-ОГЭ'), '9-ОГЭ',
            'пробелы вокруг сокращения срезаются');
    });

    test('VM: нет соответствия пункту — пустая строка (НЕ тема)', () => {
        HOST._INSTR_LIST = IL([
            ['Повторный инструктаж по рабочим инструкциям', 'инструктаж', 6,
             'ПОТ', 'ОТ-РИ', ''],
        ]);
        assertEqual(HOST._instrAbbrOf('Аварийный внеплановый инструктаж'), '',
            'тема «вне списка» — строка карты без префикса');
    });

    test('VM: пустое сокращение пункта — пустая строка', () => {
        HOST._INSTR_LIST = IL([
            ['Проверка знаний по промышленной безопасности',
             'проверка_знаний', 12, 'РТН', '', ''],
        ]);
        assertEqual(HOST._instrAbbrOf(
            'Проверка знаний по промышленной безопасности'), '',
            'ячейка E пуста — показывается только полная тема (как прежде)');
    });

    test('VM: пробельное сокращение — пустая строка', () => {
        HOST._INSTR_LIST = IL([
            ['Проверка знаний по промышленной безопасности',
             'проверка_знаний', 12, 'РТН', '   ', ''],
        ]);
        assertEqual(HOST._instrAbbrOf(
            'Проверка знаний по промышленной безопасности'), '',
            'пробелы — как пустая ячейка E');
    });

    test('VM: нет поля сокращение (старый сервер до Task 416) — пусто', () => {
        HOST._INSTR_LIST = [
            { 'название': 'Повторный инструктаж по рабочим инструкциям',
              'вид': 'инструктаж', 'периодичность': 6, 'основание': 'ПОТ' },
        ];
        assertEqual(HOST._instrAbbrOf(
            'Повторный инструктаж по рабочим инструкциям'), '',
            'запись без поля «сокращение» — деградация как прежде');
    });

    test('VM: пустая/пробельная/нет темы — пустая строка', () => {
        HOST._INSTR_LIST = IL([
            ['Повторный инструктаж по рабочим инструкциям', 'инструктаж', 6,
             'ПОТ', 'ОТ-РИ', ''],
        ]);
        assertEqual(HOST._instrAbbrOf(''), '', 'пустая тема');
        assertEqual(HOST._instrAbbrOf('   '), '', 'пробельная тема');
        assertEqual(HOST._instrAbbrOf(null), '', 'null-тема');
        assertEqual(HOST._instrAbbrOf(undefined), '', 'undefined-тема');
    });

    test('VM: пустой/отсутствующий _INSTR_LIST — пустая строка', () => {
        HOST._INSTR_LIST = [];
        assertEqual(HOST._instrAbbrOf(
            'Повторный инструктаж по рабочим инструкциям'), '',
            'шаблон пуст (лист отсутствует) — плоский список без префиксов');
        HOST._INSTR_LIST = undefined;
        assertEqual(HOST._instrAbbrOf(
            'Повторный инструктаж по рабочим инструкциям'), '',
            'хост без списка — безопасно');
    });
});

// ============================================================
// 5. Санитар
// ============================================================
describe('Task 555 — санитар', () => {
    test('санитар: заявка-цитата в исходнике', () => {
        assertTrue(INDEX_SRC.indexOf(
            'как цвет у их мини значков') !== -1,
            'цитата о цветах мини-значков (синий И / красный ПЗ)');
        assertTrue(INDEX_SRC.indexOf(
            'не должен тускнеть при отметке') !== -1,
            'цитата о снятии затухания выполненной строки');
    });

    test('санитар: сервер WorkSchedule.gs НЕ менялся (КЛИЕНТ-ONLY)', () => {
        assertTrue(WS_GS_SRC.indexOf('Task 555') === -1,
            'метки Task 555 в сервере нет — серверного деплоя НЕТ');
        // данные уже приходят с сервера: сокращение — столбец E
        // листа «Список_И_и_ПЗ», отдаётся с Task 416 (r[shortCol])
        assertTrue(WS_GS_SRC.indexOf(
            "сокращение:    shortCol !== null ? String(r[shortCol] || '').trim() : ''") !== -1,
            'listTrainings по-прежнему отдаёт сокращение пунктов (Task 416)');
    });

    test('санитар: sw.js — версия кэша поднята (горячее обновление)', () => {
        assertTrue(SW_SRC.indexOf(
            "const CACHE_VERSION = 'kipia-test-v768'") !== -1,
            'SW v764 — клиенты обновятся при открытии');
        assertTrue(SW_SRC.indexOf('kipia-test-v769') === -1,
            'следующей версии нет');
    });
});
