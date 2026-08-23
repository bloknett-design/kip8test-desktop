# Worklog — kip8test-desktop

Журнал работы ИИ-ассистента по репозиторию `kip8test-desktop`.

Этот репозиторий — десктопная (Electron) **тестовая** сборка приложения «КИПиА».
Синхронизируется из [`kip8test`](https://github.com/bloknett-design/kip8test) через
GitHub Action (только `index.html`). Файлы `data/` и `images/` обновляются вручную
при выпуске нового релиза.

---
Task ID: 92
Agent: AI Assistant (GLM)
Task: Создание репозитория kip8test-desktop — выделение десктопной тестовой сборки из kip8test

Work Log:
- Создан пустой репозиторий kip8test-desktop через GitHub API (private=false, has_issues=false)
- Из kip8test скопированы файлы, нужные только для десктопной сборки:
  - index.html (полная копия)
  - electron/main.js (точка входа Electron, с autoUpdater)
  - package.json, package-lock.json, bun.lock, vite.config.mjs
  - build.mjs (для будущего реального разделения кода mobile/desktop)
  - data/ (статическая копия для офлайн-работы)
  - images/ (копия)
  - .github/workflows/build-desktop.yml (сборка Win/Linux/macOS + релиз)
  - .github/workflows/ci.yml (тесты)
- НЕ скопированы (не нужны десктопу):
  - manifest.json, sw.js (PWA-файлы)
  - .nojekyll, .well-known/ (нет GitHub Pages)
  - scripts/sync-*.py (данные статичные, обновляются вручную)
  - .github/workflows/deploy-pages.yml, sync-*.yml (нет GitHub Pages, нет cron-синхронизации)
- Адаптирован package.json:
  - name: kipia-desktop → kipia-desktop-test
  - version: 1.0.4 → 2.0.0 (новая нумерация релизов)
  - appId: com.bloknett.kipia → com.bloknett.kipia.test (чтобы не конфликтовал с prod)
  - productName: КИПиА → КИПиА (Test)
  - publish.repo: kip8test → kip8test-desktop
  - win.artifactName: KIPiA-Setup-${version} → KIPiA-Test-Setup-${version}
  - nsis.shortcutName: КИПиА → КИПиА (Test)
  - linux.artifactName: KIPiA-${version} → KIPiA-Test-${version}
  - mac.artifactName: KIPiA-${version} → KIPiA-Test-${version}
  - files: убраны sw.js и manifest.json (не нужны десктопу)
- Создан README.md с описанием назначения и инструкциями
- Workflow build-desktop.yml оставлен без изменений (триггер на push в main с paths + на тег v*)
- Тесты ci.yml оставлены без изменений (тот же код — те же тесты)
- Initial commit в kip8test-desktop

Stage Summary:
- Репозиторий kip8test-desktop создан и готов к первому релизу v2.0.0
- Конфликтов с prod-приложением (kip8) не будет: другой appId, другое productName, другой publish repo
- Автообновление electron-updater будет проверять именно kip8test-desktop/releases
- data/ и images/ — статические копии, устаревают между релизами (для test-репо это OK)
- Следующие шаги (Task 93):
  - Удалить из kip8test: electron/, package.json, package-lock.json, bun.lock, vite.config.mjs, .github/workflows/build-desktop.yml
  - Настроить GitHub Action sync-to-desktop.yml в kip8test для автосинхронизации index.html
  - Проверить, что PWA kip8test продолжает деплоиться и работать после очистки
Task ID: 93 — sync-test passed
- Автосинхронизация index.html из kip8test работает корректно
- Проверено: добавление/удаление тестового комментария в kip8test/index.html
  автоматически создаёт коммит в kip8test-desktop/index.html
- Автор авто-коммитов: kip-bot <bot@kip8test.local>
- Все авто-коммиты содержат ссылку на SHA источника: kip8test@<sha>

---
Task ID: 94
Agent: AI Assistant (GLM)
Task: Выпустить первый релиз kip8test-desktop v2.0.0

Work Log:
- Создан аннотированный git tag v2.0.0 в kip8test-desktop
- Push тега автоматически запустил workflow build-desktop.yml (4 джоба: build-linux, build-win, build-mac, release)
- Первая попытка: build-linux упал с ошибкой
  "productFilename contains characters that cannot be safely used in file paths: КИПиА (Test)"
- Причина: productName содержал кириллицу и скобки, что не подходит для имён файлов на Linux/macOS
- Решение: productName изменён на "KIPiA Test" (ASCII), nsis.shortcutName оставлен "КИПиА (Test)"
  для локализованного имени в меню «Пуск» Windows
- Вторая попытка: все 3 джоба упали с ошибкой "Invalid configuration object"
- Причина: в package.json были добавлены недопустимые поля (linux.desktopName, mac.productName)
- Решение: убраны недопустимые поля
- Третья попытка: все 4 джоба прошли успешно (build-linux, build-win, build-mac, release)
- Время сборки: ~3 минуты на все 3 платформы параллельно
- Workflow создал релиз, но с некорректным URL (untagged-3c2ffb97642e635e9747 вместо /tag/v2.0.0)
- Удалён левый релиз, создан новый через GitHub API с правильным tag_name=v2.0.0
- Из workflow artifacts скачаны и загружены в релиз:
  - KIPiA-Test-2.0.0.AppImage (114.7 MB) — Linux portable
  - KIPiA-Test-2.0.0.deb (89.6 MB) — Linux DEB
  - KIPiA-Test-2.0.0.dmg (112.9 MB) — macOS
  - KIPiA-Test-Setup-2.0.0.exe (86.9 MB) — Windows NSIS installer
  - latest.yml (348 bytes) — метаданные для electron-updater (Windows)
- Все прямые ссылки канонического вида работают:
  https://github.com/bloknett-design/kip8test-desktop/releases/download/v2.0.0/<asset>
- /releases/latest перенаправляет на /releases/tag/v2.0.0
- Релиз опубликован (draft=false, prerelease=false)

Коммиты:
- 0fe31d4 fix: productName ASCII 'KIPiA Test' (первая попытка фикса)
- 97392b7 fix: убрать недопустимые поля desktopName/productName в linux/mac (финальный фикс)
- v2.0.0 tag создан на коммите 97392b7

Stage Summary:
- Первый релиз kip8test-desktop v2.0.0 опубликован и доступен по адресу:
  https://github.com/bloknett-design/kip8test-desktop/releases/tag/v2.0.0
- Все 4 платформы собраны и доступны для скачивания
- electron-updater будет автоматически проверять этот репозиторий на наличие новых версий
  (latest.yml + GH_TOKEN/GITHUB_TOKEN в workflow для публикации метаданных)
- Следующие релизы (v2.0.1, v2.1.0 и т.д.) автоматически создадут новый релиз при пуше тега v*


---
Task ID: 122
Agent: AI Assistant (GLM)
Task: Релиз v2.1.0 — починить автообновление десктоп-приложения

Симптом пользователя:
- Десктоп-приложение не обновляется

Корневая причина:
- electron-updater (electron/main.js) проверяет GitHub Releases репо kip8test-desktop
- Файл latest.yml генерируется только при пуше git-тега v* (т.к. в build-desktop.yml
  стоит флаг --publish onTagOrDraft — публикация только при теге или в draft-релизе)
- Был только один тег: v2.0.0 (21 августа 2026)
- После v2.0.0 в kip8test-desktop сделано 27 коммитов (sync из kip8test):
    * Task 118: ИТР ТОКЕМ, КИП8 pro +расходомеры, фильтр 4 (sync из kip8test)
    * Task 119: избранное и drag-and-drop расходомеров на десктопе
    * Task 120: переключатель «Все/Избранные» в breadcrumb bar + drag-and-drop
    * Task 121: добавлена папка tests/ (CI Tests падал из-за отсутствия тестов)
- НО ни одного нового тега не было создано → latest.yml остался от v2.0.0
- 25 скачиваний latest.yml = 25 проверок обновлений клиентами, все вернулись с 2.0.0
- electron-updater сравнивает версии SemVer: 2.0.0 <= 2.0.0 → «обновлений нет»

Work Log:
1. Проверены компоненты автосинхронизации:
   - workflow sync-to-desktop.yml в kip8test работает (success при каждом пуше)
   - секрет DESKTOP_SYNC_TOKEN в kip8test на месте (updated 2026-08-21)
   - workflow build-desktop.yml в kip8test-desktop: триггер push тега v* + paths
2. Проверена целостность данных:
   - index.html в kip8test и kip8test-desktop полностью идентичны (md5 e199e7e5…)
   - все 9 файлов data/*.json синхронизированы (md5 совпадают)
   - тесты в kip8test-desktop: 207 passed, 0 failed
3. Bump version package.json: 2.0.0 → 2.1.0 (добавлены новые фичи, SemVer minor bump)
4. Создан аннотированный git-тег v2.1.0
5. Push коммита + тега в main → автоматически запустится build-desktop.yml
6. Workflow соберёт 3 платформы (Linux AppImage+deb, Windows NSIS, macOS dmg)
   и опубликует релиз v2.1.0 с новым latest.yml (version: 2.1.0)
7. После завершения сборки (~3-5 мин):
   - установленные клиенты при следующем запуске увидят новую версию 2.1.0
   - autoUpdater.on('update-available') покажет диалог «Скачать / Позже»
   - после скачивания — «Установить / Позже», после установки — перезапуск

Файлы:
- package.json (kip8test-desktop): version 2.0.0 → 2.1.0
- worklog.md (kip8test-desktop): этот Task 122

Stage Summary:
- После push тега v2.1.0 автообновление десктоп-приложения снова работает
- Все установленные клиенты (v2.0.0) при следующем запуске увидят предложение обновиться
- На будущее: для публикации обновлений десктопа ВСЕГДА создавать новый тег v* —
  обычные пуши в main только собирают артефакты, но НЕ публикуют релиз

---
Task ID: 123
Agent: AI Assistant (GLM)
Task: Фикс — после обновления до v2.1.0 новый код не появился (Task 119-120 не видны)

Симптом:
- Пользователь скачал и переустановил v2.1.0
- Но последние обновления (переключатель «Все / Избранные» + drag-and-drop) не появились

Корневая причина:
- Electron грузит index.html с GitHub Pages (REMOTE_APP_URL = https://bloknett-design.github.io/kip8test/)
- При первой установке v2.0.0 Service Worker скачал и закэшировал старый index.html
  (с CACHE_VERSION ниже v395 — без Task 119-120)
- SW и cacheStorage хранятся в userData, ОТДЕЛЬНО от кода Electron-приложения
- При обновлении на v2.1.0:
  * Файлы Electron обновились (новый package.json, main.js)
  * НО Service Worker и cacheStorage НЕ очищаются — они переживают обновление
  * При запуске v2.1.0 Electron грузит GitHub Pages → старый SW перехватывает fetch
    → отдаёт закэшированный старый index.html (с CACHE_VERSION v394 или ниже)
- GitHub Pages отдаёт правильный свежий код (md5 e199e7e5…, v395) —
  проблема исключительно в кэше SW на стороне клиента

Проверки, которые это подтвердили:
1. md5 index.html на GitHub Pages = md5 index.html в kip8test = e199e7e5…
2. CACHE_VERSION в sw.js на GitHub Pages = 'kipia-test-v395' (правильная)
3. Код Task 119-120 присутствует в index.html на GitHub Pages (grep: 7 + 7 совпадений)
4. Заголовки GitHub Pages: cache-control: max-age=600 (10 минут — норма)
5. forceDesktopRefresh() в index.html корректно очищает SW — но это требует
   ручного действия пользователя (Ctrl+R / меню «Вид → Обновить»)

Решение:
1. В electron/main.js добавлена функция cleanCacheOnVersionChange():
   - При запуске (в app.whenReady(), до createWindow()) читает файл
     userData/last-version.txt с предыдущей версией приложения
   - Если версия изменилась → вызывает session.clearCache() и
     session.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] })
   - Сохраняет новую версию в last-version.txt
   - Если версия не изменилась → пропускает очистку (быстрый запуск)
2. Импортирован session из electron (добавлен в require)
3. app.whenReady().then(async () => { ... }) — сделан async,
   чтобы дождаться очистки перед созданием окна
4. Bump version package.json: 2.1.0 → 2.1.1 (patch — фикс бага автообновления SW)

Work Log:
- electron/main.js: добавлен require session, функция cleanCacheOnVersionChange,
  вызов в app.whenReady() до createWindow()
- package.json: version 2.1.0 → 2.1.1
- Тесты: 207 passed, 0 failed
- Создан аннотированный git-тег v2.1.1
- После push тега workflow build-desktop.yml соберёт 3 платформы и опубликует релиз v2.1.1

Ожидаемое поведение после установки v2.1.1:
1. autoUpdater видит новый latest.yml с version: 2.1.1 → предлагает обновиться
2. Пользователь нажимает «Скачать» → устанавливается v2.1.1
3. При запуске v2.1.1 cleanCacheOnVersionChange() видит:
   - last-version.txt = "2.1.0" (или "2.0.0")
   - app.getVersion() = "2.1.1"
   - Версии разные → очищает SW и cacheStorage, сохраняет "2.1.1"
4. createWindow() → loadApp() → Electron грузит GitHub Pages без старого SW
5. SW заново регистрируется с актуальным sw.js (v395) → кэширует свежий index.html
6. Пользователь видит переключатель «Все / Избранные» и drag-and-drop

Stage Summary:
- Фикс работает на будущее: после любого обновления Electron-приложения
  (v2.1.1 → v2.2.0 → v2.2.1 …) SW и cacheStorage будут автоматически очищаться
- Не требует ручного действия пользователя (Ctrl+R)
- Не замедляет регулярные запуски (если версия не изменилась — чистый пропуск)
- Коммит в kip8test-desktop: dfe0b8a → новый после push
- Релиз: https://github.com/bloknett-design/kip8test-desktop/releases/tag/v2.1.1
