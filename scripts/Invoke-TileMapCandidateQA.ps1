param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePackage,

    [Parameter(Mandatory = $true)]
    [string]$Review,

    [Parameter(Mandatory = $true)]
    [string]$Output,

    [string]$Policy
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$SourcePackage = [System.IO.Path]::GetFullPath($SourcePackage)
$Review = [System.IO.Path]::GetFullPath($Review)
$Output = [System.IO.Path]::GetFullPath($Output)
if (-not (Test-Path -LiteralPath $SourcePackage -PathType Leaf)) {
    throw "Tile Map source package not found: $SourcePackage"
}
if (-not (Test-Path -LiteralPath $Review -PathType Leaf)) {
    throw "Tile Map candidate review not found: $Review"
}
if (Test-Path -LiteralPath $Output) {
    throw "QA output is create-only and already exists: $Output"
}
$OutputParent = Split-Path -Parent $Output
if ($OutputParent) {
    New-Item -ItemType Directory -Path $OutputParent -Force | Out-Null
}

$Arguments = @(
    (Join-Path $RepoRoot 'apps\cli\dist\tile-map-candidate-qa-cli.js'),
    '--package', $SourcePackage,
    '--review', $Review,
    '--output', $Output
)
if ($Policy) {
    $ResolvedPolicy = [System.IO.Path]::GetFullPath($Policy)
    if (-not (Test-Path -LiteralPath $ResolvedPolicy -PathType Leaf)) {
        throw "Tile Map QA policy not found: $ResolvedPolicy"
    }
    $Arguments += @('--policy', $ResolvedPolicy)
}

Push-Location $RepoRoot
try {
    pnpm --filter '@evavo/art-studio-cli' build
    if ($LASTEXITCODE -ne 0) {
        throw "Art Studio CLI build failed with exit code $LASTEXITCODE"
    }

    & node @Arguments
    $QaExitCode = $LASTEXITCODE
    if ($QaExitCode -ne 0 -and $QaExitCode -ne 2) {
        throw "Tile Map candidate QA failed unexpectedly with exit code $QaExitCode"
    }
    if (-not (Test-Path -LiteralPath $Output -PathType Leaf)) {
        throw "Tile Map candidate QA did not produce its report: $Output"
    }

    $Report = Get-Content -LiteralPath $Output -Raw | ConvertFrom-Json
    if ($Report.authority.creative_approval -ne $false) {
        throw 'Automated candidate QA illegally claimed creative approval.'
    }
    if ($Report.status -eq 'blocked') {
        Write-Host "TILE MAP CANDIDATE QA BLOCKED"
        Write-Host "Report: $Output"
        Write-Host "Candidate errors: $($Report.summary.candidate_errors)"
        Write-Host "Family errors:    $($Report.summary.family_errors)"
        exit 2
    }
    if ($Report.status -ne 'passed') {
        throw "Unexpected Tile Map candidate QA status: $($Report.status)"
    }
    Write-Host "TILE MAP CANDIDATE QA PASSED"
    Write-Host "Report: $Output"
    Write-Host "Warnings: $($Report.summary.candidate_warnings + $Report.summary.family_warnings)"
    Write-Host 'Creative approval remains false and must be recorded separately.'
}
finally {
    Pop-Location
}
