#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkRepository, validateUpstreamReview } from "./check-art-studio-upstream-review.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const [review, client, recovery] = await Promise.all([
  readJson("config/automation-fabric-upstream-review-v1.json"),
  readJson("config/automation-fabric-client-v5.json"),
  readJson("config/automation-fabric-recovery-chain.json"),
]);
const clone = (value) => structuredClone(value);

test("validates the current reviewed Development Studio and Local Storage runtime", async () => {
  const result = await checkRepository(root);
  assert.equal(result.ok, true);
  assert.equal(result.localStorage.packageVersion, "0.48.2");
  assert.equal(result.localStorage.automationFabricSchemaVersion, 3);
  assert.equal(result.localStorage.automationFabricVersion, "3.1");
  assert.equal(result.localStorage.workstationAcceptance, "evavo-workstation-acceptance-v8");
  assert.equal(result.localStorage.reviewedMain, "cb10e3409f686d00eaeea5a53b3c391dbb125c55");
  assert.equal(result.developmentStudio.reviewedMain, "8fdcb2a2a96b8ac44866f721105bd4ae7d7f0f2c");
  assert.equal(result.developmentStudio.publicationCapability, "development.repository.publish");
  assert.equal(result.developmentStudio.missionPublicationCapability, "development.repository.mission-publish");
  assert.equal(result.queuedIssueIsSuccess, false);
  assert.equal(result.windowsExecutionReceiptRequired, true);
});

test("rejects stale Local Storage package or Fabric review", () => {
  const stalePackage = clone(review);
  stalePackage.localStorage.packageVersion = "0.48.1";
  assert.throws(() => validateUpstreamReview(stalePackage, client, recovery), /must be 0\.48\.2/u);
  const staleFabric = clone(review);
  staleFabric.localStorage.automationFabricVersion = "3.0";
  assert.throws(() => validateUpstreamReview(staleFabric, client, recovery), /must be 3\.1/u);
  const staleSchema = clone(review);
  staleSchema.localStorage.automationFabricSchemaVersion = 2;
  assert.throws(() => validateUpstreamReview(staleSchema, client, recovery), /schema must be 3/u);
});

test("rejects worker-plan or receipt truth weakening", () => {
  for (const key of ["readOnlyPlanBeforeUnmeasuredExecution","exactHeadRequired","exactStatusSha256Required","trackedScriptSha256Required","singleCorrelatedReceiptRequired","windowsExecutionReceiptRequired","resourceAwareAdmissionRequired","boundedProcessTreeTerminationRequired"]) {
    const candidate = clone(review);
    candidate.executionTruth[key] = false;
    assert.throws(() => validateUpstreamReview(candidate, client, recovery), new RegExp(key, "u"));
  }
  for (const key of ["queuedIssueIsSuccess","workerReceiptIsPublicationEvidence","manualTerminalRelayIsRoutinePath"]) {
    const candidate = clone(review);
    candidate.executionTruth[key] = true;
    assert.throws(() => validateUpstreamReview(candidate, client, recovery), new RegExp(key, "u"));
  }
});

test("rejects publication or runtime authority leaking into the worker review", () => {
  for (const key of Object.keys(review.authority)) {
    const candidate = clone(review);
    candidate.authority[key] = true;
    assert.throws(() => validateUpstreamReview(candidate, client, recovery), new RegExp(key, "u"));
  }
});

test("rejects Development Studio publication-route drift", () => {
  const wrongOperator = clone(review);
  wrongOperator.developmentStudio.publicationOperator = "scripts/legacy-publish.mjs";
  assert.throws(() => validateUpstreamReview(wrongOperator, client, recovery), /publication operator drifted/u);
  const wrongAuthority = clone(review);
  wrongAuthority.developmentStudio.publicationCapability = "development.repository.mission-publish";
  assert.throws(() => validateUpstreamReview(wrongAuthority, client, recovery), /Single publication capability drifted/u);
});

test("rejects disagreement with Art Studio's existing routing contracts", () => {
  const mismatchedClient = clone(client);
  mismatchedClient.sourceContract.repositoryTaskPlanAction = "storage.repository_task_state";
  assert.throws(() => validateUpstreamReview(review, mismatchedClient, recovery), /task bindings disagree/u);
  const mismatchedRecovery = clone(recovery);
  mismatchedRecovery.rules.poolReceiptRequired = false;
  assert.throws(() => validateUpstreamReview(review, client, mismatchedRecovery), /receipt requirements weakened/u);
});
