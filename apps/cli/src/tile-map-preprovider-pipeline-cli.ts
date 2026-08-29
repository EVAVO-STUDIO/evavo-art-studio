#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import {
  compileProductionPlan,
  validateHandoff,
} from "./tile-map-handoff-commands.js";
import { compileTileMapCandidateBatch } from "./tile-map-candidate-batch.js";
import { compileTileMapProviderRuntimeBatch } from "./tile-map-provider-batch.js";
import { compileTileMapSourcePackage } from "./tile-map-source-package-commands.js";

type JsonObject = Record<string, unknown>;

async function writeJsonCreateOnly(target: string, value: unknown): Promise<Buffer> {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await writeFile(target, bytes, { flag: "wx" });
  return bytes;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

async function ensureNewOrEmptyDirectory(outputRoot: string): Promise<string> {
  const resolved = path.resolve(outputRoot);
  await mkdir(resolved, { recursive: true });
  const entries = await readdir(resolved);
  if (entries.length !== 0) {
    throw new Error(`--output-root must be new or empty: ${resolved}`);
  }
  return resolved;
}

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: process.argv.slice(3),
    options: {
      input: { type: "string", short: "i" },
      "output-root": { type: "string", short: "o" },
    },
    allowPositionals: false,
    strict: true,
  });
  const input = parsed.values.input;
  const requestedRoot = parsed.values["output-root"];
  if (!input || !requestedRoot) {
    throw new Error("--input and --output-root are required");
  }

  const handoffPath = path.resolve(input);
  const outputRoot = await ensureNewOrEmptyDirectory(requestedRoot);
  const handoffBytes = await readFile(handoffPath);
  const handoffRaw = JSON.parse(handoffBytes.toString("utf8")) as unknown;
  const handoff = validateHandoff(handoffRaw);
  const handoffSha256 = sha256(handoffBytes);

  const plan = compileProductionPlan(handoff, handoffSha256);
  const planPath = path.join(outputRoot, "01-art-production-plan.json");
  const planBytes = await writeJsonCreateOnly(planPath, plan);

  const sourcePackage = compileTileMapSourcePackage(plan as unknown as JsonObject, sha256(planBytes));
  const sourcePackagePath = path.join(outputRoot, "02-source-package.json");
  const sourcePackageBytes = await writeJsonCreateOnly(sourcePackagePath, sourcePackage);

  const candidateBatch = compileTileMapCandidateBatch(
    sourcePackage as unknown as JsonObject,
    sha256(sourcePackageBytes),
  );
  const candidateBatchPath = path.join(outputRoot, "03-candidate-batch.json");
  const candidateBatchBytes = await writeJsonCreateOnly(candidateBatchPath, candidateBatch);

  const providerBatch = await compileTileMapProviderRuntimeBatch(candidateBatchPath);
  const providerBatchPath = path.join(outputRoot, "04-provider-runtime-batch.json");
  const providerBatchBytes = await writeJsonCreateOnly(providerBatchPath, providerBatch);

  const files = [
    ["handoff", handoffPath, handoffBytes],
    ["production_plan", planPath, planBytes],
    ["source_package", sourcePackagePath, sourcePackageBytes],
    ["candidate_batch", candidateBatchPath, candidateBatchBytes],
    ["provider_runtime_batch", providerBatchPath, providerBatchBytes],
  ] as const;
  const receiptBase = {
    schema_version: 1,
    source_map_fingerprint: handoff.source_map_fingerprint,
    map_id: handoff.map_id,
    consumer_adapter: handoff.consumer_adapter,
    projection: handoff.projection,
    files: files.map(([role, filePath, bytes]) => ({
      role,
      path: path.resolve(filePath),
      bytes: bytes.length,
      sha256: sha256(bytes),
    })),
    fingerprints: {
      art_production_plan: plan.plan_fingerprint,
      source_package: sourcePackage.package_fingerprint,
      candidate_batch: candidateBatch.batch_fingerprint,
      provider_runtime_batch: providerBatch.provider_batch_fingerprint,
    },
    authority: {
      semantic_authority: "tile-map-studio",
      source_creation_authority: "art-studio",
      provider_execution: false,
      provider_output_authority: "intermediate-only",
      review_required: true,
      creative_approval_required: true,
    },
    status: "ready-for-explicit-provider-authorization",
  };
  const receipt = {
    ...receiptBase,
    receipt_fingerprint: sha256(Buffer.from(canonical(receiptBase), "utf8")),
  };
  const receiptPath = path.join(outputRoot, "preprovider.receipt.json");
  await writeJsonCreateOnly(receiptPath, receipt);

  process.stdout.write(`${JSON.stringify({
    status: receipt.status,
    map_id: receipt.map_id,
    output_root: outputRoot,
    jobs: providerBatch.jobs.length,
    receipt: receiptPath,
    receipt_fingerprint: receipt.receipt_fingerprint,
  })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({
    error: {
      code: "EVAVO_TILE_MAP_PREPROVIDER_PIPELINE_ERROR",
      message: error instanceof Error ? error.message : String(error),
    },
  })}\n`);
  process.exitCode = 1;
});
