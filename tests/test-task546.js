// tests/test-task546.js
// Task 546 — заявка пользователя: «В разделе сапёр, сделай
// анимирование переворачивания клетки с эффектом блика по глянцу
// и с вибрацией, так же нужно сделать архив счёта пользователей
// по емаил, в файле KIP8_Access добавить новую страницу для этих
// целей.»
//
// РЕШЕНИЕ:
//   КЛИЕНТ (index.html):
//     • анимация переворота клетки: @keyframes msCellFlip
//       (rotateY 90°→0°, scale 0.72→1) + глянцевый блик —
//       ::after с диагональным градиентом скользит по грани
//       (msCellShine, translateX), animation-delay: inherit —
//       блик ждёт свой переворот; perspective на .ms-board;
//     • волна: ново-открытые клетки хода (клик +
//       автораскрытие + мины при взрыве) переворачиваются с
//       задержкой msFlipDelay = min(dist*35, 385) мс от
//       эпицентра (Chebyshev);
//     • вибрация: msVibrate(12) на открытие клетки, [80,60,120]
//       взрыв, [40,40,40,40,100] победа (обёртка msVibrate —
//       iOS Safari без вибро не падает);
//     • отложенный финал (msDelayedOverlay, гвард msGameId):
//       взрыв 750 мс / победа 650 мс — волна отыгрывает ДО
//       оверлея; prefers-reduced-motion — без анимаций;
//     • архив партий на сервере: msSrvSendResult (конец партии,
//       fire-and-forget) + msSrvLoadArchive (msInit, троттлинг
//       60 с, кэш localStorage, тихая деградация без
//       сети/токена/модуля) + блок «Архив партий» #msSrvArchive.
//   СЕРВЕР:
//     • scripts/MinesweeperArchive.gs — НОВЫЙ лист «Сапёр» В
//       ФАЙЛЕ KIP8_Access (по заявке; тот же ID, что
//       RoleMatrix/SessionsDevicePolicy): строки 1–2 титул/
//       описание (объединение БЕЗ закрепления колонок — урок
//       RoleMatrixInit v4), строка 3 — заголовки, данные со
//       строки 4 (id/дата/email/имя/результат/сложность/поле/
//       время_сек/мины);
//     • minesweeper.recordResult (валидация: won, time 0..36000,
//       diff, поле 4..60, мины 1..500 < клеток; LockService;
//       Utils.audit MINE_RECORD_WIN/LOSS) и
//       minesweeper.getMyArchive (ТОЛЬКО свои по email из
//       сессии, последние 50 новые-первыми, stats c best по
//       сложностям); гейт secret.view fail-closed;
//       minesweeperArchiveInit/Status — разовое создание/
//       диагностика; ленивое создание листа при первом API-обращении;
//     • scripts/Code.gs — 2 маршрута + строка в индексе модулей.
//
// Запуск: через tests/run-all.js (require './test-task546.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');
const { extractFunctions, setMockViewport } = require('./extract-functions.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'MinesweeperArchive.gs'), 'utf8');
const CODE_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Code.gs'), 'utf8');
const RM_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'RoleMatrix.gs'), 'utf8');

// Префикс localStorage-ключей текущего репозитория (как test-task543)
const PFX_MATCH = INDEX_SRC.match(/const PB_FAV_KEY = '(\w+?)_phonebook_favorites'/);
const PFX = PFX_MATCH ? PFX_MATCH[1] : null;
// Task 546: v756→v757 (kip8test), v553→v554 (kip8)
const SW_EXPECTED = { kip8test: 'kipia-test-v760', kip8: 'kipia-v554' }[PFX] || null;
const SW_NEXT = { kip8test: 'kipia-test-v761', kip8: 'kipia-v555' }[PFX] || null;

// Фрагмент кода игры «Сапёр» (для локальных проверок)
function msRegion() {
    const i = INDEX_SRC.indexOf('// ======================== ИГРА САПЁР ========================');
    const j = INDEX_SRC.indexOf('// ===== СЕКРЕТНАЯ КНОПКА (САПЁР) =====');
    if (i === -1 || j === -1) return null;
    return INDEX_SRC.slice(i, j);
}

// ============================================================
// 1. SRC — CSS: переворот, блик, перспектива, доступность
// ============================================================
describe('Task 546 — SRC CSS: анимация переворота + блик по глянцу', () => {

    test('перспектива поля: .ms-board { perspective: 900px; }', () => {
        assertTrue(INDEX_SRC.indexOf('.ms-board { perspective: 900px; }') !== -1,
            '3D-глубина переворота');
    });

    test('ключевые кадры переворота: msCellFlip, rotateY 90°→0°', () => {
        assertTrue(INDEX_SRC.indexOf('@keyframes msCellFlip') !== -1,
            'keyframes объявлены');
        const i = INDEX_SRC.indexOf('@keyframes msCellFlip');
        const body = INDEX_SRC.slice(i, INDEX_SRC.indexOf('}', INDEX_SRC.indexOf('100%', i)) + 1);
        assertTrue(body.indexOf('rotateY(90deg)') !== -1, 'старт — ребром');
        assertTrue(body.indexOf('rotateY(0deg)') !== -1, 'финиш — лицом');
    });

    test('блик по глянцу: ::after с диагональным градиентом (msCellShine)', () => {
        assertTrue(INDEX_SRC.indexOf('.ms-cell.ms-cell-flip::after') !== -1,
            'псевдоэлемент блика');
        const i = INDEX_SRC.indexOf('.ms-cell.ms-cell-flip::after');
        const body = INDEX_SRC.slice(i, i + 900);
        assertTrue(body.indexOf('linear-gradient(105deg') !== -1,
            'диагональная полоса света');
        assertTrue(body.indexOf('rgba(255,255,255,0.55)') !== -1,
            'глянец — белый пик в центре');
        assertTrue(INDEX_SRC.indexOf('@keyframes msCellShine') !== -1,
            'движение блика');
        const k = INDEX_SRC.indexOf('@keyframes msCellShine');
        const kb = INDEX_SRC.slice(k, k + 400);
        assertTrue(kb.indexOf('translateX(320%)') !== -1,
            'блик скользит поперёк клетки (GPU-транзишн)');
    });

    test('блик ждёт свой переворот: animation-delay: inherit', () => {
        const i = INDEX_SRC.indexOf('.ms-cell.ms-cell-flip::after');
        const body = INDEX_SRC.slice(i, i + 900);
        assertTrue(body.indexOf('animation-delay: inherit') !== -1,
            'задержка волны наследуется псевдоэлементом');
    });

    test('класс переворота .ms-cell-flip с анимацией 0.45s backwards', () => {
        const i = INDEX_SRC.indexOf('.ms-cell.ms-cell-flip {');
        const body = INDEX_SRC.slice(i, i + 300);
        assertTrue(body.indexOf('animation: msCellFlip 0.45s') !== -1,
            'переворот 0.45 с');
        assertTrue(body.indexOf('backwards') !== -1,
            'fill backwards — до старта клетка «закрыта» ( ребро )');
    });

    test('prefers-reduced-motion — анимации отключаются', () => {
        const i = INDEX_SRC.indexOf('.ms-cell.ms-cell-flip { animation: none; }');
        assertTrue(i !== -1, 'переворот выключен в reduced-motion');
        // блок reduced-motion содержит и блик
        const body = INDEX_SRC.slice(i - 200, i + 300);
        assertTrue(body.indexOf('@media (prefers-reduced-motion: reduce)') !== -1,
            'медиа-блок есть');
        assertTrue(body.indexOf('content: none') !== -1,
            'блик выключен');
    });

    test('светлая тема: блик контрастнее + слоты архива', () => {
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ms-cell.ms-cell-flip::after') !== -1,
            'блик светлой темы');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ms-ach-slot.loss') !== -1,
            'слот проигрыша светлой темы');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ms-ach-date') !== -1,
            'дата слота светлой темы');
    });

    test('слоты архива: .ms-ach-slot.loss + .ms-ach-date', () => {
        assertTrue(INDEX_SRC.indexOf('.ms-ach-slot.loss') !== -1,
            'слот проигранной партии');
        assertTrue(INDEX_SRC.indexOf('.ms-ach-date') !== -1,
            'дата в слоте архива');
    });
});

// ============================================================
// 2. SRC — JS: волна переворотов, вибрация, отложенный финал
// ============================================================
describe('Task 546 — SRC JS: перевороты/вибрация/отложенный финал', () => {

    test('чистая функция msFlipDelay: волна min(dist*35, 385) мс', () => {
        const rg = msRegion();
        assertTrue(rg && rg.indexOf('function msFlipDelay(') !== -1,
            'функция объявлена');
        assertTrue(rg.indexOf('Math.min(dist * 35, 385)') !== -1,
            'задержка — расстояние с потолком');
        assertTrue(rg.indexOf('Math.abs(r - originR)') !== -1,
            'Chebyshev-расстояние от эпицентра хода');
    });

    test('обёртка вибрации msVibrate (iOS Safari — без падения)', () => {
        const rg = msRegion();
        assertTrue(rg.indexOf('function msVibrate(') !== -1,
            'обёртка есть');
        const i = rg.indexOf('function msVibrate(');
        const body = rg.slice(i, rg.indexOf('}', i));
        assertTrue(body.indexOf("typeof navigator !== 'undefined'") !== -1,
            'гвард navigator');
        assertTrue(body.indexOf('navigator.vibrate') !== -1,
            'вызов вибро');
    });

    test('снимок поля + очередь переворотов (msSnapshotRevealed/msQueueFlips)', () => {
        const rg = msRegion();
        assertTrue(rg.indexOf('function msSnapshotRevealed(') !== -1,
            'снимок «до»');
        assertTrue(rg.indexOf('function msQueueFlips(') !== -1,
            'разница «до → после»');
        const i = rg.indexOf('function msQueueFlips(');
        const body = rg.slice(i, rg.indexOf('msDelayedOverlay', i));
        assertTrue(body.indexOf('!before[r][c] && msRevealed[r][c]') !== -1,
            'в очередь — только НОВО-открытые клетки');
    });

    test('msRender: класс .ms-cell-flip + animationDelay волны', () => {
        const rg = msRegion();
        assertTrue(rg.indexOf("cell.classList.add('ms-cell-flip')") !== -1,
            'класс переворота');
        assertTrue(rg.indexOf('cell.style.animationDelay = msFlipDelay(') !== -1,
            'задержка от эпицентра');
        // очередь отыграна этим рендером; вхождений три: объявление
        // let, сброс в msInit (новая серия) и конец msRender
        // (повтора следующим рендером нет)
        assertEqual((rg.match(/msFlipCells = null;/g) || []).length, 3,
            'сброс очереди — объявление + msInit + конец msRender');
    });

    test('msReveal: вибрация 12 мс на открытие; [80,60,120] на взрыв', () => {
        const rg = msRegion();
        assertTrue(rg.indexOf('msVibrate(12);') !== -1, 'лёгкий отклик клетки');
        assertTrue(rg.indexOf('msVibrate([80, 60, 120]);') !== -1,
            'вибрация взрыва');
    });

    test('msCheckWin: вибрация победы [40,40,40,40,100]', () => {
        const rg = msRegion();
        assertTrue(rg.indexOf('msVibrate([40, 40, 40, 40, 100]);') !== -1,
            'салют победы');
    });

    test('отложенный финал: взрыв 750 мс, победа 650 мс, гвард msGameId', () => {
        const rg = msRegion();
        assertTrue(rg.indexOf('msDelayedOverlay(false, 750)') !== -1,
            'оверлей взрыва после волны мин');
        assertTrue(rg.indexOf('msDelayedOverlay(true, 650)') !== -1,
            'оверлей победы после волны');
        assertTrue(rg.indexOf('function msDelayedOverlay(') !== -1,
            'функция есть');
        const i = rg.indexOf('function msDelayedOverlay(');
        const body = rg.slice(i, rg.indexOf('function msRender()', i));
        assertTrue(body.indexOf('msGameId !== gameId') !== -1,
            'гвард: новая игра отменяет отложенный оверлей');
    });

    test('msInit: новая серия msGameId++ + сброс очереди', () => {
        const rg = msRegion();
        assertTrue(rg.indexOf('msGameId++;') !== -1, 'инкремент серии');
    });

    test('финалы не дублируют старый синхронный код (оверлей только отложенный)', () => {
        const rg = msRegion();
        assertFalse(rg.indexOf('msShowOverlay(false);') !== -1,
            'взрыв: прямой вызов msShowOverlay убран (было до Task 546)');
        assertFalse(rg.indexOf('msShowOverlay(true);') !== -1,
            'победа: прямой вызов msShowOverlay убран');
        // флаги на мины — внутри msDelayedOverlay (после волны)
        const i = rg.indexOf('function msDelayedOverlay(');
        const body = rg.slice(i, rg.indexOf('function msRender()', i));
        assertTrue(body.indexOf('msFlagged[r][c] = true') !== -1,
            'авто-флаги на мины — в отложенном финале');
    });
});

// ============================================================
// 3. SRC — JS: клиент серверного архива (отправка/чтение/кэш)
// ============================================================
describe('Task 546 — SRC JS: клиент архива партий на сервере', () => {

    test('msShowOverlay → msSrvSendResult(won): конец партии уходит на сервер', () => {
        const rg = msRegion();
        assertTrue(rg.indexOf('msSrvSendResult(won);') !== -1,
            'вызов после локального счёта Task 193');
    });

    test('msSrvSendResult: action minesweeper.recordResult + полный payload', () => {
        const rg = msRegion();
        const i = rg.indexOf("KipAuth.api('minesweeper.recordResult'");
        assertTrue(i !== -1, 'action записи');
        const body = rg.slice(i, rg.indexOf('}).then', i));
        ['token: token', 'won: !!won', 'time: msSeconds | 0',
         'diff: msCurrentDiff', 'cols: msCols', 'rows: msRows',
         'mines: msMines'].forEach(function (f) {
            assertTrue(body.indexOf(f) !== -1, 'payload: ' + f);
        });
    });

    test('тихая деградация: fire-and-forget без токена/сети', () => {
        const rg = msRegion();
        const i = rg.indexOf('function msSrvSendResult(');
        const body = rg.slice(i, rg.indexOf('function msSrvLoadArchive(', i));
        assertTrue(body.indexOf("KipAuth.getToken()") !== -1, 'токен');
        assertTrue(body.indexOf('if (!token) return') !== -1,
            'без сессии — только локальный счёт');
        assertTrue(body.indexOf(".catch(function () { /* тихо: партия уже окончена */ })") !== -1,
            'сбой записи — молча');
    });

    test('msSrvLoadArchive: action minesweeper.getMyArchive + троттлинг 60 с', () => {
        const rg = msRegion();
        assertTrue(rg.indexOf("KipAuth.api('minesweeper.getMyArchive'") !== -1,
            'action чтения');
        assertTrue(rg.indexOf('const MS_SRV_TTL = 60000;') !== -1,
            'троттлинг 60 с');
        assertTrue(rg.indexOf('function msSrvThrottled(') !== -1,
            'чистая функция троттлинга (тесты)');
    });

    test('кэш оффлайна: ключи msSrvArchiveCache / msSrvArchiveFetchTs', () => {
        const rg = msRegion();
        assertTrue(rg.indexOf("const MS_SRV_CACHE_KEY = 'msSrvArchiveCache';") !== -1,
            'кэш ответа');
        assertTrue(rg.indexOf("const MS_SRV_FETCH_TS_KEY = 'msSrvArchiveFetchTs';") !== -1,
            'время последнего запроса');
        assertTrue(rg.indexOf('function msSrvRenderCached(') !== -1,
            'рендер из кэша при сбое сети');
    });

    test('блок скрывается без данных/сессии; статистика «N партий · M побед»', () => {
        const rg = msRegion();
        const i = rg.indexOf('function msSrvRenderArchive(');
        const body = rg.slice(i, rg.indexOf('function msRenderArchiveRow(', i));
        assertTrue(body.indexOf("block.style.display = 'none'") !== -1,
            'скрытие без данных');
        assertTrue(body.indexOf("' партий · '") !== -1 &&
                   body.indexOf("' побед'") !== -1,
            'строка статистики');
    });

    test('чистая функция msRenderArchiveRow (рендер строки архива)', () => {
        const rg = msRegion();
        assertTrue(rg.indexOf('function msRenderArchiveRow(') !== -1,
            'функция есть (тесты VM ниже)');
    });

    test('HTML: блок «Архив партий» #msSrvArchive + #msSrvRow + #msSrvStat', () => {
        assertTrue(INDEX_SRC.indexOf('id="msSrvArchive"') !== -1,
            'контейнер блока');
        assertTrue(INDEX_SRC.indexOf('id="msSrvRow"') !== -1, 'строка слотов');
        assertTrue(INDEX_SRC.indexOf('id="msSrvStat"') !== -1, 'бейдж статистики');
        assertTrue(INDEX_SRC.indexOf('Архив партий') !== -1,
            'человекочитаемое название');
        // скрыт по умолчанию — до появления данных (style после id)
        const i = INDEX_SRC.indexOf('id="msSrvArchive"');
        assertTrue(INDEX_SRC.slice(i, i + 80).indexOf('display:none;') !== -1,
            'display:none до данных');
    });
});

// ============================================================
// 4. SRC — scripts/MinesweeperArchive.gs (сервер)
// ============================================================
describe('Task 546 — SRC: MinesweeperArchive.gs (лист «Сапёр» в KIP8_Access)', () => {

    test('модуль определён (var MinesweeperArchive = {)', () => {
        assertTrue(GS_SRC.indexOf('var MinesweeperArchive = {') !== -1,
            'объект-модуль в стиле PhonebookArchive.gs');
    });

    test('новая страница В ФАЙЛЕ KIP8_Access — тот же ID, что RoleMatrix', () => {
        assertTrue(GS_SRC.indexOf("SHEET: 'Сапёр'") !== -1,
            'лист «Сапёр» (страница архива)');
        const rmId = RM_SRC.match(/ROLE_MATRIX_SPREADSHEET_ID = '([^']+)'/);
        assertTrue(!!rmId, 'ID из RoleMatrix.gs извлечён');
        assertTrue(GS_SRC.indexOf("SPREADSHEET_ID: '" + rmId[1] + "'") !== -1,
            'MinesweeperArchive открывает ТУ ЖЕ таблицу KIP8_Access');
    });

    test('колонки листа: id/дата/email/имя/результат/сложность/поле/время/мины', () => {
        assertTrue(GS_SRC.indexOf("HEADERS: ['id', 'дата', 'email', 'имя', 'результат',") !== -1,
            'заголовки (начало)');
        assertTrue(GS_SRC.indexOf("'сложность', 'поле', 'время_сек', 'мины']") !== -1,
            'заголовки (конец)');
        assertTrue(GS_SRC.indexOf('TEXT_COLS: [2, 3, 4, 5, 6, 7]') !== -1,
            "формат '@' на текстовых колонках (Task 304)");
    });

    test('гейт secret.view (как у страницы «Сапёр»), fail-closed', () => {
        assertTrue(GS_SRC.indexOf("rmRequirePerm(token, 'secret.view', 'MinesweeperArchive')") !== -1,
            'право секретных кнопок');
        assertTrue(GS_SRC.indexOf('fail-closed') !== -1,
            'без RoleMatrixGate.gs — отказ всем');
    });

    test('email — из СЕССИИ, не из payload (подделка чужого счёта невозможна)', () => {
        assertTrue(GS_SRC.indexOf('var email = this._normEmail(user.email);') !== -1,
            'recordResult: email из гейта');
        assertTrue(GS_SRC.indexOf("this._normEmail(g.user.email)") !== -1,
            'getMyArchive: email из гейта');
        const i = GS_SRC.indexOf('_validateGame: function');
        const body = GS_SRC.slice(i, GS_SRC.indexOf('_requireAccess', i));
        assertFalse(body.indexOf('payload.email') !== -1,
            'валидатор не читает email из payload');
    });

    test('getMyArchive: ТОЛЬКО свои записи, новые первыми, лимит 50', () => {
        assertTrue(GS_SRC.indexOf("if (rec.email !== email) continue;") !== -1,
            'фильтр по email');
        assertTrue(GS_SRC.indexOf('rows.reverse();') !== -1,
            'новые первыми (лист — append-порядок)');
        assertTrue(GS_SRC.indexOf('MAX_ROWS_RETURN: 50') !== -1, 'последние 50');
    });

    test('валидация: won/time/diff/поле/мины — отклонения, не обрезка', () => {
        ['invalid_result', 'invalid_time', 'invalid_diff',
         'invalid_field', 'invalid_mines'].forEach(function (code) {
            assertTrue(GS_SRC.indexOf(code) !== -1, 'код ' + code);
        });
        assertTrue(GS_SRC.indexOf('MAX_TIME: 36000') !== -1, 'потолок времени');
        assertTrue(GS_SRC.indexOf('mines >= cols * rows') !== -1,
            'мины не больше клеток — бессмыслица отклоняется');
    });

    test('LockService + Utils.audit (MINE_RECORD_WIN/LOSS)', () => {
        assertTrue(GS_SRC.indexOf('LockService.getScriptLock()') !== -1,
            'блокировка автоинкремента');
        assertTrue(GS_SRC.indexOf("'MINE_RECORD_WIN'") !== -1, 'код аудита победы');
        assertTrue(GS_SRC.indexOf("'MINE_RECORD_LOSS'") !== -1, 'код аудита поражения');
    });

    test('уроки RoleMatrixInit v3/v4: закрепление СТРОК ДО объединения, колонки не трогаем', () => {
        const i = GS_SRC.indexOf('_ensureSheet: function');
        const body = GS_SRC.slice(i, GS_SRC.indexOf('_nextId', i));
        const freeze = body.indexOf('setFrozenRows(3)');
        const merge = body.indexOf('.merge()');
        assertTrue(freeze !== -1 && merge !== -1, 'есть и закрепление, и объединение');
        assertTrue(freeze < merge, 'закрепление ДО объединения (урок v3)');
        assertFalse(body.indexOf('setFrozenColumns') !== -1,
            'закрепления колонок НЕТ (урок v4 — «пустые листы»)');
    });

    test('инструменты: minesweeperArchiveInit (идемпотентно) + Status', () => {
        assertTrue(GS_SRC.indexOf('function minesweeperArchiveInit()') !== -1,
            'разовое создание листа');
        assertTrue(GS_SRC.indexOf('function minesweeperArchiveStatus()') !== -1,
            'диагностика');
        assertTrue(GS_SRC.indexOf('SRV_VER') !== -1,
            'версия серверного кода (клиент отличает старый деплой)');
    });

    test('Code.gs: маршруты recordResult/getMyArchive + индекс модулей', () => {
        assertTrue(CODE_SRC.indexOf("case 'minesweeper.recordResult':") !== -1,
            'маршрут записи');
        assertTrue(CODE_SRC.indexOf('MinesweeperArchive.recordResult(payload)') !== -1,
            'вызов модуля');
        assertTrue(CODE_SRC.indexOf("case 'minesweeper.getMyArchive':") !== -1,
            'маршрут чтения');
        assertTrue(CODE_SRC.indexOf('MinesweeperArchive.getMyArchive(payload)') !== -1,
            'вызов модуля');
        assertTrue(CODE_SRC.indexOf('MinesweeperArchive (Task 546)') !== -1,
            'строка в шапке-индексе');
    });

    test('SW: версия бампнута (index.html менялся), следующей ещё нет', () => {
        assertTrue(!!SW_EXPECTED, 'версия SW выводится из префикса репо');
        assertTrue(SW_SRC.indexOf(SW_EXPECTED) !== -1,
            'sw.js содержит ' + SW_EXPECTED);
        assertTrue(SW_SRC.indexOf(SW_NEXT) === -1,
            'следующей версии ' + SW_NEXT + ' нет');
    });
});

// ============================================================
// 5. VM — чистые функции (extract-functions)
// ============================================================
describe('Task 546 — VM: msFlipDelay (волна переворотов)', () => {
    const fns = extractFunctions();

    test('эпицентр хода — переворот без задержки', () => {
        assertEqual(fns.msFlipDelay(4, 4, 4, 4), 0, 'клетка клика');
    });

    test('соседняя клетка — 35 мс', () => {
        assertEqual(fns.msFlipDelay(5, 4, 4, 4), 35, 'Chebyshev = 1');
        assertEqual(fns.msFlipDelay(4, 5, 4, 4), 35, 'по другой оси');
        assertEqual(fns.msFlipDelay(5, 5, 4, 4), 35, 'по диагонали');
    });

    test('дальние клетки — 35 мс за шаг', () => {
        assertEqual(fns.msFlipDelay(9, 4, 4, 4), 175, 'дистанция 5');
    });

    test('потолок 385 мс — большие поля не растягивают волну', () => {
        assertEqual(fns.msFlipDelay(30, 4, 4, 4), 385, 'дистанция 26 → потолок');
    });

    test('нет эпицентра — без задержки (защита от undefined)', () => {
        assertEqual(fns.msFlipDelay(9, 9, undefined, 4), 0, 'undefined origin');
        assertEqual(fns.msFlipDelay(9, 9, null, 4), 0, 'null origin');
    });
});

describe('Task 546 — VM: msSrvThrottled (троттлинг запроса истории)', () => {
    const fns = extractFunctions();

    test('никогда не спрашивали — пора', () => {
        assertEqual(fns.msSrvThrottled(undefined, 1000), true, 'нет метки');
        assertEqual(fns.msSrvThrottled(NaN, 1000), true, 'битая метка');
    });

    test('свежий запрос — не дёргаем сервер (60 с)', () => {
        assertEqual(fns.msSrvThrottled(950, 1000), false, '50 мс назад');
        assertEqual(fns.msSrvThrottled(1000 - 59999, 1000), false,
            '59,999 с назад — ещё рано');
    });

    test('метка старше 60 с — пора обновить', () => {
        assertEqual(fns.msSrvThrottled(400, 60500), true, '60,1 с назад');
    });
});

describe('Task 546 — VM: msRenderArchiveRow (строка архива партий)', () => {
    const fns = extractFunctions();

    test('ровно 5 слотов — заполненные + приглушённые пустые', () => {
        const html = fns.msRenderArchiveRow([
            { won: true, diff: 'easy', time: 24, ts: '2026-10-22T10:00:00' },
            { won: false, diff: 'hard', time: 130, ts: 1763000000000 }
        ]);
        assertEqual((html.match(/ms-ach-slot /g) || []).length, 5,
            '5 слотов всегда');
        assertEqual((html.match(/ms-ach-slot empty/g) || []).length, 3,
            '3 пустых');
    });

    test('слот победы: класс win, галочка, время с датой', () => {
        const html = fns.msRenderArchiveRow(
            [{ won: true, diff: 'easy', time: 24, ts: '2026-10-22T10:00:00' }]);
        assertTrue(html.indexOf('ms-ach-slot win') !== -1, 'класс win');
        assertTrue(html.indexOf('✓') !== -1, 'галочка');
        assertTrue(html.indexOf('24 с') !== -1, 'время');
        assertTrue(html.indexOf('22.10') !== -1, 'дата из ISO-строки');
    });

    test('слот поражения: класс loss, крестик', () => {
        const html = fns.msRenderArchiveRow(
            [{ won: false, diff: 'medium', time: 61, ts: 1763000000000 }]);
        assertTrue(html.indexOf('ms-ach-slot loss') !== -1, 'класс loss');
        assertTrue(html.indexOf('✗') !== -1, 'крестик');
    });

    test('битые записи не ломают строку (— вместо даты/времени)', () => {
        const html = fns.msRenderArchiveRow([{ won: true }]);
        assertTrue(html.indexOf('ms-ach-slot win') !== -1, 'слот есть');
        assertTrue(html.indexOf('>—<') !== -1 || html.indexOf('—') !== -1,
            'заглушки на месте');
    });

    test('пустой ввод — 5 пустых слотов', () => {
        assertEqual((fns.msRenderArchiveRow([]).match(/ms-ach-slot empty/g) || []).length,
            5, 'все слоты пустые');
        assertEqual((fns.msRenderArchiveRow(null).match(/ms-ach-slot empty/g) || []).length,
            5, 'null — тоже 5 пустых');
    });
});

// ============================================================
// 6. GAS-моки — серверные методы (как test-task537.js)
// ============================================================

class MockSheet546 {
    constructor(name, rows) {
        this._name = name;
        this.rows = rows || [];
        this.formats = {};
        this.merges = [];
        this.widths = {};
        this.frozenRows = 0;
    }
    getName() { return this._name; }
    getLastRow() { return this.rows.length; }
    getMaxRows() { return Math.max(this.rows.length, 200); }
    appendRow(row) { this.rows.push(row.slice()); return this; }
    setFrozenRows(n) { this.frozenRows = n; return this; }
    setColumnWidth(c, px) { this.widths[c] = px; return this; }
    getRange(row, col, numRows, numCols) {
        numRows = numRows || 1; numCols = numCols || 1;
        const self = this;
        return {
            getValues() {
                const out = [];
                for (let r = row; r < row + numRows; r++) {
                    const line = [];
                    for (let c = col; c < col + numCols; c++) {
                        const rr = self.rows[r - 1];
                        line.push(rr ? (rr[c - 1] === undefined ? '' : rr[c - 1]) : '');
                    }
                    out.push(line);
                }
                return out;
            },
            setValue(v) {
                while (self.rows.length < row) self.rows.push([]);
                if (!self.rows[row - 1]) self.rows[row - 1] = [];
                self.rows[row - 1][col - 1] = v;
                return this;
            },
            setValues(vals) {
                for (let i = 0; i < vals.length; i++) {
                    const r = row + i;
                    while (self.rows.length < r) self.rows.push([]);
                    for (let c = 0; c < vals[i].length; c++) {
                        self.rows[r - 1][col - 1 + c] = vals[i][c];
                    }
                }
                return this;
            },
            setNumberFormat(f) { self.formats[row + ',' + col] = f; return this; },
            setBackground() { return this; },
            setFontColor() { return this; },
            setFontWeight() { return this; },
            setFontStyle() { return this; },
            merge() { self.merges.push(row + ':' + col); return this; }
        };
    }
}

class MockSS546 {
    constructor(name, id) {
        this._name = name;
        this._id = id;
        this.sheets = [];
    }
    getName() { return this._name; }
    getId() { return this._id; }
    getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this._id + '/edit'; }
    getSheets() { return this.sheets.slice(); }
    getSheetByName(n) {
        for (const s of this.sheets) if (s.getName() === n) return s;
        return null;
    }
    insertSheet(name) {
        const s = new MockSheet546(name, []);
        this.sheets.push(s);
        return s;
    }
}

function makeEnv546(opts) {
    opts = opts || {};
    const state = {
        props: {},
        audit: [],
        gateCalls: [],
        now: new Date('2026-10-22T10:00:00')
    };
    const kip8Access = new MockSS546('KIP8_Access',
        '1TmmNZLUArWH38F6NX0gMGar8LMNMQomm_FaGZv9osyk');
    const files = {};
    files[kip8Access.getId()] = kip8Access;
    const SpreadsheetApp = {
        openById: (id) => files[id] || null
    };
    const PropertiesService = {
        getScriptProperties: () => ({
            getProperty: (k) => (k in state.props ? state.props[k] : null),
            setProperty: (k, v) => { state.props[k] = String(v); }
        })
    };
    const LockService = {
        getScriptLock: () => ({ waitLock() {}, releaseLock() {} })
    };
    const Session = { getScriptTimeZone: () => 'Asia/Novosibirsk' };
    const Utilities = {
        formatDate: () => { state.now = new Date(state.now.getTime() + 1000); return isoOf(state.now); }
    };
    const Utils = {
        audit: (email, action, ip, ua, details) => {
            state.audit.push({ email, action, details });
        },
        getRows: () => (opts.users || [
            { email: 'user@example.com', name: 'Иванов Иван' },
            { email: 'other@example.com', name: 'Петров Пётр' }
        ])
    };
    const rmRequirePerm = function (token, permId, context) {
        state.gateCalls.push({ token, permId, context });
        if (!token || token === 'bad') return { ok: false, error: 'no_session' };
        if (token === 'noperm') return { ok: false, error: 'access_denied' };
        // разные пользователи по токену (для проверки изоляции email)
        const email = opts.user ||
            (token === 'tok2' ? 'other@example.com' : 'user@example.com');
        return { ok: true, user: { email: email, role: 'kip8' } };
    };
    return {
        state, kip8Access, SpreadsheetApp, PropertiesService,
        LockService, Session, Utilities, Utils, rmRequirePerm
    };
}

function isoOf(d) {
    const p = n => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

// Загрузка MinesweeperArchive.gs в контролируемую среду
function loadMA(env, withoutGate) {
    const gateArg = withoutGate ? undefined : env.rmRequirePerm;
    const factory = new Function(
        'SpreadsheetApp', 'PropertiesService', 'LockService',
        'Session', 'Utilities', 'Utils', 'Logger', 'rmRequirePerm',
        GS_SRC + '\nreturn { MA: MinesweeperArchive, init: minesweeperArchiveInit, status: minesweeperArchiveStatus };');
    return factory(env.SpreadsheetApp, env.PropertiesService,
                   env.LockService, env.Session, env.Utilities,
                   env.Utils, { log: function () {} }, gateArg);
}

const WIN_GAME = { token: 'tok', won: true, time: 24, diff: 'easy',
                   cols: 9, rows: 9, mines: 10 };
const LOSS_GAME = { token: 'tok', won: false, time: 130, diff: 'hard',
                    cols: 9, rows: 28, mines: 45 };

describe('Task 546 — GAS: minesweeper.recordResult', () => {

    test('победа: строка листа + аудит + ответ {id, saved}', () => {
        const env = makeEnv546();
        const { MA } = loadMA(env);
        const res = MA.recordResult(WIN_GAME);
        assertEqual(JSON.stringify(res), JSON.stringify({ ok: true, data: { id: 1, saved: true } }),
            'ответ');
        const sheet = env.kip8Access.getSheetByName('Сапёр');
        assertTrue(!!sheet, 'лист «Сапёр» создан лениво (без init)');
        assertEqual(sheet.rows.length, 4, 'титул + описание + заголовки + 1 запись');
        const row = sheet.rows[3];
        assertEqual(row[0], 1, 'id');
        assertTrue(/^2026-10-22T\d\d:\d\d:\d\d$/.test(row[1]), 'дата ISO');
        assertEqual(row[2], 'user@example.com', 'email из сессии');
        assertEqual(row[3], 'Иванов Иван', 'имя — снимок из users');
        assertEqual(row[4], 'победа', 'результат');
        assertEqual(row[5], 'easy', 'сложность');
        assertEqual(row[6], '9x9', 'поле');
        assertEqual(row[7], 24, 'время');
        assertEqual(row[8], 10, 'мины');
        assertEqual(env.state.audit.length, 2, 'аудит: создание листа + запись');
        assertEqual(env.state.audit[1].action, 'MINE_RECORD_WIN', 'код аудита победы');
    });

    test('поражение: результат/аудит иные, поле — фактической ориентации', () => {
        const env = makeEnv546();
        const { MA } = loadMA(env);
        const res = MA.recordResult(LOSS_GAME);
        assertEqual(res.ok, true, 'записано');
        const row = env.kip8Access.getSheetByName('Сапёр').rows[3];
        assertEqual(row[4], 'поражение', 'результат');
        assertEqual(row[6], '9x28', 'поле как передал клиент');
        assertEqual(env.state.audit[env.state.audit.length - 1].action,
            'MINE_RECORD_LOSS', 'код аудита поражения');
    });

    test('автоинкремент id под блокировкой', () => {
        const env = makeEnv546();
        const { MA } = loadMA(env);
        MA.recordResult(WIN_GAME);
        const res2 = MA.recordResult(WIN_GAME);
        assertEqual(res2.data.id, 2, 'id 2');
        const rows = env.kip8Access.getSheetByName('Сапёр').rows;
        assertEqual(rows[4][0], 2, 'строка 2');
        assertEqual(rows[3][0], 1, 'строка 1 не тронута');
    });

    test('имени в users нет → пусто (клиент покажет email)', () => {
        const env = makeEnv546({ users: [{ email: 'user@example.com', name: '' }] });
        const { MA } = loadMA(env);
        MA.recordResult(WIN_GAME);
        assertEqual(env.kip8Access.getSheetByName('Сапёр').rows[3][3], '',
            'имя пустое');
    });

    test('имя с «=» экранировано апострофом (защита от формул)', () => {
        const env = makeEnv546({ users: [{ email: 'user@example.com', name: '=Иванов' }] });
        const { MA } = loadMA(env);
        MA.recordResult(WIN_GAME);
        assertEqual(env.kip8Access.getSheetByName('Сапёр').rows[3][3], "'=Иванов",
            'ведущий апостроф');
    });

    test('невалидные партии ОТКЛОНЯЮТСЯ — строк нет', () => {
        const cases = [
            [{ token: 'tok', time: 24, diff: 'easy', cols: 9, rows: 9, mines: 10 }, 'invalid_result', 'won нет'],
            [{ token: 'tok', won: 'maybe', time: 24, diff: 'easy', cols: 9, rows: 9, mines: 10 }, 'invalid_result', 'won не bool'],
            [{ token: 'tok', won: true, time: -1, diff: 'easy', cols: 9, rows: 9, mines: 10 }, 'invalid_time', 'отрицательное время'],
            [{ token: 'tok', won: true, time: 36001, diff: 'easy', cols: 9, rows: 9, mines: 10 }, 'invalid_time', 'дольше 10 часов'],
            [{ token: 'tok', won: true, time: 'abc', diff: 'easy', cols: 9, rows: 9, mines: 10 }, 'invalid_time', 'время не число'],
            [{ token: 'tok', won: true, time: 24, diff: 'extreme', cols: 9, rows: 9, mines: 10 }, 'invalid_diff', 'неизвестная сложность'],
            [{ token: 'tok', won: true, time: 24, diff: 'easy', cols: 3, rows: 9, mines: 10 }, 'invalid_field', 'поле меньше 4'],
            [{ token: 'tok', won: true, time: 24, diff: 'easy', cols: 9, rows: 61, mines: 10 }, 'invalid_field', 'поле больше 60'],
            [{ token: 'tok', won: true, time: 24, diff: 'easy', cols: 9, rows: 9, mines: 81 }, 'invalid_mines', 'мин больше клеток'],
            [{ token: 'tok', won: true, time: 24, diff: 'easy', cols: 9, rows: 9, mines: 0 }, 'invalid_mines', 'мин меньше 1']
        ];
        cases.forEach(function (c) {
            const env = makeEnv546();
            const { MA } = loadMA(env);
            const res = MA.recordResult(c[0]);
            assertEqual(res.ok, false, c[2] + ': отклонено');
            assertEqual(res.error, c[1], c[2] + ': код ' + c[1]);
            assertTrue(!!res.message, c[2] + ': сообщение человеку');
            // данных не записано: либо листа нет вовсе (валидация до
            // открытия таблицы), либо шапка без строк
            const sheet = env.kip8Access.getSheetByName('Сапёр');
            assertEqual(sheet ? Math.max(sheet.rows.length - 3, 0) : 0, 0,
                c[2] + ': данных не записано');
        });
    });

    test('гейт: нет токена → no_session; без права → access_denied', () => {
        const env = makeEnv546();
        const { MA } = loadMA(env);
        assertEqual(MA.recordResult({ token: 'bad', won: true, time: 1, diff: 'easy', cols: 9, rows: 9, mines: 10 }).error,
            'no_session', 'нет сессии');
        assertEqual(MA.recordResult({ token: 'noperm', won: true, time: 1, diff: 'easy', cols: 9, rows: 9, mines: 10 }).error,
            'access_denied', 'нет права secret.view');
        // таблицу даже не трогали
        assertEqual(env.kip8Access.sheets.length, 0, 'лист не создавался');
    });

    test('fail-closed: RoleMatrixGate.gs не задеплоен → отказ всем', () => {
        const env = makeEnv546();
        const { MA } = loadMA(env, true);   // rmRequirePerm === undefined
        const res = MA.recordResult(WIN_GAME);
        assertEqual(res.ok, false, 'отказ');
        assertEqual(res.error, 'access_denied', 'код');
        assertEqual(env.kip8Access.sheets.length, 0, 'лист не создавался');
    });

    test('гейт проверяет право secret.view в контексте MinesweeperArchive', () => {
        const env = makeEnv546();
        const { MA } = loadMA(env);
        MA.getMyArchive({ token: 'tok' });
        assertEqual(env.state.gateCalls.length, 1, 'один вызов гейта');
        assertEqual(env.state.gateCalls[0].permId, 'secret.view', 'право');
        assertEqual(env.state.gateCalls[0].context, 'MinesweeperArchive', 'контекст');
    });
});

describe('Task 546 — GAS: minesweeper.getMyArchive', () => {

    function seedTwoUsers(env, MA) {
        // user@example.com: победа easy 24 c, поражение hard 130 c
        MA.recordResult({ token: 'tok', won: true, time: 24, diff: 'easy', cols: 9, rows: 9, mines: 10 });
        MA.recordResult({ token: 'tok', won: false, time: 130, diff: 'hard', cols: 9, rows: 28, mines: 45 });
        // other@example.com: 2 партии (не должны вернуться)
        MA.recordResult({ token: 'tok2', won: true, time: 99, diff: 'medium', cols: 9, rows: 16, mines: 25 });
        MA.recordResult({ token: 'tok2', won: false, time: 55, diff: 'easy', cols: 9, rows: 9, mines: 10 });
        return env;
    }

    test('свои партии: НОВЫЕ ПЕРВЫМИ, чужих нет', () => {
        const env = makeEnv546();
        const { MA } = loadMA(env);
        seedTwoUsers(env, MA);
        const res = MA.getMyArchive({ token: 'tok' });
        assertEqual(res.ok, true, 'успех');
        assertEqual(res.data.rows.length, 2, 'ровно свои 2 партии');
        // последняя своя партия — поражение hard 130 c → первой
        assertEqual(res.data.rows[0].time, 130, 'новые первыми');
        assertEqual(res.data.rows[0].won, false, 'последняя — поражение');
        assertEqual(res.data.rows[1].time, 24, 'затем первая');
        assertEqual(res.data.srvVer, '546', 'версия сервера');
    });

    test('stats: total/wins/losses + best по сложностям (только победы)', () => {
        const env = makeEnv546();
        const { MA } = loadMA(env);
        seedTwoUsers(env, MA);
        // ещё победа easy медленнее — best не меняется
        MA.recordResult({ token: 'tok', won: true, time: 60, diff: 'easy', cols: 9, rows: 9, mines: 10 });
        const res = MA.getMyArchive({ token: 'tok' });
        assertEqual(res.data.stats.total, 3, 'всего');
        assertEqual(res.data.stats.wins, 2, 'побед');
        assertEqual(res.data.stats.losses, 1, 'поражений');
        assertEqual(res.data.stats.best.easy, 24, 'рекорд easy — минимум побед');
        assertEqual(res.data.stats.best.hard, undefined, 'hard без побед — без рекорда');
    });

    test('пустой архив: total 0, rows []', () => {
        const env = makeEnv546();
        const { MA } = loadMA(env);
        const res = MA.getMyArchive({ token: 'tok' });
        assertEqual(res.data.rows.length, 0, 'пусто');
        assertEqual(res.data.stats.total, 0, 'total 0');
    });

    test('битые строки (ручные правки) не ломают чтение', () => {
        const env = makeEnv546();
        const { MA } = loadMA(env);
        MA.recordResult(WIN_GAME);
        const sheet = env.kip8Access.getSheetByName('Сапёр');
        sheet.rows.push(['мусор', '', '', '', '', '', '', '', '']);   // без email
        const res = MA.getMyArchive({ token: 'tok' });
        assertEqual(res.data.rows.length, 1, 'битая строка пропущена');
    });

    test('гейт чтения: без сессии/права — отказ, чужие данные не светятся', () => {
        const env = makeEnv546();
        const { MA } = loadMA(env);
        assertEqual(MA.getMyArchive({ token: 'bad' }).error, 'no_session', 'нет сессии');
        assertEqual(MA.getMyArchive({ token: 'noperm' }).error, 'access_denied', 'нет права');
    });
});

describe('Task 546 — GAS: init/status/структура листа', () => {

    test('minesweeperArchiveInit: создаёт лист, идемпотентен', () => {
        const env = makeEnv546();
        const { MA, init } = loadMA(env);
        const out = init();
        assertEqual(out.ok, true, 'успех');
        assertEqual(out.sheet, 'Сапёр', 'лист');
        assertEqual(out.rows, 0, 'строк данных нет');
        const again = init();
        assertEqual(again.ok, true, 'повтор — успех');
        const sheets = env.kip8Access.sheets.filter(s => s.getName() === 'Сапёр');
        assertEqual(sheets.length, 1, 'дубликата листа нет');
    });

    test('структура: строки 1–2 титул/описание, 3 — заголовки, freeze 3', () => {
        const env = makeEnv546();
        const { MA } = loadMA(env);
        const sheet = env.kip8Access.getSheetByName('Сапёр') ||
                      (MA._getSS(), env.kip8Access.getSheetByName('Сапёр'));
        assertEqual(sheet.rows[0][0],
            'САПЁР — архив счёта пользователей (по email)', 'титул');
        assertTrue(String(sheet.rows[1][0]).indexOf('email') !== -1,
            'описание упоминает email-привязку');
        assertEqual(sheet.rows[2].join('|'),
            'id|дата|email|имя|результат|сложность|поле|время_сек|мины',
            'заголовки');
        assertEqual(sheet.frozenRows, 3, 'закреплены 3 строки');
        assertEqual(sheet.merges.length, 2, 'строки 1–2 объединены');
        // '@' на текстовых колонках (Task 304)
        assertTrue(sheet.formats['4,2'] === '@', 'дата — текст');
        assertTrue(sheet.formats['4,3'] === '@', 'email — текст');
        // ширины заданы (читаемость)
        assertEqual(Object.keys(sheet.widths).length, 9, 'ширины всех колонок');
    });

    test('minesweeperArchiveStatus: диагностика листа', () => {
        const env = makeEnv546();
        const { MA, init, status } = loadMA(env);
        init();
        const out = status();
        assertEqual(out.spreadsheet, true, 'таблица есть');
        assertEqual(out.sheet, true, 'лист есть');
        assertEqual(out.headersOk, true, 'шапка совпадает');
        assertEqual(out.rows, 0, 'данных нет');
    });

    test('статус без листа — подсказка запустить init', () => {
        const env = makeEnv546();
        const { status } = loadMA(env);
        const out = status();
        assertEqual(out.sheet, false, 'листа нет');
        assertEqual(out.spreadsheet, true, 'таблица открылась');
    });
});
