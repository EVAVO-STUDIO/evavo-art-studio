#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_MINIMUM_FREE_BYTES = 2 * 1024 * 1024 * 1024;
export const DEFAULT_MINIMUM_FREE_PERCENT = 5;
export const DEFAULT_STORAGE_CHECK_INTERVAL_MS = 30_000;

function fail(code, message, details = undefined) {
  const error = new Error(message);
  error.name = "ArtStudioStorageHeadroomError";
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

function boundedNumber(value, fallback, minimum, maximum, label, integer = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) || parsed < minimum || parsed > maximum) {
    fail(
      "ART_STUDIO_STORAGE_THRESHOLD_INVALID",
      `${label} must be ${integer ? "an integer" : "a number"} from ${minimum} to ${maximum}.`,
    );
  }
  return parsed;
}

export function storageThresholds(environment = process.env, overrides = {}) {
  return Object.freeze({
    minimumFreeBytes: boundedNumber(
      overrides.minimumFreeBytes ?? environment.EVAVO_ART_MIN_FREE_BYTES,
      DEFAULT_MINIMUM_FREE_BYTES,
      0,
      Number.MAX_SAFE_INTEGER,
      "minimum free bytes",
      true,
    ),
    minimumFreePercent: boundedNumber(
      overrides.minimumFreePercent ?? environment.EVAVO_ART_MIN_FREE_PERCENT,
      DEFAULT_MINIMUM_FREE_PERCENT,
      0,
      100,
      "minimum free percent",
    ),
    intervalMs: boundedNumber(
      overrides.intervalMs ?? environment.EVAVO_ART_STORAGE_CHECK_INTERVAL_MS,
      DEFAULT_STORAGE_CHECK_INTERVAL_MS,
      1_000,
      60 * 60 * 1_000,
      "storage check interval",
      true,
    ),
  });
}

function existingAncestor(value) {
  let candidate = path.resolve(value);
  while (!fs.existsSync(candidate)) {
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      fail("ART_STUDIO_STORAGE_ROOT_UNAVAILABLE", `no existing ancestor could be found for ${value}.`);
    }
    candidate = parent;
  }
  const state = fs.statSync(candidate);
  if (!state.isDirectory()) candidate = path.dirname(candidate);
  return fs.realpathSync(candidate);
}

function bigint(value, label) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  fail("ART_STUDIO_STORAGE_STAT_INVALID", `${label} was not a safe non-negative integer.`);
}

export function evaluateStorageHeadroom(input, thresholds) {
  const blockSize = bigint(input.blockSize, "block size");
  const availableBlocks = bigint(input.availableBlocks, "available blocks");
  const totalBlocks = bigint(input.totalBlocks, "total blocks");
  const freeBytesBig = blockSize * availableBlocks;
  const totalBytesBig = blockSize * totalBlocks;
  const minimumBytesBig = BigInt(thresholds.minimumFreeBytes);
  const freePercent = totalBytesBig > 0n ? Number((freeBytesBig * 1_000_000n) / totalBytesBig) / 10_000 : 0;
  const byteHeadroomPassed = freeBytesBig >= minimumBytesBig;
  const percentHeadroomPassed = freePercent >= thresholds.minimumFreePercent;
  const passed = byteHeadroomPassed && percentHeadroomPassed;
  return Object.freeze({
    passed,
    freeBytes: freeBytesBig.toString(),
    totalBytes: totalBytesBig.toString(),
    freePercent,
    minimumFreeBytes: thresholds.minimumFreeBytes,
    minimumFreePercent: thresholds.minimumFreePercent,
    byteHeadroomPassed,
    percentHeadroomPassed,
  });
}

export function inspectStorageRoot(label, requestedRoot, thresholds) {
  if (typeof requestedRoot !== "string" || !requestedRoot.trim() || requestedRoot.includes("\0")) {
    fail("ART_STUDIO_STORAGE_ROOT_INVALID", `${label} root must be a non-empty safe path.`);
  }
  const requestedPath = path.resolve(requestedRoot);
  const inspectedPath = existingAncestor(requestedPath);
  let stats;
  try {
    stats = fs.statfsSync(inspectedPath, { bigint: true });
  } catch (error) {
    fail(
      "ART_STUDIO_STORAGE_STAT_FAILED",
      `${label} storage could not be inspected at ${inspectedPath}: ${error.message}`,
    );
  }
  const evaluation = evaluateStorageHeadroom(
    {
      blockSize: stats.bsize,
      availableBlocks: stats.bavail,
      totalBlocks: stats.blocks,
    },
    thresholds,
  );
  return Object.freeze({
    label,
    requestedPath,
    inspectedPath,
    ...evaluation,
  });
}

export function inspectArtStudioStorage(options = {}) {
  const environment = options.environment ?? process.env;
  const thresholds = storageThresholds(environment, options);
  const runtimeRoot = path.resolve(
    options.runtimeRoot ?? environment.EVAVO_ART_RUNTIME_ROOT ?? path.join(options.root ?? REPOSITORY_ROOT, ".art-studio/runtime"),
  );
  const artifactRoot = path.resolve(
    options.artifactRoot ?? environment.EVAVO_ART_ARTIFACT_ROOT ?? path.join(options.root ?? REPOSITORY_ROOT, ".art-studio/artifacts"),
  );
  const volumes = [
    inspectStorageRoot("runtime", runtimeRoot, thresholds),
    inspectStorageRoot("artifacts", artifactRoot, thresholds),
  ];
  const passed = volumes.every((entry) => entry.passed);
  const report = Object.freeze({
    schema: "evavo.art-studio.storage-headroom-report.v1",
    status: passed ? "passed" : "failed",
    checkedAt: new Date().toISOString(),
    thresholds,
    volumes: Object.freeze(volumes),
    authority: Object.freeze({
      repositoryMutation: false,
      storageMutation: false,
      providerExecution: false,
      publication: false,
      deployment: false,
    }),
  });
  if (!passed && options.throwOnFailure !== false) {
    const failed = volumes.filter((entry) => !entry.passed);
    fail(
      "ART_STUDIO_STORAGE_HEADROOM_LOW",
      `insufficient storage headroom for ${failed.map((entry) => entry.label).join(", ")}.`,
      report,
    );
  }
  return report;
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value) fail("ART_STUDIO_STORAGE_ARGUMENT_INVALID", `${argument} requires a value.`);
      index += 1;
      return value;
    };
    if (argument === "--runtime-root") result.runtimeRoot = next();
    else if (argument === "--artifact-root") result.artifactRoot = next();
    else if (argument === "--min-free-bytes") result.minimumFreeBytes = next();
    else if (argument === "--min-free-percent") result.minimumFreePercent = next();
    else fail("ART_STUDIO_STORAGE_ARGUMENT_UNSUPPORTED", `unsupported argument ${argument}.`);
  }
  return result;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = inspectArtStudioStorage(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        error: {
          code: error?.code ?? "ART_STUDIO_STORAGE_UNEXPECTED_ERROR",
          message: error instanceof Error ? error.message : String(error),
          details: error?.details,
        },
      })}\n`,
    );
    process.exitCode = 2;
  }
}
