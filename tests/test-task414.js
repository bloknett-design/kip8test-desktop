// ============================================================
// Task 414 — заявка: «В блоке Повторные инструктажи и периодическая
// проверка знаний в картах работников должен быть список только
// добавленных записей, не нужно показывать все 5 групп».
//
// Фикс (клиент): карточка работника (asBlocks) всегда рендерит
// ПЛОСКИЙ список добавленных записей года — прежняя ветка-фолбэк
// («код И|ПЗ + тема + дата + ✎/✕», чередование фона, пустое
// состояние «нет инструктажей…»), БЕЗ групп-заголовков шаблона,
// «— не проводился», «след. срок» и секции «вне списка».
// Групповой вид _renderInstrSection (Task 407/408; эталон Task 412
// при пустом листе) остаётся ТОЛЬКО у попапа ячейки шахматки —
// условие вызова дополнено !asBlocks.
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
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// ============================================================
// 1. SRC — маркеры правки
// ============================================================
describe('Task 414 — SRC', () => {

    test('_renderWorkerCard: групповой вид — только попап (!asBlocks)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf('if (!asBlocks && this._INSTR_LIST && this._INSTR_LIST.length)') !== -1,
            'маркер Task 414: до Task 414 условие было без !asBlocks');
        assertTrue(fn.indexOf('this._renderInstrSection(ins, tabNo, withEdit,') !== -1 &&
                   fn.indexOf('this._INSTR_LIST, wYearIn);') !== -1,
            'попап по-прежнему рендерится через _renderInstrSection');
    });

    test('_renderWorkerCard: плоская ветка — только добавленные записи', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf('} else if (!ins.length) {') !== -1 &&
                   fn.indexOf('нет инструктажей и проверок знаний за год') !== -1,
            'пустое состояние сохранено');
        assertTrue(fn.indexOf('(asBlocks && ik % 2 === 1)') !== -1,
            'чередование фона плоских строк в карточке');
        assertTrue(fn.indexOf('ws-popup-event') !== -1 &&
                   fn.indexOf("' · ' + iPeriod") !== -1,
            'строка «код + тема · дата»');
    });

    test('_renderInstrSection: док-блок — вызов только из попапа', () => {
        assertTrue(INDEX_SRC.indexOf('вызывается из _renderWorkerCard ТОЛЬКО для ПОПАПА ячейки') !== -1,
            'док-блок помечен Task 414 (попап-ONLY)');
        assertTrue(INDEX_SRC.indexOf('карточка работника показывает ПЛОСКИЙ список добавленных') !== -1,
            'док-блок описывает плоский вид карточки');
    });

    test('CSS групп (.ws-il-*) остаётся для попапа', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-il-head {') !== -1 &&
                   INDEX_SRC.indexOf('.ws-il-due {') !== -1 &&
                   INDEX_SRC.indexOf('.ws-il-off {') !== -1,
            'стили групп не удалены (попап использует)');
    });
});

// ============================================================
// 2. VM — карточка: плоский список только добавленных записей
// ============================================================
describe('Task 414 — VM: карточка', () => {

    const YEAR = new Date().getFullYear();
    function ymd(dt) {
        const m = dt.getMonth() + 1, d = dt.getDate();
        return dt.getFullYear() + '-' + (m < 10 ? '0' : '') + m +
               '-' + (d < 10 ? '0' : '') + d;
    }
    const TODAY = ymd(new Date());
    function addDaysIso(iso, days) {
        const p = String(iso).split('-').map(Number);
        return ymd(new Date(p[0], p[1] - 1, p[2] + days));
    }
    function addMonthsIsoTest(iso, months) {
        const p = String(iso).split('-').map(Number);
        const t = new Date(p[0], p[1] - 1 + months, 1);
        const dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
        t.setDate(Math.min(p[2], dim));
        return ymd(t);
    }
    function fmtRu(iso) {
        const p = String(iso).split('-');
        return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : String(iso);
    }

    const EMP = [
        { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
          'смена': '', 'должность': 'Слесарь КИПиА 5 разряд',
          'комментарий': '', 'группа_допуска': 'IV',
          'дата_приёма': '2024-03-15' }
    ];
    const TPL = [
        { название: 'Охрана труда', вид: 'инструктаж',
          периодичность: 6, основание: '' },
        { название: 'Пожарная безопасность', вид: 'инструктаж',
          периодичность: 12, основание: '' },
        { название: 'Электробезопасность', вид: 'проверка_знаний',
          периодичность: 12, основание: '' }
    ];
    // записи ГОДА: две по шаблону + одна «вне списка»; id 9 —
    // прошлогодняя (не должна попасть в список карточки)
    const TR_YEAR = [
        { id: 51, 'таб_номер': '017', 'тип': 'инструктаж',
          'тема': 'Охрана труда', 'дата_начала': TODAY,
          'дата_окончания': TODAY },
        { id: 52, 'таб_номер': '017', 'тип': 'проверка_знаний',
          'тема': 'Электробезопасность',
          'дата_начала': addDaysIso(TODAY, -10),
          'дата_окончания': addDaysIso(TODAY, -10) },
        { id: 53, 'таб_номер': '017', 'тип': 'инструктаж',
          'тема': 'Целевой инструктаж (вне списка)',
          'дата_начала': addDaysIso(TODAY, -5),
          'дата_окончания': addDaysIso(TODAY, -5) }
    ];
    const TR_OLD = [
        { id: 9, 'таб_номер': '017', 'тип': 'инструктаж',
          'тема': 'Охрана труда',
          'дата_начала': addMonthsIsoTest(TODAY, -14),
          'дата_окончания': addMonthsIsoTest(TODAY, -14) }
    ];

    function cardHost(opts) {
        return new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
            methodText(INDEX_SRC, '_lastExam1000Date') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
            methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_renderInstrSection') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKind') + ',\n' +
            methodText(INDEX_SRC, '_addMonthsIso') + ',\n' +
            methodText(INDEX_SRC, '_isoDate') + ',\n' +
            methodText(INDEX_SRC, '_fmtPeriodRu') + ',\n' +
            '_canEdit: ' + (opts.edit ? 'true' : 'false') + ',' +
            '_year: ' + YEAR + ', _month: 8,' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_VACATIONS: [],' +
            '_TRAININGS: ' + JSON.stringify(opts.trainings) + ',' +
            '_PPE: [],' +
            '_INSTR_LIST: ' + JSON.stringify(opts.tpl) + ',' +
            '_INSTR_ALL: ' + JSON.stringify(opts.instrAll || []) + ',' +
            '_fmtDateRu: function(d) { var p = String(d).split("-");' +
            '  return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(d); },' +
            '_esc: function(s) { return String(s); },' +
            '_escAttr: function(s) { return String(s); },' +
            '_vacDaysInYear: function(v, y) { return 0; },' +
            '_vacNetDaysInYear: function(v, y) { return 0; },' +
            '_plural: function(n, f) { return f[2]; },' +
            '_trainingCodeOf: function(t) { return t === "проверка_знаний" ? "ПЗ" : "И"; },' +
            '_statusMeta: function(c) { return { code: c, color: "#123456", name: c }; }' +
            '});')(mockDoc({}));
    }

    test('карточка: ТОЛЬКО добавленные записи, без групп шаблона', () => {
        const host = cardHost({ tpl: TPL, edit: true,
                                trainings: TR_YEAR, instrAll: TR_OLD });
        const html = host._renderWorkerCard('017', true, true).join('');
        assertTrue(html.indexOf('Повторные инструктажи и периодическая проверка знаний · ' + YEAR) !== -1,
            'заголовок блока с годом');
        assertTrue(/ws-popup-event[^>]*>[\s\S]*?Охрана труда · /.test(html) &&
                   html.indexOf('Электробезопасность · ') !== -1,
            'записи года — плоскими строками «тема · дата»');
        assertTrue(html.indexOf('ws-il-head') === -1 &&
                   html.indexOf('раз в ') === -1,
            'групп-заголовков шаблона НЕТ (все 5 групп не показываются)');
        assertTrue(html.indexOf('— не проводился') === -1 &&
                   html.indexOf('след. срок') === -1 &&
                   html.indexOf('вне списка:') === -1,
            'служебных строк группового вида НЕТ');
        assertTrue(html.indexOf('Пожарная безопасность') === -1,
            'пункт шаблона без записей не показан');
        assertTrue(/ws-popup-event[^>]*>[\s\S]*?Целевой инструктаж \(вне списка\) · /.test(html),
            'запись «вне списка» — обычной плоской строкой (она добавлена)');
        assertTrue(html.indexOf(fmtRu(addMonthsIsoTest(TODAY, -14))) === -1,
            'прошлогодняя запись в список года не попадает');
        assertTrue(html.indexOf('ws-emp-addins') !== -1 &&
                   html.indexOf('+ Инструктаж…') !== -1,
            'кнопка «+ Инструктаж…» в шапке блока карточки');
        assertTrue(html.indexOf('WorkSchedule.editTraining(51, 1)') !== -1 &&
                   html.indexOf('WorkSchedule.deleteTraining(53, 1)') !== -1,
            '✎/✕ у записей с id + семейство инструктажей (Task 427: раздельные id)');
    });

    test('карточка: пустой год — пустое состояние без групп', () => {
        const host = cardHost({ tpl: TPL, edit: true, trainings: [] });
        const html = host._renderWorkerCard('017', true, true).join('');
        assertTrue(html.indexOf('нет инструктажей и проверок знаний за год') !== -1,
            'пустое состояние');
        assertTrue(html.indexOf('ws-il-head') === -1 &&
                   html.indexOf('— не проводился') === -1,
            'пустых групп-заголовков НЕТ');
    });

    test('карточка: шаблон не загружен — тот же плоский вид', () => {
        const host = cardHost({ tpl: [], edit: true, trainings: TR_YEAR });
        const html = host._renderWorkerCard('017', true, true).join('');
        assertTrue(html.indexOf('ws-il-head') === -1 &&
                   /ws-popup-event[^>]*>[\s\S]*?Охрана труда · /.test(html),
            'без шаблона — те же плоские строки (деградация = вид карточки)');
    });

    test('попап ячейки: групповой вид сохранён (регресс 407)', () => {
        const host = cardHost({ tpl: TPL, edit: true,
                                trainings: TR_YEAR, instrAll: TR_OLD });
        const html = host._renderWorkerCard('017', true, false);
        assertTrue(html.indexOf('ws-il-head') !== -1 &&
                   html.indexOf('Электробезопасность') !== -1,
            'группы шаблона в попапе остаются');
        assertTrue(html.indexOf('Пожарная безопасность') === -1,
            'пустой пункт в попапе скрыт (как до Task 414)');
    });
});

// ============================================================
// 3. SW — версия
// ============================================================
describe('Task 414 — SW версия', () => {
    test('v641', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v746'") !== -1,
            'SW кэш — kipia-test-v746');
        assertTrue(SW_SRC.indexOf('kipia-test-v640') === -1,
            'v640 не осталась в sw.js');
        assertTrue(SW_SRC.indexOf('kipia-test-v747') === -1,
            'двойной бамп отсутствует (guard: v642)');
    });
});
