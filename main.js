const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, globalShortcut, powerMonitor, dialog, shell, Notification } = require('electron');
const path = require('path');
const AutoLaunch = require('auto-launch');
const Store = require('electron-store');
const EventEmitter = require('events');
EventEmitter.defaultMaxListeners = 20;

// Disable sandbox for AppImage compatibility
app.commandLine.appendSwitch('no-sandbox');

const store = new Store();
const autoLauncher = new AutoLaunch({
    name: 'Unofficial_WhatsApp',
    path: app.getPath('exe')
});

let win;
let tray;
let notificationsMuted = false;
let currentZoom = 1.0;
let batterySaverMode = false;
let alwaysOnTop = store.get('alwaysOnTop', false);
let autoLaunchEnabled = store.get('autoLaunch', false);
let spellCheckEnabled = store.get('spellCheck', true);

function createWindow() {
    win = new BrowserWindow({
        width: 1000,
        height: 800,
        icon: path.join(__dirname, 'icon_upscaled.png'),
        show: false,
        alwaysOnTop: alwaysOnTop,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: false,
            nodeIntegration: false,
            enableRemoteModule: false,
            partition: 'persist:whatsapp',
            spellcheck: spellCheckEnabled,
            enableWebSQL: false,
            webgl: true,
            experimentalFeatures: true,
            backgroundThrottling: false
        }
    });

    win.setMenuBarVisibility(false);
    win.removeMenu();

    const userAgent =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.78 Safari/537.36";

    win.loadURL("https://web.whatsapp.com", { userAgent });

    win.once('ready-to-show', () => {
        win.show();
    });

    win.webContents.session.on('will-download', (event, item, webContents) => {
        const fileName = item.getFilename();
        const downloadPath = path.join(app.getPath('downloads'), 'WhatsApp', fileName);
        
        // Create WhatsApp folder in Downloads if it doesn't exist
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
                const notification = new Notification({
                    title: 'Download Complete',
                    body: `${fileName} saved to WhatsApp folder`,
                    silent: false
                });
                notification.on('click', () => {
                    shell.showItemInFolder(downloadPath);
                });
                notification.show();
            }
        });
    });

    //  Handle external links
    const { shell } = require('electron');
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, url) => {
        const currentUrl = win.webContents.getURL();
        if (url !== currentUrl && !url.includes("web.whatsapp.com")) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    win.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            win.hide();
        }
    });

    // Register keyboard shortcuts for zoom
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
        // Screenshot capture: Ctrl+Shift+S
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

    createTray();
}

function createTray() {
    const iconPath = path.join(__dirname, 'icon_upscaled.png');
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show WhatsApp',
            click: () => win.show()
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
                    icon: path.join(__dirname, 'icon_upscaled.png'),
                    webPreferences: {
                        preload: path.join(__dirname, 'preload.js'),
                        contextIsolation: true,
                        sandbox: false,
                        nodeIntegration: false,
                        partition: 'persist:whatsapp-2' // Separate session for second account
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
        win.isVisible() ? win.hide() : win.show();
    });

    setInterval(() => {
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

// Performance optimizations
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-features', 'UseChromeOSDirectVideoDecoder');
app.commandLine.appendSwitch('disable-software-rasterizer');

// Single instance lock - prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // Another instance is already running, quit this one
    app.quit();
} else {
    // Handle second instance attempt
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, focus our window instead
        if (win) {
            if (win.isMinimized()) win.restore();
            if (!win.isVisible()) win.show();
            win.focus();
        }
    });
}

// Battery saver mode - reduce resource usage on battery
app.whenReady().then(() => {
    powerMonitor.on('on-battery', () => {
        batterySaverMode = true;
        if (win && win.webContents) {
            win.webContents.setFrameRate(30); // Lower frame rate to save battery
        }
    });

    powerMonitor.on('on-ac', () => {
        batterySaverMode = false;
        if (win && win.webContents) {
            win.webContents.setFrameRate(60); // Normal frame rate
        }
    });

    createWindow();
});

// Memory management - clear cache periodically
setInterval(() => {
    if (win && win.webContents) {
        const session = win.webContents.session;
        session.clearCache().catch(() => {});
        
        // Force garbage collection if memory is high
        if (global.gc && process.memoryUsage().heapUsed > 500 * 1024 * 1024) {
            global.gc();
        }
    }
}, 30 * 60 * 1000); // Every 30 minutes

app.on('window-all-closed', () => {
    // Do nothing so it stays in tray
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
