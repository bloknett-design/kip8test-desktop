// ============================================================
// Task 458 — заявка: «Есть замечание, поверх авто-«д»/«н» не
// ставится в ручную код "Выходной, плановый выходной день". По
// сути авто-«д»/«н» должны функционировать в приложении и на
// сервере, в архивах полностью так же, как и ручные-«д»/«н»».
//
// Реализация (полностью КЛИЕНТСКАЯ, развитие Task 456/457):
//   • _autoDnMaterialize — план авто-«д»/«н» МАТЕРИАЛИЗУЕТСЯ в
//     записи: пустые ячейки плана становятся правками _PENDING
//     (поля — как у ручного ввода; источник «руч» у правки);
//     «Сохранить» → setManualEntry → сервер/архивы/«Год»/другие
//     устройства видят их как обычные ручные записи;
//   • реестр _AUTO_DN_KEYS { 'YYYY-MM': { 'ISO|таб': 1 } } +
//     localStorage ws_auto_dn_keys (_autoDnKeysLoad/_Save/
//     IsKey/_autoDnUnmark): живые ключи — только действующие
//     «д»/«н»; «д»/«н»-правки метку сохраняют (защита от цикла
//     удалить → расставить заново);
//   • «в» (Выходной, пустой код) поверх авто-«д»/«н» — «.»-
//     надгробие (паттерн авто-записей Task 453): запись занимает
//     ячейку, план повторно код НЕ расставит, рендер — пустая
//     белая; БАГ заявки (no-op «в» поверх виртуального слоя)
//     закрыт;
//   • _renderGrid: хук материализации (редакторам; зрители
//     правок не создают) + тост «нажмите Сохранить»;
//   • виртуальный слой Task 456/457 удалён: _renderCell/_printCell/
//     _printModel/_autoDnEntries — записи/правки штатно (см.
//     test-task456/457);
//   • sw.js → kipia-test-v745.
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

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

function methodText(src, name) {
    const m = extractMethod(src, name);
    if (m === null) throw new Error('метод не найден: ' + name);
    return m;
}

// Срез модуля WorkSchedule (имена методов неуникальны в монолите)
const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// ============================================================
// 1. SRC — _autoDnMaterialize: план → правки _PENDING
// ============================================================
describe('Task 458 — SRC: _autoDnMaterialize (материализация)', () => {

    test('метод существует, комментарий-ссылка на заявку над ним', () => {
        const idx = WS_SRC.indexOf('_autoDnMaterialize: function(');
        assertTrue(idx !== -1, 'метод _autoDnMaterialize определён');
        assertTrue(WS_SRC.slice(Math.max(0, idx - 1600), idx)
                       .indexOf('Task 458') !== -1,
            'комментарий-ссылка на заявку Task 458');
        assertTrue(WS_SRC.slice(Math.max(0, idx - 1600), idx)
                       .indexOf('Выходной, плановый выходной день') !== -1,
            'в комментарии — текст заявки (замечание о «в» поверх авто)');
    });

    test('только редакторам: гвард _canEdit первой строкой', () => {
        const fn = methodText(WS_SRC, '_autoDnMaterialize');
        assertTrue(fn.indexOf('if (!this._canEdit) return 0;') !== -1,
            'зрители правок не создают (кнопки «Сохранить» нет)');
    });

    test('только ПОЛНОСТЬЮ пустые ячейки плана', () => {
        const fn = methodText(WS_SRC, '_autoDnMaterialize');
        assertTrue(fn.indexOf('if (pend[k]) continue;') !== -1,
            'правка (в т.ч. __delete) — ячейка занята');
        assertTrue(fn.indexOf("this._serverEntry(parts[0], parts[1])") !== -1,
            'серверная запись — ячейка занята');
    });

    test('поля правки — как у ручного ввода «д»/«н» сменному', () => {
        const fn = methodText(WS_SRC, '_autoDnMaterialize');
        assertTrue(fn.indexOf("'статус': plan[k]") !== -1,
            'статус — код плана («д»/«н»)');
        assertTrue(fn.indexOf("'переработка': 0") !== -1 &&
                   fn.indexOf("'замещает': null") !== -1 &&
                   fn.indexOf("'комментарий': ''") !== -1 &&
                   fn.indexOf("'часы': null") !== -1,
            'чистые поля: переработка 0, без замещения/комментария/часов (сменный — 12 ч по типу)');
    });

    test('реестр: ключи отмечены, реестр сохранён в localStorage', () => {
        const fn = methodText(WS_SRC, '_autoDnMaterialize');
        assertTrue(fn.indexOf('reg[mk][k] = 1;') !== -1,
            'материализованная ячейка попадает в реестр месяца');
        assertTrue(fn.indexOf('this._autoDnKeysSave(mk)') !== -1,
            'реестр записан в localStorage (кросс-сессия «в» поверх)');
    });

    test('_renderGrid: хук материализации + восстановление реестра + тост', () => {
        const fn = methodText(WS_SRC, '_renderGrid');
        assertTrue(fn.indexOf('this._AUTO_DN = this._autoDnPlan();') !== -1,
            'план по-прежнему пересчитывается каждым рендером (Task 456)');
        assertTrue(fn.indexOf('this._autoDnKeysLoad();') !== -1,
            'реестр месяца восстановлен из localStorage');
        assertTrue(fn.indexOf('var autoAdded = this._autoDnMaterialize();') !== -1,
            'материализация — после расчёта плана');
        assertTrue(fn.indexOf('this._updateSaveBtn();') !== -1,
            'кнопка «Сохранить» актуализирована (правки добавлены)');
        assertTrue(fn.indexOf('кодов «д»/«н» (замещение отпуска)') !== -1,
            'тост поясняет происхождение кодов и призыв сохранить');
        assertTrue(fn.indexOf('this._canEdit &&') !== -1,
            'хук — только редакторам');
    });
});

// ============================================================
// 2. SRC — реестр слоя: load/save/isKey/unmark
// ============================================================
describe('Task 458 — SRC: реестр _AUTO_DN_KEYS', () => {

    test('поле _AUTO_DN_KEYS объявлено в состоянии модуля', () => {
        assertTrue(WS_SRC.indexOf('_AUTO_DN_KEYS: {},') !== -1,
            'реестр в состоянии WorkSchedule');
        assertTrue(INDEX_SRC.indexOf('_AUTO_DN: {},') !== -1,
            'поле плана на месте (Task 456)');
    });

    test('_autoDnKeysLoad: localStorage под try/catch, фильтр живых «д»/«н»', () => {
        const fn = methodText(WS_SRC, '_autoDnKeysLoad');
        assertTrue(fn.indexOf("localStorage.getItem('ws_auto_dn_keys')") !== -1,
            'ключ хранилища ws_auto_dn_keys (префикс репозитория — isolateLocalStorage)');
        assertTrue(fn.indexOf('try { raw =') !== -1 && fn.indexOf('catch (e)') !== -1,
            'хранилище недоступно (приватный режим/квота) — не падает');
        assertTrue(fn.indexOf('this._effectiveEntry(pp[0], pp[1])') !== -1,
            'живость ключа — по эффективному статусу ячейки');
        assertTrue(fn.indexOf("st !== 'д' && st !== 'н'") !== -1,
            'восстанавливаются только действующие «д»/«н» (правка поверх — метка не нужна)');
    });

    test('_autoDnKeysSave: merge по месяцам, try/catch', () => {
        const fn = methodText(WS_SRC, '_autoDnKeysSave');
        assertTrue(fn.indexOf("localStorage.setItem('ws_auto_dn_keys'") !== -1,
            'реестр месяца записан');
        assertTrue(fn.indexOf('data[mk] =') !== -1,
            'другие месяцы не затираются (переключение месяцев не теряет реестры)');
        assertTrue(fn.indexOf('catch (e)') !== -1,
            'хранилище недоступно — молча (реестр живёт в памяти)');
    });

    test('_autoDnIsKey: реестр месяца сетки', () => {
        const fn = methodText(WS_SRC, '_autoDnIsKey');
        assertTrue(fn.indexOf('this._year') !== -1 && fn.indexOf('this._month') !== -1,
            'ключ месяца — селекты тулбара (как месяц отчёта Task 455)');
        assertTrue(fn.indexOf('!!(reg[mk] && reg[mk][key])') !== -1,
            'защита от undefined — пустой реестр даёт false');
    });

    test('_autoDnUnmark: снять метку + сохранить реестр', () => {
        const fn = methodText(WS_SRC, '_autoDnUnmark');
        assertTrue(fn.indexOf('delete reg[mk][key];') !== -1,
            'метка удалена из реестра месяца');
        assertTrue(fn.indexOf('this._autoDnKeysSave(mk);') !== -1,
            'изменение записано в localStorage');
    });
});

// ============================================================
// 3. SRC — «в» поверх авто: «.»-надгробие в _applyCellStatus
// ============================================================
describe('Task 458 — SRC: «Выходной» поверх авто-«д»/«н»', () => {

    test('авто-ветка ПЕРВОЙ в пути очистки (до авто-записей Task 453)', () => {
        const fn = methodText(WS_SRC, '_applyCellStatus');
        const iAuto = fn.indexOf('if (autoCell) {');
        const iSrv = fn.indexOf("} else if (server && server.источник === 'авто') {");
        assertTrue(iAuto !== -1 && iSrv !== -1 && iAuto < iSrv,
            'реестр слоя проверяется прежде авто-записей (правка/запись «руч»)');
        assertTrue(fn.indexOf("var autoCell = (typeof this._autoDnIsKey === 'function') &&") !== -1,
            'детект авто-ячейки с гвардом typeof (старые VM-харнессы)');
    });

    test('«.»-надгробие: поля паттерна Task 453 + тост', () => {
        const fn = methodText(WS_SRC, '_applyCellStatus');
        const iAuto = fn.indexOf('if (autoCell) {');
        const iSrv = fn.indexOf("} else if (server && server.источник === 'авто') {");
        const branch = fn.slice(iAuto, iSrv);
        assertTrue(branch.indexOf("'статус': '.'") !== -1,
            'ручной плановый выходной «.» поверх авто (заявка: код «в» ставится)');
        assertTrue(branch.indexOf("'переработка': 0") !== -1 &&
                   branch.indexOf("'замещает': null") !== -1,
            'чистые поля надгробия');
        assertTrue(branch.indexOf('this._autoDnUnmark(key);') !== -1,
            'метка реестра снята (надгробие занимает ячейку)');
        assertTrue(branch.indexOf('Выходной поставлен поверх авто-«д»/«н»') !== -1,
            'тост поясняет и зовёт «Сохранить»');
    });

    test('заявка-цитата в комментарии ветки', () => {
        const fn = methodText(WS_SRC, '_applyCellStatus');
        assertTrue(fn.indexOf('поверх авто-«д»/«н» не ставится') !== -1,
            'цитата замечания заявки');
    });

    test('unmark при ручном коде — только для не-«д»/«н»', () => {
        const fn = methodText(WS_SRC, '_applyCellStatus');
        assertTrue(fn.indexOf("autoCell && code !== 'д' && code !== 'н'") !== -1,
            'иной код поверх — ячейка пользовательская; «д»/«н» метку СОХРАНЯЮТ (защита от цикла)');
        const sf = methodText(WS_SRC, 'submitCellForm');
        assertTrue(sf.indexOf("status !== 'д' && status !== 'н'") !== -1 &&
                   sf.indexOf('this._autoDnUnmark(') !== -1,
            'правка «Дополнительно…» — тот же принцип');
    });

    test('пути без реестра не изменились: ручная запись → __delete, пустая → no-op', () => {
        const fn = methodText(WS_SRC, '_applyCellStatus');
        assertTrue(fn.indexOf("this._PENDING[key] = { __delete: true };") !== -1,
            'ручная серверная запись — планируем удаление (как прежде)');
        assertTrue(fn.indexOf('delete this._PENDING[key]; // ячейка и так пустая') !== -1,
            'пустая ячейка — пустой и остаётся (как прежде)');
    });
});

// ============================================================
// 4. SRC — SW
// ============================================================
describe('Task 458 — SRC: SW kipia-test-v745', () => {
    test('CACHE_VERSION = kipia-test-v745, прежней v681 нет', () => {
        assertTrue(SW_SRC.indexOf("'kipia-test-v745'") !== -1,
            'новая версия SW v682');
        assertEqual(SW_SRC.indexOf("'kipia-test-v681'"), -1,
            'старой версии v681 не осталось');
        assertTrue(SW_SRC.indexOf('Task 458') !== -1,
            'комментарий истории Task 458');
    });
});

// ============================================================
// 5. VM — _autoDnMaterialize: план → правки
// ============================================================
describe('Task 458 — VM: _autoDnMaterialize', () => {

    const PLAN = {
        '2026-10-03|02': 'д',
        '2026-10-08|02': 'н',
        '2026-10-12|03': 'н'   // ячейка с серверной записью — пропуск
    };
    const SERVER_ENTRY = { 'дата': '2026-10-12', 'таб_номер': '03',
                           'статус': 'Д', 'источник': 'авто' };

    function host(opts) {
        opts = opts || {};
        return new Function('return ({' +
            methodText(WS_SRC, '_autoDnMaterialize') + ',' +
            methodText(WS_SRC, '_autoDnKeysSave') + ',' +
            methodText(WS_SRC, '_serverEntry') + ',' +
            '_canEdit: ' + (opts.canEdit !== undefined ? opts.canEdit : true) + ',' +
            '_AUTO_DN: ' + JSON.stringify(opts.plan !== undefined ? opts.plan : PLAN) + ',' +
            '_PENDING: ' + JSON.stringify(opts.pending || {}) + ',' +
            '_AUTO_DN_KEYS: ' + JSON.stringify(opts.keys || {}) + ',' +
            '_ENTRIES: ' + JSON.stringify(opts.entries !== undefined ? opts.entries
                : [SERVER_ENTRY]) + ',' +
            '_year: 2026, _month: 10,' +
            '});')();
    }

    test('план → правки _PENDING с полями ручного ввода + реестр', () => {
        const h = host({});
        const n = h._autoDnMaterialize();
        assertEqual(n, 2, '2 пустые ячейки плана материализованы');
        assertEqual(h._PENDING['2026-10-03|02']['статус'], 'д', 'код дня 3 — «д»');
        assertEqual(h._PENDING['2026-10-08|02']['статус'], 'н', 'код дня 8 — «н»');
        assertEqual(h._PENDING['2026-10-03|02']['переработка'], 0, 'переработки нет');
        assertEqual(h._PENDING['2026-10-03|02']['замещает'], null, 'замещения нет');
        assertEqual(h._PENDING['2026-10-03|02']['комментарий'], '', 'комментарий пуст');
        assertEqual(h._PENDING['2026-10-03|02']['часы'], null, 'часов нет (сменный — 12 по типу)');
        assertEqual(h._AUTO_DN_KEYS['2026-10']['2026-10-03|02'], 1, 'ключ в реестре месяца');
        assertEqual(h._AUTO_DN_KEYS['2026-10']['2026-10-08|02'], 1, 'второй ключ в реестре');
    });

    test('занятые ячейки пропускаются: серверная запись/правка/битый ключ', () => {
        const h = host({
            pending: { '2026-10-08|02': { 'статус': 'Б' } },
            plan: {
                '2026-10-03|02': 'д',
                '2026-10-08|02': 'н',        // правка пользователя
                '2026-10-12|03': 'н',        // серверная запись
                'битый-ключ': 'д'
            }
        });
        assertEqual(h._autoDnMaterialize(), 1, 'материализована только день 3');
        assertEqual(h._PENDING['2026-10-08|02']['статус'], 'Б',
            'правка пользователя не тронута');
        assertEqual(h._PENDING['2026-10-12|03'], undefined,
            'серверная запись не перекрывается');
    });

    test('зритель (_canEdit=false) и пустой план — 0 правок', () => {
        assertEqual(host({ canEdit: false })._autoDnMaterialize(), 0,
            'зрители правок не создают');
        assertEqual(host({ plan: {} })._autoDnMaterialize(), 0,
            'пустой план — нечего материализовывать');
    });

    test('идемпотентность: повторный вызов — 0 (занятые правками)', () => {
        const h = host({});
        assertEqual(h._autoDnMaterialize(), 2, 'первый проход — 2');
        assertEqual(h._autoDnMaterialize(), 0, 'повторный — 0 (правки уже стоят)');
        assertEqual(h._PENDING['2026-10-03|02']['статус'], 'д', 'правка не задублирована');
    });
});

// ============================================================
// 6. VM — реестр: load (фильтр живых д/н) / save (merge) / unmark
// ============================================================
describe('Task 458 — VM: реестр слоя (localStorage)', () => {

    const SAVED = { '2026-10': {
        '2026-10-03|02': 1,   // живой «д» — восстановить
        '2026-10-08|02': 1,   // «.»-надгробие — не восстанавливать
        '2026-10-19|02': 1,   // «Б» поверх — не восстанавливать
        'битый': 1             // повреждённый ключ — пропуск
    } };

    // мини-localStorage для VM (Node без DOM)
    function shim() {
        const store = {};
        return {
            getItem: function(k) { return store[k] !== undefined ? store[k] : null; },
            setItem: function(k, v) { store[k] = String(v); },
            _dump: function() { return store; }
        };
    }

    function regHost(store, effMap) {
        return new Function('localStorage', 'return ({' +
            methodText(WS_SRC, '_autoDnKeysLoad') + ',' +
            methodText(WS_SRC, '_autoDnKeysSave') + ',' +
            methodText(WS_SRC, '_autoDnIsKey') + ',' +
            methodText(WS_SRC, '_autoDnUnmark') + ',' +
            '_effectiveEntry: function(iso, tab) {' +
            '    var st = ' + JSON.stringify(effMap || {}) + '[iso + "|" + tab];' +
            '    return st ? { "статус": st } : null;' +
            '},' +
            '_AUTO_DN_KEYS: {},' +
            '_year: 2026, _month: 10,' +
            '});')(store);
    }

    test('load: живые только действующие «д»/«н»', () => {
        const ls = shim();
        ls.setItem('ws_auto_dn_keys', JSON.stringify(SAVED));
        const h = regHost(ls, {
            '2026-10-03|02': 'д',    // живой
            '2026-10-08|02': '.',    // надгробие
            '2026-10-19|02': 'Б'     // правка поверх
        });
        h._autoDnKeysLoad();
        assertEqual(h._autoDnIsKey('2026-10-03|02'), true, 'действующий «д» — в реестре');
        assertEqual(h._autoDnIsKey('2026-10-08|02'), false, '«.» — метка не нужна');
        assertEqual(h._autoDnIsKey('2026-10-19|02'), false, '«Б» поверх — ячейка пользовательская');
        assertEqual(h._autoDnIsKey('битый'), false, 'повреждённый ключ пропущен');
    });

    test('load: битый JSON / пустое хранилище — не падает, реестр пуст', () => {
        const ls = shim();
        ls.setItem('ws_auto_dn_keys', '{битый json');
        const h = regHost(ls, {});
        h._autoDnKeysLoad();
        assertEqual(h._autoDnIsKey('2026-10-03|02'), false, 'битый JSON — реестр пуст');
        const h2 = regHost(shim(), {});
        h2._autoDnKeysLoad();
        assertEqual(h2._autoDnIsKey('2026-10-03|02'), false, 'пустое хранилище — реестр пуст');
    });

    test('save: merge по месяцам (другой месяц не затёрт)', () => {
        const ls = shim();
        ls.setItem('ws_auto_dn_keys', JSON.stringify({
            '2026-09': { '2026-09-15|02': 1 }
        }));
        const h = regHost(ls, {});
        h._AUTO_DN_KEYS['2026-10'] = { '2026-10-03|02': 1 };
        h._autoDnKeysSave('2026-10');
        const data = JSON.parse(ls.getItem('ws_auto_dn_keys'));
        assertEqual(data['2026-09']['2026-09-15|02'], 1, 'сентябрьский реестр не затёрт');
        assertEqual(data['2026-10']['2026-10-03|02'], 1, 'октябрьский записан');
    });

    test('unmark: метка снята, реестр сохранён, isKey — false', () => {
        const ls = shim();
        const h = regHost(ls, {});
        h._AUTO_DN_KEYS['2026-10'] = { '2026-10-03|02': 1 };
        h._autoDnUnmark('2026-10-03|02');
        assertEqual(h._autoDnIsKey('2026-10-03|02'), false, 'метка снята');
        const data = JSON.parse(ls.getItem('ws_auto_dn_keys'));
        assertEqual(data['2026-10']['2026-10-03|02'], undefined,
            'снятие записано в хранилище (кросс-сессия)');
        // повторный unmark — no-op
        h._autoDnUnmark('2026-10-03|02');
        assertEqual(h._autoDnIsKey('2026-10-03|02'), false, 'повтор — без ошибок');
    });

    test('save: хранилище недоступно (бросает) — молча, реестр живёт в памяти', () => {
        const bad = {
            getItem: function() { throw new Error('quota'); },
            setItem: function() { throw new Error('quota'); }
        };
        const h = regHost(bad, {});
        h._AUTO_DN_KEYS['2026-10'] = { '2026-10-03|02': 1 };
        h._autoDnKeysSave('2026-10');   // не бросает
        h._autoDnKeysLoad();            // не бросает (merge не ломает память)
        assertEqual(h._autoDnIsKey('2026-10-03|02'), true,
            'недоступное хранилище не роняет работу — реестр живёт в памяти');
    });
});

// ============================================================
// 7. VM — «в» поверх авто: _applyCellStatus
// ============================================================
describe('Task 458 — VM: _applyCellStatus («в» и коды поверх авто)', () => {

    function host(opts) {
        opts = opts || {};
        return new Function('return ({' +
            methodText(WS_SRC, '_applyCellStatus') + ',' +
            methodText(WS_SRC, '_autoDnIsKey') + ',' +
            methodText(WS_SRC, '_autoDnUnmark') + ',' +
            methodText(WS_SRC, '_autoDnKeysSave') + ',' +
            methodText(WS_SRC, '_serverEntry') + ',' +
            '_PENDING: ' + JSON.stringify(opts.pending || {}) + ',' +
            '_AUTO_DN_KEYS: ' + JSON.stringify(opts.keys !== undefined ? opts.keys
                : { '2026-10': { '2026-10-03|02': 1 } }) + ',' +
            '_ENTRIES: ' + JSON.stringify(opts.entries || []) + ',' +
            '_year: 2026, _month: 10,' +
            '});')();
    }

    test('ЗАЯВКА: «в» (code="") поверх авто-«д» → «.»-надгробие, метка снята', () => {
        const h = host({
            pending: { '2026-10-03|02': { 'статус': 'д', 'переработка': 0,
                       'замещает': null, 'комментарий': '', 'часы': null } }
        });
        h._applyCellStatus('2026-10-03', '02', '');
        assertEqual(h._PENDING['2026-10-03|02']['статус'], '.',
            'ручной плановый выходной «.» — код «в» ПОСТАВЛЕН (баг заявки закрыт)');
        assertEqual(h._PENDING['2026-10-03|02']['переработка'], 0, 'переработки нет');
        assertEqual(h._PENDING['2026-10-03|02']['часы'], null, 'часов нет');
        assertEqual(h._autoDnIsKey('2026-10-03|02'), false,
            'метка реестра снята — надгробие занимает ячейку');
    });

    test('«в» поверх СОХРАНЁННОЙ авто-записи «руч» (реестр из localStorage) → «.» upsert', () => {
        const h = host({
            entries: [{ 'дата': '2026-10-03', 'таб_номер': '02',
                        'статус': 'д', 'источник': 'руч' }],
            keys: { '2026-10': { '2026-10-03|02': 1 } }
        });
        h._applyCellStatus('2026-10-03', '02', '');
        assertEqual(h._PENDING['2026-10-03|02']['статус'], '.',
            'не __delete, а «.» — иначе план расставит код заново (setManualEntry upsert)');
        assertEqual(h._PENDING['2026-10-03|02'].__delete, undefined,
            'удаления записи не планируется');
    });

    test('иной код («Б») поверх авто — правка заменена, метка снята', () => {
        const h = host({
            pending: { '2026-10-03|02': { 'статус': 'д', 'переработка': 0,
                       'замещает': null, 'комментарий': '', 'часы': null } }
        });
        h._applyCellStatus('2026-10-03', '02', 'Б');
        assertEqual(h._PENDING['2026-10-03|02']['статус'], 'Б', 'правка пользователя выиграла');
        assertEqual(h._autoDnIsKey('2026-10-03|02'), false, 'ячейка пользовательская');
    });

    test('«д» поверх авто-«д» — метка СОХРАНЕНА (защита «в»-надгробия)', () => {
        const h = host({
            pending: { '2026-10-03|02': { 'статус': 'д', 'переработка': 0,
                       'замещает': null, 'комментарий': '', 'часы': null } }
        });
        h._applyCellStatus('2026-10-03', '02', 'д');
        assertEqual(h._PENDING['2026-10-03|02']['статус'], 'д', 'правка «д» на месте');
        assertEqual(h._autoDnIsKey('2026-10-03|02'), true,
            'метка сохранена — «в» позже даст надгробие, не цикл');
    });

    test('без реестра пути прежние: ручная → __delete, пустая → no-op, авто-запись 453 → «.»', () => {
        // ручная серверная запись без метки
        const h1 = host({
            entries: [{ 'дата': '2026-10-03', 'таб_номер': '02',
                        'статус': 'д', 'источник': 'руч' }],
            keys: {}
        });
        h1._applyCellStatus('2026-10-03', '02', '');
        assertEqual(h1._PENDING['2026-10-03|02'].__delete, true,
            'обычная ручная запись — планируем удаление (как прежде)');
        // пустая ячейка
        const h2 = host({ keys: {} });
        h2._applyCellStatus('2026-10-03', '02', '');
        assertEqual(h2._PENDING['2026-10-03|02'], undefined,
            'пустая ячейка — пустой и остаётся (no-op)');
        // серверная авто-запись Task 453 без правки
        const h3 = host({
            entries: [{ 'дата': '2026-10-03', 'таб_номер': '02',
                        'статус': 'Д', 'источник': 'авто' }],
            keys: {}
        });
        h3._applyCellStatus('2026-10-03', '02', '');
        assertEqual(h3._PENDING['2026-10-03|02']['статус'], '.',
            'авто-запись Task 453 — прежний «.»-путь');
    });
});

// ============================================================
// 8. VM — _renderCell: маркер реестра (инертный, с гвардом)
// ============================================================
describe('Task 458 — VM: _renderCell маркер реестра', () => {

    const CODES = [
        { code: 'д', name: 'День в вых./праздник', color: '#dcecc9' },
        { code: 'н', name: 'Ночь в вых./праздник', color: '#cfd8f5' }
    ];
    const EMP = { 'таб_номер': '02', 'ФИО': 'Белов Б. Б.', 'тип': 'сменный' };

    function cellHost(keys) {
        return new Function('return ({' +
            methodText(WS_SRC, '_renderCell') + ',' +
            methodText(WS_SRC, '_autoDnIsKey') + ',' +
            methodText(WS_SRC, '_statusMeta') + ',' +
            '_vacationAt: function() { return null; },' +
            '_plannedShiftAt: function() { return ""; },' +
            '_eventsAt: function() { return []; },' +
            '_calDayOff: function() { return false; },' +
            '_calWend: function() { return false; },' +
            '_calDayFeast: function() { return false; },' +
            '_instrShortOf: function() { return ""; },' +
            '_esc: function(x) { return String(x); },' +
            '_escAttr: function(x) { return String(x); },' +
            '_canEdit: true,' +
            '_EVENT_CODES: [],' +
            '_VAC_CODES: ["ОТ", "У"],' +
            '_STATUS_CODES: ' + JSON.stringify(CODES) + ',' +
            '_PATTERNS: [],' +
            '_VACATIONS: [],' +
            '_AUTO_DN_KEYS: ' + JSON.stringify(keys || {}) + ',' +
            '_todayIso: "", _hoverDay: null, _selDay: null,' +
            '_year: 2026, _month: 10,' +
            '});')();
    }

    function effEntry(status, source) {
        return { 'статус': status, 'источник': source, 'переработка': 0 };
    }

    test('материализованная правка «д»: вид ручной + маркер ws-auto-dn', () => {
        const h = cellHost({ '2026-10': { '2026-10-03|02': 1 } });
        const td = h._renderCell(3, '2026-10-03', EMP,
            effEntry('д', 'руч'), { 'статус': 'д' });
        assertTrue(td.indexOf('ws-manual-dn') !== -1,
            'рамка ручных д/н — материализованная правка выглядит КАК РУЧНОЙ');
        assertTrue(td.indexOf('ws-source-manual') !== -1,
            'метка источника «руч» (правка) — полный паритет');
        assertTrue(td.indexOf('ws-pending') !== -1, 'правка — янтарная пунктирная рамка');
        assertTrue(td.indexOf('ws-auto-dn') !== -1, 'инертный маркер реестра слоя');
        assertTrue(td.indexOf('>д<') !== -1, 'код «д» в центре ячейки');
    });

    test('ручной «д» БЕЗ реестра — маркера нет (неотличим от обычной записи)', () => {
        const h = cellHost({});
        const td = h._renderCell(3, '2026-10-03', EMP,
            effEntry('д', 'руч'), { 'статус': 'д' });
        assertTrue(td.indexOf('ws-manual-dn') !== -1, 'вид ручного «д» прежний');
        assertEqual(td.indexOf('ws-auto-dn'), -1,
            'маркер ставится ТОЛЬКО по реестру (записи неотличимы — заявка Task 458)');
    });

    test('«.»-надгробие — пустая белая ячейка (код не показывается)', () => {
        const h = cellHost({});
        const td = h._renderCell(3, '2026-10-03', EMP,
            effEntry('.', 'руч'), { 'статус': '.' });
        assertEqual(td.indexOf('>д<'), -1, 'кода нет');
        assertEqual(td.indexOf('ws-dot-code') !== -1, true,
            'маркер «.»-ячейки — рендер пустой белой (Task 314/356)');
    });
});

// ============================================================
// 9. VM — гварды: старые харнессы без методов слоя не падают
// ============================================================
describe('Task 458 — VM: гварды совместимости', () => {

    test('_applyCellStatus без _autoDnIsKey — прежние пути (Task 453)', () => {
        const h = new Function('return ({' +
            methodText(WS_SRC, '_applyCellStatus') + ',' +
            methodText(WS_SRC, '_serverEntry') + ',' +
            '_PENDING: {},' +
            '_ENTRIES: [],' +
            '});')();
        h._applyCellStatus('2026-10-03', '02', 'Б');
        assertEqual(h._PENDING['2026-10-03|02']['статус'], 'Б',
            'код применяется (реестра нет — typeof-гвард)');
        h._applyCellStatus('2026-10-03', '02', '');
        assertEqual(h._PENDING['2026-10-03|02'], undefined,
            'снятие правки — прежний путь');
    });

    test('_renderCell без _autoDnIsKey — ручной «д» без падения', () => {
        const h = new Function('return ({' +
            methodText(WS_SRC, '_renderCell') + ',' +
            methodText(WS_SRC, '_statusMeta') + ',' +
            '_vacationAt: function() { return null; },' +
            '_plannedShiftAt: function() { return ""; },' +
            '_eventsAt: function() { return []; },' +
            '_calDayOff: function() { return false; },' +
            '_calWend: function() { return false; },' +
            '_calDayFeast: function() { return false; },' +
            '_instrShortOf: function() { return ""; },' +
            '_esc: function(x) { return String(x); },' +
            '_escAttr: function(x) { return String(x); },' +
            '_canEdit: true,' +
            '_EVENT_CODES: [],' +
            '_VAC_CODES: ["ОТ", "У"],' +
            '_STATUS_CODES: [{ code: "д", name: "День в вых.", color: "#dcecc9" }],' +
            '_VACATIONS: [], _PATTERNS: [],' +
            '_todayIso: "", _hoverDay: null, _selDay: null,' +
            '});')();
        const td = h._renderCell(3, '2026-10-03',
            { 'таб_номер': '02', 'ФИО': 'Белов Б. Б.', 'тип': 'сменный' },
            { 'статус': 'д', 'источник': 'руч', 'переработка': 0 }, null);
        assertTrue(td.indexOf('>д<') !== -1, 'ручной «д» рендерится (без методов слоя)');
    });
});

// ============================================================
// 10. VM — идемпотентность плана: покрытие дня «д»/«н»
//     (повторный рендер/сохранение НЕ порождает дублей)
// ============================================================
describe('Task 458 — VM: покрытие дня (идемпотентность _autoDnPlan)', () => {

    const PAT_A = { id: 'pa', cycle: 4, days: [
        { day: 1, status: 'Д' }, { day: 2, status: 'Н' },
        { day: 3, status: '' }, { day: 4, status: '' } ] };
    const PAT_BC = { id: 'pbc', cycle: 8, days: [
        { day: 1, status: '' }, { day: 2, status: '' },
        { day: 3, status: '' }, { day: 4, status: 'Д' },
        { day: 5, status: 'Н' }, { day: 6, status: '' },
        { day: 7, status: '' }, { day: 8, status: '' } ] };
    const EMPS = [
        { 'таб_номер': '01', 'ФИО': 'Отпускников О. О.', 'тип': 'сменный',
          'шаблон_ротации': 'pa', 'старт_цикла': '2026-09-01' },
        { 'таб_номер': '02', 'ФИО': 'Белов Б. Б.', 'тип': 'сменный',
          'шаблон_ротации': 'pbc', 'старт_цикла': '2026-09-01' },
        { 'таб_номер': '03', 'ФИО': 'Чернов Ч. Ч.', 'тип': 'сменный',
          'шаблон_ротации': 'pbc', 'старт_цикла': '2026-09-01' }
    ];

    function host(opts) {
        opts = opts || {};
        return new Function('return ({' +
            methodText(WS_SRC, '_autoDnPlan') + ',' +
            methodText(WS_SRC, '_plannedShiftAt') + ',' +
            methodText(WS_SRC, '_totalsEffectiveEntries') + ',' +
            methodText(WS_SRC, '_vacationAt') + ',' +
            methodText(WS_SRC, '_parseIsoLocal') + ',' +
            methodText(WS_SRC, '_isoDate') + ',' +
            '_EMPLOYEES: ' + JSON.stringify(EMPS) + ',' +
            '_ENTRIES: ' + JSON.stringify(opts.entries || []) + ',' +
            '_PENDING: ' + JSON.stringify(opts.pending || {}) + ',' +
            '_VACATIONS: ' + JSON.stringify([{
                'таб_номер': '01', 'дата_начала': '2026-10-01',
                'дата_окончания': '2026-10-31' }]) + ',' +
            '_VAC_CODES: ' + JSON.stringify(['ОТ', 'У']) + ',' +
            '_PATTERNS: ' + JSON.stringify([PAT_A, PAT_BC]) + ',' +
            '_year: 2026, _month: 10,' +
            '});')();
    }

    test('сохранённая «д» дня 3 закрывает потребность: дубля 03-му НЕТ', () => {
        // день 3: смена «Д» отпускника; у 02 уже стоит «д» (сохранённая
        // материализация/ручная) — повторное назначение не нужно
        const plan = host({
            entries: [{ 'дата': '2026-10-03', 'таб_номер': '02',
                        'статус': 'д', 'источник': 'руч' }]
        })._autoDnPlan();
        assertEqual(plan['2026-10-03|03'], undefined,
            'потребность дня закрыта «д» — дубль другому работнику НЕ ставится');
        // соседняя потребность дня 4 («Н») не закрыта — работает штатно
        assertEqual(plan['2026-10-04|03'], 'н',
            'непокрытый тип соседнего дня назначается как обычно');
    });

    test('«н» не закрывает дневную потребность (типы раздельны)', () => {
        const plan = host({
            entries: [{ 'дата': '2026-10-03', 'таб_номер': '02',
                        'статус': 'н', 'источник': 'руч' }]
        })._autoDnPlan();
        assertEqual(plan['2026-10-03|03'], 'д',
            '«н» покрывает только ночную смену — дневная потребность жива');
    });

    test('ИДЕМПОТЕНТНОСТЬ: полный план → материализация → повторный план ПУСТ', () => {
        const h = host({});
        const p1 = h._autoDnPlan();
        assertTrue(Object.keys(p1).length >= 5, 'базовый план непуст (11 в 456-сценарии)');
        // материализация: правки _PENDING, как _autoDnMaterialize
        Object.keys(p1).forEach(function(k) {
            h._PENDING[k] = { 'статус': p1[k], 'переработка': 0,
                              'замещает': null, 'комментарий': '', 'часы': null };
        });
        const p2 = h._autoDnPlan();
        assertEqual(Object.keys(p2).length, 0,
            'повторный расчёт поверх материализованных правок НЕ порождает новых назначений');
        // и повторно ещё раз (после «сохранения» — записи вместо правок)
        const entries = [];
        Object.keys(p1).forEach(function(k) {
            var pp = k.split('|');
            entries.push({ 'дата': pp[0], 'таб_номер': pp[1],
                           'статус': p1[k], 'источник': 'руч' });
        });
        const h2 = host({ entries: entries });
        assertEqual(Object.keys(h2._autoDnPlan()).length, 0,
            'план поверх СОХРАНЁННЫХ записей тоже пуст (нет дублей после сохранения)');
    });

    test('«.»-надгробие НЕ покрытие: смена отпускника требует замены', () => {
        // пользователь снял авто «д» дня 3 у 02 («в» поверх) — смена
        // отпускника не закрыта: план назначает другого кандидата
        const plan = host({
            entries: [{ 'дата': '2026-10-03', 'таб_номер': '02',
                        'статус': '.', 'источник': 'руч' }]
        })._autoDnPlan();
        assertEqual(plan['2026-10-03|03'], 'д',
            'надгробие ячейки 02 — день открыт, назначение уходит 03');
    });
});
