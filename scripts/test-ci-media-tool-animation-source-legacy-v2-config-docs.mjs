import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

async function read(relativePath) {
  return await readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("legacy alias governance documents the executable local boundary", async () => {
  const [moduleSource, documentation] = await Promise.all([
    read("scripts/lib/animation-source-legacy-config-v2.mjs"),
    read("docs/ANIMATION_SOURCE_LEGACY_ALIAS_GOVERNANCE.md"),
  ]);

  for (const token of [
    "ANIMATION_SOURCE_LEGACY_CONFIG_ALIAS_FORBIDDEN",
    "compilerOptions.paths",
    "packageEntries",
    "importMapEntries",
    "targetCanReachCanonical",
    "githubActionsRequired: false",
    "vercelRequired: false",
  ]) {
    assert.ok(moduleSource.includes(token), `missing module token ${token}`);
  }

  for (const token of [
    "Animation Source Legacy Alias Governance",
    "package `imports`",
    "package `exports`",
    "compilerOptions.paths",
    "directory-prefix mapping",
    "scripts/animation-source-bundle.mjs",
    "GitHub Actions",
    "Vercel",
    "pnpm check",
  ]) {
    assert.ok(documentation.includes(token), `missing documentation token ${token}`);
  }

  for (const forbidden of [
    "git push",
    "git commit",
    "shell: true",
    "process.env.GITHUB_TOKEN",
    "process.env.VERCEL_TOKEN",
    "--force-with-lease",
  ]) {
    assert.ok(!moduleSource.includes(forbidden), `forbidden module token ${forbidden}`);
  }
});
