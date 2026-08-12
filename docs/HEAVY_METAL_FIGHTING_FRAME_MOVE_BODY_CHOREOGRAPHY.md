# HEAVY METAL FIGHTING — named move body choreography

Status: read-only production planning authority  
Launch Frames: Bastion, Viper, Citadel, Mirage  
Launch moves: 44 total, 11 per Frame  
Image generation: none  
Work-order mutation: none  
Game timing authority: none

## Purpose

The 224-cel body-role grammar answers **what every production cel is doing**. The combat-presentation contract answers **what every named move is supposed to look and feel like**.

This layer joins those two existing authorities so a production artist or agent can inspect, for example:

```text
Frame: Bastion
Move: GRAVEBELL
Category: standing normal
Production bank: standing-heavy
Production slots: 117-124
Hero body role: slot 121, standing-heavy:hero-impact
Startup intent: load across the rear anchor and close the shoulder brace
Hero contact: broad descending hammer line with the whole shoulder/torso mass committed
Recovery intent: forearm remains low and torso pitched forward long enough to read as punishable
Separate effects: heavy metal impact, floor shock, armour fragments
Motion identity: hydraulic weight
```

No duplicate move names or choreography are authored here. The layer reads the existing combat-presentation contract and maps each move into the production-master-v3 body banks.

## 44 launch moves

Every launch Frame retains exactly:

```text
6 normals
2 specials
1 reversal
1 Overdrive
1 throw
= 11 moves per Frame
```

Across four Frames this is 44 named move choreography records.

The compiler preserves each move's existing:

- public name;
- input notation;
- runtime move ID, when one exists;
- implementation status;
- hit level;
- CORE/resource class;
- startup intent;
- hero-contact description;
- active overshoot description;
- recovery intent;
- body notes;
- separate effects;
- production gates;
- current runtime timing, when available.

## Production body-bank mapping

The mapping is intentionally simple and deterministic:

```text
standing light   -> 112-116
standing heavy   -> 117-124
crouching light  -> 125-129
crouching heavy  -> 130-137
jumping light    -> 138-142
jumping heavy    -> 143-149
special A        -> 150-159
special B        -> 160-169
reversal         -> 170-177
Overdrive        -> 178-191
throw attacker   -> 94-101
throw receiver   -> 102-107
```

Reversal and Overdrive use the explicit v3 banks even where the older compatibility presentation contract still refers to `high-output-a` or `high-output-b`.

Throws also expose the generic six-cel receiver bank so attacker and receiver choreography can be reviewed as a pair without multiplying bespoke matchup sheets.

## Bastion high-output example

The existing Bastion contract resolves to:

```text
Special A : REDLINE BORE  -> special-a      150-159
Special B : ANVIL LOCK    -> special-b      160-169
Reversal  : BLOW-OFF      -> reversal       170-177
Overdrive : KILN VERDICT  -> overdrive      178-191
```

This preserves the current truth that some named moves may be production-planned while not yet implemented in the game runtime.

A planned move can therefore have complete art choreography while still carrying:

```text
runtimeImplemented = false
productionGates = [...]
```

That is not treated as a contradiction or silently promoted to runtime availability.

## Hero pose alignment

The move compiler binds each bank to the role grammar, including its one canonical hero body role.

Examples:

```text
standing heavy hero -> slot 121 -> standing-heavy:hero-impact
special A hero      -> slot 155 -> special-a:special-a-hero-impact
special B hero      -> slot 165 -> special-b:special-b-hero-impact
reversal hero       -> slot 174 -> reversal:reversal-hero-contact
Overdrive hero      -> slot 184 -> overdrive:super-primary-impact
```

These are **art-production anchors**, not gameplay hit frames.

The game remains authoritative for simulation timing, hitboxes, damage, inputs, cancel rules, CORE use and runtime implementation state.

## Frame-specific physical realization

The named move view inherits the Frame role grammar rather than making every move use one human-like template.

### Bastion

Hydraulic weight. Loads through anchors, piston travel and pressure recovery.

### Viper

Razor snap. Mechanical spring preload, abrupt contact, deliberate overshoot and hard braking.

### Citadel

Containment brace. Measured setup, asymmetric structural authority and anchor-led recovery.

### Mirage

Phase drift. One physically coherent body; optical false positions and null/phase effects remain separate FX.

## Effects remain separate

`separateEffects` is carried from the combat-presentation contract so body production never uses FX to hide a weak pose.

Examples include:

- metal impact;
- floor shock;
- armour fragments;
- pressure exhaust;
- blade arcs;
- electrical discharge;
- containment fields;
- optical echoes;
- super-freeze presentation.

The physical Frame body remains the canonical readable silhouette.

## CLI

Verify the complete 44-move mapping:

```powershell
node scripts/heavy-metal-fighting/frame-move-body-choreography-cli.mjs verify
```

Inspect one Frame:

```powershell
node scripts/heavy-metal-fighting/frame-move-body-choreography-cli.mjs frame bastion
node scripts/heavy-metal-fighting/frame-move-body-choreography-cli.mjs frame viper
node scripts/heavy-metal-fighting/frame-move-body-choreography-cli.mjs frame citadel
node scripts/heavy-metal-fighting/frame-move-body-choreography-cli.mjs frame mirage
```

The CLI is read-only.

## Validation

The verification fails closed if:

- any Frame loses its 11-move launch roster;
- the total differs from 44 moves;
- a Frame loses six normals or two specials;
- a named special/reversal/Overdrive cannot map to a production body bank;
- a body bank has no hero role;
- throw receiver choreography disappears;
- standing-heavy hero slot is no longer 121;
- reversal stops using 170-177;
- Overdrive stops using 178-191;
- mutation/timing authority leaks into this planning layer.

The existing atlas-v3 delivery test suite exercises this mapping, so no additional GitHub Actions workflow is needed.

## Work-order boundary

This layer does **not** modify current governed work orders or their SHA-256 values.

When provider production begins in earnest, a later versioned protocol may include this move/role choreography as an additive prompt overlay. That versioned step should be explicit because changing the immutable work-order payload would change its hash and therefore its receipt-chain identity.
