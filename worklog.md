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
