param(
    [Parameter(Mandatory = $true)]
    [string]$Handoff,

    [string]$Root,

    [ValidateRange(1, 16)]
    [int]$Concurrency = 2
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Handoff = [System.IO.Path]::GetFullPath($Handoff)
if (-not (Test-Path -LiteralPath $Handoff -PathType Leaf)) {
    throw "Tile Map handoff not found: $Handoff"
}
if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = Join-Path ([System.IO.Path]::GetTempPath()) ("evavo-tile-map-fixture-" + [Guid]::NewGuid().ToString('N'))
}
$Root = [System.IO.Path]::GetFullPath($Root)
if (Test-Path -LiteralPath $Root) {
    $Existing = @(Get-ChildItem -LiteralPath $Root -Force)
    if ($Existing.Count -gt 0) {
        throw "Fixture smoke root must be new or empty: $Root"
    }
} else {
    New-Item -ItemType Directory -Path $Root -Force | Out-Null
}

$Evidence = Join-Path $Root 'evidence'
$Runtime = Join-Path $Root 'runtime'
$Artifacts = Join-Path $Root 'artifacts'
$PreviousFixture = $env:EVAVO_ART_ENABLE_FIXTURE_PROVIDER

Push-Location $RepoRoot
try {
    $env:EVAVO_ART_ENABLE_FIXTURE_PROVIDER = 'true'

    & .\scripts\Invoke-TileMapArtProviderPipeline.ps1 `
        -Handoff $Handoff `
        -EvidenceRoot $Evidence `
        -RuntimeRoot $Runtime `
        -ArtifactRoot $Artifacts `
        -AllowedAdapters @('fixture-image') `
        -AuthorizedBy 'tile-map-fixture-smoke' `
        -Reason 'Zero-cost deterministic Tile Map provider execution and mastering smoke.' `
        -AuthorizationMinutes 60 `
        -Concurrency $Concurrency `
        -ExecuteProvider

    if ($LASTEXITCODE -ne 0) {
        throw "Tile Map fixture provider pipeline failed with exit code $LASTEXITCODE"
    }

    $ExecutionReceipt = Join-Path $Evidence '06-provider-execution.receipt.json'
    $MasteringReceipt = Join-Path $Evidence '07-candidate-mastering.receipt.json'
    $ProviderResults = Join-Path $Evidence '08-mastered-provider-results\provider-results.json'
    $Review = Join-Path $Evidence '09-candidate-review.json'
    foreach ($Required in @($ExecutionReceipt, $MasteringReceipt, $ProviderResults, $Review)) {
        if (-not (Test-Path -LiteralPath $Required -PathType Leaf)) {
            throw "Expected fixture smoke evidence is missing: $Required"
        }
    }

    node .\scripts\verify-tile-map-provider-execution.mjs $ExecutionReceipt
    if ($LASTEXITCODE -ne 0) {
        throw "Retained fixture provider execution verification failed with exit code $LASTEXITCODE"
    }

    node .\scripts\verify-tile-map-candidate-mastering.mjs $MasteringReceipt
    if ($LASTEXITCODE -ne 0) {
        throw "Retained fixture mastering verification failed with exit code $LASTEXITCODE"
    }

    $ResultsPayload = Get-Content -LiteralPath $ProviderResults -Raw | ConvertFrom-Json
    if ($ResultsPayload.schema_version -ne 2) {
        throw "Fixture provider results must use mastered schema v2."
    }
    if (
        $ResultsPayload.authority.deterministic_mastering_required -ne $true -or
        $ResultsPayload.authority.mastering_quality_required -ne $true -or
        $ResultsPayload.authority.approval_authority -ne $false
    ) {
        throw 'Fixture provider results weakened mastering/review authority.'
    }

    $ReviewPayload = Get-Content -LiteralPath $Review -Raw | ConvertFrom-Json
    if ($ReviewPayload.status -ne 'awaiting-review') {
        throw "Fixture review must remain awaiting-review; got $($ReviewPayload.status)"
    }
    if (
        $ReviewPayload.authority.deterministic_mastering_required -ne $true -or
        $ReviewPayload.authority.mastering_quality_required -ne $true
    ) {
        throw 'Fixture review does not retain deterministic mastering requirements.'
    }
    if ($ReviewPayload.candidates.Count -lt 1) {
        throw 'Fixture review must contain at least one candidate.'
    }
    foreach ($Candidate in $ReviewPayload.candidates) {
        if (
            $Candidate.structural_review -ne 'pending' -or
            $Candidate.visual_review -ne 'pending' -or
            $Candidate.creative_review -ne 'pending' -or
            $Candidate.promotion_eligible -ne $false
        ) {
            throw "Fixture candidate crossed review/approval boundary: $($Candidate.candidate_id)"
        }
        if (
            [string]::IsNullOrWhiteSpace([string]$Candidate.source_provider_artifact_id) -or
            [string]::IsNullOrWhiteSpace([string]$Candidate.mastered_artifact_id) -or
            [string]::IsNullOrWhiteSpace([string]$Candidate.mastering_evidence_artifact_id)
        ) {
            throw "Fixture candidate lost provider/mastering lineage: $($Candidate.candidate_id)"
        }
    }

    Write-Host ""
    Write-Host 'TILE MAP FIXTURE PROVIDER + MASTERING SMOKE PASSED'
    Write-Host "Root:              $Root"
    Write-Host "Candidates:        $($ReviewPayload.candidates.Count)"
    Write-Host "Execution receipt: $ExecutionReceipt"
    Write-Host "Mastering receipt: $MasteringReceipt"
    Write-Host "Review:            $Review"
    Write-Host ""
    Write-Host 'Fixture candidates are deterministic test evidence only and remain unapproved.'
}
finally {
    if ($null -eq $PreviousFixture) {
        Remove-Item Env:EVAVO_ART_ENABLE_FIXTURE_PROVIDER -ErrorAction SilentlyContinue
    } else {
        $env:EVAVO_ART_ENABLE_FIXTURE_PROVIDER = $PreviousFixture
    }
    Pop-Location
}
