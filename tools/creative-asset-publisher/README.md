# EVAVO Creative Asset Publisher — sealed repository runtime

This directory contains the governed Art Studio installation of Creative Asset Publisher 0.4.1.

The source runtime is stored as sequential base64 parts containing one deterministic Brotli-compressed tar archive. `run.mjs` verifies:

- the exact distribution contract and authority flags;
- every part’s byte count and SHA-256;
- canonical base64 and the compressed bundle SHA-256;
- the archive byte count, tar header checksums, paths, entry types and terminal records;
- the extracted `checksums.sha256` hash, complete file inventory and every runtime file hash;
- the runtime package name and version on every launch.

The runtime is extracted to `%LOCALAPPDATA%\EVAVO\creative-asset-publisher\<bundle-sha256>` by default. Set `EVAVO_CREATIVE_ASSET_RUNTIME_ROOT` only to a reviewed ordinary local directory. Runtime source is not expanded into the Git worktree.

## Verify

```powershell
Set-Location C:\GitRepos\evavo-art-studio\tools\creative-asset-publisher
node .\verify.mjs
```

## CLI

```powershell
node .\cli.mjs capabilities
```

## MCP

```powershell
powershell -ExecutionPolicy Bypass -File .\Register-EvavoCreativeAssetMcp.ps1 -GitReposRoot C:\GitRepos -EnableWrite
```

Development Studio dispatch remains separately gated. Art Studio has no commit, push, merge, reset, force-push, Storage-write or GitHub MCP mutation authority.
