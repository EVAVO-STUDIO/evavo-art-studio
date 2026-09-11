$ErrorActionPreference = "Stop"

Write-Host "EVAVO Art Studio - MÔN local validation" -ForegroundColor Cyan
Write-Host "Policy: local-only validation; no GitHub Actions/workflow dependency." -ForegroundColor DarkGray

node scripts/validate-mon-profile.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "MÔN Art Studio local validation passed." -ForegroundColor Green
exit 0
