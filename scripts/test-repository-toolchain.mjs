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
  writeFileSync(absolutePath, operation(value), "utf8");
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
    value.replace(
      "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
      "actions/checkout@v6",
    ),
  );
  assert.notEqual(run().status, 0, "mutable action reference must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    value.replace("persist-credentials: false", "persist-credentials: true"),
  );
  assert.notEqual(run().status, 0, "persisted checkout credentials must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    value.replace('node-version: "22.14.0"', 'node-version: "22"'),
  );
  assert.notEqual(run().status, 0, "floating workflow Node.js must fail");

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
    "- Node.js, pnpm, lockfile mode, workflow and capability drift fail closed",
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
