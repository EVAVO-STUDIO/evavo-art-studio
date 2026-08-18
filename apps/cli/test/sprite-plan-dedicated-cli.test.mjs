import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, "../dist/sprite-plan-cli.js");

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
}

test("dedicated sprite-plan CLI exposes the governed protocol", () => {
  const result = run(["protocol"]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.protocolVersion, "2026-07-31.1");
  assert.ok(payload.roles.includes("playable-character"));
});

test("dedicated sprite-plan CLI fails closed when compile input is missing", () => {
  const result = run(["compile"]);
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stderr);
  assert.equal(payload.error.code, "EVAVO_ART_SPRITE_PLAN_CLI_ERROR");
  assert.match(payload.error.message, /--input is required/);
});
