import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP compiles layered sprite-family verification without executing it", async () => {
  const family = await read("src/sprite-family-tools.ts");
  const selection = await read("src/selection-tools.ts");
  const index = await read("src/index.ts");
  const packageJson = JSON.parse(await read("package.json"));
  const tsconfig = JSON.parse(await read("tsconfig.json"));
  const combined = `${family}\n${selection}\n${index}`;
  for (const token of [
    "sprite_family_protocol",
    "validate_sprite_family_manifest",
    "compile_sprite_family_verification_job",
    'kind: "sprite.family.verify"',
    'queue: "selection"',
    '"sprite.family.verify"',
    '"media.layer-compose"',
    'executionMode: "durable-worker-only"',
    "registerSpriteFamilyTools(server)",
    "registerSelectionTools(server)",
  ]) {
    assert.ok(combined.includes(token), `missing sprite-family MCP invariant: ${token}`);
  }
  assert.equal(
    packageJson.dependencies["@evavo/art-sprite-family"],
    "workspace:*",
  );
  assert.ok(
    tsconfig.references.some(
      (entry) => entry.path === "../../packages/sprite-family",
    ),
  );
  for (const forbidden of [
    "verifySpriteFamily(",
    "LocalArtifactStore",
    "EVAVO_ART_WRITE_TOKEN",
    "OPENAI_API_KEY",
    "child_process",
    "eval(",
  ]) {
    assert.ok(
      !family.includes(forbidden),
      `sprite-family MCP contains execution shortcut: ${forbidden}`,
    );
  }
});
