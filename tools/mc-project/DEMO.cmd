@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Installa Node.js 24 prima di avviare la demo.
  pause
  exit /b 1
)
node bin\mc-project.mjs demo ..\MC-Demo
if errorlevel 1 (
  pause
  exit /b 1
)
start "" "..\MC-Demo"
pause
