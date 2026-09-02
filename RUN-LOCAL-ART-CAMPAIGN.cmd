@echo off
setlocal EnableExtensions
set "REPO=%~dp0"
cd /d "%REPO%" || exit /b 1

if "%~1"=="" (
  set "MANIFEST=%REPO%examples\local-generation-campaign.lorna.json"
) else (
  set "MANIFEST=%~1"
)

if not exist "%MANIFEST%" (
  echo EVAVO_ART_CAMPAIGN_BLOCKER: manifest not found: "%MANIFEST%" 1>&2
  exit /b 2
)

where pnpm.cmd >nul 2>nul
if errorlevel 1 (
  echo EVAVO_ART_CAMPAIGN_BLOCKER: pnpm.cmd is unavailable. 1>&2
  exit /b 3
)

where node.exe >nul 2>nul
if errorlevel 1 (
  echo EVAVO_ART_CAMPAIGN_BLOCKER: node.exe is unavailable. 1>&2
  exit /b 4
)

call pnpm.cmd --filter @evavo/art-providers build
if errorlevel 1 (
  echo EVAVO_ART_CAMPAIGN_BLOCKER: Art Studio provider build failed. 1>&2
  exit /b 5
)

node "%REPO%scripts\doctor-local-generation.mjs" --manifest "%MANIFEST%"
if errorlevel 1 (
  echo EVAVO_ART_CAMPAIGN_BLOCKER: local generation doctor rejected the current ComfyUI/catalog/model route. 1>&2
  exit /b 6
)

node "%REPO%scripts\run-local-generation-campaign.mjs" --manifest "%MANIFEST%"
exit /b %ERRORLEVEL%
