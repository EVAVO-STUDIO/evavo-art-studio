# RAW_ART folder workbench

The RAW_ART folder workbench gives ChatGPT, Claude and trusted EVAVO agents one direct, path-only way to work through a large game-art source folder without placing image bytes in MCP JSON and without modifying the originals.

It sits in front of the existing Project Art workbench, persistent Artist Workspace, pixel-font pipeline, provider runtime, EVAVO Storage, Godot Game Test Lab and repository-delivery tools.

## Production flow

```text
RAW_ART folder
→ exact recursive inventory
→ duplicate, collision, sequence and atlas evidence
→ named owner decisions
→ create-only working session outside RAW_ART
→ deterministic mastering, sprite, sheet, atlas and font tools
→ creative review
→ EVAVO Storage handoff
→ game delivery and Test Lab admission
→ separate guarded Git publication
```

The workbench never overwrites or deletes RAW_ART sources. A `quarantine-copy` action copies a suspect source into the session for review; it does not remove the original. Permanent retirement remains a separate archived and exact-hash authority.

## What the inventory records

Every regular file is bound to:

```text
canonical relative path
SHA-256
byte length
extension and technical kind
image format, width, height, bit depth and alpha where readable
hard-link count
technical warnings
non-authoritative filename role hint
non-authoritative sequence hint
```

The inventory also records:

```text
exact duplicate groups
case-insensitive path collisions
likely numbered or directional sequences
likely same-size atlas groups
counts by technical kind
counts by heuristic role
bounded sample files
```

Filename role and sequence hints are review aids only. They do not decide that an image is a character, animation frame, approved font, final asset or historically correct source.

## Owner-reviewed actions

A decision file uses schema:

```text
evavo.raw-art-folder-decisions.v1
```

Supported actions are:

```text
retain
ignore
working-copy
reference
master-source
sequence-frame
atlas-frame
quarantine-copy
```

Every selection repeats the exact inventory SHA-256 and byte length. Session planning reopens the source file and rejects drift before producing a plan.

Example:

```json
{
  "schema": "evavo.raw-art-folder-decisions.v1",
  "sessionId": "brass-raw-review-001",
  "inventorySha256": "<inventory-sha256>",
  "workspaceParent": "D:\\EVAVO-Art-Workspaces",
  "selections": [
    {
      "relativePath": "characters/captain/frame-001.png",
      "expectedSha256": "<file-sha256>",
      "expectedBytes": 12345,
      "action": "working-copy",
      "destination": "characters/captain/idle-001.png",
      "operations": ["trim-alpha", "edge-decontaminate"],
      "storageLogicalPath": "brass/characters/captain/idle-001.png",
      "repositoryTarget": "assets/characters/captain/idle-001.png"
    },
    {
      "relativePath": "characters/captain/frame-002.png",
      "expectedSha256": "<file-sha256>",
      "expectedBytes": 12345,
      "action": "sequence-frame",
      "groupId": "captain-idle",
      "destination": "frame-002.png"
    }
  ]
}
```

The workspace parent must be completely disjoint from RAW_ART. This prevents recursive scans, accidental source replacement and session outputs becoming new raw inputs.

## CLI

### 1. Scan RAW_ART

```powershell
node scripts/raw-art-folder-workbench.mjs scan `
  --raw-art-root C:\GitRepos\Brass_Brine\RAW_ART `
  --output D:\EVAVO-Evidence\Brass-Brine\raw-art-inventory.json `
  --generated-at 2026-08-12T00:00:00.000Z
```

The output is create-only and self-hashed:

```text
evavo.raw-art-folder-inventory.v1
```

### 2. Compile a reviewed session

```powershell
node scripts/raw-art-folder-workbench.mjs plan `
  --inventory D:\EVAVO-Evidence\Brass-Brine\raw-art-inventory.json `
  --decisions D:\EVAVO-Evidence\Brass-Brine\raw-art-decisions.json `
  --output D:\EVAVO-Evidence\Brass-Brine\raw-art-session-plan.json `
  --compiled-at 2026-08-12T00:10:00.000Z
```

The plan is:

```text
evavo.raw-art-folder-session-plan.v1
```

It includes exact create-only copy operations, sequence and atlas groups, deterministic mastering candidates, Storage logical paths and optional game-repository targets.

### 3. Materialise the working session

```powershell
node scripts/raw-art-folder-workbench.mjs materialize `
  --plan D:\EVAVO-Evidence\Brass-Brine\raw-art-session-plan.json
```

The resulting session contains only reviewed copies and manifests:

```text
working/
references/
master-sources/
sequences/
atlases/
quarantine/
manifests/
```

Sources are rehashed before and after every copy. Outputs are copied create-only into a temporary sibling and atomically renamed into place only after the complete session manifest has been written.

### 4. Verify a session

```powershell
node scripts/raw-art-folder-workbench.mjs verify `
  --session-root D:\EVAVO-Art-Workspaces\brass-raw-review-001
```

Verification rejects changed, missing, extra, symbolic or undeclared session files.

## MCP

Start the dedicated server:

```powershell
$env:EVAVO_RAW_ART_FOLDER_ALLOWED_ROOTS = "C:\GitRepos;D:\EVAVO-Evidence;D:\EVAVO-Art-Workspaces"
$env:EVAVO_RAW_ART_FOLDER_MCP_MODE = "read-write"
$env:EVAVO_RAW_ART_FOLDER_MCP_ALLOW_WRITES = "true"
node C:\GitRepos\evavo-art-studio\tools\raw_art_folder_mcp.mjs
```

Read-only mode exposes:

```text
evavo_raw_art_folder_capabilities
evavo_raw_art_folder_inspect
evavo_raw_art_folder_verify_session
```

Trusted write mode additionally exposes:

```text
evavo_raw_art_folder_write_inventory
evavo_raw_art_folder_compile_session
evavo_raw_art_folder_materialize_session
```

Each write tool requires:

```text
confirmWrite=true
```

Image bytes remain in local files. MCP returns bounded summaries and exact paths, hashes and counts.

## Continue with the existing Art Studio tools

A materialised session intentionally does not duplicate every existing editor or generator. Use the established `evavo-project-art-workspace` tools for the next exact step:

```text
evavo_art_compile_sandbox
evavo_art_run_sandbox
evavo_art_compile_reference_plan
evavo_art_stage_reference_artifacts
evavo_art_compile_atlas
evavo_art_run_atlas
evavo_art_compile_workspace_snapshot
evavo_art_prepare_storage_handoff
```

Use Pixel Font Studio v2 for font masters, glyph QA, BMFont/PNG/BDF/TTF output and Godot verification.

Use the governed provider runtime only when a reviewed source needs generation, recreation, inpainting, variation, an in-between or missing family member.

## Permanent authority boundary

The RAW_ART folder workbench performs no:

```text
creative approval
historical approval
provider execution
runtime submission
candidate promotion
source mutation
source deletion
EVAVO Storage write
game-checkout mutation
Git commit
Git push
publication
deployment
force push
```

Those remain separate, explicit authorities with their own evidence and confirmations.
