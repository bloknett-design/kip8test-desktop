// tests/test-task547.js
// Task 547 — заявка: «В разделе табель учёта, при изменении периода
// отпуска сменного работника на несколько дней, шахматка его рабочих
// дней после первого формирования данных шахматки на этот месяц
// остаётся пустой и заполняется после повторного нажатия на кнопку
// формирования шахматки. Ранее подменные дни распределённые другим
// сменным работникам остаются, хотя у отпускного работника
// возвращаются его рабочие смены и отпуск смещается.»
//
// КОРЕНЬ (два дефекта, один триггер — смещение периода отпуска):
//   1. СЕРВЕР: генерация читала записи ДО расчёта — на днях
//      прежнего отпуска стояли авто-«ОТ»; шаг 3 видел «запись уже
//      есть» и не вставлял смену, сверка устаревших «ОТ» УДАЛЯЛА
//      строку → ячейки ПУСТЕ до ПОВТОРНОГО «Сформировать».
//   2. ПОДМЕНЫ: авто-«д»/«н» замещения (Task 456/458) уже
//      сохранены записями «руч»; отпуск сместился — спрос дня
//      исчез, записи остались (двойная расстановка).
//
// ЧТО СДЕЛАНО:
//   СЕРВЕР (WorkSchedule.gs, generateMonth):
//     • сверка устаревших авто-«ОТ»: день со плановой сменой →
//       смена ВОССТАНОВЛЕНА на месте (toUpdate, счётчик
//       vacationRestored — как 4.6 для мероприятий); день без
//       смены → удаление (как прежде). ОДНО «Сформировать»
//       сходится к актуальному плану;
//     • 4.8: ручные записи с «замещает»=X, где X работает СВОЮ
//       плановую смену этого дня (отпуск сместился) — строка под
//       удаление (счётчик substitutionsRemoved). Записи без
//       «замещает» серверу неотличимы от ручного ввода — не
//       трогаются (их снимает клиент);
//   КЛИЕНТ (index.html):
//     • _autoDnStaleSweep: устаревшие авто-«д»/«н» по реестру
//       месяца (_AUTO_DN_KEYS, Task 458) — спрос дня исчез →
//       серверная запись «руч» под __delete (__autoStale;
//       «Сохранить» удалит, «Отменить» вернёт); несохранённая
//       материализация (__autoDn) снимается; спрос вернулся —
//       свип-удаление откатывается; правки пользователя и «д»/«н»
//       ВНЕ реестра неприкосновенны;
//     • _renderGrid: свип между восстановлением реестра и
//       материализацией нового плана + тост;
//     • тосты «Сформировать» (месяц/год): «возвращено смен из
//       отпусков N», «снято замещений M».
//
// Запуск: через tests/run-all.js (require './test-task547.js').

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const WS_GS = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Срез модуля WorkSchedule (имена методов неуникальны в монолите)
const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

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
function between(src, from, to) {
    const i = src.indexOf(from);
    const j = src.indexOf(to, i);
    return (i === -1 || j === -1) ? '' : src.slice(i, j);
}

// ============================================================
// 1. SRC — сервер: рестор смен из-под устаревших «ОТ»
// ============================================================
describe('Task 547 — SRC: generateMonth (рестор смен из-под «ОТ»)', () => {

    test('сверка устаревших «ОТ» смотрит плановую смену дня', () => {
        const blk = between(WS_GS, 'Устаревшие авто-«ОТ» записи месяца', '// 4.6 (Task 303)');
        assertTrue(blk.indexOf("plannedStatus[se.дата + '|' + se['таб_номер']]") !== -1,
            'план дня берётся из plannedStatus (индекс шага 3)');
    });

    test('день со сменой → toUpdate-рестор, не удаление', () => {
        const blk = between(WS_GS, 'Устаревшие авто-«ОТ» записи месяца', '// 4.6 (Task 303)');
        assertTrue(blk.indexOf('toUpdate.push({ rowIndex: se._rowIndex, status: plannedSv,') !== -1,
            'устаревший авто-«ОТ» на сменном дне обновляется в смену НА МЕСТЕ');
        assertTrue(blk.indexOf('vacationRestored++') !== -1,
            'счётчик vacationRestored растёт');
        // рестор — ВНУТРИ ветки plannedSv (до else-удаления)
        const iIf = blk.indexOf('if (plannedSv) {');
        const iElse = blk.indexOf('} else {');
        const iPush = blk.indexOf('toUpdate.push({ rowIndex: se._rowIndex, status: plannedSv,');
        assertTrue(iIf !== -1 && iElse !== -1 && iPush !== -1 &&
                   iIf < iPush && iPush < iElse,
            'toUpdate-рестор внутри ветки if (plannedSv)');
        assertTrue(blk.indexOf('toDeleteRows.push(se._rowIndex);') !== -1,
            'день БЕЗ плановой смены — по-прежнему удаление');
    });

    test('рестор сохраняет связку с мероприятием (бейдж, Task 303)', () => {
        const blk = between(WS_GS, 'Устаревшие авто-«ОТ» записи месяца', '// 4.6 (Task 303)');
        assertTrue(blk.indexOf("coveredTr[se.дата + '|' + se['таб_номер']]") !== -1,
            'день, покрытый мероприятием, распознаётся');
        assertTrue(blk.indexOf('var instrSv = trSv ? trSv.id : null;') !== -1,
            'инструкция = id мероприятия (иначе null)');
    });

    test('индекс существующих обновляется — 4.7 не зацепит рестор', () => {
        const blk = between(WS_GS, 'Устаревшие авто-«ОТ» записи месяца', '// 4.6 (Task 303)');
        assertTrue(blk.indexOf('se.статус = plannedSv;') !== -1 &&
                   blk.indexOf('se.инструкция = instrSv;') !== -1,
            'entryIndex-копия записи синхронизирована с рестором');
    });

    test('комментарий-ссылка на заявку у сверки', () => {
        const blk = between(WS_GS, 'Устаревшие авто-«ОТ» записи месяца', '// 4.6 (Task 303)');
        assertTrue(blk.indexOf('Task 547') !== -1, 'маркер задачи');
        assertTrue(blk.indexOf('остаётся пустой') !== -1,
            'цитата заявки («шахматка … остаётся пустой»)');
    });

    test('док-комментарий алгоритма: 4.5 рестор + шаг 4.8', () => {
        const head = WS_GS.slice(0, WS_GS.indexOf('generateMonth: function('));
        assertTrue(head.indexOf('ВОССТАНОВИТЬ на месте') !== -1,
            'описание 4.5 обновлено (рестор вместо удаления)');
        assertTrue(head.indexOf('4.8 (Task 547)') !== -1 &&
                   head.indexOf('substitutionsRemoved') !== -1,
            'шаг 4.8 описан');
    });
});

// ============================================================
// 2. SRC — сервер: шаг 4.8 (устаревшие замещения)
// ============================================================
describe('Task 547 — SRC: generateMonth 4.8 (замещения)', () => {

    test('сверка замещений после 4.7, до записи в лист', () => {
        const i47 = WS_GS.indexOf('// 4.7 (Task 320)');
        const i48 = WS_GS.indexOf('// 4.8 (Task 547');
        const i5 = WS_GS.indexOf('// 5. Запись в лист');
        assertTrue(i47 !== -1 && i48 !== -1 && i5 !== -1 &&
                   i47 < i48 && i48 < i5,
            'блок 4.8 между 4.7 и записью');
    });

    test('условие снятия: «замещает»=X работает свою плановую смену', () => {
        const blk = between(WS_GS, '// 4.8 (Task 547', '// 5. Запись в лист');
        assertTrue(blk.indexOf("if (se5.источник !== 'руч') continue;") !== -1,
            'только ручные записи (авто-«д»/«н» не бывает, защита)');
        assertTrue(blk.indexOf('if (!se5.замещает) continue;') !== -1,
            'записи БЕЗ «замещает» (материализация Task 458) не трогаются');
        assertTrue(blk.indexOf("plannedStatus[keyX]") !== -1,
            'плановая смена X этого дня');
        assertTrue(blk.indexOf('entryX.статус !== plannedX') !== -1,
            'X отсутствует (ОТ/Б/…) — замещение живо');
        assertTrue(blk.indexOf('substitutionsRemoved++') !== -1,
            'счётчик снятых замещений');
    });

    test('комментарий-ссылка на заявку (подменные дни)', () => {
        const blk = between(WS_GS, '// 4.8 (Task 547', '// 5. Запись в лист');
        assertTrue(blk.indexOf('подменные дни') !== -1,
            'цитата заявки («ранее подменные дни … остаются»)');
    });

    test('ответ: vacationRestored и substitutionsRemoved в data', () => {
        assertTrue(WS_GS.indexOf('vacationRestored:  vacationRestored,') !== -1,
            'поле vacationRestored');
        assertTrue(WS_GS.indexOf('substitutionsRemoved: substitutionsRemoved,') !== -1,
            'поле substitutionsRemoved');
    });

    test('аудит-сводка считает новые счётчики', () => {
        const blk = between(WS_GS, 'var summary = ', 'Utils.audit');
        assertTrue(blk.indexOf('возвращено смен из-под отпусков') !== -1,
            'строка «возвращено смен из-под отпусков»');
        assertTrue(blk.indexOf('снято устаревших замещений') !== -1,
            'строка «снято устаревших замещений»');
    });

    test('node --check: WorkSchedule.gs синтаксически валиден', () => {
        const tmp = path.join(ROOT, 'scripts', '.task547-check.js');
        fs.writeFileSync(tmp, WS_GS.replace(/^var /m, 'var '));
        let ok = true;
        try { execSync('node --check "' + tmp + '"', { stdio: 'pipe' }); }
        catch (e) { ok = false; }
        finally { fs.unlinkSync(tmp); }
        assertTrue(ok, 'синтаксис GAS-файла валиден (после правок)');
    });
});

// ============================================================
// 3. SRC — клиент: свип _autoDnStaleSweep + интеграция
// ============================================================
describe('Task 547 — SRC: клиент (свип устаревших д/н)', () => {

    test('метод определён, гвард _canEdit первым делом', () => {
        const fn = methodText(WS_SRC, '_autoDnStaleSweep');
        assertTrue(fn.indexOf('if (!this._canEdit) return 0;') !== -1,
            'зрители правок не создают (как материализация Task 458)');
    });

    test('свип работает по реестру месяца (Task 458)', () => {
        const fn = methodText(WS_SRC, '_autoDnStaleSweep');
        assertTrue(fn.indexOf('(this._AUTO_DN_KEYS || {})[mk]') !== -1,
            'реестр месяца — источник ячеек слоя');
    });

    test('спрос дня — семантика need из _autoDnPlan', () => {
        const fn = methodText(WS_SRC, '_autoDnStaleSweep');
        assertTrue(fn.indexOf("this._plannedShiftAt(iso, sh) === type") !== -1,
            'плановая смена отпускника этого ТИПА (Д/д, Н/н)');
        assertTrue(fn.indexOf('vacCodes') !== -1 &&
                   fn.indexOf('_vacationAt') !== -1,
            'отпускник — эффективная запись семейства отпусков ИЛИ план листа');
        assertTrue(fn.indexOf("String(e['тип'] || '').trim() !== 'сменный'") !== -1,
            'кандидаты спроса — только сменный персонал с шаблоном');
    });

    test('серверная запись «руч» → __delete с флагом __autoStale', () => {
        const fn = methodText(WS_SRC, '_autoDnStaleSweep');
        assertTrue(fn.indexOf('pend[key] = { __delete: true, __autoStale: true };') !== -1,
            'свип-удаление отличается от пользовательского');
        assertTrue(fn.indexOf("srv.источник === 'руч'") !== -1,
            'удаляются только записи «руч»');
    });

    test('правки пользователя неприкосновенны', () => {
        const fn = methodText(WS_SRC, '_autoDnStaleSweep');
        assertTrue(fn.indexOf('if (p && !p.__delete && !p.__autoDn) continue;') !== -1,
            'правка пользователя поверх слоя (любой код) не трогается');
        assertTrue(fn.indexOf('if (p && p.__delete) continue;') !== -1 &&
                   fn.indexOf('p.__delete && p.__autoStale') !== -1,
            'пользовательское __delete не откатывается, свипное — откатывается');
        assertTrue(fn.indexOf("srvSt === 'д' || srvSt === 'н'") !== -1,
            'статус ячейки — ПО СЕРВЕРУ (под __delete эффективное пусто)');
    });

    test('несохранённая материализация снимается вместе с меткой', () => {
        const fn = methodText(WS_SRC, '_autoDnStaleSweep');
        assertTrue(fn.indexOf('delete pend[key];') !== -1 &&
                   fn.indexOf('this._autoDnUnmark(key);') !== -1,
            'правка __autoDn снимается + метка реестра');
    });

    test('материализация маркирует свои правки __autoDn', () => {
        const fn = methodText(WS_SRC, '_autoDnMaterialize');
        assertTrue(fn.indexOf("'__autoDn': true") !== -1,
            'флаг материализации — свип отличает свою правку');
    });

    test('_renderGrid: свип МЕЖДУ реестром и материализацией', () => {
        const fn = methodText(WS_SRC, '_renderGrid');
        const iLoad = fn.indexOf('this._autoDnKeysLoad();');
        const iSweep = fn.indexOf('this._autoDnStaleSweep()');
        const iMat = fn.indexOf('this._autoDnMaterialize();');
        assertTrue(iLoad !== -1 && iSweep !== -1 && iMat !== -1 &&
                   iLoad < iSweep && iSweep < iMat,
            'порядок: keysLoad → sweep → materialize (свободные ячейки займёт новый план)');
    });

    test('тост свипа зовёт «Сохранить»', () => {
        const fn = methodText(WS_SRC, '_renderGrid');
        assertTrue(fn.indexOf('устаревших «д»/«н» (замещение отпуска)') !== -1,
            'тост поясняет снятие устаревших кодов');
    });

    test('тост месяца: рестор смен и снятые замещения', () => {
        const fn = methodText(WS_SRC, '_doGenerateMonth');
        assertTrue(fn.indexOf('data.vacationRestored') !== -1 &&
                   fn.indexOf('возвращено смен из отпусков') !== -1,
            'строка «возвращено смен из отпусков N»');
        assertTrue(fn.indexOf('data.substitutionsRemoved') !== -1 &&
                   fn.indexOf('снято замещений') !== -1,
            'строка «снято замещений M»');
    });

    test('тост года: суммы за 12 месяцев', () => {
        const fn = methodText(WS_SRC, '_doGenerateYear');
        assertTrue(fn.indexOf('totalVacRestored') !== -1 &&
                   fn.indexOf('totalSubsRemoved') !== -1,
            'суммы рестора/замещений копятся');
        assertTrue(fn.indexOf('totalVacRestored +=') !== -1,
            'значения месяцев складываются');
    });

    test('комментарий-заявка над свипом', () => {
        const idx = WS_SRC.indexOf('_autoDnStaleSweep: function(');
        assertTrue(idx !== -1, 'метод есть');
        assertTrue(WS_SRC.slice(Math.max(0, idx - 1800), idx)
                       .indexOf('подменные дни') !== -1,
            'в комментарии — цитата заявки');
    });
});

// ============================================================
// 4. VM — _autoDnStaleSweep (хост из реальных методов)
// ============================================================
describe('Task 547 — VM: _autoDnStaleSweep', () => {

    const PAT = { id: 1, cycle: 4,
                  days: [{ day: 1, status: 'Д' }, { day: 2, status: 'Н' }] };
    // 017: старт 01.09 → 05.09 cyc1 «Д», 06.09 cyc2 «Н»
    // 023: старт 03.09 → 05/06.09 — плановые ВЫХОДНЫЕ (кандидат подмен)
    // 031: старт 05.09 → 05.09 cyc1 «Д» (второй кандидат спроса)
    const EMPS = [
        { 'таб_номер': '017', 'тип': 'сменный', 'шаблон_ротации': 1, 'старт_цикла': '2026-09-01' },
        { 'таб_номер': '023', 'тип': 'сменный', 'шаблон_ротации': 1, 'старт_цикла': '2026-09-03' },
        { 'таб_номер': '031', 'тип': 'сменный', 'шаблон_ротации': 1, 'старт_цикла': '2026-09-05' }
    ];

    function host(opts) {
        opts = opts || {};
        const entries = opts.entries !== undefined ? opts.entries
            : [
                // A после ПОВТОРНОЙ генерации (отпуск сместился 05–10 → 08–13):
                // 05/06 — смены ВОССТАНОВЛЕНЫ, спрос исчез
                { 'дата': '2026-09-05', 'таб_номер': '017', 'статус': 'Д', 'источник': 'авто' },
                { 'дата': '2026-09-06', 'таб_номер': '017', 'статус': 'Н', 'источник': 'авто' },
                // подмены, сохранённые прошлым проходом (источник «руч»)
                { 'дата': '2026-09-05', 'таб_номер': '023', 'статус': 'д', 'источник': 'руч' },
                { 'дата': '2026-09-06', 'таб_номер': '023', 'статус': 'н', 'источник': 'руч' }
            ];
        return new Function('return ({' +
            methodText(WS_SRC, '_autoDnStaleSweep') + ',' +
            methodText(WS_SRC, '_effectiveEntry') + ',' +
            methodText(WS_SRC, '_serverEntry') + ',' +
            methodText(WS_SRC, '_vacationAt') + ',' +
            methodText(WS_SRC, '_plannedShiftAt') + ',' +
            methodText(WS_SRC, '_parseIsoLocal') + ',' +
            methodText(WS_SRC, '_autoDnUnmark') + ',' +
            methodText(WS_SRC, '_autoDnKeysSave') + ',' +
            '_canEdit: ' + (opts.canEdit !== undefined ? opts.canEdit : true) + ',' +
            '_year: 2026, _month: 9,' +
            '_EMPLOYEES: ' + JSON.stringify(EMPS) + ',' +
            '_PATTERNS: ' + JSON.stringify([PAT]) + ',' +
            '_VAC_CODES: ["ОТ", "У"],' +
            '_VACATIONS: ' + JSON.stringify(opts.vacations || []) + ',' +
            '_ENTRIES: ' + JSON.stringify(entries) + ',' +
            '_PENDING: ' + JSON.stringify(opts.pending || {}) + ',' +
            '_AUTO_DN_KEYS: ' + JSON.stringify(opts.keys !== undefined ? opts.keys
                : { '2026-09': { '2026-09-05|023': 1, '2026-09-06|023': 1 } }) + ',' +
            '});')();
    }

    test('спрос исчез → обе записи «руч» под __autoStale-удаление', () => {
        const h = host({});
        assertEqual(h._autoDnStaleSweep(), 2, '2 устаревших кода снято');
        assertEqual(h._PENDING['2026-09-05|023'].__delete, true, '«д» 05.09 под удалением');
        assertEqual(h._PENDING['2026-09-05|023'].__autoStale, true, 'флаг свипа стоит');
        assertEqual(h._PENDING['2026-09-06|023'].__delete, true, '«н» 06.09 под удалением');
    });

    test('идемпотентность: повторный свип — 0', () => {
        const h = host({});
        assertEqual(h._autoDnStaleSweep(), 2, 'первый проход — 2');
        assertEqual(h._autoDnStaleSweep(), 0, 'повторный — 0');
        assertEqual(h._PENDING['2026-09-05|023'].__delete, true, 'план удаления не дублируется');
    });

    test('спрос жив (отпуск на месте) → записи не тронуты', () => {
        const h = host({
            entries: [
                { 'дата': '2026-09-05', 'таб_номер': '017', 'статус': 'ОТ', 'источник': 'авто' },
                { 'дата': '2026-09-06', 'таб_номер': '017', 'статус': 'ОТ', 'источник': 'авто' },
                { 'дата': '2026-09-05', 'таб_номер': '023', 'статус': 'д', 'источник': 'руч' },
                { 'дата': '2026-09-06', 'таб_номер': '023', 'статус': 'н', 'источник': 'руч' }
            ]
        });
        assertEqual(h._autoDnStaleSweep(), 0, 'спрос Д и Н жив — снимать нечего');
        assertEqual(h._PENDING['2026-09-05|023'], undefined, '«д» не тронут');
    });

    test('спрос вернулся → свип-удаление откатывается', () => {
        const h = host({
            entries: [
                { 'дата': '2026-09-05', 'таб_номер': '017', 'статус': 'ОТ', 'источник': 'авто' },
                { 'дата': '2026-09-05', 'таб_номер': '023', 'статус': 'д', 'источник': 'руч' }
            ],
            keys: { '2026-09': { '2026-09-05|023': 1 } },
            pending: { '2026-09-05|023': { __delete: true, __autoStale: true } }
        });
        assertEqual(h._autoDnStaleSweep(), 0, 'запланированного свипом удаления нет');
        assertEqual(h._PENDING['2026-09-05|023'], undefined,
            'запись вернулась в сетку (до «Сохранить»)');
    });

    test('пользовательское __delete НЕ откатывается возвратом спроса', () => {
        const h = host({
            entries: [
                { 'дата': '2026-09-05', 'таб_номер': '017', 'статус': 'ОТ', 'источник': 'авто' },
                { 'дата': '2026-09-05', 'таб_номер': '023', 'статус': 'д', 'источник': 'руч' }
            ],
            keys: { '2026-09': { '2026-09-05|023': 1 } },
            pending: { '2026-09-05|023': { __delete: true } }
        });
        h._autoDnStaleSweep();
        assertEqual(h._PENDING['2026-09-05|023'].__delete, true,
            'пользователь сам удаляет — свип не мешает');
    });

    test('правка пользователя (без __autoDn) не трогается', () => {
        const h = host({
            pending: { '2026-09-05|023':
                       { 'статус': 'д', 'переработка': 0, 'замещает': null } },
            keys: { '2026-09': { '2026-09-05|023': 1 } }
        });
        assertEqual(h._autoDnStaleSweep(), 0, 'свип обошёл чужую правку');
        assertEqual(h._PENDING['2026-09-05|023']['статус'], 'д', 'правка цела');
    });

    test('несохранённая материализация (__autoDn) снимается с меткой', () => {
        // ячейка БЕЗ серверной записи (материализация ещё не сохранена):
        // спроса нет → правка снимается целиком
        const h = host({
            entries: [
                { 'дата': '2026-09-05', 'таб_номер': '017', 'статус': 'Д', 'источник': 'авто' },
                { 'дата': '2026-09-06', 'таб_номер': '017', 'статус': 'Н', 'источник': 'авто' }
            ],
            pending: { '2026-09-05|023':
                       { 'статус': 'д', 'переработка': 0, 'замещает': null,
                         'комментарий': '', 'часы': null, '__autoDn': true } },
            keys: { '2026-09': { '2026-09-05|023': 1 } }
        });
        assertEqual(h._autoDnStaleSweep(), 1, 'материализация снята');
        assertEqual(h._PENDING['2026-09-05|023'], undefined, 'правки больше нет');
        assertEqual(h._AUTO_DN_KEYS['2026-09']['2026-09-05|023'], undefined,
            'метка реестра снята (план расставит заново при возврате спроса)');
    });

    test('несохранённая материализация при живом спросе — на месте', () => {
        const h = host({
            entries: [
                { 'дата': '2026-09-05', 'таб_номер': '017', 'статус': 'ОТ', 'источник': 'авто' }
            ],
            pending: { '2026-09-05|023':
                       { 'статус': 'д', 'переработка': 0, 'замещает': null,
                         'комментарий': '', 'часы': null, '__autoDn': true } },
            keys: { '2026-09': { '2026-09-05|023': 1 } }
        });
        assertEqual(h._autoDnStaleSweep(), 0, 'спрос жив — правка не тронута');
        assertEqual(h._PENDING['2026-09-05|023']['статус'], 'д', 'материализация цела');
    });

    test('ручные «д»/«н» ВНЕ реестра неприкосновенны', () => {
        const h = host({ keys: { '2026-09': {} } });
        assertEqual(h._autoDnStaleSweep(), 0,
            'вне реестра = не слой замещения (ручной ввод)');
        assertEqual(h._ENTRIES.length, 4, 'записи не тронуты');
    });

    test('тип спроса важен: «д» на дне со спросом только «Н» — снимается', () => {
        const h = host({
            entries: [
                // 017 в отпуске 06.09, плановая смена — «Н» (спрос Н)
                { 'дата': '2026-09-06', 'таб_номер': '017', 'статус': 'ОТ', 'источник': 'авто' },
                // у 023 стоит «д» (не «н») — спрос «Д» этого дня НЕТ
                { 'дата': '2026-09-06', 'таб_номер': '023', 'статус': 'д', 'источник': 'руч' }
            ],
            keys: { '2026-09': { '2026-09-06|023': 1 } }
        });
        assertEqual(h._autoDnStaleSweep(), 1, 'тип не совпал — код устарел');
        assertEqual(h._PENDING['2026-09-06|023'].__delete, true, 'под удалением');
    });

    test('план листа «Отпуска» в пустой ячейке тоже держит спрос', () => {
        const h = host({
            entries: [
                // записи 017 нет вовсе — отпуск только ПЛАНОМ листа
                { 'дата': '2026-09-05', 'таб_номер': '023', 'статус': 'д', 'источник': 'руч' }
            ],
            vacations: [{ 'таб_номер': '017', 'дата_начала': '2026-09-05',
                          'дата_окончания': '2026-09-10' }],
            keys: { '2026-09': { '2026-09-05|023': 1 } }
        });
        assertEqual(h._autoDnStaleSweep(), 0,
            'отпуск планом (до «Сформировать») — спрос жив, код на месте');
    });

    test('зритель и пустой реестр — 0', () => {
        assertEqual(host({ canEdit: false })._autoDnStaleSweep(), 0,
            'зрители правок не создают');
        assertEqual(host({ keys: {} })._autoDnStaleSweep(), 0,
            'пустой реестр месяца');
    });

    test('один сменный работник — спрос не с кем закрывать, свип молчит', () => {
        const h = host({});
        h._EMPLOYEES = [EMPS[0]];
        assertEqual(h._autoDnStaleSweep(), 0, 'гвард < 2 сменных');
    });
});

// ============================================================
// 5. GAS-моки — generateMonth: сценарий заявки целиком
// ============================================================
describe('Task 547 — GAS: generateMonth (сценарий заявки)', () => {

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
                setNumberFormat() {}
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
        const factory = new Function('SpreadsheetApp', 'Utils',
            fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8') +
            '\nreturn WorkSchedule;');
        return factory(SpreadsheetApp, MOCK_UTILS);
    }

    function baseSheets() {
        return {
            'Сотрудники': new MockSheet([
                ['таб_номер', 'ФИО', 'тип', 'смена', 'шаблон', 'старт_цикла', 'приём', 'увольнение', 'архив', 'должность', 'комментарий'],
                ['017', 'Иванов И.И.', 'оператор', '', 1, new Date(2026, 8, 1), '', '', 0, '', ''],
                ['023', 'Петров П.П.', 'оператор', '', 1, new Date(2026, 8, 3), '', '', 0, '', '']
            ]),
            'Шаблоны_ротации': new MockSheet([
                ['id', 'name', 'cycle', 'desc'],
                [1, 'Сутки через двое', 4, '']
            ]),
            'Дни_цикла': new MockSheet([
                ['pattern_id', 'day', 'status'],
                [1, 1, 'Д'], [1, 2, 'Н'], [1, 3, ''], [1, 4, '']
            ]),
            'Инструктажи': new MockSheet([
                ['id', 'таб', 'тип', 'тема', 'начало', 'конец', 'дней', 'комментарий']
            ]),
            'Записи_графика': new MockSheet([
                ['дата', 'таб', 'статус', 'переработка', 'праздник', 'источник', 'обновлён', 'замещает', 'инструкция', 'комментарий']
            ]),
            'Отпуска': new MockSheet([
                ['id', 'таб_номер', 'часть', 'дата_начала', 'дата_окончания', 'комментарий']
            ])
        };
    }

    function entryAt(sheets, iso, tab) {
        for (let i = 1; i < sheets['Записи_графика'].rows.length; i++) {
            const r = sheets['Записи_графика'].rows[i];
            const d = r[0];
            const dIso = d instanceof Date
                ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
                  String(d.getDate()).padStart(2, '0') : String(d);
            if (dIso === iso && String(r[1]).trim() === tab) return r;
        }
        return null;
    }
    function d(y, m, dd) { return new Date(y, m - 1, dd); }

    test('СЦЕНАРИЙ ЗАЯВКИ: смена периода 05–10 → 08–13, одно «Сформировать»', () => {
        const sheets = baseSheets();
        sheets['Отпуска'].rows.push([1, '017', 1, d(2026, 9, 5), d(2026, 9, 10), '']);
        const WS = loadWS(sheets);
        // генерация #1 — отпуск 05–10
        WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertEqual(entryAt(sheets, '2026-09-05', '017')[2], 'ОТ', 'до: 05.09 — «ОТ»');

        // подмены, СОХРАНЁННЫЕ слоем Task 456/458 (записи «руч»):
        // «д» 05.09 — замещает ПУСТО (как пишет материализация)
        // «н» 06.09 — замещает «017» (явная связь, расширенная правка)
        sheets['Записи_графика'].rows.push(
            [d(2026, 9, 5), '023', 'д', 0, 0, 'руч', new Date(), '', null, ''],
            [d(2026, 9, 6), '023', 'н', 0, 0, 'руч', new Date(), '017', null, '']);

        // смена периода (замечание: «изменение периода отпуска … на несколько дней»)
        const uv = WS.updateVacation({ token: 't', id: 1, 'таб_номер': '017', 'часть': 1,
                                       'дата_начала': '2026-09-08', 'дата_окончания': '2026-09-13' });
        assertTrue(uv.ok, 'период смещён');

        // ПЕРВОЕ «Сформировать» после смены (у заявки — пустые дни!)
        const r2 = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertEqual(entryAt(sheets, '2026-09-05', '017')[2], 'Д',
            '05.09 — смена ВОССТАНОВЛЕНА (не пустая ячейка!)');
        assertEqual(entryAt(sheets, '2026-09-06', '017')[2], 'Н',
            '06.09 — смена ВОССТАНОВЛЕНА');
        assertEqual(r2.data.vacationRestored, 2, 'счётчик vacationRestored=2');
        assertEqual(entryAt(sheets, '2026-09-07', '017'), null,
            '07.09 — день без смены: строки нет (как прежде)');
        assertEqual(entryAt(sheets, '2026-09-08', '017')[2], 'ОТ', 'отпуск 08–13 встал');
        assertEqual(entryAt(sheets, '2026-09-13', '017')[2], 'ОТ', '13.09 — «ОТ» (была смена)');
        assertEqual(entryAt(sheets, '2026-09-14', '017')[2], 'Н', 'смена после отпуска жива');

        // подмены: явная (замещает 017) снята сервером, «слой» (замещает пусто)
        // остаётся для клиентского свипа — по данным сервера она ручная
        assertEqual(entryAt(sheets, '2026-09-06', '023'), null,
            '«н» с замещает=017 снята (017 работает свою смену)');
        assertEqual(r2.data.substitutionsRemoved, 1, 'счётчик substitutionsRemoved=1');
        assertEqual(entryAt(sheets, '2026-09-05', '023')[2], 'д',
            '«д» без замещает — сервер не трогает (снимет клиент Task 547)');
    });

    test('идемпотентность: третье «Сформировать» — 0/0/0 (сходим с первого)', () => {
        const sheets = baseSheets();
        sheets['Отпуска'].rows.push([1, '017', 1, d(2026, 9, 5), d(2026, 9, 10), '']);
        const WS = loadWS(sheets);
        WS.generateMonth({ token: 't', year: 2026, month: 9 });
        sheets['Отпуска'].rows[1] = [1, '017', 1, d(2026, 9, 8), d(2026, 9, 13), ''];
        const r2 = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertEqual(r2.data.vacationRestored, 2, 'повторно ничего не двигается');
        const r3 = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertEqual(r3.data.generated, 0, 'вставок нет');
        assertEqual(r3.data.updated, 0, 'обновлений нет');
        assertEqual(r3.data.removed, 0, 'удалений нет');
        assertEqual(r3.data.vacationRestored, 0, 'ресторов нет');
        assertEqual(r3.data.substitutionsRemoved, 0, 'замещения чисты');
    });

    test('замещение живого отпуска НЕ снимается', () => {
        const sheets = baseSheets();
        sheets['Отпуска'].rows.push([1, '017', 1, d(2026, 9, 5), d(2026, 9, 10), '']);
        const WS = loadWS(sheets);
        WS.generateMonth({ token: 't', year: 2026, month: 9 });
        sheets['Записи_графика'].rows.push(
            [d(2026, 9, 5), '023', 'д', 0, 0, 'руч', new Date(), '017', null, '']);
        const r2 = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertEqual(r2.data.substitutionsRemoved, 0, 'отпускник в «ОТ» — замещение нужно');
        assertEqual(entryAt(sheets, '2026-09-05', '023')[2], 'д', 'запись на месте');
    });

    test('замещение при отсутствии X (ОТ нет, «Б» вручную) НЕ снимается', () => {
        const sheets = baseSheets();
        const WS = loadWS(sheets);
        WS.generateMonth({ token: 't', year: 2026, month: 9 });
        // 017 вручную «Б» 05.09 (не отпуск), 023 замещает его
        sheets['Записи_графика'].rows.push(
            [d(2026, 9, 5), '017', 'Б', 0, 0, 'руч', new Date(), '', null, ''],
            [d(2026, 9, 5), '023', 'д', 0, 0, 'руч', new Date(), '017', null, '']);
        const r2 = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertEqual(r2.data.substitutionsRemoved, 0,
            'X отсутствует (не работает плановую смену) — замещение живо');
        assertEqual(entryAt(sheets, '2026-09-05', '023')[2], 'д', 'запись на месте');
    });

    test('замещение работника БЕЗ шаблона не проверяется', () => {
        const sheets = baseSheets();
        sheets['Сотрудники'].rows.push(
            ['099', 'Сидоров С.С.', 'оператор', '', '', '', '', '', 0, '', '']);
        const WS = loadWS(sheets);
        WS.generateMonth({ token: 't', year: 2026, month: 9 });
        sheets['Записи_графика'].rows.push(
            [d(2026, 9, 5), '023', 'д', 0, 0, 'руч', new Date(), '099', null, '']);
        const r2 = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        assertEqual(r2.data.substitutionsRemoved, 0,
            'нет плановой смены X — честная неизвестность, не удаляем');
        assertEqual(entryAt(sheets, '2026-09-05', '023')[2], 'д', 'запись на месте');
    });

    test('рестор сохраняет связку с мероприятием (бейдж Task 303)', () => {
        const sheets = baseSheets();
        sheets['Отпуска'].rows.push([1, '017', 1, d(2026, 9, 5), d(2026, 9, 10), '']);
        sheets['Инструктажи'].rows.push(
            [1, '017', 'инструктаж', 'Тема', d(2026, 9, 5), d(2026, 9, 5), 1, '']);
        const WS = loadWS(sheets);
        WS.generateMonth({ token: 't', year: 2026, month: 9 });
        // отпуск сместился с 05.09 — смена 017 возвращается, но день
        // покрыт мероприятием: смена — код, мероприятие — бейдж (I=id)
        sheets['Отпуска'].rows[1] = [1, '017', 1, d(2026, 9, 8), d(2026, 9, 13), ''];
        const r2 = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        const row = entryAt(sheets, '2026-09-05', '017');
        assertEqual(row[2], 'Д', 'смена восстановлена');
        assertEqual(parseInt(row[8], 10), 1, 'связка с мероприятием сохранена (колонка I)');
        assertEqual(r2.data.vacationRestored, 2, 'счётчик учёл рестор (05 и 06)');
    });

    test('период УДАЛЁН целиком: смены вернулись, выходные «ОТ» сняты', () => {
        const sheets = baseSheets();
        sheets['Отпуска'].rows.push([1, '017', 1, d(2026, 9, 5), d(2026, 9, 10), '']);
        const WS = loadWS(sheets);
        WS.generateMonth({ token: 't', year: 2026, month: 9 });
        sheets['Отпуска'].rows.splice(1, 1);
        const r2 = WS.generateMonth({ token: 't', year: 2026, month: 9 });
        // период 05–10: сменные дни 05, 06, 09, 10 (цикл 4 от 01.09)
        assertEqual(r2.data.vacationRestored, 4, 'сменные дни периода — 4');
        assertEqual(entryAt(sheets, '2026-09-05', '017')[2], 'Д', '05.09 — смена');
        assertEqual(entryAt(sheets, '2026-09-06', '017')[2], 'Н', '06.09 — смена');
        assertEqual(entryAt(sheets, '2026-09-09', '017')[2], 'Д', '09.09 — смена');
        assertEqual(entryAt(sheets, '2026-09-10', '017')[2], 'Н', '10.09 — смена');
        assertEqual(entryAt(sheets, '2026-09-07', '017'), null, '07.09 (выходной) — строки нет');
        assertEqual(entryAt(sheets, '2026-09-08', '017'), null, '08.09 (выходной) — строки нет');
    });
});

// регресс-санитар: у тестов заявки НЕТ мутированных глобалов
describe('Task 547 — санитар', () => {
    test('заявка-цитата в шапке теста', () => {
        assertTrue(fs.readFileSync(__filename, 'utf8')
                       .indexOf('шахматка его рабочих дней после первого формирования') !== -1,
            'текст замечания пользователя сохранён в тесте');
    });
});
