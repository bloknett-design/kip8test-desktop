// ============================================================
// Task 443 — заявка: «Необходимо в картах работников проработать
// блок с таблицей СИЗ. В файле табель_КИП_ИОС, в таблице СИЗ нужно
// создать новый столбец "дата_изготовления" справа от столбца
// "дата_выдачи", в котором пользователь будет указывать дату
// изготовления СИЗ, если в этом есть необходимость. И логика
// расчёта даты окончания, в столбце "дата_окончания", должна быть
// следующей, если пользователь указывает дату выдачи, а дату
// изготовления не указывает, то дата окончания будет считаться как
// сумма даты выдачи и срока годности (как это реализовано сейчас),
// но если пользователь указал дату изготовления, то эта дата
// становится в приоритете и дата окончания считается как сумма
// даты изготовления и срока годности, дата выдачи в данном случае
// будет носить только информационный характер. Это необходимо
// сделать по причине что у некоторых СИЗ срок окончания исчисляет-
// ся с даты выдачи, а у некоторых с даты производства, например на
// фильтрующих коробках противогазов указывают дату изготовления и
// дату окончания пользования ей. И учти, что при добавлении нового
// столбца, столбцы следующие за ним сместятся и поменяют свои
// места расположения, чтобы в скрипте потом не было багов.»
//
// Реализация: лист «СИЗ» — A id, B таб_номер, C работник, D
// должность, E наименование, F дата_выдачи, G дата_изготовления
// (НОВОЕ), H срок_годности, I дата_окончания, J примечание
// (сдвиг G→H→I→J учтён во ВСЕХ скриптах); миграция
// ppeMigrateManufacture() в PPEInit.gs; listPpe читает ОБЕ
// структуры (по шапке); addPpe/updatePpe требуют новую структуру
// (guard ppe_not_migrated); приоритет даты изготовления в
// _ppeExpiry(base, term); поле «Дата изготовления» в шторке;
// «изгот. …» в карточке работника.
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertTrue, assertFalse, assertEqual, assertThrows } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts/WorkSchedule.gs'), 'utf8');
const PPE_INIT_SRC = fs.readFileSync(path.join(ROOT, 'scripts/PPEInit.gs'), 'utf8');

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

// PPEInit.gs — function-декларации (не объектные методы)
function extractFunction(src, name) {
    const start = src.indexOf('function ' + name + '(');
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

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

function mkEl() {
    return {
        style: {}, attrs: {}, hidden: false, innerHTML: '',
        value: '', textContent: '',
        classList: { add: function() {}, remove: function() {},
                     contains: function() { return false; },
                     toggle: function() {} },
        setAttribute: function(k, v) { this.attrs[k] = v; },
        getBoundingClientRect: function() { return { width: 0, height: 0,
                                                     left: 0, right: 0,
                                                     top: 0, bottom: 0 }; },
        querySelector: function() { return null; },
        querySelectorAll: function() { return []; },
        addEventListener: function() {},
        focus: function() {},
        appendChild: function() {},
    };
}

// ============================================================
// 1. SRC — index.html: шторка СИЗ (поле «Дата изготовления»)
// ============================================================
describe('Task 443 — SRC: шторка СИЗ — поле «Дата изготовления»', () => {

    test('поле «Дата изготовления» (id=wsPpeManufactured, date, пересчёт подсказки)', () => {
        const i = INDEX_SRC.indexOf('id="wsPpeManufactured"');
        assertTrue(i !== -1, 'поле есть');
        const lbl = INDEX_SRC.indexOf('for="wsPpeManufactured">Дата изготовления</label>');
        assertTrue(lbl !== -1, 'подпись «Дата изготовления»');
        // атрибут type стоит РАНЬШЕ id — окно захватывает весь тег
        const seg = INDEX_SRC.slice(Math.max(0, i - 200), i + 400);
        assertTrue(seg.indexOf('type="date"') !== -1, 'тип date');
        assertTrue(seg.indexOf('WorkSchedule.onPpeFormInput()') !== -1,
            'изменение поля пересчитывает подсказку авто-даты');
    });

    test('поле стоит МЕЖДУ «Дата выдачи» и «Срок годности»', () => {
        const iIssued = INDEX_SRC.indexOf('id="wsPpeIssued"');
        const iMfg = INDEX_SRC.indexOf('id="wsPpeManufactured"');
        const iTerm = INDEX_SRC.indexOf('id="wsPpeTerm"');
        assertTrue(iIssued !== -1 && iMfg !== -1 && iTerm !== -1, 'все три поля живы');
        assertTrue(iIssued < iMfg && iMfg < iTerm,
            'порядок: выдача → изготовление → срок (как в листе F → G → H)');
    });

    test('комментарий: поле НЕОБЯЗАТЕЛЬНОЕ, приоритет расчёта', () => {
        const i = INDEX_SRC.indexOf('id="wsPpeManufactured"');
        const before = INDEX_SRC.slice(Math.max(0, i - 600), i);
        assertTrue(before.indexOf('НЕОБЯЗАТЕЛЬНО') !== -1,
            'комментарий о необязательности рядом с полем');
        assertTrue(before.indexOf('изготовление + срок') !== -1,
            'формула: изготовление + срок');
        assertTrue(before.indexOf('информация') !== -1,
            'дата выдачи — только информация');
    });

    test('подсказка шторки: приоритет даты изготовления + Приказ 767н жив', () => {
        const i = INDEX_SRC.indexOf('id="wsPpeExpiryInfo"');
        assertTrue(i !== -1, 'строка авто-даты жива');
        const hint = INDEX_SRC.indexOf('ws-vac-form-hint', i);
        const seg = INDEX_SRC.slice(hint, hint + 700);
        assertTrue(seg.indexOf('от неё') !== -1 &&
                   seg.indexOf('только информация') !== -1,
            'формулировка приоритета изготовления');
        assertTrue(seg.indexOf('N767н') !== -1, 'Приказ Минтруда 767н сохранён');
    });

    test('мобильная раскладка: ряд дат СИЗ — столбик на ≤480px', () => {
        // Task 443: три поля (выдача/изготовление/срок) не помещаются
        // в ряд на 375px — select срока вылезал за край экрана
        const row = INDEX_SRC.indexOf('class="flow-input-row ws-ppe-dates-row"');
        assertTrue(row !== -1, 'ряд дат помечен классом ws-ppe-dates-row');
        const iIssued = INDEX_SRC.indexOf('id="wsPpeIssued"');
        assertTrue(row < iIssued, 'класс — у ряда с датой выдачи');
        const mq = INDEX_SRC.indexOf(
            '@media (max-width: 480px) {\n' +
            '        .flow-input-row.ws-ppe-dates-row { flex-direction: column; }');
        assertTrue(mq !== -1, 'media-запрос: столбик на узких экранах');
    });
});

// ============================================================
// 2. SRC — index.html: логика клиента (форма + карточка)
// ============================================================
describe('Task 443 — SRC: логика клиента', () => {

    test('openPpeForm: префилл даты изготовления в правке, сброс при создании', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'openPpeForm'));
        assertTrue(fn.indexOf("getElementById('wsPpeManufactured').value =") !== -1,
            'поле заполняется/сбрасывается');
        assertTrue(fn.indexOf('editPpe.дата_изготовления') !== -1,
            'в правке — из записи (дата изготовления)');
    });

    test('onPpeFormInput: base = manufactured || issued (приоритет)', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'onPpeFormInput'));
        assertTrue(fn.indexOf("getElementById('wsPpeManufactured')") !== -1,
            'читает поле даты изготовления');
        assertTrue(fn.indexOf('var base = manufactured || issued;') !== -1,
            'приоритет даты изготовления');
        assertTrue(fn.indexOf('this._ppeExpiry(base, term)') !== -1,
            'расчёт от базовой даты');
        assertTrue(fn.indexOf('от даты изготовления — заполнится автоматически') !== -1,
            'пометка «от даты изготовления» в подсказке');
        assertTrue(fn.indexOf('(issued || manufactured) && term') !== -1,
            'ветка «срок не распознан» учитывает дату изготовления');
    });

    test('submitPpeForm: payload несёт дату_изготовления', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'submitPpeForm'));
        assertTrue(fn.indexOf("getElementById('wsPpeManufactured').value") !== -1,
            'значение поля читается');
        assertTrue(fn.indexOf('дата_изготовления: manufactured || \'\'') !== -1,
            'поле уходит в payload addPpe/updatePpe');
    });

    test('клиентский _ppeExpiry: параметр isoBase (базовая дата)', () => {
        const fn = methodText(INDEX_SRC, '_ppeExpiry');
        assertTrue(fn.indexOf('_ppeExpiry: function(isoBase, term)') !== -1,
            'сигнатура — базовая дата');
        assertTrue(fn.indexOf('_parseIsoLocal(String(isoBase') !== -1,
            'парсинг базовой даты');
        // комментарий о приоритете — над методом (methodText его не
        // захватывает): ищем в исходнике рядом с сигнатурой
        const near = INDEX_SRC.slice(Math.max(0, INDEX_SRC.indexOf('_ppeExpiry: function(isoBase') - 700),
            INDEX_SRC.indexOf('_ppeExpiry: function(isoBase'));
        assertTrue(near.indexOf('ИЗГОТОВЛЕНИЯ (ПРИОРИТЕТ') !== -1,
            'комментарий о приоритете изготовления над методом');
    });

    test('карточка: «изгот.» в мета-строке под условием наличия', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf('if (pz.дата_изготовления)') !== -1,
            'условие — только при указанной дате изготовления');
        assertTrue(fn.indexOf("'изгот. ' + this._fmtDateRu(pz.дата_изготовления)") !== -1,
            'строка «изгот. ДД.ММ.ГГГГ»');
        const iIssued = fn.indexOf("'выдано ' + this._fmtDateRu(pz.дата_выдачи)");
        const iMfg = fn.indexOf("'изгот. '");
        assertTrue(iIssued !== -1 && iMfg !== -1 && iIssued < iMfg,
            'изготовление — сразу после даты выдачи');
    });
});

// ============================================================
// 3. SRC — WorkSchedule.gs: структура листа + приоритет + guard
// ============================================================
describe('Task 443 — SRC: WorkSchedule.gs — структура и приоритет', () => {

    test('структура листа «СИЗ»: G дата_изготовления, H срок, I окончание, J примечание', () => {
        const i = WS_GS_SRC.indexOf('Структура листа «СИЗ»');
        const seg = WS_GS_SRC.slice(i, i + 1800);
        assertTrue(seg.indexOf('G: дата_изготовления') !== -1,
            'G — дата изготовления (новый столбец)');
        assertTrue(seg.indexOf('H: срок_годности') !== -1, 'H — срок (сместился из G)');
        assertTrue(seg.indexOf('I: дата_окончания') !== -1, 'I — окончание (сместилось из H)');
        assertTrue(seg.indexOf('J: примечание') !== -1, 'J — примечание (сместилось из I)');
        assertTrue(seg.indexOf('фильтрующие коробки противогазов') !== -1,
            'причина заявки — фильтрующие коробки противогазов');
    });

    test('listPpe: карта столбцов по шапке — новая и легаси структуры', () => {
        const fn = stripComments(methodText(WS_GS_SRC, 'listPpe'));
        assertTrue(fn.indexOf("gHead === 'дата_изготовления'") !== -1,
            'новая структура (G — дата изготовления)');
        assertTrue(fn.indexOf("gHead === 'срок_годности'") !== -1,
            'легаси-структура читается (лист до миграции)');
        assertTrue(fn.indexOf('{ issued: 6, mfg: 7, term: 8, expiry: 9, note: 10 }') !== -1,
            'карта новой структуры (10 столбцов)');
        assertTrue(fn.indexOf('{ issued: 6, mfg: 0, term: 7, expiry: 8, note: 9 }') !== -1,
            'карта легаси (mfg: 0 — без даты изготовления)');
        assertTrue(fn.indexOf('getRange(2, 1, lastRow - 1, 10)') !== -1,
            'чтение 10 столбцов');
        assertTrue(fn.indexOf("'ppe_columns_unknown'") !== -1,
            'нерасознанная шапка — ошибка');
        assertTrue(fn.indexOf('дата_изготовления: mfg ? this._toIsoDate(mfg) : \'\'') !== -1,
            'поле дата_изготовления в ответе');
    });

    test('_ppeHasManufactureCol: проверка шапки G', () => {
        const fn = stripComments(methodText(WS_GS_SRC, '_ppeHasManufactureCol'));
        assertTrue(fn.indexOf('getRange(1, 7, 1, 1)') !== -1, 'читает G1');
        assertTrue(fn.indexOf("=== 'дата_изготовления'") !== -1, 'сравнение с шапкой');
    });

    test('addPpe: guard + приоритет + 10 значений', () => {
        const fn = stripComments(methodText(WS_GS_SRC, 'addPpe'));
        assertTrue(fn.indexOf('this._ppeHasManufactureCol(sheet)') !== -1 &&
                   fn.indexOf("'ppe_not_migrated'") !== -1,
            'легаси-лист — отказ без записи');
        assertTrue(fn.indexOf('payload.дата_изготовления ? this._parseIsoDate(payload.дата_изготовления)') !== -1,
            'дата изготовления из payload');
        assertTrue(fn.indexOf('var base = manufactured || issued;') !== -1,
            'приоритет даты изготовления');
        assertTrue(fn.indexOf('this._ppeExpiry(base, term)') !== -1,
            'окончание от базовой даты');
        assertTrue(fn.indexOf('[newId, tabNo, emp.fio, emp.position, name, issued, manufactured, term, expiry, comment]') !== -1,
            'строка — 10 значений (F выдача, G изготовление, H срок, I окончание, J примечание)');
        assertTrue(fn.indexOf("' изгот. '") !== -1, 'аудит несёт дату изготовления');
    });

    test('updatePpe: guard + B..J (9 значений) + приоритет', () => {
        const fn = stripComments(methodText(WS_GS_SRC, 'updatePpe'));
        assertTrue(fn.indexOf('this._ppeHasManufactureCol(sheet)') !== -1 &&
                   fn.indexOf("'ppe_not_migrated'") !== -1,
            'легаси-лист — отказ без записи');
        assertTrue(fn.indexOf('getRange(rowIndex, 2, 1, 9).setValues(') !== -1,
            'запись B..J (9 значений — столбец добавился)');
        assertTrue(fn.indexOf('[[tabNo, emp.fio, emp.position, name, issued, manufactured, term, expiry, comment]]') !== -1,
            'значения в новом порядке столбцов');
        assertTrue(fn.indexOf('var base = manufactured || issued;') !== -1,
            'приоритет даты изготовления при пересчёте');
    });

    test('_ppeExpiry: базовая дата (переименование Task 443)', () => {
        const fn = stripComments(methodText(WS_GS_SRC, '_ppeExpiry'));
        assertTrue(fn.indexOf('_ppeExpiry: function(baseDate, term)') !== -1,
            'параметр — базовая дата');
        assertTrue(fn.indexOf('baseDate.getMonth() + months') !== -1,
            'месяцы прибавляются к базовой дате');
    });

    test('шапка файла: updatePpe — B..J, addPpe — изготовление в приоритете', () => {
        assertTrue(WS_GS_SRC.indexOf('правка записи СИЗ (B..J по id — Task 443)') !== -1,
            'описание updatePpe обновлено');
        assertTrue(WS_GS_SRC.indexOf('изготовления в приоритете, иначе') !== -1,
            'описание addPpe — приоритет изготовления');
    });
});

// ============================================================
// 4. SRC — PPEInit.gs: заголовки, миграция, предзаполнение
// ============================================================
describe('Task 443 — SRC: PPEInit.gs', () => {

    test('PPE_HEADERS: 10 столбцов, дата_изготовления после дата_выдачи', () => {
        const m = PPE_INIT_SRC.match(/var PPE_HEADERS\s*=\s*\[([^\]]+)\]/);
        assertTrue(m !== null, 'PPE_HEADERS найден');
        const items = m[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
        assertEqual(items.length, 10, '10 столбцов (было 9)');
        assertEqual(items.indexOf('дата_изготовления'), 6,
            'дата_изготовления — 7-я позиция (G), сразу после дата_выдачи (F)');
        assertEqual(items[5], 'дата_выдачи', 'F — дата выдачи');
        assertEqual(items[7], 'срок_годности', 'H — срок (сместился)');
        assertEqual(items[8], 'дата_окончания', 'I — окончание (сместилось)');
        assertEqual(items[9], 'примечание', 'J — примечание (сместилось)');
    });

    test('ppeMigrateManufacture: вставка столбца G + шапка + идемпотентность', () => {
        const fn = extractFunction(PPE_INIT_SRC, 'ppeMigrateManufacture');
        assertTrue(fn !== null, 'функция есть');
        assertTrue(fn.indexOf('insertColumnAfter(6)') !== -1,
            'вставка ПУСТОГО столбца после F (данные не трогаются)');
        assertTrue(fn.indexOf("setValue('дата_изготовления')") !== -1,
            'шапка G = дата_изготовления');
        assertTrue(fn.indexOf('setBackground(PPE_HEADER_BG)') !== -1 &&
                   fn.indexOf("setFontColor('#FFFFFF')") !== -1 &&
                   fn.indexOf("setFontWeight('bold')") !== -1,
            'стиль шапки — как у остальных столбцов');
        assertTrue(fn.indexOf("g === 'дата_изготовления'") !== -1 &&
                   fn.indexOf('return false;') !== -1,
            'идемпотентность: уже мигрировано — no-op');
        assertTrue(fn.indexOf("g !== 'срок_годности'") !== -1 &&
                   fn.indexOf('throw new Error(') !== -1,
            'чужая шапка — явная ошибка (не молчание)');
    });

    test('ppeDeployAll: миграция первым шагом', () => {
        const fn = extractFunction(PPE_INIT_SRC, 'ppeDeployAll');
        assertTrue(fn !== null && fn.indexOf('ppeMigrateManufacture();') !== -1,
            'deploy вызывает миграцию до создания/предзаполнения');
    });

    test('ppePrefillStandard: guard структуры + 10 значений', () => {
        const fn = extractFunction(PPE_INIT_SRC, 'ppePrefillStandard');
        assertTrue(fn !== null);
        assertTrue(fn.indexOf("headG !== 'дата_изготовления'") !== -1,
            'старый лист без G — отказ (значения не пойдут мимо столбцов)');
        assertTrue(fn.indexOf('getRange(2, 1, ppeLast - 1, 10)') !== -1,
            'чтение покрытия — 10 столбцов');
        assertTrue(fn.indexOf('getRange(newRow, 1, 1, 10).setValues(') !== -1,
            'запись строки — 10 значений');
        assertTrue(fn.indexOf('// дата_изготовления (Task 443)') !== -1,
            'в строке предзаполнения есть слот даты изготовления');
    });

    test('ppeStatus: чтение 10 столбцов', () => {
        const fn = extractFunction(PPE_INIT_SRC, 'ppeStatus');
        assertTrue(fn !== null && fn.indexOf('getRange(2, 1, lastRow - 1, 10)') !== -1,
            'диагностика читает новую структуру');
    });
});

// ============================================================
// 5. VM — клиент: приоритет даты изготовления
// ============================================================
function ppeHost(ppe) {
    const els = {};
    const toasts = [];
    const calls = [];
    const loadGrid = [];
    const closed = { cell: 0, emp: 0 };
    const document = { getElementById: id => (els[id] || (els[id] = mkEl())) };
    const ctx = {
        document, Math, Date, String, Number, parseInt, parseFloat, isNaN,
        isFinite, Promise,
        setTimeout: () => 0,
        KipToast: { show: m => toasts.push(String(m)) },
        kipConfirm: () => Promise.resolve(true),
    };
    vm.createContext(ctx);
    const methods = [
        'onEmpAddPpe', 'editPpe', 'openPpeForm', 'closePpeForm',
        'onPpeFormInput', 'submitPpeForm', 'deletePpe', '_doDeletePpe',
        '_ppeTermMonths', '_ppeExpiry', '_fillPpeNameOptions',
        '_esc', '_escAttr', '_apiErrText', '_isoDate', '_fmtDateRu',
        '_parseIsoLocal',
    ];
    const src = methods.map(n => extractMethod(INDEX_SRC, n))
        .filter(Boolean).join(',\n');
    vm.runInContext(`
        var WSM = {
            _canEdit: true,
            _EMPLOYEES: [
                { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
                  'должность': 'Мастер КИПиА' },
            ],
            _PPE: ${JSON.stringify(ppe || [])},
            _ppeEditId: null,
            _api: function(action, payload) {
                __calls.push({ action: action, payload: payload });
                return Promise.resolve({ ok: true });
            },
            loadGrid: function(force) { __loadGrid.push(force); },
            closeCellPopup: function() { __closed.cell++; },
            closeEmpPopup: function() { __closed.emp++; },
            ${src}
        };
        globalThis.__api = {
            WSM: WSM,
            els: function() { return els; },
            setEl: function(id, v) { var el = document.getElementById(id); el.value = v; return el; },
            calls: function() { return __calls; },
            toasts: function() { return toasts; },
            loadGrid: function() { return __loadGrid; },
            closed: function() { return __closed; },
        };
    `.replace(/__calls/g, 'calls').replace(/__loadGrid/g, 'loadGrid')
       .replace(/__closed/g, 'closed').replace(/__api/g, 'api'),
       ctx, { filename: 'WSM-443' });
    ctx.calls = calls;
    ctx.loadGrid = loadGrid;
    ctx.closed = closed;
    ctx.els = els;
    ctx.toasts = toasts;
    return ctx.api;
}

function cardHost(withEdit, ppe) {
    const EMP = [
        { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
          'смена': '', 'должность': 'Мастер КИПиА', 'комментарий': '',
          'дата_приёма': '2024-03-15' },
    ];
    const host = new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_renderWorkerCard') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
        '_canEdit: ' + JSON.stringify(!!withEdit) + ',' +
        '_year: 2026, _month: 8,' +
        '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
        '_VACATIONS: [],' +
        '_TRAININGS: [],' +
        '_PPE: ' + JSON.stringify(ppe || []) + ',' +
        '_fmtDateRu: function(d) { d = String(d);' +
        '  var p = d.split("-"); return p.length === 3 ?' +
        '  p[2] + "." + p[1] + "." + p[0] : d; },' +
        '_esc: function(s) { return String(s); },' +
        '_escAttr: function(s) { return String(s); },' +
        '_trainingCodeOf: function(t) { return "И"; },' +
        '_statusMeta: function(c) { return {}; }' +
        '});')(mockDoc({}));
    return host;
}

describe('Task 443 — VM: приоритет даты изготовления (клиент)', () => {

    test('_ppeExpiry: срок от даты изготовления (кламп месяца)', () => {
        const api = ppeHost();
        assertEqual(api.WSM._ppeExpiry('2025-01-15', '2 года'), '2027-01-15',
            '15.01.2025 + 2 года (фильтрующая коробка противогаза)');
        assertEqual(api.WSM._ppeExpiry('2025-08-31', '6 мес.'), '2026-02-28',
            'кламп: 31.08.2025 + 6 мес → 28.02.2026');
        assertEqual(api.WSM._ppeExpiry('2025-01-15', 'До износа'), 'До износа',
            '«До износа» — строкой');
    });

    test('onPpeFormInput: изготовление ПРИОРИТЕТ — окончание от него', () => {
        const api = ppeHost();
        api.WSM.openPpeForm('2706');
        api.setEl('wsPpeIssued', '2026-08-17');
        api.setEl('wsPpeManufactured', '2025-01-15');
        api.setEl('wsPpeTerm', '2 года');
        api.WSM.onPpeFormInput();
        const txt = api.els().wsPpeExpiryInfo.textContent;
        assertTrue(txt.indexOf('15.01.2027') !== -1,
            'окончание = изготовление + срок (НЕ выдача + срок = 17.08.2028): ' + txt);
        assertTrue(txt.indexOf('от даты изготовления') !== -1,
            'пометка «от даты изготовления»');
        // дата изготовления убрана — возврат к расчёту от выдачи
        api.setEl('wsPpeManufactured', '');
        api.WSM.onPpeFormInput();
        const txt2 = api.els().wsPpeExpiryInfo.textContent;
        assertTrue(txt2.indexOf('17.08.2028') !== -1,
            'без изготовления — от даты выдачи (Task 392 жив): ' + txt2);
        assertTrue(txt2.indexOf('от даты изготовления') === -1,
            'пометки приоритета нет');
    });

    test('onPpeFormInput: только изготовление (без выдачи) — считается от него', () => {
        const api = ppeHost();
        api.WSM.openPpeForm('2706');
        api.setEl('wsPpeIssued', '');
        api.setEl('wsPpeManufactured', '2025-01-15');
        api.setEl('wsPpeTerm', '1 год');
        api.WSM.onPpeFormInput();
        const txt = api.els().wsPpeExpiryInfo.textContent;
        assertTrue(txt.indexOf('15.01.2026') !== -1,
            'окончание от даты изготовления без даты выдачи: ' + txt);
    });

    test('onPpeFormInput: изготовление + «До износа»', () => {
        const api = ppeHost();
        api.WSM.openPpeForm('2706');
        api.setEl('wsPpeManufactured', '2025-01-15');
        api.setEl('wsPpeTerm', 'До износа');
        api.WSM.onPpeFormInput();
        assertEqual(api.els().wsPpeExpiryInfo.textContent,
            'Дата окончания срока годности: До износа', '«До износа» — без даты');
    });

    test('openPpeForm(edit): префилл даты изготовления из записи', () => {
        const api = ppeHost([
            { id: 7, 'таб_номер': '2706', наименование: 'Фильтрующая коробка противогаза',
              дата_выдачи: '2026-08-17', дата_изготовления: '2025-01-15',
              срок_годности: '2 года', дата_окончания: '2027-01-15', примечание: '' },
        ]);
        api.WSM.editPpe(7);
        assertEqual(api.els().wsPpeManufactured.value, '2025-01-15',
            'дата изготовления в поле правки');
        assertEqual(api.els().wsPpeIssued.value, '2026-08-17', 'дата выдачи (информационная)');
    });

    test('submitPpeForm: payload несёт дату_изготовления (создание и правка)', async () => {
        const api = ppeHost();
        api.WSM.openPpeForm('2706');
        const els = api.els();
        els.wsPpeName.value = 'Фильтрующая коробка противогаза';
        els.wsPpeIssued.value = '2026-08-17';
        els.wsPpeManufactured.value = '2025-01-15';
        els.wsPpeTerm.value = '2 года';
        api.WSM.submitPpeForm();
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        const add = api.calls().filter(c => c.action === 'workSchedule.addPpe');
        assertEqual(add.length, 1, 'вызов addPpe');
        assertEqual(add[0].payload.дата_изготовления, '2025-01-15',
            'дата изготовления в payload');
        assertEqual(add[0].payload.дата_выдачи, '2026-08-17', 'дата выдачи тоже уходит');
        // правка: очистка даты изготовления → пустая строка в payload
        const api2 = ppeHost([
            { id: 7, 'таб_номер': '2706', наименование: 'Фильтрующая коробка противогаза',
              дата_выдачи: '2026-08-17', дата_изготовления: '2025-01-15',
              срок_годности: '2 года', дата_окончания: '2027-01-15', примечание: '' },
        ]);
        api2.WSM.editPpe(7);
        api2.els().wsPpeManufactured.value = '';
        api2.WSM.submitPpeForm();
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        const upd = api2.calls().filter(c => c.action === 'workSchedule.updatePpe');
        assertEqual(upd.length, 1, 'вызов updatePpe');
        assertEqual(upd[0].payload.дата_изготовления, '',
            'очищенная дата изготовления — пустая строка (сброс приоритета)');
    });

    test('карточка: «изгот. …» в мета-строке при наличии даты', () => {
        const host = cardHost(true, [
            { id: 9, 'таб_номер': '2706', наименование: 'Фильтрующая коробка противогаза',
              дата_выдачи: '2026-08-17', дата_изготовления: '2025-01-15',
              срок_годности: '2 года', дата_окончания: '2027-01-15', примечание: '' },
            { id: 10, 'таб_номер': '2706', наименование: 'Каска защитная',
              дата_выдачи: '2026-08-17', срок_годности: '2 года',
              дата_окончания: '2028-08-17', примечание: '' },
        ]);
        const html = host._renderWorkerCard('2706', true, true)[3];
        assertTrue(html.indexOf('изгот. 15.01.2025') !== -1,
            'строка «изгот. 15.01.2025» у записи с датой изготовления');
        const iIssued = html.indexOf('выдано 17.08.2026');
        const iMfg = html.indexOf('изгот. 15.01.2025');
        assertTrue(iIssued !== -1 && iMfg !== -1 && iIssued < iMfg,
            'изготовление — после даты выдачи (информационный порядок заявки)');
        assertTrue(html.indexOf('до 15.01.2027') !== -1,
            'дата окончания от изготовления (поле сервера)');
        const kas = html.slice(html.indexOf('Каска защитная'));
        assertTrue(kas.indexOf('изгот.') === -1,
            'запись без даты изготовления — без строки «изгот.»');
    });
});

// ============================================================
// 6. VM — сервер: listPpe обе структуры, addPpe/updatePpe
// ============================================================
function mkSheet(rows) {
    const data = rows.map(r => r.slice());
    const writes = [];
    const formats = [];
    function getRange(row, col, numRows, numCols) {
        numRows = numRows || 1; numCols = numCols || 1;
        return {
            getValues() {
                const out = [];
                for (let i = 0; i < numRows; i++) {
                    const line = [];
                    for (let j = 0; j < numCols; j++) {
                        line.push((data[row - 1 + i] || [])[col - 1 + j] !== undefined
                            ? (data[row - 1 + i] || [])[col - 1 + j] : '');
                    }
                    out.push(line);
                }
                return out;
            },
            getValue() { return ((data[row - 1] || [])[col - 1] !== undefined ? (data[row - 1] || [])[col - 1] : ''); },
            setValues(v) {
                writes.push({ row, col, numRows, numCols, v });
                for (let i = 0; i < numRows; i++) {
                    for (let j = 0; j < numCols; j++) {
                        if (!data[row - 1 + i]) data[row - 1 + i] = [];
                        data[row - 1 + i][col - 1 + j] = v[i][j];
                    }
                }
            },
            setValue(v) {
                writes.push({ row, col, numRows: 1, numCols: 1, v: [[v]] });
                if (!data[row - 1]) data[row - 1] = [];
                data[row - 1][col - 1] = v;
            },
            setNumberFormat(f) { formats.push({ row, col, f }); },
        };
    }
    return {
        getLastRow() { return data.length; },
        getRange,
        deleteRow(r) { data.splice(r - 1, 1); },
        _data: data, _writes: writes, _formats: formats,
    };
}

function makePpeServer() {
    const audits = [];
    const sheets = {};
    const ctx = {
        Math, Date, String, Number, parseInt, parseFloat, isNaN,
        Utils: { audit: (email, code) => { audits.push(code); } },
    };
    vm.createContext(ctx);
    const methods = ['_parseIsoDate', '_parseSheetDate', '_safeDate', '_toIsoDate',
                     '_appendRowKeepText', 'listPpe', 'addPpe', 'updatePpe',
                     'deletePpe', '_ppeLookupEmployee', '_ppeTermMonths',
                     '_ppeExpiry', '_ppeHasManufactureCol',
                     // Task 489-adapt: _ppeLookupEmployee идёт через карту
                     '_employeesColMap', '_wsShortFio', '_wsNameInitial', '_wsFullFio'];
    const src = methods.map(n => extractMethod(WS_GS_SRC, n)).filter(Boolean).join(',\n');
    vm.runInContext(`
        var WSS = {
            EMPLOYEES_SHEET: 'Сотрудники',
            VACATIONS_SHEET: 'Отпуска',
            PPE_SHEET: 'СИЗ',
            _requireRead: function(token) { return { user: { email: 't@t' } }; },
            _requireWrite: function(token) { return { user: { email: 't@t' } }; },
            _getSheet: function(name) { return sheetsAccess[name] || null; },
            ${src}
        };
        globalThis.__api = {
            WSS: WSS,
            setSheet: function(name, rows) { sheetsAccess[name] = mkSheetHost(rows); return sheetsAccess[name]; },
            audits: function() { return audits; },
        };
    `.replace(/sheetsAccess/g, 'sheetsHost').replace(/mkSheetHost/g, 'mkSheet')
       .replace(/auditsHost/g, 'audits'), ctx, { filename: 'WorkSchedule.gs-443' });
    ctx.sheetsHost = sheets;
    ctx.mkSheet = mkSheet;
    ctx.audits = audits;
    return ctx.__api;
}

describe('Task 443 — VM сервер: listPpe — обе структуры листа', () => {

    function ppeSheetNew() {
        // НОВАЯ структура: G — дата_изготовления (10 столбцов)
        return [
            ['id', 'таб_номер', 'работник', 'должность', 'наименование_СИЗ',
             'дата_выдачи', 'дата_изготовления', 'срок_годности',
             'дата_окончания', 'примечание'],
            [1, '2706', 'Галкин Д. Н.', 'Мастер КИПиА', 'Фильтрующая коробка противогаза',
             new Date(2026, 7, 17), new Date(2025, 0, 15), '2 года',
             new Date(2027, 0, 15), ''],
            [2, '2706', 'Галкин Д. Н.', 'Мастер КИПиА', 'Каска защитная',
             '2026-08-17', '2025-03-20', '2 года', '2027-03-20', 'До износа'],
            [3, '0377', 'Первов С. А.', 'Слесарь КИПиА', 'Ботинки',
             '2026-08-17', '', '1,5 года', '2028-02-17', ''],
        ];
    }

    function ppeSheetLegacy() {
        // ЛЕГАСИ структура (до миграции): 9 столбцов, G — срок
        return [
            ['id', 'таб_номер', 'работник', 'должность', 'наименование_СИЗ',
             'дата_выдачи', 'срок_годности', 'дата_окончания', 'примечание'],
            [5, '2706', 'Галкин Д. Н.', 'Мастер КИПиА', 'Костюм для защиты от растворов кислот и щелочей',
             new Date(2026, 7, 17), '1 год', new Date(2027, 7, 17), ''],
            [6, '0377', 'Первов С. А.', 'Слесарь КИПиА', 'Очки закрытые',
             '', 'До износа', 'До износа', ''],
        ];
    }

    test('новая структура: дата_изготовления читается (Date и текст)', () => {
        const api = makePpeServer();
        api.setSheet('СИЗ', ppeSheetNew());
        const res = api.WSS.listPpe({ token: 't' });
        assertEqual(res.ok, true, 'успех');
        const ppe = res.data.ppe;
        assertEqual(ppe.length, 3, '3 записи');
        assertEqual(ppe[0].дата_изготовления, '2025-01-15', 'Date → ISO');
        assertEqual(ppe[1].дата_изготовления, '2025-03-20', 'текстовая дата → ISO');
        assertEqual(ppe[2].дата_изготовления, '', 'пустая — пустая строка');
        assertEqual(ppe[0].срок_годности, '2 года', 'срок из H (сместился)');
        assertEqual(ppe[0].дата_окончания, '2027-01-15', 'окончание из I');
        assertEqual(ppe[1].примечание, 'До износа', 'примечание из J');
    });

    test('легаси-структура (до миграции): читается как прежде, изготовление = \'\'', () => {
        const api = makePpeServer();
        api.setSheet('СИЗ', ppeSheetLegacy());
        const res = api.WSS.listPpe({ token: 't' });
        assertEqual(res.ok, true, 'успех (переходный период безопасен)');
        const ppe = res.data.ppe;
        assertEqual(ppe.length, 2, '2 записи');
        assertEqual(ppe[0].дата_выдачи, '2026-08-17', 'выдача из F');
        assertEqual(ppe[0].дата_изготовления, '', 'даты изготовления нет — пусто');
        assertEqual(ppe[0].срок_годности, '1 год', 'срок со СТАРОЙ позиции G');
        assertEqual(ppe[0].дата_окончания, '2027-08-17', 'окончание со старой H');
        assertEqual(ppe[1].дата_окончания, 'До износа', '«До износа» строкой');
        assertEqual(ppe[1].примечание, '', 'примечание со старой I');
    });

    test('нераспознанная шапка → ppe_columns_unknown', () => {
        const api = makePpeServer();
        api.setSheet('СИЗ', [
            ['id', 'таб_номер', 'работник', 'должность', 'наименование_СИЗ',
             'дата_выдачи', 'что-то другое', 'срок_годности',
             'дата_окончания', 'примечание'],
            [1, '2706', 'X', 'Y', 'Z', '', '', '', '', ''],
        ]);
        const res = api.WSS.listPpe({ token: 't' });
        assertEqual(res.ok, false, 'отказ');
        assertEqual(res.error, 'ppe_columns_unknown', 'код ошибки');
    });
});

// ============================================================
// 7. VM — сервер: addPpe/updatePpe — приоритет и guard
// ============================================================
describe('Task 443 — VM сервер: addPpe — приоритет изготовления', () => {

    function empSheet() {
        return [
            ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон', 'старт', 'приём', 'увол', 'архив', 'должность', 'комментарий'],
            ['2706', 'Галкин Д. Н.', 'дневной', '', '', '', new Date(2024, 2, 15), '', 0, 'Мастер КИПиА', ''],
        ];
    }
    function ppeEmptyNew() {
        return [['id', 'таб_номер', 'работник', 'должность', 'наименование_СИЗ',
                 'дата_выдачи', 'дата_изготовления', 'срок_годности',
                 'дата_окончания', 'примечание']];
    }
    function ppeLegacy() {
        return [['id', 'таб_номер', 'работник', 'должность', 'наименование_СИЗ',
                 'дата_выдачи', 'срок_годности', 'дата_окончания', 'примечание'],
                [5, '2706', 'Галкин Д. Н.', 'Мастер КИПиА', 'Каска защитная',
                 new Date(2025, 0, 10), '2 года', new Date(2027, 0, 10), 'До износа']];
    }

    test('дата изготовления указана → окончание = изготовление + срок (ПРИОРИТЕТ)', () => {
        const api = makePpeServer();
        api.setSheet('Сотрудники', empSheet());
        const sheet = api.setSheet('СИЗ', ppeEmptyNew());
        const res = api.WSS.addPpe({
            token: 't', 'таб_номер': '2706',
            наименование: 'Фильтрующая коробка противогаза',
            дата_выдачи: '2026-08-17', дата_изготовления: '2025-01-15',
            срок_годности: '2 года', примечание: 'банка №2',
        });
        assertEqual(res.ok, true, 'успех');
        const row = sheet._data[1];
        assertEqual(row[5].getTime(), new Date(2026, 7, 17).getTime(),
            'F: дата выдачи (информационная — сохраняется)');
        assertEqual(row[6].getTime(), new Date(2025, 0, 15).getTime(),
            'G: дата изготовления');
        assertEqual(row[7], '2 года', 'H: срок');
        assertEqual(row[8].getTime(), new Date(2027, 0, 15).getTime(),
            'I: окончание = ИЗГОТОВЛЕНИЕ + 2 года (НЕ выдача + срок = 17.08.2028)');
        assertEqual(row[9], 'банка №2', 'J: примечание');
        assertTrue(api.audits().some(a => a === 'WORKSCHEDULE_ADD_PPE'), 'аудит');
    });

    test('без даты изготовления → от даты выдачи (регресс Task 392)', () => {
        const api = makePpeServer();
        api.setSheet('Сотрудники', empSheet());
        const sheet = api.setSheet('СИЗ', ppeEmptyNew());
        api.WSS.addPpe({
            token: 't', 'таб_номер': '2706', наименование: 'Костюм',
            дата_выдачи: '2026-08-17', срок_годности: '1 год',
        });
        const row = sheet._data[1];
        assertTrue(row[6] === null || row[6] === '', 'G: изготовление пусто');
        assertEqual(row[8].getTime(), new Date(2027, 7, 17).getTime(),
            'I: окончание = выдача + 1 год');
    });

    test('изготовление + «До износа» → «До износа»', () => {
        const api = makePpeServer();
        api.setSheet('Сотрудники', empSheet());
        const sheet = api.setSheet('СИЗ', ppeEmptyNew());
        api.WSS.addPpe({
            token: 't', 'таб_номер': '2706', наименование: 'Очки закрытые',
            дата_изготовления: '2025-01-15', срок_годности: 'До износа',
        });
        assertEqual(sheet._data[1][8], 'До износа', 'I = «До износа» (текст)');
    });

    test('ЛЕГАСИ-лист → ppe_not_migrated, строка НЕ пишется', () => {
        const api = makePpeServer();
        api.setSheet('Сотрудники', empSheet());
        const sheet = api.setSheet('СИЗ', ppeLegacy());
        const before = JSON.stringify(sheet._data);
        const res = api.WSS.addPpe({
            token: 't', 'таб_номер': '2706', наименование: 'Каска',
            дата_выдачи: '2026-09-01', срок_годности: '1 год',
        });
        assertEqual(res.ok, false, 'отказ');
        assertEqual(res.error, 'ppe_not_migrated', 'код');
        assertTrue(res.message.indexOf('ppeMigrateManufacture') !== -1,
            'сообщение ведёт к миграции');
        assertEqual(JSON.stringify(sheet._data), before,
            'данные легаси-листа НЕ тронуты (защита от сдвига столбцов)');
    });

    test('updatePpe: B..J, окончание от изготовления', () => {
        const api = makePpeServer();
        api.setSheet('Сотрудники', empSheet());
        const sheet = api.setSheet('СИЗ', [
            ['id', 'таб_номер', 'работник', 'должность', 'наименование_СИЗ',
             'дата_выдачи', 'дата_изготовления', 'срок_годности',
             'дата_окончания', 'примечание'],
            [5, '2706', 'Галкин Д. Н.', 'Мастер КИПиА', 'Фильтрующая коробка противогаза',
             new Date(2025, 0, 10), '', '2 года', new Date(2027, 0, 10), ''],
        ]);
        const res = api.WSS.updatePpe({
            token: 't', id: 5, 'таб_номер': '2706',
            наименование: 'Фильтрующая коробка противогаза',
            дата_выдачи: '2026-08-17', дата_изготовления: '2025-06-01',
            срок_годности: '3 года', примечание: 'новая партия',
        });
        assertEqual(res.ok, true, 'успех');
        const row = sheet._data[1];
        assertEqual(row[5].getTime(), new Date(2026, 7, 17).getTime(), 'F: выдача обновлена');
        assertEqual(row[6].getTime(), new Date(2025, 5, 1).getTime(), 'G: изготовление');
        assertEqual(row[7], '3 года', 'H: срок');
        assertEqual(row[8].getTime(), new Date(2028, 5, 1).getTime(),
            'I: окончание = изготовление + 3 года');
        assertEqual(row[9], 'новая партия', 'J: примечание');
    });

    test('updatePpe: ЛЕГАСИ-лист → ppe_not_migrated, строка не меняется', () => {
        const api = makePpeServer();
        api.setSheet('Сотрудники', empSheet());
        const sheet = api.setSheet('СИЗ', ppeLegacy());
        const before = JSON.stringify(sheet._data);
        const res = api.WSS.updatePpe({
            token: 't', id: 5, 'таб_номер': '2706',
            наименование: 'Каска защитная', дата_выдачи: '2026-09-01',
            срок_годности: '1 год',
        });
        assertEqual(res.ok, false, 'отказ');
        assertEqual(res.error, 'ppe_not_migrated', 'код');
        assertEqual(JSON.stringify(sheet._data), before, 'легаси-данные не тронуты');
    });
});

// ============================================================
// 8. VM — PPEInit.gs: ppeMigrateManufacture
// ============================================================
function mkMigSheet(rows) {
    const data = rows.map(r => r.slice());
    const ops = { inserts: [], setValue: [], bg: null, fc: null, fw: null };
    function getRange(row, col, numRows, numCols) {
        numRows = numRows || 1; numCols = numCols || 1;
        const r = {
            getValues() {
                const out = [];
                for (let i = 0; i < numRows; i++) {
                    const line = [];
                    for (let j = 0; j < numCols; j++) {
                        line.push((data[row - 1 + i] || [])[col - 1 + j] !== undefined
                            ? (data[row - 1 + i] || [])[col - 1 + j] : '');
                    }
                    out.push(line);
                }
                return out;
            },
            setValue(v) {
                ops.setValue.push({ row, col, v });
                if (!data[row - 1]) data[row - 1] = [];
                data[row - 1][col - 1] = v;
                return r;
            },
            setBackground(c) { ops.bg = c; return r; },
            setFontColor(c) { ops.fc = c; return r; },
            setFontWeight(w) { ops.fw = w; return r; },
            setNumberFormat() { return r; },
        };
        return r;
    }
    return {
        getRange,
        insertColumnAfter(col) {
            ops.inserts.push(col);
            for (const row of data) row.splice(col, 0, '');
        },
        _data: data, _ops: ops,
    };
}

function migrateHost(rows, hasSheet) {
    const logs = [];
    const sheet = (hasSheet === false) ? null : mkMigSheet(rows);
    const ss = { getSheetByName: function() { return sheet; } };
    const ctx = {
        Math, Date, String, Number, parseInt, parseFloat, isNaN,
        Logger: { log: function() { logs.push(Array.prototype.slice.call(arguments).join(' ')); } },
        SpreadsheetApp: { openById: function() { return ss; } },
    };
    vm.createContext(ctx);
    const fn = extractFunction(PPE_INIT_SRC, 'ppeMigrateManufacture');
    vm.runInContext(
        'var PPE_SPREADSHEET_ID = "X", PPE_SHEET_NAME = "СИЗ", ' +
        'PPE_HEADER_BG = "#1F4E5F", PPE_EMPLOYEES_SHEET = "Сотрудники";\n' +
        fn + '\n' +
        'globalThis.__mig = { run: ppeMigrateManufacture };',
        ctx, { filename: 'PPEInit-443' });
    return { run: ctx.__mig.run, logs, sheet };
}

describe('Task 443 — VM: ppeMigrateManufacture (миграция листа)', () => {

    function legacySheet() {
        return [
            ['id', 'таб_номер', 'работник', 'должность', 'наименование_СИЗ',
             'дата_выдачи', 'срок_годности', 'дата_окончания', 'примечание'],
            [5, '2706', 'Галкин Д. Н.', 'Мастер КИПиА', 'Каска защитная',
             '2025-01-10', '2 года', '2027-01-10', 'До износа'],
            [6, '2706', 'Галкин Д. Н.', 'Мастер КИПиА', 'Очки закрытые',
             '', 'До износа', 'До износа', ''],
        ];
    }

    test('легаси-лист: пустой G вставлен, шапка + стиль, данные сместились', () => {
        const h = migrateHost(legacySheet(), true);
        const res = h.run();
        assertEqual(res, true, 'миграция выполнена');
        const d = h.sheet._data;
        assertEqual(d[0][6], 'дата_изготовления', 'шапка G = дата_изготовления');
        assertEqual(d[0][7], 'срок_годности', 'срок сместился G → H');
        assertEqual(d[0][8], 'дата_окончания', 'окончание сместилось H → I');
        assertEqual(d[0][9], 'примечание', 'примечание сместилось I → J');
        assertEqual(d[1][5], '2025-01-10', 'данные: дата выдачи на месте (F)');
        assertTrue(d[1][6] === '' || d[1][6] === undefined,
            'данные: G — ПУСТОЙ столбец (дата изготовления не указана)');
        assertEqual(d[1][7], '2 года', 'данные: срок теперь в H');
        assertEqual(d[1][8], '2027-01-10', 'данные: окончание теперь в I');
        assertEqual(d[1][9], 'До износа', 'данные: примечание теперь в J');
        assertEqual(d[2][9], '', 'вторая строка тоже смещена');
        assertEqual(h.sheet._ops.inserts.length, 1, 'один insertColumnAfter');
        assertEqual(h.sheet._ops.inserts[0], 6, 'вставка ПОСЛЕ F (6-й столбец)');
        assertEqual(h.sheet._ops.bg, '#1F4E5F', 'фон шапки');
        assertEqual(h.sheet._ops.fc, '#FFFFFF', 'цвет текста шапки');
        assertEqual(h.sheet._ops.fw, 'bold', 'жирность шапки');
    });

    test('идемпотентность: повторный запуск — no-op', () => {
        const h = migrateHost([
            ['id', 'таб_номер', 'работник', 'должность', 'наименование_СИЗ',
             'дата_выдачи', 'дата_изготовления', 'срок_годности',
             'дата_окончания', 'примечание'],
            [5, '2706', 'X', 'Y', 'Z', '2025-01-10', '2024-06-01', '2 года', '2026-06-01', ''],
        ], true);
        const before = JSON.stringify(h.sheet._data);
        const res = h.run();
        assertEqual(res, false, 'уже мигрировано — ничего не делает');
        assertEqual(h.sheet._ops.inserts.length, 0, 'вставок НЕ было');
        assertEqual(JSON.stringify(h.sheet._data), before, 'данные не тронуты');
    });

    test('листа нет → false (создаст ppeCreateSheet с новой структурой)', () => {
        const h = migrateHost(null, false);
        const res = h.run();
        assertEqual(res, false, 'миграция не нужна');
        assertTrue(h.logs.join(' ').indexOf('ppeCreateSheet') !== -1,
            'лог ведёт к созданию листа');
    });

    test('чужая шапка G → явная ошибка (не молчаливое повреждение)', () => {
        const h = migrateHost([
            ['id', 'таб_номер', 'работник', 'должность', 'наименование_СИЗ',
             'дата_выдачи', 'непонятный столбец', 'срок_годности',
             'дата_окончания', 'примечание'],
        ], true);
        let threw = null;
        try { h.run(); } catch (e) { threw = e; }
        assertTrue(threw !== null, 'бросает Error');
        assertTrue(String(threw && threw.message).indexOf('срок_годности') !== -1,
            'сообщение объясняет ожидания');
    });
});

// ============================================================
// 9. SW — версия кэша
// ============================================================
describe('Task 443 — SW: версия кэша', () => {

    test('SW: kipia-test-v761', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v761'") !== -1,
            'SWVersion bumped');
        assertTrue(SW_SRC.indexOf('kipia-test-v762') === -1,
            'двойного бампа не было');
    });

    test('SW: комментарий Task 443 (СИЗ — дата изготовления)', () => {
        assertTrue(SW_SRC.indexOf('Task 443') !== -1 &&
                   SW_SRC.indexOf('дата_изготовления') !== -1,
            'комментарий задачи в истории версий SW');
    });
});
