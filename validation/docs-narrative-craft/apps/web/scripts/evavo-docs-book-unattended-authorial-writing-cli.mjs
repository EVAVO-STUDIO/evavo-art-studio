#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

import { docsSuiteApiRequest } from "./docs-suite-api-client.mjs";

const ENDPOINT = "/api/v1/book-studio/unattended-production/authorial-writing";
const MAXIMUM_INPUT_BYTES = 4_400_000;

function help() {
  console.log(`EVAVO Docs Suite unattended authorial Writing CLI

Usage:
  node apps/web/scripts/evavo-docs-book-unattended-authorial-writing-cli.mjs capabilities
  node apps/web/scripts/evavo-docs-book-unattended-authorial-writing-cli.mjs execute --input request.json
  node apps/web/scripts/evavo-docs-book-unattended-authorial-writing-cli.mjs execute --input request.json --output receipt.json

Environment:
  EVAVO_DOCS_TOKEN  Required short-lived grant. capabilities needs documents:read;
                    execute needs documents:write.
  EVAVO_DOCS_URL    Optional Docs Suite origin.

The execute command recompiles the exact unattended plan, validates the selected
writing stage and revision cycle, binds dependency receipts into the project-owned
authorial Writing handoff, and permits one no-fallback Writing Studio attempt.
It does not mutate the canonical manuscript, admit canon, call Art Studio, submit
to Amazon, or publish.`);
}

function parse(values) {
  const [command = "help", ...rest] = values;
  const flags = new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value?.startsWith("--") || value.length < 3) {
      throw new Error(`Unexpected argument: ${value ?? ""}`);
    }
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
  if (!source.trim()) throw new Error("The unattended authorial Writing input is empty.");
  if (Buffer.byteLength(source, "utf8") > MAXIMUM_INPUT_BYTES) {
    throw new Error("The unattended authorial Writing input is too large.");
  }
  return JSON.parse(source);
}

async function emit(value, outputPath) {
  const source = `${JSON.stringify(value, null, 2)}\n`;
  if (outputPath) {
    await writeFile(outputPath, source, { encoding: "utf8", flag: "wx" });
    process.stdout.write(`${JSON.stringify({ ok: true, output: outputPath }, null, 2)}\n`);
    return;
  }
  process.stdout.write(source);
}

async function run() {
  const { command, flags } = parse(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    if (flags.size) throw new Error("help does not accept options.");
    help();
    return;
  }
  if (command === "capabilities") {
    if (flags.size) throw new Error("capabilities does not accept options.");
    await emit(await docsSuiteApiRequest(ENDPOINT));
    return;
  }
  if (command !== "execute") throw new Error(`Unknown command: ${command}`);
  for (const key of flags.keys()) {
    if (key !== "input" && key !== "output") throw new Error(`Unsupported option --${key}.`);
  }
  const inputPath = flags.get("input");
  if (!inputPath) throw new Error("Missing required --input option.");
  const input = await readJson(inputPath);
  const response = await docsSuiteApiRequest(ENDPOINT, { method: "POST", body: input });
  await emit(response, flags.get("output"));
}

run().catch((error) => {
  console.error(
    `evavo_docs_book_unattended_authorial_writing_cli_error: ${error instanceof Error ? error.message : "Unattended authorial Writing failed."}`,
  );
  process.exitCode = 1;
});
