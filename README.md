# kip8test-desktop — КИПиА (TEST) Desktop

Десктопная **тестовая** сборка приложения «КИПиА — справочник инженера» на Electron.

## Назначение

Этот репозиторий содержит только десктопную (Electron) сборку для тестирования.
Мобильная PWA-версия живёт отдельно в [`kip8test`](https://github.com/bloknett-design/kip8test).

После проверки изменений в `kip8test-desktop` они переносятся в боевой репозиторий
`kip8-desktop` (который будет создан позже).

## Структура

```
kip8test-desktop/
├── index.html              # Тот же код, что в kip8test/index.html
│                           # (синхронизируется автоматически через GitHub Action)
├── electron/
│   └── main.js             # Точка входа Electron
├── package.json            # electron-builder конфиг (v2.0.0+)
├── package-lock.json
├── build.mjs               # Build-скрипт (для будущего реального разделения mobile/desktop)
├── data/                   # Статическая копия данных (синхронизируется вручную при релизе)
├── images/                 # Иконки, логотипы, иллюстрации
└── .github/workflows/
    ├── build-desktop.yml   # Сборка под Windows/Linux/macOS + релиз на тег v*
    └── ci.yml              # Тесты (те же, что в kip8test)
```

## Сборка и релизы

При пуше тега `v*` (например `v2.0.0`) автоматически собираются:

- **Windows** — `KIPiA-Test-Setup-2.0.0.exe` (NSIS-установщик, русский язык)
- **Linux** — `KIPiA-Test-2.0.0.AppImage` + `KIPiA-Test-2.0.0.deb`
- **macOS** — `KIPiA-Test-2.0.0.dmg`

Все артефакты публикуются в [Releases](https://github.com/bloknett-design/kip8test-desktop/releases).

## Автообновление

В `electron/main.js` настроен `electron-updater` — при запуске приложение проверяет
GitHub Releases на наличие новой версии и предлагает скачать её.

## Синхронизация с kip8test

При пуше в `kip8test/index.html` автоматически срабатывает GitHub Action
`sync-to-desktop.yml` в репозитории `kip8test`, который:

1. Скачивает свежий `index.html` из `kip8test`
2. Создаёт коммит в `kip8test-desktop/index.html` с тем же содержимым
3. Пушит через PAT

`data/` и `images/` синхронизируются **вручную** при выпуске нового релиза
(раз в неделю/месяц).

## Связанные репозитории

| Репо | Назначение |
|------|------------|
| [kip8test](https://github.com/bloknett-design/kip8test) | Мобильная PWA (TEST) — источник `index.html` |
| [kip8test-desktop](https://github.com/bloknett-design/kip8test-desktop) | Этот репо — десктоп (TEST) |
| [kip8](https://github.com/bloknett-design/kip8) | Мобильная PWA (PROD) |
| [bloknett-design.github.io](https://github.com/bloknett-design/bloknett-design.github.io) | Корневой GitHub Pages (assetlinks.json для TWA) |

## Apps Script

Серверная часть (auth, кабельный журнал, расходомеры) — общая для всех репозиториев,
редактируется в Google Apps Script Web App, URL захардкожен в `index.html`.

## Автор коммитов

Все автоматические коммиты от `kip-bot <bot@kip8test.local>`.
