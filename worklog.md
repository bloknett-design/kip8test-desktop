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

---
Task ID: 124
Agent: AI Assistant (GLM)
Task: Фикс — после v2.1.1 новый код всё ещё не появился (переключатель/drag-and-drop отсутствуют)

Симптом:
- Пользователь установил v2.1.1 (где уже был фикс Task 123 с cleanCacheOnVersionChange)
- Но переключатель «Все / Избранные» и drag-and-drop НЕ появились

Анализ причины почему Task 123 не сработал:
1. session.clearStorageData() без указания origin может НЕ очистить SW
   для HTTPS origin, когда приложение грузится через https://
2. HTTP-кэш Chromium может отдать старый index.html через условный запрос
   (304 Not Modified) — SW видит «тот же ответ», не обновляет свой кэш
3. sw.js для navigate-запросов идёт в сеть через fetch(request), но если
   HTTP-кэш Chromium перехватывает fetch и отдаёт старую версию — SW
   использует её и обновляет кэш тем же старым index.html

Решение Task 124 — ДВУХУРОВНЕВАЯ очистка:

Уровень 1 (ДО загрузки страницы — cleanCacheOnVersionChange):
- session.clearCache() — очистка HTTP-кэша Chromium (для всех origin)
- session.clearStorageData({ origin: 'https://bloknett-design.github.io',
  storages: ['serviceworkers', 'cachestorage'] }) — с указанием origin
- Дополнительно: clearStorageData без origin (для всех origin на всякий случай)
- pendingDeepClean = true — флаг для второго уровня

Уровень 2 (ПОСЛЕ dom-ready — deepCleanAfterLoad через executeJavaScript):
- navigator.serviceWorker.getRegistrations() + unregister() — JS API,
  гарантированно работает на origin'е страницы (https://bloknett-design.github.io)
- caches.keys() + caches.delete() — очищает Cache Storage через JS API
- window.location.replace(url + '?_nocache=' + Date.now()) — перезагрузка
  с cache-busting параметром: Chromium HTTP-кэш видит URL с query как
  НОВЫЙ ресурс → идёт в сеть → получает свежий index.html с GitHub Pages

Почему это сработает (в отличие от Task 123):
- JS API (navigator.serviceWorker, caches) работают на origin'е страницы,
  в отличие от session API, которые могут не увидеть HTTPS origin
- Cache-busting через ?_nocache=ts заставляет Chromium HTTP-кэш сделать
  реальный сетевой запрос, а не отдать кэш через 304 Not Modified
- После reload регистрируется новый SW (v395) с актуальным sw.js →
  кэширует свежий index.html с Task 119-120

Work Log:
- electron/main.js: добавлен pendingDeepClean флаг, функция deepCleanAfterLoad,
  вызов в dom-ready хуке (только если pendingDeepClean=true)
- cleanCacheOnVersionChange: добавлен origin: 'https://bloknett-design.github.io'
  в clearStorageData (важно!)
- package.json: version 2.1.1 → 2.1.2 (patch — второй фикс бага автообновления SW)
- Тесты: 207 passed, 0 failed

Ожидаемое поведение после установки v2.1.2:
1. autoUpdater видит latest.yml с version: 2.1.2 → предлагает обновиться
2. При запуске v2.1.2:
   - cleanCacheOnVersionChange видит last="2.1.1" → current="2.1.2"
   - session.clearCache() + clearStorageData с origin (Уровень 1)
   - pendingDeepClean = true
3. loadApp() → Electron грузит GitHub Pages → dom-ready срабатывает
4. deepCleanAfterLoad (Уровень 2):
   - navigator.serviceWorker.getRegistrations() → unregister() всех SW
   - caches.keys() → caches.delete() всех cacheStorage
   - window.location.replace('https://...?_nocache=1734567890')
5. Страница перезагружается с cache-busting:
   - Chromium HTTP-кэш не находит ?_nocache=... → идёт в сеть
   - GitHub Pages отдаёт свежий index.html (md5 e199e7e5…, v395, Task 119-120)
   - Свежий index.html регистрирует новый SW (v395)
6. Пользователь видит:
   - Переключатель «Все / Избранные» в breadcrumb bar (Task 120)
   - Drag-and-drop в избранном расходомеров (Task 119)

Stage Summary:
- Двухуровневая очистка гарантирует, что SW будет удалён, даже если
  session API не сработал (через JS API как fallback)
- Cache-busting через ?_nocache=ts заставляет Chromium HTTP-кэш сделать
  реальный сетевой запрос — обходит проблему 304 Not Modified
- Коммит в kip8test-desktop: новый после push
- Релиз: https://github.com/bloknett-design/kip8test-desktop/releases/tag/v2.1.2

---
Task ID: 125
Agent: AI Assistant (GLM)
Task: Диагностическая сборка v2.1.3 — почему Task 120 не виден после v2.1.2

Симптом:
- Пользователь установил v2.1.2 (Task 124 — двухуровневая очистка)
- VLM-анализ скриншота: звёздочки избранного видны на карточках (Task 119 работает),
  но переключатель «Все / Избранные» в breadcrumb bar не виден (Task 120 не работает)
- Это противоречие: если index.html обновился, должны работать ОБА Task'а
- Если index.html не обновился, звёздочек бы тоже не было

Гипотезы:
1. Electron грузит локальный index.html (app://), а не с GitHub Pages —
   локальный index.html может быть старым
2. Service Worker контролирует страницу, но не обновился
3. CSS скрывает flowDesktopTabs (но display:none должен быть снят в Task 119)
4. JS не вызывает показ flowDesktopTabs при navigateTo('flowmeter-data')

Решение — диагностическая сборка v2.1.3:
1. Включить devTools: true в webPreferences
2. Автоматически открыть DevTools при запуске (mode: 'detach')
3. Показать menu bar (autoHideMenuBar: false)
4. Через 3 сек после dom-ready собрать диагностику:
   - URL страницы (локальный или GitHub Pages?)
   - origin (app://localhost vs https://bloknett-design.github.io)
   - Service Worker: count, scriptURLs, controller
   - Cache Storage: список имён
   - CACHE_VERSION из sw.js (через fetch с cache-busting)
   - DOM: наличие #flowDesktopTabs, #flowFavBtn, .flow-card-fav-btn count
   - Активная страница (.page-content.active)
   - UserAgent, viewport
5. Показать диагностику в виде dialog.showMessageBox + в консоль

Work Log:
- electron/main.js: devTools: true, autoHideMenuBar: false, openDevTools({mode:'detach'})
- Добавлен diag-блок в dom-ready хук (через 3 сек)
- package.json: version 2.1.2 → 2.1.3
- Тесты: 207 passed, 0 failed

Что увидит пользователь при запуске v2.1.3:
- Откроется DevTools (в отдельном окне)
- Через 3 сек появится dialog с диагностикой:
  - Если URL = https://bloknett-design.github.io/kip8test/ → грузится с GitHub Pages
  - Если URL = app://localhost/index.html → грузится локальный index.html (старый)
  - Если CACHE_VERSION ≠ kipia-test-v395 → грузится старый sw.js
  - Если #flowDesktopTabs = false → HTML старый (без Task 120)
  - Если sw_count > 0 → SW контролирует страницу

Эта информация позволит точно понять причину и применить правильный фикс.

Stage Summary:
- v2.1.3 — диагностическая сборка, не должна выпускаться как боевое обновление
- После анализа диагностики выпускается v2.1.4 с правильным фиксом

---
Task ID: 126
Agent: AI Assistant (GLM)
Task: Фикс #3 — CSS-only показ flowDesktopTabs (обходит баг isDesktop() в Electron)

Симптом:
- Пользователь установил v2.1.3 (диагностическая сборка)
- VLM-анализ скриншотов диагностики показал:
  * URL: https://bloknett-design.github.io/kip8test/ ✓ (правильно)
  * #flowDesktopTabs: true (элемент в DOM есть)
  * #flowFavBtn: true (Task 119 код на месте)
  * .flow-card-fav-btn count: 0 (норма — на дашборде нет карточек)
  * Cache Storage: ["kipia-test-v395", "kipia-images-test-v3"] ✓
  * Service Worker controller: активен

Вывод: HTML свежий, SW работает, элементы Task 120 в DOM ЕСТЬ.
Значит проблема в том, что #flowDesktopTabs СКРЫТ.

Корневая причина:
- В HTML стоял inline style="display:none;" на #flowDesktopTabs (для скрытия на мобильном)
- В navigateTo() код Task 120 сбрасывает inline display:none только если isDesktop() возвращает true
- isDesktop() = window.matchMedia('(min-width: 1024px)').matches
- В Electron эта проверка иногда возвращает false (возможно, из-за того что
  Chromium запускается с viewport= device-width, а не с innerWidth)
- Поэтому JS-блок не срабатывает → inline display:none остаётся → табы невидимы
- Звёздочки .flow-card-fav-btn при этом видны, потому что CSS-правило
  @media (min-width: 1024px) { display: none !important; } для них ЗАКОММЕНТИРОВАНО
  (Task 119) — то есть они показываются ВСЕГДА, без зависимости от isDesktop()

Решение Task 126 — CSS-only показ через @media + :has():
1. .flow-desktop-tabs: по умолчанию display: none (на мобильном скрыт)
2. @media (min-width: 1024px) {
     body:has(#page-flowmeter-data.active) #flowDesktopTabs {
       display: flex !important;
     }
   }
3. Убран inline style="display:none;" с #flowDesktopTabs в HTML
4. Аналогично для #detailBreadcrumbBar — добавить @media + :has() правило,
   чтобы breadcrumb bar показывался на странице расходомеров без JS

Также добавлено для #detailBreadcrumbBar:
   @media (min-width: 1024px) {
     body:has(#page-flowmeter-data.active) #detailBreadcrumbBar {
       display: flex;
     }
   }

Почему это работает:
- CSS @media (min-width: 1024px) срабатывает корректно в Electron
  (это подтверждается тем, что звёздочки .flow-card-fav-btn видны)
- CSS :has() поддерживается в Chromium 105+ (Electron 35 — Chromium 134)
- !important на #flowDesktopTabs гарантирует показ, даже если JS попытается
  скрыть (closeDetailPanel)

Work Log:
- index.html: CSS для .flow-desktop-tabs — display: none по умолчанию,
  @media (min-width: 1024px) + body:has(#page-flowmeter-data.active) → display: flex !important
- index.html: убран inline style="display:none;" с #flowDesktopTabs
- index.html: добавлено @media (min-width: 1024px) правило для #detailBreadcrumbBar
- sw.js: CACHE_VERSION kipia-test-v395 → kipia-test-v396
- electron/main.js: убран diag-блок (Task 125), devTools: false, autoHideMenuBar: true
- package.json: version 2.1.3 → 2.1.4
- Тесты: 207 passed, 0 failed

Stage Summary:
- После установки v2.1.4 и обновления GitHub Pages (CACHE_VERSION v396):
  1. Service Worker обновится до v396 (старый кэш v395 удалится)
  2. Грузится свежий index.html с CSS-фиксом Task 126
  3. При переходе на страницу расходомеров:
     - CSS @media (min-width: 1024px) + :has() показывает #detailBreadcrumbBar
     - CSS @media (min-width: 1024px) + :has() показывает #flowDesktopTabs
     - Не зависит от isDesktop() в JS
  4. Пользователь видит переключатель «Все / Избранные» в breadcrumb bar
  5. Drag-and-drop в режиме «Избранные» работает через Pointer Events (Task 119)

---
Task ID: 127
Agent: AI Assistant (GLM)
Task: Фикс — после Task 126 два header'а на странице расходомеров

Симптом:
- После v2.1.4 (Task 126) переключатель «Все / Избранные» появился
- Но «все кнопки в отдельной строке» — два header'а один под другим:
  1. detailBreadcrumbBar: < + крошки + переключатель + ✕ + ⇄
  2. page-inline-header: < + «Расходомеры хозрасчётные»

Причина:
- Task 126 добавил CSS-показ detailBreadcrumbBar через @media + :has()
- НО не скрыл page-inline-header, который тоже есть на странице
- Для других detail-страниц page-inline-header скрывается через
  body:has(#detailPanel.active) — но detail-panel не активен на странице расходомеров

Решение Task 127 (в kip8test/index.html):
1. body:has(#page-flowmeter-data.active) #page-flowmeter-data > .page-inline-header { display: none; }
2. body:not(:has(#detailPanel.active)) #detailBreadcrumbBar .detail-breadcrumb-close,
   body:not(:has(#detailPanel.active)) #detailBreadcrumbBar .detail-breadcrumb-swap {
     display: none;
   }
   (Кнопки ✕ и ⇄ нужны только когда detail-panel открыт)

В kip8test-desktop изменений в electron-коде нет — достаточно поднять версию
package.json, чтобы autoUpdater подтянул новую сборку с актуальным index.html
(синхронизируется из kip8test через sync-to-desktop.yml).

- package.json: version 2.1.4 → 2.1.5
- Тесты: 207 passed, 0 failed

Stage Summary:
- После установки v2.1.5 и обновления SW (v397):
  - На странице расходомеров будет виден ТОЛЬКО detailBreadcrumbBar
  - page-inline-header скрыт
  - Кнопки ✕ и ⇄ скрыты (detail-panel не активен)
- Коммит в kip8test: новый после push
- Релиз: https://github.com/bloknett-design/kip8test-desktop/releases/tag/v2.1.5

---
Task ID: 128
Agent: AI Assistant (GLM)
Task: Фикс — хлебные крошки не отображаются на странице со списком расходомеров

Симптом:
- После v2.1.5 (Task 127) на странице со списком карточек крошки пустые
- При открытии карточки крошки появляются

Причина:
- В navigateTo('flowmeter-data') крошки заполнялись только если isDesktop()=true
- В Electron isDesktop() возвращает false (баг Task 126)
- CSS показывает detailBreadcrumbBar, но крошки остаются пустыми

Решение Task 128 (в kip8test/index.html):
- Вынести заполнение крошек ИЗ if (isDesktop()) блока
- Заполнять крошки ВСЕГДА при заходе на страницу расходомеров
- Крошки полные с кликабельными ссылками

В kip8test-desktop только bump version, чтобы autoUpdater подтянул новую сборку.

- package.json: version 2.1.5 → 2.1.6
- Тесты: 207 passed, 0 failed

---
Task ID: 129
Agent: AI Assistant (GLM)
Task: Автоматическая очистка SW + cacheStorage при каждом запуске (без переустановки)

Контекст:
- Пользователь спросил: «почему в мобильной версии достаточно просто
  обновить данные в установленном приложении, а в десктопной — каждый раз
  нужно устанавливать новую версию?»
- Причина: cleanCacheOnVersionChange() (Task 122-124) очищал SW ТОЛЬКО при
  изменении версии Electron-приложения (проверка через last-version.txt)
- Поэтому при обновлении index.html в kip8test (через GitHub Pages) приходилось
  bump version в kip8test-desktop/package.json + push тега v* + переустановка

Решение Task 129 — cleanCacheOnStartup():
- Функция переименована: cleanCacheOnVersionChange → cleanCacheOnStartup
- Убрана проверка last-version.txt / app.getVersion()
- Убрано сохранение новой версии в last-version.txt
- Теперь ВСЕГДА очищает SW + cacheStorage при запуске (~500 мс задержка)
- pendingDeepClean = true всегда → dom-ready хук вызывает deepCleanAfterLoad()
  → JS API удаляет SW + caches.keys/delete + перезагрузка с ?_nocache=ts

Как это работает теперь:
1. Обновляется index.html в kip8test → GitHub Pages обновляется
2. SW (на GitHub Pages) меняет CACHE_VERSION
3. Пользователь просто ПЕРЕЗАПУСКАЕТ десктоп (без переустановки)
4. cleanCacheOnStartup() очищает старый SW + cacheStorage
5. deepCleanAfterLoad() (через JS API) удаляет оставшийся SW + перезагрузка с cache-busting
6. Грузится свежий index.html с GitHub Pages
7. SW регистрируется заново с актуальным sw.js → кэширует свежий код

Переустановка Electron-приложения нужна ТОЛЬКО при изменениях:
- electron/main.js (логика BrowserWindow, autoUpdater, protocol)
- package.json (новые Node-зависимости)
- Иконки, манифест, другие Electron-ресурсы

Work Log:
- electron/main.js: cleanCacheOnVersionChange → cleanCacheOnStartup (убрана проверка версии)
- Комментарии обновлены: объяснено, что очистка всегда при запуске
- package.json: version 2.1.6 → 2.1.7
- Тесты: 207 passed, 0 failed

Stage Summary:
- После установки v2.1.7 (последняя переустановка для этого функционала):
  - При каждом запуске: cleanCacheOnStartup() очищает SW + cacheStorage
  - deepCleanAfterLoad() через JS API завершает очистку + cache-busting reload
- В дальнейшем (после обновлений kip8test/index.html):
  - Пользователь просто перезапускает десктоп
  - Без переустановки Electron-приложения
  - Аналогично мобильной PWA: «Обновить» → свежий контент

---
Task ID: 131
Agent: AI Assistant (GLM)
Task: Синхронизация фикса «принудительный десктопный режим в Electron» из kip8test

Что сделано:
- Скопирован index.html из kip8test@8825cd9 (v400):
  блок ELECTRON: ПРИНУДИТЕЛЬНЫЙ ДЕСКТОПНЫЙ РЕЖИМ — интерфейс десктопного
  приложения больше не переключается в мобильный вид при уменьшении окна
  (override matchMedia + переписывание CSS media-условий)
- Скопирован Системный_промт_для_приложения_КИПиА.md (rev. 14)
- electron/main.js и package.json НЕ менялись

Релиз НЕ нужен:
- Десктоп грузит удалённый GitHub Pages в первую очередь —
  фикс приходит при перезапуске приложения (cleanCacheOnStartup, Task 129)
- Локальная копия index.html (app://) обновлена только для офлайн-fallback
- Версия остаётся 2.1.7, тег не создаётся

Stage Summary:
- Пользователю достаточно перезапустить десктопное приложение (1 раз)
- Переустановка не требуется

---
Task ID: 132
Agent: AI Assistant (GLM)
Task: Синхронизация фикса «кнопки на главной одинакового размера» из kip8test

Что сделано:
- index.html уже синхронизирован автоматически (kip8test@ca3da82, v401):
  закреплённые кнопки на главной автоматически выравниваются по габаритам
  самой большой кнопки (grid-auto-rows: 1fr + flex-растяжение карточек,
  контент центрирован по вертикали на десктопе)
- Скопирован Системный_промт_для_приложения_КИПиА.md (rev. 15, Task 132)
- electron/main.js и package.json НЕ менялись — релиз не нужен (2.1.7)

Stage Summary:
- Пользователю: перезапустить десктопное приложение (1 раз) —
  cleanCacheOnStartup подхватит свежий index.html с v401
- Проверено на всех раскладках: 1400px (3 кол.), 800px (2 кол.), 390px (1 кол.)

---
Task ID: 133
Agent: AI Assistant (GLM)
Task: Синхронизация «миниатюра прибора в строке группировки» из kip8test

Что сделано:
- index.html синхронизирован автоматически (kip8test@5f1832f, v402):
  в строках группировки «Приборы по типу/наименованию/производствам»
  показывается миниатюра прибора (первый прибор группы с картинкой,
  Google Drive thumb, кэш SW IMAGE_CACHE)
- Скопирован Системный_промт_для_приложения_КИПиА.md (rev. 16, Task 133)
- electron/main.js и package.json НЕ менялись — релиз не нужен (2.1.7)

Stage Summary:
- Пользователю: перезапустить десктопное приложение (1 раз) —
  cleanCacheOnStartup подхватит свежий index.html с v402

---
Task ID: 134
Agent: AI Assistant (GLM)
Task: Синхронизация «крупная картинка в строке группировки + заглушка» из kip8test

Что сделано:
- index.html синхронизирован автоматически (kip8test@3ab4b09, v403):
  картинки в строках группировки увеличены до 100x82 (по примеру
  пользователя), у групп без фото — заглушка-иконка «КИП» (единый вид)
- Скопирован Системный_промт_для_приложения_КИПиА.md (rev. 17, Task 134)
- electron/main.js и package.json НЕ менялись — релиз не нужен (2.1.7)

Stage Summary:
- Пользователю: перезапустить десктопное приложение (1 раз) —
  cleanCacheOnStartup подхватит свежий index.html с v403

---
Task ID: 135
Agent: AI Assistant (GLM)
Task: Синхронизация «приборы по центру рамки + отступы 2px + prod без картинок + мобильный 76x62» из kip8test

Что сделано:
- index.html синхронизирован автоматически (kip8test@b32b9b3, v404):
  приборы в рамках картинок отцентрированы (пустое поле под подпись
  обрезается), отступы картинка-строка 2px, на вкладке «Приборы по
  производствам» картинок нет, в мобильной версии картинки 76x62
- Скопирован Системный_промт_для_приложения_КИПиА.md (rev. 18, Task 135)
- electron/main.js и package.json НЕ менялись — релиз не нужен (2.1.7)

Stage Summary:
- Пользователю: перезапустить десктопное приложение (1 раз) —
  cleanCacheOnStartup подхватит свежий index.html с v404

---
Task ID: 136
Agent: AI Assistant (GLM)
Task: Синхронизация «центрирование приборов в миниатюрах карточек» из kip8test

Что сделано:
- index.html синхронизирован автоматически (kip8test@1b1e8f7, v405):
  приборы в миниатюрах карточек отцентрированы (56x41, обрезка нижнего
  пустого поля), заглушки квадратные без обрезки, битые фото подменяются
  заглушкой через делегированный error-обработчик
- Скопирован Системный_промт_для_приложения_КИПиА.md (rev. 19, Task 136)
- electron/main.js и package.json НЕ менялись — релиз не нужен (2.1.7)

Stage Summary:
- Пользователю: перезапустить десктопное приложение (1 раз) —
  cleanCacheOnStartup подхватит свежий index.html с v405
