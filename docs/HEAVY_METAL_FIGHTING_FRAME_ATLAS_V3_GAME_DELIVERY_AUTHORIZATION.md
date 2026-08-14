# HEAVY METAL FIGHTING — atlas-v3 game delivery authorization

Status: named-human, byte-verifying, read-only delivery authorization boundary  
Game target: `EVAVO-STUDIO/steel-dominion`  
Repository mutation: prohibited

## Purpose

The Frame atlas-v3 chain keeps evidence admission, human authorization and repository mutation as separate transactions:

```text
four exact workspace atlas builds
        ↓
Art Studio independently decodes each atlas and all 224 source PNGs
        ↓
local steel-dominion Godot 4.6.2 six-suite validation
        ↓
Art Studio game-validation admission
        ↓
explicit named-human delivery authorization
        ↓
future separately authorised repository writer
```

This boundary closes the metadata authorization blocker named
`explicit-game-repository-delivery-authorization`. It does not copy an atlas into
`steel-dominion`, activate runtime content, mutate Git, deploy or publish.

## Trust correction in protocol 2026-08-15.2

Protocol `2026-08-15.1` accepted a caller-supplied build-verification summary whose
fields included `exactSourcePixelsVerified = true`. The summary was structurally
checked and hashed, but a caller could fabricate the summary and calculate all
outer public hashes without executing the real source-pixel comparison.

Protocol `2026-08-15.2` removes that input completely.

`atlasBuildEvidence` now requires, for every canonical Frame:

```text
frameId
plan
receipt
atlasPngBytes
sourcePngBytes[224]
```

A standalone build-verification object is rejected as an unexpected field. Art
Studio compiles the verification result internally from privately copied byte
payloads.

## Required game validation evidence

The caller must provide:

```text
gameValidationAdmission
gameValidationReceiptBytes
expectedGameHead
```

The compiler calls `verifyHmfAtlasV3GameValidationAdmission` again. The original
local validation bytes must still prove the exact `steel-dominion` commit,
Godot 4.6.2, all six serial validation suites, clean source before and after,
no GitHub Actions dependency and no image generation.

## Exact build-plan admission

Every supplied plan is re-admitted before any pixel work. The verifier requires:

- schema `evavo.heavy-metal-fighting-frame-atlas-v3-plan.v1`;
- protocol `2026-08-12.1`;
- project and Frame identity;
- canonical self-hash;
- named-human style-proof approval;
- exact `production_master_v3` geometry;
- 224 ordered 160×160 sources;
- exact slot, row, column and atlas coordinates;
- source byte counts and SHA-256 identities;
- safe source-relative paths under the declared Frame source root;
- 26 non-empty batch-evidence records covering every source exactly once;
- exact reserved slots 224–255;
- canonical output names and `steel-dominion` target paths;
- closed build authority;
- create-only atomic workspace publication.

The build receipt is then re-admitted and cross-bound to the exact plan,
style-proof execution, approval, image, target, blockers and authority.

## Independent PNG and pixel verification

Art Studio privately copies every byte view before inspecting it. Proxy objects,
accessors, shared memory, missing entries, extra entries and oversized payloads
are rejected.

For the atlas and each source PNG it independently validates:

- the eight-byte PNG signature;
- complete bounded chunk framing;
- alphabetic chunk types;
- CRC-32 for every chunk;
- one leading 13-byte `IHDR`;
- contiguous `IDAT` data;
- one terminal zero-length `IEND`;
- no trailing bytes;
- no APNG chunks;
- no unsupported critical chunks;
- eight-bit RGBA colour type 6;
- standard compression and filtering;
- non-interlaced encoding;
- exact 2560×2560 atlas dimensions;
- exact 160×160 source dimensions;
- bounded inflation;
- scanline filters 0, 1, 2, 3 and 4.

It then requires:

- the exact atlas byte count and SHA-256 from the build receipt;
- every source byte count and SHA-256 from the plan;
- pixel-for-pixel equality between all 224 decoded sources and their assigned
  atlas cells;
- fully transparent reserved slots 224–255.

Only after those checks pass does Art Studio internally compile:

```text
evavo.heavy-metal-fighting-frame-atlas-v3-build-verification.v1
```

The resulting `buildVerificationSha256` is therefore an identity of a
verification Art Studio actually executed, not a caller assertion.

## Named-human authorization

The human input remains closed and requires exactly:

```text
actorId
occurredAt
decision
rationale
evidenceSha256
attestations
```

`decision` must be `authorized`, the decision time must be at or after the
validated game and style-proof evidence, and all six attestations must be true.
The decision authorizes delivery evidence only. It does not authorize repository
mutation or runtime activation.

## Output and verification

A successful compilation emits:

```text
evavo.heavy-metal-fighting-atlas-v3-game-delivery-authorization.v1
protocolVersion: 2026-08-15.2
```

The record binds the exact game commit, game-validation admission, four plans,
four build receipts, four internally compiled pixel-verification identities,
four atlas image identities, canonical target paths, style-proof executions and
named-human authorization evidence.

`verifyHmfAtlasV3GameDeliveryAuthorization` requires the submitted authorization
and all original inputs. It repeats the game-validation admission, plan and
receipt checks, PNG decoding and all 896 source-cell comparisons, recompiles the
canonical authorization and requires exact identity agreement.

## Authority boundary

Positive capabilities:

```text
evidenceAdmission                    true
callerSuppliedAtlasByteRead           true
callerSuppliedSourceByteRead          true
imageInspection                       true
namedHumanDeliveryAuthorization       true
```

The following remain false:

```text
gameRepositoryRead
gameRepositoryMutation
runtimeActivation
gitMutation
deployment
publication
forcePush
```

The byte reads are limited to buffers explicitly supplied by the caller. There
is no autonomous filesystem discovery, provider execution, image mutation,
packing execution or game-repository write. A future writer must independently
re-verify this authorization and the concrete bytes it intends to install.
