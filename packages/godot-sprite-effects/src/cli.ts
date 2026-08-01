#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { listSpriteEffectDefinitions } from "./catalog.js";
import { compileSpriteEffectPack, writeSpriteEffectPack } from "./compiler.js";
import {
  SPRITE_EFFECT_COMPILER_VERSION,
  SpriteEffectError,
} from "./types.js";

const HELP = `EVAVO Godot Sprite Effects\n\n` +
  `Commands:\n` +
  `  evavo-godot-sprite-effects catalog\n` +
  `  evavo-godot-sprite-effects compile --request <json> --output-root <new-dir> (--dry-run | --apply)\n`;

function required(value: string | undefined, label: string): string {
  const candidate = value?.trim();
  if (!candidate) {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_CLI_ARGUMENT_REQUIRED",
      `${label} is required.`,
    );
  }
  return candidate;
}

function exactMode(values: Readonly<Record<string, unknown>>): boolean {
  const apply = values.apply === true;
  const dryRun = values["dry-run"] === true;
  if (apply === dryRun) {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_CLI_MODE_INVALID",
      "Choose exactly one of --dry-run or --apply.",
    );
  }
  return apply;
}

function readRequest(filename: string): unknown {
  const absolute = path.resolve(filename);
  const details = statSync(absolute);
  if (!details.isFile() || details.size < 2 || details.size > 2 * 1024 * 1024) {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_REQUEST_FILE_INVALID",
      "Request must be a regular JSON file up to 2 MiB.",
    );
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        readFileSync(absolute),
      ),
    );
  } catch {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_REQUEST_JSON_INVALID",
      "Request is not valid strict UTF-8 JSON.",
    );
  }
}

export function runSpriteEffectCli(
  arguments_: readonly string[] = process.argv.slice(2),
): unknown {
  const parsed = parseArgs({
    args: [...arguments_],
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      request: { type: "string", short: "r" },
      "output-root": { type: "string", short: "o" },
      apply: { type: "boolean" },
      "dry-run": { type: "boolean" },
    },
  });
  if (parsed.values.help || parsed.positionals.length === 0) {
    return { help: HELP };
  }
  if (parsed.positionals.length !== 1) {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_CLI_COMMAND_INVALID",
      "Exactly one command is required.",
    );
  }
  const command = parsed.positionals[0]!;
  if (command === "catalog") {
    return {
      schema: "evavo.art-godot-sprite-effect-catalog.v1",
      compilerVersion: SPRITE_EFFECT_COMPILER_VERSION,
      effects: listSpriteEffectDefinitions(),
    };
  }
  if (command === "compile") {
    const apply = exactMode(parsed.values);
    const request = readRequest(required(parsed.values.request, "--request"));
    const outputRoot = required(parsed.values["output-root"], "--output-root");
    if (apply) {
      return {
        status: "written",
        receipt: writeSpriteEffectPack(request, outputRoot),
        mutationPerformed: true,
      };
    }
    return {
      status: "dry-run-ready",
      receipt: compileSpriteEffectPack(request, false).receipt,
      mutationPerformed: false,
    };
  }
  throw new SpriteEffectError(
    "SPRITE_EFFECT_CLI_COMMAND_UNKNOWN",
    `Unknown command: ${command}.`,
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const result = runSpriteEffectCli();
    if (
      typeof result === "object" &&
      result !== null &&
      "help" in result &&
      typeof result.help === "string"
    ) {
      process.stdout.write(result.help);
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error: unknown) {
    const known = error instanceof SpriteEffectError;
    process.stderr.write(
      `${JSON.stringify(
        {
          schema: "evavo.art-godot-sprite-effect-error.v1",
          status: "failed",
          error: {
            code: known ? error.code : "SPRITE_EFFECT_UNEXPECTED_FAILURE",
            message: error instanceof Error ? error.message : String(error),
            details: known ? error.details : null,
          },
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
  }
}
