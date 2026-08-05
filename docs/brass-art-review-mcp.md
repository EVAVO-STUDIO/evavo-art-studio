# Brass & Brine Art Review MCP

The Brass art-review entrypoint is a deliberately narrow companion to the full EVAVO Art Studio MCP:

```text
apps/mcp/dist/review.js
```

It gives ChatGPT, Claude and other MCP clients deterministic repository, sprite-frame, bounded batch and sequence inspection without exposing Art Studio's runtime submission, artifact storage, provider execution, candidate promotion or target-write tools.

## Required configuration

The server requires explicit canonical review roots:

```powershell
$env:EVAVO_ART_REVIEW_ALLOWED_ROOTS = "C:\GitRepos\Brass_Brine;C:\EVAVO-Evidence\Brass_Brine"
pnpm --dir C:\GitRepos\evavo-art-studio --filter @evavo/art-studio-mcp start:review
```

Use the platform path delimiter. Empty configuration, unavailable directories, symlinked roots and non-canonical aliases fail before the server connects.

## Exact tool inventory

```text
art_review_capabilities
validate_art_brief
compile_art_production_plan
inspect_art_repository
inspect_sprite_frame_quality
inspect_art_batch_quality
inspect_sprite_sequence_quality
```

The server can:

- validate an EVAVO art brief;
- compile deterministic roles, quality gates and deliverables;
- inspect a root-restricted repository for engine context, existing art and likely gaps;
- decode one root-restricted image and report alpha, fake transparency, crop, edge-halo and transparent-RGB evidence;
- inspect one role-consistent folder as a complete reviewed batch;
- inspect one exact role-consistent selection from an immutable mixed corpus without copying or moving sources;
- inspect a root-restricted sprite sequence for shared canvas, frame order, timing, pivots, baselines, ground contact and linked-cel identity.

It does not expose:

```text
provider execution
runtime job submission or control
artifact storage or reference mutation
atlas or Godot resource writing
candidate promotion
repository deletion or mutation
arbitrary shell or Git arguments
publication authority
```

## Batch review contract

`inspect_art_batch_quality` emits:

```text
evavo_brass_art_batch_review_v1
```

Every call binds one explicit game-owned `roleId` and one shared sprite-frame expectation profile. The tool supports two source modes.

### Complete-folder mode

Omit `relativePaths` to walk one role-consistent directory recursively or non-recursively.

```json
{
  "directoryPath": "C:\\GitRepos\\Brass_Brine\\RAW_ART\\ui-icons",
  "roleId": "ui-icon",
  "expectations": {
    "transparency": "alpha-required",
    "expectedWidth": 256,
    "expectedHeight": 256,
    "safePadding": 4,
    "knownMatteColours": ["#000000", "#ffffff"]
  },
  "recursive": true,
  "maximumFiles": 500,
  "maximumDepth": 12,
  "maximumTotalBytes": 536870912,
  "detail": "failures"
}
```

### Exact selected-path mode

Use `relativePaths` when one immutable mixed corpus such as `RAW_ART` contains ports, characters, icons, backgrounds, documents and animation frames in the same tree. The request root remains the corpus root, while each selected path is relative to that root.

```json
{
  "directoryPath": "C:\\GitRepos\\Brass_Brine\\RAW_ART",
  "roleId": "ui-icon",
  "relativePaths": [
    "BATTLE_ICON.png",
    "BASE_LAYER_GAUGE_SPINNER.png"
  ],
  "expectations": {
    "transparency": "alpha-required",
    "expectedWidth": 256,
    "expectedHeight": 256,
    "safePadding": 4
  },
  "maximumFiles": 500,
  "maximumTotalBytes": 536870912,
  "detail": "failures"
}
```

Exact selected-path mode records:

```text
selectionMode = exact-relative-paths
selectionSha256 = deterministic hash of canonical sorted selected paths
```

Paths must be NFC-normalized portable repository-relative image paths. Absolute paths, drive prefixes, backslashes, control characters, `.` or `..` segments, trailing dots or spaces, unsupported extensions, missing files, symlinks, non-canonical aliases, duplicates and case-fold collisions fail closed. Selected files are sorted before review, so request ordering cannot change `selectionSha256` or `batchIdentitySha256`.

This mode does not create temporary role folders and does not rewrite source-library paths. The exact source remains in the mixed corpus, preserving source identity for later keep, tweak, recreate, reference-only or reject decisions.

## Technical evidence

In either mode, the tool:

- binds the report to the explicit game-owned role;
- rejects partial review when file, depth or byte limits are exceeded;
- opens each selected image read-only and proves its descriptor and path identity are unchanged;
- hashes exact source bytes;
- decodes the same retained bytes through Art Studio quality analysis;
- reports compact dimensions, alpha, fake-matte, crop, halo and transparent-RGB evidence;
- groups exact source-byte duplicates;
- groups decoded-pixel duplicates across different encodings;
- returns deterministic technical-action tags;
- includes full frame reports for failures by default.

Possible technical actions include:

```text
technical-pass-human-review-required
background-mastering-required
canvas-or-crop-rework-required
edge-mastering-required
runtime-format-rework-required
manual-technical-review-required
```

Duplicate groups cover the complete reviewed batch, whether that batch came from a directory or an exact path selection. The request fails instead of silently truncating when configured bounds are too small. Duplicate evidence does not authorise deletion, canonical selection or promotion.

The `detail` modes are:

```text
summary   compact evidence only
failures  compact evidence for every file plus full reports for failures
all       full reports for every file
```

## Brass & Brine use

The recommended roots are:

```text
Brass_Brine checkout
Brass_Brine external evidence root
```

This lets an agent inspect current game media plus governed review manifests and evidence without broad filesystem access.

Dialogue close-ups, standing sprites, crew portraits, ship profiles, documents, icons, maps, backgrounds and weather overlays retain their game-owned role contracts. The review server reports technical evidence; it does not invent semantic identity, historical accuracy, port or culture specificity, provenance, art direction, creative quality or a keep/tweak/recreate decision.

Examples:

```text
black-backed dialogue portrait
→ preserve authored stage

standing character, crew portrait, ship profile or UI cutout
→ inspect meaningful transparency, connected matte candidates and edge halos

weather overlay
→ inspect real alpha, registered canvas and sequence compatibility

sprite animation
→ inspect ordered frames, exact timing, pivots and loop continuity
```

Background removal remains role-specific. A technical matte finding is not authority to globally color-key black or white. Source-preserving previews should be compared over black, white and EVAVO cherry-red mattes before a mask is admitted, and final output still requires independent native Godot and human review.

## Authority boundary

The capability response records:

```text
writesEnabled = false
providerExecutionAllowed = false
runtimeJobSubmissionAllowed = false
runtimeJobControlAllowed = false
artifactMutationAllowed = false
targetRepositoryMutationAllowed = false
deletionAuthority = false
promotionAuthority = false
publicationAuthority = false
arbitraryShellAllowed = false
arbitraryGitArgumentsAllowed = false
```

A passing metric report is not a judgement that artwork is creatively good. It is not human creative approval, semantic identity approval, historical approval, native Godot rendering, gameplay acceptance or release readiness. Development Studio remains responsible for evidence admission and governed publication.

## Validation

```powershell
pnpm --filter @evavo/art-studio-mcp build
pnpm --filter @evavo/art-studio-mcp test
node scripts/check-brass-art-review-mcp.mjs
```

The permanent checker verifies the exact seven-tool inventory, descriptor-stable source binding, exact selected-path authority, deterministic selection identity, duplicate evidence, explicit root requirement, all-false effect authority, absence of write-capable imports and the compiled behavioral tests.
