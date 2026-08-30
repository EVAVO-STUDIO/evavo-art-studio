# Universal project-art intelligence, sandbox editing, and reference-derived generation

The project-art workbench turns the existing governed Art Studio components into a practical project-neutral image operating layer.

It is designed for game repositories, web applications, book and print projects, external `RAW_ART` folders, source-art archives, sprite folders, UI libraries, and mixed-engine repositories. It can inspect what a project consumes, bind exact source bytes, perform deterministic image changes in a disposable workspace, build or split sprite sheets, review frame sequences, and compile exact provider requests for matching images or animation frames.

The workbench does not weaken the existing provider, approval, promotion, repository-integration, deployment, or publication boundaries.

## Permanent commands

```text
pnpm run project-art:intelligence
pnpm run project-art:sandbox:compile
pnpm run project-art:sandbox:run
pnpm run project-art:reference:compile
pnpm run project-art:reference:stage
pnpm run project-art:check
```

The commands are intentionally separate:

1. Discovery and planning are read-only.
2. Sandbox compilation binds source bytes but does not edit anything.
3. Sandbox execution writes a new atomic output root and never overwrites a source.
4. Reference-derived compilation does not call a provider.
5. Reference staging explicitly writes immutable source artifacts but does not submit work.
6. Provider selection, admission, short-lived execution authorisation, review, mastering, independent approval, promotion, integration, and publication remain later governed boundaries.

## 1. Project intelligence

Compile an intelligence document for a repository and any number of additional art roots:

```powershell
Set-Location C:\GitRepos\evavo-art-studio

pnpm run project-art:intelligence -- `
  --project-root C:\GitRepos\battle-chess `
  --art-root raw=C:\Art\battle-chess\RAW_ART `
  --art-root archive=D:\Legacy-Art\battle-chess `
  --project-id battle-chess `
  --output C:\EVAVO\staging\battle-chess-project-art.json
```

Optional arguments:

```text
--config <evavo.project-art-config.v1 JSON>
--generated-at <canonical UTC timestamp>
--maximum-files <positive integer>
--maximum-text-bytes <positive integer>
--maximum-hash-bytes <positive integer>
```

The compiler:

- uses Git-visible, non-ignored files when a project checkout exposes Git;
- otherwise uses a bounded filesystem scan;
- scans additional roots independently;
- rejects symbolic-link traversal;
- excludes dependency, cache, build, temporary, and generated engine directories;
- streams file hashes;
- applies explicit file, text, and hash limits;
- records skipped or metadata-only analysis rather than guessing;
- writes the result create-only;
- produces a deterministic self-hash.

### Engine and code evidence

The scanner records more than folder names.

For Godot it detects `project.godot`, scenes, resources, scripts, `res://` paths, `load(...)`, `preload(...)`, and external resources.

For Unity it records project surfaces, scenes, prefabs, assets, scripts, `.meta` GUID ownership, and GUID consumers. A `.meta` file is engine metadata, not artwork.

For web and JavaScript projects it detects static and dynamic string references, markup sources, CSS `url(...)`, public assets, and Phaser sprite-sheet declarations. A sheet whose dimensions conflict with its declared `frameWidth` or `frameHeight` becomes a repair item.

For Unreal it resolves explicit `/Game/...` textual object paths to corresponding `Content` candidates. Binary-only relationships remain explicit `engine-index-required` blockers instead of being guessed from file names.

A repository may expose several surfaces at once. A Godot game, Next.js player, Phaser tool, and supporting scripts can all appear in one intelligence document.

### Inventory and roles

The scanner separates:

```text
production-image
editable-source-art
engine-metadata
engine-binary-asset
text-or-code
other
```

Supported header inspection includes PNG, APNG, JPEG, WebP, GIF, BMP, TGA, SVG, DDS, KTX, and KTX2 where the format exposes bounded header metadata.

Broad roles include:

```text
character
animation
sprite-sheet
tileset
environment
vfx
ui-icon
ui-panel
item
map
logo
texture
normal-map
mask
unclassified-art
```

Project-specific role families are derived from the actual path and role. Optional config rules can clarify unusual layouts without overriding source identity or granting execution authority.

### Work decisions

The output uses:

```text
keep
inspect
reference-only
repair
recreate
create
```

Examples:

- a referenced compatible runtime image becomes `keep`;
- an editable PSD, Krita file, Aseprite file, or similar source becomes `reference-only`;
- an unreferenced image becomes `inspect`;
- a referenced placeholder becomes `recreate`;
- an invalid image header becomes `repair`;
- an incompatible Phaser sheet becomes `repair`;
- a missing code reference becomes `create`;
- an unresolved Unity or Unreal binary relationship retains an explicit blocker.

The embedded `evavo.project-art-queue-seed.v1` is not a runtime submission. Actionable entries require explicit selection, fresh durable admission, and fresh short-lived execution authorisation.

## 2. Atomic sandbox image work

A sandbox request uses:

```text
evavo.project-art-sandbox-request.v1
```

Compile it:

```powershell
pnpm run project-art:sandbox:compile -- `
  --workspace-root C:\GitRepos\battle-chess `
  --request C:\EVAVO\staging\knight-attack-sandbox-request.json `
  --output C:\GitRepos\battle-chess\.evavo\knight-attack-sandbox-plan.json
```

Execute it explicitly:

```powershell
pnpm run project-art:sandbox:run -- `
  --workspace-root C:\GitRepos\battle-chess `
  --plan .evavo\knight-attack-sandbox-plan.json `
  --output-root .evavo\outputs\knight-attack-v1
```

The output root must not exist. Execution occurs in a sibling staging directory. The completed tree, including its receipt, is moved into place only after every task finishes and every source hash is revalidated. A failed run removes its staging tree.

### Sandbox request example

```json
{
  "schema": "evavo.project-art-sandbox-request.v1",
  "sandboxId": "battle-chess-white-knight-attack-v3",
  "projectId": "battle-chess",
  "purpose": "Clean retained frames, rebuild the sheet, and publish sequence evidence.",
  "tasks": [
    {
      "id": "clean-frame-00",
      "kind": "image",
      "source": "RAW_ART/white-knight/attack/frame-00.png",
      "targetPath": "clean/frame-00.png",
      "operations": [
        {
          "op": "connected-matte-to-alpha",
          "matteColour": "#ffffff",
          "distance": 18
        },
        {
          "op": "edge-decontaminate",
          "matteColour": "#ffffff"
        },
        {
          "op": "trim-alpha",
          "margin": 4
        },
        {
          "op": "pad-canvas",
          "width": 512,
          "height": 512,
          "anchor": "bottom-centre"
        },
        {
          "op": "hidden-rgb-rebuild"
        },
        {
          "op": "optimize"
        }
      ],
      "expected": {
        "width": 512,
        "height": 512,
        "meaningfulAlpha": true
      }
    },
    {
      "id": "assemble-attack-sheet",
      "kind": "assemble-sheet",
      "sources": [
        {
          "taskId": "clean-frame-00"
        }
      ],
      "targetPath": "sheets/white-knight-attack.png",
      "columns": 8,
      "cell": {
        "width": 512,
        "height": 512,
        "fit": "strict",
        "sampling": "nearest"
      }
    }
  ],
  "authority": {
    "providerExecution": false,
    "candidateApproval": false,
    "candidatePromotion": false,
    "targetRepositoryMutation": false,
    "publication": false
  }
}
```

A source can be a workspace-relative path or an earlier task output:

```json
{
  "taskId": "slice-attack-sheet",
  "outputIndex": 3
}
```

Forward references and cycles fail closed.

### Deterministic operations

The governed operation registry currently exposes:

```text
inspect
trim-alpha
crop
pad-canvas
resize
pixel-resize
flip-horizontal
flip-vertical
rotate-90
rotate-180
rotate-270
translate
colour-replace
brightness
contrast
saturation
sharpness
gaussian-blur
unsharp-mask
alpha-erode
alpha-dilate
alpha-threshold
connected-matte-to-alpha
edge-decontaminate
hidden-rgb-rebuild
palette-normalize
quantize
autocontrast
levels
outline
rotate
affine-transform
perspective-transform
grayscale
invert
posterize
threshold
gamma
hue-shift
curves
channel-mixer
selective-channel-mixer
box-blur
median-filter
motion-blur
emboss
find-edges
edge-enhance
alpha-feather
defringe
drop-shadow
outer-glow
rim-light
normal-map-from-height
convert
optimize
```

Important behavior:

- `resize` supports contained, covered, and filled canvases with explicit sampling.
- `pixel-resize` always uses nearest-neighbour sampling and can require integer scale factors.
- `translate` repositions pixels inside the existing canvas without mutating the source.
- `colour-replace` performs bounded RGB-distance replacement while preserving source alpha by default.
- `selective-channel-mixer` applies an RGB matrix only inside explicit HSV bounds, including wrapped hue ranges, while preserving alpha and every non-selected pixel.
- `brightness`, `contrast`, `saturation`, and `sharpness` adjust RGB while retaining the original alpha channel.
- `gaussian-blur` and `unsharp-mask` provide bounded local filtering without changing alpha.
- `alpha-erode` and `alpha-dilate` support deterministic matte tightening/expansion for cleanup and mask preparation.
- `connected-matte-to-alpha` removes only matching matte connected to the image border.
- `edge-decontaminate` removes a named matte colour from partially transparent edge pixels.
- `hidden-rgb-rebuild` propagates retained edge colour into transparent pixels to reduce sampling fringes in engines and atlases.
- `palette-normalize` supports grayscale, monochrome, and explicit bounded palettes.
- `outline` derives an outline from alpha without repainting the source file.
- `rim-light` applies a directional inner highlight while restoring the exact source alpha silhouette.
- `normal-map-from-height` creates a bounded draft 2D normal map from luminance or alpha, with strength, blur and channel-direction controls.
- JPEG output is flattened and cannot be used as a transparency master.

Every operation records before and after decoded-pixel identities in the execution receipt.

## 3. Sprite-sheet and animation work

The sandbox has nine task kinds:

```text
image
video-frame-extract
slice-sheet
assemble-sheet
sequence-review
image-composite
image-compare
image-master
motion-sequence
```

### Extract exact video reference frames

```json
{
  "id": "extract-turnaround",
  "kind": "video-frame-extract",
  "source": "sources/reference/turnaround.mov",
  "targetDirectory": "scratch/turnaround-frames",
  "fileNamePattern": "frame-{index}.png",
  "timestampsMs": [0, 500, 1000, 1500],
  "expectedWidth": 1920,
  "expectedHeight": 1080,
  "preserveSourceAlpha": true
}
```

The compiler binds the exact video bytes and declared dimensions. Runtime selects only the first video stream through a fixed, no-shell FFmpeg/ffprobe boundary; disables autorotation; strips audio, subtitle and data streams; validates every decoded PNG; and records source, probe, requested timestamps, discrete-frame selection semantics and exact media-tool hashes in a self-hashed manifest. Frames are reference evidence only. They do not receive transparency or delivery admission automatically.

### Slice a sheet

```json
{
  "id": "slice-attack",
  "kind": "slice-sheet",
  "source": "art/white-knight-attack.png",
  "targetDirectory": "frames/white-knight-attack",
  "frameWidth": 512,
  "frameHeight": 512,
  "margin": 0,
  "spacing": 0,
  "count": 12,
  "startIndex": 0,
  "fileNamePattern": "attack-{index}.png",
  "rejectBlankFrames": true
}
```

The task publishes exact frame rectangles, hashes, dimensions, alpha statistics, alpha bounds, and decoded-pixel hashes.

### Assemble a sheet

```json
{
  "id": "assemble-attack",
  "kind": "assemble-sheet",
  "sources": [
    {
      "taskId": "slice-attack",
      "outputIndex": 0
    },
    {
      "taskId": "slice-attack",
      "outputIndex": 1
    }
  ],
  "targetPath": "sheets/white-knight-attack-v2.png",
  "columns": 6,
  "cell": {
    "width": 512,
    "height": 512,
    "fit": "strict",
    "sampling": "nearest"
  },
  "padding": 0,
  "background": "#00000000"
}
```

Strict cells prevent accidental frame resampling. `contain` and `cover` remain available when an explicit normalization step is intended.

`maximumDecodedPixels` is also the active decoded-image working set boundary for multi-image tasks, while preserving the existing per-image decoded-image boundary. Sheet assembly streams one source frame at a time and proves that the output sheet, current source and any resized cell fit together inside that budget before allocating the sheet. Sequence review bounds the complete decoded frame set plus transition, contact-sheet, animation or onion-skin preview overhead. Image comparison bounds both sources plus its difference or overlay surface. These checks run against exact external-source dimensions during compilation when possible and are independently repeated from image headers at runtime, including for task-output sources and correctly rehashed plans.

The registry also establishes an aggregate source-byte boundary and create-only output-file and output-byte budgets. Compilation sums exact external-source sizes before hashing the next source and rejects a plan whose maximum file fan-out exceeds `maximumOutputFiles`; omitted `slice-sheet.count` values are derived from the exact source grid when possible and otherwise receive a conservative upper bound. Runtime independently checks task and source counts, preflights exact source sizes before hashing, enforces a per-output byte ceiling, and tracks the complete output tree against `maximumTotalOutputBytes`, including the final receipt. A failed byte or file-count check removes the staging tree and publishes nothing.

The production registry currently permits at most 2,000 tasks, 10,000 exact external sources, 2 GiB per source, 16 GiB of aggregate external source bytes, 20,000 output files, 2 GiB per output file, and 16 GiB across the complete output tree. These are also code-owned runtime ceilings: a correctly rehashed plan cannot raise them above production policy. Runtime must reproduce the compiler-bound source-byte total and planned output count exactly before execution. Explicit slice counts are strongly recommended because they make both review scope and file-system impact exact before execution.

### Compare two exact images

`image-compare` is the deterministic similarity gate for before/after edits and provider-generated matching assets or frames. It binds exactly two source images, records decoded-pixel identities, changed-pixel fraction, mean/max channel delta and alpha-change fraction, and can produce difference and 50/50 overlay previews. Threshold failures block the task but never imply creative approval.

### Multi-layer compositing

`image-composite` builds a new candidate from an ordered set of exact source images without mutating any source. Each layer can declare position, optional resize, nearest, bicubic or Lanczos sampling, opacity, a blend mode, and an optional alpha/luminance mask sourced from another exact sandbox input. `sourceRect` performs an exact crop before resizing and placement; `maskSourceRect` independently selects the mask region. Together they provide deterministic cut/copy/paste and masked paste without making a temporary flattened source. Supported blend modes are `normal`, `multiply`, `screen`, `add`, `subtract`, `darken`, and `lighten`.

```json
{
  "sourceIndex": 2,
  "sourceRect": { "x": 48, "y": 32, "width": 96, "height": 128 },
  "maskSourceIndex": 3,
  "maskSourceRect": { "x": 48, "y": 32, "width": 96, "height": 128 },
  "x": 220,
  "y": 140,
  "width": 144,
  "height": 192,
  "sampling": "bicubic",
  "opacity": 1,
  "blendMode": "normal"
}
```

The compiler rejects any composite canvas or explicitly resized layer whose area exceeds the registry's `maximumDecodedPixels` boundary. It also accounts for the active canvas, source, prepared layer, optional mask and blend-mode intermediates as one bounded working set. The Python runtime independently repeats both checks before allocating the canvas, resize target or blend surfaces, closes superseded Pillow images as each layer completes, and therefore fails closed when a hash-valid plan bypasses or tampers with compiler output.

This is intended for UI assembly, VFX overlays, sprite/accessory layers, controlled matte repairs, mockups, and other deterministic composites. Compositing remains a sandbox effect only: it does not approve the visual result, promote it, or write it into a target repository.

```json
{
  "id": "compare-frame",
  "kind": "image-compare",
  "sources": [
    { "taskId": "slice-attack", "outputIndex": 0 },
    { "taskId": "slice-attack", "outputIndex": 1 }
  ],
  "targetDirectory": "review/frame-comparison",
  "requireSameDimensions": true,
  "thresholds": {
    "maximumChangedFraction": 0.45,
    "maximumMeanChannelDelta": 80,
    "maximumAlphaChangedFraction": 0.2
  },
  "preview": { "difference": true, "overlay": true }
}
```

### Review a sequence

```json
{
  "id": "review-attack",
  "kind": "sequence-review",
  "sources": [
    {
      "taskId": "slice-attack",
      "outputIndex": 0
    },
    {
      "taskId": "slice-attack",
      "outputIndex": 1
    }
  ],
  "targetDirectory": "review/white-knight-attack",
  "expectedWidth": 512,
  "expectedHeight": 512,
  "requireAlpha": true,
  "rejectBlankFrames": true,
  "rejectIdenticalAdjacentFrames": true,
  "consistencyProfile": "identity-locked",
  "thresholds": {
    "minimumChangedFraction": 0.001,
    "maximumChangedFraction": 0.45,
    "maximumCentroidShiftPixels": 64,
    "maximumAlphaBoundsWidthChangeFraction": 0.25,
    "maximumAlphaBoundsHeightChangeFraction": 0.25,
    "maximumVisibleMeanColourDistance": 32,
    "maximumAlphaMassChangeFraction": 0.4,
    "minimumCentroidAlignedAlphaIoU": 0.4
  },
  "preview": {
    "contactSheet": true,
    "animatedGif": true,
    "onionSkins": true,
    "frameDurationMs": 83,
    "interpolation": "crossfade",
    "easing": "smoothstep",
    "presentationFps": 30,
    "loopTransition": true,
    "columns": 6
  }
}
```

The review task publishes:

- an exact sequence manifest;
- per-frame dimensions, alpha use, alpha bounds, centroid, and decoded-pixel hash;
- adjacent changed-pixel fractions;
- alpha-centroid movement;
- alpha-bounds size drift and alpha-mass drift;
- visible mean-colour drift;
- centroid-aligned alpha intersection-over-union;
- blank, duplicate, dimension, alpha, movement, and excessive-change findings;
- an indexed contact sheet;
- an animation preview GIF, optionally expanded from sparse authored poses into a governed, smooth crossfade presentation;
- optional adjacent onion-skin images.

`preview.interpolation="crossfade"` is a review-only presentation mode for
subtle avatar and UI motion where the production compositor also blends
adjacent authored poses. `presentationFps` controls preview sampling (up to the
GIF-safe 50 fps boundary), `easing` is `linear` or `smoothstep`, and
`loopTransition=true` includes the final-to-first seam. Art Studio records the
source and rendered frame counts, cadence, easing and loop policy in
`sequence-review.json`, caps the expanded preview at 600 frames and includes
the complete decoded working set in the compiled resource budget. The added
frames are preview derivatives only: they never replace, approve or promote
the real-alpha source masters, and loop closure remains a separate blocking
review.

A blocked review remains useful evidence. It does not masquerade as creative approval, gameplay approval, historical approval, or runtime approval.

## 4. Similar images and matching animation frames

Reference-derived work uses:

```text
evavo.reference-derived-image-request.v1
evavo.reference-derived-image-plan.v1
```

Supported formal operations are:

```text
match-family
matching-frame
in-between-frame
controlled-variation
style-locked-recreate
sheet-extension
```

These are mapped onto the existing provider protocol rather than creating a second generator:

| Reference operation | Provider operation | Continuity phase |
| --- | --- | --- |
| `match-family` | `generate` | `independent` |
| `matching-frame` | `generate` | `key-pose` |
| `in-between-frame` | `generate` | `in-between` |
| `controlled-variation` | `edit` | `repair` |
| `style-locked-recreate` | `generate` | `repair` |
| `sheet-extension` | `edit` | `repair` |

### Reference roles

The plan uses the provider contract’s semantic reference roles:

```text
canonical-identity
direction-master
previous-key-pose
next-key-pose
base-image
mask
pose-control
edge-control
depth-control
palette-reference
line-reference
material-reference
layer-context
```

An in-between frame must contain required previous and next key poses. Continuity-locked sprite work must retain canonical identity. Controlled variation and sheet extension require a base image. Masks remain reserved for the existing inpaint operation.

### Compile from local project files

```powershell
pnpm run project-art:reference:compile -- `
  --workspace-root C:\GitRepos\battle-chess `
  --request C:\EVAVO\staging\white-knight-between-frame.json `
  --output C:\EVAVO\staging\white-knight-between-frame-plan.json
```

Local references are bound by path, byte length, SHA-256, media type, dimensions, format, alpha evidence, and animation evidence. They are not silently treated as artifact IDs.

When one or more references are not already immutable Art Studio artifacts, the plan reports:

```text
providerCompilable = false
nextStep = explicit-reference-artifact-ingest
```

### Stage immutable reference artifacts

Build the domain packages first:

```powershell
pnpm run build:domain
```

Then stage only the plan’s exact ingest entries:

```powershell
pnpm run project-art:reference:stage -- `
  --workspace-root C:\GitRepos\battle-chess `
  --plan C:\EVAVO\staging\white-knight-between-frame-plan.json `
  --artifact-root C:\EVAVO\artifacts `
  --output C:\EVAVO\staging\white-knight-between-frame-bindings.json
```

The staging command:

- revalidates the plan self-hash;
- revalidates every local source hash and byte length;
- writes immutable `source` artifacts through `LocalArtifactStore`;
- verifies the stored descriptor and content;
- emits create-only bindings;
- performs no provider request, runtime submission, approval, promotion, reference update, repository mutation, deployment, or publication.

Recompile using those bindings:

```powershell
pnpm run project-art:reference:compile -- `
  --workspace-root C:\GitRepos\battle-chess `
  --request C:\EVAVO\staging\white-knight-between-frame.json `
  --bindings C:\EVAVO\staging\white-knight-between-frame-bindings.json `
  --output C:\EVAVO\staging\white-knight-between-frame-provider-plan.json
```

A complete plan reports:

```text
providerCompilable = true
nextStep = explicit-selection
requiresFreshAdmission = true
requiresFreshExecutionAuthorization = true
independentApprovalPerformed = false
```

Its provider request conforms to the repository-owned provider request input contract and is validated against that implementation in the permanent CI fixture.

For continuity work, bind the exact canonical identity, direction master, previous key pose, next key pose, palette, line and material references that are actually needed; do not substitute a contact sheet for individual full-resolution references. Project Art accepts at most 16 semantic references. The OpenAI adapter sends `input_fidelity=high` explicitly for every edit or reference-conditioned request because the API default is low. Even with high input fidelity, generate or repair one bounded frame/layer at a time and use `sequence-review`, adjacent-frame comparison and loop closure before retaining the result.

## 5. Callable agent workbench

The project-art workspace MCP now exposes the complete path-only workbench to ChatGPT, Claude and other trusted local agents instead of limiting them to intake and atlas creation.

Use the Windows example configuration:

```text
config/mcp.project-art-workspace.windows.example.json
```

The server starts read-only by default. The capability tool remains available without write authority:

```text
evavo_art_workspace_capabilities
```

It reports the exact deterministic operation registry, task kinds, reference-derived operations, configured root count and whether the explicit write gate is enabled. It does not scan a project or create any file.

The complete callable surface is:

```text
evavo_art_compile_project_intelligence
evavo_art_compile_sandbox
evavo_art_run_sandbox
evavo_art_compile_reference_plan
evavo_art_stage_reference_artifacts
evavo_art_compile_intake
evavo_art_run_intake
evavo_art_compile_atlas
evavo_art_run_atlas
```

Enable write-capable tools only on a trusted local deployment:

```text
EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE=true
```

Confine every readable and writable path through:

```text
EVAVO_ART_WORKSPACE_ROOTS=C:\GitRepos;C:\EVAVO\ArtWorkspaces;C:\EVAVO\Incoming Art
```

Every configured root must already exist as a real, non-symbolic directory. The server rejects symbolic-link or junction components beneath those roots before invoking a compiler or executor, and each underlying workbench boundary independently revalidates its exact source and output paths.

On Windows, the optional Python launcher can be selected explicitly:

```text
EVAVO_ART_WORKSPACE_PYTHON=py
```

For video reference extraction, place FFmpeg and ffprobe on `PATH` or pin their executable paths explicitly:

```text
EVAVO_ART_FFMPEG_BIN=C:\Tools\ffmpeg\bin\ffmpeg.exe
EVAVO_ART_FFPROBE_BIN=C:\Tools\ffmpeg\bin\ffprobe.exe
```

The runtime resolves the real executable, verifies its reported tool identity, hashes it before use, records that identity in the extraction manifest and fails if the binary changes during the task.

Each fixed child command is bounded by a ten-minute timeout by default. A trusted deployment may select a value from one second through thirty minutes:

```text
EVAVO_ART_WORKSPACE_MCP_TIMEOUT_MS=600000
```

The MCP carries only paths, bounded arguments, exact identities, summaries and receipt hashes. Image bytes and raw child-process output never travel through MCP. All subprocesses use fixed repository-owned entrypoints with `shell: false`, a bounded output buffer, a bounded timeout and a credential-redacted environment; callers cannot choose a script, inject a command, enable provider execution, approve a candidate, mutate a Git repository, deploy or publish.

Visual review remains on the dedicated path-only Review Studio MCP at `tools/project_art_review_mcp.mjs`. Repository publication remains on the independently gated workspace-writer surface. The capability response identifies both related boundaries so an agent can move through the complete workflow without collapsing their authority.

A practical agent flow is now:

```text
capability inspection
→ project intelligence
→ exact intake where needed
→ optional exact video reference-frame extraction
→ sandbox plan compilation
→ atomic deterministic image or sprite execution
→ reference-derived plan compilation for visual work that cannot be deterministic
→ immutable reference staging
→ separate provider selection, admission and short-lived authorisation
→ Project Art Review Studio
→ independent approval and governed repository writing
```

## 6. Exact authority boundary

### Intelligence

```text
project reading       enabled
image header analysis enabled
planning              enabled
```

### Explicit sandbox execution

```text
new sandbox output root   enabled
atomic sandbox receipt    enabled
```

### Explicit reference staging

```text
immutable source artifact writes enabled
```

The workbench does not authorise:

```text
source overwrite or deletion
provider execution
runtime submission or redrive
candidate approval
candidate promotion
named artifact-reference updates
target or game repository mutation
deployment
publication
force push
```

The generated pixels, edited pixels, sequence evidence, and provider candidates all remain unapproved until the existing independent approval and promotion boundaries are completed.

## 7. Validation

The permanent regression suite covers:

- Godot code and scene references;
- external art roots;
- exact duplicate evidence;
- missing code-referenced art;
- self-hash tampering;
- path traversal;
- symbolic-link isolation;
- forward task dependencies;
- exact source-byte binding;
- atomic output publication;
- source revalidation before and after execution;
- matte removal;
- edge decontamination;
- trim and exact canvas padding;
- hidden transparent RGB repair;
- outlines;
- source-rectangle and mask-rectangle copy/paste;
- directional rim-light and normal-map preparation;
- governed video-frame extraction and exact tool fingerprints;
- sheet slicing;
- sheet assembly;
- sequence manifests;
- identity-locked geometry, alpha-mass, colour and silhouette continuity metrics;
- contact sheets;
- GIF previews;
- onion skins;
- create-only output-root replay rejection;
- rollback when a source changes after compilation;
- reference topology requirements;
- immutable artifact staging;
- compatibility with the repository provider validator;
- read-only MCP capability discovery;
- explicit MCP write gating and allowed-root confinement;
- callable project intelligence, sandbox compilation and sandbox execution;
- callable reference-derived planning and immutable reference staging;
- fixed shell-free entrypoints with no image bytes in model context;
- bounded child execution with raw-output suppression and credential-environment isolation;
- retained false provider, approval, promotion, repository-mutation, deployment, publication, and force-push authority.

CI uses fixture images and the local artifact store. It makes no live or paid provider request.
