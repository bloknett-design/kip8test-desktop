// tests/test-deploy-url.js
// Task 284: «Я развёртываю с этой ссылкой
// https://script.google.com/macros/s/AKfycbyt…/exec» — а приложение
// с Task 202 вызывало ДРУГОЕ развёртывание (AKfycbzg…), чей
// работающий снимок кода старше Task 274 (роутинга отпусков нет —
// отсюда «Unknown action: workSchedule.addVacation» при том, что
// файлы в редакторе у пользователя правильные).
//
// Диагностика проб-запросами 2026-09-01 (scripts/task284-probe-
// user-deploy.sh): развёртывание AKfycbyt… ПОЛНОЕ (Auth.sendOTP,
// Sessions.getCurrentUser, Admin, CableJournal, ValidationRules,
// WorkSchedule.listVacations -> no_session — новый код) — решение:
// переключить WEB_APP_URL фронтенда на AKfycbyt… (то самое
// развёртывание, которым управляет пользователь).
//
// ЧТО ПРОВЕРЯЕТСЯ (статика):
//   1. KipAuth.WEB_APP_URL = AKfycbyt… (развёртывание пользователя)
//   2. Прежний URL AKfycbzg… полностью убран из index.html
//   3. URL в валидном формате script.google.com/macros/s/…/exec
//   4. В index.html ровно ОДИН URL деплоя (нет дублей)
//   5. Конкатенация запроса не тронута: '?action=' + encodeURIComponent
//   6. Справочная константа WEB_APP_URL в Code.gs синхронна
//      (информационная — на работу сервера не влияет)
//   7. SW-кэш поднят до kipia-test-v746 (фронтенд менялся)
//   8. VacationsDiagnose.gs подсказывает верный URL (AKfycbyt…)
//   9. node --check Code.gs — синтаксис валиден после правки

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const CODE_GS = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'Code.gs'), 'utf8');
const DIAGNOSE_GS = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'VacationsDiagnose.gs'), 'utf8');

const NEW_URL = 'https://script.google.com/macros/s/AKfycbyt2sjbJ8xT5UPKDlYj4q-CV-5pH_Yrv5COrg0PIpp92snpQULUNtJC__pMnQ0h6feNlA/exec';
const OLD_URL = 'AKfycbzgPtyya6eMCq';

describe('Task 284 — URL развёртывания в KipAuth', () => {

    test('WEB_APP_URL = развёртывание пользователя (AKfycbyt…)', () => {
        const m = INDEX_SRC.match(/WEB_APP_URL:\s*'([^']+)'/);
        assertTrue(m !== null, 'KipAuth.WEB_APP_URL найден в index.html');
        assertEqual(m[1], NEW_URL,
            'URL = AKfycbyt…/exec (развёртывание, которым управляет пользователь)');
    });

    test('прежний URL AKfycbzg… полностью убран из index.html', () => {
        assertFalse(INDEX_SRC.indexOf(OLD_URL) !== -1,
            'в index.html не осталось старого URL деплоя (Task 202)');
    });

    test('формат URL валиден: script.google.com/macros/s/…/exec', () => {
        const m = INDEX_SRC.match(/WEB_APP_URL:\s*'([^']+)'/);
        assertTrue(/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(m[1]),
            'URL соответствует формату веб-приложения Apps Script');
    });

    test('в index.html ровно один URL script.google.com/macros/s/', () => {
        const urls = INDEX_SRC.match(/https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/g) || [];
        assertEqual(urls.length, 1,
            'единственный URL деплоя (без дублей): ' + urls.length);
    });

    test('конкатенация запроса не тронута (?action= + encodeURIComponent)', () => {
        assertTrue(INDEX_SRC.indexOf("this.WEB_APP_URL + '?action=' + encodeURIComponent(action)") !== -1,
            'KipAuth.api собирает URL прежним способом');
    });

    test('Code.gs: справочная константа WEB_APP_URL синхронна (AKfycbyt…)', () => {
        const m = CODE_GS.match(/const WEB_APP_URL = '([^']+)'/);
        assertTrue(m !== null, 'константа WEB_APP_URL есть в Code.gs');
        assertEqual(m[1], NEW_URL,
            'справочная константа указывает на актуальное развёртывание');
    });

    test('VacationsDiagnose.gs подсказывает верный URL (AKfycbyt…)', () => {
        assertTrue(DIAGNOSE_GS.indexOf('AKfycbyt') !== -1,
            'диагностическая подсказка упоминает актуальный URL');
        assertFalse(DIAGNOSE_GS.indexOf(OLD_URL) !== -1,
            'старый URL из подсказки убран');
    });

    test('SW-кэш поднят до v539 (Task 296 — фронтенд менялся)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v746'") !== -1,
            'CACHE_VERSION = kipia-test-v746');
    });

    test('node --check: Code.gs синтаксически валиден', () => {
        const tmp = path.join(__dirname, '..', 'scripts', '.gscheck-code.js');
        fs.writeFileSync(tmp, CODE_GS);
        let ok = true;
        try {
            execSync('node --check "' + tmp + '"', { stdio: 'pipe' });
        } catch (e) {
            ok = false;
        } finally {
            fs.unlinkSync(tmp);
        }
        assertTrue(ok, 'node --check Code.gs без ошибок');
    });
});
