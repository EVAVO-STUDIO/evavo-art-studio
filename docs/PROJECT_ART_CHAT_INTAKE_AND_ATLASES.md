# Project Art chat intake and sprite atlases

This boundary lets ChatGPT, Claude, a human operator, or another authorised agent take images that already exist on a mounted or local path and place them into a governed Art Studio workspace without sending the image bytes through MCP or model context.

It is designed for:

- conversation attachments mounted by ChatGPT;
- images generated during a ChatGPT session;
- images generated or supplied through Claude;
- loose local files and exported source-art folders;
- immutable provider candidates and EVAVO Storage materialisations;
- sprites, animation frames, effects, UI art, environment art and editable source files.

The intake layer does not call an image provider and does not approve, promote, commit, push, publish or delete anything. It preserves exact originals, creates separately editable working copies and emits exact provenance for every derived operation.

## End-to-end flow

```text
chat or local image path
→ exact intake plan
→ atomic temporary Art Studio workspace
→ immutable originals + editable working copies
→ deterministic image operations or review
→ optional sprite sheet / sprite atlas build
→ EVAVO Storage handoff or governed repository writer
→ independent approval and release gates
```

Large image bytes never travel through MCP. MCP and agent tools carry only local paths, logical paths, SHA-256 identities, byte counts, plans and receipts.

## 1. Create an intake request

```json
{
  "schema": "evavo.project-art-intake-request.v1",
  "sessionId": "chat-battle-chess-20260809-01",
  "projectId": "battle-chess",
  "createdBy": "chatgpt",
  "allowedSourceRoots": [
    "/mnt/data",
    "C:\\EVAVO\\Incoming Art"
  ],
  "sources": [
    {
      "id": "white-rook-idle-01",
      "sourcePath": "/mnt/data/white-rook-idle-01.png",
      "origin": "chat-upload",
      "logicalPath": "characters/white-rook/idle/white-rook-idle-01.png",
      "role": "sprite-frame",
      "tags": ["white-rook", "idle"]
    }
  ],
  "storage": {
    "enabled": true,
    "vaultId": "art",
    "logicalPrefix": "Projects/BattleChess/Art",
    "tags": ["battle-chess", "raw-art"]
  }
}
```

Supported origins are:

```text
chat-upload
chat-generated
claude-upload
claude-generated
human-upload
local-file
evavo-storage
provider-output
repository-file
```

The compiler resolves every source through an explicitly allowed root, rejects symbolic links, hashes the current bytes and records the exact byte count before any workspace is created.

## 2. Compile and execute intake

```powershell
Set-Location C:\GitRepos\evavo-art-studio

pnpm run project-art:intake:compile -- `
  --request C:\EVAVO\staging\battle-chess-intake-request.json `
  --output C:\EVAVO\staging\battle-chess-intake-plan.json

pnpm run project-art:intake:run -- `
  --plan C:\EVAVO\staging\battle-chess-intake-plan.json `
  --output-root C:\EVAVO\ArtWorkspaces\battle-chess-chat-20260809-01
```

The output root must not exist. Publication is atomic: the executor writes into an isolated sibling directory, verifies every copied file, writes manifests create-only and then renames the complete workspace into place.

Workspace layout:

```text
sources/
  immutable exact originals
working/
  separately editable copies organised by logical art path
manifests/
  intake-receipt.json
  storage-handoff.json
review/
  reserved for review evidence and comparisons
```

An editable working copy can be cropped, repaired, resized, cleaned, converted or passed into the existing project-art sandbox while its exact original remains available for comparison and recovery.

## 3. Persist selected art in EVAVO Storage

The intake executor creates:

```text
manifests/storage-handoff.json
```

It uses:

```text
evavo.storage-art-ingest-request.v1
```

The handoff binds each local working file to its exact SHA-256, byte count, media type, project, session, origin, role and target logical storage path. It deliberately records `storageWrite = false`; the EVAVO Storage art-ingest tool must be called separately with write authority and a stable idempotency key.

This lets temporary experiments remain temporary while approved source material, useful candidates and completed assets can be retained durably when needed.

## 4. Build a variable-size sprite atlas

Create an atlas request using files from the working tree:

```json
{
  "schema": "evavo.project-art-atlas-request.v1",
  "atlasId": "white-rook-idle",
  "projectId": "battle-chess",
  "outputName": "white-rook-idle",
  "allowedSourceRoots": [
    "C:\\EVAVO\\ArtWorkspaces\\battle-chess-chat-20260809-01\\working"
  ],
  "frames": [
    {
      "id": "white-rook/idle/01",
      "sourcePath": "C:\\EVAVO\\ArtWorkspaces\\battle-chess-chat-20260809-01\\working\\characters\\white-rook\\idle\\01.png",
      "pivot": { "x": 0.5, "y": 1.0 }
    }
  ],
  "options": {
    "trimAlpha": true,
    "alphaThreshold": 0,
    "padding": 2,
    "margin": 2,
    "extrude": 1,
    "powerOfTwo": true,
    "square": false,
    "allowRotation": false,
    "maximumWidth": 4096,
    "maximumHeight": 4096
  }
}
```

Compile and execute:

```powershell
pnpm run project-art:atlas:compile -- `
  --request C:\EVAVO\staging\white-rook-idle-atlas-request.json `
  --output C:\EVAVO\staging\white-rook-idle-atlas-plan.json

pnpm run project-art:atlas:run -- `
  --plan C:\EVAVO\staging\white-rook-idle-atlas-plan.json `
  --output-root C:\EVAVO\ArtWorkspaces\battle-chess-chat-20260809-01\atlases\white-rook-idle
```

The deterministic packer supports different frame sizes, alpha trimming, padding, margin, edge extrusion, optional rotation, power-of-two sizing and a bounded maximum canvas. It emits:

```text
<name>.png
<name>.atlas.json
<name>.texturepacker.json
<name>.phaser.json
<name>.godot.json
<name>.receipt.json
```

The TexturePacker and Phaser files use JSON Hash frame records. The Godot region map records atlas regions, source margins and pivots for a project-owned importer or runtime loader. The canonical EVAVO manifest retains every source SHA-256 and trim rectangle.

This is a sprite atlas rather than only a uniform sprite sheet. Existing Art Studio sheet slicing and sheet assembly remain available for fixed-cell workflows.

## 5. Repository organisation and publication

Art Studio workspaces can contain renamed, repaired, assembled and atlas-ready files, but this boundary never edits a Git repository itself.

Use the EVAVO repository asset writer for a reviewed batch of:

```text
put
move
rename
delete
```

The writer consumes only exact local paths and hashes, applies optimistic concurrency against the expected repository head, commits in an isolated worktree and pushes a non-main branch without force. Development Studio remains the separate approval and mainline-publication authority.

## Safety properties

The intake and atlas tools fail closed on:

- source files outside explicit allowed roots;
- symbolic links anywhere in a source path;
- a source whose bytes changed after compilation;
- duplicate IDs or destination paths;
- unsupported or multi-frame atlas inputs;
- output directories that already exist;
- invalid self hashes;
- atlas overflow or overlapping packed regions;
- any request that attempts to enable storage writes, repository mutation, approval, deployment, publication or force push in this boundary.

Originals are never overwritten or deleted. Temporary workspaces can be removed by an operator after useful outputs have been retained in EVAVO Storage or committed through the governed writer.
