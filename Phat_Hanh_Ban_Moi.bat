@echo off
echo ========================================================
echo        TOOL PHAT HANH BAN CAP NHAT MOI
echo ========================================================

echo Dang lay quyen truy cap tu Github CLI...
for /f "delims=" %%i in ('gh auth token') do set GH_TOKEN=%%i

if "%GH_TOKEN%"=="" (
    echo [LOI] Khong lay duoc Token. Vui long chay lenh 'gh auth login' trong Terminal de dang nhap lai.
    pause
    exit /b
)

echo [OK] Da ket noi Github thanh cong.
echo Dang tien hanh dong goi va tu dong day len Github Releases...
echo Vui long doi trong it phut... (Qua trinh nay phu thuoc vao toc do mang)
echo.

call npm run dist -- -p always

echo.
echo ========================================================
echo HOAN TAT! 
echo Ban cap nhat moi da duoc day len Github thanh cong.
echo Nguoi dung hien tai mo tool len se tu dong nhan duoc thong bao cap nhat!
echo ========================================================
pause
