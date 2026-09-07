# Game production intake

Art Studio accepts only exact `art-studio` packets from Game Design Studio production plans and only the routed Art operations documented by the creative-production contract. Intake is read-only and never authorizes a provider, workspace mutation, creative approval, game-repository write or publication.

## Reviewed gate receipt boundary

A bare gate ID is not approval evidence. Gate dependencies such as `gate/style-approved` are satisfied only by a `creative-production-gate-receipt` with `status=approved-reviewed`, matching plan source digest, an exact snapshot of the gate's declared dependencies, review evidence and authority that only records an external approval. Gate receipts cannot execute production, grant additional approval, mutate a consumer repository or publish.

## Reviewed production receipt boundary

Non-gate prerequisites require a structured `creative-production-receipt`, not a packet ID. The receipt must be `completed-reviewed`, match the plan source digest and exact predecessor packet/studio/repository/operation, and contain an artifact revision digest plus review evidence. Invalid or duplicate receipts fail closed.

Art Studio emits the same production receipt format for its own reviewed output through `createGameProductionReceipt(...)`. A receipt establishes provenance and a concrete reviewed revision; it does not itself confer human creative approval or downstream execution authority.

Use `node tools/game_production_intake_cli.mjs --plan <plan.json> --gate-receipt <gate-receipt.json> --completed-receipt <receipt.json>` for agent-safe admission.

## Exact delivered-file manifest

After a reviewed Art receipt exists, hash its real delivery files with:

`node tools/game_production_artifact_manifest_cli.mjs RECEIPT.json ARTIFACT_ROOT FILES.json --output artifact-manifest.json`

Artifact-manifest schema `1.1.0` records exact SHA-256 file digests, byte lengths, roles/media types and a deterministic `deliveryRoot` derived from the reviewed receipt lineage. The consumer stages files at:

`<consumer-artifact-root>/<deliveryRoot>/<file.path>`

with `deliveryRoot = artifacts/art-studio/<24-hex-lineage-id>`.

Art classification is operation-specific:

- `produce-environment-art`, `produce-game-art`, and `produce-game-ui` require at least one `canonicalRuntimeAsset=true` file. Optional review/support files remain non-canonical.
- `produce-environment-key-art` and `produce-game-concept-art` are forced review-only. They cannot become runtime assets by changing `classification` metadata.

The emitter validates a real reviewed receipt, its evidence/review record and zero-authority fields before hashing any files. Safe relative paths and symlink containment are enforced.

Matching SHA-256 values prove byte integrity against the manifest, not publisher identity. Authentic publisher/reviewer identity requires a separate trusted signing/attestation layer.

## Hybrid 3D handoff

For hybrid 3D work, Art Studio should lock silhouette, palette, material language, camera/readability and target display scale before 3D production begins. Existing provider admission, production workers, project-art workspaces and final review remain authoritative after intake.

## Interfaces

- Intake CLI: `node tools/game_production_intake_cli.mjs --plan PLAN.json --gate-receipt GATE.json --completed-receipt RECEIPT.json`
- Receipt emission: `scripts/game-production-intake.mjs#createGameProductionReceipt`
- Artifact manifest: `node tools/game_production_artifact_manifest_cli.mjs RECEIPT.json ARTIFACT_ROOT FILES.json --output MANIFEST.json`
- Local contract doctor: `node scripts/check-game-production-contract.mjs`
- Contract discovery: `creative-production.integration.json`
- Gate receipt schema: `schemas/creative-production-gate-receipt-v1.schema.json`
- Production receipt schema: `schemas/creative-production-receipt-v1.schema.json`
- Artifact manifest schema: `schemas/creative-production-artifact-manifest-v1.schema.json` (`1.1.0`)
