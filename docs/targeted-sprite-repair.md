# Targeted sprite repair

Status: deterministic planning implemented; provider execution remains a separately submitted durable job.

## Purpose

A failed sprite frame must not cause Art Studio to regenerate an approved family, sheet or unrelated layer. Targeted repair converts immutable layered-family evidence into one bounded repair packet. The packet identifies what may change, what must remain untouched, how many frames share the defective source, and which verification stages must run again.

## Repair strategies

Blocking gates are classified into:

- `source-replace`: corrupt, unverified, rejected or lineage-invalid source material must be replaced from a verified source;
- `metadata-adjustment`: pivot, baseline, timing, ordering or ground-contact metadata changes without pixel changes;
- `layer-transform`: offset, registration or canvas-placement corrections;
- `layer-recompose`: ownership, z-order, blend, opacity, occlusion or declared-composite corrections;
- `alpha-remaster`: deterministic alpha, matte and edge cleanup without redesigning the subject;
- `masked-provider-inpaint`: provider-assisted repair limited to one explicit mask over one base frame or layer;
- `manual-review`: evidence is insufficient to justify an automatic mutation.

Source and quality failures never fall through to generative guessing.

## Impact analysis

For a `per-frame` layer, the mutable scope is the selected frame binding. For `linked-cel` and `static-family` layers, Art Studio expands impact to every frame sharing the same immutable artifact ID. Shared repair is blocked unless `allowSharedLayerRepair=true`, and the number of impacted frames is bounded by `maximumImpactedFrames`.

The repair packet includes:

- the exact mutable artifact IDs;
- every protected source artifact ID;
- impacted frame IDs;
- failed gate evidence;
- ordered repair steps;
- blockers;
- optional provider inpaint contract;
- mandatory continuation stages.

## Masked pixel repair

Provider-assisted repair requires:

1. A target layer, unless whole-frame repair is explicitly enabled.
2. A real mask artifact when `requireMaskForPixelRepair` is enabled.
3. A verified base artifact and verified mask.
4. Matching base and mask format and dimensions.
5. A non-empty editable mask region.
6. A canonical identity reference.
7. An explicit style envelope and shot boundary.
8. An explicit background strategy.

The provider receives one `inpaint` request for one frame or layer. It is told to preserve every protected layer and every pixel outside the mask. Other retained layers are repeated in `separateAssets` so the provider cannot merge them into the repair output.

A blocked repair packet cannot return a provider execution plan. The durable worker checks this again even though the public planner suppresses such plans.

## Durable planning

The job kind is:

```text
art.repair.plan
```

Required capabilities:

```text
repair.plan
artifacts.store
evidence.bundle
```

The job must declare the family evidence, mask and every conditioning reference in `inputArtifacts`. Planning may return `ready`, `blocked` or `manual-source-required`. All three are useful evidence outcomes; none executes a provider or mutates an approved reference.

## Continuation sequence

A ready pixel-repair packet declares the following continuation:

```text
provider inpaint candidate
→ alpha mastering when chroma-keyed
→ update only the target manifest binding
→ reverify every impacted layered frame
→ compare repaired candidates
→ promote through compare-and-swap governance
```

Metadata, transform, recomposition and alpha-only repairs omit unnecessary provider work but still require fresh family verification before selection or promotion.

## CLI

```powershell
pnpm art -- repair-protocol

pnpm art -- repair-validate `
  --input .\hero-body-repair.json

pnpm art -- repair-compile `
  --input .\hero-body-repair.json `
  --output .\hero-body-repair.job.json

pnpm art -- repair-run `
  --input .\hero-body-repair.json `
  --artifact-root .\.art-studio\artifacts `
  --output .\hero-body-repair.packet.json
```

`repair-run` performs local planning only. It does not call a provider or modify source pixels.

## REST and MCP

REST:

```text
GET  /v1/repair-protocol
POST /v1/repairs/validate
POST /v1/repairs/compile
```

MCP:

```text
targeted_repair_protocol
validate_targeted_repair_request
compile_targeted_repair_job
```

Both surfaces are compile-only and return `art.repair.plan` jobs. They do not read artifact content.

## Approval boundary

A repair packet is evidence, not approval. Provider outputs remain unapproved candidates. Repaired layers must pass alpha mastering where relevant, layered family verification, candidate comparison and separate promotion. Only promotion may create a selected master and update a named approved reference.
