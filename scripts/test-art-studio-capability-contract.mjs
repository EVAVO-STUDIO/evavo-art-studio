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

test("validates the repository capability and current runtime-truth contract", async () => {
  const result = await checkRepository(root);
  assert.equal(result.ok, true);
  assert.equal(result.manifest.publicationAuthority, false);
  assert.equal(result.automationFabric.minimumLocalStorageVersion, "0.48.0");
  assert.equal(result.automationFabric.workstationAcceptance, "v8");
  assert.equal(result.automationFabric.exactStateRepositoryTasks, true);
  assert.equal(result.automationFabric.supervisorFirstRecovery, true);
  assert.equal(result.automationFabric.commandIdSingleExecutionRequired, true);
  assert.equal(result.automationFabric.githubActionsWorkerFallback, true);
  assert.equal(result.automationFabric.workerReceiptIsPublicationEvidence, false);
  assert.deepEqual(result.recovery.order, ["supervisor-first", "legacy-certified", "immutable-armer"]);
  assert.equal(automationClient.reviewedLocalStorageMain, "0a618a955bea113a850a883c81f128eb2fcf0883");
  assert.equal(automationClient.reviewedDevelopmentStudioMain, "ecc6a76bf98b5077980d0ab00d45707929a1c3e2");
  assert.deepEqual(automationClient.execution.approvedRoots, [
    "C:\\GitRepos",
    "%USERPROFILE%\\Downloads",
    "resolved-beestation-root",
    "approved-discovered-external-roots",
  ]);
});

test("rejects duplicate capability identities", () => {
  const candidate = clone(manifest);
  candidate.capabilities[1].id = candidate.capabilities[0].id;
  assert.throws(() => validateCapabilityManifest(candidate, schema, packageJson), /Capability IDs must be unique/u);
});

test("rejects a capability that claims publication", () => {
  const candidate = clone(manifest);
  candidate.capabilities[0].effects.push("publish");
  assert.throws(() => validateCapabilityManifest(candidate, schema, packageJson), /must not claim Git or mainline publication authority/u);
});

test("rejects stale Local Storage floors and acceptance implementations", () => {
  const stale = clone(automationClient);
  stale.minimumLocalStorageVersion = "0.47.9";
  assert.throws(() => validateAutomationFabricClient(stale), /0\.48\.0 or newer/u);
  const oldAcceptance = clone(automationClient);
  oldAcceptance.sourceContract.workstationAcceptanceImplementation = "evavo_local_storage.workstation_acceptance_v4:main";
  assert.throws(() => validateAutomationFabricClient(oldAcceptance), /workstation acceptance v8/u);
});

test("rejects legacy Downloads and BeeStation roots", () => {
  const legacyDownloads = clone(automationClient);
  legacyDownloads.execution.approvedRoots[1] = "C:\\Downloads";
  assert.throws(() => validateAutomationFabricClient(legacyDownloads), /Approved execution roots drifted/u);
  const legacyBeeStation = clone(automationClient);
  legacyBeeStation.execution.approvedRoots[2] = "C:\\BEESTATION";
  assert.throws(() => validateAutomationFabricClient(legacyBeeStation), /Approved execution roots drifted/u);
});

test("rejects execution without exact-state planning", () => {
  for (const key of ["plannerReceiptRequiredForUnmeasuredRepositoryTask","plannerMeasuresExactHead","plannerMeasuresExactStatusSha256","plannerMeasuresTrackedScriptSha256","trackedScriptBytesRequired"]) {
    const candidate = clone(automationClient);
    candidate.execution[key] = false;
    assert.throws(() => validateAutomationFabricClient(candidate), new RegExp(key, "u"));
  }
});

test("rejects duplicate-command or replay weakening", () => {
  for (const key of ["commandIdSingleExecutionRequired","duplicateCommandIssueMustFailBeforeExecution","terminalReceiptReplayMustBeIdempotent","stableControlPlaneMustExecuteExactCurrentManagedMain","managedRuntimeUpdatesMustBeFastForwardOnly","managedRuntimeDivergenceMustBeQuarantined"]) {
    const candidate = clone(automationClient);
    candidate.truthRules[key] = false;
    assert.throws(() => validateAutomationFabricClient(candidate), new RegExp(key, "u"));
  }
});

test("rejects unbounded or non-transient retries", () => {
  const retry = clone(automationClient);
  retry.execution.automaticTransientRetryOnly = false;
  assert.throws(() => validateAutomationFabricClient(retry), /automaticTransientRetryOnly/u);
  const tooMany = clone(automationClient);
  tooMany.execution.maximumAttempts = 10;
  assert.throws(() => validateAutomationFabricClient(tooMany), /bounded to three attempts/u);
});

test("rejects recovery ordering drift and mailbox-dependent repair", () => {
  const reordered = clone(recoveryChain);
  [reordered.order[0], reordered.order[1]] = [reordered.order[1], reordered.order[0]];
  assert.throws(() => validateRecoveryChain(reordered), /Recovery chain order changed/u);
  const mailbox = clone(recoveryChain);
  mailbox.rules.mailboxDependentRepairAllowedWhenMailboxUnreachable = true;
  assert.throws(() => validateRecoveryChain(mailbox), /Dead mailbox must not repair itself/u);
});

test("rejects missing recovery receipts and non-fast-forward managed updates", () => {
  for (const key of ["exactNodeReceiptRequired","poolReceiptRequired","freshReceiptsRequiredBeforeRoutineWork","managedRuntimeUpdatesMustBeFastForwardOnly","managedRuntimeDivergenceMustBeQuarantined"]) {
    const candidate = clone(recoveryChain);
    candidate.rules[key] = false;
    assert.throws(() => validateRecoveryChain(candidate), new RegExp(key, "u"));
  }
});

test("rejects GitHub Actions fallback outside zero-step provider allocation failure", () => {
  const candidate = clone(automationClient);
  candidate.githubActionsFallback.zeroStepsRequired = false;
  assert.throws(() => validateAutomationFabricClient(candidate), /zeroStepsRequired/u);
  const wrongStatus = clone(automationClient);
  wrongStatus.githubActionsFallback.eligibleStatus = "test-failed";
  assert.throws(() => validateAutomationFabricClient(wrongStatus), /fallback contract drifted/u);
});

test("rejects worker receipts represented as GitHub or publication evidence", () => {
  const candidate = clone(automationClient);
  candidate.githubActionsFallback.githubActionsEquivalent = true;
  assert.throws(() => validateAutomationFabricClient(candidate), /overclaims githubActionsEquivalent/u);
  const publication = clone(automationClient);
  publication.githubActionsFallback.workerReceiptIsPublicationEvidence = true;
  assert.throws(() => validateAutomationFabricClient(publication), /overclaims workerReceiptIsPublicationEvidence/u);
});

test("rejects worker commit, push, approval, promotion, or activation authority", () => {
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
});

test("rejects direct terminal delegation while recovery remains available", () => {
  const candidate = clone(automationClient);
  candidate.routing.askGregToPasteRoutineTerminalCommands = true;
  assert.throws(() => validateAutomationFabricClient(candidate), /must not be delegated to Greg/u);
});

test("rejects force push, automatic merge, rebase and destructive cleanup", () => {
  for (const key of ["forcePush", "automaticMerge", "automaticRebase"]) {
    const candidate = clone(automationClient);
    candidate.publication[key] = true;
    assert.throws(() => validateAutomationFabricClient(candidate), new RegExp(`enabled: ${key}`, "u"));
  }
  for (const key of ["resetHard","gitClean","stashAsRecovery","permanentDelete","providerDeleteImpliedByWorkerAuthority","downloadAloneAuthorizesExecution","secretEnvironmentCallerOverride"]) {
    const candidate = clone(automationClient);
    candidate.safety[key] = true;
    assert.throws(() => validateAutomationFabricClient(candidate), new RegExp(`Safety boundary weakened: ${key}`, "u"));
  }
});
