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

## 3. Compile deterministic candidate and provider-runtime jobs

```powershell
pnpm art -- tile-map-candidate-batch `
  --input C:\ArtEvidence\epochbound-verdant.source-package.json `
  --output C:\ArtEvidence\epochbound-verdant.candidate-batch.json

pnpm art -- tile-map-provider-batch `
  --input C:\ArtEvidence\epochbound-verdant.candidate-batch.json `
  --output C:\ArtEvidence\epochbound-verdant.provider-runtime-batch.json
```

`tile-map-provider-batch` compiles every candidate through Art Studio's canonical provider request/runtime contract. It therefore inherits the normal provider protocol, capability selection, prompt compilation, deterministic seed, idempotency and evidence requirements rather than creating a Tile Map-specific image API.

Provider-facing visual-family IDs are deterministic hashed aliases so long semantic family names cannot exceed provider protocol identifier limits. The exact visual-family string remains in metadata and prompts.

Transparency policy is explicit:

- alpha-required families use `native-alpha`;
- other families use `provider-auto` with PNG output;
- implicit chroma-key defaults are not used.

No provider call happens during either compile step.

### One-command pre-provider compile

The same zero-cost compile chain can be produced in one create-only directory:

```powershell
pnpm art -- tile-map-preprovider `
  --input C:\TileMapEvidence\epochbound-verdant.handoff.json `
  --output-root C:\ArtEvidence\epochbound-verdant-preprovider
```

It writes:

```text
01-art-production-plan.json
02-source-package.json
03-candidate-batch.json
04-provider-runtime-batch.json
preprovider.receipt.json
```

The receipt hashes every stage and reports `ready-for-explicit-provider-authorization`. It never executes a provider.

## 4. Explicitly authorize provider execution

Tile Map provider jobs use a separate execution capability:

```text
tile-map.execution-authorized
```

The ordinary Art Studio worker does not advertise this capability, so it cannot accidentally claim Tile Map provider jobs.

Authorization submits the exact compiled jobs onto a fingerprint-isolated queue, forces `maximumAttempts = 1`, binds the source-map/provider-batch fingerprints, limits execution to explicitly named adapter IDs, and expires within at most 24 hours.

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

Before any provider call, validate the authorization and pristine runtime state:

```powershell
node .\scripts\validate-tile-map-provider-authorization.mjs `
  C:\ArtEvidence\run\05-provider-authorization.json
```

This validates source bytes/fingerprints, runtime protocol, isolated queue, exact job spec hashes, zero attempts/redrives and the dedicated execution capability.

## 5. Run the isolated provider worker

Only the dedicated worker may claim these authorized jobs:

```powershell
node .\scripts\run-authorized-tile-map-provider-worker.mjs `
  --authorization C:\ArtEvidence\run\05-provider-authorization.json `
  --command until-idle `
  --concurrency 1 `
  --receipt C:\ArtEvidence\run\06-provider-execution.receipt.json
```

The worker restricts the provider registry to the authorization's adapter allow-list, rechecks the active authorization for every job, and delegates execution to the normal Art Studio provider handlers only after all Tile Map checks pass.

Provider artifacts are then re-verified. Candidate artifacts must remain:

```text
storageClass = intermediate
artifactRole = provider-candidate
approvalState = unapproved
finalDeliverable = false
```

The execution worker cannot approve, promote, publish or mutate a target repository.

## 6. Materialize immutable candidates for Art Studio review

Provider candidates live in the immutable artifact store. Review uses ordinary files at the deterministic candidate paths, so an explicit evidence bridge materializes only verified `provider-candidate` artifacts:

```powershell
node .\scripts\materialize-tile-map-provider-results.mjs `
  --provider-batch C:\ArtEvidence\run\04-provider-runtime-batch.json `
  --execution-receipt C:\ArtEvidence\run\06-provider-execution.receipt.json `
  --artifact-root C:\ArtArtifacts\tile-map-run-001 `
  --output-root C:\ArtEvidence\run\07-provider-results
```

The bridge verifies the execution receipt, authorization, provider-batch fingerprint, artifact descriptors/content hashes and unapproved artifact boundary. It recreates the exact planned candidate paths and writes `provider-results.json` for review intake.

### Windows-first governed orchestration

The whole compile/authorization path is available as:

```powershell
.\scripts\Invoke-TileMapArtProviderPipeline.ps1 `
  -Handoff C:\TileMapEvidence\epochbound-verdant.handoff.json `
  -EvidenceRoot C:\ArtEvidence\epochbound-run-001 `
  -RuntimeRoot C:\ArtRuntime\epochbound-run-001 `
  -ArtifactRoot C:\ArtArtifacts\epochbound-run-001 `
  -AllowedAdapters @('fixture-image') `
  -AuthorizedBy 'EVAVO creative production'
```

By default this builds the required local packages, compiles the complete pre-provider chain, submits the isolated jobs, writes an authorization and validates it, **but does not make a provider call**.

Add `-ExecuteProvider` only when provider execution is deliberately intended. The script then runs the authorized worker, materializes candidates and creates the pending review manifest. Real provider credentials/configuration remain environment-owned (`OPENAI_API_KEY`, ComfyUI settings, etc.).

## 7. Admit provider outputs into review

```powershell
pnpm art -- tile-map-candidate-review `
  --batch C:\ArtEvidence\run\03-candidate-batch.json `
  --results C:\ArtEvidence\run\07-provider-results\provider-results.json `
  --output C:\ArtEvidence\run\08-candidate-review.json
```

Review intake verifies the exact candidate-batch fingerprint, provider-results bytes/root, candidate IDs, planned paths, current file hashes, PNG decoding, expected canvas and alpha requirements. Exact duplicate candidate bytes are rejected.

The review manifest is still not approval. Every admitted candidate is explicitly:

```text
structural_review = pending
visual_review     = pending
creative_review   = pending
promotion_eligible = false
```

## 8. Finalize structural, visual and creative review

Create a review-decision file tied to the exact review fingerprint, with one decision per candidate:

```text
structural = approved | rejected
visual     = approved | rejected
creative   = approved | rejected
```

Then compile the finalization:

```powershell
pnpm art -- tile-map-review-finalize `
  --review C:\ArtEvidence\run\08-candidate-review.json `
  --decisions C:\ArtEvidence\run\review-decisions.json `
  --output C:\ArtEvidence\run\09-review-finalized.json
```

Only candidates passing all three gates enter `approved_sources`. Rejected candidates remain in retained review evidence but are not promotion-eligible.

## 9. Export exact reviewed sources for Sprite Studio

```powershell
pnpm art -- tile-map-approved-sources `
  --package C:\ArtEvidence\run\02-source-package.json `
  --review C:\ArtEvidence\run\08-candidate-review.json `
  --approval C:\ArtEvidence\run\09-review-finalized.json `
  --output C:\ArtEvidence\run\10-approved-sources.json
```

The exporter requires source package, review and finalization to agree on the source-package fingerprint, semantic-map fingerprint, map ID, projection, exact candidate IDs/paths/SHA-256 values and review fingerprint. It also re-hashes the retained provider-results manifest and reopens candidate files from the exact candidate root captured during review intake.

An approved source must correspond to a candidate that passed structural, visual and creative review. Manual insertion of a rejected or unreviewed candidate fails closed.

Actual approved files are rechecked for portable path, exact SHA-256, real PNG bytes, exact tile canvas or minimum feature canvas, alpha when required, and distinct bytes for distinct required variants.

The final `manifest_fingerprint` covers the complete reviewed evidence chain. `pre_review_manifest_fingerprint` preserves the lower-level source approval fingerprint for debugging/provenance.

## 10. Sprite Studio mastering

Sprite Studio receives only the exact reviewed/creatively approved files. It may trim, normalize and package them only within its declared lossless mastering contract.

Its manifest and build receipt must retain each source SHA-256 so Tile Map Studio can prove every atlas frame came from the exact approved source family.

## 11. Tile Map Studio trust return

```powershell
tile-map-import-sprite-bindings `
  C:\TileMapEvidence\epochbound-verdant.handoff.json `
  C:\SpriteEvidence\terrain\terrain.manifest.json `
  C:\SpriteEvidence\terrain\build.receipt.json `
  C:\SpriteEvidence\terrain\family-mapping.json `
  C:\TileMapEvidence\epochbound-verdant.trusted-bindings.json `
  --art-approval C:\ArtEvidence\run\10-approved-sources.json
```

Tile Map Studio requires reviewed Art Studio evidence, the original semantic-map fingerprint, complete Sprite Studio receipt package, exact family-mapping bytes, variant/canvas requirements and exact approved source hashes.

The final trusted binding also retains the Art Studio pre-review, candidate-review and review-finalization fingerprints beside the Sprite package digest.

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
  -> provider-runtime-batch fingerprint
  -> execution authorization fingerprint
  -> provider execution receipt
  -> immutable provider candidate artifacts
  -> provider-results fingerprint
  -> review fingerprint
  -> review-finalization fingerprint
  -> reviewed approved-source manifest fingerprint
  -> exact approved source SHA-256 values
  -> Sprite Studio source hashes
  -> full Sprite Studio package receipt digest
  -> Tile Map trusted binding
```

No provider result, atlas coordinate or generated visual ever becomes semantic authority, and no technical success event becomes creative approval.
