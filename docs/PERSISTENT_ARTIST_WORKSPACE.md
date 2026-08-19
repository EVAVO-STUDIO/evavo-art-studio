# Persistent Artist Workspace

The Persistent Artist Workspace is the durable, path-only working area for ChatGPT, Claude and trusted EVAVO agents. It turns a chat attachment, generated image, provider candidate or local source file into a governed art-production workspace without placing image bytes inside MCP arguments or silently replacing an original.

It is designed for long-running game-art, sprite, UI, illustration, environment, VFX, animation and mastering work that must survive beyond one conversation.

## Canonical storage model

Art Studio does not own a second physical-storage convention. It follows Local Storage and EVAVO Storage:

- `C:\GitRepos` contains source code and compact runtime assets only.
- `%LOCALAPPDATA%\EVAVO\LocalStorage\workspaces\ArtStudio` is the normal active worker workspace.
- `%LOCALAPPDATA%\EVAVO\LocalStorage\staging\ArtStudio` is the normal transient/staging area for exact plans, candidates and create-only outputs.
- `%USERPROFILE%\Downloads` is an intake location, not a durable art workspace.
- BeeStation is resolved by Local Storage (`EVAVO_BEESTATION_PATH`, then `%USERPROFILE%\Beestation`, then the existing `C:\BEESTATION` compatibility fallback) and is used for bulk sources, editable masters and large evidence when available.
- EVAVO Storage remains the immutable/version authority when configured.

Legacy `C:\EVAVO\ArtWorkspaces`, `C:\EVAVO\Evidence`, `C:\EVAVO\Incoming Art`, `C:\EVAVO\ArtArtifacts` and `C:\Downloads` are not canonical worker roots.

Generate a machine-specific MCP configuration instead of hand-writing user paths:

```powershell
powershell -ExecutionPolicy Bypass -File `
  C:\GitRepos\evavo-art-studio\scripts\New-ProjectArtWorkspaceMcpConfig.ps1 `
  -GitReposRoot C:\GitRepos `
  -OutputPath "$env:LOCALAPPDATA\EVAVO\ArtStudio\project-art-mcp.json" `
  -EnsureRoots
```

The generator resolves the actual user Downloads folder, managed `image-finishing` Python, FFmpeg/ffprobe, Local Storage workspace/staging roots and the live BeeStation path. Write authority remains off unless explicitly requested.

## Workspace layout

A create plan atomically publishes one workspace with these fixed areas:

```text
sources/                    immutable originals and exact source packages
working/                    current editable working copies
versions/                   append-only content-addressed versions
masks/                      alpha, luminance, selection and repair masks
scratch/                    temporary experiments and intermediate candidates
review/                     before/after, comparison and creative-review evidence
masters/                    technically mastered candidates
exports/                    engine- or publishing-ready deliverables
manifests/                  exact workspace and operation documents
manifests/storage-handoffs/ EVAVO Storage ingest requests
journals/                   bounded operation and recovery journals
```

The workspace manifest records the project, workspace identity, absolute workspace root, storage policy and exact create request/plan identities. The manifest is create-only and self-hashed.

## Immutable originals and working copies

The workspace separates immutable originals from editable files. Intake places original assets under `sources/` and makes separately editable copies under `working/`.

A deterministic edit, provider result or manual correction must produce a new candidate or replace only a governed working copy. The original source is not overwritten or deleted by the workspace compiler, sandbox, snapshot operation or Storage handoff.

This separation is important for generated art. A visually promising image may need edge cleanup, alpha repair, palette correction, anatomy repair, sprite alignment or a matching animation frame. Those changes must not destroy the exact bytes that were originally reviewed.

## Append-only versions

A snapshot request binds one exact file under `working/`, `masks/`, `scratch/`, `review/`, `masters/` or `exports/` to workspace/project/asset/version identifiers, canonical relative path, byte length, SHA-256, media metadata, role, note, creator, tags and exact request/plan identities.

Execution revalidates the source before copying, verifies copied bytes, revalidates the source after copying and atomically publishes:

```text
versions/<asset-id>/<version-id>/<exact-file>
versions/<asset-id>/<version-id>/version.json
versions/<asset-id>/<version-id>/receipt.json
```

An existing version directory is never replaced.

## Chat/Library workflow

1. ChatGPT, Claude, Gemini or another provider creates/receives an asset.
2. The exact full-resolution bytes are materialised on the host; model sandbox paths are never assumed to exist on Windows.
3. Local Storage admits and hashes the source, then stages it into a managed workspace when Local Compute needs to execute against it.
4. Art Studio binds the exact project and creates or reuses a persistent workspace.
5. Technical candidate audit runs before creative admission for pixel/game-art roles.
6. Project Art mastering, raster workstation, segmentation, local AI tools, motion/compositor tools and sprite/atlas tools operate on governed working copies.
7. Important results are snapshotted append-only.
8. Creative review decides whether to keep, repair, regenerate, vary or reject the candidate.
9. Approved source/master milestones are handed to EVAVO Storage/BeeStation.
10. Compact engine-ready derivatives receive a separately governed repository-publication plan.

Image bytes do not flow through MCP. Tools exchange confined paths, bounded JSON requests, exact hashes, plans, summaries and receipts.

## Local Compute integration

Art Studio repository tasks are intended to run through Local Compute parameterized tasks rather than arbitrary shells. Python game-art tasks declare the managed `image-finishing` environment so Pillow/media dependencies are not inherited from a random PATH interpreter.

Typical Games '94 tasks are:

```text
pixel-art-candidate-audit      Node, read-only technical gate
game-art-raster-edit           managed image-finishing Python
game-art-sheet-segment         managed image-finishing Python
game-art-animation-preview     managed image-finishing Python
game-art-sprite-build          managed image-finishing Python
```

Parameterized executions remain bound to the repository manifest SHA, exact entry SHA, parameter-document SHA, optional exact clean repository revision, and each plan/input hash defined by the Art Studio operation itself. Missing managed environments fail closed.

## Multi-image, frame and video work

The workspace is the shared visual context; chat history is not the asset database. Bring each required full-resolution image into `sources/`, retain exact extracted video frames under `scratch/` or `sources/`, and snapshot important working results into `versions/`. Do not rely on a low-resolution contact sheet, previous chat thumbnail or unrecorded provider response as the only reference.

Use the deterministic/tooling surfaces to:

- extract selected video timestamps with exact FFmpeg/ffprobe evidence;
- crop/paste exact regions between images;
- retain masks and body/prop/face/effect/correction layers separately;
- clean alpha, defringe and recover hidden RGB;
- perform perspective/affine transforms, curves, channel work and other advanced Project Art mastering;
- run simple pixel/game edits through the deterministic raster workstation;
- segment generated sheets into individually reviewable frames;
- compare before/after images and adjacent frames;
- create review strips, contact sheets, GIFs and onion skins;
- run bounded motion/compositing and Video Studio frame handoffs;
- build deterministic sprite atlases and Godot `SpriteFrames` after frame-level review.

For provider work, bind individual immutable references by semantic role—canonical identity, direction master, previous/next pose, palette, line, material and layer context—not one provider-made sheet. A generated animation frame is compared to its neighbours before another frame is requested.

Video extraction, AI segmentation and AI image edits remain unapproved reference/working material until technical and creative review pass.

## Create a workspace

Store request/plan documents in the Local Storage staging root and create the workspace below the active Art Studio workspace root. Example after resolving paths on the host:

```powershell
$Active = "$env:LOCALAPPDATA\EVAVO\LocalStorage\workspaces\ArtStudio"
$Staging = "$env:LOCALAPPDATA\EVAVO\LocalStorage\staging\ArtStudio"

node C:\GitRepos\evavo-art-studio\scripts\persistent-artist-workspace.mjs compile-create `
  --parent-root $Active `
  --request "$Staging\games94-jax-workspace.json" `
  --output "$Staging\games94-jax-workspace.plan.json"

node C:\GitRepos\evavo-art-studio\scripts\persistent-artist-workspace.mjs run-create `
  --plan "$Staging\games94-jax-workspace.plan.json"
```

## Save an exact working version

A snapshot request should include the exact source path and lowercase SHA-256. Example role metadata:

```json
{
  "schema": "evavo.persistent-artist-workspace-snapshot-request.v1",
  "workspaceId": "games94-jax-halfpipe-v1",
  "assetId": "jax-halfpipe-ready-0000",
  "versionId": "v004-clean-alpha-board-contact",
  "sourcePath": "working/jax/halfpipe/ready/0000.png",
  "expectedSha256": "<exact lowercase sha256>",
  "role": "sprite-frame-working-version",
  "note": "Clean alpha, canonical board contact and pivot alignment.",
  "createdBy": "chatgpt",
  "tags": ["games94", "jax", "halfpipe", "alpha-clean", "pivot-locked"]
}
```

## EVAVO Storage handoff

A handoff can include exact originals, working versions, append-only versions, masks, review evidence, masters and exports. The generated `evavo.storage-art-ingest-request.v1` records exact path, SHA-256, bytes, media type, logical path and workspace provenance.

The handoff does not perform the Storage write. `storageWrite` remains false until the separately authorised EVAVO Storage boundary reads and revalidates the request.

## Relationship to mastering, motion and review

The persistent workspace is the durable filesystem/version layer. Project Art and the raster workstation supply deterministic edits and advanced mastering. Video Studio supplies temporal lineage and deterministic motion/compositing. Sprite tooling supplies segmentation, preview, atlas packing and engine descriptors. Offline review supplies technical and creative evidence.

A technical pass is not creative approval. Passing dimensions, transparency, palette or loop-continuity rules does not prove that a face, pose, costume, material, silhouette or animation is creatively correct.

## Safety and authority boundary

Persistent workspace tooling:

- uses fixed repository-owned entrypoints rather than arbitrary shell;
- confines paths to configured non-symbolic roots;
- rejects traversal, symbolic-link and changed-source attacks;
- creates manifests, versions and receipts atomically;
- never overwrites an existing version;
- does not delete immutable originals;
- does not approve or promote a candidate;
- does not mutate a target repository by merely editing art;
- does not force-push Git;
- does not deploy or publish;
- does not perform the EVAVO Storage write.

Those authorities remain separate and explicit.

## Mandatory validation

```powershell
pnpm run project-art:workspace:persistent:check
python C:\GitRepos\evavo-art-studio\scripts\test-image-workstation.py -v
python C:\GitRepos\evavo-art-studio\scripts\test-sprite-workstation.py -v
node C:\GitRepos\evavo-art-studio\scripts\test-pixel-art-candidate-audit.mjs
```

For worker execution, use the repository tasks from `evavo.tasks.json` so Local Compute selects the managed image-finishing Python environment and binds the exact manifest/parameter/entry identities.
