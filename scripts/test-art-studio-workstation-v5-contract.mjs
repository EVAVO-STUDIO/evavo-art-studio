import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validate } from "./check-art-studio-workstation-v5-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = JSON.parse(fs.readFileSync(path.join(root, "config/automation-fabric-client-v5.json"), "utf8"));
const clone = () => structuredClone(client);

test("accepts the reviewed Art Studio v5 runtime-truth boundary", () => {
  assert.equal(validate(clone()).ok, true);
});

test("rejects Local Storage below 0.42.1", () => {
  const candidate = clone();
  candidate.minimumLocalStorageVersion = "0.42.0";
  assert.throws(() => validate(candidate), /0\.42\.1\+/u);
});

test("rejects a v3 workstation implementation", () => {
  const candidate = clone();
  candidate.sourceContract.workstationAcceptanceImplementation = "evavo_local_storage.workstation_acceptance_v3:main";
  assert.throws(() => validate(candidate), /resolve to v4/u);
});

test("rejects heartbeat-only reachability", () => {
  const candidate = clone();
  candidate.truthRules.heartbeatAloneIsReachabilityProof = true;
  assert.throws(() => validate(candidate), /heartbeatAloneIsReachabilityProof/u);
});

test("rejects repository execution without a planner receipt", () => {
  const candidate = clone();
  candidate.execution.plannerReceiptRequiredForUnmeasuredRepositoryTask = false;
  assert.throws(() => validate(candidate), /plannerReceiptRequiredForUnmeasuredRepositoryTask/u);
});

test("rejects omitted tracked-script measurement", () => {
  const candidate = clone();
  candidate.execution.plannerMeasuresTrackedScriptSha256 = false;
  assert.throws(() => validate(candidate), /plannerMeasuresTrackedScriptSha256/u);
});

test("rejects worker push authority", () => {
  const candidate = clone();
  candidate.workerAuthority.repositoryPushAllowed = true;
  assert.throws(() => validate(candidate), /repositoryPushAllowed/u);
});

test("rejects creative approval authority", () => {
  const candidate = clone();
  candidate.workerAuthority.creativeApprovalAllowed = true;
  assert.throws(() => validate(candidate), /creativeApprovalAllowed/u);
});

test("rejects physical acceptance as publication evidence", () => {
  const candidate = clone();
  candidate.truthRules.physicalAcceptanceReceiptIsPublicationEvidence = true;
  assert.throws(() => validate(candidate), /physicalAcceptanceReceiptIsPublicationEvidence/u);
});

test("rejects force push and automatic rebase", () => {
  const force = clone();
  force.publication.forcePush = true;
  assert.throws(() => validate(force), /forcePush/u);
  const rebase = clone();
  rebase.publication.automaticRebase = true;
  assert.throws(() => validate(rebase), /automaticRebase/u);
});

test("rejects destructive cleanup and download-implied execution", () => {
  const purge = clone();
  purge.safety.permanentDelete = true;
  assert.throws(() => validate(purge), /permanentDelete/u);
  const download = clone();
  download.safety.downloadAloneAuthorizesExecution = true;
  assert.throws(() => validate(download), /downloadAloneAuthorizesExecution/u);
});
