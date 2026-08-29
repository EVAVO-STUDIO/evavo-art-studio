# Command Front RTS integration

This contract defines how EVAVO Art Studio should support `EVAVO-STUDIO/command-front` without weakening Art Studio's existing approval, provenance or immutable-artifact rules.

## Target

Command Front is a sprite-first 2D/2.5D late-1990s RTS. 3D source models may be used to generate consistent views, but Art Studio owns the mastered runtime sprite package, atlas QA and readability evidence.

## Required asset families

Art Studio planning for Command Front should recognise:

- infantry directional animation sets;
- vehicle hull directional sets;
- independent turret directional sets;
- aircraft/VTOL directional sets;
- building state packages;
- civilian/capturable building packages;
- terrain tile and transition atlases;
- bridge intact/damaged/destroyed packages;
- water and shoreline animation tiles;
- props and wreckage;
- UI icons and unit portraits;
- Particle Studio flipbook intake.

## Direction policy

- infantry: 8 directions minimum;
- vehicles: 16 preferred, 8 minimum;
- aircraft: 8 minimum;
- turrets: independent direction set when gameplay rotation is independent;
- buildings: fixed RTS camera, no direction set.

A directional family must preserve canvas, baseline, ground contact, pivot, apparent scale, lighting and silhouette continuity across all directions.

## Runtime sprite sidecars

Each approved runtime sprite family should be able to provide metadata for:

- canonical asset ID;
- faction ID;
- unit/building role;
- state;
- direction;
- frame duration;
- ground-contact point;
- gameplay origin;
- selection bounds;
- team-mask reference;
- shadow reference;
- turret/effect anchors where applicable;
- source 3D package digest where applicable;
- mastering evidence digest;
- atlas digest.

## Building states

Command Front building packages should fail production-readiness when required states are absent:

- construction;
- intact;
- active overlay where applicable;
- damaged A;
- damaged B;
- destroyed/rubble.

Garrisonable or capturable buildings additionally need clearly readable entry/ownership states and sidecar anchors supplied by the game contract.

## Terrain-specific QA

Terrain atlases need checks beyond generic sprite QA:

- edge-seam continuity;
- shoreline adjacency;
- road/ground transition consistency;
- cliff/ramp alignment;
- bridge approach alignment;
- no visually walkable pixels outside authored traversable areas;
- no visually blocked pixels on authored traversable lanes;
- palette/readability checks against representative Meridian, Vesper and Concordat units.

## RTS readability gate

Final approval should include contact sheets or governed previews at Command Front's real gameplay scale. The reviewer must be able to distinguish unit role, faction ownership, facing and major damage state without inspecting the source asset at full resolution.

## Particle Studio intake

Particle Studio PNG sequences and flipbooks remain source/intermediate effects. Art Studio may master alpha, trim, padding, palette compatibility and atlas packing, but must retain the Particle Studio source identity and effect receipt.

## No copied reference assets

Genre reference images may guide high-level era, camera and readability discussion only. Production assets must remain original or properly licensed with retained provenance.