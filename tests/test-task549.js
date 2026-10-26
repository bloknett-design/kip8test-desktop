// tests/test-task549.js
// Task 549 — заявка: «В диалоговом окне подтверждения удаления
// ручных правок сделай возможность удаления каждой правки по
// отдельности с кратким наименованием правок (пример краткого
// содержания — работник/дата правки/наименование правки)».
//
// ЧТО СДЕЛАНО (КЛИЕНТ — WorkSchedule.gs НЕ менялся):
//   • НОВЫЙ диалог kipConfirmList (общий оверлей/анимация
//     kipConfirm): СПИСОК чекбоксов — по строке на каждую правку,
//     «Выбрать все / Снять все», счётчик «Выбрано: N из M», блок
//     OK при пустой выборке, Escape — отмена; промис → массив
//     выбранных id / null;
//   • clearManualEdits (Task 548) строит строки диалога:
//     «РАБОТНИК · ДАТА · НАИМЕНОВАНИЕ ПРАВКИ» (ФИО справочника,
//     дата ячейки dd.mm.гггг, краткое обозначение кода из
//     «Коды_статусов»; неизвестный код → «код «X»», «.»/пусто →
//     «Выходной») + серым тип правки («ручная запись на сервере» /
//     «несохранённая правка» / «авто-подмена, материализована»)
//     и комментарий (≤40 симв.); порядок — по дате, затем табу;
//   • OK применяется ТОЛЬКО к отмеченным (галочки по одной),
//     тост «Очищено правок: N» — по выборке; реестр ws_auto_dn_keys
//     снимается только у выбранных; отмена — ничего не меняется;
//   • фолбэк-среды без kipConfirmList — прежний kipConfirm danger
//     со счётчиком, очистка ВСЕГО (обратная совместимость 548).
//
// Запуск: через tests/run-all.js (require './test-task549.js').

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
// 1. SRC — диалог kipConfirmList (разметка/поведение/стили)
// ============================================================
describe('Task 549 — SRC: kipConfirmList', () => {

    test('функция объявлена рядом с kipConfirm/kipPrompt', () => {
        const i = INDEX_SRC.indexOf('function kipConfirmList(msg, items, opts)');
        assertTrue(i !== -1, 'function kipConfirmList(msg, items, opts) существует');
        const iConfirm = INDEX_SRC.indexOf('function kipConfirm(');
        const iPrompt = INDEX_SRC.indexOf('function kipPrompt(');
        assertTrue(iConfirm !== -1 && iPrompt !== -1 && i > iPrompt,
            'после kipPrompt (семейство кастомных диалогов)');
    });

    test('строка списка: чекбокс с data-id + label + sub', () => {
        const f = between(INDEX_SRC, 'function kipConfirmList(', 'КОНВЕРТЕРЫ (полные данные)');
        assertTrue(f.indexOf('<label class="kip-dialog-item">') !== -1,
            'строка — label.kip-dialog-item');
        assertTrue(f.indexOf('data-id="\' + _kipDialogEsc(it.id)') !== -1,
            'идентификатор строки — item.id (ключ ячейки)');
        assertTrue(f.indexOf('class="kip-dialog-item-label"') !== -1 &&
                   f.indexOf('class="kip-dialog-item-sub"') !== -1,
            'наименование + серое пояснение');
        assertTrue(f.indexOf("(opts.selectAll === false ? '' : ' checked')") !== -1,
            'по умолчанию ВСЕ отмечены (прежнее поведение «очистить всё»)');
    });

    test('счётчик «Выбрано: N из M» и блок OK при пустой выборке', () => {
        const f = between(INDEX_SRC, 'function kipConfirmList(', 'КОНВЕРТЕРЫ (полные данные)');
        assertTrue(f.indexOf("'Выбрано: ' + n + ' из ' + boxes.length") !== -1,
            'счётчик выбора');
        assertTrue(f.indexOf('okBtn.disabled = (n === 0);') !== -1,
            'OK блокируется при 0 отмеченных');
    });

    test('тумблер «Выбрать все» ↔ «Снять все»', () => {
        const f = between(INDEX_SRC, 'function kipConfirmList(', 'КОНВЕРТЕРЫ (полные данные)');
        assertTrue(f.indexOf("selAllBtn.textContent = (n === boxes.length) ? 'Снять все' : 'Выбрать все';") !== -1,
            'подпись переключается по состоянию');
        assertTrue(f.indexOf('boxes[s2].checked = anyOff;') !== -1,
            'клик переключает все галочки разом');
    });

    test('Escape — отмена (null), Enter — не с кнопки/чекбокса', () => {
        const f = between(INDEX_SRC, 'function kipConfirmList(', 'КОНВЕРТЕРЫ (полные данные)');
        assertTrue(f.indexOf("if (e.key === 'Escape') done(null);") !== -1,
            'Escape резолвит null');
        assertTrue(f.indexOf("t.closest('.kip-dialog-btn, .kip-dialog-item, .kip-dialog-selectall')") !== -1,
            'Enter с кнопки/строки НЕ подтверждает (как kipConfirm Task 265)');
    });

    test('результат — массив ВЫБРАННЫХ id', () => {
        const f = between(INDEX_SRC, 'function kipConfirmList(', 'КОНВЕРТЕРЫ (полные данные)');
        assertTrue(f.indexOf('boxes[s].getAttribute(\'data-id\')') !== -1,
            'selected() собирает data-id отмеченных');
        assertTrue(f.indexOf('okBtn.onclick = function() { if (!okBtn.disabled) done(selected()); };') !== -1,
            'OK применяет выборку');
    });

    test('CSS: список, прокрутка, светлая тема', () => {
        assertTrue(INDEX_SRC.indexOf('.kip-dialog.with-list { max-width: 420px; }') !== -1,
            'ширина диалога-списка');
        assertTrue(INDEX_SRC.indexOf('.kip-dialog-items {') !== -1 &&
                   INDEX_SRC.indexOf('max-height: 40vh; overflow-y: auto;') !== -1,
            'прокрутка длинного списка');
        assertTrue(INDEX_SRC.indexOf('.kip-dialog-btn:disabled { opacity: 0.35; cursor: default; }') !== -1,
            'заблокированный OK приглушён');
        assertTrue(INDEX_SRC.indexOf('[data-theme="light"] .kip-dialog-item-label { color: #1a1a1a; }') !== -1,
            'светлая тема строк');
    });
});

// ============================================================
// 2. SRC — clearManualEdits (строки и выборочное применение)
// ============================================================
describe('Task 549 — SRC: clearManualEdits', () => {
    const M = methodText(WS_SRC, 'clearManualEdits');

    test('основная ветка — kipConfirmList (список чекбоксов)', () => {
        assertTrue(M.indexOf('if (typeof kipConfirmList === \'function\')') !== -1,
            'первичная ветка — новый диалог');
        assertTrue(M.indexOf('kipConfirmList(\'Отметьте правки к удалению (по умолчанию — все).\'') !== -1,
            'вводный текст диалога');
        assertTrue(M.indexOf('title: \'Очистка ручных правок\'') !== -1 &&
                   M.indexOf('okText: \'Очистить правки\', danger: true') !== -1,
            'заголовок/danger — как в Task 548');
    });

    test('строка диалога: РАБОТНИК · ДАТА · НАИМЕНОВАНИЕ ПРАВКИ', () => {
        assertTrue(M.indexOf('who + \' · \' +') !== -1 &&
                   M.indexOf('? this._fmtDateRu(row.date) : row.date') !== -1 &&
                   M.indexOf('\' · \' + what') !== -1,
            'label = ФИО · дата · наименование (формат заявки)');
        assertTrue(M.indexOf('this._statusMeta(code)') !== -1,
            'наименование — краткое обозначение кода справочника');
        assertTrue(M.indexOf('what = \'Выходной\';') !== -1,
            'пустой код/«.» → «Выходной»');
        assertTrue(M.indexOf('(\'код «\' + code + \'»\')') !== -1,
            'неизвестный код → «код «X»»');
    });

    test('нет ФИО в справочнике — «таб. № X»', () => {
        assertTrue(M.indexOf('who = \'таб. № \' + row.tab;') !== -1,
            'фолбэк работника');
    });

    test('подпись-пояснение: тип правки + комментарий', () => {
        assertTrue(M.indexOf('\'ручная запись на сервере\'') !== -1 &&
                   M.indexOf('\'несохранённая правка\'') !== -1,
            'типы правок');
        assertTrue(M.indexOf('\'авто-подмена, материализована\'') !== -1,
            'материализованная авто-«д»/«н» Task 458 помечается');
        assertTrue(M.indexOf('\' · комм.: \' +') !== -1 &&
                   M.indexOf('row.comm.slice(0, 40) + \'…\'') !== -1,
            'комментарий записи (≤40 симв.)');
    });

    test('порядок строк — по дате, затем таб-номеру', () => {
        assertTrue(M.indexOf('rows.sort(function(a, b) {') !== -1 &&
                   M.indexOf('a.date < b.date ? -1 : 1') !== -1,
            'сортировка rows');
    });

    test('OK применяется ТОЛЬКО к отмеченным строкам', () => {
        assertTrue(M.indexOf('if (sel && !sel[k]) continue;') !== -1,
            'серверные записи — только выбранные');
        assertTrue(M.indexOf('if (sel && !sel[dropPend[d]]) continue;') !== -1,
            'локальные правки — только выбранные');
        assertTrue(M.indexOf('doClear(sel);') !== -1,
            'выборка передаётся в применение');
    });

    test('тост «Очищено правок: N» — по выборке, не по списку', () => {
        assertTrue(M.indexOf('var n = 0;') !== -1 &&
                   M.indexOf("'Очищено правок: ' + n + ' — нажмите «Сохранить»'") !== -1,
            'счётчик применения (внутренний n)');
    });

    test('отмена/Escape — ничего не меняется', () => {
        assertTrue(M.indexOf('if (!selArr) return;') !== -1,
            'null (отмена) — выход без применения');
    });

    test('фолбэк kipConfirm: прежний диалог со счётчиком (совместимость 548)', () => {
        assertTrue(M.indexOf("if (typeof kipConfirm === 'function') {") !== -1,
            'ветка фолбэка внутри else после kipConfirmList');
        assertTrue(M.indexOf("'Очистить ручные правки месяца — ' + n") !== -1,
            'легаси-сообщение со счётчиком');
    });

    test('regen-подсказка «Сформировать» — по выборке', () => {
        assertTrue(M.indexOf('sel[rows[g].key] && rows[g].regen') !== -1,
            'плановые смены ищутся среди ВЫБРАННЫХ строк');
    });

    test('заявка процитирована в комментарии метода', () => {
        const blk = between(INDEX_SRC, 'Task 549 (заявка: «В диалоговом окне',
                            'clearManualEdits: function');
        assertTrue(blk.indexOf('удаления каждой правки по') !== -1 &&
                   blk.indexOf('работник/дата правки/наименование правки') !== -1,
            'текст заявки сохранён над методом');
    });
});

// ============================================================
// 3. VM — поведение на хосте из реальных методов
// ============================================================
// Геометрия (цикл 4: Д/Н/—/—, как Task 547/548):
//   017 старт 01.09: 01 Д, 02 Н, 03/04 вых., 05 Д, 06 Н — ОТПУСК 05–06
//   023 старт 02.09: 02 Д, 03 Н, 04 вых., 05 ВЫХ (кандидат «д»), 06 Д
//   031 старт 04.09: 04 Д, 05 Н (работает), 06 ВЫХ (кандидат «н»), 07 вых.
//   041 старт 02.09: как 023 — второй кандидат «д» 05-го (после 023)
describe('Task 549 — VM: clearManualEdits + kipConfirmList', () => {

    const PAT = { id: 1, cycle: 4,
                  days: [{ day: 1, status: 'Д' }, { day: 2, status: 'Н' }] };
    const EMPS = [
        { 'таб_номер': '017', 'ФИО': 'Иванов Иван Иванович', 'тип': 'сменный', 'шаблон_ротации': 1, 'старт_цикла': '2026-09-01' },
        { 'таб_номер': '023', 'ФИО': 'Петров Пётр Петрович', 'тип': 'сменный', 'шаблон_ротации': 1, 'старт_цикла': '2026-09-02' },
        { 'таб_номер': '031', 'ФИО': 'Сидоров Сидор Сидорович', 'тип': 'сменный', 'шаблон_ротации': 1, 'старт_цикла': '2026-09-04' },
        { 'таб_номер': '041', 'ФИО': 'Кузнецов Кузьма Кузьмич', 'тип': 'сменный', 'шаблон_ротации': 1, 'старт_цикла': '2026-09-02' }
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
    // канон «Коды_статусов» (срез): «В» НЕ в каноне → фолбэк «код «В»»
    const CODES = [
        { code: 'д', short: 'день в выходной', name: 'День, плановая продолжительность работы в выходные', color: '#FFD54F' },
        { code: 'н', short: 'ночь в выходной', name: 'Ночь, плановая продолжительность работы в выходные', color: '#78909C' },
        { code: 'Б', short: 'больничный', name: 'Больничный, временная нетрудоспособность', color: '#F8BBD0' },
        { code: '', short: 'выходной', name: 'Выходной, плановый выходной день', color: '#EEF0F2' }
    ];

    function host(opts) {
        opts = opts || {};
        const entries = opts.entries !== undefined ? opts.entries : DEF_ENTRIES;
        const toasts = [];
        const mockToast = { show: function(t) { toasts.push(String(t)); } };
        const dialogCalls = [];
        // мок kipConfirmList: фиксирует (msg, items, opts),
        // мок kipConfirmList: фиксирует (msg, items, opts),
        // резолвит opts.selSeq[i] (последовательность выборок по
        // вызовам) / opts.selResult (одна и та же) / все id / null
        const mockList = function(msg, items, dlgOpts) {
            dialogCalls.push({ msg: String(msg),
                               items: JSON.parse(JSON.stringify(items || [])),
                               opts: dlgOpts || {} });
            let res;
            if (opts.selSeq !== undefined) {
                res = opts.selSeq[dialogCalls.length - 1];
            } else if (opts.selResult !== undefined) {
                res = opts.selResult;
            } else {
                res = (items || []).map(function(it) { return it.id; });
            }
            return Promise.resolve(res);
        };
        const legacyConfirms = [];
        const mockConfirm = function(msg) {
            legacyConfirms.push(String(msg));
            return opts.confirmResult !== false;
        };
        const h = new Function('kipConfirmList', 'kipConfirm', 'confirm', 'KipToast',
            'return ({' +
            methodText(WS_SRC, 'clearManualEdits') + ',' +
            methodText(WS_SRC, '_serverEntry') + ',' +
            methodText(WS_SRC, '_plannedShiftAt') + ',' +
            methodText(WS_SRC, '_parseIsoLocal') + ',' +
            methodText(WS_SRC, '_plural') + ',' +
            methodText(WS_SRC, '_statusMeta') + ',' +
            methodText(WS_SRC, '_fmtDateRu') + ',' +
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
            '_STATUS_CODES: ' + JSON.stringify(opts.codes !== undefined ? opts.codes : CODES) + ',' +
            '_AUTO_DN_KEYS: ' + JSON.stringify(opts.keys !== undefined ? opts.keys : DEF_KEYS) + ',' +
            '_updateSaveBtn: function(){ this.__upd = (this.__upd || 0) + 1; },' +
            '_renderGrid: function(){ this.__rend = (this.__rend || 0) + 1; },' +
            '});')(opts.noList ? undefined : mockList,
                  opts.kipConfirm, mockConfirm, mockToast);
        h.__dialogCalls = dialogCalls;
        h.__legacyConfirms = legacyConfirms;
        h.__toasts = toasts;
        return h;
    }

    test('диалог-список: 3 строки «работник · дата · наименование»', async () => {
        const h = host({});
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        assertEqual(h.__dialogCalls.length, 1, 'kipConfirmList вызван однажды');
        const items = h.__dialogCalls[0].items;
        assertEqual(items.length, 3, 'по строке на каждую ручную правку');
        // сортировка: 05|023 («В»), 05|041 («д»), 06|031 («н»)
        assertEqual(items[0].id, '2026-09-05|023', 'id = ключ ячейки (дата|таб)');
        assertTrue(items[0].label.indexOf('Петров') !== -1 &&
                   items[0].label.indexOf('05.09.2026') !== -1,
            'работник + дата: ' + items[0].label);
        assertTrue(items[0].label.indexOf('код «В»') !== -1,
            'неизвестный код «В» → фолбэк: ' + items[0].label);
        assertTrue(items[1].label.indexOf('Кузнецов') !== -1 &&
                   items[1].label.indexOf('д — день в выходной') !== -1,
            'наименование из справочника: ' + items[1].label);
        assertTrue(items[2].label.indexOf('Сидоров') !== -1 &&
                   items[2].label.indexOf('н — ночь в выходной') !== -1,
            'третья строка: ' + items[2].label);
    });

    test('опции диалога: заголовок/danger/okText — как Task 548', async () => {
        const h = host({});
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        const o = h.__dialogCalls[0].opts;
        assertEqual(o.title, 'Очистка ручных правок', 'заголовок');
        assertEqual(o.danger, true, 'danger-кнопка OK');
        assertEqual(o.okText, 'Очистить правки', 'текст OK');
        assertTrue(h.__dialogCalls[0].msg.indexOf('Отметьте правки к удалению') !== -1 &&
                   h.__dialogCalls[0].msg.indexOf('«авто» не затрагиваются') !== -1,
            'вводный текст с предупреждением про авто');
    });

    test('подписи: серверная запись / авто-подмена / тип', async () => {
        const h = host({});
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        const items = h.__dialogCalls[0].items;
        assertEqual(items[0].sub, 'ручная запись на сервере',
            'обычная ручная запись: ' + items[0].sub);
        assertEqual(items[1].sub, 'авто-подмена, материализована',
            'материализованная «д» 041 (реестр Task 458): ' + items[1].sub);
        assertEqual(items[2].sub, 'авто-подмена, материализована',
            'материализованная «н» 031: ' + items[2].sub);
    });

    test('ВЫБОРОЧНОЕ удаление: 2 из 3 — третья запись жива', async () => {
        const h = host({ selResult: ['2026-09-05|023', '2026-09-05|041'] });
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        assertEqual(h._PENDING['2026-09-05|023'] && h._PENDING['2026-09-05|023'].__delete, true,
            'ручной «В» 023 под удалением (отмечен)');
        assertEqual(h._PENDING['2026-09-05|041'] && h._PENDING['2026-09-05|041'].__delete, true,
            'сместившаяся «д» 041 под удалением (отмечена)');
        assertEqual(h._PENDING['2026-09-06|031'], undefined,
            '«н» 031 НЕ отмечена — правки нет, запись жива');
        // реестр: метка снята ТОЛЬКО у выбранной 05|041
        assertEqual(h._AUTO_DN_KEYS['2026-09']['2026-09-05|041'], undefined,
            'метка 05|041 снята');
        assertEqual(h._AUTO_DN_KEYS['2026-09']['2026-09-06|031'], 1,
            'метка 06|031 сохранена (правка не тронута)');
        const t = h.__toasts[h.__toasts.length - 1] || '';
        assertTrue(t.indexOf('Очищено правок: 2') !== -1,
            'тост считает ВЫБОРКУ: ' + t);
        assertEqual(h.__upd, 1, 'кнопки обновлены');
    });

    test('полный выбор — паритет Task 548 (все правки, реестр пуст)', async () => {
        const h = host({});
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        assertEqual(h._PENDING['2026-09-05|023'].__delete, true, '«В» 023 удалён');
        assertEqual(h._PENDING['2026-09-05|041'].__delete, true, '«д» 041 удалена');
        assertEqual(h._PENDING['2026-09-06|031'].__delete, true, '«н» 031 удалена');
        assertEqual(h._AUTO_DN_KEYS['2026-09']['2026-09-05|041'], undefined, 'реестр 041 снят');
        assertEqual(h._AUTO_DN_KEYS['2026-09']['2026-09-06|031'], undefined, 'реестр 031 снят');
        const t = h.__toasts[h.__toasts.length - 1] || '';
        assertTrue(t.indexOf('Очищено правок: 3') !== -1, 'тост: ' + t);
        assertTrue(t.indexOf('подмены расставятся заново') !== -1,
            'без regen — подсказка про подмены');
    });

    test('отмена (null) — ничего не меняется', async () => {
        const h = host({ selResult: null });
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        assertEqual(Object.keys(h._PENDING).length, 0, '_PENDING пуст');
        assertEqual(h._AUTO_DN_KEYS['2026-09']['2026-09-05|041'], 1, 'реестр цел');
        assertEqual(h.__toasts.length, 0, 'тостов нет');
        assertEqual(h.__upd, undefined, 'кнопки не трогались');
    });

    test('пустая выборка — честный no-op (в UI кнопка блокируется)', async () => {
        const h = host({ selResult: [] });
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        assertEqual(Object.keys(h._PENDING).length, 0, 'правок нет');
        assertEqual(h.__toasts.length, 0, 'тоста «Очищено» нет');
        assertEqual(h.__upd, undefined, 'перерисовки нет');
    });

    test('идемпотентность: после выборки повтор показывает остаток', async () => {
        const h = host({ selSeq: [
            ['2026-09-05|023', '2026-09-05|041'],
            ['2026-09-06|031']
        ] });
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        assertEqual(h.__dialogCalls.length, 2, 'второй диалог показан');
        const rest = h.__dialogCalls[1].items;
        assertEqual(rest.length, 1, 'осталась одна правка');
        assertEqual(rest[0].id, '2026-09-06|031', 'невыбранная «н» 031');
        // третий вызов после очистки остатка — честный отказ
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        assertEqual(h.__dialogCalls.length, 2, 'третьего диалога нет');
        const t = h.__toasts[h.__toasts.length - 1] || '';
        assertTrue(t.indexOf('очищать нечего') !== -1, 'тост-отказ: ' + t);
    });

    test('несохранённая правка — строка с подписью и снятием', async () => {
        const h = host({
            entries: DEF_ENTRIES.filter(function(e) {
                return !(e['дата'] === '2026-09-07' && e['таб_номер'] === '041');
            }),
            pending: { '2026-09-07|041': { 'статус': 'Б', 'переработка': 0,
                                           'замещает': null, 'комментарий': '' } }
        });
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        const items = h.__dialogCalls[0].items;
        const pend = items.filter(function(it) { return it.id === '2026-09-07|041'; })[0];
        assertTrue(!!pend, 'правка в списке');
        assertTrue(pend.label.indexOf('Кузнецов') !== -1 &&
                   pend.label.indexOf('07.09.2026') !== -1 &&
                   pend.label.indexOf('Б — больничный') !== -1,
            'работник/дата/наименование: ' + pend.label);
        assertEqual(pend.sub, 'несохранённая правка', 'подпись типа: ' + pend.sub);
        assertEqual(h._PENDING['2026-09-07|041'], undefined,
            'правка снята (в выборке по умолчанию)');
    });

    test('комментарий записи — в подписи, обрезка 40 символов', async () => {
        const longComm = 'Длительное пояснение к правке на шестьдесят символов и более';
        const h = host({
            entries: DEF_ENTRIES.concat([
                { 'дата': '2026-09-05', 'таб_номер': '023', 'статус': 'В',
                  'источник': 'руч', 'комментарий': longComm }
            ])
        });
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        const items = h.__dialogCalls[0].items;
        const withComm = items.filter(function(it) {
            return it.sub.indexOf('комм.:') !== -1; })[0];
        assertTrue(!!withComm, 'комментарий попал в подпись');
        assertTrue(withComm.sub.indexOf(longComm.slice(0, 40)) !== -1,
            'первые 40 символов: ' + withComm.sub);
        assertTrue(withComm.sub.indexOf('…') !== -1, 'обрезка многоточием');
    });

    test('работник без ФИО — фолбэк «таб. № X»', async () => {
        const h = host({
            employees: EMPS.map(function(e) {
                return e['таб_номер'] === '041'
                    ? { 'таб_номер': '041', 'тип': 'сменный',
                        'шаблон_ротации': 1, 'старт_цикла': '2026-09-02' }
                    : e;
            })
        });
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        const it41 = h.__dialogCalls[0].items.filter(function(it) {
            return it.id === '2026-09-05|041'; })[0];
        assertTrue(it41.label.indexOf('таб. № 041') !== -1,
            'фолбэк работника: ' + it41.label);
    });

    test('порядок строк — по дате, затем таб-номеру', async () => {
        const h = host({
            entries: [
                { 'дата': '2026-09-08', 'таб_номер': '031', 'статус': 'Б', 'источник': 'руч' },
                { 'дата': '2026-09-05', 'таб_номер': '041', 'статус': 'д', 'источник': 'руч' },
                { 'дата': '2026-09-05', 'таб_номер': '023', 'статус': 'В', 'источник': 'руч' }
            ]
        });
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        const ids = h.__dialogCalls[0].items.map(function(it) { return it.id; });
        assertEqual(ids.join(','), '2026-09-05|023,2026-09-05|041,2026-09-08|031',
            'сортировка по дате, внутри дня — по табу: ' + ids.join(','));
    });

    test('зритель заблокирован — диалога нет', () => {
        const h = host({ canEdit: false });
        h.clearManualEdits();
        assertEqual(h.__dialogCalls.length, 0, 'kipConfirmList НЕ вызван');
        assertEqual(h.__toasts.length, 0, 'тостов нет');
    });

    test('во время пакетного сохранения — блок', () => {
        const h = host({ saving: true });
        h.clearManualEdits();
        assertEqual(h.__dialogCalls.length, 0, 'диалога нет при _saving');
        assertEqual(Object.keys(h._PENDING).length, 0, 'правок нет');
    });

    test('пустой месяц — отказ без диалога', () => {
        const h = host({
            entries: DEF_ENTRIES.filter(function(e) {
                return e['источник'] !== 'руч';
            })
        });
        h.clearManualEdits();
        assertEqual(h.__dialogCalls.length, 0, 'диалог НЕ вызван');
        const t = h.__toasts[h.__toasts.length - 1] || '';
        assertTrue(t.indexOf('очищать нечего') !== -1, 'тост-отказ: ' + t);
    });

    test('regen-подсказка «Сформировать» — только по ВЫБОРКЕ', async () => {
        // «Б» 017 на 02-м — день плановой «Н» (regen); «В» 023 05-го — нет
        const entries = [
            { 'дата': '2026-09-02', 'таб_номер': '017', 'статус': 'Б', 'источник': 'руч' }
        ].concat(DEF_ENTRIES);
        // выборка БЕЗ реген-записи — тост без «Сформировать»
        const h1 = host({ entries: entries, selResult: ['2026-09-05|023'] });
        h1.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        const t1 = h1.__toasts[h1.__toasts.length - 1] || '';
        assertTrue(t1.indexOf('«Сформировать»') === -1,
            'без реген-записи в выборке подсказки нет: ' + t1);
        // выборка С реген-записью — тост с «Сформировать»
        const h2 = host({ entries: entries, selResult: ['2026-09-02|017'] });
        h2.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        const t2 = h2.__toasts[h2.__toasts.length - 1] || '';
        assertTrue(t2.indexOf('«Сформировать» восстановит плановые смены') !== -1,
            'реген-запись в выборке — подсказка есть: ' + t2);
        // диалог предупреждает, что в списке ЕСТЬ плановые смены
        assertTrue(h2.__dialogCalls[0].msg.indexOf('«Сформировать»') !== -1,
            'вводный текст упоминает плановые смены');
    });

    test('фолбэк kipConfirm: очистка ВСЕГО (обратная совместимость 548)', async () => {
        const optsSeen = [];
        const kipMock = function(msg, o) {
            optsSeen.push({ msg: String(msg), opts: o });
            return Promise.resolve(true);
        };
        const h = host({ noList: true, kipConfirm: kipMock });
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        assertEqual(optsSeen.length, 1, 'kipConfirm вызван (kipConfirmList нет)');
        assertTrue(optsSeen[0].msg.indexOf('— 3') !== -1,
            'легаси-счётчик: ' + optsSeen[0].msg);
        assertEqual(optsSeen[0].opts.danger, true, 'danger сохранён');
        assertEqual(h._PENDING['2026-09-05|023'] && h._PENDING['2026-09-05|023'].__delete, true,
            'очистка ВСЕГО скопом');
        assertEqual(h._PENDING['2026-09-06|031'] && h._PENDING['2026-09-06|031'].__delete, true,
            'все три записи под удалением');
    });

    test('сценарий заявки: выборочное удаление освобождает ячейку кандидата', async () => {
        // пользователь удаляет ТОЛЬКО свой ручной «В» 023 (и сместив-
        // шуюся «д» 041) — «н» 031 остаётся: план вернёт «д» на 023,
        // спрос 06-го закрыт живой «н»
        const h = host({ selResult: ['2026-09-05|023', '2026-09-05|041'] });
        h.clearManualEdits();
        await new Promise(function(r) { setTimeout(r, 0); });
        const srv023 = h._serverEntry('2026-09-05', '023');
        const pend023 = h._PENDING['2026-09-05|023'];
        assertTrue(!!srv023 && !!pend023 && !!pend023.__delete,
            'запись «В» жива на сервере, правка планирует удаление');
        const srv031 = h._serverEntry('2026-09-06', '031');
        assertTrue(!!srv031 && !h._PENDING['2026-09-06|031'],
            '«н» 031 не тронута — спрос 06-го закрыт');
    });
});

// регресс-санитар: у тестов заявки НЕТ мутированных глобалов
describe('Task 549 — санитар', () => {
    test('заявка-цитата в шапке теста', () => {
        assertTrue(fs.readFileSync(__filename, 'utf8')
                       .indexOf('возможность удаления каждой правки по') !== -1,
            'текст замечания пользователя сохранён в тесте');
    });

    test('СЕРВЕР не менялся — WorkSchedule.gs без Task 549', () => {
        const gs = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');
        assertTrue(gs.indexOf('Task 549') === -1,
            'задача чисто клиентская: серверный деплой не нужен');
    });
});
