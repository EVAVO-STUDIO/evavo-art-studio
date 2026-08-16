# Asset Fabricator multi-view reference handoff

This handoff is the governed Art Studio entry into EVAVO 3D Studio for new geometry. It packages a coherent multi-view reference set, artistic intent, production constraints, dimensions, anchors, provenance, and material intent without claiming that a 3D provider, Blender, texture baker, or runtime importer has executed.

## Required view closure

Every asset requires independent front, back, left, right, and three-quarter images. Vehicles, architecture, environment pieces, environment kits, and terrain also require a top view. Detail, concept, material, and turntable references may be supplied in addition to the canonical views.

Each reference retains:

```text
reference ID
absolute source path
byte length
SHA-256
media type
view
production role
rights status
notes
```

The compiler rejects duplicate IDs, missing canonical views, unsupported image formats, unsafe file sizes, malformed rights, unknown roles, and source-byte drift.

## Production intent

The handoff binds:

```text
art direction and silhouette
palette and detail strategy
triangle and component budgets
topology and manifold policy
OpenPBR or metallic-roughness material intent
OpenGL normal convention
AO / roughness / metalness / mask packing
rig type, bone and influence limits
animation and blendshape intent
delivery targets and compression
target dimensions in metres
named anchor positions
```

The packing contract is fixed to:

```text
R = ambient occlusion
G = roughness
B = metalness
A = mask
```

## Compile and verify

```powershell
node scripts/game-art-production/asset-fabricator-reference-handoff.mjs `
  compile request.json `
  --output reference-handoff.json

node scripts/game-art-production/asset-fabricator-reference-handoff.mjs `
  verify reference-handoff.json
```

The output is deterministic. Its `handoffSha256` covers the entire semantic document, while every retained source file is independently byte-bound.

## Downstream route

```text
Art Studio reference handoff
        ↓
3D Studio reference-to-brief compiler
        ↓
provider candidate generation and comparison
        ↓
Asset Doctor / managed Blender finishing
        ↓
semantic material bake and assembly
        ↓
optional Particle Studio imported-anchor VFX
        ↓
Godot reviewed-candidate admission
```

No automatic creative approval, 3D generation, texture bake, material assembly, repository mutation, deployment, publication, or runtime admission is granted by this handoff.
