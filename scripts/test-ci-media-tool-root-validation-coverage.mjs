import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertRootValidationCoverage,
  compileRootValidationCoverage,
  referencedRootScript,
  splitCommandChain,
} from "./lib/root-validation-coverage.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

test("command-chain parsing preserves quoted separators", () => {
  assert.deepEqual(
    splitCommandChain('node one.mjs && node -e "console.log(\'a && b\')"; pnpm run final:check'),
    [
      "node one.mjs",
      'node -e "console.log(\'a && b\')"',
      "pnpm run final:check",
    ],
  );
});

test("root-script references ignore workspace-filter commands", () => {
  const scripts = {
    check: "pnpm run local:check",
    "local:check": "node scripts/check-local.mjs",
    test: "pnpm -r --if-present run test",
  };
  assert.equal(referencedRootScript("pnpm run local:check", scripts), "local:check");
  assert.equal(referencedRootScript("pnpm test", scripts), "test");
  assert.equal(
    referencedRootScript("pnpm --filter @evavo/art-media run test", scripts),
    undefined,
  );
});

test("the complete local check covers every root check and media regression", async () => {
  const report = await assertRootValidationCoverage(repositoryRoot);
  assert.equal(report.status, "passed");
  assert.ok(report.reachableScripts.includes("ci:media-tools:test"));
  assert.equal(report.failures.outsideRootChecks.length, 0);
  assert.equal(report.failures.unreferencedMediaRegressions.length, 0);
  assert.equal(report.authority.githubActionsRequired, false);
  assert.equal(report.authority.vercelRequired, false);
});

test("coverage inventory remains transparent without treating every utility as a gate", async () => {
  const report = await compileRootValidationCoverage(repositoryRoot);
  assert.ok(report.validationFileCount > 0);
  assert.ok(Array.isArray(report.inventory.scriptOnlyValidationFiles));
  assert.ok(Array.isArray(report.inventory.unreferencedValidationFiles));
  for (const entry of report.regressionFiles) {
    assert.match(entry.path, /^scripts\//u);
    assert.ok(["check", "test"].includes(entry.kind));
    assert.ok(["root-check", "script-only", "unreferenced"].includes(entry.status));
  }
});

test("validation coverage implementation stays local-only", async () => {
  const source = await readFile(
    path.join(repositoryRoot, "scripts/lib/root-validation-coverage.mjs"),
    "utf8",
  );
  for (const forbidden of [
    "git push",
    "git commit",
    "shell: true",
    "workflow_dispatch",
    "process.env.GITHUB_TOKEN",
    "process.env.VERCEL_TOKEN",
    "--force-with-lease",
  ]) {
    assert.ok(!source.includes(forbidden), forbidden);
  }
});
