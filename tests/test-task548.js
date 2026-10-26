// tests/test-task548.js
// Task 548 — заявка: «Я поставил вручную у сменного работника
// выходной день и поэтому автоматическая расстановка подменных
// смен за отпускника сместилась на другого работника, предлагаю,
// что бы избежать в будущем такие накладки, сделать возможность
// очистки ячеек шахматки от ручных правок, для того, что бы
// автоматическая логика срабатывала более точнее.»
//
// СЦЕНАРИЙ (накладка): ручная запись в ячейке кандидата подмены
// (ручной «выходной») занимает клетку → _autoDnPlan (Task 456)
// видит «ячейка занята» → подмена «д»/«н» смещается на другого
// работника (или не ставится вовсе). Инструмент «Удалить запись»
// (Task 251) чистит ПОКЛЕТОЧНО, а на материализованных авто-
// «д»/«н» (Task 458) оставляет «.»-надгробие — ячейка навсегда
// выпадает из авто-расстановки.
//
// ЧТО СДЕЛАНО (КЛИЕНТ — WorkSchedule.gs НЕ менялся):
//   • кнопка «Очистить правки» (#wsClearManualBtn, ряд 3
//     #wsActionsRow после «Отменить»; только редакторам — init +
//     _onRoleUpdate): сброс РУЧНЫХ правок месяца к авто-состоянию;
//   • clearManualEdits: серверные записи «руч» (вкл. материализо-
//     ванные авто-«д»/«н» и «.»-надгробия) → __delete БЕЗ надгробий
//     с снятием меток реестра ws_auto_dn_keys — план расставит
//     подмены заново после «Сохранить» (loadGrid → _renderGrid →
//     материализация); несохранённые правки поверх авто/локальные/
//     материализации — снимаются; записи «авто» и таб-номера ВНЕ
//     справочника (архив) не трогаются; уже запланированные
//     __delete не пересчитываются (идемпотентность счётчика);
//   • подтверждение kipConfirm danger со счётчиком; тосты
//     «нечего очищать» / «Очищено правок: N» с подсказкой про
//     «Сформировать» (ручные записи на плановых сменах — детект
//     _plannedShiftAt).
//
// Запуск: через tests/run-all.js (require './test-task548.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
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
// 1. SRC — разметка кнопки и гварды видимости
// ============================================================
describe('Task 548 — SRC: кнопка «Очистить правки»', () => {

    test('кнопка в ряду действий, после «Отменить», скрыта по умолчанию', () => {
        const row = between(INDEX_SRC, 'id="wsActionsRow"', 'Task 315: окно 2 бара');
        const iCancel = row.indexOf('id="wsCancelBtn"');
        const iClear = row.indexOf('id="wsClearManualBtn"');
        assertTrue(iCancel !== -1 && iClear !== -1 && iCancel < iClear,
            'кнопка стоит после «Отменить» в #wsActionsRow');
        assertTrue(row.indexOf('onclick="WorkSchedule.clearManualEdits()"') !== -1,
            'onclick → clearManualEdits');
        const btn = between(row, 'id="wsClearManualBtn"', '</button>');
        assertTrue(/\shidden\b/.test(btn), 'hidden по умолчанию (как «Сформировать»)');
        assertTrue(row.indexOf('>Очистить правки</button>') !== -1,
            'подпись — «Очистить правки»');
    });

    test('стиль деструктивный — семейство «Отменить»', () => {
        const row = between(INDEX_SRC, 'id="wsActionsRow"', 'Task 315: окно 2 бара');
        const btn = between(row, '<button type="button" id="wsClearManualBtn"', '</button>');
        assertTrue(btn.indexOf('ws-cancel-btn') !== -1,
            'класс ws-cancel-btn (приглушённо-красная, как «Отменить»)');
        assertTrue(btn.indexOf('ws-clear-manual-btn') !== -1,
            'собственный модификатор ws-clear-manual-btn');
    });

    test('init: кнопка видна только редакторам', () => {
        const blk = between(INDEX_SRC, "var genBtn = document.getElementById('wsGenerateBtn');\n            if (genBtn) genBtn.hidden = !this._canEdit;",
                             'Task 385 → 395');
        assertTrue(blk.indexOf("var clearBtnInit = document.getElementById('wsClearManualBtn');") !== -1 &&
                   blk.indexOf('clearBtnInit.hidden = !this._canEdit;') !== -1,
            'гвард init рядом с «Сформировать»');
    });

    test('_onRoleUpdate: гвард повторяется (роль позже init)', () => {
        const blk = between(INDEX_SRC, "var genBtn = document.getElementById('wsGenerateBtn');\n            if (genBtn) genBtn.hidden = !newCanEdit;",
                             'Task 385 → 395');
        assertTrue(blk.indexOf("var clearMnlBtn = document.getElementById('wsClearManualBtn');") !== -1 &&
                   blk.indexOf('clearMnlBtn.hidden = !newCanEdit;') !== -1,
            'гвард _onRoleUpdate рядом с «Сформировать»');
    });

    test('заявка процитирована в комментарии кнопки', () => {
        assertTrue(INDEX_SRC.indexOf('очистки ячеек шахматки от ручных') !== -1,
            'текст замечания пользователя сохранён в разметке');
    });
});

// ============================================================
// 2. SRC — метод clearManualEdits (семантика чистки)
// ============================================================
describe('Task 548 — SRC: clearManualEdits', () => {
    const M = methodText(WS_SRC, 'clearManualEdits');

    test('гварды: только редактор и не во время сохранения', () => {
        assertTrue(M.indexOf('if (!this._canEdit || this._saving) return;') !== -1,
            'зрители и _saving заблокированы');
    });

    test('чистятся ТОЛЬКО записи «руч» — «авто» неприкосновенны', () => {
        assertTrue(M.indexOf("!== 'руч') continue;") !== -1,
            'фильтр источника: мимо всего не-«руч» (слой генерации)');
    });

    test('архивные таб-номера не чистятся вслепую', () => {
        assertTrue(M.indexOf('!tabs[tabE]) continue;') !== -1,
            'записи табов вне справочника пропускаются');
        assertTrue(M.indexOf('if (srv && !tabs[parts[1]]) continue;') !== -1,
            'правки поверх авто-записей архивных табов тоже');
    });

    test('ручные записи → __delete (реальное удаление при «Сохранить»)', () => {
        assertTrue(M.indexOf('self._PENDING[k] = { __delete: true };') !== -1,
            'план удаления через deleteEntry-путь saveAll');
    });

    test('НАДГРОБИЙ НЕТ: материализованные «д»/«н» освобождают ячейку', () => {
        assertTrue(M.indexOf("'статус': '.'") === -1,
            'метод НЕ ставит «.»-надгробие (иначе план не расставит заново)');
        assertTrue(M.indexOf('self._autoDnUnmark(k);') !== -1,
            'метка реестра снимается при удалении записи');
        assertTrue(M.indexOf('self._autoDnUnmark(dropPend[d]);') !== -1,
            '…и при снятии несохранённой материализации');
    });

    test('идемпотентность счётчика: запланированные __delete не пересчитываются', () => {
        assertTrue(M.indexOf('if (pend[keyE] && pend[keyE].__delete) continue;') !== -1,
            'свип Task 547 / пользовательские удаления не дублируются');
    });

    test('правки поверх ручной записи заменяются удалением записи', () => {
        assertTrue(M.indexOf("=== 'руч') continue;") !== -1,
            'в цикле правок: поверх «руч» запись уже под удалением');
    });

    test('пустой месяц — честный отказ без диалога', () => {
        assertTrue(M.indexOf('Ручных правок в месяце нет — очищать нечего') !== -1,
            'тост-отказ');
    });

    test('подтверждение kipConfirm danger со счётчиком', () => {
        assertTrue(M.indexOf("title: 'Очистка ручных правок'") !== -1,
            'заголовок диалога');
        assertTrue(M.indexOf("okText: 'Очистить правки', danger: true") !== -1,
            'danger-кнопка OK');
        assertTrue(M.indexOf("'Очистить ручные правки месяца — ' + n") !== -1,
            'счётчик N в сообщении');
        assertTrue(M.indexOf('записи «авто» не затрагиваются') !== -1,
            'предупреждение про слой генерации');
    });

    test('детект плановых смен → подсказка «Сформировать»', () => {
        assertTrue(M.indexOf('this._plannedShiftAt(dateE, tabs[tabE])') !== -1,
            'плановая смена дня записи проверяется');
        assertTrue(M.indexOf('восстановит плановые смены') !== -1,
            'тост/диалог упоминают «Сформировать»');
    });

    test('итоговый тост со счётчиком и «Сохранить»', () => {
        assertTrue(M.indexOf("'Очищено правок: ' + n + ' — нажмите «Сохранить»'") !== -1,
            'тост «Очищено правок: N — нажмите «Сохранить»»');
        assertTrue(M.indexOf('подмены расставятся заново') !== -1,
            'без regen — подсказка про авто-подмены');
    });

    test('сетка и кнопки обновляются после чистки', () => {
        assertTrue(M.indexOf('self._updateSaveBtn();') !== -1 &&
                   M.indexOf('self._renderGrid();') !== -1,
            '_updateSaveBtn + _renderGrid (как cancelAll)');
    });

    test('метод объявлен в модуле WorkSchedule', () => {
        assertTrue(extractMethod(WS_SRC, 'clearManualEdits') !== null,
            'clearManualEdits: function присутствует');
    });
});

// ============================================================
// 3. VM — поведение на хосте из реальных методов
// ============================================================
// Геометрия (цикл 4: Д/Н/—/—, как Task 547):
//   017 старт 01.09: 01 Д, 02 Н, 03/04 вых., 05 Д, 06 Н — ОТПУСК 05–06
//   023 старт 02.09: 02 Д, 03 Н, 04 вых., 05 ВЫХ (кандидат «д»), 06 Д
//   031 старт 04.09: 04 Д, 05 Н (работает), 06 ВЫХ (кандидат «н»), 07 вых.
//   041 старт 02.09: как 023 — второй кандидат «д» 05-го (после 023)
// Накладка заявки: ручной «В» 023 на 05-е занял ячейку → план
// сместил «д» на 041. «н» 031 на 06-м — на своём месте.
describe('Task 548 — VM: clearManualEdits', () => {

    const PAT = { id: 1, cycle: 4,
                  days: [{ day: 1, status: 'Д' }, { day: 2, status: 'Н' }] };
    const EMPS = [
        { 'таб_номер': '017', 'тип': 'сменный', 'шаблон_ротации': 1, 'старт_цикла': '2026-09-01' },
        { 'таб_номер': '023', 'тип': 'сменный', 'шаблон_ротации': 1, 'старт_цикла': '2026-09-02' },
        { 'таб_номер': '031', 'тип': 'сменный', 'шаблон_ротации': 1, 'старт_цикла': '2026-09-04' },
        { 'таб_номер': '041', 'тип': 'сменный', 'шаблон_ротации': 1, 'старт_цикла': '2026-09-02' }
    ];
    const DEF_ENTRIES = [
        { 'дата': '2026-09-05', 'таб_номер': '017', 'статус': 'ОТ', 'источник': 'авто' },
        { 'дата': '2026-09-06', 'таб_номер': '017', 'статус': 'ОТ', 'источник': 'авто' },
        { 'дата': '2026-09-01', 'таб_номер': '017', 'статус': 'Д', 'источник': 'авто' },
        { 'дата': '2026-09-05', 'таб_номер': '031', 'статус': 'Н', 'источник': 'авто' },
        { 'дата': '2026-09-06', 'таб_номер': '023', 'статус': 'Д', 'источник': 'авто' },
        { 'дата': '2026-09-05', 'таб_номер': '023', 'статус': 'В', 'источник': 'руч' },
        { 'дата': '2026-09-05', 'таб_номер': '041', 'статус': 'д', 'источник': 'руч' },
        { 'дата': '2026-09-06', 'таб_номер': '031', 'статус': 'н', 'источник': 'руч' }
    ];
    const DEF_KEYS = { '2026-09': { '2026-09-05|041': 1, '2026-09-06|031': 1 } };

    function host(opts) {
        opts = opts || {};
        const entries = opts.entries !== undefined ? opts.entries : DEF_ENTRIES;
        const confirms = [];
        const toasts = [];
        const mockConfirm = function(msg) {
            confirms.push(String(msg));
            return opts.confirmResult !== false;
        };
        const mockToast = { show: function(t) { toasts.push(String(t)); } };
        const h = new Function('kipConfirm', 'confirm', 'KipToast',
            'return ({' +
            methodText(WS_SRC, 'clearManualEdits') + ',' +
            methodText(WS_SRC, '_serverEntry') + ',' +
            methodText(WS_SRC, '_plannedShiftAt') + ',' +
            methodText(WS_SRC, '_parseIsoLocal') + ',' +
            methodText(WS_SRC, '_plural') + ',' +
            methodText(WS_SRC, '_autoDnIsKey') + ',' +
            methodText(WS_SRC, '_autoDnUnmark') + ',' +
            methodText(WS_SRC, '_autoDnKeysSave') + ',' +
            '_canEdit: ' + (opts.canEdit !== undefined ? opts.canEdit : true) + ',' +
            '_saving: ' + (opts.saving ? 'true' : 'false') + ',' +
            '_year: 2026, _month: 9,' +
            '_EMPLOYEES: ' + JSON.stringify(opts.employees !== undefined ? opts.employees : EMPS) + ',' +
            '_PATTERNS: ' + JSON.stringify([PAT]) + ',' +
            '_ENTRIES: ' + JSON.stringify(entries) + ',' +
            '_PENDING: ' + JSON.stringify(opts.pending || {}) + ',' +
            '_AUTO_DN_KEYS: ' + JSON.stringify(opts.keys !== undefined ? opts.keys : DEF_KEYS) + ',' +
            '_updateSaveBtn: function(){ this.__upd = (this.__upd || 0) + 1; },' +
            '_renderGrid: function(){ this.__rend = (this.__rend || 0) + 1; },' +
            '});')(opts.kipConfirm, mockConfirm, mockToast);
        h.__confirms = confirms;
        h.__toasts = toasts;
        return h;
    }

    test('ручные записи → __delete, авто не тронуты (сценарий заявки)', () => {
        const h = host({});
        h.clearManualEdits();
        assertEqual(h._PENDING['2026-09-05|023'] && h._PENDING['2026-09-05|023'].__delete, true,
            'ручной «В» 023 05-го под удалением');
        assertEqual(h._PENDING['2026-09-05|041'] && h._PENDING['2026-09-05|041'].__delete, true,
            'сместившаяся «д» 041 05-го под удалением');
        assertEqual(h._PENDING['2026-09-06|031'] && h._PENDING['2026-09-06|031'].__delete, true,
            '«н» 031 06-го под удалением');
        assertEqual(h._PENDING['2026-09-01|017'], undefined, 'авто «Д» 017 не тронута');
        assertEqual(h._PENDING['2026-09-05|031'], undefined, 'авто «Н» 031 не тронута');
        assertEqual(h._PENDING['2026-09-06|023'], undefined, 'авто «Д» 023 не тронута');
        assertEqual(h.__confirms.length, 1, 'диалог подтверждения показан');
    });

    test('подтверждение содержит счётчик 3 и словоформы', () => {
        const h = host({});
        h.clearManualEdits();
        const msg = h.__confirms[0] || '';
        assertTrue(msg.indexOf('— 3') !== -1, 'счётчик N=3 (3 ручные записи): ' + msg);
        assertTrue(msg.indexOf('записи на сервере') !== -1, 'форма «записи на сервере»');
        assertTrue(msg.indexOf('«авто» не затрагиваются') !== -1, 'предупреждение про авто');
    });

    test('реестр авто-«д»/«н» очищается — БЕЗ надгробий', () => {
        const h = host({});
        h.clearManualEdits();
        assertEqual(h._AUTO_DN_KEYS['2026-09']['2026-09-05|041'], undefined,
            'метка 05|041 снята');
        assertEqual(h._AUTO_DN_KEYS['2026-09']['2026-09-06|031'], undefined,
            'метка 06|031 снята');
        assertEqual(h._PENDING['2026-09-05|041']['статус'], undefined,
            'правка удаления НЕ несёт статус (не «.»-надгробие)');
    });

    test('тост «Очищено правок: 3» + «Сохранить»; план расставит заново', () => {
        const h = host({});
        h.clearManualEdits();
        const t = h.__toasts[h.__toasts.length - 1] || '';
        assertTrue(t.indexOf('Очищено правок: 3') !== -1, 'счётчик в тосте: ' + t);
        assertTrue(t.indexOf('Сохранить') !== -1, 'подсказка про «Сохранить»');
        assertTrue(t.indexOf('подмены расставятся заново') !== -1,
            'подмена вернётся авто-логикой (реген не нужен — записи на выходных)');
        assertTrue(h.__upd >= 1 && h.__rend >= 1, '_updateSaveBtn и _renderGrid вызваны');
    });

    test('идемпотентность: повторная чистка — «нечего очищать»', () => {
        const h = host({});
        h.clearManualEdits();
        h.clearManualEdits();
        assertEqual(h.__confirms.length, 1, 'второй диалог НЕ показан');
        const t = h.__toasts[h.__toasts.length - 1] || '';
        assertTrue(t.indexOf('очищать нечего') !== -1, 'честный отказ: ' + t);
        assertEqual(h._PENDING['2026-09-05|023'] && h._PENDING['2026-09-05|023'].__delete, true,
            'план удалений не продублирован');
    });

    test('запланированное свипом __delete не пересчитывается', () => {
        const h = host({
            pending: { '2026-09-06|031': { __delete: true, __autoStale: true } }
        });
        h.clearManualEdits();
        // 06|031 уже под удалением — в счётчик только «В» 023 и «д» 041
        const msg = h.__confirms[0] || '';
        assertTrue(msg.indexOf('— 2') !== -1, 'счётчик без уже запланированных: ' + msg);
        assertEqual(h._PENDING['2026-09-06|031'].__autoStale, true,
            'флаг свипа не затёрт (правка не перезаписана)');
    });

    test('локальная правка без записи снимается', () => {
        const h = host({
            pending: { '2026-09-07|041': { 'статус': 'Б', 'переработка': 0,
                                           'замещает': null, 'комментарий': '' } }
        });
        h.clearManualEdits();
        assertEqual(h._PENDING['2026-09-07|041'], undefined,
            'несохранённая правка снята (ячейка пустая)');
        const msg = h.__confirms[0] || '';
        assertTrue(msg.indexOf('несохранённая правка') !== -1,
            'счётчик правок в диалоге: ' + msg);
    });

    test('правка поверх АВТО-записи снимается — авто жива', () => {
        const h = host({
            pending: { '2026-09-01|017': { 'статус': 'Б', 'переработка': 0,
                                           'замещает': null, 'комментарий': '' } }
        });
        h.clearManualEdits();
        assertEqual(h._PENDING['2026-09-01|017'], undefined, 'правка поверх авто снята');
        // авто-запись остаётся источником истины ячейки
        const srv = h._serverEntry('2026-09-01', '017');
        assertEqual(srv && srv['источник'], 'авто', 'авто-смена 017 01-го не тронута');
    });

    test('правка поверх РУЧНОЙ записи заменяется удалением записи', () => {
        const h = host({
            pending: { '2026-09-05|023': { 'статус': 'Б', 'переработка': 0,
                                           'замещает': null, 'комментарий': '' } }
        });
        h.clearManualEdits();
        assertEqual(h._PENDING['2026-09-05|023'] && h._PENDING['2026-09-05|023'].__delete, true,
            'ручная запись под удалением (правка не мешает)');
    });

    test('несохранённая материализация __autoDn снимается с меткой', () => {
        const h = host({
            entries: DEF_ENTRIES.filter(function(e) {
                return !(e['дата'] === '2026-09-05' && e['таб_номер'] === '041');
            }),
            pending: { '2026-09-05|041': { 'статус': 'д', 'переработка': 0,
                                           'замещает': null, 'комментарий': '',
                                           '__autoDn': 1 } },
            keys: { '2026-09': { '2026-09-05|041': 1, '2026-09-06|031': 1 } }
        });
        h.clearManualEdits();
        assertEqual(h._PENDING['2026-09-05|041'], undefined,
            'материализация снята (план расставит заново)');
        assertEqual(h._AUTO_DN_KEYS['2026-09']['2026-09-05|041'], undefined,
            'метка реестра снята');
    });

    test('архивный таб-номер не чистится вслепую', () => {
        const h = host({
            entries: DEF_ENTRIES.concat([
                { 'дата': '2026-09-05', 'таб_номер': '099', 'статус': 'Б', 'источник': 'руч' }
            ])
        });
        h.clearManualEdits();
        assertEqual(h._PENDING['2026-09-05|099'], undefined,
            'запись таба вне справочника не тронута');
        const msg = h.__confirms[0] || '';
        assertTrue(msg.indexOf('— 3') !== -1, 'архив не входит в счётчик: ' + msg);
    });

    test('пустой месяц — отказ без диалога', () => {
        const h = host({
            entries: DEF_ENTRIES.filter(function(e) {
                return e['источник'] !== 'руч';
            })
        });
        h.clearManualEdits();
        assertEqual(h.__confirms.length, 0, 'kipConfirm НЕ вызван');
        const t = h.__toasts[h.__toasts.length - 1] || '';
        assertTrue(t.indexOf('очищать нечего') !== -1, 'тост-отказ: ' + t);
        assertEqual(Object.keys(h._PENDING).length, 0, 'правок не появилось');
    });

    test('отказ в подтверждении — ничего не меняется', () => {
        const h = host({ confirmResult: false });
        h.clearManualEdits();
        assertEqual(Object.keys(h._PENDING).length, 0, '_PENDING пуст');
        assertEqual(h._AUTO_DN_KEYS['2026-09']['2026-09-05|041'], 1,
            'реестр цел');
        assertEqual(h.__upd, undefined, 'кнопки не трогались');
    });

    test('зритель заблокирован', () => {
        const h = host({ canEdit: false });
        h.clearManualEdits();
        assertEqual(h.__confirms.length, 0, 'диалога нет');
        assertEqual(h.__toasts.length, 0, 'тостов нет');
        assertEqual(Object.keys(h._PENDING).length, 0, 'правок нет');
    });

    test('во время пакетного сохранения — блок', () => {
        const h = host({ saving: true });
        h.clearManualEdits();
        assertEqual(h.__confirms.length, 0, 'диалога нет при _saving');
        assertEqual(Object.keys(h._PENDING).length, 0, 'правок нет');
    });

    test('ручная запись на ПЛАНОВОЙ СМЕНЕ → подсказка «Сформировать»', () => {
        const h = host({
            // «Б» 017 на 02-м — день плановой «Н» (цикл 4 от 01.09)
            entries: [
                { 'дата': '2026-09-02', 'таб_номер': '017', 'статус': 'Б', 'источник': 'руч' }
            ].concat(DEF_ENTRIES)
        });
        h.clearManualEdits();
        const msg = h.__confirms[0] || '';
        assertTrue(msg.indexOf('«Сформировать»') !== -1,
            'диалог предупреждает про восстановление смен: ' + msg);
        const t = h.__toasts[h.__toasts.length - 1] || '';
        assertTrue(t.indexOf('«Сформировать» восстановит плановые смены') !== -1,
            'тост с подсказкой: ' + t);
    });

    test('ветка kipConfirm: danger-диалог, применение после resolve', async () => {
        const optsSeen = [];
        const kipMock = function(msg, opts) {
            optsSeen.push({ msg: String(msg), opts: opts });
            return Promise.resolve(true);
        };
        const h = host({ kipConfirm: kipMock });
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        assertEqual(optsSeen.length, 1, 'kipConfirm вызван однажды');
        assertEqual(optsSeen[0].opts.danger, true, 'danger: true');
        assertEqual(optsSeen[0].opts.title, 'Очистка ручных правок', 'заголовок');
        assertEqual(optsSeen[0].opts.okText, 'Очистить правки', 'текст OK-кнопки');
        assertEqual(h._PENDING['2026-09-05|023'] && h._PENDING['2026-09-05|023'].__delete, true,
            'после подтверждения ручные под удалением');
    });

    test('сценарий заявки: после чистки ячейка 023 снова кандидат', () => {
        // ЧИСТКА освобождает ячейку 023 05-го; план Task 456 на
        // перерисовке после «Сохранить» ставит «д» обратно 023
        // (приоритет: у 023 и 041 нет «д»/«н» в месяце — порядок
        // списка, 023 раньше). Проверяем предусловия плана:
        const h = host({});
        h.clearManualEdits();
        // эффективное состояние 05|023 — пусто (запись под __delete)
        const eff = (typeof h._effectiveEntry === 'function')
            ? null : null; // _effectiveEntry не в хосте — проверяем руками:
        const srv023 = h._serverEntry('2026-09-05', '023');
        const pend023 = h._PENDING['2026-09-05|023'];
        assertTrue(!!srv023 && !!pend023 && !!pend023.__delete,
            'запись жива на сервере, правка планирует удаление');
        // 05.09 для 023 — плановый ВЫХОДНОЙ цикла (кандидат подмены)
        const plan023 = h._plannedShiftAt('2026-09-05',
            h._EMPLOYEES.filter(function(e) { return e['таб_номер'] === '023'; })[0]);
        assertEqual(plan023, '', '05-е у 023 — плановый выходной (кандидат «д»)');
        // отпускник 017: плановая смена «Д» 05-го — спрос жив
        const plan017 = h._plannedShiftAt('2026-09-05',
            h._EMPLOYEES.filter(function(e) { return e['таб_номер'] === '017'; })[0]);
        assertEqual(plan017, 'Д', '05-е у 017 — плановая «Д» (спрос подмены)');
    });
});

// регресс-санитар: у тестов заявки НЕТ мутированных глобалов
describe('Task 548 — санитар', () => {
    test('заявка-цитата в шапке теста', () => {
        assertTrue(fs.readFileSync(__filename, 'utf8')
                       .indexOf('очистки ячеек шахматки от ручных правок') !== -1,
            'текст замечания пользователя сохранён в тесте');
    });

    test('СЕРВЕР не менялся — WorkSchedule.gs без Task 548', () => {
        const gs = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');
        assertTrue(gs.indexOf('Task 548') === -1,
            'задача чисто клиентская: серверный деплой не нужен');
    });
});
