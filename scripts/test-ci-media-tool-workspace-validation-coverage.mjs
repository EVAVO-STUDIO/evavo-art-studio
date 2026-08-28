import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertWorkspaceValidationCoverage,
  compileWorkspaceValidationCoverage,
  parseWorkspacePatterns,
} from "./lib/workspace-validation-coverage.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

test("workspace pattern parsing is deterministic and path safe", () => {
  assert.deepEqual(
    parseWorkspacePatterns("packages:\n  - 'packages/*'\n  - \"apps/*\"\n  - packages/*\n"),
    ["apps/*", "packages/*"],
  );
  assert.throws(
    () => parseWorkspacePatterns("packages:\n  - ../outside/*\n"),
    /WORKSPACE_VALIDATION_PATTERN_INVALID/u,
  );
});

test("a TypeScript workspace with tests requires real local lifecycles", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-workspace-coverage-"));
  try {
    await writeFile(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
    const workspace = path.join(root, "packages", "example");
    await mkdir(path.join(workspace, "src"), { recursive: true });
    await mkdir(path.join(workspace, "test"), { recursive: true });
    await writeFile(path.join(workspace, "src", "index.ts"), "export const value = 1;\n", "utf8");
    await writeFile(path.join(workspace, "test", "index.test.mjs"), "import test from 'node:test'; test('ok', () => {});\n", "utf8");
    await writeFile(path.join(workspace, "tsconfig.json"), "{}\n", "utf8");
    await writeFile(
      path.join(workspace, "package.json"),
      JSON.stringify({ name: "@fixture/example", scripts: { build: "echo TODO", test: "node --test" } }),
      "utf8",
    );
    const report = await compileWorkspaceValidationCoverage(root);
    assert.equal(report.status, "failed");
    assert.deepEqual(
      report.failures.map((entry) => [entry.lifecycle, entry.issue]),
      [["build", "placeholder"], ["typecheck", "missing"]],
    );
    await assert.rejects(
      assertWorkspaceValidationCoverage(root),
      /WORKSPACE_VALIDATION_COVERAGE_FAILED/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the actual Art Studio workspaces expose required local validation", async () => {
  const report = await assertWorkspaceValidationCoverage(repositoryRoot);
  assert.equal(report.status, "passed");
  assert.ok(report.workspaceCount > 0);
  assert.equal(report.failures.length, 0);
  assert.equal(report.authority.githubActionsRequired, false);
  assert.equal(report.authority.vercelRequired, false);
});
