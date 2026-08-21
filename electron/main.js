const { app, BrowserWindow, Menu, shell, dialog, protocol } = require('electron');
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
      devTools: false
    },
    autoHideMenuBar: true,
    show: false
  });

  // Загружаем приложение: приоритет — удалённый сервер (GitHub Pages),
  // fallback — локальные файлы (app://), если сервер недоступен.
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
    `);
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

app.whenReady().then(() => {
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
