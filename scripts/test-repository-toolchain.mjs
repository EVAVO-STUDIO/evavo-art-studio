#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const sourceRoot = process.cwd();
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "evavo-art-toolchain-"));
const fixtureRoot = path.join(temporaryRoot, "fixture");
const files = [
  ".github/workflows/ci.yml",
  ".nvmrc",
  "evavo.reliability.json",
  "package.json",
  "pnpm-workspace.yaml",
  "schemas/repository-owned-reliability-profile.schema.json",
  "scripts/check-repository-toolchain.mjs",
];

const reset = () => {
  rmSync(fixtureRoot, { recursive: true, force: true });
  mkdirSync(fixtureRoot, { recursive: true });
  for (const relativePath of files) {
    const target = path.join(fixtureRoot, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(sourceRoot, relativePath), target);
  }
};

const run = (additionalArguments = []) =>
  spawnSync(
    process.execPath,
    [
      "scripts/check-repository-toolchain.mjs",
      "--skip-runtime",
      ...additionalArguments,
    ],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
      timeout: 20_000,
      windowsHide: true,
    },
  );
const runInstalled = () => run(["--allow-generated-lockfile"]);

const mutateJson = (relativePath, operation) => {
  const absolutePath = path.join(fixtureRoot, relativePath);
  const value = JSON.parse(readFileSync(absolutePath, "utf8"));
  operation(value);
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const mutateText = (relativePath, operation) => {
  const absolutePath = path.join(fixtureRoot, relativePath);
  const value = readFileSync(absolutePath, "utf8");
  const next = operation(value);
  assert.notEqual(next, value, `mutation must change ${relativePath}`);
  writeFileSync(absolutePath, next, "utf8");
};

const replaceRequired = (value, from, to) => {
  assert.ok(value.includes(from), `fixture must contain ${from}`);
  return value.replace(from, to);
};

try {
  reset();
  assert.equal(run().status, 0, "exact pre-install fixture must pass");

  reset();
  writeFileSync(path.join(fixtureRoot, ".nvmrc"), "22.13.1\n", "utf8");
  assert.notEqual(run().status, 0, "Node.js drift must fail");

  reset();
  mutateJson("package.json", (value) => {
    value.packageManager = "pnpm@10.14.0";
  });
  assert.notEqual(run().status, 0, "pnpm manifest drift must fail");

  reset();
  mutateJson("evavo.reliability.json", (value) => {
    value.packageManager.lockfilePolicy = "committed-frozen";
    value.packageManager.lockfilePresent = true;
  });
  assert.notEqual(run().status, 0, "unreviewed lockfile-policy transition must fail");

  reset();
  writeFileSync(
    path.join(fixtureRoot, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n",
    "utf8",
  );
  assert.notEqual(run().status, 0, "generated lockfile must fail in pre-install mode");
  assert.equal(
    runInstalled().status,
    0,
    "generated untracked lockfile must pass only in installed-state mode",
  );

  mutateJson("evavo.reliability.json", (value) => {
    value.packageManager.lockfilePolicy = "committed-frozen";
    value.packageManager.lockfilePresent = true;
  });
  assert.notEqual(
    runInstalled().status,
    0,
    "installed-state mode must not approve a frozen-policy transition",
  );

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
      "actions/checkout@v6",
    ),
  );
  assert.notEqual(run().status, 0, "mutable action reference must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(value, "persist-credentials: false", "persist-credentials: true"),
  );
  assert.notEqual(run().status, 0, "persisted checkout credentials must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(value, 'node-version: "22.14.0"', 'node-version: "22"'),
  );
  assert.notEqual(run().status, 0, "floating workflow Node.js must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      "  push:\n    branches:\n      - main\n  workflow_dispatch:",
      "  workflow_dispatch:",
    ),
  );
  assert.notEqual(run().status, 0, "missing automatic main validation must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(value, "      - main\n", "      - main\n      - work/**\n"),
  );
  assert.notEqual(run().status, 0, "non-main push scope must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      "  workflow_dispatch:\n",
      "  pull_request:\n  workflow_dispatch:\n",
    ),
  );
  assert.notEqual(run().status, 0, "pull-request validation must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      "default: evavo-development-studio",
      "default: ungoverned-dispatcher",
    ),
  );
  assert.notEqual(run().status, 0, "manual dispatcher identity drift must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(value, "'github-main-push'", "'untrusted-main-push'"),
  );
  assert.notEqual(run().status, 0, "automatic dispatcher identity drift must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(value, "cancel-in-progress: true", "cancel-in-progress: false"),
  );
  assert.notEqual(run().status, 0, "superseded-run cancellation drift must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      '[[ "$(git rev-parse refs/remotes/origin/main)" == "${ART_STUDIO_EXPECTED_SHA}" ]]',
      'git merge-base --is-ancestor "${ART_STUDIO_EXPECTED_SHA}" origin/main',
    ),
  );
  assert.notEqual(run().status, 0, "initial current-main equality weakening must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      "git fetch --no-tags --prune origin +refs/heads/main:refs/remotes/origin/main",
      "git show-ref --verify --quiet refs/remotes/origin/main",
    ),
  );
  assert.notEqual(run().status, 0, "final current-main refresh removal must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(value, '"currentMainAtReceipt": true', '"currentMainAtReceipt": false'),
  );
  assert.notEqual(run().status, 0, "current-main receipt assertion drift must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
      "actions/upload-artifact@v4",
    ),
  );
  assert.notEqual(run().status, 0, "floating artifact action must fail");

  reset();
  mutateJson("evavo.reliability.json", (value) => {
    value.notes = value.notes.filter(
      (item) => !item.startsWith("Validation runs automatically on pushes to main"),
    );
  });
  assert.notEqual(run().status, 0, "automatic workflow policy note drift must fail");

  reset();
  mutateJson("evavo.reliability.json", (value) => {
    value.notes = value.notes.filter(
      (item) => !item.startsWith("Superseded mainline validations are cancelled"),
    );
  });
  assert.notEqual(run().status, 0, "current-main receipt policy note drift must fail");

  reset();
  mutateJson("evavo.reliability.json", (value) => {
    value.capabilityBoundary.validationDoesNotAuthorize =
      value.capabilityBoundary.validationDoesNotAuthorize.filter(
        (item) => item !== "live provider requests",
      );
  });
  assert.notEqual(run().status, 0, "capability-boundary drift must fail");

  console.log("Art Studio repository toolchain adversarial tests passed.");
  console.log(
    "- Node.js, pnpm, lockfile, exact-main triggers, current-main receipts and capability drift fail closed",
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
