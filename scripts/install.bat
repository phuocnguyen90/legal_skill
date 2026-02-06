@echo off
setlocal

echo ==========================================
echo      Legal AI Assistant Installer
echo ==========================================

:: 1. Check for WSL
wsl --status >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] WSL is not installed or not working.
    echo     Please run "wsl --install" in PowerShell as Administrator and restart your computer.
    pause
    exit /b 1
)

echo [*] WSL is detected.

:: 2. Check for Ollama (Windows side)
where ollama >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Ollama is not found in PATH.
    echo     Please download and install Ollama from: https://ollama.com/download/windows
    echo     Or install via winget: winget install Ollama.Ollama
    pause
    exit /b 1
)

echo [*] Ollama is detected.

:: 3. Prepare to launch WSL script
echo [*] Launching application in WSL...
echo     (This may take a moment to install dependencies inside WSL)

:: Convert current path to WSL path
:: Basic assumption: mapped to /mnt/c/... or similar
:: Using 'wsl -e' to run the shell script
wsl -e bash ./scripts/start.sh

if %errorlevel% neq 0 (
    echo [!] Application exited with error.
    pause
)
