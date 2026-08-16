#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const sourceRoot = process.cwd();
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "evavo-art-toolchain-"));
const fixtureRoot = path.join(temporaryRoot, "fixture");

const discoverWorkspaceManifests = () => {
  const result = [];
  for (const workspaceRoot of ["apps", "packages"]) {
    const absoluteRoot = path.join(sourceRoot, workspaceRoot);
    if (!existsSync(absoluteRoot)) continue;
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      const relativePath = `${workspaceRoot}/${entry.name}/package.json`;
      if (entry.isDirectory() && existsSync(path.join(sourceRoot, relativePath))) {
        result.push(relativePath);
      }
    }
  }
  return result.sort();
};

const discoverWorkflows = () =>
  readdirSync(path.join(sourceRoot, ".github/workflows"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => `.github/workflows/${entry.name}`)
    .sort();

const files = [
  ".nvmrc",
  "README.md",
  "evavo.reliability.json",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "requirements-image-pipeline.txt",
  "schemas/repository-owned-reliability-profile.schema.json",
  "scripts/check-repository-toolchain.mjs",
  ...discoverWorkflows(),
  ...discoverWorkspaceManifests(),
];

const git = (arguments_, expectedStatus = 0) => {
  const result = spawnSync("git", arguments_, {
    cwd: fixtureRoot,
    encoding: "utf8",
    timeout: 20_000,
    windowsHide: true,
  });
  assert.equal(
    result.status,
    expectedStatus,
    `git ${arguments_.join(" ")} failed:\n${result.stdout}\n${result.stderr}`,
  );
  return result;
};

const reset = () => {
  rmSync(fixtureRoot, { recursive: true, force: true });
  mkdirSync(fixtureRoot, { recursive: true });
  for (const relativePath of files) {
    const target = path.join(fixtureRoot, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(sourceRoot, relativePath), target);
  }
  git(["init", "-q"]);
  git(["add", "--all"]);
};

const run = (additionalArguments = []) =>
  spawnSync(
    process.execPath,
    ["scripts/check-repository-toolchain.mjs", "--skip-runtime", ...additionalArguments],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
    },
  );

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

const expectFailure = (result, label) => {
  assert.notEqual(result.status, 0, label);
};

try {
  reset();
  assert.equal(run().status, 0, "exact committed-lock fixture must pass");

  reset();
  writeFileSync(path.join(fixtureRoot, ".nvmrc"), "22.13.1\n", "utf8");
  expectFailure(run(), "Node.js drift must fail");

  reset();
  mutateText("requirements-image-pipeline.txt", (value) =>
    replaceRequired(value, "Pillow==12.2.0", "Pillow>=11,<13"),
  );
  expectFailure(run(), "floating Pillow range must fail");

  reset();
  mutateJson("package.json", (value) => {
    value.packageManager = "pnpm@10.14.0";
  });
  expectFailure(run(), "pnpm manifest drift must fail");

  reset();
  unlinkSync(path.join(fixtureRoot, "pnpm-lock.yaml"));
  expectFailure(run(), "missing committed lockfile must fail");

  reset();
  git(["rm", "--cached", "-q", "--", "pnpm-lock.yaml"]);
  expectFailure(run(), "untracked lockfile must fail");

  reset();
  mutateText("pnpm-lock.yaml", (value) =>
    replaceRequired(value, "lockfileVersion: '9.0'", "lockfileVersion: '8.0'"),
  );
  expectFailure(run(), "lockfile-version drift must fail");

  reset();
  mutateText("pnpm-lock.yaml", (value) => {
    const candidate = ["  apps/api:", "  'apps/api':", '  "apps/api":'].find((line) =>
      value.includes(`${line}\n`),
    );
    assert.ok(candidate, "lockfile fixture must contain the apps/api importer");
    return value.replace(`${candidate}\n`, `${candidate.replace("apps/api", "apps/api-missing")}\n`);
  });
  expectFailure(run(), "workspace importer drift must fail");

  reset();
  mutateText("pnpm-lock.yaml", (value) => `${value}# file:../outside-repository\n`);
  expectFailure(run(), "cross-repository file dependency material must fail");

  reset();
  mutateText("pnpm-lock.yaml", (value) => `${value}# npmAuthToken: \${NPM_TOKEN}\n`);
  expectFailure(run(), "registry credential or environment material must fail");

  reset();
  mutateJson("evavo.reliability.json", (value) => {
    value.packageManager.lockfilePolicy = "review-first";
    value.packageManager.lockfilePresent = false;
    value.packageManager.install = "pnpm install --no-frozen-lockfile";
  });
  expectFailure(run(), "review-first policy regression must fail");

  reset();
  mutateJson("evavo.reliability.json", (value) => {
    value.dependencyLock.committed = false;
  });
  expectFailure(run(), "committed-lock authority drift must fail");

  reset();
  mutateJson("evavo.reliability.json", (value) => {
    value.imageToolchain.python = "3.13";
  });
  expectFailure(run(), "exact Python image runtime drift must fail");

  reset();
  mutateJson("package.json", (value) => {
    value.devDependencies.typescript = "latest";
  });
  expectFailure(run(), "floating latest dependency must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(value, "pnpm install --frozen-lockfile", "pnpm install --no-frozen-lockfile"),
  );
  expectFailure(run(), "non-frozen mainline install must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      "          git diff --exit-code -- pnpm-lock.yaml\n",
      "          rm -f pnpm-lock.yaml\n          git diff --exit-code -- pnpm-lock.yaml\n",
    ),
  );
  expectFailure(run(), "lockfile deletion must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      '"installedWithoutCommittedLockfile": false',
      '"installedWithoutCommittedLockfile": true',
    ),
  );
  expectFailure(run(), "mainline receipt lock authority drift must fail");

  const secondaryWorkflow = discoverWorkflows().find((relativePath) => {
    if (relativePath === ".github/workflows/ci.yml") return false;
    return readFileSync(path.join(sourceRoot, relativePath), "utf8").includes(
      "pnpm install --frozen-lockfile",
    );
  });
  assert.ok(secondaryWorkflow, "fixture must contain a secondary frozen-install workflow");
  reset();
  mutateText(secondaryWorkflow, (value) =>
    replaceRequired(value, "pnpm install --frozen-lockfile", "pnpm install"),
  );
  expectFailure(run(), "non-frozen secondary workflow install must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
      "actions/checkout@v6",
    ),
  );
  expectFailure(run(), "mutable action reference must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      "actions/setup-python@a309ff8b426b58ec0e2a45f0f869d46889d02405",
      "actions/setup-python@v6",
    ),
  );
  expectFailure(run(), "mutable Python action reference must fail");

  reset();
  mutateText(".github/workflows/repository-toolchain-authority.yml", (value) =>
    replaceRequired(
      value,
      "actions/setup-node@6044e13b5dc448c55e2357c09f80417699197238",
      "actions/setup-node@v6",
    ),
  );
  expectFailure(run(), "mutable repository-toolchain action reference must fail");

  reset();
  mutateText(".github/workflows/repository-toolchain-authority.yml", (value) =>
    replaceRequired(
      value,
      "      - name: Run adversarial toolchain fixtures\n        run: node scripts/test-repository-toolchain.mjs\n",
      "",
    ),
  );
  expectFailure(run(), "repository-toolchain adversarial gate removal must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(value, "persist-credentials: false", "persist-credentials: true"),
  );
  expectFailure(run(), "persisted checkout credentials must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(value, 'node-version: "22.14.0"', 'node-version: "22"'),
  );
  expectFailure(run(), "floating workflow Node.js must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(value, 'python-version: "3.13.5"', 'python-version: "3.13"'),
  );
  expectFailure(run(), "floating workflow Python must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      "      - name: Verify Brass exact-byte evidence and create-only publication\n        run: python tools/verify_brass_creative_evaluation.py\n",
      "",
    ),
  );
  expectFailure(run(), "Brass exact-byte adversarial verification removal must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      "  push:\n    branches:\n      - main\n  workflow_dispatch:",
      "  workflow_dispatch:",
    ),
  );
  expectFailure(run(), "missing automatic main validation must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(value, "      - main\n", "      - main\n      - work/**\n"),
  );
  expectFailure(run(), "non-main push scope must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      "  workflow_dispatch:\n",
      "  pull_request:\n  workflow_dispatch:\n",
    ),
  );
  expectFailure(run(), "pull-request validation must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      "default: evavo-development-studio",
      "default: ungoverned-dispatcher",
    ),
  );
  expectFailure(run(), "manual dispatcher identity drift must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(value, "'github-main-push'", "'untrusted-main-push'"),
  );
  expectFailure(run(), "automatic dispatcher identity drift must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(value, "cancel-in-progress: true", "cancel-in-progress: false"),
  );
  expectFailure(run(), "superseded-run cancellation drift must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      '[[ "$(git rev-parse refs/remotes/origin/main)" == "${ART_STUDIO_EXPECTED_SHA}" ]]',
      'git merge-base --is-ancestor "${ART_STUDIO_EXPECTED_SHA}" origin/main',
    ),
  );
  expectFailure(run(), "initial current-main equality weakening must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      "git fetch --no-tags --prune origin +refs/heads/main:refs/remotes/origin/main",
      "git show-ref --verify --quiet refs/remotes/origin/main",
    ),
  );
  expectFailure(run(), "final current-main refresh removal must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(value, '"currentMainAtReceipt": true', '"currentMainAtReceipt": false'),
  );
  expectFailure(run(), "current-main receipt assertion drift must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      '"decodedPixelsFromRetainedSourceBytes": true',
      '"decodedPixelsFromRetainedSourceBytes": false',
    ),
  );
  expectFailure(run(), "Brass exact-byte receipt assertion drift must fail");

  reset();
  mutateText(".github/workflows/ci.yml", (value) =>
    replaceRequired(
      value,
      "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
      "actions/upload-artifact@v7",
    ),
  );
  expectFailure(run(), "floating artifact action must fail");

  reset();
  mutateJson("evavo.reliability.json", (value) => {
    value.notes = value.notes.filter(
      (item) => !item.startsWith("The canonical pnpm lockfile is committed source"),
    );
  });
  expectFailure(run(), "frozen-lock policy note drift must fail");

  reset();
  mutateJson("evavo.reliability.json", (value) => {
    value.notes = value.notes.filter(
      (item) => !item.startsWith("Superseded mainline validations are cancelled"),
    );
  });
  expectFailure(run(), "current-main receipt policy note drift must fail");

  reset();
  mutateJson("evavo.reliability.json", (value) => {
    value.capabilityBoundary.validationDoesNotAuthorize =
      value.capabilityBoundary.validationDoesNotAuthorize.filter(
        (item) => item !== "live provider requests",
      );
  });
  expectFailure(run(), "capability-boundary drift must fail");

  reset();
  expectFailure(
    run(["--allow-generated-lockfile"]),
    "obsolete generated-lockfile bypass flag must fail",
  );

  console.log("Art Studio repository toolchain adversarial tests passed.");
  console.log(
    "- committed lock identity, exact workspace importers, frozen installs, exact Python/Pillow evidence, exact-main receipts and capability drift fail closed",
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
