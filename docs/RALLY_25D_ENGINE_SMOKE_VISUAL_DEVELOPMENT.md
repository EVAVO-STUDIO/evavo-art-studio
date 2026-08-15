# Rally 2.5D Engine Smoke visual development

Engine Smoke is a governed Art Studio source family for persistent vehicle VFX. It is not a generic cloud image and it does not decide that an engine is damaged.

The specification compiles twelve separate transparent 2048 x 2048 jobs covering one stable plume identity, clean idle and throttle states, worn, damaged and critical density, low and high RPM cadence, crosswind response, two isolated particle cards and late decay.

Every job retains its own output path and deterministic idempotency key. Contact sheets, vehicle silhouettes, road scenes, fire, explosions, opaque rectangles and automatic assembly are prohibited. The two particle-card jobs exist so Particle Studio and 3D Studio can consume reviewed alpha sources without extracting a sprite from a composite image.

```powershell
node scripts/game-art-production/rally-25d-engine-smoke-jobs.mjs compile `
  config/game-art-production/vfx/engine-smoke-production-v1.json `
  .art-studio/engine-smoke-session.json

node scripts/game-art-production/rally-25d-engine-smoke-jobs.mjs verify `
  config/game-art-production/vfx/engine-smoke-production-v1.json `
  .art-studio/engine-smoke-session.json
```

The compiler and verifier do not execute an image provider, mutate source images, approve art, assemble an atlas, write another repository, deploy or publish. Named-human creative approval remains required before a generated source can enter a downstream material or runtime bundle.
