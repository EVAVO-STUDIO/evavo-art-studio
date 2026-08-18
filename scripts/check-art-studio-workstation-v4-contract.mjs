#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(here), "..");
const fail = (condition, message) => { if (!condition) throw new Error(message); };
const semver = (value) => String(value).split(".").map(Number);
const atLeast = (value, floor) => {
  const a = semver(value); const b = semver(floor);
  for (let i = 0; i < 3; i += 1) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return true;
};

export function validate(client) {
  fail(client.schemaVersion === 2, "Art Studio workstation client must use schema 2.");
  fail(client.kind === "evavo-automation-fabric-client", "Automation Fabric client kind drifted.");
  fail(client.client === "evavo-art-studio", "Automation Fabric client identity drifted.");
  fail(client.canonicalRepository === "EVAVO-STUDIO/evavo-local-storage", "Local Storage authority drifted.");
  fail(client.fabricVersion === "3.0", "Automation Fabric 3.0 is required.");
  fail(atLeast(client.minimumLocalStorageVersion, "0.42.0"), "Local Storage 0.42.0+ is required.");
  fail(client.minimumWorkstationAcceptanceCommit === "61ca89063644d4f868f1f8d35502b4011aa83910", "Workstation v4 acceptance floor drifted.");
  fail(/^[a-f0-9]{40}$/u.test(client.reviewedLocalStorageMain), "Reviewed Local Storage SHA is invalid.");
  fail(/^[a-f0-9]{40}$/u.test(client.reviewedDevelopmentStudioMain), "Reviewed Development Studio SHA is invalid.");

  const routing = client.defaultRouting;
  for (const key of ["preferWorkerFabric","fileFirstPowerShell","powershellGuardRequired","capabilityRouted","receiptRequired","exactStateRepositoryTasks","resourceAwareAdmission","boundedProcessTreeTermination","automaticTransientRetryOnly"]) fail(routing?.[key] === true, `Routing safety weakened: ${key}.`);
  fail(routing.manualTerminalRelayRequired === false, "Manual terminal relay must remain exceptional.");

  const acceptance = client.workstationAcceptance;
  fail(acceptance.command === "evavo-local-storage-workstation-accept", "Canonical workstation command drifted.");
  fail(acceptance.implementation === "evavo_local_storage.workstation_acceptance_v4:main", "Canonical workstation command must resolve to v4.");
  fail(acceptance.receiptSchemaVersion === 4, "Workstation acceptance must emit schema-4 receipts.");
  for (const key of ["resourceBaselineRequired","runtimeCleanupAlwaysRuns","resourceFinalRequired","workingRepositoriesPreserved"]) fail(acceptance[key] === true, `Workstation acceptance safety weakened: ${key}.`);
  fail(acceptance.maximumAttempts === 3, "Workstation retries must remain bounded to three attempts.");
  for (const key of ["trainingCrashBlindRetryAllowed","gpuResetAllowed","pageFileTreatedAsVram"]) fail(acceptance[key] === false, `Unsafe workstation behavior enabled: ${key}.`);

  const tasks = client.repositoryTasks;
  fail(tasks.schemaVersion === 4, "Repository task schema 4 is required.");
  for (const key of ["exactHeadRequired","exactStatusRequired","trackedScriptBytesRequired","credentialStrippingRequired"]) fail(tasks[key] === true, `Repository-task safety weakened: ${key}.`);
  for (const key of ["workerCommitAllowed","workerPushAllowed","workerPublicationAllowed"]) fail(tasks[key] === false, `Worker authority widened: ${key}.`);

  const recovery = client.workerRecovery;
  fail(recovery.probeOnlyByDefault === true && recovery.epochSafe === true, "Worker recovery must remain probe-only and epoch-safe.");
  fail(recovery.matchingReceiptCount === 1 && recovery.queuedWorkCountsAsCompleted === false && recovery.duplicateExecutionAllowed === false, "Worker recovery receipt semantics drifted.");

  fail(client.publication.operatorRepository === "EVAVO-STUDIO/evavo-development-studio", "Development Studio publication authority drifted.");
  for (const key of ["normalPushOnly","liveRemoteRecheck","declaredPathsOnly","exactHeadRequired","exactStatusRequired","remoteShaVerification"]) fail(client.publication[key] === true, `Publication safety weakened: ${key}.`);
  for (const key of ["forcePush","resetHard","clean","stashAsRecovery","rebase"]) fail(client.publication[key] === false, `Destructive publication behavior enabled: ${key}.`);

  fail(client.repositoryMutation.publicRemoteSurface === "read-only", "Public GitHub mutation surface must remain read-only.");
  fail(client.cleanup.permanentPurgeAvailableToAgents === false, "Permanent purge must remain unavailable to agents.");
  fail(client.downloadedExecution.downloadSuccessAloneAuthorizesExecution === false, "Download success cannot authorize execution.");

  return Object.freeze({
    schema: "evavo.art-studio-workstation-v4-contract.v1",
    ok: true,
    fabricVersion: client.fabricVersion,
    minimumLocalStorageVersion: client.minimumLocalStorageVersion,
    receiptSchemaVersion: acceptance.receiptSchemaVersion,
    publicationAuthority: client.publication.operatorRepository,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(here)) {
  const client = JSON.parse(fs.readFileSync(path.join(root, "config/automation-fabric-client-v4.json"), "utf8"));
  console.log(JSON.stringify(validate(client)));
}
