@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-crm-agent.ps1"
set "launcher_exit=%ERRORLEVEL%"
if not "%launcher_exit%"=="0" (
  echo.
  echo CRM launcher failed. Review the message above.
  pause
  exit /b %launcher_exit%
)
echo.
echo CRM task is running in Orca. This window will close shortly.
timeout /t 4 /nobreak >nul
