#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

import { docsSuiteApiRequest } from "./docs-suite-api-client.mjs";

function help() {
  console.log(`EVAVO Docs Suite Book Studio CLI

Usage:
  node apps/web/scripts/evavo-docs-book-cli.mjs capabilities
  node apps/web/scripts/evavo-docs-book-cli.mjs operation --input request.json
  node apps/web/scripts/evavo-docs-book-cli.mjs operation --input request.json --output result.json
  node apps/web/scripts/evavo-docs-book-cli.mjs candidate-capabilities
  node apps/web/scripts/evavo-docs-book-cli.mjs candidate --input request.json
  node apps/web/scripts/evavo-docs-book-cli.mjs candidate --input request.json --output result.json
  node apps/web/scripts/evavo-docs-book-cli.mjs art-plan-capabilities
  node apps/web/scripts/evavo-docs-book-cli.mjs art-plan-translate --input request.json
  node apps/web/scripts/evavo-docs-book-cli.mjs art-plan-translate --input request.json --output result.json

Environment:
  EVAVO_DOCS_TOKEN   Required short-lived grant. Candidate execution requires documents:write; Art plan translation requires documents:read.
  EVAVO_DOCS_URL     Optional Docs Suite origin.

Candidate execution makes one protected Writing Studio provider request and never
retries an ambiguous failure. Art plan translation makes one protected, read-only
Art Studio request and independently revalidates the returned work order. Tokens
are never printed or stored, and no command grants canonical mutation, artwork
selection, promotion, Book-use binding or publication.`);
}

function parse(values) {
  const [command = "help", ...rest] = values;
  const flags = new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value?.startsWith("--")) throw new Error(`Unexpected argument: ${value ?? ""}`);
    const key = value.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    if (flags.has(key)) throw new Error(`Duplicate option --${key}.`);
    flags.set(key, next);
    index += 1;
  }
  return { command, flags };
}

function required(flags, name) {
  const value = flags.get(name);
  if (!value) throw new Error(`Missing required --${name} option.`);
  return value;
}

async function readJson(path, maximumBytes) {
  const source = await readFile(path, "utf8");
  if (!source.trim() || Buffer.byteLength(source, "utf8") > maximumBytes) {
    throw new Error("Book Studio request file is empty or too large.");
  }
  return JSON.parse(source);
}

async function writeResult(response, output) {
  const source = `${JSON.stringify(response, null, 2)}\n`;
  if (output) {
    await writeFile(output, source, { encoding: "utf8", flag: "wx" });
    console.log(JSON.stringify({ ok: true, output }, null, 2));
  } else process.stdout.write(source);
}

async function run() {
  const { command, flags } = parse(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) { help(); return; }
  const capabilityEndpoints = new Map([
    ["capabilities", "/api/v1/book-studio/operations"],
    ["candidate-capabilities", "/api/v1/book-studio/writing-candidate"],
    ["art-plan-capabilities", "/api/v1/book-studio/art-plan-translation"],
  ]);
  const capabilityEndpoint = capabilityEndpoints.get(command);
  if (capabilityEndpoint) {
    if (flags.size) throw new Error(`${command} does not accept options.`);
    await writeResult(await docsSuiteApiRequest(capabilityEndpoint), undefined);
    return;
  }
  const commandEndpoints = new Map([
    ["operation", "/api/v1/book-studio/operations"],
    ["candidate", "/api/v1/book-studio/writing-candidate"],
    ["art-plan-translate", "/api/v1/book-studio/art-plan-translation"],
  ]);
  const endpoint = commandEndpoints.get(command);
  if (!endpoint) throw new Error(`Unknown command: ${command}`);
  for (const key of flags.keys()) {
    if (key !== "input" && key !== "output") {
      throw new Error(`Unsupported option --${key}.`);
    }
  }
  const maximumInputBytes = command === "operation" ? 4_000_000 : 4_400_000;
  const request = await readJson(required(flags, "input"), maximumInputBytes);
  const response = await docsSuiteApiRequest(endpoint, {
    method: "POST",
    body: request,
    ...(command === "candidate" || command === "art-plan-translate"
      ? { timeoutMs: 300_000, maximumResponseBytes: 4_000_000 }
      : {}),
  });
  await writeResult(response, flags.get("output"));
}

run().catch((error) => {
  console.error(`evavo_docs_book_cli_error: ${error instanceof Error ? error.message : "Book Studio CLI failed."}`);
  process.exitCode = 1;
});
