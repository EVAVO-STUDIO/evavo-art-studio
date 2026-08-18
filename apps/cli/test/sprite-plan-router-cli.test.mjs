import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cwd = new URL("..", import.meta.url);
const example = new URL(
  "../../../examples/sprite-plan-isometric-playable-character.json",
  import.meta.url,
);

function run(args) {
  return spawnSync(process.execPath, ["dist/router-cli.js", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

test("general CLI router exposes sprite-plan protocol", () => {
  const result = run(["sprite-plan-protocol"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.protocolVersion, "2026-07-31.1");
  assert.ok(body.roles.includes("playable-character"));
});

test("general CLI router compiles sprite plans through the dedicated surface", () => {
  const result = run([
    "sprite-plan-compile",
    "--input",
    decodeURIComponent(example.pathname),
  ]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.compiledPlan.schemaVersion, "1.0");
  assert.equal(body.compiledJob.executionMode, "deterministic-compile-only");
  assert.equal(body.compiledJob.runtimeJob.kind, "art.sprite-plan.compile");
});
