@echo off
setlocal
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"
set PORT=8765
set HOST=127.0.0.1
set VTECH_AUTH_DISABLED=1
set VTECH_CLOUD_MODE=0
set "VTECH_DATA_DIR=%APP_DIR%data"
set "VTECH_OUTPUT_DIR=%APP_DIR%outputs"

echo Apro V-Tech Trasporti aggiornato.
echo Uso dati da: %VTECH_DATA_DIR%
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
    taskkill /PID %%a /F >nul 2>nul
)
timeout /t 1 /nobreak >nul

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 "%APP_DIR%vtech_web.py" --host %HOST% --port %PORT%
) else (
    python "%APP_DIR%vtech_web.py" --host %HOST% --port %PORT%
)

pause
