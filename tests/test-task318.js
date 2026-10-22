// tests/test-task318.js
// Task 318 — карточка/форма сотрудника (по заявке пользователя):
//   «1) При наведении на поле с кнопкой "Сотрудник +" фон поля не
//    должен становиться прозрачным, а менять цвет, как в ячейках
//    сотрудников под ней. 2) В форме добавления нового сотрудника
//    поле "Должность" — выпадающий список вариантов из таблицы
//    "Сотрудники" файла "табель_КИП_ИОС". 3) В карточках сотрудников
//    строку "Тип" переименовать в "Режим работы" и добавить кнопку
//    формы увольнения с записью даты увольнения в таблицу
//    "Сотрудники". 4) Уволенный убирается из графика, остаётся
//    только в архиве таблицы "Сотрудники".»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   CSS: hover заголовка «Сотрудник +» — СПЛОШНОЙ #15202f (тёмная)
//     / #e2e8ef (светлая), как у td.ws-emp-col:hover; старых
//     полупрозрачных rgba больше нет (sticky-заголовок перестал
//     «просвечивать»); строка «Уволить…» .ws-emp-dismiss — красная;
//     шторка увольнения (.ws-dismiss-emp/.ws-dismiss-info/
//     .ws-dismiss-submit).
//   HTML: «Должность» — <select id="wsEmpPosition"> (не input);
//     шторка #wsDismissSheet + #wsDismissOverlay (#wsDismissEmp,
//     #wsDismissDate, кнопки «Уволить»/«Отмена»).
//   JS: openEmployeeForm наполняет список (_fillPositionSelect —
//     listEmployees includeArchived, fallback — _EMPLOYEES);
//     _fillPositionOptions (уникальные, по алфавиту, пустая опция,
//     сохранение выбора); _renderEmpPopup — «Режим работы» +
//     «Уволить…» (только _canEdit); openDismissForm/closeDismissForm/
//     submitDismissForm/_doDismiss (дата → dismissEmployee →
//     closeEmpPopup + loadGrid(true)).
//   VM: моки DOM/API — открытие/закрытие шторки, отправка
//     payload, ошибка без даты, fallback списка должностей.
//   СЕРВЕР: WorkSchedule.gs dismissEmployee — ищет строку по
//     таб_№ (текст, Task 304), пишет H (дата) + I (в_архиве=1),
//     строка НЕ удаляется; ошибки invalid/not_found; аудит;
//     маршрут в Code.gs.
//   SW: kipia-test-v756.
//
// Запуск: через tests/run-all.js (require './test-task318.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const WS_GS = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');
const CODE_GS = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'Code.gs'), 'utf8');

// Вырезка метода WorkSchedule: «имя: function» (отступ 8) → следующий
// метод ТОГО ЖЕ уровня (как в test-task317.js).
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

// ============================================================
// 1. CSS: hover «Сотрудник +» — сплошной цвет, как у ячеек ФИО
// ============================================================
describe('Task 318 — CSS: hover заголовка «Сотрудник +»', () => {

    test('CSS: hover-правило заголовка УДАЛЕНО (Task 386: надпись)', () => {
        // Task 386: заголовок «Работники» — просто надпись; hover
        // #2a3a4c (Task 330) жил в правиле ws-emp-head-add:hover —
        // удалено вместе с кнопкой
        const m = INDEX_SRC.match(/th\.ws-emp-col\.ws-emp-head-add:hover \{\s*([^}]*)\}/);
        assertTrue(!m, 'правило hover удалено (заголовок больше не кнопка)');
    });

    test('CSS: светлая тема hover — правило УДАЛЕНО (Task 386)', () => {
        const m = INDEX_SRC.match(/\[data-theme="light"\][^{}]*ws-emp-head-add:hover\s*\{[^}]*\}/);
        assertTrue(!m, 'правило светлой темы удалено вместе с кнопкой');
    });

    test('CSS: в hover-правилах заголовка нет полупрозрачного rgba', () => {
        // rgba(74,143,199,0.16) легитимно живёт в ДРУГИХ местах (kipConfirm,
        // подсветка столбца дня Task 316) — проверяем именно правила
        // ws-emp-head-add:hover (тёмная + светлая): старый полупрозрачный
        // фон из них полностью ушла
        assertFalse(/ws-emp-head-add:hover\s*\{[^}]*rgba\(/.test(INDEX_SRC),
            'в hover-правилах ws-emp-head-add нет rgba (фон сплошной)');
        assertFalse(/\[data-theme="light"\] [^{}]*ws-emp-head-add:hover\s*\{[^}]*rgba\(/.test(INDEX_SRC),
            'в светлой теме тоже нет rgba');
    });

    test('CSS: Task 417 — td.ws-emp-col:hover удалён (попапа нет)', () => {
        // прежние цвета подсветки #15202f/#e2e8ef ушли вместе с
        // hover-правилами колонки ФИО (окно карточки удалено)
        assertFalse(INDEX_SRC.indexOf('.ws-grid tbody td.ws-emp-col:hover {') !== -1,
            'тёмная тема: hover ФИО удалён');
        assertFalse(INDEX_SRC.indexOf('[data-theme="light"] .ws-grid tbody td.ws-emp-col:hover') !== -1,
            'светлая тема: hover ФИО удалён');
    });

    test('CSS: строка «Уволить…» — красная (опасное действие)', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-popup-row.ws-emp-dismiss {') !== -1,
            'правило .ws-emp-dismiss есть');
        const m = INDEX_SRC.match(/\.ws-popup-row\.ws-emp-dismiss \{\s*([^}]*)\}/);
        assertTrue(!!m && m[1].indexOf('#ef5350') !== -1, 'красный текст');
        const ml = INDEX_SRC.match(/\[data-theme="light"\] \.ws-popup-row\.ws-emp-dismiss \{\s*([^}]*)\}/);
        assertTrue(!!ml && ml[1].indexOf('#c62828') !== -1, 'светлая — тёмно-красная');
        const mh = INDEX_SRC.match(/\.ws-popup-row\.ws-emp-dismiss:hover \{\s*([^}]*)\}/);
        assertTrue(!!mh && /rgba\(239, 83, 80/.test(mh[1]),
            'наведение — красная подложка (не синяя)');
    });

    test('CSS: шторка увольнения — ФИО/пояснение/красная кнопка', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-dismiss-emp {') !== -1 &&
                   INDEX_SRC.indexOf('.ws-dismiss-info {') !== -1,
            'стили ФИО-строки и пояснения');
        assertTrue(INDEX_SRC.indexOf('.ws-dismiss-submit {') !== -1,
            'красная кнопка «Уволить»');
        const m = INDEX_SRC.match(/\.ws-dismiss-submit \{\s*([^}]*)\}/);
        assertTrue(!!m && /#e53935/.test(m[1]), 'кнопка — сплошной красный');
    });
});

// ============================================================
// 2. HTML: select «Должность» + шторка увольнения
// ============================================================
describe('Task 318 — HTML: форма и шторка', () => {

    test('HTML: «Должность» — ВЫПАДАЮЩИЙ список (select, не input)', () => {
        assertTrue(INDEX_SRC.indexOf('<select id="wsEmpPosition" class="flow-input-field-small">') !== -1,
            'select id="wsEmpPosition"');
        assertFalse(INDEX_SRC.indexOf('<input type="text" id="wsEmpPosition"') !== -1,
            'текстовый input удалён');
    });

    test('HTML: шторка #wsDismissSheet — все поля', () => {
        const sheet = INDEX_SRC.slice(INDEX_SRC.indexOf('id="wsDismissSheet"'),
                                      INDEX_SRC.indexOf('id="wsTrOverlay"'));
        assertTrue(sheet.length > 0 && sheet.length < 2500, 'блок шторки вырезан');
        ['wsDismissEmp', 'wsDismissDate'].forEach(id => {
            assertTrue(sheet.indexOf('id="' + id + '"') !== -1, 'id="' + id + '"');
        });
        assertTrue(sheet.indexOf('Увольнение работника') !== -1, 'заголовок (Task 385: работник)');
        assertTrue(sheet.indexOf('onclick="WorkSchedule.submitDismissForm()"') !== -1,
            'кнопка «Уволить» → submitDismissForm');
        assertTrue(sheet.indexOf('onclick="WorkSchedule.closeDismissForm()"') !== -1,
            'кнопка «Отмена» → closeDismissForm');
        assertTrue(sheet.indexOf('архиве справочника') !== -1,
            'пояснение: строка остаётся в архиве');
    });

    test('HTML: оверлей шторки увольнения', () => {
        const o = INDEX_SRC.indexOf('id="wsDismissOverlay"');
        assertTrue(o !== -1, 'оверлей есть');
        const seg = INDEX_SRC.slice(o - 120, o + 200);
        assertTrue(seg.indexOf('closeDismissForm') !== -1,
            'клик по оверлею закрывает шторку');
    });
});

// ============================================================
// 3. JS: список должностей + карточка + методы увольнения
// ============================================================
describe('Task 318 — JS: список должностей из таблицы «Сотрудники»', () => {

    test('JS: openEmployeeForm наполняет select (_fillPositionSelect)', () => {
        const m = methodText(INDEX_SRC, 'openEmployeeForm');
        assertTrue(m.length > 0, 'метод есть');
        assertTrue(m.indexOf('this._fillPositionSelect()') !== -1,
            'вызов наполнения списка при открытии');
        assertFalse(m.indexOf("getElementById('wsEmpPosition').value = ''") !== -1,
            'старый сброс текстового input удалён');
    });

    test('JS: _fillPositionSelect — listEmployees includeArchived + fallback', () => {
        const m = methodText(INDEX_SRC, '_fillPositionSelect');
        assertTrue(m.length > 0, 'метод есть');
        assertTrue(m.indexOf("workSchedule.listEmployees'") !== -1 &&
                   m.indexOf('includeArchived: true') !== -1,
            'варианты — из ВСЕЙ таблицы «Сотрудники» (активные + архив)');
        assertTrue(m.indexOf('_fillPositionOptions') !== -1, 'наполнение опций');
        assertTrue(m.indexOf('.catch(') !== -1 &&
                   m.indexOf('self._EMPLOYEES') !== -1,
            'офлайн/сбой — fallback на активных _EMPLOYEES');
    });

    test('JS: _fillPositionOptions — уникальные/по алфавиту/esc/выбор', () => {
        const m = methodText(INDEX_SRC, '_fillPositionOptions');
        assertTrue(m.length > 0, 'метод есть');
        assertTrue(m.indexOf("'должность'") !== -1, 'читает поле должность');
        assertTrue(m.indexOf('localeCompare') !== -1, 'сортировка по алфавиту');
        assertTrue(m.indexOf('<option value="">— выберите —</option>') !== -1,
            'пустая опция «— выберите —»');
        assertTrue(m.indexOf('_escAttr') !== -1 && m.indexOf('_esc(') !== -1,
            'экранирование значений');
        assertTrue(m.indexOf('var keep = sel.value') !== -1 &&
                   m.indexOf('if (keep) sel.value = keep') !== -1,
            'выбранное значение сохраняется при обновлении');
    });

    test('JS: submitEmployeeForm читает select (value как раньше)', () => {
        const m = methodText(INDEX_SRC, 'submitEmployeeForm');
        assertTrue(m.indexOf("getElementById('wsEmpPosition').value.trim()") !== -1,
            'значение select читается как прежде');
    });
});

describe('Task 318 — JS: карточка — «Режим работы» + «Уволить…»', () => {

    test('JS: _renderEmpPopup — подпись «Режим работы» (было «Тип»)', () => {
        const rp = methodText(INDEX_SRC, '_renderWorkerCard');
        assertTrue(rp.indexOf("['Режим работы', tipVal]") !== -1,
            'поле называется «Режим работы»');
        assertFalse(rp.indexOf("['Тип',") !== -1, 'подпись «Тип» убрана');
    });

    test('JS: _renderEmpPopup — строка «Уволить…» (только редакторам)', () => {
        const rp = methodText(INDEX_SRC, '_renderWorkerCard');
        const i = rp.indexOf('ws-emp-dismiss');
        assertTrue(i !== -1, 'строка «Уволить…» в карточке (Task 385: страница «Работники»)');
        const seg = rp.slice(Math.max(0, i - 400), i + 400);
        // Task 396: «Уволить…» — компактная кнопка шапки (b1Acts):
        // гейт withEdit — РАНЬШЕ кнопки по тексту метода
        assertTrue(rp.lastIndexOf('if (withEdit) {', i) !== -1,
            'только с withEdit (кнопка внутри гейта сборки b1Acts)');
        assertTrue(seg.indexOf('WorkSchedule.openDismissForm(') !== -1,
            'клик → openDismissForm(таб_№)');
        assertTrue(seg.indexOf('Уволить…') !== -1, 'текст строки');
        // таб_№ передаётся параметром (не захардкожен)
        assertTrue(seg.indexOf("emp['таб_номер']") !== -1, 'таб. № из записи');
    });
});

describe('Task 318 — JS: методы увольнения', () => {

    test('JS: openDismissForm — права/поиск/дата по умолчанию', () => {
        const m = methodText(INDEX_SRC, 'openDismissForm');
        assertTrue(m.length > 0, 'метод есть');
        assertTrue(m.indexOf('if (!this._canEdit) return;') !== -1,
            'двойная защита права записи');
        assertTrue(m.indexOf("_dismissTabNo = String(emp['таб_номер'])") !== -1,
            'запоминает таб. №');
        assertTrue(m.indexOf("this._isoDate(new Date())") !== -1,
            'дата увольнения — сегодня по умолчанию');
        assertTrue(m.indexOf("'Работник не найден'") !== -1, 'не найден — тост (Task 385: работник)');
        assertTrue(m.indexOf("getElementById('wsDismissOverlay')") !== -1,
            'оверлей активируется');
        assertTrue(m.indexOf('this.closeEmpPopup()') !== -1,
            'карточка закрывается ДО шторки (z 9401 > 201 — иначе перекрывала бы)');
    });

    test('JS: closeDismissForm — сброс', () => {
        const m = methodText(INDEX_SRC, 'closeDismissForm');
        assertTrue(m.indexOf('remove') !== -1, 'снимает active');
        assertTrue(m.indexOf('this._dismissTabNo = null') !== -1,
            'сбрасывает таб. №');
    });

    test('JS: submitDismissForm — валидация + подтверждение', () => {
        const m = methodText(INDEX_SRC, 'submitDismissForm');
        assertTrue(m.indexOf("'Укажите дату увольнения'") !== -1,
            'без даты — тост');
        assertTrue(m.indexOf('kipConfirm') !== -1 && m.indexOf('danger: true') !== -1,
            'подтверждение kipConfirm (danger)');
        assertTrue(m.indexOf('архиве справочника') !== -1,
            'текст поясняет архив');
        assertTrue(m.indexOf('_doDismiss(tabNo, date)') !== -1,
            'подтверждение → _doDismiss');
    });

    test('JS: _doDismiss — dismissEmployee + перезагрузка шахматки', () => {
        const m = methodText(INDEX_SRC, '_doDismiss');
        assertTrue(m.indexOf("workSchedule.dismissEmployee'") !== -1,
            'API workSchedule.dismissEmployee');
        assertTrue(m.indexOf("'таб_номер': tabNo") !== -1 &&
                   m.indexOf("'дата_увольнения': date") !== -1,
            'payload: таб_номер + дата_увольнения');
        assertTrue(m.indexOf('closeDismissForm()') !== -1 &&
                   m.indexOf('closeEmpPopup()') !== -1,
            'закрывает шторку И карточку');
        assertTrue(m.indexOf('loadGrid(true)') !== -1,
            'перезагружает шахматку — строка уходит из графика');
        assertTrue(m.indexOf('_apiErrText') !== -1, 'ошибка сервера — тост');
    });

    test('JS: состояние _dismissTabNo объявлено', () => {
        assertTrue(INDEX_SRC.indexOf('_dismissTabNo: null,') !== -1,
            'инициализация в объекте WorkSchedule');
    });
});

// ============================================================
// 4. VM: моки DOM/API — поведение форм
// ============================================================
describe('Task 318 — VM: формы на моках', () => {

    function mkSel() {
        // Task 354 (flake-fix по прецеденту Task 325): focus() нужен —
        // извлечённые из index.html методы ставят setTimeout(() => f.focus());
        // в полностью синхронном прогоне таймер не успевал сработать, но
        // async-тесты (Task 354) дают циклу событий ход — и блуждающий
        // таймер падал на моке без focus, убивая весь прогон.
        return { innerHTML: '', _value: '', focus: function () {},
                 get value() { return this._value; },
                 set value(v) {
                     const ok = this.innerHTML.indexOf('value="' + v + '"') !== -1 || v === '';
                     this._value = ok ? v : '';
                 } };
    }

    function mkDoc() {
        const sel = mkSel();
        const empDiv = { textContent: '', focus: function () {} };
        const dateInput = { value: '', focus: function () {} };
        const overlay = { classList: { _s: new Set(),
            add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); } } };
        const sheet = { classList: overlay.classList };
        return {
            getElementById: id => (id === 'wsEmpPosition' ? sel :
                                   id === 'wsDismissEmp' ? empDiv :
                                   id === 'wsDismissDate' ? dateInput :
                                   id === 'wsDismissOverlay' ? overlay :
                                   id === 'wsDismissSheet' ? sheet : null),
            _sel: sel, _empDiv: empDiv, _date: dateInput,
            _overlay: overlay, _sheet: sheet
        };
    }

    function mkCtx(doc, opts) {
        opts = opts || {};
        const names = ['_fillPositionOptions', 'openDismissForm',
                       'closeDismissForm', 'submitDismissForm', '_doDismiss'];
        const texts = names.map(n => methodText(INDEX_SRC, n));
        const make = new Function('document', 'KipToast', 'kipConfirm', 'confirm',
            'return ({' + texts.join('\n') + '\n});');
        const toasts = [];
        const ctx = make(doc,
            { show: (m) => toasts.push(m) },
            opts.kipConfirmFn || function(msg, o) { return Promise.resolve(true); },
            opts.confirmFn || function() { return true; });
        ctx._toasts = toasts;
        ctx._canEdit = true;
        ctx._EMPLOYEES = opts.employees || [
            { 'таб_номер': '017', 'ФИО': 'Иванов И.И.', 'должность': 'Слесарь по КИПиА' },
            { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'должность': 'Инженер' },
            { 'таб_номер': '042', 'ФИО': 'Петров П.П.', 'должность': 'Слесарь по КИПиА' }
        ];
        ctx._dismissTabNo = null;
        ctx._escAttr = s => String(s).replace(/"/g, '&quot;');
        ctx._esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
        ctx._isoDate = d => d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
        ctx._fmtDateRu = s => String(s).slice(8, 10) + '.' + String(s).slice(5, 7) + '.' + String(s).slice(0, 4);
        ctx._apiErrText = e => (e && e.message) || String(e);
        const calls = [];
        ctx._api = (action, payload) => {
            calls.push({ action: action, payload: payload });
            return (opts.apiFail
                ? Promise.reject(new Error(opts.apiFail))
                : Promise.resolve({ ok: true, data: {} }));
        };
        ctx._apiCalls = calls;
        ctx.closeEmpPopup = () => { calls.push({ action: '_closeEmpPopup' }); };
        ctx.loadGrid = f => { calls.push({ action: '_loadGrid', flag: f }); };
        return ctx;
    }

    test('VM: _fillPositionOptions — уникальные по алфавиту + пустая опция', () => {
        const doc = mkDoc();
        const ctx = mkCtx(doc);
        ctx._fillPositionOptions(doc._sel, [
            { 'должность': 'Инженер' },
            { 'должность': 'Слесарь по КИПиА' },
            { 'должность': 'Слесарь по КИПиА' },
            { 'должность': '' },
            { 'должность': '  Электрик  ' }
        ]);
        const opts = doc._sel.innerHTML.match(/<option value="[^"]*">[^<]*<\/option>/g) || [];
        assertEqual(opts.length, 4, 'пустая + 3 уникальных (дубли/пустые убраны)');
        assertTrue(opts[0].indexOf('— выберите —') !== -1, 'первая — пустая');
        assertTrue(doc._sel.innerHTML.indexOf('Электрик') !== -1 &&
                   doc._sel.innerHTML.indexOf('Слесарь по КИПиА') !== -1,
            'trim: пробелы сняты');
        // сортировка по алфавиту (ru, localeCompare): И < С < Э
        const iIng = doc._sel.innerHTML.indexOf('>Инженер<');
        const iElt = doc._sel.innerHTML.indexOf('>Электрик<');
        const iSles = doc._sel.innerHTML.indexOf('>Слесарь по КИПиА<');
        assertTrue(iIng !== -1 && iElt !== -1 && iSles !== -1, 'все три есть');
        assertTrue(iIng < iSles && iSles < iElt,
            'порядок по алфавиту: Инженер → Слесарь → Электрик (Э — последняя)');
    });

    test('VM: openDismissForm — сотрудник найден, дата сегодня', () => {
        const doc = mkDoc();
        const ctx = mkCtx(doc);
        ctx.openDismissForm('2706');
        assertEqual(ctx._dismissTabNo, '2706', 'таб. № запомнен');
        assertEqual(doc._empDiv.textContent, 'Галкин Д. Н. · таб. №2706',
            'ФИО · таб. № в шторке');
        assertEqual(doc._date.value, ctx._isoDate(new Date()), 'дата — сегодня');
        assertTrue(doc._overlay.classList.contains('active') &&
                   doc._sheet.classList.contains('active'), 'шторка открыта');
        assertTrue(ctx._apiCalls.some(c => c.action === '_closeEmpPopup'),
            'карточка сотрудника закрыта (не перекрывает шторку)');
    });

    test('VM: openDismissForm — не найден → тост, шторка закрыта', () => {
        const doc = mkDoc();
        const ctx = mkCtx(doc);
        ctx.openDismissForm('999');
        assertEqual(ctx._dismissTabNo, null, 'таб. № не ставится');
        assertEqual(ctx._toasts.length, 1, 'один тост');
        assertTrue(ctx._toasts[0].indexOf('не найден') !== -1, 'текст тоста');
        assertFalse(doc._overlay.classList.contains('active'), 'шторка не открыта');
    });

    test('VM: openDismissForm — зритель (без права) — мимо', () => {
        const doc = mkDoc();
        const ctx = mkCtx(doc);
        ctx._canEdit = false;
        ctx.openDismissForm('017');
        assertFalse(doc._overlay.classList.contains('active'),
            'шторка НЕ открыта без права записи');
    });

    test('VM: submitDismissForm — без даты тост, API не зовётся', () => {
        const doc = mkDoc();
        const ctx = mkCtx(doc);
        ctx.openDismissForm('017');
        doc._date.value = '';
        ctx.submitDismissForm();
        assertEqual(ctx._toasts.length, 1, 'тост «Укажите дату…»');
        assertEqual(ctx._apiCalls.filter(c => c.action === 'workSchedule.dismissEmployee').length, 0,
            'сервер не звался');
    });

    test('VM: submitDismissForm → _doDismiss — payload и перезагрузка', () => {
        const doc = mkDoc();
        const ctx = mkCtx(doc);
        ctx.openDismissForm('017');
        doc._date.value = '2026-09-05';
        ctx.submitDismissForm();
        // kipConfirm резолвится промисом — обработаем микротаски
        return Promise.resolve().then(() => Promise.resolve()).then(() => {
            const api = ctx._apiCalls.filter(c => c.action === 'workSchedule.dismissEmployee');
            assertEqual(api.length, 1, 'один вызов API');
            assertEqual(api[0].payload['таб_номер'], '017', 'таб. № в payload');
            assertEqual(api[0].payload['дата_увольнения'], '2026-09-05', 'дата в payload');
            assertTrue(ctx._apiCalls.some(c => c.action === '_closeEmpPopup'),
                'карточка закрыта');
            assertTrue(ctx._apiCalls.some(c => c.action === '_loadGrid' && c.flag === true),
                'loadGrid(true) — строка уходит из шахматки');
            assertEqual(ctx._dismissTabNo, null, 'состояние сброшено');
            assertFalse(doc._overlay.classList.contains('active'), 'шторка закрыта');
            assertTrue(ctx._toasts.some(t => t.indexOf('уволен') !== -1),
                'тост «Сотрудник уволен…»');
        });
    });

    test('VM: _doDismiss — ошибка сервера → тост, шторка жива', () => {
        const doc = mkDoc();
        const ctx = mkCtx(doc, { apiFail: 'Unknown action' });
        ctx.openDismissForm('017');
        doc._date.value = '2026-09-05';
        ctx._doDismiss('017', '2026-09-05');
        return Promise.resolve().then(() => Promise.resolve()).then(() => {
            assertTrue(ctx._toasts.some(t => t.indexOf('Ошибка') !== -1),
                'тост ошибки с текстом сервера');
            assertTrue(ctx._toasts.some(t => t.indexOf('Unknown action') !== -1),
                'текст сервера прокинут (_apiErrText)');
            assertTrue(doc._overlay.classList.contains('active'),
                'шторка осталась открытой (ошибка)');
            assertEqual(ctx._dismissTabNo, '017', 'таб. № не сброшен');
        });
    });

    test('VM: kipConfirm отклонён — API не зовётся', () => {
        const doc = mkDoc();
        const ctx = mkCtx(doc, { kipConfirmFn: () => Promise.resolve(false) });
        ctx.openDismissForm('017');
        doc._date.value = '2026-09-05';
        ctx.submitDismissForm();
        return Promise.resolve().then(() => Promise.resolve()).then(() => {
            assertEqual(ctx._apiCalls.filter(c => c.action === 'workSchedule.dismissEmployee').length, 0,
                'отмена — сервер не звался');
            assertTrue(doc._sheet.classList.contains('active'),
                'шторка осталась (можно передумать)');
        });
    });
});

// ============================================================
// 5. Сервер: WorkSchedule.gs dismissEmployee + маршрут Code.gs
// ============================================================
describe('Task 318 — Сервер: dismissEmployee (WorkSchedule.gs)', () => {

    class MockSheet {
        constructor(rows) { this.rows = rows || []; }
        getLastRow() { return this.rows.length; }
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
                setValue(v) { self.rows[row - 1][col - 1] = v; }
            };
        }
        deleteRow(r) { this.rows.splice(r - 1, 1); }
    }

    const MOCK_UTILS = {
        findSessionByToken: () => ({ user_id: 1 }),
        findUserById: () => ({ role: 'Админ', email: 'test@example.com' }),
        audit: () => {}
    };

    function loadWS(sheets) {
        const ss = { getSheetByName: (n) => sheets[n] || null };
        const SpreadsheetApp = { openById: () => ss };
        const factory = new Function('SpreadsheetApp', 'Utils', WS_GS + '\nreturn WorkSchedule;');
        return factory(SpreadsheetApp, MOCK_UTILS);
    }

    function empSheets() {
        return {
            'Сотрудники': new MockSheet([
                ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон', 'старт_цикла', 'приём', 'увольнение', 'архив', 'должность', 'комментарий'],
                ['017', 'Иванов И.И.', 'сменный', 1, 1, new Date(2026, 0, 1), new Date(2025, 5, 1), '', 0, 'Слесарь по КИПиА', ''],
                ['2706', 'Галкин Д. Н.', 'дневной', '', 2, new Date(2026, 0, 10), new Date(2024, 2, 15), '', 0, 'Инженер', '']
            ])
        };
    }

    test('Сервер: метод dismissEmployee есть в WorkSchedule.gs', () => {
        assertTrue(WS_GS.indexOf('dismissEmployee: function(payload)') !== -1,
            'функция объявлена');
        assertTrue(WS_GS.indexOf('workSchedule.dismissEmployee') !== -1,
            'упомянута в шапке эндпоинтов');
    });

    test('Сервер: dismissEmployee — пишет H (дата) + I (в_архиве=1)', () => {
        const sheets = empSheets();
        const WS = loadWS(sheets);
        const r = WS.dismissEmployee({ token: 't', 'таб_номер': '2706',
                                       'дата_увольнения': '2026-09-05' });
        assertTrue(r.ok, 'успех');
        assertEqual(r.data['в_архиве'], 1, 'в ответе в_архиве=1');
        const row = sheets['Сотрудники'].rows[2];   // Галкин — строка 3
        assertEqual(row[7].getTime ? row[7].getTime() : row[7],
            new Date(2026, 8, 5).getTime(), 'H = дата_увольнения 05.09.2026');
        assertEqual(row[8], 1, 'I = в_архиве 1');
        assertEqual(row[0], '2706', 'строка НЕ удалялась — таб. № на месте');
        assertEqual(row[1], 'Галкин Д. Н.', 'ФИО на месте (архив)');
        // второй сотрудник не тронут
        const row1 = sheets['Сотрудники'].rows[1];
        assertEqual(row1[8], 0, 'Иванов (др. строка) — в_архиве 0');
        assertEqual(row1[7], '', 'Иванов — дата пустая');
    });

    test('Сервер: после dismiss listEmployees скрывает строку (архив)', () => {
        const sheets = empSheets();
        const WS = loadWS(sheets);
        WS.dismissEmployee({ token: 't', 'таб_номер': '2706',
                             'дата_увольнения': '2026-09-05' });
        const active = WS.listEmployees({ token: 't', includeArchived: false });
        assertEqual(active.data.employees.length, 1, 'активный список — 1 (уволенный скрыт)');
        assertEqual(active.data.employees[0]['таб_номер'], '017', 'остался Иванов');
        const all = WS.listEmployees({ token: 't', includeArchived: true });
        assertEqual(all.data.employees.length, 2, 'вся таблица — 2 (архив жив)');
        const dismissed = all.data.employees.filter(e => e['таб_номер'] === '2706')[0];
        assertEqual(dismissed['дата_увольнения'], '2026-09-05',
            'дата увольнения читается из таблицы');
        assertEqual(dismissed['в_архиве'], 1, 'в_архиве=1');
    });

    test('Сервер: dismissEmployee — не найден / нет даты / нет таб', () => {
        const WS = loadWS(empSheets());
        const r404 = WS.dismissEmployee({ token: 't', 'таб_номер': '999',
                                          'дата_увольнения': '2026-09-05' });
        assertFalse(r404.ok, 'не найден — не ok');
        assertEqual(r404.error, 'not_found_таб_номер', 'код ошибки');
        const rDate = WS.dismissEmployee({ token: 't', 'таб_номер': '017',
                                           'дата_увольнения': '05.09.2026' });
        assertFalse(rDate.ok, 'кривая дата — не ok');
        assertEqual(rDate.error, 'invalid_дата_увольнения', 'код ошибки даты');
        const rTab = WS.dismissEmployee({ token: 't', 'таб_номер': '' });
        assertFalse(rTab.ok && true, 'пустой таб — не ok');
        assertEqual(rTab.error, 'invalid_таб_номер', 'код ошибки таб');
    });

    test('Сервер: повторное увольнение — дата перезаписывается', () => {
        const sheets = empSheets();
        const WS = loadWS(sheets);
        WS.dismissEmployee({ token: 't', 'таб_номер': '017',
                             'дата_увольнения': '2026-09-01' });
        const r = WS.dismissEmployee({ token: 't', 'таб_номер': '017',
                                       'дата_увольнения': '2026-09-15' });
        assertTrue(r.ok, 'повторное — ok (правка даты)');
        const all = WS.listEmployees({ token: 't', includeArchived: true });
        assertEqual(all.data.employees[0]['дата_увольнения'], '2026-09-15',
            'дата перезаписана');
    });

    test('Сервер: маршрут в Code.gs', () => {
        assertTrue(CODE_GS.indexOf("case 'workSchedule.dismissEmployee':") !== -1,
            'case объявлен');
        assertTrue(CODE_GS.indexOf('WorkSchedule.dismissEmployee(payload)') !== -1,
            'вызов метода');
        // маршрут — после addEmployee (рядом с CRUD сотрудников)
        const iAdd = CODE_GS.indexOf("case 'workSchedule.addEmployee':");
        const iDis = CODE_GS.indexOf("case 'workSchedule.dismissEmployee':");
        assertTrue(iAdd !== -1 && iDis !== -1 && iDis > iAdd,
            'маршрут рядом с addEmployee');
    });

    test('Сервер: шапка листа — колонки H/I документированы', () => {
        assertTrue(WS_GS.indexOf('H: дата_увольнения') !== -1,
            'H: дата_увольнения');
        assertTrue(WS_GS.indexOf('I: в_архиве') !== -1, 'I: в_архиве');
    });
});

// ============================================================
// Service Worker
// ============================================================
describe('Task 318 — Service Worker', () => {
    test('SW: версия кэша kipia-test-v756', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v756') !== -1,
            'CACHE_VERSION = kipia-test-v756 (Task 318)');
        assertFalse(SW_SRC.indexOf('kipia-test-v757') !== -1,
            'лишний инкремент не делался');
    });
});
