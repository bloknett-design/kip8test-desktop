// tests/test-task561.js
// Task 561 — заявка пользователя: «Снова нужно заменить ссылку на
// файл "Перечень КИП ИОС рабочий.xlsx" на ссылку
// https://docs.google.com/spreadsheets/d/1VMJHY1DmsRPoWOAYKGN7QU9cjHtWZJlx/edit?usp=sharing&ouid=110493351905411532775&rtpof=true&sd=true,
// она периодически у меня меняется»
//
// РЕШЕНИЕ (конфигурация источника данных, клиент-only — прецеденты
// Task 480/560, смена ссылки ТРЕТИЙ раз):
//   • ID 14l0ac4zGwOblvuH8kRkwwdOymAVXD5op (Task 560) заменён на
//     1VMJHY1DmsRPoWOAYKGN7QU9cjHtWZJlx в 15 файлах: index.html
//     (3 комментария источников), sync-скрипты ×4 (docstring +
//     DEFAULT_SPREADSHEET_ID — ФУНКЦИОНАЛЬНАЯ замена: отсюда кроны
//     GitHub Actions тянут XLSX-экспорт), workflows ×4 (комментарий
//     «КАК НАСТРОИТЬ»), data/*.json ×4 (source-поле), README.md
//     (таблица синков), Системный_промт (таблица «Источники данных»);
//     sw.js/run-all.js — комментарий Task 480 с пометкой «обновлён
//     Task 561» (голый ID не возвращаем — пометка накапливается).
//   • НОВЫЙ ФАЙЛ = чистый экспорт: заголовки ровно 24/13/24/12 БЕЗ
//     растянутых хвостов (артефакты Excel-реимпорта из Task 560 НЕ
//     повторились); харденинг Task 560 (патчи A+B) в sync-скриптах
//     остаётся — на чистом экспорте он ничего не меняет.
//   • Данные из новой таблицы засинкены отдельным chore-коммитом:
//     правки пользователя в блокировках (2 «Замечания», перенос блока
//     ID 206 «Температура воды из поз. 60/3» выше по списку с
//     перенумерацией 207–213; заметка «Изменения в перечнях от
//     26.11»), devices — дата заметки 24.11→26.11 + одно «Примечания»
//     очищено; valves/regulators — контент идентичен; totals прежние
//     1279/518/325/268. ppr_chart идентичен.
//   • worklog.md НЕ менялся при замене — прежние ID в исторических
//     записях (регламент: историю не переписываем). DEPLOY-Task480/560
//     и одноразовые скрипты task480-*/task560-* — тоже история.
//   SW: kipia-test-v769 → v770 (index.html в ASSETS — 3 комментария
//   источников; data/*.json обновятся в персистентном DATA-кэше через
//   SWR text-compare). Комментарий Task 561 в шапку НЕ добавлялся —
//   конвенция со Task 508+ (версия без комментария; Task 545/560 —
//   те же замены ссылки — тоже без комментария).
//
// Task 517-гварды окружения: этот же tests/-каталог синхронизируется
// в kip8test-desktop, где НЕТ .github/workflows/sync-*.yml и README —
// Electron-версия. Ассерты секций 4 (workflows, 12 тестов) и README
// (2 теста секции 6) регистрируются только в PWA-окружении.
//
// Запуск: через tests/run-all.js (require './test-task561.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const OLD_ID = '1eUUwwulUvKUGWTgQ__XP-y7z1aEkt5Wy';   // первый ID (до Task 480)
const MID_ID = '1ZKOPBsD9x4wdlC5rDjz09UypD86G0Cee';   // ID Task 480 (до Task 560)
const PREV_ID = '14l0ac4zGwOblvuH8kRkwwdOymAVXD5op';  // ID Task 560 (до Task 561)
const NEW_ID = '1VMJHY1DmsRPoWOAYKGN7QU9cjHtWZJlx';   // актуальный (Task 561)
const NEW_URL = 'https://docs.google.com/spreadsheets/d/' + NEW_ID + '/edit';

const INDEX_SRC = read('index.html');
const SW_SRC = read('sw.js');
const README_SRC = read('README.md');
const PROMPT_SRC = read('Системный_промт_для_приложения_КИПиА.md');
const RUNALL_SRC = read('tests/run-all.js');

// sync-скрипт → (лист, env-переменная, data-файл)
const SYNC_MAP = {
    'scripts/sync-devices.py':   { sheet: 'Приборы_app',    env: 'DEVICES_SPREADSHEET_ID',    data: 'data/devices.json' },
    'scripts/sync-lockouts.py':  { sheet: 'Блокировки_app', env: 'LOCKOUTS_SPREADSHEET_ID',   data: 'data/lockouts.json' },
    'scripts/sync-valves.py':    { sheet: 'Клапана_app',    env: 'VALVES_SPREADSHEET_ID',     data: 'data/valves.json' },
    'scripts/sync-regulators.py':{ sheet: 'Регуляторы_app', env: 'REGULATORS_SPREADSHEET_ID', data: 'data/regulators.json' }
};
const WORKFLOWS = {
    '.github/workflows/sync-devices.yml':    { script: 'scripts/sync-devices.py',    cron: '0 6 * * *' },
    '.github/workflows/sync-lockouts.yml':   { script: 'scripts/sync-lockouts.py',   cron: '10 3 * * *' },
    '.github/workflows/sync-valves.yml':     { script: 'scripts/sync-valves.py',     cron: '20 3 * * *' },
    '.github/workflows/sync-regulators.yml': { script: 'scripts/sync-regulators.py', cron: '30 3 * * *' }
};

// Task 517/560: гварды окружения (десктоп-CI kip8test-desktop гоняет
// этот же tests/-каталог без воркфлоу-файлов PWA и с Electron-README).
const WORKFLOWS_PRESENT = Object.keys(WORKFLOWS).every((rel) =>
    fs.existsSync(path.join(ROOT, rel)));
const README_IS_PWA = README_SRC.indexOf('# kip8test — тестовый репозиторий PWA') === 0;

// Подсчёт непересекающихся вхождений подстроки
function countOf(haystack, needle) {
    let n = 0, i = 0;
    while ((i = haystack.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
    return n;
}

// Оба прежних ID должны отсутствовать (480-й и 560-й)
function hasOldId(src) {
    return src.indexOf(OLD_ID) !== -1 || src.indexOf(MID_ID) !== -1 ||
        src.indexOf(PREV_ID) !== -1;
}

// ==========================================================================
// 1. SW: версия + комментарий Task 480 (обновлён) + персистентные кэши
// ==========================================================================
describe('Task 561 — SW: версия кэша', () => {

    test("CACHE_VERSION = 'kipia-test-v770'", () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v770';") !== -1,
            'SW поднят до kipia-test-v770 (Task 561)');
    });

    test('прежняя версия v769 отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v769') === -1,
            'в sw.js не осталось kipia-test-v769');
    });

    test('несуществующая v771 отсутствует (guard)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v771') === -1,
            'kipia-test-v771 не должен существовать');
    });

    test('персистентные кэши картинок/данных НЕ инкрементировались', () => {
        assertTrue(SW_SRC.indexOf("IMAGE_CACHE_VERSION = 'kipia-images-test-v3'") !== -1,
            'IMAGE_CACHE_VERSION прежний (v3)');
        assertTrue(SW_SRC.indexOf("DATA_CACHE_VERSION = 'kipia-data-test-v1'") !== -1,
            'DATA_CACHE_VERSION прежний (v1)');
    });

    test('комментарий Task 480 в шапке: АКТУАЛЬНЫЙ ID + пометка Task 561 (окно 11100)', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v770';");
        const ctx = SW_SRC.slice(Math.max(0, i - 11100), i);
        assertTrue(ctx.indexOf('Task 480') !== -1, 'маркер задачи 480');
        assertTrue(ctx.indexOf('«Перечень КИП ИОС рабочий.xlsx»') !== -1,
            'имя файла-источника');
        assertTrue(ctx.indexOf('обновлён Task 561') !== -1,
            'пометка о смене ID задачей 561 (Task 560 — в истории)');
        assertTrue(ctx.indexOf(NEW_ID) !== -1, 'актуальный ID таблицы');
        assertTrue(ctx.indexOf('1291/531/320/268') !== -1,
            'сверка структуры (totals на момент 480)');
        assertTrue(ctx.indexOf('Логики SW не менял') !== -1,
            'логика SW не менялась — только версия');
    });

    test('прежний ID таблицы отсутствует во всём sw.js', () => {
        assertTrue(!hasOldId(SW_SRC), 'следов прежних ID в sw.js нет');
    });
});

// ==========================================================================
// 2. index.html: 3 комментария источников — актуальный ID, прежних нет
// ==========================================================================
describe('Task 561 — index.html: ссылки на источник данных', () => {

    test('актуальный ID встречается ровно 3 раза (3 комментария источников)', () => {
        assertEqual(countOf(INDEX_SRC, NEW_ID), 3,
            'ровно 3 комментария: приборы/блокировки/клапаны-регуляторы');
    });

    test('все 3 вхождения — в форме URL /edit и внутри JS-комментариев', () => {
        assertEqual(countOf(INDEX_SRC, NEW_URL), 3, 'форма URL = /edit');
        const lines = INDEX_SRC.split('\n');
        const withNew = lines.filter(l => l.indexOf(NEW_ID) !== -1);
        assertEqual(withNew.length, 3, 'все вхождения на отдельных строках');
        withNew.forEach((l, idx) => {
            const code = l.replace(/^\s*\/\/.*$/, '');
            assertTrue(code.indexOf(NEW_ID) === -1,
                'вхождение #' + (idx + 1) + ' — внутри комментария, не код');
        });
    });

    test('прежние ID отсутствуют в index.html', () => {
        assertTrue(!hasOldId(INDEX_SRC),
            'обе прежние ссылки полностью убраны');
    });

    test('комментарии-пояснения источников не стёрты (только URL заменён)', () => {
        assertTrue(INDEX_SRC.indexOf('тот же файл, что и для приборов') !== -1,
            'пояснение «тот же файл» живо');
        assertTrue(INDEX_SRC.indexOf('Приборы_app') !== -1,
            'упоминание листа Приборы_app живо');
        assertTrue(INDEX_SRC.indexOf('листу "Блокировки_app"') !== -1,
            'пояснение про лист Блокировки_app живо');
        assertTrue(INDEX_SRC.indexOf('листу "Клапана_app"') !== -1,
            'пояснение про лист Клапана_app живо');
        assertTrue(INDEX_SRC.indexOf('листу "Регуляторы_app"') !== -1,
            'пояснение про лист Регуляторы_app живо');
    });
});

// ==========================================================================
// 3. sync-скрипты: DEFAULT_SPREADSHEET_ID + харденинг Task 560
// ==========================================================================
describe('Task 561 — sync-скрипты: источник тянет из новой таблицы', () => {

    Object.keys(SYNC_MAP).forEach((rel) => {
        const info = SYNC_MAP[rel];

        test(rel + ': DEFAULT_SPREADSHEET_ID = актуальный ID', () => {
            const src = read(rel);
            const m = src.match(/DEFAULT_SPREADSHEET_ID = '([^']+)'/);
            assertTrue(m !== null, 'константа найдена');
            assertEqual(m && m[1], NEW_ID, 'ID заменился');
        });

        test(rel + ': прежние ID отсутствуют', () => {
            assertTrue(!hasOldId(read(rel)),
                'docstring/usage/константа — прежних ID нет');
        });

        test(rel + ': docstring «Источник» указывает актуальный URL', () => {
            assertTrue(read(rel).indexOf('Источник: ' + NEW_URL) !== -1,
                'строка «Источник:» с актуальным URL');
        });

        test(rel + ': имя листа и env-переменная НЕ менялись', () => {
            const src = read(rel);
            assertTrue(src.indexOf("DEFAULT_SHEET_NAME = '" + info.sheet + "'") !== -1,
                'лист ' + info.sheet + ' прежний');
            assertTrue(src.indexOf(info.env) !== -1,
                'env-переменная ' + info.env + ' прежняя');
        });

        test(rel + ': механизм скачивания не менялся (export?format=xlsx)', () => {
            const src = read(rel);
            assertTrue(src.indexOf('export?format=xlsx') !== -1,
                'URL-шаблон экспорта прежний');
            assertTrue(src.indexOf('/tmp/devices_download') !== -1 ||
                       src.indexOf('DOWNLOAD_DIR') !== -1,
                'каталог скачивания прежний');
        });

        test(rel + ': харденинг Task 560 жив после замены Task 561 (пустые хвостовые заголовки + целые float → int)', () => {
            const src = read(rel);
            assertTrue(src.indexOf("while headers and headers[-1] == '':") !== -1,
                'патч A: срез пустых хвостовых заголовков');
            assertTrue(src.indexOf('is_integer') !== -1,
                'патч B: целые float приводятся к int');
            assertTrue(src.indexOf('Task 560') !== -1, 'маркер Task 560');
        });
    });
});

// ==========================================================================
// 4. workflows: комментарии «КАК НАСТРОИТЬ» + расписание не тронуто
//    (Task 517/560: только в PWA-окружении — в десктоп-зеркале
//    .github/workflows синков нет, 12 ассертов не регистрируются)
// ==========================================================================
if (WORKFLOWS_PRESENT) describe('Task 561 — GitHub Actions workflows', () => {

    Object.keys(WORKFLOWS).forEach((rel) => {
        const info = WORKFLOWS[rel];

        test(rel + ': комментарий «КАК НАСТРОИТЬ» указывает актуальный URL', () => {
            const src = read(rel);
            assertTrue(src.indexOf(NEW_URL) !== -1, 'актуальный URL в комментарии');
            assertTrue(src.indexOf('«Перечень КИП ИОС рабочий.xlsx»') !== -1,
                'имя файла в комментарии живо');
        });

        test(rel + ': прежние ID отсутствуют', () => {
            assertTrue(!hasOldId(read(rel)), 'обе прежние ссылки убраны');
        });

        test(rel + ': cron и вызов скрипта НЕ менялись', () => {
            const src = read(rel);
            assertTrue(src.indexOf("cron: '" + info.cron + "'") !== -1,
                'расписание ' + info.cron + ' прежнее');
            assertTrue(src.indexOf('run: python ' + info.script) !== -1,
                'вызов ' + info.script + ' прежний');
            assertTrue(src.indexOf('SPREADSHEET_ID') !== -1,
                'подсказка про переопределение через env жива');
        });
    });
});

// ==========================================================================
// 5. data/*.json: source-поле + структура (харденинг) + якоря нормализации
// ==========================================================================
describe('Task 561 — data/*.json: метаданные источника и структура', () => {

    const DATA_FILES = ['data/devices.json', 'data/lockouts.json',
                        'data/valves.json', 'data/regulators.json'];

    DATA_FILES.forEach((rel) => {
        test(rel + ': source = актуальный URL (форма sync-скрипта)', () => {
            const d = JSON.parse(read(rel));
            assertEqual(d.source, 'Google Sheets: ' + NEW_URL,
                'source-поле обновлено');
        });

        test(rel + ': прежние ID отсутствуют', () => {
            assertTrue(!hasOldId(read(rel)), 'обе прежние ссылки убраны');
        });
    });

    test('totals прежние: 1279/518/325/268 (структура данных не менялась)', () => {
        assertEqual(JSON.parse(read('data/devices.json')).total_devices, 1279, 'devices 1279');
        assertEqual(JSON.parse(read('data/lockouts.json')).total_lockouts, 518, 'lockouts 518');
        assertEqual(JSON.parse(read('data/valves.json')).total_valves, 325, 'valves 325');
        assertEqual(JSON.parse(read('data/regulators.json')).total_regulators, 268, 'regulators 268');
    });

    test('headers прежние: 24/13/24/12 — пустые хвостовые колонки НЕ протащили', () => {
        // Excel-реимпорт растянул формат (26 колонок у трёх листов) —
        // харденинг Task 560 срезает пустые хвостовые заголовки
        assertEqual(JSON.parse(read('data/devices.json')).headers.length, 24, 'devices 24');
        assertEqual(JSON.parse(read('data/lockouts.json')).headers.length, 13, 'lockouts 13');
        assertEqual(JSON.parse(read('data/valves.json')).headers.length, 24, 'valves 24');
        assertEqual(JSON.parse(read('data/regulators.json')).headers.length, 12, 'regulators 12');
    });

    test('якоря нормализации: ID — числа, номера — строки без «.0»', () => {
        const dev = JSON.parse(read('data/devices.json'));
        const lock = JSON.parse(read('data/lockouts.json'));
        const val = JSON.parse(read('data/valves.json'));
        const reg = JSON.parse(read('data/regulators.json'));
        // патч B: Excel-целые-как-float не ломают типы и форму строк
        assertEqual(typeof dev.devices[0].ID, 'number', 'devices[0].ID — число');
        assertEqual(dev.devices[0].ID, 0, 'devices[0].ID = 0 (не строка «0.0»)');
        assertEqual(dev.devices[0]['Наименование'], '≡ Изменения в перечнях от',
            'строка-заметка на месте');
        assertEqual(dev.devices[1]['№ прибора'], '9984837',
            '«№ прибора» без «.0» (не «9984837.0»)');
        assertEqual(lock.lockouts[0]['ID'], 1, 'lockouts[0].ID = 1 (число)');
        assertEqual(lock.lockouts[0]['№ СБС'], '600', '«№ СБС» без «.0»');
        assertEqual(val.valves[0]['DN (мм)'], '40', '«DN (мм)» без «.0»');
        assertEqual(reg.regulators[0]['№ п/п'], '1', '«№ п/п» без «.0»');
    });

    test('devices.json: структура колонок прежняя (24 заголовка, ППР-поля живы)', () => {
        const d = JSON.parse(read('data/devices.json'));
        assertEqual(d.headers.length, 24, '24 колонок');
        assertEqual(d.headers[0], 'ID', 'первая колонка ID');
        ['Дата', 'В гр. ППР', 'Вид ремонта', 'Период ремонта', 'Изображение'].forEach((h) => {
            assertTrue(d.headers.indexOf(h) !== -1, 'колонка «' + h + '» на месте');
        });
    });
});

// ==========================================================================
// 6. README + Системный промт: таблицы источников
// ==========================================================================
describe('Task 561 — документация: таблицы источников', () => {

    if (README_IS_PWA) {
        test('README: 4 строки таблицы синков с актуальным ID', () => {
            assertEqual(countOf(README_SRC, NEW_ID), 4,
                '4 записи: devices/lockouts/valves/regulators');
        });

        test('README: прежние ID отсутствуют', () => {
            assertTrue(!hasOldId(README_SRC), 'обе прежние ссылки убраны');
        });
    }

    test('Промт: таблица «Источники данных» — 4 записи с актуальным ID', () => {
        assertEqual(countOf(PROMPT_SRC, '`' + NEW_ID + '`'), 4,
            '4 записи таблицы: devices/lockouts/valves/regulators');
        ['Приборы_app', 'Блокировки_app', 'Клапана_app', 'Регуляторы_app']
            .forEach((s) => assertTrue(PROMPT_SRC.indexOf(s) !== -1,
                'лист ' + s + ' в таблице'));
    });

    test('Промт: в таблице источников прежние ID отсутствуют', () => {
        const i = PROMPT_SRC.indexOf('### Источники данных');
        assertTrue(i !== -1, 'секция источников найдена');
        const j = PROMPT_SRC.indexOf('###', i + 10);
        const section = PROMPT_SRC.slice(i, j === -1 ? undefined : j);
        assertTrue(!hasOldId(section),
            'прежние ссылки убраны из таблицы источников');
    });
});

// ==========================================================================
// 7. Санитарный скан репозитория: прежних ID нет нигде (кроме истории)
// ==========================================================================
describe('Task 561 — репозиторий: следов прежних ссылок нет', () => {

    test('оба прежних ID отсутствуют во всех рабочих файлах (кроме истории)', () => {
        // worklog.md НЕ проверяем: прежние ID в исторических записях
        // задач (регламент — историю не переписываем). tests/ тоже
        // исключены: негативные ассерты сами содержат прежние ID как
        // вход. DEPLOY-Task480 и scripts/task480-* — исторические.
        // Промт: строки-версии «> **Версия документа**» исключаются —
        // заявки цитируют ID (история); тело/конфиг — чистые.
        const promptBody = PROMPT_SRC.split('\n')
            .filter((l) => !l.startsWith('> **Версия документа'))
            .join('\n');
        const targets = [
            'index.html', 'sw.js', 'charts-desktop.js', 'devices-table-desktop.js',
            'README.md', 'manifest.json',
            'data/devices.json', 'data/lockouts.json', 'data/valves.json',
            'data/regulators.json', 'data/projects.json', 'data/cables.json',
            'data/flowmeters.json', 'data/phonebook.json',
            'scripts/sync-devices.py', 'scripts/sync-lockouts.py',
            'scripts/sync-valves.py', 'scripts/sync-regulators.py',
            'scripts/sync-projects.py', 'scripts/sync-cables.py',
            'scripts/sync-flowmeters.py',
            '.github/workflows/sync-devices.yml', '.github/workflows/sync-lockouts.yml',
            '.github/workflows/sync-valves.yml', '.github/workflows/sync-regulators.yml',
            'tests/run-all.js'
        ];
        const dirty = [];
        targets.forEach((rel) => {
            let p = path.join(ROOT, rel);
            if (!fs.existsSync(p)) return;  // manifest.json может отсутствовать
            if (hasOldId(read(rel))) dirty.push(rel);
        });
        if (hasOldId(promptBody)) dirty.push('Системный_промт (тело)');
        assertEqual(dirty.length, 0, 'чисто: ' + (dirty.join(', ') || 'следов нет'));
    });

    test('прочие таблицы проекта НЕ затронуты (каб. журнал/проекты/расходомеры)', () => {
        // Замена точечная: только «Перечень КИП ИОС рабочий.xlsx»
        assertEqual(countOf(read('scripts/sync-cables.py'), '1XsmoyE4CpIcrNqmeFXIuNzi7vuOzxwZix109YlXkv8Y'), 3,
            'ID кабельного журнала жив (docstring+usage+константа)');
        assertEqual(countOf(read('scripts/sync-projects.py'), '1IQq8S4-Qao1eJKli3zgMvTpA2exkGYg0'), 3,
            'ID проектов жив');
        assertEqual(countOf(read('scripts/sync-flowmeters.py'), '1enZSq7K8pwJVzaAI_tbXZtvATqARTxH0lSU4c-wc1eY'), 3,
            'ID расходомеров жив');
        assertTrue(INDEX_SRC.indexOf('1enZSq7K8pwJVzaAI_tbXZtvATqARTxH0lSU4c-wc1eY') !== -1,
            '_GOOGLE_SHEET_URL расходомеров в index.html жив');
    });
});

// ==========================================================================
// 8. Раннер: test-task560.js подключён, комментарий Task 480 обновлён
// ==========================================================================
describe('Task 561 — tests/run-all.js', () => {

    test('run-all.js подключает test-task561.js', () => {
        assertTrue(RUNALL_SRC.indexOf("require('./test-task561.js')") !== -1,
            'require на месте');
    });

    test('комментарий Task 480 в run-all.js обновлён (актуальный ID, пометка Task 561)', () => {
        const i = RUNALL_SRC.indexOf('Task 480 —');
        assertTrue(i !== -1, 'комментарий Task 480 найден');
        const ctx = RUNALL_SRC.slice(i, i + 400);
        assertTrue(ctx.indexOf(NEW_ID) !== -1, 'актуальный ID в комментарии');
        assertTrue(ctx.indexOf('Task 561') !== -1, 'пометка Task 561');
        assertTrue(!hasOldId(RUNALL_SRC), 'прежних ID в run-all.js нет');
    });
});

console.log('test-task561: все describes зарегистрированы');
