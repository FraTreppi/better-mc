@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
if exist "%LOCALAPPDATA%\MC-Code-Tools\fnm\aliases\default\node.exe" set "PATH=%LOCALAPPDATA%\MC-Code-Tools\fnm\aliases\default;%PATH%"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js non trovato. Installa Node.js 24.15 o successivo e riapri questo file.
  goto fine
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>24||a===24&&b>=15?0:1)"
if errorlevel 1 (
  echo Serve Node.js 24.15 o successivo.
  goto fine
)
set "NODE_USE_ENV_PROXY=1"
set "NODE_USE_SYSTEM_CA=1"
if not exist node_modules (
  call npm.cmd ci --ignore-scripts
  if errorlevel 1 goto fine
)
node configure.mjs
:fine
pause
