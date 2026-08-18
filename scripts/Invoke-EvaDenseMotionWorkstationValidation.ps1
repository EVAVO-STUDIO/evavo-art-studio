[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
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
    if ($exitCode -ne 0) {
        throw "$Label failed with native exit code $exitCode."
    }
}

Push-Location $RepoRoot
try {
    $global:LASTEXITCODE = 0
    $head = (& $Git 'rev-parse' 'HEAD').Trim()
    $headExit = [int]$global:LASTEXITCODE
    if ($headExit -ne 0 -or $head -notmatch '^[0-9a-f]{40}$') {
        throw "Unable to resolve exact repository HEAD."
    }

    $global:LASTEXITCODE = 0
    $statusLines = @(& $Git 'status' '--porcelain=v1' '--untracked-files=all')
    $statusExit = [int]$global:LASTEXITCODE
    if ($statusExit -ne 0) {
        throw "Unable to read exact repository worktree status."
    }

    Invoke-NativeChecked -FilePath $Node -ArgumentList @(
        '--check',
        'scripts/check-project-art-eva-dense-motion-work-order.mjs'
    ) -Label 'EVA dense-motion guard syntax validation'

    Invoke-NativeChecked -FilePath $Node -ArgumentList @(
        'scripts/check-project-art-eva-dense-motion-work-order.mjs'
    ) -Label 'EVA dense-motion work-order and release-evidence validation'

    Invoke-NativeChecked -FilePath $Node -ArgumentList @(
        'scripts/check-art-studio-workstation-v5-contract.mjs'
    ) -Label 'Art Studio Automation Fabric v5 validation'

    Invoke-NativeChecked -FilePath $Node -ArgumentList @(
        '--test',
        'scripts/test-art-studio-workstation-v5-contract.mjs'
    ) -Label 'Art Studio Automation Fabric v5 adversarial tests'

    $result = [ordered]@{
        schemaVersion = 1
        kind = 'evavo-eva-dense-motion-workstation-validation'
        ok = $true
        repository = 'EVAVO-STUDIO/evavo-art-studio'
        headSha = $head
        worktreeEntryCount = @($statusLines).Count
        denseMotionFamily = 'eva-20260809-153620'
        pendingOrdinals = @(1, 2, 3, 7, 8, 9, 10)
        checks = [ordered]@{
            denseMotionGuard = 'passed'
            releaseEvidence = 'passed'
            automationFabricV5 = 'passed'
            automationFabricV5Adversarial = 'passed'
        }
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

    $result | ConvertTo-Json -Depth 8 -Compress
}
finally {
    Pop-Location
}
