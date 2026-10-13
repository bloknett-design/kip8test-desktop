// Тесты комментария к «Последним показаниям» расходомера (Task 195).
//
// Правила (по требованию пользователя):
//   • кнопка ввода комментария видна ТОЛЬКО автору последних показаний
//     (сравнение m.modName с email текущего пользователя) ИЛИ АДМИНУ
//     (role === 'Админ', без сравнения email) — Task 195 update;
//   • комментарий — пояснение к данным, строка «Комментарий» видна всем;
//   • возможность комментировать длится, пока показания за автором
//     (без ограничения по времени, в отличие от правки показаний — 1 час);
//     у админа кнопка видна всегда;
//   • хранение: сервер (flowmeter.setComment) + fallback localStorage
//     (kip8_flow_comments_v1) на случай, если серверный патч не задеплоен.
//
// Тестируемые функции: flowCanComment, flowCommentText,
// flowBuildCommentBtnHtml, flowBuildCommentRowHtml,
// flowLocalCommentsLoad, flowLocalCommentsSave.

const { test, describe, assertEqual, assertTrue, assertFalse } = require('./test-helpers.js');
const { extractFunctions, clearMockStorage, setMockStorageItem, getMockStorageKeys } = require('./extract-functions.js');
const fns = extractFunctions();

// Эталонный расходомер (структура как в flowmeter.list / flowmeters.json)
function meter(opts) {
    return Object.assign({
        id: 1,
        hoz: 'Хозрасчёт №1',
        param: 'Расход пара в корпус 114',
        prev: 90.11, curr: 91.11, unit: 'т',
        datePrev: '8/20/2026', dateCurr: '8/20/2026',
        temp: null, gcal: 60.46, period: 'Ежедневно',
        modRole: 'Админ',
        modName: 'duty@plant.local',      // автор последних показаний
        modDisplayName: 'duty@plant.local',
        modTimestamp: '2026-08-20T08:00:00.000Z',
        comment: ''                        // Task 195: серверное поле
    }, opts || {});
}

describe('flowCanComment — право комментирования (автор показаний ИЛИ админ)', () => {

    test('Автор показаний (email совпадает с modName) → true', () => {
        assertTrue(fns.flowCanComment(meter(), 'duty@plant.local'),
            'автор может комментировать');
    });

    test('Другой пользователь → false', () => {
        assertFalse(fns.flowCanComment(meter(), 'other@plant.local'),
            'не-автору кнопка не показывается');
    });

    test('Нет modName (старые данные без автора) → false', () => {
        assertFalse(fns.flowCanComment(meter({ modName: '' }), 'duty@plant.local'),
            'без автора показаний комментировать нельзя');
    });

    test('Нет email текущего пользователя (гость) → false', () => {
        assertFalse(fns.flowCanComment(meter(), null), 'гость — без кнопки');
        assertFalse(fns.flowCanComment(meter(), ''), 'пустой email — без кнопки');
    });

    test('Регистр и пробелы email не влияют на сравнение', () => {
        assertTrue(fns.flowCanComment(meter(), '  DUTY@PLANT.local '),
            'сравнение без учёта регистра и краевых пробелов');
    });

    test('meter = null / undefined → false (защита)', () => {
        assertFalse(fns.flowCanComment(null, 'duty@plant.local'), 'null meter');
        assertFalse(fns.flowCanComment(undefined, 'duty@plant.local'), 'undefined meter');
    });

    test('Ограничения по времени НЕТ: modTimestamp давно — всё равно true', () => {
        // В отличие от правки показаний (окно 1 час), комментировать можно
        // пока показания за автором — даже спустя сутки
        const old = meter({ modTimestamp: '2020-01-01T00:00:00.000Z' });
        assertTrue(fns.flowCanComment(old, 'duty@plant.local'),
            'время ввода показаний не ограничивает комментирование');
    });
});

describe('flowCanComment — АДМИН видит кнопку всегда (Task 195 update)', () => {

    test('Админ — автор показаний → true', () => {
        assertTrue(fns.flowCanComment(meter(), 'duty@plant.local', 'Админ'),
            'админ-автор видит кнопку');
    });

    test('Админ — НЕ автор (modName чужой) → всё равно true', () => {
        const m = meter({ modName: 'duty@plant.local' });
        assertTrue(fns.flowCanComment(m, 'admin@plant.local', 'Админ'),
            'админ видит кнопку даже когда показания ввёл другой пользователь');
    });

    test('Админ — modName пустой (нет автора) → true', () => {
        assertTrue(fns.flowCanComment(meter({ modName: '' }), 'admin@plant.local', 'Админ'),
            'админ видит кнопку даже без автора последних показаний');
    });

    test('Админ — без email (только role) → true', () => {
        assertTrue(fns.flowCanComment(meter(), null, 'Админ'),
            'для админа email не нужен — роль решает');
    });

    test('Роль «Админ» — регистр/пробелы не влияют', () => {
        assertTrue(fns.flowCanComment(meter(), 'admin@plant.local', '  АДМИН '),
            'роль нормализуется (lowercase + trim)');
    });

    test('Не-админ и не автор (role != Админ, email != modName) → false', () => {
        assertFalse(fns.flowCanComment(meter(), 'admin@plant.local', 'КИП ИОС дежурный'),
            'обычная роль без авторства — кнопки нет');
    });

    test('Не-админская роль И автор → true (роль не блокирует автора)', () => {
        assertTrue(fns.flowCanComment(meter(), 'duty@plant.local', 'КИП ИОС дежурный'),
            'автор видит кнопку независимо от своей роли');
    });

    test('Админ + meter = null → false (защита от null)', () => {
        assertFalse(fns.flowCanComment(null, 'admin@plant.local', 'Админ'),
            'null meter — даже админу нельзя');
    });
});

describe('flowBuildCommentBtnHtml — АДМИН видит кнопку (Task 195 update)', () => {

    test('Админу — кнопка рендерится (без комментария)', () => {
        const html = fns.flowBuildCommentBtnHtml(meter(), 'admin@plant.local', '', 'Админ');
        assertTrue(html.indexOf('flow-comment-btn') !== -1, 'кнопка для админа');
        assertTrue(html.indexOf('has-comment') === -1, 'без подсветки (комментария нет)');
        assertTrue(html.indexOf('Добавить комментарий') !== -1, 'aria-label — добавить');
    });

    test('Админу — чужие показания + есть комментарий → подсвеченная «Изменить»', () => {
        const m = meter({ modName: 'duty@plant.local', comment: 'серв. текст' });
        const html = fns.flowBuildCommentBtnHtml(m, 'admin@plant.local', 'серв. текст', 'Админ');
        assertTrue(html.indexOf('flow-comment-btn') !== -1, 'кнопка рендерится');
        assertTrue(html.indexOf('has-comment') !== -1, 'подсветка наличия комментария');
        assertTrue(html.indexOf('Изменить комментарий') !== -1, 'aria-label — изменить');
    });

    test('Админу — modName пустой → кнопка всё равно рендерится', () => {
        const m = meter({ modName: '' });
        const html = fns.flowBuildCommentBtnHtml(m, 'admin@plant.local', '', 'Админ');
        assertTrue(html.indexOf('flow-comment-btn') !== -1,
            'админ видит кнопку даже без автора показаний');
    });

    test('Не-админ (role != Админ) и не автор → кнопки нет', () => {
        const html = fns.flowBuildCommentBtnHtml(meter(), 'admin@plant.local', '', 'КИП ИОС дежурный');
        assertEqual(html, '', 'не-админ без авторства кнопку не видит');
    });

    test('Админ без 4-го аргумента (обратная совместимость) — fallback на email', () => {
        // Старый 3-арг вызов без userRole → админ-проверка не срабатывает,
        // срабатывает проверка email. Если email — не автор → '' .
        const html = fns.flowBuildCommentBtnHtml(meter(), 'admin@plant.local', '');
        assertEqual(html, '', 'без userRole админ-функция не активируется');
    });
});

describe('flowCommentText — текст комментария (сервер приоритетнее локального)', () => {

    test('Серверный комментарий приоритетнее локального', () => {
        const m = meter({ comment: 'серверный текст' });
        const local = { '1': { text: 'локальный текст', ts: 'x' } };
        assertEqual(fns.flowCommentText(m, local), 'серверный текст',
            'показывается серверный комментарий');
    });

    test('Серверного нет → локальный fallback', () => {
        const m = meter({ comment: '' });
        const local = { '1': { text: 'локальный текст', ts: 'x' } };
        assertEqual(fns.flowCommentText(m, local), 'локальный текст',
            'fallback из localStorage');
    });

    test('Серверного поля вообще нет (патч не задеплоен) → локальный', () => {
        const m = meter();
        delete m.comment;
        const local = { '1': { text: 'локальный текст', ts: 'x' } };
        assertEqual(fns.flowCommentText(m, local), 'локальный текст',
            'старый формат ответа сервера — без поля comment');
    });

    test('Ничего нет → пустая строка', () => {
        assertEqual(fns.flowCommentText(meter(), null), '', 'нет серверного, нет карты');
        assertEqual(fns.flowCommentText(meter(), {}), '', 'пустая карта');
    });

    test('localComments = null → только серверный', () => {
        const m = meter({ comment: 'серверный' });
        assertEqual(fns.flowCommentText(m, null), 'серверный', 'без карты — серверный');
    });

    test('Локальная запись с пустым текстом игнорируется', () => {
        const m = meter({ comment: '' });
        const local = { '1': { text: '   ', ts: 'x' } };
        assertEqual(fns.flowCommentText(m, local), '', 'пробельный текст — как пустой');
    });

    test('Запись другого расходомера не мешает', () => {
        const m = meter({ id: 5, comment: '' });
        const local = { '1': { text: 'чужой расходомер', ts: 'x' } };
        assertEqual(fns.flowCommentText(m, local), '', 'комментарий привязан к id');
    });

    test('Пробелы вокруг серверного текста обрезаются', () => {
        const m = meter({ comment: '  текст  ' });
        assertEqual(fns.flowCommentText(m, null), 'текст', 'trim отображаемого текста');
    });
});

describe('flowBuildCommentBtnHtml — кнопка в строке «Последние показания»', () => {

    test('Не автору → кнопки нет (пустой HTML)', () => {
        assertEqual(fns.flowBuildCommentBtnHtml(meter(), 'other@plant.local', ''), '',
            'не-автор не видит кнопку');
    });

    test('Гостю → кнопки нет', () => {
        assertEqual(fns.flowBuildCommentBtnHtml(meter(), null, ''), '',
            'без email кнопка не рендерится');
    });

    test('Автору без комментария → кнопка «Добавить»', () => {
        const html = fns.flowBuildCommentBtnHtml(meter(), 'duty@plant.local', '');
        assertTrue(html.indexOf('flow-comment-btn') !== -1, 'кнопка отрендерена');
        assertTrue(html.indexOf('has-comment') === -1, 'без подсветки (комментария нет)');
        assertTrue(html.indexOf('Добавить комментарий') !== -1, 'aria-label — добавить');
        assertTrue(html.indexOf('openComment') !== -1, 'открывает sheet комментария');
    });

    test('Автору с комментарием → подсвеченная кнопка «Изменить»', () => {
        const html = fns.flowBuildCommentBtnHtml(meter(), 'duty@plant.local', 'продувка линии');
        assertTrue(html.indexOf('has-comment') !== -1, 'подсветка наличия комментария');
        assertTrue(html.indexOf('Изменить комментарий') !== -1, 'aria-label — изменить');
    });

    test('Комментарий из одних пробелов — как отсутствие', () => {
        const html = fns.flowBuildCommentBtnHtml(meter(), 'duty@plant.local', '   ');
        assertTrue(html.indexOf('has-comment') === -1, 'пробельный текст не подсвечивает');
    });
});

describe('flowBuildCommentRowHtml — строка «Комментарий» (видна всем)', () => {

    test('Пустой текст → строки нет', () => {
        assertEqual(fns.flowBuildCommentRowHtml('', false), '', 'нет комментария — нет строки');
        assertEqual(fns.flowBuildCommentRowHtml(null, false), '', 'null — нет строки');
        assertEqual(fns.flowBuildCommentRowHtml('   ', false), '', 'пробелы — нет строки');
    });

    test('Есть текст → строка с лейблом и текстом', () => {
        const html = fns.flowBuildCommentRowHtml('показания после продувки', false);
        assertTrue(html.indexOf('Комментарий') !== -1, 'лейбл строки');
        assertTrue(html.indexOf('показания после продувки') !== -1, 'текст комментария');
        assertTrue(html.indexOf('flow-detail-comment-row') !== -1, 'класс строки');
    });

    test('isLocal=true → пометка «только на этом устройстве»', () => {
        const html = fns.flowBuildCommentRowHtml('локальный текст', true);
        assertTrue(html.indexOf('только на этом устройстве') !== -1,
            'fallback-комментарий помечен');
        assertTrue(html.indexOf('flow-comment-local') !== -1, 'класс пометки');
    });

    test('isLocal=false → без пометки (серверный комментарий)', () => {
        const html = fns.flowBuildCommentRowHtml('серверный текст', false);
        assertTrue(html.indexOf('только на этом устройстве') === -1, 'пометки нет');
    });

    test('XSS: HTML в тексте экранируется', () => {
        const html = fns.flowBuildCommentRowHtml('<script>alert(1)</script>', false);
        assertTrue(html.indexOf('<script>') === -1, 'сырой script не попал в HTML');
        assertTrue(html.indexOf('&lt;script&gt;') !== -1, 'текст экранирован');
    });
});

describe('Локальное хранилище fallback (kip8_flow_comments_v1)', () => {

    // Физический префикс ключа зависит от кратности обёртки
    // isolateLocalStorage в песочнице — вычисляем динамически
    // (по паттерну Task 193).
    function discoverPrefix() {
        clearMockStorage();
        fns.flowLocalCommentsSave({});
        const keys = getMockStorageKeys();
        const logical = 'kip8_flow_comments_v1';
        return keys[0].slice(0, keys[0].length - logical.length);
    }

    test('Roundtrip: save → load', () => {
        clearMockStorage();
        const map = { '3': { text: 'продувка', ts: '2026-08-27T08:00:00Z' } };
        fns.flowLocalCommentsSave(map);
        const loaded = fns.flowLocalCommentsLoad();
        assertEqual(loaded['3'].text, 'продувка', 'запись прочитана');
        assertEqual(loaded['3'].ts, '2026-08-27T08:00:00Z', 'timestamp сохранён');
    });

    test('Удалённая запись исчезает из хранилища', () => {
        clearMockStorage();
        fns.flowLocalCommentsSave({ '1': { text: 'a', ts: 'x' }, '2': { text: 'b', ts: 'y' } });
        const map = fns.flowLocalCommentsLoad();
        delete map['1'];
        fns.flowLocalCommentsSave(map);
        const after = fns.flowLocalCommentsLoad();
        assertEqual(Object.keys(after).length, 1, 'осталась одна запись');
        assertTrue(!!after['2'], 'запись 2 на месте');
    });

    test('Пустое хранилище → пустая карта', () => {
        clearMockStorage();
        const loaded = fns.flowLocalCommentsLoad();
        assertEqual(Object.keys(loaded).length, 0, 'нет записей');
    });

    test('Мусор в хранилище → пустая карта, без исключений', () => {
        const prefix = discoverPrefix();
        clearMockStorage();
        setMockStorageItem(prefix + 'kip8_flow_comments_v1', '{{{не json');
        const loaded = fns.flowLocalCommentsLoad();
        assertEqual(Object.keys(loaded).length, 0, 'мусор игнорируется');
    });

    test('Массив вместо карты → пустая карта (защита типов)', () => {
        const prefix = discoverPrefix();
        clearMockStorage();
        setMockStorageItem(prefix + 'kip8_flow_comments_v1', '[1,2,3]');
        const loaded = fns.flowLocalCommentsLoad();
        assertEqual(Object.keys(loaded).length, 0, 'массив не принимается как карта');
    });
});

describe('flowBuildArchivedCommentRowHtml — Task 197: preview архивного комментария', () => {

    test('Пустой/нет значения → строки нет', () => {
        assertEqual(fns.flowBuildArchivedCommentRowHtml(''), '', 'пусто — нет строки');
        assertEqual(fns.flowBuildArchivedCommentRowHtml(null), '', 'null — нет строки');
        assertEqual(fns.flowBuildArchivedCommentRowHtml(undefined), '', 'undefined — нет строки');
        assertEqual(fns.flowBuildArchivedCommentRowHtml('   '), '', 'пробелы — нет строки');
    });

    test('Корректный формат «[ISO | email]: текст» → строка с разбором', () => {
        const archived = '[2026-08-27T05:47:39.123Z | duty@plant.local]: продувка линии утром';
        const html = fns.flowBuildArchivedCommentRowHtml(archived);
        assertTrue(html.indexOf('flow-archived-comment-row') !== -1, 'строка отрендерена');
        assertTrue(html.indexOf('Последний архивный комментарий') !== -1, 'лейбл присутствует');
        // Дата должна быть отформатирована в dd.mm.yyyy HH:MM
        assertTrue(html.indexOf('27.08.2026') !== -1, 'дата отформатирована в dd.mm.yyyy');
        assertTrue(html.indexOf('duty@plant.local') !== -1, 'email автора показан');
        assertTrue(html.indexOf('продувка линии утром') !== -1, 'текст комментария показан');
        // Метаданные и текст разделены на два span
        assertTrue(html.indexOf('flow-archived-meta') !== -1, 'метаданные в отдельном span');
        assertTrue(html.indexOf('flow-archived-text') !== -1, 'текст в отдельном span');
    });

    test('Формат без двоеточия после ] — весь текст как текст', () => {
        const archived = '[2026-08-27T05:47:39.123Z | duty@plant.local] продувка';
        const html = fns.flowBuildArchivedCommentRowHtml(archived);
        assertTrue(html.indexOf('flow-archived-meta') !== -1, 'метаданные извлечены');
        assertTrue(html.indexOf('продувка') !== -1, 'текст показан');
    });

    test('Произвольный текст (не формат) → показан как есть в .flow-archived-text', () => {
        const html = fns.flowBuildArchivedCommentRowHtml('просто строка без меты');
        assertTrue(html.indexOf('flow-archived-text') !== -1, 'есть span текста');
        assertTrue(html.indexOf('просто строка без меты') !== -1, 'текст показан');
        assertTrue(html.indexOf('flow-archived-meta') === -1 || html.indexOf('flow-archived-meta"></span>') !== -1,
            'метаданные пустые (нет или пустой span)');
    });

    test('HTML-символы в тексте экранируются (XSS-защита)', () => {
        const archived = '[2026-08-27T05:47:39.123Z | duty@plant.local]: <script>alert(1)</script>';
        const html = fns.flowBuildArchivedCommentRowHtml(archived);
        assertTrue(html.indexOf('<script>alert(1)</script>') === -1, 'HTML не вставлен как есть');
        assertTrue(html.indexOf('&lt;script&gt;') !== -1, 'тег экранирован');
    });

    test('Формат с email-адресом сохраняется после форматирования даты', () => {
        const archived = '[2026-08-27T05:47:39.123Z | admin@plant.local]: правка админом';
        const html = fns.flowBuildArchivedCommentRowHtml(archived);
        // После форматирования мета должна содержать « · admin@plant.local»
        // (разделитель | заменён на ·) и дату в dd.mm.yyyy HH:MM.
        assertTrue(html.indexOf('admin@plant.local') !== -1, 'email админа показан');
        assertTrue(html.indexOf('27.08.2026 05:47') !== -1, 'дата+время отформатированы');
    });

    test('Строка-метаданные без даты (любой текст в скобках) — показывается как мета', () => {
        const archived = '[вчера | кто-то]: текст комментария';
        const html = fns.flowBuildArchivedCommentRowHtml(archived);
        assertTrue(html.indexOf('flow-archived-meta') !== -1, 'мета есть');
        assertTrue(html.indexOf('текст комментария') !== -1, 'текст показан');
        // Нет ISO-даты → не падает, дата не форматируется
    });

    test('Очень длинный текст комментария не обрезается (это делает CSS)', () => {
        const longText = 'а'.repeat(500);
        const archived = '[2026-08-27T05:47:39.123Z | duty@plant.local]: ' + longText;
        const html = fns.flowBuildArchivedCommentRowHtml(archived);
        assertTrue(html.indexOf(longText) !== -1, 'длинный текст сохранён целиком');
    });
});
