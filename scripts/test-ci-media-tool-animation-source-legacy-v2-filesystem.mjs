import assert from "node:assert/strict";
import { link, mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { inspectAnimationSourceLegacyUsageV2 } from "./lib/animation-source-legacy-boundary-v2.mjs";
import {
  git,
  legacyFixture,
  removeFixture,
  track,
} from "./test-support/animation-source-legacy-v2-fixture.mjs";

test("legacy v2 ignores untracked files because they have no repository authority", async () => {
  const root = await legacyFixture();
  try {
    await track(root, "scripts/safe.mjs", "export const safe = true;\n");
    await writeFile(path.join(root, "unsafe-untracked.mjs"),
      'import { readJson } from "./scripts/lib/animation-source-bundle.mjs";\n', "utf8");
    const report = await inspectAnimationSourceLegacyUsageV2(root);
    assert.equal(report.status, "passed");
    assert.equal(report.trackedFileCount, 1);
  } finally {
    await removeFixture(root);
  }
});

test("legacy v2 rejects tracked symbolic and hard-linked code files", async (t) => {
  const root = await legacyFixture();
  try {
    if (process.platform !== "win32") {
      const outside = path.join(root, "outside.txt");
      await writeFile(outside, "export const outside = true;\n", "utf8");
      const linked = path.join(root, "scripts", "linked.mjs");
      await mkdir(path.dirname(linked), { recursive: true });
      await symlink(outside, linked);
      git(root, "add", "--", "scripts/linked.mjs");
      await assert.rejects(
        inspectAnimationSourceLegacyUsageV2(root),
        /ANIMATION_SOURCE_LEGACY_V2_FILE_INVALID/u,
      );
      git(root, "rm", "--cached", "scripts/linked.mjs");
      await import("node:fs/promises").then(({ rm }) => rm(linked));
    } else {
      t.diagnostic("symbolic-link fixture is platform restricted");
    }

    const original = path.join(root, "scripts", "original.mjs");
    const alias = path.join(root, "scripts", "alias.mjs");
    await mkdir(path.dirname(original), { recursive: true });
    await writeFile(original, "export const value = true;\n", "utf8");
    try {
      await link(original, alias);
      git(root, "add", "--", "scripts/original.mjs", "scripts/alias.mjs");
      await assert.rejects(
        inspectAnimationSourceLegacyUsageV2(root),
        /ANIMATION_SOURCE_LEGACY_V2_FILE_INVALID/u,
      );
    } catch (error) {
      if (error?.code !== "EPERM" && error?.code !== "EACCES") throw error;
      t.diagnostic("hard links unavailable in this environment");
    }
  } finally {
    await removeFixture(root);
  }
});

test("legacy v2 rejects portable case-colliding tracked paths deterministically", async (t) => {
  if (process.platform === "win32") {
    t.skip("case-colliding fixture cannot be represented on Windows");
    return;
  }
  const root = await legacyFixture();
  try {
    await track(root, "scripts/Thing.ts", "export const one = 1;\n");
    await track(root, "scripts/thing.ts", "export const two = 2;\n");
    await assert.rejects(
      inspectAnimationSourceLegacyUsageV2(root),
      /ANIMATION_SOURCE_LEGACY_V2_PORTABLE_PATH_COLLISION:scripts\/Thing\.ts:scripts\/thing\.ts/u,
    );
  } finally {
    await removeFixture(root);
  }
});
