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
