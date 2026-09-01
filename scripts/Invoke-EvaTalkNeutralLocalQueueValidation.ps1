[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-f]{40}$')]
    [string]$ExpectedHeadSha,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-f]{40}$')]
    [string]$ExpectedMainSha
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if (-not $IsWindows) {
    throw 'The EVA talk-neutral queue release gate must run under pwsh on Windows.'
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Node = (Get-Command node -ErrorAction Stop).Source
$Pnpm = (Get-Command pnpm -ErrorAction Stop).Source
$Git = (Get-Command git -ErrorAction Stop).Source
$ExpectedRepository = 'EVAVO-STUDIO/evavo-art-studio'
$ExpectedNodeVersion = 'v22.14.0'
$ExpectedPnpmVersion = '10.13.1'
$OriginPattern = '^(?:https://github\.com/EVAVO-STUDIO/evavo-art-studio(?:\.git)?|git@github\.com:EVAVO-STUDIO/evavo-art-studio(?:\.git)?|ssh://git@github\.com/EVAVO-STUDIO/evavo-art-studio(?:\.git)?|git://github\.com/EVAVO-STUDIO/evavo-art-studio(?:\.git)?)$'
$ExpectedChangedFiles = @(
    '.gitattributes',
    'config/eva-talk-neutral-local-materialization-campaign-v1.json',
    'config/eva-talk-neutral-local-materialization-capability-v1.json',
    'config/eva-talk-neutral-local-materialization-workstation-validation-v1.json',
    'docs/EVA_TALK_NEUTRAL_LOCAL_MATERIALIZATION_QUEUE.md',
    'docs/eva-talk-neutral-local-materialization-operator-checklist.md',
    'scripts/Invoke-EvaTalkNeutralLocalQueueValidation.ps1',
    'scripts/check-eva-talk-neutral-local-materialization-queue.mjs',
    'scripts/eva-talk-neutral-local-materialization-queue.mjs',
    'scripts/project-art/eva-talk-neutral-local-materialization-queue.mjs',
    'scripts/project-art/eva-talk-neutral-local-queue-campaign.mjs',
    'scripts/project-art/eva-talk-neutral-local-queue-claims.mjs',
    'scripts/project-art/eva-talk-neutral-local-queue-common.mjs',
    'scripts/project-art/eva-talk-neutral-local-queue-completion.mjs',
    'scripts/project-art/eva-talk-neutral-local-queue-init.mjs',
    'scripts/project-art/eva-talk-neutral-local-queue-png.mjs',
    'scripts/test-eva-talk-neutral-local-materialization-queue-cli.mjs',
    'scripts/test-eva-talk-neutral-local-materialization-queue.mjs',
    'scripts/test-eva-talk-neutral-local-materialization-workstation-validation.mjs'
)

function Write-NativeDiagnostic {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [object[]]$Output
    )

    foreach ($Line in $Output) {
        [Console]::Error.WriteLine([string]$Line)
    }
}

function Invoke-NativeCaptured {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $global:LASTEXITCODE = 0
    $output = @(& $FilePath @ArgumentList 2>&1)
    $exitCode = [int]$global:LASTEXITCODE
    if ($exitCode -ne 0) {
        Write-NativeDiagnostic -Output $output
        throw "$Label failed with native exit code $exitCode."
    }

    return @($output | ForEach-Object { [string]$_ })
}

function Invoke-NativeChecked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $output = @(Invoke-NativeCaptured -FilePath $FilePath -ArgumentList $ArgumentList -Label $Label)
    Write-NativeDiagnostic -Output $output
}

function Invoke-NativeTextChecked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $output = @(Invoke-NativeCaptured -FilePath $FilePath -ArgumentList $ArgumentList -Label $Label)
    return (($output -join "`n").Trim())
}

function Invoke-NativeJsonChecked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $text = Invoke-NativeTextChecked -FilePath $FilePath -ArgumentList $ArgumentList -Label $Label
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
    return @(
        Invoke-NativeCaptured -FilePath $Git -ArgumentList @(
            'status',
            '--porcelain=v1',
            '--untracked-files=all'
        ) -Label 'Repository worktree status'
    )
}

function Assert-ExactRepositoryState {
    $HeadSha = Invoke-NativeTextChecked -FilePath $Git -ArgumentList @(
        'rev-parse',
        '--verify',
        'HEAD'
    ) -Label 'Exact repository HEAD'

    if ($HeadSha -notmatch '^[0-9a-f]{40}$' -or $HeadSha -ne $ExpectedHeadSha) {
        throw "Repository HEAD $HeadSha does not match expected head $ExpectedHeadSha."
    }

    $OriginUrl = Invoke-NativeTextChecked -FilePath $Git -ArgumentList @(
        'remote',
        'get-url',
        'origin'
    ) -Label 'Repository origin URL'

    if ($OriginUrl -notmatch $OriginPattern) {
        throw "Repository origin $OriginUrl is not $ExpectedRepository."
    }

    $OriginMainSha = Invoke-NativeTextChecked -FilePath $Git -ArgumentList @(
        'rev-parse',
        '--verify',
        'refs/remotes/origin/main'
    ) -Label 'Fetched origin/main'

    if (
        $OriginMainSha -notmatch '^[0-9a-f]{40}$' -or
        $OriginMainSha -ne $ExpectedMainSha
    ) {
        throw "Fetched origin/main $OriginMainSha does not match expected main $ExpectedMainSha."
    }

    Invoke-NativeChecked -FilePath $Git -ArgumentList @(
        'merge-base',
        '--is-ancestor',
        $ExpectedMainSha,
        $HeadSha
    ) -Label 'Main ancestry check'

    $AheadText = Invoke-NativeTextChecked -FilePath $Git -ArgumentList @(
        'rev-list',
        '--count',
        "$ExpectedMainSha..$HeadSha"
    ) -Label 'Pull-request commit count'

    $AheadCount = 0
    if (-not [int]::TryParse($AheadText, [ref]$AheadCount) -or $AheadCount -lt 1) {
        throw 'The exact pull-request head must contain at least one commit after expected main.'
    }

    $ObservedChangedFiles = @(
        Invoke-NativeCaptured -FilePath $Git -ArgumentList @(
            'diff',
            '--name-only',
            '--diff-filter=ACMRD',
            "$ExpectedMainSha..$HeadSha",
            '--'
        ) -Label 'Exact changed-file inventory' |
            Where-Object { $_ } |
            Sort-Object -Unique
    )

    $ChangedFileDifference = @(
        Compare-Object -ReferenceObject $ExpectedChangedFiles -DifferenceObject $ObservedChangedFiles
    )
    if (
        $ObservedChangedFiles.Count -ne $ExpectedChangedFiles.Count -or
        $ChangedFileDifference.Count -ne 0
    ) {
        throw (
            "The pull-request changed-file set drifted.`nExpected:`n" +
            ($ExpectedChangedFiles -join "`n") +
            "`nObserved:`n" +
            ($ObservedChangedFiles -join "`n")
        )
    }

    return [pscustomobject]@{
        headSha = $HeadSha
        originMainSha = $OriginMainSha
        originUrl = $OriginUrl
        aheadCount = $AheadCount
        changedFiles = $ObservedChangedFiles
    }
}

Push-Location $RepoRoot
try {
    $NodeVersion = Invoke-NativeTextChecked -FilePath $Node -ArgumentList @(
        '--version'
    ) -Label 'Node.js version check'
    if ($NodeVersion -ne $ExpectedNodeVersion) {
        throw "Node.js $ExpectedNodeVersion is required; observed $NodeVersion."
    }

    $PnpmVersion = Invoke-NativeTextChecked -FilePath $Pnpm -ArgumentList @(
        '--version'
    ) -Label 'pnpm version check'
    if ($PnpmVersion -ne $ExpectedPnpmVersion) {
        throw "pnpm $ExpectedPnpmVersion is required; observed $PnpmVersion."
    }

    $InitialStatus = @(Read-GitStatus)
    if ($InitialStatus.Count -ne 0) {
        throw 'The EVA talk-neutral queue validation requires a clean working tree.'
    }

    $InitialState = Assert-ExactRepositoryState
    $DiffRange = "$ExpectedMainSha..$ExpectedHeadSha"

    Invoke-NativeChecked -FilePath $Git -ArgumentList @(
        'diff',
        '--check',
        $DiffRange,
        '--'
    ) -Label 'Pull-request diff formatting check'

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
        Invoke-NativeChecked -FilePath $Node -ArgumentList @(
            '--check',
            $File
        ) -Label "Syntax check: $File"
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

    $TempRoot = Join-Path ([IO.Path]::GetTempPath()) (
        'evavo-eva-talk-neutral-queue-' + [Guid]::NewGuid().ToString('N')
    )
    $QueueRoot = Join-Path $TempRoot 'queue'
    [void][IO.Directory]::CreateDirectory($TempRoot)
    try {
        $CampaignPath = Join-Path $RepoRoot (
            'config\eva-talk-neutral-local-materialization-campaign-v1.json'
        )
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

    Invoke-NativeChecked -FilePath $Pnpm -ArgumentList @(
        'check'
    ) -Label 'Complete local Art Studio validation'

    Invoke-NativeChecked -FilePath $Git -ArgumentList @(
        'diff',
        '--check',
        $DiffRange,
        '--'
    ) -Label 'Post-validation pull-request diff formatting check'

    $FinalStatus = @(Read-GitStatus)
    if ($FinalStatus.Count -ne 0) {
        throw 'Validation changed repository source or retained generated residue.'
    }

    $FinalState = Assert-ExactRepositoryState
    if (
        $FinalState.headSha -ne $InitialState.headSha -or
        $FinalState.originMainSha -ne $InitialState.originMainSha
    ) {
        throw 'Repository refs changed during validation.'
    }

    $Result = [ordered]@{
        schemaVersion = 2
        kind = 'evavo-eva-talk-neutral-local-queue-workstation-validation'
        ok = $true
        repository = $ExpectedRepository
        originUrl = $FinalState.originUrl
        headSha = $FinalState.headSha
        expectedHeadSha = $ExpectedHeadSha
        mainSha = $FinalState.originMainSha
        expectedMainSha = $ExpectedMainSha
        aheadCount = $FinalState.aheadCount
        changedFileCount = $FinalState.changedFiles.Count
        changedFiles = @($FinalState.changedFiles)
        diffRange = $DiffRange
        operatingSystem = 'windows'
        powershellVersion = $PSVersionTable.PSVersion.ToString()
        nodeVersion = $NodeVersion.TrimStart('v')
        pnpmVersion = $PnpmVersion
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
