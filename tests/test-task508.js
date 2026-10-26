// tests/test-task508.js
// Task 508 — заявка пользователя:
//   «Добавь сохранение в архив журнала кто последний вносил правки
//    в каждый кабель, по столбцу name в таблице users файла
//    KIP8_Access. И удалённый кабель так же должен сохраняться с
//    пометкой как архивный по причине "Удалён", кто удалил, и не
//    должен отображаться в распечатываемом или сохраняемом в PDF
//    файле, а в excel отображается.»
//
// АРХИТЕКТУРА:
//   СЕРВЕР (scripts/CableJournal.gs — файл-эталон в репозитории,
//   деплой в Apps Script по DEPLOY-Task508):
//     • лист журнала получает колонки P–T: «Последний редактор»,
//       «Дата правки», «Архив» (причина), «Кем удалён»,
//       «Дата удаления» (создаются сами — _ensureArchiveColumns);
//     • appendRow/updateRow пишут P/Q (name из users KIP8_Access);
//     • deleteRow НЕ удаляет строку физически: R = «Удалён»,
//       S = кто, T = когда; list отдаёт строки с флагом _archived
//       (total — активные, archivedTotal — архивные);
//     • getFilters архивные строки пропускает.
//   КЛИЕНТ (index.html):
//     • load/_restoreCache/_idbRestore сплитят полный список
//       (_splitArchived): активные — прежний конвейер (список,
//       поиск, печать, PDF), архивные — _archivedRows (Excel);
//       кэш persists ПОЛНЫЙ снапшот (офлайн-Excel видит удалённые);
//     • _saveCjXlsx строит книгу по _excelModel (активные + архив,
//       поиск учтён, сортировка № п/п); _buildCjWorkbook добавляет
//       блок «Архив» K–O (Статус/Кем удалён/Дата удаления/
//       Последний редактор/Дата правки) ТОЛЬКО при архивных строках
//       — без архива книга ПОСЛОВНО прежняя (Task 506);
//     • печать/PDF (_printModel по this._rows) архив НЕ видит.
//
// Запуск: через tests/run-all.js (require './test-task508.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const GS_PATH = path.join(ROOT, 'scripts', 'CableJournal.gs');
const GS_SRC = fs.readFileSync(GS_PATH, 'utf8');
const SYNC_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'sync-cables.py'), 'utf8');

// Вырезка метода (приём test-task505.js/test-task506.js)
function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end).replace(/(\n[ \t]*\/\/[^\n]*)+[ \t]*$/, '');
}

const CJ_START = INDEX_SRC.indexOf('const KipCableJournal = {');
const CJ_END = INDEX_SRC.indexOf('FlowmeterData — Расходомеры хозрасчётные');
const CJ_SRC = INDEX_SRC.slice(CJ_START, CJ_END > CJ_START ? CJ_END : undefined);
const WS_SRC = INDEX_SRC.slice(INDEX_SRC.indexOf('var WorkSchedule = {'));

// ============================================================
// 1. VM: флаги и сплит архива
// ============================================================
describe('Task 508 — VM: _rowArchived/_splitArchived', () => {

    function flagsHost() {
        return new Function('return ({' +
            methodText(CJ_SRC, '_rowArchived') + '\n' +
            methodText(CJ_SRC, '_splitArchived') + '\n});')();
    }

    test('_rowArchived: флаг сервера / колонка «Архив» / пробелы', () => {
        const h = flagsHost();
        assertFalse(h._rowArchived({ num: 1 }), 'без пометки — не архив');
        assertTrue(h._rowArchived({ num: 1, _archived: true }),
            'флаг сервера _archived');
        assertTrue(h._rowArchived({ num: 1, archived: 'Удалён' }),
            'колонка «Архив» = «Удалён»');
        assertTrue(h._rowArchived({ num: 1, archived: true }),
            'булев флаг');
        assertFalse(h._rowArchived({ num: 1, archived: '   ' }),
            'пробелы — НЕ архив (пустая пометка)');
        assertFalse(h._rowArchived(null), 'null — не архив');
    });

    test('_splitArchived: активные/архивные; старый сервер — все активные', () => {
        const h = flagsHost();
        const rows = [
            { num: 1, designation: 'A' },
            { num: 2, designation: 'B', _archived: true, archived: 'Удалён' },
            { num: 3, designation: 'C' },
            { num: 4, designation: 'D', archived: 'Удалён',
              archived_by: 'Иванов', last_editor: 'Петров' }
        ];
        const s = h._splitArchived(rows);
        assertEqual(s.active.length, 2, 'активные');
        assertEqual(s.archived.length, 2, 'архивные');
        assertEqual(s.active[0].designation, 'A', 'порядок сохранён');
        assertEqual(s.archived[1].archived_by, 'Иванов',
            'поля архива в строках');
        // старый сервер (CableJournal.gs до Task 508): строк без
        // пометок нет — все записи активные, поведение прежнее
        const old = h._splitArchived([{ num: 1 }, { num: 2 }]);
        assertEqual(old.active.length, 2, 'старый сервер: все активные');
        assertEqual(old.archived.length, 0, 'старый сервер: архива нет');
        // не-массив — тихо пусто
        const bad = h._splitArchived(null);
        assertEqual(bad.active.length + bad.archived.length, 0,
            'не-массив — без падения');
    });
});

// ============================================================
// 2. SRC: проводка сплита (load/кэши/состояние)
// ============================================================
describe('Task 508 — SRC: сплит в load/кэшах, состояние', () => {

    test('load: сплит полного списка + кэш-ПОЛНЫЙ снапшот', () => {
        const load = methodText(CJ_SRC, 'load');
        assertTrue(load.indexOf('_splitArchived(data.rows || [])') !== -1,
            'load сплитит ответ сервера');
        assertTrue(load.indexOf('self._archivedRows = split.archived;') !== -1,
            'архивные — в _archivedRows');
        assertTrue(load.indexOf(
            'self._persistData(data.rows || [], self._total);') !== -1,
            'кэш — ПОЛНЫЙ снапшот (с архивом: офлайн-Excel их видит)');
        assertTrue(load.indexOf(
            'self._total = data.total || split.active.length;') !== -1,
            'total — активные записи');
    });

    test('_restoreCache/_idbRestore: кэш сплитится тем же путём', () => {
        const rc = methodText(CJ_SRC, '_restoreCache');
        assertTrue(rc.indexOf('this._splitArchived(cached.rows)') !== -1,
            '_restoreCache сплитит');
        assertTrue(rc.indexOf('this._archivedRows = split.archived;') !== -1,
            '_restoreCache: _archivedRows');
        const ir = methodText(CJ_SRC, '_idbRestore');
        assertTrue(ir.indexOf('self._splitArchived(cached.rows)') !== -1,
            '_idbRestore сплитит (KipDB-слой Task 476)');
        assertTrue(ir.indexOf('self._archivedRows = split.archived;') !== -1,
            '_idbRestore: _archivedRows');
    });

    test('состояние: _archivedRows объявлено', () => {
        assertTrue(CJ_SRC.indexOf(
            '_archivedRows: null,  // Task 508') !== -1,
            'поле состояния модуля');
    });
});

// ============================================================
// 3. VM: _excelModel — активные + архив, поиск, сортировка
// ============================================================
describe('Task 508 — VM: _excelModel', () => {

    const ACTIVE = [
        { _row: 2, num: 1, designation: '1/7', start: 'ЩК-4',
          end: 'ЭЩ №4', section: 'по коробу', mark_project: 'КВБбШЭнг-LS',
          cores_project: '14х1', length_project: 60,
          mark_actual: 'КВБбШЭнг-LS', cores_actual: '19х1',
          length_actual: 90, department: 'Водоподготовка',
          purpose: 'Контрольный', last_editor: 'Петров П. П.',
          edited_at: '2026-10-10T06:00:00' },
        { _row: 5, num: 5, designation: '5/2', start: 'ЩСУ-2',
          end: 'Н-1', section: 'по лотку', mark_project: 'КГ',
          cores_project: '3х2,5', length_project: 12,
          mark_actual: 'КГ', cores_actual: '3х2,5',
          length_actual: 12, department: 'Отделение №2',
          purpose: 'Силовой', last_editor: 'Сидоров С. С.',
          edited_at: '2026-10-11T06:00:00' }
    ];
    const ARCH = [
        { _row: 3, num: 2, designation: '2/1', start: 'ЩК-4',
          end: 'КС-1', section: 'по коробу', mark_project: 'КВБбШЭнг-LS',
          cores_project: '27х1', length_project: 43,
          mark_actual: 'КВБбШЭнг-LS', cores_actual: '27х1',
          length_actual: 43.5, department: 'Водоподготовка',
          purpose: 'Контрольный', last_editor: 'Петров П. П.',
          edited_at: '2026-10-09T06:00:00',
          _archived: true, archived: 'Удалён',
          archived_by: 'Иванов И. И.',
          archived_at: '2026-10-12T06:00:00' }
    ];

    function modelHost(docStub, filterStub) {
        return new Function('document', 'kipSearchFilter',
            'return ({' +
            methodText(CJ_SRC, '_excelModel') + '\n' +
            methodText(CJ_SRC, '_rowArchived') + '\n' +
            methodText(CJ_SRC, '_splitArchived') + '\n' +
            methodText(CJ_SRC, '_cjPrintCols') + '\n' +
            methodText(CJ_SRC, '_cjCellVal') + '\n' +
            methodText(CJ_SRC, '_cjFmtNum') + '\n' +
            '_rows: ' + JSON.stringify(ACTIVE) + ',' +
            '_archivedRows: ' + JSON.stringify(ARCH) + ',' +
            '\n});')(docStub, filterStub);
    }

    test('все строки (активные + архив) в порядке № п/п', () => {
        const h = modelHost(undefined, undefined);
        const m = h._excelModel();
        assertEqual(m.rows.length, 3, 'активные + архивные');
        assertEqual(m.archived, 1, 'архивная строка помечена');
        assertEqual(m.total, 3, 'total — все строки модели');
        // сортировка «как в исходном файле»: 1, 2 (архив), 5
        assertEqual(m.rows[0].src.num, 1, 'первая — №1');
        assertEqual(m.rows[1].src.num, 2, 'вторая — №2 (АРХИВНАЯ)');
        assertEqual(m.rows[2].src.num, 5, 'третья — №5');
        assertFalse(m.filtered, 'модель полная (не фильтр)');
    });

    test('поиск применяется и к архиву (Stub kipSearchFilter)', () => {
        // document-стаб: поле поиска с запросом «2/1». В приложении
        // _rows УЖЕ отфильтрован поиском (_applyClientSearch) —
        // имитируем это состояние: активные «1/7»/«5/2» запрос не
        // прошли; проверяем, что АРХИВНЫЕ строки фильтруются тем же
        // запросом (а не вываливаются в Excel все подряд)
        const doc = {
            getElementById: function(id) {
                return id === 'cjSearchInput' ? { value: '2/1' } : null;
            }
        };
        // kipSearchFilter-стаб: подстрока в «haystack»
        const flt = function(rows, q, fieldsOf) {
            return rows.filter(function(r) {
                return (fieldsOf(r) || '').indexOf(q) !== -1;
            });
        };
        const h = new Function('document', 'kipSearchFilter',
            'return ({' +
            methodText(CJ_SRC, '_excelModel') + '\n' +
            methodText(CJ_SRC, '_rowArchived') + '\n' +
            methodText(CJ_SRC, '_splitArchived') + '\n' +
            methodText(CJ_SRC, '_cjPrintCols') + '\n' +
            methodText(CJ_SRC, '_cjCellVal') + '\n' +
            methodText(CJ_SRC, '_cjFmtNum') + '\n' +
            '_rows: [],' +
            '_archivedRows: ' + JSON.stringify(ARCH) + ',' +
            '\n});')(doc, flt);
        const m = h._excelModel();
        // активные «1/7»/«5/2» не содержат «2/1», архивная «2/1» — да
        assertEqual(m.rows.length, 1, 'найдена только архивная «2/1»');
        assertEqual(m.archived, 1, 'архивная строка в экспорте');
    });

    test('без архива модель == активные (старый сервер)', () => {
        const h = new Function('return ({' +
            methodText(CJ_SRC, '_excelModel') + '\n' +
            methodText(CJ_SRC, '_rowArchived') + '\n' +
            methodText(CJ_SRC, '_splitArchived') + '\n' +
            methodText(CJ_SRC, '_cjPrintCols') + '\n' +
            methodText(CJ_SRC, '_cjCellVal') + '\n' +
            methodText(CJ_SRC, '_cjFmtNum') + '\n' +
            '_rows: ' + JSON.stringify(ACTIVE) + ',' +
            '_archivedRows: [],' +
            '\n});')();
        const m = h._excelModel();
        assertEqual(m.rows.length, 2, 'только активные');
        assertEqual(m.archived, 0, 'блока архива не будет');
    });
});

// ============================================================
// 4. VM: Excel-книга — блок «Архив» (и его отсутствие)
// ============================================================
describe('Task 508 — VM: _buildCjWorkbook блок «Архив»', () => {

    const ACTIVE = [
        { _row: 2, num: 1, designation: '1/7', start: 'ЩК-4',
          end: 'ЭЩ №4', section: 'по коробу', mark_project: 'КВБбШЭнг-LS',
          cores_project: '14х1', length_project: 60,
          mark_actual: 'КВБбШЭнг-LS', cores_actual: '19х1',
          length_actual: 90, department: 'Водоподготовка',
          purpose: 'Контрольный', last_editor: 'Петров П. П.',
          edited_at: '2026-10-10' }
    ];
    const ARCH = [
        { _row: 3, num: 2, designation: '2/1', start: 'ЩК-4',
          end: 'КС-1', section: 'по коробу', mark_project: 'КВБбШЭнг-LS',
          cores_project: '27х1', length_project: 43,
          mark_actual: 'КВБбШЭнг-LS', cores_actual: '27х1',
          length_actual: 43.5, department: 'Водоподготовка',
          purpose: 'Контрольный', last_editor: 'Петров П. П.',
          edited_at: '2026-10-09',
          _archived: true, archived: 'Удалён',
          archived_by: 'Иванов И. И.', archived_at: '2026-10-12' }
    ];

    function wsHost() {
        return new Function('return ({' +
            methodText(WS_SRC, '_wsXlsBytes') + '\n' +
            methodText(WS_SRC, '_wsXlsCrc32') + '\n' +
            methodText(WS_SRC, '_wsXlsZip') + '\n' +
            methodText(WS_SRC, '_wsXlsColName') + '\n' +
            methodText(WS_SRC, '_wsXlsEsc') + '\n' +
            methodText(WS_SRC, '_wsXlsDocProps') + '\n' +
            methodText(WS_SRC, '_buildPdfDocument') + '\n' +
            methodText(WS_SRC, '_wsDataUrlBytes') + '\n' +
            methodText(WS_SRC, '_wsDownload') + '\n' +
            '\n});')();
    }

    function cjHost(active, arch, ws) {
        return new Function('WorkSchedule', 'KipToast', 'window', 'document',
            'return ({' +
            methodText(CJ_SRC, '_excelModel') + '\n' +
            methodText(CJ_SRC, '_rowArchived') + '\n' +
            methodText(CJ_SRC, '_splitArchived') + '\n' +
            methodText(CJ_SRC, '_cjPrintCols') + '\n' +
            methodText(CJ_SRC, '_cjArchiveCols') + '\n' +
            methodText(CJ_SRC, '_cjArchDate') + '\n' +
            methodText(CJ_SRC, '_cjCellVal') + '\n' +
            methodText(CJ_SRC, '_cjFmtNum') + '\n' +
            methodText(CJ_SRC, '_buildCjWorkbook') + '\n' +
            methodText(CJ_SRC, '_cjIsoDate') + '\n' +
            '_rows: ' + JSON.stringify(active) + ',' +
            '_archivedRows: ' + JSON.stringify(arch) + ',' +
            '\n});')(ws, undefined, undefined, undefined);
    }

    test('с архивом: блок «Архив» K–O, 7 объединений, «Удалён»', () => {
        const ws = wsHost();
        const h = cjHost(ACTIVE, ARCH, ws);
        const txt = Buffer.from(
            h._buildCjWorkbook(h._excelModel()).bytes).toString('utf8');
        // заголовок блока + подколонки (шапка, 2 строки)
        assertTrue(txt.indexOf('<c r="K1"') !== -1 &&
                   txt.indexOf('>Архив<') !== -1,
            'K1 «Архив» — заголовок блока');
        ['Статус', 'Кем удалён', 'Дата удаления', 'Последний редактор',
         'Дата правки'].forEach(function(lbl) {
            assertTrue(txt.indexOf(lbl) !== -1,
                'подколонка «' + lbl + '» в шапке');
        });
        // объединения: 4 одиночные + 3 пары (вкл. K1:O1) = 7
        assertEqual((txt.match(/<mergeCell /g) || []).length, 7,
            'mergeCells = 7 (было 6 + K1:O1)');
        assertTrue(txt.indexOf('<mergeCells count="7">') !== -1 &&
                   txt.indexOf('<mergeCell ref="K1:O1"/>') !== -1,
            'блок «Архив» объединён K1:O1');
        assertTrue(txt.indexOf('<mergeCell ref="A1:A2"/>') !== -1 &&
                   txt.indexOf('<mergeCell ref="E1:G1"/>') !== -1 &&
                   txt.indexOf('<mergeCell ref="H1:J1"/>') !== -1,
            'объединения шаблона Task 506 живы');
        // архивные данные: статус «Удалён» + кем удалён (L) + даты
        assertTrue(txt.indexOf('>Удалён<') !== -1,
            'статус «Удалён» в данных (заявка: пометка архивного)');
        assertTrue(txt.indexOf('>Иванов И. И.<') !== -1,
            'кем удалён — в данных');
        assertTrue(txt.indexOf('>12.10.2026<') !== -1,
            'дата удаления «ДД.ММ.ГГГГ»');
        assertTrue(txt.indexOf('>Петров П. П.<') !== -1,
            'последний редактор — в данных (активные строки тоже)');
        // ширины блока (K–O)
        assertTrue(txt.indexOf('<col min="11" max="11" width="12"') !== -1,
            'ширина K (Статус)');
        // печать/закрепление не сломаны
        assertTrue(txt.indexOf("'Кабельный журнал'!$1:$2") !== -1,
            'Print_Titles 1:2 (Task 506) жив');
        assertTrue(txt.indexOf(
            '<pane ySplit="2" topLeftCell="A3"') !== -1,
            'закрепление A3 живо');
        // порядок: активная №1 (r3), архивная №2 (r4)
        const i17 = txt.indexOf('>1/7<');
        const i21 = txt.indexOf('>2/1<');
        assertTrue(i17 !== -1 && i21 !== -1 && i17 < i21,
            'порядок № п/п: активная до архивной (сортировка файла)');
    });

    test('без архива: книга ПОСЛОВНО прежняя (Task 506)', () => {
        const ws = wsHost();
        const h = cjHost(ACTIVE, [], ws);
        const txt = Buffer.from(
            h._buildCjWorkbook(h._excelModel()).bytes).toString('utf8');
        assertEqual((txt.match(/<mergeCell /g) || []).length, 6,
            'mergeCells = 6 (как Task 506)');
        assertTrue(txt.indexOf('<mergeCells count="6">') !== -1,
            'count 6');
        assertFalse(txt.indexOf('K1:O1') !== -1,
            'блока «Архив» нет (нет архивных строк)');
        assertFalse(txt.indexOf('Статус') !== -1 &&
                    txt.indexOf('Дата правки') !== -1,
            'подколонок архива нет');
        assertFalse(txt.indexOf('>Удалён<') !== -1, '«Удалён» нет');
        // но «Последний редактор» активных строк — это ДАННЫЕ ячеек
        // (N-колонки нет) — имя редактора не выводится без блока
        assertFalse(txt.indexOf('<c r="N3"') !== -1, 'N-колонки нет');
    });

    test('_saveCjXlsx: Excel строится по _excelModel (фолбэк — печать)', () => {
        const m = methodText(CJ_SRC, '_saveCjXlsx');
        assertTrue(m.indexOf(
            'this._buildCjWorkbook(this._excelModel())') !== -1,
            'основной путь — модель с архивом');
        assertTrue(m.indexOf(
            'try { wb = this._buildCjWorkbook(model); }') !== -1,
            'фолбэк на модель печати при ошибке');
    });
});

// ============================================================
// 5. VM: _cjArchDate — формат дат архива
// ============================================================
describe('Task 508 — VM: _cjArchDate', () => {

    test('ISO/локальная строка → «ДД.ММ.ГГГГ»; мусор — как есть', () => {
        const h = new Function('return ({' +
            methodText(CJ_SRC, '_cjArchDate') + '\n' +
            methodText(CJ_SRC, '_cjFmtNum') + '\n});')();
        // локальная дата без Z — детерминирована в любом TZ
        assertEqual(h._cjArchDate('2026-10-12T00:00:00'), '12.10.2026',
            'локальная ISO-строка');
        assertEqual(h._cjArchDate('2026-01-05T00:00:00'), '05.01.2026',
            'ведущие нули');
        assertEqual(h._cjArchDate(''), '', 'пустая — пусто');
        assertEqual(h._cjArchDate(null), '', 'null — пусто');
        assertEqual(h._cjArchDate('abc'), 'abc', 'не-дата — как есть');
        assertEqual(h._cjArchDate(45), '45', 'число — числом');
    });
});

// ============================================================
// 6. SRC: печать/PDF архива НЕ видят
// ============================================================
describe('Task 508 — SRC: печать/PDF без архива', () => {

    test('_printModel строится ТОЛЬКО по this._rows (активные)', () => {
        const pm = methodText(CJ_SRC, '_printModel');
        assertTrue(pm.indexOf(
            'var srcRows = (this._rows || []).slice();') !== -1,
            'источник — активные строки (архива в _rows нет)');
        assertFalse(pm.indexOf('_archivedRows') !== -1,
            '_printModel не читает _archivedRows');
        assertFalse(pm.indexOf('_excelModel') !== -1,
            '_printModel не вызывает _excelModel');
    });

    test('печатный HTML/PDF не знают про архив', () => {
        const ph = methodText(CJ_SRC, '_buildCjPrintHtml');
        assertFalse(ph.indexOf('archived') !== -1,
            '_buildCjPrintHtml без архивных полей');
        const pdf = methodText(CJ_SRC, '_cjPdfPaintPage');
        assertFalse(pdf.indexOf('archived') !== -1,
            '_cjPdfPaintPage без архивных полей');
    });

    test('_excelModel/_printModel: разные источники', () => {
        const em = methodText(CJ_SRC, '_excelModel');
        assertTrue(em.indexOf('_archivedRows') !== -1,
            '_excelModel подключает архив');
        assertTrue(em.indexOf("typeof kipSearchFilter === 'function'") !== -1,
            'поиск учтён и для архива (тихо без глобала)');
    });
});

// ============================================================
// 7. SRC: тексты удаления (архив)
// ============================================================
describe('Task 508 — SRC: тексты удаления', () => {

    test('confirmDelete: предупреждение про архив', () => {
        const m = methodText(CJ_SRC, 'confirmDelete');
        assertTrue(m.indexOf('архиве журнала с пометкой «Удалён»') !== -1,
            'диалог честно говорит про архив');
        assertFalse(m.indexOf('нельзя отменить') !== -1,
            'старый текст снят');
    });

    test('submitDelete: тост про архив', () => {
        const m = methodText(CJ_SRC, 'submitDelete');
        assertTrue(m.indexOf('Запись удалена — в архиве журнала') !== -1,
            'тост упоминает архив');
    });
});

// ============================================================
// 8. СЕРВЕР: scripts/CableJournal.gs (файл-эталон Task 508)
// ============================================================
describe('Task 508 — СЕРВЕР: CableJournal.gs', () => {

    test('SCHEMA: 5 колонок архива P–T (readOnly)', () => {
        const keys = ['last_editor', 'edited_at', 'archived',
                      'archived_by', 'archived_at'];
        keys.forEach(function(k, i) {
            const col = 16 + i;
            const needle = "key: '" + k + "'";
            assertTrue(GS_SRC.indexOf(needle) !== -1,
                'SCHEMA содержит ' + k);
            const seg = GS_SRC.slice(GS_SRC.indexOf(needle) - 40,
                                     GS_SRC.indexOf(needle) + 200);
            assertTrue(seg.indexOf('col: ' + col + ',') !== -1,
                k + ' — колонка ' + col + ' (' +
                'ABCDEFGHIJKLMNOPQRST'[col - 1] + ')');
            assertTrue(seg.indexOf('readOnly: true') !== -1,
                k + ' — readOnly (клиент не редактирует)');
        });
        assertTrue(GS_SRC.indexOf('ARCHIVE_HEADERS') !== -1,
            'заголовки блока архива описаны');
    });

    test('_userName: name из users KIP8_Access, фолбэк email', () => {
        const i = GS_SRC.indexOf('_userName: function');
        assertTrue(i !== -1, 'метод есть');
        const seg = GS_SRC.slice(i, i + 700);
        assertTrue(seg.indexOf('user.name') !== -1,
            'читает столбец name таблицы users');
        assertTrue(seg.indexOf('user.email') !== -1,
            'фолбэк на email (архив не безымянный)');
    });

    test('appendRow: создатель → «Последний редактор»', () => {
        const seg = GS_SRC.slice(
            GS_SRC.indexOf("col.key === 'last_editor'") - 100,
            GS_SRC.indexOf("col.key === 'last_editor'") + 400);
        assertTrue(seg.indexOf("_userName(user)") !== -1,
            'P = name пользователя');
        assertTrue(GS_SRC.indexOf("col.key === 'edited_at'") !== -1,
            'Q = дата правки');
    });

    test('updateRow: правка фиксирует редактора (P/Q)', () => {
        const seg = GS_SRC.slice(
            GS_SRC.indexOf('getRange(row, 16).setValue(this._userName(user));') - 300,
            GS_SRC.indexOf('getRange(row, 16).setValue(this._userName(user));') + 300);
        assertTrue(seg.indexOf('getRange(row, 16)') !== -1,
            'колонка 16 (редактор)');
        assertTrue(seg.indexOf('getRange(row, 17)') !== -1,
            'колонка 17 (дата правки)');
    });

    test('deleteRow: НЕ sheet.deleteRow — архив «Удалён»', () => {
        const i = GS_SRC.indexOf('deleteRow: function');
        const end = GS_SRC.indexOf(
            'return { ok: true, num: recordNum, archived: true };');
        const seg = GS_SRC.slice(i, end > i ? end + 100 : i + 4000);
        // вызов физического удаления отсутствует: единственное
        // упоминание sheet.deleteRow(row) — в ПОЯСНИТЕЛЬНОМ
        // комментарии Task 508 («НЕ sheet.deleteRow(row)»)
        const calls = (seg.match(/sheet\.deleteRow\(row\)/g) || []).length;
        assertEqual(calls, 1,
            'упоминание только в комментарии (вызова НЕТ)');
        assertTrue(seg.indexOf('// Task 508: НЕ sheet.deleteRow(row)') !== -1,
            'пометка Task 508 у снятого вызова');
        assertTrue(seg.indexOf("getRange(row, 18).setValue('Удалён')") !== -1,
            'R = «Удалён» (причина архива)');
        assertTrue(seg.indexOf('getRange(row, 19).setValue(who)') !== -1,
            'S = кем удалён');
        assertTrue(seg.indexOf('getRange(row, 20).setValue(new Date())') !== -1,
            'T = дата удаления');
        assertTrue(seg.indexOf('archived: true') !== -1,
            'ответ помечает архивацию');
    });

    test('_rowToObject: флаг _archived; list: archivedTotal', () => {
        const ro = GS_SRC.slice(GS_SRC.indexOf('_rowToObject: function'),
                                GS_SRC.indexOf('getColumns: function'));
        assertTrue(ro.indexOf('obj._archived') !== -1,
            'каждая строка получает флаг');
        const li = GS_SRC.slice(GS_SRC.indexOf('list: function'),
                                GS_SRC.indexOf('getFilters: function'));
        assertTrue(li.indexOf('archivedTotal') !== -1,
            'list отдаёт archivedTotal');
        assertTrue(li.indexOf('_archived') !== -1,
            'list НЕ выфильтровывает архив (клиент решает)');
    });

    test('getFilters: архивные строки пропускаются', () => {
        const gf = GS_SRC.slice(GS_SRC.indexOf('getFilters: function'),
                                GS_SRC.indexOf('appendRow: function'));
        assertTrue(gf.indexOf('values[i][17]') !== -1,
            'проверка колонки R (18) — скип архивных');
    });

    test('_ensureArchiveColumns: колонки/заголовки создаются сами', () => {
        const i = GS_SRC.indexOf('_ensureArchiveColumns: function');
        assertTrue(i !== -1, 'метод есть');
        const seg = GS_SRC.slice(i, i + 1500);
        assertTrue(seg.indexOf('insertColumnsAfter') !== -1,
            'расширение листа при maxColumns < 20');
        assertTrue(seg.indexOf('setValues([out])') !== -1,
            'заголовки P1:T1 дописываются (пустые — только)');
        assertTrue(GS_SRC.indexOf('this._ensureArchiveColumns(sheet);') !== -1,
            'вызывается из _openSheet (каждый метод)');
    });
});

// ============================================================
// 9. sync-cables.py + SW
// ============================================================
describe('Task 508 — sync-cables.py + SW', () => {

    test('снимок cables.json: архивные строки НЕ попадают', () => {
        assertTrue(SYNC_SRC.indexOf("record.get('Архив', '')") !== -1,
            'проверка колонки «Архив»');
        assertTrue(SYNC_SRC.indexOf('skipped += 1\n            continue') !== -1,
            'архивные строки пропускаются');
    });

    test('SW: kipia-test-v758', () => {
        assertTrue(SW_SRC.indexOf(
            "CACHE_VERSION = 'kipia-test-v758'") !== -1,
            'версия кэша kipia-test-v758');
        assertFalse(SW_SRC.indexOf('kipia-test-v759') !== -1,
            'двойного бампа нет (v731 отсутствует)');
        assertTrue(SW_SRC.indexOf('Task 508') !== -1,
            'комментарий Task 508 в sw.js');
    });
});
