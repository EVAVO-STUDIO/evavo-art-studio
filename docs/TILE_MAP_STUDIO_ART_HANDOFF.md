# Tile Map Studio art handoff

Art Studio accepts governed source-art requirements from `evavo-tile-map-studio` without taking ownership of map semantics, topology, collision, navigation, placement, or gameplay meaning.

The production rule is:

```text
provider output is a working-resolution candidate
Art Studio mastering creates the exact native game asset
review judges the mastered native asset
creative approval remains explicit
Sprite Studio packages only approved masters
```

A provider is not expected to author a final 16×16, 32×32 or 64×32 image directly.

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

Each task carries:

- exact final game dimensions;
- projection;
- required approved variant count;
- a larger candidate pool for creative choice;
- immutable semantic and topology rules;
- creative direction;
- alpha requirements;
- create-only output contracts.

Brand-new art families remain outside source-driven repair/edit queues until real source art exists.

## 3. Compile deterministic candidate and provider-runtime jobs

```powershell
pnpm art -- tile-map-candidate-batch `
  --input C:\ArtEvidence\epochbound-verdant.source-package.json `
  --output C:\ArtEvidence\epochbound-verdant.candidate-batch.json

pnpm art -- tile-map-provider-batch `
  --input C:\ArtEvidence\epochbound-verdant.candidate-batch.json `
  --output C:\ArtEvidence\epochbound-verdant.provider-runtime-batch.json
```

`tile-map-provider-batch` uses Art Studio's canonical provider protocol. It retains normal capability selection, prompt compilation, deterministic seeding, idempotency, adapter-specific source-canvas selection and immutable artifact evidence.

Each job also includes a deterministic mastering contract:

```text
source canvas policy: provider-adapter-derived
final width/height: exact semantic task dimensions
resampling: lanczos3
format: lossless PNG
alpha-required source: explicit #00ff00 production matte
opaque source: opaque-preserve
fake transparency rejection: required
creative approval authority: false
```

Provider-facing family IDs are stable hashed aliases. The exact semantic visual-family ID remains in prompts and metadata.

### Zero-cost pre-provider compile

```powershell
pnpm art -- tile-map-preprovider `
  --input C:\TileMapEvidence\epochbound-verdant.handoff.json `
  --output-root C:\ArtEvidence\epochbound-verdant-preprovider
```

This writes:

```text
01-art-production-plan.json
02-source-package.json
03-candidate-batch.json
04-provider-runtime-batch.json
preprovider.receipt.json
```

No provider call occurs.

## 4. Explicitly authorize provider execution

Tile Map provider jobs require:

```text
tile-map.execution-authorized
```

The ordinary Art Studio worker does not advertise this capability.

```powershell
node .\scripts\tile-map-provider-authorize.mjs `
  --provider-batch C:\ArtEvidence\run\04-provider-runtime-batch.json `
  --runtime-root C:\ArtRuntime\tile-map-run-001 `
  --artifact-root C:\ArtArtifacts\tile-map-run-001 `
  --output C:\ArtEvidence\run\05-provider-authorization.json `
  --allowed-adapters fixture-image,openai-image `
  --authorized-by "EVAVO creative production" `
  --reason "Generate reviewed Tile Map candidates" `
  --authorized-at 2026-08-30T00:00:00.000Z `
  --expires-at 2026-08-30T01:00:00.000Z
```

Authorization:

- binds exact provider-batch and semantic-map fingerprints;
- uses one fingerprint-isolated queue;
- allows only explicitly named adapters;
- forces `maximumAttempts = 1`;
- expires within 24 hours;
- grants no approval, promotion, publication or repository-mutation authority.

Validate before execution:

```powershell
node .\scripts\validate-tile-map-provider-authorization.mjs `
  C:\ArtEvidence\run\05-provider-authorization.json
```

## 5. Run the isolated provider worker

```powershell
node .\scripts\run-authorized-tile-map-provider-worker.mjs `
  --authorization C:\ArtEvidence\run\05-provider-authorization.json `
  --command until-idle `
  --concurrency 1 `
  --receipt C:\ArtEvidence\run\06-provider-execution.receipt.json
```

Provider candidate artifacts must remain:

```text
storageClass = intermediate
artifactRole = provider-candidate
approvalState = unapproved
finalDeliverable = false
```

Re-verify retained execution at any time:

```powershell
node .\scripts\verify-tile-map-provider-execution.mjs `
  C:\ArtEvidence\run\06-provider-execution.receipt.json
```

## 6. Deterministically master provider candidates

Provider candidates are now converted to exact native game assets before review:

```powershell
node .\scripts\run-tile-map-candidate-mastering.mjs `
  --provider-batch C:\ArtEvidence\run\04-provider-runtime-batch.json `
  --execution-receipt C:\ArtEvidence\run\06-provider-execution.receipt.json `
  --concurrency 1 `
  --receipt C:\ArtEvidence\run\07-candidate-mastering.receipt.json
```

This uses Art Studio's existing `art.candidate.master-alpha` runtime handler. It:

- re-verifies provider request and artifact identity;
- recovers alpha from the explicit production matte when required;
- rejects accidental transparency for opaque assets;
- resizes once to the exact native game canvas;
- keeps lossless PNG output;
- runs blocking dimensions, alpha, fake-transparency, halo and raster QA;
- stores the mastered image as an immutable unapproved intermediate;
- stores separate finalization evidence;
- writes a self-hashed mastering receipt.

Tile families use `safePadding = 0` because valid roads, coastlines, walls and terrain transitions may intentionally touch declared canvas edges. Tile Map Studio's semantic edge, seam and topology QA owns those boundaries.

Verify retained mastering independently:

```powershell
node .\scripts\verify-tile-map-candidate-mastering.mjs `
  C:\ArtEvidence\run\07-candidate-mastering.receipt.json
```

## 7. Materialize mastered candidates for review

```powershell
node .\scripts\materialize-tile-map-provider-results.mjs `
  --provider-batch C:\ArtEvidence\run\04-provider-runtime-batch.json `
  --execution-receipt C:\ArtEvidence\run\06-provider-execution.receipt.json `
  --mastering-receipt C:\ArtEvidence\run\07-candidate-mastering.receipt.json `
  --artifact-root C:\ArtArtifacts\tile-map-run-001 `
  --output-root C:\ArtEvidence\run\08-mastered-provider-results
```

Only verified `provider-candidate-alpha-master` artifacts with passed quality evidence are materialized. Output is staged then atomically promoted into a new directory.

`provider-results.json` schema v2 binds:

- candidate batch;
- provider batch;
- execution receipt;
- mastering receipt;
- provider artifact;
- mastered artifact;
- mastering evidence artifact;
- exact planned candidate path;
- exact mastered file SHA-256;
- semantic-map fingerprint.

## 8. Admit mastered candidates into review

```powershell
pnpm art -- tile-map-candidate-review `
  --batch C:\ArtEvidence\run\03-candidate-batch.json `
  --results C:\ArtEvidence\run\08-mastered-provider-results\provider-results.json `
  --output C:\ArtEvidence\run\09-candidate-review.json
```

Review intake reopens and verifies the complete provider, authorization, execution and mastering chain. It requires native dimensions and exact materialized/mastered hashes.

Every admitted candidate remains:

```text
structural_review = pending
visual_review = pending
creative_review = pending
promotion_eligible = false
```

## 9. Finalize structural, visual and creative review

Create one decision per candidate, tied to the exact review fingerprint:

```text
structural = approved | rejected
visual = approved | rejected
creative = approved | rejected
```

```powershell
pnpm art -- tile-map-review-finalize `
  --review C:\ArtEvidence\run\09-candidate-review.json `
  --decisions C:\ArtEvidence\run\review-decisions.json `
  --output C:\ArtEvidence\run\10-review-finalized.json
```

Only candidates passing all three gates enter the approved set.

## 10. Export reviewed sources for Sprite Studio

```powershell
pnpm art -- tile-map-approved-sources `
  --package C:\ArtEvidence\run\02-source-package.json `
  --review C:\ArtEvidence\run\09-candidate-review.json `
  --approval C:\ArtEvidence\run\10-review-finalized.json `
  --output C:\ArtEvidence\run\11-approved-sources.json
```

The exporter re-hashes:

- source package;
- provider batch;
- provider execution receipt;
- mastering receipt;
- provider-results manifest;
- candidate review;
- review finalization;
- every approved PNG.

It rejects manual insertion of rejected, unreviewed, unmastered or stale-map candidate bytes.

## 11. Sprite Studio packaging

Sprite Studio receives exact Art Studio-approved native files. It may perform its declared deterministic lossless mastering and atlas packaging, but it cannot reinterpret semantic families or grant creative approval.

Its manifest must retain each source SHA-256. Its build receipt must cover every package file.

## 12. Tile Map Studio trust return

```powershell
tile-map-import-sprite-bindings `
  C:\TileMapEvidence\epochbound-verdant.handoff.json `
  C:\SpriteEvidence\terrain\terrain.manifest.json `
  C:\SpriteEvidence\terrain\build.receipt.json `
  C:\SpriteEvidence\terrain\family-mapping.json `
  C:\TileMapEvidence\epochbound-verdant.trusted-bindings.json `
  --art-approval C:\ArtEvidence\run\11-approved-sources.json
```

Production completion requires:

```text
creative_approval_verified = true
technical_mastering_verified = true
trust_schema_version = 3
production_complete = true
```

## Windows-first orchestration

Authorize without making a provider call:

```powershell
.\scripts\Invoke-TileMapArtProviderPipeline.ps1 `
  -Handoff C:\TileMapEvidence\epochbound-verdant.handoff.json `
  -EvidenceRoot C:\ArtEvidence\epochbound-run-001 `
  -RuntimeRoot C:\ArtRuntime\epochbound-run-001 `
  -ArtifactRoot C:\ArtArtifacts\epochbound-run-001 `
  -AllowedAdapters @('fixture-image') `
  -AuthorizedBy 'EVAVO creative production'
```

Execute the exact still-active authorization later:

```powershell
.\scripts\Resume-TileMapAuthorizedProvider.ps1 `
  -Authorization C:\ArtEvidence\epochbound-run-001\05-provider-authorization.json `
  -EvidenceRoot C:\ArtEvidence\epochbound-run-001 `
  -Concurrency 1
```

Or add `-ExecuteProvider` to the first command for one continuous authorized run.

## Zero-cost smoke

```powershell
.\scripts\Test-TileMapArtFixturePipeline.ps1 `
  -Handoff C:\TileMapEvidence\consumer-art-handoffs-003\epochbound-verdant.json
```

The deterministic fixture provider now honors the requested background strategy:

- chroma-key produces an opaque requested matte;
- native-alpha produces transparent borders;
- opaque-source remains fully opaque.

It exercises the actual provider, artifact, mastering, QA, materialization and review path without external spend. Fixture candidates are test evidence only and must never be production-approved.

## Authority chain

```text
Tile Map Studio -> semantic/topology authority
provider        -> working-resolution candidate generation only
Art Studio      -> deterministic native mastering + structural/visual/creative review
Sprite Studio   -> approved-source lossless packaging + atlas receipt
Tile Map Studio -> final semantic/package trust
```

No provider result, mastering success, atlas coordinate or build success becomes semantic or creative authority.
