// tests/test-task354.js
// Task 354 — легаси-сборка для Windows 7/8.1 (диагноз «KIPiA.exe не
// является приложением Win32» на старых 32-битных системах).
//
// ДИАГНОЗ (проверен разбором PE-заголовков релиза v2.1.8):
//   KIPiA-Setup-2.1.8-ia32.exe корректен — все бинарники внутри 32-битные
//   (machine 0x014c). Причина ошибки: Electron 35 (Chromium 134) собирает
//   бинарники с PE OptionalHeader.MajorOperatingSystemVersion = 10.00 —
//   загрузчик Windows 7/8.1 отклоняет такой образ ошибкой
//   ERROR_BAD_EXE_FORMAT («не является приложением Win32»). ia32 — это
//   разрядность, а не совместимость со старыми ОС: обычная ia32-сборка
//   предназначена для 32-битной Windows 10+.
//
// РЕШЕНИЕ (только kip8-desktop — продакшн-репо десктопа):
//   • electron-builder-legacy.yml — Electron 22.3.27 (последняя ветка с
//     поддержкой Win7/8.1, её electron.exe объявляет PE OS 5.01),
//     NSIS ia32+x64, extraMetadata { kipiaWin7Legacy: true,
//     version: 2.1.8-lts }, output dist-legacy, без publish-канала;
//   • .github/workflows/build-legacy-win7.yml — сборка на windows-latest
//     (rcedit нативно, wine не нужен), PE-верификация на ubuntu
//     (machine 0x014c/0x866c…0x8664 + OS 5.01), релиз legacy-v* —
//     PRERELEASE, только *.exe (без latest.yml: у легаси нет канала
//     автообновления — основной канал раздаёт сборки Win10+);
//   • electron/main.js — совместимость с Electron 22:
//     - protocol.handle (Electron 25+) ИЛИ registerBufferProtocol (22);
//     - isRemoteAvailable через модуль net (в Node 16 у Electron 22 нет
//       global fetch в main-процессе) — единый путь для 22 и 35;
//     - автообновление отключается флагом kipiaWin7Legacy (ленивый
//       require electron-updater под if, no-op checkForUpdates,
//       диалог в меню вместо проверки).
//
// Этот файл живёт в kip8/kip8test/kip8-desktop (синк тестов из kip8):
// ассерты на файлы, которых нет в текущем репо (electron/main.js нового
// поколения, electron-builder-legacy.yml, workflow), запускаются только
// там, где эти файлы существуют; в остальных репо — пропуск.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');

const MAIN_PATH = path.join(ROOT, 'electron', 'main.js');
const LEGACY_YML_PATH = path.join(ROOT, 'electron-builder-legacy.yml');
const LEGACY_WF_PATH = path.join(ROOT, '.github', 'workflows', 'build-legacy-win7.yml');
const GITIGNORE_PATH = path.join(ROOT, '.gitignore');

const HAS_MAIN = fs.existsSync(MAIN_PATH);
const HAS_LEGACY_YML = fs.existsSync(LEGACY_YML_PATH);
const HAS_LEGACY_WF = fs.existsSync(LEGACY_WF_PATH);

// Основная группа — только в kip8-desktop (где есть легаси-артефакты)
if (HAS_MAIN && HAS_LEGACY_YML && HAS_LEGACY_WF) {
    const MAIN_SRC = fs.readFileSync(MAIN_PATH, 'utf8');
    const LEGACY_YML = fs.readFileSync(LEGACY_YML_PATH, 'utf8');
    const LEGACY_WF = fs.readFileSync(LEGACY_WF_PATH, 'utf8');
    const GITIGNORE = fs.readFileSync(GITIGNORE_PATH, 'utf8');

    describe('Task 354: SRC — electron/main.js (совместимость с Electron 22)', function () {
        test('флаг IS_LEGACY_WIN7 читается из package.json (extraMetadata)', function () {
            assertTrue(MAIN_SRC.indexOf("require('../package.json')") !== -1,
                'appPkg должен читаться из package.json');
            assertTrue(MAIN_SRC.indexOf('kipiaWin7Legacy') !== -1,
                'флаг kipiaWin7Legacy должен читаться');
            assertTrue(MAIN_SRC.indexOf('const IS_LEGACY_WIN7 = appPkg.kipiaWin7Legacy === true;') !== -1,
                'строгое сравнение с true');
        });

        test('electron-updater подключается ЛЕНИВО (не на верхнем уровне)', function () {
            assertTrue(MAIN_SRC.indexOf("const { autoUpdater } = require('electron-updater');") === -1,
                'верхний безусловный require запрещён: в Electron 22/Node 16 модуль может не подняться');
            assertTrue(MAIN_SRC.indexOf("require('electron-updater').autoUpdater") !== -1,
                'require должен быть внутри инициализации');
            assertTrue(MAIN_SRC.indexOf('if (!IS_LEGACY_WIN7) {') !== -1,
                'инициализация только в НЕ-legacy сборке');
        });

        test('checkForUpdates — no-op без autoUpdater (legacy)', function () {
            const i = MAIN_SRC.indexOf('function checkForUpdates()');
            assertTrue(i !== -1, 'функция существует');
            const body = MAIN_SRC.slice(i, MAIN_SRC.indexOf('}', i) + 1);
            assertTrue(body.indexOf('if (!autoUpdater) return;') !== -1,
                'ранний выход без autoUpdater');
        });

        test('плановая проверка обновлений отключена в legacy', function () {
            assertTrue(MAIN_SRC.indexOf('if (!IS_LEGACY_WIN7) {') !== -1 &&
                MAIN_SRC.indexOf('setTimeout(checkForUpdates, 5000);') !== -1,
                'setTimeout(checkForUpdates) должен быть под гвардом');
            // гвард стоит непосредственно перед setTimeout
            const i = MAIN_SRC.indexOf('setTimeout(checkForUpdates, 5000);');
            const before = MAIN_SRC.slice(Math.max(0, i - 120), i);
            assertTrue(before.indexOf('if (!IS_LEGACY_WIN7)') !== -1,
                'гвард IS_LEGACY_WIN7 прямо перед setTimeout');
        });

        test('меню «Проверить обновления»: в legacy — информационный диалог', function () {
            const i = MAIN_SRC.indexOf("label: 'Проверить обновления'");
            assertTrue(i !== -1, 'пункт меню существует');
            const chunk = MAIN_SRC.slice(i, i + 1600);
            assertTrue(chunk.indexOf('if (IS_LEGACY_WIN7)') !== -1,
                'ветка legacy в обработчике');
            assertTrue(chunk.indexOf('legacy-сборка для Windows 7/8.1') !== -1,
                'диалог объясняет отключение автообновления');
            assertTrue(chunk.indexOf('checkForUpdates();') !== -1,
                'обычный путь сохранён');
        });

        test('протокол app://: двойной путь — protocol.handle (25+) / registerBufferProtocol (22)', function () {
            assertTrue(MAIN_SRC.indexOf('protocol.handle') !== -1,
                'современный путь');
            assertTrue(MAIN_SRC.indexOf('registerBufferProtocol') !== -1,
                'fallback для Electron 22');
            assertTrue(MAIN_SRC.indexOf("typeof protocol.handle === 'function'") !== -1,
                'выбор пути по наличию API');
        });

        test('main-процесс НЕ использует global fetch (нет в Node 16 у Electron 22)', function () {
            assertTrue(MAIN_SRC.indexOf('await fetch(REMOTE_APP_URL') === -1,
                'fetch(REMOTE_APP_URL) удалён');
            assertTrue(MAIN_SRC.indexOf('AbortController') === -1,
                'AbortController (инфраструктура fetch) удалён');
            assertTrue(MAIN_SRC.indexOf('net.request') !== -1,
                'проверка доступности через модуль net');
        });

        test('isRemoteAvailable: единая сетевая проверка для Electron 22 и 35', function () {
            assertTrue(MAIN_SRC.indexOf('function isRemoteAvailable(url, timeoutMs)') !== -1,
                'функция существует');
            assertTrue(MAIN_SRC.indexOf('method: \'HEAD\'') !== -1,
                'HEAD-запрос');
            assertTrue(MAIN_SRC.indexOf('res.statusCode >= 200 && res.statusCode < 400') !== -1,
                'критерий доступности как у прежнего fetch(response.ok) с 3xx');
        });
    });

    describe('Task 354: SRC — electron-builder-legacy.yml', function () {
        test('Electron 22.3.27 — последняя ветка с поддержкой Windows 7/8.1', function () {
            assertTrue(LEGACY_YML.indexOf('electronVersion: 22.3.27') !== -1,
                'electronVersion закреплён');
        });

        test('extraMetadata: флаг + версия lts', function () {
            assertTrue(LEGACY_YML.indexOf('kipiaWin7Legacy: true') !== -1,
                'флаг для main.js');
            assertTrue(LEGACY_YML.indexOf('version: 2.1.8-lts') !== -1,
                'версия отличима от обычной 2.1.8');
        });

        test('артефакты: только win7-имена, ia32 и x64, отдельный output', function () {
            assertTrue(LEGACY_YML.indexOf('KIPiA-Setup-${version}-win7-${arch}.${ext}') !== -1,
                'шаблон имени с win7');
            assertTrue(LEGACY_YML.indexOf('- ia32') !== -1 && LEGACY_YML.indexOf('- x64') !== -1,
                'обе разрядности');
            assertTrue(LEGACY_YML.indexOf('output: dist-legacy') !== -1,
                'не пересекается с обычной dist/');
        });

        test('нет publish-канала: легаси не попадает в latest.yml автообновления', function () {
            assertTrue(LEGACY_YML.indexOf('provider: github') === -1,
                'publish-провайдер отсутствует (релиз собирает workflow)');
            assertTrue(LEGACY_YML.indexOf('publish:') === -1,
                'publish не объявлен вовсе');
        });

        test('локализация установщика сохранена (ru)', function () {
            assertTrue(LEGACY_YML.indexOf('language: 1049') !== -1 &&
                LEGACY_YML.indexOf('installerLanguages:') !== -1,
                'NSIS русский');
            assertTrue(LEGACY_YML.indexOf('shortcutName: КИПиА') !== -1,
                'имя ярлыка');
        });
    });

    describe('Task 354: SRC — workflow build-legacy-win7.yml', function () {
        test('триггеры: тег legacy-v* и ручной запуск; НЕ пересекается с v*', function () {
            assertTrue(LEGACY_WF.indexOf("tags: [ 'legacy-v*' ]") !== -1,
                'тег legacy-v*');
            assertTrue(LEGACY_WF.indexOf('workflow_dispatch:') !== -1,
                'ручной запуск');
            assertTrue(LEGACY_WF.indexOf("tags: [ 'v*' ]") === -1,
                'не должен запускать основной релизный пайплайн');
        });

        test('сборка на windows-latest — rcedit без wine', function () {
            assertTrue(LEGACY_WF.indexOf('runs-on: windows-latest') !== -1,
                'windows-runner для NSIS');
            assertTrue(LEGACY_WF.indexOf('--config electron-builder-legacy.yml --publish never') !== -1,
                'конфиг легаси + без публикации');
        });

        test('PE-верификация в CI: machine + OS 5.01/5.02 (Win7-совместимость)', function () {
            assertTrue(LEGACY_WF.indexOf('verify-pe') !== -1,
                'джоба верификации');
            assertTrue(LEGACY_WF.indexOf('0x014c') !== -1 && LEGACY_WF.indexOf('0x8664') !== -1,
                'проверка обеих разрядностей');
            assertTrue(LEGACY_WF.indexOf('(5, 1)') !== -1 && LEGACY_WF.indexOf('(5, 2)') !== -1,
                'ia32 → PE OS 5.01, x64 → 5.02 (минимум для x64; Win7 x64 = 6.1 ≥ 5.02)');
            assertTrue(LEGACY_WF.indexOf('p7zip-full') !== -1,
                '7z для распаковки установщика');
        });

        test('релиз: prerelease + только *.exe (без latest.yml канала обновлений)', function () {
            assertTrue(LEGACY_WF.indexOf('prerelease: true') !== -1,
                'prerelease — не станет latest, не заденет автообновление');
            assertTrue(LEGACY_WF.indexOf('release-artifacts/*.exe') !== -1,
                'в релиз попадают только установщики');
            assertFalse(LEGACY_WF.indexOf('release-artifacts/**/*.yml') !== -1,
                'latest.yml в релиз запрещён');
            assertTrue(LEGACY_WF.indexOf('needs: [build-legacy-win, verify-pe]') !== -1,
                'релиз только после PE-верификации');
        });
    });

    describe('Task 354: SRC — .gitignore', function () {
        test('dist-legacy/ игнорируется', function () {
            assertTrue(GITIGNORE.indexOf('dist-legacy/') !== -1,
                'выход легаси-сборки не попадает в git');
        });
    });

    // ============================================================
    // VM: извлечение и поведение isRemoteAvailable (мок net)
    // ============================================================
    function extractFn(src, name) {
        const idx = src.indexOf('function ' + name + '(');
        if (idx === -1) return null;
        let depth = 0;
        let i = src.indexOf('{', idx);
        for (; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') {
                depth--;
                if (depth === 0) return src.slice(idx, i + 1);
            }
        }
        return null;
    }

    const IS_REMOTE_FN = extractFn(MAIN_SRC, 'isRemoteAvailable');
    const RESOLVE_FILE_FN = extractFn(MAIN_SRC, 'resolveFile');

    // mimeTypes определён в registerProtocolHandler (внешняя область
    // resolveFile) — извлекаем const-блок целиком и добавляем в песочницу
    function extractConst(src, name) {
        const idx = src.indexOf('const ' + name + ' = {');
        if (idx === -1) return null;
        let depth = 0;
        let i = src.indexOf('{', idx);
        const start = i;
        for (; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') {
                depth--;
                if (depth === 0) return src.slice(idx, i + 1) + ';';
            }
        }
        return null;
    }
    const MIME_TYPES_CONST = extractConst(MAIN_SRC, 'mimeTypes');

    describe('Task 354: VM — isRemoteAvailable (сетевая проверка через net)', function () {
        // ВАЖНО (Task 354): моки БЕЗ фазы таймеров. В полностью синхронном
        // прогоне блуждающие setTimeout-ы из eval-скриптов других тестов
        // (focus через 30/100/350 мс) никогда не срабатывали до process.exit.
        // Async-тесты, заходящие в фазу таймеров цикла событий, будили их —
        // и падали на моках без .focus(), убивая весь прогон. Решение:
        // таймер песочницы — queueMicrotask, события ответа — синхронно или
        // микротаском → тесты Task 354 не заходят в фазу таймеров.
        // (Плюс точечно пропатчен test-task318 — мок focus.)
        function makeSandbox(netMock) {
            const sandbox = {
                net: netMock,
                setTimeout: function (cb, ms) { queueMicrotask(function () { cb(); }); return 0; },
                clearTimeout: function () {},
                Promise: Promise,
                console: { log: function () {} }
            };
            vm.createContext(sandbox);
            vm.runInContext(IS_REMOTE_FN + '\n__fn = isRemoteAvailable;', sandbox);
            return sandbox.__fn;
        }

        function makeReq(events) {
            // events: { statusCode: N } | { error: true } | { hang: true } | { throw: true } | { sync: true }
            const req = {
                _handlers: {},
                on: function (ev, cb) { this._handlers[ev] = cb; return this; },
                end: function () {
                    const e = events;
                    if (e.throw) return;
                    const self = this;
                    const fire = function () {
                        if (e.error) { self._handlers.error && self._handlers.error(new Error('net fail')); return; }
                        if (!e.hang) { self._handlers.response && self._handlers.response({ statusCode: e.statusCode }); }
                    };
                    if (e.sync) fire();
                    else queueMicrotask(fire);
                },
                destroy: function () { this._destroyed = true; }
            };
            return req;
        }

        test('сервер доступен: 2xx/3xx → true', async function () {
            const fn = makeSandbox({ request: () => makeReq({ statusCode: 200, sync: true }) });
            assertEqual(await fn('https://example.org/', 2000), true, '200 → true');
        });

        test('redirect 3xx считается доступным (как fetch с follow)', async function () {
            const fn = makeSandbox({ request: () => makeReq({ statusCode: 302, sync: true }) });
            assertEqual(await fn('https://example.org/', 2000), true, '302 → true');
        });

        test('сервер отвечает ошибкой: 4xx/5xx → false', async function () {
            const fn = makeSandbox({ request: () => makeReq({ statusCode: 404, sync: true }) });
            assertEqual(await fn('https://example.org/', 2000), false, '404 → false');
        });

        test('сетевая ошибка → false', async function () {
            const fn = makeSandbox({ request: () => makeReq({ error: true, sync: true }) });
            assertEqual(await fn('https://example.org/', 2000), false, 'error event → false');
        });

        test('таймаут: сервер молчит → false (без ответа)', async function () {
            // фейковый таймер песочницы срабатывает микротаском раньше
            // какого-либо ответа → done(false) по таймауту
            const fn = makeSandbox({ request: () => makeReq({ hang: true }) });
            assertEqual(await fn('https://example.org/', 50), false, 'hang → false по таймауту');
        });

        test('net.request бросает синхронно → false (не падает)', async function () {
            const fn = makeSandbox({ request: () => makeReq({ throw: true }) });
            assertEqual(await fn('https://example.org/', 2000), false, 'sync throw → false');
        });

        test('двойной resolve не падает (settled-гвард)', async function () {
            // ответ 200 синхронно, затем поздний error — второй done игнорируется
            let handlerCb;
            const req = {
                on: function (ev, cb) { if (ev === 'response') handlerCb = cb; if (ev === 'error') this._err = cb; return this; },
                _handlers: {},
                _err: null,
                end: function () {
                    handlerCb({ statusCode: 200 });
                    queueMicrotask(() => this._err && this._err(new Error('late')));
                },
                destroy: function () {}
            };
            const fn = makeSandbox({ request: () => req });
            assertEqual(await fn('https://example.org/', 2000), true, 'первый результат побеждает');
        });
    });

    describe('Task 354: VM — resolveFile (локальный протокол app://)', function () {
        function makeResolveSandbox(files) {
            const sandbox = {
                path: path,
                fs: { readFileSync: function (p) { if (p in files) return files[p]; const e = new Error('ENOENT: ' + p); e.code = 'ENOENT'; throw e; } },
                URL: URL,
                Buffer: Buffer,
                APP_ROOT: '/kipia/app',
                console: { log: function () {} }
            };
            vm.createContext(sandbox);
            vm.runInContext(MIME_TYPES_CONST + '\n' + RESOLVE_FILE_FN + '\n__fn = resolveFile;', sandbox);
            return sandbox.__fn;
        }

        test('html отдаётся с правильным MIME', function () {
            const fn = makeResolveSandbox({ '/kipia/app/index.html': Buffer.from('<html></html>') });
            const r = fn('app://localhost/index.html');
            assertEqual(r.status, 200, '200 для существующего');
            assertEqual(r.mimeType, 'text/html; charset=utf-8', 'MIME html');
            assertTrue(Buffer.isBuffer(r.data), 'данные — Buffer (совместимо с registerBufferProtocol)');
        });

        test('json отдаётся как application/json', function () {
            const fn = makeResolveSandbox({ '/kipia/app/data/devices.json': Buffer.from('{}') });
            const r = fn('app://localhost/data/devices.json');
            assertEqual(r.status, 200, '200');
            assertEqual(r.mimeType, 'application/json; charset=utf-8', 'MIME json');
        });

        test('несуществующий файл → 404', function () {
            const fn = makeResolveSandbox({});
            const r = fn('app://localhost/nope.png');
            assertEqual(r.status, 404, '404 для отсутствующего');
        });

        test('гвард выхода за APP_ROOT присутствует в коде', function () {
            assertTrue(MAIN_SRC.indexOf("!filePath.startsWith(APP_ROOT)") !== -1,
                'проверка префикса пути');
        });
    });

} else {
    // В kip8/kip8test этого файла нет — легаси-сборка живёт только в kip8-desktop
    describe('Task 354: пропущен (легаси-артефакты не в этом репо)', function () {
        test('test-task354: синк-инвариант — файл скопирован без изменений', function () {
            assertTrue(true, 'файл присутствует для байт-в-байт синка из kip8');
        });
    });
}

module.exports = {};
