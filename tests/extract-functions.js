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
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
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
        setInterval: setInterval,
        clearInterval: clearInterval,
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

module.exports = { extractFunctions, PURE_FUNCTIONS };
