package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/atotto/clipboard"
)

const webview2UserAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

func init() {
	// The webview MUST run on the main OS thread (thread 0).
	runtime.LockOSThread()

	// Append to any existing args instead of overwriting
	existing := os.Getenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS")
	args := existing
	if args != "" {
		args += " "
	}

	// Add flags that help WhatsApp Web work correctly in WebView2
	args += "--disable-features=msEdgeEnhance --enable-features=SharedArrayBuffer,SmoothScrolling"
	args += " --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding"
	args += " --user-agent=\"" + webview2UserAgent + "\""

	os.Setenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", args)
}

func main() {
	// Parse basic arguments
	initialURL := ""
	isSecondAccount := false

	for _, arg := range os.Args[1:] {
		if arg == "--second-account" {
			isSecondAccount = true
		} else if strings.HasPrefix(arg, "whatron://") {
			initialURL = arg
		}
	}

	appData := os.Getenv("APPDATA")
	if appData == "" {
		appData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Roaming")
	}

	if isSecondAccount {
		fmt.Println("[main] Starting second account")
		if initialURL == "" {
			initialURL = "https://web.whatsapp.com/?second_account=1"
		}
	} else {
	}
	if appData != "" {
		userDataDir := filepath.Join(appData, "Whatron", "WebView2")
		if isSecondAccount {
			userDataDir = filepath.Join(appData, "Whatron", "WebView2_Second")
		}
		_ = os.MkdirAll(userDataDir, 0755)
		os.Setenv("WEBVIEW2_USER_DATA_FOLDER", userDataDir)
	}

	app := NewWhatronApp(initialURL, isSecondAccount)
	app.Run()
}

// writeToClipboard writes text to the system clipboard.
func writeToClipboard(text string) {
	err := clipboard.WriteAll(text)
	if err != nil {
		fmt.Printf("[clipboard] Failed to write: %v\n", err)
	}
}

// newExecCommand creates an exec.Cmd for launching sub-processes.
func newExecCommand(name string, arg ...string) *exec.Cmd {
	cmd := exec.Command(name, arg...)
	hideCommandWindow(cmd)
	return cmd
}
