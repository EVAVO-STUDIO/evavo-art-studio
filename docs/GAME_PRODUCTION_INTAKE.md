# Game production intake

Art Studio accepts only exact `art-studio` packets from Game Design Studio production plans and only the routed Art operations documented by the creative-production contract. Intake is read-only and never authorizes a provider, workspace mutation, creative approval, game-repository write or publication.

## Reviewed gate receipt boundary

A bare gate ID is not approval evidence. Gate dependencies such as `gate/style-approved` are satisfied only by a `creative-production-gate-receipt` with `status=approved-reviewed`, matching plan source digest, an exact snapshot of the gate's declared dependencies, review evidence and authority that only records an external approval. Gate receipts cannot execute production, grant additional approval, mutate a consumer repository or publish.

## Reviewed production receipt boundary

Non-gate prerequisites require a structured `creative-production-receipt`, not a packet ID. The receipt must be `completed-reviewed`, match the plan source digest and exact predecessor packet/studio/repository/operation, and contain an artifact revision digest plus review evidence. Invalid or duplicate receipts fail closed.

Art Studio emits the same production receipt format for its own reviewed output through `createGameProductionReceipt(...)`. A receipt establishes provenance and a concrete reviewed revision; it does not itself confer human creative approval or downstream execution authority.

Use `node tools/game_production_intake_cli.mjs --plan <plan.json> --gate-receipt <gate-receipt.json> --completed-receipt <receipt.json>` for agent-safe admission.

For hybrid 3D work, Art Studio should lock silhouette, palette, material language, camera/readability and target display scale before 3D production begins. Existing provider admission, production workers, project-art workspaces and final review remain authoritative after intake.

Contract discovery is available in `creative-production.integration.json`; gate receipts use `schemas/creative-production-gate-receipt-v1.schema.json` and production receipts use `schemas/creative-production-receipt-v1.schema.json`.
