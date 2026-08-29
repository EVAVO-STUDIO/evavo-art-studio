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
        -Reason 'Zero-cost deterministic Tile Map provider execution smoke.' `
        -AuthorizationMinutes 60 `
        -Concurrency $Concurrency `
        -ExecuteProvider

    if ($LASTEXITCODE -ne 0) {
        throw "Tile Map fixture provider pipeline failed with exit code $LASTEXITCODE"
    }

    $ExecutionReceipt = Join-Path $Evidence '06-provider-execution.receipt.json'
    $Review = Join-Path $Evidence '08-candidate-review.json'
    foreach ($Required in @($ExecutionReceipt, $Review)) {
        if (-not (Test-Path -LiteralPath $Required -PathType Leaf)) {
            throw "Expected fixture smoke evidence is missing: $Required"
        }
    }

    node .\scripts\verify-tile-map-provider-execution.mjs $ExecutionReceipt
    if ($LASTEXITCODE -ne 0) {
        throw "Retained fixture provider execution verification failed with exit code $LASTEXITCODE"
    }

    $ReviewPayload = Get-Content -LiteralPath $Review -Raw | ConvertFrom-Json
    if ($ReviewPayload.status -ne 'awaiting-review') {
        throw "Fixture review must remain awaiting-review; got $($ReviewPayload.status)"
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
    }

    Write-Host ""
    Write-Host 'TILE MAP FIXTURE PROVIDER SMOKE PASSED'
    Write-Host "Root:       $Root"
    Write-Host "Candidates: $($ReviewPayload.candidates.Count)"
    Write-Host "Review:     $Review"
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
