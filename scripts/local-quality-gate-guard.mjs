import fs from "node:fs";

import {
  buildPlan as buildLibraryPlan,
  canonicalProfile,
  parsePrePushUpdates,
  planForChanges as planForChangesLibrary,
} from "./local-quality-gate-library.mjs";
import {
  RUNTIME_CONTRACT_COMMAND,
  buildRuntimePlan as buildBaseRuntimePlan,
  parseGateArguments,
  runCommand,
  runLocalQualityGate,
  runLocalQualityGateCli as runBaseLocalQualityGateCli,
  safeWorktreeSnapshot,
  writeRuntimeReceipt,
} from "./local-quality-gate-runtime.mjs";

const ZERO_SHA = /^0{40}$/u;

function withLegacyMode(plan) {
  if (!plan || typeof plan !== "object") return plan;
  return Object.freeze({
    ...plan,
    mode: plan.mode ?? plan.profile,
  });
}

export function planForChanges(inputFiles, options = {}) {
  return withLegacyMode(planForChangesLibrary(inputFiles, options));
}

export function buildPlan(requestedProfile, options = {}) {
  return withLegacyMode(buildLibraryPlan(requestedProfile, options));
}

function rejectMainDeletion(updates) {
  const deletion = updates.find(
    (entry) =>
      entry.remoteRef === "refs/heads/main" &&
      ZERO_SHA.test(entry.localSha),
  );
  if (!deletion) return;
  const error = new Error(
    "the governed pre-push boundary does not permit deleting main.",
  );
  error.name = "LocalQualityGateError";
  error.code = "LOCAL_GATE_MAIN_DELETE_FORBIDDEN";
  throw error;
}

function pushUpdates(options = {}) {
  if (options.updates !== undefined) return options.updates;
  const input =
    options.stdinText !== undefined
      ? options.stdinText
      : process.stdin.isTTY
        ? ""
        : fs.readFileSync(0, "utf8");
  return parsePrePushUpdates(input);
}

export function buildRuntimePlan(requestedProfile, options = {}) {
  const canonical = canonicalProfile(requestedProfile);
  if (canonical !== "push") {
    return buildBaseRuntimePlan(requestedProfile, options);
  }
  const updates = options.updates ?? [];
  rejectMainDeletion(updates);
  return buildBaseRuntimePlan(requestedProfile, {
    ...options,
    updates,
  });
}

export async function runLocalQualityGateCli(argv, options = {}) {
  const parsed = parseGateArguments(argv);
  if (canonicalProfile(parsed.requestedProfile) !== "push") {
    return await runBaseLocalQualityGateCli(argv, options);
  }
  const updates = pushUpdates(options);
  rejectMainDeletion(updates);
  return await runBaseLocalQualityGateCli(argv, {
    ...options,
    updates,
  });
}

export {
  RUNTIME_CONTRACT_COMMAND,
  parseGateArguments,
  runCommand,
  runLocalQualityGate,
  safeWorktreeSnapshot,
  writeRuntimeReceipt,
};
