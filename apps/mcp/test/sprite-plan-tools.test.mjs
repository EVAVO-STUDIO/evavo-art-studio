import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP exposes complete sprite planning without execution authority", async () => {
  const [tools, artDirection, packageJsonSource, tsconfigSource] = await Promise.all([
    read("src/sprite-plan-tools.ts"),
    read("src/art-direction-tools.ts"),
    read("package.json"),
    read("tsconfig.json"),
  ]);
  const packageJson = JSON.parse(packageJsonSource);
  const tsconfig = JSON.parse(tsconfigSource);
  const combined = `${tools}\n${artDirection}`;

  for (const token of [
    "sprite_plan_protocol",
    "validate_complete_sprite_plan",
    "compile_complete_sprite_plan",
    "spritePlannerProtocolSummary()",
    "validateSpritePlanCompileRequest(request)",
    "compileSpriteProductionPlan(request)",
    "compileSpritePlanJob(request)",
    "registerSpritePlanTools(server)",
    "art.sprite-plan.compile",
  ]) {
    assert.ok(combined.includes(token), `missing sprite planner MCP invariant: ${token}`);
  }

  assert.equal(
    packageJson.dependencies["@evavo/art-sprite-planner"],
    "workspace:*",
  );
  assert.ok(
    tsconfig.references.some((entry) => entry.path === "../../packages/sprite-planner"),
  );

  for (const forbidden of [
    "LocalArtifactStore",
    "OPENAI_API_KEY",
    "EVAVO_ART_WRITE_TOKEN",
    "promoteSelectedCandidate",
    "updateReference(",
    "child_process",
    "shell: true",
  ]) {
    assert.ok(
      !tools.includes(forbidden),
      `sprite planner MCP contains execution shortcut: ${forbidden}`,
    );
  }
});
