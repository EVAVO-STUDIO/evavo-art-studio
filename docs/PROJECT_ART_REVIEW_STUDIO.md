# Project Art Review Studio

Project Art Review Studio turns exact project images into a portable, offline visual review bundle. It is the review surface for Art Studio’s existing image intake, deterministic editing, sprite-sheet, atlas, reference-derived generation and candidate-repair systems.

It supports:

- before-and-after inspection;
- baseline and candidate comparison;
- candidate-set ranking;
- animation-frame playback;
- atlas and sheet inspection;
- reference-family review;
- checkerboard, white, black and chroma backgrounds;
- nearest-neighbour and linear sampling;
- fit and actual-pixel viewing;
- grid, single, split, overlay, difference, flicker and animation modes;
- technical, style, identity, animation, historical, composition, gameplay and runtime gates;
- exact keep, edit, recreate, variation, reference-only and reject decisions.

A review bundle never calls a provider, modifies source images, approves a candidate, promotes an artifact, changes a repository, commits Git, pushes, deploys or publishes. The browser exports a **draft**. A separate finalizer revalidates the exact plan and every item identity before sealing decisions and writing the review receipt.

## Contracts

```text
evavo.project-art-review-request.v1
evavo.project-art-review-plan.v1
evavo.project-art-review-bundle.v1
evavo.project-art-review-decisions-draft.v1
evavo.project-art-review-decisions.v1
evavo.project-art-review-receipt.v1
```

## 1. Create a review request

All source paths are canonical paths relative to one exact workspace root.

```json
{
  "schema": "evavo.project-art-review-request.v1",
  "reviewId": "battle-chess-white-knight-attack-v4",
  "projectId": "battle-chess",
  "title": "White Knight attack review",
  "purpose": "Compare the retained attack pose with repaired candidates and review the full animation.",
  "ui": {
    "defaultBackground": "checker",
    "defaultFit": "contain",
    "defaultMode": "split",
    "showPixelGrid": true,
    "allowLinearSampling": true
  },
  "groups": [
    {
      "id": "candidate-comparison",
      "kind": "comparison",
      "title": "Baseline and repaired candidate",
      "requiredGates": [
        "technical",
        "styleConsistency",
        "identityContinuity",
        "composition",
        "gameplayReadability",
        "runtimeReadiness"
      ],
      "items": [
        {
          "id": "baseline",
          "role": "baseline",
          "label": "Current retained frame",
          "source": "RAW_ART/white-knight/attack/frame-04.png"
        },
        {
          "id": "candidate-a",
          "role": "candidate",
          "label": "Matte-cleaned candidate",
          "source": ".evavo/outputs/white-knight-attack-v4/clean/frame-04.png"
        }
      ]
    },
    {
      "id": "attack-sequence",
      "kind": "animation",
      "title": "Attack sequence",
      "playback": {
        "frameDurationMs": 83,
        "loop": true
      },
      "items": [
        {
          "id": "attack-00",
          "role": "frame",
          "label": "Attack frame 00",
          "source": ".evavo/outputs/white-knight-attack-v4/frames/attack-00.png",
          "frameIndex": 0
        },
        {
          "id": "attack-01",
          "role": "frame",
          "label": "Attack frame 01",
          "source": ".evavo/outputs/white-knight-attack-v4/frames/attack-01.png",
          "frameIndex": 1
        }
      ]
    }
  ]
}
```

Supported group kinds are:

```text
comparison
candidate-set
animation
atlas
reference
general
```

Supported item roles are:

```text
baseline
candidate
reference
frame
mask
overlay
atlas
other
```

## 2. Compile an exact plan

```powershell
Set-Location C:\GitRepos\evavo-art-studio

pnpm run project-art:review:compile -- `
  --workspace-root C:\GitRepos\battle-chess `
  --request C:\EVAVO\staging\white-knight-review-request.json `
  --output C:\EVAVO\staging\white-knight-review-plan.json
```

Compilation:

- rejects symbolic-link roots and source components;
- confines every source below the declared workspace;
- validates group and item identities;
- streams SHA-256 over every exact source file;
- records byte length, media type and bounded image-header evidence;
- checks optional expected source hashes;
- rejects duplicate groups, duplicate items and invalid group semantics;
- applies per-file and whole-review byte limits;
- assigns deterministic bundle asset paths;
- emits a canonical self-hashed plan;
- retains false provider, runtime, approval, promotion, mutation, Git, deployment and publication authority.

A recalculated document hash cannot bypass the permanent authority boundary. The builder independently revalidates the complete authority shape, exact group and item summary, path constraints, source identities and current source bytes.

## 3. Build the offline bundle

The output must be a new child of the plan’s exact workspace root.

```powershell
pnpm run project-art:review:build -- `
  --plan C:\EVAVO\staging\white-knight-review-plan.json `
  --output-root C:\GitRepos\battle-chess\.evavo\reviews\white-knight-attack-v4
```

The builder:

1. revalidates the plan self-hash and immutable authority boundary;
2. confirms the workspace root still resolves to the same real directory;
3. re-reads and re-hashes every source;
4. copies exact bytes into a sibling staging directory with no overwrite;
5. verifies every retained copy;
6. writes the offline viewer, review data and draft template;
7. writes a self-hashed manifest and bundle receipt;
8. atomically renames the complete staging directory into place.

A failed build removes its staging directory. Existing output roots are never reused or overwritten.

Open:

```text
.evavo/reviews/white-knight-attack-v4/index.html
```

The generated page has a strict local Content Security Policy. It uses no external fonts, scripts, styles, APIs, analytics, WebSockets or network dependencies.

## 4. Review visually

The viewer supports:

### Display modes

```text
Grid        see every item and exact metadata
Single      focus one source
Split       compare baseline and selected candidate side by side
Overlay     blend baseline and candidate with adjustable opacity
Difference  highlight changed pixels through difference blending
Flicker     alternate baseline and candidate rapidly
Animate     play ordered frame items at the group timing
```

### Inspection controls

```text
checker / white / black / chroma background
nearest-neighbour / linear sampling
fit / actual pixels
25% through 800% zoom
optional pixel grid
keyboard previous / next
spacebar playback toggle
```

The viewer displays each exact source path, SHA-256, byte length, media type and dimensions. Formats that are retained but not safe for direct browser preview remain visible as exact metadata rather than being silently converted.

## 5. Record decisions

Every item records all eight gates:

```text
technical
styleConsistency
identityContinuity
animationContinuity
historicalAccuracy
composition
gameplayReadability
runtimeReadiness
```

Each gate is explicit:

```text
pass
fail
not-reviewed
not-applicable
```

Each item receives one disposition:

```text
keep
edit
recreate
generate-variation
reference-only
reject
```

The draft can also retain:

```text
strengths
properties to preserve
defects
required changes
things to avoid
notes
```

`keep` cannot hide failed gates, defects or repair instructions. `edit`, `recreate` and `generate-variation` require at least one failed gate, one defect and one required change. `reject` requires a defect or an explicit rejection note. Required gates cannot remain `not-reviewed`.

The browser export is deliberately:

```text
evavo.project-art-review-decisions-draft.v1
```

It is not an approval receipt and carries no execution or repository authority.

## 6. Finalize and seal the review

```powershell
pnpm run project-art:review:finalize -- `
  --plan C:\EVAVO\staging\white-knight-review-plan.json `
  --decisions C:\Users\Greg\Downloads\battle-chess-white-knight-attack-v4-review-decisions-draft.json `
  --output-root C:\GitRepos\battle-chess\.evavo\reviews\white-knight-attack-v4-final
```

Finalization:

- revalidates the exact plan and workspace;
- requires exactly one decision for every plan item;
- binds every decision to the exact group, item ID and source SHA-256;
- validates the reviewer mode and canonical timestamp;
- validates every gate and disposition;
- rejects missing, duplicate, substituted or stale decisions;
- normalizes structured defect evidence;
- enforces keep, repair and reject semantics;
- writes a self-hashed sealed decision document;
- writes a self-hashed receipt containing disposition counts and explicit next actions;
- writes the final pair create-only and atomically.

The final output contains:

```text
review-decisions.json
review-receipt.json
```

A `keep` result becomes only an **independent approval candidate**. It is not approval. Repair dispositions become only repair candidates and still require the existing provider selection, fresh durable admission, fresh short-lived execution authorisation and later review cycle.

## MCP access for ChatGPT and Claude

Use:

```text
config/mcp.project-art-review.windows.example.json
```

The dedicated server exposes:

```text
evavo_art_review_capabilities
evavo_art_compile_review
evavo_art_build_review
evavo_art_finalize_review
```

By default only the capability tool is usable. Writes require:

```text
EVAVO_ART_REVIEW_MCP_ALLOW_WRITE=true
```

All paths must remain below:

```text
EVAVO_ART_REVIEW_ROOTS
```

Image bytes never travel through MCP. The tools exchange only paths, exact identities, bounded summaries and receipt hashes.

## Integration with the wider Art Studio

The intended path is:

```text
ChatGPT / Claude attachment or generated image
→ callable workspace intake
→ immutable original + editable working copy
→ deterministic sandbox operation or provider-backed candidate
→ sheet / sequence / atlas preparation
→ Project Art Review Studio
→ sealed keep / repair / reference / reject evidence
→ fresh repair cycle where needed
→ independent creative and project-specific approval
→ governed artifact promotion
→ guarded repository asset writer
→ Development Studio mainline publication
→ native engine and browser validation
```

The review boundary does not collapse these responsibilities. It supplies the exact visual evidence and structured decisions needed by the later governed stages.
