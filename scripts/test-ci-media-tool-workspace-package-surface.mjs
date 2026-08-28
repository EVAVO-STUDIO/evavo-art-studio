import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertWorkspacePackageSurface,
  compileWorkspacePackageSurface,
} from "./lib/workspace-package-surface.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

test("package surfaces reject source, traversal, malformed type and unbuilt dist targets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-package-surface-"));
  try {
    await writeFile(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
    const workspace = path.join(root, "packages", "example");
    await mkdir(workspace, { recursive: true });
    await writeFile(
      path.join(workspace, "package.json"),
      JSON.stringify({
        name: "@fixture/example",
        main: "./dist/index.js",
        types: "./dist/index.ts",
        exports: {
          ".": "./src/index.ts",
          "./escape": "../outside.js",
        },
      }),
      "utf8",
    );
    const report = await compileWorkspacePackageSurface(root);
    assert.equal(report.status, "failed");
    assert.deepEqual(
      report.failures.map((entry) => entry.issue).sort(),
      [
        "dist-without-build",
        "non-portable-target",
        "source-export",
        "types-target-not-declaration",
      ],
    );
    await assert.rejects(
      assertWorkspacePackageSurface(root),
      /WORKSPACE_PACKAGE_SURFACE_FAILED/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the actual Art Studio package surfaces remain portable and locally buildable", async () => {
  const report = await assertWorkspacePackageSurface(repositoryRoot);
  assert.equal(report.status, "passed");
  assert.ok(report.packageCount > 0);
  assert.equal(report.failures.length, 0);
  assert.equal(report.authority.githubActionsRequired, false);
  assert.equal(report.authority.vercelRequired, false);
});
