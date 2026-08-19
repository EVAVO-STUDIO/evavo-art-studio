[CmdletBinding()]
param(
    [string]$GitReposRoot = 'C:\GitRepos'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Checks = [Collections.Generic.List[object]]::new()
$Failures = [Collections.Generic.List[string]]::new()

function Add-Check {
    param([string]$Id, [bool]$Ok, [string]$Detail)
    $Checks.Add([ordered]@{ id = $Id; ok = $Ok; detail = $Detail }) | Out-Null
    if (-not $Ok) { $Failures.Add($Id) | Out-Null }
}

function Require-Directory {
    param([string]$Path, [string]$Id)
    $Present = Test-Path -LiteralPath $Path -PathType Container
    Add-Check $Id $Present $(if ($Present) { $Path } else { 'missing' })
    return $Present
}

function Require-File {
    param([string]$Path, [string]$Id)
    $Present = Test-Path -LiteralPath $Path -PathType Leaf
    Add-Check $Id $Present $(if ($Present) { $Path } else { 'missing' })
    return $Present
}

function Invoke-NativeChecked {
    param(
        [string]$Id,
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )
    $global:LASTEXITCODE = 0
    Push-Location -LiteralPath $WorkingDirectory
    try {
        $Output = & $FilePath @Arguments 2>&1
        $ExitCode = $global:LASTEXITCODE
    }
    finally {
        Pop-Location
    }
    $Detail = (($Output | Out-String).Trim())
    if ($Detail.Length -gt 1200) { $Detail = $Detail.Substring($Detail.Length - 1200) }
    Add-Check $Id ($ExitCode -eq 0) $("exit={0}; {1}" -f $ExitCode, $Detail)
    return ($ExitCode -eq 0)
}

function Test-Ancestor {
    param(
        [string]$Git,
        [string]$RepositoryPath,
        [string]$ReviewedSha,
        [string]$Id
    )
    $global:LASTEXITCODE = 0
    & $Git -C $RepositoryPath merge-base --is-ancestor $ReviewedSha HEAD 2>$null
    $ExitCode = $global:LASTEXITCODE
    Add-Check $Id ($ExitCode -eq 0) $("reviewed={0}; exit={1}" -f $ReviewedSha, $ExitCode)
}

$GitReposRoot = [IO.Path]::GetFullPath($GitReposRoot)
$Art = Join-Path $GitReposRoot 'evavo-art-studio'
$Runtime = Join-Path $GitReposRoot 'evavo-avatar-runtime'
$Development = Join-Path $GitReposRoot 'evavo-development-studio'
$LocalStorage = Join-Path $GitReposRoot 'evavo-local-storage'
$Website = Join-Path $GitReposRoot 'next-website'

foreach ($Pair in @(
    @('art-studio', $Art),
    @('avatar-runtime', $Runtime),
    @('development-studio', $Development),
    @('local-storage', $LocalStorage),
    @('next-website', $Website)
)) {
    [void](Require-Directory $Pair[1] ("repo-{0}" -f $Pair[0]))
}

$Node = Get-Command node -ErrorAction SilentlyContinue
$Git = Get-Command git -ErrorAction SilentlyContinue
Add-Check 'tool-node' ([bool]$Node) $(if ($Node) { $Node.Source } else { 'missing' })
Add-Check 'tool-git' ([bool]$Git) $(if ($Git) { $Git.Source } else { 'missing' })

$ClientPath = Join-Path $Art 'config\automation-fabric-client-v5.json'
$TasksPath = Join-Path $Art 'evavo.tasks.json'
$LocalPyProject = Join-Path $LocalStorage 'pyproject.toml'
$NamedTaskCompiler = Join-Path $Development 'packages\runner-fabric\src\repository-task.ts'
$EvaSurface = Join-Path $Website 'src\shared\evaFemaleIdentitySurface.tsx'

foreach ($File in @(
    @($ClientPath, 'art-fabric-client'),
    @($TasksPath, 'art-task-manifest'),
    @($LocalPyProject, 'local-storage-pyproject'),
    @($NamedTaskCompiler, 'development-named-task-compiler'),
    @($EvaSurface, 'website-eva-surface')
)) {
    [void](Require-File $File[0] $File[1])
}

if (Test-Path -LiteralPath $ClientPath -PathType Leaf) {
    $Client = Get-Content -LiteralPath $ClientPath -Raw | ConvertFrom-Json -ErrorAction Stop
    Add-Check 'fabric-minimum-local-storage' (([version]$Client.minimumLocalStorageVersion) -ge [version]'0.48.9') ([string]$Client.minimumLocalStorageVersion)
    Add-Check 'fabric-workstation-v8' ($Client.sourceContract.workstationAcceptanceImplementation -eq 'evavo_local_storage.workstation_acceptance_v8:main') ([string]$Client.sourceContract.workstationAcceptanceImplementation)
    Add-Check 'fabric-named-task-compiler' ($Client.sourceContract.developmentStudioNamedTaskCompiler -eq 'packages/runner-fabric/src/repository-task.ts') ([string]$Client.sourceContract.developmentStudioNamedTaskCompiler)
    Add-Check 'fabric-eva-task-name' ($Client.sourceContract.evaAvatarWorkerTaskName -eq 'eva-avatar-worker-stack') ([string]$Client.sourceContract.evaAvatarWorkerTaskName)
    if ($Git) {
        Test-Ancestor $Git.Source $LocalStorage ([string]$Client.reviewedLocalStorageMain) 'local-storage-reviewed-sha-reachable'
        Test-Ancestor $Git.Source $Development ([string]$Client.reviewedDevelopmentStudioMain) 'development-reviewed-sha-reachable'
    }
}

if (Test-Path -LiteralPath $TasksPath -PathType Leaf) {
    $Tasks = Get-Content -LiteralPath $TasksPath -Raw | ConvertFrom-Json -ErrorAction Stop
    $Task = $Tasks.tasks.PSObject.Properties['eva-avatar-worker-stack'].Value
    Add-Check 'eva-worker-task-present' ([bool]$Task) $(if ($Task) { [string]$Task.runtime } else { 'missing' })
    if ($Task) {
        Add-Check 'eva-worker-task-runtime' ($Task.runtime -eq 'powershell-script') ([string]$Task.runtime)
        Add-Check 'eva-worker-task-entry' ($Task.entry -eq 'scripts/Test-EvaAvatarWorkerStack.ps1') ([string]$Task.entry)
        Add-Check 'eva-worker-task-network' ($Task.network -eq 'disabled') ([string]$Task.network)
    }
}

if (Test-Path -LiteralPath $LocalPyProject -PathType Leaf) {
    $LocalProject = Get-Content -LiteralPath $LocalPyProject -Raw
    $VersionMatch = [regex]::Match($LocalProject, '(?m)^version\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"')
    $LocalVersion = if ($VersionMatch.Success) { $VersionMatch.Groups[1].Value } else { 'unresolved' }
    $LocalVersionOk = $VersionMatch.Success -and ([version]$LocalVersion -ge [version]'0.48.9')
    Add-Check 'local-storage-version-floor' $LocalVersionOk $LocalVersion
    Add-Check 'local-storage-workstation-command-v8' ($LocalProject.Contains('evavo-local-storage-workstation-accept = "evavo_local_storage.workstation_acceptance_v8:main"')) 'workstation_acceptance_v8:main'
}

if (Test-Path -LiteralPath $NamedTaskCompiler -PathType Leaf) {
    $Compiler = Get-Content -LiteralPath $NamedTaskCompiler -Raw
    foreach ($Marker in @(
        'storage.repository_task_plan',
        'storage.repository_task_run',
        'expectedHeadSha',
        'expectedStatusSha256',
        'expectedTaskManifestSha256',
        'expectedTaskSha256'
    )) {
        Add-Check ("development-named-task-{0}" -f $Marker.Replace('.', '-')) ($Compiler.Contains($Marker)) $Marker
    }
}

if (Test-Path -LiteralPath $EvaSurface -PathType Leaf) {
    $Surface = Get-Content -LiteralPath $EvaSurface -Raw
    foreach ($Marker in @(
        'evavo_next_website_eva_identity_surface_v3',
        'EXPECTED_NATIVE_IMAGE_NODES = 9',
        'role === "source" ? 1',
        'document.visibilityState'
    )) {
        Add-Check ("website-eva-{0}" -f ($Marker -replace '[^A-Za-z0-9]+','-').Trim('-')) ($Surface.Contains($Marker)) $Marker
    }
}

if ($Node) {
    [void](Invoke-NativeChecked 'art-capability-contract' $Node.Source @('scripts/check-art-studio-capability-contract.mjs') $Art)
    [void](Invoke-NativeChecked 'art-capability-tests' $Node.Source @('--test','scripts/test-art-studio-capability-contract.mjs','scripts/test-art-studio-workstation-v5-contract.mjs') $Art)
    [void](Invoke-NativeChecked 'art-eva-dense-motion' $Node.Source @('scripts/check-project-art-eva-dense-motion-work-order.mjs') $Art)
    [void](Invoke-NativeChecked 'runtime-eva-dense-motion' $Node.Source @('--test','tests/eva-dense-motion-admission.test.mjs','tests/voice-text.test.mjs') $Runtime)
    [void](Invoke-NativeChecked 'website-eva-cadence' $Node.Source @('scripts/check-eva-avatar-frame-cadence.mjs') $Website)
    [void](Invoke-NativeChecked 'website-eva-alpha' $Node.Source @('scripts/check-eva-avatar-alpha-compositing.mjs') $Website)
}

$Result = [ordered]@{
    contract = 'evavo.eva-avatar-worker-stack-check.v1'
    ok = ($Failures.Count -eq 0)
    checkedAt = [DateTimeOffset]::UtcNow.ToString('o')
    gitReposRoot = $GitReposRoot
    checks = @($Checks)
    failures = @($Failures)
    workerExecutionOnly = $true
    sourceMutation = $false
    repositoryMutation = $false
    commitAuthority = $false
    pushAuthority = $false
    publicationAuthority = $false
    providerMutation = $false
    runtimeActivation = $false
    forcePush = $false
}

$Result | ConvertTo-Json -Depth 8 -Compress
if (-not $Result.ok) { exit 2 }
exit 0
