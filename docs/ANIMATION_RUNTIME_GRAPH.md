# Animation Runtime Graph

The animation runtime graph turns individually approved clips into one deterministic character animation system. It is the bridge between Art Studio frame production, Cel Animation Studio timing and review, Sprite Studio packing, Video Studio sequence use, and Godot runtime playback.

A runtime graph does not generate images and does not grant creative approval. Every clip must already carry the SHA-256 digest of its approved source plan. The graph controls how those clips may be entered, interrupted, synchronized, completed and delivered.

## Why this layer exists

A collection of good clips is not yet a working game character. Runtime failures commonly appear between clips:

- walk and run cycles change on opposite feet;
- attacks restart from arbitrary frames;
- hit reactions compete with death transitions;
- terminal death states accidentally return to idle;
- a looping clip waits for an end event that never arrives;
- wildcard transitions also fire from states that should be excluded;
- mirrored frames reverse asymmetric weapons, clothing or lighting;
- event frames fire twice or are skipped after a transition;
- the game and rendered-video versions use different timing.

The graph makes those behaviours explicit and testable before runtime activation.

## Production order

```text
approved identity and camera profile
→ approved animation clip plans
→ approved frame sequences and clip timing
→ animation runtime graph compilation
→ deterministic graph review
→ Godot or other destination descriptor
→ native runtime test evidence
→ named release approval
```

The graph compiler is pure. It writes no files, invokes no provider, mutates no repository and activates no runtime.

## Clip contract

Each clip declares:

- a stable clip id and a runtime animation name that is unique across the graph;
- animation kind and view direction;
- exact camera-profile identity;
- source-plan SHA-256;
- frame count and authored frame rate;
- an integer duration weight for every frame;
- loop topology;
- optional locomotion phase family;
- horizontal-mirroring policy;
- asymmetric visual anchors;
- authored event markers.

Integer frame-duration weights preserve held drawings without duplicating files. They map directly to the relative-duration model used by Godot `SpriteFrames`.

## State and transition rules

A state binds one clip to an entry frame and speed scale. Terminal states may not have any applicable outgoing transition, including wildcard transitions.

Transitions support four switching modes:

- `immediate`: change as soon as the trigger and conditions pass;
- `synchronized`: change immediately while carrying weighted cycle phase;
- `at-end`: wait for a non-looping source clip to finish;
- `at-marker`: wait for an authored event marker in the source clip.

Lower numeric priorities win, matching Godot state-machine transition priority. Duplicate transition eligibility is blocked, including duplicate routes to the same destination with different reset behaviour. Shared priorities remain deterministic through the transition id but are reported for review because simultaneous triggers may otherwise hide intent. Contradictory parameter conditions are blocked before runtime.

Wildcard transitions use `fromStateId: "*"`. They must explicitly exclude death and any other protected states. This is the intended pattern for global hit and death reactions.

Unconditional automatic immediate or synchronized cycles are blocked because they can spin without user input or animation progress. Conditional and end-gated flows are evaluated separately so ordinary locomotion logic is not falsely rejected.

## Locomotion phase preservation

Walk, run and sprint clips may share a `phaseFamily`. A synchronized transition with `preserveCyclePhase: true` maps the source playhead to the target using authored frame-duration weights, not only frame numbers.

Both clips must:

- use linear looping;
- use the same phase family;
- carry compatible contact-marker coverage and weighted contact phases when foot contacts are authored;
- use the same locked camera profile.

This lets a character accelerate without switching to the wrong planted foot or visibly restarting the cycle.

## Gameplay and cinematic markers

Markers include foot contacts, takeoff, landing, cancel windows, hitbox windows, projectile release, effects, sound and dialogue cues. A destination controller must dispatch a marker once when its authored frame is entered.

Markers remain useful outside games. Video Studio can use the same marker map for sound, effects and editorial synchronization, while Cel Animation Studio can preserve the same events in an exposure sheet. Runtime evidence is accepted only when the named marker belongs to the current clip and the current frame; stale marker ids and premature completion signals fail closed.

## Godot 4.6.2 projection

The compiler emits an `animated-sprite2d-controller` descriptor rather than pretending that a sprite sheet is already an activated scene. The descriptor includes states, authored timing, event markers, deterministic transition priority and a projection to Godot transition switch-mode values.

For frame-by-frame 2D animation:

- use discrete switching rather than interpolating sprite images;
- use `AnimatedSprite2D.set_frame_and_progress()` when carrying synchronized playback phase;
- retain `SpriteFrames` relative frame durations;
- consume trigger parameters once after selecting a transition;
- do not activate a graph whose digest or quality report fails verification.

Relevant Godot documentation:

- `SpriteFrames`: https://docs.godotengine.org/en/4.6/classes/class_spriteframes.html
- `AnimatedSprite2D`: https://docs.godotengine.org/en/4.6/classes/class_animatedsprite2d.html
- `AnimationNodeStateMachineTransition`: https://docs.godotengine.org/en/latest/classes/class_animationnodestatemachinetransition.html
- `AnimationTree` discrete and carry modes: https://docs.godotengine.org/en/latest/tutorials/animation/animation_tree.html

## Agent workflow

ChatGPT, Claude and local EVAVO agents should:

1. Compile or retrieve approved clip manifests.
2. Build one graph request using `contracts/animation-runtime-graph-v1.schema.json`.
3. Compile the graph and inspect every blocking finding.
4. Repair only the affected clips, states or transitions.
5. Recompile and verify the content digest.
6. Produce a destination descriptor only when `quality.promotable` is true.
7. Gather native playback evidence before any runtime activation or release decision.

An agent must not weaken a blocking rule, mark a graph accepted without evidence, invent a source-plan digest, or treat runtime compilation as creative approval.

## Public API

```ts
import {
  assertAnimationRuntimeGraphIntegrity,
  compileAnimationRuntimeGraph,
  compileGodotAnimationRuntimeGraph,
  resolveAnimationRuntimeTransition,
} from "@evavo/art-direction";

const plan = compileAnimationRuntimeGraph(request);
assertAnimationRuntimeGraphIntegrity(plan);

if (!plan.quality.promotable) {
  throw new Error("Resolve blocking animation graph findings first.");
}

const godot = compileGodotAnimationRuntimeGraph(plan);
const next = resolveAnimationRuntimeTransition({
  plan,
  currentStateId: "walk.right",
  currentFrame: 5,
  frameProgress: 0.5,
  parameterValues: { moving: true, running: true },
});
```

Cel Animation Studio exports the same API from `@evavo/cel-core` so both studios evaluate the same graph contract.
