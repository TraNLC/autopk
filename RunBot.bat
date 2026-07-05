@echo off
title VLTK Auto Tong Kim Runner
echo =================================================
echo   VLTK1 Mobile - Auto Tong Kim Runner
echo =================================================
echo.

echo [1/2] Building Frida agent (safe mode)...
call npm run build:frida

echo.
echo [2/2] Starting Electron GUI...
echo =================================================
echo   GUI started! Close window to terminate.
echo =================================================
echo.
call npm start

pause
