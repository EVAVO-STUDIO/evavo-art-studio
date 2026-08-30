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

    [string]$Reason = 'Generate governed Tile Map Studio art candidates and retain automated technical QA.',

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
    & .\scripts\Invoke-TileMapArtProviderPipeline.ps1 `
        -Handoff $Handoff `
        -EvidenceRoot $EvidenceRoot `
        -RuntimeRoot $RuntimeRoot `
        -ArtifactRoot $ArtifactRoot `
        -AllowedAdapters $AllowedAdapters `
        -AuthorizedBy $AuthorizedBy `
        -Reason $Reason `
        -AuthorizationMinutes $AuthorizationMinutes `
        -Concurrency $Concurrency `
        -ExecuteProvider
    if ($LASTEXITCODE -ne 0) {
        throw "Tile Map provider pipeline failed with exit code $LASTEXITCODE"
    }

    $SourcePackage = Join-Path $EvidenceRoot '02-source-package.json'
    $Review = Join-Path $EvidenceRoot '08-candidate-review.json'
    $QaOutput = Join-Path $EvidenceRoot '09-candidate-qa.json'
    foreach ($RequiredFile in @($SourcePackage, $Review)) {
        if (-not (Test-Path -LiteralPath $RequiredFile -PathType Leaf)) {
            throw "Required provider-pipeline evidence not found: $RequiredFile"
        }
    }
    if (Test-Path -LiteralPath $QaOutput) {
        throw "Candidate QA output already exists: $QaOutput"
    }

    $QaArguments = @(
        '.\apps\cli\dist\tile-map-candidate-qa-cli.js',
        '--package', $SourcePackage,
        '--review', $Review,
        '--output', $QaOutput
    )
    if ($QaPolicy) {
        $ResolvedPolicy = [System.IO.Path]::GetFullPath($QaPolicy)
        if (-not (Test-Path -LiteralPath $ResolvedPolicy -PathType Leaf)) {
            throw "Tile Map QA policy not found: $ResolvedPolicy"
        }
        $QaArguments += @('--policy', $ResolvedPolicy)
    }

    & node @QaArguments
    $QaExitCode = $LASTEXITCODE
    if ($QaExitCode -ne 0 -and $QaExitCode -ne 2) {
        throw "Tile Map candidate QA failed unexpectedly with exit code $QaExitCode"
    }
    if (-not (Test-Path -LiteralPath $QaOutput -PathType Leaf)) {
        throw "Candidate QA report was not produced: $QaOutput"
    }

    $Qa = Get-Content -LiteralPath $QaOutput -Raw | ConvertFrom-Json
    if ($Qa.authority.creative_approval -ne $false) {
        throw 'Automated candidate QA illegally claimed creative approval.'
    }
    Write-Host ""
    Write-Host 'TILE MAP PROVIDER + QA EVIDENCE COMPLETE'
    Write-Host "Review: $Review"
    Write-Host "QA:     $QaOutput"
    Write-Host "Status: $($Qa.status)"
    Write-Host "Candidate errors: $($Qa.summary.candidate_errors)"
    Write-Host "Family errors:    $($Qa.summary.family_errors)"
    Write-Host 'All structural, visual and creative review decisions remain explicit and pending.'

    if ($Qa.status -eq 'blocked' -and -not $AllowBlockedQa) {
        throw 'Tile Map candidate QA contains blocking findings. Evidence was retained.'
    }
    if ($Qa.status -ne 'passed' -and $Qa.status -ne 'blocked') {
        throw "Unexpected candidate QA status: $($Qa.status)"
    }
}
finally {
    Pop-Location
}
