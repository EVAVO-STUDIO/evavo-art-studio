import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  checkHostedAutomationPolicy,
  scanWorkflowContextErrors,
} from "./check-github-workflow-contexts.mjs";

function policyFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-hosted-policy-"));
  fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
  fs.mkdirSync(path.join(root, "ops", "github-actions-reference", "workflows"), { recursive: true });
  fs.writeFileSync(path.join(root, ".github", "workflows", "README.md"), "inactive\n");
  fs.writeFileSync(path.join(root, "ops", "github-actions-reference", "README.md"), "archive\n");
  fs.writeFileSync(
    path.join(root, "ops", "github-actions-reference", "workflows", "legacy.yml"),
    "name: legacy\non: push\njobs: {}\n",
  );
  return root;
}

test("rejects runner context in job-level env", () => {
  const errors = scanWorkflowContextErrors(`name: invalid\non: push\njobs:\n  contract:\n    runs-on: ubuntu-latest\n    env:\n      CACHE: \${{ runner.temp }}/cache\n    steps:\n      - run: echo ok\n`);
  assert.deepEqual(errors.map((entry) => entry.code), ["WORKFLOW_JOB_ENV_RUNNER_CONTEXT"]);
});

test("allows runner context after the job reaches a step", () => {
  const errors = scanWorkflowContextErrors(`name: valid\non: push\njobs:\n  contract:\n    runs-on: ubuntu-latest\n    steps:\n      - name: cache\n        env:\n          CACHE: \${{ runner.temp }}/cache\n        run: echo ok\n      - uses: actions/upload-artifact@v4\n        with:\n          path: \${{ runner.temp }}/output\n`);
  assert.deepEqual(errors, []);
});

test("rejects runner context in workflow-level env and pre-routing job keys", () => {
  const errors = scanWorkflowContextErrors(`name: invalid\nenv:\n  CACHE: \${{ runner.temp }}/cache\non: push\njobs:\n  contract:\n    if: \${{ runner.os == 'Linux' }}\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo no\n`);
  assert.deepEqual(
    errors.map((entry) => entry.code),
    ["WORKFLOW_ROOT_ENV_RUNNER_CONTEXT", "WORKFLOW_JOB_ROUTING_RUNNER_CONTEXT"],
  );
});

test("zero-cost policy permits only an inactive README under .github/workflows", () => {
  const root = policyFixture();
  try {
    const report = checkHostedAutomationPolicy({ repositoryRoot: root });
    assert.equal(report.passed, true);
    assert.equal(report.activeWorkflowFiles.length, 0);
    assert.equal(report.archivedWorkflowCount, 1);
    assert.equal(report.githubActionsRequired, false);
    assert.equal(report.vercelRequired, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("zero-cost policy rejects any active workflow YAML", () => {
  const root = policyFixture();
  try {
    fs.writeFileSync(path.join(root, ".github", "workflows", "active.yml"), "name: active\non: push\n");
    const report = checkHostedAutomationPolicy({ repositoryRoot: root });
    assert.equal(report.passed, false);
    assert.ok(report.errors.some((entry) => entry.code === "HOSTED_AUTOMATION_ACTIVE_WORKFLOW_FORBIDDEN"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("zero-cost policy requires the inactive reference archive", () => {
  const root = policyFixture();
  try {
    fs.rmSync(path.join(root, "ops", "github-actions-reference", "workflows"), { recursive: true, force: true });
    const report = checkHostedAutomationPolicy({ repositoryRoot: root });
    assert.equal(report.passed, false);
    assert.ok(report.errors.some((entry) => entry.code === "HOSTED_AUTOMATION_ARCHIVE_REQUIRED"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("zero-cost policy rejects symlinks in active or archived policy roots", (context) => {
  const root = policyFixture();
  try {
    const target = path.join(root, "target.yml");
    fs.writeFileSync(target, "name: target\n");
    const link = path.join(root, "ops", "github-actions-reference", "workflows", "linked.yml");
    try {
      fs.symlinkSync(target, link);
    } catch (error) {
      context.skip(`symlinks unavailable: ${error.message}`);
      return;
    }
    const report = checkHostedAutomationPolicy({ repositoryRoot: root });
    assert.equal(report.passed, false);
    assert.ok(report.errors.some((entry) => entry.code === "HOSTED_AUTOMATION_SYMLINK_FORBIDDEN"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
