// tests/test-task348.js
// Task 348 — getUuid вместо Math.random + LockService от гонок.
//
// Контекст (2026-09-09, сопровождение Tasks 346/347): сессии бессрочные,
// токен живёт вечно — Math.random (не криптостойкий) для генерации токенов
// и OTP-кодов заменён на Utilities.getUuid(). Apps Script обрабатывает
// запросы ПАРАЛЛЕЛЬНО: цепочки «прочитал → посчитал → записал» перемешиваются
// (дубль ID при createUser, запись в ЧУЖУЮ строку по устаревшему номеру при
// logout/heartbeat, дубль девайс-сессии при параллельном входе, повторное
// использование OTP при двойном submit). Все мутации обёрнуты в новый
// Utils.withLock (LockService.getScriptLock, tryLock с таймаутом).
//
// Состав Task 348:
//   Utils.gs:   generateToken + generateNumericCode → getUuid;
//               withLock (хелпер); createUser, resetLogin,
//               cleanupStaleSessions — под замком.
//   Sessions.gs: heartbeat, logout, getCurrentUser — под замком;
//               createSession БЕЗ замка (вызывается под замком verifyOTP —
//               замок не реентерабелен, вложенный = взаимоблокировка).
//   Auth.gs:    verifyOTP — мутации одним куском под замком
//               (markOtpUsed → … → login_status); sendOTP БЕЗ замка
//               (MailApp медленный — письмо ВНЕ замка).
//
// Бонус-гард: node --check ВСЕХ .gs справочников scripts/ (история:
// при передаче файлов в чате/терминале однажды «проглотились» символы —
// такие вещи должен ловить CI, а не прод).
//
// Запуск: через tests/run-all.js (require './test-task348.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const UTILS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Utils.gs'), 'utf8');
const SESSIONS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Sessions.gs'), 'utf8');
const AUTH_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Auth.gs'), 'utf8');

// ============================================================
// Извлечение функции из .gs по маркеру (по образцу test-task347.js)
// ============================================================
function extractFn(src, marker) {
    const START = src.indexOf(marker);
    if (START === -1) return '';
    const FN = src.indexOf('function', START);
    let depth = 0;
    let i = src.indexOf('{', START);
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(FN, i + 1);
}

const GEN_TOKEN_FN = extractFn(UTILS_SRC, 'generateToken: function');
const GEN_CODE_FN = extractFn(UTILS_SRC, 'generateNumericCode: function');
const WITHLOCK_FN = extractFn(UTILS_SRC, 'withLock: function');

const CREATE_USER_FN = extractFn(UTILS_SRC, 'createUser: function');
const RESET_LOGIN_FN = extractFn(UTILS_SRC, 'resetLogin: function');
const CLEANUP_STALE_FN = extractFn(UTILS_SRC, 'cleanupStaleSessions: function');

const CREATE_SESSION_FN = extractFn(SESSIONS_SRC, 'createSession: function');
const HEARTBEAT_FN = extractFn(SESSIONS_SRC, 'heartbeat: function');
const LOGOUT_FN = extractFn(SESSIONS_SRC, 'logout: function');
const GET_CURRENT_FN = extractFn(SESSIONS_SRC, 'getCurrentUser: function');

const VERIFY_OTP_FN = extractFn(AUTH_SRC, 'verifyOTP: function');
const SEND_OTP_FN = extractFn(AUTH_SRC, 'sendOTP: function');

// Task 350: строки-комментарии (JSDoc «* …», «// …») убираются —
// ассерты ниже смотрят на ПОЗИЦИИ паттернов в живом коде, а
// комментарии Task 350 упоминают те же имена до замка (некрологи).
function stripCommentLines(src) {
    return src.split('\n').filter(function (l) {
        return !/^\s*(\*|\/\/)/.test(l);
    }).join('\n');
}
const VERIFY_OTP_CODE = stripCommentLines(VERIFY_OTP_FN);
const SEND_OTP_CODE = stripCommentLines(SEND_OTP_FN);

// ============================================================
// 1. SRC-гарды: getUuid
// ============================================================
describe('Task 348 — SRC: генерация через Utilities.getUuid', () => {

    test('SRC: generateToken использует Utilities.getUuid, Math.random убран', () => {
        assertTrue(GEN_TOKEN_FN.indexOf('Utilities.getUuid()') !== -1,
            'getUuid в generateToken');
        assertTrue(GEN_TOKEN_FN.indexOf('Math.random') === -1,
            'Math.random в generateToken отсутствует');
    });

    test('SRC: generateNumericCode использует Utilities.getUuid, Math.random убран', () => {
        assertTrue(GEN_CODE_FN.indexOf('Utilities.getUuid()') !== -1,
            'getUuid в generateNumericCode');
        assertTrue(GEN_CODE_FN.indexOf('Math.random') === -1,
            'Math.random в generateNumericCode отсутствует');
    });

    test('SRC: getUuid прогоняется через replace(-) — дефисы убраны из токена', () => {
        assertTrue(GEN_TOKEN_FN.indexOf("replace(/-/g, '')") !== -1,
            'дефисы UUID вырезаются');
    });

    test('SRC: в generateNumericCode остаются только цифры', () => {
        assertTrue(GEN_CODE_FN.indexOf("replace(/[^0-9]/g, '')") !== -1,
            'из UUID оставляются только 0-9');
    });
});

// ============================================================
// 2. SRC-гарды: withLock и обёртки
// ============================================================
describe('Task 348 — SRC: withLock и точки обёртки', () => {

    test('SRC: Utils.withLock определён', () => {
        assertTrue(WITHLOCK_FN.length > 50, 'функция извлечена из Utils.gs');
    });

    test('SRC: withLock — getScriptLock + tryLock(таймаут) + finally releaseLock', () => {
        assertTrue(WITHLOCK_FN.indexOf('LockService.getScriptLock()') !== -1,
            'глобальный замок скрипта');
        assertTrue(WITHLOCK_FN.indexOf('tryLock') !== -1,
            'tryLock с таймаутом (не вечное ожидание)');
        assertTrue(WITHLOCK_FN.indexOf('finally') !== -1,
            'releaseLock в finally — замок снят даже при ошибке в fn');
        assertTrue(WITHLOCK_FN.indexOf('server_busy') !== -1,
            'понятная ошибка при таймауте');
    });

    test('SRC: Admin.createUser обёрнут в Utils.withLock', () => {
        assertTrue(CREATE_USER_FN.indexOf('Utils.withLock') !== -1,
            'createUser под замком (гонка maxId+1 → дубль ID)');
    });

    test('SRC: Admin.resetLogin обёрнут в Utils.withLock', () => {
        assertTrue(RESET_LOGIN_FN.indexOf('Utils.withLock') !== -1,
            'resetLogin под замком (гонка с heartbeat/logout)');
    });

    test('SRC: Utils.cleanupStaleSessions обёрнут в Utils.withLock', () => {
        assertTrue(CLEANUP_STALE_FN.indexOf('Utils.withLock') !== -1,
            'cleanupStaleSessions под замком');
        assertTrue(CLEANUP_STALE_FN.indexOf('30000') !== -1,
            'увеличенный таймаут для чистки большого листа');
    });

    test('SRC: Sessions.heartbeat обёрнут в Utils.withLock', () => {
        assertTrue(HEARTBEAT_FN.indexOf('Utils.withLock') !== -1,
            'heartbeat под замком (setValue по номеру строки)');
    });

    test('SRC: Sessions.logout обёрнут в Utils.withLock', () => {
        assertTrue(LOGOUT_FN.indexOf('Utils.withLock') !== -1,
            'logout под замком (deleteRow по номеру строки + сброс статуса)');
    });

    test('SRC: Sessions.getCurrentUser обёрнут в Utils.withLock', () => {
        assertTrue(GET_CURRENT_FN.indexOf('Utils.withLock') !== -1,
            'getCurrentUser под замком (возможные deleteRow/правка роли)');
    });

    test('SRC: Sessions.createSession БЕЗ своего замка (вызывается под замком verifyOTP)', () => {
        // Замок НЕ реентерабелен: вложенный withLock = взаимоблокировка.
        assertTrue(CREATE_SESSION_FN.indexOf('withLock') === -1,
            'в createSession нет withLock — замок берёт вызывающий verifyOTP');
        assertTrue(CREATE_SESSION_FN.indexOf('Task 348') !== -1,
            'инвариант задокументирован в комментарии');
    });

    test('SRC: Auth.verifyOTP обёрнут в Utils.withLock', () => {
        assertTrue(VERIFY_OTP_FN.indexOf('Utils.withLock') !== -1,
            'мутации верификации атомарны (анти-повтор OTP, анти-дубль девайс-сессии)');
        const lockIdx = VERIFY_OTP_CODE.indexOf('Utils.withLock(function()');
        // Task 350: ВСЕ markOtpUsed и getActiveOtpForEmail — ВНУТРИ замка
        // (пере-чтение OTP под замком закрывает двойной submit, который
        // замок Task 348 не перекрывал: otp читался до замка).
        assertTrue(lockIdx !== -1 &&
            VERIFY_OTP_CODE.slice(lockIdx).indexOf('markOtpUsed') !== -1,
            'markOtpUsed ВНУТРИ замка (двойной submit не использует код дважды)');
        const otpSearchIdx = VERIFY_OTP_CODE.indexOf('getActiveOtpForEmail');
        assertTrue(otpSearchIdx === -1 || otpSearchIdx > lockIdx,
            'поиск OTP только ПОСЛЕ входа в замок (пере-чтение внутри, Task 350)');
    });

    test('SRC: Auth.sendOTP: секция мутаций под Utils.withLock (Task 350), письмо — снаружи', () => {
        // Task 350: [самосинхронизация → блокировки → кулдаун → appendRow]
        // — одним замком (параллельные запросы кода больше не обходят
        // 60-сек кулдаун). MailApp.sendEmail — ПОСЛЕ замка: отправка
        // медленная и не должна ставить входы в очередь за почтой.
        // Поведенческую проверку «письмо вне замка» см. test-task350.js.
        const lockStart = SEND_OTP_CODE.indexOf('Utils.withLock');
        const appendIdx = SEND_OTP_CODE.indexOf("appendRow('otp_codes'");
        const mailIdx = SEND_OTP_CODE.indexOf('MailApp.sendEmail');
        assertTrue(lockStart !== -1, 'sendOTP берёт замок на секцию мутаций');
        assertTrue(appendIdx > lockStart, 'запись OTP ВНУТРИ замка (кулдаун+appendRow атомарны)');
        assertTrue(mailIdx > appendIdx, 'письмо отправляется после записи OTP (вне замка)');
    });
});

// ============================================================
// 3. VM: generateToken / generateNumericCode с моком Utilities
// ============================================================
describe('Task 348 — VM: генерация токенов и кодов', () => {

    const UUID_A = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'; // 32 hex + 4 дефиса

    function sandboxWith(uuidValue) {
        return { Utilities: { getUuid: function () { return uuidValue; } } };
    }

    test('VM: generateToken(32) = 32 hex-символа одного UUID, без дефисов', () => {
        const fn = vm.runInNewContext('(' + GEN_TOKEN_FN + ')', sandboxWith(UUID_A));
        const t = fn(32);
        assertEqual(32, t.length, 'длина 32');
        assertEqual('aaaaaaaabbbbccccddddeeeeeeeeeeee', t, 'дефисы вырезаны, hex на месте');
        assertTrue(/^[0-9a-f]+$/.test(t), 'только hex-символы');
    });

    test('VM: generateToken(8) — короткая длина (срез)', () => {
        const fn = vm.runInNewContext('(' + GEN_TOKEN_FN + ')', sandboxWith(UUID_A));
        assertEqual('aaaaaaaabbbbccccddddeeeeeeeeeeee'.substring(0, 8), fn(8),
            'первые 8 символов');
    });

    test('VM: generateToken(40) — добирается вторым UUID (цикл)', () => {
        const fn = vm.runInNewContext('(' + GEN_TOKEN_FN + ')', sandboxWith(UUID_A));
        assertEqual(40, fn(40).length, 'длина 40 = два UUID');
        assertEqual('aaaaaaaabbbbccccddddeeeeeeeeeeee' + 'aaaaaaaabbbbccccddddeeeeeeeeeeee'.substring(0, 8),
            fn(40), 'конкатенация двух UUID со срезом');
    });

    test('VM: generateToken() без аргумента — дефолт 32', () => {
        const fn = vm.runInNewContext('(' + GEN_TOKEN_FN + ')', sandboxWith(UUID_A));
        assertEqual(32, fn().length, 'длина по умолчанию 32');
    });

    test('VM: generateNumericCode(6) = 6 цифр из UUID', () => {
        // '12345678-abcd-ef01-2345-6789abcd' → цифры: 12345678|01|2345|6789
        const fn = vm.runInNewContext('(' + GEN_CODE_FN + ')',
            sandboxWith('12345678-abcd-ef01-2345-6789abcd'));
        const code = fn(6);
        assertEqual('123456', code, 'ровно первые 6 цифр UUID');
        assertTrue(/^\d{6}$/.test(code), 'только цифры');
    });

    test('VM: generateNumericCode — UUID без цифр добирается вторым вызовом', () => {
        // все a-f: первый UUID цифр не даст, второй тоже a-f… значит цикл
        // крутится — проверяем ДОПУСТИМОСТЬ через другой UUID: первый без
        // цифр, второй с цифрами (мок меняет ответ по вызову).
        let call = 0;
        const sb = { Utilities: { getUuid: function () {
            call++;
            return call === 1 ? 'aaaa-bbbb-cccc-dddd-eeeeeeeeee' : '1a2b3c4d-5e6f-7a8b-9c0d-e1f2a3b4c5d6';
        } } };
        const fn = vm.runInNewContext('(' + GEN_CODE_FN + ')', sb);
        const code = fn(6);
        assertTrue(/^\d{6}$/.test(code), 'код всё равно из 6 цифр');
        assertTrue(call >= 2, 'цикл добрал вторым UUID');
    });
});

// ============================================================
// 4. VM: withLock с моком LockService
// ============================================================
describe('Task 348 — VM: Utils.withLock', () => {

    function makeSandbox(tryLockResult) {
        const calls = { tryLock: 0, releaseLock: 0, lastTimeout: null };
        const sb = {
            __calls: calls,
            LockService: {
                getScriptLock: function () {
                    return {
                        tryLock: function (ms) {
                            calls.tryLock++;
                            calls.lastTimeout = ms;
                            return tryLockResult;
                        },
                        releaseLock: function () { calls.releaseLock++; }
                    };
                }
            }
        };
        sb.__withLock = vm.runInNewContext('(' + WITHLOCK_FN + ')', sb);
        return sb;
    }

    test('VM: замок взят → fn выполнен, результат возвращён, замок снят', () => {
        const sb = makeSandbox(true);
        let ran = 0;
        const result = sb.__withLock(function () { ran++; return 42; });
        assertEqual(42, result, 'результат fn проброшен');
        assertEqual(1, ran, 'fn выполнен один раз');
        assertEqual(1, sb.__calls.tryLock, 'tryLock вызван');
        assertEqual(1, sb.__calls.releaseLock, 'releaseLock вызван ровно один раз');
    });

    test('VM: дефолтный таймаут 10000 мс передаётся в tryLock', () => {
        const sb = makeSandbox(true);
        sb.__withLock(function () { return 1; });
        assertEqual(10000, sb.__calls.lastTimeout, 'дефолт 10 секунд');
    });

    test('VM: свой таймаут пробрасывается (30000 для чистки)', () => {
        const sb = makeSandbox(true);
        sb.__withLock(function () { return 1; }, 30000);
        assertEqual(30000, sb.__calls.lastTimeout, 'кастомный таймаут');
    });

    test('VM: tryLock=false → server_busy, fn НЕ выполняется, замок НЕ снят', () => {
        const sb = makeSandbox(false);
        let ran = 0;
        let msg = '';
        try {
            sb.__withLock(function () { ran++; return 1; });
        } catch (e) {
            msg = String(e.message || e);
        }
        assertTrue(msg.indexOf('server_busy') !== -1, 'ошибка server_busy: ' + msg);
        assertEqual(0, ran, 'fn не выполнялся');
        assertEqual(0, sb.__calls.releaseLock, 'releaseLock не вызывался (замок не наш)');
    });

    test('VM: fn бросил ошибку → замок всё равно снят, ошибка проброшена', () => {
        const sb = makeSandbox(true);
        let msg = '';
        try {
            sb.__withLock(function () { throw new Error('boom'); });
        } catch (e) {
            msg = String(e.message || e);
        }
        assertEqual('boom', msg, 'ошибка проброшена наружу');
        assertEqual(1, sb.__calls.releaseLock, 'releaseLock в finally — замок снят');
    });
});

// ============================================================
// 5. ГАРД: node --check всех .gs справочников
// (история: при передаче файлов в чате «проглатывались» символы —
// синтаксическую целостность справочников должен ловить CI)
// ============================================================
describe('Task 348 — ГАРД: node --check всех .gs в scripts/', () => {

    const gsFiles = fs.readdirSync(path.join(ROOT, 'scripts'))
        .filter(f => f.endsWith('.gs'))
        .sort();

    test('в scripts/ есть .gs-справочники для проверки', () => {
        assertTrue(gsFiles.length >= 10, 'найдено ' + gsFiles.length + ' .gs файлов');
    });

    test('каждый .gs синтаксически валиден (node --check)', () => {
        const bad = [];
        gsFiles.forEach(f => {
            const tmp = path.join(ROOT, 'scripts', '.gscheck-tmp.js');
            fs.writeFileSync(tmp, fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8'));
            try {
                execSync('node --check "' + tmp + '"', { stdio: 'pipe' });
            } catch (e) {
                bad.push(f);
            } finally {
                fs.unlinkSync(tmp);
            }
        });
        assertEqual('', bad.join(', '), 'битые файлы: ' + bad.join(', ') + ' (должно быть пусто)');
    });
});
