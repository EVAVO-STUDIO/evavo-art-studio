#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

import { docsSuiteApiRequest } from "./docs-suite-api-client.mjs";

const ENDPOINT = "/api/v1/book-studio/universal-readiness";
const MAXIMUM_INPUT_BYTES = 4_000_000;

function help() {
  console.log(`EVAVO Docs Suite universal Book readiness CLI

Usage:
  node apps/web/scripts/evavo-docs-book-readiness-cli.mjs capabilities
  node apps/web/scripts/evavo-docs-book-readiness-cli.mjs compile --input project.json
  node apps/web/scripts/evavo-docs-book-readiness-cli.mjs compile --input project.json --output readiness.json

Environment:
  EVAVO_DOCS_TOKEN   Required short-lived grant with documents:read.
  EVAVO_DOCS_URL     Optional Docs Suite origin.

The compiler supports every versioned Book content class and returns a deterministic,
planning-only Writing Studio, Art Studio, edition, accessibility and release pipeline.
It never mutates a manuscript, submits a provider job, promotes art or publishes.`);
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

function required(flags, key) {
  const value = flags.get(key);
  if (!value) throw new Error(`Missing required --${key} option.`);
  return value;
}

async function readProject(filePath) {
  const source = await readFile(filePath, "utf8");
  if (!source.trim() || Buffer.byteLength(source, "utf8") > MAXIMUM_INPUT_BYTES) {
    throw new Error("Book project input is empty or too large.");
  }
  return JSON.parse(source);
}

async function run() {
  const { command, flags } = parse(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    help();
    return;
  }
  if (command === "capabilities") {
    if (flags.size) throw new Error("capabilities does not accept options.");
    process.stdout.write(`${JSON.stringify(await docsSuiteApiRequest(ENDPOINT), null, 2)}\n`);
    return;
  }
  if (command !== "compile") throw new Error(`Unknown command: ${command}`);
  for (const key of flags.keys()) if (key !== "input" && key !== "output") {
    throw new Error(`Unsupported option --${key}.`);
  }
  const project = await readProject(required(flags, "input"));
  const response = await docsSuiteApiRequest(ENDPOINT, {
    method: "POST",
    body: project,
  });
  const source = `${JSON.stringify(response, null, 2)}\n`;
  const output = flags.get("output");
  if (output) {
    await writeFile(output, source, { encoding: "utf8", flag: "wx" });
    process.stdout.write(`${JSON.stringify({ ok: true, output }, null, 2)}\n`);
  } else {
    process.stdout.write(source);
  }
}

run().catch((error) => {
  console.error(`evavo_docs_book_readiness_cli_error: ${error instanceof Error ? error.message : "Universal Book readiness failed."}`);
  process.exitCode = 1;
});
