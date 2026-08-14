# Forest Rally visual-development jobs

The forest stage is the second executable production asset in the Rally 2.5D vertical slice. Its specification expands the existing environment handoff into fourteen independent provider jobs that preserve road, terrain, material and vegetation continuity without asking an image provider for contact sheets or multi-location compositions.

## Production order

```text
dry stage identity
  -> wet continuity identity
  -> road plan
  -> road cross-section
  -> dry dirt/gravel, wet mud/water, grass/ground and rock/bank materials
  -> conifer, deciduous and shrub/fern modeling references
  -> reusable road-edge module
  -> shallow creek crossing
  -> rain and fog look-development view
```

Every job produces exactly one 2048 × 2048 PNG. Orthographic/layout and isolated foliage references use true transparency; environment identities, material references and weather views retain one coherent image.

The compiler fixes the dependency graph, one-image contract, output paths, prompt, target dimensions, idempotency key and SHA-256 for every job. A submitted session is accepted only when it is the deterministic reconstruction of its retained visual-development specification.

## Style contract

The stage is an original premium 1990s arcade-rally environment rather than a photoreal forest scan. It uses broad hand-painted terrain groups, clear road shoulders, controlled material response, readable tree silhouettes and distinct dry, wet, mud and water states.

The specification forbids photogrammetry noise, hyper-real clutter, modern motorway infrastructure, baked directional shadows, contact sheets, multi-panel layouts and unrelated locations in one image.

## Execution boundary

The committed compiler creates provider-ready job metadata only. It does not call an image provider, approve a candidate, mutate source pixels, assemble images, alter the 3D Studio or game repositories, commit, push, deploy or publish.

Generated PNGs remain blocked from 3D production until their exact bytes and named-human approval receipts have passed the established Art Studio source-admission boundary.

## Validate

```powershell
node --test scripts/game-art-production/rally-25d-forest-jobs.test.mjs

node scripts/game-art-production/rally-25d-forest-jobs.mjs compile `
  config/game-art-production/environments/forest-stage-production-v1.json `
  --output C:\Temp\forest-stage.provider-session.json

node scripts/game-art-production/rally-25d-forest-jobs.mjs verify `
  C:\Temp\forest-stage.provider-session.json
```
