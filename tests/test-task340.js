// tests/test-task340.js
// Task 340 — заявка пользователя: трёхуровневый доступ к разделу
// «График работы» (Табель учёта рабочего времени) по ТРЁМ столбцам
// матрицы KIP8_Access: workschedule.view (просмотр — карточки БЕЗ
// правки, все кнопки кроме «Сформировать»), workschedule.view.min
// (ограниченный просмотр — без карточек, без «Итогов учёта», в
// шахматке скрыты «Мастер КИПиА»), workschedule.edit (полный доступ).
//
// РЕШЕНИЕ:
//   клиент: WorkSchedule._computeViewLevel (edit > min > view;
//   легаси при недоступной матрице), _empCardAllowed (карточки
//   edit/view), «Вид» — всем уровням, «Итоги» — не уровню min
//   (_applyView/toggleTotals/onTotalsPageOpen), _viewEmployees
//   скрывает «Мастер КИПиА» у min, KipAuth._applyServerAccess
//   добавляет раздел по любому из трёх прав;
//   сервер (справочные копии): WorkSchedule.gs _requireRead пускает
//   чтение по view/view.min/edit; RoleMatrixTask340Init.gs —
//   одноразовое добавление столбца в матрицу.
//   SW: kipia-test-v740.
//
// Запуск: через tests/run-all.js (require './test-task340.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// Срез исходника от начала объекта WorkSchedule (имена методов
// НЕуникальны в файле — извлекаем только из модуля «График работы»)
const WS_START = INDEX_SRC.indexOf('var WorkSchedule = {');
// Task 465: окно 500000 → 560000 — блок печати списка мероприятий
// (~36 КБ) сдвинул _renderEmpPopup/_renderWorkerCard за старую
// границу; негативные ассерты (методы УДАЛЕНЫ) безопасны — их нет
// во всём файле
// Task 489-adapt: окно 560000 → 600000 — хелперы имени (~1,6 КБ
// перед карточкой) сдвинули хвост _renderWorkerCard (~36 КБ);
// карточка теперь ЦЕЛИКОМ в окне (конец ~586,6 КБ)
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

// Мок KipAuth с серверной картой прав (null = права нет в ответе)
function mockKipAuth(perms) {
    return { _serverPerm: function(id) {
        return Object.prototype.hasOwnProperty.call(perms, id)
            ? perms[id] : null;
    } };
}

// ============================================================
// 1. Уровень доступа — _computeViewLevel (edit > min > view)
// ============================================================
describe('Task 340 — _computeViewLevel: три уровня из матрицы', () => {

    test('VM: только edit → «edit»', () => {
        const host = new Function('KipAuth', 'return ({' +
            methodText(WS_CLIENT, '_computeViewLevel') + '\n' +
            "_WRITE_ROLES: ['КИП ИОС', 'КИП ИОС pro', 'Админ']," +
            '});');
        assertEqual(host(mockKipAuth({
            'workschedule.edit': true, 'workschedule.view': false,
            'workschedule.view.min': false }))._computeViewLevel('КИП ИОС'),
            'edit', 'полный доступ при edit=✓');
    });

    test('VM: только view → «view»', () => {
        const host = new Function('KipAuth', 'return ({' +
            methodText(WS_CLIENT, '_computeViewLevel') + '\n' +
            "_WRITE_ROLES: ['КИП ИОС']," +
            '});');
        assertEqual(host(mockKipAuth({
            'workschedule.edit': false, 'workschedule.view': true,
            'workschedule.view.min': false }))._computeViewLevel('ИТР8 pro'),
            'view', 'просмотр при view=✓');
    });

    test('VM: только min → «min» (право самодостаточно)', () => {
        const host = new Function('KipAuth', 'return ({' +
            methodText(WS_CLIENT, '_computeViewLevel') + '\n' +
            "_WRITE_ROLES: ['КИП ИОС']," +
            '});');
        assertEqual(host(mockKipAuth({
            'workschedule.edit': false, 'workschedule.view': false,
            'workschedule.view.min': true }))._computeViewLevel('КИП ИОС дежурный'),
            'min', 'ограниченный просмотр при min=✓');
    });

    test('VM: view+min (обе галочки) → «min» (ограничение сильнее)', () => {
        const host = new Function('KipAuth', 'return ({' +
            methodText(WS_CLIENT, '_computeViewLevel') + '\n' +
            "_WRITE_ROLES: ['КИП ИОС']," +
            '});');
        assertEqual(host(mockKipAuth({
            'workschedule.edit': false, 'workschedule.view': true,
            'workschedule.view.min': true }))._computeViewLevel('КИП ИОС дежурный'),
            'min', 'min доминирует над view — проще не снимать галочку');
    });

    test('VM: edit+min → «edit» (edit сильнее всех)', () => {
        const host = new Function('KipAuth', 'return ({' +
            methodText(WS_CLIENT, '_computeViewLevel') + '\n' +
            "_WRITE_ROLES: ['КИП ИОС']," +
            '});');
        assertEqual(host(mockKipAuth({
            'workschedule.edit': true, 'workschedule.view': false,
            'workschedule.view.min': true }))._computeViewLevel('Админ'),
            'edit', 'edit перекрывает ограничение');
    });

    test('VM: матрица найдена, все три права ✗ → null (раздела нет)', () => {
        const host = new Function('KipAuth', 'return ({' +
            methodText(WS_CLIENT, '_computeViewLevel') + '\n' +
            "_WRITE_ROLES: ['КИП ИОС']," +
            '});');
        assertEqual(host(mockKipAuth({
            'workschedule.edit': false, 'workschedule.view': false,
            'workschedule.view.min': false }))._computeViewLevel('Запрет'),
            null, 'нет прав — уровня нет');
    });

    test('VM: матрица недоступна (все null) → легаси: _WRITE_ROLES = edit', () => {
        const host = new Function('KipAuth', 'return ({' +
            methodText(WS_CLIENT, '_computeViewLevel') + '\n' +
            "_WRITE_ROLES: ['КИП ИОС', 'КИП ИОС pro', 'Админ']," +
            '});');
        const noMatrix = mockKipAuth({});
        assertEqual(host(noMatrix)._computeViewLevel('КИП ИОС'), 'edit',
            'старый сервер: «КИП ИОС» — редактор (легаси)');
        assertEqual(host(noMatrix)._computeViewLevel('Админ'), 'edit',
            'старый сервер: админ — редактор');
    });

    test('VM: матрица недоступна → легаси: прочие роли = «view»', () => {
        const host = new Function('KipAuth', 'return ({' +
            methodText(WS_CLIENT, '_computeViewLevel') + '\n' +
            "_WRITE_ROLES: ['КИП ИОС', 'КИП ИОС pro', 'Админ']," +
            '});');
        assertEqual(host(mockKipAuth({}))._computeViewLevel('КИП ИОС дежурный'),
            'view', 'легаси-зритель — обычный просмотр (не min)');
    });

    test('VM: KipAuth не загружен → легаси по ролям', () => {
        const host = new Function('KipAuth', 'return ({' +
            methodText(WS_CLIENT, '_computeViewLevel') + '\n' +
            "_WRITE_ROLES: ['КИП ИОС', 'Админ']," +
            '});');
        assertEqual(host(undefined)._computeViewLevel('КИП ИОС'), 'edit',
            'без KipAuth: «КИП ИОС» — edit');
        assertEqual(host(undefined)._computeViewLevel('ИТР8'), 'view',
            'без KipAuth: прочие — view');
        assertEqual(host({})._computeViewLevel('ИТР8'), 'view',
            'KipAuth без _serverPerm — легаси');
    });

    test('VM: _computeCanEdit — производная от уровня', () => {
        const host = new Function('KipAuth', 'return ({' +
            methodText(WS_CLIENT, '_computeCanEdit') + '\n' +
            methodText(WS_CLIENT, '_computeViewLevel') + '\n' +
            "_WRITE_ROLES: ['КИП ИОС']," +
            '});');
        const h = host(mockKipAuth({ 'workschedule.edit': true }));
        assertTrue(h._computeCanEdit('КИП ИОС'), 'edit → _canEdit=true');
        const h2 = host(mockKipAuth({
            'workschedule.edit': false, 'workschedule.view': true }));
        assertFalse(h2._computeCanEdit('ИТР8 pro'), 'view → _canEdit=false');
        const h3 = host(mockKipAuth({
            'workschedule.edit': false, 'workschedule.view.min': true }));
        assertFalse(h3._computeCanEdit('КИП ИОС дежурный'), 'min → _canEdit=false');
    });
});

// ============================================================
// 2. Кнопки: «Сформировать» — edit; «Вид» — всем уровням
// ============================================================
describe('Task 340 — кнопки «Сформировать»/«Вид» по уровню', () => {

    test('SRC: init — «Вид» скрыт только без прав (level null)', () => {
        const i = INDEX_SRC.indexOf(
            'this._viewLevel = this._computeViewLevel(role);');
        assertTrue(i !== -1, 'init: уровень считается при старте');
        const init = INDEX_SRC.slice(i, INDEX_SRC.indexOf('this._attachFitResize()', i));
        assertTrue(init.indexOf('viewBtn.hidden = (this._viewLevel === null);') !== -1,
            'init: «Вид» виден уровням edit/view/min (Task 337 отменён)');
        assertTrue(init.indexOf("genBtn.hidden = !this._canEdit;") !== -1,
            'init: «Сформировать» — только редакторам');
        assertTrue(init.indexOf(
            "classList.toggle('ws-readonly', this._viewLevel === 'min')") !== -1,
            'init: ws-readonly — только уровню min (Task 338 смягчён)');
    });

    test('SRC: _onRoleUpdate — «Вид» по уровню, ws-readonly по min', () => {
        const fn = methodText(WS_CLIENT, '_onRoleUpdate');
        assertTrue(fn.indexOf('roleViewBtn.hidden = (newLevel === null);') !== -1,
            '«Вид» скрыт только при отсутствии прав');
        assertTrue(fn.indexOf("classList.toggle('ws-readonly', newLevel === 'min')") !== -1,
            'ws-readonly — только min (карточек нет)');
        assertTrue(fn.indexOf('var newLevel = this._computeViewLevel(role);') !== -1,
            'уровень пересчитывается при приходе роли/матрицы');
        assertTrue(fn.indexOf('(newLevel !== this._viewLevel)') !== -1,
            'идемпотентность: перерисовка при смене уровня');
    });

    test('VM: _onRoleUpdate — уровень «view»: «Вид» видна, ws-readonly снят', () => {
        const els = {
            wsGenerateBtn: { hidden: false },
            wsViewBtn: { hidden: false },
            'page-work-schedule': { classList: { toggle: function(cls, on) { els._ro = !!on; } } }
        };
        const host = new Function('document', 'localStorage', 'return ({' +
            methodText(WS_CLIENT, '_onRoleUpdate') + '\n' +
            '_initialized: true,' +
            "_canEdit: true, _viewLevel: 'edit', _viewLocked: false, _view: 'shift'," +
            "_computeViewLevel: function() { return 'view'; }," +
            '_applyView: function(o) { this._applied = o; }' +
            '});')(mockDoc(els), { getItem: function() { return 'day'; } });
        host._onRoleUpdate('ИТР8 pro');
        assertTrue(els.wsGenerateBtn.hidden === true, '«Сформировать» скрыта');
        assertTrue(els.wsViewBtn.hidden === false, '«Вид» видна (инструмент просмотра)');
        assertFalse(els._ro === true, 'ws-readonly снят — hover ФИО жив');
        assertEqual(host._view, 'day', 'сохранённый вид применяется (Task 338 отменён)');
        assertEqual(host._applied.rerender, true, 'сетка перерисована (смена уровня)');
    });

    test('VM: _onRoleUpdate — уровень «min»: ws-readonly поставлен', () => {
        const els = {
            wsGenerateBtn: { hidden: false },
            wsViewBtn: { hidden: false },
            'page-work-schedule': { classList: { toggle: function(cls, on) { els._ro = !!on; } } }
        };
        const host = new Function('document', 'localStorage', 'return ({' +
            methodText(WS_CLIENT, '_onRoleUpdate') + '\n' +
            '_initialized: true,' +
            "_canEdit: false, _viewLevel: 'view', _viewLocked: false, _view: 'full'," +
            "_computeViewLevel: function() { return 'min'; }," +
            '_applyView: function(o) { this._applied = o; }' +
            '});')(mockDoc(els), { getItem: function() { return null; } });
        host._onRoleUpdate('КИП ИОС дежурный');
        assertTrue(els.wsGenerateBtn.hidden === true, '«Сформировать» скрыта');
        assertTrue(els.wsViewBtn.hidden === false, '«Вид» видна и уровню min');
        assertTrue(els._ro === true, 'ws-readonly поставлен (карточек нет)');
        assertEqual(host._viewLevel, 'min', 'уровень сохранён');
    });

    test('VM: _onRoleUpdate — прав нет (null): «Вид» скрыта', () => {
        const els = {
            wsGenerateBtn: { hidden: false },
            wsViewBtn: { hidden: false },
            'page-work-schedule': { classList: { toggle: function() {} } }
        };
        const host = new Function('document', 'localStorage', 'return ({' +
            methodText(WS_CLIENT, '_onRoleUpdate') + '\n' +
            '_initialized: true,' +
            "_canEdit: false, _viewLevel: 'view', _viewLocked: false, _view: 'full'," +
            "_computeViewLevel: function() { return null; }," +
            '_applyView: function(o) { this._applied = o; }' +
            '});')(mockDoc(els), { getItem: function() { return null; } });
        host._onRoleUpdate('Запрет');
        assertTrue(els.wsGenerateBtn.hidden === true, '«Сформировать» скрыта');
        assertTrue(els.wsViewBtn.hidden === true, '«Вид» скрыта без прав');
    });

    test('SRC: cycleView — guard только для отсутствия прав', () => {
        const fn = methodText(WS_CLIENT, 'cycleView');
        assertTrue(fn.indexOf('if (this._viewLevel === null) return;') !== -1,
            'guard null-уровня (программные вызовы)');
        assertFalse(fn.indexOf('if (!this._canEdit) return;') !== -1,
            'старый guard зрителя (Task 337) удалён — «Вид» доступен уровням');
    });

    test('VM: cycleView — зритель «view» переключает вид', () => {
        const toasts = [];
        let saved = null;
        const host = new Function('KipToast', 'localStorage', 'return ({' +
            methodText(WS_CLIENT, 'cycleView') + '\n' +
            "_viewLevel: 'view', _viewLocked: false, _view: 'full'," +
            '_applyView: function() { this._applied = true; }' +
            '});')({ show: function(m) { toasts.push(m); } },
            { setItem: function(k, v) { saved = v; } });
        host.cycleView();
        assertEqual(host._view, 'shift', 'зритель сменил полный вид на сменный');
        assertEqual(saved, 'shift', 'вид сохранён в localStorage');
        assertTrue(host._applied === true, '_applyView вызван');
        assertTrue(toasts.length === 1, 'тост показан');
    });
});

// ============================================================
// 3. Карточки сотрудников: edit/view — открыта, min/null — нет
// ============================================================
describe('Task 340 — карточки сотрудников по уровню', () => {

    test('SRC: Task 417 — onclick ФИО и _empCardAllowed удалены', () => {
        const fn = methodText(WS_CLIENT, '_renderGrid');
        assertFalse(fn.indexOf('onEmpCellClick') !== -1,
            'клик по ФИО не рендерится (попап удалён, Task 417)');
        assertFalse(fn.indexOf('_empCardAllowed') !== -1,
            'гейт _empCardAllowed удалён (Task 417)');
    });

    test('SRC: Task 417 — методы попапа и гейт удалены', () => {
        assertFalse(WS_CLIENT.indexOf('onEmpCellClick: function') !== -1,
            'onEmpCellClick удалён');
        assertFalse(WS_CLIENT.indexOf('_openEmpPopup: function') !== -1,
            '_openEmpPopup удалён');
        assertFalse(WS_CLIENT.indexOf('_empCardAllowed: function') !== -1,
            '_empCardAllowed удалён');
    });

    test('SRC: карточка read-only — элементы правки гейтятся withEdit', () => {
        // Task 385: карточка шахматки — ТОЛЬКО ЧТЕНИЕ для ВСЕХ уровней
        // (обёртка _renderEmpPopup → _renderWorkerCard(tabNo, false));
        // элементы правки живут в _renderWorkerCard с гейтом withEdit
        // и рендерятся на странице «Работники» (_renderWorkersPage,
        // только редакторам — двойная защита openWorkersPage)
        const wrap = methodText(WS_CLIENT, '_renderEmpPopup');
        assertTrue(wrap.indexOf('_renderWorkerCard(tabNo, false)') !== -1,
            'обёртка зовёт _renderWorkerCard с withEdit=false (Task 385)');
        const fn = methodText(WS_CLIENT, '_renderWorkerCard');
        const cnt = fn.split('if (withEdit').length - 1;
        assertTrue(cnt >= 4, 'все элементы правки гейтятся withEdit (найдено ' + cnt + ')');
        assertTrue(fn.indexOf('ws-emp-dismiss') !== -1 &&
                   fn.indexOf('ws-emp-addvac') !== -1,
            '«Уволить…»/«+ Отпуск…» рендерятся по withEdit (страница «Работники»)');
    });
});

// ============================================================
// 4. «Итоги учёта»: вид full + НЕ уровень min
// ============================================================
describe('Task 340 — «Итоги учёта» недоступны уровню min', () => {

    test('SRC: _applyView — кнопка итогов скрыта вне full ИЛИ при min', () => {
        const fn = methodText(WS_CLIENT, '_applyView');
        assertTrue(fn.indexOf('var minNoTotals = (this._viewLevel === \'min\');') !== -1,
            'уровень min учитывается');
        assertTrue(fn.indexOf('totalsBtn.hidden = minNoTotals;') !== -1,
            'кнопка «Итоги учёта» скрыта только у min (Task 388: вид — любой)');
        assertTrue(fn.indexOf('minNoTotals && this._totalsOpen') !== -1,
            'открытая шторка закрывается при min (смена уровня)');
    });

    test('SRC: toggleTotals — гейт вида И уровня', () => {
        const fn = methodText(WS_CLIENT, 'toggleTotals');
        assertTrue(fn.indexOf(
            "if (this._viewLevel === 'min' &&") !== -1,
            'десктоп: гейт только уровнем min (Task 388: вид — любой)');
    });

    test('VM: toggleTotals — уровень min (вид full): шторка не открывается', () => {
        const host = new Function('navigateTo', 'return ({' +
            methodText(WS_CLIENT, 'toggleTotals') + '\n' +
            "_view: 'full', _viewLevel: 'min', _totalsOpen: false, _ttPage: false," +
            '});')(function() { throw new Error('navigateTo called'); });
        host.toggleTotals();
        assertFalse(host._totalsOpen === true, 'шторка не открылась (min)');
    });

    test('VM: toggleTotals — уровень view (вид full): открытие продолжается', () => {
        const host = new Function('document', 'navigateTo', 'return ({' +
            methodText(WS_CLIENT, 'toggleTotals') + '\n' +
            "_view: 'full', _viewLevel: 'view', _totalsOpen: false, _ttPage: false," +
            '_updateTtTabsVisible: function() { this.tabs = true; },' +
            '_updateTtChv: function() {},' +
            '_renderTotals: function() { this.rendered = true; },' +
            '_applyTtHeadVar: function() {},' +
            '_fitGrid: function() {},' +
            '_syncTotalsRows: function() {}' +
            '});')(mockDoc({}), function() {});
        host.toggleTotals();
        assertTrue(host._totalsOpen === true, 'шторка открылась (view)');
        assertTrue(host.rendered === true, 'таблицы итогов отрисованы');
    });

    test('VM: onTotalsPageOpen — уровень min: редирект на табель', () => {
        let navPage = null;
        const host = new Function('navigateTo', 'return ({' +
            methodText(WS_CLIENT, 'onTotalsPageOpen') + '\n' +
            "_view: 'full', _viewLevel: 'min'," +
            '});')(function(page) { navPage = page; });
        host.onTotalsPageOpen();
        assertEqual(navPage, 'work-schedule', 'min: мобильная страница итогов закрыта');
        assertFalse(host._ttPage === true, 'флаг страницы итогов не ставится');
    });

    test('VM: onTotalsPageOpen — уровень view (вид full): страница открыта', () => {
        const els = {
            wsTtPageTabMonth: { classList: { toggle: function() {} } },
            wsTtPageTabYear: { classList: { toggle: function() {} } }
        };
        const host = new Function('document', 'navigateTo', 'return ({' +
            methodText(WS_CLIENT, 'onTotalsPageOpen') + '\n' +
            "_view: 'full', _viewLevel: 'view', _totalsTab: 'month'," +
            '_renderTotals: function() { this.rendered = true; },' +
            '_reapplyEmpNarrow: function() {}' +
            '});')(mockDoc(els), function() { throw new Error('redirect'); });
        host.onTotalsPageOpen();
        assertTrue(host._ttPage === true, 'view: страница итогов открыта');
        assertTrue(host.rendered === true, 'таблицы итогов отрисованы');
    });

    test('VM: onTotalsPageOpen — уровень min, вид shift: гейт уровня жив (Task 388)', () => {
        // Task 388: гейт ВИДА снят (итоги в любом виде); гейт УРОВНЯ
        // min жив — редирект на табель
        let navPage = null;
        const host = new Function('navigateTo', 'return ({' +
            methodText(WS_CLIENT, 'onTotalsPageOpen') + '\n' +
            "_view: 'shift', _viewLevel: 'min'," +
            '});')(function(page) { navPage = page; });
        host.onTotalsPageOpen();
        assertEqual(navPage, 'work-schedule', 'уровень min — без итогов (гейт уровня)');
        assertFalse(host._ttPage === true, 'флаг страницы не ставится');
    });
});

// ============================================================
// 5. Шахматка: скрытие «Мастер КИПиА» у уровня min
// ============================================================
describe('Task 340 — «Мастер КИПиА» скрыты уровню min', () => {

    test('VM: _isMasterKipia — толерантное сравнение должности', () => {
        const host = new Function('return ({' +
            methodText(WS_CLIENT, '_isMasterKipia') + '\n});')();
        assertTrue(host._isMasterKipia({ 'должность': 'Мастер КИПиА' }),
            'точное совпадение');
        assertTrue(host._isMasterKipia({ 'должность': '  мастер КИПиА  ' }),
            'регистр и пробелы не важны');
        assertTrue(host._isMasterKipia({ 'должность': 'Мастер КИПиА см.1' }),
            'продолжение через пробел (префикс)');
        assertFalse(host._isMasterKipia({ 'должность': 'Слесарь КИПиА' }),
            '«Слесарь КИПиА» не скрыт');
        assertFalse(host._isMasterKipia({ 'должность': 'Начальник участка КИПиА' }),
            '«Начальник участка КИПиА» не скрыт');
        assertFalse(host._isMasterKipia({ 'должность': '' }),
            'пустая должность не скрыта');
        assertFalse(host._isMasterKipia({}),
            'нет поля — не скрыт');
    });

    test('VM: _viewEmployees — min: мастера скрыты, прочие видны', () => {
        const host = new Function('return ({' +
            methodText(WS_CLIENT, '_viewEmployees') + '\n' +
            methodText(WS_CLIENT, '_isMasterKipia') + '\n' +
            "_view: 'full', _viewLevel: 'min'," +
            "_EMPLOYEES: [" +
            "  { 'ФИО': 'Иванов', 'тип': 'сменный', 'должность': 'Слесарь КИПиА' }," +
            "  { 'ФИО': 'Петров', 'тип': 'дневной', 'должность': 'Мастер КИПиА' }," +
            "  { 'ФИО': 'Сидоров', 'тип': 'дневной', 'должность': 'Инженер' }" +
            ']});')();
        const out = host._viewEmployees();
        assertEqual(out.length, 2, 'мастер скрыт, двое видны');
        assertTrue(out[0]['ФИО'] === 'Иванов' && out[1]['ФИО'] === 'Сидоров',
            '«Мастер КИПиА» не попал в отрисовку');
    });

    test('VM: _viewEmployees — view: мастера видны (уровень не трогает)', () => {
        const host = new Function('return ({' +
            methodText(WS_CLIENT, '_viewEmployees') + '\n' +
            methodText(WS_CLIENT, '_isMasterKipia') + '\n' +
            "_view: 'full', _viewLevel: 'view'," +
            "_EMPLOYEES: [" +
            "  { 'ФИО': 'Иванов', 'тип': 'сменный', 'должность': 'Слесарь КИПиА' }," +
            "  { 'ФИО': 'Петров', 'тип': 'дневной', 'должность': 'Мастер КИПиА' }" +
            ']});')();
        assertEqual(host._viewEmployees().length, 2,
            'уровню view «Мастер КИПиА» виден');
    });

    test('VM: _viewEmployees — min + вид shift: фильтры пересекаются', () => {
        const host = new Function('return ({' +
            methodText(WS_CLIENT, '_viewEmployees') + '\n' +
            methodText(WS_CLIENT, '_isMasterKipia') + '\n' +
            "_view: 'shift', _viewLevel: 'min'," +
            "_EMPLOYEES: [" +
            "  { 'ФИО': 'А', 'тип': 'сменный', 'должность': 'Мастер КИПиА' }," +
            "  { 'ФИО': 'Б', 'тип': 'сменный', 'должность': 'Слесарь КИПиА' }," +
            "  { 'ФИО': 'В', 'тип': 'дневной', 'должность': 'Мастер КИПиА' }" +
            ']});')();
        const out = host._viewEmployees();
        assertEqual(out.length, 1, 'сменный слесарь остался один');
        assertEqual(out[0]['ФИО'], 'Б', 'сменный мастер и дневные скрыты');
    });

    test('SRC: фильтр — _viewEmployees вызывает _isMasterKipia при min', () => {
        const fn = methodText(WS_CLIENT, '_viewEmployees');
        assertTrue(fn.indexOf("this._viewLevel === 'min'") !== -1 &&
                   fn.indexOf('this._isMasterKipia(out[k])') !== -1,
            'фильтр мастеров применяется только уровню min');
    });
});

// ============================================================
// 6. Вид табеля: зритель не заперт (Task 338 отменён для view/min)
// ============================================================
describe('Task 340 — вид табеля: зритель управляет видами', () => {

    test('VM: _initView — уровень view: сохранённый вид применяется', () => {
        const host = new Function('localStorage', 'return ({' +
            methodText(WS_CLIENT, '_initView') + '\n' +
            "_computeViewLevel: function() { return 'view'; }," +
            '_applyView: function() { this._applied = true; }' +
            '});')({ getItem: function() { return 'day'; } });
        host._initView('ИТР8 pro');
        assertEqual(host._view, 'day', 'зритель — сохранённый дневной (не shift)');
        assertFalse(host._viewLocked === true, 'замка нет');
    });

    test('VM: _initView — уровень min: тоже сохранённый вид', () => {
        const host = new Function('localStorage', 'return ({' +
            methodText(WS_CLIENT, '_initView') + '\n' +
            "_computeViewLevel: function() { return 'min'; }," +
            '_applyView: function() {}' +
            '});')({ getItem: function() { return 'shift'; } });
        host._initView('КИП ИОС дежурный');
        assertEqual(host._view, 'shift', 'min — сохранённый сменный (его выбор)');
        assertFalse(host._viewLocked === true, 'замка нет (роль не редактор)');
    });

    test('VM: _initView — дежурный-редактор: замок и shift (регресс 332)', () => {
        const host = new Function('localStorage', 'return ({' +
            methodText(WS_CLIENT, '_initView') + '\n' +
            "_computeViewLevel: function() { return 'edit'; }," +
            '_applyView: function() {}' +
            '});')({ getItem: function() { return 'full'; } });
        host._initView('КИП ИОС дежурный');
        assertEqual(host._view, 'shift', 'редактор-дежурный — сменный (замок)');
        assertTrue(host._viewLocked === true, 'замок стоит');
    });
});

// ============================================================
// 7. Видимость раздела: любое из трёх прав
// ============================================================
describe('Task 340 — раздел по любому из трёх прав', () => {

    test('SRC: _applyServerAccess — ЛЮБОЕ право добавляет раздел', () => {
        const i = INDEX_SRC.indexOf(
            "perm('workschedule.view') || perm('workschedule.view.min')");
        assertTrue(i !== -1, 'раздел «График работы» дают view/view.min/edit');
        const win = INDEX_SRC.slice(i - 200, i + 300);
        assertTrue(win.indexOf('perm(\'workschedule.edit\')') !== -1,
            'edit тоже добавляет раздел (полный доступ)');
    });

    test('SRC: клик по ячейке — зритель получает только окно мероприятий', () => {
        const fn = methodText(WS_CLIENT, 'onCellClick');
        assertTrue(fn.indexOf('if (!this._canEdit) {') !== -1 &&
                   fn.indexOf('_openEventsOnlyPopup') !== -1,
            'окно кодов — только редакторам (Task 319 жив: view/min');
    });
});

// ============================================================
// 8. Сервер (справочные копии) — чтение по трём правам
// ============================================================
describe('Task 340 — сервер: _requireRead пускает все три уровня', () => {

    test('SRC: WorkSchedule.gs — view.min/edit дают чтение', () => {
        const gs = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');
        const i = gs.indexOf('Task 340 (трёхуровневый доступ)');
        assertTrue(i !== -1, '_requireRead содержит правку Task 340');
        const fn = gs.slice(i, i + 2000);
        assertTrue(fn.indexOf("g.access.permissions['workschedule.view.min'] === true") !== -1,
            'чтение пускает workschedule.view.min');
        assertTrue(fn.indexOf("g.access.permissions['workschedule.edit'] === true") !== -1,
            'чтение пускает workschedule.edit');
        assertTrue(fn.indexOf("g.error === 'no_session'") !== -1,
            'no_session приоритетнее access_denied');
    });

    test('SRC: RoleMatrixTask340Init.gs — одноразовый скрипт матрицы', () => {
        const p = path.join(ROOT, 'scripts', 'RoleMatrixTask340Init.gs');
        assertTrue(fs.existsSync(p), 'файл init-скрипта существует');
        const gs = fs.readFileSync(p, 'utf8');
        assertTrue(gs.indexOf('TASK340_PERM_ID') !== -1 &&
                   gs.indexOf("'workschedule.view.min'") !== -1,
            'правильный perm_id');
        assertTrue(gs.indexOf('task340AddViewMinPermission') !== -1,
            'главная функция на месте');
        assertTrue(gs.indexOf('roleMatrixInvalidateCache') !== -1,
            'сброс кэша после добавления колонки');
    });

    test('SRC: RoleMatrixGate.gs — диагностика знает новое право', () => {
        const gs = fs.readFileSync(path.join(ROOT, 'scripts', 'RoleMatrixGate.gs'), 'utf8');
        assertTrue(gs.indexOf("'workschedule.view.min': 'm'") !== -1,
            'rmGateStatus: колонка M (workschedule.view.min)');
    });
});

// ============================================================
// 9. Service Worker
// ============================================================
describe('Task 340 — Service Worker', () => {

    test('SW: кэш поднят до kipia-test-v740', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v740'") !== -1,
            'CACHE_VERSION = kipia-test-v740 (Task 340 — фронтенд)');
        assertFalse(SW_SRC.indexOf('kipia-test-v741') !== -1,
            'лишний инкремент (v579) не сделан');
    });

    test('SW: в index.html нет захардкоженной версии кэша', () => {
        assertFalse(INDEX_SRC.indexOf('kipia-test-v57') !== -1,
            'клиент не знает номер кэша (версией управляет sw.js)');
    });
});
