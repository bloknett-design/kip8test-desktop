// tests/test-work-schedule.js
// Task 201: тесты для модуля «График работы» (WorkSchedule)
//
// Что проверяется (на стороне сервера — WorkSchedule.gs):
//   1. Соответствие типа мероприятия → код статуса
//   2. Алгоритм вычисления дня цикла (по образцу серверного)
//   3. Конвертация ISO-даты в Date и обратно (без таймзон-сдвига)
//
// Запуск: через tests/run-all.js (require './test-work-schedule.js').
//
// Тесты запускаются в Node.js. Серверный код (.gs) загружается через
// статический экстрактор — мы не запускаем Apps Script в Node, а просто
// проверяем чистые функции и инварианты.

const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

// ============================================================
// Утилиты, повторяющие серверную логику (из WorkSchedule.gs)
// Используются как референс-имплементация для тестов.
// ============================================================

// Соответствие тип мероприятия → код статуса (Task 306: + прогул/примечание)
const TRAINING_TYPE_TO_STATUS = {
    'инструктаж':      'И',
    'обучение':        'ОБ',
    'проверка_знаний': 'ПЗ',
    'прогул':          'ПР',
    'примечание':      '*'
};

// Конвертация ISO YYYY-MM-DD → Date (без timezone-сдвига)
function parseIsoDate(s) {
    if (!s) return null;
    if (s instanceof Date) return s;
    const parts = String(s).split('-');
    if (parts.length !== 3) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m - 1, d);
}

// Date → ISO YYYY-MM-DD
function toIsoDate(dt) {
    if (!dt) return null;
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

// Количество дней в месяце (1..31)
function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

// Алгоритм вычисления дня цикла (как на сервере):
//   dayOfCycle = ((diffDays % cycle) + cycle) % cycle + 1
function dayOfCycle(startDate, currentDate, cycle) {
    const diffMs = currentDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    return ((diffDays % cycle) + cycle) % cycle + 1;
}

// ============================================================
// Тесты
// ============================================================

describe('График работы — WorkSchedule', () => {

    describe('Соответствие типа мероприятия → код статуса', () => {
        test('инструктаж → И', () => {
            assertEqual(TRAINING_TYPE_TO_STATUS['инструктаж'], 'И');
        });
        test('обучение → ОБ', () => {
            assertEqual(TRAINING_TYPE_TO_STATUS['обучение'], 'ОБ');
        });
        test('проверка_знаний → ПЗ', () => {
            assertEqual(TRAINING_TYPE_TO_STATUS['проверка_знаний'], 'ПЗ');
        });
        test('неизвестный тип → undefined', () => {
            assertTrue(TRAINING_TYPE_TO_STATUS['unknown'] === undefined);
        });
    });

    describe('Парсинг ISO даты', () => {
        test('YYYY-MM-DD → Date с правильным годом/месяцем/днём', () => {
            const d = parseIsoDate('2026-08-15');
            assertEqual(d.getFullYear(), 2026);
            assertEqual(d.getMonth(), 7);  // август = 7
            assertEqual(d.getDate(), 15);
        });
        test('null → null', () => {
            assertEqual(parseIsoDate(null), null);
        });
        test('пустая строка → null', () => {
            assertEqual(parseIsoDate(''), null);
        });
        test('некорректный формат → null', () => {
            assertEqual(parseIsoDate('15/08/2026'), null);
            assertEqual(parseIsoDate('2026-08'), null);
        });
        test('Date → Date (identity)', () => {
            const d = new Date(2026, 7, 15);
            const result = parseIsoDate(d);
            assertTrue(result instanceof Date);
            assertEqual(result.getFullYear(), 2026);
        });
    });

    describe('Конвертация Date → ISO', () => {
        test('Date → YYYY-MM-DD', () => {
            const d = new Date(2026, 7, 15);
            assertEqual(toIsoDate(d), '2026-08-15');
        });
        test('Date с днём < 10 → с ведущим нулём', () => {
            const d = new Date(2026, 0, 5);
            assertEqual(toIsoDate(d), '2026-01-05');
        });
        test('null → null', () => {
            assertEqual(toIsoDate(null), null);
        });
    });

    describe('Round-trip ISO → Date → ISO', () => {
        test('2026-01-01 round-trip', () => {
            const iso = '2026-01-01';
            assertEqual(toIsoDate(parseIsoDate(iso)), iso);
        });
        test('2026-12-31 round-trip', () => {
            const iso = '2026-12-31';
            assertEqual(toIsoDate(parseIsoDate(iso)), iso);
        });
        test('2026-02-29 round-trip (високосный год)', () => {
            const iso = '2024-02-29';
            assertEqual(toIsoDate(parseIsoDate(iso)), iso);
        });
    });

    describe('Количество дней в месяце', () => {
        test('янв 2026 = 31', () => assertEqual(daysInMonth(2026, 1), 31));
        test('фев 2026 = 28', () => assertEqual(daysInMonth(2026, 2), 28));
        test('фев 2024 = 29 (високосный)', () => assertEqual(daysInMonth(2024, 2), 29));
        test('апр 2026 = 30', () => assertEqual(daysInMonth(2026, 4), 30));
        test('дек 2026 = 31', () => assertEqual(daysInMonth(2026, 12), 31));
    });

    describe('Алгоритм дня цикла', () => {
        // Pattern: 5-дневный (Д→Н→вых×3), старт = 2026-08-01
        // cycle = 5
        // 2026-08-01 — день 1 (Д)
        // 2026-08-02 — день 2 (Н)
        // 2026-08-03 — день 3 (вых)
        // 2026-08-04 — день 4 (вых)
        // 2026-08-05 — день 5 (вых)
        // 2026-08-06 — день 1 (Д) — цикл повторился
        test('старт = 2026-08-01, цикл=5, дата=2026-08-01 → день 1', () => {
            const start = parseIsoDate('2026-08-01');
            const cur = parseIsoDate('2026-08-01');
            assertEqual(dayOfCycle(start, cur, 5), 1);
        });
        test('старт = 2026-08-01, цикл=5, дата=2026-08-02 → день 2', () => {
            const start = parseIsoDate('2026-08-01');
            const cur = parseIsoDate('2026-08-02');
            assertEqual(dayOfCycle(start, cur, 5), 2);
        });
        test('старт = 2026-08-01, цикл=5, дата=2026-08-05 → день 5', () => {
            const start = parseIsoDate('2026-08-01');
            const cur = parseIsoDate('2026-08-05');
            assertEqual(dayOfCycle(start, cur, 5), 5);
        });
        test('старт = 2026-08-01, цикл=5, дата=2026-08-06 → день 1 (новый цикл)', () => {
            const start = parseIsoDate('2026-08-01');
            const cur = parseIsoDate('2026-08-06');
            assertEqual(dayOfCycle(start, cur, 5), 1);
        });
        test('старт = 2026-08-01, цикл=5, дата=2026-08-10 → день 5', () => {
            const start = parseIsoDate('2026-08-01');
            const cur = parseIsoDate('2026-08-10');
            assertEqual(dayOfCycle(start, cur, 5), 5);
        });
        test('старт = 2026-08-01, цикл=5, дата=2026-08-11 → день 1', () => {
            const start = parseIsoDate('2026-08-01');
            const cur = parseIsoDate('2026-08-11');
            assertEqual(dayOfCycle(start, cur, 5), 1);
        });
        test('отрицательный diff (дата раньше старта) → корректный день цикла', () => {
            // дата на 1 день раньше старта — должна дать последний день цикла
            const start = parseIsoDate('2026-08-02');
            const cur = parseIsoDate('2026-08-01');
            // diffDays = -1, cycle=5 → ((-1 % 5) + 5) % 5 + 1 = 4 + 1 = 5
            assertEqual(dayOfCycle(start, cur, 5), 5);
        });
        test('7-дневный цикл 5/2: старт=пн, через неделю → день 1', () => {
            const start = parseIsoDate('2026-08-03');  // понедельник
            const cur = parseIsoDate('2026-08-10');    // следующий понедельник
            assertEqual(dayOfCycle(start, cur, 7), 1);
        });
    });

    describe('Индекс ключа записи (дата|таб_номер)', () => {
        // Имитация логики _buildEntryIndex из WorkSchedule клиента.
        // Используем bracket-нотацию, т.к. символ № не входит в valid identifier.
        function buildIndex(entries) {
            const idx = {};
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                idx[e['дата'] + '|' + e['таб_номер']] = e;
            }
            return idx;
        }
        test('ключ формируется как ISO|таб_номер', () => {
            const idx = buildIndex([
                { 'дата': '2026-08-15', 'таб_номер': '2741', 'статус': 'Д' }
            ]);
            assertTrue('2026-08-15|2741' in idx);
        });
        test('последняя запись перезаписывает предыдущую с тем же ключом', () => {
            const idx = buildIndex([
                { 'дата': '2026-08-15', 'таб_номер': '2741', 'статус': 'Д', _v: 1 },
                { 'дата': '2026-08-15', 'таб_номер': '2741', 'статус': 'И', _v: 2 }
            ]);
            assertEqual(idx['2026-08-15|2741']['статус'], 'И');
        });
        test('разные таб_номер в один день → разные ключи', () => {
            const idx = buildIndex([
                { 'дата': '2026-08-15', 'таб_номер': '2741', 'статус': 'Д' },
                { 'дата': '2026-08-15', 'таб_номер': '5464', 'статус': 'Н' }
            ]);
            assertEqual(idx['2026-08-15|2741']['статус'], 'Д');
            assertEqual(idx['2026-08-15|5464']['статус'], 'Н');
        });
    });

    describe('Серверный WorkSchedule.gs: статичные поля', () => {
        // Читаем файл и проверяем ключевые константы без выполнения
        const fs = require('fs');
        const path = require('path');
        const gsPath = path.resolve(__dirname, '..', 'scripts', 'WorkSchedule.gs');
        let gsContent = '';
        try {
            gsContent = fs.readFileSync(gsPath, 'utf8');
        } catch (e) {
            // файл не найден — тест ниже провалится
        }

        test('файл WorkSchedule.gs существует', () => {
            assertTrue(gsContent.length > 0, 'WorkSchedule.gs должен существовать');
        });

        test('SPREADSHEET_ID указывает на новую таблицу графика', () => {
            assertTrue(gsContent.indexOf("1MQtW-CWCmjlu-SAeVBllKDP6NRkiOkmW-7xgOjHskWY") !== -1,
                'SPREADSHEET_ID должен указывать на новую таблицу');
        });

        test('имена листов на русском', () => {
            // Константы заданы с разными отступами, проверяем через 'имя_листа':
            assertTrue(gsContent.indexOf("'Сотрудники'") !== -1);
            assertTrue(gsContent.indexOf("'Коды_статусов'") !== -1);
            assertTrue(gsContent.indexOf("'Шаблоны_ротации'") !== -1);
            assertTrue(gsContent.indexOf("'Дни_цикла'") !== -1);
            assertTrue(gsContent.indexOf("'Инструктажи'") !== -1);
            assertTrue(gsContent.indexOf("'Записи_графика'") !== -1);
        });

        test('READ_ROLES и WRITE_ROLES ограничены только Админом (Task 204)', () => {
            // Task 204: доступ к графику работы ограничен — только Админ.
            // Ранее в READ_ROLES также были КИП ИОС/ИТР8/ИТР ИОС; в WRITE_ROLES — КИП ИОС+Админ.
            assertTrue(gsContent.indexOf("READ_ROLES: ['Админ']") !== -1);
            assertTrue(gsContent.indexOf("WRITE_ROLES: ['Админ']") !== -1);
        });

        test('TRAINING_TYPE_TO_STATUS: 5 типов → И/ОБ/ПЗ/ПР/* (Task 306)', () => {
            assertTrue(gsContent.indexOf("'инструктаж':       'И'") !== -1);
            assertTrue(gsContent.indexOf("'обучение':         'ОБ'") !== -1);
            assertTrue(gsContent.indexOf("'проверка_знаний':  'ПЗ'") !== -1);
            assertTrue(gsContent.indexOf("'прогул':           'ПР'") !== -1,
                'прогул → ПР (Task 306)');
            assertTrue(gsContent.indexOf("'примечание':       '*'") !== -1,
                'примечание → * (Task 306)');
        });

        test('все 11 endpoint-ов зарегистрированы в Code.gs', () => {
            const codePath = path.resolve(__dirname, '..', 'scripts', 'Code.gs');
            const codeContent = fs.readFileSync(codePath, 'utf8');
            const expectedActions = [
                'workSchedule.getStatusCodes',
                'workSchedule.getPatterns',
                'workSchedule.listEmployees',
                'workSchedule.listEntries',
                'workSchedule.listTrainings',
                'workSchedule.generateMonth',
                'workSchedule.setManualEntry',
                'workSchedule.deleteEntry',
                'workSchedule.addEmployee',
                'workSchedule.addTraining',
                'workSchedule.deleteTraining'
            ];
            for (const action of expectedActions) {
                assertTrue(codeContent.indexOf("case '" + action + "':") !== -1,
                    'Ожидается case в Code.gs: ' + action);
            }
        });
    });

    describe('Клиентский модуль в index.html: инварианты', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('var WorkSchedule = { определён', () => {
            assertTrue(html.indexOf('var WorkSchedule = {') !== -1);
        });

        test('HTML-страницы под-разделов (Task 308: только шахматка)', () => {
            assertTrue(html.indexOf('id="page-work-schedule"') !== -1);
            // Task 307: страница «Сотрудники» удалена (кнопка добавления —
            // в тулбаре над шахматкой)
            assertTrue(html.indexOf('id="page-work-schedule-employees"') === -1,
                'страницы «Сотрудники» больше нет (Task 307)');
            // Task 308: страницы «Инструктажи» и «Отпуска» удалены — модуль
            // одностраничный (кнопки добавления — в тулбаре/попапе ячейки)
            assertTrue(html.indexOf('id="page-work-schedule-trainings"') === -1,
                'страницы «Инструктажи» больше нет (Task 308)');
            assertTrue(html.indexOf('id="page-work-schedule-vacations"') === -1,
                'страницы «Отпуска» больше нет (Task 308)');
        });

        test('Кнопка меню на странице «Документация ИОС»', () => {
            assertTrue(html.indexOf("navigateTo('work-schedule')") !== -1);
        });

        test('navigateTo вызывает инициализатор модуля (Task 308: только шахматка)', () => {
            assertTrue(html.indexOf("page === 'work-schedule'") !== -1);
            assertTrue(html.indexOf("page === 'work-schedule-employees'") === -1,
                'хук work-schedule-employees удалён (Task 307)');
            assertTrue(html.indexOf("page === 'work-schedule-trainings'") === -1,
                'хук work-schedule-trainings удалён (Task 308)');
            assertTrue(html.indexOf("page === 'work-schedule-vacations'") === -1,
                'хук work-schedule-vacations удалён (Task 308)');
        });

        test('_WORK_SCHEDULE_PAGES в карте ролей', () => {
            assertTrue(html.indexOf('_WORK_SCHEDULE_PAGES') !== -1);
        });

        test('3 bottom-sheet-а для форм (cell/employee/training)', () => {
            assertTrue(html.indexOf('id="wsCellSheet"') !== -1);
            assertTrue(html.indexOf('id="wsEmpSheet"') !== -1);
            assertTrue(html.indexOf('id="wsTrSheet"') !== -1);
        });

        test('CSS-классы для шахматки', () => {
            assertTrue(html.indexOf('.ws-grid') !== -1);
            assertTrue(html.indexOf('.ws-cell') !== -1);
            assertTrue(html.indexOf('.ws-emp-col') !== -1);
            assertTrue(html.indexOf('.ws-day-col') !== -1);
        });
    });

    // ============================================================
    // Task 249: хлебные крошки страниц Графика работы.
    // До фикса: у work-schedule*-страниц не было записей ни в PAGE_PARENTS,
    // ни в PAGE_LABELS → крошки показывали raw id: «Главная / work-schedule».
    // После фикса: «Главная / График работы» (и полные пути у подразделов).
    // Task 267: work-schedule стал подразделом «Документации ИОС» —
    // цепочка стала ПОЛНОЙ: «Главная / Документация / Документация ИОС /
    // График работы» (см. тесты ниже и describe Task 267).
    // ============================================================
    describe('Task 249: крошки «Главная / График работы» вместо raw id', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');
        // Извлекаем блок PAGE_LABELS (regex по всему html цепляет и PAGE_PARENTS,
        // где 'work-schedule': 'dashboard' стоит выше по файлу)
        const labelsMatch = html.match(/const PAGE_LABELS = \{([\s\S]*?)\n    \};/);
        const labels = labelsMatch ? labelsMatch[1] : '';

        test('PAGE_LABELS: метка «Табель учёта рабочего времени» для work-schedule', () => {
            const m = labels.match(/'work-schedule':\s+'([^']+)'/);
            assertTrue(!!m, 'PAGE_LABELS должен содержать запись для work-schedule');
            // Task 321: раздел переименован («График работы» →
            // «Табель учёта рабочего времени»)
            assertEqual(m[1], 'Табель учёта рабочего времени',
                'Метка work-schedule — «Табель учёта рабочего времени» (Task 321, не raw id)');
        });

        test('PAGE_LABELS: подразделы удалены (Task 307/308: только шахматка)', () => {
            assertTrue(html.indexOf("'work-schedule-employees':") === -1,
                'записи work-schedule-employees в PAGE_LABELS нет (Task 307)');
            assertTrue(labels.indexOf("'work-schedule-trainings'") === -1,
                'записи work-schedule-trainings в PAGE_LABELS нет (Task 308)');
            assertTrue(labels.indexOf("'work-schedule-vacations'") === -1,
                'записи work-schedule-vacations в PAGE_LABELS нет (Task 308)');
        });

        test('PAGE_LABELS: метки не дублируются (единственная запись на страницу)', () => {
            const countMain = (labels.match(/'work-schedule':\s+'/g) || []).length;
            assertEqual(countMain, 1, 'Ровно одна запись work-schedule в PAGE_LABELS');
            const countTr = (labels.match(/'work-schedule-trainings':\s+'/g) || []).length;
            assertEqual(countTr, 0, 'Записей work-schedule-trainings нет (Task 308)');
        });

        test('PAGE_PARENTS: work-schedule — подраздел «Документации ИОС» (Task 267)', () => {
            // Task 249: был корневым ('dashboard'). Task 267: полная цепочка
            // крошек — «Главная / Документация / Документация ИОС / График
            // работы» (кнопка раздела живёт на page-docs-ios, рядом с
            // «Расходомерами хозрасчётными» — их цепочка построена так же)
            const re = /'work-schedule':\s+'docs-ios'/;
            assertTrue(re.test(html),
                'PAGE_PARENTS должен содержать work-schedule → docs-ios (полная цепочка крошек, Task 267)');
        });

        test('PAGE_PARENTS: подразделы удалены (Task 307/308: только шахматка)', () => {
            assertTrue(html.indexOf("'work-schedule-employees':  'work-schedule'") === -1,
                'записи work-schedule-employees в PAGE_PARENTS нет (Task 307)');
            assertTrue(html.indexOf("'work-schedule-trainings':  'work-schedule'") === -1,
                'записи work-schedule-trainings в PAGE_PARENTS нет (Task 308)');
            assertTrue(html.indexOf("'work-schedule-vacations':  'work-schedule'") === -1,
                'записи work-schedule-vacations в PAGE_PARENTS нет (Task 308)');
        });

        test('buildBreadcrumbPath: путь work-schedule = [docs, docs-ios, work-schedule] (Task 267)', () => {
            // Симуляция buildBreadcrumbPath с PAGE_PARENTS из index.html:
            // извлекаем карту и поднимаемся от work-schedule до dashboard.
            const mapMatch = html.match(/const PAGE_PARENTS = \{([\s\S]*?)\n    \};/);
            assertTrue(!!mapMatch, 'PAGE_PARENTS должен существовать в index.html');
            const entries = {};
            const re = /'([a-z0-9-]+)':\s+'([a-z0-9-]+)'/g;
            let mm;
            while ((mm = re.exec(mapMatch[1])) !== null) {
                if (!(mm[1] in entries)) entries[mm[1]] = mm[2]; // первая запись приоритетна
            }
            // Путь от work-schedule вверх
            const path = [];
            let cur = 'work-schedule';
            const visited = new Set();
            while (cur && cur !== 'dashboard' && !visited.has(cur)) {
                visited.add(cur);
                path.unshift(cur);
                cur = entries[cur] || null;
            }
            // Task 267: полная цепочка — Документация → Документация ИОС → График работы
            assertEqual(path.length, 3,
                'Путь work-schedule — три сегмента (полная цепочка, Task 267)');
            assertEqual(path[0], 'docs');
            assertEqual(path[1], 'docs-ios');
            assertEqual(path[2], 'work-schedule');
        });

        test('Метки совпадают с заголовками страниц (page-inline-header-title)', () => {
            // Заголовок страницы — источник истины для метки крошек.
            // Task 321: раздел переименован — заголовок и метка стали
            // «Табель учёта рабочего времени»
            assertTrue(html.indexOf('<div class="page-inline-header-title">Табель учёта рабочего времени</div>') !== -1,
                'Заголовок страницы work-schedule — «Табель учёта рабочего времени»');
            // Task 307/308: страницы «Сотрудники»/«Инструктажи»/«Отпуска»
            // удалены — их заголовков в разметке больше нет
            assertTrue(html.indexOf('<div class="page-inline-header-title">Инструктажи и обучения</div>') === -1,
                'Заголовка «Инструктажи и обучения» нет (страница удалена, Task 308)');
            assertTrue(html.indexOf('<div class="page-inline-header-title">Отпуска</div>') === -1,
                'Заголовка «Отпуска» нет (страница удалена, Task 308)');
        });

        // Task 249: SW-тест версии v508 удалён — версия v509 введена в
        // Task 250 (см. describe ниже). Историческая заметка.
    });

    // ============================================================
    // Task 250: десктопная версия «Графика работы»:
    //   1) коды статусов убраны (из ячеек и легенды);
    //   2) фон ячеек шахматки непрозрачный (было transparent у пустых);
    //   3) дашборд автоматически подгоняется по ширине экрана
    //      приложения, без горизонтальной прокрутки.
    // ============================================================
    describe('Task 250: коды статусов убраны из ячеек и легенды', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        // Task 252: тесты «код не выводится в ячейке» и «легенда без
        // кодов» удалены — Task 252 вернул коды в ячейки и убрал легенду
        // целиком (см. describe Task 252 ниже). Историческая заметка.

        test('JS: Task 311 — tooltip статуса убран (пояснения — в попапе клика)', () => {
            // Task 311: пояснительные тултипы с ячеек шахматки убраны —
            // название статуса показывает попап клика (_renderCellPopup)
            assertFalse(html.indexOf("var statusName = status;") !== -1,
                'переменная statusName удалена (тултип не собирается)');
            assertFalse(html.indexOf("titleParts.push('статус: '") !== -1,
                'строка «статус: …» больше не пишется в title');
        });

        test('JS: переработка — класс ws-overtime (маркер-точка вместо underline)', () => {
            assertTrue(html.indexOf("if (isOvertime) classes.push('ws-overtime');") !== -1,
                'Переработка должна добавлять класс ws-overtime');
            assertTrue(html.indexOf("text-decoration:underline;") === -1,
                'Прежний underline текста кода должен быть удалён (текста в ячейке нет)');
        });
    });

    describe('Task 250: фон ячеек шахматки непрозрачный', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('JS: inline-фон «transparent» убран из _renderCell', () => {
            assertTrue(html.indexOf(": 'transparent'") === -1,
                'Пустые ячейки не должны получать inline transparent-фон');
            // Статусные ячейки — inline цвет; пустые — CSS-фон.
            // Task 314: фон ставится по showMainCode («.» и статусы-
            // мероприятия красятся CSS — как пустые, событие — бейджем)
            assertTrue(html.indexOf("if (showMainCode) style += 'background:' + color + ';';") !== -1,
                'Inline-фон задаётся только статусным ячейкам (цвет справочника)');
        });

        test('CSS: сплошной фон ячеек (.ws-grid tbody td.ws-cell)', () => {
            const re = /\.ws-grid tbody td\.ws-cell \{[^}]*background:\s*var\(--bg-primary, #1a2233\);[^}]*\}/;
            assertTrue(re.test(html),
                'Ячейки должны иметь сплошной (непрозрачный) CSS-фон в тёмной теме');
        });

        test('CSS: сплошной фон ячеек в светлой теме', () => {
            const re = /\[data-theme="light"\] \.ws-grid tbody td\.ws-cell \{[^}]*background:\s*#FFFFFF;[^}]*\}/;
            assertTrue(re.test(html),
                'Светлая тема: сплошной фон пустых ячеек (#FFFFFF, Task 379)');
        });

        test('CSS: маркер переработки — точка ::after в углу ячейки', () => {
            const re = /\.ws-grid tbody td\.ws-cell\.ws-overtime::after \{[^}]*border-radius:\s*50%;[^}]*\}/;
            assertTrue(re.test(html),
                'ws-overtime::after — круглая точка (маркер переработки)');
        });
    });

    describe('Task 250: десктоп — вся ширина экрана, без прокрутки', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: table-layout: fixed + width: 100% для шахматки (≥1024px)', () => {
            assertTrue(html.indexOf('#page-work-schedule .ws-grid {\n            width: 100%;') !== -1,
                'Таблица должна занимать 100% ширины контейнера');
            assertTrue(html.indexOf('table-layout: fixed;') !== -1,
                'table-layout: fixed — колонки дней делят ширину поровну');
        });

        test('CSS: горизонтальная прокрутка отключена на десктопе', () => {
            const re = /@media \(min-width: 1024px\) \{[^@]*?#page-work-schedule \.ws-grid-wrap \{\s*\n\s*overflow-x: hidden;/;
            assertTrue(re.test(html),
                '.ws-grid-wrap на десктопе — overflow-x: hidden (без прокрутки)');
        });

        test('CSS: колонка сотрудников — по самому широкому тексту (Task 325)', () => {
            assertTrue(html.indexOf('#page-work-schedule .ws-grid thead th.ws-emp-col {') !== -1,
                'правило ширины колонки сотрудников есть');
            const m = /#page-work-schedule \.ws-grid thead th\.ws-emp-col \{[^}]*width:\s*var\(--ws-emp-w, 200px\)/.exec(html);
            assertTrue(!!m, 'ширина — var(--ws-emp-w, 200px): JS-замер самого широкого ФИО (_measureEmpCol), 200px — фолбэк');
            const reDay = /#page-work-schedule \.ws-grid thead th\.ws-day-col \{[^}]*width:\s*auto;[^}]*min-width:\s*0;/;
            assertTrue(reDay.test(html),
                'Колонки дней: width auto + min-width 0 (делят остаток ширины)');
        });

        test('CSS: ФИО — эллипсис в фиксированной колонке', () => {
            const re = /#page-work-schedule \.ws-grid tbody td\.ws-emp-col \{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;/;
            assertTrue(re.test(html),
                'Длинные ФИО обрезаются эллипсисом, не растягивая таблицу');
        });

        // Task 250: SW-тест версии v509 удалён — версия v510 введена в
        // Task 251 (см. describe ниже). Историческая заметка.
    });

    // ============================================================
    // Task 251: переделанный ввод статусов в шахматке:
    //   1) клик по ячейке → попап-табличка «код — название» рядом с ячейкой;
    //   2) выбор статуса отображается в ячейке ЛОКАЛЬНО (накопление в
    //      _PENDING), мгновенной передачи на сервер НЕТ;
    //   3) кнопка «Сохранить» — пакетная отправка всех изменений на сервер
    //      (setManualEntry/deleteEntry) с последующей синхронизацией
    //      (loadGrid перечитывает данные из БД).
    // ============================================================
    describe('Task 251: попап выбора статуса рядом с ячейкой', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('HTML: элементы попапа (#wsCellPopup + #wsPopupCloser) существуют', () => {
            assertTrue(html.indexOf('id="wsCellPopup"') !== -1,
                'Должен быть контейнер попапа #wsCellPopup');
            assertTrue(html.indexOf('id="wsPopupCloser"') !== -1,
                'Должен быть прозрачный клик-ловец #wsPopupCloser (закрытие по клику мимо)');
        });

        test('JS: клик по ячейке вызывает onCellClick (не openCellForm)', () => {
            // В HTML onclick собирается в JS-строке: onCellClick(event, \'...\')
            assertTrue(html.indexOf("WorkSchedule.onCellClick(event, \\\''") !== -1,
                'onclick ячейки должен открывать попап: onCellClick(event, ...)');
            // Старый мгновенно-сохраняющий обработчик в ячейках удалён
            assertTrue(html.indexOf("WorkSchedule.openCellForm(\\'") === -1,
                'openCellForm не должен вызываться напрямую из onclick ячейки');
        });

        test('JS: попап рендерит строки «код + название» столбиком', () => {
            assertTrue(html.indexOf("WorkSchedule.onPopupStatus(\\'") !== -1,
                'Строки попапа: клик → onPopupStatus(код)');
            assertTrue(html.indexOf('<span class="ws-popup-code">') !== -1,
                'Код статуса в попапе (.ws-popup-code)');
            assertTrue(html.indexOf('<span class="ws-popup-name">') !== -1,
                'Название статуса в попапе (.ws-popup-name)');
            // Task 312: строка «— выходной —» (кода «—» нет в таблице
            // «Коды_статусов») УДАЛЕНА из попапа — очистка в «Дополнительно…»
            const popupFn = html.slice(html.indexOf('_renderCellPopup: function'),
                                       html.indexOf('_openCellPopup: function'));
            assertTrue(popupFn.indexOf('>выходной</span>') === -1,
                'Task 312: строки «— выходной —» в попапе больше нет');
            assertTrue(popupFn.indexOf('ws-popup-swatch-empty') === -1,
                'Task 312: класс ws-popup-swatch-empty не используется');
            assertTrue(popupFn.indexOf('this._EVENT_CODES.indexOf(c.code) !== -1') !== -1,
                'Task 312: коды мероприятий отфильтрованы из списка основных');
        });

        test('JS: строка «Дополнительно…» открывает sheet расширенной правки', () => {
            assertTrue(html.indexOf('onclick="WorkSchedule.onPopupMore()">Дополнительно…') !== -1,
                'Попап должен содержать «Дополнительно…» → onPopupMore → openCellForm');
        });

        test('CSS: попап — фиксированное позиционирование + строки столбиком', () => {
            const reFixed = /\.ws-cell-popup \{[^}]*position:\s*fixed;/;
            assertTrue(reFixed.test(html),
                '.ws-cell-popup — position: fixed (позиция у ячейки через JS)');
            const reRow = /\.ws-popup-row \{[^}]*display:\s*flex;/;
            assertTrue(reRow.test(html),
                '.ws-popup-row — flex-строки (табличка код—название столбиком)');
        });
    });

    describe('Task 251: накопление правок без мгновенной отправки', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('JS: буфер _PENDING в состоянии модуля', () => {
            assertTrue(html.indexOf('_PENDING: {},') !== -1,
                'Модуль должен содержать _PENDING — буфер локальных правок');
        });

        test('JS: onPopupStatus применяет статус ЛОКАЛЬНО (без _api)', () => {
            // Извлекаем метод onPopupStatus и проверяем: _applyCellStatus +
            // _renderGrid, и НЕТ вызова _api (мгновенной отправки нет)
            const m = html.match(/onPopupStatus: function\(code\) \{[\s\S]*?\n        \},/);
            assertTrue(!!m, 'Метод onPopupStatus должен существовать');
            const body = m[0];
            assertTrue(body.indexOf('this._applyCellStatus(') !== -1,
                'onPopupStatus должен применять статус через _applyCellStatus');
            assertTrue(body.indexOf('this._renderGrid();') !== -1,
                'onPopupStatus должен перерисовывать сетку (статус сразу в ячейке)');
            assertTrue(body.indexOf('_api(') === -1,
                'onPopupStatus НЕ должен вызывать _api — мгновенной отправки быть не должно');
        });

        test('JS: _applyCellStatus не обращается к серверу', () => {
            // Task 523: сигнатура расширена временем начала/окончания
            // (колонки L/M) — локальность метода не менялась
            const m = html.match(/_applyCellStatus: function\(isoDate, tabNo, code, hours, время_начала, время_окончания\) \{[\s\S]*?\n        \},/);
            assertTrue(!!m, 'Метод _applyCellStatus должен существовать');
            assertTrue(m[0].indexOf('_api(') === -1,
                '_applyCellStatus — только локальный _PENDING, без сервера');
            assertTrue(m[0].indexOf('__delete: true') !== -1,
                '_applyCellStatus должен уметь планировать удаление (__delete)');
        });

        test('JS: «выходной» на ручной записи → __delete; на авто — запись «.» (Task 453)', () => {
            const m = html.match(/_applyCellStatus: function\(isoDate, tabNo, code, hours, время_начала, время_окончания\) \{[\s\S]*?\n        \},/);
            const body = m[0];
            assertTrue(body.indexOf("server.источник === 'руч') {") !== -1 &&
                       body.indexOf('__delete: true') !== -1,
                'Очистка ручной записи → __delete (удаление при сохранении)');
            // Task 453: «Выходной» поверх авто-смены = ручная запись «.»
            assertTrue(body.indexOf("'статус': '.'") !== -1,
                'Task 453: «Выходной» на авто-записи → ручная «.» (плановый выходной поверх авто)');
            assertTrue(body.indexOf('Выходной поставлен поверх авто-записи') !== -1,
                'Task 453: понятный тост вместо отказа');
            assertTrue(body.indexOf("KipToast.show('Нельзя очистить авто-запись") === -1,
                'Task 453: прежний тост-отказ «Нельзя очистить авто-запись» удалён');
        });

        test('JS: submitCellForm накапливает локально (без setManualEntry)', () => {
            const m = html.match(/submitCellForm: function\(\) \{[\s\S]*?\n        \},/);
            assertTrue(!!m, 'Метод submitCellForm должен существовать');
            assertTrue(m[0].indexOf('_setPendingCell(') !== -1,
                'submitCellForm должен писать в _PENDING (локально)');
            assertTrue(m[0].indexOf('setManualEntry') === -1,
                'submitCellForm НЕ должен вызывать setManualEntry напрямую');
        });

        test('JS: рендер ячейки учитывает pending (класс ws-pending)', () => {
            assertTrue(html.indexOf("if (isPending) classes.push('ws-pending');") !== -1,
                'Ячейка с несохранённой правкой — класс ws-pending');
            const re = /\.ws-grid tbody td\.ws-cell\.ws-pending \{[^}]*outline:\s*2px dashed/;
            assertTrue(re.test(html),
                'CSS: ws-pending — пунктирная рамка (маркер несохранённой ячейки)');
            // Task 311: тултип «не сохранено» убран вместе с остальными
            // пояснительными окнами при наведении (рамка-маркер осталась)
            assertFalse(html.indexOf("if (isPending) titleParts.push('не сохранено');") !== -1,
                'текст «не сохранено» из title удалён (Task 311)');
        });

        test('JS: _renderGrid накладывает _PENDING на серверные данные', () => {
            const re = /var pending = this\._PENDING\[key\] \|\| null;/;
            assertTrue(re.test(html),
                '_renderGrid должен читать _PENDING для каждой ячейки');
            assertTrue(html.indexOf('Object.assign({}, entry || {}, pending,') !== -1,
                'Слияние: pending перекрывает серверную запись (эффективное состояние)');
        });
    });

    describe('Task 251: кнопка «Сохранить» — пакетная отправка и синхронизация', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('HTML: кнопка #wsSaveBtn в тулбаре', () => {
            const re = /<button type="button" id="wsSaveBtn" class="ws-save-btn" onclick="WorkSchedule\.saveAll\(\)" hidden>Сохранить<\/button>/;
            assertTrue(re.test(html),
                'Кнопка «Сохранить» (saveAll) должна быть в тулбаре, скрыта по умолчанию');
        });

        test('JS: _updateSaveBtn — счётчик правок и скрытие при нуле', () => {
            const m = html.match(/_updateSaveBtn: function\(\) \{[\s\S]*?\n        \},/);
            assertTrue(!!m, 'Метод _updateSaveBtn должен существовать');
            // Task 315: show = права && есть правки — скрывает и
            // «Сохранить», и «Отменить», и всю строку 2 тулбара
            assertTrue(m[0].indexOf('var show = this._canEdit && n > 0;') !== -1,
                'видимость — права И наличие правок (Task 315)');
            assertTrue(m[0].indexOf('btn.hidden = !show;') !== -1,
                'кнопка скрыта без прав или без правок');
            assertTrue(m[0].indexOf("'Сохранить (' + n + ')'") !== -1,
                'Текст кнопки — со счётчиком правок');
        });

        test('JS: saveAll отправляет setManualEntry и deleteEntry', () => {
            const m = html.match(/saveAll: function\(\) \{[\s\S]*?\n        \},/);
            assertTrue(!!m, 'Метод saveAll должен существовать');
            assertTrue(m[0].indexOf("self._api('workSchedule.deleteEntry', payload)") !== -1,
                'saveAll: pending __delete → deleteEntry');
            assertTrue(m[0].indexOf("self._api('workSchedule.setManualEntry', payload)") !== -1,
                'saveAll: правка статуса → setManualEntry');
        });

        test('JS: saveAll синхронизируется — loadGrid после отправки', () => {
            const m = html.match(/saveAll: function\(\) \{[\s\S]*?\n        \},/);
            // Task 314: loadGrid(true) — только сеть (кэш не подменяет
            // свежие данные после правок)
            assertTrue(m[0].indexOf('self.loadGrid(true);') !== -1,
                'После пакетной отправки — loadGrid(true) (перечитать данные из БД)');
        });

        test('JS: успешные правки удаляются из _PENDING, ошибки остаются', () => {
            const m = html.match(/saveAll: function\(\) \{[\s\S]*?\n        \},/);
            assertTrue(m[0].indexOf('delete self._PENDING[key];') !== -1,
                'Успешная отправка — правка удаляется из _PENDING');
            assertTrue(m[0].indexOf('failCount++;') !== -1,
                'Ошибка отправки — правка остаётся в _PENDING (можно повторить)');
        });

        test('JS: защита от повторного запуска (_saving)', () => {
            const m = html.match(/saveAll: function\(\) \{[\s\S]*?\n        \},/);
            assertTrue(m[0].indexOf('if (this._saving) return;') !== -1,
                'saveAll должен игнорировать повторный клик во время сохранения');
        });

        test('JS: Esc закрывает попап, beforeunload предупреждает о правках', () => {
            // Task 309: Esc закрывает И статусный попап, И карточку
            // сотрудника — проверяем оба вызова в общем обработчике
            const escIdx = html.indexOf("if (ev.key === 'Escape')");
            assertTrue(escIdx !== -1, 'обработчик Escape жив');
            assertTrue(escIdx !== -1 &&
                html.indexOf('selfOnce.closeCellPopup();', escIdx) !== -1 &&
                html.indexOf('selfOnce.closeCellPopup();', escIdx) <
                html.indexOf('selfOnce.closeEmpPopup();', escIdx),
                'Esc закрывает попап статуса и карточку сотрудника');
            assertTrue(html.indexOf("Object.keys(selfOnce._PENDING).length > 0") !== -1,
                'beforeunload должен предупреждать при несохранённых правках');
        });

        // Task 252: SW-тест версии v510 удалён — версия v511 введена в
        // Task 252 (см. describe ниже). Историческая заметка.
    });

    // ============================================================
    // Task 252: «График работы» — чистка десктопного дашборда:
    //   1) легенды под шахматкой убраны совсем (HTML/CSS/JS);
    //   2) шахматка растянута до самого низа окна (десктоп ≥1024px):
    //      страница — flex-колонка, ws-grid-wrap flex:1 + скролл,
    //      таблица height:100% — строки делят свободную высоту;
    //   3) тулбар с кнопками — на всю ширину, ровно между баром
    //      хлебных крошек (page-inline-header) и графиком;
    //   4) коды статусов ВЕРНУТЫ в ячейки шахматки (цвет + код,
    //      как до Task 250; непрозрачный фон Task 250 сохранён).
    // ============================================================
    describe('Task 252: легенда под шахматкой полностью убрана', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('HTML: элемент #wsLegend удалён со страницы', () => {
            assertTrue(html.indexOf('id="wsLegend"') === -1,
                'Контейнер легенды #wsLegend не должен существовать');
            assertTrue(html.indexOf('class="ws-legend"') === -1,
                'Элемент .ws-legend не должен существовать');
        });

        test('JS: метод _renderLegend удалён из модуля WorkSchedule', () => {
            // Task 385: новая легенда зовётся _renderLegendSheet (шторка
            // «Легенда» тулбара) — могильник проверяет ТОЧНЫЕ формы
            // старого метода (объявление и вызов)
            assertTrue(html.indexOf('_renderLegend: function') === -1 &&
                       html.indexOf('this._renderLegend()') === -1,
                'Ни метод, ни вызов _renderLegend не должны остаться в коде');
        });

        test('CSS: правила .ws-legend / .ws-legend-item / .ws-legend-swatch удалены', () => {
            const reItem = /\.ws-legend-item\s*\{/;
            const reSwatch = /\.ws-legend-swatch\s*\{/;
            const reBlock = /\.ws-legend\s*\{/;
            assertTrue(!reBlock.test(html) && !reItem.test(html) && !reSwatch.test(html),
                'CSS-правила легенды должны быть удалены (вместо них — комментарий Task 252)');
        });
    });

    describe('Task 252: коды статусов возвращены в ячейки', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('JS: в ячейке выводится код статуса (status || «·»)', () => {
            // Реверс Task 250: снова (status || '·') — код буквой в ячейке.
            // Task 274: выражение расширено планом отпуска —
            // (status || (vacPlan ? 'ОТ' : '·')): пустая ячейка в периоде
            // отпуска показывает «ОТ», прочие пустые — точку.
            // Task 298: код отпуска «О» → «ОТ» (Т-12/Т-13).
            // Task 314: «.» и статусы-мероприятия БЕЗ большого кода —
            // ячейка как пустая, событие — бейджем
            // Task 356: точка «·» НЕ выводится нигде (Task 355 начал
            // с нерабочих, Task 356 убрал и в рабочих пустых)
            // Task 456: код статуса ИЛИ авто-«д»/«н» замещения
            // отпуска (производный слой в пустой ячейке)
            assertTrue(html.indexOf("(showMainCode ? status : (vacPlan ? 'ОТ' : ''))") !== -1,
                'Код статуса в ячейке (Task 274/298/314/355/356/456: + план «ОТ», авто-«д»/«н», пустые — без «·»)');
            assertTrue(html.indexOf("(status ? '' : '·')") === -1,
                'Паттерн Task 250 «статусная ячейка без текста» должен быть удалён');
        });

        test('JS: непрозрачный фон Task 250 сохранён (CSS-фон + inline для статусных)', () => {
            const re = /\.ws-grid tbody td\.ws-cell \{[^}]*background:\s*var\(--bg-primary, #1a2233\);/;
            assertTrue(re.test(html),
                'Сплошной CSS-фон пустых ячеек должен остаться');
            // Task 314: showMainCode (см. Task 250)
            assertTrue(html.indexOf("if (showMainCode) style += 'background:' + color + ';';") !== -1,
                'Inline-фон задаётся только статусным ячейкам');
        });

        test('JS: маркеры Task 250/251 живы (тултипы убраны Task 311)', () => {
            assertTrue(html.indexOf("if (isOvertime) classes.push('ws-overtime');") !== -1,
                'Маркер переработки ws-overtime (Task 250) — на месте');
            assertTrue(html.indexOf("if (isPending) classes.push('ws-pending');") !== -1,
                'Маркер несохранённой правки ws-pending (Task 251) — на месте');
            assertFalse(html.indexOf("titleParts.push('статус: '") !== -1,
                'тултип статуса (Task 250) убран по заявке (Task 311)');
        });
    });

    describe('Task 252: десктоп — график до самого низа, тулбар между крошками и графиком', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: страница — flex-колонка на всю высоту (≥1024px)', () => {
            const re = /#contentArea > #page-work-schedule\.active \{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*\}/;
            assertTrue(re.test(html),
                '#page-work-schedule.active — flex-колонка (крошки → тулбар → шахматка)');
            const rePad = /#contentArea > #page-work-schedule\.active \{[^}]*padding-bottom:\s*0;/;
            assertTrue(rePad.test(html),
                'Мобильный нижний отступ ~70px убран на десктопе');
        });

        test('CSS: бары (крошки + тулбар) не сжимаются — тулбар во всю ширину между ними', () => {
            const re = /#page-work-schedule \.page-inline-header,\s*\n\s*#page-work-schedule \.ws-toolbar \{[^}]*flex-shrink:\s*0;/;
            assertTrue(re.test(html),
                'page-inline-header и ws-toolbar — flex-shrink: 0 (бары фиксированной высоты, тулбар между крошками и графиком)');
        });

        test('CSS: шахматка занимает остаток высоты и скроллится сама', () => {
            const re = /#page-work-schedule \.ws-grid-wrap \{[^}]*flex:\s*1;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*\}/;
            assertTrue(re.test(html),
                '.ws-grid-wrap: flex:1 + min-height:0 + overflow-y:auto — график занимает всё место до низа');
        });

        test('CSS: график до низа окна — Task 256: целые высоты строк вместо height:100%', () => {
            // Task 252 растягивал таблицу height:100% — браузер раздавал
            // строкам ДРОБНЫЕ высоты (60.2px), из-за чего 1px границы
            // «растворялись» антиалиасингом (Task 256). Теперь высоты
            // строк задаёт _fitGrid целыми пикселями, таблица по-прежнему
            // до нижнего края (сумма строк = высота области).
            const re = /#page-work-schedule \.ws-grid \{[^}]*height:\s*auto;[^}]*\}/;
            const reVar = /#page-work-schedule \.ws-grid tbody td \{[^}]*height:\s*var\(--ws-row-h,\s*32px\);[^}]*\}/;
            assertTrue(re.test(html) && reVar.test(html),
                '.ws-grid: height:auto + --ws-row-h (целые высоты строк, до низа окна)');
        });

        test('CSS: шапка таблицы компактная (не тянется вместе со строками)', () => {
            const re = /#page-work-schedule \.ws-grid thead th \{[^}]*height:\s*32px;/;
            assertTrue(re.test(html),
                'thead th: height 32px — шапка не растягивается пропорционально строкам');
        });

        // Task 252: SW-тест версии v511 удалён — версия v512 введена в
        // Task 254 (см. describe ниже). Историческая заметка.
    });

    // ============================================================
    // Task 254: визуальная разметка шахматки:
    //   1) пустые ячейки выходных (Сб/Вс) — слабый пастельно-розовый фон;
    //   2) красные линии-границы между колонками выходных и рабочих
    //      дней (слева от субботы, справа от воскресенья) — непрерывные,
    //      от шапки до последней строки;
    //   3) под ФИО сотрудника — строка с должностью
    //      («Слесарь КИПиА дневной» / «Слесарь КИПиА смена №1»);
    //   4) тулбар с кнопками — непрозрачный фон, кнопки без скруглений.
    // ============================================================
    describe('Task 254→363: розовый фон — только праздники', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: .ws-feast.ws-status-empty — розовый фон (база, обе темы)', () => {
            // Task 363 (заявка: «нерабочие праздничные дни оставь светлым
            // розовым фоном»): розовый переехал с выходных на праздники;
            // цвет — прежний пастельный Task 355 #f8e2e9
            const re = /\.ws-grid tbody td\.ws-cell\.ws-feast\.ws-status-empty \{[^}]*background:\s*#f8e2e9;[^}]*\}/;
            assertTrue(re.test(html),
                'Пустые ячейки праздников — сплошной пастельный #f8e2e9');
        });

        test('CSS: светлая тема — слабый пастельный розовый (#f8e2e9)', () => {
            // Task 355 (заявка: «пастельнее и бледнее»): #f7d9e3 → #f8e2e9;
            // Task 363: правило праздников (перекрывает светлое «.»-правило)
            const re = /\[data-theme="light"\] \.ws-grid tbody td\.ws-cell\.ws-feast\.ws-status-empty \{[^}]*background:\s*#f8e2e9;/;
            assertTrue(re.test(html),
                'Светлая тема: пастельно-розовый фон пустых ячеек праздников');
        });

        test('CSS: розовых ВЫХОДНЫХ больше нет — фон как у пустых', () => {
            // Task 363 (заявка: «фон выходных дней сделай таким же как в
            // пустых ячейках») — селектор .ws-weekend.ws-status-empty удалён
            assertEqual(html.indexOf('.ws-weekend.ws-status-empty'), -1,
                'розовое правило выходных удалено (розовый — только ws-feast)');
        });

        test('JS: _renderCell помечает нерабочие дни классом ws-weekend', () => {
            // Task 260: выходные определяются по производственному
            // календарю (Сб/Вс + праздники + переносы, без рабочих суббот)
            assertTrue(html.indexOf("if (dayOff) classes.push('ws-weekend');") !== -1,
                'Нерабочие дни (Сб/Вс + праздники + переносы) — класс ws-weekend');
        });

        test('CSS: розовый ТОЛЬКО у пустых ячеек ПРАЗДНИКОВ (комбинация с ws-status-empty)', () => {
            // Селектор требует ОБА класса: у статусных ячеек праздника
            // (Д/Н/Б…) цвета справочника остаются. Task 363: розовый —
            // только праздники (ws-feast), обычные выходные — как пустые
            assertTrue(html.indexOf('.ws-grid tbody td.ws-cell.ws-feast.ws-status-empty {') !== -1,
                'Селектор розового фона — строго .ws-feast.ws-status-empty (Task 363)');
            // Task 314: showMainCode — «.»-ячейка на празднике тоже розовая
            assertTrue(html.indexOf("if (showMainCode) style += 'background:' + color + ';';") !== -1,
                'Inline-фон статусных ячеек сохранён (Task 250/252/314)');
        });
    });

    describe('Task 254→363: рамка-группа выходных (заявка «толстые красные линии вокруг группы»)', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: рамка-группа — 2px #e57373 (верх/бока/низ; Task 364)', () => {
            // Task 363 (заявка): «на ячейках выходных дней сделай толстые
            // красные разделительные линии вокруг по краям ГРУППЫ этих
            // ячеек (не каждую ячейку), включая ячейки с датами».
            // Заменила тонкие 1px-линии стыков Task 255;
            // Task 364: 3px #e53935 → 2px #e57373 (спокойнее)
            const reTh = /\.ws-grid thead th\.ws-day-col\.ws-wgrp \{\s*\n\s*box-shadow: inset 0 2px 0 0 #e57373;\s*\n\s*\}/;
            const reThL = /\.ws-grid thead th\.ws-day-col\.ws-wgrp-first \{ border-left: 2px solid #e57373; \}/;
            const reThR = /\.ws-grid thead th\.ws-day-col\.ws-wgrp-last \{ border-right: 2px solid #e57373; \}/;
            const reL = /\.ws-grid tbody td\.ws-cell\.ws-wgrp-first \{ border-left: 2px solid #e57373; \}/;
            const reR = /\.ws-grid tbody td\.ws-cell\.ws-wgrp-last \{ border-right: 2px solid #e57373; \}/;
            const reB = /\.ws-grid tbody tr:last-child td\.ws-cell\.ws-wgrp \{\s*\n\s*border-bottom: 2px solid #e57373;\s*\n\s*\}/;
            assertTrue(reTh.test(html) && reThL.test(html) && reThR.test(html) &&
                       reL.test(html) && reR.test(html) && reB.test(html),
                'верх (тень шапки) + бока + низ — 2px #e57373 вокруг группы (Task 364: тоньше и бледнее)');
            // тонкие линии Task 255 убраны полностью
            assertTrue(html.indexOf('ws-boundary-left,') === -1 &&
                       html.indexOf('ws-boundary') === -1,
                'прежние 1px-стыки ws-boundary-* удалены');
        });

        test('CSS: специфичность рамки выше светлой темы (не перекрасится)', () => {
            // Светлая тема задаёт [data-theme="light"] .ws-grid tbody td
            // { border-color } со специфичностью (0,2,2) НИЖЕ по файлу.
            // Рамочные селекторы обязаны быть сильнее: + .ws-cell → (0,3,2).
            const re = /\.ws-grid tbody td\.ws-cell\.ws-wgrp-first \{ border-left: 2px solid #e57373; \}/;
            assertTrue(re.test(html),
                'Селектор td.ws-cell.ws-wgrp-first — красная рамка переживает светлую тему');
            const weak = /\.ws-grid tbody td\.ws-wgrp-\w+ \{/;
            assertTrue(!weak.test(html),
                'Слабый селектор (без .ws-cell) удалён — иначе светлая тема перекрасит рамку');
        });

        test('CSS: шапка ВХОДИТ в рамку группы — включая ячейки с датами (заявка 363)', () => {
            // Task 255 убирал линии из шапки; заявка 363 вернула шапку
            // в рамку: верх группы — тень на th (border-top шапке запрещён
            // Task 355 — высота 37px), бока — на th первого/последнего дня
            const thFrame = /\.ws-grid thead th\.ws-day-col\.ws-wgrp-first \{ border-left: 2px solid #e57373; \}/;
            assertTrue(thFrame.test(html),
                'бока рамки — и на th (ячейки с датами)');
            const base = /\.ws-grid thead th \{[^}]*border-top: 0;/;
            assertTrue(base.test(html),
                'border-top базовой шапки — по-прежнему 0 (высота не меняется)');
        });

        test('JS: группа выходных и праздники — по производственному календарю', () => {
            // Task 260: нерабочесть — по календарю; Task 363: праздник
            // отличается от выходного (розовый, вне рамки-группы),
            // группа выходных — подряд идущие обычные выходные
            assertTrue(html.indexOf("var dayOff = this._calDayOff(day);") !== -1,
                '_renderCell определяет нерабочий день через _calDayOff');
            assertTrue(html.indexOf('_calDayFeast: function') !== -1,
                'метод _calDayFeast (праздник ст. 112) определён');
            assertTrue(html.indexOf('_calWend: function') !== -1,
                'метод _calWend (обычный выходной) определён');
            assertTrue(html.indexOf("if (dayFeast) classes.push('ws-feast');") !== -1,
                'праздник в теле — ws-feast (розовый фон)');
            assertTrue(html.indexOf("if (dayOff && !dayFeast) {") !== -1 &&
                       html.indexOf("classes.push('ws-wgrp');") !== -1,
                'обычный выходной — столбец группы ws-wgrp');
            assertTrue(html.indexOf("classes.push('ws-wgrp-first');") !== -1 &&
                       html.indexOf("classes.push('ws-wgrp-last');") !== -1,
                'первый/последний столбец группы — ws-wgrp-first/-last');
            const reOld = /ws-boundary-(left|right|before|after)/;
            assertTrue(!reOld.test(html),
                'классы/правила Task 255 ws-boundary-* удалены из файла');
        });

        test('JS: шапка таблицы — граничные классы Task 255 НЕ ставятся', () => {
            // Task 363: в шапке — СВОИ классы рамки-группы (ws-wgrp*,
            // см. тесты выше), прежние ws-boundary-* удалены вовсе
            assertTrue(html.indexOf("thCls += ' ws-boundary-left'") === -1 &&
                       html.indexOf("thCls += ' ws-boundary-right'") === -1,
                'Шапка: граничные классы удалены из рендера th');
            const reTh = /var thCls = 'ws-day-col' \+ \(isOff \? ' ws-holiday' : ''\) \+/;
            assertTrue(reTh.test(html),
                'Шапка: thCls формируется из ws-day-col + ws-holiday (+ ws-feast)');
        });
    });

    describe('Task 254 + Task 255: должность и режим занятости под ФИО', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('JS: _empTipLine — Тип (смена №N/сменный/дневной); _posLabel удалён (Task 439)', () => {
            // Task 439: печатная форма показывает под ФИО только Тип
            // (_empTipLine); склеенная подпись «должность + тип»
            // (_posLabel) удалена — потребителей не осталось.
            const re = /_empTipLine: function\(emp\) \{[\s\S]*?if \(tip === 'сменный'\) \{[\s\S]*?\? 'смена №' \+ smena : 'сменный';[\s\S]*?if \(tip === 'дневной'\) return 'дневной';[\s\S]*?return '';/;
            assertTrue(re.test(html),
                'Хелпер _empTipLine формирует «смена №N» / «сменный» / «дневной»');
            const reRange = /smena >= 1 && smena <= 5/;
            assertTrue(reRange.test(html),
                'Смена выводится только при корректном номере 1..5');
            assertFalse(html.indexOf('_posLabel: function') !== -1,
                'склеенная подпись _posLabel удалена (Task 439 — печать: только ФИО и Тип)');
        });

        test('JS: колонка сотрудника — ws-emp-pos с подписью _empPosLine (Task 402)', () => {
            assertTrue(html.indexOf("var empPosLabel = this._empPosLine(emp);") !== -1 &&
                       html.indexOf("'<div class=\"ws-emp-pos\">' + this._esc(empPosLabel) + '</div>'") !== -1,
                'Подпись в .ws-emp-pos формируется через _empPosLine (Task 403: должность, без группы)');
            assertTrue(html.indexOf('<div class="ws-emp-name">') !== -1,
                'ФИО переносится в блок .ws-emp-name (две строки в колонке)');
        });

        test('JS: пустая подпись — строка не рендерится', () => {
            const re = /var empPosLabel = this\._empPosLine\(emp\);\s*\n\s*var empPos = empPosLabel\s*\n\s*\? '<div class="ws-emp-pos">'/;
            assertTrue(re.test(html),
                'Тернарник: без должности нет пустого блока .ws-emp-pos');
        });

        test('JS: справочник «Сотрудники» — смена в подписи должности (единый формат; Task 307: карточки справочника удалены)', () => {
            // Task 255: в карточках справочника фрагмент «· смена N» убран,
            // смена (столбец D) входит в подпись должности справа от неё.
            // Task 307: карточки удалены вместе со страницей; Task 402:
            // в ШАХМАТКЕ тип работника — ТРЕТЬЯ строка (_empTipLine),
            // строка должности — _empPosLine (Task 403: только
            // должность, «разряд» → «р.», без группы допуска);
            // фрагмент «· смена N» по-прежнему отсутствует
            assertTrue(html.indexOf("var empPosLabel = this._empPosLine(emp);") !== -1,
                'Шахматка: подпись _empPosLine под ФИО (единый формат жив)');
            assertTrue(html.indexOf("· смена ' + e.смена") === -1 &&
                       html.indexOf('· смена не задана') === -1,
                'Дублирующий отдельный фрагмент смены удалён');
        });

        test('CSS: .ws-emp-pos — мелкий приглушённый текст с эллипсисом', () => {
            const re = /\.ws-grid tbody td\.ws-emp-col \.ws-emp-pos \{[^}]*text-overflow:\s*ellipsis;[^}]*font-size:\s*10px;[^}]*font-weight:\s*400;/;
            assertTrue(re.test(html),
                'Должность: эллипсис при переполнении, 10px/400, цвет secondary');
        });

        test('CSS: светлая тема — должность темнее (#666)', () => {
            const re = /\[data-theme="light"\] \.ws-grid tbody td\.ws-emp-col \.ws-emp-pos \{[^}]*color:\s*#666;/;
            assertTrue(re.test(html),
                'Светлая тема: читаемая должность под ФИО');
        });
    });

    describe('Task 255: селекты месяца/года без скруглений', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: .ws-month-sel/.ws-year-sel — border-radius: 0', () => {
            const re = /\.ws-month-sel, \.ws-year-sel \{[^}]*border-radius:\s*0;/;
            assertTrue(re.test(html),
                'Селекты месяца и года — прямые углы (как кнопки тулбара)');
        });
    });

    describe('Task 254: непрозрачный тулбар, кнопки без скруглений', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: .ws-toolbar — сплошной фон (#17212b, без var(--card-bg))', () => {
            const re = /\.ws-toolbar \{[^}]*background:\s*#17212b;/;
            assertTrue(re.test(html),
                'Тулбар непрозрачный: сплошной аналог --header-bg тёмной темы');
            // именно ОБЪЯВЛЕНИЕ фона, не упоминание в комментарии
            // (комментарий внутри .ws-toolbar описывает, что было раньше)
            const reVar = /\.ws-toolbar \{[^}]*background:\s*var\(--card-bg\)/;
            assertTrue(!reVar.test(html),
                'Полупрозрачный var(--card-bg) больше не задаёт фон тулбара');
        });

        test('CSS: светлая тема — тулбар сплошной #f0eee6', () => {
            const re = /\[data-theme="light"\] \.ws-toolbar \{ background: #f0eee6; \}/;
            assertTrue(re.test(html),
                'Светлая тема: непрозрачный тулбар (аналог --header-bg светлой)');
        });

        test('CSS: кнопки «Сформировать» и «Сохранить» — без скруглений', () => {
            const reGen = /\.ws-generate-btn \{[^}]*border-radius:\s*0;/;
            const reSave = /\.ws-save-btn \{[^}]*border-radius:\s*0;/;
            assertTrue(reGen.test(html) && reSave.test(html),
                'Обе кнопки тулбара — border-radius: 0 (прямые углы)');
        });
    });

    describe('Task 256: авто-подгонка шахматки под окно (целые высоты строк)', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: шапка — целочисленные межстрочные интервалы (было 36.5px)', () => {
            const reTh = /\.ws-grid thead th \{[^}]*line-height:\s*14px;/s;
            const reDow = /\.ws-grid thead th\.ws-day-col \.ws-dow \{[^}]*line-height:\s*11px;/s;
            assertTrue(reTh.test(html) && reDow.test(html),
                'Числа дней lh=14px + дни недели lh=11px: шапка ровно 37.5px, ' +
                'границы строк — на целых пикселях (антиалиасинг не стирает линии)');
        });

        test('CSS: колонка ФИО — целые интервалы (.ws-emp-name/.ws-emp-pos)', () => {
            const reName = /\.ws-grid tbody td\.ws-emp-col \.ws-emp-name \{[^}]*line-height:\s*14px;/s;
            const rePos = /\.ws-grid tbody td\.ws-emp-col \.ws-emp-pos \{[^}]*line-height:\s*12px;/s;
            assertTrue(reName.test(html) && rePos.test(html),
                'ФИО lh=14px + должность lh=12px: природная высота строки целая');
        });

        test('CSS: высота ячеек тела — var(--ws-row-h) (задаёт _fitGrid)', () => {
            const re = /#page-work-schedule \.ws-grid tbody td \{\s*\n\s*height:\s*var\(--ws-row-h,\s*32px\);/s;
            assertTrue(re.test(html),
                'Высота строк через CSS-переменную, без JS — прежние 32px');
        });

        test('CSS: растяжение height:100% убрано (дробные высоты стирали границы)', () => {
            const reBad = /#page-work-schedule \.ws-grid \{\s*\n\s*height:\s*100%;/;
            const reOk = /#page-work-schedule \.ws-grid \{\s*\n\s*height:\s*auto;/;
            assertTrue(!reBad.test(html) && reOk.test(html),
                'height:100% заменён на auto: высоты строк задаёт _fitGrid целыми px');
        });

        test('CSS: компактные режимы ws-compact / ws-tight', () => {
            const reCompact = /\.ws-grid-wrap\.ws-compact \.ws-grid tbody td\.ws-emp-col \{[^}]*padding:\s*3px 10px;/s;
            const reTight = /\.ws-grid-wrap\.ws-tight \.ws-grid tbody td\.ws-emp-col \{[^}]*padding:\s*1px 8px;/s;
            const reTightPos = /\.ws-grid-wrap\.ws-tight \.ws-grid tbody td\.ws-emp-col \.ws-emp-pos \{[^}]*font-size:\s*9px;[^}]*margin-top:\s*0;/s;
            assertTrue(reCompact.test(html) && reTight.test(html) && reTightPos.test(html),
                'Два яруса уплотнения колонки ФИО при нехватке высоты окна');
        });

        test('JS: _fitGrid — целочисленные высоты + остаток по +1px первым строкам', () => {
            const hasFloor = html.indexOf('Math.floor(budget / n)') !== -1;
            const hasRem = html.indexOf('h + (i < rem ? 1 : 0)') !== -1;
            assertTrue(hasFloor && hasRem,
                'floor((область-шапка)/строки) и раздача остатка пикселей');
        });

        test('JS: _fitGrid — подбор яруса по ЗАМЕРУ природной высоты строки', () => {
            const reMeasure = /var measureNatural = function\(\) \{[\s\S]*?getBoundingClientRect\(\)\.height;/;
            const hasTiers = html.indexOf("wrap.classList.add('ws-compact');") !== -1 &&
                             html.indexOf("wrap.classList.add('ws-tight');") !== -1;
            assertTrue(reMeasure.test(html) && hasTiers,
                'Пороги компактности не по формуле, а по фактическому рендеру ' +
                '(box-sizing + collapsed-границы дают +1px к расчётной высоте)');
        });

        test('JS: _fitGrid — мобильная вёрстка (<1024px) не подгоняется', () => {
            const re = /window\.matchMedia\s*\n?\s*&&\s*window\.matchMedia\('\(min-width: 1024px\)'\)\.matches;/;
            const hasClear = html.indexOf("wrap.classList.remove('ws-compact', 'ws-tight');") !== -1;
            assertTrue(re.test(html) && hasClear,
                'На мобильной — природные высоты (очистка классов и переменной)');
        });

        test('JS: _renderGrid вызывает _fitGrid после сборки таблицы', () => {
            const re = /wrap\.innerHTML = html;\s*\n\s*\/\/ Task 256[\s\S]*?\n\s*this\._fitGrid\(\);/;
            assertTrue(re.test(html),
                'После каждого рендера шахматки — пересчёт высот строк');
        });

        test('JS: _attachFitResize — ResizeObserver + брейкпоинт 1024px', () => {
            const hasRO = html.indexOf('new ResizeObserver(function() {') !== -1 ||
                          html.indexOf('new ResizeObserver(') !== -1;
            const hasMq = html.indexOf("window.matchMedia('(min-width: 1024px)')") !== -1;
            assertTrue(hasRO && hasMq,
                'Пересчёт при изменении окна/показе страницы и переходе мобильная/десктоп');
        });

        test('JS: init навешивает _attachFitResize один раз', () => {
            const re = /this\._attachFitResize\(\);/;
            const hasGuard = html.indexOf('if (this._fitAttached) return;') !== -1;
            assertTrue(re.test(html) && hasGuard,
                'Наблюдатель размера вешается однократно при инициализации модуля');
        });
    });

    describe('Task 256: SW версия v514 (история)', () => {
        const fs = require('fs');
        const path = require('path');
        const swPath = path.resolve(__dirname, '..', 'sw.js');
        const sw = fs.readFileSync(swPath, 'utf8');

        test('v514 заменена актуальной версией', () => {
            assertTrue(sw.indexOf("kipia-test-v750") !== -1,
                'Актуальная версия — kipia-test-v750 (Task 291)');
        });
        test('Старая версия v514 убрана', () => {
            assertTrue(sw.indexOf("kipia-test-v514") === -1,
                'Старая v514 не должна остаться в sw.js');
        });
    });

    describe('Task 257: завершающая полоса внизу таблицы + скрытие скроллбара', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: .ws-grid-foot — полоса-бордюрчик 5px внизу таблицы (Task 259: непрозрачная, с эффектом выступа)', () => {
            const re = /\.ws-grid-foot \{[^}]*height:\s*5px;[^}]*box-sizing:\s*border-box;[^}]*background:\s*#35648f;[^}]*border-top:\s*1px solid #85b7dc;[^}]*border-bottom:\s*1px solid #0f1b26;[^}]*\}/s;
            assertTrue(re.test(html),
                'Бордюрчик 5px: сплошной стальной фон #35648f + верхняя грань ' +
                '#85b7dc (блик) и нижняя #0f1b26 (тень) — эффект выступа');
        });

        test('CSS: .ws-grid-foot — светлая тема (Task 259)', () => {
            const re = /\[data-theme="light"\] \.ws-grid-foot \{[^}]*background:\s*#b3c2ce;[^}]*border-top:\s*1px solid #ffffff;[^}]*border-bottom:\s*1px solid #84929e;[^}]*\}/s;
            assertTrue(re.test(html), 'Светлая тема: сплошной фон + белый блик сверху, тень снизу');
        });

        test('CSS: полосы прокрутки шахматки скрыты (все движки)', () => {
            const reWrap = /\.ws-grid-wrap \{[^}]*scrollbar-width:\s*none;[^}]*-ms-overflow-style:\s*none;[^}]*\}/s;
            const reWebkit = /\.ws-grid-wrap::-webkit-scrollbar \{[^}]*display:\s*none;[^}]*\}/s;
            assertTrue(reWrap.test(html) && reWebkit.test(html),
                'scrollbar-width:none (Firefox) + ::-webkit-scrollbar display:none ' +
                '(Chrome/Edge PWA) — полосы прокрутки справа от таблицы больше нет, ' +
                'прокрутка колесом/свайпом остаётся');
        });

        test('JS: Task 331 — полоса .ws-grid-foot СТАТИЧНАЯ, вне контейнера', () => {
            // полоса — постоянный элемент колонки .ws-grid-col ПОД скролл-
            // контейнером (не пересоздаётся при рендерах, не уезжает при
            // вертикальной прокрутке); в _renderGrid её больше нет
            const reCol = /<div class="ws-grid-col" id="wsGridCol">[\s\S]*?<div id="wsGridWrap" class="ws-grid-wrap">[\s\S]*?<\/div>[\s\S]*?<div class="ws-grid-foot" id="wsGridFoot" aria-hidden="true"><\/div>[\s\S]*?<div class="ws-grid-hbar" id="wsGridHbar"/;
            const reOldRender = /html \+= '<div class="ws-grid-foot" aria-hidden="true"><\/div>';/;
            assertTrue(reCol.test(html) && !reOldRender.test(html),
                'Колонка .ws-grid-col = [контейнер][#wsGridFoot][#wsGridHbar], ' +
                'рендер сетки полосу больше не создаёт (Task 331)');
        });

        test('JS: _fitGrid — бюджет без вычитания полосы (она вне контейнера)', () => {
            // Task 331: полоса и зона ползунка — статичные элементы ПОД
            // контейнером (колонка − 5 − 12), высота контейнера уже чистая;
            // нативные полосы скрыты — поправка clientHeight не нужна
            const re = /var budget = avail - headH;/;
            const reOld = /var budget = avail - headH - footH - ttFootH;/;
            assertTrue(re.test(html) && !reOld.test(html),
                'budget = область - шапка: полоса/ползунок не в контейнере (Task 331)');
        });

        test('JS: _fitGrid — реальная высота области вместо clientHeight', () => {
            const re = /var avail = Math\.floor\(wrap\.getBoundingClientRect\(\)\.height \+ 0\.25\);/;
            assertTrue(re.test(html),
                'floor(факт+0.25): при дробном масштабе окна (Windows 125%/150%) ' +
                'clientHeight округлялся ВВЕРХ и таблица переливалась на долю px — ' +
                'появлялась полоса прокрутки справа');
        });
    });

    describe('Task 258: SW версия v516 (история)', () => {
        const fs = require('fs');
        const path = require('path');
        const swPath = path.resolve(__dirname, '..', 'sw.js');
        const sw = fs.readFileSync(swPath, 'utf8');

        test('v516 заменена актуальной версией', () => {
            assertTrue(sw.indexOf("kipia-test-v750") !== -1,
                'Актуальная версия — kipia-test-v750 (Task 291)');
        });
    });

    describe('Task 257: SW версия v515 (история)', () => {
        const fs = require('fs');
        const path = require('path');
        const swPath = path.resolve(__dirname, '..', 'sw.js');
        const sw = fs.readFileSync(swPath, 'utf8');

        test('v515 заменена актуальной версией', () => {
            assertTrue(sw.indexOf("kipia-test-v750") !== -1,
                'Актуальная версия — kipia-test-v750 (Task 291)');
        });
    });

    describe('Task 255: SW версия v513 (история)', () => {
        const fs = require('fs');
        const path = require('path');
        const swPath = path.resolve(__dirname, '..', 'sw.js');
        const sw = fs.readFileSync(swPath, 'utf8');
        test('v513 заменена актуальной версией', () => {
            assertTrue(sw.indexOf("kipia-test-v750") !== -1,
                'Актуальная версия — kipia-test-v750');
        });
    });

    // ============================================================
    // Task 259: бордюрчик непрозрачный с эффектом выступа;
    // группировка/сортировка сотрудников (сменные 1-5 → дневные
    // по алфавиту); разделитель групп сменного/дневного персонала
    // ============================================================

    describe('Task 259: бордюрчик под графиком — непрозрачный, с эффектом выступа', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: полоса непрозрачная — сплошной фон без rgba-альфы', () => {
            const reSolid = /\.ws-grid-foot \{[^}]*background:\s*#35648f;[^}]*\}/s;
            const reLightSolid = /\[data-theme="light"\] \.ws-grid-foot \{[^}]*background:\s*#b3c2ce;[^}]*\}/s;
            assertTrue(reSolid.test(html) && reLightSolid.test(html),
                'Фон полосы — сплошные цвета в обеих темах (было rgba с альфой)');
            const reOldAlpha = /\.ws-grid-foot \{[^}]*rgba\(/s;
            assertFalse(reOldAlpha.test(html),
                'В тёмной теме больше нет полупрозрачного rgba-фона полосы');
        });

        test('CSS: эффект выступа — верхняя грань светлее фона, нижняя темнее', () => {
            const reDark = /\.ws-grid-foot \{[^}]*border-top:\s*1px solid #85b7dc;[^}]*border-bottom:\s*1px solid #0f1b26;[^}]*\}/s;
            assertTrue(reDark.test(html),
                'Блик #85b7dc сверху + тень #0f1b26 снизу на стальном фоне — bevel');
            const reLight = /\[data-theme="light"\] \.ws-grid-foot \{[^}]*border-top:\s*1px solid #ffffff;[^}]*border-bottom:\s*1px solid #84929e;[^}]*\}/s;
            assertTrue(reLight.test(html), 'Светлая тема: белый блик + серо-синяя тень');
        });

        test('CSS: высота полосы остаётся 5px (box-sizing: border-box)', () => {
            const re = /\.ws-grid-foot \{[^}]*height:\s*5px;[^}]*box-sizing:\s*border-box;[^}]*\}/s;
            assertTrue(re.test(html),
                '1px блик + 3px фон + 1px тень = 5px, _fitGrid читает реальную ' +
                'геометрию — подгонка строк не меняется');
        });
    });

    describe('Task 259: группировка и сортировка сотрудников', () => {
        const fs = require('fs');
        const path = require('path');
        const vm = require('vm');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        // Извлечение метода _sortEmployees из объекта WorkSchedule
        // (поиск по имени + балансировка фигурных скобок)
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

        let _sortEmployees = null;
        try {
            const src = extractMethod(html, '_sortEmployees');
            if (src) {
                const ctx = {};
                vm.createContext(ctx);
                vm.runInContext('var WSMixin = { ' + src + ' };', ctx);
                _sortEmployees = ctx.WSMixin._sortEmployees;
            }
        } catch (e) { /* метод не извлёкся — тесты ниже упадут с понятной причиной */ }

        test('JS: _sortEmployees определён и подключён в _loadEmployees', () => {
            assertTrue(html.indexOf('_sortEmployees: function(list)') !== -1,
                'Метод _sortEmployees определён в модуле WorkSchedule');
            const re = /self\._EMPLOYEES = self\._sortEmployees\(data\.employees \|\| \[\]\);/;
            assertTrue(re.test(html),
                '_loadEmployees применяет сортировку — единый порядок для ' +
                'шахматки, справочника и селектов');
        });

        test('Функционально: сменные по сменам 1..5, затем дневные по алфавиту', () => {
            assertTrue(typeof _sortEmployees === 'function',
                '_sortEmployees извлечён из index.html');
            const src = [
                { 'ФИО': 'Ягодкин Н.Н.', 'тип': 'дневной' },
                { 'ФИО': 'Иванов А.А.',  'тип': 'сменный', 'смена': 3 },
                { 'ФИО': 'Сидоров К.К.', 'тип': 'сменный', 'смена': 1 },
                { 'ФИО': 'Абрамов В.В.', 'тип': 'сменный', 'смена': 1 },
                { 'ФИО': 'Петров Б.Б.',  'тип': 'сменный', 'смена': 2 },
                { 'ФИО': 'Козлов Д.Д.',  'тип': 'дневной' }
            ];
            const out = _sortEmployees(src).map(e => e['ФИО']);
            assertEqual(JSON.stringify(out),
                JSON.stringify(['Абрамов В.В.', 'Сидоров К.К.', 'Петров Б.Б.',
                                'Иванов А.А.', 'Козлов Д.Д.', 'Ягодкин Н.Н.']),
                'Смена №1 (алфавит), смена №2, смена №3, затем дневные (алфавит)');
        });

        test('Функционально: внутри одной смены — алфавит фамилий', () => {
            const src = [
                { 'ФИО': 'Юдин С.С.', 'тип': 'сменный', 'смена': 2 },
                { 'ФИО': 'Белов Р.Р.', 'тип': 'сменный', 'смена': 2 },
                { 'ФИО': 'Мишин Л.Л.', 'тип': 'сменный', 'смена': 2 }
            ];
            const out = _sortEmployees(src).map(e => e['ФИО']);
            assertEqual(JSON.stringify(out),
                JSON.stringify(['Белов Р.Р.', 'Мишин Л.Л.', 'Юдин С.С.']),
                'Внутри смены №2 сортировка по фамилиям');
        });

        test('Функционально: все 5 смен по порядку, сменный без номера — после них', () => {
            const src = [
                { 'ФИО': 'Фёдоров Ф.Ф.', 'тип': 'сменный' },          // без номера
                { 'ФИО': 'Бобров Б.Б.', 'тип': 'сменный', 'смена': 5 },
                { 'ФИО': 'Агафов А.А.', 'тип': 'сменный', 'смена': 4 },
                { 'ФИО': 'Васин В.В.',  'тип': 'сменный', 'смена': 1 },
                { 'ФИО': 'Гусев Г.Г.',  'тип': 'сменный', 'смена': 2 },
                { 'ФИО': 'Дёмин Д.Д.',  'тип': 'сменный', 'смена': 3 },
                { 'ФИО': 'Яшин Я.Я.',   'тип': 'дневной' }
            ];
            const out = _sortEmployees(src).map(e => e['смена'] || '—');
            assertEqual(JSON.stringify(out),
                JSON.stringify([1, 2, 3, 4, 5, '—', '—']),
                'Смены 1-5 по порядку, сменный без номера перед дневными, дневной в конце');
        });

        test('Функционально: без типа — в конце; исходный массив не мутируется', () => {
            const src = [
                { 'ФИО': 'Иванов И.И.' },                        // без типа
                { 'ФИО': 'Смирнов С.С.', 'тип': 'дневной' },
                { 'ФИО': 'Кузнецов К.К.', 'тип': 'сменный', 'смена': 1 }
            ];
            const snapshot = JSON.stringify(src);
            const out = _sortEmployees(src);
            assertEqual(JSON.stringify(out.map(e => e['ФИО'])),
                JSON.stringify(['Кузнецов К.К.', 'Смирнов С.С.', 'Иванов И.И.']),
                'Сменный → дневной → без типа');
            assertEqual(JSON.stringify(src), snapshot,
                '_sortEmployees возвращает новый массив, не мутируя вход');
        });
    });

    describe('Task 259: разделитель групп сменного и дневного персонала', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: усиленная верхняя граница у строки ws-group-first', () => {
            const reDark = /\.ws-grid tbody tr\.ws-group-first td \{[^}]*border-top:\s*2px solid #4a8fc7;[^}]*\}/s;
            assertTrue(reDark.test(html),
                'Разделитель 2px стальной синий на первой строке дневной группы');
            const reLight = /\[data-theme="light"\] \.ws-grid tbody tr\.ws-group-first td \{[^}]*border-top:\s*2px solid #6e8ba4;[^}]*\}/s;
            assertTrue(reLight.test(html), 'Светлая тема — свой цвет разделителя');
        });

        test('JS: _renderGrid ставит ws-group-first на стыке сменных и дневных', () => {
            // Task 319: tr собирается из массива классов (trClsParts:
            // ws-group-first + ws-hover-row перекрестья) — актуализация
            const rePush = /if \(empTier === 1 && prevTier === 0\) trClsParts\.push\('ws-group-first'\);/;
            const reJoin = /trClsParts\.join\(' '\) \+ '"'/;
            assertTrue(rePush.test(html),
                'Класс ставится только когда дневной идёт сразу после сменного');
            assertTrue(reJoin.test(html),
                'Классы строки собираются в атрибут (trClsParts.join)');
            const reTier = /var empTier = \(empTip === 'сменный'\) \? 0\s*: \(empTip === 'дневной'\) \? 1 : 2;/;
            assertTrue(reTier.test(html), 'Тир сотрудника: сменный 0, дневной 1, без типа 2');
        });

        test('JS: prevTier обновляется по каждой строке (стык отслеживается)', () => {
            const re = /var prevTier = -1;[\s\S]*?prevTier = empTier;/;
            assertTrue(re.test(html),
                'Группа предыдущей строки отслеживается до конца списка');
        });

        test('Инвариант: без сменных ИЛИ без дневных разделитель не ставится', () => {
            // условие empTier === 1 && prevTier === 0 не срабатывает:
            //  - все дневные: первая строка имеет prevTier = -1
            //  - только сменные: empTier === 1 не встречается
            // Task 319: актуализация под trClsParts
            const re = /if \(empTier === 1 && prevTier === 0\) trClsParts\.push\('ws-group-first'\);/
            assertTrue(re.test(html),
                'Строгая проверка стыка — лишних разделителей нет');
        });
    });

    describe('Task 259: SW версия v517 (история)', () => {
        const fs = require('fs');
        const path = require('path');
        const swPath = path.resolve(__dirname, '..', 'sw.js');
        const sw = fs.readFileSync(swPath, 'utf8');

        test('v517 заменена актуальной версией', () => {
            assertTrue(sw.indexOf("kipia-test-v750") !== -1,
                'Актуальная версия — kipia-test-v750 (Task 291)');
        });
        test('Старая версия v517 убрана', () => {
            assertTrue(sw.indexOf("kipia-test-v517") === -1,
                'Старая v517 не должна остаться в sw.js');
        });
    });

    describe('Task 260: SW версия v518', () => {
        const fs = require('fs');
        const path = require('path');
        const swPath = path.resolve(__dirname, '..', 'sw.js');
        const sw = fs.readFileSync(swPath, 'utf8');

        test('CACHE_VERSION = kipia-test-v750', () => {
            assertTrue(sw.indexOf("kipia-test-v750") !== -1,
                'CACHE_VERSION должен быть kipia-test-v750 (Task 290)');
        });
        test('Старая версия v517 убрана', () => {
            assertTrue(sw.indexOf("kipia-test-v517") === -1,
                'Старая v517 не должна остаться в sw.js');
        });
    });

    // ============================================================
    // Task 265: «Сформировать» — только через диалог подтверждения.
    // kipConfirm усилен: заголовок/надписи кнопок (title/okText/
    // cancelText), клавиатура (Escape — отмена, Enter — OK, если
    // фокус не на кнопке), защита от двойного срабатывания.
    // ============================================================
    describe('Task 265: подтверждение «Сформировать»', () => {
        const vm = require('vm');
        const html = require('fs').readFileSync(
            require('path').resolve(__dirname, '..', 'index.html'), 'utf8');

        // Извлечение function NAME(...) {...} из index.html
        function extractFn(src, name) {
            const start = src.indexOf('function ' + name + '(');
            if (start === -1) return null;
            const braceStart = src.indexOf('{', start);
            let depth = 0;
            for (let i = braceStart; i < src.length; i++) {
                if (src[i] === '{') depth++;
                else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
            }
            return null;
        }
        const dialogSrc = ['_kipDialogOverlay', '_kipDialogClose', '_kipDialogEsc', 'kipConfirm']
            .map(n => extractFn(html, n)).join('\n');
        if (!dialogSrc || dialogSrc.length < 100) {
            throw new Error('Task 265: функции диалога не извлеклись');
        }

        // Мок DOM + песочница с 4 функциями диалога
        function makeDialogSandbox() {
            const buttons = {
                cancel: { className: 'kip-dialog-btn kip-dialog-cancel', textContent: '', onclick: null,
                          closest: function () { return this; } },
                ok:     { className: 'kip-dialog-btn kip-dialog-ok', textContent: '', onclick: null,
                          closest: function () { return this; } }
            };
            const overlay = {
                id: '', className: '',
                _html: '',
                set innerHTML(v) { this._html = String(v || ''); },
                get innerHTML() { return this._html; },
                classList: (() => {
                    const set = new Set();
                    return { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c) };
                })(),
                querySelector: sel =>
                    sel === '.kip-dialog-cancel' ? buttons.cancel :
                    sel === '.kip-dialog-ok' ? buttons.ok : null
            };
            const listeners = {};
            const documentMock = {
                getElementById: id => (id === 'kipDialogOverlay' ? overlay : null),
                createElement: () => overlay,
                body: { appendChild: () => {} },
                addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
                removeEventListener: (type, fn) => {
                    const arr = listeners[type] || [];
                    const i = arr.indexOf(fn);
                    if (i !== -1) arr.splice(i, 1);
                }
            };
            const sandbox = {
                document: documentMock,
                requestAnimationFrame: fn => { fn(); return 0; },
                setTimeout: () => 0,
                clearTimeout: () => {},
                Promise
            };
            vm.createContext(sandbox);
            vm.runInContext(dialogSrc, sandbox);
            return { sandbox, overlay, buttons, listeners };
        }
        const fireKey = (sb, key, target) => {
            (sb.listeners.keydown || []).forEach(fn => fn({ key, target: target || null }));
        };

        test('HTML: generateYear — kipConfirm с заголовком «Формирование шахматки» и выбором периода (Task 278)', () => {
            assertTrue(html.indexOf("title: 'Формирование шахматки'") !== -1,
                'заголовок диалога — «Формирование шахматки»');
            assertTrue(html.indexOf("okText: 'Весь год'") !== -1,
                'основная кнопка — «Весь год» (было «Сформировать» до Task 278)');
            assertTrue(html.indexOf('altText: isCurrent') !== -1,
                'альтернативная кнопка — выбор месяца (altText)');
            assertTrue(html.indexOf("'Сформировать шахматку на весь ' + this._year + ' год (все 12 месяцев) '") !== -1,
                'текст вопроса — с ГОДОМ (все 12 месяцев)');
            assertTrue(html.indexOf('Существующие ручные правки будут сохранены') !== -1,
                'пояснение о сохранении ручных правок');
            assertTrue(html.indexOf("if (sel === 'alt') { self._doGenerateMonth(); return; }") !== -1,
                'ветка выбора месяца — _doGenerateMonth');
            assertTrue(html.indexOf('if (!sel) return;') !== -1,
                'генерация только после подтверждения (sel === true)');
        });

        test('HTML: кнопка «Сформировать» — подсказка в окне #wsGenerateTip (Task 328)', () => {
            // Task 328 (заявка): нативный title кнопки УБРАН — пояснение
            // живёт в информационном окне #wsGenerateTip (формат кнопки
            // «Обновить», Task 317: заголовок + описание)
            const btn = html.match(/<button[^>]*id="wsGenerateBtn"[^>]*>/);
            assertTrue(!!btn, 'кнопка есть');
            assertFalse(/title="/.test(btn[0]),
                'нативного title у кнопки «Сформировать» нет (Task 328)');
            const iTip = html.indexOf('id="wsGenerateTip"');
            assertTrue(iTip !== -1, 'окно #wsGenerateTip есть');
            const tip = html.slice(iTip, iTip + 700);
            assertTrue(tip.indexOf('class="ws-refresh-tip"') !== -1,
                'окно — в формате #wsRefreshTip (тот же класс)');
            assertTrue(tip.indexOf('ws-rt-date') !== -1 &&
                       tip.indexOf('Сформировать шахматку') !== -1,
                'строка-заголовок .ws-rt-date');
            assertTrue(tip.indexOf('ws-rt-desc') !== -1 &&
                       tip.indexOf('диалог подтверждения') !== -1,
                'описание упоминает диалог подтверждения');
            assertTrue(tip.indexOf('выбранный месяц или весь год') !== -1,
                'описание упоминает выбор: месяц или весь год (Task 278)');
        });

        test('kipConfirm: дефолтные заголовок и кнопки', async () => {
            const sb = makeDialogSandbox();
            const p = sb.sandbox.kipConfirm('Удалить?', {});
            await Promise.resolve();
            assertTrue(sb.overlay.innerHTML.indexOf('Подтвердите действие') !== -1,
                'заголовок по умолчанию');
            assertTrue(sb.overlay.innerHTML.indexOf('>OK<') !== -1, 'кнопка OK');
            assertTrue(sb.overlay.innerHTML.indexOf('>Отмена<') !== -1, 'кнопка Отмена');
            assertTrue(sb.overlay.classList.contains('active'), 'оверлей активируется');
            sb.buttons.ok.onclick();
            assertEqual(await p, true, 'OK → true');
        });

        test('kipConfirm: кастомные title/okText/cancelText', async () => {
            const sb = makeDialogSandbox();
            const p = sb.sandbox.kipConfirm('Текст', { title: 'Формирование шахматки', okText: 'Сформировать', cancelText: 'Не сейчас' });
            await Promise.resolve();
            assertTrue(sb.overlay.innerHTML.indexOf('Формирование шахматки') !== -1,
                'свой заголовок');
            assertTrue(sb.overlay.innerHTML.indexOf('>Сформировать<') !== -1,
                'своя кнопка подтверждения');
            assertTrue(sb.overlay.innerHTML.indexOf('>Не сейчас<') !== -1,
                'своя кнопка отмены');
            sb.buttons.cancel.onclick();
            assertEqual(await p, false, 'отмена → false');
        });

        test('kipConfirm: danger — красная кнопка OK', () => {
            const sb = makeDialogSandbox();
            sb.sandbox.kipConfirm('Удалить всё?', { danger: true });
            assertTrue(sb.overlay.innerHTML.indexOf('kip-dialog-ok danger') !== -1,
                'класс danger у кнопки подтверждения');
        });

        test('kipConfirm: Escape — отмена, слушатель снимается', async () => {
            const sb = makeDialogSandbox();
            const p = sb.sandbox.kipConfirm('Вопрос?');
            await Promise.resolve();
            assertTrue((sb.listeners.keydown || []).length === 1, 'keydown-слушатель добавлен');
            fireKey(sb, 'Escape');
            assertEqual(await p, false, 'Escape → false');
            assertEqual((sb.listeners.keydown || []).length, 0, 'слушатель снят после закрытия');
        });

        test('kipConfirm: Enter — подтверждение (фокус не на кнопке)', async () => {
            const sb = makeDialogSandbox();
            const p = sb.sandbox.kipConfirm('Вопрос?');
            await Promise.resolve();
            fireKey(sb, 'Enter');
            assertEqual(await p, true, 'Enter → true');
        });

        test('kipConfirm: Enter при фокусе на кнопке диалога — обрабатывает кнопка', async () => {
            const sb = makeDialogSandbox();
            let settled = null;
            const p = sb.sandbox.kipConfirm('Вопрос?');
            p.then(v => { settled = v; });
            await Promise.resolve();
            fireKey(sb, 'Enter', sb.buttons.cancel);   // фокус на «Отмена»
            await new Promise(r => setTimeout(r, 5));
            assertEqual(settled, null, 'глобальный Enter не сработал');
            sb.buttons.cancel.onclick();
            assertEqual(await p, false, 'кнопка отменила');
        });

        test('kipConfirm: двойной клик не ломает результат', async () => {
            const sb = makeDialogSandbox();
            const p = sb.sandbox.kipConfirm('Вопрос?');
            await Promise.resolve();
            sb.buttons.ok.onclick();
            sb.buttons.ok.onclick();
            sb.buttons.cancel.onclick();
            assertEqual(await p, true, 'первое срабатывание побеждает');
            assertEqual((sb.listeners.keydown || []).length, 0, 'слушатель снят один раз');
        });

        test('kipConfirm: экранирование заголовка и надписей', () => {
            const sb = makeDialogSandbox();
            sb.sandbox.kipConfirm('?', { title: '<b>Опасно</b>', okText: 'OK<x>' });
            assertTrue(sb.overlay.innerHTML.indexOf('&lt;b&gt;Опасно&lt;/b&gt;') !== -1,
                'заголовок экранируется');
            assertTrue(sb.overlay.innerHTML.indexOf('OK&lt;x&gt;') !== -1,
                'надпись кнопки экранируется');
        });
    });

    // ============================================================
    // Task 267 (по заявке пользователя), 4 пункта:
    //   1) анимация точек «Загрузка…» при загрузке графика —
    //      по примеру «Расходомеров хозрасчётных» (.flow-loading-dots);
    //   2) Документация ИОС — автоматическое размещение кнопок
    //      (обе в одном .menu-btn-row, как на странице «Библиотека»);
    //   3) «График работы» можно закрепить на главной (SUBSECTIONS);
    //   4) хлебные крошки «Графика работы» — полная цепочка
    //      «Главная / Документация / Документация ИОС / График работы».
    // ============================================================
    describe('Task 267: анимация точек «Загрузка…» в Графике работы', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: переиспользуются классы расходомеров .flow-loading-dots + keyframes', () => {
            assertTrue(html.indexOf('.flow-loading-dots {') !== -1,
                'CSS .flow-loading-dots определён (общий для расходомеров и графика)');
            assertTrue(html.indexOf('@keyframes flowLoadingDot') !== -1,
                'keyframes flowLoadingDot определён');
            assertTrue(html.indexOf('.flow-loading-dots span {') !== -1,
                'анимация на точках-спанах');
            // Задержки чередуются — «бегущие» точки
            const re1 = /\.flow-loading-dots span:nth-child\(1\) \{ animation-delay: 0s; \}/;
            const re3 = /\.flow-loading-dots span:nth-child\(3\) \{ animation-delay: 0\.4s; \}/;
            assertTrue(re1.test(html) && re3.test(html),
                'задержки 0s/0.2s/0.4s — точки бегут по очереди');
        });

        test('HTML: статический #wsEmpty — «Загрузка» + три анимированные точки', () => {
            // Task 269: та же разметка, но на классах расходомеров
            // .flow-loading + .flow-loading-text (шрифт как у расходомеров)
            const re = /<div class="flow-loading" id="wsEmpty"><div class="flow-loading-text">Загрузка<span class="flow-loading-dots"><span>\.<\/span><span>\.<\/span><span>\.<\/span><\/span><\/div><\/div>/;
            assertTrue(re.test(html),
                'плейсхолдер сетки содержит span.flow-loading-dots с тремя точками');
        });

        test('JS: loadGrid() ставит ту же разметку с точками', () => {
            const re = /wrapEl\.innerHTML = '<div class="flow-loading" id="wsEmpty"><div class="flow-loading-text">Загрузка<span class="flow-loading-dots"><span>\.<\/span><span>\.<\/span><span>\.<\/span><\/span><\/div><\/div>';/;
            assertTrue(re.test(html),
                'loadGrid показывает «Загрузка…» с анимированными точками при каждой смене месяца');
        });

        test('CSS-комментарий фиксирует переиспользование классов (Task 267)', () => {
            assertTrue(html.indexOf('Task 267: классы .flow-loading-dots / @keyframes flowLoadingDot') !== -1,
                'комментарий в CSS о совместном использовании классов');
        });
    });

    describe('Task 267: Документация ИОС — автоматическое размещение кнопок', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        // Блок страницы Документация ИОС (от заголовка до следующей страницы)
        const pageStart = html.indexOf('id="page-docs-ios"');
        const pageEnd = html.indexOf('id="page-flowmeter-data"');
        assertTrue(pageStart !== -1 && pageEnd !== -1 && pageStart < pageEnd,
            'страница page-docs-ios найдена');
        const pageBlock = html.slice(pageStart, pageEnd);

        test('HTML: обе кнопки в ОДНОМ .menu-btn-row (как в Библиотеке)', () => {
            const rows = pageBlock.match(/<div class="menu-btn-row">/g) || [];
            assertEqual(rows.length, 1,
                'на странице Документация ИОС ровно один .menu-btn-row (было два)');
            assertTrue(pageBlock.indexOf('id="flowmeterMenuBtn"') !== -1,
                'кнопка «Расходомеры хозрасчётные» на месте');
            assertTrue(pageBlock.indexOf('id="workScheduleMenuBtn"') !== -1,
                'кнопка «График работы» на месте');
            // Порядок: расходомеры раньше графика в разметке
            const iFlow = pageBlock.indexOf('id="flowmeterMenuBtn"');
            const iWs = pageBlock.indexOf('id="workScheduleMenuBtn"');
            assertTrue(iFlow !== -1 && iWs !== -1 && iFlow < iWs,
                'порядок кнопок: Расходомеры → График работы');
        });

        test('CSS: grid-auto-rows 1fr — равная высота кнопок, как у Библиотеки', () => {
            const re = /#page-library-internal \.menu-btn-row,\s*\n\s*#page-library-electro \.menu-btn-row,\s*\n\s*#page-docs-ios \.kip-ios-block \.menu-btn-row \{ grid-auto-rows: 1fr; \}/;
            assertTrue(re.test(html),
                'правило grid-auto-rows: 1fr включает #page-docs-ios .kip-ios-block .menu-btn-row');
        });

        test('CSS: десктоп — 3 колонки для page-docs-ios (авто-размещение сеткой)', () => {
            const re = /#page-docs-ios \.kip-ios-block \.menu-btn-row,[\s\S]{0,200}?grid-template-columns: repeat\(3, 1fr\);/;
            assertTrue(re.test(html),
                'десктопное правило 3 колонок покрывает .kip-ios-block страницы Документация ИОС');
        });

        test('Роль-фильтр: скрытие .kip-ios-block при всех скрытых кнопках не сломано', () => {
            assertTrue(html.indexOf("flowmeterBtn.closest('.kip-ios-block')") !== -1,
                'проверка kip-ios-block осталась (кнопки в одном ряду — closest работает)');
        });
    });

    describe('Task 267: кнопка «График работы» — закрепление на главной', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        // Извлечение реестра SUBSECTIONS (как в test-role-access.js)
        const m = html.match(/const\s+SUBSECTIONS\s*=\s*\{/);
        assertTrue(!!m, 'SUBSECTIONS найден');
        // Запись work-schedule в реестре (регекс по строке реестра)
        test('SUBSECTIONS: запись work-schedule — label/sublabel/target/category', () => {
            // Task 321: label переименован вместе с разделом
            // Task 493: label короче — «Табель учёта» (кнопка; заголовок
            // страницы/крошки остались полными)
            const re = /'work-schedule':\s*\{ label: 'Табель учёта',\s*sublabel: 'Шахматка сменного и дневного персонала',\s*target: 'work-schedule',\s*category: 'docs' \}/;
            assertTrue(re.test(html),
                'реестр содержит work-schedule (метка как у кнопки на странице, категория docs — золотистый стиль)');
        });

        test('SUBSECTIONS: work-schedule доступен для закрепления (валидный target)', () => {
            // target = 'work-schedule' — страница существует и входит в _WORK_SCHEDULE_PAGES
            assertTrue(html.indexOf('id="page-work-schedule"') !== -1,
                'страница page-work-schedule существует');
            assertTrue(html.indexOf(
            "_WORK_SCHEDULE_PAGES: ['work-schedule', 'ws-totals', 'ws-workers', 'ws-legend', 'ws-talons']") !== -1,
                'work-schedule в _WORK_SCHEDULE_PAGES (доступ Админу через *; Task 334: + итоги; Task 385: + «Работники»; Task 386: + «Обозначения»)');
        });

        test('wrapSubsectionItems: ключ кнопки «График работы» теперь в реестре → свайп работает', () => {
            // Кнопка на page-docs-ios имеет onclick navigateTo('work-schedule');
            // wrapSubsectionItems оборачивает только кнопки с ключом в SUBSECTIONS
            const reBtn = /id="workScheduleMenuBtn"[^>]*onclick="navigateTo\('work-schedule'\)"/;
            assertTrue(reBtn.test(html),
                'кнопка workScheduleMenuBtn ведёт на work-schedule');
            assertTrue(html.indexOf("if (!SUBSECTIONS[key]) return;") !== -1,
                'фильтр по реестру в wrapSubsectionItems');
        });

        test('Закреплённый ярлык: рендер как у «Расходомеров» (docs-категория)', () => {
            // renderPinnedItems красит docs-категорию золотистым — как flowmeter-data
            assertTrue(html.indexOf("const isDocs = s.category === 'docs';") !== -1,
                'стилизация docs-категории в renderPinnedItems');
        });
    });

    describe('Task 267: полная цепочка хлебных крошек Графика работы', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('PAGE_PARENTS: work-schedule больше НЕ корневой (dashboard убран)', () => {
            const re = /'work-schedule':\s+'dashboard'/;
            assertTrue(!re.test(html),
                'записи work-schedule → dashboard быть не должно (Task 267 заменил на docs-ios)');
        });

        test('PAGE_PARENTS: цепочка как у «Расходомеров хозрасчётных»', () => {
            const reWs = /'work-schedule':\s+'docs-ios'/;
            const reFlow = /'flowmeter-data':\s+'docs-ios'/;
            assertTrue(reWs.test(html) && reFlow.test(html),
                'work-schedule и flowmeter-data — оба подразделы docs-ios (единая цепочка)');
        });

        test('PAGE_LABELS: метки цепочки существуют (Документация / Документация ИОС / Табель)', () => {
            const labelsMatch = html.match(/const PAGE_LABELS = \{([\s\S]*?)\n    \};/);
            assertTrue(!!labelsMatch, 'PAGE_LABELS найден');
            const labels = labelsMatch[1];
            assertTrue(/'docs':\s+'Документация'/.test(labels), 'метка Документация');
            assertTrue(/'docs-ios':\s+'Документация ИОС'/.test(labels), 'метка Документация ИОС');
            assertTrue(/'work-schedule':\s+'Табель учёта рабочего времени'/.test(labels), 'метка Табель (Task 321)');
        });
    });

    describe('Task 269: SW версия v524', () => {
        const fs = require('fs');
        const path = require('path');
        const swPath = path.resolve(__dirname, '..', 'sw.js');
        const sw = fs.readFileSync(swPath, 'utf8');

        test('CACHE_VERSION = kipia-test-v750', () => {
            assertTrue(sw.indexOf("kipia-test-v750") !== -1,
                'CACHE_VERSION должен быть kipia-test-v750 (Task 290)');
        });
        test('Старая версия v523 убрана', () => {
            assertTrue(sw.indexOf("kipia-test-v523") === -1,
                'Старая v523 не должна остаться в sw.js');
        });
    });

    // ============================================================
    // Task 269 (по заявке пользователя), 5 пунктов — бар кнопок
    // «Графика работы» и «Загрузка…»:
    //   1) столбик норм окна календаря разделён на ДВА столбика
    //      (счётчики дней слева, нормы часов справа от них);
    //   2) само окно стало УЖЕ — ширина по тексту (fit-content);
    //   3) высота кнопок бара ВЫРАВНЕНА (34px у всех элементов);
    //   4) кнопки — в ЛЕВОЙ НИЖНЕЙ части бара, окно с данными —
    //      в ПРАВОЙ (десктоп ≥1024px);
    //   5) шрифт «Загрузка…» — как у «Расходомеров хозрасчётных»
    //      (.flow-loading + .flow-loading-text: 16px / 600).
    // ============================================================
    describe('Task 269: нормы двумя столбиками (.ws-cp-group/.ws-cp-cols)', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: группа норм — колонка с заголовком (.ws-cp-group)', () => {
            assertTrue(/\.ws-cp-group \{[^}]*flex-direction:\s*column/.test(html),
                'группа норм — вертикальная: заголовок сверху, столбики под ним');
            assertTrue(/\.ws-cp-group \{[^}]*flex-shrink:\s*0/.test(html),
                'группа не сжимается — переносится при нехватке ширины');
        });

        test('CSS: ДВА подстолбика норм в ряд (.ws-cp-cols)', () => {
            assertTrue(/\.ws-cp-cols \{[^}]*display:\s*flex/.test(html),
                '.ws-cp-cols — строка из двух подстолбиков');
            assertTrue(/\.ws-cp-cols \{[^}]*column-gap:\s*16px/.test(html),
                'зазор между подстолбиками (второй — справа от первого)');
            assertTrue(/\.ws-cp-cols \{[^}]*flex-wrap:\s*wrap/.test(html),
                'на узких экранах подстолбик часов переносится под дни');
        });

        test('JS: renderPanel — дни и часы в РАЗНЫХ подстолбиках', () => {
            // заголовок «Норма, …» живёт в группе, под ней .ws-cp-cols
            const groupRe = /'<div class="ws-cp-group ws-cp-norms"[^>]*>'\s*\+[^;]*?'<span class="ws-cp-cap">Норма, '/;
            assertTrue(groupRe.test(html),
                'группа норм с заголовком «Норма, {месяц}» (тултип официальности — на группе)');
            assertTrue(html.indexOf("'<div class=\"ws-cp-cols\">'") !== -1,
                'контейнер двух подстолбиков .ws-cp-cols');
            // первый подстолбик — счётчики дней, второй — нормы часов:
            // «Рабочих» и «40-час» в разных .ws-cp-col внутри .ws-cp-cols
            const colsStart = html.indexOf("'<div class=\"ws-cp-cols\">'");
            const colsEnd = html.indexOf("'</div>' +\n                    '</div>';");
            assertTrue(colsStart !== -1 && colsEnd > colsStart, 'блок .ws-cp-cols найден');
            const colsBlock = html.slice(colsStart, colsEnd);
            const iDays = colsBlock.indexOf('Рабочих: <b>');
            const iFirstColEnd = colsBlock.indexOf("'</div>' +", iDays);
            const iHours = colsBlock.indexOf('40-час: <b>');
            assertTrue(iDays !== -1 && iHours !== -1 && iFirstColEnd !== -1,
                'и дни, и часы есть в блоке .ws-cp-cols');
            assertTrue(iDays < iFirstColEnd && iHours > iFirstColEnd,
                '«Рабочих» — в первом подстолбике, «40-час» — во втором (справа)');
        });
    });

    describe('Task 269: окно уже — ширина по тексту; Task 270: высота под 5 строк', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: базовое правило — width: fit-content', () => {
            assertTrue(/\.ws-cal-panel \{[^}]*width:\s*fit-content/.test(html),
                'окно не растягивается — ширина по тексту столбиков');
            assertTrue(/\.ws-cal-panel \{[^}]*max-width:\s*100%/.test(html),
                'окно не шире бара');
        });

        test('CSS: статическая высота 95px — ПОД ПЯТЬ СТРОК (Task 270)', () => {
            assertTrue(/\.ws-cal-panel \{[^}]*height:\s*95px/.test(html),
                'высота окна — 95px в базовом правиле (плашка + 4 строки часов)');
            const re = /@media \(min-width: 1024px\) \{[\s\S]*?\.ws-cal-panel \{[^}]*height:\s*95px/s;
            assertTrue(re.test(html), 'высота окна на десктопе — те же 95px');
            assertFalse(/\.ws-cal-panel \{[^}]*height:\s*120px/.test(html),
                'старая высота 120px (Task 269) заменена');
        });
    });

    describe('Task 269: кнопки слева внизу / окно справа + высота кнопок', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: единая высота всех элементов ряда кнопок (32px)', () => {
            // Task 306: .ws-cal-chip убран из списка — кнопка «Обновить» удалена
            // Task 307: + .ws-addemp-btn; Task 311: − .ws-addemp-btn — кнопка
            // «+ Сотрудник» удалена из тулбара (добавление — заголовок «Сотрудник»)
            // Task 312: − .ws-addvac-btn — кнопка «+ Отпуск» удалена из тулбара
            // (добавление — строка «+ Отпуск…» в карточке сотрудника)
            // Task 314: + .ws-refresh-btn — кнопка «Обновить» (данные,
            // не формирование) в ряду селектов, один рост 34px
            // Task 324: + .ws-totals-btn и .ws-tt-tab — кнопка «Итоги учёта» и
            // вкладки «Месяц»/«Год» в НИЖНЕМ ряду кнопок — тот же рост; Task 328: 32px (кнопки меньше)
            const re = /\.ws-month-sel, \.ws-year-sel, \.ws-generate-btn, \.ws-save-btn,\n\s*\.ws-refresh-btn, \.ws-totals-btn, \.ws-tt-tab \{[^}]*height:\s*32px[^}]*box-sizing:\s*border-box/;
            assertTrue(re.test(html),
                'селекты, «Сформировать», «Сохранить», «Обновить», «Итоги учёта» и вкладки — одного роста');
            assertFalse(html.indexOf('.ws-addemp-btn') !== -1,
                'стиль удалённой кнопки «+ Сотрудник» не остался (Task 311)');
            assertTrue(html.indexOf('.ws-cal-chip {') === -1 &&
                       html.indexOf('.ws-cal-chip:') === -1,
                'мёртвые стили удалённой кнопки не остались (упоминания в комментариях не в счёт)');
        });

        test('CSS: десктоп — кнопки в ЛЕВОЙ равной трети бара (Task 272→315→317)', () => {
            // Task 315: строка 1 бара — grid из ТРЁХ РАВНЫХ частей;
            // ряд кнопок — первая (левая) треть. Task 317: колонка
            // кнопок — ТРИ РЯДА ровно в высоту окон (95px)
            assertTrue(/\.ws-bar-row \{[^}]*grid-template-columns:\s*1fr 1fr 1fr/.test(html),
                'десктоп: бар — ТРИ РАВНЫЕ части (grid 1fr 1fr 1fr, Task 315)');
            const mq = html.match(/\.ws-toolbar-main \{[^}]*height:\s*95px/);
            assertTrue(!!mq, 'Task 317: десктопная колонка кнопок — 95px (ровно окна)');
            assertTrue(/\.ws-toolbar-main \{[^}]*flex-direction:\s*column/.test(html) &&
                       /\.ws-toolbar-main \{[^}]*gap:\s*3px/.test(html),
                'Task 317: базовая колонка кнопок — column, зазор 3px');
        });

        test('CSS: десктоп — окна — ВТОРАЯ и ТРЕТЬЯ равные трети (Task 315)', () => {
            const mq = html.match(/@media \(min-width: 1024px\) \{[\s\S]*?\.ws-events-panel,[\s\S]*?\.ws-cal-panel \{[\s\S]*?\}/);
            assertTrue(!!mq, 'десктопное правило обоих окон бара');
            assertTrue(mq[0].indexOf('height: 95px') !== -1,
                'высота окон — 95px (статическая, Task 270)');
            assertTrue(mq[0].indexOf('justify-self: stretch') !== -1,
                'окна растягиваются на свою 1/3 (базовый fit-content календаря выключен)');
            assertFalse(/\.ws-cal-panel \{[^}]*flex:\s*0 1 auto/.test(html),
                'компоновка flex: 0 1 auto (Task 269) удалена — теперь grid');
        });

        test('CSS: старое размещение Task 266 удалено', () => {
            assertFalse(/\.ws-toolbar-main \{[^}]*margin-left:\s*auto/.test(html),
                'кнопки больше не прижаты вправо');
            assertFalse(/\.ws-cal-panel \{[^}]*min-width:\s*0/.test(html),
                'min-width: 0 из старого правила удалён');
        });
    });

    describe('Task 269: шрифт «Загрузка…» — как у расходомеров', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: .flow-loading-text — 16px / 600 / text-primary', () => {
            assertTrue(/\.flow-loading-text \{[^}]*font-size:\s*16px/.test(html),
                'размер шрифта «Загрузка…» — 16px (как у расходомеров)');
            assertTrue(/\.flow-loading-text \{[^}]*font-weight:\s*600/.test(html),
                'жирность — 600');
            assertTrue(/\.flow-loading-text \{[^}]*color:\s*var\(--text-primary\)/.test(html),
                'цвет — основной текст, а не приглушённый admin-empty');
        });

        test('HTML: статический #wsEmpty — .flow-loading + .flow-loading-text', () => {
            const re = /<div class="flow-loading" id="wsEmpty"><div class="flow-loading-text">Загрузка<span class="flow-loading-dots"><span>\.<\/span><span>\.<\/span><span>\.<\/span><\/span><\/div><\/div>/;
            assertTrue(re.test(html),
                'плейсхолдер сетки использует классы расходомеров (шрифт 16px/600) с тремя точками');
        });

        test('JS: loadGrid() ставит ту же разметку с классами расходомеров', () => {
            const re = /wrapEl\.innerHTML = '<div class="flow-loading" id="wsEmpty"><div class="flow-loading-text">Загрузка<span class="flow-loading-dots"><span>\.<\/span><span>\.<\/span><span>\.<\/span><\/span><\/div><\/div>';/;
            assertTrue(re.test(html),
                'loadGrid показывает «Загрузка…» шрифтом расходомеров при каждой смене месяца');
        });

        test('HTML: #wsEmpty больше не использует admin-empty', () => {
            assertFalse(/<div class="admin-empty" id="wsEmpty"/.test(html),
                'старая разметка admin-empty (14px, приглушённый цвет) удалена');
        });
    });

    // ============================================================
    // Task 270: окошко календаря — высота под 5 строк, светлый фон
    // темнее, плашки-заголовки столбцов с цветным фоном и ярким
    // текстом, узкий бар с отступами 5px
    // ============================================================

    describe('Task 270: заголовки столбцов — плашки с цветным фоном, текст ярче', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: .ws-cp-cap — плашка (inline-block + padding, обнимает текст)', () => {
            assertTrue(/\.ws-cp-cap \{[^}]*display:\s*inline-block/.test(html),
                'заголовок — inline-block плашка, а не растянутая строка');
            assertTrue(/\.ws-cp-cap \{[^}]*padding:\s*1px 7px/.test(html),
                'плашка с внутренними отступами 1px 7px');
            assertTrue(/\.ws-cp-cap \{[^}]*align-self:\s*flex-start/.test(html),
                'плашка не тянется на ширину столбика (align-self: flex-start)');
            assertTrue(/\.ws-cp-cap \{[^}]*border-radius:\s*2px/.test(html),
                'скругление 2px — как у чипов дней');
        });

        test('CSS: плашка «Норма» — синий фон, яркий текст', () => {
            const re = /\.ws-cp-norms > \.ws-cp-cap \{[^}]*background:\s*rgba\(74, 143, 199, 0\.22\);[^}]*color:\s*#93c1ea;/s;
            assertTrue(re.test(html),
                'цветовое разграничение: заголовок норм — синяя плашка, текст яркий #93c1ea');
        });

        test('CSS: плашка «Праздники» — красный фон, яркий текст', () => {
            const re = /\.ws-cp-days > \.ws-cp-cap \{[^}]*background:\s*rgba\(255, 107, 107, 0\.20\);[^}]*color:\s*#ff9c9c;/s;
            assertTrue(re.test(html),
                'заголовок праздников — красная плашка, текст яркий #ff9c9c');
        });

        test('CSS: плашки РАЗНЫЕ — синий ≠ красный (цветовое разграничение)', () => {
            const norms = html.match(/\.ws-cp-norms > \.ws-cp-cap \{[^}]*\}/s);
            const days = html.match(/\.ws-cp-days > \.ws-cp-cap \{[^}]*\}/s);
            assertTrue(norms && days && norms[0] !== days[0],
                'у заголовков норм и праздников — разные цвета фона');
        });

        test('CSS: светлая тема — плашки сохраняют смысловые цвета, текст ЧЁРНЫЙ (Task 330)', () => {
            // Task 330 (заявка): ВЕСЬ текст окон бара в светлой теме —
            // чёрный; цветные фоны плашек сохранены как подложки
            const reN = /\[data-theme="light"\] \.ws-cp-norms > \.ws-cp-cap \{[^}]*background:\s*rgba\(74, 143, 199, 0\.16\);[^}]*color:\s*#000;/s;
            assertTrue(reN.test(html),
                'светлая тема: норм — синяя плашка, чёрный текст (Task 330)');
            const reD = /\[data-theme="light"\] \.ws-cp-days > \.ws-cp-cap \{[^}]*background:\s*rgba\(255, 107, 107, 0\.15\);[^}]*color:\s*#000;/s;
            assertTrue(reD.test(html),
                'светлая тема: праздники — красная плашка, чёрный текст (Task 330)');
        });

        test('CSS: светлая тема — .ws-cp-cap больше НЕ перекрашивается в серый', () => {
            assertFalse(/\[data-theme="light"\] \.ws-cp-cap,/.test(html),
                'старое правило серого заголовка в светлой теме удалено');
        });
    });

    describe('Task 270: светлая тема — окно темнее, бар узкий с отступами 5px', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('CSS: светлая тема — фон окна #e9e7de (темнее белого и тулбара)', () => {
            const re = /\[data-theme="light"\] \.ws-cal-panel \{[^}]*background:\s*#e9e7de;/s;
            assertTrue(re.test(html),
                'окно в светлой теме — на тон темнее (#e9e7de вместо #fff): ' +
                'углублённый блок данных, не выбеливается на баре #f0eee6');
            assertFalse(/\[data-theme="light"\] \.ws-cal-panel \{[^}]*background:\s*#fff;/s.test(html),
                'белый фон окна в светлой теме убран');
        });

        test('CSS: отступы бара — 5px со всех сторон (базовое правило)', () => {
            assertTrue(/\.ws-toolbar \{[^}]*padding:\s*5px;/.test(html),
                'внутренние отступы тулбара — 5px (было 8px 12px)');
        });

        test('CSS: десктоп — зазор между рядом кнопок и окном 5px', () => {
            const re = /@media \(min-width: 1024px\) \{[\s\S]*?\.ws-toolbar \{[^}]*gap:\s*5px;/s;
            assertTrue(re.test(html), 'десктопный зазор в баре — 5px (было 12px)');
        });

        test('CSS: бар узкий — высота задаётся окном 95px, без лишних мин-высот', () => {
            // окно 95px + 2×5px отступа + рамка 1px = 106px: бар обнимает окно
            assertTrue(/\.ws-cal-panel \{[^}]*height:\s*95px/.test(html),
                'высота окна — 95px: бар сужается по высоте окошка');
            assertFalse(/\.ws-toolbar \{[^}]*min-height/.test(html),
                'у тулбара нет независимой мин-высоты — бар по содержимому');
            assertFalse(/\.ws-toolbar \{[^}]*padding:\s*8px 12px/.test(html),
                'старые отступы 8px 12px убраны');
        });
    });

    // ============================================================
    // Task 272 → Task 306 (по заявке пользователя):
    //   1) кнопка «Календарь» (Task 272) стала «Обновить», а в
    //      Task 306 УДАЛЕНА — «Обновить» и «Сформировать»
    //      объединены в одну кнопку «Сформировать»: подтверждённое
    //      формирование ТИХО обновляет производственный календарь
    //      (WorkSchedule._refreshProdCalendarQuiet →
    //      ProdCalendar.refreshNow(true));
    //   2) шторка настроек УДАЛЕНА (Task 272): регион один (42 —
    //      Кемеровская область - Кузбасс);
    //   3) «Сформировать» строит шахматку на ВЕСЬ ГОД (12 месяцев
    //      последовательными вызовами workSchedule.generateMonth);
    //   4) кнопка «Сформировать» — в ЛЕВОМ ВЕРХНЕМ углу бара.
    // ============================================================
    describe('Task 306: кнопка «Обновить» объединена с «Сформировать»', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('HTML: кнопка wsCalChip УДАЛЕНА, wsGenerateBtn осталась', () => {
            assertTrue(html.indexOf('id="wsCalChip"') === -1,
                'кнопка wsCalChip удалена из тулбара');
            assertTrue(html.indexOf('onclick="ProdCalendar.confirmRefresh()"') === -1,
                'онклик confirmRefresh удалён');
            const m = html.match(/<button[^>]*id="wsGenerateBtn"[^>]*>/);
            assertTrue(!!m, 'кнопка wsGenerateBtn в тулбаре');
            assertTrue(html.indexOf('<span id="wsCalChipText">Обновить</span>') === -1,
                'надпись «Обновить» удалена вместе с кнопкой');
            assertTrue(html.indexOf('<span id="wsCalChipText">Календарь</span>') === -1,
                'старая надпись «Календарь» удалена');
        });

        test('JS: _updateCalChip — только перерисовка окошка норм', () => {
            assertTrue(html.indexOf("textEl.textContent = 'Обновить';") === -1,
                'старая синхронизация текста кнопки удалена');
            assertTrue(html.indexOf("textEl.textContent = 'Календарь';") === -1,
                'старый текст удалён');
            const chip = html.match(/_updateCalChip: function\(\) \{[\s\S]{0,200}?\}/);
            assertTrue(chip && chip[0].indexOf('ProdCalendar.renderPanel()') !== -1,
                'хелпер остаётся перерисовкой wsCalPanel');
            assertTrue(html.indexOf('_refreshProdCalendarQuiet: function') !== -1,
                'хелпер тихого обновления календаря определён');
        });

        test('HTML: шторка настроек и токен полностью удалены', () => {
            assertTrue(html.indexOf('id="wsCalSheet"') === -1, 'шторка удалена');
            assertTrue(html.indexOf('id="wsCalOverlay"') === -1, 'оверлей шторки удалён');
            assertTrue(html.indexOf('wsCalToken') === -1, 'поле токена удалено');
            assertTrue(html.indexOf('wsCalRegionSel') === -1, 'селект региона удалён');
            // Task 532: текст «Обновить сейчас» легитимно вернулся как
            // кнопка форс-опроса погоды в настройках LCD-информера
            // (WsLcdClock._weatherNow) — поэтому проверяем, что его
            // НЕТ в КНОПКЕ старой шторки, а не по всей странице
            assertTrue(!/<button[^>]*id="wsCal[^>]*>[^<]*Обновить сейчас/.test(html),
                'кнопка «Обновить сейчас» из шторки удалена (в LCD-настройках — другая, Task 532)');
            assertTrue(html.indexOf('Расширенный источник') === -1,
                'блок расширенного источника удалён');
        });
    });

    describe('Task 272: «Сформировать» — шахматка на весь год', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('HTML: кнопка вызывает WorkSchedule.generateYear()', () => {
            const m = html.match(/<button[^>]*id="wsGenerateBtn"[^>]*>/);
            assertTrue(!!m, 'кнопка wsGenerateBtn в тулбаре');
            assertTrue(m[0].indexOf('onclick="WorkSchedule.generateYear()"') !== -1,
                'onclick — WorkSchedule.generateYear()');
        });

        test('JS: generateYear определён, generateMonth (клиент) удалён', () => {
            assertTrue(html.indexOf('generateYear: function') !== -1,
                'метод generateYear определён');
            assertTrue(html.indexOf('_doGenerateYear: function') !== -1,
                'метод _doGenerateYear определён (цикл по месяцам)');
            assertFalse(/generateMonth: function/.test(html),
                'старый клиентский generateMonth: function удалён');
        });

        test('JS: _doGenerateYear — цикл 1..12 по workSchedule.generateMonth', () => {
            assertTrue(html.indexOf('nextMonth = function(month)') !== -1,
                'рекурсивный обход месяцев');
            assertTrue(html.indexOf('if (month > 12)') !== -1,
                'условие завершения после 12-го месяца');
            const apiCalls = (html.match(/workSchedule\.generateMonth'/g) || []).length;
            assertTrue(apiCalls >= 1,
                'серверный эндпоинт workSchedule.generateMonth вызывается из цикла');
            assertTrue(html.indexOf("'Формируется… ' + month + '/12'") !== -1,
                'прогресс на кнопке — «Формируется… N/12»');
        });

        test('JS: итоговый тост — суммы за весь год', () => {
            assertTrue(html.indexOf("'Год ' + self._year + ': сформировано '") !== -1,
                'тост с суммой сформированных записей за год');
            assertTrue(html.indexOf('totalGenerated') !== -1 &&
                       html.indexOf('totalUpdated') !== -1,
                'счётчики суммируются по всем месяцам');
        });

        test('JS: диалог подтверждения — выбор: месяц или весь год (Task 278)', () => {
            assertTrue(html.indexOf("'или только на ' + (isCurrent ? 'текущий' : 'выбранный')") !== -1,
                'вопрос диалога — на весь год ИЛИ только месяц');
            assertTrue(html.indexOf("altText: isCurrent ? 'Текущий месяц' : 'Выбранный месяц'") !== -1,
                'надпись альт-кнопки адаптируется: текущий/выбранный месяц');
            assertTrue(html.indexOf("monthNames[this._month - 1]") !== -1,
                'название выбранного месяца — в тексте диалога');
        });
    });

    describe('Task 272: SW версия v526', () => {
        const fs = require('fs');
        const path = require('path');
        const swPath = path.resolve(__dirname, '..', 'sw.js');
        const sw = fs.readFileSync(swPath, 'utf8');

        test('CACHE_VERSION = kipia-test-v750', () => {
            assertTrue(sw.indexOf("kipia-test-v750") !== -1,
                'CACHE_VERSION должен быть kipia-test-v750 (Task 290)');
        });
        test('Старая версия v525 убрана', () => {
            assertTrue(sw.indexOf("kipia-test-v525") === -1,
                'Старая v525 не должна остаться в sw.js');
        });
    });

    // ============================================================
    // Task 274: автоматическая расстановка отпусков в шахматке.
    //   Лист «Отпуска» таблицы табель_КИП_ИОС: периоды 2–3 частей
    //   на год; серверные listVacations/addVacation/deleteVacation;
    //   generateMonth заполняет «О» с приоритетом (Task 303:
    //   руч > отпуск > плановая смена > мероприятие — И/ОБ/ПЗ только
    //   на день без смены); устаревшие авто-«О» удаляются
    //   (идемпотентность). Фронтенд: страница «Отпуска»,
    //   субнавигация модуля, план «О» в пустых ячейках.
    // ============================================================

    // ---- Референс-имплементация отпускной логики (как на сервере) ----

    // Длительность периода в календарных днях (включительно)
    function vacDays(startIso, endIso) {
        const s = parseIsoDate(startIso);
        const e = parseIsoDate(endIso) || s;
        if (!s || !e) return 0;
        return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
    }

    // Дни периода, попадающие в год (период через границу года)
    function vacDaysInYear(startIso, endIso, year) {
        const s = parseIsoDate(startIso);
        const e = parseIsoDate(endIso) || s;
        if (!s || !e) return 0;
        const yStart = new Date(year, 0, 1).getTime();
        const yEnd = new Date(year + 1, 0, 1).getTime();
        const from = Math.max(s.getTime(), yStart);
        const to = Math.min(e.getTime(), yEnd - 1);
        if (to < from) return 0;
        return Math.floor(to / 86400000) - Math.floor(from / 86400000) + 1;
    }

    // Пересечение двух периодов [s1,e1] × [s2,e2] (ISO-строки
    // сравниваются лексикографически = хронологически)
    function periodsOverlap(s1, e1, s2, e2) {
        return e1 >= s2 && s1 <= e2;
    }

    // Итоговый статус дня по приоритету источников (Task 274 + Task 303):
    // ручная запись > отпуск > плановая смена > мероприятие (И/ОБ/ПЗ —
    // только на день БЕЗ плановой смены; Task 303: на сменных днях
    // мероприятие НЕ затирает смену — остаётся бейджем на клиенте)
    function dayStatusPriority(manual, vacation, training, shift) {
        if (manual) return manual;
        if (vacation) return 'ОТ';
        if (shift) return shift;        // Task 303: смена > мероприятие
        if (training) return training;  // И / ОБ / ПЗ (день без смены)
        return '';
    }

    // Устаревшая авто-«ОТ»: запись-кандидат на удаление при
    // повторной генерации (не покрыта текущим планом отпусков)
    function isStaleVacationEntry(entry, coveredKeys) {
        return entry.статус === 'ОТ' && entry.источник === 'авто' &&
               !coveredKeys[entry.дата + '|' + entry.таб_номер];
    }

    describe('Task 274: лист «Отпуска» — структура и серверные API', () => {
        const fs = require('fs');
        const path = require('path');
        const gs = fs.readFileSync(
            path.resolve(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');
        const code = fs.readFileSync(
            path.resolve(__dirname, '..', 'scripts', 'Code.gs'), 'utf8');

        test('Константа VACATIONS_SHEET = «Отпуска»', () => {
            assertTrue(gs.indexOf("VACATIONS_SHEET:    'Отпуска'") !== -1,
                'лист «Отпуска» объявлен в WorkSchedule.gs');
        });

        test('Структура листа задокументирована (A id … F комментарий)', () => {
            assertTrue(gs.indexOf('Структура листа «Отпуска»') !== -1,
                'секция структуры листа в шапке');
            const part = gs.slice(gs.indexOf('Структура листа «Отпуска»'));
            ['id (auto-increment)', 'таб_номер', 'часть (1..3', 'дата_начала',
             'дата_окончания', 'комментарий'].forEach(col => {
                assertTrue(part.indexOf(col) !== -1, 'столбец: ' + col);
            });
        });

        test('Методы listVacations/addVacation/deleteVacation определены', () => {
            assertTrue(gs.indexOf('listVacations: function') !== -1);
            assertTrue(gs.indexOf('addVacation: function') !== -1);
            assertTrue(gs.indexOf('deleteVacation: function') !== -1);
        });

        test('Code.gs: роутинг трёх экшенов отпусков', () => {
            assertTrue(code.indexOf("case 'workSchedule.listVacations':") !== -1);
            assertTrue(code.indexOf("case 'workSchedule.addVacation':") !== -1);
            assertTrue(code.indexOf("case 'workSchedule.deleteVacation':") !== -1);
        });

        test('addVacation: валидация — часть 1..3, конец ≥ начала, пересечение', () => {
            assertTrue(gs.indexOf("error: 'invalid_часть'") !== -1);
            assertTrue(gs.indexOf("error: 'end_before_start'") !== -1);
            assertTrue(gs.indexOf("error: 'overlap'") !== -1);
            assertTrue(gs.indexOf("error: 'duplicate_часть'") !== -1);
        });

        test('generateMonth: отпускной проход после инструктажей (4.5)', () => {
            assertTrue(gs.indexOf('4.5 (Task 274) Прогон по отпускам') !== -1,
                'шаг 4.5 — отпуска перекрывают смены и инструктажи');
        });

        test('generateMonth: возвращает removed (удалённые устаревшие «О»)', () => {
            assertTrue(gs.indexOf('removed: removeCount') !== -1);
            assertTrue(gs.indexOf('vacationGenerated: vacationGenerated') !== -1);
            assertTrue(gs.indexOf('vacationUpdated: vacationUpdated') !== -1);
        });

        test('Отсутствие листа «Отпуска» не ломает генерацию', () => {
            const m = gs.match(/var vacs = this\.listVacations[\s\S]{0,200}/);
            assertTrue(!!m, 'вызов listVacations в generateMonth');
            assertTrue(gs.indexOf('vacs.ok && vacs.data') !== -1,
                'сбой listVacations → vacations=[] (генерация продолжается)');
        });
    });

    describe('Task 274: алгоритм заполнения отпусков (референс)', () => {
        test('Длительность периода: один день → 1', () => {
            assertEqual(vacDays('2026-06-10', '2026-06-10'), 1);
        });
        test('Длительность: 01.06–14.06 → 14', () => {
            assertEqual(vacDays('2026-06-01', '2026-06-14'), 14);
        });
        test('Длительность: 29.12–11.01 → 14 (через границу года)', () => {
            assertEqual(vacDays('2025-12-29', '2026-01-11'), 14);
        });

        test('Дни в году: период внутри года → полная длительность', () => {
            assertEqual(vacDaysInYear('2026-06-01', '2026-06-14', 2026), 14);
        });
        test('Дни в году: 29.12.2025–11.01.2026 → 3 в 2025, 11 в 2026', () => {
            assertEqual(vacDaysInYear('2025-12-29', '2026-01-11', 2025), 3);
            assertEqual(vacDaysInYear('2025-12-29', '2026-01-11', 2026), 11);
        });
        test('Дни в году: период вне года → 0', () => {
            assertEqual(vacDaysInYear('2024-06-01', '2024-06-14', 2026), 0);
        });

        test('Части 2–3 на год: 14 + 10 + 4 = 28 дн.', () => {
            const total = vacDays('2026-06-01', '2026-06-14') +
                          vacDays('2026-08-03', '2026-08-12') +
                          vacDays('2026-10-19', '2026-10-22');
            assertEqual(total, 28);
        });

        test('Пересечение периодов: вложенный → true', () => {
            assertTrue(periodsOverlap('2026-06-01', '2026-06-30',
                                      '2026-06-10', '2026-06-20'));
        });
        test('Пересечение: касание границы (конец = начало) → true', () => {
            assertTrue(periodsOverlap('2026-06-01', '2026-06-10',
                                      '2026-06-10', '2026-06-20'));
        });
        test('Пересечение: разрозненные периоды → false', () => {
            assertFalse(periodsOverlap('2026-06-01', '2026-06-10',
                                       '2026-06-11', '2026-06-20'));
        });

        test('Приоритет дня: ручная правка перекрывает отпуск', () => {
            assertEqual(dayStatusPriority('Б', true, null, 'Д'), 'Б');
        });
        test('Приоритет дня: отпуск перекрывает инструктаж', () => {
            assertEqual(dayStatusPriority(null, true, 'И', null), 'ОТ');
        });
        test('Приоритет дня: отпуск перекрывает плановую смену', () => {
            assertEqual(dayStatusPriority(null, true, null, 'Д'), 'ОТ');
        });
        test('Приоритет дня: смена перекрывает инструктаж (Task 303)', () => {
            assertEqual(dayStatusPriority(null, false, 'И', 'Д'), 'Д',
                'Task 303: мероприятие НЕ затирает смену — бейдж на клиенте');
        });
        test('Приоритет дня: мероприятие на дне без смены → код (Task 303)', () => {
            assertEqual(dayStatusPriority(null, false, 'И', null), 'И',
                'мероприятие в выходной — код в Записи_графика');
        });
        test('Приоритет дня: ничего нет → пусто', () => {
            assertEqual(dayStatusPriority(null, false, null, null), '');
        });

        test('Устаревшая авто-«ОТ» вне текущего плана → кандидат на удаление', () => {
            const covered = { '2026-06-05|007': true };
            const stale = { статус: 'ОТ', источник: 'авто',
                            дата: '2026-06-05', таб_номер: '007' };
            const fresh = { статус: 'ОТ', источник: 'авто',
                            дата: '2026-06-06', таб_номер: '007' };
            assertFalse(isStaleVacationEntry(stale, covered), 'покрытый день остаётся');
            assertTrue(isStaleVacationEntry(fresh, covered), 'непокрытый день удаляется');
        });
        test('Ручная «ОТ» никогда не удаляется', () => {
            const manual = { статус: 'ОТ', источник: 'руч',
                             дата: '2026-06-06', таб_номер: '007' };
            assertFalse(isStaleVacationEntry(manual, {}));
        });
        test('Легаси-«О» (Task 298, до миграции) не считается устаревшим отпуском — не удаляется', () => {
            const legacy = { статус: 'О', источник: 'авто',
                             дата: '2026-06-06', таб_номер: '007' };
            assertFalse(isStaleVacationEntry(legacy, {}),
                'легаси-«О» не трогается генератором (только миграцией/перекрытием)');
        });
        test('Авто-«И» (инструктаж) не считается устаревшим отпуском', () => {
            const training = { статус: 'И', источник: 'авто',
                               дата: '2026-06-06', таб_номер: '007' };
            assertFalse(isStaleVacationEntry(training, {}));
        });
    });

    describe('Task 274: страница «Отпуска» и план «О» (фронтенд)', () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '..', 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        test('HTML: страница page-work-schedule-vacations УДАЛЕНА (Task 308)', () => {
            assertTrue(html.indexOf('id="page-work-schedule-vacations"') === -1,
                'дива page-work-schedule-vacations нет — вкладка «Отпуска» убрана');
        });

        test('HTML: внутренности страницы удалены вместе с ней (Task 308)', () => {
            ['wsVacYearSel', 'wsVacSummary', 'wsVacationsList', 'wsVacationsEmpty',
             'wsAddVacationBar'].forEach(id => {
                assertTrue(html.indexOf('id="' + id + '"') === -1,
                    'id="' + id + '" удалён (год плана — год шахматки, сводка/список/бар — со страницей)');
            });
        });

        test('HTML: форма «Новый отпуск» (таб.№, часть, даты, комментарий)', () => {
            ['wsVacTabNo', 'wsVacPart', 'wsVacStart', 'wsVacEnd',
             'wsVacComment', 'wsVacOverlay', 'wsVacSheet'].forEach(id => {
                assertTrue(html.indexOf('id="' + id + '"') !== -1, 'поле ' + id);
            });
            // Task 384: у заголовка появился id (режим «Правка отпуска»)
            assertTrue(html.indexOf('flow-input-sheet-title" id="wsVacSheetTitle">Новый отпуск<') !== -1,
                'заголовок формы (id wsVacSheetTitle — Task 384)');
            assertTrue((html.match(/<option value="[123]">[123] — /g) || []).length === 3,
                'части 1–3 в селекте');
        });

        test('HTML: подсказка про деление на части и ст. 125 ТК РФ', () => {
            assertTrue(html.indexOf('2–3 части в год') !== -1);
            assertTrue(html.indexOf('ст. 125 ТК РФ') !== -1);
        });

        test('HTML: субнавигация модуля УДАЛЕНА (Task 308)', () => {
            assertEqual((html.match(/class="ws-subnav"/g) || []).length, 0,
                'полос ws-subnav нет — модуль одностраничный');
            // строго по class-атрибутам: упоминания селекторов в
            // комментариях CSS (мемориальные) не в счёт
            assertEqual((html.match(/class="ws-subnav-btn[^"]*"/g) || []).length, 0,
                'кнопок ws-subnav-btn в разметке нет');
        });

        test('HTML: активных пунктов субнавигации нет (Task 308)', () => {
            assertEqual((html.match(/ws-subnav-btn active/g) || []).length, 0,
                'подсветки активного пункта нет — субнавигация удалена');
        });

        test('JS: кэш и загрузка — _VACATIONS, _loadVacations в Promise.all', () => {
            assertTrue(html.indexOf('_loadVacations: function') !== -1);
            assertTrue(html.indexOf('_VACATIONS: []') !== -1);
            const lg = html.slice(html.indexOf('loadGrid: function'),
                                  html.indexOf('_ensureCal: function'));
            // Task 476: сетевой путь вложен в .then(idbTry) — self.
            assertTrue(lg.indexOf('self._loadVacations()') !== -1,
                'план отпусков грузится вместе с сеткой');
            assertTrue(lg.indexOf('catch(function() {') === -1 ||
                       lg.indexOf('_loadVacations') !== -1);
            // сбой загрузки отпусков не ломает сетку (собственный catch)
            const lv = html.slice(html.indexOf('_loadVacations: function'),
                                  html.indexOf('loadGrid: function'));
            assertTrue(lv.indexOf('catch') !== -1, 'fallback при ошибке — пустой список');
        });

        test('JS: хелперы отпусков определены', () => {
            ['_vacationAt: function', '_vacDays: function',
             '_vacDaysInYear: function', '_fmtDateRu: function',
             '_plural: function', '_parseIsoLocal: function'].forEach(fn => {
                assertTrue(html.indexOf(fn) !== -1, fn);
            });
        });

        test('JS: план «ОТ» в пустой ячейке — класс ws-vac-plan, записи не перекрываются', () => {
            assertTrue(html.indexOf("classes.push('ws-vac-plan')") !== -1,
                'класс ws-vac-plan ставится');
            const rc = html.slice(html.indexOf('_renderCell: function'),
                                  html.indexOf('generateYear: function'));
            assertTrue(rc.indexOf("if (!status && !isPending)") !== -1,
                'план только в ПУСТОЙ ячейке без локальной правки');
            // Task 314: showMainCode — план без изменений
            // Task 356: точка «·» не выводится (пустой центр у ячеек без кодов)
            assertTrue(rc.indexOf("(showMainCode ? status : (vacPlan ? 'ОТ' : ''))") !== -1,
                'код «ОТ» в ячейке плана (Task 298/314; Task 355/356: пустые — без «·»)');
        });

        test('CSS: ws-vac-plan — фон отпуска и пунктирная рамка', () => {
            const rule = html.match(/\.ws-grid tbody td\.ws-cell\.ws-vac-plan\s*\{[^}]+\}/);
            assertTrue(!!rule, 'правило .ws-vac-plan есть');
            assertTrue(rule[0].indexOf('#ECEFF1') !== -1, 'фон цвета «О»');
            assertTrue(rule[0].indexOf('dashed') !== -1, 'пунктирная рамка');
            assertTrue(html.indexOf('[data-theme="light"] .ws-grid tbody td.ws-cell.ws-vac-plan') !== -1,
                'светлая тема');
        });

        test('JS: методы страницы «Отпуска» удалены, методы шторки живы (Task 308)', () => {
            // страничные (init/список/рендер/селект года) — удалены;
            //  отсекает _loadVacations (загрузчик сетки, жив)
            ['initVacationsPage: function', '_renderVacations: function',
             'onVacYearChange: function'].forEach(fn => {
                assertTrue(html.indexOf(fn) === -1, fn + ' удалён');
            });
            assertFalse(/\bloadVacations:\s*function/.test(html),
                'loadVacations: function удалён (_loadVacations-загрузчик жив)');
            // шторка «+ Отпуск» из тулбара + API-методы удаления — живы
            ['openVacationForm: function', 'closeVacationForm: function',
             'onVacEmployeeChange: function', 'onVacDatesChange: function',
             'submitVacationForm: function', 'deleteVacation: function',
             '_doDeleteVacation: function'].forEach(fn => {
                assertTrue(html.indexOf(fn) !== -1, fn);
            });
        });

        test('JS: submitVacationForm вызывает addVacation с полями', () => {
            const sv = html.slice(html.indexOf('submitVacationForm: function'),
                                  html.indexOf('deleteVacation: function'));
            assertTrue(sv.indexOf("workSchedule.addVacation") !== -1, 'эндпоинт addVacation');
            assertTrue(sv.indexOf("'таб_номер': tabNo") !== -1);
            assertTrue(sv.indexOf('часть: part') !== -1);
            assertTrue(sv.indexOf('дата_начала: startDate') !== -1);
            assertTrue(sv.indexOf('дата_окончания: endDate') !== -1);
        });

        test('JS: клиентская проверка пересечения периодов до отправки', () => {
            const sv = html.slice(html.indexOf('submitVacationForm: function'),
                                  html.indexOf('deleteVacation: function'));
            assertTrue(sv.indexOf('пересекается с отпуском') !== -1,
                'тост о пересечении');
        });

        test('JS: часть подставляется первым свободным номером', () => {
            const ve = html.slice(html.indexOf('onVacEmployeeChange: function'),
                                  html.indexOf('onVacDatesChange: function'));
            assertTrue(ve.indexOf('while (free <= 3 && used[free]) free++;') !== -1,
                'поиск свободной части 1..3');
        });

        test('JS: тосты после добавления/удаления напоминают про «Сформировать»', () => {
            assertTrue(html.indexOf('Нажмите «Сформировать» в шахматке') !== -1);
            assertTrue(html.indexOf('Пересформируйте шахматку') !== -1);
        });

        test('Роутинг: init-хук navigateTo для work-schedule-vacations удалён (Task 308)', () => {
            assertTrue(html.indexOf("WorkSchedule.initVacationsPage()") === -1,
                'инициализатор страницы «Отпуска» не вызывается');
            assertTrue(html.indexOf("WorkSchedule.initTrainingsPage()") === -1,
                'инициализатор страницы «Инструктажи» не вызывается');
        });

        test('Роутинг: PAGE_TITLES / PAGE_PARENTS / ROLE_ACCESS без удалённых страниц (Task 308)', () => {
            assertTrue(html.indexOf("'work-schedule-vacations':  'Отпуска'") === -1,
                'метки work-schedule-vacations нет');
            assertTrue(html.indexOf("'work-schedule-vacations':  'work-schedule'") === -1,
                'родителя work-schedule-vacations нет');
            assertTrue(html.indexOf("'work-schedule-trainings', 'work-schedule-vacations'") === -1,
                'страницы исключены из _WORK_SCHEDULE_PAGES');
        });

        test('Диалог «Сформировать»: отпуска упоминаются', () => {
            assertTrue(html.indexOf('Плановые смены, инструктажи и отпуска заполнятся автоматически.') !== -1);
        });

        test('Тост итогов года: удалённые устаревшие отпуска', () => {
            const dg = html.slice(html.indexOf('_doGenerateYear: function'),
                                  html.indexOf('onCellClick: function'));
            assertTrue(dg.indexOf('totalRemoved') !== -1, 'счётчик removed');
            assertTrue(dg.indexOf('устаревших отпусков') !== -1, 'текст тоста');
        });
    });

    describe('Task 274: SW версия v527 (история)', () => {
        const fs = require('fs');
        const path = require('path');
        const swPath = path.resolve(__dirname, '..', 'sw.js');
        const sw = fs.readFileSync(swPath, 'utf8');

        test('v527 заменена актуальной версией', () => {
            assertTrue(sw.indexOf("kipia-test-v750") !== -1,
                'Актуальная версия — kipia-test-v750');
        });
        test('Старая версия v527 убрана', () => {
            assertTrue(sw.indexOf("kipia-test-v527") === -1,
                'Старая v527 не должна остаться в sw.js (Task 278)');
        });
    });

    // ============================================================
    // Task 278: выбор периода в диалоге «Сформировать» —
    // «Текущий месяц» или «Весь год». kipConfirm расширен опцией
    // altText (третья кнопка → резолв 'alt'); _doGenerateMonth —
    // один вызов generateMonth для выбранного месяца.
    // ============================================================
    describe('Task 278: выбор «месяц или год» в диалоге «Сформировать»', () => {
        const fs = require('fs');
        const path = require('path');
        const vm = require('vm');
        const html = fs.readFileSync(
            path.resolve(__dirname, '..', 'index.html'), 'utf8');

        // ---- Песочница с функциями диалога (как Task 265, +alt) ----
        function extractFn(src, name) {
            const start = src.indexOf('function ' + name + '(');
            if (start === -1) return null;
            const braceStart = src.indexOf('{', start);
            let depth = 0;
            for (let i = braceStart; i < src.length; i++) {
                if (src[i] === '{') depth++;
                else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
            }
            return null;
        }
        const dialogSrc = ['_kipDialogOverlay', '_kipDialogClose', '_kipDialogEsc', 'kipConfirm']
            .map(n => extractFn(html, n)).join('\n');
        if (!dialogSrc || dialogSrc.length < 100) {
            throw new Error('Task 278: функции диалога не извлеклись');
        }

        function makeAltSandbox() {
            const buttons = {
                cancel: { className: 'kip-dialog-btn kip-dialog-cancel', textContent: '', onclick: null,
                          closest: function () { return this; } },
                alt:     { className: 'kip-dialog-btn kip-dialog-alt', textContent: '', onclick: null,
                          closest: function () { return this; } },
                ok:      { className: 'kip-dialog-btn kip-dialog-ok', textContent: '', onclick: null,
                           closest: function () { return this; } }
            };
            const overlay = {
                id: '', className: '',
                _html: '',
                set innerHTML(v) { this._html = String(v || ''); },
                get innerHTML() { return this._html; },
                classList: (() => {
                    const set = new Set();
                    return { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c) };
                })(),
                querySelector: sel =>
                    sel === '.kip-dialog-cancel' ? buttons.cancel :
                    sel === '.kip-dialog-alt' ? buttons.alt :
                    sel === '.kip-dialog-ok' ? buttons.ok : null
            };
            const listeners = {};
            const documentMock = {
                getElementById: id => (id === 'kipDialogOverlay' ? overlay : null),
                createElement: () => overlay,
                body: { appendChild: () => {} },
                addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
                removeEventListener: (type, fn) => {
                    const arr = listeners[type] || [];
                    const i = arr.indexOf(fn);
                    if (i !== -1) arr.splice(i, 1);
                }
            };
            const sandbox = {
                document: documentMock,
                requestAnimationFrame: fn => { fn(); return 0; },
                setTimeout: () => 0,
                clearTimeout: () => {},
                Promise
            };
            vm.createContext(sandbox);
            vm.runInContext(dialogSrc, sandbox);
            return { sandbox, overlay, buttons, listeners };
        }
        const fireKey = (sb, key, target) => {
            (sb.listeners.keydown || []).forEach(fn => fn({ key, target: target || null }));
        };

        test('kipConfirm: altText — третья кнопка, клик → ' + "'alt'", async () => {
            const sb = makeAltSandbox();
            const p = sb.sandbox.kipConfirm('Вопрос?', { okText: 'Весь год', altText: 'Текущий месяц' });
            await Promise.resolve();
            assertTrue(sb.overlay.innerHTML.indexOf('>Текущий месяц<') !== -1,
                'альт-кнопка с текстом altText');
            assertTrue(sb.overlay.innerHTML.indexOf('kip-dialog-alt') !== -1,
                'класс kip-dialog-alt');
            assertTrue(sb.overlay.innerHTML.indexOf('with-alt') !== -1,
                'ряд кнопок помечен with-alt (компактные отступы)');
            sb.buttons.alt.onclick();
            assertEqual(await p, 'alt', 'клик по альт-кнопке → ' + "'alt'");
        });

        test('kipConfirm: без altText — две кнопки, с altText — три', () => {
            const sb = makeAltSandbox();
            sb.sandbox.kipConfirm('Обычный вопрос?');
            const plain = (sb.overlay.innerHTML.match(/kip-dialog-btn kip-/g) || []).length;
            assertEqual(plain, 2, 'без altText — 2 кнопки (обратная совместимость)');
            assertFalse(sb.overlay.innerHTML.indexOf('with-alt') !== -1,
                'без altText ряд НЕ помечен with-alt');
            sb.sandbox.kipConfirm('С выбором?', { okText: 'A', altText: 'B' });
            const three = (sb.overlay.innerHTML.match(/kip-dialog-btn kip-/g) || []).length;
            assertEqual(three, 3, 'с altText — 3 кнопки');
        });

        test('kipConfirm: Escape → false, Enter → true (primary OK)', async () => {
            const sb = makeAltSandbox();
            const p = sb.sandbox.kipConfirm('Вопрос?', { okText: 'Весь год', altText: 'Текущий месяц' });
            await Promise.resolve();
            fireKey(sb, 'Escape');
            assertEqual(await p, false, 'Escape — отмена (не ' + "'alt')");
        });

        test('kipConfirm: Enter при фокусе НЕ на кнопке — primary OK (год)', async () => {
            const sb = makeAltSandbox();
            const p = sb.sandbox.kipConfirm('Вопрос?', { okText: 'Весь год', altText: 'Текущий месяц' });
            await Promise.resolve();
            fireKey(sb, 'Enter');
            assertEqual(await p, true, 'Enter — основная кнопка (Весь год)');
        });

        test('JS: generateYear — ветка sel === ' + "'alt'" + ' ведёт в _doGenerateMonth', () => {
            const gen = html.slice(html.indexOf('generateYear: function'),
                                   html.indexOf('_doGenerateMonth: function'));
            assertTrue(gen.indexOf("if (sel === 'alt')") !== -1,
                'ветка выбора месяца');
            assertTrue(gen.indexOf('self._doGenerateMonth()') !== -1,
                'вызов генерации одного месяца');
            assertTrue(gen.indexOf('self._doGenerateYear()') !== -1,
                'вызов генерации года (sel === true)');
        });

        test('JS: _doGenerateMonth — один вызов generateMonth для выбранного месяца', () => {
            const gm = html.slice(html.indexOf('_doGenerateMonth: function'),
                                  html.indexOf('_doGenerateYear: function'));
            assertTrue(gm.indexOf("{ year: this._year, month: this._month }") !== -1,
                'вызов с ВЫБРАННЫМ месяцем (не цикл 1..12)');
            assertFalse(gm.indexOf('nextMonth') !== -1,
                'нет цикла по 12 месяцам');
            assertTrue(gm.indexOf("'Формируется…'") !== -1,
                'кнопка занята на время генерации');
            assertTrue(gm.indexOf('сформировано') !== -1 &&
                       gm.indexOf('обновлено') !== -1,
                'тост с итогами месяца');
            assertTrue(gm.indexOf('устаревших отпусков') !== -1,
                'тост учитывает removed (Task 274)');
            // Task 314: loadGrid(true) — после генерации только сеть
            assertTrue(gm.indexOf('self.loadGrid(true)') !== -1,
                'перезагрузка сетки после генерации');
        });

        test('JS: тост ошибки месяца — с названием месяца', () => {
            const gm = html.slice(html.indexOf('_doGenerateMonth: function'),
                                  html.indexOf('_doGenerateYear: function'));
            assertTrue(gm.indexOf("'Ошибка (' + monthName + ' ' + self._year + ')") !== -1,
                'тост ошибки с месяцем и годом');
        });

        test('CSS: alt-кнопка и перенос ряда (тёмная + светлая)', () => {
            assertTrue(html.indexOf('.kip-dialog-alt {') !== -1,
                'стили .kip-dialog-alt');
            assertTrue(html.indexOf('[data-theme="light"] .kip-dialog-alt') !== -1,
                'светлая тема alt-кнопки');
            const btns = html.slice(html.indexOf('.kip-dialog-btns {'),
                                    html.indexOf('.kip-dialog-btn {'));
            assertTrue(btns.indexOf('flex-wrap: wrap') !== -1,
                'ряд кнопок переносится (3 кнопки на мобильном)');
            assertTrue(html.indexOf('.kip-dialog-btns.with-alt .kip-dialog-btn') !== -1,
                'компактные отступы при трёх кнопках');
            assertTrue(html.indexOf('.kip-dialog.with-alt { max-width: 360px; }') !== -1,
                'диалог с тремя кнопками шире (одна строка на десктопе)');
        });
    });
});

// ============================================================
// Task 298 — новый состав кодов статусов (Т-12/Т-13) — клиент
// ============================================================
describe('Task 298 — коды статусов Т-12/Т-13: клиентские инварианты', () => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const gs = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');

    test('JS: fallback-набор (канон Task 387) = 16 новых кодов', () => {
        // все новые коды должны быть в каноне _STATUS_CODES_CANON
        // (офлайн/старый сервер); Task 387: «Выходной» — ПУСТОЙ код
        // (точка «·» убрана заявкой: выходной = пустая ячейка)
        const codes = ['Д8', 'Д7,2', 'д', 'н', 'ОТ', 'У', 'ОВ', 'ПР'];
        codes.forEach(c => {
            assertTrue(html.indexOf("{code:'" + c + "'") !== -1,
                'канон содержит код «' + c + '»');
        });
        assertTrue(html.indexOf("{code:'',     short:'выходной', name:'Выходной, плановый выходной день', color:'#EEF0F2'}") !== -1,
            'канон: «Выходной» — пустой код (точка убрана, Task 387)');
    });

    test('JS: в fallback НЕТ старых кодов «О» (отпуск) и «П» (прогул)', () => {
        // точный матч {code:'О'} / {code:'П'} — не подстрока «ОТ»/«ПЗ»/«ПР»
        assertFalse(html.indexOf("{code:'О',") !== -1, 'старого кода «О» нет');
        assertFalse(html.indexOf("{code:'П',") !== -1, 'старого кода «П» нет');
    });

    test('JS: _fillStatusSelect определён и вызывается при загрузке кодов', () => {
        assertTrue(html.indexOf('_fillStatusSelect: function') !== -1,
            'метод _fillStatusSelect существует');
        const lsc = html.slice(html.indexOf('_loadStatusCodes: function'),
                               html.indexOf('_loadPatterns: function'));
        assertTrue(lsc.indexOf('self._fillStatusSelect()') !== -1,
            'вызов при успехе загрузки');
        // fallback-ветка тоже заполняет select
        assertTrue((lsc.match(/self\._fillStatusSelect\(\)/g) || []).length >= 2,
            'вызов и в fallback (catch)');
    });

    test('HTML: статический select статусов больше НЕ содержит захардкоженных кодов', () => {
        const sel = html.slice(html.indexOf('id="wsCellStatus"'),
                               html.indexOf('id="wsCellOvertime"'));
        assertTrue(sel.indexOf('<option value="Д">') === -1,
            'старой статической опции «Д» нет');
        assertTrue(sel.indexOf('<option value="О">') === -1,
            'старой статической опции «О» нет');
        assertTrue(sel.indexOf('<option value="">— выходной —</option>') !== -1,
            'заглушка «— выходной —» осталась (до загрузки кодов)');
    });

    test('JS: openCellForm строит опции из справочника с сохранением value', () => {
        const ocf = html.slice(html.indexOf('openCellForm: function'),
                               html.indexOf('closeCellForm: function'));
        assertTrue(ocf.indexOf('this._fillStatusSelect(curStatus)') !== -1,
            'опции строятся при каждом открытии шита');
        const fss = html.slice(html.indexOf('_fillStatusSelect: function'),
                                html.indexOf('generateYear: function'));
        assertTrue(fss.indexOf('(нет в справочнике)') !== -1,
            'легаси-код добавляется временной опцией');
    });

    test('JS: Task 311 — тултип плана отпуска убран (вся информация — в попапе клика)', () => {
        // Task 311: пояснительные тултипы с ячеек шахматки убраны;
        // код плана «ОТ» остаётся в ячейке (класс ws-vac-plan + рамка)
        assertFalse(html.indexOf("заполнится кодом «ОТ» при «Сформировать»") !== -1,
            'подсказка «заполнится кодом…» из тултипа удалена (Task 311)');
        assertFalse(html.indexOf("заполнится кодом «О» при") !== -1,
            'старого текста с «О» нет');
    });

    test('GS: _validateStatusCode определён и вызывается из setManualEntry', () => {
        assertTrue(gs.indexOf('_validateStatusCode: function') !== -1,
            'функция валидации существует');
        const sme = gs.slice(gs.indexOf('setManualEntry: function'),
                             gs.indexOf('deleteEntry: function'));
        assertTrue(sme.indexOf('this._validateStatusCode(status)') !== -1,
            'setManualEntry валидирует статус');
        assertTrue(sme.indexOf("error: 'unknown_статус'") === -1,
            'текст ошибки строится в _validateStatusCode (не захардкожен)');
    });

    test('GS: генерация отпусков пишет «ОТ» — grep-инварианты', () => {
        assertTrue(gs.indexOf("status: 'ОТ'") !== -1, "toUpdate: status: 'ОТ'");
        assertTrue(gs.indexOf("статус: 'ОТ'") !== -1, 'entryIndex: статус: «ОТ»');
        assertTrue(gs.indexOf("rv[2] = 'ОТ'") !== -1, 'toInsert: rv[2] = «ОТ»');
        // старых одиночных «О» в коде генерации быть не должно
        const gm = gs.slice(gs.indexOf('generateMonth: function'),
                            gs.indexOf('Сводка_по_месяцам:'));
        assertFalse(gm.indexOf("'О'") !== -1, 'в generateMonth не осталось литералов «О»');
    });

    test('GS: комментарий структуры листа кодов обновлён (16 кодов)', () => {
        assertTrue(gs.indexOf('Д/Д8/Д7,2/Н/д/н/ОТ/У/ОВ/Б/ПР/И/ОБ/ПЗ*/.)'.replace('*/', '/*/')) !== -1,
            'перечень кодов в комментарии структуры листа');
        assertTrue(gs.indexOf('легенда кодов (16 шт., Task 298)') !== -1,
            'счётчик 16 в заголовке эндпоинтов');
    });

    test('SW: кэш поднят до kipia-test-v750 (Task 298)', () => {
        const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
        assertTrue(sw.indexOf("CACHE_VERSION = 'kipia-test-v750'") !== -1,
            'CACHE_VERSION = kipia-test-v750');
        assertFalse(sw.indexOf("CACHE_VERSION = 'kipia-test-v539'") !== -1,
            'старой версии v539 нет');
    });
});

// ============================================================
// Task 307 — вкладка «Сотрудники» удалена; «+ Сотрудник» в тулбаре
// ============================================================
// По заявке пользователя: в разделе «График работы» убрать вкладку
// «Сотрудники», а кнопку «Добавить сотрудника» переместить в бар над
// шахматкой к остальным кнопкам. Страница #page-work-schedule-employees
// удалена целиком; добавление — прежний bottom-sheet #wsEmpSheet
// (openEmployeeForm), после добавления перезагружается шахматка.
// ============================================================
describe('Task 307 — вкладка «Сотрудники» удалена, кнопка «+ Сотрудник» в тулбаре', () => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
    const sw = fs.readFileSync(path.resolve(__dirname, '..', 'sw.js'), 'utf8');

    test('HTML: страницы «Сотрудники» нет — див удалён', () => {
        assertTrue(html.indexOf('id="page-work-schedule-employees"') === -1,
            'див #page-work-schedule-employees удалён');
        assertTrue(html.indexOf('id="wsEmployeesList"') === -1 &&
                   html.indexOf('id="wsEmployeesEmpty"') === -1 &&
                   html.indexOf('id="wsAddEmployeeBar"') === -1,
            'внутренности страницы (список/заглушка/бар добавления) удалены');
    });

    test('HTML: субнавигация без «Сотрудники» (Task 307); с Task 308 — полосы нет', () => {
        assertTrue((html.match(/ws-subnav-btn[^>]*>Сотрудники</g) || []).length === 0,
            'кнопки «Сотрудники» нет ни на одной полосе');
        // Task 308: вкладки «Инструктажи»/«Отпуска» убраны — субнавигация
        // удалена ЦЕЛИКОМ (модуль одностраничный: только шахматка)
        assertEqual((html.match(/class="ws-subnav"/g) || []).length, 0,
            '0 полос ws-subnav (Task 308: одностраничный модуль)');
    });

    test('HTML: Task 311 — кнопка «+ Сотрудник» УДАЛЕНА; заголовок — надпись', () => {
        // Task 311: кнопка из тулбара удалена; Task 385: заголовок
        // вёл на СТРАНИЦУ «Работники»; Task 386 (заявка): заголовок
        // «Работники» — ПРОСТО надпись, без функции кнопки — переход
        // выполняет только кнопка «Работники» в баре (ряд 1)
        assertTrue(html.indexOf('id="wsEmpBtn"') === -1,
            'кнопка #wsEmpBtn удалена из тулбара');
        // рендер шапки: заголовок — надпись (Task 386)
        const grid = html.slice(html.indexOf('_renderGrid: function'),
                                html.indexOf('_fitGrid: function'));
        assertTrue(grid.indexOf('data-full="Работники" data-s4="Рабо">Работники</span>') !== -1,
            'заголовок «Работники» (Task 386)');
        assertTrue(grid.indexOf("this._canEdit ? ' ws-emp-head-add' : ''") === -1,
            'класс кнопки у заголовка снят (Task 386)');
        assertTrue(grid.indexOf('onclick="WorkSchedule.openWorkersPage()"') === -1,
            'клика у заголовка нет — переход только кнопкой в баре');
        assertTrue(grid.indexOf('<i class="ws-emp-head-plus">') === -1,
            'плюсик-индикатор удалён (Task 386)');
    });

    test('JS: Task 311 — init() не трогает wsEmpBtn; видимость решает _renderGrid', () => {
        const init = html.slice(html.indexOf("var genBtn = document.getElementById('wsGenerateBtn');"),
                                html.indexOf('this._attachFitResize()'));
        assertFalse(init.indexOf("getElementById('wsEmpBtn')") !== -1,
            'init() больше не ищет кнопку (кнопки нет)');
        // Task 312: «+ Отпуск» из тулбара убрана — init() её больше не
        // ищет; видимость строки «+ Отпуск…» решает _renderEmpPopup
        assertFalse(init.indexOf("getElementById('wsVacBtn')") !== -1,
            'Task 312: init() больше не ищет wsVacBtn (кнопки в тулбаре нет)');
    });

    test('JS: initEmployeesPage/loadEmployees/_renderEmployees удалены', () => {
        // комментарии-памятки Task 307 упоминают имена — проверяем ФОРМЫ функций
        assertTrue(html.indexOf('initEmployeesPage: function') === -1,
            'метод initEmployeesPage: function удалён');
        // \b: '_loadEmployees: function' жив, а 'loadEmployees: function' (метод
        // страницы) — удалён: граница слова не матчится внутри _loadEmployees
        assertFalse(/\bloadEmployees:\s*function/.test(html),
            'loadEmployees: function удалён (_loadEmployees-загрузчик данных жив)');
        assertTrue(html.indexOf('_renderEmployees: function') === -1,
            '_renderEmployees: function удалён');
        assertTrue(html.indexOf('_loadEmployees: function') !== -1,
            '_loadEmployees жив — нужен шахматке/инструктажам/отпускам');
    });

    test('JS: submitEmployeeForm перезагружает шахматку (loadGrid)', () => {
        const i = html.indexOf('submitEmployeeForm: function');
        assertTrue(i !== -1, 'submitEmployeeForm: function найден');
        // Task 384: окно расширено — ветка правки updateEmployee
        // вставлена ДО addEmployee, loadGrid(true) уехал дальше
        const block = html.slice(i, i + 4200);
        // Task 314: loadGrid(true) — свежие данные с сервера
        assertTrue(block.indexOf('self.loadGrid(true);') !== -1,
            'после добавления — loadGrid(true) (новая строка сотрудника в сетке)');
        assertTrue(block.indexOf('self.loadEmployees();') === -1,
            'прежний вызов loadEmployees() удалён');
    });

    test('JS: хук navigateTo и карты страниц/крошек без сотрудников', () => {
        assertTrue(html.indexOf("page === 'work-schedule-employees'") === -1,
            'хук navigateTo удалён');
        assertTrue(html.indexOf("'work-schedule-employees'") === -1,
            'идентификатора work-schedule-employees нет ни в PAGE_PARENTS, ни в PAGE_LABELS, ни в _WORK_SCHEDULE_PAGES');
        const m = html.match(/_WORK_SCHEDULE_PAGES:\s*\[([^\]]+)\]/);
        assertTrue(!!m, '_WORK_SCHEDULE_PAGES найден');
        assertTrue(m[1].indexOf('work-schedule-employees') === -1,
            'страница сотрудников исключена из карты ролей');
        // Task 308: страницы trainings/vacations тоже исключены
        assertTrue(m[1].indexOf('work-schedule-trainings') === -1 &&
                   m[1].indexOf('work-schedule-vacations') === -1,
            'инструктажи и отпуска исключены (Task 308)');
        // Task 334: + мобильная страница итогов учёта (те же права);
        // Task 385: + страница «Работники» (полные карточки)
        assertEqual(m[1].trim(), "'work-schedule', 'ws-totals', 'ws-workers', 'ws-legend', 'ws-talons'",
            'в карте ролей модуля — шахматка, итоги (Task 334), «Работники» (Task 385), «Обозначения» (Task 386), «Талоны» (Task 447)');
    });

    test('HTML: bottom-sheet формы работника жив (без изменений)', () => {
        // Task 489-adapt: wsEmpFio → wsEmpFam/wsEmpName/wsEmpPatr (+wsEmpBirth)
        ['wsEmpOverlay', 'wsEmpSheet', 'wsEmpTabNo', 'wsEmpFam', 'wsEmpName', 'wsEmpPatr', 'wsEmpBirth', 'wsEmpType',
         'wsEmpPattern', 'wsEmpStart', 'wsEmpPosition', 'wsEmpComment'].forEach(id => {
            assertTrue(html.indexOf('id="' + id + '"') !== -1, 'id="' + id + '" жив');
        });
    });

    test('CSS: Task 311/312 — .ws-addemp-btn и .ws-addvac-btn удалены', () => {
        // Task 311: кнопка «+ Сотрудник» удалена; Task 312: из тулбара
        // удалена и «+ Отпуск» — оба мёртвых правила убраны из CSS
        assertFalse(html.indexOf('.ws-addemp-btn') !== -1,
            'стиль «+ Сотрудник» не остался (Task 311)');
        assertFalse(html.indexOf('.ws-addvac-btn') !== -1,
            'Task 312: стиль «+ Отпуск» удалён вместе с кнопкой');
        assertFalse(/\[data-theme="light"\] \.ws-addvac-btn/.test(html),
            'Task 312: светлая тема «+ Отпуск» тоже удалена');
    });

    test('CSS: перенос ряда тулбара разрешён (flex-wrap) — кнопка не ломает мобильный', () => {
        // Task 317: ряд 1 (селекты + «Обновить») — .ws-toolbar-row,
        // на узких экранах аккуратно складывается (десктоп — nowrap
        // в media: высота ряда фиксирована)
        const re = /\.ws-toolbar-row[\s\S]{0,200}flex-wrap:\s*wrap;/;
        assertTrue(re.test(html),
            'на узких экранах ряд 1 аккуратно складывается (wrap у .ws-toolbar-row)');
    });

    test('CSS: мёртвые стили страницы сотрудников удалены', () => {
        ['.ws-emp-card-header {', '.ws-employees-list,'].forEach(sel => {
            assertTrue(html.indexOf(sel) === -1, 'селектор ' + sel + ' удалён');
        });
        assertTrue(html.indexOf('.ws-emp-card {') === -1 &&
                   html.indexOf('.ws-emp-card,') === -1 &&
                   html.indexOf('.ws-emp-card .') === -1,
            'scoped-правила .ws-emp-card* удалены (комментарии-памятки не в счёт)');
        // Task 308: страницы инструктажей/отпусков удалены — их нижние
        // плавающие бары кнопок стали мёртвыми и тоже удалены
        assertTrue(html.indexOf('.ws-add-bar {') === -1 && html.indexOf('.ws-add-btn {') === -1,
            '.ws-add-bar/.ws-add-btn удалены (Task 308: страницы больше нет)');
    });

    test('SW: кэш поднят до kipia-test-v750 (Task 309; история: v547 — Task 308)', () => {
        assertTrue(sw.indexOf("CACHE_VERSION = 'kipia-test-v750'") !== -1,
            'CACHE_VERSION = kipia-test-v750');
    });
});


// ============================================================
// Task 308 — вкладки «Инструктажи» и «Отпуска» удалены,
//            кнопка «+ Отпуск» в тулбаре над шахматкой
// ============================================================
// По заявке пользователя: «Убери вкладки "Инструктажи" и "Отпуска",
// а кнопку "Добавить отпуск" перемести в бар над шахматкой к остальным
// кнопкам». Страницы #page-work-schedule-trainings и
// #page-work-schedule-vacations удалены целиком (модуль стал
// одностраничным — как «Сотрудники» в Task 307); субнавигация
// удалена ЦЕЛИКОМ. Добавление отпуска — кнопка «+ Отпуск»
// (#wsVacBtn, ws-toolbar-main) → прежний bottom-sheet #wsVacSheet
// (openVacationForm); после добавления перезагружается ШАХМАТКА
// (loadGrid — план «ОТ» подтягивается в пустые ячейки). Добавление
// мероприятия — «+ Мероприятие…» в попапе ячейки (Task 303, шторка
// #wsTrSheet). Год плана отпусков — год шахматки: _loadVacations
// заполняет и _VACATIONS (сетка), и _VAC_PAGE (шторка: номер
// свободной части + проверка пересечений).
// ============================================================
describe('Task 308 — вкладки «Инструктажи»/«Отпуска» удалены, кнопка «+ Отпуск» в тулбаре', () => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
    const sw = fs.readFileSync(path.resolve(__dirname, '..', 'sw.js'), 'utf8');

    test('HTML: страницы «Инструктажи» и «Отпуска» нет — дивы удалены', () => {
        assertTrue(html.indexOf('id="page-work-schedule-trainings"') === -1,
            'див #page-work-schedule-trainings удалён');
        assertTrue(html.indexOf('id="page-work-schedule-vacations"') === -1,
            'див #page-work-schedule-vacations удалён');
        // внутренности обеих страниц
        ['wsTrainingsList', 'wsTrainingsEmpty', 'wsAddTrainingBar',
         'wsVacYearSel', 'wsVacSummary', 'wsVacationsList', 'wsVacationsEmpty',
         'wsAddVacationBar'].forEach(id => {
            assertTrue(html.indexOf('id="' + id + '"') === -1,
                'id="' + id + '" удалён (список/заглушка/бар/селект года/сводка)');
        });
    });

    test('HTML: субнавигации НЕТ — 0 полос, 0 кнопок', () => {
        assertEqual((html.match(/class="ws-subnav"/g) || []).length, 0,
            'полос ws-subnav нет — модуль одностраничный (только шахматка)');
        // строго по class-атрибутам (комментарии CSS — мемориальные — не в счёт)
        assertEqual((html.match(/class="ws-subnav-btn[^"]*"/g) || []).length, 0,
            'кнопок ws-subnav-btn в разметке нет');
        ['Шахматка', 'Инструктажи', 'Отпуска', 'Сотрудники'].forEach(label => {
            assertEqual((html.match(new RegExp('ws-subnav-btn[^>]*>' + label + '<', 'g')) || []).length, 0,
                'кнопки «' + label + '» в субнавигации нет');
        });
    });

    test('HTML: Task 312 — кнопка «+ Отпуск» УДАЛЕНА из тулбара', () => {
        // Task 308 приносил кнопку в тулбар (после удаления страницы
        // «Отпуска»); Task 312 убрал её — функционал переехал строкой
        // «+ Отпуск…» в блок отпусков карточки сотрудника
        assertTrue(html.indexOf('id="wsVacBtn"') === -1,
            'Task 312: кнопки #wsVacBtn в тулбаре больше нет');
        // бар над шахматкой жив: селекты + «Сформировать» + «Сохранить»
        const ws = html.slice(html.indexOf('id="page-work-schedule"'),
                              html.indexOf('id="wsGridWrap"'));
        assertTrue(ws.indexOf('ws-toolbar-main') !== -1 &&
                   ws.indexOf('id="wsGenerateBtn"') !== -1 &&
                   ws.indexOf('id="wsSaveBtn"') !== -1,
            'бар жив: селекты, «Сформировать», «Сохранить»');
        // шторка «Новый отпуск» (bottom-sheet) жива без изменений
        assertTrue(html.indexOf('id="wsVacSheet"') !== -1 &&
                   html.indexOf('id="wsVacTabNo"') !== -1,
            'bottom-sheet #wsVacSheet жив (открывается из карточки)');
    });

    test('JS: Task 312 — видимость «+ Отпуск…» решает _renderEmpPopup, не init()', () => {
        const init = html.slice(html.indexOf("var genBtn = document.getElementById('wsGenerateBtn');"),
                                html.indexOf('this._attachFitResize()'));
        assertFalse(init.indexOf("getElementById('wsVacBtn')") !== -1,
            'init() больше не управляет кнопкой (кнопки нет)');
        // рендер карточки: строка «+ Отпуск…» — только редакторам
        const empFn = html.slice(html.indexOf('_renderEmpPopup: function'),
                                 html.indexOf('_serverEntry: function'));
        assertTrue(empFn.indexOf("WorkSchedule.onEmpAddVacation(\\'") !== -1,
            'клик строки → onEmpAddVacation(таб. №)');
        assertTrue(empFn.indexOf('ws-emp-addvac') !== -1,
            'класс-маркер строки ws-emp-addvac');
        assertTrue(empFn.indexOf('+ Отпуск…</div>') !== -1,
            'текст строки «+ Отпуск…»');
        // префилл: onEmpAddVacation закрывает карточку и зовёт форму
        const addFn = html.slice(html.indexOf('onEmpAddVacation: function'),
                                 html.indexOf('// Task 312: tabNo'));
        assertTrue(addFn.indexOf('this.closeEmpPopup();') !== -1 &&
                   addFn.indexOf('this.openVacationForm(tabNo);') !== -1,
            'onEmpAddVacation: закрыть карточку → открыть форму с префиллом');
        const openFn = html.slice(html.indexOf('openVacationForm: function'),
                                  html.indexOf('closeVacationForm: function'));
        // Task 384: 2-й аргумент editVacation — режим правки периода
        assertTrue(openFn.indexOf('openVacationForm: function(tabNo, editVacation)') !== -1 &&
                   openFn.indexOf('empSel.value = String(tabNo);') !== -1,
            'openVacationForm(tabNo, editVacation) выбирает сотрудника в списке');
    });

    test('JS: страничные методы удалены, загрузчики живы', () => {
        // страничные (рендер списков/сводки/селект года) — удалены;
        //  отсекает _loadTrainings/_loadVacations (живые загрузчики сетки)
        ['initTrainingsPage: function', 'initVacationsPage: function',
         '_renderTrainings: function', '_renderVacations: function',
         'onVacYearChange: function'].forEach(fn => {
            assertTrue(html.indexOf(fn) === -1, fn + ' удалён');
        });
        assertFalse(/\bloadTrainings:\s*function/.test(html),
            'loadTrainings: function удалён (_loadTrainings жив)');
        assertFalse(/\bloadVacations:\s*function/.test(html),
            'loadVacations: function удалён (_loadVacations жив)');
        // загрузчики данных — живы (Promise.all в loadGrid)
        ['_loadTrainings: function', '_loadVacations: function',
         '_loadEmployees: function'].forEach(fn => {
            assertTrue(html.indexOf(fn) !== -1, fn + ' жив');
        });
        // API-методы удаления — живы (серверные эндпоинты не менялись)
        ['deleteTraining: function', 'deleteVacation: function',
         '_doDeleteVacation: function'].forEach(fn => {
            assertTrue(html.indexOf(fn) !== -1, fn + ' жив');
        });
    });

    test('JS: _loadVacations заполняет _VAC_PAGE/_vacYear для шторки «+ Отпуск»', () => {
        const lv = html.slice(html.indexOf('_loadVacations: function'),
                              html.indexOf('loadGrid: function'));
        assertTrue(lv.indexOf('self._VAC_PAGE = self._VACATIONS;') !== -1,
            'тот же список питает шторку (номер свободной части)');
        assertTrue(lv.indexOf('self._vacYear = self._year;') !== -1,
            'год плана = год шахматки (селект года удалён вместе со страницей)');
        assertTrue(lv.indexOf('catch') !== -1,
            'сбой загрузки отпусков не ломает сетку (собственный catch)');
        const lg = html.slice(html.indexOf('loadGrid: function'),
                              html.indexOf('_ensureCal: function'));
        // Task 476: сетевой путь вложен в .then(idbTry) — self.
        assertTrue(lg.indexOf('self._loadVacations()') !== -1,
            'план отпусков грузится вместе с сеткой (как до Task 308)');
    });

    test('JS: submitVacationForm перезагружает шахматку (loadGrid)', () => {
        const i = html.indexOf('submitVacationForm: function');
        assertTrue(i !== -1, 'submitVacationForm: function найден');
        // Task 310: перед _api добавлена проверка годового лимита
        // 42 дн. (праздники ст. 112 вычитаются, ст. 120 ТК РФ) — метод
        // вырос (~4.2 тыс. знаков), окно поиска расширено
        const block = html.slice(i, i + 4600);
        // Task 314: loadGrid(true) — свежие данные с сервера
        assertTrue(block.indexOf('self.loadGrid(true);') !== -1,
            'после добавления — loadGrid(true) (план «ОТ» в пустых ячейках)');
        assertTrue(block.indexOf('self.loadVacations();') === -1,
            'прежний вызов loadVacations() удалён (страницы нет)');
        assertTrue(block.indexOf('Нажмите «Сформировать» в шахматке') !== -1,
            'тост напоминает про расстановку «О»');
    });

    test('JS: мероприятия — вход через попап ячейки (Task 303 жив)', () => {
        const i = html.indexOf('openTrainingForm: function');
        assertTrue(i !== -1, 'openTrainingForm: function жив');
        const iPop = html.indexOf('onPopupAddEvent: function');
        assertTrue(iPop !== -1, 'onPopupAddEvent: function жив');
        const pop = html.slice(iPop, html.indexOf('_serverEntry: function'));
        assertTrue(pop.indexOf("this.openTrainingForm(tabNo, date, null, 'обучение');") !== -1,
            '«+ Мероприятие…» попапа открывает шторку с префиллом (Task 410: дефолт «обучение»)');
        assertTrue(html.indexOf('id="wsTrSheet"') !== -1 &&
                   html.indexOf('id="wsTrOverlay"') !== -1,
            'bottom-sheet мероприятия жив');
        assertTrue(html.indexOf("case 'workSchedule.addTraining':") !== -1 ||
                   html.indexOf('workSchedule.addTraining') !== -1,
            'эндпоинт addTraining используется');
    });

    test('JS: хук navigateTo и карты без trainings/vacations', () => {
        assertTrue(html.indexOf("page === 'work-schedule-trainings'") === -1,
            'хук work-schedule-trainings удалён');
        assertTrue(html.indexOf("page === 'work-schedule-vacations'") === -1,
            'хук work-schedule-vacations удалён');
        assertTrue(html.indexOf("'work-schedule-trainings'") === -1,
            'идентификатора work-schedule-trainings нет ни в PAGE_PARENTS, ни в PAGE_LABELS');
        assertTrue(html.indexOf("'work-schedule-vacations'") === -1,
            'идентификатора work-schedule-vacations нет ни в PAGE_PARENTS, ни в PAGE_LABELS');
        const m = html.match(/_WORK_SCHEDULE_PAGES:\s*\[([^\]]+)\]/);
        assertTrue(!!m, '_WORK_SCHEDULE_PAGES найден');
        // Task 334: + мобильная страница итогов учёта (те же права);
        // Task 385: + страница «Работники» (полные карточки)
        assertEqual(m[1].trim(), "'work-schedule', 'ws-totals', 'ws-workers', 'ws-legend', 'ws-talons'",
            'в карте ролей модуля — шахматка, итоги (Task 334), «Работники» (Task 385), «Обозначения» (Task 386), «Талоны» (Task 447)');
    });

    test('HTML: bottom-sheet «Новый отпуск» жив (без изменений)', () => {
        ['wsVacOverlay', 'wsVacSheet', 'wsVacTabNo', 'wsVacPart', 'wsVacStart',
         'wsVacEnd', 'wsVacComment', 'wsVacDaysInfo'].forEach(id => {
            assertTrue(html.indexOf('id="' + id + '"') !== -1, 'id="' + id + '" жив');
        });
        // Task 384: у заголовка появился id (режим «Правка отпуска»)
        assertTrue(html.indexOf('flow-input-sheet-title" id="wsVacSheetTitle">Новый отпуск<') !== -1,
            'заголовок формы (id wsVacSheetTitle — Task 384)');
        assertTrue((html.match(/<option value="[123]">[123] — /g) || []).length === 3,
            'части 1–3 в селекте');
    });

    test('CSS: Task 312 — .ws-addvac-btn удалён (стиль мёртв)', () => {
        // Task 312: кнопка «+ Отпуск» удалена из тулбара — правило
        // и светлая тема убраны; высота ряда Task 269 — без .ws-addvac-btn
        assertFalse(html.indexOf('.ws-addvac-btn') !== -1,
            'правило .ws-addvac-btn удалено');
        assertFalse(/\[data-theme="light"\] \.ws-addvac-btn/.test(html),
            'светлая тема «+ Отпуск» удалена');
        // Task 314: + .ws-refresh-btn («Обновить») в правиле высоты;
        // Task 324: + .ws-totals-btn/.ws-tt-tab (кнопка «Итоги учёта» и вкладки)
        const h = /\.ws-month-sel, \.ws-year-sel, \.ws-generate-btn, \.ws-save-btn,\n\s*\.ws-refresh-btn, \.ws-totals-btn, \.ws-tt-tab \{[^}]*height:\s*32px/;
        assertTrue(h.test(html), 'единая высота 32px живёт (правило Task 269/324, актуализация Task 328 — кнопки меньше)');
    });

    test('CSS: мёртвые стили удалённых страниц убраны', () => {
        ['.ws-trainings-list {', '.ws-tr-card {', '.ws-add-bar {', '.ws-add-btn {',
         '.ws-subnav {', '.ws-subnav-btn {', '.ws-vac-toolbar {', '.ws-vac-summary {',
         '.ws-vac-badge {', '.ws-vac-card .ws-vac-part {'].forEach(sel => {
            assertTrue(html.indexOf(sel) === -1, 'селектор ' + sel + ' удалён');
        });
        // цветные плашки типов мероприятий — были только на странице
        assertTrue(html.indexOf('.ws-tr-type.ws-type-ПР') === -1 &&
                   html.indexOf('.ws-tr-type.ws-type-И') === -1,
            'правила .ws-tr-type* удалены (цвета ПР/* остаются в справочнике кодов)');
        // живое: строка дней и подсказка в шторке «Новый отпуск»
        assertTrue(html.indexOf('.ws-vac-form-info {') !== -1 &&
                   html.indexOf('.ws-vac-form-hint {') !== -1,
            '.ws-vac-form-info/.ws-vac-form-hint живы (шторка #wsVacSheet)');
        assertTrue(html.indexOf('[data-theme="light"] .ws-vac-form-info {') !== -1,
            'светлая тема строки дней жива');
    });

    test('SW: кэш поднят до kipia-test-v750 (Task 308)', () => {
        assertTrue(sw.indexOf("CACHE_VERSION = 'kipia-test-v750'") !== -1,
            'CACHE_VERSION = kipia-test-v750');
        assertTrue(sw.indexOf("CACHE_VERSION = 'kipia-test-v546'") === -1,
            'старой версии v546 нет');
    });
});

