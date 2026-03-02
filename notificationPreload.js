const { contextBridge, ipcRenderer } = require('electron');

let notificationChannel = null;

contextBridge.exposeInMainWorld('electronAPI', {
    notificationClicked: (sender) => {
        console.log('notificationClicked called with sender:', sender);
        if (notificationChannel) {
            ipcRenderer.send(notificationChannel, sender);
        }
    }
});

ipcRenderer.on('set-notification-channel', (event, channel) => {
    console.log('Notification channel set:', channel);
    notificationChannel = channel;
});
