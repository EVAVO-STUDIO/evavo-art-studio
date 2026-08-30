param(
    [Parameter(Mandatory = $true)]
    [string]$EvidenceRoot,

    [Parameter(Mandatory = $true)]
    [string]$Decisions
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

function Require-File([string]$PathValue, [string]$Label) {
    $Full = [System.IO.Path]::GetFullPath($PathValue)
    if (-not (Test-Path -LiteralPath $Full -PathType Leaf)) {
        throw "$Label not found: $Full"
    }
    return $Full
}

function Require-NewFile([string]$PathValue, [string]$Label) {
    $Full = [System.IO.Path]::GetFullPath($PathValue)
    if (Test-Path -LiteralPath $Full) {
        throw "$Label must not already exist: $Full"
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
$TechnicalQa = Require-File (Join-Path $EvidenceRoot '09-candidate-technical-qa.json') 'Candidate technical QA'
$Decisions = Require-File $Decisions 'Review decisions'
$Finalization = Require-NewFile (Join-Path $EvidenceRoot '10-review-finalized.json') 'Review finalization'
$ApprovedSources = Require-NewFile (Join-Path $EvidenceRoot '11-approved-sources.json') 'Approved source manifest'

Push-Location $RepoRoot
try {
    Invoke-Checked 'BUILDING ART STUDIO CLI' {
        pnpm --filter '@evavo/art-studio-cli' build
    }

    Invoke-Checked 'FINALIZING STRUCTURAL, VISUAL AND CREATIVE REVIEW' {
        pnpm art -- tile-map-review-finalize `
            --review $Review `
            --decisions $Decisions `
            --output $Finalization
    }

    Invoke-Checked 'EXPORTING TECHNICALLY ADMITTED REVIEWED SOURCES' {
        pnpm art -- tile-map-approved-sources `
            --package $SourcePackage `
            --review $Review `
            --technical-qa $TechnicalQa `
            --approval $Finalization `
            --output $ApprovedSources
    }

    $Approved = Get-Content -LiteralPath $ApprovedSources -Raw | ConvertFrom-Json -Depth 100
    if ($Approved.schema_version -ne 2) {
        throw 'Approved source manifest must use schema_version 2.'
    }
    if ($Approved.technical_qa_required -ne $true) {
        throw 'Approved source manifest did not retain the technical QA gate.'
    }
    if ($Approved.eligible_for_sprite_studio -ne $true) {
        throw 'Approved source manifest is not eligible for Sprite Studio.'
    }
    foreach ($Field in @(
        'manifest_fingerprint',
        'source_map_fingerprint',
        'source_review_fingerprint',
        'review_finalization_fingerprint',
        'source_technical_qa_fingerprint'
    )) {
        $Value = [string]$Approved.$Field
        if ($Value -notmatch '^[0-9a-f]{64}$') {
            throw "Approved source manifest field $Field is not a SHA-256 fingerprint."
        }
    }

    Write-Host ""
    Write-Host 'TILE MAP ART REVIEW FINALIZED'
    Write-Host "Review:          $Review"
    Write-Host "Technical QA:    $TechnicalQa"
    Write-Host "Finalization:    $Finalization"
    Write-Host "Approved sources:$ApprovedSources"
    Write-Host ""
    Write-Host 'The approved source manifest is ready for Sprite Studio lossless mastering.'
}
finally {
    Pop-Location
}
