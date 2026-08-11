# Layered Godot 4.6.2 integration

The layered Godot integration compiler turns one verified layered-production plan and one verified district assembly manifest into deterministic Godot 4.6.2 handoff material.

It closes the gap between reviewed source art and target-repository implementation without granting Art Studio permission to write into the game repository, activate a scene, deploy a build, or publish anything.

## Inputs

The compiler requires:

1. The exact self-hashed layered-production plan.
2. The exact self-hashed layered assembly manifest compiled from that plan.
3. A Godot integration request naming the target repository paths, runtime scripts, renderer, root node, pixel policy, selected route actor, default camera mode, and output files.

The production plan must target `Godot` `4.6.2`. The integration runtime root must exactly match the production plan, and the scene, route, and placement output paths must exactly match the assembly manifest.

## Outputs

One integration plan retains seven exact-byte resource drafts:

- a Godot `format=3` `.tscn` scene draft;
- a route graph JSON resource;
- a placement and occlusion JSON resource;
- an animation-set JSON resource;
- a camera-mode JSON resource;
- an import and pixel-policy JSON resource;
- a content-addressed integration handoff manifest.

Each draft records its repository-relative path, media type, SHA-256, byte count, and complete UTF-8 content. The plan mirrors each draft into one bounded `create-or-replace` write intent. Those intents are data only. They require a separately authorised repository writer.

## Scene compilation

The TSCN draft keeps every retained PNG as a separate `Texture2D` external resource. It does not reference the assembly review composite.

Animation sets become `SpriteFrames` subresources with exact frame order, FPS, loop state, source unit identity, source hash, and target PNG path. Dynamic characters are placed at their declared ground-contact origin. Their visible sprite is offset by the inverse Y-sort origin, so the node baseline and the artwork remain aligned.

The scene tree contains:

- one root `Node2D` carrying exact resource-path metadata;
- one node per assembly layer, including Y-sort enablement and z-order;
- one `Sprite2D` or `AnimatedSprite2D` per placement;
- route `Marker2D` nodes with route-node identity and kind;
- destination `Marker2D` nodes with interaction and target-scene bindings;
- overview, journey-follow, and destination-close `Camera2D` nodes.

## Pixel policy

The contract fixes:

- nearest CanvasItem filtering;
- disabled CanvasItem texture repeat;
- lossless texture compression;
- no generated mipmaps;
- integer positions;
- transform snapping to pixels;
- vertex snapping disabled;
- non-centred sprite placement.

Filter and repeat ownership remain with `CanvasItem`; they are not represented as legacy image-import flags.

## Readiness

A `style-proof-review` assembly compiles only into review material. Its integration plan is not handoff-ready and retains the assembly blockers.

An approved `runtime-candidate` assembly with complete animation sets can compile into a handoff-ready package. Handoff-ready still does not mean activated. A repository writer must apply the exact intents, the target repository must review and test the result, and runtime activation remains a separate operation.

## MCP tools

The main Art Studio MCP server exposes:

- `layered_godot_integration_protocol`
- `compile_layered_godot_integration_plan`
- `verify_layered_godot_integration_plan`

The compile tool builds the production plan, applies optional exact style-proof approval evidence, compiles the assembly manifest, then compiles and self-verifies the Godot integration plan.

The verification tool independently checks a retained integration plan against the exact production plan and assembly manifest. It also recompiles the deterministic expected plan and rejects semantic drift even when a caller recomputes a top-level hash.

Neither tool reads source image bytes, writes files, mutates the target repository, runs Godot, commits, pushes, deploys, or publishes.

## JONEZ proof fixture

`config/jonez-layered-godot-integration.v1.json` binds the JONEZ market-district style proof to:

- `MarketDistrict` as the root node;
- the `gl_compatibility` renderer;
- the retained market-district scene, route, and placement paths;
- separate animation, camera, import, and integration-manifest paths;
- `player-placement` as the journey actor;
- `overview` as the initial camera;
- turn-based route travel.

This fixture is a deterministic integration request. It does not claim that the named target scripts or generated resource drafts have already been written into `EVAVO-STUDIO/GodotGameFoundationKit`.
