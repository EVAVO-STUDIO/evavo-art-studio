param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePackage,

    [Parameter(Mandatory = $true)]
    [string]$Review,

    [Parameter(Mandatory = $true)]
    [string]$QaReport,

    [Parameter(Mandatory = $true)]
    [string]$ReviewFinalization,

    [Parameter(Mandatory = $true)]
    [string]$Output
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$SourcePackage = [System.IO.Path]::GetFullPath($SourcePackage)
$Review = [System.IO.Path]::GetFullPath($Review)
$QaReport = [System.IO.Path]::GetFullPath($QaReport)
$ReviewFinalization = [System.IO.Path]::GetFullPath($ReviewFinalization)
$Output = [System.IO.Path]::GetFullPath($Output)

foreach ($InputFile in @($SourcePackage, $Review, $QaReport, $ReviewFinalization)) {
    if (-not (Test-Path -LiteralPath $InputFile -PathType Leaf)) {
        throw "Required Tile Map approval input not found: $InputFile"
    }
}
if (Test-Path -LiteralPath $Output) {
    throw "Approved-source output is create-only and already exists: $Output"
}
$OutputParent = Split-Path -Parent $Output
if ($OutputParent) {
    New-Item -ItemType Directory -Path $OutputParent -Force | Out-Null
}

Push-Location $RepoRoot
try {
    pnpm --filter '@evavo/art-studio-cli' build
    if ($LASTEXITCODE -ne 0) {
        throw "Art Studio CLI build failed with exit code $LASTEXITCODE"
    }

    node .\apps\cli\dist\tile-map-qa-approved-sources-cli.js `
        --package $SourcePackage `
        --review $Review `
        --qa $QaReport `
        --approval $ReviewFinalization `
        --output $Output
    if ($LASTEXITCODE -ne 0) {
        throw "QA-bound approved-source export failed with exit code $LASTEXITCODE"
    }
    if (-not (Test-Path -LiteralPath $Output -PathType Leaf)) {
        throw "Approved-source export was not produced: $Output"
    }

    $Manifest = Get-Content -LiteralPath $Output -Raw | ConvertFrom-Json
    if ($Manifest.eligible_for_sprite_studio -ne $true) {
        throw 'Approved-source manifest is not eligible for Sprite Studio.'
    }
    if ($Manifest.candidate_qa_authority -ne 'blocking-technical-evidence-only') {
        throw 'Approved-source manifest lost the automated QA authority boundary.'
    }
    if (-not $Manifest.source_candidate_qa_fingerprint) {
        throw 'Approved-source manifest is missing candidate QA provenance.'
    }

    Write-Host 'TILE MAP REVIEWED + QA-CLEARED SOURCES READY FOR SPRITE STUDIO'
    Write-Host "Manifest: $Output"
    Write-Host "Fingerprint: $($Manifest.manifest_fingerprint)"
    Write-Host "QA: $($Manifest.source_candidate_qa_fingerprint)"
}
finally {
    Pop-Location
}
