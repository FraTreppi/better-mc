@echo off
setlocal EnableExtensions DisableDelayedExpansion
title MC Code Project - crea e apri il progetto
set "MC_PROJECT_TARGET=%USERPROFILE%\MC-Progetto"
set "MC_PROJECT_NODE=node.exe"
if exist "%LOCALAPPDATA%\MC-Code-Tools\fnm\aliases\default\node.exe" (
  set "MC_PROJECT_NODE=%LOCALAPPDATA%\MC-Code-Tools\fnm\aliases\default\node.exe"
  set "FNM_DIR=%LOCALAPPDATA%\MC-Code-Tools\fnm"
  set "PATH=%LOCALAPPDATA%\MC-Code-Tools\fnm\aliases\default;%LOCALAPPDATA%\MC-Code-Tools\fnm;%PATH%"
)
if not exist "%~dp0bin\mc-project.mjs" (
  echo Estrai tutto lo ZIP prima di aprire CREA-PROGETTO.cmd.
  pause
  exit /b 1
)
"%MC_PROJECT_NODE%" --version
if errorlevel 1 (
  echo Node non disponibile. Completa prima l'installazione di Node.
  pause
  exit /b 1
)
if exist "%MC_PROJECT_TARGET%\sfmc-project.json" goto apri
"%MC_PROJECT_NODE%" "%~dp0bin\mc-project.mjs" init "%MC_PROJECT_TARGET%"
if errorlevel 1 (
  echo Creazione non completata. Leggi il messaggio precedente.
  echo Una cartella gia esistente e non vuota viene conservata.
  pause
  exit /b 1
)
:apri
cd /d "%MC_PROJECT_TARGET%"
if errorlevel 1 exit /b 1
echo Progetto pronto in "%MC_PROJECT_TARGET%".
where code.cmd >nul 2>nul
if errorlevel 1 (
  start "" "%MC_PROJECT_TARGET%"
  echo In VS Code scegli File - Open Folder e seleziona questa cartella.
) else (
  echo Per usare il nuovo ambiente Node, chiudi prima eventuali vecchie finestre di VS Code.
  call code.cmd --new-window "%MC_PROJECT_TARGET%"
)
pause
