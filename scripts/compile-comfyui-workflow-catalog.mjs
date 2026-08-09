#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { compileComfyUIWorkflowCatalog } from "../packages/providers/dist/index.js";

const MAXIMUM_INPUT_BYTES = 4 * 1024 * 1024;

function fail(message) {
  process.stderr.write(`ComfyUI catalog compilation failed: ${message}\n`);
  process.exitCode = 1;
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith("--")) throw new Error(`Unexpected argument: ${entry}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${entry} requires one value.`);
    index += 1;
    if (entry === "--input") result.input = value;
    else if (entry === "--output") result.output = value;
    else throw new Error(`Unsupported argument: ${entry}`);
  }
  if (!result.input || !result.output) {
    throw new Error("Usage: compile-comfyui-workflow-catalog --input <draft.json> --output <catalog.json>");
  }
  return result;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);
  if (inputPath === outputPath) throw new Error("Input and output paths must differ.");
  const bytes = await readFile(inputPath);
  if (!bytes.length || bytes.length > MAXIMUM_INPUT_BYTES) {
    throw new Error(`Draft input must contain 1 to ${MAXIMUM_INPUT_BYTES} bytes.`);
  }
  let draft;
  try {
    draft = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Draft input is not valid JSON.");
  }
  const catalog = compileComfyUIWorkflowCatalog(draft);
  const body = `${JSON.stringify(catalog, null, 2)}\n`;
  await writeFile(outputPath, body, { encoding: "utf8", flag: "wx", mode: 0o600 });
  process.stdout.write(`${JSON.stringify({
    schemaVersion: catalog.schemaVersion,
    catalogId: catalog.catalogId,
    catalogVersion: catalog.catalogVersion,
    catalogSha256: catalog.catalogSha256,
    profileCount: catalog.profiles.length,
    profiles: catalog.profiles.map((profile) => ({
      adapterId: `comfyui:${profile.profileId}`,
      profileId: profile.profileId,
      profileSha256: profile.profileSha256,
      workflowSha256: profile.workflowSha256,
      nodeInventorySha256: profile.nodeInventorySha256,
      modelInventorySha256: profile.modelInventorySha256,
      runtimeInventorySha256: profile.runtimeInventorySha256,
      operations: profile.operations,
      capabilities: profile.capabilities,
    })),
    authority: {
      arbitraryWorkflowSubmission: false,
      providerExecution: false,
      runtimeSubmission: false,
      candidateApproval: false,
      candidatePromotion: false,
      repositoryMutation: false,
      deployment: false,
      publication: false,
      forcePush: false,
    },
  }, null, 2)}\n`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
