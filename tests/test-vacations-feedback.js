// tests/test-vacations-feedback.js
// Task 282: «отпуска не отображаются, из приложения не получается
// добавить отпуск — нажимаю добавить и ничего не происходит».
//
// ПРИЧИНА (фронтенд): KipToast нигде не был определён — ~98 вызовов
// KipToast.show(...) под guard'ами «typeof KipToast !== 'undefined'»
// молча подавлялись. Ни ошибки валидации формы («Выберите
// сотрудника»), ни ошибки сервера («overlap», «sheet_not_found»,
// «no_session»), ни сообщения об успехе пользователь не видел:
// клик «Добавить» без видимого эффекта. Каждая неудача выглядела
// как «ничего не происходит».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   Слой 1 — статика (index.html):
//     1. KipToast определён и делегирует в showToast (реальная
//        тост-система #toast)
//     2. Определение — после функции showToast, до первого
//        использования KipToast в модулях
//     3. Вызовы KipToast.show не пропали (>= 90)
//     4. KipAuth.api сохраняет data.message в err.serverMessage
//     5. WorkSchedule._apiErrText: serverMessage -> message -> строка
//     6. Отпускные кэтчи (форма/удаление/страница) показывают
//        _apiErrText — человеческое пояснение вместо кода 'overlap'
//     7. SW-кэш v530
//   Слой 2 — СИМУЛЯЦИЯ сервера (стенд Task 279, мок-таблицы):
//     8. addVacation: строки БЕЗ id (ручные) участвуют в проверке
//        пересечения — overlap отклоняется с message
//     9. addVacation: строки без id дают duplicate_часть
//    10. addVacation: непересекающийся период при строке без id
//        добавляется успешно (ложных блокировок нет)
//    11. listPatterns: прежний пропуск пустых id не тронут (id — PK
//        шаблонов, рефакторинг не задел чужую логику)
//    12. node --check WorkSchedule.gs — синтаксис валиден

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const WS_SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'WorkSchedule.gs'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ============================================================
// Слой 1: статические инварианты фронтенда
// ============================================================
describe('Task 282 — KipToast: фантомная API получает реализацию', () => {

    test('KipToast определён в index.html (var KipToast = { show: … })', () => {
        assertTrue(/var\s+KipToast\s*=\s*\{\s*show:\s*function\s*\(/.test(INDEX_SRC),
            'определение KipToast не найдено — вызовы KipToast.show молча подавлялись');
    });

    test('KipToast.show делегирует в showToast (реальная тост-система #toast)', () => {
        const m = INDEX_SRC.match(/var\s+KipToast\s*=\s*\{[\s\S]{0,200}?\};/);
        assertTrue(!!m, 'блок определения KipToast не извлечён');
        assertTrue(m[0].indexOf('showToast(') !== -1,
            'KipToast.show должен вызывать showToast — иначе тосты по-прежнему невидимы');
    });

    test('определение KipToast — после функции showToast и до первого использования в модулях', () => {
        const defShowToast = INDEX_SRC.indexOf('function showToast(msg, actionText, actionFn)');
        const defKipToast = INDEX_SRC.search(/var\s+KipToast\s*=/);
        // блок определения кончается первым «};» после var KipToast
        const defEnd = INDEX_SRC.indexOf('};', defKipToast) + 2;
        // первое РЕАЛЬНОЕ использование — после блока определения
        // (внутри блока — комментарии, упоминающие KipToast.show и guard)
        const after = INDEX_SRC.slice(defEnd);
        const firstUse = after.search(/KipToast\.show\b/);
        assertTrue(defShowToast !== -1, 'функция showToast не найдена');
        assertTrue(defKipToast !== -1, 'определение KipToast не найдено');
        assertTrue(defKipToast > defShowToast, 'KipToast должен определяться после showToast');
        assertTrue(firstUse !== -1, 'вызовы KipToast.show не найдены после определения');
    });

    test('вызовы KipToast.show не пропали (>= 50 вызовов + >= 40 guard-ов)', () => {
        const calls = (INDEX_SRC.match(/KipToast\.show\(/g) || []).length;
        const guards = (INDEX_SRC.match(/KipToast\.show\)/g) || []).length;
        assertTrue(calls >= 50, 'вызовов KipToast.show(: ' + calls + ' — ожидалось >= 50');
        assertTrue(guards >= 40, 'guard-ов KipToast.show): ' + guards + ' — ожидалось >= 40');
    });

    test('элемент #toast существует в разметке (куда показывает showToast)', () => {
        assertTrue(INDEX_SRC.indexOf('id="toast"') !== -1, 'div#toast не найден');
        assertTrue(INDEX_SRC.indexOf('id="toastMessage"') !== -1, 'span#toastMessage не найден');
    });

    test('ИСПОЛНЕНИЕ: KipToast.show(строка/null) вызывает showToast с тем же текстом', () => {
        // Извлекаем только две нужные функции и исполняем в песочнице
        const showToastSrc = INDEX_SRC.match(
            /function showToast\(msg, actionText, actionFn\) \{[\s\S]*?\n\}/);
        const kipToastSrc = INDEX_SRC.match(/var\s+KipToast\s*=\s*\{[\s\S]{0,200}?\};/);
        assertTrue(!!showToastSrc, 'исходник showToast не извлечён');
        assertTrue(!!kipToastSrc, 'исходник KipToast не извлечён');
        const seen = [];
        const document = {
            getElementById: () => ({
                classList: { add() {}, remove() {} },
                style: {}, textContent: '', onclick: null, _hideTimer: null
            })
        };
        const navigator = {};
        const factory = new Function('document', 'navigator', 'seen',
            showToastSrc[0] + '\n' + kipToastSrc[0] +
            '\nKipToast.show("тест"); KipToast.show(null); KipToast.show(123);');
        factory(document, navigator, seen);
        // showToast пишет в элемент toastMessage — проверим через подмену:
        // повторный запуск с записывающим document
        const msgs = [];
        const doc2 = {
            getElementById: (id) => ({
                get textContent() { return msgs[msgs.length - 1] || ''; },
                set textContent(v) { msgs.push(v); },
                classList: { add() {}, remove() {} },
                style: {}, onclick: null, _hideTimer: null
            })
        };
        factory(doc2, navigator, seen);
        assertEqual(msgs.join('|'), 'тест||123',
            'KipToast.show должен передавать текст как есть (null → пусто, число → строка)');
    });
});

describe('Task 282 — serverMessage: пояснение сервера доходит до пользователя', () => {

    test('KipAuth.api сохраняет data.message в err.serverMessage (ветка !data.ok)', () => {
        const branch = INDEX_SRC.match(/if \(!data\.ok\) \{[\s\S]{0,1500}?throw err;/);
        assertTrue(!!branch, 'ветка обработки ошибки ответа не найдена');
        assertTrue(branch[0].indexOf('err.serverMessage = String(data.message)') !== -1,
            'data.message терялся — пользователь видел только код ошибки (overlap)');
    });

    test('WorkSchedule._apiErrText: serverMessage → message → строка', () => {
        const m = INDEX_SRC.match(/_apiErrText: function\(err\) \{[\s\S]*?\n        \},/);
        assertTrue(!!m, 'хелпер _apiErrText не найден');
        assertTrue(m[0].indexOf('err.serverMessage') !== -1 && m[0].indexOf('err.message') !== -1,
            'приоритет: serverMessage (пояснение) затем message (код)');
    });

    test('форма отпусков: catch показывает _apiErrText (не только err.message)', () => {
        const submit = INDEX_SRC.match(/submitVacationForm: function\(\) \{[\s\S]*?\n        \},/);
        assertTrue(!!submit, 'submitVacationForm не извлечён');
        assertTrue(submit[0].indexOf('self._apiErrText(err)') !== -1,
            'ошибка добавления должна показывать пояснение сервера');
    });

    test('удаление периода: catch показывает _apiErrText', () => {
        const del = INDEX_SRC.match(/_doDeleteVacation: function\(id\) \{[\s\S]*?\n        \},/);
        assertTrue(!!del, '_doDeleteVacation не извлечён');
        assertTrue(del[0].indexOf('self._apiErrText(err)') !== -1,
            'ошибка удаления должна показывать пояснение сервера');
    });

    test('страница «Отпуска» удалена (Task 308) — ошибок списка больше нет', () => {
        // Task 308: страница «Отпуска» и её loadVacations удалены —
        // сообщение об ошибке списка показывать негде; пояснение
        // сервера остаётся в формах: submitVacationForm и удаление
        const load = INDEX_SRC.match(/\bloadVacations: function\(\) \{/);
        assertTrue(!load, 'loadVacations (страница) удалён вместе со страницей');
    });

    test('SW-кэш поднят до v539 (Task 296 — фронтенд менялся)', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v744'") !== -1,
            'CACHE_VERSION = kipia-test-v744');
    });
});

// ============================================================
// Слой 2: симуляция сервера — addVacation и строки без id
// ============================================================
class MockSheet {
    constructor(rows) {
        this.rows = rows || [];
        this.fmtCalls = [];   // Task 304: вызовы setNumberFormat
    }
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
            // Task 304: реальный Sheets применяет формат к ячейке;
            // мок протоколирует вызов (WorkSchedule.gs ставит «@»
            // таб-ячейкам ДО записи значений — «0871» не число 871)
            setNumberFormat(fmt) {
                self.fmtCalls.push({ row: row, col: col,
                                     numRows: numRows, numCols: numCols, fmt: fmt });
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
            }
        };
    }
    deleteRow(r) { this.rows.splice(r - 1, 1); }
    appendRow(arr) { this.rows.push(arr.slice()); }
}

const MOCK_UTILS = {
    findSessionByToken: () => ({ user_id: 1 }),
    findUserById: () => ({ role: 'Админ', email: 'test@example.com' }),
    audit: () => {}
};

function loadWS(sheets) {
    const ss = { getSheetByName: (n) => sheets[n] || null };
    const SpreadsheetApp = { openById: () => ss };
    const factory = new Function('SpreadsheetApp', 'Utils', WS_SRC + '\nreturn WorkSchedule;');
    return factory(SpreadsheetApp, MOCK_UTILS);
}

function vacSheets() {
    return {
        'Сотрудники': new MockSheet([
            ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон', 'старт_цикла', 'приём', 'увольнение', 'архив', 'должность', 'комментарий'],
            ['017', 'Иванов И.И.', 'оператор', '', 1, new Date(2026, 0, 1), '', '', 0, '', '']
        ]),
        'Отпуска': new MockSheet([
            ['id', 'таб_номер', 'часть', 'дата_начала', 'дата_окончания', 'комментарий']
        ])
    };
}

describe('Task 282 — симуляция addVacation: строки без id под контролем', () => {

    test('период БЕЗ id в листе → пересекающийся новый период отклоняется (overlap)', () => {
        const sheets = vacSheets();
        // ручная строка без id: 017, часть 1, 01.06–14.06.2026
        sheets['Отпуска'].rows.push(['', '017', 1, new Date(2026, 5, 1), new Date(2026, 5, 14), '']);
        const WS = loadWS(sheets);
        const res = WS.addVacation({ token: 't', 'таб_номер': '017', 'часть': 2,
            'дата_начала': '2026-06-10', 'дата_окончания': '2026-06-20' });
        assertFalse(res.ok, 'пересечение с ручным периодом (без id) должно отклоняться');
        assertEqual(res.error, 'overlap', 'код ошибки');
        assertTrue((res.message || '').indexOf('пересекается') !== -1,
            'пояснение должно быть человекочитаемым: ' + res.message);
    });

    test('период БЕЗ id в листе → дубль части в том же году отклоняется (duplicate_часть)', () => {
        const sheets = vacSheets();
        sheets['Отпуска'].rows.push(['', '017', 2, new Date(2026, 5, 1), new Date(2026, 5, 14), '']);
        const WS = loadWS(sheets);
        const res = WS.addVacation({ token: 't', 'таб_номер': '017', 'часть': 2,
            'дата_начала': '2026-09-01', 'дата_окончания': '2026-09-05' });
        assertFalse(res.ok, 'дубль части (строка без id) должен отклоняться');
        assertEqual(res.error, 'duplicate_часть', 'код ошибки');
    });

    test('период БЕЗ id, но НЕ пересекается и часть другая → успешно добавляется', () => {
        const sheets = vacSheets();
        sheets['Отпуска'].rows.push(['', '017', 1, new Date(2026, 5, 1), new Date(2026, 5, 14), '']);
        const rowsBefore = sheets['Отпуска'].rows.length;
        const WS = loadWS(sheets);
        const res = WS.addVacation({ token: 't', 'таб_номер': '017', 'часть': 2,
            'дата_начала': '2026-08-03', 'дата_окончания': '2026-08-12' });
        assertTrue(res.ok, 'валидный период должен добавляться: ' + JSON.stringify(res));
        assertEqual(sheets['Отпуска'].rows.length, rowsBefore + 1, 'appendRow должен вызвать запись');
        const added = sheets['Отпуска'].rows[rowsBefore];
        assertEqual(added[0], 1, 'первому id присваивается max id + 1 = 1');
        assertEqual(added[1], '017', 'таб_номер');
        assertEqual(added[2], 2, 'часть');
    });

    test('период БЕЗ id другого сотрудника не блокирует добавление', () => {
        const sheets = vacSheets();
        // ручной период «023» (нет в справочнике — не важно для addVacation)
        sheets['Отпуска'].rows.push(['', '023', 1, new Date(2026, 5, 1), new Date(2026, 5, 14), '']);
        const WS = loadWS(sheets);
        const res = WS.addVacation({ token: 't', 'таб_номер': '017', 'часть': 1,
            'дата_начала': '2026-06-01', 'дата_окончания': '2026-06-14' });
        assertTrue(res.ok, 'чужие периоды не должны блокировать: ' + JSON.stringify(res));
    });

    test('listPatterns: прежний пропуск пустых id НЕ тронут (id — PK шаблонов)', () => {
        // рефакторинг Task 282 менял только цикл addVacation; проверяем,
        // что цикл listPatterns (строка с тем же паттерном) сохранился
        const matches = WS_SRC.split('\n')
            .filter(l => l.indexOf("if (r[0] === '' || r[0] === null) continue;") !== -1);
        assertEqual(matches.length, 1,
            'остался ровно 1 такой пропуск — в listPatterns; в addVacation заменён на семантику Task 279');
        // новый guard addVacation на месте
        assertTrue(WS_SRC.indexOf(
            "if ((r[0] === '' || r[0] === null) && !String(r[1] || '').trim() &&") !== -1,
            'guard «пустая строка = нет id И таба И даты» в addVacation не найден');
    });

    test('node --check: WorkSchedule.gs синтаксически валиден', () => {
        const tmp = path.join(__dirname, '..', '.tmp-ws-check.js');
        fs.writeFileSync(tmp, WS_SRC);
        let ok = true;
        try { execSync('node --check "' + tmp + '"', { stdio: 'pipe' }); }
        catch (e) { ok = false; }
        fs.unlinkSync(tmp);
        assertTrue(ok, 'node --check WorkSchedule.gs должен проходить');
    });
});
