// tests/test-task557.js
// Task 557 — перенос ДАТЫ в строках инструктажей/ПЗ КАРТОЧКИ
// работника (страница «Работники», колонка .ws-wcol-instr) ПОСЛЕ
// Task 555/556. Заявка:
//   «Поменяй местами текст, дату поставь после краткого
//    наименования, а остальной текст под ними.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   SRC (index.html, плоская ветка b5):
//     — дата — отдельный фрагмент iDateHtml (span.ws-tr-date),
//       собирается ДО ветвления по краткому и попадает в ОБЕ
//       ветки (Task 556 «без краткого тоже яркая» жив);
//     — строка С кратким — ДВЕ строки: краткое (.ws-tr-short) +
//       дата (iDateHtml сразу после краткого; зазор 6px —
//       margin-right Task 556), ПОД ними — остальной текст
//       (.ws-tr-rest = полная тема + примечание, БЕЗ даты);
//     — строка БЕЗ краткого (пустая ячейка E / «вне списка» /
//       старый сервер) — прежняя ОДНА строка: тема · дата ·
//       примечание (iNameBody);
//     — РОВНО один датовый спан (iDateHtml) в коде ветки;
//     — диапазон дат (дата_начала — дата_окончания) жив;
//   CSS:
//     — .ws-tr-rest { display: block; } — остальной текст второй
//       строкой ПОД кратким и датой;
//     — .ws-tr-date — размер 13px ЯВНО (вышла из .ws-tr-rest;
//       прежние вес 600 и --text-primary Task 556 живы);
//     — .ws-tr-short margin-right 6px жив (зазор краткое↔дата);
//     — геометрия Task 556 жива: .ws-wcol-instr .ws-wcard
//       .ws-popup-row 6px/4px/gap 4px; базовая .ws-wcard
//       .ws-popup-row 5px 16px не тронута;
//   Санитар:
//     — заявка-цитата в исходнике;
//     — сервер WorkSchedule.gs НЕ менялся (КЛИЕНТ-Only);
//     — sw.js — версия кэша v766, следующей (v767) нет;
//     — tests/run-all.js подключает test-task557.js.
//
// Запуск: через tests/run-all.js (require './test-task557.js').

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
// 1. SRC: дата — iDateHtml, перенос после краткого
// ============================================================
describe('Task 557 — SRC: дата после краткого наименования', () => {
    test('SRC: заявка-цитата в комментарии у iNameHtml', () => {
        const i = WS_CLIENT.indexOf('var iNameHtml = iShort');
        assertTrue(i !== -1, 'переменная iNameHtml в ветке b5');
        const chunk = WS_CLIENT.slice(Math.max(0, i - 1600), i + 500);
        assertTrue(chunk.indexOf('Task 557') !== -1,
            'метка задачи в комментарии над составлением строки');
        assertTrue(chunk.indexOf('после краткого наименования') !== -1 &&
                   chunk.indexOf('остальной текст под ними') !== -1,
            'заявка «дату поставь после краткого… остальной текст под ними» процитирована');
    });

    test('SRC: дата — отдельный фрагмент iDateHtml (ДО ветвления)', () => {
        assertTrue(WS_CLIENT.indexOf(
            "var iDateHtml = '<span class=\"ws-tr-date\">' + iPeriod + '</span>';") !== -1,
            'дата собирается отдельным фрагментом iDateHtml');
        // фрагмент — ДО тернарника iShort: попадает в ОБЕ ветки
        // (Task 556 «без краткого тоже яркая» жив)
        const iDate = WS_CLIENT.indexOf("var iDateHtml = '<span class=\"ws-tr-date\">'");
        const iTern = WS_CLIENT.indexOf('var iNameHtml = iShort');
        assertTrue(iDate !== -1 && iTern !== -1 && iDate < iTern,
            'iDateHtml — до ветвления по краткому имени');
        const calls = WS_CLIENT.split('<span class="ws-tr-date">').length - 1;
        assertEqual(calls, 1,
            'РОВНО один датовый спан (плоская ветка b5, без дублей)');
    });

    test('SRC: строка С кратким — краткое + дата + остальной текст', () => {
        const i = WS_CLIENT.indexOf('var iNameHtml = iShort');
        const chunk = WS_CLIENT.slice(i, WS_CLIENT.indexOf('var iNameHtml', i) !== -1
            ? i + 900 : i + 900);
        assertTrue(chunk.indexOf("iDateHtml +") !== -1,
            'дата — сразу ПОСЛЕ краткого наименования (первая строка)');
        assertTrue(chunk.indexOf(
            "'<span class=\"ws-tr-rest\">' + iNameText + iNote + '</span>'") !== -1,
            'остальной текст — .ws-tr-rest = тема + примечание, БЕЗ даты');
        // даты в остальном тексте НЕТ: между iNameText и iNote
        // только конкатенация — отдельного iPeriod там не появляется
        const rest = WS_CLIENT.slice(
            WS_CLIENT.indexOf("'<span class=\"ws-tr-rest\">' + iNameText + iNote"),
            WS_CLIENT.indexOf("'<span class=\"ws-tr-rest\">' + iNameText + iNote") + 120);
        assertFalse(rest.indexOf('iPeriod') !== -1,
            'нижняя строка дату НЕ повторяет');
    });

    test('SRC: строка БЕЗ краткого — прежняя одна строка (iNameBody)', () => {
        assertTrue(WS_CLIENT.indexOf(
            'var iNameText = this._esc(it.тема || iMeta.name || it.тип);') !== -1,
            'полная тема — iNameText (Task 417 жив)');
        assertTrue(WS_CLIENT.indexOf(
            "var iNameBody = iNameText + ' · ' + iDateHtml + iNote;") !== -1,
            'без краткого — тема · дата · примечание одной строкой, как прежде');
    });

    test('SRC: диапазон дат жив (дата_начала — дата_окончания)', () => {
        assertTrue(WS_CLIENT.indexOf(
            "this._fmtDateRu(it.дата_начала) + ' — ' +") !== -1,
            'период из двух дат не тронут Task 557');
    });
});

// ============================================================
// 2. SRC: стили — вторая строка, размер даты, живые 555/556
// ============================================================
describe('Task 557 — SRC: CSS второй строки', () => {
    test('SRC: .ws-tr-rest — display: block (остальной текст ПОД ними)', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-tr-rest { display: block; }') !== -1,
            'остальной текст — второй строкой под кратким и датой');
        const i = INDEX_SRC.indexOf('.ws-tr-rest { display: block; }');
        const chunk = INDEX_SRC.slice(Math.max(0, i - 700), i + 100);
        assertTrue(chunk.indexOf('остальной текст под') !== -1,
            'комментарий цитирует заявку про вторую строку');
        // Task 555 размер остального текста жив
        assertTrue(INDEX_SRC.indexOf('.ws-tr-rest { font-size: 13px; }') !== -1,
            'размер 13px остального текста (Task 555) на месте');
    });

    test('SRC: .ws-tr-date — 13px ЯВНО + прежние 600/--text-primary', () => {
        const i = INDEX_SRC.indexOf('.ws-tr-date {');
        assertTrue(i !== -1, 'правило .ws-tr-date есть');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('font-size: 13px') !== -1,
            'дата вышла из .ws-tr-rest — размер 13px задан явно');
        assertTrue(rule.indexOf('font-weight: 600') !== -1 &&
                   rule.indexOf('var(--text-primary, #e0e0e0)') !== -1,
            'яркость Task 556 (вес 600, --text-primary) жива');
    });

    test('SRC: .ws-tr-short margin-right 6px жив (зазор краткое↔дата)', () => {
        assertTrue(INDEX_SRC.indexOf(
            '.ws-tr-short { margin-right: 6px; }') !== -1,
            'отступ Task 556 жив — теперь зазор между кратким и датой');
    });

    test('SRC: геометрия Task 556 жива, базовая НЕ тронута', () => {
        const i = INDEX_SRC.indexOf(
            '.ws-wcol-instr .ws-wcard .ws-popup-row {');
        assertTrue(i !== -1, 'правило колонки инструктажей на месте');
        const rule = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(rule.indexOf('padding-left: 6px') !== -1 &&
                   rule.indexOf('padding-right: 4px') !== -1 &&
                   rule.indexOf('gap: 4px') !== -1,
            'поля 6px/4px и зазор 4px (Task 556) живы');
        const j = INDEX_SRC.indexOf('.ws-wcard .ws-popup-row {');
        const base = INDEX_SRC.slice(j, INDEX_SRC.indexOf('}', j) + 1);
        assertTrue(base.indexOf('padding: 5px 16px') !== -1,
            'базовые строки карточки — прежние поля');
    });
});

// ============================================================
// 3. Санитар
// ============================================================
describe('Task 557 — санитар', () => {
    test('санитар: сервер WorkSchedule.gs НЕ менялся (КЛИЕНТ-ONLY)', () => {
        assertTrue(WS_GS_SRC.indexOf('Task 557') === -1,
            'метки Task 557 в сервере нет — серверного деплоя НЕТ');
    });

    test('санитар: sw.js — версия кэша поднята (горячее обновление)', () => {
        assertTrue(SW_SRC.indexOf(
            "const CACHE_VERSION = 'kipia-test-v769'") !== -1,
            'SW v766 — клиенты обновятся при открытии');
        assertTrue(SW_SRC.indexOf('kipia-test-v770') === -1,
            'следующей версии нет');
    });

    test('санитар: run-all.js подключает test-task557.js', () => {
        assertTrue(RUN_ALL_SRC.indexOf(
            "require('./test-task557.js');") !== -1,
            'новый тест в общем прогоне');
    });
});
