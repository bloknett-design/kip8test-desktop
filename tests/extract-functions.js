// ============================================================
// Извлечение чистых функций из index.html для тестирования
// ============================================================
// Подход:
//   1. Читаем index.html
//   2. Извлекаем все <script> блоки
//   3. Для каждого блока: ищем объявления нужных функций
//      и eval'им их в песочнице с моками DOM
//   4. Возвращаем объект с извлечёнными функциями
//
// Это позволяет тестировать функции БЕЗ изменения index.html —
// мы не выносим их в отдельные файлы (что было бы идеальным
// рефакторингом, но нарушает текущую архитектуру single-file).
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX_HTML = path.resolve(__dirname, '..', 'index.html');

// Список функций, которые мы хотим извлечь
const PURE_FUNCTIONS = [
    // Утилиты
    'parseLocaleNumber',
    'formatNumber',
    'roundNumber',
    'formatBuoyNumber',
    'escHtml',
    'isWorkingUrl',
    'gdriveShareToDirect',
    'getField',
    // Сигналы
    'getSignalRangeAndUnit',
    'calculateSignalValue',
    'getBuoySignalRangeAndUnit',
    'calculateBuoySignalValue',
    // Буи
    'calcBuoyVolume',
    'calcBuoyancyMass',
    // Термосопротивления
    'calcRtdResistance',
    'calcCuResistance',
    // Термопары
    'calcTcVoltage',
    // Диафрагмы
    'convertOpFlowToM3s',
    'convertOpDpToPa',
    // Сапёр (Task 191)
    'msCalcCellSize',
    // Сапёр (Task 192: горизонтальные поля + счёт достижений)
    'msIsDesktopLayout',
    'msEffectiveDims',
    'msDiffLabel',
    'msUpdateDiffLabels',
    'msLoadResults',
    'msSaveResults',
    'msRecordResult',
    'msMigrateResults',
    'msRenderAchievements',
    // Навигация (Task 194: Сапёр — корневой раздел главной)
    'buildBreadcrumbPath',
    // Расходомеры: комментарий к последним показаниям (Task 195)
    'flowCanComment',
    'flowCommentText',
    'flowBuildCommentBtnHtml',
    'flowBuildCommentRowHtml',
    'flowLocalCommentsLoad',
    'flowLocalCommentsSave',
    // Task 197: архив комментариев (preview в meters.P + comment в archive.P)
    'flowBuildArchivedCommentRowHtml',
    // Task 199: валидация показаний расходомера (UX-зеркало серверной
    // ValidationRules.compute) + построение модалки аномалий
    'flowValidateReading',
    '_flowParseDate',
    '_flowFmt',
    'flowBuildAnomalyModalHtml',
    // Task 286/289/290: ввод «расход за месяц» (форма «за неделю»
    // убрана в Task 289) + счётчик «За неделю» из суточных данных
    // последней ПОЛНОЙ недели (Task 290: период + Гкал)
    'flowPrevMonthRange',
    // Task 368: показания за период — границы прошедшей календарной
    // недели (пн–вс) для недельных расходомеров (№3, №11)
    'flowPrevWeekRange',
    'flowWeekCounterStats',
    'flowWeekRangeLabel',
    'flowDateToInputVal',
    'flowDateToMdy',
    'flowEntryTypeAcc',
];

// Мок DOM: минимально достаточный, чтобы функции не падали.
// Чистые функции не должны читать DOM, но на случай если
// getSignalRangeAndUnit() вызывается с st='custom' — там есть
// обращение к document.getElementById('sigMin').
const _mockElements = {};

function _createMockElement(id) {
    // Мок с реальной связью textContent ↔ innerHTML (как в браузере).
    // textContent при записи экранирует HTML-спецсимволы, innerHTML — нет.
    const el = {
        id: id,
        _textContent: '',
        _innerHTML: '',
        value: '',
        style: {},
        classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
        setAttribute: () => {},
        getAttribute: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
        appendChild: () => {},
        removeChild: () => {},
        scrollIntoView: () => {},
        focus: () => {},
        click: () => {}
    };
    // Геттер/сеттер для textContent — имитирует экранирование HTML
    Object.defineProperty(el, 'textContent', {
        get: function() { return this._textContent; },
        set: function(v) {
            const s = String(v === null || v === undefined ? '' : v);
            this._textContent = s;
            // Имитация экранирования, как делает браузер в textContent → innerHTML
            this._innerHTML = s
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(el, 'innerHTML', {
        get: function() { return this._innerHTML; },
        set: function(v) { this._innerHTML = String(v || ''); this._textContent = String(v || ''); },
        enumerable: true,
        configurable: true
    });
    return el;
}

const _mockDocument = {
    getElementById: (id) => {
        if (!_mockElements[id]) _mockElements[id] = _createMockElement(id);
        return _mockElements[id];
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: (tag) => _createMockElement(tag),
    documentElement: { setAttribute: () => {}, getAttribute: () => null },
    body: _createMockElement('body'),
    head: _createMockElement('head')
};

const _mockWindow = {
    innerWidth: 375,
    innerHeight: 812,
    scrollY: 0,
    pageYOffset: 0,
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    addEventListener: () => {},
    scrollTo: () => {},
    close: () => {},
    location: { reload: () => {}, hash: '' }
};

const _mockNavigator = {
    vibrate: () => {},
    serviceWorker: undefined,
    clipboard: { writeText: () => Promise.resolve() }
};

// Task 192: мок localStorage с реальным хранилищем (map), чтобы
// тесты счёта достижений могли писать/читать результаты.
// Для неизвестных ключей getItem возвращает null — поведение прежнего
// заглушечного мока сохранено для остальных тестов.
const _mockStorageData = {};
const _mockLocalStorage = {
    getItem: (k) => (k in _mockStorageData ? _mockStorageData[k] : null),
    setItem: (k, v) => { _mockStorageData[String(k)] = String(v); },
    removeItem: (k) => { delete _mockStorageData[k]; }
};

// Task 192: очистка мок-хранилища между тестами
function clearMockStorage() {
    for (const k of Object.keys(_mockStorageData)) delete _mockStorageData[k];
}

// Task 192: доступ к мок-элементу по id (проверка innerHTML/textContent,
// которые функции записали через getElementById)
function getMockElement(id) {
    return _mockElements[id] || null;
}

// Task 192: прямая запись в мок-хранилище в обход обёртки
// isolateLocalStorage() — для тестов восстановления после мусора
function setMockStorageItem(key, value) {
    _mockStorageData[key] = value;
}

// Task 192: список ключей мок-хранилища (фактический ключ неизвестен
// вызывающему из-за префикса isolateLocalStorage с кратностью обёрток)
function getMockStorageKeys() {
    return Object.keys(_mockStorageData);
}

// Данные, которые нужны функциям (например, rtdData, tcData для calcRtdResistance)
// Будут извлечены из index.html автоматически — они объявлены в тех же <script> блоках.

function extractFunctions() {
    const html = fs.readFileSync(INDEX_HTML, 'utf-8');

    // Извлекаем все <script> блоки (без src атрибута)
    const scriptRegex = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
    let match;
    const scriptContents = [];
    while ((match = scriptRegex.exec(html)) !== null) {
        scriptContents.push(match[1]);
    }

    if (scriptContents.length === 0) {
        throw new Error('Не найдено ни одного <script> блока в index.html');
    }

    // Создаём песочницу с моками
    const sandbox = {
        // Глобальные объекты
        document: _mockDocument,
        window: _mockWindow,
        navigator: _mockNavigator,
        localStorage: _mockLocalStorage,
        console: console,
        // JS встроенные
        Math: Math,
        Date: Date,
        JSON: JSON,
        parseInt: parseInt,
        parseFloat: parseFloat,
        isNaN: isNaN,
        isFinite: isFinite,
        String: String,
        Number: Number,
        Boolean: Boolean,
        Array: Array,
        Object: Object,
        Promise: Promise,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        // Task 325 (флейк-фикс): РЕАЛЬНЫЙ setInterval из eval'а
        // script-блоков переживал песочницу: _startScrollAuditTimer
        // (мок-matchMedia = «мобильный») ставил setInterval(
        // _auditScrollState, 3000), на 3-й секунде (сьют стал длиннее)
        // аудит падал на моке documentElement (нет style) и убивал
        // весь прогон. Периодические таймеры приложения (аудит
        // скролла, heartbeat, проверки связи) извлечённым функциям
        // НЕ нужны — в песочнице это заглушка; setTimeout —
        // НАСТОЯЩИЙ (отложенные реакции функций в тестах).
        setInterval: () => 0,
        clearInterval: () => {},
        // showToast — мок, чтобы функции не падали при ошибке валидации
        showToast: (msg) => { /* no-op */ },
        // Контейнер для извлечённых функций
        __exported: {}
    };

    // Создаём контекст
    vm.createContext(sandbox);

    // Выполняем все script-блоки в песочнице
    for (const script of scriptContents) {
        try {
            vm.runInContext(script, sandbox, { filename: 'index.html-script' });
        } catch (e) {
            // Некоторые блоки могут падать из-за обращения к реальному DOM
            // при загрузке (например, document.addEventListener('DOMContentLoaded')).
            // Это ожидаемо — мы извлекаем функции, а не запускаем приложение.
            // Тихо игнорируем, если функция уже объявлена.
        }
    }

    // Извлекаем нужные функции из песочницы
    const extracted = {};
    for (const fnName of PURE_FUNCTIONS) {
        if (typeof sandbox[fnName] === 'function') {
            extracted[fnName] = sandbox[fnName].bind(sandbox);
        } else {
            console.warn('⚠ Функция не найдена в index.html: ' + fnName);
        }
    }

    return extracted;
}

module.exports = { extractFunctions, PURE_FUNCTIONS, setMockViewport, clearMockStorage, getMockElement, setMockStorageItem, getMockStorageKeys };

// Task 191: изменение размеров мок-вьюпорта для тестов функций,
// зависящих от window.innerWidth (например, msCalcCellSize).
// Все песочницы используют один и тот же объект _mockWindow по ссылке,
// поэтому мутация действует на уже извлечённые функции.
function setMockViewport(width, height) {
    _mockWindow.innerWidth = width;
    if (typeof height === 'number') _mockWindow.innerHeight = height;
}
