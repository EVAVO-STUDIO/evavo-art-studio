[CmdletBinding()]
param(
    [string]$GitReposRoot = 'C:\GitRepos',
    [string]$OutputPath,
    [switch]$EnableWrite,
    [switch]$EnsureRoots,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$GitReposRoot = [System.IO.Path]::GetFullPath($GitReposRoot)
$ArtStudioRepo = Join-Path $GitReposRoot 'evavo-art-studio'
if (-not (Test-Path -LiteralPath $ArtStudioRepo -PathType Container)) {
    throw "Art Studio repository is unavailable: $ArtStudioRepo"
}

$LocalAppData = [System.IO.Path]::GetFullPath($env:LOCALAPPDATA)
$UserProfile = [System.IO.Path]::GetFullPath($env:USERPROFILE)
$Downloads = Join-Path $UserProfile 'Downloads'
$WorkspaceRoot = Join-Path $LocalAppData 'EVAVO\LocalStorage\workspaces\ArtStudio'
$StagingRoot = Join-Path $LocalAppData 'EVAVO\LocalStorage\staging\ArtStudio'
$EvidenceRoot = Join-Path $WorkspaceRoot 'evidence'
$ArtifactRoot = Join-Path $StagingRoot 'artifacts'

$BeeStation = $null
$BeeCandidates = [System.Collections.Generic.List[string]]::new()
if ($env:EVAVO_BEESTATION_PATH) { $BeeCandidates.Add($env:EVAVO_BEESTATION_PATH) }
$BeeCandidates.Add((Join-Path $UserProfile 'Beestation'))
$BeeCandidates.Add('C:\BEESTATION')
foreach ($Candidate in $BeeCandidates) {
    if ($Candidate -and (Test-Path -LiteralPath $Candidate -PathType Container)) {
        $BeeStation = [System.IO.Path]::GetFullPath($Candidate)
        break
    }
}

if ($EnsureRoots) {
    foreach ($Directory in @($WorkspaceRoot, $StagingRoot, $EvidenceRoot, $ArtifactRoot)) {
        New-Item -ItemType Directory -Path $Directory -Force | Out-Null
    }
}
if (-not (Test-Path -LiteralPath $Downloads -PathType Container)) {
    throw "Canonical user Downloads folder is unavailable: $Downloads"
}

$ImagePython = Join-Path $LocalAppData 'EVAVO\AI\runtime\envs\image-finishing\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $ImagePython -PathType Leaf)) {
    throw "Managed image-finishing Python is unavailable: $ImagePython"
}
$Ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
$Ffprobe = (Get-Command ffprobe -ErrorAction Stop).Source

$ReadRoots = [System.Collections.Generic.List[string]]::new()
foreach ($Root in @($GitReposRoot, $WorkspaceRoot, $StagingRoot, $Downloads)) { $ReadRoots.Add($Root) }
if ($BeeStation) { $ReadRoots.Add($BeeStation) }
$WorkspaceRoots = @($WorkspaceRoot, $StagingRoot)
$CatalogRoots = @($WorkspaceRoot, $EvidenceRoot)
if ($BeeStation) { $CatalogRoots += @((Join-Path $BeeStation 'EVAVO\Art Studio')) }

function New-Server([string]$Script, [hashtable]$Environment) {
    $Server = [ordered]@{
        command = (Get-Command node -ErrorAction Stop).Source
        args = @((Join-Path $ArtStudioRepo "tools\$Script"))
        env = [ordered]@{}
    }
    foreach ($Key in $Environment.Keys) { $Server.env[$Key] = [string]$Environment[$Key] }
    return $Server
}

$WriteFlag = if ($EnableWrite) { 'true' } else { 'false' }
$Servers = [ordered]@{}
$Servers['evavo-project-art-workspace'] = New-Server 'project_art_workspace_mcp.mjs' @{
    EVAVO_ART_WORKSPACE_ROOTS = ($ReadRoots -join [IO.Path]::PathSeparator)
    EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE = $WriteFlag
    EVAVO_ART_WORKSPACE_PYTHON = $ImagePython
    EVAVO_ART_WORKSPACE_MCP_TIMEOUT_MS = '600000'
    EVAVO_ART_FFMPEG_BIN = $Ffmpeg
    EVAVO_ART_FFPROBE_BIN = $Ffprobe
}
$Servers['evavo-project-art-workspace-ingest'] = New-Server 'project_art_workspace_ingest_mcp.mjs' @{
    EVAVO_ART_WORKSPACE_INGEST_ROOTS = ($WorkspaceRoots -join [IO.Path]::PathSeparator)
    EVAVO_ART_WORKSPACE_INGEST_SOURCE_ROOTS = ($ReadRoots -join [IO.Path]::PathSeparator)
    EVAVO_ART_WORKSPACE_INGEST_MCP_ALLOW_WRITE = $WriteFlag
    EVAVO_ART_WORKSPACE_INGEST_MCP_TIMEOUT_MS = '600000'
}
$Servers['evavo-project-art-workspace-catalog'] = New-Server 'project_art_workspace_catalog_mcp.mjs' @{
    EVAVO_PERSISTENT_CATALOG_ROOTS = ($CatalogRoots -join [IO.Path]::PathSeparator)
    EVAVO_PERSISTENT_CATALOG_MCP_ALLOW_WRITE = $WriteFlag
}
$Servers['evavo-project-art-workspace-jobs'] = New-Server 'project_art_workspace_jobs_mcp.mjs' @{
    EVAVO_ART_WORKSPACE_JOB_ROOTS = ($WorkspaceRoots -join [IO.Path]::PathSeparator)
    EVAVO_ART_WORKSPACE_JOBS_MCP_ALLOW_WRITE = $WriteFlag
}
$Servers['evavo-project-art-avatar-final-pass-provider'] = New-Server 'project_art_avatar_final_pass_provider_mcp.mjs' @{
    EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ROOTS = ($WorkspaceRoots -join [IO.Path]::PathSeparator)
    EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_MCP_ALLOW_WRITE = $WriteFlag
}
$Servers['evavo-project-art-avatar-final-pass-provider-runtime'] = New-Server 'project_art_avatar_final_pass_provider_runtime_mcp.mjs' @{
    EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_ROOTS = ($WorkspaceRoots -join [IO.Path]::PathSeparator)
    EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_MCP_ALLOW_WRITE = $WriteFlag
}
$Servers['evavo-project-art-avatar-final-pass-provider-candidate'] = New-Server 'project_art_avatar_final_pass_provider_candidate_mcp.mjs' @{
    EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_ROOTS = ($WorkspaceRoots -join [IO.Path]::PathSeparator)
    EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ARTIFACT_ROOTS = $ArtifactRoot
    EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_MCP_ALLOW_WRITE = $WriteFlag
}
$Servers['evavo-project-art-avatar-final-pass-provider-frame-finisher'] = New-Server 'project_art_avatar_final_pass_provider_frame_finisher_mcp.mjs' @{
    EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_ROOTS = ($WorkspaceRoots -join [IO.Path]::PathSeparator)
    EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_MCP_ALLOW_WRITE = $WriteFlag
}
$Servers['evavo-project-art-avatar-sequence-release'] = New-Server 'project_art_avatar_sequence_release_mcp.mjs' @{
    EVAVO_ART_AVATAR_SEQUENCE_RELEASE_ROOTS = ($WorkspaceRoots -join [IO.Path]::PathSeparator)
    EVAVO_ART_AVATAR_SEQUENCE_RELEASE_MCP_ALLOW_WRITE = $WriteFlag
}

$Document = [ordered]@{
    contract = 'evavo.project-art-workspace-mcp-config.v2'
    generatedAt = [DateTime]::UtcNow.ToString('o')
    storageModel = [ordered]@{
        repositoryRoot = $GitReposRoot
        activeWorkspaceRoot = $WorkspaceRoot
        stagingRoot = $StagingRoot
        downloadsRoot = $Downloads
        beeStationRoot = $BeeStation
        gitRole = 'source-and-compact-runtime-assets-only'
        localStorageRole = 'active-worker-workspace-and-staging'
        beeStationStorageRole = 'bulk-source-master-evidence-retention'
    }
    mcpServers = $Servers
}

if ($OutputPath) {
    $Target = [System.IO.Path]::GetFullPath($OutputPath)
    if ((Test-Path -LiteralPath $Target) -and -not $Force) {
        throw "Refusing to overwrite existing MCP config without -Force: $Target"
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $Target) -Force | Out-Null
    $Temporary = "$Target.evavo-$PID.tmp"
    [System.IO.File]::WriteAllText($Temporary, ($Document | ConvertTo-Json -Depth 50) + "`n", (New-Object System.Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $Temporary -Destination $Target -Force
}

$Document | ConvertTo-Json -Depth 50
