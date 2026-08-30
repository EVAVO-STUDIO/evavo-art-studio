param(
    [Parameter(Mandatory = $true)]
    [string]$Review,

    [Parameter(Mandatory = $true)]
    [string]$QaReport,

    [Parameter(Mandatory = $true)]
    [string]$OutputRoot
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Review = [System.IO.Path]::GetFullPath($Review)
$QaReport = [System.IO.Path]::GetFullPath($QaReport)
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
foreach ($InputFile in @($Review, $QaReport)) {
    if (-not (Test-Path -LiteralPath $InputFile -PathType Leaf)) {
        throw "Required Tile Map proof input not found: $InputFile"
    }
}
if (Test-Path -LiteralPath $OutputRoot) {
    $Existing = @(Get-ChildItem -LiteralPath $OutputRoot -Force)
    if ($Existing.Count -gt 0) {
        throw "Candidate proof output must be new or empty: $OutputRoot"
    }
} else {
    New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
}

Push-Location $RepoRoot
try {
    pnpm --filter '@evavo/art-studio-cli' build
    if ($LASTEXITCODE -ne 0) {
        throw "Art Studio CLI build failed with exit code $LASTEXITCODE"
    }
    node .\apps\cli\dist\tile-map-candidate-proof-cli.js `
        --review $Review `
        --qa $QaReport `
        --output $OutputRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Tile Map candidate proof rendering failed with exit code $LASTEXITCODE"
    }

    $ReceiptPath = Join-Path $OutputRoot 'candidate-proof.receipt.json'
    if (-not (Test-Path -LiteralPath $ReceiptPath -PathType Leaf)) {
        throw "Candidate proof receipt was not produced: $ReceiptPath"
    }
    $Receipt = Get-Content -LiteralPath $ReceiptPath -Raw | ConvertFrom-Json
    if ($Receipt.authority.creative_approval -ne $false) {
        throw 'Candidate proof illegally claimed creative approval.'
    }
    Write-Host 'TILE MAP CANDIDATE REVIEW PROOFS READY'
    Write-Host "Root: $OutputRoot"
    Write-Host "Families: $($Receipt.proof_files.Count)"
    Write-Host "Receipt: $ReceiptPath"
    Write-Host 'Proofs are review evidence only; they do not approve candidates.'
}
finally {
    Pop-Location
}
