#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { validateArtBrief } from "@evavo/art-contracts";
import { CAPABILITY_CATALOG, createProductionPlan } from "@evavo/art-core";
import { inspectRepository } from "@evavo/art-repo-inspector";

const help = `EVAVO Art Studio CLI

Usage:
  evavo-art capabilities
  evavo-art validate --input brief.json
  evavo-art plan --input brief.json [--output plan.json]
  evavo-art inspect --repo C:\\GitRepos\\my-game [--output snapshot.json]

All commands emit JSON so ChatGPT, Claude, CI and scripts can consume the same contract.
`;

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function emit(value: unknown, output?: string): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (output) await writeFile(output, content, "utf8");
  else process.stdout.write(content);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const parsed = parseArgs({
    args: process.argv.slice(3),
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
      repo: { type: "string", short: "r" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
    strict: true,
  });

  if (!command || parsed.values.help) {
    process.stdout.write(help);
    return;
  }

  if (command === "capabilities") {
    await emit({ schemaVersion: "1.0", capabilities: CAPABILITY_CATALOG }, parsed.values.output);
    return;
  }

  if (command === "inspect") {
    if (!parsed.values.repo) throw new Error("--repo is required for inspect.");
    await emit(await inspectRepository(parsed.values.repo), parsed.values.output);
    return;
  }

  if (!parsed.values.input) throw new Error("--input is required.");
  const input = await readJson(parsed.values.input);

  if (command === "validate") {
    const result = validateArtBrief(input);
    await emit(result, parsed.values.output);
    if (!result.success) process.exitCode = 2;
    return;
  }

  if (command === "plan") {
    await emit(createProductionPlan(input), parsed.values.output);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code: "EVAVO_ART_CLI_ERROR", message } })}\n`);
  process.exitCode = 1;
});
