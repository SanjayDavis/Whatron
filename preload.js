const { ipcRenderer } = require('electron');

let notificationsMuted = false;
let wasOnline = true;
let dndMode = localStorage.getItem('dnd-mode') === 'true';
let customSoundEnabled = localStorage.getItem('custom-sound') === 'true';

// Load custom notification sound if exists
let notificationSound = null;
if (customSoundEnabled) {
    notificationSound = new Audio();
    // You can replace this with a custom sound file path
    notificationSound.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGnOLyvmgcBjiR1/LMeSwFJ';
}

ipcRenderer.on('toggle-mute', (_event, value) => {
    notificationsMuted = value;
});

// Spoof WhatsApp-compatible environment
Object.defineProperty(navigator, 'userAgent', {
    get: () =>
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.78 Safari/537.36"
});
Object.defineProperty(navigator, 'vendor', { get: () => "Google Inc." });
Object.defineProperty(navigator, 'platform', { get: () => "Linux x86_64" });

window.addEventListener('DOMContentLoaded', () => {
    // 🎨 Custom Theme Support - Start with dark mode by default
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

    let currentTheme = localStorage.getItem('whatsapp-theme') || 'dark'; // Default to dark
    
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

    // 🌑 Dark Mode Toggle Button
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
    
    // Apply saved theme
    applyTheme(currentTheme);
    document.body.appendChild(button);

    // ⌨️ Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+D - Toggle Dark Mode
        if (e.ctrlKey && e.key === 'd') {
            e.preventDefault();
            toggleDarkMode();
        }
        // Ctrl+T - Cycle through themes
        if (e.ctrlKey && e.key === 't') {
            e.preventDefault();
            const themes = ['dark', 'classic', 'blue', 'green'];
            const currentIndex = themes.indexOf(currentTheme);
            const nextTheme = themes[(currentIndex + 1) % themes.length];
            applyTheme(nextTheme);
            
            const toast = document.createElement('div');
            toast.textContent = `🎨 Theme: ${nextTheme.charAt(0).toUpperCase() + nextTheme.slice(1)}`;
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
        // Ctrl+M - Mute/Unmute (visual feedback)
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
        // Ctrl+, - Focus search
        if (e.ctrlKey && e.key === ',') {
            e.preventDefault();
            const searchBox = document.querySelector('[data-tab="3"]') || document.querySelector('input[type="text"]');
            if (searchBox) searchBox.click();
        }
        // Ctrl+N - New chat
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            const newChatBtn = document.querySelector('[data-icon="new-chat-outline"]')?.parentElement;
            if (newChatBtn) newChatBtn.click();
        }
    });

    //  Drag & Drop File Upload
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

    //  Notifications
    let lastCount = 0;
    setInterval(() => {
        const el = document.querySelector('title');
        if (!el) return;
        const match = el.textContent.match(/\((\d+)\)/);
        const count = match ? parseInt(match[1]) : 0;

        if (count > lastCount && !notificationsMuted && !dndMode) {
            // Play custom sound if enabled
            if (customSoundEnabled && notificationSound) {
                notificationSound.play().catch(() => {});
            }
            
            new Notification("New WhatsApp Message", {
                body: `You have ${count} unread message(s). Click to reply.`,
                silent: !customSoundEnabled // Use system sound if custom is disabled
            }).onclick = () => {
                window.focus();
            };
        }

        lastCount = count;
    }, 5000);
});
