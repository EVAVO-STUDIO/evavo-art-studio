# HEAVY METAL FIGHTING Art Studio runtime

Status: first-class planning, mechanical-continuity, combat-animation, presentation-review, sprite-census and handoff adapter  
Public title: **HEAVY METAL FIGHTING**  
Technical game repository ID: `steel-dominion`  
Provider execution: disabled by this adapter  
Game-repository mutation: prohibited

## Current runtime versus final production

Art Studio now models two explicit animation tiers.

### Current game compatibility

```text
128 × 128 cell
120 source cels per Frame
104 unique mapped current runtime slots
16 current reserved slots
shared boundaries 24, 44, 64 and 84
```

This tier remains authoritative for current `steel-dominion` inspection, fallback rendering, current atlas testing and game handoff comparison.

### Production-master-v3 target

```text
160 × 160 cell
224 unique body cels per Frame
256 atlas slots per Frame
32 reserved slots
896 launch Frame body cels
1573 complete final-production source images
```

This is the recommended final art target and is deliberately **not yet game-authoritative**. Final body promotion is blocked until `steel-dominion` migrates to the 160 × 160 / 256-slot contract and publishes a matching live manifest.

This distinction prevents a final 90s-quality art campaign from being constrained by the prototype/fallback atlas while also preventing Art Studio from pretending the game has already migrated.

## What the adapter provides

- current 1,157-image compatibility campaign compilation;
- final 1,573-image production-master census;
- exact 224-cel body-bank plan per Frame;
- native 160 × 160 production dimensions and `(80,152)` ground pivot;
- scale envelopes for Bastion, Viper, Citadel and Mirage;
- held-cel cadence profiles for each Frame;
- mechanical identity, landmarks, hardpoints, asymmetry and mirror contracts;
- canonical Pilot identity, clothing and portrait contracts;
- named move rosters with live timings where implemented;
- Pilot select, Frame select, service bay, versus, HUD, results and ending plans;
- three-cel Pilot Overdrive cut-ins;
- 30 separate full-screen opening cels;
- arcade attract-mode reuse plan;
- read-only CLI and MCP tools;
- hash-bound game handoff evidence;
- deterministic verification.

## Canonical files

```text
config/game-art-campaign.heavy-metal-fighting.v1.json
config/heavy-metal-fighting/mechanical-sprite-contract.v1.json
config/heavy-metal-fighting/combat-presentation-contract.v1.json
config/heavy-metal-fighting/sprite-production-census.v1.json
scripts/heavy-metal-fighting/mechanical-contract.mjs
scripts/heavy-metal-fighting/combat-presentation-contract.mjs
scripts/heavy-metal-fighting/sprite-production-census.mjs
scripts/heavy-metal-fighting/production-design.mjs
scripts/heavy-metal-fighting/studio-core.mjs
scripts/heavy-metal-fighting/studio-runtime.mjs
scripts/heavy-metal-fighting-art-studio.mjs
scripts/heavy-metal-fighting-art-studio-mcp.mjs
```

Detailed direction:

- [`HEAVY_METAL_FIGHTING_SPRITE_PRODUCTION_CENSUS.md`](HEAVY_METAL_FIGHTING_SPRITE_PRODUCTION_CENSUS.md)
- [`HEAVY_METAL_FIGHTING_COMBAT_ANIMATION_PRODUCTION_BIBLE.md`](HEAVY_METAL_FIGHTING_COMBAT_ANIMATION_PRODUCTION_BIBLE.md)
- [`HEAVY_METAL_FIGHTING_UI_SUPER_INTRO_BIBLE.md`](HEAVY_METAL_FIGHTING_UI_SUPER_INTRO_BIBLE.md)
- [`HEAVY_METAL_FIGHTING_ART_STUDIO_OPERATIONS.md`](HEAVY_METAL_FIGHTING_ART_STUDIO_OPERATIONS.md)

## New sprite-census tools

CLI:

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs sprite-census
node scripts/heavy-metal-fighting-art-studio.mjs sprite-bank standing-heavy
node scripts/heavy-metal-fighting-art-studio.mjs sprite-bank overdrive
```

MCP:

```text
evavo_heavy_metal_fighting_sprite_census
evavo_heavy_metal_fighting_sprite_bank
```

These return the final production-master target without changing the current runtime atlas.

## Frame animation production-master structure

Every Frame receives the same source capacity but a different motion language:

```text
39 neutral/locomotion
52 defence/reaction
21 throw choreography
38 normals
42 specials/reversal/Overdrive
32 CORE/entrance/result
224 body cels
```

The shared count simplifies atlas tooling and any-Pilot/any-Frame selection. It does not homogenise motion because each Frame has its own pose design and held-cel cadence.

Bastion is heavy-held, Viper is fast-snap, Citadel is measured-brace and Mirage is precise-drift.

## Supporting art dimensions

```text
Pilot portrait master        256 × 256
Pilot HUD derivative          56 × 56
Pilot Overdrive cut-in       320 × 112
Pilot service standing       192 × 256
Pilot cockpit cel            320 × 180
Frame construction master    320 × 320
Frame hero/select card       320 × 240
Frame damage overlay         160 × 160
small universal FX            64 × 64
medium universal FX           96 × 96
Frame-specific FX            160 × 160
arena layer                  640 × 360
opening cel                  640 × 360
```

## Authority boundary

Art Studio owns planning, source identity, continuity constraints, production work units, deterministic technical QA, review evidence and handoff preparation.

It does not own:

- combat timing;
- hitboxes or damage;
- move legality;
- current runtime slot semantics;
- acceptance of atlas-v3 into the game;
- final creative approval;
- game-repository writes;
- Git publication;
- deployment.

A provider may generate one bounded candidate or repair under a work order. It cannot define canon, approve itself, generate a packed final atlas, or write into the game.

## Production readiness

Safe to begin before atlas-v3 migration:

- title and UI style proof;
- all Pilot identity art;
- Frame construction masters;
- silhouette and mechanical landmark studies;
- Pilot select and Frame select composition;
- Foundry Nine art;
- Pilot Overdrive cut-in style proof;
- universal FX studies;
- Bastion gameplay pose style proof on non-final compatibility previews.

Blocked from final promotion until game migration:

- the 896 final 160 × 160 Frame body cels;
- packed 256-slot final atlases;
- production-master pivot and runtime manifest;
- final reversal and system-state runtime binding.

The next engineering slice is therefore a tested `steel-dominion` atlas-v3 migration. Once that live manifest exists, Art Studio can open the complete production body-cel queue without ambiguity.
