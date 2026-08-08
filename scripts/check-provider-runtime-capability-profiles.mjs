import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function includes(path, values) {
  const text = await source(path);
  for (const value of values) {
    assert.ok(text.includes(value), `${path} is missing permanent contract: ${value}`);
  }
  return text;
}

await includes("packages/runtime/src/types.ts", [
  "requiredCapabilityProfile?: readonly string[];",
  "RuntimeWorkerCapabilityProfile",
  "capabilityProfiles?: readonly RuntimeWorkerCapabilityProfile[];",
]);
const runtimeNormalization = await includes("packages/runtime/src/normalize.ts", [
  "normalizeRuntimeWorkerDescriptor",
  "requiredCapabilityProfile",
  "capabilityProfiles.some",
  "requiredProfile.every",
]);
assert.ok(
  !runtimeNormalization.includes("capabilityProfiles.flatMap"),
  "Runtime capability profiles must not be unioned before matching.",
);
const runtimeRepository = await includes("packages/runtime/src/local-repository.ts", [
  "snapshotRuntimeClaimRequest(request)",
  "normalizeRuntimeWorkerDescriptor(",
  "workerCanRun(job, capabilities, capabilityProfiles)",
]);
for (const liveRead of [
  "normalizeRuntimeWorkerDescriptor(request.worker)",
  "request.worker",
  "request.maximumJobs",
  "request.now",
]) {
  assert.ok(
    !runtimeRepository.includes(liveRead),
    `Runtime claim capability routing must use the immutable request snapshot, not ${liveRead}.`,
  );
}
const runtimeWorker = await includes("packages/runtime/src/worker.ts", [
  "snapshotRuntimeWorkerOptions",
  "snapshotHandlers",
  "normalizeRuntimeWorkerDescriptor(",
  "readWorkerOption(source, \"worker\", \"options\")",
]);
assert.ok(
  !runtimeWorker.includes("normalizeRuntimeWorkerDescriptor(options.worker)"),
  "Runtime worker capability profiles must be bound through the immutable option snapshot.",
);
await includes("packages/runtime/test/runtime.test.mjs", [
  "one worker capability profile must satisfy the complete job requirement",
  "worker-split-profiles",
  "worker-complete-profile",
]);
await includes("packages/runtime/test/worker-options-integrity-security.test.mjs", [
  "runtime worker descriptors are snapshotted once before scheduling",
  "runtime worker options bind execution to one immutable handler snapshot",
]);
await includes("packages/runtime/test/claim-input-integrity-security.test.mjs", [
  "claim request fields are read exactly once before journal work",
  "post-call clock mutation cannot advance delayed jobs or extend leases",
]);
await includes("apps/worker/src/provider-handlers.ts", [
  "providerRequiredCapabilities(request)",
  "PROVIDER_RUNTIME_CAPABILITY_PROFILE_MISSING",
  "PROVIDER_RUNTIME_CAPABILITY_PROFILE_MISMATCH",
  "providerWorkerCapabilityProfiles",
]);
await includes("apps/worker/src/index.ts", [
  "providerWorkerCapabilityProfiles(providerRegistry)",
  "capabilityProfiles: providerCapabilityProfiles",
]);
await includes("packages/sprite-supervisor/src/engine.ts", [
  "providerRequiredCapabilities",
  "validateProviderCandidateRequest(payload)",
  "SPRITE_SUPERVISOR_PROVIDER_PROFILE_INVALID",
  "requiredCapabilityProfile",
]);
await includes("packages/book-art-runtime/src/index.ts", [
  "requiredCapabilityProfile: providerRequiredCapabilities(",
]);
await includes("packages/book-art-runtime/src/candidate-set.ts", [
  "requiredCapabilityProfile: providerRequiredCapabilities(",
]);
await includes("packages/repair/src/planner.ts", [
  "requiredCapabilityProfile: providerRequiredCapabilities(normalized)",
]);
await includes("apps/worker/src/repair-handlers.ts", [
  "packet.providerPlan.runtimeJob.requiredCapabilityProfile",
  "TARGETED_REPAIR_PACKET_CAPABILITY_PROFILE_MISMATCH",
  "TARGETED_REPAIR_RUNTIME_CAPABILITY_PROFILE_MISMATCH",
]);
await includes("apps/mcp/src/provider-tools.ts", [
  "requiredCapabilityProfile: providerRequiredCapabilities(request)",
]);
await includes("apps/api/openapi.yaml", [
  "requiredCapabilityProfile:",
  "Capabilities may not be assembled across multiple profiles.",
]);
await includes("docs/durable-runtime-and-artifacts.md", [
  "one single worker profile must contain the complete set",
  "never assembles a match by unioning partial capabilities",
]);
await includes("docs/governed-provider-candidates.md", [
  "requiredCapabilityProfile",
  "never combines identity support from one adapter",
]);
await includes(".github/workflows/provider-control-capabilities.yml", [
  "check-provider-runtime-capability-profiles.mjs",
  "packages/runtime/src/**",
  "packages/sprite-supervisor/src/**",
]);
await includes(".github/workflows/runtime-worker-options-integrity.yml", [
  "worker-options-integrity-security.test.mjs",
  "check-provider-runtime-capability-profiles.mjs",
]);
await includes(".github/workflows/runtime-claim-input-integrity.yml", [
  "claim-input-integrity-security.test.mjs",
  "check-provider-runtime-capability-profiles.mjs",
]);

console.log("Provider runtime capability-profile contract passed.");
