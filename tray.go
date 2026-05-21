package main

import (
	"fmt"
	"runtime"

	"github.com/energye/systray"
)

// TrayManager handles the system tray icon and menu.
type TrayManager struct {
	app *WhatronApp

	mShow          *systray.MenuItem
	mAlwaysOnTop   *systray.MenuItem
	mMuteNotifs    *systray.MenuItem
	mBatterySaver  *systray.MenuItem
	mAutoLaunch    *systray.MenuItem
	mTheme         *systray.MenuItem
	mThemeClassic  *systray.MenuItem
	mThemeDark     *systray.MenuItem
	mSpellCheck    *systray.MenuItem
	mScreenshot    *systray.MenuItem
	mSecondAccount *systray.MenuItem
	mQuit          *systray.MenuItem
}

// NewTrayManager creates a new tray manager.
func NewTrayManager(app *WhatronApp) *TrayManager {
	return &TrayManager{app: app}
}

// OnReady is called when the systray is ready.
func (tm *TrayManager) OnReady() {
	// Set tray icon from embedded bytes
	var iconData []byte
	if runtime.GOOS == "windows" {
		iconData = embeddedIconICO
	} else {
		iconData = embeddedIconPNG
	}
	if len(iconData) > 0 {
		systray.SetIcon(iconData)
	} else {
		fmt.Println("[tray] WARNING: No embedded icon data available")
	}

	systray.SetTitle("Whatron")
	systray.SetTooltip("Whatron - WhatsApp Desktop")
	systray.SetOnClick(func(menu systray.IMenu) {
		tm.app.showWindow()
	})
	systray.SetOnRClick(func(menu systray.IMenu) {
		menu.ShowMenu()
	})

	// Menu items
	tm.mShow = systray.AddMenuItem("Show Whatron", "Show the main window")
	systray.AddSeparator()

	tm.mAlwaysOnTop = systray.AddMenuItemCheckbox(
		"Always on Top",
		"Keep window on top of others",
		tm.app.config.GetAlwaysOnTop(),
	)

	tm.mMuteNotifs = systray.AddMenuItemCheckbox(
		"Mute Notifications",
		"Mute/unmute desktop notifications",
		tm.app.config.GetNotificationsMuted(),
	)

	tm.mBatterySaver = systray.AddMenuItemCheckbox(
		"Battery Saver",
		"Reduce frame rate to save battery",
		tm.app.config.Get().BatterySaver,
	)

	systray.AddSeparator()

	tm.mAutoLaunch = systray.AddMenuItemCheckbox(
		"Auto-launch on Startup",
		"Start Whatron when you log in",
		tm.app.config.Get().AutoLaunch,
	)

	mTheme := systray.AddMenuItem("Theme", "Change application theme")
	tm.mThemeClassic = mTheme.AddSubMenuItemCheckbox("Classic", "Classic WhatsApp theme", tm.app.config.GetTheme() == "classic")
	tm.mThemeDark = mTheme.AddSubMenuItemCheckbox("Dark", "Dark theme", tm.app.config.GetTheme() == "dark")

	tm.mSpellCheck = systray.AddMenuItemCheckbox(
		"Spell Checker",
		"Enable/disable spell checking",
		tm.app.config.Get().SpellCheck,
	)

	systray.AddSeparator()

	tm.mScreenshot = systray.AddMenuItem("Take Screenshot", "Capture screen (Ctrl+Shift+S)")
	tm.mSecondAccount = systray.AddMenuItem("Open Second Account", "Open a second WhatsApp session")

	systray.AddSeparator()

	tm.mQuit = systray.AddMenuItem("Quit", "Quit Whatron")

	// Handle clicks in a goroutine
	// Register clicks
	tm.registerClicks()

	// Signal that tray is ready
	tm.app.onTrayReady()
}

// OnExit is called when the systray is exiting.
func (tm *TrayManager) OnExit() {
	fmt.Println("[tray] Exiting")
}

func (tm *TrayManager) registerClicks() {
	tm.mShow.Click(func() {
		tm.app.showWindow()
	})

	tm.mAlwaysOnTop.Click(func() {
		checked := tm.mAlwaysOnTop.Checked()
		newState := !checked
		if newState {
			tm.mAlwaysOnTop.Check()
		} else {
			tm.mAlwaysOnTop.Uncheck()
		}
		tm.app.config.SetAlwaysOnTop(newState)
	})

	tm.mMuteNotifs.Click(func() {
		checked := tm.mMuteNotifs.Checked()
		newState := !checked
		if newState {
			tm.mMuteNotifs.Check()
		} else {
			tm.mMuteNotifs.Uncheck()
		}
		tm.app.config.SetNotificationsMuted(newState)
		tm.app.evalJS(fmt.Sprintf("window.__whatronSetMuted(%v);", newState))
	})

	tm.mBatterySaver.Click(func() {
		checked := tm.mBatterySaver.Checked()
		newState := !checked
		if newState {
			tm.mBatterySaver.Check()
		} else {
			tm.mBatterySaver.Uncheck()
		}
		tm.app.config.Set(func(c *Config) { c.BatterySaver = newState })
	})

	tm.mAutoLaunch.Click(func() {
		checked := tm.mAutoLaunch.Checked()
		newState := !checked
		if newState {
			tm.mAutoLaunch.Check()
		} else {
			tm.mAutoLaunch.Uncheck()
		}
		tm.app.config.Set(func(c *Config) { c.AutoLaunch = newState })
		if newState {
			enableAutoLaunch()
		} else {
			disableAutoLaunch()
		}
	})

	tm.mThemeClassic.Click(func() {
		tm.app.config.SetTheme("classic")
		tm.app.evalJS(`window.__whatronApplyTheme("classic");`)
		tm.updateThemeCheckboxes("classic")
	})

	tm.mThemeDark.Click(func() {
		tm.app.config.SetTheme("dark")
		tm.app.evalJS(`window.__whatronApplyTheme("dark");`)
		tm.updateThemeCheckboxes("dark")
	})

	tm.mSpellCheck.Click(func() {
		checked := tm.mSpellCheck.Checked()
		newState := !checked
		if newState {
			tm.mSpellCheck.Check()
		} else {
			tm.mSpellCheck.Uncheck()
		}
		tm.app.config.Set(func(c *Config) { c.SpellCheck = newState })
		tm.app.evalJS(fmt.Sprintf("document.body.spellcheck = %v;", newState))
	})

	tm.mScreenshot.Click(func() {
		tm.app.takeScreenshot()
	})

	tm.mSecondAccount.Click(func() {
		tm.app.openSecondAccount()
	})

	tm.mQuit.Click(func() {
		tm.app.quit()
	})
}

// UpdateTooltip updates the tray tooltip with unread count.
func (tm *TrayManager) UpdateTooltip(count int, isOnline bool) {
	tooltip := "Whatron"
	if !isOnline {
		tooltip += " - OFFLINE"
	} else if count > 0 {
		tooltip += fmt.Sprintf(" - %d unread message(s)", count)
	}
	systray.SetTooltip(tooltip)
}

func (tm *TrayManager) updateThemeCheckboxes(theme string) {
	tm.mThemeClassic.Uncheck()
	tm.mThemeDark.Uncheck()
	switch theme {
	case "classic":
		tm.mThemeClassic.Check()
	case "dark":
		tm.mThemeDark.Check()
	}
}
