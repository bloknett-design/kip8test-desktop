// ============================================================
// Task 489 — заявка: «В файле табель_КИП_ИОС, в таблице
// "Сотрудники" столбец "ФИО" раздели на три столбца для указания
// полных данных работников фамилии, имени и отчества, и эти
// данные полного ФИО должны отражаться только в приложении в
// карте работника в блоке профиле и в сохранённом файле excel
// в скаченном архиве на листе "Работники", в других местах как
// и прежде сокращённо (Иванов И. И.). Так же добавь новый
// столбец "дата_рождения" перед столбцом "комментарий", и эту
// информацию так же необходимо отображать в карте работника в
// блоке профиле в конце списка. Не забудь учесть при написании
// кода для скриптов, что столбцы в таблице "Сотрудники"
// сместятся и поменяют своё наименование по расположению».
//
// 1) ФОРМА: поля Фамилия/Имя/Отчество + Дата рождения (единое
//    поле ФИО удалено); payload add/updateEmployee несёт ЧАСТИ +
//    дата_рождения + легаси-поле ФИО (краткая композиция — старый
//    не обновлённый сервер пишет его в единый столбец как прежде).
// 2) КАРТА РАБОТНИКА: шапка блока профиля — ПОЛНОЕ ФИО
//    (ФИО_полное, легаси-кэш — краткое); «Дата рождения» — В
//    КОНЦЕ списка профиля (после «Комментария»); в остальных
//    местах (шахматка/попапы/сводка/СИЗ) — КАК ПРЕЖДЕ кратко.
// 3) АРХИВ EXCEL: лист «Работники» — колонка ФИО с ПОЛНЫМ именем;
//    прочие листы архива (Отпуска/Инструктажи/СИЗ) — кратко.
// 4) СЕРВЕР WorkSchedule.gs: ВСЕ столбцы «Сотрудников» — по
//    ЗАГОЛОВКАМ строки 1 (_employeesColMap; фолбэк — канон
//    раскладки): НОВАЯ (фамилия/имя/отчество B/C/D … дата_
//    рождения M) / ЛЕГАСИ (ФИО B … K); listEmployees отдаёт
//    ФИО (краткое — композиция), ФИО_полное, части, дату
//    рождения; add/update/dismissEmployee пишут по карте;
//    employeesSplitInit — разовый перенос (idempotent).
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');

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
// 1. SRC — форма: ТРИ поля имени + дата рождения
// ============================================================
describe('Task 489 — SRC: форма работника', () => {

    test('поля Фамилия/Имя/Отчество/Дата рождения живут; единое ФИО удалено', () => {
        ['wsEmpFam', 'wsEmpName', 'wsEmpPatr', 'wsEmpBirth'].forEach(id => {
            assertTrue(INDEX_SRC.indexOf('id="' + id + '"') !== -1,
                'id="' + id + '" в форме');
        });
        assertFalse(INDEX_SRC.indexOf('id="wsEmpFio"') !== -1,
            'единое поле wsEmpFio удалено (Task 489)');
        assertTrue(INDEX_SRC.indexOf('for="wsEmpFam">Фамилия<') !== -1,
            'метка «Фамилия»');
        assertTrue(INDEX_SRC.indexOf('for="wsEmpBirth">Дата рождения<') !== -1,
            'метка «Дата рождения»');
        assertTrue(INDEX_SRC.indexOf('for="wsEmpPatr">Отчество<') !== -1,
            'метка «Отчество»');
    });

    test('submit: валидация — обязательна ФАМИЛИЯ (не ФИО)', () => {
        const fn = methodText(INDEX_SRC, 'submitEmployeeForm');
        assertTrue(fn.indexOf("KipToast.show('Введите фамилию')") !== -1,
            'тост «Введите фамилию»');
        assertFalse(fn.indexOf("KipToast.show('Введите ФИО')") !== -1,
            'старый тост «Введите ФИО» удалён');
    });

    test('submit: payload несёт ЧАСТИ + дату рождения + легаси-ФИО', () => {
        const fn = methodText(INDEX_SRC, 'submitEmployeeForm');
        // краткая композиция для легаси-сервера
        assertTrue(fn.indexOf('var fioShort = this._wsShortFio(fam, name, patr);') !== -1,
            'краткое ФИО composeится из частей');
        ['фамилия', 'имя', 'отчество', 'дата_рождения'].forEach(k => {
            assertTrue(fn.indexOf("'" + k + "':") !== -1,
                'поле «' + k + '» в payload');
        });
        // оба вызова (update и add)
        const upd = fn.indexOf('workSchedule.updateEmployee');
        const add = fn.indexOf('workSchedule.addEmployee');
        assertTrue(upd !== -1 && add !== -1, 'оба эндпоинта зовутся');
        const segUpd = fn.slice(upd, fn.indexOf('}).then', upd));
        const segAdd = fn.slice(add, fn.indexOf('}).then', add));
        [segUpd, segAdd].forEach((seg, i) => {
            ['ФИО', 'фамилия', 'имя', 'отчество', 'дата_рождения'].forEach(k => {
                assertTrue(seg.indexOf("'" + k + "'") !== -1,
                    'payload #' + (i + 1) + ': «' + k + '»');
            });
        });
    });

    test('openEmpEditForm: префилл из ЧАСТЕЙ; легаси — раскладка ФИО по словам', () => {
        const fn = methodText(INDEX_SRC, 'openEmpEditForm');
        assertTrue(fn.indexOf("emp['фамилия']") !== -1 &&
                   fn.indexOf("emp['имя']") !== -1 &&
                   fn.indexOf("emp['отчество']") !== -1,
            'префилл читает части записи');
        assertTrue(fn.indexOf("emp['дата_рождения']") !== -1,
            'префилл даты рождения');
        assertTrue(fn.indexOf('fioWords') !== -1,
            'легаси-фолбэк: раскладка краткого ФИО по словам');
        assertTrue(fn.indexOf("getElementById('wsEmpBirth').value") !== -1,
            'поле даты рождения заполняется');
    });

    test('openEmployeeForm: сброс ТРЁХ полей и даты рождения', () => {
        const fn = methodText(INDEX_SRC, 'openEmployeeForm');
        ['wsEmpFam', 'wsEmpName', 'wsEmpPatr', 'wsEmpBirth'].forEach(id => {
            assertTrue(fn.indexOf("getElementById('" + id + "').value = ''") !== -1,
                'сброс ' + id);
        });
    });
});

// ============================================================
// 2. SRC — карта работника + архив
// ============================================================
describe('Task 489 — SRC: карта работника и архив', () => {

    test('карта: шапка профиля — ПОЛНОЕ ФИО (ФИО_полное || ФИО)', () => {
        const fn = methodText(INDEX_SRC, '_renderWorkerCard');
        assertTrue(fn.indexOf("var empFioFull = String(emp['ФИО_полное'] || '').trim() ||") !== -1,
            'полное ФИО берётся с легаси-фолбэком');
        assertTrue(fn.indexOf('this._esc(empFioFull)') !== -1,
            'шапка (обе формы: страница/попап) печатает ПОЛНОЕ ФИО');
    });

    test('карта: «Дата рождения» — ПОСЛЕ «Комментария» в списке профиля', () => {
        const fn = methodText(INDEX_SRC, '_renderWorkerCard');
        const iCom = fn.indexOf("['Комментарий',");
        const iBirth = fn.indexOf("['Дата рождения',");
        assertTrue(iBirth !== -1, 'строка «Дата рождения» есть');
        assertTrue(iCom !== -1 && iBirth > iCom,
            '«Дата рождения» — В КОНЦЕ списка (после «Комментария»)');
        assertTrue(fn.indexOf("emp['дата_рождения']\n                    ? this._fmtDateRu(emp['дата_рождения'])") !== -1,
            'дата рождения форматируется дд.мм.гггг');
    });

    test('архив: лист «Работники» — ПОЛНОЕ ФИО', () => {
        const fn = methodText(INDEX_SRC, '_workersArchiveData');
        assertTrue(fn.indexOf("String(emp['ФИО_полное'] || '').trim() ||") !== -1,
            'колонка ФИО листа «Работники» — полное имя с фолбэком');
    });

    test('«в других местах — сокращённо»: сетка и сводка — краткое ФИО', () => {
        // шахматка: строка сотрудника — emp['ФИО'] (как прежде)
        const grid = methodText(INDEX_SRC, '_renderGrid');
        assertTrue(grid.indexOf("emp['ФИО']") !== -1,
            'сетка шахматки — прежнее краткое поле');
        const gen = methodText(INDEX_SRC, '_renderWorkersGeneral');
        assertTrue(gen.indexOf("emp['ФИО']") !== -1,
            'сводка «Общая» — прежнее краткое поле');
    });
});

// ============================================================
// 3. SRC — сервер WorkSchedule.gs
// ============================================================
describe('Task 489 — SRC: WorkSchedule.gs (карта столбцов)', () => {

    test('_employeesColMap: заголовки с нормализацией + две раскладки', () => {
        const fn = methodText(WS_GS_SRC, '_employeesColMap');
        assertTrue(fn.indexOf('фамилия') !== -1 && fn.indexOf('отчество') !== -1,
            'ищет заголовки частей');
        assertTrue(fn.indexOf("replace(/[\\s_]+/g, ' ')") !== -1,
            'нормализация: пробелы/подчёркивания схлопнуты');
        assertTrue(fn.indexOf('toLowerCase') !== -1,
            'нормализация: нижний регистр');
        assertTrue(fn.indexOf('map.newLayout = (famH !== null && imH !== null && otH !== null)') !== -1,
            'раскладка — по наличию ВСЕХ ТРЁХ заголовков');
        assertTrue(fn.indexOf("find(['дата рождения'])") !== -1,
            'ищет «дата_рождения» по заголовку');
        assertTrue(fn.indexOf('map.width = max + 1') !== -1,
            'ширина чтения — до самого правого столбца');
    });

    test('listEmployees: ФИО краткое + ФИО_полное + части + дата рождения', () => {
        const fn = methodText(WS_GS_SRC, 'listEmployees');
        assertTrue(fn.indexOf('var cols = this._employeesColMap(sheet);') !== -1,
            'читает по карте столбцов');
        assertTrue(fn.indexOf('fioShort = this._wsShortFio(fam, im, ot)') !== -1,
            'краткое ФИО — композиция из частей');
        assertTrue(fn.indexOf('fioFull  = this._wsFullFio(fam, im, ot)') !== -1,
            'полное ФИО — композиция из частей');
        assertTrue(fn.indexOf('ФИО_полное:') !== -1, 'поле ФИО_полное в ответе');
        assertTrue(fn.indexOf('фамилия:') !== -1 && fn.indexOf('отчество:') !== -1,
            'сырые части в ответе');
        assertTrue(fn.indexOf('дата_рождения:') !== -1, 'поле дата_рождения');
    });

    test('addEmployee/updateEmployee: части + легаси-ФИО вербатим + дата рождения', () => {
        const add = methodText(WS_GS_SRC, 'addEmployee');
        const upd = methodText(WS_GS_SRC, 'updateEmployee');
        [add, upd].forEach((fn, i) => {
            assertTrue(fn.indexOf('var cols = this._employeesColMap(sheet);') !== -1,
                '#' + (i + 1) + ' пишет по карте');
            assertTrue(fn.indexOf('partsInPayload') !== -1,
                '#' + (i + 1) + ': старый фронтенд (одно ФИО) — пишется как есть');
            assertTrue(fn.indexOf("payload.дата_рождения !== undefined") !== -1,
                '#' + (i + 1) + ': guard даты рождения (старый фронт не затирает)');
        });
        assertTrue(add.indexOf("rowVals[cols['фамилия']] = fam;") !== -1,
            'add: части в свои столбцы');
    });

    test('dismissEmployee: увольнение/архив — по карте (H/I сместились)', () => {
        const fn = methodText(WS_GS_SRC, 'dismissEmployee');
        assertTrue(fn.indexOf("cols['дата_увольнения'] + 1") !== -1 &&
                   fn.indexOf("cols['в_архиве'] + 1") !== -1,
            'setValue по карте, не жёсткие H/I');
        assertFalse(fn.indexOf('getRange(row, 8)') !== -1,
            'жёсткий индекс H удалён');
    });

    test('_ppeLookupEmployee: СИЗ-колонки — краткое ФИО по карте', () => {
        const fn = methodText(WS_GS_SRC, '_ppeLookupEmployee');
        assertTrue(fn.indexOf('_employeesColMap') !== -1,
            'читает по карте (разделение сместило B/J)');
        assertTrue(fn.indexOf('_wsShortFio') !== -1,
            '«работник» листа СИЗ — КАК ПРЕЖДЕ краткое (заявка)');
    });

    test('employeesSplitInit: разовый перенос + идемпотентность', () => {
        const fn = methodText(WS_GS_SRC, 'employeesSplitInit');
        assertTrue(fn.indexOf('insertColumnAfter(fioCol + 1)') !== -1,
            'два столбца после ФИО → B/C/D');
        assertTrue(fn.indexOf("'фамилия'") !== -1 && fn.indexOf("'имя'") !== -1,
            'заголовки частей');
        assertTrue(fn.indexOf('insertColumnBefore(comCol + 1)') !== -1,
            'дата_рождения — ПЕРЕД «комментарием»');
        assertTrue(fn.indexOf("'дата_рождения'") !== -1, 'заголовок дата_рождения');
        assertTrue(fn.indexOf('already: true') !== -1,
            'повторный запуск безопасен');
        const runner = WS_GS_SRC.indexOf('function employeesSplitInit()');
        assertTrue(runner !== -1, 'запуск-функция в редакторе Apps Script');
    });
});

// ============================================================
// 4. VM клиент — хелперы имени
// ============================================================
describe('Task 489 — VM: композиция ФИО', () => {

    const host = new Function('return ({' +
        methodText(INDEX_SRC, '_wsNameInitial') + ',' +
        methodText(INDEX_SRC, '_wsShortFio') + ',' +
        methodText(INDEX_SRC, '_wsFullFio') +
        '});')();

    test('_wsNameInitial: полные/инициалы/пустые', () => {
        assertEqual(host._wsNameInitial('Александр'), 'А.', 'полное имя → инициал');
        assertEqual(host._wsNameInitial('А.'), 'А.', 'инициал остаётся');
        assertEqual(host._wsNameInitial('а'), 'А.', 'регистр поднимается');
        assertEqual(host._wsNameInitial(''), '', 'пусто');
        assertEqual(host._wsNameInitial(null), '', 'null');
    });

    test('_wsShortFio: «Галкин Д. Н.» из полных частей', () => {
        assertEqual(host._wsShortFio('Галкин', 'Дмитрий', 'Николаевич'),
            'Галкин Д. Н.', 'полные части');
        assertEqual(host._wsShortFio('Чикризов', 'Юрий', ''),
            'Чикризов Ю.', 'без отчества');
        assertEqual(host._wsShortFio('Иванов', '', ''),
            'Иванов', 'только фамилия');
        assertEqual(host._wsShortFio('Галкин', 'Д.', 'Н.'),
            'Галкин Д. Н.', 'инициалы дают то же краткое');
    });

    test('_wsFullFio: «Галкин Дмитрий Николаевич»', () => {
        assertEqual(host._wsFullFio('Галкин', 'Дмитрий', 'Николаевич'),
            'Галкин Дмитрий Николаевич', 'полное');
        assertEqual(host._wsFullFio('Чикризов', 'Юрий', ''),
            'Чикризов Юрий', 'без отчества — без двойного пробела');
    });
});

// ============================================================
// 5. VM клиент — карточка работника
// ============================================================
describe('Task 489 — VM: карточка работника (профиль)', () => {

    function cardHost() {
        return new Function('return ({' +
            methodText(INDEX_SRC, '_renderWorkerCard') + ',' +
            '_esc: function(s) { return String(s == null ? "" : s); },' +
            '_escAttr: function(s) { return String(s == null ? "" : s); },' +
            '_fmtDateRu: function(iso) { if (!iso) return "—";' +
            '  var p = String(iso).split("-");' +
            '  return p.length === 3 ? (p[2] + "." + p[1] + "." + p[0]) : String(iso); },' +
            '_isInstrType: function(t) { return t === "инструктаж"; },' +
            '_lastExam1000Date: function() { return null; },' +
            '_vacDaysInYear: function() { return 0; },' +
            '_vacNetDaysInYear: function() { return 0; },' +
            '_trainingCodeOf: function() { return ""; },' +
            '_statusMeta: function() { return {}; },' +
            '_plural: function(n, f) { return f[2]; },' +
            '_wtabYearOf: function() { return 2026; },' +
            '_wtabYearNav: function() {},' +
            '_wtabYearRecords: function() { return { evs: [], ins: [] }; },' +
            '_renderInstrSection: function() { return ""; },' +
            '_year: 2026, _month: 10,' +
            '});')();
    }

    const EMP_FULL = {
        'таб_номер': '2741', 'ФИО': 'Хадасевич А. С.',
        'ФИО_полное': 'Хадасевич Александр Сергеевич',
        'фамилия': 'Хадасевич', 'имя': 'Александр', 'отчество': 'Сергеевич',
        'тип': 'сменный', 'смена': 1, 'шаблон_ротации': 1,
        'старт_цикла': '2026-01-01', 'дата_приёма': '2014-09-01',
        'дата_рождения': '1985-03-15',
        'должность': 'Слесарь КИПиА 5 разряда', 'группа_допуска': 'III',
        'комментарий': ''
    };
    const EMP_LEGACY = {
        'таб_номер': '0292', 'ФИО': 'Чикризов Ю.',
        'тип': 'сменный', 'смена': 3, 'шаблон_ротации': 1,
        'старт_цикла': '2026-01-02', 'дата_приёма': '2020-08-03',
        'должность': 'Слесарь КИПиА 5 разряда', 'группа_допуска': 'III',
        'комментарий': ''
    };

    test('шапка блока профиля — ПОЛНОЕ ФИО (новые данные)', () => {
        const h = cardHost();
        h._EMPLOYEES = [EMP_FULL];
        h._VACATIONS = []; h._TRAININGS = []; h._PPE = [];
        h._VAC_YEARS = {}; h._INSTR_ALL = []; h._EVENTS_ALL = [];
        const html = String(h._renderWorkerCard('2741', false, true));
        assertTrue(html.indexOf('Хадасевич Александр Сергеевич · таб. №2741') !== -1,
            'полное ФИО в шапке блоков-страницы');
        assertTrue(html.indexOf('Хадасевич А. С. · таб. №2741') === -1,
            'краткое ФИО в шапке НЕ печатается');
    });

    test('шапка попапа шахматки — тоже полное (лучшая читаемость)', () => {
        const h = cardHost();
        h._EMPLOYEES = [EMP_FULL];
        h._VACATIONS = []; h._TRAININGS = []; h._PPE = [];
        h._VAC_YEARS = {}; h._INSTR_ALL = []; h._EVENTS_ALL = [];
        const html = String(h._renderWorkerCard('2741', false, false));
        assertTrue(html.indexOf('Хадасевич Александр Сергеевич') !== -1,
            'полное ФИО в шапке попапа');
    });

    test('легаси-кэш без ФИО_полное — краткое, как прежде', () => {
        const h = cardHost();
        h._EMPLOYEES = [EMP_LEGACY];
        h._VACATIONS = []; h._TRAININGS = []; h._PPE = [];
        h._VAC_YEARS = {}; h._INSTR_ALL = []; h._EVENTS_ALL = [];
        const html = String(h._renderWorkerCard('0292', false, true));
        assertTrue(html.indexOf('Чикризов Ю. · таб. №0292') !== -1,
            'фолбэк на краткое ФИО (кэш старого сервера)');
    });

    test('«Дата рождения» — в КОНЦЕ списка профиля, дд.мм.гггг', () => {
        const h = cardHost();
        h._EMPLOYEES = [EMP_FULL];
        h._VACATIONS = []; h._TRAININGS = []; h._PPE = [];
        h._VAC_YEARS = {}; h._INSTR_ALL = []; h._EVENTS_ALL = [];
        const html = String(h._renderWorkerCard('2741', false, true));
        const iBirth = html.indexOf('Дата рождения');
        const iCom = html.indexOf('Дата приёма');
        assertTrue(iBirth !== -1, 'строка «Дата рождения» отображается');
        assertTrue(html.indexOf('15.03.1985') !== -1, 'формат дд.мм.гггг');
        assertTrue(iCom !== -1 && iBirth > iCom,
            '«Дата рождения» ПОСЛЕ «Дата приёма» (и «Комментария») — конец списка');
    });

    test('нет даты рождения — строка не показывается', () => {
        const h = cardHost();
        const noBirth = Object.assign({}, EMP_LEGACY);
        h._EMPLOYEES = [noBirth];
        h._VACATIONS = []; h._TRAININGS = []; h._PPE = [];
        h._VAC_YEARS = {}; h._INSTR_ALL = []; h._EVENTS_ALL = [];
        const html = String(h._renderWorkerCard('0292', false, true));
        assertTrue(html.indexOf('Дата рождения') === -1,
            'пустая дата не рендерится (как «Комментарий»)');
    });
});

// ============================================================
// 6. VM клиент — форма (префилл + submit)
// ============================================================
describe('Task 489 — VM: форма — префилл и submit', () => {

    function mkEl() {
        return { value: '', textContent: '', readOnly: false, hidden: false,
                 innerHTML: '', style: {}, focus: function() {},
                 classList: { add: function() {}, remove: function() {},
                             contains: function() { return false; },
                             toggle: function() {} } };
    }

    function makeClient() {
        const els = {};
        const calls = [];
        const toasts = [];
        const document = { getElementById: id => (els[id] || (els[id] = mkEl())) };
        const ctx = { document, Math, Date, String, Number, parseInt,
                      parseFloat, isNaN, isFinite, Promise,
                      setTimeout: function() { return 0; },
                      KipToast: { show: function(m) { toasts.push(String(m)); } } };
        vm.createContext(ctx);
        // хосты замыканий _api/__api (как test-task384)
        ctx.calls = calls;
        ctx.els = els;
        ctx.toasts = toasts;
        const methods = [
            'openEmployeeForm', 'closeEmployeeForm', 'openEmpEditForm',
            'submitEmployeeForm', 'onEmpTypeChange',
            '_fillPositionSelect', '_fillGroupSelect',
            // Task 530: хелперы наполнения опций — вызываются из
            // .then/.catch АСИНХРОННО; без них в моке первый же
            // await в общем прогоне (async-тесты Task 530) запускал
            // отложенный колбэк и валил процесс TypeError'ом —
            // латентный баг мока, вскрытый async-тестами
            '_fillPositionOptions', '_fillGroupOptions',
            '_esc', '_escAttr', '_isoDate', '_fmtDateRu',
            '_wsShortFio', '_wsNameInitial', '_wsFullFio',
        ];
        const src = methods.map(n => extractMethod(INDEX_SRC, n))
            .filter(Boolean).join(',\n');
        vm.runInContext(`
            var WSM = {
                _canEdit: true,
                _EMPLOYEES: [
                    { 'таб_номер': '2741', 'ФИО': 'Хадасевич А. С.',
                      'ФИО_полное': 'Хадасевич Александр Сергеевич',
                      'фамилия': 'Хадасевич', 'имя': 'Александр',
                      'отчество': 'Сергеевич',
                      'тип': 'сменный', 'смена': 1,
                      'шаблон_ротации': 1, 'старт_цикла': '2026-01-01',
                      'дата_приёма': '2014-09-01',
                      'дата_рождения': '1985-03-15',
                      'должность': 'Слесарь КИПиА',
                      'группа_допуска': 'III', 'комментарий': '' },
                    { 'таб_номер': '0292', 'ФИО': 'Чикризов Ю.',
                      'тип': 'сменный', 'смена': 3,
                      'шаблон_ротации': 1, 'старт_цикла': '2026-01-02',
                      'дата_приёма': '2020-08-03',
                      'должность': 'Слесарь КИПиА',
                      'группа_допуска': 'III', 'комментарий': '' },
                ],
                _PATTERNS: [ { id: 1, name: '2/2', cycle: 4 } ],
                _empEditTab: null,
                _api: function(action, payload) {
                    __calls.push({ action: action, payload: payload });
                    return Promise.resolve({ ok: true });
                },
                loadGrid: function() {},
                closeEmpPopup: function() {},
                ${src}
            };
            globalThis.__api = {
                WSM: WSM,
                els: function() { return els; },
                calls: function() { return __calls; },
                toasts: function() { return toasts; },
            };
        `.replace(/__calls/g, 'calls'), ctx, { filename: 'index.html-WS489' });
        return ctx.__api;
    }

    test('префилл правки: ЧАСТИ записи (новые данные)', () => {
        const api = makeClient();
        api.WSM.openEmpEditForm('2741');
        const els = api.els();
        assertEqual(els.wsEmpFam.value, 'Хадасевич', 'фамилия из части');
        assertEqual(els.wsEmpName.value, 'Александр', 'имя из части');
        assertEqual(els.wsEmpPatr.value, 'Сергеевич', 'отчество из части');
        assertEqual(els.wsEmpBirth.value, '1985-03-15', 'дата рождения');
    });

    test('префилл правки: легаси-запись — раскладка краткого ФИО', () => {
        const api = makeClient();
        api.WSM.openEmpEditForm('0292');
        const els = api.els();
        assertEqual(els.wsEmpFam.value, 'Чикризов', 'фамилия — 1-е слово');
        assertEqual(els.wsEmpName.value, 'Ю.', 'имя — инициал');
        assertEqual(els.wsEmpPatr.value, '', 'отчества нет');
        assertEqual(els.wsEmpBirth.value, '', 'даты рождения нет');
    });

    test('submit (правка): части + краткое ФИО + дата рождения в payload', async () => {
        const api = makeClient();
        api.WSM.openEmpEditForm('2741');
        const els = api.els();
        els.wsEmpFam.value = 'Хадасевич';
        els.wsEmpName.value = 'Александр';
        els.wsEmpPatr.value = 'Сергеевич';
        els.wsEmpBirth.value = '1985-03-15';
        els.wsEmpStart.value = '2026-01-01';
        api.WSM.submitEmployeeForm();
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        const upd = api.calls().filter(c => c.action === 'workSchedule.updateEmployee');
        assertEqual(upd.length, 1, 'ровно один вызов updateEmployee');
        assertEqual(upd[0].payload['ФИО'], 'Хадасевич А. С.',
            'легаси-поле ФИО — КРАТКАЯ композиция');
        assertEqual(upd[0].payload['фамилия'], 'Хадасевич', 'фамилия');
        assertEqual(upd[0].payload['имя'], 'Александр', 'имя');
        assertEqual(upd[0].payload['отчество'], 'Сергеевич', 'отчество');
        assertEqual(upd[0].payload['дата_рождения'], '1985-03-15', 'дата рождения');
    });

    test('валидация: без фамилии — тост, сервер НЕ зовётся', async () => {
        const api = makeClient();
        // открываем форму создания — все элементы создаются
        api.WSM.openEmployeeForm();
        const els = api.els();
        els.wsEmpTabNo.value = '9999';
        els.wsEmpFam.value = '';
        els.wsEmpStart.value = '2026-01-01';
        api.WSM.submitEmployeeForm();
        await Promise.resolve(); await Promise.resolve();
        // открытие формы зовёт справочники (должности/группы) — их не
        // считаем; саботаж — add/updateEmployee
        const mutations = api.calls().filter(function(c) {
            return c.action === 'workSchedule.addEmployee' ||
                   c.action === 'workSchedule.updateEmployee';
        });
        assertEqual(mutations.length, 0, 'add/updateEmployee НЕ зовутся');
        assertTrue(api.toasts().indexOf('Введите фамилию') !== -1,
            'тост «Введите фамилию»');
    });

    test('сброс формы создания — все новые поля пусты', () => {
        const api = makeClient();
        api.WSM.openEmpEditForm('2741');
        api.WSM.openEmployeeForm();
        const els = api.els();
        assertEqual(els.wsEmpFam.value, '', 'фамилия сброшена');
        assertEqual(els.wsEmpName.value, '', 'имя сброшено');
        assertEqual(els.wsEmpPatr.value, '', 'отчество сброшено');
        assertEqual(els.wsEmpBirth.value, '', 'дата рождения сброшена');
    });
});

// ============================================================
// 7. VM клиент — лист «Работники» Excel-архива
// ============================================================
describe('Task 489 — VM: архив Excel — лист «Работники»', () => {

    function dataHost() {
        return new Function('return ({' +
            methodText(INDEX_SRC, '_workersArchiveData') + ',' +
            '_isInstrType: function(t) { return t === "инструктаж"; },' +
            '_isoDate: function(d) { return d.toISOString().slice(0, 10); },' +
            '_EMPLOYEES: [' +
            '  { "таб_номер": "2741", "ФИО": "Хадасевич А. С.",' +
            '    "ФИО_полное": "Хадасевич Александр Сергеевич",' +
            '    "тип": "сменный", "смена": 1,' +
            '    "должность": "Слесарь КИПиА", "группа_допуска": "III",' +
            '    "дата_приёма": "2014-09-01" },' +
            '  { "таб_номер": "0292", "ФИО": "Чикризов Ю.",' +
            '    "тип": "сменный", "смена": 3,' +
            '    "должность": "Слесарь КИПиА", "группа_допуска": "III",' +
            '    "дата_приёма": "2020-08-03" }' +
            '],' +
            '_INSTR_ALL: [], _EVENTS_ALL: [], _TRAININGS: [],' +
            '_VAC_YEARS: {}, _VACATIONS: [], _vacYear: 2026,' +
            '});')();
    }

    test('колонка ФИО листа «Работники» — ПОЛНОЕ имя (легаси — краткое)', () => {
        const d = dataHost()._workersArchiveData();
        const emp = d.employees;
        assertEqual(emp[0][0], 'Таб. №', 'шапка: Таб. №');
        assertEqual(emp[0][1], 'ФИО', 'шапка: колонка ФИО жива');
        assertEqual(emp[1][1], 'Хадасевич Александр Сергеевич',
            'новые данные — ПОЛНОЕ имя');
        assertEqual(emp[2][1], 'Чикризов Ю.',
            'легаси-запись без ФИО_полное — как прежде краткое');
    });

    test('лист «Отпуска» — по-прежнему КРАТКОЕ ФИО', () => {
        const h = dataHost();
        h._VAC_YEARS = { 2026: [
            { id: 1, 'таб_номер': '2741', 'часть': 1,
              'дата_начала': '2026-06-01', 'дата_окончания': '2026-06-10',
              'дней': 10, 'комментарий': '' }
        ] };
        const d = h._workersArchiveData();
        assertEqual(d.vacations[1][0], 'Хадасевич А. С.',
            '«в других местах как и прежде сокращённо» (заявка)');
    });
});

// ============================================================
// 8. VM сервер — карта столбцов и listEmployees
// ============================================================
describe('Task 489 — VM: сервер — карта + чтение', () => {

    // мок листа: data[0] — заголовки; поддерживает чтение/запись/вставки
    function mkSheet(data) {
        const writes = [];
        const inserts = [];
        const sh = {
            _data: data, _writes: writes, _inserts: inserts,
            getLastRow: function() { return data.length; },
            getLastColumn: function() { return data[0].length; },
            getRange: function(r, c, nr, nc) {
                nr = nr || 1; nc = nc || 1;
                const self = this;
                const out = [];
                for (let i = 0; i < nr; i++) {
                    const row = [];
                    for (let j = 0; j < nc; j++) {
                        row.push((data[r - 1 + i] || [])[c - 1 + j] || '');
                    }
                    out.push(row);
                }
                return {
                    getValues: function() { return out; },
                    setNumberFormat: function() {},
                    setValue: function(v) {
                        writes.push({ r: r, c: c, v: v });
                        if (!data[r - 1]) data[r - 1] = [];
                        data[r - 1][c - 1] = v;
                    },
                    setValues: function(vals) {
                        writes.push({ r: r, c: c, vals: vals });
                        for (let i = 0; i < vals.length; i++) {
                            if (!data[r - 1 + i]) data[r - 1 + i] = [];
                            for (let j = 0; j < vals[i].length; j++) {
                                data[r - 1 + i][c - 1 + j] = vals[i][j];
                            }
                        }
                    }
                };
            },
            insertColumnAfter: function(col) {
                inserts.push(['after', col]);
                for (let i = 0; i < data.length; i++) {
                    data[i].splice(col, 0, '');
                }
            },
            insertColumnBefore: function(col) {
                inserts.push(['before', col]);
                for (let i = 0; i < data.length; i++) {
                    data[i].splice(col - 1, 0, '');
                }
            }
        };
        return sh;
    }

    function gsHost(sheet) {
        return new Function('sheet', 'return ({' +
            methodText(WS_GS_SRC, '_employeesColMap') + ',' +
            methodText(WS_GS_SRC, '_accessGroupColIndex') + ',' +
            methodText(WS_GS_SRC, '_headerColIndex') + ',' +
            methodText(WS_GS_SRC, '_wsNameInitial') + ',' +
            methodText(WS_GS_SRC, '_wsShortFio') + ',' +
            methodText(WS_GS_SRC, '_wsFullFio') + ',' +
            methodText(WS_GS_SRC, 'listEmployees') + ',' +
            methodText(WS_GS_SRC, 'updateEmployee') + ',' +
            methodText(WS_GS_SRC, 'addEmployee') + ',' +
            methodText(WS_GS_SRC, 'dismissEmployee') + ',' +
            methodText(WS_GS_SRC, 'employeesSplitInit') + ',' +
            methodText(WS_GS_SRC, '_parseIsoDate') + ',' +
            methodText(WS_GS_SRC, '_toIsoDate') + ',' +
            methodText(WS_GS_SRC, '_appendRowKeepText') + ',' +
            methodText(WS_GS_SRC, '_ppeLookupEmployee') + ',' +
            'EMPLOYEES_SHEET: "Сотрудники",' +
            '_requireRead: function() { return { user: { email: "t" } }; },' +
            '_requireWrite: function() { return { user: { email: "t" } }; },' +
            '_getSheet: function() { return sheet; },' +
            '});')(sheet);
    }

    // глубокая копия фикстуры (Date-объекты сохраняются):
    // .slice() БЫ мелкий — мутации одного теста протекали бы в другие
    function deepRows(rows) {
        return rows.map(function(r) {
            return r.map(function(v) {
                return (v instanceof Date) ? new Date(v.getTime()) : v;
            });
        });
    }

    const NEW_LAYOUT = [
        ['таб_№', 'фамилия', 'имя', 'отчество', 'тип', 'смена',
         'шаблон_ротации', 'старт_цикла', 'дата_приёма',
         'дата_увольнения', 'в_архиве', 'должность', 'группа_допуска',
         'дата_рождения', 'комментарий'],
        ['2741', 'Хадасевич', 'Александр', 'Сергеевич', 'сменный', 1, 1,
         new Date(2025, 0, 1), new Date(2014, 8, 1), '', 0,
         'Слесарь КИПиА 5 разряда', 'III', new Date(1985, 2, 15), ''],
        ['0292', 'Чикризов', 'Юрий', '', 'сменный', 3, 1,
         new Date(2025, 0, 2), new Date(2020, 7, 3), '', 0,
         'Слесарь КИПиА 5 разряда', 'III', '', ''],
    ];

    const LEGACY = [
        ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон_ротации', 'старт_цикла',
         'дата_приёма', 'дата_увольнения', 'в_архиве', 'должность',
         'группа_допуска', 'комментарий'],
        ['2741', 'Хадасевич А. С.', 'сменный', 1, 1,
         new Date(2025, 0, 1), new Date(2014, 8, 1), '', 0,
         'Слесарь КИПиА 5 разряда', 'III', ''],
    ];

    test('_employeesColMap: НОВАЯ раскладка — все столбцы по местам', () => {
        const m = gsHost(mkSheet(deepRows(NEW_LAYOUT)))._employeesColMap(
            mkSheet(deepRows(NEW_LAYOUT)));
        assertTrue(m.newLayout, 'newLayout = true');
        assertEqual(m['фамилия'], 1, 'фамилия B');
        assertEqual(m['имя'], 2, 'имя C');
        assertEqual(m['отчество'], 3, 'отчество D');
        assertEqual(m['тип'], 4, 'тип E');
        assertEqual(m['дата_увольнения'], 9, 'дата_увольнения J');
        assertEqual(m['в_архиве'], 10, 'в_архиве K');
        assertEqual(m['должность'], 11, 'должность L');
        assertEqual(m['дата_рождения'], 13, 'дата_рождения N');
        assertEqual(m['комментарий'], 14, 'комментарий O');
        assertEqual(m.width, 15, 'ширина до последнего столбца');
    });

    test('_employeesColMap: ЛЕГАСИ — прежние индексы', () => {
        const m = gsHost(mkSheet(deepRows(LEGACY)))._employeesColMap(
            mkSheet(deepRows(LEGACY)));
        assertFalse(m.newLayout, 'newLayout = false');
        assertEqual(m['фио'], 1, 'ФИО B');
        assertEqual(m['тип'], 2, 'тип C');
        assertEqual(m['в_архиве'], 8, 'в_архиве I');
        assertEqual(m['должность'], 9, 'должность J');
        // фикстура — копия файла пользователя: группа_допуска в K,
        // комментарий сместился в L (урок Task 403)
        assertEqual(m['группа_допуска'], 10, 'группа K');
        assertEqual(m['комментарий'], 11, 'комментарий L (по заголовку)');
        assertEqual(m['дата_рождения'], null, 'дата_рождения нет');
    });

    test('listEmployees (НОВАЯ): краткое/полное/части/дата рождения', () => {
        const h = gsHost(mkSheet(deepRows(NEW_LAYOUT)));
        const res = h.listEmployees({ token: 't' });
        assertEqual(res.ok, true, 'успех');
        const e1 = res.data.employees[0];
        assertEqual(e1['ФИО'], 'Хадасевич А. С.', 'ФИО — КРАТКОЕ (как прежде)');
        assertEqual(e1['ФИО_полное'], 'Хадасевич Александр Сергеевич',
            'ФИО_полное — ПОЛНОЕ');
        assertEqual(e1['фамилия'], 'Хадасевич', 'часть фамилия');
        assertEqual(e1['имя'], 'Александр', 'часть имя');
        assertEqual(e1['отчество'], 'Сергеевич', 'часть отчество');
        assertEqual(e1['дата_рождения'], '1985-03-15', 'дата рождения ISO');
        assertEqual(e1['должность'], 'Слесарь КИПиА 5 разряда', 'должность по заголовку');
        assertEqual(e1['группа_допуска'], 'III', 'группа по заголовку');
        const e2 = res.data.employees[1];
        assertEqual(e2['ФИО'], 'Чикризов Ю.', 'без отчества — короче');
        assertEqual(e2['дата_рождения'], null, 'нет даты — null');
    });

    test('listEmployees (ЛЕГАСИ): обратная совместимость', () => {
        const h = gsHost(mkSheet(deepRows(LEGACY)));
        const res = h.listEmployees({ token: 't' });
        const e1 = res.data.employees[0];
        assertEqual(e1['ФИО'], 'Хадасевич А. С.', 'ФИО как было');
        assertEqual(e1['ФИО_полное'], 'Хадасевич А. С.',
            'без частей полное = краткое (фолбэк)');
        assertEqual(e1['фамилия'], '', 'частей нет');
        assertEqual(e1['дата_рождения'], null, 'даты рождения нет');
    });

    test('updateEmployee (НОВАЯ): части в B/C/D, тип..по заголовкам, дата рождения', () => {
        const sheet = mkSheet(deepRows(NEW_LAYOUT));
        const h = gsHost(sheet);
        const res = h.updateEmployee({
            token: 't', 'таб_номер': '2741',
            'фамилия': 'Хадасевич', 'имя': 'Александр',
            'отчество': 'Сергеевич', 'дата_рождения': '1985-03-15',
            'тип': 'сменный', 'смена': 2, 'шаблон_ротации': 1,
            'старт_цикла': '2026-03-01', 'дата_приёма': '2014-09-01',
            'должность': 'Старший слесарь', 'комментарий': 'правка'
        });
        assertEqual(res.ok, true, 'успех');
        const row = sheet._data[1];
        assertEqual(row[1], 'Хадасевич', 'B: фамилия');
        assertEqual(row[2], 'Александр', 'C: имя');
        assertEqual(row[3], 'Сергеевич', 'D: отчество');
        assertEqual(row[4], 'сменный', 'E: тип');
        assertEqual(row[5], 2, 'F: смена');
        assertEqual(row[11], 'Старший слесарь', 'L: должность');
        assertEqual(row[13] instanceof Date ? '1985-03-15' : row[13],
            '1985-03-15', 'N: дата рождения');
        assertEqual(row[14], 'правка', 'O: комментарий');
        assertEqual(row[10], 0, 'K: в_архиве НЕ тронут');
    });

    test('updateEmployee (ЛЕГАСИ): старый фронтенд — ФИО вербатим в B', () => {
        const sheet = mkSheet(deepRows(LEGACY));
        const h = gsHost(sheet);
        h.updateEmployee({
            token: 't', 'таб_номер': '2741',
            'ФИО': 'Иванов И. И. (ст.)', 'тип': 'сменный',
            'старт_цикла': '2026-03-01', 'дата_приёма': '2014-09-01',
            'должность': 'Слесарь', 'комментарий': ''
        });
        assertEqual(sheet._data[1][1], 'Иванов И. И. (ст.)',
            'легаси-запись: поле ФИО пишется КАК ЕСТЬ (поведение сохранено)');
    });

    test('addEmployee (НОВАЯ): строка с частями и датой рождения', () => {
        const sheet = mkSheet(deepRows(NEW_LAYOUT));
        const h = gsHost(sheet);
        const res = h.addEmployee({
            token: 't', 'таб_номер': '5464',
            'фамилия': 'Сачкин', 'имя': 'Евгений', 'отчество': 'Евгеньевич',
            'дата_рождения': '1990-07-20',
            'тип': 'сменный', 'смена': 2, 'шаблон_ротации': 1,
            'старт_цикла': '2026-01-03', 'дата_приёма': '2020-12-01',
            'должность': 'Слесарь КИПиА', 'группа_допуска': 'III',
            'комментарий': ''
        });
        assertEqual(res.ok, true, 'успех');
        const row = sheet._data[3];
        assertEqual(row[0], '5464', 'A: таб');
        assertEqual(row[1], 'Сачкин', 'B: фамилия');
        assertEqual(row[2], 'Евгений', 'C: имя');
        assertEqual(row[3], 'Евгеньевич', 'D: отчество');
        assertEqual(row[13] instanceof Date ? '1990-07-20' : row[13],
            '1990-07-20', 'N: дата рождения');
        assertEqual(row[10], 0, 'K: в_архиве 0');
    });

    test('dismissEmployee (НОВАЯ): J/K, НЕ H/I', () => {
        const sheet = mkSheet(deepRows(NEW_LAYOUT));
        const h = gsHost(sheet);
        const res = h.dismissEmployee({
            token: 't', 'таб_номер': '2741',
            'дата_увольнения': '2026-10-01'
        });
        assertEqual(res.ok, true, 'успех');
        const solo = sheet._writes.filter(function(w) {
            return w.vals === undefined;
        });
        assertTrue(solo.some(function(w) { return w.c === 10; }),
            'J (дата_увольнения в новой раскладке) — setValue');
        assertTrue(solo.some(function(w) { return w.c === 11; }),
            'K (в_архиве в новой раскладке) — setValue');
        assertFalse(solo.some(function(w) { return w.c === 8 || w.c === 9; }),
            'жёсткие прежние H/I больше не пишутся');
        const row = sheet._data[1];
        assertEqual(row[10], 1, 'K: в_архиве = 1');
    });

    test('_ppeLookupEmployee (НОВАЯ): краткое ФИО + должность по карте', () => {
        const sheet = mkSheet(deepRows(NEW_LAYOUT));
        const h = gsHost(sheet);
        const e = h._ppeLookupEmployee(sheet, '2741');
        assertEqual(e.fio, 'Хадасевич А. С.',
            'колонка C листа «СИЗ» — КАК ПРЕЖДЕ краткое (заявка)');
        assertEqual(e.position, 'Слесарь КИПиА 5 разряда', 'должность из L');
    });

    test('employeesSplitInit: разделение + дата_рождения перед комментарием', () => {
        const sheet = mkSheet(deepRows(LEGACY));
        const ss = {
            getSheetByName: function() { return sheet; }
        };
        const ctx = { SpreadsheetApp: { openById: function() { return ss; } },
                      Utils: { audit: function() {} } };
        const hostSrc = 'return ({' +
            methodText(WS_GS_SRC, '_employeesColMap') + ',' +
            methodText(WS_GS_SRC, '_accessGroupColIndex') + ',' +
            methodText(WS_GS_SRC, '_headerColIndex') + ',' +
            methodText(WS_GS_SRC, '_wsNameInitial') + ',' +
            methodText(WS_GS_SRC, '_wsShortFio') + ',' +
            methodText(WS_GS_SRC, '_wsFullFio') + ',' +
            methodText(WS_GS_SRC, 'employeesSplitInit') + ',' +
            'EMPLOYEES_SHEET: "Сотрудники", SPREADSHEET_ID: "x"' +
            '});';
        const host = new Function('SpreadsheetApp', 'Utils', hostSrc)(
            ctx.SpreadsheetApp, ctx.Utils);
        const r = host.employeesSplitInit();
        assertEqual(r.ok, true, 'успех');
        assertEqual(r.already, false, 'первый запуск — изменения сделаны');
        assertTrue(r.newLayout, 'раскладка стала НОВОЙ');
        const head = sheet._data[0];
        assertEqual(head[1], 'фамилия', 'B: заголовок фамилия');
        assertEqual(head[2], 'имя', 'C: заголовок имя');
        assertEqual(head[3], 'отчество', 'D: заголовок отчество');
        // «дата_рождения» — ПЕРЕД «комментарием»
        const iBirth = head.indexOf('дата_рождения');
        const iCom = head.indexOf('комментарий');
        assertTrue(iBirth !== -1 && iCom !== -1 && iCom === iBirth + 1,
            'дата_рождения непосредственно ПЕРЕД комментарием');
        const row = sheet._data[1];
        assertEqual(row[1], 'Хадасевич', 'фамилия из ФИО');
        assertEqual(row[2], 'А.', 'имя (инициал до заполнения)');
        assertEqual(row[3], 'С.', 'отчество (инициал)');
        // значения сместились корректно
        assertEqual(row[4], 'сменный', 'тип на новом месте E');
    });

    test('employeesSplitInit: повторный запуск — идемпотентен', () => {
        const sheet = mkSheet(deepRows(LEGACY));
        const ss = { getSheetByName: function() { return sheet; } };
        const hostSrc = 'return ({' +
            methodText(WS_GS_SRC, '_employeesColMap') + ',' +
            methodText(WS_GS_SRC, '_accessGroupColIndex') + ',' +
            methodText(WS_GS_SRC, '_headerColIndex') + ',' +
            methodText(WS_GS_SRC, '_wsNameInitial') + ',' +
            methodText(WS_GS_SRC, '_wsShortFio') + ',' +
            methodText(WS_GS_SRC, '_wsFullFio') + ',' +
            methodText(WS_GS_SRC, 'employeesSplitInit') + ',' +
            'EMPLOYEES_SHEET: "Сотрудники", SPREADSHEET_ID: "x"' +
            '});';
        const host = new Function('SpreadsheetApp', 'Utils', hostSrc)(
            { openById: function() { return ss; } }, { audit: function() {} });
        host.employeesSplitInit();
        const insertsBefore = sheet._inserts.length;
        const r2 = host.employeesSplitInit();
        assertEqual(r2.already, true, 'повтор — уже сделано');
        assertEqual(sheet._inserts.length, insertsBefore,
            'вставок больше НЕТ (данные не тронуты)');
    });
});

// ============================================================
// 9. Service Worker
// ============================================================
describe('Task 489 — Service Worker', () => {

    test('SW: кэш поднят до kipia-test-v747', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v747'") !== -1,
            'CACHE_VERSION = kipia-test-v747 (Task 489)');
        assertFalse(SW_SRC.indexOf('kipia-test-v712') !== -1,
            'прошлая версия не осталась');
    });

    test('SW: комментарий Task 489 отражает заявку', () => {
        const i = SW_SRC.indexOf('Task 489:');
        assertTrue(i !== -1, 'комментарий Task 489 есть');
        const seg = SW_SRC.slice(i, i + 700);
        assertTrue(seg.indexOf('фамилия') !== -1 &&
                   seg.indexOf('дата_рождения') !== -1,
            'суть: разделение ФИО + дата рождения');
        assertTrue(seg.indexOf('employeesSplitInit') !== -1,
            'упомянут разовый перенос');
    });
});
