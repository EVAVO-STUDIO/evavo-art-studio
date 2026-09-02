@echo off
setlocal
set "REPO=%~dp0"
cd /d "%REPO%" || exit /b 1

if "%~1"=="" (
  set "MANIFEST=%REPO%examples\local-generation-campaign.lorna.json"
) else (
  set "MANIFEST=%~1"
)

node "%REPO%scripts\run-local-generation-campaign.mjs" --manifest "%MANIFEST%"
exit /b %ERRORLEVEL%
