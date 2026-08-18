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
} from "./check-art-studio-capability-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (relative) =>
  JSON.parse(await readFile(path.join(root, relative), "utf8"));

const [manifest, schema, packageJson, automationClient] = await Promise.all([
  readJson("evavo.capabilities.json"),
  readJson("schemas/evavo.repository-capabilities.schema.json"),
  readJson("package.json"),
  readJson("config/automation-fabric-client-v5.json"),
]);

const clone = (value) => structuredClone(value);

test("validates the repository capability and v5 runtime-truth contract", async () => {
  const result = await checkRepository(root);
  assert.equal(result.ok, true);
  assert.equal(result.manifest.publicationAuthority, false);
  assert.equal(result.automationFabric.workstationAcceptance, "v4");
  assert.equal(result.automationFabric.exactStateRepositoryTasks, true);
  assert.equal(result.automationFabric.githubActionsWorkerFallback, true);
  assert.equal(result.automationFabric.workerReceiptIsPublicationEvidence, false);
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

test("rejects stale Local Storage floors", () => {
  const candidate = clone(automationClient);
  candidate.minimumLocalStorageVersion = "0.42.0";
  assert.throws(() => validateAutomationFabricClient(candidate), /0\.42\.1 or newer/u);
});

test("rejects workstation acceptance below v4", () => {
  const candidate = clone(automationClient);
  candidate.sourceContract.workstationAcceptanceImplementation = "evavo_local_storage.workstation_acceptance_v3:main";
  assert.throws(() => validateAutomationFabricClient(candidate), /workstation acceptance v4/u);
});

test("rejects execution without read-only repository planning", () => {
  const candidate = clone(automationClient);
  candidate.execution.plannerReceiptRequiredForUnmeasuredRepositoryTask = false;
  assert.throws(() => validateAutomationFabricClient(candidate), /plannerReceiptRequiredForUnmeasuredRepositoryTask/u);
});

test("rejects exact-state measurement drift", () => {
  const candidate = clone(automationClient);
  candidate.execution.plannerMeasuresTrackedScriptSha256 = false;
  assert.throws(() => validateAutomationFabricClient(candidate), /plannerMeasuresTrackedScriptSha256/u);
});

test("rejects unbounded or non-transient retries", () => {
  const candidate = clone(automationClient);
  candidate.execution.automaticTransientRetryOnly = false;
  assert.throws(() => validateAutomationFabricClient(candidate), /automaticTransientRetryOnly/u);
  const tooMany = clone(automationClient);
  tooMany.execution.maximumAttempts = 10;
  assert.throws(() => validateAutomationFabricClient(tooMany), /bounded to three attempts/u);
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
});

test("rejects direct terminal delegation while remote recovery remains available", () => {
  const candidate = clone(automationClient);
  candidate.routing.askGregToPasteRoutineTerminalCommands = true;
  assert.throws(() => validateAutomationFabricClient(candidate), /must not be delegated to Greg/u);
});

test("rejects force push, automatic merge, and automatic rebase", () => {
  for (const key of ["forcePush", "automaticMerge", "automaticRebase"]) {
    const candidate = clone(automationClient);
    candidate.publication[key] = true;
    assert.throws(() => validateAutomationFabricClient(candidate), new RegExp(`enabled: ${key}`, "u"));
  }
});

test("rejects destructive cleanup and secret override boundaries", () => {
  for (const key of ["resetHard","gitClean","stashAsRecovery","permanentDelete","providerDeleteImpliedByWorkerAuthority","downloadAloneAuthorizesExecution","secretEnvironmentCallerOverride"]) {
    const candidate = clone(automationClient);
    candidate.safety[key] = true;
    assert.throws(() => validateAutomationFabricClient(candidate), new RegExp(`Safety boundary weakened: ${key}`, "u"));
  }
});
