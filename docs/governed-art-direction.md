# Governed art direction

Status: implemented foundation

Protocol: `2026-07-31.1`

EVAVO Art Studio compiles art direction before provider work. The result is not a mood-board prompt. It is a deterministic production contract that fixes the visual language, projection, camera, palette, lighting, animation behaviour, sprite-shot ownership, separate layers, quality evidence and output requirements for one project asset.

## Why this layer exists

Model output changes when wording, model versions, provider defaults, reference ordering or generation context changes. A professional game-art pipeline cannot treat any one model response as the source of truth.

Art Studio therefore separates these concerns:

```text
project intent and repository context
→ governed art-direction contract
→ complete production plan
→ bounded provider frame or layer candidates
→ deterministic mastering and QA
→ family consistency verification
→ selection and repair
→ governed promotion
→ engine and delivery packaging
```

The compiled art-direction contract remains stable when providers change. A provider receives one bounded unit of work and no authority to reinterpret the whole game.

## Research basis

Aseprite stores the information that matters to a real sprite source package: canvas dimensions, colour mode, colour profile, layers, frame duration and cels. Tags group animations, linked cels deliberately share image and coordinate data, and slices can carry bounds and pivots. Art Studio retains equivalent information instead of treating one flattened sheet as the only source.

References:

- <https://www.aseprite.org/docs/sprite/>
- <https://www.aseprite.org/docs/linked-cels/>
- <https://www.aseprite.org/docs/slices/>
- <https://www.aseprite.org/docs/tags/>
- <https://www.aseprite.org/docs/sprite-sheet/>
- <https://www.aseprite.org/docs/color-mode/>
- <https://www.aseprite.org/docs/color-profile/>

Godot 4.6 has a dedicated 2D renderer and systems for sprites, animation, particles and tiles. `AnimatedSprite2D` consumes a `SpriteFrames` resource rather than requiring a provider-generated sheet to become authoritative. Art Studio therefore retains individual frames, exact durations and engine metadata before producing an atlas or Godot resource.

References:

- <https://docs.godotengine.org/en/4.6/tutorials/2d/index.html>
- <https://docs.godotengine.org/en/4.6/classes/class_animatedsprite2d.html>

## Package

```text
packages/art-direction
```

The package contains:

- strict request and normalized-contract types;
- preset definitions;
- output-profile definitions;
- preset-lock validation;
- project and world-scale validation;
- sprite and layer grammar;
- provider-boundary compilation;
- blocking quality-gate compilation;
- Godot delivery recommendations;
- deterministic request and contract hashes;
- compile-only durable job contracts.

The compile job is:

```json
{
  "queue": "control",
  "kind": "art.direction.compile",
  "requiredCapabilities": [
    "art-direction.compile",
    "style.preset.resolve",
    "output-profile.compile",
    "evidence.bundle"
  ]
}
```

It has no provider, promotion, repository-write or approved-reference authority.

## Production presets

Presets define production methods and constraints. They do not request imitation of a named artist or a specific commercial game.

```text
dos-rpg-1992
dos-strategy-1994
point-and-click-1993
console-platformer-16bit
isometric-rpg-1997
prerendered-2.5d-1996
dark-fantasy-pc-1998
engraved-monochrome-1871
```

A preset may lock:

- rendering mode;
- projection;
- palette mode;
- pixel-grid policy;
- antialiasing;
- subpixel movement;
- camera projection, yaw and pitch;
- lighting stability;
- historical era;
- outline and line treatment.

Supplying a conflicting value fails with `ART_DIRECTION_PRESET_LOCK_VIOLATION`. A model or user cannot quietly turn an indexed isometric project into a smooth perspective render while retaining the preset label.

## Project-specific style bible

A request supplies the information the preset cannot know:

- project and asset identity;
- game genre and platform;
- viewport and world scale;
- project-specific motifs;
- prohibited generic motifs;
- costume and material language;
- historical constraints;
- composition rules;
- approved identity, palette, material, motion, camera and historical references;
- rights notes for references;
- runtime variation requirements;
- output profiles.

The normalized style bible records:

```text
rendering mode
projection
palette and ramp budget
transparent index policy
pixel-grid and cluster policy
antialiasing and dithering
outline treatment
camera and mirroring
fixed lighting and shadow treatment
motion feel and exact timing
material and line language
composition rules
anti-generic constraints
approved references and rights
```

## Sprite-shot grammar

Every request is compiled into one production unit:

```text
one frame
one layer
one static asset
one tile
one cinematic frame
```

The shot contract declares:

- required visible content;
- excluded content;
- framing;
- full-motion or tile bounds;
- transparent safety padding;
- background ownership;
- pivot;
- baseline;
- Y-sort origin;
- tile footprint where applicable.

A provider may not turn one frame request into a contact sheet, multi-panel image, complete sprite sheet or scene containing unrelated content.

## Layer ownership

Art Studio chooses among:

```text
baked
separate-per-frame
linked-cel
static-family
engine-sidecar
guide-only
runtime-rig
```

A component becomes separate when it needs independent reuse, timing, repair, equipment variation, collision behaviour, blend mode, engine binding or occlusion control.

A component remains baked when separation would introduce joint seams, destroy pixel clusters, require invented hidden artwork, make cloth or anatomy mechanical, or add registration risk without a production benefit.

Supported roles include:

```text
identity-core
costume
hair
face
shadow
equipment
weapon
effect
emission
normal
collision
occlusion
guide
background
foreground
tile-mask
depth
```

Engine sidecars never enter visible colour artwork. Collision, normal, depth, guide and tile-mask information cannot be baked into the provider candidate.

## Isometric 2:1 production

`isometric-rpg-1997` requires exact project geometry:

```text
tileWidthPixels = tileHeightPixels × 2
```

A ratio mismatch fails with `ART_DIRECTION_ISOMETRIC_RATIO_INVALID` before any provider work.

The contract locks:

- fixed 2:1 projection;
- camera yaw and pitch;
- eight-direction order;
- integer pixel placement;
- no atlas rotation;
- ground pivot;
- Y-sort origin;
- tile footprint;
- separate cast shadow;
- direction-specific silhouettes;
- explicit collision and occlusion sidecars.

Asymmetric characters and held items cannot use unrestricted mirroring. East and west direction masters must be authored independently when clothing, equipment or handedness differs.

## Pre-rendered 2.5D production

`prerendered-2.5d-1996` treats the render scene as part of the source package.

The family must bind one stable:

- model;
- skeleton and animation;
- material set;
- camera;
- orthographic settings;
- lighting rig;
- render settings;
- reduction pipeline;
- alpha-mastering process;
- normal, depth and emission sidecar policy.

The `render-rig-lock` quality gate blocks a family when any of those inputs changes between related frames or directions.

The rendered source is not final. It must still pass alpha mastering, edge decontamination, frame geometry, family continuity and engine-import verification.

## Pixel-art quality contract

Pixel-art presets compile additional blocking evidence:

- deliberate cluster structure;
- no accidental antialiasing;
- no half-pixel placement;
- stable indexed palette or declared RGB policy;
- silhouette continuity;
- controlled staircase contours;
- safe transparent bounds;
- stable pivots and baselines;
- exact frame timing;
- no undeclared duplicate frames;
- loop closure when required.

Warnings identify banding, pillow shading, tangent clusters, noisy dithering and random single-pixel detail. These are not solved by adding a negative prompt; they require measured review and, when necessary, a targeted frame or layer repair.

## Anti-generic-art contract

The compiler combines project-specific requirements with preset rules. It can prohibit:

- generic ornamental filler;
- unrequested props;
- random straps and pouches;
- random glowing accents;
- watermarks and readable text;
- modern glossy rendering;
- random micro-detail;
- camera and lighting drift;
- independent frame redesign;
- modern intrusions in a historical project.

It also requires explicit distinctive motifs. The result must look like the project, not merely like a broad genre label.

## Output profiles

```text
godot-4.6.2-character-sprite
godot-4.6.2-isometric-character
godot-4.6.2-tile-atlas
godot-4.6.2-particle-flipbook
godot-4.6.2-ui-pixel
godot-4.6.2-2.5d-billboard
web-game-raster
cinematic-frame-sequence
print-illustration-master
```

Each output profile defines:

- compatible asset families;
- transparency requirement;
- authoritative master formats;
- derivative formats;
- texture filtering;
- atlas permission;
- rotation policy;
- padding and extrusion;
- trim policy;
- source retention;
- engine metadata;
- import recommendations.

A profile incompatible with the requested family fails before production. A transparency-required profile cannot be paired with an explicitly opaque asset.

## Godot 4.6.2 delivery

Godot delivery can recommend:

- `AnimatedSprite2D` plus retained `SpriteFrames` for authored frame animation;
- `Sprite2D` or `TextureRect` for static or UI work;
- sibling `TileMapLayer` and sprite nodes under a Y-sorted parent for isometric worlds;
- exact direction tags and frame durations;
- `AtlasTexture` regions and trim margins;
- nearest filtering and integer placement for pixel art;
- no atlas rotation for directional art;
- separate collision, occlusion, normal, depth and emission metadata;
- particle flipbook dimensions, lifetime mapping and blend mode.

The packed atlas remains a derivative. Individual frames, editable layers, animation tags, pivots, baselines and timing remain the source of truth.

## Interfaces

### Web

The public control plane includes a same-origin art-direction workbench:

```text
POST /api/art-direction
```

It accepts at most one megabyte of JSON and returns the compiled contract and compile-only durable job. It does not call a provider or mutate artifacts.

### CLI

```powershell
pnpm art -- art-direction-protocol
pnpm art -- art-direction-presets
pnpm art -- art-direction-outputs

pnpm art -- art-direction-validate `
  --input .\examples\art-direction-isometric-character.json

pnpm art -- art-direction-compile `
  --input .\examples\art-direction-isometric-character.json `
  --output .\art-direction.compiled.json
```

### REST

```text
GET  /v1/art-direction-protocol
GET  /v1/art-direction-presets
GET  /v1/art-direction-output-profiles
POST /v1/art-directions/validate
POST /v1/art-directions/compile
```

### MCP

```text
art_direction_protocol
list_art_direction_presets
list_art_direction_output_profiles
validate_art_direction_request
compile_art_direction_contract
```

REST and MCP are compile-only. They cannot read project image artifacts, execute a provider, update an approved reference or run a shell command.

## Examples

```text
examples/art-direction-isometric-character.json
examples/art-direction-isometric-tile-atlas.json
examples/art-direction-prerendered-2.5d-creature.json
examples/art-direction-engraved-1871-cinematic.json
```

The examples demonstrate:

- eight-direction isometric character production;
- exact 2:1 tile geometry and TileSet sidecars;
- fixed-rig pre-rendered 2.5D production;
- historically governed monochrome cinematic production.

## Release boundary

A compiled art-direction contract does not approve artwork. It authorises only a later bounded production attempt.

Before an asset may become a released master it must still pass:

1. provider or authored candidate creation;
2. transparency and edge mastering;
3. frame QA;
4. complete layered-family verification;
5. model-assisted evidence when the policy requires it;
6. deterministic selection or named-human review;
7. governed promotion;
8. atlas, Godot, web, cinematic or print delivery validation;
9. final evidence and hash bundling.

The project style bible should be promoted as an immutable approved artifact in a later slice. Every provider request, family manifest, repair packet and delivery package should then bind its exact art-direction contract artifact and hash rather than copying style prose independently.
