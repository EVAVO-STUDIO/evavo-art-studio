# Asset Fabricator material handoff

Art Studio now exports one source-recomputable material envelope for Asset Fabricator. It binds the exact procedural material program bytes, asset identity, slot patterns, graph identities and the complete semantic output closure.

Each binding carries:

```text
base colour
height
OpenGL normal
roughness
metalness
ambient occlusion
curvature
thickness
wear mask
dirt mask
damage mask
```

The downstream packing rule is fixed:

```text
R = ambient occlusion
G = roughness
B = metalness
```

## Compile

```powershell
node scripts/game-art-production/asset-fabricator-material-handoff.mjs compile request.json `
  --output material-handoff.json
```

The request identifies the existing procedural material program and provides explicit material, graph and imported-slot bindings. Compilation does not call an image provider, bake textures, assemble Blender materials, mutate another repository, approve art or admit a runtime asset.

## Verify

```powershell
node scripts/game-art-production/asset-fabricator-material-handoff.mjs verify material-handoff.json
```

Verification rejects source-contract drift, duplicate material IDs, missing semantic channels, DirectX normals, incorrect ORM packing, payload tampering and authority escalation.
