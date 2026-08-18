import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateTask } from "./check-eva-dense-motion-workstation-task.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const task = JSON.parse(fs.readFileSync(path.join(root, "config/eva-dense-motion-workstation-task-v1.json"), "utf8"));
const script = fs.readFileSync(path.join(root, "scripts/Invoke-EvaDenseMotionWorkstationValidation.ps1"), "utf8");
const v5 = JSON.parse(fs.readFileSync(path.join(root, "config/automation-fabric-client-v5.json"), "utf8"));
const clone = (value) => structuredClone(value);

test("accepts the exact planner-bound EVA workstation task", () => {
  const result = validateTask(clone(task), script, clone(v5));
  assert.equal(result.ok, true);
  assert.equal(result.minimumLocalStorageVersion, "0.48.0");
});

test("rejects execution without planner receipt", () => {
  const candidate = clone(task);
  candidate.worker.plannerReceiptRequired = false;
  assert.throws(() => validateTask(candidate, script, clone(v5)), /Planner receipt/u);
});

test("rejects stale-state execution measurements being disabled", () => {
  for (const key of Object.keys(task.worker.plannerMeasurements)) {
    const candidate = clone(task);
    candidate.worker.plannerMeasurements[key] = false;
    assert.throws(() => validateTask(candidate, script, clone(v5)), /Planner measurement/u);
  }
});

test("rejects worker repository push and publication authority", () => {
  for (const key of ["repositoryPush", "publication", "forcePush"]) {
    const candidate = clone(task);
    candidate.authority[key] = true;
    assert.throws(() => validateTask(candidate, script, clone(v5)), new RegExp(key, "u"));
  }
});

test("rejects provider, promotion and runtime activation authority", () => {
  for (const key of ["candidatePromotion", "providerExecution", "cloudinaryUpload", "runtimeActivation"]) {
    const candidate = clone(task);
    candidate.authority[key] = true;
    assert.throws(() => validateTask(candidate, script, clone(v5)), new RegExp(key, "u"));
  }
});

test("rejects worker receipts being treated as publication evidence", () => {
  for (const key of ["workerReceiptIsPublicationEvidence", "plannerReceiptIsPublicationEvidence", "physicalAcceptanceReceiptIsPublicationEvidence"]) {
    const candidate = clone(task);
    candidate.publication[key] = true;
    assert.throws(() => validateTask(candidate, script, clone(v5)), new RegExp(key, "u"));
  }
});

test("rejects a weaker Local Storage floor or v5 mismatch", () => {
  const taskCandidate = clone(task);
  taskCandidate.minimumLocalStorageVersion = "0.47.9";
  assert.throws(() => validateTask(taskCandidate, script, clone(v5)), /0\.48\.0/u);
  const clientCandidate = clone(v5);
  clientCandidate.execution.plannerReceiptRequiredForUnmeasuredRepositoryTask = false;
  assert.throws(() => validateTask(clone(task), script, clientCandidate), /planner requirement/u);
});

test("rejects unsafe PowerShell primitives or Git mutation", () => {
  for (const injected of ["\nInvoke-Expression 'whoami'\n", "\ngit push origin main\n", "\nRemove-Item -Recurse .git\n"]) {
    assert.throws(() => validateTask(clone(task), script + injected, clone(v5)), /forbidden material/u);
  }
});

test("rejects missing strict native-exit handling", () => {
  const weakened = script.replaceAll("$global:LASTEXITCODE = 0", "$ignoredExitCode = 0");
  assert.throws(() => validateTask(clone(task), weakened, clone(v5)), /LASTEXITCODE/u);
});
