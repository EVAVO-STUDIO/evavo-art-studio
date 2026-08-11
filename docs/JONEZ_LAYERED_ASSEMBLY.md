# JONEZ layered district assembly

JONEZ is authored as a living 1990s DOS/VGA city assembled from separate runtime-source images. A polished concept image may establish direction, but it is never the source texture for the playable city.

The production path is:

```text
layered-production request
→ one source PNG per exclusive layer unit or animation frame
→ isolated review
→ style-proof review composite
→ named human approval and content-addressed receipts
→ layered assembly manifest
→ reviewed Godot scene integration
```

The assembly compiler does not generate, edit, composite, approve, copy, promote, commit, push, or publish art. It compiles and verifies the logical contract that a later integration process must follow.

## Why the assembly manifest exists

Separate images are only useful when they can be put back together without guessing. The manifest binds each retained source to:

- the exact self-hashed layered-production plan;
- its production unit, layer role, dimensions, alpha policy, artifact SHA-256, and byte count;
- a district-local integer position and exact translated world position;
- its static, baked, dynamic, or overlay placement mode;
- an animation set where a runtime source has multiple frames;
- an optional route node, instance group, or foreground occlusion group;
- deterministic output paths for route data, placements, scene integration, and review evidence.

This prevents a flattened AI-looking scene from entering the game as a shortcut around real ground, route, architecture, structures, actors, effects, and foreground layers.

## Two scopes

### `style-proof-review`

This scope may use only the units declared in the pending style proof. Every source remains a candidate. It is intended to prove that the approved camera, palette, pixel grammar, linework, architecture, character scale, and layer separation work when viewed together.

The resulting composite is review evidence only. It is explicitly not a runtime source.

### `runtime-candidate`

This scope requires an approved layered-production plan. Every source requires a content-addressed source artifact and a content-addressed approval receipt. Animation frames must be grouped into complete clips with exact frame numbers, timing, pivots, and Y-sort origins.

A runtime-candidate manifest is still planning evidence. It does not itself mutate the Godot repository or grant final approval.

## JONEZ district model

The canonical proof uses a `320×200` native district inside a `960×600` logical city. District art retains DOS VGA 4:3 correction and nearest-neighbour presentation.

The proof assembly contains independent source bindings for:

1. opaque ground base;
2. transparent board-route base;
3. transparent rear architecture;
4. one destination structure;
5. one Y-sorted player animation sample;
6. one ambient fountain animation sample.

Later production expands the same structure with props, crowds, foreground occluders, route highlights, additional destinations, complete actor clips, and complete ambient animation clips.

## Logical route graph

Gameplay is never inferred from painted pixels. The manifest declares:

- path, junction, destination, and transition nodes;
- one-way or bidirectional edges;
- explicit integer travel costs;
- a reachable start node;
- destination IDs, entrances, interaction IDs, target scenes, and optional structure placements.

Every node must be reachable from the start under the declared edge directions. Duplicate links, self-links, unknown endpoints, missing destination bindings, and disconnected branches fail closed.

This supports direct destination selection, clockwise/counter-clockwise route decisions, rival movement, saves, camera following, and future district expansion without relying on a dice mechanic or reading route logic from artwork.

## Camera contract

The assembly retains three views:

- **Overview:** complete district at native `1×`.
- **Journey follow:** integer zoom greater than the overview, an explicit dead zone, look-ahead, and at least one dynamic followed actor on the route start node.
- **Destination close:** bounded integer zoom with a deterministic transition-frame count.

No filtered fractional zoom is accepted. A wider city overview requires separately authored overview/LOD sources rather than scaling the district art into an unreadable miniature.

## Animation contract

A style proof may contain a deliberately partial animation set. Runtime-candidate assembly requires complete sets.

For every clip, the compiler verifies:

- exact frames `1..N`;
- identical frame dimensions;
- identical pivots and Y-sort origins;
- consistent FPS and loop policy;
- one continuity key and one layer;
- retained approved source evidence for every frame.

A runtime animation frame cannot be placed directly as though it were a complete actor or effect.

## Y-sort and occlusion

Dynamic actor placements require an exact ground-contact origin. Their sort position is calculated from the integer placement position plus the retained Y-sort origin.

Foreground elements are separate source placements. Each occlusion group binds:

- one foreground-occlusion placement;
- a baseline inside that placement;
- the player or crowd roles it may cover.

This allows actors to pass naturally behind awnings, trees, bridge rails, signs, and other foreground forms without flattening them into the background.

## Canonical fixture

The retained proof request is:

```text
config/jonez-layered-assembly-style-proof.v1.json
```

It compiles against:

```text
config/jonez-layered-production-style-proof.v1.json
```

The package API is:

```ts
const plan = compileLayeredProductionPlan(productionRequest);
const manifest = compileLayeredAssemblyManifest(plan, assemblyRequest);
verifyLayeredAssemblyManifest(manifest, plan);
```

ChatGPT or Claude can use the same compiler through the main Art Studio MCP server:

```text
layered_assembly_protocol
compile_layered_assembly_manifest
verify_layered_assembly_manifest
```

The compile tool accepts the layered-production request, this assembly request, and optional exact style-proof approval evidence. It returns one self-hashed manifest after semantic verification. The verify tool checks a retained manifest against the exact production plan. Provider execution, creative approval, image mutation, automatic assembly, game-repository mutation, commits, pushes, publication, and force-push remain outside these tools.

## Definition of done for one district

A district is ready for human integration review only when:

- every retained source matches an exact plan unit and content hash;
- all candidate-only proof blockers are cleared for runtime scope;
- full-canvas layers occur exactly once at `0,0`;
- every placed source remains inside the native district and logical world bounds;
- complete animation sets pass timing, frame-order, pivot, and Y-sort checks;
- route connectivity, travel costs, destinations, entrances, and scenes are valid;
- journey-follow starts on a real dynamic actor placement;
- foreground occlusion contracts are explicit;
- output paths remain repository-relative and inside the configured runtime root;
- the review composite remains evidence rather than source art;
- a named human approves the real integrated result in Godot.
