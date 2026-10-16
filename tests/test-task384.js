// tests/test-task384.js
// Task 384 — заявка пользователя: «В Табеле учёта рабочего времени,
// в карточках сотрудников добавь функционал редактирования данных
// сотрудника, отпусков и мероприятий по отдельности, с возможностью
// добавления и удаления информации, по которой будет строиться
// шахматка табеля на месяц и на год».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   HTML: id заголовков/кнопок шторок (wsEmpSheetTitle/wsEmpSubmitBtn/
//   wsVacSheetTitle/wsVacSubmitBtn — Task 309-паттерн режимов правки).
//   КАРТОЧКА (_renderEmpPopup): «Правка данных…» (редакторам,
//   openEmpEditForm), ✎/✕ у периодов отпусков (editVacation/
//   deleteVacation, только записи с id), «+ Мероприятие…»
//   (onEmpAddTraining) — профиль/отпуска/мероприятия правятся
//   ПО ОТДЕЛЬНОСТИ.
//   Шторки: режимы «Новый …»/«Правка …» (заголовок+кнопка), таб. №
//   readonly в правке (PK), openEmployeeForm сбрасывает режим,
//   closeEmployeeForm/closeVacationForm сбрасывают состояние.
//   submitEmployeeForm/submitVacationForm: ветки updateEmployee/
//   updateVacation (id/таб. № из состояния), ошибки не закрывают
//   шторку.
//   Исключения «самой строки» в правке отпуска: подбор «части»
//   сохраняет выбранную, пересечения/лимит года не считают себя.
//   СЕРВЕР (справочные копии scripts/*.gs): updateEmployee
//   (B..G+J..K, A/H/I не трогаются), updateVacation (B..F по id,
//   проверки исключают саму строку, B — текст Task 304), Code.gs
//   диспетчеризация, node --check обоих .gs.
//   VM-функционально (клиент и сервер): happy-path правок, валидации,
//   самопересечение/дубль части, лимит 42, не найдено.
//   SW: kipia-test-v747 (guard v613).
//
// Запуск: через tests/run-all.js (require './test-task384.js').

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');
const CODE_GS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'Code.gs'), 'utf8');

// Извлечение метода объекта (баланс фигурных скобок) — паттерн
// test-task310.js
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
    return m || '';
}

// ============================================================
// 1. HTML: id заголовков и кнопок шторок
// ============================================================
describe('Task 384 — HTML: шторки с режимами правки', () => {

    test('id заголовка и кнопки шторки работника', () => {
        assertTrue(INDEX_SRC.indexOf('id="wsEmpSheetTitle">Новый работник<') !== -1,
            'заголовок #wsEmpSheetTitle (Task 385: работник)');
        assertTrue(INDEX_SRC.indexOf('id="wsEmpSubmitBtn" onclick="WorkSchedule.submitEmployeeForm()"') !== -1,
            'кнопка #wsEmpSubmitBtn');
    });

    test('id заголовка и кнопки шторки отпуска', () => {
        assertTrue(INDEX_SRC.indexOf('id="wsVacSheetTitle">Новый отпуск<') !== -1,
            'заголовок #wsVacSheetTitle');
        assertTrue(INDEX_SRC.indexOf('id="wsVacSubmitBtn" onclick="WorkSchedule.submitVacationForm()"') !== -1,
            'кнопка #wsVacSubmitBtn');
    });

    test('комментарий карточки: удаление попапа по Task 417', () => {
        // Task 417: попап удалён — старый HTML-комментарий заменён
        // маркером удаления; подробные данные — карты «Работники»
        const i = INDEX_SRC.indexOf('<!-- Task 417 (заявка): ПОПАП КАРТОЧКИ ПО ФАМИЛИИ');
        assertTrue(i !== -1, 'HTML-маркер удаления попапа найден');
        const chunk = INDEX_SRC.slice(i, i + 1600);
        assertTrue(chunk.indexOf('КАРТАХ работников') !== -1,
            'подробные данные — в картах работников');
        assertTrue(chunk.indexOf('«Работники»') !== -1,
            'страница «Работники» — единственное место карточек');
    });
});

// ============================================================
// 2. JS (SRC): карточка сотрудника — три блока правки
// ============================================================
describe('Task 384 — карточка: правка по отдельности', () => {

    test('профиль: строка «Правка данных…» (редакторам)', () => {
        // Task 385: тело карточки — _renderWorkerCard (страница
        // «Работники», withEdit=true; попап шахматки — false)
        const fn = methodText(INDEX_SRC, '_renderWorkerCard');
        assertTrue(fn.indexOf('ws-emp-editdata') !== -1, 'класс-маркер ws-emp-editdata');
        assertTrue(fn.indexOf('Правка данных…</div>') !== -1, 'текст строки');
        assertTrue(fn.indexOf("WorkSchedule.openEmpEditForm(\\'") !== -1,
            'клик → openEmpEditForm(таб. №) с экранированием');
        // перед «Уволить…» — профиль правится отдельно от увольнения
        const iEdit = fn.indexOf('ws-emp-editdata');
        const iDismiss = fn.indexOf('ws-emp-dismiss');
        assertTrue(iEdit !== -1 && iDismiss !== -1 && iEdit < iDismiss,
            '«Правка данных…» выше «Уволить…»');
    });

    test('отпуска: ✎/✕ у периодов (редакторам, только с id)', () => {
        const fn = methodText(INDEX_SRC, '_renderWorkerCard');
        assertTrue(fn.indexOf('WorkSchedule.editVacation(') !== -1, '✎ → editVacation(id)');
        assertTrue(fn.indexOf('WorkSchedule.deleteVacation(') !== -1, '✕ → deleteVacation(id)');
        assertTrue(fn.indexOf('if (withEdit && vId)') !== -1,
            'кнопки только с withEdit (страница «Работники») и записям с id');
        assertTrue(fn.indexOf("title=\"Редактировать период\"") !== -1, 'тултип правки');
        assertTrue(fn.indexOf("title=\"Удалить период\"") !== -1, 'тултип удаления');
    });

    test('мероприятия: строка «+ Мероприятие…» (редакторам)', () => {
        const fn = methodText(INDEX_SRC, '_renderWorkerCard');
        assertTrue(fn.indexOf('ws-emp-addtr') !== -1, 'класс-маркер ws-emp-addtr');
        assertTrue(fn.indexOf('+ Мероприятие…</div>') !== -1, 'текст строки');
        assertTrue(fn.indexOf("WorkSchedule.onEmpAddTraining(\\'") !== -1,
            'клик → onEmpAddTraining(таб. №)');
    });
});

// ============================================================
// 3. JS (SRC): состояние и режимы шторок
// ============================================================
describe('Task 384 — состояние и режимы шторок', () => {

    test('state-переменные _empEditTab/_vacEditId', () => {
        assertTrue(INDEX_SRC.indexOf('_empEditTab: null,') !== -1, '_empEditTab объявлен');
        assertTrue(INDEX_SRC.indexOf('_vacEditId: null,') !== -1, '_vacEditId объявлен');
        const i = INDEX_SRC.indexOf('_empEditTab: null,');
        const before = INDEX_SRC.slice(i - 700, i);
        assertTrue(before.indexOf('Task 384') !== -1, 'комментарий Task 384 у состояния');
    });

    test('openEmpEditForm: таб. № readonly (PK) + префилл + закрытие карточки', () => {
        const fn = methodText(INDEX_SRC, 'openEmpEditForm');
        assertTrue(fn !== '', 'метод найден');
        assertTrue(fn.indexOf(".readOnly = true;") !== -1, 'таб. № — readonly');
        assertTrue(fn.indexOf('this.closeEmpPopup();') !== -1, 'карточка закрывается до шторки');
        assertTrue(fn.indexOf('this._fillPositionSelect();') !== -1, 'должность — список Task 318');
        assertTrue(fn.indexOf("'Правка работника'") !== -1, 'заголовок режима правки (Task 385: работник)');
        assertTrue(fn.indexOf("'Сохранить'") !== -1, 'кнопка «Сохранить»');
        assertTrue(fn.indexOf('this._empEditTab = String(emp[\'таб_номер\']);') !== -1,
            'запоминает таб. № редактируемого');
    });

    test('openEmployeeForm: сброс режима правки при создании', () => {
        const fn = methodText(INDEX_SRC, 'openEmployeeForm');
        assertTrue(fn.indexOf('this._empEditTab = null;') !== -1, 'сброс _empEditTab');
        assertTrue(fn.indexOf(".readOnly = false;") !== -1, 'таб. № снова вводится');
        assertTrue(fn.indexOf("'Новый работник'") !== -1, 'заголовок создания (Task 385: работник)');
        assertTrue(fn.indexOf("'Добавить'") !== -1, 'кнопка «Добавить»');
    });

    test('closeEmployeeForm/closeVacationForm: сброс режима', () => {
        const ce = methodText(INDEX_SRC, 'closeEmployeeForm');
        assertTrue(ce.indexOf('this._empEditTab = null;') !== -1, 'closeEmployeeForm сбрасывает');
        const cv = methodText(INDEX_SRC, 'closeVacationForm');
        assertTrue(cv.indexOf('this._vacEditId = null;') !== -1, 'closeVacationForm сбрасывает');
    });

    test('submitEmployeeForm: ветка updateEmployee', () => {
        const fn = methodText(INDEX_SRC, 'submitEmployeeForm');
        assertTrue(fn.indexOf("if (this._empEditTab) {") !== -1, 'ветка режима правки');
        assertTrue(fn.indexOf("'workSchedule.updateEmployee'") !== -1, 'эндпоинт updateEmployee');
        assertTrue(fn.indexOf("'таб_номер': editTab,") !== -1, 'таб. № из _empEditTab (PK)');
        assertTrue(fn.indexOf("'Данные работника обновлены'") !== -1, 'тост успеха (Task 385: работник)');
        // шторка закрывается ТОЛЬКО при успехе (catch без closeEmployeeForm)
        const iOk = fn.indexOf("self.closeEmployeeForm();");
        const iCatch = fn.indexOf("}).catch(function(err) {");
        assertTrue(iOk !== -1 && iCatch !== -1 && iOk < iCatch,
            'закрытие в then, не в catch');
    });

    test('submitVacationForm: ветка updateVacation с id', () => {
        const fn = methodText(INDEX_SRC, 'submitVacationForm');
        assertTrue(fn.indexOf("if (this._vacEditId) {") !== -1, 'ветка режима правки');
        assertTrue(fn.indexOf("'workSchedule.updateVacation'") !== -1, 'эндпоинт updateVacation');
        assertTrue(fn.indexOf('id: editVacId,') !== -1, 'id периода в payload');
        assertTrue(fn.indexOf("'Период отпуска обновлён.") !== -1, 'тост успеха');
    });

    test('editVacation: поиск по id, попапы закрываются, форма с записью', () => {
        const fn = methodText(INDEX_SRC, 'editVacation');
        assertTrue(fn !== '', 'метод найден');
        assertTrue(fn.indexOf('(this._VACATIONS || [])') !== -1, 'поиск в _VACATIONS');
        assertTrue(fn.indexOf('this.closeCellPopup();') !== -1, 'попап ячейки закрывается');
        assertTrue(fn.indexOf('this.closeEmpPopup();') !== -1, 'карточка закрывается');
        assertTrue(fn.indexOf("this.openVacationForm(rec['таб_номер'], rec);") !== -1,
            'форма открывается с записью (2-й аргумент)');
        assertTrue(fn.indexOf('Период отпуска не найден') !== -1, 'тост «не найден»');
    });

    test('openVacationForm: два режима (создание/правка)', () => {
        const fn = methodText(INDEX_SRC, 'openVacationForm');
        assertTrue(fn.indexOf('openVacationForm: function(tabNo, editVacation)') !== -1,
            'сигнатура с editVacation');
        assertTrue(fn.indexOf('this._vacEditId = parseInt(editVacation.id, 10);') !== -1,
            'id хранится в _vacEditId');
        assertTrue(fn.indexOf("'Правка отпуска'") !== -1, 'заголовок правки');
        assertTrue(fn.indexOf("'Новый отпуск'") !== -1, 'заголовок создания');
        assertTrue(fn.indexOf("'Сохранить'") !== -1, 'кнопка «Сохранить»');
        assertTrue(fn.indexOf("'Добавить'") !== -1, 'кнопка «Добавить»');
    });

    test('onEmpAddTraining: карточка → форма с префиллом', () => {
        const fn = methodText(INDEX_SRC, 'onEmpAddTraining');
        assertTrue(fn !== '', 'метод найден');
        assertTrue(fn.indexOf('this.closeEmpPopup();') !== -1, 'карточка закрывается');
        assertTrue(
            fn.indexOf("this.openTrainingForm(tabNo, null, null, 'обучение');") !== -1,
            'форма с сотрудником и типом «обучение» (Task 405: кнопка блока'
            + ' «Мероприятия» — дефолт типа из новой таблицы)');
    });

    test('deleteVacation: попапы закрываются до подтверждения', () => {
        const fn = methodText(INDEX_SRC, 'deleteVacation');
        assertTrue(fn.indexOf('this.closeCellPopup();') !== -1, 'попап ячейки');
        assertTrue(fn.indexOf('this.closeEmpPopup();') !== -1, 'карточка сотрудника');
    });
});

// ============================================================
// 4. JS (SRC): исключения «самой строки» в правке отпуска
// ============================================================
describe('Task 384 — исключения самой строки (правка отпуска)', () => {

    test('onVacEmployeeChange: себя не считает + выбранная часть сохраняется', () => {
        const fn = methodText(INDEX_SRC, 'onVacEmployeeChange');
        assertTrue(fn.indexOf('if (this._vacEditId && parseInt(v.id, 10) === this._vacEditId) continue;') !== -1,
            'своя строка исключена из занятых частей');
        assertTrue(fn.indexOf('if (this._vacEditId && cur >= 1 && cur <= 3 && !used[cur])') !== -1,
            'выбранная часть сохраняется, если свободна');
    });

    test('_vacUpdateYearInfo: себя не считает в «запланировано»', () => {
        const fn = methodText(INDEX_SRC, '_vacUpdateYearInfo');
        assertTrue(fn.indexOf('if (this._vacEditId && parseInt(v.id, 10) === this._vacEditId) continue;') !== -1,
            'своя строка исключена из used');
    });

    test('submitVacationForm: самопересечение и лимит без себя', () => {
        const fn = methodText(INDEX_SRC, 'submitVacationForm');
        // пересечение
        const iOv = fn.indexOf('пересечение с САМОЙ СОБОЙ');
        assertTrue(iOv !== -1, 'комментарий самопересечения');
        // лимит
        const iLim = fn.indexOf('своя строка не в счёт лимита');
        assertTrue(iLim !== -1, 'комментарий лимита');
        // оба guard-а внутри submitVacationForm реально пропускают
        // свою строку (пересечение + лимит; третье исключение — в
        // onVacEmployeeChange/_vacUpdateYearInfo, отдельные методы)
        const guards = fn.match(/if \(this\._vacEditId && parseInt\((v|lv)\.id, 10\) === this\._vacEditId\) continue;/g) || [];
        assertEqual(guards.length, 2, '2 исключения в submit: пересечение + лимит');
    });

    test('докблок модуля: новые эндпоинты описаны', () => {
        assertTrue(INDEX_SRC.indexOf('workSchedule.updateEmployee      — правка данных сотрудника') !== -1,
            'updateEmployee в докблоке');
        assertTrue(INDEX_SRC.indexOf('workSchedule.updateVacation      — правка периода отпуска') !== -1,
            'updateVacation в докблоке');
    });
});

// ============================================================
// 5. Сервер (справочные копии scripts/*.gs)
// ============================================================
describe('Task 384 — сервер: WorkSchedule.gs (SRC)', () => {

    test('updateEmployee: валидации входа', () => {
        const fn = methodText(WS_GS_SRC, 'updateEmployee');
        assertTrue(fn !== '', 'эндпоинт найден');
        assertTrue(fn.indexOf("error: 'invalid_таб_номер'") !== -1, 'invalid_таб_номер');
        assertTrue(fn.indexOf("error: 'invalid_ФИО'") !== -1, 'invalid_ФИО');
        assertTrue(fn.indexOf("error: 'invalid_тип'") !== -1, 'invalid_тип');
        assertTrue(fn.indexOf("error: 'not_found_таб_номер'") !== -1, 'not_found_таб_номер');
    });

    test('updateEmployee: пишет B..G и J..K, A/H/I не трогает', () => {
        const fn = methodText(WS_GS_SRC, 'updateEmployee');
        assertTrue(fn.indexOf('sheet.getRange(row, 2, 1, 6).setValues') !== -1,
            'B..G одним блоком (ФИО..дата_приёма)');
        // Task 403 (баг комментария): должность/комментарий — по
        // заголовкам, каждый в свой столбец (фолбэк J..K)
        // Task 489-adapt: столбцы — из карты _employeesColMap
        assertTrue(fn.indexOf("sheet.getRange(row, cols['должность'] + 1).setValue(position);") !== -1 &&
                   fn.indexOf("sheet.getRange(row, cols['комментарий'] + 1).setValue(comment);") !== -1,
            'должность/комментарий — отдельные setValue по заголовкам (карта)');
        // A (таб_№), H (увольнение), I (архив) — одиночных записей нет
        assertFalse(/getRange\(row, (1|8|9)[,)]/.test(fn),
            'A/H/I не перезаписываются (PK/увольнение/архив)');
        assertTrue(fn.indexOf('WORKSCHEDULE_UPDATE_EMPLOYEE') !== -1, 'аудит');
    });

    test('updateVacation: валидации входа', () => {
        const fn = methodText(WS_GS_SRC, 'updateVacation');
        assertTrue(fn !== '', 'эндпоинт найден');
        assertTrue(fn.indexOf("error: 'invalid_id'") !== -1, 'invalid_id');
        assertTrue(fn.indexOf("error: 'invalid_часть'") !== -1, 'invalid_часть');
        assertTrue(fn.indexOf("error: 'end_before_start'") !== -1, 'end_before_start');
        assertTrue(fn.indexOf("error: 'overlap'") !== -1, 'overlap');
        assertTrue(fn.indexOf("error: 'duplicate_часть'") !== -1, 'duplicate_часть');
        assertTrue(fn.indexOf("error: 'not_found'") !== -1, 'not_found');
    });

    test('updateVacation: исключает саму строку из проверок', () => {
        const fn = methodText(WS_GS_SRC, 'updateVacation');
        assertTrue(fn.indexOf('if ((vi + 2) === rowIndex) continue;') !== -1,
            'строка себя пропускает (vi+2 === rowIndex)');
    });

    test('updateVacation: пишет B..F, B — текст (Task 304), аудит', () => {
        const fn = methodText(WS_GS_SRC, 'updateVacation');
        assertTrue(fn.indexOf("sheet.getRange(rowIndex, 2).setNumberFormat('@');") !== -1,
            'текстовый формат B (ведущие нули таб_№)');
        assertTrue(fn.indexOf('sheet.getRange(rowIndex, 2, 1, 5).setValues') !== -1,
            'B..F одним блоком (id в A не меняется)');
        assertFalse(/getRange\(rowIndex, 1[,)]/.test(fn), 'A (id) не перезаписывается');
        assertTrue(fn.indexOf('WORKSCHEDULE_UPDATE_VACATION') !== -1, 'аудит');
    });

    test('Code.gs: диспетчеризация обоих эндпоинтов', () => {
        assertTrue(CODE_GS_SRC.indexOf("case 'workSchedule.updateEmployee':") !== -1,
            'case updateEmployee');
        assertTrue(CODE_GS_SRC.indexOf('WorkSchedule.updateEmployee(payload)') !== -1,
            'вызов updateEmployee');
        assertTrue(CODE_GS_SRC.indexOf("case 'workSchedule.updateVacation':") !== -1,
            'case updateVacation');
        assertTrue(CODE_GS_SRC.indexOf('WorkSchedule.updateVacation(payload)') !== -1,
            'вызов updateVacation');
    });

    test('node --check: оба .gs синтаксически валидны', () => {
        // паттерн test-deploy-url: .gs → временный .js (расширение
        // .gs Node не понимает)
        for (const f of ['WorkSchedule.gs', 'Code.gs']) {
            const tmp = path.join(ROOT, 'scripts', '.gscheck-t384.js');
            fs.writeFileSync(tmp, fs.readFileSync(path.join(ROOT, 'scripts', f)));
            let ok = true;
            try {
                execSync('node --check "' + tmp + '"', { stdio: 'pipe' });
            } catch (e) {
                ok = false;
            } finally {
                fs.unlinkSync(tmp);
            }
            assertTrue(ok, f + ' — node --check без ошибок');
        }
    });
});

// ============================================================
// 6. VM — клиент: логика шторок правки
// ============================================================
// DOM-мок: элементы создаются лениво (урок Task 373)
function mkEl() {
    return {
        value: '', textContent: '', innerHTML: '',
        readOnly: false, hidden: false, disabled: false,
        style: {},
        classList: { add() {}, remove() {}, contains() { return false; } },
        focus() {},
    };
}

function makeWSClient() {
    const els = {};
    const toasts = [];
    const calls = [];
    const loadGrid = [];
    const openedTr = [];
    const closed = { cell: 0, emp: 0 };
    const document = {
        getElementById: id => (els[id] || (els[id] = mkEl())),
    };
    // ProdCalendar-мок: праздников НЕТ — «чистые» дни = календарные,
    // арифметика предсказуема
    const ctx = {
        document,
        Math, Date, String, Number, parseInt, parseFloat, isNaN, isFinite,
        Promise,
        setTimeout: () => 0,
        KipToast: { show: m => toasts.push(String(m)) },
        kipConfirm: () => Promise.resolve(true),
        ProdCalendar: { dayInfo: () => ({ holiday: false }) },
    };
    vm.createContext(ctx);

    const methods = [
        // шторки и режимы Task 384
        'openEmployeeForm', 'closeEmployeeForm', 'openEmpEditForm',
        'submitEmployeeForm', 'onEmpTypeChange',
        '_fillPositionSelect', '_fillPositionOptions',
        '_fillGroupSelect', '_fillGroupOptions',
        '_fillGroupSelect', '_fillGroupOptions',
        'openVacationForm', 'closeVacationForm', 'editVacation',
        'onVacEmployeeChange', 'onVacDatesChange', '_vacUpdateYearInfo',
        'submitVacationForm', 'deleteVacation', '_doDeleteVacation',
        'onEmpAddVacation', 'onEmpAddTraining',
        // хелперы
        '_esc', '_escAttr', '_apiErrText', '_isoDate', '_fmtDateRu',
        // Task 489-adapt: композиция краткого ФИО из частей
        '_wsShortFio', '_wsNameInitial', '_wsFullFio',
        '_parseIsoLocal', '_vacIsHoliday', '_vacSplitDays',
        '_vacNetDaysInYear', '_vacDaysInYear', '_plural',
    ];
    const src = methods.map(n => extractMethod(INDEX_SRC, n))
        .filter(Boolean).join(',\n');

    vm.runInContext(`
        var WSM = {
            _canEdit: true,
            _EMPLOYEES: [
                { 'таб_номер': '0871', 'ФИО': 'Иванов И. И.', 'тип': 'сменный',
                  'смена': 2, 'шаблон_ротации': 1, 'старт_цикла': '2026-01-01',
                  'дата_приёма': '2024-05-01', 'должность': 'Слесарь КИПиА',
                  'комментарий': 'основной' },
                { 'таб_номер': '0955', 'ФИО': 'Петров П. П.', 'тип': 'дневной',
                  'смена': null, 'шаблон_ротации': null, 'старт_цикла': '2026-02-01',
                  'дата_приёма': '2025-09-01', 'должность': 'Инженер',
                  'комментарий': '' },
            ],
            _PATTERNS: [ { id: 1, name: '2/2', cycle: 4 } ],
            _VACATIONS: [
                { id: 11, 'таб_номер': '0871', 'часть': 1,
                  'дата_начала': '2026-06-01', 'дата_окончания': '2026-06-10',
                  'комментарий': 'лето' },
                { id: 12, 'таб_номер': '0871', 'часть': 2,
                  'дата_начала': '2026-08-03', 'дата_окончания': '2026-08-09',
                  'комментарий': '' },
            ],
            _VAC_PAGE: [
                { id: 11, 'таб_номер': '0871', 'часть': 1,
                  'дата_начала': '2026-06-01', 'дата_окончания': '2026-06-10',
                  'комментарий': 'лето' },
                { id: 12, 'таб_номер': '0871', 'часть': 2,
                  'дата_начала': '2026-08-03', 'дата_окончания': '2026-08-09',
                  'комментарий': '' },
            ],
            _vacYear: 2026, _year: 2026, _month: 6,
            _VAC_YEAR_LIMIT: 42,
            _empEditTab: null, _vacEditId: null,
            _editTrainingId: null,
            _api: function(action, payload) {
                __calls.push({ action: action, payload: payload });
                return Promise.resolve({ ok: true });
            },
            loadGrid: function(force) { __loadGrid.push(force); },
            closeCellPopup: function() { __closed.cell++; },
            closeEmpPopup: function() { __closed.emp++; },
            openTrainingForm: function(tab, date) { __openedTr.push([tab, date]); },
            ${src}
        };
        globalThis.__api = {
            WSM: WSM,
            els: function() { return els; },
            setEl: function(id, v) { var el = document.getElementById(id); el.value = v; return el; },
            calls: function() { return __calls; },
            toasts: function() { return toasts; },
            loadGrid: function() { return __loadGrid; },
            openedTr: function() { return __openedTr; },
            closed: function() { return __closed; },
        };
    `.replace(/__calls/g, 'calls').replace(/__loadGrid/g, 'loadGrid')
       .replace(/__openedTr/g, 'openedTr').replace(/__closed/g, 'closed')
       .replace(/__api/g, 'api'), ctx, { filename: 'index.html-WS384' });

    // vars-хосты для моков (глобалы VM: замыкания кода выше видят их)
    ctx.calls = calls;
    ctx.loadGrid = loadGrid;
    ctx.openedTr = openedTr;
    ctx.closed = closed;
    ctx.els = els;
    ctx.toasts = toasts;

    return ctx.api;
}

describe('Task 384 — VM клиент: шторка сотрудника', () => {

    test('openEmpEditForm: префилл полей, таб. № readonly, режим правки', () => {
        const api = makeWSClient();
        api.WSM.openEmpEditForm('0871');
        const els = api.els();
        assertEqual(els.wsEmpTabNo.value, '0871', 'таб. № в поле');
        assertEqual(els.wsEmpTabNo.readOnly, true, 'таб. № readonly (PK)');
        // Task 489-adapt: ТРИ поля имени (легаси-запись без частей —
        // раскладка краткого ФИО по словам)
        assertEqual(els.wsEmpFam.value, 'Иванов', 'фамилия');
        assertEqual(els.wsEmpName.value, 'И.', 'имя (инициал)');
        assertEqual(els.wsEmpPatr.value, 'И.', 'отчество (инициал)');
        assertEqual(els.wsEmpBirth.value, '', 'дата рождения (нет в записи)');
        assertEqual(els.wsEmpType.value, 'сменный', 'тип');
        assertEqual(els.wsEmpShift.value, '2', 'смена');
        assertEqual(els.wsEmpStart.value, '2026-01-01', 'старт цикла');
        assertEqual(els.wsEmpHire.value, '2024-05-01', 'дата приёма');
        assertEqual(els.wsEmpPosition.value, 'Слесарь КИПиА', 'должность (врем. опция)');
        assertEqual(els.wsEmpComment.value, 'основной', 'комментарий');
        assertEqual(els.wsEmpSheetTitle.textContent, 'Правка работника', 'заголовок (Task 385)');
        assertEqual(els.wsEmpSubmitBtn.textContent, 'Сохранить', 'кнопка');
        assertEqual(api.WSM._empEditTab, '0871', 'состояние режима');
        assertEqual(api.closed().emp, 1, 'карточка закрыта до шторки');
    });

    test('openEmployeeForm после правки: режим создания восстановлен', () => {
        const api = makeWSClient();
        api.WSM.openEmpEditForm('0871');
        api.WSM.openEmployeeForm();
        const els = api.els();
        assertEqual(api.WSM._empEditTab, null, '_empEditTab сброшен');
        assertEqual(els.wsEmpTabNo.readOnly, false, 'таб. № снова вводится');
        assertEqual(els.wsEmpSheetTitle.textContent, 'Новый работник', 'заголовок (Task 385)');
        assertEqual(els.wsEmpSubmitBtn.textContent, 'Добавить', 'кнопка');
    });

    test('closeEmployeeForm: сброс режима', () => {
        const api = makeWSClient();
        api.WSM.openEmpEditForm('0871');
        api.WSM.closeEmployeeForm();
        assertEqual(api.WSM._empEditTab, null, 'состояние сброшено');
        assertEqual(api.els().wsEmpTabNo.readOnly, false, 'readOnly снят');
    });

    test('submitEmployeeForm (правка): updateEmployee с таб. № из состояния', async () => {
        const api = makeWSClient();
        const els = api.els();
        api.WSM.openEmpEditForm('0871');
        els.wsEmpFam.value = 'Иванов';
        els.wsEmpName.value = 'Иван';
        els.wsEmpPatr.value = 'Иванович';
        els.wsEmpPosition.value = 'Слесарь КИПиА';
        els.wsEmpStart.value = '2026-01-01';
        api.WSM.submitEmployeeForm();
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        const upd = api.calls().filter(c => c.action === 'workSchedule.updateEmployee');
        assertEqual(upd.length, 1, 'ровно один вызов updateEmployee');
        assertEqual(upd[0].payload['таб_номер'], '0871', 'таб. № из _empEditTab');
        assertEqual(upd[0].payload['ФИО'], 'Иванов И. И.',
            'ФИО (краткая композиция — легаси-поле, Task 489)');
        assertEqual(upd[0].payload['фамилия'], 'Иванов',
            'фамилия (Task 489)');
        assertEqual(upd[0].payload['имя'], 'Иван',
            'имя (Task 489)');
        assertEqual(upd[0].payload['отчество'], 'Иванович',
            'отчество (Task 489)');
        assertEqual(upd[0].payload['дата_рождения'], null,
            'дата рождения (пусто → null, Task 489)');
        assertEqual(upd[0].payload['тип'], 'сменный', 'тип');
        assertEqual(upd[0].payload['должность'], 'Слесарь КИПиА', 'должность');
        assertEqual(api.loadGrid().length, 1, 'loadGrid перезагрузил сетку');
        assertTrue(api.toasts().indexOf('Данные работника обновлены') !== -1,
            'тост успеха (Task 385: работник)');
        assertEqual(api.WSM._empEditTab, null, 'режим сброшен после успеха');
        // addEmployee НЕ вызывался
        assertEqual(api.calls().filter(c => c.action === 'workSchedule.addEmployee').length, 0,
            'addEmployee не зовётся в правке');
    });
});

describe('Task 384 — VM клиент: шторка отпуска', () => {

    test('openVacationForm(tab, rec): режим правки с данными записи', () => {
        const api = makeWSClient();
        const rec = api.WSM._VACATIONS[0];
        api.WSM.openVacationForm('0871', rec);
        const els = api.els();
        assertEqual(api.WSM._vacEditId, 11, 'id в состоянии');
        assertEqual(els.wsVacTabNo.value, '0871', 'сотрудник');
        assertEqual(els.wsVacPart.value, '1', 'часть записи');
        assertEqual(els.wsVacStart.value, '2026-06-01', 'дата начала');
        assertEqual(els.wsVacEnd.value, '2026-06-10', 'дата окончания');
        assertEqual(els.wsVacComment.value, 'лето', 'комментарий');
        assertEqual(els.wsVacSheetTitle.textContent, 'Правка отпуска', 'заголовок');
        assertEqual(els.wsVacSubmitBtn.textContent, 'Сохранить', 'кнопка');
    });

    test('openVacationForm() без записи: режим создания', () => {
        const api = makeWSClient();
        api.WSM.openVacationForm();
        const els = api.els();
        assertEqual(api.WSM._vacEditId, null, 'режим создания');
        assertEqual(els.wsVacSheetTitle.textContent, 'Новый отпуск', 'заголовок');
        assertEqual(els.wsVacSubmitBtn.textContent, 'Добавить', 'кнопка');
    });

    test('onVacEmployeeChange (правка): выбранная часть сохраняется', () => {
        const api = makeWSClient();
        // правка записи с частью 2 (у сотрудника ещё часть 1)
        api.WSM.openVacationForm('0871', api.WSM._VACATIONS[1]);
        // onVacEmployeeChange уже вызван openVacationForm: часть 2
        // (занята только чужая 1) — должна сохраниться
        assertEqual(api.els().wsVacPart.value, '2',
            'часть 2 не переехала на «первую свободную» = 2 (сама и есть)');
    });

    test('onVacEmployeeChange (правка, дырка): своя часть НЕ съезжает на дырку', () => {
        const api = makeWSClient();
        // у сотрудника только запись id=12 часть 2 (часть 1 удалена):
        // правка части 2 при свободной 1 — должна остаться 2
        api.WSM._VAC_PAGE = [ api.WSM._VAC_PAGE[1] ];
        api.WSM._VACATIONS = [ api.WSM._VACATIONS[1] ];
        api.WSM.openVacationForm('0871', api.WSM._VACATIONS[0]);
        assertEqual(api.WSM._vacEditId, 12, 'правится id 12');
        assertEqual(api.els().wsVacPart.value, '2',
            'часть 2 сохранена (не 1!) — своя строка исключена из занятых');
    });

    test('submitVacationForm (правка): самопересечение проходит, updateVacation с id', async () => {
        const api = makeWSClient();
        const els = api.els();
        // правка id 11: те же даты (пересечение ТОЛЬКО с собой)
        api.WSM.openVacationForm('0871', api.WSM._VACATIONS[0]);
        els.wsVacStart.value = '2026-06-01';
        els.wsVacEnd.value = '2026-06-14'; // длиннее на 4 дня
        api.WSM.submitVacationForm();
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        const upd = api.calls().filter(c => c.action === 'workSchedule.updateVacation');
        assertEqual(upd.length, 1, 'вызов updateVacation');
        assertEqual(upd[0].payload.id, 11, 'id периода');
        assertEqual(upd[0].payload['часть'], 1, 'часть');
        assertEqual(upd[0].payload['дата_начала'], '2026-06-01', 'даты ушли');
        assertEqual(api.loadGrid().length, 1, 'сетка перезагружена');
        assertTrue(api.toasts().join(' ').indexOf('Период отпуска обновлён') !== -1,
            'тост успеха');
        assertEqual(api.calls().filter(c => c.action === 'workSchedule.addVacation').length, 0,
            'addVacation не зовётся в правке');
    });

    test('submitVacationForm (правка): чужое пересечение блокируется ДО сервера', async () => {
        const api = makeWSClient();
        const els = api.els();
        // правка id 11 на даты чужого периода id 12 (03–09.08)
        api.WSM.openVacationForm('0871', api.WSM._VACATIONS[0]);
        els.wsVacStart.value = '2026-08-04';
        els.wsVacEnd.value = '2026-08-08';
        api.WSM.submitVacationForm();
        await Promise.resolve(); await Promise.resolve();
        assertEqual(api.calls().filter(c => c.action === 'workSchedule.updateVacation').length, 0,
            'на сервер не ушло');
        assertTrue(api.toasts().join(' ').indexOf('пересекается с отпуском') !== -1,
            'тост о пересечении');
    });

    test('submitVacationForm (правка): лимит года без своей строки', async () => {
        const api = makeWSClient();
        const els = api.els();
        // правка id 12 (7 дней): чужие 10 (id 11) + новый период 40 → 50 > 42
        api.WSM.openVacationForm('0871', api.WSM._VACATIONS[1]);
        els.wsVacStart.value = '2026-09-01';
        els.wsVacEnd.value = '2026-10-10'; // 40 кал. дн.
        api.WSM.submitVacationForm();
        await Promise.resolve(); await Promise.resolve();
        assertEqual(api.calls().filter(c => c.action === 'workSchedule.updateVacation').length, 0,
            'превышение лимита — на сервер не ушло');
        assertTrue(api.toasts().join(' ').indexOf('Превышен годовой лимит') !== -1,
            'тост о лимите');
        // а 25 дней (10 чужих + 25 = 35 ≤ 42) — проходит
        api.toasts().length = 0;
        els.wsVacStart.value = '2026-09-01';
        els.wsVacEnd.value = '2026-09-25'; // 25 дн.
        api.WSM.submitVacationForm();
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        assertEqual(api.calls().filter(c => c.action === 'workSchedule.updateVacation').length, 1,
            'в пределах лимита — ушло');
    });

    test('editVacation: не найден → тост, форма не открылась', () => {
        const api = makeWSClient();
        api.WSM.editVacation(999);
        assertEqual(api.WSM._vacEditId, null, 'режим не включён');
        assertTrue(api.toasts().join(' ').indexOf('не найден') !== -1, 'тост');
    });

    test('deleteVacation: попапы закрыты, сервер удалён, сетка обновлена', async () => {
        const api = makeWSClient();
        api.WSM.deleteVacation(12);
        assertEqual(api.closed().cell, 1, 'попап ячейки закрыт');
        assertEqual(api.closed().emp, 1, 'карточка закрыта');
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        const del = api.calls().filter(c => c.action === 'workSchedule.deleteVacation');
        assertEqual(del.length, 1, 'вызов deleteVacation');
        assertEqual(del[0].payload.id, 12, 'id');
        assertEqual(api.loadGrid().length, 1, 'loadGrid');
    });

    test('onEmpAddTraining: карточка закрыта, форма с сотрудником', () => {
        const api = makeWSClient();
        api.WSM.onEmpAddTraining('0871');
        assertEqual(api.closed().emp, 1, 'карточка закрыта');
        assertEqual(api.openedTr().length, 1, 'openTrainingForm вызван');
        assertEqual(api.openedTr()[0][0], '0871', 'с префиллом сотрудника');
    });
});

// ============================================================
// 7. VM — сервер: updateEmployee / updateVacation на мок-листах
// ============================================================
function mkSheet(rows) {
    // rows: массив массивов (строка 1 — заголовок)
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

function makeWSServer() {
    const audits = [];
    const sheets = {};
    const ctx = {
        Math, Date, String, Number, parseInt, isNaN,
        Utils: { audit: (email, code) => { audits.push(code); } },
    };
    vm.createContext(ctx);
    const methods = ['_parseIsoDate', '_parseSheetDate', '_safeDate', '_toIsoDate',
                     '_accessGroupColIndex', '_headerColIndex',
                     '_employeesColMap', '_wsShortFio', '_wsNameInitial', '_wsFullFio',
                     'updateEmployee', 'updateVacation'];
    const src = methods.map(n => extractMethod(WS_GS_SRC, n)).filter(Boolean).join(',\n');
    vm.runInContext(`
        var WSS = {
            EMPLOYEES_SHEET: 'Сотрудники',
            VACATIONS_SHEET: 'Отпуска',
            _requireWrite: function(token) { return { user: { email: 't@t' } }; },
            _getSheet: function(name) { return sheetsAccess[name] || null; },
            ${src}
        };
        globalThis.api = {
            WSS: WSS,
            setSheet: function(name, rows) { sheetsAccess[name] = mkSheetHost(rows); return sheetsAccess[name]; },
            audits: function() { return audits; },
        };
    `.replace(/sheetsAccess/g, 'sheetsHost').replace(/mkSheetHost/g, 'mkSheet')
       .replace(/auditsHost/g, 'audits'), ctx, { filename: 'WorkSchedule.gs-384' });
    // хосты замыканий
    ctx.sheetsHost = sheets;
    ctx.mkSheet = mkSheet;
    ctx.audits = audits;
    return ctx.api;
}

describe('Task 384 — VM сервер: updateEmployee', () => {

    function empSheet() {
        return [
            ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон', 'старт', 'приём', 'увол', 'архив', 'должность', 'комментарий'],
            ['0871', 'Иванов И. И.', 'сменный', 2, 1, new Date(2026, 0, 1), new Date(2024, 4, 1), '', 0, 'Слесарь КИПиА', ''],
            ['0955', 'Петров П. П.', 'дневной', '', '', new Date(2026, 1, 1), new Date(2025, 8, 1), '', 0, 'Инженер', ''],
        ];
    }

    test('happy-path: B..G и J..K обновлены, A/H/I не тронуты', () => {
        const api = makeWSServer();
        const sheet = api.setSheet('Сотрудники', empSheet());
        const res = api.WSS.updateEmployee({
            token: 't', 'таб_номер': '0871',
            'ФИО': 'Иванов И. И. (ст.)', 'тип': 'сменный',
            'смена': 3, 'шаблон_ротации': 1,
            'старт_цикла': '2026-03-01', 'дата_приёма': '2024-05-01',
            'должность': 'Старший слесарь', 'комментарий': 'правка',
        });
        assertEqual(res.ok, true, 'успех');
        assertEqual(sheet._data[1][1], 'Иванов И. И. (ст.)', 'B: ФИО');
        assertEqual(sheet._data[1][3], 3, 'D: смена');
        assertEqual(sheet._data[1][9], 'Старший слесарь', 'J: должность');
        assertEqual(sheet._data[1][10], 'правка', 'K: комментарий');
        assertEqual(sheet._data[1][0], '0871', 'A: таб_№ НЕ изменён');
        assertEqual(sheet._data[1][7], '', 'H: увольнение не тронуто');
        assertEqual(sheet._data[1][8], 0, 'I: архив не тронут');
        // одиночных записей в A/H/I не было (Task 403: должность/
        // комментарий теперь тоже одиночные setValue — но в СВОИ
        // столбцы по заголовкам, не в A/H/I)
        const solo = sheet._writes.filter(w => w.numRows === 1 && w.numCols === 1 &&
                                               (w.col === 1 || w.col === 8 || w.col === 9));
        assertEqual(solo.length, 0, 'A/H/I не перезаписываются');
        assertTrue(api.audits().indexOf('WORKSCHEDULE_UPDATE_EMPLOYEE') !== -1, 'аудит');
    });

    test('не найден → not_found_таб_номер', () => {
        const api = makeWSServer();
        api.setSheet('Сотрудники', empSheet());
        const res = api.WSS.updateEmployee({ token: 't', 'таб_номер': '0001', 'ФИО': 'X', 'тип': 'сменный' });
        assertEqual(res.ok, false, 'отказ');
        assertEqual(res.error, 'not_found_таб_номер', 'код ошибки');
    });

    test('пустое ФИО → invalid_ФИО (до листа)', () => {
        const api = makeWSServer();
        api.setSheet('Сотрудники', empSheet());
        const res = api.WSS.updateEmployee({ token: 't', 'таб_номер': '0871', 'ФИО': '  ', 'тип': 'сменный' });
        assertEqual(res.error, 'invalid_ФИО', 'валидация ФИО');
    });

    test('дневной: смена очищается', () => {
        const api = makeWSServer();
        const sheet = api.setSheet('Сотрудники', empSheet());
        const res = api.WSS.updateEmployee({
            token: 't', 'таб_номер': '0871', 'ФИО': 'Иванов', 'тип': 'дневной',
            'смена': null, 'должность': 'Инженер',
        });
        assertEqual(res.ok, true, 'успех');
        assertEqual(sheet._data[1][3], null, 'смена пустая (smena || null)');
        assertEqual(sheet._data[1][2], 'дневной', 'тип сменён');
    });
});

describe('Task 384 — VM сервер: updateVacation', () => {

    function vacSheet() {
        return [
            ['id', 'таб_номер', 'часть', 'начало', 'конец', 'комментарий'],
            [11, '0871', 1, new Date(2026, 5, 1), new Date(2026, 5, 10), 'лето'],
            [12, '0871', 2, new Date(2026, 7, 3), new Date(2026, 7, 9), ''],
            [13, '0955', 1, new Date(2026, 6, 1), new Date(2026, 6, 7), ''],
        ];
    }

    test('happy-path: B..F по id, B — текстовый формат, аудит', () => {
        const api = makeWSServer();
        const sheet = api.setSheet('Отпуска', vacSheet());
        const res = api.WSS.updateVacation({
            token: 't', id: 12, 'таб_номер': '0871', 'часть': 2,
            'дата_начала': '2026-08-03', 'дата_окончания': '2026-08-20',
            'комментарий': 'август',
        });
        assertEqual(res.ok, true, 'успех');
        assertEqual(sheet._data[2][1], '0871', 'B: таб_номер');
        assertEqual(sheet._data[2][2], 2, 'C: часть');
        assertEqual(sheet._data[2][5], 'август', 'F: комментарий');
        assertEqual(sheet._data[2][0], 12, 'A: id не менялся');
        assertTrue(sheet._formats.some(f => f.row === 3 && f.col === 2 && f.f === '@'),
            'Task 304: B — текстовый формат');
        assertTrue(api.audits().indexOf('WORKSCHEDULE_UPDATE_VACATION') !== -1, 'аудит');
        assertEqual(res.data['дней'], 18, '18 дней (03–20.08)');
    });

    test('самопересечение: те же даты проходят (себя исключили)', () => {
        const api = makeWSServer();
        api.setSheet('Отпуска', vacSheet());
        const res = api.WSS.updateVacation({
            token: 't', id: 11, 'таб_номер': '0871', 'часть': 1,
            'дата_начала': '2026-06-01', 'дата_окончания': '2026-06-10',
        });
        assertEqual(res.ok, true, 'правка своих дат не блокируется собой');
    });

    test('своя часть не дубль: часть 2 при id=12 проходит', () => {
        const api = makeWSServer();
        api.setSheet('Отпуска', vacSheet());
        const res = api.WSS.updateVacation({
            token: 't', id: 12, 'таб_номер': '0871', 'часть': 2,
            'дата_начала': '2026-08-11', 'дата_окончания': '2026-08-20',
        });
        assertEqual(res.ok, true, 'своя часть исключена из дубля');
    });

    test('чужое пересечение → overlap', () => {
        const api = makeWSServer();
        api.setSheet('Отпуска', vacSheet());
        // id 12 (03–09.08) наезжает на даты id 11? нет — разные месяцы.
        // Сдвинем id 12 на 05–07.06 — пересекается с id 11 (01–10.06)
        const res = api.WSS.updateVacation({
            token: 't', id: 12, 'таб_номер': '0871', 'часть': 2,
            'дата_начала': '2026-06-05', 'дата_окончания': '2026-06-07',
        });
        assertEqual(res.ok, false, 'отказ');
        assertEqual(res.error, 'overlap', 'код overlap');
        assertTrue(String(res.message).indexOf('пересекается') !== -1, 'пояснение');
    });

    test('чужой дубль части в году → duplicate_часть', () => {
        const api = makeWSServer();
        api.setSheet('Отпуска', vacSheet());
        // id 12 → часть 1: у 0871 в 2026 уже есть часть 1 (id 11)
        const res = api.WSS.updateVacation({
            token: 't', id: 12, 'таб_номер': '0871', 'часть': 1,
            'дата_начала': '2026-08-11', 'дата_окончания': '2026-08-20',
        });
        assertEqual(res.ok, false, 'отказ');
        assertEqual(res.error, 'duplicate_часть', 'код дубля части');
    });

    test('не найден / конец раньше начала / плохая часть', () => {
        const api = makeWSServer();
        api.setSheet('Отпуска', vacSheet());
        assertEqual(api.WSS.updateVacation({ token: 't', id: 999, 'таб_номер': '0871', 'часть': 1, 'дата_начала': '2026-06-01' }).error, 'not_found');
        assertEqual(api.WSS.updateVacation({ token: 't', id: 12, 'таб_номер': '0871', 'часть': 1, 'дата_начала': '2026-06-10', 'дата_окончания': '2026-06-01' }).error, 'end_before_start');
        assertEqual(api.WSS.updateVacation({ token: 't', id: 12, 'таб_номер': '0871', 'часть': 4, 'дата_начала': '2026-06-01' }).error, 'invalid_часть');
    });
});

// ============================================================
// 8. SW
// ============================================================
describe('Task 384 — Service Worker', () => {
    test('SW: кэш поднят до kipia-test-v747', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v747'") !== -1,
            'CACHE_VERSION = kipia-test-v747 (Task 384 — фронтенд менялся)');
        assertFalse(SW_SRC.indexOf('kipia-test-v748') !== -1,
            'лишний инкремент (v613) не сделан');
    });
});
