# Animation Character Family V1

Protocol: `2026-09-01.2`

This contract governs a complete character animation family rather than treating each clip as an unrelated image-generation job.

## Responsibilities

Art Studio owns family planning, perspective-aware coverage, safe mirroring policy, shared identity/style/camera locks, targeted production work, and destination-neutral runtime planning.

Cel Animation Studio owns independent whole-family review receipts. It reviews normal-speed and frame-by-frame playback, directions, loops, transition entry/exit poses, event timing, root motion, identity, style, palette, scale and camera continuity.

## Coverage

Supported camera families include side-stage, top-down, 2:1 isometric, three-quarter, front-stage, first-person overlay, cinematic perspective and custom fixed views. Direction requirements are derived from the camera and action. Horizontal mirroring is allowed only when the subject has no asymmetric anatomy, costume, weapon, prop or silhouette constraint that would make mirroring false.

## Targeted work

Family status can request `produce-clip`, `repair-clip`, `repair-transition`, `repair-family` or `review-family`. Accepted clips remain immutable unless their exact lineage becomes stale or the family plan itself changes.

## Runtime plan

After every required source clip has accepted delivery evidence and Cel Animation Studio has issued an accepted family-review receipt, the compiler can produce a destination-neutral plan for Godot, Cel exposure sheets, Video Studio timing and sprite-atlas assembly. The plan does not activate a runtime or mutate a destination repository.

## Authority boundary

The family tools do not execute providers, fabricate creative approval, promote artifacts, commit or push Git changes, activate runtimes, publish media or deploy builds.
