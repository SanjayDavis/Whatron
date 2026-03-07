'use strict';

/**
 * contextDetector.js
 * Inspects the event target and DOM selection to produce a context descriptor
 * that drives which menu items are shown.
 */

function detect(event) {
    const target    = event.target;
    const selection = window.getSelection();
    const selText   = selection ? selection.toString().trim() : '';

    const ctx = {
        target,
        x: event.clientX,
        y: event.clientY,

        // What kind of element
        isInput:      isEditable(target),
        isLink:       false,
        isImage:      false,
        isMessage:    false,

        // Selection
        hasSelection: selText.length > 0,
        selectedText: selText,

        // Link info
        linkUrl:  null,
        linkText: null,

        // Image info
        imageSrc: null,

        // Message info
        messageText:      null,
        messageTimestamp: null,
    };

    // Link — walk up ancestors
    const anchor = target.closest('a[href]');
    if (anchor) {
        ctx.isLink    = true;
        ctx.linkUrl   = anchor.href;
        ctx.linkText  = anchor.textContent.trim();
    }

    // Image
    if (target.tagName === 'IMG') {
        ctx.isImage   = true;
        ctx.imageSrc  = target.src;
    } else {
        const imgDescendant = target.querySelector && target.querySelector('img');
        if (imgDescendant) {
            ctx.isImage  = true;
            ctx.imageSrc = imgDescendant.src;
        }
    }

    // WhatsApp message bubble
    const msgBubble = target.closest('[data-id]');
    if (msgBubble) {
        ctx.isMessage = true;
        const textEl  = msgBubble.querySelector('span.selectable-text');
        if (textEl) ctx.messageText = textEl.innerText.trim();

        const timeEl = msgBubble.querySelector('[data-pre-plain-text]');
        if (timeEl) ctx.messageTimestamp = timeEl.getAttribute('data-pre-plain-text').trim();
    }

    return ctx;
}

function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName;
    return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        el.isContentEditable ||
        el.getAttribute('contenteditable') === 'true'
    );
}

module.exports = { detect };
