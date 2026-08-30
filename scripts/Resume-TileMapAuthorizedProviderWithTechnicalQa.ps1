param(
    [Parameter(Mandatory = $true)]
    [string]$Authorization,

    [Parameter(Mandatory = $true)]
    [string]$EvidenceRoot,

    [ValidateRange(1, 16)]
    [int]$Concurrency = 1
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Require-File([string]$PathValue, [string]$Label) {
    $Full = [System.IO.Path]::GetFullPath($PathValue)
    if (-not (Test-Path -LiteralPath $Full -PathType Leaf)) {
        throw "$Label not found: $Full"
    }
    return $Full
}

function Invoke-Checked([string]$Label, [scriptblock]$Action) {
    Write-Host ""
    Write-Host $Label
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Authorization = Require-File $Authorization 'Provider authorization'
$EvidenceRoot = [System.IO.Path]::GetFullPath($EvidenceRoot)
if (-not (Test-Path -LiteralPath $EvidenceRoot -PathType Container)) {
    throw "EvidenceRoot not found: $EvidenceRoot"
}
$TechnicalQa = Join-Path $EvidenceRoot '09-candidate-technical-qa.json'
if (Test-Path -LiteralPath $TechnicalQa) {
    throw "Technical QA output must not already exist: $TechnicalQa"
}

Push-Location $RepoRoot
try {
    & .\scripts\Resume-TileMapAuthorizedProvider.ps1 `
        -Authorization $Authorization `
        -EvidenceRoot $EvidenceRoot `
        -Concurrency $Concurrency
    if ($LASTEXITCODE -ne 0) {
        throw "Authorized provider resume failed with exit code $LASTEXITCODE"
    }

    $SourcePackage = Require-File (Join-Path $EvidenceRoot '02-source-package.json') 'Source package'
    $Review = Require-File (Join-Path $EvidenceRoot '08-candidate-review.json') 'Candidate review'

    Invoke-Checked 'RUNNING TILE MAP CANDIDATE TECHNICAL ADMISSION' {
        pnpm art -- tile-map-candidate-technical-qa `
            --package $SourcePackage `
            --review $Review `
            --output $TechnicalQa
    }

    Write-Host ""
    Write-Host 'AUTHORIZED TILE MAP PROVIDER RUN AND TECHNICAL QA COMPLETE'
    Write-Host "Review manifest: $Review"
    Write-Host "Technical QA:    $TechnicalQa"
    Write-Host 'No structural, visual or creative approval has been inferred.'
}
finally {
    Pop-Location
}
