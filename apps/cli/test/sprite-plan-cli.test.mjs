import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cwd = new URL("..", import.meta.url);
const example = new URL(
  "../../../examples/sprite-plan-isometric-playable-character.json",
  import.meta.url,
);

function run(args) {
  return spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

test("CLI exposes the complete sprite planning protocol", () => {
  const result = run(["sprite-plan-protocol"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.protocolVersion, "2026-07-31.1");
  assert.ok(body.roles.includes("playable-character"));
  assert.ok(body.directionRules.some((entry) => entry.includes("eight")));
  assert.ok(body.godotRules.some((entry) => entry.includes("SpriteFrames")));
});

test("CLI compiles complete isometric coverage into a control job", () => {
  const result = run([
    "sprite-plan-compile",
    "--input",
    decodeURIComponent(example.pathname),
  ]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.compiledPlan.directions.length, 8);
  assert.equal(
    body.compiledPlan.directions.every((entry) => entry.authored),
    true,
  );
  assert.ok(body.compiledPlan.clips.some((entry) => entry.id === "walk"));
  assert.ok(
    body.compiledPlan.clips.some((entry) => entry.id === "ship-rigging-swing"),
  );
  assert.ok(body.compiledPlan.totals.runtimeFrames > 500);
  assert.equal(body.compiledPlan.atlas.packing, "deterministic-maxrects-no-rotation");
  assert.ok(body.compiledPlan.godot.animations.length > 0);
  assert.equal(body.compiledJob.runtimeJob.kind, "art.sprite-plan.compile");
  assert.deepEqual(body.compiledJob.runtimeJob.requiredCapabilities, [
    "sprite.inventory.compile",
    "sprite.animation-matrix.compile",
    "sprite.sheet-plan.compile",
    "godot.spriteframes-plan",
    "evidence.bundle",
  ]);
});
