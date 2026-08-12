# HEAVY METAL FIGHTING — title, selection, HUD, super and intro bible

Status: canonical Art Studio presentation plan  
Logical screen: 640 × 360  
Pilot portrait master: 256 × 256  
Pilot Overdrive cut-in cel: 320 × 112  
Opening: 30 separate full-screen cels, 798 ticks at 60 Hz

## 1. Presentation goal

The front end must feel like a premium 1990s arcade fighter built around real industrial machinery.

It uses bold bitmap hierarchy, expressive Pilot portraits, large readable Frame cards, hard mechanical transitions, a living service bay rather than a generic menu backdrop, short dramatic portrait cut-ins, clean competitive HUD information and limited full-screen animation where it has the most value.

It does not use modern glass panels, tiny telemetry, generic cyberpunk gradients, fake sponsor text or a rotating modern 3D showroom.

## 2. Title identity

```text
HEAVY METAL
FIGHTING
WAR CIRCUIT // 2089
```

`HEAVY METAL` uses bone-grey industrial slab forms. `FIGHTING` uses a heavier hazard-red face. Both sit in one black-steel structural housing. The hand-pixelled title remains readable at 320 × 180 and passes one-colour and four-colour reductions. It uses no skulls, flames, chains, wings or unreadable spikes and must not resemble a music festival or album logo.

## 3. Title and attract screen

The background is a live service bay.

Layer order:

1. corporate city and rain;
2. bay opening;
3. selected Frame in service cradle;
4. technicians and diagnostic arms;
5. foreground console and rail;
6. title;
7. subtitle and start prompt;
8. optional attract-demo window.

Motion is held and mechanical: warning lamps, one maintenance arm, two technician loops, restrained cooling or sensor idle, rain and diagnostic overlays, then governed demo excerpts after inactivity. Fog never hides unfinished art.

## 4. Main menu

```text
EXHIBITION
DOMINION CIRCUIT
VERSUS
TRAINING
SERVICE BAY
RECORDS
OPTIONS
```

The selected item locks with a two-cel mechanical cursor. Description text arrives on a short diagnostic wipe. There is no deep animated menu journey before play.

## 5. Pilot select

Pilot choice comes first. The screen contains a 228 × 252 portrait panel, a 2 × 2 Pilot grid, name/handle/affiliation rail, trait summary, record/contract state and help rail.

Each Pilot requires:

```text
identity front
identity three-quarter
select idle
select focus
versus
HUD small
comms neutral
comms warning
comms pain
super charge
super call
super resolve
victory
defeat
dossier or ending
```

The select portrait changes between held `select-idle` and `select-focus` cels. It does not need a smooth animated bust.

### Branka Kovac / GRAVEBELL

Early-forties load marshal; square face, broken nose, pale jaw scar, short dark hair with one grey streak; tan-grey jacket, oxide-red load tabs and matte black link suit. Acting is direct, protective and controlled rather than a generic action-hero scream.

### Miho Tagawa / CUTGLASS

Late-twenties expressway systems runner; compact triangular face, alert eyes, short asymmetric black hair; graphite service jacket, blue-green shoulder blocks, one acid-lime route stripe and amber visor worn up. Never a manic hacker, catlike fighter or neon collage.

### Esi Quartey / NINTH GATE

Late-thirties structural engineer and emergency-yard commander; tall composed silhouette, long face and close braided crown; deep-indigo work coat, ochre binding, survey tablet and compact hearing protection. Authority comes through stillness and crew awareness.

### Parvaneh Razi / FALSE SUN

Mid-thirties optical-field physicist; narrow face, tired precise eyes, blunt dark hair and one naturally pale temple; dark-plum signal suit, short pale calibration coat and amber lens at the collar. Never a mystical assassin or supernatural ghost.

Every Pilot uses fifteen locked portrait states and eighteen service/cockpit states. Face silhouette, hair mass, collar, scars, clothing state and light direction are continuity authority.

## 6. Frame select

Any qualified Pilot may choose any launch Frame. The screen contains a large Frame viewport, 2 × 2 grid, code/epithet/class, crew requirement, CORE type, combat doctrine, Pilot compatibility and selected Pilot badge.

Each Frame construction family includes:

```text
front
side
three-quarter
rear/service
one-colour silhouette
mechanical landmark map
Pilot/crew/access diagram
hardpoint and upgrade clearance
damage-zone map
hero Frame card
```

The display may use held ready/idle cels or a service-cradle study. It never becomes a modern 3D turntable.

## 7. Service bay and loadout

Upgrades are constrained by declared hardpoints. The screen shows Frame, selected hardpoint, fitted module, repair/damage state, crew, CORE/cooling and campaign cost.

The 102 service-bay, crew and upgrade assets are:

```text
12 shared bay assets
42 crew-role assets
24 universal upgrade icons
24 Frame-specific upgrade cards
```

Seven crew roles each receive ready portrait, full-body idle, working, signal, injured and unavailable. Visible upgrades cannot invalidate animation clearance or replace the Frame silhouette wholesale.

## 8. Versus screen

Pilot and Frame are equal identities. Show large portraits, Frame silhouettes, code/epithet, crew/CORE, centre arena/rules plate and one optional rivalry line. Portraits and silhouettes arrive on separate shutters; arena locks last.

## 9. Match HUD

Hierarchy:

1. Structure;
2. timer and rounds;
3. guard integrity;
4. CORE reserve;
5. Overdrive/system state;
6. Pilot and Frame identity.

CORE is a segmented high-output rail, not a smooth mana gradient.

Planned states:

```text
normal
low CORE
SYSTEM DOWN
REIGNITION
heat warning
internal breach
Overdrive ready
```

Crew condition is not a permanent second health bar. An internal breach may briefly identify a station; campaign results retain the full report.

## 10. Overdrive cut-ins

Overdrive uses three Pilot cels: charge, call and resolve.

| Ticks | Event |
| --- | --- |
| 0–1 | input accepted; timing stays game-authoritative |
| 2–3 | hard palette flash and stage darkening |
| 4–9 | charge portrait enters |
| 10–15 | call portrait plus bitmap move name |
| 16–20 | resolve portrait and Frame-specific screen field |
| 21+ | cut-in clears before physical hero contact |

The strip is no more than one third of screen height. Portrait occupancy is capped at 20 presentation ticks. These holds may sit inside a game-authoritative super freeze but never change move timing, damage or hitstop.

- **Kiln Verdict:** horizontal warning rail; bone-grey, oxide red and furnace orange.
- **Neon Autopsy:** diagonal route cut; graphite, blue-green and acid lime.
- **Crown Engine:** vertical command card; indigo and amber containment grid.
- **Black Geometry:** calibration strip splits into three offsets then re-aligns; plum, pale ceramic, magenta and amber.

Move names are separately authored bitmap assets. Image providers do not draw text.

## 11. Round and campaign results

Show winner, Pilot, Frame, integrity, CORE, campaign crew report and score/credits/repair consequence. Victory art never becomes cheerful confetti over a casualty report.

## 12. Opening and attract sequence

The opening contains 30 separate full-screen cels with variable holds, pans, palette events and registered overlays. Total target: 798 ticks, approximately 13.3 seconds at 60 Hz.

1. corporate megacity in rain;
2. broadcast towers turn;
3. Dominion Feed fills a building face;
4. crowd watches a Frame knockout;
5. presenter freezes on a smile;
6. transit gate scans commuters;
7. candidate receives a red mark;
8. recovery agents enter a corridor;
9. eye and hand scan;
10. name becomes contract index;
11. crew lockers open;
12. Branka locks link collar;
13. Miho lowers visor;
14. Esi checks crew;
15. Parvaneh watches diagnostic fail;
16. Bastion dormant in cradle;
17. technicians seal armour;
18. external power enabled;
19. Pilot capsule closes;
20. crew lamps turn green;
21. umbilical unlocks;
22. cable retracts with one arc;
23. sensor line ignites;
24. first foot leaves cradle;
25. blast doors open;
26. cage powers;
27. Frames enter opposite tunnels;
28. Pilot portrait slash;
29. first heavy contact freezes;
30. title locks.

Rules: no modern cinematic, no final storyboard sheet, one source image per shot, all text separate, repeated backgrounds and overlays encouraged, instantly skippable, selected shots reusable in attract mode.

Attract mode is a 40-second composition with no new source family:

1. 7-second title/service-bay hold;
2. 8-second Pilot/Frame/crew/CORE billing;
3. 18-second governed demo-fight excerpt;
4. 7-second circuit record and sign-off.

It uses hard shutters and palette wipes, never smooth video cross-fades, and exits immediately on confirm.

## 13. Exact source-art allocation

| Family | Images |
| --- | ---: |
| Title and shell | 42 |
| Pilot portraits | 60 |
| Frame construction | 40 |
| Frame animation | 480 |
| Frame damage overlays | 16 |
| Universal combat FX | 115 |
| Frame-specific FX | 160 |
| Arena layers | 40 |
| Service bay, crew and upgrades | 102 |
| Pilot service animation | 72 |
| Opening intro | 30 |
| **Total** | **1,157** |

Frame-specific FX allocate forty per Frame: ten each for implemented special, planned secondary special, reversal and Overdrive. Planned special/reversal output remains gated where the game or atlas contract is not authoritative.

Arena layers allocate ten per arena: far plate, far loop, midground, machinery loop, fight plane, containment, foreground, light mask, hazard/damage state and selection card.

## 14. Art Studio tools and approval

The read-only adapter exposes summary, mechanical and presentation contracts, Pilot, Frame, move roster, single move, source cel, runtime slot, screen, Overdrive, intro, attract mode, exact allocation, batch, style proof, verification and hash-bound handoff.

Approval order:

1. title construction;
2. Branka identity;
3. Bastion construction;
4. Pilot and Frame select compositions;
5. Bastion ready, locomotion, Rivet Driver and GRAVEBELL;
6. Kiln Verdict cut-in/contact;
7. Foundry Nine HUD composite;
8. Viper, Citadel and Mirage;
9. service bay and arenas;
10. 30-cel opening after identities are stable.

The style proof cannot approve itself. Named human approval remains required.
