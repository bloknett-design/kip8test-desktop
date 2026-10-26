// ============================================================
// Task 520 — заявка: «В разделе Табель учёта рабочего времени, в
// окне мероприятий отображение списка СИЗ на месяц отобрази вместо
// формата "до 01.10 / СИЗ · Обувь специальная… · Чикризов Ю." в
// формате "Обувь специальная… · Чикризов Ю.", и ниже добавь новую
// группу из списка с просроченной выдачей СИЗ за всё время с
// указанием месяца и года (месяц и год красного цвета),
// отсортированный по фамилиям работников».
//
// Правки _renderMonthEventsPanel (окно 2 бара, Task 315/394/404):
//  1. Секция «СИЗ · <месяц год> · N» (истекающие в месяце): формат
//     строки УПРОЩЁН — БЕЗ жирной даты «до дд.мм» и БЕЗ префикса
//     «СИЗ · » (осталось: точка + «наименование · ФИО»; месяц и так
//     в заголовке плашки, дублирование убрано);
//  2. НОВАЯ группа «Просроченная выдача СИЗ · N» — записи,
//     чья дата_окончания УЖЕ < «сегодня» (ISO-граница — как
//     .ws-ep-past Task 380 и красная дата карточки Task 444), ЗА ВСЁ
//     ВРЕМЯ: НЕ зависит от открытого месяца и выбранного дня;
//     «До износа»/без даты — не показываются; строка: точка +
//     КРАСНЫЙ «мм.гггг» (.ws-ep-date-bad, приём Task 504) +
//     «наименование · ФИО»; сортировка ПО ФАМИЛИЯМ (заявка), затем
//     дата и наименование; БЕЗ .ws-ep-past (группа вся про
//     просроченное — красные даты не «выцветают»);
//  3. Запись, истекающая в текущем месяце и уже просроченная,
//     ОСТАЁТСЯ в секции месяца (прозрачный фон) И попадает в группу
//     просрочки — два отчёта с разными смыслами, дубли — не баг.
//
// Инвариант дат (приём Task 380): «просрочено всегда» = год назад
// (iso(Y-1, M, D) < сегодня при любом дне запуска), «будущее
// всегда» = год вперёд; «просрочено И внутри открытого месяца» =
// последний день ПРОШЛОГО месяца (весь прошлый месяц < сегодня).
// ============================================================

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

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
    return m ? String(m) : '';
}

// ============================================================
// 1. SRC — структура кода окна
// ============================================================
describe('Task 520 — SRC: окно мероприятий', () => {

    test('_renderMonthEventsPanel: метод извлекается', () => {
        const m = methodText(INDEX_SRC, '_renderMonthEventsPanel');
        assertTrue(m.length > 1000, 'метод найден и не пуст');
    });

    test('формат строки месяца — наименование · ФИО (без даты/префикса)', () => {
        const m = methodText(INDEX_SRC, '_renderMonthEventsPanel');
        assertTrue(m.indexOf("this._esc(String(ppz['наименование'] || '') +") !== -1,
            'текст строки месяца: конкатенация наименование + ФИО');
        assertFalse(m.indexOf("'<b class=\"ws-ep-date\">до ' +") !== -1,
            'жирной даты «до дд.мм» в строках СИЗ нет');
        assertFalse(m.indexOf("'СИЗ · ' + String") !== -1,
            'префикса «СИЗ · » в строках СИЗ нет');
    });

    test('группа просрочки: сборка ppeOver + граница «сегодня»', () => {
        const m = methodText(INDEX_SRC, '_renderMonthEventsPanel');
        assertTrue(m.indexOf('var ppeOver = [];') !== -1,
            'сборка ppeOver есть');
        assertTrue(m.indexOf('if (oExpIso >= todayIso) continue;') !== -1,
            'в группу попадают ТОЛЬКО даты раньше «сегодня» (строго)');
        assertTrue(m.indexOf("oExpIso === 'До износа'") !== -1,
            '«До износа» не показывается');
        assertTrue(m.indexOf('masterTabs[oRec[\'таб_номер\']]') !== -1,
            'Task 399: СИЗ мастеров скрыты и в группе просрочки');
    });

    test('группа просрочки: сортировка ПО ФАМИЛИЯМ (заявка)', () => {
        const m = methodText(INDEX_SRC, '_renderMonthEventsPanel');
        // ищем от ppeOver.sort: String(a['дата_окончания']) есть и в
        // сортировке секции месяца (ppeList.sort) — она РАНЬШЕ
        const iSort = m.indexOf('ppeOver.sort');
        const iFio = m.indexOf("String(fioIdx[a['таб_номер']] || a['таб_номер'])", iSort);
        const iDate = m.indexOf("String(a['дата_окончания'])", iSort);
        const iName = m.indexOf("String(a['наименование'] || '')", iSort);
        assertTrue(iSort !== -1 && iFio !== -1,
            'первичный ключ сортировки — ФИО работника');
        assertTrue(iDate !== -1 && iFio < iDate,
            'затем дата окончания (вторичный ключ)');
        assertTrue(iName !== -1 && iDate < iName,
            'затем наименование (третичный ключ)');
    });

    test('группа просрочки: КРАСНЫЙ мм.гггг из ISO-даты', () => {
        const m = methodText(INDEX_SRC, '_renderMonthEventsPanel');
        assertTrue(m.indexOf("'<b class=\"ws-ep-date ws-ep-date-bad\">' +") !== -1,
            'дата группы — красный .ws-ep-date-bad (Task 504)');
        assertTrue(m.indexOf(".slice(5, 7) + '.' +") !== -1,
            '«мм.гггг»: месяц = slice(5, 7)');
        assertTrue(m.indexOf(".slice(0, 4);") !== -1,
            'год = slice(0, 4)');
        assertTrue(m.indexOf('Просроченная выдача СИЗ · ') !== -1,
            'заголовок группы со счётчиком');
    });

    test('группа просрочки: БЕЗ ws-ep-past (красное не «выцветает»)', () => {
        const m = methodText(INDEX_SRC, '_renderMonthEventsPanel');
        // в строке группы НЕТ конкатенации pPast (в секции месяца — есть)
        const overRow = m.indexOf("'<span class=\"ws-ep-item\">' +");
        const monthRow = m.indexOf("'<span class=\"ws-ep-item' + pPast + '\">' +");
        assertTrue(overRow !== -1 && monthRow !== -1,
            'строка группы — фиксированный класс (без past), строки месяца — с past');
    });

    test('порядок: секция месяца РАНЬШЕ группы просрочки', () => {
        const m = methodText(INDEX_SRC, '_renderMonthEventsPanel');
        const iMonthCap = m.indexOf("ws-ep-cap-ppe\">СИЗ · ' +");
        const iOverCap = m.indexOf("'Просроченная выдача СИЗ · ' +");
        assertTrue(iMonthCap !== -1 && iOverCap !== -1,
            'обе плашки есть');
        assertTrue(iMonthCap < iOverCap,
            'месяц — выше, просрочка — ниже (заявка: «ниже добавь»)');
    });
});

// ============================================================
// 2. VM — окно по данным (харнесс test-task399 + viewLevel)
// ============================================================
function panelHost(opts) {
    const el = { innerHTML: '', hidden: true };
    const document = { getElementById: function(id) {
        return id === 'wsEventsPanel' ? el : null;
    }};
    const texts = ['_instrShortOf', '_normInstrKey',
                   '_renderMonthEventsPanel', '_trainingCodeOf',
                   '_statusMeta', '_isMasterKipia']
        .map(n => methodText(INDEX_SRC, n));
    const make = new Function('localStorage', 'document', 'confirm',
                              'KipToast', 'kipConfirm',
        'return ({' + texts.join(',\n') + ',\n' +
        '_viewLevel: ' + (opts.viewLevel === undefined
            ? 'undefined' : ("'" + opts.viewLevel + "'")) + ',' +
        '_year: ' + (opts.year || 2026) + ', _month: ' + (opts.month || 9) + ',' +
        '_selDay: ' + (opts.selDay === undefined ? 'null' : opts.selDay) + ',' +
        '_TRAININGS: ' + JSON.stringify(opts.trainings || []) + ',' +
        '_VACATIONS: ' + JSON.stringify(opts.vacations || []) + ',' +
        '_PPE: ' + JSON.stringify(opts.ppe || []) + ',' +
        '_EMPLOYEES: ' + JSON.stringify(opts.employees || [
            { 'таб_номер': '0871', 'ФИО': 'Иванов Иван Иванович' }]) + ',' +
        '_STATUS_CODES: [],' +
        '_esc: function(s){ return String(s == null ? "" : s); },' +
        '_escAttr: function(s){ return String(s == null ? "" : s); },' +
        '_isoDate: function(dt){ var m=(""+(dt.getMonth()+1)).padStart(2,"0"); var d=(""+dt.getDate()).padStart(2,"0"); return dt.getFullYear()+"-"+m+"-"+d; }, _barExpSync: function() {},' +
        '});');
    const ctx = make(null, document, null, null, null);
    ctx._renderMonthEventsPanel();
    return el;
}

// Даты-инварианты (см. шапку файла)
const NOW = new Date();
const Y = NOW.getFullYear(), M = NOW.getMonth() + 1, D = NOW.getDate();
const pad = function(n) { return (n < 10 ? '0' : '') + n; };
const iso = function(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); };
const OVERDUE = iso(Y - 1, M, D);            // год назад — всегда < сегодня
const FUTURE = iso(Y + 1, M, D);             // год вперёд — всегда > сегодня
const PM = (M === 1) ? { y: Y - 1, m: 12 } : { y: Y, m: M - 1 };
const PM_LAST = iso(PM.y, PM.m, new Date(PM.y, PM.m, 0).getDate()); // конец прошлого месяца
const MONTHS_NOM = ['январь','февраль','март','апрель','май','июнь',
                    'июль','август','сентябрь','октябрь','ноябрь','декабрь'];

describe('Task 520 — VM: формат секции месяца', () => {

    test('строка месяца: «наименование · ФИО» — без даты и префикса', () => {
        const el = panelHost({
            year: Y, month: M,
            ppe: [{ 'таб_номер': '0871', 'наименование': 'Каска защитная',
                    'дата_окончания': iso(Y, M, new Date(Y, M, 0).getDate()) }],
        });
        const html = el.innerHTML;
        assertTrue(html.indexOf('СИЗ · ' + MONTHS_NOM[M - 1] + ' ' + Y + ' · 1') !== -1,
            'плашка месяца с счётчиком');
        assertTrue(html.indexOf('Каска защитная · Иванов Иван Иванович') !== -1,
            'текст: наименование · ФИО');
        assertFalse(html.indexOf('СИЗ · Каска') !== -1,
            'префикса «СИЗ · » нет');
        assertTrue(html.match(/<b class="ws-ep-date">/) === null,
            'жирных дат «до дд.мм» в секции месяца нет вовсе');
    });
});

describe('Task 520 — VM: группа «Просроченная выдача СИЗ»', () => {

    test('просроченная (год назад) — в группе, с красным мм.гггг', () => {
        const el = panelHost({
            year: Y, month: M,
            ppe: [{ 'таб_номер': '0871', 'наименование': 'Обувь специальная',
                    'дата_окончания': OVERDUE }],
        });
        const html = el.innerHTML;
        assertTrue(html.indexOf('Просроченная выдача СИЗ · 1') !== -1,
            'плашка группы со счётчиком');
        assertTrue(html.indexOf('<b class="ws-ep-date ws-ep-date-bad">' +
                                pad(M) + '.' + (Y - 1) + '</b>') !== -1,
            'красный месяц.год окончания: ' + pad(M) + '.' + (Y - 1));
        assertTrue(html.indexOf('Обувь специальная · Иванов Иван Иванович') !== -1,
            'текст: наименование · ФИО');
    });

    test('будущая и «До износа» — НЕ в группе', () => {
        const el = panelHost({
            year: Y, month: M,
            ppe: [
                { 'таб_номер': '0871', 'наименование': 'Перчатки',
                  'дата_окончания': FUTURE },
                { 'таб_номер': '0871', 'наименование': 'Очки',
                  'дата_окончания': 'До износа' },
            ],
        });
        assertFalse(el.innerHTML.indexOf('Просроченная выдача СИЗ') !== -1,
            'пустая группа скрыта');
        assertFalse(el.innerHTML.indexOf('Перчатки') !== -1,
            'будущее окончание — не просрочено');
        assertFalse(el.innerHTML.indexOf('Очки') !== -1,
            '«До износа» — без даты, скрыто');
    });

    test('«за всё время»: видна в ЧУЖОМ месяце и НЕ зависит от дня', () => {
        // чужой месяц — следующий (окно там, просрочка — от года назад)
        const NX = (M === 12) ? { y: Y + 1, m: 1 } : { y: Y, m: M + 1 };
        const ppe = [{ 'таб_номер': '0871', 'наименование': 'Костюм',
                       'дата_окончания': OVERDUE }];
        const elN = panelHost({ year: NX.y, month: NX.m, ppe: ppe });
        assertTrue(elN.innerHTML.indexOf('Просроченная выдача СИЗ · 1') !== -1,
            'группа видна и в чужом месяце (за всё время)');
        assertFalse(elN.innerHTML.indexOf('СИЗ · ' + MONTHS_NOM[NX.m - 1]) !== -1,
            'секции месяца в чужом месяце нет (истечение — не там)');
        const elDay = panelHost({ year: NX.y, month: NX.m, selDay: 15, ppe: ppe });
        assertTrue(elDay.innerHTML.indexOf('Просроченная выдача СИЗ · 1') !== -1,
            'режим выбранного дня группу НЕ сужает');
    });

    test('сортировка ПО ФАМИЛИЯМ (заявка)', () => {
        const emps = [
            { 'таб_номер': '0101', 'ФИО': 'Якушев Я. Я.' },
            { 'таб_номер': '0202', 'ФИО': 'Абрамов А. А.' },
            { 'таб_номер': '0303', 'ФИО': 'Кузнецов К. К.' },
        ];
        // вход в ОБРАТНОМ порядке (id по убыванию — как из реестра)
        const ppe = [
            { 'таб_номер': '0101', 'наименование': 'Щит', 'дата_окончания': OVERDUE },
            { 'таб_номер': '0303', 'наименование': 'Респиратор', 'дата_окончания': OVERDUE },
            { 'таб_номер': '0202', 'наименование': 'Каска', 'дата_окончания': OVERDUE },
        ];
        const el = panelHost({ year: Y, month: M, employees: emps, ppe: ppe });
        const html = el.innerHTML;
        assertTrue(html.indexOf('Просроченная выдача СИЗ · 3') !== -1,
            'счётчик — 3');
        const iA = html.indexOf('Абрамов А. А.');
        const iK = html.indexOf('Кузнецов К. К.');
        const iY = html.indexOf('Якушев Я. Я.');
        assertTrue(iA !== -1 && iK !== -1 && iY !== -1, 'все ФИО в группе');
        assertTrue(iA < iK && iK < iY,
            'порядок по фамилиям: Абрамов → Кузнецов → Якушев');
    });

    test('у одного работника — по ДАТЕ окончания (вторичный ключ)', () => {
        const ppe = [
            { 'таб_номер': '0871', 'наименование': 'Ботинки',
              'дата_окончания': iso(Y - 1, M, D) },
            { 'таб_номер': '0871', 'наименование': 'Перчатки',
              'дата_окончания': iso(Y - 2, M, D) },
        ];
        const el = panelHost({ year: Y, month: M, ppe: ppe });
        const html = el.innerHTML;
        const iP = html.indexOf('Перчатки · Иванов Иван Иванович');
        const iB = html.indexOf('Ботинки · Иванов Иван Иванович');
        assertTrue(iP !== -1 && iB !== -1, 'обе записи одного работника');
        assertTrue(iP < iB, 'раньше истекшая (Y-2) — выше');
    });

    test('min — СИЗ мастеров в группе просрочки НЕТ (Task 399)', () => {
        const emps = [
            { 'таб_номер': '2706', 'ФИО': 'Галкин Д. Н.', 'должность': 'Мастер КИПиА' },
            { 'таб_номер': '0377', 'ФИО': 'Первов С. А.', 'должность': 'Слесарь КИПиА' },
        ];
        const ppe = [
            { 'таб_номер': '2706', 'наименование': 'Щит мастера',
              'дата_окончания': OVERDUE },
            { 'таб_номер': '0377', 'наименование': 'Перчатки слесаря',
              'дата_окончания': OVERDUE },
        ];
        const el = panelHost({ viewLevel: 'min', year: Y, month: M,
                               employees: emps, ppe: ppe });
        const html = el.innerHTML;
        assertTrue(html.indexOf('Просроченная выдача СИЗ · 1') !== -1,
            'счётчик — только не-мастер');
        assertFalse(html.indexOf('Щит мастера') !== -1, 'мастер скрыт');
        assertFalse(html.indexOf('Галкин') !== -1, 'ФИО мастера скрыто');
        assertTrue(html.indexOf('Перчатки слесаря · Первов С. А.') !== -1,
            'не-мастер показан');
    });

    test('строки группы — БЕЗ ws-ep-past (красное не «выцветает»)', () => {
        // чужой месяц: секция месяца пуста → past только от группы
        const NX = (M === 12) ? { y: Y + 1, m: 1 } : { y: Y, m: M + 1 };
        const el = panelHost({
            year: NX.y, month: NX.m,
            ppe: [{ 'таб_номер': '0871', 'наименование': 'Каска',
                    'дата_окончания': OVERDUE }],
        });
        assertEqual((el.innerHTML.match(/ws-ep-past/g) || []).length, 0,
            'в группе просрочки нет прозрачного фона');
        assertEqual((el.innerHTML.match(/<span class="ws-ep-item/g) || []).length, 1,
            'одна строка — в группе (секция месяца пуста)');
    });

    test('дубли не баг: истекающая в месяце И просроченная — в ОБОИХ секциях', () => {
        // последний день ПРОШЛОГО месяца: внутри месяца И < сегодня
        const el = panelHost({
            year: PM.y, month: PM.m,
            ppe: [{ 'таб_номер': '0871', 'наименование': 'Каска',
                    'дата_окончания': PM_LAST }],
        });
        const html = el.innerHTML;
        assertTrue(html.indexOf('СИЗ · ' + MONTHS_NOM[PM.m - 1] + ' ' + PM.y + ' · 1') !== -1,
            'секция месяца: истекает в нём');
        assertTrue(html.indexOf('Просроченная выдача СИЗ · 1') !== -1,
            'И группа просрочки: уже просрочена');
        // порядок: месяц — выше, просрочка — ниже
        assertTrue(html.indexOf('СИЗ · ' + MONTHS_NOM[PM.m - 1]) <
                   html.indexOf('Просроченная выдача СИЗ'),
            'группа просрочки — НИЖЕ секции месяца (заявка)');
        // строка месяца — прозрачная (past), строка группы — обычная
        assertEqual((html.match(/ws-ep-past/g) || []).length, 1,
            'past — только на строке секции месяца');
        assertEqual((html.match(/<span class="ws-ep-item/g) || []).length, 2,
            'две строки: месяц + просрочка');
    });
});

// ============================================================
// 3. SW — версия поднята (фронтенд менялся)
// ============================================================
describe('Task 520 — SW', () => {

    test('SW: kipia-test-v759', () => {
        assertTrue(SW_SRC.indexOf("CACHE_VERSION = 'kipia-test-v759'") !== -1,
            'версия кэша kipia-test-v759');
        assertFalse(SW_SRC.indexOf('kipia-test-v760') !== -1,
            'двойного бампа нет');
    });
});
