param(
    [Parameter(Mandatory = $true)]
    [string]$EvidenceRoot,

    [string]$OutputRoot
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
$EvidenceRoot = [System.IO.Path]::GetFullPath($EvidenceRoot)
if (-not (Test-Path -LiteralPath $EvidenceRoot -PathType Container)) {
    throw "EvidenceRoot not found: $EvidenceRoot"
}
$SourcePackage = Require-File (Join-Path $EvidenceRoot '02-source-package.json') 'Source package'
$Review = Require-File (Join-Path $EvidenceRoot '08-candidate-review.json') 'Candidate review'
$TechnicalQa = Require-File (Join-Path $EvidenceRoot '09-candidate-technical-qa.json') 'Candidate technical QA'
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $EvidenceRoot '09-candidate-proof'
}
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
if (Test-Path -LiteralPath $OutputRoot) {
    throw "OutputRoot must not already exist: $OutputRoot"
}

Push-Location $RepoRoot
try {
    Invoke-Checked 'BUILDING ART STUDIO CLI' {
        pnpm --filter '@evavo/art-studio-cli' build
    }

    Invoke-Checked 'RENDERING TILE MAP CANDIDATE PROOF BOARDS' {
        pnpm --filter '@evavo/art-studio-cli' start:tile-map-proof -- `
            --package $SourcePackage `
            --review $Review `
            --technical-qa $TechnicalQa `
            --output-root $OutputRoot
    }

    $ManifestPath = Require-File (Join-Path $OutputRoot 'candidate-proof.manifest.json') 'Candidate proof manifest'
    $Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json -Depth 100
    if ($Manifest.schema_version -ne 1) {
        throw 'Candidate proof manifest must use schema_version 1.'
    }
    if ($Manifest.authority.creative_approval_authority -ne $false) {
        throw 'Candidate proof manifest must not have creative approval authority.'
    }
    if ($Manifest.authority.promotion_authority -ne $false) {
        throw 'Candidate proof manifest must not have promotion authority.'
    }
    if ([string]$Manifest.proof_fingerprint -notmatch '^[0-9a-f]{64}$') {
        throw 'Candidate proof manifest fingerprint is invalid.'
    }
    foreach ($Artifact in @($Manifest.artifacts)) {
        $ProofFile = Join-Path $OutputRoot ([string]$Artifact.file)
        if (-not (Test-Path -LiteralPath $ProofFile -PathType Leaf)) {
            throw "Candidate proof board is missing: $ProofFile"
        }
        $ActualHash = (Get-FileHash -LiteralPath $ProofFile -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($ActualHash -ne [string]$Artifact.sha256) {
            throw "Candidate proof board hash differs from manifest: $ProofFile"
        }
    }

    Write-Host ""
    Write-Host 'TILE MAP CANDIDATE PROOFS READY'
    Write-Host "Manifest: $ManifestPath"
    Write-Host "Boards:   $OutputRoot"
    Write-Host "Status:   $($Manifest.status)"
    Write-Host 'Proof boards are review evidence only and cannot approve candidates.'
}
finally {
    Pop-Location
}
