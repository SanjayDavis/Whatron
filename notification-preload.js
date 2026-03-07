'use strict';

const { contextBridge, ipcRenderer } = require('electron');

let ch = {};

contextBridge.exposeInMainWorld('electronAPI', {
    openFile:     () => ch.open    && ipcRenderer.send(ch.open),
    showInFolder: () => ch.folder  && ipcRenderer.send(ch.folder),
    dismiss:      () => ch.dismiss && ipcRenderer.send(ch.dismiss),
});

ipcRenderer.on('notif-init', (_e, { chOpen, chFolder, chDismiss, duration }) => {
    ch = { open: chOpen, folder: chFolder, dismiss: chDismiss };
    if (window.__notifReady) window.__notifReady(duration);
});

