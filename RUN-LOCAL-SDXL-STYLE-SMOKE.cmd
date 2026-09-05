@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "ROOT=%~dp0"

where node.exe >nul 2>&1
if errorlevel 1 (
  echo EVAVO_ART_SDXL_SMOKE_ERROR: Node.js is required. 1>&2
  exit /b 2
)

node "%ROOT%scripts\run-local-sdxl-style-smoke-entry.mjs" %*
exit /b %ERRORLEVEL%
