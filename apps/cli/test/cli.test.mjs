import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cwd = new URL("..", import.meta.url);

test("prints sprite continuity capabilities", () => {
  const result = spawnSync(process.execPath, ["dist/index.js", "capabilities"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  for (const id of ["sprite.plan", "vision.identity", "source.package"]) {
    assert.ok(parsed.capabilities.some((entry) => entry.id === id), `missing ${id}`);
  }
});

test("compiles the example into continuity blueprints", () => {
  const input = new URL("../../../examples/game-art-brief.json", import.meta.url);
  const result = spawnSync(process.execPath, ["dist/index.js", "plan", "--input", input.pathname], { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.spriteBlueprints.length, 9);
  assert.ok(plan.spriteBlueprints.every((entry) => entry.frames.length > 0));
  assert.ok(plan.workItems.some((entry) => entry.stage === "identity-master"));
  assert.ok(plan.deliverables.some((entry) => entry.format === "aseprite"));
});
