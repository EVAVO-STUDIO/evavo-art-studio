import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL("../src/index.ts", import.meta.url);

test("MCP atlas delivery is explicit, root-scoped and non-executing", async () => {
  const source = await readFile(sourcePath, "utf8");
  for (const token of [
    '"build_sprite_atlas_package"',
    'process.env.EVAVO_ART_ALLOW_WRITES === "true"',
    '"ART_STUDIO_WRITES_DISABLED"',
    "assertPathWithinAllowedRoots",
    "buildSpriteAtlasPackage",
    "writeGodotSpriteFramesImporter",
    "executionAvailable: false",
    '"inspect_transparency_candidate"',
    "recoverBackgroundAlpha",
    "allowCheckerboardRecovery",
    "writesPerformed: false",
  ]) {
    assert.ok(source.includes(token), `missing ${token}`);
  }

  for (const forbidden of [
    "runGodotSpriteFramesImport",
    'from "node:child_process"',
    "spawn(",
    "exec(",
    "shell: true",
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `MCP atlas tool must not execute binaries: ${forbidden}`,
    );
  }
});
