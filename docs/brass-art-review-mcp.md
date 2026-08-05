# Brass & Brine Art Review MCP

The Brass art-review entrypoint is a deliberately narrow companion to the full EVAVO Art Studio MCP:

```text
apps/mcp/dist/review.js
```

It gives ChatGPT, Claude and other MCP clients deterministic repository, sprite-frame, complete-folder batch and sequence inspection without exposing Art Studio's runtime submission, artifact storage, provider execution, candidate promotion or target-write tools.

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
- inspect one role-consistent image folder as a complete reviewed batch;
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

## Complete-folder batch review

`inspect_art_batch_quality` uses:

```text
evavo_brass_art_batch_review_v1
```

It accepts one folder, one explicit game-owned `roleId`, and one shared sprite-frame expectation profile. A batch must therefore be role-consistent, such as one icon family, one standing-character family, one weather-frame family or one ship-profile folder. Mixed-role source libraries should be reviewed in their role subfolders or through separate calls.

Example request:

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

The tool:

- binds the report to the explicit game-owned role;
- walks the canonical root deterministically;
- rejects symbolic links, non-canonical aliases and case-insensitive path collisions;
- rejects partial review when file, depth or byte limits are exceeded;
- reads every image into one stable byte buffer and proves it did not change during review;
- hashes the exact source bytes;
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

Duplicate groups cover the complete reviewed batch, not a truncated page. The request fails instead of silently truncating when its configured bounds are too small. Exact or decoded duplicate evidence does not authorise deletion, canonical selection or promotion.

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

Dialogue close-ups, standing sprites, crew portraits, ship profiles, documents, icons, maps, backgrounds and weather overlays still retain their game-owned role contracts. The review server reports technical evidence; it does not invent semantic identity or approve art direction.

For example:

```text
black-backed dialogue portrait
→ preserve authored stage

standing character, crew portrait, ship profile or UI cutout
→ inspect meaningful transparency and edge halos

weather overlay
→ inspect real alpha and registered canvas

sprite animation
→ inspect ordered frames, exact timing, pivots and loop continuity
```

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

A passing metric report is not a judgement that the artwork is creatively good. It is not human creative approval, semantic identity approval, native Godot rendering, gameplay acceptance or release readiness. Development Studio remains responsible for evidence admission and governed publication.

## Validation

```powershell
pnpm --filter @evavo/art-studio-mcp build
pnpm --filter @evavo/art-studio-mcp test
node scripts/check-brass-art-review-mcp.mjs
```

The permanent checker verifies the exact seven-tool inventory, complete-batch source binding, duplicate evidence, explicit root requirement, all-false effect authority, absence of write-capable imports and the compiled behavioral tests.
