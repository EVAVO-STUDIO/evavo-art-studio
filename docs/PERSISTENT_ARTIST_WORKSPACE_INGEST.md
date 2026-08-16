# Persistent Artist Workspace external ingest

The external-ingest boundary lets ChatGPT, Claude and trusted EVAVO agents take exact files from mounted chat attachments, generated-image folders, reference-video folders, approved local art folders, RAW_ART review sessions or provider output folders and place them into an existing persistent Artist Workspace.

It closes the gap between **having a file available to the conversation** and **having a durable governed original plus an editable working copy**.

## Production flow

```text
chat attachment / generated image / approved folder
→ explicit source-root allowlist
→ stable path, inode, link-count, byte and SHA-256 inspection
→ self-hashed ingest plan
→ complete staging outside the visible asset directories
→ immutable copy under sources/
→ editable copy under working/
→ per-asset provenance
→ ingest receipt
→ commit marker written last
```

The original external file is read-only. It is never renamed, deleted, overwritten or moved. Image dimensions are recorded when a format can be safely inspected; MP4/M4V, MOV, WebM, MKV and AVI reference clips retain their exact video media type and bytes for later governed `video-frame-extract` work.

## Relationship to RAW_ART folder review

Use the RAW_ART folder workbench when a large source folder first needs recursive inventory, duplicate detection, sequence hints, atlas hints and owner-reviewed selection.

Use persistent external ingest when the exact files are already known and need to become governed members of an existing project workspace.

```text
RAW_ART inventory and decisions
→ create-only reviewed session
→ persistent external ingest
→ deterministic mastering and animation tools
→ visual review
→ EVAVO Storage handoff
→ separate repository publication
```

## Request contract

Requests use:

```text
evavo.persistent-artist-workspace-ingest-request.v1
```

Example:

```json
{
  "schema": "evavo.persistent-artist-workspace-ingest-request.v1",
  "workspaceId": "battle-chess-art-v1",
  "ingestId": "human-king-turnaround-001",
  "createdBy": "chatgpt",
  "note": "Import the reviewed eight-direction Human King masters.",
  "tags": ["battle-chess", "human-king", "turnaround"],
  "sourceRoots": [
    {
      "id": "chat-attachments",
      "path": "D:\\EVAVO-Incoming-Art\\Human-King"
    }
  ],
  "items": [
    {
      "assetId": "human-king-front",
      "sourceRootId": "chat-attachments",
      "sourcePath": "front.png",
      "expectedSha256": "<lowercase-sha256>",
      "expectedBytes": 123456,
      "destinationPath": "characters/human-king/turnaround/front.png",
      "title": "Human King front master",
      "role": "direction-master",
      "origin": "chat-generated",
      "tags": ["front", "canonical-identity"]
    }
  ]
}
```

The request supports up to:

```text
64 approved source roots
1,000 items
2 GiB per file
16 GiB aggregate source bytes
```

Every `sourcePath` is relative to its named approved root. Absolute paths, `..`, backslashes inside logical paths, symbolic components and multiply linked files fail closed.

Source roots must be disjoint from the destination persistent workspace. This prevents a working copy or prior export from being reintroduced as an external original by accident.

## Compiled plan

Compilation emits:

```text
evavo.persistent-artist-workspace-ingest-plan.v1
```

The plan binds:

```text
workspace manifest identity
request byte identity
source-root real paths
source canonical paths
source absolute paths
source device and inode snapshot
source SHA-256 and byte length
media type and readable image dimensions
destination source and working paths
provenance paths
resource limits
execution and authority boundaries
```

The runtime independently reproduces the fixed resource and authority policy. Rehashing an edited plan cannot raise production limits or grant Storage, repository, approval, deployment or publication authority.

## Publication layout

For `destinationPath`:

```text
characters/human-king/turnaround/front.png
```

publication creates:

```text
sources/characters/human-king/turnaround/front.png
working/characters/human-king/turnaround/front.png
manifests/ingests/<ingest-id>/items/<asset-id>.json
```

The `sources/` copy is immutable project provenance. The `working/` copy is editable through the existing governed workspace writer and deterministic Project Art operations.

After all item files are ready, ingest writes:

```text
manifests/ingests/<ingest-id>/receipt.json
manifests/ingests/<ingest-id>/commit.json
```

The commit marker is written last. Its existence means every declared source copy, working copy, provenance document and receipt was published successfully.

## Complete rollback

All files are first built inside a private staging directory under `journals/`.

Visible publication uses exclusive create-only copies. If any target appears after compilation, a byte mismatch is detected, a source changes or any later publication fails:

```text
all files created by that ingest are removed
pre-existing files remain untouched
newly created empty directories are removed where safe
staging is removed
no commit marker survives
```

The regression suite deliberately creates a working-copy collision after compilation. It proves that an already published immutable source copy is removed again and the pre-existing conflicting file is preserved byte-for-byte.

## CLI

### Inspect capabilities

```powershell
node scripts/persistent-artist-workspace-ingest.mjs capabilities
```

### Compile an ingest

```powershell
node scripts/persistent-artist-workspace-ingest.mjs compile-ingest `
  --workspace-root D:\EVAVO-Art-Workspaces\battle-chess-art-v1 `
  --request D:\EVAVO-Evidence\battle-chess\human-king-ingest.json `
  --output D:\EVAVO-Art-Workspaces\battle-chess-art-v1\manifests\human-king-ingest-plan.json `
  --compiled-at 2026-08-12T02:00:00.000Z
```

### Run an ingest

```powershell
node scripts/persistent-artist-workspace-ingest.mjs run-ingest `
  --workspace-root D:\EVAVO-Art-Workspaces\battle-chess-art-v1 `
  --plan D:\EVAVO-Art-Workspaces\battle-chess-art-v1\manifests\human-king-ingest-plan.json
```

## MCP for ChatGPT and Claude

Use:

```text
config/mcp.persistent-artist-workspace-ingest.windows.example.json
```

Read-only capability inspection is always exposed:

```text
evavo_art_workspace_ingest_capabilities
```

Trusted write mode additionally exposes:

```text
evavo_art_compile_workspace_ingest
evavo_art_run_workspace_ingest
```

Both write tools require:

```text
confirmWrite=true
```

The MCP deployment requires two independent allowlists:

```text
EVAVO_ART_WORKSPACE_INGEST_ROOTS
EVAVO_ART_WORKSPACE_INGEST_SOURCE_ROOTS
```

The first confines workspaces, request files, plans and evidence. The second confines the external files that requests may read.

Image bytes remain in local files and never pass through MCP JSON. The server returns bounded paths, hashes, counts and receipt identities.

## Continue through Art Studio

After ingest, use the existing Project Art tools for:

```text
image-master
image-composite
image-compare
motion-sequence
sprite-sheet slicing and assembly
variable-size atlas packing
sequence review
loop-closure review
persistent snapshots
EVAVO Storage handoff
```

Provider output remains raw material. A technical pass is not creative approval, and an ingest commit is not candidate promotion.

## Authority boundary

External ingest performs no:

```text
source mutation
source deletion
provider execution
creative approval
candidate promotion
EVAVO Storage write
target-repository mutation
Git publication
runtime activation
deployment
publication
force push
```

Those remain separate explicit authorities with their own confirmations and evidence.
