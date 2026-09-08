// tests/test-task345.js
// Task 345 — регрессия изоляции десктопных приложений
// kip8-desktop ↔ kip8test-desktop (заявка 2026-09-08: «нужно проверить,
// чтобы не было общей регистрации между десктопными приложениями
// kip8-desktop и kip8test-desktop»).
//
// ПОЧЕМУ ЭТО ВАЖНО (результат аудита):
//   Мобильные PWA kip8/kip8test делят один браузер и один origin
//   (bloknett-design.github.io) → общий localStorage → «общий вход»
//   (инцидент Task 344). Десктопы — Electron: localStorage/cookies/SW
//   физически лежат в папке userData СВОЕГО приложения
//   (%APPDATA%\<app.name>, app.name = productName из package.json).
//   productName прод-десктопа — «KIPiA», тест-десктопа — «KIPiA Test»
//   → папки разные → вход/данные полностью раздельны, даже при
//   одинаковых origin (app://localhost у обоих, GitHub Pages у обоих
//   в online-режиме). Сейчас изоляция ПОЛНАЯ (аудит 34/34, включая
//   историю productName: у kip8test-desktop всегда было «КИПиА (Test)»
//   → «KIPiA Test», никогда «KIPiA»).
//
// ЧТО ЛОМАЕТ ИЗОЛЯЦИЮ И КАК ЭТО ЛОВИТСЯ:
//   Риск — копипаста при переносе между десктоп-репо (аналог инцидента
//   Task 341, когда перенос kip8test → kip8 целиком утащил обёртку
//   isolateLocalStorage в прод). Если package.json kip8test-desktop
//   получит прод-productName «KIPiA» — оба приложения начнут писать
//   в ОДНУ папку %APPDATA%\KIPiA → общий вход на десктопах.
//   Этот тест ловит: имя/name/productName/appId/репо автообновлений/
//   REMOTE_APP_URL в main.js/отсутствие app.setName и
//   app.setPath('userData')/partition (что-либо из этого, перенесённое
//   из прод-десктопа, мгновенно роняет проверки).
//
// Запуск: через tests/run-all.js (require './test-task345.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const MAIN_SRC = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ============================================================
// 1. Идентификация приложения (package.json → папка userData)
// ============================================================
describe('Task 345 — изоляция kip8test-desktop: идентификация', () => {

    test('name = "kipia-desktop-test" (НЕ прод-имя kipia-desktop)', () => {
        assertEqual(PKG.name, 'kipia-desktop-test', 'поле name package.json');
    });

    test('build.productName = "KIPiA Test" → userData %APPDATA%\\KIPiA Test (≠ %APPDATA%\\KIPiA)', () => {
        assertEqual(PKG.build && PKG.build.productName, 'KIPiA Test',
            'build.productName (определяет папку userData и, сломайся она, — общий вход с kip8-desktop)');
    });

    test('build.appId = "com.bloknett.kipia.test" (≠ прод com.bloknett.kipia)', () => {
        assertEqual(PKG.build && PKG.build.appId, 'com.bloknett.kipia.test', 'build.appId');
    });

    test('autoUpdater качает релизы из kip8test-desktop (НЕ из kip8-desktop)', () => {
        assertEqual(PKG.build && PKG.build.publish && PKG.build.publish.repo,
            'kip8test-desktop', 'build.publish.repo');
    });

    test('ярлык и артефакт — тестовые ("КИПиА (Test)" / KIPiA-Test-Setup-*)', () => {
        assertEqual(PKG.build && PKG.build.nsis && PKG.build.nsis.shortcutName,
            'КИПиА (Test)', 'nsis.shortcutName');
        const art = (PKG.build && PKG.build.win && PKG.build.win.artifactName) || '';
        assertTrue(art.indexOf('KIPiA-Test-Setup-') === 0,
            'win.artifactName начинается с "KIPiA-Test-Setup-", фактически: ' + art);
    });
});

// ============================================================
// 2. Electron main.js — хранилище и источник контента
// ============================================================
describe('Task 345 — изоляция kip8test-desktop: electron/main.js', () => {

    test('REMOTE_APP_URL ведёт на тестовые Pages /kip8test/ (НЕ на прод /kip8/)', () => {
        const m = MAIN_SRC.match(/REMOTE_APP_URL\s*=\s*'([^']+)'/);
        assertEqual(m && m[1], 'https://bloknett-design.github.io/kip8test/',
            'REMOTE_APP_URL (прод-значение = загрузка прод-контента в тест-приложение)');
    });

    test('НЕТ app.setName(...) — переопределение может столкнуть папки userData', () => {
        assertTrue(!/app\.setName\s*\(/.test(MAIN_SRC), 'app.setName(');
    });

    test('НЕТ app.setPath(\'userData\', ...) — общий путь = общее хранилище', () => {
        assertTrue(!/app\.setPath\s*\(\s*['"]userData/.test(MAIN_SRC), "app.setPath('userData', ...)");
    });

    test('НЕТ "partition:" — общая партиция сессии разделила бы логин', () => {
        assertTrue(MAIN_SRC.indexOf('partition:') === -1, 'partition: в webPreferences');
    });
});

// ============================================================
// 3. index.html — тест-специфика на месте (контент из kip8test)
// ============================================================
describe('Task 345 — изоляция kip8test-desktop: index.html', () => {

    test('обёртка isolateLocalStorage присутствует (норма тест-сборки, ≥2 упоминаний)', () => {
        const n = INDEX_SRC.split('isolateLocalStorage').length - 1;
        assertTrue(n >= 2, 'упоминаний isolateLocalStorage: ' + n);
    });

    test('ключи localStorage идут с префиксом "kip8test:" (внутри собственной папки userData)', () => {
        assertTrue(INDEX_SRC.indexOf('kip8test:') !== -1, 'литерал "kip8test:"');
    });
});
