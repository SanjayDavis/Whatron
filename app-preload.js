const { ipcRenderer } = require('electron');
const logToMain = (...args) => ipcRenderer.send('renderer-log', ...args);
let notificationsMuted = false;
let wasOnline = true;
let dndMode = localStorage.getItem('dnd-mode') === 'true';
let customSoundEnabled = localStorage.getItem('custom-sound') === 'true';
let notificationSound = null;
if (customSoundEnabled) {
    notificationSound = new Audio();
    notificationSound.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGnOLyvmgcBjiR1/LMeSwFJ';
}
ipcRenderer.on('toggle-mute', (_event, value) => {
    notificationsMuted = value;
});
Object.defineProperty(navigator, 'userAgent', {
    get: () =>
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.78 Safari/537.36"
});
Object.defineProperty(navigator, 'vendor', { get: () => "Google Inc." });
Object.defineProperty(navigator, 'platform', { get: () => "Linux x86_64" });
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
    const style = document.createElement("style");
    style.id = "custom-theme";
    const applyTheme = (themeName) => {
        currentTheme = themeName;
        localStorage.setItem('whatsapp-theme', themeName);
        style.textContent = customThemes[themeName] || customThemes.classic;
        if (themeName !== 'classic' && !document.getElementById('custom-theme')) {
            document.head.appendChild(style);
        } else if (themeName === 'classic') {
            const existing = document.getElementById('custom-theme');
            if (existing) existing.remove();
        } else {
            style.textContent = customThemes[themeName];
        }
    };
    const button = document.createElement('button');
    button.innerText = "🌓";
    button.title = "Toggle Theme (Ctrl+D)";
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
    button.onmouseenter = () => button.style.opacity = "1";
    button.onmouseleave = () => button.style.opacity = "0.7";
    const toggleDarkMode = () => {
        const newTheme = currentTheme === 'dark' ? 'classic' : 'dark';
        applyTheme(newTheme);
    };
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
            dndMode = notificationsMuted;
            localStorage.setItem('dnd-mode', dndMode);
            const toast = document.createElement('div');
            toast.textContent = notificationsMuted ? '🔇 Notifications Muted' : '🔔 Notifications Enabled';
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
            for (let file of files) dataTransfer.items.add(file);
            const input = document.querySelector('input[type="file"]');
            if (input) {
                input.files = dataTransfer.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    });
    let lastCount = 0;
    let lastNotifiedMessages = new Set();
    let isFirstCheck = true;
    const checkForNewMessages = () => {
        try {
            const unreadChats = document.querySelectorAll('div[role="listitem"][aria-label*="unread"]');
            if (isFirstCheck) {
                const el = document.querySelector('title');
                if (el) {
                    const match = el.textContent.match(/\((\d+)\)/);
                    const count = match ? parseInt(match[1]) : 0;
                    lastCount = count;
                    if (count > 0 && !notificationsMuted && !dndMode) {
                        ipcRenderer.send('show-notification', {
                            title: 'Unofficial WhatsApp',
                            body: `You have ${count} unread message(s)`,
                            silent: true,
                            sender: null
                        });
                    }
                }
                unreadChats.forEach(chat => {
                    const nameElement = chat.querySelector('span[dir="auto"][title]');
                    const messageElement = chat.querySelector('span.selectable-text[dir="ltr"]');
                    if (nameElement && messageElement) {
                        const sender = nameElement.getAttribute('title') || nameElement.textContent;
                        const message = messageElement.textContent;
                        const messageId = `${sender}:${message}`;
                        lastNotifiedMessages.add(messageId);
                    }
                });
                isFirstCheck = false;
                return;
            }
            unreadChats.forEach(chat => {
                const nameElement = chat.querySelector('span[dir="auto"][title]');
                const messageElement = chat.querySelector('span.selectable-text[dir="ltr"]');
                if (nameElement && messageElement) {
                    const sender = nameElement.getAttribute('title') || nameElement.textContent;
                    const message = messageElement.textContent;
                    const messageId = `${sender}:${message}`;
                    if (!lastNotifiedMessages.has(messageId) && !notificationsMuted && !dndMode) {
                        lastNotifiedMessages.add(messageId);
                        if (lastNotifiedMessages.size > 50) {
                            const firstItem = lastNotifiedMessages.values().next().value;
                            lastNotifiedMessages.delete(firstItem);
                        }
                        if (customSoundEnabled && notificationSound) {
                            notificationSound.play().catch(() => {});
                        }
                        logToMain('Sending notification for:', sender);
                        ipcRenderer.send('show-notification', {
                            title: sender,
                            body: message.length > 100 ? message.substring(0, 100) + '...' : message,
                            silent: !customSoundEnabled,
                            sender: sender
                        });
                    }
                }
            });
        } catch (err) {
            console.error('Error checking messages:', err);
        }
    };
    ipcRenderer.on('open-chat', (event, sender) => {
        logToMain('Received open-chat request for:', sender);
        let attempts = 0;
        const maxAttempts = 12;
        const tryOpen = () => {
            try {
                const chats = document.querySelectorAll('div[role="listitem"]');
                logToMain(`Found ${chats.length} chats, searching for:`, sender);
                for (const chat of chats) {
                    const nameElement = chat.querySelector('span[dir="auto"][title]');
                    if (nameElement) {
                        const name = nameElement.getAttribute('title') || nameElement.textContent;
                        if (name === sender) {
                            logToMain('Found matching chat, clicking...');
                            chat.click();
                            return;
                        }
                    }
                }
            } catch (err) {
                console.error('Error opening chat:', err);
                return;
            }
            attempts += 1;
            if (attempts < maxAttempts) {
                setTimeout(tryOpen, 300);
            } else {
                logToMain('Failed to find chat after retries');
            }
        };
        tryOpen();
    });

    // IPC handler for sending messages (quick reply)
    ipcRenderer.on('send-message', (event, data) => {
        logToMain('Received send-message request for:', data.sender, 'message:', data.message);
        
        // Find and click the chat
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
                            
                            // Wait for chat to open, then send message
                            setTimeout(() => {
                                const messageBox = document.querySelector('div[contenteditable="true"][data-tab="10"]');
                                if (messageBox) {
                                    messageBox.focus();
                                    messageBox.textContent = data.message;
                                    
                                    // Trigger input event
                                    const inputEvent = new Event('input', { bubbles: true });
                                    messageBox.dispatchEvent(inputEvent);
                                    
                                    // Find and click send button
                                    setTimeout(() => {
                                        const sendButton = document.querySelector('button[data-tab="11"]') || 
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

    // PERF-1 / LEAK-5 fix: Replace setInterval(checkForNewMessages, 2000) with a MutationObserver.
    // The old approach ran 43,200 DOM queries/day even when the window was hidden.
    // The observer fires only when the chat list DOM actually changes, and is
    // gated on document.visibilityState so it does nothing while the window is hidden.
    let chatObserver = null;

    const attachObserver = () => {
        // WhatsApp Web renders the chat list inside #pane-side
        const pane = document.querySelector('#pane-side') ||
                      document.querySelector('[aria-label="Chat list"]') ||
                      document.querySelector('[data-asset-intro-image-light]')?.closest('[role="navigation"]');
        if (!pane) return false;

        if (chatObserver) chatObserver.disconnect();
        chatObserver = new MutationObserver(() => {
            if (document.visibilityState !== 'hidden') {
                checkForNewMessages();
            }
        });
        chatObserver.observe(pane, { childList: true, subtree: true });
        logToMain('MutationObserver attached to chat list');
        return true;
    };

    // Retry until the SPA mounts the chat list
    let observerRetries = 0;
    const tryAttach = () => {
        if (attachObserver()) return;
        if (++observerRetries < 30) {
            setTimeout(tryAttach, 1000);
        } else {
            // Fallback: longer interval so at least we don't miss messages entirely
            logToMain('MutationObserver: chat list not found, falling back to 5 s interval');
            setInterval(checkForNewMessages, 5000);
        }
    };
    tryAttach();

    // Re-check immediately whenever the user switches back to this tab/window
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkForNewMessages();
            // Re-attach observer in case the SPA replaced the container
            if (!chatObserver) tryAttach();
        }
    });
});
