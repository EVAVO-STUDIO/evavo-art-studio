# HEAVY METAL FIGHTING — combat animation production bible

Status: canonical Art Studio production design; current runtime facts and planned extensions are labelled separately  
Public title: **HEAVY METAL FIGHTING**  
Technical game repository: `steel-dominion`  
Logical game canvas: 640 × 360  
Native Frame cel: 128 × 128  
Current Frame delivery: 120 authored source cels per Frame

## 1. Purpose

This document turns the launch-four fighting design into a production-ready animation plan.

The goal is not to imitate any commercial sprite or animation. The goal is to apply the strongest lessons of 1990s arcade production:

- silhouette before surface detail;
- anticipation, contact and recovery before interpolation;
- a small number of excellent held cels rather than mushy smoothness;
- Pilot character and Frame machinery treated as equal identities;
- mechanical recoil, balance, service and cooling logic visible in every action;
- separate body, impact and screen-effect ownership;
- short, decisive super presentation rather than long modern cinematics.

Combat timing, hitboxes, damage, input recognition and runtime slot authority remain in the game repository. Art Studio plans and reviews what those facts should look like.

## 2. Production north star

HEAVY METAL FIGHTING should look like an original premium giant-machine fighter that could plausibly have shipped between 1994 and 1997.

It should feel:

```text
heavy
readable
mechanical
aggressive
broadcast
corporate
hand-authored
```

It must not become a modern 3D render reduced to pixels, a generic anime mech roster, a heavy-metal album cover, a cloud of effects hiding weak poses, or a set of independently redesigned AI images.

## 3. The authored-source rule

The 120 authored cels are source production units. They are not assumed to be identical to current runtime slot numbers.

Current game mapping:

```text
120 authored source cels
104 unique current runtime slots
16 current reserved slots
4 current shared boundaries: 24, 44, 64 and 84
```

Planned atlas-v2 mapping:

```text
120 authored source cels
120 unique runtime slots
0 reserved slots
0 collisions
```

Art Studio retains every authored source cel even where the current game maps two source cels to one runtime slot.

`sourceBank` always means the authored production bank. `currentRuntimeBank` records what the present game actually displays. `plannedProductionBank` records the collision-free target. Reversals therefore receive their own authored high-output bank even while the current runtime reuses the Overdrive bank.

Final art for a planned-only bank remains blocked until the corresponding game move or atlas migration becomes authoritative.

## 4. Nine-cel attack grammar

Every normal, special, reversal and Overdrive bank is designed around:

| Local cel | Function |
| ---: | --- |
| 0 | readable startup intent |
| 1 | deeper load or compression |
| 2 | final pre-contact silhouette |
| 3 | active entry |
| 4 | hero impact |
| 5 | active overshoot or continuation |
| 6 | immediate recoil |
| 7 | visibly vulnerable recovery |
| 8 | controlled return or bridge |

The hero impact normally sits at local cel 4. Viper may peak earlier and Citadel may sustain later, but the exception must be declared. Effects cannot rescue a body pose that fails in one colour.

## 5. Shared state and reaction library

Implemented source states:

```text
idle A
idle B
walk contact left
walk contact right
ready
crouch
guard
jump
dash
hit
knockdown
wakeup
throw start
thrown receiver
throw break
throw recoil
victory
defeat
```

Planned atlas-v2 utility studies:

```text
walk passing left
walk passing right
block impact
guard crush
jump apex or fall
landing compression
heavy or counter stagger
wall or air impact
SYSTEM DOWN
REIGNITION
heat vent
entrance or restrained taunt
```

Walking is weight transfer, not sprite sliding. Bastion releases the heel late and lets shoulders follow hips; Viper uses a fast digitigrade passing pose with almost no bounce; Citadel visibly counterbalances shield mass; Mirage uses exact foot placement while false movement remains separate FX.

Guard shows the protected lane and attached hardware. Block impact and guard crush need distinct atlas-v2 poses. A Frame knockdown is planned as balance failure, mass rotation, first contact, settle and grounded hold. Every throw is paired choreography: secure physical contact, load/rotation, release/slam, initiator recoil, receiver pose and throw-break separation.

## 6. Bastion / BX-09 GRAVEBELL

Motion identity: **hydraulic weight**  
Pilot: Branka Kovac  
Primary art rule: long load, decisive contact, visible pressure recovery

| Move | Runtime status | Art bank |
| --- | --- | --- |
| Rivet Driver | implemented | standing light |
| GRAVEBELL | implemented | standing heavy |
| Ankle Vise | implemented | crouch light |
| Slag Rake | implemented | crouch heavy |
| Falling Rivet | implemented | jump light |
| Deadweight | implemented | jump heavy |
| Redline Bore | implemented | special A |
| Anvil Lock | planned game move | special B |
| Kiln Verdict | implemented Overdrive | high-output A |
| Blow-Off | implemented but currently shares body bank | planned distinct high-output B |
| Load Transfer | current universal throw system | neutral/throw source |

Rivet Driver retracts the wrist piston while feet and core remain fixed; contact is short and square. GRAVEBELL loads across the rear anchor and drives a broad descending forearm, leaving the arm low during punishable recovery. Redline Bore aligns forearm tool, shoulder and rear heel anchor along one force path. Anvil Lock is a planned physical clamp, never telekinesis. Blow-Off is a compact emergency pressure reversal. Kiln Verdict locks heel anchors and dorsal shutters before an enormous piston verdict that remains readable beneath separate furnace FX.

## 7. Viper / VX-27 CUTGLASS

Motion identity: **razor snap**  
Pilot: Miho Tagawa  
Primary art rule: fast compression, abrupt contact, violent mechanical brake

| Move | Runtime status | Art bank |
| --- | --- | --- |
| Cutwire | implemented | standing light |
| Sky Needle | implemented | standing heavy |
| Low Trace | implemented | crouch light |
| Copper Snare | implemented | crouch heavy |
| Flash Tooth | implemented | jump light |
| Drop Knife | implemented | jump heavy |
| Switchback | planned game move | special A |
| Blue Sever | implemented | special B |
| Backspark | implemented but currently shares body bank | planned distinct high-output A |
| Neon Autopsy | implemented Overdrive | high-output B |
| Route Theft | current universal throw system | neutral/throw source |

Cutwire is minimal cassette exposure and immediate retract. Sky Needle releases a rising diagonal through hip and shoulder. Switchback is a planned route-change feint with one real body and separate afterimages. Blue Sever’s arc follows a physically extended cassette. Backspark is a compact defensive electrical snap. Neon Autopsy connects all real contact keys through actual hip and shoulder mechanics while afterimages remain FX.

## 8. Citadel / CX-88 NINTH GATE

Motion identity: **containment brace**  
Pilot: Esi Quartey  
Primary art rule: measured setup, broad controlled active, structural reset

| Move | Runtime status | Art bank |
| --- | --- | --- |
| Gatepost | implemented | standing light |
| Meridian Lock | implemented | standing heavy |
| Footing Check | implemented | crouch light |
| Redoubt | implemented | crouch heavy |
| Falling Gate | implemented | jump light |
| Keepfall | implemented | jump heavy |
| Fault Writ | implemented | special A |
| Crown Wall | planned game move | special B |
| Crown Engine | implemented Overdrive | high-output A |
| Deadbolt | implemented but currently shares body bank | planned distinct high-output B |
| Right of Way | current universal throw system | neutral/throw source |

Gatepost places a structural jab into the lane while the containment side stays controlled. Meridian Lock sweeps with real guard geometry. Fault Writ establishes a low control line through attached anchors and emitters. Crown Wall is a planned one-body-width field emitted from physical hardware. Deadbolt is a short guard lock and detonation, not a miniature super. Crown Engine forms a complete containment geometry around a clearly visible central body.

## 9. Mirage / MX-04 FALSE SUN

Motion identity: **phase drift**  
Pilot: Parvaneh Razi  
Primary art rule: precise physical key, separate false vector, controlled return

| Move | Runtime status | Art bank |
| --- | --- | --- |
| Ghost Index | implemented | standing light |
| Parallax | implemented | standing heavy |
| Zero Scratch | implemented | crouch light |
| Event Line | implemented | crouch heavy |
| Glass Mote | implemented | jump light |
| Afterfall | implemented | jump heavy |
| False Entry | planned game move | special A |
| Null Needle | implemented | special B |
| SLIP/0 | implemented but currently shares body bank | planned distinct high-output A |
| Black Geometry | implemented Overdrive | high-output B |
| Null Proof | current universal throw system | neutral/throw source |

At every simulation step there is one authoritative Mirage body. False Entry is a planned feint ending in a real close-range strike. Null Needle extends declared lance segments in order. SLIP/0 uses separate source/destination echoes. Black Geometry forms false vectors around one locked body sequence and one real attack lane.

## 10. Overdrive presentation

Every launch Overdrive uses three Pilot cels:

```text
super-charge
super-call
super-resolve
```

Recommended flow:

```text
two-tick confirmation
hard palette flash
Pilot charge cel enters in framed strip
Pilot call cel + separately authored move name
Pilot resolve cel + Frame-specific screen field
cut-in clears
real body startup and contact
brief impact freeze and Frame FX
stage returns immediately
```

The portrait strip occupies no more than one third of screen height. Portrait occupancy is capped at twenty presentation ticks: six entry, six call, five resolve and three clear. These holds may use a game-authoritative freeze window but cannot alter startup, active, recovery, hitstop or damage. The opponent cannot remain hidden through the active sequence.

Colour scripts:

- **Kiln Verdict:** bone-grey, oxide red and furnace orange.
- **Neon Autopsy:** graphite, blue-green and acid lime.
- **Crown Engine:** deep indigo, ochre and amber.
- **Black Geometry:** dark plum, pale ceramic, magenta and amber.

## 11. Art Studio production sequence

For each Frame:

1. approve construction views, silhouette, landmarks, hardpoints and material ramps;
2. approve ready, idle and locomotion source studies;
3. approve reaction, guard and throw choreography;
4. approve startup, hero contact and recovery for each implemented normal;
5. complete implemented special;
6. complete Overdrive;
7. complete reversal only against the current bank contract or explicitly mark atlas-v2 output;
8. retain planned secondary special as concept/source study until the game move contract exists;
9. add separate Frame FX;
10. validate in 640 × 360, 320 × 180, grayscale, silhouette and mirrored contexts;
11. pack only approved cels after the live runtime manifest matches the handoff.

## 12. Blocking gates

Production fails when a hardpoint changes side, a weapon grows or loses joints, grounded feet slide, active and recovery silhouettes are confusable, a planned move is labelled implemented, a current shared bank is treated as a distinct final bank, Mirage’s false vector replaces the body, effects hide hero contact, a provider generates the final atlas directly, identity changes between cels, or the result depends on smooth filtering.

The first full production proof remains:

```text
Branka Kovac
Bastion / BX-09 GRAVEBELL
Foundry Nine
Danube Works service cradle
HEAVY METAL FIGHTING title and HUD context
```
