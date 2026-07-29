import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cwd = new URL("..", import.meta.url);

test("prints sprite continuity and executable quality capabilities", () => {
  const result = spawnSync(process.execPath, ["dist/index.js", "capabilities"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  for (const id of ["sprite.plan", "vision.identity", "source.package", "quality.sprite-frame", "quality.sprite-sequence"]) {
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

test("runs deterministic sprite frame quality from the CLI", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-art-cli-quality-"));
  const imagePath = path.join(root, "frame.png");
  const expectationsPath = path.join(root, "expectations.json");
  await writeFile(
    imagePath,
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFklEQVR4nGNgoBo4YaPxHxkPhAKyAQDgPyKxKv0aXwAAAABJRU5ErkJggg==", "base64"),
  );
  await writeFile(
    expectationsPath,
    JSON.stringify({ frameId: "fixture", transparency: "alpha-required", expectedWidth: 8, expectedHeight: 8, safePadding: 1 }),
  );
  const result = spawnSync(
    process.execPath,
    ["dist/index.js", "quality-frame", "--input", imagePath, "--expectations", expectationsPath],
    { cwd, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.passed, true);
  assert.equal(report.source.hasAlpha, true);
});
