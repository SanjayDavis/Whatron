# Whatron

An unofficial WhatsApp Web desktop client built with pure Go and native webviews for Windows, Linux, and macOS.

> This is not affiliated with WhatsApp or Meta. It wraps https://web.whatsapp.com in a highly optimized native desktop application.

## Why Whatron? (Pros vs. Official App)

The official WhatsApp Desktop app and other wrappers use Electron or heavily bloated frameworks, which consume massive system resources. Whatron was rewritten to use **pure Go** and the OS's native webview engine (WebView2 on Windows, WebKitGTK on Linux, Cocoa on macOS).

### Pros
- **Incredible Memory Efficiency**: RAM usage is drastically reduced. While Electron-based WhatsApp wrappers typically consume **600MB+** of RAM, Whatron runs at around **6 to 7 MB** on Windows!
- **Lightning Fast**: Blazing fast startup times and zero UI lag compared to Electron clients.
- **Native OS Integration**: Uses native system toasts for notifications instead of heavy custom DOM popups. Deeply integrates with the OS protocol handler to flawlessly open chats when clicked.
- **Microscopic Binary Size**: The entire application is a tiny compiled executable without an embedded Chromium engine.
- **Multi-Account Support**: Easily run a second instance isolated from the first using the `--second-account` flag.

### Cons
- **Platform Webview Dependency**: Requires the host OS to have its native webview engine installed (WebView2 is pre-installed on Windows 10/11, Webkit2GTK is required on Linux).

## Features

### Interface & Display
- Custom Dark theme injected natively (can switch to other themes with `Ctrl + D`)
- System tray integration with unread message counter
- Responsive window sizing with native zooming (`Ctrl +`, `Ctrl -`, `Ctrl 0`)
- Deep-link focus switching (automatically snapping to chats when clicking notifications)

### File Management
- Automatic file downloads organized in a dedicated WhatsApp folder
- Native drag-and-drop file upload support
- Native context menu for images, links, and text selection

### Protocol Handler
- Seamlessly handles `whatsapp://` links from your system browser
- Support for `https://wa.me/` and `https://chat.whatsapp.com/` links
- Automatically switches window focus and navigates to the specific chat

## Prerequisites

- **Go** 1.22 or higher
- **Windows**: Built-in WebView2
- **Linux**: `libwebkit2gtk-4.0-dev` (or `webkit2gtk-4.1` on some distros), `gcc`, `pkg-config`

## Installation

### 1-Click Installers (Recommended)

**Linux:**
```bash
curl -sL https://raw.githubusercontent.com/SanjayDavis/Whatron/main/install.sh | bash
```

**Windows (PowerShell as Admin):**
```powershell
Invoke-Expression (Invoke-WebRequest -Uri "https://raw.githubusercontent.com/SanjayDavis/Whatron/main/install.ps1" -UseBasicParsing).Content
```

### Manual Installation

1. Clone the Repository:
```bash
git clone https://github.com/SanjayDavis/Whatron.git
cd Whatron
```

2. Build the binary:
```bash
# Windows
go build -ldflags "-H=windowsgui" -o Whatron.exe .

# Linux/macOS
go build -o whatron .
```

## Usage

### Opening WhatsApp Links

After building and installing the app, the protocol handler is automatically registered on first launch. You can:

1. Click `whatsapp://` links in your browser (e.g., Brave, Chrome, Firefox) - they will open in Whatron
2. Click `https://wa.me/PHONE` links - they will open the corresponding chat
3. Click `https://chat.whatsapp.com/INVITE_CODE` links - they will open community join pages

### Manual URL Opening

You can also open Whatron with a URL directly from the command line:

```bash
./whatron "https://wa.me/1234567890"
./whatron "https://chat.whatsapp.com/ABC123"
./whatron "whatsapp://send?phone=1234567890"
```

## Keyboard Shortcuts

- `Ctrl + D`: Toggle Dark / Classic Mode
- `Ctrl + M`: Mute / Unmute Notifications
- `Ctrl + N`: New Chat
- `Ctrl + ,`: Focus Search Box
- `Ctrl + =` / `Ctrl + -` / `Ctrl + 0`: Zoom controls

## License
MIT

## Author
Sanjay Davis
