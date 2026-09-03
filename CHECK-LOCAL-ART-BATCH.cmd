@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "ROOT=%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is required to validate the local Art Studio batch stack. 1>&2
  exit /b 2
)

pushd "%ROOT%" >nul
node.exe "scripts\test-local-generation-batch-v2.mjs"
set "EXITCODE=%ERRORLEVEL%"
popd >nul

if not "%EXITCODE%"=="0" exit /b %EXITCODE%
echo EVAVO_LOCAL_ART_BATCH_V2_CONTRACTS_OK
exit /b 0
