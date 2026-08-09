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
alpha-threshold
connected-matte-to-alpha
edge-decontaminate
hidden-rgb-rebuild
palette-normalize
quantize
autocontrast
levels
outline
convert
optimize
```

Important behavior:

- `resize` supports contained, covered, and filled canvases with explicit sampling.
- `pixel-resize` always uses nearest-neighbour sampling and can require integer scale factors.
- `connected-matte-to-alpha` removes only matching matte connected to the image border.
- `edge-decontaminate` removes a named matte colour from partially transparent edge pixels.
- `hidden-rgb-rebuild` propagates retained edge colour into transparent pixels to reduce sampling fringes in engines and atlases.
- `palette-normalize` supports grayscale, monochrome, and explicit bounded palettes.
- `outline` derives an outline from alpha without repainting the source file.
- JPEG output is flattened and cannot be used as a transparency master.

Every operation records before and after decoded-pixel identities in the execution receipt.

## 3. Sprite-sheet and animation work

The sandbox has four task kinds:

```text
image
slice-sheet
assemble-sheet
sequence-review
```

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
  "thresholds": {
    "minimumChangedFraction": 0.001,
    "maximumChangedFraction": 0.45,
    "maximumCentroidShiftPixels": 64
  },
  "preview": {
    "contactSheet": true,
    "animatedGif": true,
    "onionSkins": true,
    "frameDurationMs": 83,
    "columns": 6
  }
}
```

The review task publishes:

- an exact sequence manifest;
- per-frame dimensions, alpha use, alpha bounds, centroid, and decoded-pixel hash;
- adjacent changed-pixel fractions;
- alpha-centroid movement;
- blank, duplicate, dimension, alpha, movement, and excessive-change findings;
- an indexed contact sheet;
- an animation preview GIF;
- optional adjacent onion-skin images.

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
- sheet slicing;
- sheet assembly;
- sequence manifests;
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
