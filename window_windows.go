package main

import (
	"os/exec"
	"syscall"
	"unsafe"
)

var (
	user32                  = syscall.NewLazyDLL("user32.dll")
	kernel32                = syscall.NewLazyDLL("kernel32.dll")
	procShowWindow          = user32.NewProc("ShowWindow")
	procSetWindowLongPtr    = user32.NewProc("SetWindowLongPtrW")
	procCallWindowProc      = user32.NewProc("CallWindowProcW")
	procSendMessage         = user32.NewProc("SendMessageW")
	procLoadIcon            = user32.NewProc("LoadIconW")
	procGetModuleHandle     = kernel32.NewProc("GetModuleHandleW")
	procSetForegroundWindow = user32.NewProc("SetForegroundWindow")
)

const (
	SW_HIDE       = 0
	SW_SHOW       = 5
	SW_RESTORE    = 9
	GWLP_WNDPROC  = ^uintptr(3) // -4
	WM_SYSCOMMAND = 0x0112
	SC_CLOSE      = 0xF060
	WM_CLOSE      = 0x0010
	WM_SETICON    = 0x0080
	ICON_SMALL    = 0
	ICON_BIG      = 1
)

var oldWndProc uintptr

func wndProc(hwnd syscall.Handle, msg uint32, wParam, lParam uintptr) uintptr {
	if msg == WM_SYSCOMMAND && wParam == SC_CLOSE {
		procShowWindow.Call(uintptr(hwnd), SW_HIDE)
		return 0
	}
	if msg == WM_CLOSE {
		procShowWindow.Call(uintptr(hwnd), SW_HIDE)
		return 0
	}
	ret, _, _ := procCallWindowProc.Call(oldWndProc, uintptr(hwnd), uintptr(msg), wParam, lParam)
	return ret
}

func initNativeWindow(hwndPtr unsafe.Pointer) {
	hwnd := syscall.Handle(uintptr(hwndPtr))

	// Load the embedded icon (ID 1 from resource.rc)
	hMod, _, _ := procGetModuleHandle.Call(0)
	hIcon, _, _ := procLoadIcon.Call(hMod, 1)

	if hIcon != 0 {
		// Set taskbar and window icons
		procSendMessage.Call(uintptr(hwnd), WM_SETICON, ICON_SMALL, hIcon)
		procSendMessage.Call(uintptr(hwnd), WM_SETICON, ICON_BIG, hIcon)
	}

	// Subclass the window to intercept close
	cb := syscall.NewCallback(wndProc)
	old, _, _ := procSetWindowLongPtr.Call(uintptr(hwnd), GWLP_WNDPROC, cb)
	if old != 0 {
		oldWndProc = old
	}
}

func showNativeWindow(hwndPtr unsafe.Pointer) {
	hwnd := uintptr(hwndPtr)
	procShowWindow.Call(hwnd, SW_RESTORE)
	procShowWindow.Call(hwnd, SW_SHOW)
	procSetForegroundWindow.Call(hwnd)
}

func hideNativeWindow(hwndPtr unsafe.Pointer) {
	hwnd := uintptr(hwndPtr)
	procShowWindow.Call(hwnd, SW_HIDE)
}

func hideCommandWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
}
