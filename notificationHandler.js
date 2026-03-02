const notifier = require('node-notifier');
const path = require('path');
const { showWindowAndOpenChat } = require('./windowManager');

// Store active notification data for click handling
const activeNotifications = new Map();

// LEAK-1 fix: register the 'click' listener ONCE at module scope, not inside createNotification().
// Registering inside createNotification() adds a new listener on every call,
// causing all previous listeners to fire simultaneously on each subsequent click.
notifier.on('click', (notifierObject, options) => {
    console.log('!!! NOTIFICATION CLICK EVENT !!!');
    const data = activeNotifications.get(options.id);
    if (data && data.sender) {
        console.log('Found sender:', data.sender);
        handleNotificationClick(data.sender);
        activeNotifications.delete(options.id);
    }
});

function createNotification(data) {
    console.log('=== createNotification called ===');
    console.log('Title:', data.title);
    console.log('Body:', data.body);
    console.log('Sender:', data.sender);
    console.log('Silent:', data.silent);
    
    const notifId = Date.now() + Math.random();
    activeNotifications.set(notifId, data);
    
    const notificationOptions = {
        title: data.title,
        message: data.body,
        icon: path.join(__dirname, 'icon_upscaled.png'),
        sound: !data.silent,
        wait: true, // Wait for user interaction
        appID: 'com.sanjaydavis.whatsapp-electron',
        id: notifId
    };

    console.log('Sending notification with node-notifier...');
    
    notifier.notify(notificationOptions, (err, response, metadata) => {
        console.log('--- Notification callback ---');
        console.log('Error:', err);
        console.log('Response:', response);
        console.log('Metadata:', metadata);
        
        if (err) {
            console.error('Notification error:', err);
            activeNotifications.delete(notifId);
            return;
        }
        
        // Response is 'activate' when user clicks the notification
        if (response === 'activate' || metadata?.activationType === 'clicked') {
            console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
            console.log('!!! NOTIFICATION CLICKED !!!');
            console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
            console.log('Sender:', data.sender);
            handleNotificationClick(data.sender);
            activeNotifications.delete(notifId);
        } else if (response === 'timeout' || response === 'dismissed') {
            console.log('Notification dismissed or timed out');
            activeNotifications.delete(notifId);
        }
    });

    console.log('Notification sent successfully');
    console.log('====================================');
}

function handleNotificationClick(sender) {
    console.log('===== handleNotificationClick called =====');
    console.log('Sender:', sender);
    
    // Always show window, and open chat if sender is provided
    console.log('Calling showWindowAndOpenChat...');
    const result = showWindowAndOpenChat(sender);
    
    console.log('showWindowAndOpenChat returned:', result);
    
    if (!result) {
        console.error('ERROR: Failed to show window and open chat');
    } else {
        console.log('SUCCESS: Window shown and chat opening');
    }
    console.log('===== handleNotificationClick completed =====');
}

function handleNotificationReply(sender, replyText) {
    console.log('handleNotificationReply called for:', sender, 'message:', replyText);
    
    // Show window and open chat
    const windowManager = require('./windowManager');
    const win = windowManager.getMainWindow();
    
    if (win && !win.isDestroyed()) {
        windowManager.showWindowAndOpenChat(sender);
        
        // Wait for chat to open, then send the reply
        setTimeout(() => {
            win.webContents.send('send-message', {
                sender: sender,
                message: replyText
            });
        }, 1500);
    }
}

module.exports = {
    createNotification,
    handleNotificationClick,
    handleNotificationReply
};
