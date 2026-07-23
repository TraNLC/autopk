@echo off
title GST Auto PK UI Runner
echo =================================================
echo   GST Auto PK - UI Launcher (Local Environment)
echo =================================================
echo.
echo [1/2] Stopping existing GUI instances...
taskkill /f /im "electron.exe" >nul 2>&1
taskkill /f /im "GST Auto PK.exe" >nul 2>&1
taskkill /f /im "GST Auto PK 1.0.1.exe" >nul 2>&1

echo [2/2] Launching GUI with local Electron runtime...
cd /d "%~dp0"
start "" npm run gui
echo Launching completed! You can close this command window.
exit
