param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePackage,

    [Parameter(Mandatory = $true)]
    [string]$Review,

    [Parameter(Mandatory = $true)]
    [string]$CandidateQa,

    [Parameter(Mandatory = $true)]
    [string]$Output,

    [string]$Policy
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
foreach ($Name in @('SourcePackage', 'Review', 'CandidateQa')) {
    $Value = [System.IO.Path]::GetFullPath((Get-Variable -Name $Name -ValueOnly))
    Set-Variable -Name $Name -Value $Value
    if (-not (Test-Path -LiteralPath $Value -PathType Leaf)) {
        throw "$Name not found: $Value"
    }
}
$Output = [System.IO.Path]::GetFullPath($Output)
if (Test-Path -LiteralPath $Output) {
    throw "Boundary QA output is create-only and already exists: $Output"
}
$OutputParent = Split-Path -Parent $Output
if ($OutputParent) {
    New-Item -ItemType Directory -Path $OutputParent -Force | Out-Null
}

$Arguments = @(
    '.\apps\cli\dist\tile-map-candidate-boundary-qa-cli.js',
    '--package', $SourcePackage,
    '--review', $Review,
    '--qa', $CandidateQa,
    '--output', $Output
)
if ($Policy) {
    $ResolvedPolicy = [System.IO.Path]::GetFullPath($Policy)
    if (-not (Test-Path -LiteralPath $ResolvedPolicy -PathType Leaf)) {
        throw "Boundary QA policy not found: $ResolvedPolicy"
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
    $BoundaryExitCode = $LASTEXITCODE
    if ($BoundaryExitCode -ne 0 -and $BoundaryExitCode -ne 2) {
        throw "Tile Map boundary QA failed unexpectedly with exit code $BoundaryExitCode"
    }
    if (-not (Test-Path -LiteralPath $Output -PathType Leaf)) {
        throw "Boundary QA report was not produced: $Output"
    }
    $Report = Get-Content -LiteralPath $Output -Raw | ConvertFrom-Json
    if ($Report.authority.creative_approval -ne $false) {
        throw 'Automated boundary QA illegally claimed creative approval.'
    }
    if ($Report.status -eq 'blocked') {
        Write-Host 'TILE MAP CANDIDATE BOUNDARY QA BLOCKED'
        Write-Host "Report: $Output"
        Write-Host "Errors: $($Report.summary.errors)"
        exit 2
    }
    if ($Report.status -ne 'passed') {
        throw "Unexpected boundary QA status: $($Report.status)"
    }
    Write-Host 'TILE MAP CANDIDATE BOUNDARY QA PASSED'
    Write-Host "Report: $Output"
    Write-Host "Warnings: $($Report.summary.warnings)"
    Write-Host 'Creative approval remains separate.'
}
finally {
    Pop-Location
}
