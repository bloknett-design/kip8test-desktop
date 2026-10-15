// ============================================================
// Task 445 — заявка: «В разделе работников во вкладке Общая
// необходимо внести изменения и доработки. В колонке Группа
// допуска, справа от группы добавь отображение даты, так же как в
// блоке профиля работника. Колонки Отпуск/Мероприятия/Инструктажи
// убери. Кнопку "Сохранить архив" переименуй в "Скачать архив".
// Переделай структуру скачиваемого архива, файл excel должен
// содержать несколько страниц с данными: Лист "Работники" - с
// основными данными профилей работников; Лист "Отпуска" - с датами
// отпусков работников за предыдущий и текущий годы; Лист
// "Инструктажи" - с данными инструктажей и проверок знаний за
// предыдущий, текущий годы и на следующий год; Лист "СИЗ" - с
// данными по СИЗ; Лист "Мероприятия" - с данными мероприятий за
// текущий год.»
//
// Реализация (полностью КЛИЕНТСКАЯ, index.html):
//   • Сводка «Общая»: 6 колонок (таб/ФИО/режим/должность/группа
//     допуска с датой последней проверки до 1000 В «IV от
//     дд.мм.гггг» — как в профиле карточки, Task 434/приём
//     _lastExam1000Date/приём года _year — как в блоке профиля;
//     колонки Отпуск/Мероприятия/Инструктажи года УДАЛЕНЫ;
//   • Кнопка «Скачать архив» (прежде «Сохранить архив»);
//   • Архив Excel — ПЯТЬ листов: Работники / Отпуска (предыдущий +
//     текущий годы, пул _VAC_YEARS + фолбэк _VACATIONS/_vacYear) /
//     Инструктажи (предыдущий + текущий + следующий годы) / СИЗ
//     (все записи) / Мероприятия (только текущий год, период
//     пересекает год); годы — ТЕКУЩИЙ календарный год (не год
//     шахматки); saveWorkersArchive ПЕРЕД сборкой лениво тянет
//     отпуска соседних годов (_vacYearEnsure), в VM без него —
//     сборка синхронна; тост «Архив скачан — …» из 5 счётчиков.
//   • Task 446 (адаптация тестов): листы Отпуска/Инструктажи/
//     СИЗ/Мероприятия БЕЗ колонок id/«Таб. №» (первая колонка —
//     работник), «Инструктажи» сортируются по фамилиям — ассерты
//     перестроены под новые индексы колонок.
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

// Текущий календарный год (все фикстуры — ОТНОСИТЕЛЬНО него,
// тест не ломается со временем)
const NOWY = new Date().getFullYear();
const D = (y, md) => (y + '-' + md);
const RU = (iso) => {
    const p = String(iso || '').split('-');
    return p.length === 3 ? (p[2] + '.' + p[1] + '.' + p[0]) : '';
};

// ============================================================
// 1. SRC — сводка «Общая»
// ============================================================
describe('Task 445 — SRC: сводка «Общая»', () => {

    test('колонка «Группа допуска» — дата справа от группы, как в профиле', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        const iGrp = fn.indexOf("var grpVal = String(emp['группа_допуска'] || '').trim();");
        assertTrue(iGrp !== -1, 'grpVal — как в блоке профиля (Task 434)');
        const iExam = fn.indexOf('this._lastExam1000Date(emp[\'таб_номер\'])');
        assertTrue(iExam !== -1, 'дата последней проверки до 1000 В');
        const iFrom = fn.indexOf("grpVal += ' от ' + this._fmtDateRu(examIso)");
        assertTrue(iFrom !== -1, 'формат «от дд.мм.гггг» — как в профиле');
        assertTrue(iGrp < iExam && iExam < iFrom,
            'цепочка: группа → проверка → дописывание даты');
        assertTrue(fn.indexOf("this._esc(grpVal || '—')") !== -1,
            'ячейка: группа+дата или «—»');
        // профиль карточки — ТА ЖЕ логика (Task 434, не изменена)
        const card = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(card.indexOf("grpVal += ' от ' + this._fmtDateRu(examIso)") !== -1,
            'в профиле карточки формат не тронут');
    });

    test('колонки Отпуск/Мероприятия/Инструктажи УДАЛЕНЫ', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        for (const th of ['<th>Отпуск', '<th>Мероприятия', '<th>Инструктажи']) {
            assertTrue(fn.indexOf(th) === -1, th + ' — удалено (Task 445)');
        }
        assertTrue(fn.indexOf('_vacNetDaysInYear') === -1,
            'подсчёт «чистых» дней отпуска удалён');
        assertTrue(fn.indexOf('insN') === -1 && fn.indexOf('trN') === -1,
            'счётчики записей года удалены');
        // 6 колонок шапки — по порядку
        const iHeads = ['<th>Таб. №</th>', '<th>ФИО</th>', '<th>Режим работы</th>',
                        '<th>Должность</th>', '<th>Группа допуска</th>',
                        '<th>Дата приёма</th>'].map(h => fn.indexOf(h));
        assertTrue(iHeads.every(i => i !== -1), 'все 6 колонок шапки живы');
        assertTrue(iHeads.every((v, i) => i === 0 || v > iHeads[i - 1]),
            'порядок колонок сохранён');
    });

    test('мобайл: таблица в скролл-обёртке (свайп по горизонтали)', () => {
        assertTrue(INDEX_SRC.indexOf('.ws-wgen-tscroll {') !== -1 &&
                   INDEX_SRC.indexOf('overflow-x: auto;') !== -1,
            'CSS: .ws-wgen-tscroll — overflow-x auto');
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkersGeneral'));
        const iOpen = fn.indexOf('<div class="ws-wgen-tscroll">');
        const iTab = fn.indexOf('<table class="ws-wgen-table">');
        const iClose = fn.indexOf('</tbody></table></div>');
        assertTrue(iOpen !== -1 && iTab !== -1 && iClose !== -1 &&
                   iOpen < iTab && iTab < iClose,
            'таблица целиком внутри обёртки (открытие → таблица → закрытие)');
    });

    test('кнопка: «Скачать архив» (прежде «Сохранить архив»)', () => {
        const i = INDEX_SRC.indexOf('wsWorkersArchiveBtn');
        assertTrue(i !== -1, 'id кнопки');
        const seg = INDEX_SRC.slice(i, i + 1600);
        assertTrue(seg.indexOf('>Скачать архив</button>') !== -1,
            'текст кнопки — «Скачать архив»');
        assertTrue(INDEX_SRC.indexOf('>Сохранить архив</button>') === -1,
            'старый текст «Сохранить архив» удалён');
        assertTrue(seg.indexOf('aria-label="Скачать архив по работникам в Excel"') !== -1,
            'aria-label переименован');
        assertTrue(seg.indexOf('title="Архив по работникам в Excel') !== -1,
            'title описывает архив');
        assertTrue(seg.indexOf('листы: Работники') !== -1 &&
                   seg.indexOf('Отпуска') !== -1 &&
                   seg.indexOf('Инструктажи') !== -1 &&
                   seg.indexOf('СИЗ') !== -1 &&
                   seg.indexOf('Мероприятия') !== -1,
            'title: все пять листов перечислены');
    });
});

// ============================================================
// 2. SRC — архив: годы, фильтры, листы
// ============================================================
describe('Task 445 — SRC: структура архива (5 листов)', () => {

    test('_workersArchiveData: годы относительно ТЕКУЩЕГО календарного года', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_workersArchiveData'));
        assertTrue(fn.indexOf('var nowY = new Date().getFullYear();') !== -1,
            'текущий год — календарный (не год шахматки this._year)');
        assertTrue(fn.indexOf('var prevY = nowY - 1, nextY = nowY + 1;') !== -1,
            'предыдущий и следующий годы');
        assertFalse(fn.indexOf('this._year') !== -1,
            'год шахматки в сборке архива не используется');
    });

    test('лист «Отпуска»: пул _VAC_YEARS + фолбэк + дедуп', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_workersArchiveData'));
        assertTrue(fn.indexOf('this._VAC_YEARS') !== -1,
            'пул годов отпусков (Task 440)');
        assertTrue(fn.indexOf('this._vacYear === vy') !== -1 &&
                   fn.indexOf('arrV = this._VACATIONS') !== -1,
            'фолбэк на _VACATIONS года шахматки');
        assertTrue(fn.indexOf("'v' + vId") !== -1,
            'дедуп отпусков по id');
        assertTrue(fn.indexOf("['ФИО', 'Часть',") !== -1 &&
                   fn.indexOf("'Дата начала', 'Дата окончания', 'Дней',") !== -1,
            'колонки листа «Отпуска» (Task 446: без id/«Таб. №»)');
    });

    test('лист «Инструктажи»: предыдущий + текущий + следующий годы', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_workersArchiveData'));
        const iFrom = fn.indexOf("var iFrom = prevY + '-01-01', iTo = nextY + '-12-31';");
        assertTrue(iFrom !== -1, 'диапазон дат инструктажей [prevY-01-01 … nextY-12-31]');
        assertTrue(fn.indexOf('dI < iFrom || dI > iTo') !== -1,
            'записи вне диапазона отфильтровываются');
        assertTrue(fn.indexOf('r.дата_проведения ||') !== -1,
            'дата проведения — первична (как _lastExam1000Date)');
    });

    test('лист «Мероприятия»: ТОЛЬКО текущий год (пересечение периода)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_workersArchiveData'));
        assertTrue(fn.indexOf("var eS = nowY + '-01-01', eE = nowY + '-12-31';") !== -1,
            'границы текущего года');
        assertTrue(fn.indexOf('e0 < eS || s0 > eE') !== -1,
            'период вне года не входит (приём _wtabYearRecords)');
    });

    test('лист «СИЗ»: все записи, полные колонки', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_workersArchiveData'));
        assertTrue(fn.indexOf('this._PPE') !== -1, 'пул СИЗ (Task 392)');
        const head = fn.indexOf("'Наименование', 'Дата выдачи',");
        assertTrue(head !== -1 &&
                   fn.indexOf("'Дата изготовления', 'Срок годности',") !== -1 &&
                   fn.indexOf("'Дата окончания', 'Примечание'") !== -1,
            'колонки: наименование/выдача/изготовление/срок/окончание/примечание (Task 443)');
        assertTrue(fn.indexOf('fioOf(pz[\'таб_номер\'])') !== -1,
            'фолбэк ФИО работника из справочника');
    });

    test('_buildArchiveWorkbook: ПЯТЬ листов по порядку', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_buildArchiveWorkbook'));
        const names = ['Работники', 'Отпуска', 'Инструктажи', 'СИЗ', 'Мероприятия'];
        const pos = names.map(n => fn.indexOf("name: '" + n + "'"));
        assertTrue(pos.every(p => p !== -1), 'все 5 листов объявлены');
        assertTrue(pos.every((v, i) => i === 0 || v > pos[i - 1]),
            'порядок: Работники → Отпуска → Инструктажи → СИЗ → Мероприятия');
        assertTrue(fn.indexOf('rows: d.vacations') !== -1 &&
                   fn.indexOf('rows: d.ppe') !== -1,
            'данные отпусков и СИЗ подключены');
        for (const c of ['vacations:', 'ppe:']) {
            assertTrue(fn.indexOf(c) !== -1, 'счётчик ' + c + ' в counts');
        }
    });

    test('saveWorkersArchive: ленивые годы отпусков + синхронный фолбэк', () => {
        const fn = stripComments(methodText(INDEX_SRC, 'saveWorkersArchive'));
        assertTrue(fn.indexOf('this._vacYearEnsure([nowY - 1, nowY])') !== -1,
            'перед сборкой — подтянуть отпуска предыдущего и текущего годов');
        assertTrue(fn.indexOf("typeof this._vacYearEnsure === 'function'") !== -1,
            'guard: без _vacYearEnsure (VM) — сборка сразу');
        assertTrue(fn.indexOf('pre.then(build, build)') !== -1,
            'сборка ПОСЛЕ промиса (успех И ошибка — книга по имеющимся данным)');
        assertTrue(fn.indexOf('Архив скачан') !== -1,
            'тост «Архив скачан» (по кнопке «Скачать архив»)');
        assertTrue(fn.indexOf("'отпуск', 'отпуска', 'отпусков'") !== -1,
            'склонение отпусков в тосте');
        assertTrue(fn.indexOf('СИЗ') !== -1, 'СИЗ в тосте');
    });
});

// ============================================================
// 3. VM — сводка «Общая»: группа допуска с датой
// ============================================================
describe('Task 445 — VM: сводка «Общая»', () => {

    const EMP = [
        { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'тип': 'дневной',
          'смена': '', 'должность': 'Слесарь КИПиА', 'комментарий': '',
          'группа_допуска': 'IV', 'дата_приёма': '2024-03-15' },
        { 'таб_номер': '0377', 'ФИО': 'Первов С. А.', 'тип': 'сменный',
          'смена': 1, 'должность': 'Электромонтёр', 'комментарий': '',
          'группа_допуска': 'III', 'дата_приёма': '2025-01-20' },
        { 'таб_номер': '0955', 'ФИО': 'Яковлев Я. Я.', 'тип': 'дневной',
          'смена': '', 'должность': 'Инженер', 'комментарий': '',
          'группа_допуска': '', 'дата_приёма': '2023-02-11' }
    ];

    function host(examIso) {
        return new Function('return ({' +
            methodText(INDEX_SRC, '_renderWorkersGeneral') + ',\n' +
            methodText(INDEX_SRC, '_isMasterKipia') + ',\n' +
            '_lastExam1000Date: function(t) { return ' +
                JSON.stringify(examIso || '') + '; },' +
            '_year: ' + NOWY + ',' +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_esc: function(s) { return String(s); },' +
            '_plural: function(n, f) { return f[2]; },' +
            '_fmtDateRu: function(d) { d = String(d);' +
            '  var p = d.split("-"); return p.length === 3 ?' +
            '  p[2] + "." + p[1] + "." + p[0] : d; }' +
            '});')();
    }

    test('группа + дата последней проверки до 1000 В («IV от 15.03.2026»)', () => {
        const html = host(D(NOWY, '03-15'))._renderWorkersGeneral(EMP.slice());
        const iG = html.indexOf('Галкин Д. Н.');
        const row = html.slice(html.lastIndexOf('<tr>', iG),
                               html.indexOf('</tr>', iG));
        assertTrue(row.indexOf('<td>IV от 15.03.' + NOWY + '</td>') !== -1,
            'Галкин: «IV от 15.03.' + NOWY + '» — дата СПРАВА от группы');
        // у Первова — ДРУГАЯ дата (мок общий, но формат тот же)
        const iP = html.indexOf('Первов С. А.');
        const rowP = html.slice(html.lastIndexOf('<tr>', iP),
                                html.indexOf('</tr>', iP));
        assertTrue(rowP.indexOf('<td>III от 15.03.' + NOWY + '</td>') !== -1,
            'Первов: «III от …» — тот же формат');
    });

    test('нет выполненной проверки — только знак группы', () => {
        const html = host('')._renderWorkersGeneral(EMP.slice());
        const iG = html.indexOf('Галкин Д. Н.');
        const row = html.slice(html.lastIndexOf('<tr>', iG),
                               html.indexOf('</tr>', iG));
        assertTrue(row.indexOf('<td>IV</td>') !== -1, 'только знак «IV»');
        assertTrue(row.indexOf(' от ') === -1, 'дата не дописана');
    });

    test('нет группы — «—» (дата не ищется)', () => {
        const html = host(D(NOWY, '03-15'))._renderWorkersGeneral(EMP.slice());
        const iY = html.indexOf('Яковлев Я. Я.');
        const row = html.slice(html.lastIndexOf('<tr>', iY),
                               html.indexOf('</tr>', iY));
        assertTrue(row.indexOf('<td>—</td>') !== -1, 'пустая группа — «—»');
        assertTrue(row.indexOf(' от ') === -1, 'без даты');
    });
});

// ============================================================
// 4. VM — _workersArchiveData: отпуска/инструктажи/СИЗ/мероприятия
// ============================================================
describe('Task 445 — VM: _workersArchiveData (годовые фильтры)', () => {

    const EMP = [
        { 'таб_номер': '017', 'ФИО': 'Иванов И. И.', 'тип': 'дневной',
          'смена': '', 'должность': 'Слесарь КИПиА', 'группа_допуска': 'IV',
          'дата_приёма': '2024-03-15' },
        { 'таб_номер': '031', 'ФИО': 'Сидоров С. С.', 'тип': 'сменный',
          'смена': 3, 'должность': 'Электромонтёр', 'группа_допуска': 'III',
          'дата_приёма': '2023-11-05' }
    ];

    function dataHost(opts) {
        opts = opts || {};
        return new Function('return ({' +
            methodText(INDEX_SRC, '_workersArchiveData') + ',\n' +
            methodText(INDEX_SRC, '_ppePosNoGrade') + ',\n' +
            "_isInstrType: function(t) { return t === 'инструктаж' || t === 'проверка_знаний'; }," +
            '_EMPLOYEES: ' + JSON.stringify(EMP) + ',' +
            '_INSTR_ALL: ' + JSON.stringify(opts.instrAll || []) + ',' +
            '_EVENTS_ALL: ' + JSON.stringify(opts.eventsAll || []) + ',' +
            '_TRAININGS: ' + JSON.stringify(opts.trainings || []) + ',' +
            '_PPE: ' + JSON.stringify(opts.ppe || []) + ',' +
            '_VAC_YEARS: ' + JSON.stringify(opts.vacYears || {}) + ',' +
            '_VACATIONS: ' + JSON.stringify(opts.vacations || []) + ',' +
            '_vacYear: ' + JSON.stringify(opts.vacYear || 0) + ',' +
            '});')();
    }

    test('отпуска: два года из пула, пограничный период НЕ дублируется', () => {
        const border = { id: 21, 'таб_номер': '017', часть: 1,
                         'дата_начала': D(NOWY - 1, '12-29'),
                         'дата_окончания': D(NOWY, '01-11'),
                         дней: 14, комментарий: 'новый год' };
        const d = dataHost({
            vacYears: {
                // период 29.12–11.01 сервер отдаёт В ОБОИХ годах — дубль
                [NOWY - 1]: [border,
                    { id: 22, 'таб_номер': '031', часть: 1,
                      'дата_начала': D(NOWY - 1, '07-01'),
                      'дата_окончания': D(NOWY - 1, '07-14'),
                      дней: 14, комментарий: '' }],
                [NOWY]: [border,
                    { id: 23, 'таб_номер': '017', часть: 2,
                      'дата_начала': D(NOWY, '06-01'),
                      'дата_окончания': D(NOWY, '06-10'),
                      дней: 10, комментарий: 'лето' }]
            }
        })._workersArchiveData();
        assertEqual(d.vacations.length, 4,
            'шапка + 3 отпуска (пограничный период — ОДИН, дедуп по id)');
        // сортировка: ФИО (Иванов 017 → Сидоров 031), затем дата
        assertEqual(d.vacations[1][0], 'Иванов И. И.', 'первый — Иванов');
        assertEqual(d.vacations[1][2], '29.12.' + (NOWY - 1),
            'пограничный: дата начала прошлого года');
        assertEqual(d.vacations[2][2], '01.06.' + NOWY, 'второй Иванова — лето');
        assertEqual(d.vacations[3][0], 'Сидоров С. С.', 'Сидоров — по алфавиту ниже');
        // колонки: часть/дней (Task 446: без id/«Таб. №»)
        assertEqual(d.vacations[2][1], 2, 'часть 2 — числом');
        assertEqual(d.vacations[2][4], 10, 'дней 10 — числом');
    });

    test('отпуска: фолбэк на _VACATIONS года шахматки (пула нет)', () => {
        const d = dataHost({
            vacations: [{ id: 31, 'таб_номер': '017', часть: 1,
                          'дата_начала': D(NOWY, '08-04'),
                          'дата_окончания': D(NOWY, '08-17'),
                          дней: 14, комментарий: '' }],
            vacYear: NOWY
        })._workersArchiveData();
        assertEqual(d.vacations.length, 2, 'шапка + отпуск из _VACATIONS');
        assertEqual(d.vacations[1][2], '04.08.' + NOWY, 'дата начала');
    });

    test('отпуска: посторонний год шахматки в лист НЕ попадает', () => {
        const d = dataHost({
            vacations: [{ id: 41, 'таб_номер': '017', часть: 1,
                          'дата_начала': D(NOWY - 2, '05-05'),
                          'дата_окончания': D(NOWY - 2, '05-18'),
                          дней: 14, комментарий: '' }],
            vacYear: NOWY - 2
        })._workersArchiveData();
        assertEqual(d.vacations.length, 1,
            'год шахматки вне [prevY..nowY] не выгружается');
    });

    test('инструктажи: prev + cur + next — внутри, глубже/дальше — НЕТ', () => {
        const mk = (id, iso) => ({
            id: id, 'таб_номер': '017', 'тип': 'инструктаж',
            'тема': 'Т', 'дата_начала': iso, 'дата_окончания': iso,
            'длительность_дней': 1, 'выполнение': 1, 'просрочен': 0,
            'комментарий': '' });
        const d = dataHost({
            instrAll: [
                mk(1, D(NOWY - 2, '06-01')),   // слишком давно — НЕТ
                mk(2, D(NOWY - 1, '06-01')),   // предыдущий — ДА
                mk(3, D(NOWY, '03-02')),       // текущий — ДА
                mk(4, D(NOWY + 1, '03-02')),   // следующий — ДА
                mk(5, D(NOWY + 2, '03-02'))    // слишком далеко — НЕТ
            ]
        })._workersArchiveData();
        assertEqual(d.instr.length, 4, 'шапка + 3 записи (prev/cur/next)');
        const dates = d.instr.slice(1).map(r => r[3]);
        assertEqual(dates.join(','),
            ['01.06.' + (NOWY - 1), '02.03.' + NOWY,
             '02.03.' + (NOWY + 1)].join(','),
            'вошли ровно prev/cur/next (Task 446: дата проведения — [3]); ' +
            'все записи одного работника — подряд');
    });

    test('инструктажи: дата_проведения приоритетнее дата_начала', () => {
        const d = dataHost({
            instrAll: [
                { id: 7, 'таб_номер': '017', 'тип': 'проверка_знаний',
                  'тема': 'до 1000 В', 'дата_начала': D(NOWY - 5, '01-01'),
                  'дата_проведения': D(NOWY, '05-20'),
                  'дата_окончания': D(NOWY, '05-20'),
                  'длительность_дней': 1, 'выполнение': 1,
                  'просрочен': 0, 'комментарий': '' }
            ]
        })._workersArchiveData();
        assertEqual(d.instr.length, 2,
            'запись вошла по дата_проведения (дата_начала вне диапазона)');
    });

    test('мероприятия: только текущий год (период пересекает год)', () => {
        const mk = (id, s, e) => ({
            id: id, 'таб_номер': '017', 'тип': 'обучение', 'тема': 'Курс',
            'дата_начала': s, 'дата_окончания': e,
            'длительность_дней': 3, 'комментарий': '' });
        const d = dataHost({
            eventsAll: [
                mk(1, D(NOWY - 1, '12-28'), D(NOWY - 1, '12-30')), // прошлый год — НЕТ
                mk(2, D(NOWY - 1, '12-29'), D(NOWY, '01-05')),     // пересекает — ДА
                mk(3, D(NOWY, '09-01'), D(NOWY, '09-03')),         // текущий — ДА
                mk(4, D(NOWY, '12-30'), D(NOWY + 1, '01-05')),     // пересекает вперёд — ДА
                mk(5, D(NOWY + 1, '03-01'), D(NOWY + 1, '03-03'))  // след. год — НЕТ
            ]
        })._workersArchiveData();
        assertEqual(d.events.length, 4, 'шапка + 3 (пересекающие текущий год)');
        const starts = d.events.slice(1).map(r => r[3]);
        assertEqual(starts.join(','),
            ['29.12.' + (NOWY - 1), '01.09.' + NOWY,
             '30.12.' + NOWY].join(','),
            'вошли пересекающие год периоды (Task 446: дата начала — [3])');
    });

    test('СИЗ: полные колонки, «До износа» как есть, фолбэк ФИО', () => {
        const d = dataHost({
            ppe: [
                { id: 1, 'таб_номер': '031', 'работник': '', 'должность': '',
                  'наименование': 'Каска защитная',
                  'дата_выдачи': D(NOWY, '01-15'),
                  'дата_изготовления': D(NOWY - 1, '06-01'),
                  'срок_годности': '2 года',
                  'дата_окончания': D(NOWY + 1, '06-01'),
                  'примечание': 'заменить по плану' },
                { id: 2, 'таб_номер': '017', 'работник': 'Иванов И. И.',
                  'должность': 'Слесарь КИПиА',
                  'наименование': 'Очки закрытые',
                  'дата_выдачи': '', 'дата_изготовления': '',
                  'срок_годности': 'До износа',
                  'дата_окончания': 'До износа',
                  'примечание': '' }
            ]
        })._workersArchiveData();
        assertEqual(d.ppe.length, 3, 'шапка + 2 СИЗ');
        // Task 459: сортировка по ФАМИЛИЯМ — Иванов (очки) →
        // Сидоров (каска); таб. № больше не первичный ключ
        assertEqual(d.ppe[1][2], 'Очки закрытые',
            'первый — Иванов (по фамилии, Task 459)');
        assertEqual(d.ppe[2][2], 'Каска защитная',
            'второй — Сидоров (по фамилии)');
        const row = d.ppe[2];
        assertEqual(row[0], 'Сидоров С. С.',
            'пустое поле «работник» — ФИО из справочника (фолбэк)');
        assertEqual(row[3], '15.01.' + NOWY, 'дата выдачи dd.mm.yyyy');
        assertEqual(row[4], '01.06.' + (NOWY - 1), 'дата изготовления');
        assertEqual(row[5], '2 года', 'срок годности как есть');
        assertEqual(row[6], '01.06.' + (NOWY + 1), 'дата окончания dd.mm.yyyy');
        assertEqual(d.ppe[1][6], 'До износа', '«До износа» — текст без форматирования');
        assertEqual(d.ppe[1][0], 'Иванов И. И.', 'своё поле «работник» приоритетно');
    });

    test('лист «Работники» не изменился (справочник)', () => {
        const d = dataHost()._workersArchiveData();
        assertEqual(d.employees[0].join('|'),
            'Таб. №|ФИО|Тип|Смена|Должность|Группа допуска|Дата приёма',
            'колонки справочника прежние');
        assertEqual(d.employees[1][1], 'Иванов И. И.', 'сортировка по ФИО');
        assertEqual(d.employees[1][6], '15.03.2024', 'дата приёма dd.mm.yyyy');
    });
});

// ============================================================
// 5. VM — saveWorkersArchive: годы отпусков через промис
// ============================================================
describe('Task 445 — VM: saveWorkersArchive (ленивые годы)', () => {

    function saveHost(level, withEnsure) {
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
            "_isoDate: function(d) { return '2026-09-29'; }," +
            '_viewLevel: ' + JSON.stringify(level) + ',' +
            '_EMPLOYEES: [{ "таб_номер": "017", "ФИО": "Иванов И. И." }],' +
            '_INSTR_ALL: [], _EVENTS_ALL: [], _TRAININGS: [], _PPE: [],' +
            '_VACATIONS: [], _vacYear: 0,' +
            (withEnsure
                ? ('_VAC_YEARS: {},' +
                   '_vacYearEnsure: function(years) {' +
                   '  var self = this;' +
                   '  years.forEach(function(y) {' +
                   '    if (y === ' + (NOWY - 1) + ') self._VAC_YEARS[y] = [' +
                   "    { id: 51, 'таб_номер': '017', часть: 1," +
                   "      'дата_начала': '" + D(NOWY - 1, '07-01') + "'," +
                   "      'дата_окончания': '" + D(NOWY - 1, '07-14') + "'," +
                   '      дней: 14, комментарий: "" }];' +
                   '    else self._VAC_YEARS[y] = self._VAC_YEARS[y] || [];' +
                   '  });' +
                   '  return Promise.resolve(true);' +
                   '}')
                : '') +
            '});')(KipToast);
        host._wsDownload = function(b, m, n) {
            dl.calls.push({ m: m, n: n });
            return true;
        };
        return { host: host, dl: dl, toasts: toasts };
    }

    test('с _vacYearEnsure: книга собирается ПОСЛЕ подтяжки годов', () => {
        const r = saveHost('edit', true);
        const p = r.host.saveWorkersArchive();
        assertEqual(r.dl.calls.length, 0,
            'синхронно ничего не скачалось — ждём промис');
        assertTrue(p && typeof p.then === 'function',
            'saveWorkersArchive вернул промис (then→build)');
        return p.then(function() {
            assertEqual(r.dl.calls.length, 1, 'скачивание после промиса');
            assertTrue(r.toasts.length >= 1, 'тост показан');
            assertTrue(r.toasts[0].indexOf('1 отпуск') !== -1,
                'отпуск прошлого года вошёл в книгу (подтянут _vacYearEnsure)');
            assertTrue(r.toasts[0].indexOf('Архив скачан') !== -1,
                'тост «Архив скачан»');
        });
    });

    test('без _vacYearEnsure (VM): сборка синхронная', () => {
        const r = saveHost('view', false);
        r.host.saveWorkersArchive();
        assertEqual(r.dl.calls.length, 1,
            'скачивание сразу — промиса нет');
        assertEqual(r.toasts.length, 1, 'тост один');
        assertTrue(r.toasts[0].indexOf('0 отпусков') !== -1,
            'отпусков нет (пул пуст)');
    });

    test('уровень min — тишина', () => {
        const r = saveHost('min', true);
        r.host.saveWorkersArchive();
        assertEqual(r.dl.calls.length, 0, 'выгрузки нет');
        assertEqual(r.toasts.length, 0, 'тоста нет');
    });
});

// ============================================================
// 6. SW + регресс
// ============================================================
describe('Task 445 — SW и регресс', () => {

    test('SW: кэш поднят до kipia-test-v740 (Task 445)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v740'") !== -1,
            'CACHE_VERSION = kipia-test-v740');
        assertTrue(SW_SRC.indexOf('Task 445') !== -1,
            'комментарий Task 445 в истории версий');
    });

    test('guard: двойного бампа не было', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v741') === -1,
            'kipia-test-v741 не существует');
    });

    test('регресс: старый листовой Excel не вернулся', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_buildArchiveWorkbook'));
        const iE = fn.indexOf("name: 'Работники'");
        const iV = fn.indexOf("name: 'Отпуска'");
        const iI = fn.indexOf("name: 'Инструктажи'");
        const iP = fn.indexOf("name: 'СИЗ'");
        const iM = fn.indexOf("name: 'Мероприятия'");
        assertTrue([iE, iV, iI, iP, iM].every(i => i !== -1) &&
                   iE < iV && iV < iI && iI < iP && iP < iM,
            'все ПЯТЬ листов по порядку (прежние «Работники→Инструктажи→Мероприятия» нет)');
    });
});
