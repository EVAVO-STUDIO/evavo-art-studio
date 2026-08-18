#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import {
  handleSpritePlanCommand,
  type SpritePlanCommandValues,
} from "./sprite-plan-commands.js";

const COMMANDS: Readonly<Record<string, string>> = {
  protocol: "sprite-plan-protocol",
  validate: "sprite-plan-validate",
  compile: "sprite-plan-compile",
};

async function emit(value: unknown, output?: string): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (output) await writeFile(output, content, "utf8");
  else process.stdout.write(content);
}

async function main(): Promise<void> {
  const action = process.argv[2];
  if (!action || !COMMANDS[action]) {
    throw new Error("Usage: evavo-art-sprite-plan <protocol|validate|compile> [--input request.json] [--output result.json]");
  }

  const parsed = parseArgs({
    args: process.argv.slice(3),
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
    },
    allowPositionals: false,
    strict: true,
  });

  const result = await handleSpritePlanCommand(
    COMMANDS[action],
    parsed.values as SpritePlanCommandValues,
  );
  if (!result.handled) {
    throw new Error(`Sprite-plan command was not handled: ${COMMANDS[action]}`);
  }
  await emit(result.value, parsed.values.output);
}

main().catch((error: unknown) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "EVAVO_ART_SPRITE_PLAN_CLI_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 1;
});
