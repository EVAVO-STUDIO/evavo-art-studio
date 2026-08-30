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

function Invoke-Checked([string]$Label, [scriptblock]$Action) {
    Write-Host ""
    Write-Host $Label
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Authorization = [System.IO.Path]::GetFullPath($Authorization)
$EvidenceRoot = [System.IO.Path]::GetFullPath($EvidenceRoot)
if (-not (Test-Path -LiteralPath $Authorization -PathType Leaf)) {
    throw "Authorization not found: $Authorization"
}
if (-not (Test-Path -LiteralPath $EvidenceRoot -PathType Container)) {
    throw "EvidenceRoot not found: $EvidenceRoot"
}

$Auth = Get-Content -LiteralPath $Authorization -Raw | ConvertFrom-Json
if ($Auth.schema -ne 'evavo.tile-map-provider-execution-authorization.v1') {
    throw 'Authorization has unexpected schema.'
}
$ProviderBatch = [System.IO.Path]::GetFullPath([string]$Auth.sourceProviderBatch.path)
$ArtifactRoot = [System.IO.Path]::GetFullPath([string]$Auth.artifacts.root)
$CandidateBatch = Join-Path $EvidenceRoot '03-candidate-batch.json'
$ExecutionReceipt = Join-Path $EvidenceRoot '06-provider-execution.receipt.json'
$MasteringReceipt = Join-Path $EvidenceRoot '07-candidate-mastering.receipt.json'
$CandidateRoot = Join-Path $EvidenceRoot '08-mastered-provider-results'
$Review = Join-Path $EvidenceRoot '09-candidate-review.json'

foreach ($RequiredPath in @($ProviderBatch, $CandidateBatch)) {
    if (-not (Test-Path -LiteralPath $RequiredPath -PathType Leaf)) {
        throw "Required source evidence is missing: $RequiredPath"
    }
}
foreach ($CreateOnlyPath in @($ExecutionReceipt, $MasteringReceipt, $Review, $CandidateRoot)) {
    if (Test-Path -LiteralPath $CreateOnlyPath) {
        throw "Create-only output already exists: $CreateOnlyPath"
    }
}

Push-Location $RepoRoot
try {
    Invoke-Checked 'BUILDING ART STUDIO DOMAIN PACKAGES' {
        pnpm run build:domain
    }
    Invoke-Checked 'BUILDING ART STUDIO CLI' {
        pnpm --filter '@evavo/art-studio-cli' build
    }
    Invoke-Checked 'BUILDING ART STUDIO WORKER' {
        pnpm --filter '@evavo/art-studio-worker' build
    }

    Invoke-Checked 'REVALIDATING ACTIVE TILE MAP PROVIDER AUTHORIZATION' {
        node .\scripts\validate-tile-map-provider-authorization.mjs $Authorization
    }

    Invoke-Checked 'RUNNING ISOLATED AUTHORIZED TILE MAP PROVIDER WORKER' {
        node .\scripts\run-authorized-tile-map-provider-worker.mjs `
            --authorization $Authorization `
            --command until-idle `
            --concurrency $Concurrency `
            --receipt $ExecutionReceipt
    }

    Invoke-Checked 'VERIFYING RETAINED PROVIDER EXECUTION' {
        node .\scripts\verify-tile-map-provider-execution.mjs $ExecutionReceipt
    }

    Invoke-Checked 'MASTERING PROVIDER CANDIDATES TO EXACT GAME RESOLUTION' {
        node .\scripts\run-tile-map-candidate-mastering.mjs `
            --provider-batch $ProviderBatch `
            --execution-receipt $ExecutionReceipt `
            --concurrency $Concurrency `
            --receipt $MasteringReceipt
    }

    Invoke-Checked 'MATERIALIZING VERIFIED MASTERED CANDIDATES FOR REVIEW' {
        node .\scripts\materialize-tile-map-provider-results.mjs `
            --provider-batch $ProviderBatch `
            --execution-receipt $ExecutionReceipt `
            --mastering-receipt $MasteringReceipt `
            --artifact-root $ArtifactRoot `
            --output-root $CandidateRoot
    }

    $ProviderResults = Join-Path $CandidateRoot 'provider-results.json'
    Invoke-Checked 'COMPILING ART STUDIO CANDIDATE REVIEW INTAKE' {
        pnpm art -- tile-map-candidate-review `
            --batch $CandidateBatch `
            --results $ProviderResults `
            --output $Review
    }

    Write-Host ""
    Write-Host 'AUTHORIZED TILE MAP PROVIDER AND MASTERING RUN COMPLETE'
    Write-Host "Execution receipt: $ExecutionReceipt"
    Write-Host "Mastering receipt: $MasteringReceipt"
    Write-Host "Candidate root:    $CandidateRoot"
    Write-Host "Review manifest:   $Review"
    Write-Host ""
    Write-Host 'All admitted candidates remain pending structural, visual and creative review.'
}
finally {
    Pop-Location
}
