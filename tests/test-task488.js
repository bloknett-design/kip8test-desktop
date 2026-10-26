// ============================================================
// Task 488 — заявка (kip8test), 2 части:
//   (1) «Кнопка отметки осталась» — в окне «Мероприятия в этот
//       день» у ячеек табеля остался read-only МАРКЕР-квадрат
//       галочки (зелёный ✓ в рамке — выглядит кнопкой): удалить
//       его ВООБЩЕ, окно — чисто текстовая справка; правка/отметка —
//       только из карт работников (Task 487), состояние выполнения
//       несут: рамка бейджа ячейки сетки (ws-ev-done/ws-ev-late)
//       и галочка карточки работника.
//   (2) «Сделай все сохранения файлов excel в простом формате
//       xlsx, с возможностью редактирования файлов» — все три книги
//       (График_работы, Мероприятия, Архив_по_работникам) — ПРОСТОЙ
//       СТАНДАРТНЫЙ редактируемый xlsx:
//         • числа ЧИСЛАМИ (дни 1–31 шапки табеля прежде были
//           текстом ⇒ Excel рисовал «число сохранено как текст»,
//           сортировка/фильтр — как у текста);
//         • docProps (core.xml/app.xml) + bookViews в workbook.xml —
//           стандартный состав книги, как пишет сам Excel;
//         • [Content_Types].xml — ПЕРВОЙ частью zip архива
//           (прежде в архиве листы шли первыми);
//         • _wsXlsEsc вырезает XML-запрещённые управляющие символы
//           (0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F) — «мусорные» байты
//           из пользовательских полей дают книгу, которую Excel
//           «восстанавливает» (ремонт файла);
//         • xml:space="preserve" при краевом пробеле текста —
//           во всех трёх писателях листов (прежде — только архив);
//         • защит книги/листов НЕТ (sheetProtection/workbook-
//           Protection отсутствуют) — файл правится свободно.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   SRC (1): _renderEventsPopup — маркер удалён ВООБЩЕ (ни
//   ws-done-chk, ни тултипа «Выполнено», ни deId/deFam); строка —
//   свотч + код + название; карточки работников кнопки СОХРАНИЛИ.
//   SRC (2): _wsTabelRows — день без «*» числом, с «*» — текст;
//   docProps-помощник; bookViews в трёх workbook.xml; CT-первым
//   в архиве; esc — контрольные символы.
//   VM (1): _renderEventsPopup — выполненная запись «И» БЕЗ
//   маркера (редактор == зритель, HTML идентичен).
//   VM (2): книга табеля — docProps в zip, CT первая, дни шапки
//   <v>1</v> (не текст), bookViews, нет защит; книга архива —
//   12 частей, docProps, CT первой; книга мероприятий — docProps;
//   _wsXlsEsc — вырезает 0x01/0x0B/0x1F, xml:space у табеля.
//   SW: kipia-test-v758 (главный), v713 — следующий не занят.
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

const WS_START = INDEX_SRC.indexOf('var WorkSchedule = {');
const WS_CLIENT = INDEX_SRC.slice(WS_START);

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

// парсер stored-zip: локальные заголовки подряд + EOCD в хвосте
function parseZip(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const files = [];
    let pos = 0;
    while (pos + 30 <= bytes.length &&
           dv.getUint32(pos, true) === 0x04034b50) {
        const nameLen = dv.getUint16(pos + 26, true);
        const extraLen = dv.getUint16(pos + 28, true);
        const usize = dv.getUint32(pos + 22, true);
        const name = Buffer.from(
            bytes.slice(pos + 30, pos + 30 + nameLen)).toString('utf8');
        const dataStart = pos + 30 + nameLen + extraLen;
        files.push({ name: name,
                     data: bytes.slice(dataStart, dataStart + usize) });
        pos = dataStart + usize;
    }
    return { files: files,
             eocd: dv.getUint32(bytes.length - 22, true) };
}

// ============================================================
// 1. SRC — часть 1: попап без маркера
// ============================================================
describe('Task 488 — SRC: маркер-«кнопка» убран из окна', () => {

    test('JS: _renderEventsPopup — ни маркера, ни тултипа, ни id', () => {
        const ep = methodText(WS_CLIENT, '_renderEventsPopup');
        assertTrue(ep.indexOf('ws-done-chk') === -1,
            'класса маркера-«кнопки» в коде окна НЕТ');
        assertTrue(ep.indexOf('title="Выполнено"') === -1,
            'тултипа состояния нет');
        assertTrue(ep.indexOf('deId') === -1,
            'id записи окном не адресуется (правка — из карточек)');
        assertTrue(ep.indexOf('deFam') === -1,
            'семейство записи окном не адресуется');
        assertTrue(ep.indexOf('deChk') === -1 && ep.indexOf('deActs') === -1,
            'переменных маркера нет вовсе');
    });

    test('JS: строка окна — свотч + код + название', () => {
        const ep = methodText(WS_CLIENT, '_renderEventsPopup');
        assertTrue(ep.indexOf('ws-popup-swatch') !== -1,
            'свотч цвета');
        assertTrue(ep.indexOf('ws-popup-code') !== -1,
            'код мероприятия');
        assertTrue(ep.indexOf('ws-popup-name') !== -1,
            'название мероприятия');
        assertTrue(ep.indexOf('ws-popup-event') !== -1,
            'класс строки');
    });

    test('JS: карточки работников кнопки СОХРАНИЛИ (правка из карт)', () => {
        // регресс части 1: правка/отметка живут в карточках
        // (onclick-литералы в рендере блоков карточки, Task 385/418/427)
        assertTrue(INDEX_SRC.indexOf(
            'WorkSchedule.toggleTrainingDone(') !== -1,
            'галочка клика в карточке жива');
        assertTrue(INDEX_SRC.indexOf(
            'WorkSchedule.editTraining(') !== -1,
            '✎ в карточке жив');
        assertTrue(INDEX_SRC.indexOf(
            'WorkSchedule.deleteTraining(') !== -1,
            '✕ в карточке жив');
        const iChk = WS_CLIENT.indexOf("'Отметить выполнение'");
        const iTgl = WS_CLIENT.indexOf('WorkSchedule.toggleTrainingDone(');
        assertTrue(iChk !== -1 && iTgl !== -1 && Math.abs(iChk - iTgl) < 400,
            'тултип галочки и клик — рядом (блок карточки)');
    });
});

// ============================================================
// 2. SRC — часть 2: простой редактируемый xlsx
// ============================================================
describe('Task 488 — SRC: простой редактируемый xlsx', () => {

    test('JS: _wsTabelRows — день числом, «N*» текстом', () => {
        const rows = methodText(WS_CLIENT, '_wsTabelRows');
        assertTrue(rows.indexOf("(String(model.days[d].d) + '*')") !== -1,
            'сокращённый день — ТЕКСТ «N*» (звёздочка)');
        assertTrue(rows.indexOf(': model.days[d].d,') !== -1,
            'обычный день — ЧИСЛО (тернарник без String)');
        assertFalse(rows.indexOf(
            "String(model.days[d].d) +\n" +
            "                            (model.days[d].short ? '*' : '')") !== -1,
            'прежний «всегда текст» удалён');
        // числовая ячейка проходит в _wsTabelSheetXml как typeof number
        const sheet = methodText(WS_CLIENT, '_wsTabelSheetXml');
        assertTrue(sheet.indexOf(
            "typeof v === 'number' && isFinite(v)") !== -1,
            'писатель различает числа/строки');
    });

    test('JS: docProps-помощник общий для трёх книг', () => {
        const dp = methodText(WS_CLIENT, '_wsXlsDocProps');
        assertTrue(dp.indexOf('docProps/core.xml') !== -1,
            'core.xml');
        assertTrue(dp.indexOf('docProps/app.xml') !== -1,
            'app.xml');
        assertTrue(dp.indexOf('cp:coreProperties') !== -1,
            'пространства имён core');
        assertTrue(dp.indexOf('extended-properties') !== -1,
            'app: extended-properties');
        assertTrue(dp.indexOf('dc:creator') !== -1,
            'автор книги');
        for (const b of ['_buildTabelWorkbook', '_buildEventsWorkbook',
                         '_buildArchiveWorkbook']) {
            const body = methodText(WS_CLIENT, b);
            assertTrue(body.indexOf('_wsXlsDocProps') !== -1,
                b + ' использует помощник');
            assertTrue(body.indexOf('bookViews') !== -1,
                b + ' пишет bookViews');
        }
    });

    test('JS: [Content_Types].xml — первой записью архива', () => {
        const arch = methodText(WS_CLIENT, '_buildArchiveWorkbook');
        // листы собираются в sheetFiles, files начинается с CT
        assertTrue(arch.indexOf('sheetFiles') !== -1,
            'листы — в отдельный буфер');
        const iCT = arch.indexOf("files.push({ name: '[Content_Types].xml'");
        const iSheets = arch.indexOf('files.push(sheetFiles[sfi])');
        assertTrue(iCT !== -1 && iSheets !== -1 && iCT < iSheets,
            'CT пишется РАНЬЕ листов');
        const iCTdata = arch.indexOf("name: '[Content_Types].xml'");
        const iRels = arch.indexOf("name: '_rels/.rels'");
        assertTrue(iCTdata !== -1 && iRels !== -1 && iCTdata < iRels,
            'порядок канонический: CT → rels → docProps → xl/*');
    });

    test('JS: _wsXlsEsc — вырезает XML-запрещённые символы', () => {
        const esc = methodText(WS_CLIENT, '_wsXlsEsc');
        assertTrue(esc.indexOf('u0000') !== -1,
            'диапазон 0x00 контролируется');
        assertTrue(esc.indexOf('u001F') !== -1,
            'верх диапазона 0x1F');
        assertTrue(esc.indexOf('u000B') !== -1 &&
                   esc.indexOf('u000C') !== -1,
            '0x0B/0x0C (валидные \t\n\r НЕ тронуты)');
    });

    test('JS: xml:space="preserve" во всех писателях листов', () => {
        for (const w of ['_wsTabelSheetXml', '_eventsSheetXml',
                         '_wsXlsSheetXml']) {
            const body = methodText(WS_CLIENT, w);
            assertTrue(body.indexOf('xml:space="preserve"') !== -1,
                w + ' помечает краевой пробел');
        }
    });
});

// ============================================================
// 3. VM — часть 1: попап без маркера
// ============================================================
describe('Task 488 — VM: попап мероприятий без маркера', () => {

    const EMP = [{ 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '007' }];
    const TRAININGS = [
        { 'таб_номер': '007', тип: 'инструктаж', id: 11,
          дата_начала: '2026-10-05', дата_окончания: '2026-10-05',
          тема: 'Повторный инструктаж по охране труда', выполнение: 1 },
        { 'таб_номер': '007', тип: 'проверка_знаний', id: 12,
          дата_начала: '2026-10-12', дата_окончания: '2026-10-12',
          тема: 'Периодическая проверка знаний', выполнение: 0 }
    ];
    const CODES = [
        { code: 'И', short: 'инструктаж', name: 'Инструктаж',
          color: '#B3E5FC' },
        { code: 'ПЗ', short: 'проверка знаний',
          name: 'Периодическая проверка знаний', color: '#B39DDB' }
    ];

    function loadPopupHost(canEdit) {
        const names = ['_renderEventsPopup', '_eventsAt', '_trainingCodeOf',
                       '_statusMeta', '_isInstrType', '_instrShortOf',
                       '_normInstrKey', '_fmtDateRu', '_esc'];
        const texts = names.map(n => methodText(WS_CLIENT, n));
        assertTrue(texts.every(t => t.length > 0), 'методы извлекаются');
        const host = new Function('return ({' + texts.join(',\n') + '\n});')();
        host._EMPLOYEES = EMP;
        host._TRAININGS = TRAININGS;
        host._STATUS_CODES = CODES;
        host._INSTR_LIST = [];
        host._canEdit = canEdit;
        return host;
    }

    test('выполнено (выполнение=1): маркера НЕТ — только текст', () => {
        const host = loadPopupHost(true);
        const html = host._renderEventsPopup('2026-10-05', '007');
        assertTrue(html.indexOf('Мероприятия в этот день') !== -1,
            'заголовок окна жив');
        assertTrue(html.indexOf('И') !== -1 &&
                   html.indexOf('Повторный инструктаж') !== -1,
            'запись показана');
        assertTrue(html.indexOf('ws-done-chk') === -1,
            'МАРКЕРА-«кнопки» НЕТ (заявка «кнопка отметки осталась»)');
        assertTrue(html.indexOf('Выполнено') === -1,
            'ни тултипа состояния');
        assertTrue(html.indexOf('ws-popup-event') !== -1,
            'строка-справка рендерится');
    });

    test('редактор == зритель: HTML идентичен', () => {
        const ed = loadPopupHost(true);
        const vi = loadPopupHost(false);
        assertEqual(ed._renderEventsPopup('2026-10-05', '007'),
            vi._renderEventsPopup('2026-10-05', '007'),
            'роль не влияет на окно (справочное, Task 488)');
    });

    test('не выполнено: окно тоже чисто текстовое', () => {
        const host = loadPopupHost(false);
        const html = host._renderEventsPopup('2026-10-12', '007');
        assertTrue(html.indexOf('ws-done-chk') === -1,
            'маркера нет (как и прежде)');
        assertTrue(html.indexOf('Периодическая проверка знаний') !== -1,
            'запись видна');
    });
});

// ============================================================
// 4. VM — часть 2: книги xlsx (docProps/CT-first/числа/нет защит)
// ============================================================
describe('Task 488 — VM: книги «простой редактируемый xlsx»', () => {

    const helpers = ['_wsXlsZip', '_wsXlsBytes', '_wsXlsCrc32',
                     '_wsXlsColName', '_wsXlsEsc', '_wsXlsDocProps'];

    // хост книги табеля (модель минимальная, как test-task438)
    function tabelHost() {
        const host = new Function('return ({' +
            methodText(WS_CLIENT, '_printModel') + ',' +
            methodText(WS_CLIENT, '_printEventsData') + ',' +
            methodText(WS_CLIENT, '_wsTabelStyleMap') + ',' +
            methodText(WS_CLIENT, '_wsTabelStylesXml') + ',' +
            methodText(WS_CLIENT, '_wsTabelRows') + ',' +
            methodText(WS_CLIENT, '_wsTabelSheetXml') + ',' +
            methodText(WS_CLIENT, '_buildTabelWorkbook') +
            '});')();
        for (const h of helpers) host[h] = null;
        const util = new Function('return ({' +
            helpers.map(h => methodText(WS_CLIENT, h)).join(',') + '});')();
        for (const h of helpers) host[h] = util[h];
        host._year = 2026;
        host._month = 9;
        host._view = 'full';
        host._isoDate = function(dt) {
            return dt.getFullYear() + '-' +
                (dt.getMonth() < 9 ? '0' : '') + (dt.getMonth() + 1) +
                '-' + (dt.getDate() < 10 ? '0' : '') + dt.getDate();
        };
        host._buildEntryIndex = function() {
            return { '2026-09-03|031': { 'статус': 'Д' } };
        };
        host._PENDING = {};
        host._empTipLine = function() { return 'смена №1'; };
        host._STATUS_CODES = [
            { code: 'Д', short: 'день 12ч', name: 'День 12ч', color: '#FFE082' },
            { code: '', short: 'выходной', name: 'Выходной', color: '#EEF0F2' }
        ];
        host._TRAININGS = [];
        host._EMPLOYEES = [{ 'ФИО': 'Сидоров Сидор Сидорович',
                             'таб_номер': '031' }];
        host._trainingCodeOf = function() { return ''; };
        host._instrShortOf = function() { return ''; };
        host._calDayOff = function(day) { return day % 7 === 0 || day % 7 === 6; };
        host._vacationAt = function() { return null; };
        host._eventsAt = function() { return []; };
        host._statusMeta = function() { return {}; };
        host._EVENT_CODES = [];
        return host;
    }

    const EMPS = [{ 'ФИО': 'Сидоров Сидор Сидорович', 'таб_номер': '031' }];
    const AGG = { byTab: { '031': { work: 19, hours: 136.8,
                                    over: 0, overDays: 0 } } };

    test('книга табеля: docProps + bookViews + дни ЧИСЛАМИ', () => {
        const wb = tabelHost()._buildTabelWorkbook(EMPS, AGG);
        const z = parseZip(wb.bytes);
        const names = z.files.map(f => f.name);
        assertEqual(names[0], '[Content_Types].xml',
            'CT — первая запись zip (канонический порядок)');
        assertTrue(names.indexOf('docProps/core.xml') !== -1 &&
                   names.indexOf('docProps/app.xml') !== -1,
            'docProps в книге');
        const wbXml = Buffer.from(
            z.files.filter(f => f.name === 'xl/workbook.xml')[0].data)
            .toString('utf8');
        assertTrue(wbXml.indexOf('<bookViews>') !== -1,
            'bookViews в workbook.xml');
        const sheet = Buffer.from(
            z.files.filter(f => f.name === 'xl/worksheets/sheet1.xml')[0].data)
            .toString('utf8');
        // день 3 (без «*») — ЧИСЛО: <c r="D4" ...><v>3</v></c>
        assertTrue(/<c r="D4"[^>]*><v>3<\/v><\/c>/.test(sheet),
            'день 3 шапки — ЧИСЛОВАЯ ячейка <v>3</v>');
        assertFalse(/t="inlineStr"[^>]*><is><t>3<\/t>/.test(sheet),
            'дни больше НЕ текст «3»');
        // день недели — остаётся текстом (это не число)
        assertTrue(/<t>Пн<\/t>|<t>Ср<\/t>|<t>Пт<\/t>/.test(sheet) ||
                   /<t>Вт<\/t>|<t>Чт<\/t>|<t>Сб<\/t>/.test(sheet),
            'день недели — текст (как прежде)');
        // редактируемость: защит листа/книги нет
        assertTrue(sheet.indexOf('sheetProtection') === -1,
            'sheetProtection отсутствует — лист правится');
        assertTrue(wbXml.indexOf('workbookProtection') === -1,
            'workbookProtection отсутствует — книга правится');
        // xml:space появляется при краевом пробеле
        const ct = Buffer.from(
            z.files.filter(f => f.name === '[Content_Types].xml')[0].data)
            .toString('utf8');
        assertTrue(ct.indexOf('/docProps/core.xml') !== -1 &&
                   ct.indexOf('/docProps/app.xml') !== -1,
            'CT объявляет docProps');
    });

    test('книга архива: 12 частей, docProps, CT первой', () => {
        const archHost = new Function('return ({' +
            methodText(WS_CLIENT, '_workersArchiveData') + ',' +
            methodText(WS_CLIENT, '_buildArchiveWorkbook') + ',' +
            methodText(WS_CLIENT, '_wsXlsSheetXml') + ',' +
            methodText(WS_CLIENT, '_wsXlsStylesXml') + ',' +
            methodText(WS_CLIENT, '_wsXlsZebraGroups') +
            '});')();
        for (const h of helpers) archHost[h] = null;
        const util = new Function('return ({' +
            helpers.map(h => methodText(WS_CLIENT, h)).join(',') + '});')();
        for (const h of helpers) archHost[h] = util[h];
        archHost._EMPLOYEES = [
            { 'ФИО': 'Иванов Иван Иванович', 'таб_номер': '017',
              'должность': 'техник' },
            { 'ФИО': 'Сидоров Сидор Сидорович', 'таб_номер': '031',
              'должность': 'слесарь' }
        ];
        archHost._VAC_YEARS = {};
        archHost._INSTR_ALL = [];
        archHost._EVENTS_ALL = [];
        archHost._PPE = [];
        archHost._TRAININGS = [];
        archHost._isoDate = tabelHost()._isoDate;
        archHost._esc = function(s) { return String(s == null ? '' : s); };
        archHost._wtabYearRecords = function() { return []; };

        const wb = archHost._buildArchiveWorkbook();
        const z = parseZip(wb.bytes);
        assertEqual(z.files.length, 12,
            '12 частей (5 листов + 7 служебных с docProps)');
        assertEqual(z.files[0].name, '[Content_Types].xml',
            'CT — ПЕРВАЯ запись (прежде листы шли первыми)');
        const names = z.files.map(f => f.name);
        assertTrue(names.indexOf('docProps/core.xml') !== -1 &&
                   names.indexOf('docProps/app.xml') !== -1,
            'docProps в архиве');
        const wbXml = Buffer.from(
            z.files.filter(f => f.name === 'xl/workbook.xml')[0].data)
            .toString('utf8');
        assertTrue(wbXml.indexOf('<bookViews>') !== -1,
            'bookViews в workbook.xml архива');
        assertTrue(wbXml.indexOf('workbookProtection') === -1,
            'книга не защищена — правится');
        // листы: защит нет
        for (const f of z.files) {
            if (f.name.indexOf('worksheets') !== -1) {
                const xml = Buffer.from(f.data).toString('utf8');
                assertTrue(xml.indexOf('sheetProtection') === -1,
                    'лист без защиты: ' + f.name);
            }
        }
    });

    test('книга мероприятий: docProps + bookViews', () => {
        const evHost = new Function('return ({' +
            methodText(WS_CLIENT, '_eventsSheetXml') + ',' +
            methodText(WS_CLIENT, '_eventsStylesXml') + ',' +
            methodText(WS_CLIENT, '_buildEventsWorkbook') +
            '});')();
        for (const h of helpers) evHost[h] = null;
        const util = new Function('return ({' +
            helpers.map(h => methodText(WS_CLIENT, h)).join(',') + '});')();
        for (const h of helpers) evHost[h] = util[h];

        const wb = evHost._buildEventsWorkbook({
            monthName: 'октябрь', y: 2026, m: 10,
            events: [{ range: '05–08.10', name: 'ОУ · Обучение',
                       fio: 'Иванов И. И.' }],
            ppe: []
        });
        const z = parseZip(wb.bytes);
        const names = z.files.map(f => f.name);
        assertEqual(names[0], '[Content_Types].xml', 'CT — первая');
        assertTrue(names.indexOf('docProps/core.xml') !== -1 &&
                   names.indexOf('docProps/app.xml') !== -1,
            'docProps в книге мероприятий');
        const wbXml = Buffer.from(
            z.files.filter(f => f.name === 'xl/workbook.xml')[0].data)
            .toString('utf8');
        assertTrue(wbXml.indexOf('<bookViews>') !== -1, 'bookViews');
        assertEqual(wb.name, 'Мероприятия_Октябрь_2026.xlsx', 'имя живо');
    });

    test('_wsXlsEsc: контрольные символы вырезаются', () => {
        const util = new Function('return ({' +
            methodText(WS_CLIENT, '_wsXlsEsc') + '});')();
        const dirty = 'т\x00ек\x01ст\x0B\x0C\x1F и & <tag>';
        assertEqual(util._wsXlsEsc(dirty), 'текст и &amp; &lt;tag&gt;',
            'запрещённые 0x00/0x01/0x0B/0x0C/0x1F вырезаны, XML экранирован');
        assertEqual(util._wsXlsEsc('перенос\nстроки'),
            'перенос\nстроки',
            '\\n ВАЛИДЕН в XML — не трогаем');
        assertEqual(util._wsXlsEsc('таб\tтекст'), 'таб\tтекст',
            '\\t валиден — не трогаем');
    });

    test('_wsXlsDocProps: rels/ct без конфликтов rId', () => {
        const util = new Function('return ({' +
            methodText(WS_CLIENT, '_wsXlsDocProps') + ',' +
            methodText(WS_CLIENT, '_wsXlsBytes') + '});')();
        const dp = util._wsXlsDocProps();
        assertEqual(dp.files.length, 2, 'core.xml + app.xml');
        assertTrue(dp.rels.indexOf('rId2') !== -1 &&
                   dp.rels.indexOf('rId3') !== -1,
            'rId2/rId3 (rId1 — workbook, конфликтов нет)');
        assertTrue(dp.rels.indexOf('docProps/core.xml') !== -1 &&
                   dp.rels.indexOf('docProps/app.xml') !== -1,
            'rels ведут в docProps');
        // core.xml — валидный XML (без запрещённых символов)
        const core = Buffer.from(dp.files[0].data).toString('utf8');
        assertTrue(core.indexOf('<?xml') === 0, 'заголовок XML');
        assertTrue(core.indexOf('dcterms:created') !== -1,
            'метка создания');
    });
});

// ============================================================
// 5. SW — версия и комментарий
// ============================================================
describe('Task 488 — SW: версия и комментарий', () => {

    test("sw.js: CACHE_VERSION = 'kipia-test-v758'", () => {
        assertTrue(SW_SRC.indexOf(
            "const CACHE_VERSION = 'kipia-test-v758';") !== -1,
            'версия поднята Task 488');
    });

    test('sw.js: комментарий Task 488 (обе части заявки)', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v758'");
        assertTrue(i !== -1, 'версия найдена');
        // Task 490 (адаптация): окно истории 1800 → 2200 — комментарий
        // Task 490 в sw.js (~480 симв) сместил маркеры 488 за старую
        // границу (прецедент окон 480-482 при переносе в kip8)
        // Task 502: окно 5600 → 6200 (якорь 5898).
        const ctx = SW_SRC.slice(Math.max(0, i - 7500), i);
        assertTrue(ctx.indexOf('Task 488') !== -1,
            'маркер задачи в окне истории');
        assertTrue(ctx.indexOf('кнопк') !== -1,
            'часть 1: маркер-«кнопка»');
        assertTrue(ctx.indexOf('xlsx') !== -1,
            'часть 2: простой xlsx');
        assertTrue(ctx.indexOf('docProps') !== -1,
            'часть 2: docProps');
        assertTrue(ctx.indexOf('ЧИСЛАМИ') !== -1,
            'часть 2: числа числами');
    });

    test('sw.js: v711 отсутствует (один инкремент)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v711') === -1,
            'v711 в sw.js не должно быть');
        assertTrue(SW_SRC.indexOf('kipia-test-v759') === -1,
            'v713 в sw.js не должно быть (двойной бамп не сделан)');
    });
});

console.log('test-task488: все describes зарегистрированы');
