# Timber Bridge visual-development jobs

The timber bridge is the third production asset in the Rally 2.5D playable dependency graph. Its visual-development contract compiles ten independent one-image jobs covering identity, orthographic construction, underside structure, materials, progressive damage and detachable modules.

## Job sequence

```text
dry identity
  -> wet continuity
  -> front, side and top orthographic references
  -> underside beam and support reference
  -> dry/wet material reference
  -> stressed damage
  -> critical damage
  -> detachable rail and deck modules
```

Each job emits one `2048 × 2048` PNG with its own deterministic hash, idempotency key, dependency list, working path and master path. Transparent modeling and breakable-part references remain individual images rather than contact sheets.

## Style and construction contract

The bridge remains an original weathered single-lane forest rally structure with consistent:

- deck width and span length;
- longitudinal and cross-beam hierarchy;
- support spacing;
- plank rhythm;
- railing dimensions;
- restrained metal fasteners;
- fixed-isometric readability;
- dry, wet, stressed and critical visual continuity.

The specification rejects modern concrete motorway bridges, real branding, photogrammetry noise, unreadable text, baked directional shadows, combined layouts and unrelated second structures.

## Authority boundary

The compiler prepares provider-ready jobs only. It does not execute an image provider, approve creative output, mutate PNGs, assemble sheets, change downstream repositories, commit generated art, deploy or publish.

Approved rendered bytes must still pass the established Art Studio admission and named-human approval boundary before 3D production.

## Validate

```powershell
node --test scripts/game-art-production/rally-25d-timber-bridge-jobs.test.mjs

node scripts/game-art-production/rally-25d-timber-bridge-jobs.mjs compile `
  config/game-art-production/structures/timber-bridge-production-v1.json `
  --output C:\Temp\timber-bridge.provider-session.json

node scripts/game-art-production/rally-25d-timber-bridge-jobs.mjs verify `
  C:\Temp\timber-bridge.provider-session.json
```
