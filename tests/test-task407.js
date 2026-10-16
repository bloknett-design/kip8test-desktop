// ============================================================
// Task 407 — заявка: «Необходимо переделать блок Повторные
// инструктажи и периодическая проверка знаний, информация в этом
// блоке будет формироваться из двух таблиц в файле табель_КИП_ИОС.
// Первая таблица, новая, "Список_И_и_ПЗ" содержит шаблонный список
// инструктажей и проверки знаний, вторая таблица "Инструктажи"
// заполняется пользователем, и по столбцу "название" берёт нужную
// информацию из первой таблицы».
//
// 1) СЕРВЕР (WorkSchedule.gs): лист «Список_И_и_ПЗ» (столбцы ПО
//    ЗАГОЛОВКАМ строки 1: название/вид/периодичность/основание);
//    listTrainings отдаёт instrList (шаблон) + instrAll (ВСЕ записи
//    «Инструктажей» без фильтра года — «последний» инструктаж ищется
//    по всем годам); instrListInit — создание листа с эталоном
//    заявки 409 (5 пунктов; повторный запуск замещает строки).
// 2) КАРТОЧКА: блок b5 — ГРУППЫ по пунктам шаблона (записи года
//    со ✎/✕, «след. срок … ✓» / «⚠ просрочено с …», «— не
//    проводился» / «— в этом году не проводился»), секция «вне
//    списка» для записей без соответствия; шаблона нет — прежний
//    плоский список (обратная совместимость).
// 3) КЭШ (Task 314): instrList/instrAll сохраняются/восстанавливаются.
// 4) ФОРМА «Новое мероприятие»: datalist подсказок «Темы» из шаблона
//    (по виду пункта; свободный ввод остаётся).
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');

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

// Даты «сегодня» для стабильных тестов сроков (просрочено/актуально
// не должно зависеть от даты прогона)
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

// ============================================================
// 1. SRC — сервер: лист «Список_И_и_ПЗ»
// ============================================================
describe('Task 407 — SRC: сервер (WorkSchedule.gs)', () => {

    test('константа листа + док-блок структуры', () => {
        assertTrue(WS_SRC.indexOf("INSTR_LIST_SHEET:   'Список_И_и_ПЗ'") !== -1,
            'константа INSTR_LIST_SHEET = «Список_И_и_ПЗ»');
        assertTrue(WS_SRC.indexOf('Структура листа «Список_И_и_ПЗ»') !== -1,
            'док-блок структуры листа');
        assertTrue(WS_SRC.indexOf(' instrListInit()') === -1 ||
                   WS_SRC.indexOf('function instrListInit()') !== -1,
            'топ-левел функция instrListInit объявлена');
    });

    test('_readInstrListSheet: столбцы ПО ЗАГОЛОВКАМ строки 1', () => {
        const fn = stripComments(methodText(WS_SRC, '_readInstrListSheet'));
        assertTrue(fn.indexOf("this._headerColIndex(sheet, ['название'])") !== -1,
            'ключевой столбец «название» ищется по заголовку');
        assertTrue(fn.indexOf("if (nameCol === null) return [];") !== -1,
            'нет столбца «название» — пустой список');
        assertTrue(fn.indexOf("['вид']") !== -1 &&
                   fn.indexOf("'основание'") !== -1,
            'столбцы «вид» и «основание» — по заголовкам');
        assertTrue(fn.indexOf('периодичность, мес') !== -1,
            'толерантные варианты заголовка «периодичность»');
        assertTrue(fn.indexOf("replace(',', '.')") !== -1,
            'периодичность «12,5» парсится с запятой');
        assertTrue(fn.indexOf('if (!sheet) return [];') !== -1,
            'листа нет — пустой список (не ошибка)');
    });

    test('listTrainings: instrList + instrAll в ответе', () => {
        const fn = stripComments(methodText(WS_SRC, 'listTrainings'));
        assertTrue(fn.indexOf('instrList: this._readInstrListSheet()') !== -1,
            'поле instrList — шаблон «Список_И_и_ПЗ»');
        assertTrue(
            fn.indexOf('instrAll:  sheet ? this._readTrainingsSheet(sheet, {}) : []') !== -1,
            'поле instrAll — ВСЕ записи «Инструктажей» без фильтра года (Task 413: без листа — пустой срез, чтение не падает)');
        assertTrue(fn.indexOf('trainings: trainings') !== -1,
            'trainings — прежний годовой срез (бейджи/окна не меняются)');
    });

    test('instrListInit: создание листа + замещение эталоном (Task 409)', () => {
        const fn = stripComments(methodText(WS_SRC, 'instrListInit'));
        assertTrue(fn.indexOf('reset: !created') !== -1,
            'лист уже есть — замещение строк (reset)');
        assertTrue(fn.indexOf("ss.insertSheet(this.INSTR_LIST_SHEET)") !== -1,
            'создание листа');
        assertTrue(fn.indexOf("'название', 'вид', 'периодичность', 'основание'") !== -1,
            'заголовки столбцов');
        assertTrue(fn.indexOf("'Повторный инструктаж по рабочим инструкциям ОТ'") !== -1 &&
                   fn.indexOf("'Периодическая проверка знаний на допуск к самостоятельной работе'") !== -1,
            'эталонная номенклатура заявки 409');
        assertTrue(fn.indexOf('clearContent') !== -1,
            'перед записью — очистка прежних строк');
        assertTrue(WS_SRC.indexOf('Task 407/409: инициализация листа «Список_И_и_ПЗ»') !== -1,
            'инструкция запуска в редакторе (как trainingsSplitInit)');
    });
});

// ============================================================
// 2. SRC — клиент: состояние, кэш, хелперы, форма
// ============================================================
describe('Task 407 — SRC: клиент', () => {

    test('состояние: _INSTR_LIST + _INSTR_ALL', () => {
        assertTrue(INDEX_SRC.indexOf('_INSTR_LIST: [],') !== -1 &&
                   INDEX_SRC.indexOf('_INSTR_ALL: [],') !== -1,
            'поля объявлены в кэше данных');
    });

    test('_loadTrainings разбирает instrList/instrAll', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_loadTrainings'));
        assertTrue(fn.indexOf('self._INSTR_LIST = self._normalizeInstrList(data.instrList);') !== -1,
            'шаблон из ответа (Task 412: пустой сервер — встроенный эталон 409)');
        assertTrue(fn.indexOf('self._INSTR_ALL = data.instrAll || [];') !== -1,
            'все записи «Инструктажей» из ответа');
    });

    test('кэш Task 314: instrList/instrAll пишутся и восстанавливаются', () => {
        const w = stripComments(methodText(INDEX_SRC, '_cacheWrite'));
        assertTrue(w.indexOf('c.instrList = this._INSTR_LIST;') !== -1 &&
                   w.indexOf('c.instrAll = this._INSTR_ALL;') !== -1,
            'запись в кэш (не по годам)');
        // Task 476: разбор объекта кэша вынесен в _restoreFromObj
        // (общий для localStorage- и KipDB-слоёв).
        const r = stripComments(methodText(INDEX_SRC, '_restoreFromObj'));
        assertTrue(r.indexOf('Array.isArray(c.instrList) ? c.instrList : []') !== -1 &&
                   r.indexOf('Array.isArray(c.instrAll) ? c.instrAll : []') !== -1,
            'восстановление с guard (кэш прежней версии — пустые)');
    });

    test('хелперы: _normInstrKey / _normInstrKind / _addMonthsIso', () => {
        assertTrue(extractMethod(INDEX_SRC, '_normInstrKey') !== -1,
            '_normInstrKey существует');
        const k = stripComments(methodText(INDEX_SRC, '_normInstrKey'));
        assertTrue(k.indexOf('toLowerCase') !== -1 &&
                   k.indexOf('ё') !== -1 && k.indexOf('/\\s+/g') !== -1,
            'нормализация: регистр/пробелы/«ё»');
        const mo = stripComments(methodText(INDEX_SRC, '_addMonthsIso'));
        assertTrue(mo.indexOf('getMonth() + 1, 0).getDate()') !== -1,
            'день клампится к концу месяца (31.01 + 1 мес → 28.02)');
        const ki = stripComments(methodText(INDEX_SRC, '_normInstrKind'));
        assertTrue(ki.indexOf("'проверка_знаний' ? 'проверка_знаний'") !== -1,
            'вид нормализуется к проверка_знаний|инструктаж');
    });

    test('b5: ветка шаблона + плоский путь (обратная совместимость)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf('this._INSTR_LIST && this._INSTR_LIST.length') !== -1 &&
                   fn.indexOf('this._renderInstrSection(ins, tabNo, withEdit,') !== -1,
            'шаблон загружен — групповой вид через _renderInstrSection');
        assertTrue(fn.indexOf('} else if (!ins.length) {') !== -1 &&
                   fn.indexOf('нет инструктажей и проверок знаний за год') !== -1,
            'шаблона нет — прежний плоский список/пустое состояние');
    });

    test('_renderInstrSection: группы, сроки, «вне списка»', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderInstrSection'));
        assertTrue(fn.indexOf('ws-il-head') !== -1 && fn.indexOf('ws-il-name') !== -1,
            'шапка группы');
        assertTrue(fn.indexOf('ws-il-per') !== -1 &&
                   fn.indexOf('this._fmtPeriodRu(gItem.периодичность)') !== -1,
            'подпись периодичности — _fmtPeriodRu (Task 409: «раз в год»)');
        assertTrue(fn.indexOf('ws-il-row') !== -1,
            'строки-записи года');
        assertTrue(fn.indexOf('след. срок: ') !== -1 &&
                   fn.indexOf('⚠ просрочено с ') !== -1,
            'строка следующего срока (актуально/просрочено)');
        assertTrue(fn.indexOf('— не проводился') !== -1 &&
                   fn.indexOf('год не проводился') !== -1,
            'пустые состояния пункта (только asBlocks; Task 408: «— за год»)');
        assertTrue(fn.indexOf('вне списка:') !== -1 && fn.indexOf('ws-il-off') !== -1,
            'секция «вне списка»');
        assertTrue(fn.indexOf('if (!asBlocks && !gRows.length && !last) continue;') !== -1,
            'попап: пункты без записей вообще не показываются');
        assertTrue(fn.indexOf("(this._INSTR_ALL || []).concat(ins || [])") !== -1 &&
                   fn.indexOf("ar['таб_номер'] !== tabNo") !== -1,
            '«последний» — по ВСЕМ годам (instrAll + срез года, по работнику)');
        assertTrue(fn.indexOf('relKeys = [gKey]') !== -1 &&
                   fn.indexOf("this._normInstrKey(gItem['в составе'])") !== -1,
            'связка по нормализованному названию (Task 419: «последний» — пункт ИЛИ родитель «в составе»)');
        assertTrue(fn.indexOf('_sigRel') !== -1 && fn.indexOf('liHit') !== -1,
            'Task 420: сравнение нестрогое (норм-ключ ИЛИ сигнатура)');
        assertTrue(fn.indexOf('this._trainingCodeOf(gr.тип) || gCode') !== -1,
            'код строки — факт записи (вид пункта — только шапка)');
    });

    test('форма: datalist подсказок «Темы»', () => {
        assertTrue(INDEX_SRC.indexOf('id="wsTrTitleList"') !== -1 &&
                   INDEX_SRC.indexOf('list="wsTrTitleList"') !== -1,
            'datalist подключён к полю «Тема»');
        const fn = stripComments(methodText(INDEX_SRC, '_fillTrTitleOptions'));
        assertTrue(fn.indexOf('this._isInstrType(tip)') !== -1 &&
                   fn.indexOf('this._normInstrKind(this._INSTR_LIST[i].вид) !== want') !== -1,
            'подсказки — по виду пункта (инструктаж/проверка знаний)');
        const of = stripComments(methodText(INDEX_SRC, 'openTrainingForm'));
        assertTrue(of.indexOf('typeSel.onchange') !== -1 &&
                   of.indexOf('this._syncTrTitleField(') !== -1,
            'пересбор поля при открытии и смене типа (Task 408: select)');
    });

    test('CSS: группы блока + светлые темы + размеры окна', () => {
        for (const sel of ['.ws-il-head {', '.ws-il-name {', '.ws-il-per {',
                           '.ws-il-due {', '.ws-il-due-ok', '.ws-il-due-bad',
                           '.ws-il-off {']) {
            assertTrue(INDEX_SRC.indexOf(sel) !== -1,
                'правило существует: ' + sel);
        }
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .ws-il-due-ok { color: #2e7d32; }') !== -1 &&
                   INDEX_SRC.indexOf('[data-theme="light"] .ws-il-due-bad { color: #c62828; }') !== -1,
            'светлая тема сроков');
        assertTrue(INDEX_SRC.indexOf('.ws-wcard .ws-il-head') !== -1 &&
                   INDEX_SRC.indexOf('.ws-wcard .ws-il-row') !== -1,
            'размеры окна карточки (.ws-wcard)');
    });

    test('SW поднят (SW_VERSION = kipia-test-v749)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v749') !== -1,
            'CACHE_VERSION в sw.js — kipia-test-v749');
    });
});

// ============================================================
// 3. VM — клиент: _renderInstrSection
// ============================================================
describe('Task 407 — VM: блок по шаблону', () => {

    const TPL = [
        { название: 'Охрана труда', вид: 'инструктаж',
          периодичность: 6, основание: 'не реже 1 раза в 6 месяцев' },
        { название: 'Электробезопасность', вид: 'проверка_знаний',
          периодичность: 12, основание: 'ежегодно' },
        { название: 'Пожарная безопасность', вид: 'инструктаж',
          периодичность: 6, основание: '' },
        { название: 'Целевой инструктаж', вид: 'инструктаж',
          периодичность: 0, основание: 'разовый' },
        { название: 'Охрана труда', вид: 'инструктаж',
          периодичность: 3, основание: 'дубль — игнорируется' }
    ];
    const TAB = '017';
    // записи ГОДА (ins) + все годы (_INSTR_ALL): «последний» ищется
    // по всем годам; даты — относительно сегодня (стабильность
    // статусов при любой дате прогона)
    const INS = [
        { id: 21, 'таб_номер': TAB, 'тип': 'инструктаж',
          'тема': '  ОХРАНА   труда ', 'дата_начала': addDaysIso(TODAY, -30),
          'дата_окончания': addDaysIso(TODAY, -30) },
        { id: 22, 'таб_номер': TAB, 'тип': 'инструктаж',
          'тема': 'Целевой инструктаж', 'дата_начала': addDaysIso(TODAY, -10),
          'дата_окончания': addDaysIso(TODAY, -10) },
        { id: 23, 'таб_номер': TAB, 'тип': 'инструктаж',
          'тема': 'Внеплановый по наряду №4', 'дата_начала': addDaysIso(TODAY, -5),
          'дата_окончания': addDaysIso(TODAY, -5) }
    ];
    const INSTR_ALL = [
        { id: 22, 'таб_номер': TAB, 'тип': 'инструктаж',
          'тема': 'Целевой инструктаж', 'дата_начала': addDaysIso(TODAY, -10),
          'дата_окончания': addDaysIso(TODAY, -10) },
        { id: 5, 'таб_номер': TAB, 'тип': 'проверка_знаний',
          'тема': 'Электробезопасность', 'дата_начала': addDaysIso(TODAY, -400),
          'дата_окончания': addDaysIso(TODAY, -400) }
    ];

    function sectionHost(opts) {
        opts = opts || {};
        return new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_renderInstrSection') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKind') + ',\n' +
            methodText(INDEX_SRC, '_addMonthsIso') + ',\n' +
            methodText(INDEX_SRC, '_isoDate') + ',\n' +
            methodText(INDEX_SRC, '_fmtPeriodRu') + ',\n' +
            '_fmtDateRu: function(d) { var p = String(d).split("-");' +
            '  return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(d); },' +
            '_esc: function(s) { return String(s); },' +
            '_plural: function(n, f) { return f[2]; },' +
            '_trainingCodeOf: function(t) { return t === "проверка_знаний" ? "ПЗ" : "И"; },' +
            '_statusMeta: function(c) { return { code: c, color: "#123456", name: c }; },' +
            '_INSTR_LIST: ' + JSON.stringify(opts.tpl === undefined ? TPL : opts.tpl) + ',' +
            '_INSTR_ALL: ' + JSON.stringify(opts.all === undefined ? INSTR_ALL : opts.all) +
            '});')(mockDoc({}));
    }

    test('группы: порядок шаблона, дубль названия — первый пункт', () => {
        const host = sectionHost();
        const html = host._renderInstrSection(INS, TAB, true, true, host._INSTR_LIST);
        const iOt = html.indexOf('Охрана труда');
        const iEb = html.indexOf('Электробезопасность');
        const iFb = html.indexOf('Пожарная безопасность');
        const iCi = html.indexOf('Целевой инструктаж');
        assertTrue([iOt, iEb, iFb, iCi].every((i) => i !== -1),
            'все 4 пункта шаблона (дубль слит с первым)');
        assertTrue(iOt < iEb && iEb < iFb && iFb < iCi,
            'порядок групп = порядок строк шаблона');
        assertEqual(2, (html.match(/раз в 6 месяцев/g) || []).length,
            'периодичность 6 у двух пунктов (дубль «3 мес» не показан)');
    });

    test('связка по названию: регистр/пробелы не важны (нормализация)', () => {
        const host = sectionHost();
        const html = host._renderInstrSection(INS, TAB, true, true, host._INSTR_LIST);
        // «  ОХРАНА   труда » (id 21) легла в группу «Охрана труда»:
        // под шапкой группы есть строка-запись с датой этой записи
        const iHead = html.indexOf('ws-il-name">Охрана труда<');
        assertTrue(iHead !== -1, 'шапка группы «Охрана труда»');
        const seg = html.slice(iHead, html.indexOf('ws-il-head', iHead + 10) === -1
            ? html.length : html.indexOf('ws-il-head', iHead + 10));
        assertTrue(seg.indexOf('ws-il-row') !== -1,
            'запись «  ОХРАНА   труда » попала в группу (нормализация)');
        assertTrue(seg.indexOf('⚠') === -1 && seg.indexOf('след. срок:') !== -1,
            'срок от последней записи актуален (сегодня + ~5 мес)');
    });

    test('«последний» по ВСЕМ годам: просрочено (запись прошлого года)', () => {
        const host = sectionHost();
        const html = host._renderInstrSection(INS, TAB, true, true, host._INSTR_LIST);
        const iHead = html.indexOf('ws-il-name">Электробезопасность<');
        assertTrue(iHead !== -1, 'группа «Электробезопасность»');
        const end = html.indexOf('ws-il-head', iHead + 10);
        const seg = html.slice(iHead, end === -1 ? html.length : end);
        assertTrue(seg.indexOf('⚠ просрочено с ') !== -1,
            'запись годовой давности + 12 мес → «просрочено»');
        assertTrue(seg.indexOf('— за ' + new Date().getFullYear() +
                                ' год не проводился') !== -1,
            'в году записей нет (карточка показывает явно)');
        assertEqual(fmtRu(addMonthsIsoTest(addDaysIso(TODAY, -400), 12)),
            (seg.match(/⚠ просрочено с ([\d.]+)/) || [])[1],
            'дата просрочки = последняя запись + периодичность');
    });

    test('«— не проводился» и разовый пункт (периодичность 0)', () => {
        const host = sectionHost();
        const html = host._renderInstrSection(INS, TAB, true, true, host._INSTR_LIST);
        const iFb = html.indexOf('ws-il-name">Пожарная безопасность<');
        assertTrue(iFb !== -1, 'группа «Пожарная безопасность»');
        const segFb = html.slice(iFb, html.indexOf('ws-il-head', iFb + 10));
        assertTrue(segFb.indexOf('— не проводился') !== -1 &&
                   segFb.indexOf('в этом году') === -1,
            'записей нет ни в одном году');
        const iCi = html.indexOf('ws-il-name">Целевой инструктаж<');
        const segCi = html.slice(iCi, html.indexOf('ws-il-head', iCi + 10));
        assertTrue(segCi.indexOf('ws-il-row') !== -1 &&
                   segCi.indexOf('след. срок:') === -1 &&
                   segCi.indexOf('просрочено') === -1,
            'разовый пункт: запись года есть, срок не считается');
    });

    test('«вне списка»: записи без соответствия шаблону', () => {
        const host = sectionHost();
        const html = host._renderInstrSection(INS, TAB, true, true, host._INSTR_LIST);
        const iOff = html.indexOf('вне списка:');
        assertTrue(iOff !== -1, 'секция «вне списка» есть');
        const tail = html.slice(iOff);
        assertTrue(tail.indexOf('Внеплановый по наряду №4') !== -1,
            'запись без соответствия показана плоской строкой');
        assertTrue(tail.indexOf('ws-popup-event') !== -1,
            'формат строки — как прежде (свотч/код/тема · дата)');
    });

    test('попап: компактно — без пустых пунктов и пустых состояний', () => {
        const host = sectionHost();
        const html = host._renderInstrSection(INS, TAB, true, false, host._INSTR_LIST);
        assertTrue(html.indexOf('Пожарная безопасность') === -1,
            'пункт без записей вообще — скрыт в попапе');
        assertTrue(html.indexOf('— не проводился') === -1 &&
                   html.indexOf('год не проводился') === -1,
            'пустые состояния в попапе не показываются');
        assertTrue(html.indexOf('Электробезопасность') !== -1,
            'пункт с записью прошлого года виден (контроль срока)');
        assertTrue(html.indexOf('⚠ просрочено с ') !== -1,
            'просрочка видна и в попапе');
    });

    test('зритель (withEdit=false): строки без кнопок ✎/✕', () => {
        const host = sectionHost();
        const html = host._renderInstrSection(INS, TAB, false, true, host._INSTR_LIST);
        assertTrue(html.indexOf('ws-popup-act') === -1,
            'кнопок правки/удаления нет');
        assertTrue(html.indexOf('ws-il-row') !== -1,
            'строки-записи показываются');
    });

    test('шаблон пуст: все записи года — в «вне списка»', () => {
        const host = sectionHost({ tpl: [] });
        const html = host._renderInstrSection(INS, TAB, true, true, []);
        assertTrue(html.indexOf('вне списка:') !== -1,
            'секция «вне списка» принимает все записи');
        assertEqual(3, (html.match(/ws-popup-event/g) || []).length,
            'все 3 записи года — плоскими строками');
        assertTrue(html.indexOf('ws-il-head') === -1,
            'групп нет');
    });

    test('вид записи ≠ вид пункта: код строки — факт записи', () => {
        // пункт «Электробезопасность» — проверка_знаний (ПЗ), запись
        // типа «инструктаж» (И): шапка ПЗ, строка И
        const ins2 = [{
            id: 31, 'таб_номер': TAB, 'тип': 'инструктаж',
            'тема': 'Электробезопасность', 'дата_начала': TODAY,
            'дата_окончания': TODAY
        }];
        const host = sectionHost({ all: [] });
        const html = host._renderInstrSection(ins2, TAB, false, true, host._INSTR_LIST);
        const iHead = html.indexOf('ws-il-name">Электробезопасность<');
        const gStart = html.lastIndexOf('ws-il-head', iHead);
        const seg = html.slice(gStart, html.indexOf('ws-il-head', iHead + 10));
        assertTrue(seg.indexOf('ws-popup-code">ПЗ<') !== -1 ||
                   /ws-popup-code[^>]*>ПЗ/.test(seg),
            'шапка группы — ПЗ (вид пункта)');
        assertTrue(/ws-il-row[\s\S]*?ws-popup-code[^>]*>И</.test(seg),
            'строка записи — И (факт записи)');
    });

    test('_addMonthsIso: кламп дня и переход года', () => {
        const host = sectionHost();
        assertEqual('2026-02-28', host._addMonthsIso('2026-01-31', 1),
            '31.01 + 1 мес → 28.02 (кламп)');
        assertEqual('2027-06-15', host._addMonthsIso('2026-12-15', 6),
            'переход года');
        assertEqual('', host._addMonthsIso('2026-05-10', 0),
            '0 месяцев — пусто (разовый)');
        assertEqual('', host._addMonthsIso('', 6),
            'нет даты — пусто');
    });

    test('_normInstrKey: регистр/пробелы/«ё»', () => {
        const host = sectionHost();
        assertEqual(host._normInstrKey('  Охрана   Труда '), host._normInstrKey('охрана труда'),
            'регистр и лишние пробелы');
        assertEqual(host._normInstrKey('Транспортёра'), host._normInstrKey('транспортера'),
            '«ё» и «е» эквивалентны');
        assertEqual('', host._normInstrKey(null),
            'нет значения — пустой ключ');
    });
});

// ============================================================
// 4. VM — карточка: групповой и плоский (деградация) виды
// ============================================================
describe('Task 407 — VM: карточка', () => {

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
          периодичность: 6, основание: '' }
    ];

    function cardHost(withTpl, withEdit, asBlocks) {
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
            '_canEdit: ' + (withEdit ? 'true' : 'false') + ',' +
            '_year: new Date().getFullYear(), _month: 8,' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_VACATIONS: [],' +
            '_TRAININGS: [' +
            '  { id: 41, "таб_номер": "017", "тип": "инструктаж",' +
            '    "тема": "Охрана труда", "дата_начала": "' + TODAY + '",' +
            '    "дата_окончания": "' + TODAY + '" },' +
            '  { id: 42, "таб_номер": "017", "тип": "обучение",' +
            '    "тема": "Курс АСУ ТП", "дата_начала": "' + TODAY + '",' +
            '    "дата_окончания": "' + TODAY + '" }],' +
            '_PPE: [],' +
            '_INSTR_LIST: ' + (withTpl ? JSON.stringify(TPL) : '[]') + ',' +
            '_INSTR_ALL: [],' +
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

    test('шаблон загружен: карточка — ТОЛЬКО записи (Task 414)', () => {
        const host = cardHost(true, true, true);
        const html = host._renderWorkerCard('017', true, true).join('');
        // Task 414: карточка — плоский список добавленных записей;
        // группы шаблона (заголовки/«не проводился»/«след. срок»)
        // показывает только попап ячейки шахматки
        assertTrue(html.indexOf('ws-il-head') === -1 &&
                   html.indexOf('раз в 6 месяцев') === -1,
            'групп-заголовков шаблона в карточке НЕТ');
        assertTrue(html.indexOf('— не проводился') === -1 &&
                   html.indexOf('след. срок') === -1 &&
                   html.indexOf('вне списка:') === -1,
            'служебных строк шаблона в карточке НЕТ');
        assertTrue(/ws-popup-event[^>]*>[\s\S]*?Охрана труда · /.test(html),
            'плоская строка «тема · дата» — только добавленные записи');
        assertTrue(html.indexOf('Пожарная безопасность') === -1,
            'пустой пункт шаблона в карточке не показывается');
    });

    test('шаблон загружен: попап — компактный вид', () => {
        const host = cardHost(true, true, false);
        const html = host._renderWorkerCard('017', true, false);
        assertTrue(html.indexOf('Повторные инструктажи и периодическая проверка знаний · ') !== -1,
            'заголовок блока');
        assertTrue(html.indexOf('ws-il-head') !== -1,
            'группы в попапе');
        assertTrue(html.indexOf('— не проводился') === -1,
            'пустых состояний в попапе нет');
        assertTrue(html.indexOf('Пожарная безопасность') === -1,
            'пустой пункт скрыт');
    });

    test('шаблона НЕТ: плоский список записей года (деградация)', () => {
        const host = cardHost(false, true, true);
        const html = host._renderWorkerCard('017', true, true).join('');
        assertTrue(html.indexOf('ws-il-head') === -1,
            'групп нет');
        assertTrue(/ws-popup-event[^>]*>[\s\S]*?Охрана труда · /.test(html),
            'плоские строки «тема · дата» (как до Task 407)');
        assertTrue(html.indexOf('вне списка:') === -1 &&
                   html.indexOf('— не проводился') === -1,
            'без служебных секций шаблона');
    });
});

// ============================================================
// 5. VM — форма: datalist подсказок «Темы»
// ============================================================
describe('Task 407 — VM: datalist «Темы»', () => {

    const TPL = [
        { название: 'Охрана труда', вид: 'инструктаж',
          периодичность: 6, основание: '' },
        { название: 'Пожарная безопасность', вид: 'инструктаж',
          периодичность: 6, основание: '' },
        { название: 'Электробезопасность', вид: 'проверка_знаний',
          периодичность: 12, основание: '' }
    ];

    function formHost(tip, tpl) {
        const els = {
            wsTrTitleList: { innerHTML: 'stale' },
            wsTrType: { value: tip }
        };
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_fillTrTitleOptions') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKind') + ',\n' +
            '_INSTR_LIST: ' + JSON.stringify(tpl === undefined ? TPL : tpl) + ',' +
            '_esc: function(s) { return String(s); }' +
            '});')(mockDoc(els));
        return { host: host, els: els };
    }

    test('тип «инструктаж» — подсказки вида «инструктаж»', () => {
        const c = formHost('инструктаж');
        c.host._fillTrTitleOptions();
        const h = c.els.wsTrTitleList.innerHTML;
        assertTrue(h.indexOf('value="Охрана труда"') !== -1 &&
                   h.indexOf('value="Пожарная безопасность"') !== -1,
            'пункты вида «инструктаж» предложены');
        assertTrue(h.indexOf('Электробезопасность') === -1,
            'пункт вида «проверка_знаний» не предложен');
    });

    test('тип «проверка знаний» (пробел) — подсказки вида ПЗ', () => {
        const c = formHost('проверка знаний');
        c.host._fillTrTitleOptions();
        const h = c.els.wsTrTitleList.innerHTML;
        assertTrue(h.indexOf('value="Электробезопасность"') !== -1,
            'пункт вида «проверка_знаний» предложен');
        assertTrue(h.indexOf('Охрана труда') === -1,
            'пункты вида «инструктаж» не предложены');
    });

    test('тип «обучение» — без подсказок (темы свободные)', () => {
        const c = formHost('обучение');
        c.host._fillTrTitleOptions();
        assertEqual('', c.els.wsTrTitleList.innerHTML,
            'datalist пуст для не-инструктажных типов');
    });

    test('шаблона нет — datalist пуст (свободный ввод)', () => {
        const c = formHost('инструктаж', []);
        c.host._fillTrTitleOptions();
        assertEqual('', c.els.wsTrTitleList.innerHTML, 'нет подсказок');
    });
});

// ============================================================
// 6. VM — кэш Task 314: roundtrip instrList/instrAll
// ============================================================
describe('Task 407 — VM: кэш (localStorage)', () => {

    const TPL = [{ название: 'Охрана труда', вид: 'инструктаж',
                   периодичность: 6, основание: '' }];
    const ALL = [{ id: 1, 'таб_номер': '017', 'тип': 'инструктаж',
                   'тема': 'Охрана труда', 'дата_начала': '2026-02-10',
                   'дата_окончания': '2026-02-10' }];

    function lsMock() {
        const store = {};
        return {
            store: store,
            getItem: function(k) { return k in store ? store[k] : null; },
            setItem: function(k, v) { store[k] = String(v); },
            removeItem: function(k) { delete store[k]; }
        };
    }

    test('_cacheWrite сохраняет instrList/instrAll', () => {
        const ls = lsMock();
        const host = new Function('document', 'localStorage', 'return ({' +
            methodText(INDEX_SRC, '_cacheRead') + ',\n' +
            methodText(INDEX_SRC, '_cacheWrite') + ',\n' +
            methodText(INDEX_SRC, '_ymKey') + ',\n' +
            '_wsCacheKey: "kip8_ws_test_407",' +
            '_STATUS_CODES: [], _PATTERNS: [], _EMPLOYEES: [],' +
            '_VACATIONS: [], _PPE: [], _ENTRIES: [], _TRAININGS: [],' +
            '_INSTR_LIST: ' + JSON.stringify(TPL) + ',' +
            '_INSTR_ALL: ' + JSON.stringify(ALL) + ',' +
            '_year: 2026, _month: 8, _cacheTs: 0' +
            '});')(mockDoc({}), ls);
        host._cacheWrite();
        const c = JSON.parse(ls.store['kip8_ws_test_407']);
        assertEqual(JSON.stringify(TPL), JSON.stringify(c.instrList),
            'instrList в кэше');
        assertEqual(JSON.stringify(ALL), JSON.stringify(c.instrAll),
            'instrAll в кэше');
    });

    test('_restoreCachedView восстанавливает instrList/instrAll', () => {
        const ls = lsMock();
        const cache = {
            v: 1,
            codes: [{ code: 'И', name: 'инструктаж', color: '#111' }],
            patterns: [],
            employees: [{ 'таб_номер': '017', 'ФИО': 'И' }],
            vacations: { '2026': [] },
            ppe: [],
            instrList: TPL,
            instrAll: ALL,
            views: { '2026-08': { entries: [], trainings: [], ts: 1 } }
        };
        ls.store['kip8_ws_test_407'] = JSON.stringify(cache);
        const host = new Function('document', 'localStorage', 'return ({' +
            methodText(INDEX_SRC, '_cacheRead') + ',\n' +
            methodText(INDEX_SRC, '_restoreCachedView') + ',\n' +
            methodText(INDEX_SRC, '_restoreFromObj') + ',\n' +
            methodText(INDEX_SRC, '_ymKey') + ',\n' +
            '_normalizeStatusCodes: function(c) { return c; },' +
            '_normalizeInstrList: function(l) { return l; },' +
            '_fillStatusSelect: function() {},' +
            '_wsCacheKey: "kip8_ws_test_407",' +
            '_STATUS_CODES: [], _PATTERNS: [], _EMPLOYEES: [],' +
            '_VACATIONS: [], _VAC_PAGE: [], _PPE: [],' +
            '_INSTR_LIST: [], _INSTR_ALL: [], _vacYear: 0,' +
            '_year: 2026, _month: 8, _cacheTs: 0' +
            '});')(mockDoc({}), ls);
        assertTrue(host._restoreCachedView(), 'кэш поднят');
        assertEqual(JSON.stringify(TPL), JSON.stringify(host._INSTR_LIST),
            'instrList восстановлен');
        assertEqual(JSON.stringify(ALL), JSON.stringify(host._INSTR_ALL),
            'instrAll восстановлен');
    });

    test('кэш ПРЕЖНЕЙ версии (без полей) — пустые, вид поднимается', () => {
        const ls = lsMock();
        const cache = {
            v: 1,
            codes: [{ code: 'И', name: 'инструктаж', color: '#111' }],
            patterns: [],
            employees: [{ 'таб_номер': '017', 'ФИО': 'И' }],
            vacations: { '2026': [] },
            views: { '2026-08': { entries: [], trainings: [], ts: 1 } }
        };
        ls.store['kip8_ws_test_407'] = JSON.stringify(cache);
        const host = new Function('document', 'localStorage', 'return ({' +
            methodText(INDEX_SRC, '_cacheRead') + ',\n' +
            methodText(INDEX_SRC, '_restoreCachedView') + ',\n' +
            methodText(INDEX_SRC, '_restoreFromObj') + ',\n' +
            methodText(INDEX_SRC, '_ymKey') + ',\n' +
            '_normalizeStatusCodes: function(c) { return c; },' +
            '_normalizeInstrList: function(l) { return l; },' +
            '_fillStatusSelect: function() {},' +
            '_wsCacheKey: "kip8_ws_test_407",' +
            '_STATUS_CODES: [], _PATTERNS: [], _EMPLOYEES: [],' +
            '_VACATIONS: [], _VAC_PAGE: [], _PPE: [],' +
            '_INSTR_LIST: ["stale"], _INSTR_ALL: ["stale"], _vacYear: 0,' +
            '_year: 2026, _month: 8, _cacheTs: 0' +
            '});')(mockDoc({}), ls);
        assertTrue(host._restoreCachedView(), 'кэш поднят');
        assertEqual(0, host._INSTR_LIST.length, 'instrList пуст (нет поля)');
        assertEqual(0, host._INSTR_ALL.length, 'instrAll пуст (нет поля)');
    });
});

// ============================================================
// 7. GAS-VM — сервер: instrList/instrAll/instrListInit
// ============================================================
describe('Task 407 — GAS-VM: сервер (моки листов)', () => {

    class MockSheet {
        constructor(rows) { this.rows = rows || []; }
        getLastRow() { return this.rows.length; }
        getLastColumn() {
            let m = 0;
            for (const r of this.rows) m = Math.max(m, r.length);
            return m || 1;
        }
        getRange(row, col, numRows, numCols) {
            numRows = numRows || 1; numCols = numCols || 1;
            const self = this;
            return {
                getValues() {
                    const out = [];
                    for (let r = row; r < row + numRows; r++) {
                        const line = [];
                        for (let c = col; c < col + numCols; c++) {
                            const rr = self.rows[r - 1];
                            line.push(rr ? (rr[c - 1] === undefined ? '' : rr[c - 1]) : '');
                        }
                        out.push(line);
                    }
                    return out;
                },
                setValues(vals) {
                    for (let i = 0; i < vals.length; i++) {
                        const r = row + i;
                        while (self.rows.length < r) self.rows.push([]);
                        for (let c = 0; c < vals[i].length; c++) {
                            self.rows[r - 1][col - 1 + c] = vals[i][c];
                        }
                    }
                },
                setValue(v) {
                    while (self.rows.length < row) self.rows.push([]);
                    self.rows[row - 1][col - 1] = v;
                },
                // Task 409: instrListInit очищает прежние строки
                clearContent() {
                    for (let r = row; r < row + numRows; r++) {
                        for (let c = col; c < col + numCols; c++) {
                            if (self.rows[r - 1]) self.rows[r - 1][c - 1] = '';
                        }
                    }
                },
                setFontWeight() { return this; },
                setBackground() { return this; },
                setFontColor() { return this; }
            };
        }
        deleteRow(r) { this.rows.splice(r - 1, 1); }
        setFrozenRows() {}
    }

    const MOCK_UTILS = {
        findSessionByToken: () => ({ user_id: 1 }),
        findUserById: () => ({ role: 'Админ', email: 'test@example.com' }),
        audit: () => {}
    };

    function loadWS(sheets, insertSheetImpl) {
        const ss = {
            getSheetByName: (n) => sheets[n] || null,
            insertSheet: insertSheetImpl || ((name) => {
                const s = new MockSheet([]);
                sheets[name] = s;
                return s;
            })
        };
        const SpreadsheetApp = { openById: () => ss };
        const factory = new Function('SpreadsheetApp', 'Utils', 'Logger',
            WS_SRC + '\nreturn WorkSchedule;');
        return factory(SpreadsheetApp, MOCK_UTILS, { log: () => {} });
    }

    function baseSheets() {
        return {
            'Инструктажи': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_начала',
                 'дата_окончания', 'длительность_дней', 'комментарий'],
                [1, '017', 'инструктаж', 'Охрана труда',
                 new Date(2024, 2, 10), new Date(2024, 2, 10), 1, ''],
                [2, '017', 'проверка_знаний', 'Электробезопасность',
                 new Date(2026, 7, 20), new Date(2026, 7, 20), 1, ''],
                [3, '018', 'обучение', 'Курс АСУ ТП',
                 new Date(2026, 7, 12), new Date(2026, 7, 12), 1, '']
            ])
        };
    }

    function withListSheet(sheets) {
        // столбцы В ДРУГОМ ПОРЯДКЕ — чтение по заголовкам
        sheets['Список_И_и_ПЗ'] = new MockSheet([
            ['основание', 'название', 'периодичность', 'вид'],
            ['не реже 1р в 6 мес', 'Охрана труда', 6, 'инструктаж'],
            ['ежегодно', 'Электробезопасность', '12', 'Проверка знаний'],
            ['', 'Целевой инструктаж', '', ''],
            ['строка без названия', '', 3, 'инструктаж']
        ]);
        return sheets;
    }

    test('listTrainings: instrList по заголовкам + instrAll без фильтра года', () => {
        const WS = loadWS(withListSheet(baseSheets()));
        const r = WS.listTrainings({ token: 't', year: 2026, month: 8 });
        assertTrue(r.ok, 'ok');
        assertEqual(2, r.data.trainings.length,
            'годовой срез trainings не изменился (август 2026: id 2,3)');
        assertEqual(3, r.data.instrList.length,
            'шаблон прочитан (строка без названия пропущена)');
        assertEqual('Охрана труда', r.data.instrList[0].название, 'название');
        assertEqual('инструктаж', r.data.instrList[0].вид, 'вид');
        assertEqual(6, r.data.instrList[0].периодичность, 'периодичность 6');
        assertEqual(12, r.data.instrList[1].периодичность,
            'периодичность «12» (строка) → число');
        assertEqual('Проверка знаний', r.data.instrList[1].вид,
            'вид — как в листе (нормализует клиент — толерантность)');
        assertEqual(0, r.data.instrList[2].периодичность,
            'пустая периодичность → 0 (разовый)');
        assertEqual(3, r.data.instrAll.length,
            'instrAll — ВСЕ записи «Инструктажей» (id 1 из 2024 тоже)');
        assertEqual(1, r.data.instrAll[0].id,
            'запись 2024 года в instrAll (кросс-годовой «последний»)');
    });

    test('listTrainings: листа «Список_И_и_ПЗ» нет — instrList []', () => {
        const WS = loadWS(baseSheets());
        const r = WS.listTrainings({ token: 't', year: 2026, month: 8 });
        assertTrue(r.ok && Array.isArray(r.data.instrList) &&
                   r.data.instrList.length === 0,
            'нет листа — пустой шаблон (блок живёт плоским списком)');
        assertEqual(3, r.data.instrAll.length, 'instrAll при этом отдаётся');
    });

    test('listTrainings: нет столбца «название» — instrList []', () => {
        const sheets = baseSheets();
        sheets['Список_И_и_ПЗ'] = new MockSheet([
            ['наименование', 'вид', 'периодичность'],
            ['Охрана труда', 'инструктаж', 6]
        ]);
        const WS = loadWS(sheets);
        const r = WS.listTrainings({ token: 't', year: 2026, month: 8 });
        assertEqual(0, r.data.instrList.length,
            'нет ключевого заголовка «название» — пустой список');
    });

    test('instrListInit: создаёт лист с заголовками и эталоном (Task 409)', () => {
        const sheets = baseSheets();
        const WS = loadWS(sheets);
        const r = WS.instrListInit();
        assertTrue(r.ok && r.created === true, 'лист создан');
        const s = sheets['Список_И_и_ПЗ'];
        assertTrue(!!s, 'лист «Список_И_и_ПЗ» в таблице');
        assertEqual(6, s.rows.length, 'заголовок + 5 пунктов эталона');
        assertEqual('название', s.rows[0][0], 'заголовок 1');
        assertEqual('вид', s.rows[0][1], 'заголовок 2');
        assertEqual('периодичность', s.rows[0][2], 'заголовок 3');
        assertEqual('основание', s.rows[0][3], 'заголовок 4');
        assertEqual('Повторный инструктаж по рабочим инструкциям ОТ',
            s.rows[1][0], 'пункт 1 — эталон заявки 409');
        assertEqual(6, s.rows[1][2], 'периодичность пункта 1');
        assertEqual('инструкция № 53-ОТ', s.rows[5][3],
            'основание пункта «работы на высоте»');
        // чтение сразу работает
        const lr = WS.listTrainings({ token: 't', year: 2026, month: 8 });
        assertEqual(5, lr.data.instrList.length, 'шаблон читается после init');
    });

    test('instrListInit: существующий лист — строки замещаются эталоном (Task 409)', () => {
        const sheets = withListSheet(baseSheets());
        const WS = loadWS(sheets);
        const r = WS.instrListInit();
        assertTrue(r.ok && r.reset === true, 'лист уже есть — reset (замещение)');
        assertEqual(5, r.rows, 'строк данных в отчёте');
        const s = sheets['Список_И_и_ПЗ'];
        assertEqual(6, s.rows.length, 'заголовок + 5 пунктов эталона');
        assertEqual('название', s.rows[0][0], 'заголовок приведён к эталону');
        assertEqual('Повторный инструктаж по инструкции № 9-ОГЭ',
            s.rows[2][0], 'пункт 2 эталона');
        assertTrue(s.rows.every(rr => rr[1] !== 'Проверка знаний'),
            'прежнее содержимое (столбцы в другом порядке) замещено');
        // чтение после замещения работает
        const lr = WS.listTrainings({ token: 't', year: 2026, month: 8 });
        assertEqual(5, lr.data.instrList.length, 'шаблон читается после reset');
    });
});
