#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkRepository,
  validateAutomationFabricClient,
  validateCapabilityManifest,
  validateRecoveryChain,
} from "./check-art-studio-capability-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const [manifest, schema, packageJson, automationClient, recoveryChain] = await Promise.all([
  readJson("evavo.capabilities.json"),
  readJson("schemas/evavo.repository-capabilities.schema.json"),
  readJson("package.json"),
  readJson("config/automation-fabric-client-v5.json"),
  readJson("config/automation-fabric-recovery-chain.json"),
]);
const clone = (value) => structuredClone(value);

test("current Art Studio runtime truth follows the reviewed worker estate", async () => {
  const result = await checkRepository(root);
  assert.equal(result.ok, true);
  assert.equal(result.manifest.publicationAuthority, false);
  assert.equal(result.automationFabric.minimumLocalStorageVersion, "0.48.4");
  assert.equal(result.automationFabric.workstationAcceptance, "v8");
  assert.equal(result.automationFabric.exactStateRepositoryTasks, true);
  assert.equal(result.automationFabric.supervisorFirstRecovery, true);
  assert.equal(result.automationFabric.commandIdSingleExecutionRequired, true);
  assert.equal(result.automationFabric.githubActionsWorkerFallback, true);
  assert.equal(result.automationFabric.workerReceiptIsPublicationEvidence, false);
  assert.deepEqual(result.recovery.order, ["supervisor-first", "legacy-certified", "immutable-armer"]);
  assert.equal(automationClient.reviewedLocalStorageMain, "32a1ed2801aca3847ea96b787bd24dcf7b088393");
  assert.equal(automationClient.reviewedDevelopmentStudioMain, "88e1d36f6006c25e3567f5e8d8d8979c54407d60");
  assert.deepEqual(automationClient.execution.approvedRoots, [
    "C:\\GitRepos",
    "%USERPROFILE%\\Downloads",
    "resolved-beestation-root",
    "approved-discovered-external-roots",
  ]);
});

test("capabilities cannot claim publication or duplicate identities", () => {
  const duplicate = clone(manifest);
  duplicate.capabilities[1].id = duplicate.capabilities[0].id;
  assert.throws(() => validateCapabilityManifest(duplicate, schema, packageJson), /Capability IDs must be unique/u);

  const publication = clone(manifest);
  publication.capabilities[0].effects.push("publish");
  assert.throws(() => validateCapabilityManifest(publication, schema, packageJson), /must not claim Git or mainline publication authority/u);
});

test("worker runtime rejects stale floors, roots and acceptance implementations", () => {
  const stale = clone(automationClient);
  stale.minimumLocalStorageVersion = "0.47.9";
  assert.throws(() => validateAutomationFabricClient(stale), /0\.48\.0 or newer/u);

  const oldAcceptance = clone(automationClient);
  oldAcceptance.sourceContract.workstationAcceptanceImplementation = "evavo_local_storage.workstation_acceptance_v4:main";
  assert.throws(() => validateAutomationFabricClient(oldAcceptance), /workstation acceptance v8/u);

  const legacyDownloads = clone(automationClient);
  legacyDownloads.execution.approvedRoots[1] = "C:\\Downloads";
  assert.throws(() => validateAutomationFabricClient(legacyDownloads), /Approved execution roots drifted/u);

  const legacyBeeStation = clone(automationClient);
  legacyBeeStation.execution.approvedRoots[2] = "C:\\BEESTATION";
  assert.throws(() => validateAutomationFabricClient(legacyBeeStation), /Approved execution roots drifted/u);
});

test("exact-state execution, retries and recovery remain fail closed", () => {
  for (const key of ["plannerReceiptRequiredForUnmeasuredRepositoryTask","plannerMeasuresExactHead","plannerMeasuresExactStatusSha256","plannerMeasuresTrackedScriptSha256","trackedScriptBytesRequired"]) {
    const candidate = clone(automationClient);
    candidate.execution[key] = false;
    assert.throws(() => validateAutomationFabricClient(candidate), new RegExp(key, "u"));
  }

  const retry = clone(automationClient);
  retry.execution.automaticTransientRetryOnly = false;
  assert.throws(() => validateAutomationFabricClient(retry), /automaticTransientRetryOnly/u);

  const tooMany = clone(automationClient);
  tooMany.execution.maximumAttempts = 10;
  assert.throws(() => validateAutomationFabricClient(tooMany), /bounded to three attempts/u);

  const mailbox = clone(recoveryChain);
  mailbox.rules.mailboxDependentRepairAllowedWhenMailboxUnreachable = true;
  assert.throws(() => validateRecoveryChain(mailbox), /Dead mailbox must not repair itself/u);
});

test("worker and recovery authority cannot escalate", () => {
  for (const key of Object.keys(automationClient.workerAuthority)) {
    const candidate = clone(automationClient);
    candidate.workerAuthority[key] = true;
    assert.throws(() => validateAutomationFabricClient(candidate), new RegExp(`Worker authority must remain closed: ${key}`, "u"));
  }
  for (const key of Object.keys(recoveryChain.authority)) {
    const candidate = clone(recoveryChain);
    candidate.authority[key] = true;
    assert.throws(() => validateRecoveryChain(candidate), new RegExp(`Recovery authority must remain closed: ${key}`, "u"));
  }

  const manual = clone(automationClient);
  manual.routing.askGregToPasteRoutineTerminalCommands = true;
  assert.throws(() => validateAutomationFabricClient(manual), /must not be delegated to Greg/u);

  for (const key of ["forcePush", "automaticMerge", "automaticRebase"]) {
    const candidate = clone(automationClient);
    candidate.publication[key] = true;
    assert.throws(() => validateAutomationFabricClient(candidate), new RegExp(`enabled: ${key}`, "u"));
  }
});
