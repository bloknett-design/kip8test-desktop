// ============================================================
// Task 415 — заявка: «В карте работника, в блоках, записи
// которые не помещяются в одну строчку должны переноситься
// на следующую строчку».
//
// Фикс (CSS, только index.html): записи блоков карты — темы
// мероприятий/инструктажей (.ws-popup-name) — переносятся
// на следующую строку вместо обрезания многоточием. Действует
// в блоках-окнах страницы «Работники» (.ws-wcard; попап
// карточки у сетки удалён по Task 417 — переносился этим же
// правилом до удаления). Заголовки блоков (.ws-wcard
// .ws-whead-t) тоже переносятся (поведение ws-whead-wrap
// Task 405 — по умолчанию). Попап дня «Мероприятия в этот день» и окно
// выбора кодов (#wsCellPopup) — прежний компактный
// однострочный вид (Task 319).
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function ruleBlock(sel) {
    const i = INDEX_SRC.indexOf(sel);
    if (i === -1) return null;
    const end = INDEX_SRC.indexOf('\n    }', i);
    return end === -1 ? null : INDEX_SRC.slice(i, end + 7);
}

// ============================================================
// 1. SRC — записи блоков карты переносятся
// ============================================================
describe('Task 415 — SRC: перенос записей', () => {

    test('правило переноса записей — обе проекции карты', () => {
        // Task 417: попап удалён — правило живёт только для .ws-wcard
        const i = INDEX_SRC.indexOf('.ws-wcard .ws-popup-name {');
        assertTrue(i !== -1,
            'правило переноса записей .ws-wcard .ws-popup-name существует');
        assertFalse(INDEX_SRC.indexOf('#wsEmpPopup .ws-popup-name') !== -1,
            'селектор попапа удалён (Task 417)');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(block.indexOf('white-space: normal') !== -1 &&
                   block.indexOf('overflow-wrap: break-word') !== -1 &&
                   block.indexOf('overflow: visible') !== -1 &&
                   block.indexOf('text-overflow: clip') !== -1,
            'записи переносятся: normal + break-word, без ellipsis');
        assertTrue(block.indexOf('line-height: 1.35') !== -1,
            'межстрочный интервал многострочных записей');
    });

    test('маркер Task 415 у правила переноса', () => {
        assertTrue(INDEX_SRC.indexOf('Task 415 (заявка): в блоках КАРТЫ работника записи') !== -1,
            'комментарий-маркер Task 415 у правила переноса записей');
    });

    test('базовое .ws-popup-name НЕ тронуто (компактный вид вне карты)', () => {
        const r = ruleBlock('.ws-popup-name {');
        assertTrue(r !== null, 'базовое правило живо');
        assertTrue(r.indexOf('white-space: nowrap') !== -1 &&
                   r.indexOf('text-overflow: ellipsis') !== -1,
            'попап дня «Мероприятия в этот день» — прежний однострочный вид');
    });

    test('регресс 319/330: окно выбора кодов #wsCellPopup — перенос', () => {
        const r = ruleBlock('#wsCellPopup .ws-popup-name {');
        assertTrue(r !== null, 'правило Task 319 живо');
        assertTrue(r.indexOf('white-space: normal') !== -1 &&
                   r.indexOf('font-size: 10px') !== -1,
            'окно кодов по-прежнему переносит названия (Task 319/330)');
    });
});

// ============================================================
// 2. SRC — заголовки блоков и секций попапа
// ============================================================
describe('Task 415 — SRC: заголовки', () => {

    test('.ws-wcard .ws-whead-t — перенос по умолчанию (было nowrap)', () => {
        const r = ruleBlock('.ws-wcard .ws-whead-t {');
        assertTrue(r !== null, 'правило живо');
        assertTrue(r.indexOf('white-space: normal') !== -1 &&
                   r.indexOf('overflow: visible') !== -1 &&
                   r.indexOf('text-overflow: clip') !== -1,
            'заголовки блоков (ФИО, секции) переносятся, не эллипсис');
        assertTrue(r.indexOf('white-space: nowrap') === -1,
            'старый nowrap убран из базового правила заголовков');
        // регресс 396: типографика заголовков не тронута
        assertTrue(r.indexOf('font-size: 13px;') !== -1 &&
                   r.indexOf('font-weight: 700;') !== -1,
            'типографика Task 396 сохранена');
    });

    test('регресс 405: правило-маркер .ws-whead-wrap живо', () => {
        const r = ruleBlock('.ws-wcard .ws-whead-t.ws-whead-wrap {');
        assertTrue(r !== null && r.indexOf('white-space: normal') !== -1,
            'класс-маркер Task 405 сохранён (применён в HTML)');
        assertTrue(INDEX_SRC.indexOf('ws-whead-t ws-whead-wrap') !== -1,
            'заголовок блока инструктажей по-прежнему носит класс');
    });

    test('Task 417: правила заголовков попапа карточки удалены', () => {
        assertFalse(INDEX_SRC.indexOf('.ws-emp-popup .ws-popup-sec {') !== -1,
            'правило заголовков попапа удалено вместе с окном');
        // перенос заголовков КАРТЫ (страница) жив — .ws-wcard
        const i = INDEX_SRC.indexOf('.ws-wcard .ws-whead-t {');
        assertTrue(i !== -1,
            'перенос заголовков блоков карты жив (Task 415)');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(block.indexOf('white-space: normal') !== -1 &&
                   block.indexOf('overflow-wrap: break-word') !== -1 &&
                   block.indexOf('text-overflow: clip') !== -1,
            'заголовки блоков карты переносятся');
    });

    test('базовые .ws-popup-title/.ws-popup-sec вне карты НЕ тронуты', () => {
        const t = ruleBlock('.ws-popup-title {');
        assertTrue(t !== null && t.indexOf('white-space: nowrap') !== -1,
            'заголовок попапа дня — прежний однострочный (не карта)');
        const s = ruleBlock('.ws-popup-sec {');
        assertTrue(s !== null, 'базовое .ws-popup-sec живо (без our-правил)');
    });
});

// ============================================================
// 3. SRC — СИЗ и отпуска (уже переносились — не сломаны)
// ============================================================
describe('Task 415 — SRC: прочие строки карты', () => {

    test('СИЗ: наименование/мета по-прежнему переносятся', () => {
        const n = ruleBlock('.ws-ppe-name {');
        assertTrue(n !== null && n.indexOf('overflow-wrap: break-word') !== -1,
            'регресс 392: имя СИЗ переносится');
        const b = ruleBlock('.ws-ppe-item .ws-ppe-body {');
        assertTrue(b !== null && b.indexOf('flex: 1') !== -1,
            'тело строки СИЗ растянуто (Task 404)');
    });

    test('значения полей .ws-emp-v — без nowrap (переносятся)', () => {
        const r = ruleBlock('.ws-emp-field .ws-emp-v {');
        assertTrue(r !== null, 'правило живо');
        assertTrue(r.indexOf('white-space') === -1,
            'нет запрета переноса у значений (отпуска/профиль)');
    });
});

// ============================================================
// 4. SW — версия
// ============================================================
describe('Task 415 — SW версия', () => {
    test('v642', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v732'") !== -1,
            'SW кэш — kipia-test-v732');
        assertTrue(SW_SRC.indexOf('kipia-test-v641') === -1,
            'v641 не осталась в sw.js');
        assertTrue(SW_SRC.indexOf('kipia-test-v733') === -1,
            'двойной бамп отсутствует (guard: v643)');
    });
});
