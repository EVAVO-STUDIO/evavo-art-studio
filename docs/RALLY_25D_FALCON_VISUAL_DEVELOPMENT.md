# Falcon Rally visual-development jobs

The Falcon player car is the first production asset in the Rally 2.5D vertical slice. Its visual-development specification expands the existing four-role Art handoff into twelve individual provider jobs that can be generated, reviewed, repaired and approved without asking an image provider for a contact sheet or a multi-car composition.

## Production sequence

```text
identity master
  -> continuity hero view
  -> front, left, rear and top orthographic sources
  -> painted-body and glass/rubber/metal material sources
  -> scraped and critical damage sources
  -> mechanical wheel/suspension source
  -> detachable-parts source
```

Each job requests exactly one PNG and retains a unique working and master path. Orthographic and mechanical references require true transparency; hero, material and damage views use the governed neutral-matte ground.

The identity jobs lock the original wide-track three-door hatch silhouette, wheelbase, track width, panel geometry, livery, palette and material language. Downstream jobs explicitly depend on those masters so a provider adapter can supply the relevant approved source images as continuity references.

## Compile and verify

```powershell
node scripts/game-art-production/rally-25d-falcon-jobs.mjs compile `
  config/game-art-production/vehicles/falcon-rally-production-v1.json `
  --output .art-output/falcon-rally.provider-session.json

node scripts/game-art-production/rally-25d-falcon-jobs.mjs verify `
  .art-output/falcon-rally.provider-session.json
```

The result is a deterministic `evavo.rally-falcon-provider-job-session.v1` document with one job SHA-256, one idempotency key and one output pair per image.

## Authority boundary

The compiler does not call an image provider, read or mutate image bytes, approve creative work, assemble a sheet, modify another repository, commit, push, deploy or publish. Provider execution and named-human approval remain explicit follow-on transactions.
