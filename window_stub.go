//go:build !windows

package main

import (
	"os/exec"
	"unsafe"
)

func initNativeWindow(hwndPtr unsafe.Pointer) {}
func showNativeWindow(hwndPtr unsafe.Pointer) {}
func hideNativeWindow(hwndPtr unsafe.Pointer) {}
func hideCommandWindow(cmd *exec.Cmd)         {}
