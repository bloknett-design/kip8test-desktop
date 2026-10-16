// ============================================================
// Task 387 — панель «Обозначения» до 500px; канон справочника
// кодов (порядок по группам + полные наименования) в списках
// выбора; пояснения легенды (−3, «красная рамка… пример - 24*»);
// «Выходной» — пустая белая ячейка без кода-точки.
//
// Заявка: «Скорректируй, панель плавно разворачивается шире (до
// 500px) с подробными наименованиями кодов и секцией пояснений,
// также скорректируй в списках выбора кодов дней и мероприятий с
// правками в описании и в следующей последовательности по группам:
// [16 пунктов]. Удали [3 пояснения]. Измени "Рамка 2px…" на
// "Красная рамка… (пример - 24*)…". В коде "· Выходной, плановый
// выходной день" я убрал точку, теперь просто пустая ячейка белого
// цвета, и в шахматке должно отображаться так же, проверь.»
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');
const INIT_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'StatusCodesInit.gs'), 'utf8');

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

// Канон справочника из index.html (скобочный баланс массива)
function canonCodes() {
    const i = INDEX_SRC.indexOf('_STATUS_CODES_CANON: [');
    if (i === -1) return null;
    const open = INDEX_SRC.indexOf('[', i);
    let depth = 0;
    for (let k = open; k < INDEX_SRC.length; k++) {
        if (INDEX_SRC[k] === '[') depth++;
        else if (INDEX_SRC[k] === ']') {
            depth--;
            if (!depth) return eval(INDEX_SRC.slice(open, k + 1));
        }
    }
    return null;
}

const CANON = canonCodes() || [];

// ============================================================
// 1. SRC — канон справочника и нормализация
// ============================================================

describe('Task 387 — SRC: канон _STATUS_CODES_CANON', () => {

    test('канон существует и содержит 16 кодов', () => {
        assertTrue(CANON !== null && CANON.length === 16,
            '16 канонических кодов (Т-12/Т-13)');
    });

    test('порядок — по группам заявки', () => {
        const order = CANON.map(c => c.code || '«»').join(' ');
        assertEqual(order,
            'Д8 Д7,2 Д Н д н ОТ У ОВ Б «» ПР И ОБ ПЗ *',
            'Д8/Д7,2 → Д/Н/д/н → отпуска → отгул → больничный → выходной → прогул → мероприятия');
    });

    test('Д8/Д7,2 — «в пятницу (предпраздничный день) на час короче»', () => {
        const d8 = CANON.find(c => c.code === 'Д8');
        const d72 = CANON.find(c => c.code === 'Д7,2');
        assertTrue(d8.name.indexOf('8-часовая смена (с 7:30 до 16:30)') !== -1 &&
                   d8.name.indexOf('в пятницу (предпраздничный день) на час короче') !== -1,
            'Д8: полная формулировка заявки');
        assertTrue(d72.name.indexOf('7,2-часовая смена (с 7:30 до 15:48)') !== -1 &&
                   d72.name.indexOf('на час короче') !== -1,
            'Д7,2: полная формулировка заявки');
    });

    test('ОВ — «за ранее отработанное время, без содержания»', () => {
        const ov = CANON.find(c => c.code === 'ОВ');
        assertEqual(ov.name,
            'Отгул, выходные дни (оплачиваемые, за ранее отработанное время, без содержания — с указанием в комментарии)',
            'ОВ: формулировка заявки');
    });

    test('«Выходной» — ПУСТОЙ код, плановый выходной день', () => {
        const wykh = CANON.find(c => c.code === '');
        assertEqual(wykh.name, 'Выходной, плановый выходной день',
            'имя «Выходного»');
        assertEqual(wykh.color, '#EEF0F2', 'цвет справочный (фон ячеек светлой темы)');
        // точки-«.» в каноне больше нет
        assertFalse(CANON.some(c => c.code === '.'),
            'кода «.» в каноне нет (точка убрана заявкой)');
    });

    test('формулировки остальных кодов — полные (заявка; «д»/«н» — Task 524 без «в комментарии»)', () => {
        const byName = {
            'д': 'День, плановая продолжительность работы в выходные и нерабочие праздничные дни, для сменного персонала дневная 12-часовая смена (с 7:30 до 19:30), для дневного персонала — с указанием продолжительности (в часах)',
            'н': 'Ночь, плановая продолжительность работы в выходные и нерабочие праздничные дни, для сменного персонала ночная 12-часовая смена (с 19:30 до 7:30), для дневного персонала — с указанием продолжительности (в часах)',
            'У': 'Учебный отпуск, дополнительный отпуск в связи с обучением с сохранением среднего заработка',
            'ПЗ': 'Проверка знаний, по охране труда и промышленной безопасности, до 1000В, на допуск к самостоятельной работе',
            '*': 'Примечание, не плановые или не регламентированные случаи (аварийные работы, принят, уволен), с обязательным комментированием'
        };
        Object.keys(byName).forEach(code => {
            assertEqual(CANON.find(c => c.code === code).name, byName[code],
                'формулировка «' + code + '»');
        });
    });

    test('_normalizeStatusCodes существует; зовут все три источника', () => {
        assertTrue(INDEX_SRC.indexOf('_normalizeStatusCodes: function') !== -1,
            'метод определён');
        const lsc = methodText(INDEX_SRC, '_loadStatusCodes');
        assertTrue(lsc.indexOf('self._normalizeStatusCodes(data.codes || [])') !== -1,
            'сервер-ответ нормализуется');
        assertTrue(lsc.indexOf('self._normalizeStatusCodes(self._STATUS_CODES_CANON)') !== -1,
            'фолбэк — канон');
        // Task 476: разбор объекта кэша вынесен в _restoreFromObj
        // (общий для localStorage- и KipDB-слоёв).
        const rcv = methodText(INDEX_SRC, '_restoreFromObj');
        assertTrue(rcv.indexOf('this._normalizeStatusCodes(c.codes)') !== -1,
            'кэш localStorage нормализуется (кэш прошлых версий)');
    });

    test('нормализация: слот «Выходного» — «» или легаси-«.»', () => {
        const fn = methodText(INDEX_SRC, '_normalizeStatusCodes');
        assertTrue(fn.indexOf("canon[ci].code === '' && lj === '.'") !== -1,
            'легаси-«.» листа маппится в слот «Выходного»');
        assertTrue(fn.indexOf("if (!entry && canon[ci].code === '')") !== -1,
            '«Выходной» добавляется, даже если его нет в листе');
    });
});

// ============================================================
// 2. SRC — панель 500px + пояснения + «Выходной» без точки
// ============================================================

describe('Task 387 — SRC: панель/пояснения/«Выходной»', () => {

    test('CSS: развёрнутая панель — min(500px, 45vw)', () => {
        const i = INDEX_SRC.indexOf('.ws-legend-drawer.ws-lg-wide .ws-legend-inner {');
        assertTrue(i !== -1, 'правило широкого вида есть');
        const chunk = INDEX_SRC.slice(i, i + 400);
        assertTrue(chunk.indexOf('width: min(500px, 45vw)') !== -1,
            'до 500px (было 400px)');
        assertFalse(chunk.indexOf('min(400px') !== -1, 'старых 400px нет');
    });

    test('CSS: плавность (transition width) жива', () => {
        const inner = INDEX_SRC.indexOf('.ws-legend-inner {');
        const chunk = INDEX_SRC.slice(inner, INDEX_SRC.indexOf('}', inner) + 1);
        assertTrue(chunk.indexOf('transition: width 0.28s ease') !== -1,
            'inner — плавное расширение');
    });

    test('CSS: свотч «Выходного» в легенде — пустая ячейка (обе темы)', () => {
        assertTrue(/\.ws-lg-swatch\.ws-lg-swatch-dot \{[^}]*background:\s*var\(--bg-primary,\s*#1a2233\);/.test(INDEX_SRC),
            'тёмная: var(--bg-primary, #1a2233)');
        assertTrue(/\[data-theme="light"\] \.ws-lg-swatch\.ws-lg-swatch-dot \{[^}]*background:\s*#FFFFFF;/.test(INDEX_SRC),
            'светлая: #FFFFFF (белая пустая, Task 379)');
    });

    test('_legendWidthPx — кап 500', () => {
        const fn = methodText(INDEX_SRC, '_legendWidthPx');
        assertTrue(fn.indexOf('Math.min(500') !== -1, 'min(500, 45vw)');
        assertFalse(fn.indexOf('Math.min(400') !== -1, 'старого капа 400 нет');
    });

    test('пояснения: три удалены, «красная рамка» переозвучена', () => {
        const fn = methodText(INDEX_SRC, '_legendHtml');
        assertFalse(fn.indexOf('<div class="ws-lg-note">Код мероприятия ставится') !== -1,
            '«Код мероприятия… поверх плановой смены» удалено');
        assertFalse(fn.indexOf('<div class="ws-lg-note">В отпусках:') !== -1,
            '«В отпусках: 12 дней (−2 праздн.)…» удалено');
        assertFalse(fn.indexOf('ст. 120 ТК РФ') !== -1, 'ссылки ст. 120/125 ТК РФ нет');
        assertFalse(fn.indexOf('ст. 125 ТК РФ') !== -1, 'лимита 42 дней нет');
        assertFalse(fn.indexOf('<div class="ws-lg-note">Зебра строк') !== -1,
            '«Зебра строк… перекрестье» удалено');
        assertFalse(fn.indexOf('<div class="ws-lg-note">Рамка 2px') !== -1,
            'старой «Рамки 2px» нет');
        assertTrue(fn.indexOf('<div class="ws-lg-note">Красная рамка вокруг группы ячеек — выходные и праздники; «*» у числа (пример - 24*) — сокращённый предпраздничный день.</div>') !== -1,
            'новая формулировка заявки (пример - 24*)');
        // живые пояснения
        assertTrue(fn.indexOf('плановая смена по циклу') !== -1, 'бейдж плановой смены жив');
        assertTrue(fn.indexOf('сегодняшняя дата') !== -1, '«сегодня» живо');
    });

    test('легенда: строка «Выходного» — свотч-пустая ячейка, без кода', () => {
        const fn = methodText(INDEX_SRC, '_legendHtml');
        assertTrue(fn.indexOf("var isDot = (c.code === '.' || c.code === '');") !== -1,
            'детектор «Выходного»');
        assertTrue(fn.indexOf("(isDot ? ' ws-lg-swatch-dot' : '')") !== -1,
            'класс ws-lg-swatch-dot');
        assertTrue(fn.indexOf("this._esc(isDot ? '' : String(c.code || ''))") !== -1,
            'код-символ строки «Выходного» ПУСТ (точка «·» убрана)');
    });

    test('попап: «Выходной» без точки, активен и на легаси-«.»', () => {
        const fn = methodText(INDEX_SRC, '_renderCellPopup');
        assertTrue(fn.indexOf("this._esc(isDot ? '' : c.code)") !== -1,
            'метка ПУСТА');
        assertTrue(fn.indexOf("(current === c.code || (isDot && current === '.'))") !== -1,
            'активная строка: текущий код ИЛИ легаси-«.»');
        assertTrue(fn.indexOf('ws-popup-swatch ws-swatch-dot') !== -1,
            'свотч — фон пустой ячейки');
    });

    test('select «Дополнительно…»: «— выходной —», легаси-«.» маппится', () => {
        const fn = methodText(INDEX_SRC, '_fillStatusSelect');
        assertTrue(fn.indexOf('<option value="">— выходной —</option>') !== -1,
            'первая опция — «— выходной —»');
        assertTrue(fn.indexOf("if (c.code === '' || c.code === '.') continue;") !== -1,
            'дубль-опции «Выходного» не строится');
        assertTrue(fn.indexOf("var cur = (current === '.') ? '' : current;") !== -1,
            'текущий «.» → «— выходной —»');
        const om = methodText(INDEX_SRC, 'openCellForm');
        assertTrue(om.indexOf("if (curStatus === '.') curStatus = '';") !== -1,
            'openCellForm: «.»-запись открывает select на «— выходной —»');
    });

    test('сетка: «.»-ячейка — по-прежнему пустая белая (Task 356 жив)', () => {
        const rc = methodText(INDEX_SRC, '_renderCell');
        assertTrue(rc.indexOf("var isDotCode = (status === '.');") !== -1,
            'детектор «.» в _renderCell');
        assertTrue(rc.indexOf("(showMainCode ? status : (vacPlan ? 'ОТ' : ''))") !== -1,
            '«.» и пустая — чистый центр (без «·»)');
        assertTrue(rc.indexOf("if (isDotCode) classes.push('ws-dot-code');") !== -1,
            'класс-маркер ws-dot-code');
    });

    test('печать: слот «Выходного» удалён вместе с легендой (Task 442)', () => {
        const b = methodText(INDEX_SRC, '_buildPrintHtml');
        assertTrue(b.indexOf("usedCodes['.'])") === -1,
            'фильтра-раскрытия «.» нет — перечня кодов больше нет (Task 442)');
        assertTrue(b.indexOf("codes[ci].name || 'Выходной'") === -1,
            'строки «Выходного» в печати нет');
    });
});

// ============================================================
// 3. SRC — серверные справочники (деплой по DEPLOY-Task387)
// ============================================================

describe('Task 387 — SRC: сервер (WorkSchedule.gs/StatusCodesInit.gs)', () => {

    test('getStatusCodes: строка с пустым кодом не пропускается', () => {
        const i = GS_SRC.indexOf('getStatusCodes: function');
        const chunk = GS_SRC.slice(i, GS_SRC.indexOf('getPatterns: function', i));
        assertTrue(chunk.indexOf('if (!row[0] && !row[1]) continue;') !== -1,
            'пустой код + имя — легитимная строка («Выходной»)');
        assertFalse(chunk.indexOf('if (!row[0]) continue;') !== -1,
            'грубый пропуск «без кода» удалён');
    });

    test('StatusCodesInit.gs: эталон = канон Task 387', () => {
        const i = INIT_SRC.indexOf('var SC_STATUS_CODES = [');
        const j = INIT_SRC.indexOf('];', i);
        const rows = eval('(' + INIT_SRC.slice(i + 'var SC_STATUS_CODES ='.length, j + 1) + ')');
        assertEqual(rows.length, 16, '16 строк');
        assertEqual(rows[0][0], 'Д8', 'первая — Д8');
        assertEqual(rows[1][0], 'Д7,2', 'вторая — Д7,2');
        assertEqual(rows[2][0], 'Д', 'третья — Д (после Д8/Д7,2)');
        assertEqual(rows[10][0], '', '11-я — «Выходной» с ПУСТЫМ кодом');
        assertEqual(rows[10][1], 'Выходной, плановый выходной день', 'имя «Выходного»');
        assertEqual(rows[10][2], '#EEF0F2', 'цвет справочный');
        assertEqual(rows[11][0], 'ПР', 'после «Выходного» — ПР');
        assertEqual(rows[15][0], '*', 'последняя — «*»');
        // формулировки заявки
        assertTrue(rows[0][1].indexOf('на час короче') !== -1, 'Д8 — «на час короче»');
        assertTrue(rows[8][1].indexOf('за ранее отработанное время') !== -1,
            'ОВ — «за ранее отработанное время»');
    });

    test('StatusCodesInit.gs: _scValidateData допускает пустой код', () => {
        const i = INIT_SRC.indexOf('function _scValidateData');
        const chunk = INIT_SRC.slice(i, INIT_SRC.indexOf('\n}', i));
        assertFalse(chunk.indexOf("return 'строка ' + (i + 1) + ': пустой код';") !== -1,
            'отказ «пустой код» удалён');
        assertTrue(chunk.indexOf('seen[code]') !== -1,
            'дубль пустого кода ловится seen-набором');
    });
});

// ============================================================
// 4. VM — нормализация, легенда, попап, select, ширина
// ============================================================

describe('Task 387 — VM: нормализация справочника', () => {

    function mkHost() {
        const ctx = {
            _STATUS_CODES_CANON: CANON,
            _normalizeStatusCodes: null
        };
        vm.createContext(ctx);
        const src = extractMethod(INDEX_SRC, '_normalizeStatusCodes');
        vm.runInContext('globalThis._normalizeStatusCodes = ({' + src + '})._normalizeStatusCodes;', ctx);
        return ctx;
    }

    test('перемешанный лист → канонический порядок, живые цвета', () => {
        const h = mkHost();
        const out = h._normalizeStatusCodes([
            {code:'.',    name:'Выходной, плановый выходной день', color:'#CFD8DC'},
            {code:'ОТ',   name:'Отпуск (старое имя)', color:'#999999'},
            {code:'И',    name:'Инструктаж', color:'#B3E5FC'},
            {code:'Д',    name:'День (старое)', color:'#FFE082'},
            {code:'X7',   name:'Код цеха', color:'#ABCDEF'}
        ]);
        assertEqual(out.map(c => c.code || '«»').join(' '), 'Д ОТ «» И X7',
            'порядок: Д → ОТ → «Выходной» (из «.») → И; неизвестный — в конце');
        assertEqual(out[1].color, '#999999', 'цвет ОТ — живой из листа');
        assertEqual(out[1].name, 'Отпуск, ежегодный основной оплачиваемый отпуск',
            'имя ОТ — каноническое');
        assertEqual(out[0].name, 'День, плановая дневная 12-часовая смена (с 7:30 до 19:30)',
            'имя Д — каноническое');
        assertEqual(out[out.length - 1].name, 'Код цеха', 'неизвестный код — живое имя листа');
    });

    test('лист без строки «Выходного» — слот добавляется', () => {
        const h = mkHost();
        const out = h._normalizeStatusCodes([
            {code:'Д', name:'День', color:'#FFE082'},
            {code:'Н', name:'Ночь', color:'#B0BEC5'}
        ]);
        assertEqual(out.length, 3, 'Д + Н + «Выходной»');
        assertEqual(out[2].code, '', 'слот «Выходного» с пустым кодом');
        assertEqual(out[2].name, 'Выходной, плановый выходной день', 'каноническое имя');
    });

    test('«.» и «» в листе — один слот (дедуп)', () => {
        const h = mkHost();
        const out = h._normalizeStatusCodes([
            {code:'',  name:'Выходной', color:'#CFD8DC'},
            {code:'.', name:'Выходной (легаси)', color:'#EEF0F2'},
            {code:'Д', name:'День', color:'#FFE082'}
        ]);
        assertEqual(out.filter(c => c.code === '').length, 1,
            'ровно один слот «Выходного»');
        assertEqual(out.length, 2, 'Д + «Выходной»');
    });

    test('полный лист (канон Task 298-порядок) → 16, порядок заявки', () => {
        const h = mkHost();
        // «старый» порядок листа: Д, Д8, Д7,2, Н, д, н, ОТ, У, ОВ, Б,
        // ПР, И, ОБ, ПЗ, *, «.» — нормализация переставляет по группам
        const sheet = [
            ['Д', '#FFE082'], ['Д8', '#FFF9C4'], ['Д7,2', '#FFF9C4'],
            ['Н', '#B0BEC5'], ['д', '#FFD54F'], ['н', '#78909C'],
            ['ОТ', '#ECEFF1'], ['У', '#80CBC4'], ['ОВ', '#C5E1A5'],
            ['Б', '#F8BBD0'], ['ПР', '#EF5350'], ['И', '#B3E5FC'],
            ['ОБ', '#D1C4E9'], ['ПЗ', '#FFCDD2'], ['*', '#FFAB91'],
            ['.', '#CFD8DC']
        ].map(r => ({code: r[0], name: 'лист:' + r[0], color: r[1]}));
        const out = h._normalizeStatusCodes(sheet);
        assertEqual(out.length, 16, 'все 16');
        assertEqual(out.slice(0, 4).map(c => c.code).join(' '), 'Д8 Д7,2 Д Н',
            'Д8 и Д7,2 — ПЕРЕД Д (заявка)');
        assertEqual(out[10].code, '', '11-я позиция — «Выходной»');
        assertEqual(out.slice(11).map(c => c.code).join(' '), 'ПР И ОБ ПЗ *',
            'после «Выходного»: ПР → И → ОБ → ПЗ → *');
        assertEqual(out[10].color, '#CFD8DC', 'цвет «Выходного» — из листа (справочный)');
    });

    test('фолбэк (канон) → 16 без изменений', () => {
        const h = mkHost();
        const out = h._normalizeStatusCodes(CANON);
        assertEqual(out.length, 16, '16 кодов офлайна');
        assertEqual(out[10].code, '', 'слот «Выходного» на месте');
    });
});

describe('Task 387 — VM: легенда/попап/select/ширина', () => {

    const HOST_METHODS = [
        '_setLegend', '_renderLegendSheet', '_legendHtml', 'onLegendPageOpen',
        '_legendWidthPx', 'toggleLegendWide', '_applyLegendWide',
        '_renderCellPopup', '_fillStatusSelect', '_esc', '_escAttr',
        '_normalizeStatusCodes'
    ];

    function mkEl() {
        return {
            value: '', textContent: '', innerHTML: '',
            hidden: false, style: {},
            classList: { add() {}, remove() {}, contains() { return false; } },
            setAttribute() {},
            querySelector() { return null; },
            offsetWidth: 0
        };
    }

    function makeHost(desktop, vw, codes) {
        const els = {};
        const document = { getElementById: id => (els[id] || (els[id] = mkEl())) };
        const win = { matchMedia: () => ({ matches: !!desktop }) };
        if (vw) win.innerWidth = vw;
        const ctx = {
            document, window: win,
            Math, Date, String, Number, parseInt, parseFloat, isNaN, isFinite,
            Promise, setTimeout: () => 0
        };
        vm.createContext(ctx);
        const src = HOST_METHODS.map(n => extractMethod(INDEX_SRC, n))
            .filter(Boolean).join(',\n');
        vm.runInContext(`
            var WSM = {
                _legendOpen: false, _legendWide: false,
                _canEdit: true, _popupCell: null,
                _STATUS_CODES: ${JSON.stringify(codes)},
                _STATUS_CODES_CANON: ${JSON.stringify(CANON)},
                _EVENT_CODES: ['И', 'ОБ', 'ПЗ', 'ПР', '*'],
                _EMPLOYEES: [
                    { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'сменный' }
                ],
                _effectiveEntry: function() { return null; },
                _fmtTotalsNum: function(n) { return String(n); },
                // Task 434: заголовок попапа кодов — дата дд.мм.гггг
                _fmtDateRu: function(d) { return String(d); },
                _fitGrid: function() {},
                ${src}
            };
            globalThis.__host = { WSM: WSM, els: function() { return els; } };
        `, ctx, { filename: 'index.html-WS387' });
        ctx.els = els;
        return ctx.__host;
    }

    // «старый» лист (порядок Task 298 + короткие имена + «.»-выходной)
    const SHEET = [
        {code:'Д',    name:'День (старое имя)', color:'#FFE082'},
        {code:'Д8',   name:'День 8-час', color:'#FFF9C4'},
        {code:'Н',    name:'Ночь', color:'#B0BEC5'},
        {code:'ОТ',   name:'Отпуск', color:'#ECEFF1'},
        {code:'.',    name:'Выходной, плановый выходной день', color:'#CFD8DC'},
        {code:'ПР',   name:'Прогул', color:'#EF5350'},
        {code:'И',    name:'Инструктаж', color:'#B3E5FC'}
    ];

    test('легенда: нормализованный лист — порядок/имена/«Выходной»', () => {
        const h = makeHost(true, 0, []);
        h.WSM._STATUS_CODES = h.WSM._normalizeStatusCodes(SHEET);
        h.WSM._setLegend(true);
        const body = h.els().wsLegendBody.innerHTML;
        // порядок дней: Д8 → Д → Н → ОТ → «Выходной» (без д/н/У/ОВ/Б)
        const codes = h.WSM._STATUS_CODES.filter(c => c.code !== 'И' && c.code !== 'ПР')
            .map(c => c.code || 'ВЫХ');
        assertEqual(codes.join(' '), 'Д8 Д Н ОТ ВЫХ', 'дневная секция — порядок заявки');
        // «Выходной»: свотч-пустая ячейка, ПУСТОЙ код-спан, каноническое имя
        const wykhIdx = body.indexOf('ws-lg-swatch-dot');
        assertTrue(wykhIdx !== -1, 'свотч «Выходного» — ws-lg-swatch-dot');
        const wykhRow = body.slice(wykhIdx, wykhIdx + 400);
        assertTrue(wykhRow.indexOf('Выходной, плановый выходной день') !== -1,
            'имя «Выходного»');
        assertFalse(wykhRow.indexOf('·') !== -1, 'точки «·» в строке «Выходного» нет');
        // имена канонические (не листовые)
        assertTrue(body.indexOf('День, плановая дневная 8-часовая смена (с 7:30 до 16:30), в пятницу (предпраздничный день) на час короче') !== -1,
            'Д8 — полная формулировка заявки');
        assertTrue(body.indexOf('Отпуск, ежегодный основной оплачиваемый отпуск') !== -1,
            'ОТ — каноническое имя (не «Отпуск» листа)');
        // живой цвет
        assertTrue(body.indexOf('#FFE082') !== -1, 'цвет Д — живой из листа');
    });

    test('легенда: пояснения — удалённые отсутствуют, новые есть', () => {
        const h = makeHost(true, 0, SHEET);
        h.WSM.onLegendPageOpen();
        const body = h.els().wsLgPageBody.innerHTML;
        assertFalse(body.indexOf('Код мероприятия ставится в угол ячейки') !== -1,
            '«Код мероприятия…» удалено');
        assertFalse(body.indexOf('ст. 120 ТК РФ') !== -1, '«В отпусках…» удалено');
        assertFalse(body.indexOf('Зебра строк') !== -1, '«Зебра строк…» удалено');
        assertTrue(body.indexOf('Красная рамка вокруг группы ячеек — выходные и праздники; «*» у числа (пример - 24*) — сокращённый предпраздничный день.') !== -1,
            'новое пояснение (пример - 24*)');
        assertTrue(body.indexOf('плановая смена по циклу') !== -1, 'бейдж смены жив');
        assertTrue(body.indexOf('сегодняшняя дата') !== -1, '«сегодня» живо');
    });

    test('попап: «Выходной» — пустой код, активен на легаси-«.»', () => {
        const h = makeHost(true, 0, SHEET);   // лист с «.»-строкой (без нормализации)
        // ячейка с легаси-«.»: строка «Выходного» активна
        h.WSM._effectiveEntry = function() { return { 'статус': '.', 'источник': 'руч' }; };
        let html = h.WSM._renderCellPopup('2026-09-06', '017');
        const iDot = html.indexOf('ws-swatch-dot');
        assertTrue(iDot !== -1, 'строка «Выходного» со свотчем ws-swatch-dot');
        const row = html.slice(iDot - 120, iDot + 400);
        assertTrue(row.indexOf('ws-popup-active') !== -1,
            'легаси-«.» подсвечивает строку «Выходного»');
        assertTrue(row.indexOf('Выходной, плановый выходной день') !== -1, 'имя');
        assertFalse(row.indexOf('>·<') !== -1, 'метки «·» нет');
        assertTrue(row.indexOf("onPopupStatus('.')") !== -1,
            'клик по листовой «.»-строке — код «.» (защитный путь данных)');
        // после нормализации слот «Выходного» — пустой код: клик — очистка
        h.WSM._STATUS_CODES = h.WSM._normalizeStatusCodes(SHEET);
        h.WSM._effectiveEntry = function() { return { 'статус': '.', 'источник': 'руч' }; };
        html = h.WSM._renderCellPopup('2026-09-06', '017');
        const iN = html.indexOf('ws-swatch-dot');
        const rowN = html.slice(iN - 120, iN + 400);
        assertTrue(rowN.indexOf('ws-popup-active') !== -1,
            'легаси-«.» подсвечивает слот «Выходного» и после нормализации');
        assertTrue(rowN.indexOf("onPopupStatus('')") !== -1,
            'клик по нормализованному «Выходному» — пустой статус (очистка)');
        // порядок попапа — канонический (после нормализации)
        h.WSM._effectiveEntry = function() { return null; };
        html = h.WSM._renderCellPopup('2026-09-06', '017');
        const codes = h.WSM._STATUS_CODES
            .filter(c => ['И', 'ОБ', 'ПЗ', 'ПР', '*'].indexOf(c.code) === -1)
            .map(c => c.code || 'ВЫХ');
        assertEqual(codes.join(' '), 'Д8 Д Н ОТ ВЫХ', 'попап — порядок заявки (без мероприятий)');
    });

    test('select: «— выходной —» без дубля; «.» не «(нет в справочнике)»', () => {
        const h = makeHost(true, 0, SHEET);
        h.WSM._STATUS_CODES = h.WSM._normalizeStatusCodes(SHEET);
        h.WSM._fillStatusSelect('.');
        const html = h.els().wsCellStatus.innerHTML;
        assertEqual((html.match(/<option value="">/g) || []).length, 1,
            'ровно одна опция с пустым value («— выходной —»)');
        assertFalse(html.indexOf('(нет в справочнике)') !== -1,
            'легаси-«.» НЕ добавляет «(нет в справочнике)»');
        assertTrue(html.indexOf('Д8 — День, плановая дневная 8-часовая смена') !== -1,
            'опции — канонические наименования');
    });

    test('_legendWidthPx: 190 / 500 / 315@700', () => {
        const h = makeHost(true);          // vw не задан → 1280
        assertEqual(h.WSM._legendWidthPx(), 230, 'краткий вид — 230px (Task 388)');
        h.WSM._legendWide = true;
        assertEqual(h.WSM._legendWidthPx(), 500, 'широкий @1280 — 500px');
        const h2 = makeHost(true, 700);
        h2.WSM._legendWide = true;
        assertEqual(h2.WSM._legendWidthPx(), 315, 'широкий @700 — 45vw = 315px');
    });

    test('разворот шевроном — слот 500px, память вида', () => {
        const h = makeHost(true);
        h.WSM._setLegend(true);
        h.WSM.toggleLegendWide();
        assertEqual(h.els().wsLegendDrawer.style.width, '500px',
            'слот — 500px');
        h.WSM._setLegend(false);
        h.WSM._setLegend(true);
        assertEqual(h.els().wsLegendDrawer.style.width, '500px',
            'повторное открытие — сразу широкая (пережитый вид)');
    });
});

// ============================================================
// 5. SW
// ============================================================

describe('Task 387 — SW', () => {

    test('SW: кэш поднят до kipia-test-v746', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v746'") !== -1,
            'CACHE_VERSION = kipia-test-v746 (Task 387 — фронтенд менялся)');
        assertFalse(SW_SRC.indexOf('kipia-test-v747') !== -1,
            'v616 ещё не существует (guard)');
    });
});
