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
