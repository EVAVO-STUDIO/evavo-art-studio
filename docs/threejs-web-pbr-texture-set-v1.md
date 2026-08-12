# Three.js web PBR texture-set delivery v1

Art Studio publishes `evavo_art_web_pbr_texture_set_v1` through `@evavo/art-contracts` for approved PBR texture sets consumed by `EVAVO-STUDIO/threejs-experiments`.

The contract is a **delivery boundary**, not a provider-execution command. A valid document proves what Art Studio produced and reviewed; it does not cause generation, upload into another repository, Three.js admission, Git mutation, deployment or publication.

## Producer output

A delivery document includes:

- stable texture-set ID and version;
- `approval=approved`;
- exact Three.js material recipe consumers;
- the existing fallback texture-set ID where one exists;
- mandatory fallback retention until Three.js independently admits the replacement;
- exact Art Studio source repository, revision and source SHA-256;
- one to eight unique PBR channels;
- exact channel role, format, colour space, URI, SHA-256, bytes and dimensions;
- repeat and anisotropy intent;
- cleared rights/provenance evidence;
- producer review checks;
- immutable producer preview SHA-256;
- mandatory Three.js Material Lab dry/wet review and independent visual approval.

## Channel rules

Supported roles:

```text
base-color
normal
roughness
metalness
ao
emissive
opacity
mask
```

`base-color` and `emissive` are `srgb`. All data channels are `linear`.

Approved delivery formats are:

```text
image
ktx2
```

Channel URIs must be root-relative, may not be protocol-relative, may not contain query/fragment/backslash traversal, and may not contain `..` path segments. Every channel requires an exact SHA-256 and bounded byte/dimension metadata.

## Required producer review

The producer review is approved only when all declared checks pass and at least these checks are present:

```text
channel-role-colour-space
seam-and-tiling
fixed-lighting-preview
rights-and-provenance
```

Producer approval still does not constitute Three.js visual acceptance. The consumer contract requires:

```text
materialLabDryWetRequired=true
independentVisualApprovalRequired=true
```

## Fallback retention

When the texture set is intended to replace a Three.js procedural fallback, the delivery must identify that fallback and set:

```text
fallbackRetentionRequiredUntilConsumerAdmission=true
```

This keeps the current scene deterministic and usable while Art Studio output is being reviewed. The Three.js consumer may switch only after its own hash, role/colour-space, Material Lab and visual-review gates pass.

## Example use

Rainy Red Bicycle can use this contract for richer approved asset-backed replacements of its current procedural:

```text
wet-asphalt-procedural-v1
painted-metal-procedural-v1
weathered-red-paint-procedural-v1
```

The procedural versions remain valid fallbacks until consumer admission completes.

## Package API

```ts
import {
  WEB_PBR_TEXTURE_SET_CONTRACT_VERSION,
  validateWebPbrTextureSet,
  assertWebPbrTextureSet,
} from "@evavo/art-contracts";
```

The contract package's normal build/test workflow compiles and exercises this boundary with the rest of Art Studio's domain contracts.
