// tests/test-task480.js
// Task 480 — заявка пользователя: «Поменяй во всех связанных местах
// и файлах приложения, адрес ссылки на файл "Перечень КИП ИОС
// рабочий.xlsx" теперь такой
// https://docs.google.com/spreadsheets/d/1ZKOPBsD9x4wdlC5rDjz09UypD86G0Cee/edit?usp=sharing&ouid=110493351905411532775&rtpof=true&sd=true»
//
// РЕШЕНИЕ (конфигурация источника данных, клиент-only):
//   • Старый ID таблицы 1eUUwwulUvKUGWTgQ__XP-y7z1aEkt5Wy заменён на
//     новый 1ZKOPBsD9x4wdlC5rDjz09UypD86G0Cee в 15 файлах:
//     index.html (3 комментария источников данных), sync-скрипты ×4
//     (docstring + DEFAULT_SPREADSHEET_ID — ФУНКЦИОНАЛЬНАЯ замена:
//     именно отсюда кроны GitHub Actions тянут XLSX-экспорт),
//     .github/workflows/sync-*.yml ×4 (комментарий «КАК НАСТРОИТЬ»),
//     data/*.json ×4 (source-поле — метаданные синка), README.md
//     (таблица источников), Системный_промт (таблица «Источники
//     данных»: один файл на 4 листа Приборы/Блокировки/Клапана/
//     Регуляторы _app).
//   • Структура НОВОЙ таблицы сверена локально (task480-check-sheet):
//     валидный xlsx-экспорт, все 4 листа _app присутствуют, заголовки
//     идентичны (24/13/24/12 колонок), totals совпадают со старыми
//     данными (1291/531/320/268) — новый файл является копией старого.
//   • URL в файлах — чистая форма /edit (без usp/ouid/rtpof/sd —
//     параметры шаринга из ссылки пользователя на экспорт не влияют);
//     экспорт выполняется по проверенному шаблону export?format=xlsx.
//   • worklog.md НЕ менялся — там старый ID остаётся в ИСТОРИЧЕСКИХ
//     записях задач (по регламенту история не переписывается).
//   SW: kipia-test-v703 → v704 (index.html в ASSETS — перекешируется
//   бампом; data/*.json обновятся в персистентном DATA-кэше через SWR
//   text-compare). Комментарий Task 480 компактен (~250 симв.).
//   Окна истории: Task 478 700 → 1100 (комментарий 480 отодвинул до
//   ~835); якоря 461/471/472/474 в прежних окнах (запасы 101+).
//
// Task 517 (чинка desktop-CI синка): два гварда окружения — этот же
//     tests/-каталог теперь синхронизируется в kip8test-desktop
//     (sync-to-desktop.yml, полный набор фикстур), где НЕТ
//     .github/workflows/sync-*.yml (воркфлоу — принадлежность PWA-репо)
//     и README — Electron-версия («kip8test-desktop — КИПиА (TEST)
//     Desktop», без таблицы синков). Ассерты секций 4 (workflows, 12
//     тестов) и README (2 теста секции 6) регистрируются только в
//     PWA-окружении: kip8test 6489/0, десктоп-CI 6489 − 14 = 6475/0.
//
// Запуск: через tests/run-all.js (require './test-task480.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const OLD_ID = '1eUUwwulUvKUGWTgQ__XP-y7z1aEkt5Wy';
const NEW_ID = '1ZKOPBsD9x4wdlC5rDjz09UypD86G0Cee';
const NEW_URL = 'https://docs.google.com/spreadsheets/d/' + NEW_ID + '/edit';

const INDEX_SRC = read('index.html');
const SW_SRC = read('sw.js');
const README_SRC = read('README.md');
const PROMPT_SRC = read('Системный_промт_для_приложения_КИПиА.md');

// sync-скрипт → (лист, env-переменная)
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

// Task 517: гварды окружения (десктоп-CI kip8test-desktop гоняет этот же
// tests/-каталог без воркфлоу-файлов PWA и с Electron-README).
// WORKFLOWS_PRESENT — все 4 sync-*.yml в checkout (PWA-репо);
// README_IS_PWA — маркер заголовка PWA-README (у десктоп-зеркала заголовок
// «# kip8test-desktop — …», таблицы синков там нет).
const WORKFLOWS_PRESENT = Object.keys(WORKFLOWS).every((rel) =>
    fs.existsSync(path.join(ROOT, rel)));
const README_IS_PWA = README_SRC.indexOf('# kip8test — тестовый репозиторий PWA') === 0;

// Подсчёт непересекающихся вхождений подстроки
function countOf(haystack, needle) {
    let n = 0, i = 0;
    while ((i = haystack.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
    return n;
}

// =========================================================================
// 1. SW: версия + комментарий + персистентные кэши
// ==========================================================================
describe('Task 480 — SW: версия кэша', () => {

    test("CACHE_VERSION = 'kipia-test-v757'", () => {
        assertTrue(SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v757';") !== -1,
            'SW поднят до kipia-test-v757 (Task 480)');
    });

    test('прежняя версия v703 отсутствует', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v703') === -1,
            'в sw.js не осталось kipia-test-v703');
    });

    test('несуществующая v705 отсутствует (guard)', () => {
        assertTrue(SW_SRC.indexOf('kipia-test-v758') === -1,
            'kipia-test-v757 не должен существовать');
    });

    test('персистентные кэши картинок/данных НЕ инкрементировались', () => {
        // URL таблицы — не структура данных: картинки и DATA-кэш живы
        assertTrue(SW_SRC.indexOf("IMAGE_CACHE_VERSION = 'kipia-images-test-v3'") !== -1,
            'IMAGE_CACHE_VERSION прежний (v3)');
        assertTrue(SW_SRC.indexOf("DATA_CACHE_VERSION = 'kipia-data-test-v1'") !== -1,
            'DATA_CACHE_VERSION прежний (v1)');
    });

    test('комментарий Task 480 в шапке версий (окно 2600 → 3200 → 6000, Task 486/490)', () => {
        const i = SW_SRC.indexOf("const CACHE_VERSION = 'kipia-test-v757';");
        // Task 490: +480 симв. комментария — окно 5000 → 6000 (якорь 5440)
        // Task 492: комментарий (~290 симв.) отодвинул якорь Task 480
        // до ~6221 — окно 6000 → 6800.
        // Task 502: окно 9100 → 9800 (якорь 9357).
        const ctx = SW_SRC.slice(Math.max(0, i - 11100), i);
        assertTrue(ctx.indexOf('Task 480') !== -1, 'маркер задачи');
        assertTrue(ctx.indexOf('«Перечень КИП ИОС рабочий.xlsx»') !== -1,
            'имя файла-источника');
        assertTrue(ctx.indexOf(NEW_ID) !== -1, 'новый ID таблицы');
        assertTrue(ctx.indexOf('1291/531/320/268') !== -1,
            'сверка структуры (totals прежние)');
        assertTrue(ctx.indexOf('Логики SW не менял') !== -1,
            'логика SW не менялась — только версия');
    });
});

// ==========================================================================
// 2. index.html: 3 комментария источников — новый ID, старого нет
// ==========================================================================
describe('Task 480 — index.html: ссылки на источник данных', () => {

    test('новый ID встречается ровно 3 раза (3 комментария источников)', () => {
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

    test('старый ID отсутствует в index.html', () => {
        assertTrue(INDEX_SRC.indexOf(OLD_ID) === -1,
            'старая ссылка полностью убрана');
    });

    test('комментарии-пояснения источников не стёрты (только URL заменён)', () => {
        // index.html не содержит имени файла — только URL + пояснения:
        // «тот же файл, что и для приборов…» и ссылки на листы _app
        assertTrue(INDEX_SRC.indexOf('тот же файл, что и для приборов') !== -1,
            'пояснение «тот же файл» живо');
        assertTrue(INDEX_SRC.indexOf('Приборы_app') !== -1,
            'упоминание листа Приборы_app живо (23118, «листа»)');
        assertTrue(INDEX_SRC.indexOf('листу "Блокировки_app"') !== -1,
            'пояснение про лист Блокировки_app живо');
        assertTrue(INDEX_SRC.indexOf('листу "Клапана_app"') !== -1,
            'пояснение про лист Клапана_app живо');
        assertTrue(INDEX_SRC.indexOf('листу "Регуляторы_app"') !== -1,
            'пояснение про лист Регуляторы_app живо');
    });
});

// ==========================================================================
// 3. sync-скрипты: DEFAULT_SPREADSHEET_ID — функциональная замена
// ==========================================================================
describe('Task 480 — sync-скрипты: источник тянет из новой таблицы', () => {

    Object.keys(SYNC_MAP).forEach((rel) => {
        const info = SYNC_MAP[rel];

        test(rel + ': DEFAULT_SPREADSHEET_ID = новый ID', () => {
            const src = read(rel);
            const m = src.match(/DEFAULT_SPREADSHEET_ID = '([^']+)'/);
            assertTrue(m !== null, 'константа найдена');
            assertEqual(m && m[1], NEW_ID, 'ID заменился');
        });

        test(rel + ': старый ID отсутствует', () => {
            assertTrue(read(rel).indexOf(OLD_ID) === -1,
                'docstring/usage/константа — старого ID нет');
        });

        test(rel + ': docstring «Источник» указывает новый URL', () => {
            assertTrue(read(rel).indexOf('Источник: ' + NEW_URL) !== -1,
                'строка «Источник:» с новым URL');
        });

        test(rel + ": имя листа и env-переменная НЕ менялись", () => {
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
    });
});

// ==========================================================================
// 4. workflows: комментарии «КАК НАСТРОИТЬ» + расписание не тронуто
//    (Task 517: только в PWA-окружении — в десктоп-зеркале .github/workflows
//    синков нет, 12 ассертов не регистрируются)
// ==========================================================================
if (WORKFLOWS_PRESENT) describe('Task 480 — GitHub Actions workflows', () => {

    Object.keys(WORKFLOWS).forEach((rel) => {
        const info = WORKFLOWS[rel];

        test(rel + ': комментарий «КАК НАСТРОИТЬ» указывает новый URL', () => {
            const src = read(rel);
            assertTrue(src.indexOf(NEW_URL) !== -1, 'новый URL в комментарии');
            assertTrue(src.indexOf('«Перечень КИП ИОС рабочий.xlsx»') !== -1,
                'имя файла в комментарии живо');
        });

        test(rel + ': старый ID отсутствует', () => {
            assertTrue(read(rel).indexOf(OLD_ID) === -1, 'старая ссылка убрана');
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
// 5. data/*.json: source-поле + данные не тронуты
// ==========================================================================
describe('Task 480 — data/*.json: метаданные источника', () => {

    // Task 491 (rebase поверх авто-синка 5238816d): пользователь удалил
    // 3 прибора в Google Sheets — devices 1291 → 1288 (данные живые,
    // structure/лист/остальные файлы не тронуты)
    // Task 540 (поверх авто-синка f42423f5 от 20.10.2026): пользователь
    // авто-синк c60c426b (21.10.2026) — ещё 1 блокировка удалена: 529 → 528
    // (прецедент: Task 540 → 541 — пины двигаются как ассист)
    const TOTALS = {
        'data/devices.json':    { total: 'total_devices',    value: 1288, sheet: 'Приборы_app' },
        'data/lockouts.json':   { total: 'total_lockouts',   value: 528,  sheet: 'Блокировки_app' },
        'data/valves.json':     { total: 'total_valves',     value: 320,  sheet: 'Клапана_app' },
        'data/regulators.json': { total: 'total_regulators', value: 268,  sheet: 'Регуляторы_app' }
    };

    Object.keys(TOTALS).forEach((rel) => {
        const info = TOTALS[rel];

        test(rel + ': source = новый URL (форма sync-скрипта)', () => {
            const d = JSON.parse(read(rel));
            assertEqual(d.source, 'Google Sheets: ' + NEW_URL,
                'source-поле обновлено');
        });

        test(rel + ': старый ID отсутствует', () => {
            assertTrue(read(rel).indexOf(OLD_ID) === -1, 'старая ссылка убрана');
        });

        test(rel + ': данные НЕ менялись — только source', () => {
            const d = JSON.parse(read(rel));
            assertEqual(d[info.total], info.value,
                info.total + ' = ' + info.value + ' (как до замены)');
            assertEqual(d.sheet, info.sheet, 'лист прежний');
        });
    });

    test('devices.json: структура колонок прежняя (24 заголовка, ID первый)', () => {
        const d = JSON.parse(read('data/devices.json'));
        assertEqual(d.headers.length, 24, '24 колонки — как в новой таблице');
        assertEqual(d.headers[0], 'ID', 'первая колонка ID');
        // Поля ППР-индикации Task 478/479 живы в структуре данных
        ['Дата', 'В гр. ППР', 'Вид ремонта', 'Период ремонта'].forEach((h) => {
            assertTrue(d.headers.indexOf(h) !== -1, 'колонка «' + h + '» на месте');
        });
    });
});

// ==========================================================================
// 6. README + Системный промт: таблицы источников
// ==========================================================================
describe('Task 480 — документация: таблицы источников', () => {

    // Task 517: README-ассерты — только при PWA-README (в десктоп-зеркале
    // README Electron-версии, таблицы синков с ID там нет)
    if (README_IS_PWA) {
        test('README: 4 строки таблицы синков с новым ID', () => {
            assertEqual(countOf(README_SRC, NEW_ID), 4,
                '4 записи: devices/lockouts/valves/regulators');
            ['sync-devices.py', 'sync-lockouts.py', 'sync-valves.py', 'sync-regulators.py']
                .forEach((s) => assertTrue(README_SRC.indexOf(s) !== -1,
                    'скрипт ' + s + ' в таблице'));
        });

        test('README: старый ID отсутствует', () => {
            assertTrue(README_SRC.indexOf(OLD_ID) === -1, 'старая ссылка убрана');
        });
    }

    test('Промт: таблица «Источники данных» — 4 строки с новым ID', () => {
        // строка-версия (заявка) цитирует ОБА ID — это история;
        // конфиг = таблица источников: ID в `backticks`
        assertEqual(countOf(PROMPT_SRC, '`' + NEW_ID + '`'), 4,
            '4 записи таблицы: devices/lockouts/valves/regulators');
        ['Приборы_app', 'Блокировки_app', 'Клапана_app', 'Регуляторы_app']
            .forEach((s) => assertTrue(PROMPT_SRC.indexOf(s) !== -1,
                'лист ' + s + ' в таблице'));
    });

    test('Промт: в таблице источников старый ID отсутствует', () => {
        // проверяем СЕКЦИЮ «Источники данных» (без строки-версии —
        // она цитирует заявку с обоими ID как историю)
        const i = PROMPT_SRC.indexOf('### Источники данных');
        assertTrue(i !== -1, 'секция источников найдена');
        const j = PROMPT_SRC.indexOf('###', i + 10);
        const section = PROMPT_SRC.slice(i, j === -1 ? undefined : j);
        assertTrue(section.indexOf(OLD_ID) === -1,
            'старая ссылка убрана из таблицы источников');
    });
});

// ==========================================================================
// 7. Санитарный скан репозитория: старого ID нет нигде (кроме истории)
// ==========================================================================
describe('Task 480 — репозиторий: следов старой ссылки нет', () => {

    test('старый ID отсутствует во всех рабочих файлах (кроме истории)', () => {
        // worklog.md НЕ проверяем: старый ID в исторических записях задач
        // (регламент — историю не переписываем). tests/ тоже исключены:
        // негативные ассерты сами содержат старый ID как вход.
        // Промт: строки-версии «> **Версия документа**» исключаются —
        // они цитируют заявку с обоими ID (история); тело/конфиг — чистые.
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
            '.github/workflows/sync-valves.yml', '.github/workflows/sync-regulators.yml'
        ];
        const dirty = [];
        targets.forEach((rel) => {
            let p = path.join(ROOT, rel);
            if (!fs.existsSync(p)) return;  // manifest.json может отсутствовать
            if (read(rel).indexOf(OLD_ID) !== -1) dirty.push(rel);
        });
        // промт — СПЕЦ-ПРОВЕРКА: тело без строк-версии (заявка цитирует оба ID)
        if (promptBody.indexOf(OLD_ID) !== -1) dirty.push('Системный_промт (тело)');
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

console.log('test-task480: все describes зарегистрированы');
