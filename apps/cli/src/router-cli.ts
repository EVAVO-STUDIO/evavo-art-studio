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
} else {
  // Every existing Art Studio command remains owned by the established CLI.
  await import("./index.js");
}
