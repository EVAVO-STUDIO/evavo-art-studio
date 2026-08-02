import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("sprite planning OpenAPI describes complete compile-only coverage", async () => {
  const source = await read("openapi.sprite-plan.yaml");
  for (const token of [
    "openapi: 3.1.0",
    "/v1/sprite-plan-protocol:",
    "/v1/sprite-plans/validate:",
    "/v1/sprite-plans/compile:",
    "playable-character",
    "particle-effect",
    "authored and safely",
    "art.sprite-plan.compile",
    "sprite.inventory.compile",
    "sprite.animation-matrix.compile",
    "sprite.sheet-plan.compile",
    "godot.spriteframes-plan",
    "deterministic-compile-only",
    "CompiledSpriteProductionPlan",
    "runtimeFrames",
    "estimatedAtlasPages",
  ]) {
    assert.ok(source.includes(token), `missing sprite planning OpenAPI invariant: ${token}`);
  }
  for (const forbidden of [
    "OPENAI_API_KEY",
    "EVAVO_ART_WRITE_TOKEN",
    "promoteSelectedCandidate",
    "updateReference(",
    "child_process",
    "shell: true",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `sprite planning OpenAPI contains execution shortcut: ${forbidden}`,
    );
  }
});
