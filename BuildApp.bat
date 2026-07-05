@echo off
title Build VLTK Auto Tong Kim App
echo =================================================
echo   Build VLTK Auto Tong Kim - Portable .exe
echo =================================================
echo.

echo [1/4] Installing electron-builder...
call npm install electron-builder --save-dev
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install electron-builder!
    pause
    exit /b 1
)

echo.
echo [2/4] Building Frida agent...
call npm run build:frida
if %errorlevel% neq 0 (
    echo [ERROR] Failed to build Frida agent!
    pause
    exit /b 1
)

echo.
echo [3/4] Building portable .exe (this may take a few minutes)...
call npm run dist
if %errorlevel% neq 0 (
    echo [ERROR] Build failed!
    pause
    exit /b 1
)

echo.
echo [4/4] Build complete!
echo =================================================
echo   Output: dist\VLTK Auto Tong Kim *.exe
echo   Copy this .exe + tools\ folder to any PC.
echo   Requires: ADB (C:\platform-tools\adb.exe)
echo =================================================
echo.
dir dist\*.exe 2>nul
echo.
pause
