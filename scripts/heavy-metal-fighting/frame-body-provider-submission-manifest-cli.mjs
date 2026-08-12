#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { heavyMetalFightingProviderExecutionEnvelope } from "./frame-body-provider-execution-envelope.mjs";
import {
  buildHmfProviderSubmissionManifestBatch,
  createHmfProviderSubmissionAuthorization,
  heavyMetalFightingProviderSubmissionManifest,
  verifyHmfProviderSubmissionManifests,
} from "./frame-body-provider-submission-manifest.mjs";

function usage() {
  return [
    "HEAVY METAL FIGHTING provider submission manifests",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting/frame-body-provider-submission-manifest-cli.mjs verify",
    "  node scripts/heavy-metal-fighting/frame-body-provider-submission-manifest-cli.mjs authorization <unitId> --receipts-json <file> --artifact-bindings-json <file> --actor-id <id> --occurred-at <UTC> --evidence-sha <sha256> --reason <text>",
    "  node scripts/heavy-metal-fighting/frame-body-provider-submission-manifest-cli.mjs work-order <unitId> [--receipts-json <file>] [--artifact-bindings-json <file>] [--submission-authorization-json <file>]",
    "  node scripts/heavy-metal-fighting/frame-body-provider-submission-manifest-cli.mjs batch <hmf-bNNNN|number> [--receipts-json <file>] [--artifact-bindings-json <file>] [--submission-authorizations-json <file>]",
    "",
    "This CLI validates and compiles authorization-bound runtime submission instructions. It does not enqueue jobs, execute providers, persist receipts, approve candidates, mutate Git or write the game repository.",
  ].join("\n");
}
function parseOptions(argv, allowed) {
  if (argv.length % 2 !== 0) throw new Error(`options must be unique --name value pairs.\n\n${usage()}`);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--") || values.has(name)) {
      throw new Error(`options must be unique --name value pairs.\n\n${usage()}`);
    }
    if (!allowed.has(name)) throw new Error(`unsupported option ${name}.\n\n${usage()}`);
    values.set(name, value);
  }
  return values;
}
function required(options, name) {
  const value = options.get(name);
  if (!value) throw new Error(`missing ${name}.\n\n${usage()}`);
  return value;
}
async function readJson(filePath, label, expected) {
  if (!filePath) return expected === "array" ? [] : null;
  const parsed = JSON.parse(await readFile(path.resolve(filePath), "utf8"));
  if (expected === "array" && !Array.isArray(parsed)) throw new Error(`${label} must contain a JSON array.`);
  if (expected === "object" && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) throw new Error(`${label} must contain one JSON object.`);
  return parsed;
}
async function evidence(options) {
  return {
    receipts: await readJson(options.get("--receipts-json"), "--receipts-json", "array"),
    artifactBindings: await readJson(options.get("--artifact-bindings-json"), "--artifact-bindings-json", "array"),
  };
}

async function run(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") {
    if (argv.length !== 1) throw new Error(usage());
    return verifyHmfProviderSubmissionManifests();
  }
  if (command === "authorization") {
    const unitId = argv[1];
    if (!unitId) throw new Error(usage());
    const options = parseOptions(argv.slice(2), new Set([
      "--receipts-json",
      "--artifact-bindings-json",
      "--actor-id",
      "--occurred-at",
      "--evidence-sha",
      "--reason",
    ]));
    const inputs = await evidence(options);
    const envelope = await heavyMetalFightingProviderExecutionEnvelope(unitId, inputs);
    return createHmfProviderSubmissionAuthorization(envelope, {
      actorClass: "human",
      actorId: required(options, "--actor-id"),
      occurredAt: required(options, "--occurred-at"),
      evidenceSha256: required(options, "--evidence-sha"),
      reason: required(options, "--reason"),
    });
  }
  if (command === "work-order") {
    const unitId = argv[1];
    if (!unitId) throw new Error(usage());
    const options = parseOptions(argv.slice(2), new Set([
      "--receipts-json",
      "--artifact-bindings-json",
      "--submission-authorization-json",
    ]));
    return heavyMetalFightingProviderSubmissionManifest(unitId, {
      ...(await evidence(options)),
      submissionAuthorization: await readJson(options.get("--submission-authorization-json"), "--submission-authorization-json", "object"),
    });
  }
  if (command === "batch") {
    const batch = argv[1];
    if (!batch) throw new Error(usage());
    const options = parseOptions(argv.slice(2), new Set([
      "--receipts-json",
      "--artifact-bindings-json",
      "--submission-authorizations-json",
    ]));
    return buildHmfProviderSubmissionManifestBatch(/^\d+$/u.test(batch) ? Number(batch) : batch, {
      ...(await evidence(options)),
      submissionAuthorizations: await readJson(options.get("--submission-authorizations-json"), "--submission-authorizations-json", "array"),
    });
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
