param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePackage,

    [Parameter(Mandatory = $true)]
    [string]$Review,

    [Parameter(Mandatory = $true)]
    [string]$CandidateQa,

    [Parameter(Mandatory = $true)]
    [string]$BoundaryQa,

    [Parameter(Mandatory = $true)]
    [string]$CandidateProofReceipt,

    [Parameter(Mandatory = $true)]
    [string]$ReviewFinalization,

    [Parameter(Mandatory = $true)]
    [string]$Output
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
foreach ($Name in @(
    'SourcePackage',
    'Review',
    'CandidateQa',
    'BoundaryQa',
    'CandidateProofReceipt',
    'ReviewFinalization'
)) {
    $Resolved = [System.IO.Path]::GetFullPath((Get-Variable -Name $Name -ValueOnly))
    Set-Variable -Name $Name -Value $Resolved
    if (-not (Test-Path -LiteralPath $Resolved -PathType Leaf)) {
        throw "$Name not found: $Resolved"
    }
}
$Output = [System.IO.Path]::GetFullPath($Output)
if (Test-Path -LiteralPath $Output) {
    throw "Production approved-source output is create-only and already exists: $Output"
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

    node .\apps\cli\dist\tile-map-production-approved-sources-cli.js `
        --package $SourcePackage `
        --review $Review `
        --qa $CandidateQa `
        --boundary $BoundaryQa `
        --proof $CandidateProofReceipt `
        --approval $ReviewFinalization `
        --output $Output
    if ($LASTEXITCODE -ne 0) {
        throw "Tile Map production approval export failed with exit code $LASTEXITCODE"
    }
    if (-not (Test-Path -LiteralPath $Output -PathType Leaf)) {
        throw "Tile Map production approval export was not produced: $Output"
    }

    $Manifest = Get-Content -LiteralPath $Output -Raw | ConvertFrom-Json
    if ($Manifest.eligible_for_sprite_studio -ne $true) {
        throw 'Production approval is not eligible for Sprite Studio.'
    }
    if ($Manifest.production_art_evidence_schema_version -lt 1) {
        throw 'Production approval is missing production-art evidence schema.'
    }
    if ($Manifest.production_evidence_authority -ne 'blocking-technical-and-review-evidence-only') {
        throw 'Production approval weakened evidence authority boundaries.'
    }
    foreach ($Field in @(
        'source_candidate_qa_fingerprint',
        'source_boundary_qa_fingerprint',
        'source_candidate_proof_receipt_fingerprint',
        'source_candidate_proof_aggregate_digest',
        'manifest_fingerprint'
    )) {
        if (-not $Manifest.$Field) {
            throw "Production approval is missing $Field"
        }
    }

    Write-Host 'TILE MAP PRODUCTION ART READY FOR SPRITE STUDIO'
    Write-Host "Manifest: $Output"
    Write-Host "Fingerprint: $($Manifest.manifest_fingerprint)"
    Write-Host "Candidate QA: $($Manifest.source_candidate_qa_fingerprint)"
    Write-Host "Boundary QA:  $($Manifest.source_boundary_qa_fingerprint)"
    Write-Host "Visual proof: $($Manifest.source_candidate_proof_receipt_fingerprint)"
}
finally {
    Pop-Location
}
