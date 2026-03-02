const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let notificationWindows = [];

/**
 * Show a custom HTML-based notification
 * @param {Object} options - Notification options
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {string} options.sender - Chat sender (optional, for click handling)
 * @param {number} options.duration - How long to show (ms, default 8000)
 * @param {Function} options.onClick - Click callback
 */
function showNotification(options) {
    const { title, message, sender, duration = 8000, onClick } = options;

    console.log('=== Custom Notification ===');
    console.log('Title:', title);
    console.log('Message:', message);
    console.log('Sender:', sender);
    console.log('Duration:', duration);

    // Create notification window
    const notificationWindow = new BrowserWindow({
        width: 400,
        height: 120,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: {
            preload: path.join(__dirname, 'notification-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    // Position notification in bottom-right corner
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    
    // Stack notifications if multiple
    const offsetY = notificationWindows.length * 140;
    notificationWindow.setPosition(width - 420, height - 140 - offsetY);

    // Load HTML content
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                    overflow: hidden;
                }
                .notification {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 8px;
                    padding: 16px;
                    margin: 8px;
                    color: white;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                    cursor: pointer;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }
                .notification:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 15px 35px rgba(0,0,0,0.3);
                }
                .notification:active {
                    transform: translateY(0);
                }
                .title {
                    font-weight: 600;
                    font-size: 14px;
                    margin-bottom: 4px;
                    opacity: 0.95;
                }
                .message {
                    font-size: 13px;
                    opacity: 0.9;
                    line-height: 1.4;
                    max-width: 350px;
                    word-wrap: break-word;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                }
            </style>
        </head>
        <body>
            <div class="notification" id="notification">
                <div class="title">${escapeHtml(title)}</div>
                <div class="message">${escapeHtml(message)}</div>
            </div>
            <script>
                const notification = document.getElementById('notification');
                
                notification.addEventListener('click', () => {
                    // CRASH-5 fix: use JSON.stringify for JS context, not HTML-escaping.
                    // escapeHtml() produces &#039; for apostrophes which is literal text inside JS strings.
                    window.electronAPI.notificationClicked(${JSON.stringify(sender || '')});
                });
                
                notification.addEventListener('mousedown', function() {
                    this.style.opacity = '0.9';
                });
                
                notification.addEventListener('mouseup', function() {
                    this.style.opacity = '1';
                });
            </script>
        </body>
        </html>
    `;

    notificationWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // Show window
    notificationWindow.showInactive(); // showInactive doesn't steal focus from the user
    console.log('Notification window shown');

    // Handle notification click from renderer
    const handleClick = (_event, clickedSender) => {
        console.log('!!! NOTIFICATION CLICKED !!!');
        console.log('Sender:', clickedSender);
        
        if (onClick) {
            onClick(clickedSender);
        }

        // Remove and close window
        notificationWindow.close();
        notificationWindows = notificationWindows.filter(w => w !== notificationWindow);
    };

    // Register one-time listener
    const channel = `notification-clicked-${Date.now()}`;
    ipcMain.once(channel, handleClick);

    // CRASH-4 fix: send channel AFTER renderer is ready, not immediately after loadURL
    // (the renderer's ipcRenderer.on listener isn't registered yet at loadURL time)
    notificationWindow.webContents.once('did-finish-load', () => {
        if (!notificationWindow.isDestroyed()) {
            notificationWindow.webContents.send('set-notification-channel', channel);
        }
    });

    // Auto-close after duration
    const timeoutId = setTimeout(() => {
        if (!notificationWindow.isDestroyed()) {
            // LEAK-4 fix: remove the once-listener before closing so the closure
            // (which holds references to notificationWindow, onClick, etc.) is freed.
            ipcMain.removeListener(channel, handleClick);
            notificationWindow.close();
            notificationWindows = notificationWindows.filter(w => w !== notificationWindow);
            console.log('Notification auto-closed after', duration, 'ms');
        }
    }, duration);

    // Clean up on close
    notificationWindow.on('closed', () => {
        clearTimeout(timeoutId);
        ipcMain.removeListener(channel, handleClick); // LEAK-4: ensure listener removed on any close path
        notificationWindows = notificationWindows.filter(w => w !== notificationWindow);
        console.log('Notification window closed, remaining:', notificationWindows.length);
    });

    // Track this notification
    notificationWindows.push(notificationWindow);
    console.log('Active notifications:', notificationWindows.length);
    console.log('============================');

    return notificationWindow;
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

module.exports = {
    showNotification
};
