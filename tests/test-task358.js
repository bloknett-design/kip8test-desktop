// tests/test-task358.js
// Task 358: гарантированная доставка показаний расходомеров (outbox).
//
// ЗАЯВКА: пользователь вводит показания, жмёт «Сохранить», видит
// обновлённую карточку (оптимистичный UI) и быстро переходит к
// следующему расходомеру или сразу закрывает приложение — а фактическая
// запись на сервере происходит только после ВТОРОГО round-trip'а
// (валидация getRecentAllMeters → updateReading). Fetch прерывается
// закрытием/сетью — показания теряются молча.
//
// РЕШЕНИЕ (клиентское, сервер Apps Script не менялся):
//   A. write-ahead журнал в localStorage (kip8_flow_outbox_v1):
//      запись ДО любых сетевых запросов; удаление — только по ответу
//      сервера / осознанной отмене пользователя.
//   B. Авто-флаш с ДЕДУПОМ (сервер пишет архив appendRow без проверки
//      дублей): init / window online / visibilitychange / ретрай с
//      бэкоффом 15с→30с→60с.
//   C. Закрытие: pagehide → navigator.sendBeacon (text/plain, без
//      preflight, без ответа; запись остаётся в outbox — следующий
//      запуск сверит с сервером). Electron (десктопы): перехват close
//      → executeJavaScript(_outboxFlushBeacons) → destroy (≤1.2 c).
//   D. Честный UX: баннер недоставленных показаний (Task 366 —
//      с номерами расходомеров, без иконки), тост «нет
//      связи — отправим автоматически», beforeunload-предупреждение.
//   E. Спец-кейс «быстрая навигация»: soft-confirm payload раньше
//      затирался следующим вводом (_pendingApiPayload — одна
//      переменная) — теперь запись ждёт подтверждения в outbox,
//      модалка пере-показывается при флаше.
//
// Тесты: SRC-гарды (структура кода) + VM (изолированные методы с
// моками localStorage/KipAuth/KipToast/_api) + SW-версия.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

const INDEX_HTML = path.resolve(__dirname, '..', 'index.html');
const SW_PATH = path.resolve(__dirname, '..', 'sw.js');
const INDEX_SRC = fs.readFileSync(INDEX_HTML, 'utf-8');
const SW_SRC = fs.readFileSync(SW_PATH, 'utf-8');
const MAIN_JS_PATH = path.resolve(__dirname, '..', 'electron', 'main.js');

// ============================================================
// Извлечение метода из объекта FlowmeterData/KipAuth (баланс скобок)
// ============================================================
function extractMethod(src, name) {
    const start = src.indexOf(name + ': function(');
    if (start === -1) return null;
    const braceStart = src.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    return null;
}

// ============================================================
// SRC-гарды: структура Task 358 в index.html
// ============================================================
describe('Task 358 — SRC: outbox-методы и точки встраивания', () => {

    test('_OUTBOX_KEY = kip8_flow_outbox_v1', () => {
        assertTrue(INDEX_SRC.indexOf("_OUTBOX_KEY: 'kip8_flow_outbox_v1'") !== -1,
            'ключ outbox объявлен');
    });

    test('полный набор outbox-методов FlowmeterData', () => {
        ['_outboxLoad', '_outboxSave', '_outboxAdd', '_outboxRemove',
         '_outboxUpdate', '_outboxCount', '_outboxIsPermanentError',
         '_sendOutboxEntry', '_flushOutbox', '_scheduleOutboxRetry',
         '_ensureOutboxWatchers', '_outboxFlushBeacons', '_reshowAnomalyModal']
        .forEach(function(m) {
            assertTrue(INDEX_SRC.indexOf(m + ': function(') !== -1,
                'метод ' + m + ' объявлен');
        });
    });

    test('KipAuth.sendBeacon: text/plain blob (без CORS-preflight)', () => {
        const m = extractMethod(INDEX_SRC, 'sendBeacon');
        assertTrue(m !== null, 'sendBeacon извлечён');
        assertTrue(m.indexOf('text/plain;charset=utf-8') !== -1,
            'тип blob — text/plain (simple request, как основной POST)');
        assertTrue(m.indexOf('navigator.sendBeacon') !== -1,
            'используется navigator.sendBeacon');
    });

    test('submitInput: write-ahead — _outboxAdd ДО валидационного round-trip', () => {
        const addPos = INDEX_SRC.indexOf("var outboxCid = 'fl' + Date.now()");
        const apiPos = INDEX_SRC.indexOf("flowmeter.getRecentAllMeters");
        assertTrue(addPos !== -1, 'cid генерируется в submitInput');
        assertTrue(apiPos !== -1, 'getRecentAllMeters в submitInput');
        assertTrue(addPos < apiPos, 'outboxAdd раньше валидационного запроса');
    });

    test('submitInput: запись kind:day с payload и isEdit', () => {
        const pos = INDEX_SRC.indexOf('kind: \'day\'');
        assertTrue(pos !== -1, 'kind day');
        const ctx = INDEX_SRC.slice(pos - 200, pos + 300);
        assertTrue(ctx.indexOf('payload: apiPayload') !== -1, 'payload передан');
        assertTrue(ctx.indexOf('isEdit: isEdit') !== -1, 'isEdit передан');
    });

    test('soft-confirm: запись остаётся в outbox (state awaiting-confirm + codes)', () => {
        const n = INDEX_SRC.split("state: 'awaiting-confirm'").length - 1;
        assertEqual(n, 2, 'обе ветки soft-confirm (главная + fallback)');
        const pos = INDEX_SRC.indexOf("state: 'awaiting-confirm'");
        assertTrue(INDEX_SRC.slice(pos, pos + 160).indexOf('codes: validation.codes') !== -1,
            'коды аномалий сохраняются для пере-показа модалки');
    });

    test('hard-block: запись удаляется из outbox (обе ветки)', () => {
        const n = INDEX_SRC.split('Task 358: валидация отвергла').length - 1;
        assertEqual(n, 2, 'hard-block × 2 (главная + fallback)');
    });

    test('_sendUpdateReading: сигнатура с outboxCid + оба вызова из submitInput', () => {
        assertTrue(INDEX_SRC.indexOf('_sendUpdateReading: function(apiPayload, isEdit, outboxCid)') !== -1,
            'сигнатура 3-аргументная');
        const n = INDEX_SRC.split('self._sendUpdateReading(apiPayload, isEdit, outboxCid);').length - 1;
        assertEqual(n, 2, 'оба вызова передают cid');
    });

    test('_sendUpdateReading: then → удаление (сервер ответил)', () => {
        const m = extractMethod(INDEX_SRC, '_sendUpdateReading');
        const thenPos = m.indexOf('if (outboxCid) self._outboxRemove(outboxCid);');
        assertTrue(thenPos !== -1, 'удаление есть');
        // удаление — в ветке .then, ДО catch
        const catchPos = m.indexOf('}).catch(function(err)');
        assertTrue(catchPos !== -1 && thenPos < catchPos, 'удаление в then-ветке');
    });

    test('_sendUpdateReading: сеть → запись остаётся + честный тост', () => {
        const m = extractMethod(INDEX_SRC, '_sendUpdateReading');
        assertTrue(m.indexOf('_outboxUpdate(outboxCid,') !== -1, 'запись помечается retry');
        assertTrue(m.indexOf('сохранены на устройстве и будут отправлены автоматически') !== -1,
            'тост объясняет, что данные НЕ потеряны');
        assertTrue(m.indexOf('_outboxIsPermanentError') !== -1,
            'SERVER-отказы отделяются от сетевых');
    });

    test('_submitPeriodEntry: write-ahead для «расхода за месяц»', () => {
        const cidPos = INDEX_SRC.indexOf("var outboxCid = 'flp' + Date.now()");
        const apiPos = INDEX_SRC.indexOf('flowmeter.updatePeriodReading\', apiPayload).then');
        assertTrue(cidPos !== -1 && apiPos !== -1, 'обе точки есть');
        assertTrue(cidPos < apiPos, 'outboxAdd до отправки');
        assertTrue(INDEX_SRC.indexOf("kind: 'period'") !== -1, 'kind period');
    });

    test('_submitPeriodEntry: catch классифицирует (сеть — retry, бизнес — удалить)', () => {
        const m = extractMethod(INDEX_SRC, '_submitPeriodEntry');
        assertTrue(m.indexOf("msg.indexOf('Unknown action')") !== -1, 'ветка старого сервера');
        assertTrue(m.indexOf('err._kind === \'SERVER\'') !== -1, 'ветка бизнес-ошибки');
        assertTrue(m.indexOf('_outboxRemove(outboxCid)') !== -1, 'бизнес-ошибка удаляет запись');
    });

    test('confirmAnomalyModal: подтверждение переводит в pending + передаёт cid', () => {
        const m = extractMethod(INDEX_SRC, 'confirmAnomalyModal');
        assertTrue(m.indexOf("this._outboxUpdate(cid, { state: 'pending'") !== -1,
            'запись активируется');
        assertTrue(m.indexOf('this._sendUpdateReading(payload, isEdit, cid)') !== -1,
            'cid передан в отправку');
    });

    test('cancelAnomalyModal: осознанная отмена удаляет запись', () => {
        const m = extractMethod(INDEX_SRC, 'cancelAnomalyModal');
        assertTrue(m.indexOf('this._outboxRemove(this._pendingCid)') !== -1,
            'запись удаляется из outbox');
    });

    test('renderList: недоставленные — цвет значения (Task 367, баннер убран)', () => {
        // Task 367: баннер над списком убран по заявке («упростить ещё»);
        // вместо него жёлто-оранжевый цвет ЗНАЧЕНИЙ карточек
        assertTrue(INDEX_SRC.indexOf('.flow-outbox-banner {') === -1,
            'CSS баннера удалён (Task 367)');
        assertTrue(INDEX_SRC.indexOf('this._outboxBannerText(') === -1,
            'хелпер текста баннера больше не вызывается');
        const rl = INDEX_SRC.indexOf('renderList: function');
        const zone = INDEX_SRC.slice(rl, rl + 9000);
        assertTrue(zone.indexOf('flow-summary-val-pending') !== -1,
            'класс недоставленных значений в рендере');
        const pend = zone.indexOf('flow-summary-val-pending');
        const due = zone.indexOf('flow-summary-val-due');
        assertTrue(pend !== -1 && due !== -1 && pend < due,
            'проверка pending идёт РАНЬШЕ красного (приоритет Task 367)');
    });

    test('init: флаш + слушатели online/visibility', () => {
        const init = extractMethod(INDEX_SRC, 'init');
        const i = INDEX_SRC.indexOf('init: function', INDEX_SRC.indexOf('var FlowmeterData = {'));
        // Task 497: блок мгновенного рендера избранного (~800 симв.)
        // в середине init — флаш/watchers у конца, окно 4000 → 5000.
        const initSrc = INDEX_SRC.slice(i, i + 5000);
        assertTrue(initSrc.indexOf("this._ensureOutboxWatchers()") !== -1, 'watchers в init');
        assertTrue(initSrc.indexOf("this._flushOutbox('init')") !== -1, 'флаш в init');
    });

    test('глобально: pagehide → beacon, beforeunload → предупреждение', () => {
        const ph = INDEX_SRC.indexOf("window.addEventListener('pagehide'");
        assertTrue(ph !== -1, 'pagehide слушатель есть');
        assertTrue(INDEX_SRC.slice(ph, ph + 300).indexOf('_outboxFlushBeacons') !== -1,
            'pagehide зовёт beacon-флаш');
        const bu = INDEX_SRC.indexOf("window.addEventListener('beforeunload', function(ev) {\n        try {\n            if (typeof FlowmeterData !== 'undefined' &&\n                FlowmeterData._outboxCount() > 0)");
        assertTrue(bu !== -1, 'beforeunload предупреждает при недоставленных');
    });

    test('_outboxFlushBeacons: awaiting-confirm НЕ отправляется за пользователя', () => {
        const m = extractMethod(INDEX_SRC, '_outboxFlushBeacons');
        assertTrue(m.indexOf("e.state === 'awaiting-confirm'") !== -1,
            'неподтверждённые записи пропускаются');
        assertTrue(m.indexOf('payload.token = token') !== -1, 'токен вкладывается в payload');
    });

    test('_flushOutbox: дедуп до отправки (list + archive)', () => {
        const m = extractMethod(INDEX_SRC, '_flushOutbox');
        assertTrue(m.indexOf("'flowmeter.list'") !== -1, 'дедуп day по meters');
        assertTrue(m.indexOf("'flowmeter.archive'") !== -1, 'дедуп period по архиву');
        assertTrue(m.indexOf('e.state === \'awaiting-confirm\'') !== -1,
            'флаш останавливается на неподтверждённой записи');
    });
});

describe('Task 358 — SRC: Electron (десктопы)', () => {
    test('main.js: перехват close → флаш → destroy (если electron/ есть)', () => {
        if (!fs.existsSync(MAIN_JS_PATH)) {
            assertTrue(true, 'веб-репо — electron/main.js нет, проверка только в десктопах');
            return;
        }
        const js = fs.readFileSync(MAIN_JS_PATH, 'utf-8');
        assertTrue(js.indexOf("win.on('close'") !== -1, 'слушатель close');
        assertTrue(js.indexOf('e.preventDefault()') !== -1, 'закрытие задерживается');
        assertTrue(js.indexOf('_outboxFlushBeacons') !== -1, 'renderer получает шанс флеша');
        assertTrue(js.indexOf('win.destroy()') !== -1, 'окно разрушается после флеша');
        assertTrue(js.indexOf('1200') !== -1, 'страховочный таймаут ≤1.2 c');
        assertTrue(js.indexOf("app.on('before-quit'") !== -1,
            'before-quit не ломает autoInstallOnAppQuit');
    });
});

// ============================================================
// VM-тесты: изолированные методы с моками
// ============================================================

// --- мок localStorage ---
function mockStorage() {
    const store = {};
    return {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
        __store: store
    };
}

// Миксин outbox-методов (без DOM/сети) — с реальным ключом журнала
function outboxMixin() {
    const names = ['_outboxLoad', '_outboxSave', '_outboxAdd', '_outboxRemove',
                   '_outboxUpdate', '_outboxCount', '_outboxIsPermanentError'];
    const parts = names.map(n => extractMethod(INDEX_SRC, n)).filter(Boolean);
    if (parts.length !== names.length) return null;
    const ctx = { localStorage: mockStorage(), JSON, Math, Date };
    vm.createContext(ctx);
    vm.runInContext('var M = { _OUTBOX_KEY: ' + JSON.stringify('kip8_flow_outbox_v1') +
                    ', ' + parts.join(',') + ' };', ctx);
    return ctx.M;
}

describe('Task 358 — VM: журнал outbox (localStorage)', () => {
    test('add → count; повторный cid — замена, не дубль', () => {
        const M = outboxMixin();
        M._outboxAdd({ cid: 'a1', kind: 'day', payload: { id: 2 }, state: 'pending' });
        M._outboxAdd({ cid: 'b2', kind: 'day', payload: { id: 3 }, state: 'pending' });
        assertEqual(M._outboxCount(), 2, 'две записи');
        M._outboxAdd({ cid: 'a1', kind: 'day', payload: { id: 9 }, state: 'retry' });
        assertEqual(M._outboxCount(), 2, 'тот же cid — замена');
        const entries = M._outboxLoad();
        assertEqual(entries[0].payload.id, 9, 'payload заменён');
        assertEqual(entries[0].state, 'retry', 'state заменён');
    });

    test('update патчит только свою запись; remove чистит', () => {
        const M = outboxMixin();
        M._outboxAdd({ cid: 'a1', payload: { id: 2 }, state: 'pending' });
        M._outboxAdd({ cid: 'b2', payload: { id: 3 }, state: 'pending' });
        M._outboxUpdate('b2', { state: 'awaiting-confirm', codes: ['JUMP_HIGH: x'] });
        const e = M._outboxLoad();
        assertEqual(e[1].state, 'awaiting-confirm', 'state обновлён');
        assertEqual(e[0].state, 'pending', 'соседняя запись не тронута');
        M._outboxRemove('b2');
        assertEqual(M._outboxCount(), 1, 'после remove — одна');
        assertEqual(M._outboxLoad()[0].cid, 'a1', 'осталась правильная');
    });

    test('битый JSON → [] (не падает); пусто → 0', () => {
        const M = outboxMixin();
        assertEqual(M._outboxCount(), 0, 'пустой журнал');
        const ctx = { localStorage: { getItem: () => '{broken json', setItem: () => {}, removeItem: () => {} }, JSON, Math, Date };
        vm.createContext(ctx);
        const parts = ['_outboxLoad'].map(n => extractMethod(INDEX_SRC, n)).join(',');
        vm.runInContext('var M2 = { _OUTBOX_KEY: ' + JSON.stringify('kip8_flow_outbox_v1') +
                        ', ' + parts + ' };', ctx);
        assertEqual(ctx.M2._outboxLoad().length, 0, 'битый JSON — пустой массив');
    });

    test('quota-ошибка setItem не роняет сохранение', () => {
        const ctx = {
            localStorage: { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} },
            JSON, Math, Date
        };
        vm.createContext(ctx);
        const names = ['_outboxLoad', '_outboxSave', '_outboxAdd', '_outboxCount'];
        const parts = names.map(n => extractMethod(INDEX_SRC, n)).join(',');
        vm.runInContext('var M = { _OUTBOX_KEY: ' + JSON.stringify('kip8_flow_outbox_v1') +
                        ', ' + parts + ' };', ctx);
        ctx.M._outboxAdd({ cid: 'x', payload: {}, state: 'pending' });  // не бросает
        assertTrue(true, 'quota-переполнение пережито молча');
    });
});

describe('Task 358 — VM: классификация ошибок доставки', () => {
    test('SERVER edit_window_expired → окончательная (true)', () => {
        const M = outboxMixin();
        assertTrue(M._outboxIsPermanentError({ _kind: 'SERVER', message: 'edit_window_expired' }) === true,
            'окно правки истекло — ретраить бессмысленно');
    });
    test('SERVER not_your_input → окончательная (true)', () => {
        const M = outboxMixin();
        assertTrue(M._outboxIsPermanentError({ _kind: 'SERVER', message: 'not_your_input' }) === true, 'чужой ввод');
    });
    test('SERVER session_expired → НЕ окончательная (после входа уйдёт)', () => {
        const M = outboxMixin();
        assertTrue(M._outboxIsPermanentError({ _kind: 'SERVER', message: 'session_expired' }) === false, 'сессия лечится входом');
    });
    test('SERVER Unknown action → НЕ окончательная (сервер обновят)', () => {
        const M = outboxMixin();
        assertTrue(M._outboxIsPermanentError({ _kind: 'SERVER', message: 'Unknown action: flowmeter.updatePeriodReading' }) === false, 'апгрейд сервера лечит');
    });
    test('NETWORK → НЕ окончательная', () => {
        const M = outboxMixin();
        assertTrue(M._outboxIsPermanentError({ _kind: 'NETWORK', message: 'NETWORK_ERROR: Failed to fetch' }) === false, 'сеть — временна');
        assertTrue(M._outboxIsPermanentError(null) === false, 'null — не ошибка');
    });
});

// --- миксин _sendUpdateReading с моками ---
function sendMixin(apiMock, storage) {
    const names = ['_sendUpdateReading', '_outboxLoad', '_outboxSave', '_outboxAdd',
                   '_outboxRemove', '_outboxUpdate', '_outboxCount', '_outboxIsPermanentError',
                   '_scheduleOutboxRetry'];
    const parts = names.map(n => extractMethod(INDEX_SRC, n)).filter(Boolean);
    if (parts.length !== names.length) return null;
    const toasts = [];
    const timers = [];
    const ctx = {
        localStorage: storage || mockStorage(),
        JSON, Math, Date, console,
        // таймеры НЕ исполняются мгновенно: записываем (рассрочки
        // load() в then-ветке и ретрай-флаш в catch-ветке проверяются
        // фактом записи, а не побочными эффектами)
        setTimeout: function(fn, delay) { timers.push(delay); return 0; },
        KipToast: { show: function(t) { toasts.push(String(t)); } },
        KipAuth: { getToken: () => 'tok' }
    };
    vm.createContext(ctx);
    vm.runInContext('var M = { _OUTBOX_KEY: ' + JSON.stringify('kip8_flow_outbox_v1') +
                    ', ' + parts.join(',') + ' };', ctx);
    ctx.M._api = apiMock;
    ctx.M.load = function() {};
    ctx.M.__toasts = toasts;
    ctx.M.__timers = timers;
    return ctx.M;
}

describe('Task 358 — VM: _sendUpdateReading (контроль доставки)', () => {
    test('сервер ответил успехом → запись удалена из outbox', async () => {
        const M = sendMixin(() => Promise.resolve({}));
        M._outboxAdd({ cid: 'c1', kind: 'day', payload: { id: 2, curr: 95 }, state: 'pending' });
        await M._sendUpdateReading({ id: 2, curr: 95 }, false, 'c1');
        assertEqual(M._outboxCount(), 0, 'запись удалена после ACK');
        assertTrue(M.__toasts.some(t => t.indexOf('Показания сохранены') !== -1), 'тост успеха');
    });

    test('сеть упала → запись ОСТАЛАСЬ (retry) + честный тост', async () => {
        const M = sendMixin(() => Promise.reject({ _kind: 'NETWORK', message: 'NETWORK_ERROR: Failed to fetch' }));
        M._outboxAdd({ cid: 'c2', kind: 'day', payload: { id: 2, curr: 95 }, state: 'pending' });
        await M._sendUpdateReading({ id: 2, curr: 95 }, false, 'c2');
        assertEqual(M._outboxCount(), 1, 'запись не потеряна');
        assertEqual(M._outboxLoad()[0].state, 'retry', 'помечена retry');
        assertTrue(M.__timers.length > 0, 'ретрай-таймер запланирован');
        assertTrue(M.__toasts.some(t => t.indexOf('будут отправлены автоматически') !== -1),
            'тост: данные не потеряны');
    });

    test('сервер окончательно отверг (edit window) → запись удалена', async () => {
        const M = sendMixin(() => Promise.reject({ _kind: 'SERVER', message: 'edit_window_expired' }));
        M._outboxAdd({ cid: 'c3', kind: 'day', payload: { id: 2, curr: 95 }, state: 'pending' });
        await M._sendUpdateReading({ id: 2, curr: 95 }, true, 'c3');
        assertEqual(M._outboxCount(), 0, 'вечный ретрай не копится');
    });

    test('без cid (легаси-вызов) — прежнее поведение, outbox не трогается', async () => {
        const M = sendMixin(() => Promise.resolve({}));
        M._outboxAdd({ cid: 'other', kind: 'day', payload: {}, state: 'pending' });
        await M._sendUpdateReading({ id: 9, curr: 1 }, false, null);
        assertEqual(M._outboxCount(), 1, 'чужая запись не удалена');
    });
});

// --- _outboxFlushBeacons: beacon «последнего шанса» ---
function beaconMixin(storage) {
    const names = ['_outboxLoad', '_outboxSave', '_outboxAdd', '_outboxCount', '_outboxFlushBeacons'];
    const parts = names.map(n => extractMethod(INDEX_SRC, n)).filter(Boolean);
    if (parts.length !== names.length) return null;
    const beacons = [];
    const ctx = {
        localStorage: storage || mockStorage(),
        JSON, Math, Date, console,
        Object: Object,
        KipAuth: {
            getToken: () => 'tok-123',
            sendBeacon: function(action, payload) {
                beacons.push({ action: action, payload: payload });
                return true;
            }
        }
    };
    vm.createContext(ctx);
    vm.runInContext('var M = { _OUTBOX_KEY: ' + JSON.stringify('kip8_flow_outbox_v1') +
                    ', ' + parts.join(',') + ' };', ctx);
    ctx.M.__beacons = beacons;
    return ctx.M;
}

describe('Task 358 — VM: pagehide beacon «последнего шанса»', () => {
    test('pending/retry уходят beacon-ом; awaiting-confirm — НЕТ', () => {
        const M = beaconMixin();
        M._outboxAdd({ cid: 'p1', kind: 'day', payload: { id: 2, curr: 95, isEdit: false }, state: 'pending' });
        M._outboxAdd({ cid: 'p2', kind: 'period', payload: { id: 1, curr: 500, entryType: 'месяц' }, state: 'retry' });
        M._outboxAdd({ cid: 'p3', kind: 'day', payload: { id: 3, curr: 7 }, state: 'awaiting-confirm' });
        const n = M._outboxFlushBeacons();
        assertEqual(n, 2, 'отправлены только подтверждённые пользователем');
        assertEqual(M.__beacons.length, 2, 'beacon вызван дважды');
        assertEqual(M.__beacons[0].action, 'flowmeter.updateReading', 'day → updateReading');
        assertEqual(M.__beacons[1].action, 'flowmeter.updatePeriodReading', 'period → updatePeriodReading');
        assertEqual(M.__beacons[0].payload.token, 'tok-123', 'токен в payload');
        // записи остаются в outbox (ответа нет — доставка не подтверждена)
        assertEqual(M._outboxCount(), 3, 'записи остаются до сверки с сервером');
        assertTrue(M._outboxLoad()[0].beacon > 0, 'beacon-время зафиксировано');
    });

    test('повторный pagehide в течение 60 с НЕ дублирует beacon', () => {
        // Сценарий: закрыл приложение (beacon ушёл) → быстро переоткрыл
        // → снова закрыл (перезагрузка/перемещение). Сервер пишет архив
        // appendRow без дедупа — второй beacon создал бы дубль строки.
        const M = beaconMixin();
        M._outboxAdd({ cid: 'q1', kind: 'day', payload: { id: 2, curr: 95 }, state: 'pending' });
        const n1 = M._outboxFlushBeacons();
        assertEqual(n1, 1, 'первое закрытие — beacon отправлен');
        const n2 = M._outboxFlushBeacons();
        assertEqual(n2, 0, 'быстрое повторное закрытие — beacon подавлен');
        const entries = M._outboxLoad();
        // запись не удаляется: доставки никто не подтверждал
        assertEqual(entries.length, 1, 'запись под защитой outbox');
    });

    test('нет токена → 0 отправок (гость)', () => {
        const names = ['_outboxFlushBeacons', '_outboxLoad'];
        const parts = names.map(n => extractMethod(INDEX_SRC, n)).join(',');
        const ctx = {
            localStorage: mockStorage(), JSON, Math, Date, console, Object,
            KipAuth: { getToken: () => null, sendBeacon: () => true }
        };
        vm.createContext(ctx);
        vm.runInContext('var M = { _OUTBOX_KEY: ' + JSON.stringify('kip8_flow_outbox_v1') +
                        ', ' + parts + ' };', ctx);
        assertEqual(ctx.M._outboxFlushBeacons(), 0, 'гость — нечего отправлять');
    });
});

// --- _flushOutbox: полный цикл дедуп + отправка ---
function flushMixin(apiRoutes, storage) {
    const names = ['_outboxLoad', '_outboxSave', '_outboxAdd', '_outboxRemove',
                   '_outboxUpdate', '_outboxCount', '_outboxIsPermanentError',
                   '_sendOutboxEntry', '_flushOutbox', '_reshowAnomalyModal',
                   '_outboxFlushBeacons',
                   '_outboxCollapseDuplicates'];   // Task 375: свёртка дублей в флаше
    const parts = names.map(n => extractMethod(INDEX_SRC, n)).filter(Boolean);
    if (parts.length !== names.length) return null;
    const toasts = [];
    const calls = [];
    const ctx = {
        localStorage: storage || mockStorage(),
        JSON, Math, Date, console, Object, Promise,
        document: {
            getElementById: () => null,
            visibilityState: 'visible'
        },
        KipToast: { show: function(t) { toasts.push(String(t)); } },
        KipAuth: { getToken: () => 'tok', sendBeacon: () => true }
    };
    vm.createContext(ctx);
    vm.runInContext('var M = { _OUTBOX_KEY: ' + JSON.stringify('kip8_flow_outbox_v1') +
                    ', ' + parts.join(',') + ' };', ctx);
    ctx.M._api = function(action, payload) {
        calls.push({ action: action, payload: payload });
        const h = apiRoutes[action];
        if (!h) return Promise.reject({ _kind: 'SERVER', message: 'Unknown action: ' + action });
        return h(payload);
    };
    ctx.M._METERS = [];
    ctx.M._showAnomalyModal = function() {};
    ctx.M.__toasts = toasts;
    ctx.M.__calls = calls;
    return ctx.M;
}

describe('Task 358 — VM: _flushOutbox (дедуп + доставка)', () => {

    test('дедуб day: beacon дошёл в прошлый раз → повтор НЕ отправляется', async () => {
        // сервер уже содержит показание (curr=95, dateCurr 9/9/2026);
        // Task 376: подтверждение доставки — meters И строка архива
        // (meters-совпадения мало: meters пишется раньше архива)
        const M = flushMixin({
            'flowmeter.list': () => Promise.resolve({
                meters: [{ id: 2, dateCurr: '9/9/2026', curr: 95 }]
            }),
            'flowmeter.archive': () => Promise.resolve({
                records: [{ entryType: 'сутки', dateCurr: '9/9/2026', curr: 95 }]
            })
        });
        M._outboxAdd({
            cid: 'd1', kind: 'day', state: 'retry',
            payload: { id: 2, curr: 95, dateCurr: '9/9/2026', isEdit: false }
        });
        const n = await M._flushOutbox('init');
        assertEqual(n, 0, 'нечего отправлять — уже на сервере');
        assertEqual(M._outboxCount(), 0, 'запись убрана (дубликат не создаётся)');
        const upd = M.__calls.filter(c => c.action === 'flowmeter.updateReading');
        assertEqual(upd.length, 0, 'updateReading НЕ вызывался (архив без дубля)');
    });

    test('доставка: записи нет на сервере → отправляется и убирается', async () => {
        const M = flushMixin({
            'flowmeter.list': () => Promise.resolve({
                meters: [{ id: 2, dateCurr: '9/8/2026', curr: 90 }]
            }),
            'flowmeter.updateReading': () => Promise.resolve({})
        });
        M._outboxAdd({
            cid: 'd2', kind: 'day', state: 'retry',
            payload: { id: 2, curr: 95, dateCurr: '9/9/2026', isEdit: false }
        });
        const n = await M._flushOutbox('online');
        assertEqual(n, 1, 'отправлена одна запись');
        assertEqual(M._outboxCount(), 0, 'журнал пуст после ACK');
        assertTrue(M.__toasts.some(t => t.indexOf('отправлены: 1') !== -1), 'тост доставки');
    });

    test('дедуб period: запись уже в архиве → не дублируется', async () => {
        const M = flushMixin({
            'flowmeter.archive': () => Promise.resolve({
                records: [{ entryType: 'месяц', dateCurr: '8/31/2026', curr: 500 }]
            })
        });
        M._outboxAdd({
            cid: 'd3', kind: 'period', state: 'retry',
            payload: { id: 1, curr: 500, dateCurr: '8/31/2026', entryType: 'месяц' }
        });
        const n = await M._flushOutbox('init');
        assertEqual(n, 0, 'уже доставлено ранее');
        assertEqual(M._outboxCount(), 0, 'запись убрана');
        const upd = M.__calls.filter(c => c.action === 'flowmeter.updatePeriodReading');
        assertEqual(upd.length, 0, 'дубль в архив не создан');
    });

    test('сеть: отправка падает → запись остаётся (не теряется)', async () => {
        const M = flushMixin({
            'flowmeter.list': () => Promise.resolve({
                meters: [{ id: 2, dateCurr: '9/8/2026', curr: 90 }]
            }),
            'flowmeter.updateReading': () => Promise.reject({ _kind: 'NETWORK', message: 'NETWORK_ERROR' })
        });
        M._outboxAdd({
            cid: 'd4', kind: 'day', state: 'retry',
            payload: { id: 2, curr: 95, dateCurr: '9/9/2026', isEdit: false }
        });
        const n = await M._flushOutbox('retry');
        assertEqual(n, 0, 'доставки не было');
        assertEqual(M._outboxCount(), 1, 'запись ждёт следующей попытки');
        assertEqual(M._outboxLoad()[0].state, 'retry', 'состояние retry');
    });

    test('SERVER-отказ (окно правки истекло) → запись убрана, флаш продолжается', async () => {
        const M = flushMixin({
            'flowmeter.list': () => Promise.resolve({ meters: [] }),
            'flowmeter.updateReading': () => Promise.reject({ _kind: 'SERVER', message: 'edit_window_expired' })
        });
        M._outboxAdd({ cid: 'd5', kind: 'day', state: 'retry', payload: { id: 2, curr: 1, isEdit: true } });
        M._outboxAdd({ cid: 'd6', kind: 'day', state: 'retry', payload: { id: 3, curr: 2, isEdit: false } });
        await M._flushOutbox('init');
        assertEqual(M._outboxCount(), 0, 'вечных ретраев не осталось');
    });

    test('порядок сохраняется (несколько записей уходят последовательно)', async () => {
        const sent = [];
        const M = flushMixin({
            'flowmeter.list': () => Promise.resolve({ meters: [] }),
            'flowmeter.updateReading': (p) => { sent.push(p.curr); return Promise.resolve({}); }
        });
        M._outboxAdd({ cid: 's1', kind: 'day', state: 'retry', payload: { id: 2, curr: 10, isEdit: false } });
        M._outboxAdd({ cid: 's2', kind: 'day', state: 'retry', payload: { id: 2, curr: 12, isEdit: false } });
        const n = await M._flushOutbox('init');
        assertEqual(n, 2, 'обе отправлены');
        assertEqual(sent[0], 10, 'первой — ранняя запись');
        assertEqual(sent[1], 12, 'второй — поздняя (порядок ввода)');
    });

    test('гость (нет токена) → тихий выход, записи ждут входа', async () => {
        const storage = mockStorage();
        const allNames = ['_outboxLoad', '_outboxSave', '_outboxAdd', '_outboxRemove',
                          '_outboxUpdate', '_outboxCount', '_outboxIsPermanentError',
                          '_sendOutboxEntry', '_flushOutbox'];
        const parts = allNames.map(n => extractMethod(INDEX_SRC, n)).filter(Boolean).join(',');
        const ctx = {
            localStorage: storage, JSON, Math, Date, console, Object, Promise,
            KipToast: { show: () => {} },
            KipAuth: { getToken: () => null, sendBeacon: () => true }
        };
        vm.createContext(ctx);
        vm.runInContext('var G = { _OUTBOX_KEY: ' + JSON.stringify('kip8_flow_outbox_v1') +
                        ', ' + parts + ' };', ctx);
        ctx.G._api = () => { throw new Error('не должен вызываться без токена'); };
        ctx.G._outboxAdd({ cid: 'g1', kind: 'day', state: 'retry', payload: { id: 2, curr: 1 } });
        const cnt = await ctx.G._flushOutbox('init');
        assertEqual(cnt, 0, 'без токена — ноль отправок');
        assertEqual(ctx.G._outboxCount(), 1, 'запись сохранена до входа');
    });
});

// ============================================================
// SW-версия
// ============================================================
describe('Task 358 — SW: бамп кэша', () => {
    test('CACHE_VERSION = kipia-test-v760', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v760'") !== -1,
            'версия кэша поднята до v587');
    });
    test('нет v586 (старая) и нет v588 (двойной бамп)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v586') === -1, 'старая версия не осталась');
        assertTrue(SW_SRC.indexOf('kipia-test-v761') === -1, 'двойного бампа не было');
    });
});
