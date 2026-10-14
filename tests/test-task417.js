// ============================================================
// Task 417 — заявка (kip8test): «В блоках карт работников
// названия должны отображаться в полном виде. Попап по фамилии -
// убери полностью окно, теперь все подробные данные можно
// посмотреть в картах работников. Пытаюсь зайти в редактирование
// записи до 1000В у Федосова за 2025 год, не заходит и сообщение
// "Мероприятие не найдено — обновите график", хотя в правки
// записей за текущий год заходит, и все записи, в том числе
// до 1000В за 2025 год есть в архивной таблице Инструктажи».
//
// Реализация (только index.html, сервер НЕ менялся):
//  1) ПОЛНЫЕ названия в блоках карт: _renderWorkerCard b3/b5 не
//     подставляют _instrShortOf (сокращения Task 416 остались
//     только в тултипе бейджа, окнах дня/месяца, печати табеля
//     и заголовках групп тестовой попап-проекции);
//  2) попап по фамилии удалён ПОЛНОСТЬЮ: DOM #wsEmpPopup/
//     #wsEmpPopupCloser, onclick td.ws-emp-col, методы
//     onEmpCellClick/_openEmpPopup, гейт _empCardAllowed,
//     CSS (.ws-cell-popup.ws-emp-popup, hover ФИО тёмная/светлая,
//     even-row оверрайд, ws-readonly-оверрайды);
//     closeEmpPopup/_renderEmpPopup — no-op совместимости;
//  3) editTraining: единый пул _TRAININGS → _INSTR_ALL →
//     _EVENTS_ALL — правка архивных записей прошлых лет из
//     годовых навигаторов карточек (Task 408) открывает форму.
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Тело метода WorkSchedule: от сигнатуры до закрывающей скобки
// (подсчёт фигурных скобок — как в test-task416; НЕ regex с
// «до следующего метода»: тот оставляет висячую сигнатуру)
function methodText(src, name) {
    const start = src.indexOf(name + ': function(');
    if (start === -1) return '';
    const braceStart = src.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    return '';
}

function stripComments(s) {
    return s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

// ============================================================
// 1. SRC — попап по фамилии удалён полностью
// ============================================================
describe('Task 417 — SRC: попап по фамилии удалён', () => {

    test('DOM: окна #wsEmpPopup и кловера нет', () => {
        assertFalse(INDEX_SRC.indexOf('id="wsEmpPopup"') !== -1,
            'контейнер попапа удалён');
        assertFalse(INDEX_SRC.indexOf('id="wsEmpPopupCloser"') !== -1,
            'кловер удалён');
        assertTrue(INDEX_SRC.indexOf(
            'ПОПАП КАРТОЧКИ ПО ФАМИЛИИ УДАЛЁН ПОЛНОСТЬЮ') !== -1,
            'HTML-маркер удаления');
    });

    test('методы входа и гейт удалены; no-op совместимости живы', () => {
        assertFalse(INDEX_SRC.indexOf('onEmpCellClick: function') !== -1,
            'onEmpCellClick удалён (клика по ФИО нет)');
        assertFalse(INDEX_SRC.indexOf('_openEmpPopup: function') !== -1,
            '_openEmpPopup удалён');
        assertFalse(INDEX_SRC.indexOf('_empCardAllowed: function') !== -1,
            '_empCardAllowed удалён');
        // no-op совместимости: closeEmpPopup (вызовы в формах/навигации)
        // и _renderEmpPopup (прямые вызовы в тестах)
        assertTrue(INDEX_SRC.indexOf('closeEmpPopup: function') !== -1,
            'closeEmpPopup жив (защитный no-op)');
        assertTrue(INDEX_SRC.indexOf('_renderEmpPopup: function') !== -1,
            '_renderEmpPopup жив (обёртка для тестов)');
    });

    test('td.ws-emp-col: data-tab жив, onclick не рендерится', () => {
        const gridPart = INDEX_SRC.slice(
            INDEX_SRC.indexOf('_renderGrid: function'),
            INDEX_SRC.indexOf('_fitGrid: function'));
        assertTrue(gridPart.indexOf('data-tab=') !== -1,
            'data-tab сохранён (идентификация строки)');
        assertFalse(gridPart.indexOf('WorkSchedule.onEmpCellClick(event,') !== -1,
            'onclick ФИО не рендерится');
    });

    test('CSS: правила окна и hover ФИО удалены', () => {
        assertFalse(INDEX_SRC.indexOf('.ws-cell-popup.ws-emp-popup {') !== -1,
            'габариты окна .ws-emp-popup удалены');
        assertFalse(INDEX_SRC.indexOf('.ws-emp-popup .ws-popup-sec {') !== -1,
            'перенос заголовков окна удалён');
        assertFalse(INDEX_SRC.indexOf('#wsEmpPopup .ws-popup-name') !== -1,
            'селектор попапа в правиле Task 415 удалён');
        assertFalse(INDEX_SRC.indexOf('.ws-grid tbody td.ws-emp-col:hover {') !== -1,
            'hover ФИО (тёмная) удалён');
        assertFalse(INDEX_SRC.indexOf(
            '[data-theme="light"] .ws-grid tbody td.ws-emp-col:hover') !== -1,
            'hover ФИО (светлая) удалён');
        assertFalse(INDEX_SRC.indexOf(
            '.ws-grid tbody tr:nth-child(even) td.ws-emp-col:hover') !== -1,
            'even-row hover-оверрайд удалён');
        assertFalse(INDEX_SRC.indexOf(
            'ws-readonly .ws-grid tbody td.ws-emp-col:hover') !== -1,
            'ws-readonly hover-оверрайды удалены');
    });

    test('регресс: перенос записей/заголовков КАРТ жив (Task 415)', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-wcard .ws-popup-name {') !== -1,
            'перенос записей .ws-wcard .ws-popup-name жив');
        assertTrue(INDEX_SRC.indexOf('.ws-wcard .ws-whead-t {') !== -1,
            'перенос заголовков блоков жив');
        assertTrue(INDEX_SRC.indexOf('.ws-wcard .ws-popup-title {') !== -1,
            'типографика .ws-wcard жива');
    });
});

// ============================================================
// 2. SRC — полные названия в блоках карт
// ============================================================
describe('Task 417 — SRC: полные названия в блоках карт', () => {

    test('b3/b5: темы без _instrShortOf', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertEqual(0, (fn.match(/this\._instrShortOf\(/g) || []).length,
            'в блоках карт сокращения не подставляются');
        assertTrue(fn.indexOf('this._esc(t.тема || meta.name || t.тип)') !== -1,
            'b3 (мероприятия) — полное название');
        assertTrue(fn.indexOf('this._esc(it.тема || iMeta.name || it.тип)') !== -1,
            'b5 (инструктажи/ПЗ) — полное название');
    });

    test('регресс 416: сокращения живут в компактных показах', () => {
        const print = stripComments(methodText(INDEX_SRC, '_buildPrintHtml'));
        assertTrue(print.indexOf("this._instrShortOf(ev['тема']) || evMeta.name") !== -1,
            'печать табеля — сокращение');
        const cell = methodText(INDEX_SRC, '_renderCell');
        assertTrue(cell.indexOf('this._instrShortOf(String(evTr.тема).trim())') !== -1,
            'тултип бейджа шахматки — сокращение');
        const day = methodText(INDEX_SRC, '_renderEventsPopup');
        assertTrue(day.indexOf('this._instrShortOf(deT.тема) || deMeta.name') !== -1,
            'окно «Мероприятия в этот день» — сокращение');
        const month = methodText(INDEX_SRC, '_renderMonthEventsPanel');
        assertTrue(month.indexOf("this._instrShortOf(tr['тема']) || meta.name") !== -1,
            'окно «Мероприятия» месяца — сокращение');
    });

    test('форма «+ Инструктаж…» — select по полным названиям (регресс)', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'openTrainingForm'));
        assertTrue(fn.indexOf('_instrShortOf') === -1,
            'форма не подставляет сокращения');
    });
});

// ============================================================
// 3. VM — editTraining: единый пул (архивные годы)
// ============================================================
describe('Task 417 — VM: editTraining единый пул', () => {

    function etHost(opts) {
        // тосты пишутся в замыкание (KipToast передаётся аргументом
        // в new Function), вызовы окон — в this.__calls (внутри
        // new Function замыкания etHost недоступны)
        const toasts = [];
        const host = new Function('KipToast', 'return ({' +
            '__calls: [],' +
            methodText(INDEX_SRC, 'editTraining') + ',\n' +
            '_canEdit: true,' +
            '_TRAININGS: ' + JSON.stringify(opts.trainings || []) + ',' +
            '_INSTR_ALL: ' + JSON.stringify(opts.instrAll || []) + ',' +
            '_EVENTS_ALL: ' + JSON.stringify(opts.eventsAll || []) + ',' +
            'closeCellPopup: function() { this.__calls.push("closeCell"); },' +
            'closeEmpPopup: function() { this.__calls.push("closeEmp"); },' +
            'openTrainingForm: function(a, b, r) { this.__calls.push(["form", r]); }' +
            '});')({ show: function(m) { toasts.push(m); } });
        host.__toasts = toasts;
        return host;
    }

    const ARCH = { id: 501, 'таб_номер': '0871', 'тип': 'проверка_знаний',
        'тема': 'Периодическая проверка знаний на допуск к проведению работ в электроустановках до 1000 В',
        'дата_начала': '2025-06-10', 'дата_окончания': '2025-06-10',
        'длительность_дней': 1, 'комментарий': '' };
    const CUR = { id: 601, 'таб_номер': '0871', 'тип': 'инструктаж',
        'тема': 'Повторный инструктаж по рабочим инструкциям ОТ',
        'дата_начала': '2026-03-20', 'дата_окончания': '2026-03-20',
        'длительность_дней': 1, 'комментарий': '' };
    const EV = { id: 701, 'таб_номер': '0871', 'тип': 'обучение',
        'тема': 'Курс АСУ ТП', 'дата_начала': '2025-02-01',
        'дата_окончания': '2025-02-05', 'длительность_дней': 5,
        'комментарий': '' };

    test('архивная запись 2025 (только _INSTR_ALL) открывает форму правки', () => {
        // сценарий заявки: Федосов, «до 1000 В», 2025 год — записи
        // в _TRAININGS (год табеля 2026) нет
        const host = etHost({ instrAll: [ARCH] });
        host.editTraining(501);
        const form = host.__calls.filter(r => r[0] === 'form')[0];
        assertTrue(!!form, 'форма открыта');
        assertEqual(501, form[1].id, 'передана архивная запись');
        assertEqual('2025-06-10', form[1].дата_начала, 'запись 2025 года');
        assertTrue(host.__calls.indexOf('closeCell') !== -1 &&
                   host.__calls.indexOf('closeEmp') !== -1,
            'окна закрываются до открытия формы');
        assertEqual(0, host.__toasts.length,
            'тоста «Мероприятие не найдено» НЕТ');
    });

    test('архивная запись «Мероприятий» (только _EVENTS_ALL) открывается', () => {
        const host = etHost({ eventsAll: [EV] });
        host.editTraining(701);
        const form = host.__calls.filter(r => r[0] === 'form')[0];
        assertTrue(!!form && form[1].id === 701,
            'форма открыта с записью листа «Мероприятия»');
    });

    test('запись текущего года (_TRAININGS) — прежний путь (регресс 309)', () => {
        const host = etHost({ trainings: [CUR], instrAll: [ARCH] });
        host.editTraining(601);
        const form = host.__calls.filter(r => r[0] === 'form')[0];
        assertTrue(!!form && form[1].id === 601,
            'форма открыта с годовой записью');
    });

    test('приоритет _TRAININGS при дубле id', () => {
        const dup = Object.assign({}, ARCH, { id: 501, 'дата_начала': '2026-01-15' });
        const host = etHost({ trainings: [dup], instrAll: [ARCH] });
        host.editTraining(501);
        const form = host.__calls.filter(r => r[0] === 'form')[0];
        assertEqual('2026-01-15', form[1].дата_начала,
            'взята свежая запись среза года табеля');
    });

    test('не найдена нигде — прежний тост, форма НЕ открывается', () => {
        const host = etHost({ trainings: [CUR] });
        host.editTraining(9999);
        assertEqual('Мероприятие не найдено — обновите график', host.__toasts[0],
            'тост прежним текстом');
        assertEqual(0, host.__calls.filter(r => r[0] === 'form').length,
            'форма не открыта');
    });
});

// ============================================================
// 4. VM — карточка: полные названия в блоках
// ============================================================
describe('Task 417 — VM: карточка — полные названия', () => {

    const YEAR = new Date().getFullYear();
    function ymd(dt) {
        const m = dt.getMonth() + 1, d = dt.getDate();
        return dt.getFullYear() + '-' + (m < 10 ? '0' : '') + m +
               '-' + (d < 10 ? '0' : '') + d;
    }
    const TODAY = ymd(new Date());

    const EMP = [
        { 'таб_номер': '0871', 'ФИО': 'Федосов А. В.', 'тип': 'дневной',
          'смена': '', 'должность': 'Слесарь КИПиА 5 разряд',
          'комментарий': '', 'группа_допуска': 'IV',
          'дата_приёма': '2023-04-03' }
    ];
    const TPL = [
        { название: 'Повторный инструктаж по рабочим инструкциям ОТ',
          вид: 'инструктаж', периодичность: 6, основание: '',
          сокращение: 'Инстр. ОТ' },
        { название: 'Периодическая проверка знаний на допуск к проведению работ в электроустановках до 1000 В',
          вид: 'проверка_знаний', периодичность: 12, основание: '',
          сокращение: 'ПЗ ЭБ до 1000 В' }
    ];
    const TR = [
        { id: 51, 'таб_номер': '0871', 'тип': 'проверка_знаний',
          'тема': 'Периодическая проверка знаний на допуск к проведению работ в электроустановках до 1000 В',
          'дата_начала': TODAY, 'дата_окончания': TODAY }
    ];

    function cardHost() {
        return new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
            methodText(INDEX_SRC, '_lastExam1000Date') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
            methodText(INDEX_SRC, '_renderInstrSection') + ',\n' +
            methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKind') + ',\n' +
            methodText(INDEX_SRC, '_addMonthsIso') + ',\n' +
            methodText(INDEX_SRC, '_isoDate') + ',\n' +
            methodText(INDEX_SRC, '_fmtPeriodRu') + ',\n' +
            '_canEdit: true,' +
            '_year: ' + YEAR + ', _month: 8,' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_VACATIONS: [],' +
            '_TRAININGS: ' + JSON.stringify(TR) + ',' +
            '_PPE: [],' +
            '_INSTR_LIST: ' + JSON.stringify(TPL) + ',' +
            '_INSTR_ALL: ' + JSON.stringify(TR) + ',' +
            '_EVENTS_ALL: [],' +
            '_fmtDateRu: function(d) { var p = String(d).split("-");' +
            '  return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(d); },' +
            '_esc: function(s) { return String(s); },' +
            '_escAttr: function(s) { return String(s); },' +
            '_vacDaysInYear: function(v, y) { return 0; },' +
            '_vacNetDaysInYear: function(v, y) { return 0; },' +
            '_plural: function(n, f) { return f[2]; },' +
            '_trainingCodeOf: function(t) { return t === "проверка_знаний" ? "ПЗ" : "И"; },' +
            '_statusMeta: function(c) { return { code: c, color: "#123456", name: c }; }' +
            '});')({ getElementById: () => null });
    }

    test('блок инструктажей: ПОЛНОЕ название + дата', () => {
        const host = cardHost();
        const html = host._renderWorkerCard('0871', true, true).join('');
        assertTrue(html.indexOf(
            'Периодическая проверка знаний на допуск к проведению работ в электроустановках до 1000 В · ') !== -1,
            'полное название «до 1000 В» в строке блока');
        assertFalse(/ws-popup-event[^>]*>[\s\S]*?ПЗ ЭБ до 1000 В · /.test(html),
            'сокращения в блоке карты НЕТ');
        assertFalse(/ws-popup-event[^>]*>[\s\S]*?Инстр\. ОТ · /.test(html),
            'сокращений инструктажей в блоке НЕТ');
    });

    test('кнопки ✎/✕ в плоских строках живы (правка архивов)', () => {
        const host = cardHost();
        const html = host._renderWorkerCard('0871', true, true).join('');
        assertTrue(html.indexOf('WorkSchedule.editTraining(51, 1)') !== -1,
            '✎ зовёт editTraining по id записи + семейство инструктажей (Task 427)');
        assertTrue(html.indexOf('WorkSchedule.deleteTraining(51, 1)') !== -1,
            '✕ зовёт deleteTraining по id записи + семейство (Task 427)');
    });
});

// ============================================================
// 5. SW — версия поднята
// ============================================================
describe('Task 417 — SW', () => {
    test('SW: кэш поднят до kipia-test-v734', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v734'") !== -1,
            'CACHE_VERSION = kipia-test-v734 (Task 417)');
        assertFalse(SW_SRC.indexOf('kipia-test-v735') !== -1,
            'следующей версии в кэше нет');
    });
});
