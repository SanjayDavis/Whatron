//go:build windows
// +build windows

package main

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"

	"github.com/go-toast/toast"
)

func showNotification(title, body string, idFloat float64, embeddedIconPNG []byte) {
	iconPath := filepath.Join(os.TempDir(), "whatron_icon.png")
	os.WriteFile(iconPath, embeddedIconPNG, 0644)

	activationArgs := "whatron://focus"
	if idFloat > 0 {
		activationArgs = fmt.Sprintf("whatron://click-notif?id=%d", int(idFloat))
	} else if title != "" {
		activationArgs = fmt.Sprintf("whatron://open-chat?sender=%s", url.QueryEscape(title))
	}

	notification := toast.Notification{
		AppID:               "Whatron",
		Title:               title,
		Message:             body,
		Icon:                iconPath,
		ActivationType:      "protocol",
		ActivationArguments: activationArgs,
	}
	notification.Push()
}
