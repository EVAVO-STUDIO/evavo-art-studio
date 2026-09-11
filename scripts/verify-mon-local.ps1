$ErrorActionPreference = "Stop"

Write-Host "EVAVO Art Studio - MÔN local validation" -ForegroundColor Cyan
Write-Host "Policy: local-only validation; no GitHub Actions/workflow dependency." -ForegroundColor DarkGray

node --check scripts/build-mon-candidate-receipt.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node --check scripts/compile-mon-ten-image-batch.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node --check scripts/compile-mon-batch-prompt-packets.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Test-Path ".\examples\mon-ten-image-batch-production.v1.json")) {
    Write-Error "Missing MÔN ten-image batch production profile."
    exit 2
}

node scripts/validate-mon-profile.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "MÔN Art Studio local validation passed." -ForegroundColor Green
exit 0
