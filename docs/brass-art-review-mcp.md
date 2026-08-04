# Brass & Brine Art Review MCP

The Brass art-review entrypoint is a deliberately narrow companion to the full EVAVO Art Studio MCP:

```text
apps/mcp/dist/review.js
```

It gives ChatGPT, Claude and other MCP clients deterministic repository, sprite-frame and sequence inspection without exposing Art Studio's runtime submission, artifact storage, provider execution, candidate promotion or target-write tools.

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
inspect_sprite_sequence_quality
```

The server can:

- validate an EVAVO art brief;
- compile deterministic roles, quality gates and deliverables;
- inspect a root-restricted repository for engine context, existing art and likely gaps;
- decode a root-restricted image and report alpha, fake transparency, crop, edge-halo and transparent-RGB evidence;
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

A passing metric report is not human creative approval, native Godot rendering, gameplay acceptance or release readiness. Development Studio remains responsible for evidence admission and governed publication.

## Validation

```powershell
pnpm --filter @evavo/art-studio-mcp build
pnpm --filter @evavo/art-studio-mcp test
node scripts/check-brass-art-review-mcp.mjs
```

The permanent checker verifies the exact six-tool inventory, explicit root requirement, all-false effect authority, absence of write-capable imports and the compiled behavioral tests.
