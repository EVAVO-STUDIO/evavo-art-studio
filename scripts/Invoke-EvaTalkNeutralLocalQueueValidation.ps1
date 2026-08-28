[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidatePattern('^[0-9a-f]{40}$')]
    [string]$ExpectedHeadSha = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Node = (Get-Command node -ErrorAction Stop).Source
$Pnpm = (Get-Command pnpm -ErrorAction Stop).Source
$Git = (Get-Command git -ErrorAction Stop).Source

function Invoke-NativeChecked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $global:LASTEXITCODE = 0
    & $FilePath @ArgumentList
    $exitCode = [int]$global:LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "$Label failed with native exit code $exitCode."
    }
}

function Invoke-NativeJsonChecked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $global:LASTEXITCODE = 0
    $output = @(& $FilePath @ArgumentList)
    $exitCode = [int]$global:LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "$Label failed with native exit code $exitCode."
    }

    $text = ($output | Out-String).Trim()
    if (-not $text) {
        throw "$Label returned no JSON evidence."
    }

    try {
        return ($text | ConvertFrom-Json -Depth 64)
    }
    catch {
        throw "$Label returned invalid JSON evidence."
    }
}

function Read-GitStatus {
    $global:LASTEXITCODE = 0
    $lines = @(& $Git 'status' '--porcelain=v1' '--untracked-files=all')
    if ([int]$global:LASTEXITCODE -ne 0) {
        throw 'Unable to read the repository worktree status.'
    }
    return @($lines)
}

Push-Location $RepoRoot
try {
    $global:LASTEXITCODE = 0
    $HeadSha = (& $Git 'rev-parse' 'HEAD').Trim()
    if (
        [int]$global:LASTEXITCODE -ne 0 -or
        $HeadSha -notmatch '^[0-9a-f]{40}$'
    ) {
        throw 'Unable to resolve the exact repository HEAD.'
    }

    if ($ExpectedHeadSha -and $HeadSha -ne $ExpectedHeadSha) {
        throw "Repository HEAD $HeadSha does not match expected head $ExpectedHeadSha."
    }

    $InitialStatus = Read-GitStatus
    if (@($InitialStatus).Count -ne 0) {
        throw 'The EVA talk-neutral queue validation requires a clean working tree.'
    }

    $NodeFiles = @(
        'scripts/project-art/eva-talk-neutral-local-queue-common.mjs',
        'scripts/project-art/eva-talk-neutral-local-queue-png.mjs',
        'scripts/project-art/eva-talk-neutral-local-queue-campaign.mjs',
        'scripts/project-art/eva-talk-neutral-local-queue-init.mjs',
        'scripts/project-art/eva-talk-neutral-local-queue-claims.mjs',
        'scripts/project-art/eva-talk-neutral-local-queue-completion.mjs',
        'scripts/project-art/eva-talk-neutral-local-materialization-queue.mjs',
        'scripts/eva-talk-neutral-local-materialization-queue.mjs',
        'scripts/check-eva-talk-neutral-local-materialization-queue.mjs',
        'scripts/test-eva-talk-neutral-local-materialization-queue.mjs',
        'scripts/test-eva-talk-neutral-local-materialization-queue-cli.mjs',
        'scripts/test-eva-talk-neutral-local-materialization-workstation-validation.mjs'
    )

    foreach ($File in $NodeFiles) {
        Invoke-NativeChecked -FilePath $Node -ArgumentList @('--check', $File) -Label "Syntax check: $File"
    }

    Invoke-NativeChecked -FilePath $Node -ArgumentList @(
        'scripts/check-eva-talk-neutral-local-materialization-queue.mjs'
    ) -Label 'EVA talk-neutral local queue contract check'

    Invoke-NativeChecked -FilePath $Node -ArgumentList @(
        '--test',
        'scripts/test-eva-talk-neutral-local-materialization-queue.mjs',
        'scripts/test-eva-talk-neutral-local-materialization-queue-cli.mjs',
        'scripts/test-eva-talk-neutral-local-materialization-workstation-validation.mjs'
    ) -Label 'EVA talk-neutral local queue focused tests'

    $TempRoot = Join-Path ([IO.Path]::GetTempPath()) ('evavo-eva-talk-neutral-queue-' + [Guid]::NewGuid().ToString('N'))
    $QueueRoot = Join-Path $TempRoot 'queue'
    [void][IO.Directory]::CreateDirectory($TempRoot)
    try {
        $CampaignPath = Join-Path $RepoRoot 'config\eva-talk-neutral-local-materialization-campaign-v1.json'
        $Initialised = Invoke-NativeJsonChecked -FilePath $Node -ArgumentList @(
            'scripts/eva-talk-neutral-local-materialization-queue.mjs',
            'init',
            '--queue-root',
            $QueueRoot,
            '--campaign',
            $CampaignPath,
            '--at',
            '2026-08-28T00:01:00.000Z'
        ) -Label 'Local queue initialisation exercise'

        if (
            $Initialised.status -ne 'initialized' -or
            [int]$Initialised.counts.pending -ne 8
        ) {
            throw 'The local queue initialisation exercise did not create all eight packets.'
        }

        $Claimed = Invoke-NativeJsonChecked -FilePath $Node -ArgumentList @(
            'scripts/eva-talk-neutral-local-materialization-queue.mjs',
            'claim',
            '--queue-root',
            $QueueRoot,
            '--worker-id',
            'workstation-validator',
            '--lease-seconds',
            '300',
            '--at',
            '2026-08-28T00:02:00.000Z'
        ) -Label 'Local queue claim exercise'

        if (
            $Claimed.status -ne 'claimed' -or
            $Claimed.packet.jobId -ne 'eva-talk-neutral-batch-01'
        ) {
            throw 'The local queue claim exercise did not atomically claim the first packet.'
        }

        $Heartbeat = Invoke-NativeJsonChecked -FilePath $Node -ArgumentList @(
            'scripts/eva-talk-neutral-local-materialization-queue.mjs',
            'heartbeat',
            '--queue-root',
            $QueueRoot,
            '--claim-id',
            [string]$Claimed.claim.claimId,
            '--worker-id',
            'workstation-validator',
            '--lease-seconds',
            '300',
            '--at',
            '2026-08-28T00:03:00.000Z'
        ) -Label 'Local queue heartbeat exercise'

        if (
            $Heartbeat.status -ne 'heartbeat-recorded' -or
            [int]$Heartbeat.heartbeat.heartbeatSequence -ne 1
        ) {
            throw 'The local queue heartbeat exercise did not record one bounded lease extension.'
        }

        $Failed = Invoke-NativeJsonChecked -FilePath $Node -ArgumentList @(
            'scripts/eva-talk-neutral-local-materialization-queue.mjs',
            'fail',
            '--queue-root',
            $QueueRoot,
            '--claim-id',
            [string]$Claimed.claim.claimId,
            '--worker-id',
            'workstation-validator',
            '--failure-code',
            'VALIDATION_EXERCISE_COMPLETE',
            '--failure-message',
            'The validation exercise intentionally closes without producing candidate media.',
            '--at',
            '2026-08-28T00:03:20.000Z'
        ) -Label 'Local queue failure-receipt exercise'

        if (
            $Failed.status -ne 'failed' -or
            $Failed.failure.retryAuthorized -ne $false -or
            $Failed.failure.candidateApprovalGranted -ne $false
        ) {
            throw 'The local queue failure exercise widened retry or approval authority.'
        }

        $Status = Invoke-NativeJsonChecked -FilePath $Node -ArgumentList @(
            'scripts/eva-talk-neutral-local-materialization-queue.mjs',
            'status',
            '--queue-root',
            $QueueRoot,
            '--at',
            '2026-08-28T00:03:30.000Z'
        ) -Label 'Local queue status exercise'

        if (
            [int]$Status.counts.pending -ne 7 -or
            [int]$Status.counts.claimed -ne 0 -or
            [int]$Status.counts.completed -ne 0 -or
            [int]$Status.counts.failed -ne 1 -or
            [int]$Status.counts.orphans -ne 0 -or
            [int]$Status.counts.total -ne 8
        ) {
            throw 'The local queue status exercise did not preserve the exact eight-job lifecycle.'
        }
    }
    finally {
        if ([IO.Directory]::Exists($TempRoot)) {
            [IO.Directory]::Delete($TempRoot, $true)
        }
    }

    Invoke-NativeChecked -FilePath $Pnpm -ArgumentList @('check') -Label 'Complete local Art Studio validation'
    Invoke-NativeChecked -FilePath $Git -ArgumentList @('diff', '--check') -Label 'Repository diff formatting check'

    $FinalStatus = Read-GitStatus
    if (@($FinalStatus).Count -ne 0) {
        throw 'Validation changed repository source or retained generated residue.'
    }

    $Result = [ordered]@{
        schemaVersion = 1
        kind = 'evavo-eva-talk-neutral-local-queue-workstation-validation'
        ok = $true
        repository = 'EVAVO-STUDIO/evavo-art-studio'
        headSha = $HeadSha
        expectedHeadSha = if ($ExpectedHeadSha) { $ExpectedHeadSha } else { $null }
        campaignId = 'eva-talk-neutral-local-campaign-20260828-v2'
        campaignSha256 = 'e6c4c23eac5d5e6074e334599f19da53ca6a56073857dcd9fc6443ab1f065d74'
        packetCount = 8
        imagesPerPacket = 10
        candidateCount = 80
        semanticSelectionTargetFrameCount = 36
        syntaxChecks = $NodeFiles.Count
        focusedChecks = 'passed'
        concurrentClaimRace = 'passed-by-node-test'
        realCliLifecycleExercise = 'passed'
        completeLocalPnpmCheck = 'passed'
        repositoryCleanAfterValidation = $true
        authority = [ordered]@{
            networkAccess = $false
            providerExecution = $false
            paidExecution = $false
            candidateApproval = $false
            candidatePromotion = $false
            publication = $false
            runtimeActivation = $false
            websiteActivation = $false
            deployment = $false
            gitCommit = $false
            gitPush = $false
            forcePush = $false
        }
    }

    $Result | ConvertTo-Json -Depth 32 -Compress
}
finally {
    Pop-Location
}
