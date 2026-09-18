@echo off
setlocal EnableExtensions
set "REPO=%~dp0"
cd /d "%REPO%" || exit /b 1

if "%~1"=="" (
  echo EVAVO_TWO_STAGE_BLOCKER: execution packet path is required. 1>&2
  exit /b 2
)
set "PACKET=%~1"
if not exist "%PACKET%" (
  echo EVAVO_TWO_STAGE_BLOCKER: execution packet not found: "%PACKET%" 1>&2
  exit /b 3
)

where pnpm.cmd >nul 2>nul
if errorlevel 1 (
  echo EVAVO_TWO_STAGE_BLOCKER: pnpm.cmd is unavailable. 1>&2
  exit /b 4
)
where node.exe >nul 2>nul
if errorlevel 1 (
  echo EVAVO_TWO_STAGE_BLOCKER: node.exe is unavailable. 1>&2
  exit /b 5
)

call pnpm.cmd run build:domain
if errorlevel 1 (
  echo EVAVO_TWO_STAGE_BLOCKER: Art Studio domain build failed. 1>&2
  exit /b 6
)
call pnpm.cmd --filter @evavo/art-studio-worker build
if errorlevel 1 (
  echo EVAVO_TWO_STAGE_BLOCKER: Art Studio worker build failed. 1>&2
  exit /b 7
)

node "%REPO%scripts\run-local-two-stage-animation-packet.mjs" --packet "%PACKET%"
exit /b %ERRORLEVEL%
