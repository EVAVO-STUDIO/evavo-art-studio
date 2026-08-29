# Command Front — Operation Breakwater Art Studio Profile

This profile specialises EVAVO Art Studio for the first production vertical slice of `EVAVO-STUDIO/command-front`.

## Source authority

Binding consumer manifest:

`command-front/data/production/operation_breakwater_asset_manifest.json`

Binding visual direction:

`command-front/docs/design/COMMAND_FRONT_1999_CREATIVE_BIBLE.md`

Art Studio remains the mastering, continuity, alpha, atlas and Godot-delivery authority for final 2D runtime assets. 3D Studio may provide approved source renders, but a GLB is not the Command Front runtime visual target.

## Fixed gameplay camera

Every baked gameplay asset must be reviewed against one fixed isometric camera family. Do not independently choose camera elevation, focal character, perspective strength or light direction per asset.

Requirements:

- orthographic presentation;
- no perspective exaggeration;
- stable ground plane and baseline;
- shared light direction;
- shared shadow direction and softness;
- asset scale judged at Command Front gameplay zoom;
- nearest-neighbour review at the real low-resolution battlefield presentation.

## Direction sets

Minimum authored runtime sets:

- infantry: 8 directions;
- vehicles: 16 preferred, 8 only with explicit review approval;
- aircraft: 8 minimum;
- rotating vehicle turrets/weapon mounts: independent direction authority when the gameplay model rotates them separately.

Direction order must be stable and machine-readable. Missing directions fail closed; they must not be silently mirrored when asymmetry, markings, weapons or damage make mirroring incorrect.

## Breakwater first batch

Priority runtime families:

1. Meridian rifle team;
2. Meridian combat engineer;
3. Meridian M12-class IFV;
4. Meridian M90-class main battle tank;
5. Vesper rifle cell;
6. Vesper RPG cell;
7. Vesper armed technical;
8. Vesper captured battle tank;
9. civilian oil facility;
10. civilian communications tower;
11. civilian urban block;
12. civilian field clinic;
13. main canal bridge;
14. desert/coastal terrain kit.

## Unit mastering

Every gameplay unit package requires:

- transparent lossless masters;
- canonical pivot and ground-contact point;
- team-colour mask where applicable;
- separate ground shadow unless the approved source deliberately bakes it;
- stable crop bounds across directions and animation states;
- state and direction manifest;
- exact frame durations;
- selection footprint sidecar;
- corpse or wreck state;
- hostile-background alpha proof;
- gameplay-scale proof sheet.

Vehicles with independently rotating turrets should use separately mastered hull and turret families when that reduces atlas waste and preserves rotation fidelity.

## Building mastering

Base structures require construction, intact, active where applicable, two damage bands and destroyed rubble.

Capturable civilian structures additionally require clearly readable neutral, Meridian-controlled and Vesper-controlled states without repainting the entire building in faction colour. Ownership should read through flags, identification panels, lights, guards, signage inserts or restrained trim.

The civilian urban block must include a garrisoned state and readable firing-port/occupied cues. The bridge must provide intact, damaged and destroyed output matching the gameplay footprint exactly.

## Terrain

Terrain is authored as tile and overlay families, not photographic aerial texture crops.

Breakwater first kit:

- desert sand;
- deep water;
- shoreline;
- hard road;
- industrial concrete;
- urban ground;
- dust, oil stain, cracks, road wear, rubble and dock debris overlays.

Tile QA must include seam proof, neighbour transitions and representative 4×4/8×8 map assemblies rather than evaluating isolated tiles only.

## Palette and finish

The desired result is polished late-1990s rendered RTS art, not modern PBR reduced to low resolution.

Prefer:

- deliberate value grouping;
- readable silhouettes;
- restrained material highlights;
- controlled palette compression;
- selective texture detail;
- crisp shapes at gameplay scale;
- slight rendered/pre-baked character.

Reject:

- glossy modern vehicles;
- noisy micro-textures;
- photographic ground detail;
- AI-soft edges;
- inconsistent camera/light direction;
- painted transparency grids;
- generic modern mobile-game rendering.

## Delivery

Final delivery should use Art Studio's existing deterministic atlas and Godot SpriteFrames tooling. Production assets remain unapproved until normal Art Studio ranking, alpha, crop, sequence, provenance and promotion gates pass.
