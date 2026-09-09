const { app, BrowserWindow, Menu, shell, dialog, protocol, session, net } = require('electron');
const path = require('path');
const fs = require('fs');

// ============================================================
// Флаг legacy-сборки для Windows 7/8.1 (Task 354)
// ============================================================
// Обычная сборка (Electron 35) требует Windows 10+: PE-заголовок её
// бинарников объявляет OS 10.00, и загрузчик Windows 7/8.1 отклоняет
// KIPiA.exe с ошибкой «не является приложением Win32».
// Для старых систем собирается ЛЕГАСИ-установщик (Electron 22.3.27,
// Chromium 108, PE OS 5.01): electron-builder кладёт в package.json
// поле kipiaWin7Legacy: true (extraMetadata в electron-builder-legacy.yml).
// В обычной и dev-сборке поля нет → флаг false, поведение прежнее.
const appPkg = require('../package.json');
const IS_LEGACY_WIN7 = appPkg.kipiaWin7Legacy === true;

// В legacy-сборке автообновление оболочки ОТКЛЮЧЕНО (Task 354): основной
// канал (latest.yml в GitHub Releases) раздаёт сборки на Electron 35
// (только Windows 10+) — обновившись, приложение перестало бы запускаться
// на Windows 7. Пользователь обновляется вручную: скачивает новый
// *-win7-*.exe из релизов. Содержимое справочника при этом по-прежнему
// обновляется автоматически — приложение грузит index.html с GitHub Pages.
let autoUpdater = null;
if (!IS_LEGACY_WIN7) {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (e) {
    console.log('[autoUpdater] Модуль недоступен:', e.message);
  }
}

let mainWindow = null;

// Корневая директория приложения (где index.html, data/, images/)
const APP_ROOT = path.join(__dirname, '..');

// URL удалённого приложения (GitHub Pages) — источник свежего контента
const REMOTE_APP_URL = 'https://bloknett-design.github.io/kip8test/';

// ⚠️ ВАЖНО: регистрируем схему как привилегированную ДО app.whenReady()
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

// ============================================================
// АВТООБНОВЛЕНИЕ
// ============================================================
// electron-updater проверяет GitHub Releases на наличие новой версии.
// Для Windows NSIS: скачивает .exe и запускает установщик после закрытия приложения.
// Для macOS: скачивает .zip и заменяет приложение.
// Для Linux AppImage: скачивает новый .AppImage.

if (autoUpdater) {
  autoUpdater.autoDownload = false; // не скачивать автоматически — спросим пользователя
  autoUpdater.autoInstallOnAppQuit = true; // установить при закрытии
}

function onUpdateAvailable(info) {
  // Новая версия найдена — спрашиваем пользователя
  if (!mainWindow) return;
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Доступно обновление',
    message: `Доступна новая версия: ${info.version}`,
    detail: `Текущая версия: ${app.getVersion()}\n\nСкачать и установить обновление? Приложение будет перезапущено после загрузки.`,
    buttons: ['Скачать', 'Позже'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });
}

if (autoUpdater) {
  autoUpdater.on('update-available', onUpdateAvailable);

  autoUpdater.on('download-progress', (progressObj) => {
    // Можно показать прогресс в заголовке окна
    if (mainWindow) {
      mainWindow.setProgressBar(progressObj.percent / 100);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    // Обновление скачано — предлагаем установить
    if (mainWindow) {
      mainWindow.setProgressBar(-1); // сбросить прогресс
    }
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Обновление загружено',
      message: `Версия ${info.version} загружена`,
      detail: 'Установить сейчас? Приложение перезапустится.',
      buttons: ['Установить', 'Позже'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    // Ошибка обновления — не показываем пользователю (не критично)
    console.log('[autoUpdater] Ошибка:', err.message);
  });
}

// Функция проверки обновлений (в legacy-сборке — no-op)
function checkForUpdates() {
  if (!autoUpdater) return;
  try {
    autoUpdater.checkForUpdates().catch(() => {});
  } catch (e) {
    // Не критично — обновления не обязательны
  }
}

let pendingDeepClean = false;  // флаг: нужно ли глубокую очистку SW через JS API

// ============================================================
// ОЧИСТКА КЭША ПРИ КАЖДОМ ЗАПУСКЕ (Task 129)
// ============================================================
// Ранее (Task 122-124) очистка SW + cacheStorage делалась ТОЛЬКО при
// изменении версии Electron-приложения (проверка через last-version.txt).
// Это приводило к тому, что при обновлении index.html в kip8test пользователю
// приходилось переустанавливать десктоп только ради bump version в package.json.
//
// Task 129: всегда очищаем SW + cacheStorage при запуске (~500 мс задержка).
// После очистки Electron грузит свежий index.html с GitHub Pages напрямую,
// минуя старый SW. SW регистрируется заново с актуальным sw.js (v398+).
//
// Это даёт тот же UX, что и в мобильной PWA: пользователь просто перезапускает
// приложение, чтобы получить свежий контент (без переустановки).
//
// Переустановка Electron-приложения всё ещё нужна, но ТОЛЬКО при изменениях
// в самом electron/main.js или package.json (например, новые Node-зависимости,
// изменения в BrowserWindow, autoUpdater и т.п.).

async function cleanCacheOnStartup() {
  console.log('[cleanCacheOnStartup] Очистка SW и cacheStorage (Task 129)');
  pendingDeepClean = true;  // флаг для dom-ready хука

  try {
    const ses = session.defaultSession;
    // Очистить HTTP-кэш Chromium (для всех origin)
    await ses.clearCache();
    // Очистить Service Worker и Cache Storage для origin GitHub Pages
    await ses.clearStorageData({
      origin: 'https://bloknett-design.github.io',
      storages: ['serviceworkers', 'cachestorage']
    });
    // Также очистить общий storage (на случай, если origin не сработал)
    await ses.clearStorageData({
      storages: ['serviceworkers', 'cachestorage']
    });
    console.log('[cleanCacheOnStartup] ✓ SW и cacheStorage очищены (session API)');
  } catch (e) {
    console.log('[cleanCacheOnStartup] Ошибка при очистке:', e.message);
    // Не блокируем запуск — dom-ready хук попробует ещё раз через JS API
  }
}

// Глубокая очистка SW через JS API после загрузки страницы.
// Эта функция вызывается из dom-ready хука при каждом запуске (Task 129).
// В отличие от session API, JS API (navigator.serviceWorker, caches)
// работает на origin'е страницы — гарантированно удаляет SW.
// Перезагружает страницу с cache-busting ?_nocache=ts, чтобы Chromium
// HTTP-кэш не отдал старый index.html через 304 Not Modified.
async function deepCleanAfterLoad() {
  if (!mainWindow) return;

  console.log('[deepCleanAfterLoad] Запуск глубокой очистки через JS API');

  const script = `
    (async function() {
      var results = { sw: 0, caches: 0, reloaded: false };
      try {
        // 1. Удалить все Service Worker через JS API
        if ('serviceWorker' in navigator) {
          var regs = await navigator.serviceWorker.getRegistrations();
          results.sw = regs.length;
          await Promise.all(regs.map(function(reg) { return reg.unregister(); }));
          console.log('[deepClean] SW удалены: ' + regs.length);
        }
        // 2. Удалить все Cache Storage через JS API
        if ('caches' in window) {
          var names = await caches.keys();
          results.caches = names.length;
          await Promise.all(names.map(function(name) { return caches.delete(name); }));
          console.log('[deepClean] Cache Storage очищен: ' + names.length + ' (' + names.join(', ') + ')');
        }
      } catch (e) {
        console.log('[deepClean] Ошибка: ' + e.message);
      }
      // 3. Перезагрузить страницу с cache-busting
      //    ?_nocache=ts — Chromium HTTP-кэш видит это как новый URL
      //    → идёт в сеть → получает свежий index.html с GitHub Pages
      try {
        var url = new URL(window.location.href);
        url.searchParams.set('_nocache', Date.now());
        results.reloaded = true;
        console.log('[deepClean] Перезагрузка: ' + url.toString());
        window.location.replace(url.toString());
      } catch (e) {
        console.log('[deepClean] Ошибка reload: ' + e.message);
      }
      return results;
    })();
  `;

  try {
    const result = await mainWindow.webContents.executeJavaScript(script);
    console.log('[deepCleanAfterLoad] ✓ Готово:', JSON.stringify(result));
  } catch (e) {
    console.log('[deepCleanAfterLoad] Ошибка executeJavaScript:', e.message);
  }
}

// ============================================================
// ПРОТОКОЛ app://
// ============================================================

function registerProtocolHandler() {
  const mimeTypes = {
    '.html':  'text/html; charset=utf-8',
    '.js':    'application/javascript; charset=utf-8',
    '.css':   'text/css; charset=utf-8',
    '.json':  'application/json; charset=utf-8',
    '.png':   'image/png',
    '.jpg':   'image/jpeg',
    '.jpeg':  'image/jpeg',
    '.svg':   'image/svg+xml',
    '.ico':   'image/x-icon',
    '.woff':  'font/woff',
    '.woff2': 'font/woff2',
    '.ttf':   'font/ttf',
    '.webp':  'image/webp',
    '.webmanifest': 'application/manifest+json'
  };

  // Общая логика обоих API-путей: разбор URL, запрет выхода за APP_ROOT,
  // чтение файла. Возвращает { status, data: Buffer, mimeType }.
  function resolveFile(url) {
    let filePath;
    try {
      const u = new URL(url);
      filePath = path.normalize(path.join(APP_ROOT, u.pathname));
    } catch (e) {
      return { status: 403, data: Buffer.from('Forbidden') };
    }

    if (!filePath.startsWith(APP_ROOT)) {
      return { status: 403, data: Buffer.from('Forbidden') };
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    try {
      const data = fs.readFileSync(filePath);
      return { status: 200, data, mimeType };
    } catch (err) {
      return { status: 404, data: Buffer.from('Not Found: ' + url) };
    }
  }

  if (typeof protocol.handle === 'function') {
    // Electron 25+ — основная сборка (Electron 35, Windows 10+)
    protocol.handle('app', (request) => {
      const r = resolveFile(request.url);
      const headers = { 'cache-control': 'no-cache' };
      if (r.mimeType) headers['content-type'] = r.mimeType;
      else headers['content-type'] = 'text/plain; charset=utf-8';
      return new Response(r.data, { status: r.status, headers: headers });
    });
  } else {
    // Electron 22 (legacy-сборка для Windows 7/8.1, Task 354):
    // protocol.handle() появился только в Electron 25 — здесь старый
    // callback-API registerBufferProtocol (существует с древних версий,
    // объявлен deprecated, но в 22-й ветке — единственный путь).
    protocol.registerBufferProtocol('app', (request, callback) => {
      const r = resolveFile(request.url);
      callback({ data: r.data, mimeType: r.mimeType || 'text/plain; charset=utf-8' });
    });
  }
}

// ============================================================
// ЗАГРУЗКА ПРИЛОЖЕНИЯ (удалённый сервер → fallback на локальные файлы)
// ============================================================

const LOCAL_APP_URL = 'app://localhost/index.html';

// Проверка доступности удалённого сервера через модуль net Electron.
// ЕДИНЫЙ путь для Electron 22 и 35 (Task 354): в Node 16 (поставляется с
// Electron 22) нет global fetch в main-процессе, а net есть в обеих версиях
// и использует сетевой стек Chromium (системный прокси — бонус для корпоративных сетей).
function isRemoteAvailable(url, timeoutMs) {
  return new Promise((resolve) => {
    let req = null;
    let timer = null;
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (req) { try { req.destroy(); } catch (e) { /* уже закрыт */ } }
      resolve(ok);
    };
    try {
      req = net.request({ url: url, method: 'HEAD' });
    } catch (e) {
      resolve(false);
      return;
    }
    timer = setTimeout(() => done(false), timeoutMs);
    req.on('response', (res) => {
      done(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => {
      done(false);
    });
    req.end();
  });
}

async function loadApp() {
  if (!mainWindow) return;

  // Проверяем доступность удалённого сервера (timeout 4 сек)
  const remoteOk = await isRemoteAvailable(REMOTE_APP_URL, 4000);

  if (remoteOk) {
    console.log('[loadApp] Удалённый сервер доступен, загружаем:', REMOTE_APP_URL);
    mainWindow.loadURL(REMOTE_APP_URL);
    return;
  }

  // Сервер недоступен — используем локальные файлы (app://)
  console.log('[loadApp] Удалённый сервер недоступен, fallback на локальные файлы');
  mainWindow.loadURL(LOCAL_APP_URL);
}

// ============================================================
// ОКНО
// ============================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(APP_ROOT, 'images', 'icon-512.png'),
    title: 'КИПиА — справочник инженера',
    backgroundColor: '#1a2233',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: false
    },
    autoHideMenuBar: true,
    show: false
  });

  // Загружаем приложение: приоритет — удалённый сервер (GitHub Pages),
  // fallback — локальные файлы (app://), если сервер недоступен.
  // При изменении версии добавляем cache-busting к URL (Task 124),
  // чтобы Chromium HTTP-кэш не отдал старый index.html.
  loadApp();

  // Устанавливаем флаг, чтобы рендерер знал, что он работает в Electron
  // Также прокидываем функцию очистки HTTP-кэша Chromium
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.executeJavaScript(`
      window.__isElectron = true;
      window.__electronClearCache = async function() {
        // Эта функция вызывается через IPC из рендерера.
        // Реальная очистка делается через session.clearCache() в main процессе.
        // Здесь — заглушка, основная работа делается в меню «Обновить».
        return true;
      };
    `).then(() => {
      // Если версия изменилась → глубокая очистка через JS API.
      // JS API (navigator.serviceWorker, caches) работает на origin'е
      // страницы — гарантированно удаляет SW, в отличие от session API.
      if (pendingDeepClean) {
        console.log('[dom-ready] pendingDeepClean=true → запускаем deepCleanAfterLoad()');
        deepCleanAfterLoad().then(() => {
          console.log('[dom-ready] ✓ deepCleanAfterLoad завершён');
          pendingDeepClean = false;  // сбросить флаг (после reload он не нужен)
        }).catch((err) => {
          console.log('[dom-ready] Ошибка deepCleanAfterLoad:', err.message);
          pendingDeepClean = false;
        });
      }
    }).catch((err) => {
      console.log('[dom-ready] Ошибка executeJavaScript:', err.message);
    });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Разрешаем навигацию внутри приложения (app:// или GitHub Pages)
    if (url.startsWith('app://localhost') || url.startsWith(REMOTE_APP_URL)) {
      return; // навигация внутри приложения — разрешаем
    }
    // Всё остальное — открываем во внешнем браузере
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('context-menu', (e) => {
    e.preventDefault();
  });
}

// ============================================================
// МЕНЮ
// ============================================================

function createMenu() {
  const template = [
    {
      label: 'Файл',
      submenu: [
        {
          label: 'О приложении',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'КИПиА',
              message: 'КИПиА — справочник инженера',
              detail: `Версия: ${app.getVersion()}\n\nСправочник и калькулятор КИП и А.\n\nПриборы, блокировки, клапаны, регуляторы, кабельный журнал, проекты, калькуляторы, конвертер единиц, экзаменационные билеты.`,
              buttons: ['OK']
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Проверить обновления',
          click: () => {
            if (IS_LEGACY_WIN7) {
              // Task 354: в legacy-сборке автообновление отключено — основной
              // канал раздаёт сборки на Electron 35 (только Windows 10+).
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Обновления',
                message: 'Это legacy-сборка для Windows 7/8.1',
                detail: 'Автообновление оболочки отключено: основной канал обновлений требует Windows 10+.\n\nСодержимое справочника обновляется автоматически при каждом запуске (загружается с сервера).\n\nЕсли понадобится новая версия оболочки — скачайте файл *-win7-*.exe из раздела Releases на GitHub.',
                buttons: ['OK']
              });
              return;
            }
            checkForUpdates();
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Обновления',
              message: 'Проверка обновлений…',
              detail: 'Если доступна новая версия, появится предложение её загрузить.',
              buttons: ['OK']
            });
          }
        },
        { type: 'separator' },
        { label: 'Выход', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Вид',
      submenu: [
        {
          label: 'Обновить',
          accelerator: 'CmdOrCtrl+R',
          click: async () => {
            // Принудительное обновление: очищаем HTTP-кэш Chromium, SW и перезагружаем
            try {
              // Очищаем HTTP-кэш Chromium
              await mainWindow.webContents.session.clearCache();
              // Очищаем хранилище Service Worker
              await mainWindow.webContents.session.clearStorageData({
                storages: ['serviceworkers', 'cachestorage']
              });
            } catch (e) {
              console.log('[menu:Обновить] Ошибка очистки кэша:', e.message);
            }
            // Вызываем forceDesktopRefresh() в рендерере (очистка SW + обход кэша)
            mainWindow.webContents.executeJavaScript(`
              if (typeof forceDesktopRefresh === 'function') {
                forceDesktopRefresh();
              } else {
                window.location.reload(true);
              }
            `);
          }
        },
        { label: 'Полный экран', accelerator: 'F11', click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()) }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ============================================================
// ЗАПУСК
// ============================================================

app.whenReady().then(async () => {
  // Очистить SW и cacheStorage при каждом запуске (Task 129).
  // Должно выполниться ДО createWindow() / loadApp() — иначе старый SW
  // перехватит загрузку и отдаст закэшированный старый index.html.
  // Без проверки версии — всегда чистый старт, как в мобильной PWA.
  await cleanCacheOnStartup();

  registerProtocolHandler();
  createMenu();
  createWindow();

  // Проверяем обновления через 5 секунд после запуска
  // (не блокируем загрузку приложения; в legacy-сборке — отключено, Task 354)
  if (!IS_LEGACY_WIN7) {
    setTimeout(checkForUpdates, 5000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});
