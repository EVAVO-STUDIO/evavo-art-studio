#!/usr/bin/env node
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(HERE), "..");
const ROOTS = ["C:\\GitRepos", "C:\\Downloads", "C:\\BEESTATION", "approved-discovered-external-roots"];
const REQUIRED_FILES = [
  "config/automation-fabric-client-v2.json",
  "config/automation-fabric-client-v3.json",
  "scripts/check-art-studio-automation-fabric-v3.mjs",
  "scripts/test-art-studio-automation-fabric-v3.mjs",
  "docs/CAPABILITY_DISCOVERY_AND_AUTOMATION_FABRIC.md",
  ".github/workflows/art-studio-capability-contract.yml",
];
const fail = (ok, message) => { if (!ok) throw new Error(message); };
const object = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys, label) => {
  fail(object(value), `${label} must be an object.`);
  for (const key of Object.keys(value)) fail(keys.includes(key), `${label} contains unknown field ${key}.`);
  for (const key of keys) fail(Object.hasOwn(value, key), `${label} is missing ${key}.`);
};
const all = (value, keys, expected, label) => {
  for (const key of keys) fail(value[key] === expected, `${label} ${expected ? "weakened" : "enabled"}: ${key}.`);
};
const number = (value, expected, label) => fail(Number.isFinite(value) && value === expected, `${label} must remain ${expected}.`);
const strings = (value, label) => {
  fail(Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.length > 0), `${label} must be a non-empty string array.`);
  fail(new Set(value).size === value.length, `${label} contains duplicates.`);
  return value;
};
const atLeast = (value, minimum) => {
  const parse = (input) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(String(input));
    fail(Boolean(match), `Invalid semantic version: ${input}`);
    return match.slice(1).map(Number);
  };
  const left = parse(value); const right = parse(minimum);
  for (let index = 0; index < 3; index += 1) if (left[index] !== right[index]) return left[index] > right[index];
  return true;
};

const validateMutation = (value, label) => {
  exact(value, ["operatorRepository","entrypoint","transport","publicRemoteSurface","structuredMutationRequired","rawGitByDefault","rawGithubByDefault"], label);
  fail(value.operatorRepository === "EVAVO-STUDIO/evavo-github-mcp", "GitHub MCP must remain the repository mutation authority.");
  fail(value.entrypoint === "control-plane/agent-workspace-mcp.mjs", "Repository mutation must use the live agent-workspace MCP entrypoint.");
  fail(value.transport === "stdio" && value.publicRemoteSurface === "read-only", "Broad repository writes must remain local stdio while the public surface is read-only.");
  fail(value.structuredMutationRequired === true && value.rawGitByDefault === false && value.rawGithubByDefault === false, "Repository mutation must remain structured and raw Git/GitHub disabled by default.");
};
const validatePublication = (value, label) => {
  exact(value, ["operatorRepository","operator","normalPushOnly","liveRemoteRecheck","declaredPathsOnly","exactHeadRequired","exactStatusRequired","remoteShaVerification","forcePush","resetHard","clean","stashAsRecovery","rebase"], label);
  fail(value.operatorRepository === "EVAVO-STUDIO/evavo-development-studio", "Development Studio must remain the publication authority.");
  fail(value.operator === "scripts/mainline-publish.mjs", "Publication must use the live Development Studio mainline publisher.");
  all(value, ["normalPushOnly","liveRemoteRecheck","declaredPathsOnly","exactHeadRequired","exactStatusRequired","remoteShaVerification"], true, label);
  all(value, ["forcePush","resetHard","clean","stashAsRecovery","rebase"], false, label);
};

export function validateAutomationFabricClientV3(client) {
  exact(client, ["schemaVersion","kind","contractVersion","client","role","canonicalRepository","canonicalStarter","canonicalManifest","minimumLocalStorageVersion","poolId","primaryNodeId","activation","mailboxGeneration","routing","clientResponsibilities","acceleratorRouting","repositoryMutation","publication","manualTerminalRelay","executionEvidence","approvedRoots","safety"], "Automation Fabric v3 client");
  fail(client.schemaVersion === 2 && client.kind === "evavo-automation-fabric-client" && client.contractVersion === 3 && client.client === "evavo-art-studio", "Automation Fabric v3 client identity is invalid.");
  fail(typeof client.role === "string" && client.role.length > 0, "Automation Fabric v3 role is invalid.");
  fail(client.canonicalRepository === "EVAVO-STUDIO/evavo-local-storage" && client.canonicalStarter === "START-EVAVO-AUTOMATION-FABRIC.ps1" && client.canonicalManifest === "config/automation-fabric-capabilities.json", "Automation Fabric v3 canonical authority drifted.");
  fail(atLeast(client.minimumLocalStorageVersion, "0.36.0"), "Automation Fabric v3 requires evavo-local-storage 0.36.0 or newer.");
  fail(client.poolId === "windows-local" && client.primaryNodeId === "windows-primary", "Automation Fabric v3 node or pool identity drifted.");

  exact(client.activation, ["installedRequired","liveRequired","reachableRequired","healthyHeartbeatAloneIsSufficient","exactNodeRoundTripRequired","capabilityRoutedPoolRoundTripRequired","requestToReceiptCorrelationRequired","matchingReceiptCount","duplicateExecutionAllowed","readOnlyReachabilityAction","sourceMustBeExactCleanResolvedOnlineMain","receiptRequiredBeforeRoutineUse"], "Automation Fabric v3 activation");
  all(client.activation, ["installedRequired","liveRequired","reachableRequired","exactNodeRoundTripRequired","capabilityRoutedPoolRoundTripRequired","requestToReceiptCorrelationRequired","sourceMustBeExactCleanResolvedOnlineMain","receiptRequiredBeforeRoutineUse"], true, "Automation Fabric v3 activation");
  all(client.activation, ["healthyHeartbeatAloneIsSufficient","duplicateExecutionAllowed"], false, "Automation Fabric v3 activation");
  number(client.activation.matchingReceiptCount, 1, "Matching receipt count");
  fail(client.activation.readOnlyReachabilityAction === "storage.capabilities", "Reachability must use storage.capabilities.");

  exact(client.mailboxGeneration, ["residentWorkersUseGenerationEpoch","autoscalerUsesGenerationEpoch","burstWorkersInheritGenerationEpoch","capacityPlannerIgnoresPreEpochIssues","olderIssuesDeleted","olderIssuesClosedAutomatically","olderIssuesRemainRecoverable","staleBacklogMayStarveNewGeneration"], "Automation Fabric v3 mailbox generation");
  all(client.mailboxGeneration, ["residentWorkersUseGenerationEpoch","autoscalerUsesGenerationEpoch","burstWorkersInheritGenerationEpoch","capacityPlannerIgnoresPreEpochIssues","olderIssuesRemainRecoverable"], true, "Automation Fabric v3 mailbox generation");
  all(client.mailboxGeneration, ["olderIssuesDeleted","olderIssuesClosedAutomatically","staleBacklogMayStarveNewGeneration"], false, "Automation Fabric v3 mailbox generation");

  exact(client.routing, ["preferWorkerFabric","routeByRequiredCapabilities","specificNodeOverridesPool","poolClaimsAreAtomic","workerLeasesRenewDuringLongJobs","oneProcessPerWorker","residentWorkers","maximumLogicalWorkers","excessDemandPolicy","queuedDoesNotMeanCompleted"], "Automation Fabric v3 routing");
  all(client.routing, ["preferWorkerFabric","routeByRequiredCapabilities","specificNodeOverridesPool","poolClaimsAreAtomic","workerLeasesRenewDuringLongJobs","oneProcessPerWorker","queuedDoesNotMeanCompleted"], true, "Automation Fabric v3 routing");
  number(client.routing.residentWorkers, 2, "Resident worker count");
  number(client.routing.maximumLogicalWorkers, 10, "Maximum logical worker count");
  fail(client.routing.excessDemandPolicy === "queue-not-spawn", "Excess Automation Fabric demand must queue instead of overspawn.");

  exact(client.clientResponsibilities, ["fileFirstPowerShell","powershellGuardRequired","nativePowerShellParseRequired","explicitChildExitCodeRequired","governedArtPlanRequired","sourceHashesRevalidated","providerExecutionRequiresSeparateGate","bytesNeverFlowThroughMcp","guardedMainPublicationRequired","declaredPathsOnly","remoteMainRecheckBeforePush"], "Automation Fabric v3 client responsibilities");
  all(client.clientResponsibilities, Object.keys(client.clientResponsibilities), true, "Automation Fabric v3 client responsibilities");

  exact(client.acceleratorRouting, ["resourceGovernorRepository","minimumLocalComputeVersion","resourceGovernor","heavyAiExactNode","heavyAiPoolTargetingForbidden","requiredCapabilities","hardwareCapabilityMustBeProbedAtJobStart","gpuHeavyJobConcurrency","exclusiveGpuLeaseRequired","preferIsolatedProcessPerHeavyJob","minimumFreeVramHeadroomMiB","minimumFreeSystemRamHeadroomGiB","maximumModelExecutorVramFraction","maximumModelRamFraction","cpuOffloadAllowed","memoryMappedWeightsPreferred","quantizedWeightsPreferredWhenNeeded","quantizedKvCacheAllowedWhenSupported","contextAndBatchMayBeReducedToAvoidOom","pagefileAsPrimaryModelMemory","unifiedMemoryOversubscription","modelProcessExitIsPrimaryGpuMemoryCleanup","modelUnloadAfterHeavyJob","cudaCacheCleanupAfterHeavyJob","gpuCapabilityClaimsRequireLiveProbe","heavyAiJobsRequireResourcePlan","heavyAiJobsRouteToResourceGovernorWorker","providerExecutionGateStillRequired"], "Automation Fabric v3 accelerator routing");
  fail(client.acceleratorRouting.resourceGovernorRepository === "EVAVO-STUDIO/evavo-local-compute" && atLeast(client.acceleratorRouting.minimumLocalComputeVersion, "0.13.0")