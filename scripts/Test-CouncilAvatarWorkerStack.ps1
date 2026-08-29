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
    if ($Detail.Length -gt 2400) { $Detail = $Detail.Substring($Detail.Length - 2400) }
    Add-Check $Id ($ExitCode -eq 0) ("exit={0}; {1}" -f $ExitCode, $Detail)
    return ($ExitCode -eq 0)
}

$GitReposRoot = [IO.Path]::GetFullPath($GitReposRoot)
$Art = Join-Path $GitReposRoot 'evavo-art-studio'
$Runtime = Join-Path $GitReposRoot 'evavo-avatar-runtime'
$Council = Join-Path $GitReposRoot 'the-council'
$Website = Join-Path $GitReposRoot 'next-website'

foreach ($Pair in @(
    @('art-studio', $Art),
    @('avatar-runtime', $Runtime),
    @('council', $Council),
    @('next-website', $Website)
)) {
    [void](Require-Directory $Pair[1] ("repo-{0}" -f $Pair[0]))
}

$Node = Get-Command node -ErrorAction SilentlyContinue
$Git = Get-Command git -ErrorAction SilentlyContinue
$ShellPath = (Get-Process -Id $PID).Path
Add-Check 'tool-node' ([bool]$Node) $(if ($Node) { $Node.Source } else { 'missing' })
Add-Check 'tool-git' ([bool]$Git) $(if ($Git) { $Git.Source } else { 'missing' })
Add-Check 'tool-current-powershell' (Test-Path -LiteralPath $ShellPath -PathType Leaf) $ShellPath

$ProviderAudit = Join-Path $Art 'scripts\Test-CouncilAvatarProviderPipeline.ps1'
$ProgramPath = Join-Path $Art 'scripts\project-art\council-avatar-production-program.mjs'
$CriticRequest = Join-Path $Art 'config\council-avatar-identities\council-critic.identity-request.json'
$OpenReviewerRequest = Join-Path $Art 'config\council-avatar-identities\council-open-reviewer.identity-request.json'
$RuntimeStatus = Join-Path $Runtime 'src\council-avatar-production-status.js'
$RuntimePackage = Join-Path $Runtime 'package.json'
$CouncilConfig = Join-Path $Council 'config\council.example.json'
$WebsitePresentation = Join-Path $Website 'src\features\council\avatarPresentation.ts'

foreach ($File in @(
    @($ProviderAudit, 'art-council-provider-pipeline-audit'),
    @($ProgramPath, 'art-council-production-program'),
    @($CriticRequest, 'art-council-critic-identity-request'),
    @($OpenReviewerRequest, 'art-council-open-reviewer-identity-request'),
    @($RuntimeStatus, 'runtime-council-production-status'),
    @($RuntimePackage, 'runtime-package'),
    @($CouncilConfig, 'council-roster'),
    @($WebsitePresentation, 'website-council-presentation')
)) {
    [void](Require-File $File[0] $File[1])
}

if (Test-Path -LiteralPath $CouncilConfig -PathType Leaf) {
    $Roster = Get-Content -LiteralPath $CouncilConfig -Raw | ConvertFrom-Json -ErrorAction Stop
    $ExpectedIds = @('architect','critic','researcher','open-reviewer')
    $ActualIds = @($Roster.members | ForEach-Object { [string]$_.id })
    Add-Check 'council-seat-count' ($ActualIds.Count -eq 4) ($ActualIds -join ',')
    Add-Check 'council-seat-order-and-identity' (($ActualIds -join ',') -eq ($ExpectedIds -join ',')) ($ActualIds -join ',')
    Add-Check 'council-chair-architect' ($Roster.chairId -eq 'architect') ([string]$Roster.chairId)
}

if (Test-Path -LiteralPath $RuntimePackage -PathType Leaf) {
    $Package = Get-Content -LiteralPath $RuntimePackage -Raw | ConvertFrom-Json -ErrorAction Stop
    $ParsedVersion = $null
    $VersionValid = [version]::TryParse([string]$Package.version, [ref]$ParsedVersion)
    Add-Check 'runtime-package-version-valid' $VersionValid ([string]$Package.version)
    if ($VersionValid) {
        Add-Check 'runtime-package-version-floor-041' ($ParsedVersion -ge [version]'0.41.0') ([string]$Package.version)
    }
}

if (Test-Path -LiteralPath $CriticRequest -PathType Leaf) {
    $Request = Get-Content -LiteralPath $CriticRequest -Raw | ConvertFrom-Json -ErrorAction Stop
    Add-Check 'critic-request-character' ($Request.character.id -eq 'council-critic') ([string]$Request.character.id)
    Add-Check 'critic-request-candidate-sets' ([int]$Request.candidateSets -ge 2) ([string]$Request.candidateSets)
    Add-Check 'critic-request-provider-authorization-required' ($Request.policy.providerAuthorizationRequired -eq $true) ([string]$Request.policy.providerAuthorizationRequired)
    Add-Check 'critic-request-review-required' ($Request.policy.reviewRequired -eq $true) ([string]$Request.policy.reviewRequired)
}

if (Test-Path -LiteralPath $OpenReviewerRequest -PathType Leaf) {
    $Request = Get-Content -LiteralPath $OpenReviewerRequest -Raw | ConvertFrom-Json -ErrorAction Stop
    Add-Check 'open-reviewer-request-character' ($Request.character.id -eq 'council-open-reviewer') ([string]$Request.character.id)
    Add-Check 'open-reviewer-request-candidate-sets' ([int]$Request.candidateSets -ge 2) ([string]$Request.candidateSets)
    Add-Check 'open-reviewer-request-provider-authorization-required' ($Request.policy.providerAuthorizationRequired -eq $true) ([string]$Request.policy.providerAuthorizationRequired)
    Add-Check 'open-reviewer-request-review-required' ($Request.policy.reviewRequired -eq $true) ([string]$Request.policy.reviewRequired)
}

if (Test-Path -LiteralPath $ProviderAudit -PathType Leaf) {
    $ProviderAuditArgs = @('-NoProfile')
    if ($PSVersionTable.PSEdition -eq 'Desktop') {
        $ProviderAuditArgs += @('-ExecutionPolicy','Bypass')
    }
    $ProviderAuditArgs += @('-File',$ProviderAudit,'-GitReposRoot',$GitReposRoot)
    [void](Invoke-NativeChecked 'council-provider-pipeline-version-aware-audit' $ShellPath $ProviderAuditArgs $Art)
}

if ($Node) {
    [void](Invoke-NativeChecked 'art-council-production-tests' $Node.Source @('--test','scripts/test-project-art-council-avatar-production.mjs','scripts/test-project-art-council-avatar-identity-bootstrap.mjs','scripts/test-project-art-council-avatar-animation-suite.mjs') $Art)
    [void](Invoke-NativeChecked 'art-council-identity-contracts' $Node.Source @('--test','scripts/test-character-identity-master-plan.mjs','scripts/test-character-identity-bootstrap-admission.mjs','scripts/test-character-identity-candidate-review-plan.mjs') $Art)
    [void](Invoke-NativeChecked 'runtime-council-production-status' $Node.Source @('--test','tests/council-avatar-production-status.test.mjs') $Runtime)
    [void](Invoke-NativeChecked 'runtime-eva-dense-motion' $Node.Source @('--test','tests/eva-dense-motion-admission.test.mjs') $Runtime)
    [void](Invoke-NativeChecked 'runtime-top-hat-pose-bank' $Node.Source @('scripts/check-top-hat-body-pose-bank.mjs') $Runtime)
    [void](Invoke-NativeChecked 'website-council-presentation' $Node.Source @('scripts/check-private-client-hub-ui.mjs') $Website)
    [void](Invoke-NativeChecked 'website-eva-quality-fallback' $Node.Source @('scripts/check-eva-avatar-quality-fallback.mjs') $Website)
}

$Result = [ordered]@{
    contract = 'evavo.council-avatar-worker-stack-check.v2'
    ok = ($Failures.Count -eq 0)
    checkedAt = [DateTimeOffset]::UtcNow.ToString('o')
    gitReposRoot = $GitReposRoot
    checks = @($Checks)
    failures = @($Failures)
    councilSeatCount = 4
    authoritativeCharacterIds = @('top-hat-man','council-critic','eva-female','council-open-reviewer')
    currentlyAdmittedPresentationAssets = @('top-hat-man','eva-female')
    identityMasterGenerationRequiredFor = @('council-critic','council-open-reviewer')
    authoredAnimationCompletionRequiredFor = @('top-hat-man','council-critic','eva-female','council-open-reviewer')
    websiteMayClaimAllCouncilAvatarsProductionReady = $false
    providerExecutionAutomaticallyAuthorized = $false
    candidateApprovalAutomaticallyAuthorized = $false
    candidatePromotionAutomaticallyAuthorized = $false
    runtimeActivationAutomaticallyAuthorized = $false
    websiteActivationAutomaticallyAuthorized = $false
    deploymentAuthority = $false
    forcePushAuthority = $false
}

$Result | ConvertTo-Json -Depth 10 -Compress
if (-not $Result.ok) { exit 2 }
exit 0
