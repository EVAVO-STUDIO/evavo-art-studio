# HEAVY METAL FIGHTING — combat animation production bible

Status: canonical Art Studio combat-animation direction  
Public title: **HEAVY METAL FIGHTING**  
Logical game canvas: **640 × 360**  
Current compatibility cell: **128 × 128 / 120 source cels**  
Final production-master target: **160 × 160 / 224 unique body cels / 256 atlas slots**

## 1. The two animation contracts

HEAVY METAL FIGHTING currently has two deliberately separate animation contracts.

### Compatibility contract — implemented

```text
128 × 128 body cell
120 authored source cels per Frame
104 unique current runtime slots
16 current reserved slots
shared runtime boundaries at 24, 44, 64 and 84
```

This remains authoritative for the current `steel-dominion` build, generated fallbacks, render validation and current source-cel inspection.

### Production-master-v3 — final-art target

```text
160 × 160 body cell
224 unique body cels per Frame
256 atlas slots per Frame
32 reserved slots
pivot 80,152
4 px minimum transparent safety
```

This is the final visual-production target. It is not yet game-authoritative. Final body-cel promotion stays blocked until the game migrates its live atlas contract, exporter, fallback art and tests.

The complete count and dimension authority is [`HEAVY_METAL_FIGHTING_SPRITE_PRODUCTION_CENSUS.md`](HEAVY_METAL_FIGHTING_SPRITE_PRODUCTION_CENSUS.md).

## 2. 1990s animation rule

The goal is not maximum smoothness.

```text
strong drawing
+ deliberate hold
+ readable spacing
+ hitstop
+ separate FX
= premium arcade motion
```

Unique body-cel count measures how much distinct acting and mechanical information the complete fighter owns. It does **not** mean that every cel changes every simulation tick.

Most production drawings hold for roughly two to six 60 Hz ticks. Heavy Frames hold load and recovery drawings longer. Fast Frames change drawings faster but still hold contact and braking poses long enough to read.

Do not create automated in-betweens simply because a gap exists. Every additional cel must improve weight, direction, contact, recoil, mechanical continuity or acting.

## 3. Production-master body census

Per Frame:

| Group | Unique cels |
|---|---:|
| Neutral and locomotion | 39 |
| Defence and reactions | 52 |
| Throw choreography | 21 |
| Normals | 38 |
| Specials, reversal and Overdrive | 42 |
| CORE, entrance and result states | 32 |
| **Total** | **224** |

The production atlas reserves 32 more cells for later game-authoritative requirements. Empty reserve space is not a reason to generate filler.

## 4. Native Frame scale

Final body cells are 160 × 160 with a ground pivot at `(80,152)`.

| Frame | Neutral height | Neutral width | Max body height | Max body width |
|---|---:|---:|---:|---:|
| Bastion | 136 | 108 | 142 | 150 |
| Viper | 114 | 76 | 124 | 144 |
| Citadel | 146 | 120 | 148 | 152 |
| Mirage | 124 | 84 | 134 | 146 |

These are visual envelopes, never hitboxes.

Citadel must clearly read as the tallest fortress Frame. Bastion is slightly shorter but broader and denser. Mirage is mid-sized and narrow. Viper is the smallest and most compact.

## 5. Neutral and locomotion

### Ready — 1 cel

The single clearest fighting identity pose. It must identify the Frame without colour or effects.

### Idle — 4 cels

A held mechanical loop. No simulated human breathing.

- Bastion: shoulder pressure and dorsal shutters settle.
- Viper: ankle preload and sensor correction.
- Citadel: guard mass and anchor indicators adjust.
- Mirage: prism vanes calibrate while feet remain still.

### Walk forward — 6 cels

Contact → compression → passing → opposing contact → compression → passing.

### Walk back — 6 cels

Independently authored. Never reverse-play the forward walk. Mechanical load transfer changes when retreating.

### Crouch — 3 cels

Two transition drawings plus one held low stance. Standing up may reuse the transition in reverse when the actual silhouette supports it; otherwise the game may later spend reserved slots on a dedicated stand-up.

### Dash forward/back — 4 cels each

Launch → travel → brake → footing recovery.

No body motion blur. Exhaust, sparks and phase trails are separate.

### Jump family — 11 cels

```text
3 launch
2 rise
1 apex
2 fall
3 land
```

Physics controls vertical movement. Cels describe posture and mechanical phase rather than moving the sprite through space by themselves.

## 6. Defence and reactions

Final art gives distinct drawings to states that the compatibility atlas currently compresses.

```text
standing guard        2
crouching guard       2
high block impact     3
low block impact      3
instant block         3
guard crush           5
light hit             4
heavy hit             5
counter stagger       5
air hit               4
wall impact           4
knockdown fall        7
grounded hold         1
wakeup                 4
```

### Guard

Guard must show the protected lane. Attached shields, forearms and emitters remain aligned with the body.

### Block impact

Compression rather than damage. The Frame keeps structural control.

### Guard crush

The guard actually opens. Citadel anchors release, Bastion forearms split, Viper’s crossed guard is displaced, Mirage’s attached prism interception angle breaks.

### Hits

Light hit is local displacement. Heavy hit changes the line of action. Counter stagger is a different reaction again, not a recoloured heavy hit.

### Knockdown

Seven fall drawings allow:

```text
balance failure
major mass rotation
secondary rotation
first floor contact
hard settle
secondary settle
transition to hold
```

A giant machine never collapses like a human actor scaled up.

## 7. Throws

Final throw budget: **21 cels**.

```text
grab whiff       3
throw attacker   8
throw receiver   6
throw break      4
```

The eight attacker drawings cover attempt, secure contact, load, reposition/rotation, release, impact follow-through and recovery.

The six receiver drawings are designed as a cross-Frame compatibility family. Individual Frame dimensions still matter, so every pairing is tested in the game rather than assuming one generic receiver looks correct against every attacker.

## 8. Normal attacks

### Standing light — 5 cels

Recommended shape:

```text
0 intent
1 load
2 hero contact
3 overshoot/recoil
4 recovery
```

### Standing heavy — 8 cels

```text
0 initial intent
1 load
2 final anticipation
3 active entry
4 hero impact
5 overshoot
6 recoil
7 vulnerable recovery
```

### Crouching light — 5 cels

Same economy as standing light, but body compression and ground clearance are independently designed.

### Crouching heavy — 8 cels

The low committed move needs enough drawings to show real hip, anchor or shoulder load.

### Jumping light — 5 cels

Compact and readable against the jump phase.

### Jumping heavy — 7 cels

Extra anticipation/overshoot is allowed because the move is committed and its landing relationship matters.

## 9. Specials, reversal and Overdrive

### Special A — 10 cels
### Special B — 10 cels

A special receives:

```text
0 intent
1 load
2 final anticipation
3 commit
4 active entry
5 hero active
6 active continuation/overshoot
7 recoil
8 recovery
9 return
```

Effects remain separate and can have their own frame counts.

### Reversal — 8 cels

The reversal owns its **own production body bank**:

```text
trigger
brace
active entry
hero counter
active continuation
recoil
recovery
return
```

This fixes the current compatibility problem where reversal presentation can reuse an Overdrive body bank.

### Overdrive body — 14 cels

The Pilot cut-in is separate. The Frame still needs a premium physical sequence after the portrait clears.

Recommended structure:

```text
0 initial limiter release
1 mechanical alignment
2 deeper load
3 final pre-commit
4 attack entry
5 active approach
6 hero contact A
7 hero contact B / chaining continuation
8 active finish
9 overshoot
10 recoil
11 recovery A
12 recovery B
13 return / final held machine pose
```

Fourteen body drawings are intentionally extravagant relative to a normal attack but still far from a modern cinematic animation.

## 10. Named move banks

### Bastion / BX-09 GRAVEBELL

| Bank | Move | Cels |
|---|---|---:|
| Standing light | Rivet Driver | 5 |
| Standing heavy | GRAVEBELL | 8 |
| Crouching light | Ankle Vise | 5 |
| Crouching heavy | Slag Rake | 8 |
| Jumping light | Falling Rivet | 5 |
| Jumping heavy | Deadweight | 7 |
| Special A | Redline Bore | 10 |
| Special B | Anvil Lock | 10 |
| Reversal | Blow-Off | 8 |
| Overdrive | Kiln Verdict | 14 |

Motion identity: **hydraulic weight**.

Rivet Driver is a short piston strike. GRAVEBELL visibly loads rear foot, pelvis, shoulder and forearm before the descending contact. Redline Bore aligns the entire recoil path. Anvil Lock is a physical two-arm clamp. Blow-Off is a compact emergency pressure discharge. Kiln Verdict locks heel anchors, shoulders and cooling hardware before the attack.

### Viper / VX-27 CUTGLASS

| Bank | Move | Cels |
|---|---|---:|
| Standing light | Cutwire | 5 |
| Standing heavy | Sky Needle | 8 |
| Crouching light | Low Trace | 5 |
| Crouching heavy | Copper Snare | 8 |
| Jumping light | Flash Tooth | 5 |
| Jumping heavy | Drop Knife | 7 |
| Special A | Switchback | 10 |
| Special B | Blue Sever | 10 |
| Reversal | Backspark | 8 |
| Overdrive | Neon Autopsy | 14 |

Motion identity: **razor snap**.

Fast startup does not mean missing anticipation. Viper compresses the silhouette harder over fewer ticks. Blade cassettes stay physically mounted. Switchback has one real body and separate route afterimages. Neon Autopsy uses multiple true body contacts but never lets afterimages replace the actual Frame.

### Citadel / CX-88 NINTH GATE

| Bank | Move | Cels |
|---|---|---:|
| Standing light | Gatepost | 5 |
| Standing heavy | Meridian Lock | 8 |
| Crouching light | Footing Check | 5 |
| Crouching heavy | Redoubt | 8 |
| Jumping light | Falling Gate | 5 |
| Jumping heavy | Keepfall | 7 |
| Special A | Fault Writ | 10 |
| Special B | Crown Wall | 10 |
| Reversal | Deadbolt | 8 |
| Overdrive | Crown Engine | 14 |

Motion identity: **containment brace**.

Citadel deliberately holds setup drawings longer. Guard and emitter hardware must remain attached. Crown Wall originates from declared field hardware. Crown Engine can hold an active body pose while separate field FX animate around it.

### Mirage / MX-04 FALSE SUN

| Bank | Move | Cels |
|---|---|---:|
| Standing light | Ghost Index | 5 |
| Standing heavy | Parallax | 8 |
| Crouching light | Zero Scratch | 5 |
| Crouching heavy | Event Line | 8 |
| Jumping light | Glass Mote | 5 |
| Jumping heavy | Afterfall | 7 |
| Special A | False Entry | 10 |
| Special B | Null Needle | 10 |
| Reversal | SLIP/0 | 8 |
| Overdrive | Black Geometry | 14 |

Motion identity: **phase drift**.

At every simulation step exactly one physical Mirage body exists. False vectors, source/destination echoes, null lines and calibration distortions are separate effect cels.

## 11. CORE, entrance and result states

```text
SYSTEM DOWN   5
REIGNITION    5
heat vent     4
entrance      6
victory       6
defeat        6
```

SYSTEM DOWN shows actual loss of powered posture. REIGNITION restores control in visible stages. Heat vent uses body shutters and separate steam FX.

Entrance is the last service-cradle/deployment body sequence before gameplay ready. It should work with the cable and crew as separate scene layers.

Victory and defeat are character animation. Six cels is enough for personality without turning results into long movies.

## 12. Per-Frame cadence

The same number of source drawings does not make the Frames move alike.

| Frame | Idle target | Walk target | Light target | Heavy target |
|---|---:|---:|---:|---:|
| Bastion | 60 ticks | 30 ticks | 12 ticks | 24 ticks |
| Viper | 48 | 18 | 8 | 18 |
| Citadel | 66 | 34 | 14 | 26 |
| Mirage | 54 | 24 | 10 | 20 |

These are animation-language targets and must be reconciled to live game timings. Combat startup, active, recovery, hitstop and damage remain game-authoritative.

## 13. FX ownership

Body cels do not include:

- hit sparks;
- slash or energy planes;
- muzzle or rocket trails;
- steam clouds;
- dust clouds;
- phase doubles;
- super background fields;
- camera shake;
- bloom;
- text.

Recommended native FX sizes:

```text
small universal   64 × 64
medium universal  96 × 96
Frame-specific    160 × 160
full-screen field 640 × 360 only when genuinely required
```

The hit pose must read before the effect is composited.

## 14. Pilot cut-ins

Each Pilot has three separate Overdrive cels at **320 × 112**:

```text
super-charge
super-call
super-resolve
```

These are held cel illustrations, not video. They are composited for a short presentation freeze and clear before the physical Frame sequence becomes difficult to read.

## 15. Production order

Do not start by generating 224 drawings independently.

Per Frame:

1. construction master;
2. one-colour silhouette;
3. gameplay ready pose;
4. 4-cel idle;
5. forward/back walk;
6. dash, crouch and jump family;
7. guards and reaction family;
8. throw pair test against every other launch Frame;
9. standing/crouching/air normals;
10. implemented special;
11. planned special only when gameplay contract is ready, or as clearly blocked study;
12. reversal;
13. Overdrive body;
14. system states;
15. entrance, victory and defeat;
16. separate Frame FX;
17. native 160 × 160 review, silhouette review, grayscale review and all-arena test;
18. pack only after the game exports a matching 256-slot live manifest.

Art Studio repairs one failed cel or one failed sequence section. It does not regenerate a successful fighter because one drawing drifted.

## 16. Blocking rules

A final production cel fails when:

- the Frame cannot be identified in silhouette;
- a joint centre, hardpoint or limb length drifts without a pose reason;
- an attached weapon changes side;
- body art touches the four-pixel safety boundary;
- grounded foot contact moves accidentally;
- a walk looks like sliding;
- a heavy attack lacks anticipation or punishable recovery;
- guard crush reuses ordinary hit art;
- Mirage false imagery replaces its real body;
- effect art is baked into body cels;
- a provider generated a full final sheet in one image;
- the 160 × 160 master was automatically downscaled into the current 128 × 128 runtime contract;
- the game has not yet adopted the matching production atlas but final promotion is attempted.

The first production proof remains Branka + Bastion + Foundry Nine + the HEAVY METAL FIGHTING title, HUD and Kiln Verdict cut-in.
