@echo off
chcp 65001 >nul
setlocal DisableDelayedExpansion
echo Please right-click this BAT and select "Run as administrator".
set "SGS_TOOLBOX_PACKAGE=%~dp0"
set "SGS_TOOLBOX_RESOURCES=%~1"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer.ps1" -Action Restore
set "SGS_TOOLBOX_EXIT=%errorlevel%"
echo.
pause
exit /b %SGS_TOOLBOX_EXIT%
