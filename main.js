const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');

let win;
let tray;
let notificationsMuted = false;

function createWindow() {
    win = new BrowserWindow({
        width: 1000,
        height: 800,
        icon: path.join(__dirname, 'build/icon.png'),
                            webPreferences: {
                                preload: path.join(__dirname, 'preload.js'),
                            contextIsolation: true,
                            sandbox: false,
                            nodeIntegration: false,
                            enableRemoteModule: false,
                            partition: 'persist:whatsapp'
                            }
    });

    win.setMenuBarVisibility(false);
    win.removeMenu();

    const userAgent =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.78 Safari/537.36";

    win.loadURL("https://web.whatsapp.com", { userAgent });

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

    createTray();
}

function createTray() {
    const iconPath = path.join(__dirname, 'icon.png');
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show WhatsApp',
            click: () => win.show()
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    // Do nothing so it stays in tray
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
