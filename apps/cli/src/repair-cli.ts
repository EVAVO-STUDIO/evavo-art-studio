#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import {
  handleRepairCommand,
  type RepairCommandValues,
} from "./repair-commands.js";

const COMMANDS = new Set([
  "repair-protocol",
  "repair-validate",
  "repair-compile",
  "repair-run",
  "repair-revision-protocol",
  "repair-revision-validate",
  "repair-revision-compile",
  "repair-revision-run",
  "repair-revision-selection-protocol",
  "repair-revision-selection-validate",
  "repair-revision-selection-compile",
  "repair-revision-selection-run",
  "repair-revision-ranking-protocol",
  "repair-revision-ranking-validate",
  "repair-revision-ranking-compile",
  "repair-revision-ranking-run",
  "repair-revision-promotion-protocol",
  "repair-revision-promotion-validate",
  "repair-revision-promotion-compile",
  "repair-revision-promotion-run",
]);

async function emit(value: unknown, output?: string): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (output) await writeFile(output, content, { encoding: "utf8", flag: "wx" });
  else process.stdout.write(content);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command || !COMMANDS.has(command)) {
    throw new Error(
      "Usage: evavo-art repair-<protocol|validate|compile|run> [--input request.json] [--artifact-root .art-studio/artifacts] [--output result.json]",
    );
  }

  const parsed = parseArgs({
    args: process.argv.slice(3),
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
      "artifact-root": { type: "string" },
    },
    allowPositionals: false,
    strict: true,
  });

  const result = await handleRepairCommand(
    command,
    parsed.values as RepairCommandValues,
  );
  if (!result.handled) {
    throw new Error(`Repair command was not handled: ${command}`);
  }
  await emit(result.value, parsed.values.output);
}

main().catch((error: unknown) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "EVAVO_ART_REPAIR_CLI_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 1;
});
