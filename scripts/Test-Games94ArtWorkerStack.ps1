[CmdletBinding()]
param(
    [string]$GitReposRoot = 'C:\GitRepos'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Add-Check {
    param([string]$Id, [bool]$Ok, [string]$Detail)
    $script:Checks.Add([ordered]@{ id = $Id; ok = $Ok; detail = $Detail }) | Out-Null
    if (-not $Ok) { $script:Failures.Add($Id) | Out-Null }
}

function Require-File {
    param([string]$Path, [string]$Id)
    $Present = Test-Path -LiteralPath $Path -PathType Leaf
    Add-Check $Id $Present $(if ($Present) { 'present' } else { 'missing' })
    return $Present
}

$GitReposRoot = [IO.Path]::GetFullPath($GitReposRoot)
$Art = Join-Path $GitReposRoot 'evavo-art-studio'
$Compute = Join-Path $GitReposRoot 'evavo-local-compute'
$LocalStorage = Join-Path $GitReposRoot 'evavo-local-storage'
$Storage = Join-Path $GitReposRoot 'evavo-storage'
$Development = Join-Path $GitReposRoot 'evavo-development-studio'
$Game = Join-Path $GitReposRoot 'california-games'
$Checks = [Collections.Generic.List[object]]::new()
$Failures = [Collections.Generic.List[string]]::new()

foreach ($Pair in @(
    @('art-studio', $Art),
    @('local-compute', $Compute),
    @('local-storage', $LocalStorage),
    @('storage', $Storage),
    @('development-studio', $Development),
    @('california-games', $Game)
)) {
    Add-Check "repo-$($Pair[0])" (Test-Path -LiteralPath $Pair[1] -PathType Container) $Pair[1]
}

$RequiredArt = @(
    'evavo.tasks.json',
    'tools\image_workstation.py',
    'tools\sprite_sheet_segmenter.py',
    'tools\sprite_animation_preview.py',
    'tools\sprite_workstation.py',
    'tools\game_art_workstation_mcp.mjs',
    'tools\creative-asset-publisher\mcp.mjs',
    'scripts\audit-pixel-art-candidate.mjs',
    'scripts\New-ProjectArtWorkspaceMcpConfig.ps1'
)
foreach ($Relative in $RequiredArt) { [void](Require-File (Join-Path $Art $Relative) "art-file-$Relative") }

$TasksPath = Join-Path $Art 'evavo.tasks.json'
if (Test-Path -LiteralPath $TasksPath -PathType Leaf) {
    $Tasks = Get-Content -LiteralPath $TasksPath -Raw | ConvertFrom-Json -ErrorAction Stop
    foreach ($TaskId in @('pixel-art-candidate-audit','game-art-raster-edit','game-art-sheet-segment','game-art-animation-preview','game-art-sprite-build')) {
        $Task = $Tasks.tasks.PSObject.Properties[$TaskId].Value
        Add-Check "task-$TaskId" ([bool]$Task) $(if ($Task) { [string]$Task.runtime } else { 'missing' })
        if ($TaskId -ne 'pixel-art-candidate-audit' -and $Task) {
            Add-Check "task-$TaskId-image-finishing" ($Task.pythonEnvironment -eq 'image-finishing') ([string]$Task.pythonEnvironment)
            Add-Check "task-$TaskId-network" ($Task.network -eq 'disabled') ([string]$Task.network)
        }
    }
}

$ComputeVersionPath = Join-Path $Compute 'src\evavo_local_compute\version.py'
$StorageVersionPath = Join-Path $LocalStorage 'src\evavo_local_storage\version.py'
if (Test-Path -LiteralPath $ComputeVersionPath) {
    $Raw = Get-Content -LiteralPath $ComputeVersionPath -Raw
    $Match = [regex]::Match($Raw, 'VERSION\s*=\s*"([0-9.]+)"')
    Add-Check 'local-compute-version' ($Match.Success -and ([version]$Match.Groups[1].Value -ge [version]'0.14.3')) $Match.Groups[1].Value
}
if (Test-Path -LiteralPath $StorageVersionPath) {
    $Raw = Get-Content -LiteralPath $StorageVersionPath -Raw
    $Match = [regex]::Match($Raw, 'VERSION\s*=\s*"([0-9.]+)"')
    Add-Check 'local-storage-version' ($Match.Success -and ([version]$Match.Groups[1].Value -ge [version]'0.48.9')) $Match.Groups[1].Value
}

$ComputeBridge = Join-Path $Compute 'src\evavo_local_compute\cli_current.py'
$LocalBridge = Join-Path $LocalStorage 'src\evavo_local_storage\remote_node_chat_image.py'
if (Test-Path -LiteralPath $ComputeBridge) {
    $Text = Get-Content -LiteralPath $ComputeBridge -Raw
    Add-Check 'compute-parameter-task-plan' ($Text.Contains('parameter-task-plan')) 'parameter-task-plan'
    Add-Check 'compute-parameter-task-submit' ($Text.Contains('parameter-task-submit')) 'parameter-task-submit'
    Add-Check 'compute-managed-python-contract' ($Text.Contains('managedPythonEnvironmentSupported')) 'managedPythonEnvironmentSupported'
}
if (Test-Path -LiteralPath $LocalBridge) {
    $Text = Get-Content -LiteralPath $LocalBridge -Raw
    Add-Check 'local-storage-parameter-plan-action' ($Text.Contains('storage.compute_parameterized_task_plan')) 'storage.compute_parameterized_task_plan'
    Add-Check 'local-storage-parameter-submit-action' ($Text.Contains('storage.compute_parameterized_task_submit')) 'storage.compute_parameterized_task_submit'
}

$GameBindingPath = Join-Path $Game '.evavo\creative-assets.json'
if (Test-Path -LiteralPath $GameBindingPath) {
    $Binding = Get-Content -LiteralPath $GameBindingPath -Raw | ConvertFrom-Json -ErrorAction Stop
    Add-Check 'games94-display-name' ($Binding.displayName -eq "Games '94") ([string]$Binding.displayName)
    Add-Check 'games94-remote' ($Binding.repository.remote -eq 'EVAVO-STUDIO/california-games') ([string]$Binding.repository.remote)
    Add-Check 'games94-main' ($Binding.repository.defaultBranch -eq 'main') ([string]$Binding.repository.defaultBranch)
    Add-Check 'games94-no-direct-generation' ($Binding.sourceMasterPolicy.directGeneratedOutputAllowed -eq $false) ([string]$Binding.sourceMasterPolicy.directGeneratedOutputAllowed)
}

$ImagePython = Join-Path $env:LOCALAPPDATA 'EVAVO\AI\runtime\envs\image-finishing\Scripts\python.exe'
$PythonPresent = Test-Path -LiteralPath $ImagePython -PathType Leaf
Add-Check 'image-finishing-python' $PythonPresent $ImagePython
if ($PythonPresent) {
    $global:LASTEXITCODE = 0
    $Pillow = & $ImagePython -c 'import PIL; print(PIL.__version__)' 2>&1
    Add-Check 'image-finishing-pillow' ($global:LASTEXITCODE -eq 0) (($Pillow | Out-String).Trim())
}

foreach ($Tool in @('node','ffmpeg','ffprobe','git')) {
    $Command = Get-Command $Tool -ErrorAction SilentlyContinue
    Add-Check "tool-$Tool" ([bool]$Command) $(if ($Command) { $Command.Source } else { 'missing' })
}
$Godot = Get-Command godot -ErrorAction SilentlyContinue
if (-not $Godot) { $Godot = Get-Command godot4 -ErrorAction SilentlyContinue }
Add-Check 'tool-godot' ([bool]$Godot) $(if ($Godot) { $Godot.Source } else { 'missing' })

$WorkspaceRoot = Join-Path $env:LOCALAPPDATA 'EVAVO\LocalStorage\workspaces\ArtStudio'
$StagingRoot = Join-Path $env:LOCALAPPDATA 'EVAVO\LocalStorage\staging\ArtStudio'
Add-Check 'workspace-root-policy' ($WorkspaceRoot -notmatch '^C:\\EVAVO\\') $WorkspaceRoot
Add-Check 'staging-root-policy' ($StagingRoot -notmatch '^C:\\EVAVO\\') $StagingRoot
Add-Check 'retired-downloads-root' (-not (Test-Path -LiteralPath 'C:\Downloads' -PathType Container)) 'C:\Downloads should remain retired'

$Git = Get-Command git -ErrorAction SilentlyContinue
if ($Git) {
    foreach ($Repo in @($Art,$Compute,$LocalStorage,$Storage,$Development,$Game)) {
        if (-not (Test-Path -LiteralPath (Join-Path $Repo '.git') -PathType Container)) { continue }
        $Branch = (& $Git.Source -C $Repo branch --show-current 2>$null | Out-String).Trim()
        Add-Check "git-main-$([IO.Path]::GetFileName($Repo))" ($Branch -eq 'main') $Branch
    }
}

$Result = [ordered]@{
    contract = 'evavo.games94-art-worker-stack-check.v1'
    ok = ($Failures.Count -eq 0)
    checkedAt = [DateTimeOffset]::UtcNow.ToString('o')
    gitReposRoot = $GitReposRoot
    checks = @($Checks)
    failures = @($Failures)
    sourceMutation = $false
    repositoryMutation = $false
    storageMutation = $false
    providerExecution = $false
    forcePush = $false
}
$Result | ConvertTo-Json -Depth 12
if ($Failures.Count -gt 0) { exit 2 }
