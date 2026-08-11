# HEAVY METAL FIGHTING campaign adapter

Status: integration plan; no provider execution or target-repository mutation authority

## Purpose

HEAVY METAL FIGHTING is the public title of the Godot project whose technical repository ID remains `steel-dominion` during a controlled migration period.

The game repository already owns:

- the current four Pilots and Frames;
- the four implemented arenas;
- combat timing, hitboxes and move legality;
- the current 1024 × 1920 / 120-slot Frame atlas contract;
- a live semantic slot exporter;
- generated fallback atlases;
- fighter pixel audits;
- a 640 × 360 render-validation lab;
- the canonical creative, animation and machine-readable campaign documents.

Art Studio must consume those authorities. It must not independently invent another roster, frame map, pivot, title, Pilot identity or move list.

## Source inputs

The adapter should bind one exact game revision and read:

```text
docs/design/HEAVY_METAL_FIGHTING_CREATIVE_BIBLE.md
docs/animation/HEAVY_METAL_FIGHTING_FRAME_ANIMATION_BIBLE.md
docs/art/HEAVY_METAL_FIGHTING_ART_STUDIO_CAMPAIGN.v1.json
scripts/data/game_identity.gd
scripts/data/roster_registry.gd
scripts/data/war_circuit_lexicon.gd
scripts/presentation/final_fighter_atlas_contract.gd
scripts/presentation/fighter_atlas_slot_manifest.gd
```

The live JSON/CSV slot export remains the final authority for cell usage. Markdown prose cannot silently override the exporter.

Every compiled campaign plan records:

- source repository;
- branch and commit SHA;
- exact source-file hashes;
- current public title and technical repository ID;
- current atlas-contract hash;
- current live-slot-manifest hash;
- creative-bible hash;
- animation-bible hash;
- campaign-request hash.

A changed game revision requires a fresh compile. Art generated against one slot contract cannot be promoted against another by reusing an old receipt.

## Why Art Studio owns production

A chat image request can explore one attractive Pilot or Frame. It cannot safely own a multi-hundred-cel production campaign.

HEAVY METAL FIGHTING requires:

```text
canon
→ construction authority
→ identity lock
→ key-pose planning
→ neighbouring-frame conditioning
→ candidate review
→ targeted repair
→ alpha and pixel mastering
→ sequence QA
→ atlas packing
→ Godot validation
→ evidence and approval
```

Art Studio already provides the correct boundaries through governed art direction, persistent workspaces, reference authority, motion topology, closed-loop sprite supervision, deterministic quality checks, style-proof approvals and Godot delivery tooling.

Codex or another development agent remains responsible for reading and updating the game implementation, running Godot, changing the live slot map, fixing imports and committing approved integration. A provider remains a bounded candidate generator, not an art director or repository writer.

## Adapter identity

Recommended adapter ID:

```text
heavy-metal-fighting
```

Recommended campaign ID:

```text
heavy-metal-fighting-launch-four
```

Recommended style preset name:

```text
arcade-mech-fighter-1996
```

The preset name describes production method, not imitation of a commercial title.

## Style contract

The adapter compiles these non-negotiable locks:

- authored low-resolution pixel-cel output;
- 640 × 360 game context;
- 128 × 128 Frame cells under the current contract;
- stable side-view gameplay camera;
- stable hard upper-front key light;
- limited local material ramps;
- deliberate dark joint cavities;
- strong silhouette at 320 × 180 thumbnail scale;
- no global antialiasing;
- no modern PBR gloss;
- no random micro-panels or glowing seams;
- no floating components without declared physical attachment;
- no independent armour or weapon redesign between cels;
- separate body, effect and engine-sidecar ownership;
- one image or one layer per provider work unit;
- no provider-generated contact sheets or final packed atlases.

## Mechanical identity schema

Human identity checks are insufficient for a fighting Frame. Add a mechanical landmark contract per chassis:

```text
head/sensor centre
shoulder joint left/right
elbow joint left/right
wrist/tool mount left/right
hip joint left/right
knee joint left/right
ankle joint left/right
foot contact left/right
core centre
Pilot capsule bounds
crew compartment bounds
weapon hardpoints
cooling shutters
signature asymmetric components
emissive component locations
```

Every Frame identity master also records:

- height in native pixels;
- shoulder, hip and foot widths;
- limb-length ratios;
- declared moving panels;
- declared telescoping parts;
- declared mirrored and non-mirrored components;
- maximum legal silhouette bounds;
- weapon recoil path;
- service-access points.

A cel fails when a landmark moves without a pose reason, a hardpoint changes side, a weapon grows new joints, a prism vane detaches or a foot loses its declared ground contact.

## Campaign families

### 1. Title and shell

- two-line HEAVY METAL / FIGHTING title master;
- WAR CIRCUIT // 2089 subtitle;
- one-colour and four-colour reductions;
- 640 × 360 title composition;
- menu bay background layers;
- menu, versus, HUD, service-bay and results components;
- compact broadcast mark.

The title must not become a band logo. The anti-generic contract blocks skull, flame, chain, wing and unreadable spike filler.

### 2. Pilot identities

Canonical Pilots:

```text
BRANKA KOVAC / GRAVEBELL / DANUBE WORKS
MIHO TAGAWA / CUTGLASS / KANSAI ARC
ESI QUARTEY / NINTH GATE / ACCRA YARD
PARVANEH RAZI / FALSE SUN / CASPIAN SIGNAL
```

Per Pilot:

- canonical bust;
- front and three-quarter identity;
- service clothing sheet;
- link-suit sheet;
- neutral, ready, speaking, warning, pain, Overdrive, victory and defeat portraits;
- standing service-bay figure;
- cockpit-seated key;
- HUD derivative.

Pilot art uses 1990s cel-animation grammar, not photoreal faces or modern vector anime.

### 3. Frame construction

Canonical Frames:

```text
BASTION / BX-09 GRAVEBELL
VIPER / VX-27 CUTGLASS
CITADEL / CX-88 NINTH GATE
MIRAGE / MX-04 FALSE SUN
```

Per Frame:

- front, side and three-quarter construction masters;
- gameplay side-view identity;
- silhouette mask;
- material palette;
- mechanical landmark contract;
- Pilot, crew and service-access diagram;
- hardpoint and upgrade diagram;
- mirror policy;
- damage-zone policy.

No animation generation starts before construction approval.

### 4. Frame animation

Current delivery remains one 120-cell atlas per Frame. The source package retains separate cels, timings, layers, pivots and evidence.

Production sequence:

```text
neutral and ready
→ walk and movement study
→ block and reactions
→ standing normals
→ crouching normals
→ air normals
→ special
→ reversal
→ Overdrive
→ throw choreography
→ victory and defeat
```

Each nine-cel move is compiled as three startup, three active and three recovery work units. The active hero key is approved before in-between work.

The animation bible proposes a tested no-overlap index migration. Until that migration exists in the game and live exporter, Art Studio uses the current manifest and marks the proposal non-authoritative.

### 5. Combat and system effects

Universal:

- light/heavy contact;
- block/instant block;
- guard crush;
- counter;
- armour fragments;
- wall impact;
- foot plant, skid, landing and floor shock.

Frame-specific:

- Bastion pressure, piston, bore and furnace effects;
- Viper blade, arc, route and electrical effects;
- Citadel field, anchor, containment and pulse effects;
- Mirage optical echo, null line and false-vector effects.

System-state:

- CORE spend;
- low CORE;
- SYSTEM DOWN;
- REIGNITION;
- heat vent;
- internal breach;
- staged KO effects.

Mirage’s false bodies are always effect layers. The physical body identity cannot drift.

### 6. Arenas

Implemented arena families:

```text
FOUNDRY NINE
REACTOR SPINE
ORBITAL DOCK
ASH CITADEL
```

Each compiles into far background, midground, fight plane, foreground, ambient loops, stage-light mask, contact-shadow reference, damage state, hazard state and selection card.

Arena work is reviewed with Frame silhouettes composited at native game scale. An attractive empty background is insufficient evidence.

### 7. Thirty-cel intro

The intro is 30 separate full-screen cels with variable holds and declared reusable overlays. It is produced only after title, Pilot, Frame and service-bay identities are approved.

Every cel binds:

- canonical character/Frame references;
- fixed logical canvas;
- scene and shot identity;
- previous and next key where continuity applies;
- layer ownership;
- hold duration;
- cut or transition rule;
- palette state;
- no text except declared separately authored overlays.

## First style proof

The campaign remains locked to this proof until named human approval:

```text
BRANKA KOVAC
+ BASTION / BX-09 GRAVEBELL
+ DANUBE WORKS SERVICE CRADLE
+ FOUNDRY NINE
+ HEAVY METAL FIGHTING TITLE
```

Required Bastion motion keys:

- idle A/B;
- ready;
- four walk studies;
- crouch;
- guard;
- jump launch/apex;
- Rivet Driver startup/contact/recovery;
- GRAVEBELL startup/contact/recovery;
- hit;
- knockdown;
- victory;
- defeat.

Required Branka portrait states:

- neutral;
- ready;
- system warning;
- Overdrive.

Required environment proof:

- service-bay far plate;
- cradle and Frame layer;
- maintenance foreground;
- technician scale silhouettes;
- umbilical attached and released states;
- Foundry Nine fight-plane composite.

Review modes:

- native 128 × 128 cell;
- 640 × 360 match;
- 320 × 180 thumbnail;
- grayscale;
- silhouette-only;
- mirrored;
- all four implemented arena palettes;
- title and selection context.

## Provider routing

### Concept exploration

A general image model may produce bounded identity candidates and environment composition candidates. These are never final pixel art and never define canon without review.

### Controlled frame work

A reviewed ComfyUI profile is preferred for identity-conditioned pose generation, masked mechanical repair and neighbour-conditioned frame extension. The profile must expose only declared identity, direction, temporal, pose, edge, depth, palette and mask bindings.

### Pixel authoring and repair

Aseprite-compatible source remains authoritative for deliberate cluster editing, linked cels, exact timing, pivots, tags and final frame inspection. Automated reduction is a starting operation, not approval.

## Work-order shape

One Frame cel work order contains:

```json
{
  "project": "heavy-metal-fighting",
  "family": "frame-animation",
  "frameId": "BASTION",
  "clip": "bastion_siege_hammer",
  "phase": "active",
  "phaseIndex": 1,
  "semanticPose": "hero-impact",
  "nativeCanvas": [128, 128],
  "origin": [64, 128],
  "alpha": "required",
  "references": [
    "canonical-identity",
    "gameplay-direction-master",
    "previous-approved-key",
    "next-approved-key",
    "mechanical-landmarks",
    "material-palette"
  ],
  "providerAuthority": "candidate-only"
}
```

The actual compiled schema may differ, but it must retain the same authority and continuity information.

## Quality gates

Deterministic:

- exact dimensions and alpha;
- safe bounds;
- pivot and baseline;
- palette and partial-alpha measurements;
- no accidental duplicates;
- slot and filename order;
- atlas dimensions and padding;
- Godot import settings.

Model-assisted and human:

- Frame identity;
- mechanical landmarks;
- Pilot face and clothing identity;
- silhouette and move lane;
- material language;
- startup/contact/recovery logic;
- continuity and secondary motion;
- anti-generic quality;
- arena separation;
- final native-scale appeal.

A deterministic pass cannot auto-approve identity. A model-assisted pass cannot waive dimensions, pivot, alpha or live-manifest requirements.

## Target-repository handoff

Art Studio outputs a reviewable package, not an automatic commit:

```text
individual frame masters
editable source package
exact durations and pivots
registered effect layers
sequence manifests
quality evidence
approved candidate receipts
packed atlas derivative
Godot import recommendations
source game revision and hashes
```

Development Studio or a named operator then:

1. verifies current game HEAD;
2. regenerates the live slot manifest;
3. compares the package contract;
4. places approved assets in final override paths;
5. runs Godot import and focused tests;
6. runs fighter audits and render-lab evidence;
7. commits only the reviewed scope.

Art Studio has no authority to change combat timing, accept the proposed atlas-v2 map, overwrite a target repository, commit, push, deploy or publish.

## Implementation slices

1. Add a `heavy-metal-fighting` repository adapter that reads the exact canonical files and exported slot manifest.
2. Add mechanical landmark and hardpoint evidence to sprite identity review.
3. Add a campaign compiler from the game’s machine-readable request into individual work orders.
4. Add native 128 × 128 and 640 × 360 paired review surfaces.
5. Add Frame/effect composite review and Mirage physical-body verification.
6. Add style-proof approval coverage for Pilot + Frame + bay + arena + title.
7. Add target-package compilation bound to the exact game commit and manifest hash.
8. Keep provider execution, creative approval and repository mutation separately authorised.

This adapter turns HEAVY METAL FIGHTING into a first-class Art Studio production client without turning Art Studio into an uncontrolled robot-picture generator.
