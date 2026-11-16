@echo off
chcp 65001 >nul
setlocal DisableDelayedExpansion
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0switch-channel.ps1"
set "SWITCH_EXIT=%errorlevel%"
echo.
pause
exit /b %SWITCH_EXIT%
