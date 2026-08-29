param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Checked([string]$Label, [scriptblock]$Action) {
    Write-Host ""
    Write-Host $Label
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $RepoRoot
try {
    Invoke-Checked 'BUILDING ART STUDIO DOMAIN PACKAGES' {
        pnpm run build:domain
    }

    Invoke-Checked 'TYPECHECKING ART STUDIO TILE MAP CLI SURFACE' {
        pnpm --filter '@evavo/art-studio-cli' typecheck
    }

    Invoke-Checked 'RUNNING ART STUDIO CLI TESTS' {
        pnpm --filter '@evavo/art-studio-cli' test
    }

    Invoke-Checked 'RUNNING PROVIDER PACKAGE TESTS' {
        pnpm --filter '@evavo/art-providers' test
    }

    Invoke-Checked 'BUILDING PROVIDER WORKER' {
        pnpm --filter '@evavo/art-studio-worker' build
    }

    Invoke-Checked 'RUNNING ZERO-COST TILE MAP AUTHORIZATION TEST' {
        node --test .\scripts\test-tile-map-provider-authorization.mjs
    }

    Write-Host ""
    Write-Host 'TILE MAP ART PIPELINE STATIC/AUTHORIZATION VALIDATION PASSED'
    Write-Host 'No external provider call was made by this validation script.'
}
finally {
    Pop-Location
}
