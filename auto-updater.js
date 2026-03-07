'use strict';

const { autoUpdater } = require('electron-updater');
const { dialog, app } = require('electron');

let mainWindowGetter = null;
let initialised      = false;
let _manualCheck     = false;

function init({ getWindow }) {
    if (initialised) return;
    initialised = true;

    mainWindowGetter = getWindow;

    autoUpdater.autoDownload         = true;
    autoUpdater.autoInstallOnAppQuit = true;

    if (!app.isPackaged) return;

    autoUpdater.on('checking-for-update', () => {
        sendToRenderer('show-update-banner', { state: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
        console.log('[auto-updater] Update available:', info.version);
        sendToRenderer('show-update-banner', { version: info.version, state: 'downloading' });
    });

    autoUpdater.on('update-not-available', (info) => {
        if (_manualCheck) {
            sendToRenderer('show-update-banner', { state: 'uptodate', version: info.version });
        } else {
            sendToRenderer('hide-update-banner');
        }
        _manualCheck = false;
    });

    autoUpdater.on('download-progress', (progress) => {
        const win = getValidWindow();
        if (win) win.setProgressBar(progress.percent / 100);
        sendToRenderer('show-update-banner', { state: 'downloading', progress: Math.round(progress.percent) });
    });

    autoUpdater.on('update-downloaded', (info) => {
        clearProgressBar();
        console.log('[auto-updater] Update downloaded:', info.version);
        sendToRenderer('show-update-banner', { version: info.version, state: 'ready' });

        const win  = getValidWindow();
        const opts = {
            type:      'info',
            title:     'Update Ready — Whatron',
            message:   `Whatron v${info.version} is ready to install.`,
            detail:    'Restart now to apply the update, or it will be applied automatically the next time you launch the app.',
            buttons:   ['Restart Now', 'Later'],
            defaultId: 0,
            cancelId:  1
        };

        const dlg = win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts);
        dlg.then(({ response }) => {
            if (response === 0) autoUpdater.quitAndInstall(false, true);
        }).catch((err) => {
            console.error('[auto-updater] Restart dialog error:', err.message);
        });
    });

    autoUpdater.on('error', (err) => {
        clearProgressBar();
        console.error('[auto-updater] Error:', err.message);

        const SILENT_PATTERNS = [
            'net::ERR_INTERNET_DISCONNECTED', 'net::ERR_NAME_NOT_RESOLVED',
            'net::ERR_CONNECTION_REFUSED', 'net::ERR_FAILED',
            'ENOTFOUND', 'ETIMEDOUT', 'ENOENT',
            'HttpError: 404', 'HttpError: 403', '404', '403',
            'Cannot find latest', 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND',
            'No published versions', 'Update for version'
        ];
        const isSilent = SILENT_PATTERNS.some((p) => err.message.includes(p));
        if (_manualCheck) {
            sendToRenderer(
                isSilent ? 'hide-update-banner' : 'show-update-banner',
                isSilent ? null : { state: 'error' }
            );
        } else {
            sendToRenderer('hide-update-banner');
        }
        _manualCheck = false;
    });

    setTimeout(() => {
        if (!app.isPackaged) return;
        autoUpdater.checkForUpdates().catch((err) => {
            console.error('[auto-updater] background check threw:', err.message);
        });
    }, 20_000);
}

function checkNow() {
    if (!app.isPackaged) return;
    _manualCheck = true;
    autoUpdater.checkForUpdates().catch((err) => {
        console.error('[auto-updater] checkForUpdates() threw:', err.message);
        _manualCheck = false;
    });
}

function getValidWindow() {
    if (!mainWindowGetter) return null;
    try {
        const win = mainWindowGetter();
        return (win && !win.isDestroyed()) ? win : null;
    } catch {
        return null;
    }
}

function clearProgressBar() {
    const win = getValidWindow();
    if (win) win.setProgressBar(-1);
}

function sendToRenderer(channel, payload) {
    const win = getValidWindow();
    if (!win) return;
    const wc = win.webContents;
    if (wc.isLoading()) {
        wc.once('did-finish-load', () => wc.send(channel, payload ?? null));
    } else {
        wc.send(channel, payload ?? null);
    }
}

module.exports = { init, checkNow };