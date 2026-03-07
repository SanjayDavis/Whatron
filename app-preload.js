'use strict';

const { ipcRenderer, contextBridge } = require('electron');
const logToMain = (...args) => ipcRenderer.send('renderer-log', ...args);
let notificationsMuted = false;

const contextDetector = (() => {
    function isEditable(el) {
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' ||
               el.isContentEditable ||
               el.getAttribute('contenteditable') === 'true';
    }

    function detect(event) {
        const target  = event.target;
        const selText = (window.getSelection() || '').toString().trim();

        const ctx = {
            target,
            x: event.clientX,
            y: event.clientY,
            isInput:          isEditable(target),
            isLink:           false,
            isImage:          false,
            isMessage:        false,
            hasSelection:     selText.length > 0,
            selectedText:     selText,
            linkUrl:          null,
            imageSrc:         null,
            messageText:      null,
            messageTimestamp: null,
        };

        const anchor = target.closest && target.closest('a[href]');
        if (anchor) {
            const href = anchor.getAttribute('href') || '';
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                ctx.isLink  = true;
                ctx.linkUrl = anchor.href;
            }
        }

        if (target.tagName === 'IMG' && target.src) {
            ctx.isImage  = true;
            ctx.imageSrc = target.src;
        }

        const bubble = target.closest && target.closest('[data-id]');
        if (bubble) {
            ctx.isMessage = true;
            const textEl  = bubble.querySelector('span.selectable-text');
            if (textEl) ctx.messageText = textEl.innerText.trim();
            const timeEl  = bubble.querySelector('[data-pre-plain-text]');
            if (timeEl) ctx.messageTimestamp = timeEl.getAttribute('data-pre-plain-text').trim();
        }

        return ctx;
    }

    return { detect };
})();

const contextActions = (() => {
    let _ipc = null;
    const send = (ch, data) => _ipc && _ipc.send(ch, data);

    return {
        init(ipc) { _ipc = ipc; },

        copyText(text)          { if (text) send('ctx-clipboard-write', { type: 'text', value: text }); },
        copyLink(url)           { if (url)  send('ctx-clipboard-write', { type: 'text', value: url }); },
        copyImageUrl(url)       { if (url)  send('ctx-clipboard-write', { type: 'text', value: url }); },
        copyAsQuote(text)       { if (text) send('ctx-clipboard-write', { type: 'text', value: `> ${text}` }); },
        copyMessageText(text)   { if (text) send('ctx-clipboard-write', { type: 'text', value: text }); },
        copyMessageTimestamp(t) { if (t)    send('ctx-clipboard-write', { type: 'text', value: t }); },
        copySelection(text)     { if (text) send('ctx-clipboard-write', { type: 'text', value: text }); },

        openExternal(url)  { if (url) send('ctx-open-external', url); },
        saveImageAs(src)   { if (src) send('ctx-save-as',  src); },
        downloadImage(src) { if (src) send('ctx-download', src); },

        searchSelection(text) {
            if (text) send('ctx-open-external', `https://www.google.com/search?q=${encodeURIComponent(text)}`);
        },
        translateSelection(text) {
            if (text) send('ctx-open-external', `https://translate.google.com/?text=${encodeURIComponent(text)}`);
        },

        editCut()             { document.execCommand('cut'); },
        editCopy()            { document.execCommand('copy'); },
        editPaste()           { send('ctx-paste'); },
        editSelectAll(target) {
            if (!target) return;
            if (target.select) {
                target.select();
            } else {
                const range = document.createRange();
                range.selectNodeContents(target);
                const sel = window.getSelection();
                if (sel) { sel.removeAllRanges(); sel.addRange(range); }
            }
        },
    };
})();

const contextMenu = (() => {
    const MENU_ID  = '__wt-ctx-menu';
    const STYLE_ID = '__wt-ctx-style';

    const ICONS = {
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
        clock:     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5l2.5 1.5"/></svg>',
    };

    const CSS = `
        #${MENU_ID} {
            position: fixed; z-index: 2147483647;
            min-width: 180px; max-width: 280px;
            background: #233138;
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 6px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.45), 0 10px 24px -4px rgba(0,0,0,0.35);
            padding: 4px 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            font-size: 13px; color: #e9edef;
            user-select: none; outline: none;
            animation: __wt-ctx-in 0.09s ease-out;
        }
        @keyframes __wt-ctx-in {
            from { opacity:0; transform:scale(0.97); }
            to   { opacity:1; transform:scale(1); }
        }
        #${MENU_ID} .ctx-item {
            display: flex; align-items: center; gap: 10px;
            padding: 6px 14px; cursor: default;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            border-radius: 3px; margin: 0 2px;
            transition: background 0.08s ease; line-height: 1.45;
        }
        #${MENU_ID} .ctx-item:hover,
        #${MENU_ID} .ctx-item:focus { background: rgba(0,168,132,0.18); outline: none; }
        #${MENU_ID} .ctx-item.ctx-disabled { color: #566b76; cursor: not-allowed; pointer-events: none; }
        #${MENU_ID} .ctx-icon {
            flex-shrink: 0; width: 15px; height: 15px;
            display: flex; align-items: center; justify-content: center;
            opacity: 0.65; color: #8696a0;
        }
        #${MENU_ID} .ctx-item:hover .ctx-icon,
        #${MENU_ID} .ctx-item:focus .ctx-icon { opacity: 0.9; }
        #${MENU_ID} .ctx-sep { height: 1px; background: rgba(255,255,255,0.06); margin: 4px 0; }
        #${MENU_ID} .ctx-label { flex:1; overflow:hidden; text-overflow:ellipsis; }
        #${MENU_ID} .ctx-header {
            padding: 5px 14px 2px; font-size: 10.5px;
            letter-spacing: 0.5px; text-transform: uppercase; color: #566b76;
        }
    `;

    let menuEl  = null;
    let cleanup = null;

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = CSS;
        (document.head || document.documentElement).appendChild(s);
    }

    function close() {
        if (cleanup) { cleanup(); cleanup = null; }
        if (menuEl)  { menuEl.remove(); menuEl = null; }
    }

    function show(ctx, items) {
        if (!items.length) return;
        close();
        ensureStyles();

        menuEl = document.createElement('div');
        menuEl.id       = MENU_ID;
        menuEl.tabIndex = -1;
        menuEl.setAttribute('role', 'menu');

        const focusable = [];

        for (const item of items) {
            if (item.type === 'separator') {
                const sep = document.createElement('div');
                sep.className = 'ctx-sep';
                menuEl.appendChild(sep);
                continue;
            }
            if (item.type === 'header') {
                const hdr = document.createElement('div');
                hdr.className   = 'ctx-header';
                hdr.textContent = item.label;
                menuEl.appendChild(hdr);
                continue;
            }

            const el = document.createElement('div');
            el.className = 'ctx-item';
            el.tabIndex  = 0;
            el.setAttribute('role', 'menuitem');

            const icon = document.createElement('span');
            icon.className = 'ctx-icon';
            if (item.icon && ICONS[item.icon]) icon.innerHTML = ICONS[item.icon];
            el.appendChild(icon);

            const label = document.createElement('span');
            label.className   = 'ctx-label';
            label.textContent = item.label;
            el.appendChild(label);

            el.addEventListener('click', () => { item.action(ctx); close(); });
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.action(ctx); close(); }
            });
            focusable.push(el);
            menuEl.appendChild(el);
        }

        menuEl.style.left = '-9999px';
        menuEl.style.top  = '-9999px';
        (document.body || document.documentElement).appendChild(menuEl);
        menuEl.focus();

        const { width: mw, height: mh } = menuEl.getBoundingClientRect();
        menuEl.style.left = `${Math.min(ctx.x, window.innerWidth  - mw - 6)}px`;
        menuEl.style.top  = `${Math.min(ctx.y, window.innerHeight - mh - 6)}px`;

        let focusIdx = -1;
        const navHandler = (e) => {
            if (e.key === 'Escape') { close(); return; }
            if (e.key === 'ArrowDown') { e.preventDefault(); focusIdx = (focusIdx + 1) % focusable.length; focusable[focusIdx]?.focus(); }
            if (e.key === 'ArrowUp')   { e.preventDefault(); focusIdx = (focusIdx - 1 + focusable.length) % focusable.length; focusable[focusIdx]?.focus(); }
        };
        const outsideClick = (e) => { if (!menuEl?.contains(e.target)) close(); };
        const onScroll     = () => close();

        document.addEventListener('mousedown', outsideClick, { capture: true });
        document.addEventListener('keydown',   navHandler,   { capture: true });
        window.addEventListener(  'scroll',    onScroll,     { capture: true, passive: true });

        cleanup = () => {
            document.removeEventListener('mousedown', outsideClick, { capture: true });
            document.removeEventListener('keydown',   navHandler,   { capture: true });
            window.removeEventListener(  'scroll',    onScroll,     { capture: true, passive: true });
        };
    }

    function buildItems(ctx, actions) {
        const sections = [];

        if (ctx.hasSelection) {
            sections.push([
                { type: 'header', label: 'Selection' },
                { type: 'item', label: 'Copy',               icon: 'copy',      action: c => actions.copySelection(c.selectedText) },
                { type: 'item', label: 'Search with Google', icon: 'search',    action: c => actions.searchSelection(c.selectedText) },
                { type: 'item', label: 'Translate',          icon: 'translate', action: c => actions.translateSelection(c.selectedText) },
                { type: 'item', label: 'Copy as quote',      icon: 'quote',     action: c => actions.copyAsQuote(c.selectedText) },
            ]);
        }

        if (ctx.isLink) {
            sections.push([
                { type: 'header', label: 'Link' },
                { type: 'item', label: 'Open link in browser', icon: 'external', action: c => actions.openExternal(c.linkUrl) },
                { type: 'item', label: 'Copy link address',    icon: 'link',     action: c => actions.copyLink(c.linkUrl) },
            ]);
        }

        if (ctx.isImage) {
            sections.push([
                { type: 'header', label: 'Image' },
                { type: 'item', label: 'Save image as\u2026', icon: 'download', action: c => actions.saveImageAs(c.imageSrc) },
                { type: 'item', label: 'Copy image URL',      icon: 'copy',     action: c => actions.copyImageUrl(c.imageSrc) },
            ]);
        }

        if (ctx.isInput) {
            sections.push([
                { type: 'header', label: 'Edit' },
                { type: 'item', label: 'Cut',        icon: 'cut',    action: () => actions.editCut() },
                { type: 'item', label: 'Copy',       icon: 'copy',   action: () => actions.editCopy() },
                { type: 'item', label: 'Paste',      icon: 'paste',  action: () => actions.editPaste() },
                { type: 'item', label: 'Select all', icon: 'select', action: c  => actions.editSelectAll(c.target) },
            ]);
        }

        if (ctx.isMessage && (ctx.messageText || ctx.messageTimestamp)) {
            const sec = [{ type: 'header', label: 'Message' }];
            if (ctx.messageText)      sec.push({ type: 'item', label: 'Copy message text', icon: 'message', action: c => actions.copyMessageText(c.messageText) });
            if (ctx.messageTimestamp) sec.push({ type: 'item', label: 'Copy timestamp',    icon: 'clock',   action: c => actions.copyMessageTimestamp(c.messageTimestamp) });
            sections.push(sec);
        }

        const result = [];
        for (let i = 0; i < sections.length; i++) {
            result.push(...sections[i]);
            if (i < sections.length - 1) result.push({ type: 'separator' });
        }
        return result;
    }

    return { show, close, buildItems };
})();

contextActions.init(ipcRenderer);

window.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const ctx   = contextDetector.detect(event);
    const items = contextMenu.buildItems(ctx, contextActions);
    contextMenu.show(ctx, items);
}, { capture: true });

contextBridge.exposeInMainWorld('__whatronBridge', {
    notificationClicked: (payload) => {
        ipcRenderer.send('wa-notification-clicked', payload);
    },
    isMuted: () => notificationsMuted
});

ipcRenderer.on('toggle-mute', (_event, value) => {
    notificationsMuted = value;
});

Object.defineProperty(navigator, 'userAgent', {
    get: () => 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.78 Safari/537.36'
});
Object.defineProperty(navigator, 'vendor',   { get: () => 'Google Inc.' });
Object.defineProperty(navigator, 'platform', { get: () => 'Linux x86_64' });

(function setupUpdateBanner() {
    const BANNER_ID = '__whatron-update-banner';
    const STYLE_ID  = '__whatron-banner-style';
    const HEIGHT    = 38; // px

    let bannerEl    = null;
    let bannerState = null;
    let autoDismiss = null;

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = `
            #${BANNER_ID} {
                position: fixed;
                top: 0; left: 0; right: 0;
                z-index: 99999;
                height: ${HEIGHT}px;
                display: flex;
                align-items: center;
                padding: 0 12px 0 18px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
                font-size: 12.5px;
                letter-spacing: 0.1px;
                user-select: none;
                overflow: hidden;
                transform: translateY(-100%);
                transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                will-change: transform;
            }
            #${BANNER_ID}.wb-in { transform: translateY(0); }

            /* per-state colours */
            #${BANNER_ID}.wb-checking    { background: #1f2c34; color: #8696a0; }
            #${BANNER_ID}.wb-downloading { background: #005c4b; color: #cfe9e5; }
            #${BANNER_ID}.wb-ready       { background: #00a884; color: #fff;    }
            #${BANNER_ID}.wb-uptodate    { background: #1f2c34; color: #8696a0; }
            #${BANNER_ID}.wb-error       { background: #1f2c34; color: #8696a0; }

            #${BANNER_ID} .wb-label {
                flex: 1;
                min-width: 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                font-weight: 400;
                line-height: ${HEIGHT}px;
            }
            #${BANNER_ID} .wb-label b { font-weight: 600; }

            #${BANNER_ID} .wb-actions {
                display: flex;
                align-items: center;
                gap: 2px;
                flex-shrink: 0;
                margin-left: 10px;
            }

            #${BANNER_ID} .wb-btn {
                background: none;
                border: none;
                cursor: pointer;
                font-family: inherit;
                font-size: 11.5px;
                font-weight: 700;
                letter-spacing: 0.5px;
                text-transform: uppercase;
                padding: 5px 10px;
                border-radius: 5px;
                transition: background 0.12s ease;
                white-space: nowrap;
            }
            /* restart button — only on 'ready' */
            #${BANNER_ID}.wb-ready .wb-btn.wb-action {
                color: #fff;
                border: 1px solid rgba(255,255,255,0.35);
            }
            #${BANNER_ID}.wb-ready .wb-btn.wb-action:hover {
                background: rgba(255,255,255,0.18);
            }
            /* dismiss × */
            #${BANNER_ID}.wb-ready    .wb-btn.wb-x { color: rgba(255,255,255,0.55); }
            #${BANNER_ID}.wb-ready    .wb-btn.wb-x:hover { color: #fff; background: rgba(255,255,255,0.12); }
            #${BANNER_ID}.wb-downloading .wb-btn.wb-x { color: rgba(207,233,229,0.45); }
            #${BANNER_ID}.wb-downloading .wb-btn.wb-x:hover { color: #cfe9e5; background: rgba(255,255,255,0.08); }
            #${BANNER_ID}.wb-checking  .wb-btn.wb-x,
            #${BANNER_ID}.wb-uptodate  .wb-btn.wb-x,
            #${BANNER_ID}.wb-error     .wb-btn.wb-x { color: rgba(134,150,160,0.5); }
            #${BANNER_ID}.wb-checking  .wb-btn.wb-x:hover,
            #${BANNER_ID}.wb-uptodate  .wb-btn.wb-x:hover,
            #${BANNER_ID}.wb-error     .wb-btn.wb-x:hover { color: #8696a0; background: rgba(255,255,255,0.06); }

            /* thin download progress line */
            #${BANNER_ID} .wb-prog-track {
                position: absolute;
                bottom: 0; left: 0; right: 0;
                height: 2px;
                background: rgba(255,255,255,0.1);
            }
            #${BANNER_ID} .wb-prog-fill {
                height: 100%;
                background: #25d366;
                border-radius: 0 1px 1px 0;
                transition: width 0.4s ease;
                min-width: 3px;
            }
        `;
        (document.head || document.documentElement).appendChild(s);
    }

    function labelHtml(state, version, progress) {
        switch (state) {
            case 'checking':
                return 'Checking for updates…';
            case 'downloading': {
                const v   = version ? ` <b>v${version}</b>` : '';
                const pct = (progress != null && progress > 0) ? ` &mdash; ${progress}%` : '&hellip;';
                return `Downloading Whatron${v}${pct}`;
            }
            case 'ready':
                return version
                    ? `Whatron <b>v${version}</b> is ready &mdash; restart to update`
                    : 'Update ready &mdash; restart to apply';
            case 'uptodate':
                return version
                    ? `You&rsquo;re up to date &mdash; <b>v${version}</b>`
                    : 'You&rsquo;re up to date';
            case 'error':
                return 'Could not check for updates';
            default:
                return '';
        }
    }

    function showBanner({ state, version, progress }) {
        ensureStyles();
        clearTimeout(autoDismiss);
        bannerState = state;

        const isNew = !bannerEl;
        if (isNew) {
            bannerEl = document.createElement('div');
            bannerEl.id = BANNER_ID;
            (document.body || document.documentElement).appendChild(bannerEl);
            const appRoot = document.getElementById('app') || document.body;
            appRoot.style.setProperty('padding-top', `${HEIGHT}px`, 'important');
        }

        bannerEl.className = `wb-${state}`;

        const showAction   = state === 'ready';
        const showProgress = state === 'downloading';
        const pct          = progress || 0;

        bannerEl.innerHTML = `
            <span class="wb-label">${labelHtml(state, version, progress)}</span>
            <span class="wb-actions">
                ${showAction ? '<button class="wb-btn wb-action" id="__wb-restart">Restart now</button>' : ''}
                <button class="wb-btn wb-x" id="__wb-dismiss" title="Dismiss">&times;</button>
            </span>
            ${showProgress ? `<span class="wb-prog-track"><span class="wb-prog-fill" style="width:${pct}%"></span></span>` : ''}
        `;

        const restartBtn = document.getElementById('__wb-restart');
        if (restartBtn) restartBtn.addEventListener('click', () => ipcRenderer.send('restart-and-install'));
        document.getElementById('__wb-dismiss').addEventListener('click', hideBanner);

        if (isNew) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (bannerEl) bannerEl.classList.add('wb-in');
            }));
        }

        if (state === 'checking' || state === 'uptodate' || state === 'error') {
            autoDismiss = setTimeout(hideBanner, state === 'uptodate' ? 4000 : 5000);
        }
    }

    function hideBanner() {
        clearTimeout(autoDismiss);
        autoDismiss = null;
        if (!bannerEl) return;

        if ((bannerState === 'downloading' || bannerState === 'ready') && arguments.length === 0) return;

        bannerEl.classList.remove('wb-in');
        const el = bannerEl;
        bannerEl    = null;
        bannerState = null;

        setTimeout(() => {
            el.remove();
            const appRoot = document.getElementById('app') || document.body;
            appRoot.style.removeProperty('padding-top');
        }, 220);
    }

    function onShow(_ev, data) {
        if (!data) return;
        const apply = () => showBanner(data);
        document.body ? apply() : window.addEventListener('DOMContentLoaded', apply, { once: true });
    }

    function onHide() { hideBanner(); }

    ipcRenderer.on('show-update-banner', onShow);
    ipcRenderer.on('hide-update-banner', onHide);
}());

window.addEventListener('DOMContentLoaded', () => {
    const customThemes = {
        dark: `
        html {
            filter: invert(1) hue-rotate(180deg);
            background: #121212 !important;
        }
        img, video {
            filter: invert(1) hue-rotate(180deg);
        }
        * {
            scrollbar-color: #444 #222;
        }
        `,
        classic: '',
        blue: `
        [data-asset-chat-background-light] {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        }
        `,
        green: `
        [data-asset-chat-background-light] {
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%) !important;
        }
        `
    };

    let currentTheme = localStorage.getItem('whatsapp-theme') || 'dark';
    const style = document.createElement('style');
    style.id = 'custom-theme';

    const applyTheme = (themeName) => {
        currentTheme = themeName;
        localStorage.setItem('whatsapp-theme', themeName);
        if (themeName === 'classic') {
            const existing = document.getElementById('custom-theme');
            if (existing) existing.remove();
        } else {
            style.textContent = customThemes[themeName] || '';
            if (!document.getElementById('custom-theme')) {
                document.head.appendChild(style);
            }
        }
    };

    const button = document.createElement('button');
    button.innerText = '🌓';
    button.title     = 'Toggle Theme (Ctrl+D)';
    button.style.cssText = `
        position: fixed;
        top: 70px;
        right: 15px;
        z-index: 9999;
        background: #333;
        color: white;
        border: none;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        font-size: 20px;
        cursor: pointer;
        opacity: 0.7;
    `;
    button.onmouseenter = () => button.style.opacity = '1';
    button.onmouseleave = () => button.style.opacity = '0.7';

    const toggleDarkMode = () => applyTheme(currentTheme === 'dark' ? 'classic' : 'dark');
    button.onclick = toggleDarkMode;
    applyTheme(currentTheme);
    document.body.appendChild(button);

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'd') {
            e.preventDefault();
            toggleDarkMode();
        }

        if (e.ctrlKey && e.key === 'm') {
            e.preventDefault();
            notificationsMuted = !notificationsMuted;
            ipcRenderer.send('mute-state-changed', notificationsMuted);

            const toast = document.createElement('div');
            toast.textContent = notificationsMuted ? 'Notifications muted' : 'Notifications enabled';
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #25d366;
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                z-index: 10000;
                font-weight: bold;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            `;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        }

        if (e.ctrlKey && e.key === ',') {
            e.preventDefault();
            const searchBox = document.querySelector('[data-tab="3"]') || document.querySelector('input[type="text"]');
            if (searchBox) searchBox.click();
        }

        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            const newChatBtn = document.querySelector('[data-icon="new-chat-outline"]')?.parentElement;
            if (newChatBtn) newChatBtn.click();
        }
    });

    document.addEventListener('dragover', event => event.preventDefault());
    document.addEventListener('drop', (event) => {
        event.preventDefault();
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            const dataTransfer = new DataTransfer();
            for (const file of files) dataTransfer.items.add(file);
            const input = document.querySelector('input[type="file"]');
            if (input) {
                input.files = dataTransfer.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    });

    ipcRenderer.on('open-chat', (_event, sender) => {
        logToMain('Received open-chat request for:', sender);
        if (!sender) return;

        const senderTrimmed = sender.trim();
        const senderLower   = senderTrimmed.toLowerCase();
        let attempts = 0;
        const maxAttempts = 20;

        const tryOpen = () => {
            try {
                const container =
                    document.querySelector('div[aria-label="Chat list"]') ||
                    document.querySelector('#pane-side') ||
                    document;

                const chats = container.querySelectorAll('div[role="listitem"]');
                logToMain(`Attempt ${attempts + 1}/${maxAttempts}: found ${chats.length} chat items`);

                for (const chat of chats) {
                    const byTitle = chat.querySelector('span[dir="auto"][title]');
                    if (byTitle) {
                        const name = (byTitle.getAttribute('title') || '').trim();
                        if (name === senderTrimmed) {
                            logToMain('Found chat by title attr, clicking:', name);
                            chat.click();
                            return;
                        }
                    }
                    const byText = chat.querySelector('span[dir="auto"]');
                    if (byText) {
                        const name = (byText.textContent || '').trim();
                        if (name === senderTrimmed) {
                            logToMain('Found chat by textContent, clicking:', name);
                            chat.click();
                            return;
                        }
                    }
                    const allSpans = chat.querySelectorAll('span[dir="auto"]');
                    for (const span of allSpans) {
                        const name = (span.getAttribute('title') || span.textContent || '').trim().toLowerCase();
                        if (name && (senderLower.startsWith(name) || name.startsWith(senderLower))) {
                            logToMain('Found chat by fuzzy match, clicking:', name);
                            chat.click();
                            return;
                        }
                    }
                }
            } catch (err) {
                logToMain('Error in open-chat search:', err.message);
            }

            attempts++;
            if (attempts < maxAttempts) {
                setTimeout(tryOpen, 300);
            } else {
                logToMain('Failed to find chat after', maxAttempts, 'attempts for:', sender);
            }
        };

        tryOpen();
    });

    ipcRenderer.on('send-message', (_event, data) => {
        logToMain('Received send-message request for:', data.sender, 'message:', data.message);
        let attempts = 0;

        const trySend = () => {
            try {
                const chats = document.querySelectorAll('div[role="listitem"]');
                let chatFound = false;

                for (const chat of chats) {
                    const nameElement = chat.querySelector('span[dir="auto"][title]');
                    if (nameElement) {
                        const name = nameElement.getAttribute('title') || nameElement.textContent;
                        if (name === data.sender) {
                            chat.click();
                            chatFound = true;
                            logToMain('Chat clicked, attempting to send message...');

                            setTimeout(() => {
                                const messageBox = document.querySelector('div[contenteditable="true"][data-tab="10"]');
                                if (messageBox) {
                                    messageBox.focus();
                                    messageBox.textContent = data.message;
                                    messageBox.dispatchEvent(new Event('input', { bubbles: true }));
                                    setTimeout(() => {
                                        const sendButton =
                                            document.querySelector('button[data-tab="11"]') ||
                                            document.querySelector('span[data-icon="send"]')?.closest('button');
                                        if (sendButton) {
                                            sendButton.click();
                                            logToMain('Message sent successfully');
                                        } else {
                                            logToMain('Send button not found');
                                        }
                                    }, 300);
                                } else {
                                    logToMain('Message box not found');
                                }
                            }, 800);
                            return;
                        }
                    }
                }

                if (!chatFound) {
                    attempts++;
                    if (attempts < 10) {
                        setTimeout(trySend, 300);
                    } else {
                        logToMain('Failed to find chat for sending message');
                    }
                }
            } catch (err) {
                logToMain('Error sending message:', err.message);
            }
        };

        trySend();
    });
});