param(
    [Parameter(Mandatory = $true)]
    [string]$Manifest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Manifest = [System.IO.Path]::GetFullPath($Manifest)
if (-not (Test-Path -LiteralPath $Manifest -PathType Leaf)) {
    throw "Candidate proof manifest not found: $Manifest"
}

Push-Location $RepoRoot
try {
    pnpm --filter '@evavo/art-studio-cli' build
    if ($LASTEXITCODE -ne 0) {
        throw "Art Studio CLI build failed with exit code $LASTEXITCODE"
    }
    node .\scripts\verify-tile-map-candidate-proof.mjs $Manifest
    if ($LASTEXITCODE -ne 0) {
        throw "Candidate proof verification failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
