set -e

echo "=> Welcome to Whatron Linux Installer"
echo "=> Checking dependencies..."

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install dependencies if missing
if ! command_exists go || ! command_exists git || ! pkg-config --exists webkit2gtk-4.0; then
    echo "=> Some dependencies are missing. Attempting to install them..."
    if command_exists apt-get; then
        sudo apt-get update
        sudo apt-get install -y git golang libwebkit2gtk-4.0-dev libgtk-3-dev
    elif command_exists pacman; then
        sudo pacman -Syu --noconfirm git go webkit2gtk webkit2gtk-4.1
    elif command_exists dnf; then
        sudo dnf install -y git golang webkit2gtk4.0-devel gtk3-devel
    else
        echo "=> Could not detect package manager. Please install git, go, and webkit2gtk-4.0 manually."
    fi
fi

if ! command_exists go || ! command_exists git; then
    echo "=> Error: Git and Go are required to build Whatron."
    exit 1
fi

INSTALL_DIR="/tmp/whatron_src"
if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
fi

echo "=> Cloning repository..."
git clone https://github.com/SanjayDavis/Whatron.git "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo "=> Building Whatron..."
# Use CGO to build the webview wrapper
go build -o whatron .

echo "=> Installing Whatron..."
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
cp whatron "$BIN_DIR/whatron"

echo "=> Setting up desktop integration..."
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
mkdir -p "$DESKTOP_DIR" "$ICON_DIR"

if [ -f "assets/icons/icon.png" ]; then
    cp assets/icons/icon.png "$ICON_DIR/whatron.png"
fi

cat > "$DESKTOP_DIR/whatron.desktop" <<EOF
[Desktop Entry]
Name=Whatron
Comment=Unofficial WhatsApp Web desktop client
Exec=$BIN_DIR/whatron %u
Icon=whatron
Terminal=false
Type=Application
Categories=Network;InstantMessaging;
MimeType=x-scheme-handler/whatron;x-scheme-handler/whatsapp;
EOF

if command_exists update-desktop-database; then
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi

echo "=> Installation complete!"
echo "=> Whatron is installed to $BIN_DIR/whatron"
echo "=> You can launch Whatron from your application menu or by typing 'whatron' in your terminal."
echo "=> Please ensure $BIN_DIR is in your PATH."
