import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { compileRootValidationCoverage } from "./lib/root-validation-coverage.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

function looksLikeExecutableRegression(relativePath, source) {
  if (/\.(?:mjs|cjs|js)$/u.test(relativePath)) {
    return (
      /(?:from\s+|require\s*\()\s*["']node:test["']/u.test(source) ||
      /\b(?:test|describe|it)\s*\(/u.test(source)
    );
  }
  if (/\.py$/u.test(relativePath)) {
    return (
      /\bimport\s+unittest\b/u.test(source) ||
      /\bfrom\s+unittest\s+import\b/u.test(source) ||
      /\bimport\s+pytest\b/u.test(source) ||
      /\bdef\s+test_[A-Za-z0-9_]*\s*\(/u.test(source)
    );
  }
  return false;
}

test("executable regression modules cannot remain completely unreferenced", async () => {
  const report = await compileRootValidationCoverage(repositoryRoot);
  const latent = [];
  for (const entry of report.inventory.unreferencedValidationFiles) {
    if (entry.kind !== "test") continue;
    const source = await readFile(
      path.join(repositoryRoot, ...entry.path.split("/")),
      "utf8",
    );
    if (looksLikeExecutableRegression(entry.path, source)) {
      latent.push(entry.path);
    }
  }
  assert.deepEqual(
    latent,
    [],
    `executable regressions are not exposed by any root package script: ${latent.join(", ")}`,
  );
});
