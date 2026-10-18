// ============================================================
// Task 401 — заявка: «В десктопной версии приложения, в разделе
// Табель учёта рабочего времени, окно итогов учёта за год должно
// раскрываться полностью закрывая собой шахматку табеля, вплотную
// примыкая к правому краю столбца с фамилиями работников, и в шапке
// окна итогов учёта за год, под числами должно быть пояснение данных
// в ячейках «дней/часов», и три крайних правых столбца (дней, часов,
// перераб. (дни)) выделить фоном немного другого оттенка от остальных
// ячеек со столбцами месяцев, и разделить их вертикальной линией
// таблицы такой же как с левого края окна итогов учёта за год».
//
// 1) ДЕСКТОП, «Год»: шторка = вся ширина правее колонки ФИО
//    (_fitTtDrawer: wsWsBody.clientWidth − --ws-emp-w; класс
//    ws-tt-yearfull снимает кап 60%, таблица 100%, полоса ФИО сетки
//    скрыта — у края окна ЕДИНСТВЕННАЯ линия .ws-tt-edge, ползунок
//    шахматки погашен; ресайз — пересчёт).
// 2) Шапка года — ПОДСТРОКА «дней/часов» (colspan=12, под
//    месяцами; «Работник»/итоговые th — rowspan="2"; главная +
//    архив).
// 3) Итоговые столбцы (Дней/Часов/Перераб.) — ws-tt-sum: фон
//    другого оттенка (th #243048/#b4c1cd; td — тонировка).
// 4) Разделитель 2px слева от «Днев» (ws-tt-sum-edge) — как
//    .ws-tt-edge: #4a8fc7 / #6e8ba4.
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
    return m ? String(m) : '';
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// ============================================================
// 1. SRC — шапка годовой таблицы: подстрока + rowspan + классы
// ============================================================
describe('Task 401 — SRC: шапка года (подстрока «дней/часов» + итоговые столбцы)', () => {

    test('подстрока «дней/часов» — в ОБОИХ шапках (главная + архив)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderTotalsYearTable'));
        assertEqual((fn.match(/<th class="ws-tt-sub" colspan="12">дней\/часов<\/th>/g) || []).length, 2,
            'подстрока-пояснение формата ячеек: главная И архив таблицы');
    });

    test('шапка двухстрочная: «Работник» и итоговые th — rowspan="2"', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderTotalsYearTable'));
        assertEqual((fn.match(/rowspan="2"/g) || []).length, 8,
            '2 таблицы × (Работник + Дней + Часов + Перераб.) = 8 rowspan');
        assertEqual((fn.match(/<th class="ws-tt-emp" rowspan="2"><span class="ws-tt-emp-head"/g) || []).length, 2,
            '«Работник» — rowspan в обеих таблицах');
    });

    test('итоговые th: ws-tt-sum (+ ws-tt-sum-edge у «Днев»)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderTotalsYearTable'));
        assertEqual((fn.match(/<th class="ws-tt-sum ws-tt-sum-edge" rowspan="2">Дней<\/th>/g) || []).length, 2,
            '«Дней» — sum + sum-edge (разделитель 2px слева), обе таблицы');
        assertEqual((fn.match(/<th class="ws-tt-sum" rowspan="2">Часов<\/th>/g) || []).length, 2,
            '«Часов» — sum, обе таблицы');
        assertTrue(fn.indexOf('<th class="ws-tt-sum" rowspan="2" title="дни переработки за год — коды д/н">Перераб. (дни)</th>') !== -1,
            '«Перераб. (дни)» — sum + тултип сохранён');
    });

    test('месяцы шапки — БЕЗ изменений (прежние <th>янв</th>…)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderTotalsYearTable'));
        assertTrue(fn.indexOf("'<th>' + monthsAbbr[h - 1] + '</th>'") !== -1,
            'главная: месяцы прежним тегом (без классов)');
        assertTrue(fn.indexOf("'<th>' + monthsAbbr[h2 - 1] + '</th>'") !== -1,
            'архив: месяцы прежним тегом');
    });

    test('yearRow: итоговые td — классы ws-tt-sum / ws-tt-sum-edge', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderTotalsYearTable'));
        assertTrue(fn.indexOf('<td class="ws-tt-num ws-tt-sum ws-tt-sum-edge">') !== -1,
            'td «Дней» — sum + sum-edge (разделитель слева)');
        assertTrue(fn.indexOf('<td class="ws-tt-num ws-tt-hours ws-tt-sum">') !== -1,
            'td «Часов» — sum');
        assertTrue(fn.indexOf('<td class="ws-tt-num ws-tt-over ws-tt-sum"') !== -1,
            'td «Перераб.» — sum');
    });
});

// ============================================================
// 2. SRC — _fitTtDrawer: полноширинный режим «Года»
// ============================================================
describe('Task 401 — SRC: _fitTtDrawer — год на всю ширину', () => {

    test('условие года: вкладка «year», НЕ страница итогов', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_fitTtDrawer'));
        assertTrue(fn.indexOf("this._totalsTab === 'year'") !== -1 &&
            fn.indexOf('!this._ttPage') !== -1,
            'полный режим — только шторка на вкладке «Год»');
    });

    test('ширина = рабочая область − --ws-emp-w (натуральная ФИО), минимум 240', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_fitTtDrawer'));
        assertTrue(fn.indexOf("getElementById('wsWsBody')") !== -1,
            'рабочая область — #wsWsBody');
        assertTrue(fn.indexOf('wBody.clientWidth') !== -1,
            'шиирина берётся из clientWidth рабочей области');
        assertTrue(fn.indexOf("getPropertyValue('--ws-emp-w')") !== -1,
            'ширина колонки ФИО — из переменной --ws-emp-w (замер _measureEmpCol)');
        assertTrue(fn.indexOf('if (wFull < 240) wFull = 240;') !== -1,
            'минимум 240px (как пустое состояние)');
    });

    test('класс ws-tt-yearfull: ставится в «Году», снимается в остальных', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_fitTtDrawer'));
        assertTrue(fn.indexOf("classList.add('ws-tt-yearfull')") !== -1,
            'год — класс добавляется');
        assertTrue(fn.indexOf("classList.remove('ws-tt-yearfull')") !== -1,
            'месяц/закрытие — класс снимается');
        assertTrue(fn.indexOf('if (full) return;') !== -1,
            'полный режим НЕ меряет таблицу (ранний выход)');
    });

    test('_ttCloseCleanup снимает ws-tt-yearfull', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_ttCloseCleanup'));
        assertTrue(fn.indexOf("classList.remove('ws-tt-yearfull')") !== -1,
            'закрытие шторки возвращает полосу ФИО и ползунок сетки');
    });

    test('_attachFitResize: пересчёт годовой ширины при ресайзе (RO + fallback)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_attachFitResize'));
        const n = (fn.match(/self\._totalsOpen && self\._totalsTab === 'year'/g) || []).length;
        assertEqual(n, 2,
            'годовая шторка переширотивается и в ResizeObserver, и в resize-fallback');
    });
});

// ============================================================
// 3. SRC — CSS: полная ширина, тонировка, разделитель
// ============================================================
describe('Task 401 — SRC: CSS годовой шторки и итоговых столбцов', () => {

    test('ws-tt-yearfull: кап снят, таблица 100%, полоса ФИО скрыта, ползунок погашен', () => {
        const block = INDEX_SRC.match(/#page-work-schedule\.ws-tt-yearfull \.ws-tt-drawer \{[\s\S]*?\n    \}\n    \}/);
        assertTrue(!!block && /max-width:\s*none/.test(block[0]),
            'кап 60% снят у шторки');
        assertTrue(/#page-work-schedule\.ws-tt-yearfull #wsTotalsPanel \.ws-tt-table\.ws-tt-year \{\s*width: 100%;/.test(INDEX_SRC),
            'таблица года растягивается на ширину шторки (только #wsTotalsPanel — не мобильная страница)');
        const after = INDEX_SRC.match(/#page-work-schedule\.ws-tt-yearfull \.ws-grid thead th\.ws-emp-col::after,\s*#page-work-schedule\.ws-tt-yearfull \.ws-grid tbody td\.ws-emp-col::after \{[^}]*display:\s*none/);
        assertTrue(!!after, 'полоса-разделитель ФИО сетки скрыта (у края окна — ЕДИНСТВЕННАЯ линия .ws-tt-edge)');
        assertTrue(/#page-work-schedule\.ws-tt-yearfull \.ws-grid-hbar \.ws-hbar-thumb \{[^}]*display:\s*none\s*!important/.test(INDEX_SRC),
            'ползунок прокрутки шахматки погашен (дни закрыты шторкой)');
    });

    test('подстрока шапки th.ws-tt-sub — компактная, приглушённая', () => {
        const b = INDEX_SRC.match(/\.ws-tt-table\.ws-tt-year th\.ws-tt-sub \{[^}]*\}/);
        assertTrue(!!b && /height:\s*auto/.test(b[0]) && /font-size:\s*10px/.test(b[0]),
            'компактная высота (не 38px базовой шапки), мелкий шрифт');
    });

    test('итоговые столбцы: фон другого оттенка (шапка + ячейки, обе темы)', () => {
        const d = INDEX_SRC.match(/\.ws-tt-table\.ws-tt-year th\.ws-tt-sum \{\s*background:\s*#243048;/);
        assertTrue(!!d, 'шапка тёмная: #243048 (светлее стали #1e293b)');
        const l = INDEX_SRC.match(/\[data-theme="light"\] \.ws-tt-table\.ws-tt-year th\.ws-tt-sum \{\s*background:\s*#b4c1cd;/);
        assertTrue(!!l, 'шапка светлая: #b4c1cd (чуть темнее #bfcad5)');
        const td = INDEX_SRC.match(/\.ws-tt-table\.ws-tt-year td\.ws-tt-sum \{\s*background:\s*rgba\(255, 255, 255, 0\.05\);/);
        assertTrue(!!td, 'ячейки тёмная: тонировка 5% поверх зебры');
        const tdl = INDEX_SRC.match(/\[data-theme="light"\] \.ws-tt-table\.ws-tt-year td\.ws-tt-sum \{\s*background:\s*rgba\(0, 0, 0, 0\.05\);/);
        assertTrue(!!tdl, 'ячейки светлая: тонировка 5%');
    });

    test('разделитель 2px слева от «Днев» — как левый край окна (.ws-tt-edge)', () => {
        const d = INDEX_SRC.match(/\.ws-tt-table\.ws-tt-year th\.ws-tt-sum-edge,\s*\.ws-tt-table\.ws-tt-year td\.ws-tt-sum-edge \{[^}]*border-left:\s*2px solid #4a8fc7;/);
        assertTrue(!!d, 'тёмная: 2px #4a8fc7 (цвет .ws-tt-edge)');
        const l = INDEX_SRC.match(/\[data-theme="light"\] \.ws-tt-table\.ws-tt-year th\.ws-tt-sum-edge,\s*\[data-theme="light"\] \.ws-tt-table\.ws-tt-year td\.ws-tt-sum-edge \{[^}]*border-left-color:\s*#6e8ba4;/);
        assertTrue(!!l, 'светлая: #6e8ba4 (цвет .ws-tt-edge светлой)');
    });
});

// ============================================================
// 4. VM — _fitTtDrawer: полный режим «Года»
// ============================================================
function methodFn(src, name) {
    const txt = methodText(src, name);
    assertTrue(txt.length > 0, 'метод найден: ' + name);
    const obj = new Function('return ({' + txt + '\n});')();
    return obj[name];
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

describe('Task 401 — VM: _fitTtDrawer', () => {

    function fitEnv(opts) {
        const drawer = { style: { width: '', marginRight: 'старое' } };
        const page = {
            classList: { added: [], removed: [],
                add: function(c) { this.added.push(c); },
                remove: function(c) { this.removed.push(c); } }
        };
        const els = {
            wsTotalsDrawer: drawer,
            wsTotalsPanel: { hidden: false },
            'page-work-schedule': page,
            wsWsBody: { clientWidth: opts.bodyW },
            wsTtBody: { querySelector: function() { return opts.table || null; } }
        };
        global.window = {
            matchMedia: function() { return { matches: true }; },
            getComputedStyle: function() {
                return { getPropertyValue: function() { return opts.empW + 'px'; } };
            }
        };
        global.document = mockDoc(els);
        return { drawer: drawer, page: page, els: els };
    }

    test('VM: «Год» — ширина = рабочая область − ФИО, класс добавлен', () => {
        const fn = methodFn(INDEX_SRC, '_fitTtDrawer');
        const env = fitEnv({ bodyW: 1280, empW: 205 });
        try {
            fn.call({ _totalsTab: 'year' });
            assertEqual(env.drawer.style.width, '1075px',
                '1280 − 205 = 1075px — шторка от правого края колонки ФИО');
            assertEqual(JSON.stringify(env.page.classList.added), '["ws-tt-yearfull"]',
                'класс полной ширины поставлен');
            assertEqual(JSON.stringify(env.page.classList.removed), '[]',
                'снятия класса не было');
        } finally {
            delete global.window;
            delete global.document;
        }
    });

    test('VM: «Год» — минимум 240px при узкой рабочей области', () => {
        const fn = methodFn(INDEX_SRC, '_fitTtDrawer');
        const env = fitEnv({ bodyW: 400, empW: 205 });
        try {
            fn.call({ _totalsTab: 'year' });
            assertEqual(env.drawer.style.width, '240px',
                '400 − 205 = 195 < 240 → минимум (как пустое состояние)');
        } finally {
            delete global.window;
            delete global.document;
        }
    });

    test('VM: «Месяц» — прежняя ширина по таблице, класс СНЯТ', () => {
        const fn = methodFn(INDEX_SRC, '_fitTtDrawer');
        const env = fitEnv({ bodyW: 1280, empW: 205,
            table: { getBoundingClientRect: function() { return { width: 442.6 }; } } });
        try {
            fn.call({ _totalsTab: 'month' });
            assertEqual(env.drawer.style.width, '443px',
                'ширина = ceil(таблица месяца) — прежнее поведение Task 329');
            assertEqual(JSON.stringify(env.page.classList.removed), '["ws-tt-yearfull"]',
                'класс полной ширины снят');
        } finally {
            delete global.window;
            delete global.document;
        }
    });

    test('VM: «Год» на СТРАНИЦЕ итогов (_ttPage) — полный режим НЕ включается', () => {
        const fn = methodFn(INDEX_SRC, '_fitTtDrawer');
        const env = fitEnv({ bodyW: 1280, empW: 205,
            table: { getBoundingClientRect: function() { return { width: 300.2 }; } } });
        try {
            fn.call({ _totalsTab: 'year', _ttPage: true });
            assertEqual(env.drawer.style.width, '301px',
                'страница итогов — ширина по таблице (шторку не растягиваем)');
            assertEqual(JSON.stringify(env.page.classList.added), '[]',
                'класс ws-tt-yearfull НЕ ставится (селектор только для шторки)');
        } finally {
            delete global.window;
            delete global.document;
        }
    });

    test('VM: «Год» без рабочей области — мягкий откат к таблице', () => {
        const fn = methodFn(INDEX_SRC, '_fitTtDrawer');
        const env = fitEnv({ bodyW: 0, empW: 205,
            table: { getBoundingClientRect: function() { return { width: 355.5 }; } } });
        try {
            fn.call({ _totalsTab: 'year' });
            assertEqual(env.drawer.style.width, '356px',
                'нет #wsWsBody → прежняя логика по таблице (устойчивость)');
        } finally {
            delete global.window;
            delete global.document;
        }
    });
});

// ============================================================
// 5. VM — рендер годовой таблицы: двухстрочная шапка + классы
// ============================================================
describe('Task 401 — VM: _renderTotalsYearTable — разметка', () => {

    function makeYearHost(yearData, employees) {
        const els = {
            wsTtBody: { innerHTML: '', querySelector: function() { return null; } },
            wsTtWarn: { textContent: '', hidden: true, attrs: {},
                        setAttribute: function(k, v) { this.attrs[k] = v; } }
        };
        const methods = ['_codeHours', '_totalsZero', '_totalsAgg', '_statusMeta',
                         '_empTypeMap', '_overHours', '_fmtTotalsNum', '_esc',
                         '_sortEmployees', '_setTtWarn', '_viewEmployees',
                         '_renderTotalsYearTable'];
        const host = new Function('document', 'return ({' +
            methods.map(function(n) { return methodText(INDEX_SRC, n); }).join(',\n') +
            ',\n' +
            "_view: 'full'," +
            '_year: 2026, _month: 9, _hoverRow: null,' +
            '_applyTtHeadVar: function() { return false; },' +
            '_fitGrid: function() {},' +
            '_syncTotalsRows: function() {},' +
            '_STATUS_CODES: [],' +
            '_EMPLOYEES: ' + JSON.stringify(employees) + ',' +
            '_YEAR_DATA: ' + JSON.stringify(yearData) + ' });')(mockDoc(els));
        return { host: host, els: els };
    }

    const YD = function(extraEmps) {
        return { year: 2026, ts: Date.now(), failed: 0,
            months: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [],
                      9: [ { 'дата': '2026-09-01', 'таб_номер': '0871', 'статус': 'Д' } ],
                      10: [], 11: [], 12: [] },
            employees: [ { 'таб_номер': '0871', 'ФИО': 'Иванов И.И.' } ]
                .concat(extraEmps || []) };
    };

    test('VM: шапка — подстрока «дней/часов» + rowspan + итоговые классы', () => {
        const t = makeYearHost(YD(), [ { 'таб_номер': '0871', 'ФИО': 'Иванов И.И.' } ]);
        t.host._renderTotalsYearTable();
        const h = t.els.wsTtBody.innerHTML;
        assertEqual((h.match(/<tr><th class="ws-tt-sub" colspan="12">дней\/часов<\/th><\/tr>/g) || []).length, 1,
            'подстрока-пояснение под месяцами (главная таблица)');
        assertEqual((h.match(/<th class="ws-tt-emp" rowspan="2"><span class="ws-tt-emp-head"/g) || []).length, 1,
            '«Работник» — rowspan=2');
        assertTrue(h.indexOf('<th class="ws-tt-sum ws-tt-sum-edge" rowspan="2">Дней</th>') !== -1 &&
            h.indexOf('<th class="ws-tt-sum" rowspan="2">Часов</th>') !== -1,
            'итоговые th — классы + rowspan');
        assertTrue(h.indexOf('<td class="ws-tt-num ws-tt-sum ws-tt-sum-edge">1</td>') !== -1,
            'td «Дней» — sum + sum-edge (разделитель слева)');
        assertTrue(/<td class="ws-tt-num ws-tt-hours ws-tt-sum">12<\/td>/.test(h),
            'td «Часов» — sum (12 часов за сентябрь)');
        assertTrue(/ws-tt-over ws-tt-sum/.test(h), 'td «Перераб.» — sum');
        assertEqual((h.match(/<tr>/g) || []).length, 3,
            '3 <tr>: шапка + подстрока + Иванов (без архива)');
    });

    test('VM: архив — та же двухстрочная шапка с подстрокой', () => {
        const t = makeYearHost(YD([ { 'таб_номер': '900', 'ФИО': 'Сидоров С.С.', 'в_архиве': 1 } ]),
            [ { 'таб_номер': '0871', 'ФИО': 'Иванов И.И.' } ]);
        t.host._renderTotalsYearTable();
        const h = t.els.wsTtBody.innerHTML;
        assertEqual((h.match(/<tr><th class="ws-tt-sub" colspan="12">дней\/часов<\/th><\/tr>/g) || []).length, 2,
            'подстрока в ОБОИХ таблицах (главная + архив)');
        assertEqual((h.match(/<th class="ws-tt-emp" rowspan="2"><span class="ws-tt-emp-head"/g) || []).length, 2,
            'rowspan у «Работника» в обеих таблицах');
        assertEqual((h.match(/<tr>/g) || []).length, 6,
            '6 <tr>: (шапка+подстрока+Иванов) + (шапка+подстрока+Сидоров-архив)');
    });
});

// ============================================================
// 6. SW — версия кэша
// ============================================================
describe('Task 401 — SW: версия кэша', () => {
    test('CACHE_VERSION = kipia-test-v751 (Task 401)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v751'") !== -1,
            'фронтенд менялся — кэш поднят до v628');
    });
    test('guard: v629 отсутствует (следующий бамп)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v752') === -1,
            'v629 ещё не существует (guard следующего бампа)');
    });
});
