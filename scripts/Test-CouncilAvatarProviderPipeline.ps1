[CmdletBinding()]
param(
    [string]$GitReposRoot = 'C:\GitRepos',
    [switch]$SkipBuild,
    [switch]$SkipTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Checks = [Collections.Generic.List[object]]::new()
$Failures = [Collections.Generic.List[string]]::new()
$Warnings = [Collections.Generic.List[string]]::new()

function Add-Check {
    param([string]$Id, [bool]$Ok, [string]$Detail)
    $Checks.Add([ordered]@{ id = $Id; ok = $Ok; detail = $Detail }) | Out-Null
    if (-not $Ok) { $Failures.Add($Id) | Out-Null }
}

function Add-Warning {
    param([string]$Id, [string]$Detail)
    $Checks.Add([ordered]@{ id = $Id; ok = $true; warning = $true; detail = $Detail }) | Out-Null
    $Warnings.Add($Id) | Out-Null
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
    if ($Detail.Length -gt 2400) { $Detail = $Detail.Substring($Detail.Length - 2400) }
    Add-Check $Id ($ExitCode -eq 0) ("exit={0}; {1}" -f $ExitCode, $Detail)
    return [ordered]@{ ok = ($ExitCode -eq 0); exitCode = $ExitCode; output = $Output }
}

function Read-WebsiteProvenance {
    param([string]$Path)
    $Source = Get-Content -LiteralPath $Path -Raw
    $Version = [regex]::Match($Source, 'packageVersion\s*:\s*"([^"]+)"')
    $Commit = [regex]::Match($Source, 'commit\s*:\s*"([a-f0-9]{40})"')
    $Repo = [regex]::Match($Source, 'sourceRepo\s*:\s*"([^"]+)"')
    $Status = [regex]::Match($Source, 'productionStatusSource\s*:\s*"([^"]+)"')
    return [ordered]@{
        version = $(if ($Version.Success) { $Version.Groups[1].Value } else { $null })
        commit = $(if ($Commit.Success) { $Commit.Groups[1].Value } else { $null })
        sourceRepo = $(if ($Repo.Success) { $Repo.Groups[1].Value } else { $null })
        productionStatusSource = $(if ($Status.Success) { $Status.Groups[1].Value } else { $null })
    }
}

function Test-Ancestor {
    param(
        [string]$Git,
        [string]$RepositoryPath,
        [string]$ReviewedSha,
        [string]$Id
    )
    if (-not $ReviewedSha) {
        Add-Check $Id $false 'missing commit'
        return
    }
    $global:LASTEXITCODE = 0
    & $Git -C $RepositoryPath merge-base --is-ancestor $ReviewedSha HEAD 2>$null
    $ExitCode = $global:LASTEXITCODE
    Add-Check $Id ($ExitCode -eq 0) ("reviewed={0}; exit={1}" -f $ReviewedSha, $ExitCode)
}

$GitReposRoot = [IO.Path]::GetFullPath($GitReposRoot)
$Art = Join-Path $GitReposRoot 'evavo-art-studio'
$Runtime = Join-Path $GitReposRoot 'evavo-avatar-runtime'
$Website = Join-Path $GitReposRoot 'next-website'

Add-Check 'repo-art-studio' (Test-Path -LiteralPath $Art -PathType Container) $Art
Add-Check 'repo-avatar-runtime' (Test-Path -LiteralPath $Runtime -PathType Container) $Runtime
Add-Check 'repo-next-website' (Test-Path -LiteralPath $Website -PathType Container) $Website

$Node = Get-Command node -ErrorAction SilentlyContinue
$Pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
$Git = Get-Command git -ErrorAction SilentlyContinue
Add-Check 'tool-node' ([bool]$Node) $(if ($Node) { $Node.Source } else { 'missing' })
Add-Check 'tool-pnpm' ([bool]$Pnpm) $(if ($Pnpm) { $Pnpm.Source } else { 'missing' })
Add-Check 'tool-git' ([bool]$Git) $(if ($Git) { $Git.Source } else { 'missing' })

$RequiredArtFiles = [ordered]@{
    'provider-candidates' = 'scripts\project-art\council-avatar-provider-candidates.mjs'
    'provider-runtime' = 'scripts\project-art\council-avatar-provider-runtime.mjs'
    'provider-readiness' = 'scripts\project-art\council-avatar-provider-readiness.mjs'
    'provider-authorization' = 'scripts\project-art\council-avatar-provider-authorization.mjs'
    'provider-executor' = 'scripts\project-art\council-avatar-provider-executor.mjs'
    'provider-review-handoff' = 'scripts\project-art\council-avatar-provider-review-handoff.mjs'
    'provider-readiness-cli' = 'scripts\inspect-project-art-council-avatar-provider-readiness.mjs'
    'provider-execution-cli' = 'scripts\execute-project-art-council-avatar-provider.mjs'
    'provider-review-handoff-cli' = 'scripts\compile-project-art-council-avatar-review-handoff.mjs'
    'provider-runtime-test' = 'scripts\test-project-art-council-avatar-provider-runtime.mjs'
    'provider-authorization-test' = 'scripts\test-project-art-council-avatar-provider-authorization.mjs'
    'provider-review-handoff-test' = 'scripts\test-project-art-council-avatar-review-handoff.mjs'
    'worker-provider-authorization-test' = 'apps\worker\test\council-avatar-provider-authorization.test.mjs'
}
foreach ($Entry in $RequiredArtFiles.GetEnumerator()) {
    [void](Require-File (Join-Path $Art $Entry.Value) ("art-{0}" -f $Entry.Key))
}

$RuntimePackagePath = Join-Path $Runtime 'package.json'
$WebsitePresentationPath = Join-Path $Website 'src\features\council\avatarPresentation.ts'
$RuntimeVersion = $null
if (Require-File $RuntimePackagePath 'runtime-package') {
    $RuntimePackage = Get-Content -LiteralPath $RuntimePackagePath -Raw | ConvertFrom-Json -ErrorAction Stop
    $RuntimeVersion = [string]$RuntimePackage.version
    $RuntimeVersionParsed = $null
    $VersionValid = [version]::TryParse($RuntimeVersion, [ref]$RuntimeVersionParsed)
    Add-Check 'runtime-version-valid' $VersionValid $RuntimeVersion
    if ($VersionValid) {
        Add-Check 'runtime-version-floor-041' ($RuntimeVersionParsed -ge [version]'0.41.0') $RuntimeVersion
    }
}

if (Require-File $WebsitePresentationPath 'website-council-presentation') {
    $Provenance = Read-WebsiteProvenance $WebsitePresentationPath
    Add-Check 'website-runtime-provenance-version-present' ([bool]$Provenance.version) ([string]$Provenance.version)
    Add-Check 'website-runtime-provenance-commit-present' ([bool]$Provenance.commit) ([string]$Provenance.commit)
    Add-Check 'website-runtime-provenance-repo' ($Provenance.sourceRepo -eq 'EVAVO-STUDIO/evavo-avatar-runtime') ([string]$Provenance.sourceRepo)
    Add-Check 'website-runtime-provenance-status-source' ($Provenance.productionStatusSource -eq 'council-spending-route-events-and-voice-playback') ([string]$Provenance.productionStatusSource)
    if ($RuntimeVersion) {
        Add-Check 'website-runtime-version-matches-package' ($Provenance.version -eq $RuntimeVersion) ("website={0}; runtime={1}" -f $Provenance.version, $RuntimeVersion)
    }
    if ($Git) {
        Test-Ancestor $Git.Source $Runtime ([string]$Provenance.commit) 'website-runtime-provenance-commit-reachable'
    }
}

$ProviderHandlerPath = Join-Path $Art 'apps\worker\src\provider-handlers.ts'
if (Require-File $ProviderHandlerPath 'worker-provider-handler') {
    $ProviderHandler = Get-Content -LiteralPath $ProviderHandlerPath -Raw
    foreach ($Marker in @(
        'council-avatar.execution-authorized',
        'COUNCIL_AVATAR_PROVIDER_EXECUTION_CONTRACT_MISMATCH',
        'COUNCIL_AVATAR_PROVIDER_EXECUTION_UNAUTHORIZED'
    )) {
        Add-Check ("worker-provider-guard-{0}" -f ($Marker -replace '[^A-Za-z0-9]+','-')) ($ProviderHandler.Contains($Marker)) $Marker
    }
}

$BuildPassed = $true
if (-not $SkipBuild) {
    if ($Pnpm) {
        $Build = Invoke-NativeChecked 'art-provider-worker-build' $Pnpm.Source @(
            '--filter','@evavo/art-artifacts',
            '--filter','@evavo/art-providers',
            '--filter','@evavo/art-runtime',
            '--filter','@evavo/art-studio-worker',
            'build'
        ) $Art
        $BuildPassed = $Build.ok
    }
    else {
        $BuildPassed = $false
        Add-Check 'art-provider-worker-build' $false 'pnpm is unavailable'
    }
}
else {
    Add-Warning 'build-skipped' 'Build verification explicitly skipped.'
}

if (-not $SkipTests -and $Node -and ($BuildPassed -or $SkipBuild)) {
    [void](Invoke-NativeChecked 'art-council-provider-contract-tests' $Node.Source @('--test','scripts/test-project-art-council-avatar-provider-runtime.mjs','scripts/test-project-art-council-avatar-provider-authorization.mjs','scripts/test-project-art-council-avatar-review-handoff.mjs') $Art)
    [void](Invoke-NativeChecked 'art-council-provider-worker-guard-tests' $Node.Source @('--test','apps/worker/test/council-avatar-provider-authorization.test.mjs') $Art)
}
elseif (-not $SkipTests) {
    Add-Check 'art-council-provider-tests-runnable' $false 'Tests require Node and a successful/current Art Studio build.'
}
else {
    Add-Warning 'tests-skipped' 'Council provider tests explicitly skipped.'
}

$ProviderReady = $false
$ReadinessSummary = $null
$ReadinessCli = Join-Path $Art 'scripts\inspect-project-art-council-avatar-provider-readiness.mjs'
if ($Node -and (Test-Path -LiteralPath $ReadinessCli -PathType Leaf) -and ($BuildPassed -or $SkipBuild)) {
    $global:LASTEXITCODE = 0
    Push-Location -LiteralPath $Art
    try {
        $ReadinessOutput = & $Node.Source $ReadinessCli 2>&1
        $ReadinessExit = $global:LASTEXITCODE
    }
    finally {
        Pop-Location
    }
    if ($ReadinessExit -eq 0) {
        try {
            $ReadinessSummary = (($ReadinessOutput | Select-Object -Last 1) | Out-String).Trim() | ConvertFrom-Json -ErrorAction Stop
            $ProviderReady = [bool]$ReadinessSummary.readiness.readyForBoundedExecutionAuthorization
            Add-Check 'provider-readiness-zero-spend' ($ReadinessSummary.zeroSpendInspection -eq $true -and $ReadinessSummary.remoteProviderCallPerformed -eq $false) ("status={0}; remoteCall={1}" -f $ReadinessSummary.status, $ReadinessSummary.remoteProviderCallPerformed)
            if ($ProviderReady) {
                Add-Check 'provider-ready-for-bounded-authorization' $true ("adapter={0}; model={1}" -f $ReadinessSummary.desired.adapterId, $ReadinessSummary.desired.model)
            }
            else {
                Add-Warning 'provider-not-yet-ready-for-bounded-authorization' ((@($ReadinessSummary.blockers) -join ','))
            }
        }
        catch {
            Add-Check 'provider-readiness-json' $false $_.Exception.Message
        }
    }
    else {
        Add-Check 'provider-readiness-cli' $false ("exit={0}" -f $ReadinessExit)
    }
}
else {
    Add-Warning 'provider-readiness-not-run' 'Readiness requires Node, the readiness CLI and a current worker build.'
}

$Result = [ordered]@{
    contract = 'evavo.council-avatar-provider-pipeline-check.v1'
    ok = ($Failures.Count -eq 0)
    checkedAt = [DateTimeOffset]::UtcNow.ToString('o')
    gitReposRoot = $GitReposRoot
    runtimeVersion = $RuntimeVersion
    providerReadyForBoundedExecutionAuthorization = $ProviderReady
    zeroSpendReadinessOnly = $true
    paidProviderCallPerformed = $false
    candidateApprovalPerformed = $false
    candidatePromotionPerformed = $false
    runtimeActivationPerformed = $false
    websiteActivationPerformed = $false
    checks = @($Checks)
    warnings = @($Warnings)
    failures = @($Failures)
}

$Result | ConvertTo-Json -Depth 10 -Compress
if (-not $Result.ok) { exit 2 }
exit 0
