'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, powerMonitor, dialog, shell } = require('electron');
const path = require('path');
const AutoLaunch = require('auto-launch');
const Store = require('electron-store');
const EventEmitter = require('events');
const windowManager = require('./window-manager');
const customNotifier = require('./custom-notifier');
const appUpdater     = require('./auto-updater');
const { injectNotificationInterceptor } = require('./notification-interceptor');

EventEmitter.defaultMaxListeners = 20;

const fs = require('fs');
try {
    const gpuCache = path.join(app.getPath('userData'), 'GPUCache');
    if (fs.existsSync(gpuCache)) fs.rmSync(gpuCache, { recursive: true, force: true });
} catch {}
app.commandLine.appendSwitch('disk-cache-dir', path.join(app.getPath('userData'), 'Cache'));

app.setName('Unofficial WhatsApp');
if (process.platform === 'win32') {
    app.setAppUserModelId('com.sanjaydavis.whatsapp-electron');
}

const store = new Store();
const autoLauncher = new AutoLaunch({
    name: 'Unofficial_WhatsApp',
    path: app.getPath('exe')
});

process.on('uncaughtException',  (err)    => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));

function safeOpenExternal(url) {
    try {
        const parsed = new URL(url);
        if (['https:', 'http:', 'mailto:'].includes(parsed.protocol)) {
            shell.openExternal(url);
        } else {
            console.warn('[safeOpenExternal] Blocked URL with protocol:', parsed.protocol);
        }
    } catch {
        console.warn('[safeOpenExternal] Invalid URL:', url);
    }
}

let win;
let tray;
let trayTooltipInterval = null;

let notificationsMuted = store.get('notificationsMuted', false);
let currentZoom        = store.get('zoom', 1.0);

let batterySaverMode  = false;
let alwaysOnTop       = store.get('alwaysOnTop', false);
let autoLaunchEnabled = store.get('autoLaunch', false);
let spellCheckEnabled = store.get('spellCheck', true);

function createWindow() {
    win = windowManager.createMainWindow(store, alwaysOnTop, spellCheckEnabled);
    setupWindowHandlers();
    setupIPCHandlers();
    createTray();

    win.webContents.on('did-finish-load', () => {
        if (currentZoom !== 1.0) win.webContents.setZoomFactor(currentZoom);
        win.webContents.send('toggle-mute', notificationsMuted);
    });
}

function setupWASession(browserWindow) {
    const WA_ORIGIN           = 'https://web.whatsapp.com';
    const ALLOWED_PERMISSIONS = new Set(['notifications', 'media']);
    const session             = browserWindow.webContents.session;

    session.setPermissionRequestHandler((wc, permission, callback, details) => {
        const origin = (details && details.requestingUrl) ? details.requestingUrl : (wc.getURL() || '');
        callback(ALLOWED_PERMISSIONS.has(permission) && origin.startsWith(WA_ORIGIN));
    });

    session.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
        ALLOWED_PERMISSIONS.has(permission) && requestingOrigin.startsWith(WA_ORIGIN)
    );

    browserWindow.webContents.on('did-finish-load', () => {
        injectNotificationInterceptor(browserWindow.webContents);
    });
    browserWindow.webContents.on('did-navigate', (_event, _url, code) => {
        if (code !== 0) injectNotificationInterceptor(browserWindow.webContents);
    });
}

function setupWindowHandlers() {
    win.webContents.session.on('will-download', (event, item) => {
        const fileName    = item.getFilename();
        const downloadDir = path.join(app.getPath('downloads'), 'WhatsApp');
        const downloadPath = path.join(downloadDir, fileName);

        if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

        item.setSavePath(downloadPath);

        item.on('updated', (_event, state) => {
            if (state === 'progressing') {
                const total    = item.getTotalBytes();
                const received = item.getReceivedBytes();
                if (total > 0) win.setProgressBar(received / total);
            }
        });

        item.once('done', (_event, state) => {
            win.setProgressBar(-1);
            if (state === 'completed') {
                customNotifier.showNotification({
                    title:    'Download Complete',
                    filePath: downloadPath,
                    duration: 6000
                });
            }
        });
    });

    const isWhatsAppLink = (url) =>
        url.includes('web.whatsapp.com') ||
        url.includes('wa.me') ||
        url.includes('whatsapp.com') ||
        url.startsWith('whatsapp://');

    win.webContents.setWindowOpenHandler(({ url }) => {
        if (isWhatsAppLink(url)) return { action: 'allow' };
        safeOpenExternal(url);
        return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, url) => {
        const currentUrl = win.webContents.getURL();
        if (url !== currentUrl && !isWhatsAppLink(url)) {
            event.preventDefault();
            safeOpenExternal(url);
        }
    });

    win.webContents.on('before-input-event', (event, input) => {
        if (input.control) {
            if (input.key === '=' || input.key === '+') {
                currentZoom = Math.min(currentZoom + 0.1, 2.0);
                win.webContents.setZoomFactor(currentZoom);
                store.set('zoom', currentZoom);
                event.preventDefault();
            } else if (input.key === '-') {
                currentZoom = Math.max(currentZoom - 0.1, 0.5);
                win.webContents.setZoomFactor(currentZoom);
                store.set('zoom', currentZoom);
                event.preventDefault();
            } else if (input.key === '0') {
                currentZoom = 1.0;
                win.webContents.setZoomFactor(currentZoom);
                store.set('zoom', currentZoom);
                event.preventDefault();
            }
        }
        if (input.control && input.shift && input.key.toLowerCase() === 's') {
            win.webContents.capturePage().then(image => {
                const timestamp      = new Date().toISOString().replace(/:/g, '-').split('.')[0];
                const screenshotPath = path.join(app.getPath('pictures'), `WhatsApp-Screenshot-${timestamp}.png`);
                fs.writeFileSync(screenshotPath, image.toPNG());
                dialog.showMessageBox(win, {
                    type:    'info',
                    title:   'Screenshot Saved',
                    message: `Screenshot saved to:\n${screenshotPath}`,
                    buttons: ['OK', 'Open Folder']
                }).then(result => {
                    if (result.response === 1) shell.showItemInFolder(screenshotPath);
                });
            });
            event.preventDefault();
        }
    });
}

function setupIPCHandlers() {
    ipcMain.on('show-window-and-open-chat', (_event, sender) => {
        console.log('[IPC] show-window-and-open-chat:', sender);
        windowManager.showWindowAndOpenChat(sender);
    });

    ipcMain.on('renderer-log', (_event, ...args) => {
        console.log('[renderer]', ...args);
    });

    ipcMain.on('mute-state-changed', (_event, muted) => {
        notificationsMuted = muted;
        store.set('notificationsMuted', muted);
    });

    ipcMain.on('wa-notification-clicked', (event, payload) => {
        const senderUrl = event.senderFrame ? event.senderFrame.url : '';
        if (!senderUrl.startsWith('https://web.whatsapp.com')) return;
        if (!payload || typeof payload !== 'object') return;

        const title      = typeof payload.title === 'string' ? payload.title.trim() : '';
        const tag        = typeof payload.tag   === 'string' ? payload.tag.trim()   : '';
        const phoneMatch = /^(\d+)@c\.us$/.exec(tag);
        const sender     = title || (phoneMatch ? phoneMatch[1] : null);

        if (sender) {
            windowManager.showWindowAndOpenChat(sender);
        } else {
            windowManager.showWindow();
        }
    });

    ipcMain.on('ctx-clipboard-write', (_event, { type, value }) => {
        if (type === 'text' && typeof value === 'string') {
            require('electron').clipboard.writeText(value);
        }
    });

    ipcMain.on('ctx-open-external', (_event, url) => {
        safeOpenExternal(url);
    });

    ipcMain.on('ctx-inspect-element', (_event, { x, y }) => {
        if (win && !win.isDestroyed()) win.webContents.inspectElement(x, y);
    });

    ipcMain.on('ctx-download', (_event, url) => {
        if (win && !win.isDestroyed()) win.webContents.downloadURL(url);
    });

    ipcMain.on('ctx-save-as', (_event, url) => {
        if (win && !win.isDestroyed()) win.webContents.downloadURL(url);
    });

    ipcMain.on('ctx-paste', (_event) => {
        if (win && !win.isDestroyed()) win.webContents.paste();
    });

    ipcMain.on('check-for-updates', () => {
        appUpdater.checkNow();
    });

    ipcMain.on('restart-and-install', () => {
        const { autoUpdater } = require('electron-updater');
        autoUpdater.quitAndInstall(false, true);
    });
}

function createTray() {
    const iconPath = path.join(__dirname, 'assets', 'icons', 'icon_upscaled.png');
    tray = new Tray(nativeImage.createFromPath(iconPath));

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show WhatsApp',
            click: () => windowManager.showWindow()
        },
        { type: 'separator' },
        {
            label:   'Always on Top',
            type:    'checkbox',
            checked: alwaysOnTop,
            click:   (menuItem) => {
                alwaysOnTop = menuItem.checked;
                win.setAlwaysOnTop(alwaysOnTop);
                store.set('alwaysOnTop', alwaysOnTop);
            }
        },
        {
            label:   'Mute Notifications',
            type:    'checkbox',
            checked: notificationsMuted,
            click:   (menuItem) => {
                notificationsMuted = menuItem.checked;
                store.set('notificationsMuted', notificationsMuted);
                win.webContents.send('toggle-mute', notificationsMuted);
            }
        },
        {
            label:   'Battery Saver',
            type:    'checkbox',
            checked: batterySaverMode,
            click:   (menuItem) => {
                batterySaverMode = menuItem.checked;
                if (win && win.webContents) {
                    win.webContents.setFrameRate(batterySaverMode ? 30 : 60);
                }
            }
        },
        { type: 'separator' },
        {
            label:   'Auto-launch on Startup',
            type:    'checkbox',
            checked: autoLaunchEnabled,
            click:   async (menuItem) => {
                autoLaunchEnabled = menuItem.checked;
                if (autoLaunchEnabled) {
                    await autoLauncher.enable();
                } else {
                    await autoLauncher.disable();
                }
                store.set('autoLaunch', autoLaunchEnabled);
            }
        },
        {
            label:   'Enable Spell Check',
            type:    'checkbox',
            checked: spellCheckEnabled,
            click:   (menuItem) => {
                spellCheckEnabled = menuItem.checked;
                store.set('spellCheck', spellCheckEnabled);
                dialog.showMessageBox(win, {
                    type:    'info',
                    title:   'Restart Required',
                    message: 'Please restart the app for spell check changes to take effect.',
                    buttons: ['OK', 'Restart Now']
                }).then(result => {
                    if (result.response === 1) { app.relaunch(); app.quit(); }
                });
            }
        },
        { type: 'separator' },
        {
            label: 'Take Screenshot',
            accelerator: 'Ctrl+Shift+S',
            click: () => {
                win.webContents.capturePage().then(image => {
                    const timestamp      = new Date().toISOString().replace(/:/g, '-').split('.')[0];
                    const screenshotPath = path.join(app.getPath('pictures'), `WhatsApp-Screenshot-${timestamp}.png`);
                    fs.writeFileSync(screenshotPath, image.toPNG());
                    shell.showItemInFolder(screenshotPath);
                });
            }
        },
        {
            label: 'Check for Updates',
            click: () => appUpdater.checkNow()
        },
        {
            label: 'Open Second Account',
            click: () => {
                const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.78 Safari/537.36';
                const secondWin = new BrowserWindow({
                    width:  1000,
                    height: 800,
                    icon:   path.join(__dirname, 'assets', 'icons', 'icon_upscaled.png'),
                    webPreferences: {
                        preload:          path.join(__dirname, 'app-preload.js'),
                        contextIsolation: true,
                        sandbox:          true,
                        nodeIntegration:  false,
                        partition:        'persist:whatsapp-2'
                    }
                });
                secondWin.setMenuBarVisibility(false);
                secondWin.removeMenu();
                setupWASession(secondWin);
                secondWin.loadURL('https://web.whatsapp.com', { userAgent });
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.isQuiting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('WhatsApp');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
        if (win.isVisible()) {
            windowManager.hideWindow();
        } else {
            windowManager.showWindow();
        }
    });

    if (trayTooltipInterval) clearInterval(trayTooltipInterval);
    trayTooltipInterval = setInterval(() => {
        if (win && !win.isDestroyed() && win.webContents) {
            win.webContents.executeJavaScript(`
            (() => {
                const isOnline = navigator.onLine;
                const el    = document.querySelector('title');
                const match = el ? el.textContent.match(/\\((\\d+)\\)/) : null;
                return { count: match ? match[1] : null, isOnline };
            })();
            `).then(({ count, isOnline }) => {
                let tooltip = 'WhatsApp';
                if (isOnline) tooltip += count ? ` - ${count} unread message(s)` : '';
                else tooltip += ' - OFFLINE';
                tray.setToolTip(tooltip);
            }).catch(() => {});
        }
    }, 5000);
}

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-software-rasterizer');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => windowManager.showWindow());
}

app.whenReady().then(() => {
    powerMonitor.on('on-battery', () => {
        batterySaverMode = true;
        if (win && win.webContents) win.webContents.setFrameRate(30);
    });
    powerMonitor.on('on-ac', () => {
        batterySaverMode = false;
        if (win && win.webContents) win.webContents.setFrameRate(60);
    });

    createWindow();

    appUpdater.init({
        getWindow: windowManager.getMainWindow
    });

    const cacheInterval = setInterval(() => {
        if (win && !win.isDestroyed() && win.webContents) {
            win.webContents.session.clearCache().catch(() => {});
            if (global.gc && process.memoryUsage().heapUsed > 500 * 1024 * 1024) global.gc();
        }
    }, 30 * 60 * 1000);

    app.on('before-quit', () => {
        clearInterval(cacheInterval);
        if (trayTooltipInterval) clearInterval(trayTooltipInterval);
    });
});

app.on('window-all-closed', () => {});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});