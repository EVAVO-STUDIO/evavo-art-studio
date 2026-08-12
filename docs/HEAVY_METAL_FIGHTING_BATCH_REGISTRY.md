# HEAVY METAL FIGHTING — Exact Production Batch Registry

Status: deterministic production-queue authority  
Project: **HEAVY METAL FIGHTING**  
Technical game repository: `steel-dominion`  
Registry schema: `evavo.heavy-metal-fighting-production-batch-registry.v1`

## Purpose

The Art Studio workspace, style contract and ten-image policy define *how* final art is made. The production batch registry defines the exact bounded work queue.

It does **not** duplicate the campaign asset inventory. Instead it compiles from the existing authorities every time:

- the governed legacy HMF campaign supplies the 677 supporting source-art work units;
- the combat-presentation contract supplies Pilot, Frame, arena, UI, FX and intro identity;
- the production-master-v3 sprite census replaces the old 480 compatibility body cels with 896 final 160 × 160 Frame body cels;
- the Art Studio workspace and style-authenticity contracts supply paths, review gates and authority boundaries;
- the batch-production policy supplies identity containment and the maximum ten-image boundary.

A registry whose authorities drift cannot silently remain "valid": recompilation changes its authority hashes and deterministic registry hash.

## Exact launch totals

```text
Supporting art source images       677
Production-master-v3 body cels     896
--------------------------------------
Total source images              1,573

Supporting governed batches         75
Frame-body governed batches        104
--------------------------------------
Total governed batches             179
```

Every batch receives a stable gapless identifier:

```text
hmf-b0001
hmf-b0002
...
hmf-b0179
```

The registry never pads a short batch. Every batch contains 1–10 actual work units.

## Body-cell coverage

Each launch Frame owns exactly 224 production body cels:

```text
0–38    neutral-locomotion
39–90   defence-reactions
91–111  throws
112–149 normals
150–191 specials-overdrive
192–223 core-entrance-result
```

Across:

```text
bastion
viper
citadel
mirage
```

that is exactly 896 unique body cels and 104 bounded batches.

Every body cel binds:

- Frame identity;
- production group;
- body bank and semantic purpose;
- exact 160 × 160 native dimensions;
- 640 × 640 authoring canvas;
- pivot `(80,152)`;
- ground line;
- transparent-alpha rule;
- continuity key;
- exact `working/` output path;
- exact eventual `masters/` path;
- deterministic-atlas-only runtime delivery;
- migration block preventing premature final promotion into the game.

## Supporting-art preservation

The supporting registry does not invent another list of UI, Pilot, Frame, FX, service-bay, arena or intro art.

It takes the already-compiled campaign units and preserves their:

- source unit id;
- dimensions;
- authoring canvas;
- alpha policy;
- pivot;
- continuity key;
- legacy delivery target;
- review preset;
- prompt hash;
- campaign-plan hash.

Those units are then **repacked** under the stricter final-production policy.

Identity-sensitive families are never mixed across a governed batch:

```text
pilot-portraits
frame-construction
frame-animation
frame-damage-overlays
frame-specific-fx
pilot-service-animation
```

This is why the 1,573 images need 179 governed batches rather than the raw mathematical minimum of 158.

## Workspace paths

Every registry unit has one unique `workspaceOutputPath` under `working/`.

Examples:

```text
working/pilots/branka-kovac/portraits/...
working/frames/bastion/construction/...
working/frames/bastion/sprites/normals/...
working/fx/frame/bastion/...
working/arenas/foundry-nine/play-plane/...
working/ui/service-bay/...
working/intro/cels/...
```

No registry output goes straight to `masters/` and no provider output is treated as a runtime deliverable.

## Style-proof wave

The registry marks a bounded first wave with:

```json
"productionWave": "style-proof"
```

It intentionally includes enough work to prove the visual language before mass production:

- HMF title/front-end shell;
- Branka Kovac identity portrait work;
- Bastion construction;
- Danube/service-bay launch infrastructure where present in the first service batches;
- Branka service/cockpit work;
- Foundry Nine;
- an initial universal impact batch;
- Bastion critical body windows;
- Bastion's Kiln Verdict FX batch.

Later body production requires:

```text
style-north-star-approved
frame-construction-approved
style-proof-approved
```

Style-proof body work omits the final `style-proof-approved` prerequisite by definition but still requires construction approval.

This makes the intended process explicit:

```text
STYLE AUTHORITY
→ PILOT IDENTITY
→ FRAME CONSTRUCTION
→ SERVICE / ARENA CONTEXT
→ BOUNDED BODY + FX PROOF
→ NATIVE / SILHOUETTE / STAGE REVIEW
→ NAMED-HUMAN STYLE-PROOF APPROVAL
→ FULL PRODUCTION
```

## Fail-closed verification

Registry compilation fails when any of the following occurs:

- total batch count is not 179;
- total unit count is not 1,573;
- body cells are not exactly 896;
- supporting units are not exactly 677;
- body batches are not exactly 104;
- supporting batches are not exactly 75;
- a batch exceeds ten outputs;
- numbered batch ids are not gapless;
- unit ids collide;
- workspace paths collide;
- an output escapes `working/`;
- an identity-sensitive batch mixes subjects;
- any Frame does not cover slots `0..223` exactly once;
- the bounded style-proof wave disappears;
- post-proof Frame production loses its approval gate;
- a dependency points forward;
- provider or repository-mutation authority is accidentally granted.

## Commands

Verify the registry:

```powershell
node scripts/heavy-metal-fighting-production-workspace.mjs registry-verify
```

Inspect the compact summary:

```powershell
node scripts/heavy-metal-fighting-production-workspace.mjs registry-summary
```

Emit the complete deterministic registry:

```powershell
node scripts/heavy-metal-fighting-production-workspace.mjs registry
```

Inspect one numbered batch:

```powershell
node scripts/heavy-metal-fighting-production-workspace.mjs registry-batch 1
node scripts/heavy-metal-fighting-production-workspace.mjs registry-batch hmf-b0001
```

Inspect one exact work unit:

```powershell
node scripts/heavy-metal-fighting-production-workspace.mjs registry-unit <unit-id>
```

## Authority boundary

The registry is planning and inspection authority only.

It cannot:

- call an image provider;
- approve candidates;
- promote candidates;
- mutate `steel-dominion`;
- assemble or publish a runtime atlas without approved masters;
- commit or push game art;
- publish a release.

Named-human approval remains mandatory at the production gates.

The point of the registry is not automation without control. It is to make automation exact enough that ChatGPT, Claude or another agent can execute one bounded batch at a time without losing the game's identity, production history or 1990s visual discipline.
