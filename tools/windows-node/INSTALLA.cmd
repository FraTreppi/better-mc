@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Node e fnm - installazione nella propria utenza
echo Installazione per Windows x64, nella cartella della tua utenza.
echo fnm 1.39.0 e Node.js 24.22.2. Download dai siti ufficiali.
echo Il download di Node occupa circa 38 MB. Attendi il completamento.
echo.
set "FNM_DIR=%LOCALAPPDATA%\MC-Code-Tools\fnm"
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; $arch=$env:PROCESSOR_ARCHITEW6432; if (!$arch) { $arch=$env:PROCESSOR_ARCHITECTURE }; if ($arch -ne 'AMD64') { throw 'Questo pacchetto richiede Windows x64.' }; $old=[Environment]::GetEnvironmentVariable('FNM_DIR','User'); if ($old -and $old.TrimEnd('\') -ine $env:FNM_DIR) { throw ('Esiste gia un FNM_DIR diverso: '+$old+'. Configurazione conservata; installazione interrotta.') }; $tmp=Join-Path ([IO.Path]::GetTempPath()) ('mc-node-setup-'+[Guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Path $tmp -Force | Out-Null; try { [Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; $downloads=@(@('https://github.com/Schniz/fnm/releases/download/v1.39.0/fnm-windows.zip','fnm.zip','8183BED4348CB78FDFD8ABB3D1247FBEAB7B2082F941363929C61E747C001E10'),@('https://nodejs.org/dist/v24.22.2/node-v24.22.2-win-x64.zip','node.zip','CA1BFF5D8EAD13C9F2EA404A176DB46BD430704D5B5113734049FA365E7799E2')); foreach ($item in $downloads) { $file=Join-Path $tmp $item[1]; Write-Host ('Download '+$item[1]); Invoke-WebRequest -UseBasicParsing -Uri $item[0] -OutFile $file; if ((Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash -ne $item[2]) { throw ('SHA256 non corrispondente: '+$item[1]) } }; Expand-Archive -LiteralPath (Join-Path $tmp 'fnm.zip') -DestinationPath (Join-Path $tmp 'fnm'); $dest=Join-Path $env:FNM_DIR 'node-versions\v24.22.2\installation'; if (Test-Path -LiteralPath $dest) { $node=Join-Path $dest 'node.exe'; if (!(Test-Path -LiteralPath $node)) { throw 'La cartella Node esistente e incompleta. Nessun file esistente viene eliminato.' }; $version= & $node --version; if ($LASTEXITCODE -ne 0 -or $version -ne 'v24.22.2' -or !(Test-Path -LiteralPath (Join-Path $dest 'npm.cmd'))) { throw 'La cartella Node esistente non corrisponde alla versione richiesta.' } } else { Expand-Archive -LiteralPath (Join-Path $tmp 'node.zip') -DestinationPath (Join-Path $tmp 'node'); New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null; Move-Item -LiteralPath (Join-Path $tmp 'node\node-v24.22.2-win-x64') -Destination $dest }; New-Item -ItemType Directory -Path $env:FNM_DIR -Force | Out-Null; Copy-Item -LiteralPath (Join-Path $tmp 'fnm\fnm.exe') -Destination (Join-Path $env:FNM_DIR 'fnm.exe') -Force; Write-Host ('File installati in '+$env:FNM_DIR) } finally { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }"
if errorlevel 1 goto errore
"%FNM_DIR%\fnm.exe" default 24.22.2
if errorlevel 1 goto errore
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; $oldFnm=[Environment]::GetEnvironmentVariable('FNM_DIR','User'); $add=@($env:FNM_DIR,(Join-Path $env:FNM_DIR 'aliases\default')); $previous=[Environment]::GetEnvironmentVariable('Path','User'); $base=Join-Path $env:LOCALAPPDATA 'MC-Code-Tools'; New-Item -ItemType Directory -Path $base -Force | Out-Null; $backup=Join-Path $base 'ambiente-prima-installazione.json'; if (!(Test-Path -LiteralPath $backup)) { @{ Path=$previous; FNM_DIR=$oldFnm } | ConvertTo-Json | Set-Content -LiteralPath $backup -Encoding UTF8 }; $parts=@($previous -split ';' | Where-Object { $_ -and ($add -inotcontains $_.TrimEnd('\')) }); [Environment]::SetEnvironmentVariable('FNM_DIR',$env:FNM_DIR,'User'); [Environment]::SetEnvironmentVariable('Path',(($add+$parts) -join ';'),'User'); Write-Host 'FNM_DIR e PATH utente configurati. Il PATH di sistema resta invariato.'"
if errorlevel 1 goto errore
"%FNM_DIR%\fnm.exe" --version
if errorlevel 1 goto errore
"%FNM_DIR%\aliases\default\node.exe" --version
if errorlevel 1 goto errore
call "%FNM_DIR%\aliases\default\npm.cmd" --version
if errorlevel 1 goto errore
echo.
echo Installazione completata. Chiudi completamente Visual Studio Code.
echo Apri Apri-terminale-Node.cmd e segui il file LEGGIMI.txt.
pause
exit /b 0
:errore
echo.
echo Installazione non completata. Leggi il messaggio precedente.
echo Se un controllo aziendale blocca il comando, chiedi assistenza IT.
echo Nessuna impostazione di sicurezza o ExecutionPolicy e stata modificata.
pause
exit /b 1
