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
  const result = validate(clone());
  assert.equal(result.ok, true);
  assert.equal(result.minimumLocalStorageVersion, "0.48.9");
  assert.equal(result.workstationAcceptance, "v8");
  assert.equal(result.namedRepositoryTaskDigestBinding, true);
  assert.equal(result.evaAvatarWorkerTaskName, "eva-avatar-worker-stack");
  assert.deepEqual(result.approvedRoots, [
    "C:\\GitRepos",
    "%USERPROFILE%\\Downloads",
    "resolved-beestation-root",
    "approved-discovered-external-roots",
  ]);
});

test("rejects Local Storage below 0.48.9", () => {
  const candidate = clone();
  candidate.minimumLocalStorageVersion = "0.48.8";
  assert.throws(() => validate(candidate), /0\.48\.9\+/u);
});

test("rejects a pre-v8 workstation implementation", () => {
  const candidate = clone();
  candidate.sourceContract.workstationAcceptanceImplementation = "evavo_local_storage.workstation_acceptance_v7:main";
  assert.throws(() => validate(candidate), /resolve to v8/u);
});

test("rejects named-task compiler and EVA task drift", () => {
  const compiler = clone();
  compiler.sourceContract.developmentStudioNamedTaskCompiler = "packages/runner-fabric/src/legacy-task.ts";
  assert.throws(() => validate(compiler), /named-task compiler/u);
  const taskName = clone();
  taskName.sourceContract.evaAvatarWorkerTaskName = "legacy-eva-task";
  assert.throws(() => validate(taskName), /EVA worker task/u);
  const digest = clone();
  digest.execution.namedRepositoryTaskDigestBindingRequired = false;
  assert.throws(() => validate(digest), /namedRepositoryTaskDigestBindingRequired/u);
});

test("rejects retired physical roots", () => {
  const downloads = clone();
  downloads.execution.approvedRoots[1] = "C:\\Downloads";
  assert.throws(() => validate(downloads), /Approved execution roots drifted/u);
  const bee = clone();
  bee.execution.approvedRoots[2] = "C:\\BEESTATION";
  assert.throws(() => validate(bee), /Approved execution roots drifted/u);
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

test("rejects omitted tracked-script or named-task digest measurement", () => {
  const tracked = clone();
  tracked.execution.plannerMeasuresTrackedScriptSha256 = false;
  assert.throws(() => validate(tracked), /plannerMeasuresTrackedScriptSha256/u);
  for (const key of ["namedTaskPlanMustBindManifestSha256", "namedTaskPlanMustBindTaskSha256"]) {
    const candidate = clone();
    candidate.truthRules[key] = false;
    assert.throws(() => validate(candidate), new RegExp(key, "u"));
  }
});

test("rejects weakened single-execution and managed-main truth", () => {
  for (const key of [
    "commandIdSingleExecutionRequired",
    "duplicateCommandIssueMustFailBeforeExecution",
    "terminalReceiptReplayMustBeIdempotent",
    "stableControlPlaneMustExecuteExactCurrentManagedMain",
    "managedRuntimeUpdatesMustBeFastForwardOnly",
    "managedRuntimeDivergenceMustBeQuarantined",
  ]) {
    const candidate = clone();
    candidate.truthRules[key] = false;
    assert.throws(() => validate(candidate), new RegExp(key, "u"));
  }
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
