@echo off
chcp 65001 >nul
echo Запуск обработчика выписок...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Rename-Zips.ps1"
echo.
pause