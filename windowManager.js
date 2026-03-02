const { BrowserWindow, app } = require('electron');
const path = require('path');

let mainWindow = null;

function createMainWindow(store, alwaysOnTop, spellCheckEnabled) {
    console.log('Creating main window...');
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        icon: path.join(__dirname, 'icon_upscaled.png'),
        show: false,
        alwaysOnTop: alwaysOnTop,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: true,          // SEC-3: sandbox:false was unnecessary; preload only uses ipcRenderer
            nodeIntegration: false,
            enableRemoteModule: false,
            partition: 'persist:whatsapp',
            spellcheck: spellCheckEnabled,
            enableWebSQL: false,
            webgl: true
            // experimentalFeatures removed (SEC-5) — increases CVE surface, not needed
            // backgroundThrottling kept at default true (PERF-2) — false was inflating idle CPU
        }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.removeMenu();

    const userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.78 Safari/537.36";
    mainWindow.loadURL("https://web.whatsapp.com", { userAgent });

    mainWindow.once('ready-to-show', () => {
        console.log('Window ready to show');
        mainWindow.show();
        // Uncomment to debug renderer process:
        // mainWindow.webContents.openDevTools();
    });

    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            hideWindow();
        }
    });

    return mainWindow;
}

function getMainWindow() {
    return mainWindow;
}

function showWindow() {
    console.log('===== showWindow called =====');
    console.log('Current state:', {
        exists: !!mainWindow,
        isDestroyed: mainWindow ? mainWindow.isDestroyed() : 'n/a',
        isVisible: mainWindow ? mainWindow.isVisible() : 'n/a',
        isMinimized: mainWindow ? mainWindow.isMinimized() : 'n/a'
    });

    if (!mainWindow || mainWindow.isDestroyed()) {
        console.error('ERROR: Window does not exist or is destroyed!');
        return false;
    }

    try {
        if (mainWindow.isMinimized()) {
            console.log('Window is minimized, restoring...');
            mainWindow.restore();
        }

        console.log('Setting skip taskbar to false...');
        mainWindow.setSkipTaskbar(false);
        
        console.log('Calling show()...');
        mainWindow.show();
        console.log('show() completed, isVisible:', mainWindow.isVisible());
        
        // STAB-5: Wayland does not support steal-focus or moveTop reliably.
        // Use app.focus only — hide/show hack is Windows-only and must stay that way.
        mainWindow.focus();
        
        if (process.platform !== 'linux') {
            app.focus({ steal: true });
            mainWindow.moveTop();
        }

        // STAB-4: Add isDestroyed() guard before touching window in async callback
        console.log('Setting always on top temporarily...');
        const wasAlwaysOnTop = mainWindow.isAlwaysOnTop();
        mainWindow.setAlwaysOnTop(true);
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setAlwaysOnTop(wasAlwaysOnTop);
                console.log('Restored always-on-top to:', wasAlwaysOnTop);
            }
        }, 100);
        
        // Windows-specific flash/focus hacks only
        if (process.platform === 'win32') {
            console.log('Applying Windows-specific window showing hacks...');
            mainWindow.flashFrame(true);
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) mainWindow.flashFrame(false);
            }, 1000);
            mainWindow.hide();
            mainWindow.show();
            mainWindow.focus();
        }

        console.log('Final state - isVisible:', mainWindow.isVisible());
        console.log('===== showWindow completed =====');
        return true;
    } catch (error) {
        console.error('ERROR in showWindow:', error);
        return false;
    }
}

function hideWindow() {
    console.log('Hiding window to tray');
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
    }
}

function openChatInWindow(sender) {
    console.log('openChatInWindow called for:', sender);
    
    if (!mainWindow || mainWindow.isDestroyed()) {
        console.log('Window does not exist in openChatInWindow');
        return false;
    }

    const sendOpenChat = () => {
        console.log('Sending open-chat IPC to renderer for:', sender);
        mainWindow.webContents.send('open-chat', sender);
    };

    if (mainWindow.webContents.isLoading()) {
        console.log('WebContents still loading, waiting for did-finish-load');
        mainWindow.webContents.once('did-finish-load', sendOpenChat);
    } else {
        console.log('WebContents already loaded, sending open-chat now');
        sendOpenChat();
    }

    return true;
}

function showWindowAndOpenChat(sender) {
    console.log('===== showWindowAndOpenChat called =====');
    console.log('Sender:', sender);
    
    console.log('Calling showWindow()...');
    const shown = showWindow();
    console.log('showWindow() returned:', shown);
    
    if (!shown) {
        console.error('ERROR: Failed to show window');
        return false;
    }

    if (sender) {
        console.log('Sender provided, will open chat after delay...');
        // Give window more time to become active before sending chat open
        setTimeout(() => {
            console.log('Delay completed, calling openChatInWindow...');
            openChatInWindow(sender);
        }, 500);
    } else {
        console.log('No sender provided, window shown without opening chat');
    }

    console.log('===== showWindowAndOpenChat completed =====');
    return true;
}

module.exports = {
    createMainWindow,
    getMainWindow,
    showWindow,
    hideWindow,
    openChatInWindow,
    showWindowAndOpenChat
};
