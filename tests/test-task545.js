// tests/test-task545.js
// Task 545 — телефонный справочник: замена ссылки на Google-таблицу.
// Заявка: «Поменяй ссылку на файл телефонного справочника во всех
// необходимых местах, теперь она такая https://docs.google.com/
// spreadsheets/d/1rFbDn-jNRSoELTnsiaKjNvatSqIhVvbS/edit?usp=sharing…».
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   A. scripts/sync-phonebook.py — функциональное место замены:
//      DEFAULT_SPREADSHEET_ID = новый ID, docstring URL, лист «Лист1»
//      не менялся; старого ID нет.
//   B. .github/workflows/sync-phonebook.yml (только PWA-репо):
//      новый ID в комментарии «КАК НАСТРОИТЬ»; cron / вызов скрипта /
//      авто-коммит / контроль data/phonebook.json — не тронуты
//      (замена URL — конфигурационная правка); старого ID нет.
//   C. data/phonebook.json — первый синк из новой таблицы:
//      source = новый URL (чистая форма /edit — параметры usp/ouid/
//      rtpof/sd из ссылки пользователя на экспорт не влияют, прецедент
//      Task 480); старого ID нет во всём файле; счётчики самосогласованы
//      (230 записей / 5 организаций — новая версия справочника: +10
//      записей — телефоны подразделений и кадровые правки); схема
//      записей прежняя (5 полей, subgroup null — плоская таблица).
//   D. Адаптация test-task542.js: константа SHEET_ID = новый ID —
//      ассерты «ID таблицы» / «source содержит ID» (Task 542 §C)
//      охраняют НОВУЮ таблицу.
//   E. Документация: README (только kip8test) — секция справочника
//      переписана под автосинк (была протухшая «ручное обновление,
//      sync-скрипт удалён» — осталось от времен до Task 542);
//      ARCHITECTURE §2 — источник с новым URL; системный промт —
//      строка «Источники данных» про справочник (было «статический
//      коммит без sync-скрипта») + версия документа post-Task 545.
//   F. Санитарный скан: старого ID нет в рабочих файлах (index.html,
//      синк-скрипт, workflow, данные, README, ARCHITECTURE). tests/,
//      worklog.md и DEPLOY-*.md НЕ сканируются: исторические записи
//      легитимно цитируют старую ссылку (регламент: историю не
//      переписываем; прецедент Task 480).
//
// Файл УНИВЕРСАЛЕН для 4 репозиториев (kip8test/kip8 + десктоп-зеркала):
// workflow есть только в PWA-репо (sync-to-desktop workflows не копирует),
// README с секцией справочника — только kip8test, ARCHITECTURE.md —
// только PWA-репо; эти проверки — под гвардом существования.
//
// Запуск: через tests/run-all.js (require './test-task545.js').

const fs = require('fs');
const path = require('path');
const { test, describe, assertTrue, assertFalse, assertEqual } = require('./test-helpers.js');

const ROOT = path.join(__dirname, '..');

function readIfExists(rel) {
    const p = path.join(ROOT, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SYNC_PY = readIfExists('scripts/sync-phonebook.py');
const WF_SRC = readIfExists('.github/workflows/sync-phonebook.yml');
const PB_RAW = readIfExists('data/phonebook.json');
const T542_SRC = readIfExists('tests/test-task542.js');
const README_SRC = readIfExists('README.md');
const ARCH_SRC = readIfExists('ARCHITECTURE.md');
const PROMPT_SRC = readIfExists('Системный_промт_для_приложения_КИПиА.md');

const NEW_ID = '1rFbDn-jNRSoELTnsiaKjNvatSqIhVvbS';
const OLD_ID = '1phGnzRS1UPtl6G6jcfnt34jlqlKYhGn_';
const NEW_URL = 'https://docs.google.com/spreadsheets/d/' + NEW_ID + '/edit';

// README с секцией телефонного справочника — только kip8test
// (у десктоп-зеркал свой README про Electron, в kip8 README нет вовсе).
const HAS_PB_README = !!(README_SRC
    && README_SRC.indexOf('## 📞 Телефонный справочник') !== -1);

// ============================================================
// A. SRC — синк-скрипт смотрит в НОВУЮ таблицу
// ============================================================
describe('Task 545 — SRC: sync-phonebook.py (новая таблица)', () => {

    test('скрипт существует и знает новую таблицу', () => {
        assertTrue(!!SYNC_PY, 'файл scripts/sync-phonebook.py есть');
        assertTrue(SYNC_PY.indexOf(NEW_ID) !== -1,
            'ID новой таблицы пользователя (Task 545)');
    });

    test('DEFAULT_SPREADSHEET_ID = новый ID (функциональная константа)', () => {
        assertTrue(SYNC_PY.indexOf(
            "DEFAULT_SPREADSHEET_ID = '" + NEW_ID + "'") !== -1,
            'крон-синк скачивает XLSX-экспорт НОВОЙ таблицы');
    });

    test('docstring: URL новой таблицы (чистая форма /edit) + лист «Лист1»', () => {
        assertTrue(SYNC_PY.indexOf(NEW_URL) !== -1,
            'URL в docstring — новая таблица');
        assertTrue(SYNC_PY.indexOf("DEFAULT_SHEET_NAME = 'Лист1'") !== -1,
            'лист не менялся (новая таблица: лист «Лист1», 3 колонки)');
    });

    test('старого ID нет в синк-скрипте', () => {
        assertTrue(SYNC_PY.indexOf(OLD_ID) === -1,
            'старая таблица полностью заменена (docstring/env/DEFAULT)');
    });
});

// ============================================================
// B. SRC — workflow (только PWA-репо)
// ============================================================
describe('Task 545 — SRC: workflow sync-phonebook.yml', () => {

    test('workflow: новый ID в комментарии «КАК НАСТРОИТЬ»', () => {
        if (!WF_SRC) {
            // Десктоп-зеркало: workflows не синхронятся — пропускаем
            assertTrue(fs.existsSync(path.join(ROOT, 'charts-desktop.js')) || true,
                'десктоп-зеркало без workflows — ок');
            return;
        }
        assertTrue(WF_SRC.indexOf(NEW_ID) !== -1,
            'комментарий настройки указывает на новую таблицу');
    });

    test('workflow: старого ID нет', () => {
        if (!WF_SRC) return;
        assertTrue(WF_SRC.indexOf(OLD_ID) === -1,
            'старая ссылка вычищена из workflow');
    });

    test('workflow: cron / скрипт / авто-коммит не тронуты (правка конфигурационная)', () => {
        if (!WF_SRC) return;
        assertTrue(WF_SRC.indexOf("cron: '50 3 * * *'") !== -1
                   || WF_SRC.indexOf("cron: '50 1 * * *'") !== -1,
            'ежедневный cron прежний: 03:50 UTC kip8test / 01:50 UTC kip8');
        assertTrue(WF_SRC.indexOf('python scripts/sync-phonebook.py') !== -1,
            'вызов синк-скрипта');
        assertTrue(WF_SRC.indexOf('auto: update phonebook data from Google Sheets') !== -1,
            'авто-коммит при изменении данных');
        assertTrue(WF_SRC.indexOf('data/phonebook.json') !== -1,
            'контроль изменений data/phonebook.json');
    });
});

// ============================================================
// C. DATA — data/phonebook.json из новой таблицы
// ============================================================
describe('Task 545 — DATA: первый синк из новой таблицы', () => {

    test('source = новый URL (чистая форма /edit, без параметров ссылки)', () => {
        const d = JSON.parse(PB_RAW);
        assertEqual(NEW_URL, d.source,
            'source строится из DEFAULT_SPREADSHEET_ID (параметры usp/ouid не влияют)');
    });

    test('старого ID нет во всём файле данных', () => {
        assertTrue(PB_RAW.indexOf(OLD_ID) === -1,
            'метаданные данных больше не ссылаются на старую таблицу');
    });

    test('счётчики самосогласованы под новые данные (230 записей / 5 организаций)', () => {
        const d = JSON.parse(PB_RAW);
        let n = 0;
        for (const items of Object.values(d.sections)) n += items.length;
        assertEqual(d.total_records, n, 'total_records = фактическое число записей');
        assertEqual(d.total_companies, Object.keys(d.sections).length,
            'total_companies = числу секций');
        assertEqual(230, d.total_records,
            'новая версия справочника: 230 записей (было 220 — +10: телефоны подразделений + кадровые правки)');
        assertEqual(5, d.total_companies, 'организаций по-прежнему пять');
        assertEqual('ООО ПО «ТОКЕМ»', Object.keys(d.sections)[0],
            'первая секция — ООО ПО «ТОКЕМ» (DEFAULT_HEADER, стабильные ID избранного)');
    });

    test('схема записей не изменилась (5 полей, subgroup null)', () => {
        const d = JSON.parse(PB_RAW);
        let bad = 0, subgroups = 0;
        for (const items of Object.values(d.sections)) {
            for (const it of items) {
                const keys = Object.keys(it).sort().join(',');
                if (keys !== 'group,name,phone,position,subgroup') bad++;
                if (it.subgroup !== null) subgroups++;
            }
        }
        assertEqual(0, bad, 'у каждой записи ровно 5 полей схемы');
        assertEqual(0, subgroups, 'плоская таблица: subgroup всегда null');
    });
});

// ============================================================
// D. Адаптация тестов Task 542
// ============================================================
describe('Task 545 — адаптация test-task542.js', () => {

    test('константа SHEET_ID = новый ID (ассерты 542 §C охраняют новую таблицу)', () => {
        assertTrue(T542_SRC.indexOf(
            "const SHEET_ID = '" + NEW_ID + "';") !== -1,
            'пин замены: SYNC_PY и data.source проверяются против нового ID');
    });
});

// ============================================================
// E. Документация
// ============================================================
describe('Task 545 — документация (README / ARCHITECTURE / промт)', () => {

    test('README: секция справочника — автосинк из новой таблицы', () => {
        if (!HAS_PB_README) return; // kip8 / десктоп-зеркала
        assertTrue(README_SRC.indexOf(NEW_ID) !== -1,
            'README указывает новую таблицу');
        assertTrue(README_SRC.indexOf('sync-phonebook.yml') !== -1,
            'описан cron-механизм автосинка');
        assertTrue(README_SRC.indexOf('workflow_dispatch') !== -1,
            'описан ручной запуск');
        assertTrue(README_SRC.indexOf('PHONEBOOK_SPREADSHEET_ID') !== -1,
            'описано переопределение таблицы через env');
    });

    test('README: протухшая «ручное обновление» секция вычищена, старого ID нет', () => {
        if (!HAS_PB_README) return;
        assertTrue(README_SRC.indexOf('(ручное обновление)') === -1,
            'старый заголовок «(ручное обновление)» удалён');
        assertTrue(README_SRC.indexOf('обновляемый — Google Sheets') !== -1,
            'новый заголовок секции — «(обновляемый — Google Sheets)»');
        assertTrue(README_SRC.indexOf('обновляется вручную') === -1,
            'заявление «обновляется вручную» вычищено (было до Task 542)');
        assertTrue(README_SRC.indexOf(OLD_ID) === -1,
            'старой таблицы в README нет');
    });

    test('ARCHITECTURE §2: источник справочника — новая таблица (URL)', () => {
        if (!ARCH_SRC) return; // десктоп-зеркала
        assertTrue(ARCH_SRC.indexOf(NEW_URL) !== -1,
            'URL новой таблицы в описании источника');
        assertTrue(ARCH_SRC.indexOf('(ссылка обновлена Task 545)') !== -1,
            'маркер Task 545 рядом с источником');
        assertTrue(ARCH_SRC.indexOf(OLD_ID) === -1,
            'старой таблицы в ARCHITECTURE нет');
    });

    test('промт: строка «Источники данных» — новая таблица, не «статический коммит»', () => {
        const anchor = '| Телефонный справочник (справочник)';
        const i = PROMPT_SRC.indexOf(anchor);
        assertTrue(i !== -1, 'строка справочника в таблице источников есть');
        const e = PROMPT_SRC.indexOf('\n', i);
        const row = PROMPT_SRC.slice(i, e === -1 ? undefined : e);
        assertTrue(row.indexOf(NEW_ID) !== -1,
            'источник — новая Google-таблица (Task 545)');
        assertTrue(row.indexOf('без sync-скрипта') === -1,
            'протухшее «статический коммит без sync-скрипта» убрано (sync есть с Task 542)');
        assertTrue(row.indexOf(OLD_ID) === -1,
            'старой таблицы в строке источников нет');
    });

    test('промт: версия документа — post-Task 545', () => {
        assertTrue(PROMPT_SRC.indexOf('post-Task 545') !== -1,
            'цепочка версий дополнена записью Task 545');
    });
});

// ============================================================
// F. Санитарный скан рабочих файлов
// ============================================================
describe('Task 545 — санитарный скан', () => {

    test('index.html: старого ID нет (клиент URL таблицы не знает)', () => {
        assertTrue(INDEX_SRC.indexOf(OLD_ID) === -1,
            'клиент работает с data/phonebook.json — ссылка только в инфраструктуре синка');
    });

    test('рабочие файлы без старого ID (синк / workflow / данные / README / ARCH)', () => {
        const targets = [
            ['scripts/sync-phonebook.py', SYNC_PY],
            ['data/phonebook.json', PB_RAW],
        ];
        if (WF_SRC) targets.push(['.github/workflows/sync-phonebook.yml', WF_SRC]);
        if (HAS_PB_README) targets.push(['README.md', README_SRC]);
        if (ARCH_SRC) targets.push(['ARCHITECTURE.md', ARCH_SRC]);
        for (const [name, src] of targets) {
            assertTrue(src.indexOf(OLD_ID) === -1,
                name + ': старой таблицы нет');
        }
    });
});
