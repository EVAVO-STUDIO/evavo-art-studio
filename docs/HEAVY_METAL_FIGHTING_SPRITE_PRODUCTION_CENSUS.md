# HEAVY METAL FIGHTING — sprite production census

Status: canonical **production-master target** for Art Studio; runtime migration still required  
Logical game canvas: **640 × 360**  
Current compatibility Frame cell: **128 × 128 / 120 slots**  
Production-master Frame cell: **160 × 160 / 256 slots**  
Production-master authored body cels: **224 per Frame**  
Launch Frame body cels: **896**

## Why the production target is larger than the current 120-cell atlas

The current 120-cell atlas is excellent as a deterministic gameplay/fallback contract, but it is too compressed for the final animation standard we are targeting. It currently asks a very small neutral library to carry locomotion, guard, reactions, throws and system states; it shares attack-boundary slots; and current high-output body-bank reuse constrains reversals.

A polished 1990s fighter should not be judged by how many drawings it shows every second. The important distinction is:

```text
UNIQUE DRAWINGS != SIMULATION TICKS
```

Classic arcade animation obtains weight from a relatively small set of strong drawings, deliberate holds, hitstop and readable spacing. It also contains many unique drawings across the *whole character* because every move, reaction and special needs its own silhouette.

HEAVY METAL FIGHTING therefore targets **224 unique body cels per Frame**, but most cels are displayed for two to six 60 Hz simulation ticks. Heavy Frames hold important poses longer; fast Frames change drawings faster. We gain richness across the complete move set without turning the game into smooth modern tween animation.

The 224-cel budget is intentionally between a sparse early-90s robot fighter and an extravagant hand-drawn late-90s character fighter. It gives the game enough animation language to feel premium while preserving the hard held-cel character we want.

## Native production cell

Final Frame body art should move to:

```text
cell            160 × 160
pivot            80, 152
ground line      y = 152
transparent edge 4 px minimum
atlas            16 × 16 cells
atlas size       2560 × 2560
used slots       224
reserved slots   32
```

Why 160 rather than 128:

- the Frames are 8–14 metre machines and should occupy roughly one third to two fifths of the 360-pixel-tall match screen;
- Citadel needs a visibly taller fortress silhouette than Viper without touching the crop edge;
- Bastion needs room for its piston forearms and broad heavy attacks;
- Mirage needs room for real attached hardware while false vectors remain separate FX;
- a 160-pixel cell still looks decisively pixel-authored at 640 × 360 and remains small enough for deliberate cluster work;
- two 160-cell fighters still leave abundant horizontal stage space in a 640-wide match.

The game currently requires 128 × 128 final atlases. **Do not silently resize 160-pixel production masters into those current atlases.** The game should receive a deliberate atlas-v3 migration before final body art is promoted.

The current 128/120 atlas remains useful for gameplay, fallback art, contract comparison and early style-proof previews.

## Canonical Frame size envelopes

These are visual targets, not hitboxes.

| Frame | Neutral height | Neutral width | Max body height | Max body width | Ground footprint |
|---|---:|---:|---:|---:|---:|
| Bastion | 136 px | 108 px | 142 px | 150 px | 92 px |
| Viper | 114 px | 76 px | 124 px | 144 px | 58 px |
| Citadel | 146 px | 120 px | 148 px | 152 px | 98 px |
| Mirage | 124 px | 84 px | 134 px | 146 px | 64 px |

This compresses the fictional metre differences enough for fair fighting-game readability while still making Citadel obviously taller and Viper obviously more compact.

The remaining cell area is breathing room for silhouette, articulated limbs and crop safety. Combat effects are not allowed to consume that body space by being baked into the Frame drawing.

## Exact 224-cel body census per Frame

### Neutral and locomotion — 39 cels

| Animation | Cels | Slots | Direction |
|---|---:|---:|---|
| Ready | 1 | 0 | definitive single identity pose |
| Idle | 4 | 1–4 | held mechanical settle loop |
| Walk forward | 6 | 5–10 | contacts and passing poses |
| Walk back | 6 | 11–16 | independently authored retreat gait |
| Crouch transition | 2 | 17–18 | compression |
| Crouch hold | 1 | 19 | stable low pose |
| Dash forward | 4 | 20–23 | launch, travel, brake, recover |
| Dash back | 4 | 24–27 | retreat burst, travel, brake, recover |
| Jump launch | 3 | 28–30 | compression through powered release |
| Jump rise | 2 | 31–32 | physics-driven rise |
| Jump apex | 1 | 33 | one strong apex drawing |
| Jump fall | 2 | 34–35 | descent preparation |
| Landing | 3 | 36–38 | impact, settle, recovery |

We do not reverse-play the walk to move backwards. A ten-metre machine transfers load differently when retreating.

### Defence and reactions — 52 cels

| Animation | Cels | Slots |
|---|---:|---:|
| Standing guard | 2 | 39–40 |
| Crouching guard | 2 | 41–42 |
| High block impact | 3 | 43–45 |
| Low block impact | 3 | 46–48 |
| Instant block | 3 | 49–51 |
| Guard crush | 5 | 52–56 |
| Light hit | 4 | 57–60 |
| Heavy hit | 5 | 61–65 |
| Counter stagger | 5 | 66–70 |
| Air hit | 4 | 71–74 |
| Wall impact | 4 | 75–78 |
| Knockdown fall | 7 | 79–85 |
| Grounded hold | 1 | 86 |
| Wakeup | 4 | 87–90 |

This is one of the most important upgrades over the compatibility atlas. `guard`, `block`, `guard crush`, `light hit`, `heavy hit`, `counter stagger` and `wall hit` should not all look like one reused damage pose.

### Throw choreography — 21 cels

| Animation | Cels | Slots |
|---|---:|---:|
| Grab whiff | 3 | 91–93 |
| Throw attacker | 8 | 94–101 |
| Throw receiver | 6 | 102–107 |
| Throw break | 4 | 108–111 |

The attacker sequence contains secure contact, load, rotation or repositioning, release/slam and recoil. Receiver art must remain mechanically compatible with all launch Frames. Frame-specific effects and screen shake can differ, but the contact geometry has to be physically plausible.

### Normals — 38 cels

| Attack | Cels | Slots |
|---|---:|---:|
| Standing light | 5 | 112–116 |
| Standing heavy | 8 | 117–124 |
| Crouching light | 5 | 125–129 |
| Crouching heavy | 8 | 130–137 |
| Jumping light | 5 | 138–142 |
| Jumping heavy | 7 | 143–149 |

A five-cel light is enough when the drawings are strong. An eight-cel heavy gives us a real load, contact overshoot and vulnerable recovery. We do not add filler drawings merely to make the animation smooth.

### Specials, reversal and Overdrive — 42 cels

| Action | Cels | Slots |
|---|---:|---:|
| Special A | 10 | 150–159 |
| Special B | 10 | 160–169 |
| Reversal | 8 | 170–177 |
| Overdrive body | 14 | 178–191 |

The reversal finally receives a distinct body bank instead of sharing the current Overdrive bank. The Overdrive’s **three Pilot cut-in cels are separate assets** and do not replace these fourteen body cels.

The fourteen Overdrive body drawings should feel extravagant by the standards of the rest of the character without becoming a modern cinematic. They cover the physical machine sequence after the short portrait strip clears.

### CORE, entrance and result states — 32 cels

| Animation | Cels | Slots |
|---|---:|---:|
| SYSTEM DOWN | 5 | 192–196 |
| REIGNITION | 5 | 197–201 |
| Heat vent | 4 | 202–205 |
| Arena entrance | 6 | 206–211 |
| Victory | 6 | 212–217 |
| Defeat | 6 | 218–223 |

SYSTEM DOWN is not just `idle` with the lights off. The chassis has to lose powered posture. REIGNITION visibly rebuilds system control. Heat venting uses real shutters/vents while steam remains separate FX.

Victory and defeat get six cels each because the machines and Pilots need character. A good 90s fighter lets the result pose tell you who the fighter is.

## Thirty-two reserved slots

Slots **224–255** remain empty until the game owns a real requirement.

Possible future users include:

- second wakeup route;
- additional throw receiver bank;
- air recovery;
- specific cage stun;
- crew-system failure posture;
- upgrade-specific clearance pose;
- boss-only system action;
- additional command move.

A reserved cell is not a prompt-writing opportunity. It remains transparent until gameplay makes it necessary.

## Per-Frame timing personality

The same cel budget does **not** mean the four Frames animate the same way.

### Bastion — heavy held

- 60-tick idle loop;
- about 30 ticks per full walking cycle;
- light normals around 12 visual ticks;
- heavy normals around 24 visual ticks;
- startup and recovery drawings are held longer than in the other Frames;
- contact frequently uses a one- or two-tick hard freeze supplied by gameplay;
- shoulder mass follows hip commitment rather than arriving simultaneously.

### Viper — fast snap

- 48-tick idle loop;
- about 18 ticks per walk cycle;
- light normals around 8 visual ticks;
- heavy normals around 18 visual ticks;
- fast drawing changes on startup;
- hero contact is still held long enough to read;
- braking and overshoot are more important than adding extra in-betweens.

### Citadel — measured brace

- 66-tick idle loop;
- about 34 ticks per walk cycle;
- light normals around 14 visual ticks;
- heavy normals around 26 visual ticks;
- setup drawings hold while anchors and containment hardware align;
- active field poses may hold longer, but effects never replace the body.

### Mirage — precise drift

- 54-tick idle loop;
- about 24 ticks per walk cycle;
- light normals around 10 visual ticks;
- heavy normals around 20 visual ticks;
- the real body remains extremely precise;
- false vectors and afterimages have independent timings and can be faster than the physical cel changes.

These are art-direction targets, not replacement combat timing. The game simulation remains authoritative.

## Supporting sprite dimensions

### Pilots

| Asset | Native size |
|---|---:|
| Portrait master | 256 × 256 |
| HUD portrait derivative | 56 × 56 |
| Overdrive cut-in cel | 320 × 112 |
| Service-bay standing figure | 192 × 256 |
| Cockpit cel | 320 × 180 |

Each Pilot keeps the existing fifteen portrait states, including three Overdrive states, plus the eighteen service/cockpit states already allocated.

### Frame construction and cards

| Asset | Native size |
|---|---:|
| Construction master | 320 × 320 |
| Hero/select card | 320 × 240 |
| Damage overlay | 160 × 160 |

The construction master is not a final gameplay cel. It is reference authority for the 160-pixel animation cells.

### Combat FX

| Class | Native size | Use |
|---|---:|---|
| Small universal FX | 64 × 64 | sparks, light contact, small guard response |
| Medium universal FX | 96 × 96 | heavy impacts, guard crush, landing and wall debris |
| Frame-specific FX | 160 × 160 | special, reversal, Overdrive and body-aligned systems |
| Full-screen field | 640 × 360 or engine effect | short super/palette/broadcast field only when actually required |

FX are separate images/layers. Mirage’s false body, Viper’s cutting plane, Citadel’s containment field and Bastion’s pressure plume never become permanent body pixels.

### Arenas and intro

Arena layers and opening cels remain **640 × 360**. The opening remains 30 separately authored full-screen cels. Pilot super cut-ins remain 320 × 112 and are composited over the match rather than expanding the Frame body atlas.

## Production inventory after atlas-v3 migration

The current governed campaign contains 1,157 source images, including 480 Frame body cels.

Replacing those 480 compatibility body cels with 896 production-master body cels yields:

```text
42   title and shell
60   Pilot portraits
40   Frame construction
896  Frame gameplay body animation
16   Frame damage overlays
115  universal combat FX
160  Frame-specific FX
40   arena layers
102  service bay, crew and upgrades
72   Pilot service animation
30   opening intro
----
1573 production-master source images
```

That is the target inventory we should generate for final production.

## What can start before the game migration

We can safely begin:

- title and bitmap UI style proof;
- all four Pilot identity masters;
- all four Frame construction masters;
- silhouette, landmark, hardpoint and palette studies;
- Branka/Bastion style proof;
- Pilot select and Frame select layout art;
- Foundry Nine background layers;
- Pilot Overdrive cut-in style proof;
- universal FX style tests.

We should **not promote final 160 × 160 body cels into the game** until `steel-dominion` owns the 256-slot atlas-v3 contract.

The next engineering slice after this census is therefore the game-side atlas-v3 migration and live manifest, after which Art Studio can open the 896 final Frame-body work units without ambiguity.
