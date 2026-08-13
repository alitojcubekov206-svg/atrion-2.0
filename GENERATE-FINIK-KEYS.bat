@echo off
setlocal
cd /d "%~dp0"

del /q "finik_private.pem" 2>nul
del /q "finik_public.pem" 2>nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0generate-finik-keys.ps1"
if errorlevel 1 (
  echo.
  echo Generation failed.
  pause
  exit /b 1
)

echo.
pause
