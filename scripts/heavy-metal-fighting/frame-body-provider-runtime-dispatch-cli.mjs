#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  compileHmfProviderRuntimeDispatch,
  compileHmfProviderRuntimeOutcome,
  validateHmfCompiledProviderRuntimeContract,
  verifyHmfProviderRuntimeDispatch,
} from "./frame-body-provider-runtime-dispatch.mjs";

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
function usage() {
  return [
    "HEAVY METAL FIGHTING provider runtime dispatch",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting/frame-body-provider-runtime-dispatch-cli.mjs verify",
    "  node scripts/heavy-metal-fighting/frame-body-provider-runtime-dispatch-cli.mjs dispatch <unitId> --receipts-json <file> --artifact-bindings-json <file> --submission-authorization-json <file>",
    "  node scripts/heavy-metal-fighting/frame-body-provider-runtime-dispatch-cli.mjs bind --dispatch-json <file> --compiled-runtime-contract-json <file>",
    "  node scripts/heavy-metal-fighting/frame-body-provider-runtime-dispatch-cli.mjs outcome --dispatch-json <file> --runtime-binding-json <file> --runtime-outcome-json <file>",
    "",
    "These commands compile and validate governed records only. They do not enqueue a runtime job, execute a provider, materialize a candidate, persist a receipt, approve art or mutate either repository.",
  ].join("\n");
}
async function json(filePath, label) {
  if (!filePath) throw new Error(`${label} is required.\n\n${usage()}`);
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}
async function jsonArray(filePath, label) {
  const value = await json(filePath, label);
  if (!Array.isArray(value)) throw new Error(`${label} must contain a JSON array.`);
  return value;
}
async function run(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") return verifyHmfProviderRuntimeDispatch();
  if (command === "dispatch") {
    const unitId = argv[1];
    if (!unitId) throw new Error(`dispatch requires one unitId.\n\n${usage()}`);
    return compileHmfProviderRuntimeDispatch(unitId, {
      receipts: await jsonArray(option(argv.slice(2), "--receipts-json"), "--receipts-json"),
      artifactBindings: await jsonArray(option(argv.slice(2), "--artifact-bindings-json"), "--artifact-bindings-json"),
      submissionAuthorization: await json(option(argv.slice(2), "--submission-authorization-json"), "--submission-authorization-json"),
    });
  }
  if (command === "bind") {
    return validateHmfCompiledProviderRuntimeContract(
      await json(option(argv.slice(1), "--dispatch-json"), "--dispatch-json"),
      await json(option(argv.slice(1), "--compiled-runtime-contract-json"), "--compiled-runtime-contract-json"),
    );
  }
  if (command === "outcome") {
    return compileHmfProviderRuntimeOutcome(
      await json(option(argv.slice(1), "--dispatch-json"), "--dispatch-json"),
      await json(option(argv.slice(1), "--runtime-binding-json"), "--runtime-binding-json"),
      await json(option(argv.slice(1), "--runtime-outcome-json"), "--runtime-outcome-json"),
    );
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
