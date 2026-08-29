#!/usr/bin/env node

const SPRITE_PLAN_COMMANDS: Readonly<Record<string, string>> = {
  "sprite-plan-protocol": "protocol",
  "sprite-plan-validate": "validate",
  "sprite-plan-compile": "compile",
};

const command = process.argv[2];
const spritePlanAction = command ? SPRITE_PLAN_COMMANDS[command] : undefined;

if (spritePlanAction) {
  process.argv[2] = spritePlanAction;
  await import("./sprite-plan-cli.js");
} else if (command === "tile-map-handoff") {
  await import("./tile-map-handoff-cli.js");
} else if (command === "tile-map-source-package") {
  await import("./tile-map-source-package-cli.js");
} else if (command === "tile-map-candidate-batch") {
  await import("./tile-map-candidate-batch-cli.js");
} else if (command === "tile-map-provider-batch") {
  // Candidate envelopes compile through the canonical Art Studio provider
  // runtime contract. Provider execution remains candidate-generation-only.
  await import("./tile-map-provider-batch-cli.js");
} else if (command === "tile-map-candidate-review") {
  await import("./tile-map-candidate-review-cli.js");
} else if (command === "tile-map-review-finalize") {
  // Finalization is the only step that can select candidate bytes after all
  // structural, visual and creative decisions are explicitly recorded.
  await import("./tile-map-review-finalize-cli.js");
} else if (command === "tile-map-approved-sources") {
  await import("./tile-map-approved-sources-cli.js");
} else if (command?.startsWith("repair-")) {
  await import("./repair-cli.js");
} else {
  await import("./index.js");
}
