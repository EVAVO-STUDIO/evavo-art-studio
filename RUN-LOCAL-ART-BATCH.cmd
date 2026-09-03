@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "ROOT=%~dp0"
set "MANIFEST=%~1"
if not defined MANIFEST set "MANIFEST=%ROOT%examples\local-generation-batch.template.json"

if not defined EVAVO_ART_COMFYUI_CATALOG set "EVAVO_ART_COMFYUI_CATALOG=%LOCALAPPDATA%\EVAVO\AI\ComfyUI\catalog.json"
if not defined EVAVO_ART_COMFYUI_BASE_URL set "EVAVO_ART_COMFYUI_BASE_URL=http://127.0.0.1:8192"

where node.exe >nul 2>&1
if errorlevel 1 (
  echo EVAVO_ART_BATCH_ERROR: Node.js is required. 1>&2
  exit /b 2
)

node "%ROOT%scripts\run-local-generation-batch.mjs" --manifest "%MANIFEST%"
exit /b %ERRORLEVEL%
