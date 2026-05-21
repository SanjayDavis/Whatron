package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	stdruntime "runtime"
	"sync"
)

// Config holds all persistent application settings.
type Config struct {
	Zoom               float64 `json:"zoom"`
	Theme              string  `json:"theme"`
	NotificationsMuted bool    `json:"notifications_muted"`
	AlwaysOnTop        bool    `json:"always_on_top"`
	AutoLaunch         bool    `json:"auto_launch"`
	SpellCheck         bool    `json:"spell_check"`
	BatterySaver       bool    `json:"battery_saver"`
	WindowWidth        int     `json:"window_width"`
	WindowHeight       int     `json:"window_height"`
}

// ConfigStore provides thread-safe access to persistent configuration.
type ConfigStore struct {
	mu       sync.RWMutex
	config   Config
	filePath string
}

// NewConfigStore creates a new config store, loading from disk if available.
func NewConfigStore() *ConfigStore {
	cs := &ConfigStore{
		config: Config{
			Zoom:         1.0,
			Theme:        "dark",
			SpellCheck:   true,
			WindowWidth:  1000,
			WindowHeight: 800,
		},
	}
	cs.filePath = cs.getConfigPath()
	cs.load()
	return cs
}

func (cs *ConfigStore) getConfigPath() string {
	var dir string
	switch stdruntime.GOOS {
	case "windows":
		appData := os.Getenv("APPDATA")
		if appData == "" {
			appData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Roaming")
		}
		dir = filepath.Join(appData, "Whatron")
	case "linux", "darwin":
		homeDir, err := os.UserHomeDir()
		if err != nil {
			dir = filepath.Join("/tmp", "whatron")
		} else {
			dir = filepath.Join(homeDir, ".config", "whatron")
		}
	default:
		dir = filepath.Join(os.TempDir(), "whatron")
	}
	return filepath.Join(dir, "config.json")
}

func (cs *ConfigStore) load() {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	data, err := os.ReadFile(cs.filePath)
	if err != nil {
		return // Use defaults
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		fmt.Printf("[config] Failed to parse config: %v\n", err)
		return
	}

	// Apply loaded values, keeping defaults for zero values where appropriate
	if cfg.Zoom > 0 {
		cs.config.Zoom = cfg.Zoom
	}
	if cfg.Theme != "" {
		cs.config.Theme = cfg.Theme
	}
	if cfg.WindowWidth > 0 {
		cs.config.WindowWidth = cfg.WindowWidth
	}
	if cfg.WindowHeight > 0 {
		cs.config.WindowHeight = cfg.WindowHeight
	}
	cs.config.NotificationsMuted = cfg.NotificationsMuted
	cs.config.AlwaysOnTop = cfg.AlwaysOnTop
	cs.config.AutoLaunch = cfg.AutoLaunch
	cs.config.SpellCheck = cfg.SpellCheck
	cs.config.BatterySaver = cfg.BatterySaver
}

func (cs *ConfigStore) save() error {
	dir := filepath.Dir(cs.filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := json.MarshalIndent(cs.config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	return os.WriteFile(cs.filePath, data, 0644)
}

// Get returns a copy of the current config.
func (cs *ConfigStore) Get() Config {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	return cs.config
}

// Set updates the config and persists it to disk.
func (cs *ConfigStore) Set(fn func(*Config)) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	fn(&cs.config)
	if err := cs.save(); err != nil {
		fmt.Printf("[config] Failed to save: %v\n", err)
	}
}

// GetZoom returns the current zoom level.
func (cs *ConfigStore) GetZoom() float64 {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	return cs.config.Zoom
}

// SetZoom updates and persists the zoom level.
func (cs *ConfigStore) SetZoom(zoom float64) {
	cs.Set(func(c *Config) { c.Zoom = zoom })
}

// GetTheme returns the current theme name.
func (cs *ConfigStore) GetTheme() string {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	return cs.config.Theme
}

// SetTheme updates and persists the theme.
func (cs *ConfigStore) SetTheme(theme string) {
	cs.Set(func(c *Config) { c.Theme = theme })
}

// GetNotificationsMuted returns the mute state.
func (cs *ConfigStore) GetNotificationsMuted() bool {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	return cs.config.NotificationsMuted
}

// SetNotificationsMuted updates and persists the mute state.
func (cs *ConfigStore) SetNotificationsMuted(muted bool) {
	cs.Set(func(c *Config) { c.NotificationsMuted = muted })
}

// GetAlwaysOnTop returns the always-on-top state.
func (cs *ConfigStore) GetAlwaysOnTop() bool {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	return cs.config.AlwaysOnTop
}

// SetAlwaysOnTop updates and persists the always-on-top state.
func (cs *ConfigStore) SetAlwaysOnTop(onTop bool) {
	cs.Set(func(c *Config) { c.AlwaysOnTop = onTop })
}
