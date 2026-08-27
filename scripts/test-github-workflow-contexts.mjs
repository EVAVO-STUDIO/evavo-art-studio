import assert from "node:assert/strict";
import test from "node:test";

import { scanWorkflowContextErrors } from "./check-github-workflow-contexts.mjs";

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


test("core cloud mirrors are manual-only", () => {
  const file = ".github/workflows/ci.yml";
  assert.deepEqual(
    scanWorkflowContextErrors(`name: optional\non:\n  workflow_dispatch:\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n`, file),
    [],
  );
});

test("core cloud mirrors reject automatic triggers", () => {
  const errors = scanWorkflowContextErrors(
    `name: automatic\non:\n  push:\n  workflow_dispatch:\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo no\n`,
    ".github/workflows/game-art-workstations.yml",
  );
  assert.deepEqual(errors.map((entry) => entry.code), ["CORE_WORKFLOW_AUTOMATIC_TRIGGER_FORBIDDEN"]);
});

test("core cloud mirrors require an explicit manual dispatch", () => {
  const errors = scanWorkflowContextErrors(
    `name: missing\non:\n  push:\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo no\n`,
    ".github/workflows/council-avatar-production.yml",
  );
  assert.deepEqual(
    errors.map((entry) => entry.code),
    ["CORE_WORKFLOW_MANUAL_DISPATCH_REQUIRED", "CORE_WORKFLOW_AUTOMATIC_TRIGGER_FORBIDDEN"],
  );
});
