@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "FNM_DIR=%LOCALAPPDATA%\MC-Code-Tools\fnm"
if not exist "%FNM_DIR%\fnm.exe" (
  echo Prima esegui INSTALLA.cmd.
  pause
  exit /b 1
)
set "PATH=%FNM_DIR%;%PATH%"
powershell.exe -STA -NoExit -Command "$ErrorActionPreference='Stop'; fnm env --shell powershell | Out-String | Invoke-Expression; if ($LASTEXITCODE -ne 0) { throw 'Inizializzazione fnm non riuscita.' }; fnm use default; if ($LASTEXITCODE -ne 0) { throw 'Attivazione Node non riuscita.' }; fnm --version; node --version; npm.cmd --version; Add-Type -AssemblyName System.Windows.Forms; $picker=New-Object System.Windows.Forms.FolderBrowserDialog; $picker.Description='Seleziona MC-Progetto, MC-Demo oppure la cartella Strumento (con bin e lib)'; $picker.SelectedPath=[Environment]::GetFolderPath('MyDocuments'); $picker.ShowNewFolderButton=$false; try { $selection=$picker.ShowDialog(); if ($selection -ne [Windows.Forms.DialogResult]::OK) { Write-Host 'Apertura annullata.'; exit 0 }; $folder=[IO.Path]::GetFullPath($picker.SelectedPath).TrimEnd([IO.Path]::DirectorySeparatorChar) } finally { $picker.Dispose() }; $windows=[IO.Path]::GetFullPath($env:WINDIR).TrimEnd([IO.Path]::DirectorySeparatorChar); if ($folder -ieq $windows -or $folder.StartsWith($windows+'\',[StringComparison]::OrdinalIgnoreCase) -or $folder -ieq [IO.Path]::GetPathRoot($folder).TrimEnd([IO.Path]::DirectorySeparatorChar)) { throw 'Seleziona una cartella di progetto nella tua utenza.' }; Set-Location -LiteralPath $folder; Write-Host ''; Write-Host ('Terminale Node pronto nella cartella: '+$folder); if (Get-Command code.cmd -ErrorAction SilentlyContinue) { & code.cmd --new-window $folder; if ($LASTEXITCODE -ne 0) { throw 'Apertura VS Code non riuscita.' } } else { Write-Host 'Apri VS Code e scegli File > Open Folder, usando la cartella appena selezionata.' }"
