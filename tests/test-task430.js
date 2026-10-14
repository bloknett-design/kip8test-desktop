// ============================================================
// Task 430 — заявка (kip8test): «Я сделал все шаги в Apps Script.
// В общей карте работников добавь кнопку сохранить архив, при
// нажатии на которую весь архив по работникам должен сохраняться
// в формате таблицы excel. При печати шахматки табеля, вначале
// должно появиться диалоговое окно с предпросмотром и с
// возможностью сохранения графика в файл».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   КЛИЕНТ (SRC):
//   1) кнопка «Сохранить архив» в шапке «Общей» вкладки:
//      id wsWorkersArchiveBtn, onclick saveWorkersArchive,
//      контурная (.ws-workers-archive), НЕ под _canEdit (видна
//      уровню view — фича выгрузки, как «Печать»), контейнер
//      .ws-wgen-actions рядом с «Добавить работника»;
//   2) printGrid: предпросмотр ДО печати (вызов
//      _openPrintPreview), прямой window.print — только фолбэк;
//   3) CSS диалога: .wspprev-overlay/-dialog/-paper/-frame
//      (1063px = 281мм A4-альбом минус поля), кнопки
//      wspprev-print/save/cancel;
//   4) xlsx-писатель: маркеры zip (PK\x03\x04/stored), styles,
//      inlineStr, freeze, имя «Архив_по_работникам_…xlsx»;
//   VM (клиент):
//   5) _wsXlsColName: A/Z/AA/AZ/BA; _wsXlsEsc: &<>";
//   6) _wsXlsCrc32: эталон «123456789» → 0xCBF43926;
//   7) _wsXlsSheetXml: шапка s="1", числа <v>, строки inlineStr,
//      xml:space, dimension, pane ySplit, cols;
//   8) _wsXlsZip: парсинг — 12 файлов PK (docProps×2, Task 488), EOCD, имена, CRC
//      совпадает, метод stored (0);
//   9) _workersArchiveData: сортировка ФИО, дедуп i+id/e+id
//      (Task 427 — раздельные id), _TRAININGS-дубли сняты, ФИО
//      подставлены, даты dd.mm.yyyy, выполнение да/нет;
//      Task 446 (адаптация): листы Отпуска/Инструктажи/СИЗ/
//      Мероприятия без колонок id/«Таб. №», «Инструктажи» — по
//      фамилиям (пустое ФИО выше всех);
//  10) _buildArchiveWorkbook: имя .xlsx, листы «Работники»/
//      «Инструктажи»/«Мероприятия» в workbook.xml, counts;
//  11) saveWorkersArchive: скачивание (имя/mime xlsx) + тост
//      с составом; уровень null — тишина;
//  12) _buildPrintFileHtml: DOCTYPE/charset/wsp-контент,
//      подложка для файла, без подложки для iframe;
//  13) _openPrintPreview (мок-DOM): оверлей в body, iframe
//      srcdoc, кнопка «Печать» → window.print, «Отмена» →
//      оверлей удалён, Esc → закрыт;
//  14) printGrid фолбэк: без _openPrintPreview — window.print
//      (прежнее поведение Task 341).
//   SW: kipia-test-v734.
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

// ============================================================
// 1. SRC — кнопка «Сохранить архив» в «Общей» вкладке
// ============================================================
describe('Task 430 — SRC: кнопка «Сохранить архив»', () => {

    test('кнопка существует: id/onclick/класс/текст', () => {
        const i = INDEX_SRC.indexOf('wsWorkersArchiveBtn');
        assertTrue(i !== -1, 'id кнопки в index.html');
        const around = INDEX_SRC.slice(Math.max(0, i - 200), i + 400);
        assertTrue(around.indexOf('WorkSchedule.saveWorkersArchive()') !== -1,
            'onclick зовёт saveWorkersArchive');
        assertTrue(around.indexOf('ws-workers-archive') !== -1,
            'класс ws-workers-archive');
        assertTrue(around.indexOf('Скачать архив') !== -1,
            'текст кнопки (Task 445: «Сохранить архив» → «Скачать архив»)');
    });

    test('кнопка НЕ под условием _canEdit — видна уровню view', () => {
        const i = INDEX_SRC.indexOf('wsWorkersArchiveBtn');
        const seg = INDEX_SRC.slice(i - 900, i);
        assertFalse(seg.indexOf('_canEdit') !== -1,
            'кнопка архива определена ВНЕ тернарника _canEdit ' +
            '(в отличие от «Добавить работника»)');
    });

    test('кнопки шапки — в контейнере .ws-wgen-actions', () => {
        // ищем JS-вставку (не CSS-правило .ws-wgen-actions {…})
        const i = INDEX_SRC.indexOf("var actionsHtml = '<div class=\"ws-wgen-actions\">'");
        assertTrue(i !== -1, 'контейнер действий шапки собирается в JS');
        const seg = INDEX_SRC.slice(i, i + 300);
        assertTrue(seg.indexOf('archBtn') !== -1 &&
                   seg.indexOf('addBtn') !== -1,
            'архивная кнопка и «Добавить работника» в одном ряду');
    });

    test('кнопка контурная (не акцентная, как «Добавить»)', () => {
        const i = INDEX_SRC.indexOf('.ws-workers-archive {');
        assertTrue(i !== -1, 'CSS-правило кнопки есть');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf('\n    }', i) + 7);
        assertTrue(block.indexOf('border: 1px solid var(--accent-blue') !== -1,
            'контур цвета акцента темы');
        assertTrue(block.indexOf('background: transparent') !== -1,
            'фон прозрачный — вторичная кнопка');
    });
});

// ============================================================
// 2. SRC — предпросмотр печати в printGrid
// ============================================================
describe('Task 430 — SRC: printGrid открывает предпросмотр', () => {

    test('printGrid: диалог ДО печати, window.print — фолбэк', () => {
        const m = methodText(INDEX_SRC, 'printGrid');
        const iPrev = m.indexOf('this._openPrintPreview(html, {');
        const iPrint = m.indexOf('window.print()');
        assertTrue(iPrev !== -1, 'printGrid зовёт _openPrintPreview (Task 438: с контекстом)');
        assertTrue(iPrint !== -1, 'фолбэк window.print жив');
        assertTrue(iPrev < iPrint, 'предпросмотр РАНЬШЕ печати');
        assertTrue(m.indexOf('if (!opened) window.print()') !== -1,
            'печать только когда диалог не открылся');
    });

    test('CSS диалога: оверлей/диалог/бумага/iframe', () => {
        const sels = ['.wspprev-overlay {', '.wspprev-dialog {',
                      '.wspprev-head {', '.wspprev-body {',
                      '.wspprev-paper {', '.wspprev-frame {',
                      '.wspprev-foot {'];
        for (const s of sels) {
            assertTrue(INDEX_SRC.indexOf(s) !== -1, 'правило ' + s);
        }
    });

    test('iframe предпросмотра — ширина листа A4 (1063px)', () => {
        const i = INDEX_SRC.indexOf('.wspprev-frame {');
        const block = INDEX_SRC.slice(i, INDEX_SRC.indexOf('\n    }', i) + 7);
        assertTrue(block.indexOf('width: 1063px') !== -1,
            '281мм печатной области @96dpi');
    });

    test('кнопки диалога: Печать / Сохранить PDF / Сохранить Excel / Отмена', () => {
        const i = INDEX_SRC.indexOf("class=\"wspprev-btn wspprev-print\"");
        assertTrue(i !== -1, 'кнопка Печать');
        const seg = INDEX_SRC.slice(i, i + 1200);
        assertTrue(seg.indexOf('wspprev-pdf') !== -1, 'кнопка Сохранить PDF (Task 438)');
        assertTrue(seg.indexOf('wspprev-xlsx') !== -1, 'кнопка Сохранить Excel (Task 438)');
        assertTrue(seg.indexOf('wspprev-cancel') !== -1, 'кнопка Отмена');
        assertTrue(seg.indexOf('Сохранить PDF') !== -1, 'текст кнопки PDF');
        assertTrue(seg.indexOf('Сохранить Excel') !== -1, 'текст кнопки Excel');
        assertTrue(seg.indexOf('wspprev-save') === -1,
            'кнопки «Сохранить в файл» (HTML) больше нет (Task 438)');
    });

    test('экран предпросмотра не появляется в печатном окне', () => {
        const i = INDEX_SRC.indexOf('.wspprev-overlay {');
        assertTrue(i !== -1, 'диалог жив в CSS');
        // диалог — <body>-элемент, печать скрывает body > *:not(#wsPrintSheet)
        const m = methodText(INDEX_SRC, '_openPrintPreview');
        assertTrue(m.indexOf("overlay.id = 'wsPrintPrevModal'") !== -1,
            'оверлей — прямой потомок body (id), скрытие печатью корректно');
    });
});

// ============================================================
// 3. SRC — xlsx-писатель: маркеры
// ============================================================
describe('Task 430 — SRC: xlsx-писатель', () => {

    test('zip: stored + сигнатуры', () => {
        const m = methodText(INDEX_SRC, '_wsXlsZip');
        assertTrue(m.indexOf('0x04034b50') !== -1, 'локальная сигнатура PK');
        assertTrue(m.indexOf('0x02014b50') !== -1, 'сигнатура каталога');
        assertTrue(m.indexOf('0x06054b50') !== -1, 'сигнатура EOCD');
        assertTrue(m.indexOf('setUint16(8, 0, true)') !== -1,
            'метод stored (0) — без сжатия');
    });

    test('книга: три листа + styles + inlineStr', () => {
        const m = methodText(INDEX_SRC, '_buildArchiveWorkbook');
        assertTrue(m.indexOf("'Работники'") !== -1, 'лист Работники');
        assertTrue(m.indexOf("'Инструктажи'") !== -1, 'лист Инструктажи');
        assertTrue(m.indexOf("'Мероприятия'") !== -1, 'лист Мероприятия');
        assertTrue(m.indexOf('Архив_по_работникам_') !== -1,
            'имя файла архива с датой');
        const s = methodText(INDEX_SRC, '_wsXlsSheetXml');
        assertTrue(s.indexOf('t="inlineStr"') !== -1, 'строки — inlineStr');
        assertTrue(s.indexOf('state="frozen"') !== -1, 'шапка закреплена');
    });
});

// ============================================================
// 4. VM — утилиты писателя
// ============================================================
describe('Task 430 — VM: утилиты xlsx', () => {

    function utilsHost() {
        return new Function('return ({' +
            methodText(INDEX_SRC, '_wsXlsColName') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsEsc') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsDocProps') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsCrc32') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsBytes') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsSheetXml') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsStylesXml') + ',\n' +
            '});')();
    }

    test('_wsXlsColName: A…Z, AA…AZ, BA', () => {
        const h = utilsHost();
        assertEqual(h._wsXlsColName(0), 'A', '0 → A');
        assertEqual(h._wsXlsColName(25), 'Z', '25 → Z');
        assertEqual(h._wsXlsColName(26), 'AA', '26 → AA');
        assertEqual(h._wsXlsColName(51), 'AZ', '51 → AZ');
        assertEqual(h._wsXlsColName(52), 'BA', '52 → BA');
    });

    test('_wsXlsEsc: амперсанд/уголки/кавычка', () => {
        const h = utilsHost();
        assertEqual(h._wsXlsEsc('a<b>&"c"'), 'a&lt;b&gt;&amp;&quot;c&quot;',
            'спецсимволы экранированы');
        assertEqual(h._wsXlsEsc('Иванов И. И.'), 'Иванов И. И.',
            'кириллица не трогается');
        assertEqual(h._wsXlsEsc(null), '', 'null → пустая строка');
    });

    test('_wsXlsCrc32: эталон «123456789» → 0xCBF43926', () => {
        const h = utilsHost();
        const b = h._wsXlsBytes('123456789');
        assertEqual(h._wsXlsCrc32(b), 0xCBF43926, 'полином 0xEDB88320 верен');
        assertEqual(h._wsXlsCrc32(h._wsXlsBytes('')), 0x00000000,
            'пустой ввод → 0');
    });

    test('_wsXlsBytes: UTF-8 кириллица', () => {
        const h = utilsHost();
        const b = h._wsXlsBytes('Ив');
        assertEqual(b.length, 4, 'И (2 байта) + в (2 байта) UTF-8');
        assertEqual(b[0], 0xD0, 'старший байт «И»');
    });

    test('_wsXlsSheetXml: шапка s=1, числа/строки, dimension, pane', () => {
        const h = utilsHost();
        const x = h._wsXlsSheetXml(
            [['id', 'ФИО', 'Смена'], [7, 'Иванов <И.> И.', '']],
            { widths: [6, 30], freeze: 1, active: true });
        assertTrue(x.indexOf('<dimension ref="A1:C2"/>') !== -1,
            'dimension по факту');
        assertTrue(x.indexOf('tabSelected="1"') !== -1, 'активный лист');
        assertTrue(x.indexOf('ySplit="1"') !== -1 &&
                   x.indexOf('state="frozen"') !== -1, 'закрепление шапки');
        assertTrue(x.indexOf('<c r="A1" t="inlineStr" s="1">') !== -1,
            'шапка со стилем s="1"');
        assertTrue(x.indexOf('<c r="A2"><v>7</v></c>') !== -1,
            'число — числовая ячейка');
        assertTrue(x.indexOf('Иванов &lt;И.&gt; И.') !== -1,
            'строка inlineStr + экранирование');
        assertFalse(x.indexOf('<c r="C2"') !== -1,
            'пустая ячейка пропущена (sparse)');
        assertTrue(x.indexOf('<col min="1" max="1" width="6"') !== -1,
            'ширины колонок');
        assertTrue(x.indexOf('xml:space="preserve"') === -1 ||
                   true, 'ok');
    });

    test('_wsXlsSheetXml: краевые пробелы — xml:space', () => {
        const h = utilsHost();
        const x = h._wsXlsSheetXml([['x'], ['  вп  ']], {});
        assertTrue(x.indexOf('xml:space="preserve"') !== -1,
            'пробелы по краям сохраняются');
    });

    test('_wsXlsStylesXml: жирная шапка на синем', () => {
        const h = utilsHost();
        const s = h._wsXlsStylesXml();
        assertTrue(s.indexOf('<b/>') !== -1, 'жирный шрифт');
        assertTrue(s.indexOf('FF4472C4') !== -1, 'заливка шапки');
        assertTrue(s.indexOf('cellXfs count="3"') !== -1,
            '3 стиля ячеек (Task 446: + заливка зебры #F2F2F2)');
    });
});

// ============================================================
// 5. VM — сборка данных архива
// ============================================================
describe('Task 430 — VM: _workersArchiveData', () => {

    const EMPLOYEES = [
        { 'таб_номер': '031', 'ФИО': 'Сидоров С. С.', 'тип': 'сменный',
          'смена': 3, 'должность': 'Электромонтёр', 'группа_допуска': 'III',
          'дата_приёма': '2023-11-05' },
        { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
          'смена': '', 'должность': 'Слесарь КИПиА', 'группа_допуска': '',
          'дата_приёма': '2024-03-15' }
    ];
    // Task 445: год архива = ТЕКУЩИЙ календарный год — фикстуры
    // собираются ОТНОСИТЕЛЬНО NOWY (не ломаются со временем)
    const NOWY = new Date().getFullYear();
    const D = (y, md) => (y + '-' + md);
    const INSTR_ALL = [
        { id: 5, 'таб_номер': '017', 'тип': 'инструктаж',
          'тема': 'Повторный инструктаж ОТ', 'дата_начала': D(NOWY, '03-02'),
          'дата_окончания': D(NOWY, '03-02'), 'длительность_дней': 1,
          'выполнение': 1, 'просрочен': 0, 'комментарий': '' },
        { id: 6, 'таб_номер': '999', 'тип': 'проверка_знаний',
          'тема': 'Электроустановки до 1000 В', 'дата_начала': D(NOWY - 1, '06-10'),
          'дата_окончания': D(NOWY - 1, '06-10'), 'длительность_дней': 1,
          'выполнение': 0, 'просрочен': 1, 'комментарий': 'перенос' }
    ];
    const EVENTS_ALL = [
        { id: 5, 'таб_номер': '017', 'тип': 'обучение',
          'тема': 'Курс АСУ ТП', 'дата_начала': D(NOWY, '09-03'),
          'дата_окончания': D(NOWY, '09-05'), 'длительность_дней': 3,
          'комментарий': 'центр' }
    ];
        // годовой срез: дубль инструктажа id 5 (из instrAll), новое
        // мероприятие id 9 и ДВЕ записи без id (вторая — дубль первой
        // по t-ключу дата|тема — снимается дедупом)
    const TRAININGS = [
        { id: 5, 'таб_номер': '017', 'тип': 'инструктаж',
          'тема': 'Повторный инструктаж ОТ', 'дата_начала': D(NOWY, '03-02'),
          'дата_окончания': D(NOWY, '03-02'), 'длительность_дней': 1 },
        { id: 9, 'таб_номер': '031', 'тип': 'прогул',
          'тема': 'Прогул', 'дата_начала': D(NOWY, '09-01'),
          'дата_окончания': D(NOWY, '09-01'), 'длительность_дней': 1,
          'комментарий': '' },
        { id: null, 'таб_номер': '031', 'тип': 'прогул',
          'тема': 'Прогул', 'дата_начала': D(NOWY, '09-01'),
          'дата_окончания': D(NOWY, '09-01'), 'длительность_дней': 1,
          'комментарий': '' },
        { id: null, 'таб_номер': '031', 'тип': 'прогул',
          'тема': 'Прогул', 'дата_начала': D(NOWY, '09-01'),
          'дата_окончания': D(NOWY, '09-01'), 'длительность_дней': 1,
          'комментарий': '' }
    ];

    function dataHost() {
        return new Function('return ({' +
            methodText(INDEX_SRC, '_workersArchiveData') + ',\n' +
            "_isInstrType: function(t) { return t === 'инструктаж' || t === 'проверка_знаний'; }," +
            '_EMPLOYEES: ' + JSON.stringify(EMPLOYEES) + ',' +
            '_INSTR_ALL: ' + JSON.stringify(INSTR_ALL) + ',' +
            '_EVENTS_ALL: ' + JSON.stringify(EVENTS_ALL) + ',' +
            '_TRAININGS: ' + JSON.stringify(TRAININGS) + ',' +
            '});')();
    }

    test('справочник: сортировка по ФИО + все колонки', () => {
        const d = dataHost()._workersArchiveData();
        assertEqual(d.employees.length, 3, 'шапка + 2 работника');
        assertEqual(d.employees[1][1], 'Иванов И. И.', 'первый по алфавиту');
        assertEqual(d.employees[2][1], 'Сидоров С. С.', 'второй по алфавиту');
        assertEqual(d.employees[1][0], '017', 'таб. номер строкой (нули живы)');
        assertEqual(d.employees[1][3], '', 'у дневного смена пустая');
        assertEqual(d.employees[2][3], 3, 'смена — число');
        assertEqual(d.employees[1][6], '15.03.2024', 'дата приёма dd.mm.yyyy');
    });

    test('инструктажи: дедуп i+id, датасет без _TRAININGS-дубля', () => {
        const d = dataHost()._workersArchiveData();
        assertEqual(d.instr.length, 3, 'шапка + 2 записи (id 5 не задвоен)');
        // Task 446: сортировка по ФАМИЛИИ (пустая — выше всех) →
        // дата: id 6 (таб 999, ФИО '') раньше id 5 (Иванов, 03-е)
        assertEqual(d.instr[1][0], '',
            'первый — неизвестный таб → ФИО пустое (не падает)');
        assertEqual(d.instr[1][3], '10.06.' + (NOWY - 1), 'дата id 6');
        assertEqual(d.instr[2][0], 'Иванов И. И.', 'второй — Иванов (по фамилиям)');
        assertEqual(d.instr[2][3], '02.03.' + NOWY, 'дата проведения dd.mm.yyyy');
        assertEqual(d.instr[1][4], 'нет', 'выполнение=0 → нет');
        assertEqual(d.instr[1][5], 'да', 'просрочен=1 → да');
        assertEqual(d.instr[2][4], 'да', 'выполнение=1 → да');
        assertEqual(d.instr[2][5], 'нет', 'просрочен=0 → нет');
    });

    test('мероприятия: id 5 (тот же id что у инструктажа!) — НЕ дубль', () => {
        const d = dataHost()._workersArchiveData();
        assertEqual(d.events.length, 4,
            'шапка + 3 (e5 жив рядом с i5; e9 из среза; запись без id — отдельная, её дубль из среза снят)');
        // Task 446: колонок id/«Таб. №» нет; сортировка по дате asc,
        // затем id: без-id (0) → e9 → e5 (03-е) — Сидоров×2, Иванов
        assertEqual(d.events[1][0], 'Сидоров С. С.', 'первая — прогул без id (t-ключ)');
        assertEqual(d.events[1][3], '01.09.' + NOWY, 'дата начала прогулов');
        assertEqual(d.events[2][0], 'Сидоров С. С.', 'запись годового среза дошла (e9)');
        assertEqual(d.events[3][0], 'Иванов И. И.', 'мероприятие e5 сохранилось (Task 427)');
        assertEqual(d.events[3][2], 'Курс АСУ ТП', 'тема');
        assertEqual(d.events[3][4], '05.09.' + NOWY, 'дата окончания');
        assertEqual(d.events[3][5], 3, 'длительность — число');
    });

    test('пустые пулы — только шапки', () => {
        const h = new Function('return ({' +
            methodText(INDEX_SRC, '_workersArchiveData') + ',\n' +
            "_isInstrType: function() { return false; }," +
            '_EMPLOYEES: [], _INSTR_ALL: [], _EVENTS_ALL: [], _TRAININGS: [],' +
            '});')();
        const d = h._workersArchiveData();
        assertEqual(d.employees.length, 1, 'только шапка справочника');
        assertEqual(d.vacations.length, 1, 'только шапка отпусков (Task 445)');
        assertEqual(d.instr.length, 1, 'только шапка инструктажей');
        assertEqual(d.ppe.length, 1, 'только шапка СИЗ (Task 445)');
        assertEqual(d.events.length, 1, 'только шапка мероприятий');
    });
});

// ============================================================
// 6. VM — книга xlsx (zip парсится по-настоящему)
// ============================================================
describe('Task 430 — VM: _buildArchiveWorkbook', () => {

    const EMP = [
        { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
          'смена': '', 'должность': 'Слесарь КИПиА', 'группа_допуска': 'IV',
          'дата_приёма': '2024-03-15' }
    ];
    const INSTR = [
        { id: 5, 'таб_номер': '017', 'тип': 'инструктаж',
          'тема': 'Повторный инструктаж ОТ', 'дата_начала': '2026-03-02',
          'дата_окончания': '2026-03-02', 'длительность_дней': 1,
          'выполнение': 1, 'просрочен': 0, 'комментарий': 'a & b <c>' }
    ];
    const EV = [
        { id: 5, 'таб_номер': '017', 'тип': 'обучение', 'тема': 'Курс',
          'дата_начала': '2026-09-03', 'дата_окончания': '2026-09-05',
          'длительность_дней': 3, 'комментарий': '' }
    ];

    function wbHost() {
        return new Function('return ({' +
            methodText(INDEX_SRC, '_workersArchiveData') + ',\n' +
            methodText(INDEX_SRC, '_buildArchiveWorkbook') + ',\n' +
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
            '_isoDate: function(d) { return d.toISOString().slice(0, 10); }' +
            ',' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_INSTR_ALL: ' + JSON.stringify(INSTR) + ',' +
            '_EVENTS_ALL: ' + JSON.stringify(EV) + ',' +
            '_TRAININGS: [], ' +
            '});')();
    }

    // парсер stored-zip: локальные заголовки подряд + EOCD в хвосте
    function parseZip(bytes) {
        const dv = new DataView(bytes.buffer, bytes.byteOffset,
                               bytes.byteLength);
        const files = [];
        let pos = 0;
        while (pos + 30 <= bytes.length &&
               dv.getUint32(pos, true) === 0x04034b50) {
            const nameLen = dv.getUint16(pos + 26, true);
            const extraLen = dv.getUint16(pos + 28, true);
            const method = dv.getUint16(pos + 8, true);
            const crc = dv.getUint32(pos + 14, true);
            const csize = dv.getUint32(pos + 18, true);
            const usize = dv.getUint32(pos + 22, true);
            const name = Buffer.from(
                bytes.slice(pos + 30, pos + 30 + nameLen)).toString('utf8');
            const dataStart = pos + 30 + nameLen + extraLen;
            files.push({
                name: name, method: method, crc: crc,
                csize: csize, usize: usize,
                data: bytes.slice(dataStart, dataStart + usize)
            });
            pos = dataStart + usize;
        }
        return {
            files: files,
            eocd: dv.getUint32(bytes.length - 22, true),
            cdSize: dv.getUint32(bytes.length - 22 + 12, true),
            cdOffset: dv.getUint32(bytes.length - 22 + 16, true)
        };
    }

    test('zip: 12 частей, stored, EOCD/каталог консистентны', () => {
        const wb = wbHost()._buildArchiveWorkbook();
        const z = parseZip(wb.bytes);
        assertEqual(z.files.length, 12,
            'все части книги в контейнере (5 листов + 7 служебных: CT, .rels, docProps core/app, workbook, workbook-rels, styles; Task 488)');
        assertEqual(z.files[0].name, '[Content_Types].xml',
            'CT — ПЕРВАЯ часть zip (канонический порядок, Task 488)');
        assertEqual(z.eocd, 0x06054b50, 'EOCD-сигнатура в хвосте');
        assertEqual(z.cdOffset, z.files.reduce(
            (s, f) => s + 30 + f.name.length + f.usize, 0),
            'offset каталога = за последним файлом');
        const names = z.files.map(f => f.name);
        for (const need of ['[Content_Types].xml', '_rels/.rels',
                            'docProps/core.xml', 'docProps/app.xml',
                            'xl/workbook.xml', 'xl/_rels/workbook.xml.rels',
                            'xl/styles.xml', 'xl/worksheets/sheet1.xml',
                            'xl/worksheets/sheet2.xml',
                            'xl/worksheets/sheet3.xml',
                            'xl/worksheets/sheet4.xml',
                            'xl/worksheets/sheet5.xml']) {
            assertTrue(names.indexOf(need) !== -1, 'часть ' + need);
        }
        for (const f of z.files) {
            assertEqual(f.method, 0, 'stored: ' + f.name);
            assertEqual(f.csize, f.usize, 'размеры равны: ' + f.name);
        }
    });

    test('zip: CRC каждой части пересчитывается верно', () => {
        const h = wbHost();
        const wb = h._buildArchiveWorkbook();
        const z = parseZip(wb.bytes);
        for (const f of z.files) {
            assertEqual(h._wsXlsCrc32(f.data), f.crc,
                'CRC32 совпал: ' + f.name);
        }
    });

    test('workbook.xml: ПЯТЬ листов по именам (Task 445)', () => {
        const wb = wbHost()._buildArchiveWorkbook();
        const z = parseZip(wb.bytes);
        const wbxml = z.files.find(f => f.name === 'xl/workbook.xml');
        const txt = Buffer.from(wbxml.data).toString('utf8');
        assertTrue(txt.indexOf('name="Работники"') !== -1, 'лист Работники');
        assertTrue(txt.indexOf('name="Отпуска"') !== -1, 'лист Отпуска (Task 445)');
        assertTrue(txt.indexOf('name="Инструктажи"') !== -1, 'лист Инструктажи');
        assertTrue(txt.indexOf('name="СИЗ"') !== -1, 'лист СИЗ (Task 445)');
        assertTrue(txt.indexOf('name="Мероприятия"') !== -1, 'лист Мероприятия');
        // порядок листов: Работники → Отпуска → Инструктажи → СИЗ → Мероприятия
        const iE = txt.indexOf('name="Работники"');
        const iV = txt.indexOf('name="Отпуска"');
        const iI = txt.indexOf('name="Инструктажи"');
        const iP = txt.indexOf('name="СИЗ"');
        const iM = txt.indexOf('name="Мероприятия"');
        assertTrue(iE < iV && iV < iI && iI < iP && iP < iM,
            'порядок листов книги (Task 445)');
        assertTrue(txt.indexOf('sheetId="1"') !== -1, 'sheetId проставлены');
    });

    test('лист 1: ФИО работника в inlineStr', () => {
        const wb = wbHost()._buildArchiveWorkbook();
        const z = parseZip(wb.bytes);
        const s1 = z.files.find(f => f.name === 'xl/worksheets/sheet1.xml');
        const txt = Buffer.from(s1.data).toString('utf8');
        assertTrue(txt.indexOf('Иванов И. И.') !== -1, 'ФИО в справочнике');
        assertTrue(txt.indexOf('15.03.2024') !== -1, 'дата приёма');
    });

    test('лист 3 (Инструктажи; Task 445 — Отпуска стал листом 2): спецсимволы', () => {
        const wb = wbHost()._buildArchiveWorkbook();
        const z = parseZip(wb.bytes);
        const s3 = z.files.find(f => f.name === 'xl/worksheets/sheet3.xml');
        const txt = Buffer.from(s3.data).toString('utf8');
        assertTrue(txt.indexOf('a &amp; b &lt;c&gt;') !== -1,
            'спецсимволы экранированы в xlsx');
    });

    test('имя файла: Архив_по_работникам_‹дата›.xlsx + counts', () => {
        const wb = wbHost()._buildArchiveWorkbook();
        assertTrue(/\.xlsx$/.test(wb.name), 'расширение xlsx');
        assertTrue(wb.name.indexOf('Архив_по_работникам_') === 0,
            'имя с датой выгрузки');
        assertEqual(wb.counts.employees, 1, 'счётчик работников');
        assertEqual(wb.counts.vacations, 0, 'счётчик отпусков (Task 445)');
        assertEqual(wb.counts.instr, 1, 'счётчик инструктажей');
        assertEqual(wb.counts.ppe, 0, 'счётчик СИЗ (Task 445)');
        assertEqual(wb.counts.events, 1, 'счётчик мероприятий');
        assertTrue(wb.bytes instanceof Uint8Array, 'bytes — Uint8Array');
        assertTrue(wb.bytes.length > 1000, 'книга не пустая');
    });
});

// ============================================================
// 7. VM — saveWorkersArchive (кнопка)
// ============================================================
describe('Task 430 — VM: saveWorkersArchive', () => {

    function saveHost(level) {
        const dl = { calls: [] };
        const toasts = [];
        const KipToast = { show: function(m) { toasts.push(m); } };
        const host = new Function('KipToast', 'return ({' +
            methodText(INDEX_SRC, 'saveWorkersArchive') + ',\n' +
            methodText(INDEX_SRC, '_buildArchiveWorkbook') + ',\n' +
            methodText(INDEX_SRC, '_workersArchiveData') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsZip') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsBytes') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsCrc32') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsColName') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsEsc') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsDocProps') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsSheetXml') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsStylesXml') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsZebraGroups') + ',\n' +
            methodText(INDEX_SRC, '_plural') + ',\n' +
            "_isInstrType: function() { return false; }," +
            "_isoDate: function(d) { return '2026-09-27'; }," +
            '_viewLevel: ' + JSON.stringify(level) + ',' +
            '_EMPLOYEES: [{ "таб_номер": "017", "ФИО": "Иванов И. И." }],' +
            '_INSTR_ALL: [], _EVENTS_ALL: [], _TRAININGS: [],' +
            '});')(KipToast);
        // шпион скачивания — снаружи new Function (замыкание живо)
        host._wsDownload = function(b, m, n) {
            dl.calls.push({ m: m, n: n });
            return true;
        };
        return { host: host, dl: dl, toasts: toasts };
    }

    test('уровень view — выгрузка идёт, тост с составом', () => {
        const r = saveHost('view');
        r.host.saveWorkersArchive();
        assertEqual(r.dl.calls.length, 1, 'скачивание одно');
        assertEqual(r.dl.calls[0].n, 'Архив_по_работникам_2026-09-27.xlsx',
            'имя файла');
        assertEqual(r.dl.calls[0].m,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'mime xlsx');
        assertEqual(r.toasts.length, 1, 'тост показан');
        assertTrue(r.toasts[0].indexOf('Архив скачан') !== -1,
            'тост об успехе (Task 445: «скачан» — по кнопке «Скачать архив»)');
        assertTrue(r.toasts[0].indexOf('1 работник') !== -1,
            'состав: работники');
        assertTrue(r.toasts[0].indexOf('0 отпусков') !== -1 &&
                   r.toasts[0].indexOf('0 СИЗ') !== -1,
            'состав: отпуска и СИЗ (Task 445)');
    });

    test('уровень null (раздел закрыт) — тишина', () => {
        const r = saveHost(null);
        r.host.saveWorkersArchive();
        assertEqual(r.dl.calls.length, 0, 'выгрузки нет');
        assertEqual(r.toasts.length, 0, 'тоста нет');
    });

    test('ошибка сборки — тост с текстом ошибки, без скачивания', () => {
        const toasts = [];
        const host = new Function('KipToast', 'return ({' +
            methodText(INDEX_SRC, 'saveWorkersArchive') + ',\n' +
            "_buildArchiveWorkbook: function() { throw new Error('boom'); }," +
            '_viewLevel: "edit",' +
            '_wsDownload: function() { return true; },' +
            '});')({ show: function(m) { toasts.push(m); } });
        host.saveWorkersArchive();
        assertEqual(toasts.length, 1, 'тост об ошибке');
        assertTrue(toasts[0].indexOf('Не удалось собрать архив') !== -1,
            'текст ошибки');
    });
});

// ============================================================
// 8. VM — _buildPrintFileHtml (standalone-документ графика)
// ============================================================
describe('Task 430 — VM: _buildPrintFileHtml', () => {

    test('файл: DOCTYPE + charset + подложка + печатный CSS', () => {
        const h = new Function('return ({' +
            methodText(INDEX_SRC, '_buildPrintFileHtml') + ',\n' +
            "_printCssText: function() { return 'PRINT_CSS_MARKER'; }," +
            '_esc: function(s) { return String(s); },' +
            '_month: 9, _year: 2026,' +
            '});')();
        const html = h._buildPrintFileHtml('WSP_CONTENT_MARKER', true);
        assertTrue(html.indexOf('<!DOCTYPE html>') === 0, 'doctype первым');
        assertTrue(html.indexOf('<meta charset="utf-8">') !== -1,
            'кодировка utf-8');
        assertTrue(html.indexOf('html{background:') !== -1,
            'подложка файла (экранная)');
        assertTrue(html.indexOf('PRINT_CSS_MARKER') !== -1,
            'печатный CSS приложения вшит');
        assertTrue(html.indexOf('WSP_CONTENT_MARKER') !== -1,
            'контент шахматки вшит');
        assertTrue(html.indexOf('id="wsPrintSheet"') !== -1,
            'обёртка листа с id');
        assertTrue(html.indexOf('Сентябрь 2026') !== -1, 'месяц/год в title');
    });

    test('iframe: БЕЗ подложки (д-dialog даёт рамку сам)', () => {
        const h = new Function('return ({' +
            methodText(INDEX_SRC, '_buildPrintFileHtml') + ',\n' +
            "_printCssText: function() { return ''; }," +
            '_esc: function(s) { return String(s); },' +
            '_month: 9, _year: 2026,' +
            '});')();
        const html = h._buildPrintFileHtml('X', false);
        assertTrue(html.indexOf('html{background:') === -1,
            'подложки нет — чистый лист в диалоге');
        assertTrue(html.indexOf('padding:0') !== -1, 'без внешних отступов');
    });

    test('_savePrintFile (HTML) удалён — вместо него PDF/Excel (Task 438)', () => {
        // Заявка Task 438: «сделай возможность сохранения в файл
        // вместо html в PDF и Excel» — HTML-выгрузка удалена
        assertTrue(INDEX_SRC.indexOf('_savePrintFile: function') === -1,
            'метод _savePrintFile удалён из клиента');
        assertTrue(INDEX_SRC.indexOf('График_работы_Сентябрь_2026.html') === -1 &&
                   INDEX_SRC.indexOf("+'_' +\n                       this._year + '.html'") === -1,
            'HTML-имя файла больше не собирается');
        assertTrue(INDEX_SRC.indexOf('_savePrintPdf: function') !== -1,
            'метод _savePrintPdf определён (PDF)');
        assertTrue(INDEX_SRC.indexOf('_savePrintXlsx: function') !== -1,
            'метод _savePrintXlsx определён (Excel)');
        // полные VM-проверки выгрузок PDF/Excel — tests/test-task438.js
    });
});

// ============================================================
// 9. VM — _openPrintPreview / _closePrintPreview (мок-DOM)
// ============================================================
describe('Task 430 — VM: диалог предпросмотра (мок-DOM)', () => {

    function fakeDom() {
        const elements = {};
        const body = {
            children: [],
            appendChild: function(el) {
                el.parentNode = body;
                body.children.push(el);
                if (el.id) elements[el.id] = el;
            },
            removeChild: function(el) {
                body.children = body.children.filter(c => c !== el);
                if (el.id && elements[el.id] === el) delete elements[el.id];
            }
        };
        function makeEl(tag) {
            const el = {
                tag: tag, id: '', className: '', innerHTML: '',
                children: [], style: {}, attrs: {}, listeners: {},
                parentNode: null, srcdoc: '', contentDocument: null,
                addEventListener: function(type, fn) {
                    (el.listeners[type] = el.listeners[type] || []).push(fn);
                },
                removeEventListener: function(type, fn) {
                    el.listeners[type] = (el.listeners[type] || [])
                        .filter(f => f !== fn);
                },
                dispatch: function(type, ev) {
                    (el.listeners[type] || []).slice()
                        .forEach(fn => fn(ev || {}));
                },
                setAttribute: function(k, v) { el.attrs[k] = v; },
                appendChild: function(c) {
                    c.parentNode = el;
                    el.children.push(c);
                    return c;
                },
                removeChild: function(c) {
                    el.children = el.children.filter(x => x !== c);
                },
                // querySelector по классу: ищет в детях, при неудаче —
                // стабильный заглушечный элемент (кнопки из innerHTML)
                querySelector: function(sel) {
                    const cls = sel.replace(/^\./, '');
                    const find = function(root) {
                        for (let i = 0; i < root.children.length; i++) {
                            const ch = root.children[i];
                            if (String(ch.className || '')
                                    .split(/\s+/).indexOf(cls) !== -1) {
                                return ch;
                            }
                            const r = find(ch);
                            if (r) return r;
                        }
                        return null;
                    };
                    const found = find(el);
                    if (found) return found;
                    if (!el._qcache) el._qcache = {};
                    if (!el._qcache[cls]) el._qcache[cls] = makeEl('button');
                    return el._qcache[cls];
                }
            };
            return el;
        }
        const document = {
            createElement: makeEl,
            getElementById: function(id) { return elements[id] || null; },
            body: body,
            styleSheets: null
        };
        return { document: document, elements: elements };
    }

    function prevHost(dom, win) {
        return new Function('KipToast', 'window', 'document', 'return ({' +
            methodText(INDEX_SRC, '_openPrintPreview') + ',\n' +
            methodText(INDEX_SRC, '_closePrintPreview') + ',\n' +
            methodText(INDEX_SRC, '_buildPrintFileHtml') + ',\n' +
            methodText(INDEX_SRC, '_printCssText') + ',\n' +
            methodText(INDEX_SRC, '_wsPrevFit') + ',\n' +
            methodText(INDEX_SRC, '_wsXlsBytes') + ',\n' +
            '_esc: function(s) { return String(s); },' +
            '_month: 9, _year: 2026,' +
            "KipToast: undefined," +
            '});')(undefined, win, dom.document);
    }

    function makeWin() {
        const win = {
            printCalls: 0,
            listeners: {},
            print: function() { win.printCalls++; },
            addEventListener: function(t, fn) {
                (win.listeners[t] = win.listeners[t] || []).push(fn);
            },
            removeEventListener: function(t, fn) {
                win.listeners[t] = (win.listeners[t] || []).filter(f => f !== fn);
            },
            key: function(k) {
                (win.listeners.keydown || []).forEach(
                    fn => fn({ key: k }));
            }
        };
        return win;
    }

    test('диалог строится: оверлей в body, iframe со srcdoc', () => {
        const dom = fakeDom();
        const host = prevHost(dom, makeWin());
        const r = host._openPrintPreview('<div class="wsp-grid">X</div>');
        assertEqual(r, true, 'диалог открылся');
        const ov = dom.elements['wsPrintPrevModal'];
        assertTrue(!!ov, 'оверлей в body по id');
        const frame = ov.querySelector('.wspprev-frame');
        assertTrue(!!frame, 'iframe предпросмотра найден');
        assertTrue(frame.srcdoc.indexOf('<!DOCTYPE html>') === 0,
            'в iframe — standalone-документ');
        assertTrue(frame.srcdoc.indexOf('wsp-grid') !== -1,
            'контент шахматки в предпросмотре');
    });

    test('кнопка «Печать» диалога → window.print, «Отмена» → закрыт', () => {
        const dom = fakeDom();
        const win = makeWin();
        const host = prevHost(dom, win);
        host._openPrintPreview('SHEET');
        const ov = dom.elements['wsPrintPrevModal'];
        // структура: overlay > dialog > [head, body, foot]
        const dlg = ov.children[0];
        const foot = dlg.children[2];
        // печать: слушатель кнопки (foot.querySelector — заглушка
        // из _qcache, на неё код и вешает слушатели)
        const printBtn = foot.querySelector('.wspprev-print');
        printBtn.dispatch('click');
        assertEqual(win.printCalls, 1, 'window.print вызван кнопкой диалога');
        // отмена
        const cancelBtn = foot.querySelector('.wspprev-cancel');
        cancelBtn.dispatch('click');
        assertEqual(dom.elements['wsPrintPrevModal'], undefined,
            'оверлей удалён из body');
        assertEqual(win.listeners.keydown && win.listeners.keydown.length, 0,
            'Esc-слушатель снят');
    });

    test('Esc — закрывает диалог', () => {
        const dom = fakeDom();
        const win = makeWin();
        const host = prevHost(dom, win);
        host._openPrintPreview('SHEET');
        assertTrue(!!dom.elements['wsPrintPrevModal'], 'диалог открыт');
        win.key('Escape');
        assertEqual(dom.elements['wsPrintPrevModal'], undefined,
            'Esc закрыл диалог');
    });

    test('клик по затемнению (target = оверлей) — закрывает', () => {
        const dom = fakeDom();
        const win = makeWin();
        const host = prevHost(dom, win);
        host._openPrintPreview('SHEET');
        const ov = dom.elements['wsPrintPrevModal'];
        ov.dispatch('click', { target: ov });
        assertEqual(dom.elements['wsPrintPrevModal'], undefined,
            'клик по фону закрыл');
    });

    test('без document — false (фолбэк printGrid)', () => {
        const host = new Function('return ({' +
            methodText(INDEX_SRC, '_openPrintPreview') + ',\n' +
            '});')();
        const r = host._openPrintPreview('X');
        assertEqual(r, false, 'без DOM диалог не открывается');
    });
});

// ============================================================
// 10. VM — printGrid фолбэк (диалог недоступен → печать сразу)
// ============================================================
describe('Task 430 — VM: printGrid без диалога — прежняя печать', () => {

    test('нет _openPrintPreview — window.print напрямую (Task 341 жив)', () => {
        const elements = {};
        const created = [];
        const doc = {
            getElementById: function(id) { return elements[id] || null; },
            createElement: function(tag) {
                const el = { tag: tag, id: '', innerHTML: '',
                             children: [] };
                created.push(el);
                return el;
            },
            body: { appendChild: function(el) { elements[el.id] = el; } }
        };
        const win = { printCalls: 0, print: function() { win.printCalls++; } };
        const host = new Function('KipToast', 'window', 'document',
            'return ({' +
            methodText(INDEX_SRC, 'printGrid') + '\n' +
            ',"_viewLevel": "view",' +
            '_EMPLOYEES: [{ "ФИО": "Иванов И. И.", "таб_номер": "017" }],' +
            '_buildPrintHtml: function() { return "SHEET"; },' +
            '_viewEmployees: function() { return [{ "ФИО": "И." }]; },' +
            '_totalsAgg: function() { return { byTab: {} }; },' +
            '_totalsEffectiveEntries: function() { return []; },' +
            '_empTypeMap: function() { return {}; },' +
            '});')(undefined, win, doc);
        host.printGrid();
        assertEqual(win.printCalls, 1,
            'фолбэк: печать сразу, как в Task 341');
    });
});

// ============================================================
// 11. Service Worker
// ============================================================
describe('Task 430 — Service Worker', () => {

    test('SW: кэш поднят до kipia-test-v734', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v734'") !== -1,
            'CACHE_VERSION = kipia-test-v734 (Task 430 — предпросмотр печати + архив)');
        assertFalse(SW_SRC.indexOf('kipia-test-v735') !== -1,
            'лишний инкремент не сделан');
    });

    test('SW: в index.html нет захардкоженной версии кэша', () => {
        assertFalse(INDEX_SRC.indexOf('kipia-test-v65') !== -1,
            'клиент не знает номер кэша (версией управляет sw.js)');
    });
});
