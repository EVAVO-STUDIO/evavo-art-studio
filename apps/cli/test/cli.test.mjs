import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("prints capability JSON", () => {
  const result = spawnSync(process.execPath, ["dist/index.js", "capabilities"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.capabilities.some((entry) => entry.id === "vision.alpha"));
});
