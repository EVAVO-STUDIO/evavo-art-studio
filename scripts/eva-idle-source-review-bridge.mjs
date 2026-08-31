#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  compileEvaIdleSourceMaterializationRequest,
  compileEvaIdleSourceReviewBridge,
} from "../tools/eva_idle_source_review_bridge_v1.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/eva-idle-source-review-bridge.mjs materialization-request --finalization <json> --reuse-plan <json> --output <create-only json>",
    "  node scripts/eva-idle-source-review-bridge.mjs bridge --finalization <json> --reuse-plan <json> --profile-entry <json> --materialized-sources <json> --base-reference-bindings <json> --output <create-only json>",
  ].join("\n");
}

function parse(argv) {
  const command = argv[0];
  if (!command || command === "--help" || command === "-h") return { help: true };
  const options = { command };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") return { help: true };
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${token}`);
    if (token === "--finalization") options.finalization = value;
    else if (token === "--reuse-plan") options.reusePlan = value;
    else if (token === "--profile-entry") options.profileEntry = value;
    else if (token === "--materialized-sources") options.materializedSources = value;
    else if (token === "--base-reference-bindings") options.baseReferenceBindings = value;
    else if (token === "--output") options.output = value;
    else throw new Error(`unknown option ${token}`);
    index += 1;
  }
  return options;
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"));
  } catch (error) {
    throw new Error(`${label} could not be read: ${error.message}`);
  }
}

async function writeCreateOnly(filePath, value) {
  const output = path.resolve(filePath);
  await fs.mkdir(path.dirname(output), { recursive: true });
  const handle = await fs.open(output, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
  return output;
}

function extractMaterializedSources(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.materializedSources)) {
    return value.materializedSources;
  }
  throw new Error("materialized sources JSON must be an array or contain materializedSources[]");
}

function extractProfileEntry(value) {
  if (value?.clipId === "idle-primary" && value?.plan) return value;
  if (Array.isArray(value?.bodyProfiles)) {
    const entry = value.bodyProfiles.find((item) => item?.clipId === "idle-primary");
    if (entry) return entry;
  }
  throw new Error("profile entry JSON must be idle-primary or contain bodyProfiles[idle-primary]");
}

function extractBaseReferences(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.baseReferenceBindings)) {
    return value.baseReferenceBindings;
  }
  throw new Error("base reference bindings JSON must be an array or contain baseReferenceBindings[]");
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
  } else if (options.command === "materialization-request") {
    if (!options.finalization || !options.reusePlan || !options.output) throw new Error(usage());
    const result = compileEvaIdleSourceMaterializationRequest({
      sourceReviewFinalization: await readJson(options.finalization, "source review finalization"),
      reusePlan: await readJson(options.reusePlan, "source reuse plan"),
    });
    const output = await writeCreateOnly(options.output, result);
    console.log(
      `[eva-idle-source-bridge] PASS command=materialization-request frames=${result.sourceFrames.length} output=${output}`,
    );
  } else if (options.command === "bridge") {
    for (const key of ["finalization", "reusePlan", "profileEntry", "materializedSources", "baseReferenceBindings", "output"]) {
      if (!options[key]) throw new Error(usage());
    }
    const result = compileEvaIdleSourceReviewBridge({
      sourceReviewFinalization: await readJson(options.finalization, "source review finalization"),
      reusePlan: await readJson(options.reusePlan, "source reuse plan"),
      profileEntry: extractProfileEntry(await readJson(options.profileEntry, "canonical profile entry")),
      materializedSources: extractMaterializedSources(
        await readJson(options.materializedSources, "materialized sources"),
      ),
      baseReferenceBindings: extractBaseReferences(
        await readJson(options.baseReferenceBindings, "base reference bindings"),
      ),
    });
    const output = await writeCreateOnly(options.output, result);
    console.log(
      `[eva-idle-source-bridge] PASS command=bridge reviewed=${result.reviewedSources.length} output=${output}`,
    );
  } else {
    throw new Error(`unknown command ${options.command}\n${usage()}`);
  }
} catch (error) {
  console.error(`[eva-idle-source-bridge] ERROR ${error.message}`);
  process.exitCode = 1;
}
