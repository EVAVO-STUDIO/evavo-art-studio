#!/usr/bin/env node

import { open, readFile, rm } from "node:fs/promises";
import process from "node:process";

import { docsSuiteApiRequest } from "./docs-suite-api-client.mjs";
import {
  BOOK_LEGACY_CRAFT_GENOME_ENDPOINT,
  BOOK_LEGACY_CRAFT_GENOME_MAX_INPUT_BYTES,
  buildLegacyCraftRequest,
  validateLegacyCraftPayload,
} from "./evavo-docs-book-legacy-craft-genome-common.mjs";

const COMMANDS = Object.freeze({
  "compile-profile": "compile_profile",
  "create-provider-packet": "create_provider_packet",
  "validate-provider-response": "validate_provider_response",
  "scan-phrase-overlap": "scan_phrase_overlap",
});

function help() {
  console.log(`EVAVO Docs Suite legacy Book craft-genome compatibility CLI

Usage:
  node apps/web/scripts/evavo-docs-book-legacy-craft-genome-cli.mjs capabilities
  node apps/web/scripts/evavo-docs-book-legacy-craft-genome-cli.mjs compile-profile --input request.json [--source-commit <sha>] [--output result.json]
  node apps/web/scripts/evavo-docs-book-legacy-craft-genome-cli.mjs create-provider-packet --input request.json [--source-commit <sha>] [--output result.json]
  node apps/web/scripts/evavo-docs-book-legacy-craft-genome-cli.mjs validate-provider-response --input request.json [--source-commit <sha>] [--output result.json]
  node apps/web/scripts/evavo-docs-book-legacy-craft-genome-cli.mjs scan-phrase-overlap --input request.json [--source-commit <sha>] [--output result.json]

Input files retain the legacy Website payload shape and must include the matching operation field.

Environment:
  EVAVO_DOCS_TOKEN          Required short-lived documents:read grant.
  EVAVO_DOCS_URL            Optional Docs Suite origin.
  EVAVO_WEBSITE_COMMIT_SHA  Exact Website source commit when --source-commit is omitted.

This compatibility CLI performs deterministic compilation, response validation and phrase comparison only. It cannot call a model, mutate a manuscript, admit canon or publish.`);
}

function parse(values) {
  const [command = "help", ...rest] = values;
  const flags = new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value?.startsWith("--") || value.length < 3) throw new Error(`Unexpected argument: ${value ?? ""}`);
    const key = value.slice(2);
    if (flags.has(key)) throw new Error(`Duplicate option --${key}.`);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}.`);
    flags.set(key, next);
    index += 1;
  }
  return { command, flags };
}

async function readJson(filePath) {
  const source = await readFile(filePath, "utf8");
  if (!source.trim()) throw new Error("Legacy craft input is empty.");
  if (Buffer.byteLength(source, "utf8") > BOOK_LEGACY_CRAFT_GENOME_MAX_INPUT_BYTES) throw new Error("Legacy craft input is too large.");
  return JSON.parse(source);
}

async function runWithReservedOutput(output, action) {
  if (!output) {
    process.stdout.write(`${JSON.stringify(await action(), null, 2)}\n`);
    return;
  }
  const handle = await open(output, "wx");
  let complete = false;
  try {
    const value = await action();
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8" });
    await handle.sync();
    complete = true;
    process.stdout.write(`${JSON.stringify({ ok: true, output }, null, 2)}\n`);
  } finally {
    await handle.close();
    if (!complete) await rm(output, { force: true });
  }
}

async function run() {
  const { command, flags } = parse(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) return help();
  for (const key of flags.keys()) if (!["input", "output", "source-commit"].includes(key)) throw new Error(`Unsupported option --${key}.`);
  const output = flags.get("output");
  if (command === "capabilities") {
    if (flags.has("input") || flags.has("source-commit")) throw new Error("capabilities does not accept --input or --source-commit.");
    return runWithReservedOutput(output, () => docsSuiteApiRequest(BOOK_LEGACY_CRAFT_GENOME_ENDPOINT));
  }
  const operation = COMMANDS[command];
  if (!operation) throw new Error(`Unknown command: ${command}`);
  const inputPath = flags.get("input");
  if (!inputPath) throw new Error("Missing required --input option.");
  const payload = validateLegacyCraftPayload(await readJson(inputPath), operation);
  const body = buildLegacyCraftRequest(
    payload,
    "EVAVO Docs Suite legacy craft-genome CLI",
    { sourceCommit: flags.get("source-commit"), expectedOperation: operation },
  );
  return runWithReservedOutput(
    output,
    () => docsSuiteApiRequest(BOOK_LEGACY_CRAFT_GENOME_ENDPOINT, { method: "POST", body }),
  );
}

run().catch((error) => {
  console.error(`evavo_docs_book_legacy_craft_genome_cli_error: ${error instanceof Error ? error.message : "Legacy craft compatibility failed."}`);
  process.exitCode = 1;
});
