# HEAVY METAL FIGHTING — Frame atlas v3 delivery

Status: deterministic export/handoff contract  
Source: named-human-approved Frame body masters  
Target game: `EVAVO-STUDIO/steel-dominion`  
Art Studio target-repository write authority: **none**

## Purpose

HEAVY METAL FIGHTING produces final Frame animation as 224 separately governed body cels per Frame. The game-side production-master-v3 contract expects those cels in one exact fixed atlas:

```text
160 x 160 native cel
640 x 640 authoring cel
pivot 80,152
16 x 16 atlas grid
2560 x 2560 final image
224 authored body slots
32 transparent reserve slots
slots 224-255 reserved
nearest-neighbour runtime filtering
```

The atlas delivery layer closes the gap between those two systems without giving Art Studio permission to write into the game repository.

## Three separate authorities

```text
1. COMPILE
   validate style proof + receipt chains + source paths + hashes
   produce immutable atlas plan

2. BUILD
   read the exact 224 approved masters
   place each cel into its exact slot
   preserve slots 224-255 as transparent
   create an atomic workspace export + manifest + receipt

3. GAME DELIVERY / ACTIVATION
   separate authorization
   separate steel-dominion mutation
   separate focused Godot validation
   separate runtime-cutover validation
```

Compile and build never imply game activation.

## Source masters

The production registry is the naming authority. Each Frame owns exactly 224 body masters under:

```text
masters/frames/<frame>/sprites/
```

Example:

```text
masters/frames/bastion/sprites/bastion-<bank>-c000.png
...
masters/frames/bastion/sprites/bastion-<bank>-c223.png
```

The atlas compiler does not discover arbitrary PNG files. It derives all 224 source paths from the governed registry and binds each source to:

- exact body slot;
- exact batch;
- exact unit ID;
- work-order SHA-256;
- delivery-ready receipt-chain head;
- current master file SHA-256 and byte length.

## Preconditions

A final Frame atlas plan cannot compile unless:

1. the complete four-phase style proof reports `complete`;
2. the final `style-proof-approved` evidence exists and identifies a human actor;
3. all 26 body-animation batches for that Frame report `delivery-ready`;
4. all 224 master files exist beneath the canonical persistent Artist Workspace master root;
5. every source file is a regular non-symlink file and remains inside the approved root;
6. the current file bytes are hashed into the immutable plan.

This means a loose collection of images in `masters/` is not enough to become a runtime atlas.

## Compile

```powershell
node C:\GitRepos\evavo-art-studio\scripts\heavy-metal-fighting-frame-atlas-v3.mjs compile bastion `
  --workspace-root C:\ArtistWorkspace\heavy-metal-fighting `
  --frame-receipts-json C:\ArtistWorkspace\heavy-metal-fighting\manifests\receipts\bastion-frame-receipts.json `
  --style-proof-approvals-json C:\ArtistWorkspace\heavy-metal-fighting\manifests\receipts\style-proof-approvals.json `
  --style-proof-receipts-json C:\ArtistWorkspace\heavy-metal-fighting\manifests\receipts\style-proof-receipts.json `
  --output C:\ArtistWorkspace\heavy-metal-fighting\manifests\delivery\bastion-atlas-v3-plan.json
```

Inspect the deterministic layout without requiring production files:

```powershell
node C:\GitRepos\evavo-art-studio\scripts\heavy-metal-fighting-frame-atlas-v3.mjs layout bastion
```

Verify all four Frame layouts:

```powershell
node C:\GitRepos\evavo-art-studio\scripts\heavy-metal-fighting-frame-atlas-v3.mjs verify
```

## Build

The builder requires Pillow, which is already part of Art Studio's governed image-processing environment.

The output root must be a **new direct child** of:

```text
<workspace>/exports/runtime/frames/<frame>/
```

Example:

```powershell
python C:\GitRepos\evavo-art-studio\tools\build_heavy_metal_fighting_frame_atlas_v3.py `
  --plan C:\ArtistWorkspace\heavy-metal-fighting\manifests\delivery\bastion-atlas-v3-plan.json `
  --output-root C:\ArtistWorkspace\heavy-metal-fighting\exports\runtime\frames\bastion\atlas-v3-001
```

The builder is create-only. It refuses to overwrite an existing delivery directory.

## Image rules enforced by the builder

Every source must be:

```text
exactly 160 x 160
RGBA
hash-identical to the compiled plan
transparent at all four cell corners
```

The builder performs **no**:

```text
trim
rotation
extrusion
padding
rescale
resampling
slot reorder
```

Each cel is alpha-composited directly at:

```text
x = (slot % 16) * 160
y = floor(slot / 16) * 160
```

The atlas begins fully transparent, and the builder verifies slots 224 through 255 are still completely transparent both before and after PNG encoding.

## Output

For Bastion:

```text
bastion.png
bastion.atlas-v3.json
bastion.atlas-v3.receipt.json
```

The manifest binds all 224 regions back to their source hashes, work-order hashes and receipt evidence.

The build receipt records:

- plan SHA-256;
- style-proof execution SHA-256;
- final human style-proof approval evidence;
- image and manifest hashes;
- source count 224;
- reserved count 32;
- target game path;
- explicit `gameActivationReady: false`.

## Game target

Canonical runtime delivery paths are:

```text
res://assets/fighters/final-v3/bastion.png
res://assets/fighters/final-v3/viper.png
res://assets/fighters/final-v3/citadel.png
res://assets/fighters/final-v3/mirage.png
```

Art Studio records those paths but cannot write them.

A separate delivery process must prove:

```text
focused-godot-atlas-v3-validation
runtime-cutover-validation
explicit-game-repository-delivery-authorization
```

before the game-side asset is activated.

## MCP

The read-only production MCP exposes:

```text
evavo_hmf_production_frame_atlas_v3
```

Input:

```json
{"frameId":"bastion"}
```

It returns the exact 224-slot layout, all 26 body batch IDs, source-master relative paths, reserve slots and target game path. It does not read the image bytes and cannot build or promote the atlas.

## Why we do not use the general free-packing atlas builder here

Art Studio already has an excellent general sprite-atlas system for trim/padding/extrusion/power-of-two packing. That is not the right contract for HEAVY METAL FIGHTING's final body atlas.

The game expects **semantic fixed positions**. Slot 117 must remain slot 117 even if a neighbouring image is smaller. A fixed-grid derivative therefore gets its own narrow builder rather than weakening the general packer or asking a provider to produce a contact sheet.

## Authority boundary

This layer may:

```text
read approved masters
read receipts and approval evidence
compile a plan
write a new workspace export directory
write an atlas manifest and receipt
```

It may not:

```text
generate candidates
approve art
promote candidates to masters
rewrite source masters
write steel-dominion
commit
push
deploy
publish
mark game activation ready
```
