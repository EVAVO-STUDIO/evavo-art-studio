# Layered production art

Layered production art is the Art Studio boundary between exploratory concept work and source artwork that may eventually enter a game.

A concept image may communicate mood or composition. It is never accepted as a runtime source merely because it looks attractive. Runtime source work must be decomposed into exact, independently reviewable PNG units with one layer role, one native canvas, one alpha policy, one style identity and one runtime destination.

The compiler lives in `@evavo/art-direction` and is exposed through the Art Studio MCP.

## Problem this contract prevents

Image providers naturally tend to solve a broad game-art prompt by making one impressive presentation image. That behaviour is useful for exploration and harmful for production. A flattened concept image commonly contains:

- ground, route, architecture, props, characters, effects and UI in one raster;
- inconsistent pixel density and camera geometry;
- attractive but generic modern rendering;
- pseudo-text and fabricated signage;
- content that cannot be isolated, animated, repaired, Y-sorted or assembled in Godot;
- no reliable alpha, pivot, continuity or provenance boundary.

The layered production compiler rejects that task shape before a provider is called.

## Runtime-source invariants

Every valid request must retain all of these protections:

```text
oneImagePerProviderJob = true
oneLayerRolePerSourceUnit = true
conceptArtAsRuntimeSourceForbidden = true
collagesAsRuntimeSourceForbidden = true
contactSheetsAsRuntimeSourceForbidden = true
readableGeneratedTextForbidden = true
automaticAssemblyForbidden = true
automaticPromotionForbidden = true
humanApprovalRequired = true
styleProofApprovalRequired = true
maximumProviderImagesPerJob = 1
```

The provider job created for a source unit always says:

- runtime source, not concept art;
- return exactly one image;
- own exactly one named layer role;
- exclude every other layer role;
- use exact native dimensions and the declared alpha policy;
- preserve fixed camera, projection, light, palette and pixel density;
- prohibit complete scenes, screenshots, sheets, grids, collages, storyboards, labels, watermarks and generated readable text;
- remain a candidate until named human approval.

## Style identity instead of generic “pixel art”

A production request cannot rely on a short style phrase. It must declare:

- authored era and rendering mode;
- exact projection and fixed camera;
- fixed lighting and shadow direction;
- indexed/RGB palette budget and local colour budget;
- deliberate cluster, dithering, outline, gradient and texture-noise rules;
- material vocabulary;
- line rules;
- composition rules;
- at least three distinctive project motifs;
- at least six prohibited modern traits;
- at least four prohibited generic traits;
- rights-labelled references when references are bound.

For pixel production, antialiasing, subpixel motion, changing pixel density and random microtexture are fail-closed.

## Layer model

The compiler supports these governed roles:

```text
ground-base
route-base
architecture-back
destination-structure
world-prop
crowd-character
player-character
foreground-occlusion
ambient-effect
route-highlight
ui
custom
```

A layer declares:

- unique ID and unique Z order;
- opaque, transparent or mixed alpha;
- full-canvas, positioned, tilemap or Y-sorted assembly;
- optional dependencies on lower layers;
- exclusive include and exclude lists;
- one or more source units.

A source unit declares:

- one unit kind: full-canvas layer, sprite, animation frame, tile or overlay;
- exact native dimensions;
- optional integer placement, pivot and Y-sort origin;
- one continuity key;
- exact filename and repository-relative runtime target;
- frame metadata where the unit is one animation frame;
- unit-specific include and exclude rules.

Full-canvas units must exactly match the source canvas and assemble at `(0,0)`. Y-sorted sources require a pivot and Y-sort origin. Sprite and animation-frame sources cannot use an opaque layer policy.

## Style proof gate

A large campaign may not begin from an unapproved text prompt.

Each plan declares a small proof set. The proof must:

- contain at least three units;
- span at least three layers;
- include an opaque base;
- include an animation frame when the plan contains animation;
- remain within the declared pre-approval unit limit.

The compiled plan remains `approval-required`. While that status is pending, Art Studio will retrieve provider jobs only for the declared proof units. Every non-proof unit fails closed. Expansion unlocks only when the request binds a named reviewer, UTC review time, exact proof-unit set and lowercase SHA-256 evidence receipt.

## Review requirements

Every source unit receives a deterministic review plan:

```text
1x native isolated
2x nearest isolated
black/white/checkerboard alpha proof or opaque coverage proof
palette histogram and unexpected-colour proof
pixel-cluster and edge map
composite with approved lower layers only
neighbour flicker/onion skin for animation
```

Blocking review covers:

- dimensions and file identity;
- exclusive layer ownership;
- absence of collage/sheet/grid/concept presentation and pseudo-text;
- fixed camera, light, projection, palette and pixel density;
- absence of antialiasing, soft gradients, bloom and AI microtexture noise;
- correct alpha or opaque coverage;
- project-specific motifs and anti-generic rules;
- pivot, ground contact and animation continuity where applicable;
- named human approval for the exact source hash.

A review composite is a derivative proof. It is never promoted as the source of truth.

## MCP tools

The main Art Studio MCP exposes:

```text
layered_production_protocol
validate_layered_production_request
compile_layered_production_plan
get_layered_production_unit
compile_layered_production_provider_request
```

`get_layered_production_unit` is the normal provider-facing retrieval path. It returns one exact one-image job rather than a flattened scene prompt.

`compile_layered_production_provider_request` binds any required approved artifact references, converts the exact unit into the existing `@evavo/art-providers` candidate schema, and runs the provider-neutral contract compiler. Identity-master proof units need no prior character reference. Later character frames fail closed until a required `canonical-identity` artifact is supplied. Candidate count remains exactly one and quality is locked to `high`.

These tools are planning and retrieval only. They do not execute a provider, assemble a composite, approve art, mutate a target repository, commit, push or publish.

## JONEZ style-proof fixture

The canonical fixture is:

```text
config/jonez-layered-production-style-proof.v1.json
```

It proves the new workflow with separate JONEZ market-district sources:

```text
opaque ground base
transparent route base
transparent rear architecture
isolated destination buildings
Y-sorted player animation frames
isolated fountain animation frame
```

The fixture locks:

- `320x200` native district source canvas;
- `960x600` logical living-city world;
- DOS VGA 4:3 correction;
- one image per provider call;
- fixed dimetric camera and lighting;
- indexed scene and local colour budgets;
- manual pixel clusters and no gradients/noise;
- blank sign fields for authored fonts/live text;
- style-proof approval before expansion.

It is deliberately a small vertical slice. Once it passes, the same grammar can expand to ground districts, route overlays, buildings, props, crowds, player/rival animation, foreground occlusion, ambient effects, location interiors and UI as separate governed families.

## Intended production chain

```text
layered production request
-> deterministic plan and style fingerprint
-> exact one-image unit retrieval
-> required continuity artifact binding
-> provider-protocol compilation
-> governed provider candidate
-> isolated native-scale and alpha review
-> named human source approval
-> approval-gated composite/atlas/TileSet/SpriteFrames derivation
-> Godot integration
-> current-head runtime capture and human release review
```

This compiler complements the existing per-asset art-direction and sprite-planner contracts. It does not replace their frame timing, pivot, atlas, Aseprite or Godot resource planning. It adds the missing scene-level source decomposition and provider-job discipline before those downstream systems operate.
