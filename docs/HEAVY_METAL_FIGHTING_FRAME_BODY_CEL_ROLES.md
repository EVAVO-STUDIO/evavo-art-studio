# HEAVY METAL FIGHTING — Frame body cel roles

Status: read-only production choreography authority  
Production contract: `production_master_v3`  
Authored body slots: `0–223`  
Reserved slots: `224–255`  
Work-order hash mutation: **none in this tranche**  
Image generation: **none**

## Why this layer exists

The production census already defined where every 160×160 Frame body cel lives, but a bank name alone is not enough direction for final animation production.

For example:

```text
standing-heavy 117–124
```

says which bank a cel belongs to, but does not say which drawing is:

```text
anticipation
deep load
active entry
hero impact
overshoot
vulnerable recovery
```

The Frame body role grammar adds that missing semantic layer without changing the existing governed work orders, receipt chains or provider authority.

## Authority boundary

This tranche is intentionally read-only.

It may:

- define semantic pose/choreography roles;
- validate the 224-slot body map;
- attach compact role metadata to the deterministic atlas-v3 layout;
- expose Frame-specific motion realization through the existing read-only atlas-v3 MCP/layout surface.

It may not:

- generate images;
- call providers;
- change current work-order hashes;
- approve or promote candidates;
- write the game repository;
- fill reserved slots;
- redefine combat hitbox or simulation timing.

A role marked `contact` is an **art-role description**, not a gameplay hit-frame declaration. Gameplay timing remains owned by the game-side MoveCatalog and combat simulation.

## Six production groups

The role corpus mirrors the existing production batching exactly:

```text
neutral-locomotion     0–38    39 cels
defence-reactions     39–90    52 cels
throws                91–111   21 cels
normals              112–149   38 cels
specials-overdrive   150–191   42 cels
core-entrance-result 192–223   32 cels
```

Together they cover slots `0–223` exactly once. Slots `224–255` remain unassigned and reserved.

## Role record

Each authored slot resolves to a compact semantic record:

```json
{
  "semanticId": "standing-heavy:hero-impact",
  "roleId": "hero-impact",
  "phase": "active",
  "hero": true,
  "contactRole": true,
  "holdPriority": "hero"
}
```

The full per-Frame role map additionally carries:

- bank purpose;
- bank-local role index;
- row and column;
- Frame motion identity;
- motion cadence;
- body realization rules;
- recovery rule;
- separate-FX rule.

## Important anchor slots

These anchors are validated explicitly:

```text
121  standing-heavy:hero-impact
184  overdrive:super-primary-impact
192  system-down:core-zero-warning
212  victory:victory-recognition
223  defeat:defeat-loop-bridge
```

They are semantic art anchors, not new combat-timing authority.

## Normal attack grammar

### Standing light — slots 112–116

```text
112 intent
113 quick load
114 active entry
115 hero contact
116 quick recovery
```

### Standing heavy — slots 117–124

```text
117 anticipation
118 deep load
119 release commit
120 active entry
121 hero impact
122 overshoot
123 recoil
124 vulnerable recovery
```

Crouching and jumping normals use the same readable classic-fighter principle while remaining distinct low/air choreography.

## Specials and Overdrive

A ten-cel special has explicit:

```text
tell
load A
load B
release
active entry
hero impact
continuation
overshoot
vulnerable recovery
return bridge
```

The fourteen-cel Overdrive bank has room for premium body animation without baking the separate Pilot cut-in or FX into the Frame body:

```text
super ready
charge A
charge B
load
release
active entry
primary impact
continuation A
continuation B
secondary impact
overshoot
recoil
vulnerable recovery
ready bridge
```

## Defence and damage readability

Defence/reaction roles make important physical beats explicit:

- block contact compression;
- guard recoil and return;
- guard geometry opening during crush;
- light vs heavy recoil;
- counter stagger;
- airborne recoil;
- wall compression;
- balance break;
- floor approach;
- first floor contact;
- floor rebound;
- grounded hold;
- mechanical wakeup leverage.

This avoids a common low-quality production failure where every damage state becomes one generic backwards lean.

## Throw grammar

Throw animation is separated into:

```text
grab whiff
throw attacker
throw receiver
throw break
```

The receiver bank is intentionally generic enough to support all four launch Frames without requiring a unique attacker/receiver sprite set for every pairing.

The attacker still gets explicit secure-contact, load, reposition, commit, release/slam, overshoot and recoil roles.

## System and result states

The final 32 authored body cels include gameplay presentation that should never be improvised late in production:

### SYSTEM DOWN — 192–196

```text
core zero warning
drive loss
system lock
deadweight settle
system down hold
```

### REIGNITION — 197–201

```text
restart trigger
power return
actuator re-engage
balance reacquire
control restored
```

### Heat vent — 202–205

Body motion is authored, while steam/cooling discharge remains separate FX.

### Entrance — 206–211

```text
cradle lock
umbilical release
weight transfer
first step
arena square
fight ready
```

### Victory / defeat — 212–223

Both get six coherent result cels so the game does not collapse to one static generic win pose or one explosion-shaped defeat.

## Frame-specific motion realization

The same semantic role means a different physical realization on each Frame.

### Bastion — `hydraulic-weight`

- hips commit before the shoulder mass fully catches up;
- piston rods and forearm mass finish force transfer visibly;
- anchor feet release late and settle last;
- impact reads as accumulated machine mass, not a human punch;
- pressure, piston exhaust, bore trail and furnace flare remain separate FX.

### Viper — `razor-snap`

- digitigrade legs preload and release mechanically;
- contact is abrupt with authored overshoot;
- brake poses matter as much as launch poses;
- body stays coherent while blade arcs, electricity, afterimages and sparks remain separate FX.

### Citadel — `containment-brace`

- setup is measured and visibly anchored;
- containment-side asymmetry stays dominant;
- ground anchors/support geometry communicate force management;
- field rings, containment walls and pulse effects remain separate FX.

### Mirage — `phase-drift`

- one coherent physical chassis exists in every body cel;
- optical false positions never replace the real body;
- direction changes are precise rather than smeared;
- lance/prism-vane hinges remain mechanically plausible;
- optical echoes, null lines, phase seams and false-vector collapse remain separate FX.

## Hold language

Role metadata can mark a drawing as:

```text
normal
short
medium
long
hero
```

This is a production emphasis signal, not a fixed runtime tick count. The game-side presentation system decides exact simulation/display timing.

Hero impact and major floor/result poses are deliberately held more strongly than filler in-betweens. The goal is classic arcade readability and mechanical weight, not smooth modern tweening.

## Existing atlas-v3 inspection surface

The deterministic atlas-v3 layout now carries:

```text
roleGrammarSha256
roleMapSha256
frameMotionRealization
slots[n].bodyRole
```

Therefore the existing read-only production MCP tool:

```text
evavo_hmf_production_frame_atlas_v3
```

returns the semantic cel roles automatically without adding a new mutation-capable tool.

Example conceptual result for Bastion slot 121:

```text
Frame: Bastion
Bank: standing-heavy
Role: hero-impact
Phase: active
Hero: true
Contact role: true
Hold priority: hero
Motion identity: hydraulic-weight
```

## Validation

`verifyHmfFrameBodyRoleGrammar()` fails closed if:

- group counts drift from batch policy;
- role ranges stop covering 0–223 exactly;
- bank IDs or bank counts drift from the production census;
- a hero/contact/hold index escapes its bank;
- a Frame motion identity changes unexpectedly;
- Frame cadence disagrees with the census;
- reserved slots receive roles;
- mutation/provider authority appears.

The existing atlas-v3 delivery verification includes this role verification, so the normal HEAVY METAL FIGHTING Art Studio CI exercises the role corpus without adding another workflow job.

## Next binding step

Once this read-only role authority is validated, a later **versioned work-order protocol** can bind the semantic role into provider prompts for new production receipts.

That later step should be explicit because changing work-order content changes work-order hashes. This tranche deliberately avoids invalidating any existing governed production evidence.
