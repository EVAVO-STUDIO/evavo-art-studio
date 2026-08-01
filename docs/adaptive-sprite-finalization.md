# Adaptive sprite finalization

Status: implemented deterministic repair and proof boundary

Protocol: `2026-08-01.1`

EVAVO Art Studio now treats generation, mastering, adaptive cleanup, selection, family verification and release as separate governed stages. A provider candidate is never considered ready merely because it looks plausible or has the highest score.

## Production boundary

```text
provider candidate
→ background extraction or native-alpha proof
→ exact runtime sizing
→ ordinary mastering evidence
→ bounded adaptive pixel repair
→ delivery-profile optimization
→ decoded-pixel QA
→ hostile-background proof sheet
→ deterministic candidate selection
→ compare-and-swap promotion
→ complete family reconstruction
→ family adaptive-proof evidence
→ release evidence
```

The adaptive stage changes only defects that have a safe deterministic correction. It never redesigns identity, changes pose, alters alpha, moves pivots, changes timing, weakens a threshold or hides a failed quality gate.

## Safe deterministic repairs

### Transparent RGB normalization

Fully transparent pixels may contain unrelated green, magenta, white, black or provider noise. Those hidden colours can leak during texture filtering and mip generation.

The repair kernel:

1. keeps every alpha value unchanged;
2. keeps every visible pixel unchanged;
3. searches a bounded radius for nearby foreground colour;
4. retains that foreground colour as transparent edge bleed where useful;
5. writes zero RGB where no nearby subject colour exists;
6. reruns the normal decoded-pixel quality report.

### Partial-alpha edge decontamination

A partially transparent edge pixel is corrected only when its RGB is close to a declared matte colour. Its alpha remains unchanged. The replacement RGB is taken from the nearest suitable visible foreground pixel within a bounded search radius.

This is suitable for green, magenta, white, grey and black fringe contamination. It is not a blur, erosion, dilation or global colour replacement.

## Fail-closed defects

The local repair kernel does not attempt to fix:

- missing alpha;
- a painted checkerboard or visual transparency grid;
- a baked flat background;
- a cropped limb, weapon, shadow or effect trail;
- incorrect output dimensions;
- an incorrect file format;
- identity, costume, equipment, direction, camera or palette drift;
- an invalid or tampered artifact lineage.

Those failures create a machine-readable repair plan and stop the task for a bounded provider edit, matte re-extraction, padded regeneration, implementation correction or named review.

## Bounded operation

The compile request may set:

```json
{
  "finalization": {
    "maximumDeterministicRepairPasses": 2,
    "transparentBleedRadius": 2,
    "matteSearchRadius": 6,
    "matteDistanceThreshold": 72
  }
}
```

Limits are validated before the durable workflow is compiled:

- repair passes: 0 to 8;
- transparent bleed radius: 0 to 16 pixels;
- matte search radius: 1 to 32 pixels;
- RGB Euclidean matte distance: 1 to 441.

A pass that cannot make another safe change escalates instead of looping.

## Hostile-background proof

Every adaptive candidate creates a real PNG proof sheet. The default cells place the finalized transparent image over:

```text
black
white
grey
green
magenta
```

Additional `#RRGGBB` backgrounds may be declared. The proof is diagnostic evidence rather than a checkerboard embedded into the asset. It is stored separately with:

```text
artifactRole = candidate-hostile-background-proof
storageClass = evidence
qualityState = passed | rejected
```

A fake transparency grid inside the candidate remains a blocking failure.

## Workflow insertion

The automatic compiler inserts one `art.candidate.finalize-adaptive` task after every `art.candidate.master-alpha` task.

```text
candidate
→ ordinary mastering
→ adaptive finalization
→ selection
```

Selection no longer depends directly on ordinary mastering. It waits for the adaptive task, and its candidate selector requires:

```text
artifactRole = provider-candidate-alpha-master
qualityState = passed
finalizationReady = true
adaptiveFinalized = true
```

Ordinary mastering uses a tolerant lossless pre-adaptive profile so its diagnostic image and evidence are retained even when the candidate fails. Strict final delivery optimization occurs only within the adaptive stage.

## Repair evidence under strict profiles

A guarded worker preflights the candidate before applying a strict delivery profile. When decoded QA still fails, the evidence path is rerun through the lossless sprite profile so the worker can persist:

- the rejected finalized candidate;
- the hostile-background proof;
- adaptive finalization evidence;
- a machine-readable repair plan;
- the exact failing gate IDs and disposition.

The candidate remains rejected and cannot enter selection.

## Family proof

Automatic family verification is wrapped by an adaptive lineage guard. Every selected frame and layer must descend within a bounded immutable lineage to:

- one adaptive-finalized candidate;
- `finalizationReady=true`;
- `qualityState=passed`;
- one verified passed hostile-background proof artifact.

After ordinary family verification succeeds, the worker stores:

```text
artifactRole = sprite-family-adaptive-proof-evidence
qualityState = passed
releaseReady = true
```

This artifact records every selected source, adaptive candidate and proof artifact ID. The automatic supervisor requires its role at release, alongside the existing family and finalization evidence.

## Background strategy

Adaptive cleanup does not replace the governed background policy.

- `native-alpha`: only for an explicitly verified adapter and still subject to decoded alpha and fake-transparency proof;
- `green-matte`: used when green has lower collision with the approved project palette;
- `magenta-matte`: used when magenta has lower collision;
- `black-additive`: restricted to particles, effects, decals and emission-owned assets;
- `opaque-preserve`: requires an actually opaque source;
- `auto`: resolves among the appropriate choices using the art-direction and provider contract.

## 2.5D and 3D references

Pre-rendered 2.5D families may bind an exact EVAVO 3D Studio revision and immutable artifacts for:

- render rig;
- camera manifest;
- material reference;
- direction renders;
- depth renders;
- normal renders;
- turntable views.

Adaptive finalization does not alter those structural references. Family verification still enforces the fixed model, camera, lighting, materials, proportions, direction coverage and registration contract.

## Interfaces

The existing automatic finalization surfaces now compile the adaptive graph:

```text
automatic-sprite-finalization-protocol
automatic-sprite-finalization-validate
automatic-sprite-finalization-compile
automatic-sprite-finalization-start
```

REST and MCP remain compile-only. Explicit CLI or authenticated runtime submission starts the durable supervisor. Provider credentials remain available only to provider workers.

## Release rule

A release cannot succeed unless all of these are true:

- every required candidate passed adaptive finalization;
- every selected family source has proof-backed adaptive lineage;
- the complete family passed its existing frame, layer, timing, identity and consistency gates;
- the family adaptive-proof evidence artifact exists and verifies;
- no selected artifact is rejected;
- quality thresholds were not relaxed;
- the supervisor's other release roles and any configured named-human approval are complete.
