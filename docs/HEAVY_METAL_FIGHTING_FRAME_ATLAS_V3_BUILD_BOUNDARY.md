# HEAVY METAL FIGHTING — Frame atlas-v3 build boundary

Status: governed fixed-grid workspace build and independent verification  
Input: one admitted `evavo.heavy-metal-fighting-frame-atlas-v3-plan.v1`  
Output: one create-only workspace directory containing image, manifest and receipt  
Target-repository mutation: prohibited

## Purpose

The atlas compiler binds all 224 delivery-ready Frame body masters into one deterministic plan. This boundary turns that plan into the exact `production_master_v3` image while preserving the compiler's trust model.

```text
closed atlas plan
      ↓
224 stable exact-byte source reads
      ↓
fixed 16 × 16 composition
      ↓
32 transparent reserve cells
      ↓
private staged image + manifest + receipt
      ↓
independent byte and pixel verification
      ↓
atomic no-replace workspace publication
      ↓
second independent verification
```

The operation remains inside Artist Workspace. It does not copy the atlas into `steel-dominion`, activate the game, commit, push, deploy or publish.

## Closed plan admission

The builder re-admits the complete plan rather than trusting `planSha256` alone. It requires exact fields for the plan, production-master geometry, human style-proof approval, 224 source descriptors, 26 batch evidence records, output names, game target and authority map.

Every source must bind:

- a contiguous slot from 0 through 223;
- exact row, column and pixel coordinates;
- one unit ID and batch ID;
- one work-order SHA-256;
- one delivery-ready receipt-chain head;
- one canonical workspace-relative master path;
- one exact absolute source path equal to `workspaceRoot/masterRelativePath`;
- one exact byte count and SHA-256.

Batch evidence must cover all 224 units exactly once and agree with every source's batch and receipt head. Unknown fields and correctly rehashed authority escalation fail closed.

## Stable source bytes

Each source is opened with non-following semantics and read once. File identity, size and modification time must remain stable; symbolic path components and multi-link source files are rejected. The exact bytes that are hashed are the bytes decoded by Pillow and composited into the atlas.

The builder performs no trim, resize, resampling, rotation, extrusion, padding or slot reorder.

## Create-only atomic publication

The builder creates a private mode-`0700` stage directory beneath the governed Frame export parent. Image, manifest and receipt are exclusive mode-`0600` files and are synchronised before publication.

Publication uses a platform-native atomic no-replace directory primitive:

- Linux: `renameat2(..., RENAME_NOREPLACE)`;
- Windows: `MoveFileExW` without replace flags;
- supported Darwin systems: `renamex_np(..., RENAME_EXCL)`.

A racing or existing destination is preserved. Platforms without an atomic no-replace primitive fail closed.

## Independent verification

Before and after publication, the verifier re-admits the plan, manifest and receipt and proves:

- exact image, manifest and receipt names;
- exact file hashes and byte counts;
- `2560 × 2560` RGBA output;
- fully transparent slots 224–255;
- all 224 manifest entries match the plan;
- every authored atlas cell is pixel-identical to its admitted source;
- the style-proof and game-target lineage remain unchanged;
- game activation, target-repository mutation, Git mutation and publication remain false.

## Commands

Build and verify:

```powershell
python tools\build_heavy_metal_fighting_frame_atlas_v3.py `
  --plan C:\ArtistWorkspace\heavy-metal-fighting\manifests\delivery\bastion-atlas-v3-plan.json `
  --output-root C:\ArtistWorkspace\heavy-metal-fighting\exports\runtime\frames\bastion\atlas-v3-001
```

Verify an existing output independently:

```powershell
python scripts\heavy-metal-fighting\verify_frame_atlas_v3_build.py `
  --plan C:\ArtistWorkspace\heavy-metal-fighting\manifests\delivery\bastion-atlas-v3-plan.json `
  --output-root C:\ArtistWorkspace\heavy-metal-fighting\exports\runtime\frames\bastion\atlas-v3-001
```

`--skip-source-pixel-recheck` is available only for a faster metadata and output-byte audit. It does not grant delivery or activation authority.

## Authority boundary

This layer may read exact approved masters, compose one fixed-grid atlas, write one new workspace output directory and independently verify it.

It may not change source pixels, approve art, promote candidates, write `steel-dominion`, activate a runtime, commit or push Git, force-push, deploy or publish.
