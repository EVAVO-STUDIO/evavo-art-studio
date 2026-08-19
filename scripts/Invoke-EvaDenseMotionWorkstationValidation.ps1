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
    try { return ($text | ConvertFrom-Json -Depth 16) }
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
    Invoke-NativeChecked -FilePath $Node -ArgumentList @('scripts/check-art-studio-workstation-v5-contract.mjs') -Label 'Art Studio Automation Fabric v5 validation'
    Invoke-NativeChecked -FilePath $Node -ArgumentList @('--test','scripts/test-art-studio-workstation-v5-contract.mjs') -Label 'Art Studio Automation Fabric v5 adversarial tests'

    $sourcePreflight = Invoke-NativeJsonChecked -FilePath $Node -ArgumentList @(
        'scripts/project-art/eva-dense-motion-source-preflight.mjs',
        '--runtime-root',
        $RuntimeRoot
    ) -Label 'EVA dense-motion source media preflight'
    if ($sourcePreflight.ok -ne $true -or [int]$sourcePreflight.pendingFrameCount -ne 7) {
        throw 'EVA dense-motion source media preflight did not verify all seven pending frames.'
    }

    $result = [ordered]@{
        schemaVersion = 2
        kind = 'evavo-eva-dense-motion-workstation-validation'
        ok = $true
        repository = 'EVAVO-STUDIO/evavo-art-studio'
        sourceRepository = 'EVAVO-STUDIO/evavo-avatar-runtime'
        headSha = $head
        worktreeEntryCount = @($statusLines).Count
        denseMotionFamily = 'eva-20260809-153620'
        pendingOrdinals = @(1, 2, 3, 7, 8, 9, 10)
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
            automationFabricV5 = 'passed'
            automationFabricV5Adversarial = 'passed'
            sourceMediaPreflight = 'passed'
        }
        sourcePreflight = $sourcePreflight
        authority = [ordered]@{
            sourceMutation = $false
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
    $result | ConvertTo-Json -Depth 16 -Compress
}
finally { Pop-Location }
