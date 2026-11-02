@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "FNM_DIR=%LOCALAPPDATA%\MC-Code-Tools\fnm"
if not exist "%FNM_DIR%\fnm.exe" (
  echo Prima esegui INSTALLA.cmd.
  pause
  exit /b 1
)
set "PATH=%FNM_DIR%;%PATH%"
powershell.exe -NoExit -Command "$ErrorActionPreference='Stop'; fnm env --shell powershell | Out-String | Invoke-Expression; if ($LASTEXITCODE -ne 0) { throw 'Inizializzazione fnm non riuscita.' }; fnm use default; if ($LASTEXITCODE -ne 0) { throw 'Attivazione Node non riuscita.' }; fnm --version; node --version; npm.cmd --version; Write-Host ''; Write-Host 'Terminale pronto: fnm e Node sono attivi in questa utenza.'; Write-Host 'Per aprire il progetto: code.cmd seguito dal percorso della cartella tra virgolette.'"
