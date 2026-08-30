param(
    [Parameter(Mandatory = $true)]
    [string]$EvidenceRoot
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

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$EvidenceRoot = [System.IO.Path]::GetFullPath($EvidenceRoot)
if (-not (Test-Path -LiteralPath $EvidenceRoot -PathType Container)) {
    throw "EvidenceRoot not found: $EvidenceRoot"
}
$SourcePackage = Require-File (Join-Path $EvidenceRoot '02-source-package.json') 'Source package'
$Review = Require-File (Join-Path $EvidenceRoot '08-candidate-review.json') 'Candidate review'
$TechnicalQa = Join-Path $EvidenceRoot '09-candidate-technical-qa.json'
$ProofRoot = Join-Path $EvidenceRoot '09-candidate-proof'
if (Test-Path -LiteralPath $TechnicalQa) {
    throw "Technical QA output must not already exist: $TechnicalQa"
}
if (Test-Path -LiteralPath $ProofRoot) {
    throw "Candidate proof output must not already exist: $ProofRoot"
}

Push-Location $RepoRoot
try {
    pnpm --filter '@evavo/art-studio-cli' build
    if ($LASTEXITCODE -ne 0) {
        throw "Art Studio CLI build failed with exit code $LASTEXITCODE"
    }

    $HadNativePreference = Test-Path variable:PSNativeCommandUseErrorActionPreference
    if ($HadNativePreference) {
        $PreviousNativePreference = $PSNativeCommandUseErrorActionPreference
        $PSNativeCommandUseErrorActionPreference = $false
    }
    try {
        pnpm art -- tile-map-candidate-technical-qa `
            --package $SourcePackage `
            --review $Review `
            --output $TechnicalQa
        $QaExitCode = $LASTEXITCODE
    }
    finally {
        if ($HadNativePreference) {
            $PSNativeCommandUseErrorActionPreference = $PreviousNativePreference
        }
    }

    if (-not (Test-Path -LiteralPath $TechnicalQa -PathType Leaf)) {
        throw "Technical QA did not retain its report; exit code $QaExitCode"
    }

    pnpm --filter '@evavo/art-studio-cli' start:tile-map-proof -- `
        --package $SourcePackage `
        --review $Review `
        --technical-qa $TechnicalQa `
        --output-root $ProofRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Candidate proof rendering failed with exit code $LASTEXITCODE"
    }

    $ProofManifest = Require-File (Join-Path $ProofRoot 'candidate-proof.manifest.json') 'Candidate proof manifest'
    node .\scripts\verify-tile-map-candidate-proof.mjs $ProofManifest
    if ($LASTEXITCODE -ne 0) {
        throw "Candidate proof verification failed with exit code $LASTEXITCODE"
    }

    $Qa = Get-Content -LiteralPath $TechnicalQa -Raw | ConvertFrom-Json
    $Proof = Get-Content -LiteralPath $ProofManifest -Raw | ConvertFrom-Json
    Write-Host ""
    Write-Host 'TILE MAP CANDIDATE QUALITY EVIDENCE RETAINED'
    Write-Host "Technical QA: $TechnicalQa"
    Write-Host "Proof manifest:$ProofManifest"
    Write-Host "QA status:     $($Qa.status)"
    Write-Host "Proof status:  $($Proof.status)"

    if ($QaExitCode -ne 0 -or $Qa.status -ne 'passed') {
        throw 'Tile Map candidate technical admission is blocked; inspect retained QA and proof evidence.'
    }

    Write-Host 'Technical admission passed. Human structural, visual and creative review is still required.'
}
finally {
    Pop-Location
}
