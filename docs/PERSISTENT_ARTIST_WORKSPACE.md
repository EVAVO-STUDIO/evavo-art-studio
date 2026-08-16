# Persistent Artist Workspace

The Persistent Artist Workspace is the durable, path-only working area for ChatGPT, Claude and trusted EVAVO agents. It turns a chat attachment, generated image, provider candidate or local source file into a governed art-production workspace without placing image bytes inside MCP arguments or silently replacing an original.

It is designed for long-running game-art, sprite, UI, illustration, environment, VFX, animation and mastering work that must survive beyond one conversation.

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

The workspace manifest records the project, workspace identity, absolute workspace root, storage policy and the exact create request and plan identities. The manifest is create-only and self-hashed.

## Immutable originals and working copies

The workspace separates immutable originals from editable files. Intake or a human operator places original assets under `sources/` and makes separately editable copies under `working/`.

A deterministic edit, provider result or manual correction must produce a new candidate or replace only a governed working copy. The original source is not overwritten or deleted by the workspace compiler, sandbox, snapshot operation or Storage handoff.

This separation is important for generated art. A visually promising image may need edge cleanup, alpha repair, palette correction, anatomy repair, sprite alignment or a matching animation frame. Those changes should not destroy the exact bytes that were originally reviewed.

## Append-only versions

A snapshot request binds one exact file under `working/`, `masks/`, `scratch/`, `review/`, `masters/` or `exports/` to:

- workspace, project, asset and version identifiers;
- canonical workspace-relative path;
- byte length and SHA-256;
- media type and image dimensions when available;
- role, note, creator and tags;
- exact request and plan identities.

Execution revalidates the source before copying, verifies the copied bytes, revalidates the source after copying and atomically publishes:

```text
versions/<asset-id>/<version-id>/<exact-file>
versions/<asset-id>/<version-id>/version.json
versions/<asset-id>/<version-id>/receipt.json
```

An existing version directory is never replaced. This gives agents a durable revision history without granting them arbitrary Git or repository mutation authority.

## ChatGPT and Claude workflow

The path-only MCP exposes fixed tools for:

```text
evavo_art_compile_workspace_create
evavo_art_run_workspace_create
evavo_art_compile_workspace_snapshot
evavo_art_run_workspace_snapshot
evavo_art_prepare_storage_handoff
```

A normal workflow is:

1. ChatGPT or Claude receives or generates an image.
2. The mounted image is admitted through the existing exact intake boundary.
3. A persistent workspace is created for the project or asset family.
4. Immutable originals and editable working copies are kept separately.
5. The deterministic sandbox performs cleanup, compositing, sprite, mastering or motion work.
6. Important working, review and master files are saved as append-only versions.
7. Creative review decides whether to keep, edit, recreate, vary, reference or reject the candidate.
8. Accepted files receive an exact EVAVO Storage handoff or a separately governed repository-publication plan.

Image bytes do not flow through MCP. The tools exchange paths, bounded JSON requests, exact hashes, plans, summaries and receipts.

## Multi-image, frame and video work

The workspace is the shared visual context; chat history is not the asset database. Bring each required full-resolution image into `sources/`, retain exact extracted video frames under `scratch/` or `sources/`, and snapshot important working results into `versions/`. Do not rely on a low-resolution contact sheet, a previous chat thumbnail or an unrecorded provider response as the only reference.

Use the deterministic sandbox to:

- extract selected video timestamps with `video-frame-extract` and an exact FFmpeg/ffprobe receipt;
- crop and paste exact regions between images with `image-composite.sourceRect`;
- crop a separate selection/matte with `maskSourceRect`;
- retain body, prop, face, effect and correction layers as separate lossless sources;
- compare before/after images and adjacent frames;
- build contact sheets, GIFs and onion skins for review only;
- apply `motion-family` or `identity-locked` sequence consistency profiles; and
- render bounded keyframed 2D composites without flattening the source package.

For provider work, bind individual immutable references by semantic role—canonical identity, direction master, previous/next pose, palette, line, material, layer context—not one provider-made sheet. Keep the exact reference set and output together in the workspace. A generated animation frame is compared to its neighbours before another frame is requested; frames are not designed independently.

Video extraction, AI segmentation and AI image edits remain unapproved reference or working material. They must pass the same alpha mastering, hostile-background proofs, continuity review and creative decision as any other candidate.

## Create a workspace

```json
{
  "schema": "evavo.persistent-artist-workspace-create-request.v1",
  "workspaceId": "chess-lord-human-king-v1",
  "projectId": "chess-lord",
  "directoryName": "chess-lord-human-king-v1",
  "title": "Chess Lord Human King production workspace",
  "purpose": "Create, repair, review and master the canonical Human King sprite family.",
  "createdBy": "chatgpt",
  "tags": ["chess-lord", "human-king", "sprite-family"],
  "storage": {
    "enabled": true,
    "vaultId": "art",
    "logicalPrefix": "Projects/ChessLord/Art/HumanKing",
    "tags": ["game-art"]
  }
}
```

Compile and run:

```bash
node scripts/persistent-artist-workspace.mjs compile-create \
  --parent-root C:/EVAVO/ArtWorkspaces \
  --request C:/EVAVO/Requests/human-king-workspace.json \
  --output C:/EVAVO/Requests/human-king-workspace.plan.json

node scripts/persistent-artist-workspace.mjs run-create \
  --plan C:/EVAVO/Requests/human-king-workspace.plan.json
```

## Save an exact working version

```json
{
  "schema": "evavo.persistent-artist-workspace-snapshot-request.v1",
  "workspaceId": "chess-lord-human-king-v1",
  "assetId": "human-king-idle-south",
  "versionId": "v004-clean-alpha-and-sword-side",
  "sourcePath": "working/human-king/idle/south/0000.png",
  "expectedSha256": "<exact lowercase sha256>",
  "role": "sprite-frame-working-version",
  "note": "Cleaned alpha fringe and restored the canonical sword side without changing identity.",
  "createdBy": "claude",
  "tags": ["idle", "south", "alpha-clean", "identity-locked"]
}
```

```bash
node scripts/persistent-artist-workspace.mjs compile-snapshot \
  --workspace-root C:/EVAVO/ArtWorkspaces/chess-lord-human-king-v1 \
  --request C:/EVAVO/Requests/human-king-v004.json \
  --output C:/EVAVO/Requests/human-king-v004.plan.json

node scripts/persistent-artist-workspace.mjs run-snapshot \
  --workspace-root C:/EVAVO/ArtWorkspaces/chess-lord-human-king-v1 \
  --plan C:/EVAVO/Requests/human-king-v004.plan.json
```

## EVAVO Storage handoff

A handoff can include exact originals, working versions, append-only versions, masks, review evidence, masters and exports. The generated document uses `evavo.storage-art-ingest-request.v1` and records every file’s exact path, SHA-256, bytes, media type, logical path and workspace provenance.

```json
{
  "schema": "evavo.persistent-artist-workspace-storage-handoff-request.v1",
  "workspaceId": "chess-lord-human-king-v1",
  "handoffId": "human-king-approved-master-v1",
  "vaultId": "art",
  "logicalPrefix": "Projects/ChessLord/Art/HumanKing",
  "tags": ["approved-for-storage", "sprite-master"],
  "items": [
    {
      "assetId": "human-king-idle-south-v004",
      "path": "versions/human-king-idle-south/v004-clean-alpha-and-sword-side/0000.png",
      "logicalPath": "idle/south/0000.png",
      "expectedSha256": "<exact lowercase sha256>",
      "title": "Human King idle south frame 0000",
      "role": "sprite-frame-master-source"
    }
  ]
}
```

```bash
node scripts/persistent-artist-workspace.mjs storage-handoff \
  --workspace-root C:/EVAVO/ArtWorkspaces/chess-lord-human-king-v1 \
  --request C:/EVAVO/Requests/human-king-storage-handoff.json \
  --output C:/EVAVO/ArtWorkspaces/chess-lord-human-king-v1/manifests/storage-handoffs/human-king-approved-master-v1.json
```

The handoff does not perform the Storage write. `storageWrite` remains false until the separately authorised EVAVO Storage boundary reads and revalidates the request.

## Relationship to mastering, motion and review

The persistent workspace is the durable filesystem and versioning layer. The deterministic sandbox supplies raster operations, exact region copy/paste, masks, compositing, video reference-frame extraction, sprite sheets, atlases, image mastering and keyframed motion. The offline Review Studio supplies technical and creative review evidence.

A technical pass is not creative approval. Passing dimensions, transparency, palette or loop-continuity rules does not prove that a face, pose, costume, historical detail, material, silhouette or animation is creatively correct.

## Safety and authority boundary

The persistent workspace tooling:

- uses fixed repository-owned entrypoints rather than arbitrary shell;
- confines paths to configured non-symbolic roots;
- rejects traversal, symbolic-link and changed-source attacks;
- creates manifests, versions and receipts atomically;
- never overwrites an existing version;
- does not delete immutable originals;
- does not call an image provider;
- does not approve or promote a candidate;
- does not mutate a target repository;
- does not commit, push or force-push Git;
- does not deploy or publish;
- does not perform the EVAVO Storage write.

Those authorities remain separate and explicit.

## Mandatory validation

```bash
pnpm run project-art:workspace:persistent:check
```

The permanent regression proves create-only workspaces, immutable manifests, append-only versions, exact source revalidation, exact EVAVO Storage handoffs, duplicate rejection, tampered-plan rejection, path confinement and symbolic-link rejection.
