package main

// injectJS contains all JavaScript that is injected into WhatsApp Web via webview.Init().
// It runs before window.onload on every page navigation.
const injectJS = `
(function() {
  'use strict';

  // ── Guard against double-injection ────────────────────────────────────────
  if (window.__whatronInjected) return;
  window.__whatronInjected = true;

  // ── Mute state ────────────────────────────────────────────────────────────
  var _muted = false;
  window.__whatronSetMuted = function(muted) { _muted = !!muted; };
  window.__whatronIsMuted  = function()      { return _muted; };

  // ── Go bridge helpers ─────────────────────────────────────────────────────
  // These match Bind() calls in main.go
  function bridgeCall(fn, args) {
    if (typeof window[fn] === 'function') {
      return window[fn].apply(null, args || []);
    }
  }

  // ── Spoof User Agent and Platform to Linux ────────────────────────────────
  const linuxUA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  try {
    Object.defineProperty(navigator, 'userAgent', { get: function() { return linuxUA; } });
    Object.defineProperty(navigator, 'platform', { get: function() { return 'Linux x86_64'; } });
    Object.defineProperty(navigator, 'appVersion', { get: function() { return linuxUA; } });
    if (navigator.userAgentData) {
      Object.defineProperty(navigator.userAgentData, 'platform', { get: function() { return 'Linux'; } });
    }
  } catch (e) {}

  // ── Notification interceptor ───────────────────────────────────────────────
  var _notifications = {};
  var _notifCounter = 0;

  function WhatronNotification(title, options) {
    options = options || {};
    var notifId = ++_notifCounter;

    var dummy = {
      close: function(){},
      addEventListener: function(type, listener){
        if (type === 'click') this.onclick = listener;
      },
      onclick: null
    };

    _notifications[notifId] = dummy;

    if (_muted) return dummy;

    // Log for debugging
    console.log('[Whatron] Intercepted notification:', title, options);

    bridgeCall('__goShowNotification', [{
      id:    notifId,
      title: String(title || ''),
      body:  String((options && options.body) || ''),
      tag:   String((options && options.tag)  || '')
    }]);

    return dummy;
  }
  Object.defineProperty(WhatronNotification, 'permission', {
    get: function() { return 'granted'; },
    configurable: true
  });
  WhatronNotification.requestPermission = function(cb) {
    if (cb) cb('granted');
    return Promise.resolve('granted');
  };
  window.Notification = WhatronNotification;

  window.__whatronClickNotif = function(id) {
    var dummy = _notifications[id];
    if (dummy && typeof dummy.onclick === 'function') {
      console.log('[Whatron] Simulating notification click for id:', id);
      dummy.onclick({ preventDefault: function(){} });
    } else {
      console.warn('[Whatron] No onclick handler found for notification id:', id);
    }
  };

  // ── Theme engine ──────────────────────────────────────────────────────────
  var _themes = {
    dark: 'html{filter:invert(1) hue-rotate(180deg);background:#121212!important;scroll-behavior:smooth;-webkit-font-smoothing:antialiased}img,video{filter:invert(1) hue-rotate(180deg)}*{scrollbar-color:#444 #222}',
    classic: ''
  };
  var _themeStyle = null;

  window.__whatronApplyTheme = function(name) {
    var css = _themes[name] || '';
    if (!_themeStyle) {
      _themeStyle = document.createElement('style');
      _themeStyle.id = '__whatron-theme';
      (document.head || document.documentElement).appendChild(_themeStyle);
    }
    _themeStyle.textContent = css;
    try { localStorage.setItem('whatron-theme', name); } catch(e) {}
  };

  // Apply persisted theme on load
  window.addEventListener('DOMContentLoaded', function() {
    // Hide 'Get WhatsApp for Windows' banner universally via CSS
    var hideBannerStyle = document.createElement('style');
    hideBannerStyle.textContent = '[aria-label="Get WhatsApp for Windows"], [title="Get WhatsApp for Windows"], a[href*="whatsapp.com/download"], a[href*="apps.microsoft.com"] { display: none !important; }';
    (document.head || document.documentElement).appendChild(hideBannerStyle);

    var savedTheme = '';
    try { savedTheme = localStorage.getItem('whatron-theme') || ''; } catch(e) {}
    if (savedTheme && _themes[savedTheme] !== undefined) {
      window.__whatronApplyTheme(savedTheme);
    } else {
      // default dark from Go config will be applied via Eval() after load
    }
  });

  // ── Toast helper ──────────────────────────────────────────────────────────
  window.__whatronToast = function(msg, color) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = [
      'position:fixed','top:20px','right:20px',
      'background:' + (color || '#25d366'),
      'color:#fff','padding:12px 20px','border-radius:8px',
      'z-index:2147483647','font-weight:600','font-size:13px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'box-shadow:0 4px 16px rgba(0,0,0,0.3)',
      'animation:__wtToastIn 0.2s ease'
    ].join(';');
    var s = document.createElement('style');
    s.textContent = '@keyframes __wtToastIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}';
    document.head.appendChild(s);
    document.body.appendChild(el);
    setTimeout(function() { el.remove(); s.remove(); }, 2500);
  };

  // ── File Download Toast helper (Custom Notifier) ────────────────────────
  window.__whatronShowFileToast = function(title, filePath, duration) {
    duration = duration || 6000;
    filePath = String(filePath || '');
    title = String(title || 'Download Complete');
    var fileName = filePath.split(/[\\/]/).pop();
    var ext = (fileName.split('.').pop() || '').toLowerCase();

    var FILE_TYPES = {
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

    var ICONS = {
        image:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><path d="M3 16l5-5 4 4 3-3 5 5"/></svg>',
        video:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="16" height="16" rx="2.5"/><path d="M18 10l4-3v10l-4-3V10z"/></svg>',
        audio:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="18" r="3"/><path d="M11 18V8l10 2v8"/><circle cx="18" cy="14" r="3"/></svg>',
        pdf:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><path d="M9 13h2a1.5 1.5 0 0 1 0 3H9v-3"/><line x1="9" y1="19" x2="9" y2="16"/></svg>',
        doc:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
        sheet:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="16" y2="16"/><line x1="12" y1="8" x2="12" y2="20"/></svg>',
        slide:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21l4-4 4 4"/><line x1="12" y1="17" x2="12" y2="21"/><polygon points="10,7 10,13 16,10" fill="currentColor" stroke="none"/></svg>',
        archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10H3v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10z"/><rect x="2" y="4" width="20" height="6" rx="1.5"/><line x1="12" y1="14" x2="12" y2="18"/></svg>',
        code:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>',
        text:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"/><path d="M21 6H3"/><path d="M21 14H3"/><line x1="11" y1="18" x2="3" y2="18"/></svg>',
        app:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="8" y1="3" x2="8" y2="9"/></svg>',
        default: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>',
    };

    var color = '#566b76', icon = ICONS.default;
    for (var type in FILE_TYPES) {
        if (FILE_TYPES[type].exts.indexOf(ext) !== -1) {
            color = FILE_TYPES[type].color;
            icon = ICONS[type];
            break;
        }
    }

    function esc(s) {
        return (s||'').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Check if we need to add the global custom notifier stylesheet
    if (!document.getElementById('__whatron-custom-notifier-css')) {
        var s = document.createElement('style');
        s.id = '__whatron-custom-notifier-css';
        s.textContent = [
            '.__wt-toast-stack { position:fixed; bottom:20px; right:20px; z-index:2147483647; display:flex; flex-direction:column; gap:10px; pointer-events:none; }',
            '.__wt-toast-wrap { pointer-events:auto; width:370px; background:#1e2d35; border:1px solid rgba(255,255,255,0.07); border-radius:12px; box-shadow:0 8px 28px rgba(0,0,0,0.55),0 2px 8px rgba(0,0,0,0.4); overflow:hidden; display:flex; flex-direction:column; transform:translateX(calc(100% + 24px)); transition:transform 0.28s cubic-bezier(0.34,1.56,0.64,1); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif; user-select:none; }',
            '.__wt-toast-wrap.in { transform:translateX(0); }',
            '.__wt-toast-body { flex:1; display:flex; align-items:center; gap:12px; padding:11px 10px 10px 12px; }',
            '.__wt-toast-icon { flex-shrink:0; width:44px; height:44px; border-radius:11px; display:flex; align-items:center; justify-content:center; }',
            '.__wt-toast-icon svg { width:22px; height:22px; }',
            '.__wt-toast-content { flex:1; min-width:0; }',
            '.__wt-toast-label { font-size:10.5px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:#566b76; margin-bottom:3px; }',
            '.__wt-toast-filename { font-size:13px; font-weight:500; color:#e9edef; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:6px; line-height:1.3; }',
            '.__wt-toast-actions { display:flex; align-items:center; gap:2px; }',
            '.__wt-toast-btn { background:none; border:none; cursor:pointer; font-family:inherit; font-size:11.5px; font-weight:600; padding:3px 7px; border-radius:5px; transition:background 0.1s,color 0.1s; letter-spacing:0.1px; }',
            '.__wt-toast-btn-sec { color:#566b76; }',
            '.__wt-toast-btn-sec:hover { color:#8696a0; background:rgba(255,255,255,0.05); }',
            '.__wt-toast-dot { color:rgba(134,150,160,0.25); font-size:14px; padding:0 1px; line-height:1; }',
            '.__wt-toast-close { flex-shrink:0; background:none; border:none; cursor:pointer; color:rgba(134,150,160,0.3); font-size:17px; line-height:1; width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; transition:color 0.1s,background 0.1s; align-self:flex-start; margin-top:1px; }',
            '.__wt-toast-close:hover { color:#8696a0; background:rgba(255,255,255,0.06); }',
            '.__wt-toast-progress { height:2px; background:rgba(255,255,255,0.05); flex-shrink:0; }',
            '.__wt-toast-progress-fill { height:100%; border-radius:0 1px 1px 0; width:100%; opacity:0.65; transition:width linear; }'
        ].join('\n');
        (document.head || document.documentElement).appendChild(s);
    }

    var stack = document.getElementById('__whatron-toast-stack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = '__whatron-toast-stack';
        stack.className = '__wt-toast-stack';
        document.body.appendChild(stack);
    }

    var wrap = document.createElement('div');
    wrap.className = '__wt-toast-wrap';
    var inHover = false;
    wrap.addEventListener('mouseenter', function() { inHover = true; });
    wrap.addEventListener('mouseleave', function() { inHover = false; });
    wrap.innerHTML = '<div class="__wt-toast-body">' +
      '<div class="__wt-toast-icon" style="background:' + color + '26;color:' + color + '">' + icon + '</div>' +
      '<div class="__wt-toast-content">' +
        '<div class="__wt-toast-label">' + esc(title) + '</div>' +
        '<div class="__wt-toast-filename" title="' + esc(fileName) + '">' + esc(fileName) + '</div>' +
        '<div class="__wt-toast-actions">' +
          '<button class="__wt-toast-btn" style="color:' + color + '" id="btn-open">Open</button>' +
          '<span class="__wt-toast-dot">·</span>' +
          '<button class="__wt-toast-btn __wt-toast-btn-sec" id="btn-folder">Show in folder</button>' +
        '</div>' +
      '</div>' +
      '<button class="__wt-toast-close" id="btn-dismiss">&#x2715;</button>' +
    '</div>' +
    '<div class="__wt-toast-progress"><div class="__wt-toast-progress-fill" style="background:' + color + '"></div></div>';

    stack.prepend(wrap);
    var fill = wrap.querySelector('.__wt-toast-progress-fill');
    
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            wrap.classList.add('in');
            fill.style.transitionDuration = duration + 'ms';
            requestAnimationFrame(function() { fill.style.width = '0%'; });
        });
    });

    wrap.querySelector('#btn-open').addEventListener('click', function() { bridgeCall('__goOpenFile', [filePath]); closeIt(); });
    wrap.querySelector('#btn-folder').addEventListener('click', function() { bridgeCall('__goShowInFolder', [filePath]); closeIt(); });
    wrap.querySelector('#btn-dismiss').addEventListener('click', closeIt);

    var closed = false;
    function closeIt() {
        if (closed) return;
        closed = true;
        wrap.classList.remove('in');
        setTimeout(function() { wrap.remove(); }, 300);
    }

    setTimeout(function() {
        var ival = setInterval(function() {
            if (!inHover) {
                clearInterval(ival);
                closeIt();
            }
        }, 500);
    }, duration);
  };

  // ── Unread count poller ───────────────────────────────────────────────────
  setInterval(function() {
    try {
      var isOnline = navigator.onLine;
      var el = document.querySelector('title');
      var match = el ? el.textContent.match(/\((\d+)\)/) : null;
      var count = match ? parseInt(match[1], 10) : 0;
      bridgeCall('__goUpdateUnread', [count, isOnline]);
    } catch(e) {}
  }, 5000);

  // ── Open-chat from notification click ─────────────────────────────────────
  window.__whatronOpenChat = function(sender) {
    if (!sender) return;
    var senderLower = sender.trim().toLowerCase();
    
    // If it's a group notification like "User @ Group", try to focus on the group part
    if (senderLower.includes(' @ ')) {
      senderLower = senderLower.split(' @ ')[1].trim();
      sender = sender.split(' @ ')[1].trim();
    }

    var attempts = 0;
    var maxAttempts = 150; // allow up to fully 45 seconds for WhatsApp Web UI to finish rendering

    function simClick(el) {
      el.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true, view: window, buttons: 1}));
      el.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, cancelable: true, view: window, buttons: 1}));
      el.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window, buttons: 1}));
    }

    function tryOpen() {
      try {
        var sidePane = document.getElementById('pane-side') || document.getElementById('side');
        
        // 1. Try to find the chat visibly loaded in the sidebar list
        if (sidePane) {
          var rows = sidePane.querySelectorAll('div[role="listitem"], div[role="row"]');
          for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var titleEl = row.querySelector('span[title], div[title]');
            if (titleEl) {
              var title = (titleEl.getAttribute('title') || titleEl.textContent || '').trim().toLowerCase();
              if (title === senderLower || title.startsWith(senderLower) || senderLower.startsWith(title)) {
                simClick(row);
                console.log('[Whatron] Found and clicked chat:', title);
                return;
              }
            }
          }
        }

        // 2. If not immediately found in list after reaching exactly attempt 10, invoke the Search box
        // Targeting the left-pane specific to ignore the message chat box
        if (attempts === 10) {
          var searchInput = document.querySelector('#side div[contenteditable="true"]') || 
                            document.querySelector('div[contenteditable="true"][data-tab="3"]');
          if (searchInput) {
            console.log('[Whatron] Chat not immediately in view, invoking search for:', sender);
            searchInput.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            document.execCommand('insertText', false, sender);
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }

        // 3. Keep sniffing for the search result population
        if (attempts > 12) {
           var searchResults = document.querySelectorAll('#side ' + 'div[role="listitem"], #side ' + 'div[role="row"]');
           for (var j = 0; j < searchResults.length; j++) {
             var res = searchResults[j];
             var resTitleEl = res.querySelector('span[title], div[title]');
             if (resTitleEl) {
               var resTitle = (resTitleEl.getAttribute('title') || resTitleEl.textContent || '').trim().toLowerCase();
               if (resTitle === senderLower || resTitle.startsWith(senderLower) || senderLower.startsWith(resTitle)) {
                 simClick(res);
                 console.log('[Whatron] Found and perfectly snapped to search result:', resTitle);
                 return;
               }
             }
           }
        }
      } catch(e) {
        console.error('[Whatron] Error in __whatronOpenChat:', e);
      }
      
      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(tryOpen, 300);
      } else {
        console.warn('[Whatron] Exhausted all attempts targeting chat:', sender);
      }
    }
    tryOpen();
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && !e.shiftKey) {
      // Ctrl+D — toggle dark mode
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        var current = '';
        try { current = localStorage.getItem('whatron-theme') || 'dark'; } catch(ex) {}
        var next = (current === 'dark') ? 'classic' : 'dark';
        window.__whatronApplyTheme(next);
        bridgeCall('__goSetTheme', [next]);
        return;
      }
      // Ctrl+M — mute toggle
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        _muted = !_muted;
        bridgeCall('__goSetMuted', [_muted]);
        window.__whatronToast(_muted ? 'Notifications muted' : 'Notifications enabled');
        return;
      }
      // Ctrl+, — focus search
      if (e.key === ',') {
        e.preventDefault();
        var searchBox = document.querySelector('[data-tab="3"]') || document.querySelector('input[type="text"]');
        if (searchBox) searchBox.click();
        return;
      }
      // Ctrl+N — new chat
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        var btn = document.querySelector('[data-icon="new-chat-outline"]');
        if (btn && btn.parentElement) btn.parentElement.click();
        return;
      }
      // Ctrl++ / Ctrl+= — zoom in
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        bridgeCall('__goZoom', [0.1]);
        return;
      }
      // Ctrl+- — zoom out
      if (e.key === '-') {
        e.preventDefault();
        bridgeCall('__goZoom', [-0.1]);
        return;
      }
      // Ctrl+0 — zoom reset
      if (e.key === '0') {
        e.preventDefault();
        bridgeCall('__goZoomReset', []);
        return;
      }
    }
    // Ctrl+Shift+S — screenshot
    if (e.ctrlKey && e.shiftKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      bridgeCall('__goScreenshot', []);
      return;
    }
  }, true);

  // ── Drag-and-drop file upload ─────────────────────────────────────────────
  document.addEventListener('dragover', function(e) { e.preventDefault(); });
  document.addEventListener('drop', function(e) {
    e.preventDefault();
    var files = e.dataTransfer && e.dataTransfer.files;
    if (!files || files.length === 0) return;
    var dt = new DataTransfer();
    for (var i = 0; i < files.length; i++) dt.items.add(files[i]);
    var input = document.querySelector('input[type="file"]');
    if (input) {
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // ── Rich context menu ─────────────────────────────────────────────────────
  var CTX_ID    = '__wt-ctx-menu';
  var CTX_STYLE = '__wt-ctx-style';

  var ICONS = {
    copy:      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="8" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>',
    cut:       '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><path d="M4 10 L12 2 M12 10 L4 2"/></svg>',
    paste:     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="9" height="10" rx="1.5"/><path d="M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1"/></svg>',
    select:    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke-dasharray="3 2"/></svg>',
    link:      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.5 9.5a4 4 0 0 0 5.66 0l2-2a4 4 0 0 0-5.66-5.66L7.5 2.83"/><path d="M9.5 6.5a4 4 0 0 0-5.66 0l-2 2a4 4 0 0 0 5.66 5.66l1-1"/></svg>',
    external:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9"/><path d="M10 2h4v4M9 7l5-5"/></svg>',
    search:    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6.5" cy="6.5" r="4"/><line x1="9.5" y1="9.5" x2="14" y2="14"/></svg>',
    translate: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h6M5 2v1M3 5a5 5 0 0 0 4.5 2.8"/><path d="M8 3c1 2.5 3.5 5.5 6 6M10 8l4 4"/></svg>',
    quote:     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6v4h3l-2 3h2l2-3V6H3zM9 6v4h3l-2 3h2l2-3V6H9z"/></svg>',
    image:     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="5.5" cy="6.5" r="1"/><path d="M2 11l3-3 2.5 2.5L10 8l4 4"/></svg>',
    download:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8M5 7l3 3 3-3"/><path d="M3 13h10"/></svg>',
    message:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5l-3 2V4a1 1 0 0 1 1-1z"/></svg>',
    clock:     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5l2.5 1.5"/></svg>'
  };

  var CTX_CSS = [
    '#' + CTX_ID + '{position:fixed;z-index:2147483647;min-width:180px;max-width:280px;',
    'background:#233138;border:1px solid rgba(255,255,255,0.06);border-radius:6px;',
    'box-shadow:0 4px 6px -1px rgba(0,0,0,.45),0 10px 24px -4px rgba(0,0,0,.35);',
    'padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,sans-serif;',
    'font-size:13px;color:#e9edef;user-select:none;outline:none;',
    'animation:__wt-ctx-in 0.09s ease-out}',
    '@keyframes __wt-ctx-in{from{opacity:0;transform:scale(0.97)}to{opacity:1;transform:scale(1)}}',
    '#' + CTX_ID + ' .ctx-item{display:flex;align-items:center;gap:10px;padding:6px 14px;cursor:default;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:3px;margin:0 2px;',
    'transition:background 0.08s ease;line-height:1.45}',
    '#' + CTX_ID + ' .ctx-item:hover,#' + CTX_ID + ' .ctx-item:focus{background:rgba(0,168,132,0.18);outline:none}',
    '#' + CTX_ID + ' .ctx-item.ctx-disabled{color:#566b76;cursor:not-allowed;pointer-events:none}',
    '#' + CTX_ID + ' .ctx-icon{flex-shrink:0;width:15px;height:15px;display:flex;align-items:center;',
    'justify-content:center;opacity:0.65;color:#8696a0}',
    '#' + CTX_ID + ' .ctx-item:hover .ctx-icon,#' + CTX_ID + ' .ctx-item:focus .ctx-icon{opacity:0.9}',
    '#' + CTX_ID + ' .ctx-sep{height:1px;background:rgba(255,255,255,0.06);margin:4px 0}',
    '#' + CTX_ID + ' .ctx-label{flex:1;overflow:hidden;text-overflow:ellipsis}',
    '#' + CTX_ID + ' .ctx-header{padding:5px 14px 2px;font-size:10.5px;',
    'letter-spacing:0.5px;text-transform:uppercase;color:#566b76}'
  ].join('');

  var _ctxMenu = null;
  var _ctxCleanup = null;

  function ctxClose() {
    if (_ctxCleanup) { _ctxCleanup(); _ctxCleanup = null; }
    if (_ctxMenu)    { _ctxMenu.remove(); _ctxMenu = null; }
  }

  function ctxEnsureStyles() {
    if (!document.getElementById(CTX_STYLE)) {
      var s = document.createElement('style');
      s.id = CTX_STYLE;
      s.textContent = CTX_CSS;
      (document.head || document.documentElement).appendChild(s);
    }
  }

  function ctxShowItems(x, y, items) {
    if (!items.length) return;
    ctxClose();
    ctxEnsureStyles();

    _ctxMenu = document.createElement('div');
    _ctxMenu.id       = CTX_ID;
    _ctxMenu.tabIndex = -1;
    _ctxMenu.setAttribute('role', 'menu');

    var focusable = [];

    items.forEach(function(item) {
      if (item.type === 'separator') {
        var sep = document.createElement('div');
        sep.className = 'ctx-sep';
        _ctxMenu.appendChild(sep);
        return;
      }
      if (item.type === 'header') {
        var hdr = document.createElement('div');
        hdr.className   = 'ctx-header';
        hdr.textContent = item.label;
        _ctxMenu.appendChild(hdr);
        return;
      }
      var el = document.createElement('div');
      el.className = 'ctx-item';
      el.tabIndex  = 0;
      el.setAttribute('role', 'menuitem');

      var icon = document.createElement('span');
      icon.className = 'ctx-icon';
      if (item.icon && ICONS[item.icon]) icon.innerHTML = ICONS[item.icon];
      el.appendChild(icon);

      var lbl = document.createElement('span');
      lbl.className   = 'ctx-label';
      lbl.textContent = item.label;
      el.appendChild(lbl);

      el.addEventListener('click', function() { item.action(); ctxClose(); });
      el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.action(); ctxClose(); }
      });
      focusable.push(el);
      _ctxMenu.appendChild(el);
    });

    _ctxMenu.style.left = '-9999px';
    _ctxMenu.style.top  = '-9999px';
    (document.body || document.documentElement).appendChild(_ctxMenu);
    _ctxMenu.focus();

    var rect = _ctxMenu.getBoundingClientRect();
    _ctxMenu.style.left = Math.min(x, window.innerWidth  - rect.width  - 6) + 'px';
    _ctxMenu.style.top  = Math.min(y, window.innerHeight - rect.height - 6) + 'px';

    var focusIdx = -1;
    function navHandler(e) {
      if (e.key === 'Escape') { ctxClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); focusIdx = (focusIdx + 1) % focusable.length; if(focusable[focusIdx]) focusable[focusIdx].focus(); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); focusIdx = (focusIdx - 1 + focusable.length) % focusable.length; if(focusable[focusIdx]) focusable[focusIdx].focus(); }
    }
    function outsideClick(e) { if (_ctxMenu && !_ctxMenu.contains(e.target)) ctxClose(); }
    function onScroll() { ctxClose(); }

    document.addEventListener('mousedown', outsideClick, { capture: true });
    document.addEventListener('keydown',   navHandler,   { capture: true });
    window.addEventListener(  'scroll',    onScroll,     { capture: true, passive: true });

    _ctxCleanup = function() {
      document.removeEventListener('mousedown', outsideClick, { capture: true });
      document.removeEventListener('keydown',   navHandler,   { capture: true });
      window.removeEventListener(  'scroll',    onScroll,     { capture: true, passive: true });
    };
  }

  function isEditable(el) {
    if (!el) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
           el.isContentEditable || el.getAttribute('contenteditable') === 'true';
  }

  function copyToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function() {
        bridgeCall('__goClipboardWrite', [text]);
      });
    } else {
      bridgeCall('__goClipboardWrite', [text]);
    }
  }

  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();

    var target  = e.target;
    var selText = (window.getSelection() || '').toString().trim();
    var x = e.clientX, y = e.clientY;

    // Detect context
    var isInput   = isEditable(target);
    var anchor    = target.closest && target.closest('a[href]');
    var isLink    = !!(anchor && anchor.getAttribute('href') && !anchor.getAttribute('href').startsWith('#'));
    var linkUrl   = isLink ? anchor.href : null;
    var isImage   = target.tagName === 'IMG' && !!target.src;
    var imageSrc  = isImage ? target.src : null;
    var bubble    = target.closest && target.closest('[data-id]');
    var isMsg     = !!bubble;
    var msgText   = isMsg && bubble.querySelector('span.selectable-text') ? bubble.querySelector('span.selectable-text').innerText.trim() : null;
    var msgTime   = isMsg && bubble.querySelector('[data-pre-plain-text]') ? bubble.querySelector('[data-pre-plain-text]').getAttribute('data-pre-plain-text').trim() : null;
    var hasSel    = selText.length > 0;

    var sections = [];

    if (hasSel) {
      sections.push([
        { type:'header', label:'Selection' },
        { type:'item', label:'Copy',               icon:'copy',      action: function() { copyToClipboard(selText); } },
        { type:'item', label:'Search with Google', icon:'search',    action: function() { bridgeCall('__goOpenExternal', ['https://www.google.com/search?q=' + encodeURIComponent(selText)]); } },
        { type:'item', label:'Translate',          icon:'translate', action: function() { bridgeCall('__goOpenExternal', ['https://translate.google.com/?text=' + encodeURIComponent(selText)]); } },
        { type:'item', label:'Copy as quote',      icon:'quote',     action: function() { copyToClipboard('> ' + selText); } }
      ]);
    }

    if (isLink) {
      sections.push([
        { type:'header', label:'Link' },
        { type:'item', label:'Open in browser',  icon:'external', action: function() { bridgeCall('__goOpenExternal', [linkUrl]); } },
        { type:'item', label:'Copy link',        icon:'link',     action: function() { copyToClipboard(linkUrl); } }
      ]);
    }

    if (isImage) {
      sections.push([
        { type:'header', label:'Image' },
        { type:'item', label:'Save image as…', icon:'download', action: function() {
            if (imageSrc.startsWith('blob:')) {
                fetch(imageSrc).then(r => r.blob()).then(blob => {
                    var reader = new FileReader();
                    reader.onloadend = function() {
                        var b64 = reader.result.split(',')[1];
                        bridgeCall('__goSaveBase64', [b64, 'image/jpeg', '']);
                    }
                    reader.readAsDataURL(blob);
                });
            } else {
                bridgeCall('__goDownloadURL', [imageSrc, '']);
            }
        } },
        { type:'item', label:'Copy image URL', icon:'copy',     action: function() { copyToClipboard(imageSrc); } }
      ]);
    }

    if (isInput) {
      sections.push([
        { type:'header', label:'Edit' },
        { type:'item', label:'Cut',        icon:'cut',    action: function() { document.execCommand('cut'); } },
        { type:'item', label:'Copy',       icon:'copy',   action: function() { document.execCommand('copy'); } },
        { type:'item', label:'Paste',      icon:'paste',  action: function() { document.execCommand('paste'); } },
        { type:'item', label:'Select all', icon:'select', action: function() {
          if (target.select) { target.select(); }
          else { var r = document.createRange(); r.selectNodeContents(target); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
        }}
      ]);
    }

    if (isMsg && (msgText || msgTime)) {
      var msgSec = [{ type:'header', label:'Message' }];
      if (msgText) msgSec.push({ type:'item', label:'Copy message text', icon:'message', action: function() { copyToClipboard(msgText); } });
      if (msgTime) msgSec.push({ type:'item', label:'Copy timestamp',    icon:'clock',   action: function() { copyToClipboard(msgTime); } });
      sections.push(msgSec);
    }

    if (!sections.length) return; // no context — don't show empty menu

    var items = [];
    sections.forEach(function(sec, i) {
      items = items.concat(sec);
      if (i < sections.length - 1) items.push({ type:'separator' });
    });

    ctxShowItems(x, y, items);
  }, { capture: true });

  // ── Global Download Interceptor ───────────────────────────────────────────
  var originalAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function() {
    if (this.download && this.href) {
      if (this.href.startsWith('blob:')) {
        var name = this.download;
        fetch(this.href).then(r => r.blob()).then(blob => {
            var reader = new FileReader();
            reader.onloadend = function() {
                var b64 = reader.result.split(',')[1];
                bridgeCall('__goSaveBase64', [b64, blob.type, name]);
            };
            reader.readAsDataURL(blob);
        });
      } else {
        bridgeCall('__goDownloadURL', [this.href, this.download]);
      }
      return; // prevent default download action
    }
    return originalAnchorClick.apply(this, arguments);
  };

})();
`
