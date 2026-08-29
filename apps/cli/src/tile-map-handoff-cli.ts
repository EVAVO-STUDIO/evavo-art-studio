#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import {
  handleTileMapHandoffCommand,
  type TileMapHandoffCommandValues,
} from "./tile-map-handoff-commands.js";

async function emit(value: unknown, output?: string): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (output) await writeFile(output, content, "utf8");
  else process.stdout.write(content);
}

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: process.argv.slice(3),
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
    },
    allowPositionals: false,
    strict: true,
  });

  const result = await handleTileMapHandoffCommand(
    "tile-map-handoff",
    parsed.values as TileMapHandoffCommandValues,
  );
  if (!result.handled) throw new Error("tile-map-handoff command was not handled");
  await emit(result.value, parsed.values.output);
}

main().catch((error: unknown) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "EVAVO_TILE_MAP_HANDOFF_CLI_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 1;
});
