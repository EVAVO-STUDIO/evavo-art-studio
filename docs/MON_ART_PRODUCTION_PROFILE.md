# MÔN governed art production profile

MÔN uses Art Studio as the source-art and mastering authority for a fixed-camera painted 2.5D tactical game. The game repository owns final runtime admission; Art Studio produces candidate, mastered and review-ready source packages with exact references and evidence.

## Style lock

All MÔN work should bind the current game style-lock ID and approved anchor references. The core visual target is grounded late Roman/post-Roman Britain, roughly c. AD 400–550 in visual centre, with restrained Welsh myth/folklore that becomes more explicit only as the campaign escalates.

The world should read as painted sprite/chunk art rather than visible 3D terrain. Characters should read clearly at approximately 112 px standing height in 1280 x 720 tactical play.

## Production families

Art Studio should treat these as distinct governed families:

- regional environment key art;
- continuous surface-family masters;
- macro terrain chunks;
- elevation/cliff/ramp pieces;
- vegetation families and split occlusion assets;
- structures/props;
- water/shoreline families;
- decals;
- weather overlays;
- unit-type portraits;
- named-character portraits;
- eight-direction character direction masters;
- action key poses and in-betweens;
- card/UI frame families.

## Character generation order

Do not independently generate final animation frames.

Recommended chain:

1. identity portrait / full-body identity anchor;
2. canonical costume/equipment record;
3. neutral south direction master;
4. remaining seven direction masters using identity + previously approved direction references;
5. action key poses for each direction;
6. neighbour-conditioned in-between frames;
7. alpha mastering and edge cleanup;
8. sequence consistency review;
9. Sprite Studio package/atlas handoff;
10. MÔN native-scale runtime review.

Identity, body proportions, face/hair, shield profile, weapon length, cloak mass, major equipment placement, palette and light direction are hard continuity concerns.

## Environment generation order

1. regional key art at game-like camera angle;
2. regional palette/light/material board;
3. first surface-family master;
4. controlled surface variants;
5. elevation/ridge/cliff family;
6. macro chunks;
7. vegetation and tall-object split families;
8. structures/props;
9. decals;
10. water/shoreline;
11. weather-state overlays/support masks;
12. integrated battlefield proof.

Environment variants should reference approved family masters. Structural pieces must preserve semantic topology; Art Studio should not create arbitrary rotated/mirrored cliff, road, riverbank, coast or wall variants merely for visual diversity.

## Alpha and occlusion

Transparent runtime art must retain true alpha. Painted checkerboards, hidden mattes and contaminated edges are blocking.

Tall vegetation/structures should be authored with explicit roles when practical:

- rear/background layer;
- solid trunk/base/body;
- front occlusion layer;
- ground/contact/shadow layer.

Front occlusion art should remain attractive when faded to roughly 40% alpha; do not paint critical structural information only into the layer expected to fade.

## Generated candidate policy

Generation is candidate creation, not approval. Every candidate must retain:

- exact prompt/compiled request identity;
- ordered reference IDs/hashes;
- model/provider/workflow identity where applicable;
- source role;
- intended family/asset ID;
- style-lock ID;
- immutable candidate bytes;
- review status.

For local ComfyUI work, use exact reviewed workflow/model/runtime hashes. For remote image work, bind the same approved references and role-specific prompt contract.

## Review proofs

Before handoff, produce the smallest useful proof set for the asset family, typically:

- native-scale view;
- hostile-background alpha proof;
- family contact sheet;
- identity/reference comparison;
- silhouette/pivot proof for sprites;
- clear/wet/snow/fog comparison for weather-reactive environment art;
- edge/seam proof for continuous surfaces;
- layer-composite proof for split vegetation/structures.

## Game-design alignment

Art is not independent decoration. Source briefs should carry gameplay role such as movement surface, cover/LOS obstacle, occluder, interaction point, elevation transition, landmark, ranged unit, formation unit or narrative-only character.

The source image may overhang or exaggerate the hidden semantic footprint, but it must never imply a contradictory gameplay affordance. A painted ramp cannot look traversable if gameplay blocks it, and a selectable unit cannot become unreadable at native tactical scale.
