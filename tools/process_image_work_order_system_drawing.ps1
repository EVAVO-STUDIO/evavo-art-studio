[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][string]$OutputRoot,
    [Parameter(Mandatory = $true)][string]$WorkOrder,
    [Parameter(Mandatory = $true)][string]$Output,
    [Parameter(Mandatory = $true)][string]$Receipt
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $IsWindows) {
    throw 'The System.Drawing fallback is Windows-only.'
}
Add-Type -AssemblyName System.Drawing

function Resolve-Root([string]$Path) {
    $resolved = [System.IO.Path]::GetFullPath($Path)
    if (-not (Test-Path -LiteralPath $resolved -PathType Container)) {
        throw "Root does not exist: $resolved"
    }
    return $resolved.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
}

function Resolve-Inside([string]$Root, [string]$Relative, [bool]$MustExist) {
    if ([System.IO.Path]::IsPathRooted($Relative) -or $Relative.Split([char[]]'\/') -contains '..') {
        throw "Path escaped approved root: $Relative"
    }
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $Root $Relative))
    if (-not $candidate.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path escaped approved root: $Relative"
    }
    if ($MustExist -and -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        throw "File does not exist: $candidate"
    }
    $current = if ($MustExist) { Get-Item -LiteralPath $candidate -Force } else { Get-Item -LiteralPath (Split-Path -Parent $candidate) -Force }
    while ($null -ne $current -and $current.FullName.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
        if (($current.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Reparse points are prohibited: $($current.FullName)"
        }
        $current = $current.Parent
    }
    return $candidate
}

function Get-TargetCanvas($Value) {
    if ($Value -is [System.Array] -and $Value.Count -eq 2) {
        return @([int]$Value[0], [int]$Value[1])
    }
    if ($null -ne $Value.width -and $null -ne $Value.height) {
        return @([int]$Value.width, [int]$Value.height)
    }
    throw 'targetCanvas must be [width,height] or an object.'
}

$sourceRootResolved = Resolve-Root $SourceRoot
$outputRootResolved = Resolve-Root $OutputRoot
$workOrderPath = [System.IO.Path]::GetFullPath($WorkOrder)
$receiptPath = [System.IO.Path]::GetFullPath($Receipt)
if (-not (Test-Path -LiteralPath $workOrderPath -PathType Leaf)) { throw 'Work order does not exist.' }
if (Test-Path -LiteralPath $receiptPath) { throw 'Receipt must be create-only.' }

$workOrderBytes = [System.IO.File]::ReadAllBytes($workOrderPath)
$workOrderObject = [System.Text.Encoding]::UTF8.GetString($workOrderBytes) | ConvertFrom-Json -Depth 100
if ($workOrderObject.schema -ne 'evavo.image-reference-work-order.v1') { throw 'Unexpected work-order schema.' }
if ($workOrderObject.decision -ne 'edit') { throw 'System.Drawing accepts edit decisions only.' }

$sourcePath = Resolve-Inside $sourceRootResolved ([string]$workOrderObject.sourcePath) $true
$outputPath = Resolve-Inside $outputRootResolved $Output $false
if (Test-Path -LiteralPath $outputPath) { throw 'Candidate output must be create-only.' }
if ([System.IO.Path]::GetExtension($outputPath).ToLowerInvariant() -ne '.png') {
    throw 'The System.Drawing fallback supports PNG output only.'
}
$sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sourceHash -ne ([string]$workOrderObject.sourceSha256).ToLowerInvariant()) { throw 'Source image changed after review.' }

$alphaPolicy = ([string]$workOrderObject.alphaPolicy).ToLowerInvariant()
if ($alphaPolicy.Contains('meaningful-alpha') -or $alphaPolicy.Contains('luminance')) {
    throw 'The System.Drawing fallback is not semantically compatible with meaningful-alpha or luminance-alpha work.'
}
$allowedOperations = @('inspect', 'canvas-normalize', 'resize', 'convert', 'optimize', 'background-preserve')
$operations = @($workOrderObject.operations)
if ($operations.Count -eq 0) { $operations = @('canvas-normalize', 'convert') }
foreach ($operation in $operations) {
    if ($allowedOperations -notcontains [string]$operation) { throw "Unsupported System.Drawing operation: $operation" }
}

$canvas = Get-TargetCanvas $workOrderObject.targetCanvas
if ($canvas[0] -lt 1 -or $canvas[1] -lt 1) { throw 'Invalid target canvas.' }
$sourceImage = $null
$target = $null
$graphics = $null
$tempPath = $null
try {
    $stream = [System.IO.File]::Open($sourcePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    try { $sourceImage = [System.Drawing.Image]::FromStream($stream, $true, $true) } finally { $stream.Dispose() }
    $target = New-Object System.Drawing.Bitmap($canvas[0], $canvas[1], [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($target)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $background = if ($alphaPolicy.Contains('black-stage')) { [System.Drawing.Color]::Black } else { [System.Drawing.Color]::Black }
    $graphics.Clear($background)

    $stretch = $operations -contains 'resize'
    if ($stretch) {
        $destination = New-Object System.Drawing.Rectangle(0, 0, $canvas[0], $canvas[1])
    }
    else {
        $scale = [Math]::Min($canvas[0] / $sourceImage.Width, $canvas[1] / $sourceImage.Height)
        $width = [Math]::Max(1, [int][Math]::Round($sourceImage.Width * $scale))
        $height = [Math]::Max(1, [int][Math]::Round($sourceImage.Height * $scale))
        $x = [int](($canvas[0] - $width) / 2)
        $y = [int](($canvas[1] - $height) / 2)
        $destination = New-Object System.Drawing.Rectangle($x, $y, $width, $height)
    }
    $graphics.DrawImage($sourceImage, $destination)
    $graphics.Flush()
    $directory = Split-Path -Parent $outputPath
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    $tempPath = Join-Path $directory ('.' + [System.IO.Path]::GetFileNameWithoutExtension($outputPath) + '.' + [guid]::NewGuid().ToString('N') + '.png')
    $target.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    if ($null -ne $graphics) { $graphics.Dispose() }
    if ($null -ne $target) { $target.Dispose() }
    if ($null -ne $sourceImage) { $sourceImage.Dispose() }
}

try {
    $candidateHash = (Get-FileHash -LiteralPath $tempPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $candidateBytes = (Get-Item -LiteralPath $tempPath).Length
    if ($candidateBytes -lt 128) { throw 'Candidate output is unexpectedly small.' }
    $sourceHashAfter = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($sourceHashAfter -ne $sourceHash) { throw 'Source image changed during processing.' }
    [System.IO.File]::Move($tempPath, $outputPath)
    $tempPath = $null

    $receiptObject = [ordered]@{
        schema = 'evavo.image-processing-receipt.v1'
        contract = 'evavo.executable-image-pipeline.v1'
        status = 'passed'
        backend = [ordered]@{ id = 'powershell-system-drawing'; version = [System.Environment]::Version.ToString() }
        workOrderPath = $workOrderPath
        workOrderSha256 = ([System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::HashData($workOrderBytes))).Replace('-', '').ToLowerInvariant()
        sourcePath = [string]$workOrderObject.sourcePath
        sourceSha256 = $sourceHash
        sourceSizeBytes = (Get-Item -LiteralPath $sourcePath).Length
        candidatePath = $Output.Replace('\', '/')
        candidateSha256 = $candidateHash
        candidateSizeBytes = $candidateBytes
        targetCanvas = @($canvas[0], $canvas[1])
        alphaPolicy = [string]$workOrderObject.alphaPolicy
        runtimeFormat = 'png'
        operations = $operations
        evidenceLevel = 'opaque-basic-fallback'
        creativeApproval = $false
        runtimeApproval = $false
        publicationAuthority = $false
    }
    $receiptJson = $receiptObject | ConvertTo-Json -Depth 100
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $receiptPath)) | Out-Null
    [System.IO.File]::WriteAllText($receiptPath, $receiptJson + "`n", [System.Text.UTF8Encoding]::new($false))
    [ordered]@{ status = 'passed'; candidate = $outputPath; candidateSha256 = $candidateHash; receipt = $receiptPath } | ConvertTo-Json -Compress
}
catch {
    if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath -Force }
    throw
}
finally {
    if ($null -ne $tempPath -and (Test-Path -LiteralPath $tempPath)) { Remove-Item -LiteralPath $tempPath -Force }
}
