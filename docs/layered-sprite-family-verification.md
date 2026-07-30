# Layered sprite-family verification

Status: implemented as a deterministic package, durable worker job, local CLI command, REST compiler and MCP compiler.

## Why this stage exists

A flattened sprite frame cannot prove which pixels belong to the character, costume, weapon, shadow, effect, normal map or collision sidecar. It also cannot prove that reusable layers stayed registered across frames. Art Studio therefore verifies the retained layered source before atlas delivery.

The stage answers four production questions:

1. Which content belongs in the visible colour composite?
2. Which content belongs in the identity comparison?
3. Which content must remain separately reusable at runtime or during repair?
4. Can the retained layers reconstruct the declared editable-source composite without drift or hidden additions?

## Layer roles

Supported roles are:

- `identity-core`: face, body, defining silhouette and anatomy that establish the character identity;
- `costume`: garments that may vary independently while retaining registration;
- `hair`: independently animated or replaceable hair where the resolution supports clean separation;
- `shadow`: cast or contact shadow, normally excluded from identity comparison;
- `equipment`: bags, armour, tools and other reusable equipment;
- `weapon`: held or attached weapons with explicit z-order and occlusion;
- `effect`: temporary action, impact, trail or particle artwork;
- `emission`: additive or screen-blended light and glow information;
- `normal`: engine-side normal-map data;
- `collision`: engine collision or hit-shape sidecar data;
- `occlusion`: authored masks or occlusion-only data;
- `guide`: pivots, construction, registration or pose guides that never enter the final colour image.

## Source policies

Every layer definition declares one source policy:

- `per-frame`: a separately authored image is expected for each frame;
- `linked-cel`: later frames must reuse the exact immutable artifact, offset and opacity of the declared source frame;
- `static-family`: the same immutable layer must be used throughout the family;
- `engine-sidecar`: retained for the engine or build pipeline but excluded from colour and identity composites;
- `guide-only`: retained for production evidence and excluded from rendered outputs.

## Separation rules

A component should remain separate when it needs independent reuse, replacement, pivoting, timing, blend mode, engine material, occlusion, collision or repair. A component should remain baked into an authored cel when separation would create visible seams, destroy intentional pixel clusters, require invented hidden artwork or make anatomy and cloth move mechanically.

A `mustRemainSeparate` layer must make a measurable visible contribution after higher layers are composited. Merely supplying an empty, fully hidden or duplicated file does not satisfy the contract.

## Verification process

For each family, Art Studio:

1. Validates frame order, layer coverage, source policies, z-order and occlusion declarations.
2. Verifies every immutable artifact descriptor and content hash.
3. Rejects failed-quality sources when `requireQualityPassed` is enabled.
4. Decodes each raster within bounded byte, pixel and concurrency limits.
5. Reconstructs the full colour composite using deterministic normal, additive, multiply and screen blending.
6. Reconstructs a separate identity-only composite.
7. Measures clipping, visible contribution, post-occlusion coverage and pivot-relative centroid registration for each layer.
8. Compares the reconstructed colour image with the declared editable-source composite.
9. Compares identity-only frames against the canonical identity frame.
10. Compares adjacent frames and declared loop endpoints.
11. Checks pivot, baseline and ground-contact stability.
12. Stores generated composites as unapproved intermediates and stores immutable family evidence.

## Blocking conditions

Typical blocking failures include:

- a required layer is absent;
- a linked cel or family-static layer changes unexpectedly;
- an engine sidecar enters the colour or identity composite;
- z-order contradicts an occlusion declaration;
- a required separate layer has no measurable visible contribution;
- a layer is clipped outside the declared canvas;
- registration exceeds its declared tolerance;
- a layer lacks required lineage to its canonical counterpart;
- reconstructed pixels do not match the declared composite within tolerance;
- canonical identity, adjacent-frame or loop-closure similarity falls below policy;
- pivot, baseline or ground contact drifts beyond tolerance;
- an undeclared duplicate composite is detected.

Failures retain their generated composites and evidence so a worker or agent can repair only the affected frame or layer.

## Durable execution

The durable job kind is:

```text
sprite.family.verify
```

It requires:

```text
sprite.family.verify
media.layer-compose
selection.compare
evidence.bundle
```

Every layer artifact and declared composite must appear in `inputArtifacts`. The worker rejects undeclared dependencies before verification.

## CLI

```powershell
pnpm art -- sprite-family-protocol

pnpm art -- sprite-family-validate `
  --input .\hero-idle.family.json

pnpm art -- sprite-family-compile `
  --input .\hero-idle.family.json `
  --output .\hero-idle.family-job.json

pnpm art -- sprite-family-run `
  --input .\hero-idle.family.json `
  --artifact-root .\.art-studio\artifacts `
  --output .\hero-idle.family-result.json
```

The direct run uses the same deterministic verifier as the durable worker and exits with code `3` when blocking gates fail.

## REST and MCP boundary

REST exposes only protocol, validation and durable-job compilation:

```text
GET  /v1/sprite-family-protocol
POST /v1/sprite-families/validate
POST /v1/sprite-families/compile
```

MCP exposes the same compile-only boundary:

```text
sprite_family_protocol
validate_sprite_family_manifest
compile_sprite_family_verification_job
```

Neither surface decodes artifacts, reconstructs images, executes a provider, runs a shell command, promotes a candidate or updates an approved reference inside the request handler.

## Output and approval boundary

A family verification may emit:

- one reconstructed colour composite per frame;
- immutable sprite-family consistency evidence;
- normal runtime-result evidence.

Generated composites remain `intermediate`, `unapproved` and `finalDeliverable=false`. Passing family evidence is a prerequisite for later candidate promotion and atlas delivery; it is not approval by itself.
