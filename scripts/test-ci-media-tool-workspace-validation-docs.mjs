import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

async function read(relativePath) {
  return await readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("workspace validation documentation matches the executable local contract", async () => {
  const [moduleSource, documentation] = await Promise.all([
    read("scripts/lib/workspace-validation-coverage.mjs"),
    read("docs/WORKSPACE_VALIDATION_COVERAGE.md"),
  ]);
  for (const token of [
    "WORKSPACE_VALIDATION_COVERAGE_SCHEMA",
    "WORKSPACE_VALIDATION_COVERAGE_FAILED",
    "WORKSPACE_VALIDATION_PATTERN_INVALID",
    "githubActionsRequired: false",
    "vercelRequired: false",
  ]) {
    assert.ok(moduleSource.includes(token), `missing module token ${token}`);
  }
  for (const token of [
    "Workspace Validation Coverage",
    "pnpm-workspace.yaml",
    "build",
    "typecheck",
    "test",
    "--if-present",
    "GitHub Actions",
    "Vercel",
    "governed Windows workstation",
  ]) {
    assert.ok(documentation.includes(token), `missing documentation token ${token}`);
  }
});
