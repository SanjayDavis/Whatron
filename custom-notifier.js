'use strict';

const { BrowserWindow, ipcMain, shell, screen } = require('electron');
const path = require('path');

let activeWindows = [];

const FILE_TYPES = {
    image:   { exts: ['jpg','jpeg','png','gif','webp','bmp','svg','avif','heic'],                           color: '#00a884' },
    video:   { exts: ['mp4','mkv','avi','mov','webm','flv','m4v'],                                         color: '#8b5cf6' },
    audio:   { exts: ['mp3','m4a','ogg','wav','aac','flac','opus'],                                        color: '#3b82f6' },
    pdf:     { exts: ['pdf'],                                                                               color: '#ef4444' },
    doc:     { exts: ['doc','docx','odt','rtf'],                                                           color: '#2563eb' },
    sheet:   { exts: ['xls','xlsx','csv','ods'],                                                           color: '#10b981' },
    slide:   { exts: ['ppt','pptx','odp'],                                                                 color: '#f97316' },
    archive: { exts: ['zip','rar','7z','tar','gz','bz2','xz'],                                            color: '#f59e0b' },
    code:    { exts: ['js','ts','py','java','c','cpp','cs','go','rs','php','rb','swift','kt','dart','sh'], color: '#06b6d4' },
    text:    { exts: ['txt','md','json','xml','yaml','yml','ini','cfg','log'],                             color: '#94a3b8' },
    app:     { exts: ['apk','exe','msi','deb','rpm','dmg','appimage'],                                    color: '#f43f5e' },
};

const ICONS = {
    image:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><path d="M3 16l5-5 4 4 3-3 5 5"/></svg>`,
    video:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="16" height="16" rx="2.5"/><path d="M18 10l4-3v10l-4-3V10z"/></svg>`,
    audio:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="18" r="3"/><path d="M11 18V8l10 2v8"/><circle cx="18" cy="14" r="3"/></svg>`,
    pdf:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><path d="M9 13h2a1.5 1.5 0 0 1 0 3H9v-3"/><line x1="9" y1="19" x2="9" y2="16"/></svg>`,
    doc:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`,
    sheet:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="16" y2="16"/><line x1="12" y1="8" x2="12" y2="20"/></svg>`,
    slide:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21l4-4 4 4"/><line x1="12" y1="17" x2="12" y2="21"/><polygon points="10,7 10,13 16,10" fill="currentColor" stroke="none"/></svg>`,
    archive: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10H3v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10z"/><rect x="2" y="4" width="20" height="6" rx="1.5"/><line x1="12" y1="14" x2="12" y2="18"/></svg>`,
    code:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>`,
    text:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"/><path d="M21 6H3"/><path d="M21 14H3"/><line x1="11" y1="18" x2="3" y2="18"/></svg>`,
    app:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="8" y1="3" x2="8" y2="9"/></svg>`,
    default: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>`,
};

function getFileInfo(ext) {
    const e = (ext || '').toLowerCase();
    for (const [type, { exts, color }] of Object.entries(FILE_TYPES)) {
        if (exts.includes(e)) return { color, icon: ICONS[type] };
    }
    return { color: '#566b76', icon: ICONS.default };
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildHTML({ title, fileName, color, icon, duration }) {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;user-select:none}
.toast{position:absolute;inset:8px;background:#1e2d35;border:1px solid rgba(255,255,255,0.07);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,0.55),0 2px 8px rgba(0,0,0,0.4);overflow:hidden;display:flex;flex-direction:column;transform:translateX(calc(100% + 24px));transition:transform 0.28s cubic-bezier(0.34,1.56,0.64,1)}
.toast.in{transform:translateX(0)}
.body{flex:1;display:flex;align-items:center;gap:12px;padding:11px 10px 10px 12px}
.icon-wrap{flex-shrink:0;width:44px;height:44px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:${color}26;color:${color}}
.icon-wrap svg{width:22px;height:22px}
.content{flex:1;min-width:0}
.label{font-size:10.5px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:#566b76;margin-bottom:3px}
.filename{font-size:13px;font-weight:500;color:#e9edef;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px;line-height:1.3}
.actions{display:flex;align-items:center;gap:2px}
.btn{background:none;border:none;cursor:pointer;font-family:inherit;font-size:11.5px;font-weight:600;padding:3px 7px;border-radius:5px;transition:background 0.1s,color 0.1s;letter-spacing:0.1px}
.btn-primary{color:${color}}
.btn-primary:hover{background:${color}1a}
.btn-secondary{color:#566b76}
.btn-secondary:hover{color:#8696a0;background:rgba(255,255,255,0.05)}
.dot{color:rgba(134,150,160,0.25);font-size:14px;padding:0 1px;line-height:1}
.close{flex-shrink:0;background:none;border:none;cursor:pointer;color:rgba(134,150,160,0.3);font-size:17px;line-height:1;width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:color 0.1s,background 0.1s;align-self:flex-start;margin-top:1px}
.close:hover{color:#8696a0;background:rgba(255,255,255,0.06)}
.progress{height:2px;background:rgba(255,255,255,0.05);flex-shrink:0}
.progress-fill{height:100%;background:${color};border-radius:0 1px 1px 0;width:100%;opacity:0.65;transition:width linear}
</style></head><body>
<div class="toast" id="toast">
  <div class="body">
    <div class="icon-wrap">${icon}</div>
    <div class="content">
      <div class="label">${escapeHtml(title)}</div>
      <div class="filename" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</div>
      <div class="actions">
        <button class="btn btn-primary" id="btn-open">Open</button>
        <span class="dot">·</span>
        <button class="btn btn-secondary" id="btn-folder">Show in folder</button>
      </div>
    </div>
    <button class="close" id="btn-dismiss">&#x2715;</button>
  </div>
  <div class="progress"><div class="progress-fill" id="prog-fill"></div></div>
</div>
<script>
  const toast = document.getElementById('toast');
  const fill  = document.getElementById('prog-fill');
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('in')));
  window.__notifReady = (ms) => {
    fill.style.transitionDuration = ms + 'ms';
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = '0%'; }));
  };
  document.getElementById('btn-open').addEventListener('click',    () => window.electronAPI.openFile());
  document.getElementById('btn-folder').addEventListener('click',  () => window.electronAPI.showInFolder());
  document.getElementById('btn-dismiss').addEventListener('click', () => window.electronAPI.dismiss());
</script>
</body></html>`;
}

function showNotification({ title = 'Download Complete', filePath, duration = 6000 }) {
    const fileName = path.basename(filePath || '');
    const ext      = path.extname(fileName).slice(1);
    const { color, icon } = getFileInfo(ext);

    const ts        = Date.now();
    const chOpen    = `notif-open-${ts}`;
    const chFolder  = `notif-folder-${ts}`;
    const chDismiss = `notif-dismiss-${ts}`;

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const WIN_W = 370, WIN_H = 110;
    const stackOffset = activeWindows.length * (WIN_H + 10);

    const notifWin = new BrowserWindow({
        width: WIN_W, height: WIN_H,
        x: width  - WIN_W - 12,
        y: height - WIN_H - 12 - stackOffset,
        frame: false, transparent: true,
        alwaysOnTop: true, skipTaskbar: true,
        resizable: false, focusable: false,
        webPreferences: {
            preload: path.join(__dirname, 'notification-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    let cleanup, closeNotif, onOpen, onFolder, onDismiss;

    cleanup = () => {
        ipcMain.removeListener(chOpen,    onOpen);
        ipcMain.removeListener(chFolder,  onFolder);
        ipcMain.removeListener(chDismiss, onDismiss);
        activeWindows = activeWindows.filter(w => w !== notifWin);
    };

    closeNotif = () => {
        cleanup();
        if (!notifWin.isDestroyed()) notifWin.close();
    };

    onOpen    = () => { if (filePath) shell.openPath(filePath);            closeNotif(); };
    onFolder  = () => { if (filePath) shell.showItemInFolder(filePath);    closeNotif(); };
    onDismiss = () => closeNotif();

    ipcMain.once(chOpen,    onOpen);
    ipcMain.once(chFolder,  onFolder);
    ipcMain.once(chDismiss, onDismiss);

    notifWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildHTML({ title, fileName, color, icon, duration }))}`);
    notifWin.showInactive();

    notifWin.webContents.once('did-finish-load', () => {
        if (!notifWin.isDestroyed()) {
            notifWin.webContents.send('notif-init', { chOpen, chFolder, chDismiss, duration });
        }
    });

    const autoClose = setTimeout(closeNotif, duration + 400);
    notifWin.on('closed', () => { clearTimeout(autoClose); cleanup(); });

    activeWindows.push(notifWin);
}

module.exports = { showNotification };

