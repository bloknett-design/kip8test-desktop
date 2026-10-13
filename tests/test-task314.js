// tests/test-task314.js
// Task 314 — «.» → символ «·» + фон как пустая ячейка; мероприятия
// «Инструктажи» — маленькими бейджами-«иконками» в ячейках; локальная
// копия данных графика (мгновенное открытие) + кнопка «Обновить».
// Заявка пользователя:
//   «Замени символ кода "." на символ "·", а цвет фона ячейки сделай
//    как в пустых, и напиши код цвета - заменю в таблице. Мероприятия
//    из таблицы "Инструктажи" должны отображаться в ячейках шахматки
//    маленькими бейджами-«иконками». Сделай, что бы последняя
//    загруженная информация по графику работы сохранялась локально в
//    приложении на устройстве пользователя, что бы каждый раз при
//    открытии графика, он открывался моментально без ожидания
//    подгрузки новых данных, а функцию обновления данных графика с
//    подгрузкой новых мероприятий и прочего сделай с помощью кнопки
//    обновления данных графика (не формирования).»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   «.» → «·» (в ПОПАПЕ/select) и фон ПУСТОЙ ячейки — в
//     test-task312.js (Describe Task 312/314) + здесь VM-рендер.
//     Task 356: центральный символ «·» из ЯЧЕЕК убран — «.» и пустые
//     показывают чистый центр (метка «·» — только в попапе/select).
//   Бейджи мероприятий:
//     — статус-мероприятие (И/ОБ/ПЗ/ПР/* основной код) — НЕ большой
//       код: ячейка ПУСТАЯ, событие — сплошной бейдж; события нет —
//       виртуальный бейдж из статуса;
//     — бейджи на днях отсутствия (ОТ/Б/…) — сплошные;
//     — пустая/план ячейка — пунктирные;
//     — смена + событие: код смены + бейдж (Task 303 жив).
//     (строковые инварианты — test-work-events.js; VM-рендер — здесь)
//   Локальная копия + кнопка:
//     — HTML: #wsRefreshBtn (после селектов, до «Сформировать»,
//       ВСЕМ ролям — без hidden); Task 317: возраст данных —
//       в ИНФОРМАЦИОННОМ ОКНЕ #wsRefreshTip (наведение), штамп
//       #wsCacheStamp из бара УДАЛЁН;
//     — CSS: .ws-refresh-btn/.ws-refreshing/@keyframes wsRefreshSpin/
//       .ws-refresh-tip (Task 317); 34px в общем правиле ряда;
//     — JS: ключ kip8_ws_cache_v1; init() открывает из кэша;
//       loadGrid(force): кэш-ветка без сети, сеть после правок
//       (loadGrid(true) ×11 у мутаций), сетка не мигает при
//       обновлении (keepGrid), _cacheWrite после загрузки;
//       refreshData: _loadStatusCodes(true) + loadGrid(true) + тост
//       + блокировка повторных кликов; строка «данные от …» —
//       в тултип (Task 317);
//     — VM-СИМУЛЯЦИЯ кэша: полный/чужой/неполный вид, roundtrip
//       записи, лимит 12 видов, формат даты тултипа, битый JSON;
//     — VM-СИМУЛЯЦИЯ _renderCell: «.»/статус-мероприятие/отсутствие/
//       пустая+событие/смена+событие/план+событие.
//   SW: kipia-test-v733.
//
// Запуск: через tests/run-all.js (require './test-task314.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Вырезка метода WorkSchedule: «имя: function» (отступ 8 пробелов)
// → следующий метод ТОГО ЖЕ уровня. Возвращает текст
// «имя: function(…) {…},» — готовый к оборачиванию в объект.
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    // следующий метод уровня объекта ИЛИ закрывающая скобка модуля
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

// Метод как функция: объект-обёртка с моками localStorage/document
function loadMethod(name, localStorage, document) {
    const text = methodText(INDEX_SRC, name);
    assertTrue(text.indexOf(name + ': function') !== -1,
        'метод ' + name + ' найден в index.html');
    const make = new Function('localStorage', 'document', 'return ({' + text + '\n});');
    return make(localStorage, document)[name];
}

// ------------------------------------------------------------
// HTML: кнопка «Обновить» и штамп в тулбаре
// ------------------------------------------------------------
describe('Task 314 — кнопка «Обновить» + штамп (HTML)', () => {

    test('HTML: #wsRefreshBtn — в ряду селектов, всем ролям', () => {
        const ws = INDEX_SRC.slice(INDEX_SRC.indexOf('id="page-work-schedule"'),
                                    INDEX_SRC.indexOf('id="wsGridWrap"'));
        const iYear = ws.indexOf('id="wsYearSel"');
        const iRefresh = ws.indexOf('id="wsRefreshBtn"');
        const iGen = ws.indexOf('id="wsGenerateBtn"');
        assertTrue(iYear !== -1 && iRefresh !== -1 && iGen !== -1,
            'кнопка есть в тулбаре');
        assertTrue(iYear < iRefresh && iRefresh < iGen,
            '«Обновить» — после селектов месяца/года, до «Сформировать»');
        // кнопка не hidden — обновление доступно и ЗРИТЕЛЯМ
        const btn = ws.slice(iRefresh - 200, iRefresh + 800);
        assertFalse(/id="wsRefreshBtn"[^>]*\shidden/.test(btn),
            'кнопка «Обновить» видна всем ролям (не hidden)');
        assertTrue(btn.indexOf('onclick="WorkSchedule.refreshData()"') !== -1,
            'onclick → WorkSchedule.refreshData()');
        assertTrue(btn.indexOf('>Обновить</button>') !== -1,
            'текст кнопки — «Обновить»');
        assertTrue(btn.indexOf('<svg') !== -1,
            'иконка-стрелка обновления (SVG)');
    });

    test('HTML: тултип #wsRefreshTip — возраст данных по наведению (Task 317)', () => {
        const ws = INDEX_SRC.slice(INDEX_SRC.indexOf('id="page-work-schedule"'),
                                    INDEX_SRC.indexOf('id="wsGridWrap"'));
        const iRefresh = ws.indexOf('id="wsRefreshBtn"');
        const iTip = ws.indexOf('id="wsRefreshTip"');
        assertTrue(iRefresh !== -1 && iTip > iRefresh,
            'информационное окно рядом с кнопкой «Обновить»');
        assertTrue(ws.indexOf('id="wsRefreshTipDate"') !== -1,
            'строка-дата #wsRefreshTipDate (заполняет _updateCacheStamp)');
        assertTrue(ws.indexOf('class="ws-rt-desc"') !== -1,
            'описание кнопки — вторичная строка (бывший title)');
        // штамп ИЗ БАРА УБРАН (заявка Task 317: «данные от …» — в окно)
        assertTrue(ws.indexOf('id="wsCacheStamp"') === -1,
            'штамп #wsCacheStamp из бара удалён');
        assertTrue(INDEX_SRC.indexOf('.ws-cache-stamp') === -1,
            'класс .ws-cache-stamp удалён (мёртвый стиль)');
        const btn = ws.slice(iRefresh - 100, iRefresh + 500);
        assertFalse(/title="[^"]{20,}/.test(btn),
            'нативного длинного title у кнопки больше нет (было бы двойное окно)');
    });

    test('HTML: «Сформировать» жива отдельно (обновление ≠ формирование)', () => {
        const ws = INDEX_SRC.slice(INDEX_SRC.indexOf('id="page-work-schedule"'),
                                    INDEX_SRC.indexOf('id="wsGridWrap"'));
        assertTrue(ws.indexOf('onclick="WorkSchedule.generateYear()"') !== -1,
            '«Сформировать» на месте (генерация — отдельное действие)');
        assertTrue(ws.indexOf('onclick="WorkSchedule.saveAll()"') !== -1,
            '«Сохранить» на месте');
    });
});

// ------------------------------------------------------------
// CSS: стиль кнопки, анимация, штамп, высота ряда
// ------------------------------------------------------------
describe('Task 314 — CSS кнопки/штампа', () => {

    test('CSS: .ws-refresh-btn — нейтральный стиль селектов', () => {
        const re = /\.ws-refresh-btn \{[^}]*background:\s*var\(--bg-tertiary[^}]*cursor:\s*pointer;/;
        assertTrue(re.test(INDEX_SRC), 'кнопка — фон bg-tertiary, курсор');
        assertTrue(INDEX_SRC.indexOf('.ws-refresh-btn:disabled') !== -1,
            'блокировка на время обновления');
    });

    test('CSS: вращение иконки при обновлении + keyframes', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-refresh-btn.ws-refreshing svg') !== -1,
            'правило вращения при классе ws-refreshing');
        const kf = INDEX_SRC.indexOf('@keyframes wsRefreshSpin');
        assertTrue(kf !== -1, 'keyframes wsRefreshSpin');
        assertTrue(INDEX_SRC.slice(kf, kf + 200).indexOf('rotate(360deg)') !== -1,
            'полный оборот');
    });

    test('CSS: единая высота ряда 32px с «Обновить»', () => {
        // Task 324: правило расширено — «Итоги учёта» и вкладки итогов
        // (нижний ряд кнопок) того же роста
        const re = /\.ws-month-sel, \.ws-year-sel, \.ws-generate-btn, \.ws-save-btn,\n\s*\.ws-refresh-btn, \.ws-totals-btn, \.ws-tt-tab \{[^}]*height:\s*32px/;
        assertTrue(re.test(INDEX_SRC), '.ws-refresh-btn в правиле высоты Task 269 (+ Task 324)');
    });

    test('CSS: .ws-refresh-tip — окно по наведению (Task 317)', () => {
        const re = /\.ws-refresh-tip \{[^}]*position:\s*fixed[^}]*pointer-events:\s*none;/;
        assertTrue(re.test(INDEX_SRC), 'fixed, клики проходят сквозь окно');
        assertTrue(INDEX_SRC.indexOf('.ws-refresh-tip[hidden] { display: none; }') !== -1,
            'скрытие [hidden] перекрывает display');
        assertTrue(/\.ws-rt-date \{[^}]*font-weight:\s*700/.test(INDEX_SRC),
            'строка-дата — жирная');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ws-refresh-tip') !== -1,
            'светлая тема окна');
    });
});

// ------------------------------------------------------------
// JS: кэш-скелет (ключ, init, loadGrid(force), мутации, refreshData)
// ------------------------------------------------------------
describe('Task 314 — JS: локальная копия (скелет)', () => {

    test('JS: ключ кэша kip8_ws_cache_v1 + поля состояния', () => {
        assertTrue(INDEX_SRC.indexOf("_wsCacheKey: 'kip8_ws_cache_v1'") !== -1,
            'ключ localStorage (общий для kip8test/kip8 — бэкенд один)');
        assertTrue(INDEX_SRC.indexOf('_cacheTs: 0,') !== -1,
            'поле времени последней загрузки');
        assertTrue(INDEX_SRC.indexOf('_refreshing: false,') !== -1,
            'флаг идущего обновления');
    });

    test('JS: init() открывает график из кэша без сети', () => {
        const init = INDEX_SRC.slice(INDEX_SRC.indexOf('init: function'),
                                     INDEX_SRC.indexOf('_refreshFromUrlState: function'));
        assertTrue(init.indexOf('if (this._restoreCachedView()) {') !== -1,
            'ветка мгновенного открытия');
        assertTrue(/_loadStatusCodes\(\)\.then/.test(init),
            'прежний сетевой путь остался для первого запуска');
    });

    test('JS: loadGrid(force) — кэш-ветка + сеть после загрузки', () => {
        const lg = methodText(INDEX_SRC, 'loadGrid');
        assertTrue(lg.trim().indexOf('loadGrid: function(force)') === 0,
            'сигнатура с параметром force');
        assertTrue(lg.indexOf('if (!force && this._restoreCachedView())') !== -1,
            'без force — сперва локальная копия');
        assertTrue(lg.indexOf('self._cacheWrite();') !== -1,
            'после загрузки из сети — запись в локальную копию');
        assertTrue(lg.indexOf('var keepGrid') !== -1,
            'сетка не мигает при принудительном обновлении');
    });

    test('JS: все 12 мутаций перезагружают ТОЛЬКО из сети (loadGrid(true))', () => {
        // saveAll, генерация ×3, сотрудник, мероприятие ×5, отпуск ×2,
        // увольнение (Task 318) — правки обязаны перечитывать сервер,
        // кэш не подменяет свежее
        // Task 384: +2 — правка данных сотрудника (updateEmployee) и
        // правка периода отпуска (updateVacation) из карточки
        // Task 392: +3 — СИЗ: добавление/правка/удаление записи
        const n = (INDEX_SRC.match(/self\.loadGrid\(true\);/g) || []).length;
        assertEqual(n, 18, '17 мутаций + 1 в refreshData = 18 вызовов loadGrid(true)');
    });

    test('JS: refreshData — кнопка обновления (коды + вид + тост)', () => {
        const rd = methodText(INDEX_SRC, 'refreshData');
        assertTrue(rd.indexOf('if (this._refreshing) return;') !== -1,
            'блокировка повторных кликов');
        assertTrue(rd.indexOf('this._loadStatusCodes(true)') !== -1,
            'тихое обновление справочника кодов (цвета листа)');
        assertTrue(rd.indexOf('self.loadGrid(true)') !== -1,
            'принудительная загрузка вида');
        assertTrue(rd.indexOf('Данные графика обновлены') !== -1,
            'тост об успехе');
        assertTrue(rd.indexOf('ws-refreshing') !== -1,
            'иконка крутится на время обновления');
    });

    test('JS: _loadStatusCodes(quiet) не затирает справочник при сбое', () => {
        const lc = methodText(INDEX_SRC, '_loadStatusCodes');
        assertTrue(lc.trim().indexOf('_loadStatusCodes: function(quiet)') === 0,
            'параметр quiet');
        assertTrue(lc.indexOf('if (quiet && self._STATUS_CODES && self._STATUS_CODES.length) return;') !== -1,
            'сбой сети при обновлении — живой справочник остаётся');
    });

    test('JS: методы кэша существуют (_ymKey/_cacheRead/_restoreCachedView/_restoreFromObj/_cacheWrite/_updateCacheStamp)', () => {
        // Task 476: +_restoreFromObj — общий разбор объекта кэша v1
        // для localStorage- и KipDB-копий (_restoreCachedView вызывает его).
        ['_ymKey', '_cacheRead', '_restoreCachedView', '_restoreFromObj', '_cacheWrite',
         '_updateCacheStamp'].forEach(m => {
            assertTrue(INDEX_SRC.indexOf(m + ': function') !== -1, 'метод ' + m);
        });
    });

    test('JS: loadGrid возвращает промис (кнопка ждёт завершения)', () => {
        const lg = methodText(INDEX_SRC, 'loadGrid');
        assertTrue(lg.indexOf('return Promise.all(') !== -1,
            'сетевой путь возвращает промис');
        assertTrue(lg.indexOf('return Promise.resolve(true);') !== -1,
            'кэш-ветка тоже резолвится');
    });
});

// ------------------------------------------------------------
// VM-СИМУЛЯЦИЯ кэша (localStorage-мок)
// ------------------------------------------------------------
describe('Task 314 — VM: локальная копия (поведение)', () => {

    // мок localStorage
    function mkStore() {
        const map = {};
        return {
            getItem: k => (k in map ? map[k] : null),
            setItem: (k, v) => { map[k] = String(v); },
            removeItem: k => { delete map[k]; },
            _map: map
        };
    }
    // мок document (тултип «данные от …», Task 317: #wsRefreshTipDate)
    function mkDoc() {
        const el = { textContent: '' };
        return { getElementById: id => (id === 'wsRefreshTipDate' ? el : null), _el: el };
    }

    // Task 387: канон справочника — вырезается из index.html
    // (_STATUS_CODES_CANON: [ … ]) скобочным балансом
    function canonCodes() {
        const i = INDEX_SRC.indexOf('_STATUS_CODES_CANON: [');
        if (i === -1) return [];
        const open = INDEX_SRC.indexOf('[', i);
        let depth = 0;
        for (let k = open; k < INDEX_SRC.length; k++) {
            if (INDEX_SRC[k] === '[') depth++;
            else if (INDEX_SRC[k] === ']') {
                depth--;
                if (!depth) return eval(INDEX_SRC.slice(open, k + 1));
            }
        }
        return [];
    }

    function mkCtx(store, doc) {
        const ctx = {
            _year: 2026, _month: 9,
            _wsCacheKey: 'kip8_ws_cache_v1',
            _cacheTs: 0,
            _STATUS_CODES: [], _PATTERNS: [], _EMPLOYEES: [],
            _ENTRIES: [], _TRAININGS: [],
            _VACATIONS: [], _VAC_PAGE: [], _vacYear: null,
            _STATUS_CODES_CANON: canonCodes(),
            _fillStatusSelectCount: 0,
            _fillStatusSelect: function () { this._fillStatusSelectCount++; }
        };
        // Task 476: +_restoreFromObj — разбор объекта кэша вынесен из
        // _restoreCachedView (общий для localStorage- и KipDB-слоёв).
        ['_ymKey', '_cacheRead', '_restoreCachedView', '_restoreFromObj', '_cacheWrite', '_updateCacheStamp',
         '_normalizeStatusCodes', '_normalizeInstrList']
            .forEach(m => { ctx[m] = loadMethod(m, store, doc); });
        return ctx;
    }

    const FULL_CACHE = {
        v: 1,
        codes: [{ code: 'Д', name: 'День', color: '#FFE082' },
                { code: '.', name: 'Плановый выходной день', color: '#EEF0F2' }],
        patterns: [{ 'таб_номер': '017', шаблон: 'ДНВВ' }],
        employees: [{ 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'сменный' }],
        vacations: { '2026': [{ 'таб_номер': '017', 'дата_начала': '2026-07-01',
                                'дата_окончания': '2026-07-14', 'часть': 1 }] },
        views: {
            '2026-09': {
                entries: [{ 'дата': '2026-09-01', 'таб_номер': '017', 'статус': 'Д' }],
                trainings: [{ 'таб_номер': '017', 'тип': 'инструктаж', 'тема': 'ОТ и ПБ' }],
                ts: 1725447600000
            }
        }
    };

    test('пустой localStorage — кэша нет', () => {
        const store = mkStore(), doc = mkDoc();
        const ctx = mkCtx(store, doc);
        assertFalse(ctx._restoreCachedView(), 'нет данных — false');
    });

    test('битый JSON — кэша нет (тихо)', () => {
        const store = mkStore(), doc = mkDoc();
        store.setItem('kip8_ws_cache_v1', '{oops');
        const ctx = mkCtx(store, doc);
        assertFalse(ctx._restoreCachedView(), 'битый JSON — false');
    });

    test('полный кэш текущего вида — состояние поднято', () => {
        const store = mkStore(), doc = mkDoc();
        store.setItem('kip8_ws_cache_v1', JSON.stringify(FULL_CACHE));
        const ctx = mkCtx(store, doc);
        assertTrue(ctx._restoreCachedView(), 'вид 2026-09 восстановлен');
        // Task 387: кэш нормализован — «.» → слот «Выходного» (пустой
        // код, каноническое имя), Д — канонический порядок/имя
        assertEqual(ctx._STATUS_CODES.length, 2, 'коды');
        assertEqual(ctx._STATUS_CODES[0].code, 'Д', 'первый — Д (канонический порядок)');
        assertEqual(ctx._STATUS_CODES[1].code, '', 'второй — «Выходной» (пустой код)');
        assertTrue(ctx._STATUS_CODES[1].name.indexOf('Выходной') !== -1,
            'имя «Выходного» каноническое');
        assertEqual(ctx._EMPLOYEES.length, 1, 'сотрудники');
        assertEqual(ctx._ENTRIES.length, 1, 'записи');
        assertEqual(ctx._TRAININGS.length, 1, 'мероприятия');
        assertEqual(ctx._VACATIONS.length, 1, 'план отпусков');
        assertEqual(ctx._vacYear, 2026, 'год плана');
        assertEqual(ctx._cacheTs, 1725447600000, 'время вида');
        assertEqual(ctx._fillStatusSelectCount, 1, 'select статуса заполнен');
    });

    test('чужой месяц в кэше — вид не восстановлен', () => {
        const store = mkStore(), doc = mkDoc();
        const c = JSON.parse(JSON.stringify(FULL_CACHE));
        c.views = { '2026-08': c.views['2026-09'] };
        store.setItem('kip8_ws_cache_v1', JSON.stringify(c));
        const ctx = mkCtx(store, doc);
        assertFalse(ctx._restoreCachedView(), 'сентября нет — в сеть');
    });

    test('неполный кэш (нет отпусков года) — вид не восстановлен', () => {
        const store = mkStore(), doc = mkDoc();
        const c = JSON.parse(JSON.stringify(FULL_CACHE));
        delete c.vacations;
        store.setItem('kip8_ws_cache_v1', JSON.stringify(c));
        const ctx = mkCtx(store, doc);
        assertFalse(ctx._restoreCachedView(), 'без плана отпусков — в сеть');
    });

    test('_cacheWrite → roundtrip: вид, год, отметка времени', () => {
        const store = mkStore(), doc = mkDoc();
        const ctx = mkCtx(store, doc);
        ctx._STATUS_CODES = FULL_CACHE.codes;
        ctx._PATTERNS = FULL_CACHE.patterns;
        ctx._EMPLOYEES = FULL_CACHE.employees;
        ctx._ENTRIES = FULL_CACHE.views['2026-09'].entries;
        ctx._TRAININGS = FULL_CACHE.views['2026-09'].trainings;
        ctx._VACATIONS = FULL_CACHE.vacations['2026'];
        const before = Date.now();
        ctx._cacheWrite();
        const saved = JSON.parse(store.getItem('kip8_ws_cache_v1'));
        assertTrue(saved && saved.v === 1, 'версия схемы');
        assertEqual(saved.views['2026-09'].entries.length, 1, 'записи вида записаны');
        assertEqual(saved.views['2026-09'].trainings.length, 1, 'мероприятия записаны');
        assertEqual(saved.vacations['2026'].length, 1, 'план года записан');
        assertTrue(saved.views['2026-09'].ts >= before, 'отметка времени свежая');
        assertTrue(ctx._cacheTs >= before, '_cacheTs обновлён');
        // чужие виды/годы не затираются
        const store2 = mkStore(), doc2 = mkDoc();
        const c2 = JSON.parse(JSON.stringify(FULL_CACHE));
        c2.views['2026-08'] = { entries: [], trainings: [], ts: 1 };
        store2.setItem('kip8_ws_cache_v1', JSON.stringify(c2));
        const ctx2 = mkCtx(store2, doc2);
        ctx2._ENTRIES = []; ctx2._TRAININGS = []; ctx2._STATUS_CODES = [];
        ctx2._PATTERNS = []; ctx2._EMPLOYEES = []; ctx2._VACATIONS = [];
        ctx2._cacheWrite();
        const saved2 = JSON.parse(store2.getItem('kip8_ws_cache_v1'));
        assertTrue(!!saved2.views['2026-08'], 'прежний вид 2026-08 не удалён');
    });

    test('лимит 12 видов — самые старые вытесняются', () => {
        const store = mkStore(), doc = mkDoc();
        const c = { v: 1, codes: [], patterns: [], employees: [], vacations: {}, views: {} };
        for (let m = 1; m <= 13; m++) {
            const ym = '2026-' + (m < 10 ? '0' + m : m);
            c.views[ym] = { entries: [], trainings: [], ts: m };
        }
        store.setItem('kip8_ws_cache_v1', JSON.stringify(c));
        const ctx = mkCtx(store, doc);
        ctx._cacheWrite();
        const saved = JSON.parse(store.getItem('kip8_ws_cache_v1'));
        const keys = Object.keys(saved.views);
        assertEqual(keys.length, 12, 'ровно 12 видов');
        assertFalse('2026-01' in saved.views, 'самый старый (ts=1) вытеснен');
        assertTrue('2026-09' in saved.views, 'текущий вид записан');
    });

    test('тултип: «данные от ДД.ММ, ЧЧ:ММ»; без данных — подсказка (Task 317)', () => {
        const store = mkStore(), doc = mkDoc();
        const ctx = mkCtx(store, doc);
        ctx._cacheTs = 0;
        ctx._updateCacheStamp();
        assertEqual(doc._el.textContent, 'локальных данных ещё нет',
            'нет данных — подсказка в окне');
        // 04.09.2026 14:22 по локальному времени объекта Date
        const d = new Date(2026, 8, 4, 14, 22, 0);
        ctx._cacheTs = d.getTime();
        ctx._updateCacheStamp();
        assertEqual(doc._el.textContent, 'данные от 04.09, 14:22',
            'формат даты в информационном окне');
    });

    test('_ymKey — YYYY-MM с ведущим нулём', () => {
        const store = mkStore(), doc = mkDoc();
        const ctx = mkCtx(store, doc);
        assertEqual(ctx._ymKey(), '2026-09', 'сентябрь');
        ctx._month = 12;
        assertEqual(ctx._ymKey(), '2026-12', 'декабрь');
        ctx._month = 1;
        assertEqual(ctx._ymKey(), '2026-01', 'январь с нулём');
    });
});

// ------------------------------------------------------------
// VM-СИМУЛЯЦИЯ _renderCell (чистый центр Task 356, бейджи)
// ------------------------------------------------------------
describe('Task 314 — VM: _renderCell (бейджи мероприятий; Task 356 — без «·»)', () => {

    const CODES = [
        { code: 'Д',  name: 'День',    color: '#FFE082' },
        { code: 'ОТ', name: 'Отпуск',  color: '#ECEFF1' },
        { code: '.',  name: 'Плановый выходной день', color: '#EEF0F2' },
        { code: 'И',  name: 'Инструктаж', color: '#B3E5FC' },
        { code: 'ОБ', name: 'Обучение',  color: '#D1C4E9' }
    ];

    function mkRenderCtx(eventsMap, vacMap) {
        const ctx = {
            _year: 2026, _month: 9, _todayIso: null, _canEdit: true,
            _STATUS_CODES: CODES,
            _EVENT_CODES: ['И', 'ОБ', 'ПЗ', 'ПР', '*'],
            _ABSENCE_CODES: ['ОТ', 'У', 'ОВ', 'Б', 'ПР'],
            _VAC_CODES: ['ОТ', 'У'],
            _eventsAt: function (iso, tab) { return eventsMap[iso] || []; },
            _vacationAt: function (iso, tab) { return vacMap && vacMap[iso] || null; },
            _plannedShiftAt: function () { return null; },
            _statusMeta: function (code) {
                for (var i = 0; i < CODES.length; i++) {
                    if (CODES[i].code === code) return CODES[i];
                }
                return null;
            },
            _calDayOff: function () { return false; },
            _esc: function (s) { return String(s); }
        };
        ctx._renderCell = loadMethod('_renderCell', null, null);
        return ctx;
    }

    const EMP = { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'сменный' };

    function cellHtml(ctx, entry, eventsMap, vacMap) {
        return ctx._renderCell(1, '2026-09-01', EMP, entry, false);
    }

    // главный текст ячейки — до первого дочернего span (бейджи не в счёт)
    function mainText(html) {
        const m = html.match(/onclick="WorkSchedule\.onCellClick[^"]*"[^>]*>([^<]*)</);
        return m ? m[1] : null;
    }

    test('«.» — ячейка как ПУСТАЯ: класс ws-dot-code, без inline-фона, БЕЗ символа (Task 356)', () => {
        const ctx = mkRenderCtx({}, null);
        const html = cellHtml(ctx, { 'статус': '.', 'источник': 'авто', 'переработка': 0 });
        assertTrue(html.indexOf('ws-dot-code') !== -1, 'класс ws-dot-code');
        assertTrue(html.indexOf('ws-status-empty') !== -1, 'вид пустой ячейки');
        assertFalse(/style="background:/.test(html), 'inline-цвет листа НЕ ставится');
        assertEqual(mainText(html), '', 'центр ПУСТ — «·» убрана (Task 356)');
        assertFalse(html.indexOf('·') !== -1, 'символа «·» в ячейке нет вообще');
        assertFalse(/>\.</.test(html), 'точки «.» в тексте ячейки нет');
    });

    test('статус-мероприятие «И» — НЕ большой код: ПУСТОЙ центр + сплошной бейдж', () => {
        // generateMonth пишет И днём события без смены — теперь только бейдж
        const ctx = mkRenderCtx({ '2026-09-01': [{ code: 'И', training: { id: 1 } }] }, null);
        const html = cellHtml(ctx, { 'статус': 'И', 'источник': 'авто', 'переработка': 0 });
        assertEqual(mainText(html), '', 'центр ПУСТ — НЕ «И» и не «·» (Task 356)');
        const b = html.match(/<span class="ws-ev-badge"[^>]*>И<\/span>/);
        assertTrue(!!b, 'сплошной бейдж «И»');
        assertTrue(b && b[0].indexOf('background:#B3E5FC') !== -1,
            'цвет бейджа — из справочника (#B3E5FC)');
        assertFalse(html.indexOf('ws-ev-pending') !== -1, 'НЕ пунктирный (день сформирован)');
    });

    test('статус-мероприятие БЕЗ записи в «Инструктажи» — виртуальный бейдж', () => {
        // событие удалено, строка Записей_графика осталась — день не «слепнет»
        const ctx = mkRenderCtx({}, null);
        const html = cellHtml(ctx, { 'статус': 'И', 'источник': 'авто', 'переработка': 0 });
        assertEqual(mainText(html), '', 'центр ПУСТ — НЕ «И» и не «·» (Task 356)');
        const b = html.match(/<span class="ws-ev-badge"[^>]*>И<\/span>/);
        assertTrue(!!b, 'виртуальный бейдж из статуса');
    });

    test('два мероприятия на дне-событии — оба бейджем', () => {
        const ctx = mkRenderCtx({ '2026-09-01': [
            { code: 'И', training: { id: 1 } }, { code: 'ОБ', training: { id: 2 } }] }, null);
        const html = cellHtml(ctx, { 'статус': 'И', 'источник': 'авто', 'переработка': 0 });
        assertTrue((html.match(/ws-ev-badge/g) || []).length === 2, 'бейджа два: И и ОБ');
        assertTrue(html.indexOf('>И</span>') !== -1 && html.indexOf('>ОБ</span>') !== -1,
            'коды И и ОБ');
    });

    test('день отсутствия (ОТ) + мероприятие — бейдж ТЕПЕРЬ виден (сплошной)', () => {
        // Task 314: раньше скрывался (правило Task 303) — заявка:
        // «мероприятия должны отображаться бейджами-иконками»
        const ctx = mkRenderCtx({ '2026-09-01': [{ code: 'И', training: { id: 3 } }] }, null);
        const html = cellHtml(ctx, { 'статус': 'ОТ', 'источник': 'авто', 'переработка': 0 });
        assertTrue(/>ОТ</.test(html), 'код отпуска — основной');
        const b = html.match(/<span class="ws-ev-badge"[^>]*>И<\/span>/);
        assertTrue(!!b, 'бейдж «И» на дне отсутствия');
        assertFalse(html.indexOf('ws-ev-pending') !== -1, 'сплошной (не пунктир)');
    });

    test('пустая ячейка + мероприятие — СПЛОШНОЙ бейдж с цветом кода (Task 388)', () => {
        const ctx = mkRenderCtx({ '2026-09-01': [{ code: 'И', training: { id: 4 } }] }, null);
        const html = cellHtml(ctx, null);
        assertFalse(html.indexOf('ws-ev-pending') !== -1,
            'пунктирного бейджа нет (Task 388: фон всегда цвет кода)');
        assertTrue(/style="background:/.test(html.match(/<span class="ws-ev-badge[^>]*>/)[0]),
            'заливка цветом кода — и на пустой ячейке');
    });

    test('план отпуска + мероприятие — СПЛОШНОЙ бейдж рядом с «ОТ» (Task 388)', () => {
        const ctx = mkRenderCtx({ '2026-09-01': [{ code: 'И', training: { id: 5 } }] },
                                { '2026-09-01': { 'таб_номер': '017' } });
        const html = cellHtml(ctx, null);
        assertTrue(html.indexOf('>ОТ') !== -1, 'код плана «ОТ»');
        assertFalse(html.indexOf('ws-ev-pending') !== -1,
            'пунктирного бейджа нет (Task 388)');
        assertTrue(/style="background:/.test(html.match(/<span class="ws-ev-badge[^>]*>/)[0]),
            'заливка цветом кода — и на плане отпуска');
    });

    test('смена «Д» + мероприятие — код смены + сплошной бейдж (Task 303 жив)', () => {
        const ctx = mkRenderCtx({ '2026-09-01': [{ code: 'И', training: { id: 6 } }] }, null);
        const html = cellHtml(ctx, { 'статус': 'Д', 'источник': 'авто', 'переработка': 0 });
        assertTrue(/>Д</.test(html), 'код смены — основной');
        assertTrue(/style="background:#FFE082;"/.test(html), 'inline-фон смены');
        const b = html.match(/<span class="ws-ev-badge"[^>]*>И<\/span>/);
        assertTrue(!!b, 'бейдж мероприятия');
    });

    test('обычная пустая ячейка — ПУСТАЯ, без бейджа (Task 356)', () => {
        const ctx = mkRenderCtx({}, null);
        const html = cellHtml(ctx, null);
        assertEqual(mainText(html), '', 'центр ПУСТ — «·» больше нет');
        assertFalse(html.indexOf('·') !== -1, 'символа «·» в ячейке нет вообще');
        assertFalse(html.indexOf('ws-ev-badge') !== -1, 'бейджа нет');
        assertFalse(html.indexOf('ws-dot-code') !== -1, 'ws-dot-code не ставится пустой');
    });

    test('«.» — центр ПУСТ (U+00B7 из ячейки удалён, Task 356)', () => {
        const ctx = mkRenderCtx({}, null);
        const html = cellHtml(ctx, { 'статус': '.', 'источник': 'авто', 'переработка': 0 });
        const t = mainText(html);
        assertTrue(t !== null, 'текст ячейки найден');
        assertEqual(t, '', 'центр ячейки пуст');
        assertFalse(html.indexOf('·') !== -1, 'U+00B7 в HTML ячейки отсутствует');
    });
});

// ------------------------------------------------------------
// Service Worker
// ------------------------------------------------------------
describe('Task 314 — Service Worker', () => {

    test('SW: версия кэша kipia-test-v733', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v733'") !== -1,
            'CACHE_VERSION в sw.js = kipia-test-v733');
        assertFalse(SW_SRC.indexOf('kipia-test-v552') !== -1,
            'старой версии v552 нет');
    });
});
