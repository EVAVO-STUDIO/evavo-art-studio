#!/usr/bin/env node

const SPRITE_PLAN_COMMANDS: Readonly<Record<string, string>> = {
  "sprite-plan-protocol": "protocol",
  "sprite-plan-validate": "validate",
  "sprite-plan-compile": "compile",
};

const command = process.argv[2];
const spritePlanAction = command ? SPRITE_PLAN_COMMANDS[command] : undefined;

if (spritePlanAction) {
  // The dedicated sprite-plan CLI is the canonical file-based command surface.
  // Preserve all --input/--output arguments and translate only the action token.
  process.argv[2] = spritePlanAction;
  await import("./sprite-plan-cli.js");
} else if (command === "tile-map-handoff") {
  // Tile Map Studio owns map semantics and topology. Art Studio only compiles
  // the governed source-art task plan and cannot infer creative approval from
  // provider or build success.
  await import("./tile-map-handoff-cli.js");
} else if (command === "tile-map-source-package") {
  // Source creation begins only after the Tile Map handoff is validated. The
  // resulting package remains provider-neutral and keeps all generated output
  // blocked until structural, visual and creative approval gates are satisfied.
  await import("./tile-map-source-package-cli.js");
} else if (command === "tile-map-candidate-batch") {
  // Candidate jobs are deterministic envelopes around provider generation.
  // Provider output remains intermediate-only and all approvals begin false.
  await import("./tile-map-candidate-batch-cli.js");
} else if (command === "tile-map-candidate-review") {
  // Provider results enter review only after exact batch/id/path/hash/canvas
  // validation. The review manifest still has no approval authority.
  await import("./tile-map-candidate-review-cli.js");
} else if (command === "tile-map-approved-sources") {
  // Only explicitly approved, exact-hash source files may cross from Art Studio
  // into Sprite Studio mastering. Provider completion is never sufficient.
  await import("./tile-map-approved-sources-cli.js");
} else if (command?.startsWith("repair-")) {
  // Repair commands are intentionally isolated from the general CLI so the
  // immutable repair planner, revision, ranking and promotion protocols remain
  // reachable without weakening their separate authority boundaries.
  await import("./repair-cli.js");
} else {
  // Every existing Art Studio command remains owned by the established CLI.
  await import("./index.js");
}
