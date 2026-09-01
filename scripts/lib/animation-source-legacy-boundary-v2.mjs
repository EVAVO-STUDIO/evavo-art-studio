import { lstat, realpath } from "node:fs/promises";
import { resolve } from "node:path";

import { legacyAnimationSourceAccesses } from "./animation-source-legacy-access-v2.mjs";
import {
  MAX_LEGACY_SCAN_TOTAL_BYTES,
  failLegacy,
  isCodePath,
  isNonProductionPath,
} from "./animation-source-legacy-common-v2.mjs";
import { readTrackedCodeV2 } from "./animation-source-legacy-read-v2.mjs";
import { listTrackedPathsV2 } from "./animation-source-legacy-tracked-v2.mjs";

export async function inspectAnimationSourceLegacyUsageV2(root = process.cwd()) {
  const requestedRoot = resolve(root);
  const repositoryRoot = await realpath(requestedRoot);
  const rootState = await lstat(repositoryRoot, { bigint: true });
  if (rootState.isSymbolicLink() || !rootState.isDirectory()) {
    failLegacy("ANIMATION_SOURCE_LEGACY_V2_ROOT_INVALID", requestedRoot);
  }

  const tracked = listTrackedPathsV2(repositoryRoot);
  const violations = [];
  let scannedFileCount = 0;
  let scannedBytes = 0;
  for (const trackedPath of tracked) {
    if (!isCodePath(trackedPath) || isNonProductionPath(trackedPath)) continue;
    const observed = await readTrackedCodeV2(repositoryRoot, trackedPath);
    scannedBytes += observed.byteLength;
    if (scannedBytes > MAX_LEGACY_SCAN_TOTAL_BYTES) {
      failLegacy("ANIMATION_SOURCE_LEGACY_V2_SCAN_TOO_LARGE", String(scannedBytes));
    }
    scannedFileCount += 1;
    const accesses = legacyAnimationSourceAccesses(
      observed.source,
      trackedPath,
    );
    if (accesses.length) {
      violations.push(Object.freeze({ trackedPath, accesses }));
    }
  }

  return Object.freeze({
    schema: "evavo.animation-source-legacy-usage.v2",
    status: violations.length ? "failed" : "passed",
    trackedFileCount: tracked.length,
    scannedFileCount,
    scannedBytes,
    stableDoubleRead: true,
    portablePathCollisionCheck: true,
    violations: Object.freeze(violations),
    authority: Object.freeze({
      providerExecution: false,
      renderExecution: false,
      publication: false,
      repositoryMutation: false,
      deployment: false,
      githubActionsRequired: false,
      vercelRequired: false,
    }),
  });
}

export async function assertAnimationSourceLegacyUsageV2(root = process.cwd()) {
  const report = await inspectAnimationSourceLegacyUsageV2(root);
  if (report.status !== "passed") {
    failLegacy(
      "ANIMATION_SOURCE_LEGACY_V2_PRODUCTION_USAGE_FORBIDDEN",
      report.violations
        .map((entry) => `${entry.trackedPath}:${entry.accesses.join(",")}`)
        .join(";"),
      report,
    );
  }
  return report;
}
