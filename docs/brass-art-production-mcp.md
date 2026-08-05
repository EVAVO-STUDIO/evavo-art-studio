# Brass & Brine Art Production MCP

`apps/mcp/src/production.ts` exposes deterministic Art Studio delivery through a separate `staging-only` MCP server.

It exists for the boundary after technical and human review: turn one exact, governed batch manifest into role-appropriate derivatives and an optimization receipt without writing into Brass & Brine, deleting source material, calling an art provider or publishing Git changes.

## Configuration

The server requires one or more explicit source roots and one disjoint evidence root:

```powershell
$env:EVAVO_ART_PRODUCTION_MODE = "staging-only"
$env:EVAVO_ART_PRODUCTION_SOURCE_ROOTS = "C:\GitRepos\Brass_Brine"
$env:EVAVO_ART_PRODUCTION_EVIDENCE_ROOT = "C:\EVAVO-Evidence\Brass_Brine"
pnpm run dev:mcp:production
```

Every root must be a canonical, existing, non-symlink directory. Source roots may not overlap each other. The evidence root may not contain, or be contained by, Art Studio or a configured source root.

## Exact tool inventory

```text
art_production_capabilities
validate_art_delivery_batch
stage_art_delivery_batch
```

`art_production_capabilities` lists the fixed profile catalogue, profile SHA-256 values, supported background policies and permanent authority boundaries.

`validate_art_delivery_batch` reads a strict manifest, verifies every declared source byte and SHA-256, and runs the complete deterministic optimizer in memory. It writes no derivative or receipt.

`stage_art_delivery_batch` requires `apply: true` and creates exactly one new direct-child output directory beneath the evidence root. Output is first built in an internal staging directory and then atomically renamed into place. An existing output name is rejected.

## Manifest

The manifest uses:

```text
evavo.art-delivery-optimization.v1
```

Example:

```json
{
  "schema": "evavo.art-delivery-optimization.v1",
  "batchId": "brass-first-voyage-ships-001",
  "project": {
    "id": "Brass_Brine",
    "title": "Brass & Brine",
    "engine": "godot",
    "engineVersion": "4.6.2",
    "viewport": { "width": 1280, "height": 720 },
    "rendering": "Compatibility"
  },
  "items": [
    {
      "id": "schooner-basic-profile",
      "sourcePath": "RAW_ART/ships/schooner_basic.png",
      "targetPath": "assets/art/ships/profiles/schooner_basic.webp",
      "sourceSha256": "<lowercase-sha256>",
      "sourceBytes": 123456,
      "profileId": "godot-cutout-webp-1080p",
      "background": {
        "mode": "remove-border-matte",
        "matteColour": "#000000"
      }
    }
  ]
}
```

The loader rejects duplicate JSON keys, escaped-equivalent duplicate keys, a UTF-8 byte-order mark, invalid UTF-8, trailing content, non-canonical paths, unknown profiles, target collisions, changed source byte lengths and changed source hashes.

Manifest loading is descriptor-bound rather than path-only. Resolution snapshots the canonical file device, inode, byte length, modification time and change time. The loader then opens that exact path, requires the descriptor identity to match the snapshot, reads exactly the bounded byte length, probes for unexpected growth, and rechecks both descriptor and path identity before and after JSON validation. Path replacement, same-path rewrite, truncation, growth, symlink substitution or disappearance therefore fails before optimization.

## Role-aware preparation

The manifest remains governed by the game-owned semantic media contract. Typical Brass policies are:

```text
dialogue close-up or opaque room/background plate
→ preserve
→ do not remove the authored black presentation stage

standing character, ship cut-out or UI icon with an outer matte
→ remove-border-matte
→ remove only border-connected matte pixels and preserve dark subject detail

rain, snow, fog, spray or reflected-light overlay authored on black
→ luminance-alpha
→ derive smooth opacity from source luminance rather than applying a hard threshold
```

The profile catalogue separately controls runtime dimensions, no-upscale behavior, format, alpha policy, byte budget and pixel-quality thresholds. True lossless WebP is admitted only when decoded RGBA and hidden transparent RGB satisfy the profile.

## Output and receipt

A successful staging call creates a self-contained directory such as:

```text
C:\EVAVO-Evidence\Brass_Brine\staged-first-voyage-ships-001\
  assets\art\ships\profiles\...
  optimization-receipt.json
```

The receipt uses:

```text
evavo.art-delivery-optimization-receipt.v1
```

It binds the manifest hash, profile catalogue, each source and output SHA-256, byte lengths, selected encoding candidate, transformation evidence, pixel metrics and exact output paths.

The staged output is evidence and a publication candidate. It is not automatically copied into the game repository.

## Authority boundary

The production MCP records:

```text
stagingWritesEnabled = true
createOnlyOutputs = true
atomicOutputPublication = true
maximumManifestBytes = 16777216
descriptorBoundManifestReads = true
manifestIdentityRecheckedAfterRead = true
sourceMutationAllowed = false
targetRepositoryMutationAllowed = false
deletionAuthority = false
providerExecutionAllowed = false
runtimeJobSubmissionAllowed = false
artifactReferenceMutationAllowed = false
promotionAuthority = false
publicationAuthority = false
arbitraryShellAllowed = false
arbitraryGitArgumentsAllowed = false
arbitraryExecutablePathsAllowed = false
```

A staged batch is not human creative approval, native Godot acceptance, provenance approval or release readiness. Development Studio must independently bind the exact receipt and selected output paths, run the Test Lab and browser evidence required by the mission, acquire the governed publication lease and publish through the signed non-forced mainline route.

## Validation

```powershell
pnpm run brass:production:mcp:check
pnpm --filter @evavo/art-studio-mcp test
pnpm check
```

The focused suite covers strict root isolation, duplicate-key-safe manifests, stale manifest snapshots, path replacement and same-path rewrite rejection, bounded descriptor reads, validation without output, atomic create-only staging, changed-source rejection, unconfigured-root rejection, symlink rejection and absence of provider, runtime, deletion, Git or publication authority.
