package main

import (
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	stdruntime "runtime"
	"strings"
)

const WAOrigin = "https://web.whatsapp.com"

// isWhatsAppHost checks if a hostname belongs to WhatsApp.
func isWhatsAppHost(host string) bool {
	return host == "web.whatsapp.com" ||
		host == "wa.me" ||
		host == "whatsapp.com" ||
		host == "chat.whatsapp.com" ||
		strings.HasSuffix(host, ".whatsapp.com")
}

// isAllowedURL checks if a URL is allowed to be loaded in the webview.
func isAllowedURL(rawURL string) bool {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	scheme := parsed.Scheme
	if scheme != "https" && scheme != "http" {
		return false
	}
	return isWhatsAppHost(parsed.Host)
}

// handleWhatsAppURL converts various WhatsApp URL formats to web.whatsapp.com URLs.
func handleWhatsAppURL(rawURL string) string {
	if rawURL == "" {
		return WAOrigin
	}

	parsed, err := url.Parse(rawURL)
	if err != nil {
		return WAOrigin
	}

	// Handle whatron:// scheme
	if parsed.Scheme == "whatron" || parsed.Scheme == "whatsapp" {
		if parsed.Host == "send" {
			params := parsed.Query()
			if phone := params.Get("phone"); phone != "" {
				return fmt.Sprintf("%s/send?%s", WAOrigin, params.Encode())
			}
		}
		if parsed.Host == "chat" {
			params := parsed.Query()
			if code := params.Get("code"); code != "" {
				return fmt.Sprintf("https://chat.whatsapp.com/%s", code)
			}
		}
		return WAOrigin
	}

	// Handle web links
	if parsed.Host == "wa.me" || parsed.Host == "chat.whatsapp.com" {
		return rawURL
	}

	return WAOrigin
}

// openExternalURL opens a URL in the system's default browser after validation.
func openExternalURL(urlStr string) error {
	parsed, err := url.Parse(urlStr)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	scheme := parsed.Scheme
	if scheme != "https" && scheme != "http" && scheme != "mailto" {
		return fmt.Errorf("blocked URL scheme: %s", scheme)
	}

	var cmd *exec.Cmd
	switch stdruntime.GOOS {
	case "windows":
		cmd = newExecCommand("rundll32", "url.dll,FileProtocolHandler", urlStr)
	case "linux":
		cmd = newExecCommand("xdg-open", urlStr)
	case "darwin":
		cmd = newExecCommand("open", urlStr)
	default:
		return fmt.Errorf("unsupported platform: %s", stdruntime.GOOS)
	}

	return cmd.Start()
}

// openLocalFile opens a local file using the default system handler.
func openLocalFile(filePath string) error {
	var cmd *exec.Cmd
	switch stdruntime.GOOS {
	case "windows":
		cmd = newExecCommand("rundll32", "url.dll,FileProtocolHandler", filePath)
	case "linux":
		cmd = newExecCommand("xdg-open", filePath)
	case "darwin":
		cmd = newExecCommand("open", filePath)
	default:
		return fmt.Errorf("unsupported platform: %s", stdruntime.GOOS)
	}
	return cmd.Start()
}

// showInFolder reveals a local file or folder in the system file manager.
func showInFolder(filePath string) error {
	var cmd *exec.Cmd
	switch stdruntime.GOOS {
	case "windows":
		// Rather than wrestling with explorer parsing "/select," inside Go's exec.Command
		// the most reliable bullet-proof method is to just open the parent directory.
		cmd = newExecCommand("explorer", filepath.Dir(filePath))
	case "linux":
		cmd = newExecCommand("xdg-open", filepath.Dir(filePath))
	case "darwin":
		cmd = newExecCommand("open", "-R", filePath)
	default:
		return fmt.Errorf("unsupported platform: %s", stdruntime.GOOS)
	}
	return cmd.Start()
}

// registerProtocolHandler registers the whatron:// protocol handler.
func registerProtocolHandler() error {
	switch stdruntime.GOOS {
	case "windows":
		return registerWindowsProtocolHandler()
	case "linux":
		return registerLinuxProtocolHandler()
	default:
		return fmt.Errorf("unsupported platform: %s", stdruntime.GOOS)
	}
}

func registerWindowsProtocolHandler() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		return fmt.Errorf("failed to resolve executable path: %w", err)
	}
	exePath = strings.ReplaceAll(exePath, "/", "\\")

	commands := []struct {
		args []string
		desc string
	}{
		{
			args: []string{"reg", "add", `HKCU\Software\Classes\whatron`, "/f", "/ve", "/d", "URL:WhatsApp Protocol"},
			desc: "register protocol key",
		},
		{
			args: []string{"reg", "add", `HKCU\Software\Classes\whatron`, "/f", "/v", "URL Protocol", "/d", ""},
			desc: "set URL Protocol flag",
		},
		{
			args: []string{"reg", "add", `HKCU\Software\Classes\whatron\DefaultIcon`, "/f", "/ve", "/d", fmt.Sprintf(`"%s",0`, exePath)},
			desc: "set default icon",
		},
		{
			args: []string{"reg", "add", `HKCU\Software\Classes\whatron\shell\open\command`, "/f", "/ve", "/d", fmt.Sprintf(`"%s" "%%1"`, exePath)},
			desc: "set open command",
		},
	}

	for _, cmd := range commands {
		if err := newExecCommand(cmd.args[0], cmd.args[1:]...).Run(); err != nil {
			return fmt.Errorf("failed to %s: %w", cmd.desc, err)
		}
	}

	fmt.Println("[protocol] Windows protocol handler registered successfully")
	return nil
}

func registerLinuxProtocolHandler() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}
	exePath, _ = filepath.EvalSymlinks(exePath)

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %w", err)
	}

	appsDir := filepath.Join(homeDir, ".local", "share", "applications")
	if err := os.MkdirAll(appsDir, 0755); err != nil {
		return fmt.Errorf("failed to create applications directory: %w", err)
	}

	desktopFile := fmt.Sprintf(`[Desktop Entry]
Name=Whatron
Comment=WhatsApp Desktop Client
Exec=%s %%u
Type=Application
Terminal=false
MimeType=x-scheme-handler/whatsapp;x-scheme-handler/whatsapp-desktop;
Categories=Network;InstantMessaging;
`, exePath)

	desktopPath := filepath.Join(appsDir, "whatron.desktop")
	if err := os.WriteFile(desktopPath, []byte(desktopFile), 0644); err != nil {
		return fmt.Errorf("failed to write desktop file: %w", err)
	}

	cmd := newExecCommand("update-desktop-database", appsDir)
	if err := cmd.Run(); err != nil {
		fmt.Printf("[protocol] Warning: failed to update desktop database: %v\n", err)
	}

	fmt.Println("[protocol] Linux protocol handler registered successfully")
	return nil
}
