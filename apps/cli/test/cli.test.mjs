import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cwd = new URL("..", import.meta.url);
const transparentFixture =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFklEQVR4nGNgoBo4YaPxHxkPhAKyAQDgPyKxKv0aXwAAAABJRU5ErkJggg==";

test("prints sprite continuity, quality and delivery capabilities", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/index.js", "capabilities"],
    { cwd, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  for (const id of [
    "sprite.plan",
    "vision.identity",
    "source.package",
    "quality.sprite-frame",
    "quality.sprite-sequence",
    "media.atlas-build",
    "godot.spriteframes-build",
  ]) {
    assert.ok(
      parsed.capabilities.some((entry) => entry.id === id),
      `missing ${id}`,
    );
  }
});

test("compiles the example into continuity blueprints", () => {
  const input = new URL("../../../examples/game-art-brief.json", import.meta.url);
  const result = spawnSync(
    process.execPath,
    ["dist/index.js", "plan", "--input", input.pathname],
    { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.spriteBlueprints.length, 9);
  assert.ok(plan.spriteBlueprints.every((entry) => entry.frames.length > 0));
  assert.ok(
    plan.workItems.some((entry) => entry.stage === "identity-master"),
  );
  assert.ok(plan.deliverables.some((entry) => entry.format === "aseprite"));
});

test("runs deterministic sprite frame quality from the CLI", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-art-cli-quality-"));
  const imagePath = path.join(root, "frame.png");
  const expectationsPath = path.join(root, "expectations.json");
  await writeFile(imagePath, Buffer.from(transparentFixture, "base64"));
  await writeFile(
    expectationsPath,
    JSON.stringify({
      frameId: "fixture",
      transparency: "alpha-required",
      expectedWidth: 8,
      expectedHeight: 8,
      safePadding: 1,
    }),
  );
  const result = spawnSync(
    process.execPath,
    [
      "dist/index.js",
      "quality-frame",
      "--input",
      imagePath,
      "--expectations",
      expectationsPath,
    ],
    { cwd, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.passed, true);
  assert.equal(report.source.hasAlpha, true);
});

test("builds an atlas and a Godot importer without executing Godot", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "evavo-art-cli-atlas-"));
  const source = path.join(project, "art", "source");
  const output = path.join(project, "art", "generated");
  await mkdir(source, { recursive: true });
  await writeFile(
    path.join(project, "project.godot"),
    '[application]\nconfig/name="CLI Atlas"\n',
  );
  await writeFile(
    path.join(source, "frame.png"),
    Buffer.from(transparentFixture, "base64"),
  );
  const manifestPath = path.join(project, "art", "hero.atlas.json");
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1.0",
      atlasId: "hero",
      frames: [
        {
          id: "idle-001",
          path: "source/frame.png",
          pivot: { x: 4, y: 7 },
        },
      ],
      animations: [
        {
          name: "idle",
          loopMode: "ping-pong",
          frames: [
            { frameId: "idle-001", durationMs: 125 },
            { frameId: "idle-001", durationMs: 250 },
          ],
        },
      ],
      settings: {
        maximumWidth: 64,
        maximumHeight: 64,
        padding: 1,
        extrusion: 1,
        powerOfTwo: "required",
      },
    }),
  );

  const result = spawnSync(
    process.execPath,
    [
      "dist/index.js",
      "atlas-build",
      "--manifest",
      manifestPath,
      "--output-dir",
      output,
      "--godot-project",
      project,
    ],
    { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.atlasId, "hero");
  assert.equal(payload.atlas.frames, 1);
  assert.equal(payload.atlas.animations, 1);
  assert.ok(payload.atlas.imageSha256.length === 64);
  assert.ok(payload.atlas.dataSha256.length === 64);
  assert.equal(payload.execution, undefined);
  await access(payload.atlas.imagePath);
  await access(payload.atlas.dataPath);
  await access(payload.atlas.evidencePath);
  await access(payload.godot.descriptorPath);
  await access(payload.godot.importerPath);
  assert.ok(payload.godot.resourcePath.endsWith("hero.sprite_frames.tres"));
  assert.equal(payload.godot.headlessCommand[0], "godot");
});
