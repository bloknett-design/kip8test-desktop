// ============================================================
// Task 398 — заявка: «Почему в роли КИП ИОС видна кнопка
// "Работники" в разделе Табель учёта рабочего времени, хотя
// доступа и перехода по ней нет?»
//
// ДИАГНОЗ (воспроизведено зондом, Chromium 1280, роль КИП ИОС
// c workschedule.view.min):
//   · JS-гейт Task 395 КОРРЕКТНО ставил #wsWorkersBtn hidden=true
//     (уровень min — карточки недоступны), НО кнопка ОСТАВАЛАСЬ
//     на экране: CSS-правило .ws-refresh-btn { display:
//     inline-flex } ПЕРЕБИВАЛО браузерный UA-стиль
//     [hidden] { display: none } (авторский CSS всегда сильнее
//     UA-стилей); замер: rect 107×30 при hidden=true;
//   · клик молча отсекался openWorkersPage (min ≠ edit/view):
//     ни перехода, ни «Нет доступа» — симптом заявки.
//
// ФИКС — ОДНО универсальное CSS-правило в начале <style>:
//     [hidden] { display: none !important; }
// восстанавливает семантику атрибута hidden ПО ВСЕМУ приложению:
// элемент с атрибутом не отображается, какой бы display ни задавал
// авторский CSS; показ — всегда снятием атрибута (el.hidden=false).
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// ============================================================
// 1. SRC — CSS: универсальное правило [hidden]
// ============================================================
describe('Task 398 — SRC: правило [hidden] { display: none !important; }', () => {

    test('правило присутствует дословно', () => {
        assertTrue(INDEX_SRC.indexOf('[hidden] { display: none !important; }') !== -1,
            'фикс Task 398 жив в index.html');
    });

    test('размещено в ПЕРВОМ <style> — ДО всех авторских display-правил', () => {
        const iFix = INDEX_SRC.indexOf('[hidden] { display: none !important; }');
        const iStyle = INDEX_SRC.indexOf('<style>');
        const iRoot = INDEX_SRC.indexOf(':root {');
        const iRefresh = INDEX_SRC.indexOf('.ws-refresh-btn {');
        assertTrue(iStyle !== -1 && iFix > iStyle, 'внутри <style>');
        assertTrue(iRoot !== -1 && iFix < iRoot,
            'в самом начале — до :root (документирующая позиция)');
        assertTrue(iRefresh !== -1 && iFix < iRefresh,
            'до .ws-refresh-btn — источника утечки display:inline-flex');
    });

    test('комментарий-диагноз у правила (заявка + причина)', () => {
        const i = INDEX_SRC.indexOf('[hidden] { display: none !important; }');
        const head = INDEX_SRC.slice(Math.max(0, i - 1400), i);
        assertTrue(head.indexOf('Task 398') !== -1,
            'комментарий ссылается на Task 398');
        assertTrue(head.indexOf('ws-refresh-btn') !== -1,
            'комментарий называет источник утечки (.ws-refresh-btn)');
        assertTrue(head.indexOf('wsWorkersBtn') !== -1,
            'комментарий называет кнопку «Работники» (#wsWorkersBtn)');
    });

    test('остаётся РОВНО ОДНО такое правило (не размножается бампами)', () => {
        assertEqual(INDEX_SRC.split('[hidden] { display: none !important; }').length - 1, 1,
            'правило уникально');
    });

    test('источник утечки не «лечится» правкой .ws-refresh-btn', () => {
        const i = INDEX_SRC.indexOf('.ws-refresh-btn {');
        assertTrue(i !== -1, 'правило .ws-refresh-btn живо');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', i) + 1);
        assertTrue(block.indexOf('display: inline-flex') !== -1,
            'тулбарная кнопка остаётся inline-flex — скрытие даёт [hidden]!');
        assertFalse(block.indexOf('[hidden]') !== -1,
            'локальный хак внутри .ws-refresh-btn не ставится (фикс универсальный)');
    });
});

// ============================================================
// 2. SRC — JS-гейты Task 395 НЕ тронуты (механизм — атрибут hidden)
// ============================================================
describe('Task 398 — SRC: JS-гейты кнопки «Работники» без изменений', () => {

    test('init: hidden = null || min — как в Task 395', () => {
        const i = INDEX_SRC.indexOf('workersBtnInit = document');
        assertTrue(i !== -1, 'строка init жива');
        const chunk = INDEX_SRC.slice(i, i + 400);
        assertTrue(chunk.indexOf(
            "workersBtnInit.hidden =\n                (this._viewLevel === null || this._viewLevel === 'min')") !== -1,
            'гейт уровня на месте');
    });

    test('_onRoleUpdate: hidden = null || min — как в Task 395', () => {
        const i = INDEX_SRC.indexOf('workersBtn = document');
        assertTrue(i !== -1, 'строка _onRoleUpdate жива');
        const chunk = INDEX_SRC.slice(i, i + 400);
        assertTrue(chunk.indexOf(
            "workersBtn.hidden =\n                (newLevel === null || newLevel === 'min')") !== -1,
            'гейт поздней роли на месте');
    });

    test('механизм скрытия — ТОЛЬКО атрибут (никаких style.display у wsWorkersBtn)', () => {
        assertFalse(/wsWorkersBtn[^;]{0,80}\.style\.display/.test(INDEX_SRC),
            'JS не трогает style.display кнопки — теперь hidden работает благодаря CSS!');
    });

    test('HTML кнопки — атрибут hidden в разметке (до первого прогона гейтов)', () => {
        const i = INDEX_SRC.indexOf('id="wsWorkersBtn"');
        assertTrue(i !== -1, 'кнопка в разметке');
        const tag = INDEX_SRC.slice(i - 60, i + 260);
        assertTrue(/\shidden(\s|>)/.test(tag),
            'разметка стартует со hidden (нет мигания до прихода матрицы)');
    });
});

// ============================================================
// 3. SRC — SW-версия задачи
// ============================================================
describe('Task 398 — SRC: сервис-воркер', () => {

    test('sw.js: CACHE_VERSION kipia-test-v741', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v741'") !== -1,
            'бамп v625 -> v626 (клиентский фикс раздаётся из кэша SW)');
    });

    test('sw.js: v627 НЕ существует (guard от двойного бампа)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v742') === -1,
            'v627 отсутствует — следующая задача');
    });
});
