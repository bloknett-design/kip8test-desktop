// tests/test-task556.js
// Task 556 — доводка вида СТРОК инструктажей/ПЗ в КАРТОЧКАХ
// работников (страница «Работники», колонка .ws-wcol-instr) ПОСЛЕ
// Task 555 (краткое наименование в начале строки). Заявка:
//   «В блоке со списком инструктажей и проверок знаний в карточках
//    работников, справа от текста краткого наименования сделай
//    отступ (пробел) от остального текста. Шрифт дат сделай по
//    ярче. И в целом поле для текста сделай по шире, а кнопки и
//    значки слева и справа смести ближе к краям блока.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   SRC (index.html):
//     — iNameBody (плоская ветка b5): дата — span.ws-tr-date;
//       спан ставится БЕЗ условия iShort — строка БЕЗ краткого
//       наименования тоже получает яркую дату; диапазон дат жив;
//     — CSS .ws-tr-short margin-right: 6px — отступ (пробел)
//       справа от краткого наименования до остального текста;
//     — CSS .ws-tr-date — вес 600 + цвет var(--text-primary)
//       («Шрифт дат сделай по ярче» — тёмная #e0e0e0, светлая
//       #141413 против приглушённого --text-secondary строки);
//     — CSS .ws-wcard .ws-wcol-instr .ws-popup-row — боковые поля
//       6px/4px и gap 4px («поле для текста по шире», свотч/код у
//       ЛЕВОГО края блока, галочка/✎/✕ у ПРАВОГО); правило
//       ОДНО, ТОЛЬКО колонка инструктажей (Task 406);
//     — БАЗОВАЯ геометрия НЕ тронута: .ws-wcard .ws-popup-row
//       (паддинги 5px 16px, зебра во всю ширину — Task 432),
//       базовый .ws-popup-row gap 8px (попап шахматки), СИЗ
//       .ws-ppe-item — прежние; колонка .ws-wcol-ppe НЕ
//       переопределена;
//   Санитар:
//     — заявка-цитата в исходнике;
//     — сервер WorkSchedule.gs НЕ менялся (КЛИЕНТ-ONLY);
//     — sw.js — версия кэша v765, следующей (v766) нет;
//     — tests/run-all.js подключает test-task556.js.
//
// Запуск: через tests/run-all.js (require './test-task556.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');
const RUN_ALL_SRC = fs.readFileSync(path.join(ROOT, 'tests', 'run-all.js'), 'utf8');
const WS_CLIENT = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// ============================================================
// 1. SRC: дата — span.ws-tr-date (ярче) в плоской ветке b5
// ============================================================
describe('Task 556 — SRC: дата строки карты ярче', () => {
    test('SRC: заявка-цитата в комментарии у iNameBody', () => {
        const i = WS_CLIENT.indexOf("' · <span class=\"ws-tr-date\">' + iPeriod");
        assertTrue(i !== -1, 'дата обёрнута span.ws-tr-date в iNameBody');
        const chunk = WS_CLIENT.slice(Math.max(0, i - 900), i + 500);
        assertTrue(chunk.indexOf('Task 556') !== -1,
            'метка задачи в комментарии над составлением строки');
        assertTrue(chunk.indexOf('по') !== -1 &&
                   chunk.indexOf('ярче') !== -1,
            'заявка «Шрифт дат сделай по ярче» процитирована');
    });

    test('SRC: состав iNameBody — тема · дата(спан) · примечание', () => {
        assertTrue(WS_CLIENT.indexOf(
            "var iNameBody = this._esc(it.тема || iMeta.name || it.тип) +") !== -1,
            'полная тема — первой частью строки (Task 417 жив)');
        assertTrue(WS_CLIENT.indexOf(
            "' · <span class=\"ws-tr-date\">' + iPeriod + '</span>' + iNote;") !== -1,
            'дата в спане, примечание Task 553 — после даты');
    });

    test('SRC: спан даты — БЕЗ условия iShort (без краткого тоже ярче)', () => {
        // iNameBody составляется ДО тернарника iShort и попадает в
        // ОБЕ ветки (iShort есть / нет) — дата ярче у ВСЕХ записей
        const iBody = WS_CLIENT.indexOf("' · <span class=\"ws-tr-date\">' + iPeriod");
        const iTern = WS_CLIENT.indexOf('var iNameHtml = iShort');
        assertTrue(iBody !== -1 && iTern !== -1 && iBody < iTern,
            'спан даты — в iNameBody, ДО ветвления по краткому имени');
        const calls = WS_CLIENT.split('<span class="ws-tr-date">').length - 1;
        assertEqual(calls, 1,
            'РОвно один датовый спан (плоская ветка b5, без дублей)');
    });

    test('SRC: диапазон дат жив (дата_начала — дата_окончания)', () => {
        assertTrue(WS_CLIENT.indexOf(
            "this._fmtDateRu(it.дата_начала) + ' — ' +") !== -1,
            'период из двух дат не тронут Task 556');
    });
});

// ============================================================
// 2. SRC: стили — отступ, дата, геометрия строки
// ============================================================
describe('Task 556 — SRC: CSS отступ/дата/геометрия', () => {
    test('SRC: .ws-tr-short — отступ (пробел) справа от краткого', () => {
        assertTrue(INDEX_SRC.indexOf(
            '.ws-tr-short { margin-right: 6px; }') !== -1,
            'зазор 6px между кратким наименованием и остальным текстом');
        // заявка-цитата у правила
        const i = INDEX_SRC.indexOf('.ws-tr-short { margin-right: 6px; }');
        const chunk = INDEX_SRC.slice(Math.max(0, i - 700), i + 100);
        assertTrue(chunk.indexOf('сделай отступ (пробел)') !== -1,
            'комментарий цитирует заявку про отступ');
    });

    test('SRC: .ws-tr-date — ярче (вес 600, --text-primary)', () => {
        const i = INDEX_SRC.indexOf('.ws-tr-date {');
        assertTrue(i !== -1, 'правило .ws-tr-date есть');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('font-weight: 600') !== -1,
            'дата — полужирная (заметнее)');
        assertTrue(rule.indexOf('var(--text-primary, #e0e0e0)') !== -1,
            'цвет — --text-primary (прежде приглушённый --text-secondary)');
    });

    test('SRC: строка колонки инструктажей — поля 6px/4px, gap 4px', () => {
        // в DOM колонка СОДЕРЖИТ окно: ws-wcol-instr > ws-wcard >
        // ws-popup-row — селектор именно в этом порядке (обратный
        // порядок классов НЕ совпадает с потомками — урок проверки)
        const i = INDEX_SRC.indexOf(
            '.ws-wcol-instr .ws-wcard .ws-popup-row {');
        assertTrue(i !== -1,
            'правило ТОЛЬКО колонки .ws-wcol-instr (Task 406)');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('padding-left: 6px') !== -1 &&
                   rule.indexOf('padding-right: 4px') !== -1 &&
                   rule.indexOf('gap: 4px') !== -1,
            'свотч/код у левого края, галочка/✎/✕ у правого, поле шире');
        const n = INDEX_SRC.split(
            '.ws-wcol-instr .ws-wcard .ws-popup-row').length - 1;
        assertEqual(n, 1, 'правило одно, без дублей');
    });

    test('SRC: заявка «по шире / ближе к краям» — в комментарии', () => {
        const i = INDEX_SRC.indexOf(
            '.ws-wcol-instr .ws-wcard .ws-popup-row {');
        const chunk = INDEX_SRC.slice(Math.max(0, i - 1300), i + 100);
        assertTrue(chunk.indexOf('по шире') !== -1 &&
                   chunk.indexOf('ближе к краям блока') !== -1,
            'комментарий цитирует заявку о ширине поля и краях');
    });

    test('SRC: БАЗОВАЯ геометрия строк НЕ тронута (другие блоки)', () => {
        // .ws-wcard .ws-popup-row — прежние 5px 16px + зебра Task 432
        const i = INDEX_SRC.indexOf('.ws-wcard .ws-popup-row {');
        assertTrue(i !== -1, 'базовое правило карточки на месте');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('padding: 5px 16px') !== -1 &&
                   rule.indexOf('margin: 0 -16px') !== -1,
            'мероприятия/отпуска/СИЗ — прежние поля, зебра во всю ширину');
        // базовый .ws-popup-row — прежний gap 8px (попап шахматки)
        const j = INDEX_SRC.indexOf('.ws-popup-row {');
        const base = INDEX_SRC.slice(j, INDEX_SRC.indexOf('}', j) + 1);
        assertTrue(base.indexOf('gap: 8px') !== -1,
            'попап ячейки шахматки — прежний зазор 8px');
        assertTrue(INDEX_SRC.indexOf(
            '.ws-wcard .ws-ppe-item {') !== -1 &&
                   INDEX_SRC.indexOf(
                       '.ws-wcol-ppe .ws-wcard .ws-popup-row') === -1,
            'колонка СИЗ НЕ переопределена (заявка — только инструктажи)');
    });
});

// ============================================================
// 3. Санитар
// ============================================================
describe('Task 556 — санитар', () => {
    test('санитар: сервер WorkSchedule.gs НЕ менялся (КЛИЕНТ-ONLY)', () => {
        assertTrue(WS_GS_SRC.indexOf('Task 556') === -1,
            'метки Task 556 в сервере нет — серверного деплоя НЕТ');
    });

    test('санитар: sw.js — версия кэша поднята (горячее обновление)', () => {
        assertTrue(SW_SRC.indexOf(
            "const CACHE_VERSION = 'kipia-test-v765'") !== -1,
            'SW v765 — клиенты обновятся при открытии');
        assertTrue(SW_SRC.indexOf('kipia-test-v766') === -1,
            'следующей версии нет');
    });

    test('санитар: run-all.js подключает test-task556.js', () => {
        assertTrue(RUN_ALL_SRC.indexOf(
            "require('./test-task556.js');") !== -1,
            'новый тест в общем прогоне');
    });
});
