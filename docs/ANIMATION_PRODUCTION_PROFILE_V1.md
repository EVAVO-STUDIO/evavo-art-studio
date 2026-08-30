# Animation Production Profile V1

Animation Production Profile V1 is the provider-neutral bridge between approved Art Studio identity/style evidence, Cel Animation Studio timing and review, Godot sprite delivery and Video Studio image-sequence use.

It does not generate images and does not approve its own output. It determines what must be authored, in what order, with which camera and identity locks, how long each accepted drawing is exposed, what evidence is missing, and exactly which drawings may be repaired.

## Production order

```text
approved identity and direction master
→ camera-aware production request
→ key-pose batches
→ breakdown batches
→ in-between batches
→ drawing review
→ normal-speed and frame-by-frame sequence review
→ accepted runtime clip
→ Godot, Cel or Video delivery
```

A held pose is one drawing exposed for multiple timeline frames. Never generate a new image merely because the same drawing remains visible for another frame.

## Supported work

The compiler supports idle, walk, run, sprint, jump, land, climb, swim, fly, melee attack, ranged attack, cast, hit reaction, knockdown, get-up, death, interaction, dialogue, emote, effect and fully authored custom actions.

Camera families are side-stage, top-down, 2:1 isometric, three-quarter, front-stage, first-person overlay, cinematic perspective and custom fixed. Direction labels are validated against the selected camera; an invalid camera/direction pairing is rejected before provider work.

## Immutable locks

Each request binds:

- canonical character identity and revision;
- optional direction-master artifact;
- silhouette, costume, prop and asymmetric anchors;
- camera profile, projection, yaw, pitch, roll, scale, ground line and movement plane;
- performance intent, weight, energy, tempo and exaggeration;
- style, palette, line treatment, shape language and project-specific anti-generic traits;
- canvas, pivot, alpha, trimming and texture-filtering policy;
- bounded attempt, review-cycle, no-progress and batch limits.

Generic filler such as `masterpiece`, `trending`, `best quality` and `8K` is not production direction and is rejected when used in the authored direction fields.

## Review semantics

The review supervisor has four outcomes:

- `review-required`: media exists or may exist, but exact drawing or sequence evidence is missing. This is not redraw authority.
- `rework-required`: reviewed evidence failed one or more locked gates. Only the returned drawing IDs may be regenerated or repaired.
- `accepted`: every unique drawing and the complete moving sequence passed.
- `blocked`: attempt, review-cycle or repeated no-progress limits were exhausted.

Every retry task preserves all accepted drawings, not just drawings before the failure. It also names the authoritative dependency poses and exact failure codes.

## Targets

`godot-sprite` preserves relative frame durations, pivot, alpha, filtering, runtime event markers and safe mirroring policy.

`cel-sequence` preserves key, breakdown and in-between roles plus X-sheet exposure. Holds remain repeated exposure of one drawing.

`video-sequence` expands the accepted exposure plan at the authored source frame rate. Optical-flow interpolation must not cross holds, impact poses, drawing substitutions or event frames.

## CLI

```powershell
node .\tools\animation_production_profile_v1.mjs compile `
  .\examples\animation-production-profile-side-stage-v1.json `
  .\work\harbour-runner-walk.plan.json

node .\tools\animation_production_profile_v1.mjs verify `
  .\work\harbour-runner-walk.plan.json
```

Other commands are `review`, `runtime` and `next-batch`. Output files use create-only writes and paths must remain inside the current workspace.

## MCP

Run:

```powershell
node .\tools\animation_production_profile_v1_mcp.mjs
```

The MCP server exposes compile, verify, review, next-batch and accepted-runtime-clip tools. It cannot execute a provider, approve artwork, promote artifacts, activate a runtime, mutate a repository or publish media.
