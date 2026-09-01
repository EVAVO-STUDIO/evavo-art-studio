import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

async function read(relativePath) {
  return await readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("root validation coverage documentation matches the executable policy", async () => {
  const [moduleSource, documentation] = await Promise.all([
    read("scripts/lib/root-validation-coverage.mjs"),
    read("docs/ROOT_VALIDATION_COVERAGE.md"),
  ]);
  for (const token of [
    "ROOT_VALIDATION_COVERAGE_SCHEMA",
    "ROOT_VALIDATION_COVERAGE_FAILED",
    "outsideRootChecks",
    "unreferencedMediaRegressions",
    "githubActionsRequired: false",
    "vercelRequired: false",
  ]) {
    assert.ok(moduleSource.includes(token), `missing module token ${token}`);
  }
  for (const token of [
    "Root Validation Coverage",
    "pnpm check",
    "reachable",
    "subsumed",
    "script-only",
    "unreferenced",
    "GitHub Actions",
    "Vercel",
    "governed Windows workstation",
  ]) {
    assert.ok(documentation.includes(token), `missing documentation token ${token}`);
  }
});
