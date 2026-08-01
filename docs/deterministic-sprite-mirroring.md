# Deterministic sprite direction mirroring

Art Studio may derive one horizontal direction from another only when the compiled sprite plan already marks that direction as safely derived. The optimisation is not a provider prompt and is never inferred by the runtime worker on its own.

## Execution order

```text
selected authored direction or frame master
→ exact full-canvas horizontal RGBA reflection
→ lossless PNG encoding
→ encoded-pixel equality proof
→ exact double-reflection round trip
→ unchanged frame-quality gates
→ immutable mirror evidence
→ selected deterministic derived master
→ complete family reconstruction
→ independent family-level mirror proof
→ release evidence
```

The operation is compiled as `art.candidate.finalize-adaptive` with `operation=mirror-horizontal`. Reusing the existing bounded media queue preserves the supervisor allow-list and queue authority while the worker dispatches to a dedicated deterministic implementation.

## Safety conditions

Mirroring fails closed when any of the following applies:

- the asset is asymmetric;
- held items or runtime equipment swaps are present;
- runtime costume variants require directional construction;
- a normal map would require X-channel inversion;
- the camera is movable, rolled, or forbids mirroring;
- lighting varies between frames;
- screen-space key light or baked cast-shadow handedness has not received explicit style-owner review;
- historically constrained construction has not received explicit symmetry review;
- the pivot is not on the exact full-canvas horizontal axis; or
- a derived direction, frame, or retained visible layer lacks an authored source master.

Explicit reviews are recorded under `metadata.deterministicMirroring`:

```json
{
  "deterministicMirroring": {
    "lightingReviewed": true,
    "historicalSymmetryReviewed": true
  }
}
```

Those flags authorise only the declared symmetry decision. They do not relax transparency, frame, family, lineage, task-budget, approval, or release gates.

## Pixel transform

For an RGBA canvas of width `W`, each source pixel maps to:

```text
targetX = W - 1 - sourceX
targetY = sourceY
```

The worker:

- retains the complete canvas;
- performs no trim, crop, scale, interpolation, palette conversion, or resampling;
- preserves alpha exactly;
- preserves RGB beneath transparent pixels exactly;
- encodes one lossless PNG;
- decodes the PNG and compares every RGBA byte to the expected transform; and
- mirrors the decoded result again and requires exact reconstruction of the source RGBA buffer.

The same pixel proof is repeated by the family-verification worker rather than trusting the first worker's evidence record.

## Immutable artifacts

Each deterministic unit produces:

- `deterministic-horizontal-mirror-base`, an unapproved intermediate directly descended from the selected source master;
- `sprite-horizontal-mirror-evidence`, immutable JSON describing the transform, source and target hashes, quality report, exact encoded-pixel proof and double-reflection proof; and
- `deterministic-mirrored-sprite-master`, a selected quality-passed master descended from the intermediate and evidence.

The complete family verifier emits:

```text
sprite-family-horizontal-mirror-proof-evidence
```

The supervisor binds that artifact to:

```text
automatic.family-horizontal-mirror-proof-evidence
```

That role becomes mandatory for release whenever any derived direction is present.

## Adaptive-finalization compatibility

The deterministic mirror task is inserted after the authored source has completed ordinary mastering, adaptive cleanup, hostile-background proof, deterministic selection and governed promotion. The derived master therefore retains bounded ancestry to the selected authored source and, transitively, to its adaptive finalization envelope and hostile-background proof.

When adaptive finalization and mirroring are both active, release requires both:

```text
automatic.family-adaptive-proof-evidence
automatic.family-horizontal-mirror-proof-evidence
```

A strong mirror proof cannot replace adaptive transparency proof, and a strong adaptive proof cannot replace exact directional derivation proof.

## Public authority boundary

CLI, REST and MCP compilation surfaces may calculate and expose the deterministic task graph. They do not read image artifacts, execute the mirror worker, call a provider, promote an asset, update a named reference, run a shell, deploy a project, or relax a quality threshold.
