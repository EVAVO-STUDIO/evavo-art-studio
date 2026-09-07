# Game production intake

Art Studio accepts only exact `art-studio` packets from Game Design Studio production plans. Intake is read-only and never authorizes a provider, a workspace mutation, creative approval, a game-repository write or publication.

Non-gate prerequisites now require a structured `creative-production-receipt`, not a packet ID. The receipt must be `completed-reviewed`, match the plan source digest and exact predecessor packet/studio/repository/operation, and contain an artifact revision digest plus review evidence. Invalid or duplicate receipts fail closed.

Art Studio emits the same receipt format for its own reviewed output through `createGameProductionReceipt(...)`. A receipt establishes provenance and a concrete reviewed revision; it does not itself confer human creative approval or downstream execution authority.

Use `node tools/game_production_intake_cli.mjs --plan <plan.json> --completed-receipt <receipt.json>` for agent-safe admission.

For hybrid 3D work, Art Studio should lock silhouette, palette, material language, camera/readability and target display scale before 3D production begins. Existing provider admission, production workers, project-art workspaces and final review remain authoritative after intake.
