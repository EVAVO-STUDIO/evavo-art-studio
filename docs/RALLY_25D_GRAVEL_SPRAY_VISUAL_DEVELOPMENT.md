# Gravel-spray visual-development jobs

The gravel-spray slice is the next required VFX dependency in the Rally 2.5D playable program. It compiles twelve independent one-image jobs covering contact shape, speed and slip response, crosswind behaviour, three stone silhouettes, one warm dust-support sprite, impact punctuation and late decay.

Every job emits one transparent `2048 × 2048` PNG with a deterministic job hash, idempotency key, dependency list, unique working path and unique master path.

The effect language keeps discrete pebbles readable from the fixed gameplay camera. Heavy stones retain short ballistic arcs while only fine chips and dust respond strongly to wind. The contract forbids opaque smoke walls, giant rocks, baked vehicle or road silhouettes, hard rectangular alpha edges, contact sheets and multi-panel layouts.

The compiler prepares provider-ready jobs only. It cannot execute an image provider, approve a candidate, mutate pixels, assemble a sheet, change a downstream repository, commit generated art, deploy or publish. Exact rendered bytes still require the established named-human approval and source-admission boundary before 3D or runtime production.

## Validate

```powershell
node --test scripts/game-art-production/rally-25d-gravel-spray-jobs.test.mjs

node scripts/game-art-production/rally-25d-gravel-spray-jobs.mjs compile `
  config/game-art-production/vfx/gravel-spray-production-v1.json `
  --output C:\Temp\gravel-spray.provider-session.json

node scripts/game-art-production/rally-25d-gravel-spray-jobs.mjs verify `
  C:\Temp\gravel-spray.provider-session.json
```
