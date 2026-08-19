# Game Art Automation Fabric

`config/artist-workspace-agent-suite.v7.json` is the canonical game-art agent suite.

It connects the existing persistent Project Art system to the deterministic pixel/game-art workstation without creating a competing orchestration stack.

## End-to-end path

```text
chat / Library / generated image / Video Studio sequence
  -> provider materialisation on the Windows host
  -> Local Storage content-addressed source retention
  -> persistent Art Studio workspace ingest + snapshot
  -> pixel-art technical audit
  -> generated-sheet segmentation when applicable
  -> deterministic raster editing / masking / alpha cleanup / palette work
  -> Project Art visual review and bounded loop-closure repair
  -> nearest-neighbour animation preview and frame-strip review
  -> explicit reviewed-frame selection
  -> deterministic sprite atlas + manifest + Godot SpriteFrames
  -> native 1x and runtime animation review
  -> exact-hash human approval
  -> source/editable master to EVAVO Storage / BeeStation
  -> compact runtime derivatives to the target repository
  -> repository validation
  -> Development Studio governed fast-forward publication
```

## Photoshop-style deterministic workstation

`tools/image_workstation.py` covers exact-plan, create-only raster operations used repeatedly in game production:

- crop and alpha trim;
- nearest-neighbour or resampled resize;
- integer scaling;
- horizontal/vertical flip and 90-degree rotation;
- canvas placement;
- binary alpha thresholding;
- alpha-mask application;
- compositing;
- colour erase/replace;
- levels, brightness, contrast and saturation;
- sharpening;
- palette quantisation;
- pixelation;
- outline generation.

Advanced masking, retouching, perspective/affine work, provider redraws and inpainting remain in the deeper Project Art mastering/provider surfaces rather than being duplicated here.

Every effecting raster run requires the exact plan SHA-256. The plan itself binds the source hash and output path, and output/receipt creation is create-only.

## Sprite workstation

The game-art worker stack deliberately separates generated-sheet discovery from real sprite production:

1. `game-art-sheet-segment` cuts a generated/reference sheet into candidate PNGs by reviewed rectangles or bounded alpha components.
2. A reviewer chooses and orders useful frames; automatic component ordering never becomes animation authority.
3. `game-art-animation-preview` renders review-only nearest-neighbour GIF and frame-strip evidence.
4. Weak frames are repaired/regenerated through Project Art or the deterministic raster workstation.
5. `game-art-sprite-build` packs only reviewed frames into a deterministic PNG atlas, manifest and Godot `SpriteFrames` resource.

A generated contact sheet is never treated as a production atlas merely because it visually resembles one.

## After Effects-style motion collaboration

Video Studio owns source-video identity, temporal extraction and deterministic timeline compositing. Its compositor accepts exact plan hashes and exact source hashes and binds the expected output path separately from the plan before FFmpeg executes.

Video Studio does not become the image-mastering or game-publication authority. Ordered frames return to Art Studio for cutout, cleanup, palette/pixel treatment, sprite packaging and human approval.

## Closed-loop repair

Project Art's existing loop-closure system remains the canonical repair orchestrator. It owns bounded iteration, immutable frame hashes, provider/deterministic repair decisions and fail-closed progression.

The new raster, segmentation, animation-preview and sprite-build stages are execution capabilities beneath that loop rather than a second automation controller.

The expected repair loop is:

```text
candidate
 -> technical audit
 -> visual/animation review
 -> accept | reject | repair
 -> provider or deterministic repair
 -> re-audit
 -> re-preview
 -> repeat within bounded budget
 -> named-human approval only when final evidence is good enough
```

## Host roots

The Local Storage 0.48+ workstation boundary recognises:

- `C:\GitRepos`;
- `%USERPROFILE%\Downloads`;
- the resolved BeeStation root;
- approved discovered external roots.

`C:\Downloads` is retired and must not be revived by Art Studio tooling.

## Authority

The suite is deliberately least-authority:

- technical pass does not equal creative approval;
- workstation write permission does not grant Git publication;
- Video Studio render permission does not grant game-art approval;
- Local Compute receipt does not grant publication;
- Storage retention does not grant runtime admission;
- no creative worker has force-push authority;
- Development Studio remains the Git publication authority.

Run the dependency-free suite contract check with:

```powershell
node .\scripts\check-game-art-automation-fabric.mjs
```

The Linux/Windows `Game Art Workstations` workflow runs this check alongside raster, segmentation, animation-preview, sprite and MCP tests.
