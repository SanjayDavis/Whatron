'use strict';

const { BrowserWindow, app } = require('electron');
const path = require('path');
const { injectNotificationInterceptor } = require('./notification-interceptor');

const WA_ORIGIN           = 'https://web.whatsapp.com';
const ALLOWED_PERMISSIONS = new Set(['notifications', 'media']);
const USER_AGENT          = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.78 Safari/537.36';

let mainWindow = null;

function createMainWindow(store, alwaysOnTop, spellCheckEnabled) {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        icon: path.join(__dirname, 'assets', 'icons', 'icon_upscaled.png'),
        show: false,
        alwaysOnTop: alwaysOnTop,
        webPreferences: {
            preload: path.join(__dirname, 'app-preload.js'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            enableRemoteModule: false,
            partition: 'persist:whatsapp',
            spellcheck: spellCheckEnabled,
            enableWebSQL: false,
            webgl: true
        }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.removeMenu();

    const session = mainWindow.webContents.session;

    session.setPermissionRequestHandler((_wc, permission, callback, details) => {
        const origin = (details && details.requestingUrl) ? details.requestingUrl : (_wc.getURL() || '');
        callback(ALLOWED_PERMISSIONS.has(permission) && origin.startsWith(WA_ORIGIN));
    });

    session.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
        ALLOWED_PERMISSIONS.has(permission) && requestingOrigin.startsWith(WA_ORIGIN)
    );

    mainWindow.webContents.on('did-finish-load', () => {
        injectNotificationInterceptor(mainWindow.webContents);
    });

    mainWindow.webContents.on('did-navigate', (_event, _url, code) => {
        if (code !== 0) injectNotificationInterceptor(mainWindow.webContents);
    });

    const userAgent = USER_AGENT;
    mainWindow.loadURL(WA_ORIGIN, { userAgent });

    mainWindow.once('ready-to-show', () => mainWindow.show());

    mainWindow.on('close', (event) => {
        if (!app.isQuiting) { event.preventDefault(); hideWindow(); }
    });

    return mainWindow;
}

function getMainWindow() { return mainWindow; }

function showWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return false;

    try {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.setSkipTaskbar(false);
        mainWindow.show();

        if (process.platform === 'linux') {
            const prev = mainWindow.isAlwaysOnTop();
            mainWindow.setAlwaysOnTop(true, 'screen-saver');
            mainWindow.focus();
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(prev);
            }, 300);
        } else {
            mainWindow.focus();
            app.focus({ steal: true });
            mainWindow.moveTop();
        }

        if (process.platform === 'win32') {
            mainWindow.flashFrame(true);
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) mainWindow.flashFrame(false);
            }, 1000);
        }

        return true;
    } catch (err) {
        console.error('[window-manager] showWindow error:', err);
        return false;
    }
}

function hideWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
}

function openChatInWindow(sender) {
    if (!mainWindow || mainWindow.isDestroyed()) return false;

    const send = () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('open-chat', sender);
    };

    if (mainWindow.webContents.isLoading()) {
        mainWindow.webContents.once('did-finish-load', send);
    } else {
        send();
    }

    return true;
}

function showWindowAndOpenChat(sender) {
    const shown = showWindow();
    if (!shown) return false;
    if (sender) setTimeout(() => openChatInWindow(sender), 1000);
    return true;
}

module.exports = { createMainWindow, getMainWindow, showWindow, hideWindow, openChatInWindow, showWindowAndOpenChat };