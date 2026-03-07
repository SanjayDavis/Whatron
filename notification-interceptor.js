'use strict';

/**
 * notification-interceptor.js
 *
 * Injects a Notification constructor wrapper into the main world (world-0)
 * of the given webContents so that every WhatsApp Web OS notification has its
 * click event bridged back to the main process via IPC.
 *
 * Design constraints satisfied:
 *  - Does NOT disable contextIsolation.
 *  - Does NOT enable nodeIntegration.
 *  - Does NOT create a second OS notification — only wraps the one WA creates.
 *  - Guards against double-injection on SPA in-page navigations.
 *  - Forwards mute state from the preload (via contextBridge isMuted()) so
 *    we can suppress notifications when the user has muted via tray / Ctrl+M.
 *
 * Usage (from window-manager.js):
 *   const { injectNotificationInterceptor } = require('./notification-interceptor');
 *   injectNotificationInterceptor(mainWindow.webContents);
 */

// ── Injected code (runs in world-0, the same world as WhatsApp Web's JS) ──────
// Must be a self-contained IIFE that touches nothing global beyond what it
// intentionally replaces.  Written as a regular string (not a template literal)
// to avoid accidentally embedding backtick chars that could break executeJavaScript.
const INJECTED_CODE = [
    '(function () {',
    '  "use strict";',
    '',
    '  // Guard: prevent double-injection on SPA navigations.',
    '  if (window.__whatronNotifInjected) return;',
    '  window.__whatronNotifInjected = true;',
    '',
    '  var _OriginalNotification = window.Notification;',
    '  if (!_OriginalNotification) return; // safety: should never happen on WA Web',
    '',
    '  function WhatronNotification(title, options) {',
    '    options = options || {};',
    '',
    '    // Honour mute state exposed by the preload via contextBridge.',
    '    var muted = false;',
    '    try {',
    '      if (window.__whatronBridge && typeof window.__whatronBridge.isMuted === "function") {',
    '        muted = window.__whatronBridge.isMuted();',
    '      }',
    '    } catch (_e) {}',
    '',
    '    // Always create the underlying notification so WA Web\'s own state',
    '    // machine stays consistent (e.g. badge counts).',
    '    var instance = new _OriginalNotification(title, options);',
    '',
    '    // If muted, close immediately — OS never shows a popup.',
    '    if (muted) {',
    '      instance.close();',
    '      return instance;',
    '    }',
    '',
    '    // Forward click to main process through the contextBridge-exposed bridge.',
    '    instance.addEventListener("click", function () {',
    '      try {',
    '        if (window.__whatronBridge && typeof window.__whatronBridge.notificationClicked === "function") {',
    '          window.__whatronBridge.notificationClicked({',
    '            title:     String(title || ""),',
    '            body:      String((options && options.body)  || ""),',
    '            tag:       String((options && options.tag)   || ""),',
    '            icon:      String((options && options.icon)  || ""),',
    '            timestamp: Date.now()',
    '          });',
    '        }',
    '      } catch (_e) {',
    '        // Never let bridge errors surface into WA Web\'s own notification flow.',
    '      }',
    '    });',
    '',
    '    return instance;',
    '  }',
    '',
    '  // ── Copy static members from the original constructor ────────────────',
    '  Object.defineProperty(WhatronNotification, "permission", {',
    '    get: function () { return _OriginalNotification.permission; },',
    '    configurable: true',
    '  });',
    '',
    '  // requestPermission must stay on WhatronNotification so WA Web can grant',
    '  // permission through our wrapper without knowing the difference.',
    '  WhatronNotification.requestPermission = function (callback) {',
    '    var p = _OriginalNotification.requestPermission.call(_OriginalNotification, callback);',
    '    return p; // may be undefined in old browsers — that\'s fine',
    '  };',
    '',
    '  // Preserve prototype chain so "instanceof Notification" checks still pass.',
    '  WhatronNotification.prototype = _OriginalNotification.prototype;',
    '',
    '  window.Notification = WhatronNotification;',
    '})();'
].join('\n');

/**
 * Inject the Notification constructor wrapper into the renderer's main world.
 *
 * Call this:
 *  - After 'did-finish-load'   (initial page load)
 *  - After 'did-navigate'      (full-page navigations, e.g. WA session expire)
 *
 * In-page navigations ('did-navigate-in-page') are covered by the
 * __whatronNotifInjected guard inside the injected code itself.
 *
 * @param {Electron.WebContents} webContents
 */
function injectNotificationInterceptor(webContents) {
    if (!webContents || webContents.isDestroyed()) return;

    webContents.executeJavaScript(INJECTED_CODE, /* userGesture */ true)
        .then(() => {
            console.log('[notification-interceptor] Notification wrapper injected successfully');
        })
        .catch((err) => {
            // This can fire during a crash or premature navigation; not fatal.
            console.error('[notification-interceptor] Injection error:', err.message);
        });
}

module.exports = { injectNotificationInterceptor };
