// tests/test-task338.js
// Task 338 — заявка пользователя (продолжение Task 337): «так же у
// роли "КИП ИОС дежурный" не должны быть видны кнопка "Итоги
// учёта", шахматка дневного персонала, карточки сотрудников».
// Роль в матрице KIP8_Access имеет только workschedule.view
// («просмотр»: «кнопки и диалоги скрыты, доступен только выбор
// года и месяца»).
//
// РЕШЕНИЕ (только клиент, kip8test — сервер уже гейтит запись):
//   1) ВИД зрителя — «сменный» (Task 337 ставил «полный»): в
//      _initView/_onRoleUpdate ветка !canEdit → 'shift'. Сменный
//      вид автоматически прячет «Итоги учёта» (_applyView: кнопка
//      hidden, шторка закрывается, toggleTotals гейтит вид) и
//      фильтрует сетку до сменных (_viewEmployees) — шахматки
//      дневных нет. Замок «КИП ИОС дежурный» — как в Task 337
//      (только если роль ещё и редактор матрицы).
//   2) СТРАНИЦА итогов (мобильная #page-ws-totals): onTotalsPageOpen
//      гейтится видом (vGate !== 'full' → назад на табель) —
//      зритель не видит итоги и при прямом переходе.
//   3) КАРТОЧКИ сотрудников: onclick в сетке рендерится только
//      редакторам (тернарник _canEdit, как «+» заголовка
//      «Сотрудник»); двойная защита — гейты в onEmpCellClick и
//      _openEmpPopup (программные вызовы тоже). Режим зрителя —
//      класс ws-readonly на #page-work-schedule: CSS выключает
//      подсветку наведения ФИО (зебра чётных строк живёт).
//   SW: kipia-test-v733.
//
// Запуск: через tests/run-all.js (require './test-task338.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Срез исходника от начала объекта WorkSchedule (имена методов
// НЕуникальны в файле — извлекаем только из модуля «График работы»)
const WS_START = INDEX_SRC.indexOf('var WorkSchedule = {');
const WS_CLIENT = INDEX_SRC.slice(WS_START, WS_START + 600000);

function methodText(src, name) {
    const sig = '\n        ' + name + ': function';
    const i = src.indexOf(sig);
    if (i === -1) return '';
    const rest = src.slice(i + 1);
    const m = rest.match(/\n        [a-zA-Z_]+: function|\n    \};/);
    const end = m ? m.index : rest.length;
    return rest.slice(0, end);
}

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

// ============================================================
// 1. «Итоги учёта» и шахматка дневных — вид зрителя «сменный»
// ============================================================
describe('Task 338 — вид зрителя: сменный (итоги/дневные скрыты)', () => {

    test('SRC: _initView — зрель не заперт, замок только дежурному-редактору', () => {
        const fn = methodText(WS_CLIENT, '_initView');
        // Task 340: принудительный shift — только у замка дежурного-
        // редактора; зритель (view/min) — сохранённый вид, как редактор
        const cnt = fn.split("this._view = 'shift';").length - 1;
        assertEqual(cnt, 1, 'ветка shift — только замок дежурного');
        assertFalse(fn.indexOf("} else if (!canEdit) {") !== -1,
            'ветка принудительного shift зрителя удалена (Task 340)');
        assertTrue(fn.indexOf("(saved === 'shift' || saved === 'day') ? saved : 'full';") !== -1,
            'зритель получает сохранённый вид (Task 340)');
    });

    test('SRC: _onRoleUpdate — зритель → shift (легаси-вид не применяется)', () => {
        const fn = methodText(WS_CLIENT, '_onRoleUpdate');
        assertTrue(fn.indexOf("classList.toggle('ws-readonly', newLevel === 'min')") !== -1,
            'ws-readonly — только уровню min (Task 340)');
        assertTrue(fn.indexOf("(saved === 'shift' || saved === 'day') ? saved : 'full';") !== -1,
            'зритель — сохранённый вид (Task 340, не принудительный shift)');
    });

    test('SRC: init() — страница получает класс ws-readonly', () => {
        const i = INDEX_SRC.indexOf('this._viewLevel = this._computeViewLevel(role);');
        assertTrue(i !== -1, 'init: уровень через _computeViewLevel (Task 340)');
        const init = INDEX_SRC.slice(i, INDEX_SRC.indexOf('this._attachFitResize()', i));
        assertTrue(init.indexOf("classList.toggle('ws-readonly', this._viewLevel === 'min')") !== -1,
            'init: ws-readonly — только уровню min');
    });

    test('SRC: _applyView — кнопка «Итоги учёта» скрыта вне полного вида', () => {
        const fn = methodText(WS_CLIENT, '_applyView');
        // Task 388 (заявка): итоги доступны во ВСЕХ видах — скрыты
        // только уровню «min» (Task 340)
        assertTrue(fn.indexOf("totalsBtn.hidden = minNoTotals;") !== -1,
            '«Итоги учёта» скрыты только уровню min (Task 388)');
        assertFalse(fn.indexOf('!full || minNoTotals') !== -1,
            'гейта вида больше нет (Task 388)');
        assertTrue(fn.indexOf("viewPage.classList.toggle('ws-view-filtered', !full);") !== -1,
            'класс ws-view-filtered (Task 335) — сетка по высоте контента');
    });

    test('SRC: toggleTotals — гейт вида (шторка/кнопка недоступны)', () => {
        const fn = methodText(WS_CLIENT, 'toggleTotals');
        // Task 388 (заявка): итоги в любом виде; гейт — только min
        assertTrue(fn.indexOf("if (this._viewLevel === 'min' &&") !== -1,
            'десктоп: гейт только уровнем min (Task 388/340)');
        assertTrue(fn.indexOf("if (this._viewLevel === 'min') return;") !== -1,
            'мобильная страница итогов — гейт уровня');
        assertFalse(fn.indexOf("vGate !== 'full'") !== -1,
            'гейта вида больше нет (Task 388)');
    });

    test('VM: onTotalsPageOpen — вид shift ОТКРЫВАЕТ страницу (Task 388)', () => {
        // Task 388 (заявка: итоги в видах сменный/дневной): гейт вида
        // снят — страница итогов открывается и в сменном виде
        const els = {
            wsTtPageTabMonth: { classList: { toggle: function() {} } },
            wsTtPageTabYear: { classList: { toggle: function() {} } }
        };
        let navPage = null;
        const host = new Function('document', 'navigateTo', 'return ({' +
            methodText(WS_CLIENT, 'onTotalsPageOpen') + '\n' +
            "_view: 'shift', _viewLevel: 'view'," +
            "_totalsTab: 'month'," +
            '_renderTotals: function() { this.rendered = true; },' +
            '_reapplyEmpNarrow: function() {}' +
            '});')(mockDoc(els), function(page) { navPage = page; });
        host.onTotalsPageOpen();
        assertEqual(navPage, null, 'редиректа нет — итоги доступны в сменном виде');
        assertEqual(host._ttPage, true, 'флаг страницы итогов ставится');
        assertEqual(host.rendered, true, 'таблицы отрисованы');
    });

    test('VM: onTotalsPageOpen — редактор (полный вид) открывает страницу', () => {
        const els = {
            wsTtPageTabMonth: { classList: { toggle: function() {} } },
            wsTtPageTabYear: { classList: { toggle: function() {} } }
        };
        let navPage = null;
        const host = new Function('document', 'navigateTo', 'return ({' +
            methodText(WS_CLIENT, 'onTotalsPageOpen') + '\n' +
            "_view: 'full'," +
            "_totalsTab: 'month'," +
            '_renderTotals: function() { this.rendered = true; },' +
            '_reapplyEmpNarrow: function() {}' +
            '});')(mockDoc(els), function(page) { navPage = page; });
        host.onTotalsPageOpen();
        assertEqual(navPage, null, 'редиректа нет');
        assertTrue(host._ttPage === true, 'флаг страницы итогов поставлен');
        assertTrue(host.rendered === true, 'таблицы итогов отрисованы');
    });

    test('VM: onTotalsPageOpen — легаси-состояние без _view = полный', () => {
        const host = new Function('document', 'navigateTo', 'return ({' +
            methodText(WS_CLIENT, 'onTotalsPageOpen') + '\n' +
            '_renderTotals: function() { this.rendered = true; },' +
            '_reapplyEmpNarrow: function() {}' +
            '});')(mockDoc({
                wsTtPageTabMonth: { classList: { toggle: function() {} } },
                wsTtPageTabYear: { classList: { toggle: function() {} } }
            }), function() {});
        host.onTotalsPageOpen();
        assertTrue(host._ttPage === true, 'толерантный гейт: _view нет → полный');
    });

    test('VM: _viewEmployees — сменный вид прячет дневных', () => {
        const host = new Function('return ({' +
            methodText(WS_CLIENT, '_viewEmployees') + '\n' +
            "_view: 'shift'," +
            "_EMPLOYEES: [" +
            "  { 'ФИО': 'А', 'тип': 'сменный' }," +
            "  { 'ФИО': 'Б', 'тип': 'дневной' }," +
            "  { 'ФИО': 'В', 'тип': 'сменный' }," +
            "  { 'ФИО': 'Г', 'тип': 'дневной' }" +
            ']});')();
        const out = host._viewEmployees();
        assertEqual(out.length, 2, 'только сменные строки');
        assertTrue(out[0]['ФИО'] === 'А' && out[1]['ФИО'] === 'В',
            'дневные сотрудники не попали в отрисовку');
    });
});

// ============================================================
// 2. Карточки сотрудников — только редакторам
// ============================================================
describe('Task 338 — карточки сотрудников скрыты зрителю', () => {

    test('SRC: Task 417 — onclick ФИО удалён (попапа карточки нет)', () => {
        const fn = methodText(WS_CLIENT, '_renderGrid');
        assertFalse(fn.indexOf('onEmpCellClick') !== -1,
            'клик по ФИО не рендерится (Task 417: попап удалён)');
        assertFalse(fn.indexOf('_empCardAllowed') !== -1,
            'гейт _empCardAllowed удалён');
    });

    test('SRC: Task 417 — CSS ws-readonly hover-правила удалены', () => {
        assertFalse(INDEX_SRC.indexOf(
            '#page-work-schedule.ws-readonly .ws-grid tbody td.ws-emp-col:hover') !== -1,
            'тёмная тема: hover-правило удалено');
        assertFalse(INDEX_SRC.indexOf(
            '[data-theme="light"] #page-work-schedule.ws-readonly .ws-grid tbody td.ws-emp-col:hover') !== -1,
            'светлая тема: hover-правило удалено');
        // класс ws-readonly продолжает ставиться JS (маркер уровня min)
        assertTrue(INDEX_SRC.indexOf("classList.toggle('ws-readonly', newLevel === 'min')") !== -1,
            'JS-переключатель ws-readonly жив (совместимость)');
    });

    test('SRC: заголовок «Работники» — надпись (Task 386: гейт снят)', () => {
        assertTrue(INDEX_SRC.indexOf("this._canEdit ? ' ws-emp-head-add' : ''") === -1,
            'заголовок-кнопки нет — правит кнопка «Работники» в баре (Task 386)');
    });
});

// ============================================================
// 3. Регрессы Task 337 (право из матрицы — не разболтано)
// ============================================================
describe('Task 338 — регрессы прав Task 337', () => {

    test('SRC: _WRITE_ROLES НЕ содержит «КИП ИОС дежурный»', () => {
        const m = INDEX_SRC.match(/_WRITE_ROLES:\s*\[([^\]]*)\]/);
        assertTrue(!!m, 'список _WRITE_ROLES найден');
        assertFalse(m[1].indexOf('дежурный') !== -1,
            'легаси-список не содержит «КИП ИОС дежурный»');
    });

    test('SRC: _computeViewLevel — приоритет серверной матрицы', () => {
        const fn = methodText(WS_CLIENT, '_computeViewLevel');
        assertTrue(fn.indexOf("KipAuth._serverPerm('workschedule.edit')") !== -1,
            'право записи читается из матрицы KIP8_Access');
        assertTrue(fn.indexOf("KipAuth._serverPerm('workschedule.view.min')") !== -1,
            'уровень min тоже из матрицы (Task 340)');
    });

    test('SRC: cycleView — программный guard отсутствия прав', () => {
        const fn = methodText(WS_CLIENT, 'cycleView');
        assertTrue(fn.indexOf('if (this._viewLevel === null) return;') !== -1,
            'без прав вид не переключается (Task 340)');
    });
});

// ============================================================
// 4. Service Worker
// ============================================================
describe('Task 338 — Service Worker', () => {

    test('SW: кэш поднят до kipia-test-v733', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v733'") !== -1,
            'CACHE_VERSION = kipia-test-v733 (Task 338 — только фронтенд)');
        assertFalse(SW_SRC.indexOf('kipia-test-v734') !== -1,
            'лишний инкремент (v578) не сделан');
    });

    test('SW: в index.html нет захардкоженной версии кэша', () => {
        assertFalse(INDEX_SRC.indexOf('kipia-test-v57') !== -1,
            'клиент не знает номер кэша (версией управляет sw.js)');
    });
});
