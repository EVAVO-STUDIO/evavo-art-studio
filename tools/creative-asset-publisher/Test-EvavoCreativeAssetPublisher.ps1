[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$PublisherRoot = (Resolve-Path $PSScriptRoot).Path
$Node = Get-Command node -ErrorAction Stop
$PowerShellFiles = Get-ChildItem -LiteralPath $PublisherRoot -Filter '*.ps1' -File
$ParseErrors = [System.Collections.Generic.List[object]]::new()
foreach ($File in $PowerShellFiles) {
    $Tokens = $null
    $Errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile(
        $File.FullName,
        [ref]$Tokens,
        [ref]$Errors
    )
    foreach ($ErrorRecord in @($Errors)) {
        $ParseErrors.Add([ordered]@{
            path = $File.FullName
            message = $ErrorRecord.Message
            line = $ErrorRecord.Extent.StartLineNumber
            column = $ErrorRecord.Extent.StartColumnNumber
        })
    }
}
if ($ParseErrors.Count -gt 0) {
    throw "Creative Asset Publisher PowerShell parse failed: $($ParseErrors | ConvertTo-Json -Depth 8 -Compress)"
}

$JavaScriptFiles = @(
    'run.mjs',
    'cli.mjs',
    'mcp.mjs',
    'verify.mjs',
    'test-sealed-distribution.mjs'
)
foreach ($Relative in $JavaScriptFiles) {
    $Path = Join-Path $PublisherRoot $Relative
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required Creative Asset Publisher file is missing: $Path"
    }
    & $Node.Source --check $Path
    if ($LASTEXITCODE -ne 0) {
        throw "Node syntax validation failed for $Relative with exit code $LASTEXITCODE."
    }
}

Push-Location $PublisherRoot
try {
    $Verification = (& $Node.Source '.\verify.mjs' | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Sealed runtime verification failed with exit code $LASTEXITCODE."
    }
    $DistributionTest = (& $Node.Source '.\test-sealed-distribution.mjs' | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Sealed distribution test failed with exit code $LASTEXITCODE."
    }
    $VerificationObject = $Verification | ConvertFrom-Json -ErrorAction Stop
    $DistributionObject = $DistributionTest | ConvertFrom-Json -ErrorAction Stop
}
finally {
    Pop-Location
}

if ($VerificationObject.status -ne 'verified') {
    throw 'Sealed runtime verification did not report verified.'
}
if ($DistributionObject.status -ne 'passed') {
    throw 'Sealed distribution test did not report passed.'
}

[ordered]@{
    contract = 'evavo.creative-asset-publisher-windows-worker-verification.v1'
    status = 'passed'
    verifiedAt = [DateTime]::UtcNow.ToString('o')
    publisherRoot = $PublisherRoot
    package = $VerificationObject.package
    bundleSha256 = $VerificationObject.bundleSha256
    archiveSha256 = $VerificationObject.archiveSha256
    runtimeFileCount = $DistributionObject.runtimeFileCount
    mcpToolCount = $DistributionObject.mcpToolCount
    parsedPowerShellFiles = @($PowerShellFiles.Name)
    repositoryMutationAuthority = $false
    storageMutationAuthority = $false
    forcePushAuthority = $false
} | ConvertTo-Json -Depth 12
