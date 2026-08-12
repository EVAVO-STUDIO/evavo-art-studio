#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  buildHmfProviderExecutionEnvelopeBatch,
  heavyMetalFightingProviderExecutionEnvelope,
  verifyHmfProviderExecutionEnvelopes,
} from "./frame-body-provider-execution-envelope.mjs";

function usage() {
  return [
    "HEAVY METAL FIGHTING provider execution envelopes",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting/frame-body-provider-execution-envelope-cli.mjs verify",
    "  node scripts/heavy-metal-fighting/frame-body-provider-execution-envelope-cli.mjs work-order <unitId> [--receipts-json <file>] [--artifact-bindings-json <file>]",
    "  node scripts/heavy-metal-fighting/frame-body-provider-execution-envelope-cli.mjs batch <hmf-bNNNN|number> [--receipts-json <file>] [--artifact-bindings-json <file>]",
    "",
    "The compiler composes immutable base prompts and supplemental choreography overlays. It does not execute a provider, admit artifacts, persist receipts, approve candidates, mutate Git or write the game repository.",
  ].join("\n");
}
function parseOptions(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--") || values.has(name)) {
      throw new Error(`options must be unique --name value pairs.\n\n${usage()}`);
    }
    if (!["--receipts-json", "--artifact-bindings-json"].includes(name)) {
      throw new Error(`unsupported option ${name}.\n\n${usage()}`);
    }
    values.set(name, value);
  }
  return values;
}
async function readArray(filePath, label) {
  if (!filePath) return [];
  const parsed = JSON.parse(await readFile(path.resolve(filePath), "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${label} must contain a JSON array.`);
  return parsed;
}
async function evidence(options) {
  return {
    receipts: await readArray(options.get("--receipts-json"), "--receipts-json"),
    artifactBindings: await readArray(options.get("--artifact-bindings-json"), "--artifact-bindings-json"),
  };
}
async function run(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") {
    if (argv.length !== 1) throw new Error(usage());
    return verifyHmfProviderExecutionEnvelopes();
  }
  if (command === "work-order") {
    if (!argv[1]) throw new Error(usage());
    return heavyMetalFightingProviderExecutionEnvelope(argv[1], await evidence(parseOptions(argv.slice(2))));
  }
  if (command === "batch") {
    if (!argv[1]) throw new Error(usage());
    const identifier = /^\d+$/u.test(argv[1]) ? Number(argv[1]) : argv[1];
    return buildHmfProviderExecutionEnvelopeBatch(identifier, await evidence(parseOptions(argv.slice(2))));
  }
  throw new Error(`Unknown command ${command}.\n\n${usage()}`);
}

run().then((result) => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result?.status === "failed") process.exitCode = 1;
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
