import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validate } from "./check-art-studio-workstation-v4-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = JSON.parse(fs.readFileSync(path.join(root, "config/automation-fabric-client-v4.json"), "utf8"));
const clone = () => structuredClone(client);

test("accepts the reviewed Local Storage v4 execution boundary", () => {
  assert.equal(validate(clone()).ok, true);
});

test("rejects v3 workstation routing", () => {
  const candidate = clone();
  candidate.workstationAcceptance.implementation = "evavo_local_storage.workstation_acceptance_v3:main";
  assert.throws(() => validate(candidate), /resolve to v4/u);
});

test("rejects Local Storage below 0.42", () => {
  const candidate = clone();
  candidate.minimumLocalStorageVersion = "0.41.9";
  assert.throws(() => validate(candidate), /0\.42\.0\+/u);
});

test("rejects missing resource-aware admission", () => {
  const candidate = clone();
  candidate.defaultRouting.resourceAwareAdmission = false;
  assert.throws(() => validate(candidate), /resourceAwareAdmission/u);
});

test("rejects unbounded training retry", () => {
  const candidate = clone();
  candidate.workstationAcceptance.trainingCrashBlindRetryAllowed = true;
  assert.throws(() => validate(candidate), /trainingCrashBlindRetryAllowed/u);
});

test("rejects worker push authority", () => {
  const candidate = clone();
  candidate.repositoryTasks.workerPushAllowed = true;
  assert.throws(() => validate(candidate), /workerPushAllowed/u);
});

test("rejects queued work reported as completed", () => {
  const candidate = clone();
  candidate.workerRecovery.queuedWorkCountsAsCompleted = true;
  assert.throws(() => validate(candidate), /receipt semantics/u);
});

test("rejects force push", () => {
  const candidate = clone();
  candidate.publication.forcePush = true;
  assert.throws(() => validate(candidate), /forcePush/u);
});
