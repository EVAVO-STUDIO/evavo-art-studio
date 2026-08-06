# Sprite Motion Topology

`@evavo/art-sprite-planner` provides a deterministic motion-topology compiler for an already compiled and hash-bound sprite production plan.

The base sprite-plan schema remains stable. Motion topology is a separate compile-only derivative, so existing consumers are not forced to migrate while animation, direction and provider orchestration can consume richer evidence immediately.

## Direction geometry

The compiler separates world-space facing from screen-space movement.

Canonical compass directions receive exact angles, world vectors, screen vectors, opposite directions and clockwise/counter-clockwise neighbours. Four-, eight- and sixteen-direction families are supported. Unknown project labels either fail closed or use an explicitly recorded evenly spaced fallback from the existing stable direction order.

For 2:1 isometric work, the default screen basis is:

```text
east  = ( 1.0, 0.5)
south = (-1.0, 0.5)
```

Strict isometric mode requires eight runtime directions by default. Fixed-camera and pre-rendered 2.5D projects can provide their own east/south screen basis without changing world-facing semantics.

## Semantic animation phases

Clips are no longer treated as only a frame count. The topology assigns complete, non-overlapping semantic phases such as:

- locomotion: contact, passing, opposite contact, return;
- attacks: anticipation, commitment, impact, recovery;
- reactions: impact, recoil, recovery;
- death and destruction: impact, collapse, settle;
- jumps: anticipation, takeoff, ascent, apex, descent, landing;
- idle and loops: settle, hold, return.

Specific action identities take precedence over broad clip categories. For example, `jump-start`, `fall` and `land` retain grounded, transition and airborne phases even though the source sprite planner classifies them within locomotion.

Every phase records its exact frame range, key frame, duration, motion intent and ground-contact state. Phase allocation is deterministic, handles one to many frames, and preserves the source plan’s exact frame durations.

## Frame continuity

Every runtime frame is bound to:

- its semantic phase and normalized phase progress;
- previous and next frames, including explicit linear and ping-pong loop continuity;
- same-index clockwise and counter-clockwise direction frames;
- the canonical direction master;
- the semantic phase key frame.

These bindings are designed for provider conditioning, consistency review, repair planning and native-engine visual regression. A required animation frame should never be generated as an unrelated prompt-only image.

## Runtime use

A production orchestrator should compile the normal sprite plan first, then compile motion topology from that exact plan. Provider adapters can consume the topology as reference conditioning, but they must report which controls they actually support. The topology does not pretend that an unsupported pose, depth, edge, identity or temporal control was applied.

Authoring masters remain separate from optimized runtime derivatives. Godot SpriteFrames, atlases and import resources continue to be generated from the governed frame manifest and exact durations rather than becoming a second source of truth.

## Authority boundary

Before compiling, the module rehashes the complete source sprite plan and rejects drift. The resulting topology is independently fingerprinted.

The compiler is provider-free and cannot:

- mutate source artwork;
- select or promote a candidate;
- mutate a game repository;
- deploy or publish.

Those remain separate governed authorities.
