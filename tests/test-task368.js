// tests/test-task368.js
// Task 368: заявка пользователя:
//   «В хозрасчётах №3 и №11, в форме ввода показаний должен выбираться
//    период из двух дат определяющих период, и значения по умолчанию
//    в форме должны стоять даты за предыдущую календарную неделю.
//    Также с хозрасчётом №9, только период месяц. Еженедельные: красный,
//    когда календарная неделя (пн–вс) прошла; зелёный — когда данные
//    этой недели введены; снова красный, когда текущая (новая) календарная
//    неделя (пн–вс) прошла, пока не введут за неё данные. Ежемесячные:
//    красный, когда календарный месяц данных прошёл; зелёный — когда
//    данные за этот месяц введены; снова красный, когда (новый) текущий
//    календарный месяц прошел, пока не введут данные за его период.»
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. SRC — flowPrevWeekRange; классификаторы _isWeeklyMeter/
//      _isMonthlyMeter (№1 исключён); _recordCoversPeriod (пересечение,
//      clamp legacy datePrev); ветка формы в _applyEntryTypeFields
//      («Период с/по», дефолты, правка); блок периода в submitInput
//      (datePrev/dateCurr, hard-проверка, meter.datePrev); подписи
//      «за ДД.ММ–ДД.ММ.ГГГГ» (renderList + _buildDetailHtml);
//      хронология — диапазон записей периодных расходомеров.
//   B. VM — flowPrevWeekRange (середина недели, пн, вс, граница года);
//      _isOverdue: полные циклы заявки для недельных и месячных
//      (красный → зелёный → снова красный), границы пн 00:00 и
//      1-е число, годовые переходы, legacy-точки, суточная 6:00.
//   C. VM (форма) — _applyEntryTypeFields с моками DOM и фиксированным
//      «сейчас» (чт 10.09.2026 07:30): №3 — «Период с 31.08 по 06.09»;
//      №9 — «Период с 01.08 по 31.08»; правка №3 — даты записи;
//      №2 суточный — одна дата «вчера»; №1 — chips-флоу не тронут.
//   D. SW v597 (guard v598).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');
const { extractFunctions } = require('./extract-functions.js');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ============================================================
// Извлечение методов из FlowmeterData (балансировка скобок)
// ============================================================
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

// ============================================================
// A. SRC — клиент
// ============================================================
describe('Task 368 — SRC: хелперы и точки применения', () => {

    test('flowPrevWeekRange определена (границы прошедшей недели)', () => {
        assertTrue(INDEX_SRC.indexOf('function flowPrevWeekRange(now)') !== -1,
            'глобальная функция есть');
        const i = INDEX_SRC.indexOf('function flowPrevWeekRange(now)');
        const chunk = INDEX_SRC.slice(i, i + 700);
        assertTrue(chunk.indexOf('(mon.getDay() + 6) % 7') !== -1,
            'база — понедельник текущей недели');
        assertTrue(chunk.indexOf('mon.getDate() - 7') !== -1 &&
                   chunk.indexOf('mon.getDate() - 1') !== -1,
            'прошедшая неделя = [пн−7 … вс−1]');
    });

    test('_isWeeklyMeter / _isMonthlyMeter — по периоду таблицы, №1 исключён', () => {
        const w = extractMethod(INDEX_SRC, '_isWeeklyMeter');
        const m = extractMethod(INDEX_SRC, '_isMonthlyMeter');
        assertTrue(w !== null && m !== null, 'оба классификатора определены');
        assertTrue(w.indexOf('!this._isDailyMode(m)') !== -1,
            '№1 (свой chips-флоу) исключён из недельных');
        assertTrue(m.indexOf('!this._isDailyMode(m)') !== -1,
            '№1 исключён из месячных');
        assertTrue(w.indexOf('/недел|еженед/') !== -1, 'регэксп недель совпадает с _isOverdue');
        assertTrue(m.indexOf('/месяц|месяч|ежемес/') !== -1, 'регэксп месяцев совпадает');
    });

    test('_recordCoversPeriod — пересечение периода записи с закрытым периодом', () => {
        const r = extractMethod(INDEX_SRC, '_recordCoversPeriod');
        assertTrue(r !== null, 'хелпер определён');
        assertTrue(r.indexOf('this._dayKey(s) <= this._dayKey(refEnd)') !== -1 &&
                   r.indexOf('this._dayKey(d) >= this._dayKey(refStart)') !== -1,
            'пересечения достаточно (start ≤ refEnd и end ≥ refStart)');
        assertTrue(r.indexOf('this._dayKey(s) > this._dayKey(d)') !== -1,
            'битый/инвертированный legacy datePrev зажимается в точку');
    });

    test('_isOverdue: недельная и месячная ветки — через _recordCoversPeriod', () => {
        const m = extractMethod(INDEX_SRC, '_isOverdue');
        const wi = m.indexOf("if (/недел|еженед/.test(period)) {");
        const mi = m.indexOf("if (/месяц|месяч|ежемес/.test(period)) {");
        assertTrue(wi !== -1 && mi !== -1, 'обе ветки на месте');
        const wChunk = m.slice(wi, m.indexOf('}', wi));
        assertTrue(wChunk.indexOf('_recordCoversPeriod') !== -1 &&
                   wChunk.indexOf('wMon.getDate() - 7') !== -1 &&
                   wChunk.indexOf('wMon.getDate() - 1') !== -1,
            'недельная: закрытая неделя [пн−7 … вс−1]');
        const mChunk = m.slice(mi, m.indexOf('}', mi));
        assertTrue(mChunk.indexOf('_recordCoversPeriod') !== -1 &&
                   mChunk.indexOf('n.getMonth() - 1, 1') !== -1 &&
                   mChunk.indexOf('n.getMonth(), 0') !== -1,
            'месячная: закрытый месяц [1-е … последнее число]');
    });

    test('_applyEntryTypeFields: ветка показаний за период', () => {
        const m = extractMethod(INDEX_SRC, '_applyEntryTypeFields');
        const pi = m.indexOf('if (this._isWeeklyMeter(m) || this._isMonthlyMeter(m)) {');
        assertTrue(pi !== -1, 'ветка есть');
        const chunk = m.slice(pi, m.indexOf('return;', pi) + 8);
        assertTrue(chunk.indexOf('flowPrevWeekRange(now)') !== -1,
            'дефолт недельных — flowPrevWeekRange');
        assertTrue(chunk.indexOf('flowPrevMonthRange(now)') !== -1,
            'дефолт месячных — flowPrevMonthRange');
        assertTrue(chunk.indexOf("dateLabel.textContent = 'Период с'") !== -1,
            'подпись «Период с»');
        assertTrue(chunk.indexOf('this._parseMdy(m.datePrev)') !== -1 &&
                   chunk.indexOf('this._parseMdy(m.dateCurr)') !== -1,
            'правка — предзаполнение датами записи');
        assertTrue(chunk.indexOf('flowDateToInputVal(pvE)') !== -1,
            'поле «по» заполняется');
        // Ветка стоит РАНЬШЕ суточной (иначе !dailyMode увело бы в неё)
        const di = m.indexOf("// Суточный ввод (а также редактирование и не-№1 расходомеры)");
        assertTrue(di !== -1 && pi < di, 'ветка периода раньше суточной');
    });

    test('submitInput: блок периода — datePrev = «Период с», dateCurr = «по»', () => {
        const m = extractMethod(INDEX_SRC, 'submitInput');
        const pi = m.indexOf('if (pmMeter && (this._isWeeklyMeter(pmMeter) || this._isMonthlyMeter(pmMeter))) {');
        assertTrue(pi !== -1, 'блок периода есть');
        const chunk = m.slice(pi, m.indexOf('}', pi) + 1);
        assertTrue(chunk.indexOf('_flowParseDate(dateField.value)') !== -1,
            'начало периода — из поля «Период с»');
        assertTrue(chunk.indexOf("getElementById('flowInputDateEnd')") !== -1,
            'конец периода — из поля «по»');
        assertTrue(chunk.indexOf('Дата конца периода раньше даты начала') !== -1,
            'hard-проверка «конец раньше начала»');
        assertTrue(chunk.indexOf('flowPrevWeekRange(pnow)') !== -1 &&
                   chunk.indexOf('flowPrevMonthRange(pnow)') !== -1,
            'пустые поля → границы закрытой недели/месяца');
        assertTrue(m.indexOf("datePrevStr = flowDateToMdy(psD || pDef.start);") !== -1 &&
                   m.indexOf("dateStr = flowDateToMdy(peD || pDef.end);") !== -1,
            'datePrevStr/dateStr из дат формы');
        assertTrue(m.indexOf('if (datePrevStr) meter.datePrev = datePrevStr;') !== -1,
            'оптимистичное обновление meter.datePrev (и при правке)');
    });

    test('renderList: подпись «за ДД.ММ–ДД.ММ.ГГГГ» для периодных', () => {
        const m = extractMethod(INDEX_SRC, 'renderList');
        assertTrue(m.indexOf('var lastDateInline368 = ') !== -1,
            'переменная подписи даты');
        assertTrue(m.indexOf('flowWeekRangeLabel(rpS, rpE)') !== -1,
            'диапазон через flowWeekRangeLabel');
    });

    test('_buildDetailHtml: та же подпись-диапазон', () => {
        const m = extractMethod(INDEX_SRC, '_buildDetailHtml');
        assertTrue(m.indexOf('var lastDateInline = ') !== -1,
            'переменная подписи даты');
        assertTrue(m.indexOf('flowWeekRangeLabel(ldS, ldE)') !== -1,
            'диапазон через flowWeekRangeLabel');
        assertTrue(m.indexOf('+ lastDateInline +') !== -1,
            'подпись вставлена в строку «Последние показания»');
    });

    test('Хронология: записи периодных расходомеров — диапазон без бейджа', () => {
        const m = extractMethod(INDEX_SRC, '_buildArchiveHtml');
        assertTrue(m.indexOf('var isMeterPeriodRow = !isPeriodRow &&') !== -1,
            'флаг записей периодных расходомеров');
        assertTrue(m.indexOf('this._isWeeklyMeter(meter) || this._isMonthlyMeter(meter)') !== -1,
            'классификация по расходомеру');
        const ri = m.indexOf('} else if (isMeterPeriodRow && _flowParseDate(r.datePrev) &&');
        assertTrue(ri !== -1, 'ветка диапазона записей');
        // indexOf от ri+1: ri указывает на «}» самого «} else if»
        const chunk = m.slice(ri, m.indexOf('}', ri + 1) + 1);
        assertTrue(chunk.indexOf('flow-archive-date-range') !== -1,
            'класс диапазона (как у агрегатов недели/месяца)');
        assertTrue(chunk.indexOf('_fmtDateShort(r.datePrev)') !== -1,
            'формат «ДД.ММ–ДД.ММ.ГГГГ»');
    });

    test('Сервер не менялся: обычный маршрут updateReading пишет D/E', () => {
        // datePrev/dateCurr уходят payload'ом как есть — серверная ветка
        // «сутки» пишет их в meters-строку (D/E) и архив
        const m = extractMethod(INDEX_SRC, 'submitInput');
        const pi = m.indexOf('маршрутом flowmeter.updateReading');
        assertTrue(pi !== -1, 'комментарий объясняет маршрут');
    });
});

// ============================================================
// B. VM — flowPrevWeekRange + _isOverdue (полные циклы заявки)
// ============================================================
const fns = extractFunctions();

let Mixin = null;
try {
    const parts = ['_isOverdue', '_parseMdy', '_dayKey', '_mondayOf', '_recordCoversPeriod', '_isDailyMode']
        .map(n => extractMethod(INDEX_SRC, n)).filter(Boolean);
    if (parts.length === 6) {
        const ctx = {};
        vm.createContext(ctx);
        vm.runInContext('var Mixin = { ' + parts.join(',') + ' };', ctx);
        Mixin = ctx.Mixin;
    }
} catch (e) { /* ниже упадут с причиной */ }

describe('Task 368 — VM: flowPrevWeekRange (границы прошедшей недели)', () => {

    test('Середина недели: чт 10.09.2026 → пн 31.08 … вс 06.09', () => {
        const w = fns.flowPrevWeekRange(new Date(2026, 8, 10, 12, 0));
        assertEqual(fns.flowDateToMdy(w.start), '8/31/2026', 'start = понедельник прошлой недели');
        assertEqual(fns.flowDateToMdy(w.end), '9/6/2026', 'end = воскресенье прошлой недели');
    });

    test('Понедельник 14.09.2026 → закрывшаяся неделя 07–13.09', () => {
        const w = fns.flowPrevWeekRange(new Date(2026, 8, 14, 0, 30));
        assertEqual(fns.flowDateToMdy(w.start), '9/7/2026', 'в пн уже новая закрытая неделя');
        assertEqual(fns.flowDateToMdy(w.end), '9/13/2026', 'end = вчера-воскресенье');
    });

    test('Воскресенье 13.09.2026 → ещё 31.08–06.09 (текущая не закрыта)', () => {
        const w = fns.flowPrevWeekRange(new Date(2026, 8, 13, 23, 0));
        assertEqual(fns.flowDateToMdy(w.start), '8/31/2026', 'start');
        assertEqual(fns.flowDateToMdy(w.end), '9/6/2026', 'end');
    });

    test('Граница года: пн 04.01.2027 → 28.12.2026–03.01.2027', () => {
        const w = fns.flowPrevWeekRange(new Date(2027, 0, 4, 10, 0));
        assertEqual(fns.flowDateToMdy(w.start), '12/28/2026', 'start через декабрь');
        assertEqual(fns.flowDateToMdy(w.end), '1/3/2027', 'end в новом году');
    });
});

describe('Task 368 — VM: недельные — полный цикл заявки', () => {

    test('Методы извлечены', () => {
        assertTrue(Mixin !== null && typeof Mixin._isOverdue === 'function',
            '_isOverdue + _recordCoversPeriod извлечены');
        assertTrue(typeof fns.flowPrevWeekRange === 'function',
            'flowPrevWeekRange извлечена из index.html');
    });

    test('КРАСНЫЙ: неделя (пн–вс) прошла, данных нет', () => {
        // сейчас чт 10.09 → закрытая неделя 31.08–06.09 пуста
        assertTrue(Mixin._isOverdue({ period: 'Еженедельно', dateCurr: '8/24/2026' }, new Date(2026, 8, 10, 12, 0)),
            'неделя прошла — пора вводить');
    });

    test('ЗЕЛЁНЫЙ: данные этой недели введены (период 31.08–06.09)', () => {
        assertFalse(Mixin._isOverdue({ period: 'Еженедельно', datePrev: '8/31/2026', dateCurr: '9/6/2026' }, new Date(2026, 8, 10, 12, 0)),
            'закрытая неделя накрыта периодом записи');
    });

    test('ЗЕЛЁНЫЙ: точечное показание внутри закрытой недели', () => {
        assertFalse(Mixin._isOverdue({ period: 'Еженедельно', dateCurr: '9/2/2026' }, new Date(2026, 8, 10, 12, 0)),
            'снято в течение закрытой недели — тоже данные этой недели');
    });

    test('СНОВА КРАСНЫЙ: новая неделя (07–13.09) закрылась, данных за неё нет', () => {
        assertTrue(Mixin._isOverdue({ period: 'Еженедельно', datePrev: '8/31/2026', dateCurr: '9/6/2026' }, new Date(2026, 8, 14, 0, 30)),
            'пн 00:30 — закрылась следующая неделя');
        assertTrue(Mixin._isOverdue({ period: 'Еженедельно', datePrev: '8/31/2026', dateCurr: '9/6/2026' }, new Date(2026, 8, 16, 12, 0)),
            'и держится, пока не введут');
    });

    test('СНОВА ЗЕЛЁНЫЙ: ввели за закрывшуюся неделю (07–13.09)', () => {
        assertFalse(Mixin._isOverdue({ period: 'Еженедельно', datePrev: '9/7/2026', dateCurr: '9/13/2026' }, new Date(2026, 8, 16, 12, 0)),
            'данные за новую закрытую неделю введены');
    });

    test('Граница недели: вс 23:59 — зелёный, пн 00:00 — красный', () => {
        const rec = { period: 'Еженедельно', datePrev: '8/31/2026', dateCurr: '9/6/2026' };
        assertFalse(Mixin._isOverdue(rec, new Date(2026, 8, 13, 23, 59)),
            'вс ещё в неделе 07–13.09 (не закрыта)');
        assertTrue(Mixin._isOverdue(rec, new Date(2026, 8, 14, 0, 0)),
            'пн 00:00 — неделя 07–13.09 закрылась');
    });

    test('Запись накрывает границу недель (31.08–09.09) — зелёный', () => {
        assertFalse(Mixin._isOverdue({ period: 'Еженедельно', datePrev: '8/31/2026', dateCurr: '9/9/2026' }, new Date(2026, 8, 10, 12, 0)),
            'пересечение с закрытой неделей достаточно');
    });

    test('Ранний ввод текущей недели не закрывает прошлую: точка 09.09 — красный', () => {
        assertTrue(Mixin._isOverdue({ period: 'Еженедельно', dateCurr: '9/9/2026' }, new Date(2026, 8, 10, 12, 0)),
            'закрытая 31.08–06.09 без данных');
    });

    test('Legacy без datePrev — точечный период [d…d]; инвертированный datePrev зажат', () => {
        // точка ДО закрытой недели 31.08–06.09 — красный
        assertTrue(Mixin._isOverdue({ period: 'Еженедельно', dateCurr: '8/30/2026', datePrev: null }, new Date(2026, 8, 10, 12, 0)),
            'нет datePrev — точка 8/30 не накрывает 31.08–06.09');
        // точка ВНУТРИ закрытой недели (вс 06.09) — зелёный
        assertFalse(Mixin._isOverdue({ period: 'Еженедельно', dateCurr: '9/6/2026', datePrev: null }, new Date(2026, 8, 10, 12, 0)),
            'точечное показание внутри закрытой недели — тоже её данные');
        // битый datePrev (позже dateCurr) зажат в точку 9/6 — зелёный
        assertFalse(Mixin._isOverdue({ period: 'Еженедельно', dateCurr: '9/6/2026', datePrev: '9/8/2026' }, new Date(2026, 8, 10, 12, 0)),
            'инвертированный datePrev зажат в точку внутри закрытой недели');
    });

    test('Нет данных / мусор — красный', () => {
        assertTrue(Mixin._isOverdue({ period: 'Еженедельно', dateCurr: null }, new Date(2026, 8, 10, 12, 0)), 'null');
        assertTrue(Mixin._isOverdue({ period: 'Еженедельно', dateCurr: 'мусор' }, new Date(2026, 8, 10, 12, 0)), 'мусор');
    });

    test('Годовой переход: пн 04.01.2027 — данные 28.12–03.01 зелёные, 21–27.12 красные', () => {
        assertFalse(Mixin._isOverdue({ period: 'Еженедельно', datePrev: '12/28/2026', dateCurr: '1/3/2027' }, new Date(2027, 0, 4, 10, 0)),
            'закрытая неделя через год накрыта');
        assertTrue(Mixin._isOverdue({ period: 'Еженедельно', datePrev: '12/21/2026', dateCurr: '12/27/2026' }, new Date(2027, 0, 4, 10, 0)),
            'данные на неделю старше закрытой');
    });
});

describe('Task 368 — VM: месячные — полный цикл заявки', () => {

    test('КРАСНЫЙ: календарный месяц (август) прошёл, данных нет', () => {
        assertTrue(Mixin._isOverdue({ period: 'Ежемесячно', dateCurr: '7/20/2026' }, new Date(2026, 8, 15, 10, 0)),
            'август закрыт без данных');
    });

    test('ЗЕЛЁНЫЙ: данные за этот месяц введены (период 01–31.08)', () => {
        assertFalse(Mixin._isOverdue({ period: 'Ежемесячно', datePrev: '8/1/2026', dateCurr: '8/31/2026' }, new Date(2026, 8, 15, 10, 0)),
            'закрытый август накрыт');
    });

    test('СНОВА КРАСНЫЙ: текущий месяц (сентябрь) прошёл — 1 окт 00:05', () => {
        assertTrue(Mixin._isOverdue({ period: 'Ежемесячно', datePrev: '8/1/2026', dateCurr: '8/31/2026' }, new Date(2026, 9, 1, 0, 5)),
            'сентябрь закрылся — ждем данные за его период');
        assertTrue(Mixin._isOverdue({ period: 'Ежемесячно', datePrev: '8/1/2026', dateCurr: '8/31/2026' }, new Date(2026, 9, 20, 12, 0)),
            'и держится до ввода');
    });

    test('СНОВА ЗЕЛЁНЫЙ: ввели за сентябрь (01–30.09) в октябре', () => {
        assertFalse(Mixin._isOverdue({ period: 'Ежемесячно', datePrev: '9/1/2026', dateCurr: '9/30/2026' }, new Date(2026, 9, 20, 12, 0)),
            'закрытый сентябрь накрыт');
    });

    test('Граница месяца: 30 сент 23:59 — зелёный, 1 окт 00:00 — красный', () => {
        const rec = { period: 'Ежемесячно', datePrev: '8/1/2026', dateCurr: '8/31/2026' };
        assertFalse(Mixin._isOverdue(rec, new Date(2026, 8, 30, 23, 59)), 'сентябрь ещё открыт');
        assertTrue(Mixin._isOverdue(rec, new Date(2026, 9, 1, 0, 0)), 'октябрь начался — сентябрь закрыт');
    });

    test('Точка внутри закрытого месяца — зелёный; до него — красный', () => {
        assertFalse(Mixin._isOverdue({ period: 'Ежемесячно', dateCurr: '8/20/2026' }, new Date(2026, 8, 15, 10, 0)),
            'показание снято в августе');
        assertTrue(Mixin._isOverdue({ period: 'Ежемесячно', dateCurr: '7/31/2026' }, new Date(2026, 8, 15, 10, 0)),
            'июльская точка августа не накрывает');
    });

    test('Годовой переход: январь 2027 — декабрь накрыт зелёным, ноябрь красный', () => {
        assertFalse(Mixin._isOverdue({ period: 'Ежемесячно', datePrev: '12/1/2026', dateCurr: '12/31/2026' }, new Date(2027, 0, 15, 10, 0)),
            'декабрь через границу года');
        assertTrue(Mixin._isOverdue({ period: 'Ежемесячно', datePrev: '11/1/2026', dateCurr: '11/30/2026' }, new Date(2027, 0, 15, 10, 0)),
            'ноябрь без данных');
    });

    test('Сокращения периодов попадают в месячную ветку', () => {
        assertTrue(Mixin._isOverdue({ period: 'Ежемес.', dateCurr: '7/20/2026' }, new Date(2026, 8, 15, 10, 0)),
            '«Ежемес.» — август не накрыт');
        assertFalse(Mixin._isOverdue({ period: 'раз в месяц', datePrev: '8/1/2026', dateCurr: '8/31/2026' }, new Date(2026, 8, 15, 10, 0)),
            '«раз в месяц» — август накрыт');
    });
});

describe('Task 368 — VM: суточная логика (Task 365) не сломана', () => {

    test('Вчерашние данные сегодня в 7:00 — зелёный; позавчерашние — красный', () => {
        assertFalse(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/9/2026' }, new Date(2026, 8, 10, 7, 0)));
        assertTrue(Mixin._isOverdue({ period: 'Ежедневно', dateCurr: '9/8/2026' }, new Date(2026, 8, 10, 7, 0)));
    });
});

// ============================================================
// C. VM (форма) — _applyEntryTypeFields с моками DOM
//    Фиксированное «сейчас»: чт 10.09.2026 07:30
// ============================================================
const RealDate = Date;
const FIXED_NOW = new RealDate(2026, 8, 10, 7, 30);
function FakeDate(y, m, d, h, mi, s) {
    if (y === undefined) return FIXED_NOW;
    return new RealDate(y, m, d, h || 0, mi || 0, s || 0);
}

function flowDateToInputValMock(d) {
    if (!d || !(d instanceof RealDate) || isNaN(d.getTime())) return '';
    const m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

let Sheet = null;
let sheetEls = null;
try {
    const applySrc = extractMethod(INDEX_SRC, '_applyEntryTypeFields');
    if (applySrc) {
        sheetEls = {
            flowInputDate:        { value: '' },
            flowInputDateEnd:     { value: '' },
            flowInputDateLabel:   { textContent: '' },
            flowInputDateEndLabel:{ textContent: '' },
            flowInputDateEndGroup:{ style: {} },
            flowInputTitle:       { textContent: '' },
            flowInputField:       { placeholder: '' }
        };
        const ctx = {
            Date: FakeDate,
            document: { getElementById: id => sheetEls[id] || null },
            flowDateToInputVal: flowDateToInputValMock,
            // РЕАЛЬНЫЕ функции границ периодов (Task 368)
            flowPrevWeekRange: fns.flowPrevWeekRange,
            flowPrevMonthRange: fns.flowPrevMonthRange,
            flowEntryTypeAcc: t => t
        };
        vm.createContext(ctx);
        vm.runInContext(
            'var Sheet = { ' + applySrc + ',' +
            ' _isDailyMode: function(m) { return !!(m && m.id === 1); },' +
            " _isWeeklyMeter: function(m) { return !this._isDailyMode(m) && /недел|еженед/.test(String((m && m.period) || '').toLowerCase()); }," +
            " _isMonthlyMeter: function(m) { return !this._isDailyMode(m) && /месяц|месяч|ежемес/.test(String((m && m.period) || '').toLowerCase()); }," +
            (extractMethod(INDEX_SRC, '_parseMdy') || '_parseMdy: function(s) { return null; }') + ',' +
            " _inputEntryType: 'сутки' };",
            ctx);
        Sheet = ctx.Sheet;
    }
} catch (e) { /* ниже упадут с причиной */ }

describe('Task 368 — форма: показания за период двух дат', () => {

    test('Sheet-мок собран', () => {
        assertTrue(Sheet !== null && typeof Sheet._applyEntryTypeFields === 'function',
            '_applyEntryTypeFields извлечён');
    });

    test('№3 (Еженедельно), новый ввод: «Период с 31.08 по 06.09» (прошедшая неделя)', () => {
        sheetEls.flowInputDate.value = '';
        sheetEls.flowInputDateEnd.value = '';
        sheetEls.flowInputDateEndGroup.style.display = 'none';
        Sheet._applyEntryTypeFields({ id: 3, period: 'Еженедельно', dateCurr: '8/30/2026', datePrev: '8/24/2026' }, false);
        assertEqual(sheetEls.flowInputDateLabel.textContent, 'Период с', 'подпись начала');
        assertEqual(sheetEls.flowInputDateEndLabel.textContent, 'по', 'подпись конца');
        assertEqual(sheetEls.flowInputDate.value, '2026-08-31', 'дефолт «с» = пн прошлой недели');
        assertEqual(sheetEls.flowInputDateEnd.value, '2026-09-06', 'дефолт «по» = вс прошлой недели');
        assertEqual(sheetEls.flowInputDateEndGroup.style.display, '', 'поле «по» видно');
    });

    test('№9 (Ежемесячно), новый ввод: «Период с 01.08 по 31.08» (прошлый месяц)', () => {
        sheetEls.flowInputDate.value = '';
        sheetEls.flowInputDateEnd.value = '';
        Sheet._applyEntryTypeFields({ id: 9, period: 'Ежемесячно', dateCurr: '7/31/2026', datePrev: '7/1/2026' }, false);
        assertEqual(sheetEls.flowInputDateLabel.textContent, 'Период с', 'подпись начала');
        assertEqual(sheetEls.flowInputDate.value, '2026-08-01', 'дефолт «с» = 1-е число прошлого месяца');
        assertEqual(sheetEls.flowInputDateEnd.value, '2026-08-31', 'дефолт «по» = последнее число');
        assertEqual(sheetEls.flowInputDateEndGroup.style.display, '', 'поле «по» видно');
    });

    test('№11 («Еженед.» — сокращение) — тоже периодная форма', () => {
        sheetEls.flowInputDate.value = '';
        sheetEls.flowInputDateEnd.value = '';
        Sheet._applyEntryTypeFields({ id: 11, period: 'Еженед.', dateCurr: '8/30/2026' }, false);
        assertEqual(sheetEls.flowInputDate.value, '2026-08-31', 'дефолт недели');
        assertEqual(sheetEls.flowInputDateEnd.value, '2026-09-06', 'дефолт «по»');
        assertEqual(sheetEls.flowInputDateLabel.textContent, 'Период с', 'подпись');
    });

    test('Правка №3: поля предзаполнены ДАТАМИ ЗАПИСИ (01–07.09)', () => {
        sheetEls.flowInputDate.value = '';
        sheetEls.flowInputDateEnd.value = '';
        Sheet._applyEntryTypeFields({ id: 3, period: 'Еженедельно', datePrev: '9/1/2026', dateCurr: '9/7/2026' }, true);
        assertEqual(sheetEls.flowInputDate.value, '2026-09-01', 'начало = datePrev записи');
        assertEqual(sheetEls.flowInputDateEnd.value, '2026-09-07', 'конец = dateCurr записи');
        assertEqual(sheetEls.flowInputDateEndGroup.style.display, '', 'поле «по» видно при правке');
    });

    test('Правка №3 с битой датой — откат на дефолты прошедшей недели', () => {
        sheetEls.flowInputDate.value = '';
        sheetEls.flowInputDateEnd.value = '';
        Sheet._applyEntryTypeFields({ id: 3, period: 'Еженедельно', datePrev: 'мусор', dateCurr: 'мусор' }, true);
        assertEqual(sheetEls.flowInputDate.value, '2026-08-31', 'битая дата → дефолт «с»');
        assertEqual(sheetEls.flowInputDateEnd.value, '2026-09-06', 'битая дата → дефолт «по»');
    });

    test('№2 (Ежедневно): одна дата «вчера», поля периода скрыты', () => {
        sheetEls.flowInputDate.value = '';
        sheetEls.flowInputDateEnd.value = '2026-09-06';
        Sheet._applyEntryTypeFields({ id: 2, period: 'Ежедневно', dateCurr: '9/8/2026' }, false);
        assertEqual(sheetEls.flowInputDateLabel.textContent, 'Дата за предыдущие сутки', 'суточная подпись');
        assertEqual(sheetEls.flowInputDate.value, '2026-09-09', 'дефолт — вчера');
        assertEqual(sheetEls.flowInputDateEndGroup.style.display, 'none', 'поле «по» скрыто');
        assertEqual(sheetEls.flowInputDateEnd.value, '', 'значение «по» очищено');
    });

    test('№1 (chips-флоу «За сутки») — периодная ветка его не трогает', () => {
        sheetEls.flowInputDate.value = '';
        sheetEls.flowInputDateEnd.value = '';
        Sheet._applyEntryTypeFields({ id: 1, period: 'Ежедневно', dateCurr: '9/8/2026' }, false);
        assertEqual(sheetEls.flowInputDateLabel.textContent, 'Дата за предыдущие сутки', 'суточная подпись №1');
        assertEqual(sheetEls.flowInputDate.value, '2026-09-09', 'дефолт — вчера');
        assertEqual(sheetEls.flowInputDateEndGroup.style.display, 'none', 'поле «по» скрыто');
    });
});

// ============================================================
// D. SW кэш
// ============================================================
describe('Task 368 — SW кэш', () => {

    test('SW: CACHE_VERSION = kipia-test-v735', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v735'") !== -1,
            'версия кэша поднята до v597');
    });

    test('SW: нет v596 (старая) и нет v598 (двойной бамп)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v596') === -1, 'старая версия не осталась');
        assertTrue(SW_SRC.indexOf('kipia-test-v736') === -1, 'двойного бампа не было');
    });
});
