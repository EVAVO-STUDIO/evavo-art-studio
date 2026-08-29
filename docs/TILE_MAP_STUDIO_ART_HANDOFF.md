# Tile Map Studio art handoff

Art Studio accepts governed source-art requirements produced by `evavo-tile-map-studio` without taking ownership of map semantics, topology, collision, navigation, placement, or gameplay meaning.

## 1. Compile the Tile Map handoff

```powershell
pnpm art -- tile-map-handoff `
  --input C:\TileMapEvidence\consumer-art-handoffs-003\epochbound-verdant.json `
  --output C:\ArtEvidence\epochbound-verdant.plan.json
```

The input must use Tile Map Studio art-handoff schema v2 and declare Art Studio's role as `source-art-generation-and-creative-approval`.

## 2. Compile the governed source package

```powershell
pnpm art -- tile-map-source-package `
  --input C:\ArtEvidence\epochbound-verdant.plan.json `
  --output C:\ArtEvidence\epochbound-verdant.source-package.json
```

Brand-new families stay out of source-driven edit/repair queues until a real source exists. Each task carries exact canvas, projection, candidate count, required approved variants, immutable semantic rules, creative direction, alpha requirements and create-only output contracts.

## 3. Compile provider-neutral candidate jobs

```powershell
pnpm art -- tile-map-candidate-batch `
  --input C:\ArtEvidence\epochbound-verdant.source-package.json `
  --output C:\ArtEvidence\epochbound-verdant.candidate-batch.json
```

The batch expands each family into deterministic candidate jobs. Candidate IDs are derived from the semantic-map fingerprint, task ID and candidate index. Every provider request remains `intermediate-only`, every approval flag begins false, and providers may not alter semantic rules, projection or canvas.

Provider execution happens separately. The provider result manifest must name each planned candidate ID/path and record the exact output SHA-256.

## 4. Admit provider outputs into review

```powershell
pnpm art -- tile-map-candidate-review `
  --batch C:\ArtEvidence\epochbound-verdant.candidate-batch.json `
  --results C:\ArtEvidence\epochbound-verdant.provider-results.json `
  --output C:\ArtEvidence\epochbound-verdant.review.json
```

Review intake verifies the exact candidate-batch fingerprint, candidate IDs, planned paths, current file hashes, PNG decoding, expected canvas and alpha requirements. Exact duplicate candidate bytes are rejected.

The review manifest is still not approval. Every admitted candidate is explicitly:

```text
structural_review = pending
visual_review     = pending
creative_review   = pending
promotion_eligible = false
```

## 5. Finalize structural, visual and creative review

Create a review-decision file tied to the exact review fingerprint, with one decision per candidate:

```text
structural = approved | rejected
visual     = approved | rejected
creative   = approved | rejected
```

Then compile the finalization:

```powershell
pnpm art -- tile-map-review-finalize `
  --review C:\ArtEvidence\epochbound-verdant.review.json `
  --decisions C:\ArtEvidence\epochbound-verdant.review-decisions.json `
  --output C:\ArtEvidence\epochbound-verdant.review-finalized.json
```

Only candidates passing all three gates enter `approved_sources`. Rejected candidates remain in the retained review evidence but are not promotion-eligible.

## 6. Export exact reviewed sources for Sprite Studio

```powershell
pnpm art -- tile-map-approved-sources `
  --package C:\ArtEvidence\epochbound-verdant.source-package.json `
  --review C:\ArtEvidence\epochbound-verdant.review.json `
  --approval C:\ArtEvidence\epochbound-verdant.review-finalized.json `
  --output C:\ArtEvidence\epochbound-verdant.approved-sources.json
```

The exporter requires the source package, review and finalization to agree on:

- source-package fingerprint;
- semantic-map fingerprint;
- map ID;
- projection;
- exact candidate IDs, paths and SHA-256 values;
- review fingerprint.

An approved source must correspond to a candidate that passed structural, visual and creative review. Manual insertion of a rejected or unreviewed candidate fails closed.

It then verifies the actual approved files again: portable relative path, exact SHA-256, real PNG bytes, exact tile canvas or minimum feature canvas, alpha when required, and distinct bytes for distinct required variants.

The final `manifest_fingerprint` covers the complete reviewed evidence chain. `pre_review_manifest_fingerprint` preserves the lower-level source approval fingerprint for debugging/provenance.

## 7. Sprite Studio mastering

Sprite Studio receives only the exact reviewed/creatively approved files. It may trim, normalize and package them only within its declared lossless mastering contract.

Its manifest and build receipt must retain each source SHA-256 so Tile Map Studio can prove every atlas frame came from the exact approved source family.

## 8. Tile Map Studio trust return

```powershell
tile-map-import-sprite-bindings `
  C:\TileMapEvidence\epochbound-verdant.handoff.json `
  C:\SpriteEvidence\terrain\terrain.manifest.json `
  C:\SpriteEvidence\terrain\build.receipt.json `
  C:\SpriteEvidence\terrain\family-mapping.json `
  C:\TileMapEvidence\epochbound-verdant.trusted-bindings.json `
  --art-approval C:\ArtEvidence\epochbound-verdant.approved-sources.json
```

Tile Map Studio requires reviewed Art Studio evidence, the original semantic-map fingerprint, the complete Sprite Studio receipt package, exact family-mapping bytes, variant/canvas requirements and exact approved source hashes.

A valid provider result, successful Art Studio build, valid PNG, receipted Sprite package or technically correct atlas is never enough by itself.

## Authority chain

```text
Tile Map Studio  -> semantic/topology authority
Art Studio       -> source creation + structural/visual/creative approval
provider         -> candidate generation only
Sprite Studio    -> lossless mastering + atlas receipt
Tile Map Studio  -> final semantic/package trust
```

## Evidence chain

```text
semantic map fingerprint
  -> Tile Map handoff SHA-256
  -> Art Studio production plan fingerprint
  -> source-package fingerprint
  -> candidate-batch fingerprint
  -> exact provider candidate hashes
  -> review fingerprint
  -> review-finalization fingerprint
  -> reviewed approved-source manifest fingerprint
  -> exact approved source SHA-256 values
  -> Sprite Studio source hashes
  -> full Sprite Studio package receipt digest
  -> Tile Map trusted binding
```

No provider result, atlas coordinate or generated visual ever becomes semantic authority, and no technical success event becomes creative approval.
