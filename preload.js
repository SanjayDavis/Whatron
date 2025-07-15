const { ipcRenderer } = require('electron');

let notificationsMuted = false;
let wasOnline = true;

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
    // 🌑 Dark Mode Toggle
    const darkCSS = `
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
    `;

    const style = document.createElement("style");
    style.id = "dark-style";
    style.textContent = darkCSS;

    const button = document.createElement('button');
    button.innerText = "🌓";
    button.title = "Toggle Dark Mode";
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

    let darkMode = false;
    button.onclick = () => {
        darkMode = !darkMode;
        if (darkMode) {
            document.head.appendChild(style);
        } else {
            const existing = document.getElementById("dark-style");
            if (existing) existing.remove();
        }
    };

    document.body.appendChild(button);

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

        if (count > lastCount && !notificationsMuted) {
            new Notification("New WhatsApp Message", {
                body: `You have ${count} unread message(s). Click to reply.`,
                             silent: false
            }).onclick = () => {
                window.focus();
            };
        }

        lastCount = count;
    }, 5000);
});
