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

    [string]$Reason = 'Generate governed Tile Map Studio art candidates for Art Studio review.',

    [ValidateRange(1, 1440)]
    [int]$AuthorizationMinutes = 60,

    [ValidateRange(1, 16)]
    [int]$Concurrency = 1,

    [switch]$ExecuteProvider
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-NewOrEmptyDirectory([string]$PathValue, [string]$Label) {
    $Full = [System.IO.Path]::GetFullPath($PathValue)
    if (Test-Path -LiteralPath $Full) {
        $Items = @(Get-ChildItem -LiteralPath $Full -Force)
        if ($Items.Count -gt 0) {
            throw "$Label must be new or empty: $Full"
        }
    } else {
        New-Item -ItemType Directory -Path $Full -Force | Out-Null
    }
    return $Full
}

function Test-PathContains([string]$Parent, [string]$Child) {
    $ParentFull = [System.IO.Path]::GetFullPath($Parent).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )
    $ChildFull = [System.IO.Path]::GetFullPath($Child)
    if ($ParentFull -eq $ChildFull) {
        return $true
    }
    $Prefix = $ParentFull + [System.IO.Path]::DirectorySeparatorChar
    return $ChildFull.StartsWith($Prefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-DisjointRoots([string]$Left, [string]$LeftLabel, [string]$Right, [string]$RightLabel) {
    if ((Test-PathContains $Left $Right) -or (Test-PathContains $Right $Left)) {
        throw "$LeftLabel and $RightLabel must be fully disjoint: '$Left' and '$Right'"
    }
}

function Invoke-Checked([string]$Label, [scriptblock]$Action) {
    Write-Host ""
    Write-Host $Label
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Handoff = [System.IO.Path]::GetFullPath($Handoff)
if (-not (Test-Path -LiteralPath $Handoff -PathType Leaf)) {
    throw "Tile Map handoff not found: $Handoff"
}
$EvidenceRoot = Assert-NewOrEmptyDirectory $EvidenceRoot 'EvidenceRoot'
$RuntimeRoot = Assert-NewOrEmptyDirectory $RuntimeRoot 'RuntimeRoot'
$ArtifactRoot = Assert-NewOrEmptyDirectory $ArtifactRoot 'ArtifactRoot'
Assert-DisjointRoots $EvidenceRoot 'EvidenceRoot' $RuntimeRoot 'RuntimeRoot'
Assert-DisjointRoots $EvidenceRoot 'EvidenceRoot' $ArtifactRoot 'ArtifactRoot'
Assert-DisjointRoots $RuntimeRoot 'RuntimeRoot' $ArtifactRoot 'ArtifactRoot'
if ($AllowedAdapters.Count -lt 1) {
    throw 'At least one AllowedAdapters entry is required.'
}
$AdapterCsv = ($AllowedAdapters | Sort-Object -Unique) -join ','

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

    Invoke-Checked 'COMPILING TILE MAP PRE-PROVIDER EVIDENCE' {
        pnpm art -- tile-map-preprovider --input $Handoff --output-root $EvidenceRoot
    }

    $CandidateBatch = Join-Path $EvidenceRoot '03-candidate-batch.json'
    $ProviderBatch = Join-Path $EvidenceRoot '04-provider-runtime-batch.json'
    foreach ($Required in @($CandidateBatch, $ProviderBatch)) {
        if (-not (Test-Path -LiteralPath $Required -PathType Leaf)) {
            throw "Pre-provider evidence was not produced: $Required"
        }
    }

    $AuthorizedAt = (Get-Date).ToUniversalTime()
    $ExpiresAt = $AuthorizedAt.AddMinutes($AuthorizationMinutes)
    $AuthorizedAtText = $AuthorizedAt.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    $ExpiresAtText = $ExpiresAt.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    $Authorization = Join-Path $EvidenceRoot '05-provider-authorization.json'

    Invoke-Checked 'AUTHORIZING EXACT TILE MAP PROVIDER JOBS' {
        node .\scripts\tile-map-provider-authorize.mjs `
            --provider-batch $ProviderBatch `
            --runtime-root $RuntimeRoot `
            --artifact-root $ArtifactRoot `
            --output $Authorization `
            --allowed-adapters $AdapterCsv `
            --authorized-by $AuthorizedBy `
            --reason $Reason `
            --authorized-at $AuthorizedAtText `
            --expires-at $ExpiresAtText
    }

    Invoke-Checked 'VALIDATING AUTHORIZATION WITHOUT PROVIDER EXECUTION' {
        node .\scripts\validate-tile-map-provider-authorization.mjs $Authorization
    }

    if (-not $ExecuteProvider) {
        Write-Host ""
        Write-Host 'TILE MAP PROVIDER PIPELINE AUTHORIZED BUT NOT EXECUTED'
        Write-Host "Evidence:      $EvidenceRoot"
        Write-Host "Runtime:       $RuntimeRoot"
        Write-Host "Artifacts:     $ArtifactRoot"
        Write-Host "Authorization: $Authorization"
        Write-Host "Expires:       $ExpiresAtText"
        Write-Host ""
        Write-Host 'To execute this exact authorization before expiry, run:'
        Write-Host ".\scripts\Resume-TileMapAuthorizedProvider.ps1 -Authorization '$Authorization' -EvidenceRoot '$EvidenceRoot' -Concurrency $Concurrency"
        return
    }

    $ExecutionReceipt = Join-Path $EvidenceRoot '06-provider-execution.receipt.json'
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

    $MasteringReceipt = Join-Path $EvidenceRoot '07-candidate-mastering.receipt.json'
    Invoke-Checked 'MASTERING PROVIDER CANDIDATES TO EXACT GAME RESOLUTION' {
        node .\scripts\run-tile-map-candidate-mastering.mjs `
            --provider-batch $ProviderBatch `
            --execution-receipt $ExecutionReceipt `
            --concurrency $Concurrency `
            --receipt $MasteringReceipt
    }

    $CandidateRoot = Join-Path $EvidenceRoot '08-mastered-provider-results'
    Invoke-Checked 'MATERIALIZING VERIFIED MASTERED CANDIDATES FOR REVIEW' {
        node .\scripts\materialize-tile-map-provider-results.mjs `
            --provider-batch $ProviderBatch `
            --execution-receipt $ExecutionReceipt `
            --mastering-receipt $MasteringReceipt `
            --artifact-root $ArtifactRoot `
            --output-root $CandidateRoot
    }

    $ProviderResults = Join-Path $CandidateRoot 'provider-results.json'
    $Review = Join-Path $EvidenceRoot '09-candidate-review.json'
    Invoke-Checked 'COMPILING ART STUDIO CANDIDATE REVIEW INTAKE' {
        pnpm art -- tile-map-candidate-review `
            --batch $CandidateBatch `
            --results $ProviderResults `
            --output $Review
    }

    Write-Host ""
    Write-Host 'TILE MAP MASTERED CANDIDATES READY FOR REVIEW'
    Write-Host "Provider receipt:  $ExecutionReceipt"
    Write-Host "Mastering receipt: $MasteringReceipt"
    Write-Host "Review manifest:   $Review"
    Write-Host "Candidate root:    $CandidateRoot"
    Write-Host ""
    Write-Host 'No candidate has structural, visual or creative approval yet.'
}
finally {
    Pop-Location
}
