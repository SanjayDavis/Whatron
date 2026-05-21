$ErrorActionPreference = "Stop"

Write-Host "=> Welcome to Whatron Windows Installer" -ForegroundColor Cyan

# Check for git
if (!(Get-Command "git" -ErrorAction SilentlyContinue)) {
    Write-Error "Git is not installed. Please install Git and try again."
    exit 1
}

# Check for go
if (!(Get-Command "go" -ErrorAction SilentlyContinue)) {
    Write-Error "Go is not installed. Please install Go and try again."
    exit 1
}

# Check for gcc (required for CGO / webview_go on Windows)
if (!(Get-Command "gcc" -ErrorAction SilentlyContinue)) {
    Write-Warning "gcc is not in PATH. Webview requires a C compiler (like MSYS2 mingw-w64). The build step might fail."
}

# Clone the repository
$InstallDir = Join-Path $env:TEMP "WhatronSrc"
if (Test-Path $InstallDir) {
    Remove-Item -Recurse -Force $InstallDir
}

Write-Host "=> Cloning repository..."
git clone https://github.com/SanjayDavis/Whatron.git $InstallDir
Set-Location $InstallDir

Write-Host "=> Building Whatron..."
if (Test-Path "build.ps1") {
    .\build.ps1
} else {
    $env:CGO_ENABLED = "1"
    go build -ldflags "-H=windowsgui" -o Whatron.exe .
}

Write-Host "=> Installing Whatron..."
$AppDir = Join-Path $env:LOCALAPPDATA "Whatron"
if (!(Test-Path $AppDir)) {
    New-Item -ItemType Directory -Path $AppDir | Out-Null
}

$ExeDest = Join-Path $AppDir "Whatron.exe"
if (Test-Path "build\bin\Whatron.exe") {
    Copy-Item "build\bin\Whatron.exe" -Destination $ExeDest -Force
} elseif (Test-Path "Whatron.exe") {
    Copy-Item "Whatron.exe" -Destination $ExeDest -Force
} else {
    Write-Error "Could not find built Whatron.exe"
    exit 1
}

# Create Desktop Shortcut
Write-Host "=> Creating Desktop Shortcut..."
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Whatron.lnk")
$Shortcut.TargetPath = $ExeDest
$Shortcut.WorkingDirectory = $AppDir
$Shortcut.Description = "Whatron - WhatsApp Web Client"
if (Test-Path "assets\icons\icon.ico") {
    $Shortcut.IconLocation = "$AppDir\icon.ico"
    Copy-Item "assets\icons\icon.ico" -Destination "$AppDir\icon.ico" -Force
}
$Shortcut.Save()

Write-Host "=> Installation Complete!" -ForegroundColor Green
Write-Host "=> You can launch Whatron from your Desktop."
