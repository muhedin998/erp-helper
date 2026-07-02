@echo off
cd /d "%~dp0"

echo ==============================
echo   Building Angular...
echo ==============================
call npx ng build
if %errorlevel% neq 0 (
    echo BUILD FAILED
    pause
    exit /b 1
)

echo.
echo ==============================
echo   Syncing Capacitor...
echo ==============================
call npx cap sync android
if %errorlevel% neq 0 (
    echo SYNC FAILED
    pause
    exit /b 1
)

echo.
echo ==============================
echo   Building Debug APK...
echo ==============================
cd android
call gradlew.bat assembleDebug
if %errorlevel% neq 0 (
    echo APK BUILD FAILED
    pause
    exit /b 1
)
cd ..

echo.
echo ==============================
echo   DONE!
echo ==============================
echo APK: android\app\build\outputs\apk\debug\app-debug.apk
echo.
pause
