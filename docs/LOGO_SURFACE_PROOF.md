# Logo Surface Proof

**Status:** Implemented review boundary  
**Package:** `@evavo/art-repair`  
**Authority:** proof only; no brand or release approval

## Purpose

`inspectLogoSurfaceProof` verifies that a repaired or approved raster logo is safe to place on a declared light, dark or mixed surface.

It complements matte removal. Removing a source background is not enough to prove that the final asset is usable: the result may be empty, cropped, retain an exterior matte or contain an excessive semi-transparent halo.

## Evidence

The proof records:

- exact RGBA SHA-256;
- image dimensions;
- transparent, semi-transparent and opaque pixel counts;
- corner opacity;
- border pixel count;
- border pixels close to the declared matte colour;
- semi-transparent exterior-edge share;
- complete visible bounds; and
- minimum visible padding.

## Blocking findings

The proof blocks:

- an asset with no visible pixels;
- visible artwork touching or breaching required padding;
- opaque corners above the reviewed threshold; and
- excessive border pixels matching the declared matte colour.

An excessive semi-transparent exterior halo is retained as a warning for human review.

## Input boundary

The function rejects:

- non-`Uint8ClampedArray` image data;
- dimensions that do not match the RGBA byte count;
- images above the bounded pixel limit;
- unsupported or accessor-backed option objects;
- symbol and unknown option fields;
- invalid surfaces, colours, ratios or corner thresholds; and
- unbounded or control-character asset identities.

## Usage

```ts
const proof = inspectLogoSurfaceProof(rgba, width, height, {
  assetId: "approved-lockup-on-dark",
  intendedSurface: "dark",
  matteColour: [0, 0, 0],
  minimumPaddingPx: 2,
});
```

A successful proof retains:

```text
readyForHumanReview = true
sourceMutationPerformed = false
brandApprovalPerformed = false
releaseApprovalPerformed = false
```

The proof does not decide that a lock-up is an approved brand variant. Brandcraft Studio remains responsible for brand approval and surface-variant identity. Presentation Studio remains responsible for final placement and document release review.

## Verification

The repair package test lane builds the TypeScript package and runs the logo surface proof regressions:

```bash
pnpm --filter @evavo/art-repair typecheck
pnpm --filter @evavo/art-repair test
```

Coverage includes a valid transparent lock-up, matte-backed corners and borders, cropped visible bounds, invalid ratios, accessor-backed options and dimension mismatch.
