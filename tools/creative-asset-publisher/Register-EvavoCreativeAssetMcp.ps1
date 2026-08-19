[CmdletBinding()]
param(
    [string]$GitReposRoot = 'C:\GitRepos',
    [string[]]$ClientConfigPaths = @(),
    [string]$ServerName = 'evavo-creative-assets',
    [string]$WorkstationServerName = 'evavo-game-art-workstation',
    [switch]$EnableWrite,
    [switch]$EnableWorkstationWrite,
    [switch]$EnableDevelopmentStudioDispatch,
    [switch]$EnableStorageDispatch,
    [string[]]$StorageOperatorCommand = @(),
    [string]$StateRoot,
    [string[]]$WorkstationRoots = @(),
    [switch]$EnableValidatedMain,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($EnableValidatedMain) { $EnableDevelopmentStudioDispatch = $true }
if (($EnableDevelopmentStudioDispatch -or $EnableStorageDispatch) -and -not $EnableWrite) {
    throw 'Publisher dispatch requires -EnableWrite.'
}

$GitReposRoot = [System.IO.Path]::GetFullPath($GitReposRoot)
$ArtStudioRoot = Join-Path $GitReposRoot 'evavo-art-studio'
$PublisherServer = Join-Path $ArtStudioRoot 'tools\creative-asset-publisher\mcp.mjs'
$WorkstationServer = Join-Path $ArtStudioRoot 'tools\game_art_workstation_mcp.mjs'
foreach ($RequiredServer in @($PublisherServer, $WorkstationServer)) {
    if (-not (Test-Path -LiteralPath $RequiredServer -PathType Leaf)) {
        throw "Required Art Studio MCP server is missing: $RequiredServer"
    }
}

$Node = (Get-Command node -ErrorAction Stop).Source
$Cli = Join-Path (Split-Path -Parent $PublisherServer) 'cli.mjs'
$Verify = Join-Path (Split-Path -Parent $PublisherServer) 'verify.mjs'
foreach ($RequiredFile in @($Cli, $Verify, (Join-Path (Split-Path -Parent $PublisherServer) 'distribution.json'))) {
    if (-not (Test-Path -LiteralPath $RequiredFile -PathType Leaf)) {
        throw "Creative Asset Publisher sealed runtime file is missing: $RequiredFile"
    }
}
$CapabilityJson = & $Node $Cli capabilities 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Creative Asset Publisher sealed runtime verification failed: $($CapabilityJson -join ' ')"
}
$Capabilities = ($CapabilityJson -join "`n") | ConvertFrom-Json
if ($Capabilities.version -ne '0.4.1' -or
    $Capabilities.artStudioGitCommit -ne $false -or
    $Capabilities.artStudioGitPush -ne $false -or
    $Capabilities.githubMcpMutationAuthority -ne $false -or
    $Capabilities.sealedExecutionPackageRequired -ne $true -or
    $Capabilities.exactShaProviderConfirmationRequired -ne $true -or
    $Capabilities.repositoryReliabilityProfileRequired -ne $true -or
    $Capabilities.rawMainlineApplyAuthority -ne $false -or
    $Capabilities.directMainlinePublisherAuthority -ne $false -or
    $Capabilities.forcePushAvailable -ne $false) {
    throw 'Creative Asset Publisher capability boundary verification failed.'
}

if (-not $StateRoot) { $StateRoot = Join-Path $env:LOCALAPPDATA 'EVAVO\creative-asset-publisher' }
$StateRoot = [System.IO.Path]::GetFullPath($StateRoot)
$LocalStorageWorkspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'EVAVO\LocalStorage\workspaces\ArtStudio'))
$LocalStorageStagingRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'EVAVO\LocalStorage\staging\ArtStudio'))
if ($EnableWorkstationWrite) {
    New-Item -ItemType Directory -Path $LocalStorageWorkspaceRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $LocalStorageStagingRoot -Force | Out-Null
}
$PublisherEnvironment = [ordered]@{
    EVAVO_GIT_REPOS_ROOT = $GitReposRoot
    EVAVO_CREATIVE_ASSET_STATE_ROOT = $StateRoot
    EVAVO_REPO_ROOTS = $GitReposRoot
    EVAVO_CREATIVE_ASSET_PUBLISHER_CLI = $Cli
}
if ($EnableWrite) { $PublisherEnvironment['EVAVO_CREATIVE_ASSET_WRITE_ENABLED'] = '1' }
if ($EnableDevelopmentStudioDispatch) {
    $Adapter = Join-Path $GitReposRoot 'evavo-development-studio\scripts\creative-assets\creative-asset-mainline-adapter.mjs'
    if (-not (Test-Path -LiteralPath $Adapter -PathType Leaf)) {
        throw "Development Studio creative-asset adapter is missing: $Adapter"
    }
    $PublisherEnvironment['EVAVO_CREATIVE_ASSET_DISPATCH_ENABLED'] = '1'
    $PublisherEnvironment['EVAVO_CREATIVE_ASSET_DEVELOPMENT_APPLY_ENABLED'] = '1'
    $PublisherEnvironment['EVAVO_CREATIVE_ASSET_OPERATOR_COMMAND_JSON'] = ConvertTo-Json -InputObject @($Node, $Adapter) -Compress
}
if ($EnableStorageDispatch) {
    if ($StorageOperatorCommand.Count -lt 1) {
        $PythonCommand = Get-Command python -ErrorAction SilentlyContinue
        $PythonPrefix = @()
        if (-not $PythonCommand) {
            $PythonCommand = Get-Command py -ErrorAction Stop
            $PythonPrefix = @('-3')
        }
        $StorageAdapter = Join-Path $GitReposRoot 'evavo-storage\src\evavo_storage\creative_asset_storage_adapter.py'
        if (-not (Test-Path -LiteralPath $StorageAdapter -PathType Leaf)) {
            throw "EVAVO Storage creative-asset adapter is missing: $StorageAdapter"
        }
        $StorageOperatorCommand = @($PythonCommand.Source) + $PythonPrefix + @($StorageAdapter)
    }
    $PublisherEnvironment['EVAVO_STORAGE_ART_INGEST_ROOTS'] = (Join-Path $StateRoot 'publication-handoffs')
    $PublisherEnvironment['EVAVO_CREATIVE_ASSET_STORAGE_DISPATCH_ENABLED'] = '1'
    $PublisherEnvironment['EVAVO_CREATIVE_ASSET_STORAGE_APPLY_ENABLED'] = '1'
    $PublisherEnvironment['EVAVO_CREATIVE_ASSET_STORAGE_OPERATOR_COMMAND_JSON'] = ConvertTo-Json -InputObject @($StorageOperatorCommand) -Compress
}

if ($WorkstationRoots.Count -lt 1) {
    $DefaultRoots = [System.Collections.Generic.List[string]]::new()
    $DefaultRoots.Add($GitReposRoot)
    $DefaultRoots.Add($LocalStorageWorkspaceRoot)
    $DefaultRoots.Add($LocalStorageStagingRoot)
    $DefaultRoots.Add((Join-Path $env:USERPROFILE 'Downloads'))
    $DefaultRoots.Add($StateRoot)
    $BeeStationCandidates = [System.Collections.Generic.List[string]]::new()
    if ($env:EVAVO_BEESTATION_PATH) { $BeeStationCandidates.Add($env:EVAVO_BEESTATION_PATH) }
    $BeeStationCandidates.Add((Join-Path $env:USERPROFILE 'Beestation'))
    $BeeStationCandidates.Add('C:\BEESTATION')
    foreach ($Candidate in $BeeStationCandidates) {
        if ($Candidate -and (Test-Path -LiteralPath $Candidate -PathType Container)) {
            $DefaultRoots.Add([System.IO.Path]::GetFullPath($Candidate))
            break
        }
    }
    $WorkstationRoots = @($DefaultRoots)
}
$WorkstationRoots = @(
    $WorkstationRoots |
        Where-Object { $_ } |
        ForEach-Object { [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($_)) } |
        Select-Object -Unique
)
if ($WorkstationRoots -contains 'C:\Downloads') {
    throw 'C:\Downloads is retired. Use %USERPROFILE%\Downloads.'
}
$WorkstationEnvironment = [ordered]@{
    EVAVO_GAME_ART_WORKSTATION_ROOTS = ($WorkstationRoots -join [IO.Path]::PathSeparator)
}
if ($EnableWorkstationWrite) {
    $WorkstationEnvironment['EVAVO_GAME_ART_WORKSTATION_ALLOW_WRITE'] = '1'
}

$PublisherDefinition = [pscustomobject][ordered]@{ command = $Node; args = @($PublisherServer); env = $PublisherEnvironment }
$WorkstationDefinition = [pscustomobject][ordered]@{ command = $Node; args = @($WorkstationServer); env = $WorkstationEnvironment }

$SnippetServers = New-Object PSCustomObject
$SnippetServers | Add-Member -MemberType NoteProperty -Name $ServerName -Value $PublisherDefinition
$SnippetServers | Add-Member -MemberType NoteProperty -Name $WorkstationServerName -Value $WorkstationDefinition
$Snippet = [pscustomobject][ordered]@{ mcpServers = $SnippetServers }

foreach ($ConfigPathValue in $ClientConfigPaths) {
    $ConfigPath = [System.IO.Path]::GetFullPath($ConfigPathValue)
    if (Test-Path -LiteralPath $ConfigPath -PathType Leaf) { $Document = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json }
    else { $Document = New-Object PSCustomObject }
    if (-not ($Document.PSObject.Properties.Name -contains 'mcpServers')) {
        $Document | Add-Member -MemberType NoteProperty -Name 'mcpServers' -Value (New-Object PSCustomObject)
    }
    $Servers = $Document.mcpServers
    foreach ($Registration in @(
        [pscustomobject]@{ Name = $ServerName; Definition = $PublisherDefinition },
        [pscustomobject]@{ Name = $WorkstationServerName; Definition = $WorkstationDefinition }
    )) {
        $Exists = $Servers.PSObject.Properties.Name -contains $Registration.Name
        if ($Exists -and -not $Force) { throw "MCP server '$($Registration.Name)' already exists in $ConfigPath. Use -Force after review." }
        if ($Exists) { $Servers.($Registration.Name) = $Registration.Definition }
        else { $Servers | Add-Member -MemberType NoteProperty -Name $Registration.Name -Value $Registration.Definition }
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $ConfigPath) -Force | Out-Null
    $Temporary = "$ConfigPath.evavo-$PID.tmp"
    $Json = ($Document | ConvertTo-Json -Depth 100) + "`n"
    [System.IO.File]::WriteAllText($Temporary, $Json, (New-Object System.Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $Temporary -Destination $ConfigPath -Force
}

[ordered]@{
    contract = 'evavo.creative-asset-mcp-registration.v6'
    publisherServerName = $ServerName
    workstationServerName = $WorkstationServerName
    publisherServer = $PublisherDefinition
    workstationServer = $WorkstationDefinition
    workstationRoots = @($WorkstationRoots)
    localStorageWorkspaceRoot = $LocalStorageWorkspaceRoot
    localStorageStagingRoot = $LocalStorageStagingRoot
    patchedConfigPaths = @($ClientConfigPaths)
    snippet = $Snippet
    workstationWriteEnabled = [bool]$EnableWorkstationWrite
    developmentStudioDispatchEnabled = [bool]$EnableDevelopmentStudioDispatch
    storageDispatchEnabled = [bool]$EnableStorageDispatch
    artStudioGitCommit = $false
    artStudioGitPush = $false
    forcePushAvailable = $false
} | ConvertTo-Json -Depth 30
