# HEAVY METAL FIGHTING Art Studio operations

This document defines CLI and MCP use, the locked style proof, validation, authority and the safe path from design to game-ready source art.

## Locked first style proof

Expansion remains blocked behind:

```text
BRANKA KOVAC / GRAVEBELL
BASTION / BX-09 GRAVEBELL
DANUBE WORKS SERVICE CRADLE
FOUNDRY NINE
HEAVY METAL FIGHTING TITLE
PILOT SELECT
FRAME SELECT
MATCH HUD
KILN VERDICT CUT-IN
```

The proof resolves exact Bastion source cels, Branka portrait states, title assets, Foundry Nine assets, service-bay assets and UI/super contexts.

It deliberately exposes the current slot-24 conflict:

```text
Rivet Driver recovery
GRAVEBELL startup
```

The planned map moves GRAVEBELL startup to slot 25.

The proof cannot approve itself.

## CLI

Run from the Art Studio repository root.

### Verify the entire adapter

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs verify
```

### Summary and contracts

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs summary
node scripts/heavy-metal-fighting-art-studio.mjs contract
node scripts/heavy-metal-fighting-art-studio.mjs presentation-contract
node scripts/heavy-metal-fighting-art-studio.mjs readiness
```

### Pilot identity and portrait planning

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs pilot branka-kovac
node scripts/heavy-metal-fighting-art-studio.mjs pilot miho-tagawa
node scripts/heavy-metal-fighting-art-studio.mjs pilot esi-quartey
node scripts/heavy-metal-fighting-art-studio.mjs pilot parvaneh-razi
```

The Pilot command returns face, hair, clothing, palette, expression, selection, portrait, service-animation and three-cel Overdrive cut-in locks. It is not a freeform character prompt.

### Frame and move planning

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs frame bastion
node scripts/heavy-metal-fighting-art-studio.mjs moves bastion
node scripts/heavy-metal-fighting-art-studio.mjs move bastion rivet-driver
node scripts/heavy-metal-fighting-art-studio.mjs move bastion kiln-verdict
node scripts/heavy-metal-fighting-art-studio.mjs move viper switchback
```

A planned move such as `switchback` returns blockers rather than pretending the move is implemented.

### One source cel or runtime slot

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs cel bastion 25
node scripts/heavy-metal-fighting-art-studio.mjs cel bastion 97
node scripts/heavy-metal-fighting-art-studio.mjs slot bastion current 24
node scripts/heavy-metal-fighting-art-studio.mjs slot bastion planned-v2 25
```

### Screens

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs screen title-attract
node scripts/heavy-metal-fighting-art-studio.mjs screen pilot-select
node scripts/heavy-metal-fighting-art-studio.mjs screen frame-select
node scripts/heavy-metal-fighting-art-studio.mjs screen match-hud
node scripts/heavy-metal-fighting-art-studio.mjs screen super-cut-in
```

### Overdrive

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs super bastion
node scripts/heavy-metal-fighting-art-studio.mjs super viper
node scripts/heavy-metal-fighting-art-studio.mjs super citadel
node scripts/heavy-metal-fighting-art-studio.mjs super mirage
```

### Intro and assets

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs intro
node scripts/heavy-metal-fighting-art-studio.mjs assets
node scripts/heavy-metal-fighting-art-studio.mjs assets pilot-portraits
node scripts/heavy-metal-fighting-art-studio.mjs assets frame-animation
node scripts/heavy-metal-fighting-art-studio.mjs assets frame-specific-fx
node scripts/heavy-metal-fighting-art-studio.mjs attract
```

### Production batch

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs batch 1
```

Every batch contains one to ten separate source-image jobs from one family. Frame-animation units are enriched with source index, named move or shared state, phase purpose, current and planned slots, blockers and separate effect requirements.

### Style proof and handoff

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs style-proof

node scripts/heavy-metal-fighting-art-studio.mjs handoff-template `
  <40-character-game-commit-sha> `
  <64-character-live-slot-manifest-sha256>
```

The handoff includes the combat/presentation contract hash but performs no write.

## MCP tools

Start:

```powershell
node scripts/heavy-metal-fighting-art-studio-mcp.mjs
```

Tools:

```text
evavo_heavy_metal_fighting_summary
evavo_heavy_metal_fighting_mechanical_contract
evavo_heavy_metal_fighting_combat_presentation_contract
evavo_heavy_metal_fighting_pilot_plan
evavo_heavy_metal_fighting_frame_plan
evavo_heavy_metal_fighting_frame_moves
evavo_heavy_metal_fighting_move_plan
evavo_heavy_metal_fighting_source_cel
evavo_heavy_metal_fighting_runtime_slot
evavo_heavy_metal_fighting_screen_plan
evavo_heavy_metal_fighting_super_plan
evavo_heavy_metal_fighting_intro_plan
evavo_heavy_metal_fighting_attract_mode
evavo_heavy_metal_fighting_production_readiness
evavo_heavy_metal_fighting_asset_allocation
evavo_heavy_metal_fighting_batch
evavo_heavy_metal_fighting_style_proof
evavo_heavy_metal_fighting_verify
evavo_heavy_metal_fighting_handoff_template
```

The MCP server exposes no provider execution, candidate approval, promotion, repository write, Git, deployment or publication tool.

## Authority

### Art Studio owns

- production planning;
- work-unit identity;
- move choreography;
- source-bank and runtime-bank distinction;
- mechanical identity review;
- reference and neighbour binding;
- Pilot identity, costume, portrait, service-animation and cut-in planning;
- enriched source-cel work orders that bind named choreography to exact cels;
- deterministic dimensions, alpha, pivot and bounds checks;
- review and repair routing;
- evidence and handoff preparation.

### The game repository owns

- inputs;
- startup, active and recovery timing;
- hitboxes;
- damage;
- current move IDs;
- current runtime slot semantics;
- atlas-v2 acceptance;
- CORE and crew gameplay;
- Godot imports;
- final asset promotion.

### Named human approval owns

- title quality;
- Pilot identity;
- Frame identity;
- native-scale appeal;
- animation clarity;
- super presentation;
- final selection and promotion;
- acceptance of a fresh source review when the game revision differs from the retained review snapshot.

## Validation

Focused validation:

```powershell
node --test `
  scripts/game-art-campaign-heavy-metal-fighting.test.mjs `
  scripts/heavy-metal-fighting-art-studio-core.test.mjs `
  scripts/heavy-metal-fighting-production-design.test.mjs `
  scripts/heavy-metal-fighting-art-studio.test.mjs
```

Dedicated CI:

```text
.github/workflows/heavy-metal-fighting-art-studio.yml
```

CI validates syntax, campaign counts, mechanical and Pilot contracts, named moves, implemented/planned boundaries, authored source banks, enriched source-cel topology, screen plans, supers, intro, attract mode, allocations, source-review binding, MCP authority and clean source.

## Safe production order

1. Verify all contracts.
2. Inspect production readiness and refresh the live game source review if the target revision differs.
3. Approve title construction.
4. Approve Branka portrait identity, service clothing and link suit.
5. Approve Bastion construction, landmarks, hardpoints and source-bank ownership.
6. Approve Pilot-select, Frame-select, versus and HUD compositions.
7. Produce Bastion neutral, locomotion and reaction proof cels.
8. Produce Rivet Driver and GRAVEBELL startup, contact and recovery keys.
9. Produce Blow-Off in its separate authored `high-output-b` source bank while recording current runtime reuse of `high-output-a`.
10. Produce Kiln Verdict portrait cut-in, body keys and separate FX.
11. Review Bastion in Foundry Nine with final HUD and service-bay contexts.
12. Finish Bastion’s implemented move cels, repair only failed source cels, and retain all passing siblings.
13. Repeat the same identity-first sequence for Viper, Citadel and Mirage.
14. Produce service bay, crew, upgrade and arena layers.
15. Produce the 30-cel opening only after Pilot, Frame, title and launch language are stable.
16. Build attract mode from approved existing assets; do not create an untracked second art inventory.
17. Bind approved art to an exact game commit and live slot-manifest hash.
18. Let the game repository import, test and promote final assets.

Planned secondary specials remain source-design targets until their deterministic game move, input, hitbox, timing and runtime-bank contracts exist.
