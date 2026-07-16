@echo off
title GST Auto PK Runner
echo =================================================
echo   GST Auto PK - VLTK1 Mobile Automation Runner
echo =================================================
echo.

set "ADB=C:\platform-tools\adb.exe"
where adb >nul 2>&1
if %errorlevel% equ 0 (
    for /f "delims=" %%i in ('where adb') do (
        set "ADB=%%i"
        goto :found
    )
)
if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
    set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
    goto :found
)
if exist "%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe" (
    set "ADB=%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe"
    goto :found
)
if exist "C:\platform-tools\adb.exe" (
    set "ADB=C:\platform-tools\adb.exe"
    goto :found
)
if exist "D:\platform-tools\adb.exe" (
    set "ADB=D:\platform-tools\adb.exe"
    goto :found
)
if exist "C:\LDPlayer\LDPlayer9\adb.exe" (
    set "ADB=C:\LDPlayer\LDPlayer9\adb.exe"
    goto :found
)
if exist "D:\LDPlayer\LDPlayer9\adb.exe" (
    set "ADB=D:\LDPlayer\LDPlayer9\adb.exe"
    goto :found
)
if exist "C:\ChangZhi\LDPlayer9\adb.exe" (
    set "ADB=C:\ChangZhi\LDPlayer9\adb.exe"
    goto :found
)
if exist "D:\ChangZhi\LDPlayer9\adb.exe" (
    set "ADB=D:\ChangZhi\LDPlayer9\adb.exe"
    goto :found
)

:found
echo [ADB] Using auto-detected ADB path: %ADB%

echo [1/3] Connecting to Android Emulator (127.0.0.1:16416)...
"%ADB%" connect 127.0.0.1:16416
timeout /t 3 /nobreak >nul

echo.
echo [2/3] Setting up Frida port forwarding...
"%ADB%" -s emulator-5556 forward tcp:27042 tcp:27042
if %errorlevel% neq 0 (
    echo.
    echo [WARNING] Fallback connection target - 127.0.0.1:16416...
    "%ADB%" -s 127.0.0.1:16416 forward tcp:27042 tcp:27042
)

echo.
echo [3/3] Building Safe Mode Frida agent...
call npm run build:frida

echo.
echo =================================================
echo   Bot started! Press Ctrl+C to terminate bot loop.
echo =================================================
echo.
call npm start

pause
