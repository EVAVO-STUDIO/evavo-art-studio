# Rally 2.5D art production

This production binding turns the isometric rally game into a governed Art Studio project instead of a loose collection of prompts.

## Profile and project

- Profile: `isometric-rally-1990s-25d`
- Project: `isometric-rally-1990s`
- Runtime repository: `EVAVO-STUDIO/godot-462-isometric-rally`
- 3D production repository: `EVAVO-STUDIO/evavo-3d-studio`
- Art handoff: `evavo.rally-art-handoff.v1`
- Runtime bundle: `evavo.rally-runtime-asset-bundle.v1`
- Rendering model: `high-definition-stylized-raster`
- Texture filtering: `linear`
- Authoring scale: governed `uniform` scaling

The profile covers vehicle concepts, turnarounds, material references, damage references, environment keys, modular structures, props, terrain materials, crowd characters, fauna, effects and shader look development.

## Automated handoff

```powershell
node scripts/game-art-production/rally-25d-handoff.mjs `
  vehicle `
  falcon-rally `
  falcon-rally-production-v1 `
  "Create the canonical player rally car with readable detachable panels and 1990s arcade styling."
```

A vehicle handoff compiles four deterministic Art Studio work orders:

1. shape-language concept
2. orthographic modeling turnaround
3. UV and material reference
4. rig and damage reference

Every work order carries an explicit rendering contract into the handoff, including the Art Studio protocol version, rendering model, image format, texture filtering and authoring-scale policy. The 3D compiler rejects handoffs that lose or coerce those fields.

Environment, structure, prop, character, fauna and VFX families compile their own bounded deliverable sets. Each work order remains one asset per output and retains the named-human approval lifecycle.

## Visual direction

The production target is stylized 3D with a 2D visual language:

- strong isometric silhouettes
- broad value and color groups
- restrained texture noise
- clear road, shoulder and hazard reading
- smooth wheel, steering and suspension motion- physically legible debris and effects
- no modern hyper-real material clutter

Art Studio owns concept, palette, texture-reference, damage-look and VFX-shape authority. It does not execute 3D generation, mutate the 3D repository, import into Godot, approve assets, deploy or publish.

## Validation

```powershell
node scripts/game-art-production/profile-cli.mjs verify
node --test scripts/game-art-production/rally-25d-handoff.test.mjs
```

Successful compilation is deterministic: identical governed inputs produce the same project, work-order and handoff hashes.
