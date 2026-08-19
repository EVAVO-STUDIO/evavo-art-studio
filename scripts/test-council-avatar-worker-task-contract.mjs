import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const client = JSON.parse(read("config/automation-fabric-client-v5.json"));
const tasks = JSON.parse(read("evavo.tasks.json"));
const worker = read("scripts/Test-CouncilAvatarWorkerStack.ps1");

test("Council avatar worker is a named exact-state fabric task", () => {
  assert.equal(client.sourceContract.councilAvatarWorkerTaskName, "council-avatar-worker-stack");
  const task = tasks.tasks["council-avatar-worker-stack"];
  assert.ok(task);
  assert.equal(task.runtime, "powershell-script");
  assert.equal(task.entry, "scripts/Test-CouncilAvatarWorkerStack.ps1");
  assert.equal(task.network, "disabled");
  assert.equal(task.timeoutSeconds, 1800);
});

test("Council worker binds the six authoritative repository surfaces", () => {
  for (const token of [
    "evavo-art-studio",
    "evavo-avatar-runtime",
    "the-council",
    "evavo-development-studio",
    "evavo-local-storage",
    "next-website",
    "config\\council.example.json",
    "src\\council-avatar-production-status.js",
    "src\\features\\council\\avatarPresentation.ts",
  ]) {
    assert.ok(worker.includes(token), `missing worker repository/source token: ${token}`);
  }
});

test("Council worker pins the reviewed production-truth revisions", () => {
  for (const token of [
    "c312afa831ab240d3d8eb3c32f3c7413bd999b7b",
    "90068367db9144b909bc861f91887ea5f0010842",
    "f0183be83976b061027b307a2fb78ef4ed856821",
    "ee74a609a93e81b42c28a72122dc0f6b887cf328",
    "evavo.council-avatar-worker-stack-check.v1",
  ]) {
    assert.ok(worker.includes(token), `missing reviewed Council worker token: ${token}`);
  }
});

test("Council worker expects four unique characters and incomplete production media", () => {
  for (const token of [
    "@('architect','critic','researcher','open-reviewer')",
    "@('top-hat-man','council-critic','eva-female','council-open-reviewer')",
    "@('council-critic','council-open-reviewer')",
    "totalPlannedImagesPerCharacter = 749",
    "websiteMayClaimAllCouncilAvatarsProductionReady = $false",
    "productionPhase: \"pose-bank-incomplete\"",
    "productionPhase: \"dense-bootstrap-incomplete\"",
    "productionPhase: \"identity-master-required\"",
  ]) {
    assert.ok(worker.includes(token), `missing fail-closed Council production token: ${token}`);
  }
});

test("Council worker retains validation-only authority", () => {
  for (const token of [
    "workerExecutionOnly = $true",
    "sourceMutation = $false",
    "repositoryMutation = $false",
    "creativeApproval = $false",
    "commitAuthority = $false",
    "pushAuthority = $false",
    "publicationAuthority = $false",
    "providerPromotion = $false",
    "runtimeActivation = $false",
    "deployment = $false",
    "forcePush = $false",
  ]) {
    assert.ok(worker.includes(token), `worker authority widened or marker missing: ${token}`);
  }
});

test("Council worker reruns focused Art, Runtime and website source checks", () => {
  for (const token of [
    "scripts/test-project-art-council-avatar-production.mjs",
    "scripts/test-project-art-council-avatar-identity-bootstrap.mjs",
    "scripts/test-project-art-council-avatar-animation-suite.mjs",
    "tests/council-avatar-production-status.test.mjs",
    "tests/eva-dense-motion-admission.test.mjs",
    "scripts/check-top-hat-body-pose-bank.mjs",
    "scripts/check-private-client-hub-ui.mjs",
    "scripts/check-eva-avatar-quality-fallback.mjs",
  ]) {
    assert.ok(worker.includes(token), `focused cross-repository check missing: ${token}`);
  }
});
