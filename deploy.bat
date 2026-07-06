@echo off
chcp 65001 >nul
echo.
echo ====================================
echo   🚀 Camping Gallery - Auto Deploy
echo ====================================
echo.

cd /d "G:\camping-gallery"

:: Ask for commit message
set /p MSG="📝 Pesan commit (atau Enter untuk default): "
if "%MSG%"=="" set MSG=update: minor changes

echo.
echo 📦 Menambahkan semua perubahan...
"C:\Program Files\Git\bin\git.exe" add .

echo.
echo 💾 Commit: %MSG%
"C:\Program Files\Git\bin\git.exe" commit -m "%MSG%"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ⚠️  Tidak ada perubahan untuk di-commit.
    pause
    exit /b
)

echo.
echo 🌐 Push ke GitHub...
"C:\Program Files\Git\bin\git.exe" push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Push berhasil! Vercel akan auto-deploy dalam ~1 menit.
    echo 🔗 https://camping-gallery-delta.vercel.app
    echo.
) else (
    echo.
    echo ❌ Push gagal. Cek koneksi internet.
    echo.
)

pause
