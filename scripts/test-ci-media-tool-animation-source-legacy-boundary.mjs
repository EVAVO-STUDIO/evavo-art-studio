import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertAnimationSourceLegacyUsage,
  inspectAnimationSourceLegacyUsage,
} from "./lib/animation-source-legacy-boundary.mjs";

function git(root, ...args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function fixture() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-animation-legacy-boundary-"),
  );
  git(root, "init");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "user.name", "Fixture");
  return root;
}

async function tracked(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
  git(root, "add", "--", relativePath);
}

test("legacy JSON helpers remain compatible only inside non-production boundaries", async () => {
  const root = await fixture();
  try {
    await tracked(
      root,
      "scripts/lib/animation-source-bundle.mjs",
      "export async function readJson() {}\nexport async function writeJsonAtomic() {}\n",
    );
    await tracked(
      root,
      "scripts/test-ci-media-tool-animation-source-bundle.mjs",
      'import { readJson, writeJsonAtomic } from "./lib/animation-source-bundle.mjs";\n',
    );
    await tracked(
      root,
      "scripts/production-safe.mjs",
      'import { assertAnimationSourceBundle } from "./lib/animation-source-bundle.mjs";\n',
    );
    const report = await inspectAnimationSourceLegacyUsage(root);
    assert.equal(report.status, "passed");
    assert.deepEqual(report.violations, []);
    assert.equal(report.authority.githubActionsRequired, false);
    assert.equal(report.authority.vercelRequired, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("production named imports and re-exports of legacy helpers fail closed", async () => {
  const root = await fixture();
  try {
    await tracked(
      root,
      "scripts/unsafe-import.mjs",
      'import { readJson as unsafeRead } from "./lib/animation-source-bundle.mjs";\nvoid unsafeRead;\n',
    );
    await tracked(
      root,
      "packages/example/src/unsafe-export.ts",
      'export { writeJsonAtomic } from "../../../../scripts/lib/animation-source-bundle.mjs";\n',
    );
    const report = await inspectAnimationSourceLegacyUsage(root);
    assert.equal(report.status, "failed");
    assert.deepEqual(
      report.violations.map((entry) => entry.path),
      [
        "packages/example/src/unsafe-export.ts",
        "scripts/unsafe-import.mjs",
      ],
    );
    await assert.rejects(
      assertAnimationSourceLegacyUsage(root),
      /ANIMATION_SOURCE_LEGACY_PRODUCTION_USAGE_FORBIDDEN/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("namespace and dynamic legacy access cannot bypass the production scan", async () => {
  const root = await fixture();
  try {
    await tracked(
      root,
      "apps/api/src/namespace.ts",
      'import * as bundle from "../../../../scripts/lib/animation-source-bundle.mjs";\nvoid bundle.readJson;\n',
    );
    await tracked(
      root,
      "tools/dynamic.mjs",
      'const { writeJsonAtomic } = await import("../scripts/lib/animation-source-bundle.mjs");\nvoid writeJsonAtomic;\n',
    );
    const report = await inspectAnimationSourceLegacyUsage(root);
    assert.equal(report.status, "failed");
    assert.equal(report.violations.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("untracked files are outside repository authority and do not affect the report", async () => {
  const root = await fixture();
  try {
    await tracked(
      root,
      "scripts/safe.mjs",
      "export const safe = true;\n",
    );
    await writeFile(
      path.join(root, "unsafe-untracked.mjs"),
      'import { readJson } from "./scripts/lib/animation-source-bundle.mjs";\n',
      "utf8",
    );
    const report = await inspectAnimationSourceLegacyUsage(root);
    assert.equal(report.status, "passed");
    assert.equal(report.trackedFileCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tracked symbolic code files fail instead of being followed", async (t) => {
  if (process.platform === "win32") {
    t.skip("symbolic-link fixture is platform-restricted");
    return;
  }
  const root = await fixture();
  try {
    const outside = path.join(root, "outside.txt");
    await writeFile(outside, "export const outside = true;\n", "utf8");
    const target = path.join(root, "scripts", "linked.mjs");
    await mkdir(path.dirname(target), { recursive: true });
    await symlink(outside, target);
    git(root, "add", "--", "scripts/linked.mjs");
    await assert.rejects(
      inspectAnimationSourceLegacyUsage(root),
      /ANIMATION_SOURCE_LEGACY_FILE_INVALID/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
