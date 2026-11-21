@echo off
chcp 65001 >nul
setlocal DisableDelayedExpansion
echo Please right-click this BAT and select "Run as administrator".
echo SGS OL Toolbox - Microclient Lite / Full Installer
echo Remove all unknown scripts and restore the official client before installing.
echo Disabling or hiding scripts is insufficient. Residual scripts block installation.
echo Exit the client completely, including the system tray, before continuing.
echo.
set "SGS_TOOLBOX_PACKAGE=%~dp0"
set "SGS_TOOLBOX_RESOURCES=%~1"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer.ps1" -Action Manage
set "SGS_TOOLBOX_EXIT=%errorlevel%"
echo.
pause
exit /b %SGS_TOOLBOX_EXIT%
