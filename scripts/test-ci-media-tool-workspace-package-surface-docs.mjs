import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

async function read(relativePath) {
  return await readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("workspace package surface documentation matches executable policy", async () => {
  const [moduleSource, documentation] = await Promise.all([
    read("scripts/lib/workspace-package-surface.mjs"),
    read("docs/WORKSPACE_PACKAGE_SURFACES.md"),
  ]);
  for (const token of [
    "WORKSPACE_PACKAGE_SURFACE_SCHEMA",
    "WORKSPACE_PACKAGE_SURFACE_FAILED",
    "source-export",
    "dist-without-build",
    "types-target-not-declaration",
    "githubActionsRequired: false",
    "vercelRequired: false",
  ]) {
    assert.ok(moduleSource.includes(token), `missing module token ${token}`);
  }
  for (const token of [
    "Workspace Package Surfaces",
    "main",
    "module",
    "types",
    "exports",
    "./src",
    "./dist",
    "GitHub Actions",
    "Vercel",
    "governed Windows workstation",
  ]) {
    assert.ok(documentation.includes(token), `missing documentation token ${token}`);
  }
});
