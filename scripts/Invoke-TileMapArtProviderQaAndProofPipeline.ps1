param(
    [Parameter(Mandatory = $true)]
    [string]$Handoff,

    [Parameter(Mandatory = $true)]
    [string]$EvidenceRoot,

    [Parameter(Mandatory = $true)]
    [string]$RuntimeRoot,

    [Parameter(Mandatory = $true)]
    [string]$ArtifactRoot,

    [Parameter(Mandatory = $true)]
    [string[]]$AllowedAdapters,

    [Parameter(Mandatory = $true)]
    [string]$AuthorizedBy,

    [string]$Reason = 'Generate governed Tile Map candidates with technical QA and retained visual proof.',

    [ValidateRange(1, 1440)]
    [int]$AuthorizationMinutes = 60,

    [ValidateRange(1, 16)]
    [int]$Concurrency = 1,

    [string]$QaPolicy,

    [switch]$AllowBlockedQa
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$EvidenceRoot = [System.IO.Path]::GetFullPath($EvidenceRoot)

Push-Location $RepoRoot
try {
    $ProviderArguments = @{
        Handoff = $Handoff
        EvidenceRoot = $EvidenceRoot
        RuntimeRoot = $RuntimeRoot
        ArtifactRoot = $ArtifactRoot
        AllowedAdapters = $AllowedAdapters
        AuthorizedBy = $AuthorizedBy
        Reason = $Reason
        AuthorizationMinutes = $AuthorizationMinutes
        Concurrency = $Concurrency
        AllowBlockedQa = $true
    }
    if ($QaPolicy) {
        $ProviderArguments.QaPolicy = $QaPolicy
    }
    & .\scripts\Invoke-TileMapArtProviderAndQaPipeline.ps1 @ProviderArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Tile Map provider/QA pipeline failed with exit code $LASTEXITCODE"
    }

    $Review = Join-Path $EvidenceRoot '08-candidate-review.json'
    $QaReport = Join-Path $EvidenceRoot '09-candidate-qa.json'
    $ProofRoot = Join-Path $EvidenceRoot '10-candidate-proofs'
    & .\scripts\Render-TileMapCandidateProofs.ps1 `
        -Review $Review `
        -QaReport $QaReport `
        -OutputRoot $ProofRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Tile Map candidate proof rendering failed with exit code $LASTEXITCODE"
    }

    $Qa = Get-Content -LiteralPath $QaReport -Raw | ConvertFrom-Json
    Write-Host ""
    Write-Host 'TILE MAP PROVIDER + QA + VISUAL PROOF PIPELINE COMPLETE'
    Write-Host "Evidence root: $EvidenceRoot"
    Write-Host "QA status:    $($Qa.status)"
    Write-Host "Proof root:   $ProofRoot"
    Write-Host 'No candidate has been structurally, visually or creatively approved.'

    if ($Qa.status -eq 'blocked' -and -not $AllowBlockedQa) {
        throw 'Tile Map QA is blocked. Candidate proof evidence was retained for diagnosis.'
    }
}
finally {
    Pop-Location
}
