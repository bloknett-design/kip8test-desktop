// ============================================================
// Task 440 — заявка (kip8test), ТРИ части:
// 1) «Во всех трёх представлениях печати коды справа от
//    мероприятий на расстоянии друг от друга 10px» — HTML:
//    gap ряда wsp-bottom 6mm → 10px; PDF: colGap 12pt → 7.5pt
//    (10 CSS-px = 7.5pt); Excel: отступ indent="1" (~7px) у
//    кодов в колонке D — точные 10px в Excel недостижимы
//    (колонка-разделитель C общая с сеткой дней табеля).
// 2) «В картах работников, в блоке Повторные инструктажи и
//    периодическая проверка знаний НЕ АКТИВНА кнопка просмотра
//    следующего года, если в таблице Инструктажи … есть записи на
//    следующий год, а на предыдущий год при наличии записей
//    активна» — верх навигации теперь по ЗАПИСЯМ раздела (новый
//    _wtabYearMax), симметрично нижней границе _wtabYearMin.
// 3) «Проверь такой же функционал просмотра предыдущего или
//    следующего годов, при наличии записей в серверной таблице,
//    должен быть реализован в блоках Отпуска и Мероприятия» —
//    «Мероприятия» (fam 0): тот же фикс максимума; «Отпуска»:
//    НОВАЯ навигация fam 2 (хранилище _wtabYearVac) — пул годов
//    _VAC_YEARS (ленивая подгрузка соседних годов _vacYearEnsure,
//    окно ±3 года, локальная копия), дни периода — по году блока.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   SRC (печать): gap 10px (без 6mm); colGap 7.5 в layout+paint;
//     Excel — 2 стиля indent="1" (s7 код-строка, s8 «Коды:»),
//     cellXfs 9+colors, сетка 9+idx, «Коды:» s8 / коды s7.
//   SRC (годы): _wtabYearMax + вызовы из shift/nav; fam 2 —
//     хранилища, пул, посев/сброс/кэш, хук _renderWorkersPage,
//     дни отпусков по wYearVac.
//   VM (годы): › активна при записях след. года (баг-кейс), без
//     записей — погашена; период через границу года; shift +1;
//     fam 2 — range/min/max/клампы/клик ', 2'.
//   VM (_vacYearEnsure): недостающие годы параллельно, повторно —
//     без запросов, ошибка = «известно пусто».
//   VM (карточка): «Отпуска · год» + навигатор fam 2, записи
//     года пула; попап — год шахматки без навигатора.
//   VM (Excel): стили indent ×2, count 9+colors, сетка s9.
//   SW: kipia-test-v761 (guard v665).
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

function stripComments(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:'"\\/])\/\/[^\n]*/g, '$1');
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

function cssRule(src, sel) {
    const i = src.indexOf(sel + ' {');
    if (i === -1) return '';
    const j = src.indexOf('}', i);
    return src.slice(i, j + 1);
}

const NOWY = new Date().getFullYear();
const TAB = '2706';
const OTHER = '0402';

// ============================================================
// 1. SRC — печать: зазор 10px в трёх представлениях
// ============================================================
describe('Task 440 — SRC: печать, зазор мероприятий↔коды 10px', () => {

    test('HTML: .wsp-bottom — БЕЗ ряда/зазора (Task 442: кодов нет)', () => {
        const r = cssRule(INDEX_SRC, '#wsPrintSheet .wsp-bottom');
        assertTrue(r !== '', 'правило обёртки есть');
        assertTrue(r.indexOf('gap') === -1,
            'зазора нет — блок кодов удалён (Task 442), ряда больше нет');
        assertTrue(r.indexOf('display: flex') === -1,
            'flex-ряд снят вместе с блоком кодов');
    });

    test('HTML: .wsp-mev — вся ширина листа (Task 442)', () => {
        const r = cssRule(INDEX_SRC, '#wsPrintSheet .wsp-mev');
        assertTrue(r !== '', 'правило мероприятий есть');
        assertTrue(r.indexOf('flex:') === -1,
            'ограничений зоны нет — кодов справа больше нет');
        assertTrue(r.indexOf('min-width') === -1,
            'усадка зоны снята (зоны больше нет)');
    });

    test('PDF: _printPdfLayout — зоны кодов НЕТ (Task 442)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_printPdfLayout'));
        assertTrue(fn.indexOf('colGap') === -1,
            'зазора мероприятий↔коды нет — пара блоков не существует');
        assertTrue(fn.indexOf('codeW') === -1,
            'ширины зоны кодов нет');
        assertTrue(fn.indexOf('var evW = W - 2 * M;') !== -1,
            'мероприятия — вся ширина листа');
    });

    test('PDF: _printPdfPaintPage — зон кодов НЕТ (Task 442)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_printPdfPaintPage'));
        assertTrue(fn.indexOf('colGap') === -1 && fn.indexOf('codeX') === -1,
            'геометрии пары блоков нет');
        assertTrue(fn.indexOf('evRightMax') === -1,
            'край текста мероприятий больше не трекается (кодов нет)');
        assertTrue(fn.indexOf('var evMaxW = x0 + CW - ex;') !== -1,
            'перенос текста — до правого края ЛИСТА');
    });

    test('Excel: стили — indent-стили кодов УДАЛЕНЫ (Task 442)', () => {
        const st = methodText(INDEX_SRC, '_wsTabelStylesXml');
        assertTrue(st.indexOf('indent="1"') === -1,
            'indent-стилей нет — столбца кодов больше нет');
        assertTrue(st.indexOf('(st.regDate + 1)') !== -1,
            'cellXfs count = regDate + 1 (карта _wsTabelStyleMap)');
        assertTrue(st.indexOf('count="13"') !== -1,
            '13 границ: thin + 11 medium-комбинаций контура выходных');
        assertTrue(st.indexOf('_wsTabelStyleMap(colors.length)') !== -1,
            'карта стилей — единая для стилей и строк');
    });

    test('Excel: строки — кодов нет, сетка 7+idx (Task 442)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_wsTabelRows'));
        assertTrue(fn.indexOf("'Коды:'") === -1,
            'заголовка «Коды:» нет');
        assertTrue(fn.indexOf('codeLines') === -1,
            'строк кодов нет');
        assertTrue(fn.indexOf('stMap.coloredBase + colorIdx[col]') !== -1,
            'цветные ячейки сетки — база 7 (indent-стили сняты)');
    });
});

// ============================================================
// 2. SRC — годы карточки: максимум по записям + fam 2 «Отпуска»
// ============================================================
describe('Task 440 — SRC: навигация годов (максимум по записям, fam 2)', () => {

    test('_wtabYearMax — новый метод с fam', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_wtabYearMax'));
        assertTrue(fn.indexOf('_wtabYearMax: function(tabNo, fam)') !== -1,
            'сигнатура с fam');
        assertTrue(fn.indexOf('(fam === 0 || fam === 1)') !== -1 &&
                   fn.indexOf('(this._isInstrType(arr[i].тип) !== wantInstr)') !== -1,
            'fam 0/1 — фильтр по СВОЕМУ разделу (как _wtabYearMin)');
        assertTrue(fn.indexOf('дата_окончания') !== -1,
            'учитывает дата_окончания (период через границу года)');
    });

    test('_wtabYearShift и _wtabYearNav зовут _wtabYearMax', () => {
        const sh = stripComments(methodText(INDEX_SRC, '_wtabYearShift'));
        assertTrue(sh.indexOf('this._wtabYearMax(tabNo, fam)') !== -1,
            'кламп верха — по записям раздела');
        const nav = stripComments(methodText(INDEX_SRC, '_wtabYearNav'));
        assertTrue(nav.indexOf('this._wtabYearMax(tabNo, fam)') !== -1,
            'правая стрелка — по записям раздела');
    });

    test('fam 2: хранилища и пул отпусков', () => {
        assertTrue(INDEX_SRC.indexOf('_wtabYearVac: {},') !== -1,
            'хранилище года блока «Отпуска»');
        assertTrue(INDEX_SRC.indexOf('_VAC_YEARS: {},') !== -1,
            'пул отпусков по годам');
        assertTrue(INDEX_SRC.indexOf('_vacYearRange: function(tabNo)') !== -1,
            'диапазон лет с записями работника');
        assertTrue(INDEX_SRC.indexOf('_vacYearEnsure: function(years)') !== -1,
            'ленивая подгрузка соседних годов');
    });

    test('карточка: блок «Отпуска» — свой год + навигатор fam 2', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf('var wYearVac = asBlocks ? this._wtabYearOf(tabNo, 2)') !== -1,
            'год блока — выбор работника (fam 2)');
        assertTrue(fn.indexOf('this._wtabYearNav(tabNo, wYearVac, 2)') !== -1,
            'шапка «Отпуска · год» с навигатором fam 2');
        assertTrue(fn.indexOf('wYearVac === this._year ? (this._VACATIONS || []) : []') !== -1,
            'записи — пул _VAC_YEARS (год шахматки — свежий _VACATIONS)');
        assertTrue(fn.indexOf('this._vacNetDaysInYear(vv, wYearVac)') !== -1 &&
                   fn.indexOf('this._vacDaysInYear(vv, wYearVac)') !== -1,
            'дни периода — по ГОДУ БЛОКА (не году шахматки)');
    });

    test('пул: посев/сброс/локальная копия/хук страницы', () => {
        const lv = methodText(INDEX_SRC, '_loadVacations');
        assertTrue(lv.indexOf('self._VAC_YEARS[self._year] = self._VACATIONS;') !== -1,
            '_loadVacations сеет год шахматки в пул');
        const lg = methodText(INDEX_SRC, 'loadGrid');
        assertTrue(lg.indexOf('this._VAC_YEARS = {};') !== -1,
            'loadGrid(force) сбрасывает соседние годы (CRUD/«Обновить»)');
        const rc = methodText(INDEX_SRC, '_restoreFromObj');
        // Task 476: разбор объекта кэша вынесен в _restoreFromObj
        // (общий для localStorage- и KipDB-слоёв) — ассерт на нём.
        assertTrue(rc.indexOf('this._VAC_YEARS[parseInt(cvy, 10)] = cVac[cvy];') !== -1,
            'восстановление — пул из ВСЕХ годов локальной копии');
        const cw = methodText(INDEX_SRC, '_cacheWrite');
        assertTrue(cw.indexOf('c.vacations[py] = poolW[py];') !== -1,
            'запись кэша — соседние годы пула тоже');
        const rp = methodText(INDEX_SRC, '_renderWorkersPage');
        assertTrue(rp.indexOf('this._vacYearEnsure(vacNeed)') !== -1 &&
                   rp.indexOf('this._year - 3') !== -1,
            'показ карточки — ленивое окно годов [год табеля ±3]');
    });
});

// ============================================================
// 3. VM — годовые методы: › по записям следующего года
// ============================================================
function yearHost(stores, vacPool, pools) {
    const INSTR_ALL = (pools && pools.instr) || [
        { id: 50, 'таб_номер': TAB, 'тип': 'инструктаж', 'тема': 'Охрана труда',
          'дата_начала': (NOWY - 3) + '-05-10', 'дата_окончания': (NOWY - 3) + '-05-10' },
        { id: 51, 'таб_номер': TAB, 'тип': 'проверка_знаний', 'тема': 'ЭБ до 1000 В',
          'дата_начала': (NOWY - 1) + '-03-15', 'дата_окончания': (NOWY - 1) + '-03-15' },
        // запись СЛЕДУЮЩЕГО года — баг-кейс заявки (› не активна)
        { id: 52, 'таб_номер': TAB, 'тип': 'инструктаж', 'тема': 'Пожарная безопасность',
          'дата_начала': (NOWY + 1) + '-04-20', 'дата_окончания': (NOWY + 1) + '-04-20' },
    ];
    const EVENTS_ALL = (pools && pools.ev) || [
        { id: 60, 'таб_номер': TAB, 'тип': 'обучение', 'тема': 'Курс АСУ ТП',
          'дата_начала': (NOWY - 1) + '-06-15', 'дата_окончания': (NOWY - 1) + '-06-15' },
    ];
    return new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearShift') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
        methodText(INDEX_SRC, '_isInstrType') + ',\n' +
        '_vacDaysInYear: function(v, y) {' +
        '  var s = parseInt(String(v["дата_начала"]).slice(0, 4), 10);' +
        '  var e = parseInt(String(v["дата_окончания"] || v["дата_начала"]).slice(0, 4), 10);' +
        '  return (s <= y && y <= e) ? 14 : 0; },' +
        '_esc: function(s) { return String(s); },' +
        '_renderWorkersPage: function() { this.__rendered = (this.__rendered || 0) + 1; },' +
        '_wtabYear: ' + JSON.stringify((stores && stores.ev) || {}) + ',' +
        '_wtabYearInstr: ' + JSON.stringify((stores && stores.in) || {}) + ',' +
        '_wtabYearVac: ' + JSON.stringify((stores && stores.vac) || {}) + ',' +
        '_VAC_YEARS: ' + JSON.stringify(vacPool || {}) + ',' +
        '_year: ' + NOWY + ',' +
        '_INSTR_ALL: ' + JSON.stringify(INSTR_ALL) + ',' +
        '_EVENTS_ALL: ' + JSON.stringify(EVENTS_ALL) + ',' +
        '_TRAININGS: []' +
        '});')(mockDoc({}));
}

describe('Task 440 — VM: _wtabYearMax / › по записям следующего года', () => {

    test('баг-кейс заявки: запись инструктажа ' + (NOWY + 1) + ' — › АКТИВНА на ' + NOWY, () => {
        const host = yearHost();
        assertEqual(NOWY + 1, host._wtabYearMax(TAB, 1),
            'fam 1: максимум — по записи следующего года');
        const nav = host._wtabYearNav(TAB, NOWY, 1);
        assertTrue(nav.indexOf('ws-ynav-off">›') === -1,
            'правая стрелка НЕ погашена (запись следующего года есть)');
        assertTrue(nav.indexOf("_wtabYearShift('" + TAB + "', 1, 1)") !== -1,
            'клик «следующий год» жив');
        // симметрия: ‹ на минимуме — по-прежнему погашена
        const lo = host._wtabYearNav(TAB, NOWY - 3, 1);
        assertTrue(lo.indexOf('ws-ynav-off">‹') !== -1,
            'левая стрелка на минимуме записей погашена (как прежде)');
    });

    test('без записей следующего года — › ПОГАШЕНА (прежнее поведение)', () => {
        const host = yearHost({}, {}, {
            instr: [
                { id: 50, 'таб_номер': TAB, 'тип': 'инструктаж',
                  'тема': 'Охрана труда',
                  'дата_начала': (NOWY - 1) + '-05-10',
                  'дата_окончания': (NOWY - 1) + '-05-10' },
            ],
            ev: [],
        });
        assertEqual(NOWY - 1, host._wtabYearMax(TAB, 1),
            'fam 1: записей следующего года нет');
        const nav = host._wtabYearNav(TAB, NOWY, 1);
        assertTrue(nav.indexOf('ws-ynav-off">›') !== -1,
            'правая стрелка погашена на максимуме');
        assertTrue(nav.indexOf("_wtabYearShift('" + TAB + "', 1, 1)") === -1,
            'клика «следующий год» нет');
        assertTrue(nav.indexOf("_wtabYearShift('" + TAB + "', -1, 1)") !== -1,
            'клик «предыдущий год» жив (записи есть — как в заявке)');
    });

    test('период ЧЕРЕЗ ГРАНИЦУ года открывает следующий (дата_окончания)', () => {
        const host = yearHost({}, {}, {
            instr: [],
            ev: [
                { id: 61, 'таб_номер': TAB, 'тип': 'обучение',
                  'тема': 'Стажировка',
                  'дата_начала': NOWY + '-12-27',
                  'дата_окончания': (NOWY + 1) + '-01-15' },
            ],
        });
        assertEqual(NOWY + 1, host._wtabYearMax(TAB, 0),
            'fam 0: окончание в следующем году — год доступен');
        const nav = host._wtabYearNav(TAB, NOWY, 0);
        assertTrue(nav.indexOf("_wtabYearShift('" + TAB + "', 1)") !== -1,
            'fam 0: клик «следующий год» без третьего аргумента (legacy)');
    });

    test('_wtabYearShift fam 1: +1 при записи следующего года — год меняется', () => {
        const host = yearHost();
        host._wtabYearShift(TAB, 1, 1);
        assertEqual(NOWY + 1, host._wtabYearInstr[TAB],
            'год инструктажей перешёл на ' + (NOWY + 1) + ' (прежде кламп в текущий)');
        assertEqual(undefined, host._wtabYear[TAB],
            'год мероприятий не тронут');
        assertEqual(1, host.__rendered, 'страница перерисована');
    });

    test('_wtabYearShift fam 1: +1 БЕЗ записи — возврат к году табеля', () => {
        const host = yearHost({}, {}, {
            instr: [
                { id: 50, 'таб_номер': TAB, 'тип': 'инструктаж',
                  'тема': 'Охрана труда',
                  'дата_начала': (NOWY - 1) + '-05-10',
                  'дата_окончания': (NOWY - 1) + '-05-10' },
            ],
            ev: [],
        });
        host._wtabYearShift(TAB, 1, 1);
        assertEqual(undefined, host._wtabYearInstr[TAB],
            'кламп: выше записей не поднялись, выбор снят');
    });
});

// ============================================================
// 4. VM — fam 2 «Отпуска»: диапазон пула, клампы, клик ', 2'
// ============================================================
describe('Task 440 — VM: fam 2 «Отпуска» (пул _VAC_YEARS)', () => {

    const POOL = {};
    POOL[NOWY - 2] = [
        { id: 1, 'таб_номер': TAB, 'часть': 1,
          'дата_начала': (NOWY - 2) + '-06-02',
          'дата_окончания': (NOWY - 2) + '-06-15' },
    ];
    POOL[NOWY] = [
        { id: 2, 'таб_номер': TAB, 'часть': 2,
          'дата_начала': NOWY + '-07-01', 'дата_окончания': NOWY + '-07-14' },
        { id: 3, 'таб_номер': OTHER, 'часть': 1,
          'дата_начала': NOWY + '-08-04', 'дата_окончания': NOWY + '-08-17' },
    ];
    POOL[NOWY + 1] = [
        { id: 4, 'таб_номер': TAB, 'часть': 3,
          'дата_начала': (NOWY + 1) + '-05-05',
          'дата_окончания': (NOWY + 1) + '-05-18' },
    ];
    POOL[NOWY + 3] = [
        // чужой работник — границы НЕ расширяет
        { id: 5, 'таб_номер': OTHER, 'часть': 2,
          'дата_начала': (NOWY + 3) + '-03-02',
          'дата_окончания': (NOWY + 3) + '-03-15' },
    ];

    test('_vacYearRange: {min, max} по записям работника (чужие не мешают)', () => {
        const host = yearHost({}, POOL);
        const r = host._vacYearRange(TAB);
        assertEqual(NOWY - 2, r.min, 'минимум — первый год с записью');
        assertEqual(NOWY + 1, r.max,
            'максимум — последний год с записью (запись ' + (NOWY + 3) + ' чужая)');
        assertEqual(null, host._vacYearRange('999'),
            'записей нет — null');
    });

    test('_wtabYearMin/_wtabYearMax fam 2 — по пулу отпусков', () => {
        const host = yearHost({}, POOL);
        assertEqual(NOWY - 2, host._wtabYearMin(TAB, 2), 'минимум fam 2');
        assertEqual(NOWY + 1, host._wtabYearMax(TAB, 2), 'максимум fam 2');
        assertEqual(NOWY, host._wtabYearMin('999', 2),
            'без записей — год шахматки (фолбэк)');
        assertEqual(null, host._wtabYearMax('999', 2),
            'без записей — null (верх = текущий/год табеля)');
    });

    test('_wtabYearNav fam 2: стрелки по записям пула, клик с «, 2»', () => {
        const host = yearHost({}, POOL);
        const mid = host._wtabYearNav(TAB, NOWY, 2);
        assertTrue(mid.indexOf("_wtabYearShift('" + TAB + "', -1, 2)") !== -1 &&
                   mid.indexOf("_wtabYearShift('" + TAB + "', 1, 2)") !== -1,
            'оба клика — с третьим аргументом 2');
        assertTrue(mid.indexOf('ws-ynav-off') === -1,
            'в середине диапазона обе стрелки живы');
        const hi = host._wtabYearNav(TAB, NOWY + 1, 2);
        assertTrue(hi.indexOf('ws-ynav-off">›') !== -1,
            'на максимуме записей правая стрелка погашена');
        const lo = host._wtabYearNav(TAB, NOWY - 2, 2);
        assertTrue(lo.indexOf('ws-ynav-off">‹') !== -1,
            'на минимуме записей левая стрелка погашена');
    });

    test('_wtabYearShift fam 2: год блока «Отпуска» — свой, клампы по пулу', () => {
        const host = yearHost({}, POOL);
        host._wtabYearShift(TAB, 1, 2);
        assertEqual(NOWY + 1, host._wtabYearVac[TAB],
            'год отпусков перешёл на ' + (NOWY + 1));
        assertEqual(undefined, host._wtabYear[TAB],
            'год мероприятий не тронут');
        assertEqual(undefined, host._wtabYearInstr[TAB],
            'год инструктажей не тронут');
        const host2 = yearHost({}, POOL);
        host2._wtabYearShift(TAB, -10, 2);
        assertEqual(NOWY - 2, host2._wtabYearVac[TAB],
            'кламп снизу — по первой записи отпусков');
        const host3 = yearHost({}, POOL);
        host3._wtabYearShift(TAB, 10, 2);
        assertEqual(NOWY + 1, host3._wtabYearVac[TAB],
            'кламп сверху — по последней записи отпусков');
    });
});

// ============================================================
// 5. VM — _vacYearEnsure (ленивая подгрузка соседних годов)
// ============================================================
describe('Task 440 — VM: _vacYearEnsure', () => {

    test('тянет ТОЛЬКО недостающие годы; повторно — без запросов', async () => {
        const host = new Function('return ({' +
            methodText(INDEX_SRC, '_vacYearEnsure') + ',' +
            '_VAC_YEARS: {}, _VAC_FETCHING: {},' +
            '_api: function(action, payload) {' +
            '  this.__calls = this.__calls || [];' +
            '  this.__calls.push(payload.year);' +
            '  return Promise.resolve({ vacations:' +
            '    [{ "таб_номер": "X", "id": payload.year }] });' +
            '}' +
            '});')();
        const pool = {};
        pool[NOWY] = [{ 'таб_номер': TAB }];
        host._VAC_YEARS = pool;
        const got = await host._vacYearEnsure(
            [NOWY - 1, NOWY, NOWY + 1, NOWY + 2, 1899, 3001]);
        assertEqual(got, true, 'новые годы подтянулись');
        assertEqual(host.__calls.length, 3,
            'запрошены только недостающие валидные годы (' + NOWY + ' уже в пуле, 1899/3001 отброшены)');
        const years = host.__calls.slice().sort().join(',');
        assertEqual(years, (NOWY - 1) + ',' + (NOWY + 1) + ',' + (NOWY + 2),
            'годы запросов — соседние, параллельно');
        assertEqual(NOWY + 2, host._VAC_YEARS[NOWY + 2][0].id,
            'год ' + (NOWY + 2) + ' в пуле с записями сервера');
        const got2 = await host._vacYearEnsure(
            [NOWY - 1, NOWY, NOWY + 1, NOWY + 2]);
        assertEqual(got2, false, 'повторный вызов — новых годов нет');
        assertEqual(host.__calls.length, 3, 'повторных запросов НЕТ (нет спама)');
    });

    test('ошибка года — «известно пусто» (стрелки по факту)', async () => {
        const host = new Function('return ({' +
            methodText(INDEX_SRC, '_vacYearEnsure') + ',' +
            '_VAC_YEARS: {}, _VAC_FETCHING: {},' +
            '_api: function() { return Promise.reject(new Error("сбой")); }' +
            '});')();
        const got = await host._vacYearEnsure([2030]);
        assertEqual(got, true, 'год отмечен известным');
        assertEqual(0, host._VAC_YEARS[2030].length,
            'сбой → пустой список года');
        assertEqual(undefined, host._VAC_FETCHING[2030],
            'флаг «качается» снят');
    });
});

// ============================================================
// 6. VM — карточка: блок «Отпуска» с навигацией fam 2
// ============================================================
function cardHost(stores, vacPool, vacs) {
    const EMP = [
        { 'таб_номер': TAB, 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
          'смена': '', 'должность': 'Мастер КИПиА', 'комментарий': '',
          'дата_приёма': '2007-03-06' },
    ];
    return new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
        methodText(INDEX_SRC, '_isInstrType') + ',\n' +
        '_canEdit: true,' +
        '_year: ' + NOWY + ', _month: 8,' +
        '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
        '_VACATIONS: ' + JSON.stringify(vacs || []) + ',' +
        '_VAC_YEARS: ' + JSON.stringify(vacPool || {}) + ',' +
        '_wtabYear: ' + JSON.stringify((stores && stores.ev) || {}) + ',' +
        '_wtabYearInstr: ' + JSON.stringify((stores && stores.in) || {}) + ',' +
        '_wtabYearVac: ' + JSON.stringify((stores && stores.vac) || {}) + ',' +
        '_TRAININGS: [], _PPE: [], _INSTR_ALL: [], _EVENTS_ALL: [],' +
        '_vacDaysInYear: function(v, y) {' +
        '  var s = parseInt(String(v["дата_начала"]).slice(0, 4), 10);' +
        '  var e = parseInt(String(v["дата_окончания"] || v["дата_начала"]).slice(0, 4), 10);' +
        '  return (s <= y && y <= e) ? 14 : 0; },' +
        '_vacNetDaysInYear: function(v, y) { return 12; },' +
        '_fmtDateRu: function(d) { d = String(d);' +
        '  var p = d.split("-"); return p.length === 3 ?' +
        '  p[2] + "." + p[1] + "." + p[0] : d; },' +
        '_esc: function(s) { return String(s); },' +
        '_escAttr: function(s) { return String(s); },' +
        '_trainingCodeOf: function(t) { return "И"; },' +
        '_statusMeta: function(c) { return {}; },' +
        '_plural: function(n, f) { return f[2]; }' +
        '});')(mockDoc({}));
}

describe('Task 440 — VM: карточка — блок «Отпуска» (fam 2)', () => {

    test('asBlocks: навигатор fam 2 + записи ВЫБРАННОГО года из пула', () => {
        const pool = {};
        pool[NOWY - 1] = [
            { id: 1, 'таб_номер': TAB, 'часть': 1,
              'дата_начала': (NOWY - 1) + '-06-02',
              'дата_окончания': (NOWY - 1) + '-06-15',
              'комментарий': '' },
        ];
        const stores = { vac: {} };
        stores.vac[TAB] = NOWY - 1;
        const host = cardHost(stores, pool, []);
        const blocks = host._renderWorkerCard(TAB, true, true);
        const b2 = blocks[1];
        assertTrue(b2.indexOf('Отпуска · ' + (NOWY - 1)) !== -1,
            'шапка — выбранный год блока (не год шахматки)');
        assertTrue(b2.indexOf("_wtabYearShift('" + TAB + "', -1, 2)") !== -1 ||
                   b2.indexOf("_wtabYearShift('" + TAB + "', 1, 2)") !== -1,
            'навигатор ‹год› с третьим аргументом 2');
        assertTrue(b2.indexOf('02.06.' + (NOWY - 1) + ' — 15.06.' + (NOWY - 1)) !== -1,
            'запись архивного года показана из пула');
        assertTrue(b2.indexOf('12 дней') !== -1,
            'дни периода — по году блока (не 0 года шахматки)');
        assertFalse(b2.indexOf('Отпуска · ' + NOWY + '<') !== -1,
            'год шахматки в шапке не показан');
    });

    test('asBlocks: год по умолчанию — год шахматки, записи _VACATIONS', () => {
        const host = cardHost({}, {}, [
            { id: 2, 'таб_номер': TAB, 'часть': 2,
              'дата_начала': NOWY + '-07-01',
              'дата_окончания': NOWY + '-07-14',
              'комментарий': '' },
        ]);
        const blocks = host._renderWorkerCard(TAB, true, true);
        const b2 = blocks[1];
        assertTrue(b2.indexOf('Отпуска · ' + NOWY) !== -1,
            'шапка — год шахматки (выбор не сделан)');
        assertTrue(b2.indexOf('01.07.' + NOWY) !== -1,
            'запись года шахматки показана (фолбэк _VACATIONS)');
    });

    test('попап (не asBlocks): год шахматки, БЕЗ навигатора', () => {
        const pool = {};
        pool[NOWY - 1] = [
            { id: 1, 'таб_номер': TAB, 'часть': 1,
              'дата_начала': (NOWY - 1) + '-06-02',
              'дата_окончания': (NOWY - 1) + '-06-15',
              'комментарий': '' },
        ];
        const stores = { vac: {} };
        stores.vac[TAB] = NOWY - 1;
        const host = cardHost(stores, pool, []);
        const html = host._renderWorkerCard(TAB, true);
        assertTrue(html.indexOf('Отпуска · ' + NOWY) !== -1,
            'попап: блок «Отпуска» — год шахматки');
        assertTrue(html.indexOf('_wtabYearShift') === -1,
            'попап: навигаторов года нет (как прежде)');
    });
});

// ============================================================
// 7. VM — Excel: стили indent и индексы строк
// ============================================================
describe('Task 440 — VM: Excel (зазор кодов отступом)', () => {

    function xlsHost() {
        return new Function('return ({' +
            methodText(INDEX_SRC, '_wsTabelStyleMap') + ',' +
            methodText(INDEX_SRC, '_wsTabelStylesXml') + ',' +
            methodText(INDEX_SRC, '_wsTabelRows') +
            '});')();
    }

    const MODEL = {
        view: 'full', month: 9, year: 2026,
        days: [{ d: 1, dow: 'Пн', short: false },
               { d: 2, dow: 'Вт', short: false }],
        rows: [{ fio: 'Иванов И. И.', tip: 'смена №1', inAgg: true,
                 work: 2, overDays: 0,
                 cells: [{ status: 'Д', color: '#FFE082' },
                         { status: '', color: '' }] }],
        events: [{ range: '01.09', text: 'Плановое обслуживание',
                   color: '#B3E5FC' }],
        codes: [{ code: 'Д', label: 'День', color: '#FFE082' }],
    };

    test('styles.xml: БЕЗ indent, контуры выходных + regDate (Task 442)', () => {
        const xml = xlsHost()._wsTabelStylesXml(['FFE082']);
        assertEqual(xml.split('indent="1"').length - 1, 0,
            'indent-стилей НЕТ — столбца кодов больше нет');
        // карта: 7 + C + 4 + 3 + 7 + 7C + 1 = 22 + 8C; C=1 → 30
        assertTrue(xml.indexOf('<cellXfs count="30">') !== -1,
            'cellXfs count = 30 (база 0–6 + цветной + контуры + regDate)');
        assertTrue(xml.split('style="medium"').length - 1 >= 20,
            'medium-границы контуров выходных построены (11 комбинаций = 20 сторон)');
        assertTrue(xml.indexOf('<fonts count="7">') !== -1,
            '7 шрифтов (+ НЕ жирные белые числа дат)');
        assertTrue(xml.indexOf('<borders count="13">') !== -1,
            '13 границ (thin + 11 комбинаций контура)');
    });

    test('строки: сетка s7, блока кодов нет (Task 442)', () => {
        const rows = xlsHost()._wsTabelRows(MODEL, { FFE082: 0 });
        let grid = null, hdr = null, block = null;
        for (const r of rows) {
            if (r[0] && String(r[0].v).indexOf('Иванов') === 0) grid = r;
            if (r[0] && String(r[0].v).indexOf('Мероприятия · ') === 0) hdr = r;
        }
        const hi = rows.indexOf(hdr);
        block = rows[hi + 1];
        assertTrue(grid !== null && hdr !== null && block !== null,
            'строки найдены');
        assertEqual(7, grid[1].s,
            'цветная ячейка сетки — стиль 7 (база цветных, Task 442)');
        assertEqual(4, grid[2].s, 'пустая ячейка сетки — стиль 4 (без цвета)');
        assertEqual(1, hdr.length, 'заголовок блока — одна ячейка A (без «Коды:»)');
        assertEqual(block.length, 2, 'строка блока — A (дата) + B (текст)');
        assertEqual('01.09', block[0].v, 'дата мероприятия в A');
        assertEqual('Плановое обслуживание', block[1].v, 'текст мероприятия в B');
    });
});

// ============================================================
// 8. SW — версия кэша
// ============================================================
describe('Task 440 — SW: версия kipia-test-v761', () => {
    test('CACHE_VERSION = kipia-test-v761, прежней v663 нет', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v761'") !== -1,
            'CACHE_VERSION = kipia-test-v761');
        assertFalse(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v663'") !== -1,
            'v663 как активная версия больше не существует');
    });
});
