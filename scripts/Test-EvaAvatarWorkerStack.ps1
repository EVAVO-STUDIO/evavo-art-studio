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
$EvaBoundary = Join-Path $Website 'src\shared\evaAvatarRenderSurface.tsx'
$EvaQualityFallback = Join-Path $Website 'src\shared\evaFemaleQualityFallbackSurface.tsx'
$EvaSparseCompatibility = Join-Path $Website 'src\shared\evaFemaleIdentitySurface.tsx'
$EvaQualityCheck = Join-Path $Website 'scripts\check-eva-avatar-quality-fallback.mjs'

foreach ($File in @(
    @($ClientPath, 'art-fabric-client'),
    @($TasksPath, 'art-task-manifest'),
    @($LocalPyProject, 'local-storage-pyproject'),
    @($NamedTaskCompiler, 'development-named-task-compiler'),
    @($EvaBoundary, 'website-eva-boundary'),
    @($EvaQualityFallback, 'website-eva-quality-fallback'),
    @($EvaSparseCompatibility, 'website-eva-sparse-compatibility'),
    @($EvaQualityCheck, 'website-eva-quality-check')
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

if (Test-Path -LiteralPath $EvaBoundary -PathType Leaf) {
    $Boundary = Get-Content -LiteralPath $EvaBoundary -Raw
    foreach ($Marker in @(
        'evaLiveMode: "quality-first-static-high-resolution-fallback"',
        'evaDenseReleaseRequired: true',
        'evaDenseMotionRequiredFrameCount: 10',
        'evaAuthoredAnimationTargetFps: 24',
        'evaAuthoredAnimationPreferredFps: 30',
        'evaCurrentRuntimePackageVersion: "0.38.0"',
        'return <EvaFemaleQualityFallbackSurface {...surfaceProps} />;'
    )) {
        Add-Check ("website-eva-live-{0}" -f ($Marker -replace '[^A-Za-z0-9]+','-').Trim('-')) ($Boundary.Contains($Marker)) $Marker
    }
    $LiveStart = $Boundary.IndexOf('if (props.characterId === "eva-female")')
    $TopHatStart = $Boundary.IndexOf('return <EvaTopHatDecodedRenderSurface {...props} />;', $LiveStart)
    $LiveBranch = if ($LiveStart -ge 0 -and $TopHatStart -gt $LiveStart) { $Boundary.Substring($LiveStart, $TopHatStart - $LiveStart) } else { '' }
    Add-Check 'website-eva-live-branch-bounded' ($LiveBranch.Length -gt 0) $("liveStart={0}; topHatStart={1}" -f $LiveStart, $TopHatStart)
    Add-Check 'website-eva-sparse-renderer-not-live' (-not $LiveBranch.Contains('EvaFemaleIdentitySurface')) 'sparse compositor must remain compatibility-only'
    Add-Check 'website-eva-legacy-atlas-not-live' (-not $LiveBranch.Contains('EvaProductionAvatarFrame')) 'low-resolution atlas must remain compatibility-only'
}

if (Test-Path -LiteralPath $EvaQualityFallback -PathType Leaf) {
    $FallbackSource = Get-Content -LiteralPath $EvaQualityFallback -Raw
    foreach ($Marker in @(
        'evavo_next_website_eva_quality_fallback_surface_v1',
        'EVA_FEMALE_DENSE_MOTION_REQUIRED_FRAME_COUNT = 10',
        'EVA_FEMALE_AUTHORED_ANIMATION_TARGET_FPS = 24',
        'EVA_FEMALE_AUTHORED_ANIMATION_PREFERRED_FPS = 30',
        'data-avatar-source-count="1"',
        'data-avatar-synthetic-body-motion="false"',
        'data-avatar-synthetic-mouth="false"',
        'data-avatar-mouth-layer="disabled-until-authored-registered-mouth"'
    )) {
        Add-Check ("website-eva-fallback-{0}" -f ($Marker -replace '[^A-Za-z0-9]+','-').Trim('-')) ($FallbackSource.Contains($Marker)) $Marker
    }
    foreach ($Forbidden in @(
        'requestAnimationFrame(',
        'sampleEvaFemaleIdentityMotion(',
        'data-avatar-mouth-patch="matched-identity-family"'
    )) {
        Add-Check ("website-eva-fallback-forbid-{0}" -f ($Forbidden -replace '[^A-Za-z0-9]+','-').Trim('-')) (-not $FallbackSource.Contains($Forbidden)) $Forbidden
    }
}

if (Test-Path -LiteralPath $EvaSparseCompatibility -PathType Leaf) {
    $SparseSource = Get-Content -LiteralPath $EvaSparseCompatibility -Raw
    foreach ($Marker in @(
        'evavo_next_website_eva_identity_surface_v3',
        'EXPECTED_NATIVE_IMAGE_NODES = 9',
        'sampleEvaFemaleIdentityMotion(',
        'data-avatar-source-count="3"'
    )) {
        Add-Check ("website-eva-compat-{0}" -f ($Marker -replace '[^A-Za-z0-9]+','-').Trim('-')) ($SparseSource.Contains($Marker)) $Marker
    }
}

if ($Node) {
    [void](Invoke-NativeChecked 'art-capability-contract' $Node.Source @('scripts/check-art-studio-capability-contract.mjs') $Art)
    [void](Invoke-NativeChecked 'art-capability-tests' $Node.Source @('--test','scripts/test-art-studio-capability-contract.mjs','scripts/test-art-studio-workstation-v5-contract.mjs') $Art)
    [void](Invoke-NativeChecked 'art-eva-dense-motion' $Node.Source @('scripts/check-project-art-eva-dense-motion-work-order.mjs') $Art)
    [void](Invoke-NativeChecked 'runtime-eva-dense-motion' $Node.Source @('--test','tests/eva-dense-motion-admission.test.mjs','tests/voice-text.test.mjs') $Runtime)
    [void](Invoke-NativeChecked 'website-eva-cadence' $Node.Source @('scripts/check-eva-avatar-frame-cadence.mjs') $Website)
    [void](Invoke-NativeChecked 'website-eva-alpha' $Node.Source @('scripts/check-eva-avatar-alpha-compositing.mjs') $Website)
    [void](Invoke-NativeChecked 'website-eva-quality-fallback' $Node.Source @('scripts/check-eva-avatar-quality-fallback.mjs') $Website)
}

$Result = [ordered]@{
    contract = 'evavo.eva-avatar-worker-stack-check.v2'
    ok = ($Failures.Count -eq 0)
    checkedAt = [DateTimeOffset]::UtcNow.ToString('o')
    gitReposRoot = $GitReposRoot
    checks = @($Checks)
    failures = @($Failures)
    liveEvaMode = 'quality-first-static-high-resolution-fallback'
    denseMotionRequired = $true
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
