'use strict';

/**
 * contextActions.js
 * Pure action handlers — each function returns void and must not throw.
 * ipcRenderer is passed in at init time so this module stays testable.
 */

let _ipc = null;

function init(ipcRenderer) {
    _ipc = ipcRenderer;
}

// ── Clipboard ────────────────────────────────────────────────────────────────

function copyText(text) {
    if (!text) return;
    _ipc.send('ctx-clipboard-write', { type: 'text', value: text });
}

function copyLink(url) {
    if (!url) return;
    _ipc.send('ctx-clipboard-write', { type: 'text', value: url });
}

function copyImageUrl(url) {
    if (!url) return;
    _ipc.send('ctx-clipboard-write', { type: 'text', value: url });
}

// ── Browser / shell ──────────────────────────────────────────────────────────

function openExternal(url) {
    if (!url) return;
    _ipc.send('ctx-open-external', url);
}

// ── Page ─────────────────────────────────────────────────────────────────────

function reloadPage() {
    window.location.reload();
}

function copyPageUrl() {
    _ipc.send('ctx-clipboard-write', { type: 'text', value: window.location.href });
}

function openPageInBrowser() {
    openExternal(window.location.href);
}

function inspectElement(x, y) {
    _ipc.send('ctx-inspect-element', { x, y });
}

// ── Selection ────────────────────────────────────────────────────────────────

function copySelection(text) {
    copyText(text);
}

function searchSelection(text) {
    if (!text) return;
    openExternal(`https://www.google.com/search?q=${encodeURIComponent(text)}`);
}

function translateSelection(text) {
    if (!text) return;
    openExternal(`https://translate.google.com/?text=${encodeURIComponent(text)}`);
}

function copyAsQuote(text) {
    if (!text) return;
    copyText(`> ${text}`);
}

// ── Editable ─────────────────────────────────────────────────────────────────

function editCut() {
    document.execCommand('cut');
}

function editCopy() {
    document.execCommand('copy');
}

function editPaste() {
    _ipc.send('ctx-paste');
}

function editSelectAll(target) {
    if (!target) return;
    if (target.select) {
        target.select();
    } else {
        const range = document.createRange();
        range.selectNodeContents(target);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

// ── Image ────────────────────────────────────────────────────────────────────

function openImageInBrowser(src) {
    openExternal(src);
}

function downloadImage(src) {
    if (!src) return;
    _ipc.send('ctx-download', src);
}

function saveImageAs(src) {
    if (!src) return;
    _ipc.send('ctx-save-as', src);
}

// ── Message ──────────────────────────────────────────────────────────────────

function copyMessageText(text) {
    copyText(text);
}

function copyMessageTimestamp(ts) {
    copyText(ts);
}

module.exports = {
    init,
    copyText, copyLink, copyImageUrl,
    openExternal,
    reloadPage, copyPageUrl, openPageInBrowser, inspectElement,
    copySelection, searchSelection, translateSelection, copyAsQuote,
    editCut, editCopy, editPaste, editSelectAll,
    openImageInBrowser, downloadImage, saveImageAs,
    copyMessageText, copyMessageTimestamp,
};
