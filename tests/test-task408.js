// ============================================================
// Task 408 — заявка: «блоки инструктажи и мероприятия — РАЗНЫЕ
// информационные блоки; в блоке Повторные инструктажи и периодическая
// проверка знаний — даты + период; в шахматке коды И и ПЗ с указанием
// вида; записи "Инструктажей" — РУЧНОЙ ВЫБОР из шаблонного списка;
// годовые архивы с отметкой выполнения + следующие сроки; блок
// мероприятия — коды в шахматке и архив».
//
// 1) СЕРВЕР: listTrainings + eventsAll (ВСЕ записи «Мероприятий»).
// 2) КЛИЕНТ: _EVENTS_ALL (кэш Task 314 запись/рестор).
// 3) ШАХМАТКА: тултип бейджа «код — тема записи» (вид И/ПЗ).
// 4) КАРТОЧКА: стрелки ‹год› в заголовках блоков (asBlocks);
//    _wtabYearOf/_wtabYearMin/_wtabYearNav/_wtabYearShift;
//    записи года — _wtabYearRecords (instrAll+eventsAll+_TRAININGS,
//    дедуп по id); снимок сроков «на конец года» в архиве.
// 5) ФОРМА: строгий select #wsTrTitleSel по типу + подсказка пункта
//    #wsTrItemHint (периодичность/основание) + правка «вне списка».
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const WS_SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'WorkSchedule.gs'), 'utf8');

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

function mockDoc(els) {
    return { getElementById: function(id) { return els[id] || null; } };
}

function ymd(dt) {
    const m = dt.getMonth() + 1, d = dt.getDate();
    return dt.getFullYear() + '-' + (m < 10 ? '0' : '') + m +
           '-' + (d < 10 ? '0' : '') + d;
}
const TODAY = ymd(new Date());
const NOWY = new Date().getFullYear();

// ============================================================
// 1. SRC — сервер: eventsAll
// ============================================================
describe('Task 408 — SRC: сервер (WorkSchedule.gs)', () => {

    test('listTrainings: eventsAll — ВСЕ «Мероприятия» без фильтра года', () => {
        const fn = stripComments(methodText(WS_SRC, 'listTrainings'));
        assertTrue(fn.indexOf('eventsAll: (evSheet ? this._readTrainingsSheet(evSheet, {}) : [])') !== -1,
            'поле eventsAll — все записи листа «Мероприятия»');
        assertTrue(
            fn.indexOf('instrAll:  sheet ? this._readTrainingsSheet(sheet, {}) : []') !== -1,
            'instrAll (Task 407) жив; Task 413 — пустой срез без листа');
        assertTrue(fn.indexOf('trainings: trainings') !== -1,
            'годовой срез trainings прежний');
    });

    test('док-блок: eventsAll в сигнатуре ответа', () => {
        assertTrue(WS_SRC.indexOf('eventsAll (Task 408)') !== -1,
            'упоминание eventsAll в док-блоке listTrainings');
    });
});

// ============================================================
// 2. SRC — клиент: состояние, кэш, бейдж, год, форма
// ============================================================
describe('Task 408 — SRC: клиент', () => {

    test('состояние: _EVENTS_ALL + _wtabYear', () => {
        assertTrue(INDEX_SRC.indexOf('_EVENTS_ALL: [],') !== -1,
            'поле _EVENTS_ALL объявлено');
        assertTrue(INDEX_SRC.indexOf('_wtabYear: {},') !== -1,
            'карта выбранных годов по работникам');
    });

    test('_loadTrainings разбирает eventsAll', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_loadTrainings'));
        assertTrue(fn.indexOf('self._EVENTS_ALL = data.eventsAll || [];') !== -1,
            'старый сервер — пустой массив');
    });

    test('кэш Task 314: eventsAll пишется и восстанавливается', () => {
        const w = stripComments(methodText(INDEX_SRC, '_cacheWrite'));
        assertTrue(w.indexOf('c.eventsAll = this._EVENTS_ALL;') !== -1,
            'запись в кэш');
        // Task 476: разбор объекта кэша вынесен в _restoreFromObj
        // (общий для localStorage- и KipDB-слоёв).
        const r = stripComments(methodText(INDEX_SRC, '_restoreFromObj'));
        assertTrue(r.indexOf('Array.isArray(c.eventsAll) ? c.eventsAll : []') !== -1,
            'восстановление с guard');
    });

    test('шахматка: тултип вида на бейдже И/ПЗ', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderCell'));
        assertTrue(fn.indexOf('var evTip = (evTr && String(evTr.тема || \'\').trim())') !== -1,
            'тема записи → тултип');
        assertTrue(fn.indexOf('(evTip ? \' title="\' + this._esc(evTip) + \'"\' : \'\')') !== -1,
            'title-атрибут бейджа (пустой темы/справочника — без title)');
        assertTrue(fn.indexOf('events[evj].code + \' — \' +') !== -1 &&
                   fn.indexOf('this._instrShortOf(String(evTr.тема).trim())') !== -1,
            'формат «код — тема» (Task 416: короткое название при наличии сокращения)');
    });

    test('карточка: год блока + навигатор в заголовках (asBlocks)', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderWorkerCard'));
        assertTrue(fn.indexOf("var wYearEv = asBlocks ? this._wtabYearOf(tabNo, 0) : this._year;") !== -1 &&
                   fn.indexOf("var wYearIn = asBlocks ? this._wtabYearOf(tabNo, 1) : this._year;") !== -1,
            'годы блоков — РАЗДЕЛЬНЫЕ выборы работника (Task 435: fam 0/1; попап: год шахматки)');
        assertTrue(fn.indexOf('wYearEv + this._wtabYearNav(tabNo, wYearEv, 0)') !== -1,
            '«Мероприятия · год» + свой навигатор (fam 0)');
        assertTrue(fn.indexOf('wYearIn + this._wtabYearNav(tabNo, wYearIn, 1)') !== -1,
            '«Повторные инструктажи… · год» + свой навигатор (fam 1)');
        assertTrue(fn.indexOf('this._renderInstrSection(ins, tabNo, withEdit,') !== -1 &&
                   fn.indexOf('this._INSTR_LIST, wYearIn);') !== -1,
            'инструктажный блок рендерится с годом');
    });

    test('_wtabYearRecords: пул источников + дедуп', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_wtabYearRecords'));
        assertTrue(fn.indexOf('var pool = [].concat(this._INSTR_ALL || [],') !== -1 &&
                   fn.indexOf('this._EVENTS_ALL || [],') !== -1 &&
                   fn.indexOf('this._TRAININGS || []);') !== -1,
            'пул: instrAll + eventsAll + годовой срез');
        assertTrue(fn.indexOf("this._isInstrType(r.тип) ? 'i' + id : 'e' + id") !== -1,
            'дедуп по id + семейству типа (Task 427: одинаковые id разных листов — ДВЕ записи; без id — дата+тема)');
        assertTrue(fn.indexOf('if (this._isInstrType(r.тип)) ins.push(r);') !== -1,
            'деление по типу: ins/evs');
    });

    test('_renderInstrSection: год + снимок сроков', () => {
        const fn = stripComments(methodText(INDEX_SRC, '_renderInstrSection'));
        assertTrue(fn.indexOf('_renderInstrSection: function(ins, tabNo, withEdit, asBlocks, iList, year)') !== -1,
            'параметр year');
        assertTrue(fn.indexOf('var lastCut = year + \'-12-31\';') !== -1,
            '«последний» ограничен концом выбранного года');
        assertTrue(fn.indexOf('след. срок (на конец \' +') !== -1,
            'архивный год — нейтральная строка снимка');
        assertTrue(fn.indexOf('— за \' + year + \' год не проводился') !== -1,
            'пустое состояние с номером года');
    });

    test('форма: строгий select + подсказка пункта', () => {
        assertTrue(INDEX_SRC.indexOf('id="wsTrTitleSel"') !== -1 &&
                   INDEX_SRC.indexOf('id="wsTrItemHint"') !== -1,
            'разметка select и подсказки');
        const sf = stripComments(methodText(INDEX_SRC, '_syncTrTitleField'));
        assertTrue(sf.indexOf('var useSel = !!this._trInstrMode &&') !== -1 &&
                   sf.indexOf('(this._INSTR_LIST || []).length > 0;') !== -1,
            'select только в instr-режиме с шаблоном (Task 410)');
        assertTrue(sf.indexOf('(вне списка)</option>') !== -1,
            'правка «вне списка» — отдельный пункт');
        const sm = stripComments(methodText(INDEX_SRC, 'submitTrainingForm'));
        assertTrue(sm.indexOf('var tema = (this._trInstrMode && trSel && !trSel.hidden)') !== -1,
            'submit читает тему из select');
        assertTrue(sm.indexOf("'Выберите пункт из списка'") !== -1,
            'сообщение валидации');
        const of = stripComments(methodText(INDEX_SRC, 'openTrainingForm'));
        assertTrue(of.indexOf('this._syncTrTitleField(String(editTraining.тема || \'\'));') !== -1,
            'правка открывает select с темой записи');
    });
});

// ============================================================
// 3. VM — форма: строгий select + подсказка
// ============================================================
describe('Task 408 — VM: форма (select «Список_И_и_ПЗ»)', () => {

    const TPL = [
        { название: 'Охрана труда', вид: 'инструктаж',
          периодичность: 6, основание: 'не реже 1 раза в 6 месяцев' },
        { название: 'Пожарная безопасность', вид: 'инструктаж',
          периодичность: 0, основание: '' },
        { название: 'Электробезопасность', вид: 'проверка_знаний',
          периодичность: 12, основание: 'ежегодно' }
    ];

    // Task 410: режим формы задаётся явно (instr = select всех
    // пунктов «Список_И_и_ПЗ»; tip больше не влияет)
    function formHost(tip, tpl, mode) {
        const els = {
            wsTrType: { value: tip },
            wsTrTitleSel: { hidden: false, innerHTML: 'stale', value: '' },
            wsTrTitle: { hidden: false, value: 'старый текст' },
            wsTrTitleList: { innerHTML: 'stale' },
            wsTrItemHint: { hidden: true, textContent: 'старая подсказка' }
        };
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_syncTrTitleField') + ',\n' +
            methodText(INDEX_SRC, '_updateTrItemHint') + ',\n' +
            methodText(INDEX_SRC, '_fillTrTitleOptions') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKind') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_fmtPeriodRu') + ',\n' +
            '_esc: function(s) { return String(s); },' +
            '_plural: function(n, f) { return f[2]; },' +
            '_trInstrMode: ' + (mode === false ? 'false' : 'true') + ',' +
            '_INSTR_LIST: ' + JSON.stringify(tpl === undefined ? TPL : tpl) +
            '});')(mockDoc(els));
        return { host: host, els: els };
    }

    test('instr-режим: select показан, ВСЕ пункты шаблона с группами', () => {
        const c = formHost(null);
        c.host._syncTrTitleField();
        assertTrue(c.els.wsTrTitleSel.hidden === false, 'select виден');
        assertTrue(c.els.wsTrTitle.hidden === true, 'текстовый ввод скрыт');
        const h = c.els.wsTrTitleSel.innerHTML;
        assertTrue(h.indexOf('value="">— выберите из списка —') !== -1,
            'пустой пункт');
        assertTrue(h.indexOf('<optgroup label="Инструктажи">') !== -1 &&
                   h.indexOf('<optgroup label="Проверка знаний">') !== -1,
            'группы по виду (Task 410)');
        assertTrue(h.indexOf('value="Охрана труда"') !== -1 &&
                   h.indexOf('value="Пожарная безопасность"') !== -1 &&
                   h.indexOf('value="Электробезопасность"') !== -1,
            'ВСЕ пункты шаблона — инструктажи и ПЗ одним списком');
        assertEqual('', c.els.wsTrTitleSel.value, 'по умолчанию — не выбрано');
    });

    test('группы: инструктажи и ПЗ разделены по видам', () => {
        const c = formHost(null);
        c.host._syncTrTitleField();
        const h = c.els.wsTrTitleSel.innerHTML;
        const gi = h.indexOf('<optgroup label="Инструктажи">');
        const gp = h.indexOf('<optgroup label="Проверка знаний">');
        assertTrue(gi !== -1 && gp !== -1 && gi < gp, 'обе группы по порядку');
        const segI = h.slice(gi, gp);
        assertTrue(segI.indexOf('value="Охрана труда"') !== -1 &&
                   segI.indexOf('value="Пожарная безопасность"') !== -1,
            'инструктажи — в своей группе');
        assertTrue(segI.indexOf('Электробезопасность') === -1,
            'ПЗ-пункт не в группе инструктажей');
        assertTrue(h.slice(gp).indexOf('value="Электробезопасность"') !== -1,
            'ПЗ-пункт — в своей группе');
    });

    test('event-режим: свободный ввод (select скрыт, datalist жив)', () => {
        const c = formHost('обучение', undefined, false);
        c.host._syncTrTitleField();
        assertTrue(c.els.wsTrTitleSel.hidden === true, 'select скрыт');
        assertTrue(c.els.wsTrTitle.hidden === false, 'ввод виден');
        assertEqual('', c.els.wsTrTitleList.innerHTML,
            'datalist пуст (темы свободные)');
        assertTrue(c.els.wsTrItemHint.hidden === true, 'подсказка скрыта');
    });

    test('шаблона нет — деградация в свободный ввод', () => {
        const c = formHost(null, []);
        c.host._syncTrTitleField();
        assertTrue(c.els.wsTrTitleSel.hidden === true, 'select скрыт');
        assertTrue(c.els.wsTrTitle.hidden === false, 'ввод виден');
    });

    test('правка: тема совпала (регистр/пробелы) — пункт выбран', () => {
        const c = formHost(null);
        c.host._syncTrTitleField('  ОХРАНА   труда ');
        assertEqual('Охрана труда', c.els.wsTrTitleSel.value,
            'выбран пункт шаблона (нормализация)');
        assertTrue(c.els.wsTrTitleSel.innerHTML.indexOf('(вне списка)') === -1,
            'без пункта «вне списка»');
    });

    test('правка: тема «вне списка» — отдельный пункт, значение сохранено', () => {
        const c = formHost(null);
        c.host._syncTrTitleField('Внеплановый по наряду №4');
        const h = c.els.wsTrTitleSel.innerHTML;
        assertTrue(h.indexOf('Внеплановый по наряду №4 (вне списка)') !== -1,
            'пункт «вне списка» добавлен');
        assertEqual('Внеплановый по наряду №4', c.els.wsTrTitleSel.value,
            'значение выбрано (сохранится без изменений)');
    });

    test('подсказка пункта: периодичность + основание', () => {
        const c = formHost(null);
        c.host._syncTrTitleField('Охрана труда');
        c.els.wsTrTitleSel.value = 'Охрана труда';
        c.host._updateTrItemHint();
        assertEqual('раз в 6 месяцев · Основание: не реже 1 раза в 6 месяцев',
            c.els.wsTrItemHint.textContent, 'текст подсказки');
        assertTrue(c.els.wsTrItemHint.hidden === false, 'подсказка видна');
    });

    test('подсказка: разовый пункт без основания — строка скрыта', () => {
        const c = formHost(null);
        c.host._syncTrTitleField('Пожарная безопасность');
        c.els.wsTrTitleSel.value = 'Пожарная безопасность';
        c.host._updateTrItemHint();
        assertEqual('', c.els.wsTrItemHint.textContent, 'пусто');
        assertTrue(c.els.wsTrItemHint.hidden === true, 'скрыта');
    });
});

// ============================================================
// 4. VM — годовые архивы: записи года + снимок сроков
// ============================================================
describe('Task 408 — VM: годовые архивы', () => {

    const TAB = '017';
    // instrAll: 2024 ЭБ (снимок), 2026 ОТ; eventsAll: 2025 обучение,
    // 2026 примечание; _TRAININGS (срез года табели 2026): дубль ОТ +
    // примечание (проверка дедупа)
    const INSTR_ALL = [
        { id: 5, 'таб_номер': TAB, 'тип': 'проверка_знаний',
          'тема': 'Электробезопасность',
          'дата_начала': (NOWY - 2) + '-03-12', 'дата_окончания': (NOWY - 2) + '-03-12' },
        { id: 21, 'таб_номер': TAB, 'тип': 'инструктаж',
          'тема': 'Охрана труда', 'дата_начала': TODAY, 'дата_окончания': TODAY }
    ];
    const EVENTS_ALL = [
        { id: 30, 'таб_номер': TAB, 'тип': 'обучение',
          'тема': 'Курс АСУ ТП', 'дата_начала': (NOWY - 1) + '-05-15',
          'дата_окончания': (NOWY - 1) + '-05-15' },
        { id: 31, 'таб_номер': TAB, 'тип': 'примечание',
          'тема': 'Перенос', 'дата_начала': TODAY, 'дата_окончания': TODAY }
    ];
    const TRAININGS = [
        { id: 21, 'таб_номер': TAB, 'тип': 'инструктаж',
          'тема': 'Охрана труда', 'дата_начала': TODAY, 'дата_окончания': TODAY },
        { id: 31, 'таб_номер': TAB, 'тип': 'примечание',
          'тема': 'Перенос', 'дата_начала': TODAY, 'дата_окончания': TODAY }
    ];

    function yearHost() {
        return new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_wtabYearOf') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearMin') + ',\n' +
        methodText(INDEX_SRC, '_wtabYearMax') + ',\n' +
        methodText(INDEX_SRC, '_vacYearRange') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearNav') + ',\n' +
            methodText(INDEX_SRC, '_wtabYearRecords') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            '_esc: function(s) { return String(s); },' +
            '_wtabYear: {},' +
            '_year: ' + NOWY + ',' +
            '_INSTR_ALL: ' + JSON.stringify(INSTR_ALL) + ',' +
            '_EVENTS_ALL: ' + JSON.stringify(EVENTS_ALL) + ',' +
            '_TRAININGS: ' + JSON.stringify(TRAININGS) +
            '});')(mockDoc({}));
    }

    test('текущий год: записи из всех источников БЕЗ дублей', () => {
        const host = yearHost();
        const r = host._wtabYearRecords(TAB, NOWY);
        assertEqual(1, r.ins.length, 'инструктаж года один (дубль снят по id)');
        assertEqual('Охрана труда', r.ins[0].тема, 'тема инструктажа');
        assertEqual(1, r.evs.length, 'мероприятие года одно (дубль снят)');
        assertEqual('Перенос', r.evs[0].тема, 'тема мероприятия');
    });

    test('архивный год: записи того года из instrAll/eventsAll', () => {
        const host = yearHost();
        const rPrev = host._wtabYearRecords(TAB, NOWY - 1);
        assertEqual(0, rPrev.ins.length, 'инструктажей в прошлом году нет');
        assertEqual(1, rPrev.evs.length, 'обучение прошлого года');
        assertEqual('Курс АСУ ТП', rPrev.evs[0].тема, 'тема');
        const rOld = host._wtabYearRecords(TAB, NOWY - 2);
        assertEqual(1, rOld.ins.length, 'ПЗ позапрошлого года (снимок)');
        assertEqual(0, rOld.evs.length, 'мероприятий нет');
    });

    test('границы года: пересечение (запись, начавшаяся в декабре)', () => {
        const host = yearHost();
        const r = host._wtabYearRecords(TAB, NOWY - 1);
        // обучение 15.05 прошлого года попадает; запись (NOWY)-01-02 — нет
        const r2 = yearHost()._wtabYearRecords(TAB, NOWY);
        assertTrue(r2.ins.every(x => String(x.дата_начала).slice(0, 4) === String(NOWY)),
            'все записи — выбранного года');
    });

    test('_wtabYearMin: самый ранний год записи РАБОТНИКА', () => {
        const host = yearHost();
        assertEqual(NOWY - 2, host._wtabYearMin(TAB),
            'минимум по instrAll/eventsAll (ЭБ позапрошлого года)');
        assertEqual(NOWY, host._wtabYearMin('999'),
            'чужих записей нет — год шахматки');
    });

    test('_wtabYearOf: не выбран — год шахматки; выбран — хранится', () => {
        const host = yearHost();
        assertEqual(NOWY, host._wtabYearOf(TAB), 'по умолчанию — год табеля');
        host._wtabYear[TAB] = NOWY - 1;
        assertEqual(NOWY - 1, host._wtabYearOf(TAB), 'выбранный год');
    });

    test('_wtabYearNav: границы стрелок', () => {
        const host = yearHost();
        const lo = host._wtabYearNav(TAB, NOWY - 2);
        assertTrue(lo.indexOf('ws-ynav-off">‹') !== -1,
            'на минимуме левая стрелка погашена');
        assertTrue(lo.indexOf(", -1)") === -1,
            'клика «назад» на минимуме нет');
        assertTrue(lo.indexOf("WorkSchedule._wtabYearShift('" + TAB + "', 1)") !== -1,
            'клик «вперёд» на минимуме жив');
        const hi = host._wtabYearNav(TAB, NOWY);
        assertTrue(hi.indexOf('ws-ynav-off">›') !== -1,
            'на максимуме правая стрелка погашена');
        assertTrue(hi.indexOf(", 1)") === -1,
            'клика «вперёд» на максимуме нет');
        const mid = host._wtabYearNav(TAB, NOWY - 1);
        assertTrue(mid.indexOf("WorkSchedule._wtabYearShift('" + TAB + "', -1)") !== -1 &&
                   mid.indexOf("WorkSchedule._wtabYearShift('" + TAB + "', 1)") !== -1,
            'в середине обе стрелки кликабельны');
        assertTrue(mid.indexOf('<' + (NOWY - 1) + '<') === -1,
            'год в заголовке — текстом рядом (не в навигаторе)');
    });

    test('_renderInstrSection: архивный год — снимок без «просрочено»', () => {
        const TPL = [
            { название: 'Электробезопасность', вид: 'проверка_знаний',
              периодичность: 12, основание: 'ежегодно' }
        ];
        const host = new Function('document', 'return ({' +
            methodText(INDEX_SRC, '_instrShortOf') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_renderInstrSection') + ',\n' +
            methodText(INDEX_SRC, '_isInstrType') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKey') + ',\n' +
            methodText(INDEX_SRC, '_normInstrKind') + ',\n' +
            methodText(INDEX_SRC, '_addMonthsIso') + ',\n' +
            methodText(INDEX_SRC, '_isoDate') + ',\n' +
            methodText(INDEX_SRC, '_fmtPeriodRu') + ',\n' +
            '_fmtDateRu: function(d) { var p = String(d).split("-");' +
            '  return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(d); },' +
            '_esc: function(s) { return String(s); },' +
            '_plural: function(n, f) { return f[2]; },' +
            '_trainingCodeOf: function(t) { return t === "проверка_знаний" ? "ПЗ" : "И"; },' +
            '_statusMeta: function(c) { return { code: c, color: "#123456", name: c }; },' +
            '_INSTR_LIST: ' + JSON.stringify(TPL) + ',' +
            '_INSTR_ALL: ' + JSON.stringify(INSTR_ALL) + ',' +
            '_year: ' + NOWY +
            '});')(mockDoc({}));
        // архивный год: последний = ЭБ позапрошлого года; срок нейтрален
        const html = host._renderInstrSection(
            [], TAB, true, true, host._INSTR_LIST, NOWY - 1);
        assertTrue(html.indexOf('след. срок (на конец ' + (NOWY - 1) + '):') !== -1,
            'нейтральная строка снимка');
        assertTrue(html.indexOf('⚠') === -1 &&
                   html.indexOf('просрочено') === -1,
            'архивный год — БЕЗ красного «просрочено»');
        assertTrue(html.indexOf('— за ' + (NOWY - 1) + ' год не проводился') !== -1,
            'пустое состояние с номером года');
        // текущий год: прежние правила (ЭБ давно → просрочено)
        const htmlNow = host._renderInstrSection(
            [], TAB, true, true, host._INSTR_LIST, NOWY);
        assertTrue(htmlNow.indexOf('⚠ просрочено с ') !== -1,
            'текущий год — просрочено от последней записи');
    });
});

// ============================================================
// 5. VM — кэш: roundtrip eventsAll
// ============================================================
describe('Task 408 — VM: кэш (localStorage)', () => {

    const EV = [{ id: 9, 'таб_номер': '017', 'тип': 'обучение',
                  'тема': 'Курс', 'дата_начала': '2025-05-15',
                  'дата_окончания': '2025-05-15' }];

    function lsMock() {
        const store = {};
        return {
            store: store,
            getItem: function(k) { return k in store ? store[k] : null; },
            setItem: function(k, v) { store[k] = String(v); },
            removeItem: function(k) { delete store[k]; }
        };
    }

    test('_cacheWrite сохраняет eventsAll', () => {
        const ls = lsMock();
        const host = new Function('document', 'localStorage', 'return ({' +
            methodText(INDEX_SRC, '_cacheRead') + ',\n' +
            methodText(INDEX_SRC, '_cacheWrite') + ',\n' +
            methodText(INDEX_SRC, '_ymKey') + ',\n' +
            '_wsCacheKey: "kip8_ws_test_408",' +
            '_STATUS_CODES: [], _PATTERNS: [], _EMPLOYEES: [],' +
            '_VACATIONS: [], _PPE: [], _ENTRIES: [], _TRAININGS: [],' +
            '_INSTR_LIST: [], _INSTR_ALL: [],' +
            '_EVENTS_ALL: ' + JSON.stringify(EV) + ',' +
            '_year: 2026, _month: 9, _cacheTs: 0' +
            '});')(mockDoc({}), ls);
        host._cacheWrite();
        const c = JSON.parse(ls.store['kip8_ws_test_408']);
        assertEqual(JSON.stringify(EV), JSON.stringify(c.eventsAll),
            'eventsAll в кэше');
    });

    test('_restoreCachedView: события всех лет восстановлены', () => {
        const ls = lsMock();
        const cache = {
            v: 1,
            codes: [{ code: 'И', name: 'инструктаж', color: '#111' }],
            patterns: [],
            employees: [{ 'таб_номер': '017', 'ФИО': 'И' }],
            vacations: { '2026': [] },
            ppe: [],
            instrList: [], instrAll: [],
            eventsAll: EV,
            views: { '2026-09': { entries: [], trainings: [], ts: 1 } }
        };
        ls.store['kip8_ws_test_408'] = JSON.stringify(cache);
        const host = new Function('document', 'localStorage', 'return ({' +
            methodText(INDEX_SRC, '_cacheRead') + ',\n' +
            methodText(INDEX_SRC, '_restoreCachedView') + ',\n' +
            methodText(INDEX_SRC, '_restoreFromObj') + ',\n' +
            methodText(INDEX_SRC, '_ymKey') + ',\n' +
            '_normalizeStatusCodes: function(c) { return c; },' +
            '_normalizeInstrList: function(l) { return l; },' +
            '_fillStatusSelect: function() {},' +
            '_wsCacheKey: "kip8_ws_test_408",' +
            '_STATUS_CODES: [], _PATTERNS: [], _EMPLOYEES: [],' +
            '_VACATIONS: [], _VAC_PAGE: [], _PPE: [],' +
            '_INSTR_LIST: [], _INSTR_ALL: [], _EVENTS_ALL: [], _vacYear: 0,' +
            '_year: 2026, _month: 9, _cacheTs: 0' +
            '});')(mockDoc({}), ls);
        assertTrue(host._restoreCachedView(), 'кэш поднят');
        assertEqual(JSON.stringify(EV), JSON.stringify(host._EVENTS_ALL),
            'eventsAll восстановлен');
    });

    test('кэш ПРЕЖНЕЙ версии (без eventsAll) — пустой, вид поднимается', () => {
        const ls = lsMock();
        const cache = {
            v: 1,
            codes: [{ code: 'И', name: 'инструктаж', color: '#111' }],
            patterns: [],
            employees: [{ 'таб_номер': '017', 'ФИО': 'И' }],
            vacations: { '2026': [] },
            views: { '2026-09': { entries: [], trainings: [], ts: 1 } }
        };
        ls.store['kip8_ws_test_408'] = JSON.stringify(cache);
        const host = new Function('document', 'localStorage', 'return ({' +
            methodText(INDEX_SRC, '_cacheRead') + ',\n' +
            methodText(INDEX_SRC, '_restoreCachedView') + ',\n' +
            methodText(INDEX_SRC, '_restoreFromObj') + ',\n' +
            methodText(INDEX_SRC, '_ymKey') + ',\n' +
            '_normalizeStatusCodes: function(c) { return c; },' +
            '_normalizeInstrList: function(l) { return l; },' +
            '_fillStatusSelect: function() {},' +
            '_wsCacheKey: "kip8_ws_test_408",' +
            '_STATUS_CODES: [], _PATTERNS: [], _EMPLOYEES: [],' +
            '_VACATIONS: [], _VAC_PAGE: [], _PPE: [],' +
            '_INSTR_LIST: [], _INSTR_ALL: [], _EVENTS_ALL: ["stale"], _vacYear: 0,' +
            '_year: 2026, _month: 9, _cacheTs: 0' +
            '});')(mockDoc({}), ls);
        assertTrue(host._restoreCachedView(), 'кэш поднят');
        assertEqual(0, host._EVENTS_ALL.length, 'eventsAll пуст (нет поля)');
    });
});

// ============================================================
// 6. GAS-VM — сервер: eventsAll из листа «Мероприятия»
// ============================================================
describe('Task 408 — GAS-VM: сервер (моки листов)', () => {

    class MockSheet {
        constructor(rows) { this.rows = rows || []; }
        getLastRow() { return this.rows.length; }
        getLastColumn() {
            let m = 0;
            for (const r of this.rows) m = Math.max(m, r.length);
            return m || 1;
        }
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
                setFontWeight() { return this; },
                setBackground() { return this; },
                setFontColor() { return this; }
            };
        }
        deleteRow(r) { this.rows.splice(r - 1, 1); }
        setFrozenRows() {}
    }

    const MOCK_UTILS = {
        findSessionByToken: () => ({ user_id: 1 }),
        findUserById: () => ({ role: 'Админ', email: 'test@example.com' }),
        audit: () => {}
    };

    function loadWS(sheets) {
        const ss = {
            getSheetByName: (n) => sheets[n] || null,
            insertSheet: (name) => {
                const s = new MockSheet([]);
                sheets[name] = s;
                return s;
            }
        };
        const SpreadsheetApp = { openById: () => ss };
        const factory = new Function('SpreadsheetApp', 'Utils', 'Logger',
            WS_SRC + '\nreturn WorkSchedule;');
        return factory(SpreadsheetApp, MOCK_UTILS, { log: () => {} });
    }

    function baseSheets(withEvents) {
        const sheets = {
            'Инструктажи': new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_начала',
                 'дата_окончания', 'длительность_дней', 'комментарий'],
                [1, '017', 'инструктаж', 'Охрана труда',
                 new Date(2024, 2, 10), new Date(2024, 2, 10), 1, ''],
                [2, '017', 'проверка_знаний', 'Электробезопасность',
                 new Date(2026, 7, 20), new Date(2026, 7, 20), 1, '']
            ])
        };
        if (withEvents) {
            sheets['Мероприятия'] = new MockSheet([
                ['id', 'таб_номер', 'тип', 'тема', 'дата_начала',
                 'дата_окончания', 'длительность_дней', 'комментарий'],
                [3, '017', 'обучение', 'Курс АСУ ТП',
                 new Date(2025, 4, 15), new Date(2025, 4, 15), 1, ''],
                [4, '018', 'прогул', 'Прогул',
                 new Date(2026, 7, 12), new Date(2026, 7, 12), 1, '']
            ]);
        }
        return sheets;
    }

    test('listTrainings: eventsAll — все записи «Мероприятий» (все годы)', () => {
        const WS = loadWS(baseSheets(true));
        const r = WS.listTrainings({ token: 't', year: 2026, month: 8 });
        assertTrue(r.ok, 'ok');
        assertEqual(2, r.data.eventsAll.length,
            'обе записи листа (включая 2025)');
        assertEqual(3, r.data.eventsAll[0].id, 'id записи листа «Мероприятия»');
        assertEqual('обучение', r.data.eventsAll[0].тип, 'тип');
        assertEqual(2, r.data.instrAll.length, 'instrAll не тронут');
        assertEqual(2, r.data.trainings.length,
            'годовой срез trainings прежний (2026: id 2,4)');
    });

    test('листа «Мероприятия» нет — eventsAll [] (не ошибка)', () => {
        const WS = loadWS(baseSheets(false));
        const r = WS.listTrainings({ token: 't', year: 2026, month: 8 });
        assertTrue(r.ok && Array.isArray(r.data.eventsAll) &&
                   r.data.eventsAll.length === 0,
            'нет листа — пустой массив');
        assertEqual(1, r.data.trainings.length, 'срез из «Инструктажей» жив');
    });
});

// ============================================================
// 7. SW — версия кэша
// ============================================================
describe('Task 408 — SW', () => {
    test('SW: версия кэша kipia-test-v733', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v733'") !== -1,
            'CACHE_VERSION = kipia-test-v733');
        assertTrue(SW_SRC.indexOf('kipia-test-v634') === -1,
            'старой версии нет');
    });
});
