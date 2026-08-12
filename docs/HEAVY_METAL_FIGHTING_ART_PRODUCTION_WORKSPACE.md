# HEAVY METAL FIGHTING — Art Production Workspace

Status: production organization and style-governance authority  
Public title: **HEAVY METAL FIGHTING**  
Technical game repository: `steel-dominion`  
Final sprite target: 160 × 160 body cells, 224 unique body cels per Frame, 256-slot derivative atlas

## Why this exists

The project now has enough planned art that ad-hoc folders, chat attachments and generic prompt batches would create identity drift. This workspace makes the final art campaign reproducible and reviewable before provider generation begins.

It deliberately builds on Art Studio's existing persistent Artist Workspace rather than inventing another storage model. The persistent workspace owns these safe roots:

```text
sources/
working/
versions/
masks/
scratch/
review/
masters/
exports/
manifests/
journals/
```

HEAVY METAL FIGHTING adds a project taxonomy inside those roots.

## Canonical production tree

The materializer expands the complete tree from `config/heavy-metal-fighting/art-production-workspace.v1.json`. The important branches are:

```text
sources/
  authority/
  reference-ingest/
  runtime-manifests/

working/
  style/
    north-star/
    palette/
    materials/
    lighting/
    pixel-grammar/
    typography/
    anti-generic/
    style-proof/
  pilots/
    branka-kovac/
    miho-tagawa/
    esi-quartey/
    parvaneh-razi/
      identity/
      portraits/
      select/
      hud/
      comms/
      overdrive/
      service/
      cockpit/
  frames/
    bastion/
    viper/
    citadel/
    mirage/
      construction/
      landmarks/
      hardpoints/
      palette/
      sprites/
        neutral-locomotion/
        defence-reactions/
        throws/
        normals/
        specials-overdrive/
        core-entrance-result/
      fx/
      damage/
  arenas/
    foundry-nine/
    reactor-spine/
    orbital-dock/
    ash-citadel/
      far/
      mid/
      play-plane/
      foreground/
      lighting/
      ambient/
      damage/
      hazard/
  ui/
    title/
    main-menu/
    pilot-select/
    frame-select/
    versus/
    hud/
    service-bay/
    records/
    options/
    results/
    ending/
  intro/
    cels/
    overlays/
    timing/
  fx/
    universal/
    contact/
    core/
    system/
    frame/<frame>/

scratch/
  provider/
  composites/
  reference-tests/
  palette-tests/

review/
  style-proof/
  pilots/<pilot>/
  frames/<frame>/
  arenas/<arena>/
  native-scale/
  grayscale/
  silhouette/
  mirror/
  stage-composites/
  batches/

masters/
  pilots/
  frames/
  arenas/
  ui/
  fx/
  intro/

exports/runtime/
  frames/
  pilots/
  arenas/
  ui/
  fx/
  intro/

manifests/
  authority/
  contracts/
  census/
  batches/
  receipts/
  validation/
  delivery/

journals/
  decisions/
  rejections/
  repairs/
  batches/
```

`versions/` remains append-only and is owned by the existing persistent Artist Workspace snapshot system. We do not hand-edit its hierarchy.

## What belongs where

### `sources`

Immutable authority and reference inputs only: exact game revision metadata, exported slot manifests, approved historical research/reference evidence and source files handed into Art Studio. Never edit them in place.

### `working`

Current editable work. A selected provider candidate is admitted here only after provenance and technical checks. It is then snapshotted into append-only `versions` before substantial edits.

### `scratch`

Disposable experiments, provider candidates, comparison composites and palette tests. Nothing in `scratch` is approved merely because it looks promising.

### `review`

Evidence. Native-size views, silhouettes, grayscale, mirrors, arena composites, animation strips and batch review receipts go here. Review files are never the sole source of a master.

### `masters`

Only assets that passed the relevant named-human creative gate and deterministic technical gate.

### `exports`

Deterministic delivery derivatives. Final Frame atlases are built from approved individual masters; a provider never generates the atlas directly.

## Authentic 1990s style process

The style contract is `config/heavy-metal-fighting/style-authenticity-contract.v1.json`.

### 1. Design truth before rendering

Before a Frame receives animation cels, lock:

- one-colour silhouette;
- front, side and three-quarter construction;
- cockpit and crew location;
- mechanical landmarks;
- hardpoints;
- recoil/load path;
- cooling and service access;
- declared asymmetry and mirror policy;
- material ramps.

Before a Pilot receives portraits, lock:

- face proportions;
- hair mass;
- scars and permanent landmarks;
- occupational clothing logic;
- corporation-specific accents;
- cockpit/link-suit logic;
- expression vocabulary.

### 2. Pixel grammar

The final Frame body is native 160 × 160 with pivot `(80,152)`. The 640 × 640 authoring canvas exists for structural exploration; it is not a finished sprite. Final pixels are hand-mastered at native size with nearest-only delivery.

The visual rules are:

- connected intentional clusters;
- dark mechanical cavities;
- restrained material ramps;
- hard highlights and selected specular pixels;
- no global antialiasing;
- no soft PBR gradients;
- no baked bloom;
- no micro-panel noise that crawls between cels.

### 3. Held-cel animation

The objective is not maximum drawings. It is maximum clarity per drawing.

Every action must expose anticipation, commitment, hero contact, overshoot and vulnerable recovery. Simulation ticks hold strong cels. Viper changes drawings faster than Bastion; Citadel braces longer; Mirage keeps the physical body exact while false vectors live in separate FX.

### 4. 1990s cel-illustrated Pilots

Pilot art uses strong face shapes, decisive shadow masses and graphic colour blocks. It avoids modern glossy anime rendering, airbrushed skin, generic tactical clothing and provider-authored lettering.

### 5. Hard arcade UI

The UI is 640 × 360 first. Health, timer, rounds, guard and CORE read before decoration. Menus use latches and stepped wipes, not glass panels or spring motion. Pilot select foregrounds portrait personality; Frame select foregrounds machine silhouette, crew, CORE and doctrine.

## Anti-generic failure gate

An asset is rejected or sent to repair when it exhibits any of the contract's failure codes, including:

- random greebles or glowing seams;
- unexplained floating parts;
- weapon-side or joint-length drift;
- Pilot face, hair or costume drift;
- crawling microdetail;
- generated/malformed text;
- generic cyan-magenta cyberpunk colour soup;
- modern PBR gloss or airbrush gradients;
- over-smoothed in-between animation;
- effects hiding an unreadable body pose;
- glassmorphism UI;
- skull/flame/chain "heavy metal" clichés;
- provider contact sheets or packed final atlases.

A technical pass cannot waive these creative failures.

## Ten-image production batches

The governing policy is `config/heavy-metal-fighting/batch-production-policy.v1.json`.

Every provider batch:

- contains at most ten separate outputs;
- contains one asset per output;
- never pads a short batch with junk;
- never requests a contact sheet, collage or final packed atlas;
- stays inside one asset family;
- stays on one Pilot or Frame for identity-sensitive work;
- keeps Frame body animation within one of six coherent production groups;
- binds the exact style, identity, dimensions, alpha, pivot and continuity references before generation.

The final Frame body campaign is exactly:

| Group | Cels / Frame | Batches / Frame |
| --- | ---: | ---: |
| Neutral + locomotion | 39 | 4 |
| Defence + reactions | 52 | 6 |
| Throws | 21 | 3 |
| Normals | 38 | 4 |
| Specials + Overdrive | 42 | 5 |
| CORE + entrance + result | 32 | 4 |
| **Total** | **224** | **26** |

Across four Frames this is **104 Frame-body batches**.

The 677 supporting source images require a governed minimum of another 75 batches under their Pilot, Frame, arena or thematic containment rules. The whole 1,573-image launch campaign therefore has a **governed minimum of 179 batches**. The raw mathematical minimum is 158, but mixing identities merely to save batch count is prohibited.

## Candidate lifecycle

```text
planned
→ references locked
→ generation explicitly authorized
→ candidates admitted to scratch
→ deterministic QA
→ creative review
→ selected OR smallest bounded repair
→ working copy + append-only version
→ mastering
→ named-human approval
→ master
→ deterministic runtime export
```

A failed cel never causes automatic regeneration of passing siblings.

## Style-proof gate

Before mass production, the first proof remains:

```text
Branka Kovac
+ Bastion / BX-09 GRAVEBELL
+ Danube Works service cradle
+ Foundry Nine
+ HEAVY METAL FIGHTING title
+ Pilot select
+ Frame select
+ match HUD
+ Kiln Verdict three-cel Pilot cut-in
```

Review it at native 160 × 160, 640 × 360 match scale, 320 × 180 thumbnail scale, grayscale, silhouette-only, mirrored, and against all four implemented arena palettes.

Only after that proof is approved should the 896 final Frame body cels expand across the launch roster.

## Commands

Verify the contracts:

```powershell
node scripts/heavy-metal-fighting-production-workspace.mjs verify
```

Inspect the complete folder layout:

```powershell
node scripts/heavy-metal-fighting-production-workspace.mjs layout
```

Inspect the style contract:

```powershell
node scripts/heavy-metal-fighting-production-workspace.mjs style
```

Inspect the ten-image batching rules:

```powershell
node scripts/heavy-metal-fighting-production-workspace.mjs batch-policy
```

After Art Studio creates a persistent Artist Workspace, materialize this project taxonomy inside it:

```powershell
node scripts/heavy-metal-fighting-production-workspace.mjs materialize `
  --workspace-root "C:\path\to\persistent-workspace"
```

The materializer only creates safe subdirectories. It does not execute providers, approve candidates, mutate `steel-dominion`, commit, push or publish.
