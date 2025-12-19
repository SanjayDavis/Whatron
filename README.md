# WhatsApp Electron

An unofficial WhatsApp Web desktop client built with Electron for Windows and Linux.

> This is not affiliated with WhatsApp or Meta. It wraps https://web.whatsapp.com in a native desktop application.

## Features

### Interface & Display
- System tray integration with minimize to tray
- Always-on-top window mode
- Customizable themes (Dark, Classic, Blue, Green)
- Dark mode enabled by default
- Zoom controls (zoom in/out/reset)
- Custom window icon

### Performance & Optimization
- Hardware acceleration with GPU rendering
- Memory management with automatic cache clearing
- Battery saver mode (reduced frame rate on battery power)
- Optimized startup with lazy loading
- Hardware video decoding

### Notifications & Alerts
- Desktop notifications for new messages
- Mute/unmute notifications toggle
- Custom notification sounds support
- Notification count display in system tray

### File Management
- Drag-and-drop file upload
- Enhanced download manager
- Downloads organized in dedicated WhatsApp folder
- Download progress indicator
- Screenshot capture tool

### Productivity Features
- Spell checker (toggle on/off)
- Multiple account support (separate windows)
- Auto-launch on system startup
- Keyboard shortcuts for common actions

### Keyboard Shortcuts
- Ctrl + Plus/Minus - Zoom in/out
- Ctrl + 0 - Reset zoom
- Ctrl + D - Toggle dark mode
- Ctrl + T - Cycle through themes
- Ctrl + M - Mute/unmute notifications
- Ctrl + , - Focus search
- Ctrl + N - New chat
- Ctrl + Shift + S - Take screenshot

## Download

[Get the latest release here](https://github.com/SanjayDavis/Whatsapp_Electron/releases)

## Installation

### Windows
1. Download `whatsapp_electron-1.0.0.exe` from releases
2. Run the installer
3. Choose installation directory
4. Launch from desktop or start menu

### Linux
Download the appropriate package:
- `.deb` for Debian/Ubuntu
- `.rpm` for Fedora/RHEL
- `.AppImage` for universal Linux support

## Development

### Run Locally
```bash
git clone https://github.com/SanjayDavis/Whatsapp_Electron.git
cd Whatsapp_Electron
npm install
npm start
```

### Build for Windows
```bash
npm run dist:win
```

### Build for Linux
```bash
npm run dist
```

## System Requirements
- Windows 10 or later / Linux (any modern distribution)
- 4GB RAM minimum
- 150MB disk space

## License
MIT

## Author
Sanjay Davis
