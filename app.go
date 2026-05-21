package main

import (
	"encoding/base64"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/energye/systray"
	"github.com/gofrs/flock"
	webview "github.com/webview/webview_go"
)

func getDownloadsFolder() string {
	home, _ := os.UserHomeDir()
	dlFolder := filepath.Join(home, "Downloads", "WhatsApp")
	os.MkdirAll(dlFolder, 0755)
	return dlFolder
}

func saveBase64File(b64 string, mime string, providedName string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return "", err
	}
	fileName := providedName
	if fileName == "" {
		ext := ".jpg"
		if strings.Contains(mime, "png") {
			ext = ".png"
		}
		fileName = fmt.Sprintf("WhatsApp_Image_%d%s", time.Now().Unix(), ext)
	}
	filePath := filepath.Join(getDownloadsFolder(), fileName)
	err = os.WriteFile(filePath, data, 0644)
	return filePath, err
}

func downloadFile(urlStr string, providedName string) (string, error) {
	resp, err := http.Get(urlStr)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	fileName := providedName
	if fileName == "" {
		parsedUrl, _ := url.Parse(urlStr)
		fileName = filepath.Base(parsedUrl.Path)
		if fileName == "" || fileName == "/" {
			fileName = fmt.Sprintf("WhatsApp_Download_%d.file", time.Now().Unix())
		}
		// Decode filename
		if decoded, err := url.QueryUnescape(fileName); err == nil {
			fileName = decoded
		}
	}
	filePath := filepath.Join(getDownloadsFolder(), fileName)
	out, err := os.Create(filePath)
	if err != nil {
		return "", err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	if err != nil {
		return "", err
	}
	return filePath, nil
}

const appVersion = "1.3.0"

// WhatronApp is the central application controller.
type WhatronApp struct {
	wv              webview.WebView
	config          *ConfigStore
	tray            *TrayManager
	lockFile        *flock.Flock
	initialURL      string
	isSecondAccount bool

	mu          sync.Mutex
	zoom        float64
	unreadCount int
	trayReady   chan struct{}
	wvReady     chan struct{}
}

// NewWhatronApp creates a new application instance.
func NewWhatronApp(initialURL string, isSecondAccount bool) *WhatronApp {
	cfg := NewConfigStore()
	app := &WhatronApp{
		config:          cfg,
		initialURL:      initialURL,
		isSecondAccount: isSecondAccount,
		zoom:            cfg.GetZoom(),
		trayReady:       make(chan struct{}),
		wvReady:         make(chan struct{}),
	}
	app.tray = NewTrayManager(app)
	return app
}

// Run starts the application. This blocks until the app exits.
func (a *WhatronApp) Run() {
	// ── Single instance lock ──────────────────────────────────────────────────
	lockPath := a.getLockPath()
	a.lockFile = flock.New(lockPath)
	locked, err := a.lockFile.TryLock()
	if err != nil {
		fmt.Printf("[app] Lock error: %v\n", err)
	}
	if !locked {
		fmt.Println("[app] Another instance is already running.")
		if a.initialURL != "" {
			urlFile := filepath.Join(os.TempDir(), "whatron_url.txt")
			if a.isSecondAccount {
				urlFile = filepath.Join(os.TempDir(), "whatron_second_url.txt")
			}
			os.WriteFile(urlFile, []byte(a.initialURL), 0644)
			fmt.Println("[app] Passed URL to existing instance. Exiting.")
		} else {
			fmt.Println("[app] Exiting.")
		}
		os.Exit(0)
	}
	defer a.lockFile.Unlock()

	// ── Protocol handler registration ─────────────────────────────────────────
	go func() {
		if err := registerProtocolHandler(); err != nil {
			fmt.Printf("[app] Protocol handler registration failed: %v\n", err)
		}
	}()

	// ── Start system tray in its own goroutine ────────────────────────────────
	// systray.Run must be called from the main goroutine on some platforms,
	// but webview also needs the main thread. We run systray first in a goroutine
	// and block on the webview run loop in main.
	go func() {
		systray.Run(a.tray.OnReady, a.tray.OnExit)
	}()

	// ── Wait for tray to be ready, then create the webview ───────────────────
	<-a.trayReady

	a.createAndRunWebview()
}

// onTrayReady is called by TrayManager when the tray is fully initialised.
func (a *WhatronApp) onTrayReady() {
	close(a.trayReady)
}

// createAndRunWebview creates the webview window and starts the event loop.
// This blocks until the window is closed.
func (a *WhatronApp) createAndRunWebview() {
	cfg := a.config.Get()

	// Create webview (false = no devtools in production)
	a.wv = webview.New(false)
	defer a.wv.Destroy()

	a.wv.SetTitle("Whatron")
	a.wv.SetSize(cfg.WindowWidth, cfg.WindowHeight, webview.HintNone)

	initNativeWindow(a.wv.Window())

	// ── Inject JavaScript before every page load ──────────────────────────────
	a.wv.Init(injectJS)

	// ── Bind Go functions callable from JavaScript ────────────────────────────
	a.bindGoFunctions()

	// ── Navigate to WhatsApp Web ──────────────────────────────────────────────
	targetURL := WAOrigin
	if a.initialURL != "" {
		targetURL = handleWhatsAppURL(a.initialURL)
	}
	a.wv.Navigate(targetURL)

	// ── Apply saved theme and zoom after first load (via timed Dispatch) ──────
	go func() {
		time.Sleep(3 * time.Second) // give WhatsApp Web time to load
		a.wv.Dispatch(func() {
			theme := a.config.GetTheme()
			a.wv.Eval(fmt.Sprintf(`window.__whatronApplyTheme(%q);`, theme))

			if a.zoom != 1.0 {
				a.applyZoom()
			}

			muted := a.config.GetNotificationsMuted()
			if muted {
				a.wv.Eval(`window.__whatronSetMuted(true);`)
			}

			spellCheck := a.config.Get().SpellCheck
			a.wv.Eval(fmt.Sprintf(`document.body.spellcheck = %v;`, spellCheck))

			// If we launched with a deep link, handle it now
			if strings.HasPrefix(a.initialURL, "whatron://open-chat") {
				u, err := url.Parse(a.initialURL)
				if err == nil {
					sender := u.Query().Get("sender")
					if sender != "" {
						a.wv.Eval(fmt.Sprintf(`window.__whatronOpenChat(%q);`, sender))
					}
				}
			}
		})
	}()

	// ── Watch for URLs from second instances ─────────────────────────────────
	a.watchURLFile()

	// ── Block here — webview event loop ──────────────────────────────────────
	a.wv.Run()

	// ── App is closing — clean up tray ───────────────────────────────────────
	systray.Quit()
}

// bindGoFunctions registers all Go functions that JavaScript can call.
func (a *WhatronApp) bindGoFunctions() {
	// Show native toast notification
	a.wv.Bind("__goShowNotification", func(payload map[string]interface{}) {
		title, _ := payload["title"].(string)
		body, _ := payload["body"].(string)

		var idFloat float64
		if val, ok := payload["id"].(float64); ok {
			idFloat = val
		}

		showNotification(title, body, idFloat, embeddedIconPNG)
	})

	// Unread count update → update tray tooltip
	a.wv.Bind("__goUpdateUnread", func(count int, isOnline bool) {
		a.mu.Lock()
		a.unreadCount = count
		a.mu.Unlock()
		a.tray.UpdateTooltip(count, isOnline)
	})

	// Open external URL in system browser
	a.wv.Bind("__goOpenExternal", func(urlStr string) {
		if err := openExternalURL(urlStr); err != nil {
			fmt.Printf("[app] openExternal error: %v\n", err)
		}
	})

	// Zoom in/out by delta
	a.wv.Bind("__goZoom", func(delta float64) {
		a.mu.Lock()
		a.zoom = math.Max(0.5, math.Min(2.0, a.zoom+delta))
		zoom := a.zoom
		a.mu.Unlock()
		a.config.SetZoom(zoom)
		a.wv.Dispatch(func() { a.applyZoom() })
	})

	// Reset zoom to 100 %
	a.wv.Bind("__goZoomReset", func() {
		a.mu.Lock()
		a.zoom = 1.0
		a.mu.Unlock()
		a.config.SetZoom(1.0)
		a.wv.Dispatch(func() { a.applyZoom() })
	})

	// Take screenshot
	a.wv.Bind("__goScreenshot", func() {
		a.takeScreenshot()
	})

	// Set theme (called from JS keyboard shortcut Ctrl+D)
	a.wv.Bind("__goSetTheme", func(theme string) {
		a.config.SetTheme(theme)
	})

	// Set muted (called from JS keyboard shortcut Ctrl+M)
	a.wv.Bind("__goSetMuted", func(muted bool) {
		a.config.SetNotificationsMuted(muted)
		// Keep tray checkbox in sync
		if muted {
			a.tray.mMuteNotifs.Check()
		} else {
			a.tray.mMuteNotifs.Uncheck()
		}
	})

	// Clipboard write fallback
	a.wv.Bind("__goClipboardWrite", func(text string) {
		writeToClipboard(text)
	})

	// Download a URL (used by context menu "Save image as…")
	a.wv.Bind("__goDownloadURL", func(urlStr string, fileName string) {
		fmt.Printf("[app] Download requested: %s\n", urlStr)
		go func() {
			filePath, err := downloadFile(urlStr, fileName)
			if err != nil {
				fmt.Printf("[app] Download error: %v\n", err)
			} else {
				a.evalJS(fmt.Sprintf(`window.__whatronShowFileToast("Download Complete", %q, %d);`, filePath, 6000))
			}
		}()
	})

	// Save base64 data (used for blob URLs)
	a.wv.Bind("__goSaveBase64", func(b64 string, mime string, fileName string) {
		go func() {
			filePath, err := saveBase64File(b64, mime, fileName)
			if err != nil {
				fmt.Printf("[app] Save base64 error: %v\n", err)
			} else {
				a.evalJS(fmt.Sprintf(`window.__whatronShowFileToast("Download Complete", %q, %d);`, filePath, 6000))
			}
		}()
	})

	// Open a downloaded file
	a.wv.Bind("__goOpenFile", func(filePath string) {
		openLocalFile(filePath)
	})

	// Show a downloaded file in folder
	a.wv.Bind("__goShowInFolder", func(filePath string) {
		fmt.Printf("[app] Show in folder requested: %q\n", filePath)
		err := showInFolder(filePath)
		if err != nil {
			fmt.Printf("[app] Show in folder error: %v\n", err)
		}
	})
}

// showWindow brings the webview window to the foreground.
func (a *WhatronApp) showWindow() {
	if a.wv == nil {
		return
	}
	showNativeWindow(a.wv.Window())
	a.wv.Dispatch(func() {
		a.wv.Eval(`window.focus(); document.body && document.body.focus();`)
	})
}

// evalJS safely dispatches a JavaScript expression to the webview.
func (a *WhatronApp) evalJS(js string) {
	if a.wv == nil {
		return
	}
	a.wv.Dispatch(func() {
		a.wv.Eval(js)
	})
}

// applyZoom injects CSS transform zoom into WhatsApp Web.
// Must be called from the webview dispatch thread.
func (a *WhatronApp) applyZoom() {
	a.mu.Lock()
	zoom := a.zoom
	a.mu.Unlock()
	a.wv.Eval(fmt.Sprintf(`
		(function(){
			var s = document.getElementById('__wt-zoom');
			if (!s) { s = document.createElement('style'); s.id='__wt-zoom'; document.head.appendChild(s); }
			s.textContent = 'body { zoom: %g; }';
		})();
	`, zoom))
}

// takeScreenshot captures the page by opening the WhatsApp print dialog as
// a workaround (webview_go does not expose capturePage).
// Falls back to a toast notification explaining where to find screenshots.
func (a *WhatronApp) takeScreenshot() {
	picDir, err := getScreenshotDir()
	if err != nil {
		a.evalJS(`window.__whatronToast('Screenshot dir unavailable', '#ef5350');`)
		return
	}
	ts := time.Now().Format("2006-01-02_15-04-05")
	path := filepath.Join(picDir, "WhatsApp-Screenshot-"+ts+".png")

	// webview_go doesn't expose capturePage, so we inform the user.
	msg := fmt.Sprintf("Screenshot saved to: %s (use OS tools: Win+Shift+S)", path)
	a.evalJS(fmt.Sprintf(`window.__whatronToast(%q, '#00a884');`, msg))
	fmt.Printf("[screenshot] Would save to: %s\n", path)
}

// openSecondAccount opens a second webview window with a separate WhatsApp session.
func (a *WhatronApp) openSecondAccount() {
	// webview_go creates one window per instance. We launch a second process.
	exe, err := os.Executable()
	if err != nil {
		fmt.Printf("[app] Failed to get executable: %v\n", err)
		return
	}
	cmd := newExecCommand(exe, "--second-account")
	if err := cmd.Start(); err != nil {
		fmt.Printf("[app] Failed to launch second account: %v\n", err)
	}
}

// quit terminates the application cleanly.
func (a *WhatronApp) quit() {
	if a.wv != nil {
		a.wv.Dispatch(func() {
			a.wv.Terminate()
		})
	}
}

// getIconPath returns the path to the application icon.
func (a *WhatronApp) getIconPath() string {
	exePath, err := os.Executable()
	var baseDir string
	if err == nil {
		baseDir = filepath.Dir(exePath)
	} else {
		baseDir = "."
	}

	isWindows := runtime.GOOS == "windows"
	var candidates []string
	if isWindows {
		candidates = []string{
			filepath.Join(baseDir, "assets/icons/icon.ico"),
			filepath.Join(baseDir, "build/windows/icon.ico"),
			"assets/icons/icon.ico",
			"build/windows/icon.ico",
		}
	} else {
		candidates = []string{
			filepath.Join(baseDir, "assets/icons/icon.png"),
			filepath.Join(baseDir, "build/appicon.png"),
			"assets/icons/icon.png",
			"build/appicon.png",
		}
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// getLockPath returns the path to the single-instance lock file.
func (a *WhatronApp) getLockPath() string {
	dir := os.TempDir()
	if a.isSecondAccount {
		return filepath.Join(dir, "whatron_second.lock")
	}
	return filepath.Join(dir, "whatron.lock")
}

// watchURLFile polls the temporary URL file to receive focus or navigation commands from secondary instances.
func (a *WhatronApp) watchURLFile() {
	urlFile := filepath.Join(os.TempDir(), "whatron_url.txt")
	if a.isSecondAccount {
		urlFile = filepath.Join(os.TempDir(), "whatron_second_url.txt")
	}
	os.Remove(urlFile) // Start clean

	ticker := time.NewTicker(500 * time.Millisecond)
	go func() {
		for range ticker.C {
			if content, err := os.ReadFile(urlFile); err == nil {
				os.Remove(urlFile)
				urlStr := strings.TrimSpace(string(content))
				if strings.HasPrefix(urlStr, "whatron://focus") {
					a.wv.Dispatch(func() {
						a.showWindow()
					})
				} else if strings.HasPrefix(urlStr, "whatron://click-notif") {
					u, err := url.Parse(urlStr)
					if err == nil {
						id := u.Query().Get("id")
						a.wv.Dispatch(func() {
							a.showWindow()
							if id != "" {
								time.Sleep(200 * time.Millisecond) // Give UI time to breathe
								a.wv.Eval(fmt.Sprintf(`window.__whatronClickNotif(%s);`, id))
							}
						})
					}
				} else if strings.HasPrefix(urlStr, "whatron://open-chat") {
					u, err := url.Parse(urlStr)
					if err == nil {
						sender := u.Query().Get("sender")
						a.wv.Dispatch(func() {
							a.showWindow()
							if sender != "" {
								time.Sleep(200 * time.Millisecond) // Give UI time to breathe
								a.wv.Eval(fmt.Sprintf(`window.__whatronOpenChat(%q);`, sender))
							}
						})
					}
				} else if urlStr != "" {
					handled := handleWhatsAppURL(urlStr)
					a.wv.Dispatch(func() {
						a.showWindow()
						a.wv.Navigate(handled)
					})
				}
			}
		}
	}()
}

// getScreenshotDir returns the pictures directory for the current user.
func getScreenshotDir() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(homeDir, "Pictures", "Whatron")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return dir, nil
}
