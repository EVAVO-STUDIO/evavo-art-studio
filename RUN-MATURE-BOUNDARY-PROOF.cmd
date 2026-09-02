@echo off
setlocal
set "REPO=%~dp0"
cd /d "%REPO%" || exit /b 1

set "MANIFEST=%REPO%examples\local-generation-campaign.mature-boundary.json"
if not exist "%MANIFEST%" (
  echo EVAVO_MATURE_BOUNDARY_BLOCKER: proof manifest not found at "%MANIFEST%" 1>&2
  exit /b 2
)

call "%REPO%RUN-LOCAL-ART-CAMPAIGN.cmd" "%MANIFEST%"
exit /b %ERRORLEVEL%
