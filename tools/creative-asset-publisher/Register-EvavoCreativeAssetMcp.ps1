[CmdletBinding()]
param(
    [string]$GitReposRoot = 'C:\GitRepos',
    [string[]]$ClientConfigPaths = @(),
    [string]$ServerName = 'evavo-creative-assets',
    [switch]$EnableWrite,
    [switch]$EnableDevelopmentStudioDispatch,
    [switch]$EnableStorageDispatch,
    [string[]]$StorageOperatorCommand = @(),
    [string]$StateRoot,
    [switch]$EnableValidatedMain,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($EnableValidatedMain) { $EnableDevelopmentStudioDispatch = $true }
if (($EnableDevelopmentStudioDispatch -or $EnableStorageDispatch) -and -not $EnableWrite) {
    throw 'Dispatch requires -EnableWrite.'
}

$GitReposRoot = [System.IO.Path]::GetFullPath($GitReposRoot)
$Server = Join-Path $GitReposRoot 'evavo-art-studio\tools\creative-asset-publisher\mcp.mjs'
if (-not (Test-Path -LiteralPath $Server -PathType Leaf)) {
    throw "Creative Asset Publisher MCP server is missing: $Server"
}
$Node = (Get-Command node -ErrorAction Stop).Source
$Cli = Join-Path (Split-Path -Parent $Server) 'cli.mjs'
$Verify = Join-Path (Split-Path -Parent $Server) 'verify.mjs'
foreach ($RequiredFile in @($Cli, $Verify, (Join-Path (Split-Path -Parent $Server) 'distribution.json'))) {
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
$Environment = [ordered]@{
    EVAVO_GIT_REPOS_ROOT = $GitReposRoot
    EVAVO_CREATIVE_ASSET_STATE_ROOT = $StateRoot
    EVAVO_REPO_ROOTS = $GitReposRoot
    EVAVO_CREATIVE_ASSET_PUBLISHER_CLI = (Join-Path (Split-Path -Parent $Server) 'cli.mjs')
}
if ($EnableWrite) { $Environment['EVAVO_CREATIVE_ASSET_WRITE_ENABLED'] = '1' }
if ($EnableDevelopmentStudioDispatch) {
    $Adapter = Join-Path $GitReposRoot 'evavo-development-studio\scripts\creative-assets\creative-asset-mainline-adapter.mjs'
    if (-not (Test-Path -LiteralPath $Adapter -PathType Leaf)) {
        throw "Development Studio creative-asset adapter is missing: $Adapter"
    }
    $Environment['EVAVO_CREATIVE_ASSET_DISPATCH_ENABLED'] = '1'
    $Environment['EVAVO_CREATIVE_ASSET_DEVELOPMENT_APPLY_ENABLED'] = '1'
    $Environment['EVAVO_CREATIVE_ASSET_OPERATOR_COMMAND_JSON'] = ConvertTo-Json -InputObject @($Node, $Adapter) -Compress
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
    $Environment['EVAVO_STORAGE_ART_INGEST_ROOTS'] = (Join-Path $StateRoot 'publication-handoffs')
    $Environment['EVAVO_CREATIVE_ASSET_STORAGE_DISPATCH_ENABLED'] = '1'
    $Environment['EVAVO_CREATIVE_ASSET_STORAGE_APPLY_ENABLED'] = '1'
    $Environment['EVAVO_CREATIVE_ASSET_STORAGE_OPERATOR_COMMAND_JSON'] = ConvertTo-Json -InputObject @($StorageOperatorCommand) -Compress
}

$Definition = [pscustomobject][ordered]@{
    command = $Node
    args = @($Server)
    env = $Environment
}
$SnippetServers = New-Object PSCustomObject
$SnippetServers | Add-Member -MemberType NoteProperty -Name $ServerName -Value $Definition
$Snippet = [pscustomobject][ordered]@{ mcpServers = $SnippetServers }

foreach ($ConfigPathValue in $ClientConfigPaths) {
    $ConfigPath = [System.IO.Path]::GetFullPath($ConfigPathValue)
    if (Test-Path -LiteralPath $ConfigPath -PathType Leaf) {
        $Document = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    } else {
        $Document = New-Object PSCustomObject
    }
    if (-not ($Document.PSObject.Properties.Name -contains 'mcpServers')) {
        $Document | Add-Member -MemberType NoteProperty -Name 'mcpServers' -Value (New-Object PSCustomObject)
    }
    $Servers = $Document.mcpServers
    $Exists = $Servers.PSObject.Properties.Name -contains $ServerName
    if ($Exists -and -not $Force) {
        throw "MCP server '$ServerName' already exists in $ConfigPath. Use -Force after review."
    }
    if ($Exists) {
        $Servers.$ServerName = $Definition
    } else {
        $Servers | Add-Member -MemberType NoteProperty -Name $ServerName -Value $Definition
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $ConfigPath) -Force | Out-Null
    $Temporary = "$ConfigPath.evavo-$PID.tmp"
    $Json = ($Document | ConvertTo-Json -Depth 100) + "`n"
    [System.IO.File]::WriteAllText($Temporary, $Json, (New-Object System.Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $Temporary -Destination $ConfigPath -Force
}

[ordered]@{
    contract = 'evavo.creative-asset-mcp-registration.v3'
    serverName = $ServerName
    server = $Definition
    patchedConfigPaths = @($ClientConfigPaths)
    snippet = $Snippet
    developmentStudioDispatchEnabled = [bool]$EnableDevelopmentStudioDispatch
    storageDispatchEnabled = [bool]$EnableStorageDispatch
    artStudioGitCommit = $false
    artStudioGitPush = $false
} | ConvertTo-Json -Depth 30
