// ============================================================
// Task 461 — заявка: «В разделе Работники в форме добавления СИЗ,
// выпадающий список наименования СИЗ должен формироваться
// автоматически в зависимости от содержания столбца
// "наименование_СИЗ" расположенного на листе "СИЗ" файла
// табель_КИП_ИОС. То есть из всего списка наименования СИЗ в
// столбце "наименование_СИЗ", в выпадающем списке формы должны
// перечислятся все разные СИЗ, но естественно в одном наименовании,
// без повторения.»
//
// Реализация (полностью КЛИЕНТСКАЯ, index.html + sw.js):
//   • НОВЫЙ метод WorkSchedule._fillPpeNameOptions: datalist
//     #wsPpeNameList заполняется УНИКАЛЬНЫМИ наименованиями из
//     this._PPE (workSchedule.listPpe — столбец E
//     «наименование_СИЗ» листа «СИЗ»), регистр не различается
//     (хранится первое встреченное написание), сортировка по
//     алфавиту localeCompare 'ru', пустые/пробельные пропускаются;
//   • вызов — при КАЖДОМ открытии шторки (openPpeForm, создание и
//     правка): _PPE свежий (loadGrid → _loadPpe после каждого
//     add/update/delete);
//   • пустой лист (нет записей / офлайн до первой загрузки) —
//     datalist НЕ трогается: в HTML остаётся статичный запасной
//     набор из 8 позиций образца (Task 392); свободный текст
//     не запрещён;
//   • сервер НЕ меняется (listPpe уже отдаёт все записи листа);
//   • sw.js → kipia-test-v742.
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
    return m ? String(m) : '';
}

function stripComments(s) {
    return String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// мок-элемент DOM (как test-task392): value/innerHTML/textContent,
// classList, focus — всё, чего касается openPpeForm/_fillPpeNameOptions
function mkEl() {
    return {
        style: {}, attrs: {}, hidden: false, innerHTML: '', value: '',
        textContent: '',
        classList: { add: function() {}, remove: function() {},
                     contains: function() { return false; },
                     toggle: function() {} },
        setAttribute: function(k, v) { this.attrs[k] = v; },
        focus: function() {},
        getBoundingClientRect: function() { return { width: 0, height: 0,
            left: 0, right: 0, top: 0, bottom: 0 }; }
    };
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

function ppeHost(ppe, opts) {
    opts = opts || {};
    const els = {
        wsPpeNameList: mkEl()
    };
    if (opts.datalistHtml !== undefined) els.wsPpeNameList.innerHTML = opts.datalistHtml;
    const host = new Function('document', 'return ({' +
        methodText(INDEX_SRC, '_fillPpeNameOptions') + ',' +
        '_PPE: ' + JSON.stringify(ppe === undefined ? [] : ppe) + ',' +
        '_escAttr: ' + (opts.escAttr
            ? opts.escAttr.toString()
            : 'function(s) { return String(s); }') +
        '});')(mockDoc(els));
    return { host: host, els: els };
}

// значения option из innerHTML datalist: <option value="…"></option>
function optionValues(html) {
    const out = [];
    const re = /<option value="([^"]*)"><\/option>/g;
    let m;
    while ((m = re.exec(String(html))) !== null) out.push(m[1]);
    return out;
}

// ============================================================
// 1. SRC — datalist формы СИЗ (HTML)
// ============================================================
describe('Task 461 — SRC: datalist #wsPpeNameList', () => {

    test('input wsPpeName связан с datalist wsPpeNameList', () => {
        assertTrue(INDEX_SRC.indexOf('id="wsPpeNameList"') !== -1,
            'datalist определён');
        assertTrue(INDEX_SRC.indexOf('list="wsPpeNameList"') !== -1,
            'input наименования ссылается на datalist');
    });

    test('статичный ЗАПАСНОЙ набор — 8 позиций образца (Task 392)', () => {
        const i = INDEX_SRC.indexOf('<datalist id="wsPpeNameList">');
        const end = INDEX_SRC.indexOf('</datalist>', i);
        assertTrue(i !== -1 && end !== -1, 'блок datalist найден');
        const block = INDEX_SRC.slice(i, end);
        const vals = optionValues(block);
        assertEqual(8, vals.length, 'ровно 8 статичных option: ' + JSON.stringify(vals));
        [
            'Костюм для защиты от растворов кислот и щелочей',
            'Ботинки', 'Белье нательное', 'Куртка утеплённая',
            'Каска защитная', 'Подшлемник', 'Противогаз', 'Очки закрытые'
        ].forEach(function(v) {
            assertTrue(vals.indexOf(v) !== -1, 'позиция образца: ' + v);
        });
    });

    test('комментарий Task 461 над datalist: динамика + запасной', () => {
        const i = INDEX_SRC.indexOf('<datalist id="wsPpeNameList">');
        const above = INDEX_SRC.slice(Math.max(0, i - 700), i);
        assertTrue(above.indexOf('Task 461') !== -1, 'ссылка на Task 461');
        assertTrue(above.indexOf('_fillPpeNameOptions') !== -1,
            'упомянут метод динамики');
        assertTrue(above.indexOf('ЗАПАСНОЙ') !== -1 ||
                   above.indexOf('запасной') !== -1,
            'пояснён запасной характер статичного набора');
        assertTrue(above.indexOf('без повторов') !== -1,
            'заявка: «без повторения»');
    });
});

// ============================================================
// 2. SRC — метод _fillPpeNameOptions и вызов из openPpeForm
// ============================================================
describe('Task 461 — SRC: метод _fillPpeNameOptions', () => {

    test('метод существует, работает с wsPpeNameList и _PPE', () => {
        const fn = methodText(INDEX_SRC, '_fillPpeNameOptions');
        assertTrue(fn !== '', 'метод извлечён');
        const bare = stripComments(fn);
        assertTrue(bare.indexOf("getElementById('wsPpeNameList')") !== -1,
            'читает datalist');
        assertTrue(bare.indexOf('.наименование') !== -1,
            'берёт поле «наименование» записей листа «СИЗ»');
        assertTrue(bare.indexOf('this._PPE') !== -1, 'источник — кэш listPpe');
    });

    test('уникальность: дедупликация по toLowerCase + hasOwnProperty', () => {
        const bare = stripComments(methodText(INDEX_SRC, '_fillPpeNameOptions'));
        assertTrue(bare.indexOf('.toLowerCase()') !== -1,
            'ключ дедупликации — нижний регистр');
        assertTrue(bare.indexOf('hasOwnProperty') !== -1,
            'проверка повтора через hasOwnProperty');
    });

    test('обработка значений: trim + пропуск пустых', () => {
        const bare = stripComments(methodText(INDEX_SRC, '_fillPpeNameOptions'));
        assertTrue(bare.indexOf('.trim()') !== -1, 'пробелы обрезаются');
        assertTrue(/if \(!n\) continue;/.test(bare), 'пустые пропускаются');
    });

    test('сортировка по алфавиту — localeCompare \'ru\'', () => {
        const bare = stripComments(methodText(INDEX_SRC, '_fillPpeNameOptions'));
        assertTrue(bare.indexOf(".localeCompare(b, 'ru')") !== -1,
            'сортировка localeCompare с локалью ru');
    });

    test('экранирование значений через _escAttr', () => {
        const bare = stripComments(methodText(INDEX_SRC, '_fillPpeNameOptions'));
        assertTrue(bare.indexOf('this._escAttr(') !== -1,
            'value оборачивается _escAttr');
    });

    test('запасной набор: пустой список — datalist НЕ трогается', () => {
        const bare = stripComments(methodText(INDEX_SRC, '_fillPpeNameOptions'));
        assertTrue(/if \(!names\.length\) return;/.test(bare),
            'ранний возврат при пустом наборе (остаётся HTML-набор)');
    });

    test('openPpeForm вызывает _fillPpeNameOptions', () => {
        const fn = methodText(INDEX_SRC, 'openPpeForm');
        assertTrue(fn !== '', 'openPpeForm извлечён');
        const bare = stripComments(fn);
        assertTrue(bare.indexOf('this._fillPpeNameOptions();') !== -1,
            'вызов при открытии шторки');
        // вызов ДО показа шторки (класс active) — подсказки готовы
        const callAt = bare.indexOf('this._fillPpeNameOptions();');
        const showAt = bare.indexOf("classList.add('active')");
        assertTrue(callAt !== -1 && showAt !== -1 && callAt < showAt,
            'datalist заполняется до показа шторки');
    });
});

// ============================================================
// 3. VM — _fillPpeNameOptions: уникальность / регистр / сортировка
// ============================================================
describe('Task 461 — VM: уникальные наименования без повторов', () => {

    // лист «СИЗ» с повторами: каска у ТРЁХ работников (3 повтора),
    // перчатки в двух написаниях (регистр), ботинки с пробелами,
    // пустые наименования, null-запись
    const PPE = [
        { id: 1, 'таб_номер': '0871', наименование: 'Каска защитная' },
        { id: 2, 'таб_номер': '0872', наименование: 'Каска защитная' },
        { id: 3, 'таб_номер': '0873', наименование: 'Каска защитная' },
        { id: 4, 'таб_номер': '0871', наименование: 'Перчатки нитриловые' },
        { id: 5, 'таб_номер': '0872', наименование: 'перчатки нитриловые' },
        { id: 6, 'таб_номер': '0871', наименование: '  Ботинки  ' },
        { id: 7, 'таб_номер': '0871', наименование: 'Очки закрытые' },
        { id: 8, 'таб_номер': '0872', наименование: 'Противогаз' },
        { id: 9, 'таб_номер': '0871', наименование: 'Куртка утеплённая' },
        { id: 10, 'таб_номер': '0872', наименование: 'куртка утеплённая' },
        { id: 11, 'таб_номер': '0873', наименование: '' },
        { id: 12, 'таб_номер': '0873', наименование: '   ' },
        { id: 13, 'таб_номер': '0873', наименование:
            'Костюм для защиты от растворов кислот и щелочей' },
        null
    ];

    const EXPECTED = [
        'Ботинки',
        'Каска защитная',
        'Костюм для защиты от растворов кислот и щелочей',
        'Куртка утеплённая',
        'Очки закрытые',
        'Перчатки нитриловые',
        'Противогаз'
    ];

    test('повторы схлопнуты: 13 записей → 7 уникальных наименований', () => {
        const t = ppeHost(PPE);
        t.host._fillPpeNameOptions();
        const vals = optionValues(t.els.wsPpeNameList.innerHTML);
        assertEqual(EXPECTED.length, vals.length,
            'ожидалось 7 уникальных, получено: ' + JSON.stringify(vals));
    });

    test('все разные СИЗ перечислены, БЕЗ повторения (заявка)', () => {
        const t = ppeHost(PPE);
        t.host._fillPpeNameOptions();
        const vals = optionValues(t.els.wsPpeNameList.innerHTML);
        EXPECTED.forEach(function(v) {
            assertTrue(vals.indexOf(v) !== -1, 'в списке есть: ' + v);
        });
        // каждый — ровно один раз
        vals.forEach(function(v) {
            assertEqual(1, vals.filter(function(x) { return x === v; }).length,
                '«' + v + '» встречается один раз');
        });
    });

    test('регистр не различается, хранится ПЕРВОЕ написание', () => {
        const t = ppeHost(PPE);
        t.host._fillPpeNameOptions();
        const vals = optionValues(t.els.wsPpeNameList.innerHTML);
        assertTrue(vals.indexOf('Перчатки нитриловые') !== -1,
            'первое написание с большой буквы');
        assertFalse(vals.indexOf('перчатки нитриловые') !== -1,
            'дубль в другом регистре не добавлен');
        assertTrue(vals.indexOf('Куртка утеплённая') !== -1,
            'куртка — первое написание');
    });

    test('пробелы обрезаются, пустые наименования пропускаются', () => {
        const t = ppeHost(PPE);
        t.host._fillPpeNameOptions();
        const vals = optionValues(t.els.wsPpeNameList.innerHTML);
        assertTrue(vals.indexOf('Ботинки') !== -1, '«  Ботинки  » → «Ботинки»');
        assertFalse(vals.indexOf('  Ботинки  ') !== -1, 'с пробелами — нет');
        assertFalse(vals.indexOf('') !== -1, 'пустая строка не попала');
        assertFalse(vals.some(function(v) { return !v.trim() || v !== v.trim(); }),
            'все значения обрезаны');
    });

    test('сортировка по алфавиту (localeCompare \'ru\')', () => {
        const t = ppeHost(PPE);
        t.host._fillPpeNameOptions();
        const vals = optionValues(t.els.wsPpeNameList.innerHTML);
        assertEqual(JSON.stringify(EXPECTED), JSON.stringify(vals),
            'порядок алфавитный: ' + JSON.stringify(vals));
    });

    test('null-запись в _PPE не ломает метод', () => {
        const t = ppeHost([{ id: 1, наименование: 'Каска защитная' }, null]);
        t.host._fillPpeNameOptions();
        const vals = optionValues(t.els.wsPpeNameList.innerHTML);
        assertEqual(1, vals.length, 'null пропущен без ошибки');
        assertEqual('Каска защитная', vals[0]);
    });

    test('записи без поля «наименование» пропускаются', () => {
        const t = ppeHost([{ id: 1, 'таб_номер': '0871' },
                           { id: 2, наименование: 'Противогаз' }]);
        t.host._fillPpeNameOptions();
        const vals = optionValues(t.els.wsPpeNameList.innerHTML);
        assertEqual(1, vals.length);
        assertEqual('Противогаз', vals[0]);
    });
});

// ============================================================
// 4. VM — запасной набор и экранирование
// ============================================================
describe('Task 461 — VM: запасной набор + экранирование', () => {

    test('пустой лист «СИЗ» — статичный datalist НЕ тронут', () => {
        const t = ppeHost([], { datalistHtml: 'STATIC-KEEP-8' });
        t.host._fillPpeNameOptions();
        assertEqual('STATIC-KEEP-8', t.els.wsPpeNameList.innerHTML,
            'innerHTML не перезаписан (остался набор HTML)');
    });

    test('_PPE из одних пустых наименований — datalist НЕ тронут', () => {
        const t = ppeHost([{ id: 1, наименование: '' },
                           { id: 2, наименование: '  ' }],
                          { datalistHtml: 'STATIC-KEEP-8' });
        t.host._fillPpeNameOptions();
        assertEqual('STATIC-KEEP-8', t.els.wsPpeNameList.innerHTML,
            'после trim ни одного валидного имени — без перезаписи');
    });

    test('нет элемента wsPpeNameList — тихий выход', () => {
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_fillPpeNameOptions') + ',' +
            '_PPE: [{ id: 1, наименование: "Каска защитная" }],' +
            '_escAttr: function(s) { return String(s); }' +
            '});')(mockDoc({}));
        host._fillPpeNameOptions();   // не должен бросить
        assertTrue(true, 'без исключений');
    });

    test('value каждого option экранируется _escAttr', () => {
        const t = ppeHost([{ id: 1, наименование: 'Каска защитная' },
                           { id: 2, наименование: 'Очки «закрытые»' }],
            { escAttr: function(s) { return 'E(' + String(s) + ')'; } });
        t.host._fillPpeNameOptions();
        const html = t.els.wsPpeNameList.innerHTML;
        assertTrue(html.indexOf('<option value="E(Каска защитная)"></option>') !== -1,
            'значение обёрнуто _escAttr');
        assertTrue(html.indexOf('<option value="E(Очки «закрытые»)"></option>') !== -1,
            'каждое значение обёрнуто');
        assertEqual(2, (html.match(/<option value="/g) || []).length,
            'ровно два option');
    });
});

// ============================================================
// 5. VM — openPpeForm: вызов при создании и правке
// ============================================================
describe('Task 461 — VM: openPpeForm заполняет datalist', () => {

    function formHost(ppe) {
        const els = {
            wsPpeSheetTitle: mkEl(), wsPpeSubmitBtn: mkEl(),
            wsPpeTabNo: mkEl(), wsPpeTerm: mkEl(), wsPpeName: mkEl(),
            wsPpeIssued: mkEl(), wsPpeManufactured: mkEl(),
            wsPpeComment: mkEl(), wsPpeNameList: mkEl(),
            wsPpeExpiryInfo: mkEl(), wsPpeOverlay: mkEl(), wsPpeSheet: mkEl()
        };
        const EMPLOYEES = [
            { 'таб_номер': '0871', 'ФИО': 'Федосов А. В.' },
            { 'таб_номер': '0872', 'ФИО': 'Галкин Д. Н.' }
        ];
        const host = new Function('document', 'setTimeout', 'return ({' +
            methodText(INDEX_SRC, 'openPpeForm') + ',' +
            methodText(INDEX_SRC, '_fillPpeNameOptions') + ',' +
            '_canEdit: true,' +
            '_EMPLOYEES: ' + JSON.stringify(EMPLOYEES) + ',' +
            '_PPE: ' + JSON.stringify(ppe) + ',' +
            '_esc: function(s) { return String(s); },' +
            '_escAttr: function(s) { return String(s); },' +
            'onPpeFormInput: function() {}' +
            '});')(mockDoc(els), setTimeout);
        return { host: host, els: els };
    }

    const PPE = [
        { id: 1, 'таб_номер': '0871', наименование: 'Каска защитная' },
        { id: 2, 'таб_номер': '0872', наименование: 'Каска защитная' },
        { id: 3, 'таб_номер': '0871', наименование: 'Ботинки' }
    ];

    test('создание («+ СИЗ…»): datalist заполнен уникальными именами', () => {
        const t = formHost(PPE);
        t.els.wsPpeNameList.innerHTML = 'STATIC-KEEP-8';
        t.host.openPpeForm('0871');
        const vals = optionValues(t.els.wsPpeNameList.innerHTML);
        assertEqual(JSON.stringify(['Ботинки', 'Каска защитная']),
            JSON.stringify(vals),
            'сортировано, повтора каски нет: ' + JSON.stringify(vals));
    });

    test('правка (✎): datalist тоже заполняется', () => {
        const t = formHost(PPE);
        t.els.wsPpeNameList.innerHTML = 'STATIC-KEEP-8';
        t.host.openPpeForm('0871', { id: 1, 'таб_номер': '0871',
            наименование: 'Каска защитная', 'дата_выдачи': '2026-08-17',
            'дата_изготовления': '', 'срок_годности': '2 года',
            'примечание': '' });
        const vals = optionValues(t.els.wsPpeNameList.innerHTML);
        assertEqual(2, vals.length, 'правка — подсказки те же');
        assertEqual('Каска защитная', t.els.wsPpeName.value,
            'префилл наименования записи не затёрт');
    });

    test('пустой _PPE при открытии — статичный набор сохранён', () => {
        const t = formHost([]);
        t.els.wsPpeNameList.innerHTML = 'STATIC-KEEP-8';
        t.host.openPpeForm('0871');
        assertEqual('STATIC-KEEP-8', t.els.wsPpeNameList.innerHTML,
            'запасной набор из HTML не перезаписан');
    });

    test('шторка открывается: overlay/sheet активны, префилл работника', () => {
        const t = formHost(PPE);
        let overlayActive = false, sheetActive = false;
        t.els.wsPpeOverlay.classList.add = function(c) { if (c === 'active') overlayActive = true; };
        t.els.wsPpeSheet.classList.add = function(c) { if (c === 'active') sheetActive = true; };
        t.host.openPpeForm('0871');
        assertTrue(overlayActive && sheetActive, 'классы active выставлены');
        assertEqual('0871', t.els.wsPpeTabNo.value, 'работник префиллен');
    });
});

// ============================================================
// 6. SW — версия кэша
// ============================================================
describe('Task 461 — SW: версия', () => {

    test("CACHE_VERSION = 'kipia-test-v742'", () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v742'") !== -1,
            'SW поднят до kipia-test-v742 (Task 461)');
    });

    test('старая версия kipia-test-v684 отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v684') === -1,
            'в sw.js не осталось kipia-test-v684');
    });

    test('комментарий Task 461 в шапке версий sw.js', () => {
        const i = SW_SRC.indexOf('kipia-test-v742');
        // Task 463: окно 700 → 2000 — комментарий Task 463 в шапке sw.js
        // отодвинул комментарий Task 461 за границу прежнего окна.
        // Task 468: окно 2000 → 2500 — комментарий Task 468 (5 строк
        // о раскладке «Плановых мероприятий») снова отодвинул
        // комментарий Task 461 (расстояние ~2100 символов).
        // Task 470: окно 2500 → 3050 — комментарий Task 470 (4 строки
        // о таблице «Плановых мероприятий») снова отодвинул
        // комментарий Task 461 (расстояние ~2600 символов).
        // Task 471: окно 3050 → 3600 — комментарий Task 471 (9 строк о
        // кнопке годов и работах месяца) снова отодвинул комментарий
        // Task 461 (расстояние ~3200 символов)
        // Task 474: окно 3600 → 3800 — комментарий Task 474 (3 строки
        // Task 475: окно 3800 → 4600 — комментарий Task 475 (~9 строк
        // Task 476: окно 4600 → 5300 — комментарий этапа 2
        // (KipDB, ~490 симв.) отодвинул Task 461 до ~4732.
        // этапа 1 оптимизации: SWR + персистентный DATA-кэш) отодвинул
        // Task 461 до ~4300 символов.
        // о карточке прибора) снова отодвинул Task 461 (~3719 симв.)
        // Task 492: комментарий нижнего бара датчиков (~290 симв.)
        // отодвинул якорь Task 461 до ~11841 — окно 11600 → 12400.
                // Task 508: окно 16300 → 17000 — комментарий архива
        // Кабельного журнала (~160 симв.) отодвинул Task 461.
const above = SW_SRC.slice(Math.max(0, i - 17000), i);
        // Task 478: окно 5300 → 6000 — комментарий ППР-индикации
        // (~340 симв.) отодвинул Task 461 до ~5362.
        // Task 481: окно 6000 → 6800 — комментарий «ТО = только год»
        // (~258 симв.) отодвинул Task 461 до ~6122.
        assertTrue(above.indexOf('Task 461') !== -1, 'упоминание Task 461');
        assertTrue(above.indexOf('wsPpeNameList') !== -1 ||
                   above.indexOf('_fillPpeNameOptions') !== -1,
            'описание изменений задачи');
    });
});
