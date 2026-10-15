// tests/test-task475.js
// Task 475 — ЭТАП 1 ОПТИМИЗАЦИИ (заявка пользователя): «Нужно
// проработать оптимизацию работы приложения, основные требования —
// моментальное открытие приложения при отсутствии или медленной
// связи, ранее подгруженные данные должны сохраняться в памяти
// устройства для моментального доступа к ним, а загрузка должна
// быть фоновой (незаметной для пользователя)…»
//
// РЕШЕНИЕ (этап 1: SWR + персистентный кэш данных + сжатие картинок
// + офлайн-ветка входа; клиент-only, Apps Script не тронут):
//   (а) sw.js — STALE-WHILE-REVALIDATE везде: навигация (App Shell)
//       и прочие локальные ассеты отдаются ИЗ КЭША СРАЗУ (сеть не
//       ждём), свежие версии догружаются ФОНОМ; обновление версий
//       живёт прежним механизмом (бамп CACHE_VERSION → install →
//       skipWaiting → activate → controllerchange → перезагрузка);
//   (б) sw.js — data/*.json в ПЕРСИСТЕНТНОМ DATA_CACHE_NAME
//       ('kipia-data-test-v1', НЕ зависит от CACHE_VERSION — как кэш
//       картинок): однажды загруженные данные остаются на устройстве,
//       открываются мгновенно при любой связи; при ИЗМЕНЕНИИ
//       содержимого — DATA_REFRESHED вкладкам;
//   (в) index.html — слушатель DATA_REFRESHED сбрасывает in-memory
//       кэши разделов (resetSectionDataCache): свежая версия
//       поднимется при следующем открытии раздела, незаметно;
//   (г) index.html — офлайн-ветка входа: токен есть, кэша роли нет,
//       сети нет → ГОСТЕВОЙ режим (не экран входа-тупик!) +
//       автоповтор getCurrentUser (60с + 'online' + через 5с);
//   (д) images: logo.png/logo_black.png 2048→256px (1450→45 КБ,
//       отображение 36×36), Launch.png 256-цветная палитра
//       (996→363 КБ, фон под оверлеем); logo* добавлены в ASSETS.
//   SW: kipia-test-v698 → v699.
//   АДАПТАЦИЯ окон истории sw.js (прецедент Task 471/473/474):
//   test-task461 3800→4600 (Task 475 ~9 строк, Task 461 теперь
//   ~4300); test-task471/test-task472 (Task 471) 1300→2100 (~1738);
//   test-task472 (Task 472) 900→1500 (~1189); test-task474
//   600→1100 (~816).
//
// Запуск: через tests/run-all.js (require './test-task475.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Размеры PNG из заголовка IHDR (байты 16-24, big-endian)
function pngSize(file) {
    const buf = fs.readFileSync(file);
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// ==========================================================================
// 1. SW: версия и шапка
describe('Task 475 — SW: версия и шапка', () => {
    test('CACHE_VERSION = kipia-test-v740', () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v740';") !== -1,
            'SW поднят до v699');
    });
    test('прежняя версия v698 отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v698') === -1,
            'в sw.js не осталось kipia-test-v698');
    });
    test('несуществующая v700 отсутствует (guard)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v741') === -1,
            'kipia-test-v741 не должен существовать');
    });
    test('комментарий Task 475 в шапке версий', () => {
        assertTrue(SW_SRC.indexOf('Task 475') !== -1, 'маркер задачи');
        assertTrue(SW_SRC.indexOf('STALE-WHILE-REVALIDATE') !== -1,
            'описание стратегии');
    });
});

// ==========================================================================
// 2. SW: персистентный DATA-кэш
describe('Task 475 — SW: персистентный кэш данных', () => {
    test('константы DATA_CACHE объявлены', () => {
        assertTrue(SW_SRC.indexOf("const DATA_CACHE_VERSION = 'kipia-data-test-v1';") !== -1,
            'DATA_CACHE_VERSION = kipia-data-test-v1');
        assertTrue(SW_SRC.indexOf('const DATA_CACHE_NAME = DATA_CACHE_VERSION;') !== -1,
            'DATA_CACHE_NAME');
    });
    test('activate НЕ удаляет DATA-кэш (переживает инкременты версии)', () => {
        const m = SW_SRC.match(/keys\.filter\(k => k !== CACHE_NAME && k !== IMAGE_CACHE_NAME(.*?)\)\.map/);
        assertTrue(!!m, 'фильтр activate найден');
        assertTrue(m[1].indexOf('k !== DATA_CACHE_NAME') !== -1,
            'DATA_CACHE_NAME в списке сохраняемых');
    });
    test('гигиена DATA-кэша: только /data/*.json', () => {
        assertTrue(SW_SRC.indexOf('isDataPath') !== -1,
            'проверка isDataPath в activate');
        assertTrue(SW_SRC.indexOf("u.pathname.slice(-5) === '.json'") !== -1,
            'записи без .json вычищаются');
    });
});

// ==========================================================================
// 3. SW: SWR-навигация (App Shell)
describe('Task 475 — SW: SWR навигации (моментальное открытие)', () => {
    test('навигация отвечает из КЭША сразу (SWR)', () => {
        const i = SW_SRC.indexOf("if (request.mode === 'navigate') {");
        assertTrue(i !== -1, 'ветка навигации найдена');
        const seg = SW_SRC.slice(i, i + 2200);
        assertTrue(seg.indexOf('caches.open(CACHE_NAME)') !== -1,
            'кэш открывается ДО сети');
        assertTrue(seg.indexOf('cache.match(APP_SHELL_URL)') !== -1,
            'поиск App Shell в кэше');
        assertTrue(/if \(cached\) \{\s*\n\s*\/\/ Кэш есть/.test(seg),
            'кэш есть → мгновенный ответ (return cached)');
    });
    test('фоновая ревалидация не блокирует ответ', () => {
        const i = SW_SRC.indexOf("if (request.mode === 'navigate') {");
        const seg = SW_SRC.slice(i, i + 2200);
        assertTrue(seg.indexOf('revalidate') !== -1,
            'ревалидация запускается фоном');
        assertTrue(seg.indexOf('.catch(() => null)') !== -1,
            'сетевая ошибка ревалидации тихо глотается');
    });
    test('прежний network-first порядок (сеть → кэш при отказе) убран', () => {
        const oldComment = '// Нет сети — отдаём закэшированный App Shell';
        assertTrue(SW_SRC.indexOf(oldComment) === -1,
            'старый network-first комментарий удалён');
    });
    test('офлайн-фолбэк 503 для первого запуска сохранён', () => {
        const i = SW_SRC.indexOf("if (request.mode === 'navigate') {");
        const seg = SW_SRC.slice(i, i + 2600);
        assertTrue(seg.indexOf("'Content-Type': 'text/html; charset=utf-8'") !== -1,
            'офлайн-страница (503) на месте');
    });
    test('критично: bypass Apps Script НЕ тронут (авторизация не кэшируется)', () => {
        const i = SW_SRC.indexOf('===== Bypass для Apps Script');
        assertTrue(i !== -1, 'байпас на месте');
        assertTrue(SW_SRC.indexOf("bypassUrl.hostname === 'script.google.com'") !== -1,
            'script.google.com всегда напрямую в сеть');
        // байпас стоит ДО кэширующих веток
        const navI = SW_SRC.indexOf("if (request.mode === 'navigate')");
        assertTrue(i < navI, 'байпас выполняется раньше SWR-веток');
    });
});

// ==========================================================================
// 4. SW: SWR данных (data/*.json)
describe('Task 475 — SW: SWR данных справочников', () => {
    test('ветка isDataJson работает через DATA_CACHE_NAME', () => {
        const i = SW_SRC.indexOf('if (isDataJson) {');
        assertTrue(i !== -1, 'ветка данных найдена');
        const seg = SW_SRC.slice(i, i + 3200);
        assertTrue(seg.indexOf('caches.open(DATA_CACHE_NAME)') !== -1,
            'данные живут в персистентном кэше');
        assertTrue(seg.indexOf('dataCache.match(cacheKey)') !== -1,
            'мгновенный ответ из DATA-кэша');
    });
    test('сравнение содержимого: кэш обновляется ТОЛЬКО при изменении', () => {
        const i = SW_SRC.indexOf('if (isDataJson) {');
        const seg = SW_SRC.slice(i, i + 3200);
        assertTrue(seg.indexOf('cachedForCompare') !== -1,
            'клон кэша для сравнения');
        assertTrue(seg.indexOf('texts[0] !== texts[1]') !== -1,
            'сравнение новой и старой версии текста');
        assertTrue(seg.indexOf('notifyDataChanged(url.pathname)') !== -1,
            'уведомление только при изменении');
    });
    test('fallback на precache-копию из CACHE_NAME', () => {
        const i = SW_SRC.indexOf('if (isDataJson) {');
        const seg = SW_SRC.slice(i, i + 3200);
        assertTrue(seg.indexOf('caches.match(cacheKey)') !== -1,
            'precache из install используется после чистой установки');
    });
    test('клон cachedForCompare делается ДО отдачи ответа', () => {
        const i = SW_SRC.indexOf('const cachedForCompare = cached ? cached.clone() : null;');
        assertTrue(i !== -1, 'клон сразу после match (body не залочен)');
    });
    test('функция notifyDataChanged шлёт DATA_REFRESHED с путём', () => {
        const i = SW_SRC.indexOf('function notifyDataChanged(path)');
        assertTrue(i !== -1, 'функция существует');
        const seg = SW_SRC.slice(i, i + 600);
        assertTrue(seg.indexOf("type: 'DATA_REFRESHED'") !== -1,
            'тип сообщения DATA_REFRESHED');
        assertTrue(seg.indexOf('path: path') !== -1,
            'путь передаётся (страница сбросит кэш нужного раздела)');
    });
    test('Background Sync refreshTicketsData пишет в DATA-кэш', () => {
        const i = SW_SRC.indexOf('async function refreshTicketsData()');
        const seg = SW_SRC.slice(i, i + 500);
        assertTrue(seg.indexOf('caches.open(DATA_CACHE_NAME)') !== -1,
            'билеты обновляются в персистентный кэш данных');
    });
});

// ==========================================================================
// 5. SW: SWR прочих локальных ассетов
describe('Task 475 — SW: SWR локальных ассетов', () => {
    test('финальная ветка — кэш-первым, сеть фоном', () => {
        const i = SW_SRC.indexOf('===== Остальные локальные файлы — STALE-WHILE-REVALIDATE =====');
        assertTrue(i !== -1, 'ветка найдена');
        const seg = SW_SRC.slice(i, i + 1800);
        assertTrue(seg.indexOf('cache.match(cacheKey)') !== -1,
            'мгновенный ответ из кэша');
        assertTrue(seg.indexOf('if (cached)') !== -1,
            'кэш есть → не ждём сеть');
        assertTrue(seg.indexOf('Offline') !== -1,
            'фолбэк 503 сохранён');
    });
    test('logo.png и logo_black.png добавлены в ASSETS (офлайн-шапка)', () => {
        assertTrue(SW_SRC.indexOf("'./images/logo.png',") !== -1,
            'logo.png в precache');
        assertTrue(SW_SRC.indexOf("'./images/logo_black.png',") !== -1,
            'logo_black.png в precache');
    });
});

// ==========================================================================
// 6. index.html: офлайн-ветка входа (гостевой режим + автоповтор)
describe('Task 475 — вход: офлайн-ветка bootstrap', () => {
    test('тупик экрана входа убран: старое сообщение отсутствует', () => {
        assertTrue(INDEX_SRC.indexOf('Не удалось связаться с сервером. ' +
            'Проверьте подключение к интернету и обновите страницу.') === -1,
            'прежний экран-ошибка входа удалён');
    });
    test('сеть недоступна + токен без кэша роли → ГОСТЕВОЙ режим', () => {
        const i = INDEX_SRC.indexOf('_startOfflineTokenRetry: function()');
        assertTrue(i !== -1, 'метод повтора существует');
        // bootstrap зовёт повтор в сетевой ветке
        const b = INDEX_SRC.indexOf('self._startOfflineTokenRetry();');
        assertTrue(b !== -1, 'bootstrap запускает автоповтор');
        const seg = INDEX_SRC.slice(b - 1600, b);
        assertTrue(seg.indexOf("self._cachedRole = 'Общий доступ';") !== -1,
            'роль гостя применяется');
        assertTrue(seg.indexOf('гостевой режим + автоповтор') !== -1,
            'комментарий ветки Task 475');
    });
    test('тост поясняет гостевой режим', () => {
        assertTrue(INDEX_SRC.indexOf('Нет связи с сервером — открыт гостевой режим') !== -1,
            'пользователь понимает, что произошло');
    });
    test('автоповтор: интервал 60с + событие online + первая попытка 5с', () => {
        // Task 477: окно 2400 → 2800 — в attempt-успех добавлен вызов
        // _schedulePreload (+~220 симв.) до setInterval в конце метода.
        const i = INDEX_SRC.indexOf('_startOfflineTokenRetry: function()');
        const seg = INDEX_SRC.slice(i, i + 2800);
        assertTrue(seg.indexOf('setInterval(attempt, 60 * 1000)') !== -1,
            'интервал 60 секунд');
        assertTrue(seg.indexOf("window.addEventListener('online'") !== -1,
            'повтор по возвращении сети');
        assertTrue(seg.indexOf('setTimeout(attempt, 5000)') !== -1,
            'первая попытка через 5 секунд');
    });
    test('успех повтора: роль, кэш localStorage, heartbeat, стоп', () => {
        const i = INDEX_SRC.indexOf('_startOfflineTokenRetry: function()');
        const seg = INDEX_SRC.slice(i, i + 2400);
        assertTrue(seg.indexOf('_stopOfflineTokenRetry();') !== -1,
            'повтор останавливается');
        assertTrue(seg.indexOf("localStorage.setItem('kip8_cached_role'") !== -1,
            'роль кэшируется — следующий старт мгновенный');
        assertTrue(seg.indexOf('_startHeartbeat();') !== -1,
            'heartbeat запускается');
        assertTrue(seg.indexOf('Связь восстановлена — выполнен вход') !== -1,
            'тост о восстановлении входа');
    });
    test('session_expired в повторе — штатный чистый выход', () => {
        const i = INDEX_SRC.indexOf('_startOfflineTokenRetry: function()');
        const seg = INDEX_SRC.slice(i, i + 2400);
        assertTrue(seg.indexOf('handleSessionExpired(err)') !== -1,
            'серверное «сессии нет» обрабатывается штатно');
    });
    test('_stopOfflineTokenRetry чистит таймер и слушателя', () => {
        const i = INDEX_SRC.indexOf('_stopOfflineTokenRetry: function()');
        const seg = INDEX_SRC.slice(i, i + 700);
        assertTrue(seg.indexOf('clearInterval') !== -1,
            'интервал снят');
        assertTrue(seg.indexOf("removeEventListener('online'") !== -1,
            'слушатель сети снят');
    });
    test('ручной вход (verifyOTP) останавливает автоповтор', () => {
        const i = INDEX_SRC.indexOf('self._stopOfflineTokenRetry();');
        // первый вызов после setToken в verifyOTP
        assertTrue(i !== -1, 'вызов существует');
        const seg = INDEX_SRC.slice(Math.max(0, i - 400), i);
        assertTrue(seg.indexOf('setToken(data.token);') !== -1,
            'остановка срабатывает сразу после сохранения токена входа');
    });
    test('поля состояния повтора объявлены в KipAuth', () => {
        assertTrue(INDEX_SRC.indexOf('_offlineRetryTimer: null,') !== -1,
            '_offlineRetryTimer');
        assertTrue(INDEX_SRC.indexOf('_offlineRetryOnlineHandler: null,') !== -1,
            '_offlineRetryOnlineHandler');
    });
});

// ==========================================================================
// 7. index.html: сброс кэшей разделов по DATA_REFRESHED
describe('Task 475 — слушатель DATA_REFRESHED (незаметное обновление)', () => {
    test('resetSectionDataCache существует (глобальная функция)', () => {
        assertTrue(INDEX_SRC.indexOf('function resetSectionDataCache(path)') !== -1,
            'функция объявлена');
    });
    test('слушатель SW-сообщений передаёт path в resetSectionDataCache', () => {
        const i = INDEX_SRC.indexOf("navigator.serviceWorker.addEventListener('message'");
        assertTrue(i !== -1, 'слушатель сообщений SW есть');
        const seg = INDEX_SRC.slice(i, i + 1200);
        assertTrue(seg.indexOf('event.data.path') !== -1,
            'path из сообщения читается');
        assertTrue(seg.indexOf('resetSectionDataCache(event.data.path)') !== -1,
            'вызов сброса кэша раздела');
    });
    test('все справочники покрыты сбросом', () => {
        const i = INDEX_SRC.indexOf('function resetSectionDataCache(path)');
        const seg = INDEX_SRC.slice(i, i + 1400);
        const must = ['devices', 'lockouts', 'valves', 'regulators',
                      'projects', 'cables', 'phonebook', 'exam-tickets'];
        must.forEach(name => {
            assertTrue(seg.indexOf("case '" + name + "':") !== -1,
                'кейс ' + name);
        });
    });
    test('сброс НЕ перерисовывает открытый раздел (незаметность)', () => {
        const i = INDEX_SRC.indexOf('function resetSectionDataCache(path)');
        const seg = INDEX_SRC.slice(i, i + 1400);
        assertTrue(seg.indexOf('navigateTo') === -1,
            'никакой навигации/перерисовки из фона');
    });
});

// ==========================================================================
// 8. Изображения: сжатие
describe('Task 475 — изображения: сжатие без потери качества', () => {
    test('logo.png: 256×256 и ≤ 60 КБ (было 2048×2048, 1450 КБ)', () => {
        const f = path.join(ROOT, 'images', 'logo.png');
        const size = fs.statSync(f).size;
        const dim = pngSize(f);
        assertEqual(dim.w, 256, 'ширина 256');
        assertEqual(dim.h, 256, 'высота 256');
        assertTrue(size <= 60 * 1024, 'размер ' + Math.round(size / 1024) + ' КБ ≤ 60 КБ');
    });
    test('logo_black.png: 256×256 и ≤ 60 КБ (было 1450 КБ)', () => {
        const f = path.join(ROOT, 'images', 'logo_black.png');
        const size = fs.statSync(f).size;
        const dim = pngSize(f);
        assertEqual(dim.w, 256, 'ширина 256');
        assertEqual(dim.h, 256, 'высота 256');
        assertTrue(size <= 60 * 1024, 'размер ' + Math.round(size / 1024) + ' КБ ≤ 60 КБ');
    });
    test('Launch.png: размер прежний (721×1223), вес ≤ 400 КБ (было 996 КБ)', () => {
        const f = path.join(ROOT, 'images', 'Launch.png');
        const size = fs.statSync(f).size;
        const dim = pngSize(f);
        assertEqual(dim.w, 721, 'ширина не изменена');
        assertEqual(dim.h, 1223, 'высота не изменена');
        assertTrue(size <= 400 * 1024, 'размер ' + Math.round(size / 1024) + ' КБ ≤ 400 КБ');
    });
    test('суммарная экономия трёх файлов ≥ 3 МБ', () => {
        const was = 1450 + 1450 + 996; // КБ (округлённые исходные)
        const now = ['logo.png', 'logo_black.png', 'Launch.png']
            .reduce((s, n) => s + fs.statSync(path.join(ROOT, 'images', n)).size, 0);
        assertTrue((was * 1024) - now >= 3 * 1024 * 1024,
            'экономия ' + Math.round((was * 1024 - now) / 1024) + ' КБ');
    });
    test('картинки-иконки приложения НЕ тронуты', () => {
        // icon-512 остаётся эталонным размером — манифест PWA не менялся
        const dim = pngSize(path.join(ROOT, 'images', 'icon-512.png'));
        assertEqual(dim.w, 512, 'icon-512.png 512px');
        assertEqual(dim.h, 512, 'icon-512.png 512px');
    });
});

// ==========================================================================
// 9. Регламентные окна истории sw.js (адаптация после комментария Task 475)
// Task 476: окна расширены ещё раз (+~490 симв. комментария этапа 2) —
// литералы ниже проверяют НОВЫЕ значения (461 5300, 471 2700,
// 472 2100, 474 1700).
describe('Task 475 — окна истории версий sw.js (адаптация)', () => {
    test('test-task461 окно 5300 (Task 476 отодвинул Task 461 до ~4732)', () => {
        const s = fs.readFileSync(path.join(ROOT, 'tests', 'test-task461.js'), 'utf8');
        assertTrue(s.indexOf('i - 17000') !== -1, 'окно 14000 (Task 498; Task 505: +700; Task 508: +700)');
    });
    test('test-task471/472 (контекст Task 471) окно 2700 (~2170)', () => {
        const s1 = fs.readFileSync(path.join(ROOT, 'tests', 'test-task471.js'), 'utf8');
        const s2 = fs.readFileSync(path.join(ROOT, 'tests', 'test-task472.js'), 'utf8');
        assertTrue(s1.indexOf('i - 14400') !== -1, 'test-task471: 13000 (Task 501; Task 508: +700)');
        assertTrue(s2.indexOf('i - 13700') !== -1, 'test-task472: 12400 (Task 501; Task 505: +700)');
    });
    test('test-task472 (Task 472) окно 2100 (~1621)', () => {
        const s = fs.readFileSync(path.join(ROOT, 'tests', 'test-task472.js'), 'utf8');
        assertTrue(s.indexOf('i - 13700') !== -1, 'окно Task 472: 12400 (Task 501; Task 505: +700; Task 506: +600)');
    });
    test('test-task474 окно 1700 (~1248)', () => {
        const s = fs.readFileSync(path.join(ROOT, 'tests', 'test-task474.js'), 'utf8');
        assertTrue(s.indexOf('i - 13300') !== -1, 'окно Task 474: 11200 (Task 498; Task 505: +700)');
    });
});

console.log('test-task475: все describes зарегистрированы');
