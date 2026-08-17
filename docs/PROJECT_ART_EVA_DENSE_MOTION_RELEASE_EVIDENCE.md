# Project Art EVA dense-motion release evidence

## Purpose

This boundary seals the evidence needed to hand the exact ten-frame EVA family to the Runtime admission-receipt assembler. It does not generate art, call an image provider, upload an asset, publish a release, deploy a site or activate a Runtime rig.

The source work order remains the authority for the family identity:

- character: `eva-female`
- family: `eva-20260809-153620`
- exact frame count: `10`
- current production fallback: ordinals `4`, `5`, and `6`
- frames requiring new dense identities: all ordinals `1` through `10`
- minimum dense Runtime release: `0.37.0`

## Runtime-compatible dense identities

The three existing production masters are fallback provenance only. They cannot satisfy ordinals `4`, `5`, or `6` in the dense family.

Every ordinal must have a new deterministic dense-motion identity:

```text
evavo/avatar-runtime/eva-female/dense-motion/
eva-20260809-153620-frame-NN-master-v1
```

This matches Runtime `0.37.0`, which requires the deterministic dense public ID for every receipt frame. Reusing an existing `identity-motion-v3` asset, asset ID, version or secure URL as a dense slot fails closed.

The canonical work order still retains the complete existing provenance for ordinals `4`, `5`, and `6`. That provenance remains available for rollback and comparison while the current three-frame rig stays active.

## What the compiler accepts

The compiler accepts one complete request document containing:

1. The canonical, fingerprinted dense-motion work order.
2. Ten frame-evidence records in exact ordinal order.
3. Ten continuity-evidence records in exact edge order, including `10→1`.
4. Family-level sequence, release-manifest, browser-playback and approval evidence.
5. A prepared `EVAVO-STUDIO/evavo-avatar-runtime` release at `0.37.0` or newer.
6. The exact closed authority object from the work-order boundary.

Partial or reordered requests fail closed. Unknown fields also fail closed.

## Per-frame evidence

Every ordinal must bind all of the following to the exact source frame:

- source Git blob SHA-1
- candidate-assurance SHA-256
- alpha-mastering receipt SHA-256
- frame-finisher receipt SHA-256
- technical-inspection SHA-256
- creative-approval SHA-256
- identity-evidence SHA-256
- final reviewed frame SHA-256
- immutable Cloudinary asset identity
- alpha-plane SHA-256
- named review decision and timestamp

The final reviewed SHA-256 must equal the immutable mastered asset SHA-256.

### Alpha and transparency

Each frame must prove:

- actual 8-bit RGBA alpha
- zero hidden RGB under fully transparent pixels
- no fake checkerboard background
- no matte halo
- zero visible pixels touching the canvas edge

A frame with an opaque background, fake transparency, hidden RGB, edge contact or a failed matte review is rejected.

### Immutable Cloudinary delivery

Each mastered asset must be create-only and immutable:

- provider: `cloudinary`
- cloud name: `dntogqtey`
- format: `png`
- canvas: `1024 × 1536`
- `createOnly: true`
- `overwrite: false`
- versioned secure URL required
- unique asset ID, public ID and final SHA-256 required
- deterministic dense public ID required for all ten ordinals

The current fallback asset identities remain preserved inside the work order, but they cannot be reused as dense masters.

## Review and continuity

Each frame requires named evidence that technical quality, creative quality, anatomy, face identity and silhouette registration passed.

The family requires all ten continuity edges in order:

`1→2`, `2→3`, `3→4`, `4→5`, `5→6`, `6→7`, `7→8`, `8→9`, `9→10`, `10→1`.

Each edge must pass face registration, perceptual-hash continuity and motion review. The final-to-first edge is not optional.

## Runtime release boundary

A valid package proves that release evidence is complete and that Runtime admission-receipt assembly may begin. It still reports:

- `publicationAllowed: false`
- `deploymentAllowed: false`
- `runtimeActivationAllowed: false`
- `activeThreeFrameRigMustRemain: true`

The prepared Runtime release must use the expected admission-receipt schema and be version `0.37.0` or newer. The request must explicitly keep deployment and activation approval false.

## Authority separation

The compiler cannot authorize:

- provider execution
- image mutation
- candidate promotion
- Cloudinary upload
- asset overwrite
- sequence release
- repository mutation
- Git commit or push
- publication
- deployment
- Runtime activation
- force push

A caller cannot widen authority by recomputing the package hash. Verification replays the full compiler and rejects semantic drift.

## CLI

Compile a complete request into one create-only evidence package:

```bash
node scripts/compile-project-art-eva-dense-motion-release-evidence.mjs \
  --request workspaces/eva-dense-motion/release-evidence.request.json \
  --output workspaces/eva-dense-motion/release-evidence.json
```

The request must be a bounded, single-link regular UTF-8 JSON file with no symbolic path components. The output is created with mode `0600` and is never overwritten.

## Current production effect

Adding this boundary does not claim that the ten-frame evidence exists. It defines and tests the exact admission contract that future, separately authorized mastering and review work must satisfy. Runtime `0.37.0` and the current three-frame rig remain unchanged until ten new deterministic dense masters pass the complete contract.
