# Classic Adventure VGA Production

## Purpose

`classic-adventure-vga-1990s` is the governed Art Studio production profile for original 1990s-style DOS VGA point-and-click adventure assets. It does not apply a retro filter to modern art and it does not reproduce commercial game content. It compiles one exact work order at a time for native rooms, foreground occluders, actor cels, portraits, interface panels, cursors, inventory objects and close-up plates.

The first reference binding is `reference-classic-adventure-vga`, an original archaeological mystery called **The Obsidian Index**. Its proof layout uses a 320×200 logical screen, a 320×160 gameplay viewport and a persistent 40-pixel verb panel.

## Production model

```text
Adventure Studio scene and interaction contract
  -> Art Studio profile and project binding
  -> one immutable candidate per work order
  -> native-scale deterministic QA
  -> named creative review
  -> mastered PNG and evidence
  -> Adventure Studio source-art contract
  -> Godot Game Test Lab source admission
  -> Godot Linux import, startup and export
  -> deterministic play journey
  -> recorded gameplay, screenshots and contact sheet
  -> runtime assertions and agent-readable report
```

Art Studio owns art production, identity continuity, alpha mastering, selection and approval lineage. Adventure Studio owns the game scene, runtime semantics, interface reservation and source-art expectations. Godot Game Test Lab independently reads the admitted bytes and proves that the actual game imports, builds, launches and responds to input in the pinned Linux sandbox.

## Native art rules

The profile treats native resolution as the authoring target rather than an export side effect.

- Persistent-verb-panel rooms are 320×160.
- The interface panel is 320×40.
- Standard actor cels use a 32×64 canvas with pivot `(16, 58)` and ground line `58`.
- Portraits are 96×96.
- Cursors are 16×16.
- Inventory objects are 32×32.

The larger authoring canvases are exact integer multiples used for controlled generation or editing. Every final master is reconstructed and reviewed on the native pixel grid. Nearest-neighbour enlargement is a review view, not a substitute for native-size review.

## Palette and pixel grammar

A controlled project palette and room palette must be decided before final art lock. Colour count, actor identity ramps and interface accents are production contracts rather than an unrestricted 256-colour allowance.

Required visual doctrine:

- large readable value masses;
- strong actor and prop silhouettes;
- an unobstructed walk lane;
- exits readable without a hotspot overlay;
- material-specific dithering rather than global noise;
- purposeful connected pixel clusters;
- no antialiasing, soft alpha, blur, bloom, procedural pixel noise or generated typography;
- no modern smooth resize as the final pixel-authoring operation;
- no fake transparency grid or hidden matte colour.

The profile vocabulary deliberately contains blocking failure codes for modern resize artefacts, antialiasing, generic AI styling, procedural noise, unsafe alpha, UI-reservation drift and copyrighted imitation.

## Alpha policy

Opaque room, interface, portrait and close-up plates remain fully opaque. Actor cels, cursors, icons, inventory objects and foreground occluders require genuine transparency. Strict classic production uses only alpha `0` and `255`, with zero RGB under fully transparent pixels. Soft edges and painted checkerboards block delivery.

Art Studio performs its normal alpha classification and mastering before promotion. Godot Game Test Lab 0.8.0 independently decodes the final PNG again and rejects partial alpha, hidden transparent RGB, malformed PNG structure, palette overflow and declared-dimension drift.

## Review views

Room review retains:

- 1× native pixels;
- 8× nearest-neighbour enlargement;
- intended 4:3 display-aspect preview for DOS 320×200 art;
- actual gameplay composite with actor and interface;
- thumbnail and grayscale hierarchy views.

Actor review retains:

- 1× native pixels;
- 8× nearest-neighbour enlargement;
- gameplay composite in multiple room palettes;
- silhouette;
- hostile matte;
- ordered animation strip.

Technical success never grants creative approval. A named reviewer still decides whether composition, historical production grammar, character identity, atmosphere and originality are acceptable.

## Reference-title boundary

Reference titles such as *King's Quest V*, *Quest for Glory IV*, *Gabriel Knight: Sins of the Fathers*, *Police Quest IV* and *Indiana Jones and the Fate of Atlantis* may inform separately documented engine and production measurements. This profile contains no commercial character, room, logo, dialogue, map, interface drawing, music or puzzle solution. Included proof projects and all distributable assets remain original.

## Compile the proof project

```powershell
node scripts/game-art-production/profile-cli.mjs project `
  --project reference-classic-adventure-vga

node scripts/game-art-production/profile-cli.mjs work-order `
  --project reference-classic-adventure-vga `
  --asset room `
  --subject archive-hall `
  --group night `
  --unit archive-hall-night `
  --intent "Original archive interior with a clear walk lane and persistent verb-panel reservation."
```

Actor animation work additionally supplies the required `frameIndex` token through the programmatic work-order API.

## Godot Test Lab binding

The first binding is pinned to Godot Game Test Lab commit:

```text
0b07c4834e798776c86687791e6e54ea6816ce98
```

That Test Lab release adds the independent `classic-adventure-vga-art` checker and `godot-lab-classic-vga` command. The Adventure Studio proof workflow must use the same exact Test Lab SHA for both the source-art preflight and the reusable Linux sandbox call. Moving branch references are not release evidence.

The Linux sandbox remains responsible for:

- exact target SHA checkout;
- read-only source mount;
- no-network, non-root container execution;
- Godot project import;
- startup and parser errors;
- Linux export;
- deterministic keyboard, mouse and semantic input journeys;
- gameplay movie recording;
- checkpoint screenshots and contact sheet generation;
- scene, node, input and metadata assertions;
- retained runtime logs and an agent-readable summary.

## What a pass proves

A full passing chain proves that the exact original source bytes meet the declared classic-art contract and that the exact committed Godot project imports, builds, launches, accepts the scripted interactions and emits reviewable visual evidence in the pinned Linux sandbox.

It does not prove that the art is beautiful, historically authentic, legally cleared, identical to a commercial title or creatively approved. Those remain explicit human and project-governance decisions.
