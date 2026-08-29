# Tile Map Studio art handoff

Art Studio accepts governed source-art requirements produced by `evavo-tile-map-studio` without taking ownership of map semantics, topology, collision, navigation, placement, or gameplay meaning.

## 1. Compile the Tile Map handoff

From the Art Studio workspace:

```powershell
pnpm art -- tile-map-handoff `
  --input C:\TileMapEvidence\consumer-art-handoffs-003\epochbound-verdant.json `
  --output C:\ArtEvidence\epochbound-verdant.plan.json
```

The input must use Tile Map Studio art-handoff schema v2 and declare Art Studio's role as `source-art-generation-and-creative-approval`.

The plan preserves Tile Map Studio semantic rules and source IDs verbatim. Every family remains `intermediate-only`, `creative_approval_required`, and `blocked-pending-creative-approval`.

## 2. Compile a governed source-creation package

Brand-new tile families do not yet have a source image, so they must not be forced into Art Studio's existing source-driven repair/edit queue using fabricated placeholder files.

Compile the provider-neutral source package instead:

```powershell
pnpm art -- tile-map-source-package `
  --input C:\ArtEvidence\epochbound-verdant.plan.json `
  --output C:\ArtEvidence\epochbound-verdant.source-package.json
```

Each task contains:

- exact canvas dimensions;
- projection;
- required approved variant count;
- a larger candidate count for creative choice;
- immutable semantic/topology rules;
- creative direction notes;
- create-only candidate/review/approval locations;
- explicit structural, visual and creative approval gates.

The package assigns authority as follows:

```text
Tile Map Studio -> semantic authority
Art Studio      -> source creation and creative approval
provider        -> candidate generation only
Sprite Studio   -> lossless mastering and atlas receipt
```

Provider completion cannot promote a candidate.

## 3. Review and approve exact source files

Art Studio review produces a human/creative decision file tied to the exact source-package fingerprint. An approval decision references candidate files using portable forward-slash paths relative to the approval JSON and exact SHA-256 values.

Then compile the approved-source export:

```powershell
pnpm art -- tile-map-approved-sources `
  --package C:\ArtEvidence\epochbound-verdant.source-package.json `
  --approval C:\ArtEvidence\epochbound-verdant.approval.json `
  --output C:\ArtEvidence\epochbound-verdant.approved-sources.json
```

The exporter fails if:

- the approval targets a different source-package fingerprint;
- the decision is not explicitly `approved`;
- a required family is missing;
- fewer than the required number of variants are approved;
- two approved entries contain identical bytes;
- a path is absolute, traverses outside the approval directory or uses non-portable separators;
- an approved file's current bytes no longer match the recorded SHA-256.

Only a successful approved-source manifest is marked `eligible_for_sprite_studio: true`.

## 4. Sprite Studio mastering

Sprite Studio receives only the exact creatively approved files. It may trim/normalize/package within its declared lossless mastering contract but cannot change gameplay semantics or claim creative approval.

Its manifest and build receipt must retain each source file SHA-256 so Tile Map Studio can prove the atlas frames came from the exact approved Art Studio sources.

## 5. Tile Map Studio trust return

Tile Map Studio's production binding command now requires Art Studio approval evidence as well as Sprite Studio package evidence:

```powershell
tile-map-import-sprite-bindings `
  C:\TileMapEvidence\epochbound-verdant.handoff.json `
  C:\SpriteEvidence\terrain\terrain.manifest.json `
  C:\SpriteEvidence\terrain\build.receipt.json `
  C:\SpriteEvidence\terrain\family-mapping.json `
  C:\TileMapEvidence\epochbound-verdant.trusted-bindings.json `
  --art-approval C:\ArtEvidence\epochbound-verdant.approved-sources.json
```

Tile Map Studio verifies the entire Sprite Studio receipt package, exact family mapping bytes, variant/canvas requirements and that every bound Sprite frame's `source_sha256` belongs to the exact Art Studio-approved visual family.

A receipted atlas without creative approval is package-trusted but **not production-complete**.

## Authority boundary

Art Studio may create, compare, repair, reject and creatively approve visual candidates. It may not reinterpret terrain identity, edge/network signatures, feature placement, collision, navigation or canonical footprints.

A provider success, valid image file, successful build, valid Sprite Studio package or technically correct atlas can never imply creative approval.

## Evidence chain

The intended evidence chain is:

```text
Tile Map semantic map fingerprint
  -> Tile Map art handoff SHA-256
  -> Art Studio production plan fingerprint
  -> Art Studio source-package fingerprint
  -> creative approval file SHA-256
  -> approved-source manifest fingerprint
  -> exact approved source SHA-256 values
  -> Sprite Studio source SHA-256 records
  -> Sprite Studio full-package receipt digest
  -> Tile Map trusted binding receipt
```

No atlas coordinate or provider result becomes semantic or creative authority.
