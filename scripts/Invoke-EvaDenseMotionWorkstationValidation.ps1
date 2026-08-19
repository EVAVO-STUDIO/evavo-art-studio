[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$GitRoot = Split-Path -Parent $RepoRoot
$RuntimeRoot = Join-Path $GitRoot 'evavo-avatar-runtime'
$Node = (Get-Command node -ErrorAction Stop).Source
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
    if ($exitCode -ne 0) { throw "$Label failed with native exit code $exitCode." }
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
    if ($exitCode -ne 0) { throw "$Label failed with native exit code $exitCode." }
    $text = ($output | Out-String).Trim()
    if (-not $text) { throw "$Label returned no JSON evidence." }
    try { return ($text | ConvertFrom-Json -Depth 32) }
    catch { throw "$Label returned invalid JSON evidence." }
}

Push-Location $RepoRoot
try {
    $global:LASTEXITCODE = 0
    $head = (& $Git 'rev-parse' 'HEAD').Trim()
    $headExit = [int]$global:LASTEXITCODE
    if ($headExit -ne 0 -or $head -notmatch '^[0-9a-f]{40}$') { throw 'Unable to resolve exact repository HEAD.' }

    $global:LASTEXITCODE = 0
    $statusLines = @(& $Git 'status' '--porcelain=v1' '--untracked-files=all')
    $statusExit = [int]$global:LASTEXITCODE
    if ($statusExit -ne 0) { throw 'Unable to read exact repository worktree status.' }

    if (-not (Test-Path -LiteralPath $RuntimeRoot -PathType Container)) {
        throw "Expected Avatar Runtime sibling checkout is unavailable: $RuntimeRoot"
    }

    Invoke-NativeChecked -FilePath $Node -ArgumentList @('--check','scripts/check-project-art-eva-dense-motion-work-order.mjs') -Label 'EVA dense-motion guard syntax validation'
    Invoke-NativeChecked -FilePath $Node -ArgumentList @('scripts/check-project-art-eva-dense-motion-work-order.mjs') -Label 'EVA dense-motion work-order and release-evidence validation'
    Invoke-NativeChecked -FilePath $Node -ArgumentList @('--check','scripts/compile-project-art-eva-dense-motion-ten-master.mjs') -Label 'EVA ten-master compiler syntax validation'
    Invoke-NativeChecked -FilePath $Node -ArgumentList @('--test','scripts/test-project-art-eva-dense-motion-ten-master.mjs') -Label 'EVA ten-master planning regressions'
    Invoke-NativeChecked -FilePath $Node -ArgumentList @('--check','scripts/project-art/eva-dense-motion-source-materialization.mjs') -Label 'EVA source materialization syntax validation'
    Invoke-NativeChecked -FilePath $Node -ArgumentList @('--check','scripts/run-project-art-eva-dense-motion-source-materialization.mjs') -Label 'EVA source materialization CLI syntax validation'
    Invoke-NativeChecked -FilePath $Node -ArgumentList @('--test','scripts/test-project-art-eva-dense-motion-source-materialization.mjs','scripts/test-project-art-eva-dense-motion-source-materialization-cli.mjs') -Label 'EVA source materialization regressions'
    Invoke-NativeChecked -FilePath $Node -ArgumentList @('scripts/check-art-studio-workstation-v5-contract.mjs') -Label 'Art Studio Automation Fabric v5 validation'
    Invoke-NativeChecked -FilePath $Node -ArgumentList @('--test','scripts/test-art-studio-workstation-v5-contract.mjs') -Label 'Art Studio Automation Fabric v5 adversarial tests'

    $sourcePreflight = Invoke-NativeJsonChecked -FilePath $Node -ArgumentList @(
        'scripts/project-art/eva-dense-motion-source-preflight.mjs',
        '--runtime-root',
        $RuntimeRoot
    ) -Label 'EVA dense-motion ten-source media preflight'
    if (
        $sourcePreflight.ok -ne $true -or
        [int]$sourcePreflight.sourceFrameCount -ne 10 -or
        @($sourcePreflight.sourceOrdinals).Count -ne 10
    ) {
        throw 'EVA dense-motion source media preflight did not verify all ten required source frames.'
    }

    $TempRoot = Join-Path ([IO.Path]::GetTempPath()) ('evavo-eva-source-' + [Guid]::NewGuid().ToString('N'))
    $ProgramPath = Join-Path $TempRoot 'ten-master-program.json'
    $WorkspaceRoot = Join-Path $TempRoot 'workspace'
    [void][IO.Directory]::CreateDirectory($TempRoot)
    [void][IO.Directory]::CreateDirectory($WorkspaceRoot)
    try {
        Invoke-NativeChecked -FilePath $Node -ArgumentList @(
            'scripts/compile-project-art-eva-dense-motion-ten-master.mjs',
            '--program-id',
            'eva-dense-source-workstation-preflight-v2',
            '--actor-id',
            'eva-dense-source-workstation-validator',
            '--created-at',
            '2026-08-20T01:20:00.000Z',
            '--output',
            $ProgramPath
        ) -Label 'EVA ten-master workstation programme compilation'

        $sourceMaterializationPlan = Invoke-NativeJsonChecked -FilePath $Node -ArgumentList @(
            'scripts/run-project-art-eva-dense-motion-source-materialization.mjs',
            'preflight',
            '--program',
            $ProgramPath,
            '--runtime-root',
            $RuntimeRoot,
            '--workspace-root',
            $WorkspaceRoot,
            '--materialized-at',
            '2026-08-20T01:21:00.000Z'
        ) -Label 'EVA ten-source materialization campaign preflight'
        if (
            $sourceMaterializationPlan.status -ne 'ready-for-ten-source-frame-materialization' -or
            @($sourceMaterializationPlan.frames).Count -ne 10 -or
            $sourceMaterializationPlan.policy.allTenSourcesPreflightBeforeFirstWrite -ne $true -or
            $sourceMaterializationPlan.policy.candidateCreationAllowed -ne $false -or
            $sourceMaterializationPlan.policy.runtimeActivationAllowed -ne $false
        ) {
            throw 'EVA ten-source materialization campaign plan widened or lost exact coverage.'
        }
    }
    finally {
        if ([IO.Directory]::Exists($TempRoot)) {
            [IO.Directory]::Delete($TempRoot, $true)
        }
    }

    $result = [ordered]@{
        schemaVersion = 3
        kind = 'evavo-eva-dense-motion-workstation-validation'
        ok = $true
        repository = 'EVAVO-STUDIO/evavo-art-studio'
        sourceRepository = 'EVAVO-STUDIO/evavo-avatar-runtime'
        headSha = $head
        worktreeEntryCount = @($statusLines).Count
        denseMotionFamily = 'eva-20260809-153620'
        pendingOrdinals = @(1, 2, 3, 7, 8, 9, 10)
        sourceOrdinals = @(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
        sourceMaterialization = [ordered]@{
            planSchema = 'evavo.project-art-eva-dense-motion-source-materialization-plan.v1'
            campaignScript = 'scripts/run-project-art-eva-dense-motion-source-materialization.mjs'
            requiredSourceFrameCount = 10
            allTenSourcesPreflightBeforeFirstWrite = $true
            byteForByteWorkspaceCopy = $true
            completedFrameBoundaryResumeSupported = $true
            midFramePartialStateRejected = $true
            candidateCreationAllowed = $false
            executionByValidationTask = $false
        }
        tenMasterPlanning = [ordered]@{
            schema = 'evavo.project-art-eva-dense-motion-ten-master-program.v2'
            compilerScript = 'scripts/compile-project-art-eva-dense-motion-ten-master.mjs'
            requiredFinalOrdinals = @(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
            requiredNewMasterCount = 10
            currentFallbackOrdinals = @(4, 5, 6)
            fallbackRemasterOrdinals = @(4, 5, 6)
            legacyFallbackMaySatisfyFinalMasterGate = $false
            atomicTenMasterActivationRequired = $true
            executionByThisTask = $false
        }
        checks = [ordered]@{
            denseMotionGuard = 'passed'
            releaseEvidence = 'passed'
            tenMasterProgram = 'passed'
            sourceMediaPreflight = 'passed'
            sourceMaterializationContract = 'passed'
            sourceMaterializationPlan = 'passed'
            automationFabricV5 = 'passed'
            automationFabricV5Adversarial = 'passed'
        }
        sourcePreflight = $sourcePreflight
        sourceMaterializationPlan = $sourceMaterializationPlan
        authority = [ordered]@{
            sourceMutation = $false
            sourceCopyWrite = $false
            candidateCreation = $false
            candidateApproval = $false
            candidatePromotion = $false
            providerExecution = $false
            cloudinaryUpload = $false
            repositoryCommit = $false
            repositoryPush = $false
            publication = $false
            deployment = $false
            runtimeActivation = $false
            forcePush = $false
        }
    }
    $result | ConvertTo-Json -Depth 32 -Compress
}
finally { Pop-Location }
