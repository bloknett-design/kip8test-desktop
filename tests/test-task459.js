// ============================================================
// Task 459 — заявка: «В скачиваемом excel файле архива
// работников, на листе СИЗ, в таблице отсортируй строки по
// алфавиту фамилий в столбце Работник, а в столбце Должность
// оставь наименование должностей без указания разрядов».
//
// Реализация (полностью КЛИЕНТСКАЯ, index.html):
//   • лист «СИЗ» выгрузки архива .xlsx — сортировка по АЛФАВИТУ
//     ФАМИЛИЙ колонки «Работник» (полное ФИО; приём листов
//     «Отпуска»/«Инструктажи» Task 446, прежде — по таб. №) →
//     наименование; записи одного работника идут ПОДРЯД (зебра
//     красит их одной полосой);
//   • НОВЫЙ хелпер _ppePosNoGrade — должность БЕЗ разрядов:
//     «Слесарь по КИП и А 5 разряда» → «Слесарь по КИП и А»,
//     арабские («5 разряда»/«5 разряд»/«5-го»/«5-й») и римские
//     («III разряда»), в конце и в середине строки; в отличие
//     от строгой формы «Талонов» (_talonsPosition, Tasks 449/
//     450) КИПиА НЕ канонизируется, пустая должность остаётся
//     пустой, мусорная «5 разряда» не опустошает ячейку;
//   • sw.js → kipia-test-v732.
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
// 1. SRC — хелпер _ppePosNoGrade
// ============================================================
describe('Task 459 — SRC: _ppePosNoGrade (должность без разряда)', () => {

    test('метод существует, комментарий-заявка над ним', () => {
        const idx = INDEX_SRC.indexOf('_ppePosNoGrade: function(');
        assertTrue(idx !== -1, 'метод _ppePosNoGrade определён');
        const above = INDEX_SRC.slice(Math.max(0, idx - 1700), idx);
        assertTrue(above.indexOf('Task 459') !== -1,
            'комментарий-ссылка на заявку Task 459');
        assertTrue(above.indexOf('указания разрядов') !== -1,
            'в комментарии — текст заявки');
        assertTrue(above.indexOf('лист «СИЗ» выгрузки архива') !== -1,
            'контекст: лист «СИЗ» архива .xlsx');
    });

    test('регексы разрядов: арабские + римские, lookahead вместо \\b', () => {
        const fn = methodText(INDEX_SRC, '_ppePosNoGrade');
        assertTrue(fn.indexOf('(?:го|й|е|ый|ой|ий)?\\s*разряд[ауе]?(?![а-яё])') !== -1,
            'суффиксы разрядов + граница слова (?![а-яё])');
        assertTrue(fn.indexOf('[ivx]+\\s*разряд[ауе]?(?![а-яё])') !== -1,
            'римские разряды (III разряда)');
        // ПОДВОДНЫЙ КАМЕНЬ Task 450: \b после кириллицы НЕ работает
        // (\w — только ASCII) — в коде запрещён
        assertTrue(fn.indexOf('разряд[ауе]?\\b') === -1,
            '\\b после кириллицы НЕ используется (камень Task 450)');
        assertTrue(fn.indexOf('[\\s,;:.]+$') !== -1,
            'зачистка хвостовой пунктуации');
        assertTrue(fn.indexOf('\\s{2,}') !== -1, 'схлопывание пробелов');
        assertTrue(fn.indexOf('return t || s;') !== -1,
            'фолбэк: пустой результат не опустошает ячейку');
        assertTrue(fn.indexOf("if (!s) return '';") !== -1,
            'пустая должность остаётся пустой');
    });

    test('отличие от строгой формы «Талонов»: КИПиА НЕ канонизируется', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_ppePosNoGrade'));
        assertTrue(fn.indexOf('КИП и А') === -1,
            'канонизации КИПиА → «по КИП и А» в хелпере НЕТ (это _talonsPosition)');
        assertTrue(fn.indexOf("'—'") === -1,
            'прочерк для пустой должности НЕ возвращается (не «—»)');
    });
});

// ============================================================
// 2. SRC — _workersArchiveData: секция СИЗ
// ============================================================
describe('Task 459 — SRC: секция СИЗ _workersArchiveData', () => {

    test('сортировка: ppeWkOf (фамилия) → наименование, таб. № убран', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_workersArchiveData'));
        const iSort = fn.indexOf('var ppes =');
        assertTrue(iSort !== -1, 'блок сортировки СИЗ на месте');
        const seg = fn.slice(iSort, iSort + 500);
        assertTrue(seg.indexOf("var f = ppeWkOf(a).localeCompare(ppeWkOf(b), 'ru');") !== -1,
            'первичный ключ — ФИО работника (ppeWkOf, ru)');
        assertTrue(seg.indexOf('String(a.наименование || \'\').localeCompare(') !== -1,
            'вторичный ключ — наименование (прежде)');
        // СТАРАЯ сортировка по таб. № удалена из метода
        assertTrue(fn.indexOf("var t = String(a['таб_номер'] || '').localeCompare(") === -1,
            'первичный ключ по таб. № УДАЛЁН (Task 459)');
    });

    test('строка данных: ppeWkOf + _ppePosNoGrade', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_workersArchiveData'));
        assertTrue(fn.indexOf('ppeWkOf(pz),') !== -1,
            'работник — через ppeWkOf (своё поле, фолбэк ФИО)');
        assertTrue(fn.indexOf('this._ppePosNoGrade(pz.должность),') !== -1,
            'должность — через _ppePosNoGrade (без разрядов)');
        assertTrue(fn.indexOf("String(pz.должность || ''),") === -1,
            'старая запись должности как есть — удалена');
    });

    test('комментарий блока архива упоминает Task 459', () => {
        const i446 = INDEX_SRC.indexOf('Task 446 (заявка): листы «Отпуска»');
        assertTrue(i446 !== -1, 'блок комментария Task 446 найден');
        const seg = INDEX_SRC.slice(i446, i446 + 900);
        assertTrue(seg.indexOf('Task 459') !== -1 &&
                   seg.indexOf('АЛФАВИТУ') !== -1,
            'строка Task 459 добавлена к комментарию блока архива');
    });
});

// ============================================================
// 3. VM — _ppePosNoGrade (чистая функция)
// ============================================================
describe('Task 459 — VM: _ppePosNoGrade', () => {

    function h() {
        return new Function('return ({' +
            methodText(INDEX_SRC, '_ppePosNoGrade') +
            '});')();
    }

    test('арабские разряды: конец строки, без «а», дефисные', () => {
        const host = h();
        assertEqual(host._ppePosNoGrade('Слесарь по КИП и А 5 разряда'),
            'Слесарь по КИП и А', '«5 разряда»');
        assertEqual(host._ppePosNoGrade('Слесарь КИПиА 5 разряд'),
            'Слесарь КИПиА', '«5 разряд» без «а»');
        assertEqual(host._ppePosNoGrade('Электромонтёр 4-го разряда'),
            'Электромонтёр', '«4-го разряда»');
        assertEqual(host._ppePosNoGrade('Электрик 5-й разряд'),
            'Электрик', '«5-й разряд»');
        assertEqual(host._ppePosNoGrade('Слесарь 5-го разряда.'),
            'Слесарь', 'хвостовая точка зачищена');
    });

    test('римские разряды и середина строки', () => {
        const host = h();
        assertEqual(host._ppePosNoGrade('Электромонтёр III разряда'),
            'Электромонтёр', 'римские «III разряда»');
        assertEqual(host._ppePosNoGrade('Слесарь 5 разряда КИПиА'),
            'Слесарь КИПиА', 'разряд в середине строки');
        assertEqual(host._ppePosNoGrade('Мастер, 6 разряда'),
            'Мастер', 'запятая перед разрядом зачищена');
        assertEqual(host._ppePosNoGrade('Слесарь  5   разряда'),
            'Слесарь', 'многочисленные пробелы схлопываются');
    });

    test('без разрядов — как есть; пустые; мусор — фолбэк', () => {
        const host = h();
        assertEqual(host._ppePosNoGrade('Мастер участка'),
            'Мастер участка', 'без разряда не меняется');
        assertEqual(host._ppePosNoGrade('Слесарь КИПиА 5 разряда '),
            'Слесарь КИПиА', 'хвостовой пробел');
        assertEqual(host._ppePosNoGrade(''), '', 'пустая строка');
        assertEqual(host._ppePosNoGrade(null), '', 'null');
        assertEqual(host._ppePosNoGrade(undefined), '', 'undefined');
        assertEqual(host._ppePosNoGrade('5 разряда'), '5 разряда',
            'мусорная строка из одного разряда — НЕ опустошается (фолбэк)');
    });

    test('КИПиА НЕ канонизируется (отличие от «Талонов» Tasks 449/450)', () => {
        const host = h();
        assertEqual(host._ppePosNoGrade('Слесарь КИПиА 5 разряда'),
            'Слесарь КИПиА', '«КИПиА» жив (не «по КИП и А»)');
        assertEqual(host._ppePosNoGrade('Мастер КИПиА 6 разряда'),
            'Мастер КИПиА', 'и здесь без канонизации');
        assertFalse(host._ppePosNoGrade('Мастер КИПиА 6 разряда') === 'Мастер по КИП и А',
            'строгая форма «Талонов» НЕ применяется к листу СИЗ');
    });
});

// ============================================================
// 4. VM — _workersArchiveData: сортировка листа СИЗ
// ============================================================
describe('Task 459 — VM: _workersArchiveData (СИЗ по фамилиям)', () => {

    const EMP = [
        { 'таб_номер': '017', 'ФИО': 'Сидоров С. С.', 'тип': 'сменный',
          'смена': 3, 'должность': 'Электромонтёр III разряда',
          'группа_допуска': 'III', 'дата_приёма': '2023-11-05' },
        { 'таб_номер': '031', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
          'смена': '', 'должность': 'Слесарь по КИП и А 5 разряда',
          'группа_допуска': 'IV', 'дата_приёма': '2024-03-15' },
        { 'таб_номер': '099', 'ФИО': 'Яковлев Я. Я.', 'тип': 'дневной',
          'смена': '', 'должность': 'Мастер КИПиА 6 разряда',
          'группа_допуска': '', 'дата_приёма': '2025-01-20' }
    ];

    function dataHost(ppe) {
        return new Function('return ({' +
            methodText(INDEX_SRC, '_workersArchiveData') + ',\n' +
            methodText(INDEX_SRC, '_ppePosNoGrade') + ',\n' +
            "_isInstrType: function(t) { return t === 'инструктаж'; }," +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_INSTR_ALL: [], _EVENTS_ALL: [], _TRAININGS: [],' +
            '_PPE: ' + JSON.stringify(ppe || []) + ',' +
            '_VAC_YEARS: {}, _VACATIONS: [], _vacYear: 0,' +
            '});')();
    }

    const mkPpe = (id, tab, wk, pos, name) => ({
        id: id, 'таб_номер': tab, 'работник': wk, 'должность': pos,
        'наименование': name, 'дата_выдачи': '2026-01-15',
        'дата_изготовления': '', 'срок_годности': 'До износа',
        'дата_окончания': 'До износа', 'примечание': '' });

    test('фамилия первичнее таб. №: Иванов (031) выше Сидорова (017)', () => {
        const d = dataHost([
            // порядок фикстуры и таб. № ДРУГОЙ: 017 Сидоров первым
            mkPpe(1, '017', '', 'Электромонтёр III разряда', 'Каска защитная'),
            mkPpe(2, '031', 'Иванов И. И.',
                  'Слесарь по КИП и А 5 разряда', 'Очки закрытые'),
            mkPpe(3, '031', 'Иванов И. И.',
                  'Слесарь по КИП и А 5 разряда', 'Ботинки'),
            mkPpe(4, '099', '', 'Мастер КИПиА 6 разряда', 'Перчатки')
        ])._workersArchiveData();
        assertEqual(d.ppe.length, 5, 'шапка + 4 СИЗ');
        // Task 459: Иванов (фамилия) — первым, хотя его таб 031
        // БОЛЬШЕ сидоровского 017 (прежняя сортировка дала бы
        // Сидорова первым)
        assertEqual(d.ppe[1][0], 'Иванов И. И.',
            'первая строка — Иванов (по фамилии, не по таб. №)');
        assertEqual(d.ppe[1][2], 'Ботинки',
            'внутри группы Иванова — по наименованию (Ботинки < Очки)');
        assertEqual(d.ppe[2][0], 'Иванов И. И.',
            'вторая — тоже Иванов: записи одного работника ПОДРЯД');
        assertEqual(d.ppe[2][2], 'Очки закрытые', 'наименование второй строки');
        assertEqual(d.ppe[3][0], 'Сидоров С. С.',
            'третья — Сидоров (фолбэк ФИО по таб. №)');
        assertEqual(d.ppe[4][0], 'Яковлев Я. Я.', 'четвёртая — Яковлев');
    });

    test('должности листа — без разрядов (арабские/римские/КИПиА жив)', () => {
        const d = dataHost([
            mkPpe(1, '017', '', 'Электромонтёр III разряда', 'Каска защитная'),
            mkPpe(2, '031', 'Иванов И. И.',
                  'Слесарь по КИП и А 5 разряда', 'Очки закрытые'),
            mkPpe(3, '031', 'Иванов И. И.', 'Слесарь КИПиА 5 разряд', 'Ботинки'),
            mkPpe(4, '099', '', 'Мастер, 6 разряда', 'Перчатки'),
            mkPpe(5, '099', '', 'Инженер КИПиА', 'Каска')
        ])._workersArchiveData();
        assertEqual(d.ppe[1][1], 'Слесарь КИПиА',
            '«5 разряд» снят (Ботинки — первая строка группы Иванова)');
        assertEqual(d.ppe[2][1], 'Слесарь по КИП и А',
            '«5 разряда» снят, формулировка жива');
        assertEqual(d.ppe[3][1], 'Электромонтёр', 'римские «III разряда» сняты');
        assertEqual(d.ppe[4][1], 'Инженер КИПиА',
            'группа Яковлева: «Каска» < «Перчатки» — Инженер без разряда как есть');
        assertEqual(d.ppe[5][1], 'Мастер', 'запятая с разрядом зачищена');
        // слова «разряд» нет ни в одной должности листа
        assertTrue(d.ppe.every(function(r) {
            return String(r[1]).indexOf('разряд') === -1;
        }), '«разряд» не встречается в столбце «Должность»');
    });

    test('своё поле «работник» приоритетнее фолбэка и входит в сортировку', () => {
        const d = dataHost([
            mkPpe(1, '017', '', 'Электрик', 'Перчатки'),
            // таб 999 нет в справочнике — фолбэк пуст, но своё поле живо
            mkPpe(2, '999', 'Арбузов А. А.', 'Слесарь КИПиА', 'Каска')
        ])._workersArchiveData();
        assertEqual(d.ppe.length, 3, 'шапка + 2 СИЗ');
        assertEqual(d.ppe[1][0], 'Арбузов А. А.',
            'первый — Арбузов: сортировка по полю «работник» (А < С)');
        assertEqual(d.ppe[2][0], 'Сидоров С. С.',
            'второй — Сидоров (фолбэк ФИО)');
    });
});

// ============================================================
// 5. VM — книга .xlsx: лист СИЗ (zip парсится по-настоящему)
// ============================================================
describe('Task 459 — VM: _buildArchiveWorkbook (лист СИЗ)', () => {

    const EMP = [
        { 'таб_номер': '017', 'ФИО': 'Сидоров С. С.', 'тип': 'дневной',
          'смена': '', 'должность': 'Электромонтёр III разряда',
          'группа_допуска': 'III', 'дата_приёма': '2023-11-05' },
        { 'таб_номер': '031', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
          'смена': '', 'должность': 'Слесарь по КИП и А 5 разряда',
          'группа_допуска': 'IV', 'дата_приёма': '2024-03-15' },
        { 'таб_номер': '099', 'ФИО': 'Арбузов А. А.', 'тип': 'дневной',
          'смена': '', 'должность': 'Мастер КИПиА 6 разряда',
          'группа_допуска': '', 'дата_приёма': '2025-01-20' }
    ];
    const PPE = [
        { id: 1, 'таб_номер': '017', 'работник': '',
          'должность': 'Электромонтёр III разряда',
          'наименование': 'Каска защитная', 'дата_выдачи': '2026-01-15',
          'дата_изготовления': '', 'срок_годности': 'До износа',
          'дата_окончания': 'До износа', 'примечание': '' },
        { id: 2, 'таб_номер': '031', 'работник': 'Иванов И. И.',
          'должность': 'Слесарь по КИП и А 5 разряда',
          'наименование': 'Очки закрытые', 'дата_выдачи': '2026-02-20',
          'дата_изготовления': '', 'срок_годности': '2 года',
          'дата_окончания': '2028-02-20', 'примечание': '' },
        { id: 3, 'таб_номер': '099', 'работник': '',
          'должность': 'Мастер КИПиА 6 разряда',
          'наименование': 'Перчатки', 'дата_выдачи': '2026-03-25',
          'дата_изготовления': '', 'срок_годности': 'До износа',
          'дата_окончания': 'До износа', 'примечание': 'nitrile' }
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
            "_isoDate: function() { return '2026-10-01'; }," +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_INSTR_ALL: [], _EVENTS_ALL: [], _TRAININGS: [],' +
            '_PPE: ' + JSON.stringify(PPE) + ',' +
            '_VAC_YEARS: {}, _VACATIONS: [], _vacYear: 0,' +
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

    test('лист СИЗ: порядок по фамилиям, «разряд» исчез, зебра групп', () => {
        const wb = wbHost()._buildArchiveWorkbook();
        assertEqual(wb.counts.ppe, 3, 'счётчик СИЗ 3');
        const f = parseZip(wb.bytes)
            .find(x => x.name === 'xl/worksheets/sheet4.xml');
        assertTrue(!!f, 'лист 4 (СИЗ) в книге');
        const txt = Buffer.from(f.data).toString('utf8');
        assertTrue(txt.indexOf('<t>Работник</t>') !== -1,
            'первая колонка — «Работник»');
        // порядок: Арбузов (A2) → Иванов (A3) → Сидоров (A4);
        // таб. № порядок был бы 017 Сидоров → 031 Иванов → 099 Арбузов
        const iA = txt.indexOf('Арбузов А. А.');
        const iI = txt.indexOf('Иванов И. И.');
        const iS = txt.indexOf('Сидоров С. С.');
        assertTrue(iA !== -1 && iI !== -1 && iS !== -1 &&
                   iA < iI && iI < iS,
            'фамилии по алфавиту: Арбузов → Иванов → Сидоров (не по таб. №)');
        // должности без разрядов
        assertNotContains(txt, 'разряд', '«разряд» исчез из листа СИЗ');
        assertNotContains(txt, 'III разряда', 'римский разряд снят');
        assertTrue(txt.indexOf('<t>Электромонтёр</t>') !== -1 &&
                   txt.indexOf('<t>Слесарь по КИП и А</t>') !== -1 &&
                   txt.indexOf('<t>Мастер КИПиА</t>') !== -1,
            'должности на листе — без разрядов, КИПиА жив');
        // зебра по группам: Арбузов — первая группа (без заливки),
        // Иванов — вторая (s="2"), Сидоров — третья (без заливки)
        assertTrue(txt.indexOf('<c r="A2" t="inlineStr">') !== -1,
            'Арбузов: без s="2" (первая группа)');
        assertTrue(txt.indexOf('<c r="A3" t="inlineStr" s="2">') !== -1,
            'Иванов: с заливкой (вторая группа)');
        assertTrue(txt.indexOf('<c r="A4" t="inlineStr" s="2"') === -1,
            'Сидоров: третья группа — без заливки');
    });
});

// ============================================================
// 6. SW + регресс
// ============================================================
describe('Task 459 — SW и регресс', () => {

    test('SW: кэш поднят до kipia-test-v732 (Task 459)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v732'") !== -1,
            'CACHE_VERSION = kipia-test-v732');
        assertTrue(SW_SRC.indexOf('Task 459') !== -1,
            'комментарий Task 459 в истории версий');
    });

    test('guard: двойного бампа не было', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v733') === -1,
            'kipia-test-v733 не существует');
    });

    test('регресс: лист «Работники» (справочник) — прежняя сортировка по ФИО', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_workersArchiveData'));
        assertTrue(fn.indexOf("String(a['ФИО'] || '').localeCompare(") !== -1,
            'справочник по-прежнему сортируется по ФИО');
        // прочие листы не тронуты: отпуска/инструктажи — по фамилиям,
        // мероприятия — по дате
        assertTrue(fn.indexOf('ins.sort(function(a, b) {') !== -1 &&
                   fn.indexOf('evs.sort(byDate);') !== -1,
            'сортировки инструктажей (фамилии) и мероприятий (дата) прежние');
    });
});

function assertNotContains(hay, needle, label) {
    assertTrue(String(hay).indexOf(needle) === -1, label);
}
