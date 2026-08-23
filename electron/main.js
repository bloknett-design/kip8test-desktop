const { app, BrowserWindow, Menu, shell, dialog, protocol, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

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

autoUpdater.autoDownload = false; // не скачивать автоматически — спросим пользователя
autoUpdater.autoInstallOnAppQuit = true; // установить при закрытии

autoUpdater.on('update-available', (info) => {
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
});

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

// Функция проверки обновлений
function checkForUpdates() {
  try {
    autoUpdater.checkForUpdates().catch(() => {});
  } catch (e) {
    // Не критично — обновления не обязательны
  }
}

let pendingDeepClean = false;  // флаг: нужно ли глубокую очистку SW через JS API

// ============================================================
// ОЧИСТКА КЭША ПРИ ИЗМЕНЕНИИ ВЕРСИИ ПРИЛОЖЕНИЯ (фикс Task 124)
// ============================================================
// При установке обновления Electron старый Service Worker и HTTP-кэш
// Chromium сохраняются в userData. SW перехватывает fetch и отдаёт
// закэшированный старый index.html — пользователь не видит новый код,
// хотя GitHub Pages уже обновился.
//
// Проблема Task 123: session.clearStorageData() без указания origin
// может не очистить SW для HTTPS origin, когда приложение грузится через
// https://. Также HTTP-кэш Chromium может отдать старый index.html через
// условный запрос (304 Not Modified).
//
// Решение Task 124: ДВУХУРОВНЕВАЯ очистка:
// 1. ДО загрузки страницы: session.clearCache() + clearStorageData с origin
// 2. ПОСЛЕ dom-ready: executeJavaScript, который через JS API
//    (navigator.serviceWorker.getRegistrations + unregister,
//    caches.keys + caches.delete) гарантированно удаляет SW на origin'е
//    страницы, потом перезагружает с cache-busting ?_nocache=ts

async function cleanCacheOnVersionChange() {
  const userDataPath = app.getPath('userData');
  const versionFile = path.join(userDataPath, 'last-version.txt');
  const currentVersion = app.getVersion();

  let lastVersion = null;
  try {
    lastVersion = fs.readFileSync(versionFile, 'utf8').trim();
  } catch (e) {
    // Файла нет — первый запуск или после ручного сброса
    console.log('[cleanCacheOnVersionChange] Файл версии не найден — первый запуск');
  }

  if (lastVersion === currentVersion) {
    console.log(`[cleanCacheOnVersionChange] Версия не изменилась (${currentVersion}) — кэш не трогаем`);
    return;
  }

  console.log(`[cleanCacheOnVersionChange] ${lastVersion || '(новая установка)'} → ${currentVersion}, очищаем SW и кэш`);
  pendingDeepClean = true;  // поставить флаг для dom-ready хука

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
    console.log('[cleanCacheOnVersionChange] ✓ SW и cacheStorage очищены (session API)');

    // Сохранить новую версию
    fs.writeFileSync(versionFile, currentVersion, 'utf8');
    console.log(`[cleanCacheOnVersionChange] ✓ Версия ${currentVersion} сохранена в last-version.txt`);
  } catch (e) {
    console.log('[cleanCacheOnVersionChange] Ошибка при очистке:', e.message);
    // Не блокируем запуск — dom-ready хук попробует ещё раз через JS API
  }
}

// Глубокая очистка SW через JS API после загрузки страницы.
// Эта функция вызывается из dom-ready хука, ЕСЛИ версия изменилась.
// В отличие от session API, JS API (navigator.serviceWorker, caches)
// работает на origin'е страницы — гарантированно удаляет SW.
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
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let filePath = path.normalize(path.join(APP_ROOT, url.pathname));

    if (!filePath.startsWith(APP_ROOT)) {
      return new Response('Forbidden', { status: 403 });
    }

    const ext = path.extname(filePath).toLowerCase();
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
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    try {
      const data = fs.readFileSync(filePath);
      return new Response(data, {
        status: 200,
        headers: {
          'content-type': mimeType,
          'cache-control': 'no-cache'
        }
      });
    } catch (err) {
      return new Response('Not Found: ' + url.pathname, { status: 404 });
    }
  });
}

// ============================================================
// ЗАГРУЗКА ПРИЛОЖЕНИЯ (удалённый сервер → fallback на локальные файлы)
// ============================================================

const LOCAL_APP_URL = 'app://localhost/index.html';

async function loadApp() {
  if (!mainWindow) return;

  // Проверяем доступность удалённого сервера (timeout 4 сек)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(REMOTE_APP_URL, {
      method: 'HEAD',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      console.log('[loadApp] Удалённый сервер доступен, загружаем:', REMOTE_APP_URL);
      mainWindow.loadURL(REMOTE_APP_URL);
      return;
    }
  } catch (e) {
    // Сервер недоступен — используем локальные файлы
    console.log('[loadApp] Удалённый сервер недоступен, fallback на локальные файлы');
  }

  // Fallback: загружаем из локальных файлов (app://)
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
      devTools: true   // Task 125: включено для диагностики — можно убрать после фикса
    },
    autoHideMenuBar: false,  // Task 125: показываем меню bar, чтобы был доступ к «Вид → Обновить» и DevTools
    show: false
  });

  // Task 125: автоматически открыть DevTools при запуске для диагностики
  // После нахождения причины бага можно убрать эту строку
  mainWindow.webContents.openDevTools({ mode: 'detach' });

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

    // Task 125: через 3 секунды собрать диагностику и показать в виде alert + в консоль
    // Это поможет понять, что реально грузится в Electron
    setTimeout(async () => {
      if (!mainWindow) return;
      try {
        const diag = await mainWindow.webContents.executeJavaScript(`
          (async function() {
            var d = {};
            // URL страницы
            d.url = window.location.href;
            d.origin = window.location.origin;
            // Service Worker
            if ('serviceWorker' in navigator) {
              try {
                var regs = await navigator.serviceWorker.getRegistrations();
                d.sw_count = regs.length;
                d.sw_urls = regs.map(function(r) { return r.active ? r.active.scriptURL : '(no active)'; });
                d.sw_controller = navigator.serviceWorker.controller
                  ? navigator.serviceWorker.controller.scriptURL : '(null)';
              } catch (e) { d.sw_error = e.message; }
            } else {
              d.sw_count = -1; d.sw_urls = ['serviceWorker API не поддерживается'];
            }
            // Cache Storage
            if ('caches' in window) {
              try {
                var names = await caches.keys();
                d.cache_names = names;
              } catch (e) { d.cache_error = e.message; }
            } else {
              d.cache_names = ['caches API не поддерживается'];
            }
            // CACHE_VERSION из index.html (если есть)
            try {
              // попытаемся получить sw.js и прочитать CACHE_VERSION
              var resp = await fetch('sw.js?v=' + Date.now(), { cache: 'no-store' });
              var txt = await resp.text();
              var m = txt.match(/CACHE_VERSION\\\\s*=\\\\s*['\"]([^'\"]+)['\"]/);
              d.sw_cache_version = m ? m[1] : '(не найдено в sw.js)';
            } catch (e) { d.sw_cache_version = 'Ошибка: ' + e.message; }
            // Проверка ключевых элементов Task 119/120 в DOM
            d.has_flowDesktopTabs = !!document.getElementById('flowDesktopTabs');
            d.has_flowFavBtn = !!document.getElementById('flowFavBtn');
            d.flow_card_fav_btn_count = document.querySelectorAll('.flow-card-fav-btn').length;
            // Активная страница
            var activePage = document.querySelector('.page-content.active');
            d.active_page = activePage ? activePage.id : '(нет active)';
            // localStorage ключи
            d.ls_keys_electron = !!localStorage.getItem('last-version.txt');
            // __isElectron
            d.is_electron = !!window.__isElectron;
            // meta-теги
            var metaViewport = document.querySelector('meta[name=viewport]');
            d.viewport = metaViewport ? metaViewport.content : '(нет)';
            // user agent
            d.ua = navigator.userAgent.substring(0, 100);
            return d;
          })();
        `);
        const msg = '=== ДИАГНОСТИКА v2.1.3 ===\\n\\n' +
                    'URL: ' + diag.url + '\\n' +
                    'Origin: ' + diag.origin + '\\n\\n' +
                    '__isElectron: ' + diag.is_electron + '\\n' +
                    'UserAgent: ' + diag.ua + '\\n\\n' +
                    'Service Worker:\\n' +
                    '  count: ' + diag.sw_count + '\\n' +
                    '  urls: ' + JSON.stringify(diag.sw_urls) + '\\n' +
                    '  controller: ' + diag.sw_controller + '\\n\\n' +
                    'Cache Storage:\\n' +
                    '  names: ' + JSON.stringify(diag.cache_names) + '\\n\\n' +
                    'CACHE_VERSION в sw.js: ' + diag.sw_cache_version + '\\n\\n' +
                    'DOM (Task 119/120):\\n' +
                    '  #flowDesktopTabs: ' + diag.has_flowDesktopTabs + '\\n' +
                    '  #flowFavBtn: ' + diag.has_flowFavBtn + '\\n' +
                    '  .flow-card-fav-btn count: ' + diag.flow_card_fav_btn_count + '\\n\\n' +
                    'Активная страница: ' + diag.active_page + '\\n' +
                    'viewport: ' + diag.viewport;
        console.log(msg);
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Диагностика v2.1.3 (Task 125)',
          message: 'Диагностика приложения',
          detail: msg,
          buttons: ['OK'],
          defaultId: 0
        });
      } catch (e) {
        console.log('[diag] Ошибка:', e.message);
      }
    }, 3000);
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
  // Очистить SW и cacheStorage при изменении версии Electron-приложения.
  // Должно выполниться ДО createWindow() / loadApp() — иначе старый SW
  // перехватит загрузку и отдаст закэшированный старый index.html.
  await cleanCacheOnVersionChange();

  registerProtocolHandler();
  createMenu();
  createWindow();

  // Проверяем обновления через 5 секунд после запуска
  // (не блокируем загрузку приложения)
  setTimeout(checkForUpdates, 5000);

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
