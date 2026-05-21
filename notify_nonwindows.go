//go:build !windows
// +build !windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
)

func showNotification(title, body string, idFloat float64, embeddedIconPNG []byte) {
	iconPath := filepath.Join(os.TempDir(), "whatron_icon.png")
	os.WriteFile(iconPath, embeddedIconPNG, 0644)

	// Since notify-send doesn't easily support callback actions natively across all Linux DEs,
	// we just show the notification.
	// A more robust solution for Linux callbacks would require DBus integration, but notify-send works universally for simple toasts.
	// For click-actions on Linux DEs, users generally click the taskbar or use the system tray icon anyway.
	exec.Command("notify-send", "-i", iconPath, "-a", "Whatron", title, body).Start()
}
