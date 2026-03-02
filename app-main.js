const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, powerMonitor, dialog, shell } = require('electron');
const path = require('path');
const AutoLaunch = require('auto-launch');
const Store = require('electron-store');
const EventEmitter = require('events');
const windowManager = require('./window-manager');
const customNotifier = require('./custom-notifier');

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

// ── Global error guards (STAB-1) ─────────────────────────────────────────
process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
});

// Safe wrapper for shell.openExternal — only allow http(s) and mailto (SEC-2)
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
let notificationsMuted = false;
let currentZoom = 1.0;
let batterySaverMode = false;
let alwaysOnTop = store.get('alwaysOnTop', false);
let autoLaunchEnabled = store.get('autoLaunch', false);
let spellCheckEnabled = store.get('spellCheck', true);
function createWindow() {
    // Use window manager to create window
    win = windowManager.createMainWindow(store, alwaysOnTop, spellCheckEnabled);
    
    setupWindowHandlers();
    setupIPCHandlers();
    createTray();
}

function setupWindowHandlers() {
    // Download handler
    win.webContents.session.on('will-download', (event, item, webContents) => {
        const fileName = item.getFilename();
        const downloadPath = path.join(app.getPath('downloads'), 'WhatsApp', fileName);
        const fs = require('fs');
        const downloadDir = path.join(app.getPath('downloads'), 'WhatsApp');
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }
        item.setSavePath(downloadPath);
        item.on('updated', (event, state) => {
            if (state === 'progressing') {
                const progress = item.getReceivedBytes() / item.getTotalBytes();
                win.setProgressBar(progress);
            }
        });
        item.once('done', (event, state) => {
            win.setProgressBar(-1);
            if (state === 'completed') {
                // CRASH-1 fix: use customNotifier (imported), not notificationHandler (was never imported)
                customNotifier.showNotification({
                    title: 'Download Complete',
                    message: `${fileName} saved to WhatsApp folder`,
                    sender: null,
                    duration: 6000,
                    onClick: () => shell.showItemInFolder(downloadPath)
                });
            }
        });
    });

    // WhatsApp link handler
    const isWhatsAppLink = (url) => {
        return url.includes('web.whatsapp.com') || 
               url.includes('wa.me') || 
               url.includes('whatsapp.com') ||
               url.startsWith('whatsapp://');
    };
    
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (isWhatsAppLink(url)) {
            return { action: 'allow' };
        }
        safeOpenExternal(url); // SEC-2: validated before opening
        return { action: 'deny' };
    });
    
    win.webContents.on('will-navigate', (event, url) => {
        const currentUrl = win.webContents.getURL();
        if (url !== currentUrl && !isWhatsAppLink(url)) {
            event.preventDefault();
            safeOpenExternal(url); // SEC-2: validated before opening
        }
    });

    // Keyboard shortcuts
    win.webContents.on('before-input-event', (event, input) => {
        if (input.control) {
            if (input.key === '=' || input.key === '+') {
                currentZoom = Math.min(currentZoom + 0.1, 2.0);
                win.webContents.setZoomFactor(currentZoom);
                event.preventDefault();
            } else if (input.key === '-') {
                currentZoom = Math.max(currentZoom - 0.1, 0.5);
                win.webContents.setZoomFactor(currentZoom);
                event.preventDefault();
            } else if (input.key === '0') {
                currentZoom = 1.0;
                win.webContents.setZoomFactor(currentZoom);
                event.preventDefault();
            }
        }
        if (input.control && input.shift && input.key.toLowerCase() === 's') {
            win.webContents.capturePage().then(image => {
                const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
                const screenshotPath = path.join(app.getPath('pictures'), `WhatsApp-Screenshot-${timestamp}.png`);
                require('fs').writeFileSync(screenshotPath, image.toPNG());
                dialog.showMessageBox(win, {
                    type: 'info',
                    title: 'Screenshot Saved',
                    message: `Screenshot saved to:\n${screenshotPath}`,
                    buttons: ['OK', 'Open Folder']
                }).then(result => {
                    if (result.response === 1) {
                        shell.showItemInFolder(screenshotPath);
                    }
                });
            });
            event.preventDefault();
        }
    });
}

function setupIPCHandlers() {
    // IPC handler for showing window and opening chat
    ipcMain.on('show-window-and-open-chat', (event, sender) => {
        console.log('[IPC] show-window-and-open-chat received for:', sender);
        windowManager.showWindowAndOpenChat(sender);
    });

    // IPC handler for renderer logs
    ipcMain.on('renderer-log', (_event, ...args) => {
        console.log('[renderer]', ...args);
    });

    // IPC handler for showing notifications (NEW - Custom HTML Notifier)
    ipcMain.on('show-notification', (event, data) => {
        console.log('[IPC] show-notification request:', data.title);
        
        customNotifier.showNotification({
            title: data.title,
            message: data.body || data.message || '',
            sender: data.sender,
            duration: 8000,
            onClick: (sender) => {
                console.log('[IPC] Notification clicked for sender:', sender);
                if (sender) {
                    windowManager.showWindowAndOpenChat(sender);
                } else {
                    windowManager.showWindow();
                }
            }
        });
    });
}
function createTray() {
    const iconPath = path.join(__dirname, 'assets', 'icons', 'icon_upscaled.png');
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show WhatsApp',
            click: () => windowManager.showWindow()
        },
        { type: 'separator' },
        {
            label: 'Always on Top',
            type: 'checkbox',
            checked: alwaysOnTop,
            click: (menuItem) => {
                alwaysOnTop = menuItem.checked;
                win.setAlwaysOnTop(alwaysOnTop);
                store.set('alwaysOnTop', alwaysOnTop);
            }
        },
        {
            label: 'Mute Notifications',
            type: 'checkbox',
            checked: notificationsMuted,
            click: (menuItem) => {
                notificationsMuted = menuItem.checked;
                win.webContents.send('toggle-mute', notificationsMuted);
            }
        },
        {
            label: 'Battery Saver',
            type: 'checkbox',
            checked: batterySaverMode,
            click: (menuItem) => {
                batterySaverMode = menuItem.checked;
                if (win && win.webContents) {
                    win.webContents.setFrameRate(batterySaverMode ? 30 : 60);
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Auto-launch on Startup',
            type: 'checkbox',
            checked: autoLaunchEnabled,
            click: async (menuItem) => {
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
            label: 'Enable Spell Check',
            type: 'checkbox',
            checked: spellCheckEnabled,
            click: (menuItem) => {
                spellCheckEnabled = menuItem.checked;
                store.set('spellCheck', spellCheckEnabled);
                dialog.showMessageBox(win, {
                    type: 'info',
                    title: 'Restart Required',
                    message: 'Please restart the app for spell check changes to take effect.',
                    buttons: ['OK', 'Restart Now']
                }).then(result => {
                    if (result.response === 1) {
                        app.relaunch();
                        app.quit();
                    }
                });
            }
        },
        {
            label: 'Take Screenshot',
            accelerator: 'Ctrl+Shift+S',
            click: () => {
                win.webContents.capturePage().then(image => {
                    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
                    const screenshotPath = path.join(app.getPath('pictures'), `WhatsApp-Screenshot-${timestamp}.png`);
                    require('fs').writeFileSync(screenshotPath, image.toPNG());
                    shell.showItemInFolder(screenshotPath);
                });
            }
        },
        {
            label: 'Open Second Account',
            click: () => {
                const secondWin = new BrowserWindow({
                    width: 1000,
                    height: 800,
                    icon: path.join(__dirname, 'assets', 'icons', 'icon_upscaled.png'),
                    webPreferences: {
                        preload: path.join(__dirname, 'app-preload.js'),
                        contextIsolation: true,
                        sandbox: false,
                        nodeIntegration: false,
                        partition: 'persist:whatsapp-2' 
                    }
                });
                const userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.78 Safari/537.36";
                secondWin.loadURL("https://web.whatsapp.com", { userAgent });
                secondWin.setMenuBarVisibility(false);
                secondWin.removeMenu();
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
    tray.setToolTip("WhatsApp");
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
        if (win.isVisible()) {
            windowManager.hideWindow();
        } else {
            windowManager.showWindow();
        }
    });
    // LEAK-2: store interval ID so it can be cleared on app quit
    if (trayTooltipInterval) clearInterval(trayTooltipInterval);
    trayTooltipInterval = setInterval(() => {
        if (win && win.webContents) {
            win.webContents.executeJavaScript(`
            (() => {
                const isOnline = navigator.onLine;
                const el = document.querySelector('title');
                const match = el ? el.textContent.match(/\\((\\d+)\\)/) : null;
                return { count: match ? match[1] : null, isOnline };
            })();
            `).then(({ count, isOnline }) => {
                let tooltip = "WhatsApp";
                if (isOnline) {
                    tooltip += count ? ` - ${count} unread message(s)` : "";
                } else {
                    tooltip += " - OFFLINE";
                }
                tray.setToolTip(tooltip);
            }).catch(() => {});
        }
    }, 5000);
}
// STAB-8: VaapiVideoDecoder renamed to VaapiVideoDecodeLinuxGL in newer Chromium;
//         UseChromeOSDirectVideoDecoder was removed and causes GPU process crash on some Mesa.
//         Keep only the safe, non-deprecated flags.
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-software-rasterizer');
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        console.log('Second instance detected, showing window');
        windowManager.showWindow();
    });
}
app.whenReady().then(() => {
    powerMonitor.on('on-battery', () => {
        batterySaverMode = true;
        if (win && win.webContents) {
            win.webContents.setFrameRate(30); 
        }
    });
    powerMonitor.on('on-ac', () => {
        batterySaverMode = false;
        if (win && win.webContents) {
            win.webContents.setFrameRate(60); 
        }
    });
    createWindow();

    // LEAK-3: cache clear interval must be inside whenReady, and stored for cleanup
    const cacheInterval = setInterval(() => {
        if (win && !win.isDestroyed() && win.webContents) {
            // Only clear HTTP cache (not storage/cookies) to avoid forcing media re-downloads
            win.webContents.session.clearCache().catch(() => {});
            if (global.gc && process.memoryUsage().heapUsed > 500 * 1024 * 1024) {
                global.gc();
            }
        }
    }, 30 * 60 * 1000);

    app.on('before-quit', () => {
        clearInterval(cacheInterval);
        if (trayTooltipInterval) clearInterval(trayTooltipInterval);
    });
});
app.on('window-all-closed', () => {
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
