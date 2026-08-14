# Game-art production profiles

Status: generic profile-driven game-art production foundation  
Scope: reusable game types, project bindings and governed one-asset work orders  
Provider execution: prohibited  
Automatic approval and promotion: prohibited

## Why this exists

Art Studio already has a strong generic campaign compiler and a deeply governed HEAVY METAL FIGHTING production chain. The HMF chain proved the important production rules: one candidate at a time, exact dimensions, alpha and pivot checks, explicit creative review, bounded repairs, exact-byte mastering, named-human approval and receipt-linked delivery readiness.

Those rules should not require a new hardcoded implementation for every game.

The profile system separates three concerns:

```text
GENERIC ENGINE
  validation, hashing, safe merging, path rendering, work-order compilation
        ↓
GAME-TYPE PROFILE
  era, genre, asset types, dimensions, QA, review presets, lifecycle defaults
        ↓
PROJECT BINDING
  title, subjects, repository, style direction, paths and bounded overrides
        ↓
ONE GOVERNED ASSET WORK ORDER
```

The generic engine contains no HMF roster, path, target-repository or title knowledge. It discovers profile and project files from configuration directories and resolves them at runtime.

## Configuration layout

```text
config/game-art-production/
├─ profiles/
│  ├─ arcade-fighter-1990s.v1.json
│  └─ pixel-platformer.v1.json
└─ projects/
   ├─ heavy-metal-fighting.v1.json
   └─ reference-pixel-platformer.v1.json
```

Adding another game type does not require editing the engine. Add a validated profile file and one or more project bindings.

## Generic engine

The reusable implementation is split by responsibility:

```text
scripts/game-art-production/
├─ common.mjs
├─ profile-validation.mjs
├─ project-resolution.mjs
├─ runtime.mjs
├─ index.mjs
└─ profile-cli.mjs
```

It provides:

- stable JSON validation and canonical SHA-256 identities;
- filesystem-safe profile and project discovery;
- reusable lifecycle validation;
- reusable asset-type contracts;
- integer authoring-scale validation;
- data-driven QA and failure vocabularies;
- data-driven human review modes and criteria;
- bounded project specialization;
- authority non-escalation;
- safe tokenized `working/` and `masters/` paths;
- deterministic project and work-order compilation;
- one-asset-only provider prompts;
- no provider, approval, promotion, Git or publication authority.

## Profile responsibilities

A game-type profile defines reusable production grammar, not a specific game roster.

Each profile contains:

```text
profile identity and tags
default batch and repair policy
receipt lifecycle and human gates
review presets
asset-type contracts
dimensions and authoring scale
alpha, pivot and ground rules
QA checks
failure codes
prompt fragments
non-escalatable authority boundary
```

### 1990s arcade fighter

The `arcade-fighter-1990s` profile is the high-quality preset for games with:

- character body-cel animation;
- strong silhouette and impact readability;
- separate physical bodies and effects;
- portraits and arcade interface art;
- layered fight arenas;
- nearest-neighbour pixel mastering;
- native, enlarged, composite, thumbnail, silhouette and grayscale review.

Its default body-cel contract is:

```text
160 × 160 native
640 × 640 authoring
4× integer authoring scale
transparent RGBA
pivot 80,152
ground line 152
```

That matches the current production-master HMF body-cel contract, but the values live in a reusable game-type profile rather than the generic engine.

### Pixel platformer

The `pixel-platformer` profile proves that the same engine can resolve a different production model:

```text
32 × 32 character cels
16 × 16 environment tiles
320 × 180 parallax layers
16 × 16 interface and pickup icons
```

It uses tile adjacency, repeated-tile, gameplay-composite and parallax review instead of fighting-game body and stage review.

## Project bindings

A project binding supplies only project identity and bounded specialization:

```text
project id and public title
selected profile id
target repository identity
style direction
subject groups
asset-type aliases
smaller production limits
path templates
additional prompt fragments
reference-root templates
project metadata
```

A project cannot replace the lifecycle, grant provider execution, enable automatic approval, permit automatic promotion, mutate a target repository or publish.

### HMF as a project binding

HEAVY METAL FIGHTING now has a profile binding that maps current project terms to reusable types:

```text
frame-body-cel   → character-body-cel
pilot-portrait   → character-portrait
frame-effect-cel → effect-cel
arena-layer      → arena-layer
interface-element→ interface-element
```

Its Frame, Pilot and arena identities remain project data. The generic engine does not know Bastion, Viper, Citadel, Mirage, Branka or `steel-dominion`.

The current HMF work-order implementation remains a compatibility adapter while the generic profile engine becomes the foundation for new production surfaces and staged migration of existing ones.

## Bounded overrides

Projects may specialize these asset-type fields:

```text
nativeDimensions
authoringCanvas
alpha
pivot
groundLineY
reviewPreset
pathTemplate
masterPathTemplate
qaChecks
failureCodes
promptFragments
```

Every merged asset contract is fully revalidated.

Projects may reduce, but not increase, these profile defaults:

```text
batchSize
candidateFanout
maximumRepairAttempts
```

Arbitrary override keys, path traversal, unresolved path tokens and authority escalation fail closed.

## Tokenized output paths

Profiles and projects use runtime path templates such as:

```text
working/characters/{subjectId}/animation/{productionGroup}/{unitId}.png
working/frames/{subjectId}/sprites/{productionGroup}/slot-{bodySlot:03}.png
working/actors/{subjectId}/{productionGroup}/frame-{frameIndex:03}.png
```

Tokens must be explicitly supplied, filesystem-safe and complete. Numeric tokens can use fixed-width zero padding.

The compiler always verifies that working outputs remain beneath `working/` and masters remain beneath `masters/`.

## API

```js
import {
  compileGameArtProductionProject,
  compileGameArtProductionWorkOrder,
} from "./scripts/game-art-production/index.mjs";

const project = await compileGameArtProductionProject("heavy-metal-fighting");

const order = await compileGameArtProductionWorkOrder({
  resolvedProject: project,
  assetTypeId: "frame-body-cel",
  unitId: "hmf.frame-animation.bastion.slot-121",
  subjectId: "bastion",
  productionGroup: "normals",
  tokens: { bodySlot: 121 },
  creativeIntent: "Standing heavy hero-impact body cel with effects kept separate.",
});
```

The same compiler accepts a platformer, strategy game, card game, isometric game, RPG, adventure game or another data-defined profile without adding project branches to the engine.

## CLI

Verify all discovered profiles and projects:

```powershell
node scripts/game-art-production/profile-cli.mjs verify
```

Resolve one project:

```powershell
node scripts/game-art-production/profile-cli.mjs project heavy-metal-fighting
```

Compile one governed work order:

```powershell
node scripts/game-art-production/profile-cli.mjs work-order `
  heavy-metal-fighting `
  frame-body-cel `
  hmf.frame-animation.bastion.slot-121 `
  --subject bastion `
  --group normals `
  --intent "Standing heavy hero-impact body cel with effects kept separate." `
  --tokens-json body-slot-tokens.json
```

## Preserved lifecycle

Profiles retain the governed lifecycle:

```text
planned
  ↓
references-locked
  ↓
generation-authorized
  ↓
candidates-admitted
  ↓
deterministic-qa-passed
  ↓
creative-review-passed
  ↓
selected-or-repair-requested
  ↓
mastered
  ↓
named-human-approved
  ↓
delivery-ready
```

Human gates remain explicit. A profile cannot turn generated art into approved art automatically.

## Extending to another game type

1. Add `config/game-art-production/profiles/<profile-id>.v1.json`.
2. Define the game-type asset contracts, QA checks and review presets.
3. Add `config/game-art-production/projects/<project-id>.v1.json`.
4. Bind project aliases and subjects to the reusable asset types.
5. Run profile verification and compile representative work orders.
6. Add project-specific identity authorities only in the project adapter, never in the generic engine.

No switch statement, project-name conditional or generic-core edit is required.
