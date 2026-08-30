param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $RepoRoot
try {
    Write-Host 'BUILDING ART STUDIO DOMAIN PACKAGES'
    pnpm run build:domain
    if ($LASTEXITCODE -ne 0) {
        throw "Art Studio domain build failed with exit code $LASTEXITCODE"
    }

    Write-Host 'BUILDING TILE MAP ART STUDIO CLI'
    pnpm --filter '@evavo/art-studio-cli' build
    if ($LASTEXITCODE -ne 0) {
        throw "Art Studio CLI build failed with exit code $LASTEXITCODE"
    }

    Write-Host 'RUNNING TILE MAP CANDIDATE QA / PROOF / APPROVAL TESTS'
    node --test `
        .\apps\cli\test\tile-map-candidate-qa.test.mjs `
        .\apps\cli\test\tile-map-candidate-proof.test.mjs `
        .\apps\cli\test\tile-map-qa-approved-sources.test.mjs
    if ($LASTEXITCODE -ne 0) {
        throw "Tile Map candidate evidence tests failed with exit code $LASTEXITCODE"
    }

    Write-Host 'TILE MAP CANDIDATE EVIDENCE VALIDATION PASSED'
    Write-Host 'No provider call, creative approval or repository promotion was performed.'
}
finally {
    Pop-Location
}
