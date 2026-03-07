'use strict';

/**
 * contextMenu.js
 * Renders a positioned context menu from a data-driven item list.
 * Handles keyboard navigation, viewport clamping, and cleanup.
 */

const MENU_ID   = '__wt-ctx-menu';
const STYLE_ID  = '__wt-ctx-style';

// ── Icons (inline SVG, 15×15, stroke-based) ──────────────────────────────────
const ICONS = {
    copy:        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="8" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>',
    cut:         '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><path d="M4 10 L12 2 M12 10 L4 2"/></svg>',
    paste:       '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="9" height="10" rx="1.5"/><path d="M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1"/></svg>',
    select:      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke-dasharray="3 2"/></svg>',
    link:        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.5 9.5a4 4 0 0 0 5.66 0l2-2a4 4 0 0 0-5.66-5.66L7.5 2.83"/><path d="M9.5 6.5a4 4 0 0 0-5.66 0l-2 2a4 4 0 0 0 5.66 5.66l1-1"/></svg>',
    external:    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9"/><path d="M10 2h4v4M9 7l5-5"/></svg>',
    search:      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6.5" cy="6.5" r="4"/><line x1="9.5" y1="9.5" x2="14" y2="14"/></svg>',
    translate:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h6M5 2v1M3 5a5 5 0 0 0 4.5 2.8"/><path d="M8 3c1 2.5 3.5 5.5 6 6M10 8l4 4"/></svg>',
    quote:       '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6v4h3l-2 3h2l2-3V6H3zM9 6v4h3l-2 3h2l2-3V6H9z"/></svg>',
    image:       '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="5.5" cy="6.5" r="1"/><path d="M2 11l3-3 2.5 2.5L10 8l4 4"/></svg>',
    download:    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8M5 7l3 3 3-3"/><path d="M3 13h10"/></svg>',
    reload:      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8a6 6 0 1 0 1.5-4L2 2v4h4"/></svg>',
    inspect:     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="4,6 2,8 4,10"/><polyline points="12,6 14,8 12,10"/><line x1="8" y1="4" x2="8" y2="12" transform="rotate(20,8,8)"/></svg>',
    message:     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5l-3 2V4a1 1 0 0 1 1-1z"/></svg>',
    clock:       '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5l2.5 1.5"/></svg>',
};

// ── Item schema ───────────────────────────────────────────────────────────────
// {
//   type:      'item' | 'separator' | 'header'
//   label:     string
//   icon:      keyof ICONS (optional)
//   condition: (ctx) => boolean
//   disabled:  (ctx) => boolean   (optional, defaults to false)
//   action:    (ctx) => void
// }

function buildItems(ctx, actions) {
    return [
        // ── General ──────────────────────────────────────────────────────
        { type: 'item',  label: 'Reload page',          icon: 'reload',    condition: () => true,                action: () => actions.reloadPage() },
        { type: 'item',  label: 'Open in browser',      icon: 'external',  condition: () => true,                action: () => actions.openPageInBrowser() },
        { type: 'item',  label: 'Copy page URL',        icon: 'copy',      condition: () => true,                action: () => actions.copyPageUrl() },
        { type: 'item',  label: 'Inspect element',      icon: 'inspect',   condition: () => true,                action: () => actions.inspectElement(ctx.x, ctx.y) },
        { type: 'separator', condition: () => true },

        // ── Text Selection ───────────────────────────────────────────────
        { type: 'header', label: 'Selection',           condition: c => c.hasSelection },
        { type: 'item',  label: 'Copy',                 icon: 'copy',      condition: c => c.hasSelection,       action: c => actions.copySelection(c.selectedText) },
        { type: 'item',  label: 'Search with Google',   icon: 'search',    condition: c => c.hasSelection,       action: c => actions.searchSelection(c.selectedText) },
        { type: 'item',  label: 'Translate',            icon: 'translate', condition: c => c.hasSelection,       action: c => actions.translateSelection(c.selectedText) },
        { type: 'item',  label: 'Copy as quote',        icon: 'quote',     condition: c => c.hasSelection,       action: c => actions.copyAsQuote(c.selectedText) },
        { type: 'separator', condition: c => c.hasSelection },

        // ── Hyperlink ────────────────────────────────────────────────────
        { type: 'header', label: 'Link',                condition: c => c.isLink },
        { type: 'item',  label: 'Open link in browser', icon: 'external',  condition: c => c.isLink,             action: c => actions.openExternal(c.linkUrl) },
        { type: 'item',  label: 'Copy link address',    icon: 'link',      condition: c => c.isLink,             action: c => actions.copyLink(c.linkUrl) },
        { type: 'item',  label: 'Copy link text',       icon: 'copy',      condition: c => c.isLink && !!c.linkText, action: c => actions.copyText(c.linkText) },
        { type: 'separator', condition: c => c.isLink },

        // ── Image ────────────────────────────────────────────────────────
        { type: 'header', label: 'Image',               condition: c => c.isImage },
        { type: 'item',  label: 'Open image in browser',icon: 'external',  condition: c => c.isImage,            action: c => actions.openImageInBrowser(c.imageSrc) },
        { type: 'item',  label: 'Copy image URL',       icon: 'copy',      condition: c => c.isImage,            action: c => actions.copyImageUrl(c.imageSrc) },
        { type: 'item',  label: 'Download image',       icon: 'download',  condition: c => c.isImage,            action: c => actions.downloadImage(c.imageSrc) },
        { type: 'item',  label: 'Save image as…',       icon: 'download',  condition: c => c.isImage,            action: c => actions.saveImageAs(c.imageSrc) },
        { type: 'separator', condition: c => c.isImage },

        // ── Editable ─────────────────────────────────────────────────────
        { type: 'header', label: 'Edit',                condition: c => c.isInput },
        { type: 'item',  label: 'Cut',                  icon: 'cut',       condition: c => c.isInput,            action: () => actions.editCut() },
        { type: 'item',  label: 'Copy',                 icon: 'copy',      condition: c => c.isInput,            action: () => actions.editCopy() },
        { type: 'item',  label: 'Paste',                icon: 'paste',     condition: c => c.isInput,            action: () => actions.editPaste() },
        { type: 'item',  label: 'Select all',           icon: 'select',    condition: c => c.isInput,            action: c => actions.editSelectAll(c.target) },
        { type: 'separator', condition: c => c.isInput },

        // ── Message bubble ───────────────────────────────────────────────
        { type: 'header', label: 'Message',             condition: c => c.isMessage },
        { type: 'item',  label: 'Copy message text',    icon: 'message',   condition: c => c.isMessage && !!c.messageText,      action: c => actions.copyMessageText(c.messageText) },
        { type: 'item',  label: 'Copy timestamp',       icon: 'clock',     condition: c => c.isMessage && !!c.messageTimestamp, action: c => actions.copyMessageTimestamp(c.messageTimestamp) },
    ].filter(item => item.condition(ctx));
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

let menuEl   = null;
let cleanup  = null;

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id   = STYLE_ID;
    link.rel  = 'stylesheet';
    // CSS is loaded from the same directory as this script.
    // In an Electron preload context we inline the CSS instead.
    // (see: contextMenu.css content inlined below via the loader)
    link.setAttribute('data-wt', '1');
    // We inline the CSS so no extra file-load is needed in sandbox mode.
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = INLINE_CSS;
    (document.head || document.documentElement).appendChild(style);
}

// ── Position clamp ────────────────────────────────────────────────────────────

function clamp(x, y, menuWidth, menuHeight) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
        left: Math.min(x, vw - menuWidth - 6),
        top:  Math.min(y, vh - menuHeight - 6),
    };
}

// ── Render ────────────────────────────────────────────────────────────────────

function show(ctx, items) {
    close();
    injectStyles();

    menuEl = document.createElement('div');
    menuEl.id        = MENU_ID;
    menuEl.tabIndex  = -1;
    menuEl.setAttribute('role', 'menu');

    const focusable = []; // item elements for keyboard nav

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
        el.className  = 'ctx-item';
        el.tabIndex   = 0;
        el.setAttribute('role', 'menuitem');

        const icon = document.createElement('span');
        icon.className = 'ctx-icon';
        if (item.icon && ICONS[item.icon]) icon.innerHTML = ICONS[item.icon];
        el.appendChild(icon);

        const label = document.createElement('span');
        label.className   = 'ctx-label';
        label.textContent = item.label;
        el.appendChild(label);

        const disabled = item.disabled ? item.disabled(ctx) : false;
        if (disabled) {
            el.classList.add('ctx-disabled');
        } else {
            el.addEventListener('click', () => { item.action(ctx); close(); });
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.action(ctx); close(); }
            });
            focusable.push(el);
        }

        menuEl.appendChild(el);
    }

    // Initial off-screen position to measure size
    menuEl.style.left = '-9999px';
    menuEl.style.top  = '-9999px';
    document.body.appendChild(menuEl);

    // Clamp to viewport
    const { width: mw, height: mh } = menuEl.getBoundingClientRect();
    const { left, top } = clamp(ctx.x, ctx.y, mw, mh);
    menuEl.style.left = `${left}px`;
    menuEl.style.top  = `${top}px`;
    menuEl.focus();

    // ── Keyboard navigation ───────────────────────────────────────────────
    let focusIdx = -1;
    const navHandler = (e) => {
        if (e.key === 'Escape') { close(); return; }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusIdx = (focusIdx + 1) % focusable.length;
            focusable[focusIdx]?.focus();
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusIdx = (focusIdx - 1 + focusable.length) % focusable.length;
            focusable[focusIdx]?.focus();
        }
    };

    // ── Dismiss triggers ─────────────────────────────────────────────────
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

function close() {
    if (cleanup) { cleanup(); cleanup = null; }
    if (menuEl)  { menuEl.remove(); menuEl = null; }
}

// The CSS is inlined so sandbox mode doesn't need a separate file fetch.
const INLINE_CSS = `
#__wt-ctx-menu {
    position: fixed;
    z-index: 2147483647;
    min-width: 180px;
    max-width: 280px;
    background: #233138;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 6px;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.45), 0 10px 24px -4px rgba(0,0,0,0.35);
    padding: 4px 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
    color: #e9edef;
    user-select: none;
    outline: none;
    animation: __wt-ctx-in 0.09s ease-out;
}
@keyframes __wt-ctx-in {
    from { opacity:0; transform:scale(0.97); }
    to   { opacity:1; transform:scale(1);    }
}
#__wt-ctx-menu .ctx-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 14px;
    cursor: default;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-radius: 3px;
    margin: 0 2px;
    transition: background 0.08s ease;
    line-height: 1.45;
}
#__wt-ctx-menu .ctx-item:hover,
#__wt-ctx-menu .ctx-item:focus {
    background: rgba(0,168,132,0.18);
    outline: none;
}
#__wt-ctx-menu .ctx-item.ctx-disabled {
    color: #566b76;
    cursor: not-allowed;
    pointer-events: none;
}
#__wt-ctx-menu .ctx-icon {
    flex-shrink: 0;
    width: 15px;
    height: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.65;
    color: #8696a0;
}
#__wt-ctx-menu .ctx-item:hover .ctx-icon,
#__wt-ctx-menu .ctx-item:focus .ctx-icon { opacity: 0.9; }
#__wt-ctx-menu .ctx-sep {
    height: 1px;
    background: rgba(255,255,255,0.06);
    margin: 4px 0;
}
#__wt-ctx-menu .ctx-label { flex:1; overflow:hidden; text-overflow:ellipsis; }
#__wt-ctx-menu .ctx-header {
    padding: 5px 14px 2px;
    font-size: 10.5px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: #566b76;
}
`;

module.exports = { show, close, buildItems };
