// ============================================================
// Task 446 — заявка: «На страницах архива Отпуска/Инструктажи/
// СИЗ/Мероприятия убери столбцы id и Таб. №. На странице
// Инструктажи отсортируй строки по фамилиям. На всех страницах
// фон групп строк по фамилиям сделай зеброй.»
//
// Реализация (полностью КЛИЕНТСКАЯ, index.html):
//   • листы «Отпуска»/«Инструктажи»/«СИЗ»/«Мероприятия» БЕЗ
//     колонок id и «Таб. №» (технические ключи выгрузке не
//     нужны; «Работники» — справочник, «Таб. №» ОСТАВЛЕН);
//   • «Инструктажи» — сортировка по ФАМИЛИИ → дата (приём
//     сортировки «Отпусков»); «Мероприятия» — прежняя по дате;
//   • ЗЕБРА на ВСЕХ листах (вкл. «Работники»): заливка
//     чередуется по ГРУППАМ строк одного работника —
//     _wsXlsZebraGroups (колонка «ФИО»/«Работник»), стиль
//     s="2" (fills 4 / cellXfs 3, заливка #F2F2F2); пустые
//     ячейки зебры НЕ пропускаются — полоса без «дыр».
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

const NOWY = new Date().getFullYear();
const D = (y, md) => (y + '-' + md);

// ============================================================
// 1. SRC — колонки листов без id/«Таб. №»
// ============================================================
describe('Task 446 — SRC: колонки листов архива', () => {

    test('листы Отпуска/Инструктажи/СИЗ/Мероприятия: колонок id и «Таб. №» НЕТ', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_workersArchiveData'));
        assertTrue(fn.indexOf("'id', 'Таб. №'") === -1,
            'ни одна шапка листа не начинается с id/«Таб. №»');
        // строки данных: технические push-колонки удалены
        assertTrue(fn.indexOf("parseInt(w.id, 10) || ''") === -1 &&
                   fn.indexOf("parseInt(t.id, 10) || ''") === -1 &&
                   fn.indexOf("parseInt(m.id, 10) || ''") === -1 &&
                   fn.indexOf("parseInt(pz.id, 10) || ''") === -1,
            'push id-колонки удалены у всех четырёх листов');
        assertTrue(fn.indexOf("String(w['таб_номер'] || '')") === -1 &&
                   fn.indexOf("String(t['таб_номер'] || '')") === -1 &&
                   fn.indexOf("String(m['таб_номер'] || '')") === -1 &&
                   fn.indexOf("String(pz['таб_номер'] || '')") === -1,
            'push «Таб. №» удалён у всех четырёх листов');
        // шапки листов начинаются с колонки работника
        assertTrue(fn.indexOf("var vacations = [['ФИО', 'Часть',") !== -1,
            '«Отпуска»: первая колонка — ФИО');
        assertTrue(fn.indexOf("var instr = [['ФИО', 'Тип', 'Тема',") !== -1,
            '«Инструктажи»: первая колонка — ФИО');
        assertTrue(fn.indexOf("var events = [['ФИО', 'Тип', 'Тема',") !== -1,
            '«Мероприятия»: первая колонка — ФИО');
        assertTrue(fn.indexOf("var ppe = [['Работник', 'Должность',") !== -1,
            '«СИЗ»: первая колонка — Работник');
    });

    test('лист «Работники» — справочник, «Таб. №» ОСТАВЛЕН', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_workersArchiveData'));
        assertTrue(fn.indexOf("var employees = [['Таб. №', 'ФИО', 'Тип', 'Смена',") !== -1,
            'справочник прежний: «Таб. №» на месте (заявка — только 4 листа)');
    });

    test('«Инструктажи»: сортировка по ФАМИЛИИ → дата (приём «Отпусков»)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_workersArchiveData'));
        const iSort = fn.indexOf('ins.sort(function(a, b) {');
        assertTrue(iSort !== -1, 'ins.sort — свой компаратор');
        const seg = fn.slice(iSort, iSort + 400);
        assertTrue(seg.indexOf("fioOf(a['таб_номер']).localeCompare(") !== -1 &&
                   seg.indexOf("fioOf(b['таб_номер']), 'ru')") !== -1,
            'первичный ключ — ФИО работника');
        assertTrue(seg.indexOf('return byDate(a, b);') !== -1,
            'вторичный ключ — прежняя сортировка по дате');
        const iEvs = fn.indexOf('evs.sort(byDate);');
        assertTrue(iEvs !== -1 && iEvs > iSort,
            '«Мероприятия» — прежняя сортировка по дате (не тронута)');
        // карточки/шахматка: свой byDate в _wtabYearRecords не тронут
        const wtab = stripComments(methodText(INDEX_SRC, '_wtabYearRecords'));
        assertTrue(wtab.indexOf('ins.sort(byDate);') !== -1,
            '_wtabYearRecords (карточки) — прежняя сортировка по дате');
    });
});

// ============================================================
// 2. SRC — зебра: помощник, XML листа, styles, книга
// ============================================================
describe('Task 446 — SRC: зебра по группам строк', () => {

    test('_wsXlsZebraGroups: чередование при СМЕНЕ фамилии', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_wsXlsZebraGroups'));
        assertTrue(fn.indexOf('hdr[h] === personHeader') !== -1,
            'колонка работника ищется по ЗАГОЛОВКУ листа');
        assertTrue(fn.indexOf('if (nm !== prev) { on = !on; prev = nm; }') !== -1,
            'при смене фамилии цвет чередуется, внутри группы — один');
        assertTrue(fn.indexOf('if (r === 0 || col < 0) { out.push(false);') !== -1,
            'шапка/ненайденная колонка — без заливки');
    });

    test('_wsXlsSheetXml: стиль s="2" для строк зебры', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_wsXlsSheetXml'));
        const iHs = fn.indexOf("var hs = (r === 0) ? ' s=\"1\"'");
        assertTrue(iHs !== -1, 'шапка — прежний стиль s="1"');
        const seg = fn.slice(iHs, iHs + 200);
        assertTrue(seg.indexOf("((opts.zebra && opts.zebra[r]) ? ' s=\"2\"' : '')") !== -1,
            'строки зебры — стиль s="2"');
        assertTrue(fn.indexOf("if (hs) x += '<c r=\"' + ref + '\"' + hs + '/>';") !== -1,
            'пустая ячейка зебры НЕ пропускается (полоса без «дыр»)');
    });

    test('_wsXlsStylesXml: заливка зебры #F2F2F2 + cellXf 2', () => {
        const fn = methodText(INDEX_SRC, '_wsXlsStylesXml');
        assertTrue(fn.indexOf("'<fills count=\"4\">'") !== -1,
            'fills count 4 (none/gray125/шапка/зебра)');
        assertTrue(fn.indexOf('<fgColor rgb="FFF2F2F2"/>') !== -1,
            'заливка зебры — #F2F2F2');
        assertTrue(fn.indexOf("'<cellXfs count=\"3\">'") !== -1,
            'cellXfs count 3 (обычный/шапка/зебра)');
        assertTrue(fn.indexOf('fillId="3" borderId="0" xfId="0"') !== -1,
            'cellXf 2 — fillId=3 (зебра)');
    });

    test('_buildArchiveWorkbook: person-колонка + зебра на ВСЕХ листах', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_buildArchiveWorkbook'));
        // все пять листов объявляют колонку работника для зебры
        const iE = fn.indexOf("name: 'Работники'");
        const segE = fn.slice(iE, iE + 200);
        assertTrue(segE.indexOf("person: 'ФИО'") !== -1,
            '«Работники»: зебра по ФИО (каждая строка — своя группа)');
        const iV = fn.indexOf("name: 'Отпуска'");
        assertTrue(fn.slice(iV, iV + 200).indexOf("person: 'ФИО'") !== -1,
            '«Отпуска»: person ФИО');
        const iI = fn.indexOf("name: 'Инструктажи'");
        assertTrue(fn.slice(iI, iI + 200).indexOf("person: 'ФИО'") !== -1,
            '«Инструктажи»: person ФИО');
        const iP = fn.indexOf("name: 'СИЗ'");
        assertTrue(fn.slice(iP, iP + 200).indexOf("person: 'Работник'") !== -1,
            '«СИЗ»: person Работник');
        const iM = fn.indexOf("name: 'Мероприятия'");
        assertTrue(fn.slice(iM, iM + 200).indexOf("person: 'ФИО'") !== -1,
            '«Мероприятия»: person ФИО');
        // зебра передаётся в генератор листа
        assertTrue(fn.indexOf('zebra: this._wsXlsZebraGroups(') !== -1,
            'карта зебры передаётся в _wsXlsSheetXml');
        // ширины листов — без колонок id (6) и «Таб. №» (9)
        assertTrue(fn.indexOf('widths: [32, 8, 14, 14, 8, 30]') !== -1,
            'ширины «Отпуска» — 6 колонок (без 6/9)');
        assertTrue(fn.indexOf('widths: [32, 17, 50, 17, 12, 12, 42]') !== -1,
            'ширины «Инструктажи» — 7 колонок');
        assertTrue(fn.indexOf('widths: [32, 24, 44, 14, 16, 14, 14, 30]') !== -1,
            'ширины «СИЗ» — 8 колонок');
        assertTrue(fn.indexOf('widths: [32, 15, 50, 15, 15, 16, 42]') !== -1,
            'ширины «Мероприятия» — 7 колонок');
        assertTrue(fn.indexOf('widths: [9, 32, 12, 8, 36, 15, 14]') !== -1,
            'ширины «Работники» — прежние 7 (справочник)');
    });
});

// ============================================================
// 3. VM — _workersArchiveData: шапки + сортировка по фамилиям
// ============================================================
describe('Task 446 — VM: _workersArchiveData', () => {

    const EMP = [
        { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
          'смена': '', 'должность': 'Слесарь КИПиА', 'группа_допуска': 'IV',
          'дата_приёма': '2024-03-15' },
        { 'таб_номер': '031', 'ФИО': 'Сидоров С. С.', 'тип': 'сменный',
          'смена': 3, 'должность': 'Электромонтёр', 'группа_допуска': 'III',
          'дата_приёма': '2023-11-05' }
    ];

    function dataHost(opts) {
        opts = opts || {};
        return new Function('return ({' +
            methodText(INDEX_SRC, '_workersArchiveData') + ',\n' +
            methodText(INDEX_SRC, '_ppePosNoGrade') + ',\n' +
            "_isInstrType: function(t) { return t === 'инструктаж' || t === 'проверка_знаний'; }," +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_INSTR_ALL: ' + JSON.stringify(opts.instrAll || []) + ',' +
            '_EVENTS_ALL: ' + JSON.stringify(opts.eventsAll || []) + ',' +
            '_TRAININGS: ' + JSON.stringify(opts.trainings || []) + ',' +
            '_PPE: ' + JSON.stringify(opts.ppe || []) + ',' +
            '_VAC_YEARS: ' + JSON.stringify(opts.vacYears || {}) + ',' +
            '_VACATIONS: [], _vacYear: 0,' +
            '});')();
    }

    test('шапки: 4 листа без id/«Таб. №», работник — первой колонкой', () => {
        const d = dataHost({
            vacYears: { [NOWY]: [{ id: 1, 'таб_номер': '017', часть: 1,
                'дата_начала': D(NOWY, '06-01'),
                'дата_окончания': D(NOWY, '06-10'), дней: 10,
                комментарий: '' }] },
            instrAll: [{ id: 2, 'таб_номер': '017', 'тип': 'инструктаж',
                'тема': 'Т', 'дата_начала': D(NOWY, '03-02'),
                'дата_окончания': D(NOWY, '03-02'), 'выполнение': 1,
                'просрочен': 0, 'комментарий': '' }],
            eventsAll: [{ id: 3, 'таб_номер': '017', 'тип': 'обучение',
                'тема': 'Курс', 'дата_начала': D(NOWY, '09-03'),
                'дата_окончания': D(NOWY, '09-05'),
                'длительность_дней': 3, 'комментарий': '' }],
            ppe: [{ id: 4, 'таб_номер': '031', 'работник': '',
                'должность': '', 'наименование': 'Перчатки',
                'дата_выдачи': D(NOWY, '01-15'),
                'дата_изготовления': '', 'срок_годности': 'До износа',
                'дата_окончания': 'До износа', 'примечание': '' }]
        })._workersArchiveData();
        assertEqual(d.vacations[0].join('|'),
            'ФИО|Часть|Дата начала|Дата окончания|Дней|Комментарий',
            'шапка «Отпуска» — 6 колонок, БЕЗ id/«Таб. №»');
        assertEqual(d.instr[0].join('|'),
            'ФИО|Тип|Тема|Дата проведения|Выполнено|Просрочен|Комментарий',
            'шапка «Инструктажи» — 7 колонок, БЕЗ id/«Таб. №»');
        assertEqual(d.events[0].join('|'),
            'ФИО|Тип|Тема|Дата начала|Дата окончания|Длительность, дн|Комментарий',
            'шапка «Мероприятия» — 7 колонок, БЕЗ id/«Таб. №»');
        assertEqual(d.ppe[0].join('|'),
            'Работник|Должность|Наименование|Дата выдачи|Дата изготовления|Срок годности|Дата окончания|Примечание',
            'шапка «СИЗ» — 8 колонок, БЕЗ id/«Таб. №»');
        assertEqual(d.employees[0].join('|'),
            'Таб. №|ФИО|Тип|Смена|Должность|Группа допуска|Дата приёма',
            'шапка «Работники» — прежняя (справочник, «Таб. №» жив)');
        // значения строк: работник в колонке 0, датовые поля на местах
        assertEqual(d.vacations[1][0], 'Иванов И. И.', 'Отпуска: ФИО [0]');
        assertEqual(d.vacations[1][2], '01.06.' + NOWY, 'Отпуска: дата начала [2]');
        assertEqual(d.vacations[1][4], 10, 'Отпуска: дней [4]');
        assertEqual(d.ppe[1][0], 'Сидоров С. С.', 'СИЗ: работник [0] — фолбэк ФИО');
        assertEqual(d.ppe[1][6], 'До износа', 'СИЗ: дата окончания [6] как есть');
    });

    test('инструктажи: строки по ФАМИЛИЯМ (ранняя дата Сидорова — НИЖЕ)', () => {
        const mk = (id, tab, iso) => ({
            id: id, 'таб_номер': tab, 'тип': 'инструктаж', 'тема': 'Т',
            'дата_начала': iso, 'дата_окончания': iso,
            'выполнение': 1, 'просрочен': 0, 'комментарий': '' });
        const d = dataHost({
            instrAll: [
                mk(1, '999', D(NOWY, '05-01')),      // неизвестный таб → ФИО ''
                mk(2, '017', D(NOWY, '03-02')),      // Иванов
                mk(3, '017', D(NOWY + 1, '02-01')),  // Иванов, следующий год
                mk(4, '031', D(NOWY, '01-10')),      // Сидоров — САМАЯ РАННЯЯ дата
                mk(5, '031', D(NOWY - 2, '03-01'))   // вне диапазона — НЕТ
            ]
        })._workersArchiveData();
        assertEqual(d.instr.length, 5, 'шапка + 4 (вне диапазона отфильтрован)');
        // порядок: '' (неизвестный) → Иванов ×2 (по датам) → Сидоров
        assertEqual(d.instr[1][0], '', 'первая строка — пустое ФИО (выше всех)');
        assertEqual(d.instr[2][0], 'Иванов И. И.', 'вторая — Иванов');
        assertEqual(d.instr[3][0], 'Иванов И. И.', 'третья — Иванов (группа подряд)');
        assertEqual(d.instr[4][0], 'Сидоров С. С.',
            'четвёртая — Сидоров: фамилия первичнее ранней даты');
        // внутри группы Иванова — по датам asc
        assertEqual(d.instr[2][3], '02.03.' + NOWY, 'Иванов: первая дата');
        assertEqual(d.instr[3][3], '01.02.' + (NOWY + 1), 'Иванов: вторая дата');
        assertEqual(d.instr[4][3], '10.01.' + NOWY, 'Сидоров: его дата');
    });

    test('отпуска/СИЗ/мероприятия: сортировки на местах (СИЗ — Task 459 по фамилиям)', () => {
        const d = dataHost({
            vacYears: {
                [NOWY - 1]: [{ id: 11, 'таб_номер': '031', часть: 1,
                    'дата_начала': D(NOWY - 1, '12-29'),
                    'дата_окончания': D(NOWY, '01-11'), дней: 14,
                    комментарий: 'граница' }],
                [NOWY]: [{ id: 12, 'таб_номер': '017', часть: 2,
                    'дата_начала': D(NOWY, '06-01'),
                    'дата_окончания': D(NOWY, '06-10'), дней: 10,
                    комментарий: '' }]
            },
            ppe: [
                { id: 21, 'таб_номер': '031', 'работник': '', 'должность': 'Э',
                  'наименование': 'Перчатки', 'дата_выдачи': D(NOWY, '02-02'),
                  'дата_изготовления': '', 'срок_годности': 'До износа',
                  'дата_окончания': 'До износа', 'примечание': '' },
                { id: 22, 'таб_номер': '017', 'работник': 'Иванов И. И.',
                  'должность': 'С', 'наименование': 'Каска',
                  'дата_выдачи': D(NOWY, '01-15'),
                  'дата_изготовления': D(NOWY - 1, '06-01'),
                  'срок_годности': '2 года',
                  'дата_окончания': D(NOWY + 1, '06-01'), 'примечание': 'план' }
            ],
            eventsAll: [
                { id: 31, 'таб_номер': '031', 'тип': 'обучение', 'тема': 'Курс Б',
                  'дата_начала': D(NOWY, '09-01'), 'дата_окончания': D(NOWY, '09-02'),
                  'длительность_дней': 2, 'комментарий': '' },
                { id: 32, 'таб_номер': '017', 'тип': 'обучение', 'тема': 'Курс А',
                  'дата_начала': D(NOWY, '09-03'), 'дата_окончания': D(NOWY, '09-05'),
                  'длительность_дней': 3, 'комментарий': '' }
            ]
        })._workersArchiveData();
        // отпуска: сортировка ФИО → дата (прежде), колонки сдвинуты
        assertEqual(d.vacations[1][0], 'Иванов И. И.', 'отпуска: первый Иванов');
        assertEqual(d.vacations[2][0], 'Сидоров С. С.', 'отпуска: второй Сидоров');
        assertEqual(d.vacations[2][3], '11.01.' + NOWY, 'отпуска: дата окончания [3]');
        // СИЗ: сортировка по ФАМИЛИЯМ (Task 459): Иванов → Сидоров
        assertEqual(d.ppe[1][0], 'Иванов И. И.',
            'СИЗ: первый — Иванов (по фамилии, Task 459)');
        assertEqual(d.ppe[1][4], '01.06.' + (NOWY - 1), 'СИЗ: изготовление [4]');
        assertEqual(d.ppe[2][0], 'Сидоров С. С.',
            'СИЗ: второй — Сидоров (фолбэк ФИО)');
        // мероприятия: сортировка по ДАТЕ — прежняя (Сидоров 01.09 раньше)
        assertEqual(d.events[1][0], 'Сидоров С. С.', 'мероприятия: по дате, не по фамилии');
        assertEqual(d.events[2][0], 'Иванов И. И.', 'мероприятия: вторая — Иванов');
        assertEqual(d.events[2][5], 3, 'мероприятия: длительность [5]');
    });
});

// ============================================================
// 4. VM — _wsXlsZebraGroups (чистая функция)
// ============================================================
describe('Task 446 — VM: _wsXlsZebraGroups', () => {

    function zebraHost() {
        return new Function('return ({' +
            methodText(INDEX_SRC, '_wsXlsZebraGroups') + '});')();
    }

    const HDR = [['ФИО', 'Часть'], ['x', 1]];

    test('группы по фамилиям: чередование, первая группа — БЕЗ заливки', () => {
        const h = zebraHost();
        const rows = [['ФИО', 'X'],
                      ['Иванов', 1], ['Иванов', 2],
                      ['Сидоров', 3],
                      ['Петров', 4], ['Петров', 5]];
        assertEqual(JSON.stringify(h._wsXlsZebraGroups(rows, 'ФИО')),
            JSON.stringify([false, false, false, true, false, false]),
            'шапка + Иванов(2) без заливки → Сидоров с заливкой → Петров(2) без');
    });

    test('одна строка = одна группа (лист «Работники»)', () => {
        const h = zebraHost();
        const rows = [['Таб. №', 'ФИО'], ['017', 'Иванов'], ['031', 'Сидоров']];
        assertEqual(JSON.stringify(h._wsXlsZebraGroups(rows, 'ФИО')),
            JSON.stringify([false, false, true]),
            'классическая зебра по строкам');
    });

    test('повторная группа той же фамилии — чередование ЗАНОВО', () => {
        const h = zebraHost();
        const rows = [['ФИО', 'X'], ['Иванов', 1], ['Сидоров', 2], ['Иванов', 3]];
        assertEqual(JSON.stringify(h._wsXlsZebraGroups(rows, 'ФИО')),
            JSON.stringify([false, false, true, false]),
            'цвет меняется при СМЕНЕ фамилии, а не по глобальной карте');
    });

    test('пустые ФИО — своя группа', () => {
        const h = zebraHost();
        const rows = [['ФИО', 'X'], ['', 1], ['', 2], ['Иванов', 3]];
        assertEqual(JSON.stringify(h._wsXlsZebraGroups(rows, 'ФИО')),
            JSON.stringify([false, false, false, true]),
            'две пустые строки — одна незалитая группа');
    });

    test('колонка не найдена / только шапка — без заливки', () => {
        const h = zebraHost();
        assertEqual(JSON.stringify(h._wsXlsZebraGroups(HDR, 'Работник')),
            JSON.stringify([false, false]),
            'нет колонки работника — все false (защита)');
        assertEqual(JSON.stringify(h._wsXlsZebraGroups([['ФИО']], 'ФИО')),
            JSON.stringify([false]),
            'только шапка — false');
        assertEqual(JSON.stringify(h._wsXlsZebraGroups([], 'ФИО')),
            JSON.stringify([]),
            'пустой лист — пустая карта');
    });
});

// ============================================================
// 5. VM — _wsXlsSheetXml: s="2" и непрерывная полоса
// ============================================================
describe('Task 446 — VM: _wsXlsSheetXml (зебра)', () => {

    function xmlHost() {
        return new Function('return ({' +
            methodText(INDEX_SRC, '_wsXlsSheetXml') + ',' +
            methodText(INDEX_SRC, '_wsXlsColName') + ',' +
            methodText(INDEX_SRC, '_wsXlsEsc') + '});')();
    }

    test('шапка s="1", зебра s="2", пустые ячейки полосы не рвут', () => {
        const h = xmlHost();
        const xml = h._wsXlsSheetXml(
            [['A', 'B'], ['x', ''], ['y', '']],
            { zebra: [false, false, true] });
        assertTrue(xml.indexOf('<c r="A1" t="inlineStr" s="1">') !== -1,
            'шапка — прежний стиль s="1"');
        assertTrue(xml.indexOf('<c r="A2" t="inlineStr">') !== -1,
            'незебровая строка — БЕЗ s="2"');
        assertTrue(xml.indexOf('<c r="B2"') === -1,
            'пустая ячейка НЕзебры пропускается (sparse, как прежде)');
        assertTrue(xml.indexOf('<c r="A3" t="inlineStr" s="2">') !== -1,
            'строка зебры — s="2" на значениях');
        assertTrue(xml.indexOf('<c r="B3" s="2"/>') !== -1,
            'ПУСТАЯ ячейка зебры — ячейка со стилем (полоса без «дыр»)');
    });

    test('числовая ячейка зебры — s="2" перед <v>', () => {
        const h = xmlHost();
        const xml = h._wsXlsSheetXml(
            [['A'], [7]],
            { zebra: [false, true] });
        assertTrue(xml.indexOf('<c r="A2" s="2"><v>7</v></c>') !== -1,
            'число в зебровой строке — стиль при значении');
    });
});

// ============================================================
// 6. VM — книга: зебра в листах, сортировка, counts
// ============================================================
describe('Task 446 — VM: _buildArchiveWorkbook (зебра + структура)', () => {

    const EMP = [
        { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
          'смена': '', 'должность': 'Слесарь КИПиА', 'группа_допуска': 'IV',
          'дата_приёма': '2024-03-15' },
        { 'таб_номер': '031', 'ФИО': 'Сидоров С. С.', 'тип': 'сменный',
          'смена': 3, 'должность': 'Электромонтёр', 'группа_допуска': 'III',
          'дата_приёма': '2023-11-05' }
    ];
    const INSTR = [
        { id: 1, 'таб_номер': '999', 'тип': 'инструктаж', 'тема': 'Т',
          'дата_начала': D(NOWY, '05-01'), 'дата_окончания': D(NOWY, '05-01'),
          'выполнение': 1, 'просрочен': 0, 'комментарий': '' },
        { id: 2, 'таб_номер': '017', 'тип': 'инструктаж', 'тема': 'Т',
          'дата_начала': D(NOWY, '03-02'), 'дата_окончания': D(NOWY, '03-02'),
          'выполнение': 1, 'просрочен': 0, 'комментарий': '' },
        { id: 3, 'таб_номер': '017', 'тип': 'инструктаж', 'тема': 'Т',
          'дата_начала': D(NOWY + 1, '02-01'), 'дата_окончания': D(NOWY + 1, '02-01'),
          'выполнение': 1, 'просрочен': 0, 'комментарий': '' },
        { id: 4, 'таб_номер': '031', 'тип': 'инструктаж', 'тема': 'Т',
          'дата_начала': D(NOWY, '01-10'), 'дата_окончания': D(NOWY, '01-10'),
          'выполнение': 1, 'просрочен': 0, 'комментарий': '' }
    ];
    const EV = [
        { id: 31, 'таб_номер': '031', 'тип': 'обучение', 'тема': 'Курс Б',
          'дата_начала': D(NOWY, '09-01'), 'дата_окончания': D(NOWY, '09-02'),
          'длительность_дней': 2, 'комментарий': '' },
        { id: 32, 'таб_номер': '017', 'тип': 'обучение', 'тема': 'Курс А',
          'дата_начала': D(NOWY, '09-03'), 'дата_окончания': D(NOWY, '09-05'),
          'длительность_дней': 3, 'комментарий': '' }
    ];
    const PPE = [
        { id: 21, 'таб_номер': '031', 'работник': '', 'должность': 'Э',
          'наименование': 'Перчатки', 'дата_выдачи': D(NOWY, '02-02'),
          'дата_изготовления': '', 'срок_годности': 'До износа',
          'дата_окончания': 'До износа', 'примечание': '' },
        { id: 22, 'таб_номер': '017', 'работник': 'Иванов И. И.',
          'должность': 'С', 'наименование': 'Каска',
          'дата_выдачи': D(NOWY, '01-15'),
          'дата_изготовления': D(NOWY - 1, '06-01'),
          'срок_годности': '2 года',
          'дата_окончания': D(NOWY + 1, '06-01'), 'примечание': '' }
    ];

    function wbHost() {
        return new Function('return ({' +
            methodText(INDEX_SRC, '_workersArchiveData') + ',\n' +
            methodText(INDEX_SRC, '_buildArchiveWorkbook') + ',\n' +
            methodText(INDEX_SRC, '_ppePosNoGrade') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsZip') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsBytes') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsCrc32') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsColName') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsEsc') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsDocProps') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsSheetXml') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsStylesXml') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsZebraGroups') + ',\n' +
            "_isInstrType: function(t) { return t === 'инструктаж'; }," +
            "_isoDate: function() { return '2026-09-29'; }," +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_INSTR_ALL: ' + JSON.stringify(INSTR) + ',' +
            '_EVENTS_ALL: ' + JSON.stringify(EV) + ',' +
            '_TRAININGS: [], ' +
            '_PPE: ' + JSON.stringify(PPE) + ',' +
            '_VAC_YEARS: {' + NOWY + ': [{ id: 41, ' +
            "'таб_номер': '017', часть: 2," +
            " 'дата_начала': '" + D(NOWY, '06-01') + "'," +
            " 'дата_окончания': '" + D(NOWY, '06-10') + "'," +
            ' дней: 10, комментарий: "" },' +
            '{ id: 43, ' +
            "'таб_номер': '031', часть: 1," +
            " 'дата_начала': '" + D(NOWY, '07-01') + "'," +
            " 'дата_окончания': '" + D(NOWY, '07-14') + "'," +
            ' дней: 14, комментарий: "" }],' +
            (NOWY - 1) + ': [{ id: 42, ' +
            "'таб_номер': '017', часть: 1," +
            " 'дата_начала': '" + D(NOWY - 1, '12-29') + "'," +
            " 'дата_окончания': '" + D(NOWY, '01-11') + "'," +
            ' дней: 14, комментарий: "" }]' +
            '}, _VACATIONS: [], _vacYear: 0,' +
            '});')();
    }

    function parseZip(bytes) {
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const files = [];
        let pos = 0;
        while (pos + 30 <= bytes.length && dv.getUint32(pos, true) === 0x04034b50) {
            const nameLen = dv.getUint16(pos + 26, true);
            const extraLen = dv.getUint16(pos + 28, true);
            const usize = dv.getUint32(pos + 22, true);
            const name = Buffer.from(
                bytes.slice(pos + 30, pos + 30 + nameLen)).toString('utf8');
            const dataStart = pos + 30 + nameLen + extraLen;
            files.push({ name: name, data: bytes.slice(dataStart, dataStart + usize) });
            pos = dataStart + usize;
        }
        return files;
    }

    function sheetTxt(wb, n) {
        const f = parseZip(wb.bytes).find(x => x.name === 'xl/worksheets/sheet' + n + '.xml');
        return Buffer.from(f.data).toString('utf8');
    }

    test('styles.xml: fills 4 + заливка FFF2F2F2 + cellXfs 3', () => {
        const wb = wbHost()._buildArchiveWorkbook();
        const f = parseZip(wb.bytes).find(x => x.name === 'xl/styles.xml');
        const txt = Buffer.from(f.data).toString('utf8');
        assertTrue(txt.indexOf('<fills count="4">') !== -1, 'fills count 4');
        assertTrue(txt.indexOf('<fgColor rgb="FFF2F2F2"/>') !== -1,
            'заливка зебры #F2F2F2');
        assertTrue(txt.indexOf('<cellXfs count="3">') !== -1, 'cellXfs count 3');
        assertTrue(txt.indexOf('fillId="3"') !== -1, 'cellXf зебры — fillId 3');
    });

    test('лист 1 «Работники»: «Таб. №» жив, строки — зебра', () => {
        const wb = wbHost()._buildArchiveWorkbook();
        const txt = sheetTxt(wb, 1);
        assertTrue(txt.indexOf('<t>Таб. №</t>') !== -1,
            'справочник: «Таб. №» на месте');
        assertTrue(txt.indexOf('<t>id</t>') === -1,
            'колонки id нет');
        // Иванов (строка 2, первая группа) — БЕЗ заливки,
        // Сидоров (строка 3, вторая группа) — с заливкой
        assertTrue(txt.indexOf('<c r="B2" t="inlineStr">') !== -1,
            'Иванов: ФИО без s="2" (первая группа)');
        assertTrue(txt.indexOf('<c r="B3" t="inlineStr" s="2">') !== -1,
            'Сидоров: ФИО с s="2" (классическая зебра по строкам)');
    });

    test('лист 2 «Отпуска»: без id/«Таб. №», группы Иванова без заливки, Сидоров — с', () => {
        const wb = wbHost()._buildArchiveWorkbook();
        const txt = sheetTxt(wb, 2);
        assertTrue(txt.indexOf('<t>Таб. №</t>') === -1 &&
                   txt.indexOf('<t>id</t>') === -1,
            'колонок id/«Таб. №» нет');
        assertTrue(txt.indexOf('<t>ФИО</t>') !== -1, 'первая колонка — ФИО');
        // порядок: Иванов ×2 (29.12.prev, 01.06.cur — строки 2-3) →
        // Сидоров 01.07 (строка 4); группа Иванова — ПЕРВАЯ, без
        // заливки; Сидоров — вторая группа, с заливкой
        assertTrue(txt.indexOf('<c r="A2" t="inlineStr">') !== -1 &&
                   txt.indexOf('<c r="A3" t="inlineStr">') !== -1,
            'обе строки Иванова — без s="2" (одна незалитая группа)');
        assertTrue(txt.indexOf('<c r="A4" t="inlineStr" s="2">') !== -1,
            'Сидоров — вторая группа, с заливкой');
        const iI = txt.indexOf('29.12.' + (NOWY - 1));
        const iI2 = txt.indexOf('01.06.' + NOWY);
        const iS = txt.indexOf('01.07.' + NOWY);
        assertTrue(iI !== -1 && iI2 !== -1 && iS !== -1 &&
                   iI < iI2 && iI2 < iS,
            'сортировка ФИО → дата (группа Иванова подряд)');
    });

    test('лист 3 «Инструктажи»: сортировка по фамилиям + зебра групп', () => {
        const wb = wbHost()._buildArchiveWorkbook();
        const txt = sheetTxt(wb, 3);
        assertTrue(txt.indexOf('<t>Таб. №</t>') === -1 &&
                   txt.indexOf('<t>id</t>') === -1,
            'колонок id/«Таб. №» нет');
        // порядок фамилий: '' (строка 2) → Иванов (3,4) → Сидоров (5)
        const iI = txt.indexOf('Иванов И. И.');
        const iS = txt.indexOf('Сидоров С. С.');
        assertTrue(iI !== -1 && iS !== -1 && iI < iS,
            'Иванов выше Сидорова (фамилия первичнее ранней даты 10.01)');
        assertTrue(txt.indexOf('02.03.' + NOWY) < txt.indexOf('01.02.' + (NOWY + 1)),
            'внутри группы Иванова — по датам');
        // зебра: '' (нет заливки) → Иванов (s="2") → Сидоров (нет)
        assertTrue(txt.indexOf('<c r="A3" t="inlineStr" s="2">') !== -1 &&
                   txt.indexOf('<c r="A4" t="inlineStr" s="2">') !== -1,
            'обе строки Иванова — с заливкой (одна группа)');
        assertTrue(txt.indexOf('<c r="A5" t="inlineStr" s="2"') === -1,
            'Сидоров — следующая группа, без заливки');
        assertTrue(txt.indexOf('<c r="A2"') === -1,
            'пустое ФИО первой строки — ячейки нет (строка без заливки)');
    });

    test('лист 4 «СИЗ»: группа работника одной полосой, пустое примечание не рвёт полосу', () => {
        const wb = wbHost()._buildArchiveWorkbook();
        const txt = sheetTxt(wb, 4);
        assertTrue(txt.indexOf('<t>Таб. №</t>') === -1 &&
                   txt.indexOf('<t>id</t>') === -1,
            'колонок id/«Таб. №» нет');
        assertTrue(txt.indexOf('<t>Работник</t>') !== -1,
            'первая колонка — «Работник»');
        // Task 459: сортировка по фамилиям — Иванов (строка 2) → Сидоров (строка 3)
        // Иванов — первая группа (без заливки), Сидоров — вторая (s="2")
        assertTrue(txt.indexOf('<c r="A2" t="inlineStr">') !== -1,
            'Иванов: без s="2"');
        assertTrue(txt.indexOf('<c r="A3" t="inlineStr" s="2">') !== -1,
            'Сидоров: с заливкой');
        // у обоих примечание пустое: у НЕзебровой строки ячейки нет,
        // у зебровой — ячейка со стилем (полоса непрерывна)
        assertTrue(txt.indexOf('<c r="H2"') === -1,
            'пустое примечание незебровой строки пропущено');
        assertTrue(txt.indexOf('<c r="H3" s="2"/>') !== -1,
            'пустое примечание зебровой строки — ячейка со стилем');
    });

    test('лист 5 «Мероприятия»: дата-сортировка + зебра по блокам фамилий', () => {
        const wb = wbHost()._buildArchiveWorkbook();
        const txt = sheetTxt(wb, 5);
        assertTrue(txt.indexOf('<t>Таб. №</t>') === -1 &&
                   txt.indexOf('<t>id</t>') === -1,
            'колонок id/«Таб. №» нет');
        // сортировка по ДАТЕ: Сидоров 01.09 (строка 2) → Иванов 03.09 (строка 3)
        const iS = txt.indexOf('Сидоров С. С.');
        const iI = txt.indexOf('Иванов И. И.');
        assertTrue(iS !== -1 && iI !== -1 && iS < iI,
            'Мероприятия: прежняя сортировка по дате (Сидоров раньше)');
        // зебра по СМЕЖНЫМ группам: Сидоров (без заливки) → Иванов (s="2")
        assertTrue(txt.indexOf('<c r="A2" t="inlineStr">') !== -1,
            'Сидоров: без заливки');
        assertTrue(txt.indexOf('<c r="A3" t="inlineStr" s="2">') !== -1,
            'Иванов: с заливкой');
    });

    test('counts: состав книги не изменился', () => {
        const wb = wbHost()._buildArchiveWorkbook();
        assertEqual(wb.counts.employees, 2, 'работников 2');
        assertEqual(wb.counts.vacations, 3, 'отпусков 3');
        assertEqual(wb.counts.instr, 4, 'инструктажей 4');
        assertEqual(wb.counts.ppe, 2, 'СИЗ 2');
        assertEqual(wb.counts.events, 2, 'мероприятий 2');
        assertTrue(/\.xlsx$/.test(wb.name), 'имя файла прежнего формата');
    });
});

// ============================================================
// 7. SW + регресс
// ============================================================
describe('Task 446 — SW и регресс', () => {

    test('SW: кэш поднят до kipia-test-v732 (Task 446)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v732'") !== -1,
            'CACHE_VERSION = kipia-test-v732');
        assertTrue(SW_SRC.indexOf('Task 446') !== -1,
            'комментарий Task 446 в истории версий');
    });

    test('guard: двойного бампа не было', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v733') === -1,
            'kipia-test-v733 не существует');
    });

    test('регресс: id/«Таб. №» не вернулись в 4 листа архива', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_workersArchiveData'));
        assertTrue(fn.indexOf("'id', 'Таб. №'") === -1,
            'шапки 4 листов начинаются с колонки работника');
        const wb = stripComments(methodText(INDEX_SRC, '_buildArchiveWorkbook'));
        assertTrue(wb.indexOf('widths: [6, 9,') === -1,
            'ширины id(6)/«Таб. №»(9) исчезли из всех листов');
    });
});
