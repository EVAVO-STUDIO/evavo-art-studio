@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "ROOT=%~dp0"
set "MANIFEST=%~1"
if not defined MANIFEST set "MANIFEST=%ROOT%examples\local-generation-batch.template.json"

where node.exe >nul 2>&1
if errorlevel 1 (
  echo EVAVO_ART_BATCH_ERROR: Node.js is required. 1>&2
  exit /b 2
)

node "%ROOT%scripts\run-local-generation-batch.mjs" --manifest "%MANIFEST%"
exit /b %ERRORLEVEL%
