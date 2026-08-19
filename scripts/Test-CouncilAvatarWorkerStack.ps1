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
    if ($Detail.Length -gt 1600) { $Detail = $Detail.Substring($Detail.Length - 1600) }
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

function Check-Markers {
    param(
        [string]$Path,
        [string]$Prefix,
        [string[]]$Markers
    )
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
    $Source = Get-Content -LiteralPath $Path -Raw
    foreach ($Marker in $Markers) {
        $IdPart = ($Marker -replace '[^A-Za-z0-9]+','-').Trim('-')
        if ($IdPart.Length -gt 72) { $IdPart = $IdPart.Substring(0, 72) }
        Add-Check ("{0}-{1}" -f $Prefix, $IdPart) ($Source.Contains($Marker)) $Marker
    }
}

$GitReposRoot = [IO.Path]::GetFullPath($GitReposRoot)
$Art = Join-Path $GitReposRoot 'evavo-art-studio'
$Runtime = Join-Path $GitReposRoot 'evavo-avatar-runtime'
$Council = Join-Path $GitReposRoot 'the-council'
$Development = Join-Path $GitReposRoot 'evavo-development-studio'
$LocalStorage = Join-Path $GitReposRoot 'evavo-local-storage'
$Website = Join-Path $GitReposRoot 'next-website'

foreach ($Pair in @(
    @('art-studio', $Art),
    @('avatar-runtime', $Runtime),
    @('council', $Council),
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
$ProgramPath = Join-Path $Art 'scripts\project-art\council-avatar-production-program.mjs'
$CriticRequest = Join-Path $Art 'config\council-avatar-identities\council-critic.identity-request.json'
$OpenReviewerRequest = Join-Path $Art 'config\council-avatar-identities\council-open-reviewer.identity-request.json'
$RuntimeStatus = Join-Path $Runtime 'src\council-avatar-production-status.js'
$RuntimePackage = Join-Path $Runtime 'package.json'
$CouncilConfig = Join-Path $Council 'config\council.example.json'
$WebsitePresentation = Join-Path $Website 'src\features\council\avatarPresentation.ts'
$NamedTaskCompiler = Join-Path $Development 'packages\runner-fabric\src\repository-task.ts'
$LocalPyProject = Join-Path $LocalStorage 'pyproject.toml'

foreach ($File in @(
    @($ClientPath, 'art-fabric-client'),
    @($TasksPath, 'art-task-manifest'),
    @($ProgramPath, 'art-council-production-program'),
    @($CriticRequest, 'art-council-critic-identity-request'),
    @($OpenReviewerRequest, 'art-council-open-reviewer-identity-request'),
    @($RuntimeStatus, 'runtime-council-production-status'),
    @($RuntimePackage, 'runtime-package'),
    @($CouncilConfig, 'council-roster'),
    @($WebsitePresentation, 'website-council-presentation'),
    @($NamedTaskCompiler, 'development-named-task-compiler'),
    @($LocalPyProject, 'local-storage-pyproject')
)) {
    [void](Require-File $File[0] $File[1])
}

if (Test-Path -LiteralPath $ClientPath -PathType Leaf) {
    $Client = Get-Content -LiteralPath $ClientPath -Raw | ConvertFrom-Json -ErrorAction Stop
    Add-Check 'fabric-minimum-local-storage' (([version]$Client.minimumLocalStorageVersion) -ge [version]'0.48.9') ([string]$Client.minimumLocalStorageVersion)
    Add-Check 'fabric-workstation-v8' ($Client.sourceContract.workstationAcceptanceImplementation -eq 'evavo_local_storage.workstation_acceptance_v8:main') ([string]$Client.sourceContract.workstationAcceptanceImplementation)
    Add-Check 'fabric-named-task-compiler' ($Client.sourceContract.developmentStudioNamedTaskCompiler -eq 'packages/runner-fabric/src/repository-task.ts') ([string]$Client.sourceContract.developmentStudioNamedTaskCompiler)
    Add-Check 'fabric-eva-task-name' ($Client.sourceContract.evaAvatarWorkerTaskName -eq 'eva-avatar-worker-stack') ([string]$Client.sourceContract.evaAvatarWorkerTaskName)
    Add-Check 'fabric-council-task-name' ($Client.sourceContract.councilAvatarWorkerTaskName -eq 'council-avatar-worker-stack') ([string]$Client.sourceContract.councilAvatarWorkerTaskName)
    if ($Git) {
        Test-Ancestor $Git.Source $LocalStorage ([string]$Client.reviewedLocalStorageMain) 'local-storage-reviewed-sha-reachable'
        Test-Ancestor $Git.Source $Development ([string]$Client.reviewedDevelopmentStudioMain) 'development-reviewed-sha-reachable'
    }
}

if (Test-Path -LiteralPath $TasksPath -PathType Leaf) {
    $Tasks = Get-Content -LiteralPath $TasksPath -Raw | ConvertFrom-Json -ErrorAction Stop
    $Task = $Tasks.tasks.PSObject.Properties['council-avatar-worker-stack'].Value
    Add-Check 'council-worker-task-present' ([bool]$Task) $(if ($Task) { [string]$Task.runtime } else { 'missing' })
    if ($Task) {
        Add-Check 'council-worker-task-runtime' ($Task.runtime -eq 'powershell-script') ([string]$Task.runtime)
        Add-Check 'council-worker-task-entry' ($Task.entry -eq 'scripts/Test-CouncilAvatarWorkerStack.ps1') ([string]$Task.entry)
        Add-Check 'council-worker-task-network' ($Task.network -eq 'disabled') ([string]$Task.network)
        Add-Check 'council-worker-task-timeout' ([int]$Task.timeoutSeconds -eq 1800) ([string]$Task.timeoutSeconds)
    }
}

if (Test-Path -LiteralPath $CouncilConfig -PathType Leaf) {
    $Roster = Get-Content -LiteralPath $CouncilConfig -Raw | ConvertFrom-Json -ErrorAction Stop
    $ExpectedIds = @('architect','critic','researcher','open-reviewer')
    $ActualIds = @($Roster.members | ForEach-Object { [string]$_.id })
    Add-Check 'council-seat-count' ($ActualIds.Count -eq 4) ($ActualIds -join ',')
    Add-Check 'council-seat-order-and-identity' (($ActualIds -join ',') -eq ($ExpectedIds -join ',')) ($ActualIds -join ',')
    Add-Check 'council-chair-architect' ($Roster.chairId -eq 'architect') ([string]$Roster.chairId)
    $Roles = @{}
    foreach ($Member in $Roster.members) { $Roles[[string]$Member.id] = [string]$Member.role }
    Add-Check 'council-role-architect' ($Roles['architect'].Contains('architecture')) $Roles['architect']
    Add-Check 'council-role-critic' ($Roles['critic'].Contains('adversarial review')) $Roles['critic']
    Add-Check 'council-role-researcher' ($Roles['researcher'].Contains('evidence')) $Roles['researcher']
    Add-Check 'council-role-open-reviewer' ($Roles['open-reviewer'].Contains('independent open-model review')) $Roles['open-reviewer']
}

Check-Markers $ProgramPath 'art-program' @(
    "'evavo.project-art-council-avatar-production-program.v1'",
    "seatCount: 4",
    "characterCount: characters.length",
    "characterId: 'top-hat-man'",
    "characterId: 'council-critic'",
    "characterId: 'eva-female'",
    "characterId: 'council-open-reviewer'",
    "identityStatus: 'identity-master-required'",
    "motionStatus: 'incomplete-authored-pose-bank'",
    "motionStatus: 'dense-bootstrap-incomplete'",
    "clipCount: 25",
    "fullCharacterFrameCount: 732",
    "registeredPoseLayerCount: 17",
    "totalPlannedImagesPerCharacter: 749",
    "minimumFrameReviewConfidence: 0.95",
    "partialCharacterReleaseAllowed: false",
    "sparsePoseApproximationMayClaimProductionAnimation: false",
    "websiteMayActivateBeforeReviewedMediaComplete: false",
    "productionReady: false"
)

Check-Markers $RuntimeStatus 'runtime-status' @(
    'evavo_council_avatar_production_status_v1',
    'id: "architect"',
    'id: "critic"',
    'id: "researcher"',
    'id: "open-reviewer"',
    'architect: "top-hat-man"',
    'critic: "council-critic"',
    'researcher: "eva-female"',
    '"open-reviewer": "council-open-reviewer"',
    'totalPlannedImagesPerCharacter: 749',
    'phase: "dense-bootstrap-incomplete"',
    'phase: "pose-bank-incomplete"',
    'phase: "identity-master-required"',
    'websiteProductionAnimationEligible: false',
    'websiteMayClaimAllCouncilAvatarsProductionReady: complete'
)

Check-Markers $WebsitePresentation 'website-council' @(
    'packageVersion: "0.38.0"',
    'commit: "90068367db9144b909bc861f91887ea5f0010842"',
    'productionStatusSource: "src/council-avatar-production-status.js"',
    '"evavo_council_avatar_production_status_v1"',
    'preferredCharacterId: "top-hat-man"',
    'preferredCharacterId: "council-critic"',
    'preferredCharacterId: "eva-female"',
    'preferredCharacterId: "council-open-reviewer"',
    'productionPhase: "pose-bank-incomplete"',
    'productionPhase: "dense-bootstrap-incomplete"',
    'productionPhase: "identity-master-required"',
    'websiteMayClaimAllCouncilAvatarsProductionReady: false'
)

if (Test-Path -LiteralPath $RuntimePackage -PathType Leaf) {
    $Package = Get-Content -LiteralPath $RuntimePackage -Raw | ConvertFrom-Json -ErrorAction Stop
    Add-Check 'runtime-package-version-038' ($Package.version -eq '0.38.0') ([string]$Package.version)
}

if (Test-Path -LiteralPath $CriticRequest -PathType Leaf) {
    $Request = Get-Content -LiteralPath $CriticRequest -Raw | ConvertFrom-Json -ErrorAction Stop
    Add-Check 'critic-request-schema' ($Request.schema -eq 'evavo.character-identity-master-request.v1') ([string]$Request.schema)
    Add-Check 'critic-request-character' ($Request.character.id -eq 'council-critic') ([string]$Request.character.id)
    Add-Check 'critic-request-candidate-sets' ([int]$Request.candidateSets -eq 4) ([string]$Request.candidateSets)
    Add-Check 'critic-request-view-count' (@($Request.views).Count -eq 3) ([string]@($Request.views).Count)
    Add-Check 'critic-request-provider-not-executed' ($Request.policy.providerExecution -eq $false) ([string]$Request.policy.providerExecution)
    Add-Check 'critic-request-authorization-required' ($Request.policy.providerAuthorizationRequired -eq $true) ([string]$Request.policy.providerAuthorizationRequired)
    Add-Check 'critic-request-review-required' ($Request.policy.reviewRequired -eq $true) ([string]$Request.policy.reviewRequired)
}

if (Test-Path -LiteralPath $OpenReviewerRequest -PathType Leaf) {
    $Request = Get-Content -LiteralPath $OpenReviewerRequest -Raw | ConvertFrom-Json -ErrorAction Stop
    Add-Check 'open-reviewer-request-schema' ($Request.schema -eq 'evavo.character-identity-master-request.v1') ([string]$Request.schema)
    Add-Check 'open-reviewer-request-character' ($Request.character.id -eq 'council-open-reviewer') ([string]$Request.character.id)
    Add-Check 'open-reviewer-request-candidate-sets' ([int]$Request.candidateSets -eq 4) ([string]$Request.candidateSets)
    Add-Check 'open-reviewer-request-view-count' (@($Request.views).Count -eq 3) ([string]@($Request.views).Count)
    Add-Check 'open-reviewer-request-provider-not-executed' ($Request.policy.providerExecution -eq $false) ([string]$Request.policy.providerExecution)
    Add-Check 'open-reviewer-request-authorization-required' ($Request.policy.providerAuthorizationRequired -eq $true) ([string]$Request.policy.providerAuthorizationRequired)
    Add-Check 'open-reviewer-request-review-required' ($Request.policy.reviewRequired -eq $true) ([string]$Request.policy.reviewRequired)
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

if (Test-Path -LiteralPath $LocalPyProject -PathType Leaf) {
    $LocalProject = Get-Content -LiteralPath $LocalPyProject -Raw
    $VersionMatch = [regex]::Match($LocalProject, '(?m)^version\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"')
    $LocalVersion = if ($VersionMatch.Success) { $VersionMatch.Groups[1].Value } else { 'unresolved' }
    $LocalVersionOk = $VersionMatch.Success -and ([version]$LocalVersion -ge [version]'0.48.9')
    Add-Check 'local-storage-version-floor' $LocalVersionOk $LocalVersion
}

if ($Git) {
    Test-Ancestor $Git.Source $Art 'c312afa831ab240d3d8eb3c32f3c7413bd999b7b' 'art-reviewed-council-program-reachable'
    Test-Ancestor $Git.Source $Runtime '90068367db9144b909bc861f91887ea5f0010842' 'runtime-reviewed-council-status-reachable'
    Test-Ancestor $Git.Source $Council 'f0183be83976b061027b307a2fb78ef4ed856821' 'council-reviewed-roster-reachable'
    Test-Ancestor $Git.Source $Website 'ee74a609a93e81b42c28a72122dc0f6b887cf328' 'website-reviewed-council-truth-reachable'
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
    contract = 'evavo.council-avatar-worker-stack-check.v1'
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
    totalPlannedImagesPerCharacter = 749
    workerExecutionOnly = $true
    sourceMutation = $false
    repositoryMutation = $false
    creativeApproval = $false
    commitAuthority = $false
    pushAuthority = $false
    publicationAuthority = $false
    providerPromotion = $false
    runtimeActivation = $false
    deployment = $false
    forcePush = $false
}

$Result | ConvertTo-Json -Depth 8 -Compress
if (-not $Result.ok) { exit 2 }
exit 0
