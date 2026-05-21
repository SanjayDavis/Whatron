package main

import (
	"fmt"
	"os"
	"path/filepath"
	stdruntime "runtime"
)

// enableAutoLaunch registers the application to start on system boot.
func enableAutoLaunch() {
	switch stdruntime.GOOS {
	case "windows":
		enableAutoLaunchWindows()
	case "linux":
		enableAutoLaunchLinux()
	default:
		fmt.Printf("[autolaunch] Unsupported platform: %s\n", stdruntime.GOOS)
	}
}

// disableAutoLaunch removes the application from system startup.
func disableAutoLaunch() {
	switch stdruntime.GOOS {
	case "windows":
		disableAutoLaunchWindows()
	case "linux":
		disableAutoLaunchLinux()
	default:
		fmt.Printf("[autolaunch] Unsupported platform: %s\n", stdruntime.GOOS)
	}
}

// ── Windows ──────────────────────────────────────────────────────────────────

func enableAutoLaunchWindows() {
	exePath, err := os.Executable()
	if err != nil {
		fmt.Printf("[autolaunch] Failed to get executable path: %v\n", err)
		return
	}
	exePath, _ = filepath.EvalSymlinks(exePath)

	cmd := newExecCommand("reg", "add",
		`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`,
		"/v", "Whatron",
		"/t", "REG_SZ",
		"/d", fmt.Sprintf(`"%s"`, exePath),
		"/f",
	)
	if err := cmd.Run(); err != nil {
		fmt.Printf("[autolaunch] Failed to enable: %v\n", err)
	} else {
		fmt.Println("[autolaunch] Enabled successfully")
	}
}

func disableAutoLaunchWindows() {
	cmd := newExecCommand("reg", "delete",
		`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`,
		"/v", "Whatron",
		"/f",
	)
	if err := cmd.Run(); err != nil {
		fmt.Printf("[autolaunch] Failed to disable: %v\n", err)
	} else {
		fmt.Println("[autolaunch] Disabled successfully")
	}
}

// ── Linux ────────────────────────────────────────────────────────────────────

func enableAutoLaunchLinux() {
	exePath, err := os.Executable()
	if err != nil {
		fmt.Printf("[autolaunch] Failed to get executable path: %v\n", err)
		return
	}
	exePath, _ = filepath.EvalSymlinks(exePath)

	homeDir, err := os.UserHomeDir()
	if err != nil {
		fmt.Printf("[autolaunch] Failed to get home directory: %v\n", err)
		return
	}

	autostartDir := filepath.Join(homeDir, ".config", "autostart")
	if err := os.MkdirAll(autostartDir, 0755); err != nil {
		fmt.Printf("[autolaunch] Failed to create autostart directory: %v\n", err)
		return
	}

	desktopEntry := fmt.Sprintf(`[Desktop Entry]
Type=Application
Name=Whatron
Comment=WhatsApp Desktop Client
Exec=%s
Terminal=false
Hidden=false
X-GNOME-Autostart-enabled=true
`, exePath)

	desktopPath := filepath.Join(autostartDir, "whatron.desktop")
	if err := os.WriteFile(desktopPath, []byte(desktopEntry), 0644); err != nil {
		fmt.Printf("[autolaunch] Failed to write desktop file: %v\n", err)
	} else {
		fmt.Println("[autolaunch] Enabled successfully")
	}
}

func disableAutoLaunchLinux() {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return
	}
	desktopPath := filepath.Join(homeDir, ".config", "autostart", "whatron.desktop")
	if err := os.Remove(desktopPath); err != nil && !os.IsNotExist(err) {
		fmt.Printf("[autolaunch] Failed to remove desktop file: %v\n", err)
	} else {
		fmt.Println("[autolaunch] Disabled successfully")
	}
}
