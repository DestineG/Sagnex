@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sagnex.ps1" %*
exit /b %errorlevel%
