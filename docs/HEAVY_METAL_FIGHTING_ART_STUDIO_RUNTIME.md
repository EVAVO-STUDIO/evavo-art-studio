# HEAVY METAL FIGHTING Art Studio runtime

Status: first-class planning, mechanical-continuity, combat-animation, presentation-review and handoff adapter  
Public title: **HEAVY METAL FIGHTING**  
Technical game repository ID: `steel-dominion`  
Provider execution: disabled by this adapter  
Game-repository mutation: prohibited

## Purpose

This adapter turns HEAVY METAL FIGHTING into an executable art-production client rather than a collection of disconnected prompts.

It provides:

- exact 1,157-image campaign compilation and count validation;
- one family-locked batch at a time;
- one separate source image per asset or animation cel;
- mechanical identity contracts for Bastion, Viper, Citadel and Mirage;
- canonical Pilot identity, clothing, expression, selection and portrait contracts for Branka, Miho, Esi and Parvaneh;
- named move rosters with current runtime IDs and timings;
- explicit separation between implemented moves and planned production targets;
- exact hardpoints, asymmetry, silhouette, material and body/effect ownership rules;
- source-clip and source-cel topology;
- startup, active, hero-impact and recovery classification;
- previous/next-frame conditioning;
- current and planned runtime-slot bindings;
- direct title, menu, Pilot-select, Frame-select, service-bay, versus, HUD, super, result and ending plans;
- three-cel Pilot Overdrive cut-ins;
- a 30-cel, 798-tick opening sequence plus a four-part arcade attract-mode reuse plan;
- exact per-family asset allocations;
- the locked Branka + Bastion + Foundry Nine style proof;
- read-only CLI and MCP tools for ChatGPT, Claude and authorised agents;
- hash-bound game-repository handoff templates;
- dedicated CI evidence.

It does not generate or approve art on its own. Provider execution, source editing, human approval, atlas assembly and target-repository integration remain separately authorised stages.

## Canonical files

```text
config/game-art-campaign.heavy-metal-fighting.v1.json
config/game-art-campaign.heavy-metal-fighting.v1.payload.b64.part-001 ... part-006
config/heavy-metal-fighting/mechanical-sprite-contract.v1.json
config/heavy-metal-fighting/combat-presentation-contract.v1.json
config/heavy-metal-fighting/combat-presentation-contract.v1/base.json
config/heavy-metal-fighting/combat-presentation-contract.v1/pilots.json
config/heavy-metal-fighting/combat-presentation-contract.v1/frames/*.json
config/heavy-metal-fighting/combat-presentation-contract.v1/screens.json
config/heavy-metal-fighting/combat-presentation-contract.v1/asset-allocation.json
config/heavy-metal-fighting/combat-presentation-contract.v1/intro.json
scripts/heavy-metal-fighting/mechanical-contract.mjs
scripts/heavy-metal-fighting/combat-presentation-contract.mjs
scripts/heavy-metal-fighting/production-design.mjs
scripts/heavy-metal-fighting/studio-core.mjs
scripts/heavy-metal-fighting/studio-runtime.mjs
scripts/heavy-metal-fighting-art-studio.mjs
scripts/heavy-metal-fighting-art-studio-mcp.mjs
```

The campaign bundle owns the exact work-unit inventory. The mechanical contract owns Frame construction and source topology. The combat/presentation contract owns named moves, screens, Pilot cut-ins, intro shots and the exact allocation of all 1,157 source images.

## Source review binding

The combat/presentation contract records the exact `steel-dominion` game revision and source blobs used to verify move timing and bank behaviour. A handoff against any other game revision is marked `requires-fresh-live-game-source-review`; a newer commit is never assumed compatible merely because its SHA is newer.

The reviewed authority currently covers:

- Frame-specific normals and reversals;
- primary specials and Overdrives;
- current animation-bank reuse;
- the public move naming and choreography bible.

The live game repository and freshly exported slot manifest still override the retained review snapshot at promotion time.

## Pilot identity contract

Each launch Pilot has a machine-readable plan for:

- body and face silhouette;
- immutable face, hair and scar anchors;
- service clothing and cockpit link suit;
- local palette ramps;
- fifteen portrait states;
- eighteen service/cockpit animation states;
- select-idle and select-focus behaviour;
- three held Overdrive cut-in cels;
- anti-generic failures that must be rejected.

The Pilot plan is as authoritative for portrait continuity as the mechanical landmark plan is for a Frame.

## Critical source-cel distinction

Every Frame retains 120 authored source cels.

Current runtime map:

```text
104 unique mapped slots
16 reserved slots
4 shared boundaries: 24, 44, 64 and 84
```

Planned atlas-v2 map:

```text
120 unique mapped slots
0 reserved slots
0 collisions
```

Art Studio never discards a source cel merely because the current runtime maps two cels to one shared destination.

The bounded `cel` command now enriches each source cel with its named move or shared-state meaning, exact phase purpose, authored production bank, current runtime reuse, choreography, separate FX, blockers and previous/next approved references. A high-output reversal therefore receives its own authored source bank even while the current game reuses the Overdrive runtime bank.

## Current versus planned move authority

Each named move includes:

- public move name;
- current runtime move ID where implemented;
- current live startup, active, recovery and damage facts where available;
- input notation for design communication;
- source bank;
- current runtime bank;
- planned production bank;
- choreography;
- body and effect requirements;
- production blockers.

Planned secondary specials do not claim runtime IDs. Distinct reversal banks remain blocked where atlas-v2 has not migrated.

## Launch move structure

Every Frame has:

```text
2 standing normals
2 crouching normals
2 air normals
2 special designs
1 reversal
1 Overdrive
1 throw choreography
```

The current game implements six normals, one signature special, one reversal, one Overdrive and the universal throw system per Frame. The second special is a governed design target and remains blocked until the game owns the move.

## Presentation structure

Direct screen plans are available for:

```text
title-attract
main-menu
pilot-select
frame-select
service-bay-loadout
versus
pre-fight-launch
match-hud
super-cut-in
round-result
ending-credits
```

The Overdrive plan binds three Pilot portrait cels, the correct Frame body bank, universal freeze effects, Frame-specific effects and approval checks.

The opening plan binds 30 separate full-screen cels and 798 ticks of variable holds, pans and registered overlays. Attract mode is a separate four-segment composition plan that reuses approved title, selection, match and result art and does not silently add another asset inventory.

## Exact source-art allocation

```text
42  title and shell
60  Pilot portraits
40  Frame construction
480 Frame animation
16  Frame damage overlays
115 universal combat FX
160 Frame-specific FX
40  arena layers
102 service bay, crew and upgrades
72  Pilot service animation
30  opening intro
1157 total
```

## Mechanical identity contract

Every Frame records:

- Pilot, affiliation, crew requirement, height and CORE type;
- motion identity;
- silhouette locks;
- limited material ramps;
- eighteen required landmarks;
- weapon, cooling, anchor and service hardpoints;
- declared asymmetry and mirror treatment;
- body-owned and effect-owned elements;
- forbidden substitutions;
- Frame-specific movement rules.

## Animation review model

Every nine-cel combat bank is classified as:

```text
startup
startup
startup
active entry
hero impact
active overshoot
recoil
vulnerable recovery
return or bridge
```

Each source cel binds:

- canonical Frame identity;
- mechanical landmarks;
- material ramps;
- previous and next source cels;
- native dimensions and pivot;
- current and planned runtime slots;
- ground-contact expectation;
- mirror review;
- body/effect separation;
- named-human approval.

## Detailed production bibles

- [`HEAVY_METAL_FIGHTING_COMBAT_ANIMATION_PRODUCTION_BIBLE.md`](HEAVY_METAL_FIGHTING_COMBAT_ANIMATION_PRODUCTION_BIBLE.md)
- [`HEAVY_METAL_FIGHTING_UI_SUPER_INTRO_BIBLE.md`](HEAVY_METAL_FIGHTING_UI_SUPER_INTRO_BIBLE.md)
- [`HEAVY_METAL_FIGHTING_ART_STUDIO_OPERATIONS.md`](HEAVY_METAL_FIGHTING_ART_STUDIO_OPERATIONS.md)
