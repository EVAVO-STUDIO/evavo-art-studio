#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkAutomationFabricV3,
  validateAutomationFabricClientV3,
  validateAutomationFabricParity,
} from "./check-art-studio-automation-fabric-v3.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (relative) =>
  JSON.parse(await readFile(path.join(root, relative), "utf8"));
const [v2, v3] = await Promise.all([
  readJson("config/automation-fabric-client-v2.json"),
  readJson("config/automation-fabric-client-v3.json"),
]);
const clone = (value) => structuredClone(value);
const reject = (mutate, pattern) => {
  const candidate = clone(v3);
  mutate(candidate);
  assert.throws(() => validateAutomationFabricClientV3(candidate), pattern);
};

test("validates the repository Automation Fabric v3 contract", async () => {
  const result = await checkAutomationFabricV3(root);
  assert.equal(result.ok, true);
  assert.equal(result.result.contractVersion, 3);
  assert.equal(result.result.reachabilityRequired, true);
  assert.equal(result.result.generationEpochRequired, true);
  assert.equal(result.result.gpuHeavyJobConcurrency, 1);
  assert.equal(result.result.heavyAiExactNode, "windows-general-1");
  assert.equal(result.result.resourceGovernorRepository, "EVAVO-STUDIO/evavo-local-compute");
  assert.equal(result.result.resourceGovernor, "evavo-local-compute-resource-plan");
  assert.equal(result.result.queuedWorkIsCompleted, false);
  assert.equal(result.result.workerReceiptIsPublicationEvidence, false);
  assert.equal(result.parity.compatible, true);
});

test("rejects heartbeat-only activation", () => {
  reject(
    (candidate) => { candidate.activation.healthyHeartbeatAloneIsSufficient = true; },
    /activation enabled: healthyHeartbeatAloneIsSufficient/u,
  );
});

test("rejects missing exact node or pool reachability", () => {
  reject(
    (candidate) => { candidate.activation.exactNodeRoundTripRequired = false; },
    /activation weakened: exactNodeRoundTripRequired/u,
  );
  reject(
    (candidate) => { candidate.activation.capabilityRoutedPoolRoundTripRequired = false; },
    /activation weakened: capabilityRoutedPoolRoundTripRequired/u,
  );
});

test("requires exactly one correlated receipt and no duplicate execution", () => {
  reject(
    (candidate) => { candidate.activation.matchingReceiptCount = 2; },
    /Matching receipt count must remain 1/u,
  );
  reject(
    (candidate) => { candidate.activation.duplicateExecutionAllowed = true; },
    /activation enabled: duplicateExecutionAllowed/u,
  );
});

test("requires the current mailbox generation epoch without deleting history", () => {
  reject(
    (candidate) => { candidate.mailboxGeneration.residentWorkersUseGenerationEpoch = false; },
    /mailbox generation weakened: residentWorkersUseGenerationEpoch/u,
  );
  reject(
    (candidate) => { candidate.mailboxGeneration.staleBacklogMayStarveNewGeneration = true; },
    /mailbox generation enabled: staleBacklogMayStarveNewGeneration/u,
  );
  reject(
    (candidate) => { candidate.mailboxGeneration.olderIssuesDeleted = true; },
    /mailbox generation enabled: olderIssuesDeleted/u,
  );
});

test("requires atomic renewable worker routing and queue-not-spawn capacity", () => {
  reject(
    (candidate) => { candidate.routing.poolClaimsAreAtomic = false; },
    /routing weakened: poolClaimsAreAtomic/u,
  );
  reject(
    (candidate) => { candidate.routing.workerLeasesRenewDuringLongJobs = false; },
    /routing weakened: workerLeasesRenewDuringLongJobs/u,
  );
  reject(
    (candidate) => { candidate.routing.excessDemandPolicy = "spawn-unbounded"; },
    /must queue rather than overspawn/u,
  );
  reject(
    (candidate) => { candidate.routing.queuedDoesNotMeanCompleted = false; },
    /routing weakened: queuedDoesNotMeanCompleted/u,
  );
});

test("keeps the worker pool bounded", () => {
  reject(
    (candidate) => { candidate.routing.residentWorkers = 3; },
    /Resident worker count must remain 2/u,
  );
  reject(
    (candidate) => { candidate.routing.maximumLogicalWorkers = 20; },
    /Maximum logical worker count must remain 10/u,
  );
});

test("requires guarded file-first PowerShell and source revalidation", () => {
  reject(
    (candidate) => { candidate.clientResponsibilities.fileFirstPowerShell = false; },
    /client responsibilities weakened: fileFirstPowerShell/u,
  );
  reject(
    (candidate) => { candidate.clientResponsibilities.nativePowerShellParseRequired = false; },
    /client responsibilities weakened: nativePowerShellParseRequired/u,
  );
  reject(
    (candidate) => { candidate.clientResponsibilities.sourceHashesRevalidated = false; },
    /client responsibilities weakened: sourceHashesRevalidated/u,
  );
  reject(
    (candidate) => { candidate.clientResponsibilities.bytesNeverFlowThroughMcp = false; },
    /client responsibilities weakened: bytesNeverFlowThroughMcp/u,
  );
});

test("routes GPU-heavy work through the exact resource governor", () => {
  reject(
    (candidate) => { candidate.acceleratorRouting.resourceGovernor = "direct-cuda"; },
    /must use EVAVO Local Compute 0.13.0 or newer and its resource governor/u,
  );

  reject(
    (candidate) => { candidate.acceleratorRouting.resourceGovernorRepository = "EVAVO-STUDIO/evavo-art-studio"; },
    /must use EVAVO Local Compute 0.13.0 or newer and its resource governor/u,
  );
  reject(
    (candidate) => { candidate.acceleratorRouting.minimumLocalComputeVersion = "0.12.9"; },
    /must use EVAVO Local Compute 0.13.0 or newer and its resource governor/u,
  );
  reject(
    (candidate) => { candidate.acceleratorRouting.heavyAiExactNode = "windows-primary"; },
    /must route to the exact resource-governor node/u,
  );
  reject(
    (candidate) => { candidate.acceleratorRouting.heavyAiPoolTargetingForbidden = false; },
    /must route to the exact resource-governor node/u,
  );
  reject(
    (candidate) => { candidate.acceleratorRouting.requiredCapabilities = ["gpu-probe"]; },
    /Accelerator routing lacks resource-governor/u,
  );
  reject(
    (candidate) => { candidate.acceleratorRouting.gpuHeavyJobConcurrency = 2; },
    /GPU-heavy job concurrency must remain 1/u,
  );
  reject(
    (candidate) => { candidate.acceleratorRouting.exclusiveGpuLeaseRequired = false; },
    /accelerator routing weakened: exclusiveGpuLeaseRequired/u,
  );
});

test("preserves minimum GPU and system-memory headroom", () => {
  reject(
    (candidate) => { candidate.acceleratorRouting.minimumFreeVramHeadroomMiB = 0; },
    /Minimum free VRAM headroom MiB must remain 768/u,
  );
  reject(
    (candidate) => { candidate.acceleratorRouting.minimumFreeSystemRamHeadroomGiB = 0; },
    /Minimum free system RAM headroom GiB must remain 4/u,
  );
  reject(
    (candidate) => { candidate.acceleratorRouting.maximumModelExecutorVramFraction = 1; },
    /Maximum model executor VRAM fraction must remain 0.9/u,
  );
  reject(
    (candidate) => { candidate.acceleratorRouting.maximumModelRamFraction = 1; },
    /Maximum model RAM fraction must remain 0.72/u,
  );
});

test("rejects unsafe model-memory and stale GPU claims", () => {
  reject(
    (candidate) => { candidate.acceleratorRouting.pagefileAsPrimaryModelMemory = true; },
    /pagefile must not be primary model memory/u,
  );
  reject(
    (candidate) => { candidate.acceleratorRouting.gpuCapabilityClaimsRequireLiveProbe = false; },
    /accelerator routing weakened: gpuCapabilityClaimsRequireLiveProbe/u,
  );
  reject(
    (candidate) => { candidate.acceleratorRouting.preferIsolatedProcessPerHeavyJob = false; },
    /accelerator routing weakened: preferIsolatedProcessPerHeavyJob/u,
  );
  reject(
    (candidate) => { candidate.acceleratorRouting.modelProcessExitIsPrimaryGpuMemoryCleanup = false; },
    /accelerator routing weakened: modelProcessExitIsPrimaryGpuMemoryCleanup/u,
  );
  reject(
    (candidate) => { candidate.acceleratorRouting.modelUnloadAfterHeavyJob = false; },
    /accelerator routing weakened: modelUnloadAfterHeavyJob/u,
  );
});

test("keeps resource planning separate from provider execution authority", () => {
  reject(
    (candidate) => { candidate.acceleratorRouting.providerExecutionGateStillRequired = false; },
    /accelerator routing weakened: providerExecutionGateStillRequired/u,
  );
  reject(
    (candidate) => { candidate.executionEvidence.resourcePlanIsProviderAuthorization = true; },
    /execution evidence enabled: resourcePlanIsProviderAuthorization/u,
  );
});

test("rejects retired or remotely write-enabled repository mutation paths", () => {
  reject(
    (candidate) => { candidate.repositoryMutation.entrypoint = "control-plane/agent-workspace-hardened-server.mjs"; },
    /live agent-workspace MCP entrypoint/u,
  );
  reject(
    (candidate) => { candidate.repositoryMutation.publicRemoteSurface = "read-write"; },
    /public surface is read-only/u,
  );
});

test("rejects retired or destructive publication modes", () => {
  reject(
    (candidate) => { candidate.publication.operator = "scripts/Publish-EvavoRepoMain.ps1"; },
    /live Development Studio mainline publisher/u,
  );
  reject(
    (candidate) => { candidate.publication.forcePush = true; },
    /publication enabled: forcePush/u,
  );
  reject(
    (candidate) => { candidate.safety.gitClean = true; },
    /safety enabled: gitClean/u,
  );
});

test("never treats worker evidence as completion, publication or approval", () => {
  for (const key of [
    "workerReceiptIsPublicationEvidence",
    "queuedWorkIsCompleted",
    "localExecutionIsPublicationPermission",
    "providerReceiptIsGitPublicationEvidence",
    "hardwareProbeIsCreativeApproval",
    "validationIsCreativeApproval",
    "validationIsRuntimePromotion",
  ]) {
    reject(
      (candidate) => { candidate.executionEvidence[key] = true; },
      new RegExp(`execution evidence enabled: ${key}`, "u"),
    );
  }
});

test("does not delegate routine commands back to the user after acceptance", () => {
  reject(
    (candidate) => { candidate.manualTerminalRelay.routineCommandsMustNotBeDelegatedToUser = false; },
    /manual terminal boundary was weakened/u,
  );
});

test("rejects Local Storage version drift below the v3 floor", () => {
  reject(
    (candidate) => { candidate.minimumLocalStorageVersion = "0.35.9"; },
    /0.36.0 or newer/u,
  );
});

test("requires v2 and v3 authority parity", () => {
  const candidate = clone(v3);
  candidate.publication.operatorRepository = "EVAVO-STUDIO/evavo-github-mcp";
  assert.throws(
    () => validateAutomationFabricParity(v2, candidate),
    /v2\/v3 publication authority drifted/u,
  );
});
